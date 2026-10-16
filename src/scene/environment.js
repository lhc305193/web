import * as THREE from 'three';

// Reflection environment matching the blue set: blue paper all around, a
// soft window-light key from upper-left-front, a broad top bounce and a thin
// back-right rim. Panels use feathered gradients so reflections read as soft
// light sources, never as hard white blocks.

function feathered(w, h, { soft = 0.35, vertical = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = Math.abs(x / 127 - 0.5) * 2;
      const v = Math.abs(y / 127 - 0.5) * 2;
      const fu = 1 - THREE.MathUtils.smoothstep(u, 1 - soft, 1);
      const fv = 1 - THREE.MathUtils.smoothstep(v, 1 - (vertical ? soft * 0.4 : soft), 1);
      const k = fu * fv;
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function panel(scene, { w, h, intensity, color = 0xffffff, pos, look = [0, 0.6, 0], soft = 0.35, vertical = false }) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: feathered(w, h, { soft, vertical }),
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mat.color.multiplyScalar(intensity);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.lookAt(...look);
  scene.add(m);
}

export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();

  const domeGeo = new THREE.SphereGeometry(30, 48, 24);
  const colors = [];
  const p = domeGeo.attributes.position;
  const floor = new THREE.Color('#0b2266');
  const horizon = new THREE.Color('#1d4fbf');
  const zenith = new THREE.Color('#6d8fdb');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 30;
    if (y < 0) c.copy(floor).lerp(horizon, Math.pow(1 + y, 4));
    else c.copy(horizon).lerp(zenith, Math.pow(y, 0.8));
    c.multiplyScalar(0.42);
    colors.push(c.r, c.g, c.b);
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // window key (matches the gobo spot)
  panel(scene, { w: 9, h: 11, intensity: 2.4, color: 0xfff6ee, pos: [-12, 9, 9], soft: 0.45 });
  // broad top bounce
  panel(scene, { w: 16, h: 10, intensity: 0.9, color: 0xeaf0ff, pos: [0, 16, 1], soft: 0.6 });
  // back-right rim strip
  panel(scene, { w: 1.8, h: 14, intensity: 3.2, color: 0xdfe8ff, pos: [11, 3, -8], soft: 0.5, vertical: true });
  // low front card so faces toward camera keep a gentle sheen
  panel(scene, { w: 12, h: 4, intensity: 0.55, color: 0xcfdcff, pos: [2, 1.5, 15], soft: 0.6 });
  // high front bounce (behind the viewer): what foil turned toward you reflects
  panel(scene, { w: 14, h: 9, intensity: 1.25, color: 0xf4f6ff, pos: [2.5, 9, 12], soft: 0.6 });
  // white bounce card behind the set: what flat foil reflects at grazing angles
  panel(scene, { w: 18, h: 5, intensity: 1.5, color: 0xf2f5ff, pos: [1, 2.2, -14], soft: 0.55 });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
  return rt.texture;
}
