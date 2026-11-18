const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (norm(a) || 1));
const centroid = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
export const matVec = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
export const matMul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));

function finishSolid(name, V, faces, faceKind) {
  const c = centroid(V);
  const F = faces.map((f) => {
    const n = unit(cross3(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]])));
    return dot3(n, sub(centroid(f.map((i) => V[i])), c)) > 0 ? f.slice() : f.slice().reverse();
  });
  const normals = F.map((f) => unit(cross3(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]]))));
  const edgeMap = new Map();
  F.forEach((f, fi) => f.forEach((a, k) => {
    const b = f[(k + 1) % f.length], key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { v: [Math.min(a, b), Math.max(a, b)], faces: [] });
    edgeMap.get(key).faces.push(fi);
  }));
  const edges = [...edgeMap.values()].sort((x, y) => x.v[0] - y.v[0] || x.v[1] - y.v[1]);
  if (!edges.every((e) => e.faces.length === 2)) throw new Error(`${name}: not a closed surface`);
  const edgeIndex = new Map(edges.map((e, i) => [`${e.v[0]},${e.v[1]}`, i]));
  return { name, V, faces: F, normals, faceKind, edges, edgeIndex, center: c };
}

const R3 = Math.sqrt(3);
function makePrism() {
  const rho = 1 / R3, V = [];
  for (const y of [0, 1]) for (let i = 0; i < 3; i++) { const t = Math.PI / 2 + i * 2 * Math.PI / 3; V.push([rho * Math.cos(t), y, rho * Math.sin(t)]); }
  const faces = [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]];
  return finishSolid('prism', V, faces, ['cap', 'cap', 'side', 'side', 'side']);
}
function makePyramid() {
  const h = 1 / Math.SQRT2;
  const V = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, h, 0]];
  const faces = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]];
  return finishSolid('pyramid', V, faces, ['base', 'side', 'side', 'side', 'side']);
}
export const SOLIDS = { prism: makePrism(), pyramid: makePyramid() };

function permutations(n) {
  const out = [], a = [...Array(n).keys()];
  const rec = (k) => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; rec(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  rec(0);
  return out;
}
function symmetryGroup(S, mirrors = false) {
  const n = S.V.length, out = [];
  const d = (i, j) => norm(sub(S.V[i], S.V[j]));
  const vol = (a, b, c2, e) => dot3(cross3(sub(S.V[b], S.V[a]), sub(S.V[c2], S.V[a])), sub(S.V[e], S.V[a]));
  let quad = null;
  for (const q of permutations(n)) { const [a, b, c2, e] = q; if (Math.abs(vol(a, b, c2, e)) > 1e-6) { quad = [a, b, c2, e]; break; } }
  const faceKey = (f) => f.slice().sort((x, y) => x - y).join(',');
  const faceIdx = new Map(S.faces.map((f, i) => [faceKey(f), i]));
  for (const p of permutations(n)) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) for (let j = i + 1; j < n && ok; j++) if (Math.abs(d(i, j) - d(p[i], p[j])) > 1e-6) ok = false;
    if (!ok) continue;
    const [a, b, c2, e] = quad;
    if (!mirrors && Math.sign(vol(a, b, c2, e)) !== Math.sign(vol(p[a], p[b], p[c2], p[e]))) continue;
    const facePerm = S.faces.map((f) => faceIdx.get(faceKey(f.map((i) => p[i]))));
    if (facePerm.some((x) => x === undefined)) continue;
    const edgePerm = S.edges.map((ed) => { const x = p[ed.v[0]], y = p[ed.v[1]]; return S.edgeIndex.get(x < y ? `${x},${y}` : `${y},${x}`); });
    out.push({ vperm: p, facePerm, edgePerm });
  }
  return out;
}
export const GROUPS = { prism: symmetryGroup(SOLIDS.prism), pyramid: symmetryGroup(SOLIDS.pyramid) };
export const FULL_GROUPS = { prism: symmetryGroup(SOLIDS.prism, true), pyramid: symmetryGroup(SOLIDS.pyramid, true) };

function faceLocal(S, fi) {
  const f = S.faces[fi], o = S.V[f[0]], e1 = unit(sub(S.V[f[1]], o)), e2 = cross3(S.normals[fi], e1);
  const out = {};
  for (const v of f) { const r = sub(S.V[v], o); out[v] = [dot3(r, e1), dot3(r, e2)]; }
  return out;
}
const LOCAL = Object.fromEntries(Object.entries(SOLIDS).map(([k, S]) => [k, S.faces.map((_, fi) => faceLocal(S, fi))]));

export function unfold(solidName, tree) {
  const S = SOLIDS[solidName], L = LOCAL[solidName];
  const nF = S.faces.length;
  const place = new Array(nF).fill(null);
  place[0] = { ...L[0] };
  const treeSet = new Set(tree);
  const queue = [0];
  while (queue.length) {
    const p = queue.shift();
    for (const ei of tree) {
      const e = S.edges[ei];
      if (!e.faces.includes(p)) continue;
      const f = e.faces[0] === p ? e.faces[1] : e.faces[0];
      if (place[f]) continue;
      const [a, b] = e.v, A2 = place[p][a], B2 = place[p][b], la = L[f][a], lb = L[f][b];
      const ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) - Math.atan2(lb[1] - la[1], lb[0] - la[0]);
      const c = Math.cos(ang), s = Math.sin(ang);
      const rot = (q) => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
      const ra = rot(la), tx = A2[0] - ra[0], ty = A2[1] - ra[1];
      place[f] = {};
      for (const v of S.faces[f]) { const q = rot(L[f][v]); place[f][v] = [q[0] + tx, q[1] + ty]; }
      queue.push(f);
    }
  }
  if (place.some((x) => !x)) return null;
  const polys = S.faces.map((f, fi) => f.map((v) => place[fi][v]));
  const segs = [];
  S.edges.forEach((e, ei) => {
    if (treeSet.has(ei)) { const f = e.faces[0]; segs.push({ a: place[f][e.v[0]], b: place[f][e.v[1]], edge: ei, fold: true, face: -1 }); }
    else for (const f of e.faces) segs.push({ a: place[f][e.v[0]], b: place[f][e.v[1]], edge: ei, fold: false, face: f });
  });
  return { polys, segs };
}

function overlap(P, Q, eps = 1e-6) {
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = b[1] - a[1], ny = a[0] - b[0];
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const v of P) { const t = v[0] * nx + v[1] * ny; p0 = Math.min(p0, t); p1 = Math.max(p1, t); }
    for (const v of Q) { const t = v[0] * nx + v[1] * ny; q0 = Math.min(q0, t); q1 = Math.max(q1, t); }
    if (p1 <= q0 + eps || q1 <= p0 + eps) return false;
  }
  return true;
}
function spanningTrees(S) {
  const nF = S.faces.length, m = S.edges.length, out = [];
  const rec = (start, chosen) => {
    if (chosen.length === nF - 1) {
      const par = [...Array(nF).keys()], find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
      for (const ei of chosen) { const [f, g] = S.edges[ei].faces; const a = find(f), b = find(g); if (a === b) return; par[a] = b; }
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < m; i++) { chosen.push(i); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  return out;
}
function netTrees(name) {
  const S = SOLIDS[name];
  return spanningTrees(S).filter((tree) => {
    if (name === 'prism' && tree.filter((ei) => S.edges[ei].faces.every((f) => S.faceKind[f] === 'side')).length !== 2) return false;
    const U = unfold(name, tree);
    if (!U) return false;
    for (let i = 0; i < U.polys.length; i++) for (let j = i + 1; j < U.polys.length; j++) if (overlap(U.polys[i], U.polys[j])) return false;
    return true;
  });
}
export const NET_TREES = { prism: netTrees('prism'), pyramid: netTrees('pyramid') };
export const treeKey = (tree) => tree.slice().sort((a, b) => a - b).join(',');

export function yawMat(deg) { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
