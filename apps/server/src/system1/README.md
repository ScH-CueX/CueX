# System 1

`createSystemOne(pack)` implements the controller contract without a cloud dependency.

- Without `CUEX_S1_URL`, it uses `HeuristicSystemOne`.
- With `CUEX_S1_URL`, it tries `LlamaSystemOne`, then uses local rules after a timeout or connection failure. A failed model is retried after five seconds.
- Each result names the backend that actually answered. Rule weights are deterministic and are not calibrated model confidence.
- Caller cancellation propagates as `AbortError`. The model's decide deadline raises `TimeoutError`; the wrapper then uses rules.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `CUEX_S1_URL` | unset | llama-server base URL, such as `http://127.0.0.1:18080`; an ending `/v1` is accepted |
| `CUEX_S1_TIMEOUT_MS` | `1460` | Total model decide deadline, including prompt formatting and all parallel questions |
| `CUEX_S1_BACKEND` | `jev-9b-q4@win-vulkan` | Model/backend name in results, such as `jev-9b-q4@win-vulkan` |
| `CUEX_S1_MODEL` | unset | Optional model alias for prompt formatting |
| `CUEX_S1_FORMAT` | `jev-v1` | `jev-v1` for autotrust/JEV-9B; `chat` for base Qwen; `jevstyle-v1` for older chaoliangUNSW 2B |
| `CUEX_S1_LORA_ID` | `0` | Server adapter index; `none` omits adapter selection for servers without adapters |
| `CUEX_S1_LORA_SCALE` | `1` for JEV, otherwise `0` | Per-request adapter scale; the same server can compare JEV with the base model |
| `CUEX_S1_QUESTION_LANGUAGE` | `en` | `en` renders the fixed demo questions in English while preserving the Chinese state |

The client sends one `/completion` request per question with `n_predict: 1`, a restricted grammar, and token probabilities. It does not generate JSON or chain-of-thought. Chat models first use `/apply-template` (no inference); autotrust JEV uses the exact bare-v1 `[kind]`, `[state]`, `[question]`, `[options]`, `[decision]:` training prompt. Independent questions run in parallel. The shared state comes before the question and prompt caching is enabled. Start llama-server with multiple slots and continuous batching.

Autotrust JEV uses the published token IDs: `false`/`true` for `noul`, `0`–`5` for `score`, and `A`–`P` for up to 16 `choice` options. It adds the published decision-head bias to the token logprobs, divides by the per-kind calibration temperature, then applies softmax. Metadata is pinned in `autotrust-jev9b.json`. Chat readout uses `0`/`1`, `0`–`5`, and `A`–`Z`; the unrelated JevStyle v1 uses leading-space letter tokens. Readout supports current `probs/top_probs`, `top_logprobs`, and older `completion_probabilities` formats. Missing answer-token probabilities fail the request rather than inventing confidence. Probabilities are normalized over the declared labels; score value is the expected rating.

Use `encodeSystemOneState()` and `S1_QUESTION_IDS` from `contracts.ts`. Responding and drift inspect `recentSpeech`. Resolution inspects all `repSpeechSinceConcern`. A promise to answer is responding, but does not resolve a point. A prepared question remains valid until all its target points have been answered.

## Verify and evaluate

Run from `apps/server` with Node 22:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsc --noEmit -p .
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx --test test/system1.test.ts
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s1-eval.ts --heuristic --out /tmp/cuex-s1-heuristic.json
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s1-eval.ts --url http://127.0.0.1:18080 --backend qwen3.5-9b@win-vulkan --out /tmp/cuex-s1-qwen9.json
```

For JEV-9B use `--format jev-v1`; add `--english` to evaluate English questions over Chinese state. Base-model comparisons use `--format chat --lora-scale 0`. For the original JevStyle 2B GGUF, use `--format jevstyle-v1 --lora-scale 0` on a suitable server. The evaluation script has a 30-second deadline to measure slow machines without automatic fallback. It runs all six questions per state concurrently and excludes one warm-up decide. The 40 Chinese states are development examples derived from ANSHU, with partial speech, corrections, wrong generalizations, and candidate withdrawal. They are not a held-out test. Model selection evidence and Windows commands are in `MODELS.md` and `infra/windows/README.md`.

## Windows benchmark matrix

After Windows starts one base quant with the JEV LoRA loaded, run from `apps/server`:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s1-matrix.ts --quant Q4_K_M --out /tmp/cuex-s1-matrix
PATH=/opt/homebrew/opt/node@22/bin:$PATH CUEX_S1_REMOTE_TEST_URL=http://127.0.0.1:18080 npx tsx --test test/system1.test.ts
```

Q4_K_M is the selected demo quant. Q8_0 is stored on Windows for a later comparison; it is not the demo default. The matrix runs JEV Chinese questions, JEV English questions over Chinese state, and base-Qwen Chinese chat questions sequentially. It measures health HTTP RTT separately and saves raw decisions and summaries outside the repository. No model downloads or model execution run on the Mac.

The reconnecting tunnel is `bash scripts/s1-tunnel.sh`. It owns only its SSH child and reconnects when the link drops. The Windows model process is detached and has a separate lifecycle.

## Explicit response cue

For the ANSHU applicability concern, drift asks about overall endpoints/efficacy/safety versus age or renal subgroup details. Responding and drift use the latest speech segment. An explicit turn-back phrase (`我先回答`, `我直接回答`, or `不过我得先说明`) starts a new segment. The local response-cue guard keeps listening and invalidates a pending interruption, but never marks a clinical point answered. Such results name the backend with `+response-cue`; substantive answer probabilities still come from JEV.

## Natural elderly-dose answer

The demo's d1 point accepts a concrete elderly starting dose (`2.5 mg` / `2.5毫克`), a half-dose or lower-dose start, a dose-adjustment instruction, or an explicit lack of data. Promising to answer later does not resolve it. Both engines use the same narrow dose-answer cue after reading the actual rep speech. JEV results that use it append `+dose-cue`; this cue weight is a rule, not a calibrated JEV probability. The fact source remains the pack's `f-dose-elderly`.

The demo transport now uses one persistent `ssh -F ~/.ssh/rtx-home/ssh-config -T rtx-home` exec session with strict host-key checking. `s1-relay.mjs` carries loopback TCP to port 18080; the host rejects native `-L` forwarding. ASR is local to the Mac and has no Windows tunnel forward.

## Remaining-point drift check

For applicability, the responding question stays broad until at least one concern point is answered. It then names only the remaining points. The drift question covers general endpoints, safety, real-world results, convenience, adherence and cost. Clear drift (`p >= 0.85`) takes priority over marginal responding (`p < 0.70`), except when an explicit response cue is present. This cap changes no resolution answer. Results changed by this tie-break append `+drift-tiebreak` to the backend name.
