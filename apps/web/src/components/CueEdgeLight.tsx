import React from 'react';

export type EdgeCuePhase = 'quiet' | 'drift' | 'focus' | 'resolved';

const descriptions: Record<EdgeCuePhase, string> = {
  quiet: '',
  drift: '轻提示：留意医生当前的关切。',
  focus: '轻提示：先回应医生尚未得到解答的问题。',
  resolved: '轻提示：已回应关切。',
};

/** Peripheral feedback only: the conversation stays clear and interactive. */
export function CueEdgeLight({phase, paused=false}: {phase: EdgeCuePhase; paused?: boolean}) {
  return <>
    <div className="cue-edge-light" data-phase={phase} data-paused={paused || undefined} aria-hidden="true">
      <div className="cue-edge-light__halo" />
      <div className="cue-edge-light__rim" />
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{descriptions[phase]}</span>
  </>;
}
