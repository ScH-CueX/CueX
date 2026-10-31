import React from 'react';
import {C, FONT} from '../theme';

export const SectionLabel: React.FC<{left: number; top: number; tag: string; text: string; appear: number; color?: string}> = ({
  left,
  top,
  tag,
  text,
  appear,
  color = C.dim,
}) => (
  <div style={{position: 'absolute', left, top, display: 'flex', alignItems: 'baseline', gap: 16, opacity: appear, transform: `translateY(${(1 - appear) * 10}px)`}}>
    <span style={{fontFamily: FONT.mono, fontSize: 16, letterSpacing: '0.24em', color}}>{tag}</span>
    <span style={{fontFamily: FONT.sans, fontSize: 19, color: C.dim, letterSpacing: '0.06em'}}>{text}</span>
  </div>
);
