import { mulberry32, R } from '../core/rng.js';
import { makeTask, mix32, r3, oneFrameCues, argMax, argMin } from '../common/_f16_pick_kit.js';
import * as W from '../common/_f16_which_train_moves_scene.js';

const NAME = 'f16_which_train_moves';
const PROMPT = 'Tap the train that stays parked the whole time', SUB = 'Press Next frame to step through the clip · tap a train, then Verify';
const N = 16, DT = 0.5, K = 7, WIN = 5;
const IN = { x0: 13, x1: W.VIEW.w - 13, y0: 13, y1: W.VIEW.h - 26 };
const PIN_PX = 2.5;

const feats = (m, k) => m.trains.map((_, i) => W.screenOf(m, i, k));
const frameData = (m) => Array.from({ length: N }, (_, k) => feats(m, k));
const wrap = (d, sp) => d - sp * Math.round(d / sp);
const mastShift = (F, i, p, q) => wrap((F[q][i].x - F[q][i].mastX) - (F[p][i].x - F[p][i].mastX), F[p][i].mastSp);
function cuesOn(F) {
  const out = [];
  F.forEach((fr, k) => oneFrameCues(fr, W.VIEW.w / 2, W.VIEW.h / 2).forEach((c) => out.push({ frame: k + 1, ...c })));
  return out;
}
function oneFrameHits(F, P) {
  const by = {}, dz = F[0].map((f) => f.depth), endTrack = dz[P] === Math.min(...dz) || dz[P] === Math.max(...dz);
  for (const c of cuesOn(F)) if (c.picks === P && !(endTrack && /^(size|y)-/.test(c.cue))) (by[c.cue] ??= []).push(c.frame);
  return Object.entries(by).filter(([, fr]) => fr.includes(1) || fr.includes(N) || fr.length > N / K).map(([cue, frames]) => ({ cue, frames }));
}
export function pinnedSet(m, F, p, q) {
  const d = m.trains.map((_, i) => Math.abs(mastShift(F, i, p, q))), tau = Math.max(PIN_PX, 1.25 * d[m.answer]);
  return m.trains.map((_, i) => i).filter((i) => d[i] <= tau + 1e-9);
}
function windowSets(m, F) {
  const out = [];
  for (let p = 0; p < N; p++) for (let q = p + 1; q <= Math.min(N - 1, p + WIN); q++) out.push({ p, q, set: pinnedSet(m, F, p, q) });
  return out;
}
export function readings(m, F = frameData(m)) {
  const slide = (i, p, q) => Math.abs(F[q][i].x - F[p][i].x), ids = m.trains.map((_, i) => i);
  const fl = ids.map((i) => Math.abs(mastShift(F, i, 0, N - 1)));
  const pinnedSets = [];
  for (let k = 0; k + 1 < N; k++) pinnedSets.push(pinnedSet(m, F, k, k + 1));
  return {
    screenStill: argMin(ids.map((i) => slide(i, 0, N - 1))),
    screenMost: argMax(ids.map((i) => slide(i, 0, N - 1))),
    firstLast: argMin(fl),
    firstLastSet: pinnedSet(m, F, 0, N - 1), firstHalfSet: pinnedSet(m, F, 0, N / 2 - 1), secondHalfSet: pinnedSet(m, F, N / 2, N - 1),
    pinnedSets,
    windowSets: windowSets(m, F),
    firstLastPx: fl.map(r3),
  };
}

export function contract(m) {
  const bad = (why) => ({ ok: false, why });
  if (!m || m.n !== N || m.K !== K || m.trains?.length !== K) return bad('shape');
  const P = m.answer, zs = m.trains.map((t) => t.z), order = zs.map((z, i) => i).sort((a, b) => zs[a] - zs[b]);
  const moved = m.trains.map((t) => Math.max(...t.xs.map(Math.abs)));
  if (moved[P] !== 0 || moved.filter((v) => v === 0).length !== 1 || moved.some((v, i) => i !== P && v < 2.5)) return bad('one-parked');
  for (let a = 1; a < K; a++) if (zs[order[a]] - zs[order[a - 1]] < 2.4 - 1e-9) return bad('depth-gap');
  const F = frameData(m);
  for (let k = 0; k < N; k++) {
    for (const f of F[k]) { if (f.left < IN.x0 || f.right > IN.x1 || f.top < IN.y0 || f.bot > IN.y1 || f.size < 28) return bad('off-picture'); }
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      const A = F[k][a], B = F[k][b], ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bot, B.bot) - Math.max(A.top, B.top);
      if (ox > 0 && oy > 0 && ox * oy > 0.3 * Math.min((A.right - A.left) * (A.bot - A.top), (B.right - B.left) * (B.bot - B.top))) return bad('overlap');
    }
    if (k + 1 < N) for (let i = 0; i < K; i++) {
      const step = Math.abs(F[k + 1][i].x - F[k][i].x), len = F[k][i].right - F[k][i].left;
      if (step > 0.4 * len || step > F[k][i].mastSp / 3) return bad('step');
    }
  }
  for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
    const ab = m.trains.map((_, i) => Math.abs(F[q][i].x - F[p][i].x));
    if (argMax(ab) === P || argMin(ab) === P) return bad('slide-extreme');
  }
  const rd = readings(m, F);
  if (rd.firstLast === P) return bad('first-last');
  if (rd.pinnedSets.some((s) => s.length < 2)) return bad('pinned-pair');
  if ([rd.firstHalfSet, rd.secondHalfSet, rd.firstLastSet].some((s) => s.length < 2)) return bad('pinned-half');
  if (rd.windowSets.some((w) => w.set.length < 2)) return bad('pinned-window');
  if (oneFrameHits(F, P).length) return bad('single-frame-cue');
  const named = new Set(cuesOn(F).map((c) => c.picks)), never = m.trains.map((_, i) => i).filter((i) => !named.has(i));
  if (never.includes(P) && never.length < 3) return bad('elim-never-named');
  const mid = order.slice(1, -1).filter((i) => i !== rd.screenStill && i !== rd.screenMost);
  if (mid.length < 2) return bad('elim-middle');
  return { ok: true };
}
export function gate(m) {
  try {
    if (!contract(m).ok) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}
export function frameAudit(m) {
  const F = frameData(m), hits = oneFrameHits(F, m.answer), rd = readings(m, F);
  return { singleFrame: hits.length > 0, oneFrameCuesOnParked: hits, screenStillIsParked: rd.screenStill === m.answer, screenMostIsParked: rd.screenMost === m.answer,
    firstLastIsParked: rd.firstLast === m.answer, firstLastPx: rd.firstLastPx, pinnedPerPair: rd.pinnedSets.map((s) => s.length), frames: N, dt: DT };
}

const PROFILE = {
  P: () => 0,
  A: (k) => k / (N - 1),
  O: (k) => k / (N - 1),
  B: (k, h) => {
    const k1 = h - 3, tot = k1 + 1.5;
    if (k <= k1) return k / tot; if (k >= h) return 1;
    const t = k - k1; return (k1 + t - t * t / 6) / tot;
  },
  D: (k, j0) => (k <= j0 ? 0 : ((k - j0) / (N - 1 - j0)) ** 2),
  M: (k, [a, b]) => (k <= a ? k : k <= b ? a : k - (b - a)) / (N - 1 - (b - a)),
};
export const DIAG = {};
const rej = (k) => { DIAG[k] = (DIAG[k] || 0) + 1; return null; };
function tryBuild(r, pRankWant = null) {
  const s = r.sign(), fov = r.uniform(40, 43);
  const zs = Array.from({ length: K }, (_, i) => 12.5 + 3.2 * i + r.uniform(0, 0.6));
  const pRank = pRankWant ?? r.int(0, K - 1), rest = r.shuffle(['A', 'B', 'D', 'O', 'M', 'M']), roles = [];
  for (let i = 0, j = 0; i < K; i++) roles.push(i === pRank ? 'P' : rest[j++]);
  const pauses = [], a1 = r.int(2, 4), a2 = r.int(6, 9); pauses.push([a1, a1 + r.int(6, 7)], [a2, Math.min(a2 + r.int(5, 6), N - 3)]);
  let pi = 0;
  const rho = r.uniform(0.86, 0.93), C = r.uniform(3.0, 4.2);
  const m = { n: N, dt: DT, K, cam: { x0: 0, dA: r3(s * C / (N - 1)), fov: r3(fov) }, trains: [] };
  const h = r.int(5, 6), j0 = r.int(h, 6);
  const dB = r.sign(), dD = r.sign(), dO = -s, dM = [r.sign(), r.sign()];
  const liv = r.shuffle(W.LIVERIES);
  for (let i = 0; i < K; i++) {
    const role = roles[i], par = role === 'M' ? pauses[pi++] : role === 'B' ? h : j0, g = (k) => PROFILE[role](k, par);
    m.trains.push({ z: r3(zs[i]), x0: 0, xs: new Array(N).fill(0), role, ...(role === 'M' ? { pause: par } : {}), color: liv[i].name, body: liv[i].body, mast: r3(r.uniform(-2, 2)) });
    const T = m.trains[i];
    if (role === 'P') continue;
    if (role === 'A') { T.xs = Array.from({ length: N }, (_, k) => m.cam.dA * rho * k); continue; }
    const dir = role === 'B' ? dB : role === 'D' ? dD : role === 'M' ? dM[pauses.indexOf(par)] : dO;
    const shift = (S) => { T.xs = Array.from({ length: N }, (_, k) => S * g(k)); const a = W.screenOf(m, i, 0), b = W.screenOf(m, i, N - 1); return { d: (b.x - b.mastX) - (a.x - a.mastX), sp: a.mastSp }; };
    const s0 = shift(0), s1 = shift(1), per = s1.d - s0.d;
    let best = null;
    for (const j of [-1, 1]) { const S = (j * s0.sp - s0.d) / per; if (Math.sign(S) === dir && (!best || Math.abs(S) < Math.abs(best))) best = S; }
    if (best === null || Math.abs(best) < 3.5 || Math.abs(best) > 7) return rej('run-' + role);
    T.xs = Array.from({ length: N }, (_, k) => best * g(k));
  }
  const lin = m.trains.map((T) => {
    const b = [], c0 = W.camCached(m, 0); let ppm = 0;
    for (let k = 0; k < N; k++) { const c = W.camCached(m, k), q0 = c.project(T.xs[k], 2.0, -T.z), q1 = c.project(T.xs[k] + 1, 2.0, -T.z); b.push(q0.x); ppm = q1.x - q0.x; }
    const hw = W.HALF * ppm, lo = Math.max(...b.map((v) => (IN.x0 + 4 + hw - v) / ppm)), hi = Math.min(...b.map((v) => (IN.x1 - 4 - hw - v) / ppm));
    const top = c0.project(0, 0.5 + W.BODY_H, -T.z).y, bot = c0.project(0, 0.5, -T.z).y;
    return { b, ppm, hw, lo, hi, top, bot };
  });
  if (lin.some((L) => !(L.hi > L.lo))) return rej('window-x');
  let placed = null;
  for (let t = 0; t < 400 && !placed; t++) {
    const x0 = lin.map((L) => r.uniform(L.lo, L.hi)); let fine = true;
    for (let a = 0; a < K && fine; a++) for (let b2 = a + 1; b2 < K && fine; b2++) {
      const A = lin[a], B = lin[b2], oy = Math.min(A.bot, B.bot) - Math.max(A.top, B.top);
      if (oy <= 0) continue;
      const areaMin = Math.min(2 * A.hw * (A.bot - A.top), 2 * B.hw * (B.bot - B.top));
      for (let k = 0; k < N; k++) {
        const xa = A.b[k] + A.ppm * x0[a], xb = B.b[k] + B.ppm * x0[b2];
        const ox = Math.min(xa + A.hw, xb + B.hw) - Math.max(xa - A.hw, xb - B.hw);
        if (ox > 0 && ox * oy > 0.25 * areaMin) { fine = false; break; }
      }
    }
    if (fine) placed = x0;
  }
  if (!placed) return rej('placed');
  m.trains.forEach((T, i) => { T.x0 = r3(placed[i]); T.mast = r3(T.x0 + T.mast); T.xs = T.xs.map(r3); });
  m.answer = pRank;
  return m;
}
export const rawBuild = (r, rank) => tryBuild(r, rank);

const task = makeTask({
  name: NAME, prompt: PROMPT, sub: SUB, view: W.VIEW, picks: 1,
  tapNote: 'tap a train to select it (tap it again to clear; revisable until Verify)',
  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const rank = mix32(key, 0x5eed) % K;
    for (let a = 0; a < 400000; a++) { const m = tryBuild(R(mulberry32(mix32(key, a))), rank); if (m && contract(m).ok) { m.gen = { tries: a + 1 }; shuffleIds(m, R(mulberry32(mix32(key, 0xabc)))); return m; } }
    throw new Error(`${NAME}: generator exhausted`);
  },
  sceneAt: W.sceneAt,
  anchor: (m, c, k) => [W.trainX(m, c, k), 0.5 + W.BODY_H * 0.45, -m.trains[c].z],
  overlay: (g) => W.drawWindow(g),
  detail: (m) => ({ parked: m.trains[m.answer].color, roles: m.trains.map((t) => t.role).join(''), dA: m.cam.dA }),
});
function shuffleIds(m, r) {
  const perm = r.shuffle(Array.from({ length: K }, (_, i) => i)), old = m.trains.slice();
  m.trains = perm.map((i) => old[i]); m.answer = perm.indexOf(m.answer);
}
task.gate = gate; task.frameAudit = frameAudit; task.contract = contract;
export default task;
