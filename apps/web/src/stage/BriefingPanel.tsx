import { useEffect, useRef, type CSSProperties } from 'react';
import type { BriefingResponse } from '@cuex/protocol';
import './panels.css';

export interface BriefingPanelProps {
  briefing?: BriefingResponse;
  loading: boolean;
  error?: string;
  onReload(): void;
  onStart(): void;
}

/** Position in the entry sequence. The CSS turns it into a delay. */
const step = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);

const Bar = ({ w, h }: { w: string; h: number }) => <div className="cx-bar" style={{ '--w': w, '--h': `${h}px` } as CSSProperties} />;

/** The screen before the visit: what the rep knows, and nothing about what the doctor will ask. */
export function BriefingPanel({ briefing, loading, error, onReload, onStart }: BriefingPanelProps) {
  const view = loading || (!briefing && !error) ? 'loading' : error ? 'error' : 'ready';

  // Enter starts the visit, unless a button has the focus (then Enter does what that button says).
  const startRef = useRef(onStart);
  startRef.current = onStart;
  useEffect(() => {
    if (view !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      startRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (view === 'loading') {
    return (
      <section className="cx-panel" aria-busy="true">
        <div className="cx-main">
          <p className="cx-kicker">拜访前准备</p>
          <div className="cx-skel" aria-hidden="true">
            <Bar w="58%" h={64} />
            <Bar w="34%" h={32} />
            <Bar w="86%" h={28} />
            <Bar w="78%" h={28} />
            <Bar w="82%" h={28} />
          </div>
          <p className="cx-sr" role="status">正在加载</p>
        </div>
      </section>
    );
  }

  if (view === 'error') {
    return (
      <section className="cx-panel">
        <div className="cx-main">
          <p className="cx-kicker">拜访前准备</p>
          <p className="cx-error" role="alert">{error}</p>
          <div>
            <button type="button" className="cx-btn cx-btn--primary" onClick={() => onReload()}>重新加载</button>
          </div>
        </div>
      </section>
    );
  }

  const b = briefing!;
  return (
    <section className="cx-panel" aria-labelledby="cx-briefing-title">
      <div className="cx-main">
        <p className="cx-kicker cx-in" style={step(0)}>拜访前准备</p>
        <h1 id="cx-briefing-title" className="cx-title cx-in" style={step(1)}>{b.productName} · {b.studyName}</h1>
        <p className="cx-visit cx-in" style={step(2)}>今天拜访 {b.doctor.name} · {b.doctor.department} · {b.doctor.title}</p>
        <ul className="cx-facts">
          {b.facts.map((fact, i) => (
            <li key={fact.id} className="cx-fact cx-in" style={step(3 + Math.min(i, 8))}>
              <p className="cx-fact-text">{fact.text}</p>
              <p className="cx-fact-src">{fact.source}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="cx-foot">
        <button type="button" className="cx-btn cx-btn--primary" onClick={() => onStart()}>开始拜访</button>
      </div>
    </section>
  );
}
