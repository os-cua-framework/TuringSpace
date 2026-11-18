export const PIECES = {
  L4: { label: 'L', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]] },
  T4: { label: 'T', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
  S4: { label: 'S', cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]] },
  P5: { label: 'P', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 2, 0]] },
  L5: { label: 'long L', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [3, 1, 0]] },
  chair: { label: 'chair', cells: [[0, 0, 1], [0, 1, 0], [0, 1, 1], [0, 2, 0], [1, 1, 0]] },
  hook: { label: 'hook', cells: [[0, 0, 1], [0, 1, 1], [1, 0, 0], [1, 0, 1], [2, 0, 1]] },
};

export const MOVES = {
  right: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  left: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  up: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  down: [1, 0, 0, 0, 0, -1, 0, 1, 0],
};
export const MOVE_NAMES = Object.keys(MOVES);

export const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const key = (R) => R.join(',');
const apply = (R, v) => [0, 1, 2].map((i) => R[i * 3] * v[0] + R[i * 3 + 1] * v[1] + R[i * 3 + 2] * v[2]);

export const ORIENTS = (() => {
  const seen = new Map([[key(I3), I3]]), queue = [I3];
  while (queue.length) { const R = queue.shift(); for (const n of MOVE_NAMES) { const S = mul(MOVES[n], R); if (!seen.has(key(S))) { seen.set(key(S), S); queue.push(S); } } }
  return [...seen.values()];
})();
export const orientIndex = (R) => ORIENTS.findIndex((S) => key(S) === key(R));
const STEP = ORIENTS.map((R) => Object.fromEntries(Object.keys(MOVES).map((mv) => [mv, ORIENTS.findIndex((S) => key(S) === key(mul(MOVES[mv], R)))])));
export const step = (o, move) => STEP[o][move];

export function placed(piece, o) {
  const R = ORIENTS[o], pts = PIECES[piece].cells.map((c) => apply(R, c));
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
  const mid = lo.map((v, i) => (v + hi[i]) / 2);
  return pts.map((p) => p.map((v, i) => v - mid[i]));
}
const shadowMemo = new Map();
export function shadow(piece, o) {
  const k = piece + '#' + o + '#' + PIECES[piece]?.cells.join(';');
  let v = shadowMemo.get(k);
  if (v === undefined) { const s = new Set(placed(piece, o).map((p) => `${p[0]},${p[1]}`)); v = [...s].sort().join(' '); shadowMemo.set(k, v); }
  return v;
}
export const shadowCells = (piece, o) => shadow(piece, o).split(' ').map((t) => t.split(',').map(Number));

export function pathTo(from, targets) {
  const goal = new Set(targets), prev = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const o = queue.shift();
    if (goal.has(o)) { const out = []; let k = o; while (prev.get(k)) { out.unshift(prev.get(k).move); k = prev.get(k).o; } return out; }
    for (const mv of MOVE_NAMES) { const n = step(o, mv); if (!prev.has(n)) { prev.set(n, { o, move: mv }); queue.push(n); } }
  }
  return null;
}
export const matching = (piece, target) => ORIENTS.map((_, o) => o).filter((o) => shadow(piece, o) === target);

export const HARD = Object.freeze({ minMoves: 2, maxMoves: 2, maxMatches: 2, minCells: 4 });

function mirrorShadow(s) {
  const cells = s.split(' ').map((t) => t.split(',').map(Number));
  return cells.map(([x, y]) => `${-x},${y}`).sort().join(' ');
}

export function checkRound(r) {
  const errors = [];
  if (!PIECES[r?.piece]) return ['piece'];
  if (!Number.isInteger(r.start) || r.start < 0 || r.start >= 24 || !Number.isInteger(r.goal) || r.goal < 0 || r.goal >= 24) return ['orientation'];
  const target = shadow(r.piece, r.goal);
  if (r.target !== target) errors.push('target-mismatch');
  const cells = target.split(' ').map((t) => t.split(',').map(Number));
  const w = new Set(cells.map((c) => c[0])).size, h = new Set(cells.map((c) => c[1])).size;
  if (cells.length < HARD.minCells || w < 2 || h < 2) errors.push('degenerate-outline');
  if (shadow(r.piece, r.start) === target) errors.push('start-already-matches');
  const match = matching(r.piece, target);
  if (match.length > HARD.maxMatches) errors.push('too-many-matching-orientations');
  const path = pathTo(r.start, match);
  if (!path || path.length < HARD.minMoves || path.length > HARD.maxMoves) errors.push('move-count');
  if (mirrorShadow(target) === target) errors.push('symmetric-outline');
  return errors;
}

export function sampleRound(rng, piece) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const goal = rng.int(0, 23), start = rng.int(0, 23);
    const r = { piece, start, goal, target: shadow(piece, goal) };
    if (!checkRound(r).length) return r;
  }
  return null;
}

import { makeCamera } from './_proj3d.js';
export const SCENE = Object.freeze({
  pivot: { x: 0, y: 2.5, z: 3.4 }, look: { x: 0, y: 2.1, z: 3.6 }, lampZ: 7.6,
  wall: { x0: -3.2, x1: 3.2, y1: 5.0 }, dist: 15,
  rect: { x: 0, y: 118, w: 380, h: 202 }, yaw: [56, 66], pitch: [15, 25],
});

export function sceneProjector(cam) {
  const c = makeCamera({ yaw: cam.yaw, pitch: cam.pitch, dist: SCENE.dist, cx: 0, cy: 0, fov: 1, minDepth: 0.5 });
  const L = SCENE.look, raw = (p) => c.project({ x: p.x - L.x, y: p.y - L.y, z: p.z - L.z });
  const P = SCENE.pivot, pts = [];
  for (const dx of [-2.3, 2.3]) for (const dy of [-2.3, 2.3]) for (const dz of [-2.3, 2.3]) pts.push(raw({ x: P.x + dx, y: P.y + dy, z: P.z + dz }));
  pts.push(raw({ x: 0, y: 0, z: SCENE.lampZ }), raw({ x: 0, y: 3.2, z: SCENE.lampZ }));
  for (const x of [-2.6, 2.6]) for (const y of [0, 4.6]) pts.push(raw({ x, y, z: 0 }));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const R = SCENE.rect, pad = 6, s = Math.min((R.w - 2 * pad) / (x1 - x0), (R.h - 2 * pad) / (y1 - y0));
  const ox = R.x + R.w / 2 - s * (x0 + x1) / 2, oy = R.y + R.h / 2 - s * (y0 + y1) / 2;
  const eye = { x: L.x + c.cam.x, y: L.y + c.cam.y, z: L.z + c.cam.z };
  return { eye, scale: s, project: (p) => { const q = raw(p); return { x: ox + s * q.x, y: oy + s * q.y, depth: q.depth }; } };
}
export function wallSquare(pr, x, y) {
  const P = SCENE.pivot;
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([dx, dy]) => pr.project({ x: P.x + x + dx, y: P.y + y + dy, z: 0 }));
}
export function cameraOk(cam) {
  return !!cam && Math.abs(cam.yaw) >= SCENE.yaw[0] && Math.abs(cam.yaw) <= SCENE.yaw[1] && cam.pitch >= SCENE.pitch[0] && cam.pitch <= SCENE.pitch[1];
}
