/**
 * Time to first audio for the configured TTS engine, including after idle gaps.
 *   tsx scripts/voice-bench.ts [idleSeconds...]        e.g. tsx scripts/voice-bench.ts 20 45 75
 * Reads the same CUEX_* variables as the server (CUEX_TTS_BACKEND, CUEX_EDGE_VOICE, CUEX_TTS_URL, ...).
 */
import { createTtsEngine } from '../src/voice/index';

const idle = process.argv.slice(2).map(Number).filter(Number.isFinite);
const tts = createTtsEngine();
const lines = ['我先问一句，它适用于哪些患者？', '那 eGFR 低于 30 的患者呢？这部分能用吗？', '先停一下。高龄和肾功能不好的患者，研究结论适用吗？'];

async function once(label: string, text: string): Promise<void> {
  const started = performance.now();
  for await (const chunk of tts.synthesize(text, new AbortController().signal)) {
    console.log(`${label.padEnd(16)} ${Math.round(performance.now() - started)} ms  ${chunk.mimeType}  ${chunk.audio.length} bytes`);
  }
}

console.log(`backend ${tts.backend}`);
await once('cold', lines[0]);
for (const [i, text] of lines.slice(1).entries()) await once(`warm ${i + 1}`, text);
for (const seconds of idle) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  await once(`after ${seconds}s idle`, lines[0]);
}
(tts as { close?: () => void }).close?.();
