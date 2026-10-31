import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {ChapterTitle} from '../components/ChapterTitle';
import {RevealText} from '../components/RevealText';
import {SceneAudio} from '../components/SceneAudio';
import {ARCH_DURATION} from '../content/timeline';
import {ArchBeats, ArchField, CORE, GATE, candidateA, candidateB} from '../three/ArchField';
import {FOV, Vec, cameraPose, project} from '../three/camera';
import {C, FONT, H, W, mix, ramp, rgba} from '../theme';

const DUR = ARCH_DURATION;
const BEATS: ArchBeats = {aFrom: 120, aGate: 188, bFrom: 196, bStop: 246, bGone: 290};

type LabelProps = {frame: number; anchor: Vec; dx: number; dy: number; show: number; tag: string; tagColor: string; title: string; sub?: string; align?: 'left' | 'right'};

// 2D label pinned to a projected 3D anchor with a leader line.
const Label: React.FC<LabelProps> = ({frame, anchor, dx, dy, show, tag, tagColor, title, sub, align = 'left'}) => {
  const p = ramp(frame, show, show + 18);
  const [x, y] = project(frame, DUR, anchor);
  const lx = x + dx;
  const ly = y + dy;
  const system = title.startsWith('System');
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: p}}>
        <circle cx={x} cy={y} r={4} fill={tagColor} />
        <line x1={x} y1={y} x2={x + (lx - x) * p} y2={y + (ly - y) * p} stroke={rgba(C.paper, 0.35)} strokeWidth={1} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: align === 'left' ? lx + 12 : undefined,
          right: align === 'right' ? W - lx + 12 : undefined,
          top: ly - 34,
          textAlign: align,
          opacity: p,
          transform: `translateY(${(1 - p) * 10}px)`,
        }}
      >
        <div style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.24em', color: tagColor}}>{tag}</div>
        <div style={{display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: align === 'left' ? 'flex-start' : 'flex-end', marginTop: 6}}>
          <span style={{fontFamily: system ? FONT.display : FONT.sans, fontStyle: system ? 'italic' : undefined, fontSize: system ? 40 : 26, color: C.paper, lineHeight: 1}}>{title}</span>
          {sub ? <span style={{fontFamily: FONT.sans, fontSize: 20, color: C.soft}}>{sub}</span> : null}
        </div>
      </div>
    </>
  );
};

const CardTag: React.FC<{frame: number; at: Vec | null; text: string; color: string; opacity: number; ox?: number; oy?: number}> = ({frame, at, text, color, opacity, ox = 30, oy = -74}) => {
  if (!at || opacity <= 0) return null;
  const [x, y] = project(frame, DUR, at);
  return (
    <div
      style={{
        position: 'absolute',
        left: x + ox,
        top: y + oy,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'rgba(7,8,11,0.8)',
        border: `1px solid ${rgba(color, 0.5)}`,
        fontFamily: FONT.sans,
        fontSize: 18,
        letterSpacing: '0.08em',
        color,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

const Caption: React.FC<{frame: number; from: number; to: number; text: string; accent?: {phrase: string; color: string}}> = ({frame, from, to, text, accent}) =>
  frame >= from - 1 && frame < to + 16 ? (
    <div style={{position: 'absolute', left: 0, right: 0, top: 940, textAlign: 'center'}}>
      <RevealText text={text} frame={frame} start={from} stagger={0.9} exit={to} accent={accent} style={{fontFamily: FONT.serif, fontSize: 40, fontWeight: 500, color: C.paper}} />
    </div>
  ) : null;

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const start = cameraPose(0, DUR);
  const aAt = candidateA(frame, BEATS);
  const bAt = frame <= BEATS.bGone ? candidateB(frame, BEATS) : null;
  const aSpoken = frame >= BEATS.aGate - 6;
  const bFailed = frame >= BEATS.bStop;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={W} height={H} dpr={1} linear flat gl={{antialias: true, alpha: true}} camera={{fov: FOV, near: 0.1, far: 100, position: start.pos}}>
        <ArchField frame={frame} dur={DUR} beats={BEATS} />
      </ThreeCanvas>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(7,8,11,0.55), transparent 20%, transparent 78%, rgba(7,8,11,0.8))'}} />

      <Label frame={frame} anchor={[-4.3, 0.12, 0]} dx={-30} dy={-130} show={46} tag="LIVE CONTEXT" tagColor={C.soft} title="持续更新的上下文" />
      <Label frame={frame} anchor={[-0.5, 1.45, 0]} dx={50} dy={-90} show={62} tag="FAST LOOP" tagColor={C.cue} title="System 1" sub="此刻是否行动" />
      <Label frame={frame} anchor={[CORE[0] + 0.45, CORE[1] - 0.1, 0]} dx={120} dy={60} show={80} tag="DEEP LOOP" tagColor={C.deep} title="System 2" sub="理解、查资料、准备内容" />
      <Label frame={frame} anchor={[GATE[0], 0.64, 0]} dx={40} dy={-130} show={100} tag="CONTROLLER" tagColor={C.paper} title="输出前复核" />
      <Label frame={frame} anchor={[5.3, -0.05, 0]} dx={0} dy={120} show={120} tag="ACTION" tagColor={C.soft} title="追问，或继续听" align="right" />

      <CardTag
        frame={frame}
        at={frame < BEATS.aFrom ? null : frame <= BEATS.aGate ? aAt : frame <= BEATS.aGate + 44 ? GATE : null}
        text={aSpoken ? '条件成立，说出口' : '候选追问'}
        color={aSpoken ? C.paper : C.deep}
        opacity={ramp(frame, BEATS.aFrom, BEATS.aFrom + 10) * (1 - ramp(frame, BEATS.aGate + 30, BEATS.aGate + 44))}
        ox={mix(30, -100, ramp(frame, BEATS.aGate - 6, BEATS.aGate + 4))}
        oy={mix(-74, 172, ramp(frame, BEATS.aGate - 6, BEATS.aGate + 4))}
      />
      <CardTag
        frame={frame}
        at={bAt}
        text={bFailed ? '条件失效，撤销' : '候选追问'}
        color={bFailed ? C.ok : C.deep}
        opacity={ramp(frame, BEATS.bFrom, BEATS.bFrom + 10) * (1 - ramp(frame, BEATS.bGone - 14, BEATS.bGone))}
      />

      <Caption frame={frame} from={40} to={180} text="System 1 判断此刻是否行动；System 2 同时理解资料、准备内容。" />
      <Caption frame={frame} from={196} to={238} text="条件仍成立的候选，及时说出口。" accent={{phrase: '说出口', color: C.paper}} />
      <Caption frame={frame} from={256} to={DUR} text="条件已失效的候选，在说出口之前撤销。" accent={{phrase: '撤销', color: C.ok}} />

      <ChapterTitle index="03" title="判断与准备，同时发生" frame={frame} hold={30} dim />
      <SceneAudio cues={[]} sfx={[{id: 'press', at: BEATS.aGate, volume: 0.4}, {id: 'dissolve', at: BEATS.bStop, volume: 0.5}]} />
    </AbsoluteFill>
  );
};
