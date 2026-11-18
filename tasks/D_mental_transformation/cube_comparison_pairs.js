import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { splitIds } from '../core/style.js';
import * as X from '../common/_style_pool_mat.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 338 };
const HARD = Object.freeze({ pairs: 6 });
const EXT_PAIRS = 5;
const LETTERS = ['F', 'G', 'J', 'P', 'R', 'E', 'K', 'T', 'Y', 'A', 'B'];

const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SLOTS = [2, 4, 0];
const eq3 = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const faceOf = (v) => N.findIndex((n) => eq3(n, v));
const mul = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const mulT = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const matmul = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
};
const det3 = (M) => M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const ROT = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const M = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
    if (det3(M) === 1) out.push(M);
  }
  return out;
})();
const TURNS = [
  { axis: 2, M: [0, 0, 1, 0, 1, 0, -1, 0, 0] }, { axis: 2, M: [0, 0, -1, 0, 1, 0, 1, 0, 0] },
];
const QTURNS = ROT.filter((M) => M[0] + M[4] + M[8] === 1).map((M) => ({ axis: [M[0], M[4], M[8]].indexOf(1), M }));
const VIEW_REFL = [[0, 0, 1, 0, 1, 0, 1, 0, 0], [0, 1, 0, 1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 1, 0]];
function reflectView(V, F) {
  const out = new Array(3);
  for (let s = 0; s < 3; s++) {
    const t = SLOTS.findIndex((m) => eq3(N[m], mul(F, N[SLOTS[s]])));
    out[t] = { sym: V[s].sym, up: mul(F, V[s].up) };
  }
  return out;
}
const mirrorPossible = (A, B) => sameCubePossible(reflectView(A, VIEW_REFL[0]), B);
function spin(v, n, q) {
  let w = v.slice();
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) w = cross(n, w);
  return w;
}
function quartersBetween(a, b, n) {
  for (let q = 0; q < 4; q++) if (eq3(spin(a, n, q), b)) return q;
  return -1;
}

function viewOf(cube, g) {
  return SLOTS.map((m) => {
    const n = N.findIndex((v) => eq3(mul(g, v), N[m]));
    return { sym: cube[n].sym, up: mul(g, cube[n].up) };
  });
}

function consistentUnder(A, B, h) {
  for (let s = 0; s < 3; s++) {
    const n = mulT(h, N[SLOTS[s]]);
    const sa = SLOTS.findIndex((m) => eq3(N[m], n));
    if (sa >= 0) { if (A[sa].sym !== B[s].sym || !eq3(A[sa].up, mulT(h, B[s].up))) return false; }
    else if (A.some((a) => a.sym === B[s].sym)) return false;
  }
  return true;
}
export function sameCubePossible(A, B) { return ROT.some((h) => consistentUnder(A, B, h)); }
const oneQuarterTurn = (A, B, turns = TURNS) => turns.some((t) => consistentUnder(A, B, t.M));

function pairShape(A, B) {
  const shared = [];
  for (let s = 0; s < 3; s++) {
    const t = B.findIndex((b) => b.sym === A[s].sym);
    if (t >= 0) shared.push({ sa: s, sb: t });
  }
  const stay = shared.filter((x) => x.sa === x.sb);
  if (shared.length !== 2 || stay.length !== 1) return null;
  const st = stay[0];
  const q = quartersBetween(A[st.sa].up, B[st.sb].up, N[SLOTS[st.sa]]);
  const move = shared.find((x) => x !== st);
  return { shared, stay: st, move, stayQ: q };
}

function randomCube(rng, nSyms = LETTERS.length) {
  const syms = rng.sample(Array.from({ length: nSyms }, (_, i) => i), 6);
  return N.map((n, f) => {
    const axes = N.filter((v) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2] === 0);
    return { sym: syms[f], up: rng.pick(axes).slice() };
  });
}

function makePairQ(rng, same) {
  for (let guard = 0; guard < 400; guard++) {
    const cube = randomCube(rng);
    const gA = rng.pick(ROT);
    const A = viewOf(cube, gA);
    const turn = rng.pick(QTURNS);
    const Bt = viewOf(cube, matmul(turn.M, gA));
    const shape = pairShape(A, Bt);
    if (!shape || (shape.stayQ !== 1 && shape.stayQ !== 3)) continue;
    let B = Bt.map((s) => ({ sym: s.sym, up: s.up.slice() })), edit = null;
    if (!same) {
      const mv = shape.move, st = shape.stay;
      const parallel = eq3(A[mv.sa].up, Bt[mv.sb].up);
      let Bm = null;
      if (!parallel) {
        const F = VIEW_REFL.find((M) => eq3(mul(M, N[SLOTS[st.sa]]), N[SLOTS[st.sa]]));
        const Ar = reflectView(A, F);
        const newSlot = [0, 1, 2].find((s) => s !== st.sb && s !== mv.sb);
        const cand = [0, 1, 2].map((s) => (s === newSlot ? { sym: Bt[s].sym, up: Bt[s].up.slice() } : { sym: Ar[s].sym, up: Ar[s].up.slice() }));
        const flipped = (s) => cand[s].sym === Bt[s].sym && eq3(cand[s].up, Bt[s].up.map((c) => -c));
        if (flipped(st.sb) && flipped(mv.sb) && mirrorPossible(A, cand)) Bm = cand;
      }
      if (parallel) edit = 'kept-letter-spun-other-way';
      else if (Bm) edit = 'mirror-cube';
      else edit = rng.raw() < 0.5 ? 'kept-letter-spun-other-way' : 'moved-letter-flipped';
      if (edit === 'kept-letter-spun-other-way') B[st.sb].up = spin(B[st.sb].up, N[SLOTS[st.sb]], 2);
      else if (edit === 'moved-letter-flipped') B[mv.sb].up = spin(B[mv.sb].up, N[SLOTS[mv.sb]], 2);
      else B = Bm;
    }
    if (sameCubePossible(A, B) !== same) continue;
    const sh2 = pairShape(A, B);
    if (!sh2 || (sh2.stayQ !== 1 && sh2.stayQ !== 3)) continue;
    return { A, B, same, turnAxis: turn.axis, edit };
  }
  throw new Error('cube_comparison_pairs: could not build a pair');
}

function makePair(rng, same, nSyms = LETTERS.length) {
  for (let guard = 0; guard < 200; guard++) {
    const cube = randomCube(rng, nSyms);
    const gA = rng.pick(ROT);
    const A = viewOf(cube, gA);
    const turn = rng.pick(TURNS);
    let B = viewOf(cube, matmul(turn.M, gA));
    const shape = pairShape(A, B);
    if (!shape || (shape.stayQ !== 1 && shape.stayQ !== 3)) continue;
    let edit = null;
    if (!same) {
      B = B.map((s) => ({ sym: s.sym, up: s.up.slice() }));
      const mv = shape.move, parallel = eq3(A[mv.sa].up, B[mv.sb].up);
      if (parallel || rng.raw() < 0.5) {
        const s = shape.stay.sb;
        B[s].up = spin(B[s].up, N[SLOTS[s]], 2);
        edit = 'kept-letter-spun-other-way';
      } else {
        B[mv.sb].up = spin(B[mv.sb].up, N[SLOTS[mv.sb]], 2);
        edit = 'moved-letter-flipped';
      }
    }
    if (sameCubePossible(A, B) !== same) continue;
    const sh2 = pairShape(A, B);
    if (!sh2 || (sh2.stayQ !== 1 && sh2.stayQ !== 3)) continue;
    return { A, B, same, turnAxis: turn.axis, edit };
  }
  throw new Error('cube_comparison_pairs: could not build a pair');
}

function nearMiss(A, B, shape, turns = TURNS) {
  for (const t of turns) for (const which of ['stay', 'move']) {
    const s = shape[which].sb;
    const B0 = B.map((x, i) => ({ sym: x.sym, up: i === s ? spin(x.up, N[SLOTS[i]], 2) : x.up }));
    if (!consistentUnder(A, B0, t.M)) continue;
    const parallel = eq3(A[shape.move.sa].up, B0[shape.move.sb].up);
    if (which === 'move' && parallel) continue;
    return true;
  }
  return false;
}

const validUp = (slotNormal, up) => Array.isArray(up) && up.length === 3 && up.every((c) => c === 0 || c === 1 || c === -1)
  && Math.abs(up[0]) + Math.abs(up[1]) + Math.abs(up[2]) === 1 && up[0] * slotNormal[0] + up[1] * slotNormal[1] + up[2] * slotNormal[2] === 0;
function viewOk(V, nSyms = LETTERS.length) {
  if (!Array.isArray(V) || V.length !== 3) return false;
  for (let s = 0; s < 3; s++) {
    const x = V[s];
    if (!x || !Number.isInteger(x.sym) || x.sym < 0 || x.sym >= nSyms || !validUp(N[SLOTS[s]], x.up)) return false;
  }
  return new Set(V.map((x) => x.sym)).size === 3;
}
export function gate(m) {
  if (m && m.ext) return gateExt(m);
  if (!m || m.task !== 'cube_comparison_pairs' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.pairs) || m.pairs.length !== HARD.pairs || !Array.isArray(m.answer)) return false;
  const truth = [];
  for (const p of m.pairs) {
    if (!p || !viewOk(p.A) || !viewOk(p.B)) return false;
    const shape = pairShape(p.A, p.B);
    if (!shape || (shape.stayQ !== 1 && shape.stayQ !== 3)) return false;
    const possible = sameCubePossible(p.A, p.B);
    if (possible !== p.same) return false;
    if (possible && !oneQuarterTurn(p.A, p.B, QTURNS)) return false;
    if (!possible && !nearMiss(p.A, p.B, shape, QTURNS) && !mirrorPossible(p.A, p.B)) return false;
    truth.push(possible);
  }
  const ans = new Set(m.answer);
  if (ans.size !== m.answer.length || !m.answer.every((i) => Number.isInteger(i) && i >= 0 && i < HARD.pairs)) return false;
  if (ans.size === 0 || ans.size === HARD.pairs) return false;
  for (let i = 0; i < HARD.pairs; i++) if (truth[i] !== ans.has(i)) return false;
  return true;
}

const COS30 = Math.cos(Math.PI / 6);
const CARD = { w: 182, h: 104 };
const EDGE = 38;
function cardRect(i) {
  const row = Math.floor(i / 2), col = i % 2;
  return { x: 5 + col * (CARD.w + 6), y: 6 + row * (CARD.h + 6), w: CARD.w, h: CARD.h };
}
const S = (v, e) => ({ x: (v[0] - v[2]) * COS30 * e, y: (-v[1] + 0.5 * (v[0] + v[2])) * e });

function drawCube(g, V, cx, cy, e) {
  const P = (x, y, z) => { const s = S([x, y, z], e); return { x: cx + s.x, y: cy + s.y }; };
  const faces = [
    { slot: 1, n: [0, 0, 1], pts: [P(-0.5, 0.5, 0.5), P(0.5, 0.5, 0.5), P(0.5, -0.5, 0.5), P(-0.5, -0.5, 0.5)], fill: '#eef1f5' },
    { slot: 2, n: [1, 0, 0], pts: [P(0.5, 0.5, 0.5), P(0.5, 0.5, -0.5), P(0.5, -0.5, -0.5), P(0.5, -0.5, 0.5)], fill: '#dde3ea' },
    { slot: 0, n: [0, 1, 0], pts: [P(-0.5, 0.5, -0.5), P(0.5, 0.5, -0.5), P(0.5, 0.5, 0.5), P(-0.5, 0.5, 0.5)], fill: '#ffffff' },
  ];
  g.lineJoin = 'round';
  for (const f of faces) {
    g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    g.fillStyle = f.fill; g.fill();
  }
  for (const f of faces) {
    const slot = V[f.slot];
    const up = slot.up, right = cross(up, f.n);
    const c = S(f.n.map((k) => k * 0.5), e);
    const R = S(right, e), U = S(up, e);
    g.save();
    g.transform(R.x / 100, R.y / 100, -U.x / 100, -U.y / 100, cx + c.x, cy + c.y);
    g.fillStyle = '#1d2630';
    g.font = `800 66px ${UI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(LETTERS[slot.sym], 0, 3);
    g.restore();
  }
  g.strokeStyle = '#27313a'; g.lineWidth = 1.6;
  for (const f of faces) {
    g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
  }
}

export default {
  meta: {
    name: 'cube_comparison_pairs', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', pair: '0..5 (cards in reading order; tap again to clear)' }],
    promptHuman: 'Tap each pair that could be the same cube. No letter repeats on a cube; the way each letter faces counts.',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext);
    let flags;
    do { flags = Array.from({ length: HARD.pairs }, () => rng.raw() < 0.5); }
    while (flags.every(Boolean) || flags.every((f) => !f));
    const pairs = flags.map((same) => makePairQ(rng, same));
    return {
      task: 'cube_comparison_pairs', board: { ...BOARD },
      pairs: pairs.map((p) => ({ A: p.A, B: p.B, same: p.same })),
      answer: flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0),
    };
  },

  init(m) { return { selected: new Array(m && m.pairs ? m.pairs.length : HARD.pairs).fill(false) }; },

  applyAction(state, a, m) {
    const n = m && m.pairs ? m.pairs.length : HARD.pairs;
    if (a?.op !== 'toggle' || !Number.isInteger(a.pair) || a.pair < 0 || a.pair >= n) return { ok: false, reason: 'bad-action' };
    state.selected[a.pair] = !state.selected[a.pair];
    return { ok: true };
  },

  verify(state, m) {
    const ans = new Set(m.answer), n = m.pairs.length;
    let exact = 0;
    for (let i = 0; i < n; i++) if (state.selected[i] === ans.has(i)) exact++;
    const success = exact === n;
    return { success, partial: exact / n, error: n - exact, detail: { selected: state.selected.filter(Boolean).length } };
  },

  oracle(m) { return m.answer.map((pair) => ({ op: 'toggle', pair })); },

  randomPolicy(m, rnd) {
    const acts = [];
    for (let i = 0; i < m.pairs.length; i++) if (rnd() < 0.5) acts.push({ op: 'toggle', pair: i });
    return acts;
  },

  async mount(env) { if (env.manifest?.ext) env.assets.cubeLook = await mountCubeLook(env); },

  drawPrompt(g, r, env) {
    if (env?.manifest?.ext) drawPromptText(g, r, 'Tap each pair that could be the same cube', env.manifest.glyphKind === 'icon' ? 'No picture appears twice on one cube' : 'No letter appears twice on one cube');
    else drawPromptText(g, r, 'Tap each pair that could be the same cube', 'No letter repeats on a cube; the way each letter faces counts');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    if (m.ext) { drawCubesExt(g, br, env); return; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f2f4f7'; g.fillRect(0, 0, br.w, br.h);
    m.pairs.forEach((p, i) => {
      const r = cardRect(i), sel = state.selected[i];
      rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
      g.fillStyle = sel ? '#e8f3ff' : '#ffffff'; g.fill();
      g.strokeStyle = sel ? ACCENT : '#d3dae2'; g.lineWidth = sel ? 2.5 : 1; g.stroke(); g.lineWidth = 1;
      g.strokeStyle = sel ? '#b9d8f7' : '#e3e8ee'; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(r.x + r.w / 2, r.y + 16); g.lineTo(r.x + r.w / 2, r.y + r.h - 16); g.stroke(); g.setLineDash([]);
      const cy = r.y + r.h / 2 + 1;
      drawCube(g, p.A, r.x + r.w / 2 - 46, cy, EDGE);
      drawCube(g, p.B, r.x + r.w / 2 + 46, cy, EDGE);
      if (sel) {
        g.beginPath(); g.arc(r.x + r.w - 13, r.y + 13, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('✓', r.x + r.w - 13, r.y + 13.5);
      }
    });
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    for (let i = 0; i < env.manifest.pairs.length; i++) {
      const r = env.manifest.ext ? cardRectExt(i, env.manifest) : cardRect(i);
      if (e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h) return [{ op: 'toggle', pair: i }];
    }
    return [];
  },

  footerStatus(env) {
    const n = env.state.selected.filter(Boolean).length;
    return `${n} selected`;
  },
};

export const _internals = { LETTERS, N, SLOTS, ROT, TURNS, viewOf, pairShape, sameCubePossible, consistentUnder, oneQuarterTurn, quartersBetween, spin, cardRect, CARD, EDGE };

const GLYPH_SETS = [
  { id: 'caps_a', kind: 'font', syms: LETTERS },
  { id: 'caps_b', kind: 'font', syms: ['B', 'C', 'D', 'E', 'F', 'G', 'K', 'L', 'P', 'R', 'T', 'Y'] },
  { id: 'digits_caps', kind: 'font', syms: ['2', '3', '4', '5', '7', 'F', 'G', 'J', 'K', 'P', 'R'] },
  { id: 'lower', kind: 'font', syms: ['a', 'b', 'f', 'k', 'm', 'r', 't', 'y'] },
  { id: 'icons', kind: 'icon', syms: ['arrow', 'flag', 'house', 'key', 'heart', 'crescent', 'drop', 'note', 'boot', 'mug', 'umbrella', 'bell'] },
];
const glyphSplit = splitIds('cube_comparison_pairs_glyphs', GLYPH_SETS.map((s) => s.id), 1);
const EXT_LAYOUTS = ['r221', 'r122', 'r212', 'c32', 'c23'];
const layoutSplit = splitIds('cube_comparison_pairs_layouts', EXT_LAYOUTS, 1);
function cardRectExt(i, m) { return m.cards[i]; }
function extCards(rng, layout) {
  for (let att = 0; att < 60; att++) {
    const c = extCardsTry(rng, layout);
    if (cardsOk(c)) return c;
  }
  throw new Error('cube_comparison_pairs: no card layout');
}
function extCardsTry(rng, layout) {
  const gx = rng.int(4, 8), gy = rng.int(4, 9), w = rng.int(CARD.w, Math.min(184, Math.floor((BOARD.w - 8 - gx) / 2))), h = rng.int(CARD.h, Math.min(106, Math.floor((BOARD.h - 8 - 2 * gy) / 3)));
  const out = [];
  if (layout[0] === 'r') {
    const rows = layout.slice(1).split('').map(Number);
    const H = rows.length * h + (rows.length - 1) * gy, y0 = rng.uniform(4, BOARD.h - 4 - H);
    const W2 = 2 * w + gx, x0 = rng.uniform(4, BOARD.w - 4 - W2);
    rows.forEach((n, r) => {
      const y = y0 + r * (h + gy);
      if (n === 2) for (let c = 0; c < 2; c++) out.push({ x: x0 + c * (w + gx), y, w, h });
      else out.push({ x: rng.uniform(4, BOARD.w - 4 - w), y, w, h });
    });
  } else {
    const cols = layout.slice(1).split('').map(Number);
    const W = 2 * w + gx, x0 = rng.uniform(4, BOARD.w - 4 - W);
    cols.forEach((n, c) => {
      const H = n * h + (n - 1) * gy, y0 = rng.uniform(4, BOARD.h - 4 - H);
      for (let r = 0; r < n; r++) out.push({ x: x0 + c * (w + gx), y: y0 + r * (h + gy), w, h });
    });
  }
  return out.map((q) => ({ x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: q.w, h: q.h }));
}
const cardsOk = (cards) => Array.isArray(cards) && cards.length === EXT_PAIRS &&cards.every((c, i) => c && c.x >= 3.9 && c.y >= 3.9 && c.x + c.w <= BOARD.w - 3.9 && c.y + c.h <= BOARD.h - 3.9
  && c.w >= CARD.w && c.w <= 184 && c.h >= CARD.h && c.h <= 106 && cards.every((o, j) => j === i || c.x + c.w <= o.x || o.x + o.w <= c.x || c.y + c.h <= o.y || o.y + o.h <= c.y));
function generateExt(rng, split) {
  const sets = GLYPH_SETS.filter((s) => glyphSplit(s.id) === split);
  const set = rng.pick(sets);
  const layout = rng.pick(EXT_LAYOUTS.filter((l) => layoutSplit(l) === split));
  const cards = extCards(rng, layout);
  const edge = EDGE;
  let flags;
  do { flags = Array.from({ length: EXT_PAIRS }, () => rng.raw() < 0.5); }
  while (flags.every(Boolean) || flags.every((f) => !f));
  const pairs = flags.map((same) => makePair(rng, same, set.syms.length));
  return {
    task: 'cube_comparison_pairs', board: { ...BOARD }, ext: split, glyphSet: set.id, glyphKind: set.kind, glyphs: set.syms.slice(), layout, cards, edge,
    pairs: pairs.map((p) => ({ A: p.A, B: p.B, same: p.same })),
    answer: flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0),
  };
}
export function semanticKey(m) {
  const v = (V) => V.map((x) => `${x.sym}:${x.up.join('')}`).join('/');
  return `cube|${m.glyphSet || 'caps_a'}|${m.pairs.map((p) => v(p.A) + '>' + v(p.B)).join(',')}`;
}
function gateExt(m) {
  if (m.task !== 'cube_comparison_pairs' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || (m.ext !== 'train' && m.ext !== 'test')) return false;
  const set = GLYPH_SETS.find((s) => s.id === m.glyphSet);
  if (!set || glyphSplit(set.id) !== m.ext || JSON.stringify(set.syms) !== JSON.stringify(m.glyphs) || m.glyphKind !== set.kind) return false;
  if (!EXT_LAYOUTS.includes(m.layout) || layoutSplit(m.layout) !== m.ext || !cardsOk(m.cards) || m.edge !== EDGE) return false;
  if (!Array.isArray(m.pairs) || m.pairs.length !== EXT_PAIRS || !Array.isArray(m.answer)) return false;
  const truth = [];
  for (const p of m.pairs) {
    if (!p || !viewOk(p.A, set.syms.length) || !viewOk(p.B, set.syms.length)) return false;
    const shape = pairShape(p.A, p.B);
    if (!shape || (shape.stayQ !== 1 && shape.stayQ !== 3)) return false;
    const possible = sameCubePossible(p.A, p.B);
    if (possible !== p.same) return false;
    if (possible && !oneQuarterTurn(p.A, p.B)) return false;
    if (!possible && !nearMiss(p.A, p.B, shape)) return false;
    truth.push(possible);
  }
  const ans = new Set(m.answer);
  if (ans.size !== m.answer.length || !m.answer.every((i) => Number.isInteger(i) && i >= 0 && i < EXT_PAIRS)) return false;
  if (ans.size === 0 || ans.size === EXT_PAIRS) return false;
  for (let i = 0; i < EXT_PAIRS; i++) if (truth[i] !== ans.has(i)) return false;
  return true;
}

function iconPath(g, id) {
  g.beginPath();
  switch (id) {
    case 'arrow': g.moveTo(-6, 32); g.lineTo(6, 32); g.lineTo(6, -6); g.lineTo(18, -6); g.lineTo(0, -32); g.lineTo(-18, -6); g.lineTo(-6, -6); g.closePath(); break;
    case 'flag': g.rect(-18, -32, 6, 64); g.moveTo(-12, -32); g.lineTo(24, -20); g.lineTo(-12, -6); g.closePath(); break;
    case 'house': g.moveTo(-24, 30); g.lineTo(24, 30); g.lineTo(24, -4); g.lineTo(0, -28); g.lineTo(-24, -4); g.closePath(); g.moveTo(-6, 30); g.lineTo(-6, 12); g.lineTo(6, 12); g.lineTo(6, 30); g.closePath(); break;
    case 'key': g.arc(0, -18, 14, 0, Math.PI * 2); g.moveTo(5, -18); g.arc(0, -18, 5, 0, Math.PI * 2, true); g.rect(-4, -6, 8, 38); g.rect(4, 16, 12, 6); g.rect(4, 26, 9, 6); break;
    case 'heart': g.moveTo(0, 30); g.bezierCurveTo(-34, 6, -30, -30, 0, -14); g.bezierCurveTo(30, -30, 34, 6, 0, 30); g.closePath(); break;
    case 'crescent': g.arc(0, 0, 28, 0, Math.PI * 2); g.moveTo(32, 0); g.arc(12, 0, 22, 0, Math.PI * 2, true); break;
    case 'drop': g.moveTo(0, -32); g.bezierCurveTo(10, -14, 24, 0, 24, 12); g.arc(0, 12, 24, 0, Math.PI); g.bezierCurveTo(-24, 0, -10, -14, 0, -32); g.closePath(); break;
    case 'note': g.ellipse(-8, 22, 12, 9, -0.4, 0, Math.PI * 2); g.rect(1, -30, 6, 52); g.moveTo(7, -30); g.bezierCurveTo(22, -24, 26, -12, 18, -2); g.bezierCurveTo(20, -12, 14, -16, 7, -16); g.closePath(); break;
    case 'boot': g.moveTo(-18, -32); g.lineTo(4, -32); g.lineTo(4, 8); g.lineTo(24, 14); g.lineTo(26, 30); g.lineTo(-18, 30); g.closePath(); break;
    case 'mug': g.rect(-22, -20, 30, 48); g.moveTo(8, -10); g.lineTo(18, -10); g.arc(18, 4, 14, -Math.PI / 2, Math.PI / 2); g.lineTo(8, 18); g.lineTo(8, 12); g.lineTo(18, 12); g.arc(18, 4, 8, Math.PI / 2, -Math.PI / 2, true); g.lineTo(8, -4); g.closePath(); break;
    case 'umbrella': g.moveTo(-30, -2); g.arc(0, -2, 30, Math.PI, 0); g.closePath(); g.rect(-2.5, -2, 5, 26); g.moveTo(2.5, 22); g.arc(-6, 22, 8.5, 0, Math.PI); g.lineTo(-9.5, 22); g.arc(-6, 22, 3.5, Math.PI, 0, true); g.closePath(); break;
    case 'bell': g.moveTo(-26, 18); g.bezierCurveTo(-18, 12, -20, -28, 0, -28); g.bezierCurveTo(20, -28, 18, 12, 26, 18); g.closePath(); g.moveTo(7, 25); g.arc(0, 25, 7, 0, Math.PI * 2); break;
    default: g.rect(-20, -20, 40, 40);
  }
}
const CUBE_MATS = [
  { id: 'wood_block', type: 'tex', use: 'wood', lum: 0.42, ink: ['#1d2630', '#8a1f14', '#143c7a', '#1d5a2a'] },
  { id: 'dark_wood', type: 'tex', use: 'wood', lum: 0.12, ink: ['#f6efe0', '#ffd27a'] },
  { id: 'marble', type: 'tex', use: 'stone', lum: 0.5, ink: ['#1d2630', '#3b2a1a'] },
  { id: 'cardboard', type: 'flat', top: '#d9b98a', ink: ['#2a1d10', '#1d2b48'] },
  { id: 'painted_red', type: 'flat', top: '#d0473a', ink: ['#ffffff', '#fff1c2'] },
  { id: 'painted_blue', type: 'flat', top: '#3a6fc4', ink: ['#ffffff', '#ffe28a'] },
  { id: 'painted_green', type: 'flat', top: '#3f9a58', ink: ['#ffffff', '#10261a'] },
  { id: 'painted_yellow', type: 'flat', top: '#f0c93c', ink: ['#1d2630', '#5a1a10'] },
  { id: 'brushed_metal', type: 'tex', use: 'metal', lum: 0.35, ink: ['#111417', '#0d2a55'] },
  { id: 'ivory_plastic', type: 'flat', top: '#f4efe2', ink: ['#1d2630', '#a3261d', '#1f4f8a'] },
  { id: 'black_plastic', type: 'flat', top: '#33373c', ink: ['#ffffff', '#ffd23f'] },
  { id: 'concrete', type: 'tex', use: 'floor', lum: 0.3, ink: ['#0e1114', '#f4f4f0'] },
];
const CARD_LOOKS = [
  { id: 'white', fill: '#ffffff', edge: '#d3dae2' },
  { id: 'cream', fill: '#f7f2e6', edge: '#ddd2bb' },
  { id: 'grey_felt', fill: '#9aa0a6', edge: '#7a8086' },
  { id: 'pale_blue', fill: '#e6eef7', edge: '#bfcfe0' },
  { id: 'kraft', fill: '#d8bd8c', edge: '#a88a56' },
  { id: 'slate', fill: '#3c4248', edge: '#24292e' },
  { id: 'mint', fill: '#e3f1e6', edge: '#b8d3bf' },
];
const SURF_USES = new Set(['wood', 'fabric', 'floor', 'stone', 'flat2d']);

async function mountCubeLook(env) {
  const st = env.style, m = env.manifest;
  env.assets.qcache = new Map();
  if (!st) return null;
  const rnd = st.rand;
  const surf = st.primary('tex', (t) => SURF_USES.has(t.use));
  const mats = X.stylePool(st, 'cube_mats', CUBE_MATS, 3);
  const mat = mats[X.seqPick(st, 'cube-mat', mats.length)];
  const mtex = mat.type === 'tex' ? st.pick('tex', (t) => t.use === mat.use) : null;
  const cards = X.stylePool(st, 'cube_cards', CARD_LOOKS, 1);
  const card = cards[X.seqPick(st, 'card', cards.length)];
  const font = X.pickSplit(st, 'cube_fonts_r3', X.FONTS.filter((f) => f.id !== 'noto_serif'));
  const ink = X.pickSplit(st, `cube_ink_${mat.id}`, mat.ink);
  st.note(`cube:${mat.id} card:${card.id} font:${font.id} ink:${ink} glyphs:${m.glyphSet}`);
  return {
    surf: await X.loadTex(surf), surfLum: 0.1 + 0.35 * rnd(), surfRot: 90 * Math.floor(rnd() * 4), surfScale: 0.35 + 0.4 * rnd(),
    mat, mtex: mtex ? await X.loadTex(mtex) : null, card, font, ink, texOff: [Math.floor(rnd() * 400), Math.floor(rnd() * 400)],
    lightK: 0.85 + 0.3 * rnd(),
  };
}

function drawCubeExt(g, V, cx, cy, e, m, L) {
  const P = (x, y, z) => { const s = S([x, y, z], e); return { x: cx + s.x, y: cy + s.y }; };
  const faces = [
    { slot: 1, n: [0, 0, 1], pts: [P(-0.5, 0.5, 0.5), P(0.5, 0.5, 0.5), P(0.5, -0.5, 0.5), P(-0.5, -0.5, 0.5)], shade: 0.86 },
    { slot: 2, n: [1, 0, 0], pts: [P(0.5, 0.5, 0.5), P(0.5, 0.5, -0.5), P(0.5, -0.5, -0.5), P(0.5, -0.5, 0.5)], shade: 0.7 },
    { slot: 0, n: [0, 1, 0], pts: [P(-0.5, 0.5, -0.5), P(0.5, 0.5, -0.5), P(0.5, 0.5, 0.5), P(-0.5, 0.5, 0.5)], shade: 1 },
  ];
  const M = L ? L.mat : { type: 'flat', top: '#ffffff' };
  const path = (f) => { g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  g.lineJoin = 'round';
  g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(cx + e * 0.12, cy + e * 0.95, e * 0.95, e * 0.22, 0, 0, Math.PI * 2); g.fill(); g.restore();
  for (const f of faces) {
    path(f);
    const k = f.shade * (L ? L.lightK : 1);
    if (M.type === 'tex' && L.mtex) {
      const o = f.pts[0], u = { x: f.pts[1].x - o.x, y: f.pts[1].y - o.y }, v = { x: f.pts[3].x - o.x, y: f.pts[3].y - o.y };
      g.save(); g.clip();
      g.filter = X.texFilter(L.mtex, M.lum * Math.min(1, k), 0.8);
      const pat = g.createPattern(L.mtex.img, 'repeat');
      if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([u.x / 256, u.y / 256, v.x / 256, v.y / 256, o.x - L.texOff[0] * u.x / 256, o.y - L.texOff[1] * v.y / 256]));
      g.fillStyle = pat; g.fillRect(cx - 2 * e, cy - 2 * e, 4 * e, 4 * e);
      g.filter = 'none';
      g.fillStyle = X.rgba(X.meanAt(L.mtex, M.lum * Math.min(1, k)), 0.4); g.fillRect(cx - 2 * e, cy - 2 * e, 4 * e, 4 * e);
      g.restore();
    } else {
      g.fillStyle = X.shadeHex(M.top || '#b89a6e', k >= 1 ? Math.min(0.15, k - 1) : -(1 - k)); g.fill();
    }
  }
  for (const f of faces) {
    const slot = V[f.slot];
    const up = slot.up, right = cross(up, f.n);
    const c = S(f.n.map((q) => q * 0.5), e);
    const R = S(right, e), U = S(up, e);
    g.save();
    g.transform(R.x / 100, R.y / 100, -U.x / 100, -U.y / 100, cx + c.x, cy + c.y);
    g.fillStyle = L ? L.ink : '#1d2630';
    if (m.glyphKind === 'icon') { iconPath(g, m.glyphs[slot.sym]); g.fill('evenodd'); }
    else { g.font = L ? X.fontCss(L.font, 64, 800) : `800 66px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.glyphs[slot.sym], 0, 3); }
    g.restore();
  }
  g.strokeStyle = M.type === 'flat' && X.relLum(M.top) < 0.1 ? '#0b0d0f' : 'rgba(25,30,36,0.85)'; g.lineWidth = 1.4;
  for (const f of faces) { path(f); g.stroke(); }
}

function drawCubesExt(g, br, env) {
  const { manifest: m, state } = env, L = env.assets.cubeLook;
  g.save(); g.translate(br.x, br.y);
  X.drawCached(g, env.assets.qcache, 'cubes', br.w, br.h, (cg) => {
    if (L) X.fillTex(cg, L.surf, { rect: [0, 0, br.w, br.h], lum: L.surfLum, sat: 0.8, scale: L.surfScale, rot: L.surfRot });
    else { cg.fillStyle = '#f2f4f7'; cg.fillRect(0, 0, br.w, br.h); }
    const C = L ? L.card : CARD_LOOKS[0];
    m.pairs.forEach((p, i) => {
      const r = cardRectExt(i, m);
      cg.save(); cg.shadowColor = 'rgba(0,0,0,0.28)'; cg.shadowBlur = 6; cg.shadowOffsetY = 2;
      rr(cg, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8); cg.fillStyle = C.fill; cg.fill(); cg.restore();
      rr(cg, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8); cg.strokeStyle = C.edge; cg.lineWidth = 1; cg.stroke();
      cg.strokeStyle = X.rgba(C.edge, 0.9); cg.setLineDash([3, 4]);
      cg.beginPath(); cg.moveTo(r.x + r.w / 2, r.y + 16); cg.lineTo(r.x + r.w / 2, r.y + r.h - 16); cg.stroke(); cg.setLineDash([]);
      const cy = r.y + r.h / 2 + 1, dx = Math.min(46, r.w / 2 - 0.87 * m.edge - 6);
      drawCubeExt(cg, p.A, r.x + r.w / 2 - dx, cy, m.edge, m, L);
      drawCubeExt(cg, p.B, r.x + r.w / 2 + dx, cy, m.edge, m, L);
    });
  });
  m.pairs.forEach((p, i) => {
    if (!state.selected[i]) return;
    const r = cardRectExt(i, m);
    rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
    g.fillStyle = 'rgba(25,145,250,0.10)'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = ACCENT; g.lineWidth = 2.6; g.stroke(); g.lineWidth = 1;
    g.beginPath(); g.arc(r.x + r.w - 13, r.y + 13, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
    g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('✓', r.x + r.w - 13, r.y + 13.5);
  });
  g.restore();
}
