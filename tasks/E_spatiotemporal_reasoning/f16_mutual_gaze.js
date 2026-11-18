import { drawPromptText } from '../core/panel.js';
import { clockState, tickClock, CLOCK } from '../core/clock.js';
import * as W from '../common/_mutual_gaze_pick_scene.js';
import * as D from '../common/_f16_mutual_gaze_design.js';
import * as MG from '../common/mutual_gaze_pick.js';
import { frameTau, frameIdx, framesOf, oracleWaits, applyWait, r3 } from '../common/_f16_frames.js';

const RT = W.RT;
const NAME = 'f16_mutual_gaze';
const VIEW = W.VIEW;
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Tap the two people who look at each other', SUB = 'Answer on the last frame \u00b7 tap two people, then Verify';
export const GATE = MG.GATE;
export const sceneTime = (m, t) => frameTau(m, t);
const samePair = (p, q) => !!p && !!q && ((p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

export const pickAt = (m, tau, x, y) => MG.pickAt(m, tau, x, y);

export function gate(m) {
  if (!m || m.task !== NAME || !m.f16) return false;
  if (D.frameProblem(m)) return false;
  if (m.taps.some((p, i) => m.f16.taus.some((t) => pickAt(m, t, p[0], p[1]) !== i))) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (task.applyAction(st, a, m).ok === false) return false;
  return task.verify(st, m).success;
}
export function frameAudit(m) { return D.frameAudit(m); }

const atEnd = (env) => frameIdx(env.manifest, env.state.t) === env.manifest.f16.taus.length - 1;

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the person under the point (tap a selected person again to clear; with two selected, a new tap replaces the older one; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const m = D.generate(rng, level, index, knobs);
    m.task = NAME; m.live = true; m.board = { ...BOARD };
    return m;
  },

  frames(m) { return framesOf(m); },
  init() { return { ...clockState(), sel: [], taps: 0, tauSel: [] }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') return applyWait(st, a);
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    const tau = sceneTime(m, st.t), id = pickAt(m, tau, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-person' };
    const k = st.sel.indexOf(id);
    if (k >= 0) { st.sel.splice(k, 1); st.tauSel.splice(k, 1); }
    else { st.sel.push(id); st.tauSel.push(r3(tau)); if (st.sel.length > 2) { st.sel.shift(); st.tauSel.shift(); } }
    st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel.length === 2 && samePair(st.sel, m.answer);
    const ro = m.roles, sel = st.sel.slice().sort((a, b) => a - b);
    const which = (p) => (samePair(p, [ro.a.p, ro.a.q]) ? 'trapA' : samePair(p, [ro.b.c, ro.b.d]) ? 'trapB' : samePair(p, [ro.c.x, ro.c.y]) ? 'trapC' : samePair(p, m.answer) ? 'answer' : 'other');
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : (st.sel.filter((i) => m.answer.includes(i)).length / 2),
      detail: { selected: sel, answer: m.answer, picked: sel.length === 2 ? which(sel) : null, n: m.people.length, t: r3(st.t), tauSel: st.tauSel, taps: st.taps } };
  },

  oracle(m) {
    const [a, b] = m.answer, k = m.f16.kM;
    return [...oracleWaits(k + 1), { op: 'tap', x: m.taps[a][0], y: m.taps[a][1] }, { op: 'tap', x: m.taps[b][0], y: m.taps[b][1] }];
  },

  randomPolicy(m, rnd) {
    const n = m.people.length, i = Math.floor(rnd() * n); let j = Math.floor(rnd() * (n - 1)); if (j >= i) j++;
    return [{ op: 'tap', x: m.taps[i][0], y: m.taps[i][1] }, { op: 'tap', x: m.taps[j][0], y: m.taps[j][1] }];
  },

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
    g.restore();
  },

  canVerify(env) { return atEnd(env); },
  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down' || !atEnd(env)) return [];
    const st = env.state, m = env.manifest;
    if (!(evt.x >= 0 && evt.y >= 0 && evt.x <= VIEW.w && evt.y <= VIEW.h)) return [];
    return pickAt(m, sceneTime(m, st.t), evt.x, evt.y) >= 0 ? [{ op: 'tap', x: evt.x, y: evt.y }] : [];
  },

  footerStatus(env) { const k = env.state.sel.length; return k === 0 ? 'Nothing selected' : `${k} selected`; },
  gate, frameAudit,
};
export default task;

const Q_PLAY = 2, Q_MOVE = 1.25, LAYER_MAX = 30;
function view(env) {
  return (env._mgp ??= { m: null, bg: new Map(), layers: new Map(), ring: null, ringKey: '', drawnHi: false, ms: [], sc: null, scKey: '', uid: 0 });
}
function lru(map, key, max, make) {
  if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v);
  while (map.size > max) map.delete(map.keys().next().value);
  return v;
}
function personRect(m, i, q) {
  const cam = W.camOf(m), poses = m.people.map(() => null); poses[i] = q;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of W.dynamicShapes(m, 0, undefined, poses, i)) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
  }
  return { x: Math.floor(x0 - 7), y: Math.floor(y0 - 7), w: Math.ceil(x1 - x0 + 14), h: Math.ceil(y1 - y0 + 14) };
}
const ORDER = new WeakMap();
function farToNear(m) {
  let o = ORDER.get(m);
  if (!o) { const b = W.camBasis(m); o = m.people.map((P, i) => [W.camNorm(b, W.neckTop(P))[2], i]).sort((a, c) => c[0] - a[0]).map((x) => x[1]); ORDER.set(m, o); }
  return o;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.bg.clear(); V.layers.clear(); V.ringKey = ''; }
  const tau = sceneTime(m, st.t), still = CLOCK.paused || !!env.submitted;
  const qL = still ? q : Math.min(q, Q_PLAY);
  const bg = lru(V.bg, `${q}`, 2, () => { const t0 = now(); const img = RT.render(W.backgroundScene(m), q, q >= 1.5 ? 1 : 2); img.canvas = RT.toCanvas(img); img.data = null; V.bgMs = Math.round(now() - t0); return img; });
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(bg.canvas, 0, 0, VIEW.w, VIEW.h);
  const poses = m.people.map((_, i) => W.poseAt(m, i, tau));
  const pk = (i) => `${poses[i].b.toFixed(2)},${poses[i].g.toFixed(2)},${poses[i].p.toFixed(2)}`;
  const t0 = now(); let traced = 0;
  const movers = farToNear(m).filter((i) => poses[i].gMoving > 0 || poses[i].bMoving > 0);
  const qOf = (i) => (still ? q : movers.includes(i) ? Math.min(q, movers.indexOf(i) < movers.length - 2 ? 1 : Q_MOVE) : qL);
  const layers = farToNear(m).map((i) => lru(V.layers, `${qOf(i)}|${still ? 'hi' : 'lo'}|${i}|${pk(i)}`, LAYER_MAX, () => {
    const img = RT.renderKeep(W.sceneOne(m, i, poses[i], !still), qOf(i), personRect(m, i, poses[i]), new Set([W.ID.person(i), W.ID.back(i)]), 1);
    img.canvas = RT.toCanvas(img); img.data = null; img.uid = ++V.uid; traced++;
    return img;
  }));
  if (traced) { V.ms.push([qL, traced, Math.round(now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
  for (const L of layers) g.drawImage(L.canvas, L.x, L.y, L.w / L.q, L.h / L.q);
  if (st.sel.length) {
    const rk = `${st.sel.join(',')}|${layers.map((L) => L.uid).join(',')}`;
    if (V.ringKey !== rk) {
      V.ringKey = rk;
      const set = new Set(st.sel.map((i) => W.ID.person(i)));
      V.ring = layers.filter((L) => L.ids.some((v) => set.has(v))).map((L) => ({ L, img: RT.toCanvas(RT.ringImage({ w: L.w, h: L.h, q: L.q, ids: L.ids }, set)) }));
    }
    for (const { L, img } of V.ring) g.drawImage(img, L.x, L.y, L.w / L.q, L.h / L.q);
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
  V.drawnHi = still;
}
export function _viewStats(env) { const V = view(env); return { bgMs: V.bgMs, ms: V.ms.slice() }; }
