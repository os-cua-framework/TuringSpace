import { loadImage } from '../core/assets.js';
import { splitIds, hash32 } from '../core/style.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function hex2rgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb2hex(c) { return '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }
export function mixHex(a, b, t) { const p = hex2rgb(a), q = hex2rgb(b); return rgb2hex(p.map((v, i) => v + (q[i] - v) * t)); }
export function shadeHex(h, k) { return k < 0 ? mixHex(h, '#000000', -k) : mixHex(h, '#ffffff', k); }
export function rgba(h, a) { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${(+a).toFixed(3)})`; }
const lin1 = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export function relLum(h) { const c = hex2rgb(h); return 0.2126 * lin1(c[0]) + 0.7152 * lin1(c[1]) + 0.0722 * lin1(c[2]); }
export function contrastHex(a, b) { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
export function linToHex(l) { return rgb2hex(l.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055))); }
export const lumLin = (l) => 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
export function meanAt(tex, L) { const k = L / Math.max(1e-4, lumLin(tex.lin)); return linToHex(tex.lin.map((v) => Math.min(1, v * k))); }
export function hueSatHex(h) {
  const [r, g, b] = hex2rgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d < 1e-6) return [0, 0];
  const s = d / (1 - Math.abs(2 * l - 1));
  let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((hh * 60) + 360) % 360, s];
}

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPLITS = new Map();
export function splitPool(name, items, minTest = 1) {
  if (!SPLITS.has(name)) {
    const f = splitIds(name, items.map((i) => i.id), minTest);
    SPLITS.set(name, items.map((i) => ({ ...i, split: f(i.id) })));
  }
  return SPLITS.get(name);
}
export function poolOf(name, items, split, minTest = 1) { return splitPool(name, items, minTest).filter((i) => i.split === split); }
export function stylePool(style, name, items, minTest = 1) {
  const p = poolOf(name, items, style.split, minTest);
  return p.length ? p : poolOf(name, items, 'train', minTest);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function seqPick(style, tag, N) {
  if (N <= 1) return 0;
  const h = hash32(`${style.key.split('|')[0]}|${style.split}|${tag}|seq`);
  let a = 1 + (h % (N - 1));
  while (gcd(a, N) !== 1) a = (a % (N - 1)) + 1;
  const b = (h >>> 8) % N;
  return ((a * ((style.n - 1) % N)) % N + b) % N;
}
export function pickSplit(style, pool, items, { minTest = 1, seq = false } = {}) {
  const objs = items.map((it) => (it && typeof it === 'object' ? it : { id: String(it), value: it }));
  const avail = poolOf(pool, objs, style.split, minTest);
  const it = avail[seq ? seqPick(style, pool, avail.length) : Math.floor(style.rand() * avail.length) % avail.length];
  style.note(`${pool}:${it.id}`);
  return 'value' in it && Object.keys(it).length === 3 ? it.value : it;
}
export function pickR(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

export async function loadTex(entry) {
  if (!entry) return null;
  const img = await loadImage('assets/' + entry.file);
  return { id: entry.id, use: entry.use, img, lin: entry.mean_lin, mean: linToHex(entry.mean_lin), lum: lumLin(entry.mean_lin) };
}
export function texPattern(g, tex, { scale = 0.5, ox = 0, oy = 0, rot = 0 } = {}) {
  const p = g.createPattern(tex.img, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(ox, oy).rotateSelf(rot).scaleSelf(scale, scale));
  return p;
}
export function texFilter(tex, target, sat = 1) {
  const k = clamp(Math.pow(target / Math.max(0.005, tex.lum), 1 / 2.2), 0.25, 4);
  return `brightness(${k.toFixed(3)}) saturate(${sat.toFixed(2)})`;
}
export function fillTex(g, tex, { lum = null, sat = 1, scale = 0.5, ox = 0, oy = 0, rot = 0, alpha = 1, rect = null, tint = null, tintA = 0 } = {}) {
  g.save();
  if (rect) { g.beginPath(); g.rect(rect[0], rect[1], rect[2], rect[3]); }
  g.clip();
  g.globalAlpha = alpha;
  g.filter = lum == null ? (sat !== 1 ? `saturate(${sat})` : 'none') : texFilter(tex, lum, sat);
  g.fillStyle = texPattern(g, tex, { scale, ox, oy, rot });
  g.fillRect(-4000, -4000, 8000, 8000);
  g.filter = 'none';
  if (tint && tintA > 0) {
    g.globalAlpha = tintA; g.globalCompositeOperation = 'color';
    g.fillStyle = tint; g.fillRect(-4000, -4000, 8000, 8000);
  }
  g.restore();
}

export function texAniso(tex) {
  if (tex._aniso != null) return tex._aniso;
  if (typeof document === 'undefined') return 1;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.img, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data, L = (x, y) => { const i = ((((y + 64) % 64) * 64) + ((x + 64) % 64)) * 4; return d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722; };
  let gx = 0, gy = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const a = L(x + 1, y) - L(x, y), b = L(x, y + 1) - L(x, y); gx += a * a; gy += b * b; }
  tex._aniso = gx / Math.max(1e-9, gy);
  return tex._aniso;
}
export function fillQuadTex(g, q, tex, { texels = 256, lum = null, sat = 1, off = [0, 0], rot = 0 } = {}) {
  const [o, a, , b] = q, u = { x: a.x - o.x, y: a.y - o.y }, v = { x: b.x - o.x, y: b.y - o.y };
  const [tu, tv] = Array.isArray(texels) ? texels : [texels, texels];
  g.save();
  g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.clip();
  if (lum != null) g.filter = texFilter(tex, lum, sat);
  const pat = g.createPattern(tex.img, 'repeat');
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([u.x / tu, u.y / tu, v.x / tv, v.y / tv, o.x, o.y]).translateSelf(off[0], off[1]).rotateSelf(rot));
  g.fillStyle = pat;
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  g.fillRect(Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) - Math.min(...xs) + 4, Math.max(...ys) - Math.min(...ys) + 4);
  g.restore();
}

export function drawCached(g, store, key, w, h, paint) {
  const T = g.getTransform();
  if (T.b || T.c || !(T.a > 0 && T.d > 0) || !Number.isInteger(T.e) || !Number.isInteger(T.f) || typeof document === 'undefined' || !store) { paint(g); return; }
  const k = `${key}|${T.a},${T.d},${w},${h}`;
  let c = store.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * T.a); c.height = Math.ceil(h * T.d);
    const cg = c.getContext('2d');
    cg.setTransform(T.a, 0, 0, T.d, 0, 0);
    paint(cg);
    if (store.size > 6) store.clear();
    store.set(k, c);
  }
  g.save(); g.setTransform(1, 0, 0, 1, T.e, T.f); g.drawImage(c, 0, 0); g.restore();
}

export const METALS = [
  { id: 'steel', dark: '#5d6670', mid: '#aeb7c0', light: '#f2f5f7' },
  { id: 'brass', dark: '#8a6420', mid: '#d6ac55', light: '#fbecc4' },
  { id: 'copper', dark: '#6e3418', mid: '#c46a3e', light: '#f6c3a0' },
  { id: 'aluminium', dark: '#7b8187', mid: '#c9ced3', light: '#ffffff' },
  { id: 'gunmetal', dark: '#24292e', mid: '#5b636b', light: '#b9c1c8' },
  { id: 'gold', dark: '#7d5a06', mid: '#e0b331', light: '#fff1b5' },
  { id: 'bronze', dark: '#4f3312', mid: '#9c6b30', light: '#e3bf8a' },
  { id: 'chrome', dark: '#3c4248', mid: '#d5dade', light: '#ffffff' },
  { id: 'black_iron', dark: '#141618', mid: '#3d4247', light: '#9aa1a8' },
  { id: 'titanium', dark: '#4d4f5c', mid: '#9d9fae', light: '#e8e9f3' },
  { id: 'rose_gold', dark: '#7a3f35', mid: '#d39582', light: '#fbe1d7' },
  { id: 'zinc', dark: '#596357', mid: '#a5ae9f', light: '#eef2ea' },
];
export function metalGrad(g, x0, y0, x1, y1, m) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, m.light); gr.addColorStop(0.45, m.mid); gr.addColorStop(1, m.dark);
  return gr;
}
export const metalTone = (m) => m.mid;

export const FONTS = [
  { id: 'noto_sans_bold', css: '"SCB Noto Sans SC Bold"', w: 700 },
  { id: 'noto_sans', css: '"SCB Noto Sans SC"', w: 400 },
  { id: 'noto_serif', css: '"SCB Noto Serif SC"', w: 500 },
  { id: 'zcool_kuaile', css: '"SCB ZCOOL KuaiLe"', w: 400 },
  { id: 'zcool_huangyou', css: '"SCB ZCOOL HuangYou"', w: 400 },
];
export const fontCss = (f, px, weight = null) => `${weight ?? f.w} ${px}px ${f.css}, sans-serif`;

export function rrect(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h); g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y); g.closePath();
}
export function screw(g, x, y, r, a, m = METALS[0]) {
  g.save();
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, m.light); gr.addColorStop(0.6, m.mid); gr.addColorStop(1, m.dark);
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba(m.dark, 0.9); g.lineWidth = Math.max(1, r * 0.28);
  g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7); g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); g.stroke();
  g.restore();
}
