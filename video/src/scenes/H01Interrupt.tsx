import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {ChapterTitle} from '../components/ChapterTitle';
import {SceneAudio} from '../components/SceneAudio';
import {SectionLabel} from '../components/SectionLabel';
import {UnderlyingPanel} from '../components/UnderlyingPanel';
import {Utterances} from '../components/Utterances';
import {H01, firstAt} from '../content/timeline';
import {C, clamp01, ramp, rgba} from '../theme';

export const H01Interrupt: React.FC = () => {
  const frame = useCurrentFrame();
  const {cues, plan, marks, titleHold, panelIn, interrupt} = H01;
  const hit = frame >= interrupt ? clamp01(1 - (frame - interrupt) / 16) : 0;
  const shake = frame >= interrupt && frame < interrupt + 8 ? (random(`shake-${frame}`) - 0.5) * 10 * hit : 0;
  const appear = ramp(frame, panelIn, panelIn + 26);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(60% 50% at 30% 75%, ${rgba(C.cue, 0.16 * hit)}, transparent 70%)`}} />
      <div style={{position: 'absolute', inset: 0, transform: `translateX(${shake}px)`}}>
        <SectionLabel left={96} top={170} tag="FOCUS" text="代表经历的交流" appear={appear} />
        <Utterances cues={cues} frame={frame} marks={marks} left={96} bottom={150} width={960} />
        <UnderlyingPanel plan={plan} frame={frame} left={1160} top={140} width={664} appear={appear} />
      </div>
      <div style={{position: 'absolute', left: 96, width: 960 * hit + 4, top: 1080 - 128, height: 2, background: C.cue, opacity: hit}} />
      <ChapterTitle index="01" title="对话，不必等到句号才发生" frame={frame} hold={titleHold} dim />
      <SceneAudio
        cues={cues}
        sfx={[
          {id: 'tick', at: firstAt(plan.concern, 'open')!, volume: 0.35},
          {id: 'tick', at: firstAt(plan.verdict, 'unrelated')!, volume: 0.35},
          {id: 'tick', at: firstAt(plan.candidate.track, 'ready')!, volume: 0.45},
          {id: 'cut', at: interrupt - 1, volume: 0.6},
        ]}
      />
    </AbsoluteFill>
  );
};
