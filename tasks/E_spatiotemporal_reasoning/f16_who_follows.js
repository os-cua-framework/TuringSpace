import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as G from '../common/_who_follows_him_gen.js';
import * as W from '../common/_who_follows_him_scene.js';
import * as D from '../common/_f16_who_follows_design.js';
import { frameTau, framesOf, oracleWaits, applyWait, r3 } from '../common/_f16_frames.js';

const RT = W.RT, VIEW = W.VIEW;
const NAME = 'f16_who_follows';
const BTN = { y: VIEW.h + 8, h: 44, gap: 6 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 4 };
const PROMPT = 'Who is following the man in red?', SUB = 'Press Next frame to step through the clip \u00b7 tap a colour, then Verify';

export const sceneTime = (m, t) => frameTau(m, t);
export function gate(m) {
  if (!m || m.task !== NAME || !m.f16) return false;
  if (G.check({ ...m, task: G.NAME }) !== null) return false;
  if (D.frameProblem(m)) return false;
  return task.verify(replay(m), m).success;
}
function replay(m) { const st = task.init(m); for (const a of task.oracle(m)) task.applyAction(st, a, m); return st; }
export function frameAudit(m) { return D.frameAudit(m); }

export const buttons = (m) => {
  const n = m.buttons.length, w = (VIEW.w - (n - 1) * BTN.gap) / n;
  return m.buttons.map((pi, k) => ({ k, pi, x: k * (w + BTN.gap), y: BTN.y, w, h: BTN.h }));
};
const hitBtn = (m, x, y) => buttons(m).find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'pick', k: '0..n-1', note: 'tap a colour button under the clip to choose that person (tap another to change; revisable until Verify)' },
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
    let k = a.k;
    if (a.op === 'tap') { const b = Number.isFinite(a.x) && Number.isFinite(a.y) ? hitBtn(m, a.x, a.y) : null; if (!b) return { ok: false, reason: 'no-button' }; k = b.k; }
    if (!Number.isInteger(k) || k < 0 || k >= m.buttons.length) return { ok: false, reason: 'bad-k' };
    st.sel = m.buttons[k]; st.taps++; st.tauSel = r3(sceneTime(m, st.t));
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel >= 0 ? m.people[st.sel].colorName : null, selectedRole: st.sel >= 0 ? m.people[st.sel].role : null,
        answer: m.people[m.answer].colorName, people: m.people.length, t: r3(st.t), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) { return [...oracleWaits(m.f16.taus.length), { op: 'pick', k: m.buttons.indexOf(m.answer) }]; },

  randomPolicy(m, rnd) { return [{ op: 'pick', k: Math.floor(rnd() * m.buttons.length) }]; },

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
    drawButtons(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const b = hitBtn(env.manifest, evt.x, evt.y);
    return b ? [{ op: 'pick', k: b.k }] : [];
  },

  footerStatus(env) { const s = env.state.sel; return s >= 0 ? `Your answer: the person in ${env.manifest.people[s].colorName}` : 'No answer yet'; },
  gate, frameAudit,
};
export default task;

function view(env) {
  return (env._wf ??= { m: null, bg: new Map(), key: '', canvas: null, drawnHi: false, ms: [], bgMs: null });
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
    let rects = [];
    for (const [i, P] of sc.poses) {
      const b = W.personScreenBox(m, P.x, P.z, m.people[i].k, 0.4);
      const r = [Math.max(0, Math.floor(b[0]) - 1), Math.max(0, Math.floor(b[1]) - 1), Math.min(VIEW.w, Math.ceil(b[2]) + 1), Math.min(VIEW.h, Math.ceil(b[3]) + 1)];
      if (r[2] > r[0] && r[3] > r[1]) rects.push(r);
    }
    for (let merged = true; merged;) {
      merged = false;
      outer: for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
        const A = rects[a], B = rects[b];
        if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) {
          rects[a] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]; rects.splice(b, 1); merged = true; break outer;
        }
      }
    }
    sc.fast = q === 1;
    for (const r of rects) {
      const patch = RT.renderPatch(sc, bg, { x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1] }, pids, q, ss, q === 1);
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
function drawButtons(g, env) {
  const m = env.manifest, sel = env.state.sel, off = !!env.submitted;
  g.save();
  for (const b of buttons(m)) {
    const p = m.people[b.pi], on = b.pi === sel;
    rr(g, b.x, b.y, b.w, b.h, 9);
    g.fillStyle = off && !on ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = on ? '#1f2a36' : '#c8d0d8'; g.lineWidth = on ? 3 : 1; g.stroke();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 2, light = luminance(p.top) > 0.75;
    g.globalAlpha = off && !on ? 0.45 : 1;
    g.fillStyle = p.top; g.strokeStyle = light ? '#9aa3ad' : 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - 13, cy + 15); g.quadraticCurveTo(cx - 13, cy + 1, cx, cy + 1); g.quadraticCurveTo(cx + 13, cy + 1, cx + 13, cy + 15); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(cx, cy - 7, 6.5, 0, Math.PI * 2); g.fillStyle = '#d9c2ad'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.stroke();
    g.globalAlpha = 1;
    if (on) {
      g.beginPath(); g.arc(b.x + b.w - 9, b.y + 9, 7, 0, Math.PI * 2); g.fillStyle = '#1f2a36'; g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(b.x + b.w - 12.2, b.y + 9.2); g.lineTo(b.x + b.w - 9.6, b.y + 11.6); g.lineTo(b.x + b.w - 5.6, b.y + 6.6); g.stroke();
    }
  }
  g.restore();
}
function luminance(hex) { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
export function _viewStats(env) { const V = view(env); return { bgMs: V.bgMs, ms: V.ms.slice() }; }
