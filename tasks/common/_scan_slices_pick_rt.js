const EPS = 1e-4;
export const BOX = 1, CVX = 2;

export function lin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
}
export function hash2(ix, iy) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function makeCam({ eye, target, fovY = 30, W, H, shiftX = 0, shiftY = 0 }) {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const f = (H / 2) / Math.tan(fovY * Math.PI / 360);
  const cx = W / 2 + shiftX, cy = H / 2 + shiftY;
  const cam = { eye: eye.slice(), F: [fx, fy, fz], R: [rx, 0, rz], U: [ux, uy, uz], f, cx, cy, W, H };
  cam.project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * fx + dy * fy + dz * fz;
    return { x: cx + f * (dx * rx + dz * rz) / zc, y: cy - f * (dx * ux + dy * uy + dz * uz) / zc, z: zc };
  };
  return cam;
}
const DIR = new Float64Array(3);
function camDir(cam, x, y) {
  const a = x - cam.cx, b = cam.cy - y, f = cam.f, F = cam.F, R = cam.R, U = cam.U;
  const dx = F[0] * f + R[0] * a + U[0] * b, dy = F[1] * f + U[1] * b, dz = F[2] * f + R[2] * a + U[2] * b;
  const l = Math.hypot(dx, dy, dz);
  DIR[0] = dx / l; DIR[1] = dy / l; DIR[2] = dz / l;
  return DIR;
}

function finish(s) {
  const b = s.bb;
  s.bs = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2];
  return s;
}
export function box(id, m, b) {
  return finish({ k: BOX, id, m, b: b.slice(), bb: [b[0], b[2], b[4], b[1], b[3], b[5]] });
}
export function cvx(id, m, pl, bb) { return finish({ k: CVX, id, m, pl: Float64Array.from(pl), bb: bb.slice() }); }

const NRM = new Float64Array(3);
function hitBox(s, ox, oy, oz, dx, dy, dz, tmax) {
  const b = s.b;
  let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
  for (let a = 0; a < 3; a++) {
    const lo = b[a * 2], hi = b[a * 2 + 1], o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, sgn = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
    if (t1 > tn) { tn = t1; ax = a; sg = sgn; }
    if (t2 < tf) tf = t2;
    if (tn > tf) return Infinity;
  }
  if (ax < 0 || tn < EPS || tn >= tmax) return Infinity;
  NRM[0] = ax === 0 ? sg : 0; NRM[1] = ax === 1 ? sg : 0; NRM[2] = ax === 2 ? sg : 0;
  return tn;
}
function hitCvx(s, ox, oy, oz, dx, dy, dz, tmax) {
  const P = s.pl;
  let tn = -Infinity, tf = tmax, bi = -1;
  for (let i = 0; i < P.length; i += 4) {
    const den = P[i] * dx + P[i + 1] * dy + P[i + 2] * dz;
    const num = P[i + 3] - (P[i] * ox + P[i + 1] * oy + P[i + 2] * oz);
    if (Math.abs(den) < 1e-12) { if (num < 0) return Infinity; continue; }
    const t = num / den;
    if (den < 0) { if (t > tn) { tn = t; bi = i; } } else if (t < tf) tf = t;
    if (tn > tf) return Infinity;
  }
  if (bi < 0 || tn < EPS || tn >= tmax) return Infinity;
  NRM[0] = P[bi]; NRM[1] = P[bi + 1]; NRM[2] = P[bi + 2];
  return tn;
}
const hitShape = (s, ox, oy, oz, dx, dy, dz, tmax) => (s.k === BOX ? hitBox : hitCvx)(s, ox, oy, oz, dx, dy, dz, tmax);
function bsMiss(bs, ox, oy, oz, dx, dy, dz, tmax = Infinity) {
  const lx = bs[0] - ox, ly = bs[1] - oy, lz = bs[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz, r = bs[3];
  if (tc < -r || tc - r > tmax) return true;
  return lx * lx + ly * ly + lz * lz - tc * tc > r * r;
}
function occluded(sc, ox, oy, oz, dx, dy, dz, tmax) {
  if (bsMiss(sc.allBs, ox, oy, oz, dx, dy, dz, tmax)) return false;
  const S = sc.shapes;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (bsMiss(s.bs, ox, oy, oz, dx, dy, dz, tmax)) continue;
    if (hitShape(s, ox, oy, oz, dx, dy, dz, tmax) < tmax) return true;
  }
  return false;
}
function occT(sc, ox, oy, oz, dx, dy, dz, tmax) {
  if (bsMiss(sc.allBs, ox, oy, oz, dx, dy, dz, tmax)) return tmax;
  const S = sc.shapes;
  let best = tmax;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (bsMiss(s.bs, ox, oy, oz, dx, dy, dz, best)) continue;
    const t = hitShape(s, ox, oy, oz, dx, dy, dz, best);
    if (t < best) best = t;
  }
  return best;
}

function aoDirs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n), a = i * 2.39996323 + 0.4;
    out.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(Math.max(0, 1 - r * r))]);
  }
  return out;
}
export function makeScene(o) {
  const d = o.light.dir, l = Math.hypot(d[0], d[1], d[2]);
  const Ld = [d[0] / l, d[1] / l, d[2] / l];
  const t1 = Math.abs(Ld[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T1 = [Ld[1] * t1[2] - Ld[2] * t1[1], Ld[2] * t1[0] - Ld[0] * t1[2], Ld[0] * t1[1] - Ld[1] * t1[0]];
  const tl = Math.hypot(T1[0], T1[1], T1[2]); T1 = T1.map((v) => v / tl);
  const T2 = [Ld[1] * T1[2] - Ld[2] * T1[1], Ld[2] * T1[0] - Ld[0] * T1[2], Ld[0] * T1[1] - Ld[1] * T1[0]];
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const s of o.shapes) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
  const allBs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 1e-3];
  const ao = { n: 12, range: 1.1, k: 0.85, ...(o.ao || {}) };
  return { ...o, Ld, T1, T2, allBs, allBB: [x0, y0, z0, x1, y1, z1], ao, aoD: aoDirs(ao.n), tiles: null };
}

const TILE = 12;
function buildTiles(sc) {
  const cam = sc.cam, nx = Math.ceil(cam.W / TILE), ny = Math.ceil(cam.H / TILE);
  const lists = Array.from({ length: nx * ny }, () => []);
  for (const s of sc.shapes) {
    const b = s.bb;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const X0 = Math.max(0, Math.floor(x0 / TILE) - 1), X1 = Math.min(nx - 1, Math.floor(x1 / TILE) + 1);
    const Y0 = Math.max(0, Math.floor(y0 / TILE) - 1), Y1 = Math.min(ny - 1, Math.floor(y1 / TILE) + 1);
    for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) lists[ty * nx + tx].push(s);
  }
  sc.tiles = { nx, ny, lists };
}

const NSH = 24;
const SDISK = Array.from({ length: NSH }, (_, i) => { const r = Math.sqrt((i + 0.5) / NSH), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });
const PROBES = [NSH - 1, NSH - 7, NSH - 13, 3];
function softShadow(sc, ox, oy, oz) {
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, k = Math.tan(sc.light.soft || 0.05);
  const sample = (i) => {
    const u = SDISK[i][0] * k, v = SDISK[i][1] * k;
    let dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    return occluded(sc, ox, oy, oz, dx, dy, dz, Infinity) ? 0 : 1;
  };
  let s = 0;
  for (const i of PROBES) s += sample(i);
  if (s === 0 || s === PROBES.length) return s / PROBES.length;
  for (let i = 0; i < NSH; i++) if (!PROBES.includes(i)) s += sample(i);
  return s / NSH;
}
function aoAt(sc, x, y, z, nx, ny, nz) {
  const R = sc.ao.range, bb = sc.allBB;
  if (x < bb[0] - R || x > bb[3] + R || y < bb[1] - R || y > bb[4] + R || z < bb[2] - R || z > bb[5] + R) return 1;
  const ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = ny * ax[2] - nz * ax[1], ty = nz * ax[0] - nx * ax[2], tz = nx * ax[1] - ny * ax[0];
  const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  let occ = 0;
  const D = sc.aoD;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    const dx = tx * d[0] + bx * d[1] + nx * d[2], dy = ty * d[0] + by * d[1] + ny * d[2], dz = tz * d[0] + bz * d[1] + nz * d[2];
    const t = occT(sc, x, y, z, dx, dy, dz, R);
    if (t < R) { const w = 1 - t / R; occ += w * w * (3 - 2 * w) * 0.6 + 0.4 * w; }
  }
  return Math.max(0.2, 1 - sc.ao.k * occ / D.length * 1.6);
}

const TEX = new Float64Array(3), ENVC = new Float64Array(3);
function shade(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, px, py, out) {
  const Lt = sc.light, L = sc.Ld;
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  const hemi = 0.5 + 0.5 * ny;
  const ao = aoAt(sc, x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3, nx, ny, nz);
  const ar = (Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi) * ao;
  const ag = (Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi) * ao;
  const ab = (Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi) * ao;
  const ndl = nx * L[0] + ny * L[1] + nz * L[2];
  let vis = 0;
  if (ndl > 0) vis = softShadow(sc, x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3);
  const dif = Math.max(0, ndl) * vis;
  let r = base[0] * (ar + Lt.col[0] * dif), g = base[1] * (ag + Lt.col[1] * dif), b = base[2] * (ab + Lt.col[2] * dif);
  if (Lt.fill) {
    const F = Lt.fill.dir, fd = Math.max(0, nx * F[0] + ny * F[1] + nz * F[2]) * (0.5 + 0.5 * ao);
    r += base[0] * Lt.fill.col[0] * fd; g += base[1] * Lt.fill.col[1] * fd; b += base[2] * Lt.fill.col[2] * fd;
  }
  const ks = mat.ks || 0;
  if (ks > 0 && vis > 0) {
    let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const sp = ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), mat.sh || 20) * vis;
    r += Lt.col[0] * sp; g += Lt.col[1] * sp; b += Lt.col[2] * sp;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

const NB = new Float64Array(4);
function trace(sc, dx, dy, dz, px, py, list, out) {
  const e = sc.cam.eye, ox = e[0], oy = e[1], oz = e[2];
  let best = Infinity, hs = null, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const t = hitShape(s, ox, oy, oz, dx, dy, dz, best);
    if (t < best) { best = t; hs = s; nx = NRM[0]; ny = NRM[1]; nz = NRM[2]; }
  }
  const env = sc.env, fy = env.floorY ?? 0;
  let tf = Infinity;
  if (dy < -1e-9) { const t = (fy - oy) / dy; if (t > EPS) tf = t; }
  if (hs && best <= tf) {
    const x = ox + best * dx, y = oy + best * dy, z = oz + best * dz;
    const mat = sc.mats[hs.m];
    let base = mat.c;
    if (mat.tex) { mat.tex(x, y, z, nx, ny, nz, TEX); base = TEX; }
    shade(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, px, py, out);
    NB[0] = nx; NB[1] = ny; NB[2] = nz; NB[3] = best;
    return hs.id;
  }
  if (tf < Infinity) {
    const x = ox + tf * dx, z = oz + tf * dz;
    env.floor(x, z, TEX);
    shade(sc, x, fy, z, 0, 1, 0, dx, dy, dz, TEX, env.floorMat || { ks: 0 }, px, py, out);
    if (env.fog) {
      const k = Math.max(0, Math.min(1, (tf - env.fog[0]) / (env.fog[1] - env.fog[0])));
      env.sky(dx, dy, dz, py / sc.cam.H, ENVC);
      for (let c = 0; c < 3; c++) out[c] += (ENVC[c] - out[c]) * k;
    }
    NB[0] = 0; NB[1] = 1; NB[2] = 0; NB[3] = tf;
    return -1;
  }
  env.sky(dx, dy, dz, py / sc.cam.H, out);
  NB[0] = 0; NB[1] = 0; NB[2] = 0; NB[3] = Infinity;
  return -2;
}

export function render(sc, q = 1) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, W = cam.W, H = cam.H;
  const OW = Math.round(W * q), OH = Math.round(H * q), N = OW * OH;
  const col = new Float32Array(N * 3), ids = new Int16Array(N), nrm = new Float32Array(N * 3), dep = new Float32Array(N);
  const tiles = sc.tiles, out = new Float64Array(3);
  const sampleAt = (bx, by, px, py) => {
    const tx = Math.min(tiles.nx - 1, Math.max(0, Math.floor(bx / TILE))), ty = Math.min(tiles.ny - 1, Math.max(0, Math.floor(by / TILE)));
    const d = camDir(cam, bx, by);
    return trace(sc, d[0], d[1], d[2], px, py, tiles.lists[ty * tiles.nx + tx], out);
  };
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const i = y * OW + x;
    ids[i] = sampleAt((x + 0.5) / q, (y + 0.5) / q, x, y);
    col[i * 3] = out[0]; col[i * 3 + 1] = out[1]; col[i * 3 + 2] = out[2];
    nrm[i * 3] = NB[0]; nrm[i * 3 + 1] = NB[1]; nrm[i * 3 + 2] = NB[2]; dep[i] = NB[3];
  }
  const edge = new Uint8Array(N);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const i = y * OW + x;
    for (const j of [x + 1 < OW ? i + 1 : -1, y + 1 < OH ? i + OW : -1]) {
      if (j < 0) continue;
      const nd = nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2];
      const dd = Math.abs(dep[i] - dep[j]) / Math.max(1e-3, Math.min(dep[i], dep[j]));
      if (ids[i] !== ids[j] || nd < 0.9 || dd > 0.02) { edge[i] = Math.max(edge[i], ids[i] >= 0 || ids[j] >= 0 ? 2 : 1); edge[j] = Math.max(edge[j], ids[i] >= 0 || ids[j] >= 0 ? 2 : 1); }
    }
  }
  const final = new Float32Array(col);
  const offs = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const i = y * OW + x;
    if (!edge[i]) continue;
    let r = 0, g = 0, b = 0;
    for (const [ax, ay] of offs) { sampleAt((x + ax) / q, (y + ay) / q, x, y); r += out[0]; g += out[1]; b += out[2]; }
    final[i * 3] = r / 4; final[i * 3 + 1] = g / 4; final[i * 3 + 2] = b / 4;
  }
  const ink = sc.ink;
  if (ink) {
    for (let y = 1; y < OH - 1; y++) for (let x = 1; x < OW - 1; x++) {
      const i = y * OW + x;
      if (ids[i] < 0 || !sc.inkIds?.has(ids[i])) continue;
      let a = 0;
      for (const j of [i - 1, i + 1, i - OW, i + OW]) {
        const dd = (dep[j] - dep[i]) / dep[i];
        if (ids[j] < 0 || dd > 0.03) { a = Math.max(a, ink.sil); continue; }
        const nd = nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2];
        if (nd < 0.7 && Math.abs(dd) < 0.03) a = Math.max(a, ink.crease);
      }
      if (a > 0) for (let c = 0; c < 3; c++) final[i * 3 + c] += (ink.c[c] - final[i * 3 + c]) * a;
    }
  }
  const data = new Uint8ClampedArray(N * 4), expo = sc.exposure ?? 1;
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) {
      let v = final[i * 3 + c] * expo;
      v = v / (1 + 0.1 * v);
      data[i * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
    }
    data[i * 4 + 3] = 255;
  }
  return { data, w: OW, h: OH, q, ids };
}

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(2, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
