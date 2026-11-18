import * as S3 from './_style3d.js';
import { splitIds } from '../core/style.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const itemId = (x) => (Array.isArray(x) ? x.join('-') : String(x));
export function splitList(pool, items, split, minTest = 1) {
  const f = splitIds(pool, items.map(itemId), minTest);
  const out = items.filter((x) => f(itemId(x)) === split);
  return out.length ? out : items;
}
export function pickSplit(style, rnd, pool, items) {
  const a = splitList(pool, items, style.split);
  const it = a[Math.floor(rnd() * a.length)];
  style.note(`${pool}:${itemId(it)}`);
  return it;
}
const lumL = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toLin = (c) => c.map((v) => Math.pow(v / 255, 2.2));
const toDisp = (c) => c.map((v) => 255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
const satOf = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 1e-9 ? (mx - mn) / mx : 0; };

export const PIPE_THEMES = [
  { id: 'galvanised', c: [150, 158, 164], dark: [110, 118, 124], cap: [70, 78, 86], kind: 1, ks: 0.45, sh: 28, tee: [201, 158, 74], noise: 0.06 },
  { id: 'stainless', c: [192, 198, 204], dark: [148, 154, 160], cap: [92, 98, 104], kind: 1, ks: 0.85, sh: 60, tee: [176, 118, 52], noise: 0.03 },
  { id: 'black_iron', c: [72, 74, 78], dark: [52, 54, 58], cap: [34, 36, 38], kind: 1, ks: 0.32, sh: 22, tee: [214, 170, 82], noise: 0.08 },
  { id: 'copper', c: [186, 112, 70], dark: [150, 86, 52], cap: [92, 60, 42], kind: 1, ks: 0.6, sh: 36, tee: [70, 74, 80], noise: 0.04 },
  { id: 'brass', c: [198, 162, 86], dark: [160, 126, 62], cap: [96, 76, 44], kind: 1, ks: 0.7, sh: 34, tee: [62, 66, 72], noise: 0.04 },
  { id: 'pvc_white', c: [234, 234, 228], dark: [204, 206, 202], cap: [124, 128, 132], kind: 0, ks: 0.22, sh: 18, tee: [74, 112, 168], noise: 0.0 },
  { id: 'pvc_grey', c: [126, 132, 138], dark: [98, 104, 110], cap: [58, 62, 68], kind: 0, ks: 0.18, sh: 16, tee: [214, 170, 82], noise: 0.0 },
  { id: 'abs_black', c: [58, 60, 62], dark: [44, 46, 48], cap: [24, 26, 28], kind: 0, ks: 0.22, sh: 20, tee: [214, 170, 82], noise: 0.0 },
  { id: 'painted_yellow', c: [222, 184, 60], dark: [178, 146, 44], cap: [80, 70, 40], kind: 1, ks: 0.3, sh: 24, tee: [64, 70, 78], noise: 0.03 },
  { id: 'painted_green', c: [92, 140, 96], dark: [70, 108, 74], cap: [40, 60, 44], kind: 1, ks: 0.3, sh: 24, tee: [214, 170, 82], noise: 0.03 },
  { id: 'painted_red', c: [176, 66, 54], dark: [138, 50, 42], cap: [70, 30, 26], kind: 1, ks: 0.3, sh: 24, tee: [214, 170, 82], noise: 0.03, noFluid: true },
  { id: 'cast_iron', c: [96, 88, 82], dark: [74, 68, 62], cap: [44, 40, 36], kind: 1, ks: 0.2, sh: 14, tee: [214, 170, 82], noise: 0.12 },
  { id: 'pex_orange', c: [214, 120, 52], dark: [176, 96, 40], cap: [90, 54, 30], kind: 0, ks: 0.25, sh: 20, tee: [70, 74, 80], noise: 0.0, noFluid: true },
  { id: 'chrome', c: [205, 210, 216], dark: [160, 166, 172], cap: [80, 86, 92], kind: 1, ks: 1.0, sh: 80, tee: [176, 118, 52], noise: 0.0 },
];
const THEME_SPLIT = splitIds('g09_pipe_theme', PIPE_THEMES.map((t) => t.id), 2);
for (const t of PIPE_THEMES) t.split = THEME_SPLIT(t.id);

const TRAY_SKIP = new Set(['interior_tiles', 'hexagonal_concrete_paving', 'cobblestone_floor_08', 'floor_pattern_02',
  'square_floor_patern_01', 'stone_tiles_02', 'dry_riverbed_rock', 'cobblestone_floor_04', 'cobblestone_color',
  'grassy_cobblestone', 'clean_pebbles', 'slab_tiles', 'medieval_blocks_05', 'castle_wall_slates', 'japanese_stone_wall',
  'rustic_stone_wall_02', 'stone_wall', 'stone_wall_04', 'broken_wall', 'rock_tile_floor', 'castle_wall_varriation',
  'fabric_pattern_05', 'fabric_pattern_07', 'gingham_check', 'curly_teddy_checkered', 'book_pattern', 'herringbone_parquet']);
export const trayPool = (style) => style.pool('tex', (t) => ['wood', 'floor', 'stone', 'fabric', 'flat2d', 'metal'].includes(t.use) && !TRAY_SKIP.has(t.id));
const GROUND_SKIP = new Set(['interior_tiles', 'hexagonal_concrete_paving', 'cobblestone_floor_08', 'floor_pattern_02', 'square_floor_patern_01',
  'stone_tiles_02', 'cobblestone_floor_04', 'cobblestone_color', 'grassy_cobblestone', 'slab_tiles', 'medieval_blocks_05', 'castle_wall_slates',
  'japanese_stone_wall', 'rustic_stone_wall_02', 'stone_wall', 'stone_wall_04', 'broken_wall', 'rock_tile_floor', 'castle_wall_varriation',
  'rough_plasterbrick_05', 'brick_moss_001', 'pavement_02', 'concrete_pavement', 'seaworn_sandstone_brick', 'monastery_stone_floor']);
export const groundPool = (style) => style.pool('tex', (t) => ['terrain', 'floor', 'stone'].includes(t.use) && !GROUND_SKIP.has(t.id));

export function texAlbedo(T, { size = 1.5, L = 0.4, contrast = 0.8, sat = 0.45, tile = 0, salt = 0, safe = false }) {
  const m = T.mean, k = L / Math.max(1e-6, lumL(m));
  const base = m.map((v) => v * k);
  if (safe) { const [h] = S3.hueSat(base); if (!(h >= 18 && h <= 160)) sat = Math.min(sat, 0.07); }
  const sK = Math.min(1, sat / Math.max(1e-6, satOf(base)));
  const tpm = T.n / size, S = new Float64Array(3), C = [0, 0, 0];
  return (P, N, fp, out) => {
    let u, v;
    if (Math.abs(N[1]) > 0.5) { u = P[0]; v = P[2]; }
    else if (Math.abs(N[0]) > Math.abs(N[2])) { u = P[2]; v = -P[1]; }
    else { u = P[0]; v = -P[1]; }
    if (tile > 0) {
      const ix = Math.floor(P[0] / tile), iz = Math.floor(P[2] / tile);
      const h1 = S3.hash2(ix + salt, iz - salt), h2 = S3.hash2(ix - 7 * salt, iz + 13), h3 = S3.hash2(ix + 101, iz + 3 * salt);
      const lu = u - Math.floor(u / tile) * tile, lv = v - Math.floor(v / tile) * tile, r = Math.floor(h1 * 4);
      const a = r === 0 ? lu : r === 1 ? lv : r === 2 ? tile - lu : tile - lv;
      const b = r === 0 ? lv : r === 1 ? tile - lu : r === 2 ? tile - lv : lu;
      u = a + h2 * size; v = b + h3 * size;
    }
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    for (let c = 0; c < 3; c++) C[c] = base[c] + (S[c] * k - base[c]) * contrast;
    const Lc = lumL(C);
    for (let c = 0; c < 3; c++) out[c] = 255 * Math.pow(clamp(Lc + (C[c] - Lc) * sK, 0, 1), 1 / 2.2);
  };
}
function noiseAlbedo(T, rgb, { amt = 0.05, size = 0.6 } = {}) {
  if (!T || !(amt > 0)) return null;
  const tpm = T.n / size, S = new Float64Array(3), inv = 1 / Math.max(1e-6, lumL(T.mean)), cv = Math.max(1e-3, T.cv);
  return (P, N, fp, out) => {
    const u = P[0] + 0.7 * P[2], v = P[1] + 0.7 * P[2] - 0.3 * P[0];
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const f = clamp(1 + amt / cv * (lumL(S) * inv - 1), 0.8, 1.2);
    out[0] = rgb[0] * f; out[1] = rgb[1] * f; out[2] = rgb[2] * f;
  };
}
function staveAlbedo(T, L, centre) {
  const base = texAlbedo(T, { size: 0.8, L, contrast: 0.7, sat: 0.5 });
  return (P, N, fp, out) => {
    base(P, N, fp, out);
    if (Math.abs(N[1]) > 0.5) return;
    const a = Math.atan2(P[2] - centre[1], P[0] - centre[0]) / (2 * Math.PI) * 14;
    const d = Math.abs(a - Math.round(a));
    if (d < 0.06) { out[0] *= 0.62; out[1] *= 0.62; out[2] *= 0.62; }
  };
}

const KEY_TEMP = { 'outdoor-midday': [1.0, 0.95, 0.88], 'morning-afternoon': [1.0, 0.9, 0.78], sunset: [1.0, 0.84, 0.68], overcast: [0.95, 0.98, 1.0], urban: [1.0, 0.95, 0.9], indoor: [1.0, 0.92, 0.8], studio: [1.0, 0.98, 0.95] };
export function hdriTint(h, jit = 0.5) {
  const key = S3.scaleTo(S3.safeTint(KEY_TEMP[h.use] || KEY_TEMP.studio, { maxSat: 0.24 }), 1);
  const up = S3.shIrradiance(h.sh9_norm, 0, 1, 0);
  const amb = S3.scaleTo(S3.safeTint(up, { lo: 25, hi: 230, maxSat: 0.16, otherSat: 0.06 }), 1);
  const g = 0.97 + 0.08 * jit;
  return { key: key.map((v) => v * g), amb: amb.map((v) => v * (0.94 + 0.08 * jit)) };
}

export function rotateLight(L, from, to, dAz = 0) {
  const a = (to - from + dAz) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [L[0] * c + L[2] * s, L[1], -L[0] * s + L[2] * c];
}

export async function buildPipeLook(style, role) {
  const themes = PIPE_THEMES.filter((t) => t.split === style.split && !(role === 'fluid' && t.noFluid));
  const trays = trayPool(style), grounds = groundPool(style);
  const [ti, ri, gi] = style.primaryCombo(`g09-${role}-look`, [themes.length, trays.length, grounds.length]);
  const theme = themes[ti], tray = trays[ri], ground = grounds[gi];
  const hd = style.pick('hdri');
  const rnd = style.rand;
  const metalTex = theme.noise > 0 ? style.pick('tex', (t) => t.use === 'metal') : null;
  const woodTex = style.pick('tex', (t) => t.use === 'wood');
  style.note(`pipe:${theme.id}`); style.note(`tex:${tray.id}`); style.note(`tex:${ground.id}`); if (hd) style.note(`hdri:${hd.id}`);
  const [TT, GT, MT, WT] = await Promise.all([S3.loadTexture(tray.file), S3.loadTexture(ground.file), metalTex ? S3.loadTexture(metalTex.file) : null, woodTex ? S3.loadTexture(woodTex.file) : null]);
  const Lp = lumL(toLin(theme.c));
  const u1 = rnd(), u2 = rnd(), u3 = rnd(), u4 = rnd();
  let Lt;
  if (Lp < 0.18) Lt = 0.4 + 0.3 * u1;
  else if (Lp > 0.42) Lt = 0.05 + 0.1 * u1;
  else Lt = u2 < 0.5 ? 0.5 + 0.25 * u1 : 0.04 + 0.06 * u1;
  const gNat = clamp(lumL(GT.mean) * (0.9 + 1.1 * u3), 0.06, 0.6);
  let Lg = gNat;
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio(Lg, Lt) < 1.6) Lg = Lt > 0.25 ? Math.max(0.05, (Lt + 0.05) / 1.7 - 0.05) : Math.min(0.62, (Lt + 0.05) * 1.9 - 0.05);
  const tint = hd ? hdriTint(hd, u4) : { key: [1, 1, 1], amb: [1, 1, 1] };
  const pipeTex = noiseAlbedo(MT, theme.c, { amt: theme.noise });
  const pipeDarkTex = noiseAlbedo(MT, theme.dark, { amt: theme.noise });
  const mats = {
    pipe: { c: theme.c, kd: theme.kind ? 0.62 : 0.72, ks: theme.ks, sh: theme.sh, kind: theme.kind, ...(pipeTex ? { tex: pipeTex } : {}) },
    pipeDark: { c: theme.dark, kd: theme.kind ? 0.6 : 0.7, ks: theme.ks * 0.8, sh: theme.sh, kind: theme.kind, ...(pipeDarkTex ? { tex: pipeDarkTex } : {}) },
    cap: { c: theme.cap, kd: 0.7, ks: 0.35, sh: 20, kind: 1 },
    drain: { c: [40, 42, 44], kd: 0.7, ks: 0.1, sh: 10, kind: 0 },
    floorG: { c: [128, 128, 128], kd: 0.6, ks: 0, sh: 1, kind: 2, floorShadow: 0.34, tex: texAlbedo(GT, { size: 1.6 + 1.6 * rnd(), L: Lg, contrast: 0.55, sat: 0.45 }) },
  };
  return { theme, tray, ground, hd, tint, mats, TT, WT, Lt, Lg, rnd, ink: [36, 40, 46], style };
}

export const SOURCE_KINDS = ['tank', 'tower', 'drum', 'cistern', 'boiler', 'barrel'];
export const TARGET_KINDS = ['tank', 'bucket', 'planter', 'barrel', 'basin', 'cistern', 'drum'];
const PAINTS = [[96, 150, 205], [74, 128, 176], [118, 160, 196], [86, 140, 122], [160, 160, 168], [196, 202, 208], [210, 196, 160], [168, 120, 84], [226, 228, 230]];

export function vessel(prim, tube, prims, kind, tc, g, pre, isA, rnd) {
  const [x, , z] = tc;
  const M = (k) => pre + k;
  const C = (y0, y1, r, m) => prims.push(prim.cyl([x, y0, z], [x, y1, z], r, M(m), g++));
  switch (kind) {
    case 'tower': {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prims.push(prim.cyl([x + dx * 0.15, 0, z + dz * 0.15], [x + dx * 0.15, 0.24, z + dz * 0.15], 0.022, M('trim'), g));
      g++;
      C(0.22, 0.5, 0.23, 'body'); C(0.46, 0.49, 0.24, 'trim');
      if (isA) C(0.5, 0.512, 0.19, 'water');
      break;
    }
    case 'drum': {
      C(0, 0.5, 0.22, 'body'); C(0.16, 0.18, 0.228, 'trim'); C(0.33, 0.35, 0.228, 'trim'); C(0.48, 0.5, 0.226, 'trim');
      if (isA) C(0.5, 0.506, 0.17, 'water');
      break;
    }
    case 'cistern': {
      prims.push(prim.box([x - 0.21, 0, z - 0.21], [x + 0.21, 0.42, z + 0.21], M('body'), g++));
      prims.push(prim.box([x - 0.225, 0.4, z - 0.225], [x + 0.225, 0.44, z + 0.225], M('trim'), g++));
      if (isA) prims.push(prim.box([x - 0.16, 0.44, z - 0.16], [x + 0.16, 0.446, z + 0.16], M('water'), g++));
      break;
    }
    case 'boiler': {
      C(0, 0.06, 0.24, 'trim'); C(0.06, 0.4, 0.22, 'body');
      prims.push(prim.sphere([x, 0.4, z], 0.22, M('body'), g++));
      C(0.55, 0.64, 0.035, 'trim');
      break;
    }
    case 'bucket': {
      C(0, 0.3, 0.2, 'body'); C(0.28, 0.31, 0.212, 'trim'); C(0.3, 0.303, 0.18, 'water');
      const pts = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([x + 0.2 * Math.cos(a), 0.31 + 0.16 * Math.sin(a), z]); }
      tube(pts, 0.011, M('trim'), g++, prims);
      break;
    }
    case 'planter': {
      C(0, 0.3, 0.22, 'body'); C(0.27, 0.31, 0.235, 'body'); C(0.29, 0.302, 0.2, 'soil');
      const lg = g++;
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4 + rnd() * 0.5, r = k ? 0.1 + 0.03 * rnd() : 0;
        prims.push(prim.sphere([x + r * Math.cos(a), 0.36 + (k ? 0.04 : 0.12) + 0.04 * rnd(), z + r * Math.sin(a)], 0.075 + 0.025 * rnd(), M('leaf'), lg));
      }
      break;
    }
    case 'barrel': {
      C(0, 0.48, 0.22, 'body'); C(0.08, 0.11, 0.227, 'trim'); C(0.37, 0.4, 0.227, 'trim');
      if (isA) C(0.48, 0.486, 0.18, 'water');
      break;
    }
    case 'basin': {
      prims.push(prim.box([x - 0.22, 0, z - 0.22], [x + 0.22, 0.22, z + 0.22], M('body'), g++));
      prims.push(prim.box([x - 0.17, 0.2, z - 0.17], [x + 0.17, 0.226, z + 0.17], M('water'), g++));
      break;
    }
    default: {
      C(0, 0.5, 0.25, 'body'); C(0.41, 0.45, 0.262, 'trim');
      if (isA) C(0.5, 0.512, 0.205, 'water');
    }
  }
  return g;
}
export function vesselMats(kind, pre, look, centre, rnd) {
  const sp = look.style ? look.style.split : 'train';
  const pick = (a) => { const b = splitList('g09_vessel_paint', a, sp); return b[Math.floor(rnd() * b.length)]; };
  let body = { c: pick(PAINTS), kd: 0.8, ks: 0.3, sh: 22, kind: 1 };
  let trim = { c: [88, 96, 104], kd: 0.75, ks: 0.3, sh: 18, kind: 1 };
  if (kind === 'drum') body = { c: pick([[150, 156, 162], [92, 120, 150], [70, 110, 80], [200, 200, 196], [60, 64, 70]]), kd: 0.8, ks: 0.45, sh: 30, kind: 1 };
  if (kind === 'bucket') body = { c: pick([[176, 182, 188], [86, 128, 180], [214, 200, 120]]), kd: 0.75, ks: 0.55, sh: 36, kind: 1 };
  if (kind === 'planter') body = { c: pick([[176, 98, 64], [200, 196, 186], [70, 74, 78], [150, 110, 80]]), kd: 0.85, ks: 0.05, sh: 6, kind: 0 };
  if (kind === 'basin') body = { c: pick([[214, 214, 208], [160, 166, 170], [120, 150, 170]]), kd: 0.8, ks: 0.25, sh: 20, kind: 0 };
  if (kind === 'cistern') body = { c: pick([[204, 206, 200], [96, 120, 104], [150, 150, 140], [70, 90, 120]]), kd: 0.8, ks: 0.15, sh: 12, kind: 0 };
  if (kind === 'barrel') {
    body = look.WT ? { c: [150, 110, 70], kd: 0.85, ks: 0.08, sh: 10, kind: 0, tex: staveAlbedo(look.WT, 0.12 + 0.1 * rnd(), centre) } : { c: [150, 110, 70], kd: 0.85, ks: 0.08, sh: 10, kind: 0 };
    trim = { c: [56, 58, 62], kd: 0.75, ks: 0.35, sh: 20, kind: 1 };
  }
  return {
    [pre + 'body']: body, [pre + 'trim']: trim,
    [pre + 'water']: { c: [70, 140, 215], kd: 0.6, ks: 0.6, sh: 40, kind: 1 },
    [pre + 'soil']: { c: [74, 56, 40], kd: 0.8, ks: 0, sh: 1, kind: 0 },
    [pre + 'leaf']: { c: [84, 140, 70], kd: 0.85, ks: 0.1, sh: 10, kind: 0 },
  };
}
export { staveAlbedo };

export const STORE_KINDS = ['tank', 'drum', 'ibc', 'silo', 'barrel', 'cistern'];
export const VALVE_KINDS = ['wheel', 'lever', 'gate'];
export function storeVessel(prim, tube, prims, kind, x, z, g) {
  const C = (y0, y1, r, m) => prims.push(prim.cyl([x, y0, z], [x, y1, z], r, m, g++));
  switch (kind) {
    case 'drum': C(0, 0.72, 0.27, 'storeBody'); for (const y of [0.22, 0.47, 0.7]) C(y, y + 0.025, 0.278, 'storeTrim'); break;
    case 'ibc': {
      prims.push(prim.box([x - 0.29, 0, z - 0.29], [x + 0.29, 0.08, z + 0.29], 'storeTrim', g++));
      prims.push(prim.box([x - 0.26, 0.08, z - 0.26], [x + 0.26, 0.66, z + 0.26], 'storeBody', g++));
      const cg = g++;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prims.push(prim.box([x + dx * 0.28 - 0.018, 0.08, z + dz * 0.28 - 0.018], [x + dx * 0.28 + 0.018, 0.7, z + dz * 0.28 + 0.018], 'storeTrim', cg));
      for (const y of [0.3, 0.5, 0.68]) {
        prims.push(prim.box([x - 0.29, y, z - 0.29], [x + 0.29, y + 0.02, z - 0.26], 'storeTrim', cg));
        prims.push(prim.box([x - 0.29, y, z + 0.26], [x + 0.29, y + 0.02, z + 0.29], 'storeTrim', cg));
        prims.push(prim.box([x - 0.29, y, z - 0.29], [x - 0.26, y + 0.02, z + 0.29], 'storeTrim', cg));
        prims.push(prim.box([x + 0.26, y, z - 0.29], [x + 0.29, y + 0.02, z + 0.29], 'storeTrim', cg));
      }
      C(0.66, 0.72, 0.07, 'storeTrim');
      break;
    }
    case 'silo': C(0, 0.6, 0.28, 'storeBody'); prims.push(prim.sphere([x, 0.6, z], 0.28, 'storeBody', g++)); C(0.04, 0.09, 0.29, 'storeTrim'); C(0.84, 0.92, 0.05, 'storeTrim'); break;
    case 'barrel': C(0, 0.72, 0.27, 'storeWood'); for (const y of [0.1, 0.33, 0.58]) C(y, y + 0.035, 0.276, 'storeTrim'); break;
    case 'cistern': {
      prims.push(prim.box([x - 0.27, 0, z - 0.27], [x + 0.27, 0.66, z + 0.27], 'storeBody', g++));
      prims.push(prim.box([x - 0.285, 0.64, z - 0.285], [x + 0.285, 0.7, z + 0.285], 'storeTrim', g++));
      break;
    }
    default: C(0, 0.78, 0.3, 'storeBody'); C(0.68, 0.72, 0.312, 'storeTrim'); C(0.04, 0.1, 0.315, 'storeTrim');
  }
  return g;
}
export function valveHandle(prim, tube, prims, kind, x, wy, zc, g) {
  if (kind === 'lever') {
    const lg = g++;
    prims.push(prim.box([x - 0.035, wy - 0.06, zc - 0.035], [x + 0.035, wy - 0.01, zc + 0.035], 'valveTrim', lg));
    prims.push(prim.box([x - 0.022, wy - 0.012, zc - 0.03], [x + 0.022, wy + 0.012, zc + 0.24], 'handle', lg));
    prims.push(prim.capsule([x, wy, zc + 0.24], [x, wy, zc + 0.3], 0.03, 'handle', lg));
    return g;
  }
  if (kind === 'gate') {
    const yg = g++;
    for (const s of [-1, 1]) prims.push(prim.box([x + s * 0.06 - 0.012, wy - 0.3, zc - 0.012], [x + s * 0.06 + 0.012, wy + 0.04, zc + 0.012], 'valveTrim', yg));
    prims.push(prim.box([x - 0.075, wy + 0.03, zc - 0.02], [x + 0.075, wy + 0.06, zc + 0.02], 'valveTrim', yg));
    prims.push(prim.cyl([x, wy + 0.04, zc], [x, wy + 0.14, zc], 0.016, 'valveTrim', g++));
    const ring = [], wr = 0.11, wg = g++;
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([x + wr * Math.cos(a), wy + 0.12, zc + wr * Math.sin(a)]); }
    tube(ring, 0.02, 'handle', wg, prims);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; prims.push(prim.capsule([x, wy + 0.12, zc], [x + wr * Math.cos(a), wy + 0.12, zc + wr * Math.sin(a)], 0.012, 'handle', wg)); }
    return g;
  }
  const ring = [], wr = 0.15, wg = g++;
  for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([x + wr * Math.cos(a), wy, zc + wr * Math.sin(a)]); }
  tube(ring, 0.024, 'handle', wg, prims);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.3; prims.push(prim.capsule([x, wy, zc], [x + wr * Math.cos(a), wy, zc + wr * Math.sin(a)], 0.014, 'handle', wg)); }
  return g;
}
export const HANDLE_COLS = [[196, 72, 60], [214, 120, 40], [226, 190, 60], [60, 110, 180], [40, 44, 48], [70, 140, 90]];
export function storeMats(kind, look, rnd) {
  const sp = look.style ? look.style.split : 'train';
  const pick = (a) => { const b = splitList('g09_store_paint', a, sp); return b[Math.floor(rnd() * b.length)]; };
  let body = { c: pick([[206, 222, 236], [214, 214, 206], [150, 170, 190], [190, 196, 170], [230, 226, 214], [120, 150, 130], [196, 170, 130]]), kd: 0.62, ks: 0.25, sh: 18, kind: 0 };
  let trim = { c: [112, 124, 136], kd: 0.6, ks: 0.4, sh: 24, kind: 1 };
  if (kind === 'drum') body = { c: pick([[60, 100, 160], [170, 60, 50], [70, 120, 80], [60, 64, 70], [200, 200, 196], [210, 170, 60]]), kd: 0.8, ks: 0.45, sh: 30, kind: 1 };
  if (kind === 'ibc') { body = { c: [232, 232, 224], kd: 0.7, ks: 0.15, sh: 12, kind: 0 }; trim = { c: [150, 156, 160], kd: 0.65, ks: 0.5, sh: 30, kind: 1 }; }
  if (kind === 'silo') body = { c: pick([[200, 204, 208], [176, 182, 186], [214, 210, 196]]), kd: 0.7, ks: 0.5, sh: 30, kind: 1 };
  if (kind === 'cistern') body = { c: pick([[204, 206, 200], [96, 120, 104], [150, 150, 140], [70, 90, 120], [56, 60, 64]]), kd: 0.8, ks: 0.15, sh: 12, kind: 0 };
  const wood = look.WT ? { c: [150, 110, 70], kd: 0.85, ks: 0.08, sh: 10, kind: 0, tex: texAlbedo(look.WT, { size: 0.8, L: 0.12 + 0.1 * rnd(), contrast: 0.7, sat: 0.5 }) } : { c: [150, 110, 70], kd: 0.85, ks: 0.08, sh: 10, kind: 0 };
  if (kind === 'barrel') trim = { c: [56, 58, 62], kd: 0.75, ks: 0.35, sh: 20, kind: 1 };
  return { storeBody: body, storeTrim: trim, storeWood: wood };
}
