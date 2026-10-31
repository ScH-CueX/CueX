import React from 'react';
import {Cue, LINES, Mark} from '../content/timeline';
import dialogue from '../content/dialogue.json';
import {C, EASE, FONT, clamp01, mix, rgba} from '../theme';
import {LiveCaption} from './LiveCaption';
import {VoiceWave} from './VoiceWave';

type Props = {cues: Cue[]; frame: number; marks: Mark[]; left: number; bottom: number; width: number; big?: number; small?: number};

const HEADER = 46;
const GAP = 34;
const estimate = (cue: Cue, size: number, width: number) => {
  const perLine = Math.max(1, Math.floor(width / (size * 1.01)));
  return HEADER + Math.ceil(cue.chars.length / perLine) * size * 1.42 + GAP + (cue.cut ? 36 : 0);
};

// Conversation stack. The newest utterance sits at the bottom in large type; older ones shrink and fade upward.
export const Utterances: React.FC<Props> = ({cues, frame, marks, left, bottom, width, big = 50, small = 31}) => {
  const started = cues.filter((c) => c.from <= frame || c.from < 0).sort((a, b) => a.from - b.from);
  let acc = 0;
  const items = [...started].reverse().map((cue, idx, arr) => {
    const newer = arr.slice(0, idx);
    const age = newer.reduce((sum, n) => sum + EASE.inOut(clamp01((frame - n.from) / 14)), 0);
    const appear = cue.from < 0 ? 1 : EASE.out(clamp01((frame - cue.from) / 12));
    const size = mix(big, small, clamp01(age));
    const opacity = (age < 1 ? mix(1, 0.46, age) : age < 2 ? mix(0.46, 0.2, age - 1) : mix(0.2, 0, clamp01(age - 2))) * appear;
    const y = acc;
    acc += estimate(cue, size, width) * appear;
    return {cue, size, opacity, y, appear};
  });
  return (
    <>
      {items.map(({cue, size, opacity, y, appear}) => {
        const speaker = LINES[cue.id].speaker;
        const label = dialogue.voices[speaker].label;
        const isDoctor = speaker === 'doctor';
        const h = estimate(cue, size, width);
        return (
          <div
            key={cue.id}
            style={{
              position: 'absolute',
              left,
              width,
              bottom: bottom + y,
              height: h,
              opacity,
              transform: `translateY(${(1 - appear) * 40}px)`,
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 16, height: HEADER - 10}}>
              <div style={{width: 8, height: 8, borderRadius: 8, background: isDoctor ? C.paper : C.dim}} />
              <div style={{fontFamily: FONT.sans, fontSize: 20, color: isDoctor ? C.paper : C.soft, letterSpacing: '0.12em'}}>{label}</div>
              <VoiceWave cue={cue} frame={frame} color={isDoctor ? C.paper : rgba(C.paper, 0.6)} bars={14} height={24} />
            </div>
            <LiveCaption cue={cue} frame={frame} size={size} color={isDoctor ? C.paper : rgba(C.paper, 0.86)} marks={marks} weight={isDoctor ? 500 : 400} />
            {cue.cut && frame >= cue.end ? (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: FONT.mono,
                  fontSize: 16,
                  letterSpacing: '0.2em',
                  color: C.cue,
                  opacity: clamp01((frame - cue.end) / 10),
                }}
              >
                医生追问，讲稿中断
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
};
