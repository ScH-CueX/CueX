import { randomUUID } from 'node:crypto';
import { diffChars } from 'diff';
import { parseBuffer } from 'music-metadata';
import type { ConcernDef, ControllerDispatchEvent, DoctorPoseName, FollowupCandidate, JevDecisionResponse, ServerMessage, TtsPlaybackReport, ReviewMoment, WithdrawalReason, VisitOutcome, SystemTwoActivity } from '@cuex/protocol';
import { encodeSystemOneState, S1_QUESTION_IDS } from '../contracts';
import { isExplicitFarewell } from '../conversation/visitIntent';
import type { DoctorLines } from './DoctorLinePrefetch';
import type { DialogueTurn, JevQuestion, ScenarioPack, SystemOneClient, SystemOneResult, SystemTwo, TtsEngine, DoctorTurnDraft } from '../contracts';

export interface ControllerEngines { system1: SystemOneClient; system2: SystemTwo; tts: TtsEngine }
export interface ControllerOptions {
  debounceMs?: number;
  minDriftMs?: number;
  minDriftChars?: number;
  candidateHoldMs?: number;
  minInterruptGapMs?: number;
  finalQuietMs?: number;
  partialQuietMs?: number;
  idleFirstMs?: number;
  idleSecondMs?: number;
  idleCloseMs?: number;
  turnTimeoutMs?: number;
  outcomeTimeoutMs?: number;
  playbackAckGraceMs?: number;
  retryConcernId?: string;
  doctorLines: DoctorLines;
}
interface HeldCandidate { event: FollowupCandidate; targetPointIds: string[]; abort: AbortController; basisRevision: number }
interface SpeechOutput { abort: AbortController; utteranceId: string; transcriptId: string; text: string; start: number; turn: DialogueTurn; chunks: string[]; reported: boolean; lineKind?: 'opening' | 'retry' | 'closing'; isOpening?: boolean; moment?: ReviewMoment; audioDurationMs: number; normalTurn?: boolean; playbackDone?: boolean; playbackTimedOut?: boolean; fallbackTimer?: ReturnType<typeof setTimeout> }

/** Per-session state machine. Engines never own dialogue or candidate lifecycle. */
export class TurnController {
  private readonly timing: Required<Omit<ControllerOptions, 'retryConcernId' | 'doctorLines'>>;
  private readonly lines: DoctorLines;
  private readonly retryConcernId?: string;
  private completed = false;
  private readonly normalTurns: boolean;
  private turnTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private turnAbort?: AbortController;
  private normalFailures = 0;
  private turnActivity?: { taskId: string; kind: SystemTwoActivity['kind'] };
  private outcome?: VisitOutcome;
  private outcomeAbort?: AbortController;
  private endReason: 'completed' | 'user_requested' | 'farewell' | 'silence' = 'completed';
  private ending = false;
  private idleStage = 0;
  private normalRepSpeech = '';
  private normalSpeechKey = '';
  private lastRepChangeAt = 0;
  private playbackPending?: SpeechOutput;
  private readonly startedAt = Date.now();
  private ended = false;
  private openingOutput?: SpeechOutput;
  private readonly moments: ReviewMoment[] = [];
  private readonly withdrawnSegments = new Map<ReviewMoment, { transcriptId: string; reason: WithdrawalReason }>();
  private lastRepSegment = { transcriptId: '', text: '', isFinal: true };
  private readonly history: DialogueTurn[] = [];
  private readonly candidates: FollowupCandidate[] = [];
  private readonly resolved = new Set<string>();
  private readonly provisionalResolved = new Map<string, { transcriptId: string; text: string }>();
  private readonly committedResolved = new Set<string>();
  private asrConsumedPrefix = '';
  private lastInputWasAsr = false;
  private concernIndex = 0;
  private concernFinalSpeech = '';
  private sentence = '';
  private recentSpeech = '';
  private transcriptId = randomUUID();
  private transcriptStart = Date.now();
  private revision = 0;
  private basisRevision = 0;
  private lastCompletedRecheck: { candidateId: string; valid: boolean } = { candidateId: '', valid: false };
  private outputChecking = false;
  private stopped = false;
  private evaluationAbort?: AbortController;
  private evaluationInFlight = false;
  private evaluationTimer?: ReturnType<typeof setTimeout>;
  private candidateTimer?: ReturnType<typeof setTimeout>;
  private held?: HeldCandidate;
  private drift?: { since: number; revision: number; observations: number };
  private lastInterruptAt = 0;
  private speech?: SpeechOutput;
  private pendingLine?: { text: string; kind: 'retry' | 'closing'; concernId: string; attempts: number; expiresAt: number };
  private pendingLineTimer?: ReturnType<typeof setTimeout>;
  private readonly outputs = new Map<string, SpeechOutput>();

  constructor(
    readonly sessionId: string,
    private readonly pack: ScenarioPack,
    private readonly engines: ControllerEngines,
    private readonly emit: (event: ServerMessage) => void,
    options: ControllerOptions,
  ) {
    const { retryConcernId, doctorLines, ...timing } = options;
    this.lines = doctorLines;
    this.normalTurns = !!engines.system2.prepareTurn;
    this.retryConcernId = retryConcernId;
    this.timing = { debounceMs: 280, minDriftMs: 900, minDriftChars: 35, candidateHoldMs: 650, minInterruptGapMs: 2000, finalQuietMs: 1100, partialQuietMs: 1800, idleFirstMs: 7000, idleSecondMs: 12000, idleCloseMs: 20000, turnTimeoutMs: 8000, outcomeTimeoutMs: 11000, playbackAckGraceMs: 15000, ...timing };
    const retryIndex = pack.scenario.concerns.findIndex(concern => concern.id === retryConcernId);
    if (retryIndex >= 0) {
      this.concernIndex = retryIndex;
      for (const concern of pack.scenario.concerns.slice(0, retryIndex)) for (const point of concern.points) { this.resolved.add(point.id); this.committedResolved.add(point.id); }
    }
  }

  start(): void {
    if (this.normalTurns) this.emit({ type: 'conversation.progress', payload: { sessionId: this.sessionId, resolvedPointIds: [...this.committedResolved] } });
    if (this.concern.nextConcernId) this.lines.prefetch('retry', this.concern.nextConcernId, this.actualHistory());
    if (!this.concern.nextConcernId) this.lines.prefetch('closing', this.concern.id, this.actualHistory());
    void this.speakLine(this.retryConcernId ? 'retry' : 'opening', this.concern.id);
  }
  private async speakLine(kind: 'opening' | 'retry' | 'closing', concernId?: string): Promise<void> {
    const revision = this.revision;
    const line = await this.lines.take(kind, concernId, this.actualHistory());
    if (this.stopped) return;
    const isOpening = !this.history.some(turn => turn.who === 'doctor');
    if (!isOpening && (kind === 'retry' || kind === 'closing')) {
      this.pendingLine = { text: line, kind, concernId: concernId ?? this.concern.id, attempts: 0, expiresAt: Date.now() + 6000 };
      if (revision !== this.revision) { this.schedulePendingLine(); return; }
    } else if (revision !== this.revision) return;
    await this.speak(line, 'speaking', undefined, kind, isOpening);
    if (kind === 'closing' && !this.stopped && !this.pendingLine) this.prefetchNextVisit();
  }
  private schedulePendingLine(): void {
    clearTimeout(this.pendingLineTimer);
    const pending = this.pendingLine;
    if (!pending || this.stopped || pending.attempts >= 2 || Date.now() >= pending.expiresAt || pending.concernId !== this.concern.id || (pending.kind !== 'closing' && this.unresolved.length === 0)) { this.pendingLine = undefined; return; }
    this.pendingLineTimer = setTimeout(() => {
      this.pendingLineTimer = undefined;
      if (this.stopped || this.pendingLine !== pending || Date.now() >= pending.expiresAt || pending.concernId !== this.concern.id || (pending.kind !== 'closing' && this.unresolved.length === 0)) { this.pendingLine = undefined; return; }
      if (this.speech && !this.speech.abort.signal.aborted && this.speech.lineKind === pending.kind && !this.speech.text) return;
      pending.attempts++;
      void this.speak(pending.text, 'speaking', undefined, pending.kind);
    }, Math.min(700, Math.max(0, pending.expiresAt - Date.now())));
  }

  private cancelNormalWork(): void {
    clearTimeout(this.turnTimer); clearTimeout(this.idleTimer);
    this.turnTimer = undefined; this.idleTimer = undefined;
    this.turnAbort?.abort(); this.turnAbort = undefined;
    if (this.turnActivity) { this.activity(this.turnActivity, 'cancelled'); this.turnActivity = undefined; }
  }

  private activity(task: { taskId: string; kind: SystemTwoActivity['kind'] }, phase: SystemTwoActivity['phase'], reason?: string, sourceEvidence?: string): void {
    if (!this.stopped) this.emit({ type: 'system2.activity', payload: { sessionId: this.sessionId, ...task, phase, reason, sourceEvidence } });
  }

  private scheduleNormalTurn(isFinal: boolean): void {
    if (!this.normalTurns || this.stopped || this.completed) return;
    clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => { this.turnTimer = undefined; void this.prepareNormalTurn('turn_end', 0); }, isFinal ? this.timing.finalQuietMs : this.timing.partialQuietMs);
  }

  private armIdleAfterPlayback(): void {
    if (!this.normalTurns || this.stopped || this.completed || this.playbackPending || this.speech || this.turnAbort || this.turnTimer) return;
    clearTimeout(this.idleTimer);
    const stage = this.idleStage + 1;
    const wait = stage === 1 ? this.timing.idleFirstMs : stage === 2 ? this.timing.idleSecondMs : this.timing.idleCloseMs;
    this.idleTimer = setTimeout(() => { this.idleTimer = undefined; void this.prepareNormalTurn('silence', Math.min(stage, 3)); }, wait);
  }

  private async prepareNormalTurn(trigger: 'turn_end' | 'silence', silenceStage: number): Promise<void> {
    if (!this.engines.system2.prepareTurn || this.stopped || this.completed || this.speech || this.playbackPending || this.turnAbort || this.pendingLine) return;
    if (trigger === 'turn_end' && isExplicitFarewell(this.lastRepSegment.text)) {
      // A partial farewell can still be corrected. Only final heard text can end the visit.
      if (!this.lastRepSegment.isFinal) return;
      this.endReason = 'farewell';
      await this.closeConversation();
      return;
    }
    const revision = this.revision;
    const concernId = this.concern.id;
    const abort = new AbortController();
    this.turnAbort = abort;
    const task = { taskId: randomUUID(), kind: (trigger === 'silence' ? 'silence_prompt' : 'reply') as SystemTwoActivity['kind'] };
    this.turnActivity = task; this.activity(task, 'preparing');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const draft = await Promise.race([this.engines.system2.prepareTurn({ sessionId: this.sessionId, pack: this.pack, concernId, resolvedPointIds: [...this.committedResolved], history: this.actualHistory(), repSpeech: this.normalRepSpeech, trigger, silenceStage, signal: abort.signal }), new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error('turn timeout')); }, this.timing.turnTimeoutMs); })]);
      if (abort.signal.aborted || this.stopped || revision !== this.revision || concernId !== this.concern.id) return;
      if (!draft.text.trim()) throw new Error('empty doctor turn');
      this.normalFailures = 0;
      this.activity(task, 'ready', draft.basis, draft.sourceEvidence);
      this.reconcileTurnProgress(draft);
      if (this.held?.targetPointIds.some(id => this.resolved.has(id))) this.withdrawCandidate('target_answered');
      else if (this.held) {
        this.held.abort.abort(); this.held.event.phase = 'idle'; this.emitCandidate(this.held.event); this.held = undefined; clearTimeout(this.candidateTimer);
      }
      if (silenceStage) this.idleStage = silenceStage;
      this.turnAbort = undefined; this.turnActivity = undefined;
      this.activity(task, 'speaking', draft.basis, draft.sourceEvidence);
      if (draft.action === 'end_visit' || silenceStage >= 3) {
        this.endReason = silenceStage >= 3 ? 'silence' : 'farewell';
        await this.closeConversation(draft.text);
      } else if (this.unresolved.length === 0 && this.concern.nextConcernId) {
        this.dispatch('listening', { type: 'nod' }, 0, 0.1);
        this.advanceConcern();
      } else {
        await this.speak(draft.text, 'speaking', undefined, undefined, false, true);
      }
      if (revision === this.revision) this.normalRepSpeech = '';
      this.activity(task, revision === this.revision ? 'completed' : 'cancelled');
    } catch {
      if (!this.stopped && revision === this.revision) {
        this.activity(task, 'error');
        this.normalFailures++;
        if (this.normalFailures <= 1) this.turnTimer = setTimeout(() => { this.turnTimer = undefined; void this.prepareNormalTurn(trigger, silenceStage); }, 350);
        else {
          this.error('SYSTEM2_TURN_ERROR', '回应暂未生成，请重试。');
          this.turnAbort = undefined;
          this.turnActivity = undefined;
          this.dispatch('listening', { type: 'idle' });
        }
      }
    } finally {
      clearTimeout(timeout);
      if (this.turnAbort === abort) this.turnAbort = undefined;
    }
  }

  private reconcileTurnProgress(draft: DoctorTurnDraft): void {
    const known = new Set(this.pack.scenario.concerns.flatMap(concern => concern.points.map(point => point.id)));
    const reopened = new Set([...draft.contradictedPointIds, ...(draft.reopenedPointIds ?? [])].filter(id => known.has(id)));
    for (const id of reopened) { this.resolved.delete(id); this.committedResolved.delete(id); this.provisionalResolved.delete(id); }
    for (const id of draft.resolvedPointIds) if (known.has(id) && !reopened.has(id)) { this.resolved.add(id); this.committedResolved.add(id); this.provisionalResolved.delete(id); }
    this.emit({ type: 'conversation.progress', payload: { sessionId: this.sessionId, resolvedPointIds: [...this.committedResolved] } });
    this.dispatch('listening', { type: 'idle' });
  }

  async finishVisit(): Promise<void> {
    if (this.stopped || this.ending || this.ended) return;
    this.endReason = 'user_requested';
    await this.closeConversation();
  }

  private async closeConversation(spokenClosing?: string): Promise<void> {
    if (this.stopped || this.ending || this.ended) return;
    this.ending = true; this.completed = true; this.cancelNormalWork();
    this.evaluationAbort?.abort(); clearTimeout(this.candidateTimer);
    this.pendingLine = undefined; clearTimeout(this.pendingLineTimer);
    if (this.held) { this.held.abort.abort(); this.held = undefined; }
    this.interruptDoctor('turn_switched');
    if (this.playbackPending) {
      this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: this.playbackPending.utteranceId, reason: 'turn_switched', timestamp: Date.now() } });
      clearTimeout(this.playbackPending.fallbackTimer); this.playbackPending = undefined;
    }
    this.outcome = await this.assessOutcome();
    if (this.stopped) return;
    const text = spokenClosing ?? (this.outcome.assessment === 'completed' ? this.outcome.doctorResponse : await this.lines.take('closing', this.concern.id, this.actualHistory()));
    if (this.stopped) return;
    await this.speak(text, 'speaking', undefined, 'closing', false, true);
    if (!this.stopped) this.prefetchNextVisit();
  }

  private async assessOutcome(): Promise<VisitOutcome> {
    const unavailable: VisitOutcome = { assessment: 'unavailable', stance: 'needs_evidence', doctorResponse: '', rationale: '复盘暂未生成，请重试。', strengths: [], gaps: [], nextStep: '重试复盘' };
    if (!this.engines.system2.prepareOutcome) return unavailable;
    const task = { taskId: randomUUID(), kind: 'assessment' as const };
    this.activity(task, 'preparing');
    const abort = new AbortController(); this.outcomeAbort = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([this.engines.system2.prepareOutcome({ sessionId: this.sessionId, pack: this.pack, history: this.actualHistory(), resolvedPointIds: [...this.committedResolved], endReason: this.endReason, signal: abort.signal }), new Promise<undefined>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(undefined); }, this.timing.outcomeTimeoutMs); })]);
      if (!outcome || abort.signal.aborted || this.stopped) { this.activity(task, 'error'); return unavailable; }
      this.activity(task, 'completed'); return outcome;
    } catch { this.activity(task, 'error'); return unavailable; }
    finally { clearTimeout(timer); if (this.outcomeAbort === abort) this.outcomeAbort = undefined; }
  }

  private prefetchNextVisit(): void {
    const history = this.actualHistory();
    this.lines.prefetch('opening', this.pack.scenario.concerns[0].id);
    const retryConcerns = new Set(this.candidates.filter(candidate => candidate.fate).map(candidate => candidate.targetConcernId));
    for (const concernId of retryConcerns) {
      const missed = this.pack.scenario.concerns.find(concern => concern.id === concernId)!.points.filter(point => !this.resolved.has(point.id)).map(point => point.id);
      this.lines.refresh('retry', concernId, history, missed);
    }
  }
  get concern(): ConcernDef { return this.pack.scenario.concerns[this.concernIndex]; }
  private get repSpeech(): string { return this.concernFinalSpeech + this.sentence; }
  private get unresolved(): string[] { return this.concern.points.filter(p => !this.resolved.has(p.id)).map(p => p.id); }

  /** Text transport accepts incremental text, or cumulative text for the current sentence. */
  onSpeechDelta(text: string, isFinal: boolean): void {
    this.lastInputWasAsr = false;
    const full = text.startsWith(this.sentence) ? text : this.sentence + text;
    this.acceptTranscript(full, isFinal, full.slice(-80));
  }

  /** ASR callbacks already contain the full current sentence. */
  onAsrTranscript(text: string, isFinal: boolean): void {
    this.lastInputWasAsr = true;
    let consumedOnly = false;
    if (this.asrConsumedPrefix) {
      const consumed = this.asrConsumedPrefix;
      if (text.startsWith(consumed)) text = text.slice(consumed.length);
      else {
        // Reconcile ASR edits inside the already-consumed prefix before taking the new tail.
        const changes = diffChars(consumed, text);
        const stableChars = changes.filter(change => !change.added && !change.removed).reduce((sum, change) => sum + change.value.length, 0);
        if (stableChars >= consumed.length * 0.6) {
          let oldChars = 0;
          let newChars = 0;
          for (const change of changes) {
            if (oldChars >= consumed.length) break;
            if (!change.added) oldChars += change.value.length;
            if (!change.removed) newChars += change.value.length;
          }
          text = text.slice(newChars);
        } else this.asrConsumedPrefix = '';
      }
      consumedOnly = !text.trim();
      if (isFinal) this.asrConsumedPrefix = '';
    }
    if (consumedOnly || (!text.trim() && !isFinal)) return;
    this.acceptTranscript(text, isFinal, text.slice(-80));
  }

  private acceptTranscript(text: string, isFinal: boolean, recent: string): void {
    if (this.stopped || (!text.trim() && !isFinal)) return;
    const speechKey = this.normalizeSpeech(text);
    const changed = speechKey !== this.normalSpeechKey;
    if (this.normalTurns && !changed && (!isFinal || this.lastRepSegment.isFinal)) return;
    if (this.normalTurns && changed) {
      this.normalSpeechKey = speechKey; this.lastRepChangeAt = Date.now(); this.idleStage = 0;
      this.cancelNormalWork();
      if (this.playbackPending && this.speech !== this.playbackPending) {
        const playing = this.playbackPending; playing.playbackDone = true; clearTimeout(playing.fallbackTimer);
        this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: playing.utteranceId, reason: 'user_interrupted', timestamp: Date.now() } });
        this.playbackPending = undefined;
      }
      this.normalRepSpeech = [...this.history.slice(this.history.map(turn => turn.who).lastIndexOf('doctor') + 1).filter(turn => turn.who === 'rep').map(turn => turn.text), text].join('');
    }
    if (this.pendingLine && !this.speech?.text) this.schedulePendingLine();
    if (this.completed) return;
    if (this.speech && (this.speech.text || !this.held)) this.interruptDoctor();
    const previous = this.sentence;
    const extendsEvidence = (evidence: string) => this.normalizeSpeech(text).startsWith(this.normalizeSpeech(evidence));
    for (const [id, evidence] of this.provisionalResolved) {
      if (evidence.transcriptId !== this.transcriptId) continue;
      if (!extendsEvidence(evidence.text)) { this.provisionalResolved.delete(id); if (!this.committedResolved.has(id)) this.resolved.delete(id); }
      else if (isFinal) { this.committedResolved.add(id); this.provisionalResolved.delete(id); }
    }
    this.sentence = text;
    this.lastRepSegment = { transcriptId: this.transcriptId, text, isFinal };
    for (const [moment, segment] of this.withdrawnSegments) {
      if (segment.transcriptId !== this.transcriptId) continue;
      moment.repSaid = this.withdrawnRepText(text, segment.reason);
      if (isFinal) this.withdrawnSegments.delete(moment);
    }
    this.recentSpeech = recent.slice(-80);
    this.revision++;
    // Cancel replaced ASR hypotheses now; additive speech is sampled at the next decision tick.
    if (previous && !this.normalizeSpeech(text).startsWith(this.normalizeSpeech(previous))) { this.basisRevision++; this.evaluationAbort?.abort(); }
    this.emit({ type: 'asr.transcript', payload: {
      sessionId: this.sessionId, transcriptId: this.transcriptId, speaker: 'rep', text,
      delta: text.startsWith(previous) ? text.slice(previous.length) : text,
      isFinal, confidence: 1, timeRange: { startMs: this.transcriptStart, endMs: Date.now() },
    } });
    if (isFinal) this.commitRepSentence();
    if (this.normalTurns) this.scheduleNormalTurn(isFinal);
    if (!this.repSpeech.trim()) { this.dispatch('listening', { type: 'idle' }); return; }
    if (isFinal || this.held) { clearTimeout(this.evaluationTimer); this.evaluationTimer = undefined; }
    if (!this.evaluationTimer) this.evaluationTimer = setTimeout(() => {
      this.evaluationTimer = undefined;
      void this.evaluate(false);
    }, isFinal || this.held ? 0 : this.timing.debounceMs);
  }

  private normalizeSpeech(text: string): string { return text.replace(/[\p{P}\p{Z}\p{S}\s]/gu, ''); }

  private commitRepSentence(): void {
    if (this.sentence.trim()) {
      this.history.push({ who: 'rep', text: this.sentence });
      this.concernFinalSpeech += this.sentence;
    }
    this.sentence = '';
    this.transcriptId = randomUUID();
    this.transcriptStart = Date.now();
  }

  private questions(recheck: boolean): Record<string, JevQuestion> {
    const questions: Record<string, JevQuestion> = {
      [S1_QUESTION_IDS.responding]: { kind: 'noul', question: `代表最近的话是否正在回应医生的“${this.concern.title}”关切，或明确表示马上回答？明确转回问题时继续听。` },
      [S1_QUESTION_IDS.drift]: { kind: 'noul', question: `代表最近的话是否继续介绍无关结果，把尚未解答的要点搁置了？` },
    };
    for (const point of this.concern.points.filter(p => !this.resolved.has(p.id))) {
      questions[S1_QUESTION_IDS.resolved(point.id)] = { kind: 'noul', question: `代表是否已经实质回答“${point.label}”：${point.anchorQuestion}？只提到关键词或说稍后回答不算回答。` };
    }
    if (recheck && this.held) questions[S1_QUESTION_IDS.candidateValid] = { kind: 'noul', question: `候选追问的条件现在是否仍成立：${this.held.event.triggerCondition}？代表正在回答时条件不成立。` };
    return questions;
  }

  private async evaluate(recheck: boolean): Promise<boolean> {
    if (this.stopped || this.completed || !this.repSpeech.trim()) return false;
    if (!recheck && (this.evaluationInFlight || this.outputChecking)) return false;
    const revision = this.revision;
    const speechSnapshot = this.repSpeech;
    const segmentId = this.transcriptId;
    const segmentText = this.sentence;
    const onFinalSegment = !this.sentence;
    const concernId = this.concern.id;
    this.evaluationAbort?.abort();
    const abort = new AbortController();
    this.evaluationAbort = abort;
    this.evaluationInFlight = true;
    try {
      const result = await this.engines.system1.decide(encodeSystemOneState({
        concernId, concern: this.concern.title, unresolvedPointIds: this.unresolved,
        repSpeechSinceConcern: this.repSpeech, recentSpeech: this.recentSpeech,
        ...(recheck && this.held ? { candidate: { targetPointIds: this.held.targetPointIds, triggerCondition: this.held.event.triggerCondition } } : {}),
      }), this.questions(recheck), abort.signal);
      if (abort.signal.aborted || this.stopped || concernId !== this.concern.id) return false;
      const probability = (id: string) => result.answers[id]?.probabilities.true ?? result.answers[id]?.value ?? 0;
      if (recheck && this.held) this.lastCompletedRecheck = { candidateId: this.held.event.id, valid: probability(S1_QUESTION_IDS.responding) < 0.60 && probability(S1_QUESTION_IDS.candidateValid) >= 0.5 && probability(S1_QUESTION_IDS.drift) >= 0.65 };
      // Ordinary snapshots remain evidence when more speech is appended. Output checks must be exact.
      if (recheck ? revision !== this.revision : !this.repSpeech.startsWith(speechSnapshot)) return false;
      this.applyDecision(result, recheck, { transcriptId: segmentId, text: segmentText, final: onFinalSegment });
      if (!recheck) return true;
      const p = (id: string) => result.answers[id]?.probabilities.true ?? result.answers[id]?.value ?? 0;
      return p(S1_QUESTION_IDS.responding) < 0.60 && p(S1_QUESTION_IDS.drift) >= 0.65 && p(S1_QUESTION_IDS.candidateValid) >= 0.5;
    } catch (error) {
      if (!abort.signal.aborted && !this.stopped) this.error('SYSTEM1_ERROR', '快速判断暂时不可用，请继续回答。');
      return false;
    } finally {
      if (this.evaluationAbort === abort) {
        this.evaluationInFlight = false;
        if (!this.stopped && !this.outputChecking && revision !== this.revision && concernId === this.concern.id) {
          clearTimeout(this.evaluationTimer);
          this.evaluationTimer = setTimeout(() => { this.evaluationTimer = undefined; void this.evaluate(recheck && this.held?.event.phase === 'ready'); }, 0);
        }
      }
    }
  }

  private applyDecision(result: SystemOneResult, recheck: boolean, segment: { transcriptId: string; text: string; final: boolean }): void {
    const probability = (id: string) => result.answers[id]?.probabilities.true ?? result.answers[id]?.value ?? 0;
    const newlyResolved = this.normalTurns ? [] : this.unresolved.filter(id => probability(S1_QUESTION_IDS.resolved(id)) >= 0.72);
    newlyResolved.forEach(id => {
      this.resolved.add(id);
      if (segment.final) this.committedResolved.add(id);
      else if (segment.transcriptId === this.transcriptId && this.normalizeSpeech(this.sentence).startsWith(this.normalizeSpeech(segment.text))) this.provisionalResolved.set(id, { transcriptId: segment.transcriptId, text: segment.text });
      else this.committedResolved.add(id); // An append-only sentence finalized while this readout was in flight.
    });
    const responding = probability(S1_QUESTION_IDS.responding) >= 0.60;
    const drifting = !responding && probability(S1_QUESTION_IDS.drift) >= 0.65;
    const targetAnswered = !!this.held && this.held.targetPointIds.some(id => this.resolved.has(id));
    const revisedBasis = recheck && !!this.held && this.held.basisRevision !== this.basisRevision && probability(S1_QUESTION_IDS.candidateValid) < 0.5;
    const withdrawalReason: WithdrawalReason | undefined = targetAnswered || this.unresolved.length === 0 ? 'target_answered' : responding ? 'response_cue' : revisedBasis ? 'basis_revised' : undefined;
    const withdraw = !!this.held && !!withdrawalReason;
    if (drifting) {
      if (!this.drift) this.drift = { since: Date.now(), revision: this.revision, observations: 1 };
      else if (this.drift.revision !== this.revision) { this.drift.revision = this.revision; this.drift.observations++; }
    } else this.drift = undefined;
    const sustained = !!this.drift && this.drift.observations >= 2 && Date.now() - this.drift.since >= this.timing.minDriftMs
      // Preparation is speculative: count the speech already judged as drift, not only words added after detection.
      && this.normalizeSpeech(this.recentSpeech).length >= this.timing.minDriftChars;
    const canInterrupt = recheck && this.held?.event.phase === 'ready' && !this.speech && drifting && !withdraw
      && Date.now() - this.lastInterruptAt >= this.timing.minInterruptGapMs;
    const action: JevDecisionResponse['action'] = this.unresolved.length === 0 ? 'resolve_and_move_on' : withdraw ? 'withdraw_followup'
      : canInterrupt ? 'trigger_interrupt' : sustained && !this.held ? 'prepare_followup' : 'listen';
    const reason = this.unresolved.length === 0 ? '本轮关切已全部回答'
      : withdraw ? '代表已转回当前问题，候选追问不再需要'
        : drifting ? `代表继续介绍其他结果，仍未回答：${this.concern.points.filter(p => !this.resolved.has(p.id)).map(p => p.label).join('、')}`
          : newlyResolved.length ? '代表已回答部分关切要点，继续听' : '代表正在回应，继续听';
    this.emit({ type: 'system1.verdict', payload: {
      requestId: randomUUID(), verdict: withdraw ? 'self_correcting' : drifting ? 'drifting' : 'on_topic', action,
      confidence: Math.max(probability(responding ? S1_QUESTION_IDS.responding : S1_QUESTION_IDS.drift), 0.5),
      resolvedPointIds: newlyResolved, diagnosticReason: reason, latencyMs: result.latencyMs, timestamp: Date.now(),
    } });
    if (withdraw) this.withdrawCandidate(withdrawalReason!);
    if (this.unresolved.length === 0) {
      this.dispatch('listening', { type: 'nod' }, 0, 0.1);
      this.drift = undefined;
      if (!this.sentence) this.advanceConcern();
      return;
    }
    if (canInterrupt && this.held) {
      if (this.normalTurns) this.cancelNormalWork();
      const held = this.held;
      clearTimeout(this.candidateTimer);
      this.drift = undefined;
      // Keep the candidate ready while TTS is being prepared. New rep speech can still withdraw it.
      void this.speak(held.event.draftText, 'asking', held.event.id);
    } else if (action === 'prepare_followup') {
      void this.prepareCandidate(reason);
    } else if (!withdraw) {
      this.dispatch(this.held?.event.phase === 'ready' ? 'holding' : 'listening', { type: newlyResolved.length ? 'nod' : 'idle' }, this.held?.event.phase === 'ready' ? 0.7 : 0, newlyResolved.length ? 0.08 : undefined);
      if (!this.speech && this.held?.event.phase === 'ready' && drifting) {
        clearTimeout(this.candidateTimer);
        const remaining = Math.max(0, this.held.event.readyAtMs! + this.timing.candidateHoldMs - Date.now(), this.lastInterruptAt + this.timing.minInterruptGapMs - Date.now());
        this.candidateTimer = setTimeout(() => { void this.evaluate(true); }, remaining);
      }
    }
  }

  private async prepareCandidate(reason: string): Promise<void> {
    if (this.held || this.stopped || this.completed) return;
    const event: FollowupCandidate = { id: randomUUID(), targetConcernId: this.concern.id, phase: 'retrieving', draftText: '', basis: reason,
      triggerCondition: '目标要点仍未回答，且代表继续偏离', preparedFromMs: Date.now() };
    const held: HeldCandidate = { event, targetPointIds: this.unresolved, abort: new AbortController(), basisRevision: this.basisRevision };
    this.held = held;
    this.candidates.push(event);
    this.emitCandidate(event);
    try {
      const draft = await this.engines.system2.prepareFollowup({
        sessionId: this.sessionId, pack: this.pack, concernId: this.concern.id, unresolvedPointIds: this.unresolved,
        history: this.actualHistory(), repSpeechSinceConcern: this.repSpeech, reason, signal: held.abort.signal,
      }, (phase, partial) => {
        if (this.held !== held || held.abort.signal.aborted || this.stopped) return;
        if (event.phase === phase && !partial) return;
        event.phase = phase;
        if (partial) event.draftText = partial;
        this.emitCandidate(event);
      });
      if (this.held !== held || held.abort.signal.aborted || this.stopped) return;
      const openPoints = new Set(this.unresolved);
      const targets = draft.targetPointIds.filter(id => openPoints.has(id));
      if (!targets.length) { this.withdrawCandidate('target_answered'); return; }
      if (!draft.text.trim()) throw new Error('Invalid follow-up draft');
      held.targetPointIds = targets;
      Object.assign(event, { draftText: draft.text, basis: draft.basis, triggerCondition: draft.triggerCondition, sourceEvidence: draft.sourceEvidence, phase: 'ready', readyAtMs: Date.now() });
      this.emitCandidate(event);
      this.dispatch('holding', { type: 'idle', candidateId: event.id }, 0.7);
      this.candidateTimer = setTimeout(() => { void this.evaluate(true); }, this.timing.candidateHoldMs);
    } catch (error) {
      if (held.abort.signal.aborted || this.stopped) return;
      if (this.held === held) { this.held = undefined; held.abort.abort(); this.dispatch('listening', { type: 'idle' }); }
      this.error('SYSTEM2_ERROR', '追问准备暂时不可用，请继续回答。');
    }
  }

  private withdrawnRepText(text: string, reason: WithdrawalReason): string {
    if (reason === 'response_cue') {
      const cue = [...text.matchAll(/我先回答|我直接回答|抱歉[，,]?我|不过我(?:得|要)?先说明|回到您(?:的)?问题/g)].at(-1);
      if (cue?.index !== undefined) text = text.slice(cue.index);
    }
    return text.trim().slice(0, 60);
  }

  private withdrawCandidate(withdrawalReason: WithdrawalReason): void {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    held.abort.abort();
    if (this.speech && !this.speech.text) this.interruptDoctor('candidate_withdrawn');
    clearTimeout(this.candidateTimer);
    held.event.withdrawalReason = withdrawalReason;
    held.event.phase = 'withdrawn'; held.event.fate = 'withdrawn'; held.event.decidedAtMs = Date.now();
    const moment: ReviewMoment = { kind: 'withdrawn', withdrawalReason, concernId: held.event.targetConcernId, atMs: Date.now() - this.startedAt, repSaid: this.withdrawnRepText(this.lastRepSegment.text, withdrawalReason), withdrawnText: held.event.draftText, basis: held.event.basis, sourceEvidence: held.event.sourceEvidence, openPointIds: [...this.unresolved] };
    this.moments.push(moment);
    if (!this.lastRepSegment.isFinal) this.withdrawnSegments.set(moment, { transcriptId: this.lastRepSegment.transcriptId, reason: withdrawalReason });
    this.emitCandidate(held.event);
    this.dispatch('withdrawing', { type: 'withdraw_question', candidateId: held.event.id }, 0, 0.08);
  }

  private advanceConcern(): void {
    this.pendingLine = undefined; clearTimeout(this.pendingLineTimer);
    if (this.held) this.withdrawCandidate('concern_changed');
    const nextIndex = this.pack.scenario.concerns.findIndex(c => c.id === this.concern.nextConcernId);
    if (nextIndex < 0) {
      if (!this.normalTurns && this.pack.scenario.concerns.every(concern => concern.points.every(point => this.resolved.has(point.id)))) {
        this.completed = true;
        this.evaluationAbort?.abort();
        clearTimeout(this.evaluationTimer);
        clearTimeout(this.candidateTimer);
        void this.speakLine('closing', this.concern.id);
      }
      return;
    }
    this.concernIndex = nextIndex;
    this.concernFinalSpeech = '';
    this.recentSpeech = '';
    this.revision++;
    this.evaluationAbort?.abort();
    if (!this.concern.nextConcernId) this.lines.prefetch('closing', this.concern.id, this.actualHistory());
    // The next concern is a live line too, using the concern retry prompt as its few-shot guidance.
    void this.speakLine('retry', this.concern.id);
  }

  private dispatch(pose: DoctorPoseName, action: ControllerDispatchEvent['action'], readiness = 0, nodAmp?: number): void {
    if (this.stopped) return;
    const resolvedCount = this.concern.points.filter(p => this.resolved.has(p.id)).length;
    this.emit({ type: 'controller.dispatch', payload: { sessionId: this.sessionId, timestamp: Date.now(), pose, readiness, nodAmp, action,
      concernProgress: { concernId: this.concern.id, resolvedCount, totalPoints: this.concern.points.length, isFullyResolved: resolvedCount === this.concern.points.length } } });
  }

  /** Only successfully emitted audio segments enter doctor history. */
  private async speak(text: string, pose: 'speaking' | 'asking', candidateId?: string, lineKind?: 'opening' | 'retry' | 'closing', isOpening = false, normalTurn = false): Promise<void> {
    if (this.normalTurns) this.cancelNormalWork();
    this.interruptDoctor('turn_switched');
    const speech: SpeechOutput = { abort: new AbortController(), utteranceId: randomUUID(), transcriptId: randomUUID(), text: '', start: Date.now(), turn: { who: 'doctor', text: '' }, chunks: [], reported: false, lineKind, isOpening, normalTurn, audioDurationMs: 0 };
    this.speech = speech;
    this.outputs.set(speech.utteranceId, speech);
    if (isOpening) this.openingOutput = speech;
    if (pose === 'asking') this.dispatch('holding', { type: 'idle', candidateId }, 0.95);
    else this.dispatch(pose, { type: 'idle', textToSpeak: text }, 0);
    let chunkIndex = 0;
    const clauses = text.match(/[^。！？!?，,；;]+[。！？!?，,；;]?/g) ?? [text];
    const segments = clauses.flatMap(clause => Array.from({ length: Math.ceil(clause.length / 40) }, (_, index) => clause.slice(index * 40, (index + 1) * 40)));
    try {
      for (const segment of segments) {
        let sent = false;
        for await (const chunk of this.engines.tts.synthesize(segment, speech.abort.signal)) {
          if (speech.abort.signal.aborted || this.stopped) return;
          if (candidateId && this.held?.event.id === candidateId) {
            // TTS may take hundreds of milliseconds. Re-check again with the audio ready to send.
            let checked = false;
            const deadline = Date.now() + 1500;
            this.outputChecking = true;
            this.lastCompletedRecheck = { candidateId: '', valid: false };
            try {
              while (!checked && Date.now() < deadline && !speech.abort.signal.aborted && this.held?.event.id === candidateId) {
                const readout = this.evaluate(true);
                let timer: ReturnType<typeof setTimeout> | undefined;
                const result = await Promise.race([readout, new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now())); })]);
                clearTimeout(timer);
                checked = result;
                if (!checked && Date.now() >= deadline) this.evaluationAbort?.abort();
              }
              if (!checked && Date.now() >= deadline) checked = this.lastCompletedRecheck?.candidateId === candidateId && this.lastCompletedRecheck.valid;
            } finally { this.outputChecking = false; }
            if (!checked || speech.abort.signal.aborted || this.held?.event.id !== candidateId || this.held.targetPointIds.some(id => this.resolved.has(id))) return;
            const held = this.held;
            this.held = undefined;
            held.event.phase = 'spoken'; held.event.fate = 'asked'; held.event.decidedAtMs = Date.now();
            speech.moment = { kind: 'interrupted', concernId: held.event.targetConcernId, atMs: Date.now() - this.startedAt, repSaid: this.lastRepSegment.text.slice(-60), doctorSaid: '', basis: held.event.basis, sourceEvidence: held.event.sourceEvidence, openPointIds: [...this.unresolved] };
            this.moments.push(speech.moment);
            this.emitCandidate(held.event);
            this.lastInterruptAt = Date.now();
            if (this.sentence) this.emit({ type: 'asr.transcript', payload: {
              sessionId: this.sessionId, transcriptId: this.transcriptId, speaker: 'rep', text: this.sentence, delta: '', isFinal: true, confidence: 1,
              timeRange: { startMs: this.transcriptStart, endMs: Date.now() },
            } });
            if (this.lastInputWasAsr) this.asrConsumedPrefix += this.sentence;
            for (const [id, evidence] of this.provisionalResolved) if (evidence.transcriptId === this.transcriptId) { this.committedResolved.add(id); this.provisionalResolved.delete(id); }
            this.commitRepSentence();
            this.dispatch('asking', { type: 'interrupt_speak', textToSpeak: text, candidateId }, 1);
          }
          if (lineKind === 'closing' || this.normalTurns) {
            try {
              const metadata = await parseBuffer(chunk.audio, { mimeType: chunk.mimeType }, { duration: true, skipCovers: true });
              speech.audioDurationMs += (metadata.format.duration ?? segment.length / 4) * 1000;
            } catch { speech.audioDurationMs += segment.length / 4 * 1000; }
            if (speech.abort.signal.aborted || this.stopped) return;
          }
          if (lineKind && this.pendingLine?.text === text) { this.pendingLine = undefined; clearTimeout(this.pendingLineTimer); }
          if (normalTurn && !speech.text && this.sentence.trim()) {
            if (this.lastInputWasAsr) this.asrConsumedPrefix += this.sentence;
            this.emit({ type: 'asr.transcript', payload: { sessionId: this.sessionId, transcriptId: this.transcriptId, speaker: 'rep', text: this.sentence, delta: '', isFinal: true, confidence: 1, timeRange: { startMs: this.transcriptStart, endMs: Date.now() } } });
            this.commitRepSentence();
          }
          if (this.normalTurns) this.playbackPending = speech;
          speech.chunks.push(sent ? '' : segment);
          this.emit({ type: 'tts.stream_chunk', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, chunkIndex: chunkIndex++, isLastChunk: false, audioBase64: chunk.audio.toString('base64') } });
          if (!sent) {
            sent = true; speech.text += segment;
            speech.turn.text = speech.text;
            if (speech.moment) speech.moment.doctorSaid = speech.text;
            if (!this.history.includes(speech.turn)) this.history.push(speech.turn);
            this.doctorTranscript(speech, segment, false);
          }
        }
      }
      if (speech.abort.signal.aborted || this.stopped) return;
      this.emit({ type: 'tts.stream_chunk', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, chunkIndex, isLastChunk: true, audioBase64: '' } });
      this.doctorTranscript(speech, '', true);
      if (lineKind === 'closing') {
        speech.fallbackTimer = setTimeout(() => {
          speech.playbackDone = true;
          if (this.playbackPending === speech) this.playbackPending = undefined;
          this.endVisit();
        }, Math.ceil(speech.audioDurationMs) + 1500);
      } else if (this.normalTurns) {
        speech.fallbackTimer = setTimeout(() => {
          if (speech.reported || this.stopped) return;
          speech.playbackTimedOut = true;
          speech.playbackDone = true;
          speech.abort.abort();
          if (this.playbackPending === speech) this.playbackPending = undefined;
          this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, reason: 'turn_switched', timestamp: Date.now() } });
          this.error('PLAYBACK_TIMEOUT', '语音播放未确认，请继续说或结束拜访。');
          this.dispatch('listening', { type: 'idle' });
        }, Math.ceil(speech.audioDurationMs) + this.timing.playbackAckGraceMs);
      }
    } catch (error) {
      if (!speech.abort.signal.aborted && !this.stopped) {
        speech.abort.abort();
        speech.playbackDone = true;
        clearTimeout(speech.fallbackTimer);
        if (this.playbackPending === speech) this.playbackPending = undefined;
        this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, reason: 'turn_switched', timestamp: Date.now() } });
        this.doctorTranscript(speech, '', true);
        this.error('TTS_ERROR', '语音暂不可用，请继续说或结束拜访。');
        if (lineKind === 'closing') this.endVisit();
      }
    } finally {
      if (this.speech === speech) {
        this.speech = undefined;
        this.dispatch(this.held?.event.phase === 'ready' ? 'holding' : 'listening', { type: 'idle' }, this.held?.event.phase === 'ready' ? 0.7 : 0);
        if (speech.playbackDone && speech.reported && !speech.playbackTimedOut) this.armIdleAfterPlayback();
      }
    }
  }

  private doctorTranscript(speech: NonNullable<TurnController['speech']>, delta: string, isFinal: boolean): void {
    if (!speech.text || this.stopped) return;
    this.emit({ type: 'asr.transcript', payload: { sessionId: this.sessionId, transcriptId: speech.transcriptId, speaker: 'doctor', text: speech.text, delta, isFinal, confidence: 1, timeRange: { startMs: speech.start, endMs: Date.now() } } });
  }

  interruptDoctor(reason: 'user_interrupted' | 'turn_switched' | 'candidate_withdrawn' = 'user_interrupted'): void {
    const speech = this.speech;
    if (!speech) return;
    this.speech = undefined;
    speech.abort.abort();
    clearTimeout(speech.fallbackTimer);
    if (this.playbackPending === speech) this.playbackPending = undefined;
    if (reason === 'user_interrupted' && !speech.text && this.pendingLine && speech.lineKind === this.pendingLine.kind) this.schedulePendingLine();
    this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, reason, timestamp: Date.now() } });
    this.doctorTranscript(speech, '', true);
    this.dispatch('listening', { type: 'idle' });
  }

  onPlaybackReport(report: TtsPlaybackReport): void {
    if (report.sessionId !== this.sessionId && report.sessionId !== 'current') return;
    const speech = this.outputs.get(report.utteranceId);
    if (!speech || speech.reported) return;
    speech.reported = true;
    clearTimeout(speech.fallbackTimer);
    if (report.status === 'stopped') {
      if (this.speech === speech) this.interruptDoctor();
      speech.text = speech.chunks.slice(0, report.completedChunks).join('');
      speech.turn.text = speech.text;
      if (speech.moment) speech.moment.doctorSaid = speech.text;
      // Empty updates remove a stopped-before-start line from the frontend as well.
      if (speech.text) this.doctorTranscript(speech, '', true);
      else this.emit({ type: 'asr.transcript', payload: { sessionId: this.sessionId, transcriptId: speech.transcriptId, speaker: 'doctor', text: '', delta: '', isFinal: true, confidence: 1, timeRange: { startMs: speech.start, endMs: Date.now() } } });
    }
    speech.playbackDone = true;
    if (this.playbackPending === speech) this.playbackPending = undefined;
    this.outputs.delete(report.utteranceId);
    if (this.normalTurns && speech.lineKind !== 'closing' && !speech.playbackTimedOut) {
      if (this.normalRepSpeech && this.lastRepChangeAt > speech.start) this.scheduleNormalTurn(this.lastRepSegment.isFinal);
      else this.armIdleAfterPlayback();
    }
    if (speech.lineKind === 'closing' && !this.stopped) this.endVisit();
  }

  private endVisit(): void {
    if (this.ended || this.stopped || !this.completed) return;
    this.ended = true;
    this.cancelNormalWork();
    const suggested = this.moments.find(moment => moment.kind === 'interrupted') ?? this.moments.find(moment => moment.kind === 'withdrawn');
    this.emit({ type: 'visit.ended', payload: {
      sessionId: this.sessionId, ...(this.outcome ? { outcome: this.outcome } : {}), durationMs: Date.now() - this.startedAt, retry: !!this.retryConcernId, doctorOpening: this.openingOutput?.turn.text ?? '',
      concerns: this.pack.scenario.concerns.map(concern => ({ concernId: concern.id, title: concern.title, points: concern.points.map(point => ({ id: point.id, label: point.label, resolved: this.resolved.has(point.id) })) })),
      moments: this.moments.map(moment => ({ ...moment, openPointIds: [...moment.openPointIds] })),
      ...(suggested ? { suggestedRetryConcernId: suggested.concernId } : {}),
    } });
  }

  private actualHistory(): DialogueTurn[] { return [...this.history.filter(t => t.text.trim()).map(t => ({ ...t })), ...(this.sentence.trim() ? [{ who: 'rep' as const, text: this.sentence }] : [])]; }
  snapshot() { return { sessionId: this.sessionId, completed: this.completed, concernId: this.concern.id, resolvedPointIds: [...this.resolved], history: this.actualHistory(), candidates: this.candidates.map(c => ({ ...c })) }; }
  private emitCandidate(candidate: FollowupCandidate): void { this.emit({ type: 'system2.candidate', payload: { sessionId: this.sessionId, task: 'followup', candidate: { ...candidate } } }); }
  private error(code: string, message: string): void { this.emit({ type: 'session.error', payload: { code, message } }); }
  stop(): void {
    if (this.stopped) return;
    this.interruptDoctor('turn_switched');
    this.stopped = true;
    this.cancelNormalWork(); this.outcomeAbort?.abort();
    clearTimeout(this.evaluationTimer); clearTimeout(this.candidateTimer); clearTimeout(this.pendingLineTimer); this.pendingLine = undefined;
    this.evaluationAbort?.abort(); this.held?.abort.abort(); this.held = undefined;
    for (const output of this.outputs.values()) clearTimeout(output.fallbackTimer);
  }
}
