import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketGateway } from '../../server/src/gateway/WebSocketGateway';
import { FakeSystemOne, FakeSystemTwo, SilentTts } from '../../server/src/fakes/engines';
import { ANSHU_PACK } from '../../server/src/scenario/anshu';
import type { AsrEngine, TtsEngine } from '../../server/src/contracts';

let chunks = 0;
let bytes = 0;
let audioFormat = 0;
let longAudio = process.env.CUEX_WEB_LONG_TTS === '1';
let abortWithAsr: (() => void) | undefined;
const pcmAsr: AsrEngine = {
  backend: 'browser-feature-asr',
  async open(options, callbacks) {
    audioFormat = options.sampleRate;
    abortWithAsr = () => callbacks.onFinal('我先回答您的人群问题。');
    let sent = false;
    return {
      write(pcm) {
        chunks++; bytes += pcm.length;
        if (!sent && !longAudio && chunks >= 4) {
          sent = true;
          callbacks.onPartial('75 岁以上患者约占 11%，');
          callbacks.onFinal('75 岁以上患者约占 11%，降压幅度与总体一致。');
        }
      },
      end() {},
    };
  },
};
function wav(seconds: number) {
  const audio = Buffer.alloc(44 + 32000 * seconds);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  for (let index = 0; index < 16000 * seconds; index++) audio.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 220 / 16000) * 1000), 44 + index * 2);
  return audio;
}
const longTts: TtsEngine = {
  backend: 'browser-feature-tts',
  async *synthesize(_text, signal) {
    yield { audio: wav(3), mimeType: 'audio/wav' };
    await delay(800, undefined, { signal });
  },
};
const gateway = new WebSocketGateway({
  port: 0, host: '127.0.0.1', pack: ANSHU_PACK,
  createEngines: async () => {
    if (process.env.CUEX_WEB_REAL === '1') {
      const { createEngines, readConfig } = await import('../../server/src/config');
      const engines = await createEngines({ ...readConfig(), system1: 'real', system2: 'real', asr: 'fake', tts: 'real' }, ANSHU_PACK);
      return { ...engines, asr: pcmAsr };
    }
    return { system1: new FakeSystemOne(), system2: new FakeSystemTwo(250), asr: pcmAsr, tts: longAudio ? longTts : new SilentTts() };
  },
  controller: { debounceMs: 60, minDriftMs: 350, minDriftChars: 20, candidateHoldMs: 1600, minInterruptGapMs: 250 },
});
await gateway.start();
const control = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/long-audio') { longAudio = true; res.end('{}'); }
  else if (req.url === '/short-audio') { longAudio = false; res.end('{}'); }
  else if (req.url === '/abort') { abortWithAsr?.(); res.end('{}'); }
  else if (req.url === '/metrics') res.end(JSON.stringify({ chunks, bytes, audioFormat, sessions: gateway.inspectSessions() }));
  else { res.statusCode = 404; res.end('{}'); }
});
await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve));
console.log(JSON.stringify({ ready: true, port: gateway.port, metricsPort: (control.address() as import('node:net').AddressInfo).port }));
const stop = async () => { await gateway.stop(); control.close(); };
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
