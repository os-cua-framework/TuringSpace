import { drawPromptText, rr } from '../core/panel.js';
import { contextScale, pickId } from '../common/_seat_view_rt.js';
import {
  GEO, IDS, LIGHT_DIR, camOf, subCam, sceneFor, render, slotScreen, ballScreen, boxScreen, rigBox, rigMidX,
  pegTopY, ballY, visibleFracs,
} from '../common/_pegs_from_across_scene.js';
import * as PX from '../common/_pegs_from_across_beads.js';
import { decorrelate } from '../common/_seat_view_prop_kinds.js';
import * as SQM from '../common/_pegs_from_across_square.js';
import { nthOf, splitIds } from '../core/style.js';

const NAME = 'pegs_from_across';
const BOARD = { w: 340, h: 400 };
const PHOTO = { x: 12, y: 12, w: 216, h: 162, pad: 6 };
const PHOTO_BOX = [8, 26, PHOTO.w - 8, PHOTO.h - 6];
const RIG_BOX = [12, PHOTO.y + PHOTO.h + PHOTO.pad + 18, BOARD.w - 12, BOARD.h - 10];
const CAPS = GEO.CAPS;
const COLORS = ['red', 'yellow', 'blue', 'green'];
const MIN_MOVES = 3, MAX_MOVES = 5;
const FOV = 30;

const clone = (p) => p.map((s) => s.slice());
const keyOf = (p) => p.map((s) => s.join('')).join('|');
function legal(p, n) {
  if (!Array.isArray(p) || p.length !== 3) return false;
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    if (!Array.isArray(p[i]) || p[i].length > CAPS[i]) return false;
    for (const b of p[i]) { if (!Number.isInteger(b) || b < 0 || b >= n || seen.has(b)) return false; seen.add(b); }
  }
  return seen.size === n;
}
function moves(p) {
  const out = [];
  for (let a = 0; a < 3; a++) if (p[a].length) for (let b = 0; b < 3; b++) {
    if (a === b || p[b].length >= CAPS[b]) continue;
    const q = clone(p); q[b].push(q[a].pop()); out.push({ from: a, to: b, q });
  }
  return out;
}
function bfs(p) {
  const seen = new Map([[keyOf(p), { d: 0, prev: null, mv: null, p }]]), q = [p];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], e = seen.get(keyOf(cur));
    for (const mv of moves(cur)) {
      const k = keyOf(mv.q);
      if (!seen.has(k)) { seen.set(k, { d: e.d + 1, prev: keyOf(cur), mv: [mv.from, mv.to], p: mv.q }); q.push(mv.q); }
    }
  }
  return seen;
}
function plan(start, goal) {
  const T = bfs(start), gk = keyOf(goal);
  if (!T.has(gk)) return null;
  const path = [];
  for (let k = gk; T.get(k).prev !== null; k = T.get(k).prev) path.unshift(T.get(k).mv);
  return path;
}

function fitCam(look, flip, az, el, W, H, box) {
  const tx = Math.round(rigMidX(look, flip) * 1000) / 1000;
  for (let i = 0; i < 300; i++) {
    const dist = Math.round((0.5 + i * 0.01) * 100) / 100;
    const c = { az, el, dist, fov: FOV, tx, ty: 0.08, tz: 0, shiftY: 0 };
    const r = rigBox(camOf(c, W, H), look, flip);
    if (r.x1 - r.x0 > box[2] - box[0] || r.y1 - r.y0 > box[3] - box[1]) continue;
    c.shiftY = Math.round((box[1] + box[3]) / 2 - (r.y0 + r.y1) / 2);
    const r2 = rigBox(camOf(c, W, H), look, flip);
    if (r2.x0 >= box[0] && r2.x1 <= box[2] && r2.y0 >= box[1] && r2.y1 <= box[3]) return c;
  }
  return null;
}
const mainCam = (m) => camOf(m.cam, BOARD.w, BOARD.h);
const photoCam = (m) => camOf(m.photoCam, PHOTO.w, PHOTO.h);
const lookOf = (m) => (m.kit ? { slots: m.slots, colors: m.colors, mug: m.mug, kit: m.kit } : { slots: m.slots, colors: m.colors, mug: m.mug });
const sceneOf3 = (look, arr, cam, flip, skin = null) => PX.sceneForX(look, arr, cam, flip, skin);
const slotOfPeg = (m, pid) => m.slots.indexOf(pid);

function photoOrder(m) {
  const cam = photoCam(m);
  return [0, 1, 2].map((s) => ({ pid: m.slots[s], x: slotScreen(cam, s, m.slots[s], true).foot.x })).sort((a, b) => a.x - b.x).map((e) => e.pid);
}
function screenCopy(m) {
  const po = photoOrder(m), out = [[], [], []];
  for (let j = 0; j < 3; j++) out[m.slots[j]] = m.goal[po[j]].slice();
  return out;
}

const SCENES = new WeakMap();
function photoScene(m) {
  let s = SCENES.get(m);
  if (!s) { s = sceneOf3(lookOf(m), m.goal, photoCam(m), true); SCENES.set(m, s); }
  return s;
}
export function contractProblems(m) {
  const P = [];
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['task'];
  const n = m.colors?.length;
  if (!(n === 3 || n === 4) || new Set(m.colors).size !== n || !m.colors.every((c) => COLORS.includes(c))) return ['colors'];
  if (!Array.isArray(m.slots) || m.slots.slice().sort().join('') !== '012') return ['slots'];
  if (!legal(m.start, n) || !legal(m.goal, n)) return ['arrangement'];
  if (!m.cam || !m.photoCam || !m.mug) return ['camera'];
  const path = plan(m.start, m.goal);
  if (!path || path.length < MIN_MOVES || path.length > MAX_MOVES || path.length !== m.minMoves) P.push('moves');
  const look = lookOf(m);
  const mc = fitCam(look, false, m.cam.az, m.cam.el, BOARD.w, BOARD.h, RIG_BOX);
  const pc = fitCam(look, true, m.photoCam.az, m.photoCam.el, PHOTO.w, PHOTO.h, PHOTO_BOX);
  for (const [a, b] of [[mc, m.cam], [pc, m.photoCam]]) if (!a || ['az', 'el', 'dist', 'fov', 'tx', 'ty', 'tz', 'shiftY'].some((k) => a[k] !== b[k])) P.push('fit');
  if (P.length) return P;
  const po = photoOrder(m);
  if (po.join('') !== m.slots.slice().reverse().join('')) P.push('photo-order');
  const pcam = photoCam(m);
  const hpx = [0, 1, 2].map((pid) => { const g = slotScreen(pcam, slotOfPeg(m, pid), pid, true); return g.foot.y - g.tip.y; });
  if (!(hpx[0] > hpx[1] * 1.15 && hpx[1] > hpx[2] * 1.15)) P.push('photo-heights');
  const xs = [0, 1, 2].map((s) => slotScreen(pcam, s, m.slots[s], true).foot.x).sort((a, b) => a - b);
  const rPx = ballScreen(pcam, 1, 0, true).r;
  if (!(xs[1] - xs[0] > 2.6 * rPx && xs[2] - xs[1] > 2.6 * rPx)) P.push('photo-spacing');
  const sc = screenCopy(m);
  if (!legal(sc, n)) P.push('copy-illegal');
  else if (keyOf(sc) === keyOf(m.goal)) P.push('copy-equals-goal');
  else if (keyOf(sc) === keyOf(m.start)) P.push('copy-equals-start');
  else if (!plan(m.start, sc)) P.push('copy-unreachable');
  const ps = photoScene(m);
  const balls = m.goal.flat();
  if (visibleFracs(ps, balls.map(IDS.ball)).some((f) => f < 0.6)) P.push('photo-ball-hidden');
  for (let pid = 0; pid < 3; pid++) {
    const t = slotScreen(pcam, slotOfPeg(m, pid), pid, true).tip;
    if (pickId(ps, t.x, t.y + 1.5) !== IDS.peg(pid)) P.push('photo-tip-hidden');
  }
  const cam = mainCam(m), full = [[0, 1, 2], [3, 4], [5]];
  const fullScene = sceneOf3({ ...look, colors: ['red', 'yellow', 'blue', 'green', 'red', 'yellow'] }, full, cam, false);
  if (visibleFracs(fullScene, full.flat().map(IDS.ball)).some((f) => f < 0.6)) P.push('table-ball-hidden');
  const rb = rigBox(cam, look, false);
  if (rb.y0 < PHOTO.y + PHOTO.h + PHOTO.pad + 8 && rb.x0 < PHOTO.x + PHOTO.w + PHOTO.pad + 8) P.push('photo-covers-rig');
  return [...new Set(P)];
}
export function gate(m) { if (is4(m)) return gate4(m); try { return contractProblems(m).length === 0; } catch { return false; } }

const r2 = (v) => Math.round(v * 100) / 100;
function allStates(n) {
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  const out = [];
  for (let a = 0; a <= CAPS[0]; a++) for (let b = 0; b <= CAPS[1]; b++) {
    const c = n - a - b;
    if (c < 0 || c > CAPS[2]) continue;
    for (const p of perms([...Array(n).keys()])) out.push([p.slice(0, a), p.slice(a, a + b), p.slice(a + b)]);
  }
  return out;
}
function tryBuild(rng, slots, n, kit = null) {
  const colors = rng.sample(COLORS, n);
  const side = rng.sign();
  const mug = { side, col: rng.int(0, 2), handle: Math.round(side * rng.uniform(55, 125)) };
  const look = { slots, colors, mug };
  const cam = fitCam(look, false, r2(rng.uniform(-6, 6)), r2(rng.uniform(26, 32)), BOARD.w, BOARD.h, RIG_BOX);
  const photoCamC = fitCam(look, true, r2(rng.uniform(-24, 24)), r2(rng.uniform(20, 28)), PHOTO.w, PHOTO.h, PHOTO_BOX);
  if (!cam || !photoCamC) return null;
  const want = rng.int(MIN_MOVES, MAX_MOVES);
  const states = allStates(n);
  for (let k = 0; k < 40; k++) {
    const goal = rng.pick(states);
    const base = { task: NAME, board: { ...BOARD }, colors, slots, mug, cam, photoCam: photoCamC, goal };
    const sc = screenCopy({ ...base, start: goal });
    if (!legal(sc, n) || keyOf(sc) === keyOf(goal)) continue;
    const T = bfs(goal);
    const reach = bfs(sc);
    const cands = [...T.values()].filter((e) => e.d === want && reach.has(keyOf(e.p))).map((e) => e.p);
    if (!cands.length) continue;
    const start = rng.pick(cands);
    const m = { ...base, start, minMoves: want,
      gtContract: 'the balls on each peg (by peg identity: 0 tall/3 balls, 1 middle/2, 2 short/1), bottom to top, equal the photo' };
    if (kit) m.kit = kit;
    if (gate(m)) return m;
  }
  return null;
}

function dirtyRects(m, cam, before, after) {
  const pos = (p) => { const o = new Map(); p.forEach((s, pid) => s.forEach((b, lvl) => o.set(b, [slotOfPeg(m, pid), lvl]))); return o; };
  const A = pos(before), B = pos(after), boxes = [];
  const ll = Math.hypot(...LIGHT_DIR), Ld = LIGHT_DIR.map((v) => v / ll);
  for (const [b, pa] of A) {
    const pb = B.get(b);
    if (pb && pb[0] === pa[0] && pb[1] === pa[1]) continue;
    for (const [slot, lvl] of [pa, pb]) {
      const x = GEO.SLOT_X[slot], y = ballY(lvl), R = GEO.R + 0.004;
      const t = (y + R) / Ld[1], e = 0.022;
      boxes.push(boxScreen(cam, Math.min(x - R, x - R - t * Ld[0]) - e, -0.002, Math.min(-R, -R - t * Ld[2]) - e,
        Math.max(x + R, x + R - t * Ld[0]) + e, y + R + 0.004, Math.max(R, R - t * Ld[2]) + e));
    }
  }
  return boxes.map((r) => {
    const x0 = Math.max(0, Math.floor((r.x0 - 4) / 4) * 4), y0 = Math.max(0, Math.floor((r.y0 - 4) / 4) * 4);
    const x1 = Math.min(BOARD.w, Math.ceil((r.x1 + 4) / 4) * 4), y1 = Math.min(BOARD.h, Math.ceil((r.y1 + 4) / 4) * 4);
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  }).filter((r) => r.w > 0 && r.h > 0);
}
function makeCanvas(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}
function putImg(ctx, img, x, y) { ctx.putImageData(new ImageData(img.data, img.w, img.h), x, y); }

function columns(m) {
  const cam = mainCam(m), out = [];
  const xs = [0, 1, 2].map((s) => slotScreen(cam, s, m.slots[s], false).foot.x);
  const half = Math.min(xs[1] - xs[0], xs[2] - xs[1]) / 2 - 1;
  const front = boxScreen(cam, -GEO.BASE.hx, 0, GEO.BASE.hz, GEO.BASE.hx, 0, GEO.BASE.hz).y1;
  for (let s = 0; s < 3; s++) {
    const g = slotScreen(cam, s, m.slots[s], false);
    out.push({ slot: s, x0: xs[s] - half, x1: xs[s] + half, y0: Math.min(g.tip.y, cam.project(g.x, pegTopY(0), 0).y) - 24, y1: front + 10, cx: xs[s] });
  }
  return out;
}

const EVAL_KEYS = new Set(['pegs|120|3|0|1|2|21|0||-1', 'pegs|210|3|0|1|2||21|0|1', 'pegs|120|3|0|12||2|0|1|1', 'pegs|210|3|0|12||01|2||1',
  'pegs|201|3|01||2||21|0|-1', 'pegs|012|3||01|2||21|0|1', 'pegs|012|3|0|1|2|0|21||-1', 'pegs|210|3||01|2|2|10||-1', 'pegs|021|3|01|2||10|2||-1',
  'pegs|021|3|0|1|2|21||0|1', 'pegs|120|3|01|2||2|1|0|-1', 'pegs|012|3|0|1|2|20||1|1']);
const TUPLES = new Map();
function semanticTuples(split) {
  if (TUPLES.has(split)) return TUPLES.get(split);
  const all = [];
  for (const slots of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    for (const n of slots[1] === 0 ? [3, 4] : [3]) {
      for (const goal of allStates(n)) {
        if (goal.flat().some((b, i) => b !== i)) continue;
        const po = slots.slice().reverse(), copy = [[], [], []];
        for (let j = 0; j < 3; j++) copy[slots[j]] = goal[po[j]].slice();
        if (!legal(copy, n) || keyOf(copy) === keyOf(goal)) continue;
        const T = bfs(goal), reach = bfs(copy);
        for (const e of T.values()) {
          if (e.d < MIN_MOVES || e.d > MAX_MOVES || !reach.has(keyOf(e.p)) || keyOf(e.p) === keyOf(copy)) continue;
          for (const side of [-1, 1]) {
            const t = { slots, n, goal, start: e.p, d: e.d, side };
            t.key = semanticKey({ slots, colors: Array(n).fill(0), goal, start: e.p, mug: { side } });
            if (!EVAL_KEYS.has(t.key)) all.push(t);
          }
        }
      }
    }
  }
  const sp = splitIds(`${NAME}|tuples`, all.map((t) => t.key), Math.ceil(all.length / 10));
  for (const sl of ['train', 'test']) TUPLES.set(sl, all.filter((t) => sp(t.key) === sl));
  return TUPLES.get(split);
}
function tupleFor(n, split, rng, k = 0) {
  const L = semanticTuples(split), N = L.length;
  if (n == null) return L[Math.floor(rng.uniform(0, 1) * N)];
  return L[(nthOf(`${NAME}|${split}|tuples`, n, N) + k * 7919) % N];
}
function buildFromTuple(rng, t, kit) {
  const colors = rng.sample(COLORS, t.n);
  const mug = { side: t.side, col: rng.int(0, 2), handle: Math.round(t.side * rng.uniform(55, 125)) };
  const look = { slots: t.slots, colors, mug };
  const cam = fitCam(look, false, r2(rng.uniform(-6, 6)), r2(rng.uniform(26, 32)), BOARD.w, BOARD.h, RIG_BOX);
  const photoCamC = fitCam(look, true, r2(rng.uniform(-24, 24)), r2(rng.uniform(20, 28)), PHOTO.w, PHOTO.h, PHOTO_BOX);
  if (!cam || !photoCamC) return null;
  const m = { task: NAME, board: { ...BOARD }, colors, slots: t.slots, mug, cam, photoCam: photoCamC, goal: t.goal.map((q) => q.slice()), start: t.start.map((q) => q.slice()), minMoves: t.d,
    gtContract: 'the balls on each peg (by peg identity: 0 tall/3 balls, 1 middle/2, 2 short/1), bottom to top, equal the photo', kit };
  return gate(m) ? m : null;
}
function generateExt(rng0, split, n) {
  const rng = decorrelate(rng0), L = semanticTuples(split), idx = Number.isFinite(Number(n)) && n !== undefined ? Number(n) : null;
  const kit = { bead: GP_pick(rng, PX.BEADS, split), landmark: GP_pick(rng, PX.LANDMARKS, split) };
  for (let k = 0; k < 8; k++) {
    const t = tupleFor(idx, split, rng, k);
    for (let a = 0; a < 40; a++) { const m = buildFromTuple(rng, t, kit); if (m) return m; }
  }
  throw new Error(`${NAME}: generator exhausted (ext, ${L.length} tuples)`);
}
const GP_pick = (rng, fam, split) => rng.pick(fam.inSplit(split));

const D4 = 'square4';
const BOARD4 = { w: 440, h: 460 };
const PHOTO4 = { x: 12, y: 12, w: 264, h: 192, pad: 6 };
const PHOTO_BOX4 = [8, 22, PHOTO4.w - 8, PHOTO4.h - 6];
const RIG_BOX4 = [12, PHOTO4.y + PHOTO4.h + PHOTO4.pad + 14, BOARD4.w - 12, BOARD4.h - 10];
const CAPS4 = [2, 2, 2, 2];
const SAFE4 = [[16, 30], [60, 74]];
const COLORS4 = ['red', 'yellow', 'blue', 'green'];
const MIN4 = 6, MAX4 = 8;
const WANT4 = [6, 7, 7, 8];
const is4 = (m) => !!(m && m.design === D4);
const mod = (a, n) => ((a % n) + n) % n;
const safeYaw = (y) => SAFE4.some(([a, b]) => mod(y, 90) >= a - 1e-6 && mod(y, 90) <= b + 1e-6);

function legalC(p, n, caps) {
  if (!Array.isArray(p) || p.length !== caps.length) return false;
  const seen = new Set();
  for (let i = 0; i < caps.length; i++) {
    if (!Array.isArray(p[i]) || p[i].length > caps[i]) return false;
    for (const b of p[i]) { if (!Number.isInteger(b) || b < 0 || b >= n || seen.has(b)) return false; seen.add(b); }
  }
  return seen.size === n;
}
function movesC(p, caps) {
  const out = [];
  for (let a = 0; a < caps.length; a++) if (p[a].length) for (let b = 0; b < caps.length; b++) {
    if (a === b || p[b].length >= caps[b]) continue;
    const q = clone(p); q[b].push(q[a].pop()); out.push({ from: a, to: b, q });
  }
  return out;
}
function bfsC(p, caps) {
  const seen = new Map([[keyOf(p), { d: 0, prev: null, mv: null, p }]]), q = [p];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], e = seen.get(keyOf(cur));
    for (const mv of movesC(cur, caps)) {
      const k = keyOf(mv.q);
      if (!seen.has(k)) { seen.set(k, { d: e.d + 1, prev: keyOf(cur), mv: [mv.from, mv.to], p: mv.q }); q.push(mv.q); }
    }
  }
  return seen;
}
function planC(start, goal, caps) {
  const T = bfsC(start, caps), gk = keyOf(goal);
  if (!T.has(gk)) return null;
  const path = [];
  for (let k = gk; T.get(k).prev !== null; k = T.get(k).prev) path.unshift(T.get(k).mv);
  return path;
}
let STATES4 = null;
function states4() {
  if (STATES4) return STATES4;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  const out = [];
  for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) for (let c = 0; c <= 2; c++) {
    const d = 4 - a - b - c;
    if (d < 0 || d > 2) continue;
    for (const p of perms([0, 1, 2, 3])) out.push([p.slice(0, a), p.slice(a, a + b), p.slice(a + b, a + b + c), p.slice(a + b + c)]);
  }
  return (STATES4 = out);
}
const rotArr = (p, r) => { const q = [[], [], [], []]; for (let i = 0; i < 4; i++) q[(i + r) % 4] = p[i].slice(); return q; };
const refArr = (p, c) => { const q = [[], [], [], []]; for (let i = 0; i < 4; i++) q[mod(c - i, 4)] = p[i].slice(); return q; };
export const wrongReadings4 = (goal) => [1, 2, 3].map((r) => rotArr(goal, r)).concat([0, 1, 2, 3].map((c) => refArr(goal, c)));
export const sideView4 = (delta) => { const a = mod(delta, 360); return (a >= 45 && a <= 135) || (a >= 225 && a <= 315); };

const look4 = (m) => ({ yaw: m.yaw, colors: m.colors, mug: m.mug });
const mainCam4 = (m) => SQM.camOf(m.cam, BOARD4.w, BOARD4.h);
const photoCam4 = (m) => SQM.camOf(m.photoCam, PHOTO4.w, PHOTO4.h);
export function screenOrder4(m, photo) {
  const cam = photo ? photoCam4(m) : mainCam4(m), rot = photo ? -m.delta : 0, L = look4(m);
  return [0, 1, 2, 3].map((pid) => ({ pid, x: SQM.pegScreen(cam, L, pid, rot).foot.x })).sort((a, b) => a.x - b.x).map((e) => e.pid);
}
export function acrossReading4(m) {
  const L = look4(m), out = [[], [], [], []], used = new Set();
  for (let pid = 0; pid < 4; pid++) {
    const pp = SQM.pegXZ(L, pid, -m.delta), [x, z] = SQM.rotP(pp[0], pp[1], 180);
    let best = -1, bd = Infinity;
    for (let q = 0; q < 4; q++) { const t = SQM.pegXZ(L, q, 0), d = Math.hypot(t[0] - x, t[1] - z); if (d < bd) { bd = d; best = q; } }
    if (used.has(best)) return null;
    used.add(best); out[best] = m.goal[pid].slice();
  }
  return out;
}
export function screenReading4(m, rev) {
  const po = screenOrder4(m, true), my = screenOrder4(m, false), out = [[], [], [], []];
  for (let j = 0; j < 4; j++) out[my[j]] = m.goal[po[rev ? 3 - j : j]].slice();
  return out;
}
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
function pegReach4(m) {
  const cam = mainCam4(m), L = look4(m);
  return [0, 1, 2, 3].map((pid) => {
    const g = SQM.pegScreen(cam, L, pid, 0), r = SQM.ballScreen(cam, L, pid, 0, 0).r;
    return { pid, ax: g.foot.x, ay: g.foot.y + r * 0.3, bx: g.tip.x, by: g.tip.y - r * 1.2, reach: r + 9 };
  });
}
function pickPeg4(m, x, y) {
  let best = null, bd = Infinity;
  for (const s of pegReach4(m)) { const d = segDist(x, y, s.ax, s.ay, s.bx, s.by); if (d <= s.reach && d < bd) { bd = d; best = s.pid; } }
  return best;
}

const SCENES4 = new WeakMap();
function photoScene4(m) {
  let s = SCENES4.get(m);
  if (!s) { s = SQM.sceneFor(look4(m), m.goal, photoCam4(m), -m.delta); SCENES4.set(m, s); }
  return s;
}
const FULL8 = [[0, 1], [2, 3], [4, 5], [6, 7]];
function stacksApart(cam, L, rot, arr) {
  const pts = [];
  arr.forEach((st, pid) => st.forEach((b, lvl) => pts.push({ pid, ...SQM.ballScreen(cam, L, pid, lvl, rot) })));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j];
    if (a.pid !== b.pid && Math.hypot(a.x - b.x, a.y - b.y) < 2.1 * Math.max(a.r, b.r)) return false;
  }
  return true;
}
function viewProblems4(m) {
  const P = [], L = look4(m), cam = mainCam4(m);
  const full = SQM.sceneFor({ ...L, colors: [...COLORS4, ...COLORS4] }, FULL8, cam, 0);
  if (FULL8.flat().some((b) => SQM.visibleFrac(full, SQM.IDS.ball(b)) < 0.6)) P.push('table-ball-hidden');
  if (SQM.visibleFrac(full, SQM.IDS.mug) < 0.5) P.push('table-mug-hidden');
  if (!stacksApart(cam, L, 0, FULL8)) P.push('table-stacks-touch');
  for (let pid = 0; pid < 4; pid++) for (let lvl = 0; lvl < 2; lvl++) {
    const b = SQM.ballScreen(cam, L, pid, lvl, 0);
    if (pickPeg4(m, b.x, b.y) !== pid) P.push('tap-ambiguous');
  }
  const rb = SQM.rigBox(cam, L, 0);
  if (rb.y0 < PHOTO4.y + PHOTO4.h + PHOTO4.pad + 8 && rb.x0 < PHOTO4.x + PHOTO4.w + PHOTO4.pad + 8) P.push('photo-covers-rig');
  const empty = SQM.sceneFor(L, [[], [], [], []], photoCam4(m), -m.delta);
  if (SQM.visibleFrac(empty, SQM.IDS.mug) < 0.5) P.push('photo-mug-hidden');
  return P;
}
export function contractProblems4(m) {
  const P = [];
  if (!is4(m) || m.task !== NAME || m.board?.w !== BOARD4.w || m.board?.h !== BOARD4.h) return ['task'];
  if (!Array.isArray(m.colors) || m.colors.length !== 4 || new Set(m.colors).size !== 4 || !m.colors.every((c) => COLORS4.includes(c))) return ['colors'];
  if (!legalC(m.start, 4, CAPS4) || !legalC(m.goal, 4, CAPS4)) return ['arrangement'];
  if (!m.cam || !m.photoCam || !m.mug || !Number.isFinite(m.yaw) || !Number.isFinite(m.delta)) return ['camera'];
  if (!safeYaw(m.yaw) || !safeYaw(m.yaw - m.delta)) P.push('yaw');
  const ca = Math.atan2(SQM.LOCAL[m.mug.corner]?.[0], SQM.LOCAL[m.mug.corner]?.[1]) * 180 / Math.PI;
  const ma = Math.atan2(m.mug.lx, m.mug.lz) * 180 / Math.PI;
  if (Math.abs(Math.hypot(m.mug.lx, m.mug.lz) - SQM.SQ.MUG.d) > 2e-3 || Math.abs(mod(ma - ca + 180, 360) - 180) > 12.5) P.push('mug');
  const path = planC(m.start, m.goal, CAPS4);
  if (!path || path.length < MIN4 || path.length > MAX4 || path.length !== m.minMoves) P.push('moves');
  const wr = wrongReadings4(m.goal).map(keyOf);
  if (wr.includes(keyOf(m.goal))) P.push('symmetric-goal');
  if (keyOf(m.start) === keyOf(m.goal) || wr.includes(keyOf(m.start))) P.push('start-is-a-reading');
  const L = look4(m);
  const mc = SQM.fitCam(L, 0, m.cam.az, m.cam.el, BOARD4.w, BOARD4.h, RIG_BOX4);
  const pc = SQM.fitCam(L, -m.delta, m.photoCam.az, m.photoCam.el, PHOTO4.w, PHOTO4.h, PHOTO_BOX4);
  for (const [a, b] of [[mc, m.cam], [pc, m.photoCam]]) if (!a || ['az', 'el', 'dist', 'fov', 'tx', 'ty', 'tz', 'shiftY'].some((k) => a[k] !== b[k])) P.push('fit');
  if (P.length) return P;
  if (!Array.isArray(m.slots) || m.slots.join('') !== screenOrder4(m, false).join('')) P.push('slots');
  if (!sideView4(m.delta)) P.push('not-side-view');
  const gk = keyOf(m.goal), ac = acrossReading4(m);
  if (ac && keyOf(ac) === gk) P.push('across-is-goal');
  if (keyOf(screenReading4(m, true)) === gk) P.push('mirror-is-goal');
  if (keyOf(screenReading4(m, false)) === gk) P.push('copy-is-goal');
  const ps = photoScene4(m), pcam = photoCam4(m);
  if (m.goal.flat().some((b) => SQM.visibleFrac(ps, SQM.IDS.ball(b)) < 0.6)) P.push('photo-ball-hidden');
  if (!stacksApart(pcam, L, -m.delta, m.goal)) P.push('photo-stacks-touch');
  for (let pid = 0; pid < 4; pid++) {
    const t = SQM.pegScreen(pcam, L, pid, -m.delta).tip;
    if (SQM.pickId(ps, t.x, t.y + 1.5) !== SQM.IDS.peg(pid)) P.push('photo-tip-hidden');
  }
  P.push(...viewProblems4(m));
  return [...new Set(P)];
}
const gate4 = (m) => { try { return contractProblems4(m).length === 0; } catch { return false; } };

function generate4(rng) {
  const states = states4(), r3 = (v) => Math.round(v * 1000) / 1000;
  const safe = () => { const b = rng.pick(SAFE4); return r2(rng.uniform(b[0], b[1])); };
  for (let a = 0; a < 400; a++) {
    const colors = rng.shuffle(COLORS4);
    const yaw = safe(), psi = safe(), k = rng.pick([1, 3]);
    const delta = r2(mod(yaw - psi + 90 * k, 360));
    if (!sideView4(delta)) continue;
    const corner = rng.int(0, 3), ang = Math.atan2(SQM.LOCAL[corner][0], SQM.LOCAL[corner][1]) * 180 / Math.PI + rng.uniform(-12, 12);
    const mug = { corner, lx: r3(SQM.SQ.MUG.d * Math.sin(ang * Math.PI / 180)), lz: r3(SQM.SQ.MUG.d * Math.cos(ang * Math.PI / 180)),
      col: rng.int(0, 2), handle: Math.round(rng.uniform(0, 360)) };
    if (Math.abs(Math.hypot(mug.lx, mug.lz) - SQM.SQ.MUG.d) > 2e-3) continue;
    const L = { yaw, colors, mug };
    const cam = SQM.fitCam(L, 0, r2(rng.uniform(-5, 5)), r2(rng.uniform(38, 46)), BOARD4.w, BOARD4.h, RIG_BOX4);
    const photoCam = SQM.fitCam(L, -delta, r2(rng.uniform(-5, 5)), r2(rng.uniform(36, 46)), PHOTO4.w, PHOTO4.h, PHOTO_BOX4);
    if (!cam || !photoCam) continue;
    const base = { task: NAME, design: D4, board: { ...BOARD4 }, panel: { panelWidth: BOARD4.w + 20, boardH: BOARD4.h + 10 },
      colors, yaw, delta, mug, cam, photoCam };
    base.slots = screenOrder4(base, false);
    if (viewProblems4(base).length) continue;
    const want0 = rng.pick(WANT4);
    for (let t = 0; t < 30; t++) {
      const goal = rng.pick(states), wr = wrongReadings4(goal).map(keyOf);
      if (wr.includes(keyOf(goal))) continue;
      const bad = new Set([keyOf(goal), ...wr]);
      const T = [...bfsC(goal, CAPS4).values()].filter((e) => !bad.has(keyOf(e.p)));
      let want = want0, cands = [];
      for (; want >= MIN4; want--) { cands = T.filter((e) => e.d === want).map((e) => e.p); if (cands.length) break; }
      if (!cands.length) continue;
      const m = { ...base, goal, start: rng.pick(cands), minMoves: want,
        gtContract: 'the balls on each peg (by peg identity: the board corner it stands at), bottom to top, equal the photo' };
      if (gate4(m)) return m;
    }
  }
  throw new Error(`${NAME}: generator exhausted`);
}

function dirtyRects4(m, cam, before, after) {
  const pos = (p) => { const o = new Map(); p.forEach((s, pid) => s.forEach((b, lvl) => o.set(b, [pid, lvl]))); return o; };
  const A = pos(before), B = pos(after), boxes = [], L = look4(m);
  const Ld = SQM.LIGHT_DIR, ll = Math.hypot(...Ld), D = Ld.map((v) => v / ll);
  for (const [b, pa] of A) {
    const pb = B.get(b);
    if (pb && pb[0] === pa[0] && pb[1] === pa[1]) continue;
    for (const [pid, lvl] of [pa, pb]) {
      const [x, z] = SQM.pegXZ(L, pid, 0), y = SQM.ballY(lvl), R = SQM.SQ.R + 0.004, t = (y + R) / D[1], e = 0.022;
      boxes.push(SQM.boxScreen(cam, Math.min(x - R, x - R - t * D[0]) - e, -0.002, Math.min(z - R, z - R - t * D[2]) - e,
        Math.max(x + R, x + R - t * D[0]) + e, y + R + 0.004, Math.max(z + R, z + R - t * D[2]) + e));
    }
  }
  return boxes.map((r) => {
    const x0 = Math.max(0, Math.floor((r.x0 - 4) / 4) * 4), y0 = Math.max(0, Math.floor((r.y0 - 4) / 4) * 4);
    const x1 = Math.min(BOARD4.w, Math.ceil((r.x1 + 4) / 4) * 4), y1 = Math.min(BOARD4.h, Math.ceil((r.y1 + 4) / 4) * 4);
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  }).filter((r) => r.w > 0 && r.h > 0);
}
function ensure4(env, q) {
  const m = env.manifest, st = env.state, A = env.assets.pfa || (env.assets.pfa = {});
  const L = look4(m), cam = mainCam4(m);
  if (A.m !== m || A.q !== q) {
    A.m = m; A.q = q;
    const img = SQM.render(SQM.sceneFor(L, st.pegs, cam, 0), q);
    A.canvas = makeCanvas(img.w, img.h); A.ctx = A.canvas.getContext('2d'); putImg(A.ctx, img, 0, 0);
    const ph = SQM.render(photoScene4(m), q);
    A.photo = makeCanvas(ph.w, ph.h); putImg(A.photo.getContext('2d'), ph, 0, 0);
    A.pegs = clone(st.pegs);
    return;
  }
  if (keyOf(A.pegs) !== keyOf(st.pegs)) {
    for (const r of dirtyRects4(m, cam, A.pegs, st.pegs)) {
      const img = SQM.render(SQM.sceneFor(L, st.pegs, SQM.subCam(cam, r.x0, r.y0, r.w, r.h), 0), q);
      putImg(A.ctx, img, Math.round(r.x0 * q), Math.round(r.y0 * q));
    }
    A.pegs = clone(st.pegs);
  }
}
function drawBoard4(g, br, env) {
  const m = env.manifest, st = env.state;
  ensure4(env, contextScale(g));
  const A = env.assets.pfa;
  g.save(); g.translate(br.x, br.y);
  g.drawImage(A.canvas, 0, 0, BOARD4.w, BOARD4.h);
  const P = PHOTO4, ox = P.x - P.pad, oy = P.y - P.pad, ow = P.w + 2 * P.pad, oh = P.h + 2 * P.pad + 4;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 9; g.shadowOffsetY = 2;
  g.fillStyle = '#fbfaf7'; rr(g, ox, oy, ow, oh, 3); g.fill();
  g.restore();
  g.drawImage(A.photo, P.x, P.y, P.w, P.h);
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
  if (st.sel !== null && st.pegs[st.sel].length) {
    const b = SQM.ballScreen(mainCam4(m), look4(m), st.sel, st.pegs[st.sel].length - 1, 0);
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(b.x, b.y, b.r + 3.5, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#1991fa';
    g.beginPath(); g.arc(b.x, b.y, b.r + 3.5, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

export function semanticKey(m) {
  const map = new Map(); m.goal.flat().forEach((b) => { if (!map.has(b)) map.set(b, map.size); });
  const rl = (p) => p.map((s) => s.map((b) => map.get(b)).join('')).join('|');
  return `pegs|${m.slots.join('')}|${m.colors.length}|${rl(m.goal)}|${rl(m.start)}|${m.mug.side}`;
}

const task = {
  meta: {
    name: NAME, family: 'C', 
    panelWidth: BOARD4.w + 20, boardH: BOARD4.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD4 }, uses3d: true,
    actionSpace: [{ op: 'tap', slot: 'peg 0..3, left to right as you see the table: a tap picks up that peg\'s top ball; the next tap on another peg drops it there (same peg again = put it back)' }],
    promptHuman: 'Make the pegs match the photo (taken from somewhere around the table)',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs.ext) return { ...generateExt(rng, knobs.ext, knobs.n), panel: { panelWidth: 360, boardH: BOARD.h + 10 } };
    return generate4(rng);
  },

  init(m) { return { pegs: clone(m.start), sel: null, note: null }; },

  applyAction(st, a, m) {
    const caps = is4(m) ? CAPS4 : CAPS;
    if (!a || a.op !== 'tap' || !Number.isInteger(a.slot) || a.slot < 0 || a.slot >= caps.length) return { ok: false, reason: 'bad-op' };
    const pid = m.slots[a.slot];
    st.note = null;
    if (st.sel === null) {
      if (!st.pegs[pid].length) { st.note = 'empty'; return { ok: false, reason: 'empty-peg' }; }
      st.sel = pid; return { ok: true };
    }
    if (st.sel === pid) { st.sel = null; return { ok: true }; }
    if (st.pegs[pid].length >= caps[pid]) { st.note = 'full'; return { ok: false, reason: 'peg-full' }; }
    st.pegs[pid].push(st.pegs[st.sel].pop());
    st.sel = null;
    return { ok: true };
  },

  verify(st, m) {
    const ok = keyOf(st.pegs) === keyOf(m.goal);
    let right = 0, total = 0;
    m.goal.forEach((s, pid) => s.forEach((b, lvl) => { total++; if (st.pegs[pid][lvl] === b) right++; }));
    return { success: ok, error: ok ? 0 : 1, partial: total ? right / total : 0, detail: { pegs: st.pegs } };
  },

  oracle(m) {
    const acts = [];
    for (const [a, b] of (is4(m) ? planC(m.start, m.goal, CAPS4) : plan(m.start, m.goal))) acts.push({ op: 'tap', slot: slotOfPeg(m, a) }, { op: 'tap', slot: slotOfPeg(m, b) });
    return acts;
  },

  randomPolicy(m, rnd) {
    const k = 2 + Math.floor(rnd() * (is4(m) ? 17 : 11)), out = [], n = is4(m) ? 4 : 3;
    for (let i = 0; i < k; i++) out.push({ op: 'tap', slot: Math.floor(rnd() * n) });
    return out;
  },

  async mount(env) {
    env.assets.pfa = {};
    if (env.style && !is4(env.manifest)) env.assets.skin = await PX.styleSkin(env.style, env.manifest);
  },

  drawPrompt(g, r, env) {
    if (is4(env && env.manifest)) drawPromptText(g, r, 'Make the pegs match the photo', 'The photo was taken from somewhere around the table');
    else drawPromptText(g, r, 'Make the pegs match the photo', 'Photo taken from across the table');
  },

  _ensure(env, q) {
    const m = env.manifest, st = env.state, A = env.assets.pfa || (env.assets.pfa = {});
    const look = lookOf(m), cam = mainCam(m), skin = env.style ? env.assets.skin : null, sk = skin ? env.style.key : '';
    if (A.m !== m || A.q !== q || A.sk !== sk) {
      A.m = m; A.q = q; A.sk = sk;
      const img = render(skin ? sceneOf3(look, st.pegs, cam, false, skin) : sceneFor(look, st.pegs, cam, false), q);
      A.canvas = makeCanvas(img.w, img.h); A.ctx = A.canvas.getContext('2d'); putImg(A.ctx, img, 0, 0);
      const ph = render(skin ? sceneOf3(look, m.goal, photoCam(m), true, skin) : photoScene(m), q);
      A.photo = makeCanvas(ph.w, ph.h); putImg(A.photo.getContext('2d'), ph, 0, 0);
      A.pegs = clone(st.pegs);
      return;
    }
    if (keyOf(A.pegs) !== keyOf(st.pegs)) {
      for (const r of dirtyRects(m, cam, A.pegs, st.pegs)) {
        const sub = subCam(cam, r.x0, r.y0, r.w, r.h);
        const img = render(skin ? sceneOf3(look, st.pegs, sub, false, skin) : sceneFor(look, st.pegs, sub, false), q);
        putImg(A.ctx, img, Math.round(r.x0 * q), Math.round(r.y0 * q));
      }
      A.pegs = clone(st.pegs);
    }
  },

  drawBoard(g, br, env) {
    if (is4(env.manifest)) return drawBoard4(g, br, env);
    const m = env.manifest, st = env.state;
    const q = contextScale(g);
    this._ensure(env, q);
    const A = env.assets.pfa;
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    const P = PHOTO, ox = P.x - P.pad, oy = P.y - P.pad, ow = P.w + 2 * P.pad, oh = P.h + 2 * P.pad + 4;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 9; g.shadowOffsetY = 2;
    g.fillStyle = '#fbfaf7'; rr(g, ox, oy, ow, oh, 3); g.fill();
    g.restore();
    g.drawImage(A.photo, P.x, P.y, P.w, P.h);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
    if (st.sel !== null && st.pegs[st.sel].length) {
      const b = ballScreen(mainCam(m), slotOfPeg(m, st.sel), st.pegs[st.sel].length - 1, false);
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.95)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 3.5, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#1991fa';
      g.beginPath(); g.arc(b.x, b.y, b.r + 3.5, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    const m = env.manifest;
    if (is4(m)) {
      if (evt.x < PHOTO4.x + PHOTO4.w + PHOTO4.pad && evt.y < PHOTO4.y + PHOTO4.h + PHOTO4.pad + 4) return [];
      const pid = pickPeg4(m, evt.x, evt.y);
      return pid === null ? [] : [{ op: 'tap', slot: m.slots.indexOf(pid) }];
    }
    if (evt.x < PHOTO.x + PHOTO.w + PHOTO.pad && evt.y < PHOTO.y + PHOTO.h + PHOTO.pad + 4) return [];
    let best = null;
    for (const c of columns(m)) {
      if (evt.x < c.x0 || evt.x > c.x1 || evt.y < c.y0 || evt.y > c.y1) continue;
      if (!best || Math.abs(evt.x - c.cx) < Math.abs(evt.x - best.cx)) best = c;
    }
    return best ? [{ op: 'tap', slot: best.slot }] : [];
  },

  footerStatus(env) {
    const st = env.state;
    if (st.note === 'full') return 'That peg is full';
    if (env.manifest.kit) return st.sel === null ? 'Tap a peg to pick up its top piece' : 'Tap another peg to drop it';
    return st.sel === null ? 'Tap a peg to pick up its top ball' : 'Tap another peg to drop it';
  },
};

export function previewImage(m) { return render(sceneFor(lookOf(m), m.start, mainCam(m), false), 2); }
export function photoImage(m) { return render(photoScene(m), 2); }
export { screenCopy, plan, photoOrder, columns, BOARD, PHOTO };
export default task;
