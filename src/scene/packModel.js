import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createPackArt, PACKS } from './packArt.js';

// A folding-carton model of the AiR pack, built from board panels so the tuck
// lid can really open: printed outer faces (redrawn artwork), unprinted inner
// board, white cut edges where the board is cut, and printed folds where it is
// folded. Origin sits at the centre of the base, so the pack stands on y = 0.

const T = 0.008; // board thickness (world units, pack width ≈ 1)

function texture(canvas, renderer, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

function printMaterial(map, mr) {
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: mr,
    metalnessMap: mr,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.28,
    clearcoatRoughness: 0.3,
    iridescence: 0.06,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [280, 480],
    envMapIntensity: 1.0,
  });
}

let boardMat = null;
let edgeMat = null;
function boardMaterials() {
  if (!boardMat) {
    boardMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.9, metalness: 0 });
    edgeMat = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.8, metalness: 0 });
  }
  return { board: boardMat, edge: edgeMat };
}

function panel(w, h, d, mats) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.45);
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * @returns {THREE.Group} with userData { pack, art, setOpen(v), lid, inner }
 */
export function createPackModel(packId, renderer, { ppu = 1200 } = {}) {
  const pack = PACKS[packId];
  const { w: W, h: H, d: D } = pack;
  const art = createPackArt(packId, { ppu, mrScale: 0.5 });
  const { board, edge } = boardMaterials();

  const tex = {};
  for (const face of Object.keys(art.color)) {
    tex[face] = printMaterial(texture(art.color[face], renderer, true), texture(art.mr[face], renderer, false));
  }

  const group = new THREE.Group();
  group.name = `pack-${packId}`;

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  // front wall: outer print on +z, folds on the sides/bottom, cut edge on top
  const front = panel(W, H, T, [tex.side, tex.side, edge, tex.front, tex.front, board]);
  front.position.set(0, H / 2, D / 2 - T / 2);
  group.add(front);

  const back = panel(W, H, T, [tex.side, tex.side, edge, tex.back, board, tex.back]);
  back.position.set(0, H / 2, -D / 2 + T / 2);
  group.add(back);

  const right = panel(T, H, D - 2 * T, [tex.side, board, edge, tex.side, tex.side, tex.side]);
  right.position.set(W / 2 - T / 2, H / 2, 0);
  group.add(right);

  const left = panel(T, H, D - 2 * T, [board, tex.side, edge, tex.side, tex.side, tex.side]);
  left.position.set(-W / 2 + T / 2, H / 2, 0);
  group.add(left);

  const bottom = panel(W - 2 * T, T, D - 2 * T, [board, board, board, tex.bottom, board, board]);
  bottom.position.set(0, T / 2, 0);
  group.add(bottom);

  // lid: top panel + tuck tab, hinged on the back top edge
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const top = panel(W, T, D, [edge, edge, tex.top, board, tex.top, edge]);
  top.position.set(0, T / 2, D / 2);
  lid.add(top);
  // tuck tab: its own fold line on the lid's front edge. While its tip is
  // still inside the carton it is held parallel to the front wall (it slides
  // up along the inner face); only once clear of the rim does it fold out.
  const tuckH = Math.min(0.16, H * 0.12);
  const tuckZ = D - T * 1.6;
  const tuckHinge = new THREE.Group();
  tuckHinge.position.set(0, T * 0.5, tuckZ);
  const tuck = panel(W - 4 * T, tuckH, T, [edge, edge, edge, edge, board, board]);
  tuck.position.set(0, -tuckH / 2, 0);
  tuckHinge.add(tuck);
  lid.add(tuckHinge);
  group.add(lid);

  // dust flaps, hinged on the side walls' top edges, folded inwards under the lid
  const flapW = Math.min(0.12, W * 0.16);
  const flaps = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * (W / 2 - T), H - T * 0.6, 0);
    const f = panel(flapW, T * 0.8, D - 4 * T, [board, board, board, board, edge, edge]);
    f.position.set(-side * flapW / 2, 0, 0);
    hinge.add(f);
    hinge.userData.side = side;
    group.add(hinge);
    return hinge;
  });

  // dark inside so the opening reads as depth, not a hollow shell
  const cavity = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 2 * T, D - 2 * T),
    new THREE.MeshStandardMaterial({ color: 0x9aa3b4, roughness: 1 }),
  );
  cavity.rotation.x = -Math.PI / 2;
  cavity.position.y = T * 1.2;
  group.add(cavity);

  const inner = new THREE.Group();
  group.add(inner);

  // lid angle at which the tuck tip clears the front wall when held vertical
  const clearAngle = Math.asin(Math.min(0.99, (tuckH + T * 2) / tuckZ));
  const relaxSpan = THREE.MathUtils.degToRad(26);

  let openAmt = 0;
  function setOpen(v) {
    openAmt = THREE.MathUtils.clamp(v, 0, 1);
    const theta = openAmt * THREE.MathUtils.degToRad(118);
    // lid swings back past vertical about the back hinge
    lid.rotation.x = -theta;
    // phase 1 (θ < clear): counter-rotate so the tab stays vertical and slides out
    // phase 2: ease back to its natural right-angle fold, tip already above the rim
    const relax = THREE.MathUtils.smoothstep(theta, clearAngle, clearAngle + relaxSpan);
    tuckHinge.rotation.x = theta * (1 - relax);
    // dust flaps spring up a little once the lid is out of the way
    const flapLift = THREE.MathUtils.smoothstep(openAmt, 0.35, 0.85) * THREE.MathUtils.degToRad(38);
    for (const h of flaps) h.rotation.z = -h.userData.side * flapLift;
    inner.visible = openAmt > 0.01;
  }
  setOpen(0);

  group.userData = { pack, art, setOpen, lid, inner, get open() { return openAmt; } };
  return group;
}

/** blurred rectangular contact shadow sized to a footprint */
export function createContactShadow(w, d, { spread = 0.12, opacity = 0.75 } = {}) {
  const res = 256;
  const c = document.createElement('canvas');
  c.width = c.height = res;
  const g = c.getContext('2d');
  const pw = w + spread * 2;
  const pd = d + spread * 2;
  const ix = (spread / pw) * res;
  const iz = (spread / pd) * res;
  // alphaMap is read from the green channel: black = clear, white = shadow
  g.fillStyle = '#000';
  g.fillRect(0, 0, res, res);
  g.fillStyle = '#fff';
  g.filter = `blur(${Math.round(Math.min(ix, iz) * 0.55)}px)`;
  g.fillRect(ix, iz, res - ix * 2, res - iz * 2);
  g.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x02081f,
    alphaMap: t,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0015;
  m.renderOrder = 2;
  return m;
}
