import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {C, H, W, rgba} from '../theme';

// Ink background with two slow light fields, a dot grid and a vignette.
export const Backdrop: React.FC<{intensity?: number; frame?: number}> = ({intensity = 1, frame: frameOverride}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const t = frame / 30;
  const ax = 30 + noise2D('ax', t * 0.03, 0) * 14;
  const ay = 30 + noise2D('ay', 0, t * 0.03) * 12;
  const bx = 72 + noise2D('bx', t * 0.025, 4) * 14;
  const by = 74 + noise2D('by', 4, t * 0.025) * 10;
  return (
    <AbsoluteFill style={{backgroundColor: C.ink}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${ax}% ${ay}%, ${rgba(C.cue, 0.075 * intensity)}, transparent 70%),
            radial-gradient(55% 60% at ${bx}% ${by}%, ${rgba(C.deep, 0.09 * intensity)}, transparent 70%),
            radial-gradient(80% 80% at 50% 50%, ${rgba('#1A1D26', 0.6)}, transparent 80%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${rgba(C.paper, 0.07)} 1px, transparent 1.4px)`,
          backgroundSize: '48px 48px',
          backgroundPosition: '24px 24px',
          maskImage: 'radial-gradient(70% 70% at 50% 50%, black, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(70% 70% at 50% 50%, black, transparent 85%)',
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)'}} />
    </AbsoluteFill>
  );
};

// Animated film grain. The seed changes every frame so the texture never freezes.
export const Grain: React.FC<{opacity?: number; frame?: number}> = ({opacity = 0.13, frame: frameOverride}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const seed = Math.floor(random(`grain-${frame}`) * 1000);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen', opacity}}>
      <svg width={W} height={H}>
        <filter id={`grain-${frame}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter={`url(#grain-${frame})`} />
      </svg>
    </AbsoluteFill>
  );
};
