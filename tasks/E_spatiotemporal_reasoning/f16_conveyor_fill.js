import { drawPromptText } from '../core/panel.js';
import { btnRects, drawBtns, hitBtn } from '../common/_f16_conveyor_fill_kit.js';
import * as S from '../common/_f16_conveyor_fill_scene.js';

const NAME = 'f16_conveyor_fill';
const { T, N, BOARD } = S;
const r4 = (v) => Math.round(v * 10000) / 10000;
export const DIAG = {};
const rej = (k) => { DIAG[k] = (DIAG[k] || 0) + 1; return null; };
const BTNS = [{ id: 'open', label: 'Open tap', color: '#2fa84f' }, { id: 'close', label: 'Close tap', color: '#d0453a' }];
const RECTS = btnRects(2, BOARD.w, 342, 50);

const fails = (m) => {
  const bad = {}; const never = S.runPlan(m, () => false), always = S.runPlan(m, () => true);
  bad.never = S.judge(m, never); bad.always = S.judge(m, always);
  bad.cyl = S.judge(m, S.runPlan(m, S.planOpen(m, S.cylK(m))));
  bad.k2 = S.judge(m, S.runPlan(m, S.planOpen(m, () => 2))); bad.k3 = S.judge(m, S.runPlan(m, S.planOpen(m, () => 3)));
  return bad;
};
export function contract(m) {
  if (!m || m.task !== NAME || m.cups.length !== 3 || m.N !== N) return null;
  const cam = S.camOf(m);
  for (const c of m.cups) for (const t of [0, T]) for (const [x, y] of [[-c.Rm, c.H], [c.Rm, c.H], [0, 0]]) { const q = cam.proj([x, y, S.cupZ(c, t)]); if (q[0] < 12 || q[0] > BOARD.w - 12 || q[1] < 30 || q[1] > S.SCENE_H - 6) return rej('view'); }
  const ks = m.cups.map((c) => c.k);
  if (!(ks.includes(2) && ks.includes(3))) return rej('k-variety');
  for (const c of m.cups) {
    const lv = (k) => S.levelOf(c, k * m.Q);
    if (lv(c.k) < 0.3 * c.H || lv(c.k) > 0.78 * c.H) return rej('level-range');
    if (!S.inBand(c, lv(c.k)) || S.inBand(c, lv(c.k - 1)) || S.inBand(c, lv(c.k + 1))) return rej('band-k');
  }
  const h = S.runPlan(m, S.humanOpen(m));
  if (!S.judge(m, h)) return rej('human');
  const bad = fails(m);
  for (const k of Object.keys(bad)) if (bad[k]) return rej('plan-' + k);
  return { human: h };
}
export function frameAudit(m) { const hits = Object.entries(fails(m)).filter(([, v]) => v).map(([k]) => k); return { singleFrame: hits.length > 0, hits }; }
export function gate(m) {
  if (!contract(m)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}

function tryBuild(rng) {
  const U = rng.uniform;
  const w0 = rng.int(1, 2), Q = Math.PI * 0.11 * 0.11 * U(0.045, 0.085);
  const cups = [0, 1, 2].map((j) => {
    const Rm = r4(U(0.18, 0.215)), Rb = r4(Rm / U(1.45, 2.0)), H = r4(U(0.3, 0.38));
    return { w: w0 + 5 * j, Rm, Rb, H };
  });
  const ok = [2, 3];
  for (const c of cups) {
    const fit = ok.filter((k) => { const L = S.levelOf(c, k * Q); return L >= 0.3 * c.H && L <= 0.78 * c.H; });
    if (!fit.length) return rej('fit');
    c.k = rng.pick(fit); const Lk = S.levelOf(c, c.k * Q), r = Lk / c.k;
    c.tol = r4(0.4 * r); c.mark = r4(Lk + U(-0.2, 0.2) * r);
  }
  const m = {
    task: NAME, board: { ...BOARD }, T, N, dt: 1, live: false, Q: r4(Q), cups,
    cam: { az: r4(rng.sign() * U(32, 48)), el: r4(U(24, 30)), dist: 4.0 },
  };
  const c = contract(m);
  if (!c) return null;
  m.oracleActs = []; { const st = S.newState(m), f = S.humanOpen(m); for (let i = 0; i < T; i++) { const o = f(i + 1, st); m.oracleActs.push(o ? 'open' : 'close'); S.stepWorld(m, st, o); } }
  return m;
}

const gameOver = (st, m) => st.turn >= T;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD },
    actionSpace: [
      { op: 'press', btn: 'open | close', note: 'set the tap open / closed for this turn; the belt moves one step and, if open, one dose falls into the glass under the tap' },
      { op: 'wait', note: 'the Next frame button = keep the tap as it is' },
    ],
    promptHuman: 'Fill every glass to its red band without spilling any water',
  },
  generate(rng) {
    for (let a = 0; a < 20000; a++) { const m = tryBuild(rng); if (m) return m; }
    throw new Error('f16_conveyor_fill: generator exhausted ' + JSON.stringify(DIAG));
  },
  frames(m) { return { n: m.N, period: m.N * m.dt }; },
  init(m) { return S.newState(m); },
  applyAction(st, a, m) {
    if (!a) return { ok: false, reason: 'bad-op' };
    let seq;
    if (a.op === 'wait') seq = Array(Math.max(1, Math.round((a.sec ?? m.dt) / m.dt))).fill(st.tap);
    else if (a.op === 'press' && (a.btn === 'open' || a.btn === 'close')) seq = [a.btn === 'open'];
    else return { ok: false, reason: 'bad-op' };
    for (const o of seq) { if (st.turn >= T) return { ok: false, reason: 'over' }; S.stepWorld(m, st, o); }
    return { ok: true };
  },
  verify(st, m) {
    const ok = S.judge(m, st);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { turn: st.turn, spill: st.spill, over: st.over, levels: m.cups.map((c, j) => [S.level(m, st, j), c.mark, c.tol].map(r4)) } };
  },
  oracle(m) { return m.oracleActs.map((b) => ({ op: 'press', btn: b })); },
  randomPolicy(m, rnd) { return Array.from({ length: T }, () => ({ op: 'press', btn: rnd() < 0.5 ? 'open' : 'close' })); },
  drawPrompt(g, r) { drawPromptText(g, r, 'Fill every glass to its red band without spilling any water', 'Each turn press Open tap or Close tap · each press shows the next frame'); },
  tick() { return false; },
  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    S.drawScene(g, env.manifest, env.state);
    drawBtns(g, RECTS, BTNS, env.state.last, env.state.turn >= T);
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const i = hitBtn(RECTS, evt.x, evt.y);
    return i < 0 ? [] : [{ op: 'press', btn: BTNS[i].id }];
  },
  footerStatus(env) { return env.state.tap ? 'Tap is open' : 'Tap is closed'; },
};
export default task;
