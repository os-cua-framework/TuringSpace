import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as RT from './_which_one_moves_rt.js';
import * as W from './_which_one_moves_scene.js';

const NAME = 'which_one_moves';
const VIEW = W.VIEW;
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Tap the one thing that is moving by itself', SUB = 'The clip loops';
export const GATE = {
  tileK: 1.1, X: [1.12, 1.3], slideMin: 15, effPx: 4, fEff: [0.114, 0.134], fTarget: [0.12, 0.126],
  margin: 4, minPx: 14, visMover: 0.75, visStatic: 0.5, visStaticAny: 0.3,
  gridDt: 0.1, dirGate: false, dShare: 0.8, domK: [1.4, 1.1], movePx: 8, minSep: 1, dPairPx: 12, rho: [0.8, 0.95], ramp: [0.45, 2.0],
  L: [11.4, 14.4], H: [3.8, 5.2],
};
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;

export const gridN = (m) => Math.round(m.L / GATE.gridDt);
export const gridT = (m, g, G = gridN(m)) => (g * m.L) / G;
export function tracks(m, G = gridN(m)) {
  const ts = Array.from({ length: G }, (_, g) => gridT(m, g, G)), cams = ts.map((t) => W.camAt(m, t));
  const cen = [], base = [];
  for (const o of m.objs) {
    const c = [], b = [], h = W.heightOf(o) / 2;
    for (let g = 0; g < G; g++) {
      const P = W.poseAt(m, o, ts[g]);
      c.push(W.project(cams[g], [P.x, h, P.z]));
      b.push(W.project(cams[g], [P.x, 0, P.z]));
    }
    cen.push(c); base.push(b);
  }
  return { G, ts, cams, cen, base };
}
const len = (v) => Math.hypot(v[0], v[1]);
const angle = (a, b) => { const la = len(a), lb = len(b); if (la < 1e-9 || lb < 1e-9) return 180; return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)))) / DEG; };
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export function argmax(xs) { let k = 0; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[k]) k = i; return k; }
export function argmin(xs) { let k = 0; for (let i = 1; i < xs.length; i++) if (xs[i] < xs[k]) k = i; return k; }
export function dirOutlier(vs, minPx) {
  const ok = vs.map((v) => len(v) >= minPx), u = vs.map((v) => (len(v) > 1e-9 ? [v[0] / len(v), v[1] / len(v)] : [0, 0]));
  let best = -1, bd = -1;
  vs.forEach((v, i) => {
    if (!ok[i]) return;
    const s = [0, 0]; u.forEach((w, j) => { if (j !== i && ok[j]) { s[0] += w[0]; s[1] += w[1]; } });
    const d = angle(v, s); if (d > bd) { bd = d; best = i; }
  });
  return best;
}
export function medianOutlier(vs) {
  const mx = median(vs.map((v) => v[0])), my = median(vs.map((v) => v[1]));
  return argmax(vs.map((v) => Math.hypot(v[0] - mx, v[1] - my)));
}
export function nearestOf(P) {
  return P.map((p, i) => { let b = -1, bd = Infinity; P.forEach((q, j) => { if (j !== i) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; b = j; } } }); return b; });
}
export function local2D(PA, PB, nn = nearestOf(PA), both = false) {
  const v = PA.map((p, i) => [PB[i][0] - p[0], PB[i][1] - p[1]]);
  const sc = v.map((w, i) => Math.hypot(w[0] - v[nn[i]][0], w[1] - v[nn[i]][1]));
  let k = 0;
  for (let i = 1; i < sc.length; i++) {
    const d = sc[i] - sc[k];
    if (d > 1e-6 * Math.max(1, sc[k]) || (Math.abs(d) <= 1e-6 * Math.max(1, sc[k]) && len(v[i]) > len(v[k]))) k = i;
  }
  if (!both) return k;
  const j = nn[k], pair = len(v[j]) > len(v[k]) ? j : k;
  return { obj: k, pair };
}
export function naivePair(T, A, B, nnA) {
  const n = T.cen.length, PA = T.cen.map((tr) => tr[A]), PB = T.cen.map((tr) => tr[B]);
  const vC = PA.map((p, i) => [PB[i][0] - p[0], PB[i][1] - p[1]]), vB = T.base.map((tr) => [tr[B][0] - tr[A][0], tr[B][1] - tr[A][1]]);
  const dC = vC.map(len), dB = vB.map(len), top = Math.max(...dC);
  if (top < 0.05) return null;
  const BA = T.base.map((tr) => tr[A]), BB = T.base.map((tr) => tr[B]);
  return {
    top, ...(() => { const q = local2D(PA, PB, nnA, true); return { local: q.obj, localPair: q.pair }; })(), localBase: local2D(BA, BB), max: argmax(dC), maxB: argmax(dB), min: argmin(dC),
    dir: dirOutlier(vC, 6), med: medianOutlier(vC), n,
  };
}

function pairProblem(m, T, step = 1) {
  const k = m.answer, D = m.decoy.d, G = T.G, mv = m.objs[k].move;
  const nn = Array.from({ length: G }, (_, g) => (g % step ? null : nearestOf(T.cen.map((tr) => tr[g]))));
  const home = T.ts.map((t) => W.excursion(mv, t) === 0);
  const st = m.objs.map((_, i) => i).filter((i) => i !== k);
  let nOut = 0, nD = 0;
  for (let A = 0; A < G; A += step) for (let B = 0; B < G; B += step) {
    if (A === B) continue;
    const r = naivePair(T, A, B, nn[A]);
    if (!r) continue;
    if (r.local === k || r.localPair === k) return 'h:local';
    if (r.max === k) return 'a:max';
    const dS = Math.max(...st.map((i) => len([T.cen[i][B][0] - T.cen[i][A][0], T.cen[i][B][1] - T.cen[i][A][1]])));
    const sep = Math.min(Math.abs(T.ts[A] - T.ts[B]), m.L - Math.abs(T.ts[A] - T.ts[B]));
    if (dS >= GATE.movePx && sep >= GATE.minSep && r.min === k) return 'a2:min';
    if (home[A] && home[B]) continue;
    if (GATE.dirGate && r.dir === k) return 'b:dir';
    if (GATE.dirGate && r.med === k) return 'b:med';
    if (dS >= GATE.dPairPx) { nOut++; if (r.localPair === D) nD++; }
  }
  if (nD < GATE.dShare * nOut) return 'h:dShare';
  const gp = Math.round((mv.w0 + mv.r + mv.d / 2) / m.L * G) % G;
  for (const [A, B] of [[0, gp], [gp, 0]]) { const r = naivePair(T, A, B, nn[A] ?? nearestOf(T.cen.map((tr) => tr[A]))); if (!r || r.localPair !== D) return 'h:canonD'; }
  return '';
}
export function slideAt(m, tau, cam = W.camAt(m, tau)) {
  const o = m.objs[m.answer], P = W.poseAt(m, o, tau), a = W.project(cam, [P.x, 0, P.z]), b = W.project(cam, [o.x, 0, o.z]);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function effShare(m, px = GATE.effPx) {
  const [w0, w1] = W.windowOf(m.objs[m.answer].move); let c = 0; const dt = 0.02;
  for (let t = Math.max(0, w0); t < w1; t += dt) if (slideAt(m, t) >= px) c++;
  return (c * dt) / m.L;
}
function framingProblem(m, T) {
  const M = GATE.margin;
  for (let g = 0; g < T.G; g++) {
    for (const o of m.objs) {
      const b = W.screenBox(m, o, T.cams[g], W.poseAt(m, o, T.ts[g]));
      if (b[4] < 0.5 || b[0] < M || b[1] < M || b[2] > VIEW.w - M || b[3] > VIEW.h - M) return 'e:frame';
      if (g === 0 && b[3] - b[1] < GATE.minPx) return 'e:small';
    }
  }
  return '';
}
export function visMoments(m) {
  const mv = m.objs[m.answer].move;
  const uq = (ph) => { let lo = 0, hi = m.Lm; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (W.loopPhase(m, mid) < ph) lo = mid; else hi = mid; } return lo; };
  return [0, mv.w0 + mv.r + mv.d / 2, uq(Math.PI / 2), uq(3 * Math.PI / 2)];
}
function visibilityProblem(m) {
  const ts = visMoments(m);
  for (let i = 0; i < ts.length; i++) {
    const sc = W.sceneAt(m, ts[i]);
    for (const o of m.objs) {
      const s = RT.objectStats(sc, o.id, 2);
      const need = o.id === m.answer ? (i <= 1 ? GATE.visMover : GATE.visStaticAny) : (i === 0 ? GATE.visStatic : GATE.visStaticAny);
      if (!(s.frac >= need) || !s.pt) return 'e:vis';
    }
  }
  return '';
}
function pathProblem(m) {
  const o = m.objs[m.answer], ro = W.radiusOf(o), mv = o.move;
  for (let i = 0; i <= 12; i++) {
    const s = (mv.X * i) / 12, x = o.x + mv.hx * s, z = o.z + mv.hz * s;
    for (const q of m.objs) if (q !== o && Math.hypot(x - q.x, z - q.z) < ro + W.radiusOf(q) + 0.15) return 'path';
  }
  return '';
}

const SC_CACHE = { m: null, t: NaN, sc: null };
function sceneCached(m, t) {
  if (SC_CACHE.m !== m || SC_CACHE.t !== t) { SC_CACHE.m = m; SC_CACHE.t = t; SC_CACHE.sc = W.sceneAt(m, t); }
  return SC_CACHE.sc;
}
export function pickAt(m, tau, x, y) {
  if (!(x >= 0 && y >= 0 && x <= VIEW.w && y <= VIEW.h)) return -1;
  const id = RT.pickNear(sceneCached(m, tau), x, y, 6);
  return id >= 0 && id < m.objs.length ? id : -1;
}
function tapPoint(m, tau, id) {
  const s = RT.objectStats(sceneCached(m, tau), id, 2);
  return s.pt ? [s.pt[0], s.pt[1]] : null;
}

function contract(m, full = true) {
  if (!m || m.task !== NAME || !Array.isArray(m.objs) || m.objs.length < 11 || m.objs.length > 14) return null;
  const k = m.answer, mvo = m.objs[k];
  if (!mvo || !mvo.move || m.objs.some((o, i) => o.id !== i || (i !== k && o.move))) return null;
  if (m.phase0 !== undefined && !(m.phase0 >= 0 && m.phase0 < m.L)) return null;
  if (!(m.L >= GATE.L[0] - 1e-9 && m.L <= GATE.L[1] + 1e-9) || !(m.H >= GATE.H[0] - 1e-9 && m.H <= GATE.H[1] + 1e-9) || Math.abs(m.Lm + m.H - m.L) > 1e-6 || !m.live) return null;
  const lamps = m.objs.filter((o) => o.kind === 'lamp');
  if (!m.decoy || lamps.length !== 1 || lamps[0].id !== m.decoy.d || m.decoy.f === k || m.decoy.f === m.decoy.d || !m.objs[m.decoy.f]) return null;
  if (!W.MOVABLE.includes(mvo.kind)) return null;
  const others = m.objs.filter((o) => o !== mvo);
  if (!others.some((o) => o.kind === mvo.kind) || !others.some((o) => W.MOVABLE.includes(o.kind) && o.kind !== mvo.kind)) return null;
  if (mvo.kind === 'car' || mvo.kind === 'robot') {
    const h = W.headingVec(mvo.yaw);
    if (Math.abs(h[0] - mvo.move.hx) > 1e-3 || Math.abs(h[1] - mvo.move.hz) > 1e-3) return null;
  }
  const mv = mvo.move, [w0, w1] = W.windowOf(mv);
  if (!(mv.X >= GATE.tileK * m.floor.tile && mv.X >= GATE.X[0] * m.floor.tile - 1e-9 && mv.X <= GATE.X[1] * m.floor.tile + 1e-3)) return null;
  if (!(w0 > 0 && w1 < m.Lm)) return null;
  if (W.excursion(mv, w0) !== 0 || W.excursion(mv, w1) !== 0 || W.excursion(mv, mv.w0 + mv.r + mv.d / 2) !== 1) return null;
  const c0 = W.camPose(m, 0), c1 = W.camPose(m, m.L - 1e-9);
  if (c0.eye.some((v, i) => Math.abs(v - c1.eye[i]) > 1e-9)) return null;
  for (const o of m.objs) { const a = W.poseAt(m, o, 0), b = W.poseAt(m, o, m.L - 1e-9); if (a.x !== b.x || a.z !== b.z) return null; }
  if (pathProblem(m)) return null;
  const T = tracks(m);
  let peak = 0; for (let t = w0; t <= w1; t += 0.05) peak = Math.max(peak, slideAt(m, t));
  if (peak < GATE.slideMin) return null;
  const f = effShare(m);
  if (!(f >= GATE.fEff[0] && f <= GATE.fEff[1])) return null;
  if (framingProblem(m, T) || pairProblem(m, T)) return null;
  if (full && visibilityProblem(m)) return null;
  return { T, f, peak };
}
export function gate(m) {
  const c = contract(m);
  if (!c || !m.tap || !Array.isArray(m.pts0) || m.pts0.length !== m.objs.length) return false;
  if (!(m.tap.tau >= m.Lm && m.tap.tau < m.L)) return false;
  if (pickAt(m, m.tap.tau, m.tap.x, m.tap.y) !== m.answer) return false;
  if (Math.abs(sceneTime(m, oracleWait(m)) - m.tap.tau) > 1e-6) return false;
  if (m.pts0.some((p, i) => !p || pickAt(m, 0, p[0], p[1]) !== i)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
export { contract as _contract };

function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
const COLS = {
  car: W.PAINT.slice(0, 7), ball: ['#d23a2e', '#2b63c6', '#f0b41d', '#2d9a4c', '#7b4cc0', '#ee7a22', '#2ba3b3'],
  robot: ['#e9e5dd', '#f0b41d', '#2ba3b3', '#d23a2e', '#3e4a57'], chair: ['#e9e6df', '#2d9a4c', '#2b63c6', '#d23a2e', '#3a3d42'],
  bucket: ['#d23a2e', '#2b63c6', '#f0b41d', '#2d9a4c', '#ee7a22'], box: ['#b98d5a', '#a87b4b', '#c49a66'], crate: ['#a87a4a', '#94693d', '#b58b5b'],
  bin: ['#4f6b58', '#5b5f66', '#2f5d8a'], barrel: ['#2f5fa8', '#2e8a52', '#c2412f'], cone: ['#e4581d'], plant: ['#b4613d'],
  lamp: ['#2f3b33', '#26282b', '#4a5058', '#3b3f6b'],
};
export const _genStats = {}, _dirStats = {};
const tally = (why) => { _dirStats[why] = (_dirStats[why] || 0) + 1; };
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };
export function _tryBuild(rng, mk, band, side) { return tryBuild(rng, mk, band, side); }
function pairSpeed(m, tau, a, b) {
  const h = 0.04, oa = m.objs[a], ob = m.objs[b];
  const at = (t) => { const c = W.camAt(m, t), p = W.project(c, W.centreAt(m, oa, t)), q = W.project(c, W.centreAt(m, ob, t)); return [p[0] - q[0], p[1] - q[1]]; };
  const u = at(tau - h), v = at(tau + h);
  return Math.hypot(v[0] - u[0], v[1] - u[1]) / (2 * h);
}
function tryBuild(rng, mkIn, band = -1, side = -1) {
  const U = rng.uniform;
  const Lm = r3(U(7.6, 9.2)), H = r3(U(GATE.H[0], GATE.H[1])), L = r3(Lm + H);
  if (L < GATE.L[0] || L > GATE.L[1]) return fail('L');
  const m = {
    task: NAME, board: { ...BOARD }, L, Lm, H: r3(L - Lm), dt: 0.5,
    cam: { az: r2(U(0, 360)), el: r2(U(30, 38)), dist: r2(U(7, 8.4)), fov: W.FOV, pivot: [0, 0, 0],
      loop: { a: r3(U(1.15, 1.4)), k: r3(U(0.55, 0.8)), psi: r3(U(0, 2 * Math.PI)), s: rng.raw() < 0.5 ? -1 : 1 } },
    floor: { tile: r3(U(0.34, 0.42)), yaw: r2(U(0, 90)), scheme: Math.floor(rng.raw() * W.FLOORS.length), seed: Math.floor(rng.raw() * 9000) },
    sun: { az: r2(U(0, 360)), el: r2(U(46, 62)) },
    objs: [], answer: -1, decoy: null, live: true,
  };
  const n = 11 + Math.floor(rng.raw() * 4);
  const mk0 = W.MOVABLE[Math.floor(rng.raw() * 3)], mk = mkIn || mk0, rest = rng.shuffle(W.MOVABLE.filter((q) => q !== mk));
  const list = [{ kind: 'lamp', role: 'D' }, { kind: mk, role: 'M' }, { kind: mk }, { kind: rest[0] }, { kind: rest[0] }];
  const n3 = Math.floor(rng.raw() * 3);
  for (let i = 0; i < n3 && list.length < n - 3; i++) list.push({ kind: rest[1] });
  const pool = rng.shuffle(W.STATIC_KINDS.flatMap((q) => [q, q]));
  for (let i = 0; list.length < n; i++) list.push({ kind: pool[i] });
  const fCand = list.map((e, i) => i).filter((i) => list[i].role !== 'D' && list[i].role !== 'M' && ['car', 'ball', 'robot', 'cone', 'box', 'crate', 'bucket'].includes(list[i].kind));
  if (!fCand.length) return fail('fkind');
  list[fCand[Math.floor(rng.raw() * fCand.length)]].role = 'F';
  const used = {};
  for (const e of list) {
    const cs = COLS[e.kind], u = used[e.kind] || (used[e.kind] = []);
    const free = cs.filter((c) => !u.includes(c)), c = (free.length ? free : cs)[Math.floor(rng.raw() * (free.length ? free.length : cs.length))];
    u.push(c); e.col = c;
    e.s = r3(U(0.92, 1.12));
    if (e.kind === 'ball') { e.br = r3(U(0.2, 0.27)); e.col2 = rng.raw() < 0.5 ? '#f4f1ea' : W.PAINT[Math.floor(rng.raw() * 7)]; e.tilt = r2(U(0, 70)); }
    if (e.kind === 'box') e.ax = r3(U(0.85, 1.2));
    if (e.kind === 'lamp') { e.lh = r3(U(2.5, 2.85)); e.head = rng.raw() < 0.5 ? 1 : 0; e.col2 = rng.raw() < 0.5 ? '#f6e7b4' : '#eef2f4'; e.s = 1; }
    e.yaw = r2(U(0, 360));
  }
  const order = rng.shuffle(list.map((_, i) => i));
  m.objs = order.map((i, id) => ({ id, ...list[i] }));
  const idOf = (role) => m.objs.findIndex((o) => o.role === role);
  m.answer = idOf('M'); m.decoy = { d: idOf('D'), f: idOf('F') };
  m.objs.forEach((o) => { delete o.role; });
  const cam0 = W.camAt(m, 0), cen0 = (o) => W.project(cam0, [o.x, W.heightOf(o) / 2, o.z]);
  const Dm = m.objs[m.decoy.d], Fm = m.objs[m.decoy.f];
  const probeCams = [0.2, 0.35, 0.5, 0.65, 0.8].map((u) => W.camAt(m, u * m.Lm));
  const inView = (o, M = GATE.margin + 6) => [cam0, ...probeCams].every((c) => { const b = W.screenBox(m, o, c, W.poseAt(m, o, 0)); return b[4] > 0.5 && b[0] >= M && b[1] >= M && b[2] <= VIEW.w - M && b[3] <= VIEW.h - M; });
  {
    let ok = false;
    for (let a = 0; a < 40 && !ok; a++) {
      const sx = U(70, VIEW.w - 70), sy = U(0.8 * VIEW.h, VIEW.h - 16), p = RT.planeAtPixel(cam0, sx, sy, 0);
      if (!p) continue;
      Dm.x = r3(p.x); Dm.z = r3(p.z);
      if (!inView(Dm)) continue;
      ok = true;
    }
    if (!ok) return fail('placeD');
  }
  {
    const cD = cen0(Dm), sg = rng.raw() < 0.5 ? -1 : 1, hF = W.heightOf(Fm) / 2;
    const p = RT.planeAtPixel(cam0, cD[0] + sg * U(16, 28), cD[1] + U(-16, 4), hF);
    if (!p) return fail('placeF');
    Fm.x = r3(p.x); Fm.z = r3(p.z);
    const zD = cD[2], zF = W.project(cam0, [Fm.x, hF, Fm.z])[2];
    if (!(zF / zD >= 1.25)) return fail('depthF');
    if (!inView(Fm)) return fail('viewF');
  }
  const placed = [Dm, Fm].map((o) => ({ o, b: W.project(cam0, [o.x, 0, o.z]), c: cen0(o) }));
  const cD = placed[0].c, dDF = Math.hypot(placed[1].c[0] - cD[0], placed[1].c[1] - cD[1]), cDF = Math.abs(1 / cD[2] - 1 / placed[1].c[2]);
  for (const o of m.objs) {
    if (o === Dm || o === Fm) continue;
    let ok = false;
    for (let a = 0; a < 60 && !ok; a++) {
      const sx = U(30, VIEW.w - 30), sy = U(125, VIEW.h - 24), p = RT.planeAtPixel(cam0, sx, sy, 0);
      if (!p) continue;
      o.x = r3(p.x); o.z = r3(p.z);
      const b = W.project(cam0, [o.x, 0, o.z]), c = cen0(o);
      if (placed.some((q) => Math.hypot(q.o.x - o.x, q.o.z - o.z) < W.radiusOf(o) + W.radiusOf(q.o) + 0.3 || Math.hypot(q.b[0] - b[0], q.b[1] - b[1]) < 30)) continue;
      if (Math.hypot(c[0] - cD[0], c[1] - cD[1]) < Math.max(48, 2.2 * dDF)) continue;
      if (probeCams.some((pc) => { const a = W.project(pc, [o.x, W.heightOf(o) / 2, o.z]), d = W.project(pc, [Dm.x, Dm.lh / 2, Dm.z]); return Math.hypot(a[0] - d[0], a[1] - d[1]) < 42; })) continue;
      if (o.id === m.answer && Math.hypot(c[0] - placed[1].c[0], c[1] - placed[1].c[1]) < 48) continue;
      if (!inView(o)) continue;
      const iz = (q) => 1 / q.c[2], me = { o, b, c };
      const nnOf = (q, pool) => { let bq = null, bd = Infinity; for (const w of pool) if (w !== q) { const dd = Math.hypot(w.c[0] - q.c[0], w.c[1] - q.c[1]); if (dd < bd) { bd = dd; bq = w; } } return bq; };
      const pool = [...placed, me];
      if (pool.some((q) => { if (q.o === Dm || q.o === Fm) return false; const w = nnOf(q, pool); return w && w.o !== Dm && Math.abs(iz(q) - iz(w)) >= 0.6 * cDF; })) continue;
      placed.push(me); ok = true;
    }
    if (!ok) return fail('place');
  }
  {
    const others = m.objs.filter((o) => o !== Dm && o !== Fm);
    const disp = (o) => probeCams.map((c) => { const h = W.heightOf(o) / 2, a = W.project(cam0, [o.x, h, o.z]), b = W.project(c, [o.x, h, o.z]); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
    const D2 = m.objs.map((o) => disp(o)), ext = new Set();
    for (let j = 0; j < probeCams.length; j++) { const rk = m.objs.map((o, i) => [D2[i][j], i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); [rk[0], rk[rk.length - 1]].forEach((i) => ext.add(i)); }
    const mo = m.objs[m.answer], hM = W.heightOf(mo) / 2, cF = placed[1].c;
    const zr = m.objs.map((o) => [cen0(o)[2], o.id]).sort((a, b) => b[0] - a[0]).map((x) => x[1]).slice(1, m.objs.length - 3);
    const want = band < 0 ? -1 : Math.min(zr.length - 1, Math.floor(band * zr.length));
    const inBand = (o) => zr.includes(o.id) && (band < 0 || Math.abs(zr.indexOf(o.id) - want) <= 1);
    const nnContrast = (o) => { const c = W.project(cam0, [o.x, hM, o.z]); let bq = null, bd = Infinity; for (const q of m.objs) if (q !== o && q !== mo) { const cq = cen0(q), dd = Math.hypot(cq[0] - c[0], cq[1] - c[1]); if (dd < bd) { bd = dd; bq = cq; } } return Math.abs(1 / c[2] - 1 / bq[2]); };
    const dl = (o) => { const c = cen0(o); return Math.hypot(c[0] - cD[0], c[1] - cD[1]); };
    const lr = m.objs.filter((o) => o !== Dm).map((o) => [dl(o), o.id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const inSide = (o) => side < 0 || (lr.indexOf(o.id) < lr.length / 2 ? 0 : 1) === side;
    const ok = others.filter((o) => { if (ext.has(o.id) || !inBand(o) || !inSide(o)) return false; const c = W.project(cam0, [o.x, hM, o.z]); return Math.hypot(c[0] - cD[0], c[1] - cD[1]) >= 48 && Math.hypot(c[0] - cF[0], c[1] - cF[1]) >= 48 && nnContrast(o) <= 0.45 * cDF; });
    if (!ok.length) return fail('placeM');
    const pick = ok[Math.floor(rng.raw() * ok.length)];
    [pick.x, mo.x] = [mo.x, pick.x]; [pick.z, mo.z] = [mo.z, pick.z];
    if (!inView(pick) || !inView(mo)) return fail('placeM');
  }
  {
    const fr = [cam0, ...probeCams].map((c) => m.objs.map((o) => W.project(c, [o.x, W.heightOf(o) / 2, o.z])));
    for (let A = 0; A < fr.length; A++) {
      const nnA = nearestOf(fr[A]);
      for (let B = 0; B < fr.length; B++) {
        if (A === B) continue;
        const v = fr[A].map((p, i) => [fr[B][i][0] - p[0], fr[B][i][1] - p[1]]);
        const sc = v.map((w, i) => Math.hypot(w[0] - v[nnA[i]][0], w[1] - v[nnA[i]][1]));
        if (!(sc[m.decoy.d] >= GATE.domK[0] * sc[m.answer])) return fail('domM');
        const fast = (A === 0 || (A >= 2 && A <= 4)) && B >= 2 && B <= 4;
        const other = Math.max(...sc.filter((_, i) => i !== m.decoy.d && i !== m.decoy.f && nnA[i] !== m.decoy.d));
        if (fast && !(sc[m.decoy.d] >= GATE.domK[1] * other)) return fail('dom');
      }
    }
  }
  const mv = m.objs[m.answer];
  const tauC = m.Lm * (0.5 + U(-0.04, 0.04));
  const gapCache = new Map(), gap = (t) => { const k = Math.round(t * 20); if (!gapCache.has(k)) gapCache.set(k, pairSpeed(m, k / 20, m.decoy.d, m.decoy.f)); return gapCache.get(k); };
  const X = Math.ceil(U(GATE.X[0], GATE.X[1]) * m.floor.tile * 1000) / 1000, rho = U(GATE.rho[0], GATE.rho[1]), fT = U(GATE.fTarget[0], GATE.fTarget[1]);
  const camC = W.camAt(m, tauC), hM = W.heightOf(mv) / 2;
  const motionOK = () => {
    const mvv = mv.move, hh = 0.04, ts = [];
    for (let i = 1; i < 8; i++) ts.push(mvv.w0 + (i / 8) * mvv.r, mvv.w0 + mvv.r + mvv.d + (i / 8) * mvv.r);
    for (const t of ts) {
      const c0 = W.camAt(m, t - hh), c1 = W.camAt(m, t + hh);
      const vel = (o, y) => { const P0 = W.poseAt(m, o, t - hh), P1 = W.poseAt(m, o, t + hh), a = W.project(c0, [P0.x, y, P0.z]), b = W.project(c1, [P1.x, y, P1.z]); return Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * hh); };
      const own = (() => { const x0 = W.excursion(mvv, t - hh), x1 = W.excursion(mvv, t + hh), c = W.camAt(m, t), a = W.project(c, [mv.x + mvv.hx * mvv.X * x0, hM, mv.z + mvv.hz * mvv.X * x0]), b = W.project(c, [mv.x + mvv.hx * mvv.X * x1, hM, mv.z + mvv.hz * mvv.X * x1]); return Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * hh); })();
      if (own > rho * gap(t)) return 'local';
      const vc = m.objs.map((o) => vel(o, W.heightOf(o) / 2)), vb = m.objs.map((o) => vel(o, 0));
      const sc = vc.filter((_, i) => i !== m.answer), sb = vb.filter((_, i) => i !== m.answer);
      if (vc[m.answer] > 0.9 * Math.max(...sc)) return 'maxC';
    }
    return '';
  };
  const Sstar = U(16, 24);
  const ths = Array.from({ length: 24 }, () => U(0, 360)).map((th) => { const h = W.headingVec(th), c0 = W.project(camC, [mv.x, hM, mv.z]), c1 = W.project(camC, [mv.x + h[0] * X, hM, mv.z + h[1] * X]); return [Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), th]; })
    .sort((a, b) => Math.abs(a[0] - Sstar) - Math.abs(b[0] - Sstar));
  let built = false, why = 'mover';
  for (let a = 0; a < ths.length && !built; a++) {
    const th = ths[a][1], h = W.headingVec(th);
    const c0 = W.project(camC, [mv.x, hM, mv.z]), c1 = W.project(camC, [mv.x + h[0] * X, hM, mv.z + h[1] * X]);
    const b0 = W.project(camC, [mv.x, 0, mv.z]), b1 = W.project(camC, [mv.x + h[0] * X, 0, mv.z + h[1] * X]);
    const Sc = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), Sb = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
    if (Sb < GATE.slideMin) { why = 'm:slide'; tally(why); continue; }
    const r = r3(Math.max(GATE.ramp[0], Math.min(GATE.ramp[1], W.RAMP_PEAK * Sc / (rho * gap(tauC)))));
    mv.move = { hx: h[0], hz: h[1], X, w0: 0, r, d: 0 };
    if (mv.kind !== 'ball') { mv.yaw = r2(th); const hh = W.headingVec(mv.yaw); mv.move.hx = hh[0]; mv.move.hz = hh[1]; }
    if (pathProblem(m)) { why = 'm:path'; tally(why); continue; }
    let okR = false, mo = '';
    for (let rit = 0; rit < 14 && !okR && mv.move.r <= GATE.ramp[1]; rit++) {
      let d = 0;
      for (let it = 0; it < 3; it++) {
        mv.move.d = r3(Math.max(0, d)); mv.move.w0 = r3(tauC - (2 * mv.move.r + mv.move.d) / 2);
        const f = effShare(m); d = mv.move.d + (fT - f) * m.L;
      }
      mv.move.d = r3(Math.max(0, d)); mv.move.w0 = r3(tauC - (2 * mv.move.r + mv.move.d) / 2);
      mo = motionOK();
      if (!mo) okR = true; else mv.move.r = r3(mv.move.r + 0.1);
    }
    if (!okR) { why = 'm:speed:' + mo; tally(why); continue; }
    {
      const tp = mv.move.w0 + mv.move.r + mv.move.d / 2, cp = W.camAt(m, tp), a = W.project(cp, W.centreAt(m, mv, tp)), dd = W.project(cp, W.centreAt(m, Dm, tp));
      if (Math.hypot(a[0] - dd[0], a[1] - dd[1]) < 44) { why = 'm:nearD'; tally(why); continue; }
    }
    const [w0, w1] = W.windowOf(mv.move);
    if (!(w0 >= 0.15 * m.Lm && w1 <= 0.85 * m.Lm)) { why = 'm:window'; tally(why); continue; }
    if (mv.move.d > 1.6) { why = 'm:pause'; continue; }
    const pc = pairProblem(m, tracks(m, Math.round(m.L / 0.25)));
    if (pc) { why = 'm~' + pc; tally(why); continue; }
    built = true;
  }
  if (!built) return fail(why);
  const c = contract(m, false);
  if (!c) {
    const T = tracks(m), pp = pairProblem(m, T), fp = framingProblem(m, T);
    return fail(fp || pp || 'contract');
  }
  if (visibilityProblem(m)) return fail('e:vis');
  const tauTap = r3(m.Lm + m.H / 2), tp = tapPoint(m, tauTap, m.answer);
  if (!tp) return fail('tap');
  m.tap = { tau: tauTap, x: tp[0], y: tp[1] };
  m.pts0 = m.objs.map((o) => tapPoint(m, 0, o.id));
  if (m.pts0.some((p) => !p)) return fail('pts0');
  _genStats.ok = (_genStats.ok || 0) + 1;
  return m;
}

export const loopLen = (m) => m.L;
export function sceneTime(m, t) { const L = m.L, s = t + (m.phase0 || 0), u = ((s % L) + L) % L; return u; }
const oracleWait = (m) => m.L + ((m.tap.tau - (m.phase0 || 0)) % m.L + m.L) % m.L;
function oracleWaits(m) { const k = Math.ceil(m.L), out = []; for (let i = 0; i < k; i++) out.push(m.L / k); out.push(oracleWait(m) - out.reduce((a, b) => a + b, 0)); return out; }

const task = {
  meta: {
    name: NAME, family: 'T', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the object under the point in the picture shown at that moment (tap it again to clear; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const r0 = mulberry32(mix32(key, 0x5eed0000)), mk = W.MOVABLE[Math.floor(r0() * 3)], band = r0(), side = r0() < 0.5 ? 0 : 1;
    for (let a = 0; a < 8000; a++) {
      const m = tryBuild(R(mulberry32(mix32(key, a))), mk, band, side);
      if (m) { m.phase0 = r3(r0() * m.L); return m; }
    }
    throw new Error('which_one_moves: generator exhausted');
  },

  frames(m) { return { n: 16, period: m.L }; },
  init() { return { ...clockState(), sel: -1, taps: 0, tauSel: null }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    const tau = sceneTime(m, st.t), id = pickAt(m, tau, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-object' };
    st.sel = st.sel === id ? -1 : id; st.taps++; st.tauSel = st.sel >= 0 ? r3(tau) : null;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel, selKind: st.sel >= 0 ? m.objs[st.sel].kind : null, answer: m.answer, moverKind: m.objs[m.answer].kind,
        decoy: m.decoy.d, t: r3(st.t), loops: Math.floor(st.t / loopLen(m)), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) { return [...oracleWaits(m).map((sec) => ({ op: 'wait', sec })), { op: 'tap', x: m.tap.x, y: m.tap.y }]; },

  randomPolicy(m, rnd) { const i = Math.floor(rnd() * m.objs.length), p = m.pts0[i]; return [{ op: 'tap', x: p[0], y: p[1] }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    const active = tickClock(env, dt, { running: (e) => !e.submitted });
    return active || !view(env).drawnHi;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const st = env.state, m = env.manifest;
    if (!(evt.x >= 0 && evt.y >= 0 && evt.x <= VIEW.w && evt.y <= VIEW.h)) return [];
    return pickAt(m, sceneTime(m, st.t), evt.x, evt.y) >= 0 ? [{ op: 'tap', x: evt.x, y: evt.y }] : [];
  },

  footerStatus(env) { return env.state.sel >= 0 ? '1 selected' : 'Nothing selected'; },
};
export default task;

const Q_PLAY = 1, HI_MAX = 8, LO_MAX = 6;
function view(env) {
  return (env._wom ??= { m: null, bake: null, hi: new Map(), lo: new Map(), ring: null, ringKey: '', drawnHi: false, ms: [] });
}
function frameImage(V, m, tau, q) {
  const sc = W.frameScene(m, tau, V.bake), t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const img = RT.render(sc, q, 1);
  img.canvas = RT.toCanvas(img); img.data = null;
  if (typeof performance !== 'undefined') { V.ms.push([q, Math.round(performance.now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
  return img;
}
function lru(map, key, max, make) {
  if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v);
  while (map.size > max) map.delete(map.keys().next().value);
  return v;
}
const frameKey = (m, tau) => (W.loopPhase(m, tau) === 0 && W.excursion(m.objs[m.answer].move, tau) === 0 ? 'home' : tau.toFixed(4));
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.hi.clear(); V.lo.clear(); V.ringKey = ''; const t0 = (typeof performance !== 'undefined' ? performance.now() : 0); V.bake = W.bakeFor(m); V.bakeMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0); }
  const tau = sceneTime(m, st.t), still = CLOCK.paused || !!env.submitted, fk = frameKey(m, tau);
  let img;
  if (still) { img = lru(V.hi, `${fk}|${q}`, HI_MAX, () => frameImage(V, m, tau, q)); V.drawnHi = true; }
  else { const qp = Math.min(q, Q_PLAY); img = lru(V.lo, `${fk}|${qp}`, LO_MAX, () => frameImage(V, m, tau, qp)); V.drawnHi = qp >= q; }
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(img.canvas, 0, 0, VIEW.w, VIEW.h);
  if (st.sel >= 0) {
    const rk = `${st.sel}`;
    if (V.ring?.img !== img || V.ringKey !== rk) { V.ringKey = rk; V.ring = { img, canvas: RT.toCanvas(RT.ringImage(img, new Set([st.sel]))) }; }
    g.drawImage(V.ring.canvas, 0, 0, VIEW.w, VIEW.h);
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
export function _viewStats(env) { const V = view(env); return { bakeMs: V.bakeMs, ms: V.ms.slice() }; }
