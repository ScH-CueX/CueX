import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import type { AsrEngine, TtsEngine } from '../src/contracts';
import { FakeSystemOne, FakeSystemTwo, SilentTts, TextOnlyAsr } from '../src/fakes/engines';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { createAsrEngine, createTtsEngine } from '../src/voice/index';
import { pcm16ToWav, sniffAudio } from '../src/voice/wav';

/** The two tests that call the real Microsoft Edge voice service need internet. Set CUEX_TEST_OFFLINE=1 to skip them. */
const online = process.env.CUEX_TEST_OFFLINE === '1' ? { skip: 'CUEX_TEST_OFFLINE=1' } : {};

test('http-only voice profile reports remote failure without switching providers', async () => {
  const server = createServer((_req, res) => res.writeHead(503).end());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const tts = createTtsEngine({ CUEX_TTS_BACKEND: 'http', CUEX_TTS_FALLBACK: 'none', CUEX_TTS_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/tts` });
    assert.equal(tts.backend, 'http-tts');
    await assert.rejects(async () => {
      for await (const _chunk of tts.synthesize('你好。', new AbortController().signal)) assert.fail('failed service must not produce audio');
    }, /TTS server answered 503/);
  } finally { server.close(); }
});

type Predicate = (event: ServerMessage) => boolean;

async function session(engines: { asr?: AsrEngine; tts?: TtsEngine }) {
  const gateway = new WebSocketGateway({
    port: 0,
    host: '127.0.0.1',
    pack: ANSHU_PACK,
    createEngines: () => ({ system1: new FakeSystemOne(), system2: new FakeSystemTwo(35), asr: engines.asr ?? new TextOnlyAsr(), tts: engines.tts ?? new SilentTts() }),
    controller: { debounceMs: 5, minDriftMs: 0, minDriftChars: 30, candidateHoldMs: 120, minInterruptGapMs: 0 },
  });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);
  const events: ServerMessage[] = [];
  const times: number[] = [];
  const waiters = new Set<{ predicate: Predicate; resolve: (event: ServerMessage) => void }>();
  ws.on('message', raw => {
    const event = JSON.parse(raw.toString()) as ServerMessage;
    events.push(event);
    times.push(Date.now());
    for (const waiter of waiters) if (waiter.predicate(event)) { waiters.delete(waiter); waiter.resolve(event); }
  });
  await once(ws, 'open');
  const waitFor = (predicate: Predicate, timeoutMs = 4000): Promise<ServerMessage> => {
    const existing = events.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (event: ServerMessage) => { clearTimeout(timer); resolve(event); } };
      const timer = setTimeout(() => { waiters.delete(waiter); reject(new Error(`Timed out. Events so far: ${events.map(e => e.type).join(', ')}`)); }, timeoutMs);
      waiters.add(waiter);
    });
  };
  const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, payload }));
  const startedAt = Date.now();
  send('session.start', { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' });
  await waitFor(e => e.type === 'session.ready');
  return {
    gateway, events, times, startedAt, waitFor, send,
    async close() {
      ws.close();
      await gateway.stop();
      (engines.tts as { close?: () => void } | undefined)?.close?.();
    },
  };
}

const chunks = (events: ServerMessage[]) => events.flatMap(e => (e.type === 'tts.stream_chunk' && !e.payload.isLastChunk ? [e.payload] : []));
const readBody = async (req: IncomingMessage) => { const parts: Buffer[] = []; for await (const part of req) parts.push(part as Buffer); return Buffer.concat(parts).toString(); };

/** True when ffmpeg is installed and decodes the chunk on its own, like decodeAudioData does. Undefined when ffmpeg is missing. */
function decodes(audio: Buffer): boolean | undefined {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'null', '-'], { input: audio });
  return result.error ? undefined : result.status === 0;
}

test('rep speaks into the mic: PCM goes to a remote sherpa-onnx ASR server and comes back as partial and final sentences', async () => {
  // A stand-in for `streaming_server.py` (Python) and `sherpa-onnx-online-websocket-server` (C++). Both speak this protocol.
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(wss, 'listening');
  const frames: Float32Array[] = [];
  const control: string[] = [];
  const replies: object[] = [
    { text: '七十五岁以上', segment: 0 },
    { text: '七十五岁以上患者约占百分之十一', segment: 0 },
    { text: '', segment: 1 }, // the Python server: first result after an endpoint is empty and has the next segment number
    { text: '降压幅度', segment: 1 },
    { text: '降压幅度与总体一致', segment: 1, is_final: true }, // the C++ server marks the endpoint itself
  ];
  wss.on('connection', socket => {
    let count = 0;
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        frames.push(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
        const reply = replies[count++];
        if (reply) socket.send(JSON.stringify(reply));
      } else {
        control.push(data.toString());
        socket.close();
      }
    });
  });
  const asr = createAsrEngine({ CUEX_ASR_URL: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}` });
  const h = await session({ asr });
  try {
    const tone = Buffer.alloc(4096 * 2); // 256 ms of a 440 Hz tone, the size AudioCapture sends
    for (let i = 0; i < 4096; i++) tone.writeInt16LE(Math.round(8192 * Math.sin((2 * Math.PI * 440 * i) / 16000)), i * 2);
    for (let i = 0; i < replies.length; i++) {
      h.send('audio.chunk', { format: 'pcm16', sampleRate: 16000, channels: 1, data: tone.toString('base64'), timestamp: Date.now() });
      await delay(30);
    }
    await h.waitFor(e => e.type === 'asr.transcript' && e.payload.speaker === 'rep' && e.payload.isFinal && e.payload.text.endsWith('一致'));

    const rep = h.events.flatMap(e => (e.type === 'asr.transcript' && e.payload.speaker === 'rep' ? [[e.payload.text, e.payload.isFinal]] : []));
    assert.deepEqual(rep, [
      ['七十五岁以上', false],
      ['七十五岁以上患者约占百分之十一', false],
      ['七十五岁以上患者约占百分之十一', true],
      ['降压幅度', false],
      ['降压幅度与总体一致', true],
    ]);
    assert.equal(frames.length, replies.length);
    assert.equal(frames[0].length, 4096, 'one float32 sample per PCM16 sample');
    assert(Math.abs(Math.max(...frames[0].map(Math.abs)) - 0.25) < 0.01, 'samples are scaled to [-1, 1]');

    h.send('session.stop', { sessionId: 'current' });
    for (let waited = 0; !control.length && waited < 2000; waited += 20) await delay(20);
    assert.deepEqual(control, ['Done'], 'stopping the session tells the server the audio has ended');
  } finally {
    await h.close();
    wss.close();
  }
});

test('doctor opening is spoken as self-contained WAV chunks from a remote TTS server, in script order', async () => {
  const spoken: string[] = [];
  const server = createServer(async (req, res) => {
    spoken.push((JSON.parse(await readBody(req)) as { text: string }).text);
    const wav = pcm16ToWav(Buffer.alloc(9600), 16000);
    wav.writeUInt32LE(0xffffffff, 4); // a streaming server does not know the length yet
    wav.writeUInt32LE(0xffffffff, 40);
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(wav);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const tts = createTtsEngine({ CUEX_TTS_BACKEND: 'http', CUEX_TTS_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/tts` });
  const h = await session({ tts });
  try {
    await h.waitFor(e => e.type === 'tts.stream_chunk' && e.payload.isLastChunk);
    const sent = chunks(h.events);
    assert.deepEqual(sent.map(c => c.chunkIndex), sent.map((_, i) => i));
    assert.equal(sent.length, spoken.length, 'one audio file per clause');
    const spokenOpening = spoken.join('');
    assert(spokenOpening.length > 10, 'the doctor says a real opening line, not an empty one');
    for (const chunk of sent) {
      const wav = Buffer.from(chunk.audioBase64, 'base64');
      assert.equal(sniffAudio(wav), 'audio/wav');
      assert.equal(wav.readUInt32LE(4), wav.length - 8, 'RIFF size is real, so decodeAudioData accepts it');
      assert.equal(wav.readUInt32LE(40), wav.length - 44, 'data size is real');
    }
    const history = h.gateway.inspectSessions()[0].history;
    assert.deepEqual(history.filter(t => t.who === 'doctor').map(t => t.text), [spokenOpening], 'history holds exactly what was sent to the TTS server');
  } finally {
    await h.close();
    server.close();
  }
});

test('real Edge voice speaks the opening as playable MP3 and is cut off cleanly when the rep starts talking', online, async () => {
  const tts = createTtsEngine({});
  const h = await session({ tts });
  try {
    const first = await h.waitFor(e => e.type === 'tts.stream_chunk', 8000);
    assert(first.type === 'tts.stream_chunk');
    const firstChunkMs = h.times[h.events.indexOf(first)] - h.startedAt;
    const mp3 = Buffer.from(first.payload.audioBase64, 'base64');
    assert.equal(sniffAudio(mp3), 'audio/mpeg');
    assert.notEqual(decodes(mp3), false, 'ffmpeg must be able to decode the chunk on its own');
    console.log(JSON.stringify({ flow: 'edge-opening', backend: tts.backend, firstChunkMs, firstChunkBytes: mp3.length, decodedByFfmpeg: decodes(mp3) ?? 'ffmpeg not installed' }));
    assert(firstChunkMs < 6000, `first audio took ${firstChunkMs} ms`);

    h.send('speech.delta', { text: '您好陈主任，我先回答您的问题', isFinal: false });
    const abort = await h.waitFor(e => e.type === 'tts.abort');
    assert(abort.type === 'tts.abort');
    assert.equal(abort.payload.reason, 'user_interrupted');
    const abortIndex = h.events.indexOf(abort);
    await delay(1500);
    assert(!h.events.slice(abortIndex + 1).some(e => e.type === 'tts.stream_chunk' && e.payload.utteranceId === abort.payload.utteranceId), 'no audio after the cut-off');
  } finally {
    await h.close();
  }
});

test('the doctor keeps talking when the primary TTS server is down: Edge takes over', online, async () => {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const deadPort = (probe.address() as AddressInfo).port;
  probe.close();
  await once(probe, 'close');
  const tts = createTtsEngine({ CUEX_TTS_BACKEND: 'http', CUEX_TTS_URL: `http://127.0.0.1:${deadPort}/tts` });
  assert.equal(tts.backend, 'http-tts>edge-tts');
  const h = await session({ tts });
  try {
    const first = await h.waitFor(e => e.type === 'tts.stream_chunk', 8000);
    assert(first.type === 'tts.stream_chunk');
    assert.equal(sniffAudio(Buffer.from(first.payload.audioBase64, 'base64')), 'audio/mpeg');
    console.log(JSON.stringify({ flow: 'tts-fallback', firstChunkMs: h.times[h.events.indexOf(first)] - h.startedAt }));
  } finally {
    await h.close();
  }
});
