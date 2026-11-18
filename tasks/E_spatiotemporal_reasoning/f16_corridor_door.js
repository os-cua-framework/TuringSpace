import { drawPromptText } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import ORIG from '../C_multi_step_planning/corridor_walk_mark_pose.js';
import * as W from '../common/_f16_corridor_world.js';
import * as G from '../common/_f16_corridor_gen.js';
import { renderFrame } from '../common/_corridor_watch_mark_door_view.js';

const NAME = G.NAME;
const VIEW = { w: 380, h: 228 };
const MAP_AT = { x: 100, y: VIEW.h + 12 }, ORIG_MAP = { x: 16, y: 216 }, MAP_S = 180, GRID = 7, CS = MAP_S / GRID;
const BOARD = { w: VIEW.w, h: MAP_AT.y + MAP_S + 10 };
function mapXf(m) {
  const cs = m.floors.map((f) => f[0]), rs = m.floors.map((f) => f[1]);
  const c0 = Math.min(...cs), r0 = Math.min(...rs), bw = Math.max(...cs) - c0 + 1, bh = Math.max(...rs) - r0 + 1;
  const k = Math.min(GRID / bw, GRID / bh);
  return { k, ox: ORIG_MAP.x + c0 * CS, oy: ORIG_MAP.y + r0 * CS, w: k * bw * CS, h: k * bh * CS,
    tx: MAP_AT.x + (MAP_S - k * bw * CS) / 2, ty: MAP_AT.y + (MAP_S - k * bh * CS) / 2 };
}
const PROMPT = 'Find the red door and mark it on the map', SUB = 'Press Next frame to step through the clip · tap its wall on the map';
const r3 = (v) => Math.round(v * 1000) / 1000;
function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export const frames = (m) => ({ n: m.frames.length, period: m.frames.length });
export const frameIdx = (m, t) => { const n = m.frames.length; return ((Math.round(t) % n) + n) % n; };
export const frameAudit = (m) => G.frameAudit(m);
export function gate(m) {
  if (G.contract(m) !== '') return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
function segAtBoard(m, x, y) {
  const X = mapXf(m);
  if (!(x >= X.tx - 10 && x <= X.tx + X.w + 10 && y >= X.ty - 10 && y <= X.ty + X.h + 10)) return null;
  return ORIG._segAt(m, X.ox + (x - X.tx) / X.k, X.oy + (y - X.ty) / X.k, false);
}
function markKind(m, f) {
  if (!f) return 'none';
  if (W.sameFace(f, m.door)) return 'door';
  if (W.sameFace(f, { ...m.door, dir: (m.door.dir + 2) % 4 })) return 'across';
  const d = m.decor.find((x) => W.sameFace(x, f));
  if (d) return d.kind === 'door' ? `${d.role}-door` : d.kind;
  if (f.col === m.door.col && f.row === m.door.row) return 'door-room';
  return 'other';
}

const task = {
  meta: {
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'mark', col: 'grid col 0..6', row: 'grid row 0..6', dir: 'wall side 0=N 1=E 2=S 3=W (map up = N)', note: 'or tap the wall segment on the map; changeable until Verify' },
    ],
    promptHuman: PROMPT,
  },
  frames,

  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const type = 'end';
    for (let a = 0; a < 6000; a++) {
      const m = G.tryBuild(R(mulberry32(mix32(key, a))), type);
      if (m) { m.board = { ...BOARD }; m.dt = 1; return m; }
    }
    throw new Error('f16_corridor_door: generator exhausted');
  },

  init() { return { ...clockState(), mark: null, marks: 0 }; },

  applyAction(st, a, m) {
    if (!a || !['wait', 'mark', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (a.op === 'wait') {
      const sec = a.sec ?? m.dt;
      if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
      st.t += sec; st.steps++;
      return { ok: true };
    }
    let f = null;
    if (a.op === 'tap') { f = Number.isFinite(a.x) && Number.isFinite(a.y) ? segAtBoard(m, a.x, a.y) : null; if (!f) return { ok: false, reason: 'no-wall' }; }
    else f = { col: a.col, row: a.row, dir: a.dir };
    if (!W.isWallFace(m, f)) return { ok: false, reason: 'not-a-wall' };
    st.mark = { col: f.col, row: f.row, dir: f.dir }; st.marks++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = !!st.mark && W.sameFace(st.mark, m.door);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { marked: st.mark, door: m.door, markKind: markKind(m, st.mark), t: r3(st.t), frame: frameIdx(m, st.t) + 1, marks: st.marks } };
  },

  oracle(m) {
    const out = [];
    for (let i = 0; i < m.frames.length - 1; i++) out.push({ op: 'wait', sec: 1 });
    out.push({ op: 'mark', col: m.door.col, row: m.door.row, dir: m.door.dir });
    return out;
  },

  randomPolicy(m, rnd) { const f = W.wallFaces(m), p = f[Math.floor(rnd() * f.length)]; return [{ op: 'mark', col: p.col, row: p.row, dir: p.dir }]; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },

  tick(env, dt) {
    const st = env.state, m = env.manifest; if (!st || !m) return false;
    return !view(env).drawnHi;
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    drawView(g, env);
    const X = mapXf(env.manifest), pad = 4;
    g.fillStyle = '#d5dbe1'; g.beginPath();
    if (g.roundRect) g.roundRect(X.tx - pad - 2, X.ty - pad - 2, X.w + 2 * pad + 4, X.h + 2 * pad + 4, 6); else g.rect(X.tx - pad - 2, X.ty - pad - 2, X.w + 2 * pad + 4, X.h + 2 * pad + 4);
    g.fill();
    g.save(); g.beginPath(); g.rect(X.tx - pad, X.ty - pad, X.w + 2 * pad, X.h + 2 * pad); g.clip();
    g.translate(X.tx, X.ty); g.scale(X.k, X.k); g.translate(-X.ox, -X.oy);
    ORIG._drawMap(g, env.manifest, env.state, false);
    g.restore();
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const f = segAtBoard(env.manifest, evt.x, evt.y);
    return f ? [{ op: 'mark', col: f.col, row: f.row, dir: f.dir }] : [];
  },

  footerStatus(env) { return env.state.mark ? 'Wall marked' : 'Tap a wall on the map'; },
};
export default task;

function view(env) { return (env._cwmd ??= { m: null, key: '', canvas: null, drawnHi: false, ms: [] }); }
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}
function contextScale(g) { try { const t = g.getTransform ? g.getTransform() : null; return t ? Math.max(1, Math.hypot(t.a, t.b)) : 1; } catch (e) { return 1; } }
function drawView(g, env) {
  const st = env.state, m = env.manifest, V = view(env);
  if (V.m !== m) { V.m = m; V.key = ''; }
  const tau = frameIdx(m, st.t);
  const qs = Math.min(2, contextScale(g)), q = qs;
  const key = `${tau.toFixed(4)}|${q}`;
  if (V.key !== key) {
    const Wd = Math.round(VIEW.w * q), Hd = Math.round(VIEW.h * q), t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const img = renderFrame(m, W.poseAt(m, tau), Wd, Hd);
    if (!V.canvas || V.canvas.width !== Wd || V.canvas.height !== Hd) V.canvas = makeCanvas(Wd, Hd);
    if (V.canvas) { const c = V.canvas.getContext('2d'); const id = c.createImageData(Wd, Hd); id.data.set(img.data); c.putImageData(id, 0, 0); }
    if (typeof performance !== 'undefined') { V.ms.push([q, Math.round(performance.now() - t0)]); if (V.ms.length > 400) V.ms.shift(); }
    V.key = key;
  }
  V.drawnHi = q >= qs;
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.imageSmoothingEnabled = true;
  if (V.canvas && g.drawImage) g.drawImage(V.canvas, 0, 0, VIEW.w, VIEW.h); else { g.fillStyle = '#e6dccb'; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
export function _viewStats(env) { const V = view(env); return { ms: V.ms.slice() }; }
export const _layout = { VIEW, MAP_AT, MAP_S, BOARD, mapXf };
