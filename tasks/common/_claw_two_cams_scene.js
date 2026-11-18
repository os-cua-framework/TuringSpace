import { lin, fbm, vnoise, makeCam, camFromBasis, makeScene, shape, objectStats, pickId } from './_claw_two_cams_rt.js';

export const A = 0.55;
export const N = 5;
export const CELL = 0.2;
export const cellX = (i) => -((N - 1) / 2) * CELL + CELL * i;
export const cellZ = (j) => -((N - 1) / 2) * CELL + CELL * j;
export const VIEW = Object.freeze({ w: 340, h: 296 });
export const CLAW = Object.freeze({ tip: 0.40, hubTop: 0.60 });
export const CLAW_ID = 50, CHUTE_ID = 40, HAT_ID0 = 60;
const D2R = Math.PI / 180;

const VIEWS = {
  front: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  R: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  L: [0, 0, 1, 0, 1, 0, -1, 0, 0],
};
export const viewKey = (m, which) => (which === 'front' ? 'front' : m.side);
const mv = (V, p) => [V[0] * p[0] + V[1] * p[1] + V[2] * p[2], V[3] * p[0] + V[4] * p[1] + V[5] * p[2], V[6] * p[0] + V[7] * p[1] + V[8] * p[2]];
const mm = (P, Q) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = P[r * 3] * Q[c] + P[r * 3 + 1] * Q[3 + c] + P[r * 3 + 2] * Q[6 + c];
  return o;
};
const tr = (P) => [P[0], P[3], P[6], P[1], P[4], P[7], P[2], P[5], P[8]];
function rotY(d) { const a = d * D2R, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotX(d) { const a = d * D2R, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotZ(d) { const a = d * D2R, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }

const C = {
  black: '#1c1b20', white: '#f6f3ec',
};
const sym = (part) => [part, { ...part, c: part.c ? [-part.c[0], part.c[1], part.c[2]] : undefined, a: part.a ? [-part.a[0], part.a[1], part.a[2]] : undefined,
  b: part.b ? [-part.b[0], part.b[1], part.b[2]] : undefined, rot: part.rot ? [part.rot[0], -part.rot[1], -part.rot[2]] : undefined }];
export const KINDS = {
  bunny: { label: 'pink bunny', sc: 0.8, col: '#f2a6bf', parts: [
    { t: 'e', c: [0, 0.052, -0.008], r: [0.048, 0.05, 0.046], col: 'main' },
    { t: 's', c: [0, 0.118, 0.012], r: 0.04, col: 'main' },
    ...sym({ t: 'k', a: [0.016, 0.146, 0.0], b: [0.025, 0.2, -0.014], r: 0.0125, col: 'main' }),
    ...sym({ t: 'e', c: [0.019, 0.172, 0.007], r: [0.006, 0.022, 0.003], rot: [-14, 0, -8], col: '#e57b9c' }),
    ...sym({ t: 's', c: [0.016, 0.124, 0.047], r: 0.0058, col: C.black, mat: 1 }),
    { t: 's', c: [0, 0.112, 0.051], r: 0.0058, col: '#d9587e', mat: 2 },
    ...sym({ t: 'e', c: [0.022, 0.032, 0.04], r: [0.015, 0.016, 0.016], col: 'main' }),
    ...sym({ t: 'e', c: [0.03, 0.011, 0.032], r: [0.017, 0.011, 0.026], col: '#fbe6ec' }),
    { t: 's', c: [0, 0.045, -0.054], r: 0.016, col: '#fbe6ec' },
  ] },
  bear: { label: 'brown bear', sc: 0.92, col: '#a5713f', parts: [
    { t: 'e', c: [0, 0.05, -0.005], r: [0.052, 0.052, 0.046], col: 'main' },
    { t: 'e', c: [0, 0.046, 0.026], r: [0.034, 0.034, 0.022], col: '#d8b083' },
    { t: 's', c: [0, 0.122, 0.006], r: 0.044, col: 'main' },
    ...sym({ t: 's', c: [0.033, 0.158, 0.0], r: 0.016, col: 'main' }),
    ...sym({ t: 's', c: [0.033, 0.159, 0.009], r: 0.0085, col: '#d8b083' }),
    { t: 'e', c: [0, 0.11, 0.043], r: [0.021, 0.016, 0.014], col: '#e6cba2' },
    { t: 's', c: [0, 0.117, 0.057], r: 0.0068, col: C.black, mat: 1 },
    ...sym({ t: 's', c: [0.017, 0.134, 0.04], r: 0.0056, col: C.black, mat: 1 }),
    ...sym({ t: 'k', a: [0.042, 0.075, 0.01], b: [0.05, 0.04, 0.032], r: 0.015, col: 'main' }),
    ...sym({ t: 'e', c: [0.027, 0.018, 0.035], r: [0.019, 0.017, 0.026], col: 'main' }),
  ] },
  duck: { label: 'yellow duck', sc: 1.04, col: '#f4c93a', parts: [
    { t: 'e', c: [0, 0.048, -0.01], r: [0.052, 0.045, 0.06], col: 'main' },
    { t: 's', c: [0, 0.112, 0.02], r: 0.036, col: 'main' },
    { t: 'e', c: [0, 0.103, 0.058], r: [0.02, 0.008, 0.018], col: '#f08a24', mat: 2 },
    ...sym({ t: 's', c: [0.016, 0.12, 0.049], r: 0.0052, col: C.black, mat: 1 }),
    ...sym({ t: 'e', c: [0.048, 0.055, -0.012], r: [0.012, 0.026, 0.04], rot: [0, 0, 14], col: '#efbd2c' }),
    { t: 'e', c: [0, 0.07, -0.06], r: [0.02, 0.011, 0.018], rot: [-32, 0, 0], col: 'main' },
    ...sym({ t: 'e', c: [0.02, 0.006, 0.038], r: [0.016, 0.006, 0.02], col: '#f08a24', mat: 2 }),
  ] },
  frog: { label: 'green frog', sc: 1.06, col: '#72bb4c', parts: [
    { t: 'e', c: [0, 0.045, -0.005], r: [0.058, 0.045, 0.05], col: 'main' },
    { t: 'e', c: [0, 0.04, 0.022], r: [0.04, 0.03, 0.033], col: '#cfe7a6' },
    { t: 'e', c: [0, 0.088, 0.014], r: [0.054, 0.034, 0.044], col: 'main' },
    ...sym({ t: 's', c: [0.027, 0.118, 0.02], r: 0.018, col: 'main' }),
    ...sym({ t: 's', c: [0.029, 0.121, 0.033], r: 0.0115, col: C.white }),
    ...sym({ t: 's', c: [0.03, 0.122, 0.043], r: 0.0065, col: C.black, mat: 1 }),
    ...sym({ t: 's', c: [0.033, 0.084, 0.05], r: 0.0068, col: '#f29c9c' }),
    ...sym({ t: 'e', c: [0.03, 0.012, 0.045], r: [0.018, 0.012, 0.022], col: 'main' }),
    ...sym({ t: 'e', c: [0.052, 0.016, -0.012], r: [0.02, 0.016, 0.035], col: 'main' }),
  ] },
  penguin: { label: 'penguin', sc: 0.88, col: '#2b3142', parts: [
    { t: 'e', c: [0, 0.07, 0], r: [0.05, 0.07, 0.046], col: 'main' },
    { t: 'e', c: [0, 0.062, 0.014], r: [0.04, 0.056, 0.038], col: C.white },
    { t: 's', c: [0, 0.145, 0.0], r: 0.038, col: 'main' },
    { t: 'e', c: [0, 0.141, 0.014], r: [0.03, 0.026, 0.028], col: C.white },
    ...sym({ t: 's', c: [0.013, 0.15, 0.04], r: 0.0052, col: C.black, mat: 1 }),
    { t: 'e', c: [0, 0.139, 0.044], r: [0.009, 0.006, 0.012], col: '#f29a2e', mat: 2 },
    ...sym({ t: 'e', c: [0.05, 0.075, 0.0], r: [0.01, 0.035, 0.018], rot: [0, 0, 20], col: 'main' }),
    ...sym({ t: 'e', c: [0.018, 0.006, 0.034], r: [0.015, 0.006, 0.02], col: '#f29a2e', mat: 2 }),
  ] },
  elephant: { label: 'gray elephant', sc: 1.0, col: '#9aa4b3', parts: [
    { t: 'e', c: [0, 0.055, -0.012], r: [0.054, 0.052, 0.05], col: 'main' },
    { t: 's', c: [0, 0.115, 0.02], r: 0.042, col: 'main' },
    ...sym({ t: 'e', c: [0.047, 0.12, 0.004], r: [0.008, 0.036, 0.03], rot: [0, 22, 0], col: 'main' }),
    ...sym({ t: 'e', c: [0.05, 0.12, 0.008], r: [0.004, 0.026, 0.021], rot: [0, 22, 0], col: '#e7b9c5' }),
    { t: 'k', a: [0, 0.108, 0.054], b: [0, 0.082, 0.071], r: 0.012, col: 'main' },
    { t: 'k', a: [0, 0.082, 0.071], b: [0, 0.064, 0.079], r: 0.0105, col: 'main' },
    ...sym({ t: 's', c: [0.017, 0.126, 0.056], r: 0.0052, col: C.black, mat: 1 }),
    ...sym({ t: 'k', a: [0.03, 0.03, 0.028], b: [0.03, 0.009, 0.034], r: 0.016, col: 'main' }),
  ] },
  cat: { label: 'orange cat', sc: 0.92, col: '#ee9548', parts: [
    { t: 'e', c: [0, 0.05, -0.008], r: [0.048, 0.05, 0.046], col: 'main' },
    { t: 'e', c: [0, 0.05, 0.024], r: [0.03, 0.036, 0.022], col: '#fbefe0' },
    { t: 's', c: [0, 0.118, 0.01], r: 0.042, col: 'main' },
    ...sym({ t: 'f', c: [0.027, 0.142, 0.002], y1: 0.181, r0: 0.017, r1: 0.0025, col: 'main' }),
    { t: 'e', c: [0, 0.106, 0.045], r: [0.021, 0.013, 0.012], col: '#fbefe0' },
    { t: 's', c: [0, 0.114, 0.055], r: 0.0048, col: '#e07f8f', mat: 2 },
    ...sym({ t: 's', c: [0.016, 0.127, 0.047], r: 0.0056, col: C.black, mat: 1 }),
    ...sym({ t: 'e', c: [0.02, 0.012, 0.04], r: [0.016, 0.012, 0.02], col: '#fbefe0' }),
    { t: 'k', a: [0.03, 0.018, -0.045], b: [0.05, 0.068, -0.058], r: 0.011, col: 'main' },
    { t: 'k', a: [0.05, 0.068, -0.058], b: [0.044, 0.1, -0.05], r: 0.0105, col: 'main' },
  ] },
  octopus: { label: 'purple octopus', sc: 1.06, col: '#a178d4', parts: [
    { t: 'e', c: [0, 0.085, 0], r: [0.052, 0.058, 0.05], col: 'main' },
    ...[30, 90, 150, 210, 270, 330].flatMap((deg) => {
      const a = deg * D2R, cx = Math.cos(a), cz = Math.sin(a);
      return [
        { t: 'k', a: [0.024 * cx, 0.036, 0.024 * cz], b: [0.056 * cx, 0.012, 0.056 * cz], r: 0.013, col: 'main' },
        { t: 'k', a: [0.056 * cx, 0.012, 0.056 * cz], b: [0.068 * cx, 0.021, 0.068 * cz], r: 0.0095, col: 'main' },
      ];
    }),
    ...sym({ t: 's', c: [0.018, 0.09, 0.046], r: 0.0075, col: C.black, mat: 1 }),
    ...sym({ t: 's', c: [0.031, 0.074, 0.04], r: 0.0062, col: '#f2a0c0' }),
  ] },
  whale: { label: 'blue whale', sc: 1.08, col: '#4d85cf', parts: [
    { t: 'e', c: [0, 0.055, 0.006], r: [0.05, 0.055, 0.058], col: 'main' },
    { t: 'e', c: [0, 0.04, 0.018], r: [0.04, 0.032, 0.048], col: '#dfe9f5' },
    { t: 'k', a: [0, 0.064, -0.044], b: [0, 0.088, -0.06], r: 0.013, col: 'main' },
    ...sym({ t: 'e', c: [0.019, 0.098, -0.066], r: [0.022, 0.0065, 0.012], rot: [0, 0, 24], col: 'main' }),
    ...sym({ t: 's', c: [0.037, 0.066, 0.042], r: 0.0052, col: C.black, mat: 1 }),
    ...sym({ t: 'e', c: [0.048, 0.028, 0.02], r: [0.008, 0.011, 0.02], rot: [0, 0, -30], col: 'main' }),
  ] },
};
export const KIND_NAMES = Object.keys(KINDS);

export const HATS = { red: '#d8282b', blue: '#2352d6', yellow: '#f3cd18', green: '#1f9a45' };
export const HAT_AT = {
  bunny: [0, 0.155, 0.012], bear: [0, 0.162, 0.006], duck: [0, 0.144, 0.02], frog: [0, 0.115, -0.01],
  penguin: [0, 0.179, 0], elephant: [0, 0.153, 0.02], cat: [0, 0.156, 0.008], octopus: [0, 0.139, 0], whale: [0, 0.106, 0.01],
};
export const HAT_OK = {
  bunny: ['blue', 'yellow', 'green'], bear: ['red', 'blue', 'yellow', 'green'], duck: ['red', 'blue', 'green'],
  frog: ['red', 'blue', 'yellow'], penguin: ['red', 'yellow', 'green'], elephant: ['red', 'blue', 'yellow', 'green'],
  cat: ['blue', 'green'], octopus: ['red', 'yellow', 'green'], whale: ['red', 'yellow', 'green'],
};
export function hatParts(toy) {
  if (!toy.hat) return [];
  const K = KINDS[toy.kind], s = K.sc * toy.s, a = HAT_AT[toy.kind];
  const R0 = rotY(toy.yaw), q = mv(R0, a), x = cellX(toy.i) + toy.dx + s * q[0], z = cellZ(toy.j) + toy.dz + s * q[2], y = s * a[1];
  return [
    { t: 'f', c: [x, y - 0.004, z], y1: y + 0.05, r0: 0.024, r1: 0.003, col: HATS[toy.hat], mat: 2 },
    { t: 's', c: [x, y + 0.052, z], r: 0.0068, col: '#fbfbf7', mat: 2 },
  ];
}

export function toyParts(toy) {
  const K = KINDS[toy.kind], s = K.sc * toy.s;
  const R0 = rotY(toy.yaw), x0 = cellX(toy.i) + toy.dx, z0 = cellZ(toy.j) + toy.dz;
  const W = (p) => { const q = mv(R0, p); return [x0 + s * q[0], s * q[1], z0 + s * q[2]]; };
  const out = [];
  for (const P of K.parts) {
    const col = P.col === 'main' ? K.col : P.col, mat = P.mat ?? 0;
    if (P.t === 'e') {
      let Rl = rotY(0);
      if (P.rot) Rl = mm(rotY(P.rot[1]), mm(rotX(P.rot[0]), rotZ(P.rot[2])));
      out.push({ t: 'e', c: W(P.c), r: P.r.map((v) => v * s), A: mm(R0, Rl), col, mat });
    } else if (P.t === 's') out.push({ t: 's', c: W(P.c), r: P.r * s, col, mat });
    else if (P.t === 'k') out.push({ t: 'k', a: W(P.a), b: W(P.b), r: P.r * s, col, mat });
    else if (P.t === 'f') { const c = W(P.c); out.push({ t: 'f', c, y1: P.y1 * s, r0: P.r0 * s, r1: P.r1 * s, col, mat }); }
  }
  return out;
}
export function toyTop(toy) {
  let top = 0;
  for (const p of toyParts(toy).concat(hatParts(toy))) {
    if (p.t === 's') top = Math.max(top, p.c[1] + p.r);
    else if (p.t === 'k') top = Math.max(top, p.a[1] + p.r, p.b[1] + p.r);
    else if (p.t === 'f') top = Math.max(top, p.y1);
    else top = Math.max(top, p.c[1] + Math.hypot(p.A[3] * p.r[0], p.A[4] * p.r[1], p.A[5] * p.r[2]));
  }
  return top;
}
export function toyAABB(toy) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (cx, cz, ex, ez) => { x0 = Math.min(x0, cx - ex); x1 = Math.max(x1, cx + ex); z0 = Math.min(z0, cz - ez); z1 = Math.max(z1, cz + ez); };
  for (const p of toyParts(toy)) {
    if (p.t === 's') add(p.c[0], p.c[2], p.r, p.r);
    else if (p.t === 'k') { add(p.a[0], p.a[2], p.r, p.r); add(p.b[0], p.b[2], p.r, p.r); }
    else if (p.t === 'f') add(p.c[0], p.c[2], p.r0, p.r0);
    else add(p.c[0], p.c[2], Math.hypot(p.A[0] * p.r[0], p.A[1] * p.r[1], p.A[2] * p.r[2]), Math.hypot(p.A[6] * p.r[0], p.A[7] * p.r[1], p.A[8] * p.r[2]));
  }
  return [x0, z0, x1, z1];
}
export function chuteAABB(i) { const x = cellX(i), z = cellZ(N - 1), h = 0.089; return [x - h, z - h, x + h, z + h]; }

export function clawParts(x, z, drop = 0) {
  const y = (v) => v - drop, out = [];
  out.push({ t: 'f', c: [x, y(0.585), z], y1: y(0.605), r0: 0.03, r1: 0.011, col: '#c9ced6', mat: 3 });
  out.push({ t: 'cyl', c: [x, y(0.528), z], y1: y(0.586), r: 0.032, col: '#c9ced6', mat: 3 });
  out.push({ t: 'cyl', c: [x, y(0.516), z], y1: y(0.53), r: 0.024, col: '#3a3f48', mat: 5 });
  for (let k = 0; k < 3; k++) {
    const a = (90 + 120 * k) * D2R, cx = Math.cos(a), cz = Math.sin(a);
    const P = (r, h) => [x + r * cx, y(h), z + r * cz];
    out.push({ t: 'k', a: P(0.016, 0.52), b: P(0.056, 0.468), r: 0.0082, col: '#d4d8de', mat: 3 });
    out.push({ t: 'k', a: P(0.056, 0.468), b: P(0.047, 0.425), r: 0.0078, col: '#d4d8de', mat: 3 });
    out.push({ t: 'k', a: P(0.047, 0.425), b: P(0.033, 0.402), r: 0.0072, col: '#d4d8de', mat: 3 });
  }
  return out;
}

export function chuteParts(i) {
  const x = cellX(i), z = cellZ(N - 1), h = 0.125, hw = 0.085, t = 0.006;
  return [
    { t: 'box', c: [x, h / 2, z - hw + t], h: [hw, h / 2, t], col: '#dceaf3', mat: 4 },
    { t: 'box', c: [x, h / 2, z + hw - t], h: [hw, h / 2, t], col: '#dceaf3', mat: 4 },
    { t: 'box', c: [x - hw + t, h / 2, z], h: [t, h / 2, hw - 2 * t], col: '#dceaf3', mat: 4 },
    { t: 'box', c: [x + hw - t, h / 2, z], h: [t, h / 2, hw - 2 * t], col: '#dceaf3', mat: 4 },
    { t: 'box', c: [x, h + 0.006, z], h: [hw + 0.004, 0.006, hw + 0.004], hole: true, col: '#f2b33d', mat: 2 },
    { t: 'box', c: [x, 0.003, z], h: [hw - t, 0.003, hw - t], col: '#2a2d36', mat: 5 },
  ];
}

function toShapes(parts, V, id, noShadow) {
  const out = [];
  for (const p of parts) {
    const made = [];
    if (p.t === 'e') {
      const Av = mm(V, p.A), c = mv(V, p.c);
      made.push(shape.ellipsoid(id, p.mat, c[0], c[1], c[2], p.r[0], p.r[1], p.r[2], tr(Av)));
    } else if (p.t === 's') { const c = mv(V, p.c); made.push(shape.sphere(id, p.mat, c[0], c[1], c[2], p.r)); }
    else if (p.t === 'k') made.push(shape.capsule(id, p.mat, mv(V, p.a), mv(V, p.b), p.r));
    else if (p.t === 'f') { const c = mv(V, p.c); made.push(shape.frustum(id, p.mat, c[0], c[2], c[1], p.y1, p.r0, p.r1)); }
    else if (p.t === 'cyl') { const c = mv(V, p.c); made.push(shape.cyl(id, p.mat, c[0], c[2], c[1], p.y1, p.r, 0.006)); }
    else if (p.t === 'box') {
      const c = mv(V, p.c), swap = V[0] === 0, hx = swap ? p.h[2] : p.h[0], hz = swap ? p.h[0] : p.h[2];
      if (p.hole) {
        const b = 0.008;
        made.push(shape.box(id, p.mat, c[0], c[1], c[2] - hz + b, hx, p.h[1], b, 0, 0.004));
        made.push(shape.box(id, p.mat, c[0], c[1], c[2] + hz - b, hx, p.h[1], b, 0, 0.004));
        made.push(shape.box(id, p.mat, c[0] - hx + b, c[1], c[2], b, p.h[1], hz - 2 * b, 0, 0.004));
        made.push(shape.box(id, p.mat, c[0] + hx - b, c[1], c[2], b, p.h[1], hz - 2 * b, 0, 0.004));
      } else made.push(shape.box(id, p.mat, c[0], c[1], c[2], hx, p.h[1], hz, 0, 0.002));
    }
    for (const s of made) {
      s.col = lin(p.col);
      if (noShadow) { s.noShadow = true; s.noAO = true; }
      out.push(s);
    }
  }
  return out;
}

const camCache = new Map();
export function camOf(m, which) {
  const key = `${viewKey(m, which)}|${m.cams[which].el}|${m.cams[which].dist}`;
  if (camCache.has(key)) return camCache.get(key);
  const { el, dist } = m.cams[which], e = el * D2R, ty = 0.24;
  const eye = [0, ty + dist * Math.sin(e), dist * Math.cos(e)];
  const c0 = makeCam({ eye, target: [0, ty, 0], fovY: 14, W: VIEW.w, H: VIEW.h });
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(c0.project(sx * A, 0, sz * A));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) pts.push(c0.project(cellX(i), CLAW.hubTop, cellZ(j)));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const TOP = 38, BOT = -3, SIDE = -8;
  const s = Math.min((VIEW.w - 2 * SIDE) / (x1 - x0), (VIEW.h - TOP - BOT) / (y1 - y0));
  const cx = VIEW.w / 2 - s * ((x0 + x1) / 2 - c0.cx), cy = TOP - s * (y0 - c0.cy);
  const cam = camFromBasis({ eye, F: c0.F, R: c0.R, U: c0.U, f: c0.f * s, cx, cy, W: VIEW.w, H: VIEW.h });
  camCache.set(key, cam);
  return cam;
}
export function projectIn(m, which, p) {
  const q = mv(VIEWS[viewKey(m, which)], p);
  return camOf(m, which).project(q[0], q[1], q[2]);
}

const fabric = (x, y, z) => 0.94 + 0.09 * vnoise(x * 160 + z * 90, y * 160 - z * 70) + 0.03 * vnoise(x * 420 - z * 300, y * 420);
const MATS = [
  { c: [1, 1, 1], ks: 0.035, sh: 6, tex: (x, y, z, nx, ny, nz, s, out) => { const k = fabric(x, y, z); out[0] = s.col[0] * k; out[1] = s.col[1] * k; out[2] = s.col[2] * k; } },
  { c: [1, 1, 1], ks: 0.75, sh: 110, tex: (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; } },
  { c: [1, 1, 1], ks: 0.22, sh: 26, tex: (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; } },
  { c: [1, 1, 1], ks: 0.95, sh: 70, env: 0.55, tex: (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; } },
  { c: [1, 1, 1], ks: 0.35, sh: 40, env: 0.25, tex: (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; } },
  { c: [1, 1, 1], ks: 0.12, sh: 20, tex: (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; } },
];
const FELT_A = lin('#a9b5de'), FELT_B = lin('#97a4d2');
function feltFloor(x, z, fp, out) {
  const n = fbm(x * 9, z * 9, 3, fp * 9), f = 0.94 + 0.08 * vnoise(x * 260, z * 260);
  for (let c = 0; c < 3; c++) out[c] = (FELT_A[c] + (FELT_B[c] - FELT_A[c]) * n) * f;
}
const BACK = lin('#f5d9e5'), DOT = lin('#fbeef3'), SIDEP = lin('#cfe9e1'), FRONTG = lin('#c7d6e0');
const wallTex = {
  back: (u, y, fp, out) => {
    const gx = u / 0.07, gy = y / 0.07, row = Math.floor(gy), off = row % 2 ? 0.5 : 0;
    const dx = gx - Math.floor(gx + off) - 0.5 + off, dy = gy - row - 0.5, d = Math.hypot(dx, dy);
    const k = Math.max(0, Math.min(1, (0.2 - d) / Math.max(0.02, fp / 0.07) + 0.5));
    for (let c = 0; c < 3; c++) out[c] = BACK[c] + (DOT[c] - BACK[c]) * k * 0.9;
  },
  side: (u, y, fp, out) => { const k = 0.96 + 0.05 * fbm(u * 6, y * 6, 2, fp * 6); for (let c = 0; c < 3; c++) out[c] = SIDEP[c] * k; },
  front: (u, y, fp, out) => { for (let c = 0; c < 3; c++) out[c] = FRONTG[c]; },
};
const WALLMAP = {
  front: { zneg: 'back', xneg: 'side', xpos: 'side', zpos: null },
  R: { zneg: 'side', xneg: 'front', xpos: 'back', zpos: null },
  L: { zneg: 'side', xneg: 'back', xpos: 'front', zpos: null },
};
const CAB = lin('#5b2b46'), CAB2 = lin('#3a1d30');
function envFor(vk) {
  const W = WALLMAP[vk];
  return {
    floorY: 0, box: A, floor: feltFloor, wallMat: { ks: 0, sh: 1, flat: 0.55 },
    walls: [
      { ax: 2, pos: -A, n: 1, tex: wallTex[W.zneg] },
      { ax: 0, pos: -A, n: 1, tex: wallTex[W.xneg] },
      { ax: 0, pos: A, n: -1, tex: wallTex[W.xpos] },
    ],
    sky: (dx, dy, dz, out) => { const t = Math.max(0, Math.min(1, dy * 1.2 + 0.5)); out[0] = 0.62 + 0.3 * t; out[1] = 0.6 + 0.3 * t; out[2] = 0.62 + 0.3 * t; },
    outside: (dx, dy, dz, out) => { const t = Math.max(0, Math.min(1, 0.5 - dy * 3)); for (let c = 0; c < 3; c++) out[c] = CAB[c] + (CAB2[c] - CAB[c]) * t; },
  };
}
function lightFor(V) {
  const n = (v) => { const l = Math.hypot(...v); return v.map((q) => q / l); };
  return { dir: n(mv(V, [-0.38, 1, 0.5])), col: [1.15, 1.12, 1.05], soft: 0.09, sky: [0.36, 0.36, 0.4], ground: [0.2, 0.18, 0.21],
    fill: { dir: n(mv(V, [0.6, 0.45, 0.6])), col: [0.14, 0.14, 0.16] }, aoK: 1.2, contact: 0.36, contactH: 0.022 };
}

export function sceneOf(m, which, opts = {}) {
  const vk = viewKey(m, which), V = VIEWS[vk];
  const shapes = [];
  m.toys.forEach((t, k) => { shapes.push(...toShapes(toyParts(t), V, k + 1, false)); if (t.hat) shapes.push(...toShapes(hatParts(t), V, HAT_ID0 + k, false)); });
  shapes.push(...toShapes(chuteParts(m.chute), V, CHUTE_ID, false));
  if (opts.claw) shapes.push(...toShapes(clawParts(cellX(opts.claw[0]), cellZ(opts.claw[1]), opts.drop || 0), V, CLAW_ID, true));
  const L = opts.look;
  if (L) return makeScene({ cam: camOf(m, which), shapes, mats: L.mats, env: L.env(vk), light: L.light(V), exposure: 0.95 });
  return makeScene({ cam: camOf(m, which), shapes, mats: MATS, env: envFor(vk), light: lightFor(V), exposure: 0.95 });
}
export function clawBox(m, which, i, j, drop = 0) {
  const pts = [];
  const x = cellX(i), z = cellZ(j);
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const r = 0.068;
    pts.push(projectIn(m, which, [x + (a & 1 ? r : -r), (a & 2 ? CLAW.hubTop + 0.005 : CLAW.tip - 0.01) - drop, z + (a & 4 ? r : -r)]));
  }
  return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
}
export { objectStats, pickId, lightFor, WALLMAP, fabric as plushNoise };
