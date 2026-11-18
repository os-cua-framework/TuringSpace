import { makeCam } from './_props_rt.js';

export const DEG = Math.PI / 180;
export const C = Object.freeze({
  T: 1.5,
  DT: 1 / 60,
  SLEW: 8,
  TROL: 1.2,
  RMIN: 4.0, RMAX: 16.0,
  G: 9.81,
  T_LOW: 1.0,
  A_TIP: 0.35,
  PAL: 1.2,
  PAL_H: 0.14, LOAD_H: 0.8,
  BAY: 2.4,
  JIB_Y: 12.0,
  TROLLEY_Y: 11.7,
  SLING: 1.2,
  INSIDE: 0.8,
});
export const LOAD_TOTAL = C.PAL_H + C.LOAD_H;
const N_SUB = Math.round(C.T / C.DT);
const N_LOW = Math.round(C.T_LOW / C.DT);

export const thOf = (m, k) => m.start.th + C.SLEW * k;
export const rOf = (m, j) => m.start.r + C.TROL * j;
export const polar = (th, r) => [r * Math.sin(th * DEG), r * Math.cos(th * DEG)];
export const pendL = (m) => C.TROLLEY_Y - (m.H + LOAD_TOTAL / 2);
export const omegaOf = (m) => Math.sqrt(C.G / pendL(m));
export const jOk = (m, j) => { const r = rOf(m, j); return r >= C.RMIN - 1e-9 && r <= C.RMAX + 1e-9; };

function hookKin(m, kind, dir, k, j, t) {
  const u = Math.min(1, Math.max(0, t / C.T)), S = u * u * (3 - 2 * u), S1 = 6 * u * (1 - u) / C.T, S2 = (6 - 12 * u) / (C.T * C.T);
  let th = thOf(m, k) * DEG, r = rOf(m, j), td = 0, tdd = 0, rd = 0, rdd = 0;
  if (kind === 'slew') { const D = dir * C.SLEW * DEG; th += D * S; td = D * S1; tdd = D * S2; }
  else if (kind === 'trolley') { const D = dir * C.TROL; r += D * S; rd = D * S1; rdd = D * S2; }
  const s = Math.sin(th), c = Math.cos(th);
  const ar = rdd - r * td * td, at = 2 * rd * td + r * tdd;
  return { x: r * s, z: r * c, th: th / DEG, r, ax: ar * s + at * c, az: ar * c - at * s };
}
function rk4(m, w, cz, kind, dir, k, j, t, y) {
  const f = (tt, Y) => { const a = hookKin(m, kind, dir, k, j, tt); return [Y[2], Y[3], -w * w * Y[0] - cz * Y[2] - a.ax, -w * w * Y[1] - cz * Y[3] - a.az]; };
  const h = C.DT, k1 = f(t, y);
  const y2 = y.map((v, i) => v + k1[i] * h / 2), k2 = f(t + h / 2, y2);
  const y3 = y.map((v, i) => v + k2[i] * h / 2), k3 = f(t + h / 2, y3);
  const y4 = y.map((v, i) => v + k3[i] * h), k4 = f(t + h, y4);
  return y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
export function pressKind(a) {
  if (!a) return null;
  if (a.op === 'slew' && (a.dir === 'left' || a.dir === 'right')) return { kind: 'slew', dir: a.dir === 'left' ? 1 : -1 };
  if (a.op === 'trolley' && (a.dir === 'in' || a.dir === 'out')) return { kind: 'trolley', dir: a.dir === 'out' ? 1 : -1 };
  if (a.op === 'wait') return { kind: 'wait', dir: 0 };
  return null;
}
export function integratePress(m, s, kind, dir, frames = null, every = 1) {
  let kk = kind, dd = dir;
  if (kk === 'trolley' && !jOk(m, s.j + dd)) { kk = 'wait'; dd = 0; }
  const w = omegaOf(m), cz = 2 * m.zeta * w;
  let y = [s.dx, s.dz, s.vx, s.vz];
  if (frames) { const h = hookKin(m, kk, dd, s.k, s.j, 0); frames.push({ t: 0, x: h.x, z: h.z, th: h.th, r: h.r, dx: y[0], dz: y[1] }); }
  for (let i = 0; i < N_SUB; i++) {
    y = rk4(m, w, cz, kk, dd, s.k, s.j, i * C.DT, y);
    if (frames && ((i + 1) % every === 0 || i === N_SUB - 1)) { const h = hookKin(m, kk, dd, s.k, s.j, (i + 1) * C.DT); frames.push({ t: (i + 1) * C.DT, x: h.x, z: h.z, th: h.th, r: h.r, dx: y[0], dz: y[1] }); }
  }
  return { k: s.k + (kk === 'slew' ? dd : 0), j: s.j + (kk === 'trolley' ? dd : 0), dx: y[0], dz: y[1], vx: y[2], vz: y[3] };
}
export function dropOutcome(m, s, frames = null, every = 1) {
  const w = omegaOf(m), cz = 2 * m.zeta * w;
  let y = [s.dx, s.dz, s.vx, s.vz];
  const h = hookKin(m, 'wait', 0, s.k, s.j, 0);
  const ease = (u) => u * u * (3 - 2 * u);
  if (frames) frames.push({ t: 0, x: h.x, z: h.z, th: h.th, r: h.r, dx: y[0], dz: y[1], y: m.H });
  for (let i = 0; i < N_LOW; i++) {
    y = rk4(m, w, cz, 'wait', 0, s.k, s.j, i * C.DT, y);
    if (frames && ((i + 1) % every === 0 || i === N_LOW - 1)) frames.push({ t: (i + 1) * C.DT, x: h.x, z: h.z, th: h.th, r: h.r, dx: y[0], dz: y[1], y: m.H * (1 - ease((i + 1) / N_LOW)) });
  }
  const speed = Math.hypot(y[2], y[3]), amp = Math.hypot(y[0], y[1], y[2] / w, y[3] / w);
  return { x: h.x + y[0], z: h.z + y[1], yaw: h.th, vx: y[2], vz: y[3], speed, amp, tipped: amp > C.A_TIP };
}

function clip(poly, nx, nz, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - d, db = nx * b[0] + nz * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - a[1] * b[0]; } return Math.abs(s) / 2; };
export function square(x, z, yaw, side) {
  const u = [Math.sin(yaw * DEG), Math.cos(yaw * DEG)], v = [u[1], -u[0]], h = side / 2;
  return [[x + (u[0] + v[0]) * h, z + (u[1] + v[1]) * h], [x + (u[0] - v[0]) * h, z + (u[1] - v[1]) * h],
    [x + (-u[0] - v[0]) * h, z + (-u[1] - v[1]) * h], [x + (-u[0] + v[0]) * h, z + (-u[1] + v[1]) * h]];
}
export function insideFrac(bay, x, z, yaw) {
  let p = square(x, z, yaw, C.PAL);
  const u = [Math.sin(bay.yaw * DEG), Math.cos(bay.yaw * DEG)], v = [u[1], -u[0]], h = C.BAY / 2;
  for (const [n, sg] of [[u, 1], [u, -1], [v, 1], [v, -1]]) {
    const nx = n[0] * sg, nz = n[1] * sg;
    p = clip(p, nx, nz, nx * bay.x + nz * bay.z + h);
    if (p.length < 3) return 0;
  }
  return area(p) / (C.PAL * C.PAL);
}
export function bayAt(m, k, j, color = '') { const th = thOf(m, k), [x, z] = polar(th, rOf(m, j)); return { x, z, yaw: th, color }; }

export function initState(m) { return { k: 0, j: 0, dx: 0, dz: 0, vx: 0, vz: 0, n: 0, dropped: false, land: null, last: null }; }
export const swingOf = (st) => ({ k: st.k, j: st.j, dx: st.dx, dz: st.dz, vx: st.vx, vz: st.vz });
export function outcomeOk(m, land) {
  const bay = m.bays[m.target];
  return !!land && !land.tipped && insideFrac(bay, land.x, land.z, land.yaw) >= C.INSIDE;
}

export function runPlan(m, plan, s0 = null) {
  let s = s0 || { k: 0, j: 0, dx: 0, dz: 0, vx: 0, vz: 0 };
  for (const [kind, dir] of plan) s = integratePress(m, s, kind, dir);
  return { s, land: dropOutcome(m, s) };
}
export function routeMoves(dk, dj, order) {
  const S = Array.from({ length: Math.abs(dk) }, () => ['slew', Math.sign(dk)]);
  const T = Array.from({ length: Math.abs(dj) }, () => ['trolley', Math.sign(dj)]);
  if (order === 'slew-first') return [...S, ...T];
  if (order === 'trolley-first') return [...T, ...S];
  const [A, B] = S.length >= T.length ? [S, T] : [T, S], out = [];
  for (let i = 0; i < A.length; i++) { out.push(A[i]); if (i < B.length) out.push(B[i]); }
  return out;
}
export const ORDERS = ['slew-first', 'trolley-first', 'interleaved'];
export function waitProfile(m, dk, dj, order, wMax = 9) {
  let s = { k: 0, j: 0, dx: 0, dz: 0, vx: 0, vz: 0 };
  for (const [kind, dir] of routeMoves(dk, dj, order)) s = integratePress(m, s, kind, dir);
  const ok = [];
  for (let w = 0; w <= wMax; w++) { ok.push(outcomeOk(m, dropOutcome(m, s))); s = integratePress(m, s, 'wait', 0); }
  return ok;
}

export const CAM_DIST = 70, CAM_FOV = 26;
export function camBase(m, W = 380, H = 384) {
  const a = m.cam.az * DEG, e = m.cam.el * DEG, t = m.cam.look;
  const eye = [t[0] + CAM_DIST * Math.sin(a) * Math.cos(e), CAM_DIST * Math.sin(e), t[2] + CAM_DIST * Math.cos(a) * Math.cos(e)];
  return makeCam({ eye, target: [t[0], 0, t[2]], fovY: CAM_FOV, W, H });
}
export function loadScreen(m, cam, k, j) { const [x, z] = polar(thOf(m, k), rOf(m, j)); return cam.project(x, m.H + LOAD_TOTAL / 2, z); }

function rayBox(o, d, c, ax, h, tmax) {
  let tn = -Infinity, tf = tmax;
  for (let i = 0; i < 3; i++) {
    const a = ax[i], oc = (o[0] - c[0]) * a[0] + (o[1] - c[1]) * a[1] + (o[2] - c[2]) * a[2];
    const dd = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
    if (Math.abs(dd) < 1e-12) { if (Math.abs(oc) > h[i]) return false; continue; }
    let t1 = (-h[i] - oc) / dd, t2 = (h[i] - oc) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tn = Math.max(tn, t1); tf = Math.min(tf, t2); if (tn > tf) return false;
  }
  return tn > 1e-6 && tn < tmax;
}
export function occluders(m, fr) {
  const th = fr.th * DEG, u = [Math.sin(th), 0, Math.cos(th)], v = [u[2], 0, -u[0]], up = [0, 1, 0];
  const lx = fr.x + fr.dx, lz = fr.z + fr.dz, y = fr.y ?? m.H;
  return [
    { c: [0, C.JIB_Y / 2, 0], ax: [[1, 0, 0], up, [0, 0, 1]], h: [0.85, C.JIB_Y / 2, 0.85] },
    { c: [u[0] * 6, C.JIB_Y + 0.9, u[2] * 6], ax: [u, up, v], h: [12.5, 1.4, 0.75] },
    { c: [lx, y + LOAD_TOTAL / 2, lz], ax: [u, up, v], h: [C.PAL / 2, LOAD_TOTAL / 2, C.PAL / 2] },
  ];
}
export function shadowVisible(m, eye, fr) {
  const lx = fr.x + fr.dx, lz = fr.z + fr.dz, th = fr.th * DEG, u = [Math.sin(th), Math.cos(th)], v = [u[1], -u[0]];
  const occ = occluders(m, fr);
  let vis = 0, n = 0;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const px = lx + (u[0] * a + v[0] * b) * C.PAL / 5, pz = lz + (u[1] * a + v[1] * b) * C.PAL / 5;
    const d = [px - eye[0], -eye[1], pz - eye[2]], L = Math.hypot(...d), dir = d.map((q) => q / L);
    n++;
    if (!occ.some((o) => rayBox(eye, dir, o.c, o.ax, o.h, L - 1e-3))) vis++;
  }
  return vis / n;
}
