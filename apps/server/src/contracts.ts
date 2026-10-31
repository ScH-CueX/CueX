/**
 * Interfaces between the Controller and the replaceable engines.
 * System 1, System 2, ASR and TTS implementations live in their own folders and depend only on this file and @cuex/protocol.
 */
import type { TrainingScenarioDef } from '@cuex/protocol';

// ---------- Scenario pack ----------

export interface PackFact {
  id: string;
  text: string;
  source: string;
}

export interface ScenarioPack {
  scenario: TrainingScenarioDef;
  /** Facts from the (fictional) clinical material. System 2 retrieves from these; nothing else is evidence. */
  facts: PackFact[];
  /** Few-shot examples for the doctor lines System 2 writes live. */
  lineExamples: DoctorLineExamples;
  /** Observed misrecognitions of this pack's terms by the deployed ASR. Applied to rep transcripts before System 1 and display. */
  asrCorrections?: AsrCorrection[];
}

export interface AsrCorrection {
  /** Regular expression source, applied with the g flag to recognized rep text. */
  pattern: string;
  replacement: string;
}

/**
 * Examples set the style of the doctor's lines; System 2 writes a new line every visit, so repeat visitors never hear a script.
 * The doctor speaks an example verbatim only when the live line misses its time budget.
 */
export interface DoctorLineExamples {
  /** The doctor opening the visit and raising the first concern. */
  opening: string[];
  /** Per concern id: the doctor raising that concern again in other words, for 从这里再试一次. */
  retry: Record<string, string[]>;
  /** The doctor ending the visit once every concern is resolved. */
  closing: string[];
}

// ---------- System 1: Jev-style typed decisions ----------

export type JevQuestion =
  | { kind: 'noul'; question: string } // probability that the statement is true
  | { kind: 'choice'; question: string; options: string[] } // one of N options
  | { kind: 'score'; question: string }; // ordinal rating 0–5

export interface JevAnswer {
  kind: JevQuestion['kind'];
  /** noul: keys "false" and "true"; choice: one key per option; score: keys "0".."5". Values sum to 1. */
  probabilities: Record<string, number>;
  /** noul: p(true); choice: probability of the top option; score: expected rating. */
  value: number;
  /** Key with the highest probability. */
  top: string;
}

export interface SystemOneResult {
  answers: Record<string, JevAnswer>;
  latencyMs: number;
  /** Which engine answered, for example "jev-9b@win-vulkan" or "heuristic". */
  backend: string;
}

export interface SystemOneClient {
  readonly backend: string;
  /** Every question is evaluated independently against the same state. Rejects with an AbortError when the signal fires. */
  decide(state: string, questions: Record<string, JevQuestion>, signal?: AbortSignal): Promise<SystemOneResult>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

/** State the Controller passes to SystemOneClient.decide(), serialized with encodeSystemOneState(). */
export interface SystemOneState {
  concernId: string;
  /** Concern title, for example "适用范围". */
  concern: string;
  unresolvedPointIds: string[];
  /** Everything the rep has said since the concern was raised, including the current partial sentence. */
  repSpeechSinceConcern: string;
  /** The latest stretch of rep speech (about the last 80 characters), which the drift and responding questions judge. */
  recentSpeech?: string;
  /** Present only when a candidate follow-up is being re-checked before it is spoken. */
  candidate?: { targetPointIds: string[]; triggerCondition: string };
}

export const encodeSystemOneState = (state: SystemOneState): string => JSON.stringify(state);

/** Question ids with a fixed meaning. The heuristic fallback depends on them, so use these ids in decide(). */
export const S1_QUESTION_IDS = {
  /** noul: is the rep's latest speech responding to the doctor's concern? */
  responding: 'responding',
  /** noul: is the rep continuing on content unrelated to the concern? */
  drift: 'drift',
  /** noul: does the candidate's trigger condition still hold? */
  candidateValid: 'candidateValid',
  /** noul: has this concern point been substantively answered? */
  resolved: (pointId: string) => `resolved_${pointId}`,
} as const;

// ---------- System 2: follow-up preparation ----------

export interface DialogueTurn {
  who: 'doctor' | 'rep';
  text: string;
}

export interface FollowupRequest {
  sessionId: string;
  pack: ScenarioPack;
  concernId: string;
  unresolvedPointIds: string[];
  /** Only what was actually said. Candidates that were never spoken are not part of it. */
  history: DialogueTurn[];
  /** What the rep has said since the concern was raised, including the current partial sentence. */
  repSpeechSinceConcern: string;
  /** Why System 1 asked for a candidate, for example "转向主要终点，高龄与肾功能都还没有提到". */
  reason: string;
  signal: AbortSignal;
}

export interface FollowupDraft {
  /** What the doctor would say. Spoken Chinese, at most about 40 characters. */
  text: string;
  /** Why this follow-up is needed now. */
  basis: string;
  /** Condition under which it should still be said. */
  triggerCondition: string;
  /** Concern points the follow-up presses on. The Controller withdraws it once all of them are answered. */
  targetPointIds: string[];
  sourceEvidence?: string;
}

export type FollowupPhase = 'retrieving' | 'drafting';

export type DoctorLineKind = 'opening' | 'retry' | 'closing';

export interface DoctorLineRequest {
  sessionId: string;
  pack: ScenarioPack;
  kind: DoctorLineKind;
  /** The concern the line raises: the first concern for opening, the retried concern for retry. */
  concernId?: string;
  /** Dialogue as heard. For retry, the previous attempt, so the doctor presses on what was missed. */
  history: DialogueTurn[];
  /** Retry only: points of this concern the rep left unanswered last time. */
  missedPointIds?: string[];
  signal: AbortSignal;
}

export interface SystemTwo {
  readonly backend: string;
  prepareFollowup(req: FollowupRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<FollowupDraft>;
  /**
   * Writes one spoken doctor line live, guided by pack.lineExamples. It runs on its own agent, in parallel with follow-up
   * drafting; the Controller prefetches lines so they are ready the moment they are needed.
   */
  prepareDoctorLine?(req: DoctorLineRequest, onPhase?: (phase: FollowupPhase, partialText?: string) => void): Promise<string>;
}

// ---------- Voice ----------

export interface AsrCallbacks {
  /** Full text of the current sentence so far. */
  onPartial(text: string): void;
  /** The current sentence is complete. */
  onFinal(text: string): void;
  onError(err: Error): void;
}

export interface AsrStream {
  /** 16-bit little-endian mono PCM at the sample rate given to open(). */
  write(pcm16le: Buffer): void;
  end(): void;
}

export interface AsrEngine {
  readonly backend: string;
  open(opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream>;
}

export interface TtsChunk {
  /** A complete, independently decodable audio file (the browser calls decodeAudioData on each chunk). */
  audio: Buffer;
  mimeType: string;
}

export interface TtsEngine {
  readonly backend: string;
  /** Stops producing chunks and releases resources when the signal fires. */
  synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk>;
}
