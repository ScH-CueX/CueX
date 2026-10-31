import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(readFileSync(path.join(root,'assets/audio/narration/manifest.json'),'utf8'));
const fps=30;
const cues=manifest.map(voice=>{
  const file=path.join(root,'assets',voice.file);
  const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
  if(sha256!==voice.sha256)throw new Error(`Narration changed: ${voice.id}`);
  const seconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'}).trim());
  const from=voice.fromFrame;
  const to=Math.min(from+Math.ceil(seconds*fps)+6,from-8+voice.shotFrames);
  if(!Number.isInteger(from)||!Number.isFinite(seconds)||to<=from)throw new Error(`Invalid caption timing: ${voice.id}`);
  return {id:voice.id,from,to,text:voice.text.replace(/Cue\s+X/g,'CueX'),audio:voice.file,audioSha256:sha256,audioSeconds:seconds};
});
for(let i=1;i<cues.length;i++)if(cues[i].from<cues[i-1].to)throw new Error('Overlapping narration captions');
const dir=path.join(root,'assets/captions');mkdirSync(dir,{recursive:true});
writeFileSync(path.join(dir,'cinematic45.json'),JSON.stringify({fps,source:'Existing Ming narration; frame-aligned start with a 6-frame reading hold after each clip.',cues},null,2)+'\n');
const time=frame=>{const ms=Math.round(frame/fps*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
writeFileSync(path.join(dir,'AI+医疗健康-记性好了一点-视频.srt'),cues.map((cue,i)=>`${i+1}\n${time(cue.from)} --> ${time(cue.to)}\n${cue.text}\n`).join('\n'));
console.log(`Generated ${cues.length} captions from verified narration audio.`);
