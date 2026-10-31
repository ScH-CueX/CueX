import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { DoctorStateName } from '@/lib/types';

interface PoseDef {
  lean: number;
  pitch: number;
  yaw: number;
  roll: number;
  chest?: number;
  m: Record<string, number>;
  talk?: number;
}

const POSES: Record<DoctorStateName, PoseDef> = {
  listening: {
    lean: 0.0,
    pitch: 0.035,
    yaw: 0.0,
    roll: 0.045,
    m: { browInnerUp: 0.06, mouthPress_L: 0.12, mouthPress_R: 0.12, mouthRollLower: 0.06 },
  },
  holding: {
    lean: 0.075,
    pitch: 0.09,
    yaw: 0.05,
    roll: 0.0,
    chest: 0.014,
    m: {
      browInnerUp: 0.42,
      browOuterUp_L: 0.18,
      browOuterUp_R: 0.18,
      eyeWide_L: 0.18,
      eyeWide_R: 0.18,
      jawOpen: 0.08,
      mouthShrugUpper: 0.12,
    },
  },
  asking: {
    lean: 0.065,
    pitch: 0.05,
    yaw: 0.0,
    roll: -0.02,
    m: { browDown_L: 0.22, browDown_R: 0.22, browInnerUp: 0.18, eyeSquint_L: 0.12, eyeSquint_R: 0.12 },
    talk: 1,
  },
  withdrawing: {
    lean: -0.02,
    pitch: -0.015,
    yaw: -0.02,
    roll: 0.035,
    chest: -0.008,
    m: {
      mouthSmile_L: 0.2,
      mouthSmile_R: 0.2,
      mouthPress_L: 0.14,
      mouthPress_R: 0.14,
      browInnerUp: 0.04,
      cheekSquint_L: 0.1,
      cheekSquint_R: 0.1,
      eyeSquint_L: 0.06,
      eyeSquint_R: 0.06,
    },
  },
  speaking: {
    lean: 0.02,
    pitch: 0.02,
    yaw: 0.0,
    roll: 0.0,
    m: { browInnerUp: 0.12 },
    talk: 1,
  },
};

function blendPose(a: PoseDef, b: PoseDef, k: number): PoseDef {
  const out: PoseDef = {
    lean: (a.lean || 0) + ((b.lean || 0) - (a.lean || 0)) * k,
    pitch: (a.pitch || 0) + ((b.pitch || 0) - (a.pitch || 0)) * k,
    yaw: (a.yaw || 0) + ((b.yaw || 0) - (a.yaw || 0)) * k,
    roll: (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * k,
    chest: (a.chest || 0) + ((b.chest || 0) - (a.chest || 0)) * k,
    m: {},
  };
  const allKeys = new Set([...Object.keys(a.m || {}), ...Object.keys(b.m || {})]);
  for (const name of allKeys) {
    const valA = a.m[name] || 0;
    const valB = b.m[name] || 0;
    out.m[name] = valA + (valB - valA) * k;
  }
  return out;
}

export interface DoctorBustProps {
  state?: DoctorStateName;
  readiness?: number;
  bust?: boolean;
  heldGain?: number;
  heldLight?: boolean;
  nodTrigger?: number;
  lookAt?: { x: number; y: number };
  onLoaded?: () => void;
}

export const DoctorBust: React.FC<DoctorBustProps> = ({
  state = 'listening',
  readiness = 0,
  bust = false,
  heldGain = 1,
  heldLight = true,
  nodTrigger = 0,
  lookAt = { x: 0, y: 0 },
  onLoaded,
}) => {
  const pivotRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const [modelGroup, setModelGroup] = useState<THREE.Group | null>(null);
  const [headHeight, setHeadHeight] = useState<number>(1);
  const morphMeshesRef = useRef<THREE.Mesh[]>([]);
  const morphDictRef = useRef<Record<string, number>>({});

  const curRef = useRef({ lean: 0, pitch: 0, yaw: 0, roll: 0, chest: 0, held: 0 });
  const curMRef = useRef<Record<string, number>>({});
  const nodAnimRef = useRef({ start: -1, amp: 0 });
  const blinkAnimRef = useRef({ next: 1.8, start: -1 });

  // Uniforms for cinnabar rim light on plaster material
  const heldUniforms = useMemo(() => ({
    uHeld: { value: 0 },
    uHeldColor: { value: new THREE.Color(0xd2461e) },
  }), []);

  // Watch nod trigger
  const prevNodRef = useRef(nodTrigger);
  useEffect(() => {
    if (nodTrigger !== prevNodRef.current) {
      nodAnimRef.current = { start: -2, amp: 0.1 };
      prevNodRef.current = nodTrigger;
    }
  }, [nodTrigger]);

  // Load GLTF Model
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      '/models/facecap-notex.glb',
      (gltf) => {
        if (cancelled) return;
        const loadedModel = gltf.scene;

        const plaster = new THREE.MeshStandardMaterial({
          color: 0xd9d6ce,
          roughness: 0.84,
          metalness: 0,
        });

        plaster.onBeforeCompile = (sh) => {
          sh.uniforms.uHeld = heldUniforms.uHeld;
          sh.uniforms.uHeldColor = heldUniforms.uHeldColor;
          sh.fragmentShader =
            'uniform float uHeld;\nuniform vec3 uHeldColor;\n' +
            sh.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              {
                vec3 vd = normalize(vViewPosition);
                float fr = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.2);
                float far = smoothstep(-0.15, 0.75, normal.x);
                totalEmissiveRadiance += uHeldColor * uHeld * fr * far;
              }`
            );
        };
        plaster.customProgramCacheKey = () => 'cuex-plaster-held';

        const eyeMat = new THREE.MeshStandardMaterial({
          color: 0xc4c0b7,
          roughness: 0.62,
          metalness: 0,
        });

        const morphMeshes: THREE.Mesh[] = [];
        let dict: Record<string, number> | null = null;

        loadedModel.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const isEye = /eye/i.test(mesh.name) || /eye/i.test(mesh.parent?.name || '');
            mesh.material = isEye ? eyeMat : plaster;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length) {
              morphMeshes.push(mesh);
              if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length) {
                dict = mesh.morphTargetDictionary;
              }
            }
          }
        });

        dict = dict || {};
        for (const m of morphMeshes) {
          if (!m.morphTargetDictionary || !Object.keys(m.morphTargetDictionary).length) {
            m.morphTargetDictionary = dict;
          }
        }

        morphMeshesRef.current = morphMeshes;
        morphDictRef.current = dict;

        // Neck pivot setup
        const box = new THREE.Box3().setFromObject(loadedModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const H = size.y;
        setHeadHeight(H);

        loadedModel.position.sub(new THREE.Vector3(center.x, box.min.y + H * 0.08, center.z));
        setModelGroup(loadedModel);
        onLoaded?.();
      },
      undefined,
      (err) => {
        console.warn('Failed to load doctor 3D model:', err);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [heldUniforms, onLoaded]);

  // Torso / Shoulders mesh generation
  const torsoMesh = useMemo(() => {
    if (!bust || headHeight <= 0) return null;
    const H = headHeight;
    const prof: [number, number][] = [
      [0.001, -2.9],
      [1.25, -2.9],
      [1.28, -2.1],
      [1.22, -1.45],
      [1.08, -1.0],
      [0.88, -0.7],
      [0.7, -0.45],
      [0.6, -0.22],
      [0.565, 0.05],
      [0.545, 0.4],
      [0.52, 1.0],
      [0.001, 1.0],
    ];
    const points = prof.map(([r, y]) => new THREE.Vector2((r * H) / 3.33, (y * H) / 3.33));
    const smooth = new THREE.SplineCurve(points.slice(1, -1)).getPoints(64);
    const geo = new THREE.LatheGeometry([points[0], ...smooth, points[points.length - 1]], 96);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const sm = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const y = (v.y * 3.33) / H;
      const k = sm(-0.1, -1.1, y);
      v.x *= 1 + 0.62 * k;
      v.z *= 1 - 0.24 * k;
      v.z += ((0.12 * sm(-1.6, 0.6, y) - 0.36) * H) / 3.33;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();

    const plaster = new THREE.MeshStandardMaterial({
      color: 0xd9d6ce,
      roughness: 0.84,
      metalness: 0,
    });
    plaster.onBeforeCompile = (sh) => {
      sh.uniforms.uHeld = heldUniforms.uHeld;
      sh.uniforms.uHeldColor = heldUniforms.uHeldColor;
      sh.fragmentShader =
        'uniform float uHeld;\nuniform vec3 uHeldColor;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 vd = normalize(vViewPosition);
            float fr = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.2);
            float far = smoothstep(-0.15, 0.75, normal.x);
            totalEmissiveRadiance += uHeldColor * uHeld * fr * far;
          }`
        );
    };
    return new THREE.Mesh(geo, plaster);
  }, [bust, headHeight, heldUniforms]);

  // Main animation frame loop
  useFrame(({ clock }, delta) => {
    if (!pivotRef.current || !modelGroup) return;

    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();

    let targetPose = POSES[state] || POSES.listening;
    if (state === 'holding') {
      targetPose = blendPose(POSES.listening, POSES.holding, 0.35 + 0.65 * readiness);
    }

    const kPose = 1 - Math.exp(-dt * 5.2);
    const kFace = 1 - Math.exp(-dt * 9.0);
    const kHeld = 1 - Math.exp(-dt * (state === 'withdrawing' ? 4.5 : 7.0));

    const cur = curRef.current;
    cur.lean += (targetPose.lean - cur.lean) * kPose;
    cur.pitch += (targetPose.pitch - lookAt.y * 0.07 - cur.pitch) * kPose;
    cur.yaw += (targetPose.yaw + lookAt.x * 0.16 - cur.yaw) * kPose;
    cur.roll += (targetPose.roll - cur.roll) * kPose;
    cur.chest += ((targetPose.chest || 0) - cur.chest) * kPose;

    const heldTarget = heldLight && state === 'holding' ? 0.35 + 0.65 * readiness : 0;
    cur.held += (heldTarget - cur.held) * kHeld;

    // Face blendshapes
    const faceTarget: Record<string, number> = { ...targetPose.m };
    if (targetPose.talk) {
      const s = Math.max(0, Math.sin(t * 11.3) * 0.6 + Math.sin(t * 7.1 + 1.3) * 0.4);
      faceTarget.jawOpen = (faceTarget.jawOpen || 0) + 0.05 + 0.2 * s;
      faceTarget.mouthFunnel = 0.08 * Math.max(0, Math.sin(t * 5.3));
    }

    const dict = morphDictRef.current;
    const curM = curMRef.current;
    const meshes = morphMeshesRef.current;

    for (const key of new Set([...Object.keys(curM), ...Object.keys(faceTarget)])) {
      curM[key] = (curM[key] || 0) + ((faceTarget[key] || 0) - (curM[key] || 0)) * kFace;
      const idx = dict[key];
      if (idx !== undefined) {
        for (const m of meshes) {
          if (m.morphTargetInfluences) {
            m.morphTargetInfluences[idx] = curM[key];
          }
        }
      }
    }

    // Blinking
    const blink = blinkAnimRef.current;
    if (t > blink.next && blink.start < 0) {
      blink.start = t;
    }
    if (blink.start >= 0) {
      const p = (t - blink.start) / 0.16;
      const b = p < 1 ? Math.sin(Math.PI * p) : 0;
      const idxL = dict['eyeBlink_L'];
      const idxR = dict['eyeBlink_R'];
      if (idxL !== undefined && idxR !== undefined) {
        for (const m of meshes) {
          if (m.morphTargetInfluences) {
            m.morphTargetInfluences[idxL] = Math.max(curM['eyeBlink_L'] || 0, b);
            m.morphTargetInfluences[idxR] = Math.max(curM['eyeBlink_R'] || 0, b);
          }
        }
      }
      if (p >= 1) {
        blink.start = -1;
        blink.next = t + 2.4 + Math.random() * 3.2;
      }
    }

    // Nod
    let nod = 0;
    const nodAnim = nodAnimRef.current;
    if (nodAnim.start === -2) {
      nodAnim.start = t;
    }
    if (nodAnim.start >= 0) {
      const p = (t - nodAnim.start) / 0.62;
      if (p >= 1) {
        nodAnim.start = -1;
      } else {
        nod = nodAnim.amp * Math.sin(Math.PI * p) * (1 - 0.3 * p);
      }
    }

    const breathe = Math.sin(t * 1.5) * 0.004;
    const sway = Math.sin(t * 0.37) * 0.014 + Math.sin(t * 0.23 + 2) * 0.009;
    const H = headHeight;

    pivotRef.current.rotation.set(cur.pitch + nod, cur.yaw + sway, cur.roll);
    pivotRef.current.position.set(0, (breathe + cur.chest) * H, cur.lean * H);

    if (bodyRef.current) {
      bodyRef.current.position.set(0, (breathe * 0.7 + cur.chest * 0.8) * H, cur.lean * 0.55 * H);
    }

    heldUniforms.uHeld.value = cur.held * 1.3 * heldGain;
  });

  return (
    <group>
      <group ref={pivotRef}>
        {modelGroup && <primitive object={modelGroup} />}
      </group>
      <group ref={bodyRef}>
        {torsoMesh && <primitive object={torsoMesh} />}
      </group>
    </group>
  );
};
