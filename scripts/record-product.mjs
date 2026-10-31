import {mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getChromium} from './browser-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'assets/captures');
await mkdir(path.join(dir,'raw'),{recursive:true});
const browser=await getChromium().launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const records=[];
for(const shot of [{id:'live-interrupt',t:26.5,seconds:8},{id:'live-withdraw',t:50.5,seconds:9}]) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:path.join(dir,'raw'),size:{width:1920,height:1080}}});
  const zero=performance.now();
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:5173/?view=live&t=${shot.t}&jury=1&paused=1`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1800);
  const at=(performance.now()-zero)/1000;
  await page.getByRole('button',{name:'播放',exact:true}).click();
  await page.waitForTimeout(shot.seconds*1000+350);
  const video=page.video();
  await context.close();
  const raw=await video.path();
  execFileSync('ffmpeg',['-y','-v','error','-i',raw,'-ss',at.toFixed(3),'-t',String(shot.seconds),'-vf','fps=30','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-an','-movflags','+faststart',path.join(dir,`${shot.id}.mp4`)]);
  records.push({...shot,source:'real browser recording of the web replay',url:page.url(),trimOffsetSeconds:at,errors});
  console.log(shot.id,'recorded',shot.seconds,'seconds');
  if(errors.length)throw new Error(errors.join('\n'));
}
await writeFile(path.join(dir,'recordings.json'),JSON.stringify(records,null,2));
await browser.close();
