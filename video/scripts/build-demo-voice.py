"""Synthesize the public demo narration; EDGE_TTS_PYTHON can select a venv.

Run using Python with edge-tts installed. Voice files are source media in root
assets/audio/narration; ffmpeg normalizes independently measured shot audio.
"""
import asyncio
import hashlib
import json
from pathlib import Path
import re
import subprocess
import edge_tts

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/audio/narration'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = (ROOT / 'video/src/content/demo45.ts').read_text()
SHOTS = re.findall(r"id:'(\w+)', from:(\d+), duration:(\d+), title:'([^']*)', voice:'([^']*)'", SOURCE)
VOICE = 'zh-CN-XiaoxiaoNeural'

async def main():
    manifest=[]
    for sid, start, frames, title, text in SHOTS:
        raw=OUT / f'{sid}-source.mp3'
        if not raw.exists() or raw.stat().st_size < 100:
            await edge_tts.Communicate(text, VOICE, rate='+5%').save(str(raw))
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(raw)],text=True).strip())
        window=int(frames)/30-0.55
        speed=max(1.0,duration/window)
        target=OUT/f'{sid}.wav'
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af',f'atempo={speed:.5f},loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.02,afade=t=out:st={max(0,duration/speed-0.06):.3f}:d=0.06','-ar','48000','-ac','1',str(target)],check=True)
        manifest.append(dict(id=sid,voice=VOICE,text=text,fromFrame=int(start)+8,shotFrames=int(frames),sourceDuration=duration,speed=speed,file=f'audio/narration/{sid}.wav',sha256=hashlib.sha256(target.read_bytes()).hexdigest(),source='Microsoft Edge online speech synthesis via edge-tts; synthetic narration, not live participant audio'))
        print(sid,round(duration,2),'speed',round(speed,3),flush=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

asyncio.run(main())
