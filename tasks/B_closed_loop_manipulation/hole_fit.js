import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { splitIds, hash32 } from '../core/style.js';
import * as K from '../common/_colour_kit.js';

const BOARD = { w: 340, h: 400 };
const CELL = 15;
const HARD = Object.freeze({ tileMin: 5, tileMax: 6, holes: 9, minFit: 2, maxFit: 5, attempts: 800 });
const EXTH = Object.freeze({ tileMin: 4, tileMax: 5, holes: 6, minFit: 2, maxFit: 4, attempts: 500 });
const CARDS = { cw: 100, ch: 94, gx: 6, gy: 6, x0: 10, y0: 96 };
const cardAt = (i) => ({ x: CARDS.x0 + (i % 3) * (CARDS.cw + CARDS.gx), y: CARDS.y0 + Math.floor(i / 3) * (CARDS.ch + CARDS.gy), w: CARDS.cw, h: CARDS.ch });
const key = (cells) => cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
function normalize(cells) { const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1])); return cells.map(([x, y]) => [x - mx, y - my]); }
function rot90(cells) { return normalize(cells.map(([x, y]) => [y, -x])); }
function rotations(cells) { const out = [], seen = new Set(); let c = normalize(cells); for (let i = 0; i < 4; i++) { const k = key(c); if (!seen.has(k)) { seen.add(k); out.push(c); } c = rot90(c); } return out; }
function growPoly(rng, n) {
  const set = new Set(['0,0']), cells = [[0, 0]];
  while (cells.length < n) {
    const [x, y] = cells[rng.int(0, cells.length - 1)];
    const nbrs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => !set.has(`${a},${b}`));
    if (!nbrs.length) continue;
    const [a, b] = nbrs[rng.int(0, nbrs.length - 1)]; set.add(`${a},${b}`); cells.push([a, b]);
  }
  return normalize(cells);
}
const dims = (cells) => [Math.max(...cells.map((c) => c[0])) + 1, Math.max(...cells.map((c) => c[1])) + 1];
function subsetFits(small, big) {
  const bs = new Set(big.map(([x, y]) => `${x},${y}`)), [sw, sh] = dims(small), [bw, bh] = dims(big);
  for (let dx = 0; dx <= bw - sw; dx++) for (let dy = 0; dy <= bh - sh; dy++) if (small.every(([x, y]) => bs.has(`${x + dx},${y + dy}`))) return true;
  return false;
}
const canFit = (tileRots, hole) => tileRots.some((r) => subsetFits(r, hole));
const mirror = (cells) => normalize(cells.map(([x, y]) => [-x, y]));
const nbrsOf = (cells) => { const set = new Set(cells.map(([x, y]) => `${x},${y}`)), out = []; cells.forEach(([x, y]) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(([a, b]) => { const k = `${a},${b}`; if (!set.has(k)) { set.add(k); out.push([a, b]); } })); return out; };
function connected(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`)), seen = new Set([`${cells[0][0]},${cells[0][1]}`]), st = [cells[0]];
  while (st.length) { const [x, y] = st.pop(); for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const k = `${a},${b}`; if (set.has(k) && !seen.has(k)) { seen.add(k); st.push([a, b]); } } }
  return seen.size === cells.length;
}
function grown(rng, base, n) {
  let h = base.map((c) => c.slice());
  for (let g = 0; g < n; g++) { const cand = nbrsOf(h); h.push(cand[rng.int(0, cand.length - 1)]); }
  return normalize(h);
}
function nearMiss(rng, base) {
  const h = grown(rng, base, rng.int(0, 1));
  const k = rng.int(0, h.length - 1), rest = h.filter((_, j) => j !== k);
  if (!connected(rest)) return null;
  const cand = nbrsOf(rest).filter(([x, y]) => x !== h[k][0] || y !== h[k][1]);
  const out = normalize(rest.concat([cand[rng.int(0, cand.length - 1)]]));
  return connected(out) ? out : null;
}
function openingOk(h, tile) {
  const [w, hh] = dims(h), [tw, th] = dims(tile);
  if (w > 5 || hh > 5 || h.length < tile.length) return false;
  return Math.min(w, hh) >= Math.min(tw, th) && Math.max(w, hh) >= Math.max(tw, th);
}

const chiral = (tile) => { const r = new Set(rotations(tile).map(key)); return !rotations(mirror(tile)).some((c) => r.has(key(c))); };
export function gate(m) {
  if (m && m.ext) return gateExt(m);
  try {
    if (!m || m.task !== 'hole_fit' || !Array.isArray(m.tile) || !Array.isArray(m.holes) || m.holes.length !== HARD.holes) return false;
    if (m.tile.length < HARD.tileMin || m.tile.length > HARD.tileMax || !connected(m.tile) || dims(m.tile).some((d) => d > 4) || !chiral(m.tile)) return false;
    const rots = rotations(m.tile), mir = rotations(mirror(m.tile));
    if (!m.holes.every((h) => connected(h) && openingOk(h, m.tile) && (canFit(rots, h) || canFit(mir, h)))) return false;
    if (new Set(m.holes.map(key)).size !== m.holes.length) return false;
    const answer = m.holes.map((h, i) => (canFit(rots, h) ? i : -1)).filter((i) => i >= 0);
    return JSON.stringify(answer) === JSON.stringify(m.answer) && answer.length >= HARD.minFit && answer.length <= HARD.maxFit;
  } catch { return false; }
}

export default {
  meta: {
    name: 'hole_fit', family: 'B', boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', id: '0..8 opening (0..5 in training-data mode)' }],
    promptHuman: 'Click every opening the tile can drop through (you may turn it, but not flip it over).',
  },
  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext);
    for (let attempt = 0; attempt < HARD.attempts; attempt++) {
      const tile = growPoly(rng, rng.int(HARD.tileMin, HARD.tileMax));
      const [tw, th] = dims(tile); if (tw > 4 || th > 4) continue;
      if (!chiral(tile)) continue;
      const rots = rotations(tile), mir = rotations(mirror(tile));
      const nFit = rng.int(HARD.minFit, HARD.maxFit);
      const fitIds = new Set(rng.shuffle([...Array(HARD.holes).keys()]).slice(0, nFit));
      const holes = [];
      for (let i = 0; i < HARD.holes && holes.length === i; i++) {
        for (let tries = 0; tries < 80; tries++) {
          const h = grown(rng, rng.pick(fitIds.has(i) ? rots : mir), rng.int(0, 2));
          if (!h || !openingOk(h, tile)) continue;
          if (fitIds.has(i) !== canFit(rots, h)) continue;
          if (holes.some((q) => key(q) === key(h))) continue;
          holes.push(h); break;
        }
      }
      if (holes.length !== HARD.holes) continue;
      const answer = holes.map((h, i) => (canFit(rots, h) ? i : -1)).filter((i) => i >= 0);
      return { task: 'hole_fit', board: BOARD, tile, holes, answer };
    }
    throw new Error('hole_fit: generator exhausted');
  },
  init(m) { return { selected: new Array(m.holes.length).fill(false) }; },
  applyAction(s, a, m) { if (a.op !== 'toggle' || !Number.isInteger(a.id) || !m.holes[a.id]) return { ok: false, reason: 'bad-id' }; s.selected[a.id] = !s.selected[a.id]; return { ok: true }; },
  verify(s, m) {
    const want = new Set(m.answer), got = s.selected.map((v, i) => v ? i : -1).filter((i) => i >= 0);
    const correct = got.filter((i) => want.has(i)).length, bad = got.length - correct;
    return { success: correct === want.size && !bad, partial: Math.max(0, (correct - bad) / want.size), error: want.size - correct + bad, detail: { correct, required: want.size } };
  },
  oracle(m) { return m.answer.map((id) => ({ op: 'toggle', id })); },
  randomPolicy(m, rnd) {
    const S = m.ext ? EXTH : HARD;
    const choices = Array.from({ length: 1 << m.holes.length }, (_, mask) =>
      m.holes.map((_, id) => id).filter(id => mask & (1 << id)))
      .filter(ids => ids.length >= S.minFit && ids.length <= S.maxFit);
    return choices[Math.floor(rnd() * choices.length)].map(id => ({ op: 'toggle', id }));
  },
  async mount(env) { if (env.style) env.assets.look = await styleLook(env.style); },
  drawPrompt(g, r, env) {
    if (env && env.manifest && env.manifest.ext) { drawPromptText(g, r, 'Click every opening the tile can drop through', 'You may turn the tile'); return; }
    drawPromptText(g, r, 'Click every opening the tile can drop through', 'You may turn the tile, but you may not flip it over');
  },
  _cells(g, cells, ox, oy, cell, fill, stroke) {
    cells.forEach(([x, y]) => { g.fillStyle = fill; g.fillRect(ox + x * cell, oy + y * cell, cell, cell); g.strokeStyle = stroke; g.lineWidth = 1.4; g.strokeRect(ox + x * cell + .7, oy + y * cell + .7, cell - 1.4, cell - 1.4); });
  },
  drawBoard(g, br, env) {
    if (env.style && env.assets.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state: s } = env; g.save(); g.translate(br.x, br.y); g.fillStyle = '#eef1f5'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = 'rgba(20,30,45,.85)'; g.fillRect(10, 8, 54, 16); g.fillStyle = '#fff'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'left'; g.fillText('The tile', 15, 16);
    const CD = 15;
    this._cells(g, m.tile, 22, 34, CD, '#3f7fd0', '#22406a');
    const { cw, ch } = CARDS;
    m.holes.forEach((h, i) => {
      const { x: rx, y: ry } = cardAt(i), on = s.selected[i];
      g.fillStyle = on ? 'rgba(25,145,250,.14)' : '#dfe4ea'; g.fillRect(rx, ry, cw, ch);
      g.strokeStyle = on ? ACCENT : '#b9c3ce'; g.lineWidth = on ? 3 : 1.4; g.strokeRect(rx, ry, cw, ch); g.lineWidth = 1;
      const [hw, hh] = dims(h);
      const ox = rx + (cw - hw * CD) / 2, oy = ry + (ch - 12 - hh * CD) / 2 + 4;
      this._cells(g, h, ox, oy, CD, '#f7fafc', '#7c8b9a');
      if (on) { g.fillStyle = ACCENT; g.beginPath(); g.arc(rx + 12, ry + 12, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.fillText('✓', rx + 12, ry + 15.5); }
    });
    g.restore();
  },
  pointer(e, env) {
    if (e.type !== 'down') return [];
    if (env && env.manifest && env.manifest.ext) {
      for (let i = 0; i < EXTH.holes; i++) { const r = cardRect(env.manifest, i); if (e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h) return [{ op: 'toggle', id: i }]; }
      return [];
    }
    for (let i = 0; i < HARD.holes; i++) { const r = cardAt(i); if (e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h) return [{ op: 'toggle', id: i }]; }
    return [];
  },
  footerStatus(env) { return `${env.state.selected.filter(Boolean).length} selected`; },
};

const EVAL_KEYS = new Set([1663502544, 1576128965, 3873784860, 366719811, 3509584818, 3977082176, 132179040, 2872737098, 1748899375, 1103742341, 1470700634, 4083178712]);
const sym8 = (cells) => { const out = []; let c = normalize(cells); for (let i = 0; i < 4; i++) { out.push(c, mirror(c)); c = rot90(c); } return out; };
const freeKey = (cells) => sym8(cells).map(key).sort()[0];
let TILE_POOL = null;
function tilePool() {
  if (TILE_POOL) return TILE_POOL;
  const seen = new Map();
  let frontier = [[[0, 0]]];
  for (let n = 1; n < EXTH.tileMax; n++) {
    const next = new Map();
    for (const c of frontier) for (const nb of nbrsOf(c)) {
      const d = normalize(c.concat([nb])), k = freeKey(d);
      if (!next.has(k)) next.set(k, d);
    }
    frontier = [...next.values()];
    if (n + 1 >= EXTH.tileMin) for (const [k, d] of next) if (Math.max(...dims(d)) <= 4) seen.set(k, d);
  }
  const keys = [...seen.keys()].sort();
  const side = splitIds('hole_fit_tile', keys, 3);
  TILE_POOL = keys.map((k) => ({ key: k, cells: seen.get(k), split: side(k) }));
  return TILE_POOL;
}
const LAYOUTS = ['top', 'left', 'bottom', 'right'];
function cardRect(m, i) {
  const L = m.ext ? m.ext.layout : 'top', gp = m.ext ? m.ext.gap : 6;
  if (L === 'left' || L === 'right') {
    const cw = 104, ch = 92, x0 = L === 'left' ? 120 : 8;
    return { x: x0 + (i % 2) * (cw + gp), y: 8 + Math.floor(i / 2) * (ch + gp), w: cw, h: ch };
  }
  const cw = 100, ch = 96, x0 = Math.round((BOARD.w - 3 * cw - 2 * gp) / 2), y0 = L === 'bottom' ? 8 : 96;
  return { x: x0 + (i % 3) * (cw + gp), y: y0 + Math.floor(i / 3) * (ch + gp), w: cw, h: ch };
}
function tileBox(m) {
  const L = m.ext ? m.ext.layout : 'top';
  if (L === 'left') return { x: 8, y: 8, w: 104, h: 284, lx: 14, ly: 14 };
  if (L === 'right') { const r = cardRect(m, 1); return { x: r.x + r.w + 6, y: 8, w: BOARD.w - r.x - r.w - 12, h: 284, lx: r.x + r.w + 12, ly: 14 }; }
  if (L === 'bottom') return { x: 10, y: 210, w: 320, h: 84, lx: 16, ly: 216 };
  return { x: 10, y: 8, w: 320, h: 82, lx: 15, ly: 16 };
}
function generateExt(rng, split) {
  const pool = tilePool().filter((t) => t.split === split);
  const bySize = [4, 5].map((n) => pool.filter((t) => t.cells.length === n)).filter((p) => p.length);
  for (let attempt = 0; attempt < EXTH.attempts; attempt++) {
    const base = rng.pick(rng.pick(bySize)).cells;
    let tile = base;
    for (let k = rng.int(0, 3); k > 0; k--) tile = rot90(tile);
    if (rng.raw() < 0.5) tile = mirror(tile);
    const rots = rotations(tile), all = rotations(tile).concat(rotations(mirror(tile)));
    const nFit = rng.int(EXTH.minFit, EXTH.maxFit);
    const fitIds = new Set(rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, nFit));
    const holes = [];
    for (let i = 0; i < EXTH.holes && holes.length === i; i++) {
      for (let tries = 0; tries < 80; tries++) {
        const h = fitIds.has(i) ? grown(rng, rng.pick(rots), rng.int(0, 2)) : nearMiss(rng, rng.pick(rots));
        if (!h || !openingOk(h, tile)) continue;
        if (fitIds.has(i) !== canFit(rots, h) || canFit(all, h) !== canFit(rots, h)) continue;
        if (holes.some((q) => key(q) === key(h))) continue;
        holes.push(h); break;
      }
    }
    if (holes.length !== EXTH.holes) continue;
    const answer = holes.map((h, i) => (canFit(rots, h) ? i : -1)).filter((i) => i >= 0);
    const m = { task: 'hole_fit', board: BOARD, tile, holes, answer, ext: { layout: rng.pick(LAYOUTS), gap: rng.pick([4, 6, 8]), cd: rng.int(15, 16), tileKey: freeKey(tile) } };
    if (!EVAL_KEYS.has(hash32(semanticKey(m)))) return m;
  }
  throw new Error('hole_fit: ext generator exhausted');
}
function gateExt(m) {
  try {
    if (!m || m.task !== 'hole_fit' || !m.ext || !LAYOUTS.includes(m.ext.layout) || ![4, 6, 8].includes(m.ext.gap) || !(m.ext.cd >= 15 && m.ext.cd <= 16)) return false;
    if (!Array.isArray(m.tile) || !Array.isArray(m.holes) || m.holes.length !== EXTH.holes) return false;
    if (m.tile.length < EXTH.tileMin || m.tile.length > EXTH.tileMax || !connected(m.tile) || dims(m.tile).some((d) => d > 4) || freeKey(m.tile) !== m.ext.tileKey) return false;
    const rots = rotations(m.tile), all = rots.concat(rotations(mirror(m.tile)));
    if (!m.holes.every((h) => connected(h) && openingOk(h, m.tile) && canFit(all, h) === canFit(rots, h))) return false;
    if (m.holes.some((h) => dims(h).some((d) => d * m.ext.cd > 84))) return false;
    const answer = m.holes.map((h, i) => (canFit(rots, h) ? i : -1)).filter((i) => i >= 0);
    return JSON.stringify(answer) === JSON.stringify(m.answer) && answer.length >= EXTH.minFit && answer.length <= EXTH.maxFit;
  } catch { return false; }
}

const PIECE_FAMS = ['wood', 'stone', 'metal', 'plastic'];
const PLATE_FAMS = ['wood', 'metal', 'concrete', 'stone'];
const PLASTIC = ['#d9483b', '#2f7fd0', '#f0b429', '#3aa65b', '#8a5cc7', '#ef7d2e'];
async function styleLook(st) {
  const benches = [...K.famPool(st, 'wood'), ...K.famPool(st, 'floor'), ...K.famPool(st, 'fabric'), ...K.famPool(st, 'metal')];
  const pieceFams = K.inSplit(st, 'holefit_piece', PIECE_FAMS), plateFams = K.inSplit(st, 'holefit_plate', PLATE_FAMS);
  const [bi, ti, pi] = st.primaryCombo('holefit-scene', [benches.length, pieceFams.length * 7, plateFams.length * 5]);
  const bench = benches[bi], tFam = pieceFams[ti % pieceFams.length], pFam = plateFams[pi % plateFams.length];
  st.note(`holefit_piece:${tFam}`); st.note(`holefit_plate:${pFam}`);
  const R = st.rand;
  const tPool = tFam === 'plastic' ? K.famPool(st, 'flat').concat(K.famPool(st, 'concrete')) : K.famPool(st, tFam);
  const pPool = K.famPool(st, pFam);
  const tTex = tPool[Math.floor(ti / pieceFams.length) % tPool.length], pTex = pPool[Math.floor(pi / plateFams.length) % pPool.length];
  st.note(`tex:${bench.id}`); st.note(`tex:${tTex.id}`); st.note(`tex:${pTex.id}`); st.note(`piece:${tFam} plate:${pFam}`);
  const [bImg, tImg, pImg] = await Promise.all([K.texImg(bench), K.texImg(tTex), K.texImg(pTex)]);
  const plateLum = 0.5 + R() * 0.2;
  const L = {
    bench: K.swatch(bImg, { lum: 0.13 + R() * 0.1, contrast: 0.9, sat: 0.8 }),
    plate: K.swatch(pImg, { lum: plateLum, contrast: 0.8, sat: 0.6 }),
    tile: tFam === 'plastic'
      ? K.swatch(tImg, { lum: 0.5, contrast: 0.35, sat: 0, tint: K.pickIn(st, 'holefit_plastic', PLASTIC), tintK: 0.9 })
      : K.swatch(tImg, { lum: 0.5 + R() * 0.14, contrast: 1.1, sat: tFam === 'metal' ? 0.4 : 0.85 }),
    holeFloor: K.pickIn(st, 'holefit_floor', ['#2a2622', '#1f2328', '#33302b', '#262a22']),
    holeLine: 'rgba(235,232,220,0.55)',
    scale: 0.25 + R() * 0.25, off: [R() * 256, R() * 256], tFam, pFam,
    bevel: 1.6 + R() * 1.2,
  };
  return L;
}
function cellsPath(g, cells, ox, oy, cd) {
  g.beginPath();
  for (const [x, y] of cells) g.rect(ox + x * cd, oy + y * cd, cd, cd);
}
function boundary(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`)), segs = [];
  for (const [x, y] of cells) {
    if (!set.has(`${x},${y - 1}`)) segs.push([x, y, x + 1, y, 'n']);
    if (!set.has(`${x},${y + 1}`)) segs.push([x, y + 1, x + 1, y + 1, 's']);
    if (!set.has(`${x - 1},${y}`)) segs.push([x, y, x, y + 1, 'w']);
    if (!set.has(`${x + 1},${y}`)) segs.push([x + 1, y, x + 1, y + 1, 'e']);
  }
  return segs;
}
function drawPiece(g, L, cells, ox, oy, cd) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.4)'; cellsPath(g, cells, ox + 4, oy + 5, cd); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.55)'; cellsPath(g, cells, ox + 2, oy + 3, cd); g.fill();
  cellsPath(g, cells, ox, oy, cd); K.fillPat(g, L.tile, { scale: L.scale * 0.8, ox: L.off[0], oy: L.off[1] });
  g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 1.2;
  for (const [x, y] of cells) g.strokeRect(ox + x * cd + 0.6, oy + y * cd + 0.6, cd - 1.2, cd - 1.2);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1;
  for (const [x, y] of cells) { g.beginPath(); g.moveTo(ox + x * cd + 1.5, oy + (y + 1) * cd - 2); g.lineTo(ox + x * cd + 1.5, oy + y * cd + 1.5); g.lineTo(ox + (x + 1) * cd - 2, oy + y * cd + 1.5); g.stroke(); }
  g.strokeStyle = 'rgba(10,8,6,0.95)'; g.lineWidth = 1.4; g.beginPath();
  for (const [x0, y0, x1, y1] of boundary(cells)) { g.moveTo(ox + x0 * cd, oy + y0 * cd); g.lineTo(ox + x1 * cd, oy + y1 * cd); }
  g.stroke();
  g.restore();
}
function drawOpening(g, L, cells, ox, oy, cd) {
  g.save();
  cellsPath(g, cells, ox, oy, cd); g.fillStyle = L.holeFloor; g.fill();
  g.save(); cellsPath(g, cells, ox, oy, cd); g.clip();
  const segs = boundary(cells);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2 * L.bevel + 2; g.beginPath();
  for (const [x0, y0, x1, y1, side] of segs) if (side === 'n' || side === 'w') { g.moveTo(ox + x0 * cd, oy + y0 * cd); g.lineTo(ox + x1 * cd, oy + y1 * cd); }
  g.stroke();
  g.strokeStyle = L.holeLine; g.lineWidth = 1;
  for (const [x, y] of cells) g.strokeRect(ox + x * cd + 0.5, oy + y * cd + 0.5, cd - 1, cd - 1);
  g.restore();
  g.lineWidth = 1.3; g.beginPath();
  for (const [x0, y0, x1, y1, side] of segs) if (side === 's' || side === 'e') { g.moveTo(ox + x0 * cd, oy + y0 * cd); g.lineTo(ox + x1 * cd, oy + y1 * cd); }
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.stroke();
  g.beginPath();
  for (const [x0, y0, x1, y1, side] of segs) if (side === 'n' || side === 'w') { g.moveTo(ox + x0 * cd, oy + y0 * cd); g.lineTo(ox + x1 * cd, oy + y1 * cd); }
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.stroke();
  g.restore();
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state: s } = env, CD = m.ext ? m.ext.cd : 15;
  g.save(); g.translate(br.x, br.y);
  K.layer(env.assets, 'holefit-bench', g, 0, 0, br.w, br.h, (cg) => {
    cg.fillStyle = K.pat(cg, L.bench, { scale: L.scale, ox: L.off[1], oy: L.off[0] }); cg.fillRect(0, 0, br.w, br.h);
    const vg = cg.createRadialGradient(br.w / 2, br.h / 2, 60, br.w / 2, br.h / 2, 240); vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    cg.fillStyle = vg; cg.fillRect(0, 0, br.w, br.h);
  });
  const tb = tileBox(m);
  g.fillStyle = 'rgba(20,30,45,.85)'; g.fillRect(tb.lx - 5, tb.ly - 8, 54, 16); g.fillStyle = '#fff'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('The tile', tb.lx, tb.ly);
  const [tw, th] = dims(m.tile);
  const tx = tb.x + Math.max(6, (tb.w - tw * CD) / 2), ty = tb.y + 14 + Math.max(4, (tb.h - 14 - th * CD) / 2);
  drawPiece(g, L, m.tile, tx, ty, CD);
  m.holes.forEach((h, i) => {
    const r = cardRect(m, i), on = s.selected[i];
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(r.x + 3, r.y + 4, r.w, r.h);
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h);
    K.fillPat(g, L.plate, { scale: L.scale, ox: L.off[0] + i * 61, oy: L.off[1] + i * 37 });
    K.vShade(g, r.x, r.y, r.w, r.h, 0.12, 0.18);
    g.strokeStyle = on ? ACCENT : 'rgba(15,12,10,0.8)'; g.lineWidth = on ? 3 : 1.2; g.strokeRect(r.x, r.y, r.w, r.h);
    const [hw, hh] = dims(h);
    const ox = r.x + (r.w - hw * CD) / 2, oy = r.y + (r.h - 12 - hh * CD) / 2 + 4;
    drawOpening(g, L, h, ox, oy, CD);
    if (on) { g.fillStyle = ACCENT; g.beginPath(); g.arc(r.x + 12, r.y + 12, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.fillText('✓', r.x + 12, r.y + 15.5); }
    g.restore();
  });
  g.restore();
}

const rotKey = (cells) => rotations(cells).map(key).sort()[0];
export function semanticKey(m) {
  const fk = (() => { let c = normalize(m.tile); const ks = []; for (let i = 0; i < 4; i++) { ks.push(key(c), key(mirror(c))); c = rot90(c); } return ks.sort()[0]; })();
  const fit = new Set(m.answer);
  return `holefit|${fk}|` + m.holes.map((h, i) => rotKey(h) + (fit.has(i) ? '*' : '')).sort().join('/');
}
