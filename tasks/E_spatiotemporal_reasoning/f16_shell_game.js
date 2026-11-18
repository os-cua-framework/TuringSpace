import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock, visT } from '../core/clock.js';
import * as M from '../common/_f16_shell_game_model.js';
import * as V from '../common/_f16_shell_game_view.js';

const NAME = 'f16_shell_game';
const BOARD = { w: M.VIEW.w, h: M.VIEW.h };
export const GATE = { swaps: [4, 5], traps: 2, hideLo: 0.62, hideHi: 0.88, calmOcc: 0.45, step: 0.9, ballVis: 0.6, cupVis: 0.75, edge: 4, margin: 0.006 };
const DEG = M.DEG;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000;
export const DIAG = {};
const rej = (k) => { DIAG[k] = (DIAG[k] || 0) + 1; return null; };
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

const CUPS = [
  { name: 'brass', c: '#b98c45', ks: 0.5, sh: 38, env: 0.25 },
  { name: 'copper', c: '#a9643f', ks: 0.45, sh: 34, env: 0.22 },
  { name: 'steel', c: '#8d949b', ks: 0.55, sh: 44, env: 0.3 },
  { name: 'sky', c: '#7fa6d4', ks: 0.3, sh: 30, env: 0.12 },
  { name: 'cream', c: '#e3ddd0', ks: 0.25, sh: 26, env: 0.1 },
  { name: 'orange', c: '#d8873c', ks: 0.3, sh: 28, env: 0.1 },
];
const FELTS = ['#2f6b4a', '#2b5470', '#3c5e5a', '#5a6b3a', '#4a4f5c'];
const WOODS = [['#8a5a35', '#6e4426', '#a56f45'], ['#a57a4f', '#86603b', '#bf9466'], ['#6b4a33', '#553823', '#83603f']];
const WALLS = ['#e6dfd2', '#dfe3e2', '#e8e1d8', '#d9d4ca'];

export function readers(m, cam, rowsList, ball) {
  const F = M.seqFromRows(m, cam, rowsList);
  return { nn: M.readSeq(m, F, { mode: 'nn', visible: true })[ball], follow: M.followSeq(m, F, ball),
    peek: M.readSeq(m, F, { mode: 'vel', visible: false })[ball], peekNN: M.readSeq(m, F, { mode: 'nn', visible: false })[ball],
    velVis: M.readSeq(m, F, { mode: 'vel', visible: true })[ball], F };
}
function hiddenAt(m, cam, j) {
  const rows = M.rowsOf(m), occ = M.occlusion(m, cam, M.poses3Rows(m, rows[2 + 2 * j])), s = m.sw[j];
  const o = [occ[s.a], occ[s.b]];
  return o[0] >= M.HIDDEN ? s.a : o[1] >= M.HIDDEN ? s.b : -1;
}

export function contract(m) {
  if (!m || m.task !== NAME || ![6].includes(m.n) || !Array.isArray(m.sw) || !m.live) return null;
  const S = m.sw.length, n = m.n;
  if (S < GATE.swaps[0] || S > GATE.swaps[1] || m.N !== 2 * S + 2 || !(m.dt > 0) || Math.abs(m.Lp - m.N * m.dt) > 1e-9) return rej('shape');
  if (!(m.ball >= 0 && m.ball < n)) return rej('ball');
  const cam = M.cameraFor(m), rows = M.rowsOf(m), r0 = m.cup.r0;
  let perm = Array.from({ length: n }, (_, i) => i);
  for (let j = 0; j < S; j++) {
    const s = m.sw[j];
    if (!(s.k >= 0 && s.k + 1 < n) || perm[s.k] !== s.a || perm[s.k + 1] !== s.b) return rej('swap-ids');
    for (let id = 0; id < n; id++) {
      const A = rows[1 + 2 * j][id], B = rows[2 + 2 * j][id], C = rows[3 + 2 * j][id];
      const st1 = Math.hypot(A.x - B.x, A.y - B.y), st2 = Math.hypot(B.x - C.x, B.y - C.y);
      if (id === s.a || id === s.b) { if (st1 > GATE.step * m.s + 1e-9 || st2 > GATE.step * m.s + 1e-9) return rej('step'); }
      else if (st1 > 1e-9 || st2 > 1e-9) return rej('others-move');
    }
    perm = M.applySwap(perm, s.k);
  }
  const fp = M.finalPerm(m), fs = fp.indexOf(m.ball);
  if (fs === m.ball) return rej('final=start');
  const minD = 2 * r0 + GATE.margin;
  for (let f = 0; f < m.N; f++) {
    const R = rows[f];
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) if (Math.hypot(R[i].x - R[k].x, R[i].y - R[k].y) < minD - 1e-9) return rej('contact');
    for (const P of M.poses3At(m, f * m.dt)) for (const p of M.rimPoints(m, P, 12)) {
      const [x, y] = M.projXY(cam, p);
      if (x < GATE.edge || y < GATE.edge || x > M.VIEW.w - GATE.edge || y > M.VIEW.h - GATE.edge) return rej('view');
    }
  }
  if (M.ballVisible(m, cam, 0) < GATE.ballVis) return rej('ball-vis');
  const vis = (f) => Math.min(...M.visibleFrac(m, cam, M.poses3At(m, f * m.dt)));
  for (const f of [0, 1, m.N - 1]) if (vis(f) < GATE.cupVis) return rej('cup-vis');
  const traps = [], local = [];
  for (let j = 0; j < S; j++) {
    const s = m.sw[j], rl = [rows[1 + 2 * j], rows[2 + 2 * j], rows[3 + 2 * j]];
    if (vis(1 + 2 * j) < GATE.cupVis || vis(3 + 2 * j) < GATE.cupVis) return rej('cup-vis-swap');
    if (s.a !== m.ball && s.b !== m.ball) { local.push(null); continue; }
    const occB = M.occlusion(m, cam, M.poses3Rows(m, rows[2 + 2 * j]))[m.ball];
    if (occB >= GATE.hideLo - 1e-9 && occB <= GATE.hideHi + 1e-9) {
      const rd = readers(m, cam, rl, m.ball);
      if (rd.peek === m.ball && rd.nn !== m.ball && rd.follow !== m.ball) traps.push(j);
      local.push({ j, occB, nn: rd.nn, follow: rd.follow, peek: rd.peek });
    } else local.push({ j, occB });
  }
  if (traps.length < GATE.traps) return rej('traps');
  const full = readers(m, cam, M.frameTimes(m).map((t) => rows[M.frameIdx(m, t)]), m.ball);
  if (full.peek !== m.ball) return rej('solve');
  if (full.nn === m.ball || full.follow === m.ball) return rej('readers-ok');
  const lastHid = hiddenAt(m, cam, S - 1);
  if (m.busyBall !== undefined) { const bz = busiest(m.sw.map((q) => [q.a, q.b]), n); if (bz < 0 || (bz === m.ball) !== m.busyBall) return rej('busy-gate'); }
  if (m.lastHideBall !== undefined && ((lastHid === m.ball) !== m.lastHideBall)) return rej('lastHide');
  const tap = M.tapPoint(m, cam, M.poses3At(m, (m.N - 1) * m.dt), m.ball);
  if (!tap) return rej('tap');
  const au = frameAudit(m);
  if (au.singleFrame) return rej('single-frame');
  return { fs, traps, local, tap, lastHid, full: { nn: full.nn, follow: full.follow, peek: full.peek, peekNN: full.peekNN, velVis: full.velVis } };
}
export function gate(m) {
  const c = contract(m);
  if (!c || !m.tap || m.tap.x !== c.tap.x || m.tap.y !== c.tap.y) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
export function frameAudit(m) {
  const fp = M.finalPerm(m), fs = fp.indexOf(m.ball), hits = [];
  if (fs === m.ball) hits.push('reveal-slot');
  return { singleFrame: hits.length > 0, answerSlot: fs, startSlot: m.ball, hits };
}

export function busiest(swaps, n) {
  const inv = Array(n).fill(0); for (const [a, b] of swaps) { inv[a]++; inv[b]++; }
  const top = Math.max(...inv); return inv.filter((v) => v === top).length === 1 ? inv.indexOf(top) : -1;
}
const coin = (rng, p = 0.5) => rng.raw() < p;
export function crossing(m, rng, k, a, b, mode, hiddenId) {
  const U = rng.uniform, s = m.s, r0 = m.cup.r0, xc = (M.slotX(m, k) + M.slotX(m, k + 1)) / 2;
  const dl = (m.row.psi - m.cam.az) * DEG, w = [Math.sin(dl), -Math.cos(dl)], perp = [Math.cos(dl), Math.sin(dl)];
  if (mode === 'trap') {
    const sg = hiddenId === b ? 1 : -1;
    const c = sg * U(0.02, 0.24) * s, yc = U(-0.012, 0.012), D = 2 * r0 + U(0.006, 0.016), q = sg * U(0.02, 0.22) * r0;
    const F = [xc + c - w[0] * D / 2, yc - w[1] * D / 2], K = [F[0] + w[0] * D + perp[0] * q, F[1] + w[1] * D + perp[1] * q];
    return hiddenId === a ? [K, F] : [F, K];
  }
  const yo = U(0.07, 0.1), e = U(0.08, 0.22) * s, sg = coin(rng) ? 1 : -1, frontIsA = coin(rng);
  const F = [xc + sg * e, yo], K = [xc - sg * e, -yo];
  return frontIsA ? [F, K] : [K, F];
}
export function tryBuild(rng, n, S, ball, fTarget, lastHideBall, busyBall) {
  const U = rng.uniform, I = (a, b) => a + Math.floor(rng.raw() * (b - a + 1));
  const r0 = r3(U(0.05, 0.057));
  const cup = { r0, r1: r3(r0 * U(0.68, 0.76)), h: r3(r0 * U(2.1, 2.5)) };
  const az = r2(U(-35, 35)), el = r2(U(17, 23)), delta = r2(U(-24, 24));
  const la = r2(az + (coin(rng) ? -1 : 1) * U(30, 75)), le = r2(U(50, 62));
  const N = 2 * S + 2;
  const m = {
    task: NAME, board: { ...BOARD }, n, cup, s: r3(2 * r0 + U(0.045, 0.07)), dt: 1, live: true, N, Lp: N,
    row: { psi: r2(az + delta) }, cam: { az, el, dist: r2(U(1.15, 1.5)), look: [0, 0.04, 0] }, light: { az: la, el: le },
    ball, lift: r3(U(0.065, 0.08)), tilt: r2(U(14, 22)), sw: [],
    look: { cup: I(0, CUPS.length - 1), felt: I(0, FELTS.length - 1), wood: I(0, WOODS.length - 1), wall: I(0, WALLS.length - 1),
      wallZ: r2(-U(0.75, 1.1)), props: Math.floor(rng.raw() * 1e6) },
    lastHideBall, busyBall,
  };
  const cam = M.cameraFor(m);
  const nTrap = Math.min(S, coin(rng, 0.2) ? 3 : 2), order = Array.from({ length: S }, (_, i) => i).sort(() => rng.raw() - 0.5);
  if (lastHideBall === true) order.sort((x, y) => (y === S - 1) - (x === S - 1));
  const trapSet = new Set(order.slice(0, nTrap));
  const X = busyBall === false ? (ball + 1 + I(0, n - 2)) % n : -1;
  const plan = []; let perm = Array.from({ length: n }, (_, i) => i), prevK = -1;
  for (let j = 0; j < S; j++) {
    const bs = perm.indexOf(ball), want = trapSet.has(j);
    let ks = [];
    for (let k = 0; k + 1 < n; k++) { if (k === prevK && !coin(rng, 0.3)) continue; const has = k === bs || k + 1 === bs; if (want ? has : (has ? coin(rng, 0.1) : true)) ks.push(k); }
    if (!ks.length) return rej('pairs');
    if (busyBall !== undefined) {
      const pref = (k) => { const ids = [perm[k], perm[k + 1]]; return busyBall ? ids.includes(ball) : ids.includes(X); };
      const good = ks.filter(pref);
      if (good.length && coin(rng, 0.85)) ks = good;
    }
    const k = ks[I(0, ks.length - 1)], a = perm[k], b = perm[k + 1], has = k === bs || k + 1 === bs;
    let mode, hiddenId = -1;
    if (want) { mode = 'trap'; hiddenId = ball; }
    else if (!has && coin(rng, 0.7)) { mode = 'trap'; hiddenId = coin(rng) ? a : b; }
    else mode = 'calm';
    plan.push({ k, a, b, mode, hiddenId, pre: perm });
    perm = M.applySwap(perm, k); prevK = k;
  }
  if (perm.indexOf(ball) !== fTarget) return rej('fTarget');
  if (busyBall !== undefined && busiest(plan.map((q) => [q.a, q.b]), n) !== (busyBall ? ball : X)) return rej('busy');
  const lastPlan = plan[S - 1];
  if (lastHideBall !== undefined && (((lastPlan.mode === 'trap' ? lastPlan.hiddenId : -1) === ball) !== lastHideBall)) return rej('lastHide-plan');
  for (const { k, a, b, mode, hiddenId, pre } of plan) {
    const perm = pre;
    let mid = null;
    for (let tr = 0; tr < 60 && !mid; tr++) {
      const cand = crossing(m, rng, k, a, b, mode, hiddenId);
      const start = M.baseRows(m, perm, false), midR = start.map((q) => ({ ...q })), end = M.baseRows(m, M.applySwap(perm, k), false);
      midR[a] = { x: cand[0][0], y: cand[0][1], lift: 0, tilt: 0 }; midR[b] = { x: cand[1][0], y: cand[1][1], lift: 0, tilt: 0 };
      const ok = [a, b].every((id) => Math.hypot(start[id].x - midR[id].x, start[id].y - midR[id].y) <= GATE.step * m.s && Math.hypot(end[id].x - midR[id].x, end[id].y - midR[id].y) <= GATE.step * m.s);
      if (!ok) { rej('L-step'); continue; }
      if (Math.min(...[start, midR, end].map((rw) => { let d = Infinity; for (let i = 0; i < n; i++) for (let q = i + 1; q < n; q++) d = Math.min(d, Math.hypot(rw[i].x - rw[q].x, rw[i].y - rw[q].y)); return d; })) < 2 * r0 + GATE.margin) { rej('L-contact'); continue; }
      const occ = M.occlusion(m, cam, M.poses3Rows(m, midR));
      if (mode === 'trap') {
        if (!(occ[hiddenId] >= GATE.hideLo && occ[hiddenId] <= GATE.hideHi)) { rej(occ[hiddenId] < GATE.hideLo ? 'L-occ-low' : 'L-occ-high'); continue; }
        if (hiddenId === ball) {
          const rd = readers(m, cam, [start, midR, end], ball);
          if (!(rd.peek === ball && rd.nn !== ball && rd.follow !== ball)) { rej(rd.peek !== ball ? 'L-peek' : rd.nn === ball ? 'L-nn' : 'L-follow'); continue; }
        }
      } else if (!(occ[a] <= GATE.calmOcc && occ[b] <= GATE.calmOcc)) continue;
      mid = cand;
    }
    if (!mid) return rej('mid-' + mode + (hiddenId === ball ? '-ball' : ''));
    m.sw.push({ k, a, b, mid: mid.map((q) => q.map(r4)), trap: mode === 'trap', hidden: hiddenId });
  }
  const c = contract(m);
  if (!c) return rej('contract');
  m.tap = c.tap;
  m.gtContract = 'tap the cup the ball is under in the rest frame (last frame), then Verify (identity, not place)';
  return m;
}

const restT = (m) => (m.N - 1) * m.dt;
const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${M.VIEW.w} board px`, y: `0..${M.VIEW.h} board px`, note: 'pick the cup under the point (only in the last frame of the clip, when the cups are still; can be changed until Verify)' },
    ],
    promptHuman: 'Tap the cup hiding the ball',
  },

  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const top = mulberry32(mix32(key, 0x51a7e000));
    const n = 6, f = Math.min(n - 1, Math.floor(rng.raw() * n)), lastHideBall = rng.raw() < 1 / n, busyBall = rng.raw() < 1 / n;
    for (let cfg = 0; cfg < 40; cfg++) {
      const S = top() < 0.5 ? 4 : 5; let ball = Math.floor(top() * (n - 1)); if (ball >= f) ball++;
      for (let a = 0; a < 2500; a++) {
        const m = tryBuild(R(mulberry32(mix32(key, cfg * 100000 + a))), n, S, ball, f, lastHideBall, busyBall);
        if (m) return m;
      }
    }
    throw new Error('f16_shell_game: generator exhausted');
  },

  frames(m) { return { n: m.N, period: m.Lp }; },
  init() { return { ...clockState(), sel: -1 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    if (!M.atRest(m, st.t)) return { ok: false, reason: 'cups-moving' };
    const id = M.pickCup(m, M.cameraFor(m), M.poses3At(m, st.t), a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-cup' };
    st.sel = id;
    return { ok: true };
  },

  verify(st, m) {
    const fp = M.finalPerm(m), ok = st.sel === m.ball;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { picked: st.sel, pickedSlot: st.sel >= 0 ? fp.indexOf(st.sel) : null, ball: m.ball, ballSlot: fp.indexOf(m.ball), startSlot: m.ball, frame: M.frameIdx(m, st.t) + 1, cups: m.n } };
  },

  oracle(m) { return [{ op: 'wait', sec: r3(restT(m)) }, { op: 'tap', x: m.tap.x, y: m.tap.y }]; },

  randomPolicy(m, rnd) {
    const cam = M.cameraFor(m), PT = M.poses3At(m, restT(m)), id = Math.floor(rnd() * m.n), p = M.tapPoint(m, cam, PT, id) || m.tap;
    return [{ op: 'wait', sec: r3(restT(m)) }, { op: 'tap', x: p.x, y: p.y }];
  },

  drawPrompt(g, r) { drawPromptText(g, r, 'Tap the cup hiding the ball', 'Press Next frame to step through · tap a cup when they are still'); },

  tick(env, dt) { return tickClock(env, dt, { running: () => true }); },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    V.drawView(g, env, visT(env), { CUPS, FELTS, WOODS, WALLS });
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const st = env.state, m = env.manifest;
    if (evt.y > M.VIEW.h || !M.atRest(m, st.t)) return [];
    if (M.pickCup(m, M.cameraFor(m), M.poses3At(m, st.t), evt.x, evt.y) < 0) return [];
    return [{ op: 'tap', x: evt.x, y: evt.y }];
  },

  footerStatus(env) { return env.state.sel >= 0 ? 'Cup picked' : 'No cup picked'; },
};
export default task;
