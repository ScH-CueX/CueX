import type {
  Meta,
  Utterance,
  Concern,
  Judgment,
  Candidate,
  DoctorStatePeriod,
  DoctorStateName,
  StateWord,
  Moment,
} from './types';

export const META: Meta = {
  product: 'RealtimeGuide',
  pack: '安舒平 · 降压适应证资料包',
  study: 'ANSHU-3 研究（虚构）',
  doctor: { name: '陈主任', role: '心内科 · 门诊', note: '模拟角色' },
  scene: '门诊拜访 · 适用范围',
  duration: 68,
};

export const UTTERANCES: Utterance[] = [
  {
    id: 'u1',
    who: 'doctor',
    start: 0.0,
    end: 7.5,
    text: '你说这个研究结果不错。我先问一句：它适用于哪些患者？我门诊里七十五岁以上、肾功能不太好的很多。',
  },
  {
    id: 'u2',
    who: 'rep',
    start: 8.4,
    end: 16.0,
    text: '好的，陈主任。这项研究入组的是 18 到 80 岁的原发性高血压患者，',
  },
  {
    id: 'u3',
    who: 'rep',
    start: 16.0,
    end: 23.5,
    text: '主要终点是 12 周时的诊室收缩压，安舒平组比对照组多降了 6.2 mmHg，',
  },
  {
    id: 'u4',
    who: 'rep',
    start: 23.5,
    end: 29.6,
    cutAt: 29.6,
    text: '而且不良反应发生率和安慰剂相当，我们在华东地区的上市后——',
  },
  {
    id: 'u5',
    who: 'doctor',
    start: 29.8,
    end: 36.4,
    fromCandidate: 'k1',
    text: '先停一下。七十五岁以上、eGFR 低于 60 的患者，研究里有多少？结论能用在他们身上吗？',
  },
  {
    id: 'u6',
    who: 'rep',
    start: 37.2,
    end: 46.8,
    text: '抱歉，我直接回答。75 岁以上的患者约占 11%，eGFR 在 30 到 60 之间的亚组有 412 人，降压幅度和总体一致。',
  },
  {
    id: 'u7',
    who: 'rep',
    start: 46.8,
    end: 52.6,
    text: '另外我们还有一项覆盖两万多名患者的真实世界研究，',
  },
  {
    id: 'u8',
    who: 'rep',
    start: 52.6,
    end: 60.8,
    selfCorrection: true,
    text: '不过我得先说明：eGFR 低于 30 的患者被排除在研究之外，这部分目前没有证据，说明书也不建议使用。',
  },
  {
    id: 'u9',
    who: 'doctor',
    start: 62.0,
    end: 67.5,
    text: '好，这个说清楚了。那高龄患者的起始剂量要调整吗？',
  },
];

export const CONCERN: Concern = {
  title: '适用范围',
  askedIn: 'u1',
  points: [
    { id: 'c1', label: '75 岁以上患者', answeredAt: 46.8, by: 'u6' },
    { id: 'c2', label: 'eGFR 30–60', answeredAt: 46.8, by: 'u6' },
    { id: 'c3', label: 'eGFR 低于 30', answeredAt: 55.4, by: 'u8' },
  ],
  next: { at: 67.5, title: '高龄起始剂量', by: 'u9' },
};

export const JUDGMENTS: Judgment[] = [
  {
    id: 'j1',
    t: 16.0,
    on: 'u2',
    verdict: 'on',
    action: 'listen',
    read: '在回应关切：说明入组年龄范围',
  },
  {
    id: 'j2',
    t: 23.5,
    on: 'u3',
    verdict: 'drift',
    action: 'listen',
    prepare: 'k1',
    read: '转向主要终点，高龄与肾功能都还没有提到',
  },
  {
    id: 'j3',
    t: 27.8,
    on: 'u4',
    verdict: 'drift',
    action: 'ask',
    candidate: 'k1',
    decidedAt: 29.4,
    read: '连续第二段偏离：开始介绍不良反应与区域数据',
  },
  {
    id: 'j4',
    t: 46.8,
    on: 'u6',
    verdict: 'on',
    action: 'listen',
    resolves: ['c1', 'c2'],
    read: '已回应 75 岁以上与 eGFR 30–60',
  },
  {
    id: 'j5',
    t: 50.5,
    on: 'u7',
    verdict: 'drift',
    action: 'listen',
    prepare: 'k2',
    read: '转向真实世界研究，eGFR 低于 30 仍未说明',
  },
  {
    id: 'j6',
    t: 55.0,
    on: 'u8',
    verdict: 'on',
    action: 'withdraw',
    candidate: 'k2',
    decidedAt: 55.4,
    resolves: ['c3'],
    read: '代表正在自行说明 eGFR 低于 30 被排除，追问的依据不再成立',
  },
  {
    id: 'j7',
    t: 60.8,
    on: 'u8',
    verdict: 'on',
    action: 'move-on',
    read: '本轮关切已全部回应，可以进入下一个问题',
  },
];

export const CANDIDATES: Candidate[] = [
  {
    id: 'k1',
    preparedFrom: 23.6,
    readyAt: 26.9,
    decidedAt: 29.4,
    fate: 'asked',
    saidAs: 'u5',
    basis: '代表连续两段没有回应高龄与肾功能',
    text: '先停一下。七十五岁以上、eGFR 低于 60 的患者，研究里有多少？结论能用在他们身上吗？',
    why: '关切被提出后，代表用了约 21 秒介绍终点、安全性和区域数据，仍未进入适用范围。此时追问能把交流拉回医生真正需要的信息。',
  },
  {
    id: 'k2',
    preparedFrom: 50.6,
    readyAt: 52.1,
    decidedAt: 55.4,
    fate: 'withdrawn',
    basis: 'eGFR 低于 30 尚未说明，代表转向真实世界研究',
    text: '那 eGFR 低于 30 的呢？这部分患者能用吗？',
    why: '追问准备好以后，代表在 54.9 秒主动补上了 eGFR 低于 30 的结论。准备时的情境已经变化，这句追问就不再需要说出口。',
    correctionAt: 54.9,
  },
];

export const DOCTOR_STATES: DoctorStatePeriod[] = [
  { from: 0.0, to: 7.5, state: 'speaking' },
  { from: 7.5, to: 26.9, state: 'listening' },
  { from: 26.9, to: 29.8, state: 'holding', candidate: 'k1' },
  { from: 29.8, to: 36.4, state: 'asking', candidate: 'k1' },
  { from: 36.4, to: 52.1, state: 'listening' },
  { from: 52.1, to: 55.4, state: 'holding', candidate: 'k2' },
  { from: 55.4, to: 56.6, state: 'withdrawing', candidate: 'k2' },
  { from: 56.6, to: 62.0, state: 'listening' },
  { from: 62.0, to: 67.5, state: 'speaking' },
  { from: 67.5, to: 68.0, state: 'listening' },
];

export const NODS = [12.2, 16.1, 41.0, 46.9, 58.4, 60.9];

export const STATE_WORDS: Record<DoctorStateName, StateWord> = {
  listening: { word: '在听', plain: '你的回应在推进交流，医生继续听。' },
  holding: { word: '想插话', plain: '医生有一个问题，正在等合适的时机。' },
  asking: { word: '追问', plain: '医生打断了你，回到他关心的问题。' },
  withdrawing: { word: '放下了', plain: '你自己补上了答案，那句追问不必再问。' },
  speaking: { word: '在说', plain: '轮到医生发言。' },
};

export const MOMENTS: Moment[] = [
  {
    id: 'm1',
    kind: 'listen',
    at: 8.4,
    to: 16.0,
    title: '继续听',
    lead: '你一开口就进入了入组人群，医生没有打断。',
  },
  {
    id: 'm2',
    kind: 'ask',
    at: 16.0,
    to: 36.4,
    title: '追问',
    lead: '你转去讲终点和安全性，关切被搁置了 21 秒。',
    candidate: 'k1',
  },
  {
    id: 'm3',
    kind: 'withdraw',
    at: 46.8,
    to: 60.8,
    title: '撤销追问',
    lead: '你差点又岔开，但在医生开口前自己补上了。',
    candidate: 'k2',
  },
];

export const stateAt = (t: number): DoctorStatePeriod =>
  DOCTOR_STATES.find((s) => t >= s.from && t < s.to) ?? DOCTOR_STATES[DOCTOR_STATES.length - 1];

export const fmt = (t: number): string => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtD = (t: number): string => {
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};
