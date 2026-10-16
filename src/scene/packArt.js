// Packaging artwork for Durex AiR Feel, redrawn as vector canvas art so it stays
// sharp at any size. Layout calibrated against the official 3- and 6-pack photos:
// silver-white pearl board, blue durex pill, hairline "AiR", Chinese product name,
// silver wave bundle near the base, blue 杜蕾斯 pill. 16-pack proportions are a
// labelled approximation (no verified photo).

export const PACKS = {
  3: { id: 3, w: 1.0, h: 1.36, d: 0.3, count: '3只装' },
  6: { id: 6, w: 0.82, h: 1.76, d: 0.34, count: '6只装' },
  16: { id: 16, w: 1.3, h: 1.62, d: 0.52, count: '16只装' },
};

const FONT_CN = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const FONT_LATIN = '"Helvetica Neue", "Avenir Next", Arial, sans-serif';
let roundedFont = null;

function detectRoundedFont() {
  if (roundedFont) return roundedFont;
  const c = document.createElement('canvas').getContext('2d');
  const probe = 'durex durex';
  c.font = '40px monospace';
  const base = c.measureText(probe).width;
  const candidates = ['"Arial Rounded MT Bold"', '"Arial Rounded MT"', '"VAG Rounded"'];
  for (const f of candidates) {
    c.font = `40px ${f}, monospace`;
    if (Math.abs(c.measureText(probe).width - base) > 0.5) {
      roundedFont = `${f}`;
      return roundedFont;
    }
  }
  roundedFont = 'fallback';
  return roundedFont;
}

function durexFont(px) {
  const f = detectRoundedFont();
  return f === 'fallback' ? `700 ${px}px "Helvetica Neue", Arial, sans-serif` : `${px}px ${f}, Arial, sans-serif`;
}

// Material channel colours for the roughness (G) / metalness (B) map.
// Pearl board, not a mirror: mostly diffuse white with a metallic sheen,
// so it reads silver-white under the key instead of reflecting the blue room.
const MR = {
  foil: 'rgb(0, 108, 50)',    // rough .42, metal .2 — laminated board, not metal
  foilHi: 'rgb(0, 90, 84)',   // the printed pearl sweep, a little brighter
  ink: 'rgb(0, 128, 6)',      // printed blue / black ink
  white: 'rgb(0, 118, 0)',    // opaque white ink
  matte: 'rgb(0, 150, 10)',
};

const BLUE_TOP = '#3b74e2';
const BLUE_MID = '#1748ba';
const BLUE_LOW = '#0c3390';
const INK = '#14161c';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ───────────── shared painters ─────────────

function paintFoil(ctx, W, H, mode, opts = {}) {
  if (mode === 'mr') {
    ctx.fillStyle = MR.foil;
    ctx.fillRect(0, 0, W, H);
    // brighter, smoother metal along the satin sweep
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createLinearGradient(0, H, W, 0);
    g.addColorStop(0.25, 'rgba(0,62,214,0)');
    g.addColorStop(0.45, MR.foilHi);
    g.addColorStop(0.65, 'rgba(0,62,214,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  const base = ctx.createLinearGradient(0, 0, W * 0.35, H);
  base.addColorStop(0, '#f3f5fa');
  base.addColorStop(0.42, '#e6eaf2');
  base.addColorStop(0.78, '#d7dce7');
  base.addColorStop(1, '#e4e8f0');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // faint lavender/blue pearl tint drifting across the board
  const tint = ctx.createRadialGradient(W * 0.85, H * 0.2, 0, W * 0.85, H * 0.2, Math.max(W, H) * 0.9);
  tint.addColorStop(0, 'rgba(206, 214, 244, 0.55)');
  tint.addColorStop(1, 'rgba(206, 214, 244, 0)');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);

  // satin guilloche: long fine curves sweeping bottom-left → top-right
  const rnd = seeded(opts.seed || 7);
  const n = opts.lines || 150;
  const lw = Math.max(0.6, W * 0.0011);
  ctx.save();
  ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y0 = H * (0.25 + 1.1 * t);
    const y1 = H * (-0.35 + 1.0 * t);
    const cx = W * (0.42 + 0.12 * Math.sin(t * 9.0));
    const cy = H * (0.55 + 0.3 * t + 0.04 * Math.sin(t * 23));
    ctx.beginPath();
    ctx.moveTo(-W * 0.1, y0);
    ctx.quadraticCurveTo(cx, cy, W * 1.1, y1);
    const light = i % 3 !== 0;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.16 + rnd() * 0.18})` : `rgba(122,134,162,${0.05 + rnd() * 0.07})`;
    ctx.stroke();
  }
  ctx.restore();

  // printed pearl sheen band
  const sheen = ctx.createLinearGradient(0, H * 0.9, W, H * 0.1);
  sheen.addColorStop(0.2, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
}

// silver wave bundle near the base of the front (key motif of the AiR box)
function paintWave(ctx, W, H, mode, yTop, yBottom) {
  if (mode === 'mr') {
    ctx.save();
    ctx.globalAlpha = 0.85;
    const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
    g.addColorStop(0, 'rgba(0,62,214,0)');
    g.addColorStop(0.5, MR.foilHi);
    g.addColorStop(1, 'rgba(0,62,214,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, yTop, W, yBottom - yTop);
    ctx.restore();
    return;
  }
  const span = yBottom - yTop;
  // soft luminous body beneath the lines
  ctx.save();
  const glow = ctx.createLinearGradient(0, yTop, W, yBottom);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(-W * 0.05, yTop + span * 0.25);
  ctx.bezierCurveTo(W * 0.3, yTop + span * 0.95, W * 0.62, yTop + span * 0.05, W * 1.05, yTop + span * 0.35);
  ctx.lineTo(W * 1.05, yTop + span * 0.75);
  ctx.bezierCurveTo(W * 0.66, yTop + span * 0.45, W * 0.32, yTop + span * 1.25, -W * 0.05, yTop + span * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const n = 64;
  ctx.save();
  ctx.lineWidth = Math.max(0.7, W * 0.0013);
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1);
    const a = yTop + span * (0.2 + 0.45 * t);
    const b = yTop + span * (0.25 + 0.5 * (1 - t));
    ctx.beginPath();
    ctx.moveTo(-W * 0.05, a);
    ctx.bezierCurveTo(
      W * 0.3, yTop + span * (0.95 + 0.25 * t),
      W * 0.6, yTop + span * (0.05 - 0.15 * t + 0.4 * t * t),
      W * 1.05, b,
    );
    const edge = Math.sin(t * Math.PI);
    if (j % 4 === 0) ctx.strokeStyle = `rgba(116,128,158,${0.1 + 0.18 * edge})`;
    else ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.5 * edge})`;
    ctx.stroke();
  }
  ctx.restore();
}

function paintPill(ctx, cx, cy, w, h, mode, { ring = true, text = 'durex', font = null, reg = true } = {}) {
  const r = h / 2;
  const ringW = h * 0.085;
  if (ring) {
    roundRectPath(ctx, cx - w / 2 - ringW, cy - h / 2 - ringW, w + ringW * 2, h + ringW * 2, r + ringW);
    ctx.fillStyle = mode === 'mr' ? MR.white : '#ffffff';
    ctx.fill();
    if (mode !== 'mr') {
      ctx.lineWidth = Math.max(0.8, h * 0.012);
      ctx.strokeStyle = 'rgba(120,134,168,0.45)';
      ctx.stroke();
    }
  }
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
  if (mode === 'mr') {
    ctx.fillStyle = MR.ink;
    ctx.fill();
  } else {
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, BLUE_TOP);
    g.addColorStop(0.55, BLUE_MID);
    g.addColorStop(1, BLUE_LOW);
    ctx.fillStyle = g;
    ctx.fill();
    // glossy top lip
    ctx.save();
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
    ctx.clip();
    const lip = ctx.createLinearGradient(0, cy - h / 2, 0, cy);
    lip.addColorStop(0, 'rgba(255,255,255,0.32)');
    lip.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lip;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h / 2);
    ctx.restore();
  }
  ctx.fillStyle = mode === 'mr' ? MR.white : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (text === 'durex') {
    const px = Math.round(h * 0.66);
    ctx.font = font || durexFont(px);
    let tw = ctx.measureText(text).width;
    const maxW = w * 0.78;
    if (tw > maxW) {
      ctx.font = durexFont(Math.round(px * maxW / tw));
      tw = maxW;
    }
    ctx.fillText(text, cx, cy + h * 0.2);
  } else {
    ctx.font = font || `600 ${Math.round(h * 0.56)}px ${FONT_CN}`;
    ctx.fillText(text, cx, cy + h * 0.2);
  }
  if (reg && mode !== 'mr') {
    ctx.font = `${Math.round(h * 0.2)}px ${FONT_LATIN}`;
    ctx.fillStyle = 'rgba(40,50,80,0.8)';
    ctx.fillText('®', cx + w / 2 + ringW + h * 0.14, cy - h * 0.34);
  }
}

// hairline geometric "AiR" (A without crossbar, as on pack)
function paintAiR(ctx, cx, top, c, mode, stroke) {
  const lw = stroke;
  const aW = 0.98 * c;
  const g1 = 0.24 * c;
  const g2 = 0.26 * c;
  const rW = 0.66 * c;
  const total = aW + g1 + lw + g2 + rW;
  const x0 = cx - total / 2;
  const base = top + c;
  ctx.save();
  ctx.strokeStyle = mode === 'mr' ? MR.ink : INK;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 12;
  // A
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.lineTo(x0 + aW / 2, top + lw * 0.2);
  ctx.lineTo(x0 + aW, base);
  ctx.stroke();
  // i
  const ix = x0 + aW + g1 + lw / 2;
  ctx.beginPath();
  ctx.moveTo(ix, base);
  ctx.lineTo(ix, top + c * 0.36);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ix, top + c * 0.17, lw * 1.05, 0, Math.PI * 2);
  ctx.fill();
  // R
  const rx = ix + lw / 2 + g2 + lw / 2;
  const bowlH = c * 0.52;
  const bowlR = bowlH / 2;
  const bowlStraight = rW - bowlR - lw * 0.5;
  ctx.beginPath();
  ctx.moveTo(rx, base);
  ctx.lineTo(rx, top + lw / 2);
  ctx.lineTo(rx + bowlStraight, top + lw / 2);
  ctx.arc(rx + bowlStraight, top + lw / 2 + bowlR - lw / 2, bowlR - lw / 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(rx, top + bowlH - lw / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + bowlStraight * 0.62, top + bowlH - lw / 2);
  ctx.lineTo(rx + rW - lw * 0.2, base);
  ctx.stroke();
  ctx.restore();
  return { left: x0, right: x0 + total, base };
}

function text(ctx, str, x, y, font, color, mode, align = 'center', kind = 'ink') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = mode === 'mr' ? MR[kind] : color;
  ctx.fillText(str, x, y);
}

function edgeLines(ctx, W, H, mode) {
  if (mode === 'mr') return;
  const lw = Math.max(1, Math.min(W, H) * 0.004);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  ctx.strokeStyle = 'rgba(90,104,140,0.18)';
  ctx.lineWidth = lw * 0.6;
  ctx.strokeRect(lw * 1.6, lw * 1.6, W - lw * 3.2, H - lw * 3.2);
  ctx.restore();
}

// ───────────── faces ─────────────

function drawFront(ctx, W, H, pack, mode) {
  paintFoil(ctx, W, H, mode, { seed: 11 + pack.id, lines: Math.round(110 + H / W * 30) });
  const tall = H / W;
  // wave occupies the lower third
  const waveTop = H - W * (tall > 1.6 ? 0.78 : 0.62);
  paintWave(ctx, W, H, mode, waveTop, H - W * 0.08);

  const logoY = W * (tall > 1.6 ? 0.2 : 0.17);
  paintPill(ctx, W / 2, logoY, W * 0.43, W * 0.152, mode);

  const c = W * 0.25;
  const airTop = logoY + W * 0.16;
  const air = paintAiR(ctx, W / 2, airTop, c, mode, W * 0.0105);

  const cnSize = W * 0.082;
  const cnY = air.base + W * 0.115;
  const cnX = W / 2 + W * 0.035;
  ctx.font = `500 ${Math.round(cnSize)}px ${FONT_CN}`;
  const nameA = '隐薄';
  const nameB = '空气';
  const nameC = '套';
  const gap = cnSize * 0.35;
  const wa = ctx.measureText(nameA).width;
  const wb = ctx.measureText(nameB).width;
  const wc = ctx.measureText(nameC).width;
  const regW = cnSize * 0.32;
  const totalW = wa + gap + wb + regW + wc;
  let x = cnX - totalW / 2;
  text(ctx, nameA, x, cnY, `500 ${Math.round(cnSize)}px ${FONT_CN}`, INK, mode, 'left');
  x += wa + gap;
  text(ctx, nameB, x, cnY, `500 ${Math.round(cnSize)}px ${FONT_CN}`, INK, mode, 'left');
  x += wb;
  text(ctx, '®', x + regW * 0.5, cnY - cnSize * 0.55, `${Math.round(cnSize * 0.32)}px ${FONT_LATIN}`, INK, mode, 'center');
  x += regW;
  text(ctx, nameC, x, cnY, `500 ${Math.round(cnSize)}px ${FONT_CN}`, INK, mode, 'left');

  // hairline rule + count
  const ruleY = cnY + W * 0.045;
  ctx.fillStyle = mode === 'mr' ? MR.ink : 'rgba(20,22,28,0.85)';
  ctx.fillRect(cnX - totalW * 0.62, ruleY, totalW * 1.24, Math.max(1, W * 0.0028));
  text(ctx, pack.count, cnX, ruleY + W * 0.075, `400 ${Math.round(W * 0.056)}px ${FONT_CN}`, INK, mode);

  // bottom identity
  const pillY = H - W * 0.25;
  paintPill(ctx, W / 2, pillY, W * 0.25, W * 0.074, mode, { text: '杜蕾斯', ring: true, reg: true });
  text(ctx, '天然胶乳橡胶避孕套', W / 2, pillY + W * 0.1, `500 ${Math.round(W * 0.036)}px ${FONT_CN}`, INK, mode);
  text(ctx, 'Natural Latex Rubber Condom', W / 2, pillY + W * 0.145, `500 ${Math.round(W * 0.034)}px ${FONT_LATIN}`, INK, mode);

  edgeLines(ctx, W, H, mode);
}

function iconCircle(ctx, cx, cy, r, mode, kind) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = mode === 'mr' ? MR.white : 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = mode === 'mr' ? MR.ink : BLUE_MID;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.025;
  ctx.setLineDash([r * 0.05, r * 0.07]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'tip') {
    // straight-wall outline with reservoir tip
    const w = r * 0.62;
    const top = cy - r * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy + r * 0.42);
    ctx.lineTo(cx - w / 2, top + r * 0.32);
    ctx.quadraticCurveTo(cx - w / 2, top + r * 0.08, cx - r * 0.09, top + r * 0.06);
    ctx.lineTo(cx - r * 0.09, top - r * 0.08);
    ctx.lineTo(cx + r * 0.09, top - r * 0.08);
    ctx.lineTo(cx + r * 0.09, top + r * 0.06);
    ctx.quadraticCurveTo(cx + w / 2, top + r * 0.08, cx + w / 2, top + r * 0.32);
    ctx.lineTo(cx + w / 2, cy + r * 0.42);
    ctx.stroke();
  } else if (kind === 'drop') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.48);
    ctx.bezierCurveTo(cx + r * 0.42, cy - r * 0.02, cx + r * 0.36, cy + r * 0.44, cx, cy + r * 0.44);
    ctx.bezierCurveTo(cx - r * 0.36, cy + r * 0.44, cx - r * 0.42, cy - r * 0.02, cx, cy - r * 0.48);
    ctx.stroke();
  } else {
    // 52mm width mark
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx + r * 0.45, cy);
    ctx.moveTo(cx - r * 0.45, cy - r * 0.18);
    ctx.lineTo(cx - r * 0.45, cy + r * 0.18);
    ctx.moveTo(cx + r * 0.45, cy - r * 0.18);
    ctx.lineTo(cx + r * 0.45, cy + r * 0.18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSide(ctx, W, H, pack, mode) {
  paintFoil(ctx, W, H, mode, { seed: 31 + pack.id, lines: 60 });
  const bannerH = Math.min(H * 0.3, W * 1.25);
  // blue banner
  if (mode === 'mr') {
    ctx.fillStyle = MR.ink;
    ctx.fillRect(0, 0, W, bannerH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, bannerH);
    g.addColorStop(0, '#2a62d6');
    g.addColorStop(1, '#123fae');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, bannerH);
  }
  const cx = W / 2;
  // mini seal
  ctx.save();
  ctx.strokeStyle = mode === 'mr' ? MR.white : 'rgba(255,255,255,0.9)';
  ctx.lineWidth = W * 0.012;
  ctx.beginPath();
  ctx.arc(cx, bannerH * 0.22, W * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.07, bannerH * 0.22);
  ctx.lineTo(cx + W * 0.07, bannerH * 0.22);
  ctx.stroke();
  ctx.restore();
  const fs = W * 0.085;
  text(ctx, 'AiR Feel', cx, bannerH * 0.48, `300 ${Math.round(fs * 1.3)}px ${FONT_LATIN}`, '#fff', mode, 'center', 'white');
  text(ctx, '隐薄空气套', cx, bannerH * 0.64, `500 ${Math.round(fs)}px ${FONT_CN}`, '#fff', mode, 'center', 'white');
  text(ctx, '标称宽度 52mm', cx, bannerH * 0.79, `400 ${Math.round(fs * 0.82)}px ${FONT_CN}`, 'rgba(255,255,255,0.85)', mode, 'center', 'white');

  // dashed centre line
  if (mode !== 'mr') {
    ctx.save();
    ctx.strokeStyle = 'rgba(21,70,184,0.35)';
    ctx.lineWidth = Math.max(1, W * 0.008);
    ctx.setLineDash([W * 0.04, W * 0.035]);
    ctx.beginPath();
    ctx.moveTo(cx, bannerH + W * 0.08);
    ctx.lineTo(cx, H - W * 0.12);
    ctx.stroke();
    ctx.restore();
  }
  const icons = pack.id === 3 ? ['tip', 'drop'] : ['tip', 'drop', 'width'];
  const labels = { tip: '有储精囊', drop: '润滑型', width: '52mm' };
  const r = W * 0.3;
  const free = H - bannerH - W * 0.3;
  icons.forEach((k, i) => {
    const y = bannerH + W * 0.3 + free * ((i + 0.5) / icons.length) - r * 0.4;
    iconCircle(ctx, cx, y, r, mode, k);
    text(ctx, labels[k], cx, y + r + W * 0.16, `500 ${Math.round(W * 0.085)}px ${FONT_CN}`, BLUE_MID, mode);
  });
  edgeLines(ctx, W, H, mode);
}

function wrapLines(ctx, str, maxW) {
  const out = [];
  let line = '';
  for (const ch of str) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = ch;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

function drawBack(ctx, W, H, pack, mode) {
  paintFoil(ctx, W, H, mode, { seed: 51 + pack.id, lines: 80 });
  // lighter information panel
  if (mode !== 'mr') {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRectPath(ctx, W * 0.07, W * 0.3, W * 0.86, H - W * 0.5, W * 0.03);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = MR.matte;
    roundRectPath(ctx, W * 0.07, W * 0.3, W * 0.86, H - W * 0.5, W * 0.03);
    ctx.fill();
  }
  paintPill(ctx, W * 0.24, W * 0.15, W * 0.28, W * 0.1, mode, { reg: false });
  text(ctx, 'AiR', W * 0.9, W * 0.185, `200 ${Math.round(W * 0.11)}px ${FONT_LATIN}`, INK, mode, 'right');

  const left = W * 0.12;
  const maxW = W * 0.76;
  let y = W * 0.42;
  text(ctx, '杜蕾斯隐薄空气套', left, y, `600 ${Math.round(W * 0.062)}px ${FONT_CN}`, INK, mode, 'left');
  y += W * 0.065;
  text(ctx, `AiR Feel · ${pack.count}`, left, y, `400 ${Math.round(W * 0.042)}px ${FONT_LATIN}`, '#3a4560', mode, 'left');
  y += W * 0.06;
  ctx.fillStyle = mode === 'mr' ? MR.ink : 'rgba(21,70,184,0.6)';
  ctx.fillRect(left, y, maxW, Math.max(1, W * 0.003));
  y += W * 0.075;
  const rows = [
    ['标称宽度', '52mm'],
    ['主要成分', '天然橡胶胶乳'],
    ['结构', '直壁平面结构，有储精囊'],
    ['外观', '无色透明，有香味'],
    ['润滑', '润滑型，未添加杀精剂'],
    ['储存期', '5年'],
  ];
  const fs = Math.round(W * 0.04);
  rows.forEach(([k, v]) => {
    text(ctx, k, left, y, `400 ${fs}px ${FONT_CN}`, '#5d6880', mode, 'left');
    text(ctx, v, left + W * 0.22, y, `500 ${fs}px ${FONT_CN}`, INK, mode, 'left');
    y += W * 0.068;
  });
  y += W * 0.02;
  ctx.font = `400 ${Math.round(W * 0.034)}px ${FONT_CN}`;
  const usage = '正确使用避孕套能有效避孕，可降低感染艾滋病和其他性病的几率，目前没有一种避孕方式可达到100%有效避孕及预防性病和艾滋病的感染。';
  const lines = wrapLines(ctx, usage, maxW);
  const maxLines = Math.max(2, Math.floor((H - W * 0.36 - y) / (W * 0.052)));
  lines.slice(0, maxLines).forEach((ln) => {
    text(ctx, ln, left, y, `400 ${Math.round(W * 0.034)}px ${FONT_CN}`, '#3a4560', mode, 'left');
    y += W * 0.052;
  });
  text(ctx, '医疗器械注册证：鲁械注准20162180063', left, H - W * 0.27, `400 ${Math.round(W * 0.032)}px ${FONT_CN}`, '#3a4560', mode, 'left');
  text(ctx, '概念示意 · 以实物包装为准', W / 2, H - W * 0.09, `400 ${Math.round(W * 0.03)}px ${FONT_CN}`, 'rgba(60,70,100,0.6)', mode, 'center');

  // glue-flap seam near one vertical edge
  if (mode !== 'mr') {
    ctx.fillStyle = 'rgba(80,92,124,0.25)';
    ctx.fillRect(W * 0.035, 0, Math.max(1, W * 0.003), H);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(W * 0.035 + Math.max(1, W * 0.003), 0, Math.max(1, W * 0.002), H);
  }
  edgeLines(ctx, W, H, mode);
}

function drawTop(ctx, W, H, pack, mode) {
  paintFoil(ctx, W, H, mode, { seed: 71 + pack.id, lines: 40 });
  paintPill(ctx, W * 0.5, H * 0.5, H * 0.95, H * 0.33, mode, { reg: false });
  if (mode !== 'mr') {
    // tuck seams along the short edges and the front fold
    ctx.fillStyle = 'rgba(70,82,116,0.32)';
    const t = Math.max(1, H * 0.012);
    ctx.fillRect(H * 0.06, 0, t, H);
    ctx.fillRect(W - H * 0.06 - t, 0, t, H);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, H - t * 1.5, W, t);
  }
  edgeLines(ctx, W, H, mode);
}

function drawBottom(ctx, W, H, pack, mode) {
  paintFoil(ctx, W, H, mode, { seed: 91 + pack.id, lines: 30 });
  text(ctx, `AiR Feel · ${pack.count}`, W / 2, H * 0.58, `400 ${Math.round(H * 0.18)}px ${FONT_CN}`, '#3a4560', mode);
  edgeLines(ctx, W, H, mode);
}

/**
 * Builds every face canvas for one pack.
 * @param {number} packId 3 | 6 | 16
 * @param {{ppu?: number, mrScale?: number, mr?: boolean}} opts
 */
export function createPackArt(packId, { ppu = 1200, mrScale = 0.5, mr = true } = {}) {
  const pack = PACKS[packId];
  const sizes = {
    front: [pack.w, pack.h, drawFront],
    back: [pack.w, pack.h, drawBack],
    side: [pack.d, pack.h, drawSide],
    top: [pack.w, pack.d, drawTop],
    bottom: [pack.w, pack.d, drawBottom],
  };
  const out = { pack, color: {}, mr: {} };
  for (const [face, [w, h, fn]] of Object.entries(sizes)) {
    const c = makeCanvas(w * ppu, h * ppu);
    fn(c.getContext('2d'), c.width, c.height, pack, 'color');
    out.color[face] = c;
    if (mr) {
      const m = makeCanvas(w * ppu * mrScale, h * ppu * mrScale);
      fn(m.getContext('2d'), m.width, m.height, pack, 'mr');
      out.mr[face] = m;
    }
  }
  return out;
}
