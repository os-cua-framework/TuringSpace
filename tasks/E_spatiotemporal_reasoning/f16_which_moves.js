import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, tickClock } from '../core/clock.js';
import * as RT from '../common/_which_one_moves_rt.js';
import * as W from '../common/_which_one_moves_scene.js';
import { pickAt } from '../common/which_one_moves.js';
import { NAME, VIEW, BOARD, NF, DT, GATE, _tryBuild, frameContract, frameTracks, oneFrameCues, frameOf, tauOf } from '../common/_f16_which_moves_gen.js';
import { naivePair, nearestOf, argmax } from '../common/which_one_moves.js';

const PROMPT = 'Tap the one thing that is moving by itself', SUB = 'Press Next frame to step through the clip · tap a thing, then Verify';
const r3 = (v) => Math.round(v * 1000) / 1000;
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export function gate(m) {
  try {
    if (!m || m.task !== NAME || frameContract(m, true)) return false;
    if (m.tap.frame !== NF - 1 || pickAt(m, m.ft[m.tap.frame], m.tap.x, m.tap.y) !== m.answer) return false;
    if (m.pts0.some((p, i) => !p || pickAt(m, m.ft[0], p[0], p[1]) !== i)) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}

export function frameAudit(m) {
  const T = frameTracks(m), k = m.answer, cues = oneFrameCues(m, T), hits = cues.filter((c) => c.picks === k);
  const nn = Array.from({ length: NF }, (_, g) => nearestOf(T.cen.map((tr) => tr[g])));
  const cnt = { local: 0, localPair: 0, max: 0, min: 0, dir: 0, pairs: 0 };
  for (let A = 0; A < NF; A++) for (let B = 0; B < NF; B++) {
    if (A === B) continue;
    const r = naivePair(T, A, B, nn[A]); if (!r) continue;
    cnt.pairs++; for (const q of ['local', 'localPair', 'max', 'min', 'dir']) if (r[q] === k) cnt[q]++;
  }
  return { singleFrame: hits.length > 0, oneFrameCuesOnM: hits, readingsOnM: cnt, outFrames: [m.out[0] + 1, m.out[1] + 1], firstEqualsLast: true };
}

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'select the object under the point in the picture shown (tap it again to clear; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const r0 = mulberry32(mix32(key, 0x5eed0000)), mk = W.MOVABLE[Math.floor(r0() * 3)], band = r0(), side = r0() < 0.5 ? 0 : 1;
    for (let a = 0; a < 12000; a++) {
      const m = _tryBuild(R(mulberry32(mix32(key, a))), mk, band, side);
      if (m && gate(m)) { m.gen = { tries: a + 1 }; return m; }
    }
    throw new Error(`${NAME}: generator exhausted`);
  },

  frames(m) { return { n: NF, period: NF * DT }; },
  init() { return { ...clockState(), sel: -1, taps: 0, frameSel: null }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? DT;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    const f = frameOf(m, st.t), id = pickAt(m, m.ft[f], a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-object' };
    st.sel = st.sel === id ? -1 : id; st.taps++; st.frameSel = st.sel >= 0 ? f + 1 : null;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel, selKind: st.sel >= 0 ? m.objs[st.sel].kind : null, answer: m.answer, moverKind: m.objs[m.answer].kind,
        decoy: m.decoy.d, frame: frameOf(m, st.t) + 1, frameSel: st.frameSel, taps: st.taps, outFrames: [m.out[0] + 1, m.out[1] + 1] } };
  },

  oracle(m) { return [{ op: 'wait', sec: (NF - 1) * DT }, { op: 'tap', x: m.tap.x, y: m.tap.y }]; },

  randomPolicy(m, rnd) { const i = Math.floor(rnd() * m.objs.length), p = m.pts0[i]; return [{ op: 'tap', x: p[0], y: p[1] }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    if (!env.state || !env.manifest) return false;
    tickClock(env, dt, { running: () => false });
    return !view(env).drawnHi;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const st = env.state, m = env.manifest;
    if (!(evt.x >= 0 && evt.y >= 0 && evt.x <= VIEW.w && evt.y <= VIEW.h)) return [];
    return pickAt(m, tauOf(m, st.t), evt.x, evt.y) >= 0 ? [{ op: 'tap', x: evt.x, y: evt.y }] : [];
  },

  footerStatus(env) { return env.state.sel >= 0 ? '1 selected' : 'Nothing selected'; },
  gate, frameAudit,
};
export default task;

const HI_MAX = 12;
function view(env) { return (env._wom ??= { m: null, bake: null, hi: new Map(), ring: null, ringKey: '', drawnHi: false }); }
function lru(map, key, max, make) {
  if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v);
  while (map.size > max) map.delete(map.keys().next().value);
  return v;
}
function frameImage(V, m, tau, q) {
  const img = RT.render(W.frameScene(m, tau, V.bake), q, 1);
  img.canvas = RT.toCanvas(img); img.data = null;
  return img;
}
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.hi.clear(); V.ringKey = ''; V.bake = W.bakeFor(m); }
  const f = frameOf(m, st.t), tau = m.ft[f];
  const img = lru(V.hi, `${f}|${q}`, HI_MAX, () => frameImage(V, m, tau, q)); V.drawnHi = true;
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(img.canvas, 0, 0, VIEW.w, VIEW.h);
  if (st.sel >= 0) {
    const rk = `${st.sel}`;
    if (V.ring?.img !== img || V.ringKey !== rk) { V.ringKey = rk; V.ring = { img, canvas: RT.toCanvas(RT.ringImage(img, new Set([st.sel]))) }; }
    g.drawImage(V.ring.canvas, 0, 0, VIEW.w, VIEW.h);
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
