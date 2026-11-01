# Response Tolerance Implementation Plan

> **For agentic workers:** Follow the existing delegated file ownership and verify each change through functional tests before deployment.

**Goal:** Deliver useful doctor replies and truthful visit reviews even when a successful model response omits optional fields or uses a different response envelope.

**Architecture:** Separate usable speech and outcome core fields from optional annotations. Keep one provider call on the normal path, preserve cancellation and session/revision checks, and never execute unknown tool actions. Use independent bounded turn/outcome budgets without changing follow-up timing or model/voice defaults.

**Tech Stack:** TypeScript, existing Pi Agent runtime, WebSocketGateway, Node feature tests, existing Live browser.

## Agent response boundary
- [ ] Update `apps/server/src/system2/DoctorTurnAgent.ts` and `apps/server/test/system2-turn.test.ts`.
- [ ] Reproduce missing basis/citations, a single unknown-tool response, successful plain spoken text and fenced structured output through public Pi calls.
- [ ] Make speech the required normal-turn field. Default absent action to reply and absent annotations to empty; do not infer progress from prose.
- [ ] Validate core review stance, doctor response, rationale and next step. Drop invalid optional strengths/gaps individually; preserve valid actual quotes. An invalid core remains unavailable, never fabricated.
- [ ] Preserve abort/error-output rejection and reject conflicting payloads. Keep bounded complete speech without clipping negations.

## Controller and budgets
- [ ] Update `apps/server/src/controller/TurnController.ts`, `apps/server/src/system2/PiSystemTwo.ts`, `apps/server/src/config.ts` and controller functional tests.
- [ ] Separate normal-turn/outcome engine limits from the existing follow-up/line limit; align outer budgets so they do not abort earlier.
- [ ] Keep recoverable retries in preparing state under the same logical task ID; only emit terminal error after bounded recovery fails. Cancel stale tasks without error. Accept identical final input as a new turn only after actual finished normal-reply playback.
- [ ] Log safe outcome failure categories, elapsed time and budgets, never dialogue text, credentials or provider URLs.

## Verification and delivery
- [ ] Run server typecheck and focused system2/controller/gateway/library functional suites using Node22 and the project tsx executable.
- [ ] Verify continuous same-session replies, including identical input after finished playback, then run at least three actual browser turns with Ming playback and a completed closing review on isolated ports.
- [ ] Commit and push only intended files, excluding runtime doctor memory.
- [ ] Stage an immutable new backend, retain the current public route until candidate acceptance, then switch connections without cutting active sessions. Verify public health/API/WebSocket and save exact release evidence.
