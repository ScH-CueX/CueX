import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function buildRoadshow(output=path.join(root,'ppt/out/CueX-记性好了一点-联动路演.html'),movie='../../video/out/AI+医疗健康-记性好了一点-视频.mp4'){
  const html=readFileSync(path.join(root,'ppt/out/CueX-记性好了一点-PPT.html'),'utf8');
  const start=html.indexOf('<body>'),end=html.lastIndexOf('</body>');
  if(start<0||end<start)throw new Error('Export the five-page presentation first.');
  const content=html.slice(start+6,end);
  const head=html.slice(0,start);
  const result=`${head}<style>
html,body{width:100%!important;height:100%!important;overflow:hidden;background:#ECEDE7!important}
#slides{position:absolute;left:50%;top:50%;width:984px;height:275.52px;transform:translate(-50%,-50%) scale(var(--fit,1));user-select:none;cursor:pointer}
#slides .print-page{position:absolute!important;inset:0!important;display:none;break-after:auto}
#slides .print-page.active{display:block}
#film{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#ECEDE7;display:none}
nav{position:fixed;z-index:10;bottom:12px;right:20px;display:flex;gap:12px;align-items:center;padding:8px 14px;background:#ecede7ec;border:1px solid #cad0c6;font:18px CueXFilmSerif,serif;opacity:0;transition:opacity .2s}
body:hover nav,nav:focus-within{opacity:1}button{border:0;background:none;color:#263d31;font:inherit;cursor:pointer;padding:4px 8px}button:focus-visible{outline:2px solid #685397}
</style><body><main id="slides">${content}</main><video id="film" controls playsinline preload="metadata"></video><nav aria-label="路演导航"><button id="prev" aria-label="上一步">←</button><span id="position"></span><button id="next" aria-label="下一步">→</button><button id="full" aria-label="全屏">全屏</button></nav><script>
const pages=[...document.querySelectorAll('.print-page')],film=document.getElementById('film'),slides=document.getElementById('slides');
film.src=${JSON.stringify(movie)};
const sequence=[0,1,'film',2,3,4];let step=0;
function fit(){document.documentElement.style.setProperty('--fit',Math.min(innerWidth/984,innerHeight/275.52));}
function go(n){step=Math.max(0,Math.min(sequence.length-1,n));const item=sequence[step];document.body.dataset.step=String(step);pages.forEach((p,i)=>p.classList.toggle('active',i===item));slides.style.display=item==='film'?'none':'block';film.style.display=item==='film'?'block':'none';document.getElementById('position').textContent=item==='film'?'45 秒产品演示':String(item+1)+' / 5';if(item==='film'){film.currentTime=0;film.play().catch(()=>{film.controls=true;});}else film.pause();}
function full(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}
document.getElementById('prev').onclick=()=>go(step-1);document.getElementById('next').onclick=()=>go(step+1);document.getElementById('full').onclick=full;
slides.onclick=()=>go(step+1);film.onended=()=>go(3);
addEventListener('resize',fit);addEventListener('keydown',e=>{if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();go(step+1);}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(step-1);}else if(e.key===' '){e.preventDefault();if(sequence[step]==='film'){if(film.paused)film.play();else film.pause();}else go(step+1);}else if(e.key.toLowerCase()==='f')full();});
fit();go(0);
</script></body></html>`;
  mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,result);return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(buildRoadshow());
