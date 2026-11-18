import { XSOLIDS, solidInfo, unfoldS } from './_solid_nets.js';
export { unfoldS };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
function cupola3() {
  const h = Math.sqrt(2 / 3), r = 1 / Math.sqrt(3), V = [];
  for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; V.push([Math.cos(t), 0, Math.sin(t)]); }
  for (let i = 0; i < 3; i++) { const t = Math.PI / 6 + i * 2 * Math.PI / 3; V.push([r * Math.cos(t), h, r * Math.sin(t)]); }
  const faces = [[0, 1, 2, 3, 4, 5], [6, 7, 8]];
  for (let i = 0; i < 3; i++) {
    const a = 2 * i, b = 2 * i + 1, c = (2 * i + 2) % 6, t = 6 + i, u = 6 + ((i + 1) % 3);
    faces.push([a, b, t]);
    faces.push([b, c, u, t]);
  }
  return finishSolid('j3', V, faces, faces.map((f) => (f.length === 6 ? 'hex' : f.length === 4 ? 'sq' : 'tri')));
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

const J3 = cupola3();
export const HSOLIDS = { j8: XSOLIDS.j8, j14: XSOLIDS.j14, j3: J3 };
const LAZY = {};
export function hInfo(name) {
  if (!LAZY[name]) LAZY[name] = name === 'j3' ? { S: J3, group: fullGroup(J3), trees: netTrees(J3) } : solidInfo(name);
  return LAZY[name];
}
