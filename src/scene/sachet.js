import * as THREE from 'three';

// Individual foil sachet, illustrative (its real print is not verified, so it
// is left unprinted): square pillow of foil with the rolled ring pressed
// through, fine crimped seal bands, serrated cut edges and a tear notch.

export const SACHET = 0.72; // edge length; pack width is 1.0

let shared = null;

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildMaps(n = 2048) {
  const band = Math.round(n * 0.075);
  const r = rand(5);

  // bump: crimp ridges perpendicular to each edge, seal groove, foil grain
  const bump = canvas(n);
  const b = bump.getContext('2d');
  b.fillStyle = 'rgb(128,128,128)';
  b.fillRect(0, 0, n, n);
  const period = Math.max(6, Math.round(n * 0.0115));
  b.save();
  b.beginPath();
  b.rect(0, 0, n, band);
  b.rect(0, n - band, n, band);
  b.clip();
  for (let x = 0; x < n; x += period) {
    const g = b.createLinearGradient(x, 0, x + period, 0);
    g.addColorStop(0, 'rgb(40,40,40)');
    g.addColorStop(0.42, 'rgb(225,225,225)');
    g.addColorStop(0.58, 'rgb(225,225,225)');
    g.addColorStop(1, 'rgb(40,40,40)');
    b.fillStyle = g;
    b.fillRect(x, 0, period, n);
  }
  b.restore();
  b.save();
  b.beginPath();
  b.rect(0, band, band, n - band * 2);
  b.rect(n - band, band, band, n - band * 2);
  b.clip();
  for (let y = 0; y < n; y += period) {
    const g = b.createLinearGradient(0, y, 0, y + period);
    g.addColorStop(0, 'rgb(40,40,40)');
    g.addColorStop(0.42, 'rgb(225,225,225)');
    g.addColorStop(0.58, 'rgb(225,225,225)');
    g.addColorStop(1, 'rgb(40,40,40)');
    b.fillStyle = g;
    b.fillRect(0, y, n, period);
  }
  b.restore();
  // inner seal groove
  b.strokeStyle = 'rgb(60,60,60)';
  b.lineWidth = Math.max(2, n * 0.004);
  b.strokeRect(band, band, n - band * 2, n - band * 2);
  b.strokeStyle = 'rgb(175,175,175)';
  b.lineWidth = Math.max(1, n * 0.002);
  b.strokeRect(band + n * 0.005, band + n * 0.005, n - band * 2 - n * 0.01, n - band * 2 - n * 0.01);
  // foil grain
  const img = b.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (r() - 0.5) * 10;
    img.data[i] += v;
    img.data[i + 1] += v;
    img.data[i + 2] += v;
  }
  b.putImageData(img, 0, 0);

  // alpha: serrated top/bottom cut, straight sides, tear notches
  const alpha = canvas(n);
  const a = alpha.getContext('2d');
  a.fillStyle = '#000';
  a.fillRect(0, 0, n, n);
  a.fillStyle = '#fff';
  const tooth = n * 0.026;
  const depth = n * 0.012;
  a.beginPath();
  a.moveTo(0, depth);
  for (let x = 0; x <= n + 0.1; x += tooth) {
    a.lineTo(x + tooth / 2, 0);
    a.lineTo(Math.min(n, x + tooth), depth);
  }
  a.lineTo(n, n - depth);
  for (let x = n; x >= -0.1; x -= tooth) {
    a.lineTo(x - tooth / 2, n);
    a.lineTo(Math.max(0, x - tooth), n - depth);
  }
  a.closePath();
  a.fill();
  a.fillStyle = '#000';
  for (const side of [0, n]) {
    const y = n * 0.28;
    a.beginPath();
    a.moveTo(side, y - n * 0.02);
    a.lineTo(side + (side === 0 ? 1 : -1) * n * 0.028, y);
    a.lineTo(side, y + n * 0.02);
    a.closePath();
    a.fill();
  }

  // roughness: crimped bands scatter more, pillow is smoother
  const rough = canvas(256);
  const rg = rough.getContext('2d');
  rg.fillStyle = 'rgb(0,64,0)';
  rg.fillRect(0, 0, 256, 256);
  const bb = Math.round(256 * 0.075);
  rg.fillStyle = 'rgb(0,96,0)';
  rg.fillRect(0, 0, 256, bb);
  rg.fillRect(0, 256 - bb, 256, bb);
  rg.fillRect(0, 0, bb, 256);
  rg.fillRect(256 - bb, 0, bb, 256);

  const mk = (c, srgb = false) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { bump: mk(bump), alpha: mk(alpha), rough: mk(rough) };
}

function buildGeometry(S, seg = 220) {
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  const pos = geo.attributes.position;
  const half = S / 2;
  const band = 0.075 * S;
  const R0 = 0.29 * S;
  const ringW = 0.065 * S;
  // the rolled ring is never perfectly centred or round inside a real sachet
  const cx = 0.022 * S;
  const cy = -0.014 * S;
  const r = rand(19);
  const creases = Array.from({ length: 7 }, () => {
    const ang = r() * Math.PI;
    return { dx: Math.cos(ang), dy: Math.sin(ang), f: (16 + r() * 22) / S, ph: r() * 6.28, a: 0.0011 * S * (0.5 + r()) };
  });
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dEdge = Math.min(half - Math.abs(x), half - Math.abs(y));
    const inside = ss(dEdge, band * 0.95, band + 0.09 * S);
    const rr = Math.hypot((x - cx) / 1.04, y - cy);
    const ring = 0.011 * S * Math.exp(-(((rr - R0) / ringW) ** 2));
    const disc = 0.0035 * S * (1 - ss(rr, R0 * 0.4, R0 * 0.95));
    const pillow = 0.0055 * S * inside * (1 - 0.3 * (Math.hypot(x, y) / (half * 1.41)) ** 2);
    let wr = 0;
    for (const c of creases) wr += c.a * Math.sin((c.dx * x + c.dy * y) * c.f + c.ph);
    wr *= 0.7 * Math.exp(-(((rr - R0 * 1.3) / (0.2 * S)) ** 2));
    pos.setZ(i, pillow + inside * (ring + disc + wr));
  }
  geo.computeVertexNormals();
  return geo;
}

export function createSachet() {
  if (!shared) {
    const maps = buildMaps();
    const geo = buildGeometry(SACHET);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xe4e9f1,
      metalness: 0.78,
      roughness: 1,
      roughnessMap: maps.rough,
      bumpMap: maps.bump,
      bumpScale: 2.0,
      alphaMap: maps.alpha,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      clearcoat: 0.25,
      clearcoatRoughness: 0.12,
      anisotropy: 0.35,
      envMapIntensity: 1.15,
    });
    shared = { geo, mat };
  }
  const m = new THREE.Mesh(shared.geo, shared.mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'sachet';
  return m;
}
