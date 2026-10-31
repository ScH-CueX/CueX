# CueX Windows TTS

User-authorized deployment target: Windows 11, RTX 5080 16 GB, Ryzen 7 9800X3D, approximately 48 GB system memory. The private SSH bundle is kept outside this repository. Never add it, its private key, or a private SSH config to source control or the submission ZIP.

The selected model is [Ming-3.0-tts-0.5b](https://github.com/inclusionAI/Ming-3.0-tts). The model's reference requirements use PyTorch 2.6. This target needs a CUDA 12.8 build supporting Blackwell, so the dedicated environment uses PyTorch/torchaudio 2.8.0 and validates real CUDA inference. [PyTorch's Blackwell release guidance](https://pytorch.org/blog/pytorch-2-7/).

Deployment root: `E:\CueX-TTS`. No existing model environment, account, SSH key, firewall rule or boot autostart is changed. The service binds only `127.0.0.1:18666`; the Mac connects through an SSH exec bridge because this host disallows TCP forwarding. The bridge only accepts fixed `/health` and `/tts` operations; speech text is sent as JSON on stdin.

## Runtime contract

- `GET /health`: model, GPU, sample rate and readiness.
- `POST /tts`: JSON `{"text":"...","voice":"doctor"}` returns a complete PCM WAV. `voice` also accepts `narrator`.
- Official built-in voices: 灵楷 for the simulated doctor, 灵小柔 for narration. No real person's voice is cloned.
- As in the existing `apps/server/scripts/voice-tts-server.ts`, synthesis is serialized for one shared model. Disconnected queued requests are skipped; already-running GPU work may finish, but its audio is discarded after disconnect.
- Chinese FST normalization is disabled because the optional native pynini dependency is unavailable in the chosen Windows environment. CueX samples and final narration are saved for audition; do not equate timing/decoding checks with subjective voice-quality assessment.

Project configuration after validation:

```sh
CUEX_TTS_BACKEND=http
CUEX_TTS_URL=http://127.0.0.1:18766/tts
CUEX_TTS_FALLBACK=none
```

`none` preserves the user's requirement that both product speech and film narration come from this machine. An unavailable remote service is reported as an error instead of silently using Edge. Legacy adapters remain available only when explicitly selected. Automatic fallback now requires an explicit `CUEX_TTS_FALLBACK=auto`.

Service source: `serve_ming.py`. Manual background startup: `start-ming.ps1`. Model and virtual-environment files remain on the Windows machine; only reproducible source/configuration belongs in this repo. 

## Start and connect

The isolated environment is `.venv`, the source checkout is `Ming-3.0-tts` at `9332fb9443325d4726ce02cefd4ec1c211df4079`, and weights are in `models/Ming-3.0-tts-0.5b`. Install torch/torchaudio 2.8.0 from the CUDA 12.8 index, then `requirements-ming.txt`. The model is available from the official ModelScope inclusionAI repository.

On Windows, run `E:\CueX-TTS\start-ming.ps1`. It uses a WMI-owned background process, survives SSH logout and waits for model warmup. It does not install boot autostart. After a reboot, start it again.

On the Mac, keep the supplied private key, pinned known_hosts and SSH config outside the repository. Default config path: `~/.ssh/cuex-rtx-tts/ssh-config`; override with `CUEX_TTS_SSH_CONFIG`. The config must define `rtx-home`. Run `pnpm tts:connect` for a standalone bridge, or `pnpm demo` for the complete launcher. The bridge listens only at `127.0.0.1:18766` and uses a private, owned SSH multiplex socket.

## Measured validation (2026-11-01)

- CUDA BF16 computation and actual model synthesis passed on RTX 5080, torch 2.8.0+cu128. Output: 44.1 kHz mono PCM16 WAV.
- Warm doctor sample: 3.3 s audio, 3.208 s GPU synthesis, 4.522 s end-to-end including SSH connection startup.
- Warm narration sample: 2.4 s audio, 2.205 s synthesis, 2.723 s end-to-end. These are two samples, not a latency percentile or concurrency benchmark.
- Six film lines generated successfully: 2.4–4.3 s audio each. Sources and hashes are in `assets/audio/narration/manifest.json`.
- The first GPU warmup after process startup took about 19 s. Health becomes ready only afterwards.
- `CUEX_TEST_OFFLINE=1 CUEX_TEST_MING_TTS=1 pnpm --filter @cuex/server test` enables the real Windows gateway/abort check while skipping legacy Edge network tests.

The actual WebSocket gateway delivered its first Ming WAV chunk in 3.096 s in the recorded integration check. ffmpeg decoded it successfully; user interruption produced no later audio from that utterance over a 6 s observation window.
