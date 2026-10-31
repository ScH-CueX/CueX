import React from 'react';

/** "Cue" plus an X drawn by two crossing strokes: amber = System 1, violet = System 2. Same mark as the promo video. */
export const Wordmark: React.FC<{ size?: number }> = ({ size = 200 }) => {
  const box = size * 0.66;
  const stroke = size * 0.052;
  const a = `M ${box * 0.06} ${box * 0.04} L ${box * 0.94} ${box * 0.96}`;
  const b = `M ${box * 0.94} ${box * 0.04} L ${box * 0.06} ${box * 0.96}`;
  return (
    <div className="st-wordmark" style={{ gap: size * 0.02 }} aria-label="CueX" role="img">
      <span className="t" style={{ fontSize: size }} aria-hidden="true">Cue</span>
      <svg width={box} height={box} aria-hidden="true">
        <defs>
          <filter id="st-xglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={size * 0.03} /></filter>
        </defs>
        <path className="draw" pathLength={1} d={a} stroke="#FF7A2F" strokeWidth={stroke * 1.35} strokeLinecap="round" fill="none" filter="url(#st-xglow)" opacity={0.7} />
        <path className="draw two" pathLength={1} d={b} stroke="#8E8CFF" strokeWidth={stroke * 1.35} strokeLinecap="round" fill="none" filter="url(#st-xglow)" opacity={0.7} />
        <path className="draw" pathLength={1} d={a} stroke="#FF7A2F" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <path className="draw two" pathLength={1} d={b} stroke="#8E8CFF" strokeWidth={stroke} strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
};
