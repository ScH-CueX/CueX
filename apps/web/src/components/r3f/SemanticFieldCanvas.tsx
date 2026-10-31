import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UTTERANCES, CONCERN, CANDIDATES } from '@/lib/scenario';

interface SemanticFieldProps {
  time?: number;
}

const SX = 0.12;
const T_MID = 34;
const xOf = (t: number) => (t - T_MID) * SX;

const REL = [
  [8.4, 0.45], [12, 0.72], [16, 0.7], [19.5, 0.24], [23.5, 0.14], [26.5, 0.05], [29.6, 0.02],
  [37.2, 0.5], [41, 0.9], [46.8, 0.95], [49.2, 0.42], [52.6, 0.3], [54.9, 0.82], [55.4, 0.92], [60.8, 0.95],
];

function rel(t: number): number {
  if (t <= REL[0][0]) return REL[0][1];
  for (let i = 1; i < REL.length; i++) {
    const [t1, v1] = REL[i];
    const [t0, v0] = REL[i - 1];
    if (t <= t1) {
      const p = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * p * p * (3 - 2 * p);
    }
  }
  return REL[REL.length - 1][1];
}

function linePos(t: number): [number, number, number] {
  const r = rel(t);
  return [xOf(t), 0.12 + r * 0.82, 0.4 - r * 1.38];
}

const SemanticFieldScene: React.FC<{ time: number }> = ({ time }) => {
  const playheadRef = useRef<THREE.Group>(null);

  // Generate ribbon points for rep passages
  const repPassages = useMemo(() => {
    const stretches: [number, number][] = [
      [8.4, 29.6],
      [37.2, 60.8],
    ];
    return stretches.map(([start, end]) => {
      const pts: THREE.Vector3[] = [];
      for (let t = start; t <= end; t += 0.4) {
        const [x, y, z] = linePos(t);
        pts.push(new THREE.Vector3(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, 64, 0.025, 8, false);
    });
  }, []);

  // Anchors for concern
  const anchors = useMemo(() => [
    { id: 'c1', pos: [xOf(46.8), 0.84, -1.02] as [number, number, number], label: '75 岁以上' },
    { id: 'c2', pos: [xOf(46.8), 1.0, -1.12] as [number, number, number], label: 'eGFR 30–60' },
    { id: 'c3', pos: [xOf(55.4), 1.16, -1.22] as [number, number, number], label: 'eGFR < 30' },
  ], []);

  useFrame(() => {
    if (playheadRef.current) {
      playheadRef.current.position.x = xOf(time);
    }
  });

  return (
    <group position={[0, -0.4, 0]}>
      {/* Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[10, 3.5]} />
        <meshStandardMaterial color="#d9dfe0" roughness={0.9} />
      </mesh>

      {/* Doctor spoken blocks on plane */}
      {UTTERANCES.filter(u => u.who === 'doctor').map(u => {
        const x1 = xOf(u.start);
        const x2 = xOf(u.end);
        const w = Math.max(0.04, x2 - x1);
        return (
          <mesh key={u.id} position={[(x1 + x2) / 2, 0.02, 0.86]}>
            <boxGeometry args={[w, 0.04, 0.16]} />
            <meshStandardMaterial color="#2f3a3c" roughness={0.8} />
          </mesh>
        );
      })}

      {/* Rep Ribbons */}
      {repPassages.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshStandardMaterial color="#2f3a3c" roughness={0.6} />
        </mesh>
      ))}

      {/* Concern Anchor spheres */}
      {anchors.map(a => (
        <group key={a.id} position={a.pos}>
          <mesh>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color="#2c6a59" roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Candidate Beads */}
      {CANDIDATES.map(k => {
        const isAsked = k.fate === 'asked';
        const isReady = time >= k.readyAt;
        const isDecided = time >= k.decidedAt;
        const y = isDecided && isAsked ? 0.05 : 1.6;
        const opacity = isDecided && !isAsked ? 0.2 : 1.0;

        return isReady ? (
          <mesh key={k.id} position={[xOf(k.readyAt), y, -0.3]}>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshStandardMaterial
              color="#d2461e"
              roughness={0.3}
              transparent
              opacity={opacity}
            />
          </mesh>
        ) : null;
      })}

      {/* Playhead marker */}
      <group ref={playheadRef}>
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.015, 1.8, 2.8]} />
          <meshBasicMaterial color="#d2461e" transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
};

export const SemanticFieldCanvas: React.FC<SemanticFieldProps> = ({ time = 0 }) => {
  return (
    <div className="relative w-full h-full min-h-[320px] bg-[#e8ecec] rounded-[2px] overflow-hidden">
      <Canvas
        camera={{ position: [0, 2.4, 4.2], fov: 32 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 2]} intensity={1.5} />
        <SemanticFieldScene time={time} />
      </Canvas>
      <div className="absolute top-3 left-3 text-xs text-ink-2 bg-surface/80 px-2 py-1 rounded-[2px] border border-line backdrop-blur-sm pointer-events-none">
        方向 B · 语义场 3D 视图（R3F 实现）
      </div>
    </div>
  );
};
