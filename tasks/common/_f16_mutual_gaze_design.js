import origTask, { sceneTime as _unused, pickAt, GATE as OGATE } from './mutual_gaze_pick.js';
import * as W from './_mutual_gaze_pick_scene.js';
import * as G from './_mutual_gaze_pick_gen.js';
import { r3, attempts } from './_f16_frames.js';
import { HINTS } from './_f16_hints.js';

void _unused;
export const FG = {
  nMax: 16,
  look: 12,
  screenMeet: 8,
  ansScreen: 8.5,
  chairFace: 12,
  decoyScreen: 6,
  decoy3d: 28,
  minGap: 0.5,
  nPeople: 6,
};
const pairsOf = (n) => G.pairsOf(n);
const same = (p, q) => !!p && !!q && ((p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

export function design(m) {
  const ro = m.roles, T = m.T, ts = [];
  const c0 = m.mutual[0], b = ro.b, a = ro.a, c = ro.c;
  const at = (t) => ((t % T) + T) % T;
  for (const f of [0.1, 0.5, 0.9]) ts.push(at(b.s + f * b.len));
  ts.push(at(c.s + c.len / 2));
  ts.push(at(a.s1 + 0.9), at(a.s1 + a.d1 - 0.9), at(a.s2 + 0.9), at(a.s2 + a.d2 - 0.9));
  ts.push(c0.s + 0.2, c0.s + c0.len / 2, c0.s + c0.len - 0.2);
  const mid = ts.map(r3).filter((t) => t >= FG.minGap && t <= T - FG.minGap).sort((x, y) => x - y);
  const out = [0];
  for (const t of mid) if (t - out[out.length - 1] >= FG.minGap - 1e-9) out.push(t);
  out.push(T);
  return out.length <= FG.nMax ? out : null;
}

export function frameData(m) {
  const cam = W.camOf(m), n = m.people.length;
  return m.f16.taus.map((t) => {
    const H = W.headsAt(m, t), err = [], scr = [], body = [];
    for (let i = 0; i < n; i++) {
      err.push([]); scr.push([]); body.push([]);
      for (let j = 0; j < n; j++) {
        err[i].push(i === j ? 0 : W.gazeErr(H, i, j));
        scr[i].push(i === j ? 0 : G.screenErr(cam, H, i, j));
        body[i].push(i === j ? 0 : W.bodyErr(m, H, i, j));
      }
    }
    return { t, H, err, scr, body };
  });
}
const both3 = (d, i, j) => Math.max(d.err[i][j], d.err[j][i]);
const bothS = (d, i, j) => Math.max(d.scr[i][j], d.scr[j][i]);
const bothB = (d, i, j) => Math.max(d.body[i][j], d.body[j][i]);

export function frameProblem(m) {
  const f = m.f16;
  if (!f || !Array.isArray(f.taus)) return 'no-frames';
  const taus = f.taus, n = taus.length, np = m.people.length, ro = m.roles, ans = m.answer, [A, B] = ans;
  if (n < 8 || n > FG.nMax) return 'n';
  for (let k = 1; k < n; k++) if (!(taus[k] > taus[k - 1])) return 'order';
  if (taus[0] !== 0 || taus[n - 1] !== m.T) return 'ends';
  const D = frameData(m), pairs = pairsOf(np);
  const mutual = D.map((d) => both3(d, A, B) <= FG.look);
  const kM = mutual.indexOf(true);
  if (kM < 0) return 'mutual:none';
  let run = 0; while (kM + run < n && mutual[kM + run]) run++;
  if (run < 2) return 'mutual:run';
  if (mutual.filter(Boolean).length !== run) return 'mutual:split';
  for (const [i, j] of pairs) {
    if (same([i, j], ans)) continue;
    if (D.some((d) => both3(d, i, j) < OGATE_AWAY)) return 'other:close';
  }
  const { c, d } = ro.b;
  const dec = D.map((x, k) => (bothS(x, c, d) <= FG.decoyScreen && x.err[d][c] <= FG.look && x.err[c][d] >= FG.decoy3d ? k : -1)).filter((k) => k >= 0);
  if (dec.length < 2 || dec[0] >= kM) return 'decoy:frames';
  for (let k = 0; k < n; k++) if (mutual[k] && !(bothS(D[k], A, B) >= FG.ansScreen)) return 'screen:answer';
  for (const x of D) if (bothB(x, A, B) <= FG.chairFace) return 'chairs:answer';
  const cPair = [ro.c.x, ro.c.y];
  if (!D.some((x) => bothB(x, cPair[0], cPair[1]) <= FG.chairFace && x.err[cPair[1]][cPair[0]] <= FG.look && x.err[cPair[0]][cPair[1]] >= 35)) return 'trapc:frame';
  const { p, q } = ro.a;
  const pq = D.map((x) => x.err[p][q] <= FG.look), qp = D.map((x) => x.err[q][p] <= FG.look);
  if (pq.filter(Boolean).length < 2 || qp.filter(Boolean).length < 2) return 'trapa:frames';
  if (D.some((x, k) => pq[k] && qp[k])) return 'trapa:together';
  const lookFr = (i, j) => D.filter((x) => x.err[i][j] <= FG.look || x.err[j][i] <= FG.look).length;
  if (!(lookFr(p, q) >= lookFr(A, B) + 1)) return 'trapa:more';
  if (frameAudit(m, D).singleFrame) return 'single';
  m.f16.kM = kM; m.f16.run = run;
  return '';
}
const OGATE_AWAY = OGATE.away;

export function frameAudit(m, D = frameData(m)) {
  const np = m.people.length, ans = m.answer, hits = [], pairs = pairsOf(np);
  D.forEach((x, k) => {
    for (const [i, j] of pairs) {
      if (!same([i, j], ans)) continue;
      if (bothS(x, i, j) <= FG.screenMeet) hits.push(`f${k + 1}:screen`);
      if (bothB(x, i, j) <= FG.chairFace) hits.push(`f${k + 1}:chairs`);
    }
  });
  for (const [lab, k] of [['first', 0], ['last', D.length - 1]]) {
    const x = D[k];
    let g3 = [null, Infinity], gs = [null, Infinity], gb = [null, Infinity];
    for (const [i, j] of pairs) {
      const e3 = both3(x, i, j), es = bothS(x, i, j), eb = bothB(x, i, j);
      if (e3 < g3[1]) g3 = [[i, j], e3]; if (es < gs[1]) gs = [[i, j], es]; if (eb < gb[1]) gb = [[i, j], eb];
    }
    if (same(g3[0], ans)) hits.push(`${lab}:gaze3d`);
    if (same(gs[0], ans)) hits.push(`${lab}:screen-best`);
    if (same(gb[0], ans)) hits.push(`${lab}:chairs-best`);
  }
  return { singleFrame: hits.length > 0, hits, n: D.length };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function generate(rng, level, index, knobs, maxTries = 400) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0;
  const hint = HINTS.f16_mutual_gaze?.[key];
  const pinOf = (a) => (Number.isInteger(hint) && hint >= 1000 && hint % 1000 === a ? { a: (Math.floor(hint / 1000) % 100000) - 1, k: Math.floor(hint / 1e8) } : null);
  const order = Number.isInteger(hint) && hint >= 1000 ? [hint % 1000, ...attempts('f16_mutual_gaze', key, maxTries)] : attempts('f16_mutual_gaze', key, maxTries);
  for (const a of order) {
    const sub = mkRng((key ^ Math.imul(a + 1, 0x9e3779b1)) >>> 0);
    let m;
    try { m = origTask.generate(sub, level, index, { ...(knobs || {}), nPeople: FG.nPeople, pin: pinOf(a) }); } catch (e) { fail('exhausted'); continue; }
    const taus = design(m);
    if (!taus) { fail('design'); continue; }
    m.f16 = { taus };
    const fp = frameProblem(m);
    if (fp) { fail('f:' + fp); continue; }
    if (m.taps.some((pt, i) => taus.some((t) => pickAt(m, t, pt[0], pt[1]) !== i))) { fail('taps'); continue; }
    m.attempt = a; m.key = key;
    m.hint = m.pin ? a + 1000 * (m.pin.a + 1) + 1e8 * m.pin.k : a;
    return m;
  }
  throw new Error('f16_mutual_gaze: generator exhausted');
}
import { mulberry32, R } from '../core/rng.js';
function mkRng(seed) { return R(mulberry32(seed)); }
