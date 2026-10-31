import type {
  DoctorPoseName,
  JevDecisionResponse,
  FollowupCandidate,
  AsrTranscriptDelta,
  ControllerDispatchEvent,
} from '@cuex/protocol';

export type DriverStatus = 'idle' | 'connecting' | 'running' | 'paused' | 'error';

export interface DriverCallbacks {
  onStatusChange?: (status: DriverStatus) => void;
  onDoctorDispatch?: (dispatch: ControllerDispatchEvent) => void;
  onTranscript?: (delta: AsrTranscriptDelta) => void;
  onSystem1Verdict?: (verdict: JevDecisionResponse) => void;
  onSystem2Candidate?: (candidate: FollowupCandidate) => void;
  onError?: (err: Error) => void;
}

export interface IConversationDriver {
  readonly id: string;
  readonly status: DriverStatus;
  
  init(callbacks: DriverCallbacks): Promise<void>;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  seek?(timeSec: number): void;
  destroy(): void;
}
