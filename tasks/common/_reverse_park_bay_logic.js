export const DEG = Math.PI / 180;
export const NB = 5, BW = 3.0, BD = 5.4, END = 0.8;
export const XE = NB * BW / 2 + END;
export const CAR = { L: 4.4, W: 1.8, RO: 0.85, WB: 2.65 };
export const CO = CAR.L / 2 - CAR.RO;
export const TURN = 30 * DEG, RAD = 4.2;
export const STEP = RAD * TURN;
const NSUB = 20;
const MARGIN = 0.04;
export const TOL = { headDeg: 15, inside: 0.8 };
export const ACTIONS = [];
for (const dir of [1, -1]) for (const steer of [-1, 0, 1]) ACTIONS.push({ op: 'drive', dir, steer });

export const wrap = (a) => { a %= 2 * Math.PI; if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; };
export const lotOf = (m) => ({ zf: BD + m.lot.aw, xe: XE });
export const bayX = (i) => (i - (NB - 1) / 2) * BW;

export function arcPose(p, dir, steer, frac = 1) {
  const sig = dir * STEP * frac;
  if (!steer) return { x: p.x + Math.cos(p.h) * sig, z: p.z + Math.sin(p.h) * sig, h: p.h };
  const h2 = p.h + steer * sig / RAD;
  const cx = p.x - steer * RAD * Math.sin(p.h), cz = p.z + steer * RAD * Math.cos(p.h);
  return { x: cx + steer * RAD * Math.sin(h2), z: cz - steer * RAD * Math.cos(h2), h: h2 };
}
export function footprint(p, L = CAR.L, W = CAR.W, co = CO) {
  const c = Math.cos(p.h), s = Math.sin(p.h);
  return { cx: p.x + c * co, cz: p.z + s * co, c, s, hl: L / 2, hw: W / 2 };
}
function corners(r, grow = 0) {
  const hl = r.hl + grow, hw = r.hw + grow, out = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) out.push([r.cx + r.c * hl * a - r.s * hw * b, r.cz + r.s * hl * a + r.c * hw * b]);
  return out;
}
function obbOverlap(a, b, grow) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const ra = Math.hypot(a.hl, a.hw) + grow, rb = Math.hypot(b.hl, b.hw);
  if (dx * dx + dz * dz > (ra + rb) * (ra + rb)) return false;
  const axes = [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]];
  for (const [ux, uz] of axes) {
    const pa = (a.hl + grow) * Math.abs(a.c * ux + a.s * uz) + (a.hw + grow) * Math.abs(-a.s * ux + a.c * uz);
    const pb = b.hl * Math.abs(b.c * ux + b.s * uz) + b.hw * Math.abs(-b.s * ux + b.c * uz);
    if (Math.abs(dx * ux + dz * uz) > pa + pb) return false;
  }
  return true;
}
const OBST = new WeakMap();
export function obstacles(m) {
  let o = OBST.get(m);
  if (!o) {
    o = m.parked.map((q) => footprint({ x: q.x, z: q.z, h: q.h * DEG }, q.L, q.W, 0));
    OBST.set(m, o);
  }
  return o;
}
export function collides(m, p) {
  const r = footprint(p), { zf, xe } = lotOf(m);
  for (const [x, z] of corners(r, MARGIN)) if (z < 0 || z > zf || x < -xe || x > xe) return true;
  for (const o of obstacles(m)) if (obbOverlap(r, o, MARGIN)) return true;
  return false;
}
export function drive(m, p, dir, steer) {
  let last = p, k = 0;
  for (let i = 1; i <= NSUB; i++) {
    const q = arcPose(p, dir, steer, i / NSUB);
    if (collides(m, q)) break;
    last = q; k = i;
  }
  return { pose: last, frac: k / NSUB };
}

export function bayRect(m) { const x0 = bayX(m.lot.empty); return { x0: x0 - BW / 2, x1: x0 + BW / 2, z0: 0, z1: BD }; }
export function insideFrac(m, p) {
  const r = footprint(p), b = bayRect(m);
  let n = 0, tot = 0;
  for (let i = 0; i < 11; i++) for (let j = 0; j < 5; j++) {
    const a = -1 + (2 * i + 1) / 11, c = -1 + (2 * j + 1) / 5;
    const x = r.cx + r.c * r.hl * a - r.s * r.hw * c, z = r.cz + r.s * r.hl * a + r.c * r.hw * c;
    tot++; if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) n++;
  }
  return n / tot;
}
export const headErrDeg = (p) => Math.abs(wrap(p.h - Math.PI / 2)) / DEG;
export function success(m, p) { return headErrDeg(p) <= TOL.headDeg && insideFrac(m, p) >= TOL.inside; }
export function parkedWell(m, p) { return headErrDeg(p) <= 8 && insideFrac(m, p) >= 0.95; }

const CMAX = Math.hypot(RAD, CO) * TURN + 1e-6;
function lowerBound(m, p) {
  const he = Math.max(0, headErrDeg(p) - TOL.headDeg);
  const nh = Math.ceil(he / 30 - 1e-9);
  const r = footprint(p), b = bayRect(m);
  const dx = Math.max(0, b.x0 - 1.2 - r.cx, r.cx - b.x1 - 1.2), dz = Math.max(0, b.z0 - 1.2 - r.cz, r.cz - b.z1 - 1.2);
  const np = Math.ceil(Math.hypot(dx, dz) / CMAX - 1e-9);
  return Math.max(nh, np);
}
const qkey = (p) => `${Math.round(p.x * 50)},${Math.round(p.z * 50)},${Math.round(wrap(p.h) / DEG * 2)}`;
export function poseOf(m) { return { x: m.start.x, z: m.start.z, h: m.start.h * DEG }; }
export function shortestPlan(m, p, maxD, acts = ACTIONS, goal = success) {
  if (goal(m, p)) return [];
  let front = [{ p, path: [] }];
  const seen = new Set([qkey(p)]);
  for (let d = 0; d < maxD; d++) {
    const next = [];
    for (const nd of front) for (let ai = 0; ai < acts.length; ai++) {
      const a = acts[ai], r = drive(m, nd.p, a.dir, a.steer);
      if (r.frac === 0) continue;
      const k = qkey(r.pose);
      if (seen.has(k)) continue;
      seen.add(k);
      const path = nd.path.concat(ai);
      if (goal(m, r.pose)) return path.map((i) => acts[i]);
      if (d + 1 + lowerBound(m, r.pose) > maxD) continue;
      next.push({ p: r.pose, path });
    }
    front = next;
    if (!front.length) break;
  }
  return null;
}

export function greedyRun(m, p, { maxN = 12, headW = 0, acts = ACTIONS } = {}) {
  const b = bayRect(m), gx = (b.x0 + b.x1) / 2, gz = BD / 2;
  const score = (q) => { const r = footprint(q); return Math.hypot(r.cx - gx, r.cz - gz) + headW * headErrDeg(q) / 30; };
  let cur = p, best = score(p);
  const seq = [];
  for (let i = 0; i < maxN; i++) {
    let pick = null;
    for (const a of acts) {
      const r = drive(m, cur, a.dir, a.steer);
      if (r.frac === 0) continue;
      const s = score(r.pose);
      if (s < best - 1e-6) { best = s; pick = { a, pose: r.pose }; }
    }
    if (!pick) break;
    cur = pick.pose; seq.push(pick.a);
    if (success(m, cur)) break;
  }
  return { ok: success(m, cur), seq, pose: cur };
}
