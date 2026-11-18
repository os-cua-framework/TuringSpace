import * as RT from './_who_knocked_vase_rt.js';
export { RT };

export const VIEW = { w: 380, h: 384 };
export const DEG = Math.PI / 180;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
export const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const ID = { table: 20, vase: 21, seat: (i) => 30 + i, decor: (i) => 40 + i, person: (i) => 60 + i };
export const isPersonId = (id) => id >= 60 && id < 70;

export function axesOf(yawDeg) {
  const c = Math.cos(yawDeg * DEG), s = Math.sin(yawDeg * DEG);
  return { a: [c, -s], b: [s, c], ax: [[c, 0, -s], [0, 1, 0], [s, 0, c]] };
}
export function toWorld(P, lx, lz) { const { a, b } = axesOf(P.yaw); return [P.x + a[0] * lx + b[0] * lz, P.z + a[1] * lx + b[1] * lz]; }
export function toLocal(P, x, z) { const { a, b } = axesOf(P.yaw), dx = x - P.x, dz = z - P.z; return [dx * a[0] + dz * a[1], dx * b[0] + dz * b[1]]; }
export function rectDist(P, hx, hz, x, z) {
  const [u, v] = toLocal(P, x, z), du = Math.max(0, Math.abs(u) - hx), dv = Math.max(0, Math.abs(v) - hz);
  return Math.hypot(du, dv);
}

export const WOODS = [['#8a5a36', '#6e4426'], ['#b48a5e', '#8e6640'], ['#5a4a3e', '#3e322a'], ['#c8b090', '#a08868'], ['#3b3b3d', '#262628']];
function woodTex(a, b, panel = false) {
  const A = RT.lin(a), B = RT.lin(b);
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = Math.abs(ny) > 0.5 ? x * 0.7 + z * 0.7 : y;
    const g = RT.fbm(u * 3 + (x - z) * 18, (x + z) * 2 + y * 2, 3);
    RT.mixInto(out, A, B, 0.15 + 0.5 * g * (panel ? 0.8 : 1));
  };
}
function fabricTex(hex) {
  const A = RT.lin(hex);
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 60 + z * 13, y * 60 - z * 7, 2);
    const k = 0.9 + 0.16 * n; out[0] = A[0] * k; out[1] = A[1] * k; out[2] = A[2] * k;
  };
}
function roomEnv(m) {
  const R = m.room;
  const planks = RT.plankFloor({ plank: 0.15, plankL: 1.2, base: '#b88c63', dark: R.floorDark, light: R.floorLight });
  const rot = R.floorRot;
  const rug = R.rug, RA = rug ? RT.lin(rug.c0) : null, RB = rug ? RT.lin(rug.c1) : null;
  const floor = (x, z, fp, out) => {
    if (rot) planks(z, x, fp, out); else planks(x, z, fp, out);
    if (rug) {
      const [u, v] = toLocal(rug, x, z);
      if (Math.abs(u) < rug.hw && Math.abs(v) < rug.hd) {
        const edge = Math.min(rug.hw - Math.abs(u), rug.hd - Math.abs(v));
        const band = edge < 0.08 ? 0.12 : (Math.floor((u + rug.hw) / 0.2) % 2 === 0 ? 0.55 : 0.78);
        RT.mixInto(out, RA, RB, band);
        const n = RT.fbm(x * 30, z * 30, 2, fp * 30); const kk = 0.92 + 0.12 * n; out[0] *= kk; out[1] *= kk; out[2] *= kk;
      }
    }
  };
  const W = RT.lin(R.wall), SK = RT.lin('#f4f0e8'), TRIM = RT.lin('#f6f3ec'), PIC = R.pic.map(RT.lin);
  const H = m.door;
  const wallFn = (isZ) => (a, y, fp, out) => {
    const n = RT.fbm(a * 5, y * 5, 3, fp);
    const src = y < 0.09 ? SK : W, kk = (y < 0.09 ? 1 : 0.97 + 0.05 * n) * (Math.abs(y - 0.09) < 0.004 ? 0.82 : 1);
    out[0] = src[0] * kk; out[1] = src[1] * kk; out[2] = src[2] * kk;
    if (H && (H.wall === 'z') === isZ) {
      const c0 = H.a0 - 0.075, c1 = H.a1 + 0.075;
      if (a > c0 && a < c1 && y < H.y1 + 0.075) { out[0] = TRIM[0] * 0.96; out[1] = TRIM[1] * 0.96; out[2] = TRIM[2] * 0.96; if (a < c0 + 0.008 || a > c1 - 0.008 || y > H.y1 + 0.067) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; } }
    }
    const P = R.picture;
    if (P && (P.wall === 'z') === isZ && a > P.a0 && a < P.a1 && y > P.y0 && y < P.y1) {
      const e = Math.min(a - P.a0, P.a1 - a, y - P.y0, P.y1 - y);
      if (e < 0.03) { out[0] = 0.05; out[1] = 0.045; out[2] = 0.04; }
      else if (e < 0.075) { out[0] = 0.85; out[1] = 0.83; out[2] = 0.8; }
      else { const v = (y - P.y0) / (P.y1 - P.y0), hz = v < 0.42 ? PIC[0] : v < 0.47 ? PIC[1] : PIC[2]; const g = RT.fbm(a * 9, y * 9, 2, fp * 9); out[0] = hz[0] * (0.85 + 0.3 * g); out[1] = hz[1] * (0.85 + 0.3 * g); out[2] = hz[2] * (0.85 + 0.3 * g); }
    }
  };
  return {
    floorY: 0, floor, floorMat: { ks: 0.06, sh: 30 }, wallZ: 0, wall: wallFn(true), wallX: 0, wallXDir: 1, wallSide: wallFn(false),
    sky: RT.softSky, hole: H ? { wall: H.wall, a0: H.a0, a1: H.a1, y1: H.y1, depth: 1.5 } : null,
    hallFloor: RT.lin('#4a3a2e').map((v) => v * 0.9), hallWall: RT.lin('#5a5550').map((v) => v * 0.55), hallDim: 0.5,
  };
}

export function tableShapes(out, id, P, T, M) {
  const S = RT.shape, { ax } = axesOf(P.yaw), hl = T.L / 2, hd = T.D / 2, h = T.h;
  const W = (lx, y, lz) => { const p = toWorld(P, lx, lz); return [p[0], y, p[1]]; };
  const obx = (lx, ly, lz, hh, mat, bev = 0.005) => out.push(S.obox(id, mat, W(lx, ly, lz), ax, hh, bev));
  obx(0, h - 0.018, 0, [hl, 0.018, hd], M.top, 0.006);
  obx(0, h - 0.036 - 0.045, 0, [hl - 0.05, 0.045, hd - 0.05], M.wood, 0.004);
  for (const a of [-1, 1]) for (const b of [-1, 1]) obx(a * (hl - 0.045), (h - 0.036) / 2, b * (hd - 0.045), [0.022, (h - 0.036) / 2, 0.022], M.wood, 0.005);
  obx(0, 0.17, 0, [hl - 0.05, 0.012, hd - 0.05], M.wood, 0.004);
}
export function joltAt(m, tau) {
  const B = m.bump, u = (tau - (B.tb - 0.05)) / 0.18;
  if (u <= 0) return 0;
  if (u < 1) return 1.08 * smooth(u);
  if (u < 1.6) return 1.08 - 0.08 * smooth((u - 1) / 0.6);
  return 1;
}
export function tablePose(m, tau) {
  const T = m.table, j = joltAt(m, tau), B = m.bump;
  return { x: T.x + B.push[0] * B.D * j, z: T.z + B.push[1] * B.D * j, yaw: T.yaw + B.rot * j };
}

export function vaseParts(V) {
  const P = [];
  P.push(['ell', [0, 0.016, 0], [V.rf, 0.016, V.rf], 'glaze']);
  P.push(['ell', [0, V.hb, 0], [V.rb, V.hb, V.rb], 'glaze']);
  P.push(['cap', [0, 2 * V.hb - 0.035, 0], [0, V.H - 0.025, 0], V.rn, 'glaze']);
  P.push(['ell', [0, V.H - 0.012, 0], [V.rn + 0.014, 0.013, V.rn + 0.014], 'rim']);
  for (const fl of V.flowers) {
    const tip = [fl.dx, V.H + fl.h, fl.dz], mid = [fl.dx * 0.45, V.H + fl.h * 0.45, fl.dz * 0.45];
    P.push(['cap', [0, V.H - 0.06, 0], mid, 0.0085, 'stem']);
    P.push(['cap', mid, tip, 0.0085, 'stem']);
    P.push(['ell', add3(mid, [fl.dz * 0.5 + 0.02, 0.0, -fl.dx * 0.5]), [0.032, 0.01, 0.016], 'stem']);
    P.push(['sph', tip, fl.r, fl.col === 1 ? 'bloom2' : 'bloom']);
    P.push(['sph', add3(tip, [0, -0.012, 0]), fl.r * 0.45, 'heart']);
  }
  return P;
}
function lowestAt(V, th) {
  const pts = [[0, V.hb, V.rb, V.hb], [0, V.H - 0.012, V.rn + 0.014, 0.013]];
  let lo = Infinity;
  for (const [cx, cy, hx, hy] of pts) {
    const x = cx - V.rf, y = cy;
    const yc = -x * Math.sin(th) + y * Math.cos(th);
    const ext = Math.sqrt((hx * Math.sin(th)) ** 2 + (hy * Math.cos(th)) ** 2);
    lo = Math.min(lo, yc - ext);
  }
  return lo;
}
export function restAngle(V) {
  let a = 20 * DEG, b = 89.5 * DEG;
  if (lowestAt(V, b) > 0) return b;
  for (let i = 0; i < 40; i++) { const c = (a + b) / 2; if (lowestAt(V, c) > 0) a = c; else b = c; }
  return (a + b) / 2;
}
export function vaseTilt(m, tau) {
  const F = m.fall, s = tau - F.tw;
  if (s <= 0) return 0;
  const W = F.W;
  if (s < W) {
    const A = (F.A0 + (F.A1 - F.A0) * s / W) * DEG;
    return F.sign0 * A * Math.sin(2 * Math.PI * s / F.P);
  }
  const u = (s - W) / F.Df, th0 = F.A1 * DEG, thR = F.rest;
  if (u < 1) return th0 + (thR - th0) * u * u;
  const b = u - 1;
  return thR - F.bounce * DEG * Math.exp(-b * 3.2) * Math.abs(Math.sin(b * Math.PI * 2.2));
}
export const vaseState = (m, tau) => {
  const th = vaseTilt(m, tau), F = m.fall;
  return { th, fallen: tau >= F.tw + F.W + F.Df, falling: tau >= F.tw + F.W, tilted: Math.abs(th) >= 4 * DEG };
};
export function vaseFrame(m, tau) {
  const TP = tablePose(m, tau), T = m.table, V = m.vase;
  const bp = toWorld(TP, V.lx, V.lz), base = [bp[0], T.h, bp[1]];
  const { a, b } = axesOf(TP.yaw);
  const u = norm3([a[0] * V.ux + b[0] * V.uz, 0, a[1] * V.ux + b[1] * V.uz]);
  const Z = cross3(u, [0, 1, 0]);
  const th = vaseTilt(m, tau), sg = th < 0 ? -1 : 1, al = Math.abs(th);
  const piv = add3(base, u, sg * V.rf);
  const n = cross3([0, 1, 0], u.map((q) => q * sg)), c = Math.cos(al), s = Math.sin(al);
  const rot = (v) => add3(add3(v.map((q) => q * c), cross3(n, v), s), n, dot3(n, v) * (1 - c));
  const L2W = (p) => add3(add3(add3(base, u, p[0]), [0, 1, 0], p[1]), Z, p[2]);
  const W = (p) => add3(piv, rot(sub3(L2W(p), piv)));
  const R = (v) => rot(add3(add3(u.map((q) => q * v[0]), [0, v[1], 0]), Z, v[2]));
  return { W, R, base, u, th, piv };
}
export function vaseShapes(out, id, m, tau, M) {
  const F = vaseFrame(m, tau), S = RT.shape, ax = [F.R([1, 0, 0]), F.R([0, 1, 0]), F.R([0, 0, 1])];
  for (const p of vaseParts(m.vase)) {
    const mat = M[p[p.length - 1]];
    if (p[0] === 'ell') out.push(S.ellipsoid(id, mat, F.W(p[1]), ax, p[2]));
    else if (p[0] === 'cap') out.push(S.capsule(id, mat, F.W(p[1]), F.W(p[2]), p[3]));
    else out.push(S.sphere(id, mat, ...F.W(p[1]), p[2]));
  }
}
export function vaseAxis(m, tau) {
  const F = vaseFrame(m, tau), V = m.vase;
  return { pts: [F.W([0, 0.02, 0]), F.W([0, V.hb, 0]), F.W([0, V.H, 0]), F.W([0, V.H + V.flTop, 0])], r: [V.rb, V.rb, V.rn + 0.03, 0.07] };
}

export function seatFacing(S) { const { b } = axesOf(S.yaw); return b; }
export function seatShapes(out, id, S, M) {
  const sh = RT.shape, { ax } = axesOf(S.yaw), hw = S.w / 2, hd = S.d / 2, y = S.seatY;
  const P = { x: S.x, z: S.z, yaw: S.yaw };
  const W = (lx, ly, lz) => { const p = toWorld(P, lx, lz); return [p[0], ly, p[1]]; };
  const obx = (lx, ly, lz, hh, mat, bev = 0.02) => out.push(sh.obox(id, mat, W(lx, ly, lz), ax, hh, bev));
  const mat = M.seat[S.mi], leg = M.seatLeg;
  if (S.kind === 'armchair') {
    obx(0, 0.05, 0, [hw - 0.04, 0.05, hd - 0.04], leg, 0.01);
    obx(0, (0.1 + y - 0.07) / 2, 0.01, [hw - 0.02, (y - 0.17) / 2, hd - 0.02], mat, 0.03);
    obx(0, y - 0.045, 0.03, [hw - 0.12, 0.045, hd - 0.07], mat, 0.035);
    obx(0, (y + 0.78) / 2, -hd + 0.08, [hw - 0.02, (0.78 - y) / 2 + 0.02, 0.08], mat, 0.04);
    for (const s of [-1, 1]) obx(s * (hw - 0.06), y + 0.05, 0.0, [0.06, 0.12, hd - 0.02], mat, 0.04);
  } else if (S.kind === 'chair') {
    obx(0, y - 0.02, 0, [hw, 0.025, hd], mat, 0.012);
    for (const a of [-1, 1]) for (const b of [-1, 1]) obx(a * (hw - 0.03), (y - 0.045) / 2, b * (hd - 0.03), [0.018, (y - 0.045) / 2, 0.018], leg, 0.004);
    for (const a of [-1, 1]) obx(a * (hw - 0.03), y + 0.2, -hd + 0.03, [0.018, 0.2, 0.018], leg, 0.004);
    obx(0, y + 0.32, -hd + 0.03, [hw - 0.02, 0.07, 0.015], leg, 0.006);
  } else {
    obx(0, (y + 0.06) / 2 + 0.02, 0, [hw, (y - 0.06) / 2, hd], mat, 0.04);
    for (const a of [-1, 1]) for (const b of [-1, 1]) obx(a * (hw - 0.05), 0.025, b * (hd - 0.05), [0.02, 0.025, 0.02], leg, 0.004);
  }
}

function decorShapes(out, id, D, M) {
  const sh = RT.shape;
  if (D.kind === 'plant') {
    out.push(sh.frustum(id, M.pot, D.x, D.z, 0, 0.32, 0.15, 0.19));
    out.push(sh.cyl(id, M.soil, D.x, D.z, 0.3, 0.315, 0.175));
    for (const [x, y, z, r] of [[0, 0.62, 0, 0.2], [0.13, 0.5, 0.06, 0.15], [-0.12, 0.52, -0.05, 0.16], [0.03, 0.82, -0.04, 0.14], [-0.06, 0.45, 0.13, 0.13]]) out.push(sh.sphere(id, M.leaf, D.x + x, y, D.z + z, r));
  } else {
    out.push(sh.cyl(id, M.metal, D.x, D.z, 0, 0.025, 0.15, 0.008));
    out.push(sh.cyl(id, M.metal, D.x, D.z, 0.025, 1.42, 0.014));
    out.push(sh.frustum(id, M.shade, D.x, D.z, 1.32, 1.62, 0.22, 0.15));
  }
}

const ARM_U = 0.285, ARM_F = 0.27;
function ik2(a, b, l1, l2, pole) {
  let d = sub3(b, a), L = len3(d);
  const maxL = (l1 + l2) * 0.999;
  if (L > maxL) { d = d.map((q) => q * maxL / L); b = add3(a, d); L = maxL; }
  const u = d.map((q) => q / L), x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), hgt = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub3(pole, u.map((q) => q * dot3(pole, u)));
  if (len3(p) < 1e-6) p = [0, -1, 0];
  p = norm3(p);
  return { mid: add3(add3(a, u, x), p, hgt), end: b };
}
export function bodyJoints(B) {
  const k = B.k, f = [B.f[0], 0, B.f[1]], r = [-B.f[1], 0, B.f[0]], up = [0, 1, 0];
  const w = B.walking || 0, ph = B.gait || 0, sit = B.sit || null, sg = sit ? smooth(sit.s) : 0;
  const lam = ((B.lean || 0) + (sit ? 24 * Math.sin(Math.PI * clamp01(sit.s)) - 4 * sg : 0)) * DEG, side = (B.side || 0) * DEG;
  const base = [B.x, 0, B.z];
  const P = (o, sd, fw, upv) => [o[0] + r[0] * sd + f[0] * fw, upv, o[2] + r[2] * sd + f[2] * fw];
  const bob = 0.012 * k * w * Math.cos(2 * ph);
  let pelvis = [B.x - f[0] * 0.1 * Math.sin(lam) * k, 0.97 * k + bob, B.z - f[2] * 0.1 * Math.sin(lam) * k];
  if (sit) pelvis = lerp3(pelvis, [sit.S[0], sit.seatY + 0.085 * k, sit.S[1]], sg);
  const tor = norm3(add3(add3(up.map((q) => q * Math.cos(lam) * Math.cos(side)), f, Math.sin(lam)), r, Math.sin(side)));
  const legs = [-1, 1].map((s) => {
    const sw = s < 0 ? Math.sin(ph) : -Math.sin(ph), lift = s < 0 ? Math.max(0, Math.cos(ph)) : Math.max(0, -Math.cos(ph));
    let ankle = P(base, s * 0.1 * k, 0.24 * k * w * sw, 0.085 * k + 0.07 * k * w * lift);
    if (sit) ankle = lerp3(ankle, P([sit.S[0], 0, sit.S[1]], s * 0.1 * k, 0.47 * k, 0.085 * k), sg);
    const hip = add3(pelvis, r, s * 0.088 * k);
    const knee = ik2(hip, ankle, 0.43 * k, 0.43 * k, add3(f, up, 0.05)).mid;
    return { hip, knee, ankle };
  });
  const T = (d, sd = 0) => add3(add3(pelvis, tor, d * k), r, sd * k);
  const arms = [-1, 1].map((s) => {
    const sh = T(0.44, s * 0.185);
    const sw = (s < 0 ? -1 : 1) * Math.sin(ph) * 0.14 * k * w;
    let hand = add3(add3(add3(sh, [0, -1, 0], 0.5 * k), f, sw + 0.03 * k), r, s * 0.03 * k);
    if (sit) hand = lerp3(hand, P([sit.S[0], 0, sit.S[1]], s * 0.14 * k, 0.3 * k, sit.seatY + 0.16 * k), sg);
    const pole = add3(add3(r.map((q) => q * s * 0.45), [0, -1, 0], 0.7), f, -0.3);
    const j = ik2(sh, hand, ARM_U * k, ARM_F * k, pole);
    return { sh, el: j.mid, hand: j.end };
  });
  const neck0 = T(0.49), neck1 = T(0.585);
  let hf = norm3(sub3(f, tor.map((q) => q * dot3(f, tor))));
  if (B.look && B.lookW > 0) {
    const d = sub3(B.look, neck1), dh = Math.hypot(d[0], d[2]);
    if (dh > 1e-6) {
      let yaw = Math.atan2(d[0], d[2]) - Math.atan2(f[0], f[2]);
      yaw = ((yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      yaw = Math.max(-75 * DEG, Math.min(75 * DEG, yaw)) * B.lookW;
      const pitch = Math.max(-0.35, Math.min(0.75, Math.atan2(-d[1], dh))) * B.lookW;
      const g = Math.atan2(f[0], f[2]) + yaw;
      hf = norm3([Math.sin(g) * Math.cos(pitch), -Math.sin(pitch), Math.cos(g) * Math.cos(pitch)]);
    }
  }
  return { k, f, r, up, tor, pelvis, legs, arms, neck0, neck1, hf };
}
export function personShapes(out, id, J, mats, hair) {
  const S = RT.shape, k = J.k, f = J.f;
  const ax = RT.frame(J.tor, f);
  for (const L of J.legs) {
    out.push(S.capsule(id, mats.bottom, L.hip, L.knee, 0.068 * k));
    out.push(S.capsule(id, mats.bottom, L.knee, L.ankle, 0.052 * k));
    const fa = RT.frame([0, 1, 0], f);
    out.push(S.ellipsoid(id, mats.shoe, [L.ankle[0] + f[0] * 0.045 * k, L.ankle[1] - 0.045 * k, L.ankle[2] + f[2] * 0.045 * k], fa, [0.05 * k, 0.042 * k, 0.125 * k]));
  }
  const T = (d) => add3(J.pelvis, J.tor, d * k);
  out.push(S.ellipsoid(id, mats.bottom, J.pelvis, ax, [0.165 * k, 0.115 * k, 0.11 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.16), ax, [0.15 * k, 0.17 * k, 0.098 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.36), ax, [0.18 * k, 0.19 * k, 0.11 * k]));
  out.push(S.capsule(id, mats.top, add3(T(0.44), J.r, -0.13 * k), add3(T(0.44), J.r, 0.13 * k), 0.064 * k));
  for (const A of J.arms) {
    out.push(S.capsule(id, mats.top, A.sh, A.el, 0.048 * k));
    out.push(S.capsule(id, mats.skin, A.el, A.hand, 0.038 * k));
    const d = sub3(A.hand, A.el);
    out.push(S.ellipsoid(id, mats.skin, add3(A.hand, d, 0.16), RT.frame(d, f), [0.028 * k, 0.055 * k, 0.04 * k]));
  }
  out.push(S.capsule(id, mats.skin, J.neck0, J.neck1, 0.048 * k));
  const hu = norm3(sub3(J.tor, J.hf.map((q) => q * dot3(J.tor, J.hf))));
  const hax = RT.frame(hu, J.hf), hr = hax[0];
  const hc = add3(add3(J.neck1, hu, 0.065 * k), J.hf, 0.012 * k);
  const hp = (fw, u, sd = 0) => add3(add3(add3(hc, J.hf, fw * k), hu, u * k), hr, sd * k);
  out.push(S.ellipsoid(id, mats.skin, hc, hax, [0.078 * k, 0.108 * k, 0.095 * k]));
  out.push(S.ellipsoid(id, mats.hair, hp(-0.03, 0.026), hax, [0.084 * k, 0.1 * k, 0.09 * k]));
  if (hair === 'long') out.push(S.ellipsoid(id, mats.hair, hp(-0.065, -0.08), hax, [0.082 * k, 0.13 * k, 0.05 * k]));
  else if (hair === 'bun') out.push(S.sphere(id, mats.hair, ...hp(-0.085, 0.07), 0.045 * k));
  out.push(S.ellipsoid(id, mats.skin, hp(0.095, -0.012), hax, [0.015 * k, 0.024 * k, 0.022 * k]));
  for (const s of [-1, 1]) out.push(S.ellipsoid(id, mats.skin, hp(-0.002, -0.005, s * 0.078), hax, [0.012 * k, 0.026 * k, 0.018 * k]));
}

export const WALK_EASE = 0.3, TURN_T = 0.6, SIT_T = 0.95;
export function walkDur(len, v, ei, eo) { return len / v + ((ei ? WALK_EASE : 0) + (eo ? WALK_EASE : 0)) / 2; }
export function walkS(seg, t) {
  const v = seg.v, T = seg.t1 - seg.t0, tt = Math.max(0, Math.min(T, t - seg.t0));
  const ei = seg.ei ? WALK_EASE : 0, eo = seg.eo ? WALK_EASE : 0;
  let s;
  if (ei && tt < ei) s = 0.5 * v * tt * tt / ei;
  else if (tt <= T - eo) s = 0.5 * v * ei + v * (tt - ei);
  else { const w = T - tt; s = seg.len - 0.5 * v * w * w / eo; }
  return Math.max(0, Math.min(seg.len, s));
}
export function walkSpeed(seg, t) {
  const T = seg.t1 - seg.t0, tt = t - seg.t0, ei = seg.ei ? WALK_EASE : 0, eo = seg.eo ? WALK_EASE : 0;
  if (tt < 0 || tt > T) return 0;
  if (ei && tt < ei) return tt / ei;
  if (eo && tt > T - eo) return (T - tt) / eo;
  return 1;
}
export function walkTimeAt(seg, s) { const ei = seg.ei ? WALK_EASE : 0; return ei + (s - 0.5 * seg.v * ei) / seg.v; }
export function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
export function pathAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) { const u = l > 0 ? clamp01(s / l) : 1; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    s -= l;
  }
  return pts[pts.length - 1].slice();
}
export function headingAt(pts, s, L) {
  const a = pathAt(pts, Math.max(0, s - 0.25)), b = pathAt(pts, Math.min(L, s + 0.25));
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]);
  return l > 1e-6 ? [d[0] / l, d[1] / l] : null;
}
export const turnTo = (a, b, u, dir = 0) => {
  const ang0 = Math.atan2(a[1], a[0]); let d = Math.atan2(b[1], b[0]) - ang0;
  d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  if (dir && Math.abs(Math.abs(d) - Math.PI) < 0.35 && Math.sign(d) !== dir) d += dir * 2 * Math.PI;
  const g = ang0 + d * u; return [Math.cos(g), Math.sin(g)];
};
export function segEnd(s) { return s.k === 'sit' ? Infinity : s.t1; }
export function personAt(m, i, tau) {
  const p = m.people[i], segs = p.segs;
  if (tau < segs[0].t0) return null;
  let si = segs.length - 1;
  for (let j = 0; j < segs.length; j++) if (tau <= segEnd(segs[j])) { si = j; break; }
  const s = segs[si], prev = segs[si - 1] || null;
  let B;
  if (s.k === 'walk') {
    const sd = walkS(s, tau), q = pathAt(s.pts, sd);
    let f = headingAt(s.pts, sd, s.len) || s.f0 || [1, 0];
    if (s.f0) f = turnTo(s.f0, f, smooth((tau - s.t0) / 0.35));
    const sp = walkSpeed(s, tau);
    B = { x: q[0], z: q[1], f, k: p.k, gait: 2 * Math.PI * sd / (1.3 * p.k) + p.ph0, walking: sp, mode: 'walk', seated: false, speed: sp * s.v };
  } else if (s.k === 'stand') {
    const f = turnTo(s.f0, s.f1, smooth((tau - s.t0) / 0.5));
    B = { x: s.p[0], z: s.p[1], f, k: p.k, gait: 0, walking: 0, mode: 'stand', seated: false, speed: 0 };
  } else {
    const u = tau - s.t0;
    const f = turnTo(s.f0, s.f, smooth(u / TURN_T), s.turnDir);
    const sv = clamp01((u - TURN_T * 0.85) / SIT_T);
    B = { x: s.A[0], z: s.A[1], f, k: p.k, gait: 0, walking: u < TURN_T ? 0.25 * Math.sin(Math.PI * clamp01(u / TURN_T)) : 0,
      sit: { s: sv, S: s.S, seatY: s.seatY }, mode: sv >= 1 ? 'seated' : 'sit', seated: sv >= 1, speed: 0 };
  }
  if (p.sway) {
    const u = (tau - p.sway.t + 0.04) / 0.5;
    if (u > 0 && u < 1) { const e = Math.sin(Math.PI * u); B.side = p.sway.deg * e; B.x += p.sway.dx[0] * e; B.z += p.sway.dx[1] * e; }
  }
  for (const L of p.looks || []) {
    if (tau >= L.t0 && tau <= L.t1) { B.look = L.p; B.lookW = Math.min(smooth((tau - L.t0) / 0.3), smooth((L.t1 - tau) / 0.3)); }
  }
  return B;
}
export function bodyFloor(B) {
  if (!B) return null;
  if (B.sit && B.sit.s > 0) { const u = smooth(B.sit.s); return [lerp(B.x, B.sit.S[0], u), lerp(B.z, B.sit.S[1], u)]; }
  return [B.x, B.z];
}

export function camOf(m) {
  const C = m.cam;
  return RT.camFromBasis({ eye: C.eye, F: C.F, R: C.R, U: C.U, f: C.f, cx: C.cx, cy: C.cy, W: VIEW.w, H: VIEW.h });
}
export function camBasis(az, el, dist, target) {
  const a = az * DEG, e = el * DEG;
  const eye = [target[0] + dist * Math.sin(a) * Math.cos(e), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(a) * Math.cos(e)];
  const F = norm3(sub3(target, eye)), R = norm3([-F[2], 0, F[0]]), U = cross3(R, F);
  return { eye, F, R, U };
}

const MATS = new WeakMap();
export function sceneMats(m) {
  let c = MATS.get(m);
  if (c) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const wd = WOODS[m.table.wood];
  const F = {
    top: at({ c: RT.lin(wd[0]), ks: 0.28, sh: 50, tex: woodTex(wd[0], wd[1]) }), wood: at({ c: RT.lin(wd[0]), ks: 0.12, sh: 30, tex: woodTex(wd[0], wd[1], true) }),
    seat: m.seats.map((S) => at({ c: RT.lin(S.col), ks: 0.05, sh: 10, tex: fabricTex(S.col) })), seatLeg: at({ c: RT.lin(WOODS[m.room.legWood][1]), ks: 0.15, sh: 30 }),
    pot: at({ c: RT.lin('#b86a45'), ks: 0.12, sh: 20 }), soil: at({ c: RT.lin('#3a2a1e'), ks: 0.02, sh: 5 }), leaf: at({ c: RT.lin('#3f7f3a'), ks: 0.1, sh: 20 }),
    metal: at({ c: RT.lin('#2c2c2e'), ks: 0.5, sh: 60 }), shade: at({ c: RT.lin('#efe6d2'), ks: 0.05, sh: 10 }),
  };
  const V = m.vase;
  const VM = {
    glaze: at({ c: RT.lin(V.col), ks: 0.55, sh: 70, env: 0.2 }), rim: at({ c: RT.lin(V.col2), ks: 0.5, sh: 60 }),
    stem: at({ c: RT.lin('#3d7a32'), ks: 0.05, sh: 10 }), bloom: at({ c: RT.lin(V.bloom[0]), ks: 0.08, sh: 14 }),
    bloom2: at({ c: RT.lin(V.bloom[1]), ks: 0.08, sh: 14 }), heart: at({ c: RT.lin('#e8c23a'), ks: 0.05, sh: 10 }),
  };
  const PM = m.people.map((p) => ({
    skin: at({ c: RT.lin(p.skin), ks: 0.06, sh: 14 }), hair: at({ c: RT.lin(p.hairCol), ks: 0.08, sh: 16 }),
    top: at({ c: RT.lin(p.top), ks: 0.04, sh: 8 }), bottom: at({ c: RT.lin(p.bottom), ks: 0.04, sh: 8 }), shoe: at({ c: RT.lin(p.shoe), ks: 0.1, sh: 20 }),
  }));
  c = { mats, F, VM, PM, env: roomEnv(m) };
  MATS.set(m, c);
  return c;
}
export function lightOf(m) {
  return {
    dir: m.light.dir, col: [1.12, 1.07, 0.98], soft: 0.07,
    sky: [0.5, 0.5, 0.52], ground: [0.24, 0.2, 0.17],
    fill: { dir: m.light.fill, col: [0.16, 0.16, 0.18] }, aoK: 0.9, contact: 0.3, contactH: 0.05,
  };
}
export function staticShapes(m) {
  const C = sceneMats(m), out = [];
  m.seats.forEach((S, i) => seatShapes(out, ID.seat(i), S, C.F));
  (m.decor || []).forEach((D, i) => decorShapes(out, ID.decor(i), D, C.F));
  return out;
}
export function dynamicShapes(m, tau, only = null) {
  const C = sceneMats(m), groups = [];
  if (!only || only.has(ID.table)) { const out = []; tableShapes(out, ID.table, tablePose(m, tau), m.table, C.F); groups.push({ id: ID.table, shapes: out }); }
  if (!only || only.has(ID.vase)) { const out = []; vaseShapes(out, ID.vase, m, tau, C.VM); groups.push({ id: ID.vase, shapes: out }); }
  m.people.forEach((p, i) => {
    if (only && !only.has(ID.person(i))) return;
    const B = personAt(m, i, tau);
    if (!B) return;
    const out = []; personShapes(out, ID.person(i), bodyJoints(B), C.PM[i], p.hair); groups.push({ id: ID.person(i), shapes: out });
  });
  return groups;
}
const STATIC_CACHE = new WeakMap();
export function staticCached(m) { let s = STATIC_CACHE.get(m); if (!s) { s = staticShapes(m); STATIC_CACHE.set(m, s); } return s; }
export function sceneAt(m, tau, opts = {}) {
  const C = sceneMats(m), shapes = staticCached(m).slice();
  if (!opts.staticOnly) for (const g of dynamicShapes(m, tau)) for (const s of g.shapes) shapes.push(s);
  const sc = RT.makeScene({ cam: camOf(m), shapes, mats: C.mats, light: lightOf(m), env: C.env, exposure: 1.0 });
  sc.fast = !!opts.fast;
  return sc;
}
export function dirtyRects(m, tau, groups, cam = camOf(m)) {
  const L = norm3(m.light.dir), rects = [];
  const push = (pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); if (q.z <= 0.05) { x0 = 0; y0 = 0; x1 = VIEW.w; y1 = VIEW.h; break; } x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    x0 = Math.max(0, Math.floor(x0) - 3); y0 = Math.max(0, Math.floor(y0) - 3); x1 = Math.min(VIEW.w, Math.ceil(x1) + 3); y1 = Math.min(VIEW.h, Math.ceil(y1) + 3);
    if (x1 > x0 && y1 > y0) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };
  for (const g of groups) {
    let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const s of g.shapes) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], s.bb[i]); b[i + 3] = Math.max(b[i + 3], s.bb[i + 3]); }
    const corners = [];
    for (let c = 0; c < 8; c++) corners.push([c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]]);
    const pts = corners.slice();
    for (const p of corners) {
      let t = Infinity;
      if (L[1] > 1e-6) t = Math.min(t, p[1] / L[1]);
      if (L[2] > 1e-6 && p[2] > 0) t = Math.min(t, p[2] / L[2]);
      if (L[0] > 1e-6 && p[0] > 0) t = Math.min(t, p[0] / L[0]);
      if (Number.isFinite(t)) pts.push([p[0] - L[0] * t, p[1] - L[1] * t, p[2] - L[2] * t]);
    }
    push(pts);
  }
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j];
      if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) {
        const x0 = Math.min(a.x, c.x), y0 = Math.min(a.y, c.y), x1 = Math.max(a.x + a.w, c.x + c.w), y1 = Math.max(a.y + a.h, c.y + c.h);
        rects[i] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; rects.splice(j, 1); changed = true; break outer;
      }
    }
  }
  return rects;
}
export function renderBackground(m, q = 1, ss = 1) {
  const sc = sceneAt(m, 0, { fast: true, staticOnly: true });
  const img = RT.render(sc, q, ss); img.ss = ss;
  return img;
}
export function renderFrame(m, tau, bg) {
  const C = sceneMats(m), groups = dynamicShapes(m, tau), cam = camOf(m);
  const shapes = staticCached(m).slice();
  for (const g of groups) for (const s of g.shapes) shapes.push(s);
  const sc = RT.makeScene({ cam, shapes, mats: C.mats, light: lightOf(m), env: C.env, exposure: 1.0 });
  sc.fast = true;
  const rects = dirtyRects(m, tau, groups, cam);
  const img = RT.traceRects(sc, bg, rects);
  img.rects = rects;
  return img;
}
