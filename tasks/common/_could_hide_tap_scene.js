import { lin, fbm, hash2, lineMask, makeCam, makeScene, shape } from './_could_hide_tap_rt.js';

export const IMG = Object.freeze({ w: 380, h: 300 });
const D2R = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (v) => v - Math.floor(v);

export function eyeOf(cam) {
  const a = cam.az * D2R;
  return [cam.D * Math.sin(a), cam.h, cam.D * Math.cos(a)];
}
export function cameraFor(cam) {
  const a = cam.az * D2R, e = eyeOf(cam);
  const target = [e[0] - cam.g * Math.sin(a), 0, e[2] - cam.g * Math.cos(a)];
  return makeCam({ eye: e, target, fovY: cam.fov, W: IMG.w, H: IMG.h });
}

export function toWorld(o, lx, lz) {
  const a = (o.yaw || 0) * D2R, c = Math.cos(a), s = Math.sin(a);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
export function toLocal(o, x, z) {
  const a = (o.yaw || 0) * D2R, c = Math.cos(a), s = Math.sin(a), px = x - o.x, pz = z - o.z;
  return [px * c - pz * s, px * s + pz * c];
}
function rotYawPitch(yawDeg, pitchDeg) {
  const a = yawDeg * D2R, p = pitchDeg * D2R, c = Math.cos(a), s = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
  return [c, s * sp, s * cp, 0, cp, -sp, -s, c * sp, c * cp];
}
const transpose = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];

export const CAT_H = 0.305;
const CAT_PARTS = [
  { t: 'e', c: [0, 0.074, -0.046], r: [0.078, 0.074, 0.092], p: 0, mat: 'fur', tex: 'body' },
  { t: 'e', c: [0, 0.142, 0.016], r: [0.058, 0.086, 0.056], p: 18, mat: 'chest', tex: 'chest' },
  { t: 'e', c: [0, 0.222, 0.047], r: [0.058, 0.051, 0.052], p: 0, mat: 'fur', tex: 'head' },
  { t: 'e', c: [0, 0.205, 0.089], r: [0.031, 0.021, 0.021], p: 0, mat: 'muzzle' },
  { t: 'ear', side: -1, mat: 'fur' }, { t: 'ear', side: 1, mat: 'fur' },
  { t: 'k', a: [-0.026, 0.125, 0.05], b: [-0.024, 0.02, 0.064], r: 0.0165, mat: 'leg' },
  { t: 'k', a: [0.026, 0.125, 0.05], b: [0.024, 0.02, 0.064], r: 0.0165, mat: 'leg' },
  { t: 'e', c: [-0.025, 0.012, 0.074], r: [0.019, 0.012, 0.025], p: 0, mat: 'paw' },
  { t: 'e', c: [0.025, 0.012, 0.074], r: [0.019, 0.012, 0.025], p: 0, mat: 'paw' },
  { t: 'e', c: [-0.059, 0.014, 0.0], r: [0.022, 0.014, 0.037], p: 0, mat: 'paw' },
  { t: 'e', c: [0.059, 0.014, 0.0], r: [0.022, 0.014, 0.037], p: 0, mat: 'paw' },
  { t: 'k', a: [0.03, 0.032, -0.126], b: [0.088, 0.019, -0.072], r: 0.0175, mat: 'fur', tex: 'tail' },
  { t: 'k', a: [0.088, 0.019, -0.072], b: [0.101, 0.018, 0.008], r: 0.017, mat: 'fur', tex: 'tail' },
  { t: 'k', a: [0.101, 0.018, 0.008], b: [0.068, 0.019, 0.078], r: 0.0165, mat: 'tailtip', tex: 'tail' },
  { t: 'e', c: [-0.022, 0.232, 0.093], r: [0.0115, 0.0135, 0.006], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0.022, 0.232, 0.093], r: [0.0115, 0.0135, 0.006], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0, 0.217, 0.109], r: [0.0085, 0.006, 0.005], p: 0, mat: 'nose', tiny: true },
];
function earVerts(side) {
  const x = (v) => side * v;
  return [[x(0.055), 0.233, 0.05], [x(0.012), 0.262, 0.05], [x(0.041), 0.306, 0.042], [x(0.034), 0.245, 0.016]];
}
const EAR_FACES = [[0, 1, 2], [0, 3, 1], [1, 3, 2], [0, 2, 3]];
export const CAT_FOOT = Object.freeze({ x0: -0.082, x1: 0.119, z0: -0.144, z1: 0.112 });

const RABBIT_PARTS = [
  { t: 'e', c: [0, 0.068, -0.035], r: [0.072, 0.068, 0.085], p: 0, mat: 'fur' },
  { t: 'e', c: [0, 0.085, 0.035], r: [0.05, 0.062, 0.05], p: 10, mat: 'chest' },
  { t: 'e', c: [0, 0.145, 0.072], r: [0.042, 0.04, 0.05], p: 15, mat: 'fur' },
  { t: 'e', c: [0, 0.132, 0.112], r: [0.024, 0.02, 0.018], p: 0, mat: 'muzzle' },
  { t: 'e', c: [-0.019, 0.205, 0.052], r: [0.014, 0.05, 0.008], p: -12, mat: 'fur' },
  { t: 'e', c: [0.019, 0.205, 0.052], r: [0.014, 0.05, 0.008], p: -12, mat: 'fur' },
  { t: 'e', c: [-0.022, 0.012, 0.085], r: [0.014, 0.011, 0.022], p: 0, mat: 'paw' },
  { t: 'e', c: [0.022, 0.012, 0.085], r: [0.014, 0.011, 0.022], p: 0, mat: 'paw' },
  { t: 'e', c: [-0.05, 0.013, -0.005], r: [0.02, 0.013, 0.055], p: 0, mat: 'paw' },
  { t: 'e', c: [0.05, 0.013, -0.005], r: [0.02, 0.013, 0.055], p: 0, mat: 'paw' },
  { t: 'e', c: [0, 0.055, -0.116], r: [0.024, 0.024, 0.02], p: 0, mat: 'tailtip' },
  { t: 'e', c: [-0.03, 0.155, 0.103], r: [0.008, 0.009, 0.005], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0.03, 0.155, 0.103], r: [0.008, 0.009, 0.005], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0, 0.138, 0.129], r: [0.007, 0.005, 0.004], p: 0, mat: 'nose', tiny: true },
];
const DOG_PARTS = [
  { t: 'e', c: [0, 0.11, -0.08], r: [0.11, 0.11, 0.13], p: 0, mat: 'fur' },
  { t: 'e', c: [0, 0.22, 0.03], r: [0.085, 0.14, 0.08], p: 20, mat: 'chest' },
  { t: 'e', c: [0, 0.37, 0.07], r: [0.075, 0.07, 0.08], p: 0, mat: 'fur' },
  { t: 'e', c: [0, 0.345, 0.155], r: [0.04, 0.035, 0.06], p: 0, mat: 'muzzle' },
  { t: 'e', c: [-0.078, 0.35, 0.05], r: [0.02, 0.06, 0.04], p: 0, mat: 'ear' },
  { t: 'e', c: [0.078, 0.35, 0.05], r: [0.02, 0.06, 0.04], p: 0, mat: 'ear' },
  { t: 'k', a: [-0.04, 0.2, 0.07], b: [-0.04, 0.03, 0.095], r: 0.025, mat: 'leg' },
  { t: 'k', a: [0.04, 0.2, 0.07], b: [0.04, 0.03, 0.095], r: 0.025, mat: 'leg' },
  { t: 'e', c: [-0.04, 0.016, 0.11], r: [0.03, 0.016, 0.04], p: 0, mat: 'paw' },
  { t: 'e', c: [0.04, 0.016, 0.11], r: [0.03, 0.016, 0.04], p: 0, mat: 'paw' },
  { t: 'e', c: [-0.09, 0.02, -0.02], r: [0.032, 0.02, 0.07], p: 0, mat: 'paw' },
  { t: 'e', c: [0.09, 0.02, -0.02], r: [0.032, 0.02, 0.07], p: 0, mat: 'paw' },
  { t: 'k', a: [0.04, 0.04, -0.2], b: [0.14, 0.022, -0.12], r: 0.02, mat: 'fur' },
  { t: 'e', c: [-0.032, 0.39, 0.14], r: [0.012, 0.012, 0.006], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0.032, 0.39, 0.14], r: [0.012, 0.012, 0.006], p: 0, mat: 'eye', tiny: true },
  { t: 'e', c: [0, 0.36, 0.212], r: [0.016, 0.012, 0.01], p: 0, mat: 'nose', tiny: true },
];
export const SPECIES = Object.freeze({
  rabbit: { name: 'rabbit', parts: RABBIT_PARTS, g: 0.88, H: 0.255 * 0.88, foot: { x0: -0.075, x1: 0.075, z0: -0.142, z1: 0.131 },
    coats: [{ fur: '#a88a6e', stripe: null, white: '#efe6da', chest: false }, { fur: '#d8d4cc', stripe: null, white: '#f7f5f0', chest: false },
      { fur: '#5f5652', stripe: null, white: '#ece6de', chest: true }] },
  cat: { name: 'cat', parts: CAT_PARTS, g: 1, H: CAT_H, foot: CAT_FOOT, coats: null },
  dog: { name: 'dog', parts: DOG_PARTS, g: 1, H: 0.44, foot: { x0: -0.125, x1: 0.162, z0: -0.222, z1: 0.216 },
    coats: [{ fur: '#c58a4f', stripe: null, white: '#f3ead9', chest: true, ear: '#8a5a30', nose: '#2b2624' }, { fur: '#34302d', stripe: null, white: '#efe8dc', chest: true, ear: '#1f1c1a', nose: '#141212' },
      { fur: '#e2cda2', stripe: null, white: '#f7f0e1', chest: false, ear: '#b8955f', nose: '#3a2e28' }] },
});
export const SPECIES_NAMES = ['rabbit', 'cat', 'dog'];
export const speciesOf = (cat) => SPECIES[(cat && cat.sp) || 'cat'];
export const sizeK = (cat) => speciesOf(cat).H / CAT_H;
export const coatsOf = (cat) => speciesOf(cat).coats || COATS;

export function catParts(cat, all = false) {
  const S = speciesOf(cat), a = cat.yaw * D2R, c = Math.cos(a), sn = Math.sin(a), s = cat.s * S.g;
  const W = (p) => [cat.x + s * (p[0] * c + p[2] * sn), s * p[1], cat.z + s * (-p[0] * sn + p[2] * c)];
  const out = [];
  for (const P of S.parts) {
    if (P.tiny && !all) continue;
    if (P.t === 'e') {
      const A = rotYawPitch(cat.yaw, P.p || 0);
      out.push({ k: 'e', c: W(P.c), r: P.r.map((v) => v * s), M: transpose(A), mat: P.mat, tex: P.tex });
    } else if (P.t === 'k') out.push({ k: 'k', a: W(P.a), b: W(P.b), r: P.r * s, mat: P.mat, tex: P.tex });
    else out.push({ k: 'p', verts: earVerts(P.side).map(W), mat: P.mat, tex: 'ear' });
  }
  return out;
}
export function catFootprint(cat) {
  const S = speciesOf(cat), F = S.foot, s = cat.s * S.g;
  const lcx = (F.x0 + F.x1) / 2 * s, lcz = (F.z0 + F.z1) / 2 * s;
  const a = cat.yaw * D2R, c = Math.cos(a), sn = Math.sin(a);
  return { cx: cat.x + lcx * c + lcz * sn, cz: cat.z - lcx * sn + lcz * c, hx: (F.x1 - F.x0) / 2 * s, hz: (F.z1 - F.z0) / 2 * s, yaw: cat.yaw };
}

export const KINDS = ['crate', 'cabinet', 'bin', 'barrel', 'carton', 'screen'];
export const SCREEN_FOOT = 0.2;

export function localParts(o) {
  const P = [], w = o.w, d = o.d, h = o.h;
  const box = (x, y, z, hx, hy, hz, mat, extra = {}) => P.push({ t: 'box', x, y, z, hx, hy, hz, mat, bev: 0, ...extra });
  if (o.kind === 'crate') {
    if (!o.open) box(0, h / 2, 0, w / 2, h / 2, d / 2, 'crate', { body: true, bev: Math.min(0.012, h * 0.03) });
    else {
      const pw = o.pw || 0.02, sh = o.sh || 0.017, st = 0.008;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - pw / 2), h / 2, sz * (d / 2 - pw / 2), pw / 2, h / 2, pw / 2, 'crateDark');
      const n = Math.max(3, Math.round((h - sh) / (o.gap + sh)) + 1), step = (h - sh) / (n - 1);
      for (let i = 0; i < n; i++) {
        const y = sh / 2 + i * step;
        for (const sz of [-1, 1]) box(0, y, sz * (d / 2 - st / 2 - 0.002), w / 2 - pw, sh / 2, st / 2, 'crate');
        for (const sx of [-1, 1]) box(sx * (w / 2 - st / 2 - 0.002), y, 0, st / 2, sh / 2, d / 2 - pw, 'crate');
      }
      const m = Math.max(3, Math.round((d - sh) / (o.gap + sh)) + 1), stepZ = (d - sh) / (m - 1);
      for (let i = 0; i < m; i++) box(0, h - st / 2, -d / 2 + sh / 2 + i * stepZ, w / 2, st / 2, sh / 2, 'crate');
    }
  } else if (o.kind === 'cabinet') {
    const roof = 0.035;
    if (!o.open) {
      box(0, (h - roof) / 2, 0, w / 2, (h - roof) / 2, d / 2, 'cabinet', { body: true, bev: 0.01 });
      box(0, h - roof / 2, 0.006, w / 2 + 0.022, roof / 2, d / 2 + 0.02, 'cabRoof', { bev: 0.008 });
      for (const sx of [-1, 1]) box(sx * 0.045, h * 0.52, d / 2 + 0.012, 0.012, 0.03, 0.012, 'knob', { bev: 0.006 });
    } else {
      const r = 0.009;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push({ t: 'cyl', x: sx * (w / 2 - r), z: sz * (d / 2 - r), y0: 0, y1: h, r, mat: 'wire' });
      const n = o.shelves || 4;
      for (let k = 0; k < n; k++) {
        const y = k === n - 1 ? h - 0.01 : 0.05 + k * (h - 0.06) / (n - 1);
        const b = 0.005;
        for (const sz of [-1, 1]) box(0, y, sz * (d / 2 - r), w / 2 - r, b, b, 'wire');
        for (const sx of [-1, 1]) box(sx * (w / 2 - r), y, 0, b, b, d / 2 - r, 'wire');
        const nw = Math.max(3, Math.round(w / 0.13));
        for (let i = 1; i < nw; i++) box(-w / 2 + r + i * (w - 2 * r) / nw, y + 0.004, 0, 0.0035, 0.0035, d / 2 - r, 'wire', { noAO: true });
      }
    }
  } else if (o.kind === 'bin') {
    const lid = 0.05 * o.sc;
    box(0, (h - lid) / 2, 0, w / 2, (h - lid) / 2, d / 2, 'bin', { body: true, bev: 0.02 * o.sc });
    box(0, h - lid / 2, 0.012 * o.sc, w / 2 + 0.014 * o.sc, lid / 2, d / 2 + 0.024 * o.sc, 'binLid', { bev: 0.012 * o.sc });
    const wr = 0.06 * o.sc;
    for (const sx of [-1, 1]) P.push({ t: 'cap', a: [sx * (w / 2 - 0.02 * o.sc), wr, -d / 2 + wr * 0.7], b: [sx * (w / 2 + 0.012 * o.sc), wr, -d / 2 + wr * 0.7], r: wr, mat: 'tyre' });
    P.push({ t: 'cap', a: [-w / 2 + 0.05 * o.sc, h - lid - 0.05 * o.sc, -d / 2 - 0.02 * o.sc], b: [w / 2 - 0.05 * o.sc, h - lid - 0.05 * o.sc, -d / 2 - 0.02 * o.sc], r: 0.016 * o.sc, mat: 'binLid' });
  } else if (o.kind === 'carton') {
    box(0, h / 2, 0, w / 2, h / 2, d / 2, 'carton', { body: true, bev: Math.min(0.01, h * 0.03) });
  } else if (o.kind === 'barrel') {
    const r = w / 2, hr = 0.007 * o.sc, hh = 0.017 * o.sc;
    P.push({ t: 'cyl', x: 0, z: 0, y0: 0, y1: h, r, mat: 'barrel', body: true, bev: 0.012 * o.sc });
    for (const f of [0.17, 0.83]) P.push({ t: 'cyl', x: 0, z: 0, y0: h * f - hh, y1: h * f + hh, r: r + hr, mat: 'hoop' });
  } else if (o.kind === 'screen') {
    const t = d, fh = 0.03, fw = 0.025, lift = 0.03;
    for (const sx of [-1, 1]) box(sx * (w / 2 - 0.07), fh / 2, 0, fw, fh / 2, SCREEN_FOOT, 'screenDark');
    if (!o.open) box(0, lift + (h - lift) / 2, 0, w / 2, (h - lift) / 2, t / 2, 'screen', { body: true, bev: 0.008 });
    else {
      const fr = 0.026, bar = 0.005, sp = o.gap;
      for (const sx of [-1, 1]) box(sx * (w / 2 - fr / 2), lift + (h - lift) / 2, 0, fr / 2, (h - lift) / 2, t / 2, 'screenDark', { bev: 0.006 });
      for (const y of [lift + fr / 2, h - fr / 2]) box(0, y, 0, w / 2 - fr, fr / 2, t / 2, 'screenDark', { bev: 0.006 });
      const iw = w - 2 * fr, ih = h - lift - 2 * fr, y0 = lift + fr;
      const nx = Math.max(2, Math.round(iw / sp)), ny = Math.max(2, Math.round(ih / sp));
      for (let i = 1; i < nx; i++) box(-iw / 2 + i * iw / nx, y0 + ih / 2, t * 0.18, bar, ih / 2, t * 0.22, 'screen', { noAO: true });
      for (let j = 1; j < ny; j++) box(0, y0 + j * ih / ny, -t * 0.18, iw / 2, bar, t * 0.22, 'screen', { noAO: true });
    }
  } else throw new Error(`localParts: kind ${o.kind}`);
  return P;
}

export function worldParts(o) {
  const a = (o.yaw || 0) * D2R, c = Math.cos(a), s = Math.sin(a);
  const W = (lx, lz) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
  return localParts(o).map((p) => {
    if (p.t === 'box') { const [x, z] = W(p.x, p.z); return { ...p, x, z, yaw: o.yaw || 0 }; }
    if (p.t === 'cyl') { const [x, z] = W(p.x, p.z); return { ...p, x, z }; }
    const [ax, az] = W(p.a[0], p.a[2]), [bx, bz] = W(p.b[0], p.b[2]);
    return { ...p, a: [ax, p.a[1], az], b: [bx, p.b[1], bz] };
  });
}
export function footprints(o, maxY = Infinity) {
  const out = [];
  for (const p of worldParts(o)) {
    if (p.t === 'box') { if (p.y - p.hy < maxY) out.push({ t: 'obb', cx: p.x, cz: p.z, hx: p.hx, hz: p.hz, yaw: p.yaw }); }
    else if (p.t === 'cyl') { if (p.y0 < maxY) out.push({ t: 'circ', cx: p.x, cz: p.z, r: p.r }); }
    else if (Math.min(p.a[1], p.b[1]) - p.r < maxY) {
      const cx = (p.a[0] + p.b[0]) / 2, cz = (p.a[2] + p.b[2]) / 2, L = Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]);
      out.push({ t: 'obb', cx, cz, hx: L / 2 + p.r, hz: p.r, yaw: -Math.atan2(p.b[2] - p.a[2], p.b[0] - p.a[0]) / D2R });
    }
  }
  return out;
}
export function extent(o) {
  if (o.kind === 'screen') return { hx: o.w / 2, hz: SCREEN_FOOT };
  if (o.kind === 'bin') return { hx: o.w / 2 + 0.016 * o.sc, hz: o.d / 2 + 0.04 * o.sc };
  if (o.kind === 'cabinet' && !o.open) return { hx: o.w / 2 + 0.022, hz: o.d / 2 + 0.026 };
  if (o.kind === 'barrel') return { hx: o.w / 2 + 0.007 * o.sc, hz: o.w / 2 + 0.007 * o.sc };
  return { hx: o.w / 2, hz: o.d / 2 };
}
export function solidBody(o) {
  const p = worldParts(o).find((q) => q.body);
  if (!p) return null;
  if (p.t === 'box') {
    const a = p.yaw * D2R, c = Math.cos(a), s = Math.sin(a), verts = [];
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const lx = sx * p.hx, lz = sz * p.hz;
      verts.push([p.x + lx * c + lz * s, p.y + sy * p.hy, p.z - lx * s + lz * c]);
    }
    return { verts, center: [p.x, p.y, p.z] };
  }
  const n = 20, verts = [];
  for (const y of [p.y0, p.y1]) for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI; verts.push([p.x + p.r * Math.cos(t), y, p.z + p.r * Math.sin(t)]); }
  return { verts, center: [p.x, (p.y0 + p.y1) / 2, p.z] };
}

export function screenBox(o, cam) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, z) => { const p = cam.project(x, y, z); if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
  for (const p of worldParts(o)) {
    if (p.t === 'box') {
      const a = p.yaw * D2R, c = Math.cos(a), s = Math.sin(a);
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) for (const sx of [-1, 1]) { const lx = sx * p.hx, lz = sz * p.hz; add(p.x + lx * c + lz * s, p.y + sy * p.hy, p.z - lx * s + lz * c); }
    } else if (p.t === 'cyl') {
      for (const y of [p.y0, p.y1]) for (let k = 0; k < 24; k++) { const t = k / 24 * 2 * Math.PI; add(p.x + p.r * Math.cos(t), y, p.z + p.r * Math.sin(t)); }
    } else {
      for (const e of [p.a, p.b]) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) add(e[0] + dx * p.r, e[1] + dy * p.r, e[2] + dz * p.r);
    }
  }
  return [x0, y0, x1, y1];
}
export function catScreenBox(cat, cam) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, z) => { const p = cam.project(x, y, z); if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
  for (const p of catParts(cat)) {
    if (p.k === 'e') {
      const M = p.M;
      for (let i = 0; i < 8; i++) for (let j = 0; j <= 6; j++) {
        const th = i / 8 * 2 * Math.PI, ph = j / 6 * Math.PI, u = [Math.sin(ph) * Math.cos(th) * p.r[0], Math.cos(ph) * p.r[1], Math.sin(ph) * Math.sin(th) * p.r[2]];
        add(p.c[0] + M[0] * u[0] + M[3] * u[1] + M[6] * u[2], p.c[1] + M[1] * u[0] + M[4] * u[1] + M[7] * u[2], p.c[2] + M[2] * u[0] + M[5] * u[1] + M[8] * u[2]);
      }
    } else if (p.k === 'k') {
      for (const e of [p.a, p.b]) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) add(e[0] + dx * p.r, e[1] + dy * p.r, e[2] + dz * p.r);
    } else for (const v of p.verts) add(v[0], v[1], v[2]);
  }
  return [x0, y0, x1, y1];
}

const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
function boxLocal(s, x, z) { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; }

export const LOOKS = {
  crate: [['#d6ad72', '#a97c47'], ['#c99a62', '#9a6e3f'], ['#dcc08c', '#b08b5a']],
  cabinet: [['#6f9277', '#4f6d56'], ['#7890aa', '#566b83'], ['#cdb68c', '#a48d64'], ['#a8583f', '#7d3e2b'], ['#5d7c8a', '#435b66']],
  wire: ['#3d4147', '#d9dbde'],
  bin: ['#3f7d3b', '#4a4f58', '#2f5f93', '#6d4c34', '#7a7f86'],
  barrel: [['#9b6a3b', '#3b3a38'], ['#8a5a32', '#2e2d2c'], ['#a8794a', '#45423f']],
  carton: [['#c29a66', '#dcc59a'], ['#b88c58', '#e0cfa8'], ['#cda776', '#e8dcc0']],
  screen: [['#8c6a4a', '#6b4f35'], ['#b89c76', '#8f7556'], ['#9e9b93', '#77746d'], ['#e5e1d8', '#bdb8ad']],
};
export const COATS = [
  { fur: '#e3924a', stripe: '#b5652a', white: '#f6ecdd', chest: true },
  { fur: '#8e959c', stripe: '#5d636a', white: '#f2f0ea', chest: true },
  { fur: '#2e2f33', stripe: null, white: '#f1efe9', chest: true },
  { fur: '#e2c89a', stripe: '#c29c62', white: '#f7f0e3', chest: false },
];

function woodPlanks(base, dark, horizontal = true) {
  const b = cA(base), d = cA(dark), lo = b.map((v) => v * 0.86), hi = b.map((v) => Math.min(1, v * 1.08));
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, v] = s.k === 1 ? boxLocal(s, x, z) : [x, z];
    const P = s.plank || 0.1;
    let along, across;
    if (Math.abs(ny) > 0.7) { along = u; across = v; }
    else { along = Math.abs(nx * s.ca - nz * s.sa) > 0.5 ? v : u; across = y; }
    if (!horizontal && Math.abs(ny) <= 0.7) { const t = along; along = across; across = t; }
    const row = Math.floor(across / P);
    const g = fbm(along * 3 + row * 7.1, across * 20, 2, fp * 20);
    mixInto(out, lo, hi, 0.25 + 0.5 * hash2(row, 3) * 0.6 + 0.35 * g);
    const seam = lineMask(across, P, 0.0045 * (P / 0.1), fp);
    const k = 1 - 0.45 * seam;
    out[0] *= k; out[1] *= k; out[2] *= k;
    if (s.edgeDark) {
      const [lu, lv] = boxLocal(s, x, z);
      const e = Math.min(s.hx - Math.abs(lu), s.hz - Math.abs(lv));
      if (Math.abs(ny) <= 0.7 && e < s.edgeDark) mixInto(out, out.slice(), d, 0.55);
    }
  };
}
function painted(base, dark) {
  const b = cA(base), d = cA(dark);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, v] = boxLocal(s, x, z);
    out[0] = b[0]; out[1] = b[1]; out[2] = b[2];
    if (Math.abs(ny) > 0.7) return;
    const g = fbm(u * 6 + v * 6, y * 6, 2, fp * 6);
    const k0 = 0.95 + 0.08 * g; out[0] *= k0; out[1] *= k0; out[2] *= k0;
    const front = (-nx * s.sa + nz * s.ca) > 0.7 && s.door;
    if (front) {
      const m = 0.045;
      const seam = Math.abs(u) < 0.004 + fp * 0.5;
      const inset = (Math.abs(Math.abs(u) - (s.hx - m)) < 0.006 + fp * 0.5 && Math.abs(y - s.cy) < s.hy - m) ||
        (Math.abs(Math.abs(y - s.cy) - (s.hy - m)) < 0.006 + fp * 0.5 && Math.abs(u) < s.hx - m);
      if (seam || inset) mixInto(out, out.slice(), d, 0.75);
    }
  };
}
function staves(base, dark) {
  const b = cA(base), lo = b.map((v) => v * 0.84);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    if (ny > 0.7) {
      const g = fbm(x * 4, z * 30, 2, fp * 30);
      mixInto(out, lo, b, 0.4 + 0.5 * g);
      const k = 1 - 0.4 * lineMask(z - s.cz, 0.07 * (s.r / 0.3), 0.004, fp); out[0] *= k; out[1] *= k; out[2] *= k;
      return;
    }
    const ang = Math.atan2(z - s.cz, x - s.cx), u = ang * s.r;
    const P = 0.085 * (s.r / 0.3), col = Math.floor(u / P);
    const g = fbm(u * 20, y * 3 + col * 5, 2, fp * 20);
    mixInto(out, lo, b, 0.3 + 0.4 * hash2(col, 9) + 0.3 * g);
    const k = 1 - 0.4 * lineMask(u, P, 0.004 * (s.r / 0.3), fp); out[0] *= k; out[1] *= k; out[2] *= k;
    void dark;
  };
}
function plastic(base) {
  const b = cA(base);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const g = fbm(x * 9 + z * 9, y * 9, 2, fp * 9);
    const k = 0.96 + 0.06 * g; out[0] = b[0] * k; out[1] = b[1] * k; out[2] = b[2] * k;
    if (s.k === 1 && Math.abs(ny) < 0.5 && s.ribs) { const r = lineMask(y, s.ribs, 0.004, fp); out[0] *= 1 - 0.25 * r; out[1] *= 1 - 0.25 * r; out[2] *= 1 - 0.25 * r; }
  };
}
function cardboard(base, tape) {
  const b = cA(base), t = cA(tape), lo = b.map((v) => v * 0.9);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, v] = boxLocal(s, x, z);
    const g = fbm(u * 9 + v * 9, y * 9, 2, fp * 9);
    mixInto(out, lo, b, 0.4 + 0.6 * g);
    const tw = s.hx * 0.16, top = Math.abs(ny) > 0.7;
    if (Math.abs(u) < tw && (top || (Math.abs(nz * s.ca - nx * s.sa) > 0.7 && y > s.cy + s.hy - s.hy * 0.45))) { out[0] = t[0]; out[1] = t[1]; out[2] = t[2]; }
    if (top && Math.abs(v) < 0.004 + fp * 0.5) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; }
  };
}
function furTex(coat, which) {
  const fur = cA(coat.fur), st = coat.stripe ? cA(coat.stripe) : null, wh = cA(coat.white);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const C = s.cat, px = x - C.x, pz = z - C.z;
    const lx = (px * C.c - pz * C.s) / C.sc, lz = (px * C.s + pz * C.c) / C.sc, ly = y / C.sc;
    let base = fur;
    if (which === 'white' || (which === 'chest' && coat.chest)) base = wh;
    out[0] = base[0]; out[1] = base[1]; out[2] = base[2];
    if (!st || base === wh) return;
    const tex = s.tex;
    let m = 0;
    const n = fbm(lx * 30 + 3, ly * 30 + lz * 30, 2, fp * 30 / C.sc) - 0.5;
    if (tex === 'body') m = 0.5 + 0.5 * Math.sin(2 * Math.PI * (lz * 13 + ly * 5) + 3 * n);
    else if (tex === 'head') m = ly > 0.236 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * lx * 34 + 2 * n) : 0;
    else if (tex === 'tail') m = 0.5 + 0.5 * Math.sin(2 * Math.PI * (lz * 16 - lx * 9) + 2 * n);
    const w = smooth(0.62, 0.82, m) * clamp01(1.5 - fp / C.sc * 60);
    mixInto(out, base, st, 0.85 * w);
  };
}

export function envFor(rd) {
  const L = rd.look;
  const g0 = cA(['#5f9d3f', '#6aa644', '#58933c'][L.lawn]), g1 = cA(['#7db653', '#86bd57', '#74ad4d'][L.lawn]), gd = cA('#467a2c');
  const fb = cA(['#b58a5c', '#a3906f', '#9b7652', '#c9b89c'][L.fence]), fd = fb.map((v) => v * 0.62), fl = fb.map((v) => Math.min(1, v * 1.1));
  const hedgeA = cA('#2e5a2a'), hedgeB = cA('#4f7f3a'), sky0 = cA('#b9d6ee'), sky1 = cA('#dce9f3');
  const BW = 0.14, stripe = 0.62;
  return {
    floorY: 0, wallZ: 0, wallH: L.fenceH, hedgeZ: -1.6, hedgeH: L.fenceH + 1.5,
    floor(x, z, fp, out) {
      const band = Math.floor(z / stripe + 0.5 * Math.sin(x * 0.15));
      const bandK = (band & 1) ? 1.0 : 0.9;
      const g = fbm(x * 1.3, z * 1.3, 3, fp * 1.3), blades = fbm(x * 38, z * 38, 2, fp * 38);
      mixInto(out, g0, g1, clamp01(0.2 + 0.6 * g + 0.25 * (blades - 0.5)));
      const patch = fbm(x * 0.35 + 7, z * 0.35 - 3, 2, fp * 0.35);
      if (patch > 0.62) mixInto(out, out.slice(), gd, (patch - 0.62) * 0.8);
      out[0] *= bandK; out[1] *= bandK; out[2] *= bandK;
    },
    wall(x, y, fp, out) {
      const col = Math.floor(x / BW), post = ((col % 13) + 13) % 13 === 0;
      const g = fbm(x * 30 + col * 3.3, y * 3, 2, fp * 30);
      mixInto(out, fd, fl, clamp01(0.45 + 0.35 * (hash2(col, 17) - 0.5) + 0.35 * (g - 0.5)));
      if (post) { out[0] *= 0.82; out[1] *= 0.82; out[2] *= 0.82; }
      const seam = lineMask(x, BW, 0.004, fp);
      let k = 1 - 0.55 * seam;
      if (y > L.fenceH - 0.07) k *= 1.08;
      if (Math.abs(y - (L.fenceH - 0.07)) < 0.006 + fp * 0.5) k *= 0.7;
      if (y < 0.12) k *= 0.93;
      if (Math.abs(y - 0.12) < 0.005 + fp * 0.5) k *= 0.75;
      out[0] *= k; out[1] *= k; out[2] *= k;
    },
    hedge(x, y, fp, out) {
      const g = fbm(x * 2.2, y * 2.2, 3, fp * 2.2), c = fbm(x * 9, y * 9, 2, fp * 9);
      mixInto(out, hedgeA, hedgeB, clamp01(0.25 + 0.6 * g + 0.3 * (c - 0.5)));
      const top = L.fenceH + 1.5 - 0.35 * fbm(x * 0.8, 3.1, 2);
      if (y > top) { out[0] = sky0[0]; out[1] = sky0[1]; out[2] = sky0[2]; }
    },
    sky(dx, dy, dz, out) { const t = clamp01(dy * 2.5 + 0.2); mixInto(out, sky1, sky0, t); },
  };
}
export function lightFor(rd) {
  const a = rd.sun.az * D2R, e = rd.sun.el * D2R;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.25, 1.2, 1.08], soft: 0.035,
    sky: [0.4, 0.46, 0.55], ground: [0.16, 0.2, 0.12],
    fill: { dir: [-Math.sin(a) * 0.6, 0.45, 0.65], col: [0.1, 0.12, 0.14] }, aoK: 1, contact: 0.3, contactH: 0.12,
  };
}

export const CAT_ID = 50;
export function buildScene(rd, look = null) {
  const mats = [], shapes = [];
  const matIdx = new Map();
  const matOf = (key, def) => { if (!matIdx.has(key)) { matIdx.set(key, mats.length); mats.push(def); } return matIdx.get(key); };
  const L0 = look;
  rd.objs.forEach((o, i) => {
    const look = L0 ? L0.objMats(o) : objMats(o);
    for (const p of worldParts(o)) {
      const m = matOf(`${i}:${p.mat}`, look[p.mat] || look.main);
      let s;
      if (p.t === 'box') s = shape.box(i, m, p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw, p.bev || 0);
      else if (p.t === 'cyl') s = shape.cyl(i, m, p.x, p.z, p.y0, p.y1, p.r, p.bev || 0);
      else s = shape.capsule(i, m, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r);
      if (p.noAO) s.noAO = true;
      s.plank = o.plank || 0.1;
      if (o.kind === 'crate' && !o.open && p.body) s.edgeDark = 0.045 * o.sc;
      if (o.kind === 'cabinet' && p.body) s.door = true;
      if (o.kind === 'bin' && p.body) s.ribs = 0.12 * o.sc;
      shapes.push(s);
    }
  });
  const coat = coatsOf(rd.cat)[rd.cat.coat];
  const C = rd.cat, a = C.yaw * D2R, frame = { x: C.x, z: C.z, c: Math.cos(a), s: Math.sin(a), sc: C.s * speciesOf(C).g };
  const catMats = {
    fur: { c: cA(coat.fur), ks: 0.12, sh: 18, tex: furTex(coat, 'fur') },
    chest: { c: cA(coat.fur), ks: 0.1, sh: 18, tex: furTex(coat, 'chest') },
    muzzle: { c: cA(coat.white), ks: 0.1, sh: 18, tex: furTex(coat, coat.chest ? 'white' : 'fur') },
    leg: { c: cA(coat.fur), ks: 0.1, sh: 18, tex: furTex(coat, 'fur') },
    paw: { c: cA(coat.white), ks: 0.1, sh: 18, tex: furTex(coat, coat.chest ? 'white' : 'fur') },
    tailtip: { c: cA(coat.fur), ks: 0.1, sh: 18, tex: furTex(coat, coat.stripe ? 'fur' : 'white') },
    ear: { c: cA(coat.ear || coat.fur), ks: 0.08, sh: 14 },
    eye: { c: cA('#27301c'), ks: 0.6, sh: 60 },
    nose: { c: cA(coat.nose || '#d98189'), ks: 0.3, sh: 30 },
  };
  for (const p of catParts(C, true)) {
    const m = matOf(`cat:${p.mat}`, catMats[p.mat]);
    let s;
    if (p.k === 'e') s = shape.ellipsoid(CAT_ID, m, p.c[0], p.c[1], p.c[2], p.r[0], p.r[1], p.r[2], p.M);
    else if (p.k === 'k') s = shape.capsule(CAT_ID, m, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r);
    else s = shape.poly(CAT_ID, m, p.verts, EAR_FACES);
    s.cat = frame; s.tex = p.tex || null;
    shapes.push(s);
  }
  if (L0) return makeScene({ cam: cameraFor(rd.cam), shapes, mats, env: L0.env(rd), light: L0.light(rd) });
  return makeScene({ cam: cameraFor(rd.cam), shapes, mats, env: envFor(rd), light: lightFor(rd) });
}
function objMats(o) {
  const M = {};
  if (o.kind === 'crate') {
    const [b, d] = LOOKS.crate[o.col];
    M.crate = { c: cA(b), ks: 0.06, sh: 14, tex: woodPlanks(b, d) };
    M.crateDark = { c: cA(d), ks: 0.06, sh: 14, tex: woodPlanks(d, d, false) };
  } else if (o.kind === 'cabinet') {
    if (!o.open) {
      const [b, d] = LOOKS.cabinet[o.col];
      M.cabinet = { c: cA(b), ks: 0.12, sh: 22, tex: painted(b, d) };
      M.cabRoof = { c: cA(d), ks: 0.1, sh: 20 };
      M.knob = { c: cA('#d8d4c8'), ks: 0.4, sh: 50 };
    } else M.wire = { c: cA(LOOKS.wire[o.col % 2]), ks: 0.5, sh: 60, env: 0.15 };
  } else if (o.kind === 'bin') {
    const b = LOOKS.bin[o.col];
    M.bin = { c: cA(b), ks: 0.25, sh: 30, tex: plastic(b) };
    M.binLid = { c: cA(b).map((v) => v * 0.85), ks: 0.3, sh: 30 };
    M.tyre = { c: cA('#2a2a2c'), ks: 0.1, sh: 10 };
  } else if (o.kind === 'barrel') {
    const [b, d] = LOOKS.barrel[o.col];
    M.barrel = { c: cA(b), ks: 0.08, sh: 16, tex: staves(b, d) };
    M.hoop = { c: cA(d), ks: 0.35, sh: 40 };
  } else if (o.kind === 'carton') {
    const [b, t] = LOOKS.carton[o.col];
    M.carton = { c: cA(b), ks: 0.05, sh: 12, tex: cardboard(b, t) };
  } else if (o.kind === 'screen') {
    const [b, d] = LOOKS.screen[o.col];
    M.screen = { c: cA(b), ks: 0.06, sh: 14, tex: woodPlanks(b, d, false) };
    M.screenDark = { c: cA(d), ks: 0.06, sh: 14, tex: woodPlanks(d, d, false) };
  }
  M.main = Object.values(M)[0];
  return M;
}
export { EAR_FACES, smooth, frac, woodPlanks, painted, staves, plastic, cardboard };
