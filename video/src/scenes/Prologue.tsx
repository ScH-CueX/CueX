import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {RevealText} from '../components/RevealText';
import {C, FONT, H, W, clamp01, ramp, rgba, EASE} from '../theme';

const N = 240;
const BASE_Y = 760;

// A live conversation line. It kinks when the doctor's question arrives off-script,
// then splits into two strands that foreshadow System 1 and System 2.
export const ConversationLine: React.FC<{frame: number; palette?:typeof C; light?:boolean}> = ({frame,palette=C,light=false}) => {
  const kink = 46;
  const split = ramp(frame, 118, 160, EASE.inOut);
  const draw = ramp(frame, 0, 34, EASE.out);
  const strand = (offset: number, seed: string) => {
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (u > draw) break;
      const x = u * W;
      const drift = noise2D(seed, u * 2.4, frame * 0.012) * 10;
      const env = clamp01(1 - Math.abs(u - 0.5) * 1.9) * (0.55 + 0.45 * noise2D(`${seed}-e`, u * 5 - frame * 0.03, 1));
      const carrier = Math.sin(u * 110 - frame * 0.32) * 14 * env;
      let spike = 0;
      if (frame >= kink) {
        const age = frame - kink;
        const center = 0.52 + age * 0.004;
        spike = -150 * Math.exp(-((u - center) ** 2) / 0.0009) * Math.exp(-age / 16) * Math.cos((u - center) * 60);
      }
      const sep = offset * split * (34 + 18 * Math.sin(u * 7 + frame * 0.04)) * clamp01(1 - Math.abs(u - 0.5) * 1.4);
      pts.push(`${x.toFixed(1)},${(BASE_Y + drift + carrier + spike + sep).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const main = strand(0, 'main');
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
      <defs>
        <filter id="lineglow" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id="edgefade" x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.15" stopColor="white" stopOpacity="1" />
          <stop offset="0.85" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="edgemask">
          <rect width={W} height={H} fill="url(#edgefade)" />
        </mask>
      </defs>
      <g mask="url(#edgemask)">
        <polyline points={main} fill="none" stroke={rgba(palette.paper, 0.5 * (1 - split) * (light?.2:1))} strokeWidth={6} filter="url(#lineglow)" />
        <polyline points={main} fill="none" stroke={rgba(palette.paper, 0.9 * (1 - split))} strokeWidth={2} />
        {split > 0 ? (
          <>
            <polyline points={strand(-1, 'a')} fill="none" stroke={rgba(palette.cue, 0.55 * split * (light?.2:1))} strokeWidth={6} filter="url(#lineglow)" />
            <polyline points={strand(-1, 'a')} fill="none" stroke={rgba(palette.cue, 0.95 * split)} strokeWidth={2} />
            <polyline points={strand(1, 'b')} fill="none" stroke={rgba(palette.deep, 0.55 * split * (light?.2:1))} strokeWidth={6} filter="url(#lineglow)" />
            <polyline points={strand(1, 'b')} fill="none" stroke={rgba(palette.deep, 0.95 * split)} strokeWidth={2} />
          </>
        ) : null}
      </g>
    </svg>
  );
};

export const Prologue: React.FC = () => {
  const frame = useCurrentFrame();
  const center: React.CSSProperties = {position: 'absolute', left: 0, right: 0, textAlign: 'center', color: C.paper};
  return (
    <AbsoluteFill>
      <ConversationLine frame={frame} />
      <div style={{...center, top: 360}}>
        <RevealText text="资料都学过了。" frame={frame} start={8} exit={100} style={{fontFamily: FONT.serif, fontSize: 58, fontWeight: 500, color: C.soft}} />
      </div>
      <div style={{...center, top: 456}}>
        <RevealText
          text="可医生的追问，不会按你的稿子来。"
          frame={frame}
          start={34}
          exit={104}
          accent={{phrase: '不会按你的稿子来', color: C.cue}}
          style={{fontFamily: FONT.serif, fontSize: 66, fontWeight: 600}}
        />
      </div>
      <div style={{...center, top: 330}}>
        <RevealText text="你还没说完，AI 已经在理解；" frame={frame} start={118} stagger={1.3} style={{fontFamily: FONT.serif, fontSize: 70, fontWeight: 600}} />
      </div>
      <div style={{...center, top: 440}}>
        <RevealText
          text="你改变表达，它也会改变行动。"
          frame={frame}
          start={140}
          stagger={1.3}
          accent={{phrase: '改变行动', color: C.cue}}
          style={{fontFamily: FONT.serif, fontSize: 70, fontWeight: 600}}
        />
      </div>
      <div style={{...center, top: 900, fontFamily: FONT.mono, fontSize: 17, letterSpacing: '0.4em', color: C.dim, opacity: ramp(frame, 160, 185)}}>
        CUEX  医药代表的临场应对训练
      </div>
    </AbsoluteFill>
  );
};
