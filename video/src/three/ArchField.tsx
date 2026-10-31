import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {C, EASE, H, clamp01, mix, ramp} from '../theme';
import {FOV, Vec, cameraPose} from './camera';

// Colors are written as-is; the canvas uses linear output and no tone mapping.
THREE.ColorManagement.enabled = false;

const hex = (h: string): Vec => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const PAPER = hex(C.paper);
const CUE = hex(C.cue);
const DEEP = hex(C.deep);
const OK = hex(C.ok);

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const table = (n: number, seed: number) => {
  const r = rng(seed);
  return Float32Array.from({length: n}, () => r());
};
const fract = (x: number) => x - Math.floor(x);

const LUT_N = 600;
const makeLut = (pts: Vec[]) => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const lut = new Float32Array(LUT_N * 3);
  for (let i = 0; i < LUT_N; i++) {
    const p = curve.getPointAt(i / (LUT_N - 1));
    lut.set([p.x, p.y, p.z], i * 3);
  }
  return lut;
};
const sample = (lut: Float32Array, u: number, out: number[]) => {
  const f = clamp01(u) * (LUT_N - 1);
  const i = Math.floor(f);
  const j = Math.min(LUT_N - 1, i + 1);
  const t = f - i;
  for (let k = 0; k < 3; k++) out[k] = mix(lut[i * 3 + k], lut[j * 3 + k], t);
  return out;
};

export const FORK: Vec = [-3.2, 0, 0];
export const GATE: Vec = [3.6, 0, 0];
export const CORE: Vec = [0, -1.5, 0];
const S1 = makeLut([FORK, [-1.7, 1.2, 0.25], [0, 1.45, 0], [1.7, 1.2, -0.25], [3.2, 0, 0]]);
const S2 = makeLut([FORK, [-1.7, -1.25, -0.25], CORE, [1.7, -1.25, 0.25], [3.2, 0, 0]]);
const s2Point = (u: number) => sample(S2, u, [0, 0, 0]) as Vec;

// Soft additive point sprites. Size is in world units, so depth reads naturally.
const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {uScale: {value: H / (2 * Math.tan((FOV * Math.PI) / 360))}},
  vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    uniform float uScale;
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / -mv.z;
      gl_Position = projectionMatrix * mv;
      vAlpha = aAlpha;
      vColor = aColor;
    }`,
  fragmentShader: `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * vAlpha;
      if (a < 0.003) discard;
      gl_FragColor = vec4(vColor, a);
    }`,
});

type Buffers = {pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array};

const usePoints = (count: number) =>
  useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const b: Buffers = {pos: new Float32Array(count * 3), col: new Float32Array(count * 3), size: new Float32Array(count), alpha: new Float32Array(count)};
    geo.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(b.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(b.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(b.alpha, 1));
    return {geo, b};
  }, [count]);

const commit = (geo: THREE.BufferGeometry) => {
  for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
};

const put = (b: Buffers, i: number, x: number, y: number, z: number, c: Vec, s: number, a: number) => {
  b.pos.set([x, y, z], i * 3);
  b.col.set(c, i * 3);
  b.size[i] = s;
  b.alpha[i] = a;
};

const N_DUST = 900;
const N_IN = 520;
const N_S1 = 340;
const S1_TRAIL = 3;
const N_S2 = 320;
const N_OUT = 260;
const N_BURST = 260;
const R = {
  dust: [table(N_DUST, 1), table(N_DUST, 2), table(N_DUST, 3), table(N_DUST, 4)],
  input: [table(N_IN, 11), table(N_IN, 12), table(N_IN, 13), table(N_IN, 14)],
  s1: [table(N_S1, 21), table(N_S1, 22), table(N_S1, 23)],
  s2: [table(N_S2, 31), table(N_S2, 32), table(N_S2, 33)],
  out: [table(N_OUT, 41), table(N_OUT, 42), table(N_OUT, 43)],
  burst: [table(N_BURST, 51), table(N_BURST, 52), table(N_BURST, 53), table(N_BURST, 54)],
};

export type ArchBeats = {
  aFrom: number; // candidate A leaves the core
  aGate: number; // candidate A passes the gate and is spoken
  bFrom: number; // candidate B leaves the core
  bStop: number; // candidate B's condition fails
  bGone: number; // candidate B fully dissolved
};

export const candidateA = (frame: number, beats: ArchBeats): Vec | null => {
  if (frame < beats.aFrom || frame > beats.aGate + 2) return null;
  const p = EASE.inOut(clamp01((frame - beats.aFrom) / (beats.aGate - beats.aFrom)));
  if (p < 0.85) return s2Point(mix(0.5, 1, p / 0.85));
  const end = s2Point(1);
  const t = (p - 0.85) / 0.15;
  return [mix(end[0], GATE[0], t), mix(end[1], GATE[1], t), mix(end[2], GATE[2], t)];
};

export const candidateB = (frame: number, beats: ArchBeats): Vec | null => {
  if (frame < beats.bFrom) return null;
  const p = EASE.out(clamp01((Math.min(frame, beats.bStop) - beats.bFrom) / (beats.bStop - beats.bFrom)));
  return s2Point(mix(0.5, 0.8, p));
};

const Card: React.FC<{at: Vec | null; color: string; opacity: number; scale?: number}> = ({at, color, opacity, scale = 1}) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.62, 0.36)), []);
  if (!at || opacity <= 0) return null;
  return (
    <group position={at} scale={scale}>
      <mesh>
        <planeGeometry args={[0.62, 0.36]} />
        <meshBasicMaterial color={color} transparent opacity={0.14 * opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </lineSegments>
    </group>
  );
};

export const ArchField: React.FC<{frame: number; dur: number; beats: ArchBeats}> = ({frame, dur, beats}) => {
  const camera = useThree((s) => s.camera);
  const {pos, target} = cameraPose(frame, dur);
  camera.position.set(...pos);
  camera.lookAt(...target);

  const dust = usePoints(N_DUST);
  const input = usePoints(N_IN);
  const s1 = usePoints(N_S1 * S1_TRAIL);
  const s2 = usePoints(N_S2);
  const out = usePoints(N_OUT);
  const burst = usePoints(N_BURST);
  const tmp = [0, 0, 0];

  const flash = frame >= beats.aGate ? Math.exp(-(frame - beats.aGate) / 10) : 0;
  const reveal = ramp(frame, 0, 40);

  for (let i = 0; i < N_DUST; i++) {
    const [a, b, c, d] = R.dust.map((t) => t[i]);
    const x = -14 + a * 28 + Math.sin(frame * 0.004 + d * 40) * 0.4;
    const y = -7 + b * 14 + Math.cos(frame * 0.003 + a * 30) * 0.3;
    put(dust.b, i, x, y, -12 + c * 16, PAPER, 0.025 + d * 0.035, (0.12 + d * 0.25) * reveal);
  }
  commit(dust.geo);

  // Live conversation entering from the left as a speech-like ribbon.
  for (let i = 0; i < N_IN; i++) {
    const [a, b, c, d] = R.input.map((t) => t[i]);
    const u = fract(a + frame * 0.006);
    const x = -11 + u * (FORK[0] + 11);
    const env = 0.55 + 0.45 * Math.sin(x * 0.7 + frame * 0.03);
    const y = 0.24 * Math.sin(x * 2.6 - frame * 0.16) * env + (b - 0.5) * 0.12;
    put(input.b, i, x, y, (c - 0.5) * 0.3, PAPER, 0.035 + d * 0.05, 0.7 * clamp01((x + 9) / 3) * reveal);
  }
  commit(input.geo);

  // System 1: fast amber lane with short trails.
  for (let i = 0; i < N_S1; i++) {
    const [a, b, c] = R.s1.map((t) => t[i]);
    for (let k = 0; k < S1_TRAIL; k++) {
      const u = fract(a + frame * 0.014) - k * 0.007;
      sample(S1, u, tmp);
      const edge = clamp01(u / 0.06) * clamp01((1 - u) / 0.06);
      put(s1.b, i * S1_TRAIL + k, tmp[0], tmp[1] + (b - 0.5) * 0.08, tmp[2] + (c - 0.5) * 0.08, CUE, (0.04 + c * 0.05) * (1 - k * 0.25), 0.85 * (1 - k * 0.3) * edge * reveal);
    }
  }
  commit(s1.geo);

  // System 2: slow violet lane that swirls around the knowledge core.
  for (let i = 0; i < N_S2; i++) {
    const [a, b, c] = R.s2.map((t) => t[i]);
    const u = fract(a + frame * 0.0045);
    sample(S2, u, tmp);
    const r = 0.5 * Math.exp(-(((u - 0.5) / 0.17) ** 2)) * (0.4 + b * 0.6);
    const ang = b * 40 + frame * 0.045 * (c > 0.5 ? 1 : -1);
    const edge = clamp01(u / 0.06) * clamp01((1 - u) / 0.06);
    put(s2.b, i, tmp[0] + (c - 0.5) * 0.06, tmp[1] + Math.cos(ang) * r, tmp[2] + Math.sin(ang) * r, DEEP, 0.04 + c * 0.05, 0.85 * edge * reveal);
  }
  commit(s2.geo);

  // Output lane after the gate. It brightens when a candidate is spoken.
  for (let i = 0; i < N_OUT; i++) {
    const [a, b, c] = R.out.map((t) => t[i]);
    const u = fract(a + frame * 0.007);
    const x = GATE[0] + u * 7.4;
    const y = 0.12 * Math.sin(x * 2.2 - frame * 0.14) + (b - 0.5) * 0.08;
    put(out.b, i, x, y, (c - 0.5) * 0.2, PAPER, 0.035 + c * 0.045, (0.3 + flash * 0.7) * clamp01(u / 0.05) * reveal);
  }
  commit(out.geo);

  // Candidate B dissolves into mint particles when its condition fails.
  const bAt = candidateB(frame, beats);
  const dissolve = clamp01((frame - beats.bStop) / (beats.bGone - beats.bStop));
  for (let i = 0; i < N_BURST; i++) {
    const [a, b, c, d] = R.burst.map((t) => t[i]);
    if (frame < beats.bStop || !bAt || dissolve >= 1) {
      put(burst.b, i, 0, 0, 0, OK, 0, 0);
      continue;
    }
    const e = EASE.out(dissolve);
    const th = a * Math.PI * 2;
    const ph = Math.acos(2 * b - 1);
    const dist = (0.15 + c * 1.1) * e;
    const x = bAt[0] + (a - 0.5) * 0.62 + Math.sin(ph) * Math.cos(th) * dist + e * 0.4;
    const y = bAt[1] + (b - 0.5) * 0.36 + Math.cos(ph) * dist * 0.6 + e * (0.3 + d * 0.5);
    const z = bAt[2] + Math.sin(ph) * Math.sin(th) * dist;
    put(burst.b, i, x, y, z, OK, 0.04 + d * 0.04, Math.pow(1 - dissolve, 1.3));
  }
  commit(burst.geo);

  // Judgment pulses along the System 1 lane.
  const pulses = Array.from({length: 6}, (_, k) => {
    const period = 54;
    const age = fract((frame + k * 9) / period);
    const idx = Math.floor((frame + k * 9) / period) * 6 + k;
    const u = 0.12 + fract(idx * 0.618) * 0.76;
    return {p: sample(S1, u, [0, 0, 0]) as Vec, s: 0.05 + age * 0.3, o: (1 - age) ** 2 * 0.55 * reveal};
  });

  const aAt = candidateA(frame, beats);
  const bOpacity = frame < beats.bStop ? 1 : 1 - dissolve;

  return (
    <>
      {[dust, input, s1, s2, out, burst].map((p, i) => (
        <points key={i} geometry={p.geo} material={material} frustumCulled={false} />
      ))}

      {pulses.map(({p, s, o}, k) => (
        <mesh key={k} position={p} scale={s}>
          <ringGeometry args={[0.95, 1, 64]} />
          <meshBasicMaterial color={C.cue} transparent opacity={o} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}

      <mesh position={CORE} rotation={[frame * 0.011, frame * 0.017, 0]}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshBasicMaterial color={C.deep} wireframe transparent opacity={0.65 * reveal} />
      </mesh>
      <mesh position={CORE} rotation={[-frame * 0.008, -frame * 0.012, 0.4]}>
        <icosahedronGeometry args={[0.7, 0]} />
        <meshBasicMaterial color={C.deep} wireframe transparent opacity={0.22 * reveal} />
      </mesh>

      <group position={GATE} rotation={[0, Math.PI / 2 - 0.75, 0]} scale={1 + flash * 0.25}>
        <mesh>
          <torusGeometry args={[0.62, 0.014, 8, 160]} />
          <meshBasicMaterial color={C.paper} transparent opacity={(0.65 + flash * 0.35) * reveal} />
        </mesh>
        <group rotation={[0, 0, frame * 0.01]}>
          {Array.from({length: 24}, (_, k) => {
            const a = (k / 24) * Math.PI * 2;
            return (
              <mesh key={k} position={[Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0]} rotation={[0, 0, a]}>
                <planeGeometry args={[0.08, 0.012]} />
                <meshBasicMaterial color={C.paper} transparent opacity={0.4 * reveal} side={THREE.DoubleSide} />
              </mesh>
            );
          })}
        </group>
        <mesh>
          <circleGeometry args={[0.6, 64]} />
          <meshBasicMaterial color={C.paper} transparent opacity={flash * 0.18} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      <Card at={aAt} color={frame >= beats.aGate - 6 ? C.paper : C.deep} opacity={1} scale={1 - clamp01((frame - beats.aGate + 4) / 6) * 0.6} />
      <Card at={bAt} color={frame < beats.bStop ? C.deep : C.ok} opacity={bOpacity} />
    </>
  );
};
