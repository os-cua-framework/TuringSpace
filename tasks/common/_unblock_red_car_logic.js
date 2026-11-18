export const N = 6, RED_ROW = 2, EXIT_ANCHOR = N - 2;

export const cellsOf = (v, a) => Array.from({ length: v.len }, (_, k) => (v.dir === 'h' ? [v.fixed, a + k] : [a + k, v.fixed]));
export function occupancy(vs, anchors, skip = -1) {
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  vs.forEach((v, i) => { if (i !== skip) for (const [r, c] of cellsOf(v, anchors[i])) g[r][c] = i; });
  return g;
}
function occFlat(vs, a) {
  const g = new Int8Array(N * N).fill(-1);
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    for (let k = 0; k < v.len; k++) g[v.dir === 'h' ? v.fixed * N + a[i] + k : (a[i] + k) * N + v.fixed] = i;
  }
  return g;
}
function rangeFlat(vs, a, g, i) {
  const v = vs[i]; let lo = 0, hi = 0;
  if (v.dir === 'h') {
    const r = v.fixed * N;
    for (let c = a[i] - 1; c >= 0 && g[r + c] < 0; c--) lo--;
    for (let c = a[i] + v.len; c < N && g[r + c] < 0; c++) hi++;
  } else {
    const c = v.fixed;
    for (let r = a[i] - 1; r >= 0 && g[r * N + c] < 0; r--) lo--;
    for (let r = a[i] + v.len; r < N && g[r * N + c] < 0; r++) hi++;
  }
  return [lo, hi];
}
export function freeRange(vs, anchors, i) { return rangeFlat(vs, anchors, occFlat(vs, anchors), i); }
export const solved = (anchors) => anchors[0] === EXIT_ANCHOR;

const laneBlockers = (vs, anchors) => {
  const g = occupancy(vs, anchors), ids = new Set();
  for (let c = anchors[0] + 2; c < N; c++) if (g[RED_ROW][c] > 0) ids.add(g[RED_ROW][c]);
  return [...ids];
};
export function needsChain(vs, anchors) {
  const lane = laneBlockers(vs, anchors);
  if (!lane.length) return false;
  return lane.some((i) => {
    const [lo, hi] = freeRange(vs, anchors, i);
    for (let d = lo; d <= hi; d++) if (!cellsOf(vs[i], anchors[i] + d).some(([r]) => r === RED_ROW)) return false;
    return true;
  });
}

export function solveRush(vs, start, maxDepth) {
  if (solved(start)) return [];
  const V = vs.length, pw = Array.from({ length: V }, (_, i) => 6 ** i);
  const pack = (a) => { let k = 0; for (let i = 0; i < V; i++) k += a[i] * pw[i]; return k; };
  const prev = new Map([[pack(start), null]]);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      const g = occFlat(vs, st), ks = pack(st);
      for (let i = 0; i < V; i++) {
        const [lo, hi] = rangeFlat(vs, st, g, i);
        for (let d = lo; d <= hi; d++) {
          if (!d) continue;
          const k = ks + d * pw[i];
          if (prev.has(k)) continue;
          prev.set(k, { from: ks, id: i, d });
          const n = st.slice(); n[i] += d;
          if (solved(n)) {
            const path = []; let cur = k;
            while (prev.get(cur)) { const p = prev.get(cur); path.push({ id: p.id, d: p.d }); cur = p.from; }
            return path.reverse();
          }
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return null;
}

export function playClamped(vs, start, plan, budget = Infinity) {
  const a = start.slice(); let moves = 0;
  for (const p of plan) {
    if (moves >= budget) break;
    const [lo, hi] = freeRange(vs, a, p.id), d = Math.max(lo, Math.min(hi, p.d));
    if (d) { a[p.id] += d; moves++; }
  }
  return { a, moves, ok: solved(a) };
}

export function gapPairs(vs, anchors) {
  const g = occupancy(vs, anchors), out = [];
  vs.forEach((v, i) => {
    for (const s of [-1, 1]) {
      const end = s > 0 ? anchors[i] + v.len : anchors[i] - 1, nxt = end + s;
      if (end < 0 || end >= N || nxt < 0 || nxt >= N) continue;
      const gc = v.dir === 'h' ? [v.fixed, end] : [end, v.fixed], hc = v.dir === 'h' ? [v.fixed, nxt] : [nxt, v.fixed];
      if (g[gc[0]][gc[1]] >= 0 || g[hc[0]][hc[1]] < 0) continue;
      out.push({ a: i, s, b: g[hc[0]][hc[1]], gap: { r: gc[0], c: gc[1] } });
    }
  });
  return out;
}
export function misreadLot(vs, anchors, pair, who) {
  const v = vs[pair.a], dr = v.dir === 'v' ? 1 : 0, dc = v.dir === 'h' ? 1 : 0, sg = who === pair.a ? pair.s : -pair.s;
  const nv = vs.map((x) => ({ ...x })), na = anchors.slice(), w = nv[who];
  if (w.dir === 'h') { w.fixed += dr * sg; na[who] += dc * sg; } else { w.fixed += dc * sg; na[who] += dr * sg; }
  if (w.fixed < 0 || w.fixed >= N || na[who] < 0 || na[who] + w.len > N) return null;
  if (who === 0 ? w.fixed !== RED_ROW : w.dir === 'h' && w.fixed === RED_ROW) return null;
  const g = occupancy(nv, na, who);
  if (cellsOf(w, na[who]).some(([r, c]) => g[r][c] >= 0)) return null;
  return { vehicles: nv, anchors: na };
}
export function playToSlots(vs, start, seenStart, plan, budget = Infinity) {
  const a = start.slice(), seen = seenStart.slice(); let moves = 0;
  for (const p of plan) {
    if (moves >= budget) break;
    const target = seen[p.id] + p.d; seen[p.id] = target;
    const [lo, hi] = freeRange(vs, a, p.id), d = Math.max(lo, Math.min(hi, target - a[p.id]));
    if (d) { a[p.id] += d; moves++; }
  }
  return { a, moves, ok: solved(a) };
}
export function misreadOutcome(vs, anchors, pair, who, budget, maxDepth) {
  const lot = misreadLot(vs, anchors, pair, who);
  if (!lot) return null;
  const plan = solveRush(lot.vehicles, lot.anchors, maxDepth);
  if (!plan) return { decisive: true, plan: null, real: null };
  const real = playToSlots(vs, anchors, lot.anchors, plan, budget);
  return { decisive: !real.ok, plan, real };
}
