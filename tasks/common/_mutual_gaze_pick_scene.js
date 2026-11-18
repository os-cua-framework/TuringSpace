import * as RT from './_mutual_gaze_pick_rt.js';
export { RT };

export const VIEW = { w: 380, h: 384 };
const DEG = Math.PI / 180;
export const SEAT_Y = 0.47;
export const HEAD_S = 1.32;
export const ID = { table: 1, plant: 2, side: 3, lamp: 4, base: (i) => 10 + i, person: (i) => 20 + i, back: (i) => 30 + i };
export const personOf = (id) => (id >= 20 && id < 30 ? id - 20 : id >= 30 && id < 40 ? id - 30 : -1);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const yawVec = (a) => [Math.sin(a * DEG), 0, Math.cos(a * DEG)];
export const yawOf = (v) => Math.atan2(v[0], v[2]) / DEG;
export function angBetween(a, b) { const c = dot3(a, b) / ((len3(a) * len3(b)) || 1); return Math.acos(Math.max(-1, Math.min(1, c))) / DEG; }

export function headAxes(g, p) {
  const cg = Math.cos(g * DEG), sg = Math.sin(g * DEG), cp = Math.cos(p * DEG), sp = Math.sin(p * DEG);
  return { hf: [sg * cp, -sp, cg * cp], hu: [sg * sp, cp, cg * sp] };
}
export const neckTop = (P) => [P.x, SEAT_Y + 0.1 * P.k + 0.585 * P.k, P.z];
export const HEAD_UP = 0.07;
export function headCentre(P, g, p) { const { hu } = headAxes(g, p); return add3(neckTop(P), hu, HEAD_UP * P.k * HEAD_S); }
export const headLevel = (P) => { const n = neckTop(P); return [n[0], n[1] + HEAD_UP * P.k * HEAD_S, n[2]]; };
export function aimAt(P, Q) { const c = headLevel(P), d = sub3(Q, c); return { yaw: yawOf(d), pitch: -Math.atan2(d[1], Math.hypot(d[0], d[2])) / DEG }; }

export function holdsAt(list, tau, T) {
  const n = list.length;
  for (let k = 0; k < n; k++) {
    const h = list[k], u = (((tau - h.t0) % T) + T) % T;
    if (u <= h.d + 1e-9) return { yaw: h.yaw, pitch: h.pitch ?? 0, moving: 0, k };
  }
  for (let k = 0; k < n; k++) {
    const a = list[k], b = list[(k + 1) % n];
    const e = a.t0 + a.d, gap = ((((b.t0 - e) % T) + T) % T) || T, u = (((tau - e) % T) + T) % T;
    if (u < gap) {
      const w = u / gap, s = smooth(w), dy = wrap180(b.yaw - a.yaw);
      const sp = 6 * w * (1 - w) / gap;
      return { yaw: a.yaw + dy * s, pitch: (a.pitch ?? 0) + ((b.pitch ?? 0) - (a.pitch ?? 0)) * s, moving: Math.abs(dy) * sp, k: -1, from: k };
    }
  }
  return { yaw: list[0].yaw, pitch: list[0].pitch ?? 0, moving: 0, k: 0 };
}
export function poseAt(m, i, tau) {
  const P = m.people[i], G = holdsAt(P.gaze, tau, m.T), B = holdsAt(P.body, tau, m.T);
  return { b: B.yaw, g: G.yaw, p: G.pitch, gMoving: G.moving, bMoving: B.moving, gk: G.k, bk: B.k };
}
export function headsAt(m, tau) {
  return m.people.map((P, i) => { const q = poseAt(m, i, tau), { hf } = headAxes(q.g, q.p); return { c: headCentre(P, q.g, q.p), f: hf, b: q.b, g: q.g, p: q.p }; });
}
export function gazeErr(H, i, j) { return angBetween(H[i].f, sub3(H[j].c, H[i].c)); }
export function bodyErr(m, H, i, j) { const d = sub3(H[j].c, H[i].c); return Math.abs(wrap180(H[i].b - yawOf(d))); }

function frameYaw(a) { const f = yawVec(a); return { f, r: [-f[2], 0, f[0]], ax: RT.frame([0, 1, 0], f) }; }
function chairBase(out, id, P, M) {
  const S = RT.shape;
  for (let i = 0; i < 5; i++) {
    const a = P.baseYaw + i * 72, { f, ax } = frameYaw(a);
    out.push(S.obox(id, M.metal, [P.x + f[0] * 0.15, 0.065, P.z + f[2] * 0.15], ax, [0.022, 0.016, 0.15], 0.008));
    out.push(S.sphere(id, M.caster, P.x + f[0] * 0.29, 0.03, P.z + f[2] * 0.29, 0.03));
  }
  out.push(S.cyl(id, M.metal, P.x, P.z, 0.06, 0.1, 0.05, 0.01));
  out.push(S.cyl(id, M.metal, P.x, P.z, 0.1, SEAT_Y - 0.08, 0.026));
  out.push(S.cyl(id, M.chairD, P.x, P.z, SEAT_Y - 0.09, SEAT_Y - 0.065, 0.2, 0.01));
  out.push(S.cyl(id, M.chair[P.chair], P.x, P.z, SEAT_Y - 0.075, SEAT_Y, 0.245, 0.03));
}
function chairBack(out, id, P, b, M) {
  const S = RT.shape, { f, ax } = frameYaw(b);
  const back = add3([P.x, SEAT_Y + 0.31, P.z], f, -0.25);
  out.push(S.obox(id, M.chair[P.chair], back, ax, [0.2, 0.15, 0.035], 0.03));
  out.push(S.obox(id, M.chairD, add3([P.x, SEAT_Y + 0.06, P.z], f, -0.19), ax, [0.035, 0.035, 0.07], 0.01));
  out.push(S.obox(id, M.chairD, add3([P.x, SEAT_Y + 0.13, P.z], f, -0.262), ax, [0.03, 0.09, 0.015], 0.008));
}
function sitterShapes(out, id, P, b, g, p, M) {
  const S = RT.shape, k = P.k, { f, r } = frameYaw(b), up = [0, 1, 0], ax = RT.frame(up, f);
  const pelvis = [P.x, SEAT_Y + 0.1 * k, P.z];
  const at = (side, fwd, y) => [P.x + r[0] * side * k + f[0] * fwd * k, y, P.z + r[2] * side * k + f[2] * fwd * k];
  const py = pelvis[1];
  for (const s of [-1, 1]) {
    const hip = at(s * 0.088, 0.02, py - 0.035 * k), knee = at(s * 0.1, 0.44, py - 0.025 * k), ankle = at(s * 0.115, 0.47, 0.085 * k);
    out.push(S.capsule(id, M.bottom, hip, knee, 0.068 * k));
    out.push(S.capsule(id, M.bottom, knee, ankle, 0.052 * k));
    out.push(S.ellipsoid(id, M.shoe, [ankle[0] + f[0] * 0.05 * k, 0.042 * k, ankle[2] + f[2] * 0.05 * k], ax, [0.05 * k, 0.042 * k, 0.12 * k]));
  }
  out.push(S.ellipsoid(id, M.bottom, pelvis, ax, [0.165 * k, 0.115 * k, 0.11 * k]));
  out.push(S.ellipsoid(id, M.top, add3(pelvis, up, 0.16 * k), ax, [0.15 * k, 0.17 * k, 0.098 * k]));
  out.push(S.ellipsoid(id, M.top, add3(pelvis, up, 0.36 * k), ax, [0.18 * k, 0.19 * k, 0.11 * k]));
  out.push(S.capsule(id, M.top, add3(add3(pelvis, up, 0.44 * k), r, -0.13 * k), add3(add3(pelvis, up, 0.44 * k), r, 0.13 * k), 0.064 * k));
  for (const s of [-1, 1]) {
    const sh = add3(add3(pelvis, up, 0.44 * k), r, s * 0.185 * k), el = at(s * 0.215, 0.1, py + 0.19 * k), hand = at(s * 0.13, 0.33, py + 0.08 * k);
    out.push(S.capsule(id, M.top, sh, el, 0.048 * k));
    out.push(S.capsule(id, M.skin, el, hand, 0.038 * k));
    out.push(S.ellipsoid(id, M.skin, add3(hand, f, 0.04 * k), ax, [0.03 * k, 0.022 * k, 0.05 * k]));
  }
  const n0 = add3(pelvis, up, 0.49 * k), n1 = neckTop(P);
  out.push(S.capsule(id, M.skin, n0, n1, 0.05 * k));
  const { hf, hu } = headAxes(g, p), hr = cross3(hu, hf).map((v) => -v), hax = RT.frame(hu, hf), K = k * HEAD_S;
  const hc = add3(n1, hu, HEAD_UP * K);
  const hp = (fw, u, sd = 0) => add3(add3(add3(hc, hf, fw * K), hu, u * K), hr, sd * K);
  out.push(S.ellipsoid(id, M.skin, hc, hax, [0.077 * K, 0.104 * K, 0.092 * K]));
  if (P.cap) {
    out.push(S.ellipsoid(id, M.capc, hp(-0.012, 0.032), hax, [0.083 * K, 0.088 * K, 0.093 * K]));
    out.push(S.ellipsoid(id, M.capc, hp(0.1, 0.045), hax, [0.07 * K, 0.009 * K, 0.06 * K]));
    out.push(S.ellipsoid(id, M.hair, hp(-0.05, -0.02), hax, [0.07 * K, 0.06 * K, 0.06 * K]));
    if (P.long) out.push(S.ellipsoid(id, M.hair, hp(-0.06, -0.085), hax, [0.072 * K, 0.11 * K, 0.05 * K]));
  } else {
    out.push(S.ellipsoid(id, M.hair, hp(-0.028, 0.022), hax, [0.083 * K, 0.097 * K, 0.088 * K]));
    if (P.long) out.push(S.ellipsoid(id, M.hair, hp(-0.055, -0.07), hax, [0.08 * K, 0.12 * K, 0.052 * K]));
  }
  out.push(S.ellipsoid(id, M.skin, hp(0.093, -0.014), hax, [0.017 * K, 0.026 * K, 0.028 * K]));
  for (const s of [-1, 1]) {
    out.push(S.ellipsoid(id, M.eye, hp(0.079, 0.014, s * 0.031), hax, [0.0125 * K, 0.0115 * K, 0.009 * K]));
    out.push(S.ellipsoid(id, M.skin, hp(-0.004, -0.004, s * 0.077), hax, [0.012 * K, 0.026 * K, 0.018 * K]));
  }
}

export const SWEATERS = ['#d2402f', '#2f6fc0', '#e8b42a', '#2f9a55', '#8a4cc0', '#ee7d2a', '#2aa9b8', '#e86a9a', '#7a5236', '#3b3f46'];
export const PANTS = ['#2e3440', '#4a5568', '#5a4636', '#283a5a', '#6b6e74', '#3a4a3a'];
export const SKINS = ['#f1c9a6', '#e3b48c', '#d09a74', '#b98058', '#f5d6bb'];
export const HAIRS = ['#2a1d16', '#3d2a1e', '#5a3a22', '#1c1c1e', '#8a5a2e', '#b8894a'];
export const CAPS = ['#c2362b', '#1f4f9a', '#2e7a45', '#e0a21e', '#3a3f48', '#f0ede6'];
export const CHAIRS = ['#3a3f47', '#2c4f7a', '#7a2f2f', '#2f5f4a'];

const LIGHT = {
  dir: [0.32, 1.0, 0.42], col: [1.1, 1.06, 0.98], soft: 0.09,
  sky: [0.52, 0.52, 0.54], ground: [0.26, 0.22, 0.19],
  fill: { dir: [0.5, 0.4, 0.8], col: [0.17, 0.17, 0.19] }, aoK: 0.9, contact: 0.3, contactH: 0.05,
};
const WALLS = ['#e9e3d8', '#dfe6e6', '#ece2d2', '#e4e0ea'];
const FLOORS = [['#9a6c45', '#c79a6a'], ['#7d5a3e', '#a98257'], ['#b08a62', '#d4b48a']];
function roomEnv(m) {
  const R = m.room, fl = FLOORS[R.floor];
  const planks = RT.plankFloor({ plank: 0.16, plankL: 1.25, base: fl[0], dark: fl[0], light: fl[1] });
  const W = RT.lin(WALLS[R.wall]), SK = RT.lin('#f4f1ea'), FR = RT.lin('#f7f5f0'), GL = [RT.lin('#bcd6ea'), RT.lin('#e8f1f7')];
  const PIC = [RT.lin(R.pic[0]), RT.lin(R.pic[1]), RT.lin(R.pic[2])];
  const floor = (x, z, fp, out) => { if (R.rot) planks(z, x, fp, out); else planks(x, z, fp, out); };
  const wallFn = (isBack) => (a, y, fp, out) => {
    const n = RT.fbm(a * 5, y * 5, 3, fp);
    const src = y < 0.09 ? SK : W, kk = (y < 0.09 ? 1 : 0.97 + 0.05 * n) * (Math.abs(y - 0.09) < 0.004 ? 0.82 : 1);
    out[0] = src[0] * kk; out[1] = src[1] * kk; out[2] = src[2] * kk;
    const win = R.win;
    if (isBack === (win.wall === 'z') && a > win.a0 && a < win.a1 && y > win.y0 && y < win.y1) {
      const e = Math.min(a - win.a0, win.a1 - a, y - win.y0, win.y1 - y), mid = Math.abs(a - (win.a0 + win.a1) / 2);
      if (e < 0.05 || mid < 0.025) { out[0] = FR[0]; out[1] = FR[1]; out[2] = FR[2]; if (e < 0.008) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; } }
      else { const v = (y - win.y0) / (win.y1 - win.y0); RT.mixInto(out, GL[0], GL[1], 0.25 + 0.5 * v); out[0] *= 1.25; out[1] *= 1.25; out[2] *= 1.25; }
    }
    const P = R.picture;
    if (isBack === (P.wall === 'z') && a > P.a0 && a < P.a1 && y > P.y0 && y < P.y1) {
      const e = Math.min(a - P.a0, P.a1 - a, y - P.y0, P.y1 - y);
      if (e < 0.025) { out[0] = 0.06; out[1] = 0.05; out[2] = 0.045; }
      else if (e < 0.06) { out[0] = 0.85; out[1] = 0.83; out[2] = 0.8; }
      else { const v = (y - P.y0) / (P.y1 - P.y0), hz = v < 0.4 ? PIC[0] : v < 0.46 ? PIC[1] : PIC[2]; const g2 = RT.fbm(a * 9, y * 9, 2, fp * 9); out[0] = hz[0] * (0.85 + 0.3 * g2); out[1] = hz[1] * (0.85 + 0.3 * g2); out[2] = hz[2] * (0.85 + 0.3 * g2); }
    }
  };
  return { floorY: 0, floor, floorMat: { ks: 0.07, sh: 30 }, wallZ: 0, wall: wallFn(true), wallX: 0, wallXDir: 1, wallSide: wallFn(false), sky: RT.softSky };
}
function propShapes(out, m, M) {
  const S = RT.shape, T = m.room.table;
  if (T) {
    const { f, ax } = frameYaw(T.yaw), r = [-f[2], 0, f[0]];
    out.push(S.obox(ID.table, M.top, [T.x, 0.42, T.z], ax, [T.hw, 0.02, T.hd], 0.01));
    for (const a of [-1, 1]) for (const b of [-1, 1]) out.push(S.obox(ID.table, M.metal, [T.x + r[0] * a * (T.hw - 0.05) + f[0] * b * (T.hd - 0.06), 0.2, T.z + r[2] * a * (T.hw - 0.05) + f[2] * b * (T.hd - 0.06)], ax, [0.018, 0.2, 0.018], 0.006));
    out.push(S.obox(ID.table, M.mag, [T.x + f[0] * T.hd * 0.35, 0.445, T.z + f[2] * T.hd * 0.35], RT.frame([0, 1, 0], yawVec(T.yaw + 18)), [0.1, 0.006, 0.14], 0.003));
  }
  const Pl = m.room.plant;
  if (Pl) {
    out.push(S.frustum(ID.plant, M.pot, Pl.x, Pl.z, 0, 0.38, 0.15, 0.19));
    for (const [dx, y, dz, r] of [[0, 0.62, 0, 0.2], [0.11, 0.52, 0.05, 0.15], [-0.1, 0.55, -0.06, 0.16], [0.02, 0.78, -0.04, 0.14], [-0.05, 0.47, 0.11, 0.13]]) out.push(S.sphere(ID.plant, M.leaf, Pl.x + dx, y, Pl.z + dz, r));
  }
}

export function camBasis(m) {
  const C = m.cam, az = C.az * DEG, el = C.el * DEG, T = C.target;
  const eye = [T[0] + C.dist * Math.sin(az) * Math.cos(el), T[1] + C.dist * Math.sin(el), T[2] + C.dist * Math.cos(az) * Math.cos(el)];
  const F = norm3(sub3(T, eye)), R = norm3([-F[2], 0, F[0]]), U = cross3(R, F);
  return { eye, F, R, U };
}
const CAMS = new WeakMap();
export function camOf(m) {
  let c = CAMS.get(m);
  if (!c) { c = RT.camFromBasis({ ...camBasis(m), f: m.cam.f, cx: m.cam.cx, cy: m.cam.cy, W: VIEW.w, H: VIEW.h }); CAMS.set(m, c); }
  return c;
}
export function camNorm(b, p) { const d = sub3(p, b.eye), zc = dot3(d, b.F); return [dot3(d, b.R) / zc, -dot3(d, b.U) / zc, zc]; }
export function project(cam, p) { const q = cam.project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }
export function fitPoints(m) {
  const pts = [];
  for (const P of m.people) {
    const top = neckTop(P)[1] + 0.2 * P.k * HEAD_S;
    for (let a = 0; a < 360; a += 45) {
      const v = yawVec(a);
      pts.push([P.x + v[0] * 0.14, top, P.z + v[2] * 0.14], [P.x + v[0] * 0.5, 0.02, P.z + v[2] * 0.5], [P.x + v[0] * 0.3, 1.0, P.z + v[2] * 0.3]);
    }
  }
  return pts;
}

const MATS = new WeakMap();
function sceneMats(m) {
  let c = MATS.get(m);
  if (c) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const W0 = RT.lin('#8a5c3a'), W1 = RT.lin('#6a4228');
  const M = {
    metal: at({ c: RT.lin('#9aa0a8'), ks: 0.55, sh: 60 }), caster: at({ c: RT.lin('#2a2a2e'), ks: 0.3, sh: 30 }),
    chairD: at({ c: RT.lin('#26282c'), ks: 0.2, sh: 20 }), chair: CHAIRS.map((h) => at({ c: RT.lin(h), ks: 0.08, sh: 14 })),
    top: at({ c: W0, ks: 0.3, sh: 50, tex: (x, y, z, nx, ny, nz, s, out) => { const g2 = RT.fbm(x * 14 + z * 3, z * 14 - x * 3, 3); RT.mixInto(out, W0, W1, 0.2 + 0.6 * g2); } }),
    mag: at({ c: RT.lin('#d8452f'), ks: 0.2, sh: 30 }), pot: at({ c: RT.lin('#c06a3c'), ks: 0.1, sh: 20 }), leaf: at({ c: RT.lin('#3f8a3a'), ks: 0.12, sh: 20 }),
  };
  const people = m.people.map((P) => {
    const L = P.look;
    return {
      skin: at({ c: RT.lin(SKINS[L.skin]), ks: 0.08, sh: 16 }), hair: at({ c: RT.lin(HAIRS[L.hair]), ks: 0.1, sh: 18 }),
      top: at({ c: RT.lin(SWEATERS[L.top]), ks: 0.04, sh: 8 }), bottom: at({ c: RT.lin(PANTS[L.bottom]), ks: 0.04, sh: 8 }),
      shoe: at({ c: RT.lin('#26221f'), ks: 0.1, sh: 20 }), eye: at({ c: RT.lin('#141210'), ks: 0.5, sh: 60 }),
      capc: at({ c: RT.lin(CAPS[L.cap ?? 0]), ks: 0.05, sh: 10 }), metal: M.metal, caster: M.caster, chairD: M.chairD, chair: M.chair,
    };
  });
  c = { mats, M, people, env: roomEnv(m) };
  MATS.set(m, c);
  return c;
}
function staticShapes(m, C) {
  const shapes = [];
  propShapes(shapes, m, C.M);
  m.people.forEach((P, i) => chairBase(shapes, ID.base(i), P, C.M));
  return shapes;
}
function proxyShapes(m) {
  const out = [];
  for (const P of m.people) {
    out.push(RT.shape.cyl(-1, 0, P.x, P.z, SEAT_Y, neckTop(P)[1] + 0.12, 0.2));
    out.push(RT.shape.cyl(-1, 0, P.x, P.z, 0.12, SEAT_Y, 0.3));
  }
  return out;
}
export function dynamicShapes(m, tau, C = sceneMats(m), poses = null, only = -1) {
  const shapes = [];
  m.people.forEach((P, i) => {
    if (only >= 0 && i !== only) return;
    const q = poses ? poses[i] : poseAt(m, i, tau);
    chairBack(shapes, ID.back(i), P, q.b, C.people[i]);
    sitterShapes(shapes, ID.person(i), P, q.b, q.g, q.p, C.people[i]);
  });
  return shapes;
}
export function backgroundScene(m) {
  const C = sceneMats(m);
  return RT.makeScene({ cam: camOf(m), shapes: staticShapes(m, C), proxies: proxyShapes(m), mats: C.mats, light: LIGHT, env: C.env, exposure: 1.0 });
}
export function sceneAt(m, tau, opts = {}) {
  const C = sceneMats(m);
  const sc = RT.makeScene({ cam: camOf(m), shapes: staticShapes(m, C).concat(dynamicShapes(m, tau, C, opts.poses || null)), proxies: [], mats: C.mats, light: LIGHT, env: C.env, exposure: 1.0 });
  sc.fast = !!opts.fast;
  return sc;
}
const STATIC = new WeakMap();
export function sceneOne(m, i, pose, fast) {
  const C = sceneMats(m);
  let st = STATIC.get(m);
  if (!st) { st = staticShapes(m, C); STATIC.set(m, st); }
  const poses = m.people.map(() => null); poses[i] = pose;
  const sc = RT.makeScene({ cam: camOf(m), shapes: st.concat(dynamicShapes(m, 0, C, poses, i)), proxies: [], mats: C.mats, light: LIGHT, env: C.env, exposure: 1.0 });
  sc.fast = !!fast;
  return sc;
}
