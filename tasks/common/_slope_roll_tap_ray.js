const EPS = 1e-4;
const INF = 1e30;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lin = (c) => [Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)];

export function hash2(ix, iy) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct, fp = 0) {
  let s = 0, amp = 0.5, f = 1, nrm = 0;
  for (let o = 0; o < oct; o++) {
    const w = Math.max(0, Math.min(1, 1.6 - 2.2 * fp * f));
    s += amp * (0.5 + w * (vnoise(x * f + o * 17.31, y * f - o * 11.17) - 0.5));
    nrm += amp; amp *= 0.5; f *= 2;
  }
  return s / nrm;
}

export function lookAt({ eye, target, up = [0, 1, 0], fovY = 40, W, H, cx = W / 2, cy = H / 2 }) {
  const f = norm(sub(target, eye));
  const r = norm(cross(f, up));
  const u = cross(r, f);
  const focal = (H / 2) / Math.tan(fovY * Math.PI / 360);
  return {
    eye, f, r, u, focal, cx, cy, W, H,
    project(p) {
      const d = sub(p, eye), z = dot(d, f);
      return [cx + focal * dot(d, r) / z, cy - focal * dot(d, u) / z, z];
    },
    dir(x, y) {
      const a = (x - cx) / focal, b = (y - cy) / focal;
      return norm([f[0] + a * r[0] - b * u[0], f[1] + a * r[1] - b * u[1], f[2] + a * r[2] - b * u[2]]);
    },
  };
}

export const prim = {
  sphere: (c, r, m, o, g = o) => ({ k: 0, c, r, m, o, g }),
  capsule: (a, b, r, m, o, g = o) => ({ k: 1, a, b, r, m, o, g }),
  cylinder: (a, b, r, m, o, g = o) => ({ k: 2, a, b, r, m, o, g }),
  box: (c, ax, h, m, o, g = o) => ({ k: 4, c, ax, h, m, o, g }),
  rbox: (c, ax, h, rr, m, o, g = o) => ({ k: 5, c, ax, h, rr, m, o, g }),
};

export function aabb(p) {
  if (p.k === 0) return [sub(p.c, [p.r, p.r, p.r]), add(p.c, [p.r, p.r, p.r])];
  if (p.k === 1 || p.k === 2) {
    const r = p.r;
    return [[Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r],
      [Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r]];
  }
  const h = p.h;
  const e = [0, 1, 2].map((i) => Math.abs(p.ax[0][i]) * h[0] + Math.abs(p.ax[1][i]) * h[1] + Math.abs(p.ax[2][i]) * h[2]);
  return [sub(p.c, e), add(p.c, e)];
}

const HN = [0, 0, 1];

function hitSphere(cx, cy, cz, r, ox, oy, oz, dx, dy, dz, tmax, wantN) {
  const x = ox - cx, y = oy - cy, z = oz - cz;
  const b = x * dx + y * dy + z * dz, c = x * x + y * y + z * z - r * r;
  const disc = b * b - c;
  if (disc < 0) return INF;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t <= EPS) t = -b + s;
  if (t <= EPS || t >= tmax) return INF;
  if (wantN) { HN[0] = (x + t * dx) / r; HN[1] = (y + t * dy) / r; HN[2] = (z + t * dz) / r; }
  return t;
}

function hitCapsule(p, ox, oy, oz, dx, dy, dz, tmax, wantN, caps) {
  const ax = p.a[0], ay = p.a[1], az = p.a[2];
  let ux = p.b[0] - ax, uy = p.b[1] - ay, uz = p.b[2] - az;
  const L = Math.hypot(ux, uy, uz);
  if (L < 1e-9) return caps ? hitSphere(ax, ay, az, p.r, ox, oy, oz, dx, dy, dz, tmax, wantN) : INF;
  ux /= L; uy /= L; uz /= L;
  const r = p.r, r2 = r * r;
  const mx0 = ox - ax, my0 = oy - ay, mz0 = oz - az;
  const h = mx0 * ux + my0 * uy + mz0 * uz, v = dx * ux + dy * uy + dz * uz;
  const mx = mx0 - h * ux, my = my0 - h * uy, mz = mz0 - h * uz;
  const rx = dx - v * ux, ry = dy - v * uy, rz = dz - v * uz;
  const A = rx * rx + ry * ry + rz * rz, B = 2 * (mx * rx + my * ry + mz * rz), C = mx * mx + my * my + mz * mz - r2;
  let best = tmax, nx = 0, ny = 0, nz = 0;
  if (A > 1e-14) {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (let k = 0; k < 2; k++) {
        const t = (-B + (k ? sq : -sq)) / (2 * A);
        const hh = h + t * v;
        if (t > EPS && t < best && hh >= 0 && hh <= L) {
          best = t;
          nx = (mx + t * rx) / r; ny = (my + t * ry) / r; nz = (mz + t * rz) / r;
          break;
        }
      }
    }
  }
  if (caps) {
    for (let k = 0; k < 2; k++) {
      const c = k ? p.b : p.a;
      const t = hitSphere(c[0], c[1], c[2], r, ox, oy, oz, dx, dy, dz, best, true);
      if (t < best) { best = t; nx = HN[0]; ny = HN[1]; nz = HN[2]; }
    }
  } else if (Math.abs(v) > 1e-12) {
    for (let k = 0; k < 2; k++) {
      const t = ((k ? L : 0) - h) / v;
      if (t <= EPS || t >= best) continue;
      const x = mx + t * rx, y = my + t * ry, z = mz + t * rz;
      if (x * x + y * y + z * z <= r2) { best = t; const s = k ? 1 : -1; nx = s * ux; ny = s * uy; nz = s * uz; }
    }
  }
  if (best >= tmax) return INF;
  if (wantN) { HN[0] = nx; HN[1] = ny; HN[2] = nz; }
  return best;
}

let _ba = 0, _bs = 1;
function slab(o0, o1, o2, d0, d1, d2, hx, hy, hz, tmax) {
  let tn = -INF, tf = tmax, ax = -1, sg = 0;
  const o = [o0, o1, o2], d = [d0, d1, d2], hh = [hx, hy, hz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-14) { if (o[a] < -hh[a] || o[a] > hh[a]) return INF; continue; }
    let t1 = (-hh[a] - o[a]) / d[a], t2 = (hh[a] - o[a]) / d[a], s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tn) { tn = t1; ax = a; sg = s; }
    if (t2 < tf) tf = t2;
    if (tn > tf) return INF;
  }
  if (tn <= EPS || ax < 0) return INF;
  _ba = ax; _bs = sg;
  return tn;
}
function lcyl(o, d, a, c, hl, r, tmax) {
  const i = (a + 1) % 3, j = (a + 2) % 3;
  const mx = o[i] - c[i], my = o[j] - c[j], rx = d[i], ry = d[j];
  const A = rx * rx + ry * ry;
  if (A < 1e-14) return INF;
  const B = 2 * (mx * rx + my * ry), C = mx * mx + my * my - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return INF;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t <= EPS || t >= tmax) return INF;
  const s = o[a] + t * d[a] - c[a];
  if (s < -hl || s > hl) return INF;
  return t;
}
function hitBox(p, ox, oy, oz, dx, dy, dz, tmax, wantN, rounded) {
  const e0 = p.ax[0], e1 = p.ax[1], e2 = p.ax[2];
  const qx = ox - p.c[0], qy = oy - p.c[1], qz = oz - p.c[2];
  const o = [qx * e0[0] + qy * e0[1] + qz * e0[2], qx * e1[0] + qy * e1[1] + qz * e1[2], qx * e2[0] + qy * e2[1] + qz * e2[2]];
  const d = [dx * e0[0] + dy * e0[1] + dz * e0[2], dx * e1[0] + dy * e1[1] + dz * e1[2], dx * e2[0] + dy * e2[1] + dz * e2[2]];
  const h = p.h;
  let t = slab(o[0], o[1], o[2], d[0], d[1], d[2], h[0], h[1], h[2], tmax);
  if (t >= INF) return INF;
  let n0 = 0, n1 = 0, n2 = 0;
  if (!rounded) {
    if (_ba === 0) n0 = _bs; else if (_ba === 1) n1 = _bs; else n2 = _bs;
  } else {
    const rr = p.rr, e = [h[0] - rr, h[1] - rr, h[2] - rr];
    let best = tmax;
    for (let a = 0; a < 3; a++) {
      const hh = [e[0], e[1], e[2]]; hh[a] += rr;
      const tt = slab(o[0], o[1], o[2], d[0], d[1], d[2], hh[0], hh[1], hh[2], best);
      if (tt < best) { best = tt; n0 = n1 = n2 = 0; if (_ba === 0) n0 = _bs; else if (_ba === 1) n1 = _bs; else n2 = _bs; }
    }
    for (let a = 0; a < 3; a++) {
      const i = (a + 1) % 3, j = (a + 2) % 3;
      for (let si = -1; si <= 1; si += 2) for (let sj = -1; sj <= 1; sj += 2) {
        const c = [0, 0, 0]; c[i] = si * e[i]; c[j] = sj * e[j];
        const tt = lcyl(o, d, a, c, e[a], rr, best);
        if (tt < best) {
          best = tt;
          const pl = [o[0] + tt * d[0] - c[0], o[1] + tt * d[1] - c[1], o[2] + tt * d[2] - c[2]]; pl[a] = 0;
          n0 = pl[0] / rr; n1 = pl[1] / rr; n2 = pl[2] / rr;
        }
      }
    }
    for (let k = 0; k < 8; k++) {
      const c0 = (k & 1 ? 1 : -1) * e[0], c1 = (k & 2 ? 1 : -1) * e[1], c2 = (k & 4 ? 1 : -1) * e[2];
      const tt = hitSphere(c0, c1, c2, rr, o[0], o[1], o[2], d[0], d[1], d[2], best, true);
      if (tt < best) { best = tt; n0 = HN[0]; n1 = HN[1]; n2 = HN[2]; }
    }
    if (best >= tmax) return INF;
    t = best;
  }
  if (wantN) {
    HN[0] = n0 * e0[0] + n1 * e1[0] + n2 * e2[0];
    HN[1] = n0 * e0[1] + n1 * e1[1] + n2 * e2[1];
    HN[2] = n0 * e0[2] + n1 * e1[2] + n2 * e2[2];
  }
  return t;
}
export function intersect(p, ox, oy, oz, dx, dy, dz, tmax, wantN) {
  switch (p.k) {
    case 0: return hitSphere(p.c[0], p.c[1], p.c[2], p.r, ox, oy, oz, dx, dy, dz, tmax, wantN);
    case 1: return hitCapsule(p, ox, oy, oz, dx, dy, dz, tmax, wantN, true);
    case 2: return hitCapsule(p, ox, oy, oz, dx, dy, dz, tmax, wantN, false);
    case 4: return hitBox(p, ox, oy, oz, dx, dy, dz, tmax, wantN, false);
    default: return hitBox(p, ox, oy, oz, dx, dy, dz, tmax, wantN, true);
  }
}
function bsMiss(b, ox, oy, oz, dx, dy, dz) {
  const lx = b[0] - ox, ly = b[1] - oy, lz = b[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz, r = b[3];
  if (tc < -r) return true;
  return lx * lx + ly * ly + lz * lz - tc * tc > r * r;
}

const TS = 16;
export function buildIndex(prims, cam) {
  const W = cam.W, H = cam.H, tw = Math.ceil(W / TS), th = Math.ceil(H / TS);
  const tiles = Array.from({ length: tw * th }, () => []);
  const boxes = prims.map(aabb);
  for (let i = 0; i < prims.length; i++) {
    const [lo, hi] = boxes[i];
    let x0 = INF, x1 = -INF, y0 = INF, y1 = -INF, behind = false;
    for (let c = 0; c < 8; c++) {
      const q = cam.project([c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]]);
      if (q[2] < 0.05) { behind = true; break; }
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    const X0 = behind ? 0 : Math.max(0, Math.floor((x0 - 2) / TS)), X1 = behind ? tw - 1 : Math.min(tw - 1, Math.floor((x1 + 2) / TS));
    const Y0 = behind ? 0 : Math.max(0, Math.floor((y0 - 2) / TS)), Y1 = behind ? th - 1 : Math.min(th - 1, Math.floor((y1 + 2) / TS));
    for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) tiles[ty * tw + tx].push(i);
  }
  const bsOf = ([lo, hi]) => [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 1e-6];
  const pbs = boxes.map(bsOf);
  const byObj = new Map();
  prims.forEach((p, i) => { if (!byObj.has(p.o)) byObj.set(p.o, []); byObj.get(p.o).push(i); });
  const groups = [];
  for (const [o, list] of byObj) {
    const lo = [INF, INF, INF], hi = [-INF, -INF, -INF];
    for (const i of list) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], boxes[i][0][k]); hi[k] = Math.max(hi[k], boxes[i][1][k]); }
    groups.push({ o, bs: bsOf([lo, hi]), list });
  }
  const occ = [];
  prims.forEach((p, i) => {
    if (p.noAO) return;
    const [lo, hi] = boxes[i];
    const hx = (hi[0] - lo[0]) / 2, hy = (hi[1] - lo[1]) / 2, hz = (hi[2] - lo[2]) / 2;
    const r = p.k === 0 ? p.r : Math.cbrt(Math.max(1e-9, hx * hy * hz)) * 1.05;
    occ.push([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, r, p.o]);
  });
  return { prims, cam, tiles, tw, th, boxes, pbs, groups, occ };
}
function tileList(ix, x, y) {
  const tx = Math.min(ix.tw - 1, Math.max(0, Math.floor(x / TS))), ty = Math.min(ix.th - 1, Math.max(0, Math.floor(y / TS)));
  return ix.tiles[ty * ix.tw + tx];
}
export function castPixel(ix, x, y) {
  const cam = ix.cam, d = cam.dir(x, y), e = cam.eye;
  let best = INF, hit = -1;
  for (const i of tileList(ix, x, y)) {
    const t = intersect(ix.prims[i], e[0], e[1], e[2], d[0], d[1], d[2], best, false);
    if (t < best) { best = t; hit = i; }
  }
  if (d[1] < -1e-9) { const t = -e[1] / d[1]; if (t > EPS && t < best) { best = t; hit = -2; } }
  return { t: best, i: hit };
}
export function pickObj(ix, x, y) {
  const h = castPixel(ix, x, y);
  return h.i >= 0 ? ix.prims[h.i].o : h.i;
}
export function pointVisible(ix, P, tol = 2e-3) {
  const cam = ix.cam, q = cam.project(P);
  if (q[2] <= 0) return false;
  const e = cam.eye, d = norm(sub(P, e)), dist = Math.hypot(P[0] - e[0], P[1] - e[1], P[2] - e[2]);
  for (const i of tileList(ix, q[0], q[1])) {
    if (intersect(ix.prims[i], e[0], e[1], e[2], d[0], d[1], d[2], dist - tol, false) < dist - tol) return false;
  }
  return true;
}
export function screenRects(ix, list) {
  return list.map((i) => {
    const [lo, hi] = ix.boxes[i];
    let x0 = INF, x1 = -INF, y0 = INF, y1 = -INF;
    for (let c = 0; c < 8; c++) {
      const q = ix.cam.project([c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]]);
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    return [i, x0 - 1, x1 + 1, y0 - 1, y1 + 1];
  });
}
export function hitsAny(ix, rects, x, y) {
  let d = null;
  const e = ix.cam.eye;
  for (const [i, x0, x1, y0, y1] of rects) {
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (!d) d = ix.cam.dir(x, y);
    if (intersect(ix.prims[i], e[0], e[1], e[2], d[0], d[1], d[2], INF, false) < INF) return true;
  }
  return false;
}

const NDISK = 24;
const DISK = Array.from({ length: NDISK }, (_, i) => { const r = Math.sqrt((i + 0.5) / NDISK), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });

export function render(scene, ix, q = 1) {
  const cam = ix.cam, W = cam.W, H = cam.H;
  const w = Math.max(1, Math.round(W * q)), h = Math.max(1, Math.round(H * q));
  const prims = ix.prims, groups = ix.groups, occ = ix.occ, pbs = ix.pbs;
  const Lt = scene.light;
  const L = norm(Lt.dir);
  const up0 = Math.abs(L[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const T1 = norm(cross(L, up0)), T2 = cross(L, T1);
  const soft = Math.tan(Lt.soft ?? 0.05);
  const fill = Lt.fill ? { dir: norm(Lt.fill.dir), col: Lt.fill.col } : null;
  const aoK = Lt.aoK ?? 1;
  const E = cam.eye, F = cam.f, Rt = cam.r, U = cam.u;
  const foc = cam.focal * q, ccx = cam.cx * q, ccy = cam.cy * q;
  const BASE = [0, 0, 0], ENV = [0, 0, 0];

  function shadowTrans(ox, oy, oz, dx, dy, dz) {
    for (let gi = 0; gi < groups.length; gi++) {
      const G = groups[gi];
      if (bsMiss(G.bs, ox, oy, oz, dx, dy, dz)) continue;
      const list = G.list;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (list.length > 1 && bsMiss(pbs[i], ox, oy, oz, dx, dy, dz)) continue;
        if (intersect(prims[i], ox, oy, oz, dx, dy, dz, INF, false) < INF) return 0;
      }
    }
    return 1;
  }
  function softShadow(ox, oy, oz, px, py) {
    const ign = (52.9829189 * ((0.06711056 * px + 0.00583715 * py) % 1)) % 1;
    const rot = ign * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const sample = (i) => {
      const u = (DISK[i][0] * cr - DISK[i][1] * sr) * soft, v = (DISK[i][0] * sr + DISK[i][1] * cr) * soft;
      let dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      return shadowTrans(ox, oy, oz, dx, dy, dz);
    };
    const a = sample(NDISK - 1), b = sample(NDISK - 3), c = sample(NDISK - 6);
    if (a === b && b === c) return a;
    let s = a + b + c;
    for (let i = 0; i < NDISK; i++) if (i !== NDISK - 1 && i !== NDISK - 3 && i !== NDISK - 6) s += sample(i);
    return s / NDISK;
  }
  function aoAt(x, y, z, nx, ny, nz, self) {
    let o = 0;
    for (let k = 0; k < occ.length; k++) {
      const P = occ[k];
      if (P[4] === self) continue;
      const vx = P[0] - x, vy = P[1] - y, vz = P[2] - z, d2 = vx * vx + vy * vy + vz * vz, r2 = P[3] * P[3];
      if (d2 > r2 * 30) continue;
      const d = Math.sqrt(d2), ndv = (nx * vx + ny * vy + nz * vz) / d;
      if (ndv <= 0) continue;
      o += ndv * Math.min(1, r2 / d2);
    }
    return Math.max(0.3, 1 - 0.6 * aoK * Math.min(1, o));
  }

  let sObj = -1, sG = -1, sDepth = INF;
  function trace(sx, sy, out) {
    let dx = F[0] + ((sx - ccx) / foc) * Rt[0] - ((sy - ccy) / foc) * U[0];
    let dy = F[1] + ((sx - ccx) / foc) * Rt[1] - ((sy - ccy) / foc) * U[1];
    let dz = F[2] + ((sx - ccx) / foc) * Rt[2] - ((sy - ccy) / foc) * U[2];
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const ox = E[0], oy = E[1], oz = E[2];
    let best = INF, hit = -1, nx = 0, ny = 0, nz = 0;
    for (const i of tileList(ix, sx / q, sy / q)) {
      const t = intersect(prims[i], ox, oy, oz, dx, dy, dz, best, true);
      if (t < best) { best = t; hit = i; nx = HN[0]; ny = HN[1]; nz = HN[2]; }
    }
    let table = false;
    if (dy < -1e-9) {
      const t = -oy / dy;
      if (t > EPS && t < best) { best = t; hit = -2; table = true; nx = 0; ny = 1; nz = 0; }
    }
    if (hit === -1) { out[0] = 0.8; out[1] = 0.82; out[2] = 0.85; sObj = -1; sG = -1; sDepth = INF; return; }
    const x = ox + best * dx, y = oy + best * dy, z = oz + best * dz;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    let base, m = null, self = -2;
    if (table) { scene.floor.color(x, z, best / cam.focal, BASE); base = BASE; }
    else {
      const p = prims[hit]; m = p.m; self = p.o;
      if (m.tex) { m.tex(x, y, z, nx, ny, nz, p, BASE, best / cam.focal); base = BASE; } else base = m.c;
    }
    const hemi = 0.5 + 0.5 * ny;
    let ar = Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi, ag = Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi, ab = Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi;
    const ao = aoAt(x, y, z, nx, ny, nz, self);
    ar *= ao; ag *= ao; ab *= ao;
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    let vis = 0;
    if (ndl > 0) vis = softShadow(x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3, sx, sy);
    const dif = Math.max(0, ndl) * vis;
    let r = base[0] * (ar + Lt.col[0] * dif), g = base[1] * (ag + Lt.col[1] * dif), b = base[2] * (ab + Lt.col[2] * dif);
    if (fill) {
      const fd = Math.max(0, nx * fill.dir[0] + ny * fill.dir[1] + nz * fill.dir[2]) * ao;
      r += base[0] * fill.col[0] * fd; g += base[1] * fill.col[1] * fd; b += base[2] * fill.col[2] * fd;
    }
    if (m && m.ks > 0 && vis > 0) {
      let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
      const sp = m.ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), m.sh || 16) * vis;
      r += Lt.col[0] * sp; g += Lt.col[1] * sp; b += Lt.col[2] * sp;
    }
    if (m && m.env > 0 && scene.env) {
      const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = m.env * (0.35 + 0.65 * Math.pow(1 - ndv, 3));
      const k2 = 2 * (nx * dx + ny * dy + nz * dz);
      scene.env(dx - k2 * nx, dy - k2 * ny, dz - k2 * nz, ENV);
      r = r * (1 - fr) + ENV[0] * fr * ao; g = g * (1 - fr) + ENV[1] * fr * ao; b = b * (1 - fr) + ENV[2] * fr * ao;
    }
    out[0] = r; out[1] = g; out[2] = b;
    sObj = table ? -2 : prims[hit].o;
    sG = table ? -2 : prims[hit].g;
    sDepth = best;
  }

  const col = new Float32Array(w * h * 3);
  const gid = new Int32Array(w * h);
  const obj = new Int16Array(w * h);
  const depth = new Float32Array(w * h);
  const tmp = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      trace(x + 0.5, y + 0.5, tmp);
      col[i * 3] = tmp[0]; col[i * 3 + 1] = tmp[1]; col[i * 3 + 2] = tmp[2];
      gid[i] = sG; obj[i] = sObj; depth[i] = sDepth;
    }
  }
  const offs = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const out = new Float32Array(col);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, id = gid[i];
      const edge = (x > 0 && gid[i - 1] !== id) || (x < w - 1 && gid[i + 1] !== id) || (y > 0 && gid[i - w] !== id) || (y < h - 1 && gid[i + w] !== id);
      if (!edge) continue;
      let r = 0, g = 0, b = 0;
      for (const [ax, ay] of offs) { trace(x + ax, y + ay, tmp); r += tmp[0]; g += tmp[1]; b += tmp[2]; }
      out[i * 3] = r / 4; out[i * 3 + 1] = g / 4; out[i * 3 + 2] = b / 4;
    }
  }
  const ol = scene.outline || { sil: 0.55, part: 0.22, depth: 0.03 };
  if (ol.sil > 0 || ol.part > 0) {
    const ink = scene.ink || [0.02, 0.018, 0.016];
    const wmul = q >= 2 ? 1 : 0.8;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, id = gid[i];
        let a = 0;
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          const jd = gid[j];
          if (jd === id || jd === -1) continue;
          const dd = depth[i] - depth[j];
          if (dd > ol.depth) a = Math.max(a, ol.sil);
          else if (dd > -ol.depth && jd > id && id !== -2 && jd !== -2) a = Math.max(a, ol.part);
        }
        if (a > 0) {
          a *= wmul;
          out[i * 3] += (ink[0] - out[i * 3]) * a; out[i * 3 + 1] += (ink[1] - out[i * 3 + 1]) * a; out[i * 3 + 2] += (ink[2] - out[i * 3 + 2]) * a;
        }
      }
    }
  }
  const expo = scene.exposure ?? 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      let v = out[i * 3 + c] * expo;
      v = v / (1 + 0.12 * v);
      data[i * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
    }
    data[i * 4 + 3] = 255;
  }
  return { data, w, h, q, obj };
}

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
export function objectRing(img, id, rgba = [25, 145, 250, 255], width = 2.5) {
  const { w, h, obj } = img, R = Math.max(1, Math.round(width * img.q));
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (obj[y * w + x] === id) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const data = new Uint8ClampedArray(w * h * 4);
  if (x1 >= 0) {
    for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y1 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(w - 1, x1 + R); x++) {
      const i = y * w + x;
      if (obj[i] === id) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && obj[yy * w + xx] === id) { near = true; break; }
      }
      if (near) { data[i * 4] = rgba[0]; data[i * 4 + 1] = rgba[1]; data[i * 4 + 2] = rgba[2]; data[i * 4 + 3] = rgba[3]; }
    }
  }
  return toCanvas({ data, w, h });
}
export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
