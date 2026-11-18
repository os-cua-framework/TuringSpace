import * as RT from './_house_headcount_rt.js';
export { RT };

export const NAME = 'false_belief_keys';
export const VIEW = { w: 380, h: 384 };
export const DEG = Math.PI / 180;
export const NPOSE = 12, STEP_DEG = 30;
export const ROOM = { x0: -2.1, x1: 2.1, z0: -1.75, z1: 1.9, h: 2.45 };
export const BOXN = 5, NV = 3;
export const COLORS = [['teal', '#2a9d9a'], ['mustard', '#d9a21b'], ['blue', '#3a66b8'], ['green', '#4aa05a'], ['plum', '#8e4a8e']];
export const COLORS_X = [...COLORS, ['orange', '#e0702a'], ['pink', '#d95a8a']];

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const r2 = (v) => Math.round(v * 100) / 100;
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

export const obb = (cx, cz, hx, hz, fx, fz, y0, y1) => ({ cx, cz, hx, hz, fx, fz, y0, y1 });
function toLocal(o, x, z) { const px = x - o.cx, pz = z - o.cz; return [px * o.fz - pz * o.fx, px * o.fx + pz * o.fz]; }
export function segHitsObb(o, a, b, g = 0) {
  const A = toLocal(o, a[0], a[2]), B = toLocal(o, b[0], b[2]);
  const lo = [-o.hx - g, o.y0 - g, -o.hz - g], hi = [o.hx + g, o.y1 + g, o.hz + g];
  const p = [A[0], a[1], A[1]], d = [B[0] - A[0], b[1] - a[1], B[1] - A[1]];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (p[i] < lo[i] || p[i] > hi[i]) return false; continue; }
    let u0 = (lo[i] - p[i]) / d[i], u1 = (hi[i] - p[i]) / d[i];
    if (u0 > u1) { const q = u0; u0 = u1; u1 = q; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}
export function seg2HitsObb(o, a, b, g) {
  return segHitsObb({ ...o, y0: -1, y1: 1 }, [a[0], 0, a[1]], [b[0], 0, b[1]], g);
}
export function inObb2(o, x, z, g = 0) { const [lx, lz] = toLocal(o, x, z); return Math.abs(lx) <= o.hx + g && Math.abs(lz) <= o.hz + g; }

const mx = (flip, x) => flip * x;
const mf = (flip, f) => [flip * f[0], f[1]];

export function planPath(obst, from, to, r = 0.27) {
  const C = 0.1, nx = Math.round((ROOM.x1 - ROOM.x0) / C), nz = Math.round((ROOM.z1 - ROOM.z0) / C), wall = 0.22;
  const cellXZ = (i, j) => [ROOM.x0 + (i + 0.5) * C, ROOM.z0 + (j + 0.5) * C];
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z] = cellXZ(i, j);
    let b = x < ROOM.x0 + wall || x > ROOM.x1 - wall || z < ROOM.z0 + wall || z > ROOM.z1 - wall;
    if (!b) for (const o of obst) if (inObb2(o, x, z, r)) { b = true; break; }
    blocked[j * nx + i] = b ? 1 : 0;
  }
  const idx = (p) => [Math.max(0, Math.min(nx - 1, Math.floor((p[0] - ROOM.x0) / C))), Math.max(0, Math.min(nz - 1, Math.floor((p[1] - ROOM.z0) / C)))];
  const nearestFree = (p) => {
    const [i0, j0] = idx(p);
    let best = null, bd = Infinity;
    for (let j = Math.max(0, j0 - 6); j <= Math.min(nz - 1, j0 + 6); j++) for (let i = Math.max(0, i0 - 6); i <= Math.min(nx - 1, i0 + 6); i++) {
      if (blocked[j * nx + i]) continue;
      const [x, z] = cellXZ(i, j), d = Math.hypot(x - p[0], z - p[1]);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    return best;
  };
  const s = nearestFree(from), g = nearestFree(to);
  if (!s || !g) return null;
  const key = (i, j) => j * nx + i, N = nx * nz;
  const gs = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const h = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  const open = [[h(s[0], s[1]), s[0], s[1]]];
  gs[key(s[0], s[1])] = 0;
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, i, j] = open.splice(bi, 1)[0];
    const k = key(i, j); if (closed[k]) continue; closed[k] = 1;
    if (i === g[0] && j === g[1]) break;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || blocked[key(ii, jj)]) continue;
      if (di && dj && (blocked[key(i + di, j)] || blocked[key(i, j + dj)])) continue;
      const nk = key(ii, jj), ng = gs[k] + (di && dj ? Math.SQRT2 : 1);
      if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; open.push([ng + h(ii, jj), ii, jj]); }
    }
  }
  if (!Number.isFinite(gs[key(g[0], g[1])])) return null;
  let cells = [], k = key(g[0], g[1]);
  while (k >= 0) { cells.push([k % nx, Math.floor(k / nx)]); k = came[k]; }
  cells.reverse();
  const raw = [from.slice(), ...cells.map(([i, j]) => cellXZ(i, j)), to.slice()];
  const clear = (a, b) => {
    for (const o of obst) if (seg2HitsObb(o, a, b, r - 0.02) && !(inObb2(o, a[0], a[1], r) || inObb2(o, b[0], b[1], r))) return false;
    const mx_ = (a[0] + b[0]) / 2, mz_ = (a[1] + b[1]) / 2;
    return ![a, b, [mx_, mz_]].some((p) => p[0] < ROOM.x0 + wall - 0.05 || p[0] > ROOM.x1 - wall + 0.05 || p[1] < ROOM.z0 + wall - 0.05 || p[1] > ROOM.z1 - wall + 0.05);
  };
  const out = [raw[0]];
  let ci = 0;
  while (ci < raw.length - 1) {
    let nj = ci + 1;
    for (let q = raw.length - 1; q > ci + 1; q--) if (clear(raw[ci], raw[q])) { nj = q; break; }
    out.push(raw[nj]); ci = nj;
  }
  return out.map((p) => [r3(p[0]), r3(p[1])]);
}
export const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
export function pathAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) { const u = l > 0 ? clamp01(s / l) : 1; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    s -= l;
  }
  return pts[pts.length - 1].slice();
}
function headingAt(pts, s, L) {
  const a = pathAt(pts, Math.max(0, s - 0.3)), b = pathAt(pts, Math.min(L, s + 0.3));
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]);
  return l > 1e-6 ? [d[0] / l, d[1] / l] : null;
}
export const WALK_EASE = 0.35;
export function walkS(seg, t) {
  const T = seg.t1 - seg.t0, L = seg.len, u = clamp01((t - seg.t0) / T), e = Math.min(0.45, WALK_EASE / T);
  const vmax = 1 / (1 - e);
  let s;
  if (u < e) s = 0.5 * vmax * u * u / e;
  else if (u > 1 - e) { const w = 1 - u; s = 1 - 0.5 * vmax * w * w / e; }
  else s = 0.5 * vmax * e + vmax * (u - e);
  return clamp01(s) * L;
}
export const walkTime = (len, v) => len / v + WALK_EASE;
const turnTo = (a, b, u) => { const a0 = Math.atan2(a[1], a[0]); let d = Math.atan2(b[1], b[0]) - a0; d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; const g = a0 + d * u; return [Math.cos(g), Math.sin(g)]; };

const ARM_U = 0.285, ARM_F = 0.27;
function ik2(a, b, l1, l2, pole) {
  let d = sub3(b, a), L = len3(d);
  const maxL = (l1 + l2) * 0.999;
  if (L > maxL) { d = d.map((q) => q * maxL / L); b = add3(a, d); L = maxL; }
  const u = d.map((q) => q / L), x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), hgt = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub3(pole, u.map((q) => q * dot3(pole, u)));
  if (len3(p) < 1e-6) p = [0, -1, 0];
  p = norm3(p);
  return { mid: add3(add3(a, u, x), p, hgt), end: b };
}
export const SEAT_PELVIS = 0.58;
export function figureJoints(P) {
  const k = P.k, f = [P.f[0], 0, P.f[1]], r = [-P.f[1], 0, P.f[0]], up = [0, 1, 0];
  const w = P.walking || 0, ph = P.gait || 0, st = smooth(P.stand ?? 1);
  const bob = 0.012 * k * w * Math.cos(2 * ph);
  const pelvis = [P.x, lerp(SEAT_PELVIS * k, 0.97 * k + bob, st), P.z];
  const lean = P.lean || 0, tor = norm3(add3([0, Math.cos(lean), 0], f, Math.sin(lean)));
  const legs = [-1, 1].map((s) => {
    const sw = s < 0 ? Math.sin(ph) : -Math.sin(ph), lift = s < 0 ? Math.max(0, Math.cos(ph)) : Math.max(0, -Math.cos(ph));
    const hip = add3(pelvis, r, s * 0.088 * k);
    const standA = [P.x + r[0] * s * 0.1 * k + f[0] * 0.24 * k * w * sw, 0.085 * k + 0.07 * k * w * lift, P.z + r[2] * s * 0.1 * k + f[2] * 0.24 * k * w * sw];
    const seatA = [P.x + r[0] * s * 0.1 * k + f[0] * 0.5 * k, 0.085 * k, P.z + r[2] * s * 0.1 * k + f[2] * 0.5 * k];
    const ankle = [lerp(seatA[0], standA[0], st), lerp(seatA[1], standA[1], st), lerp(seatA[2], standA[2], st)];
    const knee = ik2(hip, ankle, 0.43 * k, 0.43 * k, add3(f, up, 0.05)).mid;
    return { hip, knee, ankle };
  });
  const T = (d, side = 0) => add3(add3(pelvis, tor, d * k), r, side * k);
  const arms = [-1, 1].map((s, i) => {
    const sh = T(0.44, s * 0.185);
    let hand = P.hand?.[i] || null;
    if (!hand) {
      const sw = (s < 0 ? -1 : 1) * Math.sin(ph) * 0.14 * k * w;
      hand = add3(add3(add3(sh, [0, -1, 0], 0.5 * k), f, sw + 0.03 * k), r, s * 0.03 * k);
    }
    const pole = add3(add3(r.map((q) => q * s * 0.45), [0, -1, 0], 0.7), f, -0.3);
    const j = ik2(sh, hand, ARM_U * k, ARM_F * k, pole);
    return { sh, el: j.mid, hand: j.end };
  });
  const neck0 = T(0.49), neck1 = T(0.585);
  const yaw = P.yaw || 0, pitch = P.pitch || 0;
  const dir = add3(f.map((q) => q * Math.cos(yaw)), r, Math.sin(yaw));
  const headF = add3(dir.map((q) => q * Math.cos(pitch)), up, -Math.sin(pitch));
  const headU = add3(up.map((q) => q * Math.cos(pitch)), dir, Math.sin(pitch));
  const hc = add3(add3(neck1, headU, 0.068 * k), headF, 0.012 * k);
  const eye = add3(add3(hc, headF, 0.07 * k), headU, 0.02 * k);
  return { k, f, r, up, tor, pelvis, legs, arms, neck0, neck1, hc, headF, headU, eye };
}

export const LID_T = 0.024, LID_OPEN = 105 * DEG;
export function boxGeom(b) {
  const f = [b.f[0], 0, b.f[1]], r = [b.f[1], 0, -b.f[0]];
  const top = b.y + b.h;
  return { f, r, c: [b.x, b.y + b.h / 2, b.z], top, hinge: [b.x - f[0] * b.d / 2, top, b.z - f[2] * b.d / 2], inside: [b.x, b.y + b.h * 0.55, b.z] };
}
export function lidFrame(b, a) {
  const g = boxGeom(b), c = Math.cos(a), s = Math.sin(a);
  const along = [g.f[0] * c, s, g.f[2] * c];
  const nrm = [-g.f[0] * s, c, -g.f[2] * s];
  const centre = add3(add3(g.hinge, along, (b.d + 0.02) / 2), nrm, LID_T / 2);
  return { centre, ax: [g.r, nrm, along], half: [b.w / 2 + 0.012, LID_T / 2, (b.d + 0.02) / 2] };
}

export const ACT_GRASP = 0.46;
const lidAngleAt = (u) => LID_OPEN * (smooth(u / 0.2) - smooth((u - 0.74) / 0.22));
const reachAt = (u) => smooth((u - 0.16) / 0.26) - smooth((u - 0.52) / 0.24);

function segIndex(segs, t) {
  let i = 0;
  while (i < segs.length - 1 && t > segs[i].t1) i++;
  return i;
}
export function bobAt(m, t) {
  const segs = m.bob.segs, i = segIndex(segs, t), seg = segs[i], prev = segs[i - 1];
  const k = m.bob.k, tt = Math.max(segs[0].t0, Math.min(t, segs[segs.length - 1].t1));
  const prevF = prev ? (prev.fEnd || prev.f) : seg.f0 || seg.f;
  let P, act = null;
  if (seg.k === 'walk') {
    const s = walkS(seg, tt), q = pathAt(seg.pts, s);
    let f = headingAt(seg.pts, s, seg.len) || seg.fEnd || [0, 1];
    if (prev) f = turnTo(prevF, f, smooth((tt - seg.t0) / 0.4));
    const ramp = clamp01(Math.min(s / 0.3, (seg.len - s) / 0.3 + 0.1));
    P = { x: q[0], z: q[1], f, k, stand: 1, walking: ramp, gait: 2 * Math.PI * s / (1.32 * k) + (m.bob.ph || 0), lean: 0, hand: [null, null] };
  } else {
    const u = clamp01((tt - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
    const f = prev ? turnTo(prevF, seg.f, smooth((tt - seg.t0) / 0.45)) : seg.f;
    P = { x: seg.at[0], z: seg.at[1], f, k, stand: 1, walking: 0, gait: 0, lean: 0, hand: [null, null] };
    if (seg.k === 'act') act = { seg, u, box: m.boxes[seg.box] };
  }
  const J0 = figureJoints(P);
  const carrying = keysCarried(m, tt);
  const carryPt = add3(add3(add3(J0.pelvis, J0.tor, 0.4 * k), J0.f, 0.3 * k), J0.r, 0.05 * k), restPt = J0.arms[1].hand;
  let lidA = new Array(m.boxes.length).fill(0), keys = null, handR = carrying ? carryPt : null;
  if (act) {
    const b = act.box, g = boxGeom(b), u = act.u, rc = reachAt(u), into = add3(g.inside, g.f, 0.02);
    lidA[seg.box] = lidAngleAt(u);
    const startPt = seg.mode === 'drop' ? carryPt : restPt, endPt = seg.mode === 'drop' ? restPt : carryPt;
    const home = u < ACT_GRASP ? startPt : endPt;
    handR = [lerp(home[0], into[0], rc), lerp(home[1], into[1], rc), lerp(home[2], into[2], rc)];
    P.lean = 0.3 * clamp01(Math.max(rc, smooth(u / 0.2) * 0.6) * (1 - smooth((u - 0.8) / 0.2) * 0.6));
    if (seg.mode === 'drop') keys = u < ACT_GRASP ? { where: 'hand' } : { where: 'box', box: seg.box };
    else keys = u < ACT_GRASP ? { where: 'box', box: seg.box } : { where: 'hand' };
  } else {
    keys = carrying ? { where: 'hand' } : { where: 'box', box: lastBox(m, tt) };
  }
  P.hand = [null, handR];
  return { P, J: figureJoints(P), keys, lids: lidA, act };
}
function actsOf(m) {
  if (!m._acts) Object.defineProperty(m, '_acts', { value: m.bob.segs.filter((s) => s.k === 'act'), enumerable: false });
  return m._acts;
}
function keysCarried(m, t) {
  const acts = actsOf(m);
  let c = true;
  for (const a of acts) {
    const tg = a.t0 + ACT_GRASP * (a.t1 - a.t0);
    if (t >= a.t1) c = a.mode === 'lift';
    else if (t > a.t0) { c = a.mode === 'drop' ? t < tg : t >= tg; break; }
    else break;
  }
  return c;
}
function lastBox(m, t) {
  let b = -1;
  for (const a of actsOf(m)) if (t >= a.t0 + ACT_GRASP * (a.t1 - a.t0) && a.mode === 'drop') b = a.box;
  return b;
}
export function keysBoxAt(m, t) { return lastBox(m, t); }

export const PITCH_DOWN = 54 * DEG;
export function annaDown(m, t) {
  let d = 0;
  for (const [a, b] of m.anna.down) d = Math.max(d, clamp01(smooth((t - a) / 0.5) - smooth((t - b) / 0.5)));
  return d;
}
export function annaBase(m) {
  const A = m.anna;
  return { x: A.x, z: A.z, f: A.f, k: A.k, stand: 0, walking: 0, gait: 0 };
}
export function annaEyeUp(m) {
  const J = figureJoints({ ...annaBase(m), lean: 0.05, yaw: 0, pitch: 0, hand: [null, null] });
  return J.eye;
}
function yawTo(m, J0, p) {
  const f = J0.f, r = J0.r, d = [p[0] - J0.eye[0], p[2] - J0.eye[2]];
  const y = Math.atan2(d[0] * r[0] + d[1] * r[2], d[0] * f[0] + d[1] * f[2]);
  return Math.max(-75 * DEG, Math.min(75 * DEG, y));
}
export function annaGazePoint(m, t) {
  const b = bobAt(m, t), head = [b.J.eye[0], b.J.eye[1], b.J.eye[2]], eye = annaEyeUp(m);
  const chest = [b.P.x, 1.15 * m.bob.k, b.P.z];
  const hidden = m.occ.some((o) => segHitsObb(o, eye, chest, 0)) && m.occ.some((o) => segHitsObb(o, eye, head, 0));
  if (!hidden) return head;
  const s = m.shelf;
  return [s.x, 1.25, s.z];
}
export function annaAt(m, t, epi = null) {
  const base = annaBase(m), d = annaDown(m, t);
  const J0 = figureJoints({ ...base, lean: 0.05 });
  let yawUp = 0;
  const ts = [t, t - 0.15, t - 0.3];
  for (const q of ts) yawUp += yawTo(m, J0, annaGazePoint(m, Math.max(0, q))) / ts.length;
  const pitchUp = -2 * DEG;
  const yaw = lerp(yawUp, 0, smooth(d)), pitch = lerp(pitchUp, PITCH_DOWN, smooth(d));
  const lean = lerp(0.03, 0.32, smooth(d));
  const Jl = figureJoints({ ...base, lean });
  const lap = add3(add3(Jl.pelvis, Jl.f, 0.32 * Jl.k), [0, 0.17 * Jl.k, 0]);
  const phone = add3(add3(add3(Jl.pelvis, Jl.tor, 0.34 * Jl.k), Jl.f, 0.3 * Jl.k), [0, 0, 0]);
  const c = [lerp(lap[0], phone[0], smooth(d)), lerp(lap[1], phone[1], smooth(d)), lerp(lap[2], phone[2], smooth(d))];
  const P = { ...base, lean, yaw, pitch, hand: [add3(c, Jl.r, -0.05 * Jl.k), add3(c, Jl.r, 0.05 * Jl.k)] };
  return { P, J: figureJoints(P), d, phoneAt: c };
}

export const WIN = 0.3;
export function gazeDuring(m, t0, t1) {
  let mn = 1, mxx = 0;
  for (let t = t0; t <= t1 + 1e-9; t += 0.1) { const d = annaDown(m, t); mn = Math.min(mn, d); mxx = Math.max(mxx, d); }
  return { min: mn, max: mxx };
}
export function losClear(m, p, g = 0, eyeP = null) {
  const e = eyeP || annaEyeUp(m);
  return !m.occ.some((o) => segHitsObb(o, e, p, g));
}
export const actPoints = (m, seg) => {
  const b = m.boxes[seg.box], gm = boxGeom(b);
  return { lid: [gm.c[0], b.y + b.h + 0.05, gm.c[2]], bob: [seg.at[0], 1.15 * m.bob.k, seg.at[1]], head: [seg.at[0], 1.7 * m.bob.k, seg.at[1]] };
};
export function seenAct(m, seg, opt = {}) {
  const g = gazeDuring(m, seg.t0 - WIN, seg.t1 + WIN), P = actPoints(m, seg);
  const gazeOK = opt.ignoreGaze ? true : g.max < 0.25;
  const losOK = opt.ignoreLos ? true : (losClear(m, P.lid, 0) && losClear(m, P.bob, 0) && losClear(m, P.head, 0));
  return gazeOK && losOK;
}
export function drops(m, opt = {}) {
  return actsOf(m).filter((a) => a.mode === 'drop').map((a) => ({ seg: a, box: a.box, t: a.t0 + ACT_GRASP * (a.t1 - a.t0), seen: seenAct(m, a, opt) }));
}
export function belief(m, opt = {}) {
  let b = -1;
  for (const d of drops(m, opt)) if (d.seen) b = d.box;
  return b;
}
export const READERS = {
  truth: (m) => belief(m),
  first: (m) => m.seq[0],
  final: (m) => m.seq[m.seq.length - 1],
  camera: (m) => m.seq[m.seq.length - 1],
  ignorePhone: (m) => belief(m, { ignoreGaze: true }),
  ignoreBookcase: (m) => belief(m, { ignoreLos: true }),
  lastSeatBox: (m) => { let b = m.seq[0]; for (const p of m.seq) if (p < (m.nv ?? NV)) b = p; return b; },
  secondBox: (m) => m.seq[1],
};

export const EPI = { look: 0.9, stand: 1.3, act: 1.9, hold: 1.0, speed: 1.15 };
export function epiTimes(m) {
  const e = m.epi, walk = e.len > 0.05 ? walkTime(e.len, EPI.speed) : 0;
  const t1 = EPI.look, t2 = t1 + EPI.stand, t3 = t2 + walk, t4 = t3 + EPI.act, t5 = t4 + EPI.hold;
  return { look: t1, stand: t2, walk: t3, act: t4, end: t5, walkT: walk };
}
export function annaEpi(m, u, found) {
  const e = m.epi, T = epiTimes(m), base = annaBase(m), b = m.boxes[m.answer], gm = boxGeom(b);
  const seat = [base.x, base.z], stand = e.pts[0], fin = e.pts[e.pts.length - 1];
  let P, lids = new Array(m.boxes.length).fill(0), keys = null;
  const headTo = (J0, p) => ({ yaw: Math.max(-80 * DEG, Math.min(80 * DEG, yawTo(m, J0, p))) });
  if (u < T.look) {
    const a = smooth(u / 0.6), d = annaDown(m, 1e9) * 0, Jl = figureJoints({ ...base, lean: 0.05 });
    const yaw = lerp(0, headTo(Jl, [b.x, 1.0, b.z]).yaw, a);
    P = { ...base, lean: lerp(0.2, 0.05, a), yaw, pitch: lerp(0.5, -0.02, a), hand: [null, null] };
  } else if (u < T.stand) {
    const s = (u - T.look) / EPI.stand;
    const x = lerp(seat[0], stand[0], smooth(s)), z = lerp(seat[1], stand[1], smooth(s));
    const f = turnTo(base.f, e.f0, smooth(s));
    const J0 = figureJoints({ x, z, f, k: base.k, stand: 1 });
    P = { x, z, f, k: base.k, stand: s, walking: 0, gait: 0, lean: 0.35 * Math.sin(Math.PI * Math.min(1, s * 1.1)) * (1 - s * 0.3), hand: [null, null], ...headTo(J0, [b.x, 1.0, b.z]), pitch: 0.05 };
  } else if (u < T.walk) {
    const seg = { t0: 0, t1: T.walkT, len: e.len }, s = walkS(seg, u - T.stand), q = pathAt(e.pts, s);
    const f = headingAt(e.pts, s, e.len) || e.f0, ramp = clamp01(Math.min(s / 0.3, (e.len - s) / 0.3 + 0.1));
    const J0 = figureJoints({ x: q[0], z: q[1], f, k: base.k, stand: 1 });
    P = { x: q[0], z: q[1], f: turnTo(e.f0, f, smooth((u - T.stand) / 0.4)), k: base.k, stand: 1, walking: ramp, gait: 2 * Math.PI * s / (1.32 * base.k), lean: 0, hand: [null, null], ...headTo(J0, [b.x, 1.0, b.z]), pitch: 0.08 };
  } else {
    const v = clamp01((u - T.walk) / EPI.act), a = lidAngleAt(Math.min(1, v * 0.9)), rc = reachAt(Math.min(1, v * 1.15)) ;
    const f = turnTo(e.f0, e.f1, smooth((u - T.walk) / 0.5));
    const J0 = figureJoints({ x: fin[0], z: fin[1], f, k: base.k, stand: 1 });
    const chest = add3(add3(J0.pelvis, J0.tor, 0.45 * base.k), J0.f, 0.28 * base.k);
    lids[m.answer] = u >= T.walk + 0.1 * EPI.act ? (v < 0.97 ? a : a) : 0;
    const into = add3(gm.inside, gm.f, 0.02);
    let hR, hL = null, pitch = 0.45 * smooth(v / 0.35), yawH = 0;
    if (found) {
      const raise = add3(add3(J0.pelvis, J0.tor, 0.6 * base.k), J0.f, 0.36 * base.k);
      const w1 = smooth((v - 0.5) / 0.3);
      hR = rc > 0.001 && v < 0.5 ? [lerp(chest[0], into[0], rc), lerp(chest[1], into[1], rc), lerp(chest[2], into[2], rc)] : [lerp(into[0], raise[0], w1), lerp(into[1], raise[1], w1), lerp(into[2], raise[2], w1)];
      if (v < 0.12) hR = chest;
      keys = v < 0.4 ? { where: 'box', box: m.answer } : { where: 'hand', P: { hand: hR } };
      pitch = lerp(pitch, 0.05, w1);
    } else {
      const sp = smooth((v - 0.62) / 0.25);
      hR = rc > 0.001 ? [lerp(chest[0], into[0], rc), lerp(chest[1], into[1], rc), lerp(chest[2], into[2], rc)] : add3(chest, J0.r, 0.05 * base.k);
      if (sp > 0) { hR = add3(add3(add3(J0.pelvis, J0.tor, 0.5 * base.k), J0.r, lerp(0.15, 0.55, sp) * base.k), J0.f, 0.12 * base.k); hL = add3(add3(add3(J0.pelvis, J0.tor, 0.5 * base.k), J0.r, -lerp(0.15, 0.55, sp) * base.k), J0.f, 0.12 * base.k); }
      yawH = sp * 0.5 * Math.sin((v - 0.62) * 14);
      pitch = lerp(pitch, 0.0, sp);
    }
    P = { x: fin[0], z: fin[1], f, k: base.k, stand: 1, walking: 0, gait: 0, lean: 0.28 * Math.max(rc, smooth(v / 0.3) * 0.5) * (1 - smooth((v - 0.6) / 0.3)), hand: [hL, hR], yaw: yawH, pitch };
  }
  return { P, J: figureJoints(P), lids, keys };
}

export function camParams(m, k) {
  const C = m.cam;
  return { az: C.az0 + k * STEP_DEG, el: C.el, dist: C.dist, fov: C.fov, tx: C.target[0], ty: C.target[1], tz: C.target[2] };
}
const CAMS = new WeakMap();
export function resetCams(m) { CAMS.delete(m); }
export function camOf(m, k) {
  let c = CAMS.get(m); if (!c) { c = new Map(); CAMS.set(m, c); }
  const kk = ((k % NPOSE) + NPOSE) % NPOSE;
  if (!c.has(kk)) c.set(kk, RT.orbitCam(camParams(m, kk), VIEW.w, VIEW.h));
  return c.get(kk);
}
export function project(m, k, p) { const q = camOf(m, k).project(p[0], p[1], p[2]); return [q.x, q.y, q.z]; }
export function boxScreen(m, k, i) {
  const b = m.boxes[i], g = boxGeom(b), pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [b.y, b.y + b.h + 0.04]) {
    pts.push([b.x + g.r[0] * sx * b.w / 2 + g.f[0] * sz * b.d / 2, y, b.z + g.r[2] * sx * b.w / 2 + g.f[2] * sz * b.d / 2]);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = project(m, k, p); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const c = project(m, k, [b.x, b.y + b.h, b.z]);
  return { box: [x0, y0, x1, y1], top: [c[0], c[1]], w: x1 - x0, h: y1 - y0 };
}
