import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { makeCamera } from '../common/_proj3d.js';
import { makeScene, makeLight } from '../common/_scene3d.js';
import { splitIds, nthOf, hash32 } from '../core/style.js';
import * as LK from '../common/_block_scene_look.js';

const PANEL_W = 380;
const BOARD = Object.freeze({ w: PANEL_W - 20, h: 326 });
const HARD = Object.freeze({ rounds: 1, cands: 4, pitch: 30, minVisFace: 0.3, sizeLo: 5, sizeHi: 7 });
const CONFIGS = Object.freeze([
  { dims: [3, 2, 2], yaw: 35 }, { dims: [3, 2, 2], yaw: -35 },
  { dims: [2, 2, 3], yaw: 35 }, { dims: [2, 2, 3], yaw: -35 },
  { dims: [2, 3, 2], yaw: 35 }, { dims: [2, 3, 2], yaw: -35 },
]);
const VIEW = Object.freeze({ x: 0, y: 0, w: BOARD.w, h: 190 });
const CARD = Object.freeze({ y: 200, w: 84, h: 118, gap: 4, x0: 6 });
const U = 40;
const MAIN_PX = 40, CARD_PX = 24;
const SAMPLES = 12;
const COLORS = Object.freeze({ given: '#8cb0ea', cand: '#f0a868', plate: '#d9dee4' });
const EVAL_COMBOS = new Set([
  '3x2x2|35|0,0,0;0,0,1;1,0,0;1,1,0;2,0,0;2,1,0;2,1,1', '3x2x2|35|0,0,0;0,1,0;1,0,0;1,0,1;2,0,0;2,0,1', '2x3x2|-35|1,0,0;1,0,1;1,1,0;1,1,1;1,2,0',
  '2x2x3|-35|0,0,0;0,0,1;0,1,0;1,0,1;1,0,2', '3x2x2|35|0,0,1;0,1,1;1,0,1;2,0,0;2,0,1', '3x2x2|35|1,0,0;1,0,1;2,0,0;2,0,1;2,1,0',
  '2x2x3|-35|0,0,0;0,0,1;0,0,2;0,1,0;1,0,1;1,0,2', '3x2x2|-35|0,0,0;0,1,0;1,0,0;2,0,0;2,0,1', '2x3x2|35|0,0,1;0,1,1;0,2,0;0,2,1;1,0,1;1,2,0',
  '3x2x2|-35|0,0,0;0,0,1;1,0,0;1,1,0;2,0,0', '3x2x2|35|0,0,0;0,1,0;0,1,1;1,0,0;2,0,0;2,1,0',
]);
const CONFIGS2 = Object.freeze([
  { dims: [3, 2, 3], yaw: 35 }, { dims: [3, 2, 3], yaw: -35 },
  { dims: [3, 3, 2], yaw: 35 }, { dims: [3, 3, 2], yaw: -35 },
]);
const HARD3 = Object.freeze({ cands: 9, groupMax: 2, near: 2, minOtherDist: 1, fits: [1, 2] });
const TURNS3 = Object.freeze([90, 180, 270]);
const BOARD3 = Object.freeze({ w: 560, h: 372 });
const VIEW3 = Object.freeze({ x: 6, y: 6, w: 190, h: BOARD3.h - 12 });
const CARD3 = Object.freeze({ w: 112, h: 112, gap: 6 });
const isCfg2 = (dims) => dims && dims[0] * dims[1] * dims[2] === 18;
const nCands = (R) => (isCfg2(R?.dims) ? HARD3.cands : HARD.cands);
const answerSet = (R) => (Array.isArray(R?.answer) ? R.answer : [R?.answer]);
const comboId = (cfg, given) => `${cfg.dims.join('x')}|${cfg.yaw}|${given.map((c) => c.join(',')).sort().join(';')}`;
const COMBO_SPLIT = (ids) => splitIds('cube_assembly_pick|combo', ids, 8);
const sizeRange = (dims) => (dims[0] * dims[1] * dims[2] === 12 ? [HARD.sizeLo, HARD.sizeHi] : isCfg2(dims) ? [8, 10] : [6, 10]);
const pitchOf = (cfg) => cfg.pitch ?? HARD.pitch;

const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const ck = (c) => c.join(',');
function connected(pts) {
  if (!pts.length) return false;
  const s = new Set(pts.map(ck)), seen = new Set([ck(pts[0])]), st = [pts[0]];
  while (st.length) {
    const q = st.pop();
    for (const d of D6) { const n = [q[0] + d[0], q[1] + d[1], q[2] + d[2]], k = ck(n); if (s.has(k) && !seen.has(k)) { seen.add(k); st.push(n); } }
  }
  return seen.size === pts.length;
}
const isBox = (pts) => {
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]))), hi = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])));
  return pts.length === (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
};
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const parity = (p) => { let v = 0; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) v++; return v % 2 ? -1 : 1; };
const ROTS = [];
for (const p of PERMS) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) if (parity(p) * sx * sy * sz === 1) ROTS.push({ p, s: [sx, sy, sz] });
function nkey(pts) {
  const m = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i])));
  return pts.map((q) => q.map((v, i) => v - m[i]).join(',')).sort().join(';');
}
const TURN_KEYS = new Map();
const turnKeys = (pts) => {
  const k = nkey(pts);
  if (!TURN_KEYS.has(k)) TURN_KEYS.set(k, new Set(ROTS.map((R) => nkey(pts.map((q) => [R.s[0] * q[R.p[0]], R.s[1] * q[R.p[1]], R.s[2] * q[R.p[2]]])))));
  return TURN_KEYS.get(k);
};
const sameTurned = (a, b) => a.length === b.length && turnKeys(a).has(nkey(b));

function viewBasis(yaw, pitch) {
  const a = yaw * Math.PI / 180, cam = { x: Math.sin(a), y: Math.tan(pitch * Math.PI / 180), z: Math.cos(a) };
  const n = Math.hypot(cam.x, cam.y, cam.z), f = { x: -cam.x / n, y: -cam.y / n, z: -cam.z / n };
  const rn = Math.hypot(f.z, f.x), r = { x: -f.z / rn, y: 0, z: f.x / rn };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const blockCells = ([X, Y, Z]) => { const out = []; for (let x = 0; x < X; x++) for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) out.push([x, y, z]); return out; };

const RAYS = new Map();
function rayLists(cfg) {
  const id = `${cfg.dims.join('x')}|${cfg.yaw}` + (pitchOf(cfg) === HARD.pitch ? '' : `|${cfg.pitch}`);
  if (RAYS.has(id)) return RAYS.get(id);
  const { f, r, u } = viewBasis(cfg.yaw, pitchOf(cfg));
  const cells = blockCells(cfg.dims), [X, Y, Z] = cfg.dims;
  const corners = [];
  for (const x of [0, X]) for (const y of [0, Y]) for (const z of [0, Z]) corners.push({ x, y, z });
  const pr = corners.map((c) => dot(c, r)), pu = corners.map((c) => dot(c, u));
  const r0 = Math.min(...pr), r1 = Math.max(...pr), u0 = Math.min(...pu), u1 = Math.max(...pu);
  const lists = [];
  for (let i = 0; i < Math.ceil((r1 - r0) * SAMPLES); i++) for (let j = 0; j < Math.ceil((u1 - u0) * SAMPLES); j++) {
    const a = r0 + (i + 0.5) / SAMPLES, b = u0 + (j + 0.5) / SAMPLES;
    const o = { x: a * r.x + b * u.x - 50 * f.x, y: a * r.y + b * u.y - 50 * f.y, z: a * r.z + b * u.z - 50 * f.z };
    const hits = [];
    cells.forEach(([cx, cy, cz], k) => {
      let t0 = -1e9, t1 = 1e9;
      for (const [oc, dc, lo] of [[o.x, f.x, cx], [o.y, f.y, cy], [o.z, f.z, cz]]) {
        if (Math.abs(dc) < 1e-12) { if (oc < lo || oc > lo + 1) { t0 = 1e9; break; } continue; }
        let ta = (lo - oc) / dc, tb = (lo + 1 - oc) / dc;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t1 - t0 > 1e-9) hits.push([t0, k]);
    });
    if (hits.length) lists.push(Int8Array.from(hits.sort((p, q) => p[0] - q[0]).map((h) => h[1])));
  }
  const out = { cells, lists, index: new Map(cells.map((c, k) => [ck(c), k])) };
  RAYS.set(id, out);
  return out;
}
const FACE_T = HARD.minVisFace * SAMPLES * SAMPLES;
function firstHitCounts(RL, filled) {
  const cnt = new Int32Array(RL.cells.length);
  for (const L of RL.lists) for (let t = 0; t < L.length; t++) if (filled[L[t]]) { cnt[L[t]]++; break; }
  return cnt;
}
const cellSetKey = (cells) => cells.map(ck).sort().join(';');
function memo(RL, tag, cells, fn) {
  const store = RL.memo || (RL.memo = new Map()), k = `${tag}|${cellSetKey(cells)}`;
  if (!store.has(k)) store.set(k, fn());
  return store.get(k);
}
const decidable = (RL, given) => memo(RL, 'd', given, () => decidableRaw(RL, given));
const allCubesShow = (RL, piece) => memo(RL, 's', piece, () => allCubesShowRaw(RL, piece));
function decidableRaw(RL, given) {
  const filled = new Uint8Array(RL.cells.length);
  for (const c of given) filled[RL.index.get(ck(c))] = 1;
  const base = firstHitCounts(RL, filled);
  for (let k = 0; k < RL.cells.length; k++) {
    if (filled[k]) { if (base[k] < FACE_T) return false; continue; }
    filled[k] = 1;
    const n = firstHitCounts(RL, filled)[k];
    filled[k] = 0;
    if (n < FACE_T) return false;
  }
  return true;
}
function allCubesShowRaw(RL, piece) {
  const filled = new Uint8Array(RL.cells.length);
  for (const c of piece) filled[RL.index.get(ck(c))] = 1;
  const cnt = firstHitCounts(RL, filled);
  return piece.every((c) => cnt[RL.index.get(ck(c))] >= FACE_T);
}

const SPLITS = new Map();
function splits(cfg) {
  const id = cfg.dims.join('x');
  if (SPLITS.has(id)) return SPLITS.get(id);
  const cells = blockCells(cfg.dims), N = cells.length, out = [];
  const [lo, hi] = sizeRange(cfg.dims);
  for (let mask = 1; mask < (1 << N) - 1; mask++) {
    let nA = 0; for (let k = 0; k < N; k++) nA += mask >> k & 1;
    if (nA < lo || nA > hi || N - nA < lo || N - nA > hi) continue;
    const A = [], B = [];
    for (let k = 0; k < N; k++) (mask >> k & 1 ? A : B).push(cells[k]);
    if (A.length < lo || A.length > hi || B.length < lo || B.length > hi) continue;
    if (!connected(A) || !connected(B) || isBox(A) || isBox(B)) continue;
    out.push({ given: A, gap: B });
  }
  SPLITS.set(id, out);
  return out;
}

const mirrorIn = (pts, dims) => pts.map(([x, y, z]) => [dims[0] - 1 - x, y, z]);
function rotY(pts, k) {
  let q = pts.map((c) => c.slice());
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) q = q.map(([x, y, z]) => [z, y, -x]);
  const m = [0, 1, 2].map((i) => Math.min(...q.map((c) => c[i])));
  return q.map((c) => c.map((v, i) => v - m[i]));
}
const boxDims = (pts) => [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])) + 1);
function extents(cells, yaw, pitch = HARD.pitch) {
  const { r, u } = viewBasis(yaw, pitch);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, z] of cells) for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) {
    const p = { x: x + dx, y: y + dy, z: z + dz }, a = dot(p, r), b = dot(p, u);
    x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
  }
  return [x1 - x0, y1 - y0];
}
const frameGap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const pieceShows = (cells, yaw, pitch = HARD.pitch) => allCubesShow(rayLists(pitch === HARD.pitch ? { dims: boxDims(cells), yaw } : { dims: boxDims(cells), yaw, pitch }), cells);

const turnFor = (yaw) => (yaw > 0 ? 90 : 270);
const MIRROR_TURNS = (yaw) => (yaw > 0 ? [180, 270] : [90, 180]);
const OTHER_TURNS = Object.freeze([0, 90, 180, 270]);
const ALL_TURNS = Object.freeze([0, 90, 180, 270]);
function bestFrameGap(src, turns, frame, yaw, pitch = HARD.pitch) {
  let best = Infinity;
  for (const t of turns) { const c = rotY(src, t / 90); if (pieceShows(c, yaw, pitch)) best = Math.min(best, frameGap(extents(c, yaw, pitch), frame)); }
  return best;
}
const layerKey = (pts) => { const n = []; for (const q of pts) n[q[1]] = (n[q[1]] || 0) + 1; return n.join(','); };
const columns = (pts) => new Set(pts.map((q) => q[0] + ',' + q[2])).size;

const bboxKey = (pts) => [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])) - Math.min(...pts.map((q) => q[i])) + 1).join('x');
function fitDistance(P, B) {
  const code = (x, y, z) => (x + 8) * 400 + (y + 8) * 20 + (z + 8);
  const bs = new Set(B.map((c) => code(c[0], c[1], c[2])));
  let best = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
    let o = 0;
    for (const c of P) if (bs.has(code(c[0] + dx, c[1] + dy, c[2] + dz))) o++;
    if (o > best) best = o;
  }
  return B.length - best;
}
const MIN_OTHER_DIST = 2;

function genRound(rng) {
  let cfg = null;
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (attempt % 300 === 0) cfg = rng.pick(CONFIGS);
    const RL = rayLists(cfg);
    const sp = rng.pick(splits(cfg));
    if (!decidable(RL, sp.given)) continue;
    const gap = sp.gap, bk = bboxKey(gap);
    const mir = mirrorIn(gap, cfg.dims);
    if (sameTurned(mir, gap)) continue;
    const turn = turnFor(cfg.yaw), fitCells = rotY(gap, turn / 90), frame = extents(fitCells, cfg.yaw);
    if (!pieceShows(fitCells, cfg.yaw)) continue;
    const drawAs = (src, turns) => {
      let best = null;
      for (const t of rng.shuffle(turns.slice())) {
        const cells = rotY(src, t / 90);
        if (!pieceShows(cells, cfg.yaw)) continue;
        const d = frameGap(extents(cells, cfg.yaw), frame);
        if (!best || d < best.d - 1e-9) best = { turn: t, cells, d };
      }
      return best && { turn: best.turn, cells: best.cells };
    };
    const mirDrawn = drawAs(mir, MIRROR_TURNS(cfg.yaw));
    if (!mirDrawn) continue;
    const picked = [gap, mir], chosen = [{ kind: 'mirror', src: mir, ...mirDrawn }];
    for (const other of rng.shuffle(splits(cfg))) {
      if (chosen.length >= 3) break;
      const Q = other.gap;
      if (Q.length !== gap.length || bboxKey(Q) !== bk || !decidable(RL, other.given)) continue;
      if (fitDistance(Q, gap) < MIN_OTHER_DIST || picked.some((P) => sameTurned(P, Q))) continue;
      if (layerKey(Q) !== layerKey(gap) || columns(Q) !== columns(gap)) continue;
      const d = drawAs(Q, OTHER_TURNS);
      if (!d) continue;
      chosen.push({ kind: 'other', src: Q, ...d }); picked.push(Q);
    }
    if (chosen.length !== 3) continue;
    const pieces = [{ kind: 'fit', src: gap, turn, cells: fitCells }, ...chosen]
      .map((c) => ({ kind: c.kind, src: c.src.map((q) => q.slice()), turn: c.turn, cells: c.cells.map((q) => q.slice()) }));
    const order = rng.shuffle([0, 1, 2, 3]);
    const round = {
      dims: cfg.dims.slice(), yaw: cfg.yaw, pitch: HARD.pitch,
      given: sp.given.map((c) => c.slice()),
      cands: order.map((i) => pieces[i]),
      answer: order.indexOf(0),
    };
    if (!roundProblems(round).length) return round;
  }
  throw new Error('cube_assembly_pick: could not build a round');
}

function capacity(src, turns, yaw) {
  const seen = new Set();
  for (const t of turns) { const c = rotY(src, t / 90); if (pieceShows(c, yaw)) seen.add(nkey(c)); }
  return seen.size;
}
const profileKey = (Q) => `${Q.length}|${bboxKey(Q)}|${layerKey(Q)}|${columns(Q)}`;
const GOOD3 = new Map();
function goodSplits3(cfg) {
  const id = `${cfg.dims.join('x')}|${cfg.yaw}`;
  if (GOOD3.has(id)) return GOOD3.get(id);
  const RL = rayLists(cfg), dec = splits(cfg).filter((s) => decidable(RL, s.given));
  const good = dec.filter((s) => !sameTurned(mirrorIn(s.gap, cfg.dims), s.gap)).map((s) => ({ ...s, cap: null, mcap: null }));
  const byProfile = new Map();
  for (const s of dec) { const k = profileKey(s.gap); if (!byProfile.has(k)) byProfile.set(k, []); byProfile.get(k).push(s.gap); }
  const out = { good, byProfile, others: new Map() };
  GOOD3.set(id, out);
  return out;
}
function otherHoles(cfg, gap) {
  const G = goodSplits3(cfg), key = nkey(gap);
  if (!G.others.has(key)) {
    const mir = mirrorIn(gap, cfg.dims), near = [], far = [];
    for (const Q of G.byProfile.get(profileKey(gap)) || []) {
      if (sameTurned(Q, gap) || sameTurned(Q, mir)) continue;
      const d = fitDistance(Q, gap);
      if (d < HARD3.minOtherDist) continue;
      (d === 1 ? near : far).push({ Q, cap: capacity(Q, TURNS3, cfg.yaw) });
    }
    G.others.set(key, { near, far });
  }
  return G.others.get(key);
}
function groupSizes(rng) {
  for (let t = 0; t < 100; t++) {
    const parts = [];
    let n = 0;
    while (n < HARD3.cands) { const s = Math.min(rng.int(1, HARD3.groupMax), HARD3.cands - n); parts.push(s); n += s; }
    if (parts.length >= 2 + HARD3.near) return parts;
  }
  return [2, 2, 2, 2, 1];
}
function genRound3(rng) {
  for (let draw = 0; draw < 60; draw++) {
    const sizes = groupSizes(rng), order = rng.shuffle([...sizes.keys()]);
    const fitG = order[0];
    const cfg = rng.pick(CONFIGS2), G = goodSplits3(cfg);
    const caps = (s) => {
      if (s.cap === null) { s.cap = capacity(s.gap, TURNS3, cfg.yaw); s.mcap = capacity(mirrorIn(s.gap, cfg.dims), MIRROR_TURNS(cfg.yaw), cfg.yaw); }
      return s;
    };
    for (let attempt = 0; attempt < 40; attempt++) {
      let sp = null;
      for (let t = 0; t < 400 && !sp; t++) { const s = caps(rng.pick(G.good)); if (s.cap >= sizes[fitG] && s.mcap >= 1) sp = s; }
      if (!sp) continue;
      const gap = sp.gap, mir = mirrorIn(gap, cfg.dims);
      const { near, far } = otherHoles(cfg, gap);
      const rest = rng.shuffle(order.slice(1));
      const mirG = rest.find((g) => sizes[g] <= sp.mcap);
      if (mirG === undefined) continue;
      const others = rest.filter((g) => g !== mirG).sort((a, b) => sizes[a] - sizes[b]);
      const nearG = others.slice(0, HARD3.near), farG = others.slice(HARD3.near);
      const picked = [gap, mir], solids = [];
      const choose = (list, n) => {
        for (const h of rng.shuffle(list)) {
          if (h.cap < n || picked.some((P) => sameTurned(P, h.Q))) continue;
          picked.push(h.Q); return h.Q;
        }
        return null;
      };
      let ok = true;
      for (const g of nearG) { const Q = choose(near, sizes[g]); if (!Q) { ok = false; break; } solids.push([Q, g]); }
      for (const g of farG) { if (!ok) break; const Q = choose([...far, ...near], sizes[g]); if (!Q) { ok = false; break; } solids.push([Q, g]); }
      if (!ok) continue;
      const pics = new Set(), cards = [];
      const copies = (src, turns, n, kind) => {
        let got = 0;
        for (const t of rng.shuffle(turns.slice())) {
          if (got === n) break;
          const cells = rotY(src, t / 90), k = nkey(cells);
          if (pics.has(k) || !pieceShows(cells, cfg.yaw)) continue;
          pics.add(k); cards.push({ kind, src, turn: t, cells }); got++;
        }
        return got === n;
      };
      if (!copies(gap, TURNS3, sizes[fitG], 'fit') || !copies(mir, MIRROR_TURNS(cfg.yaw), sizes[mirG], 'mirror')) continue;
      if (!solids.every(([Q, g]) => copies(Q, TURNS3, sizes[g], 'other'))) continue;
      const pieces = cards.map((c) => ({ kind: c.kind, src: c.src.map((q) => q.slice()), turn: c.turn, cells: c.cells.map((q) => q.slice()) }));
      const shuffled = rng.shuffle(pieces);
      const round = {
        dims: cfg.dims.slice(), yaw: cfg.yaw, pitch: HARD.pitch, given: sp.given.map((c) => c.slice()),
        cands: shuffled, answer: shuffled.map((c, i) => (c.kind === 'fit' ? i : -1)).filter((i) => i >= 0),
      };
      if (!roundProblems(round).length) return round;
    }
  }
  throw new Error('cube_assembly_pick: could not build a round');
}
export const _t3 = { CONFIGS2, goodSplits3, capacity, MIRROR_TURNS, otherHoles, nearHoles: (cfg, gap) => otherHoles(cfg, gap).near.map((h) => h.Q) };

let EXT_SPACE = null;
function extSpace() {
  if (EXT_SPACE) return EXT_SPACE;
  const out = [];
  for (const cfg of CONFIGS) {
    const RL = rayLists(cfg);
    for (const sp of splits(cfg)) {
      if (!decidable(RL, sp.given)) continue;
      const gap = sp.gap, mir = mirrorIn(gap, cfg.dims);
      if (sameTurned(mir, gap)) continue;
      const turn = turnFor(cfg.yaw), fitCells = rotY(gap, turn / 90);
      if (!pieceShows(fitCells, cfg.yaw)) continue;
      const frame = extents(fitCells, cfg.yaw);
      const bestTurn = (src, turns) => {
        let best = null;
        for (const t of turns) { const c = rotY(src, t / 90); if (!pieceShows(c, cfg.yaw)) continue; const d = frameGap(extents(c, cfg.yaw), frame); if (!best || d < best.d - 1e-9) best = { turn: t, cells: c, d }; }
        return best;
      };
      const mb = bestTurn(mir, MIRROR_TURNS(cfg.yaw));
      if (!mb) continue;
      const others = [];
      for (const o of splits(cfg)) {
        const Q = o.gap;
        if (Q.length !== gap.length || bboxKey(Q) !== bboxKey(gap) || layerKey(Q) !== layerKey(gap) || columns(Q) !== columns(gap)) continue;
        if (fitDistance(Q, gap) < MIN_OTHER_DIST || sameTurned(Q, gap) || sameTurned(Q, mir) || others.some((x) => sameTurned(x.src, Q)) || !decidable(RL, o.given)) continue;
        const b = bestTurn(Q, OTHER_TURNS);
        if (b) others.push({ src: Q, turn: b.turn, cells: b.cells });
      }
      const sets = [];
      for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) sets.push([i, j]);
      if (!sets.length) continue;
      out.push({ id: comboId(cfg, sp.given), cfg, given: sp.given, gap, fit: { turn, cells: fitCells }, mirror: { src: mir, turn: mb.turn, cells: mb.cells }, others, sets });
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const split = COMBO_SPLIT(out.map((c) => c.id));
  for (const c of out) c.split = split(c.id);
  EXT_SPACE = out;
  return out;
}
const EXT_LIST = new Map();
function extList(split) {
  if (!EXT_LIST.has(split)) {
    const space = extSpace().filter((c) => c.split === split && !EVAL_COMBOS.has(c.id)), N = space.length, list = [];
    const perm = space.map((_, i) => space[nthOf(`cube_assembly_pick|${split}|combo`, i + 1, N)]);
    for (let lap = 0; list.length < 4000; lap++) {
      const more = perm.filter((c) => c.sets.length > lap);
      if (!more.length) break;
      for (const c of more) list.push({ c, set: (hash32(c.id) + lap) % c.sets.length });
    }
    EXT_LIST.set(split, list);
  }
  return EXT_LIST.get(split);
}
function genRoundExt(rng, split, n) {
  const list = extList(split), nn = Math.max(1, Number(n) || 1), { c, set: s0 } = list[(nn - 1) % list.length];
  const order = rng.shuffle([0, 1, 2, 3]);
  for (let t = 0; t < c.sets.length; t++) {
    const set = c.sets[(s0 + t) % c.sets.length];
    const pieces = [{ kind: 'fit', src: c.gap, ...c.fit }, { kind: 'mirror', ...c.mirror }, ...set.map((i) => ({ kind: 'other', ...c.others[i] }))]
      .map((p) => ({ kind: p.kind, src: p.src.map((q) => q.slice()), turn: p.turn, cells: p.cells.map((q) => q.slice()) }));
    const round = { dims: c.cfg.dims.slice(), yaw: c.cfg.yaw, pitch: HARD.pitch, given: c.given.map((q) => q.slice()), cands: order.map((i) => pieces[i]), answer: order.indexOf(0) };
    if (!roundProblems(round).length) return round;
  }
  throw new Error('cube_assembly_pick: no valid distractor set for ' + c.id);
}

export function semanticKey(m) {
  const R = m.rounds[0];
  const cands = R.cands.map((c) => nkey(c.cells)).sort();
  const fit = answerSet(R).map((i) => nkey(R.cands[i].cells)).sort().join('+');
  return `cube_assembly_pick|${R.dims.join('x')}|${R.yaw}|${R.pitch}|${R.given.map((q) => q.join(',')).sort().join(';')}|${cands.join('/')}|fit:${fit}`;
}

function roundProblems3(R) {
  const cfg = CONFIGS2.find((c) => c.yaw === R?.yaw && ck(c.dims) === ck(R?.dims || []));
  if (!cfg || R.pitch !== pitchOf(cfg)) return ['config'];
  const [sLo, sHi] = sizeRange(cfg.dims), RL = rayLists(cfg), N = RL.cells.length;
  const inBlock = (c) => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger) && RL.index.has(ck(c));
  const out = [];
  if (!Array.isArray(R.given) || !R.given.every(inBlock) || new Set(R.given.map(ck)).size !== R.given.length) return ['given-cells'];
  const gap = RL.cells.filter((c) => !R.given.some((g) => ck(g) === ck(c)));
  if (R.given.length < sLo || R.given.length > sHi || gap.length < sLo || gap.length > sHi) out.push('half-sizes');
  if (R.given.length + gap.length !== N || !connected(R.given) || !connected(gap) || isBox(R.given) || isBox(gap)) out.push('halves');
  if (!decidable(RL, R.given)) out.push('hole-not-fully-drawn');
  const mir = mirrorIn(gap, cfg.dims);
  if (sameTurned(mir, gap)) out.push('half-not-chiral');
  if (!Array.isArray(R.cands) || R.cands.length !== HARD3.cands || !Array.isArray(R.answer)) return [...out, 'cands'];
  for (const c of R.cands) {
    if (!c || !Array.isArray(c.src) || c.src.length !== gap.length || !c.src.every(inBlock) || new Set(c.src.map(ck)).size !== c.src.length || !connected(c.src)) return [...out, 'cand-src'];
    if (!TURNS3.includes(c.turn) || !Array.isArray(c.cells) || c.cells.length !== c.src.length || nkey(c.cells) !== nkey(rotY(c.src, c.turn / 90)) || c.cells.some((q) => q.some((v) => v < 0))) return [...out, 'cand-turn'];
  }
  if (!R.cands.every((c) => pieceShows(c.cells, cfg.yaw))) out.push('cand-cube-hidden');
  if (new Set(R.cands.map((c) => nkey(c.cells))).size !== R.cands.length) out.push('duplicate-picture');
  const fits = R.cands.map((c) => sameTurned(c.cells, gap)).map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const ans = R.answer.slice().sort((a, b) => a - b);
  if (fits.length < HARD3.fits[0] || fits.length > HARD3.fits[1] || ans.length !== fits.length || ans.some((x, k) => x !== fits[k])) out.push('answer-set');
  const groups = new Map();
  R.cands.forEach((c, i) => {
    if (fits.includes(i)) { if (nkey(c.src) !== nkey(gap)) out.push('fit-src'); return; }
    const k = nkey(c.src);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  });
  if (fits.length > HARD3.groupMax || [...groups.values()].some((g) => g.length > HARD3.groupMax)) out.push('group-size');
  const srcs = [...groups.values()].map((g) => g[0].src);
  for (let i = 0; i < srcs.length; i++) for (let j = i + 1; j < srcs.length; j++) if (sameTurned(srcs[i], srcs[j])) out.push('same-solid-two-groups');
  let mirrors = 0, near = 0;
  for (const g of groups.values()) {
    const P = g[0].src;
    if (nkey(P) === nkey(mir)) {
      mirrors++;
      if (g.some((c) => !MIRROR_TURNS(cfg.yaw).includes(c.turn))) out.push('mirror-turn');
      continue;
    }
    if (sameTurned(P, gap) || sameTurned(P, mir)) { out.push('wrong-solid-is-fit-or-mirror'); continue; }
    const dist = fitDistance(P, gap);
    if (bboxKey(P) !== bboxKey(gap) || dist < HARD3.minOtherDist) out.push('distractor-too-close');
    if (dist === 1) near++;
    if (layerKey(P) !== layerKey(gap) || columns(P) !== columns(gap)) out.push('distractor-profile');
    const rest = RL.cells.filter((q) => !P.some((p) => ck(p) === ck(q)));
    if (!connected(rest) || isBox(rest) || isBox(P) || !decidable(RL, rest)) out.push('distractor-not-a-valid-hole');
  }
  if (mirrors !== 1) out.push('mirror-distractor');
  if (near < HARD3.near) out.push('near-distractors');
  return [...new Set(out)];
}
function roundProblems(R) {
  if (isCfg2(R?.dims)) return roundProblems3(R);
  const cfg = CONFIGS.find((c) => c.yaw === R?.yaw && ck(c.dims) === ck(R?.dims || []));
  if (!cfg || R.pitch !== pitchOf(cfg)) return ['config'];
  const NC = nCands(R), minOther = MIN_OTHER_DIST;
  const pitch = pitchOf(cfg), [sLo, sHi] = sizeRange(cfg.dims);
  const RL = rayLists(cfg), N = RL.cells.length;
  const inBlock = (c) => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger) && RL.index.has(ck(c));
  const out = [];
  if (!Array.isArray(R.given) || !R.given.every(inBlock) || new Set(R.given.map(ck)).size !== R.given.length) return ['given-cells'];
  const gap = RL.cells.filter((c) => !R.given.some((g) => ck(g) === ck(c)));
  if (R.given.length < sLo || R.given.length > sHi || gap.length < sLo || gap.length > sHi) out.push('half-sizes');
  if (R.given.length + gap.length !== N || !connected(R.given) || !connected(gap) || isBox(R.given) || isBox(gap)) out.push('halves');
  if (!decidable(RL, R.given)) out.push('hole-not-fully-drawn');
  const mir = mirrorIn(gap, cfg.dims);
  if (sameTurned(mir, gap)) out.push('half-not-chiral');
  if (!Array.isArray(R.cands) || R.cands.length !== NC || !Number.isInteger(R.answer) || R.answer < 0 || R.answer >= NC) return [...out, 'cands'];
  for (const c of R.cands) {
    if (!c || !Array.isArray(c.src) || c.src.length !== gap.length || !c.src.every(inBlock) || new Set(c.src.map(ck)).size !== c.src.length || !connected(c.src)) return [...out, 'cand-src'];
    if (!ALL_TURNS.includes(c.turn) || !Array.isArray(c.cells) || c.cells.length !== c.src.length || nkey(c.cells) !== nkey(rotY(c.src, c.turn / 90)) || c.cells.some((q) => q.some((v) => v < 0))) return [...out, 'cand-turn'];
  }
  const cs = R.cands.map((c) => c.cells);
  if (!cs.every((P) => pieceShows(P, cfg.yaw, pitch))) out.push('cand-cube-hidden');
  const fits = cs.map((P) => sameTurned(P, gap));
  if (fits.filter(Boolean).length !== 1 || !fits[R.answer]) out.push('unique-fit');
  const ans = R.cands[R.answer];
  if (nkey(ans.src) !== nkey(gap) || ans.turn !== turnFor(cfg.yaw)) out.push('answer-turn');
  if (nkey(ans.cells) === nkey(gap)) out.push('answer-drawn-unturned');
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (sameTurned(cs[i], cs[j])) out.push('duplicate-cands');
  const frame = extents(ans.cells, cfg.yaw, pitch);
  let mirrors = 0;
  R.cands.forEach((c, i) => {
    if (i === R.answer) return;
    const isMirror = nkey(c.src) === nkey(mir);
    const turns = isMirror ? MIRROR_TURNS(cfg.yaw) : OTHER_TURNS;
    if (!turns.includes(c.turn) || frameGap(extents(c.cells, cfg.yaw, pitch), frame) > bestFrameGap(c.src, turns, frame, cfg.yaw, pitch) + 1e-9) out.push('distractor-turn');
    if (isMirror) { mirrors++; return; }
    const P = c.src;
    if (bboxKey(P) !== bboxKey(gap) || fitDistance(P, gap) < minOther) out.push('distractor-too-close');
    if (layerKey(P) !== layerKey(gap) || columns(P) !== columns(gap)) out.push('distractor-profile');
    const rest = RL.cells.filter((q) => !P.some((p) => ck(p) === ck(q)));
    if (!connected(rest) || isBox(rest) || isBox(P) || !decidable(RL, rest)) out.push('distractor-not-a-valid-hole');
  });
  if (mirrors !== 1) out.push('mirror-distractor');
  return [...new Set(out)];
}

export const _audit = { rayLists, firstHitCounts, blockCells, ck, CONFIGS, rotY, mirrorIn, sameTurned, nkey, boxDims, extents, turnFor, layerKey, columns };

export function gate(m) {
  try {
    const B = m?.hv === 3 ? BOARD3 : BOARD;
    if (m?.task !== 'cube_assembly_pick' || m.board?.w !== B.w || m.board?.h !== B.h) return false;
    if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
    if ((m.hv === 3) !== isCfg2(m.rounds[0]?.dims)) return false;
    if (m.hv === 3 && (m.layout !== undefined || m.panel?.panelWidth !== BOARD3.w + 20 || m.panel?.boardH !== BOARD3.h + 10)) return false;
    if (m.layout !== undefined && !LAYOUTS.includes(m.layout)) return false;
    return m.rounds.every((R) => roundProblems(R).length === 0);
  } catch { return false; }
}

const LAYOUTS = ['row', 'top', 'right', 'left'];
const LAYOUT_SPLIT = splitIds('cube_assembly_pick|layout', LAYOUTS, 2);
function viewRect(m) {
  if (m?.hv === 3) return VIEW3;
  const L = m?.layout;
  if (L === 'top') return { x: 0, y: BOARD.h - VIEW.h, w: BOARD.w, h: VIEW.h };
  if (L === 'right') return { x: 0, y: 0, w: 180, h: BOARD.h };
  if (L === 'left') return { x: BOARD.w - 180, y: 0, w: 180, h: BOARD.h };
  return VIEW;
}
const cardBox = (R) => (isCfg2(R?.dims) ? CARD3 : CARD);
function cardRect(i, m) {
  const L = m?.layout;
  if (m?.hv === 3) {
    const x0 = BOARD3.w - 6 - 3 * CARD3.w - 2 * CARD3.gap, y0 = (BOARD3.h - 3 * CARD3.h - 2 * CARD3.gap) / 2;
    return { x: x0 + (i % 3) * (CARD3.w + CARD3.gap), y: y0 + Math.floor(i / 3) * (CARD3.h + CARD3.gap), w: CARD3.w, h: CARD3.h };
  }
  if (L === 'top') return { x: CARD.x0 + i * (CARD.w + CARD.gap), y: 4, w: CARD.w, h: CARD.h };
  if (L === 'right' || L === 'left') return { x: (L === 'right' ? 184 : 4) + (i % 2) * (CARD.w + CARD.gap), y: 40 + (i >> 1) * (CARD.h + 8), w: CARD.w, h: CARD.h };
  return { x: CARD.x0 + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h };
}

function fitCamera(yaw, pts, px, w, h, pitch = HARD.pitch) {
  const dist = 3000, k = px / U, fov = k * dist / Math.cos(pitch * Math.PI / 180);
  const probe = makeCamera({ yaw, pitch, dist, cx: 0, cy: 0, fov });
  const ps = pts.map(probe.project);
  const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x));
  const y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
  return makeCamera({ yaw, pitch, dist, cx: w / 2 - (x0 + x1) / 2, cy: h / 2 - (y0 + y1) / 2, fov });
}
const world = (cell, dims, lift = 0) => ({ x: (cell[0] + 0.5 - dims[0] / 2) * U, y: (cell[1] - lift) * U, z: (cell[2] + 0.5 - dims[2] / 2) * U });
function cubeCorners(cells, dims, lift = 0) {
  const out = [];
  for (const c of cells) {
    const p = world(c, dims, lift);
    for (const dx of [-0.5, 0.5]) for (const dy of [0, 1]) for (const dz of [-0.5, 0.5]) out.push({ x: p.x + dx * U, y: p.y + dy * U, z: p.z + dz * U });
  }
  return out;
}
const LIGHT = makeLight({ dir: { x: -0.45, y: 0.85, z: 0.4 }, ambient: 0.56 });

function paintCubes(g, cam, cells, dims, color, lift = 0, light = LIGHT, skin = null) {
  const sc = makeScene(g, cam, { light, fog: null, width: 400, height: 400 });
  for (const c of cells) {
    const p = world(c, dims, lift);
    if (skin) sc.box({ x: p.x, z: p.z, w: U, d: U, h: U, y: p.y, color, round: 0, shadowY: p.y === 0 ? 0 : null, skin });
    else sc.box({ x: p.x, z: p.z, w: U, d: U, h: U, y: p.y, color, round: 0, shadowY: p.y === 0 ? 0 : null });
  }
  sc.render({ background: false });
}

function drawEdges(g, cam, dims, front, ink = null) {
  const [X, Y, Z] = dims, hx = X * U / 2, hz = Z * U / 2, H = Y * U;
  const P = (sx, sy, sz) => cam.project({ x: sx * hx, y: sy ? H : 0, z: sz * hz });
  const faces = [
    { n: { x: 1, y: 0, z: 0 }, c: [[1, 0, -1], [1, 1, -1], [1, 1, 1], [1, 0, 1]] },
    { n: { x: -1, y: 0, z: 0 }, c: [[-1, 0, -1], [-1, 1, -1], [-1, 1, 1], [-1, 0, 1]] },
    { n: { x: 0, y: 1, z: 0 }, c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { n: { x: 0, y: -1, z: 0 }, c: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]] },
    { n: { x: 0, y: 0, z: 1 }, c: [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: { x: 0, y: 0, z: -1 }, c: [[-1, 0, -1], [1, 0, -1], [1, 1, -1], [-1, 1, -1]] },
  ];
  const edges = new Map();
  for (const fc of faces) {
    const visible = dot(fc.n, cam.f) < 0;
    for (let i = 0; i < 4; i++) {
      const a = fc.c[i], b = fc.c[(i + 1) % 4], id = [ck(a), ck(b)].sort().join('|');
      const e = edges.get(id) || { a, b, vis: false };
      e.vis = e.vis || visible; edges.set(id, e);
    }
  }
  g.save();
  g.lineCap = 'round';
  for (const e of edges.values()) {
    if (e.vis !== front) continue;
    const p = P(...e.a), q = P(...e.b);
    g.setLineDash(front ? [6, 4] : [3, 4]);
    g.strokeStyle = ink ? (front ? ink[0] : ink[1]) : front ? 'rgba(38,52,68,.62)' : 'rgba(80,96,112,.35)';
    g.lineWidth = front ? 1.6 : 1.2;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  }
  g.restore();
}

function renderMain(R, q, V = VIEW) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(V.w * q); cv.height = Math.round(V.h * q);
  const g = cv.getContext('2d');
  g.scale(q, q);
  const all = blockCells(R.dims), dims = R.dims;
  let px = MAIN_PX, cw = V.w, ch = V.h;
  if (isCfg2(dims)) {
    const probe = fitCamera(R.yaw, cubeCorners(all, dims), 1, 0, 0), ps = cubeCorners(all, dims).map(probe.project);
    const bw = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)), bh = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    px = Math.min(MAIN_PX, (V.w - 16) / bw, (V.h - 60) / bh);
    ch = V.h + 44;
  }
  const cam = fitCamera(R.yaw, cubeCorners(all, dims), px, cw, ch);
  const [X, , Z] = dims, pad = 0.14 * U;
  const plate = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => cam.project({ x: sx * (X * U / 2 + pad), y: 0, z: sz * (Z * U / 2 + pad) }));
  g.beginPath(); plate.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  g.fillStyle = COLORS.plate; g.fill();
  g.strokeStyle = 'rgba(90,104,118,.45)'; g.lineWidth = 1;
  for (let x = 0; x <= X; x++) { const a = cam.project({ x: (x - X / 2) * U, y: 0, z: -Z * U / 2 }), b = cam.project({ x: (x - X / 2) * U, y: 0, z: Z * U / 2 }); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  for (let z = 0; z <= Z; z++) { const a = cam.project({ x: -X * U / 2, y: 0, z: (z - Z / 2) * U }), b = cam.project({ x: X * U / 2, y: 0, z: (z - Z / 2) * U }); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  drawEdges(g, cam, dims, false);
  paintCubes(g, cam, R.given, dims, COLORS.given);
  drawEdges(g, cam, dims, true);
  return cv;
}

function cardScale(R) {
  let px = CARD_PX;
  const B = cardBox(R);
  for (const c of R.cands) {
    const lift = Math.min(...c.cells.map((q) => q[1]));
    const cam = fitCamera(R.yaw, cubeCorners(c.cells, R.dims, lift), 1, 0, 0, R.pitch);
    const ps = cubeCorners(c.cells, R.dims, lift).map(cam.project);
    const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    px = Math.min(px, (B.w - 12) / w, (B.h - 20) / h);
  }
  return px;
}
function renderCard(R, cells, q, px, look = null) {
  const B = cardBox(R);
  const cv = document.createElement('canvas');
  cv.width = Math.round(B.w * q); cv.height = Math.round((B.h - 6) * q);
  const g = cv.getContext('2d');
  g.scale(q, q);
  const lift = Math.min(...cells.map((c) => c[1]));
  const cam = fitCamera(R.yaw, cubeCorners(cells, R.dims, lift), px, B.w, B.h - 6, R.pitch);
  if (look) paintCubes(g, cam, cells, R.dims, look.piece.base, lift, look.light, look.piece.skin);
  else paintCubes(g, cam, cells, R.dims, COLORS.cand, lift);
  return cv;
}

const SURF_USES = ['wood', 'floor', 'stone', 'fabric', 'terrain'];
const HALF_FAMS = ['wood', 'plastic', 'metal', 'stone', 'fabric', 'concrete'];
const PIECE_FAMS = ['wood', 'stone', 'metal', 'plastic', 'concrete'];
const PIECE_PLASTIC = ['#d9773a', '#d6a93a', '#bf4a3c', '#4f9658', '#8a6a4a', '#9a9d55'];
const BLUE_HUE = [[231, 45]];
async function styleLook(style) {
  const rnd = style.rand;
  const surfaces = style.pool('tex', (t) => SURF_USES.includes(t.use));
  const SP = (name, items) => LK.splitPool(style, `cube_assembly_pick|${name}`, items);
  const halfFams = SP('half', HALF_FAMS), pieceFams = SP('piece', PIECE_FAMS), plastics = SP('plastic', PIECE_PLASTIC), rooms = SP('room', ['open', 'wall', 'corner', 'side']);
  const [si, hf, pf] = style.primaryCombo('surface-half-piece', [surfaces.length, halfFams.length, pieceFams.length]);
  const surf = surfaces[si], halfFam = halfFams[hf], pieceFam = pieceFams[pf];
  style.note(`tex:${surf.id}`); style.note(`half:${halfFam}`); style.note(`piece:${pieceFam}`);
  const hd = style.pick('hdri');
  const famItem = (fam) => { const pool = LK.familyPool(style, fam); return pool.length ? LK.pickFrom(pool, rnd()) : null; };
  const halfItem = famItem(halfFam), pieceItem = famItem(pieceFam);
  const plateItem = LK.pickFrom(style.pool('tex', (t) => ['wood', 'stone', 'floor', 'metal'].includes(t.use) && t.id !== surf.id), rnd());
  if (halfItem) style.note(`tex:${halfItem.id}`); if (pieceItem) style.note(`tex:${pieceItem.id}`); style.note(`tex:${plateItem.id}`);
  const [Ts, Th, Tp, Tb] = await Promise.all([LK.loadTex(surf), halfItem ? LK.loadTex(halfItem) : null, pieceItem ? LK.loadTex(pieceItem) : null, LK.loadTex(plateItem)]);
  const tints = LK.lightTints(hd);
  const light = makeLight({ dir: { x: -0.45, y: 0.85, z: 0.4 }, ambient: 0.5 + 0.12 * rnd(), warm: tints.warm, cool: tints.cool });
  const dark = rnd() < 0.5, sLum = dark ? 0.045 + 0.1 * rnd() : 0.42 + 0.22 * rnd();
  const sMean = S3k(Ts.mean, sLum);
  const surfSw = LK.swatch(Ts, { tint: sMean, k: 0.6 });
  const pLum = dark ? 0.26 + 0.14 * rnd() : 0.1 + 0.08 * rnd();
  const plateSw = LK.swatch(Tb, { tint: S3k(Tb.mean, pLum), k: 0.55 });
  const ink = dark ? ['rgba(244,242,236,.85)', 'rgba(232,230,224,.45)'] : ['rgba(30,36,44,.7)', 'rgba(50,58,70,.4)'];
  const gridInk = pLum > 0.22 ? 'rgba(30,34,40,.42)' : 'rgba(240,238,232,.42)';
  const halfSkin = matSkin(halfFam, Th, rnd);
  let pieceBase;
  if (pieceFam === 'plastic' || !Tp) pieceBase = plastics[Math.floor(rnd() * plastics.length)];
  else pieceBase = LK.hexOf(S3k(Tp.mean, 0.13 + 0.14 * rnd(), pieceFam === 'metal' ? 0.25 : 0.55));
  const pieceSkin = matSkin(pieceFam, Tp, rnd);
  const room = rooms[Math.floor(rnd() * rooms.length)];
  let wallSw = null, sideSw = null;
  if (room !== 'open') {
    const wallItem = LK.pickFrom(style.pool('tex', (t) => ['wall', 'wood', 'stone', 'roof', 'metal'].includes(t.use) && t.id !== surf.id), rnd());
    style.note(`tex:${wallItem.id}`);
    const Tw = await LK.loadTex(wallItem);
    const wLum = dark ? 0.05 + 0.12 * rnd() : 0.36 + 0.24 * rnd();
    wallSw = LK.swatch(Tw, { tint: S3k(Tw.mean, wLum), k: 0.55 });
    sideSw = LK.swatch(Tw, { tint: S3k(Tw.mean, wLum * 0.85), k: 0.55 });
  }
  style.note(`light:${hd.id}`); style.note(`surface:${dark ? 'dark' : 'light'}`); style.note(`room:${room}`);
  return { light, surfSw, plateSw, ink, gridInk, dark, half: { base: COLORS.given, skin: halfSkin }, piece: { base: pieceBase, skin: pieceSkin },
    rot: rnd() * Math.PI * 2, salt: Math.floor(rnd() * 1e6), room, wallSw, sideSw, wallGap: 0.5 + 2.5 * rnd(), sideGap: 0.5 + 2.5 * rnd(),
    zoom: 0.8 + 0.2 * rnd(), shift: rnd(), lift: rnd() };
}
function S3k(c, L, maxSat = 0.45) {
  const k = L / Math.max(1e-6, LK.lum(c));
  const v = c.map((x) => x * k);
  return LK.lum(v) > 0 ? keepOffBlue(v, maxSat) : [L, L, L];
}
function keepOffBlue(c, maxSat) {
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
  if (d < 1e-9) return c;
  let h; if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / d + 2; else h = (c[0] - c[1]) / d + 4;
  h = (h * 60 + 360) % 360;
  const near = BLUE_HUE.some(([nh, w]) => Math.min(Math.abs(h - nh), 360 - Math.abs(h - nh)) < w);
  const L = LK.lum(c), sat = d / mx, cap = near ? 0.08 : maxSat;
  if (sat <= cap) return c;
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const t = (lo + hi) / 2, m = c.map((v) => L + (v - L) * t), M = Math.max(...m), N = Math.min(...m); if ((M - N) / M > cap) hi = t; else lo = t; }
  return c.map((v) => L + (v - L) * lo);
}
function matSkin(fam, T, rnd) {
  const F = LK.FAMILIES[fam];
  if (fam === 'plastic' || !T) return LK.overlaySkin(null, { alpha: 0, extra: LK.sheen(0.24) });
  const det = LK.detail(T, { k: fam === 'metal' ? 0.7 : fam === 'fabric' ? 0.35 : 0.5, lo: 0.22, hi: 0.78 });
  return LK.overlaySkin(det, { unit: U * (2.4 + 1.6 * rnd()), alpha: fam === 'fabric' ? 0.7 : 0.85, salt: fam, extra: F.sheen > 0 ? LK.sheen(F.sheen) : null });
}

function renderMainStyled(R, q, look, VIEW) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(VIEW.w * q); cv.height = Math.round(VIEW.h * q);
  const g = cv.getContext('2d');
  g.scale(q, q);
  const all = blockCells(R.dims), dims = R.dims, pitch = R.pitch ?? HARD.pitch;
  const probe = fitCamera(R.yaw, cubeCorners(all, dims), 1, 0, 0, pitch), ps = cubeCorners(all, dims).map(probe.project);
  const bw = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)), bh = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
  const px = Math.min(MAIN_PX, (VIEW.w - 20) / bw, (VIEW.h - 30) / bh);
  const W0 = bw * px, H0 = bh * px;
  let x0, top;
  if (VIEW.w >= 300) {
    const yRoom = Math.max(0, (VIEW.h - 16 - H0) / 2);
    top = (VIEW.h - H0) / 2 + (look.lift - 0.5) * 2 * yRoom;
    const xLo = top < 42 ? 130 : 10;
    x0 = xLo + Math.max(0, VIEW.w - 10 - xLo - W0) * look.shift;
  } else {
    top = 44 + Math.max(0, VIEW.h - 10 - 44 - H0) * look.lift;
    x0 = (VIEW.w - W0) / 2 + (look.shift - 0.5) * Math.max(0, VIEW.w - 12 - W0);
  }
  const dy = top - (VIEW.h - H0) / 2;
  const cam = fitCamera(R.yaw, cubeCorners(all, dims), px, 2 * (x0 + W0 / 2), VIEW.h + 2 * dy, pitch);
  const T = 0.16 * U;
  g.fillStyle = LK.planePattern(g, cam, look.surfSw, { Y: -T, unit: 3.2 * U, rot: look.rot, ox: look.salt % 997, oz: look.salt % 631 });
  g.fillRect(0, 0, VIEW.w, VIEW.h);
  const up = LK.faceShade(look.light, { x: 0, y: 1, z: 0 });
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${up.map((v) => Math.round(255 * Math.min(1, v))).join(',')})`; g.fillRect(0, 0, VIEW.w, VIEW.h);
  g.restore();
  const [X0, , Z0] = dims;
  if (look.room !== 'open') {
    const far = R.yaw > 0 ? -1 : 1;
    const zW = -(Z0 * U / 2 + 0.14 * U + look.wallGap * U), xS = far * (X0 * U / 2 + 0.14 * U + look.sideGap * U), BIG = 40 * U, HT = 30 * U;
    const xA = look.room === 'corner' ? xS : -far * BIG, xB = far * BIG, back = look.room !== 'side';
    const quad = (pts, sw, n) => LK.texturedFace(g, pts.map(cam.project), pts, sw, LK.faceShade(look.light, n), { unit: 3 * U, salt: 'wall' });
    if (back) quad([{ x: Math.min(xA, xB), y: -T, z: zW }, { x: Math.max(xA, xB), y: -T, z: zW }, { x: Math.max(xA, xB), y: HT, z: zW }, { x: Math.min(xA, xB), y: HT, z: zW }], look.wallSw, { x: 0, y: 0, z: 1 });
    if (look.room === 'corner' || look.room === 'side') { const z0 = back ? zW : -BIG; quad([{ x: xS, y: -T, z: z0 }, { x: xS, y: -T, z: BIG }, { x: xS, y: HT, z: BIG }, { x: xS, y: HT, z: z0 }], look.sideSw, { x: -far, y: 0, z: 0 }); }
    const a = back ? cam.project({ x: -BIG, y: -T, z: zW }) : cam.project({ x: xS, y: -T, z: -BIG }), b = back ? cam.project({ x: BIG, y: -T, z: zW }) : cam.project({ x: xS, y: -T, z: BIG });
    g.save(); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
  }
  const vg = g.createRadialGradient(VIEW.w / 2, VIEW.h * 0.45, 40, VIEW.w / 2, VIEW.h * 0.45, VIEW.w * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = vg; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const [X, , Z] = dims, pad = 0.14 * U, hx = X * U / 2 + pad, hz = Z * U / 2 + pad;
  const corner = (sx, sz, y) => ({ x: sx * hx, y, z: sz * hz });
  const L = look.light.dir, drop = (p) => ({ x: p.x - L.x * (p.y + T) / L.y, y: -T, z: p.z - L.z * (p.y + T) / L.y });
  const rim = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const sh = rim.map(([a, b]) => cam.project(drop(corner(a, b, 0))));
  const cx0 = sh.reduce((t, p) => t + p.x, 0) / 4, cy0 = sh.reduce((t, p) => t + p.y, 0) / 4;
  for (const [k, al] of [[1.06, 0.12], [1.0, 0.16], [0.92, 0.14]]) {
    g.beginPath(); sh.forEach((p, i) => { const x = cx0 + (p.x - cx0) * k, y = cy0 + (p.y - cy0) * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
    g.fillStyle = `rgba(20,18,16,${al})`; g.fill();
  }
  for (const [n, a, b] of [[{ x: 1, y: 0, z: 0 }, [1, -1], [1, 1]], [{ x: -1, y: 0, z: 0 }, [-1, 1], [-1, -1]], [{ x: 0, y: 0, z: 1 }, [1, 1], [-1, 1]], [{ x: 0, y: 0, z: -1 }, [-1, -1], [1, -1]]]) {
    if (dot(n, cam.f) >= 0) continue;
    const W = [corner(a[0], a[1], 0), corner(b[0], b[1], 0), corner(b[0], b[1], -T), corner(a[0], a[1], -T)];
    LK.texturedFace(g, W.map(cam.project), W, look.plateSw, LK.faceShade(look.light, n), { unit: 2.5 * U, salt: 'side' });
  }
  const topW = rim.map(([a, b]) => corner(a, b, 0));
  LK.texturedFace(g, topW.map(cam.project), topW, look.plateSw, up, { unit: 2.5 * U, salt: 'top' });
  g.strokeStyle = look.gridInk; g.lineWidth = 1;
  for (let x = 0; x <= X; x++) { const a = cam.project({ x: (x - X / 2) * U, y: 0, z: -Z * U / 2 }), b = cam.project({ x: (x - X / 2) * U, y: 0, z: Z * U / 2 }); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  for (let z = 0; z <= Z; z++) { const a = cam.project({ x: -X * U / 2, y: 0, z: (z - Z / 2) * U }), b = cam.project({ x: X * U / 2, y: 0, z: (z - Z / 2) * U }); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  drawEdges(g, cam, dims, false, look.ink);
  paintCubes(g, cam, R.given, dims, look.half.base, 0, look.light, look.half.skin);
  drawEdges(g, cam, dims, true, look.ink);
  return cv;
}

const contextScale = (g) => { try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.hypot(t.a, t.b))); } catch { return 2; } };

const task = {
  meta: {
    name: 'cube_assembly_pick', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'toggle', cand: '0..8 (orange pieces, 3x3 grid, left to right, top row first); tapping a piece selects it, tapping it again clears it; select every piece that completes the block' }],
    promptHuman: 'Which pieces fill the rest of the block?',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) {
      const rounds = [genRoundExt(rng, knobs.ext, knobs.n ?? 1)];
      return { task: 'cube_assembly_pick', board: { ...BOARD }, layout: rng.pick(LAYOUTS.filter((l) => LAYOUT_SPLIT(l) === knobs.ext)), rounds };
    }
    return { task: 'cube_assembly_pick', board: { ...BOARD3 }, panel: { panelWidth: BOARD3.w + 20, boardH: BOARD3.h + 10 }, hv: 3, rounds: [genRound3(rng)] };
  },

  init(m) { return { sel: new Array(nCands(m?.rounds?.[0])).fill(false) }; },

  applyAction(state, a, m) {
    const op = m?.hv === 3 ? 'toggle' : 'pick';
    if (a?.op !== op) return { ok: false, reason: 'bad-op' };
    if (!Number.isInteger(a.cand) || a.cand < 0 || a.cand >= state.sel.length) return { ok: false, reason: 'bad-cand' };
    if (op === 'pick') { state.sel.fill(false); state.sel[a.cand] = true; } else state.sel[a.cand] = !state.sel[a.cand];
    return { ok: true };
  },

  verify(state, m) {
    const ans = new Set(answerSet(m.rounds[0]));
    let wrong = 0, picked = 0;
    state.sel.forEach((v, i) => { if (v) picked++; if (v !== ans.has(i)) wrong++; });
    const success = wrong === 0;
    return { success, partial: 1 - wrong / state.sel.length, error: wrong, detail: { answered: picked > 0 ? 1 : 0, selected: picked } };
  },

  oracle(m) {
    return m.hv === 3 ? answerSet(m.rounds[0]).map((cand) => ({ op: 'toggle', cand })) : [{ op: 'pick', cand: m.rounds[0].answer }];
  },

  randomPolicy(m, rnd) {
    const n = nCands(m.rounds[0]);
    if (m.hv !== 3) return [{ op: 'pick', cand: Math.floor(rnd() * n) }];
    const k = HARD3.fits[0] + Math.floor(rnd() * (HARD3.fits[1] - HARD3.fits[0] + 1));
    const ids = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, k).map((cand) => ({ op: 'toggle', cand }));
  },

  gate,

  async mount(env) {
    env.assets.cap = null;
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const m = env?.manifest, R = m?.rounds?.[0];
    if (m?.hv === 3) { drawPromptText(g, r, 'Click every piece that completes the block', 'One or more fit; each piece is shown turned about the vertical'); return; }
    const side = R && R.yaw < 0 ? 'right' : 'left';
    drawPromptText(g, r, 'Click the piece that completes the block', `The pieces are turned a quarter turn ${side}`);
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const R = m.rounds[0], q = contextScale(g);
    let cache = env.assets.cap;
    const look = env.style ? env.assets.look : null;
    if (!cache || cache.R !== R || cache.q !== q) {
      const px = cardScale(R);
      cache = env.assets.cap = look
        ? { R, q, main: renderMainStyled(R, q, look, viewRect(m)), cards: R.cands.map((c) => renderCard(R, c.cells, q, px, look)) }
        : { R, q, main: renderMain(R, q, viewRect(m)), cards: R.cands.map((c) => renderCard(R, c.cells, q, px)) };
    }
    const V = viewRect(m), B = cardBox(R);
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#eef1f4'; g.fillRect(0, 0, m.board.w, m.board.h);
    const bg = g.createLinearGradient(0, V.y, 0, V.y + V.h);
    bg.addColorStop(0, '#f6f8fa'); bg.addColorStop(1, '#e7ebef');
    g.fillStyle = bg;
    if (m.hv === 3) { g.save(); rr(g, V.x, V.y, V.w, V.h, 8); g.fill(); g.strokeStyle = '#d5dde6'; g.lineWidth = 1; g.stroke(); g.clip(); g.drawImage(cache.main, V.x, V.y, V.w, V.h); g.restore(); }
    else { g.fillRect(V.x, V.y, V.w, V.h); g.drawImage(cache.main, V.x, V.y, V.w, V.h); }
    if (look) { g.fillStyle = 'rgba(255,255,255,.82)'; rr(g, V.x + 5, V.y + 6, 118, 31, 6); g.fill(); }
    g.fillStyle = look ? '#4d5966' : '#8a97a4'; g.font = `11px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('Blue: one half', V.x + 10, V.y + 18);
    g.fillText('Dashed: whole block', V.x + 10, V.y + 32);
    for (let i = 0; i < R.cands.length; i++) {
      const c = cardRect(i, m), sel = !!state.sel[i];
      rr(g, c.x, c.y, c.w, c.h, 7); g.fillStyle = '#ffffff'; g.fill();
      g.strokeStyle = sel ? ACCENT : '#d3dae2'; g.lineWidth = sel ? 3 : 1; g.stroke();
      g.drawImage(cache.cards[i], c.x, c.y + 3, B.w, B.h - 6);
      if (sel) {
        g.beginPath(); g.arc(c.x + c.w - 11, c.y + 11, 7.5, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(c.x + c.w - 14.5, c.y + 11); g.lineTo(c.x + c.w - 12, c.y + 13.6); g.lineTo(c.x + c.w - 7.4, c.y + 8.4); g.stroke();
      }
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const op = env.manifest.hv === 3 ? 'toggle' : 'pick';
    for (let i = 0; i < env.manifest.rounds[0].cands.length; i++) {
      const c = cardRect(i, env.manifest);
      if (e.x >= c.x && e.x <= c.x + c.w && e.y >= c.y && e.y <= c.y + c.h) return [{ op, cand: i }];
    }
    return [];
  },

  footerStatus(env) {
    const n = env.state.sel.filter(Boolean).length;
    return n ? `${n} selected` : 'Click a piece';
  },
};

export default task;
