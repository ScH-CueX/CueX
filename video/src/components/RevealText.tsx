import React from 'react';
import {EASE, clamp01, mix} from '../theme';

type Props = {
  text: string;
  frame: number;
  start: number;
  stagger?: number;
  dur?: number;
  exit?: number; // frame where the text starts leaving
  exitDur?: number;
  style?: React.CSSProperties;
  accent?: {phrase: string; color: string};
};

// Per-character reveal: each glyph rises, sharpens from blur and fades in.
export const RevealText: React.FC<Props> = ({text, frame, start, stagger = 1.6, dur = 18, exit, exitDur = 14, style, accent}) => {
  const chars = Array.from(text);
  const accentStart = accent ? Array.from(text.slice(0, Math.max(0, text.indexOf(accent.phrase)))).length : -1;
  const accentEnd = accent ? accentStart + Array.from(accent.phrase).length : -1;
  const leaving = exit === undefined ? 0 : clamp01((frame - exit) / exitDur);
  return (
    <div style={{...style, whiteSpace: 'pre-wrap'}}>
      {chars.map((ch, i) => {
        const p = EASE.out(clamp01((frame - start - i * stagger) / dur));
        const out = EASE.in(clamp01(leaving * 1.6 - (i / Math.max(1, chars.length)) * 0.6));
        const visible = p * (1 - out);
        const inAccent = i >= accentStart && i < accentEnd;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: visible,
              transform: `translateY(${mix(0.35, 0, p) - out * 0.2}em)`,
              filter: `blur(${mix(10, 0, p) + out * 8}px)`,
              color: inAccent ? accent!.color : undefined,
              whiteSpace: ch === ' ' ? 'pre' : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};
