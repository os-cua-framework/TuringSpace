import * as RT from './_lazy_susan_serve_rt.js';

export const BOARD = { w: 720, h: 342 };
export const GEO = {
  tableR: 0.78, tableTop: 0.75, tableEdge: 0.045,
  trayR: 0.5, trayY0: 0.752, trayY1: 0.768,
  dishR: 0.335, plateR: 0.115, plateH: 0.016,
  vaseR: 0.152, vaseC: 0.985, vaseH: 0.215,
  pelvisR: 1.05, seatR: 1.11, seatY: 0.455,
  wallZ: -3.3,
};
export const PLATE_Y = GEO.trayY1 + GEO.plateH;
export const N_DISH = 6;
const DEG = Math.PI / 180;
export const dirOf = (psi) => [Math.sin(psi * DEG), Math.cos(psi * DEG)];
export const atR = (psi, r, y = 0) => { const d = dirOf(psi); return [r * d[0], y, r * d[1]]; };

export const CAM_DIST = 4.2, AIM = [0, 0.8, 0], FIT_PAD = 8;
const CAMS = new Map();
function basis(el) {
  const e = el * DEG, eye = [AIM[0], AIM[1] + CAM_DIST * Math.sin(e), AIM[2] + CAM_DIST * Math.cos(e)];
  const F = [0, -Math.sin(e), -Math.cos(e)], R = [1, 0, 0];
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  return { eye, F, R, U };
}
export function fitPoints(m) {
  const pts = [];
  for (let k = 0; k < 32; k++) { const a = k * 360 / 32; pts.push(atR(a, GEO.tableR, GEO.tableTop), atR(a, GEO.tableR, GEO.tableTop - GEO.tableEdge)); }
  for (const g of m.guests) {
    const d = dirOf(g.psi), t = [d[1], -d[0]], R0 = GEO.pelvisR;
    if (d[1] > 0.2) { pts.push([d[0] * R0, 1.0, d[1] * R0]); continue; }
    for (const s of [-1, 1]) pts.push([d[0] * R0 + t[0] * 0.1 * s, 1.36, d[1] * R0 + t[1] * 0.1 * s]);
    if (d[1] < -0.2) for (const s of [-1, 1]) pts.push([d[0] * R0 + t[0] * 0.22 * s, 1.02, d[1] * R0 + t[1] * 0.22 * s]);
  }
  return pts;
}
export function cameraOf(m) {
  const key = `${m.cam.el}|${m.guests.map((g) => g.psi).join(',')}`;
  let c = CAMS.get(key);
  if (c) return c;
  const { eye, F, R, U } = basis(m.cam.el);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of fitPoints(m)) {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], zc = dx * F[0] + dy * F[1] + dz * F[2];
    const u = (dx * R[0] + dy * R[1] + dz * R[2]) / zc, v = -(dx * U[0] + dy * U[1] + dz * U[2]) / zc;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const W = BOARD.w, H = BOARD.h;
  const f = Math.min((W - 2 * FIT_PAD) / (u1 - u0), (H - 2 * FIT_PAD) / (v1 - v0));
  const cx = W / 2 - f * (u0 + u1) / 2, cy = H / 2 - f * (v0 + v1) / 2;
  c = RT.camFromBasis({ eye, F, R, U, f, cx, cy, W, H });
  if (CAMS.size > 400) CAMS.delete(CAMS.keys().next().value);
  CAMS.set(key, c);
  return c;
}
export const proj = (cam, p) => { const q = cam.project(p[0], p[1], p[2]); return [q.x, q.y]; };

export const SWEATERS = [
  { name: 'green', hex: '#3f8f4a' }, { name: 'red', hex: '#c23a30' }, { name: 'blue', hex: '#2f63b0' },
  { name: 'yellow', hex: '#e2b72c' }, { name: 'purple', hex: '#7a4ea3' }, { name: 'white', hex: '#eeeeea' },
  { name: 'black', hex: '#2a2b2f' }, { name: 'orange', hex: '#e07a26' },
];
export const DISHES = [
  { kind: 'dumplings', noun: 'the dumplings', verb: 'stop' },
  { kind: 'fish', noun: 'the fish', verb: 'stops' },
  { kind: 'broccoli', noun: 'the broccoli', verb: 'stops' },
  { kind: 'shrimp', noun: 'the shrimp', verb: 'stop' },
  { kind: 'corn', noun: 'the corn', verb: 'stops' },
  { kind: 'grapes', noun: 'the grapes', verb: 'stop' },
  { kind: 'pork', noun: 'the braised pork', verb: 'stops' },
  { kind: 'tomatoes', noun: 'the tomatoes', verb: 'stop' },
];
export const DISH_PAIRS = [['shrimp', 'tomatoes'], ['corn', 'fish']];
const SKINS = ['#e8c09c', '#d7a57e', '#b47f57', '#8d5e3e'];
const HAIRS = ['#2b1f18', '#161616', '#5b3b23', '#8c6a3e'];
const PANTS = ['#363b47', '#4b4d56', '#5a4a3c', '#2e3442'];

const lin = RT.lin, mix = RT.mixInto, clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WOOD_A = lin('#5b301f'), WOOD_B = lin('#6e3c26'), WOOD_D = lin('#43231a');
function tableWood(x, z, out) {
  const g = RT.fbm(x * 2.2 + z * 0.4, z * 26 + x * 5, 3), n = RT.fbm(x * 9, z * 9, 2);
  mix(out, WOOD_A, WOOD_B, clamp01(0.3 + 0.6 * g));
  mix(out, out, WOOD_D, 0.25 * n);
}
const GLASS = lin('#bcd8cf'), GLASS_EDGE = lin('#7fb3a3');
function trayTex(x, y, z, nx, ny, nz, s, out) {
  if (ny < 0.5) { out[0] = GLASS_EDGE[0]; out[1] = GLASS_EDGE[1]; out[2] = GLASS_EDGE[2]; return; }
  const r = Math.hypot(x, z);
  tableWood(x, z, out);
  mix(out, out, GLASS, 0.36);
  if (r > GEO.trayR - 0.022) mix(out, out, GLASS_EDGE, 0.55);
}
const PORC = lin('#eef1f4'), BLUE = lin('#2b4f99');
function vaseTex(x, y, z, nx, ny, nz, s, out) {
  out[0] = PORC[0]; out[1] = PORC[1]; out[2] = PORC[2];
  const b = (y0, y1) => (y > y0 && y < y1 ? 1 : 0);
  const v = Math.max(b(0.83, 0.845), b(0.94, 1.03) * (0.55 + 0.45 * Math.sin(Math.atan2(x, z) * 8) ** 2), b(1.12, 1.135), b(1.255, 1.275));
  if (v > 0) mix(out, out, BLUE, 0.85 * v);
}
const PLATE = lin('#f6f4ef'), PLATE_RIM = lin('#2f5aa0');
function plateTex(cx, cz) {
  return (x, y, z, nx, ny, nz, s, out) => {
    out[0] = PLATE[0]; out[1] = PLATE[1]; out[2] = PLATE[2];
    if (ny > 0.5) { const r = Math.hypot(x - s.cx, z - s.cz); if (r > 0.094 && r < 0.102) mix(out, out, PLATE_RIM, 0.75); }
  };
}
function floorTex(rot) {
  const c = Math.cos(rot * DEG), s = Math.sin(rot * DEG);
  const planks = RT.plankFloor({ plank: 0.16, plankL: 1.3, base: '#b88c63', dark: '#9a6e46', light: '#cfa67b' });
  return (x, z, fp, out) => planks(x * c - z * s, x * s + z * c, fp, out);
}
const wallTex = RT.plasterWall('#e9e3d8', '#f4f0e8', 0.09);
function sky(dx, dy, dz, out) { const t = clamp01(dy * 1.4 + 0.45); out[0] = 0.55 + 0.3 * t; out[1] = 0.53 + 0.3 * t; out[2] = 0.5 + 0.3 * t; }

const FS = 1.22;
export const FOOD_TOP = 0.075;
function dishShapes(id, kind, psi, M) {
  const out = [], [ux, uz] = dirOf(psi), vx = uz, vz = -ux;
  const P = [GEO.dishR * ux, GEO.dishR * uz];
  const L = (u, v, h) => [P[0] + (ux * u + vx * v) * FS, PLATE_Y + h * FS, P[1] + (uz * u + vz * v) * FS];
  const ax = (a) => {
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG), x = [ux * c + vx * s, 0, uz * c + vz * s];
    return [x, [0, 1, 0], [x[2], 0, -x[0]]];
  };
  const plate = RT.shape.cyl(id, M.plate, P[0], P[1], GEO.trayY1, PLATE_Y, GEO.plateR, 0.006);
  out.push(plate);
  const S = {
    ellipsoid: (i, mt, c, a, h) => RT.shape.ellipsoid(i, mt, c, a, h.map((x) => x * FS)),
    sphere: (i, mt, x, y, z, r) => RT.shape.sphere(i, mt, x, y, z, r * FS),
    capsule: (i, mt, a, b, r) => RT.shape.capsule(i, mt, a, b, r * FS),
    obox: (i, mt, c, a, h, bev = 0) => RT.shape.obox(i, mt, c, a, h.map((x) => x * FS), bev * FS),
  };
  switch (kind) {
    case 'dumplings': {
      for (let k = 0; k < 7; k++) {
        const a = k * 360 / 6, r = k === 6 ? 0 : 0.054, p = k === 6 ? L(0, 0, 0.016) : L(r * Math.cos(a * DEG), r * Math.sin(a * DEG), 0.014);
        out.push(S.ellipsoid(id, M.dough, p, ax(k === 6 ? 30 : a + 90), [0.034, 0.019, 0.02]));
        out.push(S.ellipsoid(id, M.doughD, [p[0], p[1] + 0.012 * FS, p[2]], ax(k === 6 ? 30 : a + 90), [0.028, 0.009, 0.006]));
      }
      break;
    }
    case 'fish': {
      out.push(S.ellipsoid(id, M.fish, L(0, 0.01, 0.02), ax(90), [0.07, 0.02, 0.03]));
      out.push(S.ellipsoid(id, M.fishD, L(0, 0.012, 0.03), ax(90), [0.055, 0.012, 0.016]));
      for (const sg of [-1, 1]) out.push(S.obox(id, M.fishD, L(0.014 * sg, -0.072, 0.016), ax(90 + 28 * sg), [0.022, 0.004, 0.011]));
      out.push(S.obox(id, M.fishD, L(0, 0.0, 0.042), ax(90), [0.03, 0.008, 0.003]));
      out.push(S.sphere(id, M.dark, ...L(0.016, 0.06, 0.028), 0.006));
      for (let k = -1; k <= 1; k++) out.push(S.capsule(id, M.green, L(0.012 * k, -0.03 + 0.03 * k, 0.05), L(0.012 * k + 0.008, 0.0 + 0.03 * k, 0.05), 0.004));
      break;
    }
    case 'broccoli': {
      const spots = [[0, 0], [0.05, 0.02], [-0.045, 0.035], [0.02, -0.052], [-0.03, -0.045], [0.055, -0.03], [-0.06, -0.005]];
      spots.forEach(([u, v], k) => {
        out.push(S.capsule(id, M.stem, L(u, v, 0.006), L(u, v, 0.022), 0.008));
        for (let j = 0; j < 3; j++) { const a = j * 120 + k * 37; out.push(S.sphere(id, j === 0 ? M.green : M.greenD, ...L(u + 0.011 * Math.cos(a * DEG), v + 0.011 * Math.sin(a * DEG), 0.03), 0.017)); }
      });
      break;
    }
    case 'shrimp': {
      for (let k = 0; k < 7; k++) {
        const a = k * 360 / 7, r = 0.058;
        for (let j = 0; j < 3; j++) {
          const b = (a + (j - 1) * 24) * DEG, rr = r - 0.004 * j;
          out.push(S.ellipsoid(id, j === 1 ? M.shrimpL : M.shrimp, L(rr * Math.cos(b), rr * Math.sin(b), 0.012), ax(a + (j - 1) * 24 + 90), [0.02 - 0.003 * j, 0.012, 0.013 - 0.002 * j]));
        }
      }
      out.push(S.sphere(id, M.green, ...L(0, 0, 0.012), 0.016));
      break;
    }
    case 'corn': {
      for (const [u, v] of [[-0.03, -0.04], [-0.03, 0.04], [0.03, -0.04], [0.03, 0.04]]) {
        out.push(S.capsule(id, M.corn, L(u, v - 0.026, 0.02), L(u, v + 0.026, 0.02), 0.02));
      }
      break;
    }
    case 'grapes': {
      const pos = [];
      for (let k = 0; k < 9; k++) { const a = k * 40 * DEG, r = k === 0 ? 0 : 0.045; pos.push([r * Math.cos(a), r * Math.sin(a), 0.015]); }
      for (let k = 0; k < 4; k++) { const a = (k * 90 + 45) * DEG; pos.push([0.022 * Math.cos(a), 0.022 * Math.sin(a), 0.04]); }
      for (const [u, v, h] of pos) out.push(S.sphere(id, M.grape, ...L(u, v, h), 0.017));
      out.push(S.capsule(id, M.stem, L(0, 0, 0.055), L(0.01, 0.012, 0.068), 0.004));
      break;
    }
    case 'pork': {
      for (let k = 0; k < 9; k++) {
        const a = k * 360 / 8, r = k === 8 ? 0 : 0.052;
        out.push(S.obox(id, M.pork, L(r * Math.cos(a * DEG), r * Math.sin(a * DEG), k === 8 ? 0.03 : 0.017), ax(a + 20 * (k % 3)), [0.019, 0.016, 0.019], 0.004));
      }
      out.push(S.sphere(id, M.green, ...L(0.012, 0.008, 0.05), 0.008));
      break;
    }
    case 'tomatoes': {
      for (let k = 0; k < 6; k++) {
        const a = k * 360 / 5, r = k === 5 ? 0 : 0.05, p = L(r * Math.cos(a * DEG), r * Math.sin(a * DEG), 0.024);
        out.push(S.sphere(id, M.tomato, ...p, 0.025));
        out.push(S.sphere(id, M.green, p[0], p[1] + 0.024 * FS, p[2], 0.006));
      }
      break;
    }
    default: throw new Error(`lazy_susan_serve: unknown dish ${kind}`);
  }
  return out;
}

export function sitPose(x, z, fx, fz, h, seatY) {
  const k = h / 1.7, r = [-fz, 0, fx];
  const P = (side, fwd, up) => [x + r[0] * side * k + fx * fwd * k, up, z + r[2] * side * k + fz * fwd * k];
  const py = seatY + 0.1 * k;
  const legs = [-1, 1].map((s) => ({ hip: P(s * 0.088, 0.02, py - 0.04 * k), knee: P(s * 0.1, 0.45, py - 0.03 * k), ankle: P(s * 0.1, 0.47, 0.085 * k), toe: [fx, 0, fz] }));
  const arms = [-1, 1].map((s) => ({ sh: P(s * 0.185, 0.0, py + 0.44 * k), el: P(s * 0.21, 0.1, py + 0.2 * k), hand: P(s * 0.16, 0.3, GEO.tableTop + 0.035) }));
  return { k, f: [fx, 0, fz], r, base: [x, 0, z], pelvis: P(0, 0, py), legs, arms, headPitch: 12 };
}
function chairShapes(id, psi, mat) {
  const out = [], d = dirOf(psi), t = [d[1], -d[0]], R0 = GEO.seatR, y = GEO.seatY;
  const at = (rad, tan) => [d[0] * rad + t[0] * tan, d[1] * rad + t[1] * tan];
  const c = at(R0, 0);
  out.push(RT.shape.box(id, mat, c[0], y - 0.015, c[1], 0.21, 0.018, 0.21, psi, 0.006));
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const p = at(R0 + 0.18 * a, 0.18 * b);
    out.push(RT.shape.box(id, mat, p[0], (y - 0.03) / 2, p[1], 0.017, (y - 0.03) / 2, 0.017, psi));
  }
  for (const b of [-1, 1]) { const p = at(R0 + 0.19, 0.18 * b); out.push(RT.shape.box(id, mat, p[0], y + 0.24, p[1], 0.017, 0.24, 0.017, psi)); }
  const p = at(R0 + 0.19, 0); out.push(RT.shape.box(id, mat, p[0], y + 0.38, p[1], 0.2, 0.09, 0.012, psi, 0.006));
  return out;
}

export const ID = { table: 1, tray: 2, vase: 3, dish: (i) => 10 + i, guest: (k) => 20 + k, chair: (k) => 30 + k };
const LIGHT = {
  dir: [-0.28, 1, 0.42], col: [1.16, 1.11, 1.02], soft: 0.06,
  sky: [0.46, 0.45, 0.45], ground: [0.22, 0.18, 0.15],
  fill: { dir: [0.5, 0.35, 0.8], col: [0.14, 0.14, 0.16] }, aoK: 0.9, contact: 0.3, contactH: 0.06,
};
export function buildScene(m, phi, { dishes = true, fast = false } = {}) {
  const cam = cameraOf(m), shapes = [], mats = [];
  const at = (d) => { mats.push(d); return mats.length - 1; };
  const M = {
    table: at({ c: WOOD_A, ks: 0.22, sh: 40, tex: (x, y, z, nx, ny, nz, s, out) => { tableWood(x, z, out); if (ny < 0.5) mix(out, out, WOOD_D, 0.35); } }),
    leg: at({ c: lin('#3a2016'), ks: 0.15, sh: 30 }),
    tray: at({ c: GLASS, ks: 0.55, sh: 110, env: 0.3, tex: trayTex }),
    vase: at({ c: PORC, ks: 0.5, sh: 70, env: 0.22, tex: vaseTex }),
    chair: at({ c: lin('#7a4b2c'), ks: 0.12, sh: 24 }),
    plate: at({ c: PLATE, ks: 0.35, sh: 60, env: 0.12, tex: plateTex() }),
    dough: at({ c: lin('#f0e6cc'), ks: 0.12, sh: 20 }), doughD: at({ c: lin('#e2d2ae'), ks: 0.1, sh: 20 }),
    fish: at({ c: lin('#c27f35'), ks: 0.35, sh: 40 }), fishD: at({ c: lin('#9a5a22'), ks: 0.35, sh: 40 }),
    dark: at({ c: lin('#1c1c1c'), ks: 0.5, sh: 60 }),
    green: at({ c: lin('#3e8f34'), ks: 0.18, sh: 25 }), greenD: at({ c: lin('#2c6e27'), ks: 0.15, sh: 25 }),
    stem: at({ c: lin('#8fbf6a'), ks: 0.1, sh: 20 }),
    shrimp: at({ c: lin('#ef7448'), ks: 0.3, sh: 40 }), shrimpL: at({ c: lin('#f7a47a'), ks: 0.3, sh: 40 }),
    corn: at({ c: lin('#ecc22c'), ks: 0.25, sh: 30 }),
    grape: at({ c: lin('#5a2b72'), ks: 0.55, sh: 70 }),
    pork: at({ c: lin('#7a321d'), ks: 0.6, sh: 60 }),
    tomato: at({ c: lin('#d82a1e'), ks: 0.6, sh: 70 }),
  };
  shapes.push(RT.shape.cyl(ID.table, M.table, 0, 0, GEO.tableTop - GEO.tableEdge, GEO.tableTop, GEO.tableR, 0.012));
  shapes.push(RT.shape.cyl(ID.table, M.leg, 0, 0, 0.04, GEO.tableTop - GEO.tableEdge, 0.085));
  shapes.push(RT.shape.cyl(ID.table, M.leg, 0, 0, 0, 0.045, 0.4, 0.01));
  shapes.push(RT.shape.cyl(ID.tray, M.tray, 0, 0, GEO.trayY0, GEO.trayY1, GEO.trayR, 0.006));
  shapes.push(RT.shape.cyl(ID.vase, M.vase, 0, 0, GEO.trayY1, GEO.trayY1 + 0.03, 0.085, 0.006));
  shapes.push(RT.shape.ellipsoid(ID.vase, M.vase, [0, GEO.vaseC, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [GEO.vaseR, GEO.vaseH, GEO.vaseR]));
  shapes.push(RT.shape.frustum(ID.vase, M.vase, 0, 0, GEO.vaseC + 0.14, 1.27, 0.07, 0.05));
  shapes.push(RT.shape.cyl(ID.vase, M.vase, 0, 0, 1.255, 1.285, 0.068, 0.008));
  if (dishes) for (let i = 0; i < N_DISH; i++) shapes.push(...dishShapes(ID.dish(i), m.dishes[i], phi + 60 * i, M));
  m.guests.forEach((g, k) => {
    const b = mats.length;
    mats.push(RT.skinMat(SKINS[g.skin]), RT.hairMat(HAIRS[g.hair]), RT.clothMat(SWEATERS[g.sweater].hex, 0.04), RT.clothMat(PANTS[g.pants]), RT.clothMat('#26262b', 0.2));
    const d = dirOf(g.psi), J = sitPose(d[0] * GEO.pelvisR, d[1] * GEO.pelvisR, -d[0], -d[1], g.h, GEO.seatY);
    shapes.push(...RT.personShapes(ID.guest(k), J, { skin: b, hair: b + 1, top: b + 2, bottom: b + 3, shoe: b + 4 }, { hair: g.woman ? 'long' : 'short' }));
    shapes.push(...chairShapes(ID.chair(k), g.psi, M.chair));
  });
  const sc = RT.makeScene({ cam, shapes, mats, light: LIGHT,
    env: { floorY: 0, floor: floorTex(m.floorRot ?? 0), floorMat: { ks: 0.08, sh: 40 }, wallZ: GEO.wallZ, wall: wallTex, sky },
    exposure: 0.95 });
  sc.fast = fast;
  return sc;
}
export { RT };
