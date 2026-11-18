import * as RT from './_cat_hide_where_rt.js';
export { RT };

export const VIEW = { w: 380, h: 384 };
export const CAT_ID = 50;
const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

export function localFrame(P) {
  const c = Math.cos(P.yaw * DEG), s = Math.sin(P.yaw * DEG);
  const W = (lx, ly, lz) => [P.x + lx * c + lz * s, (P.y || 0) + ly, P.z - lx * s + lz * c];
  const ax = [[c, 0, -s], [0, 1, 0], [s, 0, c]];
  return { W, ax, c, s };
}
export function toLocal(F, x, z) {
  const c = Math.cos(F.yaw * DEG), s = Math.sin(F.yaw * DEG), dx = x - F.x, dz = z - F.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
export function fromLocal(F, u, v) {
  const c = Math.cos(F.yaw * DEG), s = Math.sin(F.yaw * DEG);
  return [F.x + u * c + v * s, F.z - u * s + v * c];
}
export const headingVec = (yawDeg) => [Math.sin(yawDeg * DEG), Math.cos(yawDeg * DEG)];
export const yawOf = (hx, hz) => Math.atan2(hx, hz) / DEG;

export const KINDS = ['cabinet', 'sofa', 'armchair', 'box', 'curtain', 'table'];
export const HIDERS = ['sofa', 'armchair', 'box', 'curtain', 'table'];
export const LOOKS = {
  cabinet: ['#ebe7de', '#9fb4a7', '#7189a6', '#c7ad86', '#8a6446'],
  sofa: ['#7d8794', '#4f6f8f', '#6c8a58', '#b07f45', '#a35846', '#8a8174'],
  armchair: ['#5d7f97', '#93704b', '#7a8a4e', '#a5525a', '#6b6f78', '#c09455'],
  box: ['#c49a66', '#b8895a', '#cfa676'],
  curtain: ['#e6d9c1', '#9cb099', '#7e97b3', '#a64f59', '#d2a346'],
  table: ['#f1eee7', '#c64a42', '#4a77a6', '#6c986a', '#ddbf76'],
};
export const WALLS = ['#ebe5da', '#e2e7e9', '#eee5d4', '#e5e0ea'];
export const FLOORS = [
  { light: '#d2b089', dark: '#b08860' }, { light: '#b98d63', dark: '#946840' }, { light: '#74503a', dark: '#523626' }, { light: '#bdb6aa', dark: '#9b948a' },
  { light: '#e8dfcf', dark: '#d2c6b1' },
];
export const COATS = [
  { name: 'orange tabby', fur: '#dc8a3c', stripe: '#a5521c', white: false },
  { name: 'grey tabby', fur: '#7a7c82', stripe: '#4b4d53', white: false },
  { name: 'black', fur: '#2b2a2e', stripe: null, white: true },
  { name: 'white', fur: '#efebe3', stripe: null, white: false },
  { name: 'cream', fur: '#e6c99a', stripe: '#c39a62', white: false },
  { name: 'tuxedo', fur: '#38363a', stripe: null, white: true },
];
const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const coatContrast = (coat, floor) => Math.abs(luma(COATS[coat].fur) - (luma(FLOORS[floor].light) + luma(FLOORS[floor].dark)) / 2);

export function footprint(F, grow = 0) { return { hw: F.w / 2 + grow, hd: F.d / 2 + grow }; }
export function inFootprint(F, x, z, grow = 0) { const [u, v] = toLocal(F, x, z); return Math.abs(u) < F.w / 2 + grow && Math.abs(v) < F.d / 2 + grow; }
export function strip(F) {
  const hw = F.w / 2, hd = F.d / 2;
  if (F.kind === 'table') return { u0: -hw, u1: hw, v0: -hd - Math.min(0.35, F.gap ?? 0.35), v1: hd };
  return { u0: -hw, u1: hw, v0: -hd - Math.min(0.42, F.gap ?? 0.4), v1: -hd };
}
export function stripDist(F, x, z) {
  const S = strip(F), [u, v] = toLocal(F, x, z);
  const du = Math.max(S.u0 - u, 0, u - S.u1), dv = Math.max(S.v0 - v, 0, v - S.v1);
  return Math.hypot(du, dv);
}

function furnShapes(out, id, F, M) {
  const S = RT.shape, { W, ax } = localFrame(F), hw = F.w / 2, hd = F.d / 2, h = F.h;
  const obx = (lx, ly, lz, hh, m, bev = 0.008) => out.push(S.obox(id, m, W(lx, ly, lz), ax, hh, bev));
  if (F.kind === 'cabinet') {
    obx(0, 0.045, 0, [hw - 0.02, 0.045, hd - 0.02], M.dark, 0.005);
    obx(0, (h - 0.06) / 2 + 0.04, 0, [hw, (h - 0.1) / 2, hd], M.body, 0.01);
    obx(0, h - 0.03, 0.005, [hw + 0.015, 0.03, hd + 0.01], M.trim, 0.008);
    for (const sd of [-1, 1]) {
      obx(sd * (hw / 2 - 0.005), h / 2 + 0.03, hd + 0.004, [hw / 2 - 0.035, h / 2 - 0.15, 0.008], M.door, 0.006);
      obx(sd * 0.055, h / 2 + 0.06, hd + 0.02, [0.012, 0.05, 0.012], M.metal, 0.005);
    }
  } else if (F.kind === 'sofa' || F.kind === 'armchair') {
    const seat = F.seat, aw = F.arm, bt = F.backT, armH = F.armH;
    obx(0, 0.06, 0, [hw - 0.015, 0.06, hd - 0.015], M.dark, 0.01);
    obx(0, (seat - 0.08) / 2 + 0.1, 0.02, [hw - aw, (seat - 0.1) / 2 - 0.0, hd - 0.04], M.body, 0.03);
    obx(0, (h + 0.1) / 2, -hd + bt / 2, [hw, (h - 0.1) / 2, bt / 2], M.body, 0.05);
    for (const sd of [-1, 1]) obx(sd * (hw - aw / 2), (armH + 0.1) / 2, 0, [aw / 2, (armH - 0.1) / 2, hd], M.body, 0.05);
    const n = F.kind === 'sofa' ? (F.w > 1.85 ? 3 : 2) : 1, cw = (F.w - 2 * aw) / n;
    for (let i = 0; i < n; i++) {
      const cx = -hw + aw + cw * (i + 0.5);
      obx(cx, seat + 0.04, 0.03, [cw / 2 - 0.01, 0.065, hd - bt / 2 - 0.05], M.cush, 0.05);
      obx(cx, seat + 0.22, -hd + bt + 0.06, [cw / 2 - 0.02, Math.min(0.2, (h - seat) / 2 - 0.02), 0.07], M.cush, 0.06);
    }
  } else if (F.kind === 'box') {
    obx(0, h / 2, 0, [hw, h / 2, hd], M.body, 0.006);
    obx(0, h + 0.002, 0, [0.03, 0.003, hd + 0.002], M.tape, 0.001);
    for (const sd of [-1, 1]) obx(0, h - 0.07, sd * (hd + 0.002), [0.03, 0.07, 0.002], M.tape, 0.001);
  } else if (F.kind === 'curtain') {
    const r = F.fold, nF = Math.max(5, Math.round(F.w / (1.45 * r)));
    for (let i = 0; i < nF; i++) {
      const u = -hw + r + (F.w - 2 * r) * i / (nF - 1), wob = (i % 2 ? 0.35 : -0.35) * r;
      const p = W(u, 0, wob);
      out.push(S.cyl(id, M.body, p[0], p[2], 0, h - 0.02, r * (i % 2 ? 0.92 : 1.0)));
    }
    const a = W(-hw - 0.08, h + 0.02, 0), b = W(hw + 0.08, h + 0.02, 0);
    out.push(S.capsule(id, M.metal, a, b, 0.016));
  } else if (F.kind === 'table') {
    obx(0, h - 0.014, 0, [hw + 0.03, 0.014, hd + 0.03], M.cush, 0.012);
    obx(0, (h - 0.02) / 2, 0, [hw - 0.01, (h - 0.02) / 2, hd - 0.01], M.body, 0.01);
    const r = 0.034, step = 0.062;
    for (const [len, along, other] of [[F.w, 'u', hd], [F.d, 'v', hw]]) {
      const nf = Math.max(3, Math.round(len / step));
      for (let i = 0; i <= nf; i++) for (const sd of [-1, 1]) {
        const a = -len / 2 + len * i / nf, wob = (i % 2 ? 0.012 : -0.004);
        const p = along === 'u' ? W(a, 0, sd * (other + 0.006 + wob)) : W(sd * (other + 0.006 + wob), 0, a);
        out.push(S.cyl(id, M.body, p[0], p[2], 0, h - 0.025, r * (i % 2 ? 0.9 : 1)));
      }
    }
    if (F.bowl) { const p = W(F.bowl[0], 0, F.bowl[1]); out.push(S.frustum(id, M.metal, p[0], p[2], h, h + 0.08, 0.06, 0.11)); }
  }
}

const LEG = [
  [-0.046, -0.118, 0.0], [-0.04, 0.112, 0.25], [0.046, -0.118, 0.5], [0.04, 0.112, 0.75],
];
export function catShapes(out, pose, M, k = 1) {
  const S = RT.shape, P = { x: pose.x, z: pose.z, yaw: pose.yaw }, { W: W0, ax } = localFrame(P);
  const lie = pose.lie || 0, wk = (pose.walk ?? 1) * (1 - lie), drop = 0.1 * lie, cz = 1 - 0.3 * lie;
  const W = (lx, ly, lz) => W0(lx * k, ly * k, lz * k);
  const cf = { x: pose.x, z: pose.z, c: Math.cos(pose.yaw * DEG), s: Math.sin(pose.yaw * DEG), k };
  const bob = 0.006 * wk * Math.sin(4 * Math.PI * pose.ph);
  const push = (s) => { s.cf = cf; s.noAO = true; out.push(s); };
  const ell = (lx, ly, lz, h, m) => push(S.ellipsoid(CAT_ID, m, W(lx, ly, lz), ax, h.map((q) => q * k)));
  const cap = (a, b, r, m) => push(S.capsule(CAT_ID, m, W(...a), W(...b), r * k));
  const y = (v) => v - drop + bob;
  ell(0, y(0.2), -0.005, [0.068 + 0.012 * lie, 0.07, 0.165 * cz], M.fur);
  ell(0, y(0.212), 0.1 * cz, [0.07, 0.08, 0.09], M.fur);
  ell(0, y(0.205), -0.112 * cz, [0.076 + 0.01 * lie, 0.085, 0.095], M.fur);
  cap([0, y(0.235), 0.15 * cz], [0, y(0.285) - 0.03 * lie, 0.2 * cz], 0.044, M.fur);
  const hy = y(0.3) - 0.05 * lie, hz = 0.236 * cz;
  ell(0, hy, hz, [0.063, 0.057, 0.058], M.fur);
  ell(0, hy - 0.016, hz + 0.044, [0.034, 0.027, 0.028], M.white ?? M.fur);
  for (const sd of [-1, 1]) {
    const p = W(sd * 0.037, 0, hz - 0.012);
    push(S.frustum(CAT_ID, M.fur, p[0], p[2], (hy + 0.03) * k, (hy + 0.088) * k, 0.023 * k, 0.003 * k));
    push(S.sphere(CAT_ID, M.eye, ...W(sd * 0.026, hy + 0.012, hz + 0.05), 0.0095 * k));
  }
  push(S.sphere(CAT_ID, M.nose, ...W(0, hy - 0.004, hz + 0.071), 0.0075 * k));
  for (const [sx, az, off] of LEG) {
    const a = 2 * Math.PI * (pose.ph + off), dz = 0.055 * wk * Math.sin(a), lift = 0.03 * wk * Math.max(0, Math.cos(a));
    const top = [sx, y(0.18), az * cz], paw = lie > 0 ? [sx * (1 + 0.2 * lie), lerp(0.024 + lift, 0.03, lie), az * cz + dz + 0.03 * lie] : [sx, 0.024 + lift, az + dz];
    cap(top, [paw[0], paw[1] + 0.01, paw[2]], 0.02, M.legs);
    push(S.sphere(CAT_ID, M.legs, ...W(paw[0], paw[1], paw[2] + 0.008), 0.024 * k));
  }
  const sw = pose.sway || 0;
  const up = [[0, 0.215, -0.2], [0.0, 0.262, -0.29], [0.4 * sw, 0.345, -0.335], [sw, 0.415, -0.315]];
  const dn = [[0.0, 0.09, -0.15], [0.07, 0.03, -0.17], [0.1, 0.03, -0.07], [0.09, 0.03, 0.04]];
  const tp = up.map((p, i) => [lerp(p[0], dn[i][0], lie), lerp(p[1] + bob, dn[i][1], lie), lerp(p[2], dn[i][2], lie)]);
  for (let i = 0; i < 3; i++) cap(tp[i], tp[i + 1], 0.021 - 0.002 * i, M.fur);
}
const DIRS = (() => {
  const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const a of [-1, 1]) for (const b of [-1, 1]) d.push([a * 0.62, 0.48, b * 0.62]);
  return d.map((v) => { const l = Math.hypot(...v); return v.map((q) => q / l); });
})();
export function catPoints(pose, k = 1) {
  const sh = []; catShapes(sh, pose, { fur: 0, legs: 0, eye: 0, nose: 0, white: 0 }, k);
  const pts = [];
  for (const s of sh) {
    if (s.k === RT.ELL) {
      if (s.h[0] < 0.04 * k && s.h[2] < 0.04 * k) { pts.push(s.c.slice()); continue; }
      for (const d of DIRS) {
        const p = s.c.slice();
        for (let a = 0; a < 3; a++) for (let q = 0; q < 3; q++) p[q] += s.ax[a][q] * d[a] * s.h[a] * 0.82;
        pts.push(p);
      }
    } else if (s.k === RT.CAP) pts.push([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2]);
    else if (s.k === RT.FRU) pts.push([s.cx, (s.y0 * 2 + s.y1) / 3, s.cz]);
  }
  return pts;
}
export function catScreenBox(cam, pose, k = 1) {
  const pts = catPoints(pose, k);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return [x0, y0, x1, y1];
}

const ROUTES = new WeakMap();
const DS = 0.01;
function routeTable(m) {
  let T = ROUTES.get(m.route);
  if (T) return T;
  const R0 = m.route, P = R0.pts, n = P.length;
  const xs = [], zs = [], seg = [];
  const pushPt = (x, z, i) => { xs.push(x); zs.push(z); seg.push(i); };
  let cur = P[0];
  for (let i = 0; i < n - 1; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    const hasNext = i + 1 < n - 1;
    let cutB = 0;
    if (hasNext) { const c = P[i + 2], L2 = Math.hypot(c[0] - b[0], c[1] - b[1]); cutB = Math.min(R0.rr, 0.45 * L, 0.45 * L2); }
    const end = [b[0] - ux * cutB, b[1] - uz * cutB];
    const Ls = Math.hypot(end[0] - cur[0], end[1] - cur[1]), ns = Math.max(1, Math.ceil(Ls / DS));
    for (let j = 0; j < ns; j++) pushPt(cur[0] + (end[0] - cur[0]) * j / ns, cur[1] + (end[1] - cur[1]) * j / ns, i);
    if (hasNext) {
      const c = P[i + 2], L2 = Math.hypot(c[0] - b[0], c[1] - b[1]), vx = (c[0] - b[0]) / L2, vz = (c[1] - b[1]) / L2;
      const nxt = [b[0] + vx * cutB, b[1] + vz * cutB];
      const approx = 2 * cutB, nb = Math.max(2, Math.ceil(approx / DS));
      for (let j = 0; j < nb; j++) {
        const u = j / nb, x = (1 - u) * (1 - u) * end[0] + 2 * u * (1 - u) * b[0] + u * u * nxt[0], z = (1 - u) * (1 - u) * end[1] + 2 * u * (1 - u) * b[1] + u * u * nxt[1];
        pushPt(x, z, u < 0.5 ? i : i + 1);
      }
      cur = nxt;
    } else cur = end;
  }
  pushPt(P[n - 1][0], P[n - 1][1], n - 2);
  const N = xs.length, s = new Float64Array(N);
  for (let i = 1; i < N; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  const Ltot = s[N - 1];
  const raw = seg.map((i) => R0.v[i]), v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let acc = 0, w = 0;
    for (let j = i - 12; j <= i + 12; j++) { const q = raw[Math.max(0, Math.min(N - 1, j))]; acc += q; w++; }
    const rem = Ltot - s[i];
    v[i] = (acc / w) * Math.max(0.25, Math.sqrt(Math.min(1, rem / 0.3)));
  }
  const pauseAt = new Map();
  for (const [wi, dur] of R0.pause || []) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = Math.hypot(xs[i] - P[wi][0], zs[i] - P[wi][1]); if (d < bd) { bd = d; best = i; } }
    pauseAt.set(best, (pauseAt.get(best) || 0) + dur);
  }
  const t0 = new Float64Array(N), t1 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i > 0) t0[i] = t1[i - 1] + (s[i] - s[i - 1]) / Math.max(0.05, 0.5 * (v[i] + v[i - 1]));
    t1[i] = t0[i] + (pauseAt.get(i) || 0);
  }
  const yaw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 4), b = Math.min(N - 1, i + 4);
    yaw[i] = yawOf(xs[b] - xs[a], zs[b] - zs[a]);
  }
  T = { xs, zs, s, v, t0, t1, yaw, N, L: Ltot, tEnd: t1[N - 1] };
  ROUTES.set(m.route, T);
  return T;
}
export const routeLen = (m) => routeTable(m).L;
export const arrivalT = (m) => routeTable(m).tEnd;
export const LIE_T = 0.7;
export function catPose(m, tau) {
  const T = routeTable(m), R0 = m.route;
  const sway = 0.035 * Math.sin(2 * Math.PI * tau / 1.7 + (m.cat.swayPh || 0));
  if (tau >= T.tEnd) {
    const i = T.N - 1;
    return { x: T.xs[i], z: T.zs[i], yaw: T.yaw[i], ph: T.s[i] / R0.stride, walk: 0, lie: smooth((tau - T.tEnd) / LIE_T), sway, s: T.L, moving: false };
  }
  let lo = 0, hi = T.N - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T.t0[mid] <= tau) lo = mid; else hi = mid; }
  const i = lo;
  if (tau <= T.t1[i] || i >= T.N - 1) {
    return { x: T.xs[i], z: T.zs[i], yaw: T.yaw[i], ph: T.s[i] / R0.stride, walk: 0, lie: 0, sway, s: T.s[i], moving: false };
  }
  const u = (tau - T.t1[i]) / Math.max(1e-9, T.t0[i + 1] - T.t1[i]);
  const x = lerp(T.xs[i], T.xs[i + 1], u), z = lerp(T.zs[i], T.zs[i + 1], u), s = lerp(T.s[i], T.s[i + 1], u);
  let dy = T.yaw[i + 1] - T.yaw[i]; dy = ((dy + 540) % 360) - 180;
  const vv = lerp(T.v[i], T.v[i + 1], u), pausedNear = (j) => T.t1[j] - T.t0[j] > 0;
  let walk = clamp01(vv / 0.3);
  for (let j = Math.max(0, i - 15); j <= Math.min(T.N - 1, i + 15); j++) if (pausedNear(j)) walk *= clamp01(Math.abs(T.s[j] - s) / 0.15);
  return { x, z, yaw: T.yaw[i] + dy * u, ph: s / R0.stride, walk, lie: 0, sway, s, moving: true };
}
export function timeAtS(m, s) {
  const T = routeTable(m);
  if (s <= 0) return 0; if (s >= T.L) return T.tEnd;
  let lo = 0, hi = T.N - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T.s[mid] <= s) lo = mid; else hi = mid; }
  return T.t1[lo] + (s - T.s[lo]) / Math.max(1e-9, T.s[hi] - T.s[lo]) * (T.t0[hi] - T.t1[lo]);
}
export function routeSamples(m) { const T = routeTable(m); return { xs: T.xs, zs: T.zs, s: T.s, N: T.N }; }

export function camOf(m) { const C = m.cam; return RT.orbitCam({ az: C.az, el: C.el, dist: C.dist, fov: C.fov, tx: C.tx, ty: C.ty, tz: C.tz }, VIEW.w, VIEW.h); }
const CAMS = new WeakMap();
export function camCached(m) { let c = CAMS.get(m); if (!c) { c = camOf(m); CAMS.set(m, c); } return c; }

const MATS = new WeakMap();
function woodTex(a, b) {
  const A = RT.lin(a), B = RT.lin(b);
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = Math.abs(ny) > 0.5 ? x * 0.7 + z * 0.7 : y;
    const g = RT.fbm(u * 3 + (x - z) * 18, (x + z) * 2 + y * 2, 3);
    RT.mixInto(out, A, B, 0.15 + 0.45 * g);
  };
}
function fabricTex(hex, k = 0.08) {
  const A = RT.lin(hex);
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 40 + z * 13, y * 40 - z * 7, 2, 0.02);
    const kk = 1 - k + 2 * k * n; out[0] = A[0] * kk; out[1] = A[1] * kk; out[2] = A[2] * kk;
  };
}
function curtainTex(hex) {
  const A = RT.lin(hex);
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 30 + z * 30, y * 6, 2, 0.02), hollow = 0.84 + 0.16 * Math.abs(nx * 0.7 + nz * 0.7);
    const kk = hollow * (0.95 + 0.1 * n); out[0] = A[0] * kk; out[1] = A[1] * kk; out[2] = A[2] * kk;
  };
}
function cardboardTex(hex) {
  const A = RT.lin(hex), D = RT.lin('#8d6a42');
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 9 + z * 9, y * 9, 3, 0.02);
    RT.mixInto(out, A, D, 0.1 + 0.18 * n);
  };
}
function clothTex(hex, check) {
  const A = RT.lin(hex), W = RT.lin('#f4f1ea');
  return (x, y, z, nx, ny, nz, s, out) => {
    if (check) {
      const q = 0.09, a = Math.floor((x + z * 0.0001) / q), b = Math.floor((Math.abs(ny) > 0.5 ? z : y) / q), c = Math.floor(z / q);
      const on = ((Math.abs(nx) > 0.7 ? c : a) + b) & 1;
      RT.mixInto(out, A, W, on ? 0.15 : 0.75);
    } else { out[0] = A[0]; out[1] = A[1]; out[2] = A[2]; }
    const n = RT.fbm(x * 35 + z * 11, y * 35, 2, 0.02), kk = 0.95 + 0.08 * n; out[0] *= kk; out[1] *= kk; out[2] *= kk;
  };
}
function furTex(c) {
  const F = RT.lin(c.fur), S = c.stripe ? RT.lin(c.stripe) : null;
  return (x, y, z, nx, ny, nz, s, out) => {
    out[0] = F[0]; out[1] = F[1]; out[2] = F[2];
    if (!S || !s.cf) return;
    const cf = s.cf, dx = x - cf.x, dz = z - cf.z, lz = (dx * cf.s + dz * cf.c) / cf.k, lx = (dx * cf.c - dz * cf.s) / cf.k;
    const band = 0.5 + 0.5 * Math.sin(lz * 62 + 4 * RT.fbm(lx * 20, y * 20, 2) + y * 9);
    const k = Math.max(0, (band - 0.45) / 0.55) * (0.55 + 0.45 * Math.max(0, ny));
    RT.mixInto(out, F, S, 0.85 * k);
  };
}
export function sceneMats(m) {
  let c = MATS.get(m);
  if (c) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const furn = m.furn.map((F) => {
    const hex = LOOKS[F.kind][F.look % LOOKS[F.kind].length];
    if (F.kind === 'cabinet') {
      const dk = shade(hex, 0.78);
      return { body: at({ c: RT.lin(hex), ks: 0.12, sh: 30, tex: woodTex(hex, shade(hex, 0.9)) }), door: at({ c: RT.lin(hex), ks: 0.16, sh: 40, tex: woodTex(shade(hex, 1.03), shade(hex, 0.9)) }),
        trim: at({ c: RT.lin(shade(hex, 0.95)), ks: 0.12, sh: 30 }), dark: at({ c: RT.lin(dk), ks: 0.08, sh: 20 }), metal: at({ c: RT.lin('#c8b070'), ks: 0.7, sh: 80 }) };
    }
    if (F.kind === 'sofa' || F.kind === 'armchair') {
      return { body: at({ c: RT.lin(hex), ks: 0.03, sh: 8, tex: fabricTex(hex) }), cush: at({ c: RT.lin(shade(hex, 1.06)), ks: 0.03, sh: 8, tex: fabricTex(shade(hex, 1.06)) }),
        dark: at({ c: RT.lin(shade(hex, 0.55)), ks: 0.05, sh: 10 }) };
    }
    if (F.kind === 'box') return { body: at({ c: RT.lin(hex), ks: 0.04, sh: 10, tex: cardboardTex(hex) }), tape: at({ c: RT.lin('#d8c9a6'), ks: 0.35, sh: 60 }) };
    if (F.kind === 'curtain') return { body: at({ c: RT.lin(hex), ks: 0.05, sh: 12, tex: curtainTex(hex) }), metal: at({ c: RT.lin('#9a9488'), ks: 0.6, sh: 60 }) };
    return { body: at({ c: RT.lin(hex), ks: 0.04, sh: 10, tex: clothTex(hex, F.check) }), cush: at({ c: RT.lin(hex), ks: 0.06, sh: 12, tex: clothTex(hex, F.check) }),
      metal: at({ c: RT.lin(F.bowlC || '#e9e4d8'), ks: 0.3, sh: 40 }) };
  });
  const coat = COATS[m.cat.coat];
  const cat = {
    fur: at({ c: RT.lin(coat.fur), ks: 0.06, sh: 14, tex: furTex(coat) }),
    white: coat.white ? at({ c: RT.lin('#f1eee8'), ks: 0.05, sh: 12 }) : undefined,
    eye: at({ c: RT.lin(coat.fur === '#2b2a2e' || coat.fur === '#38363a' ? '#c9b23a' : '#3b4a2a'), ks: 0.6, sh: 80 }),
    nose: at({ c: RT.lin('#c98b86'), ks: 0.2, sh: 30 }),
  };
  cat.legs = coat.white ? cat.white : cat.fur;
  c = { mats, furn, cat, env: roomEnv(m), light: lightOf(m) };
  MATS.set(m, c);
  return c;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}
function lightOf(m) {
  const a = m.light.az * DEG, e = m.light.el * DEG;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.12, 1.07, 0.98], soft: 0.06,
    sky: [0.5, 0.5, 0.52], ground: [0.24, 0.2, 0.17],
    fill: { dir: [0.55, 0.35, 0.75], col: [0.15, 0.15, 0.17] }, aoK: 0.9, contact: 0.3, contactH: 0.05,
  };
}
function roomEnv(m) {
  const R = m.room, fl = FLOORS[R.floor];
  const planks = RT.plankFloor({ plank: 0.15, plankL: 1.2, base: fl.light, dark: fl.dark, light: fl.light });
  const rug = R.rug, RA = rug ? RT.lin(rug.c0) : null, RB = rug ? RT.lin(rug.c1) : null;
  const floor = (x, z, fp, out) => {
    if (R.floorRot) planks(z, x, fp, out); else planks(x, z, fp, out);
    if (rug) {
      const [u, v] = toLocal(rug, x, z);
      if (Math.abs(u) < rug.hw && Math.abs(v) < rug.hd) {
        const edge = Math.min(rug.hw - Math.abs(u), rug.hd - Math.abs(v));
        RT.mixInto(out, RA, RB, edge < 0.07 ? 0.2 : 0.7);
        const n = RT.fbm(x * 30, z * 30, 2, fp * 30); const kk = 0.93 + 0.1 * n; out[0] *= kk; out[1] *= kk; out[2] *= kk;
      }
    }
  };
  const Wc = RT.lin(R.wall), SK = RT.lin('#f4f0e8'), FR = RT.lin('#f5f3ee'), GL0 = RT.lin('#bcd6ea'), GL1 = RT.lin('#e7f0f6');
  const win = R.window;
  const wallFn = (isZ) => (a, y, fp, out) => {
    const n = RT.fbm(a * 5, y * 5, 3, fp);
    const src = y < 0.09 ? SK : Wc, kk = (y < 0.09 ? 1 : 0.97 + 0.05 * n) * (Math.abs(y - 0.09) < 0.004 ? 0.82 : 1);
    out[0] = src[0] * kk; out[1] = src[1] * kk; out[2] = src[2] * kk;
    if (win && (win.wall === 'z') === isZ && a > win.a0 - 0.06 && a < win.a1 + 0.06 && y > win.y0 - 0.06 && y < win.y1 + 0.06) {
      const inside = a > win.a0 && a < win.a1 && y > win.y0 && y < win.y1;
      const mid = Math.abs(a - (win.a0 + win.a1) / 2) < 0.025 || Math.abs(y - (win.y0 + 0.62 * (win.y1 - win.y0))) < 0.022;
      if (!inside || mid) { out[0] = FR[0]; out[1] = FR[1]; out[2] = FR[2]; if (!inside && (y < win.y0 - 0.05)) { out[0] *= 0.9; out[1] *= 0.9; out[2] *= 0.9; } }
      else { const v = (y - win.y0) / (win.y1 - win.y0); RT.mixInto(out, GL0, GL1, 0.25 + 0.6 * v); }
    }
    const P = R.picture;
    if (P && (P.wall === 'z') === isZ && a > P.a0 && a < P.a1 && y > P.y0 && y < P.y1) {
      const e = Math.min(a - P.a0, P.a1 - a, y - P.y0, P.y1 - y);
      if (e < 0.025) { out[0] = 0.05; out[1] = 0.045; out[2] = 0.04; }
      else if (e < 0.06) { out[0] = 0.85; out[1] = 0.83; out[2] = 0.8; }
      else { const pc = P.cols.map(RT.lin), v = (y - P.y0) / (P.y1 - P.y0), hz = v < 0.42 ? pc[0] : v < 0.47 ? pc[1] : pc[2]; const g = RT.fbm(a * 9, y * 9, 2, fp * 9); out[0] = hz[0] * (0.85 + 0.3 * g); out[1] = hz[1] * (0.85 + 0.3 * g); out[2] = hz[2] * (0.85 + 0.3 * g); }
    }
  };
  return { floorY: 0, floor, floorMat: { ks: 0.06, sh: 30 }, wallZ: 0, wall: wallFn(true), wallX: 0, wallXDir: 1, wallSide: wallFn(false), sky: RT.softSky };
}
export function furnitureShapes(m, skip = null) {
  const C = sceneMats(m), out = [];
  m.furn.forEach((F, i) => { if (!skip || !skip.has(i)) furnShapes(out, i, F, C.furn[i]); });
  return out;
}
const FURN = new WeakMap();
function furnCached(m) { let f = FURN.get(m); if (!f) { f = furnitureShapes(m); FURN.set(m, f); } return f; }
export function sceneAt(m, tau, opts = {}) {
  const C = sceneMats(m), shapes = furnCached(m).slice();
  if (!opts.noCat) catShapes(shapes, opts.pose || catPose(m, tau), C.cat, m.cat.k);
  const sc = RT.makeScene({ cam: camCached(m), shapes, mats: C.mats, light: C.light, env: C.env, exposure: 1.0 });
  sc.fast = !!opts.fast;
  return sc;
}
const BG = new WeakMap();
export function furnitureScene(m) { let s = BG.get(m); if (!s) { s = sceneAt(m, 0, { noCat: true }); BG.set(m, s); } return s; }

const PIECES = new WeakMap();
function piecesOf(m) {
  let P = PIECES.get(m);
  if (P) return P;
  P = m.furn.map((_, i) => {
    const list = furnitureShapes(m, new Set(m.furn.map((__, j) => j).filter((j) => j !== i)));
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const s of list) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
    return { list, bs: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2] };
  });
  PIECES.set(m, P);
  return P;
}
function segBlocked(piece, e, d, L) {
  const b = piece.bs, ox = b[0] - e[0], oy = b[1] - e[1], oz = b[2] - e[2], t = ox * d[0] + oy * d[1] + oz * d[2];
  const cx = ox - t * d[0], cy = oy - t * d[1], cz = oz - t * d[2];
  if (cx * cx + cy * cy + cz * cz > b[3] * b[3] || t < -b[3] || t - b[3] > L) return false;
  for (const s of piece.list) if (RT.hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], L) < L) return true;
  return false;
}
export function probeAt(m, tau, pose = null) {
  const cam = camCached(m), e = cam.eye, P = piecesOf(m), pts = catPoints(pose || catPose(m, tau), m.cat.k);
  const n = pts.length, masks = new Int32Array(n), pts2 = new Float64Array(2 * n), d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = cam.project(p[0], p[1], p[2]);
    pts2[2 * i] = q.x; pts2[2 * i + 1] = q.y;
    if (!(q.z > 0) || q.x < 0 || q.y < 0 || q.x > VIEW.w || q.y > VIEW.h) { masks[i] = -1; continue; }
    const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2], L = Math.hypot(dx, dy, dz);
    d[0] = dx / L; d[1] = dy / L; d[2] = dz / L;
    let mk = 0;
    for (let j = 0; j < P.length; j++) if (segBlocked(P[j], e, d, L - 1e-3)) mk |= 1 << j;
    masks[i] = mk;
  }
  return { n, masks, pts2 };
}
export function visFrac(pr, without = 0) {
  let v = 0;
  for (let i = 0; i < pr.n; i++) { const mk = pr.masks[i]; if (mk >= 0 && (mk & ~without) === 0) v++; }
  return v / pr.n;
}
export function blockedBy(pr, j) {
  let v = 0, n = 0;
  for (let i = 0; i < pr.n; i++) { const mk = pr.masks[i]; if (mk < 0) continue; n++; if (mk & (1 << j)) v++; }
  return n ? v / n : 0;
}
export function visCentroid(pr) {
  let sx = 0, sy = 0, k = 0;
  for (let i = 0; i < pr.n; i++) if (pr.masks[i] === 0) { sx += pr.pts2[2 * i]; sy += pr.pts2[2 * i + 1]; k++; }
  return k ? [sx / k, sy / k] : null;
}
