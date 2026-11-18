import * as RT from './_house_headcount_rt.js';
import { bodyJoints, personShapes } from './_house_headcount_scene.js';
export { RT, bodyJoints };

export const VIEW = { w: 380, h: 384 };
const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const ID = { prop: (i) => 10 + i, person: (i) => 100 + i };
export const personIndex = (id) => (id >= 100 && id < 200 ? id - 100 : -1);

export const RED = '#c8372d';
export const COLORS = [
  { name: 'blue', hex: '#2f5fb8' }, { name: 'green', hex: '#2f8f46' }, { name: 'yellow', hex: '#e2b822' },
  { name: 'purple', hex: '#7a4bb0' }, { name: 'white', hex: '#eeeae2' }, { name: 'black', hex: '#26262b' },
  { name: 'light blue', hex: '#7cbbe8' }, { name: 'khaki', hex: '#a99a6a' },
];
export const BOTTOMS = ['#34405a', '#2a2a2e', '#6b6e74', '#5a4636', '#3f5a3c', '#48505c'];
export const HAIRS = ['#2a1f1a', '#5a3a22', '#a8743a', '#d6bd86', '#8c8c8c', '#141414'];
export const SKINS = ['#e8c4a8', '#d4a07a', '#a8704a', '#7a4a2e', '#f0d0b8'];
export const PAVING = [
  { a: '#b9b4aa', b: '#a59f94', j: '#7d776d' },
  { a: '#cdbb9a', b: '#b9a684', j: '#8a7a5e' },
  { a: '#b7978a', b: '#a1826f', j: '#73594c' },
  { a: '#9ea3a6', b: '#8b9094', j: '#62676b' },
];

function bisect(arr, key, v) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0][key]) return 0;
  if (v >= arr[hi][key]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid][key] <= v) lo = mid; else hi = mid; }
  return lo;
}
export function sOf(tv, t) {
  if (t <= tv[0][0]) return tv[0][1];
  const n = tv.length;
  if (t >= tv[n - 1][0]) return tv[n - 1][1];
  const i = bisect(tv, 0, t), a = tv[i], b = tv[i + 1];
  return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0] || 1);
}
export function ptAt(pts, s) {
  const n = pts.length;
  if (s <= pts[0][2]) return [pts[0][0], pts[0][1], pts[0][3]];
  if (s >= pts[n - 1][2]) return [pts[n - 1][0], pts[n - 1][1], pts[n - 1][3]];
  const i = bisect(pts, 2, s), a = pts[i], b = pts[i + 1], u = (s - a[2]) / (b[2] - a[2] || 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[3] + (b[3] - a[3]) * u];
}
export function dirAt(pts, s, e = 0.25) {
  const a = ptAt(pts, s - e), b = ptAt(pts, s + e);
  let dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  if (l < 1e-6) {
    const n = pts.length, i = s <= pts[0][2] ? 0 : Math.min(n - 2, bisect(pts, 2, s));
    dx = pts[i + 1][0] - pts[i][0]; dz = pts[i + 1][1] - pts[i][1]; l = Math.hypot(dx, dz) || 1;
  }
  return [dx / l, dz / l];
}
export function poseAt(p, t) {
  const mv = p.mv, s = sOf(mv.tv, t), q = ptAt(mv.pts, s);
  const h = 0.06, d0 = ptAt(mv.pts, sOf(mv.tv, t - h))[2], d1 = ptAt(mv.pts, sOf(mv.tv, t + h))[2];
  const speed = Math.abs(d1 - d0) / (2 * h);
  let f = dirAt(mv.pts, s);
  if (mv.fin && t >= mv.fin.t0) {
    const u = smooth((t - mv.fin.t0) / (mv.fin.t1 - mv.fin.t0)), a = mv.fin.a0 + (mv.fin.a1 - mv.fin.a0) * u;
    f = [Math.cos(a), Math.sin(a)];
  }
  const walking = clamp01(speed / 0.75);
  return { x: q[0], z: q[1], f, k: p.k, walking, gait: 2 * Math.PI * q[2] / (1.32 * p.k) + (p.ph || 0), speed, moving: speed > 0.05 };
}
export const headingAngle = (f) => Math.atan2(f[1], f[0]);

function plantTex(hex) {
  const A = RT.lin(hex), B = A.map((v) => v * 0.55);
  return (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 9 + z * 3, y * 9 - z * 5, 3); RT.mixInto(out, B, A, 0.25 + 0.9 * n); };
}
function woodTex(a, b) {
  const A = RT.lin(a), B = RT.lin(b);
  return (x, y, z, nx, ny, nz, s, out) => { const g = RT.fbm(x * 2 + z * 2, y * 30, 2); RT.mixInto(out, A, B, 0.3 + 0.5 * g); };
}
const MATS = new WeakMap();
export function sceneMats(m) {
  let c = MATS.get(m);
  if (c && c.P.length === m.people.length) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const M = {
    metal: at({ c: RT.lin('#3b4046'), ks: 0.3, sh: 40 }),
    metalL: at({ c: RT.lin('#8e959c'), ks: 0.35, sh: 40 }),
    lampG: at({ c: RT.lin('#f2eedf'), ks: 0.4, sh: 50 }),
    wood: at({ c: RT.lin('#8a5d3a'), ks: 0.06, sh: 12, tex: woodTex('#9a6a44', '#6e4a2c') }),
    stone: at({ c: RT.lin('#c9c4ba'), ks: 0.03, sh: 8 }),
    soil: at({ c: RT.lin('#4a3a2c'), ks: 0.02, sh: 6 }),
    leaf: at({ c: RT.lin('#4f7a3a'), ks: 0.03, sh: 8, tex: plantTex('#4f7a3a') }),
    bin: at({ c: RT.lin('#3f5a46'), ks: 0.12, sh: 24 }),
  };
  const P = m.people.map((p) => ({
    skin: at({ c: RT.lin(p.skin), ks: 0.06, sh: 14 }), hair: at({ c: RT.lin(p.hair), ks: 0.08, sh: 16 }),
    top: at({ c: RT.lin(p.top), ks: 0.04, sh: 8 }), bottom: at({ c: RT.lin(p.bottom), ks: 0.04, sh: 8 }), shoe: at({ c: RT.lin(p.shoe || '#2a2624'), ks: 0.1, sh: 20 }),
  }));
  c = { mats, M, P, env: groundEnv(m), light: lightOf(m) };
  MATS.set(m, c);
  return c;
}

function groundEnv(m) {
  const G = m.ground, A = RT.lin(G.a), B = RT.lin(G.b), J = RT.lin(G.j), D = A.map((v) => v * 0.8);
  const ca = Math.cos(G.rot), sa = Math.sin(G.rot), T = G.tile;
  const floor = (x, z, fp, out) => {
    const u = x * ca + z * sa, v = -x * sa + z * ca;
    const iv = Math.floor(v / T), uo = G.bond && (iv & 1) ? u + T / 2 : u, iu = Math.floor(uo / T);
    const t = RT.hash2(iu + 7, iv + 13), n = RT.fbm(x * 1.6, z * 1.6, 3, fp * 1.6), n2 = RT.fbm(x * 11, z * 11, 2, fp * 11);
    RT.mixInto(out, A, B, 0.12 + 0.55 * t + 0.2 * n + 0.13 * n2);
    if (G.band && (((iu % G.band) + G.band) % G.band === 0 || ((iv % G.band) + G.band) % G.band === 0)) RT.mixInto(out, out, D, 0.55);
    const gr = Math.max(RT.lineMask(uo, T, 0.011, fp), RT.lineMask(v, T, 0.011, fp));
    RT.mixInto(out, out, J, 0.75 * gr);
  };
  return { floorY: 0, floor, floorMat: { ks: 0.03, sh: 10 }, sky: RT.softSky };
}
function lightOf(m) {
  const S = m.sun, a = S.az * DEG, e = S.el * DEG;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.12, 1.07, 0.98], soft: 0.05,
    sky: [0.5, 0.52, 0.56], ground: [0.22, 0.22, 0.2], fill: { dir: [-Math.sin(a), 0.4, -Math.cos(a)], col: [0.1, 0.1, 0.12] },
    aoK: 0, contact: 0.3, contactH: 0.05,
  };
}
export const sunDir = (m) => norm3(lightOf(m).dir);

export const PROP_R = { bench: 1.0, planter: 0.6, lamp: 0.3, bollard: 0.2, bin: 0.35 };
export const PROP_H = { bench: 0.85, planter: 1.15, lamp: 3.4, bollard: 0.8, bin: 0.9 };
export function propShapes(out, id, P, M) {
  const S = RT.shape, x = P.x, z = P.z, a = (P.yaw || 0) * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const at = (u, v) => [x + u * ca - v * sa, z + u * sa + v * ca];
  if (P.kind === 'bench') {
    const c = at(0, 0); out.push(S.box(id, M.wood, c[0], 0.43, c[1], 0.8, 0.03, 0.22, -P.yaw || 0, 0.01));
    const b = at(0, -0.2); out.push(S.box(id, M.wood, b[0], 0.68, b[1], 0.8, 0.12, 0.025, -P.yaw || 0, 0.01));
    for (const u of [-0.68, 0.68]) for (const v of [-0.15, 0.15]) { const q = at(u, v); out.push(S.box(id, M.metal, q[0], 0.2, q[1], 0.03, 0.2, 0.03, -P.yaw || 0)); }
  } else if (P.kind === 'planter') {
    out.push(S.cyl(id, M.stone, x, z, 0, 0.5, 0.5, 0.02));
    out.push(S.cyl(id, M.soil, x, z, 0.5, 0.52, 0.45));
    out.push(S.sphere(id, M.leaf, x, 0.82, z, 0.42)); out.push(S.sphere(id, M.leaf, x + 0.18, 0.7, z - 0.1, 0.3)); out.push(S.sphere(id, M.leaf, x - 0.15, 0.72, z + 0.14, 0.3));
  } else if (P.kind === 'lamp') {
    out.push(S.cyl(id, M.metal, x, z, 0, 0.25, 0.12, 0.02));
    out.push(S.cyl(id, M.metal, x, z, 0.25, 3.2, 0.05));
    out.push(S.sphere(id, M.lampG, x, 3.35, z, 0.17));
  } else if (P.kind === 'bollard') {
    out.push(S.cyl(id, M.metalL, x, z, 0, 0.76, 0.1, 0.02)); out.push(S.sphere(id, M.metalL, x, 0.76, z, 0.1));
  } else if (P.kind === 'bin') {
    out.push(S.cyl(id, M.bin, x, z, 0, 0.86, 0.26, 0.02)); out.push(S.cyl(id, M.metal, x, z, 0.86, 0.9, 0.28));
  }
}

export function camOf(C) {
  return RT.orbitCam({ az: C.az, el: C.el, dist: C.dist, fov: C.fov, tx: C.target[0], ty: C.target[1], tz: C.target[2] }, VIEW.w, VIEW.h);
}
const CAMS = new WeakMap();
export function cam(m) { let c = CAMS.get(m); if (!c) { c = camOf(m.cam); CAMS.set(m, c); } return c; }
export function project(m, p) { const q = cam(m).project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }
export function camFwd(C) { const a = C.az * DEG; return [-Math.sin(a), -Math.cos(a)]; }

const STATIC = new WeakMap();
function staticShapes(m) {
  let s = STATIC.get(m);
  if (s) return s;
  const C = sceneMats(m), out = [];
  m.props.forEach((P, i) => propShapes(out, ID.prop(i), P, C.M));
  STATIC.set(m, out);
  return out;
}
export function sceneAt(m, t, opts = {}) {
  const C = sceneMats(m), shapes = staticShapes(m).slice(), poses = [];
  if (!opts.none) {
    m.people.forEach((p, i) => {
      if (opts.only && !opts.only.has(i)) return;
      const P = poseAt(p, t);
      personShapes(shapes, ID.person(i), bodyJoints(P), C.P[i]);
      poses.push([i, P]);
    });
  }
  const sc = RT.makeScene({ cam: cam(m), shapes, mats: C.mats, light: C.light, env: C.env, exposure: 1.0 });
  sc.poses = poses;
  return sc;
}
export const staticScene = (m) => sceneAt(m, 0, { none: true });

export function personScreenBox(m, x, z, k = 1, pad = 0.34, shadow = true) {
  const L = sunDir(m), h = 1.92 * k, pts = [];
  for (const dx of [-pad, pad]) for (const dz of [-pad, pad]) {
    pts.push([x + dx, 0, z + dz], [x + dx, h, z + dz]);
    if (!shadow) continue;
    pts.push([x + dx - L[0] * h / L[1], 0, z + dz - L[2] * h / L[1]]);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = project(m, p); if (!(q[2] > 0.1)) continue; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}
export function bodyBox(m, x, z, k = 1) {
  const c = cam(m), R = c.R, top = 1.76 * k, wd = 0.23 * k;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of [-1, 1]) for (const y of [0, top]) {
    const q = c.project(x + R[0] * wd * s, y, z + R[2] * wd * s);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return [x0, y0, x1, y1];
}
