import { shape, makeScene, render, lin, fbm, hash2, lineMask, objectStats } from './_seat_view_rt.js';
import { builder, cup, orbitCam } from './_seat_view_props.js';

export const GEO = Object.freeze({
  R: 0.029,
  PEG_R: 0.0072,
  SLOT_X: [-0.135, 0, 0.135],
  CAPS: [3, 2, 1],
  BASE: { hx: 0.22, hy: 0.015, hz: 0.058 },
  TIP: 0.017,
  MUG: { x: 0.262, z: 0.125, r: 0.036, h: 0.086 },
  TABLE: { hx: 0.8, zNear: 0.36, zFar: -0.62, thick: 0.045 },
  FLOOR_Y: -0.74,
  WALL_D: 1.5,
  WALL_NEAR: 1.0,
});
export const BASE_TOP = 2 * GEO.BASE.hy;
export const pegTopY = (pid) => BASE_TOP + GEO.CAPS[pid] * 2 * GEO.R + GEO.TIP;
export const ballY = (lvl) => BASE_TOP + GEO.R + lvl * 2 * GEO.R;

export const BALL_HEX = { red: '#c9372c', yellow: '#ecb72a', blue: '#2b63c6', green: '#2e8f47' };
export const MUG_HEX = ['#efece6', '#3c4148', '#e6dcc8'];
const ID = { ball: (b) => 10 + b, peg: (p) => 20 + p, base: 30, table: 31, mug: 32 };
export const IDS = ID;

const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }

function woodMat(hex, scale = 1, along = 'x') {
  const base = cA(hex), lo = base.map((v) => v * 0.8), hi = base.map((v) => Math.min(1, v * 1.12));
  return { c: base, ks: 0.12, sh: 26, tex: (x, y, z, nx, ny, nz, s, out) => {
    const u = along === 'x' ? x : z, v = along === 'x' ? z : x;
    const g = fbm(u * 3.2 * scale, (v + y * 0.6) * 30 * scale, 3);
    const ring = 0.5 + 0.5 * Math.sin((v * 80 + y * 40 + g * 7) * scale);
    mixInto(out, lo, hi, 0.38 * g + 0.25 * ring + 0.2);
  } };
}
function dowelMat(hex) {
  const base = cA(hex), lo = base.map((v) => v * 0.86), hi = base.map((v) => Math.min(1, v * 1.08));
  return { c: base, ks: 0.14, sh: 30, tex: (x, y, z, nx, ny, nz, s, out) => { mixInto(out, lo, hi, 0.4 + 0.6 * fbm(y * 90, Math.atan2(nx, nz) * 1.5, 2)); } };
}
const ballMat = (hex) => ({ c: cA(hex), ks: 0.42, sh: 64, env: 0.1 });

const FLOOR_DARK = cA('#8f6f50'), FLOOR_LIGHT = cA('#c4a27b');
const SAGE = cA('#9fb09a'), PANEL = cA('#efece4'), CREAM = cA('#e9dfcd'), FRAME = cA('#f6f4ef');
function wallFn(kind) {
  if (kind === 'far') {
    return (x, y, fp, out) => {
      const yf = y - GEO.FLOOR_Y;
      if (yf < 0.86) {
        const pw = 0.42, u = ((x % pw) + pw) % pw;
        const inPanel = u > 0.05 && u < pw - 0.05 && yf > 0.14 && yf < 0.74;
        const edge = !inPanel && u > 0.035 && u < pw - 0.035 && yf > 0.125 && yf < 0.755;
        const k = (edge ? 0.86 : inPanel ? 0.97 : 1) * (yf < 0.1 ? 0.95 : 1) * (Math.abs(yf - 0.86) < 0.012 ? 0.85 : 1);
        out[0] = PANEL[0] * k; out[1] = PANEL[1] * k; out[2] = PANEL[2] * k; return;
      }
      if (yf < 0.9) { out[0] = PANEL[0]; out[1] = PANEL[1]; out[2] = PANEL[2]; return; }
      const n = 0.96 + 0.06 * fbm(x * 6, y * 6, 3, fp);
      out[0] = SAGE[0] * n; out[1] = SAGE[1] * n; out[2] = SAGE[2] * n;
    };
  }
  return (x, y, fp, out) => {
    const yf = y - GEO.FLOOR_Y;
    const wx0 = -1.3, wx1 = 1.3, wy0 = 0.36, wy1 = 2.1, sill = 0.04;
    if (x > wx0 - 0.07 && x < wx1 + 0.07 && yf > wy0 - sill && yf < wy1 + 0.07) {
      const inGlass = x > wx0 && x < wx1 && yf > wy0 && yf < wy1;
      const pane = (wx1 - wx0) / 4, u = (x - wx0) / pane;
      const mull = Math.abs(u - Math.round(u)) * pane < 0.024 || Math.abs(yf - 1.05) < 0.022;
      if (!inGlass || mull) { const k = yf < wy0 ? 0.9 : 1; out[0] = FRAME[0] * k; out[1] = FRAME[1] * k; out[2] = FRAME[2] * k; return; }
      const t = Math.min(1, (yf - wy0) / 1.2);
      out[0] = 1.5 + 0.5 * t; out[1] = 1.85 + 0.45 * t; out[2] = 2.3 + 0.3 * t; return;
    }
    const n = 0.96 + 0.06 * fbm(x * 6, y * 6, 3, fp);
    const src = yf < 0.09 ? FRAME : CREAM;
    out[0] = src[0] * n; out[1] = src[1] * n; out[2] = src[2] * n;
  };
}
function env(kind) {
  const PL = 1.2, plank = 0.16;
  return {
    floorY: GEO.FLOOR_Y,
    floor(x, z, fp, out) {
      const row = Math.floor(x / plank), off = hash2(row, 7) * PL;
      const seg = Math.floor((z + off) / PL), tone = hash2(row, seg);
      const g = fbm(x * 3 + row * 1.7, z * 0.9 + seg * 3.1, 3, fp);
      mixInto(out, FLOOR_DARK, FLOOR_LIGHT, 0.25 + 0.4 * tone + 0.3 * g);
      const seam = Math.max(lineMask(x, plank, 0.0035, fp), lineMask(z + off, PL, 0.003, fp) * 0.8);
      const k = 1 - 0.36 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    wallZ: kind === 'near' ? -GEO.WALL_NEAR : -GEO.WALL_D,
    wall: wallFn(kind),
    wallMat: { ks: 0, sh: 1 },
    sky(dx, dy, dz, out) { out[0] = 0.7; out[1] = 0.7; out[2] = 0.72; },
  };
}
export const LIGHT_DIR = [-0.42, 1, 0.24];
function light(flip) {
  const d = flip ? [-LIGHT_DIR[0], LIGHT_DIR[1], -LIGHT_DIR[2]] : LIGHT_DIR;
  const f = flip ? [-0.7, 0.45, -0.55] : [0.7, 0.45, 0.55];
  return { dir: d, col: [1.12, 1.07, 1.0], soft: 0.07, sky: [0.5, 0.5, 0.52], ground: [0.24, 0.21, 0.18],
    fill: { dir: f, col: [0.2, 0.2, 0.22] }, aoK: 1, contact: 0.0, contactH: 0.1 };
}

export function buildShapes(look, arrangement, flip) {
  const B = builder(), sg = flip ? -1 : 1;
  const T = GEO.TABLE;
  const tableM = B.matDef('table', woodMat('#86603f', 0.7, 'x'));
  const baseM = B.matDef('base', woodMat('#dcb47c', 1.3, 'x'));
  const dowM = B.matDef('dowel', dowelMat('#e3c79b'));
  const zn = sg * T.zNear, zf = sg * T.zFar, tz = (zn + zf) / 2, thz = Math.abs(zn - zf) / 2;
  const top = B.add(shape.box(ID.table, tableM, 0, -T.thick / 2, tz, T.hx, T.thick / 2, thz, 0, 0.008)); top.noAO = true;
  B.add(shape.box(ID.base, baseM, 0, GEO.BASE.hy, 0, GEO.BASE.hx, GEO.BASE.hy, GEO.BASE.hz, 0, 0.006));
  look.slots.forEach((pid, slot) => {
    const x = sg * GEO.SLOT_X[slot];
    B.add(shape.cyl(ID.peg(pid), dowM, x, 0, BASE_TOP - 0.003, pegTopY(pid), GEO.PEG_R, 0.0025));
    (arrangement[pid] || []).forEach((b, lvl) => {
      const m = B.matDef(`ball:${look.colors[b]}`, ballMat(BALL_HEX[look.colors[b]]));
      const sp = B.add(shape.sphere(ID.ball(b), m, x, ballY(lvl), 0, GEO.R)); sp.noAO = true;
    });
  });
  if (look.mug) {
    const M = GEO.MUG;
    cup(B, ID.mug, { x: sg * look.mug.side * M.x, z: sg * M.z, col: MUG_HEX[look.mug.col], r: M.r, h: M.h, y0: 0,
      handleYaw: (flip ? 180 : 0) + look.mug.handle });
  }
  return B;
}
export function sceneFor(look, arrangement, cam, flip) {
  const B = buildShapes(look, arrangement, flip);
  return makeScene({ cam, shapes: B.shapes, mats: B.mats, env: env(flip ? 'near' : 'far'), light: light(flip) });
}

export function camOf(c, W, H) { return orbitCam(c, W, H); }
export function subCam(cam, x0, y0, w, h) {
  const { eye, F, R, U, f } = cam, cx = cam.cx - x0, cy = cam.cy - y0;
  return { eye, F, R, U, f, cx, cy, W: w, H: h,
    project: (x, y, z) => {
      const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
      const zc = dx * F[0] + dy * F[1] + dz * F[2];
      return { x: cx + f * (dx * R[0] + dz * R[2]) / zc, y: cy - f * (dx * U[0] + dy * U[1] + dz * U[2]) / zc, z: zc };
    } };
}

export function slotScreen(cam, slot, pid, flip) {
  const x = (flip ? -1 : 1) * GEO.SLOT_X[slot];
  const foot = cam.project(x, BASE_TOP, 0), tip = cam.project(x, pegTopY(pid), 0);
  return { foot, tip, x };
}
export function ballScreen(cam, slot, lvl, flip) {
  const x = (flip ? -1 : 1) * GEO.SLOT_X[slot], y = ballY(lvl);
  const c = cam.project(x, y, 0);
  return { x: c.x, y: c.y, r: cam.f * GEO.R / c.z };
}
export function boxScreen(cam, x0, y0, z0, x1, y1, z1) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let k = 0; k < 8; k++) {
    const p = cam.project(k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0);
    a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y);
  }
  return { x0: a, x1: b, y0: c, y1: d };
}
export function rigBox(cam, look, flip = false) {
  const B = GEO.BASE, M = GEO.MUG, sg = flip ? -1 : 1;
  const r = boxScreen(cam, -B.hx, 0, -B.hz, B.hx, pegTopY(0) + 0.002, B.hz);
  if (look.mug) {
    const mx = sg * look.mug.side * M.x, mz = sg * M.z, e = M.r + 0.03;
    const m = boxScreen(cam, mx - e, 0, mz - e, mx + e, M.h, mz + e);
    r.x0 = Math.min(r.x0, m.x0); r.x1 = Math.max(r.x1, m.x1); r.y0 = Math.min(r.y0, m.y0); r.y1 = Math.max(r.y1, m.y1);
  }
  return r;
}
export function rigMidX(look, flip = false) {
  const B = GEO.BASE, M = GEO.MUG;
  if (!look.mug) return 0;
  const lo = Math.min(-B.hx, look.mug.side * (M.x + M.r)), hi = Math.max(B.hx, look.mug.side * (M.x + M.r));
  return (flip ? -1 : 1) * (lo + hi) / 2;
}

export function visibleFracs(sc, ids) { return ids.map((id) => objectStats(sc, id, 2, true).frac); }

export { render, makeScene };
