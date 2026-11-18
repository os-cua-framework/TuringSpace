import { DIRS } from './_gravity_maze_turn_model.js';

const GEOS = new Map();
export function geoFor(n = 6) {
  if (!GEOS.has(n)) {
    const S = 228, F = 11, cs = (S - 2 * F) / n;
    GEOS.set(n, { S, F, n, cs, T: 5, HW: 7, HF: 9, RH: 0.3 * cs, RW: 2.2, rb: 0.27 * cs });
  }
  return GEOS.get(n);
}
export const GEO = geoFor(6);
const LIGHT = (() => { const v = [-0.55, -0.8, 1.25], l = Math.hypot(...v); return v.map((x) => x / l); })();

function hash2(a, b) { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function grain(along, across, seed) {
  const w = vnoise(along * 0.025 + seed * 7.1, across * 0.22 + seed) * 2.4 + vnoise(along * 0.09, across * 0.7 + seed * 3) * 0.7;
  const ring = Math.sin(across * 0.85 + w * 3.2);
  const fine = vnoise(along * 0.7 + seed, across * 3.1) - 0.5;
  return 0.95 + 0.045 * ring + 0.06 * fine;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bevel = (depth, top, b) => (depth <= 0 ? 0 : depth >= b ? top : top - b + Math.sqrt(Math.max(0, b * b - (b - depth) * (b - depth))));

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

export function exitBox(m) {
  const { S, F, cs, T } = geoFor(m.n), { side, k } = m.exit;
  const a = F + k * cs + T / 2, b = F + (k + 1) * cs - T / 2, d = F + T / 2 + 0.01;
  if (side === 0) return [a, -1, b, d];
  if (side === 2) return [a, S - d, b, S + 1];
  if (side === 3) return [-1, a, d, b];
  return [S - d, a, S + 1, b];
}

const PLATE = 0, WALL = 1, FRAME = 2, HOLE = 3, RING = 4;

const BASES = new Map();
function base(m, sc, look = null) {
  const key = `${JSON.stringify([m.hw, m.vw, m.pits, m.exit, m.style])}|${sc}${look ? '|' + look.key : ''}`;
  if (BASES.has(key)) return BASES.get(key);
  const { S, F, n, cs, T, HW, HF, RH, RW } = geoFor(m.n);
  const W = Math.round(S * sc), N = W * W;
  const H = new Float32Array(N), mat = new Uint8Array(N), alb = new Float32Array(N * 3);
  const st = m.style || { plate: 0, seed: 1 };
  const PLATE_C = [[230, 206, 168], [224, 196, 154], [233, 214, 182]][st.plate % 3];
  const WALL_C = [134, 90, 56], FRAME_C = [98, 63, 40], RING_C = look ? look.ringC : [196, 156, 84];
  const LA = [0, 0, 0];
  const gx = exitBox(m);
  const rim = F + T / 2;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / sc, v = (y + 0.5) / sc, i = y * W + x;
    const e = Math.min(u, v, S - u, S - v);
    let h = 0;
    if (e < rim) {
      const inGap = u >= gx[0] && u <= gx[2] && v >= gx[1] && v <= gx[3];
      if (!inGap) {
        const dx = Math.max(gx[0] - u, 0, u - gx[2]), dy = Math.max(gx[1] - v, 0, v - gx[3]);
        const depth = Math.min(e + 0.6, rim - e, Math.hypot(dx, dy));
        h = bevel(depth, HF, 2.8);
        if (h > 0.01) {
          mat[i] = FRAME;
          const horiz = Math.min(v, S - v) <= Math.min(u, S - u);
          if (look) { look.frame(horiz ? u : v, horiz ? v : u, LA); alb[i * 3] = LA[0]; alb[i * 3 + 1] = LA[1]; alb[i * 3 + 2] = LA[2]; }
          else {
          const g = horiz ? grain(u, v, st.seed + 11) : grain(v, u, st.seed + 13);
          alb[i * 3] = FRAME_C[0] * g; alb[i * 3 + 1] = FRAME_C[1] * g; alb[i * 3 + 2] = FRAME_C[2] * g;
          }
        }
      }
    }
    H[i] = h;
    if (mat[i] === PLATE) {
      if (look) { look.plate(u, v, LA); alb[i * 3] = LA[0]; alb[i * 3 + 1] = LA[1]; alb[i * 3 + 2] = LA[2]; }
      else {
      const g = grain(u * 0.9, v, st.seed) * (0.97 + 0.05 * vnoise(u * 0.012 + st.seed, v * 0.012));
      alb[i * 3] = PLATE_C[0] * g; alb[i * 3 + 1] = PLATE_C[1] * g; alb[i * 3 + 2] = PLATE_C[2] * g;
      }
    }
  }
  const stamp = (x0, y0, x1, y1, horiz, idx) => {
    const X0 = Math.max(0, Math.floor(x0 * sc)), X1 = Math.min(W - 1, Math.ceil(x1 * sc));
    const Y0 = Math.max(0, Math.floor(y0 * sc)), Y1 = Math.min(W - 1, Math.ceil(y1 * sc));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const u = (x + 0.5) / sc, v = (y + 0.5) / sc;
      const depth = Math.min(u - x0, x1 - u, v - y0, y1 - v);
      const h = bevel(depth, HW, 2.1);
      const i = y * W + x;
      if (h <= H[i]) continue;
      H[i] = h; mat[i] = WALL;
      if (look) { look.wall(horiz ? u : v, horiz ? v : u, idx, LA); alb[i * 3] = LA[0]; alb[i * 3 + 1] = LA[1]; alb[i * 3 + 2] = LA[2]; continue; }
      const g = horiz ? grain(u, v * 1.6, st.seed + idx * 0.37) : grain(v, u * 1.6, st.seed + idx * 0.37);
      alb[i * 3] = WALL_C[0] * g; alb[i * 3 + 1] = WALL_C[1] * g; alb[i * 3 + 2] = WALL_C[2] * g;
    }
  };
  let idx = 0;
  for (let r = 1; r < n; r++) for (let c = 0; c < n; c++) if (m.hw[r][c]) {
    stamp(F + c * cs - T / 2, F + r * cs - T / 2, F + (c + 1) * cs + T / 2, F + r * cs + T / 2, true, idx++);
  }
  for (let r = 0; r < n; r++) for (let c = 1; c < n; c++) if (m.vw[r][c]) {
    stamp(F + c * cs - T / 2, F + r * cs - T / 2, F + c * cs + T / 2, F + (r + 1) * cs + T / 2, false, idx++);
  }
  for (const p of m.pits) {
    const cx = F + (p.c + 0.5) * cs, cy = F + (p.r + 0.5) * cs, R = RH + RW + 1;
    for (let y = Math.floor((cy - R) * sc); y <= Math.ceil((cy + R) * sc); y++) for (let x = Math.floor((cx - R) * sc); x <= Math.ceil((cx + R) * sc); x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const u = (x + 0.5) / sc, v = (y + 0.5) / sc, d = Math.hypot(u - cx, v - cy), i = y * W + x;
      if (d < RH) { mat[i] = HOLE; H[i] = 0; }
      else if (d < RH + RW) {
        mat[i] = RING; H[i] = 0.9 * Math.sin(Math.PI * (d - RH) / RW);
        alb[i * 3] = RING_C[0]; alb[i * 3 + 1] = RING_C[1]; alb[i * 3 + 2] = RING_C[2];
      }
    }
  }
  const rad = Math.max(1, Math.round(3.2 * sc));
  const tmp = new Float32Array(N), blur = new Float32Array(N);
  for (let y = 0; y < W; y++) {
    let acc = 0; const row = y * W;
    for (let x = -rad; x <= rad; x++) acc += H[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc / (2 * rad + 1);
      acc += H[row + Math.min(W - 1, x + rad + 1)] - H[row + Math.max(0, x - rad)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(W - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < W; y++) {
      blur[y * W + x] = acc / (2 * rad + 1);
      acc += tmp[Math.min(W - 1, y + rad + 1) * W + x] - tmp[Math.max(0, y - rad) * W + x];
    }
  }
  const ao = new Float32Array(N);
  for (let i = 0; i < N; i++) ao[i] = Math.max(0.55, Math.min(1, 1 - 0.085 * Math.max(0, blur[i] - H[i])));
  const out = { W, sc, H, mat, alb, ao, lit: [null, null, null, null] };
  BASES.clear(); BASES.set(key, out);
  return out;
}

function localLight(rot, Lt = LIGHT) {
  const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
  return [Lt[0] * c + Lt[1] * s, -Lt[0] * s + Lt[1] * c, Lt[2]];
}

export function litBoard(m, rot, sc, look = null) {
  const B = look ? base(m, sc, look) : base(m, sc);
  if (B.lit[rot]) return B.lit[rot];
  const { W, H, mat, alb, ao } = B;
  const cv = makeCanvas(W, W);
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, W), px = img.data;
  const [lx, ly, lz] = look ? localLight(rot, look.light) : localLight(rot);
  const lxy = Math.hypot(lx, ly), dx = lx / lxy, dy = ly / lxy, tanE = lz / lxy;
  const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
  const Hn = [hx / hl, hy / hl, hz / hl];
  const { F, cs, RH } = geoFor(m.n);
  const HOLE_C = look ? look.holeC : [70, 52, 40], KS = look ? look.ks : [0.05, 0.13, 0.13, 0, 0.55];
  const sample = (x, y) => {
    if (x < 0 || y < 0 || x >= W - 1 || y >= W - 1) return 0;
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * W + xi;
    return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + W] * (1 - fx) + H[i + W + 1] * fx) * fy;
  };
  const maxH = GEO.HF + 0.5;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, mt = mat[i];
    if (mt === HOLE) {
      const u = (x + 0.5) / B.sc, v = (y + 0.5) / B.sc;
      let best = null;
      for (const p of m.pits) {
        const ox = u - (F + (p.c + 0.5) * cs), oy = v - (F + (p.r + 0.5) * cs);
        if (!best || ox * ox + oy * oy < best[0] * best[0] + best[1] * best[1]) best = [ox, oy];
      }
      const d = Math.hypot(best[0], best[1]) / RH;
      const wl = d > 1e-3 ? Math.max(0, -(best[0] * dx + best[1] * dy) / (d * RH)) : 0;
      const rimL = smooth(0.45, 1.0, d);
      const k = 0.16 + 0.75 * wl * rimL * rimL + 0.06 * rimL;
      px[o] = HOLE_C[0] * k; px[o + 1] = HOLE_C[1] * k; px[o + 2] = HOLE_C[2] * k; px[o + 3] = 255;
      continue;
    }
    const h0 = H[i];
    const gxv = (H[i + (x < W - 1 ? 1 : 0)] - H[i - (x > 0 ? 1 : 0)]) * B.sc / 2;
    const gyv = (H[i + (y < W - 1 ? W : 0)] - H[i - (y > 0 ? W : 0)]) * B.sc / 2;
    let nx = -gxv, ny = -gyv, nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
    let sh = 1;
    for (let t = 0.7; t < 14; t += 0.7) {
      const rayH = h0 + t * tanE;
      if (rayH > maxH) break;
      const occ = sample(x + dx * t * B.sc, y + dy * t * B.sc) - rayH;
      const vis = Math.max(0, Math.min(1, 0.5 - occ / (0.5 + 0.22 * t)));
      if (vis < sh) { sh = vis; if (sh <= 0) break; }
    }
    const spec = Math.pow(Math.max(0, nx * Hn[0] + ny * Hn[1] + nz * Hn[2]), mt === RING ? 30 : 46);
    const ks = look ? KS[mt] : mt === RING ? 0.55 : mt === PLATE ? 0.05 : 0.13;
    const a = ao[i];
    const L = 0.40 * a + 0.74 * diff * (0.25 + 0.75 * sh);
    const sp = ks * spec * (0.3 + 0.7 * sh) * 255;
    px[o] = Math.min(255, alb[i * 3] * L * 1.02 + sp);
    px[o + 1] = Math.min(255, alb[i * 3 + 1] * L + sp);
    px[o + 2] = Math.min(255, alb[i * 3 + 2] * L * 0.97 + sp);
    px[o + 3] = 255;
  }
  const rc = 5 * B.sc;
  const R0 = Math.ceil(rc);
  for (const [cx0, cy0] of [[rc, rc], [W - rc, rc], [rc, W - rc], [W - rc, W - rc]]) {
    const xs = cx0 < W / 2 ? [0, R0] : [W - R0, W], ys = cy0 < W / 2 ? [0, R0] : [W - R0, W];
    for (let y = ys[0]; y < ys[1]; y++) for (let x = xs[0]; x < xs[1]; x++) {
      const inX = cx0 < W / 2 ? x + 0.5 < cx0 : x + 0.5 > cx0, inY = cy0 < W / 2 ? y + 0.5 < cy0 : y + 0.5 > cy0;
      if (!inX || !inY) continue;
      const d = Math.hypot(x + 0.5 - cx0, y + 0.5 - cy0) - rc;
      if (d > 0) px[(y * W + x) * 4 + 3] = Math.max(0, 255 * (1 - d));
    }
  }
  ctx.putImageData(img, 0, 0);
  B.lit[rot] = cv;
  return cv;
}

const BALLS = new Map();
export function ballSprite(sc, look = null, rb = GEO.rb) {
  if (look) return look.ballSprite(sc, rb, makeCanvas);
  const bk = `${sc}|${rb}`;
  if (BALLS.has(bk)) return BALLS.get(bk);
  const R = rb * sc, size = Math.ceil(2 * R + 4), c0 = size / 2;
  const cv = makeCanvas(size, size);
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size), px = img.data;
  const [lx, ly, lz] = LIGHT;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5 - c0) / R, ny = (y + 0.5 - c0) / R, d2 = nx * nx + ny * ny;
    const o = (y * size + x) * 4;
    const d = Math.sqrt(d2);
    const alpha = Math.max(0, Math.min(1, (1 - d) * R + 0.5));
    if (alpha <= 0) continue;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
    const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
    const up = smooth(-0.1, -0.85, ry), down = smooth(0.15, 0.9, ry);
    const win = Math.pow(Math.max(0, (rx * -0.45 + ry * -0.7 + rz * 0.55)), 6);
    let er = 150 + 85 * up - 70 * down, eg = 150 + 88 * up - 76 * down, eb = 156 + 90 * up - 84 * down;
    const back = smooth(0.2, -0.6, rz);
    er = er * (1 - back * 0.55) + 196 * back * 0.55; eg = eg * (1 - back * 0.55) + 168 * back * 0.55; eb = eb * (1 - back * 0.55) + 130 * back * 0.55;
    const fres = 0.62 + 0.38 * Math.pow(1 - nz, 3);
    const hl = Math.pow(Math.max(0, rx * lx + ry * ly + rz * lz), 90) * 300 + win * 120;
    const rim = 1 - 0.35 * Math.pow(d, 6);
    px[o] = Math.min(255, (er * 0.9 * fres) * rim + hl);
    px[o + 1] = Math.min(255, (eg * 0.92 * fres) * rim + hl);
    px[o + 2] = Math.min(255, (eb * 0.96 * fres) * rim + hl);
    px[o + 3] = 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
  const out = { cv, size: size / sc };
  BALLS.set(bk, out);
  return out;
}

const WALLS = new Map();
export function wallImage(w, h, sc, look = null) {
  if (look) return look.wallImage(w, h, sc, makeCanvas);
  const key = `${w}x${h}@${sc}`;
  if (WALLS.has(key)) return WALLS.get(key);
  const W = Math.round(w * sc), Hh = Math.round(h * sc);
  const cv = makeCanvas(W, Hh);
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, Hh), px = img.data;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / sc, v = y / sc, o = (y * W + x) * 4;
    const lightK = 1.02 - 0.08 * (u / w) - 0.1 * (v / h);
    const n = (vnoise(u * 0.35, v * 0.35) - 0.5) * 0.035 + (hash2(x, y) - 0.5) * 0.02;
    const k = lightK + n;
    px[o] = 236 * k; px[o + 1] = 231 * k; px[o + 2] = 222 * k; px[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  WALLS.set(key, cv);
  return cv;
}

export function restLocal(c, r, g, G = GEO) {
  const { F, cs, T, rb } = G;
  const off = cs / 2 - T / 2 - rb - 0.4;
  return [F + (c + 0.5) * cs + DIRS[g][0] * off, F + (r + 0.5) * cs + DIRS[g][1] * off];
}
export function cellCentre(c, r, G = GEO) { const { F, cs } = G; return [F + (c + 0.5) * cs, F + (r + 0.5) * cs]; }
export function exitLocal(m) {
  const { S, F, cs, rb } = geoFor(m.n), { side, k } = m.exit, a = F + (k + 0.5) * cs;
  if (side === 0) return [a, -rb - 1];
  if (side === 2) return [a, S + rb + 1];
  if (side === 3) return [-rb - 1, a];
  return [S + rb + 1, a];
}
