import type { IConversationDriver, DriverStatus, DriverCallbacks } from './IConversationDriver';
import type { ControllerDispatchEvent, FollowupCandidate, JevDecisionResponse, AsrTranscriptDelta } from '@cuex/protocol';
import {
  META,
  UTTERANCES,
  CONCERN,
  JUDGMENTS,
  CANDIDATES,
  stateAt,
} from '@/lib/scenario';

export class ReplayDriver implements IConversationDriver {
  readonly id = 'replay-driver';
  private _status: DriverStatus = 'idle';
  private callbacks: DriverCallbacks = {};
  private currentTimeSec = 0;
  private durationSec = META.duration;
  private rafId: number | null = null;
  private lastTimestamp = 0;

  get status(): DriverStatus {
    return this._status;
  }

  get currentTime(): number {
    return this.currentTimeSec;
  }

  async init(callbacks: DriverCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.setStatus('idle');
  }

  async start(): Promise<void> {
    this.currentTimeSec = 0;
    this.lastTimestamp = performance.now();
    this.setStatus('running');
    this.tick();
  }

  pause(): void {
    if (this._status === 'running') {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.setStatus('paused');
    }
  }

  resume(): void {
    if (this._status === 'paused') {
      this.lastTimestamp = performance.now();
      this.setStatus('running');
      this.tick();
    }
  }

  async stop(): Promise<void> {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.currentTimeSec = 0;
    this.setStatus('idle');
  }

  seek(timeSec: number): void {
    this.currentTimeSec = Math.max(0, Math.min(timeSec, this.durationSec));
    this.emitCurrentFrame(this.currentTimeSec);
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.callbacks = {};
    this.setStatus('idle');
  }

  private setStatus(s: DriverStatus) {
    this._status = s;
    this.callbacks.onStatusChange?.(s);
  }

  private tick = () => {
    if (this._status !== 'running') return;
    const now = performance.now();
    const dt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this.currentTimeSec += dt;
    if (this.currentTimeSec >= this.durationSec) {
      this.currentTimeSec = this.durationSec;
      this.emitCurrentFrame(this.currentTimeSec);
      this.setStatus('idle');
      return;
    }

    this.emitCurrentFrame(this.currentTimeSec);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private emitCurrentFrame(t: number) {
    const s = stateAt(t);
    const candidate = s.candidate ? CANDIDATES.find((c) => c.id === s.candidate) : null;
    let readiness = 0;
    if (s.state === 'holding' && candidate) {
      readiness = Math.min(1, Math.max(0, (t - candidate.readyAt) / (candidate.decidedAt - candidate.readyAt)));
    }

    // 1. Controller Dispatch
    const resolvedPoints = CONCERN.points.filter((p) => t >= p.answeredAt);
    const dispatch: ControllerDispatchEvent = {
      sessionId: 'replay-session-001',
      timestamp: t * 1000,
      pose: s.state as any,
      readiness,
      action: {
        type: s.state === 'asking' ? 'interrupt_speak' : s.state === 'withdrawing' ? 'withdraw_question' : 'idle',
        textToSpeak: s.state === 'asking' ? candidate?.text : undefined,
        candidateId: candidate?.id,
      },
      concernProgress: {
        concernId: CONCERN.askedIn,
        resolvedCount: resolvedPoints.length,
        totalPoints: CONCERN.points.length,
        isFullyResolved: resolvedPoints.length === CONCERN.points.length,
      },
    };
    this.callbacks.onDoctorDispatch?.(dispatch);

    // 2. Transcript
    const activeUtt = UTTERANCES.find((u) => t >= u.start && t < u.end);
    if (activeUtt) {
      const isCut = !!(activeUtt.cutAt && t >= activeUtt.cutAt);
      const delta: AsrTranscriptDelta = {
        sessionId: 'replay-session-001',
        transcriptId: activeUtt.id,
        speaker: activeUtt.who,
        text: activeUtt.text,
        delta: activeUtt.text,
        isFinal: isCut || t >= activeUtt.end - 0.2,
        confidence: 0.98,
        timeRange: {
          startMs: activeUtt.start * 1000,
          endMs: activeUtt.end * 1000,
        },
      };
      this.callbacks.onTranscript?.(delta);
    }

    // 3. System 1 Jev Verdict
    const latestJudgment = [...JUDGMENTS].reverse().find((j) => j.t <= t);
    if (latestJudgment) {
      const jevResp: JevDecisionResponse = {
        requestId: latestJudgment.id,
        verdict: latestJudgment.verdict === 'on' ? 'on_topic' : 'drifting',
        action: latestJudgment.action === 'ask' ? 'trigger_interrupt' : latestJudgment.action === 'withdraw' ? 'withdraw_followup' : 'listen',
        confidence: 0.95,
        resolvedPointIds: latestJudgment.resolves || [],
        diagnosticReason: latestJudgment.read,
        latencyMs: 42,
        timestamp: latestJudgment.t * 1000,
      };
      this.callbacks.onSystem1Verdict?.(jevResp);
    }

    // 4. System 2 PiAgent Candidate
    const activeCand = [...CANDIDATES].reverse().find((c) => t >= c.preparedFrom);
    if (activeCand) {
      const phase = t < activeCand.readyAt ? 'drafting' : t < activeCand.decidedAt ? 'ready' : (activeCand.fate as any);
      const candPayload: FollowupCandidate = {
        id: activeCand.id,
        targetConcernId: 'concern-01',
        phase,
        draftText: activeCand.text,
        basis: activeCand.basis,
        sourceEvidence: 'ANSHU-3 临床亚组分析表 · 第 14 页',
        triggerCondition: '代表持续介绍获益而未说明高龄禁忌',
        preparedFromMs: activeCand.preparedFrom * 1000,
        readyAtMs: activeCand.readyAt * 1000,
        decidedAtMs: activeCand.decidedAt * 1000,
        fate: activeCand.fate,
      };
      this.callbacks.onSystem2Candidate?.(candPayload);
    }
  }
}
