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

## Final live-flow correction

The first real JEV gateway rehearsal exposed two gaps hidden by aggregate accuracy: generic “unrelated” wording missed endpoint/safety pitches at the controller's 0.65 threshold, and cumulative ASR partials let an earlier pitch outweigh a later explicit answer promise. No controller threshold changed.

The applicability concern now asks JEV the focused positive question: “Is the latest speech describing overall study endpoints, efficacy or safety rather than age or renal subgroup details?” Responding/drift judge only the recent segment; substantive resolution retains its 120-character evidence window. An explicit turn-back phrase such as `我先回答` starts that segment. A small local cue guard sets responding true and drift/candidate-valid false for that explicit phrase, without resolving any point. Results using it append `+response-cue` to the backend name. This is a hybrid cue guard, not a claim that the resulting cue probabilities are calibrated JEV outputs.

Final measured ordinary fixture: **197/200 correct (98.50%)**, decide p50/p95 **648.3 / 908.4 ms**; health RTT **63.7 / 390.5 ms**. Drift recall **100%** (6/6), precision **85.71%** (one false positive). Resolution precision remained 100% for c1/c2/c3; c2 recall was 90%. Raw evidence: `/tmp/cuex-s1-matrix/Q4_K_M-focused-drift-cue-ordinary120.json`.

Three real-JEV gateway flows passed: listening/resolve-and-advance; continued partial pitch→prepare→interrupt; and prepared candidate→explicit answering promise→withdraw without speech. These runs used the controller's current in-tree any-target-resolved withdrawal patch. The 1460 ms timeout remains based on the earlier measured worst-case recheck, with the heuristic available on transport/timeout failures.

## RTX 5080 replacement host and SSH exec relay

The old Windows SSH route stopped accepting sessions. The replacement personal PC runs the same Q4 base and LoRA under `D:\cuex`, official b12023 CUDA 13.4 (`f3586e66b`), CUDA0 RTX 5080, driver 621.01. The detached server is PID 24308 with launcher 27288. Requested context 16384 is aligned by this build to effective 16896 (six slots of 2816). Desktop apps remain running; after checks GPU use was about 12,595 / 16,303 MiB.

All 24 verbalizer IDs matched. LoRA scale 0→1 changed true/false log-odds by **3.49358369**. Conversion again produced 402 tensors including output LoRA, with the same expected GGUF hash. The server first answered locally, but native SSH `-L` channels were administratively prohibited. No SSH policy, firewall, frp or `G:\SSHAccess` changed.

The authorized replacement is one persistent pinned SSH **exec** session. Mac `scripts/s1-relay.mjs` listens only on `127.0.0.1:18080`; remote `D:\cuex\relay\s1_relay.py` connects only to `127.0.0.1:18080`. Both use standard libraries and base64 line frames for multiplexed TCP. `scripts/s1-tunnel.sh` starts the relay, preserving the demo launcher interface. SSH exit closes all open local streams and respawns after one second. Client timeouts still abort individual streams. An idle SSH-child restart passed, and `/health` returned HTTP 200 again afterward.

Verification on the replacement host:

- Three real JEV gateway flows and four natural-dose gateway variants passed: **7/7**. The dose variants each exercise canned JEV HTTP, heuristic, and the real CUDA JEV engine, including a promise-to-answer negative before the actual dose answer.
- Short ordinary check: 12 states / 60 judgments, **58 correct (96.67%)**, decide p50/p95 **351.5 / 692.3 ms** through the relay. This short check is not the full 40-state comparison.
- Remote direct localhost health: 20 requests, p50 **14.70 ms**. Mac relay health warm probe: 19 measured requests after one warm-up, p50 **69.48 ms** / p95 **454.46 ms**. The difference in p50 is **54.78 ms** for relay plus SSH/network, not relay CPU alone. During the short ordinary check the separate health p50/p95 was **55.1 / 129.8 ms**.
- Remote relay: stdlib compile passed; three simultaneous health channels, keep-alive, clean close, EOF, invalid-frame rejection passed. Mac Node syntax, loopback bind, real HTTP, inference and idle SSH reconnect passed.
- Natural d1 answers now include `75岁以上从2.5毫克开始`, `高龄要减半起始`, `起始剂量调低，两周后再按血压调`, and `高龄起始剂量需要按说明书调整，现有资料没有具体数据`. The shared narrow dose cue never resolves a mere promise. A result using it appends `+dose-cue` to the backend.

The 1460 ms demo timeout remains unchanged. No model is downloaded to or executed on the Mac. Run evidence stays in `/tmp/cuex-s1-matrix/` and `D:\cuex\logs`; source setup instructions are in `infra/windows/PERSONAL-PC.md` and `S1-RELAY.md`.

## Natural visitor pitch regression (A versus A+C)

A later rehearsal exposed a remaining-points bug: after c1/c2 were answered, the broad responding question sometimes treated an unrelated pitch as responding. Thirty new variation states were measured through the real RTX relay: ten natural drift lines (two each for endpoints, safety, real-world data, adherence and price) plus five on-topic c3 answers, in both all-open and c3-only states. None reused the gateway test phrases. Controller thresholds stayed responding <0.60 and drift >=0.65.

**A** preserves the original responding question while all three points are open. Once some points are resolved, responding names only the still-open points. The drift question covers a general pitch about efficacy, safety, real-world data, convenience, adherence, availability and cost in both states. **C** is a narrow ambiguity tie-break: when drift >=0.85 and responding <0.70, cap responding at 0.49. It never resolves a point and never applies to an explicit response cue. These thresholds represent clear drift and marginal responding; they were fixed before evaluation, not fitted to the ten lines. A changed result appends `+drift-tiebreak` to its backend.

| Gate | Previous committed wording | A (hybrid) | A+C shipped |
| --- | ---: | ---: | ---: |
| Ordinary 40 states / 200 judgments | 98.50% | 98.00% | 99.00% live |
| Responding accuracy | 39/40 | 38/40 | 40/40 live |
| c1 resolution accuracy | 40/40 | 40/40 | 40/40 |
| c2 resolution accuracy | 39/40 | 39/40 | 39/40 |
| c3 resolution accuracy | 40/40 | 40/40 | 40/40 |
| Ten natural drift lines, all open | 4/10 | 7/10 | 9/10 live |
| Ten natural drift lines, c3 only | 0/10 | 10/10 | 10/10 live |
| False drift on five c3 answers, all open | 0/5 | 0/5 | 0/5 |
| False drift on five c3 answers, c3 only | 0/5 | 0/5 | 0/5 |

The required offline comparison applied C to the same logged A probabilities: all-open recall **7→8/10**, c3-only **10→10/10**, false drift **0→0/5** in each state, ordinary **196→197/200**, and responding **38→39/40**. **Three of the 40 ordinary states** were in the tie-break region (`endpoint`, `regional`, `general-efficacy`); only `regional` changed its >=0.5 prediction, from wrong to right. No correct ordinary prediction became wrong. No cue case changed. The live A+C repeat differed slightly from the offline predictions because batching/logit values vary near boundaries; the table reports its measured live values, not the offline estimate.

A's two responding errors were **false responding on pitches** (`safety` p=0.5045 and `regional` p=0.5125), which can miss an interruption. They were not false “not responding” on an answer. The old wording's one error was the opposite (`age-overclaim`, p=0.4763 versus a responding label).

A+C live ordinary decide p50/p95: **409.7 / 742.9 ms** over the 40 states. Explicit “我先回答” stayed responding and resolved no point. All four natural-dose variants still resolved d1 only after the actual answer. Four real gateway flows passed: listen/advance, interrupt continued speech, explicit-promise withdrawal, and a new c3-only price/adherence pitch followed by c3-answer withdrawal. No controller threshold or lifecycle code changed in this fix.

Evidence: `/tmp/cuex-s1-matrix/drift-variation-{before,hybrid,hybrid-tiebreak}.json`, `RTX5080-{hybrid,hybrid-tiebreak}-ordinary40.json`; fixtures/probes are saved in the same directory, outside the repository.

## Continuous 28-second pitch regression

The recorded browser pitch had 18 `on_topic` ticks from 15.654–22.791 s and no prepared follow-up. Replaying all five questions showed two causes: in the long first segment, responding was **0.74–0.85** despite drift **0.88–0.97**; after ASR finalized it, the next short segment hid the preceding pitch and drift fell to **0.18–0.46**.

The two-line System 1 fix reads the last **80 characters of whole rep speech**, not only the newest ASR segment, and narrows the responding question to the requested population/subgroup. Drift wording, controller thresholds, point resolution and the response-cue guard are unchanged. All **18/18** missed reconstructed input ticks became drifting. Reconstruction uses the latest ASR received at `verdict.t - latencyMs`, because the original query revision was not logged.

A new **actual gateway replay** used production **900 ms / 35 characters**, real relay **JEV + FakeSystemTwo (35 ms) + silent valid TTS**. The candidate was ready at **18.307 s during the pitch** and spoken at **29.931 s**. This is not the full-real browser/Ming rehearsal. Whole-context-only with the old question still gave high responding in the query comparison; its full timed gateway run was interrupted when the parent prioritized the accepted candidate, so no completed gateway result is claimed for it.

The accepted candidate scored **197/200 (98.50%)** on ordinary 40, responding **39/40**, c1/c2/c3 resolution **40/40 each**, decide p50/p95 **513.2 / 674.4 ms**. Its three label errors do not cause false interruption at the actual action gate:

| State | Rep text / context | Responding | Drift | Action error |
| --- | --- | ---: | ---: | --- |
| rwe-after-answer | `75岁以上约占11%，eGFR30到60亚组412人。另有一项覆盖两万多名患者的真实世界研究。` | 0.792956 | 0.570110 | Missed drift, no false interrupt |
| age-overclaim | `高龄患者肯定都能用，我们产品很安全。` | 0.860720 | 0.668348 | No false interrupt; responding blocks it |
| full-demo | Full fixture, ending `不过eGFR低于30被排除，没有证据，说明书不建议使用。` | 0.792077 | 0.538617 | No false interrupt; all points resolve |

Latest candidate checks: full server typecheck passed; local System 1 feature tests passed with remote opt-ins skipped. Cue/d1 behavior is covered locally. No new real cue/d1 inference ran while the controller owned the browser GPU window; earlier real cue/d1 checks predate this two-line fix. Controller owns the full-real browser/Ming closing/review/retry report.

Evidence: `/tmp/cuex-s1-matrix/stage-{before,after}.json`, `stage-question-candidates.json`, `stage-gateway-candidate.json`, `RTX5080-whole-speech-ordinary40.json`; replay sources are saved there, outside the repo.
