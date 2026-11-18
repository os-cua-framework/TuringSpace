import * as S3 from './_style3d.js';
import { splitIds } from '../core/style.js';

export { S3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lum = S3.lum;
export const lin = S3.linOf;
const SRGB = (v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
export const toSRGB = (c) => c.map(SRGB);
export const fromSRGB = (c) => c.map((v) => Math.pow(clamp(v / 255, 0, 1), 2.2));

export function texFace(tex, { lo = 0.18, hi = 0.5, maxSat = 0.35, named = null, j = 0.5 } = {}) {
  let c = named ? S3.keepNamedHues(tex.mean, named, 0.12, maxSat) : S3.limitSat(tex.mean, maxSat);
  const L = clamp(0.2 + 1.6 * lum(tex.mean), 0, 1);
  return S3.scaleTo(c, lo + (hi - lo) * clamp(0.75 * L + 0.25 * j, 0, 1));
}

export function lightTotal(L) {
  const d = L.dir, nd = Math.max(0.2, d[1] / Math.hypot(d[0], d[1], d[2]));
  const f = L.fill ? Math.max(0, L.fill.dir[1] / Math.hypot(...L.fill.dir)) * lum(L.fill.col) : 0;
  return lum(L.col) * nd + lum(L.sky) + f;
}

export function texPlankFloor({ tex, face, plank = 0.15, plankL = 1.2, cv = 0.14, seam = 0.42, salt = 0, texWorld = 0.9, seamW = 0.0035 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, lum(tex.mean));
  const swap = tex.gxy > 1, tpm = tex.n / texWorld, S = new Float64Array(3), jx = 0.7 * texWorld / 0.9, jz = 3.1 * texWorld / 0.9;
  return (x, z, fp, out) => {
    const row = Math.floor(x / plank), off = S3.hash2(row + salt, 7) * plankL;
    const seg = Math.floor((z + off) / plankL), h1 = S3.hash2(row, seg + salt), h2 = S3.hash2(seg - salt, row + 31);
    const along = z + off - seg * plankL + h1 * jz, across = x - row * plank + h2 * jx;
    const u = swap ? across : along, v = swap ? along : across;
    S3.sampleTex(tex, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const t = (0.9 + 0.2 * h1) * clamp(1 + k * (lum(S) * invL - 1), 0.6, 1.4);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
    const m = Math.max(S3.lineMask(x, plank, seamW, fp), S3.lineMask(z + off, plankL, seamW * 0.86, fp) * 0.8);
    const w = 1 - seam * m; out[0] *= w; out[1] *= w; out[2] *= w;
  };
}
export function texGround({ tex, face, cv = 0.2, texWorld = 1.6 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, lum(tex.mean)), tpm = tex.n / texWorld, S = new Float64Array(3);
  return (x, z, fp, out) => {
    S3.sampleTex(tex, x * tpm, z * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const t = clamp(1 + k * (lum(S) * invL - 1), 0.55, 1.45);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
  };
}
export function turned(fn, e1, e2) {
  return (x, z, fp, out) => fn(x * e1[0] + z * e1[2], x * e2[0] + z * e2[2], fp, out);
}

export function texMat({ tex, tint, cv = 0.18, world = 0.5, fp = 0.008, ks = 0.12, sh = 24, env = 0 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, lum(tex.mean)), tpm = tex.n / world;
  const lod = Math.log2(Math.max(1e-9, fp * tpm)), S = new Float64Array(3);
  const mat = { c: tint.slice(), ks, sh, env };
  mat.tex = (x, y, z, nx, ny, nz, s, out) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ay >= ax && ay >= az) S3.sampleTex(tex, x * tpm, z * tpm, lod, S);
    else if (ax >= az) S3.sampleTex(tex, z * tpm, y * tpm, lod, S);
    else S3.sampleTex(tex, x * tpm, y * tpm, lod, S);
    const t = clamp(1 + k * (lum(S) * invL - 1), 0.62, 1.38);
    out[0] = tint[0] * t; out[1] = tint[1] * t; out[2] = tint[2] * t;
  };
  return mat;
}

export const PAINT = ['#c8392f', '#2f6db5', '#e0a52a', '#3f8f5a', '#7a4fa3', '#d0662a', '#1f8f8f', '#b0b4ba', '#8a5a3c', '#d64f86',
  '#5d7a2a', '#3a4a6b', '#e4c95a', '#9a2f45', '#4f9fd6', '#6b6f75'];
export const FUR = [['#b07a45', '#f0e6d8'], ['#2d2a28', '#d8c8b0'], ['#d9c6a3', '#f3ece0'], ['#8a5a32', '#e8d7bf'], ['#6e6862', '#ece8e0'],
  ['#c98d4e', '#f4e2c8'], ['#3b3330', '#b9a48a'], ['#e3d3b5', '#ffffff'], ['#a0522d', '#f5deb3'], ['#5a4636', '#c9b49a']];
export const CUSHION = ['#b8473c', '#3f6f9f', '#4f7f4a', '#c9a227', '#7a4f8f', '#2e5e5a', '#a8643a', '#5b6470', '#8f3f5c', '#d8cfc0', '#33507a', '#6f8f3a'];

export function pickK(rnd, arr, k) {
  const a = arr.slice(), out = [];
  for (let i = 0; i < k && a.length; i++) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]);
  return out;
}

export async function pickRoom(style, tag, { floors, walls = null, hdri = () => true }) {
  const F = style.pool('tex', floors), W = walls ? style.pool('tex', walls) : [null], H = style.pool('hdri', hdri);
  const [fi, wi, hi] = style.primaryCombo(tag, [F.length, W.length, H.length]);
  const fl = F[fi], wl = W[wi], hd = H[hi];
  style.note(`tex:${fl.id}`); if (wl) style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const [ftex, wtex, sky] = await Promise.all([S3.loadTexture(fl.file), wl ? S3.loadTexture(wl.file) : null, S3.loadSky(hd.sky)]);
  return { fl, wl, hd, ftex, wtex, sky };
}
export function styledLight(hd, base, { albedo, jitter = 0.5, total = null } = {}) {
  return S3.hdriLight(hd, base, { albedo, jitter, total: total ?? lightTotal(base) });
}
export function safeFace(face, light, base) {
  const nd = Math.max(0.2, base.dir[1] / Math.hypot(...base.dir)), fd = light.fill.dir, fdl = Math.max(0, fd[1] / Math.hypot(...fd));
  const lit = face.map((v, c) => v * (light.col[c] * nd + light.sky[c] + light.fill.col[c] * fdl));
  const safe = S3.safeTint(lit, { maxSat: 0.3, otherSat: 0.1 });
  return face.map((v, c) => v * safe[c] / Math.max(1e-9, lit[c]));
}

export const SKINS_X = [
  { name: 'porcelain', back: [240, 204, 180], palm: [252, 222, 212], nail: [255, 246, 242], crease: [200, 140, 126] },
  { name: 'light', back: [232, 186, 152], palm: [250, 212, 200], nail: [255, 244, 240], crease: [196, 132, 116] },
  { name: 'rosy', back: [226, 170, 150], palm: [248, 206, 196], nail: [255, 240, 236], crease: [190, 120, 108] },
  { name: 'olive', back: [196, 150, 110], palm: [238, 196, 170], nail: [250, 234, 222], crease: [170, 112, 90] },
  { name: 'tan', back: [206, 150, 104], palm: [242, 196, 170], nail: [252, 236, 226], crease: [176, 112, 88] },
  { name: 'golden', back: [190, 136, 86], palm: [236, 190, 158], nail: [250, 232, 216], crease: [168, 108, 80] },
  { name: 'medium-brown', back: [160, 108, 72], palm: [230, 178, 150], nail: [246, 220, 204], crease: [164, 104, 82] },
  { name: 'brown', back: [140, 92, 62], palm: [226, 170, 146], nail: [244, 214, 200], crease: [160, 100, 80] },
  { name: 'dark-brown', back: [104, 68, 46], palm: [214, 160, 136], nail: [238, 206, 190], crease: [150, 96, 78] },
  { name: 'deep', back: [80, 52, 38], palm: [204, 150, 128], nail: [232, 200, 184], crease: [140, 90, 74] },
];
export const SLEEVES_X = [[84, 118, 170], [96, 146, 118], [168, 92, 88], [120, 110, 150], [70, 78, 92], [200, 170, 90], [60, 120, 140], [150, 150, 150],
  [110, 80, 60], [190, 110, 140], [40, 60, 90], [130, 150, 70], [220, 220, 215], [90, 50, 70]];
const SKIN_SPLIT = splitIds('g02_hand_skin', SKINS_X.map((s) => s.name), 3);
const SLEEVE_SPLIT = splitIds('g02_hand_sleeve', SLEEVES_X.map((c) => c.join(',')), 3);
export const skinsFor = (split) => SKINS_X.filter((s) => SKIN_SPLIT(s.name) === split);
export const sleevesFor = (split) => SLEEVES_X.filter((c) => SLEEVE_SPLIT(c.join(',')) === split);
export function pickKWrap(rnd, arr, k) { const a = pickK(rnd, arr, Math.min(k, arr.length)); while (a.length < k) a.push(arr[Math.floor(rnd() * arr.length)]); return a; }
export const FLOOR_GLAZES = [['terracotta', 18, 0.42], ['sand', 40, 0.3], ['ochre', 45, 0.4], ['khaki', 55, 0.28], ['sage', 95, 0.22], ['mint', 150, 0.16],
  ['slate', 205, 0.16], ['blue-grey', 215, 0.12], ['warm-grey', 30, 0.1], ['charcoal', 0, 0], ['honey', 35, 0.48], ['olive', 70, 0.3],
  ['rust', 14, 0.5], ['teal', 175, 0.3], ['moss', 85, 0.4], ['denim', 220, 0.28], ['cream', 48, 0.16], ['forest', 125, 0.35], ['clay', 25, 0.35]];
export function glazedFace(tex, style, { lo, hi, maxSat, j, p = 0.55 }) {
  if (style.rand() >= p) return { face: texFace(tex, { lo, hi, maxSat, j }), glaze: 'natural' };
  const g = pickSplit(style, 'g02_floor_glaze', FLOOR_GLAZES, (x) => x[0], 5);
  return { face: S3.scaleTo(S3.hueSatColor(g[1], g[2]), lo + (hi - lo) * j), glaze: g[0] };
}

const POOL_SPLITS = new Map();
export function splitItems(style, name, items, id = (x) => String(x), minTest = 1) {
  const ids = items.map(id), key = `${name}|${minTest}|${ids.join('\u0001')}`;
  if (!POOL_SPLITS.has(key)) POOL_SPLITS.set(key, splitIds(name, ids, minTest));
  const f = POOL_SPLITS.get(key);
  return items.filter((_, i) => f(ids[i]) === style.split);
}
export function pickSplit(style, name, items, id = (x) => String(x), minTest = 1) {
  const av = splitItems(style, name, items, id, minTest), it = av[Math.floor(style.rand() * av.length)];
  style.note(`${name}:${id(it)}`);
  return it;
}
