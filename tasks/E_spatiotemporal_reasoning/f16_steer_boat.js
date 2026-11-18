import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock } from '../core/clock.js';
import { mix32, r3, buttonRects, hitButton, drawButtons } from '../common/_f16_scene_kit.js';
import * as M from '../common/_f16_steer_boat_model.js';
import * as V from '../common/_f16_steer_boat_view.js';

const NAME = 'f16_steer_boat';
const PROMPT = 'Steer the boat into the dock without hitting anything', SUB = 'Each button steers the boat and moves one frame';
const BTN = { y: V.VIEW.h + 8, h: 56 };
const BOARD = { w: V.VIEW.w, h: V.VIEW.h + 8 + BTN.h + 6 };
const DEFS = [{ id: 'L', label: 'Left', dir: -1, a: { op: 'steer', a: -1 } }, { id: 'S', label: 'Straight', dir: 0, a: { op: 'steer', a: 0 } }, { id: 'R', label: 'Right', dir: 1, a: { op: 'steer', a: 1 } }];
const buttons = () => buttonRects(DEFS, BTN.y, BTN.h, BOARD.w);

function viewOk(m) {
  const W = V.VIEW.w, H = V.VIEW.h, c0 = V.camAt(m.pts[0][0], m.pts[0][1]), D = m.dock;
  for (const [dx, dz] of [[0, 0], [D.r, 0], [-D.r, 0], [0, D.r], [0, -D.r]]) { const q = c0.project(D.x + dx, 0, D.z + dz); if (q.x < 24 || q.x > W - 24 || q.y < 60 || q.y > H - 24) return false; }
  const ps = M.simulate(m, m.plan);
  for (const [x, z] of ps.pos) { const q = V.camAt(x, z).project(x, 0, z); if (q.x < 40 || q.x > W - 40 || q.y < 40 || q.y > H - 40) return false; }
  return true;
}
export function contract(m) {
  const c = M.contract(m); if (!c.ok) return c;
  if (!viewOk(m)) return { ok: false, why: 'view' };
  return c;
}
export function gate(m) {
  try {
    if (!contract(m).ok) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}
export function frameAudit(m) {
  const rd = { idle: M.simulate(m, M.idleSeq(m)), greedy: M.simulate(m, M.greedySeq(m)), ghost: M.simulate(m, M.ghostGreedySeq(m)), openLoop: M.simulate(m, M.openLoopSeq(m)) };
  const hits = Object.entries(rd).filter(([, s]) => s.success).map(([k]) => k);
  return { singleFrame: hits.length > 0, hits, minDist: Object.fromEntries(Object.entries(rd).map(([k, s]) => [k, r3(s.minD)])), docked: M.simulate(m, m.plan).docked };
}

const gameOver = (st, m) => st.docked || st.crashed || st.turn >= m.n;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'steer', a: '-1 | 0 | 1', note: 'rudder for one frame: bow left / straight / right; advances one frame. Next frame = {op: wait} = straight' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 3000; a++) {
      const { m } = M.build(R(mulberry32(mix32(key, a))));
      if (!m) continue;
      m.gtContract = 'steer into the berth ring before crashing (then Verify); the careful play looks every frame';
      if (contract(m).ok) return m;
    }
    throw new Error(`${NAME}: no instance passed the gate`);
  },

  frames(m) { return { n: m.n, period: m.n * m.dt }; },

  init(m) {
    const x = m?.pts?.[0]?.[0] ?? 0, z = m?.pts?.[0]?.[1] ?? 0;
    return { ...clockState(), turn: 0, x, z, J: m ? M.revealed(m, 0, x, z) : 0, hdg: 0, hist: [[x, z]], crashed: false, why: '', docked: false, done: false };
  },

  applyAction(st, a, m) {
    if (!a || !['wait', 'steer'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    const rud = a.op === 'wait' ? 0 : a.a;
    if (![-1, 0, 1].includes(rud)) return { ok: false, reason: 'bad-rudder' };
    if (st.turn >= m.n) return { ok: false, reason: 'finished' };
    st.turn++; st.t += m.dt; st.steps++;
    if (!st.crashed && !st.docked) {
      const G = M.geo(m), ok = M.stepW(G, m, st.x, st.z, rud, M.R_REACH - 1);
      st.x = G.out.x; st.z = G.out.z; st.hdg = rud * M.PH; st.hist.push([st.x, st.z]);
      if (!ok) { st.crashed = true; st.why = G.out.why; }
      else { st.J = M.revealed(m, st.J, st.x, st.z); if (Math.hypot(st.x - m.dock.x, st.z - m.dock.z) <= m.dock.r) st.docked = true; }
    }
    st.done = st.turn >= m.n;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.docked && !st.crashed;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { docked: st.docked, crashed: st.crashed, why: st.why, turns: st.turn, dist: r3(Math.hypot(st.x - m.dock.x, st.z - m.dock.z)) } };
  },

  oracle(m) { return m.plan.map((a) => ({ op: 'steer', a })); },

  randomPolicy(m, rnd) { return Array.from({ length: m.n }, () => ({ op: 'steer', a: Math.floor(rnd() * 3) - 1 })); },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, V.VIEW.w, V.VIEW.h); g.clip();
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
    return st.crashed ? 'Boat crashed' : st.docked ? 'Docked' : st.done ? 'Not docked' : 'Under way';
  },
  gate, frameAudit, contract,
};
export default task;
