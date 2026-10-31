import React, { Suspense, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { DoctorBust, type DoctorBustProps } from './DoctorBust';
import type { DoctorStateName } from '@/lib/types';

interface CameraRigProps {
  framing?: 'stage' | 'hero' | 'thumb';
  bust?: boolean;
  azimuth?: number;
  shiftX?: number;
  shiftY?: number;
}

const FRAMES = {
  stage: { fill: 0.64, targetY: 0.5 },
  hero: { fill: 0.98, targetY: 0.55 },
  thumb: { fill: 0.82, targetY: 0.52 },
};

const FRAMES_BUST = {
  stage: { fill: 0.7, targetY: 0.23 },
  hero: { fill: 0.87, targetY: 0.385 },
  thumb: { fill: 0.8, targetY: 0.335 },
};

const CameraRig: React.FC<CameraRigProps> = ({
  framing = 'stage',
  bust = false,
  azimuth = -0.42,
  shiftX = 0,
  shiftY = 0,
}) => {
  const { camera, size } = useThree();

  React.useEffect(() => {
    const frames = bust ? FRAMES_BUST : FRAMES;
    const frame = frames[framing] || frames.stage;
    const H = 2.4; // normalized head height
    const cam = camera as THREE.PerspectiveCamera;
    const d = H / frame.fill / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const ty = H * frame.targetY - H * 0.08;

    cam.position.set(Math.sin(azimuth) * d, ty + H * 0.04, Math.cos(azimuth) * d);
    cam.lookAt(0, ty, 0);

    if (shiftX || shiftY) {
      cam.setViewOffset(size.width, size.height, -shiftX * size.width, -shiftY * size.height, size.width, size.height);
    } else {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }, [camera, framing, bust, azimuth, shiftX, shiftY, size]);

  return null;
};

export interface DoctorCanvasProps extends DoctorBustProps {
  framing?: 'stage' | 'hero' | 'thumb';
  azimuth?: number;
  shiftX?: number;
  shiftY?: number;
  className?: string;
  fallbackText?: string;
}

export const DoctorCanvas: React.FC<DoctorCanvasProps> = ({
  state = 'listening',
  readiness = 0,
  bust = false,
  framing = 'stage',
  azimuth = -0.42,
  shiftX = 0,
  shiftY = 0,
  heldGain = 1,
  heldLight = true,
  nodTrigger = 0,
  lookAt = { x: 0, y: 0 },
  className = '',
  fallbackText,
}) => {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return (
      <div className={`relative flex flex-col items-center justify-center p-6 text-center ${className}`}>
        <svg viewBox="0 0 200 240" width="160" height="192" aria-hidden="true" className="mx-auto opacity-75">
          <ellipse cx="100" cy="82" rx="46" ry="60" fill="#d9d6ce" />
          <path d="M74 128h52l4 30c34 8 56 30 62 82H8c6-52 28-74 62-82z" fill="#d9d6ce" />
          {state === 'holding' && (
            <path d="M146 40c12 18 14 52 2 84" fill="none" stroke="#d2461e" strokeWidth="3" />
          )}
        </svg>
        <p className="mt-4 text-xs text-ink-2 max-w-[260px]">
          {fallbackText || '三维医生降级显示。想插话时，状态词下将出现朱砂侧线。'}
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <Canvas
        camera={{ fov: 24, near: 0.01, far: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.85,
        }}
        dpr={[1, 1.75]}
        onError={() => setHasError(true)}
      >
        <Suspense fallback={null}>
          <Environment files="/env/lebombo_1k.hdr" environmentIntensity={0.32} />
          <directionalLight position={[-3.5, 2.7, 1.6]} intensity={1.5} color="#fff4e6" />
          <hemisphereLight args={['#f1f3ee', '#535c58', 0.3]} />

          <DoctorBust
            state={state}
            readiness={readiness}
            bust={bust}
            heldGain={heldGain}
            heldLight={heldLight}
            nodTrigger={nodTrigger}
            lookAt={lookAt}
          />

          <CameraRig
            framing={framing}
            bust={bust}
            azimuth={azimuth}
            shiftX={shiftX}
            shiftY={shiftY}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
