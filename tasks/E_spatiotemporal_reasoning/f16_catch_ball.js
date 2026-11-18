import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, buttonRects, hitButton, drawButtons } from '../common/_f16_scene_kit.js';
import * as M from '../common/_f16_catch_ball_model.js';
import * as V from '../common/_f16_catch_ball_view.js';

const NAME = 'f16_catch_ball';
const PROMPT = 'Catch the falling ball in the basket', SUB = 'Each button moves the basket and advances one frame';
const BTN = { y: M.VIEW.h + 8, h: 56 };
const BOARD = { w: M.VIEW.w, h: M.VIEW.h + 8 + BTN.h + 6 };
const DEFS = [{ id: 'L', label: 'Left', dir: -1, a: { op: 'move', a: -1 } }, { id: 'S', label: 'Stay', dir: 0, a: { op: 'move', a: 0 } }, { id: 'R', label: 'Right', dir: 1, a: { op: 'move', a: 1 } }];
const buttons = () => buttonRects(DEFS, BTN.y, BTN.h, BOARD.w);

export const contract = M.contract;
export function gate(m) {
  try {
    if (!contract(m).ok) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}
export function frameAudit(m) {
  const eo = M.openLoopSeq(m, M.visiblePegs(m)), el = M.openLoopSeq(m, M.latticePegs(m)), L = m.traj[m.n].x;
  const rd = { openEmpty: M.caught(m, eo.seq), openLattice: M.caught(m, el.seq), rush: M.caught(m, M.rushSeq(m)), idle: M.caught(m, new Array(m.n).fill(0)) };
  const hits = Object.entries(rd).filter(([, v]) => v).map(([k]) => k);
  return { singleFrame: hits.length > 0, hits, landing: r3(L), openEmptyAt: r3(eo.A), openLatticeAt: r3(el.A), hiddenFrames: m.traj.map((_, k) => M.ballHidden(m, k)).map((h, k) => (h ? k + 1 : 0)).filter(Boolean) };
}

const gameOver = (st, m) => st.turn >= m.n;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'move', a: '-1 | 0 | 1', note: 'basket one step left / stay / right (0.4 m); advances one frame. Next frame = {op: wait} = stay' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 4000; a++) {
      const { m } = M.build(R(mulberry32(mix32(key, a))));
      if (!m) continue;
      m.gtContract = 'basket under the ball when it reaches the rim on the last frame (then Verify); the careful play looks every frame';
      return m;
    }
    throw new Error(`${NAME}: no instance passed the gate`);
  },

  frames(m) { return { n: m.n, period: m.n * m.dt }; },

  init(m) { const xb = m?.xb0 ?? 0; return { ...clockState(), turn: 0, xb, hist: [xb], done: false }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'move'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    const mv = a.op === 'wait' ? 0 : a.a;
    if (![-1, 0, 1].includes(mv)) return { ok: false, reason: 'bad-move' };
    if (st.turn >= m.n) return { ok: false, reason: 'finished' };
    st.turn++; st.t += m.dt; st.steps++;
    st.xb = Math.max(-M.XB_MAX, Math.min(M.XB_MAX, st.xb + M.STEP * mv)); st.hist.push(st.xb);
    st.done = st.turn >= m.n;
    return { ok: true };
  },

  verify(st, m) {
    const L = m.traj[m.n].x, ok = st.done && Math.abs(st.xb - L) <= M.CATCH;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { done: st.done, basket: r3(st.xb), landing: r3(L), off: r3(Math.abs(st.xb - L)), turns: st.turn } };
  },

  oracle(m) { return m.plan.map((a) => ({ op: 'move', a })); },

  randomPolicy(m, rnd) { return Array.from({ length: m.n }, () => ({ op: 'move', a: Math.floor(rnd() * 3) - 1 })); },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, M.VIEW.w, M.VIEW.h); g.clip();
    V.drawView(g, env.manifest, env.state);
    g.restore();
    drawButtons(g, buttons(), env.submitted || gameOver(env.state, env.manifest));
    g.restore();
  },

  canVerify(env) { return gameOver(env.state, env.manifest); },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const b = hitButton(buttons(), evt.x, evt.y);
    return b ? [{ ...b.a }] : [];
  },

  footerStatus(env) {
    const st = env?.state; if (!st) return '';
    return st.done ? 'Ball has landed' : 'Ball falling';
  },
  gate, frameAudit, contract,
};
export default task;
