import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { hashStr } from '../core/rng.js';
import { nthOf } from '../core/style.js';
import { buildCorridorLook, wallPx, floorPx, ceilPx } from '../common/_corridor_walk_mark_pose_look.js';

const GW = 7, GH = 7;
const BOARD = { w: 340, h: 410 };
const VIEW_H = 204;
const FOV = 72 * Math.PI / 180;
const PLANE = Math.tan(FOV / 2);
const EYE = 0.95, WALL_H = 1.55;
const HORIZON = 0.42;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MIN_FLOORS = 18, EXT_MIN_FLOORS = 8;
const MIN_FACES = 34, EXT_MIN_FACES = 16;
const ORACLE_MAX = 30, EXT_ORACLE_MAX = 12;
const PATH_LEN = [11, 16], LEGS = [4, 6], ROOMS = [5, 7];
const LONG_PATH = Object.freeze({ turns: 3, steps: [12, 16] });
const DOOR_U = [0.27, 0.73];
const MAP = { x: 16, y: 216, S: 180 };
const BTN = { x: 218, y: 232, w: 112, h: 46, gap: 8 };
const MAP_SWAP_X = BOARD.w - 16 - MAP.S, BTN_SWAP_X = 12;
const gridW = (m) => (m && m.grid && m.grid.w) || GW;
const hidesMap = (m) => !!m && !m.ext;
const mapShown = (m, st) => !hidesMap(m) || !st.walked || !!st.mapOpen;
const OPEN_BTN = { dx: 22, dy: 102, w: 136, h: 40 };
const swapped = (env) => !!(env && env.style && env.assets && env.assets.look && env.assets.look.swapPanels);

const inGrid = (c, r, gw = GW, gh = GH) => c >= 0 && c < gw && r >= 0 && r < gh;
const cellEq = (a, b) => a[0] === b[0] && a[1] === b[1];
const key = (c, r) => `${c},${r}`;
function dirBetween(a, b) {
  const dc = b[0] - a[0], dr = b[1] - a[1];
  if (dc > 0) return 1; if (dc < 0) return 3; if (dr > 0) return 2; return 0;
}
const FSETS = new WeakMap();
function floorSet(m) {
  let s = FSETS.get(m.floors);
  if (!s) { s = new Set(m.floors.map((f) => key(f[0], f[1]))); FSETS.set(m.floors, s); }
  return s;
}
const isFloor = (m, c, r) => floorSet(m).has(key(c, r));
function wallFaces(m) {
  const out = [];
  for (const [c, r] of m.floors) for (let d = 0; d < 4; d++) {
    if (!isFloor(m, c + DIRS[d][0], r + DIRS[d][1])) out.push({ col: c, row: r, dir: d });
  }
  return out;
}

function fwd(cell, heading, m) {
  const d = DIRS[heading], nc = cell[0] + d[0], nr = cell[1] + d[1];
  if (!isFloor(m, nc, nr)) return { cell, moved: false };
  return { cell: [nc, nr], moved: true };
}

const BACK_OFF = 0.38;
function poseOf(cell, heading) {
  return { x: cell[0] + 0.5 - DIRS[heading][0] * BACK_OFF, z: cell[1] + 0.5 - DIRS[heading][1] * BACK_OFF, ang: heading * Math.PI / 2 };
}
function castColumn(m, pose, camX) {
  const dX = Math.sin(pose.ang), dZ = -Math.cos(pose.ang);
  const pX = -dZ * PLANE, pZ = dX * PLANE;
  const rx = dX + pX * camX, rz = dZ + pZ * camX;
  let mx = Math.floor(pose.x), mz = Math.floor(pose.z);
  const ddx = Math.abs(1 / (rx || 1e-12)), ddz = Math.abs(1 / (rz || 1e-12));
  const sx = rx < 0 ? -1 : 1, sz = rz < 0 ? -1 : 1;
  let sdx = rx < 0 ? (pose.x - mx) * ddx : (mx + 1 - pose.x) * ddx;
  let sdz = rz < 0 ? (pose.z - mz) * ddz : (mz + 1 - pose.z) * ddz;
  let side = 0;
  for (let i = 0; i < 64; i++) {
    if (sdx < sdz) { sdx += ddx; mx += sx; side = 0; } else { sdz += ddz; mz += sz; side = 1; }
    if (!isFloor(m, mx, mz)) break;
  }
  const dist = side === 0 ? sdx - ddx : sdz - ddz;
  let c, r, d, u;
  if (side === 0) {
    c = mx - sx; r = mz; d = sx > 0 ? 1 : 3;
    const zh = pose.z + dist * rz, f = zh - Math.floor(zh);
    u = d === 1 ? f : 1 - f;
  } else {
    c = mx; r = mz - sz; d = sz > 0 ? 2 : 0;
    const xh = pose.x + dist * rx, f = xh - Math.floor(xh);
    u = d === 0 ? f : 1 - f;
  }
  return { c, r, d, u, dist, rx, rz };
}
function doorColumns(m, pose, cols = BOARD.w) {
  let n = 0;
  for (let i = 0; i < cols; i++) {
    const h = castColumn(m, pose, (2 * (i + 0.5)) / cols - 1);
    if (h.c === m.door.col && h.r === m.door.row && h.d === m.door.dir && h.u > DOOR_U[0] && h.u < DOOR_U[1]) n++;
  }
  return n;
}

function planMoves(m) {
  const p = m.path;
  const end = p.findIndex((q) => q[0] === m.door.col && q[1] === m.door.row);
  let cell = p[0].slice(), heading = m.start.heading;
  const acts = [];
  const turnTo = (want) => {
    const d = (want - heading + 4) % 4;
    if (d === 1) acts.push('R'); else if (d === 3) acts.push('L'); else if (d === 2) acts.push('R', 'R');
    heading = want;
  };
  for (let i = 1; i <= end; i++) {
    turnTo(dirBetween(cell, p[i]));
    const r = fwd(cell, heading, m);
    acts.push('F'); cell = r.cell;
  }
  turnTo(m.door.dir);
  return { acts, endCell: cell, endHeading: heading, end };
}

function turnIndex(path, k) {
  let n = 0;
  for (let i = 1; i < path.length - 1; i++) if (dirBetween(path[i - 1], path[i]) !== dirBetween(path[i], path[i + 1]) && ++n === k) return i;
  return -1;
}
function contractOk(m, gw = GW, gh = GH) {
  if (!m || m.task !== 'corridor_walk_mark_pose') return false;
  const hard = !m.ext;
  if (hard && (!m.grid || m.grid.w !== GW || m.grid.h !== GH || gw !== GW || gh !== GH)) return false;
  if (!Array.isArray(m.path) || m.path.length < 4) return false;
  if (!Array.isArray(m.floors) || m.floors.length < (hard ? MIN_FLOORS : EXT_MIN_FLOORS)) return false;
  if (!m.start || !m.door || !Array.isArray(m.pictures)) return false;
  const fset = new Set();
  for (const [c, r] of m.floors) { if (!inGrid(c, r, gw, gh) || fset.has(key(c, r))) return false; fset.add(key(c, r)); }
  const idx = new Map();
  for (let i = 0; i < m.path.length; i++) {
    const [c, r] = m.path[i];
    if (!fset.has(key(c, r)) || idx.has(key(c, r))) return false;
    idx.set(key(c, r), i);
    if (i > 0) { const [pc, pr] = m.path[i - 1]; if (Math.abs(pc - c) + Math.abs(pr - r) !== 1) return false; }
  }
  for (let i = 0; i < m.path.length; i++) for (const [dc, dr] of DIRS) {
    const j = idx.get(key(m.path[i][0] + dc, m.path[i][1] + dr));
    if (j !== undefined && Math.abs(j - i) !== 1) return false;
  }
  for (const [c, r] of m.floors) {
    if (idx.has(key(c, r))) continue;
    let nb = 0;
    for (const [dc, dr] of DIRS) if (fset.has(key(c + dc, r + dr))) nb++;
    if (nb !== 1) return false;
  }
  if (!cellEq(m.path[0], [m.start.col, m.start.row])) return false;
  if (m.start.heading !== dirBetween(m.path[0], m.path[1])) return false;
  const { col, row, dir } = m.door;
  if (!Number.isInteger(dir) || dir < 0 || dir > 3) return false;
  const di = idx.get(key(col, row));
  if (di === undefined || di < 1) return false;
  if (fset.has(key(col + DIRS[dir][0], row + DIRS[dir][1]))) return false;
  const faces = wallFaces(m);
  if (faces.filter((f) => f.col === col && f.row === row && f.dir === dir).length !== 1) return false;
  if (faces.length < (hard ? MIN_FACES : EXT_MIN_FACES)) return false;
  if (doorColumns(m, poseOf(m.path[0], m.start.heading)) !== 0) return false;
  if (hard) {
    const t2 = turnIndex(m.path, 2);
    if (t2 < 0 || di <= t2) return false;
    for (let i = 0; i < t2; i++) for (let h = 0; h < 4; h++) if (doorColumns(m, poseOf(m.path[i], h)) !== 0) return false;
    const t3 = turnIndex(m.path, LONG_PATH.turns), t4 = turnIndex(m.path, LONG_PATH.turns + 1);
    if (t3 < 0 || di <= t3 || (t4 >= 0 && di > t4)) return false;
    for (let i = t2; i < t3; i++) for (let h = 0; h < 4; h++) if (doorColumns(m, poseOf(m.path[i], h)) !== 0) return false;
    if (fset.has(key(col + DIRS[(dir + 2) % 4][0], row + DIRS[(dir + 2) % 4][1]))) return false;
    const ds = localShape(fset, col, row, dir);
    if (!faces0(m).some((f) => !(f.col === col && f.row === row) && localShape(fset, f.col, f.row, f.dir) === ds)) return false;
  }
  if (doorColumns(m, poseOf([col, row], dir)) < BOARD.w * 0.3) return false;
  let seenOnWay = false;
  for (let i = 1; i <= di && !seenOnWay; i++) {
    const h = dirBetween(m.path[i - 1], m.path[i]);
    if (doorColumns(m, poseOf(m.path[i - 1], h)) >= 8) seenOnWay = true;
    if (doorColumns(m, poseOf(m.path[i], h)) >= 8) seenOnWay = true;
  }
  if (!seenOnWay) return false;
  for (const p of m.pictures) {
    if (!faces.some((f) => f.col === p.col && f.row === p.row && f.dir === p.dir)) return false;
    if (p.col === col && p.row === row && p.dir === dir) return false;
  }
  const sim = planMoves(m);
  if (!cellEq(sim.endCell, [col, row]) || sim.endHeading !== dir) return false;
  if (sim.acts.length + 1 > (hard ? ORACLE_MAX : EXT_ORACLE_MAX)) return false;
  if (hard && (sim.acts.length + 1 < LONG_PATH.steps[0] || sim.acts.length + 1 > LONG_PATH.steps[1])) return false;
  return true;
}
function localShape(fset, c, r, d) {
  const f = DIRS[d], rt = DIRS[(d + 1) % 4];
  let s = '';
  for (let a = -1; a <= 1; a++) for (let l = -1; l <= 1; l++) s += fset.has(key(c + f[0] * a + rt[0] * l, r + f[1] * a + rt[1] * l)) ? '1' : '0';
  return s;
}
const faces0 = (m) => wallFaces(m);

export function gate(m) { return m && m.ext ? extContractOk(m) : contractOk(m); }

function tryBuild(rng) {
  const edges = [];
  for (let c = 1; c < GW - 1; c++) { edges.push([c, 0, 2]); edges.push([c, GH - 1, 0]); }
  for (let r = 1; r < GH - 1; r++) { edges.push([0, r, 1]); edges.push([GW - 1, r, 3]); }
  const [sc, sr, h0] = rng.pick(edges);
  let dir = h0, cell = [sc, sr];
  const path = [cell.slice()];
  const occ = new Map([[key(sc, sr), 0]]);
  const legs = rng.int(LEGS[0], LEGS[1]);
  for (let leg = 0; leg < legs; leg++) {
    if (leg > 0) dir = (dir + (rng.raw() < 0.5 ? 1 : 3)) % 4;
    const len = leg === 0 ? rng.int(1, 2) : rng.int(1, 4);
    for (let s = 0; s < len; s++) {
      const nc = [cell[0] + DIRS[dir][0], cell[1] + DIRS[dir][1]];
      if (!inGrid(nc[0], nc[1]) || occ.has(key(nc[0], nc[1]))) return null;
      for (const [dc, dr] of DIRS) {
        const j = occ.get(key(nc[0] + dc, nc[1] + dr));
        if (j !== undefined && j !== path.length - 1) return null;
      }
      cell = nc; occ.set(key(cell[0], cell[1]), path.length); path.push(cell.slice());
    }
  }
  if (path.length < PATH_LEN[0] || path.length > PATH_LEN[1]) return null;
  const floors = path.map((p) => p.slice());
  const fset = new Set(floors.map((p) => key(p[0], p[1])));
  const want = path.length + rng.int(ROOMS[0], ROOMS[1]);
  for (const a of rng.shuffle(path.slice(1))) {
    if (floors.length >= want) break;
    for (const dd of rng.shuffle([0, 1, 2, 3])) {
      const s = [a[0] + DIRS[dd][0], a[1] + DIRS[dd][1]];
      if (!inGrid(s[0], s[1]) || fset.has(key(s[0], s[1]))) continue;
      let nb = 0;
      for (const [dc, dr] of DIRS) if (fset.has(key(s[0] + dc, s[1] + dr))) nb++;
      if (nb !== 1) continue;
      floors.push(s); fset.add(key(s[0], s[1])); break;
    }
  }
  if (floors.length < MIN_FLOORS) return null;
  const base = { task: 'corridor_walk_mark_pose', board: BOARD, grid: { w: GW, h: GH },
    start: { col: sc, row: sr, heading: h0 }, path, floors, pictures: [] };
  const cands = [];
  for (const f of wallFaces(base)) {
    if (f.col === sc && f.row === sr) continue;
    const m = { ...base, door: f };
    if (contractOk(m)) cands.push(f);
  }
  if (!cands.length) return null;
  const door = rng.pick(cands);
  const others = rng.shuffle(wallFaces(base).filter((f) => !(f.col === door.col && f.row === door.row)));
  const pictures = others.slice(0, rng.int(3, 4)).map((f) => ({ ...f, style: rng.int(0, 3) }));
  const m = { ...base, door, pictures,
    gtContract: 'the one wall segment (floor cell + side) that carries the red door' };
  return contractOk(m) ? m : null;
}

const FALLBACK = {
  task: 'corridor_walk_mark_pose', board: BOARD, grid: { w: GW, h: GH },
  start: { col: 2, row: 4, heading: 0 },
  path: [[2, 4], [2, 3], [3, 3], [4, 3], [4, 2], [4, 1], [3, 1]],
  floors: [[2, 4], [2, 3], [3, 3], [4, 3], [4, 2], [4, 1], [3, 1], [1, 3], [3, 0]],
  pictures: [{ col: 4, row: 3, dir: 2, style: 1 }, { col: 3, row: 1, dir: 2, style: 2 }],
  door: { col: 4, row: 2, dir: 3 },
  gtContract: 'the one wall segment (floor cell + side) that carries the red door',
};

const EXT_GRIDS = [5];
const SLOTS = { train: 150, test: 24 };
const EVAL_SIGS = new Set([1249677732, 3689628499, 1214967854, 567674526, 2800143504, 3263376676, 3983014394, 3847086329, 1958885459, 104744513, 2749757755, 1944298528]);
function d4(N) {
  return [(c, r) => [c, r], (c, r) => [N - 1 - r, c], (c, r) => [N - 1 - c, N - 1 - r], (c, r) => [r, N - 1 - c],
    (c, r) => [N - 1 - c, r], (c, r) => [r, c], (c, r) => [c, N - 1 - r], (c, r) => [N - 1 - r, N - 1 - c]];
}
export function layoutSig(m) {
  const N = m.grid && m.grid.w ? m.grid.w : GW;
  let best = null;
  for (const T of d4(N)) {
    const tdir = (c, r, d) => { const a = T(c, r), b = T(c + DIRS[d][0], r + DIRS[d][1]); return dirBetween(a, b); };
    const F = m.floors.map(([c, r]) => T(c, r));
    const c0 = Math.min(...F.map((f) => f[0])), r0 = Math.min(...F.map((f) => f[1]));
    const fl = F.map(([c, r]) => `${c - c0},${r - r0}`).sort().join(';');
    const st = T(m.start.col, m.start.row), dr = T(m.door.col, m.door.row);
    const sig = `${fl}|s${st[0] - c0},${st[1] - r0},${tdir(m.start.col, m.start.row, m.start.heading)}|d${dr[0] - c0},${dr[1] - r0},${tdir(m.door.col, m.door.row, m.door.dir)}`;
    if (best === null || sig < best) best = sig;
  }
  return best;
}
const sigHash = (sig) => hashStr(`corridor_walk_mark_pose|layout|${sig}`);
const sigSplit = (sig) => (sigHash(sig) % 10 === 0 ? 'test' : 'train');
const sigSlot = (sig, split) => Math.floor(sigHash(sig) / 10) % SLOTS[split];
export function semanticKey(m) { return layoutSig(m); }
function extContractOk(m) {
  if (m.ext !== 'train' && m.ext !== 'test') return false;
  if (!m.grid || m.grid.w !== m.grid.h || !EXT_GRIDS.includes(m.grid.w)) return false;
  if (!Array.isArray(m.pictures) || m.pictures.length < 2 || m.pictures.length > 3) return false;
  if (!contractOk(m, m.grid.w, m.grid.h)) return false;
  const sig = layoutSig(m);
  return sigSplit(sig) === m.ext && !EVAL_SIGS.has(hashStr(sig));
}
function tryBuildExt(rng, N, split, slot) {
  const edges = [];
  for (let c = 1; c < N - 1; c++) { edges.push([c, 0, 2]); edges.push([c, N - 1, 0]); }
  for (let r = 1; r < N - 1; r++) { edges.push([0, r, 1]); edges.push([N - 1, r, 3]); }
  const [sc, sr, h0] = rng.pick(edges);
  let dir = h0, cell = [sc, sr];
  const path = [cell.slice()];
  const occ = new Map([[key(sc, sr), 0]]);
  const legs = rng.int(3, 4);
  for (let leg = 0; leg < legs; leg++) {
    if (leg > 0) dir = (dir + (rng.raw() < 0.5 ? 1 : 3)) % 4;
    const len = leg === 0 ? rng.int(1, 2) : rng.int(1, 3);
    for (let s = 0; s < len; s++) {
      const nc = [cell[0] + DIRS[dir][0], cell[1] + DIRS[dir][1]];
      if (!inGrid(nc[0], nc[1], N, N) || occ.has(key(nc[0], nc[1]))) return null;
      for (const [dc, dr] of DIRS) {
        const j = occ.get(key(nc[0] + dc, nc[1] + dr));
        if (j !== undefined && j !== path.length - 1) return null;
      }
      cell = nc; occ.set(key(cell[0], cell[1]), path.length); path.push(cell.slice());
    }
  }
  if (path.length < 6 || path.length > 9) return null;
  const floors = path.map((p) => p.slice());
  const fset = new Set(floors.map((p) => key(p[0], p[1])));
  const want = path.length + rng.int(2, 3);
  for (const a of rng.shuffle(path.slice(1))) {
    if (floors.length >= want) break;
    for (const dd of rng.shuffle([0, 1, 2, 3])) {
      const s = [a[0] + DIRS[dd][0], a[1] + DIRS[dd][1]];
      if (!inGrid(s[0], s[1], N, N) || fset.has(key(s[0], s[1]))) continue;
      let nb = 0;
      for (const [dc, dr] of DIRS) if (fset.has(key(s[0] + dc, s[1] + dr))) nb++;
      if (nb !== 1) continue;
      floors.push(s); fset.add(key(s[0], s[1])); break;
    }
  }
  if (floors.length < EXT_MIN_FLOORS) return null;
  const base = { task: 'corridor_walk_mark_pose', board: BOARD, grid: { w: N, h: N }, ext: split,
    start: { col: sc, row: sr, heading: h0 }, path, floors, pictures: [] };
  const cands = [];
  for (const f of wallFaces(base)) {
    if (f.col === sc && f.row === sr) continue;
    if (contractOk({ ...base, door: f }, N, N)) cands.push(f);
  }
  const ok = cands.filter((f) => { const sig = layoutSig({ ...base, door: f }); return sigSplit(sig) === split && !EVAL_SIGS.has(hashStr(sig)) && (slot === null || sigSlot(sig, split) === slot); });
  if (!ok.length) return null;
  const door = rng.pick(ok);
  const others = rng.shuffle(wallFaces(base).filter((f) => !(f.col === door.col && f.row === door.row)));
  const pictures = others.slice(0, rng.int(2, 3)).map((f) => ({ ...f, style: rng.int(0, 3) }));
  const m = { ...base, door, pictures,
    gtContract: 'the one wall segment (floor cell + side) that carries the red door' };
  return extContractOk(m) ? m : null;
}
function generateExt(rng, split, n) {
  const slot = Number.isFinite(Number(n)) && n !== undefined ? nthOf(`corridor_walk_mark_pose|${split}|layout`, Number(n), SLOTS[split]) : null;
  for (let a = 0; a < 200000; a++) {
    const m = tryBuildExt(rng, rng.pick(EXT_GRIDS), split, slot);
    if (m) return m;
  }
  throw new Error('corridor_walk_mark_pose: ext sampler exhausted');
}

const lerp = (a, b, t) => a + (b - a) * t;
function hash2(a, b) { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const PIC_STYLES = [
  { sky: [126, 170, 208], hill: [92, 138, 84], sun: [244, 214, 120] },
  { sky: [236, 176, 132], hill: [120, 96, 140], sun: [250, 236, 190] },
  { sky: [170, 200, 214], hill: [64, 112, 120], sun: [255, 255, 240] },
  { sky: [214, 200, 160], hill: [150, 110, 70], sun: [240, 120, 80] },
];
function wallColor(u, v, face, m, out) {
  const door = m.door;
  const isDoor = face.c === door.col && face.r === door.row && face.d === door.dir;
  if (isDoor && u > DOOR_U[0] - 0.035 && u < DOOR_U[1] + 0.035 && v < 1.26) {
    if (u < DOOR_U[0] || u > DOOR_U[1] || v > 1.22) { out[0] = 240; out[1] = 238; out[2] = 232; return; }
    let r = 176, g = 52, b = 42;
    const pu = (u - DOOR_U[0]) / (DOOR_U[1] - DOOR_U[0]), pv = v / 1.22;
    const inPanel = (pu > 0.16 && pu < 0.84) && ((pv > 0.1 && pv < 0.46) || (pv > 0.56 && pv < 0.9));
    const edge = (pu > 0.14 && pu < 0.86) && ((pv > 0.085 && pv < 0.475) || (pv > 0.545 && pv < 0.915)) && !inPanel;
    if (edge) { r = 128; g = 34; b = 28; } else if (inPanel) { r = 160; g = 44; b = 36; }
    const kx = (pu - 0.86) / 0.035, ky = (pv - 0.47) / 0.025;
    if (kx * kx + ky * ky < 1) { r = 222; g = 182; b = 84; }
    out[0] = r; out[1] = g; out[2] = b; return;
  }
  for (const p of m.pictures) {
    if (p.col !== face.c || p.row !== face.r || p.dir !== face.d) continue;
    if (u > 0.31 && u < 0.69 && v > 0.84 && v < 1.26) {
      if (u < 0.335 || u > 0.665 || v < 0.865 || v > 1.235) { out[0] = 92; out[1] = 62; out[2] = 40; return; }
      const S = PIC_STYLES[p.style % PIC_STYLES.length];
      const pu = (u - 0.335) / 0.33, pv = (v - 0.865) / 0.37;
      const hill = 0.42 + 0.12 * Math.sin(pu * 7 + p.style) + 0.06 * Math.sin(pu * 17);
      const sx = pu - 0.7, sy = pv - 0.74;
      if (sx * sx + sy * sy < 0.012) { out[0] = S.sun[0]; out[1] = S.sun[1]; out[2] = S.sun[2]; return; }
      const c = pv < hill ? S.hill : S.sky, k = pv < hill ? 0.8 + 0.4 * pv : 0.85 + 0.25 * pv;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return;
    }
  }
  if (v < 0.085) { const t = v > 0.075 ? 0.86 : 1; out[0] = 238 * t; out[1] = 235 * t; out[2] = 228 * t; return; }
  if (v < 0.6) {
    const groove = (u * 6) % 1 < 0.035 ? 0.88 : 1;
    out[0] = 150 * groove; out[1] = 166 * groove; out[2] = 150 * groove; return;
  }
  if (v < 0.65) { const t = v < 0.61 || v > 0.64 ? 0.9 : 1; out[0] = 236 * t; out[1] = 233 * t; out[2] = 224 * t; return; }
  if (v > WALL_H - 0.05) { out[0] = 244; out[1] = 242; out[2] = 236; return; }
  const n = (hash2((u * 90) | 0, (v * 90) | 0) - 0.5) * 6;
  out[0] = 236 + n; out[1] = 226 + n; out[2] = 206 + n;
}
function floorColor(x, z, out) {
  const plank = Math.floor(x * 6), run = z * 0.9 + hash2(plank, 7) * 3, piece = Math.floor(run);
  const tone = 0.9 + 0.16 * hash2(plank, piece);
  const fx = x * 6 - plank;
  const grain = 0.97 + 0.03 * Math.sin(z * 70 + 3 * Math.sin(x * 50 + plank * 1.7));
  const seam = fx < 0.04 || run - piece < 0.012 ? 0.72 : 1;
  const k = tone * grain * seam;
  out[0] = 188 * k; out[1] = 140 * k; out[2] = 96 * k;
}
function ceilColor(x, z, out) {
  const fx = x - Math.floor(x) - 0.5, fz = z - Math.floor(z) - 0.5, d2 = fx * fx + fz * fz;
  if (d2 < 0.011) { out[0] = 255; out[1] = 252; out[2] = 236; return; }
  const glow = Math.exp(-d2 / 0.05) * 18;
  out[0] = 226 + glow; out[1] = 224 + glow; out[2] = 218 + glow;
}
function floorLight(m, x, z) {
  const c = Math.floor(x), r = Math.floor(z), fx = x - c, fz = z - r;
  const dx = fx - 0.5, dz = fz - 0.5;
  let L = 0.78 + 0.32 * Math.exp(-(dx * dx + dz * dz) / 0.09);
  const ao = (t) => 1 - 0.28 * Math.exp(-t / 0.05);
  if (!isFloor(m, c, r - 1)) L *= ao(fz);
  if (!isFloor(m, c, r + 1)) L *= ao(1 - fz);
  if (!isFloor(m, c - 1, r)) L *= ao(fx);
  if (!isFloor(m, c + 1, r)) L *= ao(1 - fx);
  return L;
}

const _viewCache = { key: '', canvas: null };
function renderView(m, pose, scale) {
  const W = Math.round(BOARD.w * scale), H = Math.round(VIEW_H * scale);
  const k = `${JSON.stringify(m.path)}|${JSON.stringify(m.door)}|${pose.x.toFixed(3)},${pose.z.toFixed(3)},${pose.ang.toFixed(4)}|${W}`;
  if (_viewCache.key === k) return _viewCache.canvas;
  let cv = null;
  if (typeof document !== 'undefined' && document.createElement) cv = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(W, H);
  if (!cv) return null;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx || !ctx.createImageData) return null;
  const img = ctx.createImageData(W, H), px = img.data;
  const pd = (W / 2) / PLANE, y0 = H * HORIZON;
  const col = [0, 0, 0];
  const put = (i, L) => { px[i] = Math.min(255, col[0] * L); px[i + 1] = Math.min(255, col[1] * L); px[i + 2] = Math.min(255, col[2] * L); px[i + 3] = 255; };
  const shadeOf = (d) => 1 / (1 + 0.035 * d * d);
  for (let x = 0; x < W; x++) {
    const camX = (2 * (x + 0.5)) / W - 1;
    const h = castColumn(m, pose, camX);
    const dist = Math.max(1e-3, h.dist);
    const top = y0 - (WALL_H - EYE) * pd / dist, bot = y0 + EYE * pd / dist;
    const sideL = (h.d === 1 || h.d === 3) ? 0.84 : 1;
    const lc = [h.c + DIRS[(h.d + 3) % 4][0], h.r + DIRS[(h.d + 3) % 4][1]];
    const rc = [h.c + DIRS[(h.d + 1) % 4][0], h.r + DIRS[(h.d + 1) % 4][1]];
    let corner = 1;
    if (!isFloor(m, lc[0], lc[1])) corner *= 1 - 0.22 * Math.exp(-h.u / 0.06);
    if (!isFloor(m, rc[0], rc[1])) corner *= 1 - 0.22 * Math.exp(-(1 - h.u) / 0.06);
    const face = { c: h.c, r: h.r, d: h.d };
    const wallL = sideL * corner * shadeOf(dist);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4, yc = y + 0.5;
      if (yc >= top && yc < bot) {
        const v = EYE + (y0 - yc) * dist / pd;
        wallColor(h.u, v, face, m, col);
        const vl = 0.9 + 0.1 * Math.min(1, v / WALL_H);
        const floorAO = 1 - 0.25 * Math.exp(-v / 0.06);
        put(i, wallL * vl * floorAO);
      } else if (yc >= bot) {
        const rd = EYE * pd / (yc - y0);
        const wx = pose.x + rd * h.rx, wz = pose.z + rd * h.rz;
        floorColor(wx, wz, col);
        put(i, floorLight(m, wx, wz) * shadeOf(rd));
      } else {
        const rd = (WALL_H - EYE) * pd / (y0 - yc);
        const wx = pose.x + rd * h.rx, wz = pose.z + rd * h.rz;
        ceilColor(wx, wz, col);
        put(i, shadeOf(rd) * 0.97);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  _viewCache.key = k; _viewCache.canvas = cv;
  return cv;
}

const _styledCache = { key: '', canvas: null };
function renderViewStyled(m, pose, scale, look) {
  const W = Math.round(BOARD.w * scale), H = Math.round(VIEW_H * scale);
  const k = `${look.key}|${JSON.stringify(m.path)}|${JSON.stringify(m.door)}|${pose.x.toFixed(3)},${pose.z.toFixed(3)},${pose.ang.toFixed(4)}|${W}`;
  if (_styledCache.key === k) return _styledCache.canvas;
  let cv = null;
  if (typeof document !== 'undefined' && document.createElement) cv = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(W, H);
  if (!cv) return null;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx || !ctx.createImageData) return null;
  const img = ctx.createImageData(W, H), px = img.data;
  const pd = (W / 2) / PLANE, y0 = H * HORIZON, A = look.amb;
  const col = [0, 0, 0];
  const put = (i, L) => { px[i] = Math.min(255, col[0] * L * A[0]); px[i + 1] = Math.min(255, col[1] * L * A[1]); px[i + 2] = Math.min(255, col[2] * L * A[2]); px[i + 3] = 255; };
  const shadeOf = (d) => 1 / (1 + 0.035 * d * d);
  const isF = (c, r) => isFloor(m, c, r);
  const ao = (t) => 1 - look.wallAO * Math.exp(-t / 0.05);
  const floorL = (x, z) => {
    const c = Math.floor(x), r = Math.floor(z), fx = x - c, fz = z - r, dx = fx - 0.5, dz = fz - 0.5;
    let L = look.poolBase + look.pool * Math.exp(-(dx * dx + dz * dz) / 0.09);
    if (!isF(c, r - 1)) L *= ao(fz);
    if (!isF(c, r + 1)) L *= ao(1 - fz);
    if (!isF(c - 1, r)) L *= ao(fx);
    if (!isF(c + 1, r)) L *= ao(1 - fx);
    return L;
  };
  for (let x = 0; x < W; x++) {
    const camX = (2 * (x + 0.5)) / W - 1;
    const h = castColumn(m, pose, camX);
    const dist = Math.max(1e-3, h.dist);
    const top = y0 - (WALL_H - EYE) * pd / dist, bot = y0 + EYE * pd / dist;
    const sideL = (h.d === 1 || h.d === 3) ? 0.84 : 1;
    const lc = [h.c + DIRS[(h.d + 3) % 4][0], h.r + DIRS[(h.d + 3) % 4][1]];
    const rc = [h.c + DIRS[(h.d + 1) % 4][0], h.r + DIRS[(h.d + 1) % 4][1]];
    let corner = 1;
    if (!isFloor(m, lc[0], lc[1])) corner *= 1 - 0.22 * Math.exp(-h.u / 0.06);
    if (!isFloor(m, rc[0], rc[1])) corner *= 1 - 0.22 * Math.exp(-(1 - h.u) / 0.06);
    const face = { c: h.c, r: h.r, d: h.d };
    const along = h.d === 0 ? h.c + h.u : h.d === 2 ? h.c + 1 - h.u : h.d === 1 ? h.r + h.u : h.r + 1 - h.u;
    const wallL = sideL * corner * shadeOf(dist), fpw = dist / pd;
    const rl = Math.hypot(h.rx, h.rz), az = Math.atan2(h.rz, h.rx);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4, yc = y + 0.5;
      if (yc >= top && yc < bot) {
        const v = EYE + (y0 - yc) * dist / pd;
        wallPx(look, h.u, v, face, along, fpw, m, col);
        const vl = 0.9 + 0.1 * Math.min(1, v / WALL_H);
        const floorAO = 1 - 0.25 * Math.exp(-v / 0.06);
        put(i, wallL * vl * floorAO);
      } else if (yc >= bot) {
        const rd = EYE * pd / (yc - y0);
        const wx = pose.x + rd * h.rx, wz = pose.z + rd * h.rz;
        floorPx(look, wx, wz, (rd / pd) * Math.sqrt(Math.max(1, rd / EYE)), isF, col);
        put(i, floorL(wx, wz) * shadeOf(rd));
      } else {
        const rd = (WALL_H - EYE) * pd / (y0 - yc);
        const wx = pose.x + rd * h.rx, wz = pose.z + rd * h.rz;
        const sky = ceilPx(look, wx, wz, (rd / pd) * Math.sqrt(Math.max(1, rd / (WALL_H - EYE))), az, Math.atan2((y0 - yc) / pd, rl), col);
        put(i, sky ? 1 : shadeOf(rd) * 0.97);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  _styledCache.key = k; _styledCache.canvas = cv;
  return cv;
}

const VIS = new WeakMap();
function visPose(st) {
  const target = poseOf(st.cell, st.heading);
  let v = VIS.get(st);
  if (!v) { v = { ...target }; VIS.set(st, v); }
  return { v, target };
}
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

export default {
  meta: {
    name: 'corridor_walk_mark_pose', family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'forward' }, { op: 'back' }, { op: 'left' }, { op: 'right' },
      { op: 'mark', col: 'grid col', row: 'grid row', dir: 'wall side 0=N 1=E 2=S 3=W (map up = N)' },
      { op: 'map', note: 'open the map, which is hidden while you walk; walking ends' },
    ],
    promptHuman: 'Find the red door, then tap its wall on the map',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    for (let a = 0; a < 20000; a++) { const m = tryBuild(rng); if (m) return m; }
    return JSON.parse(JSON.stringify(FALLBACK));
  },

  init(m) {
    const st = { cell: [m.start.col, m.start.row], heading: m.start.heading, mark: null };
    if (hidesMap(m)) { st.walked = false; st.mapOpen = false; }
    return st;
  },

  applyAction(state, action, m) {
    const op = action && action.op;
    if (hidesMap(m)) {
      if (op === 'left' || op === 'right' || op === 'forward' || op === 'back') {
        if (state.mapOpen) return { ok: false, reason: 'walk-ended' };
        state.walked = true;
      } else if (op === 'map') { state.mapOpen = true; return { ok: true }; }
      else if (op === 'mark' && !mapShown(m, state)) return { ok: false, reason: 'map-hidden' };
    }
    if (op === 'left') { state.heading = (state.heading + 3) % 4; return { ok: true }; }
    if (op === 'right') { state.heading = (state.heading + 1) % 4; return { ok: true }; }
    if (op === 'forward' || op === 'back') {
      const r = fwd(state.cell, op === 'back' ? (state.heading + 2) % 4 : state.heading, m);
      state.cell = r.cell;
      return { ok: true, moved: r.moved };
    }
    if (op === 'mark') {
      const { col, row, dir } = action;
      if (!wallFaces(m).some((f) => f.col === col && f.row === row && f.dir === dir)) return { ok: false, reason: 'not-a-wall' };
      state.mark = { col, row, dir }; return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const k = state.mark;
    const ok = !!k && k.col === m.door.col && k.row === m.door.row && k.dir === m.door.dir;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { marked: k } };
  },

  oracle(m) {
    const map = { F: { op: 'forward' }, L: { op: 'left' }, R: { op: 'right' } };
    const acts = planMoves(m).acts.map((a) => map[a]);
    if (hidesMap(m)) acts.push({ op: 'map' });
    acts.push({ op: 'mark', col: m.door.col, row: m.door.row, dir: m.door.dir });
    return acts;
  },

  trainingOracle(m) {
    const map = { F: { op: 'forward' }, L: { op: 'left' }, R: { op: 'right' } }, acts = planMoves(m).acts;
    const mark = { op: 'mark', col: m.door.col, row: m.door.row, dir: m.door.dir };
    const plain = (cell, h) => {
      const pose = poseOf(cell, h), c = castColumn(m, pose, 0);
      if (c.c === m.door.col && c.r === m.door.row && c.d === m.door.dir && c.u > DOOR_U[0] && c.u < DOOR_U[1]) return true;
      const near = cellEq(cell, [m.door.col, m.door.row]) || cellEq([cell[0] + DIRS[h][0], cell[1] + DIRS[h][1]], [m.door.col, m.door.row]);
      return near && doorColumns(m, pose) >= 25;
    };
    let cell = [m.start.col, m.start.row], h = m.start.heading;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (a === 'F') cell = fwd(cell, h, m).cell; else if (a === 'L') h = (h + 3) % 4; else h = (h + 1) % 4;
      if (plain(cell, h)) return [...acts.slice(0, i + 1).map((x) => map[x]), ...(hidesMap(m) ? [{ op: 'map' }] : []), mark];
    }
    return this.oracle(m);
  },

  randomPolicy(m, rnd) {
    const f = wallFaces(m), p = f[Math.floor(rnd() * f.length)];
    return [{ op: 'mark', col: p.col, row: p.row, dir: p.dir }];
  },

  async mount(env) {
    if (env && env.style) env.assets.look = await buildCorridorLook(env.style, 4);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Find the red door and mark it on the map', 'Walk with the buttons, then tap that wall');
  },

  tick(env, dt) {
    const st = env && env.state;
    if (!st) return false;
    const { v, target } = visPose(st);
    const dx = target.x - v.x, dz = target.z - v.z, da = angDiff(v.ang, target.ang);
    if (Math.abs(dx) + Math.abs(dz) < 1e-3 && Math.abs(da) < 1e-3) { Object.assign(v, target); return false; }
    const step = Math.min(1, dt * 7);
    v.x += dx * step + Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.6);
    v.z += dz * step + Math.sign(dz) * Math.min(Math.abs(dz), dt * 0.6);
    v.ang += da * step + Math.sign(da) * Math.min(Math.abs(da), dt * 0.9);
    if (Math.abs(target.x - v.x) < 0.01 && Math.abs(target.z - v.z) < 0.01 && Math.abs(angDiff(v.ang, target.ang)) < 0.01) Object.assign(v, target);
    return true;
  },

  _drawView(g, m, st, look) {
    const { v } = visPose(st);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cv = look ? renderViewStyled(m, v, Math.min(2, Math.max(1, dpr)), look)
      : renderView(m, v, Math.min(2, Math.max(1, dpr)));
    g.save(); g.beginPath(); rr(g, 0, 0, BOARD.w, VIEW_H, 8); g.clip();
    if (cv && g.drawImage) g.drawImage(cv, 0, 0, BOARD.w, VIEW_H);
    else { g.fillStyle = '#e6dccb'; g.fillRect(0, 0, BOARD.w, VIEW_H); }
    g.restore();
  },

  _btnRects(sw = false) {
    const { y, w, h, gap } = BTN, x = sw ? BTN_SWAP_X : BTN.x, half = (w - gap) / 2;
    return {
      forward: { x, y, w, h },
      left: { x, y: y + h + gap, w: half, h },
      right: { x: x + half + gap, y: y + h + gap, w: half, h },
      back: { x, y: y + 2 * (h + gap), w, h },
    };
  },

  _drawButtons(g, sw = false, off = false) {
    const R = this._btnRects(sw);
    for (const k of ['forward', 'left', 'right', 'back']) {
      const b = R[k];
      rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = off ? '#f4f6f8' : '#eef2f6'; g.fill();
      g.strokeStyle = off ? '#dde2e7' : '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = off ? '#b3bcc5' : '#3c4955';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - 6;
      if (k === 'forward') {
        g.beginPath(); g.moveTo(cx, cy + 7); g.lineTo(cx, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy - 1); g.lineTo(cx, cy - 8); g.lineTo(cx + 7, cy - 1); g.stroke();
      } else if (k === 'back') {
        g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy + 1); g.lineTo(cx, cy + 8); g.lineTo(cx + 7, cy + 1); g.stroke();
      } else {
        const s = k === 'left' ? -1 : 1;
        g.beginPath(); g.moveTo(cx - s * 6, cy + 8); g.lineTo(cx - s * 6, cy); g.quadraticCurveTo(cx - s * 6, cy - 6, cx, cy - 6); g.lineTo(cx + s * 7, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 3, cy - 11); g.lineTo(cx + s * 8, cy - 6); g.lineTo(cx + s * 3, cy - 1); g.stroke();
      }
      g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k === 'forward' ? 'Forward' : k === 'back' ? 'Back' : k === 'left' ? 'Turn left' : 'Turn right', cx, b.y + b.h - 9);
    }
  },

  _segPts(c, r, d, cs = MAP.S / GW, mx = MAP.x) {
    const { y } = MAP, x0 = mx + c * cs, y0 = y + r * cs;
    if (d === 0) return [x0, y0, x0 + cs, y0];
    if (d === 1) return [x0 + cs, y0, x0 + cs, y0 + cs];
    if (d === 2) return [x0, y0 + cs, x0 + cs, y0 + cs];
    return [x0, y0, x0, y0 + cs];
  },

  _drawMapCover(g) {
    const { x, y, S } = MAP;
    rr(g, x - 3, y - 3, S + 6, S + 6, 6); g.fillStyle = '#d5dbe1'; g.fill();
    rr(g, x, y, S, S, 4); g.fillStyle = '#e9edf1'; g.fill();
    const cx = x + S / 2, cy = y + 58, w = 22, h = 34;
    g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = '#7d8a97'; g.fillStyle = '#f7f9fb';
    g.beginPath();
    g.moveTo(cx - 1.5 * w, cy - h / 2 + 4); g.lineTo(cx - 0.5 * w, cy - h / 2); g.lineTo(cx + 0.5 * w, cy - h / 2 + 4); g.lineTo(cx + 1.5 * w, cy - h / 2);
    g.lineTo(cx + 1.5 * w, cy + h / 2 - 4); g.lineTo(cx + 0.5 * w, cy + h / 2); g.lineTo(cx - 0.5 * w, cy + h / 2 - 4); g.lineTo(cx - 1.5 * w, cy + h / 2);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(cx - 0.5 * w, cy - h / 2); g.lineTo(cx - 0.5 * w, cy + h / 2 - 4); g.moveTo(cx + 0.5 * w, cy - h / 2 + 4); g.lineTo(cx + 0.5 * w, cy + h / 2); g.stroke();
    const b = { x: x + OPEN_BTN.dx, y: y + OPEN_BTN.dy, w: OPEN_BTN.w, h: OPEN_BTN.h };
    rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = '#9fb3c6'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#2c3a47'; g.font = `700 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Open map', b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    g.fillStyle = '#5b6672'; g.font = `600 10px ${UI_FONT}`;
    g.fillText('Walking ends when you open it', x + S / 2, b.y + b.h + 15);
  },

  _drawMap(g, m, st, sw = false) {
    if (!mapShown(m, st)) { this._drawMapCover(g); return; }
    const gw = gridW(m);
    const { y } = MAP, x = sw ? MAP_SWAP_X : MAP.x, cs = MAP.S / gw, S = cs * gw;
    rr(g, x - 3, y - 3, S + 6, S + 6, 6); g.fillStyle = '#d5dbe1'; g.fill();
    for (const [c, r] of m.floors) {
      g.fillStyle = '#fbf7ef'; g.fillRect(x + c * cs, y + r * cs, cs, cs);
    }
    g.strokeStyle = 'rgba(160,140,110,.25)'; g.lineWidth = 1;
    for (const [c, r] of m.floors) { g.strokeRect(x + c * cs + 0.5, y + r * cs + 0.5, cs - 1, cs - 1); }
    g.strokeStyle = '#46505b'; g.lineWidth = 4; g.lineCap = 'round';
    for (const f of wallFaces(m)) {
      const [a, b, c2, d2] = this._segPts(f.col, f.row, f.dir, cs, x);
      g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke();
    }
    const sx = x + (m.start.col + 0.5) * cs, sy = y + (m.start.row + 0.5) * cs;
    const dd = DIRS[m.start.heading];
    g.fillStyle = 'rgba(47,143,87,.16)'; g.fillRect(x + m.start.col * cs + 2, y + m.start.row * cs + 2, cs - 4, cs - 4);
    g.strokeStyle = '#2f8f57'; g.fillStyle = '#2f8f57'; g.lineWidth = 3;
    const ex = sx + dd[0] * cs * 0.3, ey = sy + dd[1] * cs * 0.3;
    g.beginPath(); g.moveTo(sx - dd[0] * cs * 0.12, sy - dd[1] * cs * 0.12); g.lineTo(ex, ey); g.stroke();
    const px = -dd[1], py = dd[0];
    g.beginPath(); g.moveTo(ex + dd[0] * 6, ey + dd[1] * 6); g.lineTo(ex + px * 6, ey + py * 6); g.lineTo(ex - px * 6, ey - py * 6); g.closePath(); g.fill();
    g.beginPath(); g.arc(sx - dd[0] * cs * 0.12, sy - dd[1] * cs * 0.12, 4, 0, Math.PI * 2); g.fill();
    g.font = `700 ${cs < 30 ? 6.5 : 8}px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const ly = sy + (dd[1] > 0 ? -cs * (cs < 30 ? 0.3 : 0.36) : cs * (cs < 30 ? 0.3 : 0.36));
    const lx = sx + (dd[0] !== 0 ? -dd[0] * cs * 0.02 : 0);
    g.fillText('START', lx, ly);
    if (st.mark) {
      const [a, b, c2, d2] = this._segPts(st.mark.col, st.mark.row, st.mark.dir, cs, x);
      const mx = (a + c2) / 2, my = (b + d2) / 2, horiz = b === d2;
      g.strokeStyle = '#c0392b'; g.lineWidth = 7; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(horiz ? mx - cs * 0.26 : mx, horiz ? my : my - cs * 0.26); g.lineTo(horiz ? mx + cs * 0.26 : mx, horiz ? my : my + cs * 0.26); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.strokeRect(horiz ? mx - cs * 0.26 : mx - 3.5, horiz ? my - 3.5 : my - cs * 0.26, horiz ? cs * 0.52 : 7, horiz ? 7 : cs * 0.52);
      g.lineCap = 'round';
    }
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, br.w, br.h);
    this._drawView(g, m, st, env.style ? env.assets && env.assets.look : null);
    this._drawMap(g, m, st, swapped(env));
    this._drawButtons(g, swapped(env), hidesMap(m) && !!st.mapOpen);
    g.restore();
  },

  _segAt(m, px, py, sw = false) {
    const gw = gridW(m);
    const { y } = MAP, x = sw ? MAP_SWAP_X : MAP.x, cs = MAP.S / gw;
    if (px < x - 8 || px > x + cs * gw + 8 || py < y - 8 || py > y + cs * gw + 8) return null;
    let best = null, bd = cs * 0.4;
    for (const f of wallFaces(m)) {
      const [a, b, c2, d2] = this._segPts(f.col, f.row, f.dir, cs, x);
      const t = Math.max(0, Math.min(1, ((px - a) * (c2 - a) + (py - b) * (d2 - b)) / ((c2 - a) ** 2 + (d2 - b) ** 2)));
      const qx = a + t * (c2 - a), qy = b + t * (d2 - b);
      const inCell = px >= x + f.col * cs - 6 && px <= x + (f.col + 1) * cs + 6 && py >= y + f.row * cs - 6 && py <= y + (f.row + 1) * cs + 6;
      const d = Math.hypot(px - qx, py - qy);
      if (inCell && d < bd) { bd = d; best = f; }
    }
    return best;
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest, st = env.state;
    const R = this._btnRects(swapped(env));
    for (const k of ['left', 'forward', 'right', 'back']) {
      const b = R[k];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return hidesMap(m) && st.mapOpen ? [] : [{ op: k }];
    }
    if (!mapShown(m, st)) {
      const bx = MAP.x + OPEN_BTN.dx, by = MAP.y + OPEN_BTN.dy;
      return evt.x >= bx && evt.x <= bx + OPEN_BTN.w && evt.y >= by && evt.y <= by + OPEN_BTN.h ? [{ op: 'map' }] : [];
    }
    const f = this._segAt(m, evt.x, evt.y, swapped(env));
    if (f) return [{ op: 'mark', col: f.col, row: f.row, dir: f.dir }];
    return [];
  },

  footerStatus(env) {
    const st = env && env.state, m = env && env.manifest;
    if (st && hidesMap(m) && !st.mapOpen) {
      if (st.walked) return 'Map hidden while you walk';
      if (!st.mark) return 'The map hides once you walk';
    }
    return st && st.mark ? 'Door marked' : 'Tap a wall on the map';
  },
};
