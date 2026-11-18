import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { mountBoardTheme, paintThemeBoard, paintThemeTex, roundRectPath } from '../core/board-theme.js';
import { splitIds } from '../core/style.js';

const BOARD = { w: 340, h: 300 };
const N = 1, E = 2, S = 4, W = 8;
const DIRS = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;

const HARD = { n: 7, m: 6, decoys: 8, minTurns: 8, maxTurns: 16, minLen: 11, maxLen: 16, minBranches: 2, branchMin: 3 };
const DV = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
const isStraight = (mk) => mk === (N | S) || mk === (E | W);
function exitsFor(mk, enter) {
  if (!mk || [N, E, S, W].filter((d) => mk & d).length !== 2) return [];
  if (isStraight(mk)) return [OPP[enter]];
  return enter === N || enter === S ? [E, W] : [N, S];
}
function stepIdx(n, m, i, d) {
  const c = (i % n) + DV[d][0], r = Math.floor(i / n) + DV[d][1];
  return c >= 0 && c < n && r >= 0 && r < m ? r * n + c : -1;
}
function countRoutes(sol, n, m, src, sink, cap = 2) {
  const used = new Set([src]);
  let count = 0;
  const walk = (i, enter) => {
    if (count >= cap || i < 0 || used.has(i)) return;
    if (i === sink) { if (sol[sink] & enter) count++; return; }
    used.add(i);
    for (const d of exitsFor(sol[i], enter)) walk(stepIdx(n, m, i, d), OPP[d]);
    used.delete(i);
  };
  for (const d of [N, E, S, W]) if (sol[src] & d) walk(stepIdx(n, m, src, d), OPP[d]);
  return count;
}
function routeOrder(sol, n, m, src, sink, pathSet) {
  const out = [src];
  let prev = -1, cur = src;
  while (cur !== sink && out.length <= pathSet.size) {
    const nx = [N, E, S, W].filter((d) => sol[cur] & d).map((d) => stepIdx(n, m, cur, d)).filter((j) => j >= 0 && j !== prev && pathSet.has(j));
    if (nx.length !== 1) return null;
    prev = cur; cur = nx[0]; out.push(cur);
  }
  return cur === sink ? out : null;
}
function branchDepths(sol, n, m, order) {
  const route = new Set(order);
  const longest = (i, enter, seen) => {
    if (i < 0 || route.has(i) || seen.has(i) || !sol[i]) return 0;
    seen.add(i);
    let best = 0;
    for (const d of exitsFor(sol[i], enter)) best = Math.max(best, longest(stepIdx(n, m, i, d), OPP[d], seen));
    seen.delete(i);
    return 1 + best;
  };
  const a = [], b = [];
  for (let t = 1; t < order.length - 1; t++) {
    if (isStraight(sol[order[t]])) continue;
    const dir = (j) => [N, E, S, W].find((d) => stepIdx(n, m, order[t], d) === j);
    const altA = OPP[dir(order[t + 1])], altB = OPP[dir(order[t - 1])];
    a.push(longest(stepIdx(n, m, order[t], altA), OPP[altA], new Set()));
    b.push(longest(stepIdx(n, m, order[t], altB), OPP[altB], new Set()));
  }
  return { a, b };
}
const branchOk = (bd) => {
  const ka = bd.a.filter((x) => x >= HARD.branchMin).length, kb = bd.b.filter((x) => x >= HARD.branchMin).length;
  return ka >= 1 && kb >= 1 && ka + kb >= HARD.minBranches;
};

function turnsNeeded(sol, scr) {
  let cur = sol;
  for (let k = 0; k < scr; k++) cur = rotCW(cur);
  let k = 0;
  while (cur !== sol && k < 4) { cur = rotCW(cur); k++; }
  return k;
}

function carvePath(rng, n, m, a, b) {
  const key = (c, r) => r * n + c;
  const seen = new Set([key(a.c, a.r)]);
  const parent = new Map();
  const stack = [a];
  while (stack.length) {
    const cur = stack.pop();
    if (cur.c === b.c && cur.r === b.r) {
      const path = [];
      let k = key(cur.c, cur.r), p = cur;
      while (p) { path.push(p); const pk = parent.get(key(p.c, p.r)); p = pk; }
      return path.reverse();
    }
    const nbrs = rng.shuffle(DIRS).map(([, dx, dy]) => ({ c: cur.c + dx, r: cur.r + dy }))
      .filter((q) => q.c >= 0 && q.c < n && q.r >= 0 && q.r < m && !seen.has(key(q.c, q.r)));
    for (const q of nbrs) { seen.add(key(q.c, q.r)); parent.set(key(q.c, q.r), cur); stack.push(q); }
  }
  return null;
}

function connectorsForPath(path, n) {
  const idx = (c, r) => r * n + c;
  const mask = {};
  for (let i = 0; i < path.length; i++) {
    let mk = 0;
    for (const nb of [path[i - 1], path[i + 1]]) {
      if (!nb) continue;
      const dc = nb.c - path[i].c, dr = nb.r - path[i].r;
      if (dc === 1) mk |= E; else if (dc === -1) mk |= W;
      else if (dr === 1) mk |= S; else if (dr === -1) mk |= N;
    }
    mask[idx(path[i].c, path[i].r)] = mk;
  }
  return mask;
}

const EXT_SHAPES = ['3x4', '4x3', '5x3', '4x4', '5x4'];
const EXT_HOLES = ['none', 'scatter', 'notch', 'two_notch', 'centre', 'bite'];
const EXT_BOARDS = EXT_SHAPES.flatMap((s) => EXT_HOLES.map((h) => `${s}/${h}`));
const EXT_BOARD_SPLIT = splitIds('pipes_connect|board', EXT_BOARDS, 4);
const EXT_ENDS = ['lr', 'rl', 'tb', 'bt', 'adj', 'free'];
const EXT = { minTurns: 4, maxTurns: 10, decoys: 4, minCells: 0.66, detour: 2 };
const TEE = [N | E | S, E | S | W, S | W | N, W | N | E];
const degreeOf = (mk) => DIRS.filter(([d]) => mk & d).length;
const periodOf = (mk) => (mk === (N | S) || mk === (E | W) ? 2 : 4);

function extHoles(rng, n, m, kind) {
  const holes = new Set();
  const cut = (c, r) => holes.add(r * n + c);
  if (kind === 'scatter') {
    const k = rng.int(1, Math.max(1, Math.floor(n * m * 0.13)));
    for (let t = 0; t < k; t++) cut(rng.int(0, n - 1), rng.int(0, m - 1));
  } else if (kind === 'notch' || kind === 'two_notch') {
    const corners = rng.shuffle([[0, 0], [1, 0], [0, 1], [1, 1]]);
    const first = corners[0], opp = [1 - first[0], 1 - first[1]];
    for (const [fx, fy] of kind === 'notch' ? [first] : [first, opp]) {
      const w = rng.int(1, Math.min(2, n - 3)), h = rng.int(1, Math.min(2, m - 2));
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) cut(fx ? n - 1 - a : a, fy ? m - 1 - b : b);
    }
  } else if (kind === 'centre') {
    if (n < 5 || m < 4) return null;
    const w = rng.int(1, Math.min(2, n - 4)), h = rng.int(1, Math.min(2, m - 3));
    const c0 = rng.int(1, n - 1 - w), r0 = rng.int(1, m - 1 - h);
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) cut(c0 + a, r0 + b);
  } else if (kind === 'bite') {
    const side = rng.int(0, 3), along = side % 2 === 0 ? n : m;
    if (along < 4) return null;
    const w = rng.int(1, Math.min(2, along - 3)), p0 = rng.int(1, along - 1 - w);
    for (let a = 0; a < w; a++) {
      const p = p0 + a;
      if (side === 0) cut(p, 0); else if (side === 2) cut(p, m - 1); else if (side === 1) cut(n - 1, p); else cut(0, p);
    }
  }
  const live = [];
  for (let i = 0; i < n * m; i++) if (!holes.has(i)) live.push(i);
  if (live.length < Math.ceil(n * m * EXT.minCells)) return null;
  const seen = new Set([live[0]]), st = [live[0]];
  while (st.length) {
    const p = st.pop(), c = p % n, r = Math.floor(p / n);
    for (const [, dx, dy] of DIRS) {
      const x = c + dx, y = r + dy, q = y * n + x;
      if (x >= 0 && x < n && y >= 0 && y < m && !holes.has(q) && !seen.has(q)) { seen.add(q); st.push(q); }
    }
  }
  return seen.size === live.length ? holes : null;
}

function extEnds(rng, n, m, holes, mode) {
  const ok = (c, r) => c >= 0 && c < n && r >= 0 && r < m && !holes.has(r * n + c);
  const side = (s) => {
    const out = [];
    if (s === 0 || s === 2) for (let c = 0; c < n; c++) { const r = s === 0 ? 0 : m - 1; if (ok(c, r)) out.push({ c, r }); }
    else for (let r = 0; r < m; r++) { const c = s === 3 ? 0 : n - 1; if (ok(c, r)) out.push({ c, r }); }
    return out;
  };
  let A = [], B = [];
  if (mode === 'lr') { A = side(3); B = side(1); }
  else if (mode === 'rl') { A = side(1); B = side(3); }
  else if (mode === 'tb') { A = side(0); B = side(2); }
  else if (mode === 'bt') { A = side(2); B = side(0); }
  else if (mode === 'adj') { const s = rng.int(0, 3); A = side(s); B = side((s + (rng.raw() < 0.5 ? 1 : 3)) % 4); }
  else {
    for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if (ok(c, r)) A.push({ c, r });
    B = A;
  }
  const minD = mode === 'free' ? Math.max(3, Math.floor((n + m) / 2)) : 3;
  for (let t = 0; t < 30 && A.length && B.length; t++) {
    const a = rng.pick(A), b = rng.pick(B);
    if (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) >= minD) return [a, b];
  }
  return null;
}

function extCarve(rng, n, m, holes, a, b, how) {
  const key = (c, r) => r * n + c;
  const live = (c, r) => c >= 0 && c < n && r >= 0 && r < m && !holes.has(key(c, r));
  const nbrs = (p) => rng.shuffle(DIRS).map(([, dx, dy]) => ({ c: p.c + dx, r: p.r + dy })).filter((q) => live(q.c, q.r));
  const unwind = (parent, end) => { const out = []; for (let p = end; p; p = parent.get(key(p.c, p.r))) out.push(p); return out.reverse(); };
  if (how === 'dfs') {
    const seen = new Set([key(a.c, a.r)]), parent = new Map(), stack = [a];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.c === b.c && cur.r === b.r) return unwind(parent, cur);
      for (const q of nbrs(cur)) if (!seen.has(key(q.c, q.r))) { seen.add(key(q.c, q.r)); parent.set(key(q.c, q.r), cur); stack.push(q); }
    }
    return null;
  }
  const bfs = (s, t, banned) => {
    const seen = new Set([key(s.c, s.r), ...banned]), parent = new Map(), q = [s];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      if (cur.c === t.c && cur.r === t.r) return unwind(parent, cur);
      for (const x of nbrs(cur)) if (!seen.has(key(x.c, x.r))) { seen.add(key(x.c, x.r)); parent.set(key(x.c, x.r), cur); q.push(x); }
    }
    return null;
  };
  const cells = [];
  for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if (live(c, r) && !(c === a.c && r === a.r) && !(c === b.c && r === b.r)) cells.push({ c, r });
  const w = rng.pick(cells);
  const leg1 = bfs(a, w, [key(b.c, b.r)]);
  if (!leg1) return null;
  const leg2 = bfs(w, b, leg1.slice(0, -1).map((p) => key(p.c, p.r)));
  return leg2 ? leg1.concat(leg2.slice(1)) : null;
}

function extConnected(tiles, rots, n, m, src) {
  const cur = tiles.map((t, i) => { let mk = t.sol; for (let k = 0; k < rots[i]; k++) mk = rotCW(mk); return mk; });
  const seen = new Set([src]), st = [src];
  while (st.length) {
    const p = st.pop(), pc = p % n, pr = Math.floor(p / n);
    for (const [d, dx, dy] of DIRS) {
      if (!(cur[p] & d)) continue;
      const qc = pc + dx, qr = pr + dy;
      if (qc < 0 || qc >= n || qr < 0 || qr >= m) continue;
      const q = qr * n + qc;
      if ((cur[q] & OPP[d]) && !seen.has(q)) { seen.add(q); st.push(q); }
    }
  }
  return seen;
}

function generateExt(rng, split) {
  const boards = EXT_BOARDS.filter((x) => EXT_BOARD_SPLIT(x) === split);
  for (let attempt = 0; attempt < 600; attempt++) {
    const [shape, holeKind] = rng.pick(boards).split('/');
    const [n, m] = shape.split('x').map(Number);
    const endMode = rng.pick(EXT_ENDS), lenMode = rng.pick(['short', 'mid', 'long']);
    const holes = extHoles(rng, n, m, holeKind);
    if (!holes || (holeKind !== 'none' && !holes.size)) continue;
    const ends = extEnds(rng, n, m, holes, endMode);
    if (!ends) continue;
    const [a, b] = ends;
    const minLen = Math.abs(a.c - b.c) + Math.abs(a.r - b.r) + 1 + EXT.detour;
    const live = n * m - holes.size;
    const cands = [];
    for (let t = 0; t < 8; t++) {
      const p = extCarve(rng, n, m, holes, a, b, lenMode === 'long' ? 'dfs' : rng.raw() < 0.25 ? 'dfs' : 'via');
      if (p && p.length >= minLen && p.length <= live - 2) cands.push(p);
    }
    if (!cands.length) continue;
    cands.sort((x, y) => x.length - y.length);
    const path = lenMode === 'short' ? cands[0] : lenMode === 'long' ? cands[cands.length - 1] : cands[Math.floor(cands.length / 2)];
    const sol = connectorsForPath(path, n);
    const pathSet = new Set(Object.keys(sol).map(Number));
    const srcIdx = a.r * n + a.c, sinkIdx = b.r * n + b.c;
    const tiles = Array.from({ length: n * m }, (_, i) => (holes.has(i)
      ? { sol: 0, fixed: false, src: false, sink: false, empty: true, hole: true }
      : { sol: pathSet.has(i) ? sol[i] : 0, fixed: i === srcIdx || i === sinkIdx, src: i === srcIdx, sink: i === sinkIdx, empty: !pathSet.has(i), hole: false }));
    const shapesD = [N | S, E | W, N | E, E | S, S | W, W | N, ...TEE, N, E, S, W];
    let decoysLeft = EXT.decoys;
    for (let i = 0; i < n * m; i++) {
      const t = tiles[i];
      if (t.hole || pathSet.has(i) || decoysLeft <= 0 || rng.raw() >= 0.5) continue;
      t.sol = rng.pick(shapesD); t.empty = false; decoysLeft--;
    }
    const rotPath = [...pathSet].filter((i) => !tiles[i].fixed);
    let scr = null;
    for (let t = 0; t < 200 && !scr; t++) {
      const rots = tiles.map((tt) => (tt.fixed || tt.empty ? 0 : rng.int(0, 3)));
      let cost = 0;
      for (const i of rotPath) {
        const period = periodOf(tiles[i].sol);
        const k = rng.int(0, period - 1);
        rots[i] = period === 2 ? (k + 2 * rng.int(0, 1)) % 4 : (4 - k) % 4;
        cost += k;
      }
      if (cost >= EXT.minTurns && cost <= EXT.maxTurns && !extConnected(tiles, rots, n, m, srcIdx).has(sinkIdx)) scr = rots;
    }
    if (!scr) continue;
    const man = {
      task: 'pipes_connect', board: BOARD, n, m, ext: 1,
      tiles: tiles.map((t) => ({ sol: t.sol, fixed: !!t.fixed, src: !!t.src, sink: !!t.sink, empty: !!t.empty, hole: !!t.hole })),
      scramble: scr, srcIdx, sinkIdx, pathIdx: [...pathSet].sort((x, y) => x - y),
    };
    if (gateExt(man)) return man;
  }
  throw new Error('pipes_connect: no extended board found');
}

function gateExt(m) {
  if (!m || m.task !== 'pipes_connect' || m.ext !== 1 || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!EXT_SHAPES.includes(`${m.n}x${m.m}`)) return false;
  const size = m.n * m.m;
  const cell = (i) => Number.isInteger(i) && i >= 0 && i < size;
  if (!Array.isArray(m.tiles) || m.tiles.length !== size || !Array.isArray(m.scramble) || m.scramble.length !== size) return false;
  if (!cell(m.srcIdx) || !cell(m.sinkIdx) || m.srcIdx === m.sinkIdx) return false;
  if (!Array.isArray(m.pathIdx) || !m.pathIdx.every(cell)) return false;
  const path = new Set(m.pathIdx);
  if (path.size !== m.pathIdx.length || !path.has(m.srcIdx) || !path.has(m.sinkIdx)) return false;
  let holes = 0, cost = 0, links = 0, decoys = 0;
  for (let i = 0; i < size; i++) {
    const t = m.tiles[i], end = i === m.srcIdx || i === m.sinkIdx;
    if (!t || !Number.isInteger(t.sol) || t.sol < 0 || t.sol > 15
      || !['fixed', 'src', 'sink', 'empty', 'hole'].every((k) => typeof t[k] === 'boolean')
      || !Number.isInteger(m.scramble[i]) || m.scramble[i] < 0 || m.scramble[i] > 3) return false;
    if (t.fixed !== end || t.src !== (i === m.srcIdx) || t.sink !== (i === m.sinkIdx)
      || t.empty !== (t.sol === 0) || ((t.fixed || t.empty) && m.scramble[i] !== 0)) return false;
    if (t.hole) { holes++; if (!t.empty || path.has(i)) return false; continue; }
    const degree = degreeOf(t.sol), c = i % m.n, r = Math.floor(i / m.n);
    if (path.has(i)) {
      let own = 0, stray = 0;
      for (const [d, dx, dy] of DIRS) {
        if (!(t.sol & d)) continue;
        const x = c + dx, y = r + dy, j = y * m.n + x;
        if (x >= 0 && x < m.n && y >= 0 && y < m.m && path.has(j) && (m.tiles[j].sol & OPP[d])) own++; else stray++;
      }
      if (own !== (end ? 1 : 2) || stray !== 0 || degree !== own) return false;
      links += own;
      if (!end) cost += turnsNeeded(t.sol, m.scramble[i]);
    } else if (!t.empty) { if (degree < 1 || degree > 3) return false; decoys++; }
  }
  if (size - holes < Math.ceil(size * EXT.minCells) || links !== 2 * (path.size - 1) || decoys > EXT.decoys) return false;
  const sc = m.srcIdx % m.n, sr = Math.floor(m.srcIdx / m.n), kc = m.sinkIdx % m.n, kr = Math.floor(m.sinkIdx / m.n);
  if (path.size < Math.abs(sc - kc) + Math.abs(sr - kr) + 1 + EXT.detour) return false;
  if (cost < EXT.minTurns || cost > EXT.maxTurns) return false;
  let prev = -1, cur = m.srcIdx, steps = 0;
  while (cur !== m.sinkIdx && steps <= path.size) {
    const c = cur % m.n, r = Math.floor(cur / m.n);
    const next = DIRS.map(([d, dx, dy]) => [d, c + dx, r + dy]).filter(([d, x, y]) => (m.tiles[cur].sol & d) && x >= 0 && x < m.n && y >= 0 && y < m.m
      && path.has(y * m.n + x) && (m.tiles[y * m.n + x].sol & OPP[d])).map(([, x, y]) => y * m.n + x).filter((j) => j !== prev);
    if (next.length !== 1) return false;
    prev = cur; cur = next[0]; steps++;
  }
  if (cur !== m.sinkIdx || steps !== path.size - 1) return false;
  const solved = extConnected(m.tiles, m.tiles.map(() => 0), m.n, m.m, m.srcIdx);
  if (!solved.has(m.sinkIdx)) return false;
  return !extConnected(m.tiles, m.scramble, m.n, m.m, m.srcIdx).has(m.sinkIdx);
}

function generateHard(rng) {
  const L = HARD, n = L.n, m = L.m;
  const NO_HOLES = new Set();
  for (let attempt = 0; attempt < 4000; attempt++) {
    const a = { c: 0, r: rng.int(0, m - 1) }, b = { c: n - 1, r: rng.int(0, m - 1) };
    const path = extCarve(rng, n, m, NO_HOLES, a, b, rng.raw() < 0.3 ? 'dfs' : 'via');
    if (!path || path.length < L.minLen || path.length > L.maxLen) continue;
    const solMask = connectorsForPath(path, n);
    const order = path.map((p) => p.r * n + p.c);
    const srcIdx = order[0], sinkIdx = order[order.length - 1];
    const sol = Array(n * m).fill(0);
    for (const i of order) sol[i] = solMask[i];
    if (order.slice(1, -1).filter((i) => !isStraight(sol[i])).length < 4) continue;
    const occ = new Set(order), decoy = new Set();
    const distTo = (p) => (i) => Math.abs((i % n) - p.c) + Math.abs(Math.floor(i / n) - p.r);
    const free = (i) => i >= 0 && !occ.has(i);
    const elbows = order.map((_, t) => t).slice(1, -1).filter((t) => !isStraight(sol[order[t]]));
    const forks = rng.shuffle(elbows.flatMap((t) => [{ t, side: 'a' }, { t, side: 'b' }]));
    let branches = 0;
    for (const { t, side } of forks) {
      if (branches >= 3 || L.decoys - decoy.size < L.branchMin) break;
      const toNb = [N, E, S, W].find((d) => stepIdx(n, m, order[t], d) === order[side === 'a' ? t + 1 : t - 1]);
      const alt = OPP[toNb];
      const dist = distTo(side === 'a' ? b : a);
      let cur = stepIdx(n, m, order[t], alt), enter = OPP[alt];
      const want = Math.min(rng.int(L.branchMin, 5), L.decoys - decoy.size);
      const cells = [];
      while (cells.length < want && free(cur) && !cells.some((x) => x.i === cur)) {
        const scored = [N, E, S, W].filter((d) => d !== enter).map((d) => {
          const j = stepIdx(n, m, cur, d);
          const ok = free(j) && !cells.some((x) => x.i === j);
          return { d, s: (ok ? 0 : 10) + (j >= 0 ? dist(j) : 20) + rng.raw() * 2.5 };
        }).sort((x, y) => x.s - y.s);
        const d = scored[0].d;
        cells.push({ i: cur, mask: enter | d });
        cur = stepIdx(n, m, cur, d); enter = OPP[d];
      }
      if (cells.length < L.branchMin) continue;
      for (const x of cells) { sol[x.i] = x.mask; occ.add(x.i); decoy.add(x.i); }
      if (countRoutes(sol, n, m, srcIdx, sinkIdx) !== 1) {
        for (const x of cells) { sol[x.i] = 0; occ.delete(x.i); decoy.delete(x.i); }
        continue;
      }
      branches++;
    }
    if (branches < L.minBranches) continue;
    const shapes = [N | S, E | W, N | E, E | S, S | W, W | N];
    const near = rng.shuffle([...Array(n * m).keys()].filter((i) => !occ.has(i)
      && [N, E, S, W].some((d) => occ.has(stepIdx(n, m, i, d)))));
    for (const i of near) {
      if (decoy.size >= L.decoys) break;
      sol[i] = rng.pick(shapes);
      if (countRoutes(sol, n, m, srcIdx, sinkIdx) !== 1) { sol[i] = 0; continue; }
      occ.add(i); decoy.add(i);
    }
    if (decoy.size !== L.decoys) continue;
    if (!branchOk(branchDepths(sol, n, m, order))) continue;
    const pathSet = new Set(order);
    const tiles = sol.map((mk, i) => ({ sol: mk, fixed: i === srcIdx || i === sinkIdx, src: i === srcIdx, sink: i === sinkIdx, empty: mk === 0 }));
    const rotPath = order.filter((i) => !tiles[i].fixed);
    let scr = null;
    for (let t = 0; t < 300 && !scr; t++) {
      const rots = tiles.map((tt) => (tt.fixed || tt.empty ? 0 : rng.int(0, 3)));
      let cost = 0;
      for (const i of rotPath) {
        const period = periodOf(tiles[i].sol);
        const k = rng.int(0, period - 1);
        rots[i] = period === 2 ? (k + 2 * rng.int(0, 1)) % 4 : (4 - k) % 4;
        cost += k;
      }
      if (cost >= L.minTurns && cost <= L.maxTurns && !extConnected(tiles, rots, n, m, srcIdx).has(sinkIdx)) scr = rots;
    }
    if (!scr) continue;
    const man = {
      task: 'pipes_connect', board: BOARD, n, m,
      tiles: tiles.map((t) => ({ sol: t.sol, fixed: !!t.fixed, src: !!t.src, sink: !!t.sink, empty: !!t.empty })),
      scramble: scr, srcIdx, sinkIdx, pathIdx: [...pathSet].sort((x, y) => x - y),
    };
    if (gate(man)) return man;
  }
  throw new Error('pipes_connect: no board found');
}

export default {
  meta: {
    name: 'pipes_connect', family: 'B', 
    boardH: 310, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'rotate', cell: '0..n*m-1 (90° CW per action)' }],
    promptHuman: 'Rotate the pipes to connect A to B',
  },

  generate(rng, level, index, _knobs = {}) {
    if (_knobs && _knobs.ext) return generateExt(rng, _knobs.ext);
    return generateHard(rng);
  },

  init(manifest) { return { rot: manifest.scramble.slice() }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'rotate') return { ok: false, reason: 'bad-op' };
    const i = action.cell;
    if (i == null || i < 0 || i >= state.rot.length) return { ok: false, reason: 'bad-cell' };
    if (manifest.tiles[i].fixed || manifest.tiles[i].empty) return { ok: false, reason: 'fixed' };
    state.rot[i] = (state.rot[i] + 1) % 4;
    return { ok: true };
  },

  _curMask(state, manifest) {
    return manifest.tiles.map((t, i) => { let mk = t.sol; for (let k = 0; k < state.rot[i]; k++) mk = rotCW(mk); return mk; });
  },

  _component(state, manifest) {
    const { n, m, srcIdx } = manifest;
    const cur = this._curMask(state, manifest);
    const seen = new Set([srcIdx]); const st = [srcIdx];
    while (st.length) {
      const p = st.pop(), pc = p % n, pr = Math.floor(p / n);
      for (const [d, dx, dy] of DIRS) {
        if (!(cur[p] & d)) continue;
        const qc = pc + dx, qr = pr + dy;
        if (qc < 0 || qc >= n || qr < 0 || qr >= m) continue;
        const q = qr * n + qc;
        if ((cur[q] & OPP[d]) && !seen.has(q)) { seen.add(q); st.push(q); }
      }
    }
    return seen;
  },

  verify(state, manifest) {
    const comp = this._component(state, manifest);
    const success = comp.has(manifest.sinkIdx);
    const onPath = manifest.pathIdx.filter((i) => comp.has(i)).length;
    return {
      success, partial: onPath / manifest.pathIdx.length,
      error: manifest.pathIdx.length - onPath,
      detail: { reached: comp.size },
    };
  },

  oracle(manifest) {
    const acts = [];
    const pathSet = new Set(manifest.pathIdx);
    manifest.tiles.forEach((t, i) => {
      if (t.fixed || t.empty || !pathSet.has(i)) return;
      const turns = turnsNeeded(t.sol, manifest.scramble[i]);
      for (let k = 0; k < turns; k++) acts.push({ op: 'rotate', cell: i });
    });
    return acts;
  },

  randomPolicy(manifest, rnd) {
    const cells = manifest.tiles.map((t, i) => (t.fixed || t.empty ? -1 : i)).filter((i) => i >= 0);
    const k = 1 + Math.floor(rnd() * HARD.maxTurns);
    return Array.from({ length: k }, () => ({ op: 'rotate', cell: cells[Math.floor(rnd() * cells.length)] }));
  },

  async mount(env) { env.assets.theme = await mountBoardTheme(env); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Rotate the pipes to connect A to B', 'Tap a tile to turn it');
  },

  _grid(manifest) {
    const { n, m } = manifest;
    const tile = Math.min((BOARD.w - 20) / n, (BOARD.h - 20) / m);
    return { tile, ox: (BOARD.w - tile * n) / 2, oy: (BOARD.h - tile * m) / 2, n, m };
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const G = this._grid(m);
    const comp = env.submitted ? this._component(state, m) : new Set();
    const cur = this._curMask(state, m);
    if (env.assets.theme) { this._drawThemed(g, br, env, G, comp, cur, env.assets.theme); return; }
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#f2f4f7'; g.fillRect(0, 0, br.w, br.h);
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i];
      if (t.hole) continue;
      const cx = G.ox + (i % m.n) * G.tile + G.tile / 2;
      const cy = G.oy + Math.floor(i / m.n) * G.tile + G.tile / 2;
      g.fillStyle = t.empty ? '#e7ebf0' : '#ffffff';
      g.strokeStyle = '#dde3ea';
      g.fillRect(cx - G.tile / 2 + 1, cy - G.tile / 2 + 1, G.tile - 2, G.tile - 2);
      g.strokeRect(cx - G.tile / 2 + 1, cy - G.tile / 2 + 1, G.tile - 2, G.tile - 2);
      if (t.empty) continue;
      const lit = comp.has(i);
      const half = G.tile / 2;
      g.lineWidth = Math.max(6, G.tile * 0.22); g.lineCap = 'butt';
      g.strokeStyle = lit ? '#1991fa' : '#9aa7b4';
      for (const [d, dx, dy] of DIRS) {
        if (!(cur[i] & d)) continue;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * half, cy + dy * half); g.stroke();
      }
      g.beginPath(); g.arc(cx, cy, G.tile * 0.14, 0, Math.PI * 2);
      g.fillStyle = t.src ? '#2ecc71' : t.sink ? '#e8483f' : lit ? '#1991fa' : '#8b97a3';
      g.fill();
      if (t.src || t.sink) {
        g.fillStyle = '#fff'; g.font = `700 ${Math.round(G.tile * 0.28)}px ${UI_FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t.src ? 'A' : 'B', cx, cy + 0.5);
      }
      g.lineWidth = 1;
    }
    g.restore();
  },

  _drawThemed(g, br, env, G, comp, cur, T) {
    const m = env.manifest;
    const at = (i) => [G.ox + (i % m.n) * G.tile + G.tile / 2, G.oy + Math.floor(i / m.n) * G.tile + G.tile / 2];
    g.save();
    g.translate(br.x, br.y);
    paintThemeBoard(g, br.w, br.h, T);
    const holes = m.tiles.some((t) => t.hole);
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i];
      if (t.hole) continue;
      const [cx, cy] = at(i);
      const x0 = cx - G.tile / 2 + 1, y0 = cy - G.tile / 2 + 1, s = G.tile - 2;
      if (T.shadow && !t.empty) { g.fillStyle = 'rgba(0,0,0,0.18)'; roundRectPath(g, x0 + 2, y0 + 2, s, s, T.radius); g.fill(); }
      g.fillStyle = t.empty ? T.empty : T.card; g.strokeStyle = T.line;
      roundRectPath(g, x0, y0, s, s, T.radius); g.fill(); g.stroke();
    }
    if (holes) {
      g.save(); g.beginPath();
      m.tiles.forEach((t, i) => { if (!t.hole) { const [cx, cy] = at(i); g.rect(cx - G.tile / 2, cy - G.tile / 2, G.tile, G.tile); } });
      g.clip();
    }
    paintThemeTex(g, G.ox, G.oy, m.n * G.tile, Math.ceil(m.tiles.length / m.n) * G.tile, T, T.cardTexAlpha);
    if (holes) g.restore();
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i];
      if (t.empty) continue;
      const [cx, cy] = at(i);
      const lit = comp.has(i);
      const half = G.tile / 2;
      g.lineWidth = Math.max(5, G.tile * 0.22 * T.strokeK); g.lineCap = 'butt';
      g.strokeStyle = lit ? T.inkLit : T.ink;
      for (const [d, dx, dy] of DIRS) {
        if (!(cur[i] & d)) continue;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * half, cy + dy * half); g.stroke();
      }
      g.beginPath(); g.arc(cx, cy, G.tile * 0.14, 0, Math.PI * 2);
      g.fillStyle = t.src ? T.accentA : t.sink ? T.accentB : lit ? T.inkLit : T.ink;
      g.fill();
      if (t.src || t.sink) {
        g.fillStyle = T.label; g.font = `700 ${Math.round(G.tile * 0.28)}px ${UI_FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t.src ? 'A' : 'B', cx, cy + 0.5);
      }
      g.lineWidth = 1;
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const G = this._grid(env.manifest);
    const c = Math.floor((evt.x - G.ox) / G.tile), r = Math.floor((evt.y - G.oy) / G.tile);
    if (c < 0 || c >= G.n || r < 0 || r >= G.m) return [];
    return [{ op: 'rotate', cell: r * G.n + c }];
  },

  footerStatus(env) {
    if (!env.submitted) return 'Tap tiles to turn them';
    const comp = this._component(env.state, env.manifest);
    return comp.has(env.manifest.sinkIdx) ? 'connected' : 'not connected';
  },
};

const mirrorMask = (mk) => (mk & (N | S)) | (mk & E ? W : 0) | (mk & W ? E : 0);
export function semanticKey(m) {
  const onPath = new Set(m.pathIdx);
  const rotK = (mk, k) => { for (let i = 0; i < k; i++) mk = rotCW(mk); return mk; };
  const cls = (mk) => { const d = degreeOf(mk); return d === 1 ? 'C' : d === 3 ? 'T' : d === 4 ? 'X' : periodOf(mk) === 2 ? 'S' : 'L'; };
  let W0 = m.n, H0 = m.m;
  let grid = m.tiles.map((t, i) => (t.hole ? ['x'] : t.empty ? ['.'] : !onPath.has(i) ? ['d' + cls(t.sol)]
    : ['p', t.sol, rotK(t.sol, m.scramble[i]), t.src ? 'A' : t.sink ? 'B' : '']));
  const enc = (g, w, h) => `${w}x${h}|` + g.map((c) => (c[0] === 'p' ? `p${c[1].toString(16)}${c[2].toString(16)}${c[3]}` : c[0])).join(',');
  const rot = (g, w, h) => {
    const out = new Array(w * h);
    g.forEach((c, i) => { const x = i % w, y = Math.floor(i / w); out[x * h + (h - 1 - y)] = c[0] === 'p' ? ['p', rotCW(c[1]), rotCW(c[2]), c[3]] : c; });
    return out;
  };
  const flip = (g, w) => g.map((_, i) => { const x = i % w, y = Math.floor(i / w), c = g[y * w + (w - 1 - x)]; return c[0] === 'p' ? ['p', mirrorMask(c[1]), mirrorMask(c[2]), c[3]] : c; });
  let best = null;
  for (const f of [false, true]) {
    let g = f ? flip(grid, W0) : grid, w = W0, h = H0;
    for (let k = 0; k < 4; k++) {
      const key = enc(g, w, h);
      if (best === null || key < best) best = key;
      g = rot(g, w, h); [w, h] = [h, w];
    }
  }
  return 'pipes_connect|' + best;
}

export function gate(manifest) {
  if (manifest && manifest.ext) return gateExt(manifest);
  const m = manifest;
  if (!m || m.task !== 'pipes_connect' || m.n !== HARD.n || m.m !== HARD.m
    || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  const size = m.n * m.m;
  const cell = (i) => Number.isInteger(i) && i >= 0 && i < size;
  if (!Array.isArray(m.tiles) || m.tiles.length !== size
    || !Array.isArray(m.scramble) || m.scramble.length !== size) return false;
  if (!cell(m.srcIdx) || !cell(m.sinkIdx) || m.srcIdx % m.n !== 0 || m.sinkIdx % m.n !== m.n - 1) return false;
  if (!Array.isArray(m.pathIdx) || !m.pathIdx.every(cell)) return false;
  const path = new Set(m.pathIdx);
  if (path.size !== m.pathIdx.length || !path.has(m.srcIdx) || !path.has(m.sinkIdx)) return false;
  let decoys = 0, cost = 0;
  for (let i = 0; i < size; i++) {
    const t = m.tiles[i], end = i === m.srcIdx || i === m.sinkIdx;
    if (!t || !Number.isInteger(t.sol) || t.sol < 0 || t.sol > 15
      || !['fixed', 'src', 'sink', 'empty'].every((k) => typeof t[k] === 'boolean')
      || !Number.isInteger(m.scramble[i]) || m.scramble[i] < 0 || m.scramble[i] > 3) return false;
    if (t.fixed !== end || t.src !== (i === m.srcIdx) || t.sink !== (i === m.sinkIdx)
      || t.empty !== (t.sol === 0) || ((t.fixed || t.empty) && m.scramble[i] !== 0)) return false;
    const degree = DIRS.filter(([d]) => t.sol & d).length;
    if (path.has(i)) {
      if (degree !== (end ? 1 : 2)) return false;
      const c = i % m.n, r = Math.floor(i / m.n);
      for (const [d, dx, dy] of DIRS) {
        if (!(t.sol & d)) continue;
        const x = c + dx, y = r + dy, j = y * m.n + x;
        if (x < 0 || x >= m.n || y < 0 || y >= m.m
          || !path.has(j) || !(m.tiles[j]?.sol & OPP[d])) return false;
      }
      if (!end) cost += turnsNeeded(t.sol, m.scramble[i]);
    } else if (!t.empty) {
      if (degree !== 2) return false;
      decoys++;
    }
  }
  if (decoys > HARD.decoys || cost < HARD.minTurns || cost > HARD.maxTurns) return false;
  const component = (masks) => {
    const seen = new Set([m.srcIdx]), todo = [m.srcIdx];
    while (todo.length) {
      const i = todo.pop(), c = i % m.n, r = Math.floor(i / m.n);
      for (const [d, dx, dy] of DIRS) {
        if (!(masks[i] & d)) continue;
        const x = c + dx, y = r + dy;
        if (x < 0 || x >= m.n || y < 0 || y >= m.m) continue;
        const j = y * m.n + x;
        if ((masks[j] & OPP[d]) && !seen.has(j)) { seen.add(j); todo.push(j); }
      }
    }
    return seen;
  };
  if (component(m.tiles.map((t) => t.sol)).size !== path.size) return false;
  if (path.size < HARD.minLen || path.size > HARD.maxLen) return false;
  const sol = m.tiles.map((t) => t.sol);
  if (countRoutes(sol, m.n, m.m, m.srcIdx, m.sinkIdx) !== 1) return false;
  const order = routeOrder(sol, m.n, m.m, m.srcIdx, m.sinkIdx, path);
  if (!order || order.length !== path.size) return false;
  if (!branchOk(branchDepths(sol, m.n, m.m, order))) return false;
  const initial = m.tiles.map((t, i) => {
    let mask = t.sol;
    for (let k = 0; k < m.scramble[i]; k++) mask = rotCW(mask);
    return mask;
  });
  return !component(initial).has(m.sinkIdx);
}
