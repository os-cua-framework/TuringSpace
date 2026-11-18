const EPS = 1e-4;
export const SPH = 0, BOX = 1, CYL = 2, FRU = 3, CAP = 4, ELL = 5, OBX = 6;

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
  let x0, x1, y0, y1, z0, z1;
  switch (s.k) {
    case SPH: x0 = s.cx - s.r; x1 = s.cx + s.r; y0 = s.cy - s.r; y1 = s.cy + s.r; z0 = s.cz - s.r; z1 = s.cz + s.r; break;
    case BOX: {
      const ex = Math.abs(s.hx * s.ca) + Math.abs(s.hz * s.sa), ez = Math.abs(s.hx * s.sa) + Math.abs(s.hz * s.ca);
      x0 = s.cx - ex; x1 = s.cx + ex; y0 = s.cy - s.hy; y1 = s.cy + s.hy; z0 = s.cz - ez; z1 = s.cz + ez; break;
    }
    case CYL: x0 = s.cx - s.r; x1 = s.cx + s.r; y0 = s.y0; y1 = s.y1; z0 = s.cz - s.r; z1 = s.cz + s.r; break;
    case FRU: { const r = Math.max(s.r0, s.r1); x0 = s.cx - r; x1 = s.cx + r; y0 = s.y0; y1 = s.y1; z0 = s.cz - r; z1 = s.cz + r; break; }
    case CAP: {
      const a = s.a, b = s.b, r = s.r;
      x0 = Math.min(a[0], b[0]) - r; x1 = Math.max(a[0], b[0]) + r; y0 = Math.min(a[1], b[1]) - r;
      y1 = Math.max(a[1], b[1]) + r; z0 = Math.min(a[2], b[2]) - r; z1 = Math.max(a[2], b[2]) + r; break;
    }
    case ELL: case OBX: {
      const e = [0, 1, 2].map((i) => Math.abs(s.ax[0][i]) * s.h[0] + Math.abs(s.ax[1][i]) * s.h[1] + Math.abs(s.ax[2][i]) * s.h[2]);
      x0 = s.c[0] - e[0]; x1 = s.c[0] + e[0]; y0 = s.c[1] - e[1]; y1 = s.c[1] + e[1]; z0 = s.c[2] - e[2]; z1 = s.c[2] + e[2]; break;
    }
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
  capsule: (id, m, a, b, r) => finish({ k: CAP, id, m, a: a.slice(), b: b.slice(), r }),
  ellipsoid: (id, m, c, ax, h) => finish({ k: ELL, id, m, c: c.slice(), ax, h: h.slice() }),
  obox: (id, m, c, ax, h, bev = 0) => finish({ k: OBX, id, m, c: c.slice(), ax, h: h.slice(), bev }),
};
export function frame(up, fwd) {
  let l = Math.hypot(up[0], up[1], up[2]); const y = [up[0] / l, up[1] / l, up[2] / l];
  const d = fwd[0] * y[0] + fwd[1] * y[1] + fwd[2] * y[2];
  let z = [fwd[0] - d * y[0], fwd[1] - d * y[1], fwd[2] - d * y[2]];
  l = Math.hypot(z[0], z[1], z[2]); z = [z[0] / l, z[1] / l, z[2] / l];
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return [x, y, z];
}

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

function hitCap(s, ox, oy, oz, dx, dy, dz, tmax) {
  const a = s.a, b = s.b, r = s.r;
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = ox - a[0], py = oy - a[1], pz = oz - a[2];
  const baba = bx * bx + by * by + bz * bz, bard = bx * dx + by * dy + bz * dz, baoa = bx * px + by * py + bz * pz;
  const rdoa = dx * px + dy * py + dz * pz, oaoa = px * px + py * py + pz * pz;
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  let t = Infinity;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-12) {
    const t0 = (-B - Math.sqrt(h)) / A, y = baoa + t0 * bard;
    if (y > 0 && y < baba && t0 > EPS) t = t0;
  }
  if (t === Infinity) {
    for (const [cx, cy, cz] of [a, b]) {
      const lx = ox - cx, ly = oy - cy, lz = oz - cz;
      const bb = lx * dx + ly * dy + lz * dz, cc = lx * lx + ly * ly + lz * lz - r * r, dd = bb * bb - cc;
      if (dd < 0) continue;
      const tt = -bb - Math.sqrt(dd);
      if (tt > EPS && tt < t) t = tt;
    }
  }
  if (!(t < tmax)) return Infinity;
  const qx = px + t * dx, qy = py + t * dy, qz = pz + t * dz;
  const k = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / baba));
  const nx = qx - bx * k, ny = qy - by * k, nz = qz - bz * k, l = Math.hypot(nx, ny, nz) || 1;
  NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  return t;
}

function hitEll(s, ox, oy, oz, dx, dy, dz, tmax) {
  const A = s.ax, h = s.h, px = ox - s.c[0], py = oy - s.c[1], pz = oz - s.c[2];
  const o0 = (px * A[0][0] + py * A[0][1] + pz * A[0][2]) / h[0], o1 = (px * A[1][0] + py * A[1][1] + pz * A[1][2]) / h[1], o2 = (px * A[2][0] + py * A[2][1] + pz * A[2][2]) / h[2];
  const d0 = (dx * A[0][0] + dy * A[0][1] + dz * A[0][2]) / h[0], d1 = (dx * A[1][0] + dy * A[1][1] + dz * A[1][2]) / h[1], d2 = (dx * A[2][0] + dy * A[2][1] + dz * A[2][2]) / h[2];
  const a = d0 * d0 + d1 * d1 + d2 * d2, b = o0 * d0 + o1 * d1 + o2 * d2, c = o0 * o0 + o1 * o1 + o2 * o2 - 1;
  const disc = b * b - a * c; if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc); let t = (-b - sq) / a;
  if (t < EPS) { t = (-b + sq) / a; if (t < EPS) return Infinity; }
  if (t >= tmax) return Infinity;
  const q0 = (o0 + t * d0) / h[0], q1 = (o1 + t * d1) / h[1], q2 = (o2 + t * d2) / h[2];
  const nx = A[0][0] * q0 + A[1][0] * q1 + A[2][0] * q2, ny = A[0][1] * q0 + A[1][1] * q1 + A[2][1] * q2, nz = A[0][2] * q0 + A[1][2] * q1 + A[2][2] * q2;
  const l = Math.hypot(nx, ny, nz) || 1; NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  return t;
}

function hitObx(s, ox, oy, oz, dx, dy, dz, tmax) {
  const A = s.ax, px = ox - s.c[0], py = oy - s.c[1], pz = oz - s.c[2];
  const os = [px * A[0][0] + py * A[0][1] + pz * A[0][2], px * A[1][0] + py * A[1][1] + pz * A[1][2], px * A[2][0] + py * A[2][1] + pz * A[2][2]];
  const ds = [dx * A[0][0] + dy * A[0][1] + dz * A[0][2], dx * A[1][0] + dy * A[1][1] + dz * A[1][2], dx * A[2][0] + dy * A[2][1] + dz * A[2][2]];
  const hs = s.h;
  let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
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
    for (let a = 0; a < 3; a++) {
      if (a === ax) continue;
      const p = os[a] + tn * ds[a], e = Math.abs(p) - (hs[a] - s.bev);
      if (e > 0) n[a] += Math.sign(p) * Math.min(1, e / s.bev) * 0.95;
    }
  }
  const nx = A[0][0] * n[0] + A[1][0] * n[1] + A[2][0] * n[2], ny = A[0][1] * n[0] + A[1][1] * n[1] + A[2][1] * n[2], nz = A[0][2] * n[0] + A[1][2] * n[1] + A[2][2] * n[2];
  const l = Math.hypot(nx, ny, nz) || 1; NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  return tn;
}

export function hitShape(s, ox, oy, oz, dx, dy, dz, tmax) {
  switch (s.k) {
    case SPH: return hitSph(s, ox, oy, oz, dx, dy, dz, tmax);
    case BOX: return hitBox(s, ox, oy, oz, dx, dy, dz, tmax);
    case CYL: return hitCyl(s, ox, oy, oz, dx, dy, dz, tmax);
    case FRU: return hitFru(s, ox, oy, oz, dx, dy, dz, tmax);
    case CAP: return hitCap(s, ox, oy, oz, dx, dy, dz, tmax);
    case ELL: return hitEll(s, ox, oy, oz, dx, dy, dz, tmax);
    case OBX: return hitObx(s, ox, oy, oz, dx, dy, dz, tmax);
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
  if (mat && mat.env > 0) {
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = mat.env * Math.pow(1 - ndv, 4);
    const k2 = 2 * (nx * dx + ny * dy + nz * dz);
    sc.env.sky(dx - k2 * nx, Math.abs(dy - k2 * ny), dz - k2 * nz, ENVC);
    r = r * (1 - fr) + ENVC[0] * fr; g = g * (1 - fr) + ENVC[1] * fr; b = b * (1 - fr) + ENVC[2] * fr;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function trace(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
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

export const cA = (hex) => lin(hex);
export function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
export function boxLocal(s, x, z) { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; }

export function plankFloor({ plank = 0.15, plankL = 1.1, base = '#b98d61', dark = '#96693f', light = '#cfa577' } = {}) {
  const D = cA(dark), L = cA(light);
  return (x, z, fp, out) => {
    const row = Math.floor(x / plank), off = hash2(row, 7) * plankL;
    const seg = Math.floor((z + off) / plankL);
    const tone = hash2(row, seg);
    const g = fbm(x * 3 + row * 1.7, z * 0.9 + seg * 3.1, 3, fp);
    const grain = fbm(x * 40 + row * 3, z * 2.2, 2, fp * 18);
    mixInto(out, D, L, 0.25 + 0.4 * tone + 0.25 * g + 0.1 * grain);
    const seam = Math.max(lineMask(x, plank, 0.0035, fp), lineMask(z + off, plankL, 0.003, fp) * 0.8);
    const k = 1 - 0.38 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
  };
}
export function tileFloor({ tile = 0.5, a = '#d9d4ca', b = '#cfc9bd', grout = '#a8a197' } = {}) {
  const A = cA(a), B = cA(b), G = cA(grout);
  return (x, z, fp, out) => {
    const ix = Math.floor(x / tile), iz = Math.floor(z / tile);
    const t = hash2(ix, iz), n = fbm(x * 6, z * 6, 3, fp);
    mixInto(out, A, B, 0.35 * t + 0.5 * n);
    const m = Math.max(lineMask(x, tile, 0.004, fp), lineMask(z, tile, 0.004, fp));
    mixInto(out, out, G, 0.85 * m);
  };
}
export function plasterWall(color = '#ebe5da', skirting = '#f6f3ec', skirtH = 0.075) {
  const W = cA(color), S = cA(skirting);
  return (x, y, fp, out) => {
    const n = fbm(x * 5, y * 5, 3, fp);
    const src = y < skirtH ? S : W;
    const k = (y < skirtH ? 1 : 0.97 + 0.05 * n) * (Math.abs(y - skirtH) < 0.004 ? 0.82 : 1);
    out[0] = src[0] * k; out[1] = src[1] * k; out[2] = src[2] * k;
  };
}
export function softSky(dx, dy, dz, out) {
  const t = Math.max(0, Math.min(1, dy * 1.4 + 0.45));
  out[0] = 0.52 + 0.3 * t; out[1] = 0.5 + 0.3 * t; out[2] = 0.47 + 0.3 * t;
}
export const STUDIO_LIGHT = {
  dir: [-0.42, 1, 0.5], col: [1.2, 1.14, 1.04], soft: 0.05,
  sky: [0.44, 0.44, 0.46], ground: [0.2, 0.17, 0.14],
  fill: { dir: [0.8, 0.4, 0.5], col: [0.16, 0.16, 0.18] }, aoK: 1, contact: 0.28, contactH: 0.14,
};
export function orbitCam({ az = 0, el = 35, dist = 3, fov = 40, tx = 0, ty = 0, tz = 0, shiftY = 0 }, W, H) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  const eye = [tx + dist * Math.sin(a) * Math.cos(e), ty + dist * Math.sin(e), tz + dist * Math.cos(a) * Math.cos(e)];
  return makeCam({ eye, target: [tx, ty, tz], fovY: fov, W, H, shiftY });
}
export function planeAtPixel(cam, x, y, h = 0) {
  const d = camDir(cam, x, y), e = cam.eye;
  if (Math.abs(d[1]) < 1e-9) return null;
  const t = (h - e[1]) / d[1];
  if (!(t > 0)) return null;
  return { x: e[0] + d[0] * t, z: e[2] + d[2] * t };
}
export function paintTraced(g, cache, key, makeScene, x = 0, y = 0) {
  const q = contextScale(g), k = `${key}|${q}`;
  if (cache.key !== k) { const sc = makeScene(); cache.key = k; cache.img = render(sc, q); cache.canvas = toCanvas(cache.img); }
  g.drawImage(cache.canvas, x, y, cache.img.w / q, cache.img.h / q);
  return cache.img;
}
export function renderLayer(sc, q, rc, keep) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, ss = 2, k = q * ss, e = cam.eye, tiles = sc.tiles, out = new Float64Array(3);
  const x0 = Math.max(0, Math.floor(rc.x)), y0 = Math.max(0, Math.floor(rc.y));
  const x1 = Math.min(cam.W, Math.ceil(rc.x + rc.w)), y1 = Math.min(cam.H, Math.ceil(rc.y + rc.h));
  const OW = Math.max(1, Math.round((x1 - x0) * q)), OH = Math.max(1, Math.round((y1 - y0) * q));
  const acc = new Float32Array(OW * OH * 4), expo = sc.exposure ?? 1;
  for (let py = 0; py < OH * ss; py++) {
    const by = y0 + (py + 0.5) / k, ty = Math.max(0, Math.min(tiles.ny - 1, Math.floor(by / TILE)));
    for (let px = 0; px < OW * ss; px++) {
      const bx = x0 + (px + 0.5) / k, tx = Math.max(0, Math.min(tiles.nx - 1, Math.floor(bx / TILE)));
      const d = camDir(cam, bx, by);
      const id = trace(sc, e[0], e[1], e[2], d[0], d[1], d[2], px, py, tiles.lists[ty * tiles.nx + tx], out);
      if (!keep.has(id)) continue;
      const o = Math.floor(py / ss) * OW + Math.floor(px / ss);
      acc[o * 4] += out[0]; acc[o * 4 + 1] += out[1]; acc[o * 4 + 2] += out[2]; acc[o * 4 + 3] += 1;
    }
  }
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let i = 0; i < OW * OH; i++) {
    const n = acc[i * 4 + 3]; if (!n) continue;
    for (let c = 0; c < 3; c++) { let v = acc[i * 4 + c] / n * expo; v = v / (1 + 0.12 * v); data[i * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)); }
    data[i * 4 + 3] = Math.round(255 * n / (ss * ss));
  }
  return { data, w: OW, h: OH, q, x: x0, y: y0, bw: x1 - x0, bh: y1 - y0 };
}

export function camFromBasis({ eye, F, R, U, f, cx, cy, W, H }) {
  const cam = { eye: eye.slice(), F: F.slice(), R: R.slice(), U: U.slice(), f, cx, cy, W, H };
  cam.project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * F[0] + dy * F[1] + dz * F[2];
    return { x: cx + f * (dx * R[0] + dy * R[1] + dz * R[2]) / zc, y: cy - f * (dx * U[0] + dy * U[1] + dz * U[2]) / zc, z: zc };
  };
  return cam;
}
export function camFromProj3d(c, W, H, k = 1, disp = null) {
  const a = c.yaw * Math.PI / 180, dist = c.dist;
  const e = [Math.sin(a) * dist, Math.tan(c.pitch * Math.PI / 180) * dist, Math.cos(a) * dist];
  let l = Math.hypot(e[0], e[1], e[2]);
  const F = [-e[0] / l, -e[1] / l, -e[2] / l];
  let R = [-F[2], 0, F[0]]; l = Math.hypot(R[0], R[2]); R = [R[0] / l, 0, R[2] / l];
  let U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  l = Math.hypot(U[0], U[1], U[2]); U = U.map((v) => v / l);
  const sc = disp ? disp.scale : 1;
  return camFromBasis({ eye: e.map((v) => v * k), F, R, U, f: c.fov * sc, cx: disp ? disp.ox : c.cx, cy: disp ? disp.oy : c.cy, W, H });
}

export function standPose(x, z, fx, fz, h = 1.7, y0 = 0, o = {}) {
  const k = h / 1.7, r = [-fz, 0, fx];
  const P = (side, fwd, up) => [x + r[0] * side * k + fx * fwd * k, y0 + up * k, z + r[2] * side * k + fz * fwd * k];
  const legs = [-1, 1].map((s) => ({ hip: P(s * 0.088, 0, 0.92), knee: P(s * 0.094, 0.012, 0.5), ankle: P(s * 0.1, -0.01, 0.085), toe: [fx, 0, fz] }));
  const sw = o.armOut ?? 0;
  const arms = [-1, 1].map((s) => ({ sh: P(s * 0.185, -0.005, 1.41), el: P(s * (0.21 + sw), 0.01, 1.13), hand: P(s * (0.22 + sw), 0.06, 0.87) }));
  return { k, f: [fx, 0, fz], r, base: [x, y0, z], pelvis: P(0, 0, 0.97), legs, arms, headPitch: o.headPitch ?? 0 };
}
export function personShapes(id, J, mats, o = {}) {
  const k = J.k, f = J.f, out = [];
  const up = [0, 1, 0];
  const pel = J.pelvis;
  const ax = frame(up, f);
  const at = (p, fwd, upv, side = 0) => [p[0] + f[0] * fwd * k + J.r[0] * side * k, p[1] + upv * k, p[2] + f[2] * fwd * k + J.r[2] * side * k];
  for (const L of J.legs) {
    if (!o.skirt) out.push(shape.capsule(id, mats.bottom, L.hip, L.knee, 0.066 * k));
    out.push(shape.capsule(id, o.skirt ? mats.skin : mats.bottom, L.knee, L.ankle, 0.05 * k));
    if (o.skirt) out.push(shape.capsule(id, mats.skin, [L.hip[0], L.hip[1] - 0.25 * k, L.hip[2]], L.knee, 0.058 * k));
    const t = L.toe, fa = frame(up, t);
    out.push(shape.ellipsoid(id, mats.shoe, [L.ankle[0] + t[0] * 0.045 * k, L.ankle[1] - 0.045 * k, L.ankle[2] + t[2] * 0.045 * k], fa, [0.048 * k, 0.042 * k, 0.125 * k]));
  }
  out.push(shape.ellipsoid(id, o.skirt ? mats.bottom : mats.bottom, at(pel, 0, 0), ax, [0.165 * k, 0.115 * k, 0.108 * k]));
  if (o.skirt) out.push(shape.frustum(id, mats.bottom, pel[0], pel[2], pel[1] - 0.4 * k, pel[1] + 0.02 * k, 0.215 * k, 0.15 * k));
  out.push(shape.ellipsoid(id, mats.top, at(pel, 0.0, 0.16), ax, [0.148 * k, 0.17 * k, 0.096 * k]));
  out.push(shape.ellipsoid(id, mats.top, at(pel, 0.006, 0.36), ax, [0.178 * k, 0.19 * k, 0.108 * k]));
  out.push(shape.capsule(id, mats.top, at(pel, 0, 0.44, -0.13), at(pel, 0, 0.44, 0.13), 0.062 * k));
  for (const A of J.arms) {
    out.push(shape.capsule(id, mats.top, A.sh, A.el, 0.046 * k));
    out.push(shape.capsule(id, mats.skin, A.el, A.hand, 0.037 * k));
    const d = [A.hand[0] - A.el[0], A.hand[1] - A.el[1], A.hand[2] - A.el[2]];
    out.push(shape.ellipsoid(id, mats.skin, [A.hand[0] + d[0] * 0.18, A.hand[1] + d[1] * 0.18, A.hand[2] + d[2] * 0.18], frame(d, f), [0.026 * k, 0.055 * k, 0.04 * k]));
  }
  const neck0 = at(pel, 0, 0.49), neck1 = at(pel, 0.005, 0.585);
  out.push(shape.capsule(id, mats.skin, neck0, neck1, 0.047 * k));
  const pa = (J.headPitch || 0) * Math.PI / 180;
  const hf = [f[0] * Math.cos(pa), -Math.sin(pa), f[2] * Math.cos(pa)];
  const hu = [f[0] * Math.sin(pa), Math.cos(pa), f[2] * Math.sin(pa)];
  const hax = frame(hu, hf);
  const hc = [neck1[0] + hu[0] * 0.065 * k + hf[0] * 0.012 * k, neck1[1] + hu[1] * 0.065 * k + hf[1] * 0.012 * k, neck1[2] + hu[2] * 0.065 * k + hf[2] * 0.012 * k];
  const hp = (fwd, upv, side = 0) => [hc[0] + hf[0] * fwd * k + hu[0] * upv * k + J.r[0] * side * k, hc[1] + hf[1] * fwd * k + hu[1] * upv * k, hc[2] + hf[2] * fwd * k + hu[2] * upv * k + J.r[2] * side * k];
  out.push(shape.ellipsoid(id, mats.skin, hc, hax, [0.077 * k, 0.108 * k, 0.094 * k]));
  out.push(shape.ellipsoid(id, mats.hair, hp(-0.03, 0.024), hax, [0.083 * k, 0.1 * k, 0.088 * k]));
  if (o.hair === 'long') {
    out.push(shape.ellipsoid(id, mats.hair, hp(-0.06, -0.075), hax, [0.08 * k, 0.13 * k, 0.05 * k]));
  }
  out.push(shape.ellipsoid(id, mats.skin, hp(0.094, -0.012), hax, [0.015 * k, 0.024 * k, 0.022 * k]));
  for (const s of [-1, 1]) out.push(shape.ellipsoid(id, mats.skin, hp(-0.002, -0.005, s * 0.077), hax, [0.012 * k, 0.026 * k, 0.018 * k]));
  return out;
}
export function clothMat(hex, ks = 0.05) { return { c: lin(hex), ks, sh: 10 }; }
export function skinMat(hex) { return { c: lin(hex), ks: 0.12, sh: 22 }; }
export function hairMat(hex) { return { c: lin(hex), ks: 0.16, sh: 30 }; }

export function renderRect(sc, q, rc, ss = 1) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, k = q * ss, e = cam.eye, tiles = sc.tiles, out = new Float64Array(3);
  const x0 = Math.max(0, Math.floor(rc.x)), y0 = Math.max(0, Math.floor(rc.y));
  const x1 = Math.min(cam.W, Math.ceil(rc.x + rc.w)), y1 = Math.min(cam.H, Math.ceil(rc.y + rc.h));
  const OW = Math.max(1, Math.round((x1 - x0) * q)), OH = Math.max(1, Math.round((y1 - y0) * q));
  const acc = new Float32Array(OW * OH * 3), expo = sc.exposure ?? 1;
  for (let py = 0; py < OH * ss; py++) {
    const by = y0 + (py + 0.5) / k, ty = Math.max(0, Math.min(tiles.ny - 1, Math.floor(by / TILE)));
    for (let px = 0; px < OW * ss; px++) {
      const bx = x0 + (px + 0.5) / k, tx = Math.max(0, Math.min(tiles.nx - 1, Math.floor(bx / TILE)));
      const d = camDir(cam, bx, by);
      trace(sc, e[0], e[1], e[2], d[0], d[1], d[2], Math.floor(bx * k), Math.floor(by * k), tiles.lists[ty * tiles.nx + tx], out);
      const o = Math.floor(py / ss) * OW + Math.floor(px / ss);
      acc[o * 3] += out[0]; acc[o * 3 + 1] += out[1]; acc[o * 3 + 2] += out[2];
    }
  }
  const data = new Uint8ClampedArray(OW * OH * 4), inv = 1 / (ss * ss);
  for (let i = 0; i < OW * OH; i++) {
    for (let c = 0; c < 3; c++) { let v = acc[i * 3 + c] * inv * expo; v = v / (1 + 0.12 * v); data[i * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)); }
    data[i * 4 + 3] = 255;
  }
  return { data, w: OW, h: OH, q, x: x0, y: y0, bw: x1 - x0, bh: y1 - y0 };
}
