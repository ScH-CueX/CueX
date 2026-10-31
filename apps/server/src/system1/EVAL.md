# System 1 verification

Measured on 2026-10-31 on the Mac, with Node 22.22.2. No neural inference ran on the Mac. Windows deployment/evaluation is in progress. All model transfers were stopped after the instruction to keep model deployment off the Mac. The root agent owns removal of downloaded fragments.

## Local results

- `npx tsx --test test/system1.test.ts`: **3 feature tests passed**, zero failed. Two Chinese gateway visits exercise model HTTP and timeout fallback through candidate withdrawal, then separate point resolution. A typed HTTP round trip exercises JEV token slots, adapter selection and published calibration. Earlier helper-level tests were removed per the feature-test policy.
- `npx tsx scripts/s1-eval.ts --heuristic --out /tmp/cuex-s1-heuristic.json`: **40 states / 240 binary judgments / 240 correct**. Measured end-to-end `decide()` p50 **0.0326 ms**, p95 **0.2254 ms**. One warm-up decide was excluded. This is the same development fixture used to build the rules, not a held-out score.
- `npx tsc --noEmit -p .`: System 1 emitted no diagnostics. The full server is blocked by missing `./voice/index` in `src/config.ts` and `src/index.ts`, while the voice worker implements it.
- A live-controller regression exposed overlapping Chinese question wording. Fixed contract IDs now take priority; question-text inference applies only to unknown IDs. The model gateway feature uses the exact controller wording.

## Model deployment list

| Role | Exact repository / file | Bytes (HF metadata) | Prompt format |
| --- | --- | ---: | --- |
| Base Qwen latency comparison | `unsloth/Qwen3.5-9B-GGUF` / `Qwen3.5-9B-Q4_K_M.gguf` | 5,680,522,464 | `chat` |
| Smaller Windows alternative | `unsloth/Qwen3.5-4B-GGUF` / `Qwen3.5-4B-Q4_K_M.gguf` | 2,740,937,888 | `chat` |
| Typed-decision comparison | `chaoliangUNSW/Jev-Style-Qwen3.5-2B-Decision-GGUF` / `Jev-Style-Qwen3.5-2B-Decision-Q8_0.gguf` | 2,076,666,976 | `jevstyle-v1` |

All declare Apache-2.0 weights. JevStyle v1 also lists AG News research/non-commercial data terms. Qwen 9B is the provisional deployment pick because the publisher reports stronger Chinese C-Eval than 4B (**88.2 vs 85.1**). Those are full-model publisher results, not CueX or GGUF measurements.

No candidate has measured CueX neural accuracy or latency yet. The prior RX 7900 XT Vulkan budget was an engineering estimate only: at four slots, approximately 100–250 ms warm p50 and 250–600 ms warm p95 for a 4–6-question decide over a short state, and 300–900 ms cold. Validate those estimates on Windows; keep the 600 ms runtime timeout and heuristic fallback during the demo.

The current deployment is autotrust JEV-9B via a Qwen3.5-9B base GGUF plus the converted adapter_vllm LoRA, including output tensors, with bias and calibration in this client. Q8_0 and Q4_K_M are being compared on the Windows GPU. JEV-27B remains a metadata-only comparison. New JevStyle v4 likewise needs its custom scorer. JackKozmo29 1.5B is an English incident-SEV JSON model without a discovered GGUF. Details and source links are in `MODELS.md`.

## Windows validation to run

Run the read-only `infra/windows/Test-Scripts.ps1`, then inspect, download and start one catalogue model on the Windows box. Use its authorized SSH tunnel or a reachable remote llama-server URL. Run `scripts/s1-eval.ts` against that URL with `--backend` and `--out`. Keep every neural candidate's accuracy, errors and p50/p95 in separate result files. Windows PowerShell/Vulkan execution has not been run by this worker.
