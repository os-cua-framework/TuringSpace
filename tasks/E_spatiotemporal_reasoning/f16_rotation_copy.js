import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import * as G from '../common/_rotation_watch_copy_geom.js';

const NAME = 'f16_rotation_copy';
const PROMPT = 'Turn B the way A turns in the clip', SUB = 'Press Next frame to step through the clip';
const BOARD = { w: 380, h: 316 };
export const PANEL = { A: { x: 0, y: 0, w: 186, h: 210 }, B: { x: 194, y: 0, w: 186, h: 210 } };
const EA = 34, EB = 23;
const CEN = { A: { x: 93, y: 116 }, B: { x: 287, y: 116 } };
const BTN = { y: [218, 268], h: 44, gap: 6 };
export const SWING = [22.5, 45, 67.5];
export const FRAMES = [{ i: 0 }, { i: 0 }, { turn: 0, th: SWING[0] }, { turn: 0, th: SWING[1] }, { turn: 0, th: SWING[2] }, { i: 1 }, { i: 1 },
  { turn: 1, th: SWING[0] }, { turn: 1, th: SWING[1] }, { turn: 1, th: SWING[2] }, { i: 2 }, { i: 2 }];
export const TIMING = { readDeg: 12, dirSep: 60 };
export const frames = () => ({ n: FRAMES.length, period: FRAMES.length });
export const frameIdx = (m, t) => { const n = FRAMES.length; return ((Math.round(t) % n) + n) % n; };
export function aPoseFrame(A, k) {
  const R = A.turns.map((t) => G.qturn(t.axis, t.dir));
  const P = [A.P0, G.mul(R[0], A.P0), G.mul(R[1], G.mul(R[0], A.P0))], f = FRAMES[k];
  if (f.i !== undefined) return { M: P[f.i], th: 0, i: f.i };
  const T = A.turns[f.turn];
  return { M: G.mul(G.rotAxis(T.axis, T.dir * f.th * Math.PI / 180), P[f.turn]), th: f.th, i: f.turn };
}
const B_ANIM = 0.38;
const r3 = (v) => Math.round(v * 1000) / 1000;
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export function buttons() {
  const w = (BOARD.w - 3 * BTN.gap) / 4, out = [];
  G.AXES.forEach((axis, c) => [1, -1].forEach((dir, r) => out.push({ id: `${axis}${dir > 0 ? '+' : '-'}`, a: { op: 'turn', axis, dir }, x: c * (w + BTN.gap), y: BTN.y[r], w, h: BTN.h })));
  out.push({ id: 'undo', a: { op: 'undo' }, label: 'Undo', x: 3 * (w + BTN.gap), y: BTN.y[0], w, h: BTN.h });
  out.push({ id: 'reset', a: { op: 'reset' }, label: 'Reset', x: 3 * (w + BTN.gap), y: BTN.y[1], w, h: BTN.h });
  return out;
}
const hitBtn = (x, y) => buttons().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;

export function turnMats(m) { return m.A.turns.map((t) => G.qturn(t.axis, t.dir)); }
export function readings(m) {
  const [R1, R2] = turnMats(m), T = m.A.turns, inv = G.transpose;
  const n1 = G.third(T[0].axis, T[1].axis);
  const sw = (a) => ({ x: 'y', y: 'x', z: 'z' }[a]);
  const out = {
    correct: G.mul(R2, R1),
    simplest_a: G.qturn(n1, 1), simplest_b: G.qturn(n1, -1),
    order_swapped: G.mul(R1, R2),
    first_reversed: G.mul(R2, inv(R1)), second_reversed: G.mul(inv(R2), R1), both_reversed: G.mul(inv(R2), inv(R1)),
    time_reversed: inv(G.mul(R2, R1)),
    first_only: R1, second_only: R2, nothing: G.ID.slice(),
    xy_swapped: G.mul(G.qturn(sw(T[1].axis), T[1].dir), G.qturn(sw(T[0].axis), T[0].dir)),
  };
  const zi = T.findIndex((t) => t.axis === 'z');
  if (zi >= 0) out.vertical_reversed = zi === 0 ? G.mul(R2, inv(R1)) : G.mul(inv(R2), R1);
  return out;
}
function readingOf(m, rot) {
  const rd = readings(m);
  for (const [k, M] of Object.entries(rd)) if (G.matEq(M, rot)) return k;
  return 'other';
}

const barAxisOf = (M) => G.axisOfVec(G.ap(M, [1, 0, 0]));
export function firstLastSets(m) {
  const A = m.A, Rg = G.mul(turnMats(m)[1], turnMats(m)[0]);
  const endAx = barAxisOf(G.mul(Rg, A.P0)), startAx = barAxisOf(A.P0);
  const coset = new Set(), struct = new Map();
  for (const M of G.ROT) if (barAxisOf(G.mul(M, A.P0)) === endAx) coset.add(G.mkey(M));
  for (const P of G.ROT) {
    if (barAxisOf(P) !== startAx) continue;
    for (const a1 of G.AXES) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      if (a1 === startAx) continue;
      const R1 = G.qturn(a1, s1), R2 = G.qturn(startAx, s2);
      if (barAxisOf(G.mul(R2, G.mul(R1, P))) !== endAx) continue;
      const k = G.mkey(G.mul(R2, R1)); struct.set(k, (struct.get(k) || 0) + 1);
    }
  }
  return { coset, struct, endAx, startAx };
}

const lib = () => G.library();
const cellsOk = (s) => Array.isArray(s) && s.length >= 6 && s.length <= 7 && s.every((c) => [c.x, c.y, c.z].every(Number.isInteger) && (c.k === 0 || c.k === 1));
const degreesOf = (s) => { const S = new Set(s.map((c) => `${c.x},${c.y},${c.z}`)); return s.map((c) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].filter((d) => S.has(`${c.x + d[0]},${c.y + d[1]},${c.z + d[2]}`)).length); };
const LEGIBLE_TRAPS = ['simplest_a', 'simplest_b', 'order_swapped'];
function bProblem(m) {
  const s = m.B?.cells;
  if (!cellsOk(s) || s.filter((c) => c.k).length !== 1) return 'B:cells';
  if (G.stabilizer(s) !== 1) return 'B:sym';
  const libKeys = new Set(lib().map((q) => G.canonAny(q)));
  if (!libKeys.has(G.canonAny(s))) return 'B:lib';
  const d = degreesOf(s); if (d[s.findIndex((c) => c.k)] !== 1 || d.filter((v) => v === 1).length !== 2) return 'B:head';
  if (!G.legible(s) || !G.legible(G.tf(m.g, s))) return 'B:legible';
  const rd = readings(m);
  if (!LEGIBLE_TRAPS.every((k) => G.legible(G.tf(rd[k], s)))) return 'B:trapLegible';
  return '';
}
function aProblem(m) {
  const A = m.A;
  if (!A || !Array.isArray(A.turns) || A.turns.length !== 2) return 'A:shape';
  if (!G.ROT.some((M) => G.matEq(M, A.P0))) return 'A:P0';
  const [t1, t2] = A.turns;
  if (!A.turns.every((t) => G.AXES.includes(t.axis) && (t.dir === 1 || t.dir === -1))) return 'A:turn';
  if (t1.axis === t2.axis) return 'A:sameAxis';
  const ax0 = barAxisOf(A.P0), ax1 = barAxisOf(G.mul(G.qturn(t1.axis, t1.dir), A.P0));
  if (t1.axis === ax0 || t2.axis === ax1) return 'A:spin';
  if (A.n0 !== ax0) return 'A:n0';
  const Rg = G.mul(G.qturn(t2.axis, t2.dir), G.qturn(t1.axis, t1.dir));
  if (!G.matEq(Rg, m.g) || G.rotDeg(Rg) !== 120) return 'A:g';
  for (let i = 0; i < 2; i++) {
    const T = A.turns[i], Pstart = i === 0 ? A.P0 : G.mul(G.qturn(t1.axis, t1.dir), A.P0);
    if (FRAMES.filter((f) => f.turn === i).length !== 3) return 'A:swingFrames';
    if (!SWING.every((th) => Math.min(th, 90 - th) >= TIMING.readDeg)) return 'A:readable';
    const half = (dir) => G.ap(G.mul(G.rotAxis(T.axis, dir * Math.PI / 4), Pstart), [1, 0, 0]);
    if (G.angDiff180(G.screenAngle(half(T.dir)), G.screenAngle(half(-T.dir))) < TIMING.dirSep) return 'A:dirSep';
  }
  return '';
}
function trapProblem(m) {
  const rd = readings(m), kB = (M) => G.key(G.tf(M, m.B.cells)), k0 = kB(rd.correct);
  for (const [name, M] of Object.entries(rd)) if (name !== 'correct' && kB(M) === k0) return 'trap:' + name;
  const F = firstLastSets(m);
  if (F.coset.size !== 8 || !F.coset.has(G.mkey(rd.correct))) return 'fl:coset';
  if (F.struct.size < 4 || !F.struct.has(G.mkey(rd.correct))) return 'fl:struct';
  const cnt = [...F.struct.values()], tot = cnt.reduce((a, b) => a + b, 0);
  if (Math.max(...cnt) / tot > 0.25 + 1e-9) return 'fl:best';
  if (!F.coset.has(G.mkey(rd.simplest_a)) || !F.coset.has(G.mkey(rd.simplest_b))) return 'fl:simplest';
  return '';
}
function frameProblem(m) {
  const A = m.A, PA = PANEL.A, PB = PANEL.B, M = 6;
  const inside = (ext, C, P) => C.x + ext[0] >= P.x + M && C.x + ext[2] <= P.x + P.w - M && C.y + ext[1] >= P.y + 24 && C.y + ext[3] <= P.y + P.h - M;
  for (let k = 0; k < FRAMES.length; k++) if (!inside(G.extent(G.A_CELLS, aPoseFrame(A, k).M, EA), CEN.A, PA)) return 'frame:A';
  for (let ti = 0; ti < 2; ti++) for (let th = 0; th <= 90; th += 3) {
    const Pst = ti === 0 ? A.P0 : G.mul(G.qturn(A.turns[0].axis, A.turns[0].dir), A.P0);
    if (!inside(G.extent(G.A_CELLS, G.mul(G.rotAxis(A.turns[ti].axis, A.turns[ti].dir * th * Math.PI / 180), Pst), EA), CEN.A, PA)) return 'frame:A';
  }
  for (const Mr of G.ROT) {
    if (!inside(G.extent(m.B.cells, Mr, EB), CEN.B, PB)) return 'frame:B';
    for (const ax of G.AXES) if (!inside(G.extent(m.B.cells, G.mul(G.rotAxis(ax, Math.PI / 4), Mr), EB), CEN.B, PB)) return 'frame:Bturn';
  }
  return '';
}
export function problem(m) {
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return 'contract';
  return aProblem(m) || bProblem(m) || trapProblem(m) || frameProblem(m) || '';
}
export function gate(m) {
  if (problem(m)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}

function normCells(s) {
  const mx = Math.min(...s.map((c) => c.x)), my = Math.min(...s.map((c) => c.y)), mz = Math.min(...s.map((c) => c.z));
  return s.map((c) => ({ x: c.x - mx, y: c.y - my, z: c.z - mz, k: c.k })).sort((p, q) => p.x - q.x || p.y - q.y || p.z - q.z);
}
export const _genStats = {};
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };
function tryBuild(rng, prog) {
  const U = rng.uniform;
  const P0s = G.ROT.filter((M) => barAxisOf(M) === prog.n0);
  const A = {
    n0: prog.n0, P0: rng.pick(P0s).slice(),
    turns: [{ axis: prog.a1, dir: prog.s1 }, { axis: prog.n0, dir: prog.s2 }],
  };
  const g = G.mul(G.qturn(A.turns[1].axis, A.turns[1].dir), G.qturn(A.turns[0].axis, A.turns[0].dir));
  const L = lib(), ib = rng.int(0, L.length - 1), base = L[ib];
  const ends = degreesOf(base).map((v, j) => (v === 1 ? j : -1)).filter((j) => j >= 0), hi = rng.pick(ends);
  const marked = base.map((c, j) => ({ x: c.x, y: c.y, z: c.z, k: j === hi ? 1 : 0 }));
  const rd = readings({ A }), want = [g, ...LEGIBLE_TRAPS.map((k) => rd[k])];
  const poses = G.ROT.filter((M) => G.legible(G.tf(M, marked)) && want.every((X) => G.legible(G.tf(G.mul(X, M), marked))));
  if (!poses.length) return fail('B:noPose');
  const cells = normCells(G.tf(rng.pick(poses), marked));
  const m = { task: NAME, board: { ...BOARD }, dt: 1, A, B: { cells, lib: ib }, g };
  const pr = problem(m);
  if (pr) return fail(pr);
  _genStats.ok = (_genStats.ok || 0) + 1;
  return m;
}

export const loopLen = () => FRAMES.length;
function rotOf(hist) { let M = G.ID.slice(); for (const h of hist) M = G.mul(G.qturn(h.axis, h.dir), M); return M; }

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'turn', axis: 'x | y | z', dir: '+1 | -1', note: 'the six buttons under the pictures: a quarter turn of B about the axis drawn on the button, the way its arrow shows' },
      { op: 'undo', note: 'take back the last turn of B' },
      { op: 'reset', note: 'B back to how it started' },
    ],
    promptHuman: PROMPT,
  },

  frames,

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const r0 = mulberry32(mix32(key, 0x5eed0000));
    const n0 = G.AXES[Math.floor(r0() * 3)], others = G.AXES.filter((a) => a !== n0);
    const prog = { n0, a1: others[Math.floor(r0() * 2)], s1: r0() < 0.5 ? 1 : -1, s2: r0() < 0.5 ? 1 : -1 };
    for (let a = 0; a < 400; a++) {
      const m = tryBuild(R(mulberry32(mix32(key, a))), prog);
      if (m) return m;
    }
    throw new Error('f16_rotation_copy: generator exhausted');
  },

  init() { return { ...clockState(), hist: [], rot: G.ID.slice(), ver: 0, last: null, presses: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'turn', 'undo', 'reset', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    if (a.op === 'tap') {
      const b = Number.isFinite(a.x) && Number.isFinite(a.y) ? hitBtn(a.x, a.y) : null;
      if (!b) return { ok: false, reason: 'no-button' };
      a = b.a;
    }
    if (a.op === 'turn') {
      if (!G.AXES.includes(a.axis) || (a.dir !== 1 && a.dir !== -1)) return { ok: false, reason: 'bad-turn' };
      st.hist.push({ axis: a.axis, dir: a.dir }); st.presses++;
      st.last = { op: 'turn', axis: a.axis, dir: a.dir };
    } else if (a.op === 'undo') {
      if (!st.hist.length) return { ok: false, reason: 'nothing-to-undo' };
      const h = st.hist.pop(); st.last = { op: 'undo', axis: h.axis, dir: -h.dir };
    } else {
      st.hist = []; st.last = { op: 'reset' };
    }
    st.rot = rotOf(st.hist); st.ver++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = G.matEq(st.rot, m.g);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { turns: st.hist.map((h) => `${h.axis}${h.dir > 0 ? '+' : '-'}`).join(' '), presses: st.presses, reading: readingOf(m, st.rot),
        answer: m.A.turns.map((h) => `${h.axis}${h.dir > 0 ? '+' : '-'}`).join(' '), t: r3(st.t), frame: frameIdx(m, st.t) + 1 } };
  },

  oracle(m) {
    const k = FRAMES.length, out = [];
    for (let i = 0; i < k; i++) out.push({ op: 'wait', sec: 1 });
    for (const t of m.A.turns) out.push({ op: 'turn', axis: t.axis, dir: t.dir });
    return out;
  },

  randomPolicy(m, rnd) {
    const pick = () => { const i = Math.floor(rnd() * 6); return { op: 'turn', axis: G.AXES[i >> 1], dir: i & 1 ? -1 : 1 }; };
    return [pick(), pick()];
  },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    const V = view(env); syncAnim(V, st);
    if (V.anim) { V.anim.k += dt / B_ANIM; if (V.anim.k >= 1) V.anim = null; }
    return !!V.anim;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f1f3f6'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    drawPictures(g, env);
    drawControls(g, env);
    const V = view(env);
    if (typeof performance !== 'undefined') { V.ms.push(Math.round((performance.now() - t0) * 100) / 100); if (V.ms.length > 600) V.ms.shift(); }
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const b = hitBtn(evt.x, evt.y);
    if (!b) return [];
    if (b.id === 'undo' && !env.state.hist.length) return [];
    return [{ ...b.a }];
  },

  footerStatus(env) { const n = env.state.hist.length; return n ? `B turned ${n} time${n > 1 ? 's' : ''}` : 'B not turned yet'; },
};
export default task;

export function frameAudit(m) {
  const A = m.A, n0 = A.n0, progs = [];
  for (const a1 of G.AXES.filter((a) => a !== n0)) for (const s1 of [1, -1]) for (const s2 of [1, -1]) progs.push({ a1, s1, s2 });
  const left = FRAMES.map((f, k) => {
    const Rg = (p) => [G.qturn(p.a1, p.s1), G.qturn(n0, p.s2)];
    return progs.filter((p) => {
      const [R1, R2] = Rg(p);
      const mine = f.i !== undefined ? G.mul(f.i === 0 ? G.ID : f.i === 1 ? R1 : G.mul(R2, R1), A.P0) : null;
      if (f.i !== undefined) {
        const want = barAxisOf(aPoseFrame(A, k).M);
        return barAxisOf(mine) === want;
      }
      const T = A.turns[f.turn], mine2 = f.turn === 0 ? { axis: p.a1, dir: p.s1 } : { axis: n0, dir: p.s2 };
      return mine2.axis === T.axis && mine2.dir === T.dir;
    }).length;
  });
  const best = Math.min(...left);
  return { singleFrame: best <= 1, programmesLeft: left, minLeft: best };
}

function view(env) { return (env._rwc ??= { ver: 0, rot: G.ID.slice(), anim: null, ms: [] }); }
function syncAnim(V, st) {
  if (st.ver === V.ver) return;
  const one = st.ver === V.ver + 1 && st.last && st.last.op !== 'reset';
  V.anim = one ? { from: V.rot.slice(), axis: st.last.axis, dir: st.last.dir, k: 0 } : null;
  V.ver = st.ver; V.rot = st.rot.slice();
}
function panelBox(g, P, label) {
  g.save(); g.shadowColor = 'rgba(20,25,30,0.16)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  rr(g, P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1, 8); g.fillStyle = '#ffffff'; g.fill(); g.restore();
  rr(g, P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1, 8); g.strokeStyle = '#d6dde5'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#7b8896'; g.font = `700 13px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(label, P.x + 9, P.y + 8);
}
function drawPictures(g, env) {
  const st = env.state, m = env.manifest, V = view(env);
  syncAnim(V, st);
  panelBox(g, PANEL.A, 'A'); panelBox(g, PANEL.B, 'B');
  const pose = aPoseFrame(m.A, frameIdx(m, st.t));
  g.save(); rr(g, PANEL.A.x + 1, PANEL.A.y + 1, PANEL.A.w - 2, PANEL.A.h - 2, 8); g.clip();
  G.drawPose(g, G.A_CELLS, pose.M, CEN.A.x, CEN.A.y, EA);
  g.restore();
  const M = V.anim ? G.mul(G.rotAxis(V.anim.axis, V.anim.dir * (Math.PI / 2) * G.ease(V.anim.k, 0.7)), V.anim.from) : st.rot;
  g.save(); rr(g, PANEL.B.x + 1, PANEL.B.y + 1, PANEL.B.w - 2, PANEL.B.h - 2, 8); g.clip();
  G.drawPose(g, m.B.cells, M, CEN.B.x, CEN.B.y, EB);
  g.restore();
}
function drawControls(g, env) {
  const off = !!env.submitted;
  for (const b of buttons()) {
    const dis = off || (b.id === 'undo' && !env.state.hist.length);
    rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = dis ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = dis ? '#dde1e6' : '#c8d0d8'; g.lineWidth = 1; g.stroke();
    const col = dis ? '#b5bcc4' : '#3c4955';
    if (b.label) {
      g.save(); g.fillStyle = col; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5); g.restore();
    } else {
      g.save(); if (dis) g.globalAlpha = 0.45;
      G.drawTurnIcon(g, b.a.axis, b.a.dir, b.x + b.w / 2, b.y + b.h / 2, b.a.dir > 0 ? '#2d5f9a' : '#9a4a2d');
      g.restore();
    }
  }
}
export function _viewStats(env) { return { ms: view(env).ms.slice() }; }
