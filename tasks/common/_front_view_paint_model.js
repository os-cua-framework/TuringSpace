import { makeCamera } from './_proj3d.js';

export const VIEWS = ['front', 'right', 'top'];
export const HARD = Object.freeze({
  minCubes: 5, maxCubes: 11, minStacks: 3, minPaint: 3, maxPaint: 7,
  topVisible: 0.5, floorVisible: 0.3, sideVisible: 0.12,
  yawMin: 28, yawMax: 62, pitchMin: 27, pitchMax: 36, dist: 13,
});

export const cube = (x, lv, z) => ({ lo: [x - 1.5, lv, z - 1.5], hi: [x - 0.5, lv + 1, z - 0.5] });

export function projection(h, view) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    let on = false;
    if (view === 'front') { const lv = 2 - r; on = Math.max(h[0][c], h[1][c], h[2][c]) > lv; }
    else if (view === 'right') { const lv = 2 - r, z = 2 - c; on = Math.max(...h[z]) > lv; }
    else on = h[r][c] > 0;
    out[r * 3 + c] = on ? 1 : 0;
  }
  return out;
}

export function nearRowView(h, view) {
  const out = new Array(9).fill(0);
  if (view === 'top') return out;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const lv = 2 - r, height = view === 'front' ? h[2][c] : h[2 - c][2];
    out[r * 3 + c] = height > lv ? 1 : 0;
  }
  return out;
}

const mirrorLR = (v) => v.map((_, i) => v[Math.floor(i / 3) * 3 + (2 - (i % 3))]);
const flipTB = (v) => v.map((_, i) => v[(2 - Math.floor(i / 3)) * 3 + (i % 3)]);
const rot90 = (v) => v.map((_, i) => { const r = Math.floor(i / 3), c = i % 3; return v[(2 - c) * 3 + r]; });
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
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) for (let lv = 0; lv < h[z][x]; lv++) boxes.push(cube(x, lv, z));
  const sideX = cam.yaw > 0 ? 1 : -1;
  return { eye, boxes, sideX };
}
function topVis(h, x, z, ctx) {
  const H = h[z][x];
  return visibleFraction((u, v) => [x - 1.5 + u, H + 0.001, z - 1.5 + v], [0, 1, 0], ctx.boxes, ctx.eye);
}
function sideVis(h, x, z, ctx) {
  const H = h[z][x], X0 = x - 1.5, Z0 = z - 1.5;
  const front = visibleFraction((u, v) => [X0 + u, H - 1 + v, Z0 + 1], [0, 0, 1], ctx.boxes, ctx.eye);
  const sx = ctx.sideX > 0 ? X0 + 1 : X0;
  const lateral = visibleFraction((u, v) => [sx, H - 1 + v, Z0 + u], [ctx.sideX, 0, 0], ctx.boxes, ctx.eye);
  return Math.max(front, lateral);
}
function answerStacks(h, view) {
  const out = new Set();
  if (view === 'top') return out;
  for (let c = 0; c < 3; c++) {
    const line = view === 'front' ? [0, 1, 2].map((z) => [c, z]) : [0, 1, 2].map((x) => [x, 2 - c]);
    const top = Math.max(...line.map(([x, z]) => h[z][x]));
    if (top > 0) for (const [x, z] of line) if (h[z][x] === top) out.add(z * 3 + x);
  }
  return out;
}
export function fairness(h, cam, view) {
  const ctx = stackRows(h, cam), bad = [], target = projection(h, view), keys = answerStacks(h, view), rows = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    if (h[z][x] > 0) {
      const top = topVis(h, x, z, ctx), side = sideVis(h, x, z, ctx);
      rows.push({ x, z, height: h[z][x], top, side });
      if (top < HARD.topVisible) bad.push({ x, z, code: 'hidden-top' });
      continue;
    }
    for (let k = 1; k <= 3; k++) {
      const alt = h.map((row) => row.slice()); alt[z][x] = k;
      if (same(projection(alt, view), target)) continue;
      const vis = topVis(alt, x, z, stackRows(alt, cam));
      rows.push({ x, z, height: 0, probe: k, top: vis });
      if (vis < HARD.topVisible) { bad.push({ x, z, k, code: 'unobservable-empty' }); break; }
    }
  }
  if (view !== 'top') for (let c = 0; c < 3; c++) {
    const line = view === 'front' ? [0, 1, 2].map((z) => [c, z]) : [0, 1, 2].map((x) => [x, 2 - c]);
    const top = Math.max(...line.map(([x, zz]) => h[zz][x]));
    if (!top) continue;
    const witnesses = line.filter(([x, zz]) => h[zz][x] === top && keys.has(zz * 3 + x));
    if (!witnesses.some(([x, zz]) => sideVis(h, x, zz, ctx) >= HARD.sideVisible)) bad.push({ line: c, code: 'unreadable-height' });
  }
  return { ok: !bad.length, rows, bad };
}

export function checkRound(m) {
  const errors = [];
  const h = m?.h;
  if (!Array.isArray(h) || h.length !== 3 || h.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((v) => !Number.isInteger(v) || v < 0 || v > 3))) return ['heights'];
  if (!VIEWS.includes(m.view)) return ['view'];
  if (!m.cam || !Number.isFinite(m.cam.yaw) || !Number.isFinite(m.cam.pitch)) return ['camera'];
  if (m.cam.yaw < HARD.yawMin || m.cam.yaw > HARD.yawMax || m.cam.pitch < HARD.pitchMin || m.cam.pitch > HARD.pitchMax) errors.push('camera-range');
  const cubes = h.flat().reduce((s, v) => s + v, 0), stacks = h.flat().filter((v) => v > 0).length;
  if (cubes < HARD.minCubes || cubes > HARD.maxCubes || stacks < HARD.minStacks) errors.push('size');
  const target = projection(h, m.view);
  if (!Array.isArray(m.target) || !same(m.target, target)) errors.push('target-mismatch');
  const n = count(target);
  if (n < HARD.minPaint || n > HARD.maxPaint) errors.push('paint-count');
  for (const a of attractors(h, m.view)) if (same(a.cells, target)) errors.push('attractor:' + a.id);
  if (m.view !== 'top') {
    const levels = [0, 1, 2].map((c) => [0, 1, 2].filter((r) => target[r * 3 + c]).length);
    if (new Set(levels).size < 2) errors.push('flat-skyline');
  }
  if (!fairness(h, m.cam, m.view).ok) errors.push('visibility');
  return errors;
}

export const SKYLINES = (() => {
  const out = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const s = a + b + c;
    if (s >= HARD.minPaint && s <= HARD.maxPaint && !(a === b && b === c) && a !== c) out.push([a, b, c]);
  }
  return out;
})();
export const FOOTPRINTS = (() => {
  const out = [];
  for (let mask = 0; mask < 512; mask++) {
    const cells = Array.from({ length: 9 }, (_, i) => (mask >> i) & 1), n = count(cells);
    if (n < HARD.minPaint || n > HARD.maxPaint) continue;
    let sym = same(mirrorLR(cells), cells) || same(flipTB(cells), cells), q = cells;
    for (let k = 0; k < 3 && !sym; k++) { q = rot90(q); sym = same(q, cells); }
    if (!sym) out.push(cells);
  }
  return out;
})();

function fillAround(rng, view, pattern) {
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  if (view === 'top') {
    pattern.forEach((on, i) => { if (on) h[Math.floor(i / 3)][i % 3] = rng.int(1, 3); });
    return h;
  }
  const lines = [0, 1, 2].map((c) => (view === 'front' ? { cells: [0, 1, 2].map((z) => [z, c]), near: 2 } : { cells: [0, 1, 2].map((x) => [2 - c, x]), near: 2 }));
  let deep = false;
  lines.forEach((line, c) => {
    const s = pattern[c];
    if (!s) return;
    const peak = rng.int(0, 2);
    line.cells.forEach(([z, x], k) => {
      if (k === peak) h[z][x] = s;
      else if (rng.raw() < 0.45) h[z][x] = rng.int(1, s);
    });
    if (peak !== line.near && line.cells[line.near] && h[line.cells[line.near][0]][line.cells[line.near][1]] < s) deep = true;
  });
  return deep ? h : null;
}

export function sampleFixed(rng, view, pattern, tries = 300) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const cam = { yaw: rng.int(HARD.yawMin + 2, HARD.yawMax - 2), pitch: rng.int(HARD.pitchMin + 1, HARD.pitchMax - 1) };
    for (let fill = 0; fill < 40; fill++) {
      const h = fillAround(rng, view, pattern);
      if (!h) continue;
      const m = { h, view, cam, target: projection(h, view) };
      if (!checkRound(m).length) return m;
    }
  }
  return null;
}

export function sampleRound(rng, pools = null) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const view = rng.pick(['front', 'front', 'right', 'right', 'top', 'front', 'right', 'top']);
    const pattern = view === 'top' ? rng.pick(pools ? pools.footprints : FOOTPRINTS) : rng.pick(pools ? pools.skylines : SKYLINES);
    const cam = { yaw: rng.int(HARD.yawMin + 2, HARD.yawMax - 2), pitch: rng.int(HARD.pitchMin + 1, HARD.pitchMax - 1) };
    for (let fill = 0; fill < 40; fill++) {
      const h = fillAround(rng, view, pattern);
      if (!h) continue;
      const m = { h, view, cam, target: projection(h, view) };
      if (!checkRound(m).length) return m;
    }
  }
  return null;
}
