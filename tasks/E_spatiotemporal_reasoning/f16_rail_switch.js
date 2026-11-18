import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import * as K from '../common/_f16_rail_switch_kit.js';
import * as W from '../common/_f16_rail_switch_world.js';

const NAME = 'f16_rail_switch';
const BTN = { y: W.VIEW.h + 10, h: 56 };
const BOARD = { w: W.VIEW.w, h: W.VIEW.h + BTN.y - W.VIEW.h + BTN.h + 6 };
const PROMPT = 'Guide every train to the station of its own color';
const SUB = 'Each turn press one button: flip A, keep both, or flip B · then every train moves one step';
export const GATE = { minWin: 3, sep: 3.0, rand: 0.03 };
export const DIAG = {};
const rej = (k) => { DIAG[k] = (DIAG[k] || 0) + 1; return null; };
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export function contract(m) {
  if (!m || m.task !== NAME || m.trains?.length !== W.NT || !(m.T >= W.TMIN && m.T <= W.TMAX)) return rej('shape');
  const T = m.T;
  if (Math.max(...m.trains.map((_, i) => W.stepsToFinish(m, i))) !== T) return rej('T');
  if (new Set(m.trains.map((t) => t.speedKey ?? t.v)).size < 2) return rej('speeds');
  const ev = W.events(m);
  if (ev.some((e) => e.c < 0 || e.c >= T)) return rej('event-range');
  const plan = W.planFromEvents(ev, T, m.a0, m.b0, true);
  if (!plan) return rej('plan');
  if (W.minWindow(m) < GATE.minWin) return rej('window');
  if (!W.solved(m, W.run(m, plan))) return rej('oracle');
  if (W.solved(m, W.run(m, Array(T).fill(null)))) return rej('noop');
  for (let a = 0; a < W.NT; a++) for (let b = a + 1; b < W.NT; b++) {
    const ta = m.trains[a], tb = m.trains[b], Ra = W.ROUTE[ta.entry][ta.dest], Rb = W.ROUTE[tb.entry][tb.dest];
    for (let t = 0; t <= T; t += 0.1) {
      const ua = ta.u0 + ta.v * t, ub = tb.u0 + tb.v * t;
      if (ua >= Ra.len || ub >= Rb.len) break;
      const pa = W.posAt(Ra, ua), pb = W.posAt(Rb, ub);
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < GATE.sep) return rej('spacing');
    }
  }
  if (W.randomSuccess(m, T) > GATE.rand) return rej('random');
  const au = frameAudit(m);
  if (au.singleFrame) return rej('frame1-reader');
  if (W.readerScreen(m)) return rej('screen-reader');
  if (W.readerRank(m)) return rej('rank-reader');
  return { plan, ev };
}
export function gate(m) {
  const c = contract(m);
  if (!c) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
export function frameAudit(m) {
  const hits = [];
  for (const v of W.SPEEDS) if (W.readerEqual(m, v)) hits.push('equal-' + v);
  if (W.solved(m, W.run(m, Array(m.T).fill(null)))) hits.push('noop');
  return { singleFrame: hits.length > 0, hits };
}

export function draw(rng) {
  const cols = rng.sample(W.PAL, W.NT);
  const cs = [rng.int(2, 3)]; for (let i = 1; i < W.NT; i++) cs.push(cs[i - 1] + rng.pick([2, 2, 3, 3, 4]));
  if (cs[W.NT - 1] > 10) return rej('c-late');
  const fr = Array.from({ length: W.NT }, () => rng.pick([0.25, 0.5, 0.75]));
  const used = new Set(), pk = Array(W.NT);
  for (let i = W.NT - 1; i >= 0; i--) {
    const opts = [];
    for (let e = 0; e < W.NT; e++) if (!used.has(e)) for (const v of W.SPEEDS) {
      const u = Math.round((W.UA[e] - v * (cs[i] + fr[i])) * 4) / 4;
      if (u >= 2.75 && u <= W.UA[e] - 3.5) opts.push({ e, v, u });
    }
    if (!opts.length) return rej('u0');
    const o = rng.pick(opts); used.add(o.e); pk[i] = o;
  }
  const trains = pk.map((q, i) => ({ col: cols[i].name, entry: q.e, dest: 0, v: q.v, u0: q.u }));
  const m = { task: NAME, trains, a0: rng.int(0, 1), b0: rng.int(0, 1), T: 0, dt: 1 };
  const perms = rng.shuffle(PERMS);
  for (const dst of perms) {
    dst.forEach((d, i) => { trains[i].dest = d; });
    m.T = Math.max(...trains.map((_, i) => W.stepsToFinish(m, i)));
    if (m.T < W.TMIN || m.T > W.TMAX) { rej('p:T'); continue; }
    if (W.minWindow(m) < GATE.minWin) { rej('p:win'); continue; }
    m.stationCol = [0, 1, 2, 3].map((s) => { const t = trains.find((q) => q.dest === s); return W.PAL.find((p) => p.name === t.col).c; });
    if (contract(m)) return m;
  }
  return rej('no-dest');
}
const PERMS = (() => { const out = []; const rec = (a, rest) => { if (!rest.length) out.push(a); rest.forEach((x, i) => rec([...a, x], rest.filter((_, j) => j !== i))); }; rec([], [0, 1, 2, 3]); return out; })();
function tryBuild(rng) {
  const m = draw(rng);
  if (!m || !contract(m)) return null;
  m.gtContract = 'flip each switch inside its window so every train takes the branch of its own colour (then Verify)';
  return m;
}

const buttons = () => [
  { id: 'A', label: 'Flip switch A', sub: 'then all trains move one step', x: 10, y: BTN.y, w: 200, h: BTN.h, color: '#2f7fd1', a: { op: 'flipA' } },
  { id: 'K', label: 'Keep switches', sub: 'all trains move one step', x: 220, y: BTN.y, w: 200, h: BTN.h, color: '#6b7785', a: { op: 'wait', sec: 1 } },
  { id: 'B', label: 'Flip switch B', sub: 'then all trains move one step', x: 430, y: BTN.y, w: 200, h: BTN.h, color: '#d1802f', a: { op: 'flipB' } },
];
const ended = (st, m) => st.w.k >= m.T;
const gameOver = (st, m) => ended(st, m);

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'flipA', note: 'flip switch A, then every train moves one step (one turn)' },
      { op: 'flipB', note: 'flip switch B, then every train moves one step (one turn)' },
      { op: 'wait', note: 'keep both switches this turn (the middle button): every train moves one step' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 60000; a++) {
      const m = tryBuild(R(mulberry32(mix32(key, a))));
      if (m) return m;
    }
    throw new Error(`${NAME}: no instance passed the gate`);
  },

  frames(m) { return { n: m.T + 1, period: m.T + 1 }; },
  init(m) { return { t: 0, steps: 0, w: W.initWorld(m), acts: [] }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'flipA', 'flipB'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (ended(st, m)) return { ok: false, reason: 'ended' };
    const act = a.op === 'flipA' ? 'A' : a.op === 'flipB' ? 'B' : null;
    st.w = W.step(m, st.w, act); st.acts.push(act); st.t = st.w.k; st.steps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = W.solved(m, st.w);
    const at = st.w.tr.map((t) => (t.done ? t.at + 1 : null));
    return { success: ok, error: ok ? 0 : 1, partial: st.w.tr.filter((t, i) => t.done && t.at === m.trains[i].dest).length / 3,
      detail: { turn: st.w.k, of: m.T, leaves: at, wanted: m.trains.map((t) => t.dest + 1) } };
  },

  oracle(m) {
    return W.planFromEvents(W.events(m), m.T, m.a0, m.b0, true).map((a) => (a === 'A' ? { op: 'flipA' } : a === 'B' ? { op: 'flipB' } : { op: 'wait', sec: 1 }));
  },

  randomPolicy(m, rnd) {
    return Array.from({ length: m.T }, () => { const r = Math.floor(rnd() * 3); return r === 0 ? { op: 'flipA' } : r === 1 ? { op: 'flipB' } : { op: 'wait', sec: 1 }; });
  },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  drawBoard(g, br, env) {
    const st = env.state, m = env.manifest;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, W.VIEW.w, W.VIEW.h); g.clip();
    W.drawWorld(g, m, st.w);
    g.fillStyle = 'rgba(255,255,255,.85)'; K.rr(g, 8, 8, 112, 26, 8); g.fill();
    g.fillStyle = '#33404c'; g.font = `700 13px ${K.UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(`Turn ${Math.min(st.w.k + 1, m.T)} / ${m.T}`, 18, 21);
    g.restore();
    const off = env.submitted || ended(st, m);
    for (const b of buttons()) K.drawTurnButton(g, b, { disabled: off });
    g.restore();
  },

  canVerify(env) { return gameOver(env.state, env.manifest); },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const b = K.hitRect(buttons(), evt.x, evt.y);
    return b ? [{ ...b.a }] : [];
  },

  footerStatus(env) {
    const st = env?.state, m = env?.manifest;
    return st ? (ended(st, m) ? 'All turns played' : `Turn ${st.w.k + 1} of ${m.T}`) : '';
  },
  gate,
};
export default task;
