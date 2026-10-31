import type { AsrTranscriptDelta, ControllerDispatchEvent, FollowupCandidate, JevDecisionResponse, ServerMessage, TrainingScenarioDef } from '@cuex/protocol';
import type { DriverStatus } from '../driver/IConversationDriver';

export interface LiveSession {
  status: DriverStatus;
  error?: string;
  sessionId?: string;
  startedAt?: number;
  scenario?: TrainingScenarioDef;
  transcripts: AsrTranscriptDelta[];
  candidates: FollowupCandidate[];
  judgments: JevDecisionResponse[];
  dispatch?: ControllerDispatchEvent;
  resolved: Record<string, string>;
  audioPlaying: boolean;
  speakingPose: 'speaking' | 'asking';
  nod: number;
}
export const emptySession: LiveSession = {
  status: 'idle', transcripts: [], candidates: [], judgments: [], resolved: {}, audioPlaying: false, speakingPose: 'speaking', nod: 0,
};
export type LiveAction =
  | { type: 'reset' }
  | { type: 'status'; status: DriverStatus }
  | { type: 'error'; message?: string }
  | { type: 'audio'; playing: boolean }
  | { type: 'event'; event: ServerMessage };

export function liveSessionReducer(state: LiveSession, action: LiveAction): LiveSession {
  if (action.type === 'reset') return { ...emptySession };
  if (action.type === 'status') return { ...state, status: action.status };
  if (action.type === 'error') return { ...state, error: action.message };
  if (action.type === 'audio') return { ...state, audioPlaying: action.playing };
  const event = action.event;
  switch (event.type) {
    case 'session.ready': return { ...emptySession, status: 'running', sessionId: event.payload.sessionId, scenario: event.payload.scenario, startedAt: Date.now() };
    case 'asr.transcript': {
      const transcript = event.payload;
      const previous = state.transcripts.find(item => item.transcriptId === transcript.transcriptId);
      const resolved = { ...state.resolved };
      // ASR can retract a tentative answer by revising the same transcript.
      if (previous && !transcript.text.startsWith(previous.text)) {
        for (const [point, source] of Object.entries(resolved)) if (source === transcript.transcriptId) delete resolved[point];
      }
      const transcripts = state.transcripts.filter(item => item.transcriptId !== transcript.transcriptId);
      if (transcript.text) {
        const index = previous ? state.transcripts.indexOf(previous) : transcripts.length;
        transcripts.splice(index, 0, transcript);
      }
      return { ...state, transcripts, resolved };
    }
    case 'system1.verdict': {
      const resolved = { ...state.resolved };
      const rep = [...state.transcripts].reverse().find(item => item.speaker === 'rep');
      for (const point of event.payload.resolvedPointIds) resolved[point] = rep?.transcriptId ?? event.payload.requestId;
      return { ...state, resolved, judgments: [...state.judgments, event.payload].slice(-100) };
    }
    case 'system2.candidate': {
      const candidate = event.payload.candidate;
      const candidates = [...state.candidates];
      const index = candidates.findIndex(item => item.id === candidate.id);
      if (index < 0) candidates.push(candidate);
      else candidates[index] = candidate;
      return { ...state, candidates };
    }
    case 'controller.dispatch': {
      const dispatch = event.payload;
      const resolved = { ...state.resolved };
      const points = state.scenario?.concerns.find(item => item.id === dispatch.concernProgress.concernId)?.points ?? [];
      if (dispatch.concernProgress.isFullyResolved) for (const point of points) resolved[point.id] ??= 'controller';
      // A final ASR revision can retract all prior partial matches.
      if (dispatch.concernProgress.resolvedCount === 0) for (const point of points) delete resolved[point.id];
      return { ...state, dispatch, resolved, nod: state.nod + (dispatch.nodAmp ? 1 : 0),
        speakingPose: dispatch.pose === 'asking' || dispatch.pose === 'speaking' ? dispatch.pose : state.speakingPose };
    }
    case 'session.error': return { ...state, error: event.payload.message };
    case 'tts.stream_chunk': return state;
    case 'tts.abort': return state;
  }
}
