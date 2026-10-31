import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

// Short opacity envelope at both ends of a scene so cuts land on the shared backdrop.
export const Fade: React.FC<{dur: number; inFrames?: number; outFrames?: number; children: React.ReactNode}> = ({
  dur,
  inFrames = 10,
  outFrames = 10,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, inFrames, dur - outFrames, dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};
