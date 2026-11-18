import { SOLIDS, FULL_GROUPS, NET_TREES, dot3 } from './_surface_development_edge_solids.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (norm(a) || 1));
const centroid = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);

function finishSolid(name, V, faces, faceKind) {
  const c = centroid(V);
  const F = faces.map((f) => {
    const fc = centroid(f.map((i) => V[i]));
    const n0 = unit(sub(fc, c));
    const e1 = unit(sub(V[f[0]], fc)), e2 = cross3(n0, e1);
    return f.slice().sort((a, b) => {
      const pa = sub(V[a], fc), pb = sub(V[b], fc);
      return Math.atan2(dot3(pa, e2), dot3(pa, e1)) - Math.atan2(dot3(pb, e2), dot3(pb, e1));
    });
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
  for (const e of edges) if (Math.abs(norm(sub(V[e.v[0]], V[e.v[1]])) - 1) > 1e-9) throw new Error(`${name}: edge length != 1`);
  const edgeIndex = new Map(edges.map((e, i) => [`${e.v[0]},${e.v[1]}`, i]));
  return { name, V, faces: F, normals, faceKind, edges, edgeIndex, center: c };
}
function tetra() {
  const k = 1 / (2 * Math.SQRT2), V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => mul(p, k));
  return finishSolid('tetra', V, [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]], ['tri', 'tri', 'tri', 'tri']);
}
function octa() {
  const k = 1 / Math.SQRT2, V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((p) => mul(p, k));
  const faces = [];
  for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) faces.push([x, y, z]);
  return finishSolid('octa', V, faces, faces.map(() => 'tri'));
}
function cube() {
  const V = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) V.push([x, y, z]);
  const faces = [];
  for (let ax = 0; ax < 3; ax++) for (const s of [-0.5, 0.5]) faces.push(V.map((p, i) => (p[ax] === s ? i : -1)).filter((i) => i >= 0));
  return finishSolid('cube', V, faces, faces.map(() => 'sq'));
}
function bipyramid() {
  const r = 1 / Math.sqrt(3), h = Math.sqrt(2 / 3), V = [];
  for (let i = 0; i < 3; i++) { const t = Math.PI / 2 + i * 2 * Math.PI / 3; V.push([r * Math.cos(t), 0, r * Math.sin(t)]); }
  V.push([0, h, 0], [0, -h, 0]);
  const faces = [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 1, 4], [1, 2, 4], [2, 0, 4]];
  return finishSolid('bipyr', V, faces, faces.map(() => 'tri'));
}
function pentPrism() {
  const R = 1 / (2 * Math.sin(Math.PI / 5)), V = [];
  for (const y of [-0.5, 0.5]) for (let i = 0; i < 5; i++) { const t = i * 2 * Math.PI / 5; V.push([R * Math.cos(t), y, R * Math.sin(t)]); }
  const faces = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], ...[0, 1, 2, 3, 4].map((i) => [i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i])];
  return finishSolid('pentprism', V, faces, ['pent', 'pent', 'sq', 'sq', 'sq', 'sq', 'sq']);
}
function antiprism() {
  const R = 1 / Math.SQRT2, h = Math.sqrt(1 - (2 * R * Math.sin(Math.PI / 8)) ** 2), V = [];
  for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2; V.push([R * Math.cos(t), 0, R * Math.sin(t)]); }
  for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2 + Math.PI / 4; V.push([R * Math.cos(t), h, R * Math.sin(t)]); }
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([i, j, 4 + i], [4 + i, 4 + j, j]); }
  return finishSolid('antiprism', V, faces, faces.map((f) => (f.length === 4 ? 'sq' : 'tri')));
}
function elongatedPyramid() {
  const V = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [0, 1 + 1 / Math.SQRT2, 0]];
  const faces = [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8]];
  return finishSolid('j8', V, faces, faces.map((f) => (f.length === 4 ? 'sq' : 'tri')));
}
function elongatedBipyramid() {
  const r = 1 / Math.sqrt(3), h = Math.sqrt(2 / 3), V = [];
  for (const y of [0, 1]) for (let i = 0; i < 3; i++) { const t = Math.PI / 2 + i * 2 * Math.PI / 3; V.push([r * Math.cos(t), y, r * Math.sin(t)]); }
  V.push([0, -h, 0], [0, 1 + h, 0]);
  const faces = [];
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; faces.push([i, j, 3 + j, 3 + i], [i, j, 6], [3 + i, 3 + j, 7]); }
  return finishSolid('j14', V, faces, faces.map((f) => (f.length === 4 ? 'sq' : 'tri')));
}
function hexPrism() {
  const V = [];
  for (const y of [-0.5, 0.5]) for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; V.push([Math.cos(t), y, Math.sin(t)]); }
  const faces = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11], ...[0, 1, 2, 3, 4, 5].map((i) => [i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i])];
  return finishSolid('hexprism', V, faces, faces.map((f) => (f.length === 4 ? 'sq' : 'hex')));
}
function pentPyramid() {
  const R = 1 / (2 * Math.sin(Math.PI / 5)), h = Math.sqrt(1 - R * R), V = [];
  for (let i = 0; i < 5; i++) { const t = i * 2 * Math.PI / 5; V.push([R * Math.cos(t), 0, R * Math.sin(t)]); }
  V.push([0, h, 0]);
  const faces = [[0, 1, 2, 3, 4], ...[0, 1, 2, 3, 4].map((i) => [i, (i + 1) % 5, 5])];
  return finishSolid('pentpyr', V, faces, ['pent', 'tri', 'tri', 'tri', 'tri', 'tri']);
}

function permutations(n) {
  const out = [], a = [...Array(n).keys()];
  const rec = (k) => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; rec(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  rec(0);
  return out;
}
function fullGroup(S) {
  const n = S.V.length, out = [];
  const D = S.V.map((a) => S.V.map((b) => norm(sub(a, b))));
  const faceKey = (f) => f.slice().sort((x, y) => x - y).join(',');
  const faceIdx = new Map(S.faces.map((f, i) => [faceKey(f), i]));
  const p = new Array(n).fill(-1), used = new Array(n).fill(false);
  const rec = (i) => {
    if (i === n) {
      const facePerm = S.faces.map((f) => faceIdx.get(faceKey(f.map((v) => p[v]))));
      if (facePerm.some((x) => x === undefined)) return;
      const edgePerm = S.edges.map((ed) => { const x = p[ed.v[0]], y = p[ed.v[1]]; return S.edgeIndex.get(x < y ? `${x},${y}` : `${y},${x}`); });
      out.push({ vperm: p.slice(), facePerm, edgePerm });
      return;
    }
    for (let c = 0; c < n; c++) {
      if (used[c]) continue;
      let ok = true;
      for (let j = 0; j < i && ok; j++) if (Math.abs(D[i][j] - D[c][p[j]]) > 1e-6) ok = false;
      if (!ok) continue;
      p[i] = c; used[c] = true; rec(i + 1); used[c] = false; p[i] = -1;
    }
  };
  rec(0);
  return out;
}
function faceLocal(S, fi) {
  const f = S.faces[fi], o = S.V[f[0]], e1 = unit(sub(S.V[f[1]], o)), e2 = cross3(S.normals[fi], e1);
  const out = {};
  for (const v of f) { const r = sub(S.V[v], o); out[v] = [dot3(r, e1), dot3(r, e2)]; }
  return out;
}
export function unfoldS(S, tree) {
  if (!S._local) S._local = S.faces.map((_, fi) => faceLocal(S, fi));
  const L = S._local, nF = S.faces.length, place = new Array(nF).fill(null);
  place[0] = { ...L[0] };
  const treeSet = new Set(tree), queue = [0];
  while (queue.length) {
    const p = queue.shift();
    for (const ei of tree) {
      const e = S.edges[ei];
      if (!e.faces.includes(p)) continue;
      const f = e.faces[0] === p ? e.faces[1] : e.faces[0];
      if (place[f]) continue;
      const [a, b] = e.v, A2 = place[p][a], B2 = place[p][b], la = L[f][a], lb = L[f][b];
      const ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) - Math.atan2(lb[1] - la[1], lb[0] - la[0]);
      const c = Math.cos(ang), s = Math.sin(ang), rot = (q) => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
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
function netTrees(S) {
  const nF = S.faces.length, m = S.edges.length, out = [];
  const rec = (start, chosen) => {
    if (chosen.length === nF - 1) {
      const par = [...Array(nF).keys()], find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
      for (const ei of chosen) { const [f, g] = S.edges[ei].faces; const a = find(f), b = find(g); if (a === b) return; par[a] = b; }
      const U = unfoldS(S, chosen);
      if (!U) return;
      for (let i = 0; i < U.polys.length; i++) for (let j = i + 1; j < U.polys.length; j++) if (overlap(U.polys[i], U.polys[j])) return;
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < m; i++) { chosen.push(i); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  return out;
}

const NEW = { tetra: tetra(), octa: octa(), cube: cube(), bipyr: bipyramid(), pentpyr: pentPyramid(), pentprism: pentPrism(), antiprism: antiprism(), j8: elongatedPyramid(), j14: elongatedBipyramid(), hexprism: hexPrism() };
export const XSOLIDS = { prism: SOLIDS.prism, pyramid: SOLIDS.pyramid, ...NEW };
const LAZY = {};
export function solidInfo(name) {
  if (!LAZY[name]) {
    const S = XSOLIDS[name];
    LAZY[name] = NEW[name]
      ? { S, group: fullGroup(S), trees: netTrees(S) }
      : { S, group: FULL_GROUPS[name], trees: NET_TREES[name] };
  }
  return LAZY[name];
}
const ALLNETS = new Map();
export function allNetTrees(name) { if (!ALLNETS.has(name)) ALLNETS.set(name, netTrees(XSOLIDS[name])); return ALLNETS.get(name); }
