import { splitIds } from '../core/style.js';
import { loadImage } from '../core/assets.js';

export const PALETTES = [
  { id: 'pastel', c: ['#f7d774', '#f4a7a0', '#a8d5ba', '#a7c7e7', '#f6c28b', '#c9b6e4', '#b5e0dc', '#f2b5d4', '#d6e5a5'] },
  { id: 'classic', c: ['#fff275', '#ff9fc0', '#7fd1f7', '#9be59b', '#ffb870', '#c7a5f0', '#f4f1e4', '#ff8a80', '#80e0d0'] },
  { id: 'neon', c: ['#f5ff6b', '#ff6ec7', '#5ef2ff', '#7dff6b', '#ffa64d', '#b78cff', '#ff5c5c', '#4d9dff', '#e0e0e0'] },
  { id: 'muted', c: ['#e9d8a6', '#e07a6f', '#7fc8a9', '#8aa9d6', '#f2b880', '#b591d9', '#eeeeea', '#d9779a', '#b9d48b'] },
  { id: 'cardstock', c: ['#f2c14e', '#e07a5f', '#81b29a', '#5fa8d3', '#f4a261', '#9d8ec7', '#ece4d4', '#cf6f8f', '#7fb7be'] },
  { id: 'kraft', c: ['#d9b48f', '#b5654a', '#8fa36b', '#7f9cc0', '#f0dcb4', '#a98bbf', '#cfcfc2', '#e08e86', '#6fa58f'] },
  { id: 'spring', c: ['#fde68a', '#fca5a5', '#86efac', '#93c5fd', '#fdba74', '#c4b5fd', '#f9fafb', '#f9a8d4', '#5eead4'] },
  { id: 'deep', c: ['#e9c46a', '#e76f51', '#2a9d8f', '#457b9d', '#f4a261', '#9b5de5', '#f1faee', '#d62828', '#90be6d'] },
  { id: 'earth', c: ['#ddb892', '#9c6644', '#7f5539', '#a3b18a', '#3a5a40', '#ede0d4', '#cb997e', '#6b705c', '#e9c46a'] },
  { id: 'ocean', c: ['#caf0f8', '#48cae4', '#0077b6', '#03045e', '#ffd166', '#ef476f', '#06d6a0', '#f8f9fa', '#8338ec'] },
  { id: 'retro', c: ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1', '#f9f7f3', '#9d4edd'] },
];
const palSplit = splitIds('drawer_palette', PALETTES.map((p) => p.id), 3);
for (const p of PALETTES) p.split = palSplit(p.id);

function lab(h) {
  const n = parseInt(h.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const deltaE76 = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export const MIN_DE = 25;

export const NOTE_KINDS = ['sticky', 'index', 'graph', 'notepad', 'kraft', 'pinned', 'dogear'];
const kindSplit = splitIds('drawer_note_kind', NOTE_KINDS, 1);
const DESK_USES = new Set(['wood', 'stone', 'metal', 'fabric', 'floor', 'flat2d']);
const lumOf = (m) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];

export async function noteLook(st) {
  const desks = st.pool('tex', (t) => DESK_USES.has(t.use) && lumOf(t.mean_lin) >= 0.02 && lumOf(t.mean_lin) <= 0.45);
  const kinds = NOTE_KINDS.filter((k) => kindSplit(k) === st.split);
  const [ki, di] = st.primaryCombo('notes', [kinds.length, Math.max(1, desks.length)]);
  const desk = desks[di] || null;
  const kind = kinds[ki];
  st.note('drawer_note_kind:' + kind); if (desk) st.note('tex:' + desk.id);
  const paper = kind === 'kraft' ? st.pick('tex', (t) => t.use === 'flat2d' || t.use === 'fabric') : null;
  return {
    kind, desk, deskImg: desk ? await loadImage('assets/' + desk.file) : null,
    deskScale: 0.32 + st.rand() * 0.3, deskOff: [Math.floor(st.rand() * 512), Math.floor(st.rand() * 512)],
    paperImg: paper ? await loadImage('assets/' + paper.file) : null,
    deskLum: desk ? lumOf(desk.mean_lin) : 0.5,
    lineHue: `hsla(${Math.round(200 + st.rand() * 30)},${Math.round(st.rand() * 45)}%,40%,.32)`,
    tapeTilt: (st.rand() - 0.5) * 0.3,
  };
}

function pattern(g, img, scale, off) {
  const p = g.createPattern(img, 'repeat');
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(-off[0], -off[1]).scaleSelf(scale, scale));
  return p;
}

export function paintDesk(g, w, h, look) {
  if (!look.deskImg) { g.fillStyle = '#ebe7df'; g.fillRect(0, 0, w, h); return; }
  g.fillStyle = pattern(g, look.deskImg, look.deskScale, look.deskOff); g.fillRect(0, 0, w, h);
  if (look.deskLum > 0.3) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, w, h); }
  const F = 26, page = 'rgba(244,245,247,', fades = [[0, 0, 0, F, 0, 0, w, F], [0, h, 0, h - F, 0, h - F, w, F], [0, 0, F, 0, 0, 0, F, h], [w, 0, w - F, 0, w - F, 0, F, h]];
  for (const [ax, ay, bx, by, rx, ry, rw, rh] of fades) {
    const gr = g.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, page + '1)'); gr.addColorStop(1, page + '0)');
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  }
}

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

export function paintNote(g, c, look) {
  const { x, y, w, h } = c, k = look.kind;
  g.save();
  g.shadowColor = look.deskLum < 0.06 ? 'rgba(0,0,0,.55)' : 'rgba(40,30,10,.34)'; g.shadowBlur = 7; g.shadowOffsetX = 1.5; g.shadowOffsetY = 3;
  if (k === 'dogear') {
    const f = Math.min(w, h) * 0.22;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - f); g.lineTo(x + w - f, y + h); g.lineTo(x, y + h); g.closePath();
  } else rr(g, x, y, w, h, k === 'index' || k === 'graph' ? 1.5 : 3);
  g.fillStyle = c.color; g.fill();
  g.restore();
  g.save(); g.clip();
  if (k === 'sticky') { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x + 1, y + 1, w - 2, 11); }
  if (k === 'index' || k === 'notepad') {
    g.strokeStyle = look.lineHue; g.lineWidth = 1;
    for (let yy = y + (k === 'notepad' ? 18 : 14); yy < y + h - 3; yy += 9) { g.beginPath(); g.moveTo(x + 3, yy + 0.5); g.lineTo(x + w - 3, yy + 0.5); g.stroke(); }
    if (k === 'index') { g.strokeStyle = 'rgba(200,60,60,.45)'; g.beginPath(); g.moveTo(x, y + 9.5); g.lineTo(x + w, y + 9.5); g.stroke(); }
  }
  if (k === 'graph') {
    g.strokeStyle = 'rgba(60,90,120,.17)'; g.lineWidth = 1;
    for (let xx = x + 6; xx < x + w; xx += 7) { g.beginPath(); g.moveTo(xx + 0.5, y); g.lineTo(xx + 0.5, y + h); g.stroke(); }
    for (let yy = y + 6; yy < y + h; yy += 7) { g.beginPath(); g.moveTo(x, yy + 0.5); g.lineTo(x + w, yy + 0.5); g.stroke(); }
  }
  if (k === 'notepad') {
    g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x, y, w, 8);
    g.fillStyle = 'rgba(40,40,40,.35)';
    for (let xx = x + 6; xx < x + w - 3; xx += 8) { g.beginPath(); g.arc(xx, y + 4, 1.4, 0, Math.PI * 2); g.fill(); }
  }
  if (k === 'kraft' && look.paperImg) {
    g.globalAlpha = 0.28; g.globalCompositeOperation = 'multiply';
    g.fillStyle = pattern(g, look.paperImg, 0.4, [c.id * 37, c.id * 53]); g.fillRect(x, y, w, h);
  }
  if (k === 'dogear') {
    const f = Math.min(w, h) * 0.22;
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.moveTo(x + w, y + h - f); g.lineTo(x + w - f, y + h - f); g.lineTo(x + w - f, y + h); g.closePath(); g.fill();
  }
  g.restore();
  g.save();
  if (k === 'dogear') {
    const f = Math.min(w, h) * 0.22;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - f); g.lineTo(x + w - f, y + h); g.lineTo(x, y + h); g.closePath();
  } else rr(g, x, y, w, h, k === 'index' || k === 'graph' ? 1.5 : 3);
  g.strokeStyle = 'rgba(60,50,30,.42)'; g.lineWidth = 1; g.stroke();
  g.restore();
  if (k === 'kraft') {
    g.save(); g.translate(x + w / 2, y + 1); g.rotate(look.tapeTilt);
    g.fillStyle = 'rgba(255,255,240,.45)'; g.fillRect(-15, -5, 30, 10);
    g.strokeStyle = 'rgba(120,120,100,.35)'; g.lineWidth = 0.8; g.strokeRect(-15, -5, 30, 10);
    g.restore();
  }
  if (k === 'pinned') {
    const px = x + w / 2, py = y + 8;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 2; g.shadowOffsetY = 1.5;
    g.fillStyle = '#8d949c'; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = '#d7dce1'; g.beginPath(); g.arc(px - 1.2, py - 1.2, 1.5, 0, Math.PI * 2); g.fill();
  }
}
