// Dev only. Renders VisitPanel on a 1920x1080 canvas with mock LiveSession states built from the real ANSHU pack.
// /src/stage/visit-preview.html?state=pitch|interrupt|withdrawn|empty|opening&underlying=1|0
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AsrTranscriptDelta, CandidateLifecyclePhase, ControllerDispatchEvent, FollowupCandidate, JevDecisionResponse } from '@cuex/protocol';
import { ANSHU_PACK } from '../../../server/src/scenario/anshu';
import { emptySession, type LiveSession } from '../core/session/liveSession';
import { VisitPanel } from './VisitPanel';

const T0 = 1_700_000_000_000;
const scenario = ANSHU_PACK.scenario;
const facts = Object.fromEntries(ANSHU_PACK.facts.map(fact => [fact.id, fact]));

const say = (id: string, speaker: 'doctor' | 'rep', text: string, isFinal: boolean, from: number, to: number): AsrTranscriptDelta => ({
  sessionId: 'preview', transcriptId: id, speaker, text, delta: '', isFinal, confidence: 0.9, timeRange: { startMs: T0 + from, endMs: T0 + to },
});
const verdict = (n: number, kind: JevDecisionResponse['verdict'], action: JevDecisionResponse['action'], reason: string, resolved: string[] = []): JevDecisionResponse => ({
  requestId: `v${n}`, verdict: kind, action, confidence: 0.9, resolvedPointIds: resolved, diagnosticReason: reason, latencyMs: 60, timestamp: T0 + n * 4000,
});
const candidate = (phase: CandidateLifecyclePhase, draftText: string, basis: string, sourceId: string, fate?: 'asked' | 'withdrawn'): FollowupCandidate => ({
  id: 'cand-1', targetConcernId: 'concern-scope', phase, draftText, basis, sourceEvidence: facts[sourceId].source,
  triggerCondition: '关切持续偏离且代表出现短暂停顿', preparedFromMs: T0 + 9000, readyAtMs: T0 + 14000, decidedAtMs: phase === 'ready' ? undefined : T0 + 22000, fate,
});
const dispatch = (pose: ControllerDispatchEvent['pose'], action: ControllerDispatchEvent['action'], resolvedCount: number): ControllerDispatchEvent => ({
  sessionId: 'preview', timestamp: T0 + 20000, pose, readiness: 0.6, action,
  concernProgress: { concernId: 'concern-scope', resolvedCount, totalPoints: 3, isFullyResolved: false },
});

const opening = say('d1', 'doctor', '开始之前，我先说我最在意的：75 岁以上、肾功能不好的患者，你们有数据吗？', true, 1000, 7000);
const intro = say('r1', 'rep', '陈主任好，我是安舒平的代表，今天想跟您汇报一下 ANSHU-3 研究的主要结果。', true, 8000, 13000);
const drift = '这个研究主要终点是十二周时的诊室收缩压，安舒平组比对照组多降了六点二毫米汞柱，安全性方面不良反应发生率和安慰剂相当，而且依从性也很好';
const draft = '我打断一下，75 岁以上的患者，研究里有多少？结论适用吗？';
const basis = '代表在讲主要终点和安全性，关切里的三个要点都还没有提到';

const base: LiveSession = { ...emptySession, status: 'running', sessionId: 'preview', startedAt: T0, scenario };

const states: Record<string, LiveSession> = {
  // The rep is pitching. System 2 has a follow-up ready that the doctor has not said.
  pitch: {
    ...base,
    transcripts: [opening, intro, say('r2', 'rep', drift, false, 13500, 21000)],
    judgments: [verdict(1, 'on_topic', 'listen', '开场问候'), verdict(2, 'drifting', 'prepare_followup', '转向主要终点，高龄与肾功能都还没有提到')],
    candidates: [candidate('ready', draft, basis, 'f-elderly')],
    dispatch: dispatch('holding', { type: 'idle' }, 0),
  },
  // The doctor interrupts while the rep is still talking.
  interrupt: {
    ...base,
    transcripts: [opening, intro, say('r2', 'rep', drift, false, 13500, 23000), say('d2', 'doctor', draft, false, 22500, 26000)],
    judgments: [verdict(2, 'drifting', 'prepare_followup', '转向主要终点，高龄与肾功能都还没有提到'), verdict(3, 'drifting', 'trigger_interrupt', '继续讲安全性，关切仍被搁置')],
    candidates: [candidate('spoken', draft, basis, 'f-elderly', 'asked')],
    dispatch: dispatch('asking', { type: 'interrupt_speak', textToSpeak: draft, candidateId: 'cand-1' }, 0),
    audioPlaying: true,
  },
  // The rep corrects themselves. System 2 withdraws the follow-up and the doctor never says it.
  withdrawn: {
    ...base,
    transcripts: [opening, intro, say('r2', 'rep', '这个研究主要终点是十二周时的诊室收缩压，安舒平组比对照组多降了六点二毫米汞柱。', true, 13500, 19000),
      say('r3', 'rep', '说到您关心的高龄患者，75 岁以上的患者约占 11%，亚组分析里降压幅度和总体一致，数据在亚组分析表第十四页', false, 19500, 26000)],
    judgments: [verdict(2, 'drifting', 'prepare_followup', '转向主要终点，高龄与肾功能都还没有提到'), verdict(3, 'self_correcting', 'withdraw_followup', '代表自己转回了高龄患者', ['c1'])],
    candidates: [candidate('withdrawn', draft, basis, 'f-elderly', 'withdrawn')],
    resolved: { c1: 'r3' },
    dispatch: dispatch('withdrawing', { type: 'withdraw_question', candidateId: 'cand-1' }, 1),
  },
  // The visit has just opened: the doctor's first line, no verdict, no candidates, no line job.
  empty: {
    ...base,
    transcripts: [opening],
  },
  // The visit has not started talking yet. System 2 writes the opening.
  opening: {
    ...base,
    lineJob: { task: 'opening', phase: 'drafting' },
  },
};

function Controls() {
  const field: React.CSSProperties = { flex: 1, height: 56, padding: '0 20px', font: '400 24px "Noto Sans SC", sans-serif', color: '#ECE8DF', background: 'transparent', border: '1px solid rgba(236,232,223,0.10)', borderRadius: 12 };
  const button: React.CSSProperties = { height: 56, padding: '0 28px', font: '500 24px "Noto Sans SC", sans-serif', color: '#ECE8DF', background: 'transparent', border: '1px solid rgba(236,232,223,0.28)', borderRadius: 12, cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <button type="button" style={button}>开启麦克风</button>
      <input style={field} aria-label="文字回应" placeholder="用麦克风或文字回应医生" />
    </div>
  );
}

function Preview() {
  const params = new URLSearchParams(location.search);
  const session = states[params.get('state') ?? 'pitch'] ?? states.pitch;
  const [underlying, setUnderlying] = useState(params.get('underlying') !== '0');
  return (
    <div id="canvas" style={{ position: 'relative', width: 1920, height: 1080, background: '#07080B' }}>
      <VisitPanel session={session} underlying={underlying} onToggleUnderlying={() => setUnderlying(value => !value)} controls={<Controls />} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
