import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender} from 'remotion';
import {clamp01} from '../theme';

type Props = {
  lines: string[];
  fontSize: number;
  weight: number;
  family: string;
  lineHeight: number;
  width: number;
  color: string;
  progress: number; // 0 = intact text, 1 = fully dissolved
  seed?: number;
};

const PAD = 160;
const MAX_DELAY = 1;
const LIFE = 0.5;

const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Text that dissolves left to right into drifting particles.
// The crisp HTML text is masked behind the sweep, and the particles take over from there.
export const TextParticles: React.FC<Props> = ({lines, fontSize, weight, family, lineHeight, width, color, progress, seed = 7}) => {
  const height = Math.ceil(lines.length * fontSize * lineHeight + fontSize * 0.6);
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('Sampling text particles'));
  const released = useRef(false);
  const [pts, setPts] = useState<Float32Array | null>(null);
  const font = `${weight} ${fontSize}px ${family}`;

  const release = () => {
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
  };

  useEffect(() => {
    let cancelled = false;
    document.fonts.load(font, lines.join('')).then(() => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.font = font;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      lines.forEach((line, i) => ctx.fillText(line, 0, (i + 0.5) * fontSize * lineHeight));
      const data = ctx.getImageData(0, 0, width, height).data;
      const rand = mulberry(seed);
      const out: number[] = [];
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (data[(y * width + x) * 4 + 3] > 110) out.push(x, y, rand(), rand(), rand(), rand());
        }
      }
      setPts(new Float32Array(out));
    });
    return () => {
      cancelled = true;
      release();
    };
    // Sampling depends only on the static text layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sweep = progress * (MAX_DELAY + LIFE);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !pts) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    for (let i = 0; i < pts.length; i += 6) {
      const x0 = pts[i];
      const y0 = pts[i + 1];
      const delay = (x0 / width) * 0.85 + pts[i + 2] * 0.15;
      if (delay > sweep) continue;
      const d = clamp01((sweep - delay) / LIFE);
      const e = d * d;
      const ang = pts[i + 3] * Math.PI * 2;
      const dist = 18 + pts[i + 4] * 70;
      const x = x0 + Math.cos(ang) * dist * e + e * 60 + PAD;
      const y = y0 + Math.sin(ang) * dist * e * 0.5 - e * (24 + pts[i + 5] * 70) + PAD;
      const a = Math.pow(1 - d, 1.4);
      if (a <= 0.01) continue;
      const s = 2 - d;
      ctx.globalAlpha = a * 0.16;
      ctx.fillRect(x - s * 1.5, y - s * 1.5, s * 4, s * 4);
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, sweep, color, width]);

  const edge = clamp01(sweep / 0.85) * 100;
  const mask = `linear-gradient(90deg, transparent ${edge - 3}%, black ${edge + 3}%)`;
  return (
    <div style={{position: 'relative', width, height}}>
      <div
        style={{
          fontFamily: family,
          fontSize,
          fontWeight: weight,
          lineHeight,
          color,
          maskImage: progress > 0 ? mask : undefined,
          WebkitMaskImage: progress > 0 ? mask : undefined,
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{whiteSpace: 'pre'}}>
            {line}
          </div>
        ))}
      </div>
      <canvas ref={ref} width={width + PAD * 2} height={height + PAD * 2} style={{position: 'absolute', left: -PAD, top: -PAD, pointerEvents: 'none'}} />
    </div>
  );
};

export const wrapLines = (text: string, perLine: number) => {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += perLine) out.push(chars.slice(i, i + perLine).join(''));
  return out;
};
