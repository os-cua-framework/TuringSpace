import { rad3 } from './_proj3d.js';

export const SLAB = 0.35;
export const DIRS = Object.freeze({ '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] });
export const DIR_KEYS = Object.freeze(['+x', '-x', '+z', '-z']);
export const NONE = Object.freeze({ kind: 'none' });

export function makeOrtho(cam) {
  const th = rad3(cam.yaw), ph = rad3(cam.pitch);
  const c = { x: Math.cos(ph) * Math.sin(th), y: Math.sin(ph), z: Math.cos(ph) * Math.cos(th) };
  const r = { x: Math.cos(th), z: -Math.sin(th) };
  const u = { x: -Math.sin(ph) * Math.sin(th), y: Math.cos(ph), z: -Math.sin(ph) * Math.cos(th) };
  const { s, ox, oy } = cam;
  const P = (x, y, z) => ({ x: ox + s * (x * r.x + z * r.z), y: oy - s * (x * u.x + y * u.y + z * u.z) });
  const unproject = (sx, sy) => { const a = (sx - ox) / s, b = -(sy - oy) / s; return { x: a * r.x + b * u.x, y: b * u.y, z: a * r.z + b * u.z }; };
  const step = (d) => { const [dx, dz] = DIRS[d]; return { x: s * (dx * r.x + dz * r.z), y: -s * (dx * u.x + dz * u.z) }; };
  return { cam, c, r, u, s, P, unproject, step, V: s * u.y };
}

const ck = (x, y, z) => (y + 1) * 256 + x * 16 + z;
export const cellKey = ck;

export function containerCells(c) {
  const out = [];
  for (let t = 0; t < c.len; t++) out.push([c.x + (c.axis === 'x' ? t : 0), c.z + (c.axis === 'z' ? t : 0)]);
  return out;
}

const LEVELS = 8;
export function buildWorld(rd, red = null) {
  const { gx, gz } = rd;
  const own = new Int16Array(gx * gz * LEVELS).fill(-1), objs = [];
  const at = (x, y, z) => (x >= 0 && z >= 0 && x < gx && z < gz && y >= 0 && y < LEVELS ? (y * gz + z) * gx + x : -1);
  const add = (o, x0, z0, y, len, axis) => {
    o.id = objs.length; objs.push(o);
    for (let t = 0; t < len; t++) { const q = at(axis === 'x' ? x0 + t : x0, y, axis === 'z' ? z0 + t : z0); if (q >= 0) own[q] = o.id; }
  };
  for (const c of rd.cons) add({ kind: 'con', col: c.col, axis: c.axis, box: { x0: c.x, x1: c.x + (c.axis === 'x' ? c.len : 1), y0: c.y, y1: c.y + 1, z0: c.z, z1: c.z + (c.axis === 'z' ? c.len : 1) } }, c.x, c.z, c.y, c.len, c.axis);
  for (const k of rd.crates) add({ kind: 'crate', box: { x0: k.x, x1: k.x + 1, y0: k.y, y1: k.y + 1, z0: k.z, z1: k.z + 1 } }, k.x, k.z, k.y, 1, 'x');
  const H = Array.from({ length: gx }, () => new Array(gz).fill(0));
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) { let h = 0; while (h < LEVELS && own[at(x, h, z)] >= 0) h++; H[x][z] = h; }
  if (red) {
    const y = H[red.x][red.z];
    add({ kind: 'red', box: { x0: red.x, x1: red.x + 1, y0: y, y1: y + 1, z0: red.z, z1: red.z + 1 } }, red.x, red.z, y, 1, 'x');
    H[red.x][red.z] = y + 1;
  }
  let maxH = 0;
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) maxH = Math.max(maxH, H[x][z]);
  const ownerAt = (x, y, z) => { const q = at(x, y, z); return q >= 0 && own[q] >= 0 ? objs[own[q]] : undefined; };
  return { gx, gz, H, objs, maxH, ownerAt };
}

export function yardProblems(rd) {
  const out = [];
  const { gx, gz } = rd;
  if (!Number.isInteger(gx) || !Number.isInteger(gz) || gx < 4 || gz < 4 || gx > 7 || gz > 7) return ['grid'];
  const seen = new Set();
  const cell = (x, y, z, what) => {
    if (![x, y, z].every(Number.isInteger) || x < 0 || z < 0 || x >= gx || z >= gz || y < 0 || y > 4) { out.push(what + '-bounds'); return; }
    const k = ck(x, y, z);
    if (seen.has(k)) out.push(what + '-overlap');
    seen.add(k);
  };
  if (!Array.isArray(rd.cons) || !Array.isArray(rd.crates)) return ['lists'];
  for (const c of rd.cons) {
    if (!c || !['x', 'z'].includes(c.axis) || ![2, 3, 4].includes(c.len) || !Number.isInteger(c.col) || c.col < 0 || c.col > 5) { out.push('container'); continue; }
    for (const [x, z] of containerCells(c)) cell(x, c.y, z, 'con');
  }
  for (const k of rd.crates) cell(k.x, k.y, k.z, 'crate');
  if (out.length) return out;
  for (const k of seen) {
    const y = Math.floor(k / 256) - 1;
    if (y > 0 && !seen.has(k - 256)) { out.push('overhang'); break; }
  }
  const crateAt = new Set(rd.crates.map((k) => ck(k.x, k.y, k.z)));
  if (rd.crates.some((k) => k.y > 0 && crateAt.has(ck(k.x, k.y - 1, k.z)))) out.push('crate-on-crate');
  return out;
}

export function simulate(rd, W0 = buildWorld(rd)) {
  let x = rd.red.x, z = rd.red.z, h = W0.H[x][z];
  const steps = [{ x, z, h, drop: 0, blocked: false }];
  for (const p of rd.pushes) {
    const d = DIRS[p];
    if (!d) return { ok: false, why: 'dir' };
    const nx = x + d[0], nz = z + d[1];
    if (nx < 0 || nz < 0 || nx >= W0.gx || nz >= W0.gz) return { ok: false, why: 'off-yard' };
    const nh = W0.H[nx][nz];
    if (nh > h) { steps.push({ x, z, h, drop: 0, blocked: true, wall: { x: nx, z: nz, h: nh } }); continue; }
    steps.push({ x: nx, z: nz, h: nh, drop: h - nh, blocked: false });
    x = nx; z = nz; h = nh;
  }
  return { ok: true, steps, end: steps[steps.length - 1] };
}

export function arrowSquares(rd) {
  const out = [{ x: rd.red.x, z: rd.red.z }];
  for (const p of rd.pushes) { const d = DIRS[p], q = out[out.length - 1]; out.push({ x: q.x + d[0], z: q.z + d[1] }); }
  return out;
}

export function castRay(W, O, sx, sy) {
  const c = O.c, r = O.r, u = O.u, a = (sx - O.cam.ox) / O.s, b = -(sy - O.cam.oy) / O.s;
  const top = W.maxH + 1;
  const t0 = (top - b * u.y) / c.y;
  const px = a * r.x + b * u.x + c.x * t0, py = top, pz = a * r.z + b * u.z + c.z * t0;
  let i = Math.floor(px), j = Math.floor(py), k = Math.floor(pz);
  const tdx = 1 / c.x, tdy = 1 / c.y, tdz = 1 / c.z;
  let tx = (px - i) * tdx, ty = (py - j) * tdy, tz = (pz - k) * tdz;
  for (let n = 0; n < 256; n++) {
    let face, t;
    if (tx <= ty && tx <= tz) { i--; t = tx; tx += tdx; face = 'x'; }
    else if (ty <= tz) { j--; t = ty; ty += tdy; face = 'y'; }
    else { k--; t = tz; tz += tdz; face = 'z'; }
    if (i < 0 || k < 0 || j < -1) return NONE;
    if (i >= W.gx || k >= W.gz) continue;
    if (j >= 0) {
      if (j < W.H[i][k]) return face === 'y' ? { kind: 'top', i, k } : { kind: 'side', face, i, j, k };
      continue;
    }
    if (face === 'y') return { kind: 'top', i, k };
    return py - c.y * t >= -SLAB ? { kind: 'slab', face, i, k } : NONE;
  }
  return NONE;
}
export const isTop = (h, i, k) => h.kind === 'top' && h.i === i && h.k === k;

export function topQuad(W, O, i, k) {
  const y = W.H[i][k];
  return [O.P(i, y, k), O.P(i + 1, y, k), O.P(i + 1, y, k + 1), O.P(i, y, k + 1)];
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function topVisibility(W, O, i, k, n = 9, withBest = true) {
  const y = W.H[i][k], quad = topQuad(W, O, i, k), S = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const q = O.P(i + (a + 0.5) / n, y, k + (b + 0.5) / n);
    S.push({ x: q.x, y: q.y, vis: isTop(castRay(W, O, q.x, q.y), i, k) });
  }
  const vis = S.filter((q) => q.vis), hidden = S.filter((q) => !q.vis);
  let best = null, bestC = -1;
  if (withBest) for (const q of vis) {
    let cl = Infinity;
    for (let e = 0; e < 4; e++) cl = Math.min(cl, segDist(q, quad[e], quad[(e + 1) % 4]));
    for (const h of hidden) cl = Math.min(cl, Math.hypot(q.x - h.x, q.y - h.y) - 2);
    if (cl > bestC + 1e-9) { bestC = cl; best = q; }
  }
  const cen = vis.length ? { x: vis.reduce((a, q) => a + q.x, 0) / vis.length, y: vis.reduce((a, q) => a + q.y, 0) / vis.length } : null;
  return { frac: vis.length / S.length, best, clearance: bestC, centroid: cen, quad };
}

const RING_DIRS = 12;
function ringHits(W, O, i, k, pt, radii) {
  for (const r of radii) for (let a = 0; a < RING_DIRS; a++) {
    const t = (a / RING_DIRS) * Math.PI * 2;
    if (isTop(castRay(W, O, pt.x + r * Math.cos(t), pt.y + r * Math.sin(t)), i, k)) return true;
  }
  return false;
}
export function diskOnTop(W, O, i, k, pt, r) {
  if (!isTop(castRay(W, O, pt.x, pt.y), i, k)) return false;
  for (const rr of [r / 2, r]) for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    if (!isTop(castRay(W, O, pt.x + rr * Math.cos(t), pt.y + rr * Math.sin(t)), i, k)) return false;
  }
  return true;
}

export function clickHits(W, O, i, k, pt, tol) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return false;
  const h = castRay(W, O, pt.x, pt.y);
  if (isTop(h, i, k)) return true;
  if (h.kind === 'top') return false;
  return ringHits(W, O, i, k, pt, [tol / 2, tol]);
}
export function clearOf(W, O, i, k, pt, r) {
  if (isTop(castRay(W, O, pt.x, pt.y), i, k)) return false;
  const radii = [];
  for (let q = 3; q <= r + 1e-9; q += 3) radii.push(q);
  return !ringHits(W, O, i, k, pt, radii);
}

export function firstTopBelow(W, O, p, yMax) {
  for (let y = Math.ceil(p.y); y <= yMax; y += 1) {
    const h = castRay(W, O, p.x, y);
    if (h.kind === 'top') return { i: h.i, k: h.k, y };
  }
  return null;
}
export function firstTopAbove(W, O, p, yMin) {
  for (let y = Math.floor(p.y); y >= yMin; y -= 1) {
    const h = castRay(W, O, p.x, y);
    if (h.kind === 'top') return { i: h.i, k: h.k, y };
  }
  return null;
}
