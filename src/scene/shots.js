import * as THREE from 'three';

// 准备好，再靠近 — one set, a near-static camera, three states.
//
// 0 hero  — 准备好: the full pack on the blue sweep, ~45% of frame height
// 1 open  — the lid opens; the viewer draws one sachet out by hand. The
//           camera stays put; the sachet settles above-left of the pack
//           (≤ ~30% of frame height) and the line completes beside them.
// 2 range — only the selected pack is in frame; the others sit far apart
//           on the same sweep, so a selection is a short pan between them.

export const LAYOUT = {
  packs: {
    3: { x: 0, z: 0, yaw: -0.42 },
    6: { x: 5.6, z: 0, yaw: -0.4 },
    16: { x: 11.2, z: 0, yaw: -0.36 },
  },
};

const D = [
  {
    cam: [-0.5, 1.85, 5.7], look: [-0.62, 0.86, 0.1], fov: 28,
    title: { x: -3.05, y: 1.74, w: 2.55, op: 1 },
    lid: 0, drag: 1, range: 0,
  },
  {
    cam: [-0.55, 2.75, 6.3], look: [-0.78, 1.05, 0], fov: 28,
    title: { x: -3.05, y: 1.74, w: 2.55, op: 0 },
    lid: 1, drag: 0, range: 0,
  },
  {
    // positioned relative to the selected pack at runtime
    cam: [0.3, 1.7, 7.4], look: [-1.0, 0.82, 0], fov: 28, follow: true,
    title: { x: -3.05, y: 1.74, w: 2.55, op: 0 },
    lid: 0, drag: 1, range: 1,
  },
];

const P = [
  {
    cam: [0.15, 1.95, 8.6], look: [0.08, 0.36, 0], fov: 31,
    title: { x: -0.86, y: 1.9, w: 1.78, op: 1 },
    lid: 0, drag: 1, range: 0,
  },
  {
    cam: [0.25, 3.25, 9.0], look: [0.14, 0.45, 0], fov: 31,
    title: { x: -0.86, y: 1.9, w: 1.78, op: 0 },
    lid: 1, drag: 0, range: 0,
  },
  {
    cam: [0, 2.3, 8.8], look: [0, -0.2, 0], fov: 31, follow: true,
    title: { x: -0.86, y: 1.9, w: 1.78, op: 0 },
    lid: 0, drag: 1, range: 1,
  },
];

export const SHOT_COUNT = D.length;
export const OPEN_SHOT = 1;

/**
 * Pull path: straight up out of the carton, then an arc to a presentation
 * pose above-left of the pack, turned toward the viewer. World positions.
 */
export const PULL = {
  lift: 0.3, // p at which the sachet is fully clear of the rim
  band: [0.1, 0.48], // p window in which the narrow light band crosses the seal
  rest: {
    wide: { pos: [-0.62, 1.9, 0.85], yaw: 0.16, roll: -0.12, tilt: -0.06 },
    portrait: { pos: [-0.14, 2.0, 0.85], yaw: 0.1, roll: -0.1, tilt: -0.06 },
  },
};

export function makeShot() {
  return {
    cam: new THREE.Vector3(), look: new THREE.Vector3(), fov: 27,
    title: { x: 0, y: 0, w: 1, op: 1 },
    lid: 0, drag: 0, range: 0,
  };
}

export function shotCamera(i, portrait) {
  const s = (portrait ? P : D)[i];
  return { cam: new THREE.Vector3().fromArray(s.cam), look: new THREE.Vector3().fromArray(s.look), fov: s.fov };
}

export function resolveShot(out, i, { portrait, selectedX = 0 }) {
  const s = (portrait ? P : D)[i];
  out.cam.fromArray(s.cam);
  out.look.fromArray(s.look);
  if (s.follow) {
    out.cam.x += selectedX;
    out.look.x += selectedX;
  }
  out.fov = s.fov;
  Object.assign(out.title, s.title);
  out.lid = s.lid;
  out.drag = s.drag;
  out.range = s.range;
  return out;
}

const L = THREE.MathUtils.lerp;
export function blendShot(out, a, b, k) {
  out.cam.lerpVectors(a.cam, b.cam, k);
  out.look.lerpVectors(a.look, b.look, k);
  out.fov = L(a.fov, b.fov, k);
  for (const key of ['x', 'y', 'w', 'op']) out.title[key] = L(a.title[key], b.title[key], k);
  out.lid = L(a.lid, b.lid, k);
  out.drag = L(a.drag, b.drag, k);
  out.range = L(a.range, b.range, k);
  return out;
}
