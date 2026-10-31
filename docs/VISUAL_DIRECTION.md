# CueX visual and motion direction

## User decisions in this session

The existing frontend's light consulting-room palette, composition and interaction structure stay in place. The user's correction was explicit: “我是说关于特效动效等 而不是深色空间什么的！ 不要破坏当前前端的设计”. Do not interpret borrowing the old film's taste as authorizing a dark frontend redesign.

The original film is the reference for motion craft: anticipation, interruption, two concurrent streams, candidate withdrawal, spatial transitions and a memorable X. The user asked for serif type and a more dimensional X. Changes must support these specific requests, preserving the current frontend design.

For the minimum-assistance mode, the user proposed a screen-perimeter light inspired by Mac fill-light applications: different colors and pulse cadence convey a cue without occupying the center of attention.

## Implemented perimeter cue

- Normal, relevant response: no light.
- Drift from the doctor's concern: cinnabar edge breath, 2.6-second cycle.
- Holding / interruption pressure: the same color, 1.6-second cycle.
- Self-correction that withdraws the question: one green breath, then silence.
- Full assistance and independent mode do not show this perimeter cue.
- Paused replay shows a static edge; reduced-motion preference also replaces pulses with a static low-intensity edge.

The light has no pointer events and does not change layout, background, content, keyboard focus or button hit areas. A concise screen-reader status accompanies phase changes. The mode selector remains available; the minimal mode removes the detailed text tray.

The current demonstration derives its cues from the existing replay states. It does not pretend that the unconnected main-branch live driver is producing those cues. A live adapter can later feed the same semantic phases.

## Delivery workflow

Use the dedicated branch `codex/cuex-cinematic-brand`; never push these changes to main. Fetch upstream before implementation checkpoints and before pushing. Commit subjects use `feat(scope): …` / `fix(scope): …`, with concrete dash-separated body items matching the user's example. Preserve unrelated existing lockfile and .claude work.
