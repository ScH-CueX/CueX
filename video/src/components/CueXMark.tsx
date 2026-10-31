import React from 'react';
import {evolvePath} from '@remotion/paths';
import {C, EASE, FONT, clamp01, ramp, rgba} from '../theme';

// Placeholder wordmark: "Cue" in Instrument Serif plus an X drawn by two crossing strokes.
// The amber stroke is System 1, the violet stroke is System 2. Replace when the real logo exists.
export const CueXMark: React.FC<{frame: number; start: number; size?: number}> = ({frame, start, size = 220}) => {
  const box = size * 0.66;
  const a = `M ${box * 0.06} ${box * 0.04} L ${box * 0.94} ${box * 0.96}`;
  const b = `M ${box * 0.94} ${box * 0.04} L ${box * 0.06} ${box * 0.96}`;
  const pa = ramp(frame, start + 8, start + 22, EASE.out);
  const pb = ramp(frame, start + 14, start + 40, EASE.inOut);
  const ea = evolvePath(Math.max(0.0001, pa), a);
  const eb = evolvePath(Math.max(0.0001, pb), b);
  const spark = clamp01(1 - Math.abs(frame - (start + 27)) / 14);
  const word = ramp(frame, start, start + 26);
  return (
    <div style={{display: 'flex', alignItems: 'baseline', gap: size * 0.02}}>
      <span
        style={{
          fontFamily: FONT.display,
          fontSize: size,
          lineHeight: 1,
          color: C.paper,
          opacity: word,
          filter: `blur(${(1 - word) * 14}px)`,
          letterSpacing: '-0.01em',
        }}
      >
        Cue
      </span>
      <svg width={box} height={box} style={{overflow: 'visible'}}>
        <defs>
          <filter id="xglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={size * 0.03} />
          </filter>
        </defs>
        <path d={a} stroke={C.cue} strokeWidth={size * 0.07} strokeLinecap="round" fill="none" strokeDasharray={ea.strokeDasharray} strokeDashoffset={ea.strokeDashoffset} filter="url(#xglow)" opacity={0.7} />
        <path d={b} stroke={C.deep} strokeWidth={size * 0.07} strokeLinecap="round" fill="none" strokeDasharray={eb.strokeDasharray} strokeDashoffset={eb.strokeDashoffset} filter="url(#xglow)" opacity={0.7} />
        <path d={a} stroke={C.cue} strokeWidth={size * 0.052} strokeLinecap="round" fill="none" strokeDasharray={ea.strokeDasharray} strokeDashoffset={ea.strokeDashoffset} />
        <path d={b} stroke={C.deep} strokeWidth={size * 0.052} strokeLinecap="round" fill="none" strokeDasharray={eb.strokeDasharray} strokeDashoffset={eb.strokeDashoffset} />
        <circle cx={box / 2} cy={box / 2} r={size * 0.09 * (0.6 + spark)} fill={rgba(C.paper, 0.9 * spark)} filter="url(#xglow)" />
      </svg>
    </div>
  );
};
