const TAU = Math.PI * 2;
const r1 = (v) => Math.round(v * 10) / 10;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function pd(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function crosses(a, b, c, d) {
  const cr = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cr(c, d, a), d2_ = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0) !== (d2_ > 0)) && ((d3 > 0) !== (d4 > 0));
}
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= n - (k - acc.length); i++) { acc.push(i); yield* combos(n, k, i + 1, acc); acc.pop(); }
}

export function planarFaces(nodes, edges) {
  const E = edges.length, N = nodes.length;
  const adj = Array.from({ length: N }, () => []);
  edges.forEach((e, i) => { adj[e.a].push({ v: e.b, h: 2 * i }); adj[e.b].push({ v: e.a, h: 2 * i + 1 }); });
  const ang = (u, v) => Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x);
  for (let u = 0; u < N; u++) adj[u].sort((p, q) => ang(u, p.v) - ang(u, q.v));
  const from = (h) => (h & 1 ? edges[h >> 1].b : edges[h >> 1].a);
  const to = (h) => (h & 1 ? edges[h >> 1].a : edges[h >> 1].b);
  const face = new Int32Array(2 * E).fill(-1), faces = [];
  for (let h0 = 0; h0 < 2 * E; h0++) {
    if (face[h0] >= 0) continue;
    const f = faces.length, poly = [];
    let h = h0, guard = 0;
    while (face[h] < 0 && guard++ <= 4 * E) {
      face[h] = f; poly.push(nodes[from(h)]);
      const list = adj[to(h)], k = list.findIndex((o) => o.h === (h ^ 1));
      h = list[(k - 1 + list.length) % list.length].h;
    }
    let A = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; A += p.x * q.y - q.x * p.y; }
    faces.push({ poly, area: A / 2 });
  }
  let outer = 0;
  faces.forEach((f, i) => { if (Math.abs(f.area) > Math.abs(faces[outer].area)) outer = i; });
  return { faces, outer, sides: edges.map((_, i) => [face[2 * i], face[2 * i + 1]]) };
}
export function pegFaceOf(F, peg) {
  const sgn = -Math.sign(F.faces[F.outer].area);
  let best = -1;
  F.faces.forEach((f, i) => {
    if (i === F.outer || Math.sign(f.area) !== sgn || !pointInPolygon(peg, f.poly)) return;
    if (best < 0 || Math.abs(f.area) < Math.abs(F.faces[best].area)) best = i;
  });
  return best;
}
function freesByFaces(F, pegFace, edgeIdx) {
  const par = F.faces.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (const i of edgeIdx) { const [p, q] = F.sides[i]; par[find(p)] = find(q); }
  return find(pegFace) === find(F.outer);
}
function shortestRoute(F, pegFace, orange) {
  const nf = F.faces.length, dist = new Array(nf).fill(Infinity), cnt = new Array(nf).fill(0), pred = new Array(nf).fill(-1);
  dist[pegFace] = 0; cnt[pegFace] = 1;
  let frontier = [pegFace];
  while (frontier.length) {
    const next = [];
    for (const f of frontier) for (const i of orange) {
      const [p, q] = F.sides[i];
      if (p === q || (p !== f && q !== f)) continue;
      const g = p === f ? q : p;
      if (dist[g] < dist[f] + 1) continue;
      if (dist[g] === Infinity) { dist[g] = dist[f] + 1; pred[g] = i; next.push(g); }
      cnt[g] = Math.min(2, cnt[g] + cnt[f]);
    }
    frontier = next;
  }
  const o = F.outer, route = [];
  if (cnt[o] === 1) for (let f = o; f !== pegFace;) { const i = pred[f]; route.push(i); const [p, q] = F.sides[i]; f = p === f ? q : p; }
  return { len: dist[o], count: cnt[o], route };
}

function rasterFree(scene, removed) {
  const S = 2, GW = 170, GH = 180, grid = new Uint8Array(GW * GH);
  for (const e of scene.edges) {
    if (e.candidateId != null && removed.has(e.candidateId)) continue;
    const A = scene.nodes[e.a], B = scene.nodes[e.b], n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 0.5);
    for (let k = 0; k <= n; k++) {
      const x = Math.floor((A.x + (B.x - A.x) * k / n) / S), y = Math.floor((A.y + (B.y - A.y) * k / n) / S);
      if (x >= 0 && x < GW && y >= 0 && y < GH) grid[y * GW + x] = 1;
    }
  }
  const start = Math.floor(scene.peg.y / S) * GW + Math.floor(scene.peg.x / S);
  if (grid[start]) return false;
  const stack = [start]; grid[start] = 2;
  while (stack.length) {
    const c = stack.pop(), x = c % GW, y = (c - x) / GW;
    if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) return true;
    for (const d of [c - 1, c + 1, c - GW, c + GW]) if (!grid[d]) { grid[d] = 2; stack.push(d); }
  }
  return false;
}

export function webLayoutOk(scene) {
  const { nodes, edges, peg, candidates } = scene;
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    if (p.x < 22 || p.x > 318 || p.y < 22 || p.y > 338) return false;
    for (let j = i + 1; j < nodes.length; j++) if (d2(p, nodes[j]) < 28) return false;
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], A = nodes[e.a], B = nodes[e.b];
    if (d2(A, B) < (e.candidateId == null ? 36 : 42) || pd(peg, A, B) < 22) return false;
    for (let k = 0; k < nodes.length; k++) if (k !== e.a && k !== e.b && pd(nodes[k], A, B) < 12) return false;
    for (let j = i + 1; j < edges.length; j++) {
      const f = edges[j], shared = [e.a, e.b].find((x) => x === f.a || x === f.b);
      if (shared == null) { if (crosses(A, B, nodes[f.a], nodes[f.b])) return false; continue; }
      const P = nodes[shared], U = nodes[e.a === shared ? e.b : e.a], V = nodes[f.a === shared ? f.b : f.a];
      if (angDist(Math.atan2(U.y - P.y, U.x - P.x), Math.atan2(V.y - P.y, V.x - P.x)) < 25 * Math.PI / 180) return false;
    }
  }
  for (const c of candidates) {
    if (d2(c, peg) < 30) return false;
    if (candidates.some((q) => q !== c && d2(q, c) < 32)) return false;
    if (nodes.some((p) => d2(p, c) < 16)) return false;
    if (edges.some((e) => e.candidateId !== c.id && pd(c, nodes[e.a], nodes[e.b]) < 14)) return false;
  }
  return true;
}

function tryWeb(rng) {
  const c = { x: 170 + rng.int(-4, 4), y: 180 + rng.int(-4, 4) };
  const n = [rng.pick([4, 5]), rng.pick([6, 7]), rng.pick([8, 9])];
  const R = [rng.uniform(48, 54), rng.uniform(94, 102), rng.uniform(132, 140)];
  const rings = n.map((cnt, r) => {
    const a0 = rng.uniform(0, TAU);
    return Array.from({ length: cnt }, (_, i) => {
      const a = a0 + (i + rng.uniform(-0.12, 0.12)) * TAU / cnt, k = rng.uniform(0.97, 1.03);
      return { x: r1(c.x + Math.cos(a) * R[r] * k), y: r1(c.y + Math.sin(a) * R[r] * k) };
    });
  });
  const nodes = rings.flat(), base = [0, n[0], n[0] + n[1]];
  const bearing = (p) => Math.atan2(p.y - c.y, p.x - c.x);
  const edges = [];
  rings.forEach((ring, r) => ring.forEach((_, i) => edges.push({ a: base[r] + i, b: base[r] + (i + 1) % n[r], role: r })));
  const addSpokes = (r, s) => {
    const used = new Set();
    for (const i of rng.shuffle([...Array(n[r]).keys()]).slice(0, s)) {
      const bp = bearing(nodes[base[r] + i]);
      let best = -1, bd = 9;
      for (let j = 0; j < n[r + 1]; j++) { const d = angDist(bp, bearing(nodes[base[r + 1] + j])); if (d < bd) { bd = d; best = j; } }
      if (bd > 0.4 || used.has(best)) return false;
      used.add(best); edges.push({ a: base[r] + i, b: base[r + 1] + best, role: 3 + r });
    }
    return true;
  };
  if (!addSpokes(0, rng.int(3, Math.min(4, n[0]))) || !addSpokes(1, rng.int(4, 5))) return null;
  const peg = { x: c.x, y: c.y };
  const F = planarFaces(nodes, edges);
  if (F.faces.length !== edges.length - nodes.length + 2) return null;
  const pegFace = pegFaceOf(F, peg);
  if (pegFace < 0) return null;
  const K = rng.int(3, 4), routes = [];
  const walk = (f, used, path) => {
    if (path.length === K) { if (f === F.outer) routes.push(path.slice()); return; }
    if (f === F.outer) return;
    edges.forEach((_, i) => {
      const [p, q] = F.sides[i];
      if (p === q || (p !== f && q !== f)) return;
      const g = p === f ? q : p;
      if (used.has(g)) return;
      used.add(g); path.push(i); walk(g, used, path); path.pop(); used.delete(g);
    });
  };
  walk(pegFace, new Set([pegFace]), []);
  if (!routes.length) return null;
  const route = rng.pick(routes);
  const orange = new Set(route), M = rng.int(11, 13);
  for (const i of rng.shuffle(edges.map((_, i) => i).filter((i) => !orange.has(i)))) {
    if (orange.size >= M) break;
    orange.add(i);
    const sr = shortestRoute(F, pegFace, [...orange]);
    if (sr.len !== K || sr.count !== 1) orange.delete(i);
  }
  if (orange.size < M) return null;
  const roleCount = (r) => [...orange].filter((i) => edges[i].role === r).length;
  if (roleCount(0) < 2 || roleCount(1) < 2 || roleCount(2) < 3) return null;
  if (![...orange].some((i) => edges[i].role >= 3 && !route.includes(i))) return null;
  const touches = (i, j) => edges[i].a === edges[j].a || edges[i].a === edges[j].b || edges[i].b === edges[j].a || edges[i].b === edges[j].b;
  if (!route.every((i) => [...orange].some((j) => !route.includes(j) && touches(i, j)))) return null;
  const mid = (i) => ({ x: (nodes[edges[i].a].x + nodes[edges[i].b].x) / 2, y: (nodes[edges[i].a].y + nodes[edges[i].b].y) / 2 });
  const spread = (t) => Math.max(angDist(bearing(mid(t[0])), bearing(mid(t[1]))), angDist(bearing(mid(t[1])), bearing(mid(t[2]))));
  const byRole = [0, 1, 2].map((r) => [...orange].filter((i) => edges[i].role === r));
  const ansT = [0, 1, 2].map((r) => route.find((i) => edges[i].role === r));
  if (ansT.some((i) => i == null)) return null;
  const ansSpread = spread(ansT);
  let rival = false;
  for (const a of byRole[0]) for (const b of byRole[1]) for (const d of byRole[2]) {
    if (a === ansT[0] && b === ansT[1] && d === ansT[2]) continue;
    if (spread([a, b, d]) <= ansSpread + 1e-9) rival = true;
  }
  if (!rival) return null;
  const oIdx = rng.shuffle([...orange]);
  const sceneEdges = edges.filter((_, i) => !orange.has(i)).map((e) => ({ a: e.a, b: e.b, candidateId: null }))
    .concat(oIdx.map((i, id) => ({ a: edges[i].a, b: edges[i].b, candidateId: id })));
  const candidates = oIdx.map((i, id) => ({ id, x: r1(mid(i).x), y: r1(mid(i).y), hitRadius: 16, release: route.includes(i) }));
  return { nodes, edges: sceneEdges, candidates, peg, removeCount: K };
}
export function buildWebScene(rng) {
  for (let t = 0; t < 120; t++) {
    const s = tryWeb(rng);
    if (s && webLayoutOk(s)) return s;
  }
  return null;
}

export function validateWebScene(scene, answer) {
  const K = scene.removeCount, cs = scene.candidates;
  if (!Array.isArray(answer) || answer.length !== K || ![3, 4].includes(K) || cs.length < 11) return false;
  if (!webLayoutOk(scene)) return false;
  const F = planarFaces(scene.nodes, scene.edges);
  if (F.faces.length !== scene.edges.length - scene.nodes.length + 2) return false;
  const pegFace = pegFaceOf(F, scene.peg);
  if (pegFace < 0) return false;
  const eOf = cs.map((c) => scene.edges.findIndex((e) => e.candidateId === c.id));
  if (eOf.some((i) => i < 0)) return false;
  if (eOf.some((i) => F.sides[i][0] === F.sides[i][1])) return false;
  for (const s of combos(cs.length, K - 1)) if (freesByFaces(F, pegFace, s.map((id) => eOf[id]))) return false;
  let works = null;
  for (const s of combos(cs.length, K)) {
    if (!freesByFaces(F, pegFace, s.map((id) => eOf[id]))) continue;
    if (works) return false;
    works = s;
  }
  if (!works || works.join() !== answer.slice().sort((a, b) => a - b).join()) return false;
  if (!rasterFree(scene, new Set(answer))) return false;
  for (const id of answer) if (rasterFree(scene, new Set(answer.filter((x) => x !== id)))) return false;
  return true;
}
