import {Easing, interpolate} from 'remotion';

export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const C = {
  ink: '#07080B',
  ink2: '#0E1016',
  paper: '#ECE8DF',
  soft: '#B9B5AC',
  dim: '#7E828C',
  faint: '#3C4049',
  line: 'rgba(236,232,223,0.10)',
  cue: '#FF7A2F',
  deep: '#8E8CFF',
  ok: '#7FE3C3',
};

export const FONT = {
  sans: '"CueX Sans SC", "PingFang SC", sans-serif',
  serif: '"CueX Serif SC", "Songti SC", serif',
  display: '"CueX Display", "CueX Serif SC", serif',
  mono: '"CueX Mono", "CueX Sans SC", ui-monospace, monospace',
  latin: '"CueX Latin", "CueX Sans SC", sans-serif',
};

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  linear: (t: number) => t,
};

// 0..1 progress between two frames, clamped on both sides.
export const ramp = (frame: number, from: number, to: number, easing: (t: number) => number = EASE.out) =>
  interpolate(frame, [from, Math.max(to, from + 0.001)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const timecode = (frame: number) => {
  const s = Math.max(0, frame) / FPS;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${String(m).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
};
