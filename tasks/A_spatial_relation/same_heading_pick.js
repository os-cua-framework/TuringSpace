import { drawPromptText } from '../core/panel.js';
import { subsetToggle } from '../common/_mech_common.js';
import { shape, makeScene, orbitCam, plankFloor, plasterWall, softSky, STUDIO_LIGHT, cA, fbm, mixInto,
  boxLocal, render, toCanvas, contextScale, silhouetteRings, pickId } from '../common/_heading_rt.js';
import { XMODELS, XCUE_Y, XPALETTE, ALL_KINDS, kindsFor, colorsFor } from '../common/_same_heading_pick_kinds.js';
import * as LOOK from '../common/_heading_look.js';

const BOARD = { w: 340, h: 300 };
const N = 8;
const mech = subsetToggle({ nTargets: () => N });
const wrapDeg = (a) => ((a % 360) + 540) % 360 - 180;
const DEG = Math.PI / 180;

const MATCH_DEG = 6, SEP_DEG = 30;
const NEAR_DEG = [30.5, 38], STEP_DEG = [30.5, 40];
const OPP_OFF = [4, 7], OPP_MAX = 8;
const LAYOUT_TRIES = 4;
const CAM = { dist: 5.6, fov: 37, tx: 0, ty: 0.3, tz: -0.1 };
const CAM_YAW = 12, CAM_PITCH = [46, 54];
const X_MAX = 1.9, Z_RANGE = [-1.7, 1.4];
const SEP_WORLD = 0.95;
const MARGIN = 26;
const CLEAR_PX = 5;
const EPS = 1e-9;
const WALL_Z = -2.6;
const TAP_MARGIN = 8;

export const KINDS = ['chair', 'car', 'dog'];
const COUNTS = [3, 3, 2];
const PALETTE = {
  chair: [['#a8774a', '#8a5d36', '#bf8f5f', '#b8473c'], ['#7b5236', '#5f3d26', '#946646', '#3f6f9f'], ['#c9a578', '#ad895d', '#dcbc92', '#4f7f4a']],
  car: [['#c8392f'], ['#2f6db5'], ['#e0a52a'], ['#3f8f5a']],
  dog: [['#b07a45', '#f0e6d8'], ['#2d2a28', '#d8c8b0'], ['#d9c6a3', '#f3ece0']],
};
const CUE_Y = { chair: 0.45, car: 0.2, dog: 0.35 };

const SEAT = { w: 0.44, d: 0.42, y: 0.45, t: 0.045 };
const LEG = 0.036;
const BACK = { h: 0.52, t: 0.04 };
function chairModel() {
  const P = [];
  const box = (lx, y0, lz, hx, hy, hz, mat) => P.push({ t: 'box', c: [lx, y0 + hy, lz], h: [hx, hy, hz], mat });
  const lx = SEAT.w / 2 - LEG / 2 - 0.01, lz = SEAT.d / 2 - LEG / 2 - 0.01;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * lx, 0, sz * lz, LEG / 2, (SEAT.y - SEAT.t) / 2, LEG / 2, 'wood');
  box(0, SEAT.y - SEAT.t, 0, SEAT.w / 2, SEAT.t / 2, SEAT.d / 2, 'board');
  P.push({ t: 'box', c: [0, SEAT.y + 0.022, -0.005], h: [SEAT.w / 2 - 0.035, 0.022, 0.15], mat: 'cushion', bev: 0.018 });
  for (const sx of [-1, 1]) box(sx * lx, SEAT.y, -lz, LEG / 2, BACK.h / 2, LEG / 2, 'wood');
  box(0, SEAT.y, -lz, lx, BACK.h / 2, BACK.t / 2, 'board');
  return P;
}
function carModel() {
  const P = [], B = (c, h, mat, bev = 0.02) => P.push({ t: 'box', c, h, mat, bev });
  B([0, 0.13, 0], [0.17, 0.055, 0.36], 'body', 0.03);
  B([0, 0.215, 0.25], [0.165, 0.035, 0.11], 'body', 0.03);
  B([0, 0.29, 0.03], [0.155, 0.11, 0.11], 'body', 0.035);
  B([0, 0.31, 0.142], [0.13, 0.065, 0.008], 'glass', 0.008);
  B([0, 0.32, -0.082], [0.12, 0.045, 0.006], 'glass', 0.005);
  for (const sx of [-1, 1]) B([sx * 0.156, 0.31, 0.03], [0.006, 0.055, 0.08], 'glass', 0.005);
  B([0, 0.19, -0.22], [0.148, 0.006, 0.13], 'bed', 0.004);
  for (const sx of [-1, 1]) B([sx * 0.158, 0.23, -0.22], [0.012, 0.045, 0.14], 'body', 0.008);
  B([0, 0.23, -0.352], [0.17, 0.045, 0.012], 'body', 0.008);
  for (const sx of [-1, 1]) P.push({ t: 'sph', c: [sx * 0.11, 0.2, 0.352], r: 0.035, mat: 'lamp' });
  B([0, 0.18, 0.364], [0.07, 0.028, 0.006], 'dark', 0.004);
  for (const sx of [-1, 1]) B([sx * 0.12, 0.24, -0.366], [0.035, 0.016, 0.005], 'tail', 0.004);
  B([0, 0.105, 0.37], [0.16, 0.02, 0.012], 'dark', 0.008);
  for (const sz of [0.22, -0.22]) for (const sx of [-1, 1]) P.push({ t: 'cyl', a: [sx * 0.13, 0.075, sz], b: [sx * 0.19, 0.075, sz], r: 0.075, mat: 'tyre' });
  return P;
}
function dogModel() {
  const P = [], E = (c, h, mat = 'fur') => P.push({ t: 'ell', c, h, mat }), C = (a, b, r, mat = 'fur') => P.push({ t: 'cap', a, b, r, mat });
  E([0, 0.34, -0.03], [0.13, 0.12, 0.26]);
  E([0, 0.38, 0.17], [0.12, 0.13, 0.12], 'fur2');
  for (const sx of [-1, 1]) for (const z of [0.17, -0.2]) C([sx * 0.075, 0.3, z], [sx * 0.075, 0.04, z + 0.01], 0.038);
  C([0, 0.43, 0.2], [0, 0.53, 0.28], 0.07);
  E([0, 0.58, 0.31], [0.095, 0.09, 0.1]);
  E([0, 0.54, 0.42], [0.055, 0.05, 0.075], 'fur2');
  P.push({ t: 'sph', c: [0, 0.56, 0.495], r: 0.022, mat: 'black' });
  for (const sx of [-1, 1]) P.push({ t: 'sph', c: [sx * 0.045, 0.62, 0.39], r: 0.016, mat: 'black' });
  for (const sx of [-1, 1]) E([sx * 0.085, 0.58, 0.29], [0.022, 0.075, 0.045], 'ear');
  C([0, 0.4, -0.27], [0, 0.52, -0.4], 0.025);
  return P;
}
const MODELS = { chair: chairModel(), car: carModel(), dog: dogModel() };
const modelOf = (kind) => MODELS[kind] || XMODELS[kind];
const cueYOf = (kind) => CUE_Y[kind] ?? XCUE_Y[kind];

function toWorld(o) {
  const a = o.yawDeg * DEG, cs = Math.cos(a), sn = Math.sin(a);
  return (p) => [o.x + p[0] * cs + p[2] * sn, p[1], o.z - p[0] * sn + p[2] * cs];
}
function objCorners(kind, o) {
  const W = toWorld(o), out = [];
  const boxPts = (c, h) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(W([c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]])); };
  for (const p of modelOf(kind)) {
    if (p.t === 'box' || p.t === 'ell') boxPts(p.c, p.h);
    else if (p.t === 'sph') boxPts(p.c, [p.r, p.r, p.r]);
    else for (const e of [p.a, p.b]) boxPts(e, [p.r, p.r, p.r]);
  }
  return out;
}
function cameraOf(m) { return orbitCam({ az: m.cam.yaw, el: m.cam.pitch, ...CAM }, BOARD.w, BOARD.h); }

function hull2(ps) {
  const p = ps.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function apart(A, B, gap) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b.y - a.y, ny = a.x - b.x, l = Math.hypot(nx, ny) || 1;
    const pa = A.map((q) => (q.x * nx + q.y * ny) / l), pb = B.map((q) => (q.x * nx + q.y * ny) / l);
    if (Math.min(...pa) > Math.max(...pb) + gap || Math.min(...pb) > Math.max(...pa) + gap) return true;
  }
  return false;
}
export function objHull(kind, c, cam) { return hull2(objCorners(kind, c).map(([x, y, z]) => cam.project(x, y, z))); }
function cueOf(cam, c, kind) {
  const y = cueYOf(kind), a = c.yawDeg * DEG, p0 = cam.project(c.x, y, c.z), p1 = cam.project(c.x + Math.sin(a) * 0.4, y, c.z + Math.cos(a) * 0.4);
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  return { len: Math.hypot(dx, dy), deg: Math.atan2(dy, dx) / DEG };
}

function layoutOk(kinds, bots, cam) {
  const hulls = bots.map((c, i) => objHull(kinds[i], c, cam));
  for (const h of hulls) for (const p of h) {
    if (!Number.isFinite(p.x) || p.x < MARGIN || p.x > BOARD.w - MARGIN || p.y < MARGIN || p.y > BOARD.h - MARGIN) return false;
  }
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
    if (Math.hypot(bots[i].x - bots[j].x, bots[i].z - bots[j].z) < SEP_WORLD) return false;
    if (!apart(hulls[i], hulls[j], CLEAR_PX)) return false;
  }
  return true;
}

function kindsOk(kinds) {
  if (!Array.isArray(kinds) || kinds.length !== N || !kinds.every((k) => KINDS.includes(k))) return false;
  const cnt = KINDS.map((k) => kinds.filter((v) => v === k).length).sort();
  return cnt.join() === COUNTS.slice().sort().join();
}

function kindsOkExt(kinds) {
  if (!Array.isArray(kinds) || kinds.length !== N || !kinds.every((k) => ALL_KINDS.includes(k))) return false;
  const ks = [...new Set(kinds)];
  return ks.length === 3 && ks.map((k) => kinds.filter((v) => v === k).length).sort().join() === COUNTS.slice().sort().join();
}

function contractOk(m) {
  if (!m || m.task !== 'same_heading_pick') return false;
  if (!m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!(m.ext ? kindsOkExt(m.kinds) : kindsOk(m.kinds)) || !m.colors || typeof m.colors !== 'object') return false;
  const PAL = m.ext ? XPALETTE : PALETTE;
  for (const k of new Set(m.kinds)) if (!Number.isInteger(m.colors[k]) || m.colors[k] < 0 || m.colors[k] >= PAL[k].length) return false;
  if (!m.cam || Math.abs(m.cam.yaw) > CAM_YAW + EPS || !(m.cam.pitch >= CAM_PITCH[0] - EPS && m.cam.pitch <= CAM_PITCH[1] + EPS)) return false;
  if (!Array.isArray(m.bots) || m.bots.length !== N) return false;
  if (!Array.isArray(m.answerSet) || m.answerSet.length !== 2) return false;
  for (const b of m.bots) {
    if (![b.x, b.z, b.yawDeg].every(Number.isFinite)) return false;
    if (Math.abs(b.x) > X_MAX + EPS || b.z < Z_RANGE[0] - EPS || b.z > Z_RANGE[1] + EPS) return false;
  }
  const matches = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.abs(wrapDeg(m.bots[i].yawDeg - m.bots[j].yawDeg));
    if (d <= MATCH_DEG + EPS) matches.push([i, j]);
    else if (d < SEP_DEG - EPS) return false;
  }
  if (matches.length !== 1) return false;
  const ans = m.answerSet.slice().sort((a, b) => a - b);
  if (ans[0] !== matches[0][0] || ans[1] !== matches[0][1]) return false;
  if (m.kinds[ans[0]] === m.kinds[ans[1]]) return false;
  const opp = (k) => Math.min(...ans.map((a) => Math.abs(wrapDeg(m.bots[k].yawDeg - m.bots[a].yawDeg - 180))));
  if (![...Array(N).keys()].some((k) => !ans.includes(k) && opp(k) <= OPP_MAX + EPS)) return false;
  const near = (k) => Math.min(...ans.map((a) => Math.abs(wrapDeg(m.bots[k].yawDeg - m.bots[a].yawDeg))));
  if ([...Array(N).keys()].filter((k) => !ans.includes(k) && near(k) <= NEAR_DEG[1] + 0.5).length < 2) return false;
  const cam = cameraOf(m);
  if (!layoutOk(m.kinds, m.bots, cam)) return false;
  if (m.bots.some((b, i) => cueOf(cam, b, m.kinds[i]).len < 12)) return false;
  return true;
}
export function gate(m) { return contractOk(m); }
export function semanticKey(m) {
  const ans = new Set(m.answerSet);
  const objs = m.bots.map((b, i) => `${m.kinds[i]}@${Math.round(b.x / 0.5)},${Math.round(b.z / 0.5)}/${((Math.round(b.yawDeg / 15) % 24) + 24) % 24}${ans.has(i) ? '*' : ''}`);
  return 'same_heading_pick|' + objs.sort().join(';');
}
export function screenCues(m) { const cam = cameraOf(m); return m.bots.map((b, i) => cueOf(cam, b, m.kinds[i])); }

const woodTex = (D, L) => (x, y, z, nx, ny, nz, sh, out) => { const g = fbm(x * 30 + z * 4, y * 5 + z * 30, 2); mixInto(out, D, L, 0.25 + 0.5 * g); };
const boardTex = (D, L) => (x, y, z, nx, ny, nz, sh, out) => { const [u] = boxLocal(sh, x, z); const g = fbm(u * 4 + y * 3, (z + x) * 40, 2); mixInto(out, D, L, 0.35 + 0.45 * g); };
function kindMats(kind, pal, add) {
  if (kind === 'chair') {
    const [b, d, l] = pal.slice(0, 3).map(cA);
    add('wood', { c: b, ks: 0.14, sh: 26, tex: woodTex(d, l) });
    add('board', { c: b, ks: 0.16, sh: 30, tex: boardTex(d, l) });
    add('cushion', { c: cA(pal[3]), ks: 0.05, sh: 10 });
  } else if (kind === 'car') {
    add('body', { c: cA(pal[0]), ks: 0.45, sh: 60, env: 0.3 });
    add('glass', { c: cA('#3d5466'), ks: 0.7, sh: 80, env: 0.45 });
    add('lamp', { c: cA('#fff1b8'), ks: 0.6, sh: 50 });
    add('tail', { c: cA('#c8302c'), ks: 0.5, sh: 40 });
    add('bed', { c: cA('#3b3d42'), ks: 0.15, sh: 20 });
    add('dark', { c: cA('#33363c'), ks: 0.2, sh: 20 });
    add('tyre', { c: cA('#2b2c30'), ks: 0.08, sh: 10 });
  } else if (kind === 'dog') {
    add('fur', { c: cA(pal[0]), ks: 0.06, sh: 12 });
    add('fur2', { c: cA(pal[1]), ks: 0.06, sh: 12 });
    add('ear', { c: cA(pal[0]).map((v) => v * 0.7), ks: 0.06, sh: 12 });
    add('black', { c: cA('#1d1d20'), ks: 0.7, sh: 60 });
  }
}
function sceneMats(m, look = null) {
  if (m.ext || look) return sceneMatsX(m, look);
  const mats = [], idx = {};
  for (const kind of new Set(m.kinds)) {
    idx[kind] = {};
    kindMats(kind, PALETTE[kind][m.colors[kind]], (name, mat) => { idx[kind][name] = mats.length; mats.push(mat); });
  }
  return { mats, idx };
}
function kindMatsX(kind, pal, add, look) {
  const C = pal.map(cA), plain = (c, ks = 0.08, sh = 14, env = 0) => ({ c, ks, sh, env });
  const wood = (tint, ks = 0.14) => (look && look.wood ? LOOK.texMat({ tex: look.wood, tint, cv: 0.2, world: 0.45, fp: 0.006, ks, sh: 26 }) : null);
  const cloth = (tint) => (look && look.fabric ? LOOK.texMat({ tex: look.fabric, tint, cv: 0.16, world: 0.35, fp: 0.006, ks: 0.04, sh: 10 }) : plain(tint, 0.05, 10));
  if (kind === 'chair' || kind === 'car' || kind === 'dog') {
    if (kind === 'chair' && look && look.wood) {
      add('wood', wood(C[0])); add('board', wood(C[0], 0.16)); add('cushion', cloth(C[3]));
    } else kindMats(kind, pal, add);
    return;
  }
  const fixed = { tyre: cA('#2b2c30'), hub: cA('#c9ced4'), dark: cA('#33363c'), lamp: cA('#fff1b8'), glass: cA('#3d5466'), black: cA('#1d1d20'),
    eye: cA('#1d1d20'), nose: cA('#d98a8a'), white: cA('#f2f0ea'), track: cA('#3a3b3e'), trim: cA('#c9ced4'), wheel: cA('#3a3b3e') };
  const P = {
    sofa: () => { add('fabric', cloth(C[0])); add('cushion', cloth(C[1])); add('leg', wood(C[2]) || plain(C[2], 0.14, 26)); },
    cat: () => { add('fur', plain(C[0], 0.06, 12)); add('fur2', plain(C[1], 0.06, 12)); add('eye', plain(C[2], 0.7, 60)); add('nose', plain(fixed.nose, 0.3, 30)); },
    duck: () => { add('body', plain(C[0], 0.45, 50, 0.2)); add('wing', plain(C[1], 0.45, 50, 0.2)); add('bill', plain(C[2], 0.4, 40)); add('black', plain(fixed.black, 0.7, 60)); },
    tractor: () => { add('body', plain(C[0], 0.4, 50, 0.2)); add('body2', plain(C[1], 0.4, 50, 0.2)); add('tyre', plain(fixed.tyre)); add('hub', plain(C[1], 0.4, 40)); add('dark', plain(fixed.dark, 0.2, 20)); add('lamp', plain(fixed.lamp, 0.6, 50)); },
    train: () => { add('body', plain(C[0], 0.45, 60, 0.25)); add('body2', plain(C[1], 0.45, 60, 0.25)); add('dark', plain(fixed.dark, 0.3, 30)); add('wheel', plain(C[1], 0.4, 40)); add('trim', plain(cA('#d4af37'), 0.6, 60, 0.3)); add('glass', plain(fixed.glass, 0.7, 80, 0.4)); add('lamp', plain(fixed.lamp, 0.6, 50)); },
    penguin: () => { add('black', plain(C[0], 0.25, 30)); add('white', plain(C[1], 0.2, 24)); add('beak', plain(C[2], 0.35, 36)); add('eye', plain(fixed.black, 0.7, 60)); },
    tank: () => { add('body', plain(C[0], 0.18, 24)); add('track', plain(fixed.track, 0.1, 12)); add('dark', plain(fixed.dark, 0.2, 20)); },
    plane: () => { add('body', plain(C[0], 0.45, 60, 0.25)); add('body2', plain(C[1], 0.45, 60, 0.25)); add('trim', plain(fixed.trim, 0.6, 50, 0.3)); add('dark', plain(fixed.dark, 0.2, 20)); add('glass', plain(fixed.glass, 0.7, 80, 0.4)); add('tyre', plain(fixed.tyre)); },
  };
  P[kind]();
}
function sceneMatsX(m, look) {
  const mats = [], idx = {};
  for (const kind of new Set(m.kinds)) {
    idx[kind] = {};
    kindMatsX(kind, XPALETTE[kind][m.colors[kind]], (name, mat) => { idx[kind][name] = mats.length; mats.push(mat); }, look);
  }
  return { mats, idx };
}
function objShapes(kind, i, o, idx) {
  const W = toWorld(o), a = o.yawDeg * DEG, cs = Math.cos(a), sn = Math.sin(a);
  const ax = [[cs, 0, -sn], [0, 1, 0], [sn, 0, cs]];
  return modelOf(kind).map((p) => {
    const mi = idx[p.mat];
    if (p.t === 'box') { const c = W(p.c); return shape.box(i, mi, c[0], c[1], c[2], p.h[0], p.h[1], p.h[2], o.yawDeg, p.bev ?? Math.min(0.008, p.h[0] * 0.4, p.h[1] * 0.4, p.h[2] * 0.4)); }
    if (p.t === 'ell') return shape.ellipsoid(i, mi, W(p.c), ax, p.h);
    if (p.t === 'sph') { const c = W(p.c); return shape.sphere(i, mi, c[0], c[1], c[2], p.r); }
    if (p.t === 'cap') return shape.capsule(i, mi, W(p.a), W(p.b), p.r);
    return shape.gcyl(i, mi, W(p.a), W(p.b), p.r);
  });
}
export function sceneOf(m) {
  const { mats, idx } = sceneMats(m);
  const shapes = [];
  m.bots.forEach((o, i) => shapes.push(...objShapes(m.kinds[i], i, o, idx[m.kinds[i]])));
  return makeScene({ cam: cameraOf(m), shapes, mats, light: STUDIO_LIGHT,
    env: { floorY: 0, floor: plankFloor({ plank: 0.14, plankL: 1.2, base: '#c9b394', dark: '#b39b7b', light: '#ddc8aa' }), wallZ: WALL_Z, wall: plasterWall('#e4e1da'), sky: softSky } });
}

const SHP_SKIP_FLOOR = new Set(['herringbone_parquet', 'hexagonal_concrete_paving', 'dry_riverbed_rock', 'floor_pattern_02']);
async function shpLook(style) {
  const room = await LOOK.pickRoom(style, 'shp-floor-wall-hdri', {
    floors: (t) => ['wood', 'floor', 'stone'].includes(t.use) && !SHP_SKIP_FLOOR.has(t.id), walls: (t) => t.use === 'wall' });
  const rnd = style.rand, S3 = LOOK.S3;
  const woodA = style.pick('tex', (t) => t.use === 'wood'), fabA = style.pick('tex', (t) => t.use === 'fabric' && !/check|pattern/.test(t.id));
  const [wood, fabric] = await Promise.all([S3.loadTexture(woodA.file), S3.loadTexture(fabA.file)]);
  const toneJ = rnd(), lightJ = rnd(), sizeJ = rnd(), wallJ = rnd(), salt = 1 + Math.floor(rnd() * 997);
  const open = rnd() < 0.2;
  const gl = LOOK.glazedFace(room.ftex, style, { lo: 0.2, hi: 0.5, maxSat: 0.32, j: toneJ, p: room.fl.use === 'wood' ? 0.4 : 0.72 });
  let face = gl.face;
  style.note(`glaze:${gl.glaze}`);
  let light = LOOK.styledLight(room.hd, STUDIO_LIGHT, { albedo: face, jitter: lightJ });
  if (gl.glaze === 'natural') face = LOOK.safeFace(face, light, STUDIO_LIGHT);
  light = LOOK.styledLight(room.hd, STUDIO_LIGHT, { albedo: face, jitter: lightJ });
  const planks = room.fl.use === 'wood';
  const floor = planks
    ? LOOK.texPlankFloor({ tex: room.ftex, face, plank: 0.12 + 0.08 * sizeJ, plankL: 0.9 + 0.7 * rnd(), cv: 0.14, seam: 0.4, salt })
    : S3.texTileFloor({ tex: room.ftex, tile: 0.36 + 0.26 * sizeJ, face, grout: S3.scaleTo(S3.limitSat(face, 0.1), S3.lum(face) * 0.45), cv: 0.08, salt });
  let wface = S3.safeTint(room.wtex.mean, { maxSat: 0.2, otherSat: 0.1 });
  wface = S3.scaleTo(wface, Math.min(0.62, Math.max(0.3, 0.25 + 0.8 * S3.lum(room.wtex.mean))) * (0.92 + 0.16 * wallJ));
  style.note(`floor:${planks ? 'planks' : 'tiles'}${open ? '/open' : ''}`); style.note(`tex:${woodA.id}`); style.note(`tex:${fabA.id}`);
  const env = { floorY: 0, floor, sky: S3.skyFn(room.sky, 0.87 * S3.lum(light.sky) / 0.443) };
  if (!open) Object.assign(env, { wallZ: WALL_Z, wall: S3.texWall({ tex: room.wtex, face: wface }) });
  return { light, env, wood, fabric };
}
function sceneOfStyled(m, look) {
  const { mats, idx } = sceneMats(m, look);
  const shapes = [];
  m.bots.forEach((o, i) => shapes.push(...objShapes(m.kinds[i], i, o, idx[m.kinds[i]])));
  return makeScene({ cam: cameraOf(m), shapes, mats, light: look.light, env: look.env });
}

const task = {
  meta: {
    name: 'same_heading_pick', family: 'A', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'toggle', idx: 'object 0..7' }],
    promptHuman: 'Select the two objects facing the same way',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext);
    const counts = rng.shuffle(COUNTS);
    const colors = Object.fromEntries(KINDS.map((k) => [k, rng.int(0, PALETTE[k].length - 1)]));
    const m = buildScene(rng, () => ({ task: 'same_heading_pick', board: BOARD,
      kinds: rng.shuffle(KINDS.flatMap((k, i) => Array(counts[i]).fill(k))), colors }));
    if (m) return m;
    throw new Error('same_heading_pick: no valid scene');
  },

  ...mech,

  randomPolicy(m, rnd) {
    const a = Math.floor(rnd() * N); let b = Math.floor(rnd() * (N - 1)); if (b >= a) b++;
    return [{ op: 'toggle', idx: a }, { op: 'toggle', idx: b }];
  },

  async mount(env) {
    if (env && env.style) env.assets.look = await shpLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Select the two objects facing the same way', 'Same direction in the room, any kind');
  },

  featureGeometry(m) {
    const cam = cameraOf(m);
    return { featureRequirements: ['target'],
      features: m.bots.map((c, i) => { const h = objHull(m.kinds[i], c, cam), xs = h.map((p) => p.x), ys = h.map((p) => p.y);
        return { id: `object${i}`, kind: 'target', effectiveWidthPx: Math.max(...xs) - Math.min(...xs), effectiveHeightPx: Math.max(...ys) - Math.min(...ys) }; }),
      coverage: { complete: true, scope: 'Every object tap region (its rendered silhouette plus 8 px), measured by its projected outline (the parts\' bounding hull, close to the silhouette size); outlines are kept 5 px apart.' } };
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const look = env.style ? env.assets?.look : null;
    const C = (this._cache ??= {}), q = contextScale(g), key = JSON.stringify([m.cam, m.bots]) + q + (look ? '|style|' + env.style.key : '');
    if (C.key !== key) { C.key = key; C.img = render(look ? sceneOfStyled(m, look) : sceneOf(m), q); C.canvas = toCanvas(C.img); C.ringKey = null; }
    g.drawImage(C.canvas, 0, 0, BOARD.w, BOARD.h);
    const sel = new Set(st.sel.map((v, i) => (v ? i : -1)).filter((i) => i >= 0));
    const rk = [...sel].join(',');
    if (C.ringKey !== rk) { C.ringKey = rk; C.rings = silhouetteRings(C.img, sel, [25, 145, 250, 255], 3); }
    if (sel.size) g.drawImage(C.rings, 0, 0, BOARD.w, BOARD.h);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest;
    if (this._pickKey !== m) {
      const cam = cameraOf(m);
      this._pickKey = m; this._pickScene = sceneOf(m);
      this._pickBoxes = m.bots.map((c, i) => { const h = objHull(m.kinds[i], c, cam), xs = h.map((p) => p.x), ys = h.map((p) => p.y);
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; });
    }
    const at = (x, y) => { const id = pickId(this._pickScene, x, y); return id >= 0 && id < N ? id : -1; };
    let id = at(evt.x, evt.y);
    if (id < 0 && this._pickBoxes.some(([x0, x1, y0, y1]) => evt.x >= x0 - TAP_MARGIN && evt.x <= x1 + TAP_MARGIN && evt.y >= y0 - TAP_MARGIN && evt.y <= y1 + TAP_MARGIN)) {
      for (let r = 2; r <= TAP_MARGIN && id < 0; r += 2) {
        const votes = new Array(N).fill(0);
        for (let k = 0; k < 16; k++) { const v = at(evt.x + r * Math.cos(k * Math.PI / 8), evt.y + r * Math.sin(k * Math.PI / 8)); if (v >= 0) votes[v]++; }
        const top = Math.max(...votes);
        if (top > 0) id = votes.indexOf(top);
      }
    }
    return id >= 0 ? [{ op: 'toggle', idx: id }] : [];
  },

  footerStatus(env) {
    const n = env.state.sel.filter(Boolean).length;
    return n ? `${n} selected` : 'Tap two';
  },
};

function generateExt(rng, split) {
  const pool = kindsFor(split);
  const m = buildScene(rng, () => {
    const three = rng.sample(pool, 3), counts = rng.shuffle(COUNTS);
    const colors = Object.fromEntries(three.map((k) => [k, rng.pick(colorsFor(k, split))]));
    return { task: 'same_heading_pick', board: BOARD, ext: split, kinds: rng.shuffle(three.flatMap((k, i) => Array(counts[i]).fill(k))), colors };
  });
  if (m) return m;
  throw new Error('same_heading_pick: no valid training scene');
}

function headingOffsets(rng, answerSet) {
  const delta = rng.uniform(1.5, MATCH_DEG);
  const p1 = delta + rng.uniform(NEAR_DEG[0], NEAR_DEG[1]), p2 = p1 + rng.uniform(STEP_DEG[0], STEP_DEG[1]);
  const n1 = -rng.uniform(NEAR_DEG[0], NEAR_DEG[1]), n2 = n1 - rng.uniform(STEP_DEG[0], STEP_DEG[1]);
  const b1 = delta + 180 + rng.uniform(OPP_OFF[0], OPP_OFF[1]);
  const lo = p2 + SEP_DEG + 1, hi = 360 + n2 - SEP_DEG - 1;
  let b2 = null;
  for (let t = 0; t < 40 && b2 === null; t++) { const v = rng.uniform(lo, hi); if (Math.abs(v - b1) >= SEP_DEG + 1) b2 = v; }
  if (b2 === null) return null;
  const others = rng.shuffle([p1, p2, n1, n2, b1, b2]);
  const offs = new Array(N);
  offs[answerSet[0]] = 0; offs[answerSet[1]] = delta;
  [...Array(N).keys()].filter((k) => !answerSet.includes(k)).forEach((k, r) => { offs[k] = others[r]; });
  return offs;
}
function screenParallelMargin(m) {
  const cam = cameraOf(m), cues = m.bots.map((b, i) => cueOf(cam, b, m.kinds[i]).deg), ans = m.answerSet;
  const d = (i, j) => Math.abs(wrapDeg(cues[i] - cues[j]));
  let wrong = Infinity;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (!(ans.includes(i) && ans.includes(j))) wrong = Math.min(wrong, d(i, j));
  return wrong - d(ans[0], ans[1]);
}
function buildScene(rng, base) {
  let best = null, bestScore = Infinity, found = 0;
  for (let attempt = 0; attempt < 3000 && found < LAYOUT_TRIES; attempt++) {
    const m = base();
    m.cam = { yaw: +rng.uniform(-CAM_YAW, CAM_YAW).toFixed(2), pitch: +rng.uniform(CAM_PITCH[0], CAM_PITCH[1]).toFixed(2) };
    const camera = cameraOf(m), kinds = m.kinds;
    const pairs = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (kinds[i] !== kinds[j]) pairs.push([i, j]);
    const answerSet = rng.pick(pairs);
    const offs = headingOffsets(rng, answerSet);
    if (!offs) continue;
    const h0 = rng.uniform(0, 360), dir = rng.sign();
    const bots = [];
    let ok = true;
    for (let i = 0; i < N && ok; i++) {
      let placed = false;
      for (let t = 0; t < 160 && !placed; t++) {
        const bot = { x: +rng.uniform(-X_MAX, X_MAX).toFixed(3), z: +rng.uniform(Z_RANGE[0], Z_RANGE[1]).toFixed(3), yawDeg: +wrapDeg(h0 + dir * offs[i]).toFixed(2) };
        if (cueOf(camera, bot, kinds[i]).len < 12) continue;
        if (!layoutOk(kinds.slice(0, i + 1), [...bots, bot], camera)) continue;
        bots.push(bot); placed = true;
      }
      ok = placed;
    }
    if (!ok) continue;
    m.bots = bots;
    m.answerSet = answerSet;
    if (!contractOk(m)) continue;
    found++;
    const s = screenParallelMargin(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

export default task;
