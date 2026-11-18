import { rotPt } from '../core/geom.js';
import { drawPromptText, ACCENT } from '../core/panel.js';
import { splitIds } from '../core/style.js';

const BOARD = { w: 340, h: 380 };
const HARD = { options: 12, rotations: [3, 5], mirrors: 4, minDecoys: 3, cells: [8, 9], maxSpan: 4, keepParts: 3 };
const N_OPT = HARD.options;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MIN_TURN = 40;
const MIN_TURN_C2 = 36;
const LOOKALIKE_IOU = 0.66;
const MIN_MIRROR_MOVE = 2;
const CARD_PAD = 7, CARD_U_MAX = 16;

const norm = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const keyOf = (cells) => norm(cells).map((c) => c.join(',')).join(';');
const rot90 = (cells) => cells.map(([x, y]) => [-y, x]);
const flip = (cells) => cells.map(([x, y]) => [-x, y]);
function rotKeys(cells) {
  const out = new Set(); let c = cells;
  for (let k = 0; k < 4; k++) { out.add(keyOf(c)); c = rot90(c); }
  return out;
}
const isChiral = (cells) => !rotKeys(cells).has(keyOf(flip(cells)));
function connected(cells) {
  const set = new Set(cells.map((c) => c.join(',')));
  const seen = new Set([cells[0].join(',')]); const st = [cells[0]];
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of DIRS) {
      const k = `${x + dx},${y + dy}`;
      if (set.has(k) && !seen.has(k)) { seen.add(k); st.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}
const span = (cells) => {
  const n = norm(cells);
  return Math.max(Math.max(...n.map((c) => c[0])), Math.max(...n.map((c) => c[1]))) + 1;
};
function gridMoves(A, B) {
  const a = new Set(norm(A).map((c) => c.join(',')));
  let best = Infinity, c = B;
  for (let k = 0; k < 4; k++, c = rot90(c)) {
    const r = norm(c);
    for (let dx = -HARD.maxSpan; dx <= HARD.maxSpan; dx++) for (let dy = -HARD.maxSpan; dy <= HARD.maxSpan; dy++) {
      best = Math.min(best, r.filter(([x, y]) => !a.has(`${x + dx},${y + dy}`)).length);
    }
  }
  return best;
}
const mirrorClear = (cells) => gridMoves(cells, flip(cells)) >= MIN_MIRROR_MOVE;
function axisOf(cells) {
  const n = norm(cells);
  const cx = n.reduce((s, c) => s + c[0], 0) / n.length, cy = n.reduce((s, c) => s + c[1], 0) / n.length;
  let a = 0, b = 0, c = 0;
  for (const [x, y] of n) { a += (x - cx) ** 2; b += (y - cy) ** 2; c += (x - cx) * (y - cy); }
  return 0.5 * Math.atan2(2 * c, a - b) * 180 / Math.PI;
}
function spanAt(cells, rot) {
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = norm(cells).flatMap(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
  const X = pts.map(([x, y]) => x * c - y * s), Y = pts.map(([x, y]) => x * s + y * c);
  return Math.max(Math.max(...X) - Math.min(...X), Math.max(...Y) - Math.min(...Y));
}
const mod360 = (a) => ((a % 360) + 360) % 360;
const deg1 = (a) => { const v = +mod360(a).toFixed(1); return v >= 360 ? 0 : v; };
function symOrder(cells) {
  const k0 = keyOf(cells); let k = 0, c = cells;
  for (let i = 0; i < 4; i++, c = rot90(c)) if (keyOf(c) === k0) k++;
  return k;
}
const turnGap = (a, b, P) => { const d = (((a - b) % P) + P) % P; return Math.min(d, P - d); };
function spreadTurns(rng, n, P, G) {
  const g = G + 0.2, slack = P - (n + 1) * g;
  if (slack < 0) return null;
  const u = Array.from({ length: n }, () => rng.uniform(0, slack)).sort((a, b) => a - b);
  return u.map((v, j) => +((j + 1) * g + v).toFixed(1) + P * rng.int(0, 360 / P - 1));
}
const SIL_PX = 8, SIL_N = 48, SIL_SHIFT = 4;
function silhouette(cells, rot) {
  const n = norm(cells), a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), W = HARD.maxSpan;
  const cx = n.reduce((t, c) => t + c[0] + 0.5, 0) / n.length, cy = n.reduce((t, c) => t + c[1] + 0.5, 0) / n.length;
  const occ = new Uint8Array(W * W); for (const [x, y] of n) occ[x * W + y] = 1;
  const on = new Uint8Array(SIL_N * SIL_N), pts = [];
  for (let Y = 0; Y < SIL_N; Y++) for (let X = 0; X < SIL_N; X++) {
    const px = (X + 0.5 - SIL_N / 2) / SIL_PX, py = (Y + 0.5 - SIL_N / 2) / SIL_PX;
    const ix = Math.floor(px * ca + py * sa + cx), iy = Math.floor(-px * sa + py * ca + cy);
    if (ix >= 0 && ix < W && iy >= 0 && iy < W && occ[ix * W + iy]) { on[Y * SIL_N + X] = 1; pts.push(X, Y); }
  }
  return { on, pts, size: pts.length / 2 };
}
function iouAt(A, B, dx, dy) {
  let inter = 0;
  for (let i = 0; i < A.pts.length; i += 2) {
    const X = A.pts[i] + dx, Y = A.pts[i + 1] + dy;
    if (X >= 0 && X < SIL_N && Y >= 0 && Y < SIL_N && B.on[Y * SIL_N + X]) inter++;
  }
  return inter / (A.size + B.size - inter);
}
function overlapIoU(A, B) {
  let best = 0;
  for (let dy = -SIL_SHIFT; dy <= SIL_SHIFT; dy++) for (let dx = -SIL_SHIFT; dx <= SIL_SHIFT; dx++) best = Math.max(best, iouAt(A, B, dx, dy));
  return best;
}
function maxPairIoU(cards, stop = Infinity, sil = cards.map((c) => silhouette(c.cells, c.rot)), from = 0) {
  let mx = 0;
  for (let j = Math.max(1, from); j < sil.length; j++) for (let i = 0; i < j; i++) {
    mx = Math.max(mx, overlapIoU(sil[i], sil[j]));
    if (mx > stop) return mx;
  }
  return mx;
}

const cellSet = (cells) => new Set(cells.map((c) => c.join(',')));
function straightRuns(cells) {
  const s = cellSet(cells), out = [];
  for (const [x, y] of cells) {
    if (!s.has(`${x - 1},${y}`)) { let k = 0; while (s.has(`${x + k},${y}`)) k++; if (k >= 2) out.push(k); }
    if (!s.has(`${x},${y - 1}`)) { let k = 0; while (s.has(`${x},${y + k}`)) k++; if (k >= 2) out.push(k); }
  }
  return out.sort((a, b) => a - b);
}
function solidBlocks(cells, w, h) {
  const s = cellSet(cells); let n = 0;
  for (const [x, y] of cells) {
    let ok = true;
    for (let i = 0; i < w && ok; i++) for (let j = 0; j < h && ok; j++) if (!s.has(`${x + i},${y + j}`)) ok = false;
    if (ok) n++;
  }
  return n;
}
const neighbourCounts = (cells) => { const s = cellSet(cells); return cells.map(([x, y]) => DIRS.filter(([dx, dy]) => s.has(`${x + dx},${y + dy}`)).length).sort().join(''); };
export const partsKey = (cells) => `${Math.max(1, ...straightRuns(cells))}|${solidBlocks(cells, 2, 2)}|${neighbourCounts(cells)}`;
const partsKeyFull = (cells) => {
  const n = norm(cells), w = Math.max(...n.map((c) => c[0])) + 1, h = Math.max(...n.map((c) => c[1])) + 1;
  return `${partsKey(cells)}|${Math.min(w, h)}x${Math.max(w, h)}|${solidBlocks(cells, 2, 3) + solidBlocks(cells, 3, 2)}|${straightRuns(cells).join('')}`;
};
function oneMoveEdits(base) {
  const bad = new Set([...rotKeys(base), ...rotKeys(flip(base))]), out = new Map();
  base.forEach((_, drop) => {
    const kept = base.filter((__, i) => i !== drop);
    for (const [x, y] of kept) for (const [dx, dy] of DIRS) {
      if (kept.some((c) => c[0] === x + dx && c[1] === y + dy)) continue;
      const cand = kept.concat([[x + dx, y + dy]]);
      if (!connected(cand) || span(cand) > HARD.maxSpan || bad.has(keyOf(cand))) continue;
      const ck = canonKey(cand);
      if (!out.has(ck)) out.set(ck, norm(cand));
    }
  });
  return [...out.values()];
}
function makeDecoysKeepParts(base, n, rng) {
  const pk = partsKey(base), fk = partsKeyFull(base), all = oneMoveEdits(base);
  const full = rng.shuffle(all.filter((c) => partsKeyFull(c) === fk));
  const part = rng.shuffle(all.filter((c) => partsKey(c) === pk && partsKeyFull(c) !== fk));
  const rest = rng.shuffle(all.filter((c) => partsKey(c) !== pk));
  const out = [...full, ...part, ...rest].slice(0, n);
  return out.length === n ? out : null;
}
const keepsParts = (base) => { const pk = partsKey(base); return oneMoveEdits(base).filter((c) => partsKey(c) === pk).length >= HARD.keepParts; };

function growShape(rng, needParts = false) {
  const n = rng.int(HARD.cells[0], HARD.cells[1]);
  for (let t = 0; t < 400; t++) {
    const cells = [[0, 0]];
    const has = (x, y) => cells.some((c) => c[0] === x && c[1] === y);
    while (cells.length < n) {
      const [x, y] = rng.pick(cells), [dx, dy] = rng.pick(DIRS);
      if (!has(x + dx, y + dy)) cells.push([x + dx, y + dy]);
    }
    if (span(cells) <= HARD.maxSpan && isChiral(cells) && mirrorClear(cells) && symOrder(cells) === 1
      && (!needParts || keepsParts(norm(cells)))) return norm(cells);
  }
  return null;
}

function editShape(base, rng, avoid = new Set()) {
  const bad = new Set([...rotKeys(base), ...rotKeys(flip(base))]);
  for (let t = 0; t < 300; t++) {
    const drop = rng.int(0, base.length - 1);
    const kept = base.filter((_, i) => i !== drop);
    const [x, y] = rng.pick(kept), [dx, dy] = rng.pick(DIRS);
    if (kept.some((c) => c[0] === x + dx && c[1] === y + dy)) continue;
    const cand = kept.concat([[x + dx, y + dy]]);
    if (!connected(cand) || span(cand) > HARD.maxSpan || bad.has(keyOf(cand)) || avoid.has(canonKey(cand))) continue;
    return norm(cand);
  }
  return null;
}
function makeDecoys(base, n, rng) {
  const avoid = new Set(), out = [];
  for (let i = 0; i < n; i++) {
    const d = editShape(base, rng, avoid);
    if (!d) return null;
    avoid.add(canonKey(d)); out.push(d);
  }
  return out;
}
const maxCopies = (P, G) => Math.floor(P / (G + 0.2)) - 1;

function buildCards(rng, shape, ext, keepParts = false) {
  const P = 360 / symOrder(shape), G = P === 360 ? MIN_TURN : MIN_TURN_C2;
  const cap = maxCopies(P, G);
  const nRot = rng.int(HARD.rotations[0], Math.min(HARD.rotations[1], cap));
  const nMir = Math.min(HARD.mirrors, cap);
  const nDec = N_OPT - nRot - nMir;
  if (nDec < HARD.minDecoys) return null;
  const decoys = keepParts ? makeDecoysKeepParts(shape, nDec, rng) : makeDecoys(shape, nDec, rng);
  if (!decoys) return null;
  const mirror = norm(flip(shape));
  const refRot = rng.int(0, 3) * 90;
  const ax = axisOf(shape);
  const rotT = spreadTurns(rng, nRot, P, G);
  if (!rotT) return null;
  const mirBase = deg1(refRot + 2 * ax);
  const rots = rotT.map((a) => ({ cells: shape, rot: deg1(refRot + a), isRot: true }));
  const rotSil = rots.map((c) => silhouette(c.cells, c.rot));
  if (maxPairIoU(rots, LOOKALIKE_IOU, rotSil) > LOOKALIKE_IOU) return null;
  for (let t = 0; t < 120; t++) {
    const mirT = spreadTurns(rng, nMir, P, G);
    if (!mirT) return null;
    const opts = [
      ...rots,
      ...mirT.map((a) => ({ cells: mirror, rot: deg1(mirBase + a), isRot: false })),
      ...decoys.map((d) => ({ cells: d, rot: deg1(refRot + ax - axisOf(d) + spreadTurns(rng, 1, 360 / symOrder(d), G)[0]), isRot: false })),
    ];
    const sil = [...rotSil, ...opts.slice(nRot).map((c) => silhouette(c.cells, c.rot))];
    if (maxPairIoU(opts, LOOKALIKE_IOU, sil, nRot) > LOOKALIKE_IOU) continue;
    const cells = rng.shuffle(opts);
    const m = {
      task: 'mental_rotation', board: BOARD,
      ref: { cells: shape, rot: refRot },
      cells: cells.map((c) => ({ cells: c.cells, rot: c.rot })),
      answer: cells.map((c, i) => (c.isRot ? i : -1)).filter((i) => i >= 0),
    };
    if (ext) m.ext = 1;
    return m;
  }
  return null;
}

const canonKey = (cells) => {
  let best = null;
  for (const base of [cells, flip(cells)]) { let c = base; for (let k = 0; k < 4; k++, c = rot90(c)) { const k2 = keyOf(c); if (best === null || k2 < best) best = k2; } }
  return best;
};
const HELD_OUT_SHAPES = ['0,0;0,1;0,2;0,3;1,0;1,2;2,2', '0,0;0,1;0,2;1,1;1,2;1,3', '0,0;0,1;0,2;1,2;2,2;2,3;3,2', '0,0;0,1;1,0;1,1;1,2;2,2;2,3',
  '0,0;0,1;1,1;1,2;1,3;2,1;2,3', '0,0;0,1;1,1;1,2;2,1;3,1', '0,0;0,1;1,1;2,1;2,2;3,1'].map((k) => k.split(';').map((p) => p.split(',').map(Number)));
let EXT_SHAPES = null;
function extShapes() {
  if (EXT_SHAPES) return EXT_SHAPES;
  const evalKeys = new Set(HELD_OUT_SHAPES.map(canonKey));
  let level = new Map([[keyOf([[0, 0]]), [[0, 0]]]]);
  const free = new Map();
  for (let n = 2; n <= 7; n++) {
    const next = new Map();
    for (const cells of level.values()) {
      const has = new Set(cells.map((c) => c.join(',')));
      for (const [x, y] of cells) for (const [dx, dy] of DIRS) {
        if (has.has(`${x + dx},${y + dy}`)) continue;
        const cand = norm(cells.concat([[x + dx, y + dy]]));
        if (span(cand) > HARD.maxSpan) continue;
        next.set(keyOf(cand), cand);
      }
    }
    level = next;
    if (n === 7) for (const cells of level.values()) {
      if (!isChiral(cells) || symOrder(cells) > 2 || !mirrorClear(cells)) continue;
      const ck = canonKey(cells);
      if (!free.has(ck) && !evalKeys.has(ck)) free.set(ck, { key: ck, cells: norm(ck.split(';').map((q) => q.split(',').map(Number))) });
    }
  }
  EXT_SHAPES = [...free.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  const sp = splitIds('g19_mr_shape', EXT_SHAPES.map((x) => x.key), 6);
  for (const x of EXT_SHAPES) x.split = sp(x.key);
  return EXT_SHAPES;
}
function generateExt(rng, split) {
  const pool = extShapes().filter((s) => s.split === split);
  for (let attempt = 0; attempt < 80; attempt++) {
    let shape = rng.pick(pool).cells;
    if (rng.uniform(0, 1) < 0.5) shape = flip(shape);
    for (let k = rng.int(0, 3); k > 0; k--) shape = rot90(shape);
    shape = norm(shape);
    const m = buildCards(rng, shape, true);
    if (m && gate(m)) return m;
  }
  throw new Error('mental_rotation: could not build an ext instance');
}

export function gate(m) {
  if (!m || m.task !== 'mental_rotation' || !m.ref || !Array.isArray(m.cells) || m.cells.length !== N_OPT) return false;
  const ref = m.ref.cells;
  const [c0, c1] = m.ext ? [7, 7] : HARD.cells;
  if (!isChiral(ref) || !connected(ref) || ref.length < c0 || ref.length > c1) return false;
  if (!m.ext && symOrder(ref) !== 1) return false;
  const rk = rotKeys(ref), mk = rotKeys(flip(ref));
  const want = [], mir = [], other = [];
  m.cells.forEach((c, i) => {
    const k = keyOf(c.cells);
    if (rk.has(k)) want.push(i); else if (mk.has(k)) mir.push(i); else other.push(i);
  });
  if (want.join(',') !== [...m.answer].sort((a, b) => a - b).join(',')) return false;
  if (want.length < HARD.rotations[0] || want.length > HARD.rotations[1]) return false;
  if (mir.length < 3 || mir.length > HARD.mirrors || other.length < HARD.minDecoys) return false;
  const seen = new Set();
  for (const i of other) {
    const ed = m.cells[i].cells, ck = canonKey(ed);
    if (ed.length !== ref.length || !connected(ed) || gridMoves(ref, ed) !== 1 || seen.has(ck)) return false;
    seen.add(ck);
  }
  if (gridMoves(ref, flip(ref)) < MIN_MIRROR_MOVE) return false;
  if (!m.ext && other.filter((i) => partsKey(m.cells[i].cells) === partsKey(ref)).length < HARD.keepParts) return false;
  if (![m.ref, ...m.cells].every((c) => Number.isFinite(c.rot) && c.rot >= 0 && c.rot < 360) || m.ref.rot % 90 !== 0) return false;
  const k = symOrder(ref); if (k > 2) return false;
  const P = 360 / k, G = k === 1 ? MIN_TURN : MIN_TURN_C2;
  const apart = (ids, extra = []) => {
    const a = [...extra, ...ids.map((i) => m.cells[i].rot)];
    return a.every((x, i) => a.every((y, j) => i === j || turnGap(x, y, P) >= G - 1e-6));
  };
  return apart(want, [m.ref.rot]) && apart(mir) && maxPairIoU(m.cells) <= LOOKALIKE_IOU;
}

export default {
  meta: {
    name: 'mental_rotation', family: 'D', 
    boardH: 390, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', cell: '0..11' }],
    promptHuman: 'Tap every turned copy of the top shape',
  },

  generate(rng, level, index, _knobs = {}) {
    if (_knobs && _knobs.ext) return generateExt(rng, _knobs.ext);
    for (let attempt = 0; attempt < 50; attempt++) {
      const shape = growShape(rng, true);
      if (!shape) continue;
      const m = buildCards(rng, shape, false, true);
      if (m) return m;
    }
    throw new Error('mental_rotation: could not build an instance');
  },

  init() { return { sel: new Array(N_OPT).fill(false) }; },

  applyAction(state, action) {
    if (action.op !== 'toggle') return { ok: false, reason: 'bad-op' };
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= N_OPT) return { ok: false, reason: 'bad-cell' };
    state.sel[action.cell] = !state.sel[action.cell];
    return { ok: true };
  },

  verify(state, manifest) {
    const tgt = new Set(manifest.answer);
    let correct = 0, sel = 0, tp = 0;
    for (let i = 0; i < N_OPT; i++) {
      if (state.sel[i]) { sel++; if (tgt.has(i)) tp++; }
      if (state.sel[i] === tgt.has(i)) correct++;
    }
    return {
      success: sel === tgt.size && tp === tgt.size,
      partial: correct / N_OPT, error: N_OPT - correct, detail: { selected: sel },
    };
  },

  oracle(manifest) { return manifest.answer.map((i) => ({ op: 'toggle', cell: i })); },

  randomPolicy(m, rnd) {
    const ids = Array.from({ length: N_OPT }, (_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const k = HARD.rotations[0] + Math.floor(rnd() * (HARD.rotations[1] - HARD.rotations[0] + 1));
    return ids.slice(0, k).map((cell) => ({ op: 'toggle', cell }));
  },

  async mount(env) {
    if (!env || !env.style) return;
    const { buildRotLook, drawRotBoard } = await import('../common/_mental_rotation_look.js');
    env.assets.rotLook = await buildRotLook(env.style);
    env.assets.drawRotBoard = drawRotBoard;
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap every turned copy of the top shape', 'Mirror images and shapes with a square moved do not count');
  },

  _cellRect(i) {
    const w = 76, h = 76, gx = (BOARD.w - 4 * w) / 5, gy = 8;
    const row = Math.floor(i / 4), col = i % 4;
    return { x: gx + col * (w + gx), y: 128 + row * (h + gy), w, h };
  },

  _drawShape(g, cells, rot, cx, cy, u, fill, line) {
    const n = norm(cells);
    const w = Math.max(...n.map((c) => c[0])) + 1, h = Math.max(...n.map((c) => c[1])) + 1;
    const P = (x, y) => rotPt({ x: (x - w / 2) * u, y: (y - h / 2) * u }, rot);
    const corners = n.flatMap(([x, y]) => [P(x, y), P(x + 1, y), P(x, y + 1), P(x + 1, y + 1)]);
    const ox = cx - (Math.min(...corners.map((p) => p.x)) + Math.max(...corners.map((p) => p.x))) / 2;
    const oy = cy - (Math.min(...corners.map((p) => p.y)) + Math.max(...corners.map((p) => p.y))) / 2;
    g.save(); g.translate(ox, oy);
    const quad = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
    g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 0.8; g.lineJoin = 'round';
    for (const [x, y] of n) { quad([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]); g.fill(); g.stroke(); }
    const has = new Set(n.map((c) => c.join(',')));
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.lineCap = 'butt'; g.beginPath();
    for (const [x, y] of n) {
      if (has.has(`${x + 1},${y}`)) { const pa = P(x + 1, y), pb = P(x + 1, y + 1); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); }
      if (has.has(`${x},${y + 1}`)) { const pa = P(x, y + 1), pb = P(x + 1, y + 1); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); }
    }
    g.stroke();
    g.strokeStyle = line; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath();
    for (const [x, y] of n) {
      const edges = [[[x, y], [x + 1, y], [x, y - 1]], [[x + 1, y], [x + 1, y + 1], [x + 1, y]],
        [[x, y + 1], [x + 1, y + 1], [x, y + 1]], [[x, y], [x, y + 1], [x - 1, y]]];
      for (const [a, b, nb] of edges) {
        if (has.has(nb.join(','))) continue;
        const pa = P(...a), pb = P(...b); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      }
    }
    g.stroke(); g.restore();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    if (env.assets && env.assets.rotLook) {
      env.assets.drawRotBoard(g, br, m, state, env.assets.rotLook, { cellRect: (i) => this._cellRect(i), norm, rotPt, spanAt, CARD_PAD, CARD_U_MAX, ACCENT });
      return;
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f4f6f9'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = '#fff'; g.strokeStyle = '#d5dde6'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(br.w / 2 - 58, 8, 116, 108, 8); g.fill(); g.stroke();
    this._drawShape(g, m.ref.cells, m.ref.rot, br.w / 2, 62, 17, '#3f6fb5', '#2a4f86');
    const cw = this._cellRect(0).w - 2 * CARD_PAD;
    const cu = Math.max(11.5, Math.min(CARD_U_MAX, ...m.cells.map((c) => cw / spanAt(c.cells, c.rot))));
    m.cells.forEach((c, i) => {
      const rc = this._cellRect(i), sel = state.sel[i];
      g.fillStyle = '#fff'; g.strokeStyle = sel ? ACCENT : '#dde3ea'; g.lineWidth = sel ? 3 : 1;
      g.beginPath(); g.roundRect(rc.x, rc.y, rc.w, rc.h, 7); g.fill(); g.stroke();
      g.lineWidth = 1;
      this._drawShape(g, c.cells, c.rot, rc.x + rc.w / 2, rc.y + rc.h / 2, cu, '#7d8ba3', '#56637a');
      if (sel) {
        g.beginPath(); g.arc(rc.x + rc.w - 12, rc.y + 12, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(rc.x + rc.w - 16, rc.y + 12); g.lineTo(rc.x + rc.w - 13, rc.y + 15); g.lineTo(rc.x + rc.w - 8, rc.y + 9); g.stroke(); g.lineWidth = 1;
      }
    });
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    for (let i = 0; i < N_OPT; i++) {
      const r = this._cellRect(i);
      if (evt.x >= r.x && evt.x <= r.x + r.w && evt.y >= r.y && evt.y <= r.y + r.h) return [{ op: 'toggle', cell: i }];
    }
    return [];
  },

  footerStatus(env) {
    return `${env.state.sel.filter(Boolean).length} selected`;
  },
};

export function semanticKey(m) {
  const ref = m.ref.cells, rk = rotKeys(ref), mk = rotKeys(flip(ref));
  const canon = [...rk, ...mk].sort()[0], form = rk.has(canon) ? 'R' : 'L';
  let shown = ref; for (let k = 0; k < Math.round(m.ref.rot / 90) % 4; k++) shown = rot90(shown);
  const cards = m.cells.map((c) => { const k = keyOf(c.cells); return `${rk.has(k) ? 'T' : mk.has(k) ? 'M' : 'D'}${Math.round(c.rot / 15) % 24}`; });
  return `mental_rotation|${canon}|${form}|${keyOf(shown)}|${cards.join(',')}`;
}
