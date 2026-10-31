// Downloads every font listed in src/assets/manifest.json.
// The URLs are pinned to one google/fonts commit, so every machine gets the same files.
// Existing files are kept; pass --force to download again. FONT_ROOT overrides the output root.
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = process.env.FONT_ROOT ?? join(root, '..', 'assets');
const force = process.argv.includes('--force');
const manifest = JSON.parse(readFileSync(join(root, 'src/assets/manifest.json'), 'utf8'));

for (const [id, font] of Object.entries(manifest.fonts)) {
  const target = join(outRoot, font.file);
  if (!force && existsSync(target) && statSync(target).size > 0) {
    console.log(`keep ${font.file}`);
    continue;
  }
  const res = await fetch(font.url);
  if (!res.ok) throw new Error(`Font ${id}: HTTP ${res.status} for ${font.url}`);
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log(`got  ${font.file}`);
}
