import { RT, mat } from './_f16_pick_kit.js';

export const VIEW = { w: 380, h: 310 };
export const G = 9.81, BALLR = 0.25, BASK = { r0: 0.45, r1: 0.56, h: 0.7 };
const DEG = Math.PI / 180;
export const LIGHT_DIR = (() => { const d = [-0.06, 1, 0.08], l = Math.hypot(...d); return d.map((v) => v / l); })();

export function camOf(m) {
  const a = m.cam.az * DEG, e = m.cam.el * DEG, D = m.cam.dist, T = m.cam.tgt;
  return RT.makeCam({ eye: [T[0] + D * Math.sin(a) * Math.cos(e), T[1] + D * Math.sin(e), T[2] + D * Math.cos(a) * Math.cos(e)], target: T, fovY: m.cam.fov, W: VIEW.w, H: VIEW.h });
}
const CAMS = new WeakMap();
export function camCached(m) { let c = CAMS.get(m); if (!c) { c = camOf(m); CAMS.set(m, c); } return c; }

export const ballAt = (m, t) => [m.p0[0] + m.v[0] * t, m.p0[1] + m.v[1] * t - 0.5 * G * t * t, m.p0[2] + m.v[2] * t];
export const flightTime = (m) => 2 * m.v[1] / G;
export const topTime = (m) => m.v[1] / G;
export const landing = (m) => { const t = flightTime(m), b = ballAt(m, t); return [b[0], 0, b[2]]; };
export const timeOf = (m, k) => k * m.dt;
export const groundShadow = (P) => [P[0] - LIGHT_DIR[0] / LIGHT_DIR[1] * P[1], 0, P[2] - LIGHT_DIR[2] / LIGHT_DIR[1] * P[1]];

export function wallBox(m) { return m.wall; }
export function shadowOnWall(m, P) {
  const Wl = m.wall; if (!Wl) return null;
  const d = [-LIGHT_DIR[0], -LIGHT_DIR[1], -LIGHT_DIR[2]];
  const ox = P[0] - Wl.x, oz = P[2] - Wl.z;
  const o = [ox * Wl.ux + oz * Wl.uz, P[1], -ox * Wl.uz + oz * Wl.ux], dd = [d[0] * Wl.ux + d[2] * Wl.uz, d[1], -d[0] * Wl.uz + d[2] * Wl.ux];
  const lo = [-Wl.hl, 0, -Wl.ht], hi = [Wl.hl, Wl.h, Wl.ht];
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let u0 = (lo[a] - o[a]) / dd[a], u1 = (hi[a] - o[a]) / dd[a]; if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return null;
  }
  return [P[0] + d[0] * t0, P[1] + d[1] * t0, P[2] + d[2] * t0];
}
export function shadowAt(m, k) {
  const B = ballAt(m, timeOf(m, k)), w = shadowOnWall(m, B);
  return w ? { p: w, onWall: true } : { p: groundShadow(B), onWall: false };
}

export function ballScreen(m, k) {
  const c = camCached(m), B = ballAt(m, timeOf(m, k)), S = shadowAt(m, k), q = c.project(B[0], B[1], B[2]), s = c.project(S.p[0], S.p[1], S.p[2]);
  return { x: q.x, y: q.y, size: 2 * BALLR * c.f / q.z, sx: s.x, sy: s.y, onWall: S.onWall, depth: q.z };
}
export function basketScreen(m, i) {
  const c = camCached(m), P = m.baskets[i], q = c.project(P[0], BASK.h, P[1]), b = c.project(P[0], 0, P[1]);
  return { x: q.x, y: q.y, gx: b.x, gy: b.y, size: Math.abs(b.y - q.y) * 1.0, w: 2 * BASK.r1 * c.f / q.z, depth: q.z };
}

const WICKER = [RT.lin('#c29658'), RT.lin('#9a6e3c'), RT.lin('#3a2a1a')];
const basketTex = (x, y, z, nx, ny, nz, s, out) => {
  const dx = x - s.cx, dz = z - s.cz, rho = Math.hypot(dx, dz);
  if (ny > 0.5) {
    const inner = rho < BASK.r1 - 0.075;
    const col = inner ? WICKER[2] : WICKER[0]; out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; return;
  }
  const a = Math.atan2(dz, dx), row = Math.floor(y / 0.055), w = Math.sin(a * 11 + row * Math.PI) * 0.5 + 0.5;
  const t = (row % 2 ? w : 1 - w) * 0.8 + 0.1, band = (y > BASK.h - 0.07) ? 0.3 : 0;
  out[0] = WICKER[0][0] + (WICKER[1][0] - WICKER[0][0]) * (t + band); out[1] = WICKER[0][1] + (WICKER[1][1] - WICKER[0][1]) * (t + band); out[2] = WICKER[0][2] + (WICKER[1][2] - WICKER[0][2]) * (t + band);
};
const BRICK = [RT.lin('#b9a58c'), RT.lin('#a8937a'), RT.lin('#d8cbb8')];
const wallTex = (m) => (x, y, z, nx, ny, nz, s, out) => {
  const Wl = m.wall, a = (x - Wl.x) * Wl.ux + (z - Wl.z) * Wl.uz;
  if (ny > 0.5) { const n = RT.fbm(x * 6, z * 6, 2, 0); out[0] = BRICK[2][0] * (0.92 + 0.1 * n); out[1] = BRICK[2][1] * (0.92 + 0.1 * n); out[2] = BRICK[2][2] * (0.92 + 0.1 * n); return; }
  const row = Math.floor(y / 0.17), u = a / 0.38 + (row % 2) * 0.5, joint = Math.min(Math.abs(u - Math.round(u)) * 0.38, Math.abs(y / 0.17 - Math.round(y / 0.17)) * 0.17) < 0.012;
  const col = joint ? BRICK[2] : (Math.floor(u) + row) % 3 ? BRICK[0] : BRICK[1]; out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
};
const skyFn = (dx, dy, dz, out) => { const t = Math.max(0, Math.min(1, dy * 1.8 + 0.05)); out[0] = 0.62 - 0.3 * t; out[1] = 0.76 - 0.2 * t; out[2] = 0.96 - 0.08 * t; };
const lawn = (() => {
  const A = RT.lin('#6f9e45'), B = RT.lin('#648f3d'), C = RT.lin('#7aa84c');
  return (x, z, fp, out) => {
    const cx = Math.floor(x), cz = Math.floor(z), chk = ((cx + cz) & 1) ? 1 : 0;
    const n = RT.fbm(x * 2.5, z * 2.5, 3, fp * 2.5), f = RT.fbm(x * 18, z * 18, 2, fp * 18);
    const base = chk ? B : A, k = 0.7 + 0.5 * (n - 0.5) + 0.2 * (f - 0.5);
    out[0] = base[0] * k + C[0] * 0.15; out[1] = base[1] * k + C[1] * 0.15; out[2] = base[2] * k + C[2] * 0.15;
    const l = Math.max(RT.lineMask(x, 1, 0.012, fp), RT.lineMask(z, 1, 0.012, fp)) * 0.35;
    out[0] += (0.8 - out[0]) * l; out[1] += (0.85 - out[1]) * l; out[2] += (0.8 - out[2]) * l;
  };
})();

const MATS = new WeakMap();
function matsOf(m) {
  let C = MATS.get(m); if (C) return C;
  const mats = [
    mat('#c29658', 0.04, 8, { tex: basketTex }),
    mat('#ef5a1f', 0.6, 70, { env: 0.2 }),
    mat('#454b54', 0.2, 30),
    mat('#8f734d', 0.03, 8),
    mat('#2f5a2a', 0.02, 8),
    mat('#b9a58c', 0.03, 8, { tex: wallTex(m) }),
  ];
  const env = { floorY: 0, floor: lawn, floorMat: { ks: 0.02, sh: 14 }, sky: skyFn };
  C = { mats, env };
  MATS.set(m, C);
  return C;
}
export function sceneAt(m, k) {
  const C = matsOf(m), S = RT.shape, shapes = [];
  m.baskets.forEach((b, i) => { shapes.push(S.frustum(i, 0, b[0], b[1], 0, BASK.h, BASK.r0, BASK.r1)); });
  const P0 = m.p0, u = Math.hypot(m.v[0], m.v[1], m.v[2]), d = m.v.map((v) => v / u);
  shapes.push(S.box(101, 2, P0[0] - d[0] * 0.25, 0.2, P0[2] - d[2] * 0.25, 0.3, 0.2, 0.3, 0, 0.05));
  shapes.push(S.capsule(101, 2, [P0[0] - d[0] * 0.55, P0[1] - d[1] * 0.55, P0[2] - d[2] * 0.55], [P0[0] - d[0] * 0.08, P0[1] - d[1] * 0.08, P0[2] - d[2] * 0.08], 0.16));
  shapes.push(S.cyl(101, 2, P0[0] - d[0] * 0.5, P0[2] - d[2] * 0.5, 0, P0[1] - d[1] * 0.5, 0.07, 0));
  const Wl = m.wall;
  shapes.push(S.box(111, 5, Wl.x, Wl.h / 2, Wl.z, Wl.hl, Wl.h / 2, Wl.ht, -Math.atan2(Wl.uz, Wl.ux) / DEG, 0.01));
  const B = ballAt(m, timeOf(m, k)); shapes.push(S.sphere(100, 1, B[0], B[1], B[2], BALLR));
  shapes.push(S.box(110, 4, 0, 0.8, m.fenceZ, 18, 0.8, 0.7, 0, 0.1));
  const L = { dir: LIGHT_DIR, col: [1.2, 1.12, 0.98], soft: 0.035, sky: [0.5, 0.56, 0.64], ground: [0.16, 0.2, 0.12], aoK: 0.8, contact: 0.25, contactH: 0.12 };
  return RT.makeScene({ cam: camCached(m), shapes, mats: C.mats, light: L, env: C.env, exposure: 1.0 });
}
