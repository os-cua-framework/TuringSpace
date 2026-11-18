import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as W from './_mutual_gaze_pick_scene.js';
import * as G from './_mutual_gaze_pick_gen.js';

const RT = W.RT;
const NAME = 'mutual_gaze_pick';
const VIEW = W.VIEW;
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Tap the two people who look at each other', SUB = 'The clip loops';
export const GATE = G.GATE;
const r3 = (v) => Math.round(v * 1000) / 1000;

export const loopLen = (m) => m.T + m.hold;
export function sceneTime(m, t) { const L = loopLen(m), u = ((t % L) + L) % L; return Math.min(u, m.T); }

const SC_CACHE = { m: null, t: NaN, sc: null };
export function sceneCached(m, tau) {
  if (SC_CACHE.m !== m || SC_CACHE.t !== tau) { SC_CACHE.m = m; SC_CACHE.t = tau; SC_CACHE.sc = W.sceneAt(m, tau); }
  return SC_CACHE.sc;
}
export function pickAt(m, tau, x, y) {
  if (!(x >= 0 && y >= 0 && x <= VIEW.w && y <= VIEW.h)) return -1;
  const id = RT.pickNear(sceneCached(m, tau), x, y, 5);
  const p = W.personOf(id);
  if (p >= 0) return p;
  return id >= 10 && id < 20 ? id - 10 : -1;
}

const sampleTimes = (m, step = 0.5) => { const out = []; for (let t = 0; t < m.T - 1e-9; t += step) out.push(r3(t)); out.push(m.T); return out; };
export function headVis(m, tau, sc = W.sceneAt(m, tau)) {
  const cam = sc.cam, b = W.camBasis(m), H = W.headsAt(m, tau);
  return H.map((h, i) => {
    const r = 0.085 * m.people[i].k * W.HEAD_S;
    let vis = 0, tot = 0;
    for (const [u, v] of [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.6], [0, -0.6], [0.4, 0.42], [-0.4, 0.42], [0.4, -0.42], [-0.4, -0.42]]) {
      const p = [h.c[0] + (b.R[0] * u + b.U[0] * v) * r, h.c[1] + (b.R[1] * u + b.U[1] * v) * r, h.c[2] + (b.R[2] * u + b.U[2] * v) * r];
      const q = RT.rayToPoint(sc, p[0], p[1], p[2]);
      tot++; if (q.id === W.ID.person(i)) vis++;
    }
    const c = W.project(cam, h.c), px = cam.f * r / Math.max(0.1, c[2]);
    return { frac: vis / tot, x: c[0], y: c[1], px };
  });
}
function tapPoints(m) {
  const ts = sampleTimes(m), cam = W.camOf(m);
  return m.people.map((P, i) => {
    for (const y of [W.SEAT_Y + 0.36 * P.k, W.SEAT_Y + 0.5 * P.k, W.SEAT_Y + 0.22 * P.k, W.neckTop(P)[1] + 0.03]) {
      const c = W.project(cam, [P.x, y, P.z]);
      if (ts.every((t) => pickAt(m, t, c[0], c[1]) === i)) return [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10];
    }
    return null;
  });
}
export function frameReadings(m, tau) {
  const H = W.headsAt(m, tau), cam = W.camOf(m), n = m.people.length;
  let g3 = [null, Infinity], gs = [null, Infinity], gb = [null, Infinity];
  for (const [i, j] of G.pairsOf(n)) {
    const e3 = Math.max(W.gazeErr(H, i, j), W.gazeErr(H, j, i)), es = Math.max(G.screenErr(cam, H, i, j), G.screenErr(cam, H, j, i));
    const eb = Math.max(W.bodyErr(m, H, i, j), W.bodyErr(m, H, j, i));
    if (e3 < g3[1]) g3 = [[i, j], e3]; if (es < gs[1]) gs = [[i, j], es]; if (eb < gb[1]) gb = [[i, j], eb];
  }
  return { g3, gs, gb };
}
const samePair = (p, q) => !!p && !!q && ((p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

export function trapProblem(m, S = G.series(m)) {
  const g = GATE, K = S.K, dt = S.dt, n = m.people.length, [A, B] = m.answer, ro = m.roles;
  const at = (k) => (k % K + K) % K;
  const { p, q } = ro.a;
  if (samePair([p, q], m.answer)) return 'a:pair';
  const lookRuns = (i, j) => G.runs(Array.from({ length: K }, (_, k) => S.err[i][j][k] <= g.look)).filter((r) => r.len * dt >= 2.0);
  const r1 = lookRuns(p, q), r2 = lookRuns(q, p);
  let okA = false;
  for (const x of r1) for (const y of r2) {
    const gap = Math.min(at(y.s - x.e), at(x.s - y.e)) * dt;
    const md = at(Math.round((y.s + y.e) / 2 - (x.s + x.e) / 2)) * dt, mid = Math.min(md, m.T - md);
    if (gap >= 0.5 && mid >= g.aMid) okA = true;
  }
  if (!okA) return 'a:runs';
  const { c, d, e } = ro.b;
  if (samePair([c, d], m.answer) || samePair([c, e], m.answer)) return 'b:pair';
  const rb = G.runs(G.bOnFlags(m, S));
  if (rb.length !== 1) return 'b:runs';
  const r = rb[0];
  if (r.e > K || r.s * dt < g.bWin[0] || r.s * dt > g.bStartMax || r.e * dt > g.bWin[1] + 1e-9) return 'b:window';
  if (r.len * dt < g.bLen[0] - 1e-9 || r.len * dt > g.bLen[1] + 1e-9) return 'b:len';
  for (let k = r.s; k < r.e; k++) if (!(S.err[c][d][k] >= g.bErr)) return 'b:3d';
  const bas = W.camBasis(m), Hb = S.H[Math.round((r.s + r.e) / 2)];
  if (!(W.camNorm(bas, Hb[e].c)[2] > W.camNorm(bas, Hb[d].c)[2] + g.bDepth)) return 'b:depth';
  if (!(ro.b.seamSide === 'D' ? S.err[d][c][0] <= g.look : S.err[c][e][0] <= g.look)) return 'b:seam';
  for (const [i, j] of G.pairsOf(n)) {
    if (samePair([i, j], [c, d])) continue;
    for (let k = 0; k < K; k++) if (Math.max(S.scr[i][j][k], S.scr[j][i][k]) < g.sFloor) return 's:floor';
  }
  const { x, y } = ro.c;
  if (samePair([x, y], m.answer)) return 'c:pair';
  const cFlags = Array.from({ length: K }, (_, k) => S.body[x][y][k] <= g.cBody && S.body[y][x][k] <= g.cBody && S.err[y][x][k] <= g.look && S.err[x][y][k] >= g.cHeadAway);
  if (!G.runs(cFlags).some((rr) => rr.len * dt >= 2.0)) return 'c:runs';
  const mut = Array.from({ length: K }, (_, k) => Math.max(S.err[A][B][k], S.err[B][A][k]) <= g.look);
  for (let k = 0; k < K; k++) {
    if (mut[k] && Math.max(S.body[A][B][k], S.body[B][A][k]) < g.ansBodyOff) return 'd:off';
    if (Math.max(S.body[A][B][k], S.body[B][A][k]) < g.ansBodyAll) return 'd:all';
  }
  const fr = frameReadings(m, 0);
  if (samePair(fr.g3[0], m.answer) || samePair(fr.gs[0], m.answer) || samePair(fr.gb[0], m.answer)) return 'e:reading';
  return '';
}
export function pictureProblem(m) {
  for (const t of sampleTimes(m)) {
    for (const h of headVis(m, t)) {
      if (!(h.frac >= GATE.visHead)) return 'f:vis';
      if (h.x - h.px < GATE.edge || h.x + h.px > VIEW.w - GATE.edge || h.y - 1.3 * h.px < GATE.edge || h.y + h.px > VIEW.h - GATE.edge) return 'f:edge';
      if (2 * h.px < GATE.headPx) return 'f:small';
    }
  }
  return '';
}

function contract(m) {
  if (!m || m.task !== NAME || !m.live || !Array.isArray(m.people) || m.people.length < 4 || m.people.length > 6) return false;
  if (!(m.T >= GATE.T[0] - 1e-9 && m.T <= GATE.T[1] + 1e-9) || !(m.hold >= GATE.hold[0] - 1e-9 && m.hold <= GATE.hold[1] + 1e-9)) return false;
  if (!Array.isArray(m.answer) || m.answer.length !== 2 || !(m.answer[0] < m.answer[1]) || m.answer[1] >= m.people.length) return false;
  if (!m.roles || !m.roles.a || !m.roles.b || !m.roles.c || !Array.isArray(m.roles.m) || m.roles.m.length !== 2) return false;
  if (!Array.isArray(m.mutual) || m.mutual.length !== 2) return false;
  if (!Array.isArray(m.taps) || m.taps.length !== m.people.length || m.taps.some((p) => !p)) return false;
  return m.people.every((P) => Array.isArray(P.gaze) && P.gaze.length && Array.isArray(P.body) && P.body.length);
}
export function gate(m) {
  if (!contract(m)) return false;
  const S = G.series(m);
  if (G.checkTimeline(m, S) || trapProblem(m, S) || pictureProblem(m)) return false;
  const ts = sampleTimes(m);
  if (m.taps.some((p, i) => ts.some((t) => pickAt(m, t, p[0], p[1]) !== i))) return false;
  if (Math.abs(sceneTime(m, oracleWait(m)) - mutualMid(m)) > 1e-6) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (task.applyAction(st, a, m).ok === false) return false;
  return task.verify(st, m).success;
}

function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
export const _genStats = G._genStats;
function postProblem(m) {
  m.task = NAME;
  m.board = { ...BOARD };
  const S0 = G.takeSeries(m), S = S0 ? G.completeSeries(m, S0) : G.series(m);
  const tp = trapProblem(m, S);
  if (tp) return { why: tp, S };
  const pp = pictureProblem(m);
  if (pp) return { why: pp, S };
  m.taps = tapPoints(m);
  if (m.taps.some((p) => !p)) return { why: 'taps', S };
  return { why: '', S };
}
function build(rng, n, dis, pinK) {
  let post = null;
  const m = n >= 6
    ? G.tryBuild(rng, n, dis, { tries: 60, pin: pinK, accept: (mm) => { post = postProblem(mm); if (post.why) { _genStats[post.why] = (_genStats[post.why] || 0) + 1; return false; } return true; } })
    : G.tryBuild(rng, n, dis);
  if (!m) return null;
  if (!post || pinK !== undefined) { post = postProblem(m); if (post.why) { _genStats[post.why] = (_genStats[post.why] || 0) + 1; return null; } }
  const S = post.S;
  m.mutual = G.mutualRuns(m, S).map((rm) => ({ s: r3(rm.s * S.dt), len: r3(rm.len * S.dt) }));
  return m;
}
const mutualMid = (m) => r3(m.mutual[0].s + m.mutual[0].len / 2);
const oracleWait = (m) => mutualMid(m);
function oracleWaits(m) { const w = oracleWait(m), k = Math.ceil(w), out = []; for (let i = 0; i < k; i++) out.push(r3(w / k)); out[k - 1] = r3(w - out.slice(0, k - 1).reduce((a, b) => a + b, 0)); return out; }

const task = {
  meta: {
    name: NAME, family: 'T', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the person under the point (tap a selected person again to clear; with two selected, a new tap replaces the older one; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const r0 = mulberry32(mix32(key, 0x5eed0000));
    const n0 = r0() < 0.5 ? 4 : 5, hold = r3(GATE.hold[0] + (GATE.hold[1] - GATE.hold[0]) * r0()), dis0 = n0 === 5 && r0() < 0.4;
    const n = knobs.nPeople ?? n0, dis = knobs.nPeople ? (n >= 5 && r0() < 0.4) : dis0;
    if (knobs.pin) {
      const m = build(R(mulberry32(mix32(key, knobs.pin.a))), n, dis, knobs.pin.k);
      if (m) { m.live = true; m.hold = hold; m.attempt = knobs.pin.a; m.pin = { a: knobs.pin.a, k: m.sched }; delete m.sched; return m; }
    }
    for (let a = 0; a < 20000; a++) {
      const m = build(R(mulberry32(mix32(key, a))), n, dis);
      if (m) { m.live = true; m.hold = hold; m.attempt = a; if (m.sched !== undefined) { m.pin = { a, k: m.sched }; delete m.sched; } return m; }
    }
    throw new Error('mutual_gaze_pick: generator exhausted');
  },

  init() { return { ...clockState(), sel: [], taps: 0, tauSel: [] }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? 1;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    const tau = sceneTime(m, st.t), id = pickAt(m, tau, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-person' };
    const k = st.sel.indexOf(id);
    if (k >= 0) { st.sel.splice(k, 1); st.tauSel.splice(k, 1); }
    else { st.sel.push(id); st.tauSel.push(r3(tau)); if (st.sel.length > 2) { st.sel.shift(); st.tauSel.shift(); } }
    st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel.length === 2 && samePair(st.sel, m.answer);
    const ro = m.roles, sel = st.sel.slice().sort((a, b) => a - b);
    const which = (p) => (samePair(p, [ro.a.p, ro.a.q]) ? 'trapA' : samePair(p, [ro.b.c, ro.b.d]) ? 'trapB' : samePair(p, [ro.c.x, ro.c.y]) ? 'trapC' : samePair(p, m.answer) ? 'answer' : 'other');
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : (st.sel.filter((i) => m.answer.includes(i)).length / 2),
      detail: { selected: sel, answer: m.answer, picked: sel.length === 2 ? which(sel) : null, n: m.people.length, seam: ro.seam,
        t: r3(st.t), loops: Math.floor(st.t / loopLen(m)), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) {
    const [a, b] = m.answer;
    return [...oracleWaits(m).map((sec) => ({ op: 'wait', sec })), { op: 'tap', x: m.taps[a][0], y: m.taps[a][1] }, { op: 'tap', x: m.taps[b][0], y: m.taps[b][1] }];
  },

  randomPolicy(m, rnd) {
    const n = m.people.length, i = Math.floor(rnd() * n); let j = Math.floor(rnd() * (n - 1)); if (j >= i) j++;
    return [{ op: 'tap', x: m.taps[i][0], y: m.taps[i][1] }, { op: 'tap', x: m.taps[j][0], y: m.taps[j][1] }];
  },

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

  footerStatus(env) { const k = env.state.sel.length; return k === 0 ? 'Nothing selected' : `${k} selected`; },
};
export default task;

const Q_PLAY = 2, Q_MOVE = 1.25, LAYER_MAX = 30;
function view(env) {
  return (env._mgp ??= { m: null, bg: new Map(), layers: new Map(), ring: null, ringKey: '', drawnHi: false, ms: [], sc: null, scKey: '', uid: 0 });
}
function lru(map, key, max, make) {
  if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v);
  while (map.size > max) map.delete(map.keys().next().value);
  return v;
}
function personRect(m, i, q) {
  const cam = W.camOf(m), poses = m.people.map(() => null); poses[i] = q;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of W.dynamicShapes(m, 0, undefined, poses, i)) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
  }
  return { x: Math.floor(x0 - 7), y: Math.floor(y0 - 7), w: Math.ceil(x1 - x0 + 14), h: Math.ceil(y1 - y0 + 14) };
}
const ORDER = new WeakMap();
function farToNear(m) {
  let o = ORDER.get(m);
  if (!o) { const b = W.camBasis(m); o = m.people.map((P, i) => [W.camNorm(b, W.neckTop(P))[2], i]).sort((a, c) => c[0] - a[0]).map((x) => x[1]); ORDER.set(m, o); }
  return o;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.bg.clear(); V.layers.clear(); V.ringKey = ''; }
  const tau = sceneTime(m, st.t), still = CLOCK.paused || !!env.submitted;
  const qL = still ? q : Math.min(q, Q_PLAY);
  const bg = lru(V.bg, `${q}`, 2, () => { const t0 = now(); const img = RT.render(W.backgroundScene(m), q, q >= 1.5 ? 1 : 2); img.canvas = RT.toCanvas(img); img.data = null; V.bgMs = Math.round(now() - t0); return img; });
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(bg.canvas, 0, 0, VIEW.w, VIEW.h);
  const poses = m.people.map((_, i) => W.poseAt(m, i, tau));
  const pk = (i) => `${poses[i].b.toFixed(2)},${poses[i].g.toFixed(2)},${poses[i].p.toFixed(2)}`;
  const t0 = now(); let traced = 0;
  const movers = farToNear(m).filter((i) => poses[i].gMoving > 0 || poses[i].bMoving > 0);
  const qOf = (i) => (still ? q : movers.includes(i) ? Math.min(q, movers.indexOf(i) < movers.length - 2 ? 1 : Q_MOVE) : qL);
  const layers = farToNear(m).map((i) => lru(V.layers, `${qOf(i)}|${still ? 'hi' : 'lo'}|${i}|${pk(i)}`, LAYER_MAX, () => {
    const img = RT.renderKeep(W.sceneOne(m, i, poses[i], !still), qOf(i), personRect(m, i, poses[i]), new Set([W.ID.person(i), W.ID.back(i)]), 1);
    img.canvas = RT.toCanvas(img); img.data = null; img.uid = ++V.uid; traced++;
    return img;
  }));
  if (traced) { V.ms.push([qL, traced, Math.round(now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
  for (const L of layers) g.drawImage(L.canvas, L.x, L.y, L.w / L.q, L.h / L.q);
  if (st.sel.length) {
    const rk = `${st.sel.join(',')}|${layers.map((L) => L.uid).join(',')}`;
    if (V.ringKey !== rk) {
      V.ringKey = rk;
      const set = new Set(st.sel.map((i) => W.ID.person(i)));
      V.ring = layers.filter((L) => L.ids.some((v) => set.has(v))).map((L) => ({ L, img: RT.toCanvas(RT.ringImage({ w: L.w, h: L.h, q: L.q, ids: L.ids }, set)) }));
    }
    for (const { L, img } of V.ring) g.drawImage(img, L.x, L.y, L.w / L.q, L.h / L.q);
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
  V.drawnHi = still;
}
export function _viewStats(env) { const V = view(env); return { bgMs: V.bgMs, ms: V.ms.slice() }; }
