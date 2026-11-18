import { makeCamera } from './_proj3d.js';

export const N = 4;
export const VIEWS = ['front', 'right', 'back', 'left', 'top'];
export const HARD = Object.freeze({
  minCubes: 9, maxCubes: 22, minStacks: 5, minPaint: 5, maxPaint: 11,
  topVisible: 0.5, sideVisible: 0.12,
  yawMin: 28, yawMax: 62, pitchMin: 28, pitchMax: 38, dist: 16,
});
const HALF = N / 2;
export const cube = (x, lv, z) => ({ lo: [x - HALF, lv, z - HALF], hi: [x - HALF + 1, lv + 1, z - HALF + 1] });
const range = (n) => Array.from({ length: n }, (_, i) => i);

export function lineCells(view, c) {
  if (view === 'front') return range(N).map((k) => [c, N - 1 - k]);
  if (view === 'back') return range(N).map((k) => [N - 1 - c, k]);
  if (view === 'right') return range(N).map((k) => [N - 1 - k, N - 1 - c]);
  return range(N).map((k) => [k, c]);
}

export function projection(h, view) {
  const out = new Array(N * N).fill(0);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let on;
    if (view === 'top') on = h[r][c] > 0;
    else { const lv = N - 1 - r; on = Math.max(...lineCells(view, c).map(([x, z]) => h[z][x])) > lv; }
    out[r * N + c] = on ? 1 : 0;
  }
  return out;
}

export function nearRowView(h, view) {
  const out = new Array(N * N).fill(0);
  if (view === 'top') return out;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const [x, z] = lineCells(view, c)[0];
    out[r * N + c] = h[z][x] > N - 1 - r ? 1 : 0;
  }
  return out;
}

export const mirrorLR = (v) => v.map((_, i) => v[Math.floor(i / N) * N + (N - 1 - (i % N))]);
const flipTB = (v) => v.map((_, i) => v[(N - 1 - Math.floor(i / N)) * N + (i % N)]);
const rot90 = (v) => v.map((_, i) => { const r = Math.floor(i / N), c = i % N; return v[(N - 1 - c) * N + r]; });
const same = (a, b) => a.every((x, i) => x === b[i]);
export const count = (v) => v.reduce((s, x) => s + x, 0);

export function attractors(h, view) {
  const t = projection(h, view), out = [];
  for (const other of VIEWS) if (other !== view) out.push({ id: 'view:' + other, cells: projection(h, other) });
  out.push({ id: 'mirror', cells: mirrorLR(t) });
  if (view === 'top') {
    out.push({ id: 'flip', cells: flipTB(t) });
    let q = t; for (let k = 1; k <= 3; k++) { q = rot90(q); out.push({ id: 'rot' + 90 * k, cells: q }); }
  } else {
    out.push({ id: 'near-row', cells: nearRowView(h, view) });
    out.push({ id: 'upside-down', cells: flipTB(t) });
  }
  return out;
}

export function cameraFor(m) {
  return makeCamera({ yaw: m.cam.yaw, pitch: m.cam.pitch, dist: HARD.dist, cx: 0, cy: 0, fov: 1, minDepth: 0.5 });
}

function segmentHitsBox(p, q, b) {
  let t0 = 1e-4, t1 = 1 - 1e-4;
  for (let i = 0; i < 3; i++) {
    const d = q[i] - p[i];
    if (Math.abs(d) < 1e-12) { if (p[i] <= b.lo[i] || p[i] >= b.hi[i]) return false; continue; }
    let a = (b.lo[i] - p[i]) / d, c = (b.hi[i] - p[i]) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 >= t1) return false;
  }
  return true;
}
function visibleFraction(pointAt, normal, boxes, eye) {
  let vis = 0, n = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const s = pointAt(0.12 + 0.19 * i, 0.12 + 0.19 * j), p = s.map((v, k) => v + normal[k] * 1e-3);
    n++; if (!boxes.some((b) => segmentHitsBox(p, eye, b))) vis++;
  }
  return vis / n;
}
function stackRows(h, cam) {
  const camera = makeCamera({ yaw: cam.yaw, pitch: cam.pitch, dist: HARD.dist, cx: 0, cy: 0, fov: 1, minDepth: 0.5 });
  const eye = [camera.cam.x, camera.cam.y, camera.cam.z], boxes = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) for (let lv = 0; lv < h[z][x]; lv++) boxes.push(cube(x, lv, z));
  return { eye, boxes, sideX: cam.yaw > 0 ? 1 : -1 };
}
function topVis(h, x, z, ctx) {
  const H = h[z][x];
  return visibleFraction((u, v) => [x - HALF + u, H + 0.001, z - HALF + v], [0, 1, 0], ctx.boxes, ctx.eye);
}
function sideVis(h, x, z, ctx) {
  const H = h[z][x], X0 = x - HALF, Z0 = z - HALF;
  const front = visibleFraction((u, v) => [X0 + u, H - 1 + v, Z0 + 1], [0, 0, 1], ctx.boxes, ctx.eye);
  const sx = ctx.sideX > 0 ? X0 + 1 : X0;
  const lateral = visibleFraction((u, v) => [sx, H - 1 + v, Z0 + u], [ctx.sideX, 0, 0], ctx.boxes, ctx.eye);
  return Math.max(front, lateral);
}
export function fairness(h, cam, view) {
  const ctx = stackRows(h, cam), bad = [], target = projection(h, view);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (h[z][x] > 0) { if (topVis(h, x, z, ctx) < HARD.topVisible) bad.push({ x, z, code: 'hidden-top' }); continue; }
    for (let k = 1; k <= N; k++) {
      const alt = h.map((row) => row.slice()); alt[z][x] = k;
      if (same(projection(alt, view), target)) continue;
      if (topVis(alt, x, z, stackRows(alt, cam)) < HARD.topVisible) { bad.push({ x, z, k, code: 'unobservable-empty' }); break; }
    }
  }
  if (view !== 'top') for (let c = 0; c < N; c++) {
    const line = lineCells(view, c), top = Math.max(...line.map(([x, z]) => h[z][x]));
    if (!top) continue;
    if (!line.filter(([x, z]) => h[z][x] === top).some(([x, z]) => sideVis(h, x, z, ctx) >= HARD.sideVisible)) bad.push({ line: c, code: 'unreadable-height' });
  }
  return { ok: !bad.length, bad };
}

export const TRAP = Object.freeze({ maxDist: 0.4, minH: 2, floorVisible: 0.5, footVisible: 0.3 });
export function misreadTraps(h, cam, view) {
  const camera = cameraFor({ cam }), P = (x, y, z) => camera.project({ x, y, z });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), target = projection(h, view), out = [];
  let ctx = null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const H = h[z][x];
    if (H < TRAP.minH || H >= N) continue;
    const X = x - HALF + 0.5, Z = z - HALF + 0.5, top = P(X, H, Z);
    const cell = (d(P(X - 0.5, H, Z), P(X + 0.5, H, Z)) + d(P(X, H, Z - 0.5), P(X, H, Z + 0.5))) / 2;
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) {
      const x2 = x + dx, z2 = z + dz;
      if (x2 >= N || z2 >= N || h[z2][x2]) continue;
      const dist = d(top, P(X + dx, H + 1, Z + dz)) / cell;
      if (dist >= TRAP.maxDist) continue;
      const alt = h.map((row) => row.slice()); alt[z][x] = 0; alt[z2][x2] = H + 1;
      if (same(projection(alt, view), target)) continue;
      ctx ??= stackRows(h, cam);
      const floor = visibleFraction((u, v) => [x2 - HALF + u, 0.001, z2 - HALF + v], [0, 1, 0], ctx.boxes, ctx.eye);
      const X0 = x - HALF, Z0 = z - HALF;
      const foot = Math.max(visibleFraction((u, v) => [X0 + u, v, Z0 + 1], [0, 0, 1], ctx.boxes, ctx.eye),
        visibleFraction((u, v) => [X0 + 1, v, Z0 + u], [1, 0, 0], ctx.boxes, ctx.eye));
      out.push({ x, z, H, x2, z2, dist, floor, foot, readable: floor >= TRAP.floorVisible && foot >= TRAP.footVisible });
    }
  }
  return out;
}

export function checkRound(m) {
  const errors = [], h = m?.h;
  if (!Array.isArray(h) || h.length !== N || h.some((row) => !Array.isArray(row) || row.length !== N || row.some((v) => !Number.isInteger(v) || v < 0 || v > N))) return ['heights'];
  if (!VIEWS.includes(m.view)) return ['view'];
  if (!m.cam || !Number.isFinite(m.cam.yaw) || !Number.isFinite(m.cam.pitch)) return ['camera'];
  if (m.cam.yaw < HARD.yawMin || m.cam.yaw > HARD.yawMax || m.cam.pitch < HARD.pitchMin || m.cam.pitch > HARD.pitchMax) errors.push('camera-range');
  const cubes = h.flat().reduce((s, v) => s + v, 0), stacks = h.flat().filter((v) => v > 0).length;
  if (cubes < HARD.minCubes || cubes > HARD.maxCubes || stacks < HARD.minStacks) errors.push('size');
  const target = projection(h, m.view);
  if (!Array.isArray(m.target) || m.target.length !== N * N || !same(m.target, target)) errors.push('target-mismatch');
  const n = count(target);
  if (n < HARD.minPaint || n > HARD.maxPaint) errors.push('paint-count');
  for (const a of attractors(h, m.view)) if (same(a.cells, target)) errors.push('attractor:' + a.id);
  if (m.view !== 'top') {
    const levels = range(N).map((c) => range(N).filter((r) => target[r * N + c]).length);
    if (new Set(levels).size < 2) errors.push('flat-skyline');
  }
  if (errors.length) return errors;
  if (!misreadTraps(h, m.cam, m.view).some((t) => t.readable)) errors.push('no-misread-trap');
  if (errors.length) return errors;
  if (!fairness(h, m.cam, m.view).ok) errors.push('visibility');
  return errors;
}

export const SKYLINES = (() => {
  const out = [];
  for (let k = 0; k < (N + 1) ** N; k++) {
    const s = range(N).map((i) => Math.floor(k / (N + 1) ** i) % (N + 1)), sum = s.reduce((a, b) => a + b, 0);
    if (sum < HARD.minPaint || sum > HARD.maxPaint || new Set(s).size < 2 || same(s, s.slice().reverse())) continue;
    out.push(s);
  }
  return out;
})();
function randomFootprint(rng) {
  for (;;) {
    const n = rng.int(HARD.minPaint, Math.min(HARD.maxPaint, 9));
    const on = new Set(rng.shuffle(range(N * N)).slice(0, n)), cells = range(N * N).map((i) => (on.has(i) ? 1 : 0));
    let sym = same(mirrorLR(cells), cells) || same(flipTB(cells), cells), q = cells;
    for (let k = 0; k < 3 && !sym; k++) { q = rot90(q); sym = same(q, cells); }
    if (!sym) return cells;
  }
}

function fillAround(rng, view, pattern) {
  const h = range(N).map(() => new Array(N).fill(0));
  if (view === 'top') {
    pattern.forEach((on, i) => { if (on) h[Math.floor(i / N)][i % N] = rng.raw() < 0.8 ? rng.int(1, 2) : rng.int(3, N); });
    return h;
  }
  let deep = false;
  for (let c = 0; c < N; c++) {
    const s = pattern[c];
    if (!s) continue;
    const line = lineCells(view, c), peak = rng.int(0, N - 1);
    line.forEach(([x, z], k) => {
      if (k === peak) h[z][x] = s;
      else if (rng.raw() < 0.4) h[z][x] = rng.int(1, s);
    });
    const [nx, nz] = line[0];
    if (peak !== 0 && h[nz][nx] < s) deep = true;
  }
  return deep ? h : null;
}

export function sampleRound(rng) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const view = rng.pick(VIEWS);
    const pattern = view === 'top' ? randomFootprint(rng) : rng.pick(SKYLINES);
    const cam = { yaw: rng.int(HARD.yawMin + 2, HARD.yawMax - 2), pitch: rng.int(HARD.pitchMin + 1, HARD.pitchMax - 1) };
    for (let fill = 0; fill < 30; fill++) {
      const h = fillAround(rng, view, pattern);
      if (!h) continue;
      const m = { h, view, cam, target: projection(h, view) };
      if (!checkRound(m).length) return m;
    }
  }
  return null;
}
