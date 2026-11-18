import { drawPromptText, rr } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState, CLOCK } from '../core/clock.js';
import * as M from '../common/_false_belief_keys_model.js';
import * as S from '../common/_false_belief_keys_scene.js';
import * as G from '../common/_false_belief_keys_gen.js';
import * as F from '../common/_f16_false_belief_gen.js';

const NAME = F.NAME, VIEW = M.VIEW, RT = M.RT;
const BOARD = { w: VIEW.w, h: VIEW.h + 4 };
const PROMPT = 'Put the keys where Anna will look for them';
const SUB = 'Press Next frame to step through the clip · tap a box';
const ACCENT = '#1f7ae0';
const r3 = (v) => Math.round(v * 1000) / 1000;
function pickBoxAt(m, k, x, y) {
  if (!(x >= 0 && y >= 0 && x <= VIEW.w && y <= VIEW.h)) return -1;
  let bi = -1, bd = Infinity;
  for (let i = 0; i < m.boxes.length; i++) {
    const b = M.boxScreen(m, k, i).box;
    if (x < b[0] - 7 || x > b[2] + 7 || y < b[1] - 7 || y > b[3] + 7) continue;
    const d = Math.hypot(x - (b[0] + b[2]) / 2, y - (b[1] + b[3]) / 2);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

export function frames(m) { const n = F.frameList(m).length; return { n, period: n }; }
export const frameIdx = (m, t) => { const n = F.frameList(m).length; return ((Math.round(t) % n) + n) % n; };
export const gate = (m) => { try { return F.check(m) === null && task.verify(replay(m), m).success; } catch { return false; } };
export const frameAudit = F.frameAudit;
function replay(m) { const st = task.init(m); for (const a of task.oracle(m)) task.applyAction(st, a, m); return st; }

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${VIEW.w} board px`, y: `0..${VIEW.h} board px`, note: 'tap a box in the picture to put the keys there (tap another to change; revisable until Verify)' },
    ],
    promptHuman: PROMPT,
  },
  frames,

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const D = F.seedDraws(R(mulberry32(M.mix32(key, 0x5eed0000))));
    for (let a = 0; a < 3000; a++) {
      const m = G.tryBuild(R(mulberry32(M.mix32(key, a))), D);
      if (!m) continue;
      m.task = NAME; m.live = false; m.board = { ...BOARD }; m.dt = 1; m.gen = { tries: a + 1 };
      m.tplDef = { id: D.tpl.id, kinds: D.tpl.kinds, slots: D.tpl.slots, expect: D.tpl.expect };
      if (F.check(m) === null) return m;
    }
    throw new Error('f16_false_belief: generator exhausted');
  },

  init() { return { ...clockState(), sel: -1, taps: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'tap', 'pick'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(Number.isFinite(sec) && sec >= 0)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    let i = a.box;
    if (a.op === 'tap') { if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' }; i = pickBoxAt(m, 0, a.x, a.y); }
    if (!Number.isInteger(i) || i < 0 || i >= m.boxes.length) return { ok: false, reason: 'no-box' };
    st.sel = i; st.taps++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = st.sel === m.answer;
    const rd = {};
    for (const [key, fn] of Object.entries(M.READERS)) rd[key] = st.sel >= 0 && fn(m) === st.sel;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { selected: st.sel >= 0 ? m.boxes[st.sel].color : null, answer: m.boxes[m.answer].color, pickedSeatBox: st.sel >= 0 && st.sel < m.nv,
        matchesReader: Object.keys(rd).filter((k) => rd[k]), template: m.tpl, kinds: m.kinds, taps: st.taps, steps: st.steps } };
  },

  oracle(m) {
    const n = F.frameList(m).length, out = [];
    for (let i = 0; i < n; i++) out.push({ op: 'wait', sec: 1 });
    out.push({ op: 'pick', box: m.answer });
    return out;
  },

  randomPolicy(m, rnd) { return [{ op: 'pick', box: Math.floor(rnd() * m.boxes.length) }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env) { const m = env.manifest; return !!m && !view(env).drawnHi; },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    drawMarker(g, env);
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    if (pickBoxAt(env.manifest, 0, evt.x, evt.y) < 0) return [];
    return [{ op: 'tap', x: evt.x, y: evt.y }];
  },

  footerStatus(env) {
    const st = env.state, m = env.manifest;
    return st.sel < 0 ? 'No box picked' : `Keys in the ${m.boxes[st.sel].color} box`;
  },
};
export default task;

function view(env) { return (env._f16fb ??= { m: null, cache: { bg: new Map(), ms: [] }, key: '', canvas: null, drawnHi: false, fl: null }); }
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env), q = Math.min(2, RT.contextScale(g));
  if (V.m !== m) { V.m = m; V.cache = { bg: new Map(), ms: [] }; V.key = ''; V.fl = F.frameList(m); }
  const k = frameIdx(m, st.t), f = V.fl[k], key = `${k}|${q}`;
  if (V.key !== key) {
    const fr = S.renderFrame(m, 0, f.tau, {}, q, V.cache, false);
    V.canvas = RT.toCanvas(fr); V.key = key; V.w = fr.w / q; V.h = fr.h / q;
  }
  V.drawnHi = true;
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(V.canvas, 0, 0, VIEW.w, VIEW.h);
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
function drawMarker(g, env) {
  const st = env.state, m = env.manifest;
  if (st.sel < 0) return;
  const s = M.boxScreen(m, 0, st.sel), b = s.box, pad = 5;
  const x0 = b[0] - pad, y0 = b[1] - pad - 3, x1 = b[2] + pad, y1 = b[3] + pad;
  g.save();
  g.strokeStyle = ACCENT; g.lineWidth = 2.2; g.setLineDash([5, 3]);
  rr(g, x0, y0, x1 - x0, y1 - y0, 6); g.stroke(); g.setLineDash([]);
  const bx = x1 - 1, by = y0 + 1;
  g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.arc(bx - 2.6, by - 2.6, 2.6, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(bx - 0.8, by - 0.8); g.lineTo(bx + 4.4, by + 4.4); g.moveTo(bx + 2.2, by + 2.2); g.lineTo(bx + 4.4, by); g.moveTo(bx + 3.4, by + 3.4); g.lineTo(bx + 5.6, by + 1.2); g.stroke();
  g.restore();
}
