/**
 * Audition Edge voices for the doctor. Writes MP3 files to a folder (outside the repo) and prints pace and first-audio time.
 *   tsx scripts/voice-samples.ts [outDir]
 * Listen to the files, then set CUEX_EDGE_VOICE, CUEX_EDGE_RATE and CUEX_EDGE_PITCH.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EdgeTts } from '../src/voice/tts-edge';

const outDir = process.argv[2] ?? '/tmp/cuex-voice-samples';
mkdirSync(outDir, { recursive: true });

const lines = [
  '你说这个研究结果不错。我先问一句：它适用于哪些患者？',
  '先停一下。高龄和肾功能不好的患者，研究结论适用吗？',
  '那 eGFR 低于 30 的患者呢？这部分能用吗？',
];
const candidates = [
  { name: 'yunyang', voice: 'zh-CN-YunyangNeural', rate: '+0%', pitch: '+0Hz' },
  { name: 'yunyang-brisk', voice: 'zh-CN-YunyangNeural', rate: '+8%', pitch: '+0Hz' },
  { name: 'yunjian', voice: 'zh-CN-YunjianNeural', rate: '+0%', pitch: '+0Hz' },
  { name: 'yunxi', voice: 'zh-CN-YunxiNeural', rate: '+0%', pitch: '+0Hz' },
];

function seconds(file: string): number | undefined {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const value = Number.parseFloat(probe.stdout);
  return Number.isFinite(value) ? value : undefined;
}

for (const candidate of candidates) {
  const tts = new EdgeTts({ voice: candidate.voice, rate: candidate.rate, pitch: candidate.pitch, timeoutMs: 8000 });
  await tts.warmup();
  for (const [index, text] of lines.entries()) {
    const started = performance.now();
    for await (const chunk of tts.synthesize(text, new AbortController().signal)) {
      const firstMs = Math.round(performance.now() - started);
      const file = join(outDir, `${candidate.name}-${index + 1}.mp3`);
      writeFileSync(file, chunk.audio);
      const length = seconds(file);
      const pace = length ? (text.replace(/[\s，。？！：]/g, '').length / length).toFixed(2) : '?';
      console.log(`${candidate.name.padEnd(14)} line ${index + 1}  first audio ${String(firstMs).padStart(4)} ms  ${length?.toFixed(2) ?? '?'} s  ${pace} chars/s`);
    }
  }
  tts.close();
}
console.log(`files in ${outDir}`);
