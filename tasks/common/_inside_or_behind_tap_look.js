import { makeCam, makeScene, shape, lin, fbm, hash2, lineMask, FORM, PART } from './_inside_or_behind_tap_rt.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const BOARD = Object.freeze({ w: 580, h: 430 });
const D2R = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v) => v - Math.floor(v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export const CAM = Object.freeze({ dist: 9.5, fovY: 25.5, target: [0, 0.25, -0.95] });
export function cameraFor(rd) {
  const a = rd.cam.az * D2R, e = rd.cam.el * D2R, T = CAM.target;
  const eye = [T[0] + Math.sin(a) * Math.cos(e) * CAM.dist, T[1] + Math.sin(e) * CAM.dist, T[2] + Math.cos(a) * Math.cos(e) * CAM.dist];
  return makeCam({ eye, target: T, fovY: CAM.fovY, W: BOARD.w, H: BOARD.h });
}

export const KIND = Object.freeze({
  bucket: { w: 0.03, b: 0.05, lip: 0.03, lipH: 0.075 },
  basket: { w: 0.04, b: 0.055, lip: 0.028, lipH: 0.07 },
  box: { w: 0.024, b: 0.03 },
  bowl: { w: 0.034, b: 0.045 },
  lidbox: { w: 0.024, b: 0.03, closed: true },
  upbowl: { w: 0.034, b: 0.045, closed: true },
});
export const isClosed = (c) => !!(KIND[c.kind] && KIND[c.kind].closed);
export function closedTop(c) { return c.H; }
export function onClosedTop(c, x, z, margin = 0.02) {
  if (c.kind === 'lidbox') {
    const cs = Math.cos(c.yaw * D2R), sn = Math.sin(c.yaw * D2R), px = x - c.x, pz = z - c.z;
    return Math.abs(px * cs - pz * sn) <= c.hx - margin && Math.abs(px * sn + pz * cs) <= c.hz - margin;
  }
  return Math.hypot(x - c.x, z - c.z) <= c.Rf - margin;
}
export function bowlSphere(c) {
  const ysph = (c.Rr * c.Rr - c.Rf * c.Rf + c.H * c.H) / (2 * c.H);
  return { ysph, Ro: Math.hypot(c.Rf, ysph) };
}
export function outerR(c) {
  if (c.kind === 'box' || c.kind === 'lidbox') return Math.hypot(c.hx, c.hz);
  if (c.kind === 'bowl' || c.kind === 'upbowl') return c.Rr;
  return c.r1 + KIND[c.kind].lip;
}
export function cavity(c) {
  const K = KIND[c.kind];
  if (K.closed) return null;
  if (c.kind === 'box') return { floor: K.b, top: c.H, box: true, hx: c.hx - K.w, hz: c.hz - K.w, yaw: c.yaw };
  if (c.kind === 'bowl') { const { ysph, Ro } = bowlSphere(c); return { floor: K.b, top: c.H, sph: true, ysph, Ri: Ro - K.w }; }
  return { floor: K.b, top: c.H, round: true, r0: c.r0 - K.w, r1: c.r1 - K.w, H: c.H };
}
export function containerShapes(id, m, c) {
  const K = KIND[c.kind], out = [];
  if (c.kind === 'lidbox') {
    out.push(shape.shell(id, m, { form: FORM.BOX, cx: c.x, cz: c.z, ya: 0, yb: c.H, ca: c.H + 1, cb: c.H + 2, w: K.w, hx: c.hx, hz: c.hz, yaw: c.yaw, solid: true }));
  } else if (c.kind === 'upbowl') {
    const { ysph, Ro } = bowlSphere(c);
    out.push(shape.shell(id, m, { form: FORM.BOWL, cx: c.x, cz: c.z, ya: 0, yb: c.H, ca: c.H + 1, cb: c.H + 2, w: K.w, Ro, ysph: c.H - ysph, solid: true }));
  } else if (c.kind === 'box') {
    out.push(shape.shell(id, m, { form: FORM.BOX, cx: c.x, cz: c.z, ya: 0, yb: c.H, ca: K.b, cb: c.H + 1, w: K.w, hx: c.hx, hz: c.hz, yaw: c.yaw, cav: true }));
  } else if (c.kind === 'bowl') {
    const { ysph, Ro } = bowlSphere(c);
    out.push(shape.shell(id, m, { form: FORM.BOWL, cx: c.x, cz: c.z, ya: 0, yb: c.H, ca: K.b, cb: c.H + 1, w: K.w, Ro, ysph, cav: true }));
  } else {
    out.push(shape.shell(id, m, { form: FORM.ROUND, cx: c.x, cz: c.z, ya: 0, yb: c.H, ca: K.b, cb: c.H + 1, w: K.w, ra: c.r0, rb: c.r1, cav: true }));
    const k = (c.r1 - c.r0) / c.H, y0 = c.H - K.lipH, ro = c.r1 + K.lip;
    out.push(shape.shell(id, m, { form: FORM.ROUND, cx: c.x, cz: c.z, ya: y0, yb: c.H + 0.004, ca: y0 - 1, cb: c.H + 1,
      w: K.lip + 0.012, ra: ro - k * K.lipH, rb: ro + k * 0.004, tag: 1 }));
  }
  return out;
}

function bucketTex(col) {
  const base = lin(col);
  return (s, x, y, z, part, fp, out) => {
    let k = 1;
    if (part === PART.OUT && !s.tag) {
      const H = s.yb;
      const g1 = 1 - smooth(0.004, 0.012, Math.abs(y - H * 0.33)), g2 = 1 - smooth(0.004, 0.012, Math.abs(y - H * 0.63));
      k *= 1 - 0.28 * Math.max(g1, g2);
      k *= 0.96 + 0.06 * (y / H);
    } else if (part === PART.IN || part === PART.FLOOR) k = 0.9;
    else if (part === PART.RIM || s.tag) k = 1.04;
    out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
  };
}
const WICKER = [lin('#c9a26a'), lin('#b98c52'), lin('#d7b47c')];
function basketTex(tone) {
  const t0 = WICKER[tone % WICKER.length];
  return (s, x, y, z, part, fp, out) => {
    const px = x - s.cx, pz = z - s.cz, ang = Math.atan2(pz, px);
    let shade, var_ = 1;
    if (s.tag) {
      const u = ang * (s.rb + 0.02) / 0.05 + y / 0.035, f = frac(u);
      shade = 0.7 + 0.3 * Math.sin(Math.PI * f);
      var_ = 0.9 + 0.2 * hash2(Math.floor(u), 7);
    } else if (part === PART.FLOOR || part === PART.BOT) {
      const rho = Math.hypot(px, pz), u = rho / 0.05, f = frac(u);
      shade = 0.68 + 0.32 * Math.sin(Math.PI * f);
      var_ = 0.9 + 0.2 * hash2(Math.floor(u), 3);
    } else if (part === PART.RIM) { shade = 0.95; }
    else {
      const R = s.ra + (s.rb - s.ra) * (y - s.ya) / (s.yb - s.ya), sArc = (ang + Math.PI) * R;
      const row = Math.floor(y / 0.048), col = Math.floor(sArc / 0.07), fy = frac(y / 0.048), fs = frac(sArc / 0.07);
      if (((row + col) & 1) === 0) { shade = 0.62 + 0.38 * Math.sin(Math.PI * fy); var_ = 0.88 + 0.22 * hash2(row, 11); }
      else { shade = 0.6 + 0.4 * Math.sin(Math.PI * fs); var_ = 0.85 + 0.2 * hash2(col, 29); }
      const blend = clamp01((fp / 0.02 - 0.5));
      shade = shade * (1 - blend) + 0.82 * blend;
    }
    const k = shade * var_ * (part === PART.IN || part === PART.FLOOR ? 0.88 : 1);
    out[0] = t0[0] * k; out[1] = t0[1] * k; out[2] = t0[2] * k;
  };
}
const KRAFT = [lin('#b98f5c'), lin('#a97e4c'), lin('#c49d6c')];
const KRAFT_IN = lin('#caa678'), TAPE = lin('#d9bf8f');
function boxTex(tone) {
  const t0 = KRAFT[tone % KRAFT.length];
  return (s, x, y, z, part, fp, out) => {
    const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin;
    const l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    const onX = Math.abs(Math.abs(l0) - (part === PART.OUT ? s.hx : s.hx - s.w)) < Math.abs(Math.abs(l2) - (part === PART.OUT ? s.hz : s.hz - s.w));
    const u = onX ? l2 : l0;
    const fib = fbm(u * 3 + (onX ? 5 : 0), y * 30, 3, fp * 30);
    let col = t0, k = 0.9 + 0.14 * fib;
    if (part === PART.IN || part === PART.FLOOR) { col = KRAFT_IN; k = 0.9 + 0.12 * fib; }
    else if (part === PART.RIM) { col = KRAFT_IN; k = 1.02 + 0.1 * lineMask(u, 0.012, 0.003, fp); }
    else if (!onX && Math.abs(u) < 0.085 && y > s.yb - 0.2) { col = TAPE; k = 1.0 + 0.05 * fib; }
    k *= 1 - 0.12 * (1 - smooth(0, 0.05, s.yb - y)) * (part === PART.OUT ? 1 : 0);
    out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
  };
}
const GLAZE_IN = lin('#efe6d2');
function bowlTex(col, band) {
  const g = lin(col), bd = lin(band);
  return (s, x, y, z, part, fp, out) => {
    let c = g, k = 1;
    if (part === PART.IN || part === PART.FLOOR || part === PART.RIM) { c = GLAZE_IN; k = 0.97 + 0.05 * fbm(x * 9, z * 9, 2, fp * 9); }
    else {
      const d = s.yb - y;
      if (d > 0.022 && d < 0.042) c = bd;
      k = 0.95 + 0.06 * fbm(x * 6 + z * 3, y * 12, 2, fp * 12);
      if (y < 0.03) { c = lin('#b9a888'); k = 0.9; }
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}

function lidBoxTex(tone) {
  const t0 = KRAFT[tone % KRAFT.length], side = boxTex(tone);
  return (s, x, y, z, part, fp, out) => {
    if (part !== PART.RIM) { side(s, x, y, z, part, fp, out); return; }
    const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin, l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    const fib = fbm(l0 * 3 + 2, l2 * 30, 3, fp * 30);
    let col = t0, k = 0.93 + 0.12 * fib;
    if (Math.abs(l0) < 0.085) { col = TAPE; k = 1.02 + 0.04 * fib; }
    else {
      const tapeEdge = 1 - smooth(0.0, 0.006 + fp, Math.abs(l0) - 0.085);
      const fold = 1 - smooth(0.004, 0.01 + fp, s.hx - Math.abs(l0));
      k *= 1 - 0.3 * tapeEdge - 0.25 * fold;
    }
    out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
  };
}
function upBowlTex(col, band) {
  const g = lin(col), bd = lin(band), FOOT = lin('#b9a888');
  return (s, x, y, z, part, fp, out) => {
    let c = g, k;
    if (part === PART.RIM) {
      const rho = Math.hypot(x - s.cx, z - s.cz), Rf = Math.sqrt(Math.max(0, s.Ro * s.Ro - (s.yb - s.ysph) ** 2));
      c = FOOT; k = (0.9 + 0.08 * fbm(x * 14, z * 14, 2, fp * 14)) * (rho < Rf - 0.035 ? 0.86 : 1) * (1 - 0.3 * (1 - smooth(0.002, 0.006 + fp, Math.abs(rho - (Rf - 0.035)))));
    }
    else {
      if (y > 0.022 && y < 0.042) c = bd;
      k = 0.95 + 0.06 * fbm(x * 6 + z * 3, y * 12, 2, fp * 12);
      if (s.yb - y < 0.03) { c = FOOT; k = 0.9; }
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}

const PINE = [lin('#d2a86e'), lin('#c4955a'), lin('#dcb784')];
function blockTex(tone) {
  const t0 = PINE[tone % PINE.length];
  return (s, x, y, z, part, fp, out) => {
    const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin, l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    let k;
    if (part === PART.RIM) {
      k = 0.97 + 0.12 * fbm(l0 * 3, l2 * 40, 3, fp * 40);
    } else {
      const onX = Math.abs(Math.abs(l0) - s.hx) < Math.abs(Math.abs(l2) - s.hz);
      k = onX ? 0.78 + 0.1 * fbm(l2 * 30, y * 30, 2, fp * 30)
        : 0.9 + 0.12 * fbm(l0 * 3 + 7, y * 45, 3, fp * 45);
    }
    out[0] = t0[0] * k; out[1] = t0[1] * k; out[2] = t0[2] * k;
  };
}
export const STOOL_H = 0.25;
const solidBox = (id, m, x, z, y0, y1, hx, hz, yaw) => shape.shell(id, m, { form: FORM.BOX, cx: x, cz: z, ya: y0, yb: y1, ca: y1 + 1, cb: y1 + 2, w: 0.01, hx, hz, yaw, solid: true });
export function blockShapes(id, m, p) {
  if (p.h <= STOOL_H) return [solidBox(id, m, p.x, p.z, 0, p.h, p.hx, p.hz, p.yaw)];
  const seat = 0.045, leg = 0.034, cs = Math.cos(p.yaw * D2R), sn = Math.sin(p.yaw * D2R), out = [solidBox(id, m, p.x, p.z, p.h - seat, p.h, p.hx, p.hz, p.yaw)];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const l0 = a * (p.hx - leg - 0.012), l2 = b * (p.hz - leg - 0.012);
    out.push(solidBox(id, m, p.x + l0 * cs + l2 * sn, p.z - l0 * sn + l2 * cs, 0, p.h - seat, leg, leg, p.yaw));
  }
  return out;
}

const LOC = new Float64Array(3);
function local(s, x, y, z) {
  const px = (x - s.cx) / s.r, py = (y - s.cy) / s.r, pz = (z - s.cz) / s.r, R = s.rot;
  LOC[0] = R[0] * px + R[1] * py + R[2] * pz; LOC[1] = R[3] * px + R[4] * py + R[5] * pz; LOC[2] = R[6] * px + R[7] * py + R[8] * pz;
  return LOC;
}
const ICO = (() => {
  const p = (1 + Math.sqrt(5)) / 2, v = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a, b * p], [a, b * p, 0], [b * p, 0, a]); }
  return v.map((q) => { const l = Math.hypot(...q); return q.map((c) => c / l); });
})();
const WHITE = lin('#f4f1ea');
function ballTex(style, c1, c2, c3) {
  const A = lin(c1), B = lin(c2 || '#ffffff'), C = lin(c3 || '#ffffff');
  return (s, x, y, z, part, fp, out) => {
    const u = local(s, x, y, z), aa = Math.max(0.012, fp / s.r * 1.2);
    let c = A, k = 1;
    if (style === 'tennis') {
      const al = 1.45, g = u[2] - al * (u[0] * u[0] - u[1] * u[1]);
      const gr = Math.hypot(-2 * al * u[0], 2 * al * u[1], 1), d = Math.abs(g) / gr;
      const m = 1 - smooth(0.035, 0.035 + aa, d);
      k = 0.93 + 0.1 * fbm(u[0] * 30 + u[2] * 7, u[1] * 30, 2, aa * 30);
      out[0] = (A[0] * (1 - m) + WHITE[0] * m) * k; out[1] = (A[1] * (1 - m) + WHITE[1] * m) * k; out[2] = (A[2] * (1 - m) + WHITE[2] * m) * k;
      return;
    }
    if (style === 'beach') {
      if (Math.abs(u[2]) > 0.93) c = WHITE;
      else {
        const sec = Math.floor((Math.atan2(u[1], u[0]) + Math.PI) / (Math.PI / 3)) % 6;
        c = [A, WHITE, B, WHITE, C, WHITE][sec];
      }
    } else if (style === 'basket') {
      const l1 = Math.abs(u[0]), l2 = Math.abs(u[2]), g = Math.abs(u[1] * u[1] - u[0] * u[0] * 0.6 - 0.35);
      const d = Math.min(l1, l2, g * 0.9);
      const m = 1 - smooth(0.022, 0.022 + aa, d);
      k = (0.9 + 0.14 * fbm(u[0] * 40, u[1] * 40 + u[2] * 13, 2, aa * 40)) * (1 - 0.9 * m);
    } else if (style === 'stripe') {
      const a = Math.abs(u[2]);
      c = a < 0.28 ? A : a < 0.36 ? WHITE : a < 0.5 ? B : WHITE;
    } else if (style === 'dots') {
      let best = -1; for (const v of ICO) { const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; if (d > best) best = d; }
      const m = smooth(Math.cos(0.36) - aa, Math.cos(0.36) + aa * 0.2, best);
      out[0] = A[0] * (1 - m) + WHITE[0] * m; out[1] = A[1] * (1 - m) + WHITE[1] * m; out[2] = A[2] * (1 - m) + WHITE[2] * m;
      return;
    } else if (style === 'twotone') {
      c = u[2] > 0.04 * Math.sin(3 * Math.atan2(u[1], u[0])) ? A : B;
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}
export const BALL_STYLES = ['tennis', 'beach', 'basket', 'stripe', 'dots', 'twotone', 'solid'];
const BALL_GLOSS = { tennis: [0.05, 8, 0], beach: [0.45, 60, 0.12], basket: [0.14, 18, 0.04], stripe: [0.4, 55, 0.12], dots: [0.4, 55, 0.12], twotone: [0.4, 55, 0.12], solid: [0.45, 60, 0.14] };

export function rotMatrix(a, b, c) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca];
}

function makeEnv(rd) {
  const rot = (rd.floor?.rot ?? 0) * D2R, cr = Math.cos(rot), sr = Math.sin(rot), tint = rd.floor?.tint ?? 0;
  const base = [[0.5, 0.47, 0.42], [0.48, 0.47, 0.45], [0.53, 0.48, 0.4]][tint % 3];
  return {
    floorY: 0,
    floor(x, z, fp, out) {
      const u = x * cr - z * sr + 13.1, v = x * sr + z * cr + 7.3;
      const row = Math.floor(v / 0.6), uo = u + (row & 1) * 0.45, col = Math.floor(uo / 0.9);
      const seam = Math.max(lineMask(v, 0.6, 0.011, fp), lineMask(uo, 0.9, 0.011, fp));
      const t0 = 0.9 + 0.16 * hash2(col, row);
      const cloud = fbm(u * 1.4 + col * 3.1, v * 1.4 + row * 1.7, 3, fp * 1.4), speck = fbm(u * 9, v * 9, 2, fp * 9);
      const t = t0 * (0.84 + 0.14 * cloud + 0.08 * (speck - 0.5)) * (1 - 0.5 * seam);
      out[0] = base[0] * t; out[1] = base[1] * t; out[2] = base[2] * t;
    },
    sky(dx, dy, dz, out) { const k = 0.55 + 0.35 * Math.max(0, dy); out[0] = 0.62 * k; out[1] = 0.7 * k; out[2] = 0.82 * k; },
    fog: { col: [0.6, 0.62, 0.64], d0: 11, d1: 20, max: 0.6 },
  };
}
function makeLight(rd) {
  const a = (rd.cam.az + rd.sun.az) * D2R, e = rd.sun.el * D2R;
  const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const fa = (rd.cam.az - rd.sun.az * 0.6) * D2R;
  return {
    dir, col: [1.32, 1.2, 1.04], soft: 0.055,
    sky: [0.34, 0.38, 0.44], ground: [0.2, 0.18, 0.15],
    fill: { dir: [Math.sin(fa) * 0.7, 0.45, Math.cos(fa) * 0.7], col: [0.1, 0.1, 0.11] },
    aoK: 1, contact: 0.36, contactH: 0.07,
  };
}
export function buildScene(rd, look = null) {
  if (look) return buildSceneStyled(rd, look);
  const shapes = [], mats = [];
  rd.cons.forEach((c, i) => {
    let mat;
    if (c.kind === 'bucket') mat = { c: lin(c.col), ks: 0.32, sh: 45, env: 0.1, tex: bucketTex(c.col) };
    else if (c.kind === 'basket') mat = { c: WICKER[c.tone], ks: 0.06, sh: 10, env: 0, tex: basketTex(c.tone) };
    else if (c.kind === 'box') mat = { c: KRAFT[c.tone], ks: 0.04, sh: 8, env: 0, tex: boxTex(c.tone) };
    else if (c.kind === 'lidbox') mat = { c: KRAFT[c.tone], ks: 0.04, sh: 8, env: 0, tex: lidBoxTex(c.tone) };
    else if (c.kind === 'upbowl') mat = { c: lin(c.col), ks: 0.5, sh: 80, env: 0.16, tex: upBowlTex(c.col, c.band) };
    else mat = { c: lin(c.col), ks: 0.5, sh: 80, env: 0.16, tex: bowlTex(c.col, c.band) };
    mats.push(mat);
    shapes.push(...containerShapes(i, mats.length - 1, c));
  });
  const N = rd.cons.length;
  rd.balls.forEach((b, j) => {
    const g = BALL_GLOSS[b.style];
    mats.push({ c: lin(b.c1), ks: g[0], sh: g[1], env: g[2], tex: ballTex(b.style, b.c1, b.c2, b.c3) });
    shapes.push(shape.ball(N + j, mats.length - 1, b.x, b.y, b.z, b.r, rotMatrix(...b.rot), b.y - b.r));
  });
  (rd.props || []).forEach((p, k) => {
    mats.push({ c: PINE[p.tone % PINE.length], ks: 0.05, sh: 8, env: 0, tex: blockTex(p.tone) });
    shapes.push(...blockShapes(N + rd.balls.length + k, mats.length - 1, p));
  });
  return makeScene({ cam: cameraFor(rd), shapes, mats, env: makeEnv(rd), light: makeLight(rd) });
}

const GROUNDS = ['slab', 'deck', 'lawn', 'gravel', 'brick', 'concrete', 'cobble', 'flagstone', 'moss'];
const BASKETS = [['wicker', ['#c9a26a', '#b98c52', '#d7b47c']], ['rattan', ['#7a5634', '#6b4a2c', '#86603a']], ['painted', ['#e8e4da', '#dcd7cb', '#efebe2']], ['seagrass', ['#a8a06a', '#9a925c', '#b4ac78']]];
const BOXES = [['kraft', ['#b98f5c', '#a97e4c', '#c49d6c']], ['whiteboard', ['#e3ddd0', '#d8d2c4', '#ebe6db']], ['crate', ['#a47a4e', '#8f6a43', '#b78a5a']], ['plastic', ['#6f7a82', '#5f6a72', '#7e8890']]];
const PROPS = [['pine', ['#d2a86e', '#c4955a', '#dcb784']], ['walnut', ['#6e4a30', '#5f3f28', '#7a5436']], ['white', ['#e6e3dc', '#dddad2', '#eceae4']], ['sage', ['#8fa58e', '#829880', '#9bb09a']]];
const BALL_REMAP = [
  ['default', null],
  ['set-a', { beach: 'football', stripe: 'volley', dots: 'stardots', twotone: 'grid' }],
  ['set-b', { solid: 'football', dots: 'grid', stripe: 'volley', twotone: 'stardots' }],
  ['set-c', { beach: 'volley', solid: 'stardots', twotone: 'football', stripe: 'grid' }],
  ['set-d', { tennis: 'grid', beach: 'stardots', solid: 'volley', dots: 'football' }],
];
const BUCKET_FIN = [['gloss', [0.32, 45, 0.1]], ['matte', [0.12, 18, 0.03]], ['satin', [0.22, 30, 0.06]]];
const BOWL_FIN = [['glaze', [0.5, 80, 0.16]], ['stoneware', [0.25, 30, 0.08]], ['satin', [0.36, 50, 0.12]]];

export async function styleLook(style) {
  const rnd = style.rand;
  const sp = (pool, ids, minTest = 1) => { const f = splitIds(`inside_or_behind_tap|${pool}`, ids, minTest); return ids.filter((id) => f(id) === style.split); };
  const grounds = sp('ground', GROUNDS, 3), baskets = sp('basket', BASKETS.map((b) => b[0])), boxes = sp('box', BOXES.map((b) => b[0]));
  const [gi, bi, xi] = style.primaryCombo('iob-ground-basket-box', [grounds.length, baskets.length, boxes.length]);
  const gk = grounds[gi], bk = BASKETS.find((b) => b[0] === baskets[bi]), xk = BOXES.find((b) => b[0] === boxes[xi]);
  const P = (pool, items, r) => K.splitPick(style, 'inside_or_behind_tap', pool, items, r);
  const pk = P('stool', PROPS), remap = P('ball_patterns', BALL_REMAP)[1];
  const texFilter = {
    slab: (t) => t.use === 'floor' || (t.use === 'stone' && /tile|slab|floor/.test(t.id)), deck: (t) => t.use === 'wood',
    lawn: (t) => t.use === 'terrain' && /grass|forest|mossy|leaves/.test(t.id), moss: (t) => (t.use === 'terrain' || t.use === 'stone') && /moss|lichen|grass/.test(t.id),
    flagstone: (t) => (t.use === 'stone' || t.use === 'floor') && /stone|slab|rock|flag/.test(t.id), gravel: (t) => t.use === 'terrain' && /gravel|rocks_ground|pebbles|trail/.test(t.id),
    brick: (t) => t.use === 'wall' && /brick/.test(t.id), concrete: (t) => t.use === 'floor' && /concrete|cement/.test(t.id), cobble: (t) => t.use === 'stone' && /cobble|pebble|rock_tile|castle/.test(t.id),
  }[gk];
  let gl = style.pool('tex', texFilter); if (!gl.length) gl = style.pool('tex', (t) => t.use === 'floor');
  const gt = K.pickOf(rnd, gl);
  const woodT = style.pick('tex', (t) => t.use === 'wood');
  const hd = style.pick('hdri', (h) => ['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast'].includes(h.use));
  style.note(`ground:${gk}`); style.note(`basket:${bk[0]}`); style.note(`box:${xk[0]}`); style.note(`tex:${gt.id}`); style.note(`hdri:${hd.id}`);
  const [TG, TWd, sky] = await Promise.all([S3.loadTexture(gt.file), S3.loadTexture(woodT.file), S3.loadSky(hd.sky)]);
  const J = Array.from({ length: 10 }, () => rnd());
  const sat = gk === 'lawn' || gk === 'moss' ? 0.42 : gk === 'brick' || gk === 'deck' ? 0.28 : 0.22;
  let gface = S3.scaleTo(S3.keepNamedHues(S3.limitSat(TG.mean, sat), [[2, 30]], 0.16, sat), (gk === 'lawn' || gk === 'moss' ? 0.12 : 0.16) + 0.22 * J[0]);
  if (gk === 'moss') gface = S3.scaleTo(S3.hueSatColor(85 + 25 * J[9], 0.42), S3.lum(gface));
  const against = [...bk[1], ...xk[1]].map(lin);
  for (let it = 0; it < 12 && against.some((a) => S3.deltaE(a, gface) < 22); it++) gface = gface.map((v) => v * (S3.lum(gface) > 0.2 ? 0.8 : 1.25));
  const L = S3.hdriLight(hd, { dir: [0, 1, 0], col: [1.32, 1.2, 1.04], soft: 0.055, sky: [0.34, 0.38, 0.44], ground: [0.2, 0.18, 0.15], fill: { dir: [0.5, 0.45, 0.5], col: [0.1, 0.1, 0.11] } }, { albedo: gface, total: 1.62, jitter: J[1] });
  const fogCol = S3.scaleTo(S3.limitSat(hd.horizon, 0.2), 0.36 + 0.12 * J[2]);
  return {
    gk, TG, gface, bk, xk, pk, remap, TWd, light: L, sky: S3.skyFn(sky, 0.85 * S3.lum(L.sky) / 0.4), fogCol,
    bucketGloss: P('bucket_finish', BUCKET_FIN, J[3])[1], bowlGloss: P('bowl_finish', BOWL_FIN, J[4])[1],
    unit: 0.7 + 0.5 * J[5], salt: Math.floor(J[6] * 997),
    ids: { ground: gk, groundTex: gt.id, basket: bk[0], box: xk[0], props: pk[0], balls: remap ? 'remap' : 'default', hdri: hd.id },
  };
}

function groundStyled(rd, look) {
  const rot = (rd.floor?.rot ?? 0) * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
  const T = look.TG, face = look.gface, gk = look.gk, S = new Float64Array(3), U = look.unit;
  const invL = 1 / Math.max(1e-6, S3.lum(T.mean)), kc = Math.min(1.3, (gk === 'lawn' || gk === 'gravel' ? 0.32 : 0.2) / Math.max(1e-6, T.cv));
  const keep = gk === 'lawn' ? 0.7 : gk === 'deck' ? 0.6 : 0.4, Lf = S3.lum(face);
  const samp = (u, v, fp, tw, out) => {
    const tpm = T.n / tw;
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const t = Math.max(0.55, Math.min(1.5, 1 + kc * (S3.lum(S) * invL - 1))), Ln = Math.max(1e-6, S3.lum(S));
    for (let c = 0; c < 3; c++) out[c] = face[c] * t * (1 - keep) + S[c] / Ln * Lf * t * keep;
  };
  return (x, z, fp, out) => {
    const u = x * cr - z * sr + 13.1, v = x * sr + z * cr + 7.3;
    if (gk === 'lawn' || gk === 'gravel' || gk === 'moss') { samp(u, v, fp, gk === 'gravel' ? 1.2 : 1.6, out); return; }
    let seam = 0, tone = 1, a = u, b = v;
    if (gk === 'deck') {
      const PW = 0.14 * U, PL = 2.4, row = Math.floor(v / PW), off = hash2(row, 7) * PL, seg = Math.floor((u + off) / PL);
      tone = 0.86 + 0.26 * hash2(row, seg); seam = Math.max(lineMask(v, PW, 0.006, fp), lineMask(u + off, PL, 0.005, fp) * 0.8);
      a = u + seg * 3.1; b = v + row * 0.37;
      const swap = T.gxy > 1; samp(swap ? b : a, swap ? a : b, fp, 1.0, out);
    } else if (gk === 'brick') {
      const BH = 0.1 * U, BL = 0.21 * U, row = Math.floor(v / BH), uo = u + (row & 1) * BL / 2, col = Math.floor(uo / BL);
      tone = 0.85 + 0.3 * hash2(col, row); seam = Math.max(lineMask(v, BH, 0.006, fp), lineMask(uo, BL, 0.006, fp));
      samp(u, v, fp, 1.4, out);
    } else if (gk === 'flagstone') {
      const C = 0.55 * U, iu = Math.floor(u / C), iv = Math.floor((v + (iu & 1) * C * 0.45) / C);
      const ju = (hash2(iu, iv) - 0.5) * 0.18, jv = (hash2(iv, iu + 7) - 0.5) * 0.18;
      const lu = u / C - iu - 0.5 - ju, lv = (v + (iu & 1) * C * 0.45) / C - iv - 0.5 - jv;
      tone = 0.82 + 0.3 * hash2(iu + 3, iv); seam = Math.max(0, Math.min(1, (Math.max(Math.abs(lu), Math.abs(lv)) - 0.43) / 0.05));
      samp(u + iu * 0.7, v + iv * 0.37, fp, 1.4, out);
    } else if (gk === 'cobble') {
      const C = 0.16 * U, iu = Math.floor(u / C), iv = Math.floor(v / C), lu = u / C - iu - 0.5, lv = v / C - iv - 0.5;
      const d = Math.max(Math.abs(lu), Math.abs(lv)); tone = 0.8 + 0.35 * hash2(iu, iv); seam = Math.max(0, Math.min(1, (d - 0.36) / 0.1));
      samp(u + iu * 0.31, v + iv * 0.17, fp, 1.0, out);
    } else {
      const W = gk === 'concrete' ? 0.8 * U : 0.9 * U, H = gk === 'concrete' ? 0.8 * U : 0.6 * U;
      const row = Math.floor(v / H), uo = u + (gk === 'slab' ? (row & 1) * W / 2 : 0), col = Math.floor(uo / W);
      tone = 0.9 + 0.16 * hash2(col + look.salt, row); seam = Math.max(lineMask(v, H, 0.011, fp), lineMask(uo, W, 0.011, fp));
      samp(uo + col * 1.7, v + row * 2.3, fp, 1.5, out);
    }
    const k = tone * (1 - 0.5 * seam); out[0] *= k; out[1] *= k; out[2] *= k;
  };
}
function ballTexStyled(style, c1, c2, c3) {
  if (!['football', 'volley', 'stardots', 'grid'].includes(style)) return ballTex(style, c1, c2, c3);
  const A = lin(c1), B = lin(c2 || '#ffffff'), BLK = [0.03, 0.03, 0.035];
  return (s, x, y, z, part, fp, out) => {
    const u = local(s, x, y, z), aa = Math.max(0.012, fp / s.r * 1.2);
    let c = A, m = 0;
    if (style === 'football') {
      let best = -1; for (const v of ICO) { const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; if (d > best) best = d; }
      m = smooth(Math.cos(0.3) - aa, Math.cos(0.3) + aa * 0.2, best);
      const seam = 1 - smooth(0.012, 0.012 + aa, Math.abs(best - Math.cos(0.62)));
      for (let k = 0; k < 3; k++) out[k] = (A[k] * (1 - m) + BLK[k] * m) * (1 - 0.35 * seam);
      return;
    }
    if (style === 'volley') {
      const ax = Math.abs(u[0]) > Math.abs(u[1]) ? (Math.abs(u[0]) > Math.abs(u[2]) ? 0 : 2) : (Math.abs(u[1]) > Math.abs(u[2]) ? 1 : 2);
      const w = u[(ax + 1) % 3], band = w < -0.33 ? 0 : w < 0.33 ? 1 : 2;
      c = [A, WHITE, B][(band + ax) % 3];
      const seam = 1 - smooth(0.015, 0.015 + aa, Math.min(Math.abs(w - 0.33), Math.abs(w + 0.33)));
      for (let k = 0; k < 3; k++) out[k] = c[k] * (1 - 0.4 * seam);
      return;
    }
    if (style === 'stardots') {
      let best = -1; for (const v of ICO) { const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; if (d > best) best = d; }
      m = smooth(Math.cos(0.16) - aa, Math.cos(0.16) + aa * 0.2, best);
      for (let k = 0; k < 3; k++) out[k] = A[k] * (1 - m) + WHITE[k] * m;
      return;
    }
    const lon = Math.atan2(u[1], u[0]), lat = Math.asin(Math.max(-1, Math.min(1, u[2])));
    const d = Math.min(Math.abs(frac(lon / (Math.PI / 4) + 0.5) - 0.5) * Math.PI / 4 * Math.cos(lat), Math.abs(frac(lat / (Math.PI / 6) + 0.5) - 0.5) * Math.PI / 6);
    m = 1 - smooth(0.025, 0.025 + aa, d);
    for (let k = 0; k < 3; k++) out[k] = A[k] * (1 - m) + WHITE[k] * m;
  };
}
function crateBoxTex(tone, cols, kind, look) {
  if (kind === 'kraft' || kind === 'whiteboard') {
    const t0 = lin(cols[tone % 3]), IN = t0.map((v) => v * (kind === 'whiteboard' ? 0.8 : 1.06));
    return (s, x, y, z, part, fp, out) => {
      const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin, l0 = px * c - pz * sn, l2 = px * sn + pz * c;
      const onX = Math.abs(Math.abs(l0) - (part === PART.OUT ? s.hx : s.hx - s.w)) < Math.abs(Math.abs(l2) - (part === PART.OUT ? s.hz : s.hz - s.w));
      const uu = onX ? l2 : l0, fib = fbm(uu * 3 + (onX ? 5 : 0), y * 30, 3, fp * 30);
      let col = t0, k = 0.9 + 0.14 * fib;
      if (part === PART.IN || part === PART.FLOOR) { col = IN; k = (0.9 + 0.12 * fib) * 0.92; }
      else if (part === PART.RIM) { col = IN; k = 1.02; }
      else if (kind === 'kraft' && !onX && Math.abs(uu) < 0.085 && y > s.yb - 0.2) { col = TAPE; }
      out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
    };
  }
  const t0 = lin(cols[tone % 3]), T = look.TWd, S = new Float64Array(3), tpm = T.n / 0.8, invL = 1 / Math.max(1e-6, S3.lum(T.mean));
  return (s, x, y, z, part, fp, out) => {
    const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin, l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    const onX = Math.abs(Math.abs(l0) - (part === PART.OUT ? s.hx : s.hx - s.w)) < Math.abs(Math.abs(l2) - (part === PART.OUT ? s.hz : s.hz - s.w));
    const uu = onX ? l2 : l0;
    let k = 1;
    if (kind === 'crate') {
      S3.sampleTex(T, uu * tpm, y * tpm * 3, Math.log2(Math.max(1e-9, fp * tpm)), S);
      k = Math.max(0.7, Math.min(1.3, 1 + 0.6 * (S3.lum(S) * invL - 1)));
      if (part === PART.OUT || part === PART.IN) { const g = frac(y / 0.11); if (g < 0.1) k *= 0.45; }
    } else {
      if (part === PART.OUT && frac(y / 0.07) < 0.2) k *= 0.82;
      if (part === PART.RIM) k = 1.08;
    }
    if (part === PART.IN || part === PART.FLOOR) k *= 0.85;
    out[0] = t0[0] * k; out[1] = t0[1] * k; out[2] = t0[2] * k;
  };
}
function propTexStyled(tone, cols) {
  const t0 = lin(cols[tone % 3]);
  return (s, x, y, z, part, fp, out) => {
    const px = x - s.cx, pz = z - s.cz, c = s.yawCos, sn = s.yawSin, l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    let k;
    if (part === PART.RIM) k = 0.97 + 0.12 * fbm(l0 * 3, l2 * 40, 3, fp * 40);
    else { const onX = Math.abs(Math.abs(l0) - s.hx) < Math.abs(Math.abs(l2) - s.hz); k = onX ? 0.8 : 0.9 + 0.1 * fbm(l0 * 3 + 7, y * 45, 3, fp * 45); }
    out[0] = t0[0] * k; out[1] = t0[1] * k; out[2] = t0[2] * k;
  };
}
function buildSceneStyled(rd, look) {
  const shapes = [], mats = [];
  rd.cons.forEach((c, i) => {
    let mat;
    if (c.kind === 'bucket') { const g = look.bucketGloss; mat = { c: lin(c.col), ks: g[0], sh: g[1], env: g[2], tex: bucketTex(c.col) }; }
    else if (c.kind === 'basket') {
      const cols = look.bk[1].map(lin), tone = c.tone % 3;
      const base = basketTex(0), t0 = WICKER[0];
      mat = { c: cols[tone], ks: 0.06, sh: 10, env: 0, tex: (s, x, y, z, part, fp, out) => { base(s, x, y, z, part, fp, out); for (let k = 0; k < 3; k++) out[k] = out[k] / t0[k] * cols[tone][k]; } };
    } else if (c.kind === 'lidbox') { mat = { c: KRAFT[c.tone], ks: 0.04, sh: 8, env: 0, tex: lidBoxTex(c.tone) };
    } else if (c.kind === 'upbowl') { const g = look.bowlGloss; mat = { c: lin(c.col), ks: g[0], sh: g[1], env: g[2], tex: upBowlTex(c.col, c.band) };
    } else if (c.kind === 'box') {
      const kind = look.xk[0];
      mat = { c: lin(look.xk[1][c.tone % 3]), ks: kind === 'plastic' ? 0.22 : 0.04, sh: kind === 'plastic' ? 30 : 8, env: 0, tex: crateBoxTex(c.tone, look.xk[1], kind, look) };
    } else { const g = look.bowlGloss; mat = { c: lin(c.col), ks: g[0], sh: g[1], env: g[2], tex: bowlTex(c.col, c.band) }; }
    mats.push(mat);
    shapes.push(...containerShapes(i, mats.length - 1, c));
  });
  const N = rd.cons.length;
  rd.balls.forEach((b, j) => {
    const st = (look.remap && look.remap[b.style]) || b.style, g = BALL_GLOSS[b.style];
    mats.push({ c: lin(b.c1), ks: g[0], sh: g[1], env: g[2], tex: ballTexStyled(st, b.c1, b.c2, b.c3) });
    shapes.push(shape.ball(N + j, mats.length - 1, b.x, b.y, b.z, b.r, rotMatrix(...b.rot), b.y - b.r));
  });
  (rd.props || []).forEach((p, k) => {
    mats.push({ c: lin(look.pk[1][p.tone % 3]), ks: 0.05, sh: 8, env: 0, tex: propTexStyled(p.tone, look.pk[1]) });
    shapes.push(...blockShapes(N + rd.balls.length + k, mats.length - 1, p));
  });
  const L0 = makeLight(rd), L = look.light;
  const light = { ...L0, col: L.col, sky: L.sky, ground: L.ground, fill: { dir: L0.fill.dir, col: L.fill.col }, soft: Math.min(0.07, Math.max(0.045, L.soft)) };
  const env = { floorY: 0, floor: groundStyled(rd, look), sky: look.sky, fog: { col: look.fogCol, d0: 11, d1: 20, max: 0.6 } };
  return makeScene({ cam: cameraFor(rd), shapes, mats, env, light });
}
