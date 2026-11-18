import { drawPromptText } from '../core/panel.js';
import { nthOf, hash32 } from '../core/style.js';
import { PC3_BANK } from '../common/_pipes_connect_3d_bank.js';
import { makeIsoCam, prim, tube, renderScene, toCanvas, contextScale, badge, MATERIALS } from '../common/_pipes_connect_iso.js';

const HARD = Object.freeze({ cols: 4, rows: 3, strands: 5, maxSteps: 8, minD: 3, rounds: 1, maxLoad: 14, hubs: 0, minPieces: 3, maxTaps: 5 });
const EXT_HARD = Object.freeze({ cols: 4, rows: 3, strands: 4, maxSteps: 8, minD: 3, rounds: 1, minRoute: 4, maxLoad: 10, hubs: 0, minMeet: 1 });
const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 372 };

const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
const opp = (s) => (s + 2) & 3;
const TYPES = ['I', 'L', 'D', 'X', 'H'];

function nbr(m, i, s) {
  const c = i % m.cols + DX[s], r = Math.floor(i / m.cols) + DZ[s];
  return c < 0 || c >= m.cols || r < 0 || r >= m.rows ? -1 : r * m.cols + c;
}

function channels(cell, k, mode) {
  if (!cell) return [];
  if (cell.t === 'H') return mode === 'h2' ? [[0, 2], [1, 3]] : [[0, 1, 2, 3]];
  if (cell.t === 'X' && mode === 'h1') return [[0, 1, 2, 3]];
  return cell.ch.map((c) => c.map((s) => (s + k) & 3));
}

export function joined(m, board, rot, mode = 'true') {
  const n = m.cols * m.rows;
  const par = new Int32Array(n * 4);
  for (let i = 0; i < par.length; i++) par[i] = i;
  const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const has = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (const ch of channels(board.cells[i], rot[i], mode)) {
      for (const s of ch) has[i * 4 + s] = 1;
      for (let q = 1; q < ch.length; q++) { const a = f(i * 4 + ch[0]), b = f(i * 4 + ch[q]); if (a !== b) par[a] = b; }
    }
  }
  for (let i = 0; i < n; i++) {
    for (const s of [1, 2]) {
      const j = nbr(m, i, s);
      if (j >= 0 && has[i * 4 + s] && has[j * 4 + opp(s)]) { const a = f(i * 4 + s), b = f(j * 4 + opp(s)); if (a !== b) par[a] = b; }
    }
  }
  const A = board.A[0] * 4 + board.A[1], B = board.B[0] * 4 + board.B[1];
  return !!(has[A] && has[B] && f(A) === f(B));
}

function allMatched(m, board, rot) {
  const n = m.cols * m.rows;
  const has = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) for (const ch of channels(board.cells[i], rot[i], 'true')) for (const s of ch) has[i * 4 + s] = 1;
  const term = new Set([board.A, board.B, ...board.caps].map(([i, s]) => i * 4 + s));
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < 4; s++) {
      const j = nbr(m, i, s);
      if (j < 0) { if (!!has[i * 4 + s] !== term.has(i * 4 + s)) return false; }
      else if (has[i * 4 + s] !== has[j * 4 + opp(s)]) return false;
    }
  }
  return true;
}

function genLayout(rng, cols, rows, K, H = HARD, seed = null) {
  const n = cols * rows;
  const m = { cols, rows };
  const passes = seed ? seed.passes.map((ps) => ps.map((p) => p.slice())) : Array.from({ length: n }, () => []);
  const used = new Array(n).fill(0);
  passes.forEach((ps, i) => ps.forEach(([a, b]) => { used[i] |= (1 << a) | (1 << b); }));
  const bUsed = new Set(seed ? seed.ends.map(([i, s]) => i * 4 + s) : []);
  const ends = seed ? seed.ends.map((e) => e.slice()) : [];
  const border = [];
  for (let i = 0; i < n; i++) for (let s = 0; s < 4; s++) if (nbr(m, i, s) < 0) border.push([i, s]);
  const exitsFor = (i, e) => {
    if (passes[i].length >= 2 || used[i] & (1 << e)) return [];
    if (passes[i].length === 0) return [0, 1, 2, 3].filter((x) => x !== e);
    const free = [0, 1, 2, 3].filter((x) => !(used[i] & (1 << x)));
    return free.filter((x) => x !== e);
  };
  for (let k = seed ? seed.strands : 0; k < K; k++) {
    for (let att = 0; att < 40; att++) {
      const [i0, s0] = rng.pick(border);
      if (bUsed.has(i0 * 4 + s0) || !exitsFor(i0, s0).length) continue;
      const snapU = used.slice(), snapP = passes.map((p) => p.slice());
      let i = i0, e = s0, steps = 0, ok = false;
      while (steps <= H.maxSteps) {
        const cand = [];
        for (const x of exitsFor(i, e)) {
          const j = nbr(m, i, x);
          let sc;
          if (j < 0) sc = bUsed.has(i * 4 + x) || (i * 4 + x) === (i0 * 4 + s0) ? -1 : steps >= 3 ? 1.2 : 0.05;
          else if (!exitsFor(j, opp(x)).length) sc = -1;
          else {
            sc = 1;
            if (passes[j].length === 1) sc += 2.5;
            if (passes[i].length === 0 && x !== opp(e)) sc += 0.6;
          }
          if (sc > 0) cand.push([x, sc]);
        }
        if (!cand.length) break;
        let u = rng.raw() * cand.reduce((a, [, s]) => a + s, 0), x = cand[0][0];
        for (const [xx, s] of cand) { u -= s; if (u <= 0) { x = xx; break; } }
        passes[i].push([e, x]); used[i] |= (1 << e) | (1 << x);
        steps++;
        const j = nbr(m, i, x);
        if (j < 0) { bUsed.add(i0 * 4 + s0); bUsed.add(i * 4 + x); ends.push([i0, s0], [i, x]); ok = true; break; }
        i = j; e = opp(x);
      }
      if (ok) break;
      for (let q = 0; q < n; q++) { used[q] = snapU[q]; passes[q] = snapP[q]; }
    }
  }
  return { passes, ends };
}

function classify(passes) {
  return passes.map((ps) => {
    if (!ps.length) return null;
    const turn = (p) => p[1] !== opp(p[0]);
    if (ps.length === 1) return { t: turn(ps[0]) ? 'L' : 'I', ch: [ps[0].slice().sort((a, b) => a - b)] };
    return { t: turn(ps[0]) ? 'D' : 'X', ch: ps.map((p) => p.slice().sort((a, b) => a - b)) };
  });
}

function routeCells(m, board, rot) {
  const n = m.cols * m.rows;
  const start = board.A;
  const seen = new Set([start[0]]);
  const q = [start];
  while (q.length) {
    const [i, s] = q.shift();
    for (const ch of channels(board.cells[i], rot[i], 'true')) {
      if (!ch.includes(s)) continue;
      for (const x of ch) {
        if (x === s) continue;
        const j = nbr(m, i, x);
        if (j < 0 || seen.has(j)) continue;
        seen.add(j); q.push([j, opp(x)]);
      }
    }
  }
  return seen.size;
}

function pathCells(m, board, rot, term) {
  const seen = new Set(), cells = new Set([term[0]]);
  const q = [term];
  while (q.length) {
    const [i, s] = q.pop();
    if (seen.has(i * 4 + s)) continue;
    seen.add(i * 4 + s);
    for (const ch of channels(board.cells[i], rot[i], 'true')) {
      if (!ch.includes(s)) continue;
      for (const x of ch) { if (x === s) continue; const j = nbr(m, i, x); if (j < 0) continue; cells.add(j); q.push([j, opp(x)]); }
    }
  }
  return cells.size;
}
const traceLoad = (m, board, rot) => pathCells(m, board, rot, board.A) + pathCells(m, board, rot, board.B);

export function meetingDecoys(m, board) {
  const n = m.cols * m.rows, zero = new Array(n).fill(0);
  const side = (term) => {
    const seen = new Set(); const q = [term];
    while (q.length) {
      const [i, s] = q.pop();
      if (seen.has(i * 4 + s)) continue;
      seen.add(i * 4 + s);
      for (const ch of channels(board.cells[i], zero[i], 'true')) {
        if (!ch.includes(s)) continue;
        for (const x of ch) { if (x === s) continue; seen.add(i * 4 + x); const j = nbr(m, i, x); if (j >= 0) q.push([j, opp(x)]); }
      }
    }
    return seen;
  };
  const cA = side(board.A), cB = side(board.B);
  let k = 0;
  board.cells.forEach((c, i) => {
    if (!c || c.t !== 'D' || i === board.fault) return;
    const inA = (ch) => ch.some((s) => cA.has(i * 4 + s)), inB = (ch) => ch.some((s) => cB.has(i * 4 + s));
    const [a, b] = c.ch;
    if ((inA(a) && inB(b)) || (inB(a) && inA(b))) k++;
  });
  return k;
}

function roundProblems(m, board, H = HARD, core = false) {
  const n = m.cols * m.rows;
  const errs = [];
  const zero = new Array(n).fill(0);
  if (!allMatched(m, board, zero)) errs.push('gap');
  const f = board.fault;
  if (!board.cells[f] || board.cells[f].t !== 'D') errs.push('fault-not-double-bend');
  if (joined(m, board, zero, 'true')) errs.push('already-joined');
  const fixed = zero.slice(); fixed[f] = 1;
  if (!joined(m, board, fixed, 'true')) errs.push('fault-does-not-fix');
  if (!core && !joined(m, board, zero, 'h1')) errs.push('h1-not-joined');
  if (H.hubs && joined(m, board, fixed, 'h2')) errs.push('h2-fix-works');
  for (let i = 0; i < n && !errs.length; i++) {
    if (!board.cells[i] || i === f) continue;
    for (let k = 1; k <= 3; k++) { const r2 = zero.slice(); r2[i] = k; if (joined(m, board, r2, 'true')) { errs.push(`second-fix-${i}`); break; } }
  }
  if (!errs.length && routeCells(m, board, fixed) < H.minRoute) errs.push('short-route');
  if (traceLoad(m, board, zero) > H.maxLoad) errs.push('long-trace');
  const dCount = board.cells.filter((c) => c && c.t === 'D').length;
  if (!core && dCount < H.minD) errs.push('few-double-bends');
  if (board.cells.filter((c) => c && c.t === 'H').length !== H.hubs) errs.push('hub-count');
  if (!errs.length && meetingDecoys(m, board) < H.minMeet) errs.push('no-decoy-meeting');
  return errs;
}

const turnsOf = (c) => (!c || c.t === 'X' || c.t === 'H' ? [] : c.t === 'L' ? [1, 2, 3] : [1]);

function fewPiecesFix(m, board) {
  const n = m.cols * m.rows, rot = new Array(n).fill(0);
  const opts = board.cells.map(turnsOf);
  for (let i = 0; i < n; i++) for (const ki of opts[i]) {
    rot[i] = ki;
    if (joined(m, board, rot, 'true')) { rot[i] = 0; return true; }
    for (let j = i + 1; j < n; j++) for (const kj of opts[j]) {
      rot[j] = kj;
      const hit = joined(m, board, rot, 'true');
      rot[j] = 0;
      if (hit) { rot[i] = 0; return true; }
    }
    rot[i] = 0;
  }
  return false;
}

export function cheapestFix(m, board, maxTaps = HARD.maxTaps) {
  const n = m.cols * m.rows, rot = new Array(n).fill(0);
  const cap = board.cells.map((c) => (turnsOf(c).length ? turnsOf(c)[turnsOf(c).length - 1] : 0));
  for (let cost = 0; cost <= maxTaps; cost++) {
    const dfs = (i, left) => {
      if (i === n) return left === 0 && joined(m, board, rot, 'true');
      for (let k = Math.min(cap[i], left); k >= 0; k--) { rot[i] = k; if (dfs(i + 1, left - k)) return true; }
      rot[i] = 0;
      return false;
    };
    if (dfs(0, cost)) return { cost, rot: rot.slice() };
  }
  return null;
}

function roundProblemsMulti(m, board, H = HARD) {
  const n = m.cols * m.rows;
  const errs = [];
  const zero = new Array(n).fill(0);
  if (!allMatched(m, board, zero)) errs.push('gap');
  if (board.cells.filter((c) => c && c.t === 'H').length !== H.hubs) errs.push('hub-count');
  if (board.cells.filter((c) => c && c.t === 'D').length < H.minD) errs.push('few-double-bends');
  if (errs.length) return errs;
  if (joined(m, board, zero, 'true')) errs.push('already-joined');
  else if (traceLoad(m, board, zero) > H.maxLoad) errs.push('long-trace');
  else if (!joined(m, board, zero, 'h1')) errs.push('h1-not-joined');
  if (errs.length) return errs;
  if (fewPiecesFix(m, board)) return ['cheap-fix'];
  const fix = cheapestFix(m, board, H.maxTaps);
  if (!fix) return ['no-fix-in-range'];
  if (fix.rot.filter((k) => k).length < H.minPieces) return ['cheap-fix'];
  return [];
}

function genBoard(rng, H = HARD) {
  const m = { cols: H.cols, rows: H.rows };
  for (let att = 0; att < 20000; att++) {
    const lay = genLayout(rng, m.cols, m.rows, H.strands, H);
    if (lay.ends.length < 6) continue;
    const cells = classify(lay.passes);
    const pairs = [];
    for (let a = 0; a < lay.ends.length; a++) for (let b = a + 1; b < lay.ends.length; b++) if ((a >> 1) !== (b >> 1)) pairs.push([a, b]);
    for (const [a, b] of rng.shuffle(pairs).slice(0, 12)) {
      const board = { cells, A: lay.ends[a].slice(), B: lay.ends[b].slice(), caps: lay.ends.filter((_, e) => e !== a && e !== b).map((e) => e.slice()) };
      if (!roundProblemsMulti(m, board, H).length) return board;
    }
  }
  if (FALLBACK) return JSON.parse(JSON.stringify(FALLBACK));
  throw new Error('pipes_connect_3d: generator exhausted');
}
const FALLBACK = null;
const genRound = (rng) => genBoard(rng);

const EXT_SIZES = Object.freeze([
  { cols: 4, rows: 3, strands: 4, maxSteps: 8, maxLoad: 10 },
]);
function extHard(cols, rows) {
  const e = EXT_SIZES.find((z) => z.cols === cols && z.rows === rows);
  if (!e) return null;
  const posKeep = EXT_POS_KEEP;
  return Object.freeze({ ...EXT_HARD, ...e, posKeep });
}
const r1 = (v) => Math.round(v * 10) / 10;

function boardKey(m, b, rot) {
  const n = m.cols * m.rows, I = (i) => (rot ? n - 1 - i : i), S = (s) => (rot ? (s + 2) & 3 : s);
  const cells = new Array(n);
  b.cells.forEach((c, i) => { cells[I(i)] = c ? c.t + c.ch.map((ch) => ch.map(S).sort().join('')).sort().join('.') : '-'; });
  const he = ([i, s]) => `${I(i)}:${S(s)}`;
  return `${m.cols}x${m.rows}|${cells.join(',')}|A${he(b.A)}|B${he(b.B)}|C${b.caps.map(he).sort().join(';')}|F${b.fault >= 0 ? I(b.fault) : '-'}`;
}
export function semanticKey(m) {
  const b = m.rounds[0], k0 = boardKey(m, b, false), k1 = boardKey(m, b, true);
  return 'pipes_connect_3d|' + (k0 < k1 ? k0 : k1);
}
export const _evalKeys = new Set();
const EVAL_KEYS = new Set([
  "pipes_connect_3d|4x3|I02,I02,-,-,D03.12,X02.13,L23,-,D03.12,D03.12,D03.12,L23|A1:0|B8:3|C0:0;10:2;11:2;4:3;8:2;9:2|F9",
  "pipes_connect_3d|4x3|L01,D03.12,D03.12,D03.12,I13,D01.23,X02.13,D03.12,-,L01,X02.13,L03|A3:1|B10:2|C0:0;1:0;2:0;3:0;4:3;7:1|F2",
  "pipes_connect_3d|4x3|I13,D03.12,D03.12,D03.12,-,L01,X02.13,D03.12,-,-,I02,L01|A10:2|B3:1|C0:3;11:1;1:0;2:0;3:0;7:1|F2",
  "pipes_connect_3d|4x3|D01.23,D01.23,L23,I02,D01.23,X02.13,D03.12,D01.23,L01,X02.13,D03.12,L03|A9:2|B0:3|C0:0;10:2;1:0;3:0;4:3;7:1|F1",
  "pipes_connect_3d|4x3|D01.23,X02.13,L23,I02,D01.23,D03.12,D03.12,L03,L01,X02.13,D01.23,L23|A9:2|B0:3|C0:0;10:2;11:2;1:0;3:0;4:3|F5",
  "pipes_connect_3d|4x3|L12,D03.12,X02.13,D03.12,X02.13,D01.23,D01.23,D03.12,L01,D01.23,X02.13,L03|A10:2|B2:0|C1:0;3:0;3:1;4:3;7:1;9:2|F3",
  "pipes_connect_3d|4x3|I13,D03.12,D03.12,D03.12,-,L01,X02.13,D03.12,-,L12,X02.13,L03|A10:2|B2:0|C0:3;1:0;3:0;3:1;7:1;9:2|F3",
  "pipes_connect_3d|4x3|D01.23,X02.13,D01.23,L23,L01,D03.12,D03.12,D01.23,L12,X02.13,X02.13,L03|A9:2|B0:3|C0:0;10:2;1:0;2:0;7:1;8:2|F5",
  "pipes_connect_3d|4x3|L12,D03.12,D03.12,D03.12,D01.23,D01.23,X02.13,D03.12,L01,D03.12,X02.13,L03|A10:2|B3:1|C1:0;2:0;3:0;4:3;7:1;9:2|F2",
  "pipes_connect_3d|4x3|D01.23,D01.23,D01.23,D01.23,L01,X02.13,L03,I02,-,I02,-,L01|A1:0|B9:2|C0:0;0:3;11:1;2:0;3:0;3:1|F0",
  "pipes_connect_3d|4x3|D01.23,D01.23,L23,I02,L01,X02.13,D03.12,D01.23,L12,X02.13,D03.12,L03|A1:0|B9:2|C0:0;0:3;10:2;3:0;7:1;8:2|F0",
  "pipes_connect_3d|4x3|I13,X02.13,X02.13,L23,L12,D01.23,D01.23,D03.12,D03.12,X02.13,D03.12,L03|A1:0|B8:3|C0:3;10:2;2:0;7:1;8:2;9:2|F5",
]);
for (const k of EVAL_KEYS) _evalKeys.add(k);
function decodeBoard(e) {
  const [cells, A, B, caps, fault] = e.split('|');
  const cell = (tok) => { const d = tok.slice(1), ch = []; for (let i = 0; i < d.length; i += 2) ch.push([Number(d[i]), Number(d[i + 1])]); return { t: tok[0], ch }; };
  const he = (x) => x.split('.').map(Number);
  return { cells: cells.split(',').map((x) => (x === '-' ? null : cell(x))), A: he(A), B: he(B), caps: caps ? caps.split(';').map(he) : [], fault: Number(fault) };
}
const boardSplit = (key) => (hash32(`g09_pc3_board|${key}`) % 10 === 0 ? 'test' : 'train');
function generateExt(rng, knobs) {
  for (let att = 0; att < 40; att++) {
    const H = extHard(HARD.cols, HARD.rows), bank = PC3_BANK[knobs.ext];
    const n = knobs.n, e = Number.isInteger(n) && n > 0 && att === 0 ? bank[nthOf(`pipes_connect_3d|${knobs.ext}|bank`, n, bank.length)] : bank[Math.floor(rng.raw() * bank.length)];
    const b = decodeBoard(e);
    if (roundProblems({ cols: H.cols, rows: H.rows }, b, H).length) continue;
    const view = { yaw: r1(45 + 90 * rng.int(0, 3) + rng.uniform(-6, 6)), pitch: r1(rng.uniform(43, 49)) };
    return { task: 'pipes_connect_3d', board: { ...BOARD }, cols: H.cols, rows: H.rows, rounds: [b], view, ext: knobs.ext };
  }
  throw new Error('pipes_connect_3d: ext generator exhausted');
}
const viewOk = (v) => !!v && Number.isFinite(v.yaw) && Number.isFinite(v.pitch) && v.pitch >= 42.9 && v.pitch <= 49.1
  && Math.abs(((v.yaw - 45) % 90 + 135) % 90 - 45) <= 6.05;

export function gate(m) {
  if (!m) return false;
  const H = m.ext ? extHard(m.cols, m.rows) : HARD;
  if (!H || (m.ext && (!viewOk(m.view) || EVAL_KEYS.has(semanticKey(m)) || boardSplit(semanticKey(m)) !== m.ext))) return false;
  if (m.task !== 'pipes_connect_3d' || m.cols !== H.cols || m.rows !== H.rows
    || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  const n = m.cols * m.rows;
  const half = (e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < n
    && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < 4 && nbr(m, e[0], e[1]) < 0;
  for (const b of m.rounds) {
    if (!Array.isArray(b.cells) || b.cells.length !== n || !half(b.A) || !half(b.B) || !Array.isArray(b.caps) || !b.caps.every(half)) return false;
    if (m.ext ? !(Number.isInteger(b.fault) && b.fault >= 0 && b.fault < n) : 'fault' in b) return false;
    const keys = [b.A, b.B, ...b.caps].map(([i, s]) => i * 4 + s);
    if (new Set(keys).size !== keys.length) return false;
    for (const c of b.cells) {
      if (c === null) continue;
      if (!c || !TYPES.includes(c.t) || !Array.isArray(c.ch)) return false;
      const sides = c.ch.flat();
      if (!sides.every((s) => Number.isInteger(s) && s >= 0 && s < 4) || new Set(sides).size !== sides.length) return false;
      const shape = c.ch.map((ch) => ch.length).join(',');
      const turn = (ch) => ch.length === 2 && ch[1] !== opp(ch[0]);
      if (c.t === 'I' && !(shape === '2' && !turn(c.ch[0]))) return false;
      if (c.t === 'L' && !(shape === '2' && turn(c.ch[0]))) return false;
      if (c.t === 'D' && !(shape === '2,2' && c.ch.every(turn))) return false;
      if (c.t === 'X' && !(shape === '2,2' && c.ch.every((ch) => !turn(ch)))) return false;
      if (c.t === 'H' && shape !== '4') return false;
    }
    if ((m.ext ? roundProblems(m, b, H) : roundProblemsMulti(m, b, H)).length) return false;
  }
  return true;
}

const RP = 0.085, YS = 0.06, YP = YS + RP, ARCH = 0.48;
const SIDE = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function sceneFor(m, board, rot, debug = false, look = null) {
  const prims = [];
  const n = m.cols * m.rows;
  const P = (c, r, lx, lz, y = YP) => [c + lx, y, r + lz];
  const has = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) for (const ch of channels(board.cells[i], rot[i], 'true')) for (const s of ch) has[i * 4 + s] = 1;
  let g = 1;
  const straight = (c, r, a, b, grp) => tube([P(c, r, ...SIDE[a]), P(c, r, ...SIDE[b])], RP, 'pipe', grp, prims, true);
  const bend = (c, r, a, b, grp) => {
    const A = SIDE[a], B = SIDE[b];
    const cx = A[0] === 0.5 ? B[0] : A[0], cz = A[1] === 0.5 ? B[1] : A[1];
    const a0 = Math.atan2(A[1] - cz, A[0] - cx);
    let d = Math.atan2(B[1] - cz, B[0] - cx) - a0;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = a0 + d * k / 8; pts.push(P(c, r, cx + 0.5 * Math.cos(t), cz + 0.5 * Math.sin(t))); }
    tube(pts, RP, 'pipe', grp, prims, true);
  };
  const arch = (c, r, a, b, grp) => {
    const A = SIDE[a], B = SIDE[b], pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, h = sm(0.04, 0.3, t) * (1 - sm(0.7, 0.96, t));
      pts.push(P(c, r, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, YP + ARCH * h));
    }
    tube(pts, RP, 'pipe', grp, prims, true);
  };
  prims.push(prim.box([-0.05, 0, -0.05], [m.cols + 0.05, 0.025, m.rows + 0.05], 'base', 9999));
  for (let i = 0; i < n; i++) {
    const c = i % m.cols, r = Math.floor(i / m.cols), cell = board.cells[i];
    prims.push(prim.box([c + 0.035, 0, r + 0.035], [c + 0.965, YS, r + 0.965], debug && i === board.fault ? 'red' : 'slab', 10000 + i));
    if (!cell) continue;
    const k = rot[i] & 3;
    const sides = [];
    if (cell.t === 'H') {
      const grp = g++;
      for (let s = 0; s < 4; s++) { tube([P(c, r, ...SIDE[s]), P(c, r, 0.5, 0.5)], RP, 'pipe', grp, prims, true); sides.push(s); }
      prims.push(prim.sphere(P(c, r, 0.5, 0.5), RP * 1.62, 'brass', grp));
      for (let s = 0; s < 4; s++) prims.push(prim.cyl(P(c, r, 0.5 + DX[s] * 0.08, 0.5 + DZ[s] * 0.08), P(c, r, 0.5 + DX[s] * 0.25, 0.5 + DZ[s] * 0.25), RP * 1.32, 'brass', grp));
    } else {
      const chs = cell.ch.map((ch) => ch.map((s) => (s + k) & 3));
      chs.forEach((ch, ci) => {
        const [a, b] = ch; sides.push(a, b);
        const grp = g++;
        if (cell.t === 'X' && ci === 1) arch(c, r, a, b, grp);
        else if (b === opp(a)) straight(c, r, a, b, grp);
        else bend(c, r, a, b, grp);
      });
    }
    for (const s of sides) {
      const [mx, mz] = SIDE[s];
      const j = nbr(m, i, s);
      const open = j >= 0 ? !has[j * 4 + opp(s)] : ![board.A, board.B, ...board.caps].some(([ti, ts]) => ti === i && ts === s);
      const grp = g++;
      prims.push(prim.cyl(P(c, r, mx - DX[s] * 0.085, mz - DZ[s] * 0.085), P(c, r, mx - DX[s] * 0.018, mz - DZ[s] * 0.018), RP * 1.3, 'pipeDark', grp));
      if (open) prims.push(prim.cyl(P(c, r, mx - DX[s] * 0.02, mz - DZ[s] * 0.02), P(c, r, mx - DX[s] * 0.014, mz - DZ[s] * 0.014), RP * 0.78, 'drain', grp));
    }
  }
  const terms = [];
  const edge = ([i, s]) => { const c = i % m.cols, r = Math.floor(i / m.cols); return [c + SIDE[s][0], YP, r + SIDE[s][1]]; };
  for (const [key, mat] of [['A', 'tankBlue'], ['B', 'tankWhite']]) {
    const [i, s] = board[key];
    const e = edge([i, s]);
    const out = (d, y = YP) => [e[0] + DX[s] * d, y, e[2] + DZ[s] * d];
    const grp = g++;
    prims.push(prim.cyl(e, out(TANK_OUT - 0.2), RP, 'pipe', grp));
    const tc = out(TANK_OUT, 0);
    if (look) g = look.vessel(prims, key, tc, g);
    else {
      prims.push(prim.cyl(tc, [tc[0], TANK_H, tc[2]], TANK_R, mat === 'tankWhite' ? 'tankPaint' : mat, g++));
      prims.push(prim.cyl([tc[0], TANK_H - 0.09, tc[2]], [tc[0], TANK_H - 0.05, tc[2]], TANK_R + 0.012, 'pipeDark', g++));
      if (key === 'A') prims.push(prim.cyl([tc[0], TANK_H, tc[2]], [tc[0], TANK_H + 0.012, tc[2]], TANK_R - 0.045, 'water', g++));
    }
    terms.push({ key, top: [tc[0], TANK_H + 0.3, tc[2]] });
  }
  for (const cp of board.caps) {
    const [i, s] = cp, e = edge(cp);
    const out = (d) => [e[0] + DX[s] * d, YP, e[2] + DZ[s] * d];
    prims.push(prim.cyl(e, out(0.15), RP, 'pipe', g++));
    prims.push(prim.cyl(out(0.13), out(0.22), RP * 1.38, 'cap', g++));
  }
  return { prims, terms };
}

const CAM = { yaw: 45, pitch: 46 };
const TANK_OUT = 0.74, TANK_R = 0.25, TANK_H = 0.5;
function contentPoints(m, board) {
  const pts = [];
  for (const [x, z] of [[0, 0], [m.cols, 0], [0, m.rows], [m.cols, m.rows]]) pts.push([x, 0, z], [x, 0.62, z]);
  const edge = ([i, s]) => [i % m.cols + SIDE[s][0], Math.floor(i / m.cols) + SIDE[s][1]];
  for (const key of ['A', 'B']) {
    const [ex, ez] = edge(board[key]), s = board[key][1];
    const cx = ex + DX[s] * TANK_OUT, cz = ez + DZ[s] * TANK_OUT;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pts.push([cx + dx * TANK_R, 0, cz + dz * TANK_R], [cx + dx * TANK_R, TANK_H + 0.45, cz + dz * TANK_R]);
  }
  for (const cp of board.caps) { const [ex, ez] = edge(cp), s = cp[1]; pts.push([ex + DX[s] * 0.3, 0.3, ez + DZ[s] * 0.3], [ex + DX[s] * 0.3, 0, ez + DZ[s] * 0.3]); }
  return pts;
}
const camCache = new WeakMap();
function camFor(m, board) {
  if (camCache.has(board)) return camCache.get(board);
  const pts = contentPoints(m, board);
  const V = m.view ? { yaw: m.view.yaw, pitch: m.view.pitch } : CAM;
  const c0 = makeIsoCam({ ...V, scale: 1, ox: 0, oy: 0 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = c0.project(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const s = Math.min((BOARD.w - 60) / (x1 - x0), (BOARD.h - 56) / (y1 - y0));
  const cam = makeIsoCam({ ...V, scale: s, ox: BOARD.w / 2 - s * (x0 + x1) / 2, oy: BOARD.h / 2 - s * (y0 + y1) / 2 });
  camCache.set(board, cam);
  return cam;
}

function renderRound(m, board, rot, q, debug, look = null) {
  const cam = camFor(m, board);
  const { prims, terms } = sceneFor(m, board, rot, debug, look);
  const img = look ? renderScene(look.scene(m, board, prims), cam, BOARD.w, BOARD.h, q) : renderScene({
    prims,
    floor: { y: 0, lo: [-8, -8], hi: [m.cols + 8, m.rows + 8], m: 'floorLight' },
    light: [-0.55, 1, 0.3],
    extent: { lo: [-1.8, 0, -1.8], hi: [m.cols + 1.8, 0.9, m.rows + 1.8] },
    bg: [238, 241, 245],
  }, cam, BOARD.w, BOARD.h, q);
  return { img, terms: terms.map((t) => ({ key: t.key, ...cam.project(t.top) })), cam };
}

export function previewCam(m) { return camFor(m, m.rounds[0]); }
export function renderPreview(m, rot, q = 2, debug = false) { return renderRound(m, m.rounds[0], rot ?? new Array(m.cols * m.rows).fill(0), q, debug); }

function turnIcon(g, x, y, turned) {
  const R0 = 7.5;
  g.save();
  g.beginPath(); g.arc(x, y, R0, 0, Math.PI * 2);
  g.fillStyle = turned ? '#2f7fd0' : 'rgba(255,255,255,0.92)'; g.fill();
  g.lineWidth = 1; g.strokeStyle = turned ? '#1d5f9f' : 'rgba(31,45,56,0.55)'; g.stroke();
  const col = turned ? '#ffffff' : '#2b3a46', a0 = -Math.PI * 0.35, a1 = Math.PI * 1.25, rr = 4;
  g.beginPath(); g.arc(x, y, rr, a0, a1); g.lineWidth = 1.6; g.strokeStyle = col; g.lineCap = 'round'; g.stroke();
  const hx = x + rr * Math.cos(a0), hy = y + rr * Math.sin(a0);
  g.beginPath(); g.moveTo(hx + 2.6, hy - 0.4); g.lineTo(hx - 0.6, hy - 2.2); g.lineTo(hx - 0.2, hy + 1.8); g.closePath();
  g.fillStyle = col; g.fill();
  g.restore();
}

async function connectLook(style) {
  const X = await import('../common/_pipes_look.js');
  const L = await X.buildPipeLook(style, 'connect');
  const r = L.rnd;
  const kinds = { A: X.pickSplit(style, r, 'g09_source_kind', X.SOURCE_KINDS), B: X.pickSplit(style, r, 'g09_target_kind_v2', X.TARGET_KINDS) };
  const salt = 1 + Math.floor(r() * 997), dAz = (r() * 2 - 1) * 20, dEl = r(), vseed = Math.floor(r() * 1e9);
  const tray = { c: [200, 200, 200], kd: 0.62, ks: 0.05, sh: 10, kind: 0, tex: X.texAlbedo(L.TT, { size: 1, L: L.Lt, contrast: 0.55, sat: 0.28, tile: 1, salt, safe: true }) };
  const base = { c: [120, 120, 120], kd: 0.6, ks: 0.04, sh: 6, kind: 0, tex: X.texAlbedo(L.TT, { size: 1.3, L: Math.max(0.025, L.Lt * 0.32), contrast: 0.4, sat: 0.25, safe: true }) };
  const prng = (k) => { let a = (vseed + k * 7919) >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const L0 = [-0.55, 1, 0.3], el = (50 + 16 * dEl) * Math.PI / 180, hz = Math.hypot(L0[0], L0[2]);
  const Lel = [L0[0] / hz * Math.cos(el), Math.sin(el), L0[2] / hz * Math.cos(el)];
  return {
    ids: { theme: L.theme.id, tray: L.tray.id, ground: L.ground.id, hdri: L.hd && L.hd.id, kinds },
    vessel: (prims, key, tc, g) => X.vessel(prim, tube, prims, kinds[key], tc, g, key, key === 'A', prng(key === 'A' ? 1 : 2)),
    scene(m, board, prims) {
      const yaw = m.view ? m.view.yaw : CAM.yaw;
      const c = (key) => { const [i, sd] = board[key]; return [i % m.cols + SIDE[sd][0] + DX[sd] * TANK_OUT, Math.floor(i / m.cols) + SIDE[sd][1] + DZ[sd] * TANK_OUT]; };
      const mats = { ...MATERIALS, ...L.mats, slab: tray, base, ...X.vesselMats(kinds.A, 'A', L, c('A'), prng(3)), ...X.vesselMats(kinds.B, 'B', L, c('B'), prng(4)) };
      return {
        prims, mats, tint: L.tint, ink: L.ink, bg: [150, 150, 150],
        floor: { y: 0, lo: [-8, -8], hi: [m.cols + 8, m.rows + 8], m: 'floorG' },
        light: X.rotateLight(Lel, CAM.yaw, yaw, dAz),
        extent: { lo: [-1.8, 0, -1.8], hi: [m.cols + 1.8, 0.9, m.rows + 1.8] },
      };
    },
  };
}

export default {
  meta: {
    name: 'pipes_connect_3d', family: 'B', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'rotate', cell: '0..11 (tap = turn that piece 90 degrees clockwise; revisable until Verify; at least 3 taps are needed)' }],
    promptHuman: 'Turn pipe pieces until water from A reaches B (it takes at least 3 taps)',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs);
    const rounds = [];
    for (let r = 0; r < HARD.rounds; r++) rounds.push(genRound(rng));
    return { task: 'pipes_connect_3d', board: { ...BOARD }, cols: HARD.cols, rows: HARD.rows, rounds };
  },

  init(m) { return { rot: new Array(m.cols * m.rows).fill(0) }; },

  applyAction(state, a, m) {
    if (a?.op !== 'rotate' || !Number.isInteger(a.cell) || a.cell < 0 || a.cell >= m.cols * m.rows) return { ok: false, reason: 'bad-action' };
    if (!m.rounds[0].cells[a.cell]) return { ok: false, reason: 'empty-tile' };
    state.rot[a.cell] = (state.rot[a.cell] + 1) & 3;
    return { ok: true };
  },

  verify(state, m) {
    const success = joined(m, m.rounds[0], state.rot, 'true');
    const turned = state.rot.filter((k) => k).length;
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { turned } };
  },

  oracle(m) {
    const b = m.rounds[0];
    if (m.ext) return [{ op: 'rotate', cell: b.fault }];
    const fix = cheapestFix(m, b);
    const acts = [];
    fix.rot.forEach((k, cell) => { for (let q = 0; q < k; q++) acts.push({ op: 'rotate', cell }); });
    return acts;
  },

  randomPolicy(m, rnd) {
    const b = m.rounds[0];
    const pieces = b.cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const taps = m.ext ? 1 + Math.floor(rnd() * 3) : cheapestFix(m, b).cost;
    const acts = [];
    for (let k = 0; k < taps; k++) acts.push({ op: 'rotate', cell: pieces[Math.floor(rnd() * pieces.length)] });
    return acts;
  },

  async mount(env) {
    env.assets.pc = null;
    if (env.style) env.assets.look = await connectLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Turn pipes until A connects to B', 'Tap a piece to turn it; it takes at least 3 taps');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const q = contextScale(g);
    const board = m.rounds[0];
    const rot = state.rot;
    const look = env.style ? env.assets.look : null;
    const key = `${rot.join('')}|${q}${look ? '|' + env.style.key : ''}`;
    let cache = env.assets.pc;
    if (!cache || cache.key !== key) {
      const { img, terms } = renderRound(m, board, rot, q, false, look);
      cache = env.assets.pc = { key, canvas: toCanvas(img), terms };
    }
    g.save();
    g.translate(br.x, br.y);
    g.drawImage(cache.canvas, 0, 0, BOARD.w, BOARD.h);
    const cam = camFor(m, board);
    const icons = [];
    board.cells.forEach((cell, i) => {
      if (!cell) return;
      const c = i % m.cols, r = Math.floor(i / m.cols);
      const p = [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]]
        .map(([lx, lz]) => cam.project([c + lx, YS, r + lz])).sort((u, v) => v.y - u.y)[0];
      icons.push(p);
      turnIcon(g, p.x, p.y - 1, rot[i] & 3);
    });
    for (const t of cache.terms) {
      const spots = [[0, -12], [-34, 12], [34, 12], [0, -20]].map(([dx, dy]) => [t.x + dx, t.y + dy])
        .filter(([x, y]) => x > 12 && x < BOARD.w - 12 && y > 12);
      const [x, y] = spots.find(([x, y]) => icons.every((p) => Math.hypot(p.x - x, p.y - y) > 21)) || [t.x, t.y - 12];
      badge(g, x, y, t.key, { r: 11, fill: t.key === 'A' ? '#2f7fd0' : '#ffffff', color: t.key === 'A' ? '#ffffff' : '#1f2d38', stroke: '#1f2d38' });
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const m = env.manifest;
    const cam = camFor(m, m.rounds[0]);
    const [x, , z] = cam.unproject(e.x, e.y, YP);
    const c = Math.floor(x), r = Math.floor(z);
    if (c < 0 || c >= m.cols || r < 0 || r >= m.rows) return [];
    const cell = r * m.cols + c;
    return m.rounds[0].cells[cell] ? [{ op: 'rotate', cell }] : [];
  },

  footerStatus(env) {
    const n = env.state.rot.filter(Boolean).length;
    return n ? `${n} piece${n === 1 ? '' : 's'} turned` : 'Tap a piece to turn it';
  },
};
