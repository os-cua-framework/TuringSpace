import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';
import { UI_FONT } from '../core/panel.js';

export const TAU = Math.PI * 2;

export function kindsFor(pool, kinds, split, minTest = 1) {
  const f = splitIds(pool, kinds, minTest);
  const out = kinds.filter((k) => f(k) === split);
  return out.length ? out : kinds.slice(0, 1);
}

export function pickKind(st, pool, kinds, minTest = 1) {
  const L = kindsFor(pool, kinds, st.split, minTest);
  const id = L[Math.floor(st.rand() * L.length)];
  st.note(`${pool}:${id}`);
  return id;
}

const srgb = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
export function texItems(st, uses, extra = () => true) {
  const set = new Set(uses);
  return st.pool('tex', (t) => set.has(t.use) && extra(t));
}
export const texLum = (item) => (item ? 0.2126 * item.mean_lin[0] + 0.7152 * item.mean_lin[1] + 0.0722 * item.mean_lin[2] : 0.2);

export async function makeMat(st, item, { scale = [0.32, 0.55], rotate = true } = {}) {
  if (!item) return null;
  st.note(`tex:${item.id}`);
  const img = await loadImage('assets/' + item.file);
  const m = item.mean_lin;
  return {
    id: item.id, use: item.use, img, lum: texLum(item), rgb: [srgb(m[0]), srgb(m[1]), srgb(m[2])],
    scale: scale[0] + (scale[1] - scale[0]) * st.rand(),
    ox: Math.floor(st.rand() * 512), oy: Math.floor(st.rand() * 512),
    rot: rotate ? st.rand() * 360 : 0, _p: null, _pc: null,
  };
}
export function pattern(g, m) {
  if (m._pc !== g) {
    m._p = g.createPattern(m.img, 'repeat'); m._pc = g;
    if (m._p.setTransform && typeof DOMMatrix !== 'undefined') {
      m._p.setTransform(new DOMMatrix().translateSelf(m.ox, m.oy).rotateSelf(m.rot).scaleSelf(m.scale, m.scale));
    }
  }
  return m._p;
}
export function localPattern(g, m, x, y, angDeg, scale = m.scale) {
  const p = g.createPattern(m.img, 'repeat');
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(x, y).rotateSelf(angDeg).scaleSelf(scale, scale).translateSelf(m.ox, m.oy));
  return p;
}
export function fillMat(g, m, alpha = 1) {
  g.save(); g.globalAlpha *= alpha; g.fillStyle = pattern(g, m); g.fill(); g.restore();
}
export const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
export function mix(rgb, to, t) { return rgb.map((v, i) => Math.round(v + (to[i] - v) * t)); }

export function domeShade(g, x, y, r, k = 1) {
  const gr = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${0.32 * k})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)');
  gr.addColorStop(0.8, `rgba(0,0,0,${0.12 * k})`); gr.addColorStop(1, `rgba(0,0,0,${0.42 * k})`);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
}
export function rimShade(g, x, y, r, k = 1) {
  const gr = g.createRadialGradient(x, y, r * 0.55, x, y, r);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.35 * k})`);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
}
export function contactShadow(g, x, y, r, { dx = 2.5, dy = 3, a = 0.28, blur = 3 } = {}) {
  g.save();
  g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = 'rgba(0,0,0,1)'; g.fill();
  g.restore();
}
export function pathShadow(g, build, { dx = 2.5, dy = 3, a = 0.3, blur = 4 } = {}) {
  g.save();
  g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy;
  build(); g.fillStyle = '#000'; g.fill();
  g.restore();
}

export const DISC_KINDS = ['boulder', 'barrel', 'stump', 'planter', 'tire', 'hay', 'drum', 'column', 'well', 'spool'];
export function drawDiscObject(g, kind, o, mats, salt = 0) {
  const { x, y, r } = o;
  const circle = () => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
  if (kind === 'boulder') {
    circle(); fillMat(g, mats.stone);
    domeShade(g, x, y, r, 1.1);
    g.save(); circle(); g.clip();
    g.strokeStyle = 'rgba(30,25,20,.35)'; g.lineWidth = 1.2;
    for (let k = 0; k < 2; k++) {
      const a = (salt * 2.4 + k * 2.1) % TAU;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * r * 0.2, y + Math.sin(a + 0.6) * r * 0.2, x + Math.cos(a + 2.2) * r * 0.5, y + Math.sin(a + 2.2) * r * 0.5);
      g.stroke();
    }
    g.restore();
  } else if (kind === 'barrel' || kind === 'drum') {
    circle(); fillMat(g, mats.metal);
    rimShade(g, x, y, r, 0.9);
    g.strokeStyle = 'rgba(20,20,20,.55)'; g.lineWidth = Math.max(1.5, r * 0.09);
    g.beginPath(); g.arc(x, y, r * 0.84, 0, TAU); g.stroke();
    if (kind === 'barrel') {
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r * 0.76, 0, TAU); g.stroke();
      g.beginPath(); g.arc(x + r * 0.4, y - r * 0.25, Math.max(2, r * 0.13), 0, TAU); g.fillStyle = 'rgba(25,25,25,.6)'; g.fill();
    } else {
      for (const rr of [0.55, 0.3]) { g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r * rr, 0, TAU); g.stroke(); }
    }
    domeShade(g, x, y, r, 0.45);
  } else if (kind === 'stump') {
    circle(); fillMat(g, mats.wood);
    g.save(); circle(); g.clip();
    g.strokeStyle = 'rgba(45,28,15,.85)'; g.lineWidth = Math.max(2.5, r * 0.16);
    g.beginPath(); g.arc(x, y, r - g.lineWidth / 2, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(70,45,25,.35)'; g.lineWidth = 1;
    for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(x + 0.8 * Math.cos(salt + k), y + 0.8 * Math.sin(salt + k), r * 0.15 * k, 0, TAU); g.stroke(); }
    g.restore();
    domeShade(g, x, y, r, 0.35);
  } else if (kind === 'planter') {
    circle(); fillMat(g, mats.stone);
    domeShade(g, x, y, r, 0.6);
    g.beginPath(); g.arc(x, y, r * 0.74, 0, TAU); g.fillStyle = '#3b2a1c'; g.fill();
    g.beginPath(); g.arc(x, y, r * 0.74, 0, TAU); fillMat(g, mats.soil || mats.stone, 0.55);
    g.fillStyle = 'rgba(52,110,48,.92)';
    for (let k = 0; k < 7; k++) {
      const a = salt + k * TAU / 7;
      g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, r * 0.3, r * 0.12, a, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(30,70,30,.9)'; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill();
  } else if (kind === 'tire') {
    circle(); g.fillStyle = '#23252a'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (let k = 0; k < 28; k++) {
      const a = salt + k * TAU / 28;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82); g.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98); g.stroke();
    }
    g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); fillMat(g, mats.ground); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); g.stroke();
    domeShade(g, x, y, r, 0.5);
  } else if (kind === 'column') {
    circle(); fillMat(g, mats.stone);
    domeShade(g, x, y, r, 0.5);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.stroke();
    for (let k = 0; k < 12; k++) {
      const a = k * TAU / 12;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * 0.07, 0, TAU); g.fillStyle = 'rgba(0,0,0,.22)'; g.fill();
    }
  } else if (kind === 'well') {
    circle(); fillMat(g, mats.stone);
    domeShade(g, x, y, r, 0.6);
    g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU);
    const w = g.createRadialGradient(x - r * 0.15, y - r * 0.2, 1, x, y, r * 0.62);
    w.addColorStop(0, '#2e4a5c'); w.addColorStop(1, '#0d1a22'); g.fillStyle = w; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.ellipse(x - r * 0.18, y - r * 0.22, r * 0.18, r * 0.07, -0.5, 0, TAU); g.fillStyle = 'rgba(200,225,240,.35)'; g.fill();
  } else if (kind === 'spool') {
    circle(); fillMat(g, mats.wood);
    rimShade(g, x, y, r, 0.8);
    g.strokeStyle = 'rgba(40,25,10,.55)'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(x, y, r * 0.86, 0, TAU); g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fillStyle = 'rgba(20,14,8,.85)'; g.fill();
    for (let k = 0; k < 4; k++) {
      const a = salt + k * TAU / 4;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, Math.max(1.6, r * 0.07), 0, TAU); g.fillStyle = 'rgba(30,30,30,.8)'; g.fill();
    }
    domeShade(g, x, y, r, 0.3);
  } else {
    circle(); g.fillStyle = '#c8a24f'; g.fill();
    circle(); fillMat(g, mats.straw || mats.wood, 0.35);
    g.strokeStyle = 'rgba(120,85,30,.6)'; g.lineWidth = 1.2; g.beginPath();
    for (let t = 0; t < 1; t += 0.01) { const a = salt + t * 6 * TAU, rr = r * 0.95 * t; if (t === 0) g.moveTo(x, y); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.stroke();
    domeShade(g, x, y, r, 0.6);
  }
  g.strokeStyle = 'rgba(15,12,10,.75)'; g.lineWidth = 1.2; circle(); g.stroke();
}

export function letterBadge(g, x, y, text, { r = 11, fill = '#ffffff', ink = '#2c3e50', ring = 'rgba(20,30,40,.75)', dash = null, size = 10, alpha = 0.92 } = {}) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  g.globalAlpha = alpha; g.fillStyle = fill; g.fill(); g.globalAlpha = 1;
  if (dash) g.setLineDash(dash);
  g.strokeStyle = ring; g.lineWidth = 1.7; g.stroke(); g.setLineDash([]);
  g.fillStyle = ink; g.font = `700 ${size}px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y + 0.4);
  g.restore();
}

export function decorRng(st, tag) {
  let a = 0;
  for (let i = 0; i < tag.length; i++) a = (Math.imul(a, 31) + tag.charCodeAt(i)) | 0;
  a ^= Math.floor(st.rand() * 4294967296);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
