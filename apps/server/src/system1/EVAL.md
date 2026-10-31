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

## Windows validation in progress

Run the read-only `infra/windows/Test-Scripts.ps1`, then inspect, download and start one catalogue model on the Windows box. Use its authorized SSH tunnel or a reachable remote llama-server URL. Run `scripts/s1-eval.ts` against that URL with `--backend` and `--out`. Keep every neural candidate's accuracy, errors and p50/p95 in separate result files. A Windows worker converted the LoRA and verified output-layer tensor compatibility. Actual server readout and the six-run quant/readout matrix are pending model download completion.

## Verified Windows runtime

- Runtime: official llama.cpp 0.8.0-dev build 12023, commit `f3586e66b`, Vulkan0 AMD Radeon RX 7900 XT. Server bound to `127.0.0.1:18080`, four slots, total context 16,384, all layers offloaded.
- Base Q4_K_M: `C:\cuex\models\Qwen3.5-9B-Q4_K_M.gguf`, 5,680,522,464 bytes. Base output is a separate tensor; embeddings are not tied.
- Converted adapter: `C:\cuex\adapter_vllm\JEV-9B-lora-f16.gguf`, 176,614,464 bytes, 402 tensors. It includes `output.weight.lora_a` and `output.weight.lora_b`. Conversion used CPU-only torch 2.11.0+cpu.
- All 24 verbalizer IDs matched the server tokenizer.
- On the same bare-v1 prompt, scale 0 logprobs were true -0.0935553 / false -2.4156150; scale 1 logprobs were true -0.0036569 / false -5.6129785. Measured change in logprob odds: **3.28726195**. The adapter changes the readout in the actual Vulkan process.
- The process is detached from SSH. Startup details are saved in `C:\cuex\logs\server-current.json`. Only CueX-owned processes/files were created or managed.
- First independent tunnel HTTP health RTT probe: 19 samples, p50 **68.7775 ms**, p95 **454.8335 ms**. These are HTTP/network timings without inference. Each matrix run also measures its own 19-sample RTT before inference.

## Q4 baseline matrix (measured)

40 Chinese development states, six parallel binary questions per state, one warm-up excluded. Server: four slots, RAM prompt-cache default 8192 MiB, context 16384, same Q4 base and LoRA. Native request scale 1 for JEV, 0 for chat. Prediction threshold 0.5 for this benchmark. Every latency includes SSH/network and all question requests.

| Readout | Accuracy | Exact-state accuracy | Decide p50 ms | Decide p95 ms | Health HTTP RTT p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| JEV Chinese | 84.58% | 35.0% | 1346.7 | 2091.2 | 87.4 / 480.1 |
| JEV English questions, Chinese state | 91.25% | 55.0% | 1386.0 | 1589.4 | 71.5 / 527.8 |
| Base Qwen chat Chinese | 82.50% | 37.5% | 1694.4 | 2108.9 | 68.7 / 515.4 |

No Q4 baseline config meets p95 <=600 ms. The logs show two request waves for six questions across four slots; prompt processing dominates. Example first wave 574–586 ms and second wave 255–290 ms, before transport. RAM prompt-cache copies/evictions add tens of milliseconds. Vulkan graphs were reused; repeated kernel compilation does not explain these samples. Further cache/slot tests will be recorded separately from this baseline.

Raw result files: `/tmp/cuex-s1-matrix/Q4_K_M-{jev-zh,jev-en,chat-zh}.json`; summary: `/tmp/cuex-s1-matrix/Q4_K_M-summary.json`.

## Controlled Q4 cache tuning

With the same four slots and 16,384 total context, disabling only RAM prompt cache (`--cache-ram 0`) preserved the English-question accuracy at **91.25%**. Measured decide p50/p95 improved from **1386.0 / 1589.4 ms** to **1088.5 / 1443.6 ms**. The run's health HTTP RTT was **71.2 / 462.1 ms**. All 33 layers were confirmed offloaded to Vulkan. This still fails the 600 ms p95 gate; a six-slot one-wave test follows.

With RAM cache disabled and six slots, preserving 16,384 total context, English JEV remained **91.25%** accurate. Measured decide p50/p95: **1052.4 / 1379.8 ms**, health HTTP RTT **87.5 / 460.0 ms**. Moving from four to six slots gave only a small improvement; batching does not eliminate total prompt-processing cost.

A Chinese prose compact-state/short-question experiment on Q4 six-slot/cache0 reached **92.08%** development accuracy but became slower: **1325.3 / 1622.1 ms** decide p50/p95. The state text expanded token count and the run also had higher network RTT p95 (**690.4 ms**). This experiment is not the default. A separate terse English-header state experiment preserves Chinese speech and is logged separately.

## Ordinary controller call

The controller already sends `candidateValid` only during the final pre-speech recheck, and asks resolution questions only for points still unresolved. The previous six-question fixture represented a maximum recheck, not every partial update. Its ordinary maximum is five questions. The neural client bounds its prompt to the last 120 characters. The controller and heuristic fallback retain the full rep speech, so an earlier answer remains available to the fallback.

Measured ordinary five-question / 120-character state window on Q4 six-slot/cache0: **193/200 correct (96.50%)**, decide p50/p95 **927.2 / 1187.3 ms**, health HTTP RTT **59.2 / 242.0 ms**. This is a changed workload and denominator, not directly the six-question accuracy score. The shared gateway and LiveWSDriver feature suite stayed green: **15 passed, one remote opt-in skipped**.

Disabling recurrent checkpoints (`--ctx-checkpoints 0`) on the same Q4 six-slot/cache0 ordinary workload preserved **96.50%** accuracy and improved decide p50/p95 to **658.1 / 986.8 ms**. Health HTTP RTT was **75.4 / 397.6 ms**. The prior server log counted 943 created versus 14 restored checkpoints, which supported this test. Flash attention was already enabled under `auto`, so forcing it on is not a separate measured improvement.
