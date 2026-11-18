import { drawPromptText } from '../core/panel.js';
import { clockState, tickClock } from '../core/clock.js';
import * as W from '../common/_cat_hide_where_scene.js';
import * as G from '../common/_cat_hide_where_gen.js';
import * as D from '../common/_f16_cat_hide_design.js';
import { frameTau, framesOf, oracleWaits, applyWait, r3 } from '../common/_f16_frames.js';
const { RT, VIEW } = W;

const NAME = 'f16_cat_hide';
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Tap where the cat is hiding', SUB = 'Press Next frame to step through the clip \u00b7 tap a piece of furniture, then Verify';

export const sceneTime = (m, t) => frameTau(m, t);

export function pickAt(m, x, y) {
  if (!(x >= 0 && y >= 0 && x <= VIEW.w && y <= VIEW.h)) return -1;
  if (m.flip) x = VIEW.w - x;
  const sc = W.furnitureScene(m);
  let id = RT.pickId(sc, x, y);
  if (id >= 0 && id < m.furn.length) return id;
  for (let r = 2; r <= 6; r += 2) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4; id = RT.pickId(sc, x + r * Math.cos(a), y + r * Math.sin(a));
    if (id >= 0 && id < m.furn.length) return id;
  }
  return -1;
}

export function gate(m) {
  if (!m || m.task !== NAME || !Array.isArray(m.furn) || m.furn.length < D.FG.nPieces[0] || m.furn.length > D.FG.nPieces[1] || !m.live) return false;
  if (D.roomProblem(m) || D.frameProblem(m)) return false;
  if (G.restPixelDiff(m, 1) + G.restPixelDiff(m, 2) > 0) return false;
  if (!Array.isArray(m.taps) || m.taps.length !== m.furn.length) return false;
  if (m.taps.some((p, i) => pickAt(m, p[0], p[1]) !== i)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
export function frameAudit(m) { return D.frameAudit(m); }

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the piece of furniture under the point (tap it again to clear; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const m = D.generate(rng);
    m.task = NAME; m.live = true;
    return m;
  },

  frames(m) { return framesOf(m); },
  init() { return { ...clockState(), sel: -1, taps: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') return applyWait(st, a);
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    const id = pickAt(m, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-furniture' };
    st.sel = st.sel === id ? -1 : id; st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel, selKind: st.sel >= 0 ? m.furn[st.sel].kind : null, answer: m.answer, answerKind: m.furn[m.answer].kind,
        decoyA: m.nearA, decoyKind: m.furn[m.nearA].kind, picked: st.sel === m.nearA ? 'A' : st.sel === m.cabinet ? 'cabinet' : st.sel === m.answer ? 'B' : st.sel < 0 ? 'none' : 'other',
        t: r3(st.t), taps: st.taps } };
  },

  oracle(m) { return [...oracleWaits(m.f16.taus.length), { op: 'tap', x: m.taps[m.answer][0], y: m.taps[m.answer][1] }]; },

  randomPolicy(m, rnd) { const i = Math.floor(rnd() * m.furn.length), p = m.taps[i]; return [{ op: 'tap', x: p[0], y: p[1] }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    const active = tickClock(env, dt, { running: () => false });
    return active || !view(env).drawnAt;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    if (!(evt.x >= 0 && evt.y >= 0 && evt.x <= VIEW.w && evt.y <= VIEW.h)) return [];
    return pickAt(env.manifest, evt.x, evt.y) >= 0 ? [{ op: 'tap', x: evt.x, y: evt.y }] : [];
  },

  footerStatus(env) { return env.state.sel >= 0 ? '1 selected' : 'Nothing selected'; },
  gate, frameAudit,
};
export default task;

function view(env) { return (env._chw ??= { m: null, q: 0, bg: null, ring: null, ringKey: '', patch: null, patchKey: '', drawnAt: null, ms: [], bgMs: 0 }); }
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  if (V.m !== m || V.q !== q) {
    V.m = m; V.q = q; V.ring = null; V.ringKey = ''; V.patch = null; V.patchKey = '';
    const t0 = now(); const img = RT.render(W.furnitureScene(m), q); V.bg = { img, canvas: RT.toCanvas(img) }; V.bgMs = Math.round(now() - t0);
  }
  const tau = sceneTime(m, st.t), pose = W.catPose(m, tau);
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  if (m.flip) { g.translate(VIEW.w, 0); g.scale(-1, 1); }
  g.imageSmoothingEnabled = true;
  g.drawImage(V.bg.canvas, 0, 0, VIEW.w, VIEW.h);
  const rc = G.patchRect(m, pose, 4);
  if (rc) {
    const key = pose.moving || pose.lie < 1 ? `${tau.toFixed(4)}` : 'rest';
    if (V.patchKey !== key) {
      const t0 = now();
      const pr = RT.renderRect(W.sceneAt(m, tau, { pose }), q, rc);
      V.patch = { img: pr, canvas: RT.toCanvas(pr) }; V.patchKey = key;
      V.ms.push([q, Math.round(now() - t0), rc.w * rc.h]); if (V.ms.length > 400) V.ms.shift();
    }
    const P = V.patch.img;
    g.drawImage(V.patch.canvas, P.x, P.y, P.w / q, P.h / q);
  }
  if (st.sel >= 0) {
    const rk = `${st.sel}|${q}`;
    if (V.ringKey !== rk) { V.ringKey = rk; V.ring = RT.silhouetteRings(V.bg.img, new Set([st.sel]), [25, 145, 250, 255], 2.4); }
    g.drawImage(V.ring, 0, 0, VIEW.w, VIEW.h);
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
  V.drawnAt = st.t;
}
export function _viewStats(env) { const V = view(env); return { bgMs: V.bgMs, ms: V.ms.slice() }; }
