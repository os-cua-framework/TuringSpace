const EPS = 1e-4;
export const SPH = 0, BOX = 1, CYL = 2, FRU = 3, ELL = 4, CAP = 5, PLY = 6;

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
    case ELL: {
      const M = s.M, r = s.rad, e = [0, 0, 0];
      for (let j = 0; j < 3; j++) e[j] = Math.hypot(M[j] * r[0], M[3 + j] * r[1], M[6 + j] * r[2]);
      x0 = s.cx - e[0]; x1 = s.cx + e[0]; y0 = s.cy - e[1]; y1 = s.cy + e[1]; z0 = s.cz - e[2]; z1 = s.cz + e[2]; break;
    }
    case CAP:
      x0 = Math.min(s.ax, s.bx) - s.r; x1 = Math.max(s.ax, s.bx) + s.r;
      y0 = Math.min(s.ay, s.by) - s.r; y1 = Math.max(s.ay, s.by) + s.r;
      z0 = Math.min(s.az, s.bz) - s.r; z1 = Math.max(s.az, s.bz) + s.r; break;
    case PLY: {
      x0 = y0 = z0 = Infinity; x1 = y1 = z1 = -Infinity;
      for (const v of s.verts) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); }
      break;
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
  ellipsoid: (id, m, cx, cy, cz, rx, ry, rz, M) => finish({ k: ELL, id, m, cx, cy, cz, rad: [rx, ry, rz], M }),
  capsule: (id, m, ax, ay, az, bx, by, bz, r) => finish({ k: CAP, id, m, ax, ay, az, bx, by, bz, r }),
  poly: (id, m, verts, faces) => {
    const c = [0, 0, 0];
    for (const v of verts) { c[0] += v[0] / verts.length; c[1] += v[1] / verts.length; c[2] += v[2] / verts.length; }
    const planes = [];
    for (const f of faces) {
      const a = verts[f[0]], b = verts[f[1]], d = verts[f[2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(n[0], n[1], n[2]); n = n.map((q) => q / l);
      let off = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
      if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] > off) { n = n.map((q) => -q); off = -off; }
      planes.push([n[0], n[1], n[2], off]);
    }
    return finish({ k: PLY, id, m, verts, planes, cx: c[0], cy: c[1], cz: c[2] });
  },
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
  for (let a = 0; a < 3; a++) {
    const h = a === 0 ? s.hx : a === 1 ? s.hy : s.hz, o = a === 0 ? o0 : a === 1 ? o1 : o2, d = a === 0 ? d0 : a === 1 ? d1 : d2;
    if (Math.abs(d) < 1e-12) { if (o < -h || o > h) return Infinity; continue; }
    let t1 = (-h - o) / d, t2 = (h - o) / d, sgn = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
    if (t1 > tn) { tn = t1; ax = a; sg = sgn; }
    if (t2 < tf) tf = t2;
    if (tn > tf) return Infinity;
  }
  if (ax < 0 || tn < EPS || tn >= tmax) return Infinity;
  let n0 = ax === 0 ? sg : 0, n1 = ax === 1 ? sg : 0, n2 = ax === 2 ? sg : 0;
  if (s.bev > 0) {
    const p0 = o0 + tn * d0, p1 = o1 + tn * d1, p2 = o2 + tn * d2;
    if (ax !== 0) { const e = Math.abs(p0) - (s.hx - s.bev); if (e > 0) n0 += Math.sign(p0) * Math.min(1, e / s.bev) * 0.95; }
    if (ax !== 1) { const e = Math.abs(p1) - (s.hy - s.bev); if (e > 0) n1 += Math.sign(p1) * Math.min(1, e / s.bev) * 0.95; }
    if (ax !== 2) { const e = Math.abs(p2) - (s.hz - s.bev); if (e > 0) n2 += Math.sign(p2) * Math.min(1, e / s.bev) * 0.95; }
    const l = Math.hypot(n0, n1, n2); n0 /= l; n1 /= l; n2 /= l;
  }
  NRM[0] = n0 * ca + n2 * sa; NRM[1] = n1; NRM[2] = -n0 * sa + n2 * ca;
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
  let r1 = NaN, r2 = NaN;
  if (Math.abs(qa) > 1e-12) {
    const disc = qb * qb - qa * qc;
    if (disc >= 0) { const sq = Math.sqrt(disc); r1 = (-qb - sq) / qa; r2 = (-qb + sq) / qa; }
  } else if (Math.abs(qb) > 1e-12) r1 = -qc / (2 * qb);
  for (const t of [r1, r2]) {
    if (!(t > EPS && t < best)) continue;
    const y = oy + t * dy;
    if (y < s.y0 || y > s.y1 || A + B * t < 0) continue;
    best = t; kind = 0;
  }
  if (Math.abs(dy) > 1e-12) {
    for (let q = 0; q < 2; q++) {
      const yc = q ? s.y0 : s.y1, rc = q ? s.r0 : s.r1;
      const t = (yc - oy) / dy;
      if (t > EPS && t < best) { const qx = px + t * dx, qz = pz + t * dz; if (qx * qx + qz * qz <= rc * rc) { best = t; kind = q ? 2 : 1; } }
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

function hitEll(s, ox, oy, oz, dx, dy, dz, tmax) {
  const M = s.M, r = s.rad;
  const px = ox - s.cx, py = oy - s.cy, pz = oz - s.cz;
  const o0 = (M[0] * px + M[1] * py + M[2] * pz) / r[0], o1 = (M[3] * px + M[4] * py + M[5] * pz) / r[1], o2 = (M[6] * px + M[7] * py + M[8] * pz) / r[2];
  const d0 = (M[0] * dx + M[1] * dy + M[2] * dz) / r[0], d1 = (M[3] * dx + M[4] * dy + M[5] * dz) / r[1], d2 = (M[6] * dx + M[7] * dy + M[8] * dz) / r[2];
  const a = d0 * d0 + d1 * d1 + d2 * d2, b = o0 * d0 + o1 * d1 + o2 * d2, c = o0 * o0 + o1 * o1 + o2 * o2 - 1;
  const disc = b * b - a * c; if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc); let t = (-b - sq) / a;
  if (t < EPS) { t = (-b + sq) / a; if (t < EPS) return Infinity; }
  if (t >= tmax) return Infinity;
  const l0 = (o0 + t * d0) / r[0], l1 = (o1 + t * d1) / r[1], l2 = (o2 + t * d2) / r[2];
  let nx = M[0] * l0 + M[3] * l1 + M[6] * l2, ny = M[1] * l0 + M[4] * l1 + M[7] * l2, nz = M[2] * l0 + M[5] * l1 + M[8] * l2;
  const l = Math.hypot(nx, ny, nz) || 1; NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  return t;
}

function hitCap(s, ox, oy, oz, dx, dy, dz, tmax) {
  const bax = s.bx - s.ax, bay = s.by - s.ay, baz = s.bz - s.az;
  const oax = ox - s.ax, oay = oy - s.ay, oaz = oz - s.az;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz, r = s.r;
  const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c, t = Infinity;
  if (h >= 0 && a > 1e-14) {
    const t0 = (-b - Math.sqrt(h)) / a, y = baoa + t0 * bard;
    if (y > 0 && y < baba && t0 > EPS) t = t0;
  }
  if (t === Infinity) {
    for (let q = 0; q < 2; q++) {
      const cx = q ? s.bx : s.ax, cy = q ? s.by : s.ay, cz = q ? s.bz : s.az;
      const lx = ox - cx, ly = oy - cy, lz = oz - cz;
      const bb = lx * dx + ly * dy + lz * dz, cc = lx * lx + ly * ly + lz * lz - r * r, hh = bb * bb - cc;
      if (hh < 0) continue;
      const tc = -bb - Math.sqrt(hh);
      if (tc > EPS && tc < t) t = tc;
    }
  }
  if (!(t < tmax)) return Infinity;
  const qx = ox + t * dx - s.ax, qy = oy + t * dy - s.ay, qz = oz + t * dz - s.az;
  const u = Math.max(0, Math.min(1, (qx * bax + qy * bay + qz * baz) / baba));
  let nx = qx - u * bax, ny = qy - u * bay, nz = qz - u * baz;
  const l = Math.hypot(nx, ny, nz) || 1; NRM[0] = nx / l; NRM[1] = ny / l; NRM[2] = nz / l;
  return t;
}

function hitPly(s, ox, oy, oz, dx, dy, dz, tmax) {
  let tn = -Infinity, tf = Infinity, best = -1;
  const P = s.planes;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], den = p[0] * dx + p[1] * dy + p[2] * dz, dist = p[3] - (p[0] * ox + p[1] * oy + p[2] * oz);
    if (Math.abs(den) < 1e-12) { if (dist < 0) return Infinity; continue; }
    const t = dist / den;
    if (den < 0) { if (t > tn) { tn = t; best = i; } } else if (t < tf) tf = t;
    if (tn > tf) return Infinity;
  }
  if (best < 0 || tn < EPS || tn >= tmax) return Infinity;
  const p = P[best]; NRM[0] = p[0]; NRM[1] = p[1]; NRM[2] = p[2];
  return tn;
}

export function hitShape(s, ox, oy, oz, dx, dy, dz, tmax) {
  switch (s.k) {
    case SPH: return hitSph(s, ox, oy, oz, dx, dy, dz, tmax);
    case BOX: return hitBox(s, ox, oy, oz, dx, dy, dz, tmax);
    case CYL: return hitCyl(s, ox, oy, oz, dx, dy, dz, tmax);
    case FRU: return hitFru(s, ox, oy, oz, dx, dy, dz, tmax);
    case ELL: return hitEll(s, ox, oy, oz, dx, dy, dz, tmax);
    case CAP: return hitCap(s, ox, oy, oz, dx, dy, dz, tmax);
    case PLY: return hitPly(s, ox, oy, oz, dx, dy, dz, tmax);
    default: return Infinity;
  }
}
export function lastNormal() { return NRM; }

function bsMiss(s, ox, oy, oz, dx, dy, dz) {
  const b = s.bs, lx = b[0] - ox, ly = b[1] - oy, lz = b[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz, r = b[3];
  if (tc < -r) return true;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  return d2 > r * r;
}
export { bsMiss };

export function makeRoomScene(o) {
  const occ = [];
  for (const s of o.shapes) {
    if (s.noAO) continue;
    if (s.k === SPH) occ.push([s.cx, s.cy, s.cz, s.r, s.id]);
    else if (s.k === ELL) occ.push([s.cx, s.cy, s.cz, Math.cbrt(s.rad[0] * s.rad[1] * s.rad[2]), s.id]);
    else if (s.k === CAP) occ.push([(s.ax + s.bx) / 2, (s.ay + s.by) / 2, (s.az + s.bz) / 2, s.r * 1.2, s.id]);
    else if (s.k === CYL || s.k === FRU) {
      const r = s.k === CYL ? s.r : (s.r0 + s.r1) / 2;
      const n = Math.max(1, Math.min(6, Math.round((s.y1 - s.y0) / (1.6 * r))));
      for (let i = 0; i < n; i++) occ.push([s.cx, s.y0 + (i + 0.5) * (s.y1 - s.y0) / n, s.cz, Math.min(r * 1.05, (s.y1 - s.y0) / n * 0.62 + r * 0.45), s.id]);
    } else if (s.k === BOX) {
      const ext = [s.hx, s.hy, s.hz], big = Math.max(...ext), small = Math.min(...ext);
      const mid = ext[0] + ext[1] + ext[2] - big - small;
      const r = Math.cbrt(big * mid * small) * 1.05, n = Math.max(1, Math.min(6, Math.round(big / Math.max(mid, 1e-3))));
      const ax = ext.indexOf(big);
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (-1 + (2 * i + 1) / n) * big;
        const lx = ax === 0 ? f : 0, ly = ax === 1 ? f : 0, lz = ax === 2 ? f : 0;
        const wx = s.cx + lx * s.ca + lz * s.sa, wz = s.cz - lx * s.sa + lz * s.ca;
        occ.push([wx, s.cy + ly, wz, Math.min(r, Math.max(mid, small) * 1.1), s.id]);
      }
    } else {
      const b = s.bb, hx = (b[3] - b[0]) / 2, hy = (b[4] - b[1]) / 2, hz = (b[5] - b[2]) / 2;
      occ.push([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, Math.cbrt(hx * hy * hz) * 1.05, s.id]);
    }
  }
  const byId = new Map();
  for (const s of o.shapes) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  const groups = [];
  for (const [id, all] of byId) {
    const list = all.filter((s) => !s.noShadow);
    if (!list.length) continue;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const s of list) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
    const bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
    groups.push({ id, bs, opaque: list, occ: occ.filter((q) => q[4] === id) });
  }
  return { ...o, opaque: o.shapes, occ, byId, groups, tiles: null };
}

const TILE = 12;
function buildTiles(sc) {
  const cam = sc.cam, nx = Math.ceil(cam.W / TILE), ny = Math.ceil(cam.H / TILE);
  const lists = Array.from({ length: nx * ny }, () => []);
  const all = sc.opaque;
  for (let i = 0; i < all.length; i++) {
    const b = all[i].bb;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false, front = false;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      if (p.z <= 0.05) { behind = true; continue; }
      front = true;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (!front) continue;
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

const ROOMHIT = { t: Infinity, kind: 0 };
export function roomHit(room, ox, oy, oz, dx, dy, dz) {
  let t = Infinity, kind = 0;
  if (dy < -1e-12) { const tt = -oy / dy; if (tt < t) { t = tt; kind = 1; } }
  else if (dy > 1e-12) { const tt = (room.H - oy) / dy; if (tt < t) { t = tt; kind = 2; } }
  if (dz < -1e-12) { const tt = -oz / dz; if (tt < t) { t = tt; kind = 3; } }
  else if (dz > 1e-12) { const tt = (room.D - oz) / dz; if (tt < t) { t = tt; kind = 5; } }
  if (dx > 1e-12) { const tt = (room.W - ox) / dx; if (tt < t) { t = tt; kind = 4; } }
  else if (dx < -1e-12) { const tt = -ox / dx; if (tt < t) { t = tt; kind = 6; } }
  ROOMHIT.t = t; ROOMHIT.kind = kind;
  return ROOMHIT;
}
export const WALL_N = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]];
export function wallU(room, w, x, z) { return w === 0 ? x : w === 1 ? z : w === 2 ? room.W - x : room.D - z; }

export function labelAt(sc, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  if (!sc.tiles) buildTiles(sc);
  const T = sc.tiles, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const list = tx >= 0 && ty >= 0 && tx < T.nx && ty < T.ny ? T.lists[ty * T.nx + tx] : sc.opaque;
  const dx = d[0], dy = d[1], dz = d[2];
  const h = nearestOpaque(list, e[0], e[1], e[2], dx, dy, dz, Infinity);
  const r = roomHit(sc.room, e[0], e[1], e[2], dx, dy, dz);
  if (h.s && h.t <= r.t) return { lab: 1000 + h.s.id, t: h.t, id: h.s.id };
  const px = e[0] + r.t * dx, py = e[1] + r.t * dy, pz = e[2] + r.t * dz;
  const u = r.kind >= 3 ? wallU(sc.room, r.kind - 3, px, pz) : 0;
  return { lab: sc.room.label(r.kind, px, py, pz, u), t: r.t, id: -1 };
}

const NDISK = 24;
const DISK = Array.from({ length: NDISK }, (_, i) => { const r = Math.sqrt((i + 0.5) / NDISK), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });

function shadowTrans(sc, ox, oy, oz, dx, dy, dz, tmax) {
  const G = sc.groups;
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi];
    if (bsMiss(g, ox, oy, oz, dx, dy, dz)) continue;
    const list = g.opaque;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (list.length > 1 && bsMiss(s, ox, oy, oz, dx, dy, dz)) continue;
      if (hitShape(s, ox, oy, oz, dx, dy, dz, tmax) < tmax) return 0;
    }
  }
  return 1;
}
const ORDER = [NDISK - 1, NDISK - 4, NDISK - 7, ...Array.from({ length: NDISK }, (_, i) => i).filter((i) => i !== NDISK - 1 && i !== NDISK - 4 && i !== NDISK - 7)];
function softShadow(sc, ox, oy, oz, rot, L, T1, T2, k, tmax) {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let s = 0;
  for (let q = 0; q < NDISK; q++) {
    const i = ORDER[q];
    const u = (DISK[i][0] * cr - DISK[i][1] * sr) * k, v = (DISK[i][0] * sr + DISK[i][1] * cr) * k;
    const dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
    const l = Math.hypot(dx, dy, dz);
    s += shadowTrans(sc, ox, oy, oz, dx / l, dy / l, dz / l, tmax);
    if (q === 2 && (s === 0 || s === 3)) return s / 3;
  }
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
function roomAO(room, x, y, z, kind) {
  const f = (d) => 1 - 0.32 * Math.exp(-Math.max(0, d) / 0.13);
  let a = 1;
  if (kind !== 1) a *= f(y);
  if (kind !== 2) a *= 0.6 + 0.4 * f(room.H - y);
  if (kind !== 3) a *= f(z);
  if (kind !== 5) a *= f(room.D - z);
  if (kind !== 6) a *= f(x);
  if (kind !== 4) a *= f(room.W - x);
  return a;
}
function lightFrame(L) {
  const t1 = Math.abs(L[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T1 = [L[1] * t1[2] - L[2] * t1[1], L[2] * t1[0] - L[0] * t1[2], L[0] * t1[1] - L[1] * t1[0]];
  const tl = Math.hypot(T1[0], T1[1], T1[2]); T1 = [T1[0] / tl, T1[1] / tl, T1[2] / tl];
  const T2 = [L[1] * T1[2] - L[2] * T1[1], L[2] * T1[0] - L[0] * T1[2], L[0] * T1[1] - L[1] * T1[0]];
  return [T1, T2];
}

const LM = 0.05;
function roomPoint(room, w, u, y) {
  const e = 2e-3;
  if (w === 0) return [u, y, e];
  if (w === 1) return [room.W - e, y, u];
  if (w === 2) return [room.W - u, y, room.D - e];
  return [e, y, room.D - u];
}
function bakeMap(sc, nu, nv, pointAt, normal) {
  const Lt = sc.light, vis = new Float32Array(nu * nv), ao = new Float32Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const [x, y, z] = pointAt(i, j);
    const lx = Lt.pos[0] - x, ly = Lt.pos[1] - y, lz = Lt.pos[2] - z, dl = Math.hypot(lx, ly, lz);
    const L = [lx / dl, ly / dl, lz / dl];
    const [T1, T2] = lightFrame(L);
    const ndl = normal[0] * L[0] + normal[1] * L[1] + normal[2] * L[2];
    vis[j * nu + i] = ndl > 0 ? softShadow(sc, x, y, z, hash2(i, j + 977) * Math.PI * 2, L, T1, T2, Lt.radius / dl, dl - Lt.radius) : 1;
    ao[j * nu + i] = aoAt(sc, x, y, z, normal[0], normal[1], normal[2], -1);
  }
  const v2 = new Float32Array(vis.length);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    let s = 0, n = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nu || jj >= nv) continue; s += vis[jj * nu + ii]; n++; }
    v2[j * nu + i] = s / n;
  }
  return { nu, nv, vis: v2, ao };
}
export function bakeLightmaps(sc) {
  if (sc.lm) return sc.lm;
  const R = sc.room, nfx = Math.ceil(R.W / LM), nfz = Math.ceil(R.D / LM), nh = Math.ceil(R.H / LM);
  const floor = bakeMap(sc, nfx, nfz, (i, j) => [(i + 0.5) * LM, 2e-3, (j + 0.5) * LM], [0, 1, 0]);
  const walls = [0, 1, 2, 3].map((w) => bakeMap(sc, Math.ceil((w % 2 ? R.D : R.W) / LM), nh, (i, j) => roomPoint(R, w, (i + 0.5) * LM, (j + 0.5) * LM), WALL_N[w]));
  sc.lm = { floor, walls };
  return sc.lm;
}
const BK = new Float64Array(2);
function sampleMap(mp, a, b) {
  const fa = Math.max(0, Math.min(mp.nu - 1.001, a / LM - 0.5)), fb = Math.max(0, Math.min(mp.nv - 1.001, b / LM - 0.5));
  const i = Math.floor(fa), j = Math.floor(fb), ta = fa - i, tb = fb - j, k = j * mp.nu + i;
  const lerp2 = (A) => (A[k] * (1 - ta) + A[k + 1] * ta) * (1 - tb) + (A[k + mp.nu] * (1 - ta) + A[k + mp.nu + 1] * ta) * tb;
  BK[0] = lerp2(mp.vis); BK[1] = lerp2(mp.ao);
  return BK;
}
function bakedAt(sc, selfId, x, y, z) {
  if (selfId === -1) return sampleMap(sc.lm.floor, x, z);
  if (selfId <= -3) { const w = -3 - selfId; return sampleMap(sc.lm.walls[w], wallU(sc.room, w, x, z), y); }
  return null;
}

const COL = new Float64Array(3), TMP = new Float64Array(3), BASE = new Float64Array(3);
function shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, selfId, px, py, out, envAO) {
  const Lt = sc.light;
  if (mat && mat.emit) { out[0] = base[0] * mat.emit; out[1] = base[1] * mat.emit; out[2] = base[2] * mat.emit; return; }
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  const hemi = 0.5 + 0.5 * ny;
  let ar = Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi, ag = Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi, ab = Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi;
  const baked = selfId < 0 && sc.lm ? bakedAt(sc, selfId, x, y, z) : null;
  let ao = (baked ? baked[1] : aoAt(sc, x, y, z, nx, ny, nz, selfId)) * envAO;
  if (selfId >= 0) {
    ao *= 1 - (Lt.contact ?? 0.35) * (0.6 - 0.4 * ny) * Math.exp(-y / (Lt.contactH ?? 0.18));
    ao *= roomAO(sc.room, x, y, z, -1) * 0.5 + 0.5;
  }
  ar *= ao; ag *= ao; ab *= ao;
  const lx = Lt.pos[0] - x, ly = Lt.pos[1] - y, lz = Lt.pos[2] - z, dl = Math.hypot(lx, ly, lz);
  const L = [lx / dl, ly / dl, lz / dl];
  const ndl = nx * L[0] + ny * L[1] + nz * L[2];
  let vis = 0;
  if (ndl > 0) {
    if (baked) vis = baked[0];
    else {
      const [T1, T2] = lightFrame(L);
      const ign = (52.9829189 * ((0.06711056 * px + 0.00583715 * py) % 1)) % 1;
      vis = softShadow(sc, x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3, ign * Math.PI * 2, L, T1, T2, Lt.radius / dl, dl - Lt.radius);
    }
  }
  const atten = 1 / (1 + (dl / Lt.falloff) ** 2);
  const dif = Math.max(0, ndl) * vis * atten;
  let r = base[0] * (ar + Lt.col[0] * dif), g = base[1] * (ag + Lt.col[1] * dif), b = base[2] * (ab + Lt.col[2] * dif);
  if (Lt.fill) {
    const F = Lt.fill.dir, fd = Math.max(0, nx * F[0] + ny * F[1] + nz * F[2]);
    r += base[0] * Lt.fill.col[0] * fd * ao; g += base[1] * Lt.fill.col[1] * fd * ao; b += base[2] * Lt.fill.col[2] * fd * ao;
  }
  if (mat && mat.ks > 0 && vis > 0) {
    let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const sp = mat.ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), mat.sh) * vis * atten;
    r += Lt.col[0] * sp; g += Lt.col[1] * sp; b += Lt.col[2] * sp;
  }
  if (mat && mat.env > 0) {
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = mat.env * Math.pow(1 - ndv, 4);
    r = r * (1 - fr) + 0.7 * fr; g = g * (1 - fr) + 0.68 * fr; b = b * (1 - fr) + 0.64 * fr;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function trace(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
  const room = sc.room;
  const h = nearestOpaque(list, ox, oy, oz, dx, dy, dz, Infinity);
  const tHit = h.t, s = h.s, nx = h.nx, ny = h.ny, nz = h.nz;
  const rh = roomHit(room, ox, oy, oz, dx, dy, dz), tf = rh.t, kind = rh.kind;
  if (s && tHit <= tf) {
    const x = ox + tHit * dx, y = oy + tHit * dy, z = oz + tHit * dz;
    const mat = sc.mats[s.m];
    let base = mat.c;
    if (mat.tex) { mat.tex(x, y, z, nx, ny, nz, s, BASE, tHit / sc.cam.f); base = BASE; }
    shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, s.id, px, py, out, 1);
    return s.id;
  }
  const x = ox + tf * dx, y = oy + tf * dy, z = oz + tf * dz;
  const fp = tf / sc.cam.f;
  const ao = roomAO(room, x, y, z, kind);
  if (kind === 1) {
    room.floor(x, z, fp, TMP);
    shadeSurface(sc, x, y, z, 0, 1, 0, dx, dy, dz, TMP, room.floorMat, -1, px, py, out, ao);
  } else if (kind === 2) {
    if (room.ceil(x, z, fp, TMP)) { out[0] = TMP[0]; out[1] = TMP[1]; out[2] = TMP[2]; return -1; }
    shadeSurface(sc, x, y, z, 0, -1, 0, dx, dy, dz, TMP, room.wallMat, -2, px, py, out, ao);
    const bo = sc.light.bounce ?? 0;
    out[0] += TMP[0] * bo * ao; out[1] += TMP[1] * bo * ao; out[2] += TMP[2] * bo * ao;
  } else {
    const w = kind - 3, n = WALL_N[w];
    if (room.wall(w, wallU(room, w, x, z), y, fp, dx, dy, dz, TMP)) { out[0] = TMP[0]; out[1] = TMP[1]; out[2] = TMP[2]; return -1; }
    shadeSurface(sc, x, y, z, n[0], n[1], n[2], dx, dy, dz, TMP, room.wallMat, -3 - w, px, py, out, ao);
  }
  return -1;
}

export function render(sc, q = 1, img = null, r0 = 0, r1 = Infinity, ssForce = 0) {
  if (!sc.tiles) buildTiles(sc);
  const cam = sc.cam, W = cam.W, H = cam.H;
  const ss = ssForce || (q >= 1.25 ? 1 : 2), k = q * ss;
  const OW = Math.round(W * q), OH = Math.round(H * q);
  if (!img) img = { data: new Uint8ClampedArray(OW * OH * 4), w: OW, h: OH, q };
  const e = cam.eye, tiles = sc.tiles, out = new Float64Array(3), acc = new Float64Array(3);
  const expo = sc.exposure ?? 1, data = img.data, inv = 1 / (ss * ss);
  const y1 = Math.min(OH, r1);
  for (let oy = Math.max(0, r0); oy < y1; oy++) {
    for (let ox = 0; ox < OW; ox++) {
      acc[0] = acc[1] = acc[2] = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = ox * ss + sx, py = oy * ss + sy;
        const bx = (px + 0.5) / k, by = (py + 0.5) / k;
        const tx = Math.min(tiles.nx - 1, Math.floor(bx / TILE)), ty = Math.min(tiles.ny - 1, Math.floor(by / TILE));
        const d = camDir(cam, bx, by);
        trace(sc, e[0], e[1], e[2], d[0], d[1], d[2], px, py, tiles.lists[ty * tiles.nx + tx], out);
        acc[0] += out[0]; acc[1] += out[1]; acc[2] += out[2];
      }
      const i = (oy * OW + ox) * 4;
      for (let c = 0; c < 3; c++) {
        let v = acc[c] * inv * expo;
        v = v / (1 + 0.12 * v);
        data[i + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
      }
      data[i + 3] = 255;
    }
  }
  return img;
}

export function toCanvas(img, cv = null) {
  const c = cv || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h }));
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
