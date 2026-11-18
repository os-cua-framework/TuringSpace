import { drawPromptText, rr, ACCENT } from '../core/panel.js';
import { splitIds } from '../core/style.js';
import { kindTexPairs, primaryOf, detail, tinted, natural, pat, isoTex, shade, lumOf, ANISO, GRIDDY } from '../common/_block_mat.js';
import {
  FREE_NETS, foldNet, isCubeNet, netSize, adjacentCells, cubeModel, viewOf, viewKey, trueViews, ROT24,
  turnSlot, swapSlots, glyphNormal, neg, vkey, isoProjector, slotQuad, slotPictureTransform, inUnit, polyPath, cubeScreenSize,
} from '../common/_box_fold_select_net.js';

const PANEL_W = 580;
const BOARD = { w: PANEL_W - 20, h: 372 };
const ROUNDS = 1;
const NCAND = 9;
const HARD = { correct: [2, 4], minSwap: 2, minRot: 2 };
const NET_AREA = { x: 6, y: 6, w: 190, h: BOARD.h - 12 };
const NET_PAD = 14;
const NET_CELL_MAX = 54;
const CELL = { w: 112, h: 112, gap: 6 };
const CUBE_K = 58, ELEV = 32;
const BOARD_EXT = { w: 380, h: 402 };
const PANEL_EXT = { panelWidth: 400, boardH: 412 };
const NCAND_EXT = 6;
const NET_CELL_MAX_EXT = 44;
const TAU = Math.PI * 2;

const LETTERS = ['F', 'G', 'J', 'L', 'R', 'T'];
const FACE = ['#e03131', '#f76707', '#2f9e44', '#1c7ed6', '#9c36b5', '#495057'];

const cardRect = (i) => {
  const x0 = BOARD.w - 6 - 3 * CELL.w - 2 * CELL.gap, y0 = (BOARD.h - 3 * CELL.h - 2 * CELL.gap) / 2;
  return { x: x0 + (i % 3) * (CELL.w + CELL.gap), y: y0 + Math.floor(i / 3) * (CELL.h + CELL.gap), w: CELL.w, h: CELL.h };
};
const nCand = (m) => (m && m.ext ? NCAND_EXT : NCAND);
const cardOf = (m, i) => (m && m.ext ? m.ext.cards[i] : cardRect(i));
const cubeKOf = (m) => (m && m.ext ? m.ext.cubeK : CUBE_K);
const netAreaOf = (m) => (m && m.ext ? m.ext.net : { x: NET_AREA.x + NET_PAD, y: NET_AREA.y + NET_PAD, w: NET_AREA.w - 2 * NET_PAD, h: NET_AREA.h - 2 * NET_PAD });
function netGeom(cells, m) {
  const { w, h } = netSize(cells), A = netAreaOf(m);
  const cell = Math.min(m && m.ext ? NET_CELL_MAX_EXT : NET_CELL_MAX, Math.floor(A.w / w), Math.floor(A.h / h));
  return { cell, x0: A.x + Math.round((A.w - w * cell) / 2), y0: A.y + Math.round((A.h - h * cell) / 2) };
}
function lCorner(cells, cellOfGlyph, view) {
  const c = view.map(([g]) => cells[cellOfGlyph[g]]);
  let e = 0;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) if (adjacentCells(c[a], c[b])) e++;
  return e === 2;
}
function roundModel(net) {
  const frames = foldNet(net.cells);
  if (!frames) return null;
  const model = cubeModel(frames, net.glyph, net.rot);
  const cellOfGlyph = [];
  net.glyph.forEach((g, i) => { cellOfGlyph[g] = i; });
  return { model, truth: trueViews(model), cellOfGlyph };
}
function classify(M, view) {
  const key = viewKey(view);
  if (M.truth.has(key)) return { kind: 'ok', base: key };
  const g = view.map((e) => e[0]);
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const na = glyphNormal(M.model, g[a]), nb = glyphNormal(M.model, g[b]);
    if (vkey(neg(na)) === vkey(nb)) return { kind: 'opp', base: null };
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const back = viewKey(swapSlots(view, a, b));
    if (M.truth.has(back)) return { kind: 'swap', base: back };
  }
  for (let s = 0; s < 3; s++) for (const delta of [1, 3]) {
    const back = viewKey(turnSlot(view, s, delta));
    if (M.truth.has(back)) return { kind: 'rot', base: back };
  }
  return { kind: 'other', base: null };
}

const L_POSES = FREE_NETS.map((F) => {
  const cells = F.variants[0];
  const M = roundModel({ cells, glyph: [0, 1, 2, 3, 4, 5], rot: cells.map(() => 0) });
  return ROT24.filter((Q) => lCorner(cells, M.cellOfGlyph, viewOf(M.model, Q))).length;
});
const RICH_NETS = FREE_NETS.map((_, i) => i).filter((i) => L_POSES[i] >= NCAND);

function roundOk(rd) {
  if (!rd || !rd.net || !Array.isArray(rd.cands) || rd.cands.length !== NCAND || !Array.isArray(rd.answer)) return false;
  const { cells, glyph, rot, free } = rd.net;
  if (!isCubeNet(cells)) return false;
  const key = (cs) => cs.map((p) => p.join(',')).sort().join(';');
  if (!Number.isInteger(free) || !FREE_NETS[free] || !FREE_NETS[free].variants.some((v) => key(v) === key(cells))) return false;
  const sz = netSize(cells);
  if (sz.h < sz.w || sz.h > 5 || sz.w > 3 || Math.min(...cells.map((p) => p[0])) !== 0 || Math.min(...cells.map((p) => p[1])) !== 0) return false;
  if (!Array.isArray(glyph) || glyph.length !== 6 || new Set(glyph).size !== 6 || !glyph.every((x) => Number.isInteger(x) && x >= 0 && x < 6)) return false;
  if (!Array.isArray(rot) || rot.length !== 6 || !rot.every((x) => x === 0)) return false;
  const M = roundModel(rd.net);
  if (!M) return false;
  const keys = new Set(), bases = new Set(), kinds = { ok: 0, opp: 0, swap: 0, rot: 0 };
  const truthIdx = [];
  for (let i = 0; i < NCAND; i++) {
    const v = rd.cands[i] && rd.cands[i].view;
    if (!Array.isArray(v) || v.length !== 3 || !v.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < 6 && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < 4)) return false;
    if (new Set(v.map((e) => e[0])).size !== 3) return false;
    const key = viewKey(v);
    if (keys.has(key)) return false;
    keys.add(key);
    const c = classify(M, v);
    if (c.kind === 'other' || c.kind !== rd.cands[i].kind) return false;
    kinds[c.kind]++;
    if (c.kind === 'ok') truthIdx.push(i);
    if (c.kind !== 'opp') {
      if (!lCorner(cells, M.cellOfGlyph, v)) return false;
      if (bases.has(c.base)) return false;
      bases.add(c.base);
    }
  }
  if (truthIdx.length < HARD.correct[0] || truthIdx.length > HARD.correct[1]) return false;
  if (!(kinds.opp === 0 && kinds.swap >= HARD.minSwap && kinds.rot >= HARD.minRot)) return false;
  const ans = rd.answer.slice().sort((a, b) => a - b);
  return ans.length === truthIdx.length && ans.every((x, k) => x === truthIdx[k]);
}
function contractOk(m) {
  if (m && m.ext) return extContractOk(m);
  if (!m || m.task !== 'box_fold_select' || !m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== ROUNDS) return false;
  return m.rounds.every(roundOk);
}

function buildRound(rng) {
  for (let att = 0; att < 400; att++) {
    const free = rng.pick(RICH_NETS);
    const tall = FREE_NETS[free].variants.filter((c) => { const s = netSize(c); return s.h >= s.w; });
    const cells = rng.pick(tall).map((p) => p.slice());
    const glyph = rng.shuffle([0, 1, 2, 3, 4, 5]);
    const rot = cells.map(() => 0);
    const net = { free, cells, glyph, rot };
    const M = roundModel(net);
    const poses = ROT24.map((Q) => viewOf(M.model, Q));
    const Lposes = rng.shuffle(poses.filter((v) => lCorner(cells, M.cellOfGlyph, v)));
    const others = rng.shuffle(poses.filter((v) => !lCorner(cells, M.cellOfGlyph, v)));
    const nOk = rng.int(HARD.correct[0], HARD.correct[1]);
    const nDec = NCAND - nOk;
    const kinds = rng.shuffle([...Array(HARD.minSwap).fill('swap'), ...Array(HARD.minRot).fill('rot'),
      ...Array.from({ length: nDec - HARD.minSwap - HARD.minRot }, () => rng.pick(['swap', 'rot']))]);
    const needL = nOk + kinds.filter((k) => k !== 'opp').length;
    if (Lposes.length < needL) continue;
    const cands = [];
    const used = new Set();
    for (let k = 0; k < nOk; k++) { const v = Lposes.pop(); cands.push({ view: v, kind: 'ok' }); used.add(viewKey(v)); }
    let fail = false;
    for (const kind of kinds) {
      let v = null;
      if (kind === 'rot') {
        const base = Lposes.pop();
        v = turnSlot(base, rng.int(0, 2), rng.raw() < 0.5 ? 1 : 3);
      } else if (kind === 'swap') {
        const base = Lposes.pop();
        const pair = rng.pick([[0, 1], [0, 2], [1, 2]]);
        v = swapSlots(base, pair[0], pair[1]);
      } else {
        const pool = others.length ? others : Lposes;
        const base = pool.pop();
        const s = rng.int(0, 2), t = (s + 1 + rng.int(0, 1)) % 3;
        const opp = neg(glyphNormal(M.model, base[t][0]));
        v = base.map((e) => e.slice());
        v[s] = [M.model[vkey(opp)].g, rng.int(0, 3)];
      }
      const key = viewKey(v);
      if (!v || used.has(key) || M.truth.has(key)) { fail = true; break; }
      used.add(key);
      cands.push({ view: v, kind });
    }
    if (fail) continue;
    const order = rng.shuffle([...Array(NCAND).keys()]);
    const shuffled = order.map((j) => cands[j]);
    const answer = shuffled.map((c, i) => (c.kind === 'ok' ? i : -1)).filter((i) => i >= 0);
    const rd = { net, cands: shuffled, answer };
    if (roundOk(rd)) return rd;
  }
  throw new Error('box_fold_select: sampler exhausted');
}

function letterPath(g, id) {
  g.beginPath();
  switch (LETTERS[id]) {
    case 'F': g.moveTo(0.32, 0.88); g.lineTo(0.32, 0.12); g.lineTo(0.76, 0.12); g.moveTo(0.32, 0.49); g.lineTo(0.66, 0.49); break;
    case 'L': g.moveTo(0.33, 0.12); g.lineTo(0.33, 0.88); g.lineTo(0.77, 0.88); break;
    case 'T': g.moveTo(0.15, 0.13); g.lineTo(0.85, 0.13); g.moveTo(0.5, 0.13); g.lineTo(0.5, 0.88); break;
    case 'J': g.moveTo(0.4, 0.12); g.lineTo(0.78, 0.12); g.moveTo(0.64, 0.12); g.lineTo(0.64, 0.62); g.bezierCurveTo(0.64, 0.93, 0.27, 0.95, 0.25, 0.66); break;
    case 'R': g.moveTo(0.3, 0.88); g.lineTo(0.3, 0.12); g.lineTo(0.54, 0.12); g.bezierCurveTo(0.83, 0.12, 0.83, 0.52, 0.54, 0.52); g.lineTo(0.3, 0.52); g.moveTo(0.5, 0.52); g.lineTo(0.77, 0.88); break;
    case 'G': g.arc(0.5, 0.5, 0.37, -0.78, 0.22, true); g.lineTo(0.86, 0.5); g.lineTo(0.58, 0.5); break;
    default: break;
  }
}
function drawLetter(g, id, lw = 0.14) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  letterPath(g, id);
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = lw + 0.06; g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = lw; g.stroke();
  g.restore();
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = (v) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const EXT_SIDES = ['top', 'bottom', 'left', 'right'];
function extLayout(rng) {
  const side = rng.pick(EXT_SIDES), Wb = BOARD_EXT.w, Hb = BOARD_EXT.h, r0 = (v) => Math.round(v);
  if (side === 'top' || side === 'bottom') {
    const netH = r0(rng.uniform(128, 146)), cw = r0(rng.uniform(84, 98)), ch = r0(rng.uniform(102, 116));
    const gx = Math.min(30, (Wb - 16 - 3 * cw) / 2), gy = r0(rng.uniform(6, 14));
    const blockH = 2 * ch + gy, x0 = r0((Wb - (3 * cw + 2 * gx)) / 2);
    const netY = side === 'top' ? r0(rng.uniform(6, 12)) : Hb - netH - r0(rng.uniform(6, 12));
    const y0 = side === 'top' ? netY + netH + r0((Hb - netY - netH - blockH) / 2) : r0((netY - blockH) / 2);
    const cards = Array.from({ length: NCAND_EXT }, (_, i) => ({ x: r0(x0 + (i % 3) * (cw + gx)), y: r0(y0 + Math.floor(i / 3) * (ch + gy)), w: cw, h: ch }));
    return { side, tall: false, net: { x: 20, y: netY, w: Wb - 40, h: netH }, cards, cubeK: Math.min(52, Math.floor(cw * 0.58), Math.floor(ch * 0.46)) };
  }
  const netW = r0(rng.uniform(140, 156)), cw = r0(rng.uniform(86, 96)), ch = r0(rng.uniform(108, 120));
  const gx = r0(rng.uniform(8, 16)), gy = r0(rng.uniform(5, 10));
  const blockW = 2 * cw + gx, blockH = 3 * ch + 2 * gy;
  const netX = side === 'left' ? 8 : Wb - netW - 8;
  const x0 = side === 'left' ? netX + netW + r0((Wb - netX - netW - blockW) / 2) : r0((netX - blockW) / 2);
  const y0 = r0((Hb - blockH) / 2);
  const cards = Array.from({ length: NCAND_EXT }, (_, i) => ({ x: r0(x0 + (i % 2) * (cw + gx)), y: r0(y0 + Math.floor(i / 2) * (ch + gy)), w: cw, h: ch }));
  return { side, tall: true, net: { x: netX, y: 12, w: netW, h: Hb - 24 }, cards, cubeK: Math.min(52, Math.floor(cw * 0.58), Math.floor(ch * 0.46)) };
}
function extRoundOk(rd, tall) {
  if (!rd || !rd.net || !Array.isArray(rd.cands) || rd.cands.length !== NCAND_EXT || !Array.isArray(rd.answer)) return false;
  const { cells, glyph, rot, free } = rd.net;
  if (!isCubeNet(cells)) return false;
  const key = (cs) => cs.map((p) => p.join(',')).sort().join(';');
  if (!Number.isInteger(free) || !FREE_NETS[free] || !FREE_NETS[free].variants.some((v) => key(v) === key(cells))) return false;
  const sz = netSize(cells), lo = Math.min(sz.w, sz.h), hi = Math.max(sz.w, sz.h);
  if ((tall ? sz.h < sz.w : sz.w < sz.h) || hi > 5 || lo > 3 || Math.min(...cells.map((p) => p[0])) !== 0 || Math.min(...cells.map((p) => p[1])) !== 0) return false;
  if (!Array.isArray(glyph) || glyph.length !== 6 || new Set(glyph).size !== 6 || !glyph.every((x) => Number.isInteger(x) && x >= 0 && x < 6)) return false;
  if (!Array.isArray(rot) || rot.length !== 6 || !rot.every((x) => x === 0)) return false;
  const M = roundModel(rd.net);
  if (!M) return false;
  const keys = new Set(), bases = new Set(), kinds = { ok: 0, opp: 0, swap: 0, rot: 0 }, truthIdx = [];
  for (let i = 0; i < NCAND_EXT; i++) {
    const v = rd.cands[i] && rd.cands[i].view;
    if (!Array.isArray(v) || v.length !== 3 || !v.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < 6 && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < 4)) return false;
    if (new Set(v.map((e) => e[0])).size !== 3) return false;
    const k = viewKey(v);
    if (keys.has(k)) return false;
    keys.add(k);
    const c = classify(M, v);
    if (c.kind === 'other' || c.kind !== rd.cands[i].kind) return false;
    kinds[c.kind]++;
    if (c.kind === 'ok') truthIdx.push(i);
    if (c.kind !== 'opp') {
      if (!lCorner(cells, M.cellOfGlyph, v)) return false;
      if (bases.has(c.base)) return false;
      bases.add(c.base);
    }
  }
  if (truthIdx.length !== 1 || !(kinds.opp >= 1 && kinds.swap >= 1 && kinds.rot >= 1)) return false;
  const ans = rd.answer.slice().sort((a, b) => a - b);
  return ans.length === 1 && ans[0] === truthIdx[0];
}
function extContractOk(m) {
  if (m.task !== 'box_fold_select' || !m.board || m.board.w !== BOARD_EXT.w || m.board.h !== BOARD_EXT.h || !Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  const L = m.ext;
  if (!L || !EXT_SIDES.includes(L.side) || !Array.isArray(L.cards) || L.cards.length !== NCAND_EXT || L.tall !== (L.side === 'left' || L.side === 'right')) return false;
  const inB = (R) => R.x >= 0 && R.y >= 0 && R.x + R.w <= BOARD_EXT.w && R.y + R.h <= BOARD_EXT.h;
  const over = (A, B) => A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
  if (!L.cards.every(inB) || !inB(L.net) || L.cards.some((c, i) => over(c, L.net) || L.cards.some((d, j) => j > i && over(c, d)))) return false;
  const sz = cubeScreenSize(L.cubeK, ELEV + 6);
  if (!L.cards.every((c) => sz.w + 6 <= c.w && sz.h + 6 <= c.h)) return false;
  return extRoundOk(m.rounds[0], L.tall);
}
function buildRoundExt(rng, tall) {
  for (let att = 0; att < 200; att++) {
    const free = rng.int(0, FREE_NETS.length - 1);
    const vars = FREE_NETS[free].variants.filter((c) => { const s2 = netSize(c); return tall ? s2.h >= s2.w : s2.w >= s2.h; });
    const cells = rng.pick(vars).map((p) => p.slice());
    const net = { free, cells, glyph: rng.shuffle([0, 1, 2, 3, 4, 5]), rot: cells.map(() => 0) };
    const M = roundModel(net);
    const poses = ROT24.map((Q) => viewOf(M.model, Q));
    const Lposes = rng.shuffle(poses.filter((v) => lCorner(cells, M.cellOfGlyph, v)));
    const others = rng.shuffle(poses.filter((v) => !lCorner(cells, M.cellOfGlyph, v)));
    const kinds = ['opp', 'swap', 'rot', ...rng.shuffle(['opp', 'swap', 'rot']).slice(0, 2)];
    if (Lposes.length < 1 + kinds.filter((k) => k !== 'opp').length) continue;
    const cands = [], used = new Set();
    const v0 = Lposes.pop(); cands.push({ view: v0, kind: 'ok' }); used.add(viewKey(v0));
    let fail = false;
    for (const kind of kinds) {
      let v;
      if (kind === 'rot') v = turnSlot(Lposes.pop(), rng.int(0, 2), rng.raw() < 0.5 ? 1 : 3);
      else if (kind === 'swap') { const pr = rng.pick([[0, 1], [0, 2], [1, 2]]); v = swapSlots(Lposes.pop(), pr[0], pr[1]); }
      else {
        const base = (others.length ? others : Lposes).pop();
        const s0 = rng.int(0, 2), t = (s0 + 1 + rng.int(0, 1)) % 3;
        const opp = neg(glyphNormal(M.model, base[t][0]));
        v = base.map((e) => e.slice()); v[s0] = [M.model[vkey(opp)].g, rng.int(0, 3)];
      }
      const k = viewKey(v);
      if (used.has(k) || M.truth.has(k)) { fail = true; break; }
      used.add(k); cands.push({ view: v, kind });
    }
    if (fail) continue;
    const shuffled = rng.shuffle([0, 1, 2, 3, 4, 5]).map((j) => cands[j]);
    const rd = { net, cands: shuffled, answer: shuffled.map((c, i) => (c.kind === 'ok' ? i : -1)).filter((i) => i >= 0) };
    if (extRoundOk(rd, tall)) return rd;
  }
  throw new Error('box_fold_select: ext sampler exhausted');
}
function generateExt(rng) {
  const L = extLayout(rng);
  return { task: 'box_fold_select', board: { ...BOARD_EXT }, panel: { ...PANEL_EXT }, rounds: [buildRoundExt(rng, L.tall)], ext: L };
}

const GLYPHS = {
  "2": [[[0.27,0.29],[0.29,0.24],[0.31,0.2],[0.34,0.16],[0.38,0.13],[0.42,0.11],[0.47,0.1],[0.52,0.1],[0.57,0.11],[0.61,0.13],[0.65,0.16],[0.69,0.19],[0.71,0.24],[0.73,0.28],[0.73,0.33],[0.7,0.45],[0.26,0.88],[0.76,0.88]]],
  "3": [[[0.3,0.24],[0.33,0.18],[0.37,0.14],[0.43,0.12],[0.49,0.11],[0.54,0.12],[0.6,0.15],[0.64,0.19],[0.66,0.24],[0.67,0.3],[0.66,0.36],[0.63,0.41],[0.59,0.45],[0.54,0.48],[0.48,0.49]],[[0.48,0.47],[0.54,0.48],[0.6,0.51],[0.65,0.56],[0.68,0.61],[0.69,0.68],[0.68,0.74],[0.65,0.8],[0.61,0.85],[0.55,0.88],[0.49,0.89],[0.42,0.88],[0.36,0.85],[0.31,0.81],[0.28,0.75]]],
  "4": [[[0.62,0.88],[0.62,0.12],[0.22,0.64],[0.8,0.64]]],
  "5": [[[0.74,0.12],[0.33,0.12],[0.3,0.46],[0.36,0.45],[0.43,0.43],[0.5,0.42],[0.57,0.44],[0.63,0.47],[0.68,0.53],[0.71,0.59],[0.72,0.66],[0.71,0.73],[0.68,0.8],[0.63,0.85],[0.57,0.88],[0.5,0.9],[0.43,0.89],[0.36,0.87]]],
  "7": [[[0.24,0.12],[0.76,0.12],[0.42,0.88]]],
  "A": [[[0.18,0.88],[0.5,0.12],[0.82,0.88]],[[0.3,0.6],[0.7,0.6]]],
  "C": [[[0.8,0.74],[0.71,0.82],[0.58,0.86],[0.46,0.86],[0.34,0.82],[0.24,0.74],[0.17,0.63],[0.15,0.5],[0.17,0.37],[0.24,0.26],[0.34,0.18],[0.46,0.14],[0.58,0.14],[0.71,0.18],[0.8,0.26]]],
  "D": [[[0.3,0.12],[0.3,0.88],[0.52,0.88],[0.72,0.72],[0.76,0.5],[0.72,0.28],[0.52,0.12],[0.3,0.12]]],
  "E": [[[0.72,0.12],[0.3,0.12],[0.3,0.88],[0.72,0.88]],[[0.3,0.5],[0.62,0.5]]],
  "F": [[[0.32,0.88],[0.32,0.12],[0.76,0.12]],[[0.32,0.49],[0.66,0.49]]],
  "G": [[[0.76,0.24],[0.66,0.17],[0.54,0.13],[0.42,0.14],[0.3,0.19],[0.21,0.27],[0.15,0.38],[0.13,0.5],[0.15,0.62],[0.21,0.73],[0.3,0.81],[0.42,0.86],[0.54,0.87],[0.66,0.83],[0.76,0.76]],[[0.87,0.5],[0.58,0.5]]],
  "J": [[[0.4,0.12],[0.78,0.12]],[[0.64,0.12],[0.64,0.62],[0.64,0.66],[0.64,0.7],[0.63,0.73],[0.61,0.77],[0.58,0.8],[0.55,0.82],[0.52,0.84],[0.48,0.85],[0.45,0.85],[0.41,0.85],[0.37,0.83],[0.34,0.81],[0.31,0.79],[0.29,0.76],[0.27,0.73]]],
  "K": [[[0.3,0.12],[0.3,0.88]],[[0.74,0.12],[0.3,0.56]],[[0.45,0.42],[0.76,0.88]]],
  "L": [[[0.33,0.12],[0.33,0.88],[0.77,0.88]]],
  "P": [[[0.3,0.88],[0.3,0.12],[0.58,0.12],[0.72,0.22],[0.72,0.42],[0.58,0.52],[0.3,0.52]]],
  "Q": [[[0.84,0.47],[0.83,0.56],[0.79,0.64],[0.74,0.71],[0.67,0.76],[0.59,0.8],[0.5,0.81],[0.41,0.8],[0.33,0.76],[0.26,0.71],[0.21,0.64],[0.17,0.56],[0.16,0.47],[0.17,0.38],[0.21,0.3],[0.26,0.23],[0.33,0.18],[0.41,0.14],[0.5,0.13],[0.59,0.14],[0.67,0.18],[0.74,0.23],[0.79,0.3],[0.83,0.38],[0.84,0.47]],[[0.56,0.66],[0.82,0.9]]],
  "R": [[[0.3,0.88],[0.3,0.12],[0.56,0.12],[0.72,0.22],[0.72,0.42],[0.56,0.52],[0.3,0.52]],[[0.5,0.52],[0.77,0.88]]],
  "T": [[[0.15,0.13],[0.85,0.13]],[[0.5,0.13],[0.5,0.88]]],
  "Y": [[[0.2,0.12],[0.5,0.5],[0.8,0.12]],[[0.5,0.5],[0.5,0.88]]],
  "Qm": [[[0.3,0.3],[0.31,0.25],[0.33,0.19],[0.37,0.15],[0.41,0.12],[0.47,0.1],[0.52,0.1],[0.58,0.12],[0.63,0.14],[0.66,0.18],[0.69,0.23],[0.7,0.29],[0.7,0.35],[0.68,0.4],[0.64,0.44],[0.5,0.58],[0.5,0.66]],[[0.5,0.82],[0.5,0.88]]],
  "h": [[[0.3,0.12],[0.3,0.88]],[[0.3,0.56],[0.31,0.51],[0.33,0.48],[0.35,0.44],[0.38,0.42],[0.42,0.4],[0.46,0.39],[0.5,0.38],[0.54,0.38],[0.57,0.39],[0.61,0.41],[0.64,0.44],[0.67,0.47],[0.68,0.5],[0.7,0.54],[0.7,0.58],[0.7,0.88]]],
  "b": [[[0.3,0.12],[0.3,0.88]],[[0.72,0.66],[0.71,0.73],[0.68,0.79],[0.63,0.84],[0.57,0.87],[0.5,0.88],[0.43,0.87],[0.37,0.84],[0.32,0.79],[0.29,0.73],[0.28,0.66],[0.29,0.59],[0.32,0.53],[0.37,0.48],[0.43,0.45],[0.5,0.44],[0.57,0.45],[0.63,0.48],[0.68,0.53],[0.71,0.59],[0.72,0.66]]],
  "lam": [[[0.24,0.12],[0.38,0.12],[0.78,0.88]],[[0.52,0.42],[0.22,0.88]]],
  "Psi": [[[0.2,0.18],[0.24,0.44],[0.36,0.56],[0.5,0.58],[0.64,0.56],[0.76,0.44],[0.8,0.18]],[[0.5,0.12],[0.5,0.88]]],
  "up": [[[0.5,0.88],[0.5,0.14]],[[0.24,0.4],[0.5,0.13],[0.76,0.4]]],
  "k": [[[0.32,0.12],[0.32,0.88]],[[0.7,0.42],[0.32,0.68]],[[0.46,0.58],[0.72,0.88]]],
  "t": [[[0.45,0.12],[0.45,0.76],[0.52,0.86],[0.7,0.86]],[[0.25,0.36],[0.72,0.36]]],
  "y": [[[0.24,0.3],[0.5,0.66]],[[0.76,0.3],[0.36,0.9]]],
  "f": [[[0.68,0.16],[0.56,0.12],[0.44,0.18],[0.42,0.3],[0.42,0.88]],[[0.24,0.42],[0.66,0.42]]],
  "r": [[[0.34,0.3],[0.34,0.88]],[[0.34,0.52],[0.44,0.36],[0.58,0.3],[0.72,0.32]]],
  "a": [[[0.68,0.64],[0.67,0.71],[0.63,0.77],[0.58,0.81],[0.52,0.84],[0.45,0.84],[0.38,0.81],[0.33,0.77],[0.29,0.71],[0.28,0.64],[0.29,0.57],[0.33,0.51],[0.38,0.47],[0.45,0.44],[0.52,0.44],[0.58,0.47],[0.63,0.51],[0.67,0.57],[0.68,0.64]],[[0.68,0.38],[0.68,0.88]]],
  "e": [[[0.28,0.6],[0.72,0.6],[0.72,0.6],[0.71,0.52],[0.66,0.45],[0.6,0.4],[0.52,0.38],[0.44,0.39],[0.36,0.43],[0.31,0.49],[0.28,0.57],[0.29,0.65],[0.32,0.72],[0.38,0.78],[0.45,0.81],[0.53,0.82],[0.61,0.79]]]
};
const GLYPH_CLASH = new Set(['C|G', 'E|F', 'E|P', 'F|P', 'G|Q', 'K|R', 'P|R', 'P|a', 'Y|lam', 'b|h']);
const GLYPH_IDS = Object.keys(GLYPHS);
const GLYPH_SPLIT = splitIds('g17_glyph', GLYPH_IDS, 9);
const clash = (a, b) => GLYPH_CLASH.has(a < b ? `${a}|${b}` : `${b}|${a}`);
function pickGlyphSet(st) {
  const pool = GLYPH_IDS.filter((g) => GLYPH_SPLIT(g) === st.split);
  for (let t = 0; t < 200; t++) {
    const set = [];
    for (const g of pool.slice().sort(() => st.rand() - 0.5)) if (set.length < 6 && set.every((h) => !clash(g, h))) set.push(g);
    if (set.length === 6) return set;
  }
  return pool.slice(0, 6);
}
async function mountLook(st) {
  const pairs = kindTexPairs(st, ['felt', 'paper', 'plastic', 'stone', 'leather', 'concrete'], (t) => isoTex(t, 0.2, 0.26), 'box_fold_select');
  const desks = st.pool('tex', (t) => (t.use === 'wood' && ANISO[t.id] && ANISO[t.id][0] < 0.75 && !GRIDDY.test(t.id)) || (['floor', 'fabric', 'flat2d', 'stone', 'wall'].includes(t.use) && isoTex(t, 0.25, 0.3)));
  const [[kind, tex], dtex] = primaryOf(st, 'g17_boxfold', [pairs, desks]);
  const glyphs = pickGlyphSet(st);
  st.note(`face:${kind}:${tex.id}`); st.note(`desk:${dtex.id}`); st.note(`glyphs:${glyphs.join(',')}`);
  const r = st.rand;
  const det = await detail(tex.file, 128);
  const amp = kind === 'plastic' ? 0.06 : kind === 'paper' ? 0.1 : 0.26;
  const deskL = 0.5 + 0.38 * r();
  return {
    kind, glyphs, faces: FACE.map((hex) => tinted(det, hex, amp)), k: 0.35 + 0.3 * r(), off: [r() * 128, r() * 128],
    desk: await natural(dtex.file, { L: deskL, contrast: 0.4, sat: 0.22 }), deskK: 0.6 + 0.5 * r(),
    card: await natural(dtex.file, { L: 0.95, contrast: 0.12, sat: 0.2 }),
    ink: r() < 0.7 ? '#ffffff' : '#fff4dc', lw: 0.12 + 0.05 * r(), elev: 26 + 12 * r(), gloss: kind === 'plastic',
    edge: r() < 0.5 ? '#1f252b' : '#3a3026',
  };
}
function drawGlyph(g, name, lw, ink) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  for (const st of GLYPHS[name]) st.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = lw + 0.06; g.stroke();
  g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  g.restore();
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state: st } = env, rd = m.rounds[0];
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = pat(g, L.desk, L.deskK, 0, 0, L.deskK, L.off[1], L.off[0]); g.fillRect(0, 0, br.w, br.h);
  const net = rd.net, { cell, x0, y0 } = netGeom(net.cells, m);
  const at = (c, r) => ({ x: x0 + c * cell, y: y0 + r * cell });
  g.save(); g.shadowColor = 'rgba(20,25,30,0.3)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  net.cells.forEach(([c, r], i) => { const p = at(c, r); g.fillStyle = pat(g, L.faces[net.glyph[i]], L.k, 0, 0, L.k, L.off[0], L.off[1]); g.fillRect(p.x, p.y, cell, cell); });
  g.restore();
  net.cells.forEach(([c, r], i) => {
    const p = at(c, r), s2 = cell * 0.74;
    g.save(); g.translate(p.x + cell / 2, p.y + cell / 2); g.rotate(net.rot[i] * Math.PI / 2); g.translate(-s2 / 2, -s2 / 2); g.scale(s2, s2);
    drawGlyph(g, L.glyphs[net.glyph[i]], L.lw, L.ink); g.restore();
  });
  const has = new Set(net.cells.map(([c, r]) => `${c},${r}`));
  for (const [c, r] of net.cells) {
    const p = at(c, r);
    const sides = [[`${c},${r - 1}`, p.x, p.y, p.x + cell, p.y], [`${c + 1},${r}`, p.x + cell, p.y, p.x + cell, p.y + cell],
      [`${c},${r + 1}`, p.x, p.y + cell, p.x + cell, p.y + cell], [`${c - 1},${r}`, p.x, p.y, p.x, p.y + cell]];
    for (const [nk, xa, ya, xb, yb] of sides) {
      g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb);
      if (has.has(nk)) { g.setLineDash([4, 3]); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.3; } else { g.setLineDash([]); g.strokeStyle = L.edge; g.lineWidth = 1.8; }
      g.stroke();
    }
  }
  g.setLineDash([]);
  const K = cubeKOf(m);
  for (let i = 0; i < nCand(m); i++) {
    const c = cardOf(m, i), on = !!st.sel[i];
    g.save(); g.shadowColor = 'rgba(20,25,30,0.22)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
    rr(g, c.x, c.y, c.w, c.h, 8); g.fillStyle = on ? '#e7f3ff' : pat(g, L.card, 1, 0, 0, 1, c.x, c.y); g.fill(); g.restore();
    rr(g, c.x, c.y, c.w, c.h, 8); g.strokeStyle = on ? ACCENT : 'rgba(60,70,80,0.35)'; g.lineWidth = on ? 3 : 1; g.stroke();
    const P = isoProjector(K, L.elev, c.x + c.w / 2, c.y + c.h / 2 + 2);
    const light = [1.06, 0.9, 0.76], view = rd.cands[i].view;
    const base = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]].map((q) => P([q[0] + 0.06, q[1], q[2] + 0.06]));
    polyPath(g, base); g.fillStyle = 'rgba(30,40,55,0.18)'; g.fill();
    for (let s3 = 0; s3 < 3; s3++) {
      const quad = slotQuad(P, s3), [gl, d] = view[s3];
      polyPath(g, quad); g.fillStyle = pat(g, L.faces[gl], L.k * K / 52, 0, 0, L.k * K / 52, L.off[0] + s3 * 31, L.off[1]); g.fill();
      if (light[s3] > 1) { polyPath(g, quad); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill(); }
      inUnit(g, slotPictureTransform(P, s3, d), 0.15, () => drawGlyph(g, L.glyphs[gl], L.lw, L.ink));
      if (light[s3] < 1) { polyPath(g, quad); g.fillStyle = `rgba(0,0,0,${((1 - light[s3]) * 0.25).toFixed(3)})`; g.fill(); }
      if (L.gloss) { polyPath(g, quad); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill(); }
    }
    g.lineJoin = 'round';
    for (let s3 = 0; s3 < 3; s3++) { polyPath(g, slotQuad(P, s3)); g.strokeStyle = L.edge; g.lineWidth = 1.5; g.stroke(); }
    if (on) {
      g.beginPath(); g.arc(c.x + c.w - 11, c.y + 11, 8, 0, TAU); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(c.x + c.w - 14.5, c.y + 11); g.lineTo(c.x + c.w - 12, c.y + 14); g.lineTo(c.x + c.w - 7, c.y + 8); g.stroke();
      g.lineCap = 'butt';
    }
  }
  g.restore();
}

const task = {
  meta: {
    name: 'box_fold_select', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'toggle', i: 'cube card 0..8 (3x3, left to right, top row first); tapping a card selects it, tapping it again clears it; select every cube the net folds into' },
    ],
    promptHuman: 'Click every cube this net can fold into',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng);
    const r0 = buildRound(rng);
    return { task: 'box_fold_select', board: { ...BOARD }, rounds: [r0] };
  },

  init(m) { return { sel: new Array(nCand(m)).fill(false) }; },

  applyAction(state, a, m) {
    const op = m && m.ext ? 'pick' : 'toggle';
    if (!a || a.op !== op) return { ok: false, reason: 'bad-op' };
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= state.sel.length) return { ok: false, reason: 'bad-card' };
    if (op === 'pick') { state.sel.fill(false); state.sel[a.i] = true; } else state.sel[a.i] = !state.sel[a.i];
    return { ok: true };
  },

  verify(state, m) {
    const ans = new Set(m.rounds[0].answer);
    let wrong = 0, picked = 0;
    state.sel.forEach((v, i) => { if (v) picked++; if (v !== ans.has(i)) wrong++; });
    const ok = wrong === 0;
    return { success: ok, error: wrong, partial: 1 - wrong / state.sel.length, detail: { answered: picked > 0, selected: picked } };
  },

  oracle(m) { return m.ext ? [{ op: 'pick', i: m.rounds[0].answer[0] }] : m.rounds[0].answer.map((i) => ({ op: 'toggle', i })); },

  randomPolicy(m, rnd) {
    if (m.ext) return [{ op: 'pick', i: Math.floor(rnd() * NCAND_EXT) }];
    const k = HARD.correct[0] + Math.floor(rnd() * (HARD.correct[1] - HARD.correct[0] + 1));
    const ids = [...Array(NCAND).keys()];
    for (let i = NCAND - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, k).map((i) => ({ op: 'toggle', i }));
  },

  gate: (m) => contractOk(m),

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r, env) {
    if (env && env.manifest && env.manifest.ext) drawPromptText(g, r, 'Click the cube this pattern folds into', '');
    else drawPromptText(g, r, 'Click every cube this pattern folds into', 'Several cubes fit');
  },

  _cardRect: cardRect,

  _net(g, net, m) {
    const { cell, x0, y0 } = netGeom(net.cells, m);
    const at = (c, r) => ({ x: x0 + c * cell, y: y0 + r * cell });
    g.save();
    g.shadowColor = 'rgba(30,40,55,0.22)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    net.cells.forEach(([c, r], i) => { const p = at(c, r); g.fillStyle = FACE[net.glyph[i]]; g.fillRect(p.x, p.y, cell, cell); });
    g.restore();
    net.cells.forEach(([c, r], i) => {
      const p = at(c, r), s = cell * 0.74;
      g.save();
      g.translate(p.x + cell / 2, p.y + cell / 2); g.rotate(net.rot[i] * Math.PI / 2);
      g.translate(-s / 2, -s / 2); g.scale(s, s);
      drawLetter(g, net.glyph[i], 0.14);
      g.restore();
    });
    const has = new Set(net.cells.map(([c, r]) => `${c},${r}`));
    g.lineCap = 'butt';
    for (const [c, r] of net.cells) {
      const p = at(c, r);
      const sides = [[`${c},${r - 1}`, p.x, p.y, p.x + cell, p.y], [`${c + 1},${r}`, p.x + cell, p.y, p.x + cell, p.y + cell],
        [`${c},${r + 1}`, p.x, p.y + cell, p.x + cell, p.y + cell], [`${c - 1},${r}`, p.x, p.y, p.x, p.y + cell]];
      for (const [nk, xa, ya, xb, yb] of sides) {
        const inner = has.has(nk);
        g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb);
        if (inner) { g.setLineDash([4, 3]); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.3; }
        else { g.setLineDash([]); g.strokeStyle = '#2b323a'; g.lineWidth = 1.8; }
        g.stroke();
      }
    }
    g.setLineDash([]);
  },

  _cube(g, view, cx, cy, K = CUBE_K) {
    const P = isoProjector(K, ELEV, cx, cy);
    const light = [1.06, 0.9, 0.76];
    const base = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]].map((p) => P([p[0] + 0.06, p[1], p[2] + 0.06]));
    polyPath(g, base); g.fillStyle = 'rgba(30,40,55,0.16)'; g.fill();
    for (let s = 0; s < 3; s++) {
      const quad = slotQuad(P, s);
      const [gl, d] = view[s];
      polyPath(g, quad); g.fillStyle = shadeHex(FACE[gl], light[s]); g.fill();
      inUnit(g, slotPictureTransform(P, s, d), 0.15, () => drawLetter(g, gl, 0.14));
      if (light[s] < 1) { polyPath(g, quad); g.fillStyle = `rgba(0,0,0,${((1 - light[s]) * 0.25).toFixed(3)})`; g.fill(); }
    }
    g.lineJoin = 'round';
    for (let s = 0; s < 3; s++) { polyPath(g, slotQuad(P, s)); g.strokeStyle = '#1f252b'; g.lineWidth = 1.5; g.stroke(); }
  },

  drawBoard(g, br, env) {
    if (env.assets?.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state: st } = env;
    const rd = m.rounds[0];
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, br.w, br.h);
    const A = m.ext ? m.ext.net : NET_AREA;
    rr(g, A.x, A.y, A.w, A.h, 8); g.fillStyle = '#e9edf2'; g.fill(); g.strokeStyle = '#d5dde6'; g.lineWidth = 1; g.stroke();
    this._net(g, rd.net, m);
    for (let i = 0; i < nCand(m); i++) {
      const c = cardOf(m, i), on = !!st.sel[i];
      rr(g, c.x, c.y, c.w, c.h, 8);
      g.fillStyle = on ? '#e7f3ff' : '#ffffff'; g.fill();
      g.strokeStyle = on ? ACCENT : '#d3dae2'; g.lineWidth = on ? 3 : 1.2; g.stroke();
      this._cube(g, rd.cands[i].view, c.x + c.w / 2, c.y + c.h / 2 + 2, cubeKOf(m));
      if (on) {
        g.beginPath(); g.arc(c.x + c.w - 11, c.y + 11, 8, 0, TAU); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(c.x + c.w - 14.5, c.y + 11); g.lineTo(c.x + c.w - 12, c.y + 14); g.lineTo(c.x + c.w - 7, c.y + 8); g.stroke();
        g.lineCap = 'butt';
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const inR = (R) => evt.x >= R.x && evt.x <= R.x + R.w && evt.y >= R.y && evt.y <= R.y + R.h;
    const m = env.manifest, op = m && m.ext ? 'pick' : 'toggle';
    for (let i = 0; i < nCand(m); i++) if (inR(cardOf(m, i))) return [{ op, i }];
    return [];
  },

  footerStatus(env) {
    const n = env.state.sel.filter(Boolean).length;
    return n ? `${n} selected` : 'Click a cube';
  },
};

export function gate(m) { return contractOk(m); }
export default task;

export function semanticKey(m) {
  const rd = m.rounds[0];
  return `box_fold_select|${rd.net.cells.map((p) => p.join(',')).join(';')}|${rd.net.glyph.join('')}|`
    + `${rd.cands.map((c) => c.view.map((e) => e.join('.')).join('/')).join(';')}|${rd.answer.join(',')}`;
}
