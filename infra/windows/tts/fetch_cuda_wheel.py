"""Resumable bounded parallel download of the official, SHA-pinned CUDA wheel."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from pathlib import Path
import sys
import time
import requests

URL = 'https://download-r2.pytorch.org/whl/cu128/torch-2.8.0%2Bcu128-cp311-cp311-win_amd64.whl'
SHA256 = '34c55443aafd31046a7963b63d30bc3b628ee4a704f826796c865fdfd05bb596'
root = Path(sys.argv[1] if len(sys.argv) > 1 else r'E:\CueX-TTS\wheels')
root.mkdir(parents=True, exist_ok=True)
wheel = root / 'torch-2.8.0+cu128-cp311-cp311-win_amd64.whl'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(4 * 1024 * 1024): h.update(block)
    return h.hexdigest()

if wheel.exists() and digest(wheel) == SHA256:
    print('Verified cached wheel:', wheel, flush=True)
    raise SystemExit(0)
probe = requests.get(URL, headers={'Range': 'bytes=0-0'}, stream=True, timeout=(15, 60))
probe.raise_for_status()
if probe.status_code != 206: raise RuntimeError('Server did not support range download')
size = int(probe.headers['Content-Range'].split('/')[-1]); probe.close()
chunk = 16 * 1024 * 1024
count = (size + chunk - 1) // chunk
parts = root / 'torch-parts'; parts.mkdir(exist_ok=True)

def fetch(index):
    start, end = index * chunk, min(size, (index + 1) * chunk) - 1
    path = parts / f'{index:04d}.part'
    if path.exists() and path.stat().st_size == end - start + 1: return index
    for attempt in range(3):
        try:
            with requests.get(URL, headers={'Range': f'bytes={start}-{end}'}, stream=True, timeout=(15, 60)) as response:
                if response.status_code == 429:
                    time.sleep(min(60, int(response.headers.get('Retry-After', '10')))); continue
                response.raise_for_status()
                expected = f'bytes {start}-{end}/{size}'
                if response.status_code != 206 or response.headers.get('Content-Range') != expected:
                    raise RuntimeError(f'Unexpected range response for {index}')
                tmp = path.with_suffix('.tmp')
                with tmp.open('wb') as f:
                    for data in response.iter_content(256 * 1024): f.write(data)
                if tmp.stat().st_size != end - start + 1: raise RuntimeError('Incomplete chunk')
                tmp.replace(path)
                return index
        except Exception:
            if attempt == 2: raise
            time.sleep(2 + attempt * 2)
    raise RuntimeError('Range retries exhausted')

started = time.monotonic()
print(f'Downloading {size / 1e9:.2f} GB in {count} verified ranges', flush=True)
with ThreadPoolExecutor(max_workers=6) as pool:
    for done, future in enumerate(as_completed([pool.submit(fetch, i) for i in range(count)]), 1):
        future.result()
        if done % 8 == 0 or done == count:
            print(f'{done}/{count} ranges; {time.monotonic()-started:.1f}s', flush=True)
with wheel.open('wb') as output:
    for i in range(count):
        with (parts / f'{i:04d}.part').open('rb') as source:
            while data := source.read(4 * 1024 * 1024): output.write(data)
if digest(wheel) != SHA256: raise RuntimeError('Official SHA256 verification failed')
print('SHA256 verified:', wheel, flush=True)
