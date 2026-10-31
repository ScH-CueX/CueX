"""CueX's loopback-only Ming GPU voice service.

Preserves the existing remote voice contract: POST /tts {text} returns one WAV.
GPU jobs are serialized as in voice-tts-server.ts. Disconnected requests are
discarded; completed audio is never replayed after a client abort.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import io
import logging
import os
from pathlib import Path
import sys
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

ROOT = Path(os.environ.get('CUEX_TTS_ROOT', r'E:\CueX-TTS'))
REPO = ROOT / 'Ming-3.0-tts'
CHECKPOINT = ROOT / 'models' / 'Ming-3.0-tts-0.5b'
VOICES = {'doctor': '灵楷', 'narrator': '灵小柔'}
log = logging.getLogger('cuex.tts')
model = None
gpu_lock = asyncio.Lock()


def infer(text: str, voice: str) -> tuple[bytes, float]:
    import soundfile as sf
    import torch
    torch.manual_seed(1234)
    start = time.perf_counter()
    waveform = model.synthesize(
        task='IP', text=text.replace('CueX', 'Cue X'), language_id='Chinese',
        controls={'ip': VOICES[voice]}, use_zero_spk_emb=True,
        max_length=48, max_decode_steps=600, trim_silence=True,
    )
    samples = waveform.detach().float().cpu().numpy().reshape(-1)
    output = io.BytesIO()
    sf.write(output, samples, model.sample_rate, format='WAV', subtype='PCM_16')
    elapsed = time.perf_counter() - start
    log.info('voice=%s chars=%d seconds=%.3f audio=%.3f', voice, len(text), elapsed, len(samples) / model.sample_rate)
    return output.getvalue(), elapsed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global model
    sys.path.insert(0, str(REPO))
    import torch
    from ming_tts import MingTTS
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is required; CPU fallback is disabled for this deployment')
    torch.set_num_threads(4)
    model = MingTTS(str(CHECKPOINT), device='cuda:0', text_normalization=False)
    await asyncio.to_thread(infer, '你好，我们开始这次训练。', 'doctor')
    log.info('ready: %s / %s', torch.cuda.get_device_name(0), torch.__version__)
    yield
    model = None
    torch.cuda.empty_cache()


app = FastAPI(lifespan=lifespan)


class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    voice: Literal['doctor', 'narrator'] = 'doctor'


@app.get('/health')
async def health():
    import torch
    return {'ok': model is not None, 'model': 'Ming-3.0-tts-0.5b',
            'device': torch.cuda.get_device_name(0), 'torch': torch.__version__,
            'sampleRate': model.sample_rate if model else None,
            'busy': gpu_lock.locked(), 'voices': VOICES}


@app.post('/tts')
async def tts(body: Speech, request: Request):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, 'text must not be blank')
    queued = time.perf_counter()
    async with gpu_lock:
        if await request.is_disconnected():
            return Response(status_code=499)
        wait_ms = (time.perf_counter() - queued) * 1000
        try:
            audio, seconds = await asyncio.to_thread(infer, text, body.voice)
        except Exception:
            log.exception('synthesis failed')
            raise HTTPException(500, 'Ming speech synthesis failed')
        if await request.is_disconnected():
            return Response(status_code=499)
        return Response(audio, media_type='audio/wav', headers={
            'X-TTS-Model': 'Ming-3.0-tts-0.5b',
            'X-Synthesis-Ms': str(round(seconds * 1000)),
            'X-Queue-Ms': str(round(wait_ms)),
        })


if __name__ == '__main__':
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('CUEX_TTS_PORT', '18666')))
