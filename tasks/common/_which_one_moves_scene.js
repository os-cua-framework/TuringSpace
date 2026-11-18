import * as RT from './_which_one_moves_rt.js';

export const VIEW = { w: 380, h: 384 };
export const FOV = 42;
const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const KINDS = {
  car: { movable: true, r: 0.36, h: 0.37 },
  ball: { movable: true, r: 0.27, h: 0.5 },
  robot: { movable: true, r: 0.42, h: 0.47 },
  cone: { r: 0.2, h: 0.66 },
  box: { r: 0.36, h: 0.46 },
  crate: { r: 0.37, h: 0.42 },
  chair: { r: 0.34, h: 0.84 },
  bucket: { r: 0.18, h: 0.31 },
  plant: { r: 0.3, h: 0.8 },
  bin: { r: 0.28, h: 0.84 },
  barrel: { r: 0.29, h: 0.88 },
  lamp: { r: 0.2, h: 2.4 },
};
export const MOVABLE = ['car', 'ball', 'robot'];
export const STATIC_KINDS = ['cone', 'box', 'crate', 'chair', 'bucket', 'plant', 'bin', 'barrel'];
export const PAINT = ['#d23a2e', '#2b63c6', '#f0b41d', '#2d9a4c', '#7b4cc0', '#ee7a22', '#2ba3b3', '#e9e5dd'];
export const FLOORS = [
  { a: '#b9b6ae', b: '#a29e95', g: '#7f7b73' },
  { a: '#cbb898', b: '#b49f7f', g: '#8a7860' },
  { a: '#a9aeb3', b: '#8f959c', g: '#6e7379' },
  { a: '#b9735a', b: '#9f5c46', g: '#6f4a3d' },
];

export function loopPhase(m, tau) {
  if (!(tau > 0) || tau >= m.Lm) return 0;
  const w = 2 * Math.PI * tau / m.Lm, sw = Math.sin(w);
  return (2.5 * w - 4 * sw + 0.75 * Math.sin(2 * w) + sw * sw * sw / 3) / 2.5;
}

export function homeBasis(m) {
  const C = m.cam, p = C.pivot, a = C.az * DEG, e = C.el * DEG;
  const eye = [p[0] + C.dist * Math.sin(a) * Math.cos(e), p[1] + C.dist * Math.sin(e), p[2] + C.dist * Math.cos(a) * Math.cos(e)];
  let F = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; const fl = Math.hypot(...F); F = F.map((v) => v / fl);
  let R = [-F[2], 0, F[0]]; const rl = Math.hypot(...R); R = R.map((v) => v / rl);
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  return { eye, F, R, U: U[1] < 0 ? U.map((v) => -v) : U };
}
export function camPose(m, tau) {
  const B = homeBasis(m), Lp = m.cam.loop, ph = loopPhase(m, tau);
  if (ph === 0) return { eye: B.eye, tgt: m.cam.pivot.slice() };
  const c = Math.cos(Lp.psi + Lp.s * ph) - Math.cos(Lp.psi), d = Math.sin(Lp.psi + Lp.s * ph) - Math.sin(Lp.psi);
  const eye = B.eye.map((v, i) => v + Lp.a * c * B.R[i] + Lp.a * Lp.k * d * B.U[i]);
  return { eye, tgt: m.cam.pivot.slice() };
}
export function camAt(m, tau) {
  const P = camPose(m, tau);
  return RT.makeCam({ eye: P.eye, target: P.tgt, fovY: m.cam.fov ?? FOV, W: VIEW.w, H: VIEW.h });
}

const ACC = 0.15;
const smooth = (v) => {
  const x = clamp01(v), a = ACC;
  const g = x < a ? (x * x) / (2 * a) : x <= 1 - a ? a / 2 + (x - a) : (1 - a) - ((1 - x) * (1 - x)) / (2 * a);
  return g / (1 - a);
};
export const RAMP_PEAK = 1 / (1 - ACC);
export function excursion(mv, tau) {
  const v = tau - mv.w0, W = 2 * mv.r + mv.d;
  if (!(v > 0) || v >= W) return 0;
  if (v < mv.r) return smooth(v / mv.r);
  if (v <= mv.r + mv.d) return 1;
  return smooth((W - v) / mv.r);
}
export const windowOf = (mv) => [mv.w0, mv.w0 + 2 * mv.r + mv.d];
export function poseAt(m, o, tau) {
  if (!o.move) return { x: o.x, z: o.z, yaw: o.yaw, roll: 0 };
  const s = o.move.X * excursion(o.move, tau);
  return { x: o.x + o.move.hx * s, z: o.z + o.move.hz * s, yaw: o.yaw, roll: o.kind === 'ball' ? s / o.br : 0 };
}
export const heightOf = (o) => (o.kind === 'ball' ? 2 * o.br : o.kind === 'lamp' ? o.lh : KINDS[o.kind].h * o.s);
export const radiusOf = (o) => (o.kind === 'ball' ? o.br + 0.04 : KINDS[o.kind].r * (o.kind === 'lamp' ? 1 : o.s));
export const centreAt = (m, o, tau) => { const P = poseAt(m, o, tau); return [P.x, heightOf(o) / 2, P.z]; };

const mixInto = RT.mixInto;
function shade(hex, k) { const c = RT.lin(hex); return [c[0] * k, c[1] * k, c[2] * k]; }
const MATS = new WeakMap();
export function matsFor(m) {
  if (MATS.has(m)) return MATS.get(m);
  const mats = [], at = (def) => { mats.push(def); return mats.length - 1; };
  const per = m.objs.map((o) => {
    const c = RT.lin(o.col);
    switch (o.kind) {
      case 'car': return {
        body: at({ c, ks: 0.45, sh: 48, env: 0.18 }), glass: at({ c: RT.lin('#26313b'), ks: 0.6, sh: 70, env: 0.3 }),
        tyre: at({ c: RT.lin('#1d1d1f'), ks: 0.05, sh: 8 }), hub: at({ c: RT.lin('#c9ccd0'), ks: 0.4, sh: 30 }),
        trim: at({ c: RT.lin('#2a2a2c'), ks: 0.1, sh: 10 }) };
      case 'robot': return {
        body: at({ c, ks: 0.2, sh: 24 }), lid: at({ c: shade(o.col, 0.86), ks: 0.25, sh: 24 }),
        face: at({ c: RT.lin('#1e2226'), ks: 0.5, sh: 60, env: 0.25 }), tyre: at({ c: RT.lin('#232325'), ks: 0.05, sh: 8 }),
        pole: at({ c: RT.lin('#d8d8d8'), ks: 0.2, sh: 20 }), flag: at({ c: RT.lin('#f26a1b'), ks: 0.05, sh: 8 }) };
      case 'ball': {
        const A = c, B = RT.lin(o.col2 || '#f4f1ea'), W = RT.lin('#f4f1ea');
        return { ball: at({ c, ks: 0.35, sh: 40, tex: (x, y, z, nx, ny, nz, s, out) => {
          const b = s.ball; if (!b) { out[0] = A[0]; out[1] = A[1]; out[2] = A[2]; return; }
          const px = x - b.c[0], py = y - b.c[1], pz = z - b.c[2], M = b.M;
          const lx = M[0] * px + M[3] * py + M[6] * pz, ly = M[1] * px + M[4] * py + M[7] * pz, lz = M[2] * px + M[5] * py + M[8] * pz;
          const r = Math.hypot(lx, ly, lz) || 1;
          if (Math.abs(ly) / r > 0.86) { out[0] = W[0]; out[1] = W[1]; out[2] = W[2]; return; }
          const seg = Math.floor(((Math.atan2(lz, lx) / (2 * Math.PI)) + 1) * 6) % 6;
          const src = seg % 2 ? B : A; out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
        } }) };
      }
      case 'cone': {
        const O = RT.lin('#e4581d'), Wt = RT.lin('#efeeea'), H = KINDS.cone.h * o.s;
        return { cone: at({ c: O, ks: 0.25, sh: 24, tex: (x, y, z, nx, ny, nz, s, out) => {
          const u = y / H, band = (u > 0.42 && u < 0.56) || (u > 0.7 && u < 0.78);
          const src = band ? Wt : O; out[0] = src[0]; out[1] = src[1]; out[2] = src[2]; } }),
          base: at({ c: RT.lin('#b8410f'), ks: 0.1, sh: 10 }) };
      }
      case 'box': {
        const K = RT.lin(o.col), Tp = RT.lin('#d6c39b');
        return { box: at({ c: K, ks: 0.04, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
          const [lx, lz] = RT.boxLocal(s, x, z), n = RT.fbm(lx * 9 + 3, (y + lz) * 9, 2);
          mixInto(out, K, shade(o.col, 0.86), n * 0.7);
          if (ny > 0.5 && Math.abs(lz) < 0.045) mixInto(out, out, Tp, 0.85);
          if (ny < 0.5 && Math.abs(Math.abs(nx) > 0.5 ? lz : lx) < 0.045 && y > s.cy + s.hy - 0.08) mixInto(out, out, Tp, 0.85);
        } }) };
      }
      case 'crate': {
        const K = RT.lin(o.col), D = shade(o.col, 0.62);
        return { crate: at({ c: K, ks: 0.04, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
          const [lx, lz] = RT.boxLocal(s, x, z), g = RT.fbm(lx * 22 + y * 3, lz * 22 + y * 3, 2);
          mixInto(out, K, shade(o.col, 0.8), g);
          if (ny < 0.5) {
            const v = (y - (s.cy - s.hy)) / (2 * s.hy), slat = Math.abs(((v * 4) % 1) - 0.5) > 0.44;
            const u = Math.abs(nx) > 0.5 ? Math.abs(lz) / s.hz : Math.abs(lx) / s.hx;
            if (slat || u > 0.86) mixInto(out, out, D, 0.75);
          } else if (Math.abs(lx) > s.hx * 0.86 || Math.abs(lz) > s.hz * 0.86) mixInto(out, out, D, 0.6);
        } }) };
      }
      case 'chair': return { chair: at({ c, ks: 0.25, sh: 30 }) };
      case 'bucket': return { bucket: at({ c, ks: 0.3, sh: 30 }), rim: at({ c: shade(o.col, 0.7), ks: 0.3, sh: 30 }) };
      case 'plant': {
        const G0 = RT.lin('#3f7a31'), G1 = RT.lin('#6a9e45'), G2 = RT.lin('#2e5a25');
        return { pot: at({ c: RT.lin('#b4613d'), ks: 0.06, sh: 10 }),
          leaf: at({ c: G0, ks: 0.08, sh: 12, tex: (x, y, z, nx, ny, nz, s, out) => {
            const n = RT.fbm(x * 14 + 5, z * 14 + y * 9, 3), sp = RT.fbm(x * 40, y * 40 + z * 31, 1);
            mixInto(out, G2, G1, n); if (sp > 0.72) mixInto(out, out, G2, 0.6); } }) };
      }
      case 'bin': {
        const K = RT.lin(o.col), D = shade(o.col, 0.72);
        return { bin: at({ c: K, ks: 0.3, sh: 30, tex: (x, y, z, nx, ny, nz, s, out) => {
          const a = Math.atan2(z - (s.cz ?? 0), x - (s.cx ?? 0)), rib = Math.abs(((a / (2 * Math.PI) * 18) % 1 + 1) % 1 - 0.5) > 0.4;
          const src = rib && ny < 0.5 ? D : K; out[0] = src[0]; out[1] = src[1]; out[2] = src[2]; } }),
          lid: at({ c: shade(o.col, 0.8), ks: 0.35, sh: 30 }) };
      }
      case 'barrel': {
        const K = RT.lin(o.col), D = shade(o.col, 0.66), H = KINDS.barrel.h * o.s;
        return { barrel: at({ c: K, ks: 0.35, sh: 34, tex: (x, y, z, nx, ny, nz, s, out) => {
          const u = y / H, rib = ny < 0.5 && (Math.abs(u - 0.33) < 0.025 || Math.abs(u - 0.66) < 0.025);
          const src = rib ? D : K; out[0] = src[0]; out[1] = src[1]; out[2] = src[2]; } }) };
      }
      case 'lamp': return {
        pole: at({ c, ks: 0.3, sh: 30 }), glass: at({ c: RT.lin(o.col2 || '#f6e7b4'), ks: 0.5, sh: 60, env: 0.2 }),
        cap: at({ c: shade(o.col, 0.85), ks: 0.3, sh: 30 }) };
      default: throw new Error('which_one_moves: unknown kind ' + o.kind);
    }
  });
  const res = { mats, per };
  MATS.set(m, res);
  return res;
}

const S = RT.shape;
function rot(axis, ang) {
  const [x, y, z] = axis, c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
function mul(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
export function headingVec(yaw) { const a = yaw * DEG; return [Math.cos(a), Math.sin(a)]; }
const boxYaw = (h) => Math.atan2(-h[1], h[0]) / DEG;

export function objShapes(m, o, P, out) {
  const mp = matsFor(m).per[o.id], id = o.id, s = o.s, x = P.x, z = P.z;
  const h = headingVec(P.yaw), v = [-h[1], h[0]], by = boxYaw(h);
  const at = (a, b, yy) => [x + h[0] * a + v[0] * b, yy, z + h[1] * a + v[1] * b];
  switch (o.kind) {
    case 'car': {
      const L = 0.31 * s, Wd = 0.17 * s, wr = 0.095 * s, ww = 0.035 * s;
      out.push(S.box(id, mp.body, x, wr + 0.075 * s, z, L, 0.07 * s, Wd - 0.01, by, 0.03 * s));
      const cb = at(-0.03 * s, 0, wr + 0.2 * s);
      out.push(S.box(id, mp.glass, cb[0], cb[1], cb[2], 0.15 * s, 0.055 * s, Wd * 0.78, by, 0.03 * s));
      const rf = at(-0.03 * s, 0, wr + 0.26 * s);
      out.push(S.box(id, mp.body, rf[0], rf[1], rf[2], 0.13 * s, 0.012 * s, Wd * 0.74, by, 0.008));
      const bp = at(L - 0.01, 0, wr + 0.035 * s);
      out.push(S.box(id, mp.trim, bp[0], bp[1], bp[2], 0.025 * s, 0.03 * s, Wd * 0.9, by, 0.01));
      for (const a of [-0.2 * s, 0.2 * s]) for (const sd of [-1, 1]) {
        const c0 = at(a, sd * (Wd + 0.01), wr), c1 = at(a, sd * (Wd + 0.01 + ww * 2), wr);
        out.push(S.gcyl(id, mp.tyre, c0, c1, wr));
        const h0 = at(a, sd * (Wd + 0.012 + ww * 2), wr), h1 = at(a, sd * (Wd + 0.018 + ww * 2), wr);
        out.push(S.gcyl(id, mp.hub, h0, h1, wr * 0.45));
      }
      return;
    }
    case 'robot': {
      const hx = 0.3 * s, hz = 0.2 * s, wr = 0.075 * s, y0 = wr + 0.02, hy = 0.17 * s;
      out.push(S.box(id, mp.body, x, y0 + hy, z, hx, hy, hz, by, 0.05 * s));
      const ld = at(0, 0, y0 + 2 * hy + 0.018 * s);
      out.push(S.box(id, mp.lid, ld[0], ld[1], ld[2], hx * 0.94, 0.02 * s, hz * 0.94, by, 0.02 * s));
      const fc = at(hx + 0.002, 0, y0 + hy * 1.35);
      out.push(S.box(id, mp.face, fc[0], fc[1], fc[2], 0.012, 0.045 * s, hz * 0.7, by, 0.008));
      for (const a of [-0.21 * s, 0, 0.21 * s]) for (const sd of [-1, 1]) {
        out.push(S.gcyl(id, mp.tyre, at(a, sd * (hz - 0.01), wr), at(a, sd * (hz + 0.045 * s), wr), wr));
      }
      const pb = at(-hx * 0.8, hz * 0.7, y0 + 2 * hy + 0.03), pt = at(-hx * 0.8, hz * 0.7, y0 + 2 * hy + 0.62 * s);
      out.push(S.gcyl(id, mp.pole, pb, pt, 0.009 * s));
      const fl = at(-hx * 0.8 - 0.07 * s, hz * 0.7, y0 + 2 * hy + 0.56 * s);
      out.push(S.box(id, mp.flag, fl[0], fl[1], fl[2], 0.065 * s, 0.045 * s, 0.006, by, 0));
      return;
    }
    case 'ball': {
      const r = o.br, ax = o.move ? [o.move.hz, 0, -o.move.hx] : [0, 0, 1];
      const M0 = mul(rot([0, 1, 0], o.yaw * DEG), rot([1, 0, 0], (o.tilt ?? 25) * DEG));
      const M = mul(rot(ax, P.roll || 0), M0);
      const sh = S.sphere(id, mp.ball, x, r, z, r);
      sh.ball = { c: [x, r, z], M };
      out.push(sh);
      return;
    }
    case 'cone': {
      const H = KINDS.cone.h * s;
      out.push(S.box(id, mp.base, x, 0.016, z, 0.19 * s, 0.016, 0.19 * s, P.yaw, 0.01));
      out.push(S.frustum(id, mp.cone, x, z, 0.03, H, 0.155 * s, 0.028 * s));
      return;
    }
    case 'box': {
      const hx = 0.27 * s * (o.ax ?? 1), hz = 0.21 * s / (o.ax ?? 1), hy = 0.23 * s;
      out.push(S.box(id, mp.box, x, hy, z, hx, hy, hz, P.yaw, 0.012));
      return;
    }
    case 'crate': {
      const hx = 0.26 * s, hz = 0.24 * s, hy = 0.21 * s;
      out.push(S.box(id, mp.crate, x, hy, z, hx, hy, hz, P.yaw, 0.01));
      return;
    }
    case 'chair': {
      const hs = 0.21 * s, sy = 0.44 * s, lr = 0.02 * s;
      out.push(S.box(id, mp.chair, x, sy, z, hs, 0.022 * s, hs, by, 0.02));
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const p0 = at(a * (hs - 0.03), b * (hs - 0.03), 0), p1 = at(a * (hs - 0.03), b * (hs - 0.03), sy);
        out.push(S.gcyl(id, mp.chair, p0, p1, lr));
      }
      const bk = at(-hs + 0.02, 0, sy + 0.2 * s);
      out.push(S.box(id, mp.chair, bk[0], bk[1], bk[2], 0.02 * s, 0.17 * s, hs * 0.95, by, 0.02));
      for (const b of [-1, 1]) {
        const p0 = at(-hs + 0.02, b * (hs - 0.03), sy), p1 = at(-hs + 0.02, b * (hs - 0.03), sy + 0.06 * s);
        out.push(S.gcyl(id, mp.chair, p0, p1, lr));
      }
      return;
    }
    case 'bucket': {
      const H = KINDS.bucket.h * s;
      out.push(S.frustum(id, mp.bucket, x, z, 0, H - 0.02, 0.12 * s, 0.155 * s));
      out.push(S.cyl(id, mp.rim, x, z, H - 0.025, H, 0.165 * s, 0.01));
      return;
    }
    case 'plant': {
      const ph = 0.32 * s;
      out.push(S.frustum(id, mp.pot, x, z, 0, ph, 0.13 * s, 0.18 * s));
      out.push(S.sphere(id, mp.leaf, x, ph + 0.21 * s, z, 0.25 * s));
      out.push(S.sphere(id, mp.leaf, x + 0.08 * s, ph + 0.33 * s, z - 0.05 * s, 0.17 * s));
      return;
    }
    case 'bin': {
      const H = KINDS.bin.h * s;
      const sh = S.cyl(id, mp.bin, x, z, 0, H - 0.04, 0.24 * s, 0);
      out.push(sh);
      out.push(S.cyl(id, mp.lid, x, z, H - 0.045, H, 0.262 * s, 0.02));
      return;
    }
    case 'barrel': {
      const H = KINDS.barrel.h * s;
      out.push(S.cyl(id, mp.barrel, x, z, 0, H, 0.26 * s, 0.03));
      return;
    }
    case 'lamp': {
      const H = o.lh, pr = 0.032;
      out.push(S.frustum(id, mp.pole, x, z, 0, 0.16, 0.12, 0.05));
      out.push(S.cyl(id, mp.pole, x, z, 0.15, H - 0.3, pr, 0));
      if (o.head) {
        out.push(S.sphere(id, mp.glass, x, H - 0.15, z, 0.13));
        out.push(S.cyl(id, mp.cap, x, z, H - 0.3, H - 0.25, 0.07, 0.01));
      } else {
        out.push(S.box(id, mp.glass, x, H - 0.17, z, 0.085, 0.12, 0.085, P.yaw, 0.01));
        out.push(S.frustum(id, mp.cap, x, z, H - 0.055, H, 0.15, 0.03));
        out.push(S.cyl(id, mp.cap, x, z, H - 0.31, H - 0.285, 0.1, 0.01));
      }
      return;
    }
    default: throw new Error('which_one_moves: unknown kind ' + o.kind);
  }
}

export function floorFn(m) {
  const F = m.floor, P = FLOORS[F.scheme], A = RT.lin(P.a), B = RT.lin(P.b), G = RT.lin(P.g);
  const a = F.yaw * DEG, ca = Math.cos(a), sa = Math.sin(a), T = F.tile, sd = F.seed | 0;
  return (x, z, fp, out) => {
    const u = x * ca - z * sa, w = x * sa + z * ca;
    const iu = Math.floor(u / T), iw = Math.floor(w / T);
    const tone = RT.hash2(iu + sd, iw - 3 * sd), n = RT.fbm(x * 2.2 + sd, z * 2.2, 3, fp * 2.2), gr = RT.fbm(x * 16, z * 16, 2, fp * 16);
    mixInto(out, A, B, clamp01(0.1 + 0.75 * tone + 0.45 * (n - 0.5) + 0.2 * (gr - 0.5)));
    const j = Math.max(RT.lineMask(u, T, 0.009, fp), RT.lineMask(w, T, 0.009, fp));
    if (j > 0) mixInto(out, out, G, 0.85 * j);
  };
}

export function lightFor(m) {
  const a = m.sun.az * DEG, e = m.sun.el * DEG, c = m.cam.az * DEG;
  return {
    dir: [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)], col: [1.16, 1.11, 1.02], soft: 0.045,
    sky: [0.4, 0.43, 0.5], ground: [0.18, 0.17, 0.15],
    fill: { dir: norm([Math.sin(c) * 0.8, 0.5, Math.cos(c) * 0.8]), col: [0.17, 0.17, 0.19] }, aoK: 0.85, contact: 0.3, contactH: 0.1,
  };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const SKY0 = RT.lin('#9fc0e2'), SKY1 = RT.lin('#e4edf5');
function sky(dx, dy, dz, out) { mixInto(out, SKY1, SKY0, clamp01(dy * 2.2 + 0.1)); }

export function sceneAt(m, tau, opts = {}) {
  const shapes = [];
  for (const o of m.objs) {
    if (opts.staticOnly && o.move) continue;
    objShapes(m, o, poseAt(m, o, tau), shapes);
  }
  const sc = RT.makeScene({ cam: opts.cam || camAt(m, tau), shapes, mats: matsFor(m).mats, light: lightFor(m),
    env: { floorY: 0, floor: floorFn(m), floorMat: { ks: 0, sh: 1 }, sky }, exposure: 1.0 });
  sc.dynIds = new Set(m.objs.filter((o) => o.move).map((o) => o.id));
  return sc;
}
export function bakeFor(m) {
  const sc = sceneAt(m, 0, { staticOnly: true });
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const o of m.objs) { if (o.move) continue; x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); z0 = Math.min(z0, o.z); z1 = Math.max(z1, o.z); }
  const pad = 3.2;
  return RT.bakeGround(sc, { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad }, 0.035);
}
export function frameScene(m, tau, bake) {
  const sc = sceneAt(m, tau);
  if (bake) sc.bake = bake;
  sc.fastObj = true;
  return sc;
}

export function project(cam, p) { const q = cam.project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }
export function screenBox(m, o, cam, P) {
  const shapes = []; objShapes(m, o, P, shapes);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zmin = Infinity;
  for (const s of shapes) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const q = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); zmin = Math.min(zmin, q.z);
    }
  }
  return [x0, y0, x1, y1, zmin];
}
