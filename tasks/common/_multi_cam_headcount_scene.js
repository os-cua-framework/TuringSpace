import * as RT from './_house_headcount_rt.js';
import { bodyJoints, personShapes } from './_house_headcount_scene.js';
import { poseAt as poseMv, sOf, ptAt, dirAt, smooth, propShapes as basicPropShapes } from './_who_follows_him_scene.js';
export { RT, sOf, ptAt, dirAt, smooth };

export const FEED = { w: 320, h: 240 };
export const VIEW = FEED;
export const FEED_GAP = 6;
export const NCAM = 3;
const DEG = Math.PI / 180;
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const ID = { prop: (i) => 10 + i, person: (i) => 100 + i };

export const TOPS = [
  { name: 'red', hex: '#c8372d' }, { name: 'blue', hex: '#2f5fb8' }, { name: 'green', hex: '#2f8f46' }, { name: 'yellow', hex: '#e2b822' },
  { name: 'purple', hex: '#7a4bb0' }, { name: 'white', hex: '#eeeae2' }, { name: 'black', hex: '#26262b' }, { name: 'teal', hex: '#27a0a0' },
  { name: 'orange', hex: '#e8832a' },
];
export const BOTTOMS = ['#34405a', '#2a2a2e', '#6b6e74', '#5a4636', '#3f5a3c', '#a89470'];
export const HAIRS = ['#2a1f1a', '#5a3a22', '#a8743a', '#d6bd86', '#8c8c8c', '#141414'];
export const SKINS = ['#e8c4a8', '#d4a07a', '#a8704a', '#7a4a2e', '#f0d0b8'];
export const PAVING = [
  { a: '#b9b4aa', b: '#a59f94', j: '#7d776d' },
  { a: '#cdbb9a', b: '#b9a684', j: '#8a7a5e' },
  { a: '#b7978a', b: '#a1826f', j: '#73594c' },
  { a: '#9ea3a6', b: '#8b9094', j: '#62676b' },
];
export const BANDS = ['#d8a548', '#3b9a9a', '#b5523b', '#33507f', '#7a8f3a'];

export const poseAt = poseMv;
export const headingAngle = (f) => Math.atan2(f[1], f[0]);

function woodTex(a, b) {
  const A = RT.lin(a), B = RT.lin(b);
  return (x, y, z, nx, ny, nz, s, out) => { const g = RT.fbm(x * 2 + z * 2, y * 30, 2); RT.mixInto(out, A, B, 0.3 + 0.5 * g); };
}
function plantTex(hex) {
  const A = RT.lin(hex), B = A.map((v) => v * 0.55);
  return (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 9 + z * 3, y * 9 - z * 5, 3); RT.mixInto(out, B, A, 0.25 + 0.9 * n); };
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
    leaf2: at({ c: RT.lin('#5f8a3e'), ks: 0.03, sh: 8, tex: plantTex('#6a9a44') }),
    bin: at({ c: RT.lin('#3f5a46'), ks: 0.12, sh: 24 }),
    marble: at({ c: RT.lin('#dcd6c8'), ks: 0.08, sh: 16 }),
    water: at({ c: RT.lin('#4f93b8'), ks: 0.45, sh: 70, env: 0.25 }),
    trunk: at({ c: RT.lin('#6b4a30'), ks: 0.02, sh: 6, tex: woodTex('#7a5636', '#4e3622') }),
    plaster: at({ c: RT.lin('#e6dccb'), ks: 0.04, sh: 10 }),
    window: at({ c: RT.lin('#2c3a46'), ks: 0.5, sh: 60, env: 0.3 }),
    pole: at({ c: RT.lin('#5b6168'), ks: 0.25, sh: 30 }),
    camBox: at({ c: RT.lin('#d9dde0'), ks: 0.3, sh: 40 }),
  };
  const tint = {};
  for (const P of m.props) if (P.tint && !tint[P.tint]) tint[P.tint] = at({ c: RT.lin(P.tint), ks: 0.12, sh: 20 });
  const P = m.people.map((p) => ({
    skin: at({ c: RT.lin(p.skin), ks: 0.06, sh: 14 }), hair: at({ c: RT.lin(p.hair), ks: 0.08, sh: 16 }),
    top: at({ c: RT.lin(p.top), ks: 0.04, sh: 8 }), bottom: at({ c: RT.lin(p.bottom), ks: 0.04, sh: 8 }), shoe: at({ c: RT.lin('#2a2624'), ks: 0.1, sh: 20 }),
  }));
  c = { mats, M, tint, P, env: groundEnv(m), light: lightOf(m) };
  MATS.set(m, c);
  return c;
}

function groundEnv(m) {
  const G = m.ground, X = m.plaza.X, Z = m.plaza.Z, A = RT.lin(G.a), B = RT.lin(G.b), J = RT.lin(G.j), D = A.map((v) => v * 0.8);
  const curb = RT.lin('#8f8a80'), gA = RT.lin('#5f8a3e'), gB = RT.lin('#4a7330');
  const ca = Math.cos(G.rot), sa = Math.sin(G.rot), T = G.tile;
  const floor = (x, z, fp, out) => {
    const ox = Math.abs(x) - X, oz = Math.abs(z) - Z;
    if (ox > 0.18 || oz > 0.18) {
      const n = RT.fbm(x * 0.7, z * 0.7, 3, fp * 0.7), n2 = RT.fbm(x * 6 + 3, z * 6 - 5, 2, fp * 6);
      RT.mixInto(out, gA, gB, 0.15 + 0.7 * n + 0.2 * n2);
      return;
    }
    if (ox > 0 || oz > 0) { out[0] = curb[0]; out[1] = curb[1]; out[2] = curb[2]; return; }
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

const FOOT = {
  column: (P) => P.r + 0.55, kiosk: (P) => Math.hypot(P.hx, P.hz) * 0.95 + 0.5, fountain: (P) => P.r + 0.6, tree: () => 0.75,
  bench: () => 1.15, planter: () => 1.0, lamp: () => 0.55, bollard: () => 0.5, bin: () => 0.6, pole: () => 0.6,
};
export const propFoot = (P) => FOOT[P.kind](P);
function propShapesOf(out, id, P, C) {
  const S = RT.shape, M = C.M, x = P.x, z = P.z, a = (P.yaw || 0) * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const at = (u, v) => [x + u * ca - v * sa, z + u * sa + v * ca];
  if (P.kind === 'column') {
    const r = P.r, h = P.h, tm = C.tint[P.tint];
    out.push(S.cyl(id, M.marble, x, z, 0, 0.28, r * 1.28, 0.02));
    out.push(S.cyl(id, M.marble, x, z, 0.28, h - 0.3, r, 0.01));
    out.push(S.cyl(id, tm, x, z, 2.2, 2.6, r * 1.05, 0.01));
    out.push(S.cyl(id, M.marble, x, z, h - 0.3, h, r * 1.3, 0.02));
  } else if (P.kind === 'kiosk') {
    out.push(S.box(id, M.plaster, x, P.h / 2 - 0.1, z, P.hx, P.h / 2 - 0.1, P.hz, -P.yaw, 0.02));
    const f = at(0, P.hz + 0.02);
    out.push(S.box(id, M.window, f[0], 1.35, f[1], P.hx * 0.62, 0.42, 0.02, -P.yaw));
    const aw = at(0, P.hz + 0.25);
    out.push(S.box(id, C.tint[P.tint], aw[0], P.h - 0.12, aw[1], P.hx + 0.2, 0.06, P.hz * 0.5 + 0.2, -P.yaw, 0.01));
    out.push(S.box(id, M.plaster, x, P.h - 0.02, z, P.hx + 0.05, 0.05, P.hz + 0.05, -P.yaw));
  } else if (P.kind === 'fountain') {
    out.push(S.cyl(id, M.marble, x, z, 0, 0.5, P.r, 0.02));
    out.push(S.cyl(id, M.water, x, z, 0.48, 0.52, P.r - 0.22));
    out.push(S.cyl(id, M.marble, x, z, 0.5, 1.45, 0.2, 0.01));
    out.push(S.sphere(id, M.marble, x, 1.6, z, 0.26));
  } else if (P.kind === 'tree') {
    out.push(S.cyl(id, M.trunk, x, z, 0, 2.9, 0.2, 0.01));
    out.push(S.sphere(id, M.leaf, x, 4.1, z, 1.45));
    out.push(S.sphere(id, M.leaf2, x + 0.8, 3.7, z - 0.5, 1.0));
    out.push(S.sphere(id, M.leaf2, x - 0.7, 3.6, z + 0.6, 1.0));
  } else if (P.kind === 'pole') {
    out.push(S.cyl(id, M.pole, x, z, 0, P.h, 0.07));
    out.push(S.box(id, M.camBox, x, P.h + 0.1, z, 0.12, 0.1, 0.22, -P.yaw, 0.02));
  } else basicPropShapes(out, id, P, M);
}
export function occluders(m) {
  let c = OCC.get(m); if (c) return c;
  c = [];
  for (const P of m.props) {
    const a = (P.yaw || 0) * DEG, ca = Math.cos(a), sa = Math.sin(a);
    if (P.kind === 'column') c.push({ t: 'cyl', x: P.x, z: P.z, r: P.r * 1.05, y1: P.h });
    else if (P.kind === 'kiosk') c.push({ t: 'box', x: P.x, z: P.z, hx: P.hx + 0.05, hz: P.hz + 0.05, ca: Math.cos(-a), sa: Math.sin(-a), y1: P.h });
    else if (P.kind === 'fountain') { c.push({ t: 'cyl', x: P.x, z: P.z, r: P.r, y1: 0.5 }); c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.2, y1: 1.45 }); }
    else if (P.kind === 'tree') { c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.2, y1: 2.9 }); c.push({ t: 'sph', x: P.x, y: 4.1, z: P.z, r: 1.45 }); c.push({ t: 'sph', x: P.x + 0.8, y: 3.7, z: P.z - 0.5, r: 1.0 }); c.push({ t: 'sph', x: P.x - 0.7, y: 3.6, z: P.z + 0.6, r: 1.0 }); }
    else if (P.kind === 'bench') c.push({ t: 'box', x: P.x, z: P.z, hx: 0.85, hz: 0.28, ca: Math.cos(-a), sa: Math.sin(-a), y1: 0.9 });
    else if (P.kind === 'planter') c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.52, y1: 1.15 });
    else if (P.kind === 'lamp') c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.07, y1: 3.4 });
    else if (P.kind === 'bollard') c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.1, y1: 0.8 });
    else if (P.kind === 'bin') c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.28, y1: 0.9 });
    else if (P.kind === 'pole') c.push({ t: 'cyl', x: P.x, z: P.z, r: 0.07, y1: P.h });
  }
  OCC.set(m, c);
  return c;
}
const OCC = new WeakMap();

export function camOf(m, ci) {
  const C = m.cams[ci];
  return RT.makeCam({ eye: C.eye, target: C.target, fovY: C.fov, W: FEED.w, H: FEED.h });
}
const CAMS = new WeakMap();
export function cam(m, ci) { let c = CAMS.get(m); if (!c) { c = m.cams.map((_, i) => camOf(m, i)); CAMS.set(m, c); } return c[ci]; }
export function project(m, ci, p) { const q = cam(m, ci).project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }

const STATIC = new WeakMap();
function staticShapes(m) {
  let s = STATIC.get(m);
  if (s) return s;
  const C = sceneMats(m), out = [];
  m.props.forEach((P, i) => propShapesOf(out, ID.prop(i), P, C));
  STATIC.set(m, out);
  return out;
}
export function sceneAt(m, ci, t, opts = {}) {
  const C = sceneMats(m), shapes = staticShapes(m).slice(), poses = [];
  if (!opts.none) {
    m.people.forEach((p, i) => {
      if (opts.only && !opts.only.has(i)) return;
      const P = opts.poses ? opts.poses[i] : poseAt(p, t);
      personShapes(shapes, ID.person(i), bodyJoints(P), C.P[i]);
      poses.push([i, P]);
    });
  }
  const sc = RT.makeScene({ cam: cam(m, ci), shapes, mats: C.mats, light: C.light, env: C.env, exposure: 1.0 });
  sc.poses = poses;
  return sc;
}
export const staticScene = (m, ci) => sceneAt(m, ci, 0, { none: true });

export function personScreenBox(m, ci, x, z, k = 1, pad = 0.34, shadow = true) {
  const L = sunDir(m), h = 1.92 * k, pts = [];
  for (const dx of [-pad, pad]) for (const dz of [-pad, pad]) {
    pts.push([x + dx, 0, z + dz], [x + dx, h, z + dz]);
    if (!shadow) continue;
    pts.push([x + dx - L[0] * h / L[1], 0, z + dz - L[2] * h / L[1]]);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = project(m, ci, p); if (!(q[2] > 0.1)) continue; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}
export function bodyBox(m, ci, x, z, k = 1) {
  const c = cam(m, ci), R = c.R, top = 1.76 * k, wd = 0.23 * k;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of [-1, 1]) for (const y of [0, top]) {
    const q = c.project(x + R[0] * wd * s, y, z + R[2] * wd * s);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return [x0, y0, x1, y1];
}
export function personInPicture(m, ci, x, z, k = 1) {
  const b = personScreenBox(m, ci, x, z, k, 0.4);
  return b[2] > 0 && b[0] < FEED.w && b[3] > 0 && b[1] < FEED.h;
}

const HS = [0.12, 0.5, 0.9, 1.3, 1.62], SIDES = [-0.19, 0, 0.19];
export const NSAMP = HS.length * SIDES.length;
function hitCyl(ex, ey, ez, dx, dy, dz, cx, cz, r, y1) {
  const a = dx * dx + dz * dz; if (a < 1e-12) return false;
  const fx = ex - cx, fz = ez - cz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c;
  if (disc <= 0) return false;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - sq) / (2 * a)), t1 = Math.min(1, (-b + sq) / (2 * a));
  if (t1 <= t0) return false;
  const ya = ey + t0 * dy, yb = ey + t1 * dy;
  return Math.min(ya, yb) <= y1 && Math.max(ya, yb) >= 0;
}
function hitBox(ex, ey, ez, dx, dy, dz, o) {
  const px = ex - o.x, pz = ez - o.z;
  const lx = px * o.ca - pz * o.sa, lz = px * o.sa + pz * o.ca, ldx = dx * o.ca - dz * o.sa, ldz = dx * o.sa + dz * o.ca;
  let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[lx, ldx, o.hx], [lz, ldz, o.hz]]) {
    if (Math.abs(d) < 1e-12) { if (Math.abs(p) > h) return false; continue; }
    let a = (-h - p) / d, b = (h - p) / d; if (a > b) { const q = a; a = b; b = q; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t1 <= t0) return false;
  }
  const ya = ey + t0 * dy, yb = ey + t1 * dy;
  return Math.min(ya, yb) <= o.y1 && Math.max(ya, yb) >= 0;
}
function hitSph(ex, ey, ez, dx, dy, dz, o) {
  const fx = ex - o.x, fy = ey - o.y, fz = ez - o.z, a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), c = fx * fx + fy * fy + fz * fz - o.r * o.r;
  const disc = b * b - 4 * a * c; if (disc <= 0) return false;
  const sq = Math.sqrt(disc), t0 = Math.max(0, (-b - sq) / (2 * a)), t1 = Math.min(1, (-b + sq) / (2 * a));
  return t1 > t0;
}
export function blockedStatic(occ, e, px, py, pz) {
  const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
  for (let i = 0; i < occ.length; i++) {
    const o = occ[i];
    if (o.t === 'cyl' ? hitCyl(e[0], e[1], e[2], dx, dy, dz, o.x, o.z, o.r, o.y1) : o.t === 'box' ? hitBox(e[0], e[1], e[2], dx, dy, dz, o) : hitSph(e[0], e[1], e[2], dx, dy, dz, o)) return true;
  }
  return false;
}
export function visFrac(m, ci, x, z, k = 1, others = null, parts = false) {
  const cm = cam(m, ci), occ = occluders(m), R = cm.R, e = cm.eye;
  let n = 0, inF = 0, oS = 0, oP = 0;
  for (const h of HS) for (const s of SIDES) {
    const px = x + R[0] * s * k, pz = z + R[2] * s * k, py = h * k;
    const q = cm.project(px, py, pz);
    if (!(q.z > 0.3) || q.x < 1 || q.x > FEED.w - 1 || q.y < 1 || q.y > FEED.h - 1) continue;
    inF++;
    if (blockedStatic(occ, e, px, py, pz)) { oS++; continue; }
    if (others) {
      const dx = px - e[0], dy = py - e[1], dz = pz - e[2]; let hit = false;
      for (let j = 0; j < others.length; j++) { const o = others[j]; if (hitCyl(e[0], e[1], e[2], dx, dy, dz, o[0], o[1], 0.26 * o[2], 1.74 * o[2])) { hit = true; break; } }
      if (hit) { oP++; continue; }
    }
    n++;
  }
  return parts ? { vis: n / NSAMP, inFrame: inF / NSAMP, occStatic: oS / NSAMP, occPeople: oP / NSAMP } : n / NSAMP;
}
export function heightPx(m, ci, x, z, k = 1) {
  const cm = cam(m, ci), a = cm.project(x, 0, z), b = cm.project(x, 1.76 * k, z);
  return a.z > 0.3 ? a.y - b.y : 0;
}
