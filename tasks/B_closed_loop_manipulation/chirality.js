import { clamp } from '../core/geom.js';
import { drawPromptText, ACCENT } from '../core/panel.js';
import { hash32 } from '../core/style.js';
import { primaryOf, kindTexPairs, detail, tinted, natural, pat, isoTex, shade, mix, lumOf, rgba, splitList, pickSplit, toneTo } from '../common/_block_mat.js';

const BOARD = { w: 340, h: 380 };
const CELL = 13;
const N_SLOT = 4;
const N_NEAR = 2;
const SNAP_R = 38;
const TRAY_TOP = 124;
const SLOT_POS = [{ x: 47, y: 62 }, { x: 129, y: 62 }, { x: 211, y: 62 }, { x: 293, y: 62 }];
const SEATS = [
  { x: 62, y: 172 }, { x: 170, y: 172 }, { x: 278, y: 172 },
  { x: 62, y: 254 }, { x: 170, y: 254 }, { x: 278, y: 254 },
  { x: 62, y: 336 }, { x: 170, y: 336 }, { x: 278, y: 336 },
];
const TAP_MOVE = 6;
const MIN_MIRROR_DIFF = 4;
const MIN_PAIR_DIFF = 4;
const NEAR_DIFF = 2;

const GLYPHS = {
  F: ['####', '#...', '###.', '#...', '#...'],
  J: ['####', '..#.', '..#.', '#.#.', '###.'],
  L: ['#...', '#...', '#...', '#...', '####'],
  P: ['####', '#..#', '####', '#...', '#...'],
  h: ['#...', '#...', '####', '#..#', '#..#'],
  2: ['####', '...#', '####', '#...', '####'],
  4: ['#.#.', '#.#.', '####', '..#.', '..#.'],
};

const norm = (cs) => {
  const mx = Math.min(...cs.map((c) => c[0])), my = Math.min(...cs.map((c) => c[1]));
  return cs.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const turn = (cs, k) => { let o = cs; for (let i = 0; i < ((k % 4) + 4) % 4; i++) o = o.map(([x, y]) => [-y, x]); return norm(o); };
const mirror = (cs) => norm(cs.map(([x, y]) => [-x, y]));
const keyOf = (cs) => norm(cs).map((c) => c.join(',')).join(';');
const parse = (rows) => norm(rows.flatMap((r, y) => [...r].map((ch, x) => (ch === '#' ? [x, y] : null)).filter(Boolean)));
const symDiff = (a, b) => {
  const sa = new Set(a.map((c) => c.join(','))), sb = new Set(b.map((c) => c.join(',')));
  let d = 0; for (const x of sa) if (!sb.has(x)) d++; for (const x of sb) if (!sa.has(x)) d++;
  return d;
};
const minDiff = (a, b, flips) => {
  let best = Infinity;
  for (const B of flips ? [b, mirror(b)] : [b]) for (let k = 0; k < 4; k++) best = Math.min(best, symDiff(norm(a), turn(B, k)));
  return best;
};
const connected = (cs) => {
  const s = new Set(cs.map((c) => c.join(','))), seen = new Set([cs[0].join(',')]), st = [cs[0]];
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (s.has(k) && !seen.has(k)) { seen.add(k); st.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cs.length;
};
const fitsAt = (pieceCells, pieceRot, slot) => keyOf(turn(pieceCells, pieceRot)) === keyOf(turn(slot.cells, slot.rot));
const fitTurns = (pieceCells, slot) => [0, 1, 2, 3].filter((k) => fitsAt(pieceCells, k, slot));
const dims = (cs) => ({ w: Math.max(...cs.map((c) => c[0])) + 1, h: Math.max(...cs.map((c) => c[1])) + 1 });
const near = (a, b, r = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
const seatedSlot = (state, id) => (Number.isInteger(state.pieces[id]?.in) ? state.pieces[id].in : -1);
function snapSlot(m, to) {
  let target = -1, best = Infinity;
  m.slots.forEach((s, k) => { const d = Math.hypot(to.x - s.pos.x, to.y - s.pos.y); if (d <= m.snapR && d < best) { best = d; target = k; } });
  return target;
}

function oneCellMoves(cs) {
  const out = [], seen = new Set();
  for (let r = 0; r < cs.length; r++) {
    const rest = cs.filter((_, i) => i !== r);
    if (!connected(rest)) continue;
    const on = new Set(rest.map((c) => c.join(',')));
    for (const [x, y] of rest) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = [x + dx, y + dy], k = q.join(',');
      if (on.has(k) || (q[0] === cs[r][0] && q[1] === cs[r][1])) continue;
      const nc = norm([...rest, q]), d = dims(nc);
      if (Math.max(d.w, d.h) > 5) continue;
      const key = keyOf(nc);
      if (seen.has(key)) continue; seen.add(key);
      if (minDiff(nc, cs, false) !== NEAR_DIFF) continue;
      out.push(nc);
    }
  }
  return out;
}

export function gate(m) {
  if (m?.ext) return extGate(m);
  if (m?.task !== 'chirality' || !Array.isArray(m.slots) || !Array.isArray(m.pieces)) return false;
  if (m.slots.length !== N_SLOT || m.pieces.length < N_SLOT + 2 + N_NEAR || m.pieces.length > N_SLOT + 3 + N_NEAR) return false;
  if (m.snapR !== SNAP_R || m.cell !== CELL) return false;
  const all = [...m.slots.map((s) => s.cells), ...m.pieces.map((p) => p.cells)];
  if (!all.every((cs) => Array.isArray(cs) && cs.length >= 8 && connected(cs))) return false;
  for (const s of m.slots) {
    if (minDiff(s.cells, mirror(s.cells), false) < MIN_MIRROR_DIFF) return false;
    if (!Number.isInteger(s.rot) || s.rot < 0 || s.rot > 3) return false;
  }
  for (let i = 0; i < N_SLOT; i++) for (let j = i + 1; j < N_SLOT; j++) {
    if (minDiff(m.slots[i].cells, m.slots[j].cells, true) < MIN_PAIR_DIFF) return false;
  }
  const own = m.slots.map(() => []);
  let mirrors = 0, nears = 0;
  for (const p of m.pieces) {
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > 3) return false;
    const fitsSlots = m.slots.map((s, k) => (fitTurns(p.cells, s).length ? k : -1)).filter((k) => k >= 0);
    if (fitsSlots.length > 1) return false;
    if (fitsSlots.length === 1) {
      const s = m.slots[fitsSlots[0]];
      if (p.slot !== fitsSlots[0] || fitsAt(p.cells, p.rot, s)) return false;
      own[fitsSlots[0]].push(p);
    } else if (p.slot === -1) {
      if (!m.slots.some((s) => keyOf(mirror(s.cells)) === keyOf(p.cells) || fitTurns(p.cells, { cells: mirror(s.cells), rot: 0 }).length)) return false;
      mirrors++;
    } else if (p.slot === -2) {
      if (m.slots.some((s) => fitTurns(p.cells, { cells: mirror(s.cells), rot: 0 }).length)) return false;
      if (!m.slots.some((s) => s.cells.length === p.cells.length && minDiff(p.cells, s.cells, false) === NEAR_DIFF)) return false;
      if (Math.max(dims(p.cells).w, dims(p.cells).h) > 5) return false;
      nears++;
    } else return false;
  }
  if (!own.every((a) => a.length === 1) || mirrors < 2 || nears !== N_NEAR) return false;
  const seatKeys = new Set(m.pieces.map((p) => `${p.seat.x},${p.seat.y}`));
  if (seatKeys.size !== m.pieces.length) return false;
  const inside = (c, cs, rot) => { const d = dims(turn(cs, rot)); return c.x - d.w * CELL / 2 >= 8 && c.x + d.w * CELL / 2 <= m.board.w - 8 && c.y - d.h * CELL / 2 >= 8 && c.y + d.h * CELL / 2 <= m.board.h - 8; };
  for (const s of m.slots) if (!(s.pos.y + 2.5 * CELL < m.trayTop) || !inside(s.pos, s.cells, s.rot)) return false;
  for (const p of m.pieces) if (!(p.seat.y - 2.5 * CELL > m.trayTop) || !inside(p.seat, p.cells, p.rot)) return false;
  return true;
}

const EXTRA_GLYPHS = {
  G: ['####', '#...', '#.##', '#..#', '####'], R: ['###.', '#..#', '###.', '#.#.', '#..#'], Q: ['###.', '#.#.', '#.#.', '###.', '..##'],
  e: ['####', '#..#', '####', '#...', '####'], g: ['####', '#..#', '####', '...#', '###.'], k: ['#...', '#..#', '#.#.', '###.', '#..#'],
  t: ['.#..', '####', '.#..', '.#..', '.##.'], f: ['..##', '.#..', '####', '.#..', '.#..'], y: ['#..#', '#..#', '####', '...#', '###.'],
  r: ['#.##', '##..', '#...', '#...', '#...'],
};
const d4Key = (cs) => { let best = null; for (const B of [cs, mirror(cs)]) for (let k = 0; k < 4; k++) { const kk = keyOf(turn(B, k)); if (best === null || kk < best) best = kk; } return best; };
const EVAL_CLASSES = new Set(Object.values(GLYPHS).map((g) => d4Key(parse(g))));
const shapeSplit = (cs) => (hash32(`chirality_shape|${d4Key(cs)}`) % 10 === 0 ? 'test' : 'train');
function shapeOk(cs) {
  if (cs.length < 8 || !connected(cs)) return false;
  const d = dims(cs);
  if (Math.max(d.w, d.h) > 5 || Math.min(d.w, d.h) < 3) return false;
  return minDiff(cs, mirror(cs), false) >= MIN_MIRROR_DIFF && !EVAL_CLASSES.has(d4Key(cs));
}
function randomPoly(rng) {
  const W = rng.int(3, 5), H = rng.int(4, 5), n = rng.int(Math.max(8, Math.ceil(0.45 * W * H)), Math.min(11, W * H - 5));
  const start = [rng.int(0, W - 1), rng.int(0, H - 1)];
  const on = new Set([start.join(',')]), cells = [start];
  while (cells.length < n) {
    const [x, y] = rng.pick(cells), [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const q = [x + dx, y + dy];
    if (q[0] < 0 || q[1] < 0 || q[0] >= W || q[1] >= H || on.has(q.join(','))) continue;
    on.add(q.join(',')); cells.push(q);
  }
  return norm(cells);
}
function extShape(rng, split, letterOk = true) {
  for (let att = 0; att < 400; att++) {
    let cs;
    if (letterOk && rng.raw() < 0.12) { const g = EXTRA_GLYPHS[rng.pick(Object.keys(EXTRA_GLYPHS))]; cs = parse(g); if (rng.raw() < 0.5) cs = mirror(cs); }
    else cs = randomPoly(rng);
    if (shapeOk(cs) && shapeSplit(cs) === split) return cs;
  }
  return null;
}
function extLayout(rng, nSlot, nPiece) {
  const cell = rng.int(CELL, CELL + 1), half = 2.5 * cell;
  const above = rng.raw() < 0.35;
  const H = BOARD.h, W = BOARD.w;
  const trayH = Math.round(2 * (5 * cell + 10) + rng.uniform(4, 16));
  const tray = above ? { y0: 0, y1: trayH } : { y0: H - trayH, y1: H };
  const slotBand = above ? [tray.y1 + half + 6, H - half - 8] : [half + 8, tray.y0 - half - 6];
  if (slotBand[1] < slotBand[0]) return null;
  const sy = Math.round(rng.uniform(slotBand[0], slotBand[1]));
  const span = W - 2 * (half + 10), step = span / nSlot;
  const slots = Array.from({ length: nSlot }, (_, i) => ({ x: Math.round(half + 10 + step * (i + 0.5) + rng.uniform(-0.12, 0.12) * step), y: sy + Math.round(rng.uniform(-4, 4)) }));
  const cols = Math.max(Math.ceil(nPiece / 2), Math.min(4, Math.floor((W - 16) / (5 * cell + 10))));
  if (cols * 2 < nPiece || cols * (5 * cell + 10) > W - 8) return null;
  const cw = (W - 8) / cols, rows = [tray.y0 + trayH * 0.27, tray.y0 + trayH * 0.73];
  const seats = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) seats.push({ x: Math.round(4 + cw * (c + 0.5) + rng.uniform(-4, 4)), y: Math.round(rows[r] + rng.uniform(-3, 3)) });
  return { cell, tray, slots, seats, above };
}
function generateExt(rng, split) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const nSlot = 3, nMirror = rng.int(2, 3);
    const L = extLayout(rng, nSlot, nSlot + nMirror);
    if (!L) continue;
    const shapes = [];
    const letterKeys = new Set(Object.values(EXTRA_GLYPHS).map((g) => d4Key(parse(g))));
    for (let i = 0; i < nSlot; i++) { const cs = extShape(rng, split, !shapes.some((q) => letterKeys.has(d4Key(q)))); if (cs) shapes.push(cs); }
    if (shapes.length !== nSlot) continue;
    let okPair = true;
    for (let i = 0; i < nSlot && okPair; i++) for (let j = i + 1; j < nSlot; j++) if (minDiff(shapes[i], shapes[j], true) < MIN_PAIR_DIFF) { okPair = false; break; }
    if (!okPair) continue;
    const slots = shapes.map((cells, i) => ({ pos: { ...L.slots[i] }, rot: rng.int(0, 3), cells }));
    const mirrorOf = rng.sample(Array.from({ length: nSlot }, (_, i) => i), nMirror);
    const list = [
      ...slots.map((s2, i) => ({ cells: s2.cells.map((c) => [...c]), slot: i, rot: (s2.rot + rng.int(1, 3)) % 4 })),
      ...mirrorOf.map((i) => ({ cells: mirror(slots[i].cells), slot: -1, rot: rng.int(0, 3) })),
    ];
    const seatIdx = rng.shuffle(L.seats.map((_, k) => k));
    const pieces = rng.shuffle(list).map((p, i) => {
      const k = rng.int(0, 3);
      return { cells: turn(p.cells, k), rot: (p.rot - k + 4) % 4, slot: p.slot, seat: { ...L.seats[seatIdx[i]] } };
    });
    const m = { task: 'chirality', board: BOARD, cell: L.cell, snapR: Math.round(L.cell * 2.9), trayTop: L.above ? L.tray.y1 : L.tray.y0, slots, pieces,
      ext: { nSlot, tray: L.tray, above: L.above } };
    if (extGate(m)) return m;
  }
  throw new Error('chirality: no valid ext instance');
}
function extGate(m) {
  if (m?.task !== 'chirality' || !m.ext || !Array.isArray(m.slots) || !Array.isArray(m.pieces)) return false;
  const nS = m.slots.length, C = m.cell;
  if (nS !== m.ext.nSlot || nS < 2 || nS > 4 || m.pieces.length < nS + 2 || m.pieces.length > nS + 3) return false;
  if (!(C >= CELL && C <= CELL + 1) || m.snapR !== Math.round(C * 2.9)) return false;
  const all = [...m.slots.map((s) => s.cells), ...m.pieces.map((p) => p.cells)];
  if (!all.every((cs) => Array.isArray(cs) && cs.length >= 8 && connected(cs))) return false;
  for (const s of m.slots) {
    if (!shapeOk(s.cells)) return false;
    if (!Number.isInteger(s.rot) || s.rot < 0 || s.rot > 3) return false;
  }
  for (let i = 0; i < nS; i++) for (let j = i + 1; j < nS; j++) if (minDiff(m.slots[i].cells, m.slots[j].cells, true) < MIN_PAIR_DIFF) return false;
  const own = m.slots.map(() => []);
  let mirrors = 0;
  for (const p of m.pieces) {
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > 3) return false;
    const fitsSlots = m.slots.map((s, k) => (fitTurns(p.cells, s).length ? k : -1)).filter((k) => k >= 0);
    if (fitsSlots.length > 1) return false;
    if (fitsSlots.length === 1) {
      const s = m.slots[fitsSlots[0]];
      if (p.slot !== fitsSlots[0] || fitsAt(p.cells, p.rot, s)) return false;
      own[fitsSlots[0]].push(p);
    } else {
      if (p.slot !== -1) return false;
      if (!m.slots.some((s) => fitTurns(p.cells, { cells: mirror(s.cells), rot: 0 }).length)) return false;
      mirrors++;
    }
  }
  if (!own.every((a) => a.length === 1) || mirrors < 2) return false;
  if (new Set(m.pieces.map((p) => `${p.seat.x},${p.seat.y}`)).size !== m.pieces.length) return false;
  const half = 2.5 * C, { tray } = m.ext;
  const inside = (c, cs, rot) => { const d = dims(turn(cs, rot)); return c.x - d.w * C / 2 >= 4 && c.x + d.w * C / 2 <= m.board.w - 4 && c.y - d.h * C / 2 >= 4 && c.y + d.h * C / 2 <= m.board.h - 4; };
  for (const s of m.slots) if (!inside(s.pos, s.cells, s.rot) || (s.pos.y + half > tray.y0 && s.pos.y - half < tray.y1)) return false;
  for (const p of m.pieces) if (!inside(p.seat, p.cells, p.rot) || p.seat.y - half < tray.y0 - 2 || p.seat.y + half > tray.y1 + 2) return false;
  for (let i = 0; i < nS; i++) for (let j = i + 1; j < nS; j++) if (Math.hypot(m.slots[i].pos.x - m.slots[j].pos.x, m.slots[i].pos.y - m.slots[j].pos.y) < 5 * C + 6) return false;
  for (let i = 0; i < m.pieces.length; i++) for (let j = i + 1; j < m.pieces.length; j++) {
    const a = m.pieces[i].seat, b = m.pieces[j].seat;
    if (Math.abs(a.x - b.x) < 5 * C + 4 && Math.abs(a.y - b.y) < 5 * C + 4) return false;
  }
  return true;
}

async function mountLook(st) {
  const pairs = kindTexPairs(st, ['felt', 'stone', 'plastic', 'concrete', 'paper', 'leather'], (t) => isoTex(t, 0.2, 0.26), 'chirality');
  const boards = st.pool('tex', (t) => isoTex(t, 0.22, 0.3) && t.use !== 'metal');
  const [[kind, tex], btex] = primaryOf(st, 'g17_chirality', [pairs, boards]);
  st.note(`piece:${kind}:${tex.id}`); st.note(`board:${btex.id}`);
  const r = st.rand;
  const PIECE = ['#5b8def', '#e0663f', '#3f9c6b', '#c9a227', '#8a5cc2', '#d24b6a', '#2f9fb0', '#6d7782', '#b5651d', '#4f6d2f', '#c2410c', '#1e6091', '#9d4edd', '#2a9d8f'];
  const dark = r() < 0.3;
  const bL = dark ? 0.16 + 0.08 * r() : 0.8 + 0.1 * r();
  const shadeK = kind === 'stone' || kind === 'concrete' ? 0.9 : 1;
  const okCol = splitList(st, 'g17_piece_colour', PIECE, 4).map((c) => shade(c, shadeK)).filter((c) => Math.abs(lumOf(c) - (dark ? bL + 0.07 : bL - 0.08)) >= 0.22 && Math.abs(lumOf(c) - bL) >= 0.22);
  const pieceHex = okCol.length ? okCol[Math.floor(r() * okCol.length)] : (dark ? '#e9c23a' : '#3f6fd0');
  st.note(`g17_piece_colour:${pieceHex}`);
  const det = await detail(tex.file, 128);
  const piece = tinted(det, pieceHex, kind === 'plastic' ? 0.08 : kind === 'paper' ? 0.14 : 0.32);
  const BOARD_TINTS = ['#c8a57a', '#6f8f5e', '#7d93a8', '#efe3c6', '#b07a5a', '#8c8c8c', '#5b6f8a', '#a3b18a', '#d9b8c4', '#7a6a58', '#bfa6d9', '#9fb8b0'];
  const tint = pickSplit(st, 'g17_board_tint', BOARD_TINTS, 3);
  const tL = dark ? bL + 0.07 : bL - 0.08;
  const board = await natural(btex.file, { L: bL, contrast: 0.25, sat: 0.25, tint: toneTo(tint, bL / 0.9, 0.6), tintK: 0.7 });
  const tray = await natural(btex.file, { L: tL, contrast: 0.25, sat: 0.25, tint: toneTo(tint, tL / 0.9, 0.6), tintK: 0.7 });
  const ink = dark ? '#e8ecef' : '#3f4a57';
  return {
    kind, piece, pieceHex, board, tray, dark, k: 0.6 + 0.5 * r(), off: [r() * 256, r() * 256],
    edge: shade(pieceHex, 0.62), ink, slotFill: dark ? 'rgba(255,255,255,0.14)' : 'rgba(40,60,90,0.12)',
    dash: pickSplit(st, 'g17_dash', ['5-4', '2-3', '7-3', '3-3', '6-2', '4-4']).split('-').map(Number), dashW: 1.5 + 0.4 * r(), gloss: kind === 'plastic',
  };
}

export default {
  meta: {
    name: 'chirality', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'drag', id: 'piece index', to: { x: 'px', y: 'px' } },
      { op: 'turn', id: 'piece index' },
    ],
    promptHuman: 'Fill each outline with a piece that fits',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext);
    const names = Object.keys(GLYPHS);
    for (let attempt = 0; attempt < 500; attempt++) {
      const pick = rng.sample(names, N_SLOT);
      const shapes = pick.map((n) => (rng.raw() < 0.5 ? parse(GLYPHS[n]) : mirror(parse(GLYPHS[n]))));
      let okPair = true;
      for (let i = 0; i < N_SLOT && okPair; i++) for (let j = i + 1; j < N_SLOT; j++) if (minDiff(shapes[i], shapes[j], true) < MIN_PAIR_DIFF) { okPair = false; break; }
      if (!okPair) continue;
      if (!shapes.every((s) => minDiff(s, mirror(s), false) >= MIN_MIRROR_DIFF)) continue;
      const slots = shapes.map((cells, i) => ({ pos: { ...SLOT_POS[i] }, rot: rng.int(0, 3), cells }));
      const nMirror = rng.int(2, 3);
      const mirrorOf = rng.sample([...Array(N_SLOT).keys()], nMirror);
      const nearOf = rng.sample([...Array(N_SLOT).keys()], N_NEAR);
      const nears = [];
      for (const i of nearOf) {
        const cand = rng.shuffle(oneCellMoves(slots[i].cells)).filter((nc) =>
          slots.every((s) => !fitTurns(nc, s).length && !fitTurns(nc, { cells: mirror(s.cells), rot: 0 }).length)
          && nears.every((q) => minDiff(nc, q, false) > 0));
        if (cand.length) nears.push(cand[0]);
      }
      if (nears.length !== N_NEAR) continue;
      const list = [
        ...slots.map((s, i) => ({ cells: s.cells.map((c) => [...c]), slot: i, rot: (s.rot + rng.int(1, 3)) % 4 })),
        ...mirrorOf.map((i) => ({ cells: mirror(slots[i].cells), slot: -1, rot: rng.int(0, 3) })),
        ...nears.map((cells) => ({ cells, slot: -2, rot: rng.int(0, 3) })),
      ];
      const seats = rng.shuffle(SEATS.map((_, k) => k));
      const pieces = rng.shuffle(list).map((p, i) => {
        const k = rng.int(0, 3);
        return { cells: turn(p.cells, k), rot: (p.rot - k + 4) % 4, slot: p.slot, seat: { ...SEATS[seats[i]] } };
      });
      const m = { task: 'chirality', board: BOARD, cell: CELL, snapR: SNAP_R, trayTop: TRAY_TOP, slots, pieces };
      if (gate(m)) return m;
    }
    throw new Error('chirality: no valid instance');
  },

  init(m) {
    return { pieces: m.pieces.map((p) => ({ pos: { ...p.seat }, rot: p.rot })) };
  },

  applyAction(state, action, m) {
    const pc = state.pieces[action?.id];
    if (!pc) return { ok: false, reason: 'bad-id' };
    const lock = !m.ext;
    if (lock && seatedSlot(state, action.id) >= 0) return { ok: false, reason: 'seated' };
    if (action.op === 'turn') { pc.rot = (pc.rot + 1) % 4; return { ok: true }; }
    if (action.op !== 'drag' || !action.to || !Number.isFinite(action.to.x) || !Number.isFinite(action.to.y)) return { ok: false, reason: 'bad-op' };
    const to = { x: Math.round(clamp(action.to.x, 20, BOARD.w - 20)), y: Math.round(clamp(action.to.y, 20, BOARD.h - 20)) };
    if (action.transient) { pc.pos = to; return { ok: true }; }
    const target = snapSlot(m, to);
    if (lock && target >= 0 && state.pieces.some((_, j) => seatedSlot(state, j) === target)) {
      pc.pos = { ...m.pieces[action.id].seat };
      return { ok: false, reason: 'outline-full' };
    }
    if (target >= 0) {
      const tp = m.slots[target].pos;
      state.pieces.forEach((o, j) => { if (j !== action.id && near(o.pos, tp)) o.pos = { ...m.pieces[j].seat }; });
      pc.pos = { ...tp };
      if (lock) pc.in = target;
    } else pc.pos = { ...m.pieces[action.id].seat };
    return { ok: true };
  },

  verify(state, m) {
    let ok = 0;
    for (const s of m.slots) {
      const here = state.pieces.map((p, i) => (near(p.pos, s.pos) ? i : -1)).filter((i) => i >= 0);
      if (here.length === 1 && fitsAt(m.pieces[here[0]].cells, state.pieces[here[0]].rot, s)) ok++;
    }
    const nS = m.slots.length;
    return { success: ok === nS, partial: ok / nS, error: nS - ok };
  },

  oracle(m) {
    const acts = [];
    m.pieces.forEach((p, i) => {
      if (p.slot < 0) return;
      const s = m.slots[p.slot];
      const k = [1, 2, 3].find((t) => fitsAt(p.cells, (p.rot + t) % 4, s));
      for (let t = 0; t < k; t++) acts.push({ op: 'turn', id: i });
      acts.push({ op: 'drag', id: i, to: { ...s.pos } });
    });
    return acts;
  },

  randomPolicy(m, rnd) {
    const acts = [];
    m.pieces.forEach((_, i) => {
      if (rnd() >= 0.5) return;
      const t = Math.floor(rnd() * 4);
      for (let k = 0; k < t; k++) acts.push({ op: 'turn', id: i });
      acts.push({ op: 'drag', id: i, to: { ...m.slots[Math.floor(rnd() * m.slots.length)].pos } });
    });
    return acts;
  },

  gate,

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Fill each outline with a piece that fits', 'Tap a piece to turn it');
  },

  _C: CELL,

  _origin(cs, c) { const d = dims(cs), C = this._C; return { x: c.x - (d.w * C) / 2, y: c.y - (d.h * C) / 2 }; },

  _cellsPath(g, cs, o, grow = 0) {
    const C = this._C;
    g.beginPath();
    for (const [x, y] of cs) g.rect(o.x + x * C - grow, o.y + y * C - grow, C + 2 * grow, C + 2 * grow);
  },

  _edgePath(g, cs, o) {
    const CELL = this._C;
    const s = new Set(cs.map((c) => c.join(',')));
    const has = (x, y) => s.has(`${x},${y}`);
    const H = new Map(), V = new Map();
    const add = (M, k, a) => { if (!M.has(k)) M.set(k, []); M.get(k).push(a); };
    for (const [x, y] of cs) {
      if (!has(x, y - 1)) add(H, y, x);
      if (!has(x, y + 1)) add(H, y + 1, x);
      if (!has(x - 1, y)) add(V, x, y);
      if (!has(x + 1, y)) add(V, x + 1, y);
    }
    g.beginPath();
    const runs = (M, horiz) => {
      for (const [k, arr] of M) {
        const a = [...new Set(arr)].sort((p, q) => p - q);
        let st = a[0], prev = a[0];
        const flush = (b, e) => {
          if (horiz) { g.moveTo(o.x + b * CELL, o.y + k * CELL); g.lineTo(o.x + (e + 1) * CELL, o.y + k * CELL); }
          else { g.moveTo(o.x + k * CELL, o.y + b * CELL); g.lineTo(o.x + k * CELL, o.y + (e + 1) * CELL); }
        };
        for (let i = 1; i < a.length; i++) { if (a[i] !== prev + 1) { flush(st, prev); st = a[i]; } prev = a[i]; }
        flush(st, prev);
      }
    };
    runs(H, true); runs(V, false);
  },

  _drawPiece(g, cs, c, active) {
    const o = this._origin(cs, c);
    g.save();
    this._cellsPath(g, cs, o, 0.3);
    g.fillStyle = '#5b8def';
    g.shadowColor = 'rgba(20,40,80,.25)'; g.shadowBlur = active ? 9 : 3; g.shadowOffsetY = active ? 3 : 1.5;
    g.fill();
    g.restore();
    g.save();
    this._edgePath(g, cs, o);
    g.strokeStyle = active ? ACCENT : '#3563b8'; g.lineWidth = active ? 2 : 1.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
    g.restore();
  },

  _drawPieceStyled(g, cs, c, active, L) {
    const o = this._origin(cs, c);
    g.save();
    this._cellsPath(g, cs, o, 0.3);
    g.fillStyle = pat(g, L.piece, L.k, 0, 0, L.k, L.off[0], L.off[1]);
    g.shadowColor = 'rgba(10,20,40,.32)'; g.shadowBlur = active ? 9 : 3; g.shadowOffsetY = active ? 3 : 1.5;
    g.fill();
    g.restore();
    if (L.gloss) { g.save(); this._cellsPath(g, cs, o, 0.3); g.clip(); const d = dims(cs); const gr = g.createLinearGradient(o.x, o.y, o.x + d.w * this._C, o.y + d.h * this._C); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = gr; g.fillRect(o.x, o.y, d.w * this._C, d.h * this._C); g.restore(); }
    g.save();
    this._edgePath(g, cs, o);
    g.strokeStyle = active ? ACCENT : L.edge; g.lineWidth = active ? 2 : 1.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
    g.restore();
  },

  _drawStyled(g, br, env, L) {
    const { manifest: m, state } = env;
    g.save();
    g.translate(br.x, br.y);
    const t = m.ext?.tray || { y0: m.trayTop, y1: br.h };
    g.fillStyle = pat(g, L.board, L.k, 0, 0, L.k, L.off[1], L.off[0]); g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = pat(g, L.tray, L.k, 0, 0, L.k, L.off[1], L.off[0]); g.fillRect(0, t.y0, br.w, t.y1 - t.y0);
    g.strokeStyle = L.dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    g.beginPath(); for (const y of [t.y0, t.y1]) if (y > 0 && y < br.h) { g.moveTo(0, y + 0.5); g.lineTo(br.w, y + 0.5); } g.stroke();
    const slotCells = m.slots.map((s) => turn(s.cells, s.rot));
    slotCells.forEach((cs, i) => { const o = this._origin(cs, m.slots[i].pos); this._cellsPath(g, cs, o, 0.3); g.fillStyle = L.slotFill; g.fill(); });
    const grab = this._grab;
    state.pieces.forEach((pc, i) => { if (!grab || grab.id !== i) this._drawPieceStyled(g, turn(m.pieces[i].cells, pc.rot), pc.pos, false, L); });
    slotCells.forEach((cs, i) => {
      const o = this._origin(cs, m.slots[i].pos);
      this._edgePath(g, cs, o);
      g.setLineDash(L.dash); g.strokeStyle = L.ink; g.lineWidth = L.dashW; g.stroke(); g.setLineDash([]);
    });
    if (grab) this._drawPieceStyled(g, turn(m.pieces[grab.id].cells, state.pieces[grab.id].rot), state.pieces[grab.id].pos, true, L);
    g.restore();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    this._C = m.cell || CELL;
    if (env.assets?.look) { this._drawStyled(g, br, env, env.assets.look); return; }
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#f4f6f9'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = '#e8ecf1'; g.fillRect(0, m.trayTop, br.w, br.h - m.trayTop);
    g.strokeStyle = '#d3d9e2'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, m.trayTop + 0.5); g.lineTo(br.w, m.trayTop + 0.5); g.stroke();

    const slotCells = m.slots.map((s) => turn(s.cells, s.rot));
    const grab = this._grab;
    const lock = !m.ext;
    const filled = slotCells.map((_, k) => lock && state.pieces.some((_, j) => seatedSlot(state, j) === k));
    const preview = lock && grab ? snapSlot(m, state.pieces[grab.id].pos) : -1;
    slotCells.forEach((cs, i) => {
      if (filled[i] || preview === i) return;
      const o = this._origin(cs, m.slots[i].pos);
      this._cellsPath(g, cs, o, 0.3); g.fillStyle = '#dde3eb'; g.fill();
    });
    state.pieces.forEach((pc, i) => { if ((!grab || grab.id !== i) && !(lock && seatedSlot(state, i) >= 0)) this._drawPiece(g, turn(m.pieces[i].cells, pc.rot), pc.pos, false); });
    slotCells.forEach((cs, i) => {
      if (filled[i] || preview === i) return;
      const o = this._origin(cs, m.slots[i].pos);
      this._edgePath(g, cs, o);
      g.setLineDash([5, 4]); g.strokeStyle = '#4c5a6b'; g.lineWidth = 1.6; g.stroke(); g.setLineDash([]);
    });
    slotCells.forEach((cs, i) => { if (filled[i] && preview !== i) this._drawPiece(g, cs, m.slots[i].pos, false); });
    if (preview >= 0) this._drawPiece(g, slotCells[preview], m.slots[preview].pos, true);
    else if (grab) this._drawPiece(g, turn(m.pieces[grab.id].cells, state.pieces[grab.id].rot), state.pieces[grab.id].pos, true);
    g.restore();
  },

  _hitPiece(env, x, y) {
    const { manifest: m, state } = env;
    const CELL = m.cell || 13;
    for (let i = state.pieces.length - 1; i >= 0; i--) {
      if (!m.ext && seatedSlot(state, i) >= 0) continue;
      const pc = state.pieces[i], cs = turn(m.pieces[i].cells, pc.rot), d = dims(cs);
      if (Math.abs(x - pc.pos.x) <= (d.w * CELL) / 2 + 4 && Math.abs(y - pc.pos.y) <= (d.h * CELL) / 2 + 4) return i;
    }
    return -1;
  },

  pointer(evt, env) {
    const { state } = env;
    if (evt.type === 'down') {
      const i = this._hitPiece(env, evt.x, evt.y);
      this._grab = i < 0 ? null : { id: i, x0: evt.x, y0: evt.y, ox: evt.x - state.pieces[i].pos.x, oy: evt.y - state.pieces[i].pos.y, moved: false };
      return [];
    }
    const gb = this._grab;
    if (!gb) return [];
    if (evt.type === 'move') {
      if (!gb.moved && Math.hypot(evt.x - gb.x0, evt.y - gb.y0) < TAP_MOVE) return [];
      gb.moved = true;
      return [{ op: 'drag', id: gb.id, to: { x: evt.x - gb.ox, y: evt.y - gb.oy }, transient: true }];
    }
    if (evt.type === 'up') {
      this._grab = null;
      if (!gb.moved) return [{ op: 'turn', id: gb.id }];
      return [{ op: 'drag', id: gb.id, to: { x: evt.x - gb.ox, y: evt.y - gb.oy } }];
    }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    const m = env.manifest;
    const k = env.state.pieces.filter((p) => m.slots.some((s) => near(p.pos, s.pos))).length;
    return k ? `${k} placed` : 'Drag a piece into an outline';
  },
};

export function semanticKey(m) {
  const sl = m.slots.map((s) => d4Key(s.cells)).sort();
  const mir = m.pieces.filter((p) => p.slot < 0).map((p) => d4Key(p.cells)).sort();
  return `chirality|${sl.join('/')}|${mir.join('/')}`;
}
