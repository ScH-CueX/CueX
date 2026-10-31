import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import { useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import dimensionalX from '../../../assets/brand/x-dimensional.png';
import symbol from '../../../assets/brand/cuex-symbol-dimensional.svg';
import readyQuote from '../../../assets/captures/live-ready-candidate-quote.png';
import withdrawnQuote from '../../../assets/captures/live-answered-candidate-quote.png';
import completeAnswer from '../../../assets/captures/live-answered-active-utterance.png';
import reviewTimeline from '../../../assets/captures/review-timeline.png';
import assistControls from '../../../assets/captures/live-cue-green-assist-controls.png';
import answeredDecisions from '../../../assets/captures/live-answered-decisions.png';
import serif from '../../../assets/fonts/NotoSerifSC-VF.ttf';
import instrument from '../../../assets/fonts/InstrumentSerif-Regular.ttf';

export const design: DesignSystem = {
  palette: { bg: '#ECEDE7', text: '#1A211E', accent: '#D95822' },
  fonts: { display: 'CueXFilmDisplay, CueXFilmSerif, serif', body: 'CueXFilmSerif, serif' },
  typeScale: { hero: 78, body: 30 },
  radius: 0,
};
const amber = '#DE6729';
const violet = '#8176CD';
const green = '#306C58';
const muted = '#68716B';
const scale = 1920 / 2050;
// Absolute URLs also let the submission exporter embed fonts in its offline HTML.
const serifHref = new URL(serif, import.meta.url).href;
const instrumentHref = new URL(instrument, import.meta.url).href;

const css = `
@font-face{font-family:CueXFilmSerif;src:url('${serifHref}') format('truetype');font-style:normal;font-weight:200 900;font-display:block}
@font-face{font-family:CueXFilmDisplay;src:url('${instrumentHref}') format('truetype');font-style:normal;font-weight:400;font-display:block}
.cuex-final,.cuex-final *{box-sizing:border-box}
.cuex-final h1,.cuex-final h2,.cuex-final p{margin:0}
.cuex-final img{max-width:none}
.cuex-final svg{overflow:visible}
.cuex-final [data-3d-fallback] *{animation:none!important}
.cuex-final[data-cuex-page="two-streams"] > div:not([data-3d-scene]){z-index:2}
.cuex-final .cx-plane{transform:perspective(1400px) rotateY(-3deg);transform-origin:center;box-shadow:16px 22px 30px -18px #253b2b38}
.cuex-final .cx-ghost,.cuex-final .cx-amber-before{opacity:0;pointer-events:none}
.cuex-final .cx-question{opacity:1}
.cuex-final-motion .cx-enter{animation:cx-enter .95s cubic-bezier(.18,.7,.2,1) both}
.cuex-final-motion .cx-x{animation:cx-x 1.8s cubic-bezier(.18,.7,.2,1) both}
.cuex-final-motion .cx-plane{animation:cx-plane 1.5s cubic-bezier(.18,.7,.2,1) both}
.cuex-final-motion .cx-script{stroke-dasharray:1000;animation:cx-script 1.5s cubic-bezier(.35,0,.1,1) both}
.cuex-final-motion .cx-cut{animation:cx-cut .65s cubic-bezier(.2,.8,.2,1) 1.1s both;transform-origin:center}
.cuex-final-motion .cx-question{animation:cx-enter .9s cubic-bezier(.2,.7,.2,1) 1.35s both}
.cuex-final-motion .cx-fast{animation:cx-travel 1.7s linear 3,cx-light 5.1s linear both}
.cuex-final-motion .cx-slow{animation:cx-travel 5.1s linear 1,cx-light 5.1s linear both}
.cuex-final-motion .cx-gate{animation:cx-gate 1.1s ease-out 4s both;transform-origin:1370px 310px}
.cuex-final-motion .cx-amber-before{animation:cx-amber 4.3s ease-in-out both}
.cuex-final-motion .cx-withdrawn{animation:cx-enter .85s cubic-bezier(.2,.7,.2,1) 2.8s both}
.cuex-final-motion .cx-green-cue{animation:cx-green 1.8s ease-out 2.8s both}
.cuex-final-motion .cx-review-line{stroke-dasharray:1000;animation:cx-script 2.4s ease-out .4s both}
.cuex-final-motion .cx-cover-concern{stroke-dasharray:1000;animation:cx-script .9s ease-out 1.2s both}
.cuex-final-motion .cx-cover-response{stroke-dasharray:1000;animation:cx-script 1.2s ease-out 2.2s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-concern-topic{animation:cx-enter .65s ease-out 1.05s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-concern-path{stroke-dasharray:1000;animation:cx-script .9s cubic-bezier(.2,.7,.2,1) 1.35s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-concern-cut{animation:cx-cut .45s ease-out 1.95s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-answer-path{stroke-dasharray:1000;animation:cx-script 1.5s cubic-bezier(.2,.7,.2,1) 2.25s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-answer-topic{animation:cx-enter .7s ease-out 3.05s both}
.cuex-final-motion[data-cuex-page="interruption"] .cx-original-projection{animation:cx-leave-script 2.3s ease-out both}
.cuex-final-motion[data-cuex-page="withdraw"] .cx-answer-evidence{animation:cx-enter .7s ease-out 1.05s both}
.cuex-final-motion[data-cuex-page="withdraw"] .cx-causal-relay{stroke-dasharray:1000;animation:cx-script .95s ease-out 1.9s both}
.cuex-final-motion[data-cuex-page="practice"] .cx-less-assist{animation:cx-enter .75s ease-out 1.2s both}
.cuex-final-motion[data-cuex-page="practice"] .cx-next-practice{animation:cx-enter .75s ease-out 2.2s both}
.cuex-final-motion .cx-vision-line{stroke-dasharray:1000;animation:cx-script 1.8s ease-out 1.1s both}
@keyframes cx-leave-script{0%,65%{opacity:.55}100%{opacity:.18}}
@keyframes cx-enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes cx-x{from{opacity:0;transform:perspective(1200px) rotateY(-16deg) rotateZ(-4deg) scale(.96)}to{opacity:1;transform:perspective(1200px) rotateY(0deg) rotateZ(0deg) scale(1)}}
@keyframes cx-plane{from{opacity:0;transform:perspective(1400px) rotateY(-8deg) translateY(10px)}to{opacity:1;transform:perspective(1400px) rotateY(-3deg) translateY(0)}}
@keyframes cx-script{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes cx-cut{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
@keyframes cx-travel{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes cx-light{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}
@keyframes cx-gate{0%{opacity:.55}35%{opacity:1}100%{opacity:1}}
@keyframes cx-amber{0%,57%{opacity:1}78%,100%{opacity:0}}
@keyframes cx-green{0%{box-shadow:inset 0 0 0 1px #306C5800}45%{box-shadow:inset 0 0 0 3px #306C5855,0 0 24px #306C5820}100%{box-shadow:inset 0 0 0 1px #306C5800}}
/* PDF, thumbnails and reduced motion always show the complete semantic end state. */
[data-osd-freeze-motion] .cuex-final *{animation:none!important;transition:none!important}
[data-osd-freeze-motion] .cuex-final .cx-ghost,[data-osd-freeze-motion] .cuex-final .cx-amber-before{opacity:0!important}
@media print{
 .cuex-final *{animation:none!important;transition:none!important}
 .cuex-final .cx-enter,.cuex-final .cx-question,.cuex-final .cx-withdrawn,.cuex-final .cx-x{opacity:1!important}
 .cuex-final .cx-ghost,.cuex-final .cx-amber-before{opacity:0!important}
}
@media(prefers-reduced-motion:reduce){
 .cuex-final *{animation:none!important;transition:none!important}
 .cuex-final .cx-ghost,.cuex-final .cx-amber-before{opacity:0!important}
}
`;
if (typeof document !== 'undefined') {
  const id = 'osd-styles-cuex-pitch';
  let style = document.getElementById(id);
  if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style); }
  if (style.textContent !== css) style.textContent = css;
}

function Wide({ children, name }: { children: ReactNode; name: string }) {
  const animate = useIsActivePage();
  return <div style={{ width: '100%', height: '100%', position: 'relative', background: '#ECEDE7' }}>
    <section
      className={`cuex-wide cuex-final${animate ? ' cuex-final-motion' : ''}`}
      data-cuex-page={name} data-cuex-motion={animate ? 'active' : 'static'}
      style={{ position: 'absolute', width: 2050, height: 574, left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', overflow: 'hidden', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}
    >{children}</section>
  </div>;
}
function At({ children, style, className }: { children: ReactNode; style: CSSProperties; className?: string }) {
  return <div className={className} style={{ position: 'absolute', ...style }}>{children}</div>;
}
function SmallMark() {
  return <At style={{ right: 64, top: 42, display: 'flex', gap: 3, alignItems: 'center' }}>
    <span style={{ fontFamily: 'var(--osd-font-display)', fontSize: 38, lineHeight: 1 }}>Cue</span>
    <img src={symbol} alt="X" style={{ width: 36, height: 36 }} />
  </At>;
}

const Cover: Page = () => <Wide name="cover">
  <At style={{ left: 64, top: 52, fontFamily: 'var(--osd-font-display)', fontSize: 112, lineHeight: 1 }}>Cue</At>
  <At style={{ left: 223, top: 62, width: 94, height: 94 }}><img src={symbol} alt="X" style={{ width: 94, height: 94 }} /></At>
  <At className="cx-enter" style={{ left: 390, top: 60, fontSize: 68, lineHeight: 1.2, fontWeight: 550 }}>背熟资料，也要接住追问。</At>
  <At style={{ left: 64, top: 182, fontSize: 29, color: '#455D49' }}>医药代表的临场应对训练</At>
  <At style={{ left: 64, top: 241, fontSize: 22, color: muted }}>公开资料</At>
  <At style={{ left: 64, top: 288, fontSize: 30, color: '#405A46' }}>人工陪练占用经理同事时间</At>
  <At style={{ left: 494, top: 296, fontSize: 20, color: '#A25E35' }}>ZS</At>
  <At style={{ left: 64, top: 376, fontSize: 30, color: '#405A46' }}>医生追问要求临场调整</At>
  <At style={{ left: 494, top: 384, fontSize: 20, color: '#75639E' }}>UMU</At>
  <At style={{ left: 64, top: 510, fontSize: 24, color: muted }}>记性好了一点　　路皓然 / 任逸康</At>

  <At style={{ left: 720, top: 235, fontSize: 24, color: muted }}>医药代表</At>
  <At style={{ left: 720, top: 280, fontSize: 36, color: '#506252' }}>介绍降压效果</At>
  <At className="cx-enter" style={{ left: 1330, top: 180, fontSize: 23, color: '#9B512A' }}>医生</At>
  <At className="cx-enter" style={{ left: 1330, top: 218, fontSize: 32, lineHeight: 1.3, color: '#A34D26' }}>高龄、肾功能不好的<br />患者呢？</At>
  <At style={{ left: 1704, top: 318, fontSize: 23, color: '#6A7569' }}>继续照稿讲</At>
  <svg aria-label="从公开训练痛点到具体临场转向：原本介绍降压效果，医生追问高龄和肾功能不佳患者，回答先转向适用范围" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <g stroke="#8A9885" strokeWidth="1.5" fill="none" strokeLinejoin="round"><path d="M1004 264 H1046 L1064 283 V336 H1004Z M1046 264 V283 H1064" /><path d="M1015 294 H1052 M1015 305 H1052 M1015 316 H1045" /></g>
    <path className="cx-script" pathLength="1000" d="M720 357 H1120" stroke="#5E7360" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M1144 357 H1958" stroke="#738078" strokeWidth="1.8" strokeDasharray="4 12" opacity=".25" fill="none" />
    <path className="cx-cover-concern" pathLength="1000" d="M1635 318 C1440 318 1290 340 1132 357" stroke="#C16B3A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M1132 319 V396 M1150 347 1135 357 1151 366" stroke="#C16B3A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="1635" cy="318" r="4" fill="#C16B3A" />
    <path className="cx-cover-response" pathLength="1000" d="M1132 357 C1222 357 1260 445 1395 445 H1952" stroke="#7660A4" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M1938 436 1954 445 1938 454" stroke="#7660A4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
  <At style={{ left: 1590, top: 392, fontSize: 32, color: '#66508F' }}>先回答适用范围</At>
  <At style={{ left: 1380, top: 477, fontSize: 25, color: '#66508F' }}>先说明这些人群的证据范围</At>
</Wide>;

const Interruption: Page = () => <Wide name="interruption">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 78, fontWeight: 550, lineHeight: 1.2 }}>背熟，不等于接得住。</At>
  <At style={{ left: 70, top: 235, color: muted, fontSize: 25 }}>医药代表</At>
  <At style={{ left: 70, top: 280, fontSize: 44, color: '#506252' }}>介绍降压效果</At>
  <At className="cx-concern-topic" style={{ left: 1090, top: 169, color: '#9B512A', fontSize: 25 }}>医生</At>
  <At className="cx-concern-topic" style={{ left: 1090, top: 208, fontSize: 38, lineHeight: 1.35, color: '#A34D26' }}>高龄、肾功能不好的<br />患者呢？</At>
  <At style={{ left: 1635, top: 321, fontSize: 26, lineHeight: 1.3, color: '#6A7569' }}>继续照稿讲</At>
  <svg aria-label="原计划是介绍降压效果；医生追问高龄和肾功能不佳患者；回应先转向说明适用范围和这些人群的证据范围" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <g className="cx-enter" stroke="#8A9885" strokeWidth="1.6" fill="none" strokeLinejoin="round"><path d="M638 238 H695 L717 260 V340 H638Z M695 238 V260 H717" /><path d="M651 278 H702 M651 293 H702 M651 308 H690" /></g>
    <path className="cx-script" pathLength="1000" d="M70 370 H890" stroke="#5E7360" strokeWidth="4" strokeLinecap="round" fill="none" />
    <path className="cx-original-projection" d="M928 370 H1968" stroke="#738078" strokeWidth="2" strokeDasharray="4 13" opacity=".18" fill="none" />
    <path className="cx-concern-path" pathLength="1000" d="M1510 330 C1260 330 1140 350 904 370" stroke="#C16B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
    <g className="cx-concern-cut"><path d="M904 331 V410" stroke="#C16B3A" strokeWidth="6" strokeLinecap="round" /><path d="M924 358 908 369 926 377" stroke="#C16B3A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /><circle cx="1510" cy="330" r="5" fill="#C16B3A" /></g>
    <path className="cx-answer-path" pathLength="1000" d="M904 370 C1035 370 1098 470 1280 470 H1948" stroke="#7660A4" strokeWidth="4" strokeLinecap="round" fill="none" />
    <g className="cx-answer-topic"><path d="M1935 461 1951 470 1935 479" stroke="#7660A4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
  </svg>
  <At className="cx-answer-topic" style={{ left: 1510, top: 409, fontSize: 36, lineHeight: 1.2, color: '#66508F' }}>先回答适用范围</At>
  <At className="cx-answer-topic" style={{ left: 1310, top: 486, fontSize: 28, lineHeight: 1.15, color: '#66508F' }}>先说明这些人群的证据范围</At>
</Wide>;

function StreamsFallback() {
  return <svg aria-label="三维不可用时的静态粒子路径示意" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <path d="M64 310 H400" stroke="#536152" strokeWidth="2" strokeDasharray="1 7" fill="none" />
    <path d="M400 310 C660 112 1090 112 1370 310" stroke="#B75B2C" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" fill="none" />
    <path d="M400 310 C660 488 1100 488 1370 310" stroke="#7662AD" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" fill="none" />
    <g stroke="#7662AD" fill="none" strokeWidth="1" opacity=".6"><path d="M870 396 910 424 900 465 850 478 830 430Z M870 396 850 478 910 424 830 430 900 465Z M870 396 900 465 M830 430 910 424" /><ellipse cx="870" cy="438" rx="59" ry="32" strokeDasharray="1 7" /></g>
    <ellipse cx="1370" cy="310" rx="46" ry="67" fill="none" stroke="#526A58" strokeWidth="1.5" />
    <ellipse cx="1370" cy="310" rx="59" ry="85" fill="none" stroke="#526A58" strokeWidth="2" strokeDasharray="1 14" />
    <path d="M1415 310 H1930" stroke="#536152" strokeWidth="2" strokeDasharray="1 7" fill="none" />
  </svg>;
}

function ThreeStreams() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animate = useIsActivePage();
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let healthy = true;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const scene = new THREE.Scene();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    let freezeNow = () => {};
    const geometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
    const material = <T extends THREE.Material>(m: T): T => { materials.add(m); return m; };
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const fract = (v: number) => v - Math.floor(v);
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const point = (x: number, y: number, z = 0) => new THREE.Vector3(x - 1025, 287 - y, z);
    const fail = (reason?: unknown) => {
      healthy = false;
      cancelAnimationFrame(raf);
      canvas.dataset.animationState = 'fallback';
      canvas.dataset.error3d = reason instanceof Error ? reason.message : String(reason ?? 'WebGL render failed');
      if (!disposed) setStatus('fallback');
    };
    const lost = (event: Event) => { event.preventDefault(); fail('WebGL context lost'); };
    canvas.addEventListener('webglcontextlost', lost);
    setStatus('loading');
    delete canvas.dataset.error3d;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(2);
      renderer.setSize(2050, 574, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      canvas.dataset.webgl = 'webgl2';
      canvas.dataset.renderer = 'three-0.170.0';
      canvas.dataset.visual = 'original-film-particle-field';

      // Adapted from video/src/three/ArchField.tsx and camera.ts: point trails,
      // the slow orbit around an icosahedral core, a projected gate and dissolving cards.
      // Normal alpha blending and ink pigments preserve contrast on the light clinic.
      const fov = 32;
      const camera = new THREE.PerspectiveCamera(fov, 2050 / 574, 1, 3000);
      const pigment = (hex: number) => new THREE.Color(hex).toArray();
      const ink = pigment(0x304939), gold = pigment(0xa3481c), lilac = pigment(0x5c4292), mint = pigment(0x2d6e4e);
      const rng = (seed: number) => () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const table = (n: number, seed: number) => { const r = rng(seed); return Float32Array.from({ length: n * 4 }, () => r()); };
      const curves = {
        fast: new THREE.CatmullRomCurve3([point(400, 310), point(615, 188, 25), point(868, 167), point(1122, 193, -25), point(1338, 310)], false, 'centripetal'),
        slow: new THREE.CatmullRomCurve3([point(400, 310), point(615, 420, -25), point(870, 438), point(1122, 420, 25), point(1338, 310)], false, 'centripetal'),
      };
      const lookup = (curve: THREE.Curve<THREE.Vector3>) => {
        const lut = new Float32Array(600 * 3);
        for (let i = 0; i < 600; i++) curve.getPointAt(i / 599).toArray(lut, i * 3);
        return lut;
      };
      const fastLut = lookup(curves.fast), slowLut = lookup(curves.slow);
      const sample = (lut: Float32Array, u: number, out: THREE.Vector3) => {
        const f = clamp(u) * 599, i = Math.floor(f), j = Math.min(599, i + 1), t = f - i;
        return out.set(mix(lut[i * 3], lut[j * 3], t), mix(lut[i * 3 + 1], lut[j * 3 + 1], t), mix(lut[i * 3 + 2], lut[j * 3 + 2], t));
      };
      const pointsMaterial = material(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: { uScale: { value: 574 * 2 / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))) } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
          uniform float uScale; varying float vAlpha; varying vec3 vColor;
          void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*uScale/max(1.0,-mv.z);gl_Position=projectionMatrix*mv;vAlpha=aAlpha;vColor=aColor;}`,
        fragmentShader: `varying float vAlpha; varying vec3 vColor;
          void main(){float d=length(gl_PointCoord-.5)*2.0;float a=pow(clamp(1.0-d,0.0,1.0),1.05)*vAlpha;
          if(a<.003)discard;gl_FragColor=vec4(vColor,a);
          #include <colorspace_fragment>
          }`,
      }));
      const cloud = (count: number, seed: number) => {
        const g = geometry(new THREE.BufferGeometry());
        const b = { position: new Float32Array(count * 3), aColor: new Float32Array(count * 3), aSize: new Float32Array(count), aAlpha: new Float32Array(count) };
        for (const [name, array] of Object.entries(b)) g.setAttribute(name, new THREE.BufferAttribute(array, name === 'position' || name === 'aColor' ? 3 : 1).setUsage(THREE.DynamicDrawUsage));
        const mesh = new THREE.Points(g, pointsMaterial); mesh.frustumCulled = false; scene.add(mesh);
        return { g, b, count, random: table(count, seed) };
      };
      type Cloud = ReturnType<typeof cloud>;
      const dust = cloud(160, 1), input = cloud(420, 11), fast = cloud(300 * 3, 21), slow = cloud(520, 31), output = cloud(330, 41), burst = cloud(220, 51);
      const fastRandom = table(300, 22);
      const put = (c: Cloud, i: number, p: THREE.Vector3, color: number[], size: number, alpha: number) => {
        c.b.position.set([p.x, p.y, p.z], i * 3); c.b.aColor.set(color, i * 3); c.b.aSize[i] = size; c.b.aAlpha[i] = alpha;
      };
      const commit = (c: Cloud) => { for (const attr of Object.values(c.g.attributes)) attr.needsUpdate = true; };
      const core = new THREE.Group(); core.position.copy(point(870, 438));
      const coreInner = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(29, 1)), material(new THREE.MeshBasicMaterial({ color: 0x5c4292, wireframe: true, transparent: true, opacity: 0.76, depthWrite: false })));
      const coreOuter = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(47, 0)), material(new THREE.MeshBasicMaterial({ color: 0x5c4292, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false })));
      core.add(coreInner, coreOuter); scene.add(core);

      const gate = new THREE.Group(); gate.position.copy(point(1370, 310)); gate.rotation.y = Math.PI / 2 - 0.75;
      const gateInk = material(new THREE.MeshBasicMaterial({ color: 0x4b6653, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      const gateRing = new THREE.Mesh(geometry(new THREE.TorusGeometry(67, 1.3, 8, 160)), gateInk); gate.add(gateRing);
      const ticks = new THREE.Group();
      const tickGeo = geometry(new THREE.PlaneGeometry(7, 1.2));
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const tick = new THREE.Mesh(tickGeo, gateInk); tick.position.set(Math.cos(a) * 85, Math.sin(a) * 85, 0); tick.rotation.z = a; ticks.add(tick); }
      const gateFlash = new THREE.Mesh(geometry(new THREE.CircleGeometry(65, 64)), material(new THREE.MeshBasicMaterial({ color: 0x7c987c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })));
      gate.add(ticks, gateFlash); scene.add(gate);
      const makeCard = () => {
        const group = new THREE.Group();
        const fill = material(new THREE.MeshBasicMaterial({ color: 0x7258ad, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
        const edge = material(new THREE.LineBasicMaterial({ color: 0x7258ad, transparent: true, opacity: 0.8, depthWrite: false }));
        const plane = geometry(new THREE.PlaneGeometry(48, 28));
        group.add(new THREE.Mesh(plane, fill), new THREE.LineSegments(geometry(new THREE.EdgesGeometry(plane)), edge));
        group.rotation.set(-0.12, 0.12, 0); scene.add(group);
        return { group, fill, edge };
      };
      const cardA = makeCard(), cardB = makeCard();
      const p = new THREE.Vector3(), stop = sample(slowLut, 0.84, new THREE.Vector3());
      const draw = (time: number, frozen: boolean) => {
        const progress = clamp(time / 12), eased = progress * progress * (3 - 2 * progress);
        camera.position.set(mix(-28, 16, eased), mix(18, 8, eased), mix(1025, 1005, eased));
        camera.lookAt(mix(0, 4, eased), 0, 0);
        const flash = time >= 4.25 && time < 6 ? Math.exp(-(time - 4.25) * 6) : 0;
        for (let i = 0; i < dust.count; i++) { const r = dust.random, a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2]; put(dust, i, point(330 + a * 1080, 175 + b * 315, -130 + c * 80), ink, 1.4 + c, 0.05); }
        for (let i = 0; i < input.count; i++) {
          const r = input.random, a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], d = r[i * 4 + 3], u = fract(a + time * 0.18), x = 64 + u * 336;
          const y = 310 + Math.sin(x * 0.04 - time * 4.8) * 9 * (0.55 + 0.45 * Math.sin(x * 0.01 + time)) + (b - 0.5) * 4;
          put(input, i, point(x, y, (c - 0.5) * 24), ink, 3.4 + d * 2.6, 0.8 * clamp(u / 0.12));
        }
        for (let i = 0; i < 300; i++) {
          const a = fastRandom[i * 4], b = fastRandom[i * 4 + 1], c = fastRandom[i * 4 + 2];
          for (let k = 0; k < 3; k++) { const u = fract(a + time * 0.42) - k * 0.004; sample(fastLut, u, p); p.y += (b - 0.5) * 5; p.z += (c - 0.5) * 10; put(fast, i * 3 + k, p, gold, (3.7 + c * 3.1) * (1 - k * 0.2), 0.92 * (1 - k * 0.25) * clamp(u / 0.05) * clamp((1 - u) / 0.05)); }
        }
        for (let i = 0; i < slow.count; i++) {
          const r = slow.random, a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], u = fract(a + time * 0.135);
          sample(slowLut, u, p); const radius = 47 * Math.exp(-Math.pow((u - 0.5) / 0.17, 2)) * (0.4 + b * 0.6), angle = b * 40 + time * 1.35 * (c > 0.5 ? 1 : -1);
          p.y += Math.cos(angle) * radius; p.z += Math.sin(angle) * radius;
          put(slow, i, p, lilac, 3.7 + c * 3.4, 0.9 * clamp(u / 0.05) * clamp((1 - u) / 0.05));
        }
        for (let i = 0; i < output.count; i++) { const r = output.random, a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], u = fract(a + time * 0.21), x = 1370 + u * 570; put(output, i, point(x, 310 + Math.sin(x * 0.035 - time * 4.2) * 4 + (b - 0.5) * 3, (c - 0.5) * 18), ink, 3.4 + c * 3, (0.7 + flash * 0.2) * clamp(u / 0.05)); }
        coreInner.rotation.set(time * 0.33, time * 0.51, 0);
        coreOuter.rotation.set(-time * 0.24, -time * 0.36, 0.4);
        ticks.rotation.z = time * 0.3;
        gate.scale.setScalar(1 + flash * 0.08);
        (gateFlash.material as THREE.MeshBasicMaterial).opacity = flash * 0.12;
        cardA.group.visible = time >= 0.4 && time < 5.2;
        if (time < 4.25) sample(slowLut, 0.5 + 0.5 * clamp((time - 0.4) / 3.85), cardA.group.position);
        else cardA.group.position.copy(point(1338 + 290 * clamp((time - 4.25) / 0.95), 310));
        cardA.group.position.z += 8;
        cardA.group.scale.setScalar(time < 4.25 ? 1 : 1 - 0.6 * clamp((time - 4.25) / 0.95));
        cardB.group.visible = time >= 5 && time < 9.6;
        sample(slowLut, 0.5 + 0.34 * clamp((time - 5) / 3.1), cardB.group.position);
        cardB.group.position.z += 8;
        const dissolve = clamp((time - 8.1) / 1.5), e = 1 - Math.pow(1 - dissolve, 3);
        cardB.fill.color.set(dissolve ? 0x397c5c : 0x7258ad); cardB.edge.color.copy(cardB.fill.color);
        cardB.fill.opacity = (1 - dissolve) * 0.09; cardB.edge.opacity = (1 - dissolve) * 0.8;
        for (let i = 0; i < burst.count; i++) {
          const r = burst.random, a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], d = r[i * 4 + 3], th = a * Math.PI * 2, ph = Math.acos(2 * b - 1), distance = (8 + c * 60) * e;
          p.copy(stop).add(new THREE.Vector3((a - 0.5) * 48 + Math.sin(ph) * Math.cos(th) * distance + e * 24, (b - 0.5) * 28 + Math.cos(ph) * distance * 0.6 + e * (18 + d * 30), Math.sin(ph) * Math.sin(th) * distance));
          put(burst, i, p, mint, 3.7 + d * 3.4, dissolve > 0 && dissolve < 1 ? Math.pow(1 - dissolve, 1.3) * 0.8 : 0);
        }
        if (time >= 10) { cardA.group.visible = true; sample(slowLut, 0.7, cardA.group.position); cardA.group.position.z += 8; cardA.group.scale.setScalar(clamp(time - 10)); }
        for (const c of [dust, input, fast, slow, output, burst]) commit(c);
        renderer!.render(scene, camera);
        canvas.dataset.frameTime = time.toFixed(3);
        canvas.dataset.candidatePhase = time < 4.25 ? 'preparing' : time < 5.2 ? 'passed' : time < 8.1 ? 'preparing-next' : time < 9.6 ? 'withdrawing' : 'settled';
        canvas.dataset['3dReady'] = 'true';
        canvas.dataset.particles = String(dust.count + input.count + fast.count + slow.count + output.count + burst.count);
        canvas.dataset.frozenFrame = frozen ? 'true' : 'false';
      };
      const shouldFreeze = () => !animate || reduce.matches || print.matches || Boolean(canvas.closest('[data-osd-freeze-motion]'));
      freezeNow = () => { cancelAnimationFrame(raf); if (disposed) return; try { draw(12, true); canvas.dataset.animationState = 'frozen'; } catch (error) { fail(error); } };
      const began = performance.now();
      const tick = (now: number) => {
        if (disposed) return;
        if (shouldFreeze()) { freezeNow(); return; }
        // RAF timestamps may precede effect setup within their first refresh interval.
        const time = Math.max(0, Math.min(12, (now - began) / 1000));
        try { draw(time, time === 12); } catch (error) { fail(error); return; }
        canvas.dataset.animationState = time === 12 ? 'settled' : 'running';
        if (time < 12) raf = requestAnimationFrame(tick);
      };
      if (shouldFreeze()) freezeNow(); else { draw(0, false); canvas.dataset.animationState = 'running'; raf = requestAnimationFrame(tick); }
      if (healthy) setStatus('ready');
    } catch (error) { fail(error); }

    const mediaChanged = () => { if (reduce.matches || print.matches) freezeNow(); };
    reduce.addEventListener('change', mediaChanged); print.addEventListener('change', mediaChanged); window.addEventListener('beforeprint', freezeNow);
    return () => {
      disposed = true; cancelAnimationFrame(raf);
      reduce.removeEventListener('change', mediaChanged); print.removeEventListener('change', mediaChanged); window.removeEventListener('beforeprint', freezeNow);
      canvas.removeEventListener('webglcontextlost', lost);
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      renderer?.renderLists.dispose(); renderer?.dispose(); scene.clear();
    };
  }, [animate]);

  return <div data-3d-scene data-waitfor="[data-3d-ready='true']" style={{ position: 'absolute', inset: 0, width: 2050, height: 574, pointerEvents: 'none', zIndex: 0 }}>
    <div data-3d-fallback data-3d-ready={status === 'fallback' ? 'true' : undefined} style={{ display: status === 'ready' ? 'none' : 'block' }}>
      <StreamsFallback />
    </div>
    <canvas ref={canvasRef} role="img" aria-label="原视频粒子流三维机制：快速判断流、围绕线框核心的慢准备流、细环输出复核门与撤销粒子" data-3d-ready={status === 'ready' ? 'true' : undefined} style={{ position: 'absolute', inset: 0, width: 2050, height: 574, display: status === 'ready' ? 'block' : 'none' }} />
  </div>;
}

const TwoStreams: Page = () => <Wide name="two-streams">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 78, fontWeight: 550, lineHeight: 1.2 }}>一边听，一边准备。</At>
  <ThreeStreams />
  <At style={{ left: 65, top: 263, fontSize: 29 }}>持续对话</At>
  <At style={{ left: 696, top: 205, fontSize: 28, textAlign: 'center', width: 360, lineHeight: 1.4 }}><span style={{ color: '#A8552E' }}>System 1</span><br />高频小判断</At>
  <At style={{ left: 699, top: 300, fontSize: 28, textAlign: 'center', width: 360, lineHeight: 1.4 }}><span style={{ color: '#675799' }}>System 2</span><br />并行准备</At>
  <At style={{ left: 1212, top: 130, width: 320, textAlign: 'center', fontSize: 28, lineHeight: 1.4 }}><span style={{ fontSize: 23, color: muted }}>Controller</span><br />输出前复核</At>
  <At style={{ left: 1537, top: 340, fontSize: 28 }}>继续听</At>
  <At style={{ left: 1721, top: 340, fontSize: 28 }}>追问</At>
  <At style={{ left: 1891, top: 340, fontSize: 28 }}>撤销</At>
  <At style={{ left: 1527, top: 443, fontSize: 36, color: '#3F5145' }}>候选 ≠ 已说出</At>
</Wide>;

const Withdraw: Page = () => <Wide name="withdraw">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 78, fontWeight: 550, lineHeight: 1.2 }}>补答到了，追问撤回。</At>
  <At style={{ left: 68, top: 192, fontSize: 29, color: '#9E562E' }}>尚未说出口</At>
  <At style={{ left: 64, top: 246, width: 700, height: 54 }}>
    <img src={readyQuote} alt="候选追问原文：那 eGFR 低于 30 的呢？这部分患者能用吗？" style={{ width: 700, height: 'auto' }} />
  </At>

  <At className="cx-answer-evidence" style={{ left: 1120, top: 192, fontSize: 29, color: '#35664A' }}>主动补答</At>
  <At className="cx-answer-evidence" style={{ left: 1116, top: 246, width: 812, height: 124 }}>
    <img src={completeAnswer} alt="完整补答原文：eGFR低于30的患者被排除在研究之外，这部分目前没有证据，说明书也不建议使用" style={{ width: 812, height: 'auto' }} />
  </At>
  <svg aria-label="主动补答使候选追问撤销" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <path className="cx-causal-relay" pathLength="1000" d="M1536 393 C1536 466 1170 466 819 466" stroke="#48795A" strokeWidth="3" strokeLinecap="round" fill="none" />
    <g className="cx-withdrawn"><path d="M835 456 818 466 835 476" stroke="#48795A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
  </svg>
  <At className="cx-withdrawn" style={{ left: 68, top: 394, fontSize: 29, color: '#35664A' }}>已撤销</At>
  <At className="cx-withdrawn" style={{ left: 64, top: 447, width: 700, height: 54 }}>
    <img src={withdrawnQuote} alt="同一句候选追问被划去，未进入对话" style={{ width: 700, height: 'auto' }} />
  </At>
</Wide>;

const Practice: Page = () => <Wide name="practice">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 78, fontWeight: 550, lineHeight: 1.2 }}>让下一次，更靠自己。</At>
  <At style={{ left: 66, top: 181, fontSize: 29, color: '#3F5948' }}>这次补答，撤销了追问</At>
  {/* Enlarge the selected withdrawal event; omit the source's overlapping left labels. */}
  <At style={{ left: 64, top: 230, width: 720, height: 265, overflow: 'hidden', background: '#F6F7F0' }}>
    <img src={reviewTimeline} alt="复盘时间线的具体撤销事件：候选在补答位置终止" style={{ position: 'absolute', width: 4460.65, height: 'auto', left: -3013.95, top: 0 }} />
  </At>
  <At style={{ left: 84, top: 243, fontSize: 24, color: '#945632' }}>候选追问</At>
  <At style={{ left: 84, top: 348, fontSize: 24, color: '#4D6051' }}>你的回应</At>
  <At style={{ left: 598, top: 440, fontSize: 24, color: '#35664A' }}>补答</At>
  <svg aria-label="从选中的复盘事件进入较少辅助，再进行变式重练" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <path className="cx-review-line" pathLength="1000" d="M712 330 H884 M1436 330 H1530" stroke="#6C846B" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M870 322 885 330 870 338 M1515 322 1530 330 1515 338" stroke="#6C846B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
  <At className="cx-less-assist" style={{ left: 900, top: 181, fontSize: 29, color: '#3F5948' }}>减少辅助</At>
  <At className="cx-less-assist" style={{ left: 900, top: 275, width: 520, height: 110 }}>
    <img src={assistControls} alt="真实辅助档位：全量、轻提示、撤除；当前选择轻提示" style={{ width: 520, height: 'auto' }} />
  </At>
  <At className="cx-next-practice" style={{ left: 1550, top: 181, fontSize: 29, color: '#3F5948' }}>变式重练</At>
  <At className="cx-next-practice" style={{ left: 1700, top: 263, fontSize: 32, color: '#A35C33' }}>提前追问</At>
  <svg className="cx-next-practice" aria-label="下一次练习让医生更早追问，回应需要重新转向" viewBox="0 0 470 180" style={{ position: 'absolute', left: 1530, top: 295, width: 470, height: 180 }}>
    <path d="M0 35 H121 M150 35 H440" stroke="#82907F" strokeWidth="2.5" strokeDasharray="4 9" fill="none" />
    <path d="M132 0 V70" stroke="#C26B3D" strokeWidth="5" strokeLinecap="round" />
    <path d="M132 35 C230 35 216 108 324 108 H444" stroke="#7A659E" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M431 100 446 108 431 116" stroke="#7A659E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
  <At className="cx-next-practice" style={{ left: 1740, top: 439, fontSize: 28, color: '#665387' }}>再练一次</At>
</Wide>;

// Product bridge for the 1 + 3 + 1 narrative; the film plays after page 2.
// The standalone interruption/withdrawal/business pages remain authoring material.
const ProductBridge: Page = () => <Wide name="product-bridge">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 74, lineHeight: 1.2, fontWeight: 550 }}>AI 临场演练助手</At>
  <At style={{ left: 68, top: 151, fontSize: 31, color: '#536652' }}>面向医药代表的沟通训练</At>
  <At style={{ left: 70, top: 258, fontSize: 48, color: '#42634B' }}>听</At>
  <At style={{ left: 262, top: 258, fontSize: 48, color: '#B45F30' }}>追问</At>
  <At style={{ left: 506, top: 258, fontSize: 48, color: '#7863A1' }}>撤销</At>
  <svg aria-hidden viewBox="0 0 700 90" style={{ position: 'absolute', left: 64, top: 250, width: 700, height: 90 }}>
    <path d="M92 45 H168 M322 45 H416" stroke="#A3AE9F" strokeWidth="1.5" fill="none" />
  </svg>
  <At style={{ left: 70, top: 360, fontSize: 34, color: '#455C49' }}>复盘，再练一次</At>
  <svg aria-label="接下来播放产品视频" viewBox="0 0 64 64" style={{ position: 'absolute', left: 68, top: 446, width: 64, height: 64 }}>
    <circle cx="32" cy="32" r="29" fill="none" stroke="#B56A3C" strokeWidth="1.8" /><path d="M26 20 45 32 26 44Z" fill="#B56A3C" />
  </svg>
  <At style={{ left: 151, top: 459, fontSize: 33, color: '#8E542F' }}>45 秒产品演示</At>

  <At style={{ left: 1010, top: 112, fontSize: 28, color: '#455D49' }}>演练中：撤销未出口的追问</At>
  <At className="cx-plane" style={{ left: 1008, top: 160, width: 978, height: 108, overflow: 'hidden', background: '#EEF0E8' }}>
    <img src={answeredDecisions} alt="产品演练界面的真实裁切：已撤销状态和划去的候选追问" style={{ position: 'absolute', width: 2183.44, left: -1123.53, top: -144.05, height: 'auto' }} />
  </At>
  <At style={{ left: 1010, top: 317, fontSize: 28, color: '#455D49' }}>复盘后：回到具体片段</At>
  <At style={{ left: 1008, top: 365, width: 978, height: 150, overflow: 'hidden', background: '#F6F7F0' }}>
    <img src={reviewTimeline} alt="产品复盘时间线的真实无头像裁切" style={{ position: 'absolute', width: 2529.41, left: -1376.70, top: 0, height: 'auto' }} />
  </At>
</Wide>;

const CommercialPath: Page = () => <Wide name="commercial-path">
  <SmallMark />
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 74, lineHeight: 1.2, fontWeight: 550 }}>先服务新人，再验证团队价值。</At>
  <At style={{ left: 68, top: 184, fontSize: 25, color: muted }}>首个目标用户</At>
  <At style={{ left: 64, top: 226, fontSize: 44, color: '#314E3C' }}>新人医药代表</At>
  <At style={{ left: 716, top: 184, fontSize: 25, color: muted }}>潜在付费方</At>
  <At style={{ left: 712, top: 226, fontSize: 44, color: '#314E3C' }}>药企培训部门</At>
  <At style={{ left: 1450, top: 177, fontSize: 25, color: muted }}>试点关注</At>
  <At style={{ left: 1450, top: 218, fontSize: 28, lineHeight: 1.5, color: '#445B49' }}>回应相关性<br />独立完成度<br />教练投入</At>
  <At style={{ left: 68, top: 358, fontSize: 25, color: muted }}>计划</At>
  <At className="cx-enter" style={{ left: 64, top: 416, fontSize: 40, color: '#A65C32' }}>小组试点</At>
  <At className="cx-enter" style={{ left: 716, top: 416, fontSize: 40, color: '#6F5C96' }}>团队订阅</At>
  <At className="cx-enter" style={{ left: 1450, top: 416, fontSize: 40, color: '#6F5C96' }}>场景内容扩展</At>
  <svg aria-label="待验证的商业计划：小组试点、团队订阅、场景内容扩展" viewBox="0 0 2050 574" style={{ position: 'absolute', inset: 0, width: 2050, height: 574 }}>
    <path className="cx-review-line" pathLength="1000" d="M280 444 H662 M930 444 H1392" stroke="#8C9A86" strokeWidth="2" fill="none" />
    <path d="M649 437 663 444 649 451 M1379 437 1393 444 1379 451" stroke="#8C9A86" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
</Wide>;

function VisionParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useIsActivePage();
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let disposed = false, healthy = true, raf = 0;
    const scene = new THREE.Scene();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)'), print = window.matchMedia('print');
    const geometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
    const material = <T extends THREE.Material>(m: T): T => { materials.add(m); return m; };
    const pt = (x: number, y: number, z = 0) => new THREE.Vector3(x - 1025, 287 - y, z);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const fract = (v: number) => v - Math.floor(v);
    const fail = (reason?: unknown) => { healthy = false; cancelAnimationFrame(raf); canvas.dataset.animationState = 'fallback'; canvas.dataset.error3d = reason instanceof Error ? reason.message : String(reason ?? 'WebGL unavailable'); if (!disposed) setStatus('fallback'); };
    const lost = (event: Event) => { event.preventDefault(); fail('WebGL context lost'); };
    let freeze = () => {};
    canvas.addEventListener('webglcontextlost', lost);
    setStatus('loading'); delete canvas.dataset.error3d;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(2); renderer.setSize(2050, 574, false); renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
      canvas.dataset.webgl = 'webgl2'; canvas.dataset.visual = 'four-ended-volumetric-particle-x';
      const camera = new THREE.PerspectiveCamera(32, 2050 / 574, 1, 3000);
      const gold = new THREE.Color(0xa3481c).toArray(), purple = new THREE.Color(0x5c4292).toArray();
      let seed = 1527;
      const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const count = 360 * 2 * 4 + 560;
      const g = geometry(new THREE.BufferGeometry());
      const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count), alphas = new Float32Array(count);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
      const random = Float32Array.from({ length: count * 4 }, () => rand());
      const shader = material(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: { uScale: { value: 574 * 2 / (2 * Math.tan(THREE.MathUtils.degToRad(16))) } },
        vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;uniform float uScale;varying vec3 vColor;varying float vAlpha;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uScale/max(1.,-mv.z);vColor=aColor;vAlpha=aAlpha;}`,
        fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(clamp(1.-d,0.,1.),1.05)*vAlpha;if(a<.003)discard;gl_FragColor=vec4(vColor,a);\n#include <colorspace_fragment>\n}`,
      }));
      const cloud = new THREE.Points(g, shader); cloud.frustumCulled = false; scene.add(cloud);
      const paths = [
        new THREE.CatmullRomCurve3([pt(919, 212), pt(856, 174, 28), pt(742, 209, -20), pt(618, 230)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(1154, 184), pt(1222, 162, -26), pt(1320, 214, 24), pt(1428, 230)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(897, 479), pt(823, 500, 25), pt(724, 456, -26), pt(618, 447)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(1160, 485), pt(1232, 506, -24), pt(1332, 453, 28), pt(1428, 447)], false, 'centripetal'),
      ];
      const luts = paths.map(curve => { const data = new Float32Array(400 * 6); for (let i = 0; i < 400; i++) { curve.getPointAt(i / 399).toArray(data, i * 6); curve.getTangentAt(i / 399).toArray(data, i * 6 + 3); } return data; });
      const sample = (arm: number, u: number, position: THREE.Vector3, tangent: THREE.Vector3) => {
        const f = clamp(u) * 399, i = Math.floor(f), j = Math.min(399, i + 1), t = f - i, lut = luts[arm];
        position.set(lut[i * 6] + (lut[j * 6] - lut[i * 6]) * t, lut[i * 6 + 1] + (lut[j * 6 + 1] - lut[i * 6 + 1]) * t, lut[i * 6 + 2] + (lut[j * 6 + 2] - lut[i * 6 + 2]) * t);
        tangent.set(lut[i * 6 + 3] + (lut[j * 6 + 3] - lut[i * 6 + 3]) * t, lut[i * 6 + 4] + (lut[j * 6 + 4] - lut[i * 6 + 4]) * t, 0).normalize();
      };
      const inner = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(40, 1)), material(new THREE.MeshBasicMaterial({ color: 0x66519f, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false })));
      const outer = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(63, 0)), material(new THREE.MeshBasicMaterial({ color: 0x66519f, wireframe: true, transparent: true, opacity: 0.13, depthWrite: false })));
      inner.position.copy(pt(1038, 340, -12)); outer.position.copy(inner.position); scene.add(inner, outer);
      const p0 = new THREE.Vector3(), tangent = new THREE.Vector3();
      const crossStart = [pt(919, 212, 3), pt(897, 479, -3)], crossEnd = [pt(1160, 485, -3), pt(1154, 184, 3)];
      const draw = (time: number, frozen: boolean) => {
        const arc = frozen ? 0 : Math.sin(Math.PI * time / 12);
        camera.position.set(arc * 12, arc * 6, 1001); camera.lookAt(0, 0, 0);
        for (let arm = 0; arm < 4; arm++) {
          const amberArm = arm === 0 || arm === 3, color = amberArm ? gold : purple, speed = arm === 3 ? 0.19 : amberArm ? 0.16 : 0.115;
          for (let i = 0; i < 360; i++) {
            const base = (arm * 720 + i * 2) * 4, a = random[base], b = random[base + 1], c = random[base + 2], d = random[base + 3];
            for (let trail = 0; trail < 2; trail++) {
              const index = arm * 720 + i * 2 + trail, u = fract(a + time * speed) - trail * 0.009;
              sample(arm, u, p0, tangent);
              const radius = (11 + 10 * Math.sin(Math.PI * clamp(u))) * (0.35 + b * 0.65), angle = b * 35 + time * (amberArm ? 0.8 : -0.65);
              p0.x += tangent.y * Math.cos(angle) * radius; p0.y -= tangent.x * Math.cos(angle) * radius; p0.z += Math.sin(angle) * radius * 1.5;
              positions.set([p0.x, p0.y, p0.z], index * 3); colors.set(color, index * 3); sizes[index] = (3.6 + d * 3.2) * (1 - trail * 0.25);
              alphas[index] = (arm === 3 ? 0.93 : 0.78) * (1 - trail * 0.3) * (0.3 + 0.7 * clamp(u / 0.05)) * clamp((1 - u) / 0.06);
            }
          }
        }
        for (let i = 0; i < 560; i++) {
          const index = 2880 + i, lane = i < 280 ? 0 : 1, r = index * 4, a = random[r], b = random[r + 1], c = random[r + 2], d = random[r + 3], u = fract(a + time * 0.08);
          p0.copy(crossStart[lane]).lerp(crossEnd[lane], u); const spread = (b - .5) * 30;
          p0.x += spread; p0.y += (lane === 0 ? -1 : 1) * spread; p0.z += (c - .5) * 45;
          positions.set([p0.x, p0.y, p0.z], index * 3); colors.set(lane === 0 ? gold : purple, index * 3); sizes[index] = 3.3 + d * 3.1; alphas[index] = 0.5 * clamp(u / .08) * clamp((1-u)/.08);
        }
        inner.rotation.set(time * .23, time * .32, .2); outer.rotation.set(-time * .17, time * .22, -.1);
        for (const attribute of Object.values(g.attributes)) attribute.needsUpdate = true;
        renderer!.render(scene, camera); canvas.dataset['3dReady'] = 'true'; canvas.dataset.frameTime = time.toFixed(3); canvas.dataset.particles = String(count);
      };
      const frozen = () => !active || reduce.matches || print.matches || Boolean(canvas.closest('[data-osd-freeze-motion]'));
      freeze = () => { cancelAnimationFrame(raf); if (disposed) return; try { draw(12, true); canvas.dataset.animationState = 'frozen'; } catch (e) { fail(e); } };
      const began = performance.now();
      const tick = (now: number) => { if (disposed) return; if (frozen()) { freeze(); return; } const time = Math.max(0, Math.min(12, (now - began) / 1000)); try { draw(time, time === 12); } catch (e) { fail(e); return; } canvas.dataset.animationState = time === 12 ? 'settled' : 'running'; if (time < 12) raf = requestAnimationFrame(tick); };
      if (frozen()) freeze(); else { draw(0, false); canvas.dataset.animationState = 'running'; raf = requestAnimationFrame(tick); }
      if (healthy) setStatus('ready');
    } catch (e) { fail(e); }
    const onMedia = () => { if (reduce.matches || print.matches) freeze(); };
    reduce.addEventListener('change', onMedia); print.addEventListener('change', onMedia); window.addEventListener('beforeprint', freeze);
    return () => { disposed = true; cancelAnimationFrame(raf); canvas.removeEventListener('webglcontextlost', lost); reduce.removeEventListener('change', onMedia); print.removeEventListener('change', onMedia); window.removeEventListener('beforeprint', freeze); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer?.renderLists.dispose(); renderer?.dispose(); scene.clear(); };
  }, [active]);
  return <div data-vision-3d data-waitfor="[data-3d-ready='true']" style={{ position: 'absolute', left: 598, top: 130, width: 854, height: 410, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
    <svg data-3d-ready={status === 'fallback' ? 'true' : undefined} data-3d-mode="static-fallback" aria-label="粒子 X 的静态替代图" viewBox="0 0 2050 574" style={{ display: status === 'ready' ? 'none' : 'block', position: 'absolute', left: -598, top: -130, width: 2050, height: 574 }}>
      <path d="M919 212 C820 145 740 225 618 230 M1160 485 C1240 550 1300 447 1428 447" stroke="#A3481C" strokeWidth="4" strokeDasharray="1 6" fill="none" />
      <path d="M1154 184 C1240 130 1320 225 1428 230 M897 479 C810 540 730 450 618 447" stroke="#5C4292" strokeWidth="4" strokeDasharray="1 6" fill="none" />
    </svg>
    <canvas ref={ref} data-3d-ready={status === 'ready' ? 'true' : undefined} role="img" aria-label="真实三维橙紫粒子 X：四个有纵深的粒子流分别连接社交、演讲、客服和销售" style={{ display: status === 'ready' ? 'block' : 'none', position: 'absolute', left: -598, top: -130, width: 2050, height: 574 }} />
  </div>;
}

const ExpansionVision: Page = () => <Wide name="expansion-vision">
  <At className="cx-enter" style={{ left: 64, top: 49, fontSize: 72, lineHeight: 1.2, fontWeight: 550 }}>从医药代表，走向更多重要对话。</At>
  <At style={{ left: 1450, top: 56, fontSize: 22, color: muted }}>商业计划</At>
  <At style={{ left: 1450, top: 94, fontSize: 26, lineHeight: 1.3, color: '#53674F' }}>药企试点 → 团队订阅 + 场景服务</At>
  <VisionParticles />
  <At style={{ left: 770, top: 78, width: 520, height: 520, zIndex: 1 }}>
    <img className="cx-x" src={dimensionalX} alt="四个端点向外连接的 CueX 立体 X" style={{ width: 520, height: 520, filter: 'drop-shadow(13px 20px 12px #39463720)' }} />
  </At>
  <At className="cx-vision-label" style={{ left: 200, top: 170, width: 390, textAlign: 'right', zIndex: 2 }}><p style={{ fontSize: 48, lineHeight: 1.2 }}>社交</p><p style={{ marginTop: 14, fontSize: 30, color: '#60705F' }}>陌生人破冰</p></At>
  <At className="cx-vision-label" style={{ left: 1458, top: 170, width: 500, zIndex: 2 }}><p style={{ fontSize: 48, lineHeight: 1.2 }}>演讲</p><p style={{ marginTop: 14, fontSize: 30, color: '#60705F' }}>即席问答</p></At>
  <At className="cx-vision-label" style={{ left: 200, top: 365, width: 390, textAlign: 'right', zIndex: 2 }}><p style={{ fontSize: 48, lineHeight: 1.2 }}>客服</p><p style={{ marginTop: 14, fontSize: 30, color: '#60705F' }}>异议与投诉</p></At>
  <At className="cx-vision-label" style={{ left: 1458, top: 365, width: 500, zIndex: 2 }}><p style={{ fontSize: 48, lineHeight: 1.2, fontWeight: 600, color: '#9F542C' }}>销售</p><p style={{ marginTop: 14, fontSize: 32, fontWeight: 550, color: '#9F542C' }}>医药代表起步</p></At>
  <At className="cx-vision-label" style={{ left: 64, top: 510, fontSize: 24, color: muted, zIndex: 2 }}>记性好了一点　　路皓然 / 任逸康</At>
</Wide>;

export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, keyframes: [{ opacity: 1 }, { opacity: 1 }] },
  enter: { duration: 260, easing: 'cubic-bezier(0,0,.2,1)', keyframes: [{ opacity: 0, transform: 'perspective(2000px) rotateY(-.35deg) translateY(6px)' }, { opacity: 1, transform: 'perspective(2000px) rotateY(0deg) translateY(0)' }] },
};
export const meta: SlideMeta = { title: 'CueX · 医药代表的临场应对训练', createdAt: '2026-10-31T20:58:49.719Z' };

// Speaking allocation: 30 + 10 + 30 + 20 + 45 = 135 s. Film after page 2: 45 s. Total: 180 s.
export const notes: (string | undefined)[] = [
  '【30 秒；累计 0:30】我们是“记性好了一点”，路皓然和任逸康。CueX 面向医药代表的临场应对训练。公开资料提示，人工陪练需要经理和同事投入时间，而医生的具体追问又要求临场调整。比如代表正在介绍降压效果，医生却关心高龄、肾功能不好的患者。我们要练的，就是停下原稿，先回应这些人群的证据范围，再选择相关信息。\n【研究边界，不朗读】依据见 ppt/docs/research-basis.md。ZS 与 UMU 是公开供应商资料，不是团队的一手访谈或独立效果研究；团队没有真实访谈、试用或客户接触。图中路径为对话转向示意，不是测量音频。',
  '【10 秒；累计 0:40】这就是 CueX：一位能听、能追问、也能撤销追问的 AI 临场演练助手。接下来四十五秒，直接看产品。\n【此处播放独立 45 秒视频；片尾累计 1:25。视频不计入本页 10 秒。】\n【素材边界，不朗读】演示素材不作为实时模型性能基准；ANSHU-3 及临床数字属于虚构训练材料，不代表临床建议或已验证的教育效果。',
  '【30 秒；累计 1:55】刚才的交互背后，是两条同时运行的通路。System 1 持续做小判断，跟踪代表有没有回应当前关切；System 2 并行准备可能需要的追问。候选准备完成，并不等于已经进入对话。Controller 在输出前重新核对：继续听、追问，还是撤销。这个分离让系统可以提前准备，也给代表自行修正的空间。',
  '【20 秒；累计 2:15】训练不止于完成一段对话。先在复盘中定位这次主动补答与追问撤销，再减少辅助，让医生更早提问，练习能否自行完成调整。我们希望把具体片段带进下一次练习，逐步减少对提示的依赖。\n【事实边界，不朗读】以上是训练流程与设计目标，不是已经证实的教育效果。',
  '【45 秒；累计 3:00】最后是商业与愿景。药企培训部门是潜在付费方，我们计划从药企小组试点开始，验证团队订阅和场景服务。试点先看回应相关性、少提示后的独立完成度与教练投入，再决定下一步。这个 X 的四端，是未来的拓展方向：社交练陌生人破冰，演讲练即席问答，销售从医药代表起步，客服练异议与投诉。当前只聚焦医药训练，其他都是愿景。先把这个起点做好，再走向更多重要对话。谢谢。\n【事实边界，不朗读】没有真实访谈、试用或客户接触记录；付费方、订阅与场景服务仍待验证，没有价格、合同、收入或效果数字可披露。\n【提交联系信息，不朗读】队长：路皓然；队员：任逸康；团队：记性好了一点；赛道：AI + 医疗健康。',
];

export default [Cover, ProductBridge, TwoStreams, Practice, ExpansionVision] satisfies Page[];
