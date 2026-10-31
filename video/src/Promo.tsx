import React from 'react';
import {AbsoluteFill, Audio, Sequence, useCurrentFrame} from 'remotion';
import {asset} from './assets';
import {Backdrop, Grain} from './components/Backdrop';
import {Fade} from './components/Fade';
import {HUD} from './components/HUD';
import {SCENES, SceneId, VOICE_INTERVALS} from './content/timeline';
import {Architecture} from './scenes/Architecture';
import {H01Interrupt} from './scenes/H01Interrupt';
import {H02Withdraw} from './scenes/H02Withdraw';
import {H04Replay} from './scenes/H04Replay';
import {Outro} from './scenes/Outro';
import {Prologue} from './scenes/Prologue';
import {clamp01, mix} from './theme';

export const sceneElement = (id: SceneId, dur: number) => {
  switch (id) {
    case 'prologue':
      return <Prologue />;
    case 'h01':
      return <H01Interrupt />;
    case 'h02':
      return <H02Withdraw />;
    case 'arch':
      return <Architecture />;
    case 'h04':
      return <H04Replay />;
    case 'outro':
      return <Outro dur={dur} />;
  }
};

// Music sits lower while anyone is speaking.
const musicVolume = (f: number) => {
  let duck = 0;
  for (const [a, b] of VOICE_INTERVALS) duck = Math.max(duck, Math.min(clamp01((f - a + 8) / 8), clamp01((b + 8 - f) / 8)));
  const fadeIn = clamp01(f / 20);
  return mix(0.6, 0.26, duck) * fadeIn;
};

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop />
      {SCENES.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
          <Fade dur={s.dur}>{sceneElement(s.id, s.dur)}</Fade>
        </Sequence>
      ))}
      <HUD frame={frame} />
      <Grain />
      <Audio src={asset.music('bed')} volume={musicVolume} />
      {SCENES.slice(1).map((s) => (
        <Sequence key={`whoosh-${s.id}`} from={s.from - 12} layout="none" name={`whoosh ${s.id}`}>
          <Audio src={asset.sfx('whoosh')} volume={0.3} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Single scene on the shared backdrop, for previewing in the Studio.
export const ScenePreview: React.FC<{id: SceneId}> = ({id}) => {
  const scene = SCENES.find((s) => s.id === id)!;
  return (
    <AbsoluteFill>
      <Backdrop />
      {sceneElement(id, scene.dur)}
      <Grain />
    </AbsoluteFill>
  );
};
