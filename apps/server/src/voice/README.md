# Voice engines

`index.ts` exports `createAsrEngine()`, `createTtsEngine()` and `warmupVoice()` for `config.ts`. Everything is chosen by environment variables. ASR runs on the Mac by default, so the venue network does not decide whether the mic works. Run `apps/server/scripts/voice-fetch-asr-model.sh` once to download the model (127 MB archive, 160 MB on disk, SHA256 checked).

## ASR (rep speech to text)

| Setting | What runs | Where |
| --- | --- | --- |
| `CUEX_ASR_URL=ws://host:6006` | `asr-remote.ts` talks to a sherpa-onnx streaming WebSocket server. It wins over everything below. | Windows box or any remote host |
| `CUEX_ASR_MODEL_DIR=<dir>` | `asr-local.ts` runs the model inside the CueX server with `sherpa-onnx-node` | the machine that runs the server |
| none set, and `${CUEX_MODEL_DIR:-~/.cache/cuex-models}/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30` exists | the same local engine, with that model (the demo default) | the machine that runs the server |
| none of the above | text-only: the browser sends `speech.delta`, and `audio.chunk` gets `ASR_TEXT_ONLY` | any |

The local model loads in `warmupVoice()` at server start (3 to 5 s, blocking), so nobody waits for it during a visit.

Other variables: `CUEX_ASR_ENDPOINT_SILENCE` (seconds of silence that end a sentence, default 0.7, local mode only), `CUEX_ASR_THREADS`, `CUEX_ASR_CONNECT_TIMEOUT_MS`.

### Start the ASR server (Windows box, CPU)

```
pip install sherpa-onnx websockets numpy
curl -LO https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v2.0.1/python-api-examples/streaming_server.py
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05.tar.bz2
tar xjf sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05.tar.bz2
python streaming_server.py --port 6006 --num-threads 4 --use-endpoint 1 --rule2-min-trailing-silence 0.7 ^
  --encoder <dir>/encoder....onnx --decoder <dir>/decoder....onnx --joiner <dir>/joiner....onnx --tokens <dir>/tokens.txt
```

Replace the `....` with the real file names in the model folder. Then set `CUEX_ASR_URL=ws://<windows-ip>:6006` for the CueX server.

* Default model: `sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05`, 134 MB, Apache-2.0, Chinese and English (about 1000 of its 5000 tokens are Latin, so "eGFR" works). The `160ms` variant has the same size and lower latency.
* Fallback model, measured on the Mac: `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`, 167 MB, Chinese only. CER 1.44% on 5 clips from macOS `say` (139 characters). First partial 0.6 to 0.8 s after speech starts, 15 to 19 ms of CPU per 200 ms of audio, a sentence ends 0.8 to 1.3 s after the rep stops.
* The X-ASR model has not been run yet. Check it on the Windows box before relying on it.

## TTS (doctor voice)

Default: Windows Ming through `http://127.0.0.1:18766/tts`, with `CUEX_TTS_FALLBACK=none`. Start `pnpm tts:connect` or `pnpm demo` at the repo root. Deployment, voices and measured latency: `infra/windows/tts/README.md`. A service failure is reported; no other voice is substituted. Legacy fallback requires explicit `CUEX_TTS_FALLBACK=auto`.

| Engine | Setting | Notes |
| --- | --- | --- |
| `edge` (explicit legacy option) | `CUEX_EDGE_VOICE` (default `zh-CN-YunyangNeural`), `CUEX_EDGE_RATE` (default `+8%`), `CUEX_EDGE_PITCH` | Needs internet. Unofficial Microsoft endpoint through `msedge-tts`, so it can break. Output is MP3. |
| `http` (default) | `CUEX_TTS_URL=http://127.0.0.1:18766/tts` | POST `{"text"}`, answer is one WAV or MP3 file. |
| `sherpa` | `CUEX_TTS_MODEL_DIR=<dir>` | VITS model in the server process. Checked with `vits-icefall-zh-aishell3`. |

Every call to `synthesize()` yields exactly one complete audio file for the text it gets, so the browser can decode each chunk alone. Split long text into clauses before calling.

Start a TTS server on another machine: `CUEX_TTS_MODEL_DIR=<dir> PORT=8790 HOST=0.0.0.0 npx tsx scripts/voice-tts-server.ts`.

Edge keeps its socket fresh in the background. Without that, the first sentence after about 30 seconds of silence costs an extra 1.3 to 1.6 s.

## Scripts

* `npx tsx scripts/voice-bench.ts 20 45` prints time to first audio for the configured TTS, cold, warm and after idle gaps.
* `npx tsx scripts/voice-samples.ts [dir]` writes MP3 samples of several Edge voices.
* `npx tsx scripts/voice-tts-server.ts` is described above.

## Tests

`npx tsx --test test/voice-flow.test.ts`. Two tests call the real Edge service. Set `CUEX_TEST_OFFLINE=1` to skip them.
