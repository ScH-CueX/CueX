import { randomInt, randomUUID } from 'node:crypto';
import type { FollowupCandidate, ServerMessage } from '@cuex/protocol';
import type { DialogueTurn, DoctorLineKind, ScenarioPack, SystemTwo } from '../contracts';

export interface DoctorLines {
  prefetch(kind: DoctorLineKind, concernId?: string, history?: DialogueTurn[], missedPointIds?: string[]): void;
  take(kind: DoctorLineKind, concernId?: string, history?: DialogueTurn[], missedPointIds?: string[]): Promise<string>;
}
interface LineTask { abort: AbortController; promise: Promise<string | undefined>; event: FollowupCandidate; kind: DoctorLineKind; started?: boolean }

/** A connection owns one-use line tasks, separate from unspoken follow-up candidates and actual dialogue. */
export class DoctorLinePrefetch implements DoctorLines {
  private readonly tasks = new Map<string, LineTask>();
  private readonly active = new Set<LineTask>();
  private stopped = false;
  private sessionId: string;
  constructor(private readonly pack: ScenarioPack, private readonly system2: () => Promise<SystemTwo>, private readonly emit: (event: ServerMessage) => void, connectionId: string) { this.sessionId = connectionId; }
  setSession(sessionId: string): void { this.sessionId = sessionId; }
  private key(kind: DoctorLineKind, concernId?: string): string { return `${kind}:${concernId ?? ''}`; }
  private examples(kind: DoctorLineKind, concernId?: string): string[] {
    return kind === 'retry' ? this.pack.lineExamples.retry[concernId ?? ''] ?? this.pack.lineExamples.opening : this.pack.lineExamples[kind];
  }
  private fallback(kind: DoctorLineKind, concernId?: string): string {
    const examples = this.examples(kind, concernId);
    return examples[randomInt(examples.length)] ?? this.pack.lineExamples.opening[0];
  }
  prefetch(kind: DoctorLineKind, concernId?: string, history: DialogueTurn[] = [], missedPointIds?: string[]): void {
    if (this.stopped || this.tasks.has(this.key(kind, concernId))) return;
    const task: LineTask = {
      abort: new AbortController(), kind,
      event: { id: randomUUID(), targetConcernId: concernId ?? this.pack.scenario.concerns[0].id, phase: 'retrieving', draftText: '', basis: kind, triggerCondition: `doctor-line:${kind}`, preparedFromMs: Date.now() },
      promise: Promise.resolve(undefined),
    };
    this.tasks.set(this.key(kind, concernId), task);
    this.active.add(task);
    task.promise = this.prepare(task, concernId, history, missedPointIds).finally(() => this.active.delete(task));
  }
  private update(task: LineTask): void {
    if (!this.stopped) this.emit({ type: 'system2.candidate', payload: { sessionId: this.sessionId, task: task.kind, candidate: { ...task.event } } });
  }
  private async prepare(task: LineTask, concernId: string | undefined, history: DialogueTurn[], missedPointIds?: string[]): Promise<string | undefined> {
    try {
      const engine = await this.system2();
      if (!engine.prepareDoctorLine || task.abort.signal.aborted) return undefined;
      task.started = true;
      this.update(task);
      const text = await engine.prepareDoctorLine({ sessionId: this.sessionId, pack: this.pack, kind: task.kind, concernId, history: history.map(turn => ({ ...turn })), missedPointIds, signal: task.abort.signal }, (phase, partialText) => {
        if (task.abort.signal.aborted || this.stopped) return;
        task.event.phase = phase;
        if (partialText) task.event.draftText = partialText;
        this.update(task);
      });
      if (task.abort.signal.aborted || this.stopped || !text.trim()) return undefined;
      task.event.phase = 'ready'; task.event.draftText = text.trim(); task.event.readyAtMs = Date.now();
      this.update(task);
      return text.trim();
    } catch { return undefined; }
  }
  async take(kind: DoctorLineKind, concernId?: string, history: DialogueTurn[] = [], missedPointIds?: string[]): Promise<string> {
    this.prefetch(kind, concernId, history, missedPointIds);
    const key = this.key(kind, concernId);
    const task = this.tasks.get(key);
    this.tasks.delete(key); // A line is never reused by a later visitor or retry.
    if (!task) return this.fallback(kind, concernId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = kind === 'closing' ? 800 : 1200;
    const line = await Promise.race([task.promise, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), budget); })]);
    clearTimeout(timer);
    this.active.delete(task);
    if (line) {
      task.event.phase = 'spoken'; task.event.decidedAtMs = Date.now(); task.event.fate = 'asked'; this.update(task);
      return line;
    }
    task.abort.abort();
    task.event.phase = 'withdrawn'; task.event.decidedAtMs = Date.now(); task.event.fate = 'withdrawn'; if (task.started) this.update(task);
    return this.fallback(kind, concernId);
  }
  stop(): void { this.stopped = true; for (const task of this.active) task.abort.abort(); this.active.clear(); this.tasks.clear(); }
}
