/**
 * 前后端全双工 WebSocket 事件协议封装
 */

import type { AudioChunkPayload, AsrTranscriptDelta, TtsAudioStreamChunk, TtsAbortSignal, TtsPlaybackReport } from './audio';
import type { JevDecisionResponse } from './jev';
import type { FollowupCandidate, PiAgentCandidateUpdate } from './piagent';
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
  | { type: 'controller.dispatch'; payload: ControllerDispatchEvent }
  | { type: 'tts.stream_chunk'; payload: TtsAudioStreamChunk }
  | { type: 'tts.abort'; payload: TtsAbortSignal }
  | { type: 'session.error'; payload: { code: string; message: string } };
