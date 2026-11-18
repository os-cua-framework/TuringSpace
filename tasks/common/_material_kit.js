import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';

export const srgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
export const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbHex(c) { return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
export function mixHex(a, b, t) { const p = hexRgb(a), q = hexRgb(b); return rgbHex(p.map((v, i) => v + (q[i] - v) * t)); }
export function shadeHex(hex, amt) { return amt >= 0 ? mixHex(hex, '#ffffff', amt) : mixHex(hex, '#000000', -amt); }
export function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function lumHex(hex) { const c = hexRgb(hex).map((v) => lin(v / 255)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
export function contrast(a, b) { const [x, y] = [lumHex(a), lumHex(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

export function hslAtLum(h, s, lum) {
  let lo = 0, hi = 100;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (lumHex(hsl(h, s, m)) < lum) lo = m; else hi = m; }
  return hsl(h, s, (lo + hi) / 2);
}

export function texLum(t) { const m = t.mean_lin; return srgb(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]); }
export function texHex(t) { return rgbHex(t.mean_lin.map((v) => srgb(v) * 255)); }
export async function loadTex(t) { return t ? loadImage('assets/' + t.file) : null; }

export async function makeMaterial(st, t, { scale = [0.32, 0.55], rotate = true } = {}) {
  if (!t) return null;
  const img = await loadTex(t);
  return {
    id: t.id, use: t.use, img, lum: texLum(t), hex: texHex(t),
    scale: scale[0] + st.rand() * (scale[1] - scale[0]),
    ox: Math.floor(st.rand() * 512), oy: Math.floor(st.rand() * 512),
    rot: rotate ? st.rand() * 360 : 0,
  };
}
export function patternOf(g, M, extraScale = 1) {
  const p = g.createPattern(M.img, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') {
    p.setTransform(new DOMMatrix().rotateSelf(M.rot).scaleSelf(M.scale * extraScale, M.scale * extraScale).translateSelf(-M.ox, -M.oy));
  }
  return p;
}
export function fillMaterial(g, M, shape, { target = null, contrastK = 1, tint = null, tintAlpha = 1, extraScale = 1, desat = 0 } = {}) {
  if (!M || !M.img) {
    const v = Math.round(255 * (target ?? 0.6));
    g.save(); shape(g); g.fillStyle = rgbHex([v, v, v]); g.fill();
    if (tint) { shape(g); g.globalCompositeOperation = 'multiply'; g.globalAlpha = tintAlpha; g.fillStyle = tint; g.fill(); }
    g.restore(); return;
  }
  g.save();
  shape(g); g.fillStyle = patternOf(g, M, extraScale); g.fill();
  if (contrastK < 1) { shape(g); g.globalAlpha = 1 - contrastK; g.fillStyle = M.hex; g.fill(); g.globalAlpha = 1; }
  if (desat > 0) { shape(g); g.globalCompositeOperation = 'saturation'; g.globalAlpha = desat; g.fillStyle = '#808080'; g.fill(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  if (target != null) {
    const L0 = Math.max(0.02, Math.min(0.98, M.lum));
    if (target > L0 + 0.01) {
      const s = 1 - (1 - target) / (1 - L0);
      shape(g); g.globalCompositeOperation = 'screen'; g.fillStyle = rgbHex([s * 255, s * 255, s * 255]); g.fill();
    } else if (target < L0 - 0.01) {
      const k = target / L0;
      shape(g); g.globalCompositeOperation = 'multiply'; g.fillStyle = rgbHex([k * 255, k * 255, k * 255]); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (tint) { shape(g); g.globalCompositeOperation = 'multiply'; g.globalAlpha = tintAlpha; g.fillStyle = tint; g.fill(); }
  g.restore();
}
export const rectShape = (x, y, w, h) => (g) => { g.beginPath(); g.rect(x, y, w, h); };
export const rrShape = (x, y, w, h, r) => (g) => {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
};

const SPLIT_CACHE = new Map();
export function splitList(pool, ids, split, minTest = 1) {
  const k = `${pool}|${minTest}|${ids.join(',')}`;
  let f = SPLIT_CACHE.get(k);
  if (!f) { f = splitIds(pool, ids, minTest); SPLIT_CACHE.set(k, f); }
  return ids.filter((id) => f(id) === split);
}
export function primaryOf(st, tag, items, pool = null) {
  if (!items.length) return null;
  const [i] = st.primaryCombo(tag, [items.length]);
  if (pool) st.note(`${pool}:${items[i]}`);
  return items[i];
}
export function chooseSplit(st, pool, ids, minTest = 1) {
  const items = splitList(pool, ids, st.split, minTest);
  const it = items[Math.floor(st.rand() * items.length)];
  st.note(`${pool}:${it}`);
  return it;
}
export function texPool(st, uses, extra = () => true) {
  const U = new Set(uses);
  return st.pool('tex', (t) => U.has(t.use) && extra(t));
}
const DIRECTIONAL = /plank|wood_floor|laminate|deck|parquet|herringbone|corrugat|veneer|grain|weathered_brown|stripe|shutter|box_profile|terlenka|corduroy|ribbed|thatch|roof|slates|denim|jersey|linen|jacquard|check|herring|grate|grid|tiles|tile_|bricks?|blocks|pavement|paving|cobble/;
export const isDirectional = (t) => DIRECTIONAL.test(t.id);

function mkCanvas(w, h) {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
  return new OffscreenCanvas(w, h);
}
export async function skyWindow(st, hdri, aspect, { avoidSun = true, mean = 0.62, maxGain = 3.2, margin = 44, maxAsym = 0.08, maxBusy = Infinity, flip: flipOpt } = {}) {
  const img = await loadImage('assets/' + hdri.sky);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const src = mkCanvas(W, H), sg = src.getContext('2d', { willReadFrequently: true });
  sg.drawImage(img, 0, 0);
  const px = sg.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2]) / 255;
  const ww = Math.min(W, Math.round(H * aspect));
  const colBusy = new Float32Array(W), Htop = Math.floor(H * 0.75);
  for (let x = 0; x < W - 1; x++) { let s = 0; for (let y = 0; y < Htop; y++) { const i = y * W + x; s += Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + W] - L[i]); } colBusy[x] = s / Htop; }
  const colMean = new Float32Array(W), colWarm = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let s = 0, w = 0;
    for (let y = 0; y < H; y++) { const i = y * W + x; s += L[i]; w += (px[4 * i] - px[4 * i + 2]) / 255; }
    colMean[x] = s / H; colWarm[x] = w / H;
  }
  let sunX = -1;
  if (avoidSun) {
    let best = 0, bx = -1, sum = 0;
    for (let i = 0; i < W * H; i++) sum += L[i];
    for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
      let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L[(y + dy) * W + x + dx];
      if (s > best) { best = s; bx = x; }
    }
    if (best / 25 > Math.min(0.97, 2.2 * sum / (W * H))) sunX = bx;
  }
  const cands = [];
  for (let x0 = 0; x0 + ww <= W; x0 += 4) {
    if (sunX >= 0 && sunX > x0 - margin && sunX < x0 + ww + margin) continue;
    let busy = 0; for (let x = 0; x < ww; x++) busy += colBusy[x0 + x];
    if (busy / ww > maxBusy) continue;
    let a = 0, b = 0, wa = 0, wb = 0; const h2 = Math.floor(ww / 2);
    for (let x = 0; x < h2; x++) { a += colMean[x0 + x]; b += colMean[x0 + ww - 1 - x]; wa += colWarm[x0 + x]; wb += colWarm[x0 + ww - 1 - x]; }
    cands.push([Math.max(Math.abs(a - b) / Math.max(1e-3, a + b), Math.abs(wa - wb) / Math.max(1e-3, a + b)), x0]);
  }
  if (!cands.length) return null;
  const keep = cands.filter((c) => c[0] <= maxAsym);
  if (!keep.length) return null;
  const [, x0] = keep[Math.floor(st.rand() * keep.length)];
  let m = 0; for (let x = 0; x < ww; x++) m += colMean[x0 + x]; m /= ww;
  const gain = Math.min(maxGain, Math.max(0.6, mean / Math.max(0.05, m)));
  const out = mkCanvas(ww, H), og = out.getContext('2d');
  const flipR = st.rand() < 0.5, flip = flipOpt === undefined ? flipR : !!flipOpt;
  const id = sg.getImageData(x0, 0, ww, H), d = id.data;
  if (flip) for (let y = 0; y < H; y++) for (let x = 0; x < ww / 2; x++) for (let k = 0; k < 4; k++) {
    const i = 4 * (y * ww + x) + k, j = 4 * (y * ww + ww - 1 - x) + k, t = d[i]; d[i] = d[j]; d[j] = t;
  }
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) {
    const v = d[i + k] / 255 * gain;
    d[i + k] = Math.round(255 * (v <= 1 ? v : 1 - (1 - 1 / v) * 0.25));
  }
  og.putImageData(id, 0, 0);
  out.meanLum = Math.min(1, m * gain);
  return out;
}

export function skyGradient(hdri, mean = 0.62) {
  const norm = (c) => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; const k = lin(mean) / Math.max(1e-4, L); return c.map((v) => Math.max(0, Math.min(1, srgb(Math.min(1, v * k))))); };
  const z = norm(hdri.zenith || [0.3, 0.45, 0.7]), h = norm(hdri.horizon || [0.6, 0.65, 0.7]);
  const c = mkCanvas(8, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, rgbHex(z.map((v) => v * 255 * 0.92))); gr.addColorStop(1, rgbHex(h.map((v) => Math.min(255, v * 255 * 1.08))));
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  return c;
}

export function paintedSky(st, hdri, w, h, mean = 0.62, horizon = null) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.drawImage(skyGradient(hdri, mean), 0, 0, w, h);
  const nC = 3 + Math.floor(st.rand() * 6);
  g.save(); g.filter = 'blur(3px)';
  for (let i = 0; i < nC; i++) {
    const cx = st.rand() * w, cy = h * (0.08 + st.rand() * 0.55), s = 0.6 + st.rand() * 1.1;
    g.fillStyle = `rgba(255,255,255,${0.55 + st.rand() * 0.3})`;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(cx + (st.rand() - 0.5) * 50 * s, cy + (st.rand() - 0.5) * 10 * s, (10 + st.rand() * 16) * s, (6 + st.rand() * 7) * s, 0, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  const kr = Math.floor(st.rand() * 3), kind = horizon ? ['hills', 'trees', 'skyline', 'mountains'].indexOf(horizon) : kr, base = h, top = h * (0.78 + st.rand() * 0.1);
  const gr = hdri.ground || [0.08, 0.09, 0.07], L = 0.2126 * gr[0] + 0.7152 * gr[1] + 0.0722 * gr[2];
  const col = rgbHex(gr.map((v) => Math.min(255, srgb(Math.min(1, v * 0.06 / Math.max(1e-4, L))) * 255)));
  g.fillStyle = col; g.beginPath(); g.moveTo(0, base);
  if (kind === 0) { const a = st.rand() * 6, f = 0.01 + st.rand() * 0.02; for (let x = 0; x <= w; x += 4) g.lineTo(x, top + (base - top) * 0.5 * (1 + Math.sin(x * f + a) * 0.6 + Math.sin(x * f * 2.7 + a * 2) * 0.3)); }
  else if (kind === 1) { for (let x = 0; x <= w; x += 3) g.lineTo(x, top + (base - top) * (0.35 + 0.4 * Math.abs(Math.sin(x * 0.21 + st.rand() * 0.6)) * st.rand())); }
  else if (kind === 2) { let x = 0; while (x < w) { const bw = 8 + st.rand() * 22, bh = (base - top) * (0.2 + st.rand() * 0.9); g.lineTo(x, base - bh); g.lineTo(x + bw, base - bh); x += bw; } }
  else { let x = 0; const peakTop = h * (0.62 + st.rand() * 0.1); while (x < w) { const pw = 30 + st.rand() * 50; g.lineTo(x + pw / 2, peakTop + st.rand() * (base - peakTop) * 0.6); g.lineTo(x + pw, base - (base - top) * 0.3); x += pw; } }
  g.lineTo(w, base); g.closePath(); g.fill();
  return c;
}
