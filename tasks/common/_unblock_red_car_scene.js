import * as RT from './_unblock_red_car_rt.js';
import { N, RED_ROW } from './_unblock_red_car_logic.js';

export const CELL = 2.5, HALF = (N / 2) * CELL;
export const VIEW = { w: 340, h: 268 };
const WALL = { h: 0.45, t: 0.3 };
export const EXIT_LANE = 3.2;
export const CAR_ROOF = 1.42;
export const HMAX = 2.0 * CAR_ROOF;
const DEG = Math.PI / 180;
export const slotX = (c) => (c + 0.5) * CELL - HALF, slotZ = (r) => (r + 0.5) * CELL - HALF;

export const STYLES = {
  sedan: { L: 4.4, W: 1.8, RO: 0.85, WB: 2.65, y0: 0.22, belt: 0.84, roof: 1.42, cab: [-0.42, 0.32, 1.52, 2.38] },
  hatch: { L: 4.08, W: 1.76, RO: 0.72, WB: 2.56, y0: 0.22, belt: 0.86, roof: 1.47, cab: [-0.60, -0.28, 1.42, 2.22] },
};
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
    plate: at({ c: RT.lin('#e9e7df'), ks: 0.3, sh: 30 }),
    glass: at({ c: RT.lin('#26303b'), ks: 0.55, sh: 70, env: 0.35 }),
    chassis: at({ c: RT.lin('#2b2d31'), ks: 0.1, sh: 12 }),
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
function addCar(shapes, mats, B, id, pose, style, paintHex) {
  const st = STYLES[style], { f, r, u, P } = carFrame(pose);
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
  const planes = [[[0, -1, 0], -b0], [[0, 1, 0], roof], [wsN, dot(wsN, P(wf, bl))], [rwN, dot(rwN, P(rb, bl))]];
  for (const sg of [-1, 1]) {
    const n = norm([r[0] * sg * Math.cos(tau), Math.sin(tau), r[2] * sg * Math.cos(tau)]);
    planes.push([n, dot(n, P(0, bl, sg * hwc))]);
  }
  const pts = [];
  for (const fw of [rb, wf]) for (const yy of [b0, roof]) for (const sd of [-hwc, hwc]) pts.push(P(fw, yy, sd));
  shapes.push(convexFromPlanes(id, cab, planes, pts));
  wheels(shapes, B, id, P, [0, st.WB], hw - 0.12, 0.31);
  const ob = (m, fw, up, side, h) => RT.shape.obox(id, m, P(fw, up, side), [r, u, f], h);
  for (const sg of [-1, 1]) {
    shapes.push(ob(B.head, xf - 0.14, bl - 0.1, sg * (hw - 0.27), [0.21, 0.065, 0.13]));
    shapes.push(ob(B.tail, xr + 0.1, bl - 0.1, sg * (hw - 0.25), [0.21, 0.052, 0.1]));
    shapes.push(ob(paint, wf - 0.18, bl + 0.09, sg * (hw + 0.06), [0.07, 0.05, 0.1]));
  }
  shapes.push(ob(B.trim, xf - 0.01, y0 + 0.24, 0, [0.42, 0.09, 0.03]));
  shapes.push(ob(B.plate, xr - 0.005, y0 + 0.3, 0, [0.21, 0.065, 0.012]));
}
function wheels(shapes, B, id, P, axles, c, rad, dual = false) {
  for (const fw of axles) for (const sg of [-1, 1]) {
    shapes.push(RT.shape.gcyl(id, B.tire, P(fw, rad, sg * (c - 0.11 - (dual ? 0.1 : 0))), P(fw, rad, sg * (c + 0.1)), rad));
    shapes.push(RT.shape.gcyl(id, B.rim, P(fw, rad, sg * (c + 0.095)), P(fw, rad, sg * (c + 0.11)), rad * 0.58));
  }
}

function tallTex(frame, paintHex, spec) {
  const PAINT = RT.lin(paintHex), GLASS = RT.lin('#26303b'), GLASS2 = RT.lin('#3c4a58'), SEAM = RT.lin(paintHex).map((v) => v * 0.55);
  const { f, o } = frame;
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = (x - o[0]) * f[0] + (z - o[2]) * f[2], fn = nx * f[0] + nz * f[2];
    out[0] = PAINT[0]; out[1] = PAINT[1]; out[2] = PAINT[2];
    if (ny > 0.9) return;
    if (fn > 0.35 && y > spec.wsY0 && y < spec.wsY1) { RT.mixInto(out, GLASS, GLASS2, 0.4 * (y - spec.wsY0) / (spec.wsY1 - spec.wsY0)); return; }
    if (Math.abs(fn) < 0.3 && u > spec.winU0 && u < spec.winU1 && y > spec.winY0 && y < spec.winY1) { RT.mixInto(out, GLASS, GLASS2, 0.3); return; }
    for (const us of spec.seams) if (Math.abs(fn) < 0.3 && Math.abs(u - us) < 0.025 && y > spec.seamY0) { out[0] = SEAM[0]; out[1] = SEAM[1]; out[2] = SEAM[2]; return; }
  };
}
function prism(id, mat, P, f, r, prof, hw) {
  const planes = [], pts = [];
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length];
    const nf = b[1] - a[1], nu = -(b[0] - a[0]), l = Math.hypot(nf, nu);
    const n = [f[0] * nf / l, nu / l, f[2] * nf / l];
    planes.push([n, dot(n, P(a[0], a[1]))]);
  }
  for (const sg of [-1, 1]) { const n = [r[0] * sg, 0, r[2] * sg]; planes.push([n, dot(n, P(0, 0, sg * hw))]); }
  for (const [fw, up] of prof) for (const sd of [-hw, hw]) pts.push(P(fw, up, sd));
  return convexFromPlanes(id, mat, planes, pts);
}
export const VAN = { L: 4.7, W: 1.95 }, TRUCK = { L: 7.0, W: 2.3 };
function addVan(shapes, mats, B, id, ctr, h, H, paintHex) {
  const L = VAN.L, W = VAN.W, hw = W / 2, f = [Math.cos(h), 0, Math.sin(h)], r = [-Math.sin(h), 0, Math.cos(h)], u = [0, 1, 0];
  const o = [ctr.x - f[0] * L / 2, 0, ctr.z - f[2] * L / 2];
  const P = (fw, up, side = 0) => [o[0] + f[0] * fw + r[0] * side, up, o[2] + f[2] * fw + r[2] * side];
  const y0 = 0.3, nose = 1.05, wsU = L - 0.95;
  const spec = { wsY0: nose + 0.06, wsY1: H - 0.08, winU0: L - 1.85, winU1: wsU + 0.05, winY0: nose + 0.12, winY1: Math.min(H - 0.3, 1.95), seams: [L - 1.95, L - 3.1, 0.06], seamY0: y0 + 0.15 };
  const paint = mats.push({ c: RT.lin(paintHex), ks: 0.28, sh: 40, env: 0.18, tex: tallTex({ f, o }, paintHex, spec) }) - 1;
  shapes.push(prism(id, paint, P, f, r, [[0, y0], [L, y0], [L, nose], [wsU, H], [0, H]], hw));
  wheels(shapes, B, id, P, [0.85, L - 0.9], hw - 0.13, 0.34);
  const ob = (m, fw, up, side, hh) => RT.shape.obox(id, m, P(fw, up, side), [r, u, f], hh);
  shapes.push(ob(B.trim, L + 0.02, y0 + 0.16, 0, [hw - 0.02, 0.12, 0.05]));
  shapes.push(ob(B.trim, -0.02, y0 + 0.16, 0, [hw - 0.02, 0.12, 0.05]));
  for (const sg of [-1, 1]) {
    shapes.push(ob(B.head, L + 0.005, nose - 0.2, sg * (hw - 0.3), [0.22, 0.08, 0.02]));
    shapes.push(ob(B.tail, -0.005, 1.2, sg * (hw - 0.08), [0.06, 0.25, 0.02]));
    shapes.push(ob(B.trim, wsU - 0.1, nose + 0.35, sg * (hw + 0.07), [0.06, 0.09, 0.1]));
  }
  shapes.push(ob(B.plate, -0.03, y0 + 0.42, 0, [0.21, 0.065, 0.012]));
}
function addTruck(shapes, mats, B, id, ctr, h, H, paintHex, boxHex) {
  const L = TRUCK.L, W = TRUCK.W, hw = W / 2, f = [Math.cos(h), 0, Math.sin(h)], r = [-Math.sin(h), 0, Math.cos(h)], u = [0, 1, 0];
  const o = [ctr.x - f[0] * L / 2, 0, ctr.z - f[2] * L / 2];
  const P = (fw, up, side = 0) => [o[0] + f[0] * fw + r[0] * side, up, o[2] + f[2] * fw + r[2] * side];
  const cabL = 2.0, cab0 = L - cabL, Hc = Math.min(2.25, H - 0.2), nose = 1.25, y0 = 0.42;
  const cabSpec = { wsY0: nose + 0.08, wsY1: Hc - 0.08, winU0: cab0 + 0.25, winU1: L - 0.45, winY0: nose + 0.1, winY1: Hc - 0.18, seams: [], seamY0: 9 };
  const cabMat = mats.push({ c: RT.lin(paintHex), ks: 0.3, sh: 44, env: 0.2, tex: tallTex({ f, o }, paintHex, cabSpec) }) - 1;
  shapes.push(prism(id, cabMat, P, f, r, [[cab0, y0], [L, y0], [L, nose], [L - 0.38, Hc], [cab0, Hc]], hw - 0.04));
  const boxSpec = { wsY0: 99, wsY1: 99, winU0: 0, winU1: 0, winY0: 99, winY1: 99, seams: [0.08, (cab0 - 0.1) / 3, 2 * (cab0 - 0.1) / 3, cab0 - 0.18], seamY0: 1.0 };
  const boxMat = mats.push({ c: RT.lin(boxHex), ks: 0.12, sh: 20, tex: tallTex({ f, o }, boxHex, boxSpec) }) - 1;
  const ob = (m, fw, up, side, hh) => RT.shape.obox(id, m, P(fw, up, side), [r, u, f], hh);
  shapes.push(ob(boxMat, (cab0 - 0.1) / 2, (0.95 + H) / 2, 0, [hw, (H - 0.95) / 2, (cab0 - 0.1) / 2]));
  shapes.push(ob(B.chassis, L / 2 - 0.2, 0.68, 0, [hw - 0.25, 0.22, L / 2 - 0.3]));
  wheels(shapes, B, id, P, [1.1, 2.15, L - 1.25], hw - 0.15, 0.42, true);
  shapes.push(ob(B.trim, L + 0.02, y0 + 0.12, 0, [hw - 0.05, 0.13, 0.06]));
  for (const sg of [-1, 1]) {
    shapes.push(ob(B.head, L + 0.005, nose - 0.32, sg * (hw - 0.32), [0.22, 0.09, 0.02]));
    shapes.push(ob(B.tail, -0.02, 0.8, sg * (hw - 0.2), [0.18, 0.07, 0.02]));
    shapes.push(ob(B.trim, L - 0.55, nose + 0.45, sg * (hw + 0.1), [0.05, 0.22, 0.1]));
  }
}

export function placeOf(v, a, off = 0) {
  const mid = a + v.len / 2 + off;
  const x = v.dir === 'h' ? mid * CELL - HALF : slotX(v.fixed), z = v.dir === 'h' ? slotZ(v.fixed) : mid * CELL - HALF;
  const h = v.dir === 'h' ? (v.nose > 0 ? 0 : Math.PI) : (v.nose > 0 ? Math.PI / 2 : -Math.PI / 2);
  return { x, z, h };
}
export const heightOf = (v) => (v.kind === 'car' ? STYLES[v.style].roof : v.H);
export const lengthOf = (v) => (v.kind === 'car' ? STYLES[v.style].L : v.kind === 'van' ? VAN.L : TRUCK.L);
export const widthOf = (v) => (v.kind === 'car' ? STYLES[v.style].W : v.kind === 'van' ? VAN.W : TRUCK.W);
export const VID = (i) => 10 + i;
function addVehicle(shapes, mats, B, i, v, a, off = 0) {
  const p = placeOf(v, a, off), id = VID(i);
  if (v.kind === 'car') {
    const st = STYLES[v.style], back = st.L / 2 - st.RO;
    addCar(shapes, mats, B, id, { x: p.x - Math.cos(p.h) * back, z: p.z - Math.sin(p.h) * back, h: p.h }, v.style, v.paint);
  } else if (v.kind === 'van') addVan(shapes, mats, B, id, p, p.h, v.H, v.paint);
  else addTruck(shapes, mats, B, id, p, p.h, v.H, v.paint, v.box);
}

const ASPH0 = RT.lin('#55585c'), ASPH1 = RT.lin('#65686c'), STAIN = RT.lin('#47494c'), LINE = RT.lin('#ecebe4');
const PAVE = RT.lin('#b4b1a9'), GRASS0 = RT.lin('#5b8a3e'), GRASS1 = RT.lin('#78a250'), ARROW = RT.lin('#2f9e55');
const exitZ0 = slotZ(RED_ROW) - CELL / 2, exitZ1 = slotZ(RED_ROW) + CELL / 2;
function inArrow(x, z) {
  const zc = (exitZ0 + exitZ1) / 2, dz = Math.abs(z - zc), x0 = HALF + WALL.t + 0.35, xh = HALF + WALL.t + 1.7, x1 = HALF + WALL.t + 2.7;
  if (x >= x0 && x <= xh && dz <= 0.32) return true;
  if (x >= xh && x <= x1) return dz <= 0.85 * (x1 - x) / (x1 - xh);
  return false;
}
function floorFn() {
  const lw = 0.05;
  return (x, z, fp, out) => {
    const inLot = Math.abs(x) <= HALF && Math.abs(z) <= HALF;
    const inLane = x > HALF && x <= HALF + WALL.t + EXIT_LANE && z >= exitZ0 && z <= exitZ1;
    if (!inLot && !inLane) {
      const far = Math.abs(x) > HALF + WALL.t + 1.6 || Math.abs(z) > HALF + WALL.t + 1.6;
      if (far && !(x > HALF && z >= exitZ0 - 1.4 && z <= exitZ1 + 1.4 && x <= HALF + WALL.t + EXIT_LANE + 1.4)) {
        const g = RT.fbm(x * 1.1, z * 1.1, 3, fp);
        RT.mixInto(out, GRASS0, GRASS1, Math.max(0, Math.min(1, 0.25 + 0.6 * g)));
      } else { const n = 0.9 + 0.15 * RT.fbm(x * 4, z * 4, 3, fp); out[0] = PAVE[0] * n; out[1] = PAVE[1] * n; out[2] = PAVE[2] * n; }
      return;
    }
    const n = RT.fbm(x * 0.7, z * 0.7, 3, fp), gr = RT.fbm(x * 24, z * 24, 2, fp * 24);
    RT.mixInto(out, ASPH0, ASPH1, Math.max(0, Math.min(1, 0.5 + 0.6 * (n - 0.5) + 0.35 * (gr - 0.5))));
    const sp = RT.fbm(x * 0.5 + 13, z * 0.5 - 7, 2, fp * 0.5);
    if (sp > 0.64) RT.mixInto(out, out, STAIN, Math.min(0.3, (sp - 0.64) * 1.5));
    let paint = 0;
    if (inLot) {
      paint = Math.max(RT.lineMask(x + HALF, CELL, lw, fp), RT.lineMask(z + HALF, CELL, lw, fp));
    } else if (inArrow(x, z)) paint = -1;
    if (paint > 0) RT.mixInto(out, out, LINE, paint * (0.8 + 0.2 * RT.fbm(x * 9, z * 9, 2, fp * 9)));
    else if (paint < 0) RT.mixInto(out, out, ARROW, 0.92);
  };
}
function staticShapes(shapes, mats) {
  const concrete = mats.push({ c: RT.lin('#c2bdb3'), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 3 + z * 3, y * 6, 3); RT.mixInto(out, RT.lin('#aea99f'), RT.lin('#cdc8bd'), 0.25 + 0.6 * n); } }) - 1;
  const E = HALF + WALL.t / 2, hy = WALL.h / 2;
  shapes.push(RT.shape.box(900, concrete, 0, hy, -E, HALF + WALL.t, hy, WALL.t / 2, 0, 0.03));
  shapes.push(RT.shape.box(901, concrete, 0, hy, E, HALF + WALL.t, hy, WALL.t / 2, 0, 0.03));
  shapes.push(RT.shape.box(902, concrete, -E, hy, 0, WALL.t / 2, hy, HALF, 0, 0.03));
  const zA = (-HALF + exitZ0) / 2, hA = (exitZ0 + HALF) / 2, zB = (exitZ1 + HALF) / 2, hB = (HALF - exitZ1) / 2;
  if (hA > 0) shapes.push(RT.shape.box(903, concrete, E, hy, zA, WALL.t / 2, hy, hA, 0, 0.03));
  if (hB > 0) shapes.push(RT.shape.box(904, concrete, E, hy, zB, WALL.t / 2, hy, hB, 0, 0.03));
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

export const DIST = 30;
const CAM_CACHE = new Map();
export function cameraFor(cam, view = VIEW) {
  const key = `${cam.az}|${cam.el}|${view.w}|${view.h}`;
  if (CAM_CACHE.has(key)) return CAM_CACHE.get(key);
  const a = cam.az * DEG, e = cam.el * DEG, t = [0, 0.6, 0];
  const eye = [t[0] + DIST * Math.sin(a) * Math.cos(e), t[1] + DIST * Math.sin(e), t[2] + DIST * Math.cos(a) * Math.cos(e)];
  const base = RT.makeCam({ eye, target: t, fovY: 30, W: view.w, H: view.h });
  const proj = (p) => {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
    const zc = dx * base.F[0] + dy * base.F[1] + dz * base.F[2];
    return [(dx * base.R[0] + dy * base.R[1] + dz * base.R[2]) / zc, -(dx * base.U[0] + dy * base.U[1] + dz * base.U[2]) / zc];
  };
  const pts = [], E = HALF + WALL.t;
  for (const x of [-E, E]) for (const z of [-E, E]) for (const y of [0, HMAX]) pts.push([x, y, z]);
  for (const z of [exitZ0, exitZ1]) pts.push([HALF + WALL.t + EXIT_LANE, 0, z]);
  const xs = pts.map((p) => proj(p)[0]), ys = pts.map((p) => proj(p)[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 4, f = Math.min((view.w - 2 * pad) / (x1 - x0), (view.h - 2 * pad) / (y1 - y0));
  const c = RT.camFromBasis({ eye, F: base.F, R: base.R, U: base.U, f, cx: view.w / 2 - f * (x0 + x1) / 2, cy: view.h / 2 - f * (y0 + y1) / 2, W: view.w, H: view.h });
  if (CAM_CACHE.size > 64) CAM_CACHE.clear();
  CAM_CACHE.set(key, c);
  return c;
}

export function buildScene(m, anchors, opts = {}) {
  const shapes = [], mats = [];
  const B = baseMats(mats);
  if (!opts.noStatic) staticShapes(shapes, mats);
  m.vehicles.forEach((v, i) => {
    if (i === opts.skip || (opts.only && !opts.only.includes(i))) return;
    addVehicle(shapes, mats, B, i, v, anchors[i], opts.off && opts.off.id === i ? opts.off.d : 0);
  });
  for (const s of shapes) s.noAO = true;
  return RT.makeScene({ cam: cameraFor(m.camera), shapes, mats, light: lightFor(), env: { floorY: 0, floor: floorFn(), sky }, exposure: 1.0 });
}
export { RT };
export const EXIT = { z0: exitZ0, z1: exitZ1, x: HALF + WALL.t, inArrow };
export function withCamera(sc, camera) { return { ...sc, cam: cameraFor(camera), tiles: null }; }
