const EPS = 1e-4;
export const SPH = 0, SHL = 1;
export const FORM = Object.freeze({ ROUND: 0, BOX: 1, BOWL: 2 });
export const PART = Object.freeze({ BALL: 0, OUT: 1, RIM: 2, BOT: 3, IN: 4, FLOOR: 5 });

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

function solidBowlR(s) {
  if (s.ysph >= s.ya && s.ysph <= s.yb) return s.Ro;
  const dy = Math.min(Math.abs(s.ya - s.ysph), Math.abs(s.yb - s.ysph));
  return Math.sqrt(Math.max(0, s.Ro * s.Ro - dy * dy));
}
function finish(s) {
  let x0, x1, y0, y1, z0, z1;
  if (s.k === SPH) { x0 = s.cx - s.r; x1 = s.cx + s.r; y0 = s.cy - s.r; y1 = s.cy + s.r; z0 = s.cz - s.r; z1 = s.cz + s.r; }
  else {
    const c = s.yawCos, sn = s.yawSin;
    const e = s.form === FORM.BOX ? Math.abs(s.hx * c) + Math.abs(s.hz * sn) : s.form === FORM.ROUND ? Math.max(s.ra, s.rb) : s.solid ? solidBowlR(s) : s.Ro;
    const ez = s.form === FORM.BOX ? Math.abs(s.hx * sn) + Math.abs(s.hz * c) : e;
    x0 = s.cx - e; x1 = s.cx + e; z0 = s.cz - ez; z1 = s.cz + ez; y0 = s.ya; y1 = s.yb;
  }
  s.bb = [x0, y0, z0, x1, y1, z1];
  s.bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
  return s;
}
export const shape = {
  ball: (id, m, cx, cy, cz, r, rot, restY = 0) => finish({ k: SPH, id, m, cx, cy, cz, r, rot, restY }),
  shell: (id, m, o) => {
    const a = (o.yaw || 0) * Math.PI / 180;
    return finish({ k: SHL, id, m, form: o.form, cx: o.cx, cz: o.cz, ya: o.ya ?? 0, yb: o.yb, ca: o.ca, cb: o.cb,
      ra: o.ra, rb: o.rb, w: o.w, hx: o.hx, hz: o.hz, ysph: o.ysph, Ro: o.Ro, yawCos: Math.cos(a), yawSin: Math.sin(a),
      cav: !!o.cav, solid: !!o.solid, restY: 0, tag: o.tag ?? 0 });
  },
};
function yc(s) { return s.yawCos; }
function ys(s) { return s.yawSin; }

const SP = new Float64Array(4);
function slab(oy, dy, y0, y1) {
  if (Math.abs(dy) < 1e-12) { if (oy < y0 || oy > y1) return false; SP[0] = -Infinity; SP[1] = Infinity; SP[2] = 0; SP[3] = 0; return true; }
  let a = (y0 - oy) / dy, b = (y1 - oy) / dy, ka = 2, kb = 1;
  if (a > b) { const t = a; a = b; b = t; ka = 1; kb = 2; }
  SP[0] = a; SP[1] = b; SP[2] = ka; SP[3] = kb; return true;
}
function spanRound(cx, cz, y0, y1, ra, rb, ox, oy, oz, dx, dy, dz) {
  if (!slab(oy, dy, y0, y1)) return false;
  let lo = SP[0], hi = SP[1], klo = SP[2], khi = SP[3];
  const k = (rb - ra) / (y1 - y0), px = ox - cx, pz = oz - cz;
  const A = ra + k * (oy - y0), B = k * dy;
  if (Math.abs(B) < 1e-12) { if (A < 0) return false; }
  else { const tr = -A / B; if (B > 0) { if (tr > lo) { lo = tr; klo = 0; } } else if (tr < hi) { hi = tr; khi = 0; } }
  if (lo >= hi) return false;
  const qa = dx * dx + dz * dz - B * B, qb = px * dx + pz * dz - A * B, qc = px * px + pz * pz - A * A;
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) < 1e-12) { if (qc > 0) return false; }
    else { const t = -qc / (2 * qb); if (qb > 0) { if (t < hi) { hi = t; khi = 0; } } else if (t > lo) { lo = t; klo = 0; } }
  } else {
    const disc = qb * qb - qa * qc;
    if (disc < 0) { if (qa > 0) return false; }
    else {
      const sq = Math.sqrt(disc); let t1 = (-qb - sq) / qa, t2 = (-qb + sq) / qa;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (qa > 0) { if (t1 > lo) { lo = t1; klo = 0; } if (t2 < hi) { hi = t2; khi = 0; } }
      else {
        const aOk = lo < Math.min(hi, t1), bOk = Math.max(lo, t2) < hi;
        if (aOk) { if (t1 < hi) { hi = t1; khi = 0; } }
        else if (bOk) { if (t2 > lo) { lo = t2; klo = 0; } }
        else return false;
      }
    }
  }
  if (lo >= hi) return false;
  SP[0] = lo; SP[1] = hi; SP[2] = klo; SP[3] = khi; return true;
}
function spanBox(cx, cz, c, s, hx, hz, y0, y1, ox, oy, oz, dx, dy, dz) {
  if (!slab(oy, dy, y0, y1)) return false;
  let lo = SP[0], hi = SP[1], klo = SP[2], khi = SP[3];
  const px = ox - cx, pz = oz - cz;
  const o0 = px * c - pz * s, o2 = px * s + pz * c, d0 = dx * c - dz * s, d2 = dx * s + dz * c;
  for (let a = 0; a < 2; a++) {
    const o = a ? o2 : o0, d = a ? d2 : d0, h = a ? hz : hx;
    if (Math.abs(d) < 1e-12) { if (o < -h || o > h) return false; continue; }
    let t1 = (-h - o) / d, t2 = (h - o) / d; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > lo) { lo = t1; klo = 0; }
    if (t2 < hi) { hi = t2; khi = 0; }
    if (lo >= hi) return false;
  }
  SP[0] = lo; SP[1] = hi; SP[2] = klo; SP[3] = khi; return true;
}
function spanSphere(cx, cy, cz, r, y0, y1, ox, oy, oz, dx, dy, dz) {
  if (!slab(oy, dy, y0, y1)) return false;
  let lo = SP[0], hi = SP[1], klo = SP[2], khi = SP[3];
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - r * r, disc = b * b - c;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc), t1 = -b - sq, t2 = -b + sq;
  if (t1 > lo) { lo = t1; klo = 0; }
  if (t2 < hi) { hi = t2; khi = 0; }
  if (lo >= hi) return false;
  SP[0] = lo; SP[1] = hi; SP[2] = klo; SP[3] = khi; return true;
}
function outerSpan(s, ox, oy, oz, dx, dy, dz) {
  if (s.form === FORM.ROUND) return spanRound(s.cx, s.cz, s.ya, s.yb, s.ra, s.rb, ox, oy, oz, dx, dy, dz);
  if (s.form === FORM.BOX) return spanBox(s.cx, s.cz, yc(s), ys(s), s.hx, s.hz, s.ya, s.yb, ox, oy, oz, dx, dy, dz);
  return spanSphere(s.cx, s.ysph, s.cz, s.Ro, s.ya, s.yb, ox, oy, oz, dx, dy, dz);
}
export function roundInner(s, y) { return s.ra + (s.rb - s.ra) * (y - s.ya) / (s.yb - s.ya) - s.w; }
function cavSpan(s, ox, oy, oz, dx, dy, dz) {
  if (s.form === FORM.ROUND) return spanRound(s.cx, s.cz, s.ca, s.cb, roundInner(s, s.ca), roundInner(s, s.cb), ox, oy, oz, dx, dy, dz);
  if (s.form === FORM.BOX) return spanBox(s.cx, s.cz, yc(s), ys(s), s.hx - s.w, s.hz - s.w, s.ca, s.cb, ox, oy, oz, dx, dy, dz);
  return spanSphere(s.cx, s.ysph, s.cz, s.Ro - s.w, s.ca, s.cb, ox, oy, oz, dx, dy, dz);
}

const NRM = new Float64Array(3);
const HITPART = new Int8Array(1);

function hitSph(s, ox, oy, oz, dx, dy, dz, tmax) {
  const lx = ox - s.cx, ly = oy - s.cy, lz = oz - s.cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - s.r * s.r;
  const disc = b * b - c; if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc); let t = -b - sq;
  if (t < EPS) { t = -b + sq; if (t < EPS) return Infinity; }
  if (t >= tmax) return Infinity;
  NRM[0] = (lx + t * dx) / s.r; NRM[1] = (ly + t * dy) / s.r; NRM[2] = (lz + t * dz) / s.r;
  HITPART[0] = PART.BALL;
  return t;
}
function sideNormal(s, x, y, z, inner) {
  const px = x - s.cx, pz = z - s.cz;
  if (s.form === FORM.ROUND) {
    const k = (s.rb - s.ra) / (s.yb - s.ya), rho = Math.hypot(px, pz) || 1;
    let nx = px / rho, ny = -k, nz = pz / rho; const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    if (inner) { nx = -nx; ny = -ny; nz = -nz; }
    NRM[0] = nx; NRM[1] = ny; NRM[2] = nz; return;
  }
  if (s.form === FORM.BOX) {
    const c = yc(s), sn = ys(s), l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    const hx = inner ? s.hx - s.w : s.hx, hz = inner ? s.hz - s.w : s.hz;
    let n0 = 0, n2 = 0;
    if (Math.abs(Math.abs(l0) - hx) < Math.abs(Math.abs(l2) - hz)) n0 = Math.sign(l0) || 1; else n2 = Math.sign(l2) || 1;
    if (inner) { n0 = -n0; n2 = -n2; }
    NRM[0] = n0 * c + n2 * sn; NRM[1] = 0; NRM[2] = -n0 * sn + n2 * c; return;
  }
  const py = y - s.ysph, l = Math.hypot(px, py, pz) || 1, g = inner ? -1 / l : 1 / l;
  NRM[0] = px * g; NRM[1] = py * g; NRM[2] = pz * g;
}
function hitShell(s, ox, oy, oz, dx, dy, dz, tmax) {
  if (!outerSpan(s, ox, oy, oz, dx, dy, dz)) return Infinity;
  const o0 = SP[0], o1 = SP[1], ok0 = SP[2];
  let c0 = Infinity, c1 = -Infinity, ck1 = 0;
  if (cavSpan(s, ox, oy, oz, dx, dy, dz)) { c0 = SP[0]; c1 = SP[1]; ck1 = SP[3]; }
  const aEnd = Math.min(o1, c0), bStart = Math.max(o0, c1);
  let t = Infinity, inner = false, kind = 0;
  if (o0 < aEnd && aEnd > EPS) { t = Math.max(o0, EPS); kind = ok0; }
  else if (bStart < o1 && o1 > EPS) { t = Math.max(bStart, EPS); inner = c1 > o0; kind = inner ? ck1 : ok0; }
  if (!(t < tmax)) return Infinity;
  const x = ox + t * dx, y = oy + t * dy, z = oz + t * dz;
  if (kind === 0) { sideNormal(s, x, y, z, inner); HITPART[0] = inner ? PART.IN : PART.OUT; }
  else if (!inner) { NRM[0] = 0; NRM[1] = kind === 1 ? 1 : -1; NRM[2] = 0; HITPART[0] = kind === 1 ? PART.RIM : PART.BOT; }
  else { NRM[0] = 0; NRM[1] = 1; NRM[2] = 0; HITPART[0] = PART.FLOOR; }
  return t;
}
export function hitShape(s, ox, oy, oz, dx, dy, dz, tmax) {
  return s.k === SPH ? hitSph(s, ox, oy, oz, dx, dy, dz, tmax) : hitShell(s, ox, oy, oz, dx, dy, dz, tmax);
}
function bsMiss(s, ox, oy, oz, dx, dy, dz) {
  const b = s.bs, lx = b[0] - ox, ly = b[1] - oy, lz = b[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz, r = b[3];
  if (tc < -r) return true;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  return d2 > r * r;
}

export function cavityOpen(s, x, y, z) {
  if (s.k !== SHL || !s.cav) return 1;
  const px = x - s.cx, pz = z - s.cz, tol = 2e-3;
  if (y < s.ca - tol || y > s.yb + tol) return 1;
  let Rr;
  if (s.form === FORM.ROUND) {
    if (Math.hypot(px, pz) > roundInner(s, y) + tol) return 1;
    Rr = roundInner(s, s.yb);
  } else if (s.form === FORM.BOX) {
    const c = yc(s), sn = ys(s), l0 = px * c - pz * sn, l2 = px * sn + pz * c;
    if (Math.abs(l0) > s.hx - s.w + tol || Math.abs(l2) > s.hz - s.w + tol) return 1;
    Rr = Math.sqrt((s.hx - s.w) * (s.hz - s.w)) * 1.08;
  } else {
    const Ri = s.Ro - s.w, py = y - s.ysph;
    if (Math.hypot(px, py, pz) > Ri + tol) return 1;
    Rr = Math.sqrt(Math.max(1e-6, Ri * Ri - (s.yb - s.ysph) ** 2));
  }
  const d = Math.max(0, s.yb - y);
  return (Rr * Rr) / (Rr * Rr + 1.35 * d * d);
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
    if (s.k === SPH) { occ.push([s.cx, s.cy, s.cz, s.r, s.id]); continue; }
    if (s.solid && s.form === FORM.BOWL) { occ.push([s.cx, (s.ya + s.yb) / 2, s.cz, solidBowlR(s) * 0.85, s.id]); continue; }
    if (s.solid) { occ.push([s.cx, (s.ya + s.yb) / 2, s.cz, Math.cbrt(s.hx * s.hz * (s.yb - s.ya) / 2) * 1.05, s.id]); continue; }
    if (!s.cav) continue;
    const r = s.form === FORM.BOX ? Math.sqrt(s.hx * s.hz) * 1.05 : s.form === FORM.ROUND ? (s.ra + s.rb) / 2 : s.Ro * 0.8;
    const n = Math.max(1, Math.round((s.yb - s.ya) / (1.6 * r)));
    for (let i = 0; i < n; i++) occ.push([s.cx, s.ya + (i + 0.5) * (s.yb - s.ya) / n, s.cz, Math.min(r * 1.05, (s.yb - s.ya) / n * 0.62 + r * 0.45), s.id]);
  }
  const byId = new Map();
  for (const s of o.shapes) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  const groups = [];
  for (const [id, list] of byId) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const s of list) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
    const bs = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
    groups.push({ id, bs, list, body: list.find((s) => s.cav) || null, occ: occ.filter((q) => q[4] === id) });
  }
  const bodies = o.shapes.filter((s) => s.k === SHL && s.cav);
  return { ...o, Ld, T1, T2, occ, byId, groups, bodies, tiles: null };
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

const HIT = { t: Infinity, s: null, nx: 0, ny: 0, nz: 0, part: 0 };
function nearest(list, ox, oy, oz, dx, dy, dz, tmax) {
  HIT.t = tmax; HIT.s = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const t = hitShape(s, ox, oy, oz, dx, dy, dz, HIT.t);
    if (t < HIT.t) { HIT.t = t; HIT.s = s; HIT.nx = NRM[0]; HIT.ny = NRM[1]; HIT.nz = NRM[2]; HIT.part = HITPART[0]; }
  }
  return HIT;
}

export function pickId(sc, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  const h = nearest(sc.shapes, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
  return h.s ? h.s.id : -1;
}
export function pickHit(sc, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  const h = nearest(sc.shapes, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
  return h.s ? { id: h.s.id, part: h.part, t: h.t } : { id: -1, part: -1, t: Infinity };
}
export function pickNear(sc, x, y, maxR = 10, ok = () => true) {
  const id0 = pickId(sc, x, y);
  if (id0 >= 0 && ok(id0)) return id0;
  for (let r = 3; r <= maxR; r += 3.5) {
    const votes = new Map();
    const n = Math.max(8, Math.round(r * 1.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, id = pickId(sc, x + r * Math.cos(a), y + r * Math.sin(a));
      if (id >= 0 && ok(id)) votes.set(id, (votes.get(id) || 0) + 1);
    }
    if (votes.size) {
      let best = -1, bv = -1;
      for (const [id, v] of votes) if (v > bv || (v === bv && id < best)) { best = id; bv = v; }
      return best;
    }
  }
  return -1;
}
export function objectStats(sc, id, step = 2, withVis = true, occ = null) {
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
  let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
  const list = occ || sc.shapes;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (ix0 + c) * step, y = (iy0 + r) * step;
    const d = camDir(cam, x, y);
    let alone = Infinity;
    for (const s of shapes) alone = Math.min(alone, hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], alone));
    if (alone === Infinity) continue;
    area++;
    if (x < 0 || y < 0 || x > cam.W || y > cam.H) off++;
    ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); ay0 = Math.min(ay0, y); ay1 = Math.max(ay1, y);
    if (!withVis) continue;
    let seen = true;
    for (let i = 0; i < list.length && seen; i++) {
      const s = list[i]; if (s.id === id) continue;
      if (hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], alone) < alone) seen = false;
    }
    if (seen) {
      vis++; sx += x; sy += y; grid[r * cols + c] = 1;
      vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x); vy0 = Math.min(vy0, y); vy1 = Math.max(vy1, y);
    }
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
  return { area, vis, frac: area ? vis / area : 0, off, cx, cy, pt,
    box: area ? [ax0, ay0, ax1, ay1] : null, vbox: vis ? [vx0, vy0, vx1, vy1] : null, step };
}
export function covers(sc, id, x, y) {
  const cam = sc.cam, d = camDir(cam, x, y), e = cam.eye;
  for (const s of sc.byId.get(id)) if (hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], Infinity) < Infinity) return true;
  return false;
}

const NDISK = 28;
const DISK = Array.from({ length: NDISK }, (_, i) => { const r = Math.sqrt((i + 0.5) / NDISK), a = i * 2.39996323; return [r * Math.cos(a), r * Math.sin(a)]; });

function blocked(sc, ox, oy, oz, dx, dy, dz) {
  const G = sc.groups;
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi];
    if (bsMiss(g, ox, oy, oz, dx, dy, dz)) continue;
    const list = g.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (list.length > 1 && bsMiss(s, ox, oy, oz, dx, dy, dz)) continue;
      if (hitShape(s, ox, oy, oz, dx, dy, dz, Infinity) < Infinity) return true;
    }
  }
  return false;
}
function softShadow(sc, ox, oy, oz, px, py) {
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, k = Math.tan(sc.light.soft || 0.04);
  const ign = (52.9829189 * ((0.06711056 * px + 0.00583715 * py) % 1)) % 1;
  const rot = ign * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
  const sample = (i) => {
    const u = (DISK[i][0] * cr - DISK[i][1] * sr) * k, v = (DISK[i][0] * sr + DISK[i][1] * cr) * k;
    let dx = L[0] + T1[0] * u + T2[0] * v, dy = L[1] + T1[1] * u + T2[1] * v, dz = L[2] + T1[2] * u + T2[2] * v;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    return blocked(sc, ox, oy, oz, dx, dy, dz) ? 0 : 1;
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
    if (g.body && cavityOpen(g.body, x, y, z) < 1) continue;
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
function cavityAt(sc, x, y, z) {
  let f = 1;
  for (const b of sc.bodies) { const v = cavityOpen(b, x, y, z); if (v < f) f = v; }
  return f;
}

const COL = new Float64Array(3), TMP = new Float64Array(3), ENVC = new Float64Array(3);
function shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, selfId, restY, px, py, out) {
  const Lt = sc.light, L = sc.Ld;
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  const hemi = 0.5 + 0.5 * ny;
  let ar = Lt.ground[0] + (Lt.sky[0] - Lt.ground[0]) * hemi, ag = Lt.ground[1] + (Lt.sky[1] - Lt.ground[1]) * hemi, ab = Lt.ground[2] + (Lt.sky[2] - Lt.ground[2]) * hemi;
  let ao = aoAt(sc, x, y, z, nx, ny, nz, selfId);
  if (selfId >= 0) {
    const h = Math.max(0, y - restY);
    ao *= 1 - (Lt.contact ?? 0.35) * (0.6 - 0.4 * ny) * Math.exp(-h / (Lt.contactH ?? 0.18));
  }
  const cav = cavityAt(sc, x, y, z), amb = ao * (0.22 + 0.78 * cav);
  ar *= amb; ag *= amb; ab *= amb;
  const ndl = nx * L[0] + ny * L[1] + nz * L[2];
  let vis = 0;
  if (ndl > 0) vis = softShadow(sc, x + nx * 2e-3, y + ny * 2e-3, z + nz * 2e-3, px, py);
  const dif = Math.max(0, ndl) * vis;
  let r = base[0] * (ar + Lt.col[0] * dif), g = base[1] * (ag + Lt.col[1] * dif), b = base[2] * (ab + Lt.col[2] * dif);
  if (Lt.fill) {
    const F = Lt.fill.dir, fd = Math.max(0, nx * F[0] + ny * F[1] + nz * F[2]) * ao * cav;
    r += base[0] * Lt.fill.col[0] * fd; g += base[1] * Lt.fill.col[1] * fd; b += base[2] * Lt.fill.col[2] * fd;
  }
  if (mat && mat.ks > 0 && vis > 0) {
    let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const sp = mat.ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), mat.sh) * vis;
    r += Lt.col[0] * sp; g += Lt.col[1] * sp; b += Lt.col[2] * sp;
  }
  if (mat && mat.env > 0) {
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = mat.env * Math.pow(1 - ndv, 4) * (0.35 + 0.65 * cav);
    const k2 = 2 * (nx * dx + ny * dy + nz * dz), rx = dx - k2 * nx, ry = dy - k2 * ny, rz = dz - k2 * nz;
    sc.env.sky(rx, Math.abs(ry), rz, ENVC);
    r = r * (1 - fr) + ENVC[0] * fr; g = g * (1 - fr) + ENVC[1] * fr; b = b * (1 - fr) + ENVC[2] * fr;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function trace(sc, ox, oy, oz, dx, dy, dz, px, py, list, out) {
  const env = sc.env, fy = env.floorY ?? 0;
  const h = nearest(list, ox, oy, oz, dx, dy, dz, Infinity);
  const s = h.s;
  let tf = Infinity;
  if (dy < -1e-9) { const t = (fy - oy) / dy; if (t > EPS) tf = t; }
  let id = -1, tHit = Infinity;
  if (s && h.t <= tf) {
    id = s.id; tHit = h.t;
    const x = ox + h.t * dx, y = oy + h.t * dy, z = oz + h.t * dz;
    const mat = sc.mats[s.m];
    let base = mat.c;
    if (mat.tex) { mat.tex(s, x, y, z, h.part, h.t / sc.cam.f, TMP); base = TMP; }
    const nx = h.nx, ny = h.ny, nz = h.nz;
    shadeSurface(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, s.id, s.restY || 0, px, py, COL);
  } else if (tf < Infinity) {
    tHit = tf;
    const x = ox + tf * dx, z = oz + tf * dz;
    env.floor(x, z, tf / sc.cam.f * (sc.fpScale || 1), TMP);
    shadeSurface(sc, x, fy, z, 0, 1, 0, dx, dy, dz, TMP, env.floorMat || { ks: 0, sh: 1 }, -1, 0, px, py, COL);
  } else {
    env.sky(dx, dy, dz, COL);
  }
  const fog = env.fog;
  if (fog && tHit < Infinity) {
    const a = Math.max(0, Math.min(1, (tHit - fog.d0) / (fog.d1 - fog.d0))), k = a * a * (3 - 2 * a) * (fog.max ?? 1);
    COL[0] += (fog.col[0] - COL[0]) * k; COL[1] += (fog.col[1] - COL[1]) * k; COL[2] += (fog.col[2] - COL[2]) * k;
  }
  out[0] = COL[0]; out[1] = COL[1]; out[2] = COL[2];
  return id;
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
export function ringImage(img, id, inner, outer, width = 2.5, halo = 1.5) {
  const { w, h, ids } = img, R1 = Math.max(1, Math.round(width * img.q)), R2 = R1 + Math.max(1, Math.round(halo * img.q));
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ids[y * w + x] === id) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const data = new Uint8ClampedArray(w * h * 4);
  if (x1 >= 0) {
    for (let y = Math.max(0, y0 - R2); y <= Math.min(h - 1, y1 + R2); y++) for (let x = Math.max(0, x0 - R2); x <= Math.min(w - 1, x1 + R2); x++) {
      const i = y * w + x;
      if (ids[i] === id) continue;
      let dmin = Infinity;
      for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
        const d2 = dx * dx + dy * dy; if (d2 > R2 * R2 || d2 >= dmin) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ids[yy * w + xx] === id) dmin = d2;
      }
      if (dmin === Infinity) continue;
      const c = dmin <= R1 * R1 ? inner : outer;
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = c[3];
    }
  }
  return { data, w, h, box: x1 >= 0 ? [x0 / img.q, y0 / img.q, x1 / img.q, y1 / img.q] : null };
}
