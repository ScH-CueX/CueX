import React from 'react';
import {Audio, Sequence} from 'remotion';
import {asset, SfxId} from '../assets';
import {Cue} from '../content/timeline';

export type SfxCue = {id: SfxId; at: number; volume?: number};

// Voice lines and sound effects for one scene. Interrupted lines fade out over their last 5 frames.
export const SceneAudio: React.FC<{cues: Cue[]; sfx?: SfxCue[]}> = ({cues, sfx = []}) => (
  <>
    {cues
      .filter((c) => c.from >= 0)
      .map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={c.play} layout="none" name={`voice ${c.id}`}>
          <Audio src={asset.voice(c.id)} volume={(f) => (c.cut ? Math.min(1, Math.max(0, (c.play - f) / 5)) : 1)} />
        </Sequence>
      ))}
    {sfx.map((s, i) => (
      <Sequence key={`${s.id}-${i}`} from={Math.max(0, s.at)} layout="none" name={`sfx ${s.id}`}>
        <Audio src={asset.sfx(s.id)} volume={s.volume ?? 0.5} />
      </Sequence>
    ))}
  </>
);
