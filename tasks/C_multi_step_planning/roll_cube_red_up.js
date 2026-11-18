import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import * as RT from '../common/_roll_cube_red_up_rt.js';
import { G, DIRS, CUBE_ID, sceneCamera, faceCos, cubePose, cubeCorners, traceScene, influenceRect, cellXZ, styleLook, gridW, gridH } from '../common/_roll_cube_red_up_scene.js';
import { splitIds } from '../core/style.js';
import * as K from '../common/_scene_tex_kit.js';

const NAME = 'roll_cube_red_up';
const BOARD = { w: 340, h: 340 };
const FIT = { x0: 12, y0: 10, x1: 328, y1: 296 };
const RESET = { x: 10, y: BOARD.h - 42, w: 74, h: 34 };
const OPT = { min: 7, max: 10 };
const HOLES = [3, 5];
const SLACK = 2;
const budget = (m) => m.opt + SLACK;
const VIS_COS = 0.12;
const ROLL_S = 0.32;
const DKEYS = ['N', 'E', 'S', 'W'];
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E', U: 'D', D: 'U' };

export const rollFace = (f, d) => (f === 'U' ? d : f === d ? 'D' : f === 'D' ? OPP[d] : f === OPP[d] ? 'U' : f);
const holeSet = (m) => new Set(m.holes.map(([c, r]) => c + r * gridW(m)));
const freeCell = (m, hs, c, r) => c >= 0 && r >= 0 && c < gridW(m) && r < gridH(m) && !hs.has(c + r * gridW(m));
const sKey = (c, r, f) => `${c},${r},${f}`;

function cellDist(m, hs, from) {
  const G = gridW(m);
  const d = new Map([[from[0] + from[1] * G, 0]]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const [c, r] = q[h];
    for (const k of DKEYS) {
      const nc = c + DIRS[k][0], nr = r + DIRS[k][1];
      if (freeCell(m, hs, nc, nr) && !d.has(nc + nr * G)) { d.set(nc + nr * G, d.get(c + r * G) + 1); q.push([nc, nr]); }
    }
  }
  return d;
}
function geodesicEnds(m, hs, from, f0) {
  const G = gridW(m);
  const dist = cellDist(m, hs, m.star);
  const d0 = dist.get(from[0] + from[1] * G);
  if (d0 === undefined) return new Set();
  let layer = new Map([[from[0] + from[1] * G, new Set([f0])]]);
  for (let k = d0; k > 0; k--) {
    const nl = new Map();
    for (const [ci, fs] of layer) {
      const c = ci % G, r = Math.floor(ci / G);
      for (const dk of DKEYS) {
        const nc = c + DIRS[dk][0], nr = r + DIRS[dk][1];
        if (!freeCell(m, hs, nc, nr) || dist.get(nc + nr * G) !== k - 1) continue;
        if (!nl.has(nc + nr * G)) nl.set(nc + nr * G, new Set());
        for (const f of fs) nl.get(nc + nr * G).add(rollFace(f, dk));
      }
    }
    layer = nl;
  }
  return layer.get(m.star[0] + m.star[1] * G) || new Set();
}
function solve(m, hs, from, f0, ok = null) {
  const goal = sKey(m.star[0], m.star[1], 'U');
  const prev = new Map([[sKey(from[0], from[1], f0), null]]), q = [[from[0], from[1], f0]];
  for (let h = 0; h < q.length; h++) {
    const [c, r, f] = q[h], k0 = sKey(c, r, f);
    if (k0 === goal) {
      const path = []; for (let k = k0; prev.get(k); k = prev.get(k).k) path.unshift(prev.get(k).d);
      return { len: path.length, path };
    }
    for (const dk of DKEYS) {
      const nc = c + DIRS[dk][0], nr = r + DIRS[dk][1];
      if (!freeCell(m, hs, nc, nr)) continue;
      const nf = rollFace(f, dk), k1 = sKey(nc, nr, nf);
      if (prev.has(k1) || (ok && !ok(nc, nr, nf))) continue;
      prev.set(k1, { k: k0, d: dk }); q.push([nc, nr, nf]);
    }
  }
  return { len: Infinity, path: [] };
}
const redSeen = (m, c, r, f) => f === 'U' || (f !== 'D' && faceCos(m, c, r, f) > VIS_COS);

export function semanticKey(m) {
  const W = gridW(m), H = gridH(m), D = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  let best = null;
  for (let s = 0; s < (W === H ? 8 : 4); s++) {
    const P = (c, r) => { const x = s & 1 ? W - 1 - c : c, z = s & 2 ? H - 1 - r : r; return s & 4 ? [z, x] : [x, z]; };
    const V = (d) => { let [x, z] = D[d]; if (s & 1) x = -x; if (s & 2) z = -z; if (s & 4) [x, z] = [z, x]; return Object.keys(D).find((k) => D[k][0] === x && D[k][1] === z); };
    const k = `${s & 4 ? H : W}x${s & 4 ? W : H}|holes${m.holes.map(([c, r]) => P(c, r).join(',')).sort().join(';')}|start${P(...m.start)}|star${P(...m.star)}|red${V(m.red)}`;
    if (best === null || k < best) best = k;
  }
  return `roll_cube_red_up|${best}`;
}
const EVAL_KEYS = new Set(["5889cd11", "653b2d7d", "c59d0355", "29e30996", "58870028", "fab1c50e", "eada42b9", "0a58e1c8", "c27b4720", "a6aa9054", "df90a4ae", "c9384601"]);

function contractOk(m) {
  if (!m || m.task !== NAME || m.grid !== G || !m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  const GW = gridW(m), GH = gridH(m);
  if (m.cols !== undefined || m.rows !== undefined) return false;
  const cam = m.cam;
  if (!cam || !Number.isInteger(cam.az) || !Number.isInteger(cam.el) || cam.el < 46 || cam.el > 56) return false;
  const off = ((cam.az % 90) + 90) % 90;
  if (off < 30 || off > 60) return false;
  const cellOk = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < GW && p[1] < GH;
  if (!Array.isArray(m.holes) || m.holes.length < HOLES[0] || m.holes.length > HOLES[1] || !m.holes.every(cellOk)) return false;
  if (!cellOk(m.start) || !cellOk(m.star) || !DKEYS.includes(m.red)) return false;
  const hs = holeSet(m);
  if (hs.size !== m.holes.length || hs.has(m.start[0] + m.start[1] * GW) || hs.has(m.star[0] + m.star[1] * GW)) return false;
  if (m.start[0] === m.star[0] && m.start[1] === m.star[1]) return false;
  if (cellDist(m, hs, m.start).size !== GW * GH - hs.size) return false;
  if (!(faceCos(m, m.start[0], m.start[1], m.red) > 0.3)) return false;
  if (geodesicEnds(m, hs, m.start, m.red).has('U')) return false;
  const away = OPP[m.red], a1 = [m.start[0] + DIRS[away][0], m.start[1] + DIRS[away][1]];
  if (freeCell(m, hs, a1[0], a1[1]) && !(a1[0] === m.star[0] && a1[1] === m.star[1]) && geodesicEnds(m, hs, a1, 'U').has('U')) return false;
  const sol = solve(m, hs, m.start, m.red);
  if (!(sol.len >= OPT.min && sol.len <= OPT.max) || sol.len !== m.opt) return false;
  if (solve(m, hs, m.start, m.red, (c, r, f) => redSeen(m, c, r, f)).len <= sol.len) return false;
  return starVisible(m);
}
function starVisible(m) {
  const sc = traceScene(m, cubePose(m.start[0], m.start[1], m.red), sceneCamera(m, BOARD.w, BOARD.h, FIT));
  const [x, z] = cellXZ(m.star[0], m.star[1]), id = m.star[0] + m.star[1] * gridW(m);
  for (let i = 0; i <= 10; i++) {
    const a = i * Math.PI / 5, rad = i === 10 ? 0 : 0.29;
    const h = RT.rayToPoint(sc, x + rad * Math.sin(a), 0, z + rad * Math.cos(a));
    if (h.id !== id || !(h.t > h.tP - 1e-3)) return false;
  }
  return true;
}
export function gate(m) { return contractOk(m); }

const OPT_W = [[7, 0.25], [8, 0.3], [9, 0.25], [10, 0.2]];
function tryBuild(rng, want, pre = null) {
  const cam = { az: rng.int(0, 3) * 90 + rng.int(30, 60), el: rng.int(48, 54) };
  const cells = rng.shuffle(Array.from({ length: G * G }, (_, i) => [i % G, Math.floor(i / G)]));
  const nH = rng.int(HOLES[0], HOLES[1]);
  const holes = cells.slice(0, nH).map((p) => p.slice()).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const start = cells[nH].slice(), star = cells[nH + 1].slice();
  const base = { task: NAME, board: { ...BOARD }, grid: G, cam, holes, start, star, red: null, opt: 0 };
  const sides = DKEYS.filter((k) => faceCos(base, start[0], start[1], k) > 0.3);
  if (!sides.length) return null;
  base.red = rng.pick(sides);
  if (pre && !pre(base)) return null;
  const hs = holeSet(base);
  if (cellDist(base, hs, start).size !== G * G - hs.size) return null;
  const sol = solve(base, hs, start, base.red);
  if (sol.len !== want) return null;
  base.opt = sol.len;
  base.gtContract = 'cube on the star cell with the red face up (state check at Verify)';
  return contractOk(base) ? base : null;
}
function generateExt(rng, split, n) {
  const slot = K.seedSlot('roll_cube_red_up', split, n);
  const pre = (m) => { const k = semanticKey(m); return K.keyAccept(k, split, EVAL_KEYS) && K.keySlot(k) === slot; };
  for (let round = 0; round < 400; round++) {
    let r = rng.raw(), want = 7;
    for (const [k, w] of OPT_W) { if (r < w) { want = k; break; } r -= w; }
    for (let a = 0; a < 6000; a++) { const m = tryBuild(rng, want, pre); if (m) return m; }
  }
  throw new Error('roll_cube_red_up: no gated training instance');
}

const CAM_CACHE = new WeakMap();
function camOf(m) { let c = CAM_CACHE.get(m); if (!c) { c = sceneCamera(m, BOARD.w, BOARD.h, FIT); CAM_CACHE.set(m, c); } return c; }
const VIS = new WeakMap();
function syncVis(st) {
  let v = VIS.get(st);
  if (!v) { v = { cell: st.cell.slice(), red: st.red, anim: null }; VIS.set(st, v); return v; }
  if (v.anim) return v;
  if (v.cell[0] === st.cell[0] && v.cell[1] === st.cell[1] && v.red === st.red) return v;
  const dc = st.cell[0] - v.cell[0], dr = st.cell[1] - v.cell[1];
  const dir = DKEYS.find((k) => DIRS[k][0] === dc && DIRS[k][1] === dr);
  if (dir && rollFace(v.red, dir) === st.red) v.anim = { dir, t: 0 };
  else { v.cell = st.cell.slice(); v.red = st.red; }
  return v;
}
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

const task = {
  meta: {
    name: NAME, family: 'C', uses3d: true,
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'roll', dir: 'N|E|S|W (tap the stone next to the cube on that side; grid directions, N = row-1)' },
      { op: 'reset' },
    ],
    promptHuman: 'Roll the cube onto the star, red side up, within the roll budget',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    let r = rng.raw(), want = 7;
    for (const [k, w] of OPT_W) { if (r < w) { want = k; break; } r -= w; }
    for (let a = 0; a < 6000; a++) { const m = tryBuild(rng, want); if (m) return m; }
    for (let a = 0; a < 6000; a++) { const m = tryBuild(rng, rng.int(OPT.min, OPT.max)); if (m) return m; }
    throw new Error('roll_cube_red_up: no gated instance');
  },

  init(m) { return { cell: m.start.slice(), red: m.red, rolls: 0, used: 0 }; },

  applyAction(st, a, m) {
    const op = a && a.op;
    if (op === 'reset') { st.cell = m.start.slice(); st.red = m.red; st.rolls = 0; return { ok: true }; }
    if (op === 'roll') {
      const d = DIRS[a.dir];
      if (!d) return { ok: false, reason: 'bad-dir' };
      const nc = st.cell[0] + d[0], nr = st.cell[1] + d[1];
      if (!freeCell(m, holeSet(m), nc, nr)) return { ok: false, reason: 'water' };
      if ((st.used || 0) >= budget(m)) return { ok: false, reason: 'no-rolls-left' };
      st.cell = [nc, nr]; st.red = rollFace(st.red, a.dir); st.rolls++; st.used = (st.used || 0) + 1;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(st, m) {
    const onStar = st.cell[0] === m.star[0] && st.cell[1] === m.star[1], up = st.red === 'U';
    const ok = onStar && up && (st.used || 0) <= budget(m);
    return { success: ok, error: ok ? 0 : 1, partial: (onStar ? 0.5 : 0) + (up ? 0.5 : 0), detail: { cell: st.cell.slice(), red: st.red, rolls: st.rolls, used: st.used || 0, budget: budget(m) } };
  },

  oracle(m) { return solve(m, holeSet(m), m.start, m.red).path.map((dir) => ({ op: 'roll', dir })); },

  randomPolicy(m, rnd) {
    const n = 2 + Math.floor(rnd() * 11);
    return Array.from({ length: n }, () => ({ op: 'roll', dir: DKEYS[Math.floor(rnd() * 4)] }));
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const n = env && env.manifest ? budget(env.manifest) : null;
    drawPromptText(g, r, 'Roll the cube onto the star, red side up', n ? `Tap a stone next to the cube to roll it. At most ${n} rolls (Reset does not give them back)` : 'Tap a stone next to the cube to roll it');
  },

  tick(env, dt) {
    const st = env && env.state;
    if (!st) return false;
    const v = syncVis(st);
    if (!v.anim) return false;
    v.anim.t += dt / ROLL_S;
    if (v.anim.t >= 1) {
      const d = DIRS[v.anim.dir];
      v.cell = [v.cell[0] + d[0], v.cell[1] + d[1]]; v.red = rollFace(v.red, v.anim.dir); v.anim = null;
      syncVis(st);
    }
    return true;
  },

  _cache(m, q, lk) {
    const C = (this.__c ??= { m: null, q: 0, bg: null, imgs: new Map(), scenes: new Map() });
    if (C.m !== m || C.q !== q || (lk !== undefined && (C.lk || '') !== lk)) { C.m = m; C.q = q; C.bg = null; C.imgs = new Map(); C.scenes = new Map(); if (lk !== undefined) C.lk = lk; }
    return C;
  },
  _stateScene(m, cell, red, look = null) {
    const C = this._cache(m, this.__c?.q || 1), k = `${look ? 'S|' : ''}${cell[0]},${cell[1]},${red}`;
    let sc = C.scenes.get(k);
    if (!sc) { sc = traceScene(m, cubePose(cell[0], cell[1], red), camOf(m), look); if (C.scenes.size > 32) C.scenes.delete(C.scenes.keys().next().value); C.scenes.set(k, sc); }
    return sc;
  },

  _restImage(m, C, cam, q, cell, red, look = null) {
    const pose = cubePose(cell[0], cell[1], red), sc = this._stateScene(m, cell, red, look);
    const img = { data: new Uint8ClampedArray(C.bgImg.data), ids: new Int16Array(C.bgImg.ids), w: C.bgImg.w, h: C.bgImg.h, q };
    const r = influenceRect(pose, cam, sc.Ld, BOARD.w, BOARD.h);
    return RT.renderRect(sc, q, Math.floor(r.x0 * q), Math.floor(r.y0 * q), Math.ceil(r.x1 * q), Math.ceil(r.y1 * q), img);
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
    const look = env.style ? env.assets?.look || null : null;
    const q = Math.min(2, RT.contextScale(g)), C = look ? this._cache(m, q, env.style.key) : this._cache(m, q, ''), cam = camOf(m);
    const v = syncVis(st);
    if (!C.bg) { C.bgImg = RT.render(traceScene(m, null, cam, look), q); C.bg = RT.toCanvas(C.bgImg); }
    if (v.anim) {
      g.drawImage(C.bg, 0, 0, br.w, br.h);
      const pose = cubePose(v.cell[0], v.cell[1], v.red, v.anim.dir, ease(Math.min(1, v.anim.t)));
      const P = cubeCorners(pose).map((p) => cam.project(p[0], p[1], p[2]));
      const sc = traceScene(m, pose, cam, look);
      const L = sc.Ld, S = cubeCorners(pose).map((p) => { const t = p[1] / L[1]; return cam.project(p[0] - L[0] * t, 0, p[2] - L[2] * t); });
      g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgba(30,26,20,0.28)';
      const hull = convexHull(S); g.beginPath(); hull.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill();
      g.restore();
      const x0 = Math.min(...P.map((p) => p.x)) - 2, x1 = Math.max(...P.map((p) => p.x)) + 2;
      const y0 = Math.min(...P.map((p) => p.y)) - 2, y1 = Math.max(...P.map((p) => p.y)) + 2;
      const lay = RT.renderLayer(sc, 1, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, new Set([CUBE_ID]));
      g.drawImage(RT.toCanvas(lay), lay.x, lay.y, lay.bw, lay.bh);
    } else {
      const k = `${v.cell[0]},${v.cell[1]},${v.red}`;
      let canvas = C.imgs.get(k);
      if (!canvas) {
        canvas = RT.toCanvas(this._restImage(m, C, cam, q, v.cell, v.red, look));
        if (C.imgs.size > 24) C.imgs.delete(C.imgs.keys().next().value);
        C.imgs.set(k, canvas);
      }
      g.drawImage(canvas, 0, 0, br.w, br.h);
    }
    const b = RESET, on = st.rolls > 0;
    g.fillStyle = on ? 'rgba(255,255,255,.94)' : 'rgba(238,241,244,.88)'; rr(g, b.x, b.y, b.w, b.h, 6); g.fill();
    g.strokeStyle = on ? '#b8c2cc' : '#d9dfe5'; g.lineWidth = 1; g.stroke();
    g.fillStyle = on ? '#41505e' : '#9aa5ae'; g.font = `600 12px ${UI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Reset', b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    g.restore();
  },

  _cellAt(m, st, x, y) {
    const sc = this._stateScene(m, st.cell, st.red);
    const id = RT.pickId(sc, x, y);
    if (id === CUBE_ID) return null;
    const GW = gridW(m), GH = gridH(m);
    if (id >= 0 && id < GW * GH) return [id % GW, Math.floor(id / GW)];
    const p = RT.planeAtPixel(sc.cam, x, y, 0);
    if (!p) return null;
    const c = Math.round(p.x + (G - 1) / 2), r = Math.round(p.z + (G - 1) / 2);
    if (c < 0 || r < 0 || c >= GW || r >= GH) return null;
    if (Math.max(Math.abs(p.x - (c - (G - 1) / 2)), Math.abs(p.z - (r - (G - 1) / 2))) > 0.52) return null;
    return [c, r];
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const m = env.manifest, st = env.state;
    const b = RESET;
    if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ op: 'reset' }];
    const cell = this._cellAt(m, st, evt.x, evt.y);
    if (!cell) return [];
    const dc = cell[0] - st.cell[0], dr = cell[1] - st.cell[1];
    const dir = DKEYS.find((k) => DIRS[k][0] === dc && DIRS[k][1] === dr);
    if (!dir || !freeCell(m, holeSet(m), cell[0], cell[1])) return [];
    return [{ op: 'roll', dir }];
  },

  footerStatus(env) {
    const used = env.state.used || 0, left = budget(env.manifest) - used;
    if (!used) return `Tap a stone next to the cube (${left} rolls)`;
    return left > 0 ? `${used} used, ${left} left` : 'No rolls left';
  },
};

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export default task;
