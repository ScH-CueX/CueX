import type { DoctorStateName, Utterance } from '@/lib/types';
import { META, UTTERANCES, CONCERN, JUDGMENTS, CANDIDATES, stateAt } from '@/lib/scenario';
import type { CandidateLifecyclePhase } from '@cuex/protocol';
import type { LiveSession } from './liveSession';

export interface TrainingFrame {
  study: string;
  doctor: { name: string; role: string };
  concernTitle: string;
  points: Array<{ id: string; label: string; done: boolean }>;
  state: DoctorStateName;
  readiness: number;
  utterances: Utterance[];
  activeProgress: number;
  judgment: { t: number; verdict: 'on' | 'drift'; read: string; action?: string; latencyMs?: number } | null;
  candidates: Array<{ id: string; text: string; basis: string; sourceEvidence?: string; phase: CandidateLifecyclePhase }>;
}

export function replayFrame(t: number): TrainingFrame {
  const period = stateAt(t);
  const held = CANDIDATES.find(candidate => candidate.id === period.candidate);
  const utterances = UTTERANCES.filter(utterance => utterance.start <= t);
  const active = utterances[utterances.length - 1];
  const stop = active?.cutAt ?? active?.end ?? 0;
  return {
    study: META.study, doctor: META.doctor, concernTitle: CONCERN.title,
    points: CONCERN.points.map(point => ({ ...point, done: t >= point.answeredAt })),
    state: period.state,
    readiness: period.state === 'holding' && held ? Math.min(1, Math.max(0, (t - held.readyAt) / (held.decidedAt - held.readyAt))) : 0,
    utterances,
    activeProgress: !active ? 0 : active.cutAt && t >= active.cutAt ? 1 : Math.min(1, Math.max(0, (t - active.start) / (stop - active.start - 0.2))),
    judgment: [...JUDGMENTS].reverse().find(judgment => judgment.t <= t) ?? null,
    candidates: CANDIDATES.filter(candidate => t >= candidate.preparedFrom).map(candidate => ({
      ...candidate, phase: t < candidate.readyAt ? 'retrieving' : t < candidate.decidedAt ? 'ready' : candidate.fate === 'asked' ? 'spoken' : 'withdrawn',
    })),
  };
}

export function liveFrame(session: LiveSession): TrainingFrame {
  const concern = session.scenario?.concerns.find(item => item.id === session.dispatch?.concernProgress.concernId) ?? session.scenario?.concerns[0];
  const judgment = session.judgments[session.judgments.length - 1];
  const origin = session.startedAt ?? Date.now();
  return {
    study: session.scenario?.studyName ?? '正在读取训练场景',
    doctor: { name: session.scenario?.doctor.name ?? '模拟医生', role: session.scenario ? `${session.scenario.doctor.department} · ${session.scenario.doctor.title}` : '等待连接' },
    concernTitle: concern?.title ?? '等待医生提出关切',
    points: concern?.points.map(point => ({ ...point, done: !!session.resolved[point.id] })) ?? [],
    state: session.audioPlaying ? session.speakingPose : session.dispatch?.pose ?? 'listening',
    readiness: session.dispatch?.readiness ?? 0,
    utterances: session.transcripts.map(transcript => ({ id: transcript.transcriptId, who: transcript.speaker, text: transcript.text, start: (transcript.timeRange.startMs - origin) / 1000, end: (transcript.timeRange.endMs - origin) / 1000 })),
    activeProgress: 1,
    judgment: judgment ? { t: Math.max(0, (judgment.timestamp - origin) / 1000), verdict: judgment.verdict === 'drifting' ? 'drift' : 'on', read: judgment.diagnosticReason, action: judgment.action, latencyMs: judgment.latencyMs } : null,
    candidates: session.candidates.map(candidate => ({ id: candidate.id, text: candidate.draftText, basis: candidate.basis, sourceEvidence: candidate.sourceEvidence, phase: candidate.phase })),
  };
}

export const phaseLabels: Record<CandidateLifecyclePhase, string> = {
  idle: '等待追问', retrieving: '检索中', drafting: '拟写中', ready: '已就绪 · 未说出', spoken: '已问出', withdrawn: '已撤销 · 依据失效',
};
export const actionLabels: Record<string, string> = {
  listen: '继续听', prepare_followup: '准备追问', trigger_interrupt: '发起追问', withdraw_followup: '撤销追问', resolve_and_move_on: '进入下一关切',
};
