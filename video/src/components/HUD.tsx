import React from 'react';
import {SCENES, H04} from '../content/timeline';
import {C, FONT, clamp01, timecode} from '../theme';

// Persistent top bar: wordmark on the left, mode and scene timecode on the right.
export const HUD: React.FC<{frame: number}> = ({frame}) => {
  const scene = SCENES.find((s) => frame >= s.from && frame < s.from + s.dur) ?? SCENES[SCENES.length - 1];
  const local = frame - scene.from;
  const visible = scene.id !== 'prologue' && scene.id !== 'outro';
  const fade = visible ? clamp01(local / 12) * clamp01((scene.dur - local) / 12) : 0;
  const mode =
    scene.id === 'arch' ? 'SYSTEM VIEW' : scene.id === 'h04' && local < H04.review.stageIn ? 'REVIEW' : 'LIVE';
  const live = mode === 'LIVE';
  const blink = live ? 0.55 + 0.45 * Math.sin(frame / 5) : 1;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 96, top: 40, fontFamily: FONT.display, fontSize: 38, color: C.paper}}>
        Cue<span style={{color: C.cue}}>X</span>
      </div>
      <div style={{position: 'absolute', left: 206, top: 52, width: 1, height: 26, background: C.faint}} />
      <div style={{position: 'absolute', right: 96, top: 56, display: 'flex', alignItems: 'center', gap: 22, fontFamily: FONT.mono, fontSize: 17, letterSpacing: '0.2em', color: C.dim}}>
        <span style={{display: 'flex', alignItems: 'center', gap: 10, color: live ? C.cue : C.soft}}>
          <span style={{width: 8, height: 8, borderRadius: 8, background: live ? C.cue : C.soft, opacity: blink}} />
          {mode}
        </span>
        <span style={{color: C.soft}}>{timecode(local)}</span>
      </div>
    </div>
  );
};
