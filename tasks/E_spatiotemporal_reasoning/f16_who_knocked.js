import { drawPromptText } from '../core/panel.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as G from '../common/_who_knocked_vase_gen.js';
import * as S from '../common/_who_knocked_vase_scene.js';
import * as D from '../common/_f16_who_knocked_design.js';
import { frameTau, framesOf, oracleWaits, applyWait, r3 } from '../common/_f16_frames.js';

const RT = S.RT, VIEW = S.VIEW;
const NAME = 'f16_who_knocked';
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Tap the person who knocked the vase over', SUB = 'Press Next frame to step through the clip \u00b7 tap a person, then Verify';

export const sceneTime = (m, t) => frameTau(m, t);
export function gate(m) {
  if (!m || m.task !== NAME || !m.f16) return false;
  const base = { ...m, task: G.NAME, hold: m.hold ?? 1, live: true };
  if (G.check(base) !== null) return false;
  return D.frameProblem(m) === '';
}
export function frameAudit(m) { return D.frameAudit(m); }

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the person under the point in the picture shown (tap another person to change; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const m = D.generate(rng);
    m.task = NAME; m.live = true; m.board = { ...BOARD }; m.hold = 1;
    return m;
  },

  frames(m) { return framesOf(m); },
  init() { return { ...clockState(), sel: -1, taps: 0, tauSel: null }; },

  applyAction(st, a, m, env) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') return applyWait(st, a);
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !(a.x >= 0 && a.y >= 0 && a.x < VIEW.w && a.y < VIEW.h)) return { ok: false, reason: 'bad-point' };
    const tau = sceneTime(m, st.t);
    const id = RT.pickId(S.sceneAt(m, tau, { fast: true }), a.x, a.y);
    st.taps++;
    if (!S.isPersonId(id)) return { ok: true, picked: -1 };
    st.sel = id - S.ID.person(0); st.tauSel = r3(tau);
    return { ok: true, picked: st.sel };
  },

  verify(st, m) {
    const ok = st.sel === m.answer, R = m.roles;
    const role = st.sel < 0 ? null : Object.keys(R).find((k) => R[k] === st.sel);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel, selRole: role, answer: m.answer, t: r3(st.t), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) { return [...oracleWaits(m.f16.taus.length), { op: 'tap', x: m.tap.x, y: m.tap.y }]; },

  randomPolicy(m, rnd) { const i = Math.floor(rnd() * m.people.length), p = m.pts[i]; return [...oracleWaits(m.f16.taus.length), { op: 'tap', x: p[0], y: p[1] }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const m = env.manifest, st = env.state;
    if (!m || !st) return false;
    let active = tickClock(env, dt, { running: () => false });
    const C = cacheOf(env);
    if ((CLOCK.paused || env.submitted) && C.m === m) ensureFullJob(env, C);
    if (C.job) {
      const t0 = performance.now();
      while (C.job && performance.now() - t0 < 22) {
        if (RT.runJob(C.job.job, 6)) { const img = RT.jobImage(C.job.job); C.full.set(C.job.key, { img, canvas: RT.toCanvas(img) }); trim(C.full, 6); C.job = null; }
      }
      active = true;
    }
    return active;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
    drawFrame(g, env);
    g.restore();
    g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    if (!(evt.x >= 0 && evt.y >= 0 && evt.x < VIEW.w && evt.y < VIEW.h)) return [];
    return [{ op: 'tap', x: evt.x, y: evt.y }];
  },

  footerStatus(env) { return env.state.sel >= 0 ? '1 selected' : 'Nothing selected'; },
  gate, frameAudit,
};
export default task;

const Q_PLAY = 1;
function cacheOf(env) { return (env._wkv ??= { m: null, q: 0, bg: null, full: new Map(), prev: new Map(), job: null, ring: null, shownT: null, ms: [], bgMs: 0 }); }
function trim(map, n) { while (map.size > n) map.delete(map.keys().next().value); }
function stillKey(env) { return `s${sceneTime(env.manifest, env.state.t).toFixed(4)}`; }
function ensureFullJob(env, C) {
  const key = stillKey(env);
  if (C.full.has(key) || (C.job && C.job.key === key)) return;
  C.job = { key, job: RT.makeJob(S.sceneAt(env.manifest, sceneTime(env.manifest, env.state.t)), C.q || 1, 1) };
}
function drawFrame(g, env) {
  const m = env.manifest, st = env.state, C = cacheOf(env), q = Math.min(2, RT.contextScale(g));
  if (C.m !== m || C.q !== q) {
    C.m = m; C.q = q; C.full.clear(); C.prev.clear(); C.job = null; C.ring = null;
    const t0 = performance.now(); C.bg = S.renderBackground(m, Q_PLAY, 1); C.bgMs = Math.round(performance.now() - t0);
  }
  const still = CLOCK.paused || !!env.submitted, tau = sceneTime(m, st.t);
  let key, tKey, E;
  if (still) { key = stillKey(env); tKey = tau; E = C.full.get(key); if (!E) ensureFullJob(env, C); }
  else { C.job = null; tKey = Math.round(tau * 30) / 30; key = `p${tKey.toFixed(4)}`; }
  if (!E) {
    E = C.prev.get(key);
    if (!E) {
      const t0 = performance.now();
      const img = S.renderFrame(m, tKey, C.bg);
      E = { img, canvas: RT.toCanvas(img), preview: true };
      C.ms.push(Math.round(performance.now() - t0)); if (C.ms.length > 300) C.ms.shift();
      C.prev.set(key, E); trim(C.prev, 6);
    }
  }
  C.shownT = tKey;
  g.imageSmoothingEnabled = true;
  g.drawImage(E.canvas, 0, 0, VIEW.w, VIEW.h);
  if (st.sel >= 0) {
    const rk = `${key}|${st.sel}|${E.preview ? 'p' : 'f'}`;
    if (!C.ring || C.ring.k !== rk) C.ring = { k: rk, canvas: RT.silhouetteRings(E.img, new Set([S.ID.person(st.sel)]), [25, 145, 250, 255], 2.4) };
    g.drawImage(C.ring.canvas, 0, 0, VIEW.w, VIEW.h);
  }
}
export function _viewStats(env) { const C = cacheOf(env); return { bgMs: C.bgMs, ms: C.ms.slice() }; }
