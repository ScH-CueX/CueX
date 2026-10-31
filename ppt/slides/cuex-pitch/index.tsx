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
  <At style={{ left: 70, top: 43, fontSize: 23, color: muted }}>AI + 医疗健康　信达生物 · 销售培训</At>
  <At className="cx-enter" style={{ left: 64, top: 78, fontFamily: 'var(--osd-font-display)', fontSize: 190, lineHeight: 1, letterSpacing: -3 }}>Cue</At>
  <At className="cx-enter" style={{ left: 72, top: 315, fontSize: 31, lineHeight: 1.4, color: muted }}>医药代表的</At>
  <At className="cx-enter" style={{ left: 66, top: 365, fontSize: 77, fontWeight: 550, lineHeight: 1.2 }}>临场应对训练</At>
  <At style={{ left: 72, top: 504, fontSize: 24 }}>记性好了一点　　路皓然 / 任逸康</At>

  <At style={{ left: 648, top: -31, width: 624, height: 624 }}>
    <img className="cx-x" src={dimensionalX} alt="CueX 的琥珀色与薰衣草色立体 X" style={{ width: 624, height: 624, filter: 'drop-shadow(18px 25px 16px #39463723)' }} />
  </At>

  <At className="cx-enter" style={{ left: 1358, top: 174, width: 620, fontSize: 56, lineHeight: 1.55, color: '#34473A' }}>
    从背熟资料，<br />到接住变化。
  </At>
  <svg aria-label="两条对话线交汇后继续向前" viewBox="0 0 640 100" style={{ position: 'absolute', left: 1347, top: 365, width: 640, height: 100 }}>
    <path className="cx-script" pathLength="1000" d="M12 25 C150 25 184 78 320 78 S495 25 628 25" stroke="#C26B3D" strokeWidth="2" fill="none" />
    <path className="cx-script" pathLength="1000" d="M12 78 C150 78 184 25 320 25 S495 78 628 78" stroke="#8A79BA" strokeWidth="2" fill="none" />
    <circle cx="628" cy="25" r="4" fill="#C26B3D" /><circle cx="628" cy="78" r="4" fill="#8A79BA" />
  </svg>
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
      {status === 'fallback' && <At style={{ left: 64, top: 474, fontSize: 20, color: '#805637' }}>三维渲染不可用 · 当前为静态机制示意</At>}
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
  <At style={{ left: 64, bottom: 28, fontSize: 23, color: muted }}>记性好了一点　路皓然 / 任逸康</At>
</Wide>;

export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, keyframes: [{ opacity: 1 }, { opacity: 1 }] },
  enter: { duration: 260, easing: 'cubic-bezier(0,0,.2,1)', keyframes: [{ opacity: 0, transform: 'perspective(2000px) rotateY(-.35deg) translateY(6px)' }, { opacity: 1, transform: 'perspective(2000px) rotateY(0deg) translateY(0)' }] },
};
export const meta: SlideMeta = { title: 'CueX · 医药代表的临场应对训练', createdAt: '2026-10-31T20:58:49.719Z' };

// Speaking allocation: 18 + 22 + 30 + 35 + 30 = 135 s. Separate film after page 2: 45 s. Total: 180 s.
export const notes: (string | undefined)[] = [
  '【18 秒；累计 0:18】大家好，我们是“记性好了一点”，路皓然和任逸康。CueX 面向医药代表的临场应对训练。我们关心的是：准备好的知识，如何在医生改变问题时，变成准确的回应。从背熟资料到接住变化，是我们想练的这一小步。',
  '【22 秒；累计 0:40】背熟资料，并不意味着能接住追问。代表还在顺着原稿介绍降压效果，医生却问：高龄、肾功能不好的患者呢？继续照稿讲，就会绕开关切。我们要练的是停下原稿，先说明这些人群的证据范围，再选择合适的信息回应。接下来用四十五秒，看 CueX 如何给出这种变化。\n【视觉说明，不朗读】路径仅示意演示对话的转向，不是音频波形或测量数据。\n【此处播放独立 45 秒产品片；片尾累计 1:25。视频不计入本页 22 秒。】',
  '【30 秒；累计 1:55】CueX 的判断和准备同时发生。上方的 System 1 持续做小判断，关注代表是否回应了关切；下方的 System 2 并行准备可能用到的追问。候选准备完成，不等于已经进入对话。到输出之前，Controller 再检查一次：应该继续听、真的追问，还是撤销。两条通路在这里汇合，让系统既有所准备，也能给代表自行修正的空间。当前画面是机制说明，演示回放并不是实时模型性能基准。',
  '【35 秒；累计 2:30】左上这句追问已经准备好，但还没进入对话。右侧是代表完整的主动补答：研究排除了这一人群，目前没有证据，说明书也不建议使用。补答到达后，系统更新判断，原追问的依据失效，于是左下这句话被撤销。不是等系统说完再纠正，而是输出之前就重新核对。这三处都是实际演示中的原文裁切。当前演示为确定性回放，ANSHU-3 及临床数字是虚构训练材料，不代表真实临床建议或实时模型性能。',
  '【30 秒；累计 3:00】复盘先定位到刚才这个具体事件：你主动补答，候选追问被撤销。下一次先减少辅助，再让医生更早提问，重新练习听懂关切和调整回应。画面从这次的事件直接接到下一次练习。我们希望最终留下的是独立应对能力，而不是对提示的依赖；这是长期方向，还不能声称训练效果已经验证。CueX，让下一次更靠自己。谢谢。\n【提交联系信息，不朗读】队长：路皓然；电话：[private-contact-removed]；队员：任逸康；团队：记性好了一点；赛道：AI + 医疗健康。',
];

export default [Cover, Interruption, TwoStreams, Withdraw, Practice] satisfies Page[];
