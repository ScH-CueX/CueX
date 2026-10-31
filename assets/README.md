# CueX shared assets

All authored media lives in this directory. The web app uses it as Vite's public directory; the video uses it as Remotion's public directory; the presentation uses it through open-slide's `assetsDir`.

- `brand/`: the crossing-stroke X taken from the original CueX film. Amber = the quick decision stroke; lavender = the slower preparation stroke. SVG is the master, with a monochrome variant for small or print use.
- `fonts/`: local fonts, so the product and deliverables do not require Google Fonts at presentation time.
- `models/`, `images/`, `env/`: existing product and film media.
- `audio/`: voice, music, and sound effects, with provenance in the film manifest.
- `captures/`: captured product screens, cutouts, and layout measurements.
- `qa/`: rendered preview images and contact sheets; generated, not source artwork.

Build output may contain derived copies. Do not edit those copies or maintain additional source assets in the web/video/ppt projects.
