// Builds placeholder audio for the CueX promo.
// Dialogue uses the macOS `say` voices listed in src/content/dialogue.json.
// Music and sound effects are synthesized with ffmpeg.
// Replace the files in public/assets/audio and re-run this script's timing step when real audio is ready.
// --no-voice keeps the committed voice files (they need macOS `say`) and rebuilds only music and sound effects.
// --timing-only rebuilds nothing and only rewrites src/content/dialogue-timing.json.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = join(root, '..', 'assets/audio');
const voiceDir = join(audioDir, 'voiceover');
const musicDir = join(audioDir, 'music');
const sfxDir = join(audioDir, 'sfx');
const tmpDir = join(root, 'out/.tmp-audio');
const timingOnly = process.argv.includes('--timing-only');
const noVoice = process.argv.includes('--no-voice');

for (const dir of [voiceDir, musicDir, sfxDir, tmpDir]) {
  mkdirSync(dir, {recursive: true});
}

const run = (cmd, args) => execFileSync(cmd, args, {stdio: ['ignore', 'pipe', 'pipe']}).toString();
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const duration = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

const dialogue = JSON.parse(readFileSync(join(root, 'src/content/dialogue.json'), 'utf8'));

// Trim leading and trailing silence so caption timing starts on the first syllable.
const trimSilence =
  'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';

if (!timingOnly && !noVoice) {
  for (const line of dialogue.lines) {
    const voice = dialogue.voices[line.speaker];
    const aiff = join(tmpDir, `${line.id}.aiff`);
    run('say', ['-v', voice.placeholderVoice, '-r', String(voice.rate), '-o', aiff, line.text]);
    ffmpeg(['-i', aiff, '-af', `${trimSilence},loudnorm=I=-18:TP=-2`, '-ar', '48000', '-ac', '1', join(voiceDir, `${line.id}.wav`)]);
  }
}

if (!timingOnly) {
  // Music bed: low drone with slow movement, 92 seconds so it covers the full cut.
  ffmpeg([
    '-f', 'lavfi', '-i', 'sine=f=55:d=92',
    '-f', 'lavfi', '-i', 'sine=f=82.41:d=92',
    '-f', 'lavfi', '-i', 'sine=f=110.3:d=92',
    '-f', 'lavfi', '-i', 'sine=f=164.8:d=92',
    '-f', 'lavfi', '-i', 'anoisesrc=d=92:c=pink:a=0.05',
    '-filter_complex',
    '[0]volume=0.9[a0];[1]volume=0.55,tremolo=f=0.11:d=0.6[a1];[2]volume=0.35,tremolo=f=0.1:d=0.7[a2];' +
      '[3]volume=0.18,tremolo=f=0.23:d=0.8[a3];[4]lowpass=f=700,volume=0.6[a4];' +
      '[a0][a1][a2][a3][a4]amix=inputs=5:normalize=0,lowpass=f=1400,' +
      'aecho=0.8:0.6:900|1700:0.35|0.25,afade=t=in:d=4,afade=t=out:st=87:d=5,loudnorm=I=-24:TP=-3',
    '-ar', '48000', '-ac', '2', join(musicDir, 'bed.wav'),
  ]);

  const sfx = {
    tick: ['-f', 'lavfi', '-i', 'sine=f=2600:d=0.05', '-af', 'afade=t=out:st=0.004:d=0.045,volume=0.5'],
    press: ['-f', 'lavfi', '-i', 'sine=f=740:d=0.12', '-af', 'afade=t=out:st=0.01:d=0.11,volume=0.8'],
    whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=1.4:c=pink:a=0.6', '-af', 'highpass=f=400,lowpass=f=5000,afade=t=in:d=0.9,afade=t=out:st=0.9:d=0.5'],
    cut: [
      '-f', 'lavfi', '-i', 'sine=f=85:d=0.5',
      '-f', 'lavfi', '-i', 'anoisesrc=d=0.08:c=white:a=0.5',
      '-filter_complex', '[0]afade=t=out:st=0.02:d=0.45[a];[1]highpass=f=2000,afade=t=out:d=0.08[b];[a][b]amix=inputs=2:normalize=0',
    ],
    dissolve: [
      '-f', 'lavfi', '-i', 'sine=f=1568:d=2.2',
      '-f', 'lavfi', '-i', 'sine=f=2093:d=2.2',
      '-f', 'lavfi', '-i', 'sine=f=2637:d=2.2',
      '-filter_complex',
      '[0]tremolo=f=9:d=0.7[a];[1]tremolo=f=13:d=0.7[b];[2]tremolo=f=17:d=0.8[c];' +
        '[a][b][c]amix=inputs=3:normalize=0,volume=0.25,afade=t=in:d=0.15,afade=t=out:st=0.2:d=2,aecho=0.8:0.7:120|260:0.4|0.3',
    ],
    impact: [
      '-f', 'lavfi', '-i', 'sine=f=42:d=3',
      '-f', 'lavfi', '-i', 'anoisesrc=d=1.5:c=brown:a=0.7',
      '-filter_complex', '[0]afade=t=out:st=0.05:d=2.9[a];[1]lowpass=f=300,afade=t=out:d=1.5[b];[a][b]amix=inputs=2:normalize=0,aecho=0.8:0.5:400:0.3',
    ],
    rewind: ['-f', 'lavfi', '-i', 'anoisesrc=d=1.3:c=white:a=0.4', '-af', 'highpass=f=1200,tremolo=f=22:d=0.9,afade=t=in:d=0.2,afade=t=out:st=0.9:d=0.4'],
  };
  for (const [name, args] of Object.entries(sfx)) {
    ffmpeg([...args, '-ar', '48000', '-ac', '2', join(sfxDir, `${name}.wav`)]);
  }
}

const timing = {};
for (const line of dialogue.lines) {
  const file = join(voiceDir, `${line.id}.wav`);
  if (!existsSync(file)) {
    throw new Error(`Missing voice file: ${file}`);
  }
  timing[line.id] = Math.round(duration(file) * 1000) / 1000;
}
writeFileSync(join(root, 'src/content/dialogue-timing.json'), JSON.stringify(timing, null, 2) + '\n');
rmSync(tmpDir, {recursive: true, force: true});
console.log(JSON.stringify(timing, null, 2));
