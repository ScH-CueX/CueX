// Prints every asset in src/assets/manifest.json with its status and whether the file exists.
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'src/assets/manifest.json'), 'utf8'));
const rows = [];
for (const [group, entries] of Object.entries(manifest)) {
  if (group.startsWith('$')) continue;
  for (const [id, entry] of Object.entries(entries)) {
    const path = entry.file ? join(root, '..', 'assets', entry.file) : join(root, entry.component);
    rows.push({group, id, status: entry.status, exists: existsSync(path) ? 'yes' : 'MISSING', path: entry.file ?? entry.component});
  }
}
console.table(rows);
const placeholders = rows.filter((r) => r.status !== 'final').length;
console.log(`${rows.length} assets, ${placeholders} placeholder(s).`);
if (rows.some((r) => r.exists === 'MISSING')) process.exitCode = 1;
