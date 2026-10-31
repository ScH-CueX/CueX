import type { CSSProperties, ReactNode } from 'react';
import type { ReviewMoment, VisitEndedPayload } from '@cuex/protocol';
import './panels.css';

export interface ReviewPanelProps {
  ended: VisitEndedPayload;
  previous?: VisitEndedPayload;
  onRetry(concernId: string): void;
  onNext(): void;
  /** The doctor's name for the labels. The visit payload does not carry it, so the stage can pass briefing.doctor.name. */
  doctorName?: string;
}

const DEFAULT_DOCTOR = '陈主任';
type Point = VisitEndedPayload['concerns'][number]['points'][number];
type Covered = { id: string; label: string; done: boolean };

const step = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---- The rep's words: the last ~45 characters, starting at a clause boundary ----

const MAX_TAIL = 45;
const MIN_TAIL = 8;
const isDigit = (c?: string) => c !== undefined && c >= '0' && c <= '9';

/** A clause ends here. An ASCII comma or period between digits ("6.2") is part of a number. */
function isBoundary(s: string, i: number): boolean {
  const c = s[i];
  if (c === undefined) return false;
  if ('，。；！？!?;'.includes(c)) return true;
  if (c === ',' || c === '.') return !(isDigit(s[i - 1]) && isDigit(s[i + 1]));
  return false;
}

interface WordSegmenter { segment(input: string): Iterable<{ index: number }> }

/** First word start at or after `from`. Without Intl.Segmenter the position stays as it is. */
function wordStart(s: string, from: number): number {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'word' }) => WordSegmenter }).Segmenter;
  if (!Seg) return from;
  for (const part of new Seg('zh', { granularity: 'word' }).segment(s)) if (part.index >= from) return part.index;
  return from;
}

/** Short enough to read at a glance, never cut mid-word: "…12 周时安舒平组比对照组多降 6.2 mmHg，不良反应和安慰剂相当。" */
function tail(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= MAX_TAIL) return s;
  const from = s.length - MAX_TAIL;
  let start = -1;
  if (isBoundary(s, from - 1)) start = from;
  else for (let i = from; i < s.length - 1; i++) if (isBoundary(s, i)) { start = i + 1; break; }
  if (start < 0 || s.length - start < MIN_TAIL) start = wordStart(s, from);
  return `…${s.slice(start).replace(/^[\s，。；！？!?;]+/, '')}`;
}

// ---- Line breaks between words, not inside them ("占多/少？" reads badly on a projector) ----

const segmenter = (() => {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'word' }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? new Seg('zh', { granularity: 'word' }) : null;
})();

/** Each word is kept whole. Without Intl.Segmenter the text is shown as it is. */
function Words({ text }: { text: string }) {
  if (!segmenter) return <>{text}</>;
  return (
    <>
      {Array.from(segmenter.segment(text), (s, i) => (/^\s+$/.test(s.segment) ? s.segment : <span key={i} className="cx-w">{s.segment}</span>))}
    </>
  );
}

// ---- Points ----

const pointsOf = (v?: VisitEndedPayload): Point[] => v?.concerns.flatMap((c) => c.points) ?? [];

const labelsOf = (ids: string[], v: VisitEndedPayload): string[] => {
  const all = pointsOf(v);
  return ids.flatMap((id) => all.find((p) => p.id === id)?.label ?? []);
};

/** The points that were open at the earlier moment, and whether this visit covered them. The state comes from this visit only. */
function coveredNow(ids: string[], ended: VisitEndedPayload): Covered[] {
  const now = pointsOf(ended);
  return ids.flatMap((id) => {
    // A point this visit does not list cannot be called covered or missed, so it is left out.
    const here = now.find((p) => p.id === id);
    return here ? [{ id, label: here.label, done: here.resolved }] : [];
  });
}

function Chips({ items }: { items: Covered[] }) {
  return (
    <ul className="cx-chips">
      {items.map((p) => (
        <li key={p.id} className="cx-chip" data-done={p.done}>
          <i className="cx-dot" aria-hidden="true" />
          {p.label}
          <span className="cx-sr">{p.done ? '这次讲到了' : '这次没有讲到'}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- Pieces ----

function Row({ label, i, children }: { label: string; i: number; children: ReactNode }) {
  return (
    <div className="cx-row cx-in" style={step(i)}>
      <span className="cx-label">{label}</span>
      {children}
    </div>
  );
}

/** Why the doctor asked: what the rep had not said yet, the reason, and the source. */
function Why({ m, unsaid, start }: { m: ReviewMoment; unsaid: string[]; start: number }) {
  return (
    <>
      {unsaid.length > 0 && (
        <Row label="当时还没讲到" i={start}><p className="cx-unsaid">{unsaid.join('、')}</p></Row>
      )}
      <Row label="为什么这样问" i={start + 1}><p className="cx-note">{m.basis}</p></Row>
      {m.sourceEvidence && <Row label="依据" i={start + 2}><p className="cx-note">{m.sourceEvidence}</p></Row>}
    </>
  );
}

/** What the rep did after the follow-up was ready. Only a response cue is a self-correction, so only it gets that wording. */
function repLineLabel(reason: ReviewMoment['withdrawalReason']): string {
  if (reason === 'response_cue') return '你改口说：';
  if (reason === 'target_answered') return '你答到了：';
  return '你接着说：';
}

function WithdrawnCard({ m, large }: { m: ReviewMoment; large?: boolean }) {
  return (
    <div className="cx-card cx-in" style={step(large ? 1 : 3)}>
      <div className="cx-card-head">
        <span className="cx-card-title">一句没说出口的追问</span>
        <span className="cx-tag">已撤销</span>
      </div>
      <p className={`cx-withdrawn${large ? ' cx-withdrawn--lg' : ''}`}><del className="cx-strike"><Words text={m.withdrawnText ?? ''} /></del></p>
      {m.repSaid && (
        <p className="cx-redo"><span className="cx-redo-label">{repLineLabel(m.withdrawalReason)}</span>“<Words text={tail(m.repSaid)} />”</p>
      )}
    </div>
  );
}

// ---- Screens ----

/** After the first visit: the one moment worth looking at. */
function FirstReview({ ended, onRetry, onNext, doctorName = DEFAULT_DOCTOR }: ReviewPanelProps) {
  const interrupted = ended.moments.find((m) => m.kind === 'interrupted');
  const withdrawn = ended.moments.find((m) => m.kind === 'withdrawn');
  const key = interrupted ?? withdrawn;
  const retryId = ended.suggestedRetryConcernId;
  const unsaid = key ? labelsOf(key.openPointIds, ended) : [];

  return (
    <section className="cx-panel" aria-label="拜访回看">
      <div className="cx-main">
        {key ? <p className="cx-time cx-in" style={step(0)}>{mmss(key.atMs)}</p> : null}

        {interrupted ? (
          <div className={withdrawn ? 'cx-cols' : undefined}>
            <div className="cx-rows">
              <Row label="你说" i={1}><p className="cx-quote">“<Words text={tail(interrupted.repSaid)} />”</p></Row>
              <Row label={doctorName} i={2}><p className="cx-doctor"><Words text={interrupted.doctorSaid ?? ''} /></p></Row>
              <Why m={interrupted} unsaid={unsaid} start={3} />
            </div>
            {withdrawn && <WithdrawnCard m={withdrawn} />}
          </div>
        ) : withdrawn ? (
          <div className="cx-rows">
            <WithdrawnCard m={withdrawn} large />
            <Why m={withdrawn} unsaid={unsaid} start={3} />
          </div>
        ) : (
          <>
            <h1 className="cx-title cx-in" style={step(0)}>{doctorName}这次没有打断你</h1>
            <div className="cx-stack cx-in" style={step(1)}>
              <span className="cx-label">{doctorName}一开始问</span>
              <p className="cx-open"><Words text={ended.doctorOpening} /></p>
            </div>
          </>
        )}
      </div>

      <div className="cx-foot cx-in" style={step(6)}>
        <div className="cx-actions">
          {retryId && <button type="button" className="cx-btn cx-btn--primary" onClick={() => onRetry(retryId)}>从这里再试一次</button>}
          <button type="button" className={`cx-btn ${retryId ? 'cx-btn--ghost' : 'cx-btn--primary'}`} onClick={() => onNext()}>下一位</button>
        </div>
      </div>
    </section>
  );
}

/**
 * After a retry. A visit ends only when every point is resolved, so the end state says nothing about the retry.
 * What changed is compared against the earlier key moment: did the doctor interrupt again, and were the points covered?
 */
function RetryReview({ ended, previous, onNext, doctorName = DEFAULT_DOCTOR }: ReviewPanelProps) {
  const before = previous?.moments.find((m) => m.kind === 'interrupted') ?? previous?.moments.find((m) => m.kind === 'withdrawn');
  const again = ended.moments.find((m) => m.kind === 'interrupted');
  // Only after an interruption does "they are covered now" mean something. After a withdrawn follow-up the rep had already answered.
  const covered = before?.kind === 'interrupted' && !again ? coveredNow(before.openPointIds, ended) : [];

  return (
    <section className="cx-panel" aria-labelledby="cx-review-title">
      <div className="cx-main">
        <h1 id="cx-review-title" className="cx-title cx-in" style={step(0)}>再试一次</h1>

        <div className="cx-stack cx-in" style={step(1)}>
          <span className="cx-label">{doctorName}换了个问法</span>
          <p className="cx-open"><Words text={ended.doctorOpening} /></p>
        </div>

        <div className="cx-rows">
          {before && (
            <div className="cx-row cx-row--wide cx-in" style={step(2)}>
              <span className="cx-label">上一次 · {mmss(before.atMs)}</span>
              <div className="cx-stack">
                {before.kind === 'interrupted' ? (
                  <>
                    <p className="cx-quote">{doctorName}打断了你</p>
                    {before.doctorSaid && <p className="cx-prev-said"><Words text={before.doctorSaid} /></p>}
                  </>
                ) : (
                  <>
                    <p className="cx-quote">{doctorName}备了一句追问，你先答到了</p>
                    {before.withdrawnText && <p className="cx-prev-said"><del className="cx-strike"><Words text={before.withdrawnText} /></del></p>}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="cx-row cx-row--wide cx-in" style={step(3)}>
            <span className="cx-label">这一次</span>
            <div className="cx-stack">
              {again ? (
                <>
                  <p className="cx-quote">{doctorName}又追问了</p>
                  {again.doctorSaid && <p className="cx-doctor cx-doctor--sm"><Words text={again.doctorSaid} /></p>}
                </>
              ) : (
                <>
                  <p className="cx-quote">这次他没有打断你</p>
                  {covered.length > 0 && (
                    <>
                      <span className="cx-cap">那时还没讲到的</span>
                      <Chips items={covered} />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cx-foot cx-in" style={step(4)}>
        <div className="cx-actions">
          <button type="button" className="cx-btn cx-btn--primary" onClick={() => onNext()}>下一位</button>
        </div>
      </div>
    </section>
  );
}

export function ReviewPanel(props: ReviewPanelProps) {
  return props.ended.retry ? <RetryReview {...props} /> : <FirstReview {...props} />;
}
