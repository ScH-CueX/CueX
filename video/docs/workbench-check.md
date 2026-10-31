# Cinematic light workbench verification

The workbench uses the same six `CINEMA_UNITS`, timing, narration and SFX tables as the delivered film. Revision: `cinematic-light-captions-3`. The caption track exposes font size, bottom inset, and backplate opacity. Source assets are linked through `video/public -> ../assets`. Local editor: http://localhost:5198/?import=project .

Final light-theme parity checks at frames 100, 550, 990 and 1300 reported 0 pixels above the per-channel tolerance out of 2,073,600 for each frame (maximum channel difference 0, 1, 2 and 0). The original composition and untouched imported project match at these representative frames. Earlier checks also covered conversation, withdrawal and the review entrance.

The project includes narration, two whoosh cues and an ambient BGM track. The no-BGM variant preserves narration and SFX. Final delivery uses the same encoded visual stream in both variants; the independent review verifies its hash and packet timing. These checks do not certify arbitrary later edits made in the workbench.

Caption-version parity at frames 210, 470 and 975: 0 pixels above tolerance on every frame; maximum channel differences 1, 2 and 2. Narration captions use the same component and source timing in the original film and imported workbench.
