import { drawPromptText, rr } from '../core/panel.js';
import { nthOf } from '../core/style.js';
import { primaryOf, splitList, chooseSplit, texPool, isDirectional, makeMaterial, fillMaterial, patternOf, rectShape, rrShape, shadeHex, mixHex, hsl } from '../common/_material_kit.js';

const PANEL_W = 360;
const BOARD = Object.freeze({ w: PANEL_W - 20, h: 428 });
const HARD = Object.freeze({ cols: 9, rows: 5, sizes: [6, 7], maxExtent: 5, boardPieceMax: 4, tray: 8, near: 6 });
const N_TRAY = HARD.tray;
const CELL = 30;
const GRID = Object.freeze({ x: (BOARD.w - HARD.cols * CELL) / 2, y: 12 });
const TC = 14;
const TRAY = Object.freeze({ y: 186, h: 112, x0: 7, slotW: 79, gap: 4, rowGap: 6, perRow: 4 });
const SNAP = 22;
const BTN_R = 12;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const REGION_COLORS = ['#a9cbe8', '#f3cfa0', '#b3d9ad', '#eab3c2', '#cbbde4', '#f0e2a2', '#a7dcd3'];
const REGION_EDGE = '#56606c';
const GAP_FILL = '#323d49', GAP_LINE = '#4b5866';
const PIECE = Object.freeze({ fill: '#ef7f2d', inner: '#c7621b', edge: '#7e3a0b' });

function norm(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const key = (cells) => norm(cells).map((p) => p.join(',')).join(';');
const rotCW = (cells) => norm(cells.map(([x, y]) => [-y, x]));
const mirrorX = (cells) => norm(cells.map(([x, y]) => [-x, y]));
function rotN(cells, n) { let c = norm(cells); for (let i = 0; i < ((n % 4) + 4) % 4; i++) c = rotCW(c); return c; }
const fixedKeys = (cells) => [0, 1, 2, 3].map((n) => key(rotN(cells, n)));
const freeKeys = (cells) => [...fixedKeys(cells), ...fixedKeys(mirrorX(cells))];
const freeKey = (cells) => freeKeys(cells).sort()[0];
const turnCongruent = (a, b) => fixedKeys(a).includes(key(b));
const freeCongruent = (a, b) => freeKeys(a).includes(key(b));
function dims(cells) { const n = norm(cells); return [Math.max(...n.map((p) => p[0])) + 1, Math.max(...n.map((p) => p[1])) + 1]; }
function connected(cells) {
  if (!cells.length) return false;
  const s = new Set(cells.map((p) => p.join(','))), seen = new Set([cells[0].join(',')]), st = [cells[0]];
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of D4) { const k = `${x + dx},${y + dy}`; if (s.has(k) && !seen.has(k)) { seen.add(k); st.push([x + dx, y + dy]); } }
  }
  return seen.size === cells.length;
}
function blocks2x2(cells) {
  const s = new Set(cells.map((p) => p.join(',')));
  let b = 0;
  for (const [x, y] of cells) if (s.has(`${x + 1},${y}`) && s.has(`${x},${y + 1}`) && s.has(`${x + 1},${y + 1}`)) b++;
  return b;
}
const dimKey = (cells) => dims(cells).sort((a, b) => a - b).join('x');

function bestOverlap(piece, gap) {
  const g = new Set(norm(gap).map((p) => p.join(','))), p = norm(piece);
  let best = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
    let o = 0;
    for (const [x, y] of p) if (g.has(`${x + dx},${y + dy}`)) o++;
    if (o > best) best = o;
  }
  return best;
}

function nearMisses(S) {
  const Sn = norm(S), dk = dimKey(Sn), b = blocks2x2(Sn), seen = new Map();
  for (let i = 0; i < Sn.length; i++) {
    const rest = Sn.filter((_, j) => j !== i);
    if (!connected(rest)) continue;
    const rs = new Set(rest.map((p) => p.join(',')));
    for (const [x, y] of rest) for (const [dx, dy] of D4) {
      const q = [x + dx, y + dy], qk = q.join(',');
      if (rs.has(qk) || qk === Sn[i].join(',')) continue;
      const N = norm([...rest, q]);
      if (freeCongruent(Sn, N) || dimKey(N) !== dk || blocks2x2(N) !== b) continue;
      const fk = freeKey(N);
      if (!seen.has(fk)) seen.set(fk, N);
    }
  }
  return [...seen.values()];
}
function nearPool(near) {
  const out = [];
  for (const N of near) for (const c of [N, mirrorX(N)]) if (!out.some((o) => turnCongruent(o, c))) out.push(c);
  return out;
}

let LIBRARY = null;
function library() {
  if (LIBRARY) return LIBRARY;
  LIBRARY = buildLibrary(HARD.sizes);
  return LIBRARY;
}
function buildLibrary(sizes) {
  let level = new Map([[freeKey([[0, 0]]), [[0, 0]]]]);
  const out = Object.fromEntries(sizes.map((n) => [n, []]));
  for (let n = 2; n <= Math.max(...sizes); n++) {
    const next = new Map();
    for (const s of level.values()) {
      const occ = new Set(s.map((p) => p.join(',')));
      for (const [x, y] of s) for (const [dx, dy] of D4) {
        const q = [x + dx, y + dy];
        if (occ.has(q.join(','))) continue;
        const t = norm([...s, q]), k = freeKey(t);
        if (!next.has(k)) next.set(k, t);
      }
    }
    level = next;
    if (!sizes.includes(n)) continue;
    for (const s of level.values()) {
      if (new Set(freeKeys(s)).size !== 8) continue;
      if (Math.max(...dims(s)) > HARD.maxExtent) continue;
      const nm = nearMisses(s);
      if (nearPool(nm).length >= HARD.near) out[n].push({ cells: s, near: nm });
    }
  }
  return out;
}

function tileRest(rng, gap) {
  const W = HARD.cols, H = HARD.rows, own = new Int16Array(W * H).fill(-1);
  for (const [x, y] of gap) own[y * W + x] = -2;
  const regions = [];
  const nbrs = (c) => D4.map(([dx, dy]) => [c % W + dx, Math.floor(c / W) + dy])
    .filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H).map(([x, y]) => y * W + x);
  for (const start of rng.shuffle([...Array(W * H).keys()])) {
    if (own[start] !== -1) continue;
    const target = rng.pick([2, 3, 3, 4, 4, 4]);
    const reg = [start];
    own[start] = regions.length;
    while (reg.length < target) {
      const fr = [...new Set(reg.flatMap(nbrs))].filter((c) => own[c] === -1);
      if (!fr.length) break;
      const c = rng.pick(fr);
      own[c] = regions.length; reg.push(c);
    }
    regions.push(reg);
  }
  for (let i = 0; i < regions.length; i++) {
    if (regions[i].length !== 1) continue;
    const c = regions[i][0];
    const j = nbrs(c).map((n) => own[n]).filter((r) => r >= 0 && r !== i && regions[r].length < HARD.boardPieceMax)
      .sort((a, b) => regions[a].length - regions[b].length)[0];
    if (j === undefined) continue;
    regions[j].push(c); own[c] = j; regions[i] = [];
  }
  const live = regions.filter((r) => r.length);
  const idx = new Map(); live.forEach((r, i) => r.forEach((c) => idx.set(c, i)));
  const colors = [];
  live.forEach((r, i) => {
    const used = new Set();
    for (const c of r) for (const n of nbrs(c)) { const j = idx.get(n); if (j !== undefined && j < i) used.add(colors[j]); }
    const free = REGION_COLORS.map((_, k) => k).filter((k) => !used.has(k));
    colors.push(free.length ? rng.pick(free) : rng.int(0, REGION_COLORS.length - 1));
  });
  return live.map((r, i) => ({ cells: r.map((c) => [c % W, Math.floor(c / W)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]), color: colors[i] }));
}

function showTurn(rng, cells, gap, target) {
  const d = [0, 1, 2, 3].map((n) => Math.abs(bestOverlap(rotN(cells, n), gap) - target));
  const lo = Math.min(...d);
  return rotN(cells, rng.pick([0, 1, 2, 3].filter((n) => d[n] === lo)));
}

function genScene(rng, ext = null, n = null) {
  const lib = ext ? extLibrary(ext) : library();
  const sizes = ext ? EXT_SIZES.filter((n) => lib[n].length) : HARD.sizes;
  let fixed = null;
  if (ext && Number.isFinite(n)) {
    const all = sizes.flatMap((k) => lib[k]);
    const j = nthOf(`polyomino_fill_gap|${ext}|gap`, n, all.length * 8);
    fixed = { ent: all[j % all.length], flip: Math.floor(j / all.length) % 2 === 1, rot: Math.floor(j / (all.length * 2)) };
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const useFixed = fixed && attempt < 40;
    const size = useFixed ? fixed.ent.cells.length : rng.pick(sizes);
    const ent = useFixed ? fixed.ent : rng.pick(lib[size]);
    const flip = useFixed ? fixed.flip : rng.raw() < 0.5;
    const S = flip ? mirrorX(ent.cells) : ent.cells;
    const near = flip ? ent.near.map(mirrorX) : ent.near;
    const gapShape = rotN(S, useFixed ? fixed.rot : rng.int(0, 3));
    const [gw, gh] = dims(gapShape);
    const gx = rng.int(0, HARD.cols - gw), gy = rng.int(0, HARD.rows - gh);
    const gap = gapShape.map(([x, y]) => [x + gx, y + gy]);
    const regions = tileRest(rng, gap);
    const nears = rng.sample(nearPool(near), HARD.near);
    const turnsNeeded = rng.int(1, 3);
    const shown = rotN(gapShape, 4 - turnsNeeded), target = bestOverlap(shown, gapShape);
    const pieces = [
      shown,
      showTurn(rng, mirrorX(gapShape), gapShape, target),
      ...nears.map((c) => showTurn(rng, c, gapShape, target)),
    ];
    const kinds = ['fit', 'mirror', ...nears.map(() => 'near')];
    const order = rng.shuffle([...pieces.keys()]);
    const scene = {
      gap: norm(gap).map(([x, y]) => [x + gx, y + gy]),
      regions,
      tray: order.map((i) => ({ cells: pieces[i], kind: kinds[i] })),
      answer: order.indexOf(0),
    };
    if (!sceneProblems(scene, ext ? EXT_SIZES : HARD.sizes).length) return scene;
  }
  throw new Error('polyomino_fill_gap: could not build a scene');
}

const EVAL_KEYS = new Set(["polyomino_fill_gap|4,2;5,2;6,1;6,2;7,1|0,0;1,0;2,0;3,0;1,1|0,0;1,0;2,0;2,1;3,1|*0,0;0,1;0,2;1,2;1,3|1,0;1,1;1,2;0,3;1,3", "polyomino_fill_gap|1,0;1,1;1,2;2,2;2,3|1,0;1,1;0,2;1,2;0,3|*2,0;3,0;0,1;1,1;2,1|2,0;0,1;1,1;2,1;3,1|0,0;1,0;0,1;0,2;0,3", "polyomino_fill_gap|1,0;1,1;1,2;2,2;2,3;3,2|*1,0;2,0;3,0;0,1;1,1;1,2|1,0;0,1;1,1;1,2;2,2;1,3|2,0;2,1;2,2;0,3;1,3;2,3|1,0;0,1;1,1;2,1;0,2;0,3", "polyomino_fill_gap|2,1;2,2;3,1;3,2;4,0;4,1|*0,0;1,0;0,1;1,1;1,2;2,2|1,0;1,1;2,1;0,2;1,2;2,2|0,0;1,0;2,0;1,1;2,1;2,2|0,0;1,0;0,1;1,1;2,1;2,2", "polyomino_fill_gap|3,3;4,3;5,2;5,3;5,4;6,2|1,0;0,1;1,1;2,1;2,2;2,3|1,0;0,1;1,1;1,2;2,2;1,3|2,0;0,1;1,1;2,1;1,2;1,3|*1,0;1,1;2,1;3,1;0,2;1,2", "polyomino_fill_gap|4,3;5,2;5,3;5,4;6,1;6,2|0,0;0,1;1,1;1,2;2,2;1,3|0,0;1,0;2,0;2,1;3,1;2,2|*0,0;1,0;1,1;2,1;3,1;2,2|0,0;1,0;1,1;1,2;2,2;2,3", "polyomino_fill_gap|2,2;3,0;3,1;3,2;4,2;4,3|*0,0;0,1;1,1;2,1;1,2;1,3|2,0;0,1;1,1;2,1;2,2;3,2|1,0;0,1;1,1;2,1;3,1;0,2|1,0;1,1;2,1;0,2;1,2;0,3", "polyomino_fill_gap|4,3;5,3;6,1;6,2;6,3;7,2|*0,0;0,1;0,2;1,2;2,2;1,3|0,0;1,0;2,0;3,0;2,1;2,2|0,0;1,0;1,1;1,2;2,2;3,2|1,0;0,1;1,1;1,2;2,2;3,2", "polyomino_fill_gap|4,0;4,1;4,2;5,0;6,0;7,0|1,0;1,1;1,2;0,3;1,3;2,3|*0,0;0,1;0,2;0,3;1,3;2,3|2,0;2,1;2,2;0,3;1,3;2,3|0,0;0,1;1,1;2,1;3,1;3,2", "polyomino_fill_gap|4,2;5,2;5,3;6,1;6,2;7,1|1,0;0,1;1,1;2,1;2,2;3,2|1,0;0,1;1,1;2,1;3,1;2,2|*0,0;0,1;1,1;1,2;2,2;1,3|1,0;0,1;1,1;2,1;2,2;2,3", "polyomino_fill_gap|1,3;2,3;2,4;3,3;4,3|0,0;1,0;0,1;0,2;0,3|*1,0;0,1;1,1;1,2;1,3|2,0;3,0;0,1;1,1;2,1|1,0;1,1;0,2;1,2;1,3", "polyomino_fill_gap|1,0;1,1;2,1;2,2;2,3;3,3|*2,0;3,0;0,1;1,1;2,1;0,2|1,0;2,0;1,1;0,2;1,2;0,3|1,0;1,1;0,2;1,2;2,2;0,3|3,0;0,1;1,1;2,1;3,1;1,2"]);
const EXT_SIZES = HARD.sizes;
let EXT_LIB = null;
function extLibrary(split) {
  if (!EXT_LIB) EXT_LIB = buildLibrary(EXT_SIZES);
  const all = EXT_SIZES.flatMap((n) => EXT_LIB[n]);
  const keep = new Set(splitList('g15_polyomino_shape', all.map((e) => freeKey(e.cells)), split, 6));
  return Object.fromEntries(EXT_SIZES.map((n) => [n, EXT_LIB[n].filter((e) => keep.has(freeKey(e.cells)))]));
}

function sceneProblems(R, sizes = HARD.sizes) {
  const out = [];
  const W = HARD.cols, H = HARD.rows;
  const cellOk = (c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[0] < W && c[1] >= 0 && c[1] < H;
  if (!Array.isArray(R?.gap) || !R.gap.every(cellOk)) return ['gap-cells'];
  const gap = R.gap, n = gap.length;
  if (!sizes.includes(n) || !connected(gap) || new Set(gap.map((c) => c.join(','))).size !== n) out.push('gap-shape');
  if (new Set(freeKeys(gap)).size !== 8) out.push('gap-has-symmetry');
  if (!Array.isArray(R.tray) || R.tray.length !== N_TRAY || !Number.isInteger(R.answer) || R.answer < 0 || R.answer >= N_TRAY) return [...out, 'tray'];
  const cells = R.tray.map((p) => p?.cells);
  if (!cells.every((c) => Array.isArray(c) && c.length === n && connected(c) && Math.max(...dims(c)) <= HARD.maxExtent)) return [...out, 'tray-pieces'];
  const fits = cells.map((c) => [0, 1, 2, 3].filter((t) => key(rotN(c, t)) === key(gap)));
  if (fits.filter((f) => f.length).length !== 1 || fits[R.answer].length !== 1 || fits[R.answer][0] === 0) out.push('unique-fit');
  const others = cells.filter((_, i) => i !== R.answer);
  if (!others.some((c) => turnCongruent(c, mirrorX(gap)))) out.push('no-mirror-piece');
  const near = others.filter((c) => !freeCongruent(c, gap));
  if (near.length !== HARD.near) out.push('near-miss-count');
  const dk = dimKey(gap), bk = blocks2x2(gap);
  if (!near.every((c) => dimKey(c) === dk && blocks2x2(c) === bk)) out.push('near-miss-invariants');
  const oneMove = (c) => nearMisses(gap).some((N) => freeCongruent(N, c));
  if (!near.every(oneMove)) out.push('near-miss-not-one-move');
  for (let i = 0; i < N_TRAY; i++) for (let j = i + 1; j < N_TRAY; j++) if (turnCongruent(cells[i], cells[j])) out.push('duplicate-pieces');
  const target = bestOverlap(cells[R.answer], gap);
  for (const [i, c] of cells.entries()) {
    if (i === R.answer) continue;
    const d = [0, 1, 2, 3].map((t) => Math.abs(bestOverlap(rotN(c, t), gap) - target));
    if (d[0] !== Math.min(...d)) out.push('distractor-turn-not-levelled');
  }
  if (!Array.isArray(R.regions)) return [...out, 'regions'];
  const cover = new Map(gap.map((c) => [c.join(','), -1]));
  R.regions.forEach((r, i) => {
    if (!Array.isArray(r?.cells) || !r.cells.every(cellOk) || !connected(r.cells) || r.cells.length > HARD.boardPieceMax) out.push('region-shape');
    else for (const c of r.cells) { const k = c.join(','); if (cover.has(k)) out.push('region-overlap'); cover.set(k, i); }
    if (!Number.isInteger(r?.color) || r.color < 0 || r.color >= REGION_COLORS.length) out.push('region-color');
  });
  if (cover.size !== W * H) out.push('board-not-covered');
  return [...new Set(out)];
}

export function gate(m) {
  try {
    if (m?.task !== 'polyomino_fill_gap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
    if (m.rounds !== undefined) return false;
    if (m.snap !== SNAP || m.cell !== CELL || m.trayCell !== TC) return false;
    if (m.ext) {
      const lib = extLibrary(m.ext), k = freeKey(m.gap);
      if (!EXT_SIZES.some((n) => lib[n].some((e) => freeKey(e.cells) === k))) return false;
      return sceneProblems(m, EXT_SIZES).length === 0 && !EVAL_KEYS.has(semanticKey(m));
    }
    return sceneProblems(m).length === 0;
  } catch { return false; }
}

const cellRect = ([x, y]) => ({ x: GRID.x + x * CELL, y: GRID.y + y * CELL, w: CELL, h: CELL });
function slotRect(i) {
  const row = Math.floor(i / TRAY.perRow), col = i % TRAY.perRow;
  return { x: TRAY.x0 + col * (TRAY.slotW + TRAY.gap), y: TRAY.y + row * (TRAY.h + TRAY.rowGap), w: TRAY.slotW, h: TRAY.h };
}
const TRAY_ROWS = Math.ceil(N_TRAY / TRAY.perRow);
const PRESS_H = TRAY.h - 30;
function slotCenter(i) { const s = slotRect(i); return { x: s.x + s.w / 2, y: s.y + 42 }; }
function btnCenters(i) { const s = slotRect(i); return [{ x: s.x + s.w / 2 - 18, y: s.y + s.h - 16, dir: -1 }, { x: s.x + s.w / 2 + 18, y: s.y + s.h - 16, dir: 1 }]; }
function nearGap(R, p) {
  if (p.y > GRID.y + HARD.rows * CELL + SNAP) return false;
  return R.gap.some((c) => {
    const r = cellRect(c);
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
    return Math.hypot(dx, dy) <= SNAP;
  });
}
function gapDropPoint(R) {
  const cs = R.gap.map((c) => ({ x: GRID.x + (c[0] + 0.5) * CELL, y: GRID.y + (c[1] + 0.5) * CELL }));
  const mx = cs.reduce((s, p) => s + p.x, 0) / cs.length, my = cs.reduce((s, p) => s + p.y, 0) / cs.length;
  return cs.reduce((b, p) => (Math.hypot(p.x - mx, p.y - my) < Math.hypot(b.x - mx, b.y - my) ? p : b));
}
const currentCells = (R, S, i) => rotN(R.tray[i].cells, S.rot[i]);

function polyEdges(g, cells, ox, oy, s) {
  const set = new Set(cells.map((c) => c.join(',')));
  g.beginPath();
  for (const [x, y] of cells) {
    if (!set.has(`${x},${y - 1}`)) { g.moveTo(ox + x * s, oy + y * s); g.lineTo(ox + (x + 1) * s, oy + y * s); }
    if (!set.has(`${x},${y + 1}`)) { g.moveTo(ox + x * s, oy + (y + 1) * s); g.lineTo(ox + (x + 1) * s, oy + (y + 1) * s); }
    if (!set.has(`${x - 1},${y}`)) { g.moveTo(ox + x * s, oy + y * s); g.lineTo(ox + x * s, oy + (y + 1) * s); }
    if (!set.has(`${x + 1},${y}`)) { g.moveTo(ox + (x + 1) * s, oy + y * s); g.lineTo(ox + (x + 1) * s, oy + (y + 1) * s); }
  }
}

function drawPiece(g, cells, cx, cy, s, { ghost = false, lifted = false } = {}) {
  const [w, h] = dims(cells);
  const ox = cx - (w * s) / 2, oy = cy - (h * s) / 2;
  g.save();
  if (ghost) {
    g.setLineDash([4, 3]); g.strokeStyle = '#b3bcc6'; g.lineWidth = 1.5;
    polyEdges(g, cells, ox, oy, s); g.stroke();
    g.restore();
    return;
  }
  if (lifted) { g.shadowColor = 'rgba(0,0,0,.30)'; g.shadowBlur = 10; g.shadowOffsetY = 4; }
  else { g.shadowColor = 'rgba(0,0,0,.20)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5; }
  g.fillStyle = PIECE.fill;
  for (const [x, y] of cells) g.fillRect(ox + x * s - 0.25, oy + y * s - 0.25, s + 0.5, s + 0.5);
  g.shadowColor = 'transparent';
  g.strokeStyle = PIECE.inner; g.lineWidth = 1;
  for (const [x, y] of cells) g.strokeRect(ox + x * s + 2.5, oy + y * s + 2.5, s - 5, s - 5);
  g.strokeStyle = PIECE.edge; g.lineWidth = 2; g.lineCap = 'round';
  polyEdges(g, cells, ox, oy, s); g.stroke();
  g.restore();
}

function drawTurnButton(g, c, dir, enabled) {
  g.save();
  g.beginPath(); g.arc(c.x, c.y, BTN_R, 0, Math.PI * 2);
  g.fillStyle = enabled ? '#ffffff' : '#eef1f4'; g.fill();
  g.strokeStyle = enabled ? '#9aa9b8' : '#d7dde3'; g.lineWidth = 1; g.stroke();
  const col = enabled ? '#4b5b6b' : '#c3cbd3';
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.8; g.lineCap = 'round';
  const r = 5.6, a0 = dir > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, a1 = dir > 0 ? Math.PI * 0.35 : -Math.PI * 1.35;
  g.beginPath(); g.arc(c.x, c.y, r, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
  const tip = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
  const tan = dir > 0 ? a1 + Math.PI / 2 : a1 - Math.PI / 2;
  const bx = Math.cos(tan), by = Math.sin(tan);
  g.beginPath();
  g.moveTo(tip.x + bx * 3.6, tip.y + by * 3.6);
  g.lineTo(tip.x - by * 3.2 - bx * 0.6, tip.y + bx * 3.2 - by * 0.6);
  g.lineTo(tip.x + by * 3.2 - bx * 0.6, tip.y - bx * 3.2 - by * 0.6);
  g.closePath(); g.fill();
  g.restore();
}

const task = {
  meta: {
    name: 'polyomino_fill_gap', family: 'B', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'rotate', piece: '0..7 (tray slot, row by row, left to right)', dir: '1 = 90° clockwise, -1 = 90° anticlockwise' },
      { op: 'drag', piece: '0..7', to: { x: 'board px (piece centre)', y: 'board px' } },
      { op: 'unseat' },
    ],
    promptHuman: 'Turn the piece that fits and drag it in',
  },

  generate(rng, _level, _index, knobs) {
    if (knobs && knobs.ext) {
      for (let k = 0; k < 20; k++) {
        const m = { task: 'polyomino_fill_gap', board: { ...BOARD }, cell: CELL, trayCell: TC, snap: SNAP, ext: knobs.ext, ...genScene(rng, knobs.ext, knobs.n) };
        if (!EVAL_KEYS.has(semanticKey(m)) || k === 19) return m;
      }
    }
    return { task: 'polyomino_fill_gap', board: { ...BOARD }, cell: CELL, trayCell: TC, snap: SNAP, ...genScene(rng) };
  },

  init() {
    return { drag: null, rot: new Array(N_TRAY).fill(0), seated: -1 };
  },

  applyAction(state, a, m) {
    const R = m, S = state;
    if (a?.op === 'unseat') {
      if (S.seated < 0) return { ok: false, reason: 'empty-gap' };
      S.seated = -1; state.drag = null;
      return { ok: true };
    }
    const i = a?.piece;
    if (!Number.isInteger(i) || i < 0 || i >= N_TRAY) return { ok: false, reason: 'bad-piece' };
    if (a.op === 'rotate') {
      if (S.seated === i) return { ok: false, reason: 'piece-in-gap' };
      if (a.dir !== 1 && a.dir !== -1) return { ok: false, reason: 'bad-dir' };
      S.rot[i] = (S.rot[i] + a.dir + 4) % 4;
      return { ok: true };
    }
    if (a.op === 'drag') {
      if (!a.to || !Number.isFinite(a.to.x) || !Number.isFinite(a.to.y)) return { ok: false, reason: 'bad-to' };
      const to = { x: Math.max(0, Math.min(BOARD.w, a.to.x)), y: Math.max(0, Math.min(BOARD.h, a.to.y)) };
      if (a.transient) { state.drag = { piece: i, x: to.x, y: to.y }; return { ok: true }; }
      state.drag = null;
      if (nearGap(R, to)) S.seated = i;
      else if (S.seated === i) S.seated = -1;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const S = state;
    const success = S.seated === m.answer && key(currentCells(m, S, S.seated)) === key(m.gap);
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { seated: S.seated, answer: m.answer, turn: S.seated >= 0 ? S.rot[S.seated] : null } };
  },

  oracle(m) {
    const acts = [];
    const t = [0, 1, 2, 3].find((n) => key(rotN(m.tray[m.answer].cells, n)) === key(m.gap));
    if (t === 3) acts.push({ op: 'rotate', piece: m.answer, dir: -1 });
    else for (let k = 0; k < t; k++) acts.push({ op: 'rotate', piece: m.answer, dir: 1 });
    acts.push({ op: 'drag', piece: m.answer, to: gapDropPoint(m) });
    return acts;
  },

  randomPolicy(m, rnd) {
    const acts = [];
    const i = Math.floor(rnd() * N_TRAY), t = Math.floor(rnd() * 4);
    for (let k = 0; k < t; k++) acts.push({ op: 'rotate', piece: i, dir: 1 });
    acts.push({ op: 'drag', piece: i, to: gapDropPoint(m) });
    return acts;
  },

  gate,

  async mount(env) { if (env && env.style) env.assets.g15 = await mountLook(env.style); },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Turn the piece that fits and drag it in', 'Pieces turn but don\'t flip');
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.g15) { drawStyled(g, br, env, env.assets.g15); return; }
    const { manifest: m, state } = env;
    const R = m, S = state;
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#eef1f4'; g.fillRect(0, 0, BOARD.w, BOARD.h);

    const fw = HARD.cols * CELL, fh = HARD.rows * CELL;
    g.save();
    g.shadowColor = 'rgba(40,30,20,.25)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    rr(g, GRID.x - 8, GRID.y - 8, fw + 16, fh + 16, 7); g.fillStyle = '#b08d67'; g.fill();
    g.restore();
    rr(g, GRID.x - 8, GRID.y - 8, fw + 16, fh + 16, 7); g.strokeStyle = '#8a6b4b'; g.lineWidth = 1; g.stroke();
    const owner = new Map();
    R.regions.forEach((reg, i) => reg.cells.forEach((c) => owner.set(c.join(','), i)));
    R.gap.forEach((c) => owner.set(c.join(','), -1));
    for (const reg of R.regions) {
      g.fillStyle = REGION_COLORS[reg.color];
      for (const c of reg.cells) { const q = cellRect(c); g.fillRect(q.x, q.y, q.w, q.h); }
      g.strokeStyle = 'rgba(70,80,92,.16)'; g.lineWidth = 1;
      for (const c of reg.cells) { const q = cellRect(c); g.strokeRect(q.x + 3.5, q.y + 3.5, q.w - 7, q.h - 7); }
    }
    const seated = S.seated >= 0 && !(state.drag && state.drag.piece === S.seated);
    for (const c of R.gap) {
      const q = cellRect(c);
      g.fillStyle = seated ? PIECE.fill : GAP_FILL; g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = seated ? PIECE.inner : GAP_LINE; g.lineWidth = 1;
      g.strokeRect(q.x + 3.5, q.y + 3.5, q.w - 7, q.h - 7);
    }
    if (!seated) {
      const set = new Set(R.gap.map((c) => c.join(',')));
      g.fillStyle = 'rgba(0,0,0,.28)';
      for (const [x, y] of R.gap) {
        const q = cellRect([x, y]);
        if (!set.has(`${x},${y - 1}`)) g.fillRect(q.x, q.y, q.w, 4);
        if (!set.has(`${x - 1},${y}`)) g.fillRect(q.x, q.y, 4, q.h);
      }
    }
    g.strokeStyle = REGION_EDGE; g.lineWidth = 2; g.lineCap = 'square';
    g.beginPath();
    for (let y = 0; y < HARD.rows; y++) for (let x = 0; x < HARD.cols; x++) {
      const o = owner.get(`${x},${y}`), q = cellRect([x, y]);
      if (x + 1 < HARD.cols && owner.get(`${x + 1},${y}`) !== o) { g.moveTo(q.x + CELL, q.y); g.lineTo(q.x + CELL, q.y + CELL); }
      if (y + 1 < HARD.rows && owner.get(`${x},${y + 1}`) !== o) { g.moveTo(q.x, q.y + CELL); g.lineTo(q.x + CELL, q.y + CELL); }
    }
    g.stroke();
    g.strokeStyle = '#6e5238'; g.lineWidth = 2; g.strokeRect(GRID.x - 1, GRID.y - 1, fw + 2, fh + 2);

    rr(g, 2, TRAY.y - 8, BOARD.w - 4, TRAY_ROWS * TRAY.h + (TRAY_ROWS - 1) * TRAY.rowGap + 12, 8); g.fillStyle = '#e2e7ed'; g.fill();
    for (let i = 0; i < N_TRAY; i++) {
      const s = slotRect(i);
      rr(g, s.x, s.y, s.w, s.h, 7); g.fillStyle = '#f7f9fb'; g.fill();
      g.strokeStyle = '#d3dae2'; g.lineWidth = 1; g.stroke();
      const c = slotCenter(i), cells = currentCells(R, S, i);
      const away = S.seated === i || (state.drag && state.drag.piece === i);
      drawPiece(g, cells, c.x, c.y, TC, { ghost: away });
      for (const b of btnCenters(i)) drawTurnButton(g, b, b.dir, S.seated !== i);
    }

    if (state.drag) drawPiece(g, currentCells(R, S, state.drag.piece), state.drag.x, state.drag.y, TC, { lifted: true });
    g.restore();
  },

  pointer(e, env) {
    const { manifest: m, state } = env;
    if (env.submitted) return [];
    const R = m, S = state;
    if (e.type === 'down') {
      this._press = null;
      for (let i = 0; i < N_TRAY; i++) {
        if (S.seated === i) continue;
        for (const b of btnCenters(i)) if (Math.hypot(e.x - b.x, e.y - b.y) <= BTN_R + 3) return [{ op: 'rotate', piece: i, dir: b.dir }];
      }
      for (let i = 0; i < N_TRAY; i++) {
        const s = slotRect(i);
        if (S.seated === i && e.x >= s.x && e.x <= s.x + s.w && e.y >= s.y && e.y <= s.y + s.h) return [{ op: 'unseat' }];
        if (S.seated !== i && e.x >= s.x && e.x <= s.x + s.w && e.y >= s.y && e.y <= s.y + PRESS_H) {
          const c = slotCenter(i);
          this._press = { piece: i, x0: e.x, y0: e.y, ox: e.x - c.x, oy: e.y - c.y, moved: false, fromGap: false };
          return [];
        }
      }
      if (S.seated >= 0 && R.gap.some((c) => { const q = cellRect(c); return e.x >= q.x - 3 && e.x <= q.x + q.w + 3 && e.y >= q.y - 3 && e.y <= q.y + q.h + 3; })) {
        this._press = { piece: S.seated, x0: e.x, y0: e.y, ox: 0, oy: 0, moved: false, fromGap: true };
      }
      return [];
    }
    const p = this._press;
    if (!p) return [];
    if (e.type === 'move') {
      if (!p.moved && Math.hypot(e.x - p.x0, e.y - p.y0) < 5) return [];
      p.moved = true;
      return [{ op: 'drag', piece: p.piece, to: { x: e.x - p.ox, y: e.y - p.oy }, transient: true }];
    }
    if (e.type === 'up') {
      this._press = null;
      if (p.moved) return [{ op: 'drag', piece: p.piece, to: { x: e.x - p.ox, y: e.y - p.oy } }];
      return p.fromGap ? [{ op: 'unseat' }] : [{ op: 'rotate', piece: p.piece, dir: 1 }];
    }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    return env.state.seated < 0 ? 'Drag a piece in' : 'Piece placed';
  },
};

export default task;

const THEMES = ['wood', 'stone', 'plastic', 'ceramic', 'felt', 'cork', 'metal', 'terrazzo', 'leather', 'slate'];
const THEME_USE = { wood: ['wood'], stone: ['stone'], plastic: ['flat2d', 'floor'], ceramic: ['floor', 'wall'], felt: ['fabric'], cork: ['terrain', 'floor'], metal: ['metal'], terrazzo: ['floor', 'stone'], leather: ['fabric', 'flat2d'], slate: ['stone', 'roof'] };
const PIECE_COLS = ['#ef7f2d', '#e2483d', '#2f7fd8', '#f2c230', '#1fa58a', '#d64f9a', '#8a55d6'];
async function mountLook(st) {
  const theme = primaryOf(st, 'g15_poly_theme', splitList('g15_polyomino_theme', THEMES, st.split, 3), 'g15_polyomino_theme');
  const pool = texPool(st, THEME_USE[theme]);
  const regionTex = await makeMaterial(st, pool[Math.floor(st.rand() * pool.length)], { scale: [0.18, 0.3], rotate: false });
  const tables = texPool(st, ['wood', 'fabric', 'floor', 'stone']);
  const table = await makeMaterial(st, st.primary('tex', (t) => tables.includes(t)), { scale: [0.35, 0.6], rotate: false });
  const frames = texPool(st, ['wood', 'metal', 'stone']);
  const frame = await makeMaterial(st, frames[Math.floor(st.rand() * frames.length)], { scale: [0.2, 0.3], rotate: false });
  const finishes = texPool(st, ['terrain'], (t) => !isDirectional(t));
  const finish = await makeMaterial(st, finishes[Math.floor(st.rand() * finishes.length)], { scale: [0.3, 0.45], rotate: false });
  const T = THEME_TINT[theme];
  const h0 = T.hue[0] + st.rand() * (T.hue[1] - T.hue[0]);
  const tints = Array.from({ length: 7 }, (_, i) => hsl(T.spread ? h0 + i * 360 / 7 + (st.rand() - 0.5) * 16 : T.hue[0] + st.rand() * (T.hue[1] - T.hue[0]),
    T.sat[0] + st.rand() * (T.sat[1] - T.sat[0]), T.light[0] + ((i * 3) % 7) / 6 * (T.light[1] - T.light[0])));
  const hueOf = (hex) => { const [r, g2, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255); const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn;
    if (d < 1e-6) return -1; const h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4; return ((h * 60) + 360) % 360; };
  const hd = (a, b) => (a < 0 || b < 0 ? 180 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)));
  const ranked = splitList('g15_polyomino_piece_colour', PIECE_COLS, st.split, 2).map((c) => [Math.min(...tints.map((t) => hd(hueOf(c), hueOf(t)))), c]).sort((a, b) => b[0] - a[0]);
  const far = ranked.filter((r) => r[0] >= Math.min(60, ranked[0][0]));
  const piece = far[Math.floor(st.rand() * far.length)][1];
  st.note(`g15_polyomino_piece_colour:${piece}`);
  return { theme, regionTex, table, frame, finish, tints, piece, pieceInner: shadeHex(piece, -0.22), pieceEdge: shadeHex(piece, -0.55),
    tableL: 0.55 + st.rand() * 0.2, gloss: !!T.gloss, regionL: T.regionL, tintA: T.tintA };
}
const THEME_TINT = {
  wood: { hue: [18, 46], sat: [32, 55], light: [50, 72], tintA: 0.45, regionL: 0.64 },
  stone: { hue: [0, 360], sat: [5, 14], light: [52, 82], tintA: 0.5, regionL: 0.7 },
  plastic: { hue: [0, 360], spread: true, sat: [62, 72], light: [58, 66], tintA: 1, regionL: 0.92, gloss: true },
  ceramic: { hue: [0, 360], spread: true, sat: [35, 48], light: [66, 78], tintA: 0.85, regionL: 0.88, gloss: true },
  felt: { hue: [0, 360], spread: true, sat: [38, 50], light: [52, 62], tintA: 0.7, regionL: 0.74 },
  cork: { hue: [24, 40], sat: [35, 50], light: [52, 70], tintA: 0.5, regionL: 0.66 },
  metal: { hue: [190, 230], sat: [4, 12], light: [55, 80], tintA: 0.5, regionL: 0.72 },
  terrazzo: { hue: [0, 360], spread: true, sat: [22, 32], light: [72, 82], tintA: 0.7, regionL: 0.86 },
  leather: { hue: [12, 38], sat: [38, 52], light: [50, 64], tintA: 0.55, regionL: 0.62 },
  slate: { hue: [195, 225], sat: [6, 14], light: [50, 66], tintA: 0.5, regionL: 0.62 },
};
function cellsShape(cells) { return (g) => { g.beginPath(); for (const c of cells) { const q = cellRect(c); g.rect(q.x, q.y, q.w, q.h); } }; }
function drawStyled(g, br, env, L) {
  const { manifest: m, state } = env;
  const R = m, S = state;
  g.save(); g.translate(br.x, br.y);
  fillMaterial(g, L.table, rectShape(0, 0, BOARD.w, BOARD.h), { target: L.tableL, contrastK: 0.6 });
  const fw = HARD.cols * CELL, fh = HARD.rows * CELL;
  g.save(); g.shadowColor = 'rgba(20,15,10,.35)'; g.shadowBlur = 7; g.shadowOffsetY = 2;
  rr(g, GRID.x - 8, GRID.y - 8, fw + 16, fh + 16, 7); g.fillStyle = '#6b5640'; g.fill(); g.restore();
  fillMaterial(g, L.frame, rrShape(GRID.x - 8, GRID.y - 8, fw + 16, fh + 16, 7), { target: 0.4, contrastK: 0.7 });
  const owner = new Map();
  R.regions.forEach((reg, i) => reg.cells.forEach((c) => owner.set(c.join(','), i)));
  R.gap.forEach((c) => owner.set(c.join(','), -1));
  R.regions.forEach((reg, i) => {
    const M = { ...L.regionTex, ox: L.regionTex.ox + i * 97, oy: L.regionTex.oy + i * 61 };
    fillMaterial(g, M, cellsShape(reg.cells), { target: L.regionL, contrastK: 0.95, tint: L.tints[reg.color], tintAlpha: L.tintA });
    const xs = reg.cells.map((c) => c[0]), ys = reg.cells.map((c) => c[1]);
    const bx0 = GRID.x + Math.min(...xs) * CELL, by0 = GRID.y + Math.min(...ys) * CELL;
    const bx1 = GRID.x + (Math.max(...xs) + 1) * CELL, by1 = GRID.y + (Math.max(...ys) + 1) * CELL;
    const bev = g.createLinearGradient(bx0, by0, bx1, by1);
    bev.addColorStop(0, 'rgba(255,255,255,.16)'); bev.addColorStop(1, 'rgba(0,0,0,.12)');
    cellsShape(reg.cells)(g); g.fillStyle = bev; g.fill();
    if (L.gloss) {
      g.fillStyle = 'rgba(255,255,255,.22)';
      for (const c of reg.cells) { const q = cellRect(c); g.fillRect(q.x + 3, q.y + 3, q.w - 6, 3); }
    }
    g.strokeStyle = 'rgba(40,30,20,.16)'; g.lineWidth = 1;
    for (const c of reg.cells) { const q = cellRect(c); g.strokeRect(q.x + 3.5, q.y + 3.5, q.w - 7, q.h - 7); }
  });
  const seated = S.seated >= 0 && !(state.drag && state.drag.piece === S.seated);
  if (seated) {
    fillMaterial(g, L.finish, cellsShape(R.gap), { target: 0.86, contrastK: 0.2, tint: L.piece });
    g.strokeStyle = L.pieceInner; g.lineWidth = 1;
    for (const c of R.gap) { const q = cellRect(c); g.strokeRect(q.x + 3.5, q.y + 3.5, q.w - 7, q.h - 7); }
  } else {
    for (const c of R.gap) {
      const q = cellRect(c);
      g.fillStyle = '#262e37'; g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = '#3d4855'; g.lineWidth = 1; g.strokeRect(q.x + 3.5, q.y + 3.5, q.w - 7, q.h - 7);
    }
    const set = new Set(R.gap.map((c) => c.join(',')));
    g.fillStyle = 'rgba(0,0,0,.34)';
    for (const [x, y] of R.gap) {
      const q = cellRect([x, y]);
      if (!set.has(`${x},${y - 1}`)) g.fillRect(q.x, q.y, q.w, 4);
      if (!set.has(`${x - 1},${y}`)) g.fillRect(q.x, q.y, 4, q.h);
    }
  }
  g.strokeStyle = 'rgba(40,32,26,.85)'; g.lineWidth = 2; g.lineCap = 'square';
  g.beginPath();
  for (let y = 0; y < HARD.rows; y++) for (let x = 0; x < HARD.cols; x++) {
    const o = owner.get(`${x},${y}`), q = cellRect([x, y]);
    if (x + 1 < HARD.cols && owner.get(`${x + 1},${y}`) !== o) { g.moveTo(q.x + CELL, q.y); g.lineTo(q.x + CELL, q.y + CELL); }
    if (y + 1 < HARD.rows && owner.get(`${x},${y + 1}`) !== o) { g.moveTo(q.x, q.y + CELL); g.lineTo(q.x + CELL, q.y + CELL); }
  }
  g.stroke();
  g.strokeStyle = 'rgba(30,22,16,.9)'; g.lineWidth = 2; g.strokeRect(GRID.x - 1, GRID.y - 1, fw + 2, fh + 2);
  rr(g, 2, TRAY.y - 8, BOARD.w - 4, TRAY_ROWS * TRAY.h + (TRAY_ROWS - 1) * TRAY.rowGap + 12, 8); g.fillStyle = 'rgba(236,239,243,.92)'; g.fill();
  for (let i = 0; i < N_TRAY; i++) {
    const s = slotRect(i);
    rr(g, s.x, s.y, s.w, s.h, 7); g.fillStyle = '#f9fafb'; g.fill();
    g.strokeStyle = '#d3dae2'; g.lineWidth = 1; g.stroke();
    const c = slotCenter(i), cells = currentCells(R, S, i);
    const away = S.seated === i || (state.drag && state.drag.piece === i);
    drawPieceStyled(g, cells, c.x, c.y, TC, L, { ghost: away });
    for (const b of btnCenters(i)) drawTurnButton(g, b, b.dir, S.seated !== i);
  }
  if (state.drag) drawPieceStyled(g, currentCells(R, S, state.drag.piece), state.drag.x, state.drag.y, TC, L, { lifted: true });
  g.restore();
}
function drawPieceStyled(g, cells, cx, cy, s, L, { ghost = false, lifted = false } = {}) {
  if (ghost) { drawPiece(g, cells, cx, cy, s, { ghost: true }); return; }
  const [w, h] = dims(cells);
  const ox = cx - (w * s) / 2, oy = cy - (h * s) / 2;
  const shape = (gg) => { gg.beginPath(); for (const [x, y] of cells) gg.rect(ox + x * s - 0.25, oy + y * s - 0.25, s + 0.5, s + 0.5); };
  g.save();
  g.shadowColor = lifted ? 'rgba(0,0,0,.30)' : 'rgba(0,0,0,.20)'; g.shadowBlur = lifted ? 10 : 3; g.shadowOffsetY = lifted ? 4 : 1.5;
  shape(g); g.fillStyle = L.piece; g.fill();
  g.shadowColor = 'transparent';
  fillMaterial(g, L.finish, shape, { target: 0.86, contrastK: 0.2, tint: L.piece });
  g.fillStyle = 'rgba(255,255,255,.2)';
  for (const [x, y] of cells) g.fillRect(ox + x * s + 2, oy + y * s + 2, s - 4, 2);
  g.strokeStyle = L.pieceInner; g.lineWidth = 1;
  for (const [x, y] of cells) g.strokeRect(ox + x * s + 2.5, oy + y * s + 2.5, s - 5, s - 5);
  g.strokeStyle = L.pieceEdge; g.lineWidth = 2; g.lineCap = 'round';
  polyEdges(g, cells, ox, oy, s); g.stroke();
  g.restore();
}

export function semanticKey(m) {
  const cells = (c) => norm(c).map((p) => p.join(',')).join(';');
  const gap = m.gap.map((p) => p.join(',')).sort().join(';');
  return `polyomino_fill_gap|${gap}|${m.tray.map((t, i) => (i === m.answer ? '*' : '') + cells(t.cells)).join('|')}`;
}
