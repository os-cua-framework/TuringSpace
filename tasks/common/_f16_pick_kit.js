import { drawPromptText } from '../core/panel.js';
import { clockState } from '../core/clock.js';
import * as RT from './_cat_hide_where_rt.js';

export { RT };
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const r4 = (v) => Math.round(v * 1e4) / 1e4;
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
export const frameOf = (m, t) => (((Math.round(t / m.dt)) % m.n) + m.n) % m.n;

const SCENES = new WeakMap();
export function sceneOf(cfg, m, k) {
  let c = SCENES.get(m); if (!c) { c = []; SCENES.set(m, c); }
  return (c[k] ??= cfg.sceneAt(m, k));
}
export function pickChoice(cfg, m, k, x, y) {
  if (!(x >= 0 && y >= 0 && x <= cfg.view.w && y <= cfg.view.h)) return -1;
  const sc = sceneOf(cfg, m, k);
  let id = RT.pickId(sc, x, y);
  if (id >= 0 && id < m.K) return id;
  for (let r = 2; r <= 5; r += 1.5) for (let a = 0; a < 8; a++) {
    const t = a * Math.PI / 4; id = RT.pickId(sc, x + r * Math.cos(t), y + r * Math.sin(t));
    if (id >= 0 && id < m.K) return id;
  }
  return -1;
}
export function tapPoint(cfg, m, k, c) {
  const sc = sceneOf(cfg, m, k), P = cfg.anchor(m, c, k), q = sc.cam.project(P[0], P[1], P[2]);
  const W = cfg.view.w, H = cfg.view.h;
  let best = null, bd = Infinity;
  for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const d = dx * dx + dy * dy; if (d >= bd) continue;
    const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    if (RT.pickId(sc, x, y) !== c) continue;
    if ([[2, 0], [-2, 0], [0, 2], [0, -2]].every(([ex, ey]) => RT.pickId(sc, x + ex, y + ey) === c)) { best = [x, y]; bd = d; }
  }
  if (!best) for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const d = dx * dx + dy * dy; if (d >= bd) continue;
    const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy;
    if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && RT.pickId(sc, x, y) === c) { best = [x, y]; bd = d; }
  }
  return best;
}

const eqSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function makeTask(cfg) {
  const { name, view } = cfg;
  const BOARD = { w: view.w, h: view.h + 4 };
  const K = cfg.picks ?? 1;
  const task = {
    meta: {
      name, family: 'F16', 
      panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
      actionSpace: [
        { op: 'tap', x: `0..${view.w} board px`, y: `0..${view.h} board px`, note: cfg.tapNote },
        { op: 'wait', sec: 'internal: Next frame = one frame step' },
      ],
      promptHuman: cfg.prompt,
    },

    generate(rng, level, index, knobs = {}) {
      const m = cfg.generate(rng);
      m.task = name; m.live = true; m.board = { ...BOARD }; m.hold = m.dt;
      return m;
    },

    frames(m) { return { n: m.n, period: r4(m.n * m.dt) }; },
    init() { return { ...clockState(), sel: [], taps: 0 }; },

    applyAction(st, a, m) {
      if (!a || !['wait', 'tap'].includes(a.op)) return { ok: false, reason: 'bad-op' };
      if (a.op === 'wait') {
        const sec = a.sec ?? m.dt;
        if (!(sec >= 0) || !Number.isFinite(sec)) return { ok: false, reason: 'bad-sec' };
        st.t += sec; st.steps++;
        return { ok: true };
      }
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
      const c = pickChoice(cfg, m, frameOf(m, st.t), a.x, a.y);
      if (c < 0) return { ok: false, reason: 'no-object' };
      const k = [].concat(m.answer).length;
      st.sel = st.sel.includes(c) ? st.sel.filter((x) => x !== c) : [...st.sel, c].slice(-k);
      st.taps++;
      return { ok: true };
    },

    verify(st, m) {
      const ans = [].concat(m.answer).sort((p, q) => p - q);
      const ok = eqSet(st.sel, ans);
      return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : st.sel.filter((x) => ans.includes(x)).length / ans.length,
        detail: { selected: st.sel.slice(), answer: ans, frame: frameOf(m, st.t) + 1, taps: st.taps, ...(cfg.detail ? cfg.detail(m, st) : {}) } };
    },

    oracle(m) {
      const k = m.n - 1, out = [{ op: 'wait', sec: r3(k * m.dt) }];
      for (const c of [].concat(m.answer)) { const p = tapPoint(cfg, m, k, c); out.push({ op: 'tap', x: p[0], y: p[1] }); }
      return out;
    },

    randomPolicy(m, rnd) {
      const k = Math.floor(rnd() * m.n), cs = []; while (cs.length < K) { const c = Math.floor(rnd() * m.K); if (!cs.includes(c)) cs.push(c); }
      const out = [{ op: 'wait', sec: r3(k * m.dt) }];
      for (const c of cs) { const p = tapPoint(cfg, m, k, c); if (p) out.push({ op: 'tap', x: p[0], y: p[1] }); }
      return out;
    },

    drawPrompt(g, r) { drawPromptText(g, r, cfg.prompt, cfg.sub); },

    tick(env) { return !!(env.state && env.manifest) && !view_(env).drawn; },

    drawBoard(g, br, env) {
      const m = env.manifest, st = env.state, V = view_(env), k = frameOf(m, st.t);
      g.save(); g.translate(br.x, br.y);
      g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
      const q = Math.min(2, RT.contextScale(g));
      if (V.m !== m) { V.m = m; V.frames.clear(); }
      const key = `${k}|${q}`;
      let F = V.frames.get(key);
      if (!F) {
        const img = RT.render(sceneOf(cfg, m, k), q);
        F = { img, canvas: RT.toCanvas(img), rings: new Map() };
        if (V.frames.size > 20) V.frames.delete(V.frames.keys().next().value);
        V.frames.set(key, F);
      }
      g.save();
      g.beginPath(); g.rect(0, 0, view.w, view.h); g.clip();
      g.imageSmoothingEnabled = true;
      g.drawImage(F.canvas, 0, 0, view.w, view.h);
      for (const c of st.sel) {
        let ring = F.rings.get(c); if (!ring) { ring = RT.silhouetteRings(F.img, new Set([c]), [25, 145, 250, 255], 2.4); F.rings.set(c, ring); }
        g.drawImage(ring, 0, 0, view.w, view.h);
      }
      if (cfg.overlay) cfg.overlay(g, m, k, sceneOf(cfg, m, k));
      g.restore();
      g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, view.w - 1, view.h - 1);
      V.drawn = true;
      g.restore();
    },

    pointer(evt, env) {
      if (env.submitted || evt.type !== 'down') return [];
      if (!(evt.x >= 0 && evt.y >= 0 && evt.x <= view.w && evt.y <= view.h)) return [];
      const m = env.manifest;
      return pickChoice(cfg, m, frameOf(m, env.state.t), evt.x, evt.y) >= 0 ? [{ op: 'tap', x: evt.x, y: evt.y }] : [];
    },

    footerStatus(env) { const k = env.state.sel.length; return k ? `${k} selected` : 'Nothing selected'; },
  };
  task.sceneAt = (m, k) => sceneOf(cfg, m, k);
  return task;
}
function view_(env) { return (env._g6 ??= { m: null, frames: new Map(), drawn: false }); }

export function oneFrameCues(feats, cx, cy) {
  const feat = {
    x: feats.map((f) => f.x), y: feats.map((f) => f.y), size: feats.map((f) => f.size),
    cen: feats.map((f) => Math.hypot(f.x - cx, f.y - cy)),
  };
  const out = [];
  for (const [nm, v] of Object.entries(feat)) for (const [dir, better] of [['max', (a, b) => a > b], ['min', (a, b) => a < b]]) {
    let arg = 0; v.forEach((x, i) => { if (better(x, v[arg])) arg = i; });
    out.push({ cue: `${nm}-${dir}`, picks: arg });
  }
  return out;
}
export const argMax = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
export const argMin = (a) => a.reduce((b, v, i) => (v < a[b] ? i : b), 0);

export const mat = (hex, ks = 0.05, sh = 12, extra = {}) => ({ c: RT.lin(hex), ks, sh, ...extra });
