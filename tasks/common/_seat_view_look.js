import * as S3 from './_style3d.js';
import { builder, LIGHT } from './_seat_view_props.js';
import { splitIds } from '../core/style.js';

export { S3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const { lum, sampleTex, hash2, lineMask, linOf, scaleTo, limitSat, keepNamedHues } = S3;
export const hex2lin = linOf;
export const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
export function shuffled(rnd, list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const idOfDefault = (x) => (typeof x === 'object' ? JSON.stringify(x) : String(x));
const SPLIT_MEMO = new Map();
export function splitList(style, pool, list, { idOf = idOfDefault, minTest } = {}) {
  const ids = [...new Set(list.map(idOf))];
  if (ids.length < 2) return list;
  const mt = minTest ?? (ids.length >= 6 ? 2 : 1), key = `${pool}|${mt}|${ids.join(',')}`;
  let f = SPLIT_MEMO.get(key);
  if (!f) { f = splitIds(`g05_${pool}`, ids, mt); SPLIT_MEMO.set(key, f); }
  const out = list.filter((x) => f(idOf(x)) === style.split);
  if (!out.length) throw new Error(`g05 pool ${pool}: empty ${style.split} split`);
  return out;
}
export function pickS(style, pool, list, opts = {}) {
  const it = pickOf(style.rand, splitList(style, pool, list, opts));
  style.note(`${pool}:${(opts.idOf || idOfDefault)(it)}`);
  return it;
}

export function faceOf(mean, L, { warmSat = 0.42, otherSat = 0.22, named = [] } = {}) {
  const [h] = S3.hueSat(mean);
  const warm = h >= 16 && h <= 60;
  let c = limitSat(mean, warm ? warmSat : otherSat);
  if (named.length) c = keepNamedHues(c, named, 0.12, warm ? warmSat : otherSat);
  return scaleTo(c, L);
}
const keepOff = (c, named, maxSat = 0.12, otherMax = 1) => (named.length ? keepNamedHues(c, named, maxSat, otherMax) : c);
export function texSampler(T, { cv = 0.25, texWorld = 1, chroma = 0.35, lo = 0.45, hi = 1.6 } = {}) {
  const k = Math.min(1.25, cv / Math.max(1e-6, T.cv)), invL = 1 / Math.max(1e-6, lum(T.mean)), tpm = T.n / texWorld, S = new Float64Array(3);
  const m = T.mean;
  return (u, v, fp, face, out) => {
    sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const l = lum(S) * invL, t = clamp(1 + k * (l - 1), lo, hi);
    if (chroma > 0 && l > 1e-4) {
      for (let c = 0; c < 3; c++) { const r = clamp((S[c] / Math.max(1e-6, m[c])) / l, 0.6, 1.6); out[c] = face[c] * t * (1 + chroma * (r - 1)); }
    } else { out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t; }
  };
}

const UV = [0, 0];
export function shapeUV(x, y, z, nx, ny, nz, s) {
  if (s.k === 1) {
    const px = x - s.cx, pz = z - s.cz, lx = px * s.ca - pz * s.sa, lz = px * s.sa + pz * s.ca, ly = y - s.cy;
    const n0 = Math.abs(nx * s.ca - nz * s.sa), n2 = Math.abs(nx * s.sa + nz * s.ca);
    if (Math.abs(ny) >= Math.max(n0, n2)) { if (s.hx >= s.hz) { UV[0] = lz; UV[1] = lx; } else { UV[0] = lx; UV[1] = lz; } }
    else if (n0 > n2) { if (s.hz >= s.hy) { UV[0] = ly; UV[1] = lz; } else { UV[0] = lz; UV[1] = ly; } }
    else if (s.hx >= s.hy) { UV[0] = ly; UV[1] = lx; } else { UV[0] = lx; UV[1] = ly; }
    return UV;
  }
  if ((s.k === 2 || s.k === 3) && Math.abs(ny) < 0.7) {
    const r = s.k === 2 ? s.r : 0.5 * (s.r0 + s.r1);
    UV[0] = Math.atan2(x - s.cx, z - s.cz) * r; UV[1] = y; return UV;
  }
  if (s.k === 5) {
    const ax = s.bx - s.ax, ay = s.by - s.ay, az = s.bz - s.az, L = Math.hypot(ax, ay, az) || 1;
    UV[1] = ((x - s.ax) * ax + (y - s.ay) * ay + (z - s.az) * az) / L;
    UV[0] = (Math.abs(ay) > Math.abs(ax) ? x : y) * 0.7 + z * 0.3; return UV;
  }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) { UV[0] = x; UV[1] = z; } else if (ax >= az) { UV[0] = z; UV[1] = y; } else { UV[0] = x; UV[1] = y; }
  return UV;
}

export function texMat(T, face, { cv = 0.25, texWorld = 0.6, chroma = 0.35, ks = 0.1, sh = 22, env = 0, grain = false, salt = 0 } = {}) {
  const smp = texSampler(T, { cv, texWorld, chroma });
  const swap = grain && T.gxy > 1;
  return { c: face, ks, sh, env, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.003) => {
    const uv = shapeUV(x, y, z, nx, ny, nz, s), o = hash2(s.id + salt, 31) * 3.7;
    const a = uv[0] + o, b = uv[1] + 1.3 * o;
    if (grain) { if (swap) smp(a, b, fp, face, out); else smp(b, a, fp, face, out); } else smp(a, b, fp, face, out);
  } };
}
export const FINISH = {
  gloss: { ks: 0.45, sh: 60, env: 0.14 }, satin: { ks: 0.22, sh: 32, env: 0.06 }, matte: { ks: 0.04, sh: 8, env: 0 },
  metal: { ks: 0.42, sh: 46, env: 0.16 }, brushed: { ks: 0.3, sh: 22, env: 0.1 },
};
export function flatMat(hex, finish = 'satin') { return { c: typeof hex === 'string' ? linOf(hex) : hex, ...FINISH[finish] }; }

function planksFloor(T, face, { plank = 0.15, PL = 1.1, alongX = false, salt = 0, cv = 0.32, seamK = 0.36 } = {}) {
  const smp = texSampler(T, { cv, texWorld: 1.1, chroma: 0.5 }), swap = T.gxy > 1, F = new Float64Array(3);
  return (x, z, fp, out) => {
    const a = alongX ? z : x, b = alongX ? x : z;
    const row = Math.floor(a / plank), off = hash2(row + salt, 7) * PL;
    const seg = Math.floor((b + off) / PL), tone = hash2(row + salt, seg + 3 * salt);
    const k = 0.84 + 0.32 * tone; F[0] = face[0] * k; F[1] = face[1] * k; F[2] = face[2] * k;
    const u = a - row * plank + hash2(row, seg + 11) * 0.8, v = b + off + tone * 5.3;
    if (swap) smp(u, v, fp, F, out); else smp(v, u, fp, F, out);
    const seam = Math.max(lineMask(a, plank, 0.0035, fp), lineMask(b + off, PL, 0.003, fp) * 0.8);
    const s = 1 - seamK * seam; out[0] *= s; out[1] *= s; out[2] *= s;
  };
}
function slabFloor(T, face, { texWorld = 1.6, cv = 0.3, chroma = 0.45, rot = 0 } = {}) {
  const smp = texSampler(T, { cv, texWorld, chroma }), c = Math.cos(rot), s = Math.sin(rot);
  return (x, z, fp, out) => smp(x * c - z * s, x * s + z * c, fp, face, out);
}
function tilesFloor(T, face, { tile = 0.45, salt = 0, cv = 0.14 } = {}) {
  const grout = scaleTo(limitSat(face, 0.08), lum(face) * (lum(face) > 0.25 ? 0.55 : 1.9));
  return S3.texTileFloor({ tex: T, tile, face, grout: grout.map((v) => Math.min(0.85, v)), cv, salt, texWorld: Math.max(0.6, tile * 2), tone: 0.06, groutHW: 0.003, groutK: 0.8 });
}
function withRug(base, T, face, border, rug) {
  const smp = texSampler(T, { cv: 0.25, texWorld: 0.7, chroma: 0.4 });
  return (x, z, fp, out) => {
    let d;
    if (rug.r) d = rug.r - Math.hypot(x - (rug.cx || 0), z - (rug.cz || 0));
    else d = Math.min(x - rug.x0, rug.x1 - x, z - rug.z0, rug.z1 - z);
    if (d < 0) { base(x, z, fp, out); return; }
    smp(x, z, fp, d < rug.band ? border : face, out);
    if (d < 0.012) { const k = 0.82; out[0] *= k; out[1] *= k; out[2] *= k; }
  };
}

function plainWall(T, face, { skirtH = 0.08, skirt, texWorld = 1.6, cv = 0.22 } = {}) {
  return S3.texWall({ tex: T, face, cv, texWorld, skirtH, skirt: skirt || face.map((v) => Math.min(0.85, v * 1.1)), seam: 0.45 });
}
function wainscotWall(W, wface, P, pface, { dado = 0.9, board = 0.12 } = {}) {
  const ws = texSampler(W, { cv: 0.3, texWorld: 1.0, chroma: 0.45 }), ps = texSampler(P, { cv: 0.18, texWorld: 1.6, chroma: 0.2 }), swap = W.gxy > 1;
  return (x, y, fp, out) => {
    if (y < dado) {
      const k = 0.92 + 0.16 * hash2(Math.floor(x / board), 5), F = [wface[0] * k, wface[1] * k, wface[2] * k];
      if (swap) ws(x, y, fp, F, out); else ws(y, x, fp, F, out);
      const j = 1 - 0.4 * lineMask(x, board, 0.004, fp) - (y < 0.07 ? 0.15 : 0);
      out[0] *= j; out[1] *= j; out[2] *= j;
    } else ps(x, y, fp, pface, out);
    const rail = Math.max(0, Math.min(1, (0.016 - Math.abs(y - dado)) / Math.max(fp, 1e-6) + 0.5));
    if (rail > 0) { const r = [wface[0] * 1.15, wface[1] * 1.15, wface[2] * 1.15]; for (let c = 0; c < 3; c++) out[c] += (r[c] - out[c]) * rail; }
  };
}

export const SKINS = ['#f3d2b3', '#e8bf9c', '#e2b896', '#d4a581', '#c99a76', '#b98563', '#9a6a4a', '#7a5038', '#5e3c2a'];
export const HAIRS = ['#1b1714', '#2a2420', '#3a2a20', '#4a3324', '#6b4a2e', '#8a6340', '#b08850', '#c9a36a', '#8c8c8c', '#d8d4cc', '#5a2f22'];
export const PANTS = ['#2f3a48', '#3b4a5c', '#34393f', '#4a4036', '#5a5248', '#2b2b30', '#6b6f78', '#7a6a55', '#40506a', '#556070', '#3e4a3a', '#8a7f6a', '#232a36'];
export const SHIRTS = [
  ['terracotta', '#c8553d', 'red'], ['brick', '#a8432f', 'red'], ['rose', '#d07a98', 'pink'], ['blue', '#3f7cc0', 'blue'], ['navy', '#2c4466', 'blue'],
  ['sky', '#6aa5d8', 'blue'], ['green', '#4f9a62', 'green'], ['forest', '#2f6b45', 'green'], ['olive', '#6f7a3a', 'olive'], ['mustard', '#e0b23e', 'yellow'],
  ['lemon', '#e8d55a', 'yellow'], ['orange', '#e07a3a', 'orange'], ['purple', '#8a5ab0', 'purple'], ['plum', '#6a3a6a', 'purple'], ['lilac', '#a898d0', 'purple'],
  ['teal', '#2a9a8f', 'teal'], ['mint', '#8fd0b0', 'teal'], ['white', '#eeeae2', 'white'], ['grey', '#9aa0a8', 'grey'], ['black', '#2e3034', 'black'],
  ['khaki', '#a8986e', 'brown'], ['brown', '#7a5236', 'brown'],
];

const SKIP_FLOOR = new Set(['dry_riverbed_rock', 'hangar_concrete_floor', 'concrete_floor_painted', 'painted_concrete']);
const PLANKY = (id) => /floor|plank|parquet|laminate|deck/.test(id);
const BUILT_PATTERN = (id) => /tiles|paving|pavement|cobble|pattern|patern|brick/.test(id);

export async function seatLook(style, opt = {}) {
  const rnd = style.rand, setting0 = opt.setting || 'room';
  const named = opt.named || [];
  const offNamed = (t) => { const [h, sat] = S3.hueSat(t.mean_lin); return !(sat > 0.35 && named.some(([nh, w]) => S3.hueDist(h, nh) < w + 2)); };
  const P = (use, f = () => true) => style.pool('tex', (t) => t.use === use && f(t) && offNamed(t));
  const woods = P('wood'), floorsT = P('floor', (t) => !SKIP_FLOOR.has(t.id)), stones = P('stone'), fabrics = P('fabric');
  const wallsT = P('wall'), terrain = P('terrain'), metals = P('metal');
  const roomFloors = [
    ...woods.map((t) => ({ t, kind: PLANKY(t.id) ? 'woodslab' : 'planks' })),
    ...floorsT.map((t) => ({ t, kind: BUILT_PATTERN(t.id) ? 'slab' : 'tiles' })),
    ...stones.filter((t) => /floor|tile|slab|cobble|pebble/.test(t.id)).map((t) => ({ t, kind: 'slab' })),
    ...fabrics.filter((t) => !/leather|satin|velour|jacquard|terry/.test(t.id)).map((t) => ({ t, kind: 'carpet' })),
  ];
  const grounds = [
    ...terrain.map((t) => ({ t, kind: 'terrain' })),
    ...stones.filter((t) => /cobble|pebble|floor|tile|slab/.test(t.id)).map((t) => ({ t, kind: 'slab' })),
    ...floorsT.filter((t) => /paving|pavement|asphalt|cobble|gravel|concrete/.test(t.id)).map((t) => ({ t, kind: 'slab' })),
    ...woods.filter((t) => /deck|planks|weathered/.test(t.id)).map((t) => ({ t, kind: 'deck' })),
    ...(opt.paving ? [...floorsT, ...stones].filter((t) => !BUILT_PATTERN(t.id) && !/rock_wall|cliff|seaside/.test(t.id)).map((t) => ({ t, kind: 'paving' })) : []),
  ];
  const wallEntries = [...wallsT.map((t) => ({ t, kind: 'wall' })), ...woods.filter((t) => /plank|wall|wood_planks/.test(t.id)).map((t) => ({ t, kind: 'boards' }))];
  const hdAll = style.pool('hdri'), hdOut = style.pool('hdri', (h) => !['indoor', 'studio'].includes(h.use));
  const nF = setting0 === 'outdoor' ? 0 : roomFloors.length, nG = setting0 === 'room' ? 0 : grounds.length;
  const [fi, wi, hi] = style.primaryCombo('g05-env', [nF + nG, wallEntries.length, hdAll.length]);
  const setting = fi < nF ? 'room' : 'outdoor';
  const fl = setting === 'room' ? roomFloors[fi] : grounds[fi - nF];
  const wl = wallEntries[wi];
  const hd = setting === 'room' ? hdAll[hi] : hdOut[hi % hdOut.length];
  style.note(`setting:${setting}`); style.note(`tex:${fl.t.id}`); if (setting === 'room') style.note(`tex:${wl.t.id}`); style.note(`hdri:${hd.id}`);
  const woodA = pickOf(rnd, woods), woodB = pickOf(rnd, woods), fabA = pickOf(rnd, fabrics), fabB = pickOf(rnd, fabrics), fabC = pickOf(rnd, fabrics);
  const metA = pickOf(rnd, metals), stoneA = pickOf(rnd, [...stones, ...floorsT.filter((t) => /concrete|plaster/.test(t.id))]);
  const plasterT = pickOf(rnd, wallsT.filter((t) => /plaster|concrete|beige/.test(t.id)).concat(wallsT.slice(0, 1)));
  const rugT = pickOf(rnd, fabrics);
  for (const t of [woodA, woodB, fabA, fabB, fabC, metA, stoneA]) style.note(`tex:${t.id}`);
  const [FT, WT, SKY, WA, WB, FA, FB, FC, MA, SA, PT, RT] = await Promise.all([fl.t, wl.t].map((t) => S3.loadTexture(t.file))
    .concat([S3.loadSky(hd.sky)], [woodA, woodB, fabA, fabB, fabC, metA, stoneA, plasterT, rugT].map((t) => S3.loadTexture(t.file))));

  const [fL0, fL1] = opt.floorL || [0.13, 0.46];
  const fJ = rnd(), salt = 1 + Math.floor(rnd() * 997);
  let floorFace, floorFn;
  const kf = fl.kind;
  if (kf === 'planks' || kf === 'deck') {
    floorFace = faceOf(FT.mean, fL0 + (fL1 - fL0) * fJ, { warmSat: 0.5 });
    floorFn = planksFloor(FT, floorFace, { plank: pickS(style, 'plank_w', [0.1, 0.13, 0.16, 0.2]), PL: pickS(style, 'plank_len', [0.9, 1.2, 1.6]), alongX: rnd() < 0.5, salt, seamK: kf === 'deck' ? 0.55 : 0.36 });
  } else if (kf === 'paving') {
    floorFace = faceOf(FT.mean, fL0 + (fL1 - fL0) * fJ, { otherSat: 0.16 });
    const slab = pickS(style, 'paving_slab', [0.5, 0.6, 0.75, 0.9]), grout = scaleTo(limitSat(floorFace, 0.08), lum(floorFace) * 0.5);
    floorFn = S3.texTileFloor({ tex: FT, tile: slab, face: floorFace, grout, cv: 0.2, salt, texWorld: slab * 2, tone: 0.12, groutHW: 0.006, groutK: 0.75 });
  } else if (kf === 'tiles') {
    floorFace = faceOf(FT.mean, fL0 + (fL1 - fL0) * fJ, { otherSat: 0.16 });
    floorFn = tilesFloor(FT, floorFace, { tile: pickS(style, 'tile_size', [0.3, 0.4, 0.5, 0.6]), salt });
  } else if (kf === 'carpet') {
    floorFace = faceOf(FT.mean, fL0 + (fL1 - fL0) * fJ, { otherSat: 0.18, warmSat: 0.35 });
    floorFn = slabFloor(FT, floorFace, { texWorld: 0.9, cv: 0.2, chroma: 0.3 });
  } else {
    floorFace = faceOf(FT.mean, fL0 + (fL1 - fL0) * fJ, { otherSat: kf === 'terrain' ? 0.3 : 0.18, warmSat: 0.45 });
    floorFn = slabFloor(FT, floorFace, { texWorld: kf === 'terrain' ? 2.6 : kf === 'woodslab' ? 1.8 : 1.6, cv: kf === 'terrain' ? 0.4 : 0.3, chroma: kf === 'terrain' ? 0.6 : 0.45, rot: rnd() < 0.5 ? 0 : Math.PI / 2 });
  }
  floorFace = keepOff(floorFace, named, 0.12, 0.45);
  let rug = null;
  if (setting === 'room' && opt.rug && kf !== 'carpet' && rnd() < 0.4) {
    const rf = faceOf(RT.mean, 0.12 + 0.3 * rnd(), { otherSat: 0.2, warmSat: 0.35 }), rb = scaleTo(rf, lum(rf) * (rnd() < 0.5 ? 0.6 : 1.5));
    floorFn = withRug(floorFn, RT, keepOff(rf, named), keepOff(rb.map((v) => Math.min(0.8, v)), named), { ...opt.rug, band: 0.07 });
    rug = rugT.id; style.note(`rug:${rugT.id}`);
  }
  let wallFn = null, wallFace = null;
  if (setting === 'room') {
    const wJ = rnd();
    if (wl.kind === 'boards') {
      wallFace = faceOf(WT.mean, 0.18 + 0.25 * wJ, { warmSat: 0.45 });
      if (pickS(style, 'board_wall', ['wainscot', 'wainscot', 'boards']) === 'wainscot') {
        const pf = faceOf(PT.mean, Math.max(0.42 + 0.28 * rnd(), Math.min(0.72, 1.5 * lum(floorFace))), { otherSat: 0.12, warmSat: 0.2 });
        wallFn = wainscotWall(WT, keepOff(wallFace, named), PT, keepOff(pf, named), { dado: 0.8 + 0.2 * rnd() });
      } else wallFn = planksWall(WT, keepOff(wallFace, named));
    } else {
      let wL = Math.min(0.68, Math.max(0.26, 0.24 + 0.9 * lum(WT.mean))) * (0.9 + 0.2 * wJ);
      const fLum = lum(floorFace);
      if (wL < 1.5 * fLum && wL > 0.62 * fLum) wL = 1.5 * fLum <= 0.72 ? 1.5 * fLum : 0.62 * fLum;
      wallFace = faceOf(WT.mean, wL, { otherSat: 0.14, warmSat: 0.28 });
      wallFace = keepOff(wallFace, named, 0.1, 0.28);
      wallFn = plainWall(WT, wallFace, { texWorld: /brick|block|stone|medieval|castle/.test(wl.t.id) ? 1.8 : 2.2 });
    }
  }
  let light = S3.hdriLight(hd, opt.baseLight || LIGHT, { albedo: floorFace, total: opt.total ?? 1.44, jitter: rnd() });
  const lit = floorFace.map((v, c) => v * (light.col[c] * 0.82 + light.sky[c]));
  const safe = S3.safeTint(lit, { maxSat: 0.3, otherSat: 0.1 });
  if (safe.some((v, c) => Math.abs(v - lit[c]) > 1e-9)) {
    floorFace = floorFace.map((v, c) => v * safe[c] / Math.max(1e-9, lit[c]));
    light = S3.hdriLight(hd, opt.baseLight || LIGHT, { albedo: floorFace, total: opt.total ?? 1.44, jitter: rnd() });
  }
  const sky = S3.skyFn(SKY, 0.7 * lum(light.sky) / 0.46);
  let fog = null;
  if (setting === 'outdoor') {
    const hz = hd.horizon ? limitSat(hd.horizon, 0.15) : [0.7, 0.72, 0.75];
    fog = { d0: opt.fogD0 ?? 7, d1: opt.fogD1 ?? 24, col: scaleTo(hz, 0.62 + 0.12 * rnd()), max: 0.8 };
  }

  const woodFace = (T, j) => faceOf(T.mean, 0.09 + 0.3 * j, { warmSat: 0.55, named });
  const woodMatA = texMat(WA, woodFace(WA, rnd()), { cv: 0.38, texWorld: 0.7, chroma: 0.6, grain: true, ks: 0.12, sh: 26 });
  const woodMatB = texMat(WB, woodFace(WB, rnd()), { cv: 0.38, texWorld: 0.7, chroma: 0.6, grain: true, ks: 0.1, sh: 22 });
  const kit = {
    woodA: woodMatA, woodB: woodMatB,
    metal: (hex, finish = 'metal') => texMat(MA, scaleTo(limitSat(linOf(hex), 0.25), Math.max(0.02, lum(linOf(hex)))), { cv: 0.12, texWorld: 0.5, chroma: 0.1, ...FINISH[finish] }),
    fabric: (hex, which = 0, cv = 0.22) => texMat([FA, FB, FC][which], linOf(hex), { cv, texWorld: 0.28, chroma: 0.15, ks: 0.03, sh: 8 }),
    stone: (L) => texMat(SA, faceOf(SA.mean, L, { otherSat: 0.12, warmSat: 0.25 }), { cv: 0.25, texWorld: 0.8, chroma: 0.3, ks: 0.06, sh: 12 }),
    plaster: (hex) => texMat(PT, linOf(hex), { cv: 0.12, texWorld: 1.4, chroma: 0, ks: 0.02, sh: 6 }),
    ceramic: (hex, finish = 'satin') => texMat(SA, linOf(hex), { cv: 0.14, texWorld: 0.5, chroma: 0, ...FINISH[finish] }),
    textures: { WA, WB, FA, FB, FC, MA, SA, PT },
  };
  const env = (base = {}) => {
    const e = { floorY: base.floorY ?? 0, floor: floorFn, sky };
    if (setting === 'room' && (base.wallZ !== undefined || base.wallX !== undefined)) {
      e.wall = wallFn; e.wallSide = wallFn;
      if (base.wallZ !== undefined) e.wallZ = base.wallZ;
      if (base.wallX !== undefined) { e.wallX = base.wallX; e.wallXDir = base.wallXDir; }
    }
    if (fog) e.fog = fog;
    return e;
  };
  const layout = setting === 'room' ? pickS(style, 'wall_layout', opt.layouts || ['back', 'back', 'side', 'corner', 'open']) : 'none';
  const walls = (base, eyeX) => {
    const o = {};
    if (layout === 'back' || layout === 'corner') o.wallZ = base.wallZ;
    if ((layout === 'side' || layout === 'corner') && base.sideX) { const sg = eyeX < 0 ? -1 : 1; o.wallX = -sg * base.sideX; o.wallXDir = sg; }
    return env(o);
  };
  const wallMat = wallFn ? { c: wallFace, ks: 0.02, sh: 6, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.004) => wallFn(Math.abs(nx) > 0.5 ? z : x, y, fp, out) } : null;
  return {
    setting, env, walls, layout, light, sky, fog, kit, floorFace, wallFace, wallMat, rnd,
    ids: { layout, floor: fl.t.id, floorKind: kf, wall: setting === 'room' ? wl.t.id : null, wallKind: setting === 'room' ? wl.kind : null, hdri: hd.id, rug, woodA: woodA.id, woodB: woodB.id },
  };
}
function planksWall(T, face) {
  const smp = texSampler(T, { cv: 0.3, texWorld: 1.2, chroma: 0.45 }), swap = T.gxy > 1;
  return (x, y, fp, out) => {
    const k = 0.9 + 0.2 * hash2(Math.floor(y / 0.16), 9), F = [face[0] * k, face[1] * k, face[2] * k];
    if (swap) smp(y, x, fp, F, out); else smp(x, y, fp, F, out);
    const j = 1 - 0.38 * lineMask(y, 0.16, 0.003, fp) - (y < 0.08 ? 0.18 : 0);
    out[0] *= j; out[1] *= j; out[2] *= j;
  };
}

export function outfit(style, base, shirtHex) {
  return { shirt: shirtHex, pants: pickS(style, 'pants', PANTS, { minTest: 3 }), hair: pickS(style, 'hair', HAIRS, { minTest: 3 }), skin: pickS(style, 'skin', SKINS, { minTest: 3 }), long: !!base.long };
}
export function shirtSet(style, n, { minDE = 26, avoid = [], exclude = [] } = {}) {
  const pool = shuffled(style.rand, splitList(style, 'shirt', SHIRTS, { idOf: (x) => x[0], minTest: 9 }));
  const out = [], fams = new Set();
  const ok = ([name, hex, fam]) => {
    if (exclude.includes(name) || exclude.includes(fam)) return false;
    const c = linOf(hex), [h, s] = S3.hueSat(c);
    return !(s > 0.2 && avoid.some(([ah, w]) => S3.hueDist(h, ah) < w));
  };
  for (const it of pool) {
    if (out.length === n) break;
    if (!ok(it) || fams.has(it[2])) continue;
    if (out.every(([, o]) => S3.deltaE(linOf(o), linOf(it[1])) >= minDE)) { out.push([it[0], it[1]]); fams.add(it[2]); }
  }
  for (const it of pool) {
    if (out.length === n) break;
    if (!ok(it) || out.some(([nm]) => nm === it[0])) continue;
    if (out.every(([, o]) => S3.deltaE(linOf(o), linOf(it[1])) >= minDE)) out.push([it[0], it[1]]);
  }
  for (const [nm] of out) style.note(`shirt:${nm}`);
  return out;
}

export function styledBuilder(remap) {
  const B = builder(), mat0 = B.mat, def0 = B.matDef;
  B.role = '';
  B.mat = (name, hex) => {
    const d = remap(name, hex, B.role, null);
    return d ? def0(`${B.role}|${name}:${hex}`, d) : mat0(name, hex);
  };
  B.matDef = (key, def) => {
    const d = remap('def', key, B.role, def);
    return d ? def0(`${B.role}|def:${key}`, d) : def0(key, def);
  };
  return B;
}
export function clothesRemap(look, outfits) {
  const shirts = new Set(outfits.map((o) => o.shirt)), pants = new Set(outfits.map((o) => o.pants)), cache = new Map();
  return (name, hex) => {
    if (name !== 'cloth') return null;
    const k = hex + (shirts.has(hex) ? 's' : 'p');
    if (!cache.has(k)) cache.set(k, shirts.has(hex) ? look.kit.fabric(hex, 1, 0.18) : pants.has(hex) ? look.kit.fabric(hex, 2, 0.25) : null);
    return cache.get(k);
  };
}
