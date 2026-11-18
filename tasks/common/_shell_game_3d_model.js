import * as RT from './_props_rt.js';

export const DEG = Math.PI / 180;
export const VIEW = { w: 380, h: 384 };
export const DEPTH_MAX = 0.18;
export const MARGIN = 0.006;
export const RB = 0.021;
export const FADE = 0.25;
export const HIDDEN = 0.6;
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export function rowAxes(m) {
  const p = m.row.psi * DEG;
  return { u: [Math.cos(p), 0, -Math.sin(p)], v: [Math.sin(p), 0, Math.cos(p)] };
}
export const slotX = (m, k) => (k - (m.n - 1) / 2) * m.s;
export function world(m, x, y, yy = 0) {
  const { u, v } = rowAxes(m);
  return [x * u[0] + y * v[0], yy, x * u[2] + y * v[2]];
}

export const tau = (m, t) => ((t % m.Lp) + m.Lp) % m.Lp;
export const atRest = (m, t) => { const q = tau(m, t); return q >= m.T && q < m.Lp - FADE; };
export const loopIndex = (m, t) => Math.floor(t / m.Lp);
export function applyEvent(perm, e) {
  const out = perm.slice();
  for (const mv of e.mv) out[mv.t] = perm[mv.f];
  return out;
}
export function trap(u, r = 0.2) {
  if (u <= 0) return 0; if (u >= 1) return 1;
  const k = 1 / (2 * r * (1 - r));
  return u < r ? u * u * k : u > 1 - r ? 1 - (1 - u) * (1 - u) * k : (u - r / 2) / (1 - r);
}
const ARC = new WeakMap();
export const RAMP = 0.15;
function arcTable(m, mv) {
  const xf = slotX(m, mv.f), xt = slotX(m, mv.t);
  let T = ARC.get(mv);
  if (T && T.a === mv.a && T.xf === xf && T.xt === xt) return T;
  const n = 96, L = new Float64Array(n + 1);
  let px = xf, py = 0;
  for (let i = 1; i <= n; i++) { const q = i / n, x = xf + (xt - xf) * q, y = mv.a * Math.sin(Math.PI * q); L[i] = L[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
  T = { a: mv.a, xf, xt, L, n }; ARC.set(mv, T);
  return T;
}
export const arcLength = (m, mv) => (mv.p !== undefined ? 0 : arcTable(m, mv).L[96]);
export function moverPos(m, mv, u, arc = false) {
  const xf = slotX(m, mv.f);
  if (mv.p !== undefined) {
    const p = mv.pk * (1 - Math.cos(2 * Math.PI * u)) / 2;
    return { x: xf + (slotX(m, mv.p) - xf) * p, y: mv.a * Math.sin(Math.PI * p) };
  }
  const T = arcTable(m, mv), target = (arc ? Math.max(0, Math.min(1, u)) : trap(u, RAMP)) * T.L[T.n];
  let lo = 0, hi = T.n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T.L[mid] < target) lo = mid; else hi = mid; }
  const seg = T.L[hi] - T.L[lo], p = Math.min(1, (lo + (seg > 0 ? Math.max(0, target - T.L[lo]) / seg : 0)) / T.n);
  return { x: xf + (T.xt - xf) * p, y: mv.a * Math.sin(Math.PI * p) };
}
export function evPos(m, e, mv, q) {
  const D = e.t1 - e.t0, s = Math.max(0, Math.min(D, q - e.t0));
  if (!e.ps) return moverPos(m, mv, s / D);
  if (e.ps.feint) { const h = (D - e.ps.tp) / 2; return moverPos(m, mv, s < h ? 0.5 * s / h : s < h + e.ps.tp ? 0.5 : 0.5 + 0.5 * (s - h - e.ps.tp) / h); }
  const { as, d1, tp } = e.ps, c = e.ps.c || 0, d2 = D - d1 - tp;
  let a, off;
  if (s < d1) { a = as * trap(s / d1, RAMP); off = 0; }
  else if (s < d1 + tp) { a = as; off = c * smooth((s - d1) / tp); }
  else { const w = trap((s - d1 - tp) / d2, RAMP); a = as + (1 - as) * w; off = c * (1 - smooth((w - 0.45) / 0.55)); }
  const p = moverPos(m, mv, a, true);
  return { x: p.x + off, y: p.y };
}
export function stopTailSpeed(m, mv, as, c, steps = 120) {
  let best = 0;
  for (const q of mv) {
    const at = (w) => { const p = moverPos(m, q, as + (1 - as) * w, true); return { x: p.x + c * (1 - smooth((w - 0.45) / 0.55)), y: p.y }; };
    let prev = at(0);
    for (let i = 1; i <= steps; i++) { const cur = at(i / steps); best = Math.max(best, Math.hypot(cur.x - prev.x, cur.y - prev.y) * steps); prev = cur; }
  }
  return best;
}
export function moveMaxSpeed(m, mv, steps = 240) {
  let best = 0;
  for (const q of mv) {
    let prev = moverPos(m, q, 0);
    for (let i = 1; i <= steps; i++) { const c = moverPos(m, q, i / steps); best = Math.max(best, Math.hypot(c.x - prev.x, c.y - prev.y) * steps); prev = c; }
  }
  return best;
}
export function moveClearance(m, mv, steps = 120) {
  const movingFrom = new Set(mv.map((q) => q.f)), stay = [];
  for (let k = 0; k < m.n; k++) if (!movingFrom.has(k)) stay.push({ x: slotX(m, k), y: 0 });
  let best = Infinity;
  for (let s = 0; s <= steps; s++) {
    const P = mv.map((q) => moverPos(m, q, s / steps));
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) best = Math.min(best, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y));
      for (const q of stay) best = Math.min(best, Math.hypot(P[i].x - q.x, P[i].y - q.y));
    }
  }
  return best;
}
export function permBefore(m, i) {
  let perm = Array.from({ length: m.n }, (_, k) => k);
  for (let j = 0; j < i; j++) perm = applyEvent(perm, m.events[j]);
  return perm;
}
export function finalPerm(m) { return permBefore(m, m.events.length); }

export function rowPoses(m, t) {
  const q = tau(m, t), n = m.n, P = new Array(n);
  let perm = Array.from({ length: n }, (_, k) => k), active = null;
  for (const e of m.events) {
    if (q >= e.t1) { perm = applyEvent(perm, e); continue; }
    if (q > e.t0) active = e;
    break;
  }
  const moving = new Set();
  if (active) {
    for (const mv of active.mv) { const id = perm[mv.f]; P[id] = { ...evPos(m, active, mv, q), lift: 0, tilt: 0 }; moving.add(id); }
  }
  for (let k = 0; k < n; k++) if (!moving.has(perm[k])) P[perm[k]] = { x: slotX(m, k), y: 0, lift: 0, tilt: 0 };
  const k = q <= m.T0 ? 1 : 1 - smooth((q - m.T0) / m.L);
  if (k > 0) { P[m.ball].lift = m.lift * k; P[m.ball].tilt = m.tilt * k; }
  return P;
}
export const ballShows = (m, t) => tau(m, t) < m.T0 + m.L;
export function fadeAt(m, t) {
  const q = tau(m, t);
  if (q > m.Lp - FADE) return (q - (m.Lp - FADE)) / FADE;
  if (t >= m.Lp && q < FADE) return 1 - q / FADE;
  return 0;
}

export function pose3(m, rp) {
  const { u, v } = rowAxes(m), th = (rp.tilt || 0) * DEG, c = Math.cos(th), s = Math.sin(th);
  const b = world(m, rp.x, rp.y, rp.lift || 0);
  return { b, a: [-s * v[0], c, -s * v[2]], e1: u, e3: [c * v[0], s, c * v[2]] };
}
export const poses3At = (m, t) => rowPoses(m, t).map((rp) => pose3(m, rp));
export function ballCentre(m) { const x = slotX(m, m.ball); return world(m, x, 0, RB); }

export function camBase(m) {
  const A = m.cam.az * DEG, E = m.cam.el * DEG, D = m.cam.dist, L = m.cam.look;
  const eye = [L[0] + D * Math.sin(A) * Math.cos(E), L[1] + D * Math.sin(E), L[2] + D * Math.cos(A) * Math.cos(E)];
  let F = [L[0] - eye[0], L[1] - eye[1], L[2] - eye[2]];
  const fl = Math.hypot(...F); F = F.map((q) => q / fl);
  let R = [-F[2], 0, F[0]]; const rl = Math.hypot(...R); R = R.map((q) => q / rl);
  const U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  return { eye, F, R, U };
}
const CAMS = new WeakMap();
export function cameraFor(m) {
  if (CAMS.has(m)) return CAMS.get(m);
  const { eye, F, R, U } = camBase(m);
  const proj = (p) => { const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], zc = dx * F[0] + dy * F[1] + dz * F[2];
    return [(dx * R[0] + dy * R[1] + dz * R[2]) / zc, -(dx * U[0] + dy * U[1] + dz * U[2]) / zc]; };
  const r0 = m.cup.r0, x0 = slotX(m, 0) - r0 - 0.015, x1 = slotX(m, m.n - 1) + r0 + 0.015, yd = DEPTH_MAX + r0 + 0.015;
  const pts = [];
  for (const x of [x0, x1]) for (const y of [-yd, yd]) for (const hh of [0, m.cup.h + m.lift + 0.02]) pts.push(world(m, x, y, hh));
  const xs = pts.map((p) => proj(p)[0]), ys = pts.map((p) => proj(p)[1]);
  const a0 = Math.min(...xs), a1 = Math.max(...xs), b0 = Math.min(...ys), b1 = Math.max(...ys);
  const padX = 14, padY = 16;
  const f = Math.min((VIEW.w - 2 * padX) / (a1 - a0), (VIEW.h - 2 * padY) / (b1 - b0));
  const cam = RT.camFromBasis({ eye, F, R, U, f, cx: VIEW.w / 2 - f * (a0 + a1) / 2, cy: VIEW.h / 2 - f * (b0 + b1) / 2, W: VIEW.w, H: VIEW.h });
  CAMS.set(m, cam);
  return cam;
}
export const projXY = (cam, p) => { const q = cam.project(p[0], p[1], p[2]); return [q.x, q.y]; };

export function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function polyArea(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
export function clipConvex(subject, clip) {
  let out = subject;
  const sgn = Math.sign((() => { let s = 0; for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; })()) || 1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length], inp = out; out = [];
    const side = (p) => sgn * ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]));
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
  }
  return out;
}
export function rimPoints(m, P, nSeg = 20, extraLift = 0) {
  const { r0, r1, h } = m.cup, pts = [];
  for (let i = 0; i < nSeg; i++) {
    const g = (i / nSeg) * 2 * Math.PI, c = Math.cos(g), s = Math.sin(g);
    pts.push([P.b[0] + r0 * (c * P.e1[0] + s * P.e3[0]), P.b[1] + r0 * (c * P.e1[1] + s * P.e3[1]) + extraLift, P.b[2] + r0 * (c * P.e1[2] + s * P.e3[2])]);
    pts.push([P.b[0] + h * P.a[0] + r1 * (c * P.e1[0] + s * P.e3[0]), P.b[1] + h * P.a[1] + r1 * (c * P.e1[1] + s * P.e3[1]), P.b[2] + h * P.a[2] + r1 * (c * P.e1[2] + s * P.e3[2])]);
  }
  return pts;
}
export function cupPoly(m, cam, P, nSeg = 20) { return hull(rimPoints(m, P, nSeg).map((p) => projXY(cam, p))); }
export function cupMid(m, P) { const hh = m.cup.h / 2; return [P.b[0] + P.a[0] * hh, P.b[1] + P.a[1] * hh, P.b[2] + P.a[2] * hh]; }
export function camDist(cam, p) { return Math.hypot(p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]); }
export function overlap(m, cam, Ps, i, j, nSeg = 16) {
  const pi = cupPoly(m, cam, Ps[i], nSeg), pj = cupPoly(m, cam, Ps[j], nSeg);
  const di = camDist(cam, cupMid(m, Ps[i])), dj = camDist(cam, cupMid(m, Ps[j]));
  const [front, back, pb] = di < dj ? [i, j, pj] : [j, i, pi];
  const inter = clipConvex(pi, pj);
  return { frac: inter.length >= 3 ? polyArea(inter) / polyArea(pb) : 0, front, back };
}

const LOC = new Float64Array(6);
export function toLocal(P, o, d) {
  const ox = o[0] - P.b[0], oy = o[1] - P.b[1], oz = o[2] - P.b[2];
  LOC[0] = ox * P.e1[0] + oy * P.e1[1] + oz * P.e1[2]; LOC[1] = ox * P.a[0] + oy * P.a[1] + oz * P.a[2]; LOC[2] = ox * P.e3[0] + oy * P.e3[1] + oz * P.e3[2];
  LOC[3] = d[0] * P.e1[0] + d[1] * P.e1[1] + d[2] * P.e1[2]; LOC[4] = d[0] * P.a[0] + d[1] * P.a[1] + d[2] * P.a[2]; LOC[5] = d[0] * P.e3[0] + d[1] * P.e3[1] + d[2] * P.e3[2];
  return LOC;
}
export const H = { kind: 0 };
export function hitLocal(ox, oy, oz, dx, dy, dz, r0, r1, h, tmax = Infinity) {
  const k = (r0 - r1) / h, w = r0 - k * oy;
  let best = tmax; H.kind = 0;
  const A = dx * dx + dz * dz - k * k * dy * dy, B = 2 * (ox * dx + oz * dz + k * dy * w), Cc = ox * ox + oz * oz - w * w;
  if (Math.abs(A) > 1e-14) {
    const disc = B * B - 4 * A * Cc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc); let t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      for (const t of [t1, t2]) {
        if (t > 1e-7 && t < best) { const y = oy + t * dy; if (y >= 0 && y <= h) { best = t; H.kind = 1; break; } }
      }
    }
  }
  if (Math.abs(dy) > 1e-14) {
    const t = (h - oy) / dy;
    if (t > 1e-7 && t < best) { const x = ox + t * dx, z = oz + t * dz; if (x * x + z * z <= r1 * r1) { best = t; H.kind = 2; } }
  }
  return best;
}
export function hitCup(m, P, o, d, tmax = Infinity) {
  const L = toLocal(P, o, d);
  return hitLocal(L[0], L[1], L[2], L[3], L[4], L[5], m.cup.r0, m.cup.r1, m.cup.h, tmax);
}
export function hitBall(c, o, d) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - RB * RB, disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 1e-7 ? t : Infinity;
}
export function rayAt(cam, x, y) { const d = RT.camDir(cam, x, y); return [d[0], d[1], d[2]]; }
export function pickCup(m, cam, Ps, x, y, near = 6) {
  const d = rayAt(cam, x, y);
  let best = Infinity, id = -1;
  Ps.forEach((P, i) => { const t = hitCup(m, P, cam.eye, d); if (t < best) { best = t; id = i; } });
  if (id >= 0 || near <= 0) return id;
  let bd = near;
  Ps.forEach((P, i) => { const dd = distToPoly(cupPoly(m, cam, P), x, y); if (dd < bd) { bd = dd; id = i; } });
  return id;
}
function distToPoly(poly, x, y) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
  }
  return best;
}
export function visibleFrac(m, cam, Ps, step = 2) {
  return Ps.map((P, i) => {
    const poly = cupPoly(m, cam, P), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    let all = 0, own = 0;
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += step) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += step) {
      const d = rayAt(cam, x + 0.5, y + 0.5);
      if (hitCup(m, P, cam.eye, d) === Infinity) continue;
      all++;
      if (pickCup(m, cam, Ps, x + 0.5, y + 0.5, 0) === i) own++;
    }
    return all ? own / all : 0;
  });
}
export function ballVisible(m, cam, t) {
  const Ps = poses3At(m, t), c = ballCentre(m), q = cam.project(c[0], c[1], c[2]), rp = RB * cam.f / q.z;
  let all = 0, vis = 0;
  for (let y = q.y - rp; y <= q.y + rp; y += 0.75) for (let x = q.x - rp; x <= q.x + rp; x += 0.75) {
    const d = rayAt(cam, x, y), tb = hitBall(c, cam.eye, d);
    if (tb === Infinity) continue;
    all++;
    if (Ps.every((P) => hitCup(m, P, cam.eye, d, tb) === tb)) vis++;
  }
  return all ? vis / all : 0;
}
export function tapPoint(m, cam, Ps, id) {
  const poly = cupPoly(m, cam, Ps[id]), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length, cy = ys.reduce((s, v) => s + v, 0) / ys.length;
  let best = null;
  for (let y = Math.floor(Math.min(...ys)) + 3; y <= Math.max(...ys) - 3; y += 1) for (let x = Math.floor(Math.min(...xs)) + 3; x <= Math.max(...xs) - 3; x += 1) {
    if (pickCup(m, cam, Ps, x, y, 0) !== id) continue;
    if (pickCup(m, cam, Ps, x - 3, y, 0) !== id || pickCup(m, cam, Ps, x + 3, y, 0) !== id || pickCup(m, cam, Ps, x, y - 3, 0) !== id || pickCup(m, cam, Ps, x, y + 3, 0) !== id) continue;
    const dd = (x - cx) ** 2 + (y - cy) ** 2;
    if (!best || dd < best.d) best = { x, y, d: dd };
  }
  return best ? { x: best.x, y: best.y } : null;
}

export function occlusion(m, cam, Ps) {
  const polys = Ps.map((P) => cupPoly(m, cam, P, 16)), d = Ps.map((P) => camDist(cam, cupMid(m, P)));
  return Ps.map((_, i) => {
    const occ = [];
    for (let j = 0; j < Ps.length; j++) if (j !== i && d[j] < d[i]) { const c = clipConvex(polys[i], polys[j]); if (c.length >= 3) occ.push(c); }
    let area = 0;
    for (let mask = 1; mask < 1 << occ.length; mask++) {
      let inter = null, bits = 0;
      for (let b = 0; b < occ.length; b++) if (mask & (1 << b)) { bits++; inter = inter ? clipConvex(inter, occ[b]) : occ[b]; if (inter.length < 3) break; }
      if (inter && inter.length >= 3) area += (bits % 2 ? 1 : -1) * polyArea(inter);
    }
    return Math.max(0, Math.min(1, area / polyArea(polys[i])));
  });
}
export function sampleSeq(m, cam, times) {
  return times.map((t) => { const Ps = poses3At(m, t); return { t, c: Ps.map((P) => projXY(cam, cupMid(m, P))), occ: occlusion(m, cam, Ps), rest: atRest(m, t) }; });
}
const PERMS = { 3: perms(3), 4: perms(4) };
function perms(n) { const out = []; const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], rest.filter((_, j) => j !== i))); }; rec([], Array.from({ length: n }, (_, i) => i)); return out; }
export function readSeq(m, F, { mode = 'nn', visible = true } = {}) {
  const n = m.n, P = PERMS[n];
  const pos = F[0].c.map((p) => p.slice()), lab = Array.from({ length: n }, (_, i) => i), vel = F[0].c.map(() => [0, 0]);
  for (let k = 1; k < F.length; k++) {
    const obs = []; for (let i = 0; i < n; i++) if (!visible || F[k].occ[i] < HIDDEN) obs.push(i);
    const pred = pos.map((p, j) => (mode === 'vel' ? [p[0] + vel[j][0], p[1] + vel[j][1]] : p));
    let best = null, bc = Infinity;
    for (const pr of P) {
      let c = 0;
      for (let i = 0; i < obs.length; i++) { const o = F[k].c[obs[i]], q = pred[pr[i]]; c += (o[0] - q[0]) ** 2 + (o[1] - q[1]) ** 2; }
      if (c < bc - 1e-9) { bc = c; best = pr; }
    }
    const hit = new Set();
    for (let i = 0; i < obs.length; i++) { const j = best[i], o = F[k].c[obs[i]]; vel[j] = [o[0] - pos[j][0], o[1] - pos[j][1]]; pos[j] = o.slice(); lab[j] = obs[i]; hit.add(j); }
    for (let j = 0; j < n; j++) if (!hit.has(j)) pos[j] = pred[j].slice();
  }
  return lab;
}
export function followSeq(m, F, start) {
  let cur = start, b = F[0].c[cur].slice();
  for (let k = 1; k < F.length; k++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < m.n; i++) { if (F[k].occ[i] >= HIDDEN) continue; const d = Math.hypot(F[k].c[i][0] - b[0], F[k].c[i][1] - b[1]); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { cur = best; b = F[k].c[best].slice(); }
  }
  return cur;
}
export function loopTimes(m, dtS, phase = 0) { const ts = []; for (let t = phase; t <= m.T + 0.05; t += dtS) ts.push(t); if (ts[ts.length - 1] < m.T + 0.05) ts.push(m.T + 0.05); return ts; }
export function maxSpeed(m) {
  let prev = rowPoses(m, 0), best = 0;
  for (let t = 0.01; t <= m.Lp; t += 0.01) {
    const cur = rowPoses(m, t);
    if (tau(m, t) > 0.02) for (let i = 0; i < m.n; i++) best = Math.max(best, Math.hypot(cur[i].x - prev[i].x, cur[i].y - prev[i].y) / 0.01);
    prev = cur;
  }
  return best;
}
export function hiddenTraps(m, cam, dtS = m.dt, phase = 0) {
  const out = [], ball = m.ball;
  m.events.forEach((e, ev) => {
    if (!e.ps) return;
    const tm = e.t0 + (e.ps.feint ? (e.t1 - e.t0 - e.ps.tp) / 2 : e.ps.d1) + e.ps.tp / 2;
    const occAt = (t) => occlusion(m, cam, poses3At(m, t))[ball];
    const o = occAt(tm);
    if (o < HIDDEN) return;
    let a = tm, b = tm;
    while (a - 0.01 > e.t0 && occAt(a - 0.01) >= HIDDEN) a -= 0.01;
    while (b + 0.01 < e.t1 && occAt(b + 0.01) >= HIDDEN) b += 0.01;
    const k0 = Math.floor((a - phase) / dtS) - 1, k1 = Math.ceil((b - phase) / dtS) + 2;
    const ts = []; for (let k = k0; k <= k1; k++) ts.push(phase + k * dtS);
    const F = sampleSeq(m, cam, ts);
    out.push({ ev, win: b - a, occ: o, seen: F.some((f) => f.occ[ball] >= HIDDEN), nn: readSeq(m, F, { mode: 'nn' })[ball],
      follow: followSeq(m, F, ball), peek: readSeq(m, F, { mode: 'nn', visible: false })[ball] });
  });
  return out;
}
