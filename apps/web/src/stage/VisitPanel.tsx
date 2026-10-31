import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AsrTranscriptDelta, CandidateLifecyclePhase, FollowupCandidate, System2Task } from '@cuex/protocol';
import type { LiveSession } from '../core/session/liveSession';
import { actionLabels } from '../core/session/trainingFrame';
import './visit.css';

export interface VisitPanelProps {
  session: LiveSession;
  underlying: boolean;
  onToggleUnderlying(): void;
  /** The mic and typed-input row. The stage wires it; the panel only places it. */
  controls: ReactNode;
}

const phaseText: Record<CandidateLifecyclePhase, string> = {
  idle: '', retrieving: '检索中', drafting: '拟写中', ready: '已就绪 · 未说出', spoken: '已问出', withdrawn: '已撤销',
};
const phaseTone: Record<CandidateLifecyclePhase, 'cue' | 'deep' | 'ok'> = {
  idle: 'deep', retrieving: 'deep', drafting: 'deep', ready: 'cue', spoken: 'cue', withdrawn: 'ok',
};
const lineJobText: Record<Exclude<System2Task, 'followup'>, string> = {
  opening: '正在组织开场', retry: '正在换一种问法', closing: '正在准备结束语',
};

/** How long the amber accent stays on an interrupting line. */
const ACCENT_MS = 3200;
const MAX_CANDIDATES = 3;

/** The last `size` characters, with an ellipsis when cut. Keeps a long monologue at a fixed height. */
function tail(text: string, size: number): string {
  const chars = Array.from(text.trim());
  return chars.length > size ? `……${chars.slice(-size).join('')}` : chars.join('');
}

/** A doctor line interrupts when it follows a rep line and carries the follow-up the doctor chose to say. Stopped lines are a prefix of the draft. */
function isInterruption(session: LiveSession, index: number): boolean {
  const line: AsrTranscriptDelta | undefined = session.transcripts[index];
  if (!line || index === 0 || session.transcripts[index - 1].speaker !== 'rep') return false;
  const said = line.text.trim();
  if (!said) return false;
  if (session.candidates.some(item => item.phase === 'spoken' && item.draftText.startsWith(said))) return true;
  const action = session.dispatch?.action;
  return action?.type === 'interrupt_speak' && !!action.textToSpeak?.startsWith(said);
}

export function VisitPanel({ session, underlying, onToggleUnderlying, controls }: VisitPanelProps) {
  // U toggles the panel, except while typing.
  const toggleRef = useRef(onToggleUnderlying);
  toggleRef.current = onToggleUnderlying;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'u' && event.key !== 'U') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { transcripts } = session;
  let doctorIndex = -1;
  let previousDoctorIndex = -1;
  for (let index = transcripts.length - 1; index >= 0; index--) {
    if (transcripts[index].speaker !== 'doctor') continue;
    if (doctorIndex < 0) doctorIndex = index;
    else { previousDoctorIndex = index; break; }
  }
  const doctorLine = doctorIndex >= 0 ? transcripts[doctorIndex] : undefined;
  const interrupted = doctorLine !== undefined && isInterruption(session, doctorIndex);

  // The accent is on from the first render of an interrupting line and expires after a few seconds.
  const interruptedId = interrupted ? doctorLine.transcriptId : null;
  const [expiredId, setExpiredId] = useState<string | null>(null);
  useEffect(() => {
    if (!interruptedId) return;
    const timer = window.setTimeout(() => setExpiredId(interruptedId), ACCENT_MS);
    return () => window.clearTimeout(timer);
  }, [interruptedId]);
  const flash = interruptedId !== null && expiredId !== interruptedId;

  // After an interruption the rep's words stay on screen: the rep is still talking. At a normal turn change they belong to the last turn.
  const since = interrupted ? previousDoctorIndex : doctorIndex;
  const repLines = transcripts.filter((item, index) => item.speaker === 'rep' && index > since);
  const lastRep = repLines[repLines.length - 1];
  const partial = lastRep && !lastRep.isFinal ? lastRep : undefined;
  const finals = repLines.filter(item => item.isFinal).slice(-2);

  const doctor = session.scenario?.doctor;
  const concern = session.scenario?.concerns.find(item => item.id === session.dispatch?.concernProgress.concernId) ?? session.scenario?.concerns[0];

  // System 1: the latest verdict, with the two actions before it.
  const latest = session.judgments[session.judgments.length - 1];
  const latestLabel = latest ? actionLabels[latest.action] : undefined;
  const labels: string[] = [];
  for (const judgment of session.judgments) {
    const label = actionLabels[judgment.action];
    if (label && labels[labels.length - 1] !== label) labels.push(label);
  }
  const trail = labels.slice(-3, -1);

  // System 2: newest candidate first. A line job shows only while it is being written.
  const candidates = session.candidates.filter(item => item.phase !== 'idle').slice(-MAX_CANDIDATES).reverse();
  const lineJob = session.lineJob && (session.lineJob.phase === 'retrieving' || session.lineJob.phase === 'drafting') ? lineJobText[session.lineJob.task] : undefined;

  const lineLength = doctorLine ? Array.from(doctorLine.text).length : 0;

  return (
    <section className="visit" aria-label="拜访">
      <header className="visit-top">
        <p className="visit-doctor">
          {doctor && <><b>{doctor.name}</b> · {doctor.department} · {doctor.title}</>}
        </p>
        <button type="button" className="visit-toggle" aria-pressed={underlying} aria-keyshortcuts="U" onClick={onToggleUnderlying}>
          Underlying <kbd aria-hidden="true">U</kbd>
        </button>
      </header>

      <div className="visit-body" data-underlying={underlying}>
        <div className="visit-main">
          <div className="visit-center">
            <div className="visit-col">
              <div className="visit-doctor-block">
                {doctorLine && (
                  <p key={doctorLine.transcriptId} className="visit-line visit-fade" data-flash={flash} data-size={lineLength <= 36 ? 'l' : lineLength <= 64 ? 'm' : 's'}>
                    {doctorLine.text}
                  </p>
                )}
                <p className="visit-sr" aria-live="polite">{doctorLine?.isFinal ? doctorLine.text : ''}</p>
              </div>
              <div className="visit-rep">
                {finals.map(item => <p key={item.transcriptId} className="visit-rep-final visit-fade">{tail(item.text, 40)}</p>)}
                {partial && <p key={partial.transcriptId} className="visit-rep-partial">{tail(partial.text, 84)}</p>}
              </div>
            </div>
          </div>

          <div className="visit-bottom">
            <div className="visit-col">
              {concern && (
                <ul className="visit-points" aria-label={`关切：${concern.title}`}>
                  {concern.points.map(point => {
                    const resolved = !!session.resolved[point.id];
                    return (
                      <li key={point.id} className="visit-point" data-resolved={resolved}>
                        {point.label}{resolved && <span className="visit-sr">，已回应</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="visit-controls">{controls}</div>
            </div>
          </div>
        </div>

        {underlying && (
          <aside className="visit-under" aria-label="Underlying">
            <section className="visit-tone-cue" aria-labelledby="visit-s1">
              <h2 id="visit-s1" className="visit-sys-title">System 1 · 快速判定</h2>
              <p className="visit-trail">{trail.length > 0 ? `${trail.join(' → ')} →` : ''}</p>
              {latestLabel && <p key={latestLabel} className="visit-verdict visit-fade">{latestLabel}</p>}
            </section>

            <section className="visit-tone-deep" aria-labelledby="visit-s2">
              <h2 id="visit-s2" className="visit-sys-title">System 2 · 候选追问</h2>
              {lineJob && <p key={lineJob} className="visit-linejob visit-fade">{lineJob}</p>}
              <ol className="visit-cands">
                {candidates.map((candidate, rank) => <Candidate key={candidate.id} candidate={candidate} showSource={rank === 0} />)}
              </ol>
            </section>
          </aside>
        )}
      </div>
    </section>
  );
}

function Candidate({ candidate, showSource }: { candidate: FollowupCandidate; showSource: boolean }) {
  const text = candidate.draftText.trim();
  return (
    <li className={`visit-cand visit-tone-${phaseTone[candidate.phase]}`} data-phase={candidate.phase}>
      <p className="visit-phase">{phaseText[candidate.phase]}</p>
      {text && <p className="visit-draft">{candidate.phase === 'withdrawn' ? <del>{text}</del> : text}</p>}
      {candidate.basis && <p className="visit-basis">{candidate.basis}</p>}
      {showSource && candidate.sourceEvidence && <p className="visit-source">{candidate.sourceEvidence}</p>}
    </li>
  );
}
