import { makeCam, hull, insideMargin } from './_f16_scene_kit.js';

export const G = 2.0, VT = 1.15, E = 0.5, RB = 0.09, RP = 0.055, H = 0.004, DT = 0.3, STEP = 0.4, CATCH = 0.25, YR = 0.32, W2 = 2.0, XB_MAX = 1.7, Y_TOP = 3.2;
export const BAFFLE = { x0: -1.3, x1: 1.3, y0: 1.56, y1: 2.44, z0: -0.34, z1: -0.22 };
export const ROWS = [2.85, 2.51, 2.17, 1.83, 1.49, 1.15];
export const VIEW = { w: 640, h: 420 };
export const camOf = (look) => makeCam({ az: look?.az ?? -24, el: look?.el ?? 10, dist: 5.8, tgt: [0, 1.5, 0], fov: 40, W: VIEW.w, H: VIEW.h, cy: 6 });
const r3 = (v) => Math.round(v * 1000) / 1000;

export function run(pegs, s, rec) {
  let { x, y, vx, vy, t } = s, nextK = Math.floor(t / DT + 1e-9) + 1;
  if (rec) rec.push({ x, y, vx, vy });
  for (let it = 0; it < 4000; it++) {
    vy = Math.max(-VT, vy - G * H); x += vx * H; y += vy * H; t += H;
    for (let i = 0; i < pegs.length; i++) {
      const p = pegs[i], dx = x - p.x, dy = y - p.y;
      if (dx > 0.14 || dx < -0.14 || dy > 0.14 || dy < -0.14) continue;
      const d = Math.hypot(dx, dy), rr = RB + RP;
      if (d >= rr) continue;
      const nx = dx / (d || 1e-9), ny = dy / (d || 1e-9); x = p.x + nx * rr; y = p.y + ny * rr;
      const vn = vx * nx + vy * ny; if (vn < 0) { vx -= (1 + E) * vn * nx; vy -= (1 + E) * vn * ny; }
    }
    if (x > W2 - RB) { x = W2 - RB; vx = -Math.abs(vx) * E; } else if (x < -W2 + RB) { x = -W2 + RB; vx = Math.abs(vx) * E; }
    if (y <= YR) {
      if (rec) rec.push({ x, y: YR, vx, vy, land: true });
      return { x, t, ok: true };
    }
    if (rec && t >= nextK * DT - 1e-9) { rec.push({ x, y, vx, vy }); nextK++; }
  }
  return { x, t, ok: false };
}
export const trajOf = (m) => m.traj;
export const basketAfter = (m, seq) => {
  const out = [m.xb0]; let x = m.xb0;
  for (let k = 0; k < m.n; k++) { x = Math.max(-XB_MAX, Math.min(XB_MAX, x + STEP * (seq[k] ?? 0))); out.push(x); }
  return out;
};
export const caught = (m, seq) => Math.abs(basketAfter(m, seq)[m.n] - m.traj[m.n].x) <= CATCH;

const HULLS = new WeakMap();
function hullOf(m) {
  let h = HULLS.get(m); if (h) return h;
  const cam = camOf(m.look), B = BAFFLE, pts = [];
  for (const x of [B.x0, B.x1]) for (const y of [B.y0, B.y1]) for (const z of [B.z0, B.z1]) pts.push(cam.project(x, y, z));
  h = { cam, H: hull(pts) }; HULLS.set(m, h); return h;
}
export function ballHidden(m, k) {
  const { cam, H: hh } = hullOf(m), b = m.traj[k], q = cam.project(b.x, b.y, -0.06);
  return insideMargin(hh, q.x, q.y) >= RB * q.s + 1;
}
export function pegHidden(m, p) { const { cam, H: hh } = hullOf(m), q = cam.project(p.x, p.y, -0.04); return insideMargin(hh, q.x, q.y) >= RP * q.s + 1; }
export const visiblePegs = (m) => m.pegs.filter((p) => !pegHidden(m, p));
export const latticePegs = (m) => m.pegs.filter((p) => !pegHidden(m, p)).concat(m.lattice.filter((p) => pegHidden(m, { x: p.x, y: p.y })));

const dirTo = (xb, target) => (target - xb > STEP / 2 ? 1 : target - xb < -STEP / 2 ? -1 : 0);
export function openLoopSeq(m, pegs) {
  const s0 = m.traj[0], A = run(pegs, { x: s0.x, y: s0.y, vx: s0.vx, vy: s0.vy, t: 0 }).x, seq = []; let x = m.xb0;
  for (let k = 0; k < m.n; k++) { const a = dirTo(x, A); seq.push(a); x = Math.max(-XB_MAX, Math.min(XB_MAX, x + STEP * a)); }
  return { seq, A };
}
export function rushSeq(m) { const s = m.xb0 < 0 ? 1 : -1; return new Array(m.n).fill(s); }
export function closedLoopSeq(m) {
  const pegs = visiblePegs(m), seq = []; let x = m.xb0, target = null;
  for (let k = 0; k < m.n; k++) {
    if (!ballHidden(m, k)) { const b = m.traj[k]; target = run(pegs, { x: b.x, y: b.y, vx: b.vx, vy: b.vy, t: 0 }).x; }
    const a = dirTo(x, target ?? x); seq.push(a); x = Math.max(-XB_MAX, Math.min(XB_MAX, x + STEP * a));
  }
  return seq;
}
export function randomChance(m) {
  let P = new Map([[r3(m.xb0), 1]]);
  for (let k = 0; k < m.n; k++) {
    const Q = new Map();
    for (const [x, p] of P) for (const a of [-1, 0, 1]) { const y = r3(Math.max(-XB_MAX, Math.min(XB_MAX, x + STEP * a))); Q.set(y, (Q.get(y) || 0) + p / 3); }
    P = Q;
  }
  let c = 0; for (const [x, p] of P) if (Math.abs(x - m.traj[m.n].x) <= CATCH) c += p;
  return c;
}

export const GATE = { n: [10, 16], dist: 1.6, landMax: 1.55, landMin: 0.2, miss: 0.3, hide: [2, 5], hideFrom: 3, afterExit: 3, randomMax: 0.012, hiddenPegs: 3 };
export function tryBuild(r) {
  const look = { az: r3(r.uniform(-28, -18)), el: r3(r.uniform(8, 13)), wood: r.int(0, 2), ballc: r.int(0, 2), basket: r.int(0, 2), seed: Math.floor(r.raw() * 1e9) };
  const pegs = [], lattice = [];
  ROWS.forEach((y, i) => {
    const off = i % 2 ? 0.25 : 0;
    for (let x = -1.75 + off; x <= 1.76; x += 0.5) {
      lattice.push({ x: r3(x), y, row: i });
      if (r.raw() < (i === 2 || i === 3 ? 0 : 0.1)) continue;
      pegs.push({ x: r3(x + r.uniform(-0.07, 0.07)), y: r3(y + r.uniform(-0.04, 0.04)), row: i });
    }
  });
  const row0 = pegs.filter((p) => p.row === 0 && Math.abs(p.x) < 1.0);
  if (!row0.length) return null;
  for (let t = 0; t < 24; t++) {
    const pk = r.pick(row0), x0 = r3(pk.x + r.sign() * r.uniform(0.03, 0.1)), rec = [];
    const res = run(pegs, { x: x0, y: Y_TOP, vx: 0, vy: 0, t: 0 }, rec);
    if (!res.ok) continue;
    const n = Math.ceil(res.t / DT - 1e-9), L = res.x;
    if (rec.length !== n + 1 || n < GATE.n[0] || n > GATE.n[1] || Math.abs(L) > GATE.landMax || Math.abs(L) < GATE.landMin) continue;
    const m = { task: 'f16_catch_ball', n, dt: DT, pegs, lattice, look, x0, xb0: r3(-Math.sign(L) * r.uniform(1.35, 1.65)), traj: rec.map((q) => ({ x: r3(q.x), y: r3(q.y), vx: r3(q.vx), vy: r3(q.vy) })), plan: null };
    m.plan = closedLoopSeq(m);
    if (contract(m).ok) return m;
  }
  return null;
}
export function contract(m) {
  const bad = (why, x) => ({ ok: false, why, x });
  if (!m || m.task !== 'f16_catch_ball' || !m.traj || m.traj.length !== m.n + 1 || !m.plan || m.plan.length !== m.n) return bad('shape');
  const L = m.traj[m.n].x, n = m.n;
  if (n < GATE.n[0] || n > GATE.n[1]) return bad('n', n);
  if (Math.abs(L - m.xb0) < GATE.dist || Math.abs(L - m.xb0) > (n - 3) * STEP) return bad('dist', Math.abs(L - m.xb0));
  const hid = m.traj.map((_, k) => ballHidden(m, k)), h0 = hid.indexOf(true), h1 = hid.lastIndexOf(true), cnt = hid.filter(Boolean).length;
  if (h0 < GATE.hideFrom || cnt < GATE.hide[0] || cnt > GATE.hide[1] || h1 - h0 + 1 !== cnt || n - (h1 + 1) < GATE.afterExit) return bad('hide', [h0, h1, cnt]);
  if (m.pegs.filter((p) => pegHidden(m, p)).length < GATE.hiddenPegs) return bad('hidden-pegs');
  if (m.pegs.some((p) => !pegHidden(m, p) && p.row >= 2 && p.row <= 3 && Math.abs(p.x) < 1.0)) return bad('peg-half');
  if (!m.traj.slice(0, h0).some((s, k) => k > 0 && Math.abs(s.vx) > 0.05)) return bad('no-bounce');
  const ol = [['open-empty', openLoopSeq(m, visiblePegs(m))], ['open-lattice', openLoopSeq(m, latticePegs(m))]];
  for (const [nm, o] of ol) if (Math.abs(o.A - L) < GATE.miss + CATCH || caught(m, o.seq)) return bad(nm, o.A - L);
  if (caught(m, rushSeq(m)) || Math.abs(XB_MAX * Math.sign(L) - L) < GATE.miss) return bad('rush');
  if (caught(m, new Array(n).fill(0))) return bad('idle');
  const cl = closedLoopSeq(m);
  if (cl.join() !== m.plan.join() || !caught(m, m.plan)) return bad('plan');
  const ch = randomChance(m); if (ch > GATE.randomMax) return bad('chance', ch);
  return { ok: true, hidden: [h0 + 1, h1 + 1], n, chance: ch, openEmptyMiss: r3(ol[0][1].A - L), openLatticeMiss: r3(ol[1][1].A - L) };
}
export function build(r) { const m = tryBuild(r); return m ? { m, why: 'ok' } : { m: null, why: 'none' }; }
