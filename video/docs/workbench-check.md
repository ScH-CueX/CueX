# Editable workbench verification

The video-shotcraft workbench is linked to this video's `src/workbench.ts` and the single root asset directory via `video/public -> ../assets`.

Browser page http://localhost:5198/?import=project loaded without page errors. The project is split into six shot clips, caption clips, and narration audio clips. It contains no BGM track by design.

The skill's parity procedure was run with the installed Chrome executable and Python/Pillow selected explicitly. Frames 150, 800 and 1320 matched the original composition with 0 differing pixels out of 2,073,600 on each frame. This verifies the tested frames of the reconstructed workbench composition, not arbitrary later edits made in the UI.

The local workbench uses its own Remotion version and dependencies. Additional @remotion/fonts and @remotion/paths packages were installed in that workbench for this project's existing brand and font components. The CueX project dependencies were not changed for that purpose.
