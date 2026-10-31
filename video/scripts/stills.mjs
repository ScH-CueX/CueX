// Usage: node scripts/stills.mjs 120 480 900 ...
// Writes out/stills/f<frame>.jpg. One bundle and one browser serve every frame.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frames = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const compId = process.env.COMP ?? 'CueXPromo';
const outDir = join(root, 'out/stills');
mkdirSync(outDir, {recursive: true});

const serveUrl = await bundle({entryPoint: join(root, 'src/index.ts'), publicDir: join(root, '..', 'assets')});
const chromiumOptions = {gl: 'angle'};
// REMOTION_BROWSER points at a local Chrome when the headless shell can't be downloaded.
const browser = await openBrowser('chrome', {chromiumOptions, browserExecutable: process.env.REMOTION_BROWSER ?? null});
const composition = await selectComposition({serveUrl, id: compId, puppeteerInstance: browser, chromiumOptions});
for (const frame of frames) {
  const output = join(outDir, `f${String(frame).padStart(4, '0')}.jpg`);
  await renderStill({composition, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 88, puppeteerInstance: browser, chromiumOptions});
  console.log('wrote', output);
}
await browser.close({silent: true});
