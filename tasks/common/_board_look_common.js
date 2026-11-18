import { loadImage } from '../core/assets.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const meanHex = (meanLin) => rgbHex(meanLin.map((v) => lin2srgb(clamp(v, 0, 1)) * 255));
export const mixHex = (a, b, t) => { const p = hexRGB(a), q = hexRGB(b); return rgbHex(p.map((v, k) => v + (q[k] - v) * t)); };
export const shadeHex = (hex, f) => rgbHex(hexRGB(hex).map((v) => v * f));
export const rgba = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };
export const lumHex = (hex) => {
  const c = hexRGB(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrastHex = (a, b) => { const [x, y] = [lumHex(a), lumHex(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export function toneHex(hex, L, sat = 1) {
  const [r, g, b] = hexRGB(hex).map((v) => v / 255);
  const m = (r + g + b) / 3;
  let c = [r, g, b].map((v) => m + (v - m) * sat);
  for (let it = 0; it < 24; it++) {
    const cur = lumHex(rgbHex(c.map((v) => v * 255)));
    if (Math.abs(cur - L) < 0.004) break;
    const f = Math.pow((L + 0.02) / (cur + 0.02), 0.6);
    c = c.map((v) => clamp(v * f + (f > 1 ? 0.01 : 0), 0, 1));
  }
  return rgbHex(c.map((v) => v * 255));
}

export function hashS(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
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

const texCache = new Map();
export async function texCanvas(file, { px = 128, mode = 'photo', tone = null, sat = 1, amp = 0.18, base = '#888888', blur = 0 } = {}) {
  const key = JSON.stringify([file, px, mode, tone, sat, amp, base, blur]);
  if (texCache.has(key)) return texCache.get(key);
  const p = (async () => {
    const img = await loadImage('assets/' + file);
    let src = img, w = img.width, h = img.height;
    while (w > px * 2 || h > px * 2) {
      const c = document.createElement('canvas');
      c.width = Math.max(px, w >> 1); c.height = Math.max(px, h >> 1);
      const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }
    const c = document.createElement('canvas'); c.width = c.height = px;
    const cg = c.getContext('2d', { willReadFrequently: true }); cg.imageSmoothingQuality = 'high';
    if (blur) cg.filter = `blur(${blur}px)`;
    cg.drawImage(src, 0, 0, px, px);
    cg.filter = 'none';
    let im;
    try { im = cg.getImageData(0, 0, px, px); } catch { return c; }
    const d = im.data, n = px * px;
    if (mode === 'photo') {
      if (tone != null || sat !== 1) {
        let sumL = 0;
        for (let k = 0; k < n; k++) sumL += 0.2126 * d[4 * k] + 0.7152 * d[4 * k + 1] + 0.0722 * d[4 * k + 2];
        const mL = sumL / n / 255 || 0.5, f = tone != null ? tone / mL : 1;
        for (let k = 0; k < n; k++) {
          const r = d[4 * k], g = d[4 * k + 1], b = d[4 * k + 2], m = (r + g + b) / 3;
          d[4 * k] = clamp((m + (r - m) * sat) * f, 0, 255); d[4 * k + 1] = clamp((m + (g - m) * sat) * f, 0, 255); d[4 * k + 2] = clamp((m + (b - m) * sat) * f, 0, 255);
        }
      }
    } else {
      const L = new Float32Array(n);
      for (let k = 0; k < n; k++) L[k] = 0.2126 * d[4 * k] + 0.7152 * d[4 * k + 1] + 0.0722 * d[4 * k + 2];
      const R = Math.max(2, Math.round(px / 14)), tmp = new Float32Array(n), low = new Float32Array(n);
      const box = (a, out, horiz) => {
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
          let s = 0;
          for (let q = -R; q <= R; q++) s += horiz ? a[y * px + ((x + q + px) % px)] : a[((y + q + px) % px) * px + x];
          out[y * px + x] = s / (2 * R + 1);
        }
      };
      box(L, tmp, true); box(tmp, low, false);
      let ss = 0;
      for (let k = 0; k < n; k++) { L[k] -= low[k]; ss += L[k] * L[k]; }
      const rms = Math.sqrt(ss / n) || 1, [br, bg, bb] = hexRGB(base);
      for (let k = 0; k < n; k++) {
        const f = 1 + amp * clamp(L[k] / rms / 2, -1, 1);
        d[4 * k] = clamp(br * f, 0, 255); d[4 * k + 1] = clamp(bg * f, 0, 255); d[4 * k + 2] = clamp(bb * f, 0, 255); d[4 * k + 3] = 255;
      }
    }
    cg.putImageData(im, 0, 0);
    return c;
  })();
  texCache.set(key, p);
  return p;
}

export function texPattern(g, canvas, { scale = 1, rot = 0, ox = 0, oy = 0 } = {}) {
  const p = g.createPattern(canvas, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') {
    p.setTransform(new DOMMatrix().translateSelf(ox, oy).rotateSelf(rot).scaleSelf(scale, scale));
  }
  return p;
}

export function cachedLayer(g, store, key, w, h, paint) {
  const T = g.getTransform();
  if (T.b || T.c || !(T.a > 0 && T.d > 0) || !Number.isInteger(T.e) || !Number.isInteger(T.f) || typeof document === 'undefined') { paint(g); return; }
  const k = `${key}|${T.a},${T.d},${w},${h}`;
  let c = store.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * T.a); c.height = Math.ceil(h * T.d);
    const cg = c.getContext('2d'); cg.setTransform(T.a, 0, 0, T.d, 0, 0);
    paint(cg);
    if (store.size > 24) store.clear();
    store.set(k, c);
  }
  g.save(); g.setTransform(1, 0, 0, 1, T.e, T.f); g.drawImage(c, 0, 0); g.restore();
}

export function rrPath(g, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h); g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y); g.closePath();
}

export function balancedPrimary(style, tag, groups) {
  const gs = groups.filter(([, l]) => l.length);
  const L = Math.max(...gs.map(([, l]) => l.length));
  const [si, ti] = style.primaryCombo(tag, [gs.length, L]);
  const [th, list] = gs[si];
  return [th, list[ti % list.length]];
}
