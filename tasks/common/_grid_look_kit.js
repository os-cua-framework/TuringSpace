import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const rgba = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };
export const shade = (hex, f) => rgbHex(hexRGB(hex).map((v) => v * f));
export const mix = (a, b, t) => { const p = hexRGB(a), q = hexRGB(b); return rgbHex(p.map((v, i) => v + (q[i] - v) * t)); };
export const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const hexOfLin = (lin) => rgbHex(lin.map((v) => lin2srgb(clamp(v, 0, 1)) * 255));
export function relLum(hex) {
  const c = hexRGB(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
export function jitterHex(hex, rnd, dh = 6, ds = 0.08, dl = 0.03) {
  const [h, s, l] = rgb2hsl(hexRGB(hex));
  return hsl2hex(h + (rnd() * 2 - 1) * dh, s * (1 + (rnd() * 2 - 1) * ds), l + (rnd() * 2 - 1) * dl);
}

export function splitPool(poolName, items, minTest = 1, idOf = (x) => x.id) {
  const sp = splitIds(poolName, items.map(idOf), minTest);
  return (split) => items.filter((x) => sp(idOf(x)) === split);
}
export function roundRobinPairs(kinds, lists) {
  const pairs = [], n = Math.max(0, ...lists.map((l) => l.length));
  for (let r = 0; r < n; r++) kinds.forEach((k, i) => { if (lists[i].length) pairs.push([k, lists[i][r % lists[i].length]]); });
  return pairs;
}

const TEXC = new Map();
export function texCanvas(file, opt = {}) {
  const { size = 256, contrast: ck = 1, sat = 1, gain = 1, tint = null, tintK = 0, highpass = 0, flatTo = null } = opt;
  const key = JSON.stringify([file, size, ck, sat, gain, tint, tintK, highpass, flatTo]);
  if (!TEXC.has(key)) TEXC.set(key, loadImage('assets/' + file).then((img) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    let src = img, w = img.width;
    while (w > size * 2) { const t = document.createElement('canvas'); t.width = t.height = Math.max(size, w >> 1); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height); src = t; w = t.width; }
    g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, size, size);
    let im;
    try { im = g.getImageData(0, 0, size, size); } catch { return c; }
    const d = im.data, n = size * size, L = new Float32Array(n);
    let mean = 0;
    for (let k = 0; k < n; k++) { L[k] = 0.2126 * d[4 * k] + 0.7152 * d[4 * k + 1] + 0.0722 * d[4 * k + 2]; mean += L[k]; }
    mean /= n;
    let low = null;
    if (highpass > 0) low = boxBlurWrap(boxBlurWrap(L, size, highpass), size, highpass);
    const tc = tint ? hexRGB(tint) : null;
    for (let k = 0; k < n; k++) {
      const base = low ? low[k] : mean;
      const target = flatTo != null ? flatTo : base;
      const Lk = target + (L[k] - base) * ck;
      const f = L[k] > 1e-3 ? Lk / L[k] : 1;
      for (let ch = 0; ch < 3; ch++) {
        let v = d[4 * k + ch] * f;
        v = Lk + (v - Lk) * sat;
        v *= gain;
        if (tc) v = v * (1 - tintK) + tc[ch] * (Lk / Math.max(1, relLumByte(tc))) * tintK;
        d[4 * k + ch] = clamp(Math.round(v), 0, 255);
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  }));
  return TEXC.get(key);
}
const relLumByte = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function boxBlurWrap(a, S, R) {
  const n = S * S, tmp = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let s = 0; for (let d = -R; d <= R; d++) s += a[y * S + ((x + d + S) % S)]; tmp[y * S + x] = s / (2 * R + 1); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let s = 0; for (let d = -R; d <= R; d++) s += tmp[((y + d + S) % S) * S + x]; out[y * S + x] = s / (2 * R + 1); }
  return out;
}

const PATS = new WeakMap();
export function texPattern(g, canvas, t = {}) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  let p = m.get(canvas);
  if (!p) { p = g.createPattern(canvas, 'repeat'); m.set(canvas, p); }
  if (p.setTransform && typeof DOMMatrix !== 'undefined') {
    const M = new DOMMatrix().translateSelf(t.ox || 0, t.oy || 0).rotateSelf(t.rot || 0).scaleSelf(t.scale || 1, t.scale || 1);
    p.setTransform(M);
  }
  return p;
}
export function fillTex(g, canvas, t = {}, rect = null) {
  if (!canvas) return;
  g.save();
  if (t.alpha != null) g.globalAlpha = t.alpha;
  if (t.op) g.globalCompositeOperation = t.op;
  g.fillStyle = texPattern(g, canvas, t);
  if (rect) g.fillRect(rect.x, rect.y, rect.w, rect.h); else g.fill();
  g.restore();
}
export function vignette(g, x, y, w, h, a = 0.22, col = '0,0,0') {
  const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.38, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.58);
  v.addColorStop(0, `rgba(${col},0)`); v.addColorStop(1, `rgba(${col},${a})`);
  g.fillStyle = v; g.fillRect(x, y, w, h);
}
export function rrPath(g, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
}
export const texMeanHex = (t) => (t && t.mean_lin ? hexOfLin(t.mean_lin) : '#888888');

const DET = new Map();
export function detailMap(file, size = 64, R = 5) {
  const key = `${file}|${size}|${R}`;
  if (!DET.has(key)) DET.set(key, loadImage('assets/' + file).then((img) => {
    let src = img, w = img.width;
    while (w > size * 2) { const t = document.createElement('canvas'); t.width = t.height = Math.max(size, w >> 1); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height); src = t; w = t.width; }
    const c = document.createElement('canvas'); c.width = c.height = size;
    const cg = c.getContext('2d', { willReadFrequently: true }); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, size, size);
    let px; try { px = cg.getImageData(0, 0, size, size).data; } catch { return null; }
    const n = size * size, L = new Float32Array(n);
    for (let k = 0; k < n; k++) L[k] = 0.2126 * px[4 * k] + 0.7152 * px[4 * k + 1] + 0.0722 * px[4 * k + 2];
    const low = boxBlurWrap(boxBlurWrap(L, size, R), size, R);
    let ss = 0; for (let k = 0; k < n; k++) { L[k] -= low[k]; ss += L[k] * L[k]; }
    const rms = Math.sqrt(ss / n) || 1; for (let k = 0; k < n; k++) L[k] /= rms;
    return { size, L };
  }));
  return DET.get(key);
}
export function tintDetail(det, hex, amp) {
  const size = det ? det.size : 4, c = document.createElement('canvas'); c.width = c.height = size;
  const cg = c.getContext('2d'), im = cg.createImageData(size, size), [r, g, b] = hexRGB(hex);
  for (let k = 0; k < size * size; k++) {
    const f = det ? 1 + amp * clamp(det.L[k] / 2, -1, 1) : 1;
    im.data[4 * k] = clamp(Math.round(r * f), 0, 255); im.data[4 * k + 1] = clamp(Math.round(g * f), 0, 255);
    im.data[4 * k + 2] = clamp(Math.round(b * f), 0, 255); im.data[4 * k + 3] = 255;
  }
  cg.putImageData(im, 0, 0);
  return c;
}

export function choose(st, pool, items, { minTest = 1, allowed = null } = {}) {
  const idOf = (x) => (typeof x === 'string' ? x : x.id);
  const sp = splitIds(pool, items.map(idOf), minTest);
  let c = items.filter((x) => sp(idOf(x)) === st.split);
  if (allowed) { const a = c.filter((x) => allowed.includes(idOf(x))); if (a.length) c = a; }
  const it = c[Math.floor(st.rand() * c.length)];
  st.note(`${pool}:${idOf(it)}`);
  return it;
}

export const ANISO_MAX = 0.45;
const ANI = new Map();
export function lowFreqAniso(file) {
  if (!ANI.has(file)) ANI.set(file, loadImage('assets/' + file).then((img) => {
    let src = img, w = img.width;
    while (w > 48) { const t = document.createElement('canvas'); t.width = t.height = Math.max(24, w >> 1); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height); src = t; w = t.width; }
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, 24, 24);
    let px; try { px = g.getImageData(0, 0, 24, 24).data; } catch { return 0; }
    const L = new Float32Array(576); let mean = 0;
    for (let k = 0; k < 576; k++) { L[k] = 0.299 * px[4 * k] + 0.587 * px[4 * k + 1] + 0.114 * px[4 * k + 2]; mean += L[k] / 576; }
    let xx = 0, yy = 0, xy = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const gx = L[y * 24 + (x + 1) % 24] - L[y * 24 + (x + 23) % 24], gy = L[((y + 1) % 24) * 24 + x] - L[((y + 23) % 24) * 24 + x];
      xx += gx * gx / 576; yy += gy * gy / 576; xy += gx * gy / 576;
    }
    const tr = xx + yy, det = xx * yy - xy * xy, s = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const coh = (2 * s) / (tr + 1e-9), en = Math.sqrt(tr) / (mean + 1);
    return coh * Math.min(1, en * 4);
  }));
  return ANI.get(file);
}
export async function firstIsotropic(list, start) {
  for (let k = 0; k < list.length; k++) {
    const t = list[(start + k) % list.length];
    if (!t || (await lowFreqAniso(t.file)) <= ANISO_MAX) return t;
  }
  return null;
}
