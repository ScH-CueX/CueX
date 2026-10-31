# Windows ASR

The demo uses the official **sherpa-onnx 2.0.1 win-x64 static MT CPU** streaming WebSocket server. No Python environment is needed. Models and runtime files stay under `C:\cuex\asr` on Windows.

## Install and start

Copy `install.ps1` and `start.ps1` into `C:\cuex\asr`. In PowerShell 7:

```powershell
pwsh -NoProfile -File C:\cuex\asr\install.ps1
pwsh -NoProfile -File C:\cuex\asr\start.ps1
```

`install.ps1` downloads the official release and both model archives. It verifies their recorded SHA256 values before extracting them. `start.ps1` checks that port 6006 is free and launches outside the SSH job with `Win32_Process.Create`. The server survives the SSH session. `server.json` records its PID, start time, model, and thread count. Logs are `stdout.log`, `stderr.log`, and `server.log`.

The default is `zh`: the Chinese model gives faster partials and endpoints in this demo. Switch models by restarting only the process recorded by this script:

```powershell
pwsh -NoProfile -File C:\cuex\asr\start.ps1 -Model xasr -Restart
pwsh -NoProfile -File C:\cuex\asr\start.ps1 -Model zh -Restart
```

The script refuses to stop a PID if its executable or start time differs from its record. It does not modify services, firewall rules, or other model processes.

The upstream binary binds `0.0.0.0:6006` and has no host/bind flag. This is the approved demo setup. The Mac connects through SSH to Windows loopback. Leave Windows firewall prompts alone.

## Mac connection

From the repository root, keep the shared tunnel open:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH bash apps/server/scripts/s1-tunnel.sh
```

It forwards both System 1 port 18080 and ASR port 6006. Set `CUEX_ASR=real CUEX_ASR_URL=ws://127.0.0.1:6006` for the CueX server.

## Verify and compare

Run from `apps/server` with Node 22 on PATH. The benchmark reuses `src/voice/index.ts` and its remote ASR engine. Like `scripts/voice-bench.ts`, it selects the engine from `CUEX_*` variables. It does not implement a second ASR client.

```sh
CUEX_ASR=real CUEX_ASR_URL=ws://127.0.0.1:6006 npx tsx scripts/asr-bench.ts zh-2025-06-30 /tmp/cuex-asr-zh.json
CUEX_ASR=real CUEX_ASR_URL=ws://127.0.0.1:6006 npx tsx --test test/asr-remote.test.ts
```

The opt-in feature test starts the real `WebSocketGateway`, sends `audio.chunk` PCM frames over its browser-facing WebSocket, and requires both partial and final rep transcripts from the remote ASR. It is skipped when `CUEX_ASR_URL` is unset. It uses fake System 1/System 2 and silent TTS to isolate microphone transcription.

The eight audio fixtures come from macOS `say -v Tingting`, converted with `afconvert` to 16 kHz mono PCM16 WAV. `ffmpeg` extracts PCM. Clips stay under `/tmp/cuex-asr-clips`; no model is downloaded to the Mac. The benchmark streams 100 ms frames at real-time speed, then 3 seconds of silence. First-partial delay includes connection setup. Endpoint delay starts at the trimmed clip's speech end. RTT uses eight WebSocket ping/pong exchanges through SSH.

CER lowercases text, applies NFKC, and removes whitespace, punctuation, and symbols. It keeps written numbers and medical terms unchanged. Thus a numeral transcribed as spoken Chinese digits counts as an error. Results include every reference and recognized line so the score can be checked.

## Measured comparison

Windows: Ryzen 9 5900X, CPU provider, 4 ONNX threads, 1 decoder worker, greedy search, 0.7 s endpoint silence. Eight clips, 146 literal reference characters or 150 spoken-form characters. Raw lines and scores are in `xasr-480ms.json` and `zh-2025-06-30.json`.

| Model | Literal CER | Spoken-number CER | First partial, median / p95 | Endpoint delay, median / p95 | SSH WebSocket RTT, median / p95 |
| --- | --- | --- | --- | --- | --- |
| X-ASR 480 ms, zh-en | 23.29% (34/146) | 7.33% (11/150) | 1224 / 1470 ms | 1860 / 2305 ms | 54 / 291 ms |
| Zipformer zh 2025-06-30 | 24.66% (36/146) | 8.67% (13/150) | 844 / 1006 ms | 1392 / 1773 ms | 52 / 238 ms |

Latency medians use the mean of the middle two values. The saved RTT medians use the upper middle of eight samples. The benchmark now uses the mean of the middle two for all medians.

The spoken-number reference spells numbers as spoken Chinese, for example `七十五`, while preserving `eGFR`. It is declared in the fixtures and scored separately from the original literal reference. No model-specific substitutions are applied. Both models recognized the age/population line correctly. Both failed to preserve `eGFR` in the Tingting clips. X-ASR also rendered the fictional product name as `安淑平`; zh rendered it as `班舒平`.

**Choice:** Both models preserved the `75 岁` population and `30 到 60` range in spoken Chinese. Neither preserved `eGFR` from Tingting. `zh` is the default because its first partial was about 380 ms earlier and its endpoint about 468 ms earlier. Its two extra character errors were in the endpoint/product lines. X-ASR stays installed and can be selected with one restart. Read mixed medical abbreviations clearly during the demo; this test did not establish reliable `eGFR` recognition.

The real gateway test passed with final text `七十五岁以上的患者约占百分之十一` and 11 partial events. It took 6.53 seconds including real-time audio and trailing silence.

## One-shot hotword experiment

One additional comparison used `modified_beam_search`, four active paths and `--hotwords-score=1.5` with `hotwords.txt`. No score sweep was run. X-ASR used `--modeling-unit=bpe` and `bpe.vocab` exported from its bundled `bpe.model` using the official 2.0.1 exporter and `sentencepiece==0.2.1` on Windows. The zh model used `--modeling-unit=cjkchar`; its vocabulary could not encode `EGFR`, `ANSHU`, `肾`, or `滤`, and upstream skipped those tokens.

| Model with hotwords | Literal CER | Spoken-number CER | First partial, median / p95 | Endpoint, median / p95 |
| --- | --- | --- | --- | --- |
| X-ASR | 23.97% (35/146) | 8.00% (12/150) | 1227 / 1418 ms | 1933 / 2384 ms |
| zh | 23.97% (35/146) | 8.00% (12/150) | 678 / 1084 ms | 1288 / 1407 ms |

The zh product name improved from `班舒平` to `安舒平`. Neither model preserved `eGFR`. The selected deployment remains **zh with greedy search**. `xasr-hotwords.json` and `zh-hotwords.json` preserve the full comparison. Hotwords are not enabled by `start.ps1`.
