/**
 * 前后端全双工 WebSocket 事件协议封装
 */

import type { AudioChunkPayload, AsrTranscriptDelta, TtsAudioStreamChunk, TtsAbortSignal, TtsPlaybackReport } from './audio';
import type { JevDecisionResponse } from './jev';
import type { FollowupCandidate, PiAgentCandidateUpdate, WithdrawalReason } from './piagent';
import type { ControllerDispatchEvent } from './controller';
import type { TrainingScenarioDef } from './scenario';

// 客户端上行消息
export type ClientMessage =
  | {
      type: 'session.start';
      payload: {
        scenarioId: string;
        mode: 'performance' | 'learning';
        /** 复盘后“从这里再试一次”：医生换一种问法，重新提出这项关切。 */
        retry?: { concernId: string };
      };
    }
  | { type: 'session.stop'; payload: { sessionId: string } }
  | { type: 'visit.end'; payload: { sessionId: string } }
  | { type: 'audio.chunk'; payload: AudioChunkPayload }
  | { type: 'speech.delta'; payload: { text: string; isFinal: boolean } }
  | { type: 'user.interrupted_doctor'; payload: { timestamp: number } }
  | { type: 'tts.playback'; payload: TtsPlaybackReport }
  | { type: 'ping'; payload: { t: number } };

// 服务端下行消息
export type ServerMessage =
  | { type: 'session.ready'; payload: { sessionId: string; serverTime: number; scenario: TrainingScenarioDef } }
  | { type: 'asr.transcript'; payload: AsrTranscriptDelta }
  | { type: 'system1.verdict'; payload: JevDecisionResponse }
  | { type: 'system2.candidate'; payload: PiAgentCandidateUpdate }
  | { type: 'visit.ended'; payload: VisitEndedPayload }
  | { type: 'system2.activity'; payload: SystemTwoActivity }
  | { type: 'conversation.progress'; payload: { sessionId: string; resolvedPointIds: string[] } }
  | { type: 'controller.dispatch'; payload: ControllerDispatchEvent }
  | { type: 'tts.stream_chunk'; payload: TtsAudioStreamChunk }
  | { type: 'tts.abort'; payload: TtsAbortSignal }
  | { type: 'session.error'; payload: { code: string; message: string } };

/** One moment of the visit worth reviewing, taken from what actually happened. */
export interface ReviewMoment {
  kind: 'interrupted' | 'withdrawn';
  concernId: string;
  /** Milliseconds from the start of the visit. */
  atMs: number;
  /** What the rep had just said, as heard. */
  repSaid: string;
  /** interrupted: what the doctor asked. */
  doctorSaid?: string;
  /** withdrawn: the follow-up System 2 had ready that the doctor never said. */
  withdrawnText?: string;
  /** withdrawn: why it was withdrawn. */
  withdrawalReason?: WithdrawalReason;
  /** Why System 2 prepared the follow-up. */
  basis: string;
  sourceEvidence?: string;
  /** Points of the concern still open at that moment. */
  openPointIds: string[];
}

/** Sent once, right after the doctor's closing line. Everything in it comes from this visit. */
export interface VisitEndedPayload {
  sessionId: string;
  /** Persuasion assessment from the heard dialogue and evidence, not the number of checked points. */
  outcome?: VisitOutcome;
  durationMs: number;
  /** True when this visit was a retry from the review. */
  retry: boolean;
  /** The line the doctor opened this visit with, as heard. For a retry, the rephrased question. */
  doctorOpening: string;
  concerns: Array<{ concernId: string; title: string; points: Array<{ id: string; label: string; resolved: boolean }> }>;
  moments: ReviewMoment[];
  /** The concern to retry: the first interrupted one, else the first withdrawn one. Absent when neither happened. */
  suggestedRetryConcernId?: string;
}


export interface SystemTwoActivity {
  sessionId: string;
  taskId: string;
  kind: 'reply' | 'silence_prompt' | 'assessment';
  phase: 'preparing' | 'ready' | 'speaking' | 'completed' | 'cancelled' | 'error';
  reason?: string;
  sourceEvidence?: string;
}

export interface VisitOutcome {
  /** Unavailable must never be presented as a negative or successful assessment. */
  assessment: 'completed' | 'unavailable';
  stance: 'willing_to_continue' | 'needs_evidence' | 'not_convinced';
  /** The doctor's stance, in first-person spoken Chinese, supported by this visit. */
  doctorResponse: string;
  rationale: string;
  strengths: Array<{ quote: string; explanation: string }>;
  gaps: Array<{ pointId?: string; quote?: string; explanation: string }>;
  nextStep: string;
}
