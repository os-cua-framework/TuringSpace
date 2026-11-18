import { personShapes, standPose, shape, frame, hash2, fbm, lineMask, lin, CAP, ELL } from './_people_rt.js';
import { C, EYE, GUARD_H, WALL_H, WALL_T, guardPos } from './_hide_from_guard_geom.js';

export const HFOV = 96 * Math.PI / 180;

const WORLDS = new WeakMap();
const WORLDS_STYLED = new WeakMap();
export function worldOf(m, look = null) {
  if (look) {
    let byKey = WORLDS_STYLED.get(m);
    if (!byKey) { byKey = new Map(); WORLDS_STYLED.set(m, byKey); }
    let w = byKey.get(look.key);
    if (!w) { w = buildWorld(m, look); byKey.set(look.key, w); }
    return w;
  }
  let w = WORLDS.get(m);
  if (!w) { w = buildWorld(m); WORLDS.set(m, w); }
  return w;
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function buildWorld(m, look = null) {
  const prisms = [], YW = m.grid.w * C, YH = m.grid.h * C;
  const wallTint = [lin('#cdc6ba'), lin('#c7c2b9'), lin('#cbc4b6'), lin('#c4bfb5')];
  const WH = look ? look.wallH : [WALL_H, WALL_H, WALL_H, WALL_H];
  prisms.push({ kind: 'wall', side: 0, x0: -WALL_T, x1: YW + WALL_T, z0: -WALL_T, z1: 0, h: WH[0], tint: wallTint[0] });
  prisms.push({ kind: 'wall', side: 1, x0: YW, x1: YW + WALL_T, z0: -WALL_T, z1: YH + WALL_T, h: WH[1], tint: wallTint[1] });
  prisms.push({ kind: 'wall', side: 2, x0: -WALL_T, x1: YW + WALL_T, z0: YH, z1: YH + WALL_T, h: WH[2], tint: wallTint[2] });
  prisms.push({ kind: 'wall', side: 3, x0: -WALL_T, x1: 0, z0: -WALL_T, z1: YH + WALL_T, h: WH[3], tint: wallTint[3] });
  for (let i = 0; i < m.obstacles.length; i++) {
    const o = m.obstacles[i], R = o.rect;
    prisms.push({ kind: 'stack', idx: i, style: o.style, x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, h: o.h, split: o.split ?? o.h / 2, tone: o.tone ?? 0.5, seed: i * 97 + 13 });
  }
  const el = (m.sun?.el ?? 56) * Math.PI / 180, az = (m.sun?.az ?? 30) * Math.PI / 180;
  const sun = [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
  const G = guardPos(m), fa = (m.guard.face ?? 0) * Math.PI / 180;
  const gf = [Math.sin(fa), -Math.cos(fa)];
  const guard = look ? look.guardShapes(G[0], G[1], gf[0], gf[1]) : guardShapes(G[0], G[1], gf[0], gf[1]);
  const w = { m, prisms, sun, guard, G, YW, YH, gmat: look ? look.guardMats : GMAT };
  bakeLight(w);
  return w;
}

const GM = { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4, vest: 5 };
const GMAT = [
  { c: lin('#c99a76'), ks: 0.1, sh: 20 },
  { c: lin('#1d1f24'), ks: 0.12, sh: 18 },
  { c: lin('#2b3a56'), ks: 0.04, sh: 8 },
  { c: lin('#23272f'), ks: 0.04, sh: 8 },
  { c: lin('#18181b'), ks: 0.2, sh: 30 },
  { c: lin('#d6dc3c'), ks: 0.08, sh: 12, vest: true },
];
function guardShapes(x, z, fx, fz) {
  const J = standPose(x, z, fx, fz, GUARD_H);
  const out = personShapes(1, J, { skin: GM.skin, hair: GM.hair, top: GM.top, bottom: GM.bottom, shoe: GM.shoe });
  const k = J.k, pel = J.pelvis, ax = frame([0, 1, 0], J.f);
  const at = (fwd, up) => [pel[0] + J.f[0] * fwd * k, pel[1] + up * k, pel[2] + J.f[2] * fwd * k];
  out.push(shape.ellipsoid(1, GM.vest, at(0.004, 0.36), ax, [0.186 * k, 0.2 * k, 0.118 * k]));
  out.push(shape.ellipsoid(1, GM.vest, at(0.0, 0.17), ax, [0.158 * k, 0.17 * k, 0.106 * k]));
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const s of out) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], s.bb[i]); bb[i + 3] = Math.max(bb[i + 3], s.bb[i + 3]); }
  return { shapes: out, bb };
}
const N = new Float64Array(3);
function hitCap(s, ox, oy, oz, dx, dy, dz, tmax) {
  const a = s.a, b = s.b, r = s.r;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], L2 = ux * ux + uy * uy + uz * uz;
  const ocx = ox - a[0], ocy = oy - a[1], ocz = oz - a[2];
  const bd = ux * dx + uy * dy + uz * dz, bo = ux * ocx + uy * ocy + uz * ocz;
  const A = L2 - bd * bd, B = L2 * (ocx * dx + ocy * dy + ocz * dz) - bo * bd, Cc = L2 * (ocx * ocx + ocy * ocy + ocz * ocz) - bo * bo - r * r * L2;
  let best = tmax;
  let found = false;
  const h = B * B - A * Cc;
  if (h >= 0 && A > 1e-12) {
    const t = (-B - Math.sqrt(h)) / A, y = bo + t * bd;
    if (t > 1e-4 && t < best && y > 0 && y < L2) {
      best = t; found = true;
      const k = y / L2;
      N[0] = (ox + t * dx - a[0] - ux * k) / r; N[1] = (oy + t * dy - a[1] - uy * k) / r; N[2] = (oz + t * dz - a[2] - uz * k) / r;
    }
  }
  for (const p of [a, b]) {
    const lx = ox - p[0], ly = oy - p[1], lz = oz - p[2];
    const bb = lx * dx + ly * dy + lz * dz, cc = lx * lx + ly * ly + lz * lz - r * r, disc = bb * bb - cc;
    if (disc < 0) continue;
    const t = -bb - Math.sqrt(disc);
    if (t > 1e-4 && t < best) { best = t; found = true; N[0] = (lx + t * dx) / r; N[1] = (ly + t * dy) / r; N[2] = (lz + t * dz) / r; }
  }
  return found ? best : Infinity;
}
function hitEll(s, ox, oy, oz, dx, dy, dz, tmax) {
  const [X, Y, Z] = s.ax, h = s.h, c = s.c;
  const px = ox - c[0], py = oy - c[1], pz = oz - c[2];
  const o0 = (px * X[0] + py * X[1] + pz * X[2]) / h[0], o1 = (px * Y[0] + py * Y[1] + pz * Y[2]) / h[1], o2 = (px * Z[0] + py * Z[1] + pz * Z[2]) / h[2];
  const d0 = (dx * X[0] + dy * X[1] + dz * X[2]) / h[0], d1 = (dx * Y[0] + dy * Y[1] + dz * Y[2]) / h[1], d2 = (dx * Z[0] + dy * Z[1] + dz * Z[2]) / h[2];
  const A = d0 * d0 + d1 * d1 + d2 * d2, B = o0 * d0 + o1 * d1 + o2 * d2, Cc = o0 * o0 + o1 * o1 + o2 * o2 - 1;
  const disc = B * B - A * Cc;
  if (disc < 0) return Infinity;
  const t = (-B - Math.sqrt(disc)) / A;
  if (!(t > 1e-4 && t < tmax)) return Infinity;
  const q0 = (o0 + t * d0) / h[0], q1 = (o1 + t * d1) / h[1], q2 = (o2 + t * d2) / h[2];
  let nx = X[0] * q0 + Y[0] * q1 + Z[0] * q2, ny = X[1] * q0 + Y[1] * q1 + Z[1] * q2, nz = X[2] * q0 + Y[2] * q1 + Z[2] * q2;
  const l = Math.hypot(nx, ny, nz); N[0] = nx / l; N[1] = ny / l; N[2] = nz / l;
  return t;
}
function bsMiss(s, ox, oy, oz, dx, dy, dz) {
  const b = s.bs, lx = b[0] - ox, ly = b[1] - oy, lz = b[2] - oz, t = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - t * t;
  return d2 > b[3] * b[3] || (t < -b[3]);
}
const GH_ = { t: Infinity, s: null, n: [0, 0, 0] };
function hitGuard(list, ox, oy, oz, dx, dy, dz, tmax, any = false) {
  GH_.t = tmax; GH_.s = null;
  for (const s of list) {
    if (bsMiss(s, ox, oy, oz, dx, dy, dz)) continue;
    const t = s.k === CAP ? hitCap(s, ox, oy, oz, dx, dy, dz, GH_.t) : s.k === ELL ? hitEll(s, ox, oy, oz, dx, dy, dz, GH_.t) : Infinity;
    if (t < GH_.t) { GH_.t = t; GH_.s = s; GH_.n[0] = N[0]; GH_.n[1] = N[1]; GH_.n[2] = N[2]; if (any) return GH_; }
  }
  return GH_;
}

function prismBlocks(prisms, px, py, pz, Lx, Ly, Lz, skip) {
  for (let i = 0; i < prisms.length; i++) {
    const P = prisms[i];
    if (i === skip) continue;
    let lo = 0, hi = Infinity;
    if (Math.abs(Lx) < 1e-12) { if (px < P.x0 || px > P.x1) continue; } else {
      let a = (P.x0 - px) / Lx, b = (P.x1 - px) / Lx; if (a > b) { const t = a; a = b; b = t; }
      if (a > lo) lo = a; if (b < hi) hi = b; if (lo > hi) continue;
    }
    if (Math.abs(Lz) < 1e-12) { if (pz < P.z0 || pz > P.z1) continue; } else {
      let a = (P.z0 - pz) / Lz, b = (P.z1 - pz) / Lz; if (a > b) { const t = a; a = b; b = t; }
      if (a > lo) lo = a; if (b < hi) hi = b; if (lo > hi) continue;
    }
    if (py + lo * Ly < P.h) return true;
  }
  return false;
}
const NSUN = 16, SUN_R = 0.045;
const SUN_DISK = Array.from({ length: NSUN }, (_, i) => { const r = Math.sqrt((i + 0.5) / NSUN), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });
function sunDirs(L) {
  const t1 = Math.abs(L[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T1 = [L[1] * t1[2] - L[2] * t1[1], L[2] * t1[0] - L[0] * t1[2], L[0] * t1[1] - L[1] * t1[0]];
  const tl = Math.hypot(...T1); T1 = T1.map((v) => v / tl);
  const T2 = [L[1] * T1[2] - L[2] * T1[1], L[2] * T1[0] - L[0] * T1[2], L[0] * T1[1] - L[1] * T1[0]];
  return SUN_DISK.map(([u, v]) => {
    const d = [L[0] + (T1[0] * u + T2[0] * v) * SUN_R, L[1] + (T1[1] * u + T2[1] * v) * SUN_R, L[2] + (T1[2] * u + T2[2] * v) * SUN_R];
    const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l];
  });
}
function sunVis(w, px, py, pz, skip, withGuard) {
  const D = w.sunDirs, G = w.guard.shapes;
  const test = (d) => prismBlocks(w.prisms, px, py, pz, d[0], d[1], d[2], skip) || (withGuard && hitGuard(G, px, py, pz, d[0], d[1], d[2], 20, true).s !== null);
  let s = 0;
  for (let i = NSUN - 4; i < NSUN; i++) s += test(D[i]) ? 0 : 1;
  if (s === 0 || s === 4) return s / 4;
  for (let i = 0; i < NSUN - 4; i++) s += test(D[i]) ? 0 : 1;
  return s / NSUN;
}

const FLOOR_RES = 0.05, FACE_RES = 0.06;
function bakeLight(w) {
  w.sunDirs = sunDirs(w.sun);
  const nearGuard = (x, z) => Math.hypot(x - w.G[0], z - w.G[1]) < 3.4;
  const nx = Math.round(w.YW / FLOOR_RES) + 1, nz = Math.round(w.YH / FLOOR_RES) + 1;
  const sunF = new Float32Array(nx * nz), aoF = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = i * FLOOR_RES, z = j * FLOOR_RES;
    sunF[j * nx + i] = sunVis(w, x, 0.002, z, -1, nearGuard(x, z));
    let ao = 1;
    for (const P of w.prisms) {
      const dx = Math.max(P.x0 - x, 0, x - P.x1), dz = Math.max(P.z0 - z, 0, z - P.z1), d = Math.hypot(dx, dz);
      ao *= 1 - 0.34 * Math.exp(-d / 0.22);
    }
    const gd = Math.hypot(x - w.G[0], z - w.G[1]);
    ao *= 1 - 0.45 * Math.exp(-(gd * gd) / 0.035);
    aoF[j * nx + i] = ao;
  }
  w.floorLM = { nx, nz, sun: sunF, ao: aoF };
  for (let pi = 0; pi < w.prisms.length; pi++) {
    const P = w.prisms[pi];
    P.faces = [];
    for (let f = 0; f < 4; f++) {
      const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][f];
      const lenU = f % 2 === 0 ? P.x1 - P.x0 : P.z1 - P.z0;
      const nu = Math.max(2, Math.ceil(lenU / FACE_RES) + 1), nv = Math.max(2, Math.ceil(P.h / FACE_RES) + 1);
      const ndl = n[0] * w.sun[0] + n[1] * w.sun[2];
      const arr = new Float32Array(nu * nv);
      const seen = P.kind === 'stack' || (P.side === 0 && f === 2) || (P.side === 1 && f === 3) || (P.side === 2 && f === 0) || (P.side === 3 && f === 1);
      if (ndl > 0 && seen) {
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          const u = Math.min(lenU, i * FACE_RES), v = Math.min(P.h, j * FACE_RES);
          let x, z;
          if (f === 0) { x = P.x0 + u; z = P.z0 - 0.003; } else if (f === 2) { x = P.x0 + u; z = P.z1 + 0.003; }
          else if (f === 1) { x = P.x1 + 0.003; z = P.z0 + u; } else { x = P.x0 - 0.003; z = P.z0 + u; }
          arr[j * nu + i] = sunVis(w, x, v, z, pi, nearGuard(x, z));
        }
      }
      P.faces.push({ nu, nv, lenU, ndl: Math.max(0, ndl), sun: arr });
    }
  }
}
function bilerp(arr, nx, ny, fx, fy) {
  fx = Math.max(0, Math.min(nx - 1.001, fx)); fy = Math.max(0, Math.min(ny - 1.001, fy));
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * nx + ix;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + nx] * (1 - tx) + arr[i + nx + 1] * tx) * ty;
}

const SUN_COL = [1.32, 1.22, 1.06], SKY_AMB = [0.34, 0.39, 0.47], GND_AMB = [0.2, 0.18, 0.15];
const EXPO = 1.0;
const DEFAULT_LT = { sun: SUN_COL, sky: SKY_AMB, gnd: GND_AMB, expo: EXPO };

const FLOOR_A = lin('#bdb7ab'), FLOOR_B = lin('#a9a397'), JOINT = lin('#6d675e');
function floorColor(x, z, fp, out) {
  const ix = Math.floor(x / C), iz = Math.floor(z / C);
  const tone = hash2(ix + 31, iz + 17);
  const n = fbm(x * 1.3 + 11, z * 1.3 - 7, 3, fp * 1.3), g = fbm(x * 9, z * 9, 2, fp * 9);
  const t = 0.2 + 0.35 * tone + 0.35 * n + 0.1 * g;
  out[0] = FLOOR_A[0] + (FLOOR_B[0] - FLOOR_A[0]) * t; out[1] = FLOOR_A[1] + (FLOOR_B[1] - FLOOR_A[1]) * t; out[2] = FLOOR_A[2] + (FLOOR_B[2] - FLOOR_A[2]) * t;
  const j = Math.max(lineMask(x, C, 0.009, fp), lineMask(z, C, 0.009, fp));
  if (j > 0) { const k = 0.8 * j; out[0] += (JOINT[0] - out[0]) * k; out[1] += (JOINT[1] - out[1]) * k; out[2] += (JOINT[2] - out[2]) * k; }
}
const MORTAR = lin('#9d968b');
function wallColor(P, u, v, fp, out) {
  const T = P.tint;
  if (v > P.h - 0.07) { const k = 1.06; out[0] = T[0] * k; out[1] = T[1] * k; out[2] = T[2] * k; if (v < P.h - 0.06) { out[0] *= 0.75; out[1] *= 0.75; out[2] *= 0.75; } return; }
  const row = Math.floor(v / 0.2), off = (row % 2) * 0.2, col = Math.floor((u + off) / 0.4);
  const tone = 0.9 + 0.14 * hash2(col + P.side * 1000, row) + 0.08 * (fbm(u * 2, v * 2, 2, fp * 2) - 0.5);
  const dirt = 1 - 0.22 * Math.exp(-v / 0.35) - 0.05 * fbm(u * 0.8, v * 3, 2, fp);
  out[0] = T[0] * tone * dirt; out[1] = T[1] * tone * dirt; out[2] = T[2] * tone * dirt;
  const mm = Math.max(lineMask(v, 0.2, 0.006, fp), lineMask(u + off, 0.4, 0.006, fp));
  if (mm > 0) { const k = 0.75 * mm; out[0] += (MORTAR[0] * dirt - out[0]) * k; out[1] += (MORTAR[1] * dirt - out[1]) * k; out[2] += (MORTAR[2] * dirt - out[2]) * k; }
}
const WOOD_L = lin('#c79c69'), WOOD_D = lin('#9a6f43'), WOOD_GAP = lin('#3b2a1b');
function crateColor(P, f, u, v, fp, out) {
  const top = v > P.split;
  const v0 = top ? P.split : 0, v1 = top ? P.h : P.split, lv = v - v0, H = v1 - v0;
  const len = f % 2 === 0 ? P.x1 - P.x0 : P.z1 - P.z0;
  const fr = 0.085;
  const inFrame = u < fr || u > len - fr || lv < fr || lv > H - fr;
  const sd = P.seed + (top ? 7 : 0) + f * 3;
  let base;
  const toneP = (P.tone - 0.5) * 0.25;
  if (inFrame) {
    const t = 0.45 + toneP + 0.25 * hash2(sd, 5) + 0.2 * fbm(u * 3 + sd, v * 25, 2, fp * 25);
    base = mix3(WOOD_D, WOOD_L, Math.max(0, Math.min(1, t)));
  } else {
    const pl = Math.floor((lv - fr) / 0.135);
    const t = 0.55 + toneP + 0.3 * (hash2(sd + pl * 13, pl) - 0.5) + 0.25 * fbm(u * 30 + pl * 3, lv * 3 + sd, 2, fp * 30) - 0.1;
    base = mix3(WOOD_D, WOOD_L, Math.max(0, Math.min(1, t)));
    const gap = lineMask(lv - fr, 0.135, 0.005, fp);
    if (gap > 0) base = mix3(base, WOOD_GAP, 0.8 * gap);
  }
  const edge = Math.max(lineMask(u - fr, 1e3, 0.004, fp), lineMask(u - (len - fr), 1e3, 0.004, fp),
    lineMask(lv - fr, 1e3, 0.004, fp), lineMask(lv - (H - fr), 1e3, 0.004, fp));
  if (edge > 0) base = mix3(base, WOOD_GAP, 0.55 * edge);
  const seam = lineMask(v - P.split, 1e3, 0.012, fp);
  if (seam > 0) base = mix3(base, WOOD_GAP, 0.9 * seam);
  out[0] = base[0]; out[1] = base[1]; out[2] = base[2];
}
const CARD_L = lin('#caa271'), CARD_D = lin('#a77d4c'), TAPE = lin('#d9c08e'), PALLET = lin('#7a6248'), PAL_GAP = lin('#2a2119');
function boxesColor(P, f, u, v, fp, out) {
  const top = v > P.split;
  const v0 = top ? P.split : 0, lv = v - v0;
  const sd = P.seed + (top ? 5 : 0) + f * 11;
  let base;
  if (lv < 0.14) {
    const blk = Math.abs(((u / 0.42) % 1) - 0.5) < 0.17;
    const deck = lv > 0.105 || lv < 0.025;
    base = deck || blk ? mix3(PALLET, WOOD_L, 0.25 * hash2(sd, Math.floor(u / 0.42))) : PAL_GAP;
  } else {
    const bw = 0.4, bh = 0.32, rv = lv - 0.14, row = Math.floor(rv / bh), cu = Math.floor((u + (row % 2) * 0.2) / bw);
    const t = 0.35 + 0.35 * hash2(sd + cu, row) + 0.2 * fbm(u * 6, v * 6, 2, fp * 6) + (P.tone - 0.5) * 0.3;
    base = mix3(CARD_D, CARD_L, Math.max(0, Math.min(1, t)));
    const ty = (rv % bh) / bh;
    if (Math.abs(ty - 0.5) < 0.035) base = mix3(base, TAPE, 0.45);
    const seam = Math.max(lineMask(rv, bh, 0.004, fp), lineMask(u + (row % 2) * 0.2, bw, 0.004, fp));
    if (seam > 0) base = mix3(base, PAL_GAP, 0.6 * seam);
    const sheen = 0.04 * Math.max(0, Math.sin(v * 2.1 + u * 0.7 + sd));
    base = [base[0] + sheen, base[1] + sheen, base[2] + sheen];
  }
  out[0] = base[0]; out[1] = base[1]; out[2] = base[2];
}
const SKY_H = lin('#e3e8ec'), SKY_Z = lin('#7fa6cf');
function skyColor(dx, dy, dz, out) {
  const t = Math.max(0, Math.min(1, dy * 1.6));
  const s = Math.pow(t, 0.7);
  out[0] = SKY_H[0] + (SKY_Z[0] - SKY_H[0]) * s; out[1] = SKY_H[1] + (SKY_Z[1] - SKY_H[1]) * s; out[2] = SKY_H[2] + (SKY_Z[2] - SKY_H[2]) * s;
  if (dy > 0.02) {
    const k = 1 / (dy + 0.15), cx = dx * k * 1.4, cz = dz * k * 1.4;
    const c = Math.max(0, fbm(cx + 3, cz - 5, 4) - 0.52) * 2.6 * Math.min(1, dy * 6);
    out[0] += (1.02 - out[0]) * c; out[1] += (1.02 - out[1]) * c; out[2] += (1.04 - out[2]) * c;
  }
}

const COL = new Float64Array(3);
export function renderView(w, pose, W, H, q, horizon = 0.46, look = null) {
  const LT = look ? look.light : DEFAULT_LT, SUN_COL = LT.sun, SKY_AMB = LT.sky, GND_AMB = LT.gnd, EXPO = LT.expo;
  const floorC = look ? look.floor : floorColor, wallC = look ? look.wall : wallColor;
  const stackC = look ? look.stack : null, skyC = look ? look.sky : null;
  const Wd = Math.round(W * q), Hd = Math.round(H * q);
  const f = (Wd / 2) / Math.tan(HFOV / 2), cx = Wd / 2, cy = Hd * horizon;
  const Fx = Math.sin(pose.ang), Fz = -Math.cos(pose.ang), Rx = -Fz, Rz = Fx;
  const Ex = pose.x, Ez = pose.z;
  const rgb = new Float32Array(Wd * Hd * 3), depth = new Float32Array(Wd * Hd).fill(Infinity);
  const prisms = w.prisms, NP = prisms.length;
  const tE = new Float64Array(NP), face = new Int8Array(NP), order = new Int32Array(NP);
  const filled = new Uint8Array(Hd);
  const L = w.sun, LM = w.floorLM;
  for (let x = 0; x < Wd; x++) {
    const a = (x + 0.5 - cx) / f;
    const Dx = Fx + a * Rx, Dz = Fz + a * Rz;
    let n = 0;
    for (let i = 0; i < NP; i++) {
      const P = prisms[i];
      let lo = -Infinity, hi = Infinity, fa = -1;
      if (Math.abs(Dx) < 1e-12) { if (Ex < P.x0 || Ex > P.x1) continue; } else {
        let t0 = (P.x0 - Ex) / Dx, t1 = (P.x1 - Ex) / Dx, fx = 3;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; fx = 1; }
        lo = t0; hi = t1; fa = fx;
      }
      if (Math.abs(Dz) < 1e-12) { if (Ez < P.z0 || Ez > P.z1) continue; } else {
        let t0 = (P.z0 - Ez) / Dz, t1 = (P.z1 - Ez) / Dz, fz = 0;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; fz = 2; }
        if (t0 > lo) { lo = t0; fa = fz; }
        if (t1 < hi) hi = t1;
      }
      if (lo > hi || hi <= 0.01 || lo <= 0.01) continue;
      tE[i] = lo; face[i] = fa; order[n++] = i;
    }
    for (let i = 1; i < n; i++) { const v = order[i]; let j = i - 1; while (j >= 0 && tE[order[j]] > tE[v]) { order[j + 1] = order[j]; j--; } order[j + 1] = v; }
    filled.fill(0);
    const dl = Math.hypot(Dx, Dz);
    for (let k = 0; k < n; k++) {
      const i = order[k], P = prisms[i], t = tE[i], fi = face[i];
      const yTop = cy - f * (P.h - EYE) / t, yBot = cy + f * EYE / t;
      const y0 = Math.max(0, Math.ceil(yTop - 0.5)), y1 = Math.min(Hd - 1, Math.floor(yBot - 0.5));
      if (y1 < y0) continue;
      const hx = Ex + t * Dx, hz = Ez + t * Dz;
      const Fc = P.faces[fi];
      const u = fi % 2 === 0 ? hx - P.x0 : hz - P.z0;
      const fp = t * dl / f;
      for (let y = y0; y <= y1; y++) {
        if (filled[y]) continue;
        filled[y] = 1;
        const v = EYE + (cy - (y + 0.5)) * t / f;
        if (P.kind === 'wall') wallC(P, fi % 2 === 0 ? hx : hz, v, fp, COL);
        else if (stackC) stackC(P, fi, u, v, fp, COL);
        else if (P.style === 1) boxesColor(P, fi, u, v, fp, COL);
        else crateColor(P, fi, u, v, fp, COL);
        const sv = Fc.ndl > 0 ? bilerp(Fc.sun, Fc.nu, Fc.nv, u / Fc.lenU * (Fc.nu - 1), v / P.h * (Fc.nv - 1)) : 0;
        const ao = (1 - 0.32 * Math.exp(-v / 0.28)) * (P.kind === 'wall' ? 1 : 0.97);
        const dif = Fc.ndl * sv;
        const o = (y * Wd + x) * 3;
        rgb[o] = COL[0] * (SUN_COL[0] * dif + (SKY_AMB[0] * 0.55 + GND_AMB[0] * 0.5) * ao);
        rgb[o + 1] = COL[1] * (SUN_COL[1] * dif + (SKY_AMB[1] * 0.55 + GND_AMB[1] * 0.5) * ao);
        rgb[o + 2] = COL[2] * (SUN_COL[2] * dif + (SKY_AMB[2] * 0.55 + GND_AMB[2] * 0.5) * ao);
        depth[y * Wd + x] = t;
      }
    }
    for (let y = 0; y < Hd; y++) {
      if (filled[y]) continue;
      const o = (y * Wd + x) * 3, yc = y + 0.5;
      if (yc > cy) {
        const t = f * EYE / (yc - cy);
        const fx = Ex + t * Dx, fz = Ez + t * Dz;
        floorC(fx, fz, t * dl / f * 1.5, COL);
        const sv = bilerp(LM.sun, LM.nx, LM.nz, fx / FLOOR_RES, fz / FLOOR_RES), ao = bilerp(LM.ao, LM.nx, LM.nz, fx / FLOOR_RES, fz / FLOOR_RES);
        const dif = L[1] * sv;
        rgb[o] = COL[0] * (SUN_COL[0] * dif + SKY_AMB[0] * ao);
        rgb[o + 1] = COL[1] * (SUN_COL[1] * dif + SKY_AMB[1] * ao);
        rgb[o + 2] = COL[2] * (SUN_COL[2] * dif + SKY_AMB[2] * ao);
        depth[y * Wd + x] = t;
      } else {
        const b = (cy - yc) / f, l = Math.hypot(Dx, b, Dz);
        if (skyC) skyC(Dx / l, b / l, Dz / l, COL, Ex, Ez, dl / f);
        else skyColor(Dx / l, b / l, Dz / l, COL);
        rgb[o] = COL[0]; rgb[o + 1] = COL[1]; rgb[o + 2] = COL[2];
      }
    }
  }
  drawGuard(w, { Ex, Ez, Fx, Fz, Rx, Rz, f, cx, cy, Wd, Hd }, rgb, depth, LT);
  const data = new Uint8ClampedArray(Wd * Hd * 4);
  for (let i = 0, j = 0; i < Wd * Hd; i++, j += 3) {
    for (let c = 0; c < 3; c++) {
      let v = rgb[j + c] * EXPO; v = v / (1 + 0.12 * v);
      data[i * 4 + c] = 255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
    }
    data[i * 4 + 3] = 255;
  }
  return { data, w: Wd, h: Hd };
}

function drawGuard(w, cam, rgb, depth, LT) {
  const SUN_COL = LT.sun, SKY_AMB = LT.sky, GND_AMB = LT.gnd, GMAT = w.gmat;
  const { Ex, Ez, Fx, Fz, Rx, Rz, f, cx, cy, Wd, Hd } = cam;
  const bb = w.guard.bb, G = w.guard.shapes;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, front = 0, zmin = Infinity;
  for (let c = 0; c < 8; c++) {
    const px = (c & 1 ? bb[3] : bb[0]) - Ex, py = (c & 2 ? bb[4] : bb[1]) - EYE, pz = (c & 4 ? bb[5] : bb[2]) - Ez;
    const zc = px * Fx + pz * Fz, xr = px * Rx + pz * Rz;
    if (zc < 0.05) { if (xr > 0) x1 = Infinity; else x0 = -Infinity; continue; }
    front++; zmin = Math.min(zmin, zc);
    const sx = cx + f * xr / zc, sy = cy - f * py / zc;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (!front) return;
  if (front < 8) { const zz = Math.max(0.3, zmin); y0 = Math.min(y0, cy - f * (bb[4] - EYE) / zz); y1 = Math.max(y1, cy + f * (EYE - bb[1]) / zz); }
  const X0 = Math.max(0, Math.floor(x0) - 1), X1 = Math.min(Wd - 1, Math.ceil(x1) + 1);
  const Y0 = Math.max(0, Math.floor(y0) - 1), Y1 = Math.min(Hd - 1, Math.ceil(y1) + 1);
  if (X0 > X1 || Y0 > Y1) return;
  const L = w.sun, prisms = w.prisms, acc = [0, 0, 0];
  const SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    let cov = 0; acc[0] = acc[1] = acc[2] = 0;
    const zScene = depth[y * Wd + x];
    for (const [sx, sy] of SS) {
      const a = (x + sx - cx) / f, b = (cy - (y + sy)) / f;
      let dx = Fx + a * Rx, dy = b, dz = Fz + a * Rz;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const h = hitGuard(G, Ex, EYE, Ez, dx, dy, dz, 60);
      if (!h.s) continue;
      const zc = h.t * (dx * Fx + dz * Fz);
      if (zc >= zScene) continue;
      cov++;
      const hx = Ex + h.t * dx, hy = EYE + h.t * dy, hz = Ez + h.t * dz;
      let nx = h.n[0], ny = h.n[1], nz = h.n[2];
      if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
      const mat = GMAT[h.s.m];
      let base = mat.c;
      if (mat.vest) {
        const rel = (hy - 0) / GUARD_H;
        if (Math.abs(rel - 0.63) < 0.016 || Math.abs(rel - 0.7) < 0.016) base = [0.62, 0.62, 0.6];
      }
      const ndl = nx * L[0] + ny * L[1] + nz * L[2];
      let vis = 0;
      if (ndl > 0) {
        const ox = hx + nx * 0.004, oy = hy + ny * 0.004, oz = hz + nz * 0.004;
        vis = prismBlocks(prisms, ox, oy, oz, L[0], L[1], L[2], -1) ? 0 : 1;
        if (vis && hitGuard(G, ox, oy, oz, L[0], L[1], L[2], 5, true).s) vis = 0;
      }
      const hemi = 0.5 + 0.5 * ny, ao = 0.72 + 0.28 * Math.min(1, hy / 0.6);
      const dif = Math.max(0, ndl) * vis;
      let sp = 0;
      if (mat.ks > 0 && vis > 0) {
        let hx2 = L[0] - dx, hy2 = L[1] - dy, hz2 = L[2] - dz; const hl = Math.hypot(hx2, hy2, hz2);
        sp = mat.ks * Math.pow(Math.max(0, (nx * hx2 + ny * hy2 + nz * hz2) / hl), mat.sh);
      }
      for (let c = 0; c < 3; c++) {
        const amb = (GND_AMB[c] + (SKY_AMB[c] * 1.25 - GND_AMB[c]) * hemi) * ao;
        acc[c] += base[c] * (SUN_COL[c] * dif + amb) + SUN_COL[c] * sp;
      }
    }
    if (!cov) continue;
    const o = (y * Wd + x) * 3, k = cov / 4;
    for (let c = 0; c < 3; c++) rgb[o + c] = rgb[o + c] * (1 - k) + (acc[c] / cov) * k;
  }
}
