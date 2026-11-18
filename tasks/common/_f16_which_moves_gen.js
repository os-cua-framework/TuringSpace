import { mulberry32, R } from '../core/rng.js';
import * as RT from './_which_one_moves_rt.js';
import * as W from './_which_one_moves_scene.js';
import { nearestOf, naivePair, argmax, argmin, slideAt } from './which_one_moves.js';

export const NAME = 'f16_which_moves';
export const VIEW = W.VIEW;
export const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
export const NF = 10, DT = 1;
export const GATE = {
  X: [1.12, 1.3], tileK: 1.1, slideMin: 17, slideMax: 40, margin: 4, minPx: 14, visMover: 0.75, visStatic: 0.5, visStaticAny: 0.3,
  domK: [1.4, 1.1], movePx: 8, dPairPx: 12, dShare: 0.8, nOut: [2, 3],
};
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const len = (v) => Math.hypot(v[0], v[1]);

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
function tryBuild(rng, mkIn, band = -1, side = -1) {
  const U = rng.uniform;
  const Lm = r3(U(7.6, 9.2)), H = 1, L = r3(Lm + H);
  const m = {
    task: NAME, board: { ...BOARD }, L, Lm, H, dt: DT,
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
    const cueCams = [cam0, ...probeCams];
    const cueEx = (o) => cueCams.some((c) => {
      const P = m.objs.map((q) => W.project(c, [q.x, W.heightOf(q) / 2, q.z])), i = o.id, cx = VIEW.w / 2, cy = VIEW.h / 2;
      const feats = [P.map((p) => p[2]), P.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), P.map((p) => p[0]), P.map((p) => p[1])];
      return feats.some((v) => argmax(v) === i || argmin(v) === i);
    });
    const ok = others.filter((o) => { if (ext.has(o.id) || !inBand(o) || !inSide(o) || cueEx(o)) return false; const c = W.project(cam0, [o.x, hM, o.z]); return Math.hypot(c[0] - cD[0], c[1] - cD[1]) >= 48 && Math.hypot(c[0] - cF[0], c[1] - cF[1]) >= 48 && nnContrast(o) <= 0.45 * cDF; });
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
  const mv = m.objs[m.answer], hM = W.heightOf(mv) / 2;
  m.ft = frameTimes(m);
  const nOut = GATE.nOut[0] + Math.floor(rng.raw() * (GATE.nOut[1] - GATE.nOut[0] + 1));
  const j0 = 2 + Math.floor(rng.raw() * (7 - nOut - 2 + 1)), j1 = j0 + nOut - 1;
  m.out = [j0, j1];
  const X = Math.ceil(U(GATE.X[0], GATE.X[1]) * m.floor.tile * 1000) / 1000;
  const outCams = []; for (let j = j0; j <= j1; j++) outCams.push(W.camAt(m, m.ft[j]));
  const ths = Array.from({ length: 48 }, () => U(0, 360)).map((th) => {
    const h = W.headingVec(th), sl = outCams.map((c) => { const a = W.project(c, [mv.x, 0, mv.z]), b = W.project(c, [mv.x + h[0] * X, 0, mv.z + h[1] * X]); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
    return { th, min: Math.min(...sl), max: Math.max(...sl) };
  }).filter((q) => q.min >= GATE.slideMin + 1 && q.max <= GATE.slideMax - 2).sort((a, b) => a.min - b.min);
  if (!ths.length) return fail('m:slide');
  const gb = m.ft[j0] - m.ft[j0 - 1], ga = m.ft[j1 + 1] - m.ft[j1];
  const p0 = m.ft[j0] - 0.2 * gb, p1 = m.ft[j1] + 0.2 * ga, r = r3(0.6 * Math.min(gb, ga));
  let why = 'mover', built = false;
  for (let a = 0; a < Math.min(6, ths.length) && !built; a++) {
    const th = ths[Math.floor(a * ths.length / Math.min(6, ths.length))].th, h = W.headingVec(th);
    mv.move = { hx: h[0], hz: h[1], X, w0: r3(p0 - r), r, d: r3(p1 - p0) };
    if (mv.kind !== 'ball') { mv.yaw = r2(th); const hh = W.headingVec(mv.yaw); mv.move.hx = hh[0]; mv.move.hz = hh[1]; }
    const why2 = frameContract(m, false);
    if (why2) { why = why2; tally(why); continue; }
    built = true;
  }
  if (!built) return fail(why);
  const vp = visibilityProblem(m);
  if (vp) return fail(vp);
  const tp = tapPoint(m, m.ft[NF - 1], m.answer);
  if (!tp) return fail('tap');
  m.tap = { frame: NF - 1, x: tp[0], y: tp[1] };
  m.pts0 = m.objs.map((o) => tapPoint(m, m.ft[0], o.id));
  if (m.pts0.some((p) => !p)) return fail('pts0');
  _genStats.ok = (_genStats.ok || 0) + 1;
  return m;
}

export function frameTimes(m) {
  const ft = [0];
  for (let k = 1; k < NF - 1; k++) {
    const want = 2 * Math.PI * k / (NF - 1); let lo = 0, hi = m.Lm;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (W.loopPhase(m, mid) < want) lo = mid; else hi = mid; }
    ft.push(r3((lo + hi) / 2));
  }
  ft.push(m.Lm);
  return ft;
}
export const frameOf = (m, t) => (((Math.round(t / DT)) % NF) + NF) % NF;
export const tauOf = (m, t) => m.ft[frameOf(m, t)];
export function frameTracks(m) {
  const ts = m.ft, cams = ts.map((t) => W.camAt(m, t)), cen = [], base = [];
  for (const o of m.objs) {
    const c = [], b = [], h = W.heightOf(o) / 2;
    ts.forEach((t, g) => { const P = W.poseAt(m, o, t); c.push(W.project(cams[g], [P.x, h, P.z])); b.push(W.project(cams[g], [P.x, 0, P.z])); });
    cen.push(c); base.push(b);
  }
  return { G: ts.length, ts, cams, cen, base };
}
function pathProblem(m) {
  const o = m.objs[m.answer], ro = W.radiusOf(o), mv = o.move;
  for (let i = 0; i <= 12; i++) {
    const s = (mv.X * i) / 12, x = o.x + mv.hx * s, z = o.z + mv.hz * s;
    for (const q of m.objs) if (q !== o && Math.hypot(x - q.x, z - q.z) < ro + W.radiusOf(q) + 0.15) return 'path';
  }
  return '';
}
function tapPoint(m, tau, id) {
  const s = RT.objectStats(W.sceneAt(m, tau), id, 2);
  return s.pt ? [s.pt[0], s.pt[1]] : null;
}
export function oneFrameCues(m, T = frameTracks(m)) {
  const out = [], cx = VIEW.w / 2, cy = VIEW.h / 2;
  for (let g = 0; g < T.G; g++) {
    const P = T.cen.map((tr) => tr[g]);
    const feats = { depth: P.map((p) => p[2]), centre: P.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), x: P.map((p) => p[0]), y: P.map((p) => p[1]) };
    for (const [name, v] of Object.entries(feats)) { out.push({ frame: g + 1, cue: name + '-max', picks: argmax(v) }); out.push({ frame: g + 1, cue: name + '-min', picks: argmin(v) }); }
  }
  return out;
}
export function frameContract(m, full = true) {
  const k = m.answer, mvo = m.objs[k], mv = mvo.move, D = m.decoy.d;
  if (!mv || !m.ft || m.ft.length !== NF) return 'ft';
  const [j0, j1] = m.out;
  for (let g = 0; g < NF; g++) { const e = W.excursion(mv, m.ft[g]); if (g >= j0 && g <= j1 ? e !== 1 : e !== 0) return 'win:' + g; }
  if (!(mv.X >= GATE.tileK * m.floor.tile && mv.X >= GATE.X[0] * m.floor.tile - 1e-9 && mv.X <= GATE.X[1] * m.floor.tile + 1e-3)) return 'X';
  if (pathProblem(m)) return 'path';
  for (let g = j0; g <= j1; g++) { const s = slideAt(m, m.ft[g]); if (s < GATE.slideMin || s > GATE.slideMax) return 'slide'; }
  const c0 = W.camPose(m, m.ft[0]), c1 = W.camPose(m, m.ft[NF - 1]);
  if (c0.eye.some((v, i) => Math.abs(v - c1.eye[i]) > 1e-9)) return 'g:cam';
  for (const o of m.objs) { const a = W.poseAt(m, o, m.ft[0]), b = W.poseAt(m, o, m.ft[NF - 1]); if (a.x !== b.x || a.z !== b.z) return 'g:obj'; }
  const T = frameTracks(m);
  for (let g = 0; g < NF; g++) for (const o of m.objs) {
    const b = W.screenBox(m, o, T.cams[g], W.poseAt(m, o, T.ts[g]));
    if (b[4] < 0.5 || b[0] < GATE.margin || b[1] < GATE.margin || b[2] > VIEW.w - GATE.margin || b[3] > VIEW.h - GATE.margin) return 'e:frame';
    if (g === 0 && b[3] - b[1] < GATE.minPx) return 'e:small';
  }
  if (oneFrameCues(m, T).some((c) => c.picks === k)) return 'single';
  const nn = Array.from({ length: NF }, (_, g) => nearestOf(T.cen.map((tr) => tr[g])));
  const home = m.ft.map((t) => W.excursion(mv, t) === 0), st = m.objs.map((_, i) => i).filter((i) => i !== k);
  let nOutP = 0, nD = 0;
  for (let A = 0; A < NF; A++) for (let B = 0; B < NF; B++) {
    if (A === B) continue;
    const r = naivePair(T, A, B, nn[A]);
    if (!r) continue;
    if (r.local === k || r.localPair === k) return 'h:local';
    if (r.max === k) return 'a:max';
    const dS = Math.max(...st.map((i) => len([T.cen[i][B][0] - T.cen[i][A][0], T.cen[i][B][1] - T.cen[i][A][1]])));
    if (dS >= GATE.movePx && r.min === k) return 'a2:min';
    if (home[A] && home[B]) continue;
    if (dS >= GATE.dPairPx) { nOutP++; if (r.localPair === D) nD++; }
  }
  if (nD < GATE.dShare * nOutP) return 'h:dShare';
  for (const [A, B] of [[0, j0], [j0, 0]]) { const r = naivePair(T, A, B, nn[A]); if (!r || r.localPair !== D) return 'h:canonD'; }
  if (full) return visibilityProblem(m);
  return '';
}
export function visibilityProblem(m) {
  const [j0, j1] = m.out;
  for (let g = 0; g < NF - 1; g++) {
    const sc = W.sceneAt(m, m.ft[g]);
    for (const o of m.objs) {
      const s = RT.objectStats(sc, o.id, 2);
      const need = o.id === m.answer ? (g === 0 || (g >= j0 && g <= j1) ? GATE.visMover : GATE.visStaticAny) : (g === 0 ? GATE.visStatic : GATE.visStaticAny);
      if (!(s.frac >= need) || !s.pt) return 'e:vis';
    }
  }
  return '';
}
