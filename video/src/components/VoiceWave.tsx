import React from 'react';
import {useAudioData, visualizeAudio} from '@remotion/media-utils';
import {asset} from '../assets';
import {Cue} from '../content/timeline';
import {FPS} from '../theme';

// Amplitude bars driven by the actual voice file of a cue.
export const VoiceWave: React.FC<{cue: Cue; frame: number; color: string; bars?: number; height?: number}> = ({
  cue,
  frame,
  color,
  bars = 18,
  height = 30,
}) => {
  const audioData = useAudioData(asset.voice(cue.id));
  const local = frame - cue.from;
  const active = local >= 0 && local < cue.play && audioData !== null;
  const values = active
    ? visualizeAudio({audioData: audioData!, frame: local, fps: FPS, numberOfSamples: 32, smoothing: true}).slice(1, bars + 1)
    : new Array(bars).fill(0);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 3, height}}>
      {values.map((v, i) => {
        const h = 3 + Math.min(1, Math.sqrt(v) * 2.2) * (height - 3);
        return <div key={i} style={{width: 3, height: h, borderRadius: 2, background: color, opacity: active ? 0.95 : 0.35}} />;
      })}
    </div>
  );
};
