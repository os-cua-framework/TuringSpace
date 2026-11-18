import { lin, fbm, hash2, lineMask, makeCam, extrudeParts, orientedCylinder } from './_flat_or_solid_tap_rt.js';

export const WALL_Z = -2.3;
export const IMG = { w: 380, h: 282 };
const FOV_REF_H = 268;
const DEG = Math.PI / 180;

const AREA0 = Math.PI / 4;
function regular(n, phase) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (phase + i * 360 / n) * DEG; pts.push([Math.cos(a), Math.sin(a)]); }
  return pts;
}
const areaOf = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
function normalise(parts, total) {
  const k = Math.sqrt(AREA0 / total);
  return parts.map((p) => p.map(([u, v]) => [u * k, v * k]));
}
function starParts() {
  const ro = 1, ri = 0.47, outer = [], inner = [];
  for (let i = 0; i < 5; i++) {
    const a = (90 + i * 72) * DEG, b = (90 + 36 + i * 72) * DEG;
    outer.push([ro * Math.cos(a), ro * Math.sin(a)]); inner.push([ri * Math.cos(b), ri * Math.sin(b)]);
  }
  const parts = [inner.slice()];
  for (let i = 0; i < 5; i++) parts.push([inner[(i + 4) % 5], outer[i], inner[i]].map((p) => p.slice()));
  for (const p of parts) if (signedArea(p) < 0) p.reverse();
  const total = areaOf(inner) + parts.slice(1).reduce((s, p) => s + areaOf(p), 0);
  return normalise(parts, total);
}
function signedArea(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function crossParts() {
  const w = 0.36;
  const h = [[-1, -w], [1, -w], [1, w], [-1, w]], v = [[-w, -1], [w, -1], [w, 1], [-w, 1]];
  const total = 2 * 2 * (2 * w) - (2 * w) * (2 * w);
  return normalise([h, v], total);
}
const OUT = {
  disc: { disc: true, r: 0.5 },
  hexagon: { parts: normalise([regular(6, 0)], areaOf(regular(6, 0))) },
  square: { parts: normalise([regular(4, 45)], areaOf(regular(4, 45))) },
  triangle: { parts: normalise([regular(3, 90)], areaOf(regular(3, 90))) },
  pentagon: { parts: normalise([regular(5, 90)], areaOf(regular(5, 90))) },
  star: { parts: starParts() },
  cross: { parts: crossParts() },
};
export const SHAPES = ['disc', 'hexagon', 'square', 'triangle', 'star', 'cross', 'pentagon'];
export function outline(shape) { return OUT[shape]; }
export function outlinePoints(shape) {
  const o = OUT[shape];
  if (o.disc) { const pts = []; for (let i = 0; i < 48; i++) { const a = i * 7.5 * DEG; pts.push([o.r * Math.cos(a), o.r * Math.sin(a)]); } return pts; }
  return o.parts.flat();
}

export function frameOf(p) {
  const s = p.s, t = p.t;
  if (p.pose === 'lie') {
    const a = p.yaw * DEG;
    const ex = [Math.cos(a), 0, -Math.sin(a)], ey = [Math.sin(a), 0, Math.cos(a)], ez = [0, 1, 0];
    return { o: [p.x, t / 2, p.z], ex, ey, ez };
  }
  const b = (p.pose === 'stand' ? 0 : p.beta) * DEG, f = p.yaw * DEG;
  const ez = [Math.sin(f) * Math.cos(b), Math.sin(b), Math.cos(f) * Math.cos(b)];
  const ey = [-Math.sin(f) * Math.sin(b), Math.cos(b), -Math.cos(f) * Math.sin(b)];
  const ex = [Math.cos(f), 0, -Math.sin(f)];
  const pts = outlinePoints(p.shape);
  let ymin = Infinity, zmin = Infinity;
  for (const [u0, v0] of pts) for (const w of [-t / 2, t / 2]) {
    const u = u0 * s, v = v0 * s;
    const y = ex[1] * u + ey[1] * v + ez[1] * w, z = ex[2] * u + ey[2] * v + ez[2] * w;
    ymin = Math.min(ymin, y); zmin = Math.min(zmin, z);
  }
  return { o: [p.x, -ymin, WALL_Z - zmin + (p.gap || 0)], ex, ey, ez };
}
export function worldPoints(p, fr = frameOf(p)) {
  const out = [];
  for (const [u0, v0] of outlinePoints(p.shape)) for (const w of [-p.t / 2, p.t / 2]) {
    const u = u0 * p.s, v = v0 * p.s;
    out.push([fr.o[0] + fr.ex[0] * u + fr.ey[0] * v + fr.ez[0] * w, fr.o[1] + fr.ex[1] * u + fr.ey[1] * v + fr.ez[1] * w, fr.o[2] + fr.ex[2] * u + fr.ey[2] * v + fr.ez[2] * w]);
  }
  return out;
}
function insideConvex(poly, x, y) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}
const BOUNDARY = {};
function boundaryOf(shape) {
  if (BOUNDARY[shape]) return BOUNDARY[shape];
  const o = OUT[shape], segs = [];
  if (!o.disc) {
    const inAny = (x, y) => o.parts.some((P) => insideConvex(P, x, y));
    const N = 40, eps = 1e-3;
    for (const P of o.parts) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const nx = -dy / L * eps, ny = dx / L * eps;
      const onB = [];
      for (let k = 0; k <= N; k++) { const x = a[0] + dx * k / N, y = a[1] + dy * k / N; onB.push(!(inAny(x + nx, y + ny) && inAny(x - nx, y - ny))); }
      for (let k = 0; k < N; k++) if (onB[k] && onB[k + 1]) segs.push([a[0] + dx * k / N, a[1] + dy * k / N, a[0] + dx * (k + 1) / N, a[1] + dy * (k + 1) / N]);
    }
  }
  return (BOUNDARY[shape] = segs);
}
export const MARKS = [null, lin('#f2eee3'), lin('#34302c')];
export const RIM_INK = lin('#2a292d');
export const RIM_INSET = 0.045;
const RIM_SCALE = { disc: 1, hexagon: 1, square: 1, pentagon: 1, triangle: 0.87, cross: 0.6, star: 0.5 };
export function shapesOf(p, id) {
  const fr = frameOf(p), o = OUT[p.shape], k = RIM_SCALE[p.shape] * p.s;
  const rim = p.rim ? { w: p.rim * k, inset: RIM_INSET * k, ink: RIM_INK, disc: o.disc ? o.r * p.s : 0, segs: o.disc ? null : boundaryOf(p.shape).map((q) => q.map((v) => v * p.s)) } : null;
  const mark = p.mark || rim ? { r: p.mark ? p.mr * p.s : 0, c: p.mark ? MARKS[p.mark] : null, rim } : null;
  if (o.disc) return [orientedCylinder(id, p.col, fr, o.r * p.s, p.t, mark)];
  return extrudeParts(id, p.col, o.parts.map((poly) => poly.map(([u, v]) => [u * p.s, v * p.s])), fr, p.t, mark);
}

export function cameraFor(rd) {
  const a = rd.cam.az * DEG, e = rd.cam.el * DEG, D = rd.cam.dist;
  const tgt = [0, 0.25, rd.cam.tz];
  const eye = [tgt[0] + Math.sin(a) * Math.cos(e) * D, tgt[1] + Math.sin(e) * D, tgt[2] + Math.cos(a) * Math.cos(e) * D];
  return makeCam({ eye, target: tgt, fovY: 2 * Math.atan(Math.tan(rd.cam.fov * Math.PI / 360) * IMG.h / FOV_REF_H) * 180 / Math.PI, W: IMG.w, H: IMG.h });
}

export const PAINTS = [
  ['red', '#d23f2e'], ['orange', '#ec8421'], ['yellow', '#eec12a'], ['green', '#3c9a4c'],
  ['teal', '#1d9c98'], ['blue', '#2e62d0'], ['purple', '#8850c4'], ['pink', '#e46a9c'],
];
export const MATS = PAINTS.map(([, hex]) => ({ c: lin(hex), ks: 0.13, sh: 22, env: 0.05 }));
const WALLS = [[0.80, 0.84, 0.82], [0.83, 0.82, 0.78], [0.78, 0.82, 0.86]];
export function envFor(rd) {
  const wt = WALLS[rd.wall % WALLS.length].map((v) => Math.pow(v, 2.2));
  return {
    floorY: 0, wallZ: WALL_Z,
    floor(x, z, fp, out) {
      const plank = Math.floor(z / 0.72);
      const tint = hash2(plank, 17) - 0.5;
      const g = fbm(x * 0.55 + plank * 3.7, z * 9 + plank * 1.3, 4, fp * 9);
      const fine = fbm(x * 3.1 + 5.3, z * 26, 3, fp * 26);
      const seam = lineMask(z, 0.72, 0.012, fp);
      const corner = 1 - 0.2 * Math.exp(-(z - WALL_Z) / 0.2);
      const v = (0.9 + 0.2 * (g - 0.5) + 0.1 * (fine - 0.5) + 0.12 * tint) * (1 - 0.35 * seam) * corner;
      out[0] = 0.47 * v; out[1] = 0.315 * v; out[2] = 0.17 * v;
    },
    wall(x, y, fp, out) {
      const n = fbm(x * 2.2 + 11.3, y * 2.2 - 4.1, 4, fp * 2.2);
      const v = (0.95 + 0.07 * (n - 0.5)) * (1 - 0.2 * Math.exp(-y / 0.2));
      out[0] = wt[0] * v; out[1] = wt[1] * v; out[2] = wt[2] * v;
    },
    sky(dx, dy, dz, out) {
      const t = Math.max(0, Math.min(1, dy * 1.5 + 0.4));
      out[0] = 0.42 + 0.3 * t; out[1] = 0.43 + 0.3 * t; out[2] = 0.45 + 0.31 * t;
    },
  };
}
export function lightFor(rd) {
  const a = rd.light.az * DEG, e = rd.light.el * DEG;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.45, 1.38, 1.26], soft: 0.06,
    sky: [0.36, 0.38, 0.42], ground: [0.16, 0.14, 0.12],
    fill: { dir: [-Math.sin(a) * 0.6, 0.5, 0.62], col: [0.12, 0.12, 0.13] }, aoK: 1.0, contact: 0.32, contactH: 0.12,
  };
}
