# System 1 GPU evaluation

Measured on 2026-10-31 through the Mac-to-Windows SSH tunnel. All neural inference and model files stayed on Windows under `C:\cuex`. The Mac ran TypeScript clients, the frontend/gateway feature tests, and model-free HTTP fakes.

## Pick

**JEV-9B on Qwen3.5-9B Q4_K_M, English questions over Chinese state.** Use the converted `autotrust/JEV-9B` adapter_vllm LoRA at request scale 1. Keep the heuristic fallback. The runtime default timeout is **1460 ms**: worst-case recheck p95 1302.506 ms + 150 ms, rounded up to the next 10 ms. The 600 ms end-to-end p95 target was not met. The selected ordinary call is about 0.58 seconds p50; the demo can use JEV rather than falling back on every call.

Selected Windows flags:

```text
--host 127.0.0.1 --port 18080 --parallel 6 --ctx-size 16384
--cont-batching --device Vulkan0 --n-gpu-layers 99
--lora C:\cuex\adapter_vllm\JEV-9B-lora-f16.gguf
--lora-init-without-apply --jinja --reasoning-budget 0
--cache-ram 0 --ctx-checkpoints 0 --batch-size 2048 --ubatch-size 1024
```

Flash attention is enabled under `auto`. Each request explicitly selects adapter scale 1 for JEV or 0 for a base-model comparison. The controller and fallback retain full speech; only the neural prompt uses the last 120 characters. Ordinary calls ask responding, drift, and only still-unresolved points (maximum five). Candidate validity is asked only in the final pre-speech recheck (maximum six).

## Measured comparison

Every run uses 40 labeled Chinese development states and excludes one warm-up decide. All numbers below include transport, all parallel questions and prompt formatting where applicable. Accuracy uses a 0.5 threshold; controller thresholds are separate. This is a development fixture used during rule/prompt work, not a held-out benchmark. Five-question rows omit candidate validity and therefore have 200 rather than 240 judgments.

| Config / change | Questions | Correct | Accuracy | Decide p50 ms | Decide p95 ms | Health HTTP RTT p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Q4 JEV Chinese, 4 slots, default cache/checkpoints | 240 | 203 | 84.58% | 1346.7 | 2091.2 | 87.4 / 480.1 |
| Q4 JEV English, same baseline | 240 | 219 | 91.25% | 1386.0 | 1589.4 | 71.5 / 527.8 |
| Q4 base chat Chinese, adapter scale 0 | 240 | 198 | 82.50% | 1694.4 | 2108.9 | 68.7 / 515.4 |
| Q4 JEV English, cache RAM 0 | 240 | 219 | 91.25% | 1088.5 | 1443.6 | 71.2 / 462.1 |
| Add 6 slots, same total context | 240 | 219 | 91.25% | 1052.4 | 1379.8 | 87.5 / 460.0 |
| Ordinary calls + 120-character neural window | 200 | 193 | 96.50% | 927.2 | 1187.3 | 59.2 / 242.0 |
| Disable recurrent checkpoints | 200 | 193 | 96.50% | 658.1 | 986.8 | 75.4 / 397.6 |
| **Selected: micro-batch 1024** | **200** | **193** | **96.50%** | **580.8** | **891.9** | **58.5 / 372.8** |
| Selected flags, worst-case 6-question recheck | 240 | 213 | 88.75% | 926.2 | 1302.5 | 56.7 / 135.3 |

Q8_0 finished downloading and passed full SHA256 on Windows, but is not selected. The parent dropped further Q8 benchmarking because the Q4 configuration was already the demo choice and there was no evidence Q8 would offer clearly better accuracy at similar latency. No Q8 accuracy or latency is claimed.

Rejected experiments: Chinese prose compact state increased token count and ran slower; terse English state degraded accuracy; task-specific drift wording increased false-positive drift decisions. Raw outputs for these experiments stay with the run evidence rather than defining defaults.

## Verified runtime and readout

- Official llama.cpp **0.8.0-dev build 12023**, commit `f3586e66b`; Vulkan0 **AMD Radeon RX 7900 XT**. All **33/33** layers were confirmed offloaded. Q4 model GPU memory was about 4861 MiB; LoRA about 168 MiB.
- Base: `C:\cuex\models\Qwen3.5-9B-Q4_K_M.gguf`, 5,680,522,464 bytes. The base has a separate `output.weight` tensor; embeddings are not tied.
- Adapter: `C:\cuex\adapter_vllm\JEV-9B-lora-f16.gguf`, 176,614,464 bytes, **402 tensors**, including `output.weight.lora_a` and `output.weight.lora_b`. Conversion used CPU-only torch 2.11.0+cpu.
- All **24** published verbalizer IDs matched `/tokenize`. On the same bare-v1 prompt, scale 0 logprobs were true -0.0935553 / false -2.4156150; scale 1 was true -0.0036569 / false -5.6129785. Measured log-odds change: **3.28726195**. The adapter affects the actual Vulkan readout.
- The client uses the published bare-v1 prompt, token-slot ranges, head bias, and per-kind calibration temperatures. It reads token logprobs, adds bias, divides by temperature, then applies softmax. It performs no JSON-generation or reasoning-token loop.
- Four slots caused two waves for six questions. At six slots, prompt compute dominated one wave. The recurrent-state log counted 943 checkpoints created and 14 restored, motivating checkpoint removal. RAM prompt-cache copies/evictions also cost time.
- Generic `/completion` requests do not share computed recurrent-prefix state across slots in this build. Native `/systemone` grouping supports another GGUF decision metadata path; it is not a drop-in autotrust adapter endpoint. `--kv-unified` pools storage, not automatic common-prefix compute. `--cache-reuse` alone does not provide that grouping.
- The server is detached from SSH and remains the authorized CueX process. Startup, paths, PID and logs are recorded on Windows in `C:\cuex\logs\server-current.json`. No foreign service/process was modified.

## Feature verification

- Full server `npx tsc --noEmit -p .`: passed.
- `npx tsx --test test/controller-gateway.test.ts test/live-driver.test.ts test/system1.test.ts`: **16 passed**, one remote opt-in skipped. These are user-visible gateway/driver/engine feature flows, including candidate withdrawal, timeout fallback and preservation of an earlier answer beyond the neural window.
- `CUEX_S1_REMOTE_TEST_URL=http://127.0.0.1:18080 npx tsx --test test/system1.test.ts`: **5 passed**, including the real JEV GPU round trip on the Chinese “I will answer the population question” hard case. It responds true while substantive resolution remains false.
- Heuristic: 40 development states / 240 judgments, 240 correct. This uses the same development fixture as the rules and is not a held-out score.
- Windows PowerShell script parsing, catalogue checks, conversion-script compilation, server health and runtime token/adapter checks passed.

Raw run evidence lives outside the repository at `/tmp/cuex-s1-matrix/`. Infrastructure scripts remain in `infra/windows/`; model selection sources remain in `MODELS.md`.
