import * as S3 from './_style3d.js';
import { splitIds } from '../core/style.js';

export { S3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const { lum, sampleTex, hash2, lineMask } = S3;

export function faceColour(mean, L, { warm = [18, 50, 0.5], otherSat = 0.14 } = {}) {
  const [h] = S3.hueSat(mean);
  const c = S3.limitSat(mean, h >= warm[0] && h <= warm[1] ? warm[2] : otherSat);
  return S3.scaleTo(c, L);
}

export function texMod(T, { cv = 0.12, texWorld = 1.0, lo = 0.6, hi = 1.4 } = {}) {
  const k = Math.min(1.2, cv / Math.max(1e-6, T.cv)), invL = 1 / Math.max(1e-6, lum(T.mean)), tpm = T.n / texWorld, S = new Float64Array(3);
  return (u, v, fp) => {
    sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    return clamp(1 + k * (lum(S) * invL - 1), lo, hi);
  };
}

export function gridFloor({ sq, mode = 'checker', A, B = null, faceA, faceB = null, cvA = 0.14, cvB = 0.14, seamHW = 0.012, seamK = 0.5,
  texWorld = 1.0, tone = 0.06, salt = 1 }) {
  const mA = texMod(A, { cv: cvA, texWorld }), mB = B ? texMod(B, { cv: cvB, texWorld }) : mA;
  return (x, z, fp, out) => {
    const i = Math.floor(x / sq), j = Math.floor(z / sq), lx = x - i * sq, lz = z - j * sq;
    const h1 = hash2(i + salt, j - 3 * salt), h2 = hash2(i - 7 * salt, j + 11), h3 = hash2(i + 5, j + 13 * salt);
    const r = Math.floor(h1 * 4);
    const a = r === 0 ? lx : r === 1 ? lz : r === 2 ? sq - lx : sq - lz;
    const b = r === 0 ? lz : r === 1 ? sq - lx : r === 2 ? sq - lz : lx;
    const odd = mode === 'checker' && ((i + j) & 1);
    const face = odd ? faceB : faceA, m = odd ? mB : mA;
    const t = (1 + tone * (h2 * 2 - 1)) * m(a + h3 * texWorld, b + h2 * texWorld, fp);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
    const s = Math.max(lineMask(x, sq, seamHW, fp), lineMask(z, sq, seamHW, fp));
    const w = 1 - seamK * s;
    out[0] *= w; out[1] *= w; out[2] *= w;
  };
}

export function texSurface({ T, face, cv = 0.18, texWorld = 1.2, rot = 0 }) {
  const m = texMod(T, { cv, texWorld, lo: 0.5, hi: 1.5 }), c = Math.cos(rot), s = Math.sin(rot);
  return (x, z, fp, out) => {
    const t = m(x * c - z * s, x * s + z * c, fp);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
  };
}

export const FINISHES = {
  gloss: { ks: 0.45, sh: 45, env: 0.16 },
  satin: { ks: 0.2, sh: 24, env: 0.07 },
  matte: { ks: 0.05, sh: 10, env: 0.02 },
  metallic: { ks: 0.75, sh: 70, env: 0.24 },
  glaze: { ks: 0.6, sh: 110, env: 0.2 },
};
export function paintMat(c, finish, T = null, { cv = 0.1, texWorld = 0.6 } = {}) {
  const m = { c, ks: finish.ks, sh: finish.sh, env: finish.env };
  if (!T) return m;
  const mod = texMod(T, { cv, texWorld, lo: 0.78, hi: 1.22 });
  m.tex = (x, y, z, nx, ny, nz, s, out, fp = 0.004) => {
    const ox = s.cx ?? 0, oz = s.cz ?? 0, oy = s.cy ?? s.y0 ?? 0, off = (s.id ?? 0) * 0.37;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ay >= ax && ay >= az) { u = x - ox; v = z - oz; } else if (ax >= az) { u = z - oz; v = y - oy; } else { u = x - ox; v = y - oy; }
    const t = mod(u + off, v + off * 1.7, fp);
    out[0] = c[0] * t; out[1] = c[1] * t; out[2] = c[2] * t;
  };
  return m;
}

export function reflectFn(skyF, below, k = 1) {
  const T = new Float64Array(3);
  return (dx, dy, dz, out) => {
    if (dy >= 0) { skyF(dx, dy, dz, out); out[0] *= k; out[1] *= k; out[2] *= k; return; }
    skyF(dx, -dy * 0.3, dz, T);
    const w = Math.min(1, -dy * 2.5);
    for (let c = 0; c < 3; c++) out[c] = k * (T[c] * (1 - w) + below[c] * w);
  };
}

export async function loadAll(list) {
  return Promise.all(list.map((it) => (!it ? null : it.sky ? S3.loadSky(it.sky) : S3.loadTexture(it.file))));
}

export function litFix(face, light, dirY, opts = {}) {
  const fd = light.fill ? Math.max(0, light.fill.dir[1] / Math.hypot(...light.fill.dir)) : 0;
  const lit = face.map((v, c) => v * (light.col[c] * dirY + light.sky[c] + (light.fill ? light.fill.col[c] * fd : 0)));
  const safe = faceColour(lit, lum(lit), opts);
  return safe.map((v, c) => v / Math.max(1e-9, lit[c]));
}

export function totalOf(L) {
  const ny = (v) => v[1] / Math.hypot(...v);
  return lum(L.col) * Math.max(0, ny(L.dir)) + lum(L.sky) + (L.fill ? lum(L.fill.col) * Math.max(0, ny(L.fill.dir)) : 0);
}

const SPLITS = new Map();
export function splitOf(style, pool, items, idOf = (x) => x, minTest = 1) {
  const key = `${pool}#${minTest}`;
  if (!SPLITS.has(key)) SPLITS.set(key, splitIds(pool, items.map(idOf), minTest));
  const f = SPLITS.get(key), out = items.filter((x) => f(idOf(x)) === style.split);
  return out.length ? out : items;
}
export function pickOf(style, pool, items, idOf = (x) => x, minTest = 1) {
  const p = splitOf(style, pool, items, idOf, minTest), it = p[Math.floor(style.rand() * p.length)];
  style.note(`${pool}:${idOf(it)}`);
  return it;
}
