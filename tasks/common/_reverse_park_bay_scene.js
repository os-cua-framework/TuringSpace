import * as RT from './_reverse_park_bay_rt.js';
import { DEG, NB, BW, BD, CAR, footprint, lotOf } from './_reverse_park_bay_logic.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const VIEW = { w: 340, h: 316 };
const WALL = { h: 0.9, t: 0.25 }, CURB = { h: 0.14, t: 0.2 }, HEDGE = { h: 0.62, t: 0.75 };
const AO_REACH = 1.0;

export const STYLES = {
  sedan: { L: CAR.L, W: CAR.W, RO: CAR.RO, WB: CAR.WB, y0: 0.22, belt: 0.84, roof: 1.42, cab: [-0.42, 0.32, 1.52, 2.38] },
  hatch: { L: 4.08, W: 1.76, RO: 0.72, WB: 2.56, y0: 0.22, belt: 0.86, roof: 1.47, cab: [-0.60, -0.28, 1.42, 2.22] },
  suv: { L: 4.62, W: 1.86, RO: 0.92, WB: 2.70, y0: 0.32, belt: 1.0, roof: 1.70, cab: [-0.80, -0.62, 1.50, 2.30] },
  wagon: { L: 4.6, W: 1.8, RO: 0.92, WB: 2.7, y0: 0.22, belt: 0.86, roof: 1.48, cab: [-0.8, -0.7, 1.5, 2.38] },
  coupe: { L: 4.3, W: 1.8, RO: 0.85, WB: 2.6, y0: 0.2, belt: 0.8, roof: 1.3, cab: [-0.25, 0.5, 1.38, 2.3] },
  van: { L: 4.6, W: 1.86, RO: 0.8, WB: 2.9, y0: 0.32, belt: 1.02, roof: 1.9, cab: [-0.72, -0.68, 2.15, 2.98] },
  mpv: { L: 4.5, W: 1.84, RO: 0.85, WB: 2.8, y0: 0.3, belt: 0.95, roof: 1.72, cab: [-0.75, -0.62, 1.85, 2.7] },
  pickup_cab: { L: 4.62, W: 1.86, RO: 0.95, WB: 2.85, y0: 0.34, belt: 1.0, roof: 1.78, cab: [0.7, 0.8, 1.9, 2.6], bed: true },
};
export const PLAYER_BODIES = {
  sedan: STYLES.sedan,
  fastback: { ...STYLES.sedan, belt: 0.82, roof: 1.36, cab: [-0.62, 0.6, 1.42, 2.36] },
  wagon: { ...STYLES.sedan, belt: 0.86, roof: 1.47, cab: [-0.74, -0.62, 1.48, 2.36] },
  hatch: { ...STYLES.sedan, belt: 0.87, roof: 1.5, cab: [-0.7, -0.42, 1.4, 2.22] },
  crossover: { ...STYLES.sedan, y0: 0.3, belt: 0.98, roof: 1.62, cab: [-0.72, -0.56, 1.46, 2.3] },
};
export const PLAYER_PAINTS_EXT = [['orange', '#d9731c'], ['blue', '#1f62b8'], ['yellow', '#d4ac1c'], ['teal', '#20897c'], ['green', '#5f9a2e'],
  ['sky', '#2f8fd6'], ['lime', '#86c23a'], ['purple', '#7b3fb5'], ['amber', '#e39b1f'], ['cyan', '#14a3b8'], ['violet', '#5b4bc4'],
  ['mint', '#2fb48a'], ['cobalt', '#2348a8'], ['tangerine', '#ef8a1d'], ['grass', '#3f9e3a']];
export const PARKED_PAINTS_EXT = [['white', '#e8e8e4'], ['silver', '#b7babe'], ['black', '#2a2c30'], ['grey', '#5b6168'], ['navy', '#2e3d55'], ['beige', '#c8bfae'],
  ['maroon', '#6e2a2a'], ['champagne', '#b6ab92'], ['gunmetal', '#4a4f55'], ['bottle', '#2f4a3a'], ['pearl', '#dcdcd4'], ['graphite', '#35383d'],
  ['brown', '#5a4636'], ['slate', '#56606e'], ['olive', '#5c5b45'], ['sand', '#a59a82']];
export const PLAYER_PAINTS = ['#d9731c', '#1f62b8', '#d4ac1c', '#20897c', '#5f9a2e'];
export const PARKED_PAINTS = ['#e8e8e4', '#b7babe', '#2a2c30', '#5b6168', '#2e3d55', '#c8bfae', '#6e2a2a'];

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function carFrame(pose) {
  const f = [Math.cos(pose.h), 0, Math.sin(pose.h)], r = [-Math.sin(pose.h), 0, Math.cos(pose.h)], u = [0, 1, 0];
  const P = (fw, up, side = 0) => [pose.x + f[0] * fw + r[0] * side, up, pose.z + f[2] * fw + r[2] * side];
  return { f, r, u, P };
}
function convexFromPlanes(id, m, planes, pts) {
  const pl = [], bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const [n, d] of planes) pl.push(n[0], n[1], n[2], d);
  for (const p of pts) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k]); bb[k + 3] = Math.max(bb[k + 3], p[k]); }
  return RT.shape.convex(id, m, pl, bb);
}

function baseMats(mats) {
  const at = (def) => { mats.push(def); return mats.length - 1; };
  return {
    tire: at({ c: RT.lin('#1c1c1e'), ks: 0.04, sh: 8 }),
    rim: at({ c: RT.lin('#a9adb2'), ks: 0.5, sh: 40 }),
    trim: at({ c: RT.lin('#202226'), ks: 0.25, sh: 30 }),
    head: at({ c: RT.lin('#fff4d6'), emit: 1.15 }),
    tail: at({ c: RT.lin('#d0242c'), emit: 1.0 }),
    plate: at({ c: RT.lin('#2f5fb3'), ks: 0.3, sh: 30 }),
  };
}
function cabinTex(pose, st, paintHex) {
  const PAINT = RT.lin(paintHex), GLASS = RT.lin('#26303b'), GLASS2 = RT.lin('#3c4a58'), FRAME = RT.lin('#1b1d21');
  const f = [Math.cos(pose.h), 0, Math.sin(pose.h)], [rb, rr, rf, wf] = st.cab;
  const bMid = (rr + rf) / 2;
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = (x - pose.x) * f[0] + (z - pose.z) * f[2];
    if (ny > 0.93) { out[0] = PAINT[0]; out[1] = PAINT[1]; out[2] = PAINT[2]; return; }
    const t = Math.max(0, Math.min(1, (y - st.belt) / (st.roof - st.belt)));
    const side = Math.abs(nx * f[0] + nz * f[2]) < 0.5;
    if (side) {
      const front = wf + (rf - wf) * t, back = rb + (rr - rb) * t;
      if (u > front - 0.1 || u < back + 0.1 || Math.abs(u - bMid) < 0.06 || y > st.roof - 0.05 || y < st.belt + 0.03) {
        out[0] = PAINT[0]; out[1] = PAINT[1]; out[2] = PAINT[2]; return;
      }
    } else if (y > st.roof - 0.04 || y < st.belt + 0.04) { out[0] = FRAME[0]; out[1] = FRAME[1]; out[2] = FRAME[2]; return; }
    RT.mixInto(out, GLASS, GLASS2, 0.35 * t);
  };
}
export function addCar(shapes, mats, B, id, pose, style, paintHex) {
  const st = typeof style === 'string' ? STYLES[style] : style, { f, r, u, P } = carFrame(pose);
  const paint = mats.push({ c: RT.lin(paintHex), ks: 0.32, sh: 46, env: 0.22 }) - 1;
  const cab = mats.push({ c: RT.lin('#26303b'), ks: 0.55, sh: 70, env: 0.35, tex: cabinTex(pose, st, paintHex) }) - 1;
  const xr = -st.RO, xf = st.L - st.RO, y0 = st.y0, bl = st.belt, hw = st.W / 2;
  const prof = [[xr + 0.06, y0], [xf - 0.08, y0], [xf, y0 + 0.14], [xf - 0.02, bl - 0.16], [xf - 0.3, bl - 0.025],
    [xf - 0.9, bl], [xr + 0.26, bl], [xr + 0.02, bl - 0.1], [xr, y0 + 0.12]];
  const bodyPlanes = [], ym = y0 + 0.62 * (bl - y0);
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length];
    const nf = b[1] - a[1], nu = -(b[0] - a[0]), l = Math.hypot(nf, nu);
    const n = [f[0] * nf / l, nu / l, f[2] * nf / l];
    bodyPlanes.push([n, dot(n, P(a[0], a[1]))]);
  }
  for (const sg of [-1, 1]) {
    const side = P(0, ym, sg * hw);
    bodyPlanes.push([[r[0] * sg, 0, r[2] * sg], dot([r[0] * sg, 0, r[2] * sg], side)]);
    for (const a of [16 * DEG, -22 * DEG]) {
      const n = [r[0] * sg * Math.cos(a), Math.sin(a), r[2] * sg * Math.cos(a)];
      bodyPlanes.push([n, dot(n, side)]);
    }
  }
  const bodyPts = [];
  for (const [fw, up] of prof) for (const sd of [-hw, hw]) bodyPts.push(P(fw, up, sd));
  shapes.push(convexFromPlanes(id, paint, bodyPlanes, bodyPts));
  const [rb, rr, rf, wf] = st.cab, roof = st.roof, b0 = bl - 0.03, tau = 13 * DEG, hwc = hw - 0.07;
  const wsN = norm([f[0] * (roof - bl), wf - rf, f[2] * (roof - bl)]);
  const rwN = norm([-f[0] * (roof - bl), rr - rb, -f[2] * (roof - bl)]);
  const planes = [
    [[0, -1, 0], -b0], [[0, 1, 0], roof],
    [wsN, dot(wsN, P(wf, bl))], [rwN, dot(rwN, P(rb, bl))],
  ];
  for (const sg of [-1, 1]) {
    const n = norm([r[0] * sg * Math.cos(tau), Math.sin(tau), r[2] * sg * Math.cos(tau)]);
    planes.push([n, dot(n, P(0, bl, sg * hwc))]);
  }
  const pts = [];
  for (const fw of [rb, wf]) for (const yy of [b0, roof]) for (const sd of [-hwc, hwc]) pts.push(P(fw, yy, sd));
  shapes.push(convexFromPlanes(id, cab, planes, pts));
  if (st.bed) {
    const ob0 = (m, fw, up, side, h) => RT.shape.obox(id, m, P(fw, up, side), [r, u, f], h);
    const x0 = xr + 0.12, x1 = rb - 0.08, mid = (x0 + x1) / 2, hl = (x1 - x0) / 2;
    shapes.push(ob0(B.trim, mid, bl + 0.005, 0, [hw - 0.12, 0.012, hl]));
    for (const sg of [-1, 1]) shapes.push(ob0(paint, mid, bl + 0.07, sg * (hw - 0.06), [0.05, 0.07, hl + 0.04]));
    shapes.push(ob0(paint, xr + 0.08, bl + 0.07, 0, [hw - 0.02, 0.07, 0.05]));
  }
  for (const fw of [0, st.WB]) for (const sg of [-1, 1]) {
    const c = hw - 0.12;
    shapes.push(RT.shape.gcyl(id, B.tire, P(fw, 0.31, sg * (c - 0.11)), P(fw, 0.31, sg * (c + 0.1)), 0.31));
    shapes.push(RT.shape.gcyl(id, B.rim, P(fw, 0.31, sg * (c + 0.095)), P(fw, 0.31, sg * (c + 0.11)), 0.18));
  }
  const ob = (m, fw, up, side, h) => RT.shape.obox(id, m, P(fw, up, side), [r, u, f], h);
  for (const sg of [-1, 1]) {
    shapes.push(ob(B.head, xf - 0.14, bl - 0.1, sg * (hw - 0.27), [0.21, 0.065, 0.13]));
    shapes.push(ob(B.tail, xr + 0.1, bl - 0.1, sg * (hw - 0.25), [0.21, 0.052, 0.1]));
    shapes.push(ob(paint, wf - 0.18, bl + 0.09, sg * (hw + 0.06), [0.07, 0.05, 0.1]));
  }
  shapes.push(ob(B.trim, xf - 0.01, y0 + 0.24, 0, [0.42, 0.09, 0.03]));
  shapes.push(ob(B.plate, xr - 0.005, y0 + 0.3, 0, [0.21, 0.065, 0.012]));
}

const GRASS0 = RT.lin('#5b8a3e'), GRASS1 = RT.lin('#78a250');
function floorFn(m, cars) {
  const { zf, xe } = lotOf(m);
  const A0 = RT.lin('#4a4d51'), A1 = RT.lin('#5c5f63'), STAIN = RT.lin('#3b3d40'), PAINT = RT.lin('#e4e2da');
  const PAVE = RT.lin('#a9a69e');
  const rects = cars.map((c) => footprint(c.pose, c.L, c.W, c.L / 2 - c.RO));
  const rowX = NB * BW / 2;
  return (x, z, fp, out) => {
    if (x < -xe || x > xe || z < 0 || z > zf) {
      if (z < -WALL.t || z > zf + CURB.t + HEDGE.t || x < -xe - CURB.t - HEDGE.t || x > xe + CURB.t + HEDGE.t) {
        const g = RT.fbm(x * 1.1, z * 1.1, 3, fp), bl = RT.fbm(x * 30, z * 30, 2, fp * 30);
        RT.mixInto(out, GRASS0, GRASS1, Math.max(0, Math.min(1, 0.25 + 0.6 * g + 0.2 * (bl - 0.5))));
      } else { const n = 0.9 + 0.15 * RT.fbm(x * 4, z * 4, 3, fp); out[0] = PAVE[0] * n; out[1] = PAVE[1] * n; out[2] = PAVE[2] * n; }
      return;
    }
    const n = RT.fbm(x * 0.7, z * 0.7, 3, fp), gr = RT.fbm(x * 24, z * 24, 2, fp * 24);
    RT.mixInto(out, A0, A1, Math.max(0, Math.min(1, 0.5 + 0.6 * (n - 0.5) + 0.35 * (gr - 0.5))));
    const sp = RT.fbm(x * 0.5 + 13, z * 0.5 - 7, 2, fp * 0.5);
    if (sp > 0.64) RT.mixInto(out, out, STAIN, Math.min(0.3, (sp - 0.64) * 1.5));
    let paint = 0;
    if (z <= BD + 0.06 && Math.abs(x) <= rowX + 0.06) {
      const lx = RT.lineMask(x + rowX, BW, 0.06, fp);
      const lz = z >= BD - 0.06 ? Math.max(0, Math.min(1, (0.06 - Math.abs(z - BD)) / Math.max(fp, 1e-4) + 0.5)) : 0;
      paint = Math.max(z <= BD ? lx : 0, lz);
    }
    if (paint > 0) {
      const wear = 0.78 + 0.22 * RT.fbm(x * 9, z * 9, 2, fp * 9);
      RT.mixInto(out, out, PAINT, paint * wear);
    }
    let k = 1;
    for (const r of rects) {
      const dx = x - r.cx, dz = z - r.cz;
      if (dx * dx + dz * dz > (r.hl + AO_REACH + 0.3) ** 2) continue;
      const lu = Math.abs(dx * r.c + dz * r.s) - (r.hl - 0.2), lv = Math.abs(-dx * r.s + dz * r.c) - (r.hw - 0.12);
      const d = Math.hypot(Math.max(0, lu), Math.max(0, lv));
      if (d < AO_REACH) k *= 1 - 0.5 * (Math.exp(-d / 0.2) - Math.exp(-AO_REACH / 0.2)) / (1 - Math.exp(-AO_REACH / 0.2));
    }
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
}
function staticShapes(m, shapes, mats) {
  const { zf, xe } = lotOf(m);
  const concrete = mats.push({ c: RT.lin('#b9b4aa'), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 3 + z * 3, y * 6, 3); RT.mixInto(out, RT.lin('#a7a298'), RT.lin('#c4bfb4'), 0.25 + 0.6 * n);
    if (Math.abs(((x + z) / 2.5) % 1) < 0.006) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; } } }) - 1;
  const curb = mats.push({ c: RT.lin('#c9c6be'), ks: 0.03, sh: 8 }) - 1;
  const hedge = mats.push({ c: RT.lin('#3f6b30'), ks: 0.02, sh: 6, tex: (x, y, z, nx, ny, nz, s, out) => {
    const g = RT.fbm(x * 3.5 + y * 2, z * 3.5 - y * 2, 3), c = RT.fbm(x * 14 + y * 9, z * 14 - y * 7, 2);
    RT.mixInto(out, RT.lin('#2c5226'), RT.lin('#5a8a3c'), Math.max(0, Math.min(1, 0.2 + 0.6 * g + 0.35 * (c - 0.5)))); } }) - 1;
  shapes.push(RT.shape.box(900, concrete, 0, WALL.h / 2, -WALL.t / 2, xe + CURB.t + HEDGE.t, WALL.h / 2, WALL.t / 2, 0, 0.03));
  const ze = zf + CURB.t + HEDGE.t;
  shapes.push(RT.shape.box(901, curb, 0, CURB.h / 2, zf + CURB.t / 2, xe + CURB.t, CURB.h / 2, CURB.t / 2, 0, 0.03));
  shapes.push(RT.shape.box(902, hedge, 0, HEDGE.h / 2, zf + CURB.t + HEDGE.t / 2, xe + CURB.t + HEDGE.t, HEDGE.h / 2, HEDGE.t / 2, 0, 0.18));
  for (const sg of [-1, 1]) {
    shapes.push(RT.shape.box(903 + (sg > 0), curb, sg * (xe + CURB.t / 2), CURB.h / 2, (zf + CURB.t) / 2, CURB.t / 2, CURB.h / 2, (zf + CURB.t) / 2, 0, 0.03));
    shapes.push(RT.shape.box(905 + (sg > 0), hedge, sg * (xe + CURB.t + HEDGE.t / 2), HEDGE.h / 2, (ze - WALL.t) / 2, HEDGE.t / 2, HEDGE.h / 2, (ze + WALL.t) / 2, 0, 0.18));
  }
}
export function lightFor() {
  return {
    dir: [-0.46, 1.0, 0.34], col: [1.3, 1.24, 1.12], soft: 0.05,
    sky: [0.4, 0.45, 0.54], ground: [0.16, 0.16, 0.15],
    fill: { dir: [0.5, 0.45, -0.6], col: [0.08, 0.09, 0.11] }, aoK: 0.8, contact: 0.25, contactH: 0.12,
  };
}
const SKY0 = RT.lin('#a9c8e6'), SKY1 = RT.lin('#e2ecf4');
function sky(dx, dy, dz, out) { const t = Math.max(0, Math.min(1, dy * 2.2 + 0.1)); RT.mixInto(out, SKY1, SKY0, t); }

export function cameraFor(m) {
  const { zf, xe } = lotOf(m), a = m.camera.az * DEG, e = m.camera.el * DEG, dist = 60;
  const t = [0, 0, zf / 2];
  const eye = [t[0] + dist * Math.sin(a) * Math.cos(e), dist * Math.sin(e), t[2] + dist * Math.cos(a) * Math.cos(e)];
  const base = RT.makeCam({ eye, target: t, fovY: 30, W: VIEW.w, H: VIEW.h });
  const proj = (p) => {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
    const zc = dx * base.F[0] + dy * base.F[1] + dz * base.F[2];
    return [(dx * base.R[0] + dy * base.R[1] + dz * base.R[2]) / zc, -(dx * base.U[0] + dy * base.U[1] + dz * base.U[2]) / zc];
  };
  const pts = [];
  const g = 0.25;
  for (const x of [-xe - g, xe + g]) for (const z of [-WALL.t, zf + g]) for (const y of [0, z < 0 ? WALL.h : 0.3]) pts.push([x, y, z]);
  const xs = pts.map((p) => proj(p)[0]), ys = pts.map((p) => proj(p)[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 6, f = Math.min((VIEW.w - 2 * pad) / (x1 - x0), (VIEW.h - 2 * pad) / (y1 - y0));
  return RT.camFromBasis({ eye, F: base.F, R: base.R, U: base.U, f, cx: VIEW.w / 2 - f * (x0 + x1) / 2, cy: VIEW.h / 2 - f * (y0 + y1) / 2, W: VIEW.w, H: VIEW.h });
}

export const PLAYER_ID = 100;
export function parkedCars(m) {
  return m.parked.map((q) => {
    const st = STYLES[q.style], h = q.h * DEG;
    const back = st.L / 2 - st.RO;
    return { pose: { x: q.x - Math.cos(h) * back, z: q.z - Math.sin(h) * back, h }, style: q.style, paint: q.paint, L: st.L, W: st.W, RO: st.RO };
  });
}
export function buildScene(m, playerPose, look = null) {
  if (look) return buildSceneStyled(m, playerPose, look);
  const shapes = [], mats = [];
  const B = baseMats(mats);
  staticShapes(m, shapes, mats);
  const cars = parkedCars(m);
  cars.forEach((c, i) => addCar(shapes, mats, B, 10 + i, c.pose, c.style, c.paint));
  if (playerPose) {
    addCar(shapes, mats, B, PLAYER_ID, playerPose, 'sedan', m.look.paint);
    cars.push({ pose: playerPose, L: CAR.L, W: CAR.W, RO: CAR.RO });
  }
  for (const s of shapes) s.noAO = true;
  return RT.makeScene({ cam: cameraFor(m), shapes, mats, light: lightFor(), env: { floorY: 0, floor: floorFn(m, cars), sky }, exposure: 1.0 });
}
export function playerRect(m, pose, cam = cameraFor(m)) {
  const r = footprint(pose), L = lightFor().dir, k = 1 / L[1];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const hl = r.hl + AO_REACH + 0.15, hw = r.hw + AO_REACH + 0.15;
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, 1.75]) {
    const x = r.cx + r.c * hl * a - r.s * hw * b, z = r.cz + r.s * hl * a + r.c * hw * b;
    for (const sh of [0, 1]) {
      const p = cam.project(x - sh * L[0] * y * k, sh ? 0 : y, z - sh * L[2] * y * k);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  x0 = Math.max(0, Math.floor(x0 - 3)); y0 = Math.max(0, Math.floor(y0 - 3));
  x1 = Math.min(VIEW.w, Math.ceil(x1 + 3)); y1 = Math.min(VIEW.h, Math.ceil(y1 + 3));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

const THEMES = [
  { id: 'lot-hedge', surf: /asphalt/, outer: 'grass', border: 'hedge', back: /concrete|plaster/, hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'] },
  { id: 'gravel-fence', surf: /gravel|concrete_floor_02|scuffed|cracked_concrete|granular/, outer: 'dirt', border: 'fence', back: /brick|block/, hdri: ['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast'] },
  { id: 'street', surf: /pav|cobble|square_floor|floor_pattern|asphalt/, outer: 'sidewalk', border: 'bollard', back: /brick|sandstone|stone|medieval/, hdri: ['urban', 'overcast', 'outdoor-midday'] },
  { id: 'rooftop', surf: /concrete|cement|plaster/, outer: 'roof', border: 'parapet', back: /concrete|plaster/, hdri: ['outdoor-midday', 'sunset', 'overcast', 'morning-afternoon'] },
  { id: 'garage', surf: /garage|painted|hangar|brushed|concrete_floor/, outer: 'dark', border: 'wall', back: /plaster|concrete|painted/, hdri: ['indoor', 'studio'] },
  { id: 'park-rail', surf: /asphalt|concrete_pavement|dirty_concrete/, outer: 'meadow', border: 'rail', back: /stone|rock|castle|block/, hdri: ['outdoor-midday', 'morning-afternoon', 'sunset'] },
  { id: 'winter', surf: /asphalt|concrete/, outer: 'snow', border: 'hedge-snow', back: /concrete|brick/, hdri: ['overcast', 'morning-afternoon', 'outdoor-midday'] },
  { id: 'campus', surf: /pav|square_floor|floor_pattern|hexagonal|cobble/, outer: 'grass', border: 'planter', back: /brick/, hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'] },
  { id: 'forest', surf: /gravel|asphalt|dirty/, outer: 'forest', border: 'logs', back: /stone|rock|castle/, hdri: ['morning-afternoon', 'overcast', 'outdoor-midday'] },
  { id: 'desert', surf: /asphalt|concrete|sandstone/, outer: 'sand', border: 'wall', back: /sandstone|medieval|stone/, hdri: ['outdoor-midday', 'sunset'] },
];
const HEDGE_GREENS = [['#2c5226', '#5a8a3c'], ['#24452a', '#4e7a44'], ['#3a5a1e', '#6f8f34'], ['#2e4f3a', '#5c7f5a'], ['#33502a', '#7a8e4a']];
const LINE_COLS = [['white', '#e6e4dc'], ['bright-white', '#efeee8'], ['yellow', '#e3bb2c'], ['cream', '#e8dcb4'], ['amber', '#d9a62a'], ['ivory', '#f0e9d2']];
const PLATE_COLS = [['blue', '#2f5fb3'], ['yellow', '#e3c22a'], ['white', '#ececec'], ['green', '#1f6b3a'], ['black', '#26282c']];
const RIM_COLS = [['silver', '#a9adb2'], ['black', '#2c2d30'], ['bronze', '#8d8270'], ['chrome', '#c7c9cc'], ['gunmetal', '#5a5e63']];
const FENCE_WOOD = /plank|wood_floor|weathered|rough_wood|wooden/;

export async function styleLook(style) {
  const rnd = style.rand;
  const themeSplit = splitIds('reverse_park_bay|theme', THEMES.map((t) => t.id), 3);
  const themes = THEMES.filter((t) => themeSplit(t.id) === style.split);
  const th = themes[style.primaryCombo('rpb-theme', [themes.length])[0]];
  style.note(`theme:${th.id}`);
  const floors = style.pool('tex', (t) => (t.use === 'floor' || t.use === 'flat2d') && th.surf.test(t.id));
  const surfT = floors.length ? K.pickOf(rnd, floors) : style.pick('tex', (t) => t.use === 'floor');
  const walls = style.pool('tex', (t) => (t.use === 'wall' || t.use === 'stone') && th.back.test(t.id));
  const wallT = walls.length ? K.pickOf(rnd, walls) : style.pick('tex', (t) => t.use === 'wall');
  const hdris = style.pool('hdri', (h) => th.hdri.includes(h.use));
  const hd = hdris.length ? K.pickOf(rnd, hdris) : style.pick('hdri');
  const outerPool = {
    grass: (t) => t.use === 'terrain' && /grass|forest_ground|mossy|leaves/.test(t.id),
    dirt: (t) => t.use === 'terrain' && /mud|ground|gravel|trail|sand/.test(t.id),
    sidewalk: (t) => (t.use === 'floor' || t.use === 'stone') && /pav|tile|cobble|slab|stone|square/.test(t.id),
    roof: (t) => (t.use === 'roof' || t.use === 'floor') && /roof|gravel|concrete/.test(t.id),
    dark: (t) => t.use === 'floor' && /concrete|cement|plaster/.test(t.id),
    meadow: (t) => t.use === 'terrain' && /grass|forest|leaves|mossy|rock/.test(t.id),
    snow: (t) => t.use === 'terrain' && /snow/.test(t.id),
    forest: (t) => t.use === 'terrain' && /forest|leaves|mud/.test(t.id),
    sand: (t) => t.use === 'terrain' && /sand/.test(t.id),
  }[th.outer];
  let outerL = style.pool('tex', outerPool);
  if (!outerL.length) outerL = style.pool('tex', (t) => t.use === 'terrain');
  const outerT = K.pickOf(rnd, outerL);
  const woodL = style.pool('tex', (t) => t.use === 'wood' && FENCE_WOOD.test(t.id));
  const woodT = woodL.length ? K.pickOf(rnd, woodL) : style.pick('tex', (t) => t.use === 'wood');
  const metalT = style.pick('tex', (t) => t.use === 'metal' && !/rust/.test(t.id)) || style.pick('tex', (t) => t.use === 'metal');
  style.note(`tex:${surfT.id}`); style.note(`tex:${wallT.id}`); style.note(`tex:${outerT.id}`); style.note(`hdri:${hd.id}`);
  const [surf, wallX, outer, wood, metal, sky] = await Promise.all([S3.loadTexture(surfT.file), S3.loadTexture(wallT.file), S3.loadTexture(outerT.file),
    S3.loadTexture(woodT.file), S3.loadTexture(metalT.file), S3.loadSky(hd.sky)]);
  const J = Array.from({ length: 12 }, () => rnd());
  const surfL = /garage|rooftop/.test(th.id) ? 0.11 + 0.09 * J[0] : /street|campus|desert/.test(th.id) ? 0.08 + 0.09 * J[0] : 0.05 + 0.09 * J[0];
  const surfFace = S3.scaleTo(S3.limitSat(surf.mean, th.id === 'garage' ? 0.28 : 0.18), surfL);
  const P = (pool, items, r) => K.splitPick(style, 'reverse_park_bay', pool, items, r);
  const line = P('line', LINE_COLS, J[1]);
  const lineLin = S3.linOf(line[1]);
  const outerFace = th.outer === 'snow' ? S3.scaleTo(S3.limitSat(outer.mean, 0.04), 0.62)
    : th.outer === 'dark' ? S3.scaleTo(S3.limitSat(outer.mean, 0.1), 0.03 + 0.03 * J[2])
      : S3.scaleTo(S3.limitSat(outer.mean, 0.5), Math.min(0.32, Math.max(0.08, S3.lum(outer.mean) * (0.8 + 0.5 * J[2]))));
  const paveFace = S3.scaleTo(S3.limitSat(wallX.mean, 0.15), 0.22 + 0.12 * J[3]);
  const wallFace = S3.scaleTo(S3.limitSat(wallX.mean, 0.32), Math.min(0.45, Math.max(0.14, S3.lum(wallX.mean) * (0.9 + 0.4 * J[4]))));
  const woodFace = S3.scaleTo(S3.limitSat(wood.mean, 0.5), Math.min(0.24, Math.max(0.06, S3.lum(wood.mean))));
  const metalFace = S3.scaleTo(S3.limitSat(metal.mean, 0.12), 0.3 + 0.15 * J[5]);
  const hg = P('hedge', HEDGE_GREENS, J[6]);
  const bodySplit = splitIds('reverse_park_bay|player_body', Object.keys(PLAYER_BODIES), 1);
  const bodies = Object.keys(PLAYER_BODIES).filter((b) => bodySplit(b) === style.split);
  const body = bodies[Math.floor(J[7] * bodies.length)];
  const plate = P('plate', PLATE_COLS, J[8])[1], rim = P('rim', RIM_COLS, J[9])[1];
  style.note(`border:${th.border}`); style.note(`body:${body}`);
  const light = S3.hdriLight(hd, lightFor(), { albedo: surfFace, total: 1.62, jitter: J[10] });
  return {
    theme: th, line: lineLin, lineHW: 0.05 + 0.02 * J[11], salt: 1 + Math.floor(J[5] * 991),
    surf: K.texSurf({ tex: surf, face: surfFace, keep: 0.35, cv: 0.16, texWorld: 2.4, cell: 3.0 }),
    outer: K.texSurf({ tex: outer, face: outerFace, keep: th.outer === 'snow' ? 0.1 : 0.6, cv: 0.3, texWorld: 2.0, cell: 4.0, salt: 3 }),
    pave: K.texSurf({ tex: wallX, face: paveFace, keep: 0.25, cv: 0.18, texWorld: 1.5 }),
    wallMat: K.texMat({ tex: wallX, face: wallFace, keep: 0.7, cv: 0.3, texWorld: 1.6, fp: 0.03, ks: 0.03, sh: 8 }),
    woodMat: K.texMat({ tex: wood, face: woodFace, keep: 0.7, cv: 0.25, texWorld: 1.2, fp: 0.03, ks: 0.05, sh: 12 }),
    metalMat: K.texMat({ tex: metal, face: metalFace, keep: 0.3, cv: 0.15, texWorld: 1.0, fp: 0.03, ks: 0.35, sh: 40 }),
    hedge: hg.map((h) => S3.linOf(h)), snowCap: th.border === 'hedge-snow',
    body: PLAYER_BODIES[body], plate, rim,
    light: { ...light, soft: Math.min(0.06, light.soft) }, sky: S3.skyFn(sky, 0.9 * S3.lum(light.sky) / 0.45),
    ids: { theme: th.id, surf: surfT.id, wall: wallT.id, outer: outerT.id, hdri: hd.id, body, line: line[0] },
  };
}

function floorFnStyled(m, cars, look) {
  const { zf, xe } = lotOf(m);
  const rects = cars.map((c) => footprint(c.pose, c.L, c.W, c.L / 2 - c.RO));
  const rowX = NB * BW / 2, LP = look.line, hw = look.lineHW, th = look.theme.id;
  const bx = xe + CURB.t + HEDGE.t, bz = zf + CURB.t + HEDGE.t, STAIN = [0.02, 0.02, 0.02];
  return (x, z, fp, out) => {
    if (x < -xe || x > xe || z < 0 || z > zf) {
      if (z < -WALL.t || z > bz || x < -bx || x > bx) {
        look.outer(x, z, fp, out);
        if (th === 'street' && z > bz + 2.2) {
          look.surf(x * 1.3 + 7, z * 1.3, fp, out); out[0] *= 0.85; out[1] *= 0.85; out[2] *= 0.85;
          const dash = RT.lineMask(z - (bz + 2.2 + 3.4), 1e9, 0.06, fp) * (Math.floor(x / 2) % 2 ? 1 : 0);
          if (dash > 0) RT.mixInto(out, out, LP, dash * 0.8);
        }
      } else look.pave(x, z, fp, out);
      return;
    }
    look.surf(x, z, fp, out);
    const sp = RT.fbm(x * 0.5 + 13 + look.salt, z * 0.5 - 7, 2, fp * 0.5);
    if (sp > 0.62) RT.mixInto(out, out, STAIN, Math.min(0.25, (sp - 0.62) * 1.2));
    if (th === 'winter') {
      const d = Math.min(xe - Math.abs(x), zf - z, z < BD ? 9 : z - BD + 9);
      const n = RT.fbm(x * 1.7, z * 1.7, 3, fp);
      const t = Math.max(0, Math.min(1, (1.1 - d) / 0.9 + (n - 0.5) * 1.2));
      if (t > 0 && z > BD + 0.3) RT.mixInto(out, out, [0.62, 0.63, 0.66], t * 0.85);
    }
    let paint = 0;
    if (z <= BD + hw && Math.abs(x) <= rowX + hw) {
      const lx = RT.lineMask(x + rowX, BW, hw, fp);
      const lz = z >= BD - hw ? Math.max(0, Math.min(1, (hw - Math.abs(z - BD)) / Math.max(fp, 1e-4) + 0.5)) : 0;
      paint = Math.max(z <= BD ? lx : 0, lz);
    }
    if (paint > 0) RT.mixInto(out, out, LP, paint * (0.8 + 0.2 * RT.fbm(x * 9, z * 9, 2, fp * 9)));
    let k = 1;
    for (const r of rects) {
      const dx = x - r.cx, dz = z - r.cz;
      if (dx * dx + dz * dz > (r.hl + AO_REACH + 0.3) ** 2) continue;
      const lu = Math.abs(dx * r.c + dz * r.s) - (r.hl - 0.2), lv = Math.abs(-dx * r.s + dz * r.c) - (r.hw - 0.12);
      const d = Math.hypot(Math.max(0, lu), Math.max(0, lv));
      if (d < AO_REACH) k *= 1 - 0.5 * (Math.exp(-d / 0.2) - Math.exp(-AO_REACH / 0.2)) / (1 - Math.exp(-AO_REACH / 0.2));
    }
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
}

function addBorder(look, shapes0, mats, id, x0, z0, x1, z1, t) {
  const shapes = { push: (sh) => { if (!(kind === 'hedge' || kind === 'hedge-snow' || kind === 'parapet' || kind === 'wall')) sh.noShadow = true; return shapes0.push(sh); } };
  const kind = look.theme.border, len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const yaw = -Math.atan2(uz, ux) * 180 / Math.PI, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const at = (mat) => mats.push(mat) - 1;
  if (kind === 'hedge' || kind === 'hedge-snow') {
    const [G0, G1] = look.hedge, snow = kind === 'hedge-snow';
    const hm = at({ c: G0, ks: 0.02, sh: 6, tex: (x, y, z, nx, ny, nz, s, out) => {
      const g = RT.fbm(x * 3.5 + y * 2, z * 3.5 - y * 2, 3), c = RT.fbm(x * 14 + y * 9, z * 14 - y * 7, 2);
      RT.mixInto(out, G0, G1, Math.max(0, Math.min(1, 0.2 + 0.6 * g + 0.35 * (c - 0.5))));
      if (snow && ny > 0.5 && RT.fbm(x * 6, z * 6, 2) > 0.3) RT.mixInto(out, out, [0.72, 0.73, 0.76], 0.85);
    } });
    shapes.push(RT.shape.box(id, hm, cx, HEDGE.h / 2, cz, len / 2, HEDGE.h / 2, t / 2, yaw, 0.18));
  } else if (kind === 'fence') {
    const wm = at(look.woodMat), n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) { const s = -len / 2 + len * i / n; shapes.push(RT.shape.box(id, wm, cx + ux * s, 0.45, cz + uz * s, 0.06, 0.45, 0.06, yaw, 0.01)); }
    for (const y of [0.32, 0.72]) shapes.push(RT.shape.box(id, wm, cx, y, cz, len / 2, 0.05, 0.025, yaw, 0.005));
  } else if (kind === 'bollard') {
    const bm = at({ ...look.metalMat, c: look.metalMat.c }), n = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) { const s = -len / 2 + len * i / n; shapes.push(RT.shape.cyl(id, bm, cx + ux * s, cz + uz * s, 0, 0.75, 0.09, 0.02)); }
  } else if (kind === 'parapet' || kind === 'wall') {
    const wm = at(look.wallMat), h = kind === 'wall' ? 0.85 : 0.7;
    shapes.push(RT.shape.box(id, wm, cx, h / 2, cz, len / 2, h / 2, Math.min(t / 2, 0.16), yaw, 0.02));
  } else if (kind === 'planter') {
    const wm = at(look.wallMat), [G0, G1] = look.hedge, n = Math.max(2, Math.round(len / 2.4));
    const sm = at({ c: G0, ks: 0.02, sh: 6, tex: (x, y, z, nx, ny, nz, s, out) => { RT.mixInto(out, G0, G1, 0.2 + 0.7 * RT.fbm(x * 9 + y * 5, z * 9 - y * 5, 3)); } });
    for (let i = 0; i < n; i++) {
      const s = -len / 2 + len * (i + 0.5) / n, px = cx + ux * s, pz = cz + uz * s;
      shapes.push(RT.shape.box(id, wm, px, 0.22, pz, len / n / 2 - 0.12, 0.22, t / 2 - 0.05, yaw, 0.02));
      for (let j = -1; j <= 1; j++) shapes.push(RT.shape.sphere(id, sm, px + ux * j * 0.55, 0.5, pz + uz * j * 0.55, 0.3));
    }
  } else if (kind === 'logs') {
    const wm = at(look.woodMat), n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + len * i / n + 0.08, b = -len / 2 + len * (i + 1) / n - 0.08;
      shapes.push(RT.shape.gcyl(id, wm, [cx + ux * a, 0.2, cz + uz * a], [cx + ux * b, 0.2, cz + uz * b], 0.2));
    }
  } else if (kind === 'rail') {
    const mm = at(look.metalMat), wm = at(look.woodMat), n = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= n; i++) { const s = -len / 2 + len * i / n; shapes.push(RT.shape.box(id, wm, cx + ux * s, 0.35, cz + uz * s, 0.07, 0.35, 0.07, yaw, 0.01)); }
    shapes.push(RT.shape.box(id, mm, cx, 0.55, cz, len / 2, 0.11, 0.03, yaw, 0.01));
  }
}
function staticShapesStyled(m, shapes, mats, look) {
  const { zf, xe } = lotOf(m);
  const wm = mats.push(look.wallMat) - 1;
  const curb = mats.push({ c: S3.scaleTo([0.5, 0.49, 0.46], 0.42), ks: 0.03, sh: 8 }) - 1;
  shapes.push(RT.shape.box(900, wm, 0, WALL.h / 2, -WALL.t / 2, xe + CURB.t + HEDGE.t, WALL.h / 2, WALL.t / 2, 0, 0.03));
  const ze = zf + CURB.t + HEDGE.t;
  shapes.push(RT.shape.box(901, curb, 0, CURB.h / 2, zf + CURB.t / 2, xe + CURB.t, CURB.h / 2, CURB.t / 2, 0, 0.03));
  for (const sg of [-1, 1]) shapes.push(RT.shape.box(903 + (sg > 0), curb, sg * (xe + CURB.t / 2), CURB.h / 2, (zf + CURB.t) / 2, CURB.t / 2, CURB.h / 2, (zf + CURB.t) / 2, 0, 0.03));
  const bt = HEDGE.t, xb = xe + CURB.t + bt / 2;
  addBorder(look, shapes, mats, 902, -xb - bt / 2, zf + CURB.t + bt / 2, xb + bt / 2, zf + CURB.t + bt / 2, bt);
  for (const sg of [-1, 1]) addBorder(look, shapes, mats, 905 + (sg > 0), sg * xb, -WALL.t, sg * xb, ze - bt, bt);
}
function buildSceneStyled(m, playerPose, look) {
  const shapes = [], mats = [];
  const B = baseMats(mats);
  mats[B.plate] = { c: RT.lin(look.plate), ks: 0.3, sh: 30 };
  mats[B.rim] = { c: RT.lin(look.rim), ks: 0.5, sh: 40 };
  staticShapesStyled(m, shapes, mats, look);
  const cars = parkedCars(m);
  cars.forEach((c, i) => addCar(shapes, mats, B, 10 + i, c.pose, c.style, c.paint));
  if (playerPose) {
    addCar(shapes, mats, B, PLAYER_ID, playerPose, look.body, m.look.paint);
    cars.push({ pose: playerPose, L: CAR.L, W: CAR.W, RO: CAR.RO });
  }
  for (const s of shapes) s.noAO = true;
  return RT.makeScene({ cam: cameraFor(m), shapes, mats, light: look.light, env: { floorY: 0, floor: floorFnStyled(m, cars, look), sky: look.sky }, exposure: 1.0 });
}
