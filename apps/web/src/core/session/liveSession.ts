import type { AsrTranscriptDelta, CandidateLifecyclePhase, ControllerDispatchEvent, FollowupCandidate, JevDecisionResponse, ServerMessage, System2Task, TrainingScenarioDef, VisitEndedPayload } from '@cuex/protocol';
import type { DriverStatus } from '../driver/IConversationDriver';

export interface LiveSession {
  status: DriverStatus;
  error?: string;
  sessionId?: string;
  startedAt?: number;
  scenario?: TrainingScenarioDef;
  transcripts: AsrTranscriptDelta[];
  candidates: FollowupCandidate[];
  /** The doctor line System 2 is writing now (opening, retry or closing). It is never a follow-up candidate. */
  /** The server's record of this visit, sent once after the closing line. */
  visitEnded?: VisitEndedPayload;
  /** Server time when the last concern was fully answered. The doctor's closing line starts after it. */
  completedAt?: number;
  /** Latest phase of each line job, so the stage can show the job for the current round. */
  lineJobs?: Partial<Record<Exclude<System2Task, 'followup'>, CandidateLifecyclePhase>>;
  lineJob?: { task: Exclude<System2Task, 'followup'>; phase: CandidateLifecyclePhase };
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
  /** A new visit on the same connection. Prepared doctor lines survive. */
  | { type: 'visit' }
  | { type: 'status'; status: DriverStatus }
  | { type: 'error'; message?: string }
  | { type: 'audio'; playing: boolean }
  | { type: 'event'; event: ServerMessage };

export function liveSessionReducer(state: LiveSession, action: LiveAction): LiveSession {
  if (action.type === 'reset') return { ...emptySession };
  if (action.type === 'visit') return { ...emptySession, status: state.status, lineJob: state.lineJob, lineJobs: state.lineJobs };
  if (action.type === 'status') return { ...state, status: action.status };
  if (action.type === 'error') return { ...state, error: action.message };
  if (action.type === 'audio') return { ...state, audioPlaying: action.playing };
  const event = action.event;
  switch (event.type) {
    case 'session.ready': return { ...emptySession, lineJob: state.lineJob, lineJobs: state.lineJobs, status: 'running', sessionId: event.payload.sessionId, scenario: event.payload.scenario, startedAt: Date.now() };
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
      const { candidate, task = 'followup' } = event.payload;
      if (task !== 'followup') return { ...state, lineJob: { task, phase: candidate.phase }, lineJobs: { ...state.lineJobs, [task]: candidate.phase } };
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
      const isLast = !state.scenario?.concerns.find(item => item.id === dispatch.concernProgress.concernId)?.nextConcernId;
      // A later ASR revision can reopen the last concern, so the marker follows the latest progress.
      const completedAt = !isLast ? state.completedAt : dispatch.concernProgress.isFullyResolved ? state.completedAt ?? dispatch.timestamp : undefined;
      return { ...state, dispatch, resolved, completedAt, nod: state.nod + (dispatch.nodAmp ? 1 : 0),
        speakingPose: dispatch.pose === 'asking' || dispatch.pose === 'speaking' ? dispatch.pose : state.speakingPose };
    }
    case 'visit.ended': return { ...state, visitEnded: event.payload };
    case 'session.error': return { ...state, error: event.payload.message };
    case 'tts.stream_chunk': return state;
    case 'tts.abort': return state;
  }
}
