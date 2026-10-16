import * as THREE from 'three';

// The set: a Durex-blue paper sweep (floor curving into wall), the campaign
// line printed large on the wall, and window light falling through blinds.

export const WALL_Z = -2.2;
const COVE_R = 0.7;

function paperGrain() {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  let s = 77;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n * n; i++) {
    const v = 238 + (r() - 0.5) * 16;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // faint long fibres
  g.globalAlpha = 0.05;
  g.strokeStyle = '#fff';
  for (let i = 0; i < 400; i++) {
    const x = r() * n;
    const y = r() * n;
    const a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function sweepGeometry() {
  const prof = [];
  const push = (y, z) => prof.push(new THREE.Vector2(y, z));
  for (let z = 16; z > WALL_Z + COVE_R; z -= 1.0) push(0, z);
  push(0, WALL_Z + COVE_R);
  for (let i = 1; i <= 28; i++) {
    const a = (i / 28) * (Math.PI / 2);
    push(COVE_R - COVE_R * Math.cos(a), WALL_Z + COVE_R - COVE_R * Math.sin(a));
  }
  for (let y = COVE_R + 0.6; y <= 16; y += 1.2) push(y, WALL_Z);

  const xs = [-18, -6, -2, 0, 2, 6, 10, 22];
  const pos = [];
  const uv = [];
  const idx = [];
  let s = 0;
  const sAt = [0];
  for (let i = 1; i < prof.length; i++) {
    s += prof[i].distanceTo(prof[i - 1]);
    sAt.push(s);
  }
  for (let i = 0; i < prof.length; i++) {
    for (const x of xs) {
      pos.push(x, prof[i].x, prof[i].y);
      uv.push(x / 3.2, sAt[i] / 3.2);
    }
  }
  const cols = xs.length;
  for (let i = 0; i < prof.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// a single narrow slit with feathered edges: projected by the band light it
// draws one thin bright stripe, used once, as the sachet leaves the carton
function slitTexture() {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, n, n);
  const grd = g.createLinearGradient(n * 0.44, 0, n * 0.56, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(n * 0.44, n * 0.05, n * 0.12, n * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.center.set(0.5, 0.5);
  t.rotation = 0.5;
  return t;
}

function titleCanvas(lines, { width, lineHeight }) {
  const c = document.createElement('canvas');
  const fs = Math.round(lineHeight * 0.86);
  c.width = width;
  c.height = Math.round(lineHeight * lines.length);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `200 ${fs}px "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  if ('letterSpacing' in g) g.letterSpacing = `${-Math.round(fs * 0.035)}px`;
  lines.forEach((ln, i) => g.fillText(ln, fs * 0.02, lineHeight * (i + 0.82)));
  return c;
}

export function createSet(renderer) {
  const group = new THREE.Group();

  const paper = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3460c6'),
    roughness: 0.94,
    metalness: 0,
    map: paperGrain(),
  });
  const sweep = new THREE.Mesh(sweepGeometry(), paper);
  sweep.receiveShadow = true;
  group.add(sweep);

  // wall-printed campaign line (silver-white ink, catches the window light)
  const titleMat = new THREE.MeshStandardMaterial({
    color: 0xf2f5fb,
    transparent: true,
    roughness: 0.42,
    metalness: 0.28,
    emissive: 0xffffff,
    emissiveIntensity: 0.2,
    depthWrite: false,
  });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), titleMat);
  title.receiveShadow = true;
  title.renderOrder = 1;
  group.add(title);
  let titleMode = '';
  function layoutTitle(mode, { x, y, w }) {
    if (mode !== titleMode) {
      titleMode = mode;
      const lines = mode === 'portrait' ? ['让感受', '先到'] : ['让感受先到'];
      const c = titleCanvas(lines, mode === 'portrait' ? { width: 2048, lineHeight: 760 } : { width: 4096, lineHeight: 900 });
      if (titleMat.map) titleMat.map.dispose();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      titleMat.map = t;
      titleMat.emissiveMap = t;
      titleMat.needsUpdate = true;
      title.userData.aspect = c.width / c.height;
    }
    title.scale.set(w, w / title.userData.aspect, 1);
    title.position.set(x + w / 2, y, WALL_Z + 0.004);
  }

  // soft key: a big diffused source front-left. Makes the pool of light the
  // pack stands in, and its soft cast shadow; the set falls off beyond it.
  const soft = new THREE.SpotLight(0xfff6ee, 2.9, 0, 0.62, 1.0, 0);
  soft.position.set(-3.6, 6.2, 6.4);
  soft.target.position.set(0.2, 0.3, 0.2);
  soft.castShadow = true;
  soft.shadow.mapSize.set(2048, 2048);
  soft.shadow.radius = 9;
  soft.shadow.bias = -0.0002;
  soft.shadow.normalBias = 0.01;
  soft.shadow.camera.near = 3;
  soft.shadow.camera.far = 20;
  group.add(soft, soft.target);

  // band: a narrow slit of light. Dark at rest; the pull drives it across
  // the sachet's seal while the sachet clears the mouth of the carton.
  const key = new THREE.SpotLight(0xffffff, 0, 0, 0.09, 0.4, 0);
  key.position.set(-2.6, 5.4, 4.6);
  key.target.position.set(0, 1.5, 0);
  key.map = slitTexture();
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.bias = -0.0003;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 14;
  group.add(key, key.target);

  // cool rim from behind-right, separates the pack edge from the wall
  const rim = new THREE.DirectionalLight(0xd6e2ff, 1.3);
  rim.position.set(5, 4.5, -3.5);
  group.add(rim);

  // low blue room bounce — shadows stay blue, never black
  const hemi = new THREE.HemisphereLight(0xa9c0ff, 0x081a58, 0.22);
  group.add(hemi);

  return { group, sweep, paper, title, titleMat, layoutTitle, key, soft, rim, hemi };
}
