/** Shared fixtures for the opt-in Windows ASR benchmark and gateway feature test. No models are stored locally. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const DEMO_LINES = [
  '陈主任，我先回答您的人群问题。',
  '这项研究入组的是18到80岁的原发性高血压患者。',
  '主要终点是12周时的诊室收缩压。',
  '安舒平组比对照组多降了6.2毫米汞柱。',
  '75岁以上的患者约占百分之十一。',
  'eGFR 30到60的亚组有412人，降压幅度和总体一致。',
  'eGFR低于30的患者被排除在研究之外。',
  '这部分目前没有证据，说明书也不建议使用。',
];

/** Spoken-form references keep medical Latin terms intact and spell Chinese numbers as heard. */
export const SPOKEN_REFERENCES = [
  "陈主任我先回答您的人群问题",
  "这项研究入组的是十八到八十岁的原发性高血压患者",
  "主要终点是十二周时的诊室收缩压",
  "安舒平组比对照组多降了六点二毫米汞柱",
  "七十五岁以上的患者约占百分之十一",
  "eGFR三十到六十的亚组有四百一十二人降压幅度和总体一致",
  "eGFR低于三十的患者被排除在研究之外",
  "这部分目前没有证据说明书也不建议使用"
];

export interface DemoClip { reference: string; wavPath: string; pcm: Buffer; durationMs: number }

/** macOS Tingting is the fixed test speaker; afconvert produces 16 kHz mono PCM16 WAV. */
export async function demoClip(index: number, directory = join(tmpdir(), 'cuex-asr-clips')): Promise<DemoClip> {
  await mkdir(directory, { recursive: true });
  const reference = DEMO_LINES[index];
  const hash = createHash('sha256').update('Tingting/16000/mono/pcm16/' + reference).digest('hex').slice(0, 12);
  const aiff = join(directory, `${index + 1}-${hash}.aiff`);
  const wavPath = join(directory, `${index + 1}-${hash}.wav`);
  try { await readFile(wavPath); } catch {
    await run('/usr/bin/say', ['-v', 'Tingting', '-o', aiff, reference]);
    await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wavPath]);
  }
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', wavPath, '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
  // Remove only leading/trailing quiet, preserving every pause inside the utterance.
  const pcm = Buffer.from(stdout);
  let first = 0, last = pcm.length;
  while (first + 2 < last && Math.abs(pcm.readInt16LE(first)) < 150) first += 2;
  while (last > first + 2 && Math.abs(pcm.readInt16LE(last - 2)) < 150) last -= 2;
  const trimmed = pcm.subarray(Math.max(0, first - 960), Math.min(pcm.length, last + 960));
  return { reference, wavPath, pcm: trimmed, durationMs: trimmed.length / 32 };
}

/** Real-time 100 ms frames followed by silence. Stop never substitutes for an ASR endpoint. */
export async function streamClip(pcm: Buffer, write: (frame: Buffer) => void, trailingSilenceMs = 3000): Promise<void> {
  const audio = Buffer.concat([pcm, Buffer.alloc(Math.ceil(trailingSilenceMs * 32 / 2) * 2)]);
  const started = performance.now();
  for (let pos = 0; pos < audio.length; pos += 3200) {
    const due = started + pos / 32;
    if (due > performance.now()) await delay(due - performance.now());
    write(audio.subarray(pos, Math.min(audio.length, pos + 3200)));
  }
}

/** Literal CER ignores case, punctuation and whitespace; it does not rewrite numbers or medical terms. */
export const normalizeText = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
