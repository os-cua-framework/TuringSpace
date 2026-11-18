import { mulberry32, R } from '../core/rng.js';
import * as G from './_house_headcount_gen.js';
import * as W from './_house_headcount_scene.js';
import { checkLoose, overlapDoor } from './_f16_house_gen.js';
import { r3, mix32, attempts } from './_f16_frames.js';

export const FG = {
  nMax: 16,
  seen: 0.4,
  hidden: 0.08,
  doorNear: 1.9,
  stepM: 2.6,
  minGap: 0.45,
  endFar: 2.5,
};

export const CASTS = [
  { S: 1, IO: 2, B: 2, F: 1, w: 1 },
  { S: 2, IO: 1, B: 2, F: 1, w: 10 }, { S: 2, IO: 2, B: 1, F: 1, w: 8 }, { S: 2, IO: 2, B: 2, F: 0, w: 7 },
  { S: 3, IO: 1, B: 2, F: 0, w: 15 }, { S: 3, IO: 1, B: 1, F: 1, w: 10 },
  { S: 4, IO: 1, B: 1, F: 0, w: 8 }, { S: 4, IO: 1, B: 2, F: 0, w: 10 }, { S: 4, IO: 1, B: 1, F: 1, w: 8 }, { S: 4, IO: 1, B: 2, F: 1, w: 4 },
];
export const ANSWERS = [1, 2, 3, 4];
export function castOf(u1, u2) {
  const S = ANSWERS[Math.min(ANSWERS.length - 1, Math.floor(u1 * ANSWERS.length))], pool = CASTS.filter((q) => q.S === S);
  let u = u2 * pool.reduce((s, c) => s + c.w, 0), c = pool[0];
  for (const q of pool) { if (u < q.w) { c = q; break; } u -= q.w; }
  return { S: c.S, IO: c.IO, B: c.B, F: c.F, N: c.S + c.IO + c.B + c.F };
}

function windowsOf(m) {
  const tr = G.tracks(m), per = tr.per, dt = tr.dt, nF = tr.nF, H = m.house, zF = H.D / 2;
  const dev = G.doorEvents(m), bev = G.backEvents(m, tr), dr = G.doorRect(m);
  const fr = (f) => per.map((arr) => arr[f]);
  void fr;
  const dDoor = (i, f) => { const P = per[i][f].pose; return P ? Math.hypot(P.x - H.xd, P.z - zF) : Infinity; };
  const seen = (i, f) => per[i][f].frac >= FG.seen;
  const gone = (i, f) => per[i][f].frac === 0;
  const hid = (i, f) => per[i][f].pose && per[i][f].frac <= FG.hidden;
  const out = [];
  const win = (name, i, t0, t1, pred) => {
    const fs = [];
    for (let f = Math.max(1, Math.ceil(t0 / dt - 1e-9)); f <= Math.min(nF - 2, Math.floor(t1 / dt + 1e-9)); f++) if (pred(i, f)) fs.push(f);
    out.push({ name, who: i, fs });
  };
  m.people.forEach((p, i) => {
    const ev = (kind) => dev.find((e) => e.p === i && e.kind === kind)?.t;
    if (p.role === 'stay' || p.role === 'inout') {
      const tin = ev('in'), tout = ev('out');
      win(`${p.role}${i}:at-door`, i, tin - 1.7, tin - 0.3, (q, f) => seen(q, f) && dDoor(q, f) <= FG.doorNear);
      win(`${p.role}${i}:gone`, i, tin + 1.5, p.role === 'inout' ? tout - 0.6 : tin + 3.8, gone);
      if (p.role === 'inout') {
        win(`inout${i}:out-door`, i, tout - 0.1, tout + 1.3, (q, f) => seen(q, f) && dDoor(q, f) <= FG.doorNear);
        win(`inout${i}:walks-off`, i, tout + 1.8, tout + 4.8, (q, f) => seen(q, f) && dDoor(q, f) >= 2.5);
      }
    } else if (p.role === 'back') {
      const a = bev.find((e) => e.p === i && e.kind === 'hide')?.t, b = bev.find((e) => e.p === i && e.kind === 'show')?.t;
      win(`back${i}:before`, i, a - 2.4, a - 0.3, seen);
      win(`back${i}:hidden`, i, a + 0.5, b - 0.5, hid);
      win(`back${i}:after`, i, b + 0.3, b + 2.4, seen);
    } else if (p.role === 'front') {
      const tp = ev('pass');
      win(`front${i}:before`, i, tp - 2.6, tp - 0.7, seen);
      win(`front${i}:at-door-place`, i, tp - 2.0, tp + 2.0, (q, f) => seen(q, f) && per[q][f].box && overlapDoor(per[q][f].box, dr));
      win(`front${i}:after`, i, tp + 0.7, tp + 2.8, seen);
    }
  });
  return out;
}

export function design(m) {
  const tr = G.tracks(m), dt = tr.dt, nF = tr.nF, per = tr.per;
  const W0 = windowsOf(m);
  if (W0.some((w) => !w.fs.length)) return 'window:' + W0.find((w) => !w.fs.length).name;
  const chosen = [0];
  const apart = (f) => chosen.every((c) => Math.abs(c - f) * dt >= FG.minGap - 1e-9);
  let left = W0.slice();
  while (left.length) {
    const cnt = new Map();
    for (const w of left) for (const f of w.fs) if (apart(f)) cnt.set(f, (cnt.get(f) || 0) + 1);
    if (!cnt.size) return 'spacing';
    let best = -1, bc = -1;
    for (const [f, c] of cnt) if (c > bc || (c === bc && f < best)) { bc = c; best = f; }
    chosen.push(best);
    left = left.filter((w) => !w.fs.includes(best));
  }
  chosen.sort((a, b) => a - b);
  {
    const lastC = chosen[chosen.length - 1], S = m.answer, H = m.house, zF = H.D / 2;
    let end = -1;
    for (let f = Math.ceil(lastC + FG.minGap / dt - 1e-9); f <= nF - 1 && end < 0; f++) {
      const vis = m.people.map((_, i) => i).filter((i) => per[i][f].frac >= FG.seen);
      if (vis.length >= 1 && vis.length !== S && vis.every((i) => Math.hypot(per[i][f].pose.x - H.xd, per[i][f].pose.z - zF) >= FG.endFar)) end = f;
    }
    if (end < 0) return 'end';
    chosen.push(end);
  }
  const moves = (fa, fb) => {
    let mx = 0;
    m.people.forEach((p, i) => { if (per[i][fa].frac >= FG.seen && per[i][fb].frac >= FG.seen) { const A = per[i][fa].pose, B = per[i][fb].pose; mx = Math.max(mx, Math.hypot(A.x - B.x, A.z - B.z)); } });
    return mx;
  };
  const out = [chosen[0]];
  const rec = (a, b, depth) => {
    if (b - a < 2 * FG.minGap / dt || depth > 4 || moves(a, b) <= FG.stepM) return;
    const mid = Math.round((a + b) / 2);
    rec(a, mid, depth + 1); out.push(mid); rec(mid, b, depth + 1);
  };
  for (let k = 1; k < chosen.length; k++) { rec(chosen[k - 1], chosen[k], 0); out.push(chosen[k]); }
  const fsorted = [...new Set(out)].sort((a, b) => a - b);
  if (fsorted.length > FG.nMax) return 'n=' + fsorted.length;
  return fsorted.map((f) => r3(Math.min(m.T, f * dt)));
}

const idxOf = (tr, t) => Math.max(0, Math.min(tr.nF - 1, Math.round(t / tr.dt)));
export function frameProblem(m) {
  const f = m.f16;
  if (!f || !Array.isArray(f.taus)) return 'no-frames';
  const taus = f.taus, n = taus.length, tr = G.tracks(m), per = tr.per, H = m.house, zF = H.D / 2;
  if (n < 6 || n > FG.nMax) return 'n';
  for (let k = 1; k < n; k++) if (!(taus[k] > taus[k - 1])) return 'order';
  if (taus[0] !== 0 || taus[n - 1] > m.T) return 'ends';
  const fi = taus.map((t) => idxOf(tr, t));
  if (fi.some((x, k) => Math.abs(x * tr.dt - taus[k]) > 1e-6 && k < n - 1)) return 'grid';
  for (let i = 0; i < m.people.length; i++) { const Q = W.drawnAt(m.people[i], taus[0]); if (Q && !W.offPicture(m, Q.x, Q.z, m.people[i].k)) return 'ends:empty'; }
  { const vis = m.people.map((_, i) => i).filter((i) => per[i][fi[n - 1]].frac >= FG.seen);
    if (vis.length < 1) return 'end:nobody';
    if (vis.some((i) => Math.hypot(per[i][fi[n - 1]].pose.x - H.xd, per[i][fi[n - 1]].pose.z - zF) < FG.endFar - 1e-9)) return 'end:door'; }
  for (const w of windowsOf(m)) if (!fi.some((x) => w.fs.includes(x))) return 'event:' + w.name;
  for (let k = 1; k < n; k++) for (let i = 0; i < m.people.length; i++) {
    const a = per[i][fi[k - 1]], b = per[i][fi[k]];
    if (a.frac >= FG.seen && b.frac >= FG.seen && Math.hypot(a.pose.x - b.pose.x, a.pose.z - b.pose.z) > FG.stepM * 1.1) return 'step';
  }
  const dDoor = (i, k) => { const P = per[i][fi[k]].pose; return Math.hypot(P.x - H.xd, P.z - zF); };
  const lastSeen = (i) => { for (let k = n - 1; k >= 0; k--) if (per[i][fi[k]].frac >= FG.seen) return k; return -1; };
  let honest = 0;
  m.people.forEach((p, i) => { const ls = lastSeen(i); if (ls >= 0 && dDoor(i, ls) <= FG.doorNear) honest++; });
  if (honest !== m.answer) return 'honest';
  const atDoor = m.people.filter((_, i) => fi.some((x, k) => per[i][x].frac >= FG.seen && dDoor(i, k) <= FG.doorNear)).length;
  const everSeen = m.people.filter((_, i) => lastSeen(i) >= 0).length;
  if (atDoor === m.answer || everSeen === m.answer) return 'shortcut';
  const entered = m.people.filter((p) => p.role === 'stay' || p.role === 'inout').length;
  const outLast = m.people.filter((_, i) => per[i][fi[n - 1]].frac >= FG.seen).length;
  if (entered === m.answer) return 'shortcut:entered';
  if (m.people.length - outLast === m.answer) return 'shortcut:total-minus-outside';
  { const au = frameAudit(m); if (au.singleFrame) return 'single:' + au.hits.join(','); }
  return '';
}

export function frameAudit(m) {
  const tr = G.tracks(m), per = tr.per, n = m.f16.taus.length, H = m.house, zF = H.D / 2;
  const fi = m.f16.taus.map((t) => idxOf(tr, t)), S = m.answer;
  const cnt = fi.map((x) => m.people.filter((_, i) => per[i][x].frac >= FG.seen).length);
  const near = fi.map((x) => m.people.filter((_, i) => per[i][x].frac >= FG.seen && Math.hypot(per[i][x].pose.x - H.xd, per[i][x].pose.z - zF) <= FG.doorNear).length);
  const hits = [];
  if (Math.max(...cnt) === S) hits.push('max-in-view');
  if (cnt[0] === S) hits.push('first'); if (cnt[n - 1] === S) hits.push('last');
  return { singleFrame: hits.length > 0, hits, n, counts: cnt, blind: cnt.filter((c) => c === S).length };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function setupOf(key) {
  const r0 = mulberry32(mix32(key, 0x5eed0000)), hold = r3(0.8 + 0.7 * r0()), u = (c) => mix32(mix32(key, c), 0x1a2b3c4d) / 4294967296;
  return { hold, C: castOf(u(0xa5), u(0xc7)) };
}
export function buildAt(key, a, { hold, C }) {
  const m = G.tryBuild(R(mulberry32(mix32(key, a))), C);
  if (!m) return null;
  m.hold = hold; m.dt = 0.5;
  const why = checkLoose(m);
  if (why !== null) return fail('g:' + why);
  const taus = design(m);
  if (typeof taus === 'string') return fail('design:' + taus.replace(/\d+:/, ':'));
  m.f16 = { taus };
  const fp = frameProblem(m);
  if (fp) return fail('f:' + fp.replace(/\d+:/, ':'));
  m.attempt = a; m.key = key;
  return m;
}
export function generate(rng, maxAttempts = 6000) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0, S = setupOf(key);
  for (const a of attempts('f16_house_headcount', key, maxAttempts)) {
    const m = buildAt(key, a, S);
    if (m) return m;
  }
  throw new Error('f16_house_headcount: generator exhausted');
}
