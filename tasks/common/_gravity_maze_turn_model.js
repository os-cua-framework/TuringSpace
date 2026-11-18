export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const gravityDir = (rot) => (6 - (rot & 3)) % 4;
export const turnRot = (rot, dir) => (rot + (dir === 'cw' ? 1 : 3)) % 4;

export function wallAt(m, c, r, d) {
  if (d === 0) return m.hw[r][c] === 1;
  if (d === 2) return m.hw[r + 1][c] === 1;
  if (d === 3) return m.vw[r][c] === 1;
  return m.vw[r][c + 1] === 1;
}
export function setWall(m, c, r, d, v) {
  TABLES.delete(m);
  if (d === 0) m.hw[r][c] = v; else if (d === 2) m.hw[r + 1][c] = v;
  else if (d === 3) m.vw[r][c] = v; else m.vw[r][c + 1] = v;
}
export const pitIndex = (m, c, r) => m.pits.findIndex((p) => p.c === c && p.r === r);
const inGrid = (m, c, r) => c >= 0 && r >= 0 && c < m.n && r < m.n;

export function roll(m, c, r, g) {
  const path = [[c, r]];
  for (let guard = 0; guard < 64; guard++) {
    if (wallAt(m, c, r, g)) return { c, r, status: 'in', path };
    const nc = c + DIRS[g][0], nr = r + DIRS[g][1];
    if (!inGrid(m, nc, nr)) return { c, r, status: 'out', path };
    c = nc; r = nr; path.push([c, r]);
    if (pitIndex(m, c, r) >= 0) return { c, r, status: 'pit', path };
  }
  return { c, r, status: 'in', path };
}

const TABLES = new WeakMap();
function tables(m) {
  const sig = `${m.n}|${m.pits.length}|${m.exit.side}|${m.exit.k}`;
  const hit = TABLES.get(m);
  if (hit && hit.sig === sig) return hit;
  const n = m.n, NS = n * n * 4;
  const rl = new Int16Array(NS), pit = new Uint8Array(n * n);
  for (const p of m.pits) pit[p.r * n + p.c] = 1;
  for (let r0 = 0; r0 < n; r0++) for (let c0 = 0; c0 < n; c0++) for (let g = 0; g < 4; g++) {
    let c = c0, r = r0, v = -2;
    while (v === -2) {
      if (wallAt(m, c, r, g)) { v = r * n + c; break; }
      const nc = c + DIRS[g][0], nr = r + DIRS[g][1];
      if (nc < 0 || nr < 0 || nc >= n || nr >= n) { v = -1; break; }
      c = nc; r = nr;
      if (pit[r * n + c]) v = 100 + r * n + c;
    }
    rl[(r0 * n + c0) * 4 + g] = v;
  }
  const dist = new Int16Array(NS).fill(-1);
  for (let k = 1; k <= NS; k++) {
    let any = false;
    for (let ci = 0; ci < n * n; ci++) for (let rot = 0; rot < 4; rot++) {
      const si = ci * 4 + rot;
      if (dist[si] >= 0) continue;
      for (const dr of [1, 3]) {
        const r2 = (rot + dr) % 4, v = rl[ci * 4 + gravityDir(r2)];
        if ((v === -1 && k === 1) || (v >= 0 && v < 100 && dist[v * 4 + r2] === k - 1 && k > 1)) { dist[si] = k; any = true; break; }
      }
    }
    if (!any) break;
  }
  const out = { sig, rl, dist };
  TABLES.set(m, out);
  return out;
}

export function press(m, s, dir) {
  const rot = turnRot(s.rot, dir);
  if (s.status !== 'in') return { s: { ...s, rot } };
  const v = tables(m).rl[(s.r * m.n + s.c) * 4 + gravityDir(rot)];
  if (v === -1) return { s: { c: s.c, r: s.r, rot, status: 'out' } };
  const ci = v >= 100 ? v - 100 : v;
  return { s: { c: ci % m.n, r: Math.floor(ci / m.n), rot, status: v >= 100 ? 'pit' : 'in' } };
}
export const startState = (m) => ({ c: m.start.c, r: m.start.r, rot: 0, status: 'in' });
const skey = (s) => `${s.c},${s.r},${s.rot}`;
export function distOut(m, s) {
  if (s.status === 'out') return 0;
  if (s.status !== 'in') return -1;
  return tables(m).dist[(s.r * m.n + s.c) * 4 + s.rot];
}

export function solve(m, s0 = startState(m)) {
  let d = distOut(m, s0);
  if (d < 0) return null;
  const seq = [];
  let s = s0;
  while (d > 0) {
    let moved = false;
    for (const dir of ['cw', 'ccw']) {
      const t = press(m, s, dir).s, dt = distOut(m, t);
      if (dt === d - 1) { seq.push(dir); s = t; d = dt; moved = true; break; }
    }
    if (!moved) return null;
  }
  return seq;
}

export function reachable(m) {
  const s0 = startState(m), seen = new Map([[skey(s0), s0]]);
  const q = [s0];
  while (q.length) {
    const s = q.shift();
    for (const dir of ['cw', 'ccw']) {
      const t = press(m, s, dir).s;
      if (t.status !== 'in' || seen.has(skey(t))) continue;
      seen.set(skey(t), t); q.push(t);
    }
  }
  return [...seen.values()];
}

export function allCanEscape(m) {
  const states = reachable(m), idx = new Map(states.map((s, i) => [skey(s), i]));
  const succ = states.map((s) => ['cw', 'ccw'].map((d) => press(m, s, d).s));
  const good = new Uint8Array(states.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < states.length; i++) {
      if (good[i]) continue;
      if (succ[i].some((t) => t.status === 'out' || (t.status === 'in' && good[idx.get(skey(t))]))) { good[i] = 1; changed = true; }
    }
  }
  return good.every((g) => g === 1);
}

export function runPresses(m, dirs, s = startState(m)) {
  let k = 0;
  for (const d of dirs) { if (s.status !== 'in') break; s = press(m, s, d).s; k++; }
  return { s, k };
}

export function lazyConstant(m, dir, n = 10) { return runPresses(m, Array(n).fill(dir)).s.status; }
export function lazyExitDown(m, tie = 'cw', n = 10) {
  let s = startState(m), wig = 0;
  const other = tie === 'cw' ? 'ccw' : 'cw';
  const want = (6 - m.exit.side) % 4;
  for (let i = 0; i < n && s.status === 'in'; i++) {
    const d = (want - s.rot + 4) % 4;
    let dir;
    if (d === 0) dir = wig++ % 2 === 0 ? tie : other;
    else dir = d === 1 ? 'cw' : d === 3 ? 'ccw' : tie;
    s = press(m, s, dir).s;
  }
  return s.status;
}
export function mirror(m) {
  const n = m.n, fd = (d) => (d === 1 ? 3 : d === 3 ? 1 : d);
  const out = JSON.parse(JSON.stringify(m));
  out.hw = m.hw.map((row) => row.slice().reverse());
  out.vw = m.vw.map((row) => row.slice().reverse());
  out.exit = { side: fd(m.exit.side), k: m.exit.side === 0 || m.exit.side === 2 ? n - 1 - m.exit.k : m.exit.k };
  out.pits = m.pits.map((p) => ({ c: n - 1 - p.c, r: p.r, open: fd(p.open) }));
  if (m.start) out.start = { c: n - 1 - m.start.c, r: m.start.r };
  if (m.sol) out.sol = m.sol.map((d) => (d === 'cw' ? 'ccw' : 'cw'));
  return out;
}
export function exitCell(m) {
  const { side, k } = m.exit, n = m.n;
  return side === 0 ? [k, 0] : side === 1 ? [n - 1, k] : side === 2 ? [k, n - 1] : [0, k];
}
export function lazyGreedy(m, n = 10) {
  let s = startState(m);
  const [ec, er] = exitCell(m);
  const dist = (t) => (t.status === 'out' ? -1 : t.status === 'pit' ? 1e9 : Math.abs(t.c - ec) + Math.abs(t.r - er));
  for (let i = 0; i < n && s.status === 'in'; i++) {
    const a = press(m, s, 'cw').s, b = press(m, s, 'ccw').s;
    s = dist(b) < dist(a) ? b : a;
  }
  return s.status;
}
export function randomOutProb(m, kmin = 3, kmax = 8) {
  let dist = new Map([[skey(startState(m)) + ',in', { s: startState(m), p: 1 }]]);
  let total = 0, out = 0, pit = 0;
  for (let k = 1; k <= kmax; k++) {
    const nd = new Map();
    let pOut = 0, pPit = 0;
    for (const { s, p } of dist.values()) {
      if (s.status !== 'in') { if (s.status === 'out') pOut += p; else pPit += p; const kk = skey(s) + s.status; const e = nd.get(kk); if (e) e.p += p; else nd.set(kk, { s, p }); continue; }
      for (const dir of ['cw', 'ccw']) {
        const t = press(m, s, dir).s, kk = skey(t) + t.status;
        if (t.status === 'out') pOut += p / 2; else if (t.status === 'pit') pPit += p / 2;
        const e = nd.get(kk); if (e) e.p += p / 2; else nd.set(kk, { s: t, p: p / 2 });
      }
    }
    dist = nd;
    if (k >= kmin) { out += pOut; pit += pPit; total++; }
  }
  return { out: out / total, pit: pit / total };
}
