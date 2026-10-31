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
| `CUEX_S1_TIMEOUT_MS` | `600` | Total model decide deadline, including prompt formatting and all parallel questions |
| `CUEX_S1_BACKEND` | `llama.cpp` | Model/backend name in results, such as `qwen3.5-9b@win-vulkan` |
| `CUEX_S1_MODEL` | unset | Optional model alias for prompt formatting |
| `CUEX_S1_FORMAT` | `jev-v1` | `jev-v1` for autotrust/JEV-9B; `chat` for base Qwen; `jevstyle-v1` for older chaoliangUNSW 2B |
| `CUEX_S1_LORA_ID` | `0` | Server adapter index; `none` omits adapter selection for servers without adapters |
| `CUEX_S1_LORA_SCALE` | `1` for JEV, otherwise `0` | Per-request adapter scale; the same server can compare JEV with the base model |
| `CUEX_S1_QUESTION_LANGUAGE` | `zh` | `en` renders the fixed demo questions in English while preserving the Chinese state |

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
