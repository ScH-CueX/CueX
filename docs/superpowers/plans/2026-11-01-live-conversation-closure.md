# Natural conversation closure implementation plan

**Goal:** Let a visitor speak naturally, pause, answer incompletely or incorrectly, ask a question, and end the visit without depending on an interruption trigger.

**Architecture:** Keep incremental System 1 / speculative follow-ups. Add a separate System 2 normal-turn operation grounded in the doctor profile, heard history and pack. The Controller owns quiet timers, one output slot, cancellation, validated point progress, and closing. ASR final is a hint, not immediate permission to speak: a short quiet window absorbs segment tails. Do not change UI into a script or invent doctor transcripts.

**Stack:** Existing TypeScript gateway, Pi Agent and audio playback reports. No new dependencies or retrieval framework.

## 1. Shared server contract (root)
- Add `DoctorTurnRequest` with session, pack, current concern, resolved points, heard history, rep text, trigger (`turn_end` or `silence`), silence stage and AbortSignal.
- Add `DoctorTurnDraft`: spoken text, action (`reply` or `end_visit`), resolved point IDs, contradicted point IDs, basis, source evidence.
- Add optional `SystemTwo.prepareTurn`; optional preserves older injected fixtures. Real PiSystemTwo implements it.

## 2. Normal-turn agent (turn-response worker)
- New `system2/DoctorTurnAgent.ts`, integrate `PiSystemTwo.ts`; reuse runtime/doctor store/guarded Pi Agent helpers.
- Write offline scripted-model tests before implementation, plus an opt-in live probe.
- Ground supported facts strictly in pack. Treat representative speech as claims, not evidence. Specific wrong claims are not answers. Do not supply fabricated patient cases or agree that eGFR30–60 results are poor.
- Reply to partial/vague answers, uncertainty, direct questions, disagreement and greetings. Ask one specific question at a time; supply a helpful cue if stalled. Explicit farewell yields a neutral closing without claiming all questions resolved.
- No fixed normal-turn script. Return nonempty short speech and validated point IDs; reject unknown IDs.

## 3. Controller scheduling and progress (controller worker)
- Red tests through real WebSocketGateway with injected engines: short on-topic final produces reply even with no drift; vague/wrong answer gets clarification; silence after doctor playback prompts; final followed by more ASR cancels pending reply; cancellation during generation/TTS emits no stale reply; no unsolicited prompt loop; early goodbye closes with unresolved review.
- Final quiet window ~1100ms; changed partial quiet window ~1800ms for trailing fragments. New speech cancels old normal-turn work. Do not treat duplicate partial callbacks as fresh speaking.
- Idle timer starts after actual doctor playback, never while audio is playing. First idle cue ~7s, second ~12s, then neutral close ~20s; bounded and reset by actual rep speech. Test with injected shorter timings.
- One active speech/output arbiter across interruption, normal reply, transition and closing. Genuine barge-in preserved. Do not add normal-turn replies to follow-up candidate history.
- For capable System 2, final grounded turn assessment validates progress before advancing/closing; wrong or unsupported claims must not become permanently resolved merely because S1 sees a topic keyword. Reconcile contradicted IDs and preserve correct prior answers. Legacy injected System2 fixtures retain old path.
- Agent errors produce a bounded retry/error path, never indefinite listening or fake success.

## 4. Acceptance (root + controller)
- Run TypeScript and focused deterministic suites. Preserve prior interrupt/withdraw/review/retry tests.
- Real scenario matrix: greet, ask what to cover, answer “结果不是特别好”, say “不知道”, pause mid-answer, ask doctor a question, self-correct, answer correctly, say goodbye. No prescribed success phrases.
- Distinguish gateway, browser, physical microphone, public deployment acceptance. Test light live view and stage because both share backend.

## 5. Release (root)
- Review exact diffs and commit on main, excluding runtime MEMORY.md.
- Deploy only after focused and real-turn checks. Preserve Cloudflare/public routes and model services. Restart only owned public backend.
- Public smoke verifies real reply after short turn and silence, then clean ending. Report remaining boundaries explicitly.


## User clarification: Live only and persuasion as the training objective
- Canonical exercise is `/?view=live` with the existing doctor avatar and light design. Old `stage` links redirect to Live; remove Stage from user-facing entry points, not the homepage.
- Live defaults to real mode; replay is explicit only. Keep a light optional source-material preparation view, no duplicate stage screen.
- Show real System 1 judgment/reason and System 2 normal-reply/silence/assessment activity in a restrained view. No model names, hardware or timing badges.
- Add `visit.end` for graceful user-requested closing. `session.stop` remains immediate cancellation.
- `system2.activity` reports actual generation state; `conversation.progress` replaces the resolved-point set after grounded validation. UI must not preserve retracted false claims.
- `VisitEndedPayload.outcome` uses `VisitOutcome`: completed/unavailable assessment, stance willing_to_continue/needs_evidence/not_convinced, doctor statement, rationale, quote-supported strengths/gaps and next step. Acknowledgement is not prescribing; correctness/pointcount is not persuasion. Agent evaluation uses only actual heard dialogue and pack facts. Failure is explicitly unavailable, never a fabricated success or negative.
- Live review renders actual outcome and the real key moments, with retry and next visitor inside the same Live flow. No static ReviewView used as a real result.
- Verify root/stage links resolve to the one Live exercise; wrong-answer, stalled, partial, question, interrupted and explicit-end flows produce real replies/outcomes.


## System 2 product architecture and README
- Reuse pi-agent-core Agent lifecycle, tool execution, abort and provider adapters. No new low-level agent runtime.
- Product-owned layers: doctor PROFILE.md and light MEMORY.md context; sourced research/label facts and lookup; normal clinical dialogue and claim verification; concurrent cancellable follow-up preparation; evidence-backed end-of-visit persuasion outcome.
- README describes CueX product capabilities and a concrete dialogue example: doctor persona, professional knowledge, live judgment, revocable follow-ups and persuasion outcome. Keep it short. Omit low-level framework discussion and defensive comparisons; keep technical checks internal. Add product descriptions after the corresponding implementation checks pass.
- User explicitly says current interruption works well: no more S1 tuning in this change. Acceptance focuses on unprompted normal dialogue, clinical knowledge, observability, graceful completion, and truthful persuasion result.

## README scope limit
- Preserve the existing README structure. "Set up" was a speech-recognition error, not a requested section.
- After implementation is verified, make small additions in 产品与使用方式 for knowledgeable doctor dialogue, natural turn progression and evidence-backed persuasion results. Update 一次实时对话如何流转 only as needed to reflect System 2 responsibilities and the Live-only entry. Do not rewrite unrelated sections or add low-level explanations or defensive disclaimers.

## Implementation choices from primary-source review
- Keep the existing Pi runtime and one normal-turn call for this iteration. Use small scenario-local `pointRequirements` instead of a general rubric engine.
- Separate complete, partial, uncertain and contradicted evidence. Progress requires cited representative statements. Assessment format errors must not discard an otherwise validated spoken reply.
- Start idle timers from actual playback reports. A playback watchdog reports transport failure; it must not infer that generated audio was heard.
- Compare existing text models and TTS adapters in isolated runs before changing defaults. Current Ming and Edge adapters return complete audio files; switching the backend alone does not enable incremental audio playback.
- Consider streamed speech and a parallel assessment only after measured first-audio gains justify the extra cancellation and state-commit paths.

Primary sources reviewed:
- Pi AI schemas and streaming: https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
- Schema-Guided Dialogue state and required information: https://github.com/google-research-datasets/dstc8-schema-guided-dialogue
- Simple workflows and parallel tasks: https://www.anthropic.com/engineering/building-effective-agents
- LiveKit audio lifecycle: https://docs.livekit.io/agents/multimodality/audio/
- Pipecat TTS and interruptions: https://docs.pipecat.ai/pipecat/learn/text-to-speech and https://docs.pipecat.ai/pipecat/fundamentals/interruptions

## Knowledge policy clarified by the user
- The doctor may use general medical knowledge to explain concerns and answer questions. The material pack is not a whitelist for every spoken statement or number.
- Check claims specifically attributed to the fictional drug, trial or label against the scenario materials. General knowledge must not be presented as evidence obtained by this fictional study.
- Keep actual dialogue quotations accurate. Scenario point progress is supporting feedback; natural, useful conversation and a credible persuasion judgement remain the main goal.
- Prefer fewer external rules as model capability improves. Remove blanket spoken-number rejection rather than adding another medical classifier.
