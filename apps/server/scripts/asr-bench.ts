/**
 * Benchmark the existing real ASR engine over the shared SSH tunnel.
 * CUEX_ASR=real CUEX_ASR_URL=ws://127.0.0.1:6006 npx tsx scripts/asr-bench.ts [model-label] [output.json]
 * Requires macOS say -v Tingting, afconvert, and ffmpeg. Audio stays under /tmp/cuex-asr-clips.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { distance } from 'fastest-levenshtein';
import { WebSocket } from 'ws';
import { createAsrEngine } from '../src/voice/index';
import { DEMO_LINES, SPOKEN_REFERENCES, demoClip, normalizeText, streamClip } from './asr-fixtures';

const url = process.env.CUEX_ASR_URL;
assert(url, 'Set CUEX_ASR_URL to the forwarded Windows ASR endpoint');
const asr = createAsrEngine({ ...process.env, CUEX_ASR: 'real', CUEX_ASR_URL: url });
const label = process.argv[2] ?? 'remote';
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2, p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)], max: sorted.at(-1) };
};

const socket = new WebSocket(url, { handshakeTimeout: 10000, perMessageDeflate: false });
const rtts: number[] = [];
try {
  await once(socket, 'open');
  for (let i = 0; i < 8; i++) {
    const started = performance.now();
    const pong = once(socket, 'pong', { signal: AbortSignal.timeout(5000) });
    socket.ping(String(i));
    await pong;
    rtts.push(Math.round(performance.now() - started));
  }
} finally { socket.terminate(); }

const rows = [];
for (let i = 0; i < DEMO_LINES.length; i++) {
  const clip = await demoClip(i);
  let started = 0;
  let firstPartialMs: number | undefined;
  let lastFinalAt: number | undefined;
  const finals: string[] = [];
  const errors: string[] = [];
  const stream = await asr.open({ sampleRate: 16000 }, {
    onPartial(text) { if (text && firstPartialMs === undefined) firstPartialMs = Math.round(performance.now() - started); },
    onFinal(text) { if (text) { finals.push(text); lastFinalAt = performance.now(); } },
    onError(error) { errors.push(error.message); },
  });
  try {
    started = performance.now();
    await streamClip(clip.pcm, frame => stream.write(frame));
    assert.equal(errors.length, 0, errors.join('; '));
    assert(finals.length > 0, 'No endpoint final received for clip ' + (i + 1));
    const recognized = finals.join('');
    const reference = normalizeText(clip.reference);
    const edits = distance(reference, normalizeText(recognized));
    const spokenReference = normalizeText(SPOKEN_REFERENCES[i]);
    const spokenEdits = distance(spokenReference, normalizeText(recognized));
    const row = { clip: i + 1, reference: clip.reference, spokenReference: SPOKEN_REFERENCES[i], recognized, characters: reference.length, edits, cer: edits / reference.length, spokenCharacters: spokenReference.length, spokenEdits, spokenCer: spokenEdits / spokenReference.length, durationMs: Math.round(clip.durationMs), firstPartialMs, endpointDelayMs: Math.round(lastFinalAt! - started - clip.durationMs) };
    rows.push(row);
    console.log(JSON.stringify(row));
  } finally { stream.end(); }
}
const characters = rows.reduce((n, row) => n + row.characters, 0);
const edits = rows.reduce((n, row) => n + row.edits, 0);
const spokenCharacters = rows.reduce((n, row) => n + row.spokenCharacters, 0);
const spokenEdits = rows.reduce((n, row) => n + row.spokenEdits, 0);
const report = { spokenCharacters, spokenEdits, spokenCer: spokenEdits / spokenCharacters, model: label, backend: asr.backend, at: new Date().toISOString(), speaker: 'macOS say Tingting', sampleRate: 16000, frameMs: 100, endpointSilenceSec: .7, normalization: 'NFKC, lower case, remove punctuation/space/symbols; preserve written numbers and terms', clips: rows.length, characters, edits, cer: edits / characters, firstPartialMs: summary(rows.map(row => row.firstPartialMs!)), endpointDelayMs: summary(rows.map(row => row.endpointDelayMs)), rttMs: summary(rtts), rows };
console.log(JSON.stringify(report, null, 2));
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
