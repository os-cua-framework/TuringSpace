import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock, hitButton } from '../core/clock.js';
import * as M from '../common/_fastest_runner_pick_model.js';
import * as V from '../common/_fastest_runner_pick_view.js';
import orig, { thinWeight, drawTarget } from '../common/fastest_runner_pick.js';

const NAME = 'f16_fastest_runner';
const PROMPT = 'Pick the fastest runner', SUB = 'Press Next frame to step through the clip · tap a shirt, then Verify';
const VIEW = V.VIEW, N = 6;
const BTN = { y: VIEW.h + 8, h: 44 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 4 };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const dtOf = (m) => m.T / (N - 1);
const frameTimes = (m) => Array.from({ length: N }, (_, k) => k * dtOf(m));
const frameOf = (m, t) => (((Math.round(t / dtOf(m))) % N) + N) % N;
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

const MARGIN_RULER = 1.10, MARGIN_SCREEN = 1.10, MARGIN_GROUND = 1.9;

function cuesOn(m, S) {
  const cx = M.C.W / 2, cy = M.C.H / 2, out = [];
  S.forEach((fr, k) => {
    const feat = {
      size: fr.map((q) => q.size), cen: fr.map((q) => Math.hypot(q.hx - cx, q.hy - cy)), x: fr.map((q) => q.hx), y: fr.map((q) => q.hy),
    };
    for (const [name, v] of Object.entries(feat)) for (const [dir, pick] of [['max', (a, b) => a > b], ['min', (a, b) => a < b]]) {
      let arg = 0; v.forEach((x, i) => { if (pick(x, v[arg])) arg = i; });
      out.push({ frame: k + 1, cue: `${name}-${dir}`, picks: arg });
    }
  });
  return out;
}

export function frameContract(m) {
  const bad = (why) => ({ ok: false, why });
  if (!(m.hold > 0) || Math.abs(m.hold - dtOf(m)) > 1e-9) return bad('hold');
  const cam = M.camOf(m), ts = frameTimes(m), n = m.run.length, iF = m.answer, iH = M.roleIndex(m, 'H');
  const S = ts.map((t) => m.run.map((_, i) => M.screenOf(m, cam, i, t)));
  const G = ts.map((t) => m.run.map((_, i) => M.posAt(m, i, t)));
  for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
    const gd = m.run.map((_, i) => Math.hypot(G[q][i][0] - G[p][i][0], G[q][i][2] - G[p][i][2]));
    for (let i = 0; i < n; i++) if (i !== iF && !(gd[iF] >= MARGIN_GROUND * gd[i])) return bad('ground');
    for (const feet of [false, true]) {
      const d = m.run.map((_, i) => { const A = S[p][i], B = S[q][i]; return feet ? Math.hypot(B.fx - A.fx, B.fy - A.fy) : Math.hypot(B.hx - A.hx, B.hy - A.hy); });
      let best = 0; for (let i = 0; i < n; i++) if (i !== iF) best = Math.max(best, d[i]);
      if (!(best >= MARGIN_SCREEN * d[iF])) return bad('screen-fastest');
      if (q - p >= 2) {
        const rl = d.map((x, i) => x / ((S[p][i].size + S[q][i].size) / 2));
        for (let i = 0; i < n; i++) if (i !== iH && !(rl[iH] >= MARGIN_RULER * rl[i])) return bad('body-ruler');
      }
    }
  }
  const Gx = M.gridAxes(m);
  for (let k = 0; k < N; k++) {
    const v = M.visibleShares(m, cam, ts[k]);
    if (v.some((s) => s < M.C.VIS_ALL) || v[iF] < M.C.VIS_A || (k === 0 && v.some((s) => s < M.C.VIS_T0))) return bad('occlusion');
    for (let i = 0; i < n; i++) {
      const p = M.posAt(m, i, ts[k]), pp = cam.project(p[0], 0, p[2]);
      for (const ax of [Gx.A, Gx.B]) { const q = cam.project(p[0] + ax[0] * M.C.YARD, 0, p[2] + ax[2] * M.C.YARD); if (Math.hypot(q.x - pp.x, q.y - pp.y) < M.C.YARD_PX) return bad('grid-lines'); }
    }
  }
  if (cuesOn(m, S).some((c) => c.picks === iF)) return bad('single-frame-cue');
  return { ok: true };
}
export function gate(m) {
  try {
    if (!m || m.task !== NAME || !M.contract(m) || !frameContract(m).ok) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}

export function frameAudit(m) {
  const cam = M.camOf(m), ts = frameTimes(m), iF = m.answer;
  const S = ts.map((t) => m.run.map((_, i) => M.screenOf(m, cam, i, t)));
  const hits = cuesOn(m, S).filter((c) => c.picks === iF);
  const d = (p, q) => m.run.map((_, i) => Math.hypot(S[q][i].hx - S[p][i].hx, S[q][i].hy - S[p][i].hy));
  const arg = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
  const ruler = M.rulerAll(m, cam, ts[0], ts[N - 1]);
  const ground = m.run.map((_, i) => Math.hypot(M.posAt(m, i, ts[N - 1])[0] - M.posAt(m, i, 0)[0], M.posAt(m, i, ts[N - 1])[2] - M.posAt(m, i, 0)[2]));
  return { singleFrame: hits.length > 0, oneFrameCuesOnF: hits, screenFastestIsF: arg(d(0, N - 1)) === iF, bodyRulerIsF: arg(ruler) === iF,
    bodyRulerIsH: arg(ruler) === M.roleIndex(m, 'H'), groundReadingIsF: arg(ground) === iF, frames: N, dt: r4(dtOf(m)) };
}

const buttonsOf = (m) => {
  const n = m.buttons.length, gap = 6, w = (VIEW.w - 4 - (n - 1) * gap) / n;
  return m.buttons.map((col, i) => ({ id: col, col, a: { op: 'pick', color: col }, x: 2 + i * (w + gap), y: BTN.y, w, h: BTN.h }));
};
const colorOf = (m, i) => m.run[i].color;

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: orig.meta.actionSpace,
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 3000000; a++) {
      const r = R(mulberry32(mix32(key, a)));
      const m = M.attempt(r, drawTarget(r), { task: NAME, board: { ...BOARD } });
      if (typeof m === 'string') continue;
      if (!(r.raw() < thinWeight(m))) continue;
      m.buttons = M.PALETTE.filter((c) => m.run.some((q) => q.color === c));
      m.look = { sunAz: r4((r.raw() < 0.5 ? -1 : 1) * r.uniform(15, 50)), sunEl: r4(r.uniform(42, 62)), seed: Math.floor(r.raw() * 1e6) };
      m.hold = dtOf(m);
      m.live = true; m.nFrames = N;
      m.gen = { tries: a + 1 };
      if (!M.contract(m)) continue;
      if (!frameContract(m).ok) continue;
      if (!gate(m)) continue;
      return m;
    }
    throw new Error(`${NAME}: generator exhausted`);
  },

  frames(m) { return { n: N, period: N * dtOf(m) }; },
  init() { return { ...clockState(), pick: null, taps: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'pick'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? dtOf(m);
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
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
      detail: { pick: st.pick, answer: colorOf(m, m.answer), pickedRole: pi >= 0 ? m.run[pi].role : null, bodyRuler: colorOf(m, M.bodyRuler(m)),
        frame: frameOf(m, st.t) + 1, taps: st.taps, speeds: Object.fromEntries(m.run.map((q) => [q.color, q.v])) } };
  },

  oracle(m) { return [{ op: 'wait', sec: (N - 1) * dtOf(m) }, { op: 'pick', color: colorOf(m, m.answer) }]; },

  randomPolicy(m, rnd) {
    const k = Math.floor(rnd() * N), c = m.buttons[Math.floor(rnd() * m.buttons.length)];
    return [{ op: 'wait', sec: k * dtOf(m) }, { op: 'pick', color: c }];
  },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) { return env.state && env.manifest ? tickClock(env, dt, { running: () => false }) : false; },

  drawBoard(g, br, env) {
    const m = env.manifest;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    V.drawView(g, env, frameOf(m, env.state.t) * dtOf(m));
    drawRow(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const b = hitButton(buttonsOf(env.manifest), evt.x, evt.y);
    return b ? [{ ...b.a }] : [];
  },

  footerStatus(env) { return env.state.pick ? 'Runner picked' : 'No runner picked'; },
  gate, frameAudit,
};
export default task;

import { rr, ACCENT } from '../core/panel.js';
function drawRow(g, env) {
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
