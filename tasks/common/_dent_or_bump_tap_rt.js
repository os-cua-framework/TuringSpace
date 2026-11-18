export const RHO = 0.44;
export const DEPTH = 0.2;
export const SLOPE_DEG = Math.atan(2 * DEPTH / RHO) * 180 / Math.PI;
export const LAMP = Object.freeze({ bulb: 0.17, emit: 0.07, rod: 0.032, foot: 0.2, footH: 0.04, socket: 0.075, socketH: 0.12 });
export const CAM_LENS = Object.freeze({ dist: 26, fovY: 17.2 });

const EPS = 1e-6;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
function fbm(x, y) {
  return 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.03 + 7.1, y * 2.03 - 3.3) + 0.15 * vnoise(x * 4.1 - 2.2, y * 4.1 + 5.4);
}

export function makeCamera({ az, el, dist, fovY, W, H, target = [0, 0, 0] }) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  const eye = [target[0] + dist * Math.cos(e) * Math.sin(a), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(e) * Math.cos(a)];
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const f = (H / 2) / Math.tan(fovY * Math.PI / 360);
  const cx = W / 2, cy = H / 2;
  const cam = { eye, F: [fx, fy, fz], R: [rx, 0, rz], U: [ux, uy, uz], f, cx, cy, W, H };
  cam.project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * fx + dy * fy + dz * fz;
    return { x: cx + f * (dx * rx + dz * rz) / zc, y: cy - f * (dx * ux + dy * uy + dz * uz) / zc, z: zc };
  };
  cam.unproject = (px, py) => {
    const d = rayDir(cam, px, py, [0, 0, 0]);
    const t = -eye[1] / d[1];
    return { x: eye[0] + t * d[0], z: eye[2] + t * d[2] };
  };
  return cam;
}
function rayDir(cam, x, y, out) {
  const a = x - cam.cx, b = cam.cy - y, f = cam.f, F = cam.F, R = cam.R, U = cam.U;
  const dx = F[0] * f + R[0] * a + U[0] * b, dy = F[1] * f + U[1] * b, dz = F[2] * f + R[2] * a + U[2] * b;
  const l = Math.hypot(dx, dy, dz);
  out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
  return out;
}
export function cameraFor(rdCam, W, H) {
  return makeCamera({ az: rdCam.az, el: rdCam.el, dist: CAM_LENS.dist, fovY: CAM_LENS.fovY, W, H, target: [rdCam.tx || 0, 0, rdCam.tz || 0] });
}

export function sceneFromRound(rd, W, H, look = {}) {
  const cam = cameraFor(rd.cam, W, H);
  const lamp = { x: rd.lamp.x, z: rd.lamp.z, h: rd.lamp.h };
  return {
    cam, lamp, R0: Math.hypot(lamp.h, 2.85),
    feats: rd.feats.map((f) => ({ x: f.x, z: f.z, s: f.kind === 'bump' ? 1 : -1 })), W, H, look: { ...LOOK, ...look },
  };
}

const KQ = DEPTH / (RHO * RHO);
function hitFeature(ft, ox, oy, oz, dx, dy, dz, tmin, tmax) {
  const px = ox - ft.x, pz = oz - ft.z, s = ft.s;
  const a = s * KQ * (dx * dx + dz * dz);
  const b = dy + 2 * s * KQ * (px * dx + pz * dz);
  const c = oy - s * DEPTH + s * KQ * (px * px + pz * pz);
  let t0, t1;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return Infinity;
    t0 = t1 = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    const q = b < 0 ? -0.5 * (b - sq) : -0.5 * (b + sq);
    t0 = q / a; t1 = c / q;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; }
  }
  const R2 = RHO * RHO;
  if (t0 > tmin && t0 < tmax) { const x = px + t0 * dx, z = pz + t0 * dz; if (x * x + z * z <= R2) return t0; }
  if (t1 > tmin && t1 < tmax) { const x = px + t1 * dx, z = pz + t1 * dz; if (x * x + z * z <= R2) return t1; }
  return Infinity;
}
function hitRod(x0, z0, r, y0, y1, ox, oy, oz, dx, dy, dz, tmax) {
  const px = ox - x0, pz = oz - z0, a = dx * dx + dz * dz;
  if (a < 1e-12) return Infinity;
  const b = px * dx + pz * dz, c = px * px + pz * pz - r * r, disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  if (!(t > EPS && t < tmax)) return Infinity;
  const y = oy + t * dy;
  return y >= y0 && y <= y1 ? t : Infinity;
}
function hitCap(x0, z0, r, y0, ox, oy, oz, dx, dy, dz, tmax) {
  if (Math.abs(dy) < 1e-12) return Infinity;
  const t = (y0 - oy) / dy;
  if (!(t > EPS && t < tmax)) return Infinity;
  const x = ox + t * dx - x0, z = oz + t * dz - z0;
  return x * x + z * z <= r * r ? t : Infinity;
}
function hitBall(cx, cy, cz, r, ox, oy, oz, dx, dy, dz, tmax) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c; if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > EPS && t < tmax ? t : Infinity;
}

function firstHit(sc, ox, oy, oz, dx, dy, dz) {
  let best = Infinity, kind = 'none', k = -1;
  const P = sc.lamp;
  let t = hitBall(P.x, P.h, P.z, LAMP.bulb, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'bulb'; }
  t = hitRod(P.x, P.z, LAMP.rod, LAMP.footH, P.h - LAMP.bulb * 0.5, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'rod'; }
  t = hitRod(P.x, P.z, LAMP.socket, P.h - LAMP.bulb * 0.7 - LAMP.socketH, P.h - LAMP.bulb * 0.7, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'socket'; }
  t = hitCap(P.x, P.z, LAMP.socket, P.h - LAMP.bulb * 0.7, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'socket'; }
  t = hitRod(P.x, P.z, LAMP.foot, 0, LAMP.footH, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'foot'; }
  t = hitCap(P.x, P.z, LAMP.foot, LAMP.footH, ox, oy, oz, dx, dy, dz, best);
  if (t < best) { best = t; kind = 'cap'; }
  if (dy < -1e-9) {
    const tp = -oy / dy, hx = ox + tp * dx, hz = oz + tp * dz;
    let inside = false;
    const reach = RHO + 2 * DEPTH / Math.max(0.2, -dy) + 0.05;
    for (let i = 0; i < sc.feats.length; i++) {
      const ft = sc.feats[i], ex = hx - ft.x, ez = hz - ft.z, r2 = ex * ex + ez * ez;
      if (r2 < RHO * RHO) inside = true;
      if (r2 > reach * reach) continue;
      const tf = hitFeature(ft, ox, oy, oz, dx, dy, dz, EPS, best);
      if (tf < best) { best = tf; kind = 'feat'; k = i; }
    }
    if (!inside && tp < best) { best = tp; kind = 'sheet'; k = -1; }
  }
  return { t: best, kind, k };
}

function blocked(sc, px, py, pz, dx, dy, dz) {
  const reach = 2.05 * DEPTH / Math.max(1e-3, dy) * Math.hypot(dx, dz) + RHO;
  for (let i = 0; i < sc.feats.length; i++) {
    const ft = sc.feats[i], ex = ft.x - px, ez = ft.z - pz;
    if (ex * ex + ez * ez > reach * reach) continue;
    if (hitFeature(ft, px, py, pz, dx, dy, dz, 1e-5, Infinity) < Infinity) return true;
  }
  if (py < -1e-7 && dy > 0) {
    const t = -py / dy, qx = px + t * dx, qz = pz + t * dz;
    let open = false;
    for (const ft of sc.feats) if (ft.s < 0 && (qx - ft.x) ** 2 + (qz - ft.z) ** 2 <= RHO * RHO) { open = true; break; }
    if (!open) return true;
  }
  return false;
}
const RING = Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
export function lightVisibility(sc, px, py, pz, L, r) {
  let t1x = L[2], t1z = -L[0]; const tl = Math.hypot(t1x, t1z) || 1; t1x /= tl; t1z /= tl;
  const t2x = L[1] * t1z, t2y = L[2] * t1x - L[0] * t1z, t2z = -L[1] * t1x;
  const k = LAMP.emit / r;
  const probe = (u, v) => {
    let dx = L[0] + k * (u * t1x + v * t2x), dy = L[1] + k * v * t2y, dz = L[2] + k * (u * t1z + v * t2z);
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    return blocked(sc, px, py, pz, dx, dy, dz) ? 0 : 1;
  };
  const c = probe(0, 0), a = probe(RING[0][0], RING[0][1]), b = probe(RING[3][0], RING[3][1]);
  if (a === c && b === c) return c;
  let s = c + a + b;
  for (const i of [1, 2, 4, 5]) s += probe(RING[i][0], RING[i][1]);
  return s / 7;
}

export const LOOK = Object.freeze({
  metal: lin('#bab3a6'), metal2: lin('#9c958a'),
  rod: lin('#3a3632'), head: lin('#56504a'),
  bulb: [9.5, 6.4, 1.9],
  key: [3.45, 3.12, 2.7],
  amb: [0.3, 0.32, 0.38],
  ks: 0.4, shin: 30,
  exposure: 0.62, tone: 0.26, contrast: 1.15, falloff: 0.7, halo: 0.35,
});

const LV = [0, 0, 0];
function shade(sc, x, y, z, nx, ny, nz, vx, vy, vz, alb, ks, shin, out, flat = false) {
  const K = sc.look, P = sc.lamp;
  let lx = P.x - x, ly = P.h - y, lz = P.z - z; const r = Math.hypot(lx, ly, lz); lx /= r; ly /= r; lz /= r;
  LV[0] = lx; LV[1] = ly; LV[2] = lz;
  const fall = Math.pow(sc.R0 / r, K.falloff);
  const ndl = nx * lx + ny * ly + nz * lz;
  const vis = ndl > 0 ? (flat ? 1 : lightVisibility(sc, x + nx * 1e-5, y + ny * 1e-5, z + nz * 1e-5, LV, r)) : 0;
  let dif = Math.max(0, ndl) * vis * fall;
  if (flat && dif > 0.6) dif = 0.6 + 0.3 * (dif - 0.6);
  const hemi = 0.55 + 0.45 * ny;
  let hx = lx + vx, hy = ly + vy, hz = lz + vz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  const sp = ndl > 0 ? ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), shin) * vis * fall : 0;
  for (let c = 0; c < 3; c++) out[c] = alb[c] * (K.amb[c] * hemi + K.key[c] * dif) + (0.5 * alb[c] + 0.4) * K.key[c] * sp;
}

const DIR = [0, 0, 0], ALB = [0, 0, 0];
function tracePixel(sc, x, y, out) {
  const cam = sc.cam, e = cam.eye, d = rayDir(cam, x, y, DIR);
  const dx = d[0], dy = d[1], dz = d[2];
  const h = firstHit(sc, e[0], e[1], e[2], dx, dy, dz);
  const K = sc.look, P = sc.lamp;
  let id = -1;
  if (h.kind === 'none') { out[0] = 0.02; out[1] = 0.02; out[2] = 0.025; return -1; }
  const t = h.t, px = e[0] + t * dx, py = e[1] + t * dy, pz = e[2] + t * dz;
  const vx = -dx, vy = -dy, vz = -dz;
  if (h.kind === 'bulb') {
    const cx = e[0] - P.x, cy = e[1] - P.h, cz = e[2] - P.z, tc = -(cx * dx + cy * dy + cz * dz);
    const md = Math.hypot(cx + tc * dx, cy + tc * dy, cz + tc * dz) / LAMP.bulb;
    const g = 0.75 + 0.25 * Math.sqrt(Math.max(0, 1 - md * md));
    for (let c = 0; c < 3; c++) out[c] = K.bulb[c] * g;
    return -2;
  }
  if (h.kind === 'socket') {
    for (let c = 0; c < 3; c++) out[c] = K.rod[c] * K.amb[c] * 0.8;
    id = -2;
  } else if (h.kind === 'rod' || h.kind === 'foot') {
    const r = h.kind === 'rod' ? LAMP.rod : LAMP.foot;
    shade(sc, px, py, pz, (px - P.x) / r, 0, (pz - P.z) / r, vx, vy, vz, h.kind === 'rod' ? K.rod : K.head, 0.6, 30, out);
    id = -2;
  } else if (h.kind === 'cap') {
    shade(sc, px, py, pz, 0, 1, 0, vx, vy, vz, K.head, 0.6, 30, out);
    id = -2;
  } else {
    let nx = 0, ny = 1, nz = 0, k = -1;
    if (h.kind === 'feat') {
      k = h.k;
      const ft = sc.feats[k], g = 2 * ft.s * KQ;
      nx = g * (px - ft.x); nz = g * (pz - ft.z); ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    }
    if (K.albedo) K.albedo(px, pz, ALB);
    else {
      const m = fbm(px * 0.55 + 11.3, pz * 0.55 - 4.1), m2 = vnoise(px * 2.3 - 5, pz * 2.3 + 9);
      for (let c = 0; c < 3; c++) ALB[c] = (K.metal[c] * (1 - 0.5 * m) + K.metal2[c] * 0.5 * m) * (0.96 + 0.06 * m2);
    }
    shade(sc, px, py, pz, nx, ny, nz, vx, vy, vz, ALB, K.ks, K.shin, out, k < 0);
    id = k;
  }
  const cx = P.x - e[0], cy = P.h - e[1], cz = P.z - e[2], tc = cx * dx + cy * dy + cz * dz;
  if (tc > 0 && tc < t) {
    const qx = cx - tc * dx, qy = cy - tc * dy, qz = cz - tc * dz, md = Math.hypot(qx, qy, qz) / LAMP.bulb;
    if (md < 4) { const g = K.halo * Math.exp(-0.8 * md * md); for (let c = 0; c < 3; c++) out[c] += K.bulb[c] * 0.12 * g; }
  }
  return id;
}

export function render(sc, q = 1, opts = {}) {
  const W = sc.W, H = sc.H, ss = opts.ss ?? (q >= 1.5 ? 1 : 2), k = q * ss;
  const w = Math.round(W * k), h = Math.round(H * k), OW = Math.round(W * q), OH = Math.round(H * q);
  const acc = new Float32Array(OW * OH * 3), ids = new Int8Array(OW * OH).fill(-1);
  const out = [0, 0, 0];
  for (let py = 0; py < h; py++) {
    const by = (py + 0.5) / k;
    for (let px = 0; px < w; px++) {
      const bx = (px + 0.5) / k;
      const id = tracePixel(sc, bx, by, out);
      const ox = Math.min(OW - 1, Math.floor(px / ss)), oy = Math.min(OH - 1, Math.floor(py / ss)), o = oy * OW + ox;
      acc[o * 3] += out[0]; acc[o * 3 + 1] += out[1]; acc[o * 3 + 2] += out[2];
      if (px % ss === 0 && py % ss === 0) ids[o] = id;
    }
  }
  const data = new Uint8ClampedArray(OW * OH * 4), inv = 1 / (ss * ss), K = sc.look, con = K.contrast ?? 1;
  for (let i = 0; i < OW * OH; i++) {
    for (let c = 0; c < 3; c++) {
      let v = acc[i * 3 + c] * inv * K.exposure;
      v = v / (1 + K.tone * v);
      v = Math.pow(clamp01(v), 1 / 2.2);
      v = v + (con - 1) * v * (1 - v) * (2 * v - 1) * 2;
      data[i * 4 + c] = Math.round(255 * clamp01(v));
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

export function rimScreen(cam, x, z, scale = 1, n = 36) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    pts.push(cam.project(x + scale * RHO * Math.cos(a), 0, z + scale * RHO * Math.sin(a)));
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { pts, c: cam.project(x, 0, z), box: [x0, y0, x1, y1] };
}
export function hull(pts) {
  const p = pts.map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop(); return lo.concat(hi);
}
