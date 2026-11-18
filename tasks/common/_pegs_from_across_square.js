import { shape, makeScene, render, lin, fbm, hash2, lineMask, objectStats, pickId } from './_seat_view_rt.js';
import { builder, cup, orbitCam } from './_seat_view_props.js';
import { subCam, boxScreen } from './_pegs_from_across_scene.js';

export const SQ = Object.freeze({
  R: 0.029, PEG_R: 0.0072, CAP: 2, N: 4, OFF: 0.082,
  BASE: { h: 0.138, hy: 0.015 },
  TIP: 0.02,
  MUG: { r: 0.036, h: 0.086, d: 0.262 },
  TABLE: { h: 0.95, thick: 0.045 },
  FLOOR_Y: -0.74, WALL_D: 1.45, FOV: 30,
});
export const LOCAL = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
export const BASE_TOP = 2 * SQ.BASE.hy;
export const pegTopY = () => BASE_TOP + SQ.CAP * 2 * SQ.R + SQ.TIP;
export const ballY = (lvl) => BASE_TOP + SQ.R + lvl * 2 * SQ.R;
export const IDS = { ball: (b) => 10 + b, peg: (p) => 20 + p, base: 30, table: 31, mug: 32 };
export const BALL_HEX = { red: '#c9372c', yellow: '#ecb72a', blue: '#2b63c6', green: '#2e8f47', purple: '#7b4bb0', white: '#ecebe6' };
const MUG_HEX = ['#efece6', '#3c4148', '#e6dcc8'];

const rad = (d) => (d * Math.PI) / 180;
export function rotP(x, z, deg) { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [x * c + z * s, -x * s + z * c]; }
export const pegXZ = (look, pid, rot) => rotP(LOCAL[pid][0] * SQ.OFF, LOCAL[pid][1] * SQ.OFF, look.yaw + rot);
export const mugXZ = (look, rot) => rotP(look.mug.lx, look.mug.lz, look.yaw + rot);

const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
function woodMat(hex, scale = 1, yawDeg = 0) {
  const base = cA(hex), lo = base.map((v) => v * 0.8), hi = base.map((v) => Math.min(1, v * 1.12));
  return { c: base, ks: 0.12, sh: 26, tex: (x, y, z, nx, ny, nz, s, out) => {
    const [u, v] = rotP(x, z, -yawDeg);
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
const SAGE = cA('#9fb09a'), PANEL = cA('#efece4'), CREAM = cA('#e4dccd'), SKIRT = cA('#f3f1ec');
function wallFn(kind) {
  if (kind === 'far') {
    return (x, y, fp, out) => {
      const yf = y - SQ.FLOOR_Y;
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
    const yf = y - SQ.FLOOR_Y, n = 0.96 + 0.06 * fbm(x * 6, y * 6, 3, fp), src = yf < 0.09 ? SKIRT : CREAM;
    out[0] = src[0] * n; out[1] = src[1] * n; out[2] = src[2] * n;
  };
}
function env(kind) {
  const PL = 1.2, plank = 0.16;
  return {
    floorY: SQ.FLOOR_Y,
    floor(x, z, fp, out) {
      const row = Math.floor(x / plank), off = hash2(row, 7) * PL;
      const seg = Math.floor((z + off) / PL), tone = hash2(row, seg);
      const g = fbm(x * 3 + row * 1.7, z * 0.9 + seg * 3.1, 3, fp);
      mixInto(out, FLOOR_DARK, FLOOR_LIGHT, 0.25 + 0.4 * tone + 0.3 * g);
      const seam = Math.max(lineMask(x, plank, 0.0035, fp), lineMask(z + off, PL, 0.003, fp) * 0.8);
      const k = 1 - 0.36 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    wallZ: -SQ.WALL_D, wall: wallFn(kind), wallMat: { ks: 0, sh: 1 },
    sky(dx, dy, dz, out) { out[0] = 0.7; out[1] = 0.7; out[2] = 0.72; },
  };
}
export const LIGHT_DIR = [-0.42, 1, 0.24];
export function lightDir(rot) { const [x, z] = rotP(LIGHT_DIR[0], LIGHT_DIR[2], rot); return [x, LIGHT_DIR[1], z]; }
function light(rot) {
  const [fx, fz] = rotP(0.7, 0.55, rot);
  return { dir: lightDir(rot), col: [1.12, 1.07, 1.0], soft: 0.07, sky: [0.5, 0.5, 0.52], ground: [0.24, 0.21, 0.18],
    fill: { dir: [fx, 0.45, fz], col: [0.2, 0.2, 0.22] }, aoK: 1, contact: 0.0, contactH: 0.1 };
}

export function buildShapes(look, arrangement, rot) {
  const B = builder(), T = SQ.TABLE, by = look.yaw + rot;
  const tableM = B.matDef(`table:${rot}`, woodMat('#86603f', 0.7, rot));
  const baseM = B.matDef(`base:${by}`, woodMat('#dcb47c', 1.3, by));
  const dowM = B.matDef('dowel', dowelMat('#e3c79b'));
  const top = B.add(shape.box(IDS.table, tableM, 0, -T.thick / 2, 0, T.h, T.thick / 2, T.h, rot, 0.008)); top.noAO = true;
  B.add(shape.box(IDS.base, baseM, 0, SQ.BASE.hy, 0, SQ.BASE.h, SQ.BASE.hy, SQ.BASE.h, by, 0.006));
  for (let pid = 0; pid < SQ.N; pid++) {
    const [x, z] = pegXZ(look, pid, rot);
    B.add(shape.cyl(IDS.peg(pid), dowM, x, z, BASE_TOP - 0.003, pegTopY(), SQ.PEG_R, 0.0025));
    (arrangement[pid] || []).forEach((b, lvl) => {
      const m = B.matDef(`ball:${look.colors[b]}`, ballMat(BALL_HEX[look.colors[b]]));
      const sp = B.add(shape.sphere(IDS.ball(b), m, x, ballY(lvl), z, SQ.R)); sp.noAO = true;
    });
  }
  const [mx, mz] = mugXZ(look, rot);
  cup(B, IDS.mug, { x: mx, z: mz, col: MUG_HEX[look.mug.col], r: SQ.MUG.r, h: SQ.MUG.h, y0: 0, handleYaw: look.mug.handle + by });
  return B;
}
export function sceneFor(look, arrangement, cam, rot) {
  const B = buildShapes(look, arrangement, rot);
  return makeScene({ cam, shapes: B.shapes, mats: B.mats, env: env(rot === 0 ? 'far' : 'plain'), light: light(rot) });
}

export const camOf = (c, W, H) => orbitCam(c, W, H);
function rigPts(look, rot) {
  const pts = [], H = SQ.BASE.h;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [x, z] = rotP(a * H, b * H, look.yaw + rot);
    pts.push([x, 0, z], [x, BASE_TOP, z]);
  }
  for (let pid = 0; pid < SQ.N; pid++) { const [x, z] = pegXZ(look, pid, rot); pts.push([x, pegTopY() + 0.002, z]); }
  const [mx, mz] = mugXZ(look, rot), e = SQ.MUG.r + 0.03;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([mx + a * e, 0, mz + b * e], [mx + a * e, SQ.MUG.h, mz + b * e]);
  return pts;
}
export function rigBox(cam, look, rot) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of rigPts(look, rot)) { const q = cam.project(...p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, x1, y0, y1 };
}
export function fitCam(look, rot, az, el, W, H, box) {
  const pts = rigPts(look, rot);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const tx = r3((Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2);
  const tz = r3((Math.min(...pts.map((p) => p[2])) + Math.max(...pts.map((p) => p[2]))) / 2);
  for (let i = 0; i < 300; i++) {
    const dist = Math.round((0.5 + i * 0.01) * 100) / 100;
    const c = { az, el, dist, fov: SQ.FOV, tx, ty: 0.06, tz, shiftY: 0 };
    const r = rigBox(camOf(c, W, H), look, rot);
    if (r.x1 - r.x0 > box[2] - box[0] || r.y1 - r.y0 > box[3] - box[1]) continue;
    c.shiftY = Math.round((box[1] + box[3]) / 2 - (r.y0 + r.y1) / 2);
    const r2 = rigBox(camOf(c, W, H), look, rot);
    if (r2.x0 >= box[0] && r2.x1 <= box[2] && r2.y0 >= box[1] && r2.y1 <= box[3]) return c;
  }
  return null;
}
export function pegScreen(cam, look, pid, rot) {
  const [x, z] = pegXZ(look, pid, rot);
  return { foot: cam.project(x, BASE_TOP, z), tip: cam.project(x, pegTopY(), z), x, z };
}
export function ballScreen(cam, look, pid, lvl, rot) {
  const [x, z] = pegXZ(look, pid, rot), c = cam.project(x, ballY(lvl), z);
  return { x: c.x, y: c.y, r: cam.f * SQ.R / c.z };
}
export const visibleFrac = (sc, id) => objectStats(sc, id, 2, true).frac;
export { render, subCam, boxScreen, pickId };
