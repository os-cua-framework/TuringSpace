import * as S3 from './_style3d.js';

export { S3 };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const { lum, sampleTex } = S3;
export const unit = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
export const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const DECODED = new Map();
function assetUrl(file) {
  const raw = `./assets/${file}`;
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[raw.replace(/^(?:\.\/)+/, '')] || raw;
}
async function decodeRGBA(file) {
  const blob = await (await fetch(assetUrl(file))).blob();
  const bmp = await createImageBitmap(blob);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height)
    : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
}
const SRGB2LIN = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
export function loadSkyImage(file) {
  const k = `sky|${file}`;
  if (!DECODED.has(k)) DECODED.set(k, decodeRGBA(file).then(({ w, h, data }) => {
    const rad = new Float32Array(w * h * 3);
    let sw = 0, sl = 0;
    for (let y = 0; y < h; y++) {
      const wt = Math.sin((y + 0.5) / h * Math.PI / 2);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, o = (y * w + x) * 3;
        for (let c = 0; c < 3; c++) { const l = Math.min(0.97, SRGB2LIN[data[i + c]]); rad[o + c] = l / (1 - 0.12 * l); }
        sl += wt * lum([rad[o], rad[o + 1], rad[o + 2]]); sw += wt;
      }
    }
    return { file, W: w, H: h, rad, meanLum: sl / sw };
  }));
  return DECODED.get(k);
}
export function skyImageFn(sky, { meanLum = 0.55, maxSat = 0.45, azOff = 0, cap = 1.6 } = {}) {
  const { W, H } = sky, k = meanLum / Math.max(1e-6, sky.meanLum), rad = new Float32Array(sky.rad.length);
  for (let i = 0; i < W * H; i++) {
    let c = [sky.rad[i * 3] * k, sky.rad[i * 3 + 1] * k, sky.rad[i * 3 + 2] * k];
    c = S3.limitSat(c, maxSat);
    const L = lum(c); if (L > cap) c = c.map((v) => v * cap / L);
    rad[i * 3] = c[0]; rad[i * 3 + 1] = c[1]; rad[i * 3 + 2] = c[2];
  }
  return (dx, dy, dz, out) => {
    const u = ((Math.atan2(dz, dx) + azOff) / (2 * Math.PI) % 1 + 1) % 1, th = Math.acos(clamp(dy, 0, 1));
    const fx = u * W - 0.5, fy = clamp(th / (Math.PI / 2) * H - 0.5, 0, H - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, y1 = Math.min(H - 1, y0 + 1);
    const xa = (x0 + W) % W, xb = (x0 + 1 + W) % W;
    for (let c = 0; c < 3; c++) {
      out[c] = (rad[(y0 * W + xa) * 3 + c] * (1 - ax) + rad[(y0 * W + xb) * 3 + c] * ax) * (1 - ay)
        + (rad[(y1 * W + xa) * 3 + c] * (1 - ax) + rad[(y1 * W + xb) * 3 + c] * ax) * ay;
    }
  };
}

export function faceOf(mean, L, { maxSat = 0.25, warm = [15, 55], warmSat = 0.45 } = {}) {
  const [h] = S3.hueSat(mean);
  const c = S3.limitSat(mean, h >= warm[0] && h <= warm[1] ? warmSat : maxSat);
  return S3.scaleTo(c, L);
}
export function texRGB(T, { face, texWorld = 1.5, cv = 0.25, keep = 0.5, lo = 0.45, hi = 1.6 }) {
  const tpm = T.n / texWorld, S = new Float64Array(3), mL = Math.max(1e-6, lum(T.mean));
  const k = Math.min(1.3, cv / Math.max(1e-6, T.cv));
  const inv = [1 / Math.max(1e-6, T.mean[0]), 1 / Math.max(1e-6, T.mean[1]), 1 / Math.max(1e-6, T.mean[2])];
  return (u, v, fp, out) => {
    sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const l = clamp(1 + k * (lum(S) / mL - 1), lo, hi);
    for (let c = 0; c < 3; c++) {
      const own = clamp(1 + k * (S[c] * inv[c] - 1), lo, hi);
      out[c] = face[c] * (l + (own - l) * keep);
    }
    return out;
  };
}
export function texLum(T, { texWorld = 1.5, cv = 0.15, lo = 0.6, hi = 1.4 }) {
  const tpm = T.n / texWorld, S = new Float64Array(3), mL = Math.max(1e-6, lum(T.mean)), k = Math.min(1.3, cv / Math.max(1e-6, T.cv));
  return (u, v, fp) => { sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S); return clamp(1 + k * (lum(S) / mL - 1), lo, hi); };
}

const KEY_TEMP = { 'outdoor-midday': [1.0, 0.94, 0.86], 'morning-afternoon': [1.0, 0.9, 0.78], sunset: [1.0, 0.8, 0.6], overcast: [0.95, 0.98, 1.0], urban: [1.0, 0.93, 0.85], indoor: [1.0, 0.9, 0.78], studio: [1.0, 0.97, 0.94] };
export function hdriTone(h) {
  const sh = h.sh9_norm, sun = unit(h.sun_dir);
  const Es = S3.shIrradiance(sh, ...sun), Ea = S3.shIrradiance(sh, -sun[0], -sun[1], -sun[2]);
  const dirPart = [0, 1, 2].map((c) => Math.max(0, Es[c] - Ea[c]));
  const dirness = clamp(lum(dirPart) / Math.max(1e-6, lum(Es) + lum(Ea)), 0, 1);
  const temp = KEY_TEMP[h.use] || KEY_TEMP.studio;
  const key = S3.safeTint(temp, { maxSat: 0.32 });
  const amb = S3.safeTint(S3.shIrradiance(sh, 0, 1, 0), { maxSat: 0.22, otherSat: 0.16, lo: 25, hi: 235 });
  const sunAz = Math.atan2(sun[2], sun[0]);
  return { dirness, key, amb, sunAz, use: h.use };
}

export function pickTex(style, ...filters) {
  for (const f of filters) { const it = style.pick('tex', f); if (it) return it; }
  return style.pick('tex');
}
export function poolTex(style, ...filters) {
  for (const f of filters) { const p = style.pool('tex', f); if (p.length) return p; }
  return style.pool('tex');
}

import { splitIds } from '../core/style.js';
const idOf = (x) => (Array.isArray(x) ? String(x[0]) : typeof x === 'object' && x && x.name ? String(x.name) : String(x));
export function splitList(style, pool, list, minTest = 1) {
  const f = splitIds(pool, list.map(idOf), minTest);
  const out = list.filter((x) => f(idOf(x)) === style.split);
  return out.length ? out : list;
}
export function splitPick(style, pool, list, minTest = 1) {
  const L = splitList(style, pool, list, minTest), it = L[Math.floor(style.rand() * L.length) % L.length];
  style.note(`${pool}:${idOf(it)}`);
  return it;
}
