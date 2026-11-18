export const neg = (a) => [0 - a[0], 0 - a[1], 0 - a[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1] + 0, a[2] * b[0] - a[0] * b[2] + 0, a[0] * b[1] - a[1] * b[0] + 0];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const vkey = (a) => `${a[0]},${a[1]},${a[2]}`;

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const ROOT_FRAME = Object.freeze({ n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] });

export function stepFrame(f, dir) {
  const { n, r, u } = f;
  if (dir === 0) return { n: u, r, u: neg(n) };
  if (dir === 2) return { n: neg(u), r, u: n };
  if (dir === 1) return { n: r, r: neg(n), u };
  return { n: neg(r), r: n, u };
}

export const cellKey = (c, r) => `${c},${r}`;
export function adjacentCells(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }

export function foldNet(cells, root = 0, rootFrame = ROOT_FRAME) {
  const idx = new Map(cells.map(([c, r], i) => [cellKey(c, r), i]));
  const frames = new Array(cells.length).fill(null);
  frames[root] = { n: rootFrame.n.slice(), r: rootFrame.r.slice(), u: rootFrame.u.slice() };
  const queue = [root];
  while (queue.length) {
    const i = queue.shift();
    const [c, r] = cells[i];
    for (let d = 0; d < 4; d++) {
      const j = idx.get(cellKey(c + DIRS[d][0], r + DIRS[d][1]));
      if (j === undefined || frames[j]) continue;
      frames[j] = stepFrame(frames[i], d);
      queue.push(j);
    }
  }
  if (frames.some((f) => !f)) return null;
  if (new Set(frames.map((f) => vkey(f.n))).size !== cells.length) return null;
  return frames;
}

export function rootFrameFor(n, U, kRoot) {
  const k = kRoot & 3;
  if (k === 0) return { n, u: U, r: cross(U, n) };
  if (k === 2) { const u = neg(U); return { n, u, r: cross(u, n) }; }
  const r = k === 1 ? U : neg(U);
  return { n, r, u: cross(n, r) };
}
export const pictureUp = (f, k) => [f.u, f.r, neg(f.u), neg(f.r)][k & 3];

function normalizeCells(cells) {
  const mx = Math.min(...cells.map((p) => p[0])), my = Math.min(...cells.map((p) => p[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const shapeKey = (cells) => cells.map((p) => p.join(',')).join(';');
const SYM = [
  ([x, y]) => [x, y], ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x],
  ([x, y]) => [-x, y], ([x, y]) => [y, x], ([x, y]) => [x, -y], ([x, y]) => [-y, -x],
];
function adjacencyCount(cells) {
  let k = 0;
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (adjacentCells(cells[i], cells[j])) k++;
  return k;
}
export function isCubeNet(cells) {
  return Array.isArray(cells) && cells.length === 6 && new Set(cells.map((p) => cellKey(p[0], p[1]))).size === 6
    && adjacencyCount(cells) === 5 && !!foldNet(cells);
}

export const FREE_NETS = (() => {
  let level = new Map([['0,0', [[0, 0]]]]);
  for (let n = 1; n < 6; n++) {
    const next = new Map();
    for (const cells of level.values()) {
      const have = new Set(cells.map((p) => cellKey(p[0], p[1])));
      for (const [x, y] of cells) for (const [dx, dy] of DIRS) {
        if (have.has(cellKey(x + dx, y + dy))) continue;
        const shape = normalizeCells([...cells, [x + dx, y + dy]]);
        const key = shapeKey(shape);
        if (!next.has(key)) next.set(key, shape);
      }
    }
    level = next;
  }
  const free = new Map();
  for (const cells of level.values()) {
    if (!isCubeNet(cells)) continue;
    const variants = new Map();
    for (const s of SYM) { const v = normalizeCells(cells.map(s)); variants.set(shapeKey(v), v); }
    const key = [...variants.keys()].sort()[0];
    if (!free.has(key)) free.set(key, [...variants.keys()].sort().map((k) => variants.get(k)));
  }
  const out = [...free.keys()].sort().map((key) => ({ key, variants: free.get(key) }));
  if (out.length !== 11) throw new Error(`_box_fold_select_net: expected 11 cube nets, found ${out.length}`);
  return out;
})();
export const netSize = (cells) => ({ w: Math.max(...cells.map((p) => p[0])) + 1, h: Math.max(...cells.map((p) => p[1])) + 1 });

export const ROT24 = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (j === p[i] ? sg[i] : 0)));
    const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
      + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    if (det === 1) out.push(M);
  }
  return out;
})();
export const rotV = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2] + 0);
export const rotTV = (M, v) => [0, 1, 2].map((i) => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2] + 0);

export const SLOTS = Object.freeze([
  Object.freeze({ name: 'T', n: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0] }),
  Object.freeze({ name: 'L', n: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] }),
  Object.freeze({ name: 'R', n: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] }),
]);
export const slotDirVec = (s, d) => [SLOTS[s].up, SLOTS[s].right, neg(SLOTS[s].up), neg(SLOTS[s].right)][d & 3];
export function slotDirIndex(s, U) { for (let d = 0; d < 4; d++) if (same(slotDirVec(s, d), U)) return d; return -1; }
export function slotOfNormal(n) { return SLOTS.findIndex((S) => same(S.n, n)); }

export function cubeModel(frames, glyphs, rots) {
  const faces = {};
  frames.forEach((f, i) => { faces[vkey(f.n)] = { g: glyphs[i], up: pictureUp(f, rots[i]), cell: i }; });
  return faces;
}
export function viewOf(model, M) {
  return SLOTS.map((S, s) => {
    const f = model[vkey(rotTV(M, S.n))];
    return [f.g, slotDirIndex(s, rotV(M, f.up))];
  });
}
export const viewKey = (v) => v.map(([g, d]) => `${g}.${d}`).join('|');
export function trueViews(model) {
  const out = new Map();
  ROT24.forEach((M, qi) => out.set(viewKey(viewOf(model, M)), qi));
  return out;
}
export function glyphNormal(model, g) { const k = Object.keys(model).find((key) => model[key].g === g); return k ? k.split(',').map(Number) : null; }

export function turnSlot(view, s, delta) { const v = view.map((e) => e.slice()); v[s][1] = (v[s][1] + delta) & 3; return v; }
export function swapSlots(view, a, b) {
  const w = [0, 1, 2].map((i) => SLOTS[a].n[i] - SLOTS[b].n[i]);
  const M = (v) => { const k = dot(v, w); return [0, 1, 2].map((i) => v[i] - k * w[i] + 0); };
  const v = view.map((e) => e.slice());
  v[b] = [view[a][0], slotDirIndex(b, M(slotDirVec(a, view[a][1])))];
  v[a] = [view[b][0], slotDirIndex(a, M(slotDirVec(b, view[b][1])))];
  return v;
}

export function isoProjector(k, elevDeg, ox, oy) {
  const E = elevDeg * Math.PI / 180, sE = Math.sin(E), cE = Math.cos(E);
  return (p) => ({ x: ox + k * (p[0] - p[2]) / Math.SQRT2, y: oy + k * ((p[0] + p[2]) / Math.SQRT2 * sE - p[1] * cE) });
}
export function cubeScreenSize(k, elevDeg) {
  const E = elevDeg * Math.PI / 180;
  return { w: k * Math.SQRT2, h: k * (Math.SQRT2 * Math.sin(E) + Math.cos(E)) };
}
export function slotQuad(P, s) {
  const S = SLOTS[s], c = S.n.map((x) => x * 0.5);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => P([0, 1, 2].map((i) => c[i] + (S.right[i] * a + S.up[i] * b) * 0.5)));
}
export function slotPictureTransform(P, s, d) {
  const S = SLOTS[s], c = S.n.map((x) => x * 0.5), U = slotDirVec(s, d), Rg = cross(U, S.n);
  const at = (gx, gy) => P([0, 1, 2].map((i) => c[i] + (gx - 0.5) * Rg[i] + (0.5 - gy) * U[i]));
  const p0 = at(0, 0), p1 = at(1, 0), p3 = at(0, 1);
  return [p1.x - p0.x, p1.y - p0.y, p3.x - p0.x, p3.y - p0.y, p0.x, p0.y];
}
export function inUnit(g, tf, inset, fn) {
  g.save();
  g.transform(...tf);
  g.translate(inset, inset); g.scale(1 - 2 * inset, 1 - 2 * inset);
  fn();
  g.restore();
}
export function polyPath(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
