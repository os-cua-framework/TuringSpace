import { drawPromptText } from '../core/panel.js';
import * as RT from '../common/_people_rt.js';
import { makeCamera } from '../common/_proj3d.js';
import { makeScene, makeLight, CLAY } from '../common/_scene3d.js';
import { validatedGenerator, sceneOwnership } from '../core/generated-scene.js';
import { pushCues, cueContext, quickVisibility } from '../common/_push_box_to_mark_cues.js';
import { hull as hull2 } from '../common/_clay_feature_geometry.js';
import { seatPaintCover } from '../common/_seat_feature_geometry.js';
import { expandConvex, visibleDisk } from '../core/feature-geometry.js';
import { envLook, wardrobe, texMat, faceOf, pickOf, S3 } from '../common/_rt_look.js';
import { pickTex, splitPick } from '../common/_rt_kit.js';

const BOARD = { w: 340, h: 350 };
const G = 5;
const TILE = 24;
const YAWS = [45, 135, 225, 315];
const PITCH = 55;
const CAM = { offAxis: 12, pitch: [38, 46], ratio: [0.70, 0.75], fov: 2100, tries: 14 };
const PILLAR = { w: 0.62, h: 30 };
const CRATE = 0.74;
const HIT_R = 24;
const PUSH = { min: 4, max: 6, clicks: 10 };
const PILLARS = { min: 1, max: 3 };
const TAU = Math.PI * 2;
const DIRS = [
  { n: 'N', dx: 0, dy: -1 }, { n: 'E', dx: 1, dy: 0 },
  { n: 'S', dx: 0, dy: 1 }, { n: 'W', dx: -1, dy: 0 },
];
const dirOf = (n) => DIRS.find((d) => d.n === n);

const key = (x, y) => y * G + x;
const inb = (x, y) => x >= 0 && x < G && y >= 0 && y < G;
const cellEq = (a, b) => a.x === b.x && a.y === b.y;
function freeM(x, y, crates, pillars) {
  if (!inb(x, y)) return false;
  for (const p of pillars) if (p.x === x && p.y === y) return false;
  for (const c of crates) if (c.x === x && c.y === y) return false;
  return true;
}
function reach(mover, crates, pillars) {
  const seen = new Set([key(mover.x, mover.y)]), stack = [mover];
  while (stack.length) {
    const p = stack.pop();
    for (const d of DIRS) {
      const nx = p.x + d.dx, ny = p.y + d.dy, k = key(nx, ny);
      if (!seen.has(k) && freeM(nx, ny, crates, pillars)) { seen.add(k); stack.push({ x: nx, y: ny }); }
    }
  }
  return seen;
}
const onMarks = (crates, marks) => {
  const ms = new Set(marks.map((m) => key(m.x, m.y)));
  return crates.every((c) => ms.has(key(c.x, c.y)));
};
function legalPushes(s, pillars) {
  const out = [], rs = reach(s.mover, s.crates, pillars);
  s.crates.forEach((c, i) => {
    for (const d of DIRS) {
      if (!freeM(c.x + d.dx, c.y + d.dy, s.crates, pillars)) continue;
      const from = { x: c.x - d.dx, y: c.y - d.dy };
      if (!freeM(from.x, from.y, s.crates, pillars) || !rs.has(key(from.x, from.y))) continue;
      out.push({ i, d, walk: !cellEq(from, s.mover) });
    }
  });
  return out;
}
const afterPush = (s, p) => ({
  mover: { x: s.crates[p.i].x, y: s.crates[p.i].y },
  crates: s.crates.map((c, j) => (j === p.i ? { x: c.x + p.d.dx, y: c.y + p.d.dy } : { ...c })),
});
function canon(s, pillars, exactMover) {
  const ks = s.crates.map((c) => key(c.x, c.y)).sort((a, b) => a - b).join(',');
  if (exactMover) return `${ks}|${key(s.mover.x, s.mover.y)}`;
  let mn = Infinity; for (const k of reach(s.mover, s.crates, pillars)) if (k < mn) mn = k;
  return `${ks}|${mn}`;
}
function solvePushes(m, start = { mover: m.mover, crates: m.crates }, budget = 8) {
  if (onMarks(start.crates, m.marks)) return { len: 0, path: [] };
  const q = [{ s: start, g: 0, prev: null, p: null }], seen = new Set([canon(start, m.pillars)]);
  for (let h = 0; h < q.length; h++) {
    const nd = q[h];
    if (nd.g >= budget) continue;
    for (const p of legalPushes(nd.s, m.pillars)) {
      const s2 = afterPush(nd.s, p), k = canon(s2, m.pillars);
      if (seen.has(k)) continue;
      seen.add(k);
      const child = { s: s2, g: nd.g + 1, prev: nd, p: { i: p.i, dir: p.d.n } };
      if (onMarks(s2.crates, m.marks)) {
        const path = []; for (let c = child; c.p; c = c.prev) path.unshift(c.p);
        return { len: child.g, path };
      }
      q.push(child);
    }
  }
  return { len: Infinity, path: [] };
}
function solveTaps(m, budget = 12) {
  const start = { mover: m.mover, crates: m.crates };
  const best = new Map([[canon(start, m.pillars, true), 0]]), buckets = [[start]];
  for (let c = 0; c <= budget; c++) {
    for (const s of buckets[c] || []) {
      if (best.get(canon(s, m.pillars, true)) !== c) continue;
      if (onMarks(s.crates, m.marks)) return c;
      for (const p of legalPushes(s, m.pillars)) {
        const s2 = afterPush(s, p), k = canon(s2, m.pillars, true), c2 = c + (p.walk ? 2 : 1);
        if (c2 > budget || (best.has(k) && best.get(k) <= c2)) continue;
        best.set(k, c2); (buckets[c2] ||= []).push(s2);
      }
    }
  }
  return Infinity;
}

function contractOk(m, planChecked = false) {
  if (!m || m.task !== 'push_box_to_mark' || m.grid !== G) return false;
  if (!cameraOk(m)) return false;
  const intCell = (c) => c && Number.isInteger(c.x) && Number.isInteger(c.y) && inb(c.x, c.y);
  const { pillars, marks, crates, mover } = m;
  if (!Array.isArray(pillars) || pillars.length < PILLARS.min || pillars.length > PILLARS.max || !pillars.every(intCell)) return false;
  if (!Array.isArray(crates) || crates.length !== 2 || !crates.every(intCell)) return false;
  if (!Array.isArray(marks) || marks.length !== crates.length || !marks.every(intCell) || !intCell(mover)) return false;
  const cells = [...pillars, ...marks, ...crates];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (cellEq(cells[i], cells[j])) return false;
  if ([...pillars, ...crates, ...marks].some((c) => cellEq(c, mover))) return false;
  if (crates.some(onBorder)) return false;
  return (planChecked || planOk(m)) && (m.ext || affineMisreads(m) >= 1) && firstPushOk(m) && visibilityOk(m);
}

function cameraOk(m) {
  const cam = m.camera;
  if (!cam || !['yaw', 'pitch', 'dist', 'fov'].every((k) => Number.isFinite(cam[k]))) return false;
  if (m.ext) return YAWS.includes(cam.yaw) && cam.pitch === PITCH;
  const off = ((cam.yaw % 45) + 45) % 45;
  if (cam.yaw < 0 || cam.yaw >= 360 || Math.min(off, 45 - off) < CAM.offAxis) return false;
  if (cam.pitch < CAM.pitch[0] || cam.pitch > CAM.pitch[1]) return false;
  const r = depthRatio(cam);
  return r >= CAM.ratio[0] - 0.002 && r <= CAM.ratio[1] + 0.002;
}
export function depthRatio(c) {
  const cam = makeCamera({ yaw: c.yaw, pitch: c.pitch, dist: c.dist, cx: 0, cy: 0, fov: c.fov, minDepth: 1 });
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const d = cam.project(world(x, y)).depth; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  return lo / hi;
}
function cameraFor(yaw, pitch, ratio) {
  let lo = 40, hi = 20000;
  for (let it = 0; it < 50; it++) {
    const d = (lo + hi) / 2;
    if (depthRatio({ yaw, pitch, dist: d, fov: CAM.fov }) < ratio) lo = d; else hi = d;
  }
  return { yaw, pitch, dist: +((lo + hi) / 2).toFixed(2), fov: CAM.fov };
}
function sampleCamera(rng) {
  const yaw = +(45 * rng.int(0, 7) + rng.uniform(CAM.offAxis, 45 - CAM.offAxis)).toFixed(2);
  return cameraFor(yaw, +rng.uniform(CAM.pitch[0], CAM.pitch[1]).toFixed(2), rng.uniform(CAM.ratio[0], CAM.ratio[1]));
}

function quickVisible(m, fp) {
  const cam = displayCamera(m), depth = (c, h = 0) => cam.project(world(c.x, c.y, h)).depth;
  const solids = [...m.pillars.map((c) => ({ c, hull: crateHull(cam, c, TILE * PILLAR.w / 2, PILLAR.h), d: depth(c, PILLAR.h / 2) })),
    ...m.crates.map((c) => ({ c, hull: crateHull(cam, c), d: depth(c, TILE * CRATE / 2) }))];
  const clear = (cell, h) => { const p = cam.project(world(cell.x, cell.y, h)); return solids.every((b) => cellEq(b.c, cell) || b.d >= p.depth || !inHull(b.hull, p.x, p.y)); };
  return m.marks.every((k) => clear(k, 0)) && m.crates.every((c) => clear(c, TILE * CRATE)) && fp.every((f) => clear(f.from, 0));
}

function fitAffine(src, dst) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (let i = 0; i < src.length; i++) {
    const v = [src[i].x, src[i].y, 1];
    for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a][b] += v[a] * v[b]; bx[a] += v[a] * dst[i].x; by[a] += v[a] * dst[i].y; }
  }
  const solve = (A, b) => {
    const q = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(q[k][i]) > Math.abs(q[p][i])) p = k;
      [q[i], q[p]] = [q[p], q[i]];
      for (let k = 0; k < 3; k++) if (k !== i) { const f = q[k][i] / q[i][i]; for (let j = i; j < 4; j++) q[k][j] -= f * q[i][j]; }
    }
    return q.map((r, i) => r[3] / r[i]);
  };
  const cx = solve(M, bx), cy = solve(M, by);
  return (p) => ({ x: cx[0] * p.x + cx[1] * p.y + cx[2], y: cy[0] * p.x + cy[1] * p.y + cy[2] });
}
export function affineReading(m) {
  const cam = displayCamera(m), corners = [[-0.5, -0.5], [G - 0.5, -0.5], [G - 0.5, G - 0.5], [-0.5, G - 0.5]];
  const scr = corners.map(([x, y]) => cam.project(world(x, y))), grd = corners.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
  const toGrid = fitAffine(scr, grd), toScreen = fitAffine(grd, scr);
  const cl = (v) => Math.max(0, Math.min(G - 1, Math.floor(v)));
  const read = (p) => { const g = toGrid(cam.project(p)); return { x: cl(g.x), y: cl(g.y) }; };
  const crates = m.crates.map((c) => read(world(c.x, c.y, TILE * CRATE / 2)));
  const marks = m.marks.map((k) => read(world(k.x, k.y, 0)));
  const from = (firstPushes(m) || []).map((f) => { const q = toScreen({ x: f.from.x + 0.5, y: f.from.y + 0.5 }); return { cell: f.from, hit: task._cellAt(q.x, q.y, cam) }; });
  return { crates, marks, from };
}
function affineMisreads(m) {
  const r = affineReading(m);
  return r.crates.filter((c, i) => !cellEq(c, m.crates[i])).length + r.marks.filter((k, i) => !cellEq(k, m.marks[i])).length
    + r.from.filter((f) => !f.hit || !cellEq(f.hit, f.cell)).length;
}

const onBorder = (c) => onBorderCell(c);
function tileVisible(m, state, cell, memo = null) {
  const sk = memo && state.crates.map((c) => `${c.x},${c.y}`).join(';') + `|${state.mover.x},${state.mover.y}`;
  let got = memo && memo.get(sk);
  if (!got) {
    const built = buildScene(m, state, cueContext());
    const { scene, camera } = built;
    scene.render({ background: false });
    got = { built, covers: scene.queue.map((p) => seatPaintCover(p, camera)) };
    if (memo) memo.set(sk, got);
  }
  const { built, covers } = got, camera = built.camera;
  const tile = built.tiles.find((t) => t.x === cell.x && t.y === cell.y);
  return 2 * visibleDisk([expandConvex(hull2(tile.corners.map(camera.project)), -1.8)], covers, 0).r;
}
const FP_MEMO = new Map();
const planKey = (m) => ['pillars', 'crates', 'marks'].map((k) => m[k].map((c) => `${c.x},${c.y}`).join(';')).join('|') + `|${m.mover.x},${m.mover.y}`;
function firstPushes(m) {
  const k = planKey(m);
  if (!FP_MEMO.has(k)) { if (FP_MEMO.size > 64) FP_MEMO.clear(); FP_MEMO.set(k, firstPushesRaw(m)); }
  return FP_MEMO.get(k);
}
function firstPushesRaw(m) {
  const sol = solvePushes(m);
  if (sol.len === Infinity) return null;
  let s = { mover: { ...m.mover }, crates: m.crates.map((c) => ({ ...c })) };
  const out = [];
  for (const p of sol.path) {
    const d = dirOf(p.dir), c = s.crates[p.i];
    if (!out.some((o) => o.i === p.i)) out.push({ i: p.i, from: { x: c.x - d.dx, y: c.y - d.dy }, state: s });
    s = afterPush(s, { i: p.i, d });
  }
  return out;
}
function firstPushOk(m) {
  const fp = firstPushes(m);
  if (!fp || fp.length !== m.crates.length) return false;
  const s0 = { mover: m.mover, crates: m.crates }, memo = new Map();
  return fp.every((f) => tileVisible(m, s0, f.from, memo) >= VIS.from && tileVisible(m, f.state, f.from, memo) >= VIS.from);
}

const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const matched = (m, cs) => Math.min(md(cs[0], m.marks[0]) + md(cs[1], m.marks[1]), md(cs[0], m.marks[1]) + md(cs[1], m.marks[0]));
function trapCount(m) {
  const s0 = { mover: m.mover, crates: m.crates }, d0 = matched(m, m.crates);
  let n = 0;
  for (const p of legalPushes(s0, m.pillars)) {
    const s1 = afterPush(s0, p);
    if (matched(m, s1.crates) < d0 && solvePushes(m, s1, 14).len === Infinity) n++;
  }
  return n;
}
function planOk(m) {
  const sol = solvePushes(m);
  if (!(sol.len >= PUSH.min && sol.len <= PUSH.max)) return false;
  if (!(sol.len > matched(m, m.crates))) return false;
  if (trapCount(m) < 1) return false;
  return solveTaps(m) <= PUSH.clicks;
}

const VIS = { crate: 14, mark: 14, pillar: 6, mover: 6, from: 18 };
function visibilityOk(m) {
  const cues = quickVisibility(m, buildScene(m, null, cueContext()), world);
  for (const b of cues.bodies) {
    const need = b.id.startsWith('crate') ? VIS.crate : b.id.startsWith('pillar') ? VIS.pillar : VIS.mover;
    if (!(b.diameter >= need)) return false;
  }
  return cues.marks.every((k) => k.diameter >= VIS.mark);
}

export function gate(m) { return contractOk(m); }
export { tileVisible as _tileVisible, firstPushes as _firstPushes, solvePushes as _solvePushes };

const step = (a, d, k = 1) => ({ x: a.x + d.dx * k, y: a.y + d.dy * k });
function planCells(c, legs) {
  const cells = [c]; let q = c;
  for (const [d, k] of legs) for (let j = 0; j < k; j++) { cells.push(step(q, d, -1)); q = step(q, d); cells.push(q); }
  return { cells, end: q };
}
const ALL_CELLS = Array.from({ length: G * G }, (_, i) => ({ x: i % G, y: Math.floor(i / G) }));
const INNER_CELLS = ALL_CELLS.filter((c) => !onBorderCell(c));
function onBorderCell(c) { return c.x === 0 || c.y === 0 || c.x === G - 1 || c.y === G - 1; }
function tryBuild(rng, ext = null) {
  const nP = rng.int(PILLARS.min, PILLARS.max), crates = rng.shuffle(INNER_CELLS).slice(0, 2);
  const pick = rng.shuffle(ALL_CELLS.filter((c) => !crates.some((k) => cellEq(k, c))));
  const marks = pick.slice(0, 2), pillars = pick.slice(2, 2 + nP), mover = pick[2 + nP];
  const lb = Math.min(md(crates[0], marks[0]) + md(crates[1], marks[1]), md(crates[0], marks[1]) + md(crates[1], marks[0]));
  if (lb >= PUSH.max || lb < 2) return null;
  const m = {
    task: 'push_box_to_mark', grid: G, board: { ...BOARD },
    camera: { yaw: YAWS[0], pitch: PITCH, dist: 430, fov: 2100 },
    pillars, marks, crates, mover,
    ...(ext ? { ext, pan: { dx: +rng.uniform(-26, 26).toFixed(1), dy: +rng.uniform(-14, 0).toFixed(1) } } : {}),
  };
  if (!planOk(m)) return null;
  if (!ext) {
    const fp = firstPushes(m);
    if (!fp) return null;
    const away = fp.map((f) => { const c = f.state.crates[f.i]; return { x: f.from.x - c.x, y: f.from.y - c.y }; });
    for (let t = 0, k = 0; t < 5 * CAM.tries && k < CAM.tries; t++) {
      const cam = sampleCamera(rng), a = cam.yaw * Math.PI / 180;
      if (!away.every((d) => d.x * Math.sin(a) + d.y * Math.cos(a) >= 0)) continue;
      k++; m.camera = cam;
      if (!quickVisible(m, fp)) continue;
      if (contractOk(m, true)) return m;
    }
    return null;
  }
  for (const yaw of rng.shuffle(YAWS)) { m.camera.yaw = yaw; if (contractOk(m)) return m; }
  return null;
}

const FALLBACK = {
  task: 'push_box_to_mark', grid: G, board: { ...BOARD },
  camera: { yaw: 315, pitch: PITCH, dist: 430, fov: 2100 },
  pillars: [{ x: 4, y: 1 }], marks: [{ x: 2, y: 0 }, { x: 1, y: 2 }],
  crates: [{ x: 1, y: 3 }, { x: 3, y: 1 }], mover: { x: 0, y: 3 },
};
const FALLBACK_EVAL = {"task":"push_box_to_mark","grid":5,"board":{"w":340,"h":350},"camera":{"yaw":201.96,"pitch":44.95,"dist":208.88,"fov":2100},"pillars":[{"x":0,"y":3},{"x":1,"y":3},{"x":1,"y":2}],"marks":[{"x":0,"y":0},{"x":2,"y":4}],"crates":[{"x":2,"y":2},{"x":1,"y":1}],"mover":{"x":3,"y":2}};
export const _fallbackOk = () => contractOk(JSON.parse(JSON.stringify(FALLBACK_EVAL)));

const world = (x, y, wy = 0) => ({ x: (x - (G - 1) / 2) * TILE, y: wy, z: (y - (G - 1) / 2) * TILE });
const GRID_TOP = 24, GRID_BOTTOM = BOARD.h - 62;
const GRID_SIDE = 34;
const FIT_EVAL = { top: 18, bottom: BOARD.h - 26, side: 12 };
export function displayCamera(m) {
  const cam = makeCamera({ yaw: m.camera.yaw, pitch: m.camera.pitch, dist: m.camera.dist, cx: 0, cy: 0, fov: m.camera.fov });
  const pts = [];
  const e = (G / 2) * TILE;
  for (const x of [-e, e]) for (const z of [-e, e]) for (const y of [0, PILLAR.h]) pts.push(cam.project({ x, y, z }));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const gridFit = !!m.ext || YAWS.includes(m.camera.yaw) && m.camera.pitch === PITCH;
  const top = gridFit ? GRID_TOP : FIT_EVAL.top, bottom = gridFit ? GRID_BOTTOM : FIT_EVAL.bottom, side = gridFit ? GRID_SIDE : FIT_EVAL.side;
  const scale = Math.min((BOARD.w - 2 * side) / (x1 - x0), (bottom - top) / (y1 - y0));
  const ox = BOARD.w / 2 - ((x0 + x1) / 2) * scale + (m.pan ? m.pan.dx : 0), oy = (top + bottom) / 2 - ((y0 + y1) / 2) * scale + (m.pan ? m.pan.dy : 0);
  return { ...cam, displayScale: scale, project(p) { const q = cam.project(p); return { ...q, x: ox + q.x * scale, y: oy + q.y * scale }; } };
}

export function buildScene(m, state = null, g = null, br = BOARD) {
  const st = state || { mover: m.mover, crates: m.crates }, camera = displayCamera(m);
  const scene = makeScene(g, camera, { light: makeLight({ dir: { x: -0.45, y: 0.82, z: 0.36 } }), width: br.w, height: br.h });
  const ownership = sceneOwnership(scene), tiles = [], supports = [];
  const supportId = (c) => `tile-${c.x}-${c.y}`;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const p = world(x, y);
    const corners = [[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]].map(([ox, oy]) => world(x + ox, y + oy));
    tiles.push({ x, y, corners });
    supports.push({ id: supportId({ x, y }), type: 'rect', ...p, w: TILE * 0.96, d: TILE * 0.96 });
  }
  m.pillars.forEach((pl, i) => ownership.own(`pillar${i}`, supportId(pl), () => {
    const w = world(pl.x, pl.y);
    scene.box({ x: w.x, z: w.z, w: TILE * PILLAR.w, d: TILE * PILLAR.w, h: PILLAR.h, y: 0, color: CLAY.slate, round: 2 });
  }));
  st.crates.forEach((c, i) => ownership.own(`crate${i}`, supportId(c), () => {
    const w = world(c.x, c.y);
    scene.box({ x: w.x, z: w.z, w: TILE * CRATE, d: TILE * CRATE, h: TILE * CRATE, y: 0, color: CLAY.wood, round: 2 });
  }));
  const mw = world(st.mover.x, st.mover.y);
  ownership.own('mover', supportId(st.mover), () => scene.figure({ x: mw.x, z: mw.z, yawDeg: m.camera.yaw, scale: 0.5 }, CLAY.cloth));
  const rs = reach(st.mover, st.crates, m.pillars), targets = [];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const ci = st.crates.findIndex((c) => c.x === x && c.y === y), dx = x - st.mover.x, dy = y - st.mover.y;
    const pushable = ci >= 0 && Math.abs(dx) + Math.abs(dy) === 1 && freeM(x + dx, y + dy, st.crates, m.pillars);
    if (rs.has(key(x, y)) || pushable) targets.push({ id: `cell-${x}-${y}`, world: world(x, y, 4) });
  }
  const geometry = ownership.finish({ supports, targets, separation: { world: TILE }, observations: [{ id: 'current-grid', targets: targets.map((t) => {
    const p = camera.project(t.world); return { id: t.id, screen: { type: 'projection', x: p.x, y: p.y } };
  }) }], targetMeaning: 'Reachable walk cells and currently legal adjacent crate pushes. Projected anchors match _cellAt at world y=4; crate silhouettes take priority in pointer().' });
  return { scene, camera, tiles, geometry };
}

function cellHitRegion(camera, gx, gy) {
  const p = camera.project(world(gx, gy, 4)), constraints = [
    { x: -1, y: 0, d: p.x }, { x: 1, y: 0, d: BOARD.w - p.x },
    { x: 0, y: -1, d: p.y }, { x: 0, y: 1, d: BOARD.h - p.y },
  ];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (x !== gx || y !== gy) {
    const q = camera.project(world(x, y, 4)), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    constraints.push({ x: dx / d, y: dy / d, d: d / 2 });
  }
  const points = [{ x: -HIT_R, y: 0 }, { x: HIT_R, y: 0 }, { x: 0, y: -HIT_R }, { x: 0, y: HIT_R }];
  for (const a of constraints) if (a.d <= HIT_R) {
    const t = Math.sqrt(Math.max(0, HIT_R * HIT_R - a.d * a.d));
    for (const sign of [-1, 1]) points.push({ x: a.x * a.d - sign * a.y * t, y: a.y * a.d + sign * a.x * t });
  }
  constraints.forEach((a, i) => constraints.slice(i + 1).forEach((b) => {
    const det = a.x * b.y - a.y * b.x;
    if (Math.abs(det) > 1e-12) points.push({ x: (a.d * b.y - a.y * b.d) / det, y: (a.x * b.d - a.d * b.x) / det });
  }));
  const inside = points.filter((q) => Math.hypot(q.x, q.y) <= HIT_R + 1e-7 && constraints.every((a) => a.x * q.x + a.y * q.y <= a.d + 1e-7));
  return { center: p, radius: HIT_R, constraints,
    effectiveWidthPx: Math.max(...inside.map((q) => q.x)) - Math.min(...inside.map((q) => q.x)),
    effectiveHeightPx: Math.max(...inside.map((q) => q.y)) - Math.min(...inside.map((q) => q.y)),
    inscribedDiameterPx: 2 * Math.min(HIT_R, ...constraints.map((a) => a.d)) };
}

function crateHull(camera, c, halfW = TILE * CRATE / 2, height = TILE * CRATE) {
  const w = world(c.x, c.y), h = halfW, pts = [];
  for (const dx of [-h, h]) for (const dz of [-h, h]) for (const y of [0, height]) pts.push(camera.project({ x: w.x + dx, y, z: w.z + dz }));
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => { const out = []; for (const p of list) { while (out.length > 1 && cr(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } return out; };
  return half(pts).slice(0, -1).concat(half(pts.slice().reverse()).slice(0, -1));
}
const inHull = (hull, x, y) => hull.every((a, i) => { const b = hull[(i + 1) % hull.length]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0; });

const U = 0.05;
const CURB = { h: 0.2, t: 0.2 };
export function floorFn(m) {
  const tile = TILE * U, half = (G / 2) * tile;
  const A = RT.lin('#d9d4ca'), B = RT.lin('#cec8bc'), GR = RT.lin('#9c9487');
  const OUT = RT.lin('#bcbab4'), OUT2 = RT.lin('#aeaca6');
  const MK = RT.lin('#56d2c7'), MK2 = RT.lin('#3fb9ae'), RING = RT.lin('#f4fbfa');
  const marks = new Set(m.marks.map((k) => key(k.x, k.y)));
  return (x, z, fp, out) => {
    const gx = (x + half) / tile, gz = (z + half) / tile;
    if (gx < 0 || gz < 0 || gx >= G || gz >= G) {
      const n = RT.fbm(x * 3, z * 3, 3, fp);
      RT.mixInto(out, OUT2, OUT, 0.3 + 0.6 * n);
      return;
    }
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix - 0.5, v = gz - iz - 0.5;
    const n = RT.fbm(x * 7, z * 7, 3, fp);
    if (marks.has(key(ix, iz))) {
      RT.mixInto(out, MK2, MK, 0.5 + 0.4 * n);
      const r = Math.hypot(u, v) * tile, ringW = 0.035;
      const k = Math.max(0, Math.min(1, (ringW - Math.abs(r - 0.2)) / Math.max(fp, 1e-4) + 0.5));
      RT.mixInto(out, out, RING, 0.9 * k);
    } else RT.mixInto(out, A, B, 0.35 * RT.hash2(ix, iz) + 0.5 * n);
    const m2 = Math.max(RT.lineMask(gx * tile, tile, 0.012, fp), RT.lineMask(gz * tile, tile, 0.012, fp));
    RT.mixInto(out, out, GR, 0.85 * m2);
  };
}
function crateTex(light, dark) {
  const L = RT.lin(light), D = RT.lin(dark);
  return (x, y, z, nx, ny, nz, s, out) => {
    const [lu, lv] = RT.boxLocal(s, x, z), ly = y - s.cy;
    let a, b;
    if (Math.abs(ny) > 0.7) { a = lu / s.hx; b = lv / s.hz; }
    else if (Math.abs(nx * s.ca - nz * s.sa) > 0.7) { a = lv / s.hz; b = ly / s.hy; }
    else { a = lu / s.hx; b = ly / s.hy; }
    const edge = Math.max(Math.abs(a), Math.abs(b)) > 0.78;
    const grain = RT.fbm((x + z) * 30, y * 30 + (x - z) * 4, 2);
    const plank = Math.abs(((b + 1) * 2.5) % 1 - 0.5) > 0.46;
    RT.mixInto(out, D, L, edge ? 0.15 + 0.2 * grain : (plank ? 0.3 : 0.55 + 0.35 * grain));
  };
}
export function traceScene(m, st, br = BOARD) {
  const dc = displayCamera(m), o = dc.project({ x: 0, y: 0, z: 0 });
  const cam = RT.camFromProj3d({ yaw: m.camera.yaw, pitch: m.camera.pitch, dist: m.camera.dist, fov: m.camera.fov }, br.w, br.h, U, { scale: dc.displayScale, ox: o.x, oy: o.y });
  const mats = [
    RT.skinMat('#e0b48f'), RT.hairMat('#30221a'), RT.clothMat('#c0603f'), RT.clothMat('#3a3f4b'), RT.clothMat('#2a2a2f', 0.22),
    { c: RT.lin('#b88a55'), ks: 0.08, sh: 14, tex: crateTex('#c99a62', '#8a6236') },
    { c: RT.lin('#9a978f'), ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 8 + z * 8, y * 8, 3); RT.mixInto(out, RT.lin('#8a8780'), RT.lin('#aaa79f'), 0.3 + 0.6 * n); } },
    { c: RT.lin('#bdb6aa'), ks: 0.04, sh: 8 },
  ];
  const shapes = [], tile = TILE * U, half = (G / 2) * tile;
  for (const [cx, cz, hx, hz] of [[0, -half - CURB.t / 2, half + CURB.t, CURB.t / 2], [0, half + CURB.t / 2, half + CURB.t, CURB.t / 2],
    [-half - CURB.t / 2, 0, CURB.t / 2, half], [half + CURB.t / 2, 0, CURB.t / 2, half]]) shapes.push(RT.shape.box(90, 7, cx, CURB.h / 2, cz, hx, CURB.h / 2, hz, 0, 0.03));
  m.pillars.forEach((p, i) => { const w = world(p.x, p.y); shapes.push(RT.shape.box(80 + i, 6, w.x * U, PILLAR.h * U / 2, w.z * U, TILE * PILLAR.w * U / 2, PILLAR.h * U / 2, TILE * PILLAR.w * U / 2, 0, 0.03)); });
  st.crates.forEach((c, i) => { const w = world(c.x, c.y), h = TILE * CRATE * U / 2; shapes.push(RT.shape.box(i, 5, w.x * U, h, w.z * U, h, h, h, 0, 0.02)); });
  const mw = world(st.mover.x, st.mover.y), a = m.camera.yaw * Math.PI / 180;
  shapes.push(...RT.personShapes(70, RT.standPose(mw.x * U, mw.z * U, Math.sin(a), Math.cos(a), 1.75), { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4 }));
  return RT.makeScene({ cam, shapes, mats, light: { ...RT.STUDIO_LIGHT, dir: [-0.45, 1.15, 0.35] }, env: { floorY: 0, floor: floorFn(m), sky: RT.softSky } });
}

const MARK_HUE = [[175, 35]];
async function styleLook(style) {
  const rnd = style.rand;
  const env = await envLook(style, { tag: 'push_box_to_mark', settings: ['park', 'plaza', 'yard', 'lobby', 'hall'], base: { ...RT.STUDIO_LIGHT, dir: [-0.45, 1.15, 0.35] },
    tileSizes: [0.4, 0.5, 0.6, 0.8], L: [0.18, 0.42], named: [...S3.NAMED_HUES, ...MARK_HUE] });
  const bt = pickTex(style, (t) => (t.use === 'floor' || t.use === 'stone' && /slab|tile|monastery|sandstone|surface/.test(t.id) || t.use === 'wood') && !/stone_tiles_02|riverbed|pavement_02|hexagonal|interior_tiles|cobblestone|pattern|brick_moss|painted_concrete/.test(t.id), (t) => t.use === 'floor');
  const pt = pickTex(style, (t) => t.use === 'stone' && /wall|blocks|castle|rock/.test(t.id) || t.use === 'wall' && /brick|block|concrete|sandstone/.test(t.id), (t) => t.use === 'wall');
  const ct = pickTex(style, (t) => t.use === 'stone' || t.use === 'wall' && /concrete|block/.test(t.id), (t) => t.use === 'wall');
  const wood = pickTex(style, (t) => t.use === 'wood');
  const [BT, PT, CT, WT] = await Promise.all([bt, pt, ct, wood].map((t) => S3.loadTexture(t.file)));
  const wr = await wardrobe(style, 1);
  const face = S3.keepNamedHues(faceOf(BT.mean, 0.4 + 0.25 * rnd(), { maxSat: 0.16, warmSat: 0.4 }), [...S3.NAMED_HUES, ...MARK_HUE], 0.08, 0.35);
  const grout = S3.scaleTo(S3.limitSat(face, 0.1), S3.lum(face) * 0.49);
  const tiles = S3.texTileFloor({ tex: BT, tile: TILE * U, face, grout, cv: bt.use === 'wood' ? 0.14 : 0.09, texWorld: bt.use === 'wood' ? 0.6 : 1.0, groutHW: 0.012, groutK: 0.85, salt: 1 + Math.floor(rnd() * 997) });
  const sp = (pool, list) => splitPick(style, `push_box_to_mark|${pool}`, list);
  const crateKind = sp('crate', ['slat', 'plank', 'panel', 'plastic', 'carton']);
  const crateTint = crateKind === 'plastic' ? sp('tote', ['#8a8f96', '#4f6b52', '#3c3f45', '#b5a68a']) : crateKind === 'carton' ? sp('card', ['#b88d5a', '#c49c6a', '#a8875e']) : sp('stain', ['#b88a55', '#c99a62', '#9a7048', '#a8845a', '#7e6a52']);
  const crate = crateKind === 'carton' ? cartonMat(crateTint, sp('tape', ['#d8c39a', '#c9a66a', '#e6e2da'])) : S3.crateMaterial({ kind: crateKind, tint: crateTint, wood: WT, tintK: 0.55 });
  let pL = 0.2 + 0.25 * rnd();
  if (Math.abs(pL - S3.lum(face)) < 0.12) pL = S3.lum(face) - 0.2;
  const pillar = texMat(PT, faceOf(PT.mean, Math.max(0.12, pL), { maxSat: 0.14, warmSat: 0.3 }), { texWorld: 1.2, cv: 0.3, keep: 0.5 });
  const curb = texMat(CT, faceOf(CT.mean, 0.3 + 0.2 * rnd(), { maxSat: 0.12, warmSat: 0.25 }), { texWorld: 1.0, cv: 0.25, keep: 0.4 });
  for (const t of [bt, pt, ct, wood]) style.note(`tex:${t.id}`);
  const W = wr.mats();
  return { key: style.key, env, tiles, mats: W.mats.concat([crate, pillar, curb]), ids: { ...env.ids, board: bt.id, pillar: pt.id, curb: ct.id, crate: crateKind } };
}
function cartonMat(hex, tapeHex) {
  const c = RT.lin(hex), tape = RT.lin(tapeHex), seam = c.map((v) => v * 0.55);
  return { c, ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => {
    const [lu, lv] = RT.boxLocal(s, x, z), ly = y - s.cy;
    let a, b, top = false;
    if (Math.abs(ny) > 0.7) { a = lu / s.hx; b = lv / s.hz; top = true; } else if (Math.abs(nx * s.ca - nz * s.sa) > 0.7) { a = lv / s.hz; b = ly / s.hy; } else { a = lu / s.hx; b = ly / s.hy; }
    const n = 0.92 + 0.12 * RT.fbm(x * 9 + z * 7, y * 9, 2);
    out[0] = c[0] * n; out[1] = c[1] * n; out[2] = c[2] * n;
    if (top ? Math.abs(b) < 0.14 : (Math.abs(a) < 0.14 && b > 0.55)) RT.mixInto(out, out, tape, 0.8);
    if (top && Math.abs(a) < 0.02) RT.mixInto(out, out, seam, 0.8);
  } };
}
function floorStyled(m, look) {
  const tile = TILE * U, half = (G / 2) * tile;
  const MK = RT.lin('#56d2c7'), MK2 = RT.lin('#3fb9ae'), RING = RT.lin('#f4fbfa'), GR = RT.lin('#9c9487');
  const marks = new Set(m.marks.map((k) => key(k.x, k.y))), ground = look.env.floor, tiles = look.tiles;
  return (x, z, fp, out) => {
    const gx = (x + half) / tile, gz = (z + half) / tile;
    if (gx < 0 || gz < 0 || gx >= G || gz >= G) { ground(x, z, fp, out); return; }
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (marks.has(key(ix, iz))) {
      const u = gx - ix - 0.5, v = gz - iz - 0.5, n = RT.fbm(x * 7, z * 7, 3, fp);
      RT.mixInto(out, MK2, MK, 0.5 + 0.4 * n);
      const r = Math.hypot(u, v) * tile, ringW = 0.035;
      const k = Math.max(0, Math.min(1, (ringW - Math.abs(r - 0.2)) / Math.max(fp, 1e-4) + 0.5));
      RT.mixInto(out, out, RING, 0.9 * k);
      const m2 = Math.max(RT.lineMask(gx * tile, tile, 0.012, fp), RT.lineMask(gz * tile, tile, 0.012, fp));
      RT.mixInto(out, out, GR, 0.85 * m2);
      return;
    }
    tiles(x + half, z + half, fp, out);
  };
}
export function traceSceneStyled(m, st, br, look) {
  const sc = traceScene(m, st, br);
  return RT.makeScene({ cam: sc.cam, shapes: sc.shapes, mats: look.mats, light: look.env.light,
    env: { floorY: 0, floor: floorStyled(m, look), sky: look.env.sky } });
}

const task = {
  meta: {
    name: 'push_box_to_mark', family: 'C', uses3d: true,
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'walk', to: '{x,y} free cell to auto-walk to' },
      { op: 'push', crate: 'crate id', dir: 'N|E|S|W (shove one cell)' },
    ],
    promptHuman: 'Push the crates onto the marked tiles',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      for (let attempt = 0; attempt < 16000; attempt++) { const m = tryBuild(rng, knobs.ext); if (m) return m; }
      return JSON.parse(JSON.stringify(FALLBACK));
    }
    for (let attempt = 0; attempt < 16000; attempt++) { const m = tryBuild(rng); if (m) return m; }
    return JSON.parse(JSON.stringify(FALLBACK_EVAL));
  },

  init(m) { return { mover: { ...m.mover }, crates: m.crates.map((c) => ({ ...c })), hist: [] }; },

  _snap(st) {
    st.hist.push({ mover: { ...st.mover }, crates: st.crates.map((c) => ({ ...c })) });
    if (st.hist.length > 60) st.hist.shift();
  },

  applyAction(st, action, m) {
    const op = action && action.op;
    if (op === 'walk') {
      const to = action.to;
      if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y) || !freeM(to.x, to.y, st.crates, m.pillars)) return { ok: false, reason: 'blocked' };
      if (!reach(st.mover, st.crates, m.pillars).has(key(to.x, to.y))) return { ok: false, reason: 'unreach' };
      this._snap(st); st.mover = { x: to.x, y: to.y }; return { ok: true };
    }
    if (op === 'push') {
      const ci = action.crate, d = dirOf(action.dir);
      if (!Number.isInteger(ci) || ci < 0 || ci >= st.crates.length || !d) return { ok: false, reason: 'bad-push' };
      const c = st.crates[ci];
      const fx = c.x - d.dx, fy = c.y - d.dy, gx = c.x + d.dx, gy = c.y + d.dy;
      if (!freeM(gx, gy, st.crates, m.pillars)) return { ok: false, reason: 'far-blocked' };
      if (!freeM(fx, fy, st.crates, m.pillars)) return { ok: false, reason: 'from-blocked' };
      if (!reach(st.mover, st.crates, m.pillars).has(key(fx, fy))) return { ok: false, reason: 'cant-reach' };
      this._snap(st);
      st.crates = st.crates.map((cc, j) => (j === ci ? { x: gx, y: gy } : { ...cc }));
      st.mover = { x: c.x, y: c.y };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(st, m) {
    const ms = new Set(m.marks.map((k) => key(k.x, k.y)));
    const on = st.crates.filter((c) => ms.has(key(c.x, c.y))).length, n = m.marks.length;
    return { success: on === n, error: n - on, partial: on / n, detail: { on, of: n } };
  },

  oracle(m) {
    const sol = solvePushes(m);
    return sol.len === Infinity ? [] : sol.path.map((p) => ({ op: 'push', crate: p.i, dir: p.dir }));
  },

  randomPolicy(m, rnd) {
    const n = 2 + Math.floor(rnd() * 7);
    return Array.from({ length: n }, () => ({ op: 'push', crate: Math.floor(rnd() * m.crates.length), dir: DIRS[Math.floor(rnd() * 4)].n }));
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const one = env.manifest.crates.length === 1;
    drawPromptText(g, r, one ? 'Push the crate onto the marked tile' : 'Push the crates onto the marked tiles',
      'Tap a crate next to you to push it');
  },

  firstFrameBackground: { checkpoint: 'board', description: 'Only the linear panel gradient is background. Floor tiles, glowing tiles, all solids, their shadows and controls are task content.' },

  featureGeometry(m) {
    const camera = displayCamera(m), regions = [], features = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const region = cellHitRegion(camera, x, y); regions.push({ x, y, ...region });
      if (!m.pillars.some((p) => p.x === x && p.y === y)) features.push({ id: `cell-${x}-${y}`, kind: 'target', effectiveWidthPx: region.effectiveWidthPx, effectiveHeightPx: region.effectiveHeightPx });
    }
    const cues = pushCues(m, buildScene(m, null, cueContext()), world);
    return { featureRequirements: ['target', 'discriminator'], features: features.concat(cues.features),
      geometry: { regions, initialCues: cues },
      coverage: { complete: cues.complete, scope: 'All walk/push tile regions for every state (nearest projected centre within 24 px, all 25 centres competing; pillars excluded as non-actions), and the initial visibility of every pillar, crate, the mover and every glowing tile. ' + cues.scope },
      limitation: 'Tile hit regions are exact nearest-circle extents; a crate click is also accepted anywhere on its projected silhouette. Visibility disks are lower bounds, not human planning or robot-hardness measurements.' };
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
    const C = (this._cache ??= { m: null, imgs: new Map() }), q = Math.min(2, RT.contextScale(g));
    const look = env.style ? env.assets?.look : null;
    if (C.m !== m) { C.m = m; C.imgs = new Map(); }
    const key = `${q}|${st.mover.x},${st.mover.y}|${st.crates.map((c) => `${c.x},${c.y}`).join(';')}` + (look ? `|${look.key}` : '');
    let canvas = C.imgs.get(key);
    if (!canvas) {
      canvas = RT.toCanvas(RT.render(look ? traceSceneStyled(m, st, br, look) : traceScene(m, st, br), q));
      if (C.imgs.size > 24) C.imgs.delete(C.imgs.keys().next().value);
      C.imgs.set(key, canvas);
    }
    g.drawImage(canvas, 0, 0, br.w, br.h);
    g.__firstFrameBackground?.('board');
    g.restore();
  },

  _cellAt(x, y, cam) {
    let best = null, bd = HIT_R;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const p = cam.project(world(gx, gy, 4)), d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = { x: gx, y: gy }; }
    }
    return best;
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest, st = env.state;
    const cam = displayCamera(m);
    const order = st.crates.map((c, i) => ({ c, i, depth: cam.project(world(c.x, c.y, 8)).depth })).sort((a, b) => a.depth - b.depth);
    let cell = null;
    for (const { c } of order) if (inHull(crateHull(cam, c), evt.x, evt.y)) { cell = { x: c.x, y: c.y }; break; }
    if (!cell) cell = this._cellAt(evt.x, evt.y, cam);
    if (!cell) return [];
    const ci = st.crates.findIndex((c) => cellEq(c, cell));
    if (ci >= 0) {
      const dx = cell.x - st.mover.x, dy = cell.y - st.mover.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) return [{ op: 'push', crate: ci, dir: DIRS.find((D) => D.dx === dx && D.dy === dy).n }];
      return [];
    }
    return [{ op: 'walk', to: cell }];
  },

  footerStatus(env) {
    const n = env.state.hist.length;
    return n ? `${n} move${n === 1 ? '' : 's'}` : 'Tap a tile to walk there';
  },
};

const originalGenerate = task.generate;
task.generate = validatedGenerator(originalGenerate, (m) => [{ id: 'initial-grid', geometry: buildScene(m).geometry }]);
export default task;

export function semanticKey(m) {
  const n = G, maps = [(x, y) => [x, y], (x, y) => [n - 1 - x, y], (x, y) => [x, n - 1 - y], (x, y) => [n - 1 - x, n - 1 - y],
    (x, y) => [y, x], (x, y) => [n - 1 - y, x], (x, y) => [y, n - 1 - x], (x, y) => [n - 1 - y, n - 1 - x]];
  const keys = maps.map((f) => ['pillars', 'crates', 'marks'].map((k) => k[0] + m[k].map((c) => f(c.x, c.y).join(',')).sort().join(';')).join('|')
    + `|u${f(m.mover.x, m.mover.y).join(',')}`).sort();
  return `push_box_to_mark|${keys[0]}`;
}
