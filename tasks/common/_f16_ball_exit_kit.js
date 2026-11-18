import { PALETTE, lin, tone, proj, dirOf, sunDir } from './_which_one_rises_scene.js';
import { drawPromptText, rr, ACCENT } from '../core/panel.js';
import { clockState, hitButton, buttonRects } from '../core/clock.js';
export { PALETTE, lin, tone, proj, dirOf, sunDir };

export const VIEW = { w: 380, h: 384 };
const DEG = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const mix32 = (a, b) => { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

export function camOf(m) {
  const p = m.cam.pitch * DEG, f = (VIEW.h / 2) / Math.tan(m.cam.fovy * DEG / 2), sp = Math.sin(p), cp = Math.cos(p);
  return { h: m.cam.h, f, cx: VIEW.w / 2, cy: VIEW.h / 2, sp, cp, hy: VIEW.h / 2 + f * sp / cp };
}
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function hash2(ix, iy) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, fp = 0) {
  let s = 0, amp = 0.5, f = 1, norm2 = 0;
  for (let o = 0; o < oct; o++) {
    const w = clamp01(1.6 - 2.2 * fp * f);
    s += amp * (0.5 + w * (vnoise(x * f + o * 17.31, y * f - o * 11.17) - 0.5));
    norm2 += amp; amp *= 0.5; f *= 2;
  }
  return s / norm2;
}
function lineMask(u, period, hw, fp) {
  const d = Math.abs(u / period - Math.round(u / period)) * period;
  const sharp = clamp01((hw - d) / Math.max(fp, 1e-6) + 0.5);
  const avg = Math.min(1, 2 * hw / period);
  const blend = clamp01((fp / period - 0.2) / 0.5);
  return sharp * (1 - blend) + avg * blend;
}

const SUN_COL = [1.28, 1.2, 1.06], AMB = [0.4, 0.46, 0.56], GB = [0.2, 0.2, 0.17];
const SKY_ZEN = lin('#4f88d2'), SKY_HOR = lin('#cfe1f0'), CLOUD = lin('#f7f8fa'), CLOUD_SH = lin('#c9d2de');
const TREE = [lin('#2f4a26'), lin('#3f5e2e'), lin('#567543')], TRUNK = lin('#3a3a2e');
function skyCol(d, L, out) {
  const e = clamp01(d[1] * 1.6 + 0.02), t = Math.pow(e, 0.7);
  out[0] = SKY_HOR[0] + (SKY_ZEN[0] - SKY_HOR[0]) * t; out[1] = SKY_HOR[1] + (SKY_ZEN[1] - SKY_HOR[1]) * t; out[2] = SKY_HOR[2] + (SKY_ZEN[2] - SKY_HOR[2]) * t;
  const cs = Math.max(0, d[0] * L[0] + d[1] * L[1] + d[2] * L[2]), glow = 0.35 * Math.pow(cs, 6) + 0.12 * Math.pow(cs, 2);
  out[0] += glow * 0.95; out[1] += glow * 0.88; out[2] += glow * 0.7;
  return out;
}
function cloudAt(m, d, out) {
  if (d[1] < 0.02) return 0;
  const t = 1400 / d[1], x = d[0] * t, z = d[2] * t, s = m.sky.seed;
  const n = fbm(x / 1100 + s, z / 1100 - s * 0.7, 5, 0);
  const cov = smooth(m.sky.cover, m.sky.cover + 0.17, n) * smooth(0.02, 0.12, d[1]);
  if (cov <= 0) return 0;
  const sh = fbm(x / 500 + 3 * s, z / 500, 3, 0);
  out[0] = CLOUD[0] + (CLOUD_SH[0] - CLOUD[0]) * sh * 0.9; out[1] = CLOUD[1] + (CLOUD_SH[1] - CLOUD[1]) * sh * 0.9; out[2] = CLOUD[2] + (CLOUD_SH[2] - CLOUD[2]) * sh * 0.9;
  return cov * 0.85;
}
function treeTop(m, az) {
  const s = m.trees.seed, u = az * 40;
  return m.trees.h0 + m.trees.h1 * fbm(u * 0.25 + s, s * 0.31, 3, 0) + 2.6 * Math.max(0, vnoise(u * 1.3 + s, 7.7) - 0.25);
}
export const GROUNDS = {
  lawn: [{ base: '#6b983f', dark: '#557c31', light: '#86ad53' }, { base: '#7c9b48', dark: '#62803a', light: '#97b35f' }],
  plaza: [{ a: '#c9c3b6', b: '#b7b0a2', g: '#8f897d' }, { a: '#c8b79c', b: '#b39f83', g: '#8b7a62' }, { a: '#b9bcc0', b: '#a3a7ad', g: '#7d8186' }],
  asphalt: [{ a: '#4f5256', b: '#62666b' }, { a: '#585b5e', b: '#6c7075' }],
  court: [{ a: '#b58a5b', b: '#c49b6b', g: '#8d6a43' }, { a: '#8f9a8c', b: '#a1ac9e', g: '#6e786b' }],
};
const PAINT = lin('#efece2');
function paint(G, x, z, fp, out) {
  if (G.lines) {
    for (const [x0, z0, x1, z1, w] of G.lines) {
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      const t = clamp01(((x - x0) * dx + (z - z0) * dz) / l2), px = x0 + dx * t - x, pz = z0 + dz * t - z;
      const d = Math.hypot(px, pz), a = clamp01((w / 2 - d) / Math.max(fp, 1e-4) + 0.5) * 0.9;
      if (a > 0) { out[0] += (PAINT[0] - out[0]) * a; out[1] += (PAINT[1] - out[1]) * a; out[2] += (PAINT[2] - out[2]) * a; }
    }
  }
  if (G.discs) {
    for (const [cx, cz, r, hex] of G.discs) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > r + fp * 2) continue;
      const col = lin(hex);
      const ring = clamp01((d - (r - 0.1)) / Math.max(fp, 1e-4) + 0.5) * clamp01((r - d) / Math.max(fp, 1e-4) + 0.5);
      const fill = clamp01((r - 0.1 - d) / Math.max(fp, 1e-4) + 0.5);
      if (fill > 0) { const a = 0.9 * fill; out[0] += (col[0] - out[0]) * a; out[1] += (col[1] - out[1]) * a; out[2] += (col[2] - out[2]) * a; }
      if (ring > 0) { const a = 0.92 * ring; out[0] += (PAINT[0] - out[0]) * a; out[1] += (PAINT[1] - out[1]) * a; out[2] += (PAINT[2] - out[2]) * a; }
    }
  }
}
function groundAlbedo(m, x, z, fp, out) {
  const G = m.ground;
  if (G.kind === 'lawn') {
    const P = GROUNDS.lawn[G.v], A = lin(P.dark), Bc = lin(P.light), C0 = lin(P.base);
    const ca = Math.cos(G.ang * DEG), sa = Math.sin(G.ang * DEG), u = (x * ca + z * sa) / G.stripe;
    const soft = clamp01(fp / G.stripe * 5), sq = Math.sin(u * Math.PI);
    const st = 0.5 + 0.5 * (soft >= 1 ? 0 : Math.max(-1, Math.min(1, sq / Math.max(0.08, soft)))) * (1 - soft);
    const big = fbm(x * 0.07 + G.seed, z * 0.07, 3, fp * 0.07), mid = fbm(x * 0.8, z * 0.8 + G.seed, 3, fp * 0.8), fine = fbm(x * 7, z * 7, 2, fp * 7);
    const k = clamp01(0.5 + 0.34 * (st - 0.5) + 0.45 * (big - 0.5) + 0.3 * (mid - 0.5) + 0.25 * (fine - 0.5));
    if (k < 0.5) { const t = k * 2; out[0] = A[0] + (C0[0] - A[0]) * t; out[1] = A[1] + (C0[1] - A[1]) * t; out[2] = A[2] + (C0[2] - A[2]) * t; }
    else { const t = (k - 0.5) * 2; out[0] = C0[0] + (Bc[0] - C0[0]) * t; out[1] = C0[1] + (Bc[1] - C0[1]) * t; out[2] = C0[2] + (Bc[2] - C0[2]) * t; }
  } else if (G.kind === 'asphalt') {
    const P = GROUNDS.asphalt[G.v], A = lin(P.a), Bc = lin(P.b);
    const n = fbm(x * 0.5 + G.seed, z * 0.5, 3, fp * 0.5), g = fbm(x * 9, z * 9 + G.seed, 2, fp * 9), big = fbm(x * 0.09, z * 0.09 + G.seed, 2, 0);
    const k = clamp01(0.45 + 0.6 * (n - 0.5) + 0.4 * (g - 0.5) + 0.5 * (big - 0.5));
    out[0] = A[0] + (Bc[0] - A[0]) * k; out[1] = A[1] + (Bc[1] - A[1]) * k; out[2] = A[2] + (Bc[2] - A[2]) * k;
  } else {
    const P = GROUNDS[G.kind][G.v], A = lin(P.a), Bc = lin(P.b), Gr = lin(P.g);
    const ca = Math.cos(G.ang * DEG), sa = Math.sin(G.ang * DEG), u = x * ca + z * sa, w = -x * sa + z * ca, T = G.tile;
    const tt = hash2(Math.floor(u / T) + 31 * G.seed, Math.floor(w / T) - 17 * G.seed), n = fbm(x * 1.5, z * 1.5, 3, fp * 1.5), gr = fbm(x * 9, z * 9, 2, fp * 9);
    const k = clamp01(0.1 + 0.7 * tt + 0.4 * (n - 0.5) + 0.2 * (gr - 0.5));
    out[0] = A[0] + (Bc[0] - A[0]) * k; out[1] = A[1] + (Bc[1] - A[1]) * k; out[2] = A[2] + (Bc[2] - A[2]) * k;
    const j = Math.max(lineMask(u, T, 0.012, fp), lineMask(w, T, 0.012, fp));
    if (j > 0) { out[0] += (Gr[0] - out[0]) * 0.8 * j; out[1] += (Gr[1] - out[1]) * 0.8 * j; out[2] += (Gr[2] - out[2]) * 0.8 * j; }
  }
  paint(G, x, z, fp, out);
  return out;
}

export function renderBackground(m, q) {
  const c = camOf(m), L = sunDir(m), W = Math.round(VIEW.w * q), H = Math.round(VIEW.h * q), N = W * H;
  const bg8 = new Uint8ClampedArray(N * 4), gm = new Uint8Array(N), gLit = new Float32Array(N * 3), gHaze = new Float32Array(N * 3);
  const gx = new Float32Array(N), gz = new Float32Array(N), dirs = new Float32Array(N * 3);
  const S = [SUN_COL[0] * L[1], SUN_COL[1] * L[1], SUN_COL[2] * L[1]];
  const kmin = [AMB[0] / (AMB[0] + S[0]), AMB[1] / (AMB[1] + S[1]), AMB[2] / (AMB[2] + S[2])];
  const d = [0, 0, 0], alb = [0, 0, 0], sky = [0, 0, 0], cl = [0, 0, 0], horz = skyCol([0, 0, 1], L, [0, 0, 0]);
  const pixAng = 1 / (c.f * q), Dt = m.trees.dist;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      dirOf(c, (px + 0.5) / q, (py + 0.5) / q, d);
      dirs[i * 3] = d[0]; dirs[i * 3 + 1] = d[1]; dirs[i * 3 + 2] = d[2];
      const hl = Math.hypot(d[0], d[2]), el = Math.atan2(d[1], hl), az = Math.atan2(d[0], d[2]);
      const yw = c.h + Dt * Math.tan(el), top = treeTop(m, az);
      const treeCov = clamp01((top - yw) / (Dt * pixAng) + 0.5);
      let r, g, b;
      if (d[1] < 0 && c.h / -d[1] * hl < Dt) {
        const t = c.h / -d[1], x = d[0] * t, z = d[2] * t, fp = t * pixAng / Math.max(0.06, -d[1]);
        groundAlbedo(m, x, z, fp, alb);
        const hz = 1 - Math.exp(-t / 900);
        const lr = alb[0] * (AMB[0] + S[0]) * (1 - hz), lg = alb[1] * (AMB[1] + S[1]) * (1 - hz), lb = alb[2] * (AMB[2] + S[2]) * (1 - hz);
        gm[i] = 1; gLit[i * 3] = lr; gLit[i * 3 + 1] = lg; gLit[i * 3 + 2] = lb;
        gHaze[i * 3] = horz[0] * hz; gHaze[i * 3 + 1] = horz[1] * hz; gHaze[i * 3 + 2] = horz[2] * hz;
        gx[i] = x; gz[i] = z;
        r = lr + horz[0] * hz; g = lg + horz[1] * hz; b = lb + horz[2] * hz;
        const near = clamp01((c.h / -d[1] * hl - (Dt - 25)) / 25);
        if (near > 0) { const k = 1 - 0.35 * near; r *= k; g *= k; b *= k; }
      } else {
        skyCol(d, L, sky);
        const ca = cloudAt(m, d, cl);
        r = sky[0] + (cl[0] - sky[0]) * ca; g = sky[1] + (cl[1] - sky[1]) * ca; b = sky[2] + (cl[2] - sky[2]) * ca;
        if (d[1] < 0) { r = horz[0]; g = horz[1]; b = horz[2]; }
      }
      if (treeCov > 0 && (d[1] >= 0 || c.h / -d[1] * hl >= Dt - 1)) {
        const v = clamp01((yw - 0.5) / Math.max(1, top - 0.5));
        const n = fbm(az * 900 + m.trees.seed, el * 900, 3, 0), n2 = fbm(az * 160, el * 160 + 5, 2, 0);
        const kk = clamp01(0.25 + 0.55 * v + 0.35 * (n - 0.5) + 0.3 * (n2 - 0.5));
        let tr, tg, tb;
        if (yw < 0.25 * top && n2 < 0.45) { tr = TRUNK[0]; tg = TRUNK[1]; tb = TRUNK[2]; }
        else if (kk < 0.5) { const t = kk * 2; tr = TREE[0][0] + (TREE[1][0] - TREE[0][0]) * t; tg = TREE[0][1] + (TREE[1][1] - TREE[0][1]) * t; tb = TREE[0][2] + (TREE[1][2] - TREE[0][2]) * t; }
        else { const t = (kk - 0.5) * 2; tr = TREE[1][0] + (TREE[2][0] - TREE[1][0]) * t; tg = TREE[1][1] + (TREE[2][1] - TREE[1][1]) * t; tb = TREE[1][2] + (TREE[2][2] - TREE[1][2]) * t; }
        const lit = 0.55 + 0.5 * L[1], hz = 1 - Math.exp(-Dt / 900);
        tr = tr * lit * (1 - hz) + horz[0] * hz; tg = tg * lit * (1 - hz) + horz[1] * hz; tb = tb * lit * (1 - hz) + horz[2] * hz;
        r += (tr - r) * treeCov; g += (tg - g) * treeCov; b += (tb - b) * treeCov;
        if (gm[i] && treeCov > 0.5) gm[i] = 0;
      }
      bg8[i * 4] = tone(r); bg8[i * 4 + 1] = tone(g); bg8[i * 4 + 2] = tone(b); bg8[i * 4 + 3] = 255;
    }
  }
  return { q, W, H, bg8, gm, gLit, gHaze, gx, gz, dirs, kmin, cam: c, L,
    zb: new Float32Array(N), idb: new Int16Array(N), stamp: new Uint32Array(N), fr: 0 };
}

export const yawAx = (yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return { u: [c, 0, -s], v: [0, 1, 0], w: [s, 0, c] }; };
export function axesFrom(w, up = [0, 1, 0]) {
  w = norm(w);
  let u = cross(up, w); if (Math.hypot(...u) < 1e-6) u = cross([1, 0, 0], w);
  u = norm(u);
  const v = cross(w, u);
  return { u, v, w };
}
export const sphere = (c, r, col, o = {}) => ({ k: 0, c, r, br: r, col, ...o });
export const box = (c, h, ax, col, o = {}) => ({ k: 1, c, h, u: ax.u, v: ax.v, w: ax.w, br: Math.hypot(h[0], h[1], h[2]), col, ...o });
export const cyl = (c, ax, r, hl, col, o = {}) => ({ k: 2, c, r, hl, u: ax.u, v: ax.v, w: ax.w, br: Math.hypot(r, hl), col, ...o });
const EPS = 1e-4;
function hitSphere(p, o, d) {
  const ox = o[0] - p.c[0], oy = o[1] - p.c[1], oz = o[2] - p.c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - p.r * p.r, disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > EPS ? t : Infinity;
}
function hitBox(p, o, d) {
  const rx = o[0] - p.c[0], ry = o[1] - p.c[1], rz = o[2] - p.c[2], u = p.u, v = p.v, w = p.w;
  const lo = [rx * u[0] + ry * u[1] + rz * u[2], rx * v[0] + ry * v[1] + rz * v[2], rx * w[0] + ry * w[1] + rz * w[2]];
  const ld = [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * w[0] + d[1] * w[1] + d[2] * w[2]];
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const h = p.h[i];
    if (Math.abs(ld[i]) < 1e-9) { if (Math.abs(lo[i]) > h) return Infinity; continue; }
    let a = (-h - lo[i]) / ld[i], b = (h - lo[i]) / ld[i];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0 > EPS ? t0 : Infinity;
}
function hitCyl(p, o, d) {
  const rx = o[0] - p.c[0], ry = o[1] - p.c[1], rz = o[2] - p.c[2], u = p.u, v = p.v, w = p.w;
  const lox = rx * u[0] + ry * u[1] + rz * u[2], loy = rx * v[0] + ry * v[1] + rz * v[2], loz = rx * w[0] + ry * w[1] + rz * w[2];
  const ldx = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], ldy = d[0] * v[0] + d[1] * v[1] + d[2] * v[2], ldz = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
  let best = Infinity;
  const a = ldx * ldx + ldy * ldy;
  if (a > 1e-12) {
    const bq = lox * ldx + loy * ldy, cq = lox * lox + loy * loy - p.r * p.r, disc = bq * bq - a * cq;
    if (disc >= 0) { const t = (-bq - Math.sqrt(disc)) / a; if (t > EPS && Math.abs(loz + t * ldz) <= p.hl) best = t; }
  }
  if (Math.abs(ldz) > 1e-9) {
    for (const s of [-1, 1]) {
      const t = (s * p.hl - loz) / ldz;
      if (t > EPS && t < best) { const x = lox + t * ldx, y = loy + t * ldy; if (x * x + y * y <= p.r * p.r) best = t; }
    }
  }
  return best;
}
export function hitPrim(p, o, d) { return p.k === 0 ? hitSphere(p, o, d) : p.k === 1 ? hitBox(p, o, d) : hitCyl(p, o, d); }
function hitInfo(p, P, inf) {
  const rx = P[0] - p.c[0], ry = P[1] - p.c[1], rz = P[2] - p.c[2];
  if (p.k === 0) {
    const nx = rx / p.r, ny = ry / p.r, nz = rz / p.r;
    inf.n[0] = nx; inf.n[1] = ny; inf.n[2] = nz;
    if (p.u) { inf.lp[0] = nx * p.u[0] + ny * p.u[1] + nz * p.u[2]; inf.lp[1] = nx * p.v[0] + ny * p.v[1] + nz * p.v[2]; inf.lp[2] = nx * p.w[0] + ny * p.w[1] + nz * p.w[2]; }
    else { inf.lp[0] = nx; inf.lp[1] = ny; inf.lp[2] = nz; }
    inf.ln[0] = inf.lp[0]; inf.ln[1] = inf.lp[1]; inf.ln[2] = inf.lp[2];
    return;
  }
  const u = p.u, v = p.v, w = p.w;
  const lx = rx * u[0] + ry * u[1] + rz * u[2], ly = rx * v[0] + ry * v[1] + rz * v[2], lz = rx * w[0] + ry * w[1] + rz * w[2];
  inf.lp[0] = lx; inf.lp[1] = ly; inf.lp[2] = lz;
  if (p.k === 1) {
    const a = Math.abs(lx) / p.h[0], b = Math.abs(ly) / p.h[1], c = Math.abs(lz) / p.h[2];
    inf.ln[0] = inf.ln[1] = inf.ln[2] = 0;
    if (a >= b && a >= c) { const s = lx > 0 ? 1 : -1; inf.ln[0] = s; inf.n[0] = u[0] * s; inf.n[1] = u[1] * s; inf.n[2] = u[2] * s; }
    else if (b >= c) { const s = ly > 0 ? 1 : -1; inf.ln[1] = s; inf.n[0] = v[0] * s; inf.n[1] = v[1] * s; inf.n[2] = v[2] * s; }
    else { const s = lz > 0 ? 1 : -1; inf.ln[2] = s; inf.n[0] = w[0] * s; inf.n[1] = w[1] * s; inf.n[2] = w[2] * s; }
  } else {
    if (Math.abs(lz) > p.hl - 1e-3) { const s = lz > 0 ? 1 : -1; inf.ln[0] = 0; inf.ln[1] = 0; inf.ln[2] = s; inf.n[0] = w[0] * s; inf.n[1] = w[1] * s; inf.n[2] = w[2] * s; }
    else {
      const l = Math.hypot(lx, ly) || 1, cx = lx / l, cy = ly / l;
      inf.ln[0] = cx; inf.ln[1] = cy; inf.ln[2] = 0;
      inf.n[0] = u[0] * cx + v[0] * cy; inf.n[1] = u[1] * cx + v[1] * cy; inf.n[2] = u[2] * cx + v[2] * cy;
    }
  }
}

const JIT = [[0, 0], [0.035, 0], [-0.035, 0], [0, 0.035], [0, -0.035]];
function occluded(prims, o, L, skip) {
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    if (i === skip || p.noShadow) continue;
    const wx = p.c[0] - o[0], wy = p.c[1] - o[1], wz = p.c[2] - o[2], pr = wx * L[0] + wy * L[1] + wz * L[2];
    if (pr < -p.br) continue;
    if (wx * wx + wy * wy + wz * wz - pr * pr > p.br * p.br) continue;
    if (hitPrim(p, o, L) < Infinity) return true;
  }
  return false;
}
function groundFoot(prims, gx, gz) {
  let ao = 1;
  for (const p of prims) {
    const f = p.foot; if (!f) continue;
    let s;
    if (f.r !== undefined) s = Math.hypot(gx - f.x, gz - f.z) - f.r;
    else { const c = Math.cos(f.yaw), sn = Math.sin(f.yaw), dx = gx - f.x, dz = gz - f.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c; s = Math.hypot(Math.max(0, Math.abs(lx) - f.hx), Math.max(0, Math.abs(lz) - f.hz)); }
    if (s < 0.9) ao *= 1 - (p.aoK ?? 0.5) * Math.exp(-Math.pow(Math.max(0, s) / 0.28, 2));
  }
  return ao;
}
const INF = { n: [0, 0, 0], lp: [0, 0, 0], ln: [0, 0, 0] }, SKT = [0, 0, 0], SKC = [0, 0, 0];
function shadeHit(B, prims, pi, t, d, out) {
  const p = prims[pi], c = B.cam, L = B.L;
  const P = [d[0] * t, c.h + d[1] * t, d[2] * t];
  hitInfo(p, P, INF);
  const n = INF.n;
  let base = p.tex ? p.tex(INF.lp, INF.ln, p) : undefined; if (!base) base = p.col;
  const ndl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  let vis = 0;
  if (ndl > 0) vis = occluded(prims, [P[0] + n[0] * 0.01, P[1] + n[1] * 0.01, P[2] + n[2] * 0.01], L, pi) ? 0 : 1;
  const hemi = 0.5 + 0.5 * n[1];
  let ao = 1; if (P[1] < 0.7) ao = 0.78 + 0.22 * clamp01(P[1] / 0.7);
  const ar = (GB[0] + (AMB[0] - GB[0]) * hemi) * ao, ag = (GB[1] + (AMB[1] - GB[1]) * hemi) * ao, ab = (GB[2] + (AMB[2] - GB[2]) * hemi) * ao;
  const dif = Math.max(0, ndl) * vis;
  let r = base[0] * (ar + SUN_COL[0] * dif), g = base[1] * (ag + SUN_COL[1] * dif), b = base[2] * (ab + SUN_COL[2] * dif);
  const gl = p.gloss ?? 0.15;
  if (vis > 0 && gl > 0) {
    let hx = L[0] - d[0], hy = L[1] - d[1], hz = L[2] - d[2]; const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
    const nh = Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz), sp = gl * Math.pow(nh, p.shin ?? 40);
    r += SUN_COL[0] * sp; g += SUN_COL[1] * sp; b += SUN_COL[2] * sp;
  }
  const ndv = Math.max(0, -(n[0] * d[0] + n[1] * d[1] + n[2] * d[2])), fr = 0.03 + 0.14 * Math.pow(1 - ndv, 4);
  const k2 = 2 * (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
  SKT[0] = d[0] - k2 * n[0]; SKT[1] = Math.abs(d[1] - k2 * n[1]); SKT[2] = d[2] - k2 * n[2];
  skyCol(SKT, L, SKC);
  out[0] = r * (1 - fr) + SKC[0] * fr; out[1] = g * (1 - fr) + SKC[1] * fr; out[2] = b * (1 - fr) + SKC[2] * fr;
  if (p.emis) { out[0] += p.emis[0]; out[1] += p.emis[1]; out[2] += p.emis[2]; }
}
function boxOf(B, p) {
  const c = B.cam, q = B.q, W = B.W, H = B.H, C = p.c, br = p.br;
  const dist = Math.hypot(C[0], C[1] - c.h, C[2]);
  const s = proj(c, C[0], C[1], C[2]);
  if (dist <= br * 1.05 + 0.2 || s[2] < br) return [0, 0, W - 1, H - 1];
  const a = Math.asin(Math.min(1, br / dist)), rpx = c.f * Math.tan(a) * 1.4 + 3;
  return [Math.max(0, Math.floor((s[0] - rpx) * q)), Math.max(0, Math.floor((s[1] - rpx) * q)), Math.min(W - 1, Math.ceil((s[0] + rpx) * q)), Math.min(H - 1, Math.ceil((s[1] + rpx) * q))];
}
export function frameInto(m, B, prims, out8) {
  const c = B.cam, L = B.L, q = B.q, W = B.W, H = B.H, eye = [0, c.h, 0];
  out8.set(B.bg8);
  B.fr++;
  const fr = B.fr;
  const lh = Math.hypot(L[0], L[2]) || 1, ua = [-L[0] / lh, -L[2] / lh];
  const ep = [0, 0, 0], Ls = [0, 0, 0], e1 = norm(cross(L, [0, 1, 0])), e2 = cross(L, e1);
  prims.forEach((p) => {
    if (p.noShadow && !p.foot) return;
    const C = p.c, t = Math.max(0, C[1]) / L[1], G = [C[0] - L[0] * t, C[2] - L[2] * t], ra = p.br / L[1] + 0.7, rp = p.br + 0.7;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, X = G[0] + ua[0] * ra * Math.cos(a) - ua[1] * rp * Math.sin(a), Z = G[1] + ua[1] * ra * Math.cos(a) + ua[0] * rp * Math.sin(a);
      const s = proj(c, X, 0, Z);
      if (s[2] < 0.25) { y1 = VIEW.h; continue; }
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
    }
    if (!(x1 > x0)) return;
    const X0 = Math.max(0, Math.floor(x0 * q) - 1), X1 = Math.min(W - 1, Math.ceil(x1 * q) + 1), Y0 = Math.max(0, Math.floor(y0 * q) - 1), Y1 = Math.min(H - 1, Math.ceil(y1 * q) + 1);
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      const j = py * W + px; if (!B.gm[j] || B.stamp[j] === fr) continue;
      B.stamp[j] = fr;
      ep[0] = B.gx[j]; ep[1] = 0.012; ep[2] = B.gz[j];
      let v = 0;
      for (const [a, b] of JIT) {
        Ls[0] = L[0] + a * e1[0] + b * e2[0]; Ls[1] = L[1] + a * e1[1] + b * e2[1]; Ls[2] = L[2] + a * e1[2] + b * e2[2];
        const l = Math.hypot(Ls[0], Ls[1], Ls[2]); Ls[0] /= l; Ls[1] /= l; Ls[2] /= l;
        if (!occluded(prims, ep, Ls, -1)) v += 1;
      }
      v /= JIT.length;
      const ao = groundFoot(prims, ep[0], ep[2]);
      if (v >= 0.999 && ao >= 0.999) continue;
      for (let ch = 0; ch < 3; ch++) out8[j * 4 + ch] = tone(B.gLit[j * 3 + ch] * (B.kmin[ch] + (1 - B.kmin[ch]) * v) * ao + B.gHaze[j * 3 + ch]);
    }
  });
  B.zb.fill(Infinity); B.idb.fill(-1);
  const boxes = prims.map((p) => boxOf(B, p));
  prims.forEach((p, i) => {
    const [X0, Y0, X1, Y1] = boxes[i];
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      const j = py * W + px, o = j * 3;
      const t = hitPrim(p, eye, [B.dirs[o], B.dirs[o + 1], B.dirs[o + 2]]);
      if (t < B.zb[j]) { B.zb[j] = t; B.idb[j] = i; }
    }
  });
  const col = [0, 0, 0], d = [0, 0, 0];
  const edge = (j, px, py) => {
    const id = B.idb[j];
    return (px > 0 && B.idb[j - 1] !== id) || (px < W - 1 && B.idb[j + 1] !== id) || (py > 0 && B.idb[j - W] !== id) || (py < H - 1 && B.idb[j + W] !== id);
  };
  const stamp2 = ++B.fr;
  prims.forEach((p, i) => {
    const [X0, Y0, X1, Y1] = boxes[i];
    for (let py = Math.max(0, Y0 - 1); py <= Math.min(H - 1, Y1 + 1); py++) for (let px = Math.max(0, X0 - 1); px <= Math.min(W - 1, X1 + 1); px++) {
      const j = py * W + px; if (B.stamp[j] === stamp2) continue;
      const id = B.idb[j];
      if (id < 0 && !edge(j, px, py)) continue;
      B.stamp[j] = stamp2;
      if (!edge(j, px, py)) {
        const o = j * 3; d[0] = B.dirs[o]; d[1] = B.dirs[o + 1]; d[2] = B.dirs[o + 2];
        shadeHit(B, prims, id, B.zb[j], d, col);
        out8[j * 4] = tone(col[0]); out8[j * 4 + 1] = tone(col[1]); out8[j * 4 + 2] = tone(col[2]);
        continue;
      }
      let a0 = 0, a1 = 0, a2 = 0, hits = 0;
      const bgr = [out8[j * 4], out8[j * 4 + 1], out8[j * 4 + 2]];
      const cand = []; boxes.forEach((bx, k) => { if (px >= bx[0] - 1 && px <= bx[2] + 1 && py >= bx[1] - 1 && py <= bx[3] + 1) cand.push(k); });
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        dirOf(c, (px + (sx + 0.5) / 3) / q, (py + (sy + 0.5) / 3) / q, d);
        let bt = Infinity, bi = -1;
        for (const k of cand) { const t = hitPrim(prims[k], eye, d); if (t < bt) { bt = t; bi = k; } }
        if (bi < 0) { a0 += bgr[0]; a1 += bgr[1]; a2 += bgr[2]; continue; }
        shadeHit(B, prims, bi, bt, d, col);
        a0 += tone(col[0]); a1 += tone(col[1]); a2 += tone(col[2]); hits++;
      }
      out8[j * 4] = a0 / 9; out8[j * 4 + 1] = a1 / 9; out8[j * 4 + 2] = a2 / 9;
    }
  });
  return out8;
}

export function screenBox(c, p) {
  const pts = [];
  if (p.k === 0) {
    const w = [-p.c[0], c.h - p.c[1], -p.c[2]], d2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2], dd = Math.sqrt(d2), r = p.r;
    const cc = mul(w, r * r / d2), rho = r * Math.sqrt(Math.max(0, 1 - r * r / d2)), n = mul(w, 1 / dd);
    const a1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), a2 = cross(n, a1);
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; pts.push(add(add(p.c, cc), add(mul(a1, Math.cos(a) * rho), mul(a2, Math.sin(a) * rho)))); }
  } else if (p.k === 1) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(add(p.c, add(mul(p.u, sx * p.h[0]), add(mul(p.v, sy * p.h[1]), mul(p.w, sz * p.h[2])))));
  } else {
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; pts.push(add(p.c, add(mul(p.w, s * p.hl), add(mul(p.u, Math.cos(a) * p.r), mul(p.v, Math.sin(a) * p.r))))); }
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const P of pts) { const s = proj(c, P[0], P[1], P[2]); if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0]; if (s[1] < y0) y0 = s[1]; if (s[1] > y1) y1 = s[1]; }
  return [x0, y0, x1, y1];
}
export const boxUnion = (bs) => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
export const boxArea = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
export function boxInter(a, b) { return boxArea([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]); }
export function hiddenBy(c, occ, P) {
  const eye = [0, c.h, 0], v = sub(P, eye), dist = Math.hypot(...v), d = mul(v, 1 / dist);
  for (const p of occ) if (hitPrim(p, eye, d) < dist - 0.02) return true;
  return false;
}
export function sphereHidden(c, S, occ) {
  const eye = [0, c.h, 0], w = norm(sub(eye, S.c)), a1 = norm(cross(w, Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), a2 = cross(w, a1);
  let hid = 0, tot = 0;
  for (const [fa, fb, fc] of [[1, 0, 0], [0.6, 0.8, 0], [0.6, -0.8, 0], [0.6, 0, 0.8], [0.6, 0, -0.8], [0.8, 0.45, 0.35], [0.8, -0.45, 0.35], [0.8, 0.45, -0.35], [0.8, -0.45, -0.35], [0.3, 0.95, 0], [0.3, -0.95, 0], [0.3, 0, 0.95], [0.3, 0, -0.95]]) {
    const n = norm(add(add(mul(w, fa), mul(a1, fb)), mul(a2, fc)));
    const P = add(S.c, mul(n, S.r));
    tot++; if (hiddenBy(c, occ, P)) hid++;
  }
  return hid / tot;
}

export const BTN = { y: VIEW.h + 8, h: 44 };
export const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 4 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
export const frameIndex = (m, t) => { const k = Math.round(t / m.dt); return ((k % m.n) + m.n) % m.n; };
function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
function drawIcon(g, kind, cx, cy, hex, label) {
  g.save();
  if (kind === 'number') {
    g.fillStyle = '#3c4955'; g.font = '700 20px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, cx, cy + 1);
  } else {
    g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fillStyle = hex; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.ellipse(cx - 3.5, cy - 4.5, 2.6, 2, -0.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
  }
  g.restore();
}
export function makeTask(cfg) {
  const NAME = cfg.name;
  const buttonsOf = (m) => buttonRects(m.buttons.map((b) => ({ id: b.id, a: { op: 'pick', id: b.id } })), { x: 2, y: BTN.y, w: BOARD.w - 4, h: BTN.h }, 8);
  const view = (env) => (env._g5 ??= { m: null, q: 0, B: null, img: null, canvas: null, k: -1, ms: [], bgMs: 0 });
  function drawView(g, env) {
    const m = env.manifest, V = view(env), q = Math.min(2, contextScale(g));
    if (V.m !== m || V.q !== q) {
      const t0 = now();
      V.m = m; V.q = q; V.B = renderBackground(m, q); V.k = -1;
      V.img = new ImageData(V.B.W, V.B.H);
      V.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(V.B.W, V.B.H) : Object.assign(document.createElement('canvas'), { width: V.B.W, height: V.B.H });
      V.bgMs = Math.round(now() - t0);
    }
    const k = frameIndex(m, env.state.t);
    if (k !== V.k) {
      const t0 = now();
      frameInto(m, V.B, cfg.primsAt(m, k), V.img.data);
      V.canvas.getContext('2d').putImageData(V.img, 0, 0);
      V.k = k; V.ms.push(Math.round(now() - t0)); if (V.ms.length > 200) V.ms.shift();
    }
    g.save();
    g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(V.canvas, 0, 0, VIEW.w, VIEW.h);
    g.restore();
    g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
  }
  function drawButtons(g, env) {
    const m = env.manifest, sel = env.state.pick, off = !!env.submitted;
    for (const b of buttonsOf(m)) {
      const def = m.buttons.find((x) => x.id === b.id), on = sel === b.id;
      rr(g, b.x, b.y, b.w, b.h, 9);
      g.fillStyle = on ? '#e2efff' : off ? '#f4f5f7' : '#eef2f6'; g.fill();
      g.strokeStyle = on ? ACCENT : '#c8d0d8'; g.lineWidth = on ? 2.4 : 1; g.stroke();
      drawIcon(g, cfg.buttonKind, b.x + b.w / 2, b.y + b.h / 2, def.hex, def.label);
      if (on) {
        const bx = b.x + b.w - 11, by = b.y + 11;
        g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.beginPath(); g.moveTo(bx - 3.2, by + 0.2); g.lineTo(bx - 0.8, by + 2.6); g.lineTo(bx + 3.4, by - 2.4); g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      }
    }
  }
  return {
    meta: {
      name: NAME, family: 'F16', 
      panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
      actionSpace: [{ op: 'pick', id: cfg.pickNote, note: 'press one answer button below the picture; press it again to clear (revisable until Verify)' }],
      promptHuman: cfg.prompt,
    },
    generate: cfg.generate,
    frames(m) { return { n: m.n, period: m.n * m.dt }; },
    init() { return { ...clockState(), pick: null, taps: 0 }; },
    applyAction(st, a, m) {
      if (!a || !['wait', 'pick'].includes(a.op)) return { ok: false, reason: 'bad-op' };
      if (a.op === 'wait') {
        const sec = a.sec ?? m.dt;
        if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
        st.t += sec; st.steps++;
        return { ok: true };
      }
      if (!m.buttons.some((b) => b.id === a.id)) return { ok: false, reason: 'no-such-answer' };
      st.pick = st.pick === a.id ? null : a.id; st.taps++;
      return { ok: true };
    },
    verify(st, m) {
      const ok = st.pick === m.answer;
      return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { picked: st.pick, answer: m.answer, frame: frameIndex(m, st.t) + 1, of: m.n, taps: st.taps } };
    },
    oracle(m) { return [...Array.from({ length: m.n - 1 }, () => ({ op: 'wait', sec: m.dt })), { op: 'pick', id: m.answer }]; },
    randomPolicy(m, rnd) { return [{ op: 'pick', id: m.buttons[Math.floor(rnd() * m.buttons.length)].id }]; },
    drawPrompt(g, r) { drawPromptText(g, r, cfg.prompt, cfg.sub); },
    tick() { return false; },
    drawBoard(g, br, env) {
      g.save(); g.translate(br.x, br.y);
      g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
      drawView(g, env);
      drawButtons(g, env);
      g.restore();
    },
    pointer(evt, env) {
      if (evt.type !== 'down' || env.submitted) return [];
      const b = hitButton(buttonsOf(env.manifest), evt.x, evt.y);
      return b ? [{ ...b.a }] : [];
    },
    footerStatus(env) { const p = env.state.pick; return p ? `Selected: ${env.manifest.buttons.find((b) => b.id === p)?.label ?? p}` : 'Nothing selected'; },
    gate: cfg.gate,
    primsAt: cfg.primsAt,
  };
}
