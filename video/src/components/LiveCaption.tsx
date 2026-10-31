import React from 'react';
import {Cue, Mark} from '../content/timeline';
import {C, FONT, clamp01, mix, rgba} from '../theme';

type Props = {cue: Cue; frame: number; size: number; color: string; marks?: Mark[]; weight?: number};

const charIndex = (text: string, phrase: string) => Array.from(text.slice(0, Math.max(0, text.indexOf(phrase)))).length;

// Transcript that reveals characters in sync with the voice.
// Characters that were never spoken after an interruption stay as a faint ghost of the prepared script.
export const LiveCaption: React.FC<Props> = ({cue, frame, size, color, marks = [], weight = 500}) => {
  const local = frame - cue.from;
  const ranges = marks
    .filter((m) => m.cue === cue.id)
    .map((m) => ({start: charIndex(cue.text, m.phrase), end: charIndex(cue.text, m.phrase) + Array.from(m.phrase).length, mark: m}));
  const afterCut = cue.cut ? clamp01((local - cue.play) / 14) : 0;
  return (
    <div style={{fontFamily: FONT.sans, fontSize: size, lineHeight: 1.42, fontWeight: weight, color, letterSpacing: '0.01em'}}>
      {cue.chars.map((ch, i) => {
        const t0 = cue.charAt[i];
        const unspoken = cue.cut && t0 >= cue.play;
        const p = unspoken ? 0 : clamp01((local - t0) / 5);
        const range = ranges.find((r) => i >= r.start && i < r.end);
        let underline = 0;
        let tint = 0;
        if (range && p > 0) {
          const span = range.end - range.start;
          const hp = clamp01((frame - range.mark.from) / 14);
          underline = clamp01(hp * span - (i - range.start));
          tint = hp;
        }
        const markColor = range?.mark.color === 'ok' ? C.ok : C.cue;
        const opacity = unspoken ? afterCut * 0.16 : p;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity,
              transform: `translateY(${mix(6, 0, p)}px)`,
              filter: p < 1 && !unspoken ? `blur(${mix(5, 0, p)}px)` : undefined,
              color: tint > 0 ? markColor : undefined,
              backgroundImage: underline > 0 ? `linear-gradient(${rgba(markColor, 0.9)}, ${rgba(markColor, 0.9)})` : undefined,
              backgroundSize: `${underline * 100}% 0.07em`,
              backgroundPosition: '0 96%',
              backgroundRepeat: 'no-repeat',
              textDecoration: unspoken ? 'line-through' : undefined,
              textDecorationColor: rgba(C.paper, 0.5),
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};
