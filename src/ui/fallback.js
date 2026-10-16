import { createPackArt } from '../scene/packArt.js';

// Static presentation for browsers without WebGL: a CSS 3D box wearing the
// same redrawn packaging artwork. Still draggable, still switches packs.

const cache = {};

function artFor(id) {
  if (!cache[id]) {
    const art = createPackArt(id, { ppu: 520, mr: false });
    cache[id] = {
      front: art.color.front.toDataURL('image/jpeg', 0.9),
      side: art.color.side.toDataURL('image/jpeg', 0.9),
      top: art.color.top.toDataURL('image/jpeg', 0.9),
    };
  }
  return cache[id];
}

export function createFallback() {
  const root = document.documentElement;
  root.classList.add('no-webgl');
  const box = document.getElementById('fallbackBox');
  const faces = {
    front: box.querySelector('.fb-front'),
    side: box.querySelector('.fb-side'),
    top: box.querySelector('.fb-top'),
  };
  let yaw = -24;
  let pitch = 6;

  function apply() {
    box.style.setProperty('--ry', `${yaw}deg`);
    box.style.setProperty('--rx', `${pitch}deg`);
  }

  function setPack(id) {
    const a = artFor(id);
    for (const k of Object.keys(faces)) faces[k].style.backgroundImage = `url(${a[k]})`;
    box.classList.remove('is-pack-3', 'is-pack-6', 'is-pack-16');
    box.classList.add(`is-pack-${id}`);
  }

  setPack(3);
  apply();

  return {
    setPack,
    dragBy(dx, dy) {
      yaw = Math.max(-80, Math.min(30, yaw + dx * 0.35));
      pitch = Math.max(-12, Math.min(20, pitch - dy * 0.15));
      apply();
    },
    nudge(d) {
      yaw = Math.max(-80, Math.min(30, yaw + d));
      apply();
    },
    reset() {
      yaw = -24;
      pitch = 6;
      apply();
    },
  };
}
