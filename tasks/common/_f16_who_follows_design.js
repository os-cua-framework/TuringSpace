import { mulberry32, R } from '../core/rng.js';
import * as G from './_who_follows_him_gen.js';
import * as GG from './_f16_who_follows_gen.js';
import * as W from './_who_follows_him_scene.js';
import { r3, mix32, attempts } from './_f16_frames.js';

export const FG = {
  nMax: 16,
  stepM: 2.1,
  maxGap: 2.2,
  cornerM: 1.6,
  headTol: 30,
  after: 0.3,
};
const DEG = Math.PI / 180;
const ang = (v) => Math.atan2(v[1], v[0]);

export const CAST = { nE: 1, q: true, nX: 0, far: true };

export function design(m) {
  const T = m.T, Fl = m.people[m.answer], lag = Fl.lag, keys = [0];
  m.arcT.forEach((a, k) => {
    const t1 = a[1] + FG.after, t2 = a[1] + lag + FG.after;
    if (k >= 1 && t1 > 0.2 && t1 < T) keys.push(t1);
    if (t2 > 0.2 && t2 < T) keys.push(t2);
  });
  keys.push(Math.min(T, m.tStop + 0.5), T);
  let ts = keys.map(r3).sort((a, b) => a - b);
  ts = ts.filter((t, i) => i === 0 || t - ts[i - 1] >= 0.45);
  if (ts[ts.length - 1] !== T) ts.push(T);
  const floorMove = (a, b) => {
    let mx = 0;
    for (const p of m.people) { const A = W.poseAt(p, a), B = W.poseAt(p, b); mx = Math.max(mx, Math.hypot(A.x - B.x, A.z - B.z)); }
    return mx;
  };
  const out = [ts[0]];
  const rec = (a, b, depth) => {
    if (b - a < 0.5 || depth > 4 || (b - a <= FG.maxGap && floorMove(a, b) <= FG.stepM)) return;
    const mid = r3((a + b) / 2);
    rec(a, mid, depth + 1); out.push(mid); rec(mid, b, depth + 1);
  };
  for (let k = 1; k < ts.length; k++) { rec(ts[k - 1], ts[k], 0); out.push(ts[k]); }
  out.sort((a, b) => a - b);
  const u = out.filter((t, i) => i === 0 || t - out[i - 1] >= 0.3);
  return u.length > FG.nMax ? null : u;
}

export const looksOf = (m) => m.f16.taus.map((t) => ({ t, loop: 0, O: G.observe(m, t) }));
const idx = (taus, t) => { let b = 0; taus.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(taus[b] - t)) b = i; }); return b; };

export function frameProblem(m) {
  const f = m.f16;
  if (!f || !Array.isArray(f.taus)) return 'no-frames';
  const taus = f.taus, n = taus.length, F = m.answer, Ti = m.target, Tp = m.people[Ti], Fp = m.people[F];
  if (n < 8 || n > FG.nMax) return 'n';
  for (let k = 1; k < n; k++) if (!(taus[k] > taus[k - 1])) return 'order';
  if (taus[0] !== 0 || taus[n - 1] !== m.T) return 'ends';
  const looks = looksOf(m);
  for (let k = 1; k < n; k++) {
    for (let i = 0; i < m.people.length; i++) {
      const a = looks[k - 1].O[i], b = looks[k].O[i];
      if (Math.hypot(a.x - b.x, a.z - b.z) > FG.stepM * 1.1) return 'step';
    }
  }
  for (let k = 0; k < m.arcT.length; k++) {
    const tm = (m.arcT[k][0] + m.arcT[k][1]) / 2, c = W.poseAt(Tp, tm), h1 = m.turns[k].h1;
    let a = -1;
    if (k >= 1) {
      for (let j = 0; j < n; j++) { const o = looks[j].O[Ti]; if (Math.hypot(o.x - c.x, o.z - c.z) <= FG.cornerM && Math.abs(G.angDiff(o.h, h1)) <= FG.headTol * DEG) { a = j; break; } }
      if (a < 0) return `turn${k}:T`;
    }
    let b = -1;
    for (let j = Math.max(a, 0); j < n; j++) { const o = looks[j].O[F]; if (Math.hypot(o.x - c.x, o.z - c.z) <= FG.cornerM && Math.abs(G.angDiff(o.h, h1)) <= FG.headTol * DEG) { b = j; break; } }
    if (b < 0) return `turn${k}:F`;
    if (a >= 0 && b <= a) return `turn${k}:order`;
  }
  if (G.MULTI_READERS.correct(m, looks) !== F) return 'correct';
  if (routeSimPick(m, looks) === F) return 'route-similar';
  for (const k of ['nearVote', 'nearScreenVote', 'nearMean', 'nearScreenMean', 'nearBehindVote', 'nearBehind25Vote', 'screenBehindVote', 'coneVote', 'lineBehindVote', 'lineBehind45Vote', 'behind2Vote', 'inLine2Vote', 'dispScreenVote', 'disp3dVote', 'firstTurn', 'turns']) {
    if (G.MULTI_READERS[k](m, looks) === F) return `full:${k}`;
  }
  if (frameAudit(m, looks).singleFrame) return 'single';
  return '';
}

export function routeSimPick(m, looks = looksOf(m)) {
  const route = m.people[m.target].mv.pts.map((q) => [q[0], q[1]]);
  let best = -1, bv = Infinity;
  m.people.forEach((_, i) => {
    if (i === m.target) return;
    let sum = 0;
    for (const L of looks) { let d = Infinity; for (const q of route) d = Math.min(d, Math.hypot(L.O[i].x - q[0], L.O[i].z - q[1])); sum += d; }
    if (sum / looks.length < bv) { bv = sum / looks.length; best = i; }
  });
  return best;
}

export function frameAudit(m, looks = looksOf(m)) {
  const F = m.answer, n = looks.length, taus = m.f16.taus;
  const kStop = idx(taus, Math.min(m.T, m.tStop + 0.5));
  const hits = [], blind = [];
  for (const [rn, rf] of Object.entries(G.FRAME_READERS)) {
    for (const [lab, k] of [['first', 0], ['last', n - 1], ['stop', kStop]]) if (rf(m, looks[k].O) === F) hits.push(`${lab}.${rn}`);
    looks.forEach((L, k) => { if (L.O[m.target].moving && rf(m, L.O) === F) blind.push(`f${k + 1}.${rn}`); });
  }
  for (const [rn, rf] of Object.entries(G.PAIR_READERS)) {
    if (rn === 'copy2') continue;
    if (rf(m, looks[0].O, looks[n - 1].O) === F) hits.push(`firstLast.${rn}`);
    if (rf(m, looks[0].O, looks[kStop].O) === F) hits.push(`firstStop.${rn}`);
  }
  return { singleFrame: hits.length > 0, hits, n, blindHits: blind.length };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function holdOf(key) { return r3(0.8 + 0.4 * mulberry32(mix32(key, 0x5eed0000))()); }
export function buildAt(key, a, hold) {
  const m = GG.tryBuild(R(mulberry32(mix32(key, a))), { ...CAST, hold });
  if (!m) return null;
  m.hold = hold; m.dt = 0.5; m.attempt = a; m.key = key;
  const why = G.check(m);
  if (why !== null) return fail('g:' + why);
  const taus = design(m);
  if (!taus) return fail('design');
  m.f16 = { taus };
  const fp = frameProblem(m);
  if (fp) return fail('f:' + fp);
  return m;
}
export function generate(rng, maxAttempts = 40000) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0, hold = holdOf(key);
  for (const a of attempts('f16_who_follows', key, maxAttempts)) {
    const m = buildAt(key, a, hold);
    if (m) return m;
  }
  throw new Error('f16_who_follows: generator exhausted');
}
