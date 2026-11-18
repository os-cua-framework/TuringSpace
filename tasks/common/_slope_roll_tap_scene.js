import { prim, add, sub, mul, dot, cross, norm, lin, fbm, vnoise, lookAt, buildIndex } from './_slope_roll_tap_ray.js';

const RAD = Math.PI / 180;
export const hvec = (deg) => [Math.sin(deg * RAD), 0, -Math.cos(deg * RAD)];
export const T_PLANK = 0.024;
export const RAMP_ID = 100, FLAT_ID = 101, BOOK_ID0 = 110;
export const POSE = Object.freeze({ acrossMin: 75, alongMax: 1.5, wheelMax: 15, cartAlongMax: 15, cartAcrossMin: 87 });

export const STY = Object.freeze({
  ball: [{ c: [214, 52, 46], band: [246, 240, 228] }, { c: [44, 104, 196], band: [248, 214, 72] }, { c: [52, 150, 84], band: [246, 244, 236] }, { c: [240, 132, 36], band: [40, 58, 110] }],
  can: [{ c: [196, 38, 42], band: [246, 238, 222] }, { c: [36, 118, 70], band: [242, 204, 64] }, { c: [34, 86, 168], band: [240, 240, 236] }, { c: [232, 138, 30], band: [70, 40, 30] }],
  wheel: [{ hub: [250, 196, 40] }, { hub: [232, 232, 226] }, { hub: [218, 62, 52] }, { hub: [70, 140, 220] }],
  cart: [{ c: [206, 46, 44] }, { c: [40, 110, 200] }, { c: [44, 150, 92] }, { c: [236, 170, 32] }],
  box: [{ c: [132, 88, 184] }, { c: [36, 160, 168] }, { c: [226, 96, 150] }, { c: [120, 124, 132] }],
});
export const BOOK_COLS = [[132, 34, 38], [34, 54, 104], [40, 94, 64], [196, 150, 52], [30, 120, 128], [110, 60, 110], [90, 92, 98]];
export const WOOD = [[226, 190, 140], [214, 170, 118]];

export function rampFrame(rp) {
  const th = rp.theta * RAD, dh = hvec(rp.beta), c = hvec(rp.beta + 90);
  const u = [-dh[0] * Math.cos(th), Math.sin(th), -dh[2] * Math.cos(th)];
  const n = [dh[0] * Math.sin(th), Math.cos(th), dh[2] * Math.sin(th)];
  const P0 = [rp.x, 0, rp.z];
  return { u, c, n, dh, P0, O: add(P0, mul(n, T_PLANK)), L: rp.L, W: rp.W, tilt: true };
}
export function flatFrame(fp) {
  const u = hvec(fp.yaw), c = hvec(fp.yaw + 90), n = [0, 1, 0];
  const C = [fp.x, T_PLANK, fp.z];
  return { u, c, n, O: sub(C, mul(u, fp.L / 2)), L: fp.L, W: fp.W, tilt: false };
}
export const plankFrame = (rd, pl) => (pl === 'R' ? rampFrame(rd.ramp) : flatFrame(rd.flat));
export const onPlank = (P, s, t, h = 0) => [P.O[0] + P.u[0] * s + P.c[0] * t + P.n[0] * h, P.O[1] + P.u[1] * s + P.c[1] * t + P.n[1] * h, P.O[2] + P.u[2] * s + P.c[2] * t + P.n[2] * h];
export function objFrame(P, ob) {
  const a = ob.phi * RAD;
  const f = norm(add(mul(P.u, Math.cos(a)), mul(P.c, Math.sin(a))));
  const g = norm(cross(P.n, f));
  return { f, g, n: P.n, B: onPlank(P, ob.s, ob.t) };
}
const at = (F, a, b, h) => [F.B[0] + F.f[0] * a + F.g[0] * b + F.n[0] * h, F.B[1] + F.f[1] * a + F.g[1] * b + F.n[1] * h, F.B[2] + F.f[2] * a + F.g[2] * b + F.n[2] * h];

export const CART = Object.freeze({ zb: 0.025, floorT: 0.007, wallH: 0.032, wallT: 0.005, rw: 0.022, ww: 0.012, handle: 0.05, handleUp: 38 });
export const RIM = 0.007, RIM_OUT = 0.0015, HUB_OUT = 0.003;
export function footprint(ob) {
  const z = ob.sz;
  switch (ob.k) {
    case 'ball': return [-z.r, z.r, -z.r, z.r];
    case 'can': return ob.p === 'lie' ? [-z.l / 2, z.l / 2, -(z.r + RIM_OUT), z.r + RIM_OUT] : [-(z.r + RIM_OUT), z.r + RIM_OUT, -(z.r + RIM_OUT), z.r + RIM_OUT];
    case 'wheel': return ob.p === 'stand' ? [-z.R, z.R, -(z.w / 2 + HUB_OUT), z.w / 2 + HUB_OUT] : [-z.R, z.R, -z.R, z.R];
    case 'cart': {
      const yo = z.W / 2 + 0.008 + CART.ww / 2 + 0.003;
      return [-z.L / 2 - 0.004, z.L / 2 + CART.handle * Math.cos(CART.handleUp * RAD) + 0.008, -yo, yo];
    }
    case 'box': return [-z.a / 2, z.a / 2, -z.a / 2, z.a / 2];
    default: throw new Error(`footprint: ${ob.k}`);
  }
}
export function objHeight(ob) {
  const z = ob.sz;
  switch (ob.k) {
    case 'ball': return 2 * z.r;
    case 'can': return ob.p === 'lie' ? 2 * (z.r + RIM_OUT) : z.l;
    case 'wheel': return ob.p === 'stand' ? 2 * z.R : z.w + HUB_OUT;
    case 'cart': return CART.zb + CART.floorT + CART.wallH + CART.handle * Math.sin(CART.handleUp * RAD);
    case 'box': return z.a;
    default: return 0;
  }
}

const fold = (phi) => { const a = ((phi % 180) + 180) % 180; return Math.min(a, 180 - a); };
export function rollClass(ob, onRamp) {
  const ang = fold(ob.phi);
  if (!onRamp) return { rolls: false, cls: 'flat', dir: null };
  switch (ob.k) {
    case 'ball': return { rolls: true, cls: 'ball', dir: 'down' };
    case 'box': return { rolls: false, cls: 'box', dir: null };
    case 'can':
      if (ob.p === 'stand') return { rolls: false, cls: 'stand', dir: null };
      if (ang >= POSE.acrossMin - 1e-9) return { rolls: true, cls: 'across', dir: 'g' };
      if (ang <= POSE.alongMax + 1e-9) return { rolls: false, cls: 'along', dir: null };
      return { rolls: false, cls: null, dir: null };
    case 'wheel':
      if (ob.p === 'lie') return { rolls: false, cls: 'lie', dir: null };
      if (ang <= POSE.wheelMax + 1e-9) return { rolls: true, cls: 'stand', dir: 'f' };
      return { rolls: false, cls: null, dir: null };
    case 'cart':
      if (ang <= POSE.cartAlongMax + 1e-9) return { rolls: true, cls: 'along', dir: 'f' };
      if (ang >= POSE.cartAcrossMin - 1e-9) return { rolls: false, cls: 'across', dir: null };
      return { rolls: false, cls: null, dir: null };
    default: return { rolls: false, cls: null, dir: null };
  }
}

const M = (rgb, ks = 0.1, sh = 16, extra = {}) => ({ c: lin(rgb), ks, sh, ...extra });
function mixInto(out, a, b, k) { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; }
function woodMat(P, rgb, seed) {
  const light = lin(rgb), dark = lin(rgb.map((v, i) => v * [0.78, 0.72, 0.66][i])), end = lin(rgb.map((v, i) => v * [0.86, 0.8, 0.74][i]));
  return {
    c: light, ks: 0.06, sh: 12,
    tex(x, y, z, nx, ny, nz, p, out, fp) {
      const q = [x - P.O[0], y - P.O[1], z - P.O[2]];
      const s = q[0] * P.u[0] + q[1] * P.u[1] + q[2] * P.u[2], t = q[0] * P.c[0] + q[1] * P.c[1] + q[2] * P.c[2], h = q[0] * P.n[0] + q[1] * P.n[1] + q[2] * P.n[2];
      const nu = Math.abs(nx * P.u[0] + ny * P.u[1] + nz * P.u[2]);
      if (nu > 0.7) {
        const r = Math.hypot(t * 6 + seed, (h + 0.05) * 6) * 9 + fbm(t * 30, h * 30, 2, fp * 30) * 3;
        mixInto(out, end, dark, 0.35 * (0.5 + 0.5 * Math.sin(r)));
        return;
      }
      const w = t * 38 + seed * 3 + fbm(s * 2.2 + seed, t * 9, 3, fp * 9) * 4.2 + h * 20;
      const streak = 0.5 + 0.5 * Math.sin(w * 2.1);
      const fine = fbm(s * 1.2 + seed, t * 55, 3, fp * 55);
      const k = Math.max(0, Math.min(1, 0.55 * Math.pow(streak, 3) + 0.45 * (fine - 0.3)));
      mixInto(out, light, dark, k * Math.max(0.35, 1 - fp * 40));
    },
  };
}
function bookMat(rgb, ax, C, half, spineAxis, spineSign) {
  const cover = lin(rgb), page = lin([238, 232, 214]), line = lin([214, 206, 186]), spine = lin(rgb.map((v) => v * 0.8));
  return {
    c: cover, ks: 0.08, sh: 14,
    tex(x, y, z, nx, ny, nz, p, out) {
      const q = [x - C[0], y - C[1], z - C[2]];
      const l = [dot(q, ax[0]), dot(q, ax[1]), dot(q, ax[2])], nl = [nx * ax[0][0] + ny * ax[0][1] + nz * ax[0][2], nx * ax[1][0] + ny * ax[1][1] + nz * ax[1][2], nx * ax[2][0] + ny * ax[2][1] + nz * ax[2][2]];
      if (Math.abs(nl[1]) > 0.6) { out[0] = cover[0]; out[1] = cover[1]; out[2] = cover[2]; return; }
      if (Math.abs(nl[spineAxis]) > 0.6 && Math.sign(nl[spineAxis]) === spineSign) { out[0] = spine[0]; out[1] = spine[1]; out[2] = spine[2]; return; }
      if (Math.abs(l[1]) > half[1] - 0.0035) { out[0] = cover[0]; out[1] = cover[1]; out[2] = cover[2]; return; }
      const k = 0.5 + 0.5 * Math.sin(l[1] * 1400);
      mixInto(out, page, line, 0.35 * k);
    },
  };
}
function labelMat(sty, C, a, len) {
  const body = lin(sty.c), band = lin(sty.band), ink = lin([30, 26, 24]);
  return {
    c: body, ks: 0.18, sh: 24,
    tex(x, y, z, nx, ny, nz, p, out) {
      const v = ((x - C[0]) * a[0] + (y - C[1]) * a[1] + (z - C[2]) * a[2]) / len;
      const av = Math.abs(v);
      if (av < 0.15) { out[0] = band[0]; out[1] = band[1]; out[2] = band[2]; }
      else if (av < 0.18) { out[0] = ink[0]; out[1] = ink[1]; out[2] = ink[2]; }
      else { out[0] = body[0]; out[1] = body[1]; out[2] = body[2]; }
    },
  };
}
function ballMat(sty, C, bax) {
  const base = lin(sty.c), band = lin(sty.band);
  return {
    c: base, ks: 0.28, sh: 30,
    tex(x, y, z, nx, ny, nz, p, out) {
      const d = Math.abs(nx * bax[0] + ny * bax[1] + nz * bax[2]);
      const src = d < 0.2 ? band : base;
      out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
    },
  };
}
function tyreMat(C, a, e1, e2, R) {
  const rub = lin([70, 70, 74]), groove = lin([34, 34, 38]), side = lin([80, 80, 86]);
  return {
    c: rub, ks: 0.12, sh: 10,
    tex(x, y, z, nx, ny, nz, p, out) {
      const q = [x - C[0], y - C[1], z - C[2]];
      const na = Math.abs(nx * a[0] + ny * a[1] + nz * a[2]);
      if (na > 0.7) { out[0] = side[0]; out[1] = side[1]; out[2] = side[2]; return; }
      const ang = Math.atan2(dot(q, e2), dot(q, e1));
      const k = (Math.sin(ang * 18) > 0.35) ? 1 : 0;
      const src = k ? groove : rub;
      out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
    },
  };
}
const SILVER = { c: lin([176, 180, 186]), ks: 0.55, sh: 40, env: 0.45 };
const AXLE = M([90, 92, 96], 0.3, 24);

function perpBasis(a) {
  const ref = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(a, ref));
  return [e1, cross(a, e1)];
}
function wheelPrims(out, C, a, R, w, hubRGB, hubSide, o, g0) {
  const [e1, e2] = perpBasis(a);
  out.push(prim.cylinder(add(C, mul(a, -w / 2)), add(C, mul(a, w / 2)), R, tyreMat(C, a, e1, e2, R), o, g0));
  const lo = hubSide === 0 ? -(w / 2 + HUB_OUT) : -hubSide * (w / 2 - 0.001), hi = hubSide === 0 ? w / 2 + HUB_OUT : hubSide * (w / 2 + HUB_OUT);
  out.push(prim.cylinder(add(C, mul(a, lo)), add(C, mul(a, hi)), R * 0.56, M(hubRGB, 0.22, 26), o, g0 + 1));
  for (const sd of hubSide === 0 ? [-1, 1] : [hubSide]) out.push(prim.cylinder(add(C, mul(a, sd * (w / 2))), add(C, mul(a, sd * (w / 2 + HUB_OUT + 0.0012))), R * 0.16, AXLE, o, g0 + 2));
}
export function objectPrims(P, ob, o, sty, look = null) {
  const F = objFrame(P, ob), z = ob.sz, out = [], g0 = 1000 + o * 16;
  switch (ob.k) {
    case 'ball': {
      const C = at(F, 0, 0, z.r);
      const bax = norm([Math.cos(ob.aux * RAD) * 0.6, Math.sin(ob.aux * RAD), 0.55 * Math.cos(ob.aux * 1.7 * RAD)]);
      out.push(prim.sphere(C, z.r, look ? look.ballMat(sty.ball[ob.sty], C, bax) : ballMat(sty.ball[ob.sty], C, bax), o, g0));
      break;
    }
    case 'can': {
      const lie = ob.p === 'lie';
      const a = lie ? F.f : F.n, C = lie ? at(F, 0, 0, z.r + RIM_OUT) : at(F, 0, 0, z.l / 2);
      const h = z.l / 2;
      out.push(prim.cylinder(add(C, mul(a, -(h - RIM))), add(C, mul(a, h - RIM)), z.r, look ? look.labelMat(sty.can[ob.sty], C, a, z.l) : labelMat(sty.can[ob.sty], C, a, z.l), o, g0));
      out.push(prim.cylinder(add(C, mul(a, -h)), add(C, mul(a, -(h - RIM))), z.r + RIM_OUT, SILVER, o, g0 + 1));
      out.push(prim.cylinder(add(C, mul(a, h - RIM)), add(C, mul(a, h)), z.r + RIM_OUT, SILVER, o, g0 + 2));
      break;
    }
    case 'wheel': {
      const hubRGB = sty.wheel[ob.sty].hub;
      if (ob.p === 'stand') wheelPrims(out, at(F, 0, 0, z.R), F.g, z.R, z.w, hubRGB, 0, o, g0);
      else wheelPrims(out, at(F, 0, 0, z.w / 2), F.n, z.R, z.w, hubRGB, 1, o, g0);
      break;
    }
    case 'cart': {
      const body = M(sty.cart[ob.sty].c, 0.16, 20), inner = M(sty.cart[ob.sty].c.map((v) => v * 0.72), 0.08, 12);
      const Lc = z.L, Wc = z.W, T = CART.wallT, fy = CART.zb + CART.floorT / 2, wy = CART.zb + CART.floorT + CART.wallH / 2;
      const ax = [F.f, F.n, F.g];
      out.push(prim.box(at(F, 0, 0, fy), ax, [Lc / 2, CART.floorT / 2, Wc / 2], inner, o, g0));
      out.push(prim.box(at(F, Lc / 2 - T / 2, 0, wy), ax, [T / 2, CART.wallH / 2, Wc / 2], body, o, g0 + 1));
      out.push(prim.box(at(F, -Lc / 2 + T / 2, 0, wy), ax, [T / 2, CART.wallH / 2, Wc / 2], body, o, g0 + 1));
      out.push(prim.box(at(F, 0, Wc / 2 - T / 2, wy), ax, [Lc / 2, CART.wallH / 2, T / 2], body, o, g0 + 1));
      out.push(prim.box(at(F, 0, -Wc / 2 + T / 2, wy), ax, [Lc / 2, CART.wallH / 2, T / 2], body, o, g0 + 1));
      const xw = Lc / 2 - 0.03, yw = Wc / 2 + 0.008, rw = CART.rw;
      for (const sx of [-1, 1]) {
        out.push(prim.cylinder(at(F, sx * xw, -yw, rw), at(F, sx * xw, yw, rw), 0.0028, AXLE, o, g0 + 5));
        for (const sy of [-1, 1]) wheelPrims(out, at(F, sx * xw, sy * yw, rw), F.g, rw, CART.ww, [236, 236, 230], sy, o, g0 + 6);
      }
      const hA = at(F, Lc / 2, 0, CART.zb + CART.floorT + CART.wallH * 0.7);
      const hB = add(hA, add(mul(F.f, CART.handle * Math.cos(CART.handleUp * RAD)), mul(F.n, CART.handle * Math.sin(CART.handleUp * RAD))));
      out.push(prim.capsule(hA, hB, 0.0042, M([50, 50, 56], 0.3, 24), o, g0 + 9));
      out.push(prim.capsule(add(hB, mul(F.g, -0.02)), add(hB, mul(F.g, 0.02)), 0.0065, M([40, 40, 44], 0.25, 20), o, g0 + 10));
      break;
    }
    case 'box': {
      const C = at(F, 0, 0, z.a / 2);
      out.push(prim.rbox(C, [F.f, F.n, F.g], [z.a / 2, z.a / 2, z.a / 2], 0.006, M(sty.box[ob.sty].c, 0.14, 18), o, g0));
      break;
    }
    default: throw new Error(`objectPrims: ${ob.k}`);
  }
  return out;
}
export function plankPrims(P, woodRGB, seed, id, mat = null) {
  const C = add(add(P.O, mul(P.u, P.L / 2)), mul(P.n, -T_PLANK / 2));
  const p = prim.box(C, [P.u, P.n, P.c], [P.L / 2, T_PLANK / 2, P.W / 2], mat ? mat(P, seed) : woodMat(P, woodRGB, seed), id, id);
  p.noAO = true;
  return [p];
}
export function bookBoxes(rp) {
  const P = rampFrame(rp), th = rp.theta * RAD;
  const back = [-P.dh[0], 0, -P.dh[2]], c = P.c;
  const x0 = rp.sp * Math.cos(th);
  const out = [];
  let y = 0;
  const nb = rp.books.length, hTot = rp.sp * Math.sin(th), wSum = rp.books.reduce((a, b) => a + b.w, 0);
  rp.books.forEach((b0, k) => {
    const b = { ...b0, t: hTot * b0.w / wSum };
    const top = k === nb - 1;
    const a = (top ? 0 : b.yaw) * RAD;
    const e3 = norm(add(mul(back, Math.cos(a)), mul(c, Math.sin(a)))), e1 = norm(cross([0, 1, 0], e3));
    const ctr = add(add(P.P0, mul(back, x0 + b.d / 2 + (top ? 0 : b.ds))), add(mul(c, top ? 0 : b.dt), [0, y + b.t / 2, 0]));
    out.push({ C: ctr, ax: [e1, [0, 1, 0], e3], h: [b.l / 2, b.t / 2, b.d / 2], col: b.col, spine: b.spine });
    y += b.t;
  });
  return out;
}
export function bookPrims(rp, cols = BOOK_COLS) {
  return bookBoxes(rp).map((B, k) => {
    const spineAxis = B.spine < 2 ? 0 : 2, spineSign = B.spine % 2 ? 1 : -1;
    const p = prim.box(B.C, B.ax, B.h, bookMat(cols[B.col], B.ax, B.C, B.h, spineAxis, spineSign), BOOK_ID0 + k, BOOK_ID0 + k);
    p.noAO = true;
    return p;
  });
}

export function cameraFor(rd, W, H) {
  const e = rd.cam.el * RAD, D = rd.cam.dist, T = rd.cam.target;
  return lookAt({ eye: [T[0], T[1] + D * Math.sin(e), T[2] + D * Math.cos(e)], target: T, fovY: rd.cam.fov, W, H });
}
export function lightFor(rd) {
  const a = rd.light.az * RAD, e = rd.light.el * RAD;
  const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
  const fa = a + Math.PI * 0.9;
  return {
    dir, col: [1.18, 1.13, 1.04], sky: [0.44, 0.47, 0.52], ground: [0.24, 0.23, 0.22], soft: 0.06, aoK: 1,
    fill: { dir: [Math.sin(fa) * 0.7, 0.45, -Math.cos(fa) * 0.7], col: [0.12, 0.13, 0.15] },
  };
}
const TABLE = lin([212, 214, 214]), TABLE2 = lin([196, 200, 202]);
export const tableFloor = {
  color(x, z, fp, out) {
    const k = fbm(x * 1.7 + 7.3, z * 1.7 - 2.1, 2, fp * 1.7) * 0.3 + fbm(x * 70, z * 70, 2, fp * 70) * 0.7;
    mixInto(out, TABLE, TABLE2, Math.max(0, Math.min(1, (k - 0.3) * 0.9)));
  },
};
const ENV_SKY = lin([226, 232, 240]), ENV_GND = lin([150, 150, 150]);
export function envColor(dx, dy, dz, out) {
  const k = Math.max(0, Math.min(1, 0.5 + dy * 1.8));
  mixInto(out, ENV_GND, ENV_SKY, k);
}

const cache = new WeakMap();
export function sceneFor(rd, W, H) {
  const key = `${W}|${H}|${rd.cam.el}|${rd.cam.dist}|${rd.cam.fov}|${rd.cam.target.join(',')}`;
  let sc = cache.get(rd);
  if (sc && sc.key === key) return sc;
  const cam = cameraFor(rd, W, H), prims = [];
  const R = rampFrame(rd.ramp), Fp = flatFrame(rd.flat);
  const objIdx = [];
  rd.objs.forEach((ob, i) => {
    const list = objectPrims(ob.pl === 'R' ? R : Fp, ob, i, STY), idx = [];
    for (const p of list) { idx.push(prims.length); prims.push(p); }
    objIdx.push(idx);
  });
  const rampIdx = prims.length;
  prims.push(...plankPrims(R, WOOD[rd.ramp.wood], rd.ramp.seed, RAMP_ID));
  const flatIdx = prims.length;
  prims.push(...plankPrims(Fp, WOOD[rd.flat.wood], rd.flat.seed, FLAT_ID));
  const bookIdx = [];
  for (const p of bookPrims(rd.ramp)) { bookIdx.push(prims.length); prims.push(p); }
  sc = { key, W, H, cam, prims, objIdx, rampIdx: [rampIdx], flatIdx: [flatIdx], bookIdx, ix: buildIndex(prims, cam), R, F: Fp };
  cache.set(rd, sc);
  return sc;
}
export function renderScene(rd, W, H) {
  const sc = sceneFor(rd, W, H);
  return { sc, scene: { light: lightFor(rd), floor: tableFloor, env: envColor, outline: { sil: 0.5, part: 0.2, depth: 0.03 } } };
}
export function renderSceneStyled(rd, W, H, look) {
  const cam = cameraFor(rd, W, H), prims = [];
  const R = rampFrame(rd.ramp), Fp = flatFrame(rd.flat);
  const objIdx = [];
  rd.objs.forEach((ob, i) => {
    const list = objectPrims(ob.pl === 'R' ? R : Fp, ob, i, look.STY, look), idx = [];
    for (const p of list) { idx.push(prims.length); prims.push(p); }
    objIdx.push(idx);
  });
  prims.push(...plankPrims(R, WOOD[rd.ramp.wood], rd.ramp.seed, RAMP_ID, look.woodMat[rd.ramp.wood]));
  prims.push(...plankPrims(Fp, WOOD[rd.flat.wood], rd.flat.seed, FLAT_ID, look.woodMat[rd.flat.wood]));
  for (const p of bookPrims(rd.ramp, look.bookCols)) prims.push(p);
  const sc = { W, H, cam, prims, objIdx, ix: buildIndex(prims, cam) };
  return { sc, scene: { light: look.light(lightFor(rd)), floor: look.floor, env: look.env, outline: { sil: 0.5, part: 0.2, depth: 0.03 } } };
}

const r3 = (v) => Math.round(v * 1000) / 1000;
function boxCorners(C, ax, h) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = (k & 1 ? 1 : -1) * h[0], b = (k & 2 ? 1 : -1) * h[1], c = (k & 4 ? 1 : -1) * h[2];
    out.push([C[0] + ax[0][0] * a + ax[1][0] * b + ax[2][0] * c, C[1] + ax[0][1] * a + ax[1][1] * b + ax[2][1] * c, C[2] + ax[0][2] * a + ax[1][2] * b + ax[2][2] * c]);
  }
  return out;
}
export function framePoints(rd) {
  const pts = [];
  for (const P of [rampFrame(rd.ramp), flatFrame(rd.flat)]) {
    const C = add(add(P.O, mul(P.u, P.L / 2)), mul(P.n, -T_PLANK / 2));
    pts.push(...boxCorners(C, [P.u, P.n, P.c], [P.L / 2, T_PLANK / 2, P.W / 2]));
  }
  for (const B of bookBoxes(rd.ramp)) pts.push(...boxCorners(B.C, B.ax, B.h));
  const R = rampFrame(rd.ramp), Fp = flatFrame(rd.flat);
  rd.objs.forEach((ob, i) => {
    for (const p of objectPrims(ob.pl === 'R' ? R : Fp, ob, i, STY)) {
      if (p.k === 0) { for (let k = 0; k < 8; k++) pts.push([p.c[0] + (k & 1 ? p.r : -p.r), p.c[1] + (k & 2 ? p.r : -p.r), p.c[2] + (k & 4 ? p.r : -p.r)]); }
      else if (p.k === 1 || p.k === 2) { for (const E of [p.a, p.b]) for (let k = 0; k < 8; k++) pts.push([E[0] + (k & 1 ? p.r : -p.r), E[1] + (k & 2 ? p.r : -p.r), E[2] + (k & 4 ? p.r : -p.r)]); }
      else pts.push(...boxCorners(p.c, p.ax, p.h));
    }
  });
  return pts;
}
export function frameCamera(rd, W, H, pad) {
  const pts = framePoints(rd);
  const e = rd.cam.el * RAD, focal = (H / 2) / Math.tan(rd.cam.fov * Math.PI / 360);
  const box = () => {
    const cam = cameraFor(rd, W, H);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const P of pts) { const q = cam.project(P); if (q[2] <= 0.2) return null; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return [x0, x1, y0, y1];
  };
  const T = rd.cam.target.slice();
  rd.cam.target = T;
  for (let it = 0; it < 6; it++) {
    const b = box(); if (!b) return false;
    const dx = (b[0] + b[1]) / 2 - W / 2, dy = (b[2] + b[3]) / 2 - H / 2;
    T[0] += dx * rd.cam.dist / focal; T[2] += dy * rd.cam.dist / (focal * Math.sin(e));
    const k = Math.max((b[1] - b[0]) / (W - 2 * pad), (b[3] - b[2]) / (H - 2 * pad));
    rd.cam.dist *= k;
  }
  rd.cam.target = [r3(T[0]), T[1], r3(T[2])];
  rd.cam.dist = r3(rd.cam.dist * 1.005);
  for (let it = 0; it < 14; it++) {
    const b = box(); if (!b) return false;
    if (b[0] >= pad - 0.5 && b[1] <= W - pad + 0.5 && b[2] >= pad - 0.5 && b[3] <= H - pad + 0.5) return true;
    rd.cam.dist = r3(rd.cam.dist * 1.015);
  }
  return false;
}
