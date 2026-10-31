import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ChapterTitle} from '../components/ChapterTitle';
import {RevealText} from '../components/RevealText';
import {SceneAudio} from '../components/SceneAudio';
import {SectionLabel} from '../components/SectionLabel';
import {UnderlyingPanel} from '../components/UnderlyingPanel';
import {Utterances} from '../components/Utterances';
import {H01, H04, LINES} from '../content/timeline';
import {C, EASE, FONT, clamp01, mix, ramp, rgba, timecode} from '../theme';

const BAR_L = 96;
const BAR_W = 1728;
const xOf = (f: number) => BAR_L + (f / H01.duration) * BAR_W;

// What the rep actually said in Highlight 01 before the doctor stepped in.
const spokenPitch = (() => {
  const pitch = H01.cues[1];
  return pitch.chars.filter((_, i) => pitch.charAt[i] < pitch.play).join('') + '……';
})();

const SessionBar: React.FC<{frame: number}> = ({frame}) => {
  const {scrubFrom, scrubTo} = H04.review;
  const at = mix(0, H01.interrupt, ramp(frame, scrubFrom, scrubTo, EASE.inOut));
  const head = xOf(at);
  const marker = xOf(H01.interrupt);
  const snapped = clamp01((frame - scrubTo) / 8);
  return (
    <>
      <div style={{position: 'absolute', left: BAR_L, top: 316, width: BAR_W, height: 2, background: C.line}} />
      {H01.cues.map((cue) => {
        const doctor = cue.speaker === 'doctor';
        return (
          <div
            key={cue.id}
            style={{position: 'absolute', left: xOf(cue.from), top: doctor ? 296 : 322, width: xOf(cue.end) - xOf(cue.from), height: 14, borderRadius: 8, background: doctor ? rgba(C.paper, 0.85) : rgba(C.paper, 0.32)}}
          />
        );
      })}
      <div style={{position: 'absolute', left: BAR_L, top: 352, fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.16em', color: C.dim}}>医生</div>
      <div style={{position: 'absolute', left: BAR_L + 70, top: 352, fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.16em', color: C.faint}}>代表</div>
      <div style={{position: 'absolute', left: BAR_L + BAR_W - 90, top: 352, fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.16em', color: C.dim}}>{timecode(H01.duration)}</div>
      <div style={{position: 'absolute', left: marker - 9, top: 300, width: 18, height: 18, transform: `rotate(45deg) scale(${1 + snapped * 0.3})`, background: C.cue, boxShadow: `0 0 ${24 * snapped}px ${rgba(C.cue, 0.8)}`}} />
      <div style={{position: 'absolute', left: marker + 22, top: 262, fontFamily: FONT.sans, fontSize: 18, color: C.cue, letterSpacing: '0.1em'}}>医生追问</div>
      <div style={{position: 'absolute', left: head - 1, top: 250, width: 2, height: 110, background: C.paper, boxShadow: `0 0 12px ${rgba(C.paper, 0.7)}`}} />
      <div style={{position: 'absolute', left: head - 60, top: 218, width: 120, textAlign: 'center', fontFamily: FONT.mono, fontSize: 15, color: C.paper}}>{timecode(at)}</div>
    </>
  );
};

const RetryIcon: React.FC<{color: string}> = ({color}) => (
  <svg width={26} height={26} viewBox="0 0 26 26">
    <path d="M 21 13 A 8 8 0 1 1 18 6.8" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    <path d="M 18.5 2.5 L 18.5 7.5 L 13.5 7.5" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MomentCard: React.FC<{frame: number}> = ({frame}) => {
  const {cardIn, press} = H04.review;
  const p = ramp(frame, cardIn, cardIn + 20);
  const pressed = frame >= press ? 1 - Math.abs(clamp01((frame - press) / 8) * 2 - 1) : 0;
  const lit = clamp01((frame - press) / 6);
  const cols: [string, string, string][] = [
    ['医生当时问了什么', LINES.d_ask.text, C.paper],
    ['你当时说了什么', spokenPitch, C.soft],
    ['医生随后怎样反应', LINES.d_followup.text, C.cue],
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: BAR_L,
        top: 420,
        width: BAR_W,
        padding: '40px 48px',
        borderRadius: 30,
        background: 'linear-gradient(180deg, rgba(22,24,32,0.78), rgba(12,13,18,0.62))',
        border: `1px solid ${rgba(C.cue, 0.28)}`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.45), 0 0 80px ${rgba(C.cue, 0.06)}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px) scale(${mix(0.98, 1, p)})`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18}}>
        <span style={{fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.24em', color: C.cue}}>关键时刻</span>
        <span style={{fontFamily: FONT.mono, fontSize: 15, color: C.cue}}>{timecode(H01.interrupt)}</span>
      </div>
      <div style={{marginTop: 16}}>
        <RevealText
          text="这里，医生关心的是既往治疗情况，你仍在介绍研究结果。"
          frame={frame}
          start={cardIn + 6}
          stagger={0.9}
          accent={{phrase: '既往治疗情况', color: C.cue}}
          style={{fontFamily: FONT.serif, fontSize: 46, fontWeight: 600, color: C.paper}}
        />
      </div>
      <div style={{display: 'flex', gap: 40, marginTop: 34}}>
        {cols.map(([head, body, color], i) => {
          const q = ramp(frame, cardIn + 26 + i * 8, cardIn + 46 + i * 8);
          return (
            <div key={head} style={{flex: 1, opacity: q, transform: `translateY(${(1 - q) * 14}px)`, borderTop: `1px solid ${C.line}`, paddingTop: 18}}>
              <div style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.2em', color: C.dim}}>{head}</div>
              <div style={{fontFamily: FONT.sans, fontSize: 24, lineHeight: 1.5, color, marginTop: 12}}>{body}</div>
            </div>
          );
        })}
      </div>
      <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 34}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 30px',
            borderRadius: 999,
            border: `1.5px solid ${C.cue}`,
            background: rgba(C.cue, 0.06 + 0.2 * lit),
            boxShadow: `0 0 ${20 + lit * 50}px ${rgba(C.cue, 0.25 + lit * 0.35)}`,
            transform: `scale(${1 - pressed * 0.06})`,
            opacity: ramp(frame, cardIn + 56, cardIn + 70),
            fontFamily: FONT.sans,
            fontSize: 26,
            fontWeight: 600,
            color: C.paper,
            letterSpacing: '0.06em',
          }}
        >
          <RetryIcon color={C.cue} />
          从这里再试一次
        </div>
      </div>
    </div>
  );
};

const Compare: React.FC<{frame: number; from: number}> = ({frame, from}) => {
  const rows: [string, string, string, string][] = [
    ['刚才', '继续介绍研究结果', '医生追问', C.cue],
    ['这一次', '先回答既往治疗情况', '医生继续听', C.ok],
  ];
  return (
    <div style={{position: 'absolute', left: 1160, top: 560, width: 664, padding: '30px 36px', borderRadius: 26, border: `1px solid ${C.line}`, background: 'rgba(14,16,22,0.55)', opacity: ramp(frame, from, from + 18)}}>
      <div style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.24em', color: C.dim, marginBottom: 18}}>同一种关切，两次回应</div>
      {rows.map(([who, did, result, color], i) => {
        const q = ramp(frame, from + 8 + i * 14, from + 26 + i * 14);
        return (
          <div key={who} style={{display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0', borderTop: i ? `1px solid ${C.line}` : undefined, opacity: q, transform: `translateX(${(1 - q) * 20}px)`}}>
            <span style={{width: 74, fontFamily: FONT.sans, fontSize: 19, color: i ? C.paper : C.dim}}>{who}</span>
            <span style={{flex: 1, fontFamily: FONT.sans, fontSize: 23, color: i ? C.paper : C.soft}}>{did}</span>
            <span style={{fontFamily: FONT.sans, fontSize: 21, color, display: 'flex', alignItems: 'center', gap: 8}}>
              <span style={{width: 7, height: 7, borderRadius: 7, background: color}} />
              {result}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const H04Replay: React.FC = () => {
  const frame = useCurrentFrame();
  const {cues, plan, marks, review, resolved} = H04;
  const collapse = ramp(frame, review.collapse, review.collapse + 14, EASE.in);
  const ui = ramp(frame, review.uiIn, review.uiIn + 20) * (1 - collapse);
  const stage = ramp(frame, review.stageIn, review.stageIn + 22);
  return (
    <AbsoluteFill>
      {frame < review.stageIn + 4 ? (
        <div style={{position: 'absolute', inset: 0, opacity: ui, transform: `scale(${mix(1, 0.94, collapse)})`, filter: `blur(${collapse * 14}px)`}}>
          <SectionLabel left={96} top={170} tag="REVIEW" text="复盘刚才的练习，只看关键片段" appear={1} color={C.soft} />
          <SessionBar frame={frame} />
          <MomentCard frame={frame} />
        </div>
      ) : null}
      {frame >= review.stageIn - 2 ? (
        <div style={{position: 'absolute', inset: 0, opacity: stage}}>
          <SectionLabel left={96} top={170} tag="TAKE 2" text="医生换一种问法" appear={stage} color={C.cue} />
          <Utterances cues={cues} frame={frame} marks={marks} left={96} bottom={150} width={960} />
          <UnderlyingPanel plan={plan} frame={frame} left={1160} top={140} width={664} appear={stage} compact />
          <Compare frame={frame} from={resolved + 12} />
        </div>
      ) : null}
      <ChapterTitle index="04" title="把“刚才没接住”，变成“现在再试一次”" frame={frame} hold={review.titleHold} dim />
      <SceneAudio
        cues={cues}
        sfx={[
          {id: 'tick', at: review.scrubTo, volume: 0.45},
          {id: 'press', at: review.press, volume: 0.6},
          {id: 'rewind', at: review.collapse, volume: 0.4},
          {id: 'tick', at: resolved, volume: 0.4},
        ]}
      />
    </AbsoluteFill>
  );
};
