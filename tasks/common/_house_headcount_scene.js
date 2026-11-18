import * as RT from './_house_headcount_rt.js';
export { RT };

export const VIEW = { w: 380, h: 384 };
const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const ID = { house: 1, hedge: 2, tree: 3, person: (i) => 100 + i };
export const isStaticId = (id) => id >= 0 && id < 100;
export const personIndex = (id) => (id >= 100 && id < 200 ? id - 100 : -1);

export const WALLS = ['#e9e2d0', '#cdd6da', '#d9c9a6', '#b9c8b0', '#e8d6a8', '#c98a68', '#f1eee6'];
export const ROOFS = ['#7a3a2e', '#4a4f58', '#6b5141', '#3d4b40'];
export const DOORS = ['#2f5d8a', '#8a2f2f', '#2f6a4a', '#6a4a30', '#c39a3c'];
export const TOPS = ['#c8372d', '#2f8f46', '#e2b822', '#e0702a', '#7a4bb0', '#ece8e0', '#e07aa0', '#2a9a9a', '#3a66b8', '#2b2b30'];
export const LOOK_BASE = ['#3a66b8', '#c8372d', '#2f8f46', '#e0702a'];
export const LOOK_TWIN = { '#3a66b8': '#4170c0', '#c8372d': '#c0402f', '#2f8f46': '#37944c', '#e0702a': '#d97830' };
export const BOTTOMS = ['#34405a', '#2a2a2e', '#6b6e74', '#a89470', '#6a4a34', '#3f5a3c'];
export const HAIRS = ['#2a1f1a', '#5a3a22', '#a8743a', '#d6bd86', '#8c8c8c', '#141414'];
export const HAIR_DARK = ['#2a1f1a', '#5a3a22', '#141414'], HAIR_LIGHT = ['#a8743a', '#d6bd86', '#8c8c8c'];
export const SKINS = ['#e8c4a8', '#d4a07a', '#a8704a', '#7a4a2e', '#f0d0b8'];

export function houseMetrics(H) {
  const s = H.hr / (H.D / 2), al = Math.atan(s);
  return { s, al, ridge: H.hw + H.hr, zFront: H.D / 2, zIn: H.D / 2 - H.th, door: [H.xd, H.D / 2] };
}
function boxAt(out, id, m, x0, x1, y0, y1, z0, z1, bev = 0.006) {
  out.push(RT.shape.box(id, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, bev));
}
function houseShapes(out, Hs, M) {
  const id = ID.house, { W, D, hw, hr, th, ov, dw, dh, xd } = Hs, { s, al } = houseMetrics(Hs);
  boxAt(out, id, M.wall, -W / 2, W / 2, 0, hw, -D / 2, -D / 2 + th, 0.004);
  boxAt(out, id, M.wall, -W / 2, xd - dw / 2, 0, hw, D / 2 - th, D / 2, 0.004);
  boxAt(out, id, M.wall, xd + dw / 2, W / 2, 0, hw, D / 2 - th, D / 2, 0.004);
  boxAt(out, id, M.wall, xd - dw / 2, xd + dw / 2, dh, hw, D / 2 - th, D / 2, 0.004);
  const n1 = Math.hypot(1, s);
  for (const sg of [-1, 1]) {
    const x0 = sg < 0 ? -W / 2 : W / 2 - th, x1 = sg < 0 ? -W / 2 + th : W / 2;
    const planes = [[-1, 0, 0, -x0], [1, 0, 0, x1], [0, -1, 0, 0], [0, 0, 1, D / 2], [0, 0, -1, D / 2], [0, 1 / n1, s / n1, (hw + hr) / n1], [0, 1 / n1, -s / n1, (hw + hr) / n1]];
    const pts = [];
    for (const x of [x0, x1]) for (const [z, y] of [[-D / 2, 0], [D / 2, 0], [D / 2, hw], [0, hw + hr], [-D / 2, hw]]) pts.push([x, y, z]);
    out.push(RT.shape.convex(id, M.wall, planes, pts));
  }
  const tr = 0.09, ovx = 0.22, run = D / 2 + ov, Ls = run / Math.cos(al);
  for (const sg of [-1, 1]) {
    const nrm = [0, Math.cos(al), sg * Math.sin(al)], down = [0, -Math.sin(al), sg * Math.cos(al)];
    const mid = [0, hw + hr - s * run / 2, sg * run / 2];
    out.push(RT.shape.obox(id, M.roof, add3(mid, nrm, tr / 2), [[1, 0, 0], nrm, down], [W / 2 + ovx, tr / 2, Ls / 2], 0.01));
  }
  out.push(RT.shape.capsule(id, M.ridge, [-W / 2 - ovx, hw + hr + tr * 0.85, 0], [W / 2 + ovx, hw + hr + tr * 0.85, 0], 0.075));
  boxAt(out, id, M.floorIn, -W / 2 + th, W / 2 - th, 0, 0.03, -D / 2 + th, D / 2 - th, 0.002);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxAt(out, id, M.trim, sx * W / 2 - 0.075, sx * W / 2 + 0.075, 0, hw, sz * D / 2 - 0.075, sz * D / 2 + 0.075, 0.01);
  const zf = D / 2, cz0 = zf - 0.01, cz1 = zf + 0.035;
  boxAt(out, id, M.trim, xd - dw / 2 - 0.1, xd - dw / 2, 0, dh + 0.1, cz0, cz1, 0.006);
  boxAt(out, id, M.trim, xd + dw / 2, xd + dw / 2 + 0.1, 0, dh + 0.1, cz0, cz1, 0.006);
  boxAt(out, id, M.trim, xd - dw / 2 - 0.1, xd + dw / 2 + 0.1, dh, dh + 0.1, cz0, cz1, 0.006);
  boxAt(out, id, M.step, xd - 0.62, xd + 0.62, 0, 0.035, zf, zf + 0.42, 0.01);
  boxAt(out, id, M.plaster, -W / 2 + th, W / 2 - th, 0.03, hw, -D / 2 + th, -D / 2 + th + 0.012, 0.002);
  boxAt(out, id, M.plaster, -W / 2 + th, -W / 2 + th + 0.012, 0.03, hw, -D / 2 + th, D / 2 - th, 0.002);
  boxAt(out, id, M.plaster, W / 2 - th - 0.012, W / 2 - th, 0.03, hw, -D / 2 + th, D / 2 - th, 0.002);
  {
    const hs = -Hs.hide, hinge = [xd + hs * dw / 2, 0, zf - th], phi = 168 * DEG;
    const dir = [-hs * Math.cos(phi), 0, -Math.sin(phi)], ax = [dir, [0, 1, 0], [-dir[2], 0, dir[0]]];
    const c = [hinge[0] + dir[0] * (dw / 2), dh / 2, hinge[2] + dir[2] * (dw / 2)];
    out.push(RT.shape.obox(id, M.door, add3(c, [hs * 0.0, 0, 0]), ax, [dw / 2 - 0.03, dh / 2 - 0.015, 0.024], 0.008));
    out.push(RT.shape.sphere(id, M.knob, c[0] + dir[0] * (dw / 2 - 0.12) + ax[2][0] * 0.04, 1.0, c[2] + dir[2] * (dw / 2 - 0.12) + ax[2][2] * 0.04, 0.028));
  }
  for (const w of Hs.win) {
    const fr = 0.05, a = w.a, y = w.y, S = w.s;
    if (w.wall === 'front') {
      const z0 = zf - 0.025, z1 = zf + 0.03;
      boxAt(out, id, M.glass, a - S, a + S, y - S, y + S, zf - 0.03, zf + 0.012, 0.002);
      boxAt(out, id, M.trim, a - S - fr, a + S + fr, y + S, y + S + fr, z0, z1); boxAt(out, id, M.trim, a - S - fr, a + S + fr, y - S - fr * 1.6, y - S, z0, z1 + 0.02);
      boxAt(out, id, M.trim, a - S - fr, a - S, y - S, y + S, z0, z1); boxAt(out, id, M.trim, a + S, a + S + fr, y - S, y + S, z0, z1);
      boxAt(out, id, M.trim, a - 0.018, a + 0.018, y - S, y + S, z0, z1 - 0.01); boxAt(out, id, M.trim, a - S, a + S, y - 0.018, y + 0.018, z0, z1 - 0.01);
    } else {
      const sg = w.side, xf = sg * W / 2, x0 = sg > 0 ? xf - 0.025 : xf - 0.03, x1 = sg > 0 ? xf + 0.03 : xf + 0.025;
      boxAt(out, id, M.glass, sg > 0 ? xf - 0.03 : xf - 0.012, sg > 0 ? xf + 0.012 : xf + 0.03, y - S, y + S, a - S, a + S, 0.002);
      boxAt(out, id, M.trim, x0, x1, y + S, y + S + fr, a - S - fr, a + S + fr); boxAt(out, id, M.trim, x0 - (sg < 0 ? 0.02 : 0), x1 + (sg > 0 ? 0.02 : 0), y - S - fr * 1.6, y - S, a - S - fr, a + S + fr);
      boxAt(out, id, M.trim, x0, x1, y - S, y + S, a - S - fr, a - S); boxAt(out, id, M.trim, x0, x1, y - S, y + S, a + S, a + S + fr);
      boxAt(out, id, M.trim, x0, x1, y - S, y + S, a - 0.018, a + 0.018); boxAt(out, id, M.trim, x0, x1, y - 0.018, y + 0.018, a - S, a + S);
    }
  }
}

function decorShapes(out, m, M) {
  const g = m.garden;
  for (const e of g.hedge) out.push(RT.shape.ellipsoid(ID.hedge, M.hedge, [e[0], e[3], e[1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [e[2], e[3], e[4]]));
  for (const t of g.trees) {
    out.push(RT.shape.cyl(ID.tree, M.trunk, t.x, t.z, 0, t.h, 0.13, 0.01));
    for (const c of t.crown) out.push(RT.shape.sphere(ID.tree, M.leaf, t.x + c[0], c[1], t.z + c[2], c[3]));
  }
}

function boardsTex(hex) {
  const A = RT.lin(hex), B = A.map((v) => v * 0.78);
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = y / 0.165, f = u - Math.floor(u), row = Math.floor(u);
    const tone = 0.94 + 0.08 * RT.hash2(row, 3) + 0.04 * RT.fbm((x + z) * 6, y * 30, 2);
    const shade = f < 0.12 ? 0.8 + 1.6 * f : 1;
    out[0] = A[0] * tone * shade; out[1] = A[1] * tone * shade; out[2] = A[2] * tone * shade;
    if (Math.abs(ny) > 0.5) { out[0] = B[0]; out[1] = B[1]; out[2] = B[2]; }
  };
}
function tilesTex(hex) {
  const A = RT.lin(hex);
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = y / 0.105, row = Math.floor(u), f = u - row, col = Math.floor((x + (row % 2) * 0.11) / 0.22);
    const tone = 0.88 + 0.2 * RT.hash2(row * 31 + col, 7), edge = f > 0.86 ? 0.62 : 1 - 0.18 * (1 - f);
    const k = tone * edge; out[0] = A[0] * k; out[1] = A[1] * k; out[2] = A[2] * k;
  };
}
function planksTex(a, b) {
  const A = RT.lin(a), B = RT.lin(b);
  return (x, y, z, nx, ny, nz, s, out) => {
    const row = Math.floor(x / 0.14), g = RT.fbm(x * 3 + row * 1.7, z * 1.2, 2);
    RT.mixInto(out, A, B, 0.3 + 0.4 * RT.hash2(row, 5) + 0.2 * g);
    if (x / 0.14 - row < 0.06) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; }
  };
}
function leafTex(hex) {
  const A = RT.lin(hex), B = A.map((v) => v * 0.55);
  return (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 9 + z * 3, y * 9 - z * 5, 3); RT.mixInto(out, B, A, 0.25 + 0.9 * n); };
}
const MATS = new WeakMap();
export function sceneMats(m) {
  let c = MATS.get(m);
  if (c && c.P.length === m.people.length) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const Hs = m.house;
  const M = {
    wall: at({ c: RT.lin(Hs.wall), ks: 0.04, sh: 10, tex: boardsTex(Hs.wall) }),
    roof: at({ c: RT.lin(Hs.roof), ks: 0.08, sh: 20, tex: tilesTex(Hs.roof) }),
    ridge: at({ c: RT.lin(Hs.roof).map((v) => v * 0.7), ks: 0.1, sh: 20 }),
    trim: at({ c: RT.lin('#f4f2ec'), ks: 0.06, sh: 16 }),
    door: at({ c: RT.lin(Hs.door), ks: 0.18, sh: 30 }),
    knob: at({ c: RT.lin('#c9a44a'), ks: 0.7, sh: 80 }),
    glass: at({ c: RT.lin('#2c3a48'), ks: 0.55, sh: 90, env: 0.35 }),
    step: at({ c: RT.lin('#a7a39b'), ks: 0.04, sh: 10 }),
    floorIn: at({ c: RT.lin('#b8946a'), ks: 0.1, sh: 20, tex: planksTex('#a8835a', '#cba27a') }),
    plaster: at({ c: RT.lin('#ece6da'), ks: 0.02, sh: 8 }),
    hedge: at({ c: RT.lin(m.garden.hedgeCol), ks: 0.03, sh: 8, tex: leafTex(m.garden.hedgeCol) }),
    leaf: at({ c: RT.lin(m.garden.leafCol), ks: 0.03, sh: 8, tex: leafTex(m.garden.leafCol) }),
    trunk: at({ c: RT.lin('#6a4c34'), ks: 0.03, sh: 8 }),
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
  const Hs = m.house, G = m.garden;
  const GA = RT.lin(G.grass[0]), GB = RT.lin(G.grass[1]), PA = RT.lin('#c9c2b2'), PG = RT.lin('#8e877a'), BA = RT.lin(G.gravel[0]), BB = RT.lin(G.gravel[1]);
  const W2 = Hs.W / 2, D2 = Hs.D / 2;
  const floor = (x, z, fp, out) => {
    const n = RT.fbm(x * 1.3, z * 1.3, 3, fp * 1.3), n2 = RT.fbm(x * 9, z * 9, 2, fp * 9);
    RT.mixInto(out, GA, GB, 0.2 + 0.55 * n + 0.25 * n2);
    const fx = x - Hs.xd;
    if (Math.abs(fx) < 0.52 && z > D2 + 0.4) {
      const u = (z - D2 - 0.4) / 0.52, v = (fx + 0.52) / 0.52;
      const t = RT.hash2(Math.floor(u), Math.floor(v)), gr = Math.max(RT.lineMask(z - D2 - 0.4, 0.52, 0.012, fp), RT.lineMask(fx + 0.52, 0.52, 0.012, fp));
      RT.mixInto(out, PA, PA.map((q) => q * 0.86), t * 0.8 + 0.2 * n2);
      RT.mixInto(out, out, PG, 0.85 * gr);
      if (Math.abs(fx) > 0.49) RT.mixInto(out, out, GB, 0.5);
    }
    const Bk = G.back, bz = (x - Bk.c[0]) * -Bk.d[1] + (z - Bk.c[1]) * Bk.d[0];
    if (Math.abs(bz) < Bk.half) {
      const e = Bk.half - Math.abs(bz), gv = RT.fbm(x * 14, z * 14, 2, fp * 14);
      RT.mixInto(out, BA, BB, 0.3 + 0.6 * gv);
      if (e < 0.06) RT.mixInto(out, out, GB, 0.5 * (1 - e / 0.06));
    }
    const dx = Math.max(0, Math.abs(x) - W2), dz = Math.max(0, Math.abs(z) - D2), d = Math.hypot(dx, dz);
    if (d < 0.6) { const k = 1 - 0.32 * Math.exp(-d / 0.16); out[0] *= k; out[1] *= k; out[2] *= k; }
  };
  const xi = W2 - Hs.th + 0.002, zi = D2 - Hs.th + 0.002, yTop = Hs.hw + Hs.hr;
  const dim = (x, y, z) => (Math.abs(x) < xi && Math.abs(z) < zi && y < yTop ? 0.5 : 1);
  return { floorY: 0, floor, floorMat: { ks: 0.02, sh: 8 }, sky: RT.softSky, dim };
}
function lightOf(m) {
  const S = m.sun, a = S.az * DEG, e = S.el * DEG;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.12, 1.07, 0.98], soft: 0.05,
    sky: [0.5, 0.52, 0.56], ground: [0.22, 0.24, 0.18], fill: { dir: [-Math.sin(a), 0.4, -Math.cos(a)], col: [0.1, 0.1, 0.12] },
    aoK: 0, contact: 0.3, contactH: 0.05,
  };
}
export const sunDir = (m) => norm3(lightOf(m).dir);

export function camOf(m) {
  const C = m.cam;
  return RT.orbitCam({ az: C.az, el: C.el, dist: C.dist, fov: C.fov, tx: C.target[0], ty: C.target[1], tz: C.target[2] }, VIEW.w, VIEW.h);
}
const CAMS = new WeakMap();
export function cam(m) { let c = CAMS.get(m); if (!c) { c = camOf(m); CAMS.set(m, c); } return c; }
export function project(m, p) { const q = cam(m).project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }

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
  const w = B.walking || 0, ph = B.gait || 0;
  const base = [B.x, 0, B.z];
  const P = (side, fwd, upv) => [base[0] + r[0] * side + f[0] * fwd, upv, base[2] + r[2] * side + f[2] * fwd];
  const bob = 0.012 * k * w * Math.cos(2 * ph);
  const pelvis = P(0, 0, 0.97 * k + bob);
  const tor = up;
  const legs = [-1, 1].map((s) => {
    const sw = s < 0 ? Math.sin(ph) : -Math.sin(ph), lift = s < 0 ? Math.max(0, Math.cos(ph)) : Math.max(0, -Math.cos(ph));
    const ankle = P(s * 0.1 * k, 0.24 * k * w * sw, 0.085 * k + 0.07 * k * w * lift);
    const hip = add3(pelvis, r, s * 0.088 * k);
    const knee = ik2(hip, ankle, 0.43 * k, 0.43 * k, add3(f, up, 0.05)).mid;
    return { hip, knee, ankle };
  });
  const T = (d, side = 0) => add3(add3(pelvis, tor, d * k), r, side * k);
  const arms = [-1, 1].map((s) => {
    const sh = T(0.44, s * 0.185);
    const sw = (s < 0 ? -1 : 1) * Math.sin(ph) * 0.14 * k * w;
    const hand = add3(add3(add3(sh, [0, -1, 0], 0.5 * k), f, sw + 0.03 * k), r, s * 0.03 * k);
    const pole = add3(add3(r.map((q) => q * s * 0.45), [0, -1, 0], 0.7), f, -0.3);
    const j = ik2(sh, hand, ARM_U * k, ARM_F * k, pole);
    return { sh, el: j.mid, hand: j.end };
  });
  const neck0 = T(0.49), neck1 = T(0.585);
  return { k, f, r, up, tor, pelvis, legs, arms, neck0, neck1, hf: f };
}
export function personShapes(out, id, J, mats) {
  const S = RT.shape, k = J.k, f = J.f, n0 = out.length;
  const ax = RT.frame(J.tor, f);
  for (const L of J.legs) {
    out.push(S.capsule(id, mats.bottom, L.hip, L.knee, 0.07 * k));
    out.push(S.capsule(id, mats.bottom, L.knee, L.ankle, 0.055 * k));
    const fa = RT.frame([0, 1, 0], f);
    out.push(S.ellipsoid(id, mats.shoe, [L.ankle[0] + f[0] * 0.045 * k, L.ankle[1] - 0.045 * k, L.ankle[2] + f[2] * 0.045 * k], fa, [0.052 * k, 0.044 * k, 0.128 * k]));
  }
  const T = (d) => add3(J.pelvis, J.tor, d * k);
  out.push(S.ellipsoid(id, mats.bottom, J.pelvis, ax, [0.168 * k, 0.118 * k, 0.112 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.16), ax, [0.155 * k, 0.175 * k, 0.102 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.36), ax, [0.185 * k, 0.195 * k, 0.115 * k]));
  out.push(S.capsule(id, mats.top, add3(T(0.44), J.r, -0.13 * k), add3(T(0.44), J.r, 0.13 * k), 0.066 * k));
  for (const A of J.arms) {
    out.push(S.capsule(id, mats.top, A.sh, A.el, 0.05 * k));
    out.push(S.capsule(id, mats.skin, A.el, A.hand, 0.039 * k));
    const d = sub3(A.hand, A.el);
    out.push(S.ellipsoid(id, mats.skin, add3(A.hand, d, 0.16), RT.frame(d, f), [0.028 * k, 0.055 * k, 0.04 * k]));
  }
  out.push(S.capsule(id, mats.skin, J.neck0, J.neck1, 0.05 * k));
  const hu = [0, 1, 0], hax = RT.frame(hu, J.hf);
  const hc = add3(add3(J.neck1, hu, 0.068 * k), J.hf, 0.012 * k);
  const hp = (fw, u, sd = 0) => add3(add3(add3(hc, J.hf, fw * k), hu, u * k), J.r, sd * k);
  out.push(S.ellipsoid(id, mats.skin, hc, hax, [0.082 * k, 0.11 * k, 0.098 * k]));
  out.push(S.ellipsoid(id, mats.hair, hp(-0.032, 0.028), hax, [0.088 * k, 0.102 * k, 0.094 * k]));
  out.push(S.ellipsoid(id, mats.skin, hp(0.1, -0.012), hax, [0.017 * k, 0.026 * k, 0.026 * k]));
  for (const s of [-1, 1]) out.push(S.ellipsoid(id, mats.skin, hp(-0.002, -0.005, s * 0.082), hax, [0.013 * k, 0.027 * k, 0.019 * k]));
  for (let i = n0; i < out.length; i++) out[i].noAO = true;
}

export const WALK_EASE = 0.35;
export function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
export function pathAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) { const u = l > 0 ? clamp01(s / l) : 1; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    s -= l;
  }
  return pts[pts.length - 1].slice();
}
function headingAt(pts, s, L) {
  const a = pathAt(pts, Math.max(0, s - 0.3)), b = pathAt(pts, Math.min(L, s + 0.3));
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]);
  return l > 1e-6 ? [d[0] / l, d[1] / l] : null;
}
export function walkS(seg, t) {
  const T = seg.t1 - seg.t0, L = seg.len, u = clamp01((t - seg.t0) / T), e = Math.min(0.45, WALK_EASE / T);
  const vmax = 1 / (1 - e);
  let s;
  if (u < e) s = 0.5 * vmax * u * u / e;
  else if (u > 1 - e) { const w = 1 - u; s = 1 - 0.5 * vmax * w * w / e; }
  else s = 0.5 * vmax * e + vmax * (u - e);
  return clamp01(s) * L;
}
export const walkTime = (len, v) => len / v + WALK_EASE;
const turnTo = (a, b, u) => { const ang0 = Math.atan2(a[1], a[0]); let d = Math.atan2(b[1], b[0]) - ang0; d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; const g = ang0 + d * u; return [Math.cos(g), Math.sin(g)]; };
export function poseAt(p, t) {
  const segs = p.segs;
  if (t < segs[0].t0 || t > p.tEnd) return null;
  let i = 0;
  while (i < segs.length - 1 && t > segs[i].t1) i++;
  const seg = segs[i], prev = segs[i - 1];
  if (seg.k === 'stand') return { x: seg.at[0], z: seg.at[1], f: seg.f, k: p.k, walking: 0, gait: 0, standing: true, seg: i };
  const s = walkS(seg, Math.min(t, seg.t1)), q = pathAt(seg.pts, s);
  let f = headingAt(seg.pts, s, seg.len) || seg.fEnd || [0, 1];
  if (prev && prev.k === 'stand') f = turnTo(prev.f, f, smooth((t - seg.t0) / 0.45));
  const gait = 2 * Math.PI * s / (1.32 * p.k) + (p.ph || 0);
  const ramp = clamp01(Math.min(s / 0.3, (seg.len - s) / 0.3 + 0.1));
  return { x: q[0], z: q[1], f, k: p.k, walking: ramp, gait, standing: false, seg: i };
}
export function drawnAt(p, t) {
  const P = poseAt(p, t);
  if (!P) return null;
  if (P.standing && p.segs[P.seg].inside) return null;
  return P;
}

const STATIC = new WeakMap();
function staticShapes(m) {
  let s = STATIC.get(m);
  if (s) return s;
  const C = sceneMats(m), out = [];
  houseShapes(out, m.house, C.M);
  decorShapes(out, m, C.M);
  for (const q of out) q.noAO = true;
  STATIC.set(m, out);
  return out;
}
export function sceneAt(m, t, opts = {}) {
  const C = sceneMats(m), shapes = staticShapes(m).slice(), poses = [];
  if (!opts.none) {
    m.people.forEach((p, i) => {
      if (opts.only && !opts.only.has(i)) return;
      const P = opts.all ? poseAt(p, t) : drawnAt(p, t);
      if (!P) return;
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
    const sx = x + dx - L[0] * h / L[1], sz = z + dz - L[2] * h / L[1];
    pts.push([sx, 0, sz]);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = project(m, p); if (!(q[2] > 0.1)) continue; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}
export function offPicture(m, x, z, k = 1, shadow = true) {
  const b = personScreenBox(m, x, z, k, shadow ? 0.34 : 0.22, shadow);
  return b[2] < -1 || b[0] > VIEW.w + 1 || b[3] < -1 || b[1] > VIEW.h + 1;
}
