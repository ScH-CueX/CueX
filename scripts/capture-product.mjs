import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getChromium} from './browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets/captures');
await mkdir(out, {recursive:true});
const browser = await getChromium().launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
const errors=[];
page.on('pageerror', e=>errors.push(String(e)));
const requested=new Set(process.argv.slice(2));
const states=[['home','?view=home'],['live-listening','?view=live&t=12.2&jury=1&paused=1'],['live-holding','?view=live&t=28&jury=1&paused=1'],['live-asked','?view=live&t=33&jury=1&paused=1'],['live-ready','?view=live&t=53.5&jury=1&paused=1'],['live-withdrawn','?view=live&t=55.8&jury=1&paused=1'],['live-answered','?view=live&t=61.2&jury=1&paused=1'],['live-cue-amber','?view=live&t=28&assist=minimal&paused=1'],['live-cue-green','?view=live&t=55.8&assist=minimal&paused=1'],['review','?view=review&t=55.8']].filter(([name])=>requested.size===0||requested.has(name));
const previous=await readFile(path.join(out,'layout.json'),'utf8').then(JSON.parse).catch(()=>({states:{}}));
const layout=previous.states;
for (const [name,query] of states) {
  await page.goto(`http://127.0.0.1:5173/${query}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  if(await page.locator('[data-doctor-ready]').count())await page.waitForFunction(()=>[...document.querySelectorAll('[data-doctor-ready]')].every(el=>el.getAttribute('data-doctor-ready')==='true'));
  await page.waitForTimeout(2200);
  if(errors.length)throw new Error(`Capture stopped before replacing assets: ${errors.join('\n')}`);
  if(!await page.locator('#root').evaluate(el=>(el.textContent?.trim().length ?? 0)>40))throw new Error(`Application did not render: ${page.url()}`);
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true,scale:'css'});
  const dims=await page.evaluate(()=>({pageH:document.documentElement.scrollHeight,width:innerWidth}));
  layout[name]={...dims,fullImageScale:1,cutoutScale:2,url:page.url(),elements:{}};
  for(const id of ['doctor','transcript','decisions','timeline','active-utterance','candidate-quote','assist-controls']) {
    const el=page.locator(`[data-capture="${id}"]`);
    if(await el.count()) {layout[name].elements[id]=await el.boundingBox();await el.screenshot({path:path.join(out,`${name}-${id}.png`)});}
  }
  console.log(name, dims);
}
await writeFile(path.join(out,'layout.json'),JSON.stringify({capturedFrom:'CueX working tree',viewport:{width:1920,height:1080,scale:2},states:layout,errors},null,2));
await browser.close();
if(errors.length)throw new Error(errors.join('\n'));
