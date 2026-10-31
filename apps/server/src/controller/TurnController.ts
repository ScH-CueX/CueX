import { randomUUID } from 'node:crypto';
import { diffChars } from 'diff';
import type { ConcernDef, ControllerDispatchEvent, DoctorPoseName, FollowupCandidate, JevDecisionResponse, ServerMessage, TtsPlaybackReport } from '@cuex/protocol';
import { encodeSystemOneState, S1_QUESTION_IDS } from '../contracts';
import type { DialogueTurn, JevQuestion, ScenarioPack, SystemOneClient, SystemOneResult, SystemTwo, TtsEngine } from '../contracts';

export interface ControllerEngines { system1: SystemOneClient; system2: SystemTwo; tts: TtsEngine }
export interface ControllerOptions {
  debounceMs?: number;
  minDriftMs?: number;
  minDriftChars?: number;
  candidateHoldMs?: number;
  minInterruptGapMs?: number;
}
interface HeldCandidate { event: FollowupCandidate; targetPointIds: string[]; abort: AbortController }
interface SpeechOutput { abort: AbortController; utteranceId: string; transcriptId: string; text: string; start: number; turn: DialogueTurn; chunks: string[]; reported: boolean }

/** Per-session state machine. Engines never own dialogue or candidate lifecycle. */
export class TurnController {
  private readonly timing: Required<ControllerOptions>;
  private readonly history: DialogueTurn[] = [];
  private readonly candidates: FollowupCandidate[] = [];
  private readonly resolved = new Set<string>();
  private readonly provisionalResolved = new Set<string>();
  private asrConsumedPrefix = '';
  private lastInputWasAsr = false;
  private concernIndex = 0;
  private concernFinalSpeech = '';
  private sentence = '';
  private recentSpeech = '';
  private transcriptId = randomUUID();
  private transcriptStart = Date.now();
  private revision = 0;
  private stopped = false;
  private evaluationAbort?: AbortController;
  private evaluationInFlight = false;
  private evaluationTimer?: ReturnType<typeof setTimeout>;
  private candidateTimer?: ReturnType<typeof setTimeout>;
  private held?: HeldCandidate;
  private drift?: { since: number; chars: number; revision: number; observations: number };
  private lastInterruptAt = 0;
  private speech?: SpeechOutput;
  private readonly outputs = new Map<string, SpeechOutput>();

  constructor(
    readonly sessionId: string,
    private readonly pack: ScenarioPack,
    private readonly engines: ControllerEngines,
    private readonly emit: (event: ServerMessage) => void,
    options: ControllerOptions = {},
  ) {
    this.timing = { debounceMs: 280, minDriftMs: 900, minDriftChars: 35, candidateHoldMs: 650, minInterruptGapMs: 2000, ...options };
  }

  start(): void { void this.speak(this.pack.doctorOpening, 'speaking'); }
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
      if (isFinal) this.asrConsumedPrefix = '';
    }
    if (!text.trim() && !isFinal) return;
    this.acceptTranscript(text, isFinal, text.slice(-80));
  }

  private acceptTranscript(text: string, isFinal: boolean, recent: string): void {
    if (this.stopped || (!text.trim() && !isFinal)) return;
    if (this.speech && (this.speech.text || !this.held)) this.interruptDoctor();
    // ASR partials are revisable. Re-evaluate their tentative progress against the latest hypothesis.
    for (const id of this.provisionalResolved) this.resolved.delete(id);
    this.provisionalResolved.clear();
    const previous = this.sentence;
    this.sentence = text;
    this.recentSpeech = recent.slice(-80);
    this.revision++;
    // Cancel replaced ASR hypotheses now; additive speech is sampled at the next decision tick.
    if (previous && !text.startsWith(previous)) this.evaluationAbort?.abort();
    this.emit({ type: 'asr.transcript', payload: {
      sessionId: this.sessionId, transcriptId: this.transcriptId, speaker: 'rep', text,
      delta: text.startsWith(previous) ? text.slice(previous.length) : text,
      isFinal, confidence: 1, timeRange: { startMs: this.transcriptStart, endMs: Date.now() },
    } });
    if (isFinal) this.commitRepSentence();
    if (!this.repSpeech.trim()) { this.dispatch('listening', { type: 'idle' }); return; }
    if (isFinal || this.held) { clearTimeout(this.evaluationTimer); this.evaluationTimer = undefined; }
    if (!this.evaluationTimer) this.evaluationTimer = setTimeout(() => {
      this.evaluationTimer = undefined;
      void this.evaluate(false);
    }, isFinal || this.held ? 0 : this.timing.debounceMs);
  }

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
    if (this.stopped || !this.repSpeech.trim()) return false;
    if (!recheck && this.evaluationInFlight) return false;
    const revision = this.revision;
    const speechSnapshot = this.repSpeech;
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
      // Ordinary snapshots remain evidence when more speech is appended. Output checks must be exact.
      if (recheck ? revision !== this.revision : !this.repSpeech.startsWith(speechSnapshot)) return false;
      this.applyDecision(result, recheck);
      if (!recheck) return true;
      const p = (id: string) => result.answers[id]?.probabilities.true ?? result.answers[id]?.value ?? 0;
      return p(S1_QUESTION_IDS.responding) < 0.60 && p(S1_QUESTION_IDS.drift) >= 0.65 && p(S1_QUESTION_IDS.candidateValid) >= 0.5;
    } catch (error) {
      if (!abort.signal.aborted && !this.stopped) this.error('SYSTEM1_ERROR', '快速判断暂时不可用，请继续回答。');
      return false;
    } finally {
      if (this.evaluationAbort === abort) {
        this.evaluationInFlight = false;
        if (!this.stopped && revision !== this.revision && concernId === this.concern.id) {
          clearTimeout(this.evaluationTimer);
          this.evaluationTimer = setTimeout(() => { this.evaluationTimer = undefined; void this.evaluate(recheck && this.held?.event.phase === 'ready'); }, 0);
        }
      }
    }
  }

  private applyDecision(result: SystemOneResult, recheck: boolean): void {
    const probability = (id: string) => result.answers[id]?.probabilities.true ?? result.answers[id]?.value ?? 0;
    const newlyResolved = this.unresolved.filter(id => probability(S1_QUESTION_IDS.resolved(id)) >= 0.72);
    newlyResolved.forEach(id => { this.resolved.add(id); if (this.sentence) this.provisionalResolved.add(id); });
    const responding = probability(S1_QUESTION_IDS.responding) >= 0.60;
    const drifting = !responding && probability(S1_QUESTION_IDS.drift) >= 0.65;
    const targetAnswered = !!this.held && this.held.targetPointIds.every(id => this.resolved.has(id));
    const invalid = recheck && probability(S1_QUESTION_IDS.candidateValid) < 0.5;
    const withdraw = !!this.held && (responding || targetAnswered || invalid || this.unresolved.length === 0);
    if (drifting) {
      if (!this.drift) this.drift = { since: Date.now(), chars: this.repSpeech.length, revision: this.revision, observations: 1 };
      else if (this.drift.revision !== this.revision) { this.drift.revision = this.revision; this.drift.observations++; }
    } else this.drift = undefined;
    const sustained = !!this.drift && this.drift.observations >= 2 && Date.now() - this.drift.since >= this.timing.minDriftMs
      && this.repSpeech.length - this.drift.chars >= this.timing.minDriftChars;
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
    if (withdraw) this.withdrawCandidate();
    if (this.unresolved.length === 0) {
      this.dispatch('listening', { type: 'nod' }, 0, 0.1);
      this.drift = undefined;
      if (!this.sentence) this.advanceConcern();
      return;
    }
    if (canInterrupt && this.held) {
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
    if (this.held || this.stopped) return;
    const event: FollowupCandidate = { id: randomUUID(), targetConcernId: this.concern.id, phase: 'retrieving', draftText: '', basis: reason,
      triggerCondition: '目标要点仍未回答，且代表继续偏离', preparedFromMs: Date.now() };
    const held: HeldCandidate = { event, targetPointIds: this.unresolved, abort: new AbortController() };
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
      const targets = draft.targetPointIds.filter(id => this.concern.points.some(p => p.id === id));
      if (!draft.text.trim() || !targets.length) throw new Error('Invalid follow-up draft');
      held.targetPointIds = targets;
      Object.assign(event, { draftText: draft.text, basis: draft.basis, triggerCondition: draft.triggerCondition, sourceEvidence: draft.sourceEvidence, phase: 'ready', readyAtMs: Date.now() });
      this.emitCandidate(event);
      this.dispatch('holding', { type: 'idle', candidateId: event.id }, 0.7);
      this.candidateTimer = setTimeout(() => { void this.evaluate(true); }, this.timing.candidateHoldMs);
    } catch (error) {
      if (held.abort.signal.aborted || this.stopped) return;
      if (this.held === held) this.withdrawCandidate();
      this.error('SYSTEM2_ERROR', '追问准备暂时不可用，请继续回答。');
    }
  }

  private withdrawCandidate(): void {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    held.abort.abort();
    if (this.speech && !this.speech.text) this.interruptDoctor('candidate_withdrawn');
    clearTimeout(this.candidateTimer);
    held.event.phase = 'withdrawn'; held.event.fate = 'withdrawn'; held.event.decidedAtMs = Date.now();
    this.emitCandidate(held.event);
    this.dispatch('withdrawing', { type: 'withdraw_question', candidateId: held.event.id }, 0, 0.08);
  }

  private advanceConcern(): void {
    const nextIndex = this.pack.scenario.concerns.findIndex(c => c.id === this.concern.nextConcernId);
    if (nextIndex < 0) return;
    this.concernIndex = nextIndex;
    this.concernFinalSpeech = '';
    this.recentSpeech = '';
    this.revision++;
    this.evaluationAbort?.abort();
    void this.speak(`好，这个说清楚了。${this.concern.points[0].anchorQuestion}`, 'speaking');
  }

  private dispatch(pose: DoctorPoseName, action: ControllerDispatchEvent['action'], readiness = 0, nodAmp?: number): void {
    if (this.stopped) return;
    const resolvedCount = this.concern.points.filter(p => this.resolved.has(p.id)).length;
    this.emit({ type: 'controller.dispatch', payload: { sessionId: this.sessionId, timestamp: Date.now(), pose, readiness, nodAmp, action,
      concernProgress: { concernId: this.concern.id, resolvedCount, totalPoints: this.concern.points.length, isFullyResolved: resolvedCount === this.concern.points.length } } });
  }

  /** Only successfully emitted audio segments enter doctor history. */
  private async speak(text: string, pose: 'speaking' | 'asking', candidateId?: string): Promise<void> {
    this.interruptDoctor('turn_switched');
    const speech: SpeechOutput = { abort: new AbortController(), utteranceId: randomUUID(), transcriptId: randomUUID(), text: '', start: Date.now(), turn: { who: 'doctor', text: '' }, chunks: [], reported: false };
    this.speech = speech;
    this.outputs.set(speech.utteranceId, speech);
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
            const checked = await this.evaluate(true);
            if (!checked || speech.abort.signal.aborted || this.held?.event.id !== candidateId || this.held.targetPointIds.every(id => this.resolved.has(id))) return;
            const held = this.held;
            this.held = undefined;
            held.event.phase = 'spoken'; held.event.fate = 'asked'; held.event.decidedAtMs = Date.now();
            this.emitCandidate(held.event);
            this.lastInterruptAt = Date.now();
            if (this.sentence) this.emit({ type: 'asr.transcript', payload: {
              sessionId: this.sessionId, transcriptId: this.transcriptId, speaker: 'rep', text: this.sentence, delta: '', isFinal: true, confidence: 1,
              timeRange: { startMs: this.transcriptStart, endMs: Date.now() },
            } });
            if (this.lastInputWasAsr) this.asrConsumedPrefix += this.sentence;
            this.commitRepSentence();
            this.provisionalResolved.clear();
            this.dispatch('asking', { type: 'interrupt_speak', textToSpeak: text, candidateId }, 1);
          }
          speech.chunks.push(sent ? '' : segment);
          this.emit({ type: 'tts.stream_chunk', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, chunkIndex: chunkIndex++, isLastChunk: false, audioBase64: chunk.audio.toString('base64') } });
          if (!sent) {
            sent = true; speech.text += segment;
            speech.turn.text = speech.text;
            if (!this.history.includes(speech.turn)) this.history.push(speech.turn);
            this.doctorTranscript(speech, segment, false);
          }
        }
      }
      if (speech.abort.signal.aborted || this.stopped) return;
      this.emit({ type: 'tts.stream_chunk', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, chunkIndex, isLastChunk: true, audioBase64: '' } });
      this.doctorTranscript(speech, '', true);
    } catch (error) {
      if (!speech.abort.signal.aborted && !this.stopped) this.error('TTS_ERROR', '语音输出暂时不可用。');
    } finally {
      if (this.speech === speech) {
        this.speech = undefined;
        if (candidateId && this.held?.event.id === candidateId && !speech.text) this.withdrawCandidate();
        this.dispatch('listening', { type: 'idle' });
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
    this.emit({ type: 'tts.abort', payload: { sessionId: this.sessionId, utteranceId: speech.utteranceId, reason, timestamp: Date.now() } });
    this.doctorTranscript(speech, '', true);
    this.dispatch('listening', { type: 'idle' });
  }

  onPlaybackReport(report: TtsPlaybackReport): void {
    if (report.sessionId !== this.sessionId && report.sessionId !== 'current') return;
    const speech = this.outputs.get(report.utteranceId);
    if (!speech || speech.reported) return;
    speech.reported = true;
    if (report.status === 'stopped') {
      if (this.speech === speech) this.interruptDoctor();
      speech.text = speech.chunks.slice(0, report.completedChunks).join('');
      speech.turn.text = speech.text;
      // Empty updates remove a stopped-before-start line from the frontend as well.
      if (speech.text) this.doctorTranscript(speech, '', true);
      else this.emit({ type: 'asr.transcript', payload: { sessionId: this.sessionId, transcriptId: speech.transcriptId, speaker: 'doctor', text: '', delta: '', isFinal: true, confidence: 1, timeRange: { startMs: speech.start, endMs: Date.now() } } });
    }
    this.outputs.delete(report.utteranceId);
  }

  private actualHistory(): DialogueTurn[] { return [...this.history.filter(t => t.text.trim()).map(t => ({ ...t })), ...(this.sentence.trim() ? [{ who: 'rep' as const, text: this.sentence }] : [])]; }
  snapshot() { return { sessionId: this.sessionId, concernId: this.concern.id, resolvedPointIds: [...this.resolved], history: this.actualHistory(), candidates: this.candidates.map(c => ({ ...c })) }; }
  private emitCandidate(candidate: FollowupCandidate): void { this.emit({ type: 'system2.candidate', payload: { sessionId: this.sessionId, candidate: { ...candidate } } }); }
  private error(code: string, message: string): void { this.emit({ type: 'session.error', payload: { code, message } }); }
  stop(): void {
    if (this.stopped) return;
    this.interruptDoctor('turn_switched');
    this.stopped = true;
    clearTimeout(this.evaluationTimer); clearTimeout(this.candidateTimer);
    this.evaluationAbort?.abort(); this.held?.abort.abort(); this.held = undefined;
  }
}
