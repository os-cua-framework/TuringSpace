const EPS = 1e-4;
export const BOX = 1, CVX = 4, OCY = 6;

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
const DIR = new Float64Array(3);
export function camDir(cam, x, y) {
  const a = x - cam.cx, b = cam.cy - y, f = cam.f, F = cam.F, R = cam.R, U = cam.U;
  const dx = F[0] * f + R[0] * a + U[0] * b, dy = F[1] * f + U[1] * b, dz = F[2] * f + R[2] * a + U[2] * b;
  const l = Math.hypot(dx, dy, dz);
  DIR[0] = dx / l; DIR[1] = dy / l; DIR[2] = dz / l;
  return DIR;
}

function finish(s) {
  s.bs = [(s.bb[0] + s.bb[3]) / 2, (s.bb[1] + s.bb[4]) / 2, (s.bb[2] + s.bb[5]) / 2,
    Math.hypot(s.bb[3] - s.bb[0], s.bb[4] - s.bb[1], s.bb[5] - s.bb[2]) / 2];
  return s;
}
const polyArea = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
const polyCentroid = (poly) => { let sx = 0, sy = 0; for (const p of poly) { sx += p[0]; sy += p[1]; } return [sx / poly.length, sy / poly.length]; };

const toW = (fr, lx, ly, lz) => [fr.o[0] + fr.ex[0] * lx + fr.ey[0] * ly + fr.ez[0] * lz,
  fr.o[1] + fr.ex[1] * lx + fr.ey[1] * ly + fr.ez[1] * lz, fr.o[2] + fr.ex[2] * lx + fr.ey[2] * ly + fr.ez[2] * lz];

export function extrudeParts(id, m, polys, fr, t, mark = null) {
  const out = [];
  const { o, ex, ey, ez } = fr;
  const plane = (nl, dl, arr) => {
    const nw = [ex[0] * nl[0] + ey[0] * nl[1] + ez[0] * nl[2], ex[1] * nl[0] + ey[1] * nl[1] + ez[1] * nl[2], ex[2] * nl[0] + ey[2] * nl[1] + ez[2] * nl[2]];
    arr.push(nw[0], nw[1], nw[2], dl + nw[0] * o[0] + nw[1] * o[1] + nw[2] * o[2]);
  };
  for (const poly of polys) {
    const pl = [];
    plane([0, 0, 1], t / 2, pl); plane([0, 0, -1], t / 2, pl);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny); if (l < 1e-9) continue;
      nx /= l; ny /= l;
      plane([nx, ny, 0], nx * a[0] + ny * a[1], pl);
    }
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of poly) for (const z of [-t / 2, t / 2]) {
      const w = toW(fr, p[0], p[1], z);
      for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], w[k]); bb[k + 3] = Math.max(bb[k + 3], w[k]); }
    }
    const c = polyCentroid(poly);
    out.push(finish({ k: CVX, id, m, pl: Float64Array.from(pl), bb, vol: polyArea(poly) * t, pc: toW(fr, c[0], c[1], 0), fr, t, mark }));
  }
  return out;
}
export function orientedCylinder(id, m, fr, r, t, mark = null) {
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 3; k++) {
    const ext = r * Math.hypot(fr.ex[k], fr.ey[k]) + (t / 2) * Math.abs(fr.ez[k]);
    bb[k] = fr.o[k] - ext; bb[k + 3] = fr.o[k] + ext;
  }
  return finish({ k: OCY, id, m, o: fr.o.slice(), ex: fr.ex.slice(), ey: fr.ey.slice(), ez: fr.ez.slice(), r, h: t / 2, bb, vol: Math.PI * r * r * t, pc: fr.o.slice(), fr, t, mark });
}
export function box(id, m, cx, cy, cz, hx, hy, hz) {
  return finish({ k: BOX, id, m, cx, cy, cz, hx, hy, hz, ca: 1, sa: 0, bb: [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz], vol: 8 * hx * hy * hz, pc: [cx, cy, cz] });
}

const NRM = new Float64Array(3);
const FACE = new Int8Array(1);
function hitBox(s, ox, oy, oz, dx, dy, dz, tmax) {
  const o0 = ox - s.cx, o1 = oy - s.cy, o2 = oz - s.cz;
  let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
  const hs = [s.hx, s.hy, s.hz], os = [o0, o1, o2], ds = [dx, dy, dz];
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
  NRM[0] = ax === 0 ? sg : 0; NRM[1] = ax === 1 ? sg : 0; NRM[2] = ax === 2 ? sg : 0;
  FACE[0] = 0;
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
  FACE[0] = bi >= 8 ? 1 : 0;
  return tn;
}
function hitOcy(s, ox, oy, oz, dx, dy, dz, tmax) {
  const px = ox - s.o[0], py = oy - s.o[1], pz = oz - s.o[2];
  const X = s.ex, Y = s.ey, Z = s.ez;
  const lx = px * X[0] + py * X[1] + pz * X[2], ly = px * Y[0] + py * Y[1] + pz * Y[2], lz = px * Z[0] + py * Z[1] + pz * Z[2];
  const ux = dx * X[0] + dy * X[1] + dz * X[2], uy = dx * Y[0] + dy * Y[1] + dz * Y[2], uz = dx * Z[0] + dy * Z[1] + dz * Z[2];
  let best = tmax, kind = -1;
  const a = ux * ux + uy * uy;
  if (a > 1e-12) {
    const b = lx * ux + ly * uy, c = lx * lx + ly * ly - s.r * s.r, disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t > EPS && t < best) { const z = lz + t * uz; if (z >= -s.h && z <= s.h) { best = t; kind = 0; } }
    }
  }
  if (Math.abs(uz) > 1e-12) {
    for (const [zc, kk] of [[s.h, 1], [-s.h, 2]]) {
      const t = (zc - lz) / uz;
      if (t > EPS && t < best) { const qx = lx + t * ux, qy = ly + t * uy; if (qx * qx + qy * qy <= s.r * s.r) { best = t; kind = kk; } }
    }
  }
  if (kind < 0) return Infinity;
  FACE[0] = kind === 0 ? 1 : 0;
  if (kind === 0) {
    const qx = (lx + best * ux) / s.r, qy = (ly + best * uy) / s.r;
    NRM[0] = X[0] * qx + Y[0] * qy; NRM[1] = X[1] * qx + Y[1] * qy; NRM[2] = X[2] * qx + Y[2] * qy;
  } else {
    const sg = kind === 1 ? 1 : -1;
    NRM[0] = Z[0] * sg; NRM[1] = Z[1] * sg; NRM[2] = Z[2] * sg;
  }
  return best;
}
function hitShape(s, ox, oy, oz, dx, dy, dz, tmax) {
  switch (s.k) {
    case CVX: return hitCvx(s, ox, oy, oz, dx, dy, dz, tmax);
    case OCY: return hitOcy(s, ox, oy, oz, dx, dy, dz, tmax);
    case BOX: return hitBox(s, ox, oy, oz, dx, dy, dz, tmax);
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
  const occ = [];
  for (const s of o.shapes) {
    occ.push([s.pc[0], s.pc[1], s.pc[2], Math.cbrt(3 * s.vol / (4 * Math.PI)) * 1.1, s.id]);
  }
  const byId = new Map();
  for (const s of o.shapes) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  const groups = [];
  for (const [id, list] of byId) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const s of list) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
    const bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
    groups.push({ id, bs, list, occ: occ.filter((q) => q[4] === id) });
  }
  return { ...o, Ld, T1, T2, occ, byId, groups, tiles: null };
}

const TILE = 12;
function buildTiles(sc) {
  const cam = sc.cam, nx = Math.ceil(cam.W / TILE), ny = Math.ceil(cam.H / TILE);
  const lists = Array.from({ length: nx * ny }, () => []);
  const all = sc.shapes;
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
const HIT = { t: Infinity, s: null, nx: 0, ny: 0, nz: 0, face: 0 };
function nearest(list, ox, oy, oz, dx, dy, dz, tmax) {
  HIT.t = tmax; HIT.s = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const t = hitShape(s, ox, oy, oz, dx, dy, dz, HIT.t);
    if (t < HIT.t) { HIT.t = t; HIT.s = s; HIT.nx = NRM[0]; HIT.ny = NRM[1]; HIT.nz = NRM[2]; HIT.face = FACE[0]; }
  }
  return HIT;
}

export function pickId(sc, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  const h = nearest(sc.shapes, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
  return h.s && !h.s.prop ? h.s.id : -1;
}
export function pickNear(sc, x, y, maxR = 10) {
  const id0 = pickId(sc, x, y);
  if (id0 >= 0) return id0;
  for (let r = 3; r <= maxR; r += 3.5) {
    const votes = new Map();
    const n = Math.max(8, Math.round(r * 1.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, id = pickId(sc, x + r * Math.cos(a), y + r * Math.sin(a));
      if (id >= 0) votes.set(id, (votes.get(id) || 0) + 1);
    }
    if (votes.size) {
      let best = -1, bv = -1;
      for (const [id, v] of votes) if (v > bv || (v === bv && id < best)) { best = id; bv = v; }
      return best;
    }
  }
  return -1;
}
export function objectStats(sc, id, step = 2, withVis = true) {
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
  let area = 0, vis = 0, sx = 0, sy = 0, ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity, off = 0;
  let mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (ix0 + c) * step, y = (iy0 + r) * step;
    const d = camDir(cam, x, y);
    let alone = Infinity;
    for (const s of shapes) alone = Math.min(alone, hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], alone));
    if (alone === Infinity) continue;
    area++; mx += x; my += y; mxx += x * x; myy += y * y; mxy += x * y;
    if (x < 0 || y < 0 || x > cam.W || y > cam.H) off++;
    ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); ay0 = Math.min(ay0, y); ay1 = Math.max(ay1, y);
    if (withVis && pickId(sc, x, y) === id) { vis++; sx += x; sy += y; grid[r * cols + c] = 1; }
  }
  let elong = 0;
  if (area) {
    mx /= area; my /= area;
    const cxx = mxx / area - mx * mx, cyy = myy / area - my * my, cxy = mxy / area - mx * my;
    const tr = (cxx + cyy) / 2, det = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy));
    const l1 = tr + det, l2 = Math.max(0, tr - det);
    elong = l1 > 0 ? Math.sqrt(l2 / l1) : 0;
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
  return { area, vis, frac: area ? vis / area : 0, off, cx, cy, pt, elong,
    hgt: area ? ay1 - ay0 + step : 0, wid: area ? ax1 - ax0 + step : 0,
    box: area ? [ax0, ay0, ax1, ay1] : null, step };
}

export function sideStats(sc, id, step = 1) {
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
  const cols = ix1 - ix0 + 1, rows = iy1 - iy0 + 1, grid = new Uint8Array(cols * rows);
  let side = 0, vis = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = camDir(cam, (ix0 + c) * step, (iy0 + r) * step);
    const h = nearest(sc.shapes, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
    if (!h.s || h.s.id !== id) continue;
    vis++;
    if (h.face === 1) { side++; grid[r * cols + c] = 1; }
  }
  const dist = new Float32Array(cols * rows);
  for (let i = 0; i < dist.length; i++) dist[i] = grid[i] ? 1e9 : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!dist[i]) continue;
    dist[i] = (c === 0 || r === 0) ? 1 : Math.min(dist[i], dist[i - 1] + 1, dist[i - cols] + 1, dist[i - cols - 1] + 1, c + 1 < cols ? dist[i - cols + 1] + 1 : 1);
  }
  let dmax = 0;
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c; if (!dist[i]) continue;
    dist[i] = (c === cols - 1 || r === rows - 1) ? 1 : Math.min(dist[i], dist[i + 1] + 1, dist[i + cols] + 1, dist[i + cols + 1] + 1, c > 0 ? dist[i + cols - 1] + 1 : 1);
    if (dist[i] > dmax) dmax = dist[i];
  }
  const band = dmax ? (2 * dmax - 1) * step : 0;
  return { side: side * step * step, vis: vis * step * step, band };
}

const NDISK = 28;
const DISK = Array.from({ length: NDISK }, (_, i) => { const r = Math.sqrt((i + 0.5) / NDISK), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });

function shadowTrans(sc, ox, oy, oz, dx, dy, dz, only = -1) {
  const G = sc.groups;
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi];
    if (only >= 0 && g.id !== only) continue;
    if (bsMiss(g, ox, oy, oz, dx, dy, dz)) continue;
    const list = g.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (list.length > 1 && bsMiss(s, ox, oy, oz, dx, dy, dz)) continue;
      if (hitShape(s, ox, oy, oz, dx, dy, dz, Infinity) < Infinity) return 0;
    }
  }
  return 1;
}
function softShadow(sc, ox, oy, oz, px, py, only = -1) {
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, k = Math.tan(sc.light.soft || 0.04);
  const ign = (52.9829189 * ((0.06711056 * px + 0.00583715 * py) % 1)) % 1;
  const rot = ign * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
  const sample = (i) => {
    const u = (DISK[i][0] * cr - DISK[i][1] * sr) * k, v = (DISK[i][0] * sr + DISK[i][1] * cr) * k;
    let dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    return shadowTrans(sc, ox, oy, oz, dx, dy, dz, only);
  };
  const a = sample(NDISK - 1), b = sample(NDISK - 4), c = sample(NDISK - 7);
  if (a === b && b === c && (a === 0 || a === 1)) return a;
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

const COL = new Float64Array(3), TMP = new Float64Array(3), ENVC = new Float64Array(3), MIX = new Float64Array(3);
function shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, selfId, px, py, out) {
  const Lt = sc.light, L = sc.Ld;
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  const hemi = 0.5 + 0.5 * ny;
  let ar = Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi, ag = Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi, ab = Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi;
  let ao = aoAt(sc, x, y, z, nx, ny, nz, selfId);
  const fy = sc.env.floorY ?? 0;
  if (selfId >= 0) {
    const h = y - fy;
    ao *= 1 - (Lt.contact ?? 0.35) * Math.max(0, 0.6 - 0.6 * ny) * Math.exp(-h / (Lt.contactH ?? 0.18));
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
  if (mat && mat.env > 0) {
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = mat.env * Math.pow(1 - ndv, 4);
    const k2 = nx * dx + ny * dy + nz * dz;
    sc.env.sky(dx - 2 * k2 * nx, Math.abs(dy - 2 * k2 * ny), dz - 2 * k2 * nz, ENVC);
    r = r * (1 - fr) + ENVC[0] * fr; g = g * (1 - fr) + ENVC[1] * fr; b = b * (1 - fr) + ENVC[2] * fr;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function trace(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
  const env = sc.env, fy = env.floorY ?? 0;
  const h = nearest(list, ox, oy, oz, dx, dy, dz, Infinity);
  const tHit = h.t, s = h.s, nx = h.nx, ny = h.ny, nz = h.nz;
  let tf = Infinity, kindEnv = 0;
  if (dy < -1e-9) { const t = (fy - oy) / dy; if (t > EPS) { tf = t; kindEnv = 1; } }
  if (env.wallZ !== undefined && dz < -1e-9) {
    const t = (env.wallZ - oz) / dz;
    if (t > EPS && t < tf && oy + t * dy >= fy - 1e-6) { tf = t; kindEnv = 2; }
  }
  let id = -1;
  if (s && tHit <= tf) {
    id = s.prop ? -1 : s.id;
    const mat = sc.mats[s.m];
    const x = ox + tHit * dx, y = oy + tHit * dy, z = oz + tHit * dz;
    let base = mat.c;
    if (s.mark && h.face === 0) {
      const fr = s.fr, qx = x - fr.o[0], qy = y - fr.o[1], qz = z - fr.o[2];
      if (qx * fr.ez[0] + qy * fr.ez[1] + qz * fr.ez[2] > 0) {
        const u = qx * fr.ex[0] + qy * fr.ex[1] + qz * fr.ex[2], v = qx * fr.ey[0] + qy * fr.ey[1] + qz * fr.ey[2];
        const aa = Math.max(1e-4, tHit / sc.cam.f * 0.7);
        if (s.mark.c) {
          const d = Math.hypot(u, v) - s.mark.r;
          if (d < aa) { const k = Math.min(1, (aa - d) / (2 * aa)); MIX[0] = mat.c[0] + (s.mark.c[0] - mat.c[0]) * k; MIX[1] = mat.c[1] + (s.mark.c[1] - mat.c[1]) * k; MIX[2] = mat.c[2] + (s.mark.c[2] - mat.c[2]) * k; base = MIX; }
        }
        const R = s.mark.rim;
        if (R) {
          let e = Infinity;
          if (R.segs) for (const q of R.segs) {
            const dx = q[2] - q[0], dy = q[3] - q[1], L = dx * dx + dy * dy;
            const t = L > 0 ? Math.max(0, Math.min(1, ((u - q[0]) * dx + (v - q[1]) * dy) / L)) : 0;
            const dd = Math.hypot(u - q[0] - t * dx, v - q[1] - t * dy);
            if (dd < e) e = dd;
          } else e = R.disc - Math.hypot(u, v);
          const cin = Math.max(0, Math.min(1, (e - R.inset + aa) / (2 * aa))), cout = Math.max(0, Math.min(1, (R.inset + R.w - e + aa) / (2 * aa)));
          const k = cin * cout;
          if (k > 0) { MIX[0] = base[0] + (R.ink[0] - base[0]) * k; MIX[1] = base[1] + (R.ink[1] - base[1]) * k; MIX[2] = base[2] + (R.ink[2] - base[2]) * k; base = MIX; }
        }
      }
    }
    shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, s.id, px, py, COL);
  } else if (kindEnv) {
    const x = ox + tf * dx, y = oy + tf * dy, z = oz + tf * dz;
    const fp = tf / sc.cam.f;
    if (kindEnv === 1) {
      env.floor(x, z, fp, TMP);
      shadeSurface(sc, x, y, z, 0, 1, 0, dx, dy, dz, TMP, env.floorMat || { ks: 0, sh: 1 }, -1, px, py, COL);
    } else {
      env.wall(x, y, fp, TMP);
      shadeSurface(sc, x, y, z, 0, 0, 1, dx, dy, dz, TMP, env.wallMat || { ks: 0, sh: 1 }, -2, px, py, COL);
    }
  } else {
    env.sky(dx, dy, dz, COL);
  }
  out[0] = COL[0]; out[1] = COL[1]; out[2] = COL[2];
  return id;
}

export function render(sc, q = 1, img = null, rows = null) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, W = cam.W, H = cam.H;
  const ss = q >= 1.5 ? 1 : 2, k = q * ss;
  const OW = Math.round(W * q), OH = Math.round(H * q);
  if (!img) img = { data: new Uint8ClampedArray(OW * OH * 4), w: OW, h: OH, q, ids: new Int16Array(OW * OH).fill(-1) };
  const e = cam.eye, tiles = sc.tiles, out = new Float64Array(3), acc = new Float64Array(3);
  const expo = sc.exposure ?? 1;
  const oy0 = rows ? Math.max(0, Math.floor(rows[0] * q)) : 0, oy1 = rows ? Math.min(OH, Math.ceil(rows[1] * q)) : OH;
  for (let oy = oy0; oy < oy1; oy++) {
    for (let ox = 0; ox < OW; ox++) {
      acc[0] = acc[1] = acc[2] = 0;
      let id0 = -1;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = ox * ss + sx, py = oy * ss + sy;
        const bx = (px + 0.5) / k, by = (py + 0.5) / k;
        const tx = Math.min(tiles.nx - 1, Math.floor(bx / TILE)), ty = Math.min(tiles.ny - 1, Math.floor(by / TILE));
        const d = camDir(cam, bx, by);
        const id = trace(sc, e[0], e[1], e[2], d[0], d[1], d[2], px, py, tiles.lists[ty * tiles.nx + tx], out);
        acc[0] += out[0]; acc[1] += out[1]; acc[2] += out[2];
        if (sx === 0 && sy === 0) id0 = id;
      }
      const o = oy * OW + ox, inv = 1 / (ss * ss);
      for (let c = 0; c < 3; c++) {
        let v = acc[c] * inv * expo;
        v = v / (1 + 0.12 * v);
        img.data[o * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
      }
      img.data[o * 4 + 3] = 255;
      img.ids[o] = id0;
    }
  }
  return img;
}

export function castShadowPx(sc, id, step = 2, pad = 40) {
  const cam = sc.cam, e = cam.eye, env = sc.env, fy = env.floorY ?? 0, L = sc.Ld;
  const shapes = sc.byId.get(id);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  let n = 0;
  for (let y = Math.max(0, Math.floor((y0 - pad) / step) * step); y <= Math.min(cam.H, y1 + pad); y += step) {
    for (let x = Math.max(0, Math.floor((x0 - pad) / step) * step); x <= Math.min(cam.W, x1 + pad); x += step) {
      const d = camDir(cam, x, y);
      const h = nearest(sc.shapes, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
      let tf = Infinity, kind = 0;
      if (d[1] < -1e-9) { const t = (fy - e[1]) / d[1]; if (t > EPS) { tf = t; kind = 1; } }
      if (env.wallZ !== undefined && d[2] < -1e-9) {
        const t = (env.wallZ - e[2]) / d[2];
        if (t > EPS && t < tf && e[1] + t * d[1] >= fy - 1e-6) { tf = t; kind = 2; }
      }
      if (!kind || (h.s && h.t <= tf)) continue;
      const px = e[0] + tf * d[0], py = e[1] + tf * d[1], pz = e[2] + tf * d[2];
      const nx = kind === 1 ? 0 : 0, ny = kind === 1 ? 1 : 0, nz = kind === 2 ? 1 : 0;
      if (nx * L[0] + ny * L[1] + nz * L[2] <= 0) continue;
      if (shadowTrans(sc, px + nx * 2e-3, py + ny * 2e-3, pz + nz * 2e-3, L[0], L[1], L[2], id) === 0) n++;
    }
  }
  return n * step * step;
}

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
export function silhouetteRing(img, id, rgba = [255, 255, 255, 235], width = 2) {
  const { w, h, ids } = img, R = Math.max(1, Math.round(width * img.q));
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ids[y * w + x] === id) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const data = new Uint8ClampedArray(w * h * 4);
  if (x1 >= 0) {
    for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y1 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(w - 1, x1 + R); x++) {
      const i = y * w + x;
      if (ids[i] === id) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ids[yy * w + xx] === id) { near = true; break; }
      }
      if (near) { data[i * 4] = rgba[0]; data[i * 4 + 1] = rgba[1]; data[i * 4 + 2] = rgba[2]; data[i * 4 + 3] = rgba[3]; }
    }
  }
  return { data, w, h, x0: Math.max(0, x0 - R), y0: Math.max(0, y0 - R), x1: Math.min(w - 1, x1 + R), y1: Math.min(h - 1, y1 + R) };
}
