/** Opt-in end-to-end microphone path against the Windows ASR server. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { FakeSystemOne, FakeSystemTwo, SilentTts } from '../src/fakes/engines';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { createAsrEngine } from '../src/voice/index';
import { demoClip, normalizeText, streamClip } from '../scripts/asr-fixtures';

test('microphone PCM reaches remote ASR through the real gateway and returns a final rep transcript', { skip: !process.env.CUEX_ASR_URL, timeout: 30000 }, async () => {
  const clip = await demoClip(4);
  const asr = createAsrEngine({ ...process.env, CUEX_ASR: 'real' });
  assert.equal(asr.backend, 'sherpa-ws');
  const gateway = new WebSocketGateway({
    host: '127.0.0.1', port: 0, pack: ANSHU_PACK,
    createEngines: () => ({ asr, system1: new FakeSystemOne(), system2: new FakeSystemTwo(1), tts: new SilentTts() }),
  });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);
  const events: ServerMessage[] = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString()) as ServerMessage));
  try {
    await once(ws, 'open');
    const ready = once(ws, 'message', { signal: AbortSignal.timeout(4000) });
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    await ready;
    assert(events.some(event => event.type === 'session.ready'));
    await streamClip(clip.pcm, frame => ws.send(JSON.stringify({ type: 'audio.chunk', payload: { format: 'pcm16', sampleRate: 16000, channels: 1, data: frame.toString('base64'), timestamp: Date.now() } })));
    const errors = events.filter(event => event.type === 'session.error');
    assert.deepEqual(errors, []);
    const transcripts = events.flatMap(event => event.type === 'asr.transcript' && event.payload.speaker === 'rep' ? [event.payload] : []);
    assert(transcripts.some(event => !event.isFinal), 'a partial transcript reaches the browser before the final');
    const final = transcripts.filter(event => event.isFinal).map(event => event.text).join('');
    assert.match(normalizeText(final), /(?:75|七十五)岁以上/);
    assert.match(normalizeText(final), /(?:11|十一)/);
    assert(final.includes('患者'), 'the final text includes the clinical population');
    console.log(JSON.stringify({ flow: 'remote-asr-gateway', backend: asr.backend, final, partials: transcripts.filter(event => !event.isFinal).length }));
  } finally {
    ws.terminate();
    await gateway.stop();
  }
});
