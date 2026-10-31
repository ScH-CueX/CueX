import React from 'react';
import {C, EASE, FONT, clamp01, mix, ramp} from '../theme';
import {RevealText} from './RevealText';

// Big centered chapter card that hands over to a small label in the top bar.
export const ChapterTitle: React.FC<{index: string; title: string; frame: number; hold: number; dim?: boolean}> = ({index, title, frame, hold, dim}) => {
  const leave = ramp(frame, hold, hold + 16, EASE.inOut);
  const corner = ramp(frame, hold + 6, hold + 22);
  return (
    <>
      {leave < 1 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            opacity: 1 - leave,
            transform: `scale(${mix(1, 0.94, leave)})`,
            filter: `blur(${leave * 12}px)`,
            background: dim ? `rgba(7,8,11,${0.55 * (1 - leave)})` : undefined,
          }}
        >
          <div style={{fontFamily: FONT.display, fontStyle: 'italic', fontSize: 110, lineHeight: 1, color: C.cue, opacity: clamp01(frame / 10)}}>{index}</div>
          <RevealText text={title} frame={frame} start={4} stagger={1.2} style={{fontFamily: FONT.serif, fontSize: 64, fontWeight: 600, color: C.paper, letterSpacing: '0.04em'}} />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: 232,
          top: 54,
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          opacity: corner,
          transform: `translateX(${(1 - corner) * 16}px)`,
        }}
      >
        <span style={{fontFamily: FONT.mono, fontSize: 18, color: C.cue, letterSpacing: '0.1em'}}>{index}</span>
        <span style={{fontFamily: FONT.sans, fontSize: 21, color: C.soft, letterSpacing: '0.06em'}}>{title}</span>
      </div>
    </>
  );
};
