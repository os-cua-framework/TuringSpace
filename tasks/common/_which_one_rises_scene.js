export const VIEW = { w: 380, h: 384 };
export const FOVY = 50;
export const ELONG = 1.1;
const DEG = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const PALETTE = [
  { name: 'red', hex: '#d8322a' },
  { name: 'orange', hex: '#f2851c' },
  { name: 'yellow', hex: '#f4cf1f' },
  { name: 'green', hex: '#2f9e45' },
  { name: 'teal', hex: '#17a6a3' },
  { name: 'blue', hex: '#2c55cc' },
  { name: 'purple', hex: '#8a45c8' },
  { name: 'pink', hex: '#f06aa8' },
];
export function lin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
}

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
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const w = clamp01(1.6 - 2.2 * fp * f);
    s += amp * (0.5 + w * (vnoise(x * f + o * 17.31, y * f - o * 11.17) - 0.5));
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
function lineMask(u, period, hw, fp) {
  const d = Math.abs(u / period - Math.round(u / period)) * period;
  const sharp = clamp01((hw - d) / Math.max(fp, 1e-6) + 0.5);
  const avg = Math.min(1, 2 * hw / period);
  const blend = clamp01((fp / period - 0.2) / 0.5);
  return sharp * (1 - blend) + avg * blend;
}

export function camOf(m) {
  const p = m.cam.pitch * DEG, f = (VIEW.h / 2) / Math.tan(FOVY * DEG / 2), sp = Math.sin(p), cp = Math.cos(p);
  return { h: m.cam.h, f, cx: VIEW.w / 2, cy: VIEW.h / 2, sp, cp, hy: VIEW.h / 2 + f * sp / cp };
}
export function proj(c, x, y, z) {
  const dy = y - c.h, zc = dy * c.sp + z * c.cp, yc = dy * c.cp - z * c.sp;
  return [c.cx + c.f * x / zc, c.cy - c.f * yc / zc, zc];
}
export function dirOf(c, sx, sy, out = [0, 0, 0]) {
  const a = (sx - c.cx) / c.f, b = (c.cy - sy) / c.f;
  const dx = a, dy = c.sp + b * c.cp, dz = c.cp - b * c.sp, l = Math.hypot(dx, dy, dz);
  out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
  return out;
}
export function sunDir(m) {
  const a = m.sun.az * DEG, e = m.sun.el * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

export function centreAt(m, b, phi) {
  const u = clamp01(phi / m.T);
  return [b.p0[0] + (b.p1[0] - b.p0[0]) * u, b.p0[1] + (b.p1[1] - b.p0[1]) * u, b.p0[2] + (b.p1[2] - b.p0[2]) * u];
}
export const loopLen = (m) => m.T + m.hold;
export function sceneTime(m, t) { const L = loopLen(m), u = ((t % L) + L) % L; return Math.min(u, m.T); }

function silhouetteBox(c, C, r) {
  const E = [0, c.h, 0], k = ELONG;
  const w = [E[0] - C[0], (E[1] - C[1]) / k, E[2] - C[2]], d2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2], d = Math.sqrt(d2);
  const ccx = w[0] * r * r / d2, ccy = w[1] * r * r / d2, ccz = w[2] * r * r / d2, rho = r * Math.sqrt(Math.max(0, 1 - r * r / d2));
  const n = [w[0] / d, w[1] / d, w[2] / d];
  const t1 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u1 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
  const l1 = Math.hypot(...u1); u1 = u1.map((v) => v / l1);
  const u2 = [n[1] * u1[2] - n[2] * u1[1], n[2] * u1[0] - n[0] * u1[2], n[0] * u1[1] - n[1] * u1[0]];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, ca = Math.cos(a) * rho, sa = Math.sin(a) * rho;
    const px = C[0] + ccx + u1[0] * ca + u2[0] * sa, py = C[1] + k * (ccy + u1[1] * ca + u2[1] * sa), pz = C[2] + ccz + u1[2] * ca + u2[2] * sa;
    const q = proj(c, px, py, pz);
    if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
  }
  return [x0, y0, x1, y1];
}
export const knotOf = (b, C) => [C[0], C[1] - (b.D / 2) * ELONG - 0.03 * b.D, C[2]];
export function stringPts(b, C, n = 16) {
  const K = knotOf(b, C), out = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    out.push([K[0] + b.sway * Math.sin(s * Math.PI * 1.3) * 0.12 * b.str, K[1] - s * b.str, K[2] + b.sway * 0.05 * b.str * s]);
  }
  return out;
}
export const SUN_SOFT = 1.0 * DEG;
function shadowFootprint(m, b, C, L, pad = 0) {
  const r = b.D / 2, k = ELONG, t = C[1] / L[1], G = [C[0] - L[0] * t, 0, C[2] - L[2] * t];
  const lh = Math.hypot(L[0], L[2]) || 1, ua = [-L[0] / lh, 0, -L[2] / lh], up = [-ua[2], 0, ua[0]];
  const ra = r * k / L[1] + pad, rp = r + pad, pts = [];
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; pts.push([G[0] + ua[0] * ra * Math.cos(a) + up[0] * rp * Math.sin(a), 0, G[2] + ua[2] * ra * Math.cos(a) + up[2] * rp * Math.sin(a)]); }
  return { G, pts, along: Math.hypot(C[0] - G[0], C[1], C[2] - G[2]) };
}
export function look(m, phi, c = camOf(m), L = sunDir(m)) {
  return m.balloons.map((b) => {
    const C = centreAt(m, b, phi), bx = silhouetteBox(c, C, b.D / 2);
    const s = stringPts(b, C, 4), se = proj(c, ...s[s.length - 1]);
    const F = shadowFootprint(m, b, C, L), g = proj(c, F.G[0], 0, F.G[2]);
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity, behind = false;
    for (const p of F.pts) { const q = proj(c, p[0], 0, p[2]); if (q[2] < 0.2) behind = true; sx0 = Math.min(sx0, q[0]); sx1 = Math.max(sx1, q[0]); sy0 = Math.min(sy0, q[1]); sy1 = Math.max(sy1, q[1]); }
    const x = (bx[0] + bx[2]) / 2, y = (bx[1] + bx[3]) / 2, diam = (bx[2] - bx[0] + bx[3] - bx[1]) / 2;
    return { x, y, diam, box: bx, strEnd: [se[0], se[1]], C, sh: { x: g[0], y: g[1], box: [sx0, sy0, sx1, sy1], behind, G: F.G } };
  });
}
export const elevDiam = (c, q) => (c.hy - q.y) / q.diam;

const SUN_COL = [1.28, 1.2, 1.06], AMB = [0.4, 0.46, 0.56], GROUND_BOUNCE = [0.16, 0.19, 0.11];
const SKY_ZEN = lin('#4f88d2'), SKY_HOR = lin('#cfe1f0'), CLOUD = lin('#f7f8fa'), CLOUD_SH = lin('#c9d2de');
const TREE = [lin('#2f4a26'), lin('#3f5e2e'), lin('#567543')], TRUNK = lin('#3a3a2e');
export const GROUNDS = {
  lawn: [{ base: '#6b983f', dark: '#557c31', light: '#86ad53' }, { base: '#7c9b48', dark: '#62803a', light: '#97b35f' }, { base: '#5f8f3c', dark: '#4b762f', light: '#7aa651' }],
  plaza: [{ a: '#c9c3b6', b: '#b7b0a2', g: '#8f897d' }, { a: '#c8b79c', b: '#b39f83', g: '#8b7a62' }, { a: '#b9bcc0', b: '#a3a7ad', g: '#7d8186' }],
};
function skyCol(m, d, L, out) {
  const e = clamp01(d[1] * 1.6 + 0.02);
  const t = Math.pow(e, 0.7);
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
function groundAlbedo(m, x, z, fp, out) {
  const G = m.ground;
  if (G.kind === 'lawn') {
    const P = GROUNDS.lawn[G.v], A = lin(P.dark), B = lin(P.light), C0 = lin(P.base);
    const ca = Math.cos(G.ang * DEG), sa = Math.sin(G.ang * DEG), u = (x * ca + z * sa) / G.stripe;
    const soft = clamp01(fp / G.stripe * 5);
    const sq = Math.sin(u * Math.PI);
    const st = 0.5 + 0.5 * (soft >= 1 ? 0 : Math.max(-1, Math.min(1, sq / Math.max(0.08, soft)))) * (1 - soft);
    const big = fbm(x * 0.07 + G.seed, z * 0.07, 3, fp * 0.07), mid = fbm(x * 0.8, z * 0.8 + G.seed, 3, fp * 0.8), fine = fbm(x * 7, z * 7, 2, fp * 7);
    const k = clamp01(0.5 + 0.34 * (st - 0.5) + 0.45 * (big - 0.5) + 0.3 * (mid - 0.5) + 0.25 * (fine - 0.5));
    if (k < 0.5) { const t = k * 2; out[0] = A[0] + (C0[0] - A[0]) * t; out[1] = A[1] + (C0[1] - A[1]) * t; out[2] = A[2] + (C0[2] - A[2]) * t; }
    else { const t = (k - 0.5) * 2; out[0] = C0[0] + (B[0] - C0[0]) * t; out[1] = C0[1] + (B[1] - C0[1]) * t; out[2] = C0[2] + (B[2] - C0[2]) * t; }
  } else {
    const P = GROUNDS.plaza[G.v], A = lin(P.a), B = lin(P.b), Gr = lin(P.g);
    const ca = Math.cos(G.ang * DEG), sa = Math.sin(G.ang * DEG), u = x * ca + z * sa, w = -x * sa + z * ca, T = G.tile;
    const tt = hash2(Math.floor(u / T) + 31 * G.seed, Math.floor(w / T) - 17 * G.seed), n = fbm(x * 1.5, z * 1.5, 3, fp * 1.5), gr = fbm(x * 9, z * 9, 2, fp * 9);
    const k = clamp01(0.1 + 0.7 * tt + 0.4 * (n - 0.5) + 0.2 * (gr - 0.5));
    out[0] = A[0] + (B[0] - A[0]) * k; out[1] = A[1] + (B[1] - A[1]) * k; out[2] = A[2] + (B[2] - A[2]) * k;
    const j = Math.max(lineMask(u, T, 0.012, fp), lineMask(w, T, 0.012, fp));
    if (j > 0) { out[0] += (Gr[0] - out[0]) * 0.8 * j; out[1] += (Gr[1] - out[1]) * 0.8 * j; out[2] += (Gr[2] - out[2]) * 0.8 * j; }
  }
  return out;
}
export const tone = (v) => { v = v / (1 + 0.12 * v); return Math.round(255 * Math.pow(clamp01(v), 1 / 2.2)); };

export function renderBackground(m, q) {
  const c = camOf(m), L = sunDir(m), W = Math.round(VIEW.w * q), H = Math.round(VIEW.h * q), N = W * H;
  const bg8 = new Uint8ClampedArray(N * 4), gm = new Uint8Array(N), gLit = new Float32Array(N * 3), gHaze = new Float32Array(N * 3);
  const gx = new Float32Array(N), gz = new Float32Array(N);
  const S = [SUN_COL[0] * L[1], SUN_COL[1] * L[1], SUN_COL[2] * L[1]];
  const kmin = [AMB[0] / (AMB[0] + S[0]), AMB[1] / (AMB[1] + S[1]), AMB[2] / (AMB[2] + S[2])];
  const d = [0, 0, 0], alb = [0, 0, 0], sky = [0, 0, 0], cl = [0, 0, 0], horz = skyCol(m, [0, 0.0, 1], L, [0, 0, 0]);
  const pixAng = 1 / (c.f * q), Dt = m.trees.dist;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      dirOf(c, (px + 0.5) / q, (py + 0.5) / q, d);
      const hl = Math.hypot(d[0], d[2]), el = Math.atan2(d[1], hl), az = Math.atan2(d[0], d[2]);
      const yw = c.h + Dt * Math.tan(el), top = treeTop(m, az);
      const treeCov = clamp01((top - yw) / (Dt * pixAng * 1.0) + 0.5);
      let r, g, b;
      if (d[1] < 0 && c.h / -d[1] * hl < Dt) {
        const t = c.h / -d[1], x = d[0] * t, z = d[2] * t;
        const fp = t * pixAng / Math.max(0.06, -d[1]);
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
        skyCol(m, d, L, sky);
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
        const lit = 0.55 + 0.5 * L[1];
        const hz = 1 - Math.exp(-Dt / 900);
        tr = tr * lit * (1 - hz) + horz[0] * hz; tg = tg * lit * (1 - hz) + horz[1] * hz; tb = tb * lit * (1 - hz) + horz[2] * hz;
        r += (tr - r) * treeCov; g += (tg - g) * treeCov; b += (tb - b) * treeCov;
        if (gm[i] && treeCov > 0.5) gm[i] = 0;
      }
      bg8[i * 4] = tone(r); bg8[i * 4 + 1] = tone(g); bg8[i * 4 + 2] = tone(b); bg8[i * 4 + 3] = 255;
    }
  }
  return { q, W, H, bg8, gm, gLit, gHaze, gx, gz, kmin, cam: c, L };
}

function shadowVis(b, C, L, x, z) {
  const r = b.D / 2, k = ELONG;
  const gx = x - C[0], gy = -C[1] / k, gz = z - C[2];
  let lx = L[0], ly = L[1] / k, lz = L[2]; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  const along = -(gx * lx + gy * ly + gz * lz);
  if (along <= 0) return 1;
  const px = gx + along * lx, py = gy + along * ly, pz = gz + along * lz, perp = Math.hypot(px, py, pz);
  const w = along * Math.tan(SUN_SOFT) + 0.02;
  return smooth(r - w, r + w, perp);
}
const TMPD = [0, 0, 0];
function hitBalloon(b, C, eyeY, d, res) {
  const r = b.D / 2, k = ELONG;
  const ox = -C[0], oy = (eyeY - C[1]) / k, oz = -C[2];
  const dx = d[0], dy = d[1] / k, dz = d[2];
  const a = dx * dx + dy * dy + dz * dz, bb = ox * dx + oy * dy + oz * dz, cc = ox * ox + oy * oy + oz * oz - r * r;
  const tc = -bb / a, qx = ox + dx * tc, qy = oy + dy * tc, qz = oz + dz * tc;
  res.perp = Math.hypot(qx, qy, qz); res.tc = tc * Math.sqrt(a);
  const disc = bb * bb - a * cc;
  if (disc < 0) return Infinity;
  const t = (-bb - Math.sqrt(disc)) / a;
  if (t <= 0) return Infinity;
  const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
  let nx = hx, ny = hy / k, nz = hz; const nl = Math.hypot(nx, ny, nz);
  res.nx = nx / nl; res.ny = ny / nl; res.nz = nz / nl;
  return t;
}
function hitKnot(b, K, eyeY, d) {
  const r = 0.045 * b.D, ox = -K[0], oy = eyeY - K[1], oz = -K[2];
  const bb = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - r * r, disc = bb * bb - cc;
  if (disc < 0) return Infinity;
  const t = -bb - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}
const SH = { perp: 0, tc: 0, nx: 0, ny: 0, nz: 0 }, SKYT = [0, 0, 0];
function shadeBalloon(m, b, base, d, n, L, out) {
  const ndl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  const hemi = 0.5 + 0.5 * n[1];
  const ar = GROUND_BOUNCE[0] + (AMB[0] - GROUND_BOUNCE[0]) * hemi, ag = GROUND_BOUNCE[1] + (AMB[1] - GROUND_BOUNCE[1]) * hemi, ab = GROUND_BOUNCE[2] + (AMB[2] - GROUND_BOUNCE[2]) * hemi;
  const dif = Math.max(0, ndl);
  const tr = 0.32 * Math.pow(Math.max(0, -ndl), 1.4) * (0.6 + 0.4 * Math.max(0, d[0] * L[0] + d[1] * L[1] + d[2] * L[2]));
  let r = base[0] * (ar + SUN_COL[0] * dif) + base[0] * tr * SUN_COL[0];
  let g = base[1] * (ag + SUN_COL[1] * dif) + base[1] * tr * SUN_COL[1];
  let bl = base[2] * (ab + SUN_COL[2] * dif) + base[2] * tr * SUN_COL[2];
  let hx = L[0] - d[0], hy = L[1] - d[1], hz = L[2] - d[2]; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  const sp = 0.7 * Math.pow(Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz), 90) + 0.08 * Math.pow(Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz), 12);
  r += SUN_COL[0] * sp; g += SUN_COL[1] * sp; bl += SUN_COL[2] * sp;
  const ndv = Math.max(0, -(n[0] * d[0] + n[1] * d[1] + n[2] * d[2])), fr = 0.04 + 0.3 * Math.pow(1 - ndv, 4);
  const k2 = 2 * (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
  SKYT[0] = d[0] - k2 * n[0]; SKYT[1] = Math.abs(d[1] - k2 * n[1]); SKYT[2] = d[2] - k2 * n[2];
  const sk = skyCol(m, SKYT, L, [0, 0, 0]);
  r = r * (1 - fr) + sk[0] * fr; g = g * (1 - fr) + sk[1] * fr; bl = bl * (1 - fr) + sk[2] * fr;
  out[0] = r; out[1] = g; out[2] = bl;
  return out;
}
export function frameInto(m, B, phi, out8) {
  const c = B.cam, L = B.L, q = B.q, W = B.W, H = B.H;
  out8.set(B.bg8);
  const C = m.balloons.map((b) => centreAt(m, b, phi));
  if (!B.vis || B.vis.length !== W * H) { B.vis = new Float32Array(W * H).fill(1); B.touched = new Int32Array(W * H); }
  const vis = B.vis, touched = B.touched; let nt = 0;
  m.balloons.forEach((b, i) => {
    const F = shadowFootprint(m, b, C[i], L, 0.25 + (b.D / 2));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of F.pts) { const s = proj(c, p[0], 0, p[2]); if (s[2] < 0.2) { y1 = VIEW.h; continue; } x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
    const X0 = Math.max(0, Math.floor(x0 * q) - 1), X1 = Math.min(W - 1, Math.ceil(x1 * q) + 1), Y0 = Math.max(0, Math.floor(y0 * q) - 1), Y1 = Math.min(H - 1, Math.ceil(y1 * q) + 1);
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      const j = py * W + px; if (!B.gm[j]) continue;
      const v = shadowVis(b, C[i], L, B.gx[j], B.gz[j]);
      if (v >= 0.999) continue;
      if (vis[j] === 1) touched[nt++] = j;
      vis[j] *= v;
    }
  });
  for (let n = 0; n < nt; n++) {
    const j = touched[n], v = vis[j];
    for (let ch = 0; ch < 3; ch++) out8[j * 4 + ch] = tone(B.gLit[j * 3 + ch] * (B.kmin[ch] + (1 - B.kmin[ch]) * v) + B.gHaze[j * 3 + ch]);
    vis[j] = 1;
  }
  const order = m.balloons.map((b, i) => i).sort((a, bb) => C[bb][2] - C[a][2]);
  const n3 = [0, 0, 0], col = [0, 0, 0], d = [0, 0, 0];
  for (const i of order) {
    const b = m.balloons[i], Ci = C[i], base = lin(b.hex), knot = knotOf(b, Ci);
    const sp = stringPts(b, Ci, 24).map((p) => proj(c, p[0], p[1], p[2]));
    const sc = [86, 86, 90];
    for (let s = 0; s < sp.length - 1; s++) {
      const ax = sp[s][0] * q, ay = sp[s][1] * q, bx = sp[s + 1][0] * q, by = sp[s + 1][1] * q, len = Math.hypot(bx - ax, by - ay), ns = Math.max(1, Math.ceil(len * 2));
      for (let k = 0; k < ns; k++) {
        const u = (k + 0.5) / ns, x = ax + (bx - ax) * u - 0.5, y = ay + (by - ay) * u - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const a0 = 0.42 * Math.min(1, 0.55 + 0.3 * q);
        for (const [ox, oy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
          const X = ix + ox, Y = iy + oy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const j = (Y * W + X) * 4, a = a0 * w;
          out8[j] += (sc[0] - out8[j]) * a; out8[j + 1] += (sc[1] - out8[j + 1]) * a; out8[j + 2] += (sc[2] - out8[j + 2]) * a;
        }
      }
    }
    const bx = silhouetteBox(c, Ci, b.D / 2), kp = proj(c, ...knot), kr = 0.06 * b.D * c.f / kp[2];
    const X0 = Math.max(0, Math.floor(bx[0] * q) - 2), X1 = Math.min(W - 1, Math.ceil(bx[2] * q) + 2);
    const Y0 = Math.max(0, Math.floor(bx[1] * q) - 2), Y1 = Math.min(H - 1, Math.ceil(Math.max(bx[3], kp[1] + kr) * q) + 2);
    const zc = proj(c, ...Ci)[2], pixW = zc / (c.f * q) / (b.D / 2);
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      dirOf(c, (px + 0.5) / q, (py + 0.5) / q, d);
      const t = hitBalloon(b, Ci, c.h, d, SH);
      const edge = Math.abs(SH.perp / (b.D / 2) - 1) < 1.6 * pixW || (Math.abs(px / q - kp[0]) < kr + 2 && Math.abs(py / q - kp[1]) < kr + 2);
      let ns = 1, acc0 = 0, acc1 = 0, acc2 = 0, cov = 0;
      if (edge) ns = 3;
      for (let sy = 0; sy < ns; sy++) for (let sx = 0; sx < ns; sx++) {
        if (ns > 1) dirOf(c, (px + (sx + 0.5) / ns) / q, (py + (sy + 0.5) / ns) / q, d);
        const tb = ns > 1 ? hitBalloon(b, Ci, c.h, d, SH) : t;
        const tk = hitKnot(b, knot, c.h, d);
        if (tb === Infinity && tk === Infinity) continue;
        if (tb <= tk) { n3[0] = SH.nx; n3[1] = SH.ny; n3[2] = SH.nz; shadeBalloon(m, b, base, d, n3, L, col); }
        else { const px3 = d[0] * tk - knot[0], py3 = c.h + d[1] * tk - knot[1], pz3 = d[2] * tk - knot[2], l3 = Math.hypot(px3, py3, pz3); n3[0] = px3 / l3; n3[1] = py3 / l3; n3[2] = pz3 / l3; shadeBalloon(m, b, base.map((v) => v * 0.7), d, n3, L, col); }
        acc0 += col[0]; acc1 += col[1]; acc2 += col[2]; cov++;
      }
      if (!cov) continue;
      const a = cov / (ns * ns), j = (py * W + px) * 4;
      const r8 = tone(acc0 / cov), g8 = tone(acc1 / cov), b8 = tone(acc2 / cov);
      out8[j] += (r8 - out8[j]) * a; out8[j + 1] += (g8 - out8[j + 1]) * a; out8[j + 2] += (b8 - out8[j + 2]) * a;
    }
  }
  return out8;
}
