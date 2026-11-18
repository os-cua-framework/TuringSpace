import * as W from './_mutual_gaze_pick_scene.js';
import * as L from './_mutual_gaze_pick_layout.js';

const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const toYP = (v) => ({ yaw: W.yawOf(v), pitch: -Math.asin(Math.max(-1, Math.min(1, v[1]))) / DEG });
export const GATE = {
  look: 10, away: 25,
  mutualLen: [1.5, 2.0],
  mutualBook: [1.0, 1.45],
  mutualGap: 4.0, mutualGapBook: [4.6, 5.6], mutualFrom: 7.2, closeFrom: 6.2, seamGap: 2.0, rampMax: 1.6,
  ansOff: [4.5, 6.5], ansIn: 2.0,
  ansOffLoose: [5.5, 7.0],
  sepMin6: 26,
  sepMin: 30,
  bScreen: 4, bErr: 32, bDepth: 0.4, bBend: [7.0, 8.8], bJit: 2.5,
  bWin: [0, 6.0], bStartMax: 1.0, bLen: [5.0, 6.0],
  sFloor: 6, freeScreen: 9,
  cBody: 6, cHeadAway: 35, cLen: [3.0, 4.0],
  aLen: [4.0, 4.8], aGap: [1.1, 2.0], aMid: 3.5,
  neck: 75, ansBodyOff: 35, ansBodyAll: 20, seamHold: 0.3,
  visHead: 0.75, headPx: 18, edge: 4, T: [17.5, 20], hold: [0.8, 1.5], grid: 0.02,
};
const cmod = (t, T) => (((t % T) + T) % T);
const wrapD = W.wrap180;
const gapMin = (dy) => 0.55 + Math.abs(dy) / 150;
const gapFast = (dy) => 0.25 + Math.abs(dy) / 180;

function scrDir(cam, c, f, q) {
  const a = cam.project(c[0], c[1], c[2]), b = cam.project(c[0] + f[0] * 0.3, c[1] + f[1] * 0.3, c[2] + f[2] * 0.3), t = cam.project(q[0], q[1], q[2]);
  const u = [b.x - a.x, b.y - a.y], v = [t.x - a.x, t.y - a.y];
  const d = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
}
export function series(m, dt = GATE.grid, full = true) {
  const n = m.people.length, K = Math.round(m.T / dt), ts = [], H = [];
  for (let k = 0; k < K; k++) { const t = k * dt; ts.push(t); H.push(W.headsAt(m, t)); }
  const err = [];
  for (let i = 0; i < n; i++) { err.push([]); for (let j = 0; j < n; j++) err[i].push(new Float32Array(K)); }
  for (let k = 0; k < K; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) err[i][j][k] = W.gazeErr(H[k], i, j);
  const S = { ts, H, err, body: null, scr: null, K, dt };
  return full ? completeSeries(m, S) : S;
}
export function completeSeries(m, S) {
  if (S.body) return S;
  const n = m.people.length, K = S.K, H = S.H, cam = W.camOf(m), body = [], scr = [];
  for (let i = 0; i < n; i++) { body.push([]); scr.push([]); for (let j = 0; j < n; j++) { body[i].push(new Float32Array(K)); scr[i].push(new Float32Array(K)); } }
  const ax = new Float64Array(n), ay = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n);
  for (let k = 0; k < K; k++) {
    const Hk = H[k];
    for (let i = 0; i < n; i++) {
      const c = Hk[i].c, f = Hk[i].f, a = cam.project(c[0], c[1], c[2]), b = cam.project(c[0] + f[0] * 0.3, c[1] + f[1] * 0.3, c[2] + f[2] * 0.3);
      ax[i] = a.x; ay[i] = a.y; ux[i] = b.x - a.x; uy[i] = b.y - a.y;
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) {
      body[i][j][k] = W.bodyErr(m, Hk, i, j);
      const vx = ax[j] - ax[i], vy = ay[j] - ay[i];
      const d = (ux[i] * vx + uy[i] * vy) / ((Math.hypot(ux[i], uy[i]) * Math.hypot(vx, vy)) || 1);
      scr[i][j][k] = Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
    }
  }
  S.body = body; S.scr = scr;
  return S;
}
export let _lastSeries = null;
export function takeSeries(m) { const S = _lastSeries && _lastSeries.m === m ? _lastSeries.S : null; _lastSeries = null; return S; }
export function runs(flags) {
  const K = flags.length, out = [];
  if (flags.every(Boolean)) return [{ s: 0, e: K, len: K }];
  let k0 = flags.findIndex((f) => !f);
  for (let a = 0; a < K; a++) {
    const k = (k0 + a) % K;
    if (flags[k] && !flags[(k - 1 + K) % K]) { let e = 0; while (flags[(k + e) % K]) e++; out.push({ s: k, e: k + e, len: e }); }
  }
  return out;
}
export function screenErr(cam, H, i, j) { return scrDir(cam, H[i].c, H[i].f, H[j].c); }
export const pairKey = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
export function pairsOf(n) { const out = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]); return out; }
export function mutualRuns(m, S) {
  const [A, B] = m.answer;
  return runs(Array.from({ length: S.K }, (_, k) => Math.max(S.err[A][B][k], S.err[B][A][k]) <= GATE.look)).sort((p, q) => p.s - q.s);
}
export function bOnFlags(m, S) {
  const { c, d, e } = m.roles.b, g = GATE;
  return Array.from({ length: S.K }, (_, k) => S.err[d][c][k] <= g.look && S.err[c][e][k] <= g.look && S.scr[c][d][k] <= g.bScreen && S.scr[d][c][k] <= g.bScreen);
}

function solveB(m, c, d, e, jd, bendTo) {
  const P = m.people, eye = W.camBasis(m).eye, ce = W.headLevel(P[e]);
  let pc = W.aimAt(P[c], ce), pd = W.aimAt(P[d], W.headLevel(P[c])), psiE = 0;
  for (let it = 0; it < 6; it++) {
    const cc = W.headCentre(P[c], pc.yaw, pc.pitch), cd = W.headCentre(P[d], pd.yaw, pd.pitch);
    let nn = norm3(cross3(sub3(cc, eye), sub3(cd, eye)));
    const dc = norm3(sub3(cc, cd)), tD = norm3(cross3(nn, dc));
    pd = toYP(add3(scl3(dc, Math.cos(jd * DEG)), scl3(tD, Math.sin(jd * DEG))));
    const ec = norm3(sub3(ce, cc)); let s = dot3(ec, nn); if (s < 0) { nn = scl3(nn, -1); s = -s; }
    psiE = Math.asin(Math.min(1, s)) / DEG;
    const ein = norm3(sub3(ec, scl3(nn, s))), psiG = Math.max(0, psiE - bendTo) * DEG;
    pc = toYP(add3(scl3(ein, Math.cos(psiG)), scl3(nn, Math.sin(psiG))));
  }
  return { c: { yaw: r2(pc.yaw), pitch: r2(pc.pitch) }, d: { yaw: r2(pd.yaw), pitch: r2(pd.pitch) }, psiE };
}
function solveMutual(m, a, b, offA, offB) {
  const P = m.people, eye = W.camBasis(m).eye;
  let pa = W.aimAt(P[a], W.headLevel(P[b])), pb = W.aimAt(P[b], W.headLevel(P[a]));
  const dirOf = (from, to, nn, off) => {
    const d = norm3(sub3(to, from)), t = norm3(cross3(nn, d)), o = off[0] * DEG, i = off[1] * DEG;
    return toYP(norm3(add3(scl3(add3(scl3(d, Math.cos(i)), scl3(t, Math.sin(i))), Math.cos(o)), scl3(nn, Math.sin(o)))));
  };
  for (let it = 0; it < 6; it++) {
    const ca = W.headCentre(P[a], pa.yaw, pa.pitch), cb = W.headCentre(P[b], pb.yaw, pb.pitch);
    const nn = norm3(cross3(sub3(ca, eye), sub3(cb, eye)));
    pa = dirOf(ca, cb, nn, offA); pb = dirOf(cb, ca, nn, offB);
  }
  return { a: { yaw: r2(pa.yaw), pitch: r2(pa.pitch) }, b: { yaw: r2(pb.yaw), pitch: r2(pb.pitch) } };
}

export const _genStats = {};
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };

export function tryBuild(rng, n, dis = false, o = {}) {
  const base = L.layout(rng, n, dis);
  if (!base) return fail('layout');
  for (let k = 0; k < (o.tries ?? 8); k++) {
    const m = schedule(rng, structuredClone(base), dis);
    if (!m) continue;
    if (o.pin !== undefined) { if (k === o.pin) { m.sched = k; return m; } continue; }
    if (!o.accept || o.accept(m)) { if (o.accept) m.sched = k; return m; }
  }
  return null;
}
function schedule(rng, m, dis = false) {
  const n = m.people.length;
  const U = rng.uniform, pick = (xs) => xs[Math.floor(rng.raw() * xs.length)];
  const T = r3(U(...GATE.T));
  m.T = T;
  const P = m.people, cam = W.camOf(m), bas = W.camBasis(m), C = P.map(W.headLevel);
  const dir = P.map((_, i) => P.map((_, j) => (i === j ? null : sub3(C[j], C[i]))));
  const sepMin = n >= 6 ? GATE.sepMin6 : GATE.sepMin;
  const usable = P.map((_, i) => P.map((_, j) => i !== j && P.every((_, k) => k === i || k === j || W.angBetween(dir[i][j], dir[i][k]) >= sepMin)));
  const aim = (i, j) => W.aimAt(P[i], C[j]);
  const scrPose = (i, yaw, pitch) => { const c = W.headCentre(P[i], yaw, pitch), { hf } = W.headAxes(yaw, pitch); return P.map((_, j) => (j === i ? Infinity : scrDir(cam, c, hf, C[j]))); };
  const pairs = pairsOf(n), same = (p, q) => (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]);
  const both = pairs.filter(([i, j]) => usable[i][j] && usable[j][i]);
  const [tc, td, te] = m.trip;
  if (!usable[td][tc] || !usable[tc][te]) return fail('trapB-usable');
  const bp = solveB(m, tc, td, te, U(-GATE.bJit, GATE.bJit), U(...GATE.bBend));
  const ansC = both.filter((p) => !same(p, [tc, td]) && !same(p, [tc, te]) && (dis ? !p.includes(tc) && !p.includes(td) && L.staggeredLoose(bas, C[p[0]], C[p[1]]) : L.staggered(bas, C[p[0]], C[p[1]])));
  if (!ansC.length) return fail('ans-pair');
  const st = (p) => L.stagger(bas, C[p[0]], C[p[1]]);
  const mostStag = pairs.reduce((a2, p2) => (st(p2).beta < st(a2).beta ? p2 : a2)), mostDz = pairs.reduce((a2, p2) => (st(p2).dz > st(a2).dz ? p2 : a2));
  const near3 = pairs.reduce((a2, p2) => (Math.hypot(C[p2[0]][0] - C[p2[1]][0], C[p2[0]][2] - C[p2[1]][2]) < Math.hypot(C[a2[0]][0] - C[a2[1]][0], C[a2[0]][2] - C[a2[1]][2]) ? p2 : a2));
  const sd = (p2) => { const u = W.project(cam, C[p2[0]]), v = W.project(cam, C[p2[1]]); return Math.hypot(u[0] - v[0], u[1] - v[1]); };
  const nearS = pairs.reduce((a2, p2) => (sd(p2) < sd(a2) ? p2 : a2));
  const plain = ansC.filter((p2) => ![mostStag, mostDz, near3, nearS].some((q) => same(p2, q)));
  const ans = plain.length && rng.raw() < 0.85 ? pick(plain) : pick(ansC);
  const cOrd = [];
  for (const [i, j] of cands(pairs, [ans, [tc, td]])) { if (usable[j][i]) cOrd.push([i, j]); if (usable[i][j]) cOrd.push([j, i]); }
  if (!cOrd.length) return fail('trapC-pair');
  let tx = -1, ty = -1, tp = -1, tq = -1;
  function cands(list, avoid) { return list.filter((p) => !avoid.some((q) => same(p, q))); }
  const book = P.map(() => []);
  const conflicts = (i, s, d, yaw) => book[i].some((h) => {
    const g = Number.isNaN(yaw) || Number.isNaN(h.yaw) ? 1.3 : gapMin(wrapD(h.yaw - yaw));
    return cmod(s - h.s, T) < h.d + g || cmod(h.s - s, T) < d + g;
  });
  const seamBad = (s, d) => {
    const a = cmod(s, T), e = a + d;
    if (e > T + 0.5 && a < T - 0.5) return false;
    const ee = cmod(e, T);
    return a < 0.6 || a > T - 0.6 || ee < 0.6 || ee > T - 0.6;
  };
  const lookYaw = (i, j) => { const a2 = aim(i, j); return { yaw: r2(a2.yaw + U(-2.5, 2.5)), pitch: r2(a2.pitch + U(-2, 2)) }; };
  const addLook = (i, s, d, yp, tgt, role, extra = {}) => {
    if (conflicts(i, s, d, yp.yaw) || (!/^b:/.test(role) && seamBad(s, d))) return null;
    const h = { s: cmod(s, T), d, yaw: yp.yaw, pitch: yp.pitch, tgt, role, ...extra }; book[i].push(h); return h;
  };
  const tryAdd = (i, s, d, tgt, role) => addLook(i, s, d, tgt >= 0 ? lookYaw(i, tgt) : { yaw: NaN, pitch: 0 }, tgt, role);
  const undo = (i, h) => { if (h) book[i].splice(book[i].indexOf(h), 1); };
  const ev = {};
  {
    const seamD = rng.raw() < 0.5, sIn = U(0.72, 0.86), sCov = -U(0.6, 1.2), eD = U(5.72, 5.92), eC = U(5.72, 5.92);
    const [sD, sC] = seamD ? [sCov, sIn] : [sIn, sCov];
    const h1 = addLook(td, sD, eD - sD, bp.d, tc, 'b:D->C', seamD ? {} : { fastIn: true });
    const h2 = h1 && addLook(tc, sC, eC - sC, bp.c, te, 'b:C->E', seamD ? { fastIn: true } : {});
    if (!h2) return fail('place-b');
    ev.b = { c: tc, d: td, e: te, seamSide: seamD ? 'D' : 'C', s: r3(sIn), len: r3(Math.min(eD, eC) - sIn), psiE: r2(bp.psiE) };
  }
  {
    const Lo = [U(...GATE.mutualBook), U(...GATE.mutualBook)], lead = [U(0.2, 0.5), U(0.2, 0.5)], tail = [U(0.15, 0.4), U(0.15, 0.4)];
    const lt = [rng.raw() < 0.5, rng.raw() < 0.5], gap = U(...GATE.mutualGapBook);
    const span = Lo[0] + gap + Lo[1], hi = T - GATE.seamGap - 0.25 - span;
    let ok = false;
    const starts = rng.shuffle(Array.from({ length: Math.max(0, Math.floor((hi - GATE.mutualFrom) / 0.2) + 1) }, (_, k) => GATE.mutualFrom + 0.2 * k + U(0, 0.2)).filter((v) => v <= hi));
    for (const o0 of starts) {
      if (ok) break;
      const o = [o0, o0 + Lo[0] + gap];
      const hs = [];
      for (let k = 0; k < 2 && hs.length === 2 * k; k++) {
        const [ta, tb] = rng.raw() < 0.5 ? ans : [ans[1], ans[0]];
        const off = () => [(rng.raw() < 0.5 ? -1 : 1) * U(...(L.staggered(bas, C[ans[0]], C[ans[1]]) ? GATE.ansOff : GATE.ansOffLoose)), U(-GATE.ansIn, GATE.ansIn)];
        const sol = solveMutual(m, ta, tb, off(), off());
        const h1 = addLook(ta, o[k] - lead[k], lead[k] + Lo[k] + (lt[k] ? tail[k] : 0), sol.a, tb, `m${k + 1}:lead`);
        const h2 = h1 && addLook(tb, o[k], Lo[k] + (lt[k] ? 0 : tail[k]), sol.b, ta, `m${k + 1}:follow`);
        if (h1) hs.push([ta, h1]); if (h2) hs.push([tb, h2]);
      }
      if (hs.length === 4) { ok = true; ev.m = o.map((s, k) => ({ s: r3(s), len: r3(Lo[k]) })); }
      else for (const [i, h] of hs) undo(i, h);
    }
    if (!ok) return fail('place-m');
  }
  {
    const placeC = (x, y, center) => {
      const Lc = U(...GATE.cLen), c0 = center - Lc / 2;
      const sy = c0 - U(0, 0.3), dy = Lc + (c0 - sy) + U(0, 0.3), sx = c0 - U(0.9, 1.4), dx = Lc + (c0 - sx) + U(0.6, 1.0);
      const h1 = tryAdd(y, sy, dy, x, 'c:Y->X');
      if (!h1) return false;
      const h2 = tryAdd(x, sx, dx, -1, 'c:X-away');
      if (!h2) { undo(y, h1); return false; }
      const w0 = Math.min(sx, sy) - 0.6, w1 = Math.max(sx + dx, sy + dy) + 0.6;
      ev.c = { x, y, s: r3(cmod(c0, T)), len: r3(Lc), w: [cmod(w0, T), w1 - w0] };
      return true;
    };
    const grid = rng.shuffle(Array.from({ length: Math.floor(T / 0.25) }, (_, k) => 0.25 * k + U(0, 0.25)));
    for (const [x, y] of rng.shuffle(cOrd)) {
      if (grid.some((c0) => placeC(x, y, c0))) { tx = x; ty = y; break; }
    }
    if (tx < 0) return fail('place-c');
  }
  {
    const aC = cands(both, [ans, [tc, td], [tx, ty]]);
    const cand = rng.shuffle(aC.flatMap((q) => [q, [q[1], q[0]]])).concat(rng.shuffle([[td, tc], [ty, tx]].filter(([p2, q2]) => usable[q2][p2])));
    if (!cand.length) return fail('trapA-pair');
    const aFirst = rng.raw() < 0.5;
    const grid = rng.shuffle(Array.from({ length: Math.floor(T / 0.25) }, (_, k) => 0.25 * k + U(0, 0.25)));
    const order = aFirst ? grid.filter((v) => v < ev.m[0].s).concat(grid.filter((v) => v >= ev.m[0].s)) : grid;
    const placeA = (pp, qq, s1in) => {
      const prior = book[pp].find((h) => h.tgt === qq);
      const d1 = prior ? prior.d : U(...GATE.aLen), d2 = U(...GATE.aLen), g = U(...GATE.aGap), qFirst = !prior && rng.raw() < 0.5;
      const s1 = prior ? prior.s : s1in;
      const s2 = qFirst || (prior && rng.raw() < 0.5) ? s1 - g - d2 : s1 + d1 + g;
      const g12 = cmod(s2 - (s1 + d1), T), g21 = cmod(s1 - (s2 + d2), T);
      if (Math.min(g12, g21) < GATE.aGap[0] || Math.min(g12, g21) > GATE.aGap[1] + 0.4) return false;
      const md = cmod(s2 + d2 / 2 - s1 - d1 / 2, T);
      if (Math.min(md, T - md) < GATE.aMid) return false;
      const h1 = prior || tryAdd(pp, s1, d1, qq, 'a:P->Q');
      if (!h1) return false;
      const h2 = tryAdd(qq, s2, d2, pp, 'a:Q->P');
      if (!h2) { if (!prior) undo(pp, h1); return false; }
      if (prior) prior.role += '+a:P->Q';
      const lin = (st0, d) => { const x = cmod(st0, T); return x + d > T ? x + d - T : x + d; };
      const end = Math.max(lin(s1, d1), lin(s2, d2));
      ev.a = { p: pp, q: qq, s1: r3(cmod(s1, T)), d1: r3(d1), s2: r3(cmod(s2, T)), d2: r3(d2), reuse: !!prior, first: !prior && end < ev.m[0].s && cmod(s1, T) < ev.m[0].s && cmod(s2, T) < ev.m[0].s };
      return true;
    };
    for (const [pp, qq] of cand) {
      const prior = book[pp].find((h) => h.tgt === qq);
      if (prior ? Array.from({ length: 6 }).some(() => placeA(pp, qq, 0)) : order.some((s1) => placeA(pp, qq, s1))) { tp = pp; tq = qq; break; }
    }
    if (tp < 0) return fail('place-a');
  }
  const off = rng.raw() < 0.5 ? ans[0] : ans[1], offTo = off === ans[0] ? ans[1] : ans[0];
  const avoids = ev.m.map((w) => ({ s: cmod(w.s - 1.1, T), e: cmod(w.s - 1.1, T) + w.len + 2.6, yaw: aim(off, offTo).yaw }));
  const centre = [P.reduce((s2, q) => s2 + q.x, 0) / n, 0, P.reduce((s2, q) => s2 + q.z, 0) / n];
  for (let i = 0; i < n; i++) {
    const items = book[i].map((h) => ({ s: h.s, e: h.s + h.d, yaw: h.yaw }));
    if (ev.c && (i === tx || i === ty)) items.push({ s: ev.c.w[0], e: ev.c.w[0] + ev.c.w[1], fixed: r2(aim(i, i === tx ? ty : tx).yaw + U(-3, 3)) });
    const body = buildBody(i, items, i === off ? avoids : []);
    if (!body) return fail('body');
    P[i].body = body;
  }
  function buildBody(i, items, avoid) {
    const it = items.map((q) => (q.e > T ? { ...q, s: q.s - T, e: q.e - T } : q)).sort((p2, q2) => p2.s - q2.s);
    const arcOf = (q) => (q.fixed != null ? [q.fixed, 0] : Number.isNaN(q.yaw) ? null : [q.yaw, 66]);
    const meet = (g, arc) => {
      if (!arc) return [g.lo, g.hi];
      if (!Number.isFinite(g.lo)) return [arc[0] - arc[1], arc[0] + arc[1]];
      const y = g.ref + wrapD(arc[0] - g.ref);
      return [Math.max(g.lo, y - arc[1]), Math.min(g.hi, y + arc[1])];
    };
    const groups = [];
    for (const q of it) {
      const g = groups[groups.length - 1], arc = arcOf(q);
      if (g) { const [lo, hi] = meet(g, arc); if (lo <= hi) { if (!Number.isFinite(g.lo) && arc) g.ref = arc[0]; g.lo = lo; g.hi = hi; g.e = Math.max(g.e, q.e); continue; } }
      groups.push({ s: q.s, e: q.e, ref: arc ? arc[0] : 0, lo: arc ? arc[0] - arc[1] : -Infinity, hi: arc ? arc[0] + arc[1] : Infinity });
    }
    if (!groups.length) groups.push({ s: 0, e: 0, ref: 0, lo: -Infinity, hi: Infinity });
    if (groups.length > 1) {
      const g0 = groups[0], gl = groups[groups.length - 1];
      const [lo, hi] = Number.isFinite(gl.lo) ? meet(g0, [gl.ref + (gl.lo + gl.hi) / 2 - gl.ref, (gl.hi - gl.lo) / 2]) : [g0.lo, g0.hi];
      if (lo <= hi && cmod(g0.s - gl.e, T) < 1.3 + 0.6) { g0.lo = lo; g0.hi = hi; if (!Number.isFinite(g0.lo)) g0.ref = gl.ref; g0.s = gl.s - T; groups.pop(); }
    }
    const G = groups.length, sw = [];
    if (G > 1) for (let k = 0; k < G; k++) {
      const g0 = groups[k], g1 = groups[(k + 1) % G];
      const gs = g0.e - 0.45, ge = (k + 1 < G ? g1.s : g1.s + T) + 0.45;
      const segs = [];
      for (const [c0, c1] of [[-Infinity, -0.3], [0.3, T - 0.3], [T + 0.3, Infinity]]) { const x0 = Math.max(gs, c0), x1 = Math.min(ge, c1); if (x1 - x0 >= 1.1) segs.push([x0, x1]); }
      if (!segs.length) { _genStats['body:swivel'] = (_genStats['body:swivel'] || 0) + 1; return null; }
      const [x0, x1] = segs[Math.floor(rng.raw() * segs.length)], d = Math.min(U(1.3, 2.0), x1 - x0);
      sw.push({ s: U(x0, x1 - d), d });
    }
    const pref = W.yawOf(sub3(centre, [P[i].x, 0, P[i].z]));
    const holds = [];
    for (let k = 0; k < G; k++) {
      const g = groups[k];
      const s0 = G > 1 ? sw[(k - 1 + G) % G].s + sw[(k - 1 + G) % G].d - (k === 0 ? T : 0) : 0;
      const e0 = G > 1 ? sw[k].s : T;
      let y = null;
      for (let a3 = 0; a3 < 40 && y == null; a3++) {
        let c;
        if (Number.isFinite(g.lo)) { const pr = g.ref + wrapD(pref - g.ref); c = a3 < 15 ? Math.max(g.lo, Math.min(g.hi, pr + U(-30, 30))) : U(g.lo, g.hi); }
        else c = pref + U(-60, 60);
        if (avoid.some((av) => overlapsHold(av, s0, e0) && Math.abs(wrapD(c - av.yaw)) < GATE.ansBodyOff + 2)) continue;
        y = c;
      }
      if (y == null) { _genStats['body:yaw'] = (_genStats['body:yaw'] || 0) + 1; return null; }
      holds.push({ t0: r3(cmod(s0, T)), d: r3(G > 1 ? e0 - s0 : T - 0.001), yaw: r2(wrapD(y)) });
    }
    return holds.sort((p2, q2) => p2.t0 - q2.t0);
  }
  function overlapsHold(a2, s0, e0) { return a2.s < e0 && a2.e > s0 || a2.s - T < e0 && a2.e - T > s0 || a2.s + T < e0 && a2.e + T > s0; }
  const clearOf = (i, yaw, pitch) => {
    const { hf } = W.headAxes(yaw, pitch);
    if (P.some((_, j) => j !== i && W.angBetween(hf, sub3(C[j], C[i])) < sepMin + 2)) return false;
    return scrPose(i, yaw, pitch).every((v) => v >= GATE.freeScreen);
  };
  if (ev.c) {
    const g = book[tx].find((q) => q.role === 'c:X-away'), bx = W.holdsAt(P[tx].body, cmod(g.s + g.d / 2, T), T).yaw;
    let ok = false;
    const nb = book[tx].filter((h) => h !== g && !Number.isNaN(h.yaw));
    for (let a2 = 0; a2 < 80 && !ok; a2++) {
      const yaw = bx + (rng.raw() < 0.5 ? -1 : 1) * U(38, 62), pitch = U(-4, n >= 6 ? 34 : 22);
      if (nb.some((h) => { const gp = Math.min(cmod(g.s - (h.s + h.d), T), cmod(h.s - (g.s + g.d), T)); return gp < gapMin(wrapD(h.yaw - yaw)); })) continue;
      if (!clearOf(tx, yaw, pitch)) continue;
      g.yaw = r2(yaw); g.pitch = r2(pitch); ok = true;
    }
    if (!ok) return fail('c-away');
  }
  const bodyAt = (i, t) => W.holdsAt(P[i].body, cmod(t, T), T).yaw;
  const freeLook = (i, t0, d, prev, tIn, next, tOut, gIn = gapMin, gOut = gapMin) => {
    for (let a2 = 0; a2 < 60; a2++) {
      const bm = bodyAt(i, t0 + d / 2), down = rng.raw() < 0.5;
      const base = prev != null && rng.raw() < 0.5 ? prev : next != null && rng.raw() < 0.5 ? next : bm;
      const yaw = base + U(-50, 50), pitch = down ? U(20, 36) : U(-6, 8);
      if (Math.abs(wrapD(yaw - bm)) > 55) continue;
      if (prev != null && gIn(wrapD(yaw - prev)) > tIn) continue;
      if (next != null && gOut(wrapD(next - yaw)) > tOut) continue;
      let okB = true;
      for (let u = 0; u <= 1.0001; u += 0.25) if (Math.abs(wrapD(yaw - bodyAt(i, t0 + u * d))) > 62) okB = false;
      if (!okB || !clearOf(i, yaw, pitch)) continue;
      return { s: cmod(t0, T), d, yaw: r2(wrapD(yaw)), pitch: r2(pitch), tgt: -1, role: 'free' };
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    let B = book[i].slice().sort((p2, q2) => p2.s - q2.s);
    const coversSeam = (h) => cmod(-h.s, T) >= GATE.seamHold && cmod(-h.s, T) <= h.d - GATE.seamHold;
    if (!B.some(coversSeam)) {
      const after = B.slice().sort((p2, q2) => cmod(p2.s, T) - cmod(q2.s, T))[0];
      const before = B.slice().sort((p2, q2) => cmod(-(p2.s + p2.d), T) - cmod(-(q2.s + q2.d), T))[0];
      const fast = !!(after && after.fastIn && cmod(after.s, T) < 1.2);
      const gB = before ? cmod(-(before.s + before.d), T) : 9, gA = after ? cmod(after.s, T) : 9;
      const lo = Math.min(U(0.5, 1.0), gB - 0.65), hi = fast ? Math.min(U(0.32, 0.38), gA - 0.3) : Math.min(U(0.5, 1.0), gA - 0.65);
      if (lo < 0.32 || hi < 0.32) return fail('seam-free');
      const tIn = gB - lo, tOut = gA - hi;
      const f = freeLook(i, -lo, lo + hi, before ? before.yaw : null, tIn, after ? after.yaw : null, tOut, gapMin, fast ? gapFast : gapMin);
      if (!f) return fail('seam-free2');
      B.push(f); B.sort((p2, q2) => p2.s - q2.s);
    }
    const out = [];
    for (let k = 0; k < B.length; k++) {
      const a2 = B[k], b2 = B[(k + 1) % B.length];
      out.push(a2);
      let gs = a2.s + a2.d, gap = B.length === 1 ? T - a2.d : cmod(b2.s - gs, T), prevYaw = a2.yaw;
      for (let guard = 0; guard < 12; guard++) {
        const t1 = U(0.7, 1.1), tl = U(0.7, 1.1), room = gap - t1 - tl;
        if (room < 1.0) break;
        let d = Math.min(U(1.3, 2.6), room);
        if (room - d < 2.6) d = room;
        let f = freeLook(i, gs + t1, d, prevYaw, t1, b2.yaw, gap - t1 - d);
        if (!f && d < room) { d = room; f = freeLook(i, gs + t1, d, prevYaw, t1, b2.yaw, gap - t1 - d); }
        if (!f) break;
        out.push(f); prevYaw = f.yaw; gs += t1 + d; gap -= t1 + d;
      }
    }
    out.sort((p2, q2) => p2.s - q2.s);
    for (let k = 0; k < out.length; k++) {
      const a2 = out[k], b2 = out[(k + 1) % out.length], gap = out.length === 1 ? T - a2.d : cmod(b2.s - (a2.s + a2.d), T);
      if (gap < (b2.fastIn ? gapFast : gapMin)(wrapD(b2.yaw - a2.yaw))) return fail('gap');
    }
    P[i].gaze = out.map((h) => ({ t0: r3(h.s), d: r3(h.d), yaw: h.yaw, pitch: h.pitch, tgt: h.tgt, role: h.role }));
  }
  m.answer = [Math.min(...ans), Math.max(...ans)];
  m.roles = { m: ev.m, a: ev.a, b: ev.b, c: ev.c, seam: 'b', off };
  const pre = quickCheck(m);
  if (pre) return fail(pre);
  const S = series(m, GATE.grid, false);
  const why = checkTimeline(m, S);
  if (why) return fail(why);
  _lastSeries = { m, S };
  return m;
}

function quickCheck(m) {
  const n = m.people.length, T = m.T, [A, B] = m.answer, dt = 0.1, K = Math.round(T / dt);
  const mut = new Uint8Array(K);
  for (let k = 0; k < K; k++) {
    const H = W.headsAt(m, k * dt);
    for (const [i, j] of pairsOf(n)) {
      const e = Math.max(W.gazeErr(H, i, j), W.gazeErr(H, j, i));
      if (i === A && j === B) mut[k] = e <= GATE.look ? 1 : 0;
      else if (e < GATE.away) return 'pair-close(q)';
    }
  }
  const rm = runs(Array.from(mut, Boolean));
  if (rm.length !== 2) return 'ans-runs(q)';
  if (rm.some((r) => r.len * dt < GATE.mutualLen[0] - 0.2 || r.len * dt > GATE.mutualLen[1] + 0.2)) return 'ans-len(q)';
  return '';
}
export function checkTimeline(m, S = series(m)) {
  const n = m.people.length, T = m.T, K = S.K, dt = S.dt, [A, B] = m.answer, G = GATE;
  for (let i = 0; i < n; i++) for (const tl of [m.people[i].gaze, m.people[i].body]) {
    for (const t of [0, G.seamHold, T - G.seamHold]) if (W.holdsAt(tl, t, T).k < 0) return 'seam-move';
  }
  for (let k = 0; k < K; k++) for (let i = 0; i < n; i++) {
    const h = S.H[k][i];
    if (Math.abs(W.wrap180(h.g - h.b)) > G.neck) return 'neck';
  }
  for (const [i, j] of pairsOf(n)) {
    const close = Array.from({ length: K }, (_, k) => Math.max(S.err[i][j][k], S.err[j][i][k]) < G.away);
    if (!(i === A && j === B)) {
      const k = close.indexOf(true);
      if (k >= 0) {
        const ro = m.roles || {}, sp = (p, q) => (p === i && q === j) || (p === j && q === i);
        const what = ro.a && sp(ro.a.p, ro.a.q) ? 'a' : ro.c && sp(ro.c.x, ro.c.y) ? 'c' : ro.b && (sp(ro.b.c, ro.b.e) || sp(ro.b.d, ro.b.e) || sp(ro.b.c, ro.b.d)) ? 'b' : 'x';
        const hold = (p) => { const q = W.holdsAt(m.people[p].gaze, S.ts[k], T); return q.k < 0 ? 'turn' : 'hold'; };
        return `pair-close:${what}:${hold(i)}-${hold(j)}`;
      }
      continue;
    }
    const rm = mutualRuns(m, S), rc = runs(close).sort((p, q) => p.s - q.s);
    if (rm.length !== 2 || rc.length !== 2) return 'ans-runs';
    for (let r = 0; r < 2; r++) {
      if (rm[r].len * dt < G.mutualLen[0] - 1e-9 || rm[r].len * dt > G.mutualLen[1] + 1e-9) return 'ans-len';
      if (!(rc[r].s <= rm[r].s && rc[r].e >= rm[r].e)) return 'ans-nest';
      if ((rc[r].len - rm[r].len) * dt > 2 * G.rampMax) return 'ans-ramp';
    }
    if ((rm[1].s - rm[0].e) * dt < G.mutualGap || (K - rm[1].e + rm[0].s) * dt < G.mutualGap) return 'ans-gap';
    if (rc[0].s * dt < G.closeFrom || rm[0].s * dt < G.mutualFrom - 0.4 || rm[1].e > K || (K - rm[1].e) * dt < G.seamGap) return 'ans-when';
  }
  for (let k = 0; k < K; k++) {
    const t = S.ts[k];
    for (let i = 0; i < n; i++) {
      const q = W.holdsAt(m.people[i].gaze, t, T);
      if (q.k < 0) continue;
      for (let j = 0; j < n; j++) if (j !== i) { const e = S.err[i][j][k]; if (e > G.look && e < G.away) return 'hold-mid'; }
    }
  }
  return '';
}
