import * as THREE from 'three';
import { createStudioEnvironment } from './environment.js';
import { createSet } from './set.js';
import { createPackModel, createContactShadow } from './packModel.js';
import { createSachet, SACHET } from './sachet.js';
import { LAYOUT, SHOT_COUNT, OPEN_SHOT, PULL, makeShot, resolveShot, blendShot, shotCamera } from './shots.js';
import { PACKS } from './packArt.js';

const TAU = Math.PI * 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const ss = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

export function createStage(canvas, {
  reducedMotion = false,
  isTouch = false,
  onYaw = () => {},
  onPull = () => {},
  onAnchor = () => {},
  onFirstFrame = () => {},
  onLost = () => {},
} = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
  } catch (err) {
    throw new Error('webgl-unavailable');
  }
  if (!renderer.getContext()) throw new Error('webgl-unavailable');

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x0b2470, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e2a7c, 16, 36);
  const camera = new THREE.PerspectiveCamera(27, 1, 0.05, 80);

  scene.environment = createStudioEnvironment(renderer);
  scene.environmentIntensity = 0.5;

  const set = createSet(renderer);
  scene.add(set.group);

  let destroyed = false;

  // ───── products ─────
  const ppu = isTouch ? 900 : 1300;
  const roots = {};
  const models = {};
  const userYaw = { 3: 0, 6: 0, 16: 0 };

  function buildPack(id) {
    if (models[id] || destroyed) return models[id];
    const model = createPackModel(id, renderer, { ppu });
    const root = new THREE.Group();
    const L = LAYOUT.packs[id];
    root.position.set(L.x, 0, L.z);
    root.rotation.y = L.yaw;
    root.add(model);
    const p = PACKS[id];
    root.add(createContactShadow(p.w, p.d, { spread: 0.1, opacity: 0.8 }));
    if (id !== 3) root.visible = false;
    scene.add(root);
    roots[id] = root;
    models[id] = model;
    model.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) for (const k of ['map', 'roughnessMap']) if (m[k]) renderer.initTexture(m[k]);
      }
    });
    return model;
  }
  buildPack(3);

  const H3 = PACKS[3].h;
  const HALF = SACHET / 2;

  // two sachets stay in the carton, staggered so each crimped top catches light
  {
    const inner = models[3].userData.inner;
    [[-0.085, 0.11], [0, 0.08]].forEach(([z, drop], i) => {
      const s = createSachet();
      s.position.set((i - 0.5) * 0.014, H3 - drop - HALF, z);
      s.rotation.set(-0.03 + i * 0.025, 0, (i - 0.5) * 0.012);
      s.castShadow = false;
      inner.add(s);
    });
  }

  // the one the viewer draws out (front slot)
  const pulled = createSachet();
  pulled.name = 'pulled-sachet';
  scene.add(pulled);
  const IN_LOCAL = new THREE.Vector3(0, H3 - 0.05 - HALF, 0.085);
  const OUT_LOCAL = new THREE.Vector3(0, H3 + HALF + 0.08, 0.085);

  // ───── state ─────
  const view = { aspect: 1, portrait: false };
  const shotA = makeShot();
  const shotB = makeShot();
  const shot = makeShot();
  let tTarget = 0;
  let t = 0;
  let active = true;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let dirty = true;
  let selected = 3;
  let camSelX = 0;
  // in-place swap: the outgoing pack settles down and out, the chosen one
  // rises into the same mark (~340 ms in total)
  const SWAP_MS = 340;
  let swap = null;

  const drag = { on: false, vel: 0 };
  // the soft key drifts a little with the pointer, so the foil and the pearl
  // board answer the hand; it eases back to rest when the pointer leaves
  const light = { x: 0, y: 0, tx: 0, ty: 0 };
  let yawAnim = null;
  const pull = { p: 0, target: 0, lambda: 20, hover: 0, hoverTarget: 0, touched: false, reported: -1 };

  // scratch
  const v1 = new THREE.Vector3();
  const P0 = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  const PR = new THREE.Vector3();
  const Q0 = new THREE.Quaternion();
  const QR = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const anchor = new THREE.Vector3();
  const bandAim = new THREE.Vector3();
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 4 }, () => new THREE.Vector3()), false, 'centripetal');

  // ───── sizing ─────
  let dprCap = 2;
  let dpr = Infinity;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    view.aspect = w / h;
    view.portrait = w <= 860 || view.aspect < 0.8;
    dprCap = Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2);
    while (w * h * dprCap * dprCap > 6.2e6 && dprCap > 1) dprCap -= 0.25;
    dpr = Math.max(1, Math.min(dpr, dprCap));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = view.aspect;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  resize();

  let slow = 0;
  let sampled = 0;
  function adapt(dtMs) {
    sampled++;
    if (dtMs > 24) slow++;
    if (sampled >= 90) {
      if (slow > 45 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
      sampled = 0;
      slow = 0;
    }
  }

  const dragTarget = () => (shot.range > 0.5 ? selected : 3);

  // how much of the pull is shown, given where the scroll is
  const pullWeight = () => 1 - ss(Math.abs(t - OPEN_SHOT), 0.0, 0.45);

  function poseSachet(pe, rest) {
    const root = roots[3];
    root.updateMatrixWorld();
    root.getWorldQuaternion(Q0);
    root.localToWorld(P0.copy(IN_LOCAL).add(v1.set(0, rest, 0)));
    root.localToWorld(P1.copy(OUT_LOCAL));
    const R = view.portrait ? PULL.rest.portrait : PULL.rest.wide;
    PR.fromArray(R.pos);

    // resting pose: turned toward the open-shot camera, with a little life
    const C = shotCamera(OPEN_SHOT, view.portrait).cam;
    m4.lookAt(C, PR, UP);
    QR.setFromRotationMatrix(m4)
      .multiply(qTmp.setFromAxisAngle(AY, R.yaw))
      .multiply(qTmp.setFromAxisAngle(AX, R.tilt))
      .multiply(qTmp.setFromAxisAngle(AZ, R.roll));

    if (pe <= PULL.lift) {
      // straight up out of the carton — never turns inside the walls
      pulled.position.lerpVectors(P0, P1, pe / PULL.lift);
      pulled.quaternion.copy(Q0);
    } else {
      const k = (pe - PULL.lift) / (1 - PULL.lift);
      const pts = curve.points;
      pts[0].copy(P1).addScaledVector(UP, -0.5);
      pts[1].copy(P1);
      pts[2].copy(PR);
      pts[3].copy(PR).addScaledVector(v1.copy(PR).sub(P1), 0.3);
      curve.getPoint(1 / 3 + k / 3, pulled.position);
      pulled.quaternion.copy(Q0).slerp(QR, smooth(k));
    }
    pulled.updateMatrixWorld();
  }

  function update(dt) {
    const rm = reducedMotion;
    if (!rm) time += dt;
    t = active ? damp(t, tTarget, rm ? 20 : 4.2, dt) : tTarget;
    if (Math.abs(t - tTarget) < 1e-4) t = tTarget;

    const selX = LAYOUT.packs[selected].x;
    camSelX = active ? damp(camSelX, selX, rm ? 30 : 3.4, dt) : selX;
    if (Math.abs(camSelX - selX) < 1e-4) camSelX = selX;

    const i = Math.min(Math.floor(t), SHOT_COUNT - 2);
    const k = THREE.MathUtils.clamp(t - i, 0, 1);
    resolveShot(shotA, i, { portrait: view.portrait, selectedX: camSelX });
    resolveShot(shotB, i + 1, { portrait: view.portrait, selectedX: camSelX });
    blendShot(shot, shotA, shotB, smooth(k));

    // pull: follows the hand closely, glides for buttons and keys
    pull.p = damp(pull.p, pull.target, rm ? 40 : pull.lambda, dt);
    if (Math.abs(pull.p - pull.target) < 1e-4) pull.p = pull.target;
    pull.hover = damp(pull.hover, pull.hoverTarget, rm ? 40 : 8, dt);
    const w = pullWeight();
    const pe = pull.p * w;
    if (Math.abs(pull.p - pull.reported) > 5e-4 || (pull.p === pull.target && pull.reported !== pull.p)) {
      pull.reported = pull.p;
      onPull(pull.p);
    }

    // turntable rotation with inertia / scripted turns
    const now = performance.now();
    if (yawAnim) {
      const p = Math.min(1, (now - yawAnim.start) / yawAnim.dur);
      userYaw[yawAnim.id] = yawAnim.from + (yawAnim.to - yawAnim.from) * easeInOut(p);
      if (p >= 1) {
        userYaw[yawAnim.id] = normalizeYaw(userYaw[yawAnim.id]);
        yawAnim = null;
      }
      onYaw(userYaw[dragTarget()]);
    } else if (!drag.on && Math.abs(drag.vel) > 1e-4) {
      userYaw[dragTarget()] += drag.vel * dt;
      drag.vel *= Math.exp(-dt * 3.4);
      if (Math.abs(drag.vel) < 1e-3) drag.vel = 0;
      onYaw(userYaw[dragTarget()]);
    }

    // packs: in the range shot only one pack is ever on the mark. A change of
    // selection plays a short swap; nothing else is passed through on the way.
    let sp = 1;
    if (swap) {
      sp = Math.min(1, (now - swap.start) / swap.dur);
      if (sp >= 1) swap = null;
    }
    const showing = swap && sp < 0.42 ? swap.from : selected;
    const phase = swap ? (sp < 0.42 ? 1 - sp / 0.42 : (sp - 0.42) / 0.58) : 1;
    const settle = smooth(phase);
    for (const id of Object.keys(roots)) {
      const L = LAYOUT.packs[id];
      const root = roots[id];
      const n = Number(id);
      const wYaw = n === 3 ? Math.max(shot.drag, shot.range) : shot.range;
      const inRange = shot.range >= 0.5;
      root.visible = inRange ? n === showing : n === 3;
      const k = inRange && n === showing ? settle : 1;
      root.rotation.y = L.yaw + userYaw[id] * wYaw - (1 - k) * 0.22;
      root.position.y = -(1 - k) * 0.06;
      root.scale.setScalar(0.94 + 0.06 * k);
    }
    if (t > 1.3 && !destroyed) for (const id of [6, 16]) if (!models[id]) buildPack(id);

    // lid opens late in the rise and closes while the specs sheet covers it
    const lid = easeInOut(ss(shot.lid, 0.25, 1.0));
    models[3].userData.setOpen(lid);

    // the drawn sachet; before the first pull it peeks up a little to invite a hand
    const invite = !pull.touched && !rm && w > 0.9 && pe < 0.01 ? 1 : 0;
    const proud = ss(lid, 0.7, 1.0) * 0.06;
    const peek = invite * (1 - Math.cos(time * 2.2)) * 0.5 * 0.016 + pull.hover * 0.025 * (1 - ss(pe, 0, 0.1));
    poseSachet(pe, peek * w + proud);
    pulled.visible = lid > 0.02 || pe > 0.001;
    // held in the air it would drop a soft blot onto the carton front; only cast while inside
    pulled.castShadow = pe < PULL.lift;

    // camera holds still: the shot only
    camera.position.copy(shot.cam);
    camera.position.y += Math.sin(Math.PI * k) * (i === 0 ? 0.12 : 0);
    camera.lookAt(shot.look);
    if (Math.abs(camera.fov - shot.fov) > 1e-3) {
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }

    // wall line
    set.layoutTitle(view.portrait ? 'portrait' : 'wide', shot.title);
    set.titleMat.opacity = shot.title.op;
    set.title.visible = shot.title.op > 0.01;

    // main light: a large soft source upper-left, aimed at whatever is in frame
    const aimX = THREE.MathUtils.lerp(0, camSelX, shot.range);
    set.soft.target.position.set(aimX + 0.1, 0.55, 0.2);
    light.x = damp(light.x, light.tx, rm ? 40 : 2.6, dt);
    light.y = damp(light.y, light.ty, rm ? 40 : 2.6, dt);
    set.soft.position.set(aimX - 3.6 + light.x * 1.6, 6.2 + light.y * 0.9, 6.4);
    set.soft.target.updateMatrixWorld();

    // band: one narrow stripe crosses the top seal while the sachet leaves the mouth
    const [b0, b1] = PULL.band;
    const s = THREE.MathUtils.clamp((pe - b0) / (b1 - b0), 0, 1);
    const env = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
    // the slit light used to sweep the seal; it read as a post-production scan
    // line and also struck the wall, so it stays dark
    set.key.intensity = 0 * env;
    bandAim.set(THREE.MathUtils.lerp(-0.62, 0.62, s) * HALF, HALF * 0.86, 0.01);
    pulled.localToWorld(bandAim);
    set.key.target.position.copy(bandAim);
    set.key.position.set(bandAim.x - 2.6, bandAim.y + 3.9, bandAim.z + 4.0);
    set.key.target.updateMatrixWorld();

    // screen anchor of the sachet's top edge, for the on-page hint
    anchor.set(0, HALF, 0);
    pulled.localToWorld(anchor);
    anchor.project(camera);
    onAnchor(anchor.x, anchor.y, w * (1 - ss(pe, 0.02, 0.12)));
  }

  function needsFrame() {
    if (!reducedMotion) return true;
    return (
      dirty ||
      yawAnim ||
      drag.on ||
      Math.abs(drag.vel) > 1e-4 ||
      Math.abs(t - tTarget) > 1e-4 ||
      Math.abs(camSelX - LAYOUT.packs[selected].x) > 1e-4 ||
      Math.abs(pull.p - pull.target) > 1e-4 ||
      Math.abs(pull.hover - pull.hoverTarget) > 1e-3 ||
      Math.abs(light.x - light.tx) + Math.abs(light.y - light.ty) > 1e-3 ||
      !!swap
    );
  }

  let firstFrameSent = false;
  function frame(nowMs) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(100, nowMs - last);
    last = nowMs;
    if (!active) {
      t = tTarget;
      camSelX = LAYOUT.packs[selected].x;
      return;
    }
    if (!needsFrame()) return;
    update(dtMs / 1000);
    renderer.render(scene, camera);
    dirty = false;
    adapt(dtMs);
    if (!firstFrameSent) {
      firstFrameSent = true;
      onFirstFrame();
      scheduleWarmup();
    }
  }

  let lost = false;
  function start() {
    if (running || lost || destroyed) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // build the other packs while the page is idle; cancellable on destroy
  let warmupId = 0;
  const hasIdle = typeof window.requestIdleCallback === 'function';
  function scheduleWarmup() {
    const queue = [6, 16];
    const schedule = (fn) => (hasIdle ? window.requestIdleCallback(fn, { timeout: 3000 }) : window.setTimeout(fn, 500));
    const next = () => {
      warmupId = 0;
      if (destroyed) return;
      const id = queue.shift();
      if (id == null) return;
      buildPack(id);
      dirty = true;
      warmupId = schedule(next);
    };
    warmupId = schedule(next);
  }
  function cancelWarmup() {
    if (!warmupId) return;
    if (hasIdle) window.cancelIdleCallback(warmupId);
    else window.clearTimeout(warmupId);
    warmupId = 0;
  }

  function normalizeYaw(y) {
    return ((y + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  const onContextLost = (e) => {
    e.preventDefault();
    lost = true;
    stop();
    cancelWarmup();
    document.removeEventListener('visibilitychange', onVis);
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // release everything this stage created: geometry, materials and their
  // textures, light cookies and shadow maps, the environment, listeners
  function disposeAll() {
    const seen = new Set();
    const texKeys = ['map', 'roughnessMap', 'metalnessMap', 'bumpMap', 'alphaMap', 'emissiveMap', 'normalMap'];
    scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const k of texKeys) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
          m.dispose();
        }
      }
      if (o.isLight) {
        if (o.map && !seen.has(o.map)) { seen.add(o.map); o.map.dispose(); }
        if (o.shadow && o.shadow.map) o.shadow.dispose();
      }
    });
    if (scene.environment) scene.environment.dispose();
    scene.clear();
    renderer.renderLists.dispose();
    renderer.dispose();
  }

  start();

  if (import.meta.env.DEV) {
    window.__air = {
      scene, camera, set, roots, models, shot, renderer, pulled, pull,
      get t() { return t; },
      async capture(name, quality = 0.9) {
        update(0.016);
        renderer.render(scene, camera);
        const data = canvas.toDataURL('image/jpeg', quality);
        const r = await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
        return r.text();
      },
      // screen-space bounds (CSS px) of the drawn sachet and the pack in frame
      bounds() {
        const rect = (obj) => {
          const box = new THREE.Box3().setFromObject(obj);
          const c = [];
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) c.push(new THREE.Vector3(x, y, z).project(camera));
          const xs = c.map((q) => (q.x * 0.5 + 0.5) * window.innerWidth);
          const ys = c.map((q) => (-q.y * 0.5 + 0.5) * window.innerHeight);
          const r = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
          r.hFrac = +((r.bottom - r.top) / window.innerHeight).toFixed(3);
          return r;
        };
        const packId = shot.range > 0.5 ? selected : 3;
        return { sachet: pulled.visible ? rect(pulled) : null, pack: rect(models[packId]) };
      },
      settle(v, p = pull.p) {
        tTarget = v; t = v; pull.p = p; pull.target = p;
        camSelX = LAYOUT.packs[selected].x;
      },
    };
  }

  return {
    resize,
    setProgress(v) {
      tTarget = THREE.MathUtils.clamp(v, 0, SHOT_COUNT - 1);
    },
    setActive(v) {
      if (v !== active) {
        active = v;
        dirty = true;
      }
    },
    // ── pull: 准备好，再靠近 ──
    setPull(v, { follow = true } = {}) {
      pull.target = THREE.MathUtils.clamp(v, 0, 1);
      pull.lambda = follow ? 22 : 3.2;
      if (pull.target > 0.01) pull.touched = true;
      dirty = true;
    },
    getPullTarget() {
      return pull.target;
    },
    pullHover(on) {
      pull.hoverTarget = on ? 1 : 0;
      dirty = true;
    },
    // ── light follows the pointer (normalised device coords) ──
    pointerMove(x, y) {
      if (reducedMotion) return;
      light.tx = THREE.MathUtils.clamp(x, -1, 1);
      light.ty = THREE.MathUtils.clamp(y, -1, 1);
      dirty = true;
    },
    pointerLeave() {
      light.tx = 0;
      light.ty = 0;
      dirty = true;
    },
    // ── turntable ──
    dragStart() {
      drag.on = true;
      drag.vel = 0;
      yawAnim = null;
    },
    dragBy(dx) {
      const d = dx * 0.0085;
      userYaw[dragTarget()] += d;
      drag.vel = d * 60;
      onYaw(userYaw[dragTarget()]);
    },
    dragEnd() {
      drag.on = false;
      drag.vel = THREE.MathUtils.clamp(drag.vel, -8, 8) * 0.55;
    },
    nudge(dYaw) {
      const id = dragTarget();
      yawAnim = { id, from: userYaw[id], to: userYaw[id] + dYaw, start: performance.now(), dur: reducedMotion ? 1 : 420 };
    },
    resetYaw() {
      const id = dragTarget();
      yawAnim = { id, from: userYaw[id], to: Math.round(userYaw[id] / TAU) * TAU, start: performance.now(), dur: reducedMotion ? 1 : 700 };
    },
    spin() {
      drag.vel = 0;
      const id = dragTarget();
      const base = yawAnim && yawAnim.id === id ? yawAnim.to : userYaw[id];
      yawAnim = { id, from: userYaw[id], to: base + TAU, start: performance.now(), dur: reducedMotion ? 1200 : 2800 };
    },
    flip(toBack) {
      drag.vel = 0;
      const id = dragTarget();
      const y = userYaw[id];
      const to = toBack ? Math.round((y - Math.PI) / TAU) * TAU + Math.PI : Math.round(y / TAU) * TAU;
      yawAnim = { id, from: y, to, start: performance.now(), dur: reducedMotion ? 1 : 1100 };
    },
    isBackFacing() {
      return Math.abs(normalizeYaw(userYaw[dragTarget()])) > Math.PI / 2;
    },
    setPack(id) {
      if (!PACKS[id] || destroyed) return;
      buildPack(id);
      if (id !== selected) {
        // swap only when it would be seen; otherwise just change the subject
        swap = reducedMotion || !active || shot.range < 0.5 ? null : { from: selected, start: performance.now(), dur: SWAP_MS };
      }
      selected = id;
      dirty = true;
      onYaw(userYaw[dragTarget()]);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      cancelWarmup();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      try { disposeAll(); } catch (err) { /* context may already be gone */ }
    },
  };
}
