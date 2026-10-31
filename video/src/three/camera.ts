import * as THREE from 'three';
import {EASE, H, W, clamp01, mix} from '../theme';

export const FOV = 32;

export type Vec = [number, number, number];

// One camera move shared by the WebGL scene and the 2D label overlay, so labels stay pinned to 3D anchors.
export const cameraPose = (frame: number, dur: number): {pos: Vec; target: Vec} => {
  const p = EASE.inOut(clamp01(frame / dur));
  return {
    pos: [mix(-1.9, 0.9, p), mix(1.05, 0.45, p), mix(11.6, 10.1, p)],
    target: [mix(0.2, 0.7, p), mix(0.05, -0.05, p), 0],
  };
};

const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100);
const v = new THREE.Vector3();

export const project = (frame: number, dur: number, point: Vec): [number, number] => {
  const {pos, target} = cameraPose(frame, dur);
  cam.position.set(...pos);
  cam.lookAt(...target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  v.set(...point).project(cam);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
};
