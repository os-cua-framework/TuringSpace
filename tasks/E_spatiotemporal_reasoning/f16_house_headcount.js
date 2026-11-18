import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as G from '../common/_house_headcount_gen.js';
import * as W from '../common/_house_headcount_scene.js';
import * as D from '../common/_f16_house_design.js';
import { checkLoose } from '../common/_f16_house_gen.js';
import { frameTau, framesOf, oracleWaits, applyWait, r3 } from '../common/_f16_frames.js';

const RT = W.RT, VIEW = W.VIEW;
const NAME = 'f16_house_headcount';
const NB = 9, BTN = { y: VIEW.h + 8, h: 44, gap: 6 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 4 };
const PROMPT = 'How many people went in and stayed inside?', SUB = 'Press Next frame to step through the clip \u00b7 tap a number, then Verify';

export const sceneTime = (m, t) => frameTau(m, t);
export function gate(m) {
  if (!m || m.task !== NAME || !m.f16) return false;
  if (checkLoose({ ...m, task: G.NAME }) !== null) return false;
  if (D.frameProblem(m)) return false;
  return task.verify(replay(m), m).success;
}
function replay(m) { const st = task.init(m); for (const a of task.oracle(m)) task.applyAction(st, a, m); return st; }
export function frameAudit(m) { return D.frameAudit(m); }

export const buttons = () => {
  const w = (VIEW.w - (NB - 1) * BTN.gap) / NB;
  return Array.from({ length: NB }, (_, n) => ({ n, x: n * (w + BTN.gap), y: BTN.y, w, h: BTN.h }));
};
const hitBtn = (x, y) => buttons().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'pick', n: '0..8', note: 'tap a number button under the clip to choose it (tap another to change; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const m = D.generate(rng);
    m.task = NAME; m.live = true; m.board = { ...BOARD };
    return m;
  },

  frames(m) { return framesOf(m); },
  init() { return { ...clockState(), sel: -1, taps: 0, tauSel: null }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'pick', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') return applyWait(st, a);
    let n = a.n;
    if (a.op === 'tap') { const b = Number.isFinite(a.x) && Number.isFinite(a.y) ? hitBtn(a.x, a.y) : null; if (!b) return { ok: false, reason: 'no-button' }; n = b.n; }
    if (!Number.isInteger(n) || n < 0 || n >= NB) return { ok: false, reason: 'bad-n' };
    st.sel = n; st.taps++; st.tauSel = r3(sceneTime(m, st.t));
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    const roles = m.people.map((p) => p.role);
    return { success: ok, error: ok ? 0 : (st.sel < 0 ? 1 : Math.abs(st.sel - m.answer)), partial: ok ? 1 : 0,
      detail: { selected: st.sel, answer: m.answer, people: roles.length, inout: roles.filter((r) => r === 'inout').length,
        back: roles.filter((r) => r === 'back').length, front: roles.filter((r) => r === 'front').length, t: r3(st.t), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) { return [...oracleWaits(m.f16.taus.length), { op: 'pick', n: m.answer }]; },

  randomPolicy(m, rnd) { return [{ op: 'pick', n: Math.floor(rnd() * NB) }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    const active = tickClock(env, dt, { running: () => false });
    return active || !view(env).drawnHi;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    drawNumbers(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const b = hitBtn(evt.x, evt.y);
    return b ? [{ op: 'pick', n: b.n }] : [];
  },

  footerStatus(env) { return env.state.sel >= 0 ? `Your answer: ${env.state.sel}` : 'No answer yet'; },
  gate, frameAudit,
};
export default task;

function view(env) {
  return (env._hh ??= { m: null, bg: new Map(), key: '', canvas: null, drawnHi: false, ms: [], bgMs: null });
}
function background(V, m, q) {
  const k = String(q);
  if (!V.bg.has(k)) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const img = RT.render(W.staticScene(m), q, q >= 1.5 ? 1 : (q > 1 ? 2 : 1));
    img.canvas = RT.toCanvas(img);
    V.bg.set(k, img);
    if (typeof performance !== 'undefined') V.bgMs = Math.round(performance.now() - t0);
  }
  return V.bg.get(k);
}
function compose(V, m, tau, q) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const ss = q >= 1.5 ? 1 : (q > 1 ? 2 : 1), bg = background(V, m, q);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bg.w, bg.h) : Object.assign(document.createElement('canvas'), { width: bg.w, height: bg.h });
  const g = c.getContext('2d');
  g.drawImage(bg.canvas, 0, 0);
  const sc = W.sceneAt(m, tau);
  if (sc.poses.length) {
    const pids = new Set(sc.poses.map(([i]) => W.ID.person(i)));
    for (const [i, P] of sc.poses) {
      const b = W.personScreenBox(m, P.x, P.z, m.people[i].k, 0.4);
      const x0 = Math.max(0, Math.floor(b[0]) - 1), y0 = Math.max(0, Math.floor(b[1]) - 1), x1 = Math.min(VIEW.w, Math.ceil(b[2]) + 1), y1 = Math.min(VIEW.h, Math.ceil(b[3]) + 1);
      if (x1 <= x0 || y1 <= y0) continue;
      const patch = RT.renderPatch(sc, bg, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, pids, q, ss, q === 1);
      g.drawImage(RT.toCanvas(patch), Math.round(patch.x * q), Math.round(patch.y * q));
    }
  }
  if (typeof performance !== 'undefined') { V.ms.push([q, Math.round(performance.now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
  return c;
}
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), qs = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.bg.clear(); V.key = ''; }
  const tau = sceneTime(m, st.t), still = CLOCK.paused || !!env.submitted, q = still ? qs : 1;
  const key = `${tau.toFixed(4)}|${q}`;
  if (V.key !== key) { V.canvas = compose(V, m, tau, q); V.key = key; }
  V.drawnHi = q >= qs;
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(V.canvas, 0, 0, VIEW.w, VIEW.h);
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
function drawNumbers(g, env) {
  const sel = env.state.sel, off = !!env.submitted;
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of buttons()) {
    const on = b.n === sel;
    rr(g, b.x, b.y, b.w, b.h, 9);
    g.fillStyle = on ? '#2f7de1' : off ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = on ? '#1f63bd' : '#c8d0d8'; g.lineWidth = on ? 1.5 : 1; g.stroke();
    g.fillStyle = on ? '#ffffff' : off ? '#b5bcc4' : '#3c4955';
    g.font = `700 18px ${UI_FONT}`;
    g.fillText(String(b.n), b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  g.restore();
}
export function _viewStats(env) { const V = view(env); return { bgMs: V.bgMs, ms: V.ms.slice() }; }
