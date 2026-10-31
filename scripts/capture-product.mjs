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
const states=[['home','?view=home'],['live-listening','?view=live&t=12.2&jury=1&paused=1'],['live-holding','?view=live&t=28&jury=1&paused=1'],['live-asked','?view=live&t=33&jury=1&paused=1'],['live-ready','?view=live&t=53.5&jury=1&paused=1'],['live-withdrawn','?view=live&t=55.8&jury=1&paused=1'],['live-cue-amber','?view=live&t=28&assist=minimal&paused=1'],['live-cue-green','?view=live&t=55.8&assist=minimal&paused=1'],['review','?view=review&t=55.8']].filter(([name])=>requested.size===0||requested.has(name));
const previous=await readFile(path.join(out,'layout.json'),'utf8').then(JSON.parse).catch(()=>({states:{}}));
const layout=previous.states;
for (const [name,query] of states) {
  await page.goto(`http://127.0.0.1:5173/${query}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(2200);
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
  const dims=await page.evaluate(()=>({pageH:document.documentElement.scrollHeight,width:innerWidth}));
  layout[name]={...dims,url:page.url(),elements:{}};
  for(const id of ['doctor','transcript','decisions']) {
    const el=page.locator(`[data-capture="${id}"]`);
    if(await el.count()) {layout[name].elements[id]=await el.boundingBox();await el.screenshot({path:path.join(out,`${name}-${id}.png`)});}
  }
  console.log(name, dims);
}
await writeFile(path.join(out,'layout.json'),JSON.stringify({capturedFrom:'CueX working tree',viewport:{width:1920,height:1080,scale:2},states:layout,errors},null,2));
await browser.close();
if(errors.length)throw new Error(errors.join('\n'));
