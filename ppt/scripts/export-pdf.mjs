import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {getChromium} from '../../scripts/browser-runtime.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=process.argv[2] ?? 'cuex-pitch';
const count=Number(process.argv[3] ?? (id==='cuex-pitch'?5:2));
const name=process.argv[4] ?? (id==='cuex-pitch'?'CueX-记性好了一点-PPT':`${id}-方向预览`);
if(!Number.isInteger(count)||count<1||count>5)throw new Error('Use 1–5 pages.');
const out=path.join(project,'out');await mkdir(out,{recursive:true});
const browser=await getChromium().launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const sections=[];let css='';
for(let n=1;n<=count;n++){
  await page.goto(`http://localhost:5180/s/${encodeURIComponent(id)}/preview?p=${n}`,{waitUntil:'networkidle'});
  await page.locator('.cuex-wide').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.cuex-wide canvas')].every(c=>getComputedStyle(c).display==='none'||c.getAttribute('data-3d-ready')==='true'));
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const content=await page.locator('.cuex-wide').evaluate(el=>{
    const clone=el.cloneNode(true);const cs=getComputedStyle(el);
    for(const key of cs)if(key.startsWith('--osd'))clone.style.setProperty(key,cs.getPropertyValue(key));
    const originals=[...el.querySelectorAll('canvas')];
    [...clone.querySelectorAll('canvas')].forEach((canvas,index)=>{
      const image=document.createElement('img');
      for(const attribute of canvas.attributes)image.setAttribute(attribute.name,attribute.value);
      image.src=originals[index].toDataURL('image/png');
      canvas.replaceWith(image);
    });
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
const rawPdf=await page.pdf({width:'10.25in',height:'2.87in',margin:{top:0,bottom:0,left:0,right:0},printBackground:true,preferCSSPageSize:true});
await browser.close();

// Chromium rounds this page height to 206.88 pt. Trim its blank edge only;
// keep all content at its existing scale and enforce the exact 10.25 × 2.87 in box.
const pdf=await PDFDocument.load(rawPdf,{updateMetadata:false});
if(pdf.getPageCount()!==count)throw new Error(`Expected ${count} PDF pages; got ${pdf.getPageCount()}.`);
const target={width:738,height:206.64};
const correction=pdf.getPages().map((pdfPage,index)=>{
  const before=pdfPage.getMediaBox();
  if(Math.abs(before.width-target.width)>.5||Math.abs(before.height-target.height)>.5)throw new Error(`Unexpected page box on page ${index+1}: ${JSON.stringify(before)}`);
  pdfPage.setMediaBox(0,0,target.width,target.height);
  pdfPage.setCropBox(0,0,target.width,target.height);
  pdfPage.setTrimBox(0,0,target.width,target.height);
  return {page:index+1,before,after:pdfPage.getMediaBox(),trimmedWidthPt:before.width-target.width,trimmedHeightPt:before.height-target.height};
});
await writeFile(path.join(out,`${name}.pdf`),await pdf.save({useObjectStreams:false}));
await writeFile(path.join(out,`${name}-page-size.json`),JSON.stringify({targetInches:{width:10.25,height:2.87},contentScaled:false,correction},null,2));
console.log(path.join(out,`${name}.pdf`));
