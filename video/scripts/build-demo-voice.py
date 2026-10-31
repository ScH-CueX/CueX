"""Build every narration clip with the Windows Ming service, never a fallback voice."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/audio/narration'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('CUEX_TTS_URL', 'http://127.0.0.1:18766/tts')
COPY = (ROOT / 'video/src/content/demo45.ts').read_text()
TEXTS = {row[0]: row[4] for row in re.findall(r"id:'(\w+)', from:(\d+), duration:(\d+), title:'([^']*)', voice:'([^']*)'", COPY)}
TIMELINE = (ROOT / 'video/src/cinema/Cinematic45.tsx').read_text()
SHOTS = re.findall(r"id:'(\w+)',from:(\d+),duration:(\d+),label:'[^']*',voice:'(\w+)'", TIMELINE)
manifest = []
staging = tempfile.TemporaryDirectory(prefix='cuex-ming-voice-')
for shot, start, frames, sid in SHOTS:
    text = TEXTS[sid]
    request = urllib.request.Request(URL, data=json.dumps({'text': text, 'voice': 'narrator'}, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response:
        model = response.headers.get('X-TTS-Model')
        if model != 'Ming-3.0-tts-0.5b':
            raise RuntimeError(f'Refusing narration from unexpected model: {model}')
        data = response.read(30 * 1024 * 1024 + 1)
        synthesis_ms = response.headers.get('X-Synthesis-Ms')
    if len(data) > 30 * 1024 * 1024 or data[:4] != b'RIFF':
        raise RuntimeError('Remote service did not return a bounded WAV')
    raw = OUT / f'{sid}-ming-source.wav'
    raw.write_bytes(data)
    duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(raw)], text=True).strip())
    window = int(frames) / 30 - .55
    speed = max(1.0, duration / window)
    if speed > 1.12:
        raise RuntimeError(f'{sid}: {duration:.2f}s does not fit {window:.2f}s. Shorten the line before rendering.')
    target = Path(staging.name) / f'{sid}.wav'
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af',f'atempo={speed:.5f},loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.02,afade=t=out:st={max(0,duration/speed-.06):.3f}:d=0.06','-ar','48000','-ac','1',str(target)], check=True)
    manifest.append({'id':sid,'shot':shot,'model':model,'voice':'Ming built-in 灵小柔','text':text,'fromFrame':int(start)+8,'shotFrames':int(frames),'sourceDuration':duration,'synthesisMs':synthesis_ms,'speed':speed,'file':f'audio/narration/{sid}.wav','sourceFile':raw.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'source':'Windows GPU service over the authorized SSH command bridge; synthetic narration'})
    print(sid, round(duration,2), 'seconds', 'synthesis', synthesis_ms, 'ms', flush=True)
for clip in manifest:
    shutil.copy2(Path(staging.name) / Path(clip['file']).name, OUT / Path(clip['file']).name)
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
staging.cleanup()
