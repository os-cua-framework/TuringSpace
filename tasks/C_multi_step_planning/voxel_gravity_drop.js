import { drawPromptText } from '../core/panel.js';
import { rad3 } from '../common/_proj3d.js';
import {
  SLAB, DIRS, DIR_KEYS, makeOrtho, buildWorld, yardProblems, simulate, castRay,
  topVisibility, diskOnTop, clickHits, clearOf, firstTopBelow, firstTopAbove, containerCells, cellKey, arrowSquares,
} from '../common/_voxel_gravity_drop_world.js';
import { drawYard, drawPushStrip, drawRevealMarks } from '../common/_voxel_gravity_drop_draw.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 360 };
const LIST = { x: 6, y: 8, w: 70, h: 300 };
const SCENE = { x0: LIST.x + LIST.w + 8, x1: BOARD.w - 8, y0: 8, y1: BOARD.h - 8 };
export const HARD = Object.freeze({
  gx: 6, gz: 6, scales: [34, 33, 32, 31, 30],
  yaw: [[42, 48]], pitch: [33, 37.5],
  pushes: [4, 6], minDrops: 2, towardViewer: 3,
  strata: [[5, 1], [5, 2], [5, 3]],
  extra: [[0, 3, 6], [1, 2, 4], [2, 1, 3], [3, 0, 2], [4, 0, 1]],
  nearTops: 2,
  crateTop: [0.15, 0.3],
  tol: 6,
  decoyR: 12,
  levelPx: 25,
  minVis: 0.6,
  pathVis: 0.4,
  disk: 8,
  redVis: 0.7,
  balance: 0.3,
  attempts: 20000,
});
const N_COLS = 6;

const r2 = (v) => Math.round(v * 100) / 100;

function genYard(rng, y0, h, n) {
  const { gx, gz } = HARD;
  const S = { x: rng.int(0, gx - 1), z: rng.int(0, gz - 1) };
  const sq = [S], pushes = [];
  for (let k = 0; k < n; k++) {
    const q = sq[sq.length - 1];
    const opts = DIR_KEYS.filter((d) => {
      const nx = q.x + DIRS[d][0], nz = q.z + DIRS[d][1];
      return nx >= 0 && nz >= 0 && nx < gx && nz < gz && !sq.some((o) => o.x === nx && o.z === nz);
    });
    if (!opts.length) return null;
    const wts = opts.map((d) => (d[0] === '+' ? HARD.towardViewer : 1)), tot = wts.reduce((a, b) => a + b, 0);
    let u = rng.raw() * tot, d = opts[opts.length - 1];
    for (let i = 0; i < opts.length; i++) { u -= wts[i]; if (u <= 0) { d = opts[i]; break; } }
    if (n === 2 && k === 1) d = pushes[0];
    const nx = q.x + DIRS[d][0], nz = q.z + DIRS[d][1];
    if (nx < 0 || nz < 0 || nx >= gx || nz >= gz || sq.some((o) => o.x === nx && o.z === nz)) return null;
    pushes.push(d); sq.push({ x: nx, z: nz });
  }
  if (!turns(pushes) || !mirrorSafe(pushes)) return null;
  let tgt = null;
  for (let t = 0; t < 40 && !tgt; t++) {
    const c = [y0];
    for (let k = 1; k < n; k++) c.push(rng.int(h, c[k - 1]));
    c.push(h);
    if (dropsOk(c)) tgt = c;
  }
  if (!tgt) return null;
  const LV = 6, idx = (x, y, z) => (y * gz + z) * gx + x;
  const occ = new Uint8Array(gx * gz * LV), cap = new Int8Array(gx * gz).fill(LV);
  const must = sq.map((q, k) => ({ x: q.x, z: q.z, t: tgt[k], pc: k === 0 ? 0 : (k === n ? HARD.crateTop[1] : HARD.crateTop[0]) }));
  const L = sq[n];
  const nb = rng.shuffle(Object.values(DIRS).map(([dx, dz]) => ({ x: L.x + dx, z: L.z + dz })).filter((q) =>
    q.x >= 0 && q.z >= 0 && q.x < gx && q.z < gz && !sq.some((o) => o.x === q.x && o.z === q.z)));
  if (nb.length < HARD.nearTops) return null;
  for (const q of nb.slice(0, rng.int(HARD.nearTops, Math.min(3, nb.length)))) {
    const front = q.x > L.x || q.z > L.z;
    must.push({ x: q.x, z: q.z, t: Math.max(1, Math.min(5, h + rng.int(-1, front ? 0 : 1))), pc: HARD.crateTop[0] });
  }
  must.forEach((q) => { cap[q.z * gx + q.x] = q.t; });
  const cons = [], crates = [];
  const free = (x, y, z) => occ[idx(x, y, z)] === 0 && y < cap[z * gx + x];
  const fits = (x, z, y, len, axis) => {
    for (let t = 0; t < len; t++) {
      const cx = axis === 'x' ? x + t : x, cz = axis === 'z' ? z + t : z;
      if (cx >= gx || cz >= gz || !free(cx, y, cz) || (y > 0 && occ[idx(cx, y - 1, cz)] === 0)) return false;
    }
    return true;
  };
  const put = (x, z, y, len, axis) => {
    for (let t = 0; t < len; t++) occ[idx(axis === 'x' ? x + t : x, y, axis === 'z' ? z + t : z)] = 1;
    cons.push({ x, z, y, len, axis, col: 0 });
  };
  const crate = (x, y, z) => { occ[idx(x, y, z)] = 2; crates.push({ x, y, z }); };
  for (let y = 0; y <= 4; y++) {
    for (const k of rng.shuffle(must.map((_, i) => i))) {
      const q = must[k];
      if (q.t <= y || occ[idx(q.x, y, q.z)]) continue;
      const below = y > 0 ? occ[idx(q.x, y - 1, q.z)] : 1;
      if (q.pc > 0 && y === q.t - 1 && below !== 2 && rng.raw() < q.pc) { crate(q.x, y, q.z); continue; }
      const opts = [];
      for (const axis of ['x', 'z']) for (const len of [2, 3, 4]) for (let off = 0; off < len; off++) {
        const x = axis === 'x' ? q.x - off : q.x, z = axis === 'z' ? q.z - off : q.z;
        if (x >= 0 && z >= 0 && fits(x, z, y, len, axis)) opts.push([x, z, len, axis]);
      }
      if (opts.length) { const [x, z, len, axis] = rng.pick(opts); put(x, z, y, len, axis); continue; }
      if (below === 2) return null;
      crate(q.x, y, q.z);
    }
    const [, lo, hi] = HARD.extra[y];
    const m = rng.int(lo, hi);
    for (let q = 0; q < m; q++) for (let t = 0; t < 30; t++) {
      const axis = rng.raw() < 0.5 ? 'x' : 'z', len = rng.pick([2, 3, 3, 4]);
      const x = rng.int(0, gx - (axis === 'x' ? len : 1)), z = rng.int(0, gz - (axis === 'z' ? len : 1));
      if (!fits(x, z, y, len, axis)) continue;
      put(x, z, y, len, axis); break;
    }
  }
  const nCr = rng.int(0, 2);
  for (let q = 0; q < nCr; q++) for (let t = 0; t < 20; t++) {
    const x = rng.int(0, gx - 1), z = rng.int(0, gz - 1);
    let y = 0;
    while (y < LV && occ[idx(x, y, z)]) y++;
    if (y > 4 || !free(x, y, z) || (y > 0 && occ[idx(x, y - 1, z)] === 2)) continue;
    crate(x, y, z);
    break;
  }
  return { gx, gz, cons, crates, red: { x: S.x, z: S.z }, pushes };
}

function paintYard(rng, cons) {
  const own = new Map();
  cons.forEach((c, i) => containerCells(c).forEach(([x, z]) => own.set(cellKey(x, c.y, z), i)));
  const nb = cons.map(() => new Set());
  cons.forEach((c, i) => containerCells(c).forEach(([x, z]) => {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const j = own.get(cellKey(x + dx, c.y + dy, z + dz));
      if (j !== undefined && j !== i) nb[i].add(j);
    }
  }));
  const col = new Array(cons.length).fill(-1);
  for (const i of rng.shuffle(cons.map((_, k) => k))) {
    const used = new Set([...nb[i]].map((j) => col[j]));
    const ok = [];
    for (let k = 0; k < N_COLS; k++) if (!used.has(k)) ok.push(k);
    col[i] = ok.length ? rng.pick(ok) : rng.int(0, N_COLS - 1);
  }
  cons.forEach((c, i) => { c.col = col[i]; });
}

function dropsOk(c) {
  let drops = 0, big = false;
  for (let k = 1; k < c.length; k++) { const d = c[k - 1] - c[k]; if (d > 0) drops++; if (d >= 2) big = true; }
  return drops >= HARD.minDrops && (c[0] - c[c.length - 1] < 3 || big);
}
function pathOk(sim, y0) {
  const st = sim.steps, E = sim.end;
  if (st.some((q) => q.blocked)) return false;
  if (!(E.h >= 1 && E.h < y0)) return false;
  if (!dropsOk(st.map((q) => q.h))) return false;
  return new Set(st.map((q) => q.x * 16 + q.z)).size === st.length;
}
function nearTopCount(rd, A) {
  const { W, O, E, sim } = A, on = new Set(sim.steps.map((q) => q.x * 16 + q.z));
  let n = 0;
  for (const [dx, dz] of Object.values(DIRS)) {
    const x = E.x + dx, z = E.z + dz;
    if (x < 0 || z < 0 || x >= rd.gx || z >= rd.gz || on.has(x * 16 + z)) continue;
    const hh = W.H[x][z];
    if (hh >= 1 && Math.abs(hh - E.h) <= 1 && topVisibility(W, O, x, z, 5, false).frac >= 0.3) n++;
  }
  return n;
}
export function mirrorSafe(pushes) {
  let dx = 0, dz = 0;
  for (const p of pushes) { dx += DIRS[p][0]; dz += DIRS[p][1]; }
  return Math.abs(dx) !== Math.abs(dz);
}
export const turns = (pushes) => pushes.some((p) => p[1] === 'x') && pushes.some((p) => p[1] === 'z');

function sceneBounds(rd, W, unit = false) {
  const O = makeOrtho({ ...rd.cam, s: unit ? 1 : rd.cam.s, ox: 0, oy: 0 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = (p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
  for (const x of [0, rd.gx]) for (const z of [0, rd.gz]) { add(O.P(x, 0, z)); add(O.P(x, -SLAB, z)); }
  for (let x = 0; x < rd.gx; x++) for (let z = 0; z < rd.gz; z++) {
    const h = W.H[x][z];
    for (const a of [0, 1]) for (const b of [0, 1]) add(O.P(x + a, h, z + b));
  }
  return { x0, x1, y0, y1 };
}

const analyses = new WeakMap();
export function analyse(rd) {
  let A = analyses.get(rd);
  if (A) return A;
  const O = makeOrtho(rd.cam);
  const W0 = buildWorld(rd);
  const sim = simulate(rd, W0);
  const W = buildWorld(rd, rd.red);
  A = { O, W0, W, sim };
  if (sim.ok) {
    const E = sim.end, y0 = sim.steps[0].h, arrows = arrowSquares(rd), F = arrows[arrows.length - 1];
    A.E = E; A.y0 = y0; A.arrows = arrows; A.F = F;
    A.blocked = sim.steps.some((q) => q.blocked);
    A.vis = topVisibility(W, O, E.x, E.z, 9, false);
    if (A.vis.frac >= HARD.minVis) A.vis = topVisibility(W, O, E.x, E.z, 9, true);
    A.P0 = O.P(rd.red.x + 0.5, y0, rd.red.z + 0.5);
    A.noDrop = O.P(F.x + 0.5, y0, F.z + 0.5);
    A.yardPt = O.P(F.x + 0.5, 0, F.z + 0.5);
    A.target = A.vis.best ? { x: r2(A.vis.best.x), y: r2(A.vis.best.y) } : null;
  }
  analyses.set(rd, A);
  return A;
}

export function decoys(rd, A = analyse(rd)) {
  const { O, sim, E, y0, arrows } = A, out = [];
  const at = (why, q, h) => out.push({ why, p: O.P(q.x + 0.5, h, q.z + 0.5) });
  for (let h = 0; h <= y0 + 1; h++) if (h !== E.h) at(`height${h}`, E, h);
  out.push({ why: 'floating-centre', p: O.P(E.x + 0.5, y0 + 0.5, E.z + 0.5) });
  for (let k = 1; k < sim.steps.length - 1; k++) at(`step${k}-rest`, sim.steps[k], sim.steps[k].h);
  for (let k = 0; k < arrows.length - 1; k++) at(`step${k}-no-drop`, arrows[k], y0);
  return out;
}

function screenDrop(rd, A, mode) {
  const { O, W } = A;
  let p = A.P0, hit = null;
  for (const d of rd.pushes) {
    const v = O.step(d);
    p = { x: p.x + v.x, y: p.y + v.y };
    hit = firstTopBelow(W, O, p, p.y + (A.y0 + 1) * O.V);
    if (!hit) break;
    p = mode === 'rim' ? { x: p.x, y: hit.y } : O.P(hit.i + 0.5, W.H[hit.i][hit.k], hit.k + 0.5);
  }
  return hit;
}
function nearestTop(rd, p) {
  let best = null, bd = Infinity;
  for (const f of clickableTops(rd)) { const d = Math.hypot(f.c.x - p.x, f.c.y - p.y); if (d < bd) { bd = d; best = f; } }
  return best;
}
const midOf = (A) => ({ x: (A.noDrop.x + A.yardPt.x) / 2, y: (A.noDrop.y + A.yardPt.y) / 2 });
const READERS = {
  screenDropEnd: (rd, A) => firstTopBelow(A.W, A.O, A.noDrop, A.yardPt.y + A.O.V),
  upFromYard: (rd, A) => firstTopAbove(A.W, A.O, A.yardPt, A.noDrop.y - A.O.V),
  screenDrop_centre: (rd, A) => screenDrop(rd, A, 'centre'),
  screenDrop_rim: (rd, A) => screenDrop(rd, A, 'rim'),
  nearestNoDrop: (rd, A) => nearestTop(rd, A.noDrop),
  nearestYard: (rd, A) => nearestTop(rd, A.yardPt),
  nearestMiddle: (rd, A) => nearestTop(rd, midOf(A)),
  lineMiddle: (rd, A) => { const m = midOf(A).y; return fallLine(rd).reduce((b, f) => (!b || Math.abs(f.y - m) < Math.abs(b.y - m) ? f : b), null); },
  lineBiggest: (rd) => fallLine(rd).reduce((b, f) => (!b || f.frac > b.frac ? f : b), null),
  lineSecond: (rd) => fallLine(rd)[1] || null,
};
export function readers(rd) {
  const A = analyse(rd), out = {};
  for (const [k, f] of Object.entries(READERS)) out[k] = f(rd, A);
  return out;
}
export function readerHits(rd) {
  const A = analyse(rd), r = readers(rd);
  const hits = {};
  for (const [k, v] of Object.entries(r)) hits[k] = !!v && v.i === A.E.x && v.k === A.E.z;
  return hits;
}
const lines = new WeakMap();
export function fallLine(rd) {
  let L = lines.get(rd);
  if (L) return L;
  const A = analyse(rd), { O, W } = A, faces = clickableTops(rd);
  const byId = new Map(faces.map((f) => [f.i * 16 + f.k, f]));
  const seen = new Map();
  for (let y = Math.floor(A.noDrop.y - O.V / 2); y <= A.yardPt.y + O.V / 2; y += 1) for (const dx of [0, -6, 6]) {
    const h = castRay(W, O, A.noDrop.x + dx, y);
    if (h.kind !== 'top') continue;
    const id = h.i * 16 + h.k, f = byId.get(id);
    if (f && !seen.has(id)) seen.set(id, { i: h.i, k: h.k, y, frac: f.frac });
  }
  L = [...seen.values()].sort((a, b) => a.y - b.y);
  lines.set(rd, L);
  return L;
}

const clickables = new WeakMap();
export function clickableTops(rd) {
  let F = clickables.get(rd);
  if (F) return F;
  const { O, W } = analyse(rd);
  F = [];
  for (let i = 0; i < rd.gx; i++) for (let k = 0; k < rd.gz; k++) {
    const v = topVisibility(W, O, i, k, 5, false);
    if (v.frac >= 0.3) F.push({ i, k, h: W.H[i][k], c: v.centroid, frac: v.frac });
  }
  clickables.set(rd, F);
  return F;
}

export function roundProblems(rd, fast = false, decoysToo = true) {
  const out = [];
  if (!rd || rd.gx !== HARD.gx || rd.gz !== HARD.gz) return ['grid'];
  out.push(...yardProblems(rd));
  if (out.length) return out;
  const c = rd.cam;
  if (!c || ![c.yaw, c.pitch, c.s, c.ox, c.oy].every(Number.isFinite)) return ['camera'];
  if (!HARD.yaw.some(([a, b]) => c.yaw >= a - 1e-9 && c.yaw <= b + 1e-9) || c.pitch < HARD.pitch[0] - 1e-9 || c.pitch > HARD.pitch[1] + 1e-9 || !HARD.scales.includes(c.s)) return ['camera-range'];
  if (c.s * Math.cos(rad3(c.pitch)) < HARD.levelPx) return ['levels-too-close'];
  if (!rd.red || !Number.isInteger(rd.red.x) || !Number.isInteger(rd.red.z) || rd.red.x < 0 || rd.red.z < 0 || rd.red.x >= rd.gx || rd.red.z >= rd.gz) return ['red'];
  if (!Array.isArray(rd.pushes) || rd.pushes.length < HARD.pushes[0] || rd.pushes.length > HARD.pushes[1] || !rd.pushes.every((d) => DIRS[d])) return ['pushes'];
  const A = analyse(rd);
  if (!A.sim.ok) return ['path-' + A.sim.why];
  const { W0, W, O, sim, E, y0, arrows } = A;
  if (W0.maxH > 5 || !HARD.strata.some(([a, b]) => a === y0 && b === E.h)) out.push('heights');
  if (!pathOk(sim, y0)) out.push('push-path');
  if (!mirrorSafe(rd.pushes)) out.push('mirror-same-square');
  if (!turns(rd.pushes)) out.push('straight');
  if (fast && out.length) return out;
  const b = sceneBounds(rd, W);
  if (b.x0 + c.ox < SCENE.x0 || b.x1 + c.ox > SCENE.x1 || b.y0 + c.oy < SCENE.y0 || b.y1 + c.oy > SCENE.y1) out.push('out-of-scene');
  if (topVisibility(W, O, rd.red.x, rd.red.z, 5, false).frac < HARD.redVis) out.push('red-hidden');
  if (fast && out.length) return out;
  if (A.vis.frac < HARD.minVis) out.push('landing-hidden');
  for (let k = 1; k < sim.steps.length - 1; k++) if (topVisibility(W, O, sim.steps[k].x, sim.steps[k].z, 5, false).frac < HARD.pathVis) { out.push('path-hidden'); break; }
  if (!A.target || !diskOnTop(W, O, E.x, E.z, A.target, HARD.disk)) out.push('landing-small');
  if (nearTopCount(rd, A) < HARD.nearTops) out.push('near-tops');
  if (fast && out.length) return out;
  if (!decoysToo) return [...new Set(out)];
  for (const d of decoys(rd, A)) if (!clearOf(W, O, E.x, E.z, d.p, HARD.decoyR)) { out.push('decoy-' + d.why); if (fast) return out; }
  for (let k = 1; k < sim.steps.length - 1; k++) if (sim.steps[k].x === E.x && sim.steps[k].z === E.z) out.push('same-top');
  if (A.target && !clickHits(W, O, E.x, E.z, A.target, HARD.tol)) out.push('target');
  return [...new Set(out)];
}

function genRound(rng, stats = null) {
  const [y0, h] = rng.pick(HARD.strata);
  for (let att = 0; att < HARD.attempts; att++) {
    const n = rng.int(HARD.pushes[0], HARD.pushes[1]);
    const yard = genYard(rng, y0, h, n);
    if (!yard) continue;
    const band = rng.pick(HARD.yaw);
    const rd = { gx: yard.gx, gz: yard.gz, cons: yard.cons, crates: yard.crates, red: yard.red, pushes: yard.pushes,
      cam: { yaw: r2(rng.uniform(band[0], band[1])), pitch: r2(rng.uniform(HARD.pitch[0], HARD.pitch[1])), s: 0, ox: 0, oy: 0 } };
    const W = buildWorld(rd, rd.red);
    const u1 = sceneBounds(rd, W, true);
    let b = null, sx = -1, sy = -1;
    for (const sc of HARD.scales) {
      rd.cam.s = sc; b = { x0: u1.x0 * sc, x1: u1.x1 * sc, y0: u1.y0 * sc, y1: u1.y1 * sc };
      sx = SCENE.x1 - SCENE.x0 - (b.x1 - b.x0); sy = SCENE.y1 - SCENE.y0 - (b.y1 - b.y0);
      if (sx >= 0 && sy >= 0) break;
    }
    if (sx < 0 || sy < 0) { if (stats) stats.fit = (stats.fit || 0) + 1; continue; }
    rd.cam.ox = r2(SCENE.x0 - b.x0 + rng.uniform(0.02, 0.98) * sx);
    rd.cam.oy = r2(SCENE.y0 - b.y0 + rng.uniform(0.02, 0.98) * sy);
    let pr = roundProblems(rd, true, false);
    if (pr.length) { if (stats) for (const w of pr) stats[w] = (stats[w] || 0) + 1; continue; }
    const u = rng.raw(), stop = u > 0 ? Math.log(u) / Math.log(HARD.balance) : Infinity;
    if (readerWeight(rd, stop) >= stop) { if (stats) stats.balance = (stats.balance || 0) + 1; continue; }
    pr = roundProblems(rd, true);
    if (pr.length) { if (stats) for (const w of pr) stats[w] = (stats[w] || 0) + 1; continue; }
    paintYard(rng, rd.cons);
    return JSON.parse(JSON.stringify(rd));
  }
  return null;
}

export const READER_WEIGHT = Object.freeze({ screenDropEnd: 1, upFromYard: 1, screenDrop_centre: 1.5, screenDrop_rim: 1.5, nearestNoDrop: 1, nearestYard: 1, nearestMiddle: 2.5, lineMiddle: 1, lineBiggest: 1, lineSecond: 1 });
export function readerWeight(rd, stop = Infinity) {
  const A = analyse(rd);
  let w = 0;
  for (const [k, wt] of Object.entries(READER_WEIGHT)) {
    const f = READERS[k](rd, A);
    if (f && f.i === A.E.x && f.k === A.E.z) { w += wt; if (w >= stop) return w; }
  }
  return w;
}

export function gate(m) {
  if (!m || m.task !== 'voxel_gravity_drop' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (m.rounds !== undefined || roundProblems(m).length !== 0) return false;
  const s = TASK.init(m);
  for (const a of TASK.oracle(m)) TASK.applyAction(s, a, m);
  return TASK.verify(s, m).success === true;
}

const inList = (x, y) => x >= LIST.x && x <= LIST.x + LIST.w && y >= LIST.y && y <= LIST.y + LIST.h;

const TASK = {
  meta: {
    name: 'voxel_gravity_drop', family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px (a new tap moves the mark; Verify submits; the push list is not a target)` }],
    promptHuman: 'Tap where the red crate ends up',
  },

  generate(rng) {
    const rd = genRound(rng) || JSON.parse(JSON.stringify(FALLBACK[0]));
    return { task: 'voxel_gravity_drop', board: { ...BOARD }, ...rd };
  },

  init() { return { click: null }; },

  applyAction(state, a) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    if (inList(a.x, a.y)) return { ok: false, reason: 'push-card' };
    state.click = { x: a.x, y: a.y };
    return { ok: true };
  },

  verify(state, m) {
    const A = analyse(m);
    const success = !!A.E && !!state.click && clickHits(A.W, A.O, A.E.x, A.E.z, state.click, HARD.tol);
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { tapped: !!state.click } };
  },

  oracle(m) { const A = analyse(m); return [{ op: 'click', x: A.target.x, y: A.target.y }]; },

  randomPolicy(m, rnd) {
    return [{ op: 'click', x: r2(SCENE.x0 + rnd() * (SCENE.x1 - SCENE.x0)), y: r2(SCENE.y0 + rnd() * (SCENE.y1 - SCENE.y0)) }];
  },

  async mount(env) {
    env.assets = env.assets || {}; env.assets.vgd = null;
    if (env.style) {
      const Y = await import('../common/_voxel_gravity_drop_look.js');
      env.assets.yardDraw = Y.drawYardStyled;
      env.assets.yardSkin = await Y.buildYardSkin(Y.chooseYardLook(env.style));
    }
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Tap where the red crate ends up', 'One square per arrow; it falls straight down');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const done = !!env.submitted;
    const rd = m;
    const q = Math.max(1, Math.round((g.getTransform ? g.getTransform().a : 1) * 100) / 100);
    env.assets = env.assets || {};
    let cache = env.assets.vgd;
    const styled = env.style && env.assets.yardSkin ? env.assets.yardSkin : null;
    const key = `${q}|${done ? 1 : 0}` + (styled ? '|' + env.style.key : '');
    if (typeof document !== 'undefined' && (!cache || cache.key !== key || cache.m !== m)) {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(BOARD.w * q); cv.height = Math.ceil(BOARD.h * q);
      const cg = cv.getContext('2d');
      cg.scale(q, q);
      const A = analyse(rd);
      if (styled) env.assets.yardDraw(cg, rd, A.O, done ? buildWorld(rd, { x: A.E.x, z: A.E.z }) : A.W, BOARD, styled);
      else drawYard(cg, rd, A.O, done ? buildWorld(rd, { x: A.E.x, z: A.E.z }) : A.W, BOARD);
      drawPushStrip(cg, rd, A.O, LIST);
      cache = env.assets.vgd = { key, m, cv };
    }
    g.save();
    g.translate(br.x, br.y);
    if (cache) g.drawImage(cache.cv, 0, 0, BOARD.w, BOARD.h);
    drawRevealMarks(g, state.click);
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (inList(e.x, e.y)) return [];
    return [{ op: 'click', x: r2(e.x), y: r2(e.y) }];
  },

  footerStatus(env) {
    return env.state.click ? 'Spot marked' : 'Tap a spot';
  },
};

const FALLBACK = [{"gx":6,"gz":6,"cons":[{"x":5,"z":0,"y":0,"len":2,"axis":"z","col":2},{"x":4,"z":2,"y":0,"len":4,"axis":"z","col":2},{"x":3,"z":1,"y":0,"len":2,"axis":"z","col":0},{"x":4,"z":0,"y":0,"len":2,"axis":"z","col":5},{"x":5,"z":2,"y":0,"len":2,"axis":"z","col":3},{"x":0,"z":0,"y":0,"len":3,"axis":"x","col":2},{"x":2,"z":1,"y":0,"len":4,"axis":"z","col":4},{"x":1,"z":1,"y":0,"len":3,"axis":"z","col":0},{"x":0,"z":5,"y":0,"len":3,"axis":"x","col":3},{"x":3,"z":3,"y":0,"len":2,"axis":"z","col":1},{"x":3,"z":2,"y":1,"len":2,"axis":"z","col":2},{"x":5,"z":0,"y":1,"len":3,"axis":"z","col":4},{"x":4,"z":1,"y":1,"len":2,"axis":"z","col":3},{"x":4,"z":3,"y":1,"len":2,"axis":"z","col":4},{"x":1,"z":3,"y":1,"len":2,"axis":"x","col":1},{"x":1,"z":0,"y":1,"len":3,"axis":"z","col":3},{"x":2,"z":0,"y":1,"len":3,"axis":"z","col":5},{"x":5,"z":0,"y":2,"len":3,"axis":"z","col":3},{"x":3,"z":2,"y":2,"len":2,"axis":"z","col":3},{"x":4,"z":0,"y":2,"len":3,"axis":"z","col":0},{"x":4,"z":3,"y":2,"len":2,"axis":"z","col":1},{"x":1,"z":3,"y":2,"len":2,"axis":"x","col":5},{"x":1,"z":0,"y":2,"len":3,"axis":"z","col":2},{"x":4,"z":0,"y":3,"len":2,"axis":"z","col":4},{"x":1,"z":2,"y":3,"len":2,"axis":"z","col":4}],"crates":[{"x":4,"y":1,"z":0},{"x":4,"y":4,"z":1},{"x":0,"y":0,"z":3},{"x":0,"y":1,"z":5}],"red":{"x":4,"z":1},"pushes":["-z","+x","+z","+z","-x"],"cam":{"yaw":44.02,"pitch":37.17,"s":33,"ox":221.84,"oy":154.42}},{"gx":6,"gz":6,"cons":[{"x":2,"z":1,"y":0,"len":4,"axis":"z","col":1},{"x":1,"z":1,"y":0,"len":4,"axis":"z","col":4},{"x":3,"z":3,"y":0,"len":2,"axis":"x","col":0},{"x":3,"z":2,"y":0,"len":3,"axis":"x","col":4},{"x":0,"z":1,"y":0,"len":4,"axis":"z","col":3},{"x":2,"z":0,"y":0,"len":4,"axis":"x","col":3},{"x":1,"z":3,"y":1,"len":2,"axis":"x","col":5},{"x":0,"z":4,"y":1,"len":3,"axis":"x","col":0},{"x":0,"z":1,"y":1,"len":2,"axis":"x","col":5},{"x":2,"z":0,"y":1,"len":3,"axis":"z","col":2},{"x":3,"z":3,"y":1,"len":2,"axis":"x","col":3},{"x":0,"z":2,"y":1,"len":2,"axis":"x","col":0},{"x":3,"z":0,"y":1,"len":2,"axis":"x","col":0},{"x":4,"z":2,"y":1,"len":2,"axis":"x","col":1},{"x":1,"z":3,"y":2,"len":2,"axis":"z","col":1},{"x":0,"z":1,"y":2,"len":3,"axis":"x","col":0},{"x":2,"z":2,"y":2,"len":3,"axis":"z","col":3},{"x":0,"z":2,"y":2,"len":2,"axis":"x","col":5},{"x":3,"z":3,"y":2,"len":2,"axis":"x","col":2},{"x":4,"z":2,"y":2,"len":2,"axis":"x","col":5},{"x":3,"z":0,"y":2,"len":2,"axis":"x","col":3},{"x":1,"z":3,"y":3,"len":2,"axis":"z","col":2},{"x":0,"z":1,"y":3,"len":3,"axis":"x","col":5},{"x":4,"z":2,"y":3,"len":2,"axis":"z","col":1}],"crates":[{"x":1,"y":3,"z":2},{"x":2,"y":3,"z":2},{"x":2,"y":4,"z":1},{"x":5,"y":1,"z":0}],"red":{"x":2,"z":1},"pushes":["-x","+z","+x","+z"],"cam":{"yaw":47.23,"pitch":35.59,"s":33,"ox":233.04,"oy":172.69}}];

export default TASK;
export const __test = { HARD, BOARD, LIST, SCENE, FALLBACK, readerWeight, genYard, genRound, analyse, readers, readerHits, roundProblems, clickableTops, decoys, sceneBounds, fallLine };

export function semanticKey(m) {
  const cons = m.cons.map((c) => `${c.x},${c.z},${c.y},${c.len}${c.axis}`).sort().join(';');
  const crates = m.crates.map((c) => `${c.x},${c.y},${c.z}`).sort().join(';');
  return `voxel_gravity_drop|${cons}|${crates}|${m.red.x},${m.red.z}|${m.pushes.join('')}`;
}
