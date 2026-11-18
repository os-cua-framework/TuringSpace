import { mulberry32, R } from '../core/rng.js';
import * as G from './_who_knocked_vase_gen.js';
import * as S from './_who_knocked_vase_scene.js';
import { r2, r3, mix32, attempts } from './_f16_frames.js';

export const FG = {
  nMax: 16,
  stepM: 1.5,
  tiltRock: 5,
  kAway: 0.45,
  kNear: 0.45,
  kBefore: 0.75,
  nPeople: 5,
  d4Near: [0.28, 0.65],
  exclMax: 0.25,
};
const DEG = Math.PI / 180;

export function design(m) {
  const B = m.bump, F = m.fall, tb = B.tb, T = m.T;
  const keys = [0, tb - 0.8, tb + 0.12];
  const s1 = F.P / 4;
  const nExt = Math.floor((F.W - 0.08) / F.P - 0.25), s2 = F.P * (nExt + 0.25);
  keys.push(F.tw + s1);
  if (nExt >= 1 && s2 - s1 >= 0.3) keys.push(F.tw + s2);
  keys.push(F.tw + F.W + 0.55 * F.Df, F.tLie + 0.45);
  keys.push(T);
  let ts = keys.map((t) => Math.max(0, Math.min(T, r3(t)))).sort((a, b) => a - b);
  ts = ts.filter((t, i) => i === 0 || t - ts[i - 1] >= 0.25);
  if (ts[ts.length - 1] !== T) ts.push(T);
  const present = (i, t) => S.personAt(m, i, t);
  const moveOf = (a, b) => {
    let mx = 0;
    for (let i = 0; i < m.people.length; i++) {
      let A = present(i, a), Bq = present(i, b);
      if (!A && !Bq) continue;
      const first = (t0) => present(i, Math.max(t0, m.people[i].segs[0].t0 + 0.01));
      if (!A) A = first(b); if (!Bq) Bq = first(a);
      if (!A || !Bq) continue;
      const fa = S.bodyFloor(A), fb = S.bodyFloor(Bq);
      mx = Math.max(mx, Math.hypot(fa[0] - fb[0], fa[1] - fb[1]));
    }
    return mx;
  };
  const out = [ts[0]];
  const rec = (a, b, depth) => {
    if (b - a < 0.45 || depth > 4 || moveOf(a, b) <= FG.stepM) return;
    const mid = r3((a + b) / 2);
    rec(a, mid, depth + 1); out.push(mid); rec(mid, b, depth + 1);
  };
  for (let k = 1; k < ts.length; k++) {
    if (!(ts[k - 1] >= tb - 0.8 && ts[k] <= F.tLie + 0.45)) rec(ts[k - 1], ts[k], 0);
    out.push(ts[k]);
  }
  out.sort((a, b) => a - b);
  const u = out.filter((t, i) => i === 0 || t - out[i - 1] >= 0.2);
  const isKey = (t) => ts.some((k) => Math.abs(k - t) < 1e-9);
  while (u.length > FG.nMax) {
    let best = -1, bm = Infinity;
    for (let k = 1; k < u.length - 1; k++) {
      if (isKey(u[k])) continue;
      const mv = moveOf(u[k - 1], u[k + 1]);
      if (mv <= FG.stepM * 1.12 && mv < bm) { bm = mv; best = k; }
    }
    if (best < 0) break;
    u.splice(best, 1);
  }
  if (u.length > FG.nMax) return 'n=' + u.length;
  return u;
}

export function frameData(m) {
  const cam = S.camOf(m);
  return m.f16.taus.map((t) => G.observe(m, t, cam));
}
const idxOfTime = (taus, t) => { let b = 0; taus.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(taus[b] - t)) b = i; }); return b; };

export function frameProblem(m) {
  const f = m.f16;
  if (!f || !Array.isArray(f.taus)) return 'no-frames';
  const taus = f.taus, n = taus.length, B = m.bump, F = m.fall, R0 = m.roles, K = R0.K, D1 = R0.D1;
  if (n < 8 || n > FG.nMax) return 'n';
  for (let k = 1; k < n; k++) if (!(taus[k] > taus[k - 1])) return 'order';
  if (taus[0] !== 0 || taus[n - 1] !== m.T) return 'ends';
  const O = frameData(m);
  const kb = idxOfTime(taus, B.tb + 0.12);
  if (Math.abs(taus[kb] - (B.tb + 0.12)) > 0.15 || kb < 1) return 'bump:frame';
  const qk = O[kb].people[K], qk0 = O[kb - 1].people[K];
  const Qc = S.toWorld({ x: m.table.x, z: m.table.z, yaw: m.table.yaw }, B.corner[0], B.corner[1]);
  const dCorner = (q) => Math.hypot(q.floor[0] - Qc[0], q.floor[1] - Qc[1]);
  if (!qk.present || qk.mode !== 'walk' || !(dCorner(qk) <= FG.kNear)) return 'bump:near';
  if (!qk0.present || !(dCorner(qk0) >= FG.kBefore)) return 'bump:before';
  if (!qk.full || !qk0.full) return 'bump:frame-edge';
  if (!(S.joltAt(m, taus[kb]) >= 0.9) || !(S.joltAt(m, taus[kb - 1]) <= 0.01)) return 'bump:jolt';
  const tilt = taus.map((t) => Math.abs(S.vaseTilt(m, t)) / DEG);
  const rock = taus.map((t, k) => (t > B.tb + 0.2 && t < F.tw + F.W + 0.05 && tilt[k] >= FG.tiltRock ? k : -1)).filter((k) => k >= 0);
  if (!rock.length) return 'rock:none';
  if (taus.some((t, k) => t <= B.tb + 0.12 && tilt[k] > 1)) return 'rock:early';
  const kr = rock[0];
  if (kr !== kb + 1) return 'rock:not-next';
  const lying = taus.map((t) => t >= F.tLie).map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
  const falling = taus.map((t, k) => (t >= F.tw + F.W && t < F.tLie ? k : -1)).filter((k) => k >= 0);
  if (!lying.length || !falling.length) return 'fall:frames';
  const evt = taus.map((t, k) => (t >= F.tw - 1e-9 && t <= F.tLie + 0.5 ? k : -1)).filter((k) => k >= 0);
  for (const k of evt) {
    const o = O[k];
    if (G.nearestBy(o, 'gap') === K || G.nearestBy(o, 'cdist') === K) return 'wobble-nearest';
    if (o.people[K].present && o.people[D1].present && !(o.people[K].dVase3 > o.people[D1].dVase3 + 0.2)) return 'wobble-3d';
  }
  if (G.nearestBy(O[kr], 'gap') !== D1) return 'rock:d1';
  if (R0.D4 !== undefined) {
    const q4 = O[kr].people[R0.D4], qk1 = O[kr].people[K];
    if (!q4.present || !q4.inFrame || !(q4.dTable >= FG.d4Near[0] && q4.dTable <= FG.d4Near[1]) || !(q4.dTable < qk1.dTable)) return 'd4:near';
    for (const o of O) { const q = o.people[R0.D4]; if (q.present && q.dTable < 0.2) return 'd4:touch'; }
  }
  if (!(O[kr].people[K].present && O[kr].people[K].dTable >= FG.kAway)) return 'rock:k-away';
  let d1Over = Infinity, kGap = Infinity;
  O.forEach((o, k) => {
    if (taus[k] >= F.tw - 1.5 && taus[k] <= F.tLie && o.people[D1].present) d1Over = Math.min(d1Over, o.people[D1].gap);
    if (taus[k] <= F.tLie + 0.3 && o.people[K].present) kGap = Math.min(kGap, o.people[K].gap);
  });
  if (!(d1Over <= -3)) return 'd1-overlap';
  if (!(kGap >= 1)) return 'k-gap';
  for (let k = 1; k < n; k++) {
    for (let i = 0; i < m.people.length; i++) {
      const A = O[k - 1].people[i], Bq = O[k].people[i];
      if (!A.present || !Bq.present) continue;
      if (Math.hypot(A.floor[0] - Bq.floor[0], A.floor[1] - Bq.floor[1]) > FG.stepM * 1.1) return 'step';
    }
  }
  const last = O[n - 1];
  if (!last.people.every((q) => q.present && q.seated && q.full)) return 'last:seated';
  if (!S.vaseState(m, taus[n - 1]).fallen) return 'last:vase';
  if (O[kb].people.filter((q) => q.present && q.inFrame && !q.seated).length < 3) return 'standing';
  m.f16.kb = kb; m.f16.kr = kr;
  { const au = frameAudit(m, O); if (au.singleFrame) return 'single:' + au.hits.map((h) => h.replace(/^f\d+/, 'f')).join(','); }
  return '';
}

export function frameAudit(m, O = frameData(m)) {
  const taus = m.f16.taus, n = taus.length, K = m.roles.K, F = m.fall;
  const hits = [];
  const farthestBy = (o, key) => { let k = -1, b = -Infinity; o.people.forEach((p, i) => { if (p.present && p.inFrame && p[key] > b) { b = p[key]; k = i; } }); return k; };
  const kbump = m.f16.kb ?? -1;
  taus.forEach((t, k) => {
    const o = O[k];
    if (t >= F.tw - 1e-9 && t <= F.tLie + 0.5) {
      for (const key of ['gap', 'cdist']) if (G.nearestBy(o, key) === K) hits.push(`f${k + 1}:nearest-${key}`);
      let mg = Infinity, kk = -1; o.people.forEach((p, i) => { if (p.present && p.gap < mg) { mg = p.gap; kk = i; } });
      if (kk === K) hits.push(`f${k + 1}:most-overlap`);
    }
  });
  for (const key of ['gap', 'cdist', 'dVase3', 'dTable']) {
    if (G.nearestBy(O[0], key) === K) hits.push(`first:nearest-${key}`);
    if (G.nearestBy(O[n - 1], key) === K) hits.push(`last:nearest-${key}`);
    if (farthestBy(O[n - 1], key) === K) hits.push(`last:farthest-${key}`);
  }
  const nPeople = m.people.length;
  if (1 / (nPeople - 1) > FG.exclMax + 1e-9) hits.push('exclude-vase-man');
  const first = O[0].people.map((p, i) => (p.present ? i : -1)).filter((i) => i >= 0);
  if (first.length === 1 && first[0] === K) hits.push('first:only-one-present');
  return { singleFrame: hits.length > 0, hits, n, exclVase: 1 / (nPeople - 1) };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function generate(rng, maxAttempts = 24000) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0;
  const nP = FG.nPeople, r0 = mulberry32(G.mix32(key, 0x5eed0000)), plan = { kSeat: Math.floor(r0() * nP), kSitRank: Math.floor(r0() * nP) };
  for (const a of attempts('f16_who_knocked', key, maxAttempts)) {
    const pl = a < 900 ? { n: nP, kSeat: plan.kSeat } : { n: nP };
    const m = G.tryBuild(R(mulberry32(G.mix32(key, a))), pl);
    if (!m) continue;
    m.hold = 1; m.task = G.NAME; m.live = true;
    const taus = design(m);
    if (typeof taus === 'string') { fail('design:' + taus); continue; }
    m.f16 = { taus };
    const fp = frameProblem(m);
    if (fp) { fail('f:' + fp.split(':')[0]); continue; }
    const why = G.check(m, { rt: false });
    if (why) { fail('g:' + why); continue; }
    const pts = G.tapPoints(m);
    if (!pts) { fail('g:pts'); continue; }
    m.pts = pts; m.tap = { x: pts[m.answer][0], y: pts[m.answer][1], t: m.T };
    const why2 = G.check(m);
    if (why2) { fail('g:' + why2); continue; }
    m.plan = { ...pl, attempt: a }; m.key = key;
    return m;
  }
  throw new Error('f16_who_knocked: generator exhausted');
}
