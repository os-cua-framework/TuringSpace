import { D2R } from './_f16_scene_kit.js';

export const R_REACH = 3, N_TURNS = 9, PH = 46 * D2R, PROP = 1.0, HALFW = 2.4, BOATR = 0.3, ROCKR = 0.5, RV = 5.0, BERTH = 1.15;
export const LIM = HALFW - BOATR, LEAF_V = 1.75;
const ORDER = [0, -1, 1];
const GEO = new WeakMap();
export function geo(m) {
  let G = GEO.get(m); if (G) return G;
  G = { R: m.pts.length - 1, ax: [], az: [], dx: [], dz: [], nx: [], nz: [], len: [], dd: [], out: { x: 0, z: 0, why: '' }, fl: [0, 0] };
  for (let j = 0; j < G.R; j++) {
    const [ax, az] = m.pts[j], [bx, bz] = m.pts[j + 1], l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
    G.ax.push(ax); G.az.push(az); G.dx.push(dx); G.dz.push(dz); G.nx.push(dz); G.nz.push(-dx); G.len.push(l);
  }
  GEO.set(m, G); return G;
}
function dists(G, x, z) {
  let dmin = 1e9;
  for (let j = 0; j < G.R; j++) {
    const px = x - G.ax[j], pz = z - G.az[j], t = Math.max(0, Math.min(G.len[j], px * G.dx[j] + pz * G.dz[j]));
    const d = Math.hypot(px - t * G.dx[j], pz - t * G.dz[j]); G.dd[j] = d; if (d < dmin) dmin = d;
  }
  return dmin;
}
function flow(G, m, x, z, J, dmin) {
  let sx = 0, sz = 0, sw = 0;
  for (let j = 0; j < G.R; j++) {
    const w = Math.exp(-(G.dd[j] * G.dd[j] - dmin * dmin) / 0.81); if (w < 1e-4) continue;
    const q = j <= J ? j : J, su = m.su[q], sv = m.sv[q];
    sx += w * (su * G.dx[j] + sv * G.nx[j]); sz += w * (su * G.dz[j] + sv * G.nz[j]); sw += w;
  }
  G.fl[0] = sx / sw; G.fl[1] = sz / sw;
}
function hit(G, m, x, z, J) {
  const dmin = dists(G, x, z);
  if (dmin > LIM) return 'bank';
  const k = G.R - 1, e = (x - (G.ax[k] + G.dx[k] * G.len[k])) * G.dx[k] + (z - (G.az[k] + G.dz[k] * G.len[k])) * G.dz[k];
  if (e > 0.6) return 'end';
  for (const r of m.rocks) if (r.j <= J && Math.hypot(x - r.x, z - r.z) < ROCKR + BOATR) return 'rock';
  return '';
}
export function stepW(G, m, x, z, a, J) {
  const dmin = dists(G, x, z); flow(G, m, x, z, J, dmin);
  const vx = G.fl[0] + PROP * Math.sin(a * PH), vz = G.fl[1] + PROP * Math.cos(a * PH), o = G.out;
  for (let s = 1; s <= 3; s++) {
    const px = x + vx * s / 3, pz = z + vz * s / 3, w = hit(G, m, px, pz, J);
    if (w) { o.x = px; o.z = pz; o.why = w; return false; }
  }
  o.x = x + vx; o.z = z + vz; o.why = ''; return true;
}
export function revealed(m, J, x, z) {
  for (let j = Math.max(1, J + 1); j < m.pts.length - 1; j++) if (Math.hypot(x - m.pts[j][0], z - m.pts[j][1]) <= RV) J = j;
  return J;
}
export function simulate(m, seq) {
  const G = geo(m), D = m.dock, pos = [[m.pts[0][0], m.pts[0][1]]], Js = [revealed(m, 0, m.pts[0][0], m.pts[0][1])];
  let x = pos[0][0], z = pos[0][1], J = Js[0], crash = null, docked = 0, minD = Math.hypot(x - D.x, z - D.z);
  for (let k = 0; k < m.n; k++) {
    if (!crash && !docked) {
      const ok = stepW(G, m, x, z, seq[k] ?? 0, R_REACH - 1);
      x = G.out.x; z = G.out.z; if (!ok) crash = { turn: k + 1, why: G.out.why };
      J = revealed(m, J, x, z);
      const d = Math.hypot(x - D.x, z - D.z); if (d < minD) minD = d;
      if (!crash && d <= D.r) docked = k + 1;
    }
    pos.push([x, z]); Js.push(J);
  }
  return { pos, Js, crash, docked, minD, success: !crash && docked > 0 };
}
export function search(m, x0, z0, k0, J) {
  const G = geo(m), seq = new Array(m.n), D = m.dock; let best = Infinity, bs = null;
  const take = (score, k) => { if (score < best - 1e-9) { best = score; bs = seq.slice(k0, k); } };
  (function rec(k, x, z) {
    if (k === m.n) { take(Math.hypot(x - D.x, z - D.z), k); return; }
    for (const a of ORDER) {
      seq[k] = a; if (!stepW(G, m, x, z, a, J)) continue;
      const d = Math.hypot(G.out.x - D.x, G.out.z - D.z);
      if (d <= D.r) take(-1000 + k, k + 1); else rec(k + 1, G.out.x, G.out.z);
    }
  })(k0, x0, z0);
  return { score: best, seq: bs || [], docks: best < -500 };
}
export function enumerate(m, D, visit) {
  const G = geo(m); let docks = 0;
  (function rec(k, x, z) {
    if (k === m.n) return;
    for (const a of ORDER) {
      if (!stepW(G, m, x, z, a, R_REACH - 1)) continue;
      const px = G.out.x, pz = G.out.z;
      if (visit && k >= 4) visit.push([px, pz]);
      if (D && Math.hypot(px - D.x, pz - D.z) <= D.r) docks += 3 ** (m.n - k - 1); else rec(k + 1, px, pz);
    }
  })(0, m.pts[0][0], m.pts[0][1]);
  return docks;
}

export function idleSeq(m) { return new Array(m.n).fill(0); }
export function greedySeq(m) {
  const seq = []; let x = m.pts[0][0], z = m.pts[0][1]; const G = geo(m);
  for (let k = 0; k < m.n; k++) {
    let ba = 0, bd = Infinity;
    for (const a of ORDER) { const d = Math.hypot(m.dock.x - (x + PROP * Math.sin(a * PH)), m.dock.z - (z + PROP * Math.cos(a * PH))); if (d < bd - 1e-9) { bd = d; ba = a; } }
    seq.push(ba); if (stepW(G, m, x, z, ba, R_REACH - 1)) { x = G.out.x; z = G.out.z; } else break;
  }
  while (seq.length < m.n) seq.push(0);
  return seq;
}
export function ghostGreedySeq(m) {
  const seq = []; let x = m.pts[0][0], z = m.pts[0][1]; const G = geo(m);
  for (let k = 0; k < m.n; k++) {
    let ba = 0, bd = Infinity, bx = x, bz = z;
    for (const a of ORDER) { if (!stepW(G, m, x, z, a, R_REACH - 1)) continue; const d = Math.hypot(m.dock.x - G.out.x, m.dock.z - G.out.z); if (d < bd - 1e-9) { bd = d; ba = a; bx = G.out.x; bz = G.out.z; } }
    seq.push(ba); x = bx; z = bz;
    if (Math.hypot(x - m.dock.x, z - m.dock.z) <= m.dock.r) break;
  }
  return seq;
}
const pad = (m, s) => { const o = s.slice(); while (o.length < m.n) o.push(0); return o; };
export function openLoopSeq(m) { return pad(m, search(m, m.pts[0][0], m.pts[0][1], 0, revealed(m, 0, m.pts[0][0], m.pts[0][1])).seq); }
export function closedLoopSeq(m) {
  const G = geo(m), D = m.dock, seq = []; let x = m.pts[0][0], z = m.pts[0][1], J = revealed(m, 0, x, z);
  for (let k = 0; k < m.n; k++) {
    const p = search(m, x, z, k, J), a = p.seq.length ? p.seq[0] : 0;
    seq.push(a);
    if (!stepW(G, m, x, z, a, R_REACH - 1)) break;
    x = G.out.x; z = G.out.z; J = revealed(m, J, x, z);
    if (Math.hypot(x - D.x, z - D.z) <= D.r) break;
  }
  return seq;
}

export const GATE = { randomMax: 0.012, sureMin: 30, miss: 1.0, lastRevealMin: 3, lastRevealSlack: 3, dockV: [1.0, 1.7], rockClear: 1.6 };
const r3 = (v) => Math.round(v * 1000) / 1000;
export function tryBuildRiver(r) {
  const n = N_TURNS, a0 = r.uniform(-12, 12) * D2R, s1 = r.sign();
  const ang = [a0, a0 + s1 * r.uniform(34, 52) * D2R, a0 + s1 * r.uniform(34, 52) * D2R - s1 * r.uniform(40, 62) * D2R];
  const pts = [[r3(r.uniform(-0.3, 0.3)), 0]];
  const lens = [r.uniform(5.6, 6.6), r.uniform(5.6, 6.6), r.uniform(5.8, 6.8)];
  for (let j = 0; j < R_REACH; j++) { const p = pts[j]; pts.push([r3(p[0] + Math.sin(ang[j]) * lens[j]), r3(p[1] + Math.cos(ang[j]) * lens[j])]); }
  const su = [], sv = [];
  for (let j = 0; j < R_REACH; j++) { su.push(r3(r.uniform(0.55, 1.5))); sv.push(r3(j === 0 ? r.uniform(-0.25, 0.25) : r.sign() * r.uniform(0.2, 0.5))); }
  const m = { task: 'f16_steer_boat', n, dt: 1, pts, su, sv, rocks: [], leaves: [], dock: null, plan: null };
  const G = geo(m);
  for (let j = 0; j < R_REACH; j++) {
    for (let i = 0; i < 4; i++) m.leaves.push({ j, u: r3(r.uniform(0, G.len[j])), v: r3(r.uniform(-LEAF_V, LEAF_V)), rot: r3(r.uniform(0, 6.28)) });
    const nr = j === 0 ? r.int(0, 1) : r.int(1, 2);
    for (let i = 0; i < nr; i++) {
      const u = r.uniform(j === 0 ? 2.2 : 0.9, G.len[j] - 0.9), v = r.uniform(-1.25, 1.25);
      m.rocks.push({ j, x: r3(G.ax[j] + G.dx[j] * u + G.nx[j] * v), z: r3(G.az[j] + G.dz[j] * u + G.nz[j] * v) });
    }
  }
  m.look = { seed: Math.floor(r.raw() * 1e9), boat: r.int(0, 3), water: r.int(0, 2), grass: r.int(0, 2) };
  return m;
}
export function dockCandidates(m, r) {
  const G = geo(m), vis = [], k = R_REACH - 1, out = []; enumerate(m, null, vis);
  for (const [x, z] of r.shuffle(vis).slice(0, 300)) {
    const u = (x - G.ax[k]) * G.dx[k] + (z - G.az[k]) * G.dz[k], v = (x - G.ax[k]) * G.nx[k] + (z - G.az[k]) * G.nz[k];
    if (u < 0.3 * G.len[k] || u > G.len[k] - 0.7 || Math.abs(v) < GATE.dockV[0] || Math.abs(v) > GATE.dockV[1]) continue;
    if (m.rocks.some((q) => Math.hypot(q.x - x, q.z - z) < GATE.rockClear)) continue;
    out.push({ x: r3(x), z: r3(z), r: BERTH, u: r3(u), v: r3(v), side: v > 0 ? 1 : -1 });
  }
  return out;
}

export function contract(m) {
  const bad = (why, x) => ({ ok: false, why, x });
  if (!m || m.task !== 'f16_steer_boat' || m.n !== N_TURNS || !m.dock || !m.plan || m.plan.length < 2 || m.plan.length > m.n) return bad('shape');
  const D = m.dock, idle = simulate(m, idleSeq(m)), gr = simulate(m, greedySeq(m)), gg = simulate(m, ghostGreedySeq(m)), ol = simulate(m, openLoopSeq(m));
  for (const [nm, s] of [['idle', idle], ['greedy', gr], ['ghost-greedy', gg], ['open-loop', ol]]) if (s.success || s.minD < D.r + GATE.miss) return bad(nm, s.minD);
  const ps = simulate(m, m.plan), cl = closedLoopSeq(m);
  if (!ps.success || cl.join() !== m.plan.join()) return bad('plan', ps.minD);
  const lastRev = ps.Js.findIndex((J) => J >= R_REACH - 1);
  if (lastRev < GATE.lastRevealMin || lastRev > ps.docked - GATE.lastRevealSlack + 1) return bad('reveal', lastRev);
  if (ps.Js[0] !== 0 || ps.Js.findIndex((J) => J >= 1) > 3) return bad('reveal1');
  const total = 3 ** m.n, cnt = enumerate(m, D);
  if (cnt < GATE.sureMin || cnt / total > GATE.randomMax) return bad('chance', cnt / total);
  return { ok: true, lastRev, docked: ps.docked, chance: cnt / total, openLoopMin: r3(ol.minD), idleMin: r3(idle.minD), greedyMin: r3(gr.minD), ghostMin: r3(gg.minD), hits: cnt };
}
export function build(r) {
  const m = tryBuildRiver(r), cands = dockCandidates(m, r);
  if (!cands.length) return { m: null, why: 'cands' };
  let why = 'none';
  for (const c of cands.slice(0, 8)) {
    m.dock = c; m.plan = [0, 0];
    const idle = simulate(m, idleSeq(m)), gr = simulate(m, greedySeq(m));
    if (idle.success || idle.minD < c.r + GATE.miss) { why = 'idle'; continue; }
    if (gr.success || gr.minD < c.r + GATE.miss) { why = 'greedy'; continue; }
    const gg = simulate(m, ghostGreedySeq(m)); if (gg.success || gg.minD < c.r + GATE.miss) { why = 'ghost'; continue; }
    const cl = closedLoopSeq(m); m.plan = cl.length >= 2 ? cl : [0, 0];
    const c1 = contract(m);
    if (c1.ok) return { m, why: 'ok' };
    why = c1.why;
  }
  return { m: null, why };
}
