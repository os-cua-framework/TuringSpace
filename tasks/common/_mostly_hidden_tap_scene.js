import { lin, fbm, hash2, lineMask, makeCam, makeScene, shape, hitShape, camDir } from './_mostly_hidden_tap_rt.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const IMG = Object.freeze({ w: 380, h: 300 });
const D2R = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export const THEMES = Object.freeze({
  penguin: { noun: 'penguin', plural: 'penguins', cam: { h: [1.62, 1.74], g: [6.1, 6.7], fov: 40 }, sunEl: [34, 46], depth: [3.2, 6.0], far: [12.0, 14.0], W: 0.5, H: 0.908, top: 0.908, rad: 0.26, bottom: ['snow', 'ice'], side: ['iceslab'] },
  pumpkin: { noun: 'pumpkin', plural: 'pumpkins', cam: { h: [1.58, 1.7], g: [4.3, 4.8], fov: 40 }, sunEl: [30, 40], depth: [2.9, 5.3], far: [11.0, 12.5], W: 0.5, H: 0.42, top: 0.49, rad: 0.27, bottom: ['bale', 'stone'], side: ['stump', 'balestack', 'stump', 'balestack', 'trunk'] },
});

export function eyeOf(cam) { return [0, cam.h, 0]; }
export function cameraFor(cam) {
  return makeCam({ eye: eyeOf(cam), target: [0, 0, -cam.g], fovY: cam.fov, W: IMG.w, H: IMG.h });
}

function rotA(yawDeg, rollDeg = 0, pitchDeg = 0) {
  const a = yawDeg * D2R, r = rollDeg * D2R, p = pitchDeg * D2R;
  const cy = Math.cos(a), sy = Math.sin(a), cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  return mul3(mul3(Ry, Rz), Rx);
}
function mul3(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
const transpose = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];

const MODELS = {
  penguin: [
    { k: 'e', c: [0, 0.43, 0], r: [0.2, 0.4, 0.168], mat: 'pbody', core: 1 },
    { k: 'e', c: [0, 0.8, 0.03], r: [0.105, 0.108, 0.112], mat: 'phead', core: 1 },
    { k: 'e', c: [0, 0.781, 0.152], r: [0.021, 0.019, 0.074], pitch: 12, mat: 'pbeak', core: 0 },
    { k: 'e', c: [-0.196, 0.49, -0.012], r: [0.025, 0.2, 0.064], roll: -9, mat: 'pflip', core: 1 },
    { k: 'e', c: [0.196, 0.49, -0.012], r: [0.025, 0.2, 0.064], roll: 9, mat: 'pflip', core: 1 },
    { k: 'e', c: [-0.066, 0.018, 0.1], r: [0.046, 0.018, 0.068], mat: 'pfeet', core: 1 },
    { k: 'e', c: [0.066, 0.018, 0.1], r: [0.046, 0.018, 0.068], mat: 'pfeet', core: 1 },
  ],
  pumpkin: [
    { k: 'e', c: [0, 0.21, 0], r: [0.25, 0.21, 0.25], mat: 'pump', core: 1 },
    { k: 'k', a: [0, 0.392, 0], b: [0.018, 0.462, 0.009], r: 0.029, mat: 'stem', core: 0 },
  ],
};

export function objParts(theme, o) {
  const a = o.yaw * D2R, c = Math.cos(a), s = Math.sin(a);
  const W = (p) => [o.x + p[0] * c + p[2] * s, p[1], o.z - p[0] * s + p[2] * c];
  return MODELS[theme].map((P) => {
    if (P.k === 'e') return { k: 'e', c: W(P.c), r: P.r, M: transpose(rotA(o.yaw, P.roll || 0, P.pitch || 0)), mat: P.mat, core: P.core, lp: P };
    return { k: 'k', a: W(P.a), b: W(P.b), r: P.r, mat: P.mat, core: P.core, lp: P };
  });
}
export function objShapes(theme, o, id, matOf = () => 0) {
  return objParts(theme, o).map((p) => {
    const m = matOf(p.mat);
    const s = p.k === 'e' ? shape.ellipsoid(id, m, p.c[0], p.c[1], p.c[2], p.r[0], p.r[1], p.r[2], p.M)
      : shape.capsule(id, m, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r);
    s.core = p.core; s.lp = p.lp;
    return s;
  });
}

export const BEVEL = { snow: 0.06, ice: 0.035, iceslab: 0.04, bale: 0.03, balestack: 0.03, stone: 0.02, stump: 0.025 };
export function occShape(oc, id, m = 0) {
  if (oc.kind === 'trunk') return shape.cyl(id, m, oc.x, oc.z, 0, oc.h, oc.r, BEVEL.stump);
  const bev = Math.min(BEVEL[oc.style] || 0.02, oc.h * 0.25, oc.w * 0.25, oc.d * 0.25);
  return shape.box(id, m, oc.x, oc.h / 2, oc.z, oc.w / 2, oc.h / 2, oc.d / 2, oc.yaw, bev);
}
export function occFoot(oc) {
  return oc.kind === 'trunk' ? { t: 'circ', cx: oc.x, cz: oc.z, r: oc.r } : { t: 'obb', cx: oc.x, cz: oc.z, hx: oc.w / 2, hz: oc.d / 2, yaw: oc.yaw };
}
export function occPoints(oc) {
  const pts = [];
  if (oc.kind === 'trunk') {
    const top = Math.min(oc.h, 3.5);
    for (const y of [0, top]) for (let k = 0; k < 32; k++) { const t = k / 32 * 2 * Math.PI; pts.push([oc.x + oc.r * Math.cos(t), y, oc.z + oc.r * Math.sin(t)]); }
    return pts;
  }
  const a = oc.yaw * D2R, c = Math.cos(a), s = Math.sin(a);
  for (const y of [0, oc.h]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * oc.w / 2, lz = sz * oc.d / 2;
    pts.push([oc.x + lx * c + lz * s, y, oc.z - lx * s + lz * c]);
  }
  return pts;
}
export function occHull(cam, oc) {
  const P = occPoints(oc).map((p) => { const q = cam.project(p[0], p[1], p[2]); return [q.x, q.y]; });
  return hull2(P);
}
export function polyBox(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
export function polyArea(P) {
  let a = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
export function inPoly(P, x, y) {
  let sgn = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    const cr = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sgn) sgn = s; else if (s !== sgn) return false;
  }
  return true;
}
function hull2(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

function camMatrix(cam) {
  const { f, cx, cy, F, R, U, eye } = cam;
  const rows = [
    [f * R[0] + cx * F[0], f * R[1] + cx * F[1], f * R[2] + cx * F[2]],
    [-f * U[0] + cy * F[0], -f * U[1] + cy * F[1], -f * U[2] + cy * F[2]],
    [F[0], F[1], F[2]],
  ];
  return rows.map((r) => [r[0], r[1], r[2], -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2])]);
}
function conicBox(P, Ainv, c, out) {
  const Q = [
    [Ainv[0] - c[0] * c[0], Ainv[1] - c[0] * c[1], Ainv[2] - c[0] * c[2], -c[0]],
    [Ainv[3] - c[1] * c[0], Ainv[4] - c[1] * c[1], Ainv[5] - c[1] * c[2], -c[1]],
    [Ainv[6] - c[2] * c[0], Ainv[7] - c[2] * c[1], Ainv[8] - c[2] * c[2], -c[2]],
    [-c[0], -c[1], -c[2], -1],
  ];
  const PQ = P.map((r) => [0, 1, 2, 3].map((j) => r[0] * Q[0][j] + r[1] * Q[1][j] + r[2] * Q[2][j] + r[3] * Q[3][j]));
  const C = PQ.map((r) => P.map((q) => r[0] * q[0] + r[1] * q[1] + r[2] * q[2] + r[3] * q[3]));
  const roots = (a, b2, c0) => {
    const disc = Math.max(0, b2 * b2 - a * c0), sq = Math.sqrt(disc);
    return [(b2 - sq) / a, (b2 + sq) / a];
  };
  const [x0, x1] = roots(C[2][2], C[0][2], C[0][0]), [y0, y1] = roots(C[2][2], C[1][2], C[1][1]);
  out[0] = Math.min(out[0], x0, x1); out[2] = Math.max(out[2], x0, x1);
  out[1] = Math.min(out[1], y0, y1); out[3] = Math.max(out[3], y0, y1);
}
export function partBoxes(cam, theme, o) {
  const P = cam.__P || (cam.__P = camMatrix(cam));
  return objParts(theme, o).map((p) => {
    const out = [Infinity, Infinity, -Infinity, -Infinity];
    if (p.k === 'e') {
      const M = p.M, r = p.r, Ai = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Ai[i * 3 + j] = M[i] * M[j] * r[0] * r[0] + M[3 + i] * M[3 + j] * r[1] * r[1] + M[6 + i] * M[6 + j] * r[2] * r[2];
      conicBox(P, Ai, p.c, out);
    } else {
      const r2 = p.r * p.r, Ai = [r2, 0, 0, 0, r2, 0, 0, 0, r2];
      conicBox(P, Ai, p.a, out); conicBox(P, Ai, p.b, out);
    }
    return out;
  });
}
export function objBox(cam, theme, o) {
  const out = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of partBoxes(cam, theme, o)) { out[0] = Math.min(out[0], b[0]); out[1] = Math.min(out[1], b[1]); out[2] = Math.max(out[2], b[2]); out[3] = Math.max(out[3], b[3]); }
  return out;
}

export function sampleObject(cam, theme, o, rows = 36, shapes = null) {
  const S = shapes || objShapes(theme, o, 0);
  const pb = partBoxes(cam, theme, o);
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of pb) { box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]); }
  const s = Math.min((box[3] - box[1]) / rows, (box[2] - box[0]) / (0.7 * rows));
  const nc = Math.max(1, Math.ceil((box[2] - box[0]) / s - 1e-9)), nr = Math.max(1, Math.ceil((box[3] - box[1]) / s - 1e-9));
  const x0 = (box[0] + box[2]) / 2 - nc * s / 2, y0 = (box[1] + box[3]) / 2 - nr * s / 2;
  const n = nc * nr, t = new Float64Array(n).fill(Infinity), core = new Uint8Array(n), dir = new Float64Array(3 * n);
  const e = cam.eye, np = S.length;
  const cand = new Array(np);
  for (let r = 0; r < nr; r++) {
    const y = y0 + (r + 0.5) * s;
    let rowParts = 0;
    for (let k = 0; k < np; k++) if (pb[k][1] <= y && pb[k][3] >= y) cand[rowParts++] = k;
    for (let c = 0; c < nc; c++) {
      const i = r * nc + c, x = x0 + (c + 0.5) * s, d = camDir(cam, x, y);
      dir[3 * i] = d[0]; dir[3 * i + 1] = d[1]; dir[3 * i + 2] = d[2];
      let best = Infinity, isCore = 0;
      for (let q = 0; q < rowParts; q++) {
        const k = cand[q], b = pb[k];
        if (x < b[0] || x > b[2]) continue;
        const sh = S[k], tt = hitShape(sh, e[0], e[1], e[2], d[0], d[1], d[2], best);
        if (tt < best) { best = tt; isCore = sh.core; }
      }
      t[i] = best; core[i] = isCore;
    }
  }
  return { x0, y0, s, nc, nr, n, t, core, dir, box, eye: e };
}
export function hiddenBy(S, shapes, out = null) {
  const h = out || new Uint8Array(S.n), e = S.eye;
  for (let i = 0; i < S.n; i++) {
    if (S.t[i] === Infinity) { h[i] = 0; continue; }
    const dx = S.dir[3 * i], dy = S.dir[3 * i + 1], dz = S.dir[3 * i + 2];
    let hid = 0;
    for (const sh of shapes) if (hitShape(sh, e[0], e[1], e[2], dx, dy, dz, S.t[i]) < S.t[i]) { hid = 1; break; }
    h[i] = hid;
  }
  return h;
}
export function cutStats(S, hid, cut) {
  let sil = 0, hidAll = 0;
  for (let i = 0; i < S.n; i++) if (S.t[i] < Infinity) { sil++; if (hid[i]) hidAll++; }
  const res = { sil, hidAll, area: sil ? hidAll / sil : 0, lin: 0, mismatch: 0, contiguous: true, lines: 0 };
  if (!cut) return res;
  const byRow = cut === 'bottom', L = byRow ? S.nr : S.nc;
  const nCore = new Int32Array(L), hCore = new Int32Array(L);
  let coreAll = 0;
  for (let r = 0; r < S.nr; r++) for (let c = 0; c < S.nc; c++) {
    const i = r * S.nc + c;
    if (S.t[i] === Infinity || !S.core[i]) continue;
    const k = byRow ? r : c;
    nCore[k]++; coreAll++; if (hid[i]) hCore[k]++;
  }
  const order = [];
  for (let k = 0; k < L; k++) if (nCore[k] > 0) order.push(k);
  if (cut === 'bottom' || cut === 'right') order.reverse();
  let hidLines = 0, mis = 0, seenVisible = false, contiguous = true;
  for (const k of order) {
    const hidden = hCore[k] * 2 > nCore[k];
    if (hidden) { hidLines++; if (seenVisible) contiguous = false; } else seenVisible = true;
    mis += Math.min(hCore[k], nCore[k] - hCore[k]);
  }
  if (order.length && hCore[order[order.length - 1]] * 2 > nCore[order[order.length - 1]]) contiguous = false;
  res.lines = order.length; res.lin = order.length ? hidLines / order.length : 0;
  res.mismatch = coreAll ? mis / coreAll : 0; res.contiguous = contiguous;
  return res;
}
export function visiblePart(S, hid) {
  const { nc, nr, s, x0, y0 } = S;
  const vis = new Uint8Array(S.n);
  let n = 0, c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity, sx = 0, sy = 0;
  const pts = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const i = r * nc + c;
    if (S.t[i] === Infinity || hid[i]) continue;
    vis[i] = 1; n++;
    if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
    const x = x0 + (c + 0.5) * s, y = y0 + (r + 0.5) * s;
    pts.push(x, y); sx += x; sy += y;
  }
  if (!n) return { n: 0, area: 0, box: null, pts, anchor: null, hgt: 0, wid: 0, vis };
  const D = new Int32Array(S.n);
  for (let i = 0; i < S.n; i++) D[i] = vis[i] ? 1 << 20 : 0;
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const i = r * nc + c; if (!D[i]) continue;
    let m = D[i];
    if (c === 0 || r === 0) m = 1;
    else m = Math.min(m, D[i - 1] + 1, D[i - nc] + 1, D[i - nc - 1] + 1, c + 1 < nc ? D[i - nc + 1] + 1 : 1);
    D[i] = m;
  }
  for (let r = nr - 1; r >= 0; r--) for (let c = nc - 1; c >= 0; c--) {
    const i = r * nc + c; if (!D[i]) continue;
    let m = D[i];
    if (c === nc - 1 || r === nr - 1) m = 1;
    else m = Math.min(m, D[i + 1] + 1, D[i + nc] + 1, D[i + nc + 1] + 1, c > 0 ? D[i + nc - 1] + 1 : 1);
    D[i] = m;
  }
  const cx = sx / n, cy = sy / n;
  let best = -Infinity, anchor = null;
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const i = r * nc + c; if (!vis[i]) continue;
    const x = x0 + (c + 0.5) * s, y = y0 + (r + 0.5) * s;
    const score = D[i] * 1000 - Math.hypot(x - cx, y - cy);
    if (score > best) { best = score; anchor = [x, y]; }
  }
  return { n, area: n * s * s, box: [x0 + c0 * s, y0 + r0 * s, x0 + (c1 + 1) * s, y0 + (r1 + 1) * s], pts, anchor,
    hgt: (r1 - r0 + 1) * s, wid: (c1 - c0 + 1) * s, cx, cy, vis };
}
export function coreExtent(S) {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (let r = 0; r < S.nr; r++) for (let c = 0; c < S.nc; c++) {
    const i = r * S.nc + c;
    if (S.t[i] === Infinity || !S.core[i]) continue;
    if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  return { hgt: (r1 - r0 + 1) * S.s, wid: (c1 - c0 + 1) * S.s, box: [S.x0 + c0 * S.s, S.y0 + r0 * S.s, S.x0 + (c1 + 1) * S.s, S.y0 + (r1 + 1) * S.s] };
}

export function sunDir(sun) {
  const a = sun.az * D2R, e = sun.el * D2R;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
export function shadowShare(S, vis, propShapes, L) {
  let n = 0, sh = 0;
  const e = S.eye;
  for (let i = 0; i < S.n; i++) {
    if (!vis[i]) continue;
    n++;
    const t = S.t[i] - 2e-3, px = e[0] + t * S.dir[3 * i], py = e[1] + t * S.dir[3 * i + 1], pz = e[2] + t * S.dir[3 * i + 2];
    for (const s of propShapes) if (hitShape(s, px, py, pz, L[0], L[1], L[2], Infinity) < Infinity) { sh++; break; }
  }
  return n ? sh / n : 0;
}

const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
function boxLocal(s, x, z) { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; }
function objLocal(F, x, z) { const px = x - F.x, pz = z - F.z; return [px * F.c - pz * F.s, px * F.s + pz * F.c]; }

const PEN = { black: cA('#1b1f25'), flank: cA('#2b313a'), white: cA('#f3f1ea'), gold: cA('#f4c04e'), ear: cA('#f39a26'), beakO: cA('#e8763a'), feet: cA('#34343a') };
function penguinBody(x, y, z, nx, ny, nz, s, out) {
  const [lx, lz] = objLocal(s.frame, x, z), P = s.lp;
  const u = lx / P.r[0], v = (y - P.c[1]) / P.r[1], w = lz / P.r[2];
  const edge = 0.08 + 1.6 * Math.max(0, v - 0.55);
  const b = smooth(edge - 0.06, edge + 0.06, w);
  mixInto(out, PEN.black, PEN.flank, clamp01(0.5 + 0.5 * Math.abs(u)) * 0.6);
  if (b > 0) {
    const g = smooth(0.25, 0.62, v) * (1 - smooth(0.78, 0.9, v));
    const bel = [0, 0, 0];
    mixInto(bel, PEN.white, PEN.gold, g * 0.9);
    mixInto(out, out.slice(), bel, b);
  }
}
function penguinHead(x, y, z, nx, ny, nz, s, out) {
  const [lx, lz] = objLocal(s.frame, x, z), P = s.lp;
  const u = lx / P.r[0], v = (y - P.c[1]) / P.r[1], w = (lz - P.c[2]) / P.r[2];
  out[0] = PEN.black[0]; out[1] = PEN.black[1]; out[2] = PEN.black[2];
  const d = Math.hypot((Math.abs(u) - 0.78) / 0.32, (v + 0.2) / 0.42, (w + 0.05) / 0.5);
  if (d < 1) mixInto(out, PEN.black, PEN.ear, smooth(1, 0.75, d));
  if (w > 0.45 && v < -0.35) mixInto(out, out.slice(), PEN.gold, smooth(0.45, 0.75, w) * smooth(-0.35, -0.7, v));
}
function penguinBeak(x, y, z, nx, ny, nz, s, out) {
  const P = s.lp, dy = y - P.c[1];
  if (dy < -0.004) { out[0] = PEN.beakO[0]; out[1] = PEN.beakO[1]; out[2] = PEN.beakO[2]; } else { out[0] = PEN.black[0]; out[1] = PEN.black[1]; out[2] = PEN.black[2]; }
}
const PUMP = { lobe: cA('#e87a1f'), deep: cA('#c25a12'), crown: cA('#8c7a2c'), stem: cA('#6d6531') };
const RIBS = 10;
function pumpkinAngle(s, x, z) { const [lx, lz] = objLocal(s.frame, x, z); return Math.atan2(lz, lx); }
function pumpkinTex(x, y, z, nx, ny, nz, s, out, fp) {
  const th = pumpkinAngle(s, x, z), c = Math.cos(RIBS * th);
  const P = s.lp, v = (y - P.c[1]) / P.r[1];
  const g = fbm(th * 3 + 11, y * 9, 2, fp * 9);
  mixInto(out, PUMP.deep, PUMP.lobe, clamp01(0.62 + 0.35 * c + 0.25 * (g - 0.5)));
  const groove = smooth(0.82, 0.99, -c) * (1 - smooth(0.85, 0.97, Math.abs(v)));
  const k = 1 - 0.35 * groove; out[0] *= k; out[1] *= k; out[2] *= k;
  if (v > 0.45) { const k2 = 1 - 0.22 * smooth(0.45, 0.85, v); out[0] *= k2; out[1] *= k2; out[2] *= k2; }
  if (v > 0.72) mixInto(out, out.slice(), PUMP.crown, smooth(0.72, 0.97, v) * 0.8);
  const t = s.frame.tone; out[0] *= t; out[1] *= t; out[2] *= t;
}
function pumpkinBump(x, y, z, N, s) {
  const [lx, lz] = objLocal(s.frame, x, z), th = Math.atan2(lz, lx);
  const b = 0.42 * Math.sin(RIBS * th) * (1 - Math.abs(N[1]));
  const tx = -Math.sin(th), tz = Math.cos(th), F = s.frame;
  const wx = tx * F.c + tz * F.s, wz = -tx * F.s + tz * F.c;
  N[0] += b * wx; N[2] += b * wz;
  const l = Math.hypot(N[0], N[1], N[2]); N[0] /= l; N[1] /= l; N[2] /= l;
}

function snowTex(base) {
  const b = cA(base), lo = b.map((v) => v * 0.9);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const g = fbm(x * 6 + z * 3, y * 6 - z * 2, 3, fp * 6);
    mixInto(out, lo, b, clamp01(0.45 + 0.8 * (g - 0.5)));
  };
}
function iceTex(base) {
  const b = cA(base), dk = b.map((v) => v * 0.78), hi = b.map((v) => Math.min(1, v * 1.12));
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, w] = s.k === 1 ? boxLocal(s, x, z) : [x, z];
    const g = fbm(u * 2.2 + w * 1.7, y * 7, 3, fp * 7);
    mixInto(out, dk, hi, clamp01(0.5 + 1.1 * (g - 0.5)));
    if (Math.abs(ny) > 0.7) { const k = 1.06; out[0] = Math.min(1, out[0] * k); out[1] = Math.min(1, out[1] * k); out[2] = Math.min(1, out[2] * k); }
  };
}
function strawTex(base, bale = 0.42) {
  const b = cA(base), lo = b.map((v) => v * 0.8), hi = b.map((v) => Math.min(1, v * 1.1)), tw = cA('#6d5a3a');
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    let [u, w] = boxLocal(s, x, z);
    const top = Math.abs(ny) > 0.7;
    const endOn = s.hz > s.hx;
    if (endOn) { const t = u; u = w; w = t; }
    const len = endOn ? s.hz : s.hx;
    const along = u, across = top ? w * 3 + 1.3 : y * 3 + w;
    const g = fbm(along * 3, across * 26, 2, fp * 26), g2 = fbm(along * 40, across * 4, 2, fp * 40);
    mixInto(out, lo, hi, clamp01(0.5 + 0.9 * (g - 0.5) + 0.35 * (g2 - 0.5)));
    for (const f of [-0.27, 0.27]) {
      const m = lineMask(u - f * len * 2, 1e3, 0.008, fp);
      if (m > 0.01) mixInto(out, out.slice(), tw, m * 0.8);
    }
    if (!top && s.hy * 2 > bale * 1.4) {
      const n = Math.max(1, Math.round(s.hy * 2 / bale)), hb = s.hy * 2 / n;
      const m = lineMask(y, hb, 0.012, fp);
      if (m > 0.01 && y > 0.05 && y < s.hy * 2 - 0.05) { const k = 1 - 0.45 * m; out[0] *= k; out[1] *= k; out[2] *= k; }
    }
  };
}
function stoneTex(base) {
  const b = cA(base), mortar = b.map((v) => v * 0.55);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, w] = boxLocal(s, x, z);
    const top = Math.abs(ny) > 0.7;
    const along = Math.abs(nx * s.ca - nz * s.sa) > 0.7 ? w : u;
    const vy = top ? w * 1.7 + 5 : y;
    const rowH = 0.13, row = Math.floor(vy / rowH), off = hash2(row, 7) * 0.3;
    const len = 0.2 + 0.12 * hash2(row, 3);
    const col = Math.floor((along + off) / len);
    const tone = 0.78 + 0.34 * hash2(row * 31 + col, 11);
    const g = fbm(along * 12, vy * 12, 2, fp * 12);
    out[0] = b[0] * tone * (0.9 + 0.2 * g); out[1] = b[1] * tone * (0.9 + 0.2 * g); out[2] = b[2] * tone * (0.88 + 0.2 * g);
    const mr = Math.max(lineMask(vy, rowH, 0.009, fp), lineMask(along + off, len, 0.01, fp));
    if (mr > 0.01) mixInto(out, out.slice(), mortar, mr * 0.85);
  };
}
function barkTex(base) {
  const b = cA(base), dk = b.map((v) => v * 0.55), hi = b.map((v) => Math.min(1, v * 1.25));
  const wood = cA('#d2b184'), ring = cA('#a8835a');
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const rho = Math.hypot(x - s.cx, z - s.cz);
    if (ny > 0.7 && rho < s.r - 0.02) {
      const g = fbm(x * 9, z * 9, 2, fp * 9);
      mixInto(out, ring, wood, clamp01(0.55 + 0.45 * Math.cos(rho * 90 + 3 * g)));
      return;
    }
    const ang = Math.atan2(z - s.cz, x - s.cx), u = ang * s.r;
    const g = fbm(u * 14, y * 2.2, 3, fp * 14), r = fbm(u * 30 + 5, y * 0.8, 2, fp * 30);
    mixInto(out, dk, hi, clamp01(0.5 + 1.0 * (g - 0.5)));
    if (r > 0.62) { const k = 0.72; out[0] *= k; out[1] *= k; out[2] *= k; }
  };
}
export const PROP_LOOKS = {
  snow: ['#f3f6fa', '#eef3f8'],
  ice: ['#b8dcea', '#c6e5ef', '#a9d3e4'],
  iceslab: ['#b8dcea', '#c6e5ef', '#a9d3e4'],
  bale: ['#d9b660', '#cfae5a', '#e0c070'],
  balestack: ['#d9b660', '#cfae5a', '#e0c070'],
  stone: ['#a29d95', '#9a958e', '#aaa49a'],
  stump: ['#6b5240', '#5e4838', '#76604a'],
  trunk: ['#5b4636', '#4f3d31', '#665040'],
};
function propMat(oc) {
  const col = PROP_LOOKS[oc.style][oc.col % PROP_LOOKS[oc.style].length];
  if (oc.style === 'snow') return { c: cA(col), ks: 0.03, sh: 10, tex: snowTex(col) };
  if (oc.style === 'ice' || oc.style === 'iceslab') return { c: cA(col), ks: 0.35, sh: 44, env: 0.18, tex: iceTex(col) };
  if (oc.style === 'bale' || oc.style === 'balestack') return { c: cA(col), ks: 0.04, sh: 10, tex: strawTex(col) };
  if (oc.style === 'stone') return { c: cA(col), ks: 0.04, sh: 12, tex: stoneTex(col) };
  return { c: cA(col), ks: 0.03, sh: 8, tex: barkTex(col) };
}

export function envFor(rd) {
  const L = rd.look;
  if (rd.theme === 'penguin') {
    const snow0 = cA('#e9eff6'), snow1 = cA('#f7f9fc'), snowB = cA('#dbe6f1'), sea0 = cA('#34627e'), sea1 = cA('#4b7c98');
    const edge = cA('#cfe2ee'), sky0 = cA('#d8e7f2'), sky1 = cA('#94bddf');
    const shore = L.shore, ang = L.drift;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return {
      floorY: 0,
      floor(x, z, fp, out) {
        const d = -z;
        if (d > shore) {
          const g = fbm(x * 0.6, z * 3, 3, fp * 3);
          mixInto(out, sea0, sea1, clamp01(0.3 + 0.7 * g));
          const edgeK = 1 - smooth(shore, shore + 1.2, d);
          if (edgeK > 0) mixInto(out, out.slice(), edge, edgeK * 0.8);
          return;
        }
        const u = x * ca + z * sa, v = -x * sa + z * ca;
        const g = fbm(x * 0.8, z * 0.8, 3, fp * 0.8), rip = fbm(u * 0.9, v * 7, 2, fp * 7);
        mixInto(out, snow0, snow1, clamp01(0.35 + 0.7 * (g - 0.5) + 0.35 * (rip - 0.5)));
        const b = fbm(x * 0.25 + 3, z * 0.25, 2, fp * 0.25);
        if (b < 0.42) mixInto(out, out.slice(), snowB, (0.42 - b) * 1.4);
      },
      sky(dx, dy, dz, out) { mixInto(out, sky0, sky1, clamp01(dy * 3.2 + 0.05)); },
      fog: { d0: 16, d1: 110, col: sky0, max: 0.55 },
    };
  }
  const strawA = cA('#b99452'), strawB = cA('#d2b06a'), soil = cA('#8a6a44'), stalk = cA('#e0c47e');
  const leaf = [cA('#34502d'), cA('#4c6a34'), cA('#8a6a2a'), cA('#a0582a')], sky0 = cA('#e1eaf0'), sky1 = cA('#a9c7e1');
  const backZ = -L.back;
  return {
    floorY: 0, backZ,
    backTop: (x) => 4.2 + 3.2 * fbm(x * 0.22 + 3.3, 1.7, 3) + 0.8 * fbm(x * 1.3, 5.1, 2),
    floor(x, z, fp, out) {
      const g = fbm(x * 0.7, z * 0.7, 2, fp * 0.7), fine = fbm(x * 11 + z * 3, z * 11 - x * 2, 2, fp * 11);
      mixInto(out, strawA, strawB, clamp01(0.5 + 0.35 * (g - 0.5) + 0.6 * (fine - 0.5)));
      const st = fbm(x * 34 + z * 9, z * 34 - x * 11, 2, fp * 34);
      if (st > 0.6) mixInto(out, out.slice(), stalk, clamp01((st - 0.6) * 2.2) * clamp01(1.4 - fp * 30));
      if (st < 0.34) mixInto(out, out.slice(), soil, clamp01((0.34 - st) * 1.8) * clamp01(1.4 - fp * 30));
    },
    back(x, y, fp, out) {
      const g = fbm(x * 0.9, y * 0.9, 3, fp * 0.9), c = fbm(x * 0.18 + 9, y * 0.2, 2, fp * 0.2);
      const i = Math.min(3, Math.floor(c * 4.2));
      mixInto(out, leaf[i], leaf[Math.min(3, i + 1)], clamp01(g));
      const k = 0.55 + 0.5 * g; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    sky(dx, dy, dz, out) { mixInto(out, sky0, sky1, clamp01(dy * 3 + 0.1)); },
    fog: { d0: 9, d1: 80, col: cA('#d3dce0'), max: 0.5 },
  };
}
export function lightFor(rd) {
  const dir = sunDir(rd.sun);
  if (rd.theme === 'penguin') {
    return { dir, col: [1.22, 1.2, 1.14], soft: 0.03, sky: [0.46, 0.53, 0.64], ground: [0.44, 0.46, 0.5],
      fill: { dir: [-dir[0] * 0.5, 0.35, 0.8], col: [0.1, 0.11, 0.13] }, aoK: 1, contact: 0.3, contactH: 0.1 };
  }
  return { dir, col: [1.0, 0.9, 0.75], soft: 0.035, sky: [0.44, 0.48, 0.55], ground: [0.4, 0.34, 0.24],
    fill: { dir: [-dir[0] * 0.5, 0.35, 0.8], col: [0.1, 0.1, 0.1] }, aoK: 1, contact: 0.14, contactH: 0.08 };
}

export const PROP_ID = 100;
function objMats(theme) {
  if (theme === 'penguin') {
    return {
      pbody: { c: PEN.black, ks: 0.2, sh: 26, tex: penguinBody },
      phead: { c: PEN.black, ks: 0.22, sh: 26, tex: penguinHead },
      pbeak: { c: PEN.black, ks: 0.3, sh: 30, tex: penguinBeak },
      pflip: { c: PEN.black, ks: 0.18, sh: 22 },
      pfeet: { c: PEN.feet, ks: 0.1, sh: 10 },
    };
  }
  return { pump: { c: PUMP.lobe, ks: 0.16, sh: 24, tex: pumpkinTex, bump: pumpkinBump }, stem: { c: PUMP.stem, ks: 0.05, sh: 8 } };
}
export function buildScene(rd, look = null) {
  if (look) return buildSceneStyled(rd, look);
  const mats = [], shapes = [], idx = new Map();
  const matOf = (key, def) => { if (!idx.has(key)) { idx.set(key, mats.length); mats.push(def); } return idx.get(key); };
  const OM = objMats(rd.theme);
  rd.objs.forEach((o, i) => {
    const a = o.yaw * D2R, frame = { x: o.x, z: o.z, c: Math.cos(a), s: Math.sin(a), tone: o.tone ?? 1 };
    for (const s of objShapes(rd.theme, o, i, (k) => matOf(`o:${k}`, OM[k]))) { s.frame = frame; shapes.push(s); }
  });
  rd.occs.forEach((oc, j) => { shapes.push(occShape(oc, PROP_ID + j, matOf(`p:${j}`, propMat(oc)))); });
  return makeScene({ cam: cameraFor(rd.cam), shapes, mats, env: envFor(rd), light: lightFor(rd) });
}

const PEN_SKINS = {
  king: { ear: '#f39a26', gold: '#f4c04e', beak: '#e8763a', head: 'ear' },
  emperor: { ear: '#f2d36a', gold: '#f6e3a0', beak: '#d9864a', head: 'ear' },
  gentoo: { ear: '#f3f1ea', gold: '#f3f1ea', beak: '#ef6a2a', head: 'band' },
  adelie: { ear: '#1b1f25', gold: '#f3f1ea', beak: '#26282c', head: 'ring' },
  chinstrap: { ear: '#f3f1ea', gold: '#f3f1ea', beak: '#26282c', head: 'face' },
};
const PUMP_KINDS = {
  orange: ['#e87a1f', '#c25a12'], white: ['#e6e1d2', '#c9c2ae'], bluegrey: ['#8fa3a6', '#6c8285'], redorange: ['#d4572a', '#a8401c'],
  yellow: ['#e2b22c', '#bf8f18'], darkgreen: ['#3f5a36', '#2c4228'],
};
const PEN_ENVS = ['shore', 'iceshelf', 'rocky', 'dusk', 'floe'];
const PUMP_ENVS = ['straw', 'meadow', 'soil', 'leaves', 'yard'];
const BACKDROPS = ['trees', 'hedge', 'barn', 'stonewall', 'orchard'];
const SNOW_WALLS = [['snow', '#f3f6fa'], ['packed', '#dfe5ec'], ['rock', '#7d7a76'], ['firn', '#e8edf2']];
const ICE_TINTS = [['blue', ['#b8dcea', '#c6e5ef']], ['white', ['#dbe9ef', '#e9f1f4']], ['teal', ['#9fd0d6', '#b4dde0']], ['azure', ['#a9c6e6', '#bed6ee']]];
const SLABS = [['ice', 0], ['rock', 1], ['clear-ice', 2]];
const BALES = [['straw', '#d9b660'], ['silage', '#e9ebe6'], ['darkhay', '#a88a4a'], ['greenwrap', '#4a6a3e'], ['blackwrap', '#2e3032']];
const STONES = [['grey', '#a29d95'], ['sand', '#c2ae8a'], ['dark', '#6d6a66'], ['slate', '#7f8890']];
const BARKS = [['brown', '#6b5240'], ['grey', '#7a756c'], ['birch', '#e3dfd6'], ['dark', '#4a3a2e']];

export async function styleLook(style, rd, variant = 0) {
  const sp = (pool, ids) => { const f = splitIds(`mostly_hidden_tap|${pool}`, ids, 1); return ids.filter((id) => f(id) === style.split); };
  const pen = rd.theme === 'penguin';
  const envs = sp(pen ? 'penguin_env' : 'pumpkin_env', pen ? PEN_ENVS : PUMP_ENVS);
  const skins = sp(pen ? 'penguin_skin' : 'pumpkin_kind', Object.keys(pen ? PEN_SKINS : PUMP_KINDS));
  const [ei, ki] = style.primaryCombo(`mht-${rd.theme}-env-skin`, [envs.length, skins.length]);
  const ek = envs[(ei + variant) % envs.length], kk = skins[(ki + 2 * variant) % skins.length];
  const rnd = style.rand;
  const J = Array.from({ length: 12 }, () => rnd());
  const hdris = style.pool('hdri', (h) => (pen ? (ek === 'dusk' ? ['sunset', 'morning-afternoon'] : ['outdoor-midday', 'overcast', 'morning-afternoon']) : ['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast']).includes(h.use));
  const hd = hdris[(Math.floor(J[0] * hdris.length) + variant) % hdris.length];
  style.note(`env:${ek}`); style.note(`skin:${kk}`); style.note(`hdri:${hd.id}`);
  const texOf = (f) => { const l = style.pool('tex', f); return l.length ? l[Math.floor(J[1] * l.length)] : style.pick('tex', (t) => t.use === 'terrain'); };
  const groundT = pen ? (ek === 'rocky' ? texOf((t) => t.use === 'terrain' && /rock|gravel|pebble/.test(t.id)) : texOf((t) => t.use === 'terrain' && /snow/.test(t.id)))
    : texOf({ straw: (t) => t.use === 'terrain' && /sand|gravel|dry|trail/.test(t.id), meadow: (t) => t.use === 'terrain' && /grass|forest_ground|mossy/.test(t.id), soil: (t) => t.use === 'terrain' && /mud|soil|ground/.test(t.id), leaves: (t) => t.use === 'terrain' && /leaves|forest/.test(t.id), yard: (t) => (t.use === 'terrain' || t.use === 'floor') && /gravel|pebble|concrete/.test(t.id) }[ek]);
  const stoneT = style.pick('tex', (t) => t.use === 'stone'), woodT = style.pick('tex', (t) => t.use === 'wood');
  const barkT = pen ? null : style.pick('tex', (t) => t.use === 'bark');
  const [TG, TS, TWd, sky, TB] = await Promise.all([S3.loadTexture(groundT.file), S3.loadTexture(stoneT.file), S3.loadTexture(woodT.file), S3.loadSky(hd.sky), barkT ? S3.loadTexture(barkT.file) : null]);
  const L0 = lightFor(rd);
  const Lh = S3.hdriLight(hd, L0, { albedo: [0.5, 0.5, 0.5], total: pen ? 1.75 : 1.6, jitter: J[2] });
  const light = { ...L0, col: Lh.col, sky: Lh.sky, ground: L0.ground.map((v, c) => v * Lh.col[c] / Math.max(1e-6, L0.col[c]) * 0.9), soft: Math.min(0.05, L0.soft + 0.012 * J[3]) };
  const P = (pool, items, r) => K.splitPick(style, 'mostly_hidden_tap', pool, items, r);
  let look;
  if (pen) {
    const skin = PEN_SKINS[kk];
    const ground = ek === 'rocky' ? [S3.scaleTo([0.86, 0.88, 0.92], 0.72), S3.scaleTo(S3.limitSat(TG.mean, 0.1), 0.12 + 0.06 * J[4])]
      : ek === 'iceshelf' ? [S3.scaleTo(S3.hueSatColor(205, 0.1), 0.7), S3.scaleTo(S3.hueSatColor(200, 0.16), 0.5)]
        : ek === 'dusk' ? [S3.scaleTo(S3.hueSatColor(30, 0.06), 0.66), S3.scaleTo(S3.hueSatColor(220, 0.08), 0.52)]
          : ek === 'floe' ? [S3.scaleTo([0.9, 0.92, 0.95], 0.8), S3.scaleTo([0.8, 0.86, 0.92], 0.6)] : [lin('#f7f9fc'), lin('#dbe6f1')];
    const sea = ek === 'floe' ? [lin('#1f3446'), lin('#2a465c')] : ek === 'rocky' ? [lin('#3d4f58'), lin('#4f646e')] : ek === 'dusk' ? [lin('#2e3f5a'), lin('#43577a')] : [lin('#34627e'), lin('#4b7c98')];
    look = { pen, ek, kk, skin: { ear: lin(skin.ear), gold: lin(skin.gold), beak: lin(skin.beak), head: skin.head }, ground, sea, TG, TS,
      snowWall: P('snow_wall', SNOW_WALLS, J[5]), iceTint: P('ice_tint', ICE_TINTS, J[6])[1],
      slabRock: P('ice_slab', SLABS, J[7])[0] === 'rock', floeK: ek === 'floe' };
  } else {
    const pk = PUMP_KINDS[kk].map(lin);
    let gface = S3.scaleTo(S3.limitSat(TG.mean, 0.42), ek === 'straw' ? 0.3 + 0.12 * J[4] : ek === 'soil' ? 0.06 + 0.05 * J[4] : 0.1 + 0.12 * J[4]);
    if (ek === 'meadow') gface = S3.scaleTo(S3.hueSatColor(80 + 25 * J[4], 0.5), 0.1 + 0.06 * J[5]);
    if (ek === 'straw') gface = S3.scaleTo(S3.hueSatColor(42 + 8 * J[4], 0.45), 0.3 + 0.1 * J[5]);
    for (let it = 0; it < 10 && S3.deltaE(gface, pk[0]) < 30; it++) gface = gface.map((v) => v * (S3.lum(pk[0]) > S3.lum(gface) ? 0.78 : 1.28));
    const bd = P('backdrop', BACKDROPS, J[6]);
    look = { pen, ek, kk, pump: pk, gface, TG, TS, TWd, TB, back: bd,
      bale: P('bale', BALES, J[7]), stone: P('stone_wall', STONES, J[8]), bark: P('bark', BARKS, J[9]) };
    if (S3.deltaE(lin(look.bale[1]), gface) < 18) { look.bale = ['shaded-straw', '#8a6e38']; style.note('bale:shaded-straw(contrast)'); }
  }
  const hz = S3.scaleTo(S3.limitSat(hd.horizon, 0.18), pen ? 0.74 : 0.7), zn = S3.scaleTo(S3.limitSat(hd.zenith, 0.35), pen ? 0.4 : 0.42);
  const skyG = (dx, dy, dz, out) => mixInto(out, hz, zn, clamp01(dy * 3 + 0.05));
  return { ...look, light, sky: skyG, fogCol: S3.scaleTo(S3.limitSat(hd.horizon, 0.15), pen ? 0.62 : 0.5),
    ids: { theme: rd.theme, env: ek, skin: kk, hdri: hd.id, ground: groundT.id, variant } };
}

function surfS(T, face, x, z, fp, tw, cv, keep, out) {
  const S = SURF_TMP, tpm = T.n / tw;
  S3.sampleTex(T, x * tpm, z * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
  const kc = Math.min(1.2, cv / Math.max(1e-6, T.cv)), t = Math.max(0.6, Math.min(1.45, 1 + kc * (S3.lum(S) / Math.max(1e-6, S3.lum(T.mean)) - 1)));
  const Lf = S3.lum(face), Ln = Math.max(1e-6, S3.lum(S));
  for (let c = 0; c < 3; c++) out[c] = face[c] * t * (1 - keep) + S[c] / Ln * Lf * t * keep;
}
const SURF_TMP = new Float64Array(3);
function envStyled(rd, look) {
  const L = rd.look;
  if (look.pen) {
    const [g0, g1] = look.ground, [s0, s1] = look.sea, shore = L.shore, ang = L.drift, ca = Math.cos(ang), sa = Math.sin(ang);
    const edge = S3.scaleTo(g1, Math.min(0.9, S3.lum(g1) * 1.1)), rocky = look.ek === 'rocky', floe = look.floeK;
    return {
      floorY: 0,
      floor(x, z, fp, out) {
        const d = -z;
        if (d > shore) {
          const g = fbm(x * 0.6, z * 3, 3, fp * 3);
          mixInto(out, s0, s1, clamp01(0.3 + 0.7 * g));
          if (floe && fbm(x * 0.15 + 4, z * 0.3, 3, fp * 0.3) > 0.62) mixInto(out, out.slice(), g0, 0.9);
          const edgeK = 1 - smooth(shore, shore + 1.2, d);
          if (edgeK > 0) mixInto(out, out.slice(), edge, edgeK * 0.8);
          return;
        }
        const u = x * ca + z * sa, v = -x * sa + z * ca;
        const g = fbm(x * 0.8, z * 0.8, 3, fp * 0.8), rip = fbm(u * 0.9, v * 7, 2, fp * 7);
        mixInto(out, g1, g0, clamp01(0.55 + 0.7 * (g - 0.5) + 0.35 * (rip - 0.5)));
        if (rocky) {
          const b = fbm(x * 0.35 + 7, z * 0.35 - 2, 3, fp * 0.35);
          if (b < 0.4) { surfS(look.TG, look.ground[1], x, z, fp, 2.0, 0.3, 0.3, SURF_TMP2); mixInto(out, out.slice(), SURF_TMP2, clamp01((0.4 - b) * 6)); }
        }
      },
      sky: look.sky,
      fog: { d0: 16, d1: 110, col: look.fogCol, max: 0.55 },
    };
  }
  const backZ = -L.back, G0 = look.gface, ek = look.ek, bd = look.back;
  const backCols = { trees: ['#34502d', '#4c6a34', '#8a6a2a', '#a0582a'], hedge: ['#2f4a2a', '#3c5a30', '#456636', '#36522c'], barn: ['#6e4a36', '#7a5440', '#5e3e2e', '#6a4a3a'],
    stonewall: ['#8a857c', '#7a756e', '#968f84', '#6e6a64'], orchard: ['#4a6a34', '#5e7e3c', '#3e5a2e', '#6a8a42'] }[bd].map(lin);
  return {
    floorY: 0, backZ,
    backTop: bd === 'hedge' || bd === 'stonewall' ? (x) => 2.6 + 0.4 * fbm(x * 0.4, 3.1, 2) : bd === 'barn' ? () => 5.2 : (x) => 4.2 + 3.2 * fbm(x * 0.22 + 3.3, 1.7, 3) + 0.8 * fbm(x * 1.3, 5.1, 2),
    floor(x, z, fp, out) {
      surfS(look.TG, G0, x, z, fp, ek === 'yard' ? 1.2 : 1.6, ek === 'straw' || ek === 'meadow' ? 0.22 : 0.3, ek === 'meadow' || ek === 'straw' ? 0.2 : 0.55, out);
      if (ek === 'soil') { const f = lineMask(x * 0.97 + z * 0.24, 0.7, 0.12, fp); out[0] *= 1 - 0.25 * f; out[1] *= 1 - 0.25 * f; out[2] *= 1 - 0.25 * f; }
    },
    back(x, y, fp, out) {
      if (bd === 'barn') {
        const plank = lineMask(x, 0.22, 0.012, fp), g = fbm(x * 0.6, y * 3, 2, fp);
        mixInto(out, backCols[0], backCols[1], g); const k = 1 - 0.4 * plank; out[0] *= k; out[1] *= k; out[2] *= k; return;
      }
      if (bd === 'stonewall') { surfS(look.TS, backCols[0], x, y, fp, 2.0, 0.3, 0.4, out); return; }
      const g = fbm(x * 0.9, y * 0.9, 3, fp * 0.9), c = fbm(x * 0.18 + 9, y * 0.2, 2, fp * 0.2);
      const i = Math.min(3, Math.floor(c * 4.2));
      mixInto(out, backCols[i], backCols[Math.min(3, i + 1)], clamp01(g));
      const k = 0.55 + 0.5 * g; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    sky: look.sky,
    fog: { d0: 9, d1: 80, col: look.fogCol, max: 0.5 },
  };
}
const SURF_TMP2 = new Float64Array(3);
function objMatsStyled(rd, look) {
  if (look.pen) {
    const SK = look.skin, BLK = PEN.black, WH = PEN.white;
    const body = (x, y, z, nx, ny, nz, s, out) => {
      const [lx, lz] = objLocal(s.frame, x, z), P = s.lp;
      const u = lx / P.r[0], v = (y - P.c[1]) / P.r[1], w = lz / P.r[2];
      const edge = 0.08 + 1.6 * Math.max(0, v - 0.55), b = smooth(edge - 0.06, edge + 0.06, w);
      mixInto(out, BLK, PEN.flank, clamp01(0.5 + 0.5 * Math.abs(u)) * 0.6);
      if (b > 0) { const g = smooth(0.25, 0.62, v) * (1 - smooth(0.78, 0.9, v)), bel = [0, 0, 0]; mixInto(bel, WH, SK.gold, g * 0.9); mixInto(out, out.slice(), bel, b); }
    };
    const head = (x, y, z, nx, ny, nz, s, out) => {
      const [lx, lz] = objLocal(s.frame, x, z), P = s.lp;
      const u = lx / P.r[0], v = (y - P.c[1]) / P.r[1], w = (lz - P.c[2]) / P.r[2];
      out[0] = BLK[0]; out[1] = BLK[1]; out[2] = BLK[2];
      if (SK.head === 'ear') {
        const d = Math.hypot((Math.abs(u) - 0.78) / 0.32, (v + 0.2) / 0.42, (w + 0.05) / 0.5);
        if (d < 1) mixInto(out, BLK, SK.ear, smooth(1, 0.75, d));
        if (w > 0.45 && v < -0.35) mixInto(out, out.slice(), SK.gold, smooth(0.45, 0.75, w) * smooth(-0.35, -0.7, v));
      } else if (SK.head === 'band') {
        const d = Math.hypot((v - 0.45) / 0.22, (w - 0.1) / 0.55);
        if (d < 1 && Math.abs(u) < 0.95) mixInto(out, BLK, SK.ear, smooth(1, 0.7, d));
      } else if (SK.head === 'ring') {
        const d = Math.hypot((Math.abs(u) - 0.62) / 0.16, (v - 0.12) / 0.16);
        if (d < 1 && w > 0.1) mixInto(out, BLK, WH, smooth(1, 0.55, d) * (1 - smooth(0.35, 0.2, d)));
      } else {
        const face = smooth(-0.1, 0.25, w) * (1 - smooth(0.35, 0.6, v));
        mixInto(out, BLK, WH, face);
        const strap = Math.abs(v + 0.45 + 0.2 * Math.abs(u)) < 0.06 && w > 0.1 ? 1 : 0;
        if (strap) mixInto(out, out.slice(), BLK, 0.9);
      }
    };
    const beak = (x, y, z, nx, ny, nz, s, out) => { const P = s.lp, dy = y - P.c[1], c = dy < -0.004 ? SK.beak : BLK; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; };
    return { pbody: { c: BLK, ks: 0.2, sh: 26, tex: body }, phead: { c: BLK, ks: 0.22, sh: 26, tex: head }, pbeak: { c: BLK, ks: 0.3, sh: 30, tex: beak },
      pflip: { c: BLK, ks: 0.18, sh: 22 }, pfeet: { c: look.kk === 'gentoo' ? lin('#e8763a') : PEN.feet, ks: 0.1, sh: 10 } };
  }
  const [LOBE, DEEP] = look.pump, crown = lin('#8c7a2c');
  const tex = (x, y, z, nx, ny, nz, s, out, fp) => {
    const th = pumpkinAngle(s, x, z), c = Math.cos(RIBS * th), P = s.lp, v = (y - P.c[1]) / P.r[1];
    const g = fbm(th * 3 + 11, y * 9, 2, fp * 9);
    mixInto(out, DEEP, LOBE, clamp01(0.62 + 0.35 * c + 0.25 * (g - 0.5)));
    const groove = smooth(0.82, 0.99, -c) * (1 - smooth(0.85, 0.97, Math.abs(v)));
    const k = 1 - 0.35 * groove; out[0] *= k; out[1] *= k; out[2] *= k;
    if (v > 0.45) { const k2 = 1 - 0.22 * smooth(0.45, 0.85, v); out[0] *= k2; out[1] *= k2; out[2] *= k2; }
    if (v > 0.72) mixInto(out, out.slice(), crown, smooth(0.72, 0.97, v) * 0.6);
    const t = s.frame.tone; out[0] *= t; out[1] *= t; out[2] *= t;
  };
  return { pump: { c: LOBE, ks: 0.16, sh: 24, tex, bump: pumpkinBump }, stem: { c: PUMP.stem, ks: 0.05, sh: 8 } };
}
function propMatStyled(oc, look) {
  const pick = (arr) => arr[oc.col % arr.length];
  if (look.pen) {
    if (oc.style === 'snow') {
      const [kind, hex] = look.snowWall, b = lin(hex);
      if (kind === 'rock') return { c: b, ks: 0.04, sh: 10, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
        surfS(look.TS, b, x + z * 0.7, y + z * 0.3, fp || 0.01, 1.2, 0.3, 0.3, out);
        if (ny > 0.6) mixInto(out, out.slice(), lin('#eef2f7'), 0.9);
      } };
      const v = b.map((q) => q * (0.97 + 0.06 * (oc.col % 3) / 2));
      return { c: v, ks: 0.03, sh: 10, tex: snowTex('#' + v.map((q) => Math.round(255 * Math.pow(Math.min(1, q), 1 / 2.2)).toString(16).padStart(2, '0')).join('')) };
    }
    if (oc.style === 'iceslab' && look.slabRock) return { c: lin('#8a8784'), ks: 0.05, sh: 12, tex: (x, y, z, nx, ny, nz, s, out, fp) => surfS(look.TS, lin('#8a8784'), x + z, y, fp || 0.01, 1.4, 0.3, 0.3, out) };
    const hex = pick(look.iceTint);
    return { c: lin(hex), ks: 0.35, sh: 44, env: 0.18, tex: iceTex(hex) };
  }
  if (oc.style === 'bale' || oc.style === 'balestack') {
    const [kind, hex] = look.bale;
    if (kind === 'silage' || kind === 'greenwrap' || kind === 'blackwrap') return { c: lin(hex), ks: 0.3, sh: 40, env: 0.08, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
      const [u] = boxLocal(s, x, z), g = fbm(u * 6, y * 6, 2, fp * 6), b = lin(hex), k = 0.92 + 0.1 * g;
      const seam = s.hy * 2 > 0.42 * 1.4 ? lineMask(y, s.hy * 2 / Math.max(1, Math.round(s.hy * 2 / 0.42)), 0.012, fp) : 0;
      out[0] = b[0] * k * (1 - 0.4 * seam); out[1] = b[1] * k * (1 - 0.4 * seam); out[2] = b[2] * k * (1 - 0.4 * seam);
    } };
    return { c: lin(hex), ks: 0.04, sh: 10, tex: strawTex(hex) };
  }
  if (oc.style === 'stone') return { c: lin(look.stone[1]), ks: 0.04, sh: 12, tex: stoneTex(look.stone[1]) };
  const [bk, bhex] = look.bark;
  if (bk === 'birch') {
    const base = barkTex(bhex), dk = lin('#2a2622');
    return { c: lin(bhex), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
      base(x, y, z, nx, ny, nz, s, out, fp);
      if (ny <= 0.7) { const ang = Math.atan2(z - s.cz, x - s.cx), m = fbm(ang * 9, y * 40, 2, fp * 40); if (m > 0.68) mixInto(out, out.slice(), dk, 0.8); }
    } };
  }
  if (!look.TB) return { c: lin(bhex), ks: 0.03, sh: 8, tex: barkTex(bhex) };
  const cut = barkTex(bhex), B = lin(bhex);
  return { c: B, ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
    if (ny > 0.7) { cut(x, y, z, nx, ny, nz, s, out, fp); return; }
    const ang = Math.atan2(z - s.cz, x - s.cx);
    surfS(look.TB, B, ang * s.r, y, fp || 0.01, 0.8, 0.35, 0.55, out);
  } };
}
function buildSceneStyled(rd, look) {
  const mats = [], shapes = [], idx = new Map();
  const matOf = (key, def) => { if (!idx.has(key)) { idx.set(key, mats.length); mats.push(def); } return idx.get(key); };
  const OM = objMatsStyled(rd, look);
  rd.objs.forEach((o, i) => {
    const a = o.yaw * D2R, frame = { x: o.x, z: o.z, c: Math.cos(a), s: Math.sin(a), tone: o.tone ?? 1 };
    for (const s of objShapes(rd.theme, o, i, (k) => matOf(`o:${k}`, OM[k]))) { s.frame = frame; shapes.push(s); }
  });
  rd.occs.forEach((oc, j) => { shapes.push(occShape(oc, PROP_ID + j, matOf(`p:${j}`, propMatStyled(oc, look)))); });
  return makeScene({ cam: cameraFor(rd.cam), shapes, mats, env: envStyled(rd, look), light: look.light });
}
export { smooth, clamp01 };
