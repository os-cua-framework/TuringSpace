import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { makeScene, render, pickNear, pickId, objectStats, sideStats, castShadowPx, toCanvas, contextScale, silhouetteRing } from '../common/_flat_or_solid_tap_rt.js';
import { cameraFor, envFor, lightFor, MATS, PAINTS, shapesOf, frameOf, worldPoints, outlinePoints, outline, SHAPES, IMG, WALL_Z } from '../common/_flat_or_solid_tap_scene.js';
import { lin } from '../common/_flat_or_solid_tap_rt.js';
import { S3, texMod, faceColour, loadAll, totalOf, splitOf, pickOf } from '../common/_relation_scene_look.js';

const PANEL_W = 400;
const BOARD = { w: IMG.w, h: IMG.h };
const QS = ['flat', 'solid'];
const HARD = Object.freeze({
  rounds: 1,
  ansMin: 2, ansMax: 6, mixedMin: 2,
  wallMax: 5, tableMax: 6,
  flatT: [0.016, 0.024],
  lieRel: [0.08, 0.18],
  wallRel: [0.16, 0.3],
  leanRel: [0.22, 0.32],
  size: [1.0, 1.32],
  betaF: [8, 24],
  betaFUp: [1.5, 4], uprightCardP: 0.3,
  betaSMax: 28, standP: 0.35,
  wallYaw: [12, 28],
  stableMargin: 2,
  sideMinPx: 50, bandMinPx: 3, sideMaxFrac: 0.4,
  flatEdgeMaxPx: 1.4,
  twinArea: 1.3, twinElong: 0.12,
  gapPx: 5, edge: 5, minArea: 650,
  shadowFlatPx: 60,
  lightAz: [8, 24], lightEl: [58, 68],
  markP: [0.5, 0.3, 0.2],
  markR: [0.12, 0.19],
  rimP: 0.5, rimRel: [0.08, 0.11],
});
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;
const GROUPS = { 10: [3, 3, 2, 2], 11: [3, 3, 3, 2] };

export const REJECTS = {};
const rej = (k) => { REJECTS[k] = (REJECTS[k] || 0) + 1; return null; };

const PAINT_POOL = [
  ['red', '#d23f2e'], ['orange', '#ec8421'], ['yellow', '#eec12a'], ['green', '#3c9a4c'], ['teal', '#1d9c98'], ['blue', '#2e62d0'],
  ['purple', '#8850c4'], ['pink', '#e46a9c'], ['crimson', '#a8243a'], ['amber', '#d99a1c'], ['lime', '#8cc43c'], ['forest', '#2a6e3a'],
  ['cyan', '#2bb3d6'], ['navy', '#28407e'], ['violet', '#6a3fa8'], ['magenta', '#c43c9a'], ['coral', '#ef7a62'], ['mint', '#5cc8a0'],
  ['sky', '#6aa8e8'], ['plum', '#7a3a6a'], ['ochre', '#b8862e'], ['olive', '#7a8a2a'], ['slate', '#4f6478'], ['rust', '#b0502a'],
  ['gold', '#c9a227'], ['brick', '#9a3b2a'], ['jade', '#3a9a7a'], ['cobalt', '#2a52a8'], ['lilac', '#a88ad0'], ['rose', '#d85a7a'],
  ['chartreuse', '#b0c832'], ['peach', '#f0a070'],
];
const TABLE_SKIP = new Set(['curly_teddy_checkered', 'gingham_check', 'quatrefoil_jacquard_fabric', 'stone_tiles_02', 'interior_tiles', 'hexagonal_concrete_paving',
  'square_floor_patern_01', 'floor_pattern_02', 'pavement_02', 'rough_plasterbrick_05', 'cobblestone_floor_08', 'dry_riverbed_rock', 'brick_moss_001']);
const FINISH = [{ id: 'matte', ks: 0.05, sh: 10, env: 0.02 }, { id: 'eggshell', ks: 0.09, sh: 16, env: 0.03 }, { id: 'satin', ks: 0.13, sh: 22, env: 0.05 }, { id: 'semi-gloss', ks: 0.25, sh: 40, env: 0.08 }];
export async function styleLook(style) {
  const tables = style.pool('tex', (t) => ['wood', 'fabric', 'floor'].includes(t.use) && !TABLE_SKIP.has(t.id));
  const walls = style.pool('tex', (t) => t.use === 'wall');
  const hdris = style.pool('hdri');
  const [ti, wi, hi] = style.primaryCombo('table-wall-hdri', [tables.length, walls.length, hdris.length]);
  const tb = tables[ti], wl = walls[wi], hd = hdris[hi], rnd = style.rand;
  style.note(`tex:${tb.id}`); style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const [TT, TW, sky] = await loadAll([tb, wl, hd]);
  const tface = faceColour(TT.mean, 0.14 + 0.22 * rnd(), { warm: [18, 55, 0.55], otherSat: 0.12 });
  const wface = faceColour(TW.mean, 0.45 + 0.25 * rnd(), { warm: [18, 55, 0.2], otherSat: 0.08 });
  const tm = texMod(TT, { cv: 0.12, texWorld: tb.use === 'fabric' ? 0.6 : 1.6, lo: 0.7, hi: 1.3 }), rot = rnd() < 0.5;
  const wm = texMod(TW, { cv: 0.09, texWorld: 1.5, lo: 0.8, hi: 1.2 });
  const floor = (x, z, fp, out) => {
    const t = tm(rot ? z : x, rot ? x : z, fp), corner = 1 - 0.2 * Math.exp(-(z - WALL_Z) / 0.2);
    for (let c = 0; c < 3; c++) out[c] = tface[c] * t * corner;
  };
  const wall = (x, y, fp, out) => {
    const t = wm(x, -y, fp) * (1 - 0.2 * Math.exp(-y / 0.2));
    for (let c = 0; c < 3; c++) out[c] = wface[c] * t;
  };
  const split = splitOf(style, 'flat_or_solid_tap|paint', PAINT_POOL, (p) => p[0], 10);
  const pool = split.filter(([, hex]) => S3.deltaE(lin(hex), tface) >= 25 && S3.deltaE(lin(hex), wface) >= 25);
  const src = pool.length >= 8 ? pool : split;
  const order = src.map((p) => [rnd(), p]).sort((a, b) => a[0] - b[0]).map((e) => e[1]).slice(0, 8);
  const fz = pickOf(style, 'flat_or_solid_tap|finish', FINISH, (f) => f.id), fin = { ks: fz.ks, sh: fz.sh, env: fz.env }, lightJ = rnd();
  const mats = order.map(([, hex]) => ({ c: lin(hex), ...fin }));
  for (const p of order) style.note(`flat_or_solid_tap|paint:${p[0]}`);
  return {
    mats,
    env: { floorY: 0, wallZ: WALL_Z, floor, wall, sky: S3.skyFn(sky, 0.6) },
    light: (rd) => S3.hdriLight(hd, lightFor(rd), { albedo: tface, total: totalOf(lightFor(rd)), jitter: lightJ }),
    ids: { table: tb.id, wall: wl.id, hdri: hd.id },
  };
}
function styledScene(rd, look) {
  const shapes = rd.objs.flatMap((p, i) => shapesOf(p, i));
  return makeScene({ cam: cameraFor(rd), shapes, mats: look.mats, env: look.env, light: look.light(rd) });
}

const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) {
    const shapes = rd.objs.flatMap((p, i) => shapesOf(p, i));
    sc = makeScene({ cam: cameraFor(rd), shapes, mats: MATS, env: envFor(rd), light: lightFor(rd) });
    sceneCache.set(rd, sc);
  }
  return sc;
}
function faceHeight(p) { const pts = outlinePoints(p.shape); let a = Infinity, b = -Infinity; for (const [, v] of pts) { a = Math.min(a, v); b = Math.max(b, v); } return (b - a) * p.s; }
function footprint(o) {
  const fr = frameOf(o), ol = outline(o.shape);
  const parts = ol.disc ? [Array.from({ length: 24 }, (_, i) => [ol.r * Math.cos(i * Math.PI / 12), ol.r * Math.sin(i * Math.PI / 12)])] : ol.parts;
  return parts.map((poly) => poly.map(([u, v]) => [fr.o[0] + (fr.ex[0] * u + fr.ey[0] * v) * o.s, fr.o[2] + (fr.ex[2] * u + fr.ey[2] * v) * o.s]));
}
function apart(P, Q, m) {
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = b[1] - a[1], nz = a[0] - b[0], l = Math.hypot(nx, nz);
    if (l < 1e-9) continue;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const v of P) { const d = (v[0] * nx + v[1] * nz) / l; p0 = Math.min(p0, d); p1 = Math.max(p1, d); }
    for (const v of Q) { const d = (v[0] * nx + v[1] * nz) / l; q0 = Math.min(q0, d); q1 = Math.max(q1, d); }
    if (q0 - p1 >= m || p0 - q1 >= m) return true;
  }
  return false;
}
function footprintsApart(a, b, m) { const A = footprint(a), B = footprint(b); return A.every((P) => B.every((Q) => apart(P, Q, m))); }
function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function screenParts(cam, o) {
  const fr = frameOf(o), ol = outline(o.shape);
  const parts = ol.disc ? [outlinePoints(o.shape)] : ol.parts;
  return parts.map((poly) => {
    const pts = [];
    for (const [u0, v0] of poly) for (const w of [-o.t / 2, o.t / 2]) {
      const u = u0 * o.s, v = v0 * o.s;
      const q = cam.project(fr.o[0] + fr.ex[0] * u + fr.ey[0] * v + fr.ez[0] * w, fr.o[1] + fr.ex[1] * u + fr.ey[1] * v + fr.ez[1] * w, fr.o[2] + fr.ex[2] * u + fr.ey[2] * v + fr.ez[2] * w);
      pts.push([q.x, q.y]);
    }
    return hull(pts);
  });
}
function screenBox(cam, p) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const w of worldPoints(p)) { const q = cam.project(w[0], w[1], w[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return [x0, y0, x1, y1];
}
function pxPerUnit(cam, p) {
  const o = frameOf(p).o, a = cam.project(o[0] - 0.5, o[1], o[2]), b = cam.project(o[0] + 0.5, o[1], o[2]);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function compositions(n, q) {
  const sizes = GROUPS[n], out = [];
  const rec = (i, fc) => {
    if (i === sizes.length) {
      const nF = fc.reduce((a, b) => a + b, 0), nS = n - nF, k = q === 'flat' ? nF : nS;
      if (k < HARD.ansMin || k > HARD.ansMax) return;
      if (fc.filter((f, j) => f > 0 && f < sizes[j]).length < HARD.mixedMin) return;
      for (let mask = 1; mask < (1 << sizes.length) - 1; mask++) {
        let wN = 0, wF = 0, tF = 0;
        sizes.forEach((sz, j) => { if (mask & (1 << j)) { wN += sz; wF += fc[j]; } else tF += fc[j]; });
        const tN = n - wN, tG = sizes.filter((_, j) => !(mask & (1 << j))).length;
        if (wN < 2 || wN > HARD.wallMax || tN > HARD.tableMax || tN < 3 || tG > 2) continue;
        if (wF < 1 || wF > wN - 1 || tF < 1 || tF > tN - 1) continue;
        out.push({ fc: fc.slice(), mask, k });
      }
      return;
    }
    for (let f = 0; f <= sizes[i]; f++) { fc.push(f); rec(i + 1, fc); fc.pop(); }
  };
  rec(0, []);
  return out;
}

function tryRound(rng, q, n, comp) {
  const sizes = GROUPS[n];
  const rd = {
    q,
    cam: { az: r3(rng.uniform(-8, 8)), el: r3(rng.uniform(39, 46)), dist: 8.6, tz: 0.15, fov: 38 },
    light: { az: r3(rng.sign() * rng.uniform(...HARD.lightAz)), el: r3(rng.uniform(...HARD.lightEl)) },
    wall: rng.int(0, 2),
    objs: [],
  };
  const cam = cameraFor(rd);
  const shapes = rng.shuffle(SHAPES.slice()).slice(0, sizes.length);
  const paints = rng.shuffle(PAINTS.map((_, i) => i));
  const pieces = [];
  sizes.forEach((sz, g) => {
    const wall = !!(comp.mask & (1 << g));
    const cls = rng.shuffle([...Array(comp.fc[g]).fill('F'), ...Array(sz - comp.fc[g]).fill('S')]);
    for (const c of cls) pieces.push({ g, shape: shapes[g], cls: c, zone: wall ? 'wall' : 'table' });
  });
  pieces.forEach((p, i) => {
    p.col = paints[i % paints.length];
    const u = rng.raw();
    p.mark = u < HARD.markP[0] ? 0 : u < HARD.markP[0] + HARD.markP[1] ? 1 : 2;
    p.mr = p.mark ? r3(rng.uniform(...HARD.markR)) : 0;
    p.rim = rng.raw() < HARD.rimP ? r3(rng.uniform(...HARD.rimRel)) : 0;
  });
  const wallBlocks = pieces.filter((p) => p.zone === 'wall' && p.cls === 'S');
  const mustLean = wallBlocks.length ? rng.pick(wallBlocks) : null;
  for (const p of pieces) {
    p.s = rng.uniform(...HARD.size);
    if (p.zone === 'table') {
      p.pose = 'lie'; p.yaw = rng.uniform(0, 360);
      p.t = p.cls === 'F' ? rng.uniform(...HARD.flatT) : p.s * rng.uniform(...HARD.lieRel);
    } else {
      p.yaw = rng.sign() * rng.uniform(...HARD.wallYaw);
      if (p.cls === 'F') {
        p.pose = 'lean'; p.t = rng.uniform(...HARD.flatT);
        p.beta = rng.raw() < HARD.uprightCardP ? rng.uniform(...HARD.betaFUp) : rng.uniform(...HARD.betaF);
      } else {
        const eLoc = Math.atan2(cam.eye[1] - 0.5, Math.hypot(cam.eye[0], cam.eye[2] - WALL_Z)) / DEG;
        const bmax = Math.min(HARD.betaSMax, eLoc - 10);
        const lean = p === mustLean || rng.raw() >= HARD.standP;
        if (lean) {
          p.t = p.s * rng.uniform(...HARD.leanRel);
          const H = faceHeight(p);
          let b = Math.atan2(p.t, H) / DEG + HARD.stableMargin + rng.uniform(0.5, 3);
          if (b > bmax) { b = bmax - rng.uniform(0, 1); p.t = Math.min(p.t, Math.max(p.s * HARD.wallRel[0], Math.tan((b - HARD.stableMargin - 0.5) * DEG) * H)); }
          p.pose = 'lean'; p.beta = Math.max(b, HARD.betaF[0]);
        } else { p.t = p.s * rng.uniform(...HARD.wallRel); p.pose = 'stand'; p.beta = 0; p.gap = rng.uniform(0, 0.1); }
      }
    }
  }
  const tabGroups = rng.shuffle([...new Set(pieces.filter((p) => p.zone === 'table').map((p) => p.g))]);
  if (tabGroups.length > 2) return rej('tableGroups');
  const rows = tabGroups.length === 1 ? [0.5] : rng.shuffle([0, 1]);
  tabGroups.forEach((g, gi) => {
    const row = rows[gi], mem = rng.shuffle(pieces.filter((p) => p.g === g));
    const cols = rng.shuffle([0, 1, 2]).slice(0, mem.length).sort((a, b) => a - b);
    mem.forEach((p, i) => {
      p.x = (cols[i] - 1) * (2.7 - 0.25 * row) + rng.uniform(-0.25, 0.25);
      p.z = -0.22 + 1.84 * row + rng.uniform(-0.18, 0.18);
    });
  });
  for (const p of pieces) if (p.zone === 'wall') p.x = 0;
  const round = (p) => { for (const k of ['x', 'z', 'yaw', 'beta', 's', 't', 'gap']) if (p[k] !== undefined) p[k] = r3(p[k]); };
  pieces.forEach(round);
  const areaAt = (p) => { const tmp = { cam: rd.cam, light: rd.light, wall: rd.wall, objs: [p] }; return objectStats(sceneFor(tmp), 0, 2, false).area * 4; };
  for (let g = 0; g < sizes.length; g++) {
    const mem = pieces.filter((q) => q.g === g), p0 = mem[0];
    const ref = areaAt({ ...p0, cls: 'F', t: 0.02, s: rng.uniform(...HARD.size), pose: p0.zone === 'table' ? 'lie' : 'lean', beta: 12, gap: 0 });
    for (const p of mem) {
      const target = ref * rng.uniform(0.9, 1.11);
      const k = Math.sqrt(target / areaAt(p));
      p.s *= k; if (p.cls === 'S') p.t *= k;
      if (p.pose === 'lean' && p.cls === 'S' && p.beta < Math.atan2(p.t, faceHeight(p)) / DEG + HARD.stableMargin) p.beta = Math.atan2(p.t, faceHeight(p)) / DEG + HARD.stableMargin + 0.5;
    }
  }
  pieces.forEach(round);
  const wallP = rng.shuffle(pieces.filter((p) => p.zone === 'wall'));
  const gaps = wallP.slice(1).map(() => rng.uniform(0.35, 0.8)), shift = rng.uniform(-0.35, 0.35);
  const turn = wallP.map((p) => p.yaw);
  const layout = () => {
    const ext = wallP.map((p) => { let a = Infinity, b = -Infinity; for (const w of worldPoints({ ...p, x: 0 })) { a = Math.min(a, w[0]); b = Math.max(b, w[0]); } return [a, b]; });
    const total = ext.reduce((s, [a, b]) => s + (b - a), 0) + gaps.reduce((s, v) => s + v, 0);
    let cur = -total / 2 + shift;
    wallP.forEach((p, i) => { p.x = r3(cur - ext[i][0]); cur += ext[i][1] - ext[i][0] + (gaps[i] || 0); });
  };
  layout();
  wallP.forEach((p, i) => { p.yaw = r3(Math.atan2(cam.eye[0] - p.x, cam.eye[2] - WALL_Z) / DEG + turn[i]); });
  layout();
  const order = rng.shuffle(pieces.map((_, i) => i));
  rd.objs = order.map((i) => {
    const p = pieces[i];
    const o = { shape: p.shape, cls: p.cls, pose: p.pose, g: p.g, x: p.x, yaw: p.yaw, s: p.s, t: p.t, col: p.col, mark: p.mark, mr: p.mr, rim: p.rim };
    if (p.pose === 'lie') o.z = p.z; else o.beta = p.beta;
    if (p.pose === 'stand') o.gap = p.gap;
    return o;
  });
  rd.answer = rd.objs.map((o, i) => (o.cls === (q === 'flat' ? 'F' : 'S') ? i : -1)).filter((i) => i >= 0);
  const chk = checkRound(rd, true);
  if (!chk) return null;
  rd.objs.forEach((o, i) => { o.pt = chk.pts[i]; });
  return rd;
}

function checkRound(rd, withPts = false) {
  const objs = rd.objs, n = objs.length;
  if (!GROUPS[n]) return rej('composition');
  const byG = new Map();
  objs.forEach((o, i) => { if (!byG.has(o.g)) byG.set(o.g, []); byG.get(o.g).push(i); });
  const sizes = [...byG.values()].map((v) => v.length).sort((a, b) => b - a);
  if (sizes.join(',') !== GROUPS[n].slice().sort((a, b) => b - a).join(',')) return rej('composition');
  const shapeOf = new Map();
  for (const [g, ids] of byG) { const s = new Set(ids.map((i) => objs[i].shape)); if (s.size !== 1) return rej('composition'); shapeOf.set(g, objs[ids[0]].shape); }
  if (new Set(shapeOf.values()).size !== byG.size) return rej('composition');
  const want = rd.q === 'flat' ? 'F' : 'S';
  const ans = objs.map((o, i) => (o.cls === want ? i : -1)).filter((i) => i >= 0);
  if (ans.length < HARD.ansMin || ans.length > HARD.ansMax || ans.join(',') !== (rd.answer || []).join(',')) return rej('composition');
  const mixed = [...byG.values()].filter((ids) => ids.some((i) => objs[i].cls === 'F') && ids.some((i) => objs[i].cls === 'S'));
  if (mixed.length < HARD.mixedMin) return rej('composition');
  const zone = (o) => (o.pose === 'lie' ? 'table' : 'wall');
  for (const [, ids] of byG) if (new Set(ids.map((i) => zone(objs[i]))).size !== 1) return rej('composition');
  for (const z of ['table', 'wall']) {
    const zs = objs.filter((o) => zone(o) === z);
    if (!zs.some((o) => o.cls === 'F') || !zs.some((o) => o.cls === 'S')) return rej('composition');
  }
  if (objs.filter((o) => zone(o) === 'wall').length > HARD.wallMax || objs.filter((o) => zone(o) === 'table').length > HARD.tableMax) return rej('composition');
  if (!objs.some((o) => o.cls === 'S' && o.pose === 'lean')) return rej('composition:leanBlock');
  const eye = cameraFor(rd).eye;
  const turnOK = (o) => { const d = Math.abs(o.yaw - Math.atan2(eye[0] - o.x, eye[2] - WALL_Z) / DEG); return d >= HARD.wallYaw[0] - 1.5 && d <= HARD.wallYaw[1] + 1.5; };
  for (const o of objs) {
    if (!SHAPES.includes(o.shape) || !['F', 'S'].includes(o.cls) || !Number.isInteger(o.col) || o.col < 0 || o.col >= PAINTS.length) return rej('physics');
    if (![0, 1, 2].includes(o.mark) || (o.mark ? !(o.mr >= HARD.markR[0] - 1e-9 && o.mr <= HARD.markR[1] + 1e-9) : o.mr !== 0)) return rej('physics');
    if (!(o.rim === 0 || (o.rim >= HARD.rimRel[0] - 1e-9 && o.rim <= HARD.rimRel[1] + 1e-9))) return rej('physics:rim');
    if (o.cls === 'F' && !(o.t >= HARD.flatT[0] - 1e-9 && o.t <= HARD.flatT[1] + 1e-9)) return rej('physics');
    if (o.cls === 'S') {
      const rel = o.t / o.s, R = o.pose === 'lie' ? HARD.lieRel : o.pose === 'stand' ? HARD.wallRel : [HARD.wallRel[0], HARD.leanRel[1]];
      if (!(rel >= R[0] - 0.002 && rel <= R[1] + 0.002)) return rej('physics:rel');
    }
    if (o.pose === 'lie') { if (!Number.isFinite(o.z) || o.z < WALL_Z + 1.2) return rej('physics'); }
    else if (o.pose === 'lean') {
      if (!turnOK(o)) return rej('physics:yaw');
      const ok = o.cls === 'F' ? (o.beta >= HARD.betaFUp[0] - 1e-6 && o.beta <= HARD.betaFUp[1] + 1e-6) || (o.beta >= HARD.betaF[0] - 1e-6 && o.beta <= HARD.betaF[1] + 1e-6)
        : o.beta >= Math.max(HARD.betaF[0], Math.atan2(o.t, faceHeight(o)) / DEG + HARD.stableMargin) - 1e-6 && o.beta <= HARD.betaSMax + 1e-6;
      if (!ok) return rej('physics:beta');
    } else if (o.pose === 'stand') { if (o.cls !== 'S' || !(o.gap >= 0 && o.gap <= 0.1 + 1e-9) || !turnOK(o)) return rej('physics'); }
    else return rej('physics');
  }
  const tab = objs.filter((o) => o.pose === 'lie');
  for (let i = 0; i < tab.length; i++) for (let j = i + 1; j < tab.length; j++) if (!footprintsApart(tab[i], tab[j], 0.15)) return rej('physics:tableOverlap');
  const wal = objs.filter((o) => o.pose !== 'lie').map((o) => { let a = Infinity, b = -Infinity; for (const w of worldPoints(o)) { a = Math.min(a, w[0]); b = Math.max(b, w[0]); } return [a, b]; }).sort((u, v) => u[0] - v[0]);
  for (let i = 1; i < wal.length; i++) if (wal[i][0] - wal[i - 1][1] < 0.3) return rej('physics:wallOverlap');
  const xz = (o) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const w of worldPoints(o)) { a = Math.min(a, w[0]); b = Math.max(b, w[0]); c = Math.min(c, w[2]); d = Math.max(d, w[2]); } return [a, b, c, d]; };
  const wx = objs.filter((o) => o.pose !== 'lie').map(xz);
  for (const o of tab) { const e = xz(o); if (e[2] < WALL_Z + 0.4 || wx.some((w) => w[0] < e[1] && e[0] < w[1] && e[2] < w[3] + 0.15)) return rej('physics:nearWall'); }
  const sc = sceneFor(rd), cam = sc.cam;
  const boxes = objs.map((o) => screenBox(cam, o));
  for (const b of boxes) if (b[0] < HARD.edge || b[1] < HARD.edge || b[2] > IMG.w - HARD.edge || b[3] > IMG.h - HARD.edge) return rej('picture:frame');
  const hulls = objs.map((o) => screenParts(cam, o));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = boxes[i], b = boxes[j];
    if (!(a[0] < b[2] + HARD.gapPx && b[0] < a[2] + HARD.gapPx && a[1] < b[3] + HARD.gapPx && b[1] < a[3] + HARD.gapPx)) continue;
    if (!hulls[i].every((P) => hulls[j].every((Q) => apart(P, Q, HARD.gapPx)))) return rej(`picture:overlap-${objs[i].pose === 'lie' ? 'T' : 'W'}${objs[j].pose === 'lie' ? 'T' : 'W'}`);
  }
  const st = objs.map((o, i) => objectStats(sc, i, 2, withPts));
  for (const s of st) if (s.area * 4 < HARD.minArea) return rej('picture');
  const side = objs.map((o, i) => (o.cls === 'S' ? sideStats(sc, i, 1) : null));
  for (let i = 0; i < n; i++) {
    const o = objs[i], sd = side[i];
    if (o.cls === 'S') {
      if (sd.side < HARD.sideMinPx || sd.band < HARD.bandMinPx || sd.side > HARD.sideMaxFrac * sd.vis) {
        return rej(`thickness:S-${o.pose}:${sd.side < HARD.sideMinPx ? 'side' : sd.band < HARD.bandMinPx ? 'band' : 'max'}`);
      }
    }
    else if (o.t * pxPerUnit(cam, o) > HARD.flatEdgeMaxPx) return rej(`thickness:F-${o.pose}`);
  }
  for (const ids of mixed) for (const i of ids) for (const j of ids) {
    if (objs[i].cls !== 'F' || objs[j].cls !== 'S') continue;
    const ai = st[i].area, aj = st[j].area;
    if (Math.max(ai, aj) > HARD.twinArea * Math.min(ai, aj)) return rej('twins:area');
    if (Math.abs(st[i].elong - st[j].elong) > HARD.twinElong) return rej(`twins:elong-${objs[i].pose}`);
  }
  if (!objs.some((o, i) => o.cls === 'F' && o.pose !== 'lie' && castShadowPx(sc, i, 2) >= HARD.shadowFlatPx)) return rej('shortcut');
  let pts = null;
  if (withPts) {
    pts = [];
    for (let i = 0; i < n; i++) {
      if (st[i].frac < 0.995 || !st[i].pt) return rej('points');
      pts.push([r3(st[i].pt[0]), r3(st[i].pt[1])]);
    }
  }
  return { pts, stats: { st, side } };
}

function makeRound(rng, q) {
  const n = rng.pick(Object.keys(GROUPS).map(Number));
  const all = compositions(n, q);
  const ks = [...new Set(all.map((c) => c.k))];
  const k = rng.pick(ks);
  const pool = all.filter((c) => c.k === k);
  for (let a = 0; a < 400; a++) {
    const rd = tryRound(rng, q, n, rng.pick(pool));
    if (rd) return rd;
  }
  throw new Error('flat_or_solid_tap: sampler exhausted');
}

export function semanticKey(m) {
  const rd = m.rounds[0], q = (v) => Math.round(v / 0.75);
  const objs = rd.objs.map((o) => `${o.shape}:${o.cls}:${o.zone || (o.z === undefined ? 'wall' : 'table')}:${o.pose}:${q(o.x)},${o.z === undefined ? 'w' : q(o.z)}`).sort();
  return `flat_or_solid_tap|${rd.q}|${objs.join(';')}`;
}

export function gate(m) {
  if (!m || m.task !== 'flat_or_solid_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  if (!m.rounds.every((r) => QS.includes(r?.q))) return false;
  const inR = (v, [a, b2]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b2 + 1e-9;
  for (const rd0 of m.rounds) {
    if (!rd0 || !Array.isArray(rd0.objs) || !rd0.cam || !rd0.light) return false;
    const c = rd0.cam, l = rd0.light;
    if (!inR(c.az, [-8, 8]) || !inR(c.el, [39, 46]) || c.dist !== 8.6 || c.tz !== 0.15 || c.fov !== 38) return false;
    if (!inR(Math.abs(l.az), HARD.lightAz) || !inR(l.el, HARD.lightEl) || ![0, 1, 2].includes(rd0.wall)) return false;
    const rd = { ...rd0, objs: rd0.objs.map((o) => ({ ...o })) };
    const chk = checkRound(rd, false);
    if (!chk) return false;
    const sc = sceneFor(rd);
    for (let i = 0; i < rd.objs.length; i++) {
      const pt = rd.objs[i].pt;
      if (!Array.isArray(pt) || pickId(sc, pt[0], pt[1]) !== i) return false;
    }
  }
  return true;
}

const PROMPT = {
  flat: { main: 'Tap every flat, paper-thin piece', sub: 'Not the thick blocks of the same shape' },
  solid: { main: 'Tap every thick block', sub: 'Not the paper-thin cut-outs of the same shape' },
};

export default {
  meta: {
    name: 'flat_or_solid_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${IMG.w} board px`, y: `0..${IMG.h} board px`, note: 'select / unselect the piece under the point (revisable until Verify)' },
    ],
    promptHuman: 'Tap every flat piece (no thickness)',
  },

  generate(rng) {
    const q = rng.pick(QS);
    return { task: 'flat_or_solid_tap', board: { ...BOARD }, rounds: [makeRound(rng, q)] };
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    if (a.x < 0 || a.y < 0 || a.x > IMG.w || a.y > IMG.h) return { ok: false, reason: 'outside' };
    const id = pickNear(sceneFor(m.rounds[0]), a.x, a.y, 8);
    if (id < 0) return { ok: false, reason: 'no-piece' };
    const k = s.sel.indexOf(id);
    if (k >= 0) s.sel.splice(k, 1); else s.sel.push(id);
    return { ok: true };
  },

  verify(s, m) {
    const rd = m.rounds[0], sel = [...new Set(s.sel || [])].sort((a, b) => a - b);
    const success = sel.length > 0 && sel.join(',') === rd.answer.join(',');
    const hit = sel.filter((i) => rd.answer.includes(i)).length, wrong = sel.length - hit;
    return { success, partial: success ? 1 : Math.max(0, (hit - wrong) / rd.answer.length), error: success ? 0 : 1, detail: { q: rd.q, selected: sel.length, correct: hit, wrong, need: rd.answer.length } };
  },

  oracle(m) {
    const rd = m.rounds[0];
    return rd.answer.map((i) => ({ op: 'tap', x: rd.objs[i].pt[0], y: rd.objs[i].pt[1] }));
  },

  randomPolicy(m, rnd) {
    const rd = m.rounds[0], acts = [];
    const k = 1 + Math.floor(rnd() * 6), pool = rd.objs.map((_, i) => i);
    for (let j = 0; j < k; j++) {
      const t = j + Math.floor(rnd() * (pool.length - j));
      [pool[j], pool[t]] = [pool[t], pool[j]];
      const o = rd.objs[pool[j]];
      acts.push({ op: 'tap', x: o.pt[0], y: o.pt[1] });
    }
    return acts;
  },

  async mount(env) {
    env.assets.fos = { key: '', img: null, canvas: null, ringKey: '', ring: null };
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const p = PROMPT[env.manifest.rounds[0].q];
    drawPromptText(g, r, p.main, p.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.fos || (env.assets.fos = {});
    const rd = m.rounds[0], q = contextScale(g);
    const look = env.style ? env.assets.look : null;
    const key = look ? `0|${q}|${env.style.key}` : `0|${q}`;
    if (A.key !== key) { A.img = render(look ? styledScene(rd, look) : sceneFor(rd), q); A.canvas = toCanvas(A.img); A.key = key; A.ringKey = ''; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.drawImage(A.canvas, 0, 0, IMG.w, IMG.h);
    const sel = s.sel, rk = `${key}|${sel.slice().sort((a, b) => a - b).join(',')}`;
    if (A.ringKey !== rk) {
      A.ringKey = rk;
      A.ring = null;
      if (sel.length) {
        const W = A.img.w, H = A.img.h, data = new Uint8ClampedArray(W * H * 4);
        for (const id of sel) {
          const outer = silhouetteRing(A.img, id, [25, 145, 250, 255], 3.2);
          for (let k = 0; k < data.length; k += 4) if (outer.data[k + 3]) { data[k] = 25; data[k + 1] = 145; data[k + 2] = 250; data[k + 3] = 255; }
        }
        A.ring = toCanvas({ data, w: W, h: H });
      }
    }
    if (A.ring) g.drawImage(A.ring, 0, 0, IMG.w, IMG.h);
    sel.forEach((id, k) => {
      const pt = rd.objs[id].pt;
      g.beginPath(); g.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
      g.fillStyle = ACCENT; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✓', pt[0], pt[1] + 0.5);
    });
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (e.x < 0 || e.y < 0 || e.x > IMG.w || e.y > IMG.h) return [];
    if (pickNear(sceneFor(env.manifest.rounds[0]), e.x, e.y, 8) < 0) return [];
    return [{ op: 'tap', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} selected`;
  },
};
