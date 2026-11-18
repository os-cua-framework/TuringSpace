import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import * as Gm from '../common/_hide_from_guard_geom.js';
import { worldOf, renderView } from '../common/_hide_from_guard_view.js';
import { buildHideLook } from '../common/_hide_from_guard_look.js';

const { C, key, cellCenter } = Gm;
const PANEL_W = 400;
const BOARD = { w: 380, h: 366 };
const VIEW_H = 250;
const BTN = { w: 104, h: 44, gap: 8, y: 262 };
const TITLE = "Hide where the guard can't see you", SUBTITLE = 'Put something tall between you and him';
const CFG_HARD = { sizes: [[7, 7]], ginner: 1, stacks: [6, 7], dmin: 2, bmax: 40, hidden: [1, 1], plan: [6, 10], quad: true, awayGate: true, wRange: [0.45, 0.6], wMin: 0.42, nearGuardGate: true };
const CFG_EXT = { sizes: [[6, 6]], ginner: 1, stacks: [4, 5], dmin: 2, bmax: 40, hidden: [2, 3], plan: [3, 8], quad: true, awayGate: true, wRange: [0.63, 0.83], wMin: 0.6, nearGuardGate: false };
const CFG = CFG_EXT;
const cfgOf = (m) => (m && m.ext ? CFG_EXT : CFG_HARD);
const FOV_HALF = 48;
const EXT_SIZES = [[6, 6], [6, 7], [7, 6], [7, 7]];

const r3 = (v) => Math.round(v * 1000) / 1000;
function makeRect(rng, cells, wr = CFG_EXT.wRange) {
  const two = cells.length === 2, horiz = two && cells[1][0] !== cells[0][0];
  const [c, r] = cells[0];
  const w = C * rng.uniform(wr[0], wr[1]), L = two ? C * (2 - rng.uniform(0.17, 0.33)) : C * rng.uniform(wr[0], wr[1]);
  const [cx, cz] = two ? [(c + (horiz ? 1 : 0.5)) * C, (r + (horiz ? 0.5 : 1)) * C] : cellCenter(c, r);
  const ox = C * rng.uniform(-0.067, 0.067), oz = C * rng.uniform(-0.067, 0.067);
  const hx = (two && horiz ? L : w) / 2, hz = (two && !horiz ? L : two ? w : L) / 2;
  return { x0: r3(cx + ox - hx), x1: r3(cx + ox + hx), z0: r3(cz + oz - hz), z1: r3(cz + oz + hz) };
}
function cleanFor(G, R, pts) {
  for (const P of pts) {
    if (Gm.segRectDist(G[0], G[1], P[0], P[1], R) >= Gm.CLEAR) continue;
    if (!Gm.hiddenRobust(G, P, [R])) return false;
  }
  return true;
}
const nearestHeading = (E, G) => { let best = 0, bb = 999; for (let h = 0; h < 4; h++) { const b = Math.abs(Gm.bearing(E, h, G)); if (b < bb) { bb = b; best = h; } } return [best, bb]; };
const rectCenter = (R) => [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2];
function quadrantOk(m, cell, q) {
  const E = cellCenter(m.start.col, m.start.row), h = m.start.heading, F = Gm.DIRS[h], Rt = Gm.DIRS[(h + 1) % 4];
  const ego = (P) => [(P[0] - E[0]) * F[0] + (P[1] - E[1]) * F[1], (P[0] - E[0]) * Rt[0] + (P[1] - E[1]) * Rt[1]];
  const [fg, lg] = ego(Gm.guardPos(m)), [f, l] = ego(cellCenter(cell[0], cell[1]));
  const sideOk = Math.abs(l) < 0.3 * C || ((l > 0) === (lg > 0)) === !!(q & 1);
  return sideOk && (f > fg) === !!(q & 2);
}
function touches(o, c, r) { return o.cells.some(([a, b]) => Math.max(Math.abs(a - c), Math.abs(b - r)) === 1); }

function tryBuild(rng, quad = -1, ext = null) {
  const K = ext ? CFG_EXT : CFG_HARD;
  const [GW, GH] = rng.pick(ext ? EXT_SIZES : K.sizes);
  const gi = K.ginner;
  const g0 = [rng.int(gi, GW - 1 - gi), rng.int(gi, GH - 1 - gi)];
  const occ = new Set(), obstacles = [];
  const touch = (c, r) => { for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (occ.has(key(c + dc, r + dr))) return true; return false; };
  const want = rng.int(K.stacks[0], K.stacks[1]);
  for (let t = 0; t < 80 && obstacles.length < want; t++) {
    const two = rng.raw() < 0.35, horiz = rng.raw() < 0.5;
    const c = rng.int(0, GW - 1 - (two && horiz ? 1 : 0)), r = rng.int(0, GH - 1 - (two && !horiz ? 1 : 0));
    const cells = two ? [[c, r], horiz ? [c + 1, r] : [c, r + 1]] : [[c, r]];
    if (cells.some(([a, b]) => touch(a, b) || (a === g0[0] && b === g0[1]))) continue;
    const h = r3(rng.uniform(2.3, 2.62));
    obstacles.push({ cells, rect: null, h, split: r3(h * rng.uniform(0.47, 0.53)), style: rng.int(0, 1), tone: r3(rng.raw()) });
    for (const [a, b] of cells) occ.add(key(a, b));
  }
  if (obstacles.length < want) return null;
  const m = {
    task: 'hide_from_guard', board: BOARD, grid: { w: GW, h: GH }, cell: C, obstacles,
    guard: { col: g0[0], row: g0[1], ox: r3(rng.uniform(-0.25, 0.25)), oz: r3(rng.uniform(-0.25, 0.25)), face: 0 },
    start: null, sun: { el: r3(rng.uniform(50, 62)), az: r3(rng.uniform(0, 360)) },
    ...(ext ? { ext } : {}),
  };
  const G = Gm.guardPos(m);
  const pts = Gm.freeCells(m).map(([c, r]) => cellCenter(c, r));
  for (const o of obstacles) {
    let ok = false;
    for (let k = 0; k < 40 && !ok; k++) { o.rect = makeRect(rng, o.cells, K.wRange); ok = cleanFor(G, o.rect, pts); }
    if (!ok) return null;
  }
  const H = hiddenSlabs(m);
  if (H.length < K.hidden[0] || H.length > K.hidden[1]) return null;
  m.hidden = H;
  m.gtContract = 'success iff the straight line from the guard to the centre of your slab crosses a stack';
  const free = Gm.freeCells(m), rects = Gm.rectsOf(m);
  const starts = rng.shuffle(free.filter(([c, r]) => {
    const E = cellCenter(c, r), b = nearestHeading(E, G)[1];
    return Math.hypot(G[0] - E[0], G[1] - E[1]) >= CFG.dmin * C - 0.4 && b <= CFG.bmax && Gm.clearance(G, E, rects) >= 0.35;
  }));
  if (!starts.length) return null;
  for (const [sc, sr] of starts.slice(0, 8)) {
    const E = cellCenter(sc, sr);
    m.start = { col: sc, row: sr, heading: nearestHeading(E, G)[0] };
    const toE = Math.atan2(E[0] - G[0], -(E[1] - G[1])) * 180 / Math.PI;
    m.guard.face = r3(toE + rng.uniform(-35, 35));
    m.quad = quad;
    if (contract(m).ok) return m;
  }
  return null;
}
function hiddenSlabs(m) {
  const hs = new Set();
  for (let i = 0; i < m.obstacles.length; i++) {
    for (const [k, v] of Gm.classifyFor(m, i)) { if (v === '?') return []; if (v === 'H') hs.add(k); }
  }
  return Gm.freeCells(m).filter(([c, r]) => hs.has(key(c, r)));
}

function nearestBy(m, cells) {
  if (!cells.length) return null;
  const pl = Gm.bfsPlan(m, new Set(cells.map(([c, r]) => key(c, r))));
  return pl ? pl.end.cell : null;
}
export function lazyTargets(m) {
  const free = Gm.freeCells(m), rects = Gm.rectsOf(m), G = Gm.guardPos(m);
  const E = cellCenter(m.start.col, m.start.row);
  let near = null, nd = Infinity;
  for (const o of m.obstacles) {
    if (Math.abs(Gm.bearing(E, m.start.heading, rectCenter(o.rect))) > FOV_HALF) continue;
    const R = o.rect, d = Math.hypot(Math.max(R.x0 - E[0], 0, E[0] - R.x1), Math.max(R.z0 - E[1], 0, E[1] - R.z1));
    if (d < nd) { nd = d; near = o; }
  }
  const egoBehind = near ? free.filter(([c, r]) => touches(near, c, r) && Gm.segHitsRect(E[0], E[1], ...cellCenter(c, r), near.rect)) : [];
  const egoHidden = free.filter(([c, r]) => Gm.lineBlocked(E, cellCenter(c, r), rects));
  const dG = ([c, r]) => { const P = cellCenter(c, r); return Math.hypot(P[0] - G[0], P[1] - G[1]); };
  const fd = Math.max(...free.map(dG));
  return { near, egoBehind, L1: nearestBy(m, egoBehind), egoHidden, L2: nearestBy(m, egoHidden), far: free.filter((p) => dG(p) > fd - 1e-6) };
}
export function behindNearestToHim(m) {
  const G = Gm.guardPos(m);
  let near = null, nd = Infinity;
  for (const o of m.obstacles) {
    const R = o.rect, d = Math.hypot(Math.max(R.x0 - G[0], 0, G[0] - R.x1), Math.max(R.z0 - G[1], 0, G[1] - R.z1));
    if (d < nd) { nd = d; near = o; }
  }
  if (!near) return [];
  const [rx, rz] = rectCenter(near.rect), dc = Math.hypot(rx - G[0], rz - G[1]);
  return Gm.freeCells(m).filter(([c, r]) => { const P = cellCenter(c, r); return touches(near, c, r) && Math.hypot(P[0] - G[0], P[1] - G[1]) > dc; });
}
export function awayEnds(m) {
  const out = [], blocked = Gm.blockedSet(m), E = cellCenter(m.start.col, m.start.row);
  const turn = Gm.bearing(E, m.start.heading, Gm.guardPos(m)) >= 0 ? 'left' : 'right';
  for (let a = 0; a <= 2; a++) for (let b = 1; b <= 3; b++) {
    let st = { cell: [m.start.col, m.start.row], heading: m.start.heading };
    for (let i = 0; i < a; i++) st = Gm.applyOp(m, st, 'forward', blocked);
    st = Gm.applyOp(m, st, turn, blocked);
    for (let i = 0; i < b; i++) st = Gm.applyOp(m, st, 'forward', blocked);
    out.push(st.cell);
  }
  return out;
}

function contract(m) {
  const bad = (why) => ({ ok: false, why });
  if (!m || m.task !== 'hide_from_guard' || !Array.isArray(m.obstacles) || !m.guard || !m.start || !m.grid) return bad('shape');
  const K = cfgOf(m);
  if (!(m.ext ? EXT_SIZES : K.sizes).some(([w, h]) => w === m.grid.w && h === m.grid.h)) return bad('grid');
  const n = m.obstacles.length;
  if (n < K.stacks[0] || n > K.stacks[1]) return bad('count');
  const occ = new Map();
  for (let i = 0; i < n; i++) {
    const o = m.obstacles[i], R = o.rect;
    if (!R || !(o.h >= 2.25) || !Array.isArray(o.cells) || o.cells.length < 1 || o.cells.length > 2) return bad('stack');
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [c, r] of o.cells) {
      if (!Gm.inGrid(m, c, r) || occ.has(key(c, r))) return bad('stack cell');
      occ.set(key(c, r), i);
      x0 = Math.min(x0, c * C); x1 = Math.max(x1, (c + 1) * C); z0 = Math.min(z0, r * C); z1 = Math.max(z1, (r + 1) * C);
    }
    if (R.x0 < x0 + 0.02 || R.x1 > x1 - 0.02 || R.z0 < z0 + 0.02 || R.z1 > z1 - 0.02 || R.x1 - R.x0 < K.wMin * C || R.z1 - R.z0 < K.wMin * C) return bad('stack rect');
  }
  for (const [k, i] of occ) {
    const [c, r] = k.split(',').map(Number);
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { const j = occ.get(key(c + dc, r + dr)); if (j !== undefined && j !== i) return bad('touching'); }
  }
  const { col: gc, row: gr } = m.guard;
  if (!Gm.inGrid(m, gc, gr) || occ.has(key(gc, gr)) || Math.abs(m.guard.ox) > 0.3 || Math.abs(m.guard.oz) > 0.3) return bad('guard');
  const { col: sc, row: sr, heading: sh } = m.start;
  if (!Gm.inGrid(m, sc, sr) || occ.has(key(sc, sr)) || (sc === gc && sr === gr) || !(sh >= 0 && sh <= 3)) return bad('start');
  const free = Gm.freeCells(m);
  if (Gm.reachable(m).size !== free.length) return bad('connected');
  const H = hiddenSlabs(m);
  if (!H.length && free.length) return bad('ambiguous slab');
  const Hs = new Set(H.map(([c, r]) => key(c, r)));
  for (const [c, r] of free) if (Hs.has(key(c, r)) !== Gm.lineBlocked(Gm.guardPos(m), cellCenter(c, r), Gm.rectsOf(m))) return bad('centre line disagrees');
  if (H.length < K.hidden[0] || H.length > K.hidden[1]) return bad('hidden count');
  if (!Array.isArray(m.hidden) || m.hidden.length !== H.length || m.hidden.some(([c, r]) => !Hs.has(key(c, r)))) return bad('hidden list');
  const G = Gm.guardPos(m), E = cellCenter(sc, sr), rects = Gm.rectsOf(m);
  if (Gm.clearance(G, E, rects) < 0.35) return bad('start not clearly in sight');
  if (Math.hypot(G[0] - E[0], G[1] - E[1]) < CFG.dmin * C - 0.4) return bad('guard too near');
  const [hBest, b0] = nearestHeading(E, G);
  if (hBest !== sh || b0 > CFG.bmax) return bad('guard off-centre');
  const plan = Gm.bfsPlan(m, Hs);
  if (!plan || plan.acts.length < K.plan[0] || plan.acts.length > K.plan[1]) return bad('plan length');
  const T = cellCenter(...plan.end.cell);
  const hider = m.obstacles.find((o) => Gm.segHitsRect(G[0], G[1], T[0], T[1], o.rect));
  if (!hider || Math.abs(Gm.bearing(E, sh, rectCenter(hider.rect))) > FOV_HALF - 6) return bad('hider out of view');
  const lz = lazyTargets(m);
  if (!lz.L1 || Hs.has(key(...lz.L1))) return bad('L1 behind my nearest stack');
  if (lz.L2 && Hs.has(key(...lz.L2))) return bad('L2 nearest slab I cannot see');
  if (lz.far.some(([c, r]) => Hs.has(key(c, r)))) return bad('L3 farthest from him');
  if (CFG.awayGate && awayEnds(m).some(([c, r]) => Hs.has(key(c, r)))) return bad('L4 sidestep away from him');
  if (K.nearGuardGate && behindNearestToHim(m).some(([c, r]) => Hs.has(key(c, r)))) return bad('L5 far side of the stack nearest him');
  if (CFG.quad && !(m.quad >= 0 && m.quad <= 3 && H.every((cell) => quadrantOk(m, cell, m.quad)))) return bad('quadrant');
  return { ok: true, plan, H };
}
export function gate(m) { return contract(m).ok; }
export const _contract = contract;

const VIS = new WeakMap();
const poseOf = (cell, heading) => { const [x, z] = cellCenter(cell[0], cell[1]); return { x, z, ang: heading * Math.PI / 2 }; };
function visPose(st) {
  const target = poseOf(st.cell, st.heading);
  let v = VIS.get(st);
  if (!v) { v = { ...target }; VIS.set(st, v); }
  return { v, target };
}
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const VIEWC = new WeakMap();

function toCanvas(img) {
  let cv = null;
  if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(img.w, img.h);
  else if (typeof document !== 'undefined') cv = Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  if (!cv) return null;
  cv.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return cv;
}

export default {
  meta: {
    name: 'hide_from_guard', family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'forward' }, { op: 'back' }, { op: 'left' }, { op: 'right' }],
    promptHuman: TITLE,
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      const quad = CFG.quad ? rng.int(0, 3) : -1;
      for (let a = 0; a < 20000; a++) { const m = tryBuild(rng, quad, knobs.ext); if (m) return m; }
      throw new Error('hide_from_guard: sampler failed');
    }
    let quad = CFG.quad ? rng.int(0, 3) : -1;
    for (let a = 0; a < 80000; a++) {
      if (a && a % 4000 === 0 && CFG.quad) quad = rng.int(0, 3);
      const m = tryBuild(rng, quad); if (m) return m;
    }
    throw new Error('hide_from_guard: sampler failed');
  },

  init(m) { return { cell: [m.start.col, m.start.row], heading: m.start.heading }; },

  applyAction(state, action, m) {
    const op = action && action.op;
    if (op === 'left') { state.heading = (state.heading + 3) % 4; state._bumped = false; return { ok: true }; }
    if (op === 'right') { state.heading = (state.heading + 1) % 4; state._bumped = false; return { ok: true }; }
    if (op === 'forward' || op === 'back') {
      const r = Gm.stepCell(m, state.cell, op === 'back' ? (state.heading + 2) % 4 : state.heading);
      state.cell = r.cell; state._bumped = !r.moved;
      return { ok: true, moved: r.moved };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const ok = Gm.lineBlocked(Gm.guardPos(m), cellCenter(state.cell[0], state.cell[1]), Gm.rectsOf(m));
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { cell: state.cell } };
  },

  oracle(m) { return contract(m).plan.acts.map((op) => ({ op })); },
  trainingOracle(m) {
    const goal = contract(m).plan.end.cell, blocked = Gm.blockedSet(m), cost = { forward: 1, left: 1, right: 1, back: 2.5 };
    const sk = (s) => `${s.cell[0]},${s.cell[1]},${s.heading}`, start = { cell: [m.start.col, m.start.row], heading: m.start.heading };
    const best = new Map([[sk(start), 0]]), prev = new Map([[sk(start), null]]), open = [[0, start]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, s] = open.shift();
      if (d > best.get(sk(s))) continue;
      if (s.cell[0] === goal[0] && s.cell[1] === goal[1]) {
        const acts = []; let k = sk(s);
        while (prev.get(k)) { const p = prev.get(k); acts.push(p.op); k = p.k; }
        const E = cellCenter(s.cell[0], s.cell[1]), Gp = Gm.guardPos(m);
        const off = (t) => Math.abs(Gm.bearing(E, t.reduce((hh, op) => (op === 'left' ? (hh + 3) % 4 : (hh + 1) % 4), s.heading), Gp));
        const look = [[], ['left'], ['right'], ['left', 'left']].reduce((b, t) => (off(t) < off(b) - 1e-9 ? t : b));
        return [...acts.reverse(), ...look].map((op) => ({ op }));
      }
      for (const op of ['forward', 'left', 'right', 'back']) {
        const n = Gm.applyOp(m, s, op, blocked), nk = sk(n), nd = d + cost[op];
        if (nk === sk(s) || nd >= (best.get(nk) ?? Infinity)) continue;
        best.set(nk, nd); prev.set(nk, { k: sk(s), op }); open.push([nd, n]);
      }
    }
    return this.oracle(m);
  },

  randomPolicy(m, rnd) {
    const n = 1 + Math.floor(rnd() * 10), ops = ['forward', 'back', 'left', 'right'];
    return Array.from({ length: n }, () => ({ op: ops[Math.floor(rnd() * 4)] }));
  },

  async mount(env) {
    if (env.style) env.assets.look = await buildHideLook(env.style, env.manifest);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, TITLE, SUBTITLE);
  },

  tick(env, dt) {
    const st = env && env.state;
    if (!st) return false;
    const { v, target } = visPose(st);
    const dx = target.x - v.x, dz = target.z - v.z, da = angDiff(v.ang, target.ang);
    if (Math.abs(dx) + Math.abs(dz) < 1e-3 && Math.abs(da) < 1e-3) { Object.assign(v, target); return false; }
    const step = Math.min(1, dt * 7);
    v.x += dx * step + Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.9);
    v.z += dz * step + Math.sign(dz) * Math.min(Math.abs(dz), dt * 0.9);
    v.ang += da * step + Math.sign(da) * Math.min(Math.abs(da), dt * 0.9);
    if (Math.abs(target.x - v.x) < 0.01 && Math.abs(target.z - v.z) < 0.01 && Math.abs(angDiff(v.ang, target.ang)) < 0.01) Object.assign(v, target);
    return true;
  },

  _drawView(g, m, st, look = null) {
    const { v, target } = visPose(st);
    const resting = v.x === target.x && v.z === target.z && v.ang === target.ang;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const q = resting ? Math.min(2, Math.max(1, dpr)) : Math.min(1, dpr);
    const k = `${v.x.toFixed(3)},${v.z.toFixed(3)},${v.ang.toFixed(4)}|${q}` + (look ? `|${look.key}` : '');
    let vc = VIEWC.get(m);
    if (!vc) { vc = { key: '', canvas: null }; VIEWC.set(m, vc); }
    if (vc.key !== k) { vc.canvas = toCanvas(look ? renderView(worldOf(m, look), v, BOARD.w, VIEW_H, q, 0.46, look) : renderView(worldOf(m), v, BOARD.w, VIEW_H, q)); vc.key = k; }
    g.save(); g.beginPath(); rr(g, 0, 0, BOARD.w, VIEW_H, 8); g.clip();
    if (vc.canvas && g.drawImage) g.drawImage(vc.canvas, 0, 0, BOARD.w, VIEW_H);
    else { g.fillStyle = '#d9dde0'; g.fillRect(0, 0, BOARD.w, VIEW_H); }
    g.restore();
  },

  _btnRects() {
    const { w, h, gap, y } = BTN, x1 = (BOARD.w - w) / 2;
    return {
      forward: { x: x1, y, w, h },
      left: { x: x1 - w - gap, y: y + h + gap, w, h },
      back: { x: x1, y: y + h + gap, w, h },
      right: { x: x1 + w + gap, y: y + h + gap, w, h },
    };
  },

  _drawButtons(g) {
    const R = this._btnRects();
    for (const k of ['forward', 'left', 'right', 'back']) {
      const b = R[k];
      rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = '#eef2f6'; g.fill();
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = '#3c4955';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - 6;
      if (k === 'forward') {
        g.beginPath(); g.moveTo(cx, cy + 7); g.lineTo(cx, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy - 1); g.lineTo(cx, cy - 8); g.lineTo(cx + 7, cy - 1); g.stroke();
      } else if (k === 'back') {
        g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy + 1); g.lineTo(cx, cy + 8); g.lineTo(cx + 7, cy + 1); g.stroke();
      } else {
        const s = k === 'left' ? -1 : 1;
        g.beginPath(); g.moveTo(cx - s * 6, cy + 8); g.lineTo(cx - s * 6, cy); g.quadraticCurveTo(cx - s * 6, cy - 6, cx, cy - 6); g.lineTo(cx + s * 7, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 3, cy - 11); g.lineTo(cx + s * 8, cy - 6); g.lineTo(cx + s * 3, cy - 1); g.stroke();
      }
      g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k === 'forward' ? 'Forward' : k === 'back' ? 'Back' : k === 'left' ? 'Turn left' : 'Turn right', cx, b.y + b.h - 9);
    }
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, br.w, br.h);
    this._drawView(g, m, st, env.style ? env.assets?.look || null : null);
    this._drawButtons(g);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const R = this._btnRects();
    for (const k of ['left', 'forward', 'right', 'back']) {
      const b = R[k];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ op: k }];
    }
    return [];
  },

  footerStatus(env) { return env && env.state && env.state._bumped ? 'Blocked: you cannot walk that way' : 'Walk with the buttons'; },
};

export function semanticKey(m) {
  const W = m.grid.w, H = m.grid.h;
  const maps = [(x, y) => [x, y], (x, y) => [W - 1 - x, y], (x, y) => [x, H - 1 - y], (x, y) => [W - 1 - x, H - 1 - y]];
  if (W === H) maps.push((x, y) => [y, x], (x, y) => [H - 1 - y, x], (x, y) => [y, W - 1 - x], (x, y) => [H - 1 - y, W - 1 - x]);
  const keys = maps.map((f) => {
    const st = m.obstacles.map((o) => o.cells.map(([c, r]) => f(c, r).join(',')).sort().join('+')).sort().join(' ');
    return `${st}|g${f(m.guard.col, m.guard.row).join(',')}|s${f(m.start.col, m.start.row).join(',')}`;
  }).sort();
  return `hide_from_guard|${Math.min(W, H)}x${Math.max(W, H)}|${keys[0]}`;
}
