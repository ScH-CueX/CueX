import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {ChapterTitle} from '../components/ChapterTitle';
import {RevealText} from '../components/RevealText';
import {SceneAudio} from '../components/SceneAudio';
import {SectionLabel} from '../components/SectionLabel';
import {UnderlyingPanel} from '../components/UnderlyingPanel';
import {Utterances} from '../components/Utterances';
import {H01, H02, firstAt} from '../content/timeline';
import {C, EASE, FONT, H, W, clamp01, mix, ramp, rgba, timecode} from '../theme';

// Scrubs back to the shared opening before the second take.
const Rewind: React.FC<{frame: number; dur: number}> = ({frame, dur}) => {
  const p = ramp(frame, 0, dur, EASE.inOut);
  const out = ramp(frame, dur - 8, dur);
  const tc = timecode(mix(H01.duration, 0, p));
  const streaks = Array.from({length: 26}, (_, i) => {
    const y = random(`ry-${i}`) * H;
    const len = 200 + random(`rl-${i}`) * 700;
    const travel = (random(`rx-${i}`) * (W + len) + frame * (40 + random(`rs-${i}`) * 60)) % (W + len);
    return <div key={i} style={{position: 'absolute', top: y, left: W - travel, width: len, height: 1, background: rgba(i % 3 ? C.paper : C.cue, 0.18)}} />;
  });
  return (
    <AbsoluteFill style={{opacity: 1 - out}}>
      {streaks}
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20}}>
        <div style={{fontFamily: FONT.mono, fontSize: 18, letterSpacing: '0.5em', color: C.cue}}>REWIND</div>
        <div style={{fontFamily: FONT.mono, fontSize: 96, color: C.paper, letterSpacing: '0.04em', textShadow: `-3px 0 ${rgba(C.cue, 0.6)}, 3px 0 ${rgba(C.deep, 0.6)}`}}>{tc}</div>
        <div style={{fontFamily: FONT.sans, fontSize: 24, color: C.soft, letterSpacing: '0.12em'}}>同一个开场，再来一次</div>
      </div>
    </AbsoluteFill>
  );
};

export const H02Withdraw: React.FC = () => {
  const frame = useCurrentFrame();
  const {cues, plan, marks, rewind, titleHold, withdraw, hero} = H02;
  const stageFrame = frame - rewind;
  const appear = ramp(stageFrame, 10, 36);
  const dissolve = frame >= withdraw ? clamp01(1 - (frame - withdraw) / 40) : 0;
  const heroP = ramp(frame, hero, hero + 22, EASE.inOut);
  return (
    <AbsoluteFill>
      {frame < rewind ? <Rewind frame={frame} dur={rewind} /> : null}
      <AbsoluteFill style={{opacity: frame < rewind ? 0 : 1}}>
        <AbsoluteFill style={{background: `radial-gradient(40% 40% at 75% 55%, ${rgba(C.ok, 0.14 * dissolve)}, transparent 70%)`}} />
        <div style={{position: 'absolute', inset: 0, opacity: mix(1, 0.16, heroP), filter: `blur(${heroP * 8}px)`, transform: `scale(${mix(1, 0.97, heroP)})`}}>
          <SectionLabel left={96} top={170} tag="FOCUS" text="同一个开场，代表自己调整" appear={appear} />
          <Utterances cues={cues} frame={frame} marks={marks} left={96} bottom={150} width={960} />
          <UnderlyingPanel plan={plan} frame={frame} left={1160} top={140} width={664} appear={appear} />
        </div>
        {heroP > 0 ? (
          <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center'}}>
            <RevealText text="这句追问已经准备好了。" frame={frame} start={hero + 6} style={{fontFamily: FONT.serif, fontSize: 52, fontWeight: 500, color: C.soft}} />
            <RevealText
              text="你先回答了问题，它就没有说出口。"
              frame={frame}
              start={hero + 24}
              accent={{phrase: '没有说出口', color: C.ok}}
              style={{fontFamily: FONT.serif, fontSize: 72, fontWeight: 600, color: C.paper}}
            />
            <div style={{marginTop: 18, fontFamily: FONT.mono, fontSize: 17, letterSpacing: '0.3em', color: C.dim, opacity: ramp(frame, hero + 50, hero + 70)}}>
              WITHDRAWN  留在时间线上，不进入对话历史
            </div>
          </div>
        ) : null}
        <ChapterTitle index="02" title="一句没说出口的追问，也是一项决定" frame={stageFrame} hold={titleHold} dim />
      </AbsoluteFill>
      <SceneAudio
        cues={cues}
        sfx={[
          {id: 'rewind', at: 0, volume: 0.45},
          {id: 'tick', at: firstAt(plan.verdict, 'unrelated')!, volume: 0.35},
          {id: 'tick', at: firstAt(plan.candidate.track, 'ready')!, volume: 0.45},
          {id: 'tick', at: firstAt(plan.verdict, 'responding')!, volume: 0.35},
          {id: 'dissolve', at: withdraw, volume: 0.6},
          {id: 'impact', at: hero + 20, volume: 0.35},
        ]}
      />
    </AbsoluteFill>
  );
};
