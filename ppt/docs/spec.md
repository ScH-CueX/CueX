# CueX pitch brief

User brief, 2026-11-01 Asia/Shanghai. Team: 记性好了一点. Captain: 路皓然. Teammate: 任逸康. Track: AI + 医疗健康, 信达生物「销售培训 · 医药代表智能演练助手」.

Audience: hackathon judges and an in-person audience, 3 minute talk including roughly 45 seconds of video; 2 minute Q&A follows. Make the product legible from the back of a room. Five pages maximum.

Delivery: PDF with exact 10.25 : 2.87 aspect ratio. Design a 2050 × 574 content canvas. PDF page 10.25 × 2.87 inches. open-slide is the authoring and presentation framework. Its 16:9 preview may letterbox the wide content; the submission exporter must export only the wide content without that letterbox. Source project lives in `ppt/`; all media comes from root `assets/`.

Filename: CueX-记性好了一点-PPT.pdf. Video: AI+医疗健康-记性好了一点-视频.mp4. ZIP later: AI+医疗健康-CueX-路皓然.zip.

Core content:
- CueX, 医药代表的临场应对训练.
- Problem: 背熟资料，仍可能接不住医生的追问。训练停止原稿、听懂关切、重选信息、准确回应。
- Experience: 回应关切时继续听；持续偏离时追问；主动补答时撤销尚未说出口的追问。
- Architecture: System 1 高频小判断；System 2 并行准备；Controller 输出前复核。候选与真实对话分离。
- Loop: 演练、具体片段复盘、减少辅助、变式重练。Long-term independent ability is the direction, not a proven educational result.

Present only evidence-backed implementation status. Main currently has a deterministic 68-second demonstration. The realtime branch has further engine implementations and tests; do not imply the recorded demonstration is a live model benchmark. Clinical study ANSHU-3 and its numbers are fictional demo data. Do not invent clinical efficacy, users, revenue, educational outcomes, or latency.

Two representative pages per direction before full-deck selection: cover + how the core interaction works. Equal content across directions. Cover includes team and the two names. Do not put the captain phone number on public design previews; it belongs in submission contact information, separate from the public visuals.

Shared imagery: actual product screenshots under assets/captures (main agent will provide home.png, live-holding.png, live-withdrawn.png, review.png). Brand: assets/brand/cuex-symbol.svg, extracted from the original film; do not invent a different logo. Fonts: assets/fonts/NotoSansSC-VF.ttf, NotoSerifSC-VF.ttf, InstrumentSerif-Regular.ttf.

Readable wide-screen type: hero 72–100 px, body 28–36 px, labels 20–24 px at 2050 × 574. Keep text concise and margins at least 54 px. No page numbering inside slides; the framework owns navigation.
