import React from 'react';
import {random} from 'remotion';
import {CandState, ConcernState, CtrlState, Plan, Verdict, at, firstAt, since} from '../content/timeline';
import {C, EASE, FONT, clamp01, mix, ramp, rgba} from '../theme';
import {TextParticles, wrapLines} from './TextParticles';

const CONCERN: Record<ConcernState, {text: string; color: string}> = {
  none: {text: '等待医生提问', color: C.dim},
  open: {text: '未回应', color: C.cue},
  responding: {text: '正在回应', color: C.paper},
  resolved: {text: '已回应', color: C.ok},
};
const VERDICT: Record<Verdict, {text: string; color: string}> = {
  idle: {text: '持续监听', color: C.dim},
  unrelated: {text: '当前表达没有回应关切', color: C.cue},
  responding: {text: '代表正在回应关切', color: C.paper},
  resolved: {text: '关切已得到实质回应', color: C.ok},
};
const CAND: Record<CandState, {text: string; color: string}> = {
  none: {text: '', color: C.dim},
  retrieving: {text: '调用资料', color: C.deep},
  drafting: {text: '生成中', color: C.deep},
  ready: {text: '就绪', color: C.cue},
  spoken: {text: '已说出', color: C.paper},
  withdrawn: {text: '已撤销', color: C.ok},
};
const CTRL: Record<CtrlState, {action: string; note: string; color: string}> = {
  idle: {action: '继续听', note: '没有待执行的动作', color: C.soft},
  waiting: {action: '准备追问', note: '复核：关切仍未回应', color: C.cue},
  speak: {action: '追问', note: '条件成立，进入语音输出', color: C.paper},
  hold: {action: '继续听', note: '复核：代表开始回应', color: C.paper},
  cancel: {action: '撤销追问', note: '条件失效，候选不进入对话', color: C.ok},
};

const Chip: React.FC<{text: string; color: string; frame: number; from: number}> = ({text, color, frame, from}) => {
  const p = ramp(frame, from, from + 10);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        borderRadius: 999,
        border: `1px solid ${rgba(color, 0.55)}`,
        background: rgba(color, 0.1),
        color,
        fontFamily: FONT.sans,
        fontSize: 18,
        letterSpacing: '0.08em',
        opacity: p,
        transform: `scale(${mix(0.86, 1, p)})`,
      }}
    >
      <span style={{width: 6, height: 6, borderRadius: 6, background: color}} />
      {text}
    </span>
  );
};

const Head: React.FC<{name: string; sub: string; tag: string; tagColor: string}> = ({name, sub, tag, tagColor}) => (
  <div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
    <span style={{fontFamily: FONT.display, fontStyle: 'italic', fontSize: 34, color: C.paper, lineHeight: 1}}>{name}</span>
    <span style={{fontFamily: FONT.sans, fontSize: 19, color: C.soft}}>{sub}</span>
    <span style={{marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.22em', color: tagColor}}>{tag}</span>
  </div>
);

const Rule = () => <div style={{height: 1, background: C.line, margin: '22px 0'}} />;

const TICK = 5;
const Ticks: React.FC<{plan: Plan; frame: number; width: number; from: number}> = ({plan, frame, width, from}) => {
  const count = 44;
  const gap = width / count;
  const cur = Math.floor(frame / TICK);
  const frac = (frame % TICK) / TICK;
  const out = [];
  for (let k = cur - count + 1; k <= cur; k++) {
    const tf = k * TICK;
    if (tf < from) continue;
    const v = at(plan.verdict, tf);
    const color = VERDICT[v].color;
    const h = v === 'idle' ? 8 : 16 + random(`tick-${k}`) * 18;
    const grow = k === cur ? EASE.out(frac) : 1;
    const x = (k - (cur - count + 1)) * gap - frac * gap;
    out.push(
      <div
        key={k}
        style={{position: 'absolute', left: x, bottom: 0, width: 3, height: h * grow, borderRadius: 2, background: color, opacity: v === 'idle' ? 0.45 : 0.95}}
      />,
    );
  }
  return <div style={{position: 'relative', height: 36, width, overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, black 18%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 18%)'}}>{out}</div>;
};

const Swap: React.FC<{k: string; frame: number; from: number; children: React.ReactNode}> = ({k, frame, from, children}) => {
  const p = ramp(frame, from, from + 10);
  return (
    <div key={k} style={{opacity: p, transform: `translateY(${(1 - p) * 8}px)`, filter: `blur(${(1 - p) * 6}px)`}}>
      {children}
    </div>
  );
};

const ringValue = (plan: Plan, frame: number) => {
  const {track, ringStart, ringFire} = plan.controller;
  const base = (f: number) => clamp01((f - ringStart) / Math.max(1, ringFire - ringStart));
  const s = at(track, frame);
  const start = since(track, frame);
  if (s === 'waiting') return base(frame);
  if (s === 'speak') return 1;
  if (s === 'hold') return base(start);
  if (s === 'cancel') return base(firstAt(track, 'hold') ?? start) * (1 - ramp(frame, start, start + 18, EASE.inOut));
  return 0;
};

const CandidateCard: React.FC<{plan: Plan; frame: number; width: number}> = ({plan, frame, width}) => {
  const {track, text, condition, source} = plan.candidate;
  const s = at(track, frame);
  const start = since(track, frame);
  if (s === 'none') {
    return <div style={{fontFamily: FONT.sans, fontSize: 20, color: C.faint}}>后台待命</div>;
  }
  const lines = wrapLines(text, 19);
  const draftFrom = firstAt(track, 'drafting') ?? start;
  const readyAt = firstAt(track, 'ready') ?? start;
  const typed = s === 'retrieving' ? 0 : s === 'drafting' ? clamp01((frame - draftFrom) / Math.max(1, readyAt - draftFrom)) : 1;
  const withdrawn = s === 'withdrawn' ? ramp(frame, start, start + 48, EASE.linear) : 0;
  const spoken = s === 'spoken' ? ramp(frame, start, start + 14) : 0;
  const glow = s === 'ready' ? 0.5 + 0.5 * Math.sin((frame - start) / 4) : 0;
  const border = s === 'ready' ? C.cue : s === 'spoken' ? C.paper : s === 'withdrawn' ? C.faint : rgba(C.deep, 0.7);
  const chip = CAND[s];
  let left = Math.round(typed * Array.from(text).length);
  const shown = lines.map((line) => {
    const chars = Array.from(line);
    const take = Math.max(0, Math.min(chars.length, left));
    left -= chars.length;
    return chars.slice(0, take).join('');
  });
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px ${s === 'drafting' || s === 'retrieving' ? 'dashed' : 'solid'} ${border}`,
        background: s === 'ready' ? rgba(C.cue, 0.06) : rgba(C.paper, 0.025),
        boxShadow: s === 'ready' ? `0 0 ${30 + glow * 30}px ${rgba(C.cue, 0.22)}` : spoken > 0 ? `0 0 ${40 * (1 - spoken)}px ${rgba(C.paper, 0.5)}` : 'none',
        padding: '20px 24px',
        width,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14}}>
        <span style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.22em', color: C.dim}}>候选追问</span>
        <span style={{marginLeft: 'auto'}}>
          <Chip key={s} text={chip.text} color={chip.color} frame={frame} from={start} />
        </span>
      </div>
      <div style={{minHeight: 2 * 26 * 1.45}}>
        {s === 'retrieving' ? (
          <div style={{fontFamily: FONT.mono, fontSize: 18, color: C.deep, letterSpacing: '0.06em'}}>
            检索资料包：{source}
            <span style={{opacity: Math.floor(frame / 6) % 2 ? 1 : 0.2}}> ▍</span>
          </div>
        ) : s === 'drafting' ? (
          <div style={{fontFamily: FONT.sans, fontSize: 26, lineHeight: 1.45, color: C.paper}}>
            {shown.map((line, i) => (
              <div key={i} style={{whiteSpace: 'pre', minHeight: 26 * 1.45}}>
                {line}
                {i === shown.findIndex((l, j) => Array.from(l).length < Array.from(lines[j]).length) ? (
                  <span style={{color: C.deep, opacity: Math.floor(frame / 5) % 2 ? 1 : 0.3}}>▍</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <TextParticles
            lines={lines}
            fontSize={26}
            weight={500}
            family={FONT.sans}
            lineHeight={1.45}
            width={width - 48}
            color={s === 'withdrawn' ? C.soft : C.paper}
            progress={withdrawn}
          />
        )}
      </div>
      <div style={{display: 'flex', gap: 18, marginTop: 14, fontFamily: FONT.sans, fontSize: 18, color: C.dim, alignItems: 'center'}}>
        <span style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.2em'}}>适用条件</span>
        <span
          style={{
            color: s === 'withdrawn' ? C.dim : C.soft,
            textDecoration: s === 'withdrawn' ? 'line-through' : undefined,
            textDecorationColor: C.ok,
          }}
        >
          {condition}
        </span>
        <span style={{marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.12em', color: s === 'withdrawn' ? C.ok : s === 'spoken' ? C.paper : C.faint, opacity: s === 'withdrawn' || s === 'spoken' ? ramp(frame, start + 8, start + 20) : 1}}>
          {s === 'withdrawn' ? '未写入对话历史' : s === 'spoken' ? '已写入对话历史' : '尚未进入对话'}
        </span>
      </div>
    </div>
  );
};

const Ring: React.FC<{value: number; color: string; size?: number}> = ({value, color, size = 74}) => {
  const r = size / 2 - 5;
  const len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={C.faint} strokeWidth={3} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${len * value} ${len}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle cx={size / 2} cy={size / 2} r={6} fill={color} opacity={0.4 + value * 0.6} />
    </svg>
  );
};

type Props = {plan: Plan; frame: number; left: number; top: number; width: number; appear: number; compact?: boolean};

// The "Underlying" view: what the doctor cares about, what System 1 decides, what System 2 prepares, and the final check.
export const UnderlyingPanel: React.FC<Props> = ({plan, frame, left, top, width, appear, compact}) => {
  const inner = width - 72;
  const concern = at(plan.concern, frame);
  const concernFrom = since(plan.concern, frame);
  const verdict = at(plan.verdict, frame);
  const verdictFrom = since(plan.verdict, frame);
  const ctrl = at(plan.controller.track, frame);
  const ctrlFrom = since(plan.controller.track, frame);
  const ticksFrom = plan.verdict[0][0];
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        padding: 36,
        borderRadius: 30,
        background: 'linear-gradient(180deg, rgba(20,22,30,0.72), rgba(12,13,18,0.6))',
        border: `1px solid ${rgba(C.paper, 0.09)}`,
        boxShadow: '0 40px 120px rgba(0,0,0,0.45)',
        opacity: appear,
        transform: `translateX(${(1 - appear) * 60}px)`,
        filter: `blur(${(1 - appear) * 10}px)`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24}}>
        <span style={{fontFamily: FONT.mono, fontSize: 16, letterSpacing: '0.24em', color: C.deep}}>UNDERLYING</span>
        <span style={{fontFamily: FONT.sans, fontSize: 19, color: C.dim}}>系统此刻在想什么</span>
      </div>

      <div style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.22em', color: C.dim, marginBottom: 10}}>医生当前关切</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, minHeight: 52}}>
        <Swap k={concern === 'none' ? 'none' : 'label'} frame={frame} from={concern === 'none' ? 0 : plan.concern.find(([, v]) => v !== 'none')?.[0] ?? 0}>
          <span style={{fontFamily: FONT.serif, fontSize: concern === 'none' ? 26 : 40, fontWeight: 600, color: concern === 'none' ? C.faint : C.paper}}>
            {concern === 'none' ? '等待医生提问' : plan.concernLabel}
          </span>
        </Swap>
        {concern !== 'none' ? (
          <span style={{marginLeft: 'auto'}}>
            <Chip key={concern} text={CONCERN[concern].text} color={CONCERN[concern].color} frame={frame} from={concernFrom} />
          </span>
        ) : null}
      </div>

      <Rule />
      <Head name="System 1" sub="此刻是否行动" tag="FAST LOOP" tagColor={C.cue} />
      <div style={{marginTop: 18}}>
        <Ticks plan={plan} frame={frame} width={inner} from={ticksFrom} />
      </div>
      <div style={{marginTop: 14, minHeight: 34, fontFamily: FONT.sans, fontSize: 24, color: VERDICT[verdict].color}}>
        <Swap k={verdict} frame={frame} from={verdictFrom}>
          {VERDICT[verdict].text}
        </Swap>
      </div>

      {compact ? null : (
        <>
          <Rule />
          <Head name="System 2" sub="理解资料，准备内容" tag="DEEP LOOP" tagColor={C.deep} />
          <div style={{marginTop: 18}}>
            <CandidateCard plan={plan} frame={frame} width={inner} />
          </div>
          <Rule />
          <div style={{display: 'flex', alignItems: 'center', gap: 24}}>
            <Ring value={ringValue(plan, frame)} color={CTRL[ctrl].color} />
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
                <span style={{fontFamily: FONT.display, fontStyle: 'italic', fontSize: 30, color: C.soft}}>Controller</span>
                <span style={{fontFamily: FONT.mono, fontSize: 14, letterSpacing: '0.22em', color: C.dim}}>输出前复核</span>
              </div>
              <Swap k={ctrl} frame={frame} from={ctrlFrom}>
                <span style={{fontFamily: FONT.sans, fontSize: 30, fontWeight: 600, color: CTRL[ctrl].color}}>{CTRL[ctrl].action}</span>
                <span style={{fontFamily: FONT.sans, fontSize: 19, color: C.dim, marginLeft: 16}}>{CTRL[ctrl].note}</span>
              </Swap>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
