import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {CueXMark} from '../components/CueXMark';
import {RevealText} from '../components/RevealText';
import {SceneAudio} from '../components/SceneAudio';
import {C, EASE, FONT, clamp01, ramp, rgba} from '../theme';

// Small motion glyph above each keyword.
const Glyph: React.FC<{kind: number; frame: number; color: string}> = ({kind, frame, color}) => {
  const w = 160;
  const h = 44;
  if (kind === 0) {
    const pts = Array.from({length: 60}, (_, i) => {
      const u = i / 59;
      const y = h / 2 + Math.sin(u * 18 - frame * 0.25) * 12 * Math.sin(u * Math.PI);
      return `${(u * w).toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
      <svg width={w} height={h}>
        <polyline points={pts} stroke={color} strokeWidth={2.2} fill="none" />
      </svg>
    );
  }
  if (kind === 1) {
    return (
      <svg width={w} height={h}>
        <line x1={0} y1={14} x2={w} y2={14} stroke={C.cue} strokeWidth={2.2} strokeDasharray="4 7" strokeDashoffset={-frame * 2.4} />
        <line x1={0} y1={30} x2={w} y2={30} stroke={C.deep} strokeWidth={2.2} strokeDasharray="18 10" strokeDashoffset={-frame * 0.8} />
      </svg>
    );
  }
  return (
    <svg width={w} height={h}>
      {Array.from({length: 22}, (_, i) => {
        const u = i / 21;
        const drift = clamp01(u * 1.6 - 0.5);
        const x = u * w + noise2D('g', i, frame * 0.02) * 6 * drift;
        const y = h / 2 - drift * (8 + noise2D('h', i, frame * 0.03) * 14);
        return <circle key={i} cx={x} cy={y} r={2.4 * (1 - drift * 0.6)} fill={color} opacity={1 - drift * 0.8} />;
      })}
    </svg>
  );
};

const KEYWORDS = [
  {title: '实时理解', sub: 'REAL-TIME UNDERSTANDING', color: C.paper},
  {title: '并行准备', sub: 'PARALLEL PREPARATION', color: C.deep},
  {title: '动态撤销', sub: 'DYNAMIC WITHDRAWAL', color: C.ok},
];

export const Outro: React.FC<{dur: number}> = ({dur}) => {
  const frame = useCurrentFrame();
  const kwOut = ramp(frame, 84, 100, EASE.in);
  const markAt = Math.min(180, dur - 120);
  const end = ramp(frame, dur - 30, dur - 2, EASE.inOut);
  return (
    <AbsoluteFill>
      {frame < 104 ? (
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 120, opacity: 1 - kwOut, filter: `blur(${kwOut * 10}px)`}}>
          {KEYWORDS.map((kw, i) => {
            const p = ramp(frame, 6 + i * 12, 30 + i * 12);
            return (
              <div key={kw.title} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, opacity: p, transform: `translateY(${(1 - p) * 24}px)`}}>
                <Glyph kind={i} frame={frame} color={kw.color} />
                <RevealText text={kw.title} frame={frame} start={10 + i * 12} stagger={2} style={{fontFamily: FONT.serif, fontSize: 76, fontWeight: 600, color: C.paper, letterSpacing: '0.08em'}} />
                <div style={{fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.3em', color: kw.color === C.paper ? C.soft : kw.color}}>{kw.sub}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      {frame >= 100 && frame < markAt + 10 ? (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center'}}>
          <RevealText text="让代表第一次接不住医生的追问，" frame={frame} start={104} stagger={1.2} exit={markAt - 12} style={{fontFamily: FONT.serif, fontSize: 62, fontWeight: 600, color: C.paper}} />
          <RevealText
            text="发生在训练里，而不是重要拜访里。"
            frame={frame}
            start={122}
            stagger={1.2}
            exit={markAt - 10}
            accent={{phrase: '发生在训练里', color: C.cue}}
            style={{fontFamily: FONT.serif, fontSize: 62, fontWeight: 600, color: C.paper}}
          />
        </div>
      ) : null}
      {frame >= markAt - 4 ? (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, opacity: 1 - end}}>
          <div style={{position: 'absolute', width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${rgba(C.cue, 0.1 * ramp(frame, markAt + 20, markAt + 60))}, transparent 60%)`}} />
          <CueXMark frame={frame} start={markAt} size={200} />
          <div style={{fontFamily: FONT.sans, fontSize: 30, color: C.soft, letterSpacing: '0.3em', opacity: ramp(frame, markAt + 34, markAt + 54)}}>医药代表的临场应对训练</div>
          <div style={{fontFamily: FONT.mono, fontSize: 15, color: C.dim, letterSpacing: '0.4em', opacity: ramp(frame, markAt + 46, markAt + 66)}}>REAL-TIME CONVERSATION TRAINING</div>
        </div>
      ) : null}
      <SceneAudio cues={[]} sfx={[{id: 'impact', at: markAt + 22, volume: 0.55}]} />
    </AbsoluteFill>
  );
};
