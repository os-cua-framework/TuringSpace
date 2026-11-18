import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  return Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
}
export function ctxScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}

export const hex2rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgb2hex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mixHex = (a, b, t) => { const p = hex2rgb(a), q = hex2rgb(b); return rgb2hex(p.map((v, i) => v + (q[i] - v) * t)); };
export const shadeHex = (hex, f) => rgb2hex(hex2rgb(hex).map((v) => v * f));
export const rgba = (hex, a) => { const c = hex2rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
export function lumHex(hex) {
  const c = hex2rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrastHex = (a, b) => { const [x, y] = [lumHex(a), lumHex(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const linHex = (lin) => rgb2hex(lin.map((v) => 255 * Math.pow(clamp(v, 0, 1), 1 / 2.2)));
export function hueSatHex(hex) {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return [0, 0];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, d / mx];
}
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

export const texImg = (item) => loadImage('assets/' + item.file);
export const skyImg = (hdri) => loadImage('assets/' + hdri.sky);

const SWATCH = new Map();
export function swatch(img, { size = 256, lum = null, contrast = 1, sat = 1, tint = null, tintK = 0 } = {}) {
  const key = `${img.src}|${size}|${lum}|${contrast}|${sat}|${tint}|${tintK}`;
  if (SWATCH.has(key)) return SWATCH.get(key);
  const c = mkCanvas(size, size), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, size, size);
  const im = g.getImageData(0, 0, size, size), d = im.data, n = size * size;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n; i++) { mr += d[i * 4]; mg += d[i * 4 + 1]; mb += d[i * 4 + 2]; }
  mr /= n; mg /= n; mb /= n;
  const mL = Math.max(1, 0.299 * mr + 0.587 * mg + 0.114 * mb);
  const k = lum == null ? 1 : (lum * 255) / mL;
  const T = tint ? hex2rgb(tint) : null;
  for (let i = 0; i < n; i++) {
    let r = mr + (d[i * 4] - mr) * contrast, gg = mg + (d[i * 4 + 1] - mg) * contrast, b = mb + (d[i * 4 + 2] - mb) * contrast;
    const L = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = L + (r - L) * sat; gg = L + (gg - L) * sat; b = L + (b - L) * sat;
    r *= k; gg *= k; b *= k;
    if (T && tintK > 0) {
      const f = (L * k) / (mL * k || 1);
      r += (T[0] * f - r) * tintK; gg += (T[1] * f - gg) * tintK; b += (T[2] * f - b) * tintK;
    }
    d[i * 4] = clamp(r, 0, 255); d[i * 4 + 1] = clamp(gg, 0, 255); d[i * 4 + 2] = clamp(b, 0, 255); d[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  SWATCH.set(key, c);
  return c;
}
const MEAN = new WeakMap();
export function swatchMean(c) {
  if (MEAN.has(c)) return MEAN.get(c);
  const g = c.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, c.width, c.height).data;
  let r = 0, gg = 0, b = 0; const n = c.width * c.height;
  for (let i = 0; i < n; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  const hex = rgb2hex([r / n, gg / n, b / n]);
  MEAN.set(c, hex);
  return hex;
}

export function pat(g, src, { scale = 1, rot = 0, ox = 0, oy = 0 } = {}) {
  const p = g.createPattern(src, 'repeat');
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(ox, oy).rotateSelf(rot).scaleSelf(scale, scale));
  return p;
}
export function fillPat(g, src, opts) { g.fillStyle = pat(g, src, opts); g.fill(); }

export function layer(store, key, g, x, y, w, h, paint) {
  const q = ctxScale(g);
  let L = store[key];
  if (!L || L.q !== q) {
    const c = mkCanvas(Math.ceil(w * q), Math.ceil(h * q)), cg = c.getContext('2d');
    cg.setTransform(q, 0, 0, q, 0, 0);
    paint(cg);
    store[key] = L = { q, c };
  }
  g.drawImage(L.c, x, y, w, h);
  return L.c;
}

export function vShade(g, x, y, w, h, top = 0.18, bot = 0.22) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, `rgba(255,255,255,${top})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${bot})`);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}

export function drawSky(g, img, x, y, w, h, { u0 = 0, frac = 0.35, rows = [0.15, 1] } = {}) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const sx = (u0 % 1) * W, sw = frac * W, sy = rows[0] * H, sh = (rows[1] - rows[0]) * H;
  if (sx + sw <= W) g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  else {
    const a = W - sx, wa = w * a / sw;
    g.drawImage(img, sx, sy, a, sh, x, y, wa, h);
    g.drawImage(img, 0, sy, sw - a, sh, x + wa, y, w - wa, h);
  }
}

export function hash01(...a) {
  let h = 2166136261 >>> 0;
  for (const v of a) { h ^= (Math.round(v * 1000) | 0); h = Math.imul(h, 16777619); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export const FAMILY = {
  wood: (t) => t.use === 'wood',
  stone: (t) => t.use === 'stone',
  metal: (t) => t.use === 'metal',
  concrete: (t) => t.use === 'floor' && /concrete|cement|plaster|pavement|asphalt|garage|hangar/.test(t.id),
  brick: (t) => t.use === 'wall' && /brick|block/.test(t.id),
  plaster: (t) => t.use === 'wall' && /plaster|concrete|beige|white/.test(t.id),
  fabric: (t) => t.use === 'fabric',
  terrain: (t) => t.use === 'terrain',
  floor: (t) => t.use === 'floor',
  wall: (t) => t.use === 'wall',
  roof: (t) => t.use === 'roof',
  flat: (t) => t.use === 'flat2d',
};
export function famPool(style, fam) {
  const f = FAMILY[fam];
  let p = style.pool('tex', f);
  if (!p.length && fam === 'concrete') p = style.pool('tex', FAMILY.floor);
  if (!p.length && (fam === 'brick' || fam === 'plaster')) p = style.pool('tex', FAMILY.wall);
  return p;
}

const SIDES = new Map();
function sideOf(pool, ids, minTest) {
  const k = `${pool}|${minTest}`;
  if (!SIDES.has(k)) SIDES.set(k, splitIds(pool, [...new Set(ids)], minTest));
  return SIDES.get(k);
}
export function inSplit(st, pool, list, idOf = (x) => String(x), minTest = 1) {
  const side = sideOf(pool, list.map(idOf), minTest);
  const out = list.filter((x) => side(idOf(x)) === st.split);
  return out.length ? out : list;
}
export function pickIn(st, pool, list, idOf = (x) => String(x), minTest = 1) {
  const l = inSplit(st, pool, list, idOf, minTest);
  const it = l[Math.floor(st.rand() * l.length)];
  st.note(`${pool}:${idOf(it)}`);
  return it;
}

export function skyBusy(img, { u0 = 0, frac = 0.35, rows = [0.15, 1] } = {}) {
  const W = 96, H = 24, c = mkCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  drawSky(g, img, 0, 0, W, H, { u0, frac, rows });
  const d = g.getImageData(0, 0, W, H).data, L = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let s = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const i = (y * W + x) * 4; s += Math.abs(L(i + 4) - L(i)); n++; }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s += Math.abs(L(i + W * 4) - L(i)); n++; }
  return s / n;
}
