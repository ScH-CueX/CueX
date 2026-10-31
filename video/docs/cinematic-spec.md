# CueX cinematic 45 — current delivery basis

Mode: autonomous creative production, selected by the user. Target: hackathon judges and medical-representative training users. Deliver MP4, 1920×1080, 30 fps, about 45 seconds, <=300 MB; BGM and no-BGM versions from the same timeline.

The reference is CueX's original 90-second film: `video/src/Promo.tsx`, `video/src/three/ArchField.tsx`, and `video/out/sheet-old.jpg`. No Gallery card variant was selected. Preserve its particle streams, wireframe core/gate, dimensional X, serif typography and deliberate pauses. The actual frontend remains a light clinic interface. The entire 45-second film now uses the same light clinic palette as the product. Use dark ink typography and darker orange/violet/green pigments with normal alpha blending; preserve the original film’s motion and depth. The user explicitly superseded the earlier dark-stage direction. Avoid solid 3D tubes, paragraphs of explanation and separate provenance/disclaimer footers.

| Time | Product information | Primary visual | Supporting text |
| --- | --- | --- | --- |
| 0–5 s | CueX trains medical representatives for unscripted dialogue | Conversation line changes direction; brand | 对话，不会按准备稿来 / 医药代表的临场应对训练 |
| 5–14 s | Doctor follows the conversation and can interrupt | Actual browser recording, enlarged question | 继续听 / 追问 / 先停一下 / 结论能用在他们身上吗 |
| 14–21 s | Fast judgment and parallel preparation are distinct | Original ArchField particles, core, output gate | System 1 判断 / System 2 准备 / 输出前复核 |
| 21–31 s | A question is withdrawn when the trainee supplies its answer | Real ready/answered states; answer cue reaches question; question dissolves | 已准备，未说出 / 这部分目前没有证据 / 撤销追问 / 继续听 |
| 31–39 s | Review a specific moment, practice with less help | Real timeline at 0:55, selected cue leads into minimal-assist view | 回到这一刻 / 主动补正 / 再练一次 / 少一点提示 |
| 39–45 s | Brand and team | Extruded beveled X | 让每一次临场应对，都有准备 / 记性好了一点 / AI+医疗健康 |

Source of truth: `video/src/cinema/Cinematic45.tsx`, including scene/audio timing. Captures are actual UI from the frozen 68-second training replay; URLs/crops are in `assets/captures/layout.json`, recordings in `recordings.json`. ANSHU-3 is fictional training data; no patient record, actual efficacy claim or measured learning improvement is presented. Visible disclaimer footers were explicitly removed by user request. Functional product controls remain.

Six narration clips use Ming-3.0-tts-0.5b on the user's Windows RTX 5080. `assets/audio/narration/manifest.json` records copy, source, timing and hashes. Narrator: built-in 灵小柔; runtime doctor: built-in 灵楷; no voice cloning. BGM is the existing synthesized ambient bed with bounded fades. Whoosh author, CC0 license and processing are under `assets/audio/cinematic/` and `video/docs/sfx-processed-analysis.json`. Source peak 0.875 s is offset 26 frames to align with the action; this is source-peak alignment, not measured output latency.

Review the rendered MP4, not only source or stills. Report readability, overlays, asset loading, cause/effect, pacing and audible defects. Distinguish technical audio measurements from actual audition; mark unavailable checks honestly.

## Narration captions

Six synchronized serif caption cues are generated from the verified narration manifest and measured final WAV durations. Canonical timing/text and SRT live in `assets/captions/`. Each cue starts with its audio clip and has a six-frame reading hold. The user explicitly requested smaller subtitles with a more transparent background after seeing the initial 64 px version: final caption font size is 44 px. The later image reference explicitly sets white text with a light dark outline/shadow and a tight translucent black backplate: opacity .58, bottom inset 48 px, padding 7×18 px. This user choice supersedes the skill’s generic 56 px minimum for narration captions; existing primary scene titles retain their previous sizes. A dedicated bottom area avoids covering UI or labels. Workbench and film use the same caption component.
