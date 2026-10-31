import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {PDFDocument} = require(require.resolve('pdf-lib', {paths: [path.join(root, 'ppt')]}));
const run = (command, args) => execFileSync(command, args, {cwd: root, encoding: 'utf8'});
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const repository = 'https://github.com/ScH-CueX/CueX';

run('git', ['diff', '--quiet']);
run('git', ['diff', '--cached', '--quiet']);
run(process.execPath, ['scripts/check-public-data.mjs']);
const sourceRef = process.argv[2] ?? 'HEAD';
run('git', ['diff', '--quiet', sourceRef, 'HEAD']);
const revision = run('git', ['rev-parse', sourceRef]).trim();

const title = 'AI+医疗健康-CueX-路皓然';
const pdfName = 'CueX-记性好了一点-PPT.pdf';
const videoName = 'AI+医疗健康-记性好了一点-视频.mp4';
const pdfPath = path.join(root, 'ppt/out', pdfName);
const videoPath = path.join(root, 'video/out', videoName);
const pdf = await PDFDocument.load(readFileSync(pdfPath));
if (pdf.getPageCount() < 1 || pdf.getPageCount() > 5 || pdf.getPages().some(page =>
  Math.abs(page.getWidth() - 738) > .001 || Math.abs(page.getHeight() - 206.64) > .001
)) throw new Error('PDF must contain 1–5 exact 10.25 × 2.87 inch pages.');

const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath]));
const video = info.streams.find(stream => stream.codec_type === 'video');
const audio = info.streams.find(stream => stream.codec_type === 'audio');
if (!video || video.width < 1920 || video.height < 1080 || video.width * 9 !== video.height * 16 ||
  !audio || Math.abs(Number(info.format.duration) - 45) > .1 || statSync(videoPath).size > 300_000_000
) throw new Error('The submission video must be 16:9, at least 1080p, about 45 seconds, with audio and at most 300 MB.');
run('ffmpeg', ['-v', 'error', '-i', videoPath, '-f', 'null', '-']);

// Keep the complete document text offline. Figures and repository references
// become links, so the submission does not need a second copy of the asset tree.
function offlineMarkdown(source) {
  const githubLink = target => {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) return target;
    const [file, anchor] = target.split('#');
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(source), file));
    const local = path.join(root, relative);
    const kind = existsSync(local) && statSync(local).isDirectory() ? 'tree' : 'blob';
    return `${repository}/${kind}/main/${encodeURI(relative)}${anchor ? `#${anchor}` : ''}`;
  };
  const text = readFileSync(path.join(root, source), 'utf8')
    .replace(/\[!\[([^\]]*)\]\[[^\]]+\]\]\[([^\]]+)\]/g, '[$1][$2]')
    .replace(/\[!\[([^\]]*)\]\[([^\]]+)\]\]\([^)]+\)/g, '[$1][$2]')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)')
    .replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, '[$1][$2]')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, target) => `[${label}](${githubLink(target)})`)
    .replace(/^(\[[^\]]+\]:\s*)(\S+)/gm, (_, prefix, target) => prefix + githubLink(target))
    .replace(/href="([^"]+)"/g, (_, target) => `href="${githubLink(target)}"`);
  return `[GitHub 文件](${repository}/blob/main/${source})\n\n${text}`;
}

const out = path.join(root, 'deliverables');
mkdirSync(out, {recursive: true});
const stage = mkdtempSync(path.join(out, '.stage-'));
const folder = path.join(stage, title);
mkdirSync(folder);
cpSync(pdfPath, path.join(folder, pdfName));
cpSync(videoPath, path.join(folder, videoName));
writeFileSync(path.join(folder, 'README.md'), offlineMarkdown('README.md'));
writeFileSync(path.join(folder, '运行说明.md'), offlineMarkdown('docs/RUNNING.md'));

const names = [pdfName, videoName, 'README.md', '运行说明.md'];
const files = names.map(name => ({path: name, bytes: statSync(path.join(folder, name)).size, sha256: sha(path.join(folder, name))}));
const stagedZip = path.join(stage, `${title}.zip`);
// Check the ZIP and its extracted files before replacing the previous bundle.
run('python3', ['-c', `import hashlib,json,pathlib,sys,zipfile
folder=pathlib.Path(sys.argv[1]); archive=pathlib.Path(sys.argv[2]); expected=json.loads(sys.argv[3])
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for item in expected: z.write(folder/item['path'],pathlib.Path(folder.name)/item['path'])
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert set(z.namelist())=={folder.name+'/'+item['path'] for item in expected}
 target=archive.parent/'extracted';z.extractall(target)
 for item in expected:
  data=(target/folder.name/item['path']).read_bytes()
  assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256']
`, folder, stagedZip, JSON.stringify(files)]);

const destination = path.join(out, title);
const zip = path.join(out, `${title}.zip`);
if (existsSync(destination)) renameSync(destination, path.join(stage, 'previous-folder'));
if (existsSync(zip)) renameSync(zip, path.join(stage, 'previous.zip'));
renameSync(folder, destination);
renameSync(stagedZip, zip);
const report = {
  revision, createdAt: new Date().toISOString(),
  pdf: {pages: pdf.getPageCount(), widthPt: 738, heightPt: 206.64},
  video: {duration: Number(info.format.duration), width: video.width, height: video.height, bytes: statSync(videoPath).size, audio: audio.codec_name},
  files, zipBytes: statSync(zip).size, zipSha256: sha(zip), extractedAndVerified: true,
};
writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
rmSync(stage, {recursive: true});
console.log(JSON.stringify({folder: destination, zip, ...report}, null, 2));
