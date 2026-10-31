import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getChromium} from '../../scripts/browser-runtime.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=process.argv[2] ?? 'dir-clinic';
const count=Number(process.argv[3] ?? 2);
const name=process.argv[4] ?? `${id}-方向预览`;
if(!Number.isInteger(count)||count<1||count>5)throw new Error('Use 1–5 pages.');
const out=path.join(project,'out');await mkdir(out,{recursive:true});
const browser=await getChromium().launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const sections=[];let css='';
for(let n=1;n<=count;n++){
  await page.goto(`http://localhost:5180/s/${encodeURIComponent(id)}/preview?p=${n}`,{waitUntil:'networkidle'});
  await page.locator('.cuex-wide').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const content=await page.locator('.cuex-wide').evaluate(el=>{
    const clone=el.cloneNode(true);const cs=getComputedStyle(el);
    for(const key of cs)if(key.startsWith('--osd'))clone.style.setProperty(key,cs.getPropertyValue(key));
    for(const img of clone.querySelectorAll('img'))img.src=new URL(img.getAttribute('src'),document.baseURI).href;
    return {html:clone.outerHTML,css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n')};
  });
  css=content.css;sections.push(content.html);
}
let html=`<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><title>${name}</title><style>${css}
@page{size:10.25in 2.87in;margin:0}html,body{margin:0!important;padding:0!important;width:984px!important;background:white!important}.print-page{width:984px;height:275.52px;overflow:hidden;position:relative;break-after:page}.print-page:last-child{break-after:auto}.cuex-wide{position:relative!important;left:0!important;top:0!important;margin:0!important;transform:scale(.48)!important;transform-origin:top left!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style><body>${sections.map(s=>`<div class="print-page">${s}</div>`).join('')}</body></html>`;
// Inline only the resources referenced by the rendered deck, for offline review.
const urls=[...new Set([...html.matchAll(/(?:src=["']|url\(["']?)(https?:\/\/[^"')\s>]+)/g)].map(m=>m[1]))];
for(const url of urls){const res=await fetch(url);if(!res.ok)throw new Error(`Asset ${res.status}: ${url}`);const mime=res.headers.get('content-type')??'application/octet-stream';const data=`data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;html=html.split(url).join(data);}
await writeFile(path.join(out,`${name}.html`),html);
await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
await page.pdf({path:path.join(out,`${name}.pdf`),width:'10.25in',height:'2.87in',margin:{top:0,bottom:0,left:0,right:0},printBackground:true,preferCSSPageSize:true});
await browser.close();console.log(path.join(out,`${name}.pdf`));
