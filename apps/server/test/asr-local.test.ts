/**
 * Feature check for the in-process ASR: a macOS Tingting clip goes in as microphone PCM through the real gateway,
 * the local sherpa-onnx model recognizes it, the correction table runs, and the client sees partials and finals.
 * It also measures whether the gateway stays responsive while the decoder runs on the main thread.
 *
 * Needs macOS (say, afconvert), ffmpeg and the model: apps/server/scripts/voice-fetch-asr-model.sh.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { FakeSystemOne, FakeSystemTwo, SilentTts } from '../src/fakes/engines';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { LocalSherpaAsr } from '../src/voice/asr-local';
import { createAsrEngine, defaultAsrModelDir } from '../src/voice/index';
import { demoClip } from '../scripts/asr-fixtures';

const modelThere = existsSync(join(defaultAsrModelDir({}), 'tokens.txt'));
const skip = process.platform !== 'darwin' ? 'needs macOS say' : !modelThere ? 'run apps/server/scripts/voice-fetch-asr-model.sh first' : false;

/** AudioCapture sends 4096 samples (256 ms) per message. */
const CHUNK_BYTES = 4096 * 2;
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

test('mic audio is recognized by the local model with the default settings, corrected, and the gateway stays responsive', { skip, timeout: 90_000 }, async () => {
  const asr = createAsrEngine({});
  assert(asr instanceof LocalSherpaAsr, 'with no CUEX_ASR_URL the default model is used');
  assert.equal(asr.backend, 'sherpa-local');
  const loadStarted = performance.now();
  asr.warmup(); // the server does this at startup, so the first visitor does not pay for it
  const loadMs = Math.round(performance.now() - loadStarted);

  const gateway = new WebSocketGateway({
    port: 0, host: '127.0.0.1', pack: ANSHU_PACK,
    createEngines: () => ({ asr, system1: new FakeSystemOne(), system2: new FakeSystemTwo(35), tts: new SilentTts() }),
  });
  await gateway.start();
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);
  const events: Array<{ at: number; event: ServerMessage }> = [];
  ws.on('message', raw => events.push({ at: performance.now(), event: JSON.parse(raw.toString()) as ServerMessage }));
  const rep = () => events.flatMap(({ at, event }) => (event.type === 'asr.transcript' && event.payload.speaker === 'rep' ? [{ at, ...event.payload }] : []));
  const waitFor = async (ok: () => boolean, label: string, ms = 8000) => {
    for (let waited = 0; !ok(); waited += 20) {
      if (waited > ms) throw new Error(`Timed out waiting for ${label}. Events: ${events.map(e => e.event.type).join(', ')}`);
      await delay(20);
    }
  };

  const healthMs: number[] = [];
  const loop = monitorEventLoopDelay({ resolution: 10 });
  let probing = true;
  const prober = (async () => {
    while (probing) {
      const started = performance.now();
      const response = await fetch(`http://127.0.0.1:${gateway.port}/health`);
      await response.arrayBuffer();
      healthMs.push(performance.now() - started);
      await delay(50);
    }
  })();

  try {
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'session.start', payload: { scenarioId: ANSHU_PACK.scenario.id, mode: 'performance' } }));
    await waitFor(() => events.some(e => e.event.type === 'session.ready'), 'session.ready');

    const results: Array<{ line: string; heard: string; firstPartialMs: number; endpointDelayMs: number }> = [];
    loop.enable();
    for (const index of [4, 5]) { // 75岁以上...百分之十一 / eGFR 30到60的亚组...
      const clip = await demoClip(index);
      const finalsBefore = rep().filter(t => t.isFinal).length;
      const partialsBefore = rep().filter(t => !t.isFinal).length;
      const started = performance.now();
      for (let pos = 0; pos < clip.pcm.length + 32000 * 1.5; pos += CHUNK_BYTES) {
        const due = started + (pos + CHUNK_BYTES) / 32; // a chunk exists only after its 256 ms have been captured, like the browser's
        if (due > performance.now()) await delay(due - performance.now());
        const part = pos < clip.pcm.length ? clip.pcm.subarray(pos, pos + CHUNK_BYTES) : Buffer.alloc(CHUNK_BYTES); // then 1.5 s of silence
        const padded = part.length === CHUNK_BYTES ? part : Buffer.concat([part, Buffer.alloc(CHUNK_BYTES - part.length)]);
        ws.send(JSON.stringify({ type: 'audio.chunk', payload: { format: 'pcm16', sampleRate: 16000, channels: 1, data: padded.toString('base64'), timestamp: Date.now() } }));
      }
      await waitFor(() => rep().filter(t => t.isFinal).length > finalsBefore, `a final transcript for line ${index + 1}`);
      const firstPartial = rep().filter(t => !t.isFinal)[partialsBefore];
      const final = rep().filter(t => t.isFinal)[finalsBefore];
      assert(firstPartial, 'a partial reaches the client before the final');
      results.push({ line: clip.reference, heard: final.text, firstPartialMs: Math.round(firstPartial.at - started), endpointDelayMs: Math.round(final.at - (started + clip.durationMs)) });
    }
    loop.disable();

    assert.deepEqual(events.filter(e => e.event.type === 'session.error'), [], 'no session.error');
    assert.match(results[0].heard, /七十五岁以上/);
    assert.match(results[0].heard, /百分之十一/);
    assert.match(results[1].heard, /^eGFR 30到60的亚组/, 'the correction table turned the garbled eGFR into text System 1 understands');
    const resolved = new Set(events.flatMap(({ event }) => (event.type === 'system1.verdict' ? event.payload.resolvedPointIds ?? [] : [])));
    assert(resolved.has('c1') && resolved.has('c2'), `c1 and c2 resolve from real microphone audio, got ${[...resolved].join(',') || 'nothing'}`);

    probing = false;
    await prober;
    assert(healthMs.length > 20, `the /health probe ran ${healthMs.length} times while audio was decoding`);
    const maxHealth = Math.round(Math.max(...healthMs));
    assert(maxHealth < 400, `/health took ${maxHealth} ms while decoding`);
    console.log(JSON.stringify({
      flow: 'local-asr-gateway', backend: asr.backend, modelLoadMs: loadMs, chunkMs: 256,
      lines: results,
      healthDuringDecode: { probes: healthMs.length, p50Ms: Math.round(percentile(healthMs, 0.5)), p95Ms: Math.round(percentile(healthMs, 0.95)), maxMs: maxHealth },
      eventLoopDelayMs: { p99: Math.round(loop.percentile(99) / 1e6), max: Math.round(loop.max / 1e6) },
    }));
  } finally {
    probing = false;
    loop.disable();
    ws.terminate();
    await gateway.stop();
  }
});
