const EPS = 1e-4;
export const SPH = 0, BOX = 1, CYL = 2, FRU = 3;

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
export function fbm(x, y, oct, fp = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const w = Math.max(0, Math.min(1, 1.6 - 2.2 * fp * f));
    s += amp * (0.5 + w * (vnoise(x * f + o * 17.31, y * f - o * 11.17) - 0.5));
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
export function lineMask(u, period, hw, fp) {
  const d = Math.abs(u / period - Math.round(u / period)) * period;
  const sharp = Math.max(0, Math.min(1, (hw - d) / Math.max(fp, 1e-6) + 0.5));
  const avg = Math.min(1, 2 * hw / period);
  const blend = Math.max(0, Math.min(1, (fp / period - 0.2) / 0.5));
  return sharp * (1 - blend) + avg * blend;
}

export function makeCam({ eye, target, fovY = 40, W, H, shiftY = 0 }) {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const f = (H / 2) / Math.tan(fovY * Math.PI / 360);
  const cx = W / 2, cy = H / 2 + shiftY;
  const cam = { eye: eye.slice(), F: [fx, fy, fz], R: [rx, 0, rz], U: [ux, uy, uz], f, cx, cy, W, H };
  cam.project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * fx + dy * fy + dz * fz;
    return { x: cx + f * (dx * rx + dz * rz) / zc, y: cy - f * (dx * ux + dy * uy + dz * uz) / zc, z: zc };
  };
  return cam;
}
export function makeCamK({ eye, target, f, cx, cy, W, H }) {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const cam = { eye: eye.slice(), F: [fx, fy, fz], R: [rx, 0, rz], U: [ux, uy, uz], f, cx, cy, W, H };
  cam.project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * fx + dy * fy + dz * fz;
    return { x: cx + f * (dx * rx + dz * rz) / zc, y: cy - f * (dx * ux + dy * uy + dz * uz) / zc, z: zc };
  };
  return cam;
}
const DIR = new Float64Array(3);
export function camDir(cam, x, y) {
  const a = x - cam.cx, b = cam.cy - y, f = cam.f, F = cam.F, R = cam.R, U = cam.U;
  const dx = F[0] * f + R[0] * a + U[0] * b, dy = F[1] * f + U[1] * b, dz = F[2] * f + R[2] * a + U[2] * b;
  const l = Math.hypot(dx, dy, dz);
  DIR[0] = dx / l; DIR[1] = dy / l; DIR[2] = dz / l;
  return DIR;
}

function finish(s) {
  let x0, x1, y0, y1, z0, z1;
  switch (s.k) {
    case SPH: x0 = s.cx - s.r; x1 = s.cx + s.r; y0 = s.cy - s.r; y1 = s.cy + s.r; z0 = s.cz - s.r; z1 = s.cz + s.r; break;
    case BOX: {
      const ex = Math.abs(s.hx * s.ca) + Math.abs(s.hz * s.sa), ez = Math.abs(s.hx * s.sa) + Math.abs(s.hz * s.ca);
      x0 = s.cx - ex; x1 = s.cx + ex; y0 = s.cy - s.hy; y1 = s.cy + s.hy; z0 = s.cz - ez; z1 = s.cz + ez; break;
    }
    case CYL: x0 = s.cx - s.r; x1 = s.cx + s.r; y0 = s.y0; y1 = s.y1; z0 = s.cz - s.r; z1 = s.cz + s.r; break;
    case FRU: { const r = Math.max(s.r0, s.r1); x0 = s.cx - r; x1 = s.cx + r; y0 = s.y0; y1 = s.y1; z0 = s.cz - r; z1 = s.cz + r; break; }
    default: throw new Error('rt: unknown shape');
  }
  s.bb = [x0, y0, z0, x1, y1, z1];
  s.bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
  return s;
}
export const shape = {
  sphere: (id, m, cx, cy, cz, r) => finish({ k: SPH, id, m, cx, cy, cz, r }),
  box: (id, m, cx, cy, cz, hx, hy, hz, yawDeg = 0, bev = 0) => {
    const a = yawDeg * Math.PI / 180;
    return finish({ k: BOX, id, m, cx, cy, cz, hx, hy, hz, ca: Math.cos(a), sa: Math.sin(a), bev });
  },
  cyl: (id, m, cx, cz, y0, y1, r, bev = 0) => finish({ k: CYL, id, m, cx, cz, y0, y1, r, bev }),
  frustum: (id, m, cx, cz, y0, y1, r0, r1) => finish({ k: FRU, id, m, cx, cz, y0, y1, r0, r1 }),
};

const NRM = new Float64Array(3);

function hitSph(s, ox, oy, oz, dx, dy, dz, tmax) {
  const lx = ox - s.cx, ly = oy - s.cy, lz = oz - s.cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - s.r * s.r;
  const disc = b * b - c; if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc); let t = -b - sq;
  if (t < EPS) { t = -b + sq; if (t < EPS) return Infinity; }
  if (t >= tmax) return Infinity;
  NRM[0] = (lx + t * dx) / s.r; NRM[1] = (ly + t * dy) / s.r; NRM[2] = (lz + t * dz) / s.r;
  return t;
}

function hitBox(s, ox, oy, oz, dx, dy, dz, tmax) {
  const px = ox - s.cx, py = oy - s.cy, pz = oz - s.cz, ca = s.ca, sa = s.sa;
  const o0 = px * ca - pz * sa, o1 = py, o2 = px * sa + pz * ca;
  const d0 = dx * ca - dz * sa, d1 = dy, d2 = dx * sa + dz * ca;
  let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
  const hs = [s.hx, s.hy, s.hz], os = [o0, o1, o2], ds = [d0, d1, d2];
  for (let a = 0; a < 3; a++) {
    const h = hs[a], o = os[a], d = ds[a];
    if (Math.abs(d) < 1e-12) { if (o < -h || o > h) return Infinity; continue; }
    let t1 = (-h - o) / d, t2 = (h - o) / d, sgn = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
    if (t1 > tn) { tn = t1; ax = a; sg = sgn; }
    if (t2 < tf) tf = t2;
    if (tn > tf) return Infinity;
  }
  if (ax < 0 || tn < EPS || tn >= tmax) return Infinity;
  const n = [0, 0, 0]; n[ax] = sg;
  if (s.bev > 0) {
    const p = [o0 + tn * d0, o1 + tn * d1, o2 + tn * d2];
    for (let a = 0; a < 3; a++) {
      if (a === ax) continue;
      const e = Math.abs(p[a]) - (hs[a] - s.bev);
      if (e > 0) n[a] += Math.sign(p[a]) * Math.min(1, e / s.bev) * 0.95;
    }
    const l = Math.hypot(n[0], n[1], n[2]); n[0] /= l; n[1] /= l; n[2] /= l;
  }
  NRM[0] = n[0] * ca + n[2] * sa; NRM[1] = n[1]; NRM[2] = -n[0] * sa + n[2] * ca;
  return tn;
}

function hitCyl(s, ox, oy, oz, dx, dy, dz, tmax) {
  const px = ox - s.cx, pz = oz - s.cz, r = s.r;
  let best = tmax, kind = -1;
  const a = dx * dx + dz * dz;
  if (a > 1e-12) {
    const b = px * dx + pz * dz, c = px * px + pz * pz - r * r, disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t > EPS && t < best) { const y = oy + t * dy; if (y >= s.y0 && y <= s.y1) { best = t; kind = 0; } }
    }
  }
  if (Math.abs(dy) > 1e-12) {
    const tt = (s.y1 - oy) / dy;
    if (tt > EPS && tt < best) { const qx = px + tt * dx, qz = pz + tt * dz; if (qx * qx + qz * qz <= r * r) { best = tt; kind = 1; } }
    const tb = (s.y0 - oy) / dy;
    if (tb > EPS && tb < best) { const qx = px + tb * dx, qz = pz + tb * dz; if (qx * qx + qz * qz <= r * r) { best = tb; kind = 2; } }
  }
  if (kind < 0) return Infinity;
  const qx = px + best * dx, qy = oy + best * dy, qz = pz + best * dz;
  if (kind === 0) {
    let nx = qx / r, ny = 0, nz = qz / r;
    if (s.bev > 0 && qy > s.y1 - s.bev) { ny = Math.min(1, (qy - (s.y1 - s.bev)) / s.bev) * 0.95; }
    const l = Math.hypot(nx, ny, nz); NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  } else {
    let nx = 0, ny = kind === 1 ? 1 : -1, nz = 0;
    if (s.bev > 0 && kind === 1) {
      const rho = Math.hypot(qx, qz), e = rho - (r - s.bev);
      if (e > 0 && rho > 1e-9) { const k = Math.min(1, e / s.bev) * 0.95; nx = qx / rho * k; nz = qz / rho * k; }
    }
    const l = Math.hypot(nx, ny, nz); NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  }
  return best;
}

function hitFru(s, ox, oy, oz, dx, dy, dz, tmax) {
  const px = ox - s.cx, pz = oz - s.cz;
  const k = (s.r1 - s.r0) / (s.y1 - s.y0), A = s.r0 + k * (oy - s.y0), B = k * dy;
  let best = tmax, kind = -1;
  const qa = dx * dx + dz * dz - B * B, qb = px * dx + pz * dz - A * B, qc = px * px + pz * pz - A * A;
  const roots = [];
  if (Math.abs(qa) > 1e-12) {
    const disc = qb * qb - qa * qc;
    if (disc >= 0) { const sq = Math.sqrt(disc); roots.push((-qb - sq) / qa, (-qb + sq) / qa); }
  } else if (Math.abs(qb) > 1e-12) roots.push(-qc / (2 * qb));
  for (const t of roots) {
    if (!(t > EPS && t < best)) continue;
    const y = oy + t * dy;
    if (y < s.y0 || y > s.y1 || A + B * t < 0) continue;
    best = t; kind = 0;
  }
  if (Math.abs(dy) > 1e-12) {
    for (const [yc, rc, kk] of [[s.y1, s.r1, 1], [s.y0, s.r0, 2]]) {
      const t = (yc - oy) / dy;
      if (t > EPS && t < best) { const qx = px + t * dx, qz = pz + t * dz; if (qx * qx + qz * qz <= rc * rc) { best = t; kind = kk; } }
    }
  }
  if (kind < 0) return Infinity;
  if (kind === 0) {
    const qx = px + best * dx, qz = pz + best * dz, y = oy + best * dy, rr = s.r0 + k * (y - s.y0);
    const nx = qx, ny = -k * rr, nz = qz, l = Math.hypot(nx, ny, nz) || 1;
    NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  } else { NRM[0] = 0; NRM[1] = kind === 1 ? 1 : -1; NRM[2] = 0; }
  return best;
}

export function hitShape(s, ox, oy, oz, dx, dy, dz, tmax) {
  switch (s.k) {
    case SPH: return hitSph(s, ox, oy, oz, dx, dy, dz, tmax);
    case BOX: return hitBox(s, ox, oy, oz, dx, dy, dz, tmax);
    case CYL: return hitCyl(s, ox, oy, oz, dx, dy, dz, tmax);
    case FRU: return hitFru(s, ox, oy, oz, dx, dy, dz, tmax);
    default: return Infinity;
  }
}

function bsMiss(s, ox, oy, oz, dx, dy, dz) {
  const b = s.bs, lx = b[0] - ox, ly = b[1] - oy, lz = b[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz, r = b[3];
  if (tc < -r) return true;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  return d2 > r * r;
}

export function makeScene(o) {
  const L = o.light, d = L.dir, l = Math.hypot(d[0], d[1], d[2]);
  const Ld = [d[0] / l, d[1] / l, d[2] / l];
  const t1 = Math.abs(Ld[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T1 = [Ld[1] * t1[2] - Ld[2] * t1[1], Ld[2] * t1[0] - Ld[0] * t1[2], Ld[0] * t1[1] - Ld[1] * t1[0]];
  const tl = Math.hypot(T1[0], T1[1], T1[2]); T1 = T1.map((v) => v / tl);
  const T2 = [Ld[1] * T1[2] - Ld[2] * T1[1], Ld[2] * T1[0] - Ld[0] * T1[2], Ld[0] * T1[1] - Ld[1] * T1[0]];
  const opaque = o.shapes;
  const occ = [];
  for (const s of o.shapes) {
    if (s.noAO) continue;
    if (s.k === SPH) occ.push([s.cx, s.cy, s.cz, s.r, s.id]);
    else if (s.k === CYL || s.k === FRU) {
      const r = s.k === CYL ? s.r : (s.r0 + s.r1) / 2;
      const n = Math.max(1, Math.round((s.y1 - s.y0) / (1.6 * r)));
      for (let i = 0; i < n; i++) occ.push([s.cx, s.y0 + (i + 0.5) * (s.y1 - s.y0) / n, s.cz, Math.min(r * 1.05, (s.y1 - s.y0) / n * 0.62 + r * 0.45), s.id]);
    } else {
      const b = s.bb, hx = (b[3] - b[0]) / 2, hy = (b[4] - b[1]) / 2, hz = (b[5] - b[2]) / 2;
      occ.push([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, Math.cbrt(hx * hy * hz) * 1.05, s.id]);
    }
  }
  const byId = new Map();
  for (const s of o.shapes) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  const groups = [];
  for (const [id, list] of byId) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const s of list) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
    const bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
    groups.push({ id, bs, opaque: list, occ: occ.filter((q) => q[4] === id) });
  }
  return { ...o, Ld, T1, T2, opaque, occ, byId, groups, tiles: null };
}

const TILE = 12;
function buildTiles(sc) {
  const cam = sc.cam, nx = Math.ceil(cam.W / TILE), ny = Math.ceil(cam.H / TILE);
  const lists = Array.from({ length: nx * ny }, () => []);
  const all = sc.opaque;
  for (let i = 0; i < all.length; i++) {
    const b = all[i].bb;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      if (p.z <= 0.05) { behind = true; break; }
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (behind) { x0 = 0; y0 = 0; x1 = cam.W; y1 = cam.H; }
    const X0 = Math.max(0, Math.floor(x0 / TILE) - 1), X1 = Math.min(nx - 1, Math.floor(x1 / TILE) + 1);
    const Y0 = Math.max(0, Math.floor(y0 / TILE) - 1), Y1 = Math.min(ny - 1, Math.floor(y1 / TILE) + 1);
    for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) lists[ty * nx + tx].push(all[i]);
  }
  sc.tiles = { nx, ny, lists };
}

const HIT = { t: Infinity, s: null, nx: 0, ny: 0, nz: 0 };
function nearestOpaque(list, ox, oy, oz, dx, dy, dz, tmax) {
  HIT.t = tmax; HIT.s = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const t = hitShape(s, ox, oy, oz, dx, dy, dz, HIT.t);
    if (t < HIT.t) { HIT.t = t; HIT.s = s; HIT.nx = NRM[0]; HIT.ny = NRM[1]; HIT.nz = NRM[2]; }
  }
  return HIT;
}

export function pickId(sc, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  if (!sc.tiles) buildTiles(sc);
  const T = sc.tiles, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const list = tx >= 0 && ty >= 0 && tx < T.nx && ty < T.ny ? T.lists[ty * T.nx + tx] : sc.opaque;
  const h = nearestOpaque(list, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
  return h.s ? h.s.id : -1;
}
export function rayToPoint(sc, px, py, pz) {
  const e = sc.cam.eye, dx = px - e[0], dy = py - e[1], dz = pz - e[2], tP = Math.hypot(dx, dy, dz);
  const h = nearestOpaque(sc.opaque, e[0], e[1], e[2], dx / tP, dy / tP, dz / tP, Infinity);
  return { id: h.s ? h.s.id : -1, t: h.t, tP };
}
export function objectStats(sc, id, step = 2, withVis = true, keepPix = false) {
  const shapes = sc.byId.get(id), cam = sc.cam, e = cam.eye;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  const ix0 = Math.floor(x0 / step), ix1 = Math.ceil(x1 / step), iy0 = Math.floor(y0 / step), iy1 = Math.ceil(y1 / step);
  const cols = ix1 - ix0 + 1, rows = iy1 - iy0 + 1;
  const grid = new Uint8Array(cols * rows);
  const pix = keepPix ? [] : null;
  let area = 0, vis = 0, sx = 0, sy = 0, ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity, off = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (ix0 + c) * step, y = (iy0 + r) * step;
    const d = camDir(cam, x, y);
    let alone = Infinity;
    for (const s of shapes) alone = Math.min(alone, hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], alone));
    if (alone === Infinity) continue;
    area++;
    if (x < 0 || y < 0 || x > cam.W || y > cam.H) off++;
    ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); ay0 = Math.min(ay0, y); ay1 = Math.max(ay1, y);
    if (withVis && pickId(sc, x, y) === id) { vis++; sx += x; sy += y; grid[r * cols + c] = 1; if (pix) pix.push(x, y); }
  }
  const dist = new Float32Array(cols * rows);
  for (let i = 0; i < dist.length; i++) dist[i] = grid[i] ? 1e9 : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!dist[i]) continue;
    let m = dist[i];
    if (c === 0 || r === 0) m = 1;
    else m = Math.min(m, dist[i - 1] + 1, dist[i - cols] + 1, dist[i - cols - 1] + 1, c + 1 < cols ? dist[i - cols + 1] + 1 : 1);
    dist[i] = m;
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c; if (!dist[i]) continue;
    let m = dist[i];
    if (c === cols - 1 || r === rows - 1) m = 1;
    else m = Math.min(m, dist[i + 1] + 1, dist[i + cols] + 1, dist[i + cols + 1] + 1, c > 0 ? dist[i + cols - 1] + 1 : 1);
    dist[i] = m;
  }
  const cx = vis ? sx / vis : 0, cy = vis ? sy / vis : 0;
  let pt = null, best = -Infinity;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!grid[i]) continue;
    const x = (ix0 + c) * step, y = (iy0 + r) * step;
    if (x < 1 || y < 1 || x > cam.W - 1 || y > cam.H - 1) continue;
    const score = dist[i] * 100 - Math.hypot(x - cx, y - cy);
    if (score > best) { best = score; pt = [x, y, dist[i] * step]; }
  }
  return { area, vis, frac: area ? vis / area : 0, off, cx, cy, pt, pix,
    hgt: area ? ay1 - ay0 + step : 0, wid: area ? ax1 - ax0 + step : 0,
    box: area ? [ax0, ay0, ax1, ay1] : null, step };
}

const NDISK = 48;
const DISK = Array.from({ length: NDISK }, (_, i) => { const r = Math.sqrt((i + 0.5) / NDISK), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });

function shadowTrans(sc, ox, oy, oz, dx, dy, dz) {
  const G = sc.groups;
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi];
    if (bsMiss(g, ox, oy, oz, dx, dy, dz)) continue;
    const list = g.opaque;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (list.length > 1 && bsMiss(s, ox, oy, oz, dx, dy, dz)) continue;
      if (hitShape(s, ox, oy, oz, dx, dy, dz, Infinity) < Infinity) return 0;
    }
  }
  return 1;
}
function softShadow(sc, ox, oy, oz, px, py) {
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, k = Math.tan(sc.light.soft || 0.04);
  const ign = (52.9829189 * ((0.06711056 * px + 0.00583715 * py) % 1)) % 1;
  const rot = ign * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
  const sample = (i) => {
    const u = (DISK[i][0] * cr - DISK[i][1] * sr) * k, v = (DISK[i][0] * sr + DISK[i][1] * cr) * k;
    let dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    return shadowTrans(sc, ox, oy, oz, dx, dy, dz);
  };
  const a = sample(NDISK - 1), b = sample(NDISK - 4), c = sample(NDISK - 7);
  if (a === b && b === c) return a;
  let s = a + b + c;
  for (let i = 0; i < NDISK; i++) if (i !== NDISK - 1 && i !== NDISK - 4 && i !== NDISK - 7) s += sample(i);
  return s / NDISK;
}
function aoAt(sc, x, y, z, nx, ny, nz, selfId) {
  let occ = 0;
  const k = sc.light.aoK ?? 1;
  for (const g of sc.groups) {
    if (g.id === selfId) continue;
    const b = g.bs, gx = b[0] - x, gy = b[1] - y, gz = b[2] - z, reach = b[3] * 3.2;
    if (gx * gx + gy * gy + gz * gz > reach * reach) continue;
    for (const o of g.occ) {
      const vx = o[0] - x, vy = o[1] - y, vz = o[2] - z, d2 = vx * vx + vy * vy + vz * vz, r2 = o[3] * o[3];
      if (d2 > r2 * 30) continue;
      const d = Math.sqrt(d2), ndv = (nx * vx + ny * vy + nz * vz) / d;
      if (ndv <= 0) continue;
      occ += ndv * Math.min(1, r2 / d2);
    }
  }
  return Math.max(0.25, 1 - 0.62 * k * Math.min(1, occ));
}

const COL = new Float64Array(3), TMP = new Float64Array(3), ENVC = new Float64Array(3), BASE = new Float64Array(3);
function shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, selfId, px, py, out) {
  if (mat && mat.emit) { out[0] = mat.emit[0]; out[1] = mat.emit[1]; out[2] = mat.emit[2]; return; }
  const Lt = sc.light, L = sc.Ld;
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  const hemi = 0.5 + 0.5 * ny;
  let ar = Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi, ag = Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi, ab = Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi;
  let ao = aoAt(sc, x, y, z, nx, ny, nz, selfId);
  const fy = sc.env.floorY ?? 0;
  if (selfId >= 0) {
    const h = y - fy;
    ao *= 1 - (Lt.contact ?? 0.35) * (0.6 - 0.4 * ny) * Math.exp(-h / (Lt.contactH ?? 0.18));
  }
  ar *= ao; ag *= ao; ab *= ao;
  const ndl = nx * L[0] + ny * L[1] + nz * L[2];
  let vis = 0;
  if (ndl > 0) vis = softShadow(sc, x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3, px, py);
  const dif = Math.max(0, ndl) * vis;
  let r = base[0] * (ar + Lt.col[0] * dif), g = base[1] * (ag + Lt.col[1] * dif), b = base[2] * (ab + Lt.col[2] * dif);
  if (Lt.fill) {
    const F = Lt.fill.dir, fd = Math.max(0, nx * F[0] + ny * F[1] + nz * F[2]);
    r += base[0] * Lt.fill.col[0] * fd * ao; g += base[1] * Lt.fill.col[1] * fd * ao; b += base[2] * Lt.fill.col[2] * fd * ao;
  }
  if (mat && mat.ks > 0 && vis > 0) {
    let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const sp = mat.ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), mat.sh) * vis;
    r += Lt.col[0] * sp; g += Lt.col[1] * sp; b += Lt.col[2] * sp;
  }
  if (mat && mat.mirror > 0) {
    const k2 = 2 * (nx * dx + ny * dy + nz * dz), fr = mat.mirror;
    sc.env.sky(dx - k2 * nx, Math.abs(dy - k2 * ny), dz - k2 * nz, ENVC);
    r = r * (1 - fr) + ENVC[0] * fr * base[0] / Math.max(1e-6, mat.c[0]); g = g * (1 - fr) + ENVC[1] * fr * base[1] / Math.max(1e-6, mat.c[1]); b = b * (1 - fr) + ENVC[2] * fr * base[2] / Math.max(1e-6, mat.c[2]);
  }
  if (mat && mat.env > 0) {
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = mat.env * Math.pow(1 - ndv, 4);
    const k2 = 2 * (nx * dx + ny * dy + nz * dz);
    sc.env.sky(dx - k2 * nx, Math.abs(dy - k2 * ny), dz - k2 * nz, ENVC);
    r = r * (1 - fr) + ENVC[0] * fr; g = g * (1 - fr) + ENVC[1] * fr; b = b * (1 - fr) + ENVC[2] * fr;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

const GT = [];
function applyGlass(sc, ox, oy, oz, dx, dy, dz, tEnd, out) {
  const P = sc.env.glass; if (!P) return;
  GT.length = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], o = p.axis === 'x' ? ox : oz, d = p.axis === 'x' ? dx : dz;
    if (Math.abs(d) < 1e-12) continue;
    const t = (p.at - o) / d;
    if (!(t > EPS && t < tEnd)) continue;
    const y = oy + t * dy, a = p.axis === 'x' ? oz + t * dz : ox + t * dx;
    if (y < p.y0 || y > p.y1 || a < p.a0 || a > p.a1) continue;
    GT.push(t, Math.abs(d));
  }
  if (!GT.length) return;
  const T = sc.env.glassTint, A = sc.env.glassAlpha ?? 0.1;
  const order = []; for (let i = 0; i < GT.length; i += 2) order.push(i);
  order.sort((i, j) => GT[j] - GT[i]);
  for (const i of order) {
    const cosI = GT[i + 1], fr = 0.04 + 0.5 * Math.pow(1 - cosI, 5);
    sc.env.sky(dx, Math.abs(dy), dz, ENVC);
    for (let c = 0; c < 3; c++) out[c] = out[c] * (1 - A) * (1 - fr) + T[c] * A + ENVC[c] * fr;
  }
}

function trace(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
  const id = traceOpaque(sc, ox, oy, oz, dx, dy, dz, px, py, list, out);
  if (sc.env.glass) applyGlass(sc, ox, oy, oz, dx, dy, dz, LAST_T, out);
  return id;
}
let LAST_T = Infinity;
function traceOpaque(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
  const env = sc.env, fy = env.floorY ?? 0;
  const h = nearestOpaque(list, ox, oy, oz, dx, dy, dz, Infinity);
  const tHit = h.t, s = h.s, nx = h.nx, ny = h.ny, nz = h.nz;
  let tf = Infinity, kindEnv = 0;
  if (dy < -1e-9) { const t = (fy - oy) / dy; if (t > EPS) { tf = t; kindEnv = 1; } }
  if (env.wallZ !== undefined && dz < -1e-9) {
    const t = (env.wallZ - oz) / dz;
    if (t > EPS && t < tf && oy + t * dy >= fy - 1e-6) { tf = t; kindEnv = 2; }
  }
  if (env.wallX !== undefined && dx * (env.wallXDir || 1) < -1e-9) {
    const t = (env.wallX - ox) / dx;
    if (t > EPS && t < tf && oy + t * dy >= fy - 1e-6) { tf = t; kindEnv = 3; }
  }
  LAST_T = s && tHit <= tf ? tHit : tf;
  if (s && tHit <= tf) {
    const x = ox + tHit * dx, y = oy + tHit * dy, z = oz + tHit * dz;
    const mat = sc.mats[s.m];
    let base = mat.c;
    if (mat.tex) { mat.tex(x, y, z, nx, ny, nz, s, BASE); base = BASE; }
    shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, s.id, px, py, COL);
    out[0] = COL[0]; out[1] = COL[1]; out[2] = COL[2];
    return s.id;
  }
  if (kindEnv) {
    const x = ox + tf * dx, y = oy + tf * dy, z = oz + tf * dz;
    const fp = tf / sc.cam.f;
    if (kindEnv === 1) {
      env.floor(x, z, fp, TMP);
      shadeSurface(sc, x, y, z, 0, 1, 0, dx, dy, dz, TMP, env.floorMat || { ks: 0, sh: 1 }, -1, px, py, COL);
    } else if (kindEnv === 2) {
      env.wall(x, y, fp, TMP);
      shadeSurface(sc, x, y, z, 0, 0, 1, dx, dy, dz, TMP, env.wallMat || { ks: 0, sh: 1 }, -2, px, py, COL);
    } else {
      (env.wallSide || env.wall)(z, y, fp, TMP);
      shadeSurface(sc, x, y, z, env.wallXDir || 1, 0, 0, dx, dy, dz, TMP, env.wallMat || { ks: 0, sh: 1 }, -3, px, py, COL);
    }
  } else {
    env.sky(dx, dy, dz, COL);
  }
  out[0] = COL[0]; out[1] = COL[1]; out[2] = COL[2];
  return -1;
}

export function render(sc, q = 1) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, W = cam.W, H = cam.H;
  const ss = q >= 1.5 ? 1 : 2, k = q * ss;
  const w = Math.round(W * k), h = Math.round(H * k);
  const OW = Math.round(W * q), OH = Math.round(H * q);
  const acc = new Float32Array(OW * OH * 3), ids = new Int16Array(OW * OH).fill(-1);
  const e = cam.eye, tiles = sc.tiles, out = new Float64Array(3);
  const expo = sc.exposure ?? 1;
  for (let py = 0; py < h; py++) {
    const by = (py + 0.5) / k, ty = Math.min(tiles.ny - 1, Math.floor(by / TILE));
    for (let px = 0; px < w; px++) {
      const bx = (px + 0.5) / k, tx = Math.min(tiles.nx - 1, Math.floor(bx / TILE));
      const d = camDir(cam, bx, by);
      const id = trace(sc, e[0], e[1], e[2], d[0], d[1], d[2], px, py, tiles.lists[ty * tiles.nx + tx], out);
      const ox = Math.min(OW - 1, Math.floor(px / ss)), oy = Math.min(OH - 1, Math.floor(py / ss)), o = oy * OW + ox;
      acc[o * 3] += out[0]; acc[o * 3 + 1] += out[1]; acc[o * 3 + 2] += out[2];
      if (px % ss === 0 && py % ss === 0) ids[o] = id;
    }
  }
  const data = new Uint8ClampedArray(OW * OH * 4), inv = 1 / (ss * ss);
  for (let i = 0; i < OW * OH; i++) {
    for (let c = 0; c < 3; c++) {
      let v = acc[i * 3 + c] * inv * expo;
      v = v / (1 + 0.12 * v);
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
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
export function silhouetteRings(img, idSet, rgba = [25, 145, 250, 255], width = 2.5) {
  const { w, h, ids } = img, R = Math.max(1, Math.round(width * img.q));
  const data = new Uint8ClampedArray(w * h * 4);
  if (idSet.size) {
    const inSet = (v) => v >= 0 && idSet.has(v);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inSet(ids[y * w + x])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) {
      for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y1 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(w - 1, x1 + R); x++) {
        const i = y * w + x;
        const own = ids[i];
        let near = -1;
        for (let dy = -R; dy <= R && near < 0; dy++) for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const v = ids[yy * w + xx];
          if (inSet(v) && v !== own) { near = v; break; }
        }
        if (near >= 0) { data[i * 4] = rgba[0]; data[i * 4 + 1] = rgba[1]; data[i * 4 + 2] = rgba[2]; data[i * 4 + 3] = rgba[3]; }
      }
    }
  }
  return toCanvas({ data, w, h });
}
