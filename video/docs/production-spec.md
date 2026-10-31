# CueX 45-second product film

## Approval and constraints
User explicitly selected 自主自由创作（推荐） in this conversation on 2026-11-01. Proceed through video-shotcraft stages without further creative approval. This is an iteration of the existing CueX film and product, retaining its X mark. The new PPT follows its own direction selection.

Delivery: MP4 H.264, 1920 × 1080, 30 fps, exactly 45 seconds, AAC voice audio, under 300 MB. Preserve the original 90-second composition as CueXPromo. New composition is CueXDemo45.

Audience: hackathon judges. Product: practice the moment a medical representative has to stop a prepared pitch and respond to a doctor's concern. Show the actual web application, including the demo-replay label. Data is the repository's fictional ANSHU-3 scenario. No private records or real patient data. Never present the footage as proof of live model latency or learning effectiveness.

## Direction
Candidates considered: (1) daylight clinic, (2) original dark technical theatre, (3) all-typographic manifesto. Select daylight clinic for product shots, with the original dark brand close as a deliberate short ending. Every product shot uses browser-captured pixels; no substitute UI is drawn in Remotion.

Tokens: ground #ecede8, surface #f6f6f2, ink #141716, muted #4a504d, held #d2461e, resolved #28604f. The inherited X uses #FF7A2F and #8E8CFF; retain only for brand identity. Fonts: local Noto Sans SC for UI and narration, Noto Serif SC for doctor voice, Instrument Serif for Cue wordmark. Square corners, restrained motion, no decorative flashes.

Movement: calm professional, 30–42-frame camera moves, cubic-bezier(0.55,0,0.18,1), readable holds. PageCam from video-shotcraft is copied locally and adapted. Product camera movement is custom because the product's three different behaviors need different holds; it does not claim exact reproduction of a gallery card. The review sequence borrows the pointer-leading-camera principle from cursor-flyover, read in full, rather than its four-station dashboard.

Audio: clear Mandarin narration. Do not include background music or decorative whooshes in this pitch cut; a live room needs to hear the product argument. Keep the original film's audio assets for the original composition. Narration is synthesized, normalized, and timed by shot. No claim of recorded live doctor audio.

## Requirement to execution
| Requirement | Execution |
| --- | --- |
| Related to actual frontend | Capture home, live replay, candidate state, review; preserve source labels |
| Keep the original X | Shared SVG plus original animated closing wordmark |
| About 45 seconds | Fixed 1350-frame timeline |
| Readable in a room | Crops bring relevant text forward; one caption at a time |
| Clear sound | Voice only, no competing music, normalized speech |
| All visual assets unified | Root assets holds fonts, brand, product captures, reference frames and audio |

## Storyboard and frame plan
| Shot | From | Duration | Screen and purpose | Main motion | Caption/voice | QA frames |
| --- | ---: | ---: | --- | --- | --- | --- |
| Problem | 0 | 165 | Real homepage hero | Slow push toward product proposition | 资料都背过了，可医生的追问，从不按准备稿来。 | 45, 140 |
| Enter | 165 | 195 | Real training screen, listening then holding | Reveal doctor and current concern | CueX，让医药代表在对话压力里，练习临场应对。 | 205, 320 |
| Interrupt | 360 | 240 | Holding then asked state, actual candidate panel | Shift attention from candidate to spoken dialogue | 持续偏离关切，医生会追问。快层判断时机，慢层提前准备。 | 420, 550 |
| Withdraw | 600 | 270 | Candidate ready, then withdrawn; concern resolved | Gentle push on change, hold the strikethrough | 但当你主动补上答案，已经准备好的追问，就不必再说。 | 665, 800 |
| Review | 870 | 300 | Actual review timeline and feedback, re-practice controls | One continuous guided tour with readable holds | 复盘回到刚才的关键时刻。减少提示，换一种问法，再练一次。 | 930, 1080 |
| Brand | 1170 | 180 | Existing animated CueX wordmark | Two crossing strokes; hold at least 2 seconds | CueX，让每一次临场应对，都有准备。 | 1230, 1320 |

Total: 1350 frames. Final capture occurs after the frontend rendering fixes. Per-element crops and layout.json share coordinates with full-page 2x captures. Static styleframes and final rendered contact sheets live in assets/qa.

Final readability revision: narration captions use 60 px type, source labels 32 px, ending tagline 60 px. Withdraw shot holds a 2x captured candidate-panel cutout after frame 770, following the real browser state transition, so its text remains sharp. Dynamic recordings use native 1920×1080 to preserve the actual viewport; a higher recorder canvas was rejected because it introduced padding. No frame from that rejected recording is used in the final capture.
