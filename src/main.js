import { createStage } from './scene/stage.js';
import { createFallback } from './ui/fallback.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
if (isTouch) root.classList.add('is-touch');

const OFFICIAL_BUY = 'https://www.durex.com.cn/buy';
const PACK_IDS = ['3', '6', '16'];

// Neutral by design: the three packs differ only in count. No "best for"
// recommendations — nothing verified supports one.
const PACK_COPY = {
  3: { box: '方形盒装', note: '盒面依据官方产品图重新绘制，仅作示意。' },
  6: { box: '竖长盒装', note: '盒面依据官方产品图重新绘制，仅作示意。' },
  16: { box: '盒型未经核对', note: '16只装外包装本页尚未核对，画面中的盒型为示意，请以官方渠道实物为准。' },
};

let currentPack = 3;

// ───────────── product stage (3D, or static fallback) ─────────────

const yawListeners = [];
const pullListeners = [];
let anchorFn = () => {};
let stage = null;
let fallback = null;

function useFallback() {
  if (stage) {
    try { stage.destroy(); } catch (err) { /* context already gone */ }
  }
  stage = null;
  root.classList.remove('scene-ready');
  if (!fallback) fallback = createFallback();
  fallback.setPack(currentPack);
}

try {
  stage = createStage($('#scene'), {
    reducedMotion,
    isTouch,
    onYaw: (y) => yawListeners.forEach((fn) => fn(y)),
    onPull: (p) => pullListeners.forEach((fn) => fn(p)),
    onAnchor: (x, y, vis) => anchorFn(x, y, vis),
    onFirstFrame: () => root.classList.add('scene-ready'),
    onLost: () => useFallback(),
  });
} catch (err) {
  stage = null;
}
if (!stage) useFallback();

// ───────────── layout cache & scroll choreography ─────────────

const hero = $('#hero');
const feel = $('#feel');
const specs = $('#specs');
const faq = $('#faq');
const header = $('#siteHeader');
const pullCopy = $('#pullCopy');
const pullInside = $('#pullInside');
const pullControl = $('#pullControl');
const navLinks = $$('[data-nav]');
const sectionsForNav = ['hero', 'feel', 'specs', 'packs', 'faq', 'buy'].map((id) => document.getElementById(id));

let L = {};
function measure() {
  const vh = window.innerHeight;
  L = {
    vh,
    feelTop: feel.offsetTop,
    sticky: Math.max(1, feel.offsetHeight - vh),
    specsTop: specs.offsetTop,
    specsH: specs.offsetHeight,
  };
}

// Shots: 0 hero · 1 open (the pull lives here) · 2 range.
// Scroll lifts the camera and opens the lid; the sticky chapter then holds
// on the open carton for as long as the viewer wants to play.
function progressFromScroll(y) {
  if (y < L.feelTop) return clamp(y / Math.max(1, L.feelTop), 0, 1);
  if (y < L.feelTop + L.sticky) return 1;
  // the move to the range happens while the specs sheet covers the stage
  const a = L.specsTop;
  const b = L.specsTop + L.specsH - L.vh;
  if (b <= a) return y >= a ? 2 : 1;
  return 1 + clamp((y - a) / (b - a), 0, 1);
}

let lastT = 0;
let lastPull = 0;
function applyBeats() {
  // the chapter copy is complete from the start; taking a sachet out only
  // brings the "what is inside" panel forward
  const near = 1 - smoothstep(0.18, 0.42, Math.abs(lastT - 1));
  const p = stage ? lastPull : 1;
  const done = smoothstep(0.75, 0.98, p);
  pullCopy.style.setProperty('--o', near.toFixed(3));
  pullCopy.style.setProperty('--done', done.toFixed(3));
  pullCopy.classList.toggle('is-visible', near > 0.01);
  pullCopy.inert = near < 0.5;
  pullInside.classList.toggle('is-on', done > 0.5);
  pullControl.classList.toggle('is-visible', near > 0.5 && !!stage);
}

let lastActiveNav = '';
function onScroll() {
  const y = window.scrollY;
  const t = progressFromScroll(y);
  lastT = t;

  if (stage) {
    stage.setProgress(t);
    const sr = specs.getBoundingClientRect();
    const fr = faq.getBoundingClientRect();
    const covered = (sr.top <= 0 && sr.bottom >= L.vh) || fr.top <= 0;
    stage.setActive(!covered);
  }

  applyBeats();

  header.classList.toggle('is-solid', y > 24);
  const probe = header.offsetHeight;
  const lightUnder = [specs, faq].some((s) => {
    const r = s.getBoundingClientRect();
    return r.top <= probe && r.bottom > probe;
  });
  header.classList.toggle('on-light', lightUnder);

  const mid = L.vh * 0.45;
  let active = '';
  for (const s of sectionsForNav) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) active = s.id;
  }
  if (active !== lastActiveNav) {
    lastActiveNav = active;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === active));
  }
}

let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    onScroll();
  });
}, { passive: true });

function relayout() {
  measure();
  if (stage) stage.resize();
  onScroll();
}
window.addEventListener('resize', relayout);
new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
relayout();

// ───────────── navigation: smooth anchors with real history ─────────────

function scrollToTarget(el, push = true, hash = null) {
  if (!el) return;
  const top = el === hero ? 0 : el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  if (push && hash && location.hash !== hash) history.pushState({ hash }, '', hash);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const hash = a.getAttribute('href');
  const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
  if (!target) return;
  e.preventDefault();
  closeMenu(false);
  scrollToTarget(target, true, hash);
  if (target.id !== 'hero') target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  const el = id ? document.getElementById(id) : hero;
  scrollToTarget(el || hero, false);
});

$('#toTop').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  if (location.hash) history.pushState({}, '', location.pathname + location.search);
  $('.brand').focus({ preventScroll: true });
});

// ───────────── mobile menu ─────────────

const menu = $('#menu');
const menuToggle = $('#menuToggle');
const menuLabel = $('.menu-toggle-label');
let lastFocus = null;

function openMenu() {
  lastFocus = document.activeElement;
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('is-open'));
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', '关闭菜单');
  menuLabel.textContent = '关闭';
  document.body.classList.add('menu-open');
  setTimeout(() => $('a', menu).focus(), 60);
}
function closeMenu(restoreFocus = true) {
  if (menu.hidden) return;
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', '打开菜单');
  menuLabel.textContent = '菜单';
  document.body.classList.remove('menu-open');
  setTimeout(() => { menu.hidden = true; }, reducedMotion ? 0 : 320);
  if (restoreFocus && lastFocus) lastFocus.focus();
}
menuToggle.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
$('[data-menu-close]').addEventListener('click', () => closeMenu());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) closeMenu();
  if (e.key === 'Tab' && !menu.hidden) {
    const items = [menuToggle, ...$$('a, button', menu)];
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  }
});
window.addEventListener('resize', () => { if (window.innerWidth > 1080) closeMenu(false); });

// ───────────── product exploration: drag, keys, spin, flip ─────────────

const zones = $$('[data-drag-zone]');
const flipBtn = $('#flipBtn');

function yawText(deg) {
  const a = Math.abs(deg);
  if (a < 35) return '正面';
  if (a > 145) return '背面';
  return deg > 0 ? '右侧面' : '左侧面';
}
function syncYaw(y) {
  const deg = Math.round(((y * 180) / Math.PI + 540) % 360 - 180);
  zones.forEach((z) => {
    z.setAttribute('aria-valuenow', String(deg));
    z.setAttribute('aria-valuetext', yawText(deg));
  });
  const back = Math.abs(deg) > 90;
  flipBtn.setAttribute('aria-pressed', String(back));
  flipBtn.textContent = back ? '回到正面' : '看背面';
}
yawListeners.push(syncYaw);

function markInteracted() {
  zones.forEach((z) => z.classList.add('has-interacted'));
}

zones.forEach((zone) => {
  let dragging = false;
  let lx = 0;
  let ly = 0;
  let moved = 0;
  zone.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    dragging = true;
    moved = 0;
    lx = e.clientX;
    ly = e.clientY;
    zone.setPointerCapture(e.pointerId);
    zone.classList.add('is-dragging');
    if (stage) stage.dragStart();
  });
  zone.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) markInteracted();
    if (stage) stage.dragBy(dx, dy);
    else if (fallback) fallback.dragBy(dx, dy);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    zone.classList.remove('is-dragging');
    if (stage) stage.dragEnd();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);

  zone.addEventListener('keydown', (e) => {
    const step = Math.PI / 6;
    let handled = true;
    if (e.key === 'ArrowLeft') stage ? stage.nudge(-step) : fallback.nudge(-15);
    else if (e.key === 'ArrowRight') stage ? stage.nudge(step) : fallback.nudge(15);
    else if (e.key === 'Home') stage ? stage.resetYaw() : fallback.reset();
    else handled = false;
    if (handled) {
      e.preventDefault();
      markInteracted();
    }
  });
});

$$('[data-spin]').forEach((b) => b.addEventListener('click', () => {
  markInteracted();
  if (stage) stage.spin();
  else if (fallback) fallback.reset();
}));

flipBtn.addEventListener('click', () => {
  markInteracted();
  if (!stage) {
    if (fallback) fallback.nudge(180);
    return;
  }
  stage.flip(!stage.isBackFacing());
});

// ───────────── the pull: 靠近多少，由你决定 ─────────────
// Drag up on the open carton to draw a sachet out and toward you; the camera
// follows it onto the crimped seal. Release holds the distance, drag down
// pushes it back. The slider mirrors it for keyboard and assistive tech.

const pullZone = $('#pullZone');
const pullHint = $('#pullHint');
const pullSlider = $('#pullSlider');
const pullAuto = $('#pullAuto');
const pullAutoLabel = $('#pullAutoLabel');

function pullText(p) {
  if (p < 0.03) return '在盒中';
  if (p < 0.3) return '正在取出';
  if (p < 0.95) return '拿在手边';
  return '已取出';
}
pullListeners.push((p) => {
  lastPull = p;
  pullSlider.style.setProperty('--p', p.toFixed(4));
  pullSlider.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  pullSlider.setAttribute('aria-valuetext', pullText(p));
  const out = stage ? stage.getPullTarget() > 0.5 : false;
  pullAutoLabel.textContent = out ? '放回盒中' : '取出一只';
  applyBeats();
});

let hintShown = 0;
anchorFn = (x, y, vis) => {
  const show = vis * (lastPull < 0.03 ? 1 : 0);
  if (Math.abs(show - hintShown) > 0.01 || show > 0) {
    hintShown = show;
    const px = (x * 0.5 + 0.5) * window.innerWidth;
    const py = (-y * 0.5 + 0.5) * window.innerHeight;
    pullHint.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    pullHint.style.opacity = String(Math.max(0, Math.min(1, (show - 0.4) / 0.6)).toFixed(3));
  }
};

const pullSpan = () => Math.max(260, window.innerHeight * 0.55);
function bindPullDrag(el, { fromPosition = false } = {}) {
  let on = false;
  let startY = 0;
  let startP = 0;
  const setFromY = (clientY) => {
    if (fromPosition) {
      const r = el.getBoundingClientRect();
      return clamp(1 - (clientY - r.top) / r.height, 0, 1);
    }
    return clamp(startP + (startY - clientY) / pullSpan(), 0, 1);
  };
  el.addEventListener('pointerdown', (e) => {
    if (!stage || e.button !== 0) return;
    // over the carton only a mouse or pen pulls; a finger keeps scrolling the page
    if (!fromPosition && e.pointerType === 'touch') return;
    on = true;
    startY = e.clientY;
    startP = stage.getPullTarget();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or stale pointer */ }
    el.classList.add('is-pulling');
    root.classList.add('is-pulling');
    if (fromPosition) stage.setPull(setFromY(e.clientY));
  });
  el.addEventListener('pointermove', (e) => {
    if (!on || !stage) return;
    stage.setPull(setFromY(e.clientY));
    if (e.pointerType !== 'mouse') {
      stage.pointerMove((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    }
  });
  const end = () => {
    if (!on) return;
    on = false;
    el.classList.remove('is-pulling');
    root.classList.remove('is-pulling');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}
bindPullDrag(pullZone);
bindPullDrag(pullSlider, { fromPosition: true });
pullZone.addEventListener('pointerenter', () => stage && stage.pullHover(true));
pullZone.addEventListener('pointerleave', () => stage && stage.pullHover(false));

pullSlider.addEventListener('keydown', (e) => {
  if (!stage) return;
  const p = stage.getPullTarget();
  const steps = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 };
  if (e.key in steps) stage.setPull(p + steps[e.key], { follow: false });
  else if (e.key === 'Home') stage.setPull(0, { follow: false });
  else if (e.key === 'End') stage.setPull(1, { follow: false });
  else return;
  e.preventDefault();
});
pullAuto.addEventListener('click', () => {
  if (!stage) return;
  stage.setPull(stage.getPullTarget() > 0.5 ? 0 : 1, { follow: false });
});

// window light follows the pointer (mouse anywhere; touch inside the chapter)
window.addEventListener('pointermove', (e) => {
  if (!stage || e.pointerType !== 'mouse') return;
  stage.pointerMove((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => stage && stage.pointerLeave());
const feelTouch = $('#feelTouch');
['pointerdown', 'pointermove'].forEach((type) => feelTouch.addEventListener(type, (e) => {
  if (!stage || e.pointerType === 'mouse') return;
  stage.pointerMove((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
}, { passive: true }));
['pointerup', 'pointercancel'].forEach((type) => feelTouch.addEventListener(type, () => stage && stage.pointerLeave()));

// ───────────── pack selection ─────────────

const radios = $$('input[name="pack"]');
const picker = $('.pack-picker');
const summary = $('#packSummary');
const ps = (k) => $(`[data-ps="${k}"]`, summary);

function readSavedPack() {
  const q = new URLSearchParams(location.search).get('pack');
  if (PACK_IDS.includes(q)) return Number(q);
  try {
    const s = localStorage.getItem('air-pack');
    if (PACK_IDS.includes(s)) return Number(s);
  } catch (err) { /* storage unavailable */ }
  return 3;
}

function selectPack(n, { animate = true, persist = true } = {}) {
  if (!PACK_IDS.includes(String(n))) n = 3;
  currentPack = n;
  const c = PACK_COPY[n];
  radios.forEach((r) => { r.checked = Number(r.value) === n; });
  picker.style.setProperty('--i', String([3, 6, 16].indexOf(n)));
  ps('title').textContent = `杜蕾斯隐薄空气套 AiR Feel · ${n}只装`;
  ps('count').textContent = `${n} 只`;
  ps('box').textContent = c.box;
  ps('note').textContent = c.note;
  ps('route').textContent = `将打开杜蕾斯官网“精选店铺”页；请在店内确认是否为 ${n}只装。`;
  ps('buy').href = OFFICIAL_BUY;
  ps('buy').setAttribute('aria-label', `打开杜蕾斯官方店铺列表（新窗口），在店内确认 ${n}只装`);
  if (animate) {
    summary.classList.remove('is-swapping');
    void summary.offsetWidth;
    summary.classList.add('is-swapping');
  }
  if (stage) stage.setPack(n);
  else if (fallback) fallback.setPack(n);
  if (persist) {
    try { localStorage.setItem('air-pack', String(n)); } catch (err) { /* ignore */ }
    const url = new URL(location.href);
    url.searchParams.set('pack', String(n));
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
}
radios.forEach((r) => r.addEventListener('change', () => selectPack(Number(r.value))));
selectPack(readSavedPack(), { animate: false, persist: false });

const copyBtn = $('#copyName');
const copyLabel = $('#copyLabel');
copyBtn.addEventListener('click', async () => {
  const text = `杜蕾斯隐薄空气套 AiR Feel ${currentPack}只装`;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  copyLabel.textContent = ok ? '已复制，可到官方店铺搜索' : `请手动复制：${text}`;
  clearTimeout(copyBtn._t);
  copyBtn._t = setTimeout(() => { copyLabel.textContent = '复制商品名'; }, 2600);
});

// ───────────── FAQ accordion ─────────────

const qaButtons = $$('.qa button');
const toggleAll = $('#faqToggleAll');

function setQA(btn, open, animate = true) {
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  if (open === isOpen) return;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    panel.hidden = false;
    if (animate && !reducedMotion) {
      const h = panel.scrollHeight;
      panel.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.22,1,0.36,1)' });
    }
  } else if (animate && !reducedMotion) {
    const h = panel.scrollHeight;
    const anim = panel.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.65,0,0.35,1)' });
    anim.onfinish = () => { if (btn.getAttribute('aria-expanded') === 'false') panel.hidden = true; };
  } else {
    panel.hidden = true;
  }
}
function syncToggleAll() {
  const allOpen = qaButtons.every((b) => b.getAttribute('aria-expanded') === 'true');
  toggleAll.textContent = allOpen ? '全部收起' : '全部展开';
  toggleAll.setAttribute('aria-pressed', String(allOpen));
}
qaButtons.forEach((b) => b.addEventListener('click', () => {
  setQA(b, b.getAttribute('aria-expanded') !== 'true');
  syncToggleAll();
}));
toggleAll.addEventListener('click', () => {
  const open = !qaButtons.every((b) => b.getAttribute('aria-expanded') === 'true');
  qaButtons.forEach((b) => setQA(b, open));
  syncToggleAll();
});
setQA(qaButtons[0], true, false);
syncToggleAll();

// ───────────── structure drawing ─────────────

const profile = $('.profile');
$$('.draw', profile).forEach((p) => {
  try { p.style.setProperty('--len', String(Math.ceil(p.getTotalLength()) + 2)); } catch (err) { /* ignore */ }
});
if (!reducedMotion && 'IntersectionObserver' in window) {
  profile.classList.add('is-armed');
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      profile.classList.add('is-drawn');
      io.disconnect();
    }
  }, { threshold: 0.3 });
  io.observe(profile);
}

// ───────────── entrance ─────────────

requestAnimationFrame(() => {
  root.classList.remove('js-loading');
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) setTimeout(() => scrollToTarget(el, false), 30);
  }
});
// the page is readable without the stage; reveal whatever is ready
setTimeout(() => root.classList.add('scene-ready'), 2500);
