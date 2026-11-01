# Scenario synthesis and team library

Status: accepted scope; implementation choices below remain reviewable on the feature branch.

User instructions: implement real backend synthesis and a team experience library, let generated scenes enter training, back up and synchronize first, use a new branch and merge only after review. Follow-up: keep it simple, reuse existing backend AI code, deadline 12:00.

- Reuse Pi Agent, loadS2Runtime, runAgentGuarded and the existing session controller. The initial source is the existing ANSHU pack; no document-upload or new medical evidence pipeline is claimed.
- Single team and single server process. Existing deployment-level access protection applies to library routes, just as to the training gateway. No new accounts or roles. Require JSON for writes and reject cross-origin browser writes. Keep the documented protected deployment boundary.
- Persist experiences and generated scenario snapshots under the ignored runtime directory, atomically replacing one JSON file. Do not put team content in Git. No editing, deletion or multi-process coordination in this first version; each addition has a unique ID.
- Only a successful, validated real model result is saved. Provider errors, cancellation and invalid output do not produce a simulated success. A lost response may leave a saved scene visible in the library; a retry creates a new scene.
- Each WebSocket binds one scenario snapshot. Briefing, engines, ASR corrections, retry, doctor lines and memory use that snapshot. Unknown scenarios fail explicitly. Existing default scenario behavior remains compatible.
- New scenario doctor identities isolate memory. Medical facts and concern point definitions come from the source pack; experience influences communication, not medical evidence.
- Main remains untouched by feature development. Push only codex/scenario-synthesis-library for user review.

These technical choices are the minimal implementation of the requested workflow, not a production multi-tenant authorization or durable background-job system. No hooks installed.
