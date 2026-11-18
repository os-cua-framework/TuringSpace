import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import * as G from '../common/_f16_multi_cam_gen.js';
import * as W from '../common/_multi_cam_headcount_scene.js';

const RT = W.RT, FEED = W.FEED, NAME = G.NAME, GAP = W.FEED_GAP, NB = G.HI - G.LO + 1;
const BTN = { y: FEED.h + 8, h: 44, gap: 6 };
const BOARD = { w: 3 * FEED.w + 2 * GAP, h: FEED.h + 8 + BTN.h + 4 };
const PROMPT = 'How many people are on the square?', SUB = 'Three cameras · press Next frame to step through the clip';
const r3 = (v) => Math.round(v * 1000) / 1000;
const LAYOUT_GROUP = 5;

export function gate(m) { return G.check(m) === null && task.verify(replay(m), m).success; }
function replay(m) { const st = task.init(m); for (const a of task.oracle(m)) task.applyAction(st, a, m); return st; }

export const frames = () => ({ n: G.NF, period: G.NF * G.DTF });
export const frameIdx = (t) => ((Math.round(t / G.DTF) % G.NF) + G.NF) % G.NF;
export const frameAudit = G.frameAudit;
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export const buttons = () => {
  const w = (BOARD.w - (NB - 1) * BTN.gap) / NB;
  return Array.from({ length: NB }, (_, k) => ({ n: G.LO + k, x: k * (w + BTN.gap), y: BTN.y, w, h: BTN.h }));
};
const hitBtn = (x, y) => buttons().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'pick', n: `${G.LO}..${G.HI}`, note: 'tap a number button under the feeds to choose it (tap another to change; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },
  frames,

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const r0 = mulberry32(mix32(key, 0x5eed0000)), C = G.cast(r0);
    let lay = null, grp = -1;
    for (let a = 0; a < 3000; a++) {
      const gI = Math.floor(a / LAYOUT_GROUP);
      if (gI !== grp) { grp = gI; lay = G.buildLayout(R(mulberry32(mix32(key, 0x1a000000 + gI))), C); }
      if (!lay) { a = (gI + 1) * LAYOUT_GROUP - 1; continue; }
      const m = G.tryBuild(R(mulberry32(mix32(key, a))), C, lay);
      if (!m) { if (lay.fails >= 3) a = (gI + 1) * LAYOUT_GROUP - 1; continue; }
      m.board = { ...BOARD }; m.dt = G.DTF; m.attempt = a;
      if (G.check(m) === null) return m;
    }
    throw new Error('f16_multi_cam_headcount: generator exhausted');
  },

  init() { return { ...clockState(), sel: -1, taps: 0, tauSel: null }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'pick', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    let n = a.n;
    if (a.op === 'tap') { const b = Number.isFinite(a.x) && Number.isFinite(a.y) ? hitBtn(a.x, a.y) : null; if (!b) return { ok: false, reason: 'no-button' }; n = b.n; }
    if (!Number.isInteger(n) || n < G.LO || n > G.HI) return { ok: false, reason: 'bad-n' };
    st.sel = n; st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    return { success: ok, error: ok ? 0 : (st.sel < 0 ? 1 : Math.abs(st.sel - m.answer)), partial: ok ? 1 : 0,
      detail: { selected: st.sel, answer: m.answer, people: m.people.length, pairs: m.pairs.length, outfits: m.N - m.pairs.length,
        t: r3(st.t), frame: frameIdx(st.t) + 1, taps: st.taps } };
  },

  oracle(m) {
    const out = [];
    for (let i = 0; i < G.NF - 1; i++) out.push({ op: 'wait', sec: G.DTF });
    out.push({ op: 'pick', n: m.answer });
    return out;
  },

  randomPolicy(m, rnd) { return [{ op: 'pick', n: G.LO + Math.floor(rnd() * NB) }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    return !view(env).drawnHi;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawFeeds(g, env);
    drawNumbers(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const b = hitBtn(evt.x, evt.y);
    return b ? [{ op: 'pick', n: b.n }] : [];
  },

  footerStatus(env) { return env.state.sel >= 0 ? `Your answer: ${env.state.sel}` : 'No answer yet'; },
};
export default task;

function view(env) {
  return (env._mc ??= { m: null, bg: [new Map(), new Map(), new Map()], key: '', canvases: null, drawnHi: false, ms: [], bgMs: [] });
}
function background(V, m, ci, q) {
  const k = String(q), M = V.bg[ci];
  if (!M.has(k)) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const img = RT.render(W.staticScene(m, ci), q, q >= 1.5 ? 1 : (q > 1 ? 2 : 1));
    img.canvas = RT.toCanvas(img);
    M.set(k, img);
    if (typeof performance !== 'undefined') V.bgMs.push([ci, q, Math.round(performance.now() - t0)]);
  }
  return M.get(k);
}
function compose(V, m, ci, tau, poses, q) {
  const ss = q >= 1.5 ? 1 : (q > 1 ? 2 : 1), bg = background(V, m, ci, q);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bg.w, bg.h) : Object.assign(document.createElement('canvas'), { width: bg.w, height: bg.h });
  const g = c.getContext('2d');
  g.drawImage(bg.canvas, 0, 0);
  const only = new Set();
  m.people.forEach((p, i) => { if (W.personInPicture(m, ci, poses[i].x, poses[i].z, p.k)) only.add(i); });
  if (!only.size) return c;
  const sc = W.sceneAt(m, ci, tau, { only, poses });
  const pids = new Set(sc.poses.map(([i]) => W.ID.person(i)));
  const rects = [];
  for (const [i, P] of sc.poses) {
    const b = W.personScreenBox(m, ci, P.x, P.z, m.people[i].k, 0.4);
    const r = [Math.max(0, Math.floor(b[0]) - 1), Math.max(0, Math.floor(b[1]) - 1), Math.min(FEED.w, Math.ceil(b[2]) + 1), Math.min(FEED.h, Math.ceil(b[3]) + 1)];
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
  return c;
}
function drawFeeds(g, env) {
  const st = env.state, m = env.manifest, V = view(env), qs = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.bg.forEach((M) => M.clear()); V.key = ''; V.bgMs = []; }
  const tau = frameIdx(st.t) * G.DTF, q = qs;
  const key = `${tau.toFixed(4)}|${q}`;
  if (V.key !== key) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const poses = m.people.map((p) => W.poseAt(p, tau));
    V.canvases = [0, 1, 2].map((ci) => compose(V, m, ci, tau, poses, q));
    V.key = key;
    if (typeof performance !== 'undefined') { V.ms.push([q, Math.round(performance.now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
  }
  V.drawnHi = true;
  for (let ci = 0; ci < 3; ci++) {
    const x = ci * (FEED.w + GAP);
    g.save();
    g.beginPath(); g.rect(x, 0, FEED.w, FEED.h); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(V.canvases[ci], x, 0, FEED.w, FEED.h);
    g.restore();
    g.save(); g.strokeStyle = '#2b3138'; g.lineWidth = 1.5; g.strokeRect(x + 0.75, 0.75, FEED.w - 1.5, FEED.h - 1.5);
    g.fillStyle = 'rgba(20,24,28,0.55)'; rr(g, x + 7, 7, 46, 17, 4); g.fill();
    g.fillStyle = '#f2f4f6'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(`CAM ${ci + 1}`, x + 13, 16);
    g.restore();
  }
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
