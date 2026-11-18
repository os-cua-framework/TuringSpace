import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { hash32 } from '../core/style.js';
import { kindTexPairs, primaryOf, natural, detail, tinted, facePat, pat, isoTex, ANISO, GRIDDY, meanHex, lumOf, shade, toneTo, pickSplit } from '../common/_block_mat.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 480 };
const HARD = Object.freeze({ rounds: 1, options: 8, sizes: [6, 7] });
const EXT_OPTIONS = 4;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const VIEW = (() => {
  const al = 28 * Math.PI / 180, ph = 34 * Math.PI / 180;
  return {
    ex: { x: Math.sin(al), y: Math.sin(ph) * Math.cos(al) },
    ey: { x: -Math.cos(al), y: Math.sin(ph) * Math.sin(al) },
    ez: { x: 0, y: -Math.cos(ph) },
    v: [Math.cos(ph) * Math.cos(al), Math.cos(ph) * Math.sin(al), Math.sin(ph)],
  };
})();
const proj = (x, y, z) => ({ x: x * VIEW.ex.x + y * VIEW.ey.x + z * VIEW.ez.x, y: x * VIEW.ex.y + y * VIEW.ey.y + z * VIEW.ez.y });
const CUBE_HULL = (() => {
  const pts = [];
  for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) for (const c of [-0.5, 0.5]) pts.push(proj(a, b, c));
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-12) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
})();
function inHull(x, y) {
  for (let i = 0; i < CUBE_HULL.length; i++) {
    const a = CUBE_HULL[i], b = CUBE_HULL[(i + 1) % CUBE_HULL.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

function det3(M) { return M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]); }
const SIGNED_PERMS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const M = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
    out.push(M);
  }
  return out;
})();
const ROT = SIGNED_PERMS.filter((M) => det3(M) === 1);
const apply = (M, c) => ({ x: M[0] * c.x + M[1] * c.y + M[2] * c.z, y: M[3] * c.x + M[4] * c.y + M[5] * c.z, z: M[6] * c.x + M[7] * c.y + M[8] * c.z, k: c.k });
const tf = (M, shape) => shape.map((c) => apply(M, c));
const matEq = (A, B) => A.every((v, i) => v === B[i]);

function axisTurn(axis, q) {
  const c = [1, 0, -1, 0][q & 3], s = [0, 1, 0, -1][q & 3];
  if (axis === 'z') return [c, -s, 0, s, c, 0, 0, 0, 1];
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
const TURNS = [];
for (const axis of ['z']) for (const q of [1, 2, 3]) TURNS.push({ axis, q, M: axisTurn(axis, q) });
const VMIRRORS = [[-1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, -1, 0, 0, 0, 1], [0, 1, 0, 1, 0, 0, 0, 0, 1], [0, -1, 0, -1, 0, 0, 0, 0, 1]];
const SIL_STEP = 0.2, SIL_N = 40, SIL_WORDS = (SIL_N * SIL_N) >> 5;
const silCache = new Map();
function silhouette(shape) {
  const k = key(bare(shape));
  let bits = silCache.get(k);
  if (bits) return bits;
  const P = shape.map((c) => proj(c.x + 0.5, c.y + 0.5, c.z + 0.5));
  const cx = (Math.min(...P.map((p) => p.x)) + Math.max(...P.map((p) => p.x))) / 2;
  const cy = (Math.min(...P.map((p) => p.y)) + Math.max(...P.map((p) => p.y))) / 2;
  bits = new Uint32Array(SIL_WORDS);
  for (let j = 0; j < SIL_N; j++) for (let i = 0; i < SIL_N; i++) {
    const X = (i - SIL_N / 2 + 0.5) * SIL_STEP + cx, Y = (j - SIL_N / 2 + 0.5) * SIL_STEP + cy;
    for (const p of P) if (inHull(X - p.x, Y - p.y)) { const n = j * SIL_N + i; bits[n >> 5] |= 1 << (n & 31); break; }
  }
  silCache.set(k, bits);
  return bits;
}
const pop32 = (v) => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
const wrapPi = (d) => Math.atan2(Math.sin(d), Math.cos(d));
function endAngles(shape) {
  const d = degrees(shape);
  const P = shape.map((c) => proj(c.x, c.y, c.z));
  const cx = P.reduce((s2, p) => s2 + p.x, 0) / P.length, cy = P.reduce((s2, p) => s2 + p.y, 0) / P.length;
  const hi = shape.findIndex((c) => c.k), ti = shape.findIndex((c, i) => d[i] === 1 && !c.k);
  return { head: Math.atan2(P[hi].y - cy, P[hi].x - cx), tail: Math.atan2(P[ti].y - cy, P[ti].x - cx) };
}
function swingRank(a, a2, b, opts, end) {
  const A0 = endAngles(a)[end], A1 = endAngles(a2)[end], B0 = endAngles(b)[end];
  const err = opts.map((o) => Math.abs(wrapPi(endAngles(o)[end] - B0 - (A1 - A0))));
  if (new Set(err.map((v) => v.toFixed(3))).size !== err.length) return -1;
  return err.filter((v) => v < err[0]).length;
}
function likeness(s, t) {
  const a = silhouette(s), b = silhouette(t);
  let I = 0, U = 0;
  for (let i = 0; i < SIL_WORDS; i++) { I += pop32(a[i] & b[i]); U += pop32(a[i] | b[i]); }
  return U ? 1 - I / U : 1;
}

function keyStr(shape) {
  const mx = Math.min(...shape.map((c) => c.x)), my = Math.min(...shape.map((c) => c.y)), mz = Math.min(...shape.map((c) => c.z));
  return shape.map((c) => `${c.x - mx},${c.y - my},${c.z - mz}${c.k ? '*' : ''}`).sort().join(';');
}
function key(shape) {
  if (shape.length > 6) return keyStr(shape);
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const c of shape) { if (c.x < mx) mx = c.x; if (c.y < my) my = c.y; if (c.z < mz) mz = c.z; }
  const codes = [];
  for (const c of shape) {
    const x = c.x - mx, y = c.y - my, z = c.z - mz;
    if (x > 4 || y > 4 || z > 4) return keyStr(shape);
    codes.push(((x * 5 + y) * 5 + z) * 2 + (c.k ? 1 : 0));
  }
  codes.sort((p, q) => p - q);
  let h = shape.length;
  for (const v of codes) h = h * 256 + v;
  return h;
}
const bare = (shape) => shape.map((c) => ({ x: c.x, y: c.y, z: c.z, k: 0 }));
const canon = (shape) => ROT.map((M) => keyStr(tf(M, bare(shape)))).sort()[0];
const canonAny = (shape) => SIGNED_PERMS.map((M) => keyStr(tf(M, bare(shape)))).sort()[0];
const stabilizer = (shape) => { const k0 = key(bare(shape)); return ROT.filter((M) => key(tf(M, bare(shape))) === k0).length; };
function bboxDims(shape) {
  const r = (f) => Math.max(...shape.map(f)) - Math.min(...shape.map(f)) + 1;
  return [r((c) => c.x), r((c) => c.y), r((c) => c.z)];
}
function connected(shape) {
  const S = new Set(shape.map((c) => `${c.x},${c.y},${c.z}`));
  const seen = new Set([`${shape[0].x},${shape[0].y},${shape[0].z}`]), st = [shape[0]];
  while (st.length) {
    const p = st.pop();
    for (const d of DIRS) {
      const k = `${p.x + d[0]},${p.y + d[1]},${p.z + d[2]}`;
      if (S.has(k) && !seen.has(k)) { seen.add(k); st.push({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] }); }
    }
  }
  return seen.size === shape.length;
}

function degrees(shape) {
  const S = new Set(shape.map((c) => `${c.x},${c.y},${c.z}`));
  return shape.map((c) => DIRS.filter((d) => S.has(`${c.x + d[0]},${c.y + d[1]},${c.z + d[2]}`)).length);
}
const isSnake = (shape) => { const d = degrees(shape); return d.every((v) => v >= 1 && v <= 2) && d.filter((v) => v === 1).length === 2; };

let LIB = null;
function library() {
  if (LIB) return LIB;
  const parse = (k) => k.split(';').map((s) => { const [x, y, z] = s.split(',').map(Number); return { x, y, z, k: 0 }; });
  let level = new Map([[canon([{ x: 0, y: 0, z: 0 }]), [{ x: 0, y: 0, z: 0, k: 0 }]]]);
  const out = [];
  for (let n = 2; n <= Math.max(...HARD.sizes); n++) {
    const next = new Map();
    for (const shape of level.values()) {
      const occ = new Set(shape.map((c) => `${c.x},${c.y},${c.z}`));
      for (const p of shape) for (const d of DIRS) {
        const q = { x: p.x + d[0], y: p.y + d[1], z: p.z + d[2], k: 0 };
        if (occ.has(`${q.x},${q.y},${q.z}`)) continue;
        const c = canon(shape.concat(q));
        if (!next.has(c)) next.set(c, parse(c));
      }
    }
    level = next;
    if (HARD.sizes.includes(n)) for (const s of level.values()) {
      const dims = bboxDims(s);
      if (Math.max(...dims) > 3 || Math.min(...dims) < 2 || !isSnake(s)) continue;
      if (stabilizer(s) === 1) out.push(s);
    }
  }
  LIB = out;
  return LIB;
}

function layout(shape, e) {
  const pts = shape.map((c, i) => { const p = proj(c.x, c.y, c.z); return { ...c, i, px: p.x * e, py: p.y * e }; });
  const depth = (c) => c.x * VIEW.v[0] + c.y * VIEW.v[1] + c.z * VIEW.v[2];
  pts.sort((a, b) => depth(a) - depth(b));
  const xs = [], ys = [];
  for (const p of pts) for (const q of cubeQuads(p.px, p.py, e).flat()) { xs.push(q.x); ys.push(q.y); }
  return { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function cubeQuads(px, py, e) {
  const V = (dx, dy, dz) => { const p = proj(dx, dy, dz); return { x: px + p.x * e, y: py + p.y * e }; };
  return [
    [V(0, 1, 1), V(1, 1, 1), V(1, 1, 0), V(0, 1, 0)],
    [V(1, 0, 1), V(1, 1, 1), V(1, 1, 0), V(1, 0, 0)],
    [V(0, 0, 1), V(1, 0, 1), V(1, 1, 1), V(0, 1, 1)],
  ];
}
function insideQuad(q, X, Y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (Y - a.y) - (b.y - a.y) * (X - a.x);
    if (c > 1e-9) { if (sign < 0) return false; sign = 1; } else if (c < -1e-9) { if (sign > 0) return false; sign = -1; }
  }
  return true;
}
const visCache = new Map();
function minVisible(shape) {
  const k = key(bare(shape));
  if (visCache.has(k)) return visCache.get(k);
  const e = 10, STEP = 0.5, L = layout(shape, e);
  const W = Math.ceil((L.maxX - L.minX) / STEP) + 2, H = Math.ceil((L.maxY - L.minY) / STEP) + 2;
  const owner = new Int16Array(W * H).fill(-1);
  for (const p of L.pts) for (const q0 of cubeQuads(p.px - L.minX, p.py - L.minY, e)) {
    const x0 = Math.max(0, Math.floor(Math.min(...q0.map((v) => v.x)) / STEP)), x1 = Math.min(W - 1, Math.ceil(Math.max(...q0.map((v) => v.x)) / STEP));
    const y0 = Math.max(0, Math.floor(Math.min(...q0.map((v) => v.y)) / STEP)), y1 = Math.min(H - 1, Math.ceil(Math.max(...q0.map((v) => v.y)) / STEP));
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) if (insideQuad(q0, X * STEP + STEP / 2, Y * STEP + STEP / 2)) owner[Y * W + X] = p.i;
  }
  const area = new Array(shape.length).fill(0);
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) area[owner[i]]++;
  const v = Math.min(...area) * STEP * STEP;
  visCache.set(k, v);
  return v;
}
const MIN_VIS = 18;
const legible = (shape) => minVisible(shape) >= MIN_VIS;

let LEGIBLE_ROT = null, LIB_CANON_ANY = null;
function libCanonAnyDefault(i) { if (!LIB_CANON_ANY) LIB_CANON_ANY = library().map(canonAny); return LIB_CANON_ANY[i]; }
function legibleRotsDefault(i) {
  if (!LEGIBLE_ROT) LEGIBLE_ROT = library().map((s) => ROT.filter((M) => legible(tf(M, s))));
  return LEGIBLE_ROT[i];
}
function tryRound(rng, target, target2 = -1, sw = null, turnIndex = -1, src = null) {
  const lib = src ? src.lib : library();
  const legibleRots = src ? src.legibleRots : legibleRotsDefault, libCanonAny = src ? src.canonAny : libCanonAnyDefault;
  const ia = rng.int(0, lib.length - 1), ib = rng.int(0, lib.length - 1);
  if (libCanonAny(ia) === libCanonAny(ib)) return null;
  const mark = (s) => { const ends = degrees(s).map((v, j) => (v === 1 ? j : -1)).filter((j) => j >= 0); const i = rng.pick(ends); return s.map((c, j) => ({ ...c, k: j === i ? 1 : 0 })); };
  const A = mark(lib[ia]), B = mark(lib[ib]);
  const turn = turnIndex >= 0 ? TURNS[turnIndex] : rng.pick(TURNS);
  const okA = legibleRots(ia).filter((M) => legible(tf(mul(turn.M, M), A)));
  const okB = legibleRots(ib).filter((M) => legible(tf(mul(turn.M, M), B)));
  if (!okA.length || !okB.length) return null;
  const rA = rng.pick(okA), rB = rng.pick(okB);
  const a = tf(rA, A), a2 = tf(turn.M, a), b = tf(rB, B), X = tf(turn.M, b);
  const kb = key(b);
  const proper = [1, 2, 3].filter((q) => q !== turn.q).map((q) => tf(axisTurn('z', q), b));
  const mirrors = VMIRRORS.map((M) => tf(M, X));
  const choices = [];
  for (const P of proper) for (let i = 0; i < mirrors.length; i++) for (let j = i + 1; j < mirrors.length; j++) {
    const opts = [X, P, mirrors[i], mirrors[j]];
    const d = opts.map((o) => likeness(b, o));
    if (new Set(d.map((v) => v.toFixed(4))).size !== 4) continue;
    if (d.filter((v) => v < d[0]).length !== target) continue;
    if (target2 >= 0) {
      const d2 = opts.map((o) => likeness(a2, o));
      if (new Set(d2.map((v) => v.toFixed(4))).size !== 4) continue;
      if (d2.filter((v) => v < d2[0]).length !== target2) continue;
    }
    if (sw && (swingRank(a, a2, b, opts, 'head') !== sw.head || swingRank(a, a2, b, opts, 'tail') !== sw.tail)) continue;
    const keys = opts.map(key);
    if (new Set(keys).size !== 4 || keys.includes(kb)) continue;
    if (!opts.every(legible)) continue;
    choices.push({ opts });
  }
  if (!choices.length) return null;
  const { opts } = rng.pick(choices);
  const order = rng.shuffle([0, 1, 2, 3]);
  return {
    A: norm(a), A2: norm(a2), B: norm(b),
    options: order.map((i) => norm(opts[i])),
    answer: order.indexOf(0),
    turn: { axis: turn.axis, q: turn.q }, look: { rankB: target, swing: sw },
  };
}
function fullOrbit(b, q = 0) {
  const qs = [q, ...[0, 1, 2, 3].filter((k) => k !== q)];
  const rots = qs.map((k) => tf(axisTurn('z', k), b));
  return rots.concat(rots.map((s) => tf(VMIRRORS[0], s)));
}
function likeRank(b, opts) {
  const kb = key(b), rest = opts.filter((o, i) => i === 0 || key(o) !== kb);
  const d = rest.map((o) => likeness(b, o));
  if (new Set(d.map((v) => v.toFixed(4))).size !== d.length) return -1;
  return d.filter((v) => v < d[0]).length;
}
const ORBIT_OK = new Map();
function orbitPoses(ib) {
  if (!ORBIT_OK.has(ib)) ORBIT_OK.set(ib, legibleRotsDefault(ib).filter((M) => fullOrbit(tf(M, library()[ib])).every(legible)));
  return ORBIT_OK.get(ib);
}
function tryRoundFull(rng, want = null, turnIndex = -1) {
  const lib = library();
  const mark = (s) => { const ends = degrees(s).map((v, j) => (v === 1 ? j : -1)).filter((j) => j >= 0); const i = rng.pick(ends); return s.map((c, j) => ({ ...c, k: j === i ? 1 : 0 })); };
  const turn = turnIndex >= 0 ? TURNS[turnIndex] : rng.pick(TURNS);
  const ib = rng.int(0, lib.length - 1), okB = orbitPoses(ib);
  if (!okB.length) return null;
  const b = tf(rng.pick(okB), mark(lib[ib]));
  const opts = fullOrbit(b, turn.q);
  if (new Set(opts.map(key)).size !== HARD.options) return null;
  const like = likeRank(b, opts);
  if (like < 0 || (want && like !== want.like)) return null;
  for (let k = 0; k < 60; k++) {
    const ia = rng.int(0, lib.length - 1);
    if (libCanonAnyDefault(ia) === libCanonAnyDefault(ib)) continue;
    const A = mark(lib[ia]);
    const okA = legibleRotsDefault(ia).filter((M) => legible(tf(mul(turn.M, M), A)));
    if (!okA.length) continue;
    const a = tf(rng.pick(okA), A), a2 = tf(turn.M, a);
    const head = swingRank(a, a2, b, opts, 'head'), tail = swingRank(a, a2, b, opts, 'tail');
    if (head < 0 || tail < 0 || (want && (head !== want.head || tail !== want.tail))) continue;
    const order = rng.shuffle(opts.map((_, i) => i));
    return {
      A: norm(a), A2: norm(a2), B: norm(b),
      options: order.map((i) => norm(opts[i])),
      answer: order.indexOf(0),
      turn: { axis: turn.axis, q: turn.q }, look: { rankB: like, swing: { head, tail } },
    };
  }
  return null;
}
function mul(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}
function norm(shape) {
  const mx = Math.min(...shape.map((c) => c.x)), my = Math.min(...shape.map((c) => c.y)), mz = Math.min(...shape.map((c) => c.z));
  return shape.map((c) => ({ x: c.x - mx, y: c.y - my, z: c.z - mz, k: c.k }))
    .sort((p, q) => p.x - q.x || p.y - q.y || p.z - q.z);
}

const cellOk = (c) => c && [c.x, c.y, c.z].every((v) => Number.isInteger(v) && v >= 0 && v <= 4) && (c.k === 0 || c.k === 1);
function shapeOkDefault(s) {
  if (!Array.isArray(s) || !HARD.sizes.includes(s.length) || !s.every(cellOk)) return false;
  if (new Set(s.map((c) => `${c.x},${c.y},${c.z}`)).size !== s.length) return false;
  if (s.filter((c) => c.k).length !== 1 || !connected(s) || !isSnake(s) || stabilizer(s) !== 1 || !legible(s)) return false;
  const d = degrees(s), dims = bboxDims(s);
  return d[s.findIndex((c) => c.k)] === 1 && Math.max(...dims) <= 3 && Math.min(...dims) >= 2;
}
function roundOkFull(r) {
  const shapeOk = shapeOkDefault;
  if (!r || !shapeOk(r.A) || !shapeOk(r.A2) || !shapeOk(r.B) || !Array.isArray(r.options) || r.options.length !== HARD.options) return false;
  if (!r.options.every(shapeOk) || !Number.isInteger(r.answer) || r.answer < 0 || r.answer >= HARD.options) return false;
  if (canonAny(r.A) === canonAny(r.B)) return false;
  const gs = ROT.filter((M) => key(tf(M, r.A)) === key(r.A2));
  if (gs.length !== 1 || !TURNS.some((t) => matEq(t.M, gs[0]))) return false;
  if (ROT.filter((M) => key(tf(M, bare(r.A))) === key(bare(r.A2))).length !== 1) return false;
  const keys = r.options.map(key);
  if (new Set(keys).size !== HARD.options || keys[r.answer] !== key(tf(gs[0], r.B))) return false;
  const orbit = fullOrbit(r.B).map(key);
  return orbit.every((k) => keys.includes(k));
}
function roundOk(r, shapeOk = shapeOkDefault) {
  if (!r || !shapeOk(r.A) || !shapeOk(r.A2) || !shapeOk(r.B) || !Array.isArray(r.options) || r.options.length !== EXT_OPTIONS) return false;
  if (!r.options.every(shapeOk) || !Number.isInteger(r.answer) || r.answer < 0 || r.answer >= EXT_OPTIONS) return false;
  if (canonAny(r.A) === canonAny(r.B)) return false;
  const gs = ROT.filter((M) => key(tf(M, r.A)) === key(r.A2));
  if (gs.length !== 1) return false;
  const g = gs[0];
  if (!TURNS.some((t) => matEq(t.M, g))) return false;
  if (ROT.filter((M) => key(tf(M, bare(r.A))) === key(bare(r.A2))).length !== 1) return false;
  const X = key(tf(g, r.B));
  const keys = r.options.map(key);
  if (new Set(keys).size !== EXT_OPTIONS || keys[r.answer] !== X || keys.includes(key(r.B))) return false;
  const q = TURNS.find((t) => matEq(t.M, g)).q;
  const wrongTurns = [1, 2, 3].filter((k) => k !== q).map((k) => key(tf(axisTurn('z', k), r.B)));
  const mirrorKeys = VMIRRORS.map((M) => key(tf(M, r.options[r.answer])));
  const rest = keys.filter((_, i) => i !== r.answer);
  if (rest.filter((k) => wrongTurns.includes(k)).length !== 1) return false;
  if (rest.filter((k) => mirrorKeys.includes(k)).length !== 2) return false;
  const layers = (sh) => { const z0 = Math.min(...sh.map((c) => c.z)); return sh.map((c) => c.z - z0).sort().join(); };
  return r.options.every((o) => layers(o) === layers(r.B));
}
export function gate(m) {
  if (m && m.ext) return extGate(m);
  if (!m || m.task !== 'rotation_analogy' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  return Array.isArray(m.rounds) && m.rounds.length === HARD.rounds && m.rounds.every((r) => roundOkFull(r));
}

const PAL = {
  body: { top: '#f4e6c8', left: '#dcbf8f', right: '#bf9a66' },
  mark: { top: '#f6ae9c', left: '#dc7b64', right: '#bb5d48' },
  line: '#3b2e22',
};
const ROW_A = { y: 6, h: 116 }, ROW_B = { y: 128, h: 116 };
const BOX = { l: 26, w: 128, r: 226 };
const OPT = { y: 256, w: 86, h: 106, gap: 7 };
function optRect(i) {
  const x0 = (BOARD.w - (4 * OPT.w + 3 * OPT.gap)) / 2;
  return { x: x0 + (i % 4) * (OPT.w + OPT.gap), y: OPT.y + Math.floor(i / 4) * (OPT.h + OPT.gap), w: OPT.w, h: OPT.h };
}
function drawShape(g, shape, cx, cy, e) {
  const L = layout(shape, e);
  const ox = cx - (L.minX + L.maxX) / 2, oy = cy - (L.minY + L.maxY) / 2;
  const occ = new Map(shape.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  const at = (x, y, z) => occ.get(`${x},${y},${z}`);
  const FN = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
  const EDGE_STEP = [
    [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [0, 0, -1], [0, -1, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]],
  ];
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of L.pts) {
    const quads = cubeQuads(ox + p.px, oy + p.py, e);
    const pal = p.k ? PAL.mark : PAL.body;
    const fills = [pal.left, pal.right, pal.top];
    quads.forEach((q, f) => {
      const n = FN[f];
      if (at(p.x + n[0], p.y + n[1], p.z + n[2])) return;
      g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath();
      g.fillStyle = fills[f]; g.fill();
      g.strokeStyle = fills[f]; g.lineWidth = 0.6; g.stroke();
      g.strokeStyle = PAL.line; g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const t = EDGE_STEP[f][i];
        const nb = at(p.x + t[0], p.y + t[1], p.z + t[2]);
        const cont = nb && !at(p.x + t[0] + n[0], p.y + t[1] + n[1], p.z + t[2] + n[2]) && nb.k === p.k;
        if (cont) continue;
        const a = q[i], b = q[(i + 1) % 4];
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    });
  }
}
function arrow(g, x0, x1, y) {
  g.strokeStyle = '#8a97a4'; g.fillStyle = '#8a97a4'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1 - 8, y); g.stroke();
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x1 - 10, y - 6); g.lineTo(x1 - 10, y + 6); g.closePath(); g.fill();
}
function panel(g, x, y, w, h, label, dashed = false) {
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  g.fillStyle = '#ffffff'; g.fill();
  g.strokeStyle = '#d6dde5'; g.lineWidth = 1; if (dashed) g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
  if (label) { g.fillStyle = '#7b8896'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(label, x + 8, y + 7); }
}

let XLIB = null;
function extLibrary() {
  if (XLIB) return XLIB;
  const parse = (k) => k.split(';').map((q) => { const [x, y, z] = q.split(',').map(Number); return { x, y, z, k: 0 }; });
  const fits = (sh) => bboxDims(sh).every((d) => d <= 3);
  let level = new Map([[canon([{ x: 0, y: 0, z: 0 }]), [{ x: 0, y: 0, z: 0, k: 0 }]]]);
  const defaultAny = new Set(library().map(canonAny));
  const out = { train: [], test: [] };
  for (let n = 2; n <= 6; n++) {
    const next = new Map();
    for (const shape of level.values()) {
      const occ = new Set(shape.map((c) => `${c.x},${c.y},${c.z}`));
      for (const p of shape) for (const d of DIRS) {
        const q = { x: p.x + d[0], y: p.y + d[1], z: p.z + d[2], k: 0 };
        if (occ.has(`${q.x},${q.y},${q.z}`)) continue;
        const sh = shape.concat(q);
        if (!fits(sh)) continue;
        const c = canon(sh);
        if (!next.has(c)) next.set(c, parse(c));
      }
    }
    level = next;
    if (n >= 5) for (const sh of level.values()) {
      if (extShapeBase(sh) && !defaultAny.has(canonAny(sh))) out[hash32(`rotation_analogy_shape|${canonAny(sh)}`) % 10 === 0 ? 'test' : 'train'].push(sh);
    }
  }
  for (const k of ['train', 'test']) {
    const by = [5, 6].map((n) => out[k].filter((sh) => sh.length === n));
    const n6 = Math.max(1, by[1].length);
    out[k] = [5, 6].flatMap((n, i) => { const rep = Math.max(1, Math.round((n6 * [0.67, 1][i]) / Math.max(1, by[i].length))); return Array.from({ length: rep }, () => by[i]).flat(); });
  }
  XLIB = out;
  return XLIB;
}
function extShapeBase(s) {
  const dims = bboxDims(s), d = degrees(s);
  return s.length >= 5 && s.length <= 6 && Math.max(...dims) <= 3 && Math.min(...dims) >= 2 && connected(s) && d.filter((v) => v === 1).length >= 2 && stabilizer(s) === 1;
}
function extShapeOk(s) {
  if (!Array.isArray(s) || s.length < 5 || s.length > 6 || !s.every(cellOk)) return false;
  if (new Set(s.map((c) => `${c.x},${c.y},${c.z}`)).size !== s.length || s.filter((c) => c.k).length !== 1) return false;
  return extShapeBase(s) && degrees(s)[s.findIndex((c) => c.k)] === 1 && legible(s);
}
const XSRC = {};
function extSource(split) {
  if (XSRC[split]) return XSRC[split];
  const lib = extLibrary()[split], leg = new Map(), any = new Map();
  XSRC[split] = {
    lib,
    legibleRots: (i) => { if (!leg.has(i)) leg.set(i, ROT.filter((M) => legible(tf(M, lib[i])))); return leg.get(i); },
    canonAny: (i) => { if (!any.has(i)) any.set(i, canonAny(lib[i])); return any.get(i); },
  };
  return XSRC[split];
}
const R1 = (v) => Math.round(v);
function extLayout(rng) {
  const kind = rng.pick(['rows', 'grid', 'columns']), W = BOARD.w, H = BOARD.h, j = (a) => R1(rng.uniform(-a, a));
  if (kind === 'rows') {
    const bw = R1(rng.uniform(116, 136)), bh = R1(rng.uniform(106, 118)), l = R1((W - 2 * bw - 72) / 2) + j(6), rx = W - l - bw;
    const ow = R1(rng.uniform(80, 88)), oh = R1(rng.uniform(98, 108)), gap = R1((W - 8 - 4 * ow) / 3), oy = H - oh - 4 - R1(rng.uniform(0, 6));
    const y1 = 4 + R1(rng.uniform(0, 6)), y2 = y1 + bh + R1(rng.uniform(4, 10));
    return { kind, A: { x: l, y: y1, w: bw, h: bh }, A2: { x: rx, y: y1, w: bw, h: bh }, B: { x: l, y: y2, w: bw, h: bh }, B2: { x: rx, y: y2, w: bw, h: bh },
      opts: [0, 1, 2, 3].map((i) => ({ x: 4 + i * (ow + gap), y: oy, w: ow, h: oh })), E: 17, Eo: 14.5 };
  }
  if (kind === 'grid') {
    const bw = 80, bh = R1(rng.uniform(104, 116)), left = rng.raw() < 0.5, ax = 30;
    const bx = left ? 2 : W - (2 * bw + ax) - 2, y1 = 6 + R1(rng.uniform(0, 8)), y2 = y1 + bh + R1(rng.uniform(16, 30));
    const ox0 = left ? 2 * bw + ax + 14 : 4, ow = R1((W - (2 * bw + ax) - 22) / 2), oh = R1((H - 16) / 2);
    return { kind, A: { x: bx, y: y1, w: bw, h: bh }, A2: { x: bx + bw + ax, y: y1, w: bw, h: bh }, B: { x: bx, y: y2, w: bw, h: bh }, B2: { x: bx + bw + ax, y: y2, w: bw, h: bh },
      opts: [0, 1, 2, 3].map((i) => ({ x: ox0 + (i % 2) * (ow + 4), y: 4 + Math.floor(i / 2) * (oh + 6), w: ow, h: oh })), E: 17, Eo: 17 };
  }
  const bw = R1(rng.uniform(140, 160)), bh = R1(rng.uniform(98, 106)), gx = R1((W - 2 * bw) / 3), y1 = 4, y2 = y1 + bh + 26;
  const ow = R1(rng.uniform(80, 88)), oh = R1(rng.uniform(96, 104)), gap = R1((W - 8 - 4 * ow) / 3), oy = H - oh - 4;
  return { kind, A: { x: gx, y: y1, w: bw, h: bh }, A2: { x: gx, y: y2, w: bw, h: bh }, B: { x: 2 * gx + bw, y: y1, w: bw, h: bh }, B2: { x: 2 * gx + bw, y: y2, w: bw, h: bh },
    opts: [0, 1, 2, 3].map((i) => ({ x: 4 + i * (ow + gap), y: oy, w: ow, h: oh })), E: 17, Eo: 14.5 };
}
function generateExt(rng, split) {
  const src = extSource(split);
  const turnIndex = rng.int(0, TURNS.length - 1);
  const target = rng.int(0, 3);
  const sw = { head: rng.int(0, 2), tail: rng.int(0, 2) };
  let scene = null;
  for (let t = 0; t < 12000 && !scene; t++) {
    scene = tryRound(rng, target, -1, sw, turnIndex, src);
    if (scene && !roundOk(scene, extShapeOk)) scene = null;
  }
  if (!scene) throw new Error('rotation_analogy: could not build an ext scene');
  for (let k = 0; k < 40; k++) {
    const m = { task: 'rotation_analogy', board: { ...BOARD }, rounds: [scene], ext: { layout: extLayout(rng) } };
    if (extGate(m)) return m;
  }
  throw new Error('rotation_analogy: no ext layout fits');
}
function extGate(m) {
  if (m.task !== 'rotation_analogy' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  const L = m.ext.layout, rects = [L.A, L.A2, L.B, L.B2, ...L.opts];
  const inB = (R) => R.x >= 0 && R.y >= 0 && R.x + R.w <= BOARD.w && R.y + R.h <= BOARD.h;
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (!rects.every(inB) || rects.some((a, i) => rects.some((b, k) => k > i && over(a, b)))) return false;
  const r = m.rounds[0];
  const fit = (sh, R, e) => { const Ly = layout(sh, e); return Ly.maxX - Ly.minX <= R.w - 8 && Ly.maxY - Ly.minY <= R.h - 18; };
  if (![[r.A, L.A], [r.A2, L.A2], [r.B, L.B]].every(([sh, R]) => fit(sh, R, L.E)) || !r.options.every((sh, i) => fit(sh, L.opts[i], L.Eo))) return false;
  if (r.options.some((o) => canonAny(o) === canonAny(r.A))) return false;
  const all = [r.A, r.B].map(canonAny);
  if (all.some((k) => new Set(library().map(canonAny)).has(k))) return false;
  return roundOk(r, extShapeOk);
}

async function mountLook(st) {
  const pairs = kindTexPairs(st, ['wood', 'stone', 'concrete', 'plastic', 'metal'], () => true, 'rotation_analogy');
  const desks = st.pool('tex', (t) => (t.use === 'wood' && ANISO[t.id] && ANISO[t.id][0] < 0.75 && !GRIDDY.test(t.id)) || (['floor', 'fabric', 'flat2d', 'stone', 'wall'].includes(t.use) && isoTex(t, 0.25, 0.3)));
  const [[kind, tex], dtex] = primaryOf(st, 'g17_rotation', [pairs, desks]);
  st.note(`block:${kind}:${tex.id}`); st.note(`desk:${dtex.id}`);
  const r = st.rand;
  const TOY = ['#3f7fd8', '#3fa65b', '#e9c23a', '#8e5cc9', '#d9d4c7', '#e06a3e'];
  let body, base;
  const det = await detail(tex.file, 128);
  if (kind === 'plastic') { base = pickSplit(st, 'g17_toy', TOY); body = tinted(det, base, 0.06); }
  else { base = toneTo(meanHex(tex), 0.62 + 0.18 * r(), 0.45); body = await natural(tex.file, { L: lumOf(base), contrast: 0.9, sat: 0.8 }); }
  const head = tinted(det, base === '#e06a3e' ? '#5aa9e6' : '#f39a86', 0.12);
  return {
    kind, body, head, base, line: shade(base, 0.3), span: 1.3 + 1.0 * r(), salt: Math.floor(r() * 1e6),
    desk: await natural(dtex.file, { L: 0.55 + 0.33 * r(), contrast: 0.4, sat: 0.22 }), deskK: 0.6 + 0.5 * r(), off: [r() * 128, r() * 128],
    panel: await natural(dtex.file, { L: 0.95, contrast: 0.1, sat: 0.15 }), arrow: '#5d6873',
  };
}
const FACE_DARK = [1 - 0.83, 1 - 0.67, 0];
function drawShapeStyled(g, shape, cx, cy, e, L) {
  const Ly = layout(shape, e);
  const ox = cx - (Ly.minX + Ly.maxX) / 2, oy = cy - (Ly.minY + Ly.maxY) / 2;
  const occ = new Map(shape.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  const at = (x, y, z) => occ.get(`${x},${y},${z}`);
  const FN = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
  const EDGE_STEP = [
    [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [0, 0, -1], [0, -1, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]],
  ];
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of Ly.pts) {
    const quads = cubeQuads(ox + p.px, oy + p.py, e);
    quads.forEach((q, f) => {
      const n = FN[f];
      if (at(p.x + n[0], p.y + n[1], p.z + n[2])) return;
      const h = hash32(`${L.salt}|${p.x},${p.y},${p.z}|${f}`);
      const U = { x: (q[1].x - q[0].x) * L.span, y: (q[1].y - q[0].y) * L.span }, V = { x: (q[3].x - q[0].x) * L.span, y: (q[3].y - q[0].y) * L.span };
      const fx = (h & 1023) / 1024, fy = ((h >>> 10) & 1023) / 1024;
      g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath();
      g.fillStyle = facePat(g, p.k ? L.head : L.body, { x: q[0].x - U.x * fx - V.x * fy, y: q[0].y - U.y * fx - V.y * fy }, U, V); g.fill();
      if (FACE_DARK[f] > 0) { g.fillStyle = `rgba(0,0,0,${FACE_DARK[f].toFixed(3)})`; g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.6; g.stroke();
      g.strokeStyle = L.line; g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const t = EDGE_STEP[f][i], nb = at(p.x + t[0], p.y + t[1], p.z + t[2]);
        if (nb && !at(p.x + t[0] + n[0], p.y + t[1] + n[1], p.z + t[2] + n[2]) && nb.k === p.k) continue;
        const a = q[i], b = q[(i + 1) % 4];
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    });
  }
}
function defaultLayout() {
  return { kind: 'rows', A: { x: BOX.l, y: ROW_A.y, w: BOX.w, h: ROW_A.h }, A2: { x: BOX.r, y: ROW_A.y, w: BOX.w, h: ROW_A.h },
    B: { x: BOX.l, y: ROW_B.y, w: BOX.w, h: ROW_B.h }, B2: { x: BOX.r, y: ROW_B.y, w: BOX.w, h: ROW_B.h }, opts: Array.from({ length: HARD.options }, (_, i) => optRect(i)), E: 17, Eo: 14.5 };
}
const optRectOf = (m, i) => (m.ext ? m.ext.layout.opts[i] : optRect(i));
function drawStyled(g, br, env, L) {
  const { manifest: m, state } = env, R = m.rounds[0], Y = m.ext ? m.ext.layout : defaultLayout();
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = pat(g, L.desk, L.deskK, 0, 0, L.deskK, L.off[0], L.off[1]); g.fillRect(0, 0, br.w, br.h);
  const box = (Rc, label, dashed) => {
    g.save(); g.shadowColor = 'rgba(20,25,30,0.22)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
    rr(g, Rc.x + 0.5, Rc.y + 0.5, Rc.w - 1, Rc.h - 1, 8); g.fillStyle = pat(g, L.panel, 1, 0, 0, 1, Rc.x, Rc.y); g.fill(); g.restore();
    rr(g, Rc.x + 0.5, Rc.y + 0.5, Rc.w - 1, Rc.h - 1, 8); g.strokeStyle = 'rgba(60,70,80,0.35)'; g.lineWidth = 1; if (dashed) g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    if (label) { g.fillStyle = '#6b7884'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(label, Rc.x + 8, Rc.y + 7); }
  };
  box(Y.A, 'A'); box(Y.A2, 'A′'); box(Y.B, 'B'); box(Y.B2, 'B′', true);
  const arrowBetween = (P, Q, text) => {
    const c1 = { x: P.x + P.w / 2, y: P.y + P.h / 2 }, c2 = { x: Q.x + Q.w / 2, y: Q.y + Q.h / 2 };
    const horiz = Math.abs(c2.x - c1.x) > Math.abs(c2.y - c1.y);
    const a = horiz ? { x: P.x + P.w + 6, y: c1.y } : { x: c1.x, y: P.y + P.h + 4 }, b = horiz ? { x: Q.x - 6, y: c2.y } : { x: c2.x, y: Q.y - 4 };
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.strokeStyle = L.arrow; g.fillStyle = L.arrow; g.lineWidth = 2;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x - 8 * Math.cos(ang), b.y - 8 * Math.sin(ang)); g.stroke();
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - 10 * Math.cos(ang) + 6 * Math.sin(ang), b.y - 10 * Math.sin(ang) - 6 * Math.cos(ang));
    g.lineTo(b.x - 10 * Math.cos(ang) - 6 * Math.sin(ang), b.y - 10 * Math.sin(ang) + 6 * Math.cos(ang)); g.closePath(); g.fill();
    g.font = `600 11px ${UI_FONT}`; g.textAlign = horiz ? 'center' : 'left'; g.textBaseline = 'bottom';
    const tx = horiz ? (a.x + b.x) / 2 : a.x + 6, ty = horiz ? a.y - 6 : (a.y + b.y) / 2 + 5;
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(horiz ? tx - tw / 2 - 3 : tx - 3, ty - 13, tw + 6, 14);
    g.fillStyle = '#4b5661'; g.fillText(text, tx, ty);
  };
  arrowBetween(Y.A, Y.A2, 'turn'); arrowBetween(Y.B, Y.B2, 'same turn');
  drawShapeStyled(g, R.A, Y.A.x + Y.A.w / 2, Y.A.y + Y.A.h / 2 + 6, Y.E, L);
  drawShapeStyled(g, R.A2, Y.A2.x + Y.A2.w / 2, Y.A2.y + Y.A2.h / 2 + 6, Y.E, L);
  drawShapeStyled(g, R.B, Y.B.x + Y.B.w / 2, Y.B.y + Y.B.h / 2 + 6, Y.E, L);
  g.fillStyle = '#b3bec9'; g.font = `700 34px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', Y.B2.x + Y.B2.w / 2, Y.B2.y + Y.B2.h / 2 + 4);
  R.options.forEach((sh, i) => {
    const o = Y.opts[i], picked = state.pick === i;
    g.save(); g.shadowColor = 'rgba(20,25,30,0.22)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
    rr(g, o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1, 8); g.fillStyle = picked ? '#e8f3ff' : pat(g, L.panel, 1, 0, 0, 1, o.x, o.y); g.fill(); g.restore();
    rr(g, o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1, 8); g.strokeStyle = picked ? ACCENT : 'rgba(60,70,80,0.35)'; g.lineWidth = picked ? 2.5 : 1; g.stroke(); g.lineWidth = 1;
    drawShapeStyled(g, sh, o.x + o.w / 2, o.y + o.h / 2 + 3, Y.Eo, L);
  });
  g.restore();
}

export default {
  meta: {
    name: 'rotation_analogy', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'pick', option: '0..7 (candidate cards, two rows of four, left to right); a later pick replaces it' }],
    promptHuman: 'Turn B the way A was turned',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext);
    const turnIndex = rng.int(0, TURNS.length - 1);
    const want = { like: rng.int(1, HARD.options - 2), head: rng.int(0, HARD.options - 1), tail: rng.int(0, HARD.options - 1) };
    let scene = null;
    for (let t = 0; t < 12000 && !scene; t++) scene = tryRoundFull(rng, want, turnIndex);
    if (!scene) throw new Error('rotation_analogy: could not build a scene');
    return { task: 'rotation_analogy', board: { ...BOARD }, rounds: [scene] };
  },

  init() { return { pick: null }; },

  applyAction(state, a, m) {
    const n = m?.rounds?.[0]?.options?.length ?? HARD.options;
    if (a?.op !== 'pick' || !Number.isInteger(a.option) || a.option < 0 || a.option >= n) return { ok: false, reason: 'bad-action' };
    state.pick = a.option;
    return { ok: true };
  },

  verify(state, m) {
    const ok = state.pick === m.rounds[0].answer;
    return { success: ok, partial: ok ? 1 : 0, error: ok ? 0 : 1, detail: { answered: state.pick !== null ? 1 : 0 } };
  },

  oracle(m) { return [{ op: 'pick', option: m.rounds[0].answer }]; },

  randomPolicy(m, rnd) { return [{ op: 'pick', option: Math.floor(rnd() * m.rounds[0].options.length) }]; },

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Turn B the way A was turned', 'Pick how B looks after the same turn');
  },

  drawBoard(g, br, env) {
    if (env.assets?.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state } = env;
    const R = m.rounds[0];
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f1f3f6'; g.fillRect(0, 0, br.w, br.h);
    panel(g, BOX.l, ROW_A.y, BOX.w, ROW_A.h, 'A');
    panel(g, BOX.r, ROW_A.y, BOX.w, ROW_A.h, 'A′');
    panel(g, BOX.l, ROW_B.y, BOX.w, ROW_B.h, 'B');
    panel(g, BOX.r, ROW_B.y, BOX.w, ROW_B.h, 'B′', true);
    arrow(g, BOX.l + BOX.w + 12, BOX.r - 12, ROW_A.y + ROW_A.h / 2);
    arrow(g, BOX.l + BOX.w + 12, BOX.r - 12, ROW_B.y + ROW_B.h / 2);
    g.fillStyle = '#8a97a4'; g.font = `600 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText('turn', (BOX.l + BOX.w + BOX.r) / 2, ROW_A.y + ROW_A.h / 2 - 7);
    g.fillText('same turn', (BOX.l + BOX.w + BOX.r) / 2, ROW_B.y + ROW_B.h / 2 - 7);
    const E = 17;
    drawShape(g, R.A, BOX.l + BOX.w / 2, ROW_A.y + ROW_A.h / 2 + 6, E);
    drawShape(g, R.A2, BOX.r + BOX.w / 2, ROW_A.y + ROW_A.h / 2 + 6, E);
    drawShape(g, R.B, BOX.l + BOX.w / 2, ROW_B.y + ROW_B.h / 2 + 6, E);
    g.fillStyle = '#b3bec9'; g.font = `700 34px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', BOX.r + BOX.w / 2, ROW_B.y + ROW_B.h / 2 + 4);
    R.options.forEach((s, i) => {
      const o = optRect(i), picked = state.pick === i;
      rr(g, o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1, 8);
      g.fillStyle = picked ? '#e8f3ff' : '#ffffff'; g.fill();
      g.strokeStyle = picked ? ACCENT : '#cfd8e2'; g.lineWidth = picked ? 2.5 : 1; g.stroke(); g.lineWidth = 1;
      drawShape(g, s, o.x + o.w / 2, o.y + o.h / 2 + 3, 14.5);
    });
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    for (let i = 0; i < env.manifest.rounds[0].options.length; i++) {
      const o = optRectOf(env.manifest, i);
      if (e.x >= o.x && e.x <= o.x + o.w && e.y >= o.y && e.y <= o.y + o.h) return [{ op: 'pick', option: i }];
    }
    return [];
  },

  footerStatus(env) {
    return env.state.pick !== null ? '1 picked' : 'Pick an answer';
  },
};

export const _internals = { tryRound, tryRoundFull, library, key, tf, ROT, TURNS, bboxDims, layout, cubeQuads, optRect, legible, minVisible, stabilizer, canonAny };

const canonRotHead = (s) => ROT.map((M) => keyStr(tf(M, s))).sort()[0];
export function semanticKey(m) {
  const r = m.rounds[0];
  return `rotation_analogy|${canonRotHead(r.A)}|${canonRotHead(r.B)}|${r.turn.q}`;
}
