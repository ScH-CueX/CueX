export type Speaker = 'doctor' | 'rep';

export type DoctorStateName = 'listening' | 'holding' | 'asking' | 'withdrawing' | 'speaking';

export interface Utterance {
  id: string;
  who: Speaker;
  start: number;
  end: number;
  text: string;
  cutAt?: number;
  fromCandidate?: string;
  selfCorrection?: boolean;
}

export interface ConcernPoint {
  id: string;
  label: string;
  answeredAt: number;
  by: string;
}

export interface Concern {
  title: string;
  askedIn: string;
  points: ConcernPoint[];
  next: {
    at: number;
    title: string;
    by: string;
  };
}

export type Verdict = 'on' | 'drift';
export type JudgmentAction = 'listen' | 'ask' | 'withdraw' | 'move-on';

export interface Judgment {
  id: string;
  t: number;
  on: string;
  verdict: Verdict;
  action: JudgmentAction;
  read: string;
  prepare?: string;
  candidate?: string;
  decidedAt?: number;
  resolves?: string[];
}

export type CandidateFate = 'asked' | 'withdrawn';

export interface Candidate {
  id: string;
  preparedFrom: number;
  readyAt: number;
  decidedAt: number;
  fate: CandidateFate;
  basis: string;
  text: string;
  why: string;
  saidAs?: string;
  correctionAt?: number;
}

export interface DoctorStatePeriod {
  from: number;
  to: number;
  state: DoctorStateName;
  candidate?: string;
}

export interface StateWord {
  word: string;
  plain: string;
}

export interface Moment {
  id: string;
  kind: 'listen' | 'ask' | 'withdraw';
  at: number;
  to: number;
  title: string;
  lead: string;
  candidate?: string;
}

export interface Meta {
  product: string;
  pack: string;
  study: string;
  doctor: {
    name: string;
    role: string;
    note: string;
  };
  scene: string;
  duration: number;
}
