import { drawPromptText, rr, ACCENT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, visT, tickClock, hitButton } from '../core/clock.js';
import * as M from './_fastest_runner_pick_model.js';
import * as V from './_fastest_runner_pick_view.js';

const NAME = 'fastest_runner_pick';
const PROMPT = 'Pick the fastest runner', SUB = 'The clip loops';
const VIEW = V.VIEW;
const BTN = { y: VIEW.h + 8, h: 44 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 4 };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const ORACLE_WAIT = 2.0;

function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export const THIN = {
  6: { sz0: [1.0918, 1.0918, 1.0288, 0.5116, 0.2805, 0.2711], szM: [1.0918, 0.3484, 0.0835, 0.0761, 0.1718, 1.0918], szT: [1.0918, 1.0918, 0.9558, 0.3438, 0.1514, 0.0849], rel: [0.0936, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], abs: [1.0918, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], grow: [0.2143, 1.0918, 1.0918, 1.0918, 1.0918, 0.3134], rad: [0.4959, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], cen0: [1.0918, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], cenM: [1.0918, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], cenT: [1.0918, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], cat: [0.2191, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], catS: [0.9413, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918], catR: [0.9986, 1.0918, 1.0918, 1.0918, 1.0918, 1.0918] },
  7: { sz0: [1.1857, 1.0028, 1.1653, 1.1857, 0.3327, 0.205, 0.3201], szM: [1.1857, 0.3692, 0.077, 0.0434, 0.0616, 0.2293, 1.1857], szT: [1.1857, 1.1857, 1.1857, 0.4916, 0.1542, 0.068, 0.0393], rel: [0.0604, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], abs: [1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], grow: [0.1101, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 0.2495], rad: [0.4428, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], cen0: [1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], cenM: [1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], cenT: [1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], cat: [0.1024, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], catS: [0.982, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857], catR: [1.0552, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857, 1.1857] },
};
export function thinWeight(m, table = THIN) {
  const W = table[m.run.length], f = M.fRanks(m);
  let w = 1; for (const k of M.RANK_KEYS) w *= W[k][f[k]];
  return Math.min(1, w);
}
export function drawTarget(r) { return { n: r.raw() < 0.5 ? 6 : 7, dir: r.raw() < 0.5 ? 1 : -1, hRank: r.raw() < 0.5 ? 2 : 3 }; }

const colorOf = (m, i) => m.run[i].color;
export function gate(m) {
  if (!m || m.task !== NAME || !M.contract(m)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
function buttonsOf(m) {
  const n = m.buttons.length, gap = 6, w = (VIEW.w - 4 - (n - 1) * gap) / n;
  return m.buttons.map((col, i) => ({ id: col, col, a: { op: 'pick', color: col }, x: 2 + i * (w + gap), y: BTN.y, w, h: BTN.h }));
}

const task = {
  meta: {
    name: NAME, family: 'T', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'pick', color: 'the shirt colour of one button below the picture', note: 'press a colour button to pick that runner; press another to change the pick, the picked one again to clear it (revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 2000000; a++) {
      const r = R(mulberry32(mix32(key, a)));
      const m = M.attempt(r, drawTarget(r), { task: NAME, board: { ...BOARD } });
      if (typeof m === 'string') continue;
      if (!(r.raw() < thinWeight(m))) continue;
      m.buttons = M.PALETTE.filter((c) => m.run.some((q) => q.color === c));
      m.look = { sunAz: r4((r.raw() < 0.5 ? -1 : 1) * r.uniform(15, 50)), sunEl: r4(r.uniform(42, 62)), seed: Math.floor(r.raw() * 1e6) };
      m.hold = r4(r.uniform(...M.C.HOLD));
      m.live = true;
      m.gen = { tries: a + 1 };
      if (!gate(m)) continue;
      return m;
    }
    throw new Error('fastest_runner_pick: generator exhausted');
  },

  frames(m) { return { n: 6, period: M.loopLen(m) }; },
  init() { return { ...clockState(), pick: null, taps: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'pick'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? 0.5;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t = r4(st.t + sec); st.steps++;
      return { ok: true };
    }
    if (!m.buttons.includes(a.color)) return { ok: false, reason: 'no-such-colour' };
    st.pick = st.pick === a.color ? null : a.color; st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.pick != null && st.pick === colorOf(m, m.answer);
    const pi = m.run.findIndex((q) => q.color === st.pick);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { pick: st.pick, answer: colorOf(m, m.answer), pickedRole: pi >= 0 ? m.run[pi].role : null,
        bodyRuler: colorOf(m, M.bodyRuler(m)), t: r4(st.t), loops: r4(st.t / M.loopLen(m)), clip: m.T, hold: m.hold, taps: st.taps,
        speeds: Object.fromEntries(m.run.map((q) => [q.color, q.v])) } };
  },

  oracle(m) { return [{ op: 'wait', sec: ORACLE_WAIT }, { op: 'pick', color: colorOf(m, m.answer) }]; },

  randomPolicy(m, rnd) {
    const sec = r4(rnd() * M.loopLen(m)), c = m.buttons[Math.floor(rnd() * m.buttons.length)];
    return [{ op: 'wait', sec }, { op: 'pick', color: c }];
  },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    if (!env.state || !env.manifest) return false;
    return tickClock(env, dt, { running: (e) => !e.submitted });
  },

  drawBoard(g, br, env) {
    const { manifest: m } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    V.drawView(g, env, M.sceneT(m, visT(env)));
    drawButtonsRow(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const b = hitButton(buttonsOf(env.manifest), evt.x, evt.y);
    return b ? [{ ...b.a }] : [];
  },

  footerStatus(env) { return env.state.pick ? 'Runner picked' : 'No runner picked'; },
  gate,
};
export default task;

function drawButtonsRow(g, env) {
  const m = env.manifest, sel = env.state.pick, off = !!env.submitted;
  for (const b of buttonsOf(m)) {
    const on = sel === b.col;
    rr(g, b.x, b.y, b.w, b.h, 9);
    g.fillStyle = on ? '#e2efff' : off ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = on ? ACCENT : '#c8d0d8'; g.lineWidth = on ? 2.4 : 1; g.stroke();
    V.drawShirt(g, b.x + b.w / 2, b.y + b.h / 2 + 1, M.COLORS[b.col]);
    if (on) {
      const bx = b.x + b.w - 9, by = b.y + 9;
      g.save();
      g.beginPath(); g.arc(bx, by, 6.5, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
      g.beginPath(); g.moveTo(bx - 3, by + 0.2); g.lineTo(bx - 0.8, by + 2.4); g.lineTo(bx + 3.2, by - 2.2); g.strokeStyle = '#fff'; g.lineWidth = 1.7; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      g.restore();
    }
  }
}
