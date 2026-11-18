import * as S from './_who_knocked_vase_scene.js';

const RT = S.RT, DEG = Math.PI / 180;
export const NAME = 'who_knocked_vase';
export const GATE = {
  T: [15, 20], hold: [0.8, 1.5], delay: [0.3, 0.6], n: 4,
  nMax: 6,
  Tbig: 24,
  clearD4: 0.3,
  d4Gap: [0.34, 0.4],
  rHit: 0.14,
  touch: 0.02,
  clearD1: 0.8,
  clearD: 0.75,
  clearAll: 0.7,
  winD1: [2.0, 0.6],
  clearK: 0.3,
  kGap: 1,
  d1Over: 3,
  sep: 0.5,
  visVase: 0.6, visK: 0.5, visSeat: 0.6,
  seatedBy: 1.2,
  scale: [62, 100],
  dt: 0.05,
};
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nrm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
export const STATS = {};
export const DBG = {};
const fail = (k) => { STATS[k] = (STATS[k] || 0) + 1; return null; };
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

const SHIRTS = ['#c63c2e', '#2f68b8', '#e2b52a', '#3c9a4c', '#8650b8', '#ea7a1e', '#2aa3a8', '#efebe3', '#2e2f33', '#d9709f'];
const PANTS = ['#3a3e4a', '#5a4a3a', '#2a3a5a', '#6a6a60', '#4a3a3a', '#7a7468', '#20232a'];
const SKINS = ['#e9c4a2', '#d9a77f', '#b07a52', '#8a5a3a', '#f0d0b0'];
const HAIRC = ['#2a1e16', '#4a3020', '#7a5a3a', '#1a1a1a', '#b08a5a', '#8c8a86'];
const SHOES = ['#2a2624', '#ece9e2', '#6a3a22'];
const SEATC = ['#7a8fa8', '#b8a07a', '#8a6060', '#5f7a6c', '#c8c0b0', '#55607a', '#9a8f84'];
const WALLS = ['#ebe5da', '#e3e8e6', '#efe6d8', '#e6e2ea', '#e9e0d3'];
const PICS = [['#9cc2dc', '#e8e0c8', '#6a8a4a'], ['#e8b080', '#f0d8a0', '#5a6a8a'], ['#a8c8e8', '#f4f0e0', '#c8a060']];
const RUGS = [['#9a3a3a', '#d8c8a8'], ['#3a5a7a', '#e0d8c8'], ['#5a7a4a', '#e8e0c8'], ['#7a5a8a', '#e8dcc8']];
const VASES = [['#2f5fa8', '#e8e2d4'], ['#8fbfa8', '#f0ece2'], ['#c0643c', '#3a2a20'], ['#ece8df', '#2f5fa8'], ['#d4a23a', '#5a3a1a'], ['#b8d4e8', '#2f5fa8']];
const BLOOMS = [['#e8443a', '#f4f1ea'], ['#f2c230', '#e86a8a'], ['#fbfaf6', '#c03a5a'], ['#9a5ac8', '#f4f1ea']];
function lab(hex) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
  const X = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.9505, Y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, Z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.089;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

const G0 = -1.5, GN = 110, GS = 0.1;
export function baseGrid(m) {
  const N = GN * GN, base = new Uint8Array(N), tdist = new Float32Array(N), zone = new Uint8Array(N), foot = new Uint8Array(N), T = m.table;
  const tc = Math.cos(T.yaw * DEG), ts = Math.sin(T.yaw * DEG), hx = T.L / 2, hz = T.D / 2;
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
    const x = G0 + (i + 0.5) * GS, z = G0 + (j + 0.5) * GS, c = i * GN + j;
    let w = false;
    if (x >= 0.3 && z >= 0.3) {
      const dx = x - T.x, dz = z - T.z, u = Math.max(0, Math.abs(dx * tc - dz * ts) - hx), v = Math.max(0, Math.abs(dx * ts + dz * tc) - hz);
      tdist[c] = Math.hypot(u, v);
      w = true;
      for (const D of m.decor) if (Math.hypot(x - D.x, z - D.z) < 0.48) { w = false; break; }
    } else {
      for (const D of m.doors) {
        const along = D.wall === 'z' ? x : z, across = D.wall === 'z' ? z : x, dc = (D.a0 + D.a1) / 2;
        if (Math.abs(along - dc) <= 0.22 && across >= -1.0 && across <= 0.4) w = true;
        if (across >= -0.85 && across <= -0.4 && Math.abs(along - dc) <= 1.6) w = true;
      }
      tdist[c] = 99;
    }
    base[c] = w ? 1 : 0;
  }
  m.seats.forEach((Q, k) => {
    const c = Math.cos(Q.yaw * DEG), sn = Math.sin(Q.yaw * DEG), hw = Q.w / 2, hd = Q.d / 2, R = Math.hypot(hw + 0.2, hd + 0.3) + 0.1;
    const i0 = Math.max(0, Math.floor((Q.x - R - G0) / GS)), i1 = Math.min(GN - 1, Math.ceil((Q.x + R - G0) / GS));
    const j0 = Math.max(0, Math.floor((Q.z - R - G0) / GS)), j1 = Math.min(GN - 1, Math.ceil((Q.z + R - G0) / GS));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const dx = G0 + (i + 0.5) * GS - Q.x, dz = G0 + (j + 0.5) * GS - Q.z, u = dx * c - dz * sn, v = dx * sn + dz * c, cc = i * GN + j;
      if (Math.abs(u) < hw + 0.2 && v > -hd - 0.2 && v < hd + 0.3) zone[cc] |= 1 << k;
      if (Math.abs(u) < hw + 0.05 && v > -hd - 0.05 && v < hd - 0.02) foot[cc] |= 1 << k;
    }
  });
  return { base, tdist, zone, foot, cache: {}, nSeat: m.seats.length };
}
function vaseShadowMask(m, BG, cam, free = []) {
  const V = m.vase, T = m.table, TP = { x: T.x, z: T.z, yaw: T.yaw }, b = S.toWorld(TP, V.lx, V.lz);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [dx, dy, dz] of [[V.rb, 0, 0], [-V.rb, 0, 0], [0, 0, V.rb], [0, 0, -V.rb], [0, V.H + V.flTop, 0], [0.08, V.H + V.flTop, 0], [-0.08, V.H + V.flTop, 0]]) {
    const q = cam.project(b[0] + dx, T.h + dy, b[1] + dz); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  const mask = new Uint8Array(GN * GN);
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
    const x = G0 + (i + 0.5) * GS, z = G0 + (j + 0.5) * GS;
    if (!BG.base[i * GN + j]) continue;
    const f = cam.project(x, 0, z);
    if (f.z <= 0.3 || f.y < y0 - 5) continue;
    const h = cam.project(x, 1.9, z);
    const hw = 0.32 * cam.f / f.z;
    if (free.some((p) => Math.hypot(x - p[0], z - p[1]) < 0.3)) continue;
    if (f.x + hw > x0 - 5 && f.x - hw < x1 + 5 && f.y > y0 - 5 && h.y < y1 + 5) mask[i * GN + j] = 1;
  }
  BG.vmask = mask;
}
function gridOf(BG, clear, own, masked = false) {
  const key = `${clear}|${own}|${masked}`;
  if (BG.cache[key]) return BG.cache[key];
  const N = GN * GN, ok = new Uint8Array(N), full = (1 << BG.nSeat) - 1, om = own >= 0 ? (full & ~(1 << own)) : full, fm = own >= 0 ? 1 << own : 0, vm = masked ? BG.vmask : null;
  for (let c = 0; c < N; c++) ok[c] = BG.base[c] && BG.tdist[c] > clear && !(BG.zone[c] & om) && !(BG.foot[c] & fm) && !(vm && vm[c]) ? 1 : 0;
  ok.key = key;
  return (BG.cache[key] = ok);
}
const cellOf = (p) => [Math.floor((p[0] - G0) / GS), Math.floor((p[1] - G0) / GS)];
const walkable = (g, p) => { const [i, j] = cellOf(p); return i >= 0 && j >= 0 && i < GN && j < GN && g[i * GN + j] === 1; };
function los(g, a, b) {
  const L = hyp(a, b), n = Math.max(1, Math.ceil(L / 0.04));
  for (let k = 0; k <= n; k++) { const u = k / n; if (!walkable(g, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])) return false; }
  return true;
}
function planPath(g, a, b) {
  if (!walkable(g, a) || !walkable(g, b)) return null;
  if (los(g, a, b)) return [a, b];
  const [si, sj] = cellOf(a), [ti, tj] = cellOf(b), N = GN * GN, tgt = ti * GN + tj;
  const gs = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const hk = [], hv = [];
  const hpush = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const hpop = () => { const v = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let mi = i; if (l < hk.length && hk[l] < hk[mi]) mi = l; if (r < hk.length && hk[r] < hk[mi]) mi = r; if (mi === i) break; [hk[mi], hk[i]] = [hk[i], hk[mi]]; [hv[mi], hv[i]] = [hv[i], hv[mi]]; i = mi; } } return v; };
  const hfun = (c) => { const i = (c / GN) | 0, j = c % GN, di = Math.abs(i - ti), dj = Math.abs(j - tj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
  gs[si * GN + sj] = 0; hpush(hfun(si * GN + sj), si * GN + sj);
  let found = false;
  while (hk.length) {
    const c = hpop();
    if (closed[c]) continue; closed[c] = 1;
    if (c === tgt) { found = true; break; }
    const i = (c / GN) | 0, j = c % GN;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
      const nc = ni * GN + nj; if (!g[nc] || closed[nc]) continue;
      if (di && dj && (!g[(i + di) * GN + j] || !g[i * GN + j + dj])) continue;
      const ng = gs[c] + (di && dj ? 1.414 : 1);
      if (ng < gs[nc]) { gs[nc] = ng; par[nc] = c; hpush(ng + hfun(nc), nc); }
    }
  }
  if (!found) return null;
  const cells = []; for (let c = tgt; c >= 0; c = par[c]) cells.push(c);
  cells.reverse();
  const raw = [a, ...cells.slice(1, -1).map((c) => [G0 + (((c / GN) | 0) + 0.5) * GS, G0 + (c % GN + 0.5) * GS]), b];
  const out = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !los(g, raw[i], raw[j])) j--;
    out.push(raw[j]); i = j;
  }
  return out;
}
function roundCorners(pts, keep = new Set()) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (keep.has(i)) { out.push(b); continue; }
    const la = hyp(a, b), lc = hyp(b, c), d = Math.min(0.35, la / 2.2, lc / 2.2);
    const u = nrm2([a[0] - b[0], a[1] - b[1]]), v = nrm2([c[0] - b[0], c[1] - b[1]]);
    if (d < 0.05 || u[0] * v[0] + u[1] * v[1] < -0.985) { out.push(b); continue; }
    const p0 = [b[0] + u[0] * d, b[1] + u[1] * d], p1 = [b[0] + v[0] * d, b[1] + v[1] * d];
    for (let k = 0; k <= 4; k++) { const t = k / 4, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t; out.push([w0 * p0[0] + w1 * b[0] + w2 * p1[0], w0 * p0[1] + w1 * b[1] + w2 * p1[1]]); }
  }
  out.push(pts[pts.length - 1]);
  const ded = [out[0]];
  for (const p of out.slice(1)) if (hyp(p, ded[ded.length - 1]) > 1e-4) ded.push(p);
  return ded;
}
function arcAt(pts, P) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { if (i > 0) s += hyp(pts[i], pts[i - 1]); if (hyp(pts[i], P) < 1e-6) return s; }
  return -1;
}
const r3p = (p) => [r3(p[0]), r3(p[1])];

function camNorm(b, p) { const d = S.sub3(p, b.eye), zc = S.dot3(d, b.F); return [S.dot3(d, b.R) / zc, -S.dot3(d, b.U) / zc, zc]; }
function standPts(p, k = 1.08) { return [[p[0], 0, p[1]], [p[0], 1.86 * k / 1.08, p[1]], [p[0] + 0.25, 1.4, p[1]], [p[0] - 0.25, 1.4, p[1]], [p[0], 1.4, p[1] + 0.25], [p[0], 1.4, p[1] - 0.25]]; }
function fitCam(B, pts, pad = 10) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) { const [u, v, z] = camNorm(B, p); if (z <= 0.3) return null; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = S.VIEW.w, H = S.VIEW.h, f = Math.min((W - 2 * pad) / (u1 - u0), (H - 2 * pad) / (v1 - v0));
  return { f: r2(f), cx: r2(W / 2 - f * (u0 + u1) / 2), cy: r2(H / 2 - f * (v0 + v1) / 2) };
}

function clashAt(a, b) {
  if (!a || !b || (a.seated && b.seated)) return false;
  if (hyp(S.bodyFloor(a), S.bodyFloor(b)) < GATE.sep) return true;
  for (const [x, y] of [[a, b], [b, a]]) if (x.seated && !y.seated) { const k = [x.sit.S[0] + x.f[0] * 0.45, x.sit.S[1] + x.f[1] * 0.45]; if (hyp(k, S.bodyFloor(y)) < 0.4) return true; }
  return false;
}
const TRACKS = new WeakMap();
function trackOf(m, i) {
  const segs = m.people[i].segs;
  let tr = TRACKS.get(segs);
  if (tr) return tr;
  const end = segs[segs.length - 1].t0 + S.TURN_T + S.SIT_T + 0.2, n = Math.ceil(end / 0.1) + 1;
  tr = new Array(n);
  for (let k = 0; k < n; k++) {
    const B = S.personAt(m, i, k * 0.1);
    if (!B) { tr[k] = null; continue; }
    const f = S.bodyFloor(B);
    tr[k] = B.seated ? [f[0], f[1], 1, B.sit.S[0] + B.f[0] * 0.45, B.sit.S[1] + B.f[1] * 0.45] : [f[0], f[1], 0, 0, 0];
  }
  TRACKS.set(segs, tr);
  return tr;
}
export function pairClash(m, i, j) {
  if (!m.people[i].segs.length || !m.people[j].segs.length) return false;
  const a = trackOf(m, i), b = trackOf(m, j), n = Math.max(a.length, b.length);
  const at = (t, k) => (k < t.length ? t[k] : t[t.length - 1]);
  for (let k = 0; k < n; k++) {
    const p = at(a, k), q = at(b, k);
    if (!p || !q || (p[2] && q[2])) continue;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < GATE.sep) return true;
    if (p[2] && Math.hypot(p[3] - q[0], p[4] - q[1]) < 0.4) return true;
    if (q[2] && Math.hypot(q[3] - p[0], q[4] - p[1]) < 0.4) return true;
  }
  return false;
}
export function sepProblem(m, dt = 0.1) {
  const R = m.roles, name = (q) => Object.keys(R).find((k) => R[k] === q);
  const tEnd = Math.max(...m.people.map((p) => { const s = p.segs[p.segs.length - 1]; return s.t0 + S.TURN_T + S.SIT_T + 0.2; }));
  for (let t = 0; t <= tEnd; t += dt) {
    const B = m.people.map((p, i) => S.personAt(m, i, t));
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (!a || !b || (a.seated && b.seated)) continue;
      const fa = S.bodyFloor(a), fb = S.bodyFloor(b);
      let bad = hyp(fa, fb) < GATE.sep;
      for (const [x, y] of [[a, b], [b, a]]) if (x.seated && !y.seated) { const k = [x.sit.S[0] + x.f[0] * 0.45, x.sit.S[1] + x.f[1] * 0.45]; if (hyp(k, S.bodyFloor(y)) < 0.4) bad = true; }
      if (bad) return [name(i), name(j)].sort().join('-');
    }
  }
  return null;
}
const SEAT_KIND = { armchair: { w: [0.74, 0.82], y: [0.42, 0.45] }, chair: { w: [0.46, 0.48], y: [0.45, 0.47] }, ottoman: { w: [0.5, 0.58], y: [0.42, 0.45] } };
export function tryBuild(rng, plan = {}) {
  const U = rng.uniform;
  const N = plan.n ?? 4;
  const m = { task: NAME, version: 1, live: true };
  const az = U(20, 40), el = U(24, 30), dist = U(6.2, 7.0);
  const Fh = [-Math.sin(az * DEG), -Math.cos(az * DEG)], Rh = [Math.cos(az * DEG), -Math.sin(az * DEG)];
  const dirPhi = (phi) => [Fh[0] * Math.cos(phi * DEG) + Rh[0] * Math.sin(phi * DEG), Fh[1] * Math.cos(phi * DEG) + Rh[1] * Math.sin(phi * DEG)];
  const C = [r3(U(2.7, 3.4)), r3(U(2.7, 3.4))];
  const ax = rot2(Fh, U(-28, 28) * DEG), yaw = r2(Math.atan2(-ax[1], ax[0]) / DEG);
  m.table = { x: C[0], z: C[1], yaw, L: r3(U(1.3, 1.6)), D: r3(U(0.4, 0.48)), h: r3(U(0.76, 0.84)), wood: Math.floor(rng.raw() * S.WOODS.length) };
  const T = m.table, TP = { x: T.x, z: T.z, yaw: T.yaw }, { a: TA, b: TB } = S.axesOf(T.yaw);
  const L2W = (lx, lz) => S.toWorld(TP, lx, lz), D2W = (lx, lz) => [TA[0] * lx + TB[0] * lz, TA[1] * lx + TB[1] * lz];
  const tl = lab(S.WOODS[T.wood][0])[0], vOk = VASES.filter((c) => Math.abs(lab(c[0])[0] - tl) >= 22), vc = rng.pick(vOk.length ? vOk : VASES), bl = rng.pick(BLOOMS);
  const V = { H: r3(U(0.5, 0.6)), rb: r3(U(0.09, 0.112)), hb: r3(U(0.14, 0.175)), rf: r3(U(0.058, 0.07)), rn: r3(U(0.034, 0.044)), col: vc[0], col2: vc[1], bloom: bl, flowers: [] };
  for (let i = 0; i < 3; i++) { const g = i * 2.094 + U(-0.4, 0.4), rr = U(0.03, 0.07); V.flowers.push({ dx: r3(rr * Math.cos(g)), dz: r3(rr * Math.sin(g)), h: r3(U(0.14, 0.24)), r: r3(U(0.036, 0.046)), col: i % 2 }); }
  V.flTop = r3(Math.max(...V.flowers.map((f) => f.h + f.r)));
  const sideK = rng.sign();
  V.lx = r3(-T.L / 2 + U(0.17, 0.25)); V.lz = r3(-sideK * U(0.0, 0.04));
  const g0 = U(28, 42) * DEG, offLos = (g) => { const w = [TA[0] * Math.cos(g) + TB[0] * Math.sin(g), TA[1] * Math.cos(g) + TB[1] * Math.sin(g)]; return Math.acos(Math.max(-1, Math.min(1, w[0] * Fh[0] + w[1] * Fh[1]))) / DEG; };
  const gam = offLos(g0) >= 40 && offLos(-g0) >= 40 ? rng.sign() * g0 : offLos(g0) > offLos(-g0) ? g0 : -g0;
  if (offLos(gam) < 35) return fail('vase-dir');
  V.ux = r3(Math.cos(gam)); V.uz = r3(Math.sin(gam));
  { const len = V.H + V.flTop;
    if (V.lx + len * Math.cos(gam) > T.L / 2 - 0.02 || Math.abs(V.lz + V.hb * 1.2 * Math.sin(gam)) > T.D / 2 - 0.03) return fail('vase-fit'); }
  m.vase = V;
  let tb = 0;
  const F = { delay: r3(U(GATE.delay[0], GATE.delay[1])), P: r3(U(0.42, 0.55)), nC: rng.raw() < 0.5 ? 2 : 3, sign0: rng.sign(), A0: r2(U(6, 8)), A1: r2(U(15, 20)), Df: r3(U(0.38, 0.5)), bounce: r2(U(5, 9)) };
  F.W = r3((F.nC + (F.sign0 > 0 ? 0.25 : 0.75)) * F.P); F.rest = r3(S.restAngle(V));
  m.fall = F;
  const sectors = N === 4 ? rng.shuffle([[[-150, -105], [-70, -25], [25, 70], [105, 150]], [[-150, -105], [-60, -15], [15, 60], [105, 150]], [[-140, -95], [-55, -10], [30, 80], [110, 155]]])[0]
    : rng.shuffle(N === 5 ? [[[-155, -120], [-95, -62], [-45, -15], [20, 55], [100, 150]], [[-150, -105], [-75, -45], [-30, 5], [35, 70], [110, 155]], [[-150, -110], [-80, -40], [30, 65], [85, 120], [130, 160]]]
      : [[[-160, -128], [-105, -76], [-58, -26], [26, 58], [76, 105], [128, 160]], [[-155, -122], [-100, -70], [-55, -22], [22, 55], [70, 100], [122, 155]]])[0];
  m.seats = [];
  for (const [p0, p1] of sectors) {
    let ok = null;
    for (let tr = 0; tr < 25 && !ok; tr++) {
      const phi = U(p0, p1), want = U(1.5, 2.0), d = dirPhi(phi);
      let r = 0.3; while (r < 4 && S.rectDist(TP, T.L / 2, T.D / 2, C[0] + d[0] * r, C[1] + d[1] * r) < want) r += 0.02;
      const pos = [C[0] + d[0] * r, C[1] + d[1] * r];
      const fc = rot2(nrm2([C[0] - pos[0], C[1] - pos[1]]), U(-15, 15) * DEG);
      const away = fc[0] * Fh[0] + fc[1] * Fh[1] > 0.3;
      const kind = away ? (rng.raw() < 0.6 ? 'ottoman' : 'chair') : (rng.raw() < 0.55 ? 'armchair' : 'chair');
      const K = SEAT_KIND[kind], w = r3(U(K.w[0], K.w[1]));
      const rad = w * 0.75;
      if (pos[0] < 0.3 + rad || pos[1] < 0.3 + rad) continue;
      if (m.seats.some((q) => hyp([q.x, q.z], pos) < 1.05 + (q.w + w) / 4)) continue;
      ok = { x: r3(pos[0]), z: r3(pos[1]), yaw: r2(Math.atan2(fc[0], fc[1]) / DEG), kind, w, d: w, seatY: r3(U(K.y[0], K.y[1])), mi: m.seats.length, col: rng.pick(SEATC) };
    }
    if (!ok) return fail('seat');
    m.seats.push(ok);
  }
  m.doors = [];
  const doorClear = (D) => m.seats.every((q) => { const p = D.wall === 'z' ? [(D.a0 + D.a1) / 2, 0.3] : [0.3, (D.a0 + D.a1) / 2]; return hyp([q.x, q.z], p) > 1.05; });
  for (const wall of rng.raw() < 0.7 ? ['z', 'x'] : ['x', 'z']) {
    for (let tr = 0; tr < 10 && !m.doors.length; tr++) {
      const c = Math.max(0.9, (wall === 'z' ? C[0] : C[1]) + U(-1.8, 1.2)), D = { wall, a0: r2(c - 0.45), a1: r2(c + 0.45), y1: 2.05 };
      if (doorClear(D)) m.doors.push(D);
    }
    if (m.doors.length) break;
  }
  if (!m.doors.length) return fail('door');
  m.door = m.doors[0];
  m.doors = [m.door];
  m.decor = [];
  { const cand = { kind: rng.raw() < 0.6 ? 'plant' : 'lamp', x: r2(U(0.4, 0.6)), z: r2(U(0.4, 0.6)) };
    if (m.seats.every((q) => hyp([q.x, q.z], [cand.x, cand.z]) > 0.9) && m.doors.every((D) => (D.wall === 'z' ? Math.abs(cand.x - (D.a0 + D.a1) / 2) : Math.abs(cand.z - (D.a0 + D.a1) / 2)) > 0.9)) m.decor.push(cand); }
  m.room = {
    wall: rng.pick(WALLS), floorDark: rng.pick(['#96693f', '#8a6040', '#a07a52']), floorLight: rng.pick(['#cfa577', '#d8b88e', '#c89a6a']), floorRot: rng.raw() < 0.5 ? 1 : 0,
    pic: rng.pick(PICS), legWood: Math.floor(rng.raw() * S.WOODS.length), rug: null, picture: null,
  };
  if (rng.raw() < 0.5) { const rc = rng.pick(RUGS); m.room.rug = { x: T.x, z: T.z, yaw: T.yaw, hw: r2(T.L / 2 + U(0.3, 0.45)), hd: r2(T.D / 2 + U(0.3, 0.45)), c0: rc[0], c1: rc[1] }; }
  { const onZ = m.door.wall === 'x', c = onZ ? C[0] + U(-0.8, 0.8) : C[1] + U(-0.8, 0.8), w = U(0.55, 0.8);
    const P = { wall: onZ ? 'z' : 'x', a0: r2(c - w / 2), a1: r2(c + w / 2), y0: r2(U(1.25, 1.45)), y1: 0 }; P.y1 = r2(P.y0 + w * 0.72); if (P.a0 > 0.3) m.room.picture = P; }
  const ld = [Rh[0] * U(0.25, 0.6) - Fh[0] * U(0.4, 0.8), 1.0, Rh[1] * U(0.25, 0.6) - Fh[1] * U(0.4, 0.8)];
  m.light = { dir: ld.map(r3), fill: [r3(-Rh[0] * 0.6), 0.35, r3(-Rh[1] * 0.6)] };
  const shirts = [];
  for (const c of rng.shuffle(SHIRTS)) if (shirts.length < N && shirts.every((q) => dE(q, c) >= (N > 4 ? 26 : 32))) shirts.push(c);
  if (shirts.length < N) return fail('shirts');
  m.people = shirts.map((top) => ({
    top, bottom: rng.pick(PANTS), skin: rng.pick(SKINS), hairCol: rng.pick(HAIRC), hair: rng.pick(['short', 'short', 'long', 'bun']), shoe: rng.pick(SHOES),
    k: r3(U(1.62, 1.86) / 1.7), v: r3(U(0.95, 1.2)), ph0: r3(U(0, 6.283)), segs: [], looks: [],
  }));
  const ids = rng.shuffle(Array.from({ length: N }, (_, i) => i));
  const role = { K: ids[0], D1: ids[1], D2: ids[2], D3: ids[3] };
  if (N >= 5) role[plan.closePass ? 'D4' : 'D5'] = ids[4];
  if (N >= 6) role.D6 = ids[5];
  m.answer = role.K; m.roles = role;
  const seatOf = rng.shuffle(Array.from({ length: N }, (_, i) => i));
  m.people.forEach((p, i) => { p.seat = seatOf[i]; });
  const BG = baseGrid(m), CL = { K: GATE.clearK, D1: GATE.clearD1 + 0.06, D: GATE.clearAll + 0.06 };
  const gK = gridOf(BG, -1, m.people[role.K].seat);
  const gD1 = gridOf(BG, CL.D1, m.people[role.D1].seat);
  const chain = (g, pts) => pts.every((p, i) => walkable(g, p) && (i === 0 || los(g, pts[i - 1], p)));
  const pK = m.people[role.K], rHit = GATE.rHit * pK.k;
  let KG = null;
  for (let tr = 0; tr < 12 && !KG; tr++) {
    const sK = sideK, alpha = U(5, 13) * DEG;
    const Qloc = [T.L / 2, sK * T.D / 2], nloc = [Math.sin(alpha), sK * Math.cos(alpha)], dloc = [Math.cos(alpha), -sK * Math.sin(alpha)];
    const Pc = L2W(Qloc[0] + nloc[0] * rHit, Qloc[1] + nloc[1] * rHit), dK = D2W(...dloc), nK = D2W(...nloc);
    const sB = (T.L + U(0.35, 0.75)) / Math.cos(alpha), sA = U(0.5, 0.85), be = alpha + U(5, 15) * DEG;
    const dOut = [dK[0] * Math.cos(be) + nK[0] * Math.sin(be), dK[1] * Math.cos(be) + nK[1] * Math.sin(be)];
    const kStart = [Pc[0] - dK[0] * sB, Pc[1] - dK[1] * sB], kEnd = [Pc[0] + dOut[0] * sA, Pc[1] + dOut[1] * sA];
    const gKe = gridOf(BG, CL.K, pK.seat);
    if (!walkable(gKe, kStart)) { fail('kg:start'); continue; }
    if (!walkable(gridOf(BG, 0.55, pK.seat), kEnd)) { fail('kg:end'); continue; }
    if (!chain(gK, [kStart, Pc, kEnd])) { fail('kg:chain'); continue; }
    KG = { sK, alpha, Qloc, Pc, dK, nK, kStart, kEnd };
  }
  if (!KG) return fail('k-geom');
  const { Pc, dK, nK, kStart, kEnd, Qloc } = KG;
  const push = nrm2([0.7 * dK[0] - 0.3 * nK[0], 0.7 * dK[1] - 0.3 * nK[1]]);
  const Qw = L2W(...Qloc), q1 = S.toWorld({ ...TP, yaw: T.yaw + 1 }, ...Qloc), dq = [q1[0] - Qw[0], q1[1] - Qw[1]];
  const rotSign = Math.sign(dq[0] * push[0] + dq[1] * push[1]) || 1;
  m.bump = { tb: 0, corner: Qloc.map(r3), side: KG.sK, push: push.map(r3), D: r3(U(0.06, 0.09)), rot: r2(rotSign * U(4, 7)), Pc: r3p(Pc), alpha: r2(KG.alpha / DEG) };
  const Vf = L2W(V.lx, V.lz);
  const Bc = S.camBasis(az, el, dist, [C[0], 0.6, C[1]]);
  const toCam = nrm2([Bc.eye[0] - Vf[0], Bc.eye[2] - Vf[1]]);
  let P1 = null, Ps = null, d1Start = null, dD1 = null;
  for (let tr = 0; tr < 16 && !Ps; tr++) {
    const c1 = U(GATE.clearD1 + 0.08, GATE.clearD1 + 0.35);
    let tcr = 0; while (tcr < 4 && S.rectDist(TP, T.L / 2, T.D / 2, Vf[0] + toCam[0] * tcr, Vf[1] + toCam[1] * tcr) < c1) tcr += 0.01;
    const p1 = [Vf[0] + toCam[0] * tcr, Vf[1] + toCam[1] * tcr];
    const lat = [-toCam[1], toCam[0]], sgD = rng.sign(), dd = rot2([lat[0] * sgD, lat[1] * sgD], U(-22, 22) * DEG);
    const e1 = U(0.35, 0.7), e0 = U(0.7, 1.2);
    const ps = [p1[0] + dd[0] * e1, p1[1] + dd[1] * e1], d0 = [p1[0] - dd[0] * e0, p1[1] - dd[1] * e0];
    if (!chain(gD1, [d0, p1, ps])) continue;
    P1 = p1; Ps = ps; d1Start = d0; dD1 = dd;
  }
  if (!Ps) return fail('d1-geom');
  const passes = {};
  const passers = ['D2', 'D3', 'D5', 'D6'].filter((r) => role[r] !== undefined);
  for (const r of passers) {
    const gD = gridOf(BG, GATE.clearD + 0.08, m.people[role[r]].seat);
    for (let tr = 0; tr < 16 && !passes[r]; tr++) {
      const phi = rng.raw() < 0.7 ? rng.sign() * U(50, 120) : U(-50, 50), d = dirPhi(phi), c = U(0.9, 1.35);
      let t = 0; while (t < 4 && S.rectDist(TP, T.L / 2, T.D / 2, C[0] + d[0] * t, C[1] + d[1] * t) < c) t += 0.01;
      const Pp = [C[0] + d[0] * t, C[1] + d[1] * t], tg0 = [-d[1], d[0]], upward = tg0[0] * Fh[0] + tg0[1] * Fh[1] > 0 ? 1 : -1;
      const tgs = Math.abs(phi) > 40 ? (rng.raw() < 0.85 ? upward : -upward) : rng.sign(), tgv = [tg0[0] * tgs, tg0[1] * tgs], ext = U(0.6, 1.1);
      const a0 = [Pp[0] - tgv[0] * ext, Pp[1] - tgv[1] * ext], a1 = [Pp[0] + tgv[0] * ext, Pp[1] + tgv[1] * ext];
      if (!chain(gD, [a0, Pp, a1])) continue;
      passes[r] = { Pp, a0, a1, phi };
    }
    if (!passes[r]) return fail('d-geom');
  }
  if (role.D4 !== undefined) {
    const gD4 = gridOf(BG, GATE.clearD4 + 0.04, m.people[role.D4].seat);
    const alts = [];
    for (let tr = 0; tr < 40 && alts.length < 6; tr++) {
      const gap = U(...GATE.d4Gap), lz = -KG.sK * (T.D / 2 + gap), lx = U(-0.1 * T.L, T.L / 2 - 0.25), tgs = alts.length % 2 ? -1 : 1, ext = U(0.7, 1.1);
      const Pp = L2W(lx, lz), tg = [TA[0] * tgs, TA[1] * tgs], a0 = [Pp[0] - tg[0] * ext, Pp[1] - tg[1] * ext], a1 = [Pp[0] + tg[0] * ext, Pp[1] + tg[1] * ext];
      if (!chain(gD4, [a0, Pp, a1])) continue;
      alts.push({ Pp, a0, a1, phi: 0 });
    }
    if (!alts.length) return fail('d4-geom');
    passes.D4 = alts[0]; passes.D4alts = alts;
  }
  const fitPts = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = L2W(sx * T.L / 2, sz * T.D / 2); fitPts.push([p[0], 0, p[1]], [p[0], T.h, p[1]]); }
  fitPts.push([Vf[0], T.h + V.H + V.flTop, Vf[1]]);
  for (const Q of m.seats) {
    const fq = S.seatFacing(Q), hw = Q.w / 2;
    for (const [u, v] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) { const p = S.toWorld(Q, u, v); fitPts.push([p[0], 0, p[1]], [p[0], Q.kind === 'ottoman' ? Q.seatY : 0.82, p[1]]); }
    fitPts.push([Q.x, Q.seatY + 0.95, Q.z], [Q.x + fq[0] * 0.5, 0, Q.z + fq[1] * 0.5], [Q.x + fq[0] * 0.25, Q.seatY + 0.95, Q.z + fq[1] * 0.25]);
  }
  for (const p of [Pc, P1, Ps, ...Object.values(passes).flatMap((q) => (Array.isArray(q) ? q : [q]).map((z) => z.Pp))]) fitPts.push(...standPts(p));
  const fc = fitCam(Bc, fitPts);
  if (!fc) return fail('cam');
  const camDistT = Math.hypot(Bc.eye[0] - C[0], Bc.eye[1] - 0.6, Bc.eye[2] - C[1]);
  if (fc.f / camDistT < GATE.scale[0] || fc.f / camDistT > GATE.scale[1]) return fail('scale');
  m.cam = { az: r2(az), el: r2(el), dist: r2(dist), eye: Bc.eye.map(r3), F: Bc.F.map((v) => Math.round(v * 1e6) / 1e6), R: Bc.R.map((v) => Math.round(v * 1e6) / 1e6), U: Bc.U.map((v) => Math.round(v * 1e6) / 1e6), f: fc.f, cx: fc.cx, cy: fc.cy };
  const cam = S.camOf(m);
  vaseShadowMask(m, BG, cam, [kStart, kEnd]);
  const offScreen = (p) => standPts(p).every((q) => { const s = cam.project(q[0], q[1], q[2]); return s.z > 0.3 && (s.x > S.VIEW.w + 6 || s.x < -6 || s.y > S.VIEW.h + 6 || s.y < -6); });
  const entries = [];
  for (let y = 150; y <= 345; y += 39) {
    const p = RT.planeAtPixel(cam, S.VIEW.w + 20, y, 0); if (!p) continue;
    let q = [p.x, p.z];
    for (let k = 0; k < 40 && !offScreen(q); k++) q = [q[0] + Rh[0] * 0.08, q[1] + Rh[1] * 0.08];
    if (offScreen(q) && q[0] > 0.6 && q[1] > 0.6 && q[0] < 9.3 && q[1] < 9.3) entries.push({ kind: 'edge', pts: [r3p(q)] });
  }
  for (const D of m.doors) {
    const dc = (D.a0 + D.a1) / 2, sd = rng.sign();
    const pts = D.wall === 'z' ? [[dc + sd * 1.3, -0.62], [dc, -0.62], [dc, 0.55]] : [[-0.62, dc + sd * 1.3], [-0.62, dc], [0.55, dc]];
    entries.push({ kind: 'door', pts: pts.map(r3p) });
  }
  for (let k = 0, got = 0; k < 40 && got < 2; k++) {
    const p = RT.planeAtPixel(cam, U(40, S.VIEW.w - 40), U(150, S.VIEW.h - 20), 0); if (!p) continue;
    const q = r3p([p.x, p.z]), g0 = gridOf(BG, 1.5, -1, true);
    if (!walkable(g0, q) || entries.some((e) => hyp(e.pts[e.pts.length - 1], q) < 1.0)) continue;
    const inPic = standPts(q).every((w) => { const sp = cam.project(w[0], w[1], w[2]); return sp.x > 8 && sp.x < S.VIEW.w - 8 && sp.y > 8 && sp.y < S.VIEW.h - 8; });
    if (!inPic) continue;
    entries.push({ kind: 'spot', pts: [q] }); got++;
  }
  if (entries.length < 2) return fail('entries');
  const seatApproach = (i) => { const Q = m.seats[m.people[i].seat], f = S.seatFacing(Q), k = m.people[i].k; return { A: [Q.x + f[0] * 0.42 * k, Q.z + f[1] * 0.42 * k], A2: [Q.x + f[0] * (0.42 * k + 0.15), Q.z + f[1] * (0.42 * k + 0.15)], S: [Q.x + f[0] * 0.02, Q.z + f[1] * 0.02], f, seatY: Q.seatY }; };
  const RC = new Map();
  const route = (g, pts) => {
    let out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = out[out.length - 1], key = `${g.key}|${a[0]},${a[1]}|${pts[i][0]},${pts[i][1]}`;
      let p = RC.get(key);
      if (p === undefined) { p = planPath(g, a, pts[i]); RC.set(key, p); }
      if (!p) return null; out = out.concat(p.slice(1));
    }
    return out;
  };
  const mkWalk = (pts, v, ei = true, eo = true, keepPts = []) => {
    const pp = pts.map(r3p), keep = new Set(); pp.forEach((q, i) => { if (keepPts.some((k) => hyp(q, r3p(k)) < 1e-9)) keep.add(i); });
    const rp = roundCorners(pp, keep); return { k: 'walk', pts: rp, len: S.pathLen(rp), v, ei, eo };
  };
  const sitSeg = (i, pts, t0) => {
    const sa = seatApproach(i), n = pts.length, f0 = nrm2([pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]]);
    return { k: 'sit', t0: r3(t0), A: r3p(sa.A), S: r3p(sa.S), f: sa.f.map(r3), f0: f0.map(r3), seatY: sa.seatY, turnDir: rng.sign() };
  };
  const candidates = (i, gIn, fixed, anchor, tLo, tHi, toSeat, gOut = gIn, gWait = null) => {
    const p = m.people[i], sa = seatApproach(i);
    const tails = [];
    if (toSeat) {
      const b = route(gOut, [fixed[fixed.length - 1], sa.A2]);
      if (b) tails.push({ pts: [...b.slice(1), sa.A], wait: false });
      if (gWait) {
        const e = fixed[fixed.length - 1], d0 = nrm2([e[0] - fixed[fixed.length - 2][0], e[1] - fixed[fixed.length - 2][1]]);
        for (let k = 0; k < 3; k++) {
          const wl = U(0.8, 1.6), wp = r3p([e[0] + d0[0] * wl, e[1] + d0[1] * wl]);
          const c1 = route(gOut, [e, wp]); if (!c1) continue;
          const c2 = route(gWait, [wp, sa.A2]); if (!c2) continue;
          tails.push({ pts: [...c1.slice(1), ...c2.slice(1), sa.A], wait: true, wpt: wp }); break;
        }
      }
      if (!tails.length) { fail('wt:seat' + (walkable(gOut, sa.A2) ? '' : '-A2')); return []; }
    } else tails.push({ pts: [], wait: false });
    const opts = [];
    for (const e of entries) {
      const a = route(gIn, [e.pts[e.pts.length - 1], fixed[0]]);
      if (!a) continue;
      for (const tl of tails) {
        const w = mkWalk([...e.pts.slice(0, -1), ...a, ...fixed.slice(1), ...tl.pts], p.v, true, true, tl.wpt ? [anchor, tl.wpt] : [anchor]);
        const sc = arcAt(w.pts, r3p(anchor));
        if (sc < 0) continue;
        const lo = Math.max(tLo, 0.3 + S.walkTimeAt(w, sc));
        const sw = tl.wpt ? arcAt(w.pts, tl.wpt) : -1;
        if (tl.wait && sw < 0) continue;
        if (lo <= tHi) opts.push({ w, sc, lo, early: 0.3 + S.walkTimeAt(w, sc), tLo, hi: tHi, wait: tl.wait, sw, spot: e.kind === 'spot' });
      }
    }
    if (!opts.length) fail('wt:early');
    return opts;
  };
  const splitAt = (pts, s) => {
    const a = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = hyp(pts[i - 1], pts[i]);
      if (acc + l >= s) { const u = (s - acc) / l, q = r3p([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]); if (hyp(q, a[a.length - 1]) > 1e-6) a.push(q); const b = [q]; if (hyp(q, pts[i]) > 1e-6) b.push(pts[i]); return [a, b.concat(pts.slice(i + 1))]; }
      acc += l; a.push(pts[i]);
    }
    return null;
  };
  const timeline = (w, sc, tA, pause) => {
    const W = (pts, ei = true, eo = true) => ({ k: 'walk', pts, len: S.pathLen(pts), v: w.v, ei, eo });
    if (!pause) { const x = W(w.pts); x.t0 = r3(tA - S.walkTimeAt(x, sc)); x.t1 = r3(x.t0 + S.walkDur(x.len, x.v, true, true)); x.tA = r3(tA); return [x]; }
    const sp = splitAt(w.pts, pause.s); if (!sp) return null;
    const w1 = W(sp[0]), w2 = W(sp[1]), h = S.headingAt(w.pts, pause.s, w.len) || [1, 0];
    const st = { k: 'stand', p: r3p(sp[1][0]), f0: h.map(r3), f1: h.map(r3) };
    if (pause.s < sc) {
      w2.t0 = r3(tA - S.walkTimeAt(w2, sc - w1.len)); w2.t1 = r3(w2.t0 + S.walkDur(w2.len, w2.v, true, true));
      st.t1 = w2.t0; st.t0 = r3(st.t1 - pause.d); w1.t1 = st.t0; w1.t0 = r3(w1.t1 - S.walkDur(w1.len, w1.v, true, true));
    } else {
      w1.t0 = r3(tA - S.walkTimeAt(w1, sc)); w1.t1 = r3(w1.t0 + S.walkDur(w1.len, w1.v, true, true));
      st.t0 = w1.t1; st.t1 = r3(st.t0 + pause.d); w2.t0 = st.t1; w2.t1 = r3(w2.t0 + S.walkDur(w2.len, w2.v, true, true));
    }
    w2.f0 = st.f1; w1.tA = w2.tA = r3(tA);
    return [w1, st, w2];
  };
  const pickPause = (w, s0, s1, allowPost = true) => {
    const u = rng.raw(), kind = u < 0.4 ? 'pre' : u < 0.85 && allowPost ? 'post' : null;
    if (!kind) return null;
    const [a, b] = kind === 'pre' ? [0.8, s0 - 0.8] : [s1 + 0.9, w.len - 1.3];
    if (b - a < 0.2) return null;
    for (let k = 0; k < 4; k++) {
      const s = U(a, b), q = S.pathAt(w.pts, s);
      if (S.rectDist(TP, T.L / 2, T.D / 2, q[0], q[1]) >= 1.4) return { s: r3(s), d: r3(kind === 'pre' ? U(1.0, 4.5) : U(1.0, 3.5)) };
    }
    return null;
  };
  let placed = [];
  const people = () => {
    placed = []; m.people.forEach((p) => { p.segs = []; p.looks = []; delete p.sway; delete p.passT; });
    const place = (i, opts, fixedLen, install, allowPost = true, waitUntil = null, pauseFn = null) => {
      for (const o of rng.shuffle(opts)) {
        for (let k = 0; k < (N > 4 ? 6 : 3); k++) {
          const pause = o.wait ? { s: o.sw, d: 0 } : pauseFn ? pauseFn(o) : pickPause(o.w, o.sc - fixedLen[0], o.sc + fixedLen[1], allowPost);
          const extra = pause && pause.s < o.sc ? pause.d + S.WALK_EASE : 0;
          const lo = Math.max(o.tLo, o.early + extra); if (lo > o.hi) { fail('pl:lo>hi:' + Object.keys(role).find((k) => role[k] === i)); continue; }
          const tA = U(lo, o.hi);
          if (o.wait) {
            const w1 = splitAt(o.w.pts, pause.s); if (!w1) continue;
            const len1 = S.pathLen(w1[0]), seg1 = { len: len1, v: o.w.v, ei: true, eo: true }, t1 = tA - S.walkTimeAt(seg1, o.sc) + S.walkDur(len1, o.w.v, true, true);
            pause.d = r3(Math.max(0.8, waitUntil(tA) + U(0.35, 0.9) - t1));
          }
          const segs = timeline(o.w, o.sc, tA, pause);
          if (!segs || segs[0].t0 < 0.3) { fail('pl:t0:' + Object.keys(role).find((k) => role[k] === i)); continue; }
          if (o.spot) { const h0 = S.headingAt(segs[0].pts, 0, segs[0].len) || [1, 0]; segs.unshift({ k: 'stand', t0: 0, t1: segs[0].t0, p: segs[0].pts[0], f0: h0.map(r3), f1: h0.map(r3) }); segs[1].f0 = h0.map(r3); }
          if (!install(segs, tA)) { fail('pl:install'); continue; }
          if (placed.every((j) => !pairClash(m, i, j))) { placed.push(i); return segs; }
          fail('pl:clash:' + Object.keys(role).find((k) => role[k] === i) + '-' + Object.keys(role).find((k) => role[k] === placed.find((j) => pairClash(m, i, j))));
        }
      }
      m.people[i].segs = [];
      return null;
    };
    const lastPts = (segs) => segs[segs.length - 1].pts;
    {
      let opts = [];
      for (const q of plan.kSeat !== undefined ? [plan.kSeat] : rng.shuffle(Array.from({ length: N }, (_, i) => i))) {
        const other = m.people.findIndex((pp) => pp.seat === q), mine = pK.seat;
        m.people[other].seat = mine; pK.seat = q;
        opts = candidates(role.K, gridOf(BG, CL.K, pK.seat, true), [kStart, Pc, kEnd], Pc, 6.0, 8.5, true, gridOf(BG, 0.55, pK.seat, true), gridOf(BG, 0.6, pK.seat, false));
        if (opts.length) break;
      }
      const segs = place(role.K, opts, [hyp(kStart, Pc), hyp(Pc, kEnd)], (sg) => { pK.segs = [...sg, sitSeg(role.K, lastPts(sg), sg[sg.length - 1].t1)]; return true; }, true,
        (tA) => tA + F.delay + F.W + F.Df);
      if (!segs) { fail('route-K'); return false; }
      tb = segs.find((x) => x.tA !== undefined).tA; m.bump.tb = tb; F.tw = r3(tb + F.delay); F.tLie = r3(F.tw + F.W + F.Df);
      const rK = [-dK[1], dK[0]];
      pK.sway = { t: r3(tb), deg: r2(Math.sign(rK[0] * nK[0] + rK[1] * nK[1]) * U(8, 12)), dx: [r3(nK[0] * 0.06), r3(nK[1] * 0.06)] };
    }
    fail('st:D1');
    {
      const p = m.people[role.D1];
      const toV = nrm2([Vf[0] - Ps[0], Vf[1] - Ps[1]]), fEnd = nrm2([dD1[0] * 0.4 + toV[0] * 0.6, dD1[1] * 0.4 + toV[1] * 0.6]);
      const tEnd = r3(F.tLie + U(0.4, 0.9));
      const sa = seatApproach(role.D1), b = route(gridOf(BG, CL.D, p.seat), [Ps, sa.A2]);
      if (!b) { fail('route-D1b'); return false; }
      const w2 = mkWalk([...b, sa.A], p.v);
      let p2 = null; for (let k = 0; k < 3 && !(p2 && p2.s > 0.6); k++) p2 = pickPause(w2, 0, 0.6, true);
      const tail = timeline(w2, 0, tEnd + S.walkTimeAt({ ...w2, ei: true }, 0), p2 && p2.s > 0.6 ? p2 : null);
      if (!tail) { fail('route-D1c'); return false; }
      tail[0].f0 = fEnd.map(r3);
      const opts = candidates(role.D1, gD1, [d1Start, P1, Ps], P1, tb - 0.25, tb + 0.15, false);
      const linger = rng.raw() < 0.85;
      const vm = [Vf[0], T.h + V.hb * 1.4, Vf[1]].map(r3);
      const segs = place(role.D1, opts, [hyp(d1Start, P1), 0], (sg) => {
        const w1 = sg[sg.length - 1];
        if (tEnd < w1.t1 + 0.6) return false;
        const st = { k: 'stand', t0: w1.t1, t1: tEnd, p: r3p(Ps), f0: nrm2(dD1).map(r3), f1: fEnd.map(r3) };
        p.looks = [{ t0: r3(w1.t1 - 0.35), t1: r3(tEnd - 0.1), p: vm }];
        const li = sg.findIndex((x) => x.k === 'stand' && x.t0 > 0);
        if (linger && li >= 0) {
          const L = sg[li], toVl = nrm2([Vf[0] - L.p[0], Vf[1] - L.p[1]]), fL = nrm2([L.f0[0] * 0.35 + toVl[0] * 0.65, L.f0[1] * 0.35 + toVl[1] * 0.65]).map(r3);
          sg[li] = { ...L, f1: fL }; sg[li + 1] = { ...sg[li + 1], f0: fL };
          p.looks.unshift({ t0: r3(L.t0 + 0.2), t1: r3(L.t1 - 0.05), p: vm });
        }
        p.segs = [...sg, st, ...tail, sitSeg(role.D1, lastPts(tail), tail[tail.length - 1].t1)];
        return true;
      }, false, null, (o) => (linger ? { s: r3(o.sc - U(0.05, 0.2)), d: r3(U(2.5, 6.0)) } : pickPause(o.w, o.sc - hyp(d1Start, P1), o.sc, false)));
      if (!segs) { fail('route-D1'); return false; }
    }
    if (role.D4 !== undefined) {
      fail('st:D4');
      const i = role.D4, p = m.people[i], tR = tb + F.delay + F.P / 4, g4 = gridOf(BG, GATE.clearD4 + 0.06, p.seat, true);
      let segs = null;
      for (const P of rng.shuffle(passes.D4alts.slice())) {
        const opts = candidates(i, g4, [P.a0, P.Pp, P.a1], P.Pp, tR - 0.45, tR + 0.45, true, g4);
        segs = place(i, opts, [hyp(P.a0, P.Pp), hyp(P.Pp, P.a1)], (s2) => { p.segs = [...s2, sitSeg(i, lastPts(s2), s2[s2.length - 1].t1)]; p.passT = s2.find((x) => x.tA !== undefined).tA; return true; });
        if (segs) break;
      }
      if (!segs) { fail('route-D4'); return false; }
    }
    {
      const pat = rng.pick([[-1, -1], [-1, 1], [-1, 1], [1, -1], [1, -1]]);
      let nBefore = 0;
      fail('st:D2');
      const lastR = passers[passers.length - 1], plist = passers.map((r, k) => [r, k < 2 ? pat[k] : rng.sign()]);
      for (const [r, sg0] of plist) {
        const i = role[r], p = m.people[i], P = passes[r];
        let segs = null;
        for (const sg of sg0 < 0 ? [-1, 1] : [1, -1]) {
          if (sg > 0 && r === lastR && !nBefore) continue;
          const [lo, hi] = sg < 0 ? [tb - 6.0, tb - 2.0] : [F.tLie + 0.8, F.tLie + 3.0];
          const opts = candidates(i, gridOf(BG, CL.D, p.seat, true), [P.a0, P.Pp, P.a1], P.Pp, lo, hi, true);
          segs = place(i, opts, [hyp(P.a0, P.Pp), hyp(P.Pp, P.a1)], (s2) => { p.segs = [...s2, sitSeg(i, lastPts(s2), s2[s2.length - 1].t1)]; p.passT = s2.find((x) => x.tA !== undefined).tA; return true; });
          if (segs) { if (sg < 0) nBefore++; break; }
        }
        if (!segs) { fail('route-' + r); return false; }
      }
    }
    if (plan.kSitRank !== undefined) {
      const sitSegOf = (i) => m.people[i].segs[m.people[i].segs.length - 1];
      const others = rng.shuffle(Array.from({ length: N }, (_, i) => i).filter((i) => i !== role.K)), r = plan.kSitRank;
      const order = [...others.slice(0, r), role.K, ...others.slice(r)];
      let prev = -Infinity;
      for (const i of order) {
        const st = sitSegOf(i), need = prev + U(0.4, 1.0);
        if (st.t0 < need) {
          const d = r3(need - st.t0), segs = m.people[i].segs;
          const wait = { k: 'stand', t0: st.t0, t1: r3(st.t0 + d), p: st.A.slice(), f0: st.f0.slice(), f1: st.f0.slice() };
          m.people[i].segs = [...segs.slice(0, -1), wait, { ...st, t0: r3(st.t0 + d) }];
        }
        prev = sitSegOf(i).t0;
      }
      if (sepProblem(m)) { fail('sep-sit'); return false; }
    }

    return true;
  };
  let okP = false;
  for (let pt = 0; pt < (N > 4 ? 24 : 4) && !okP; pt++) okP = people();
  if (!okP) return null;
  const done = Math.max(...m.people.map((p) => { const s = p.segs[p.segs.length - 1]; return s.t0 + S.TURN_T * 0.85 + S.SIT_T; }));
  m.T = r2(Math.max(GATE.T[0], done + GATE.seatedBy + U(0, 0.8)));
  if (m.T > (N > 4 ? GATE.Tbig : GATE.T[1])) return fail('long');
  m.hold = r2(U(GATE.hold[0], GATE.hold[1]));
  m.dt = 1.0;
  return m;
}

export const PERSON_R = { torso: 0.15, head: 0.1, thigh: 0.068, shin: 0.052, uarm: 0.048, farm: 0.042 };
export function personCaps(J) {
  const k = J.k, hu = S.norm3(S.sub3(J.tor, J.hf.map((q) => q * S.dot3(J.tor, J.hf))));
  const hc = S.add3(S.add3(J.neck1, hu, 0.065 * k), J.hf, 0.012 * k);
  const out = [[J.pelvis, J.neck1, PERSON_R.torso * k], [hc, hc, PERSON_R.head * k]];
  for (const L of J.legs) out.push([L.hip, L.knee, PERSON_R.thigh * k], [L.knee, L.ankle, PERSON_R.shin * k]);
  for (const A of J.arms) out.push([A.sh, A.el, PERSON_R.uarm * k], [A.el, A.hand, PERSON_R.farm * k]);
  return out;
}
export function vaseCaps(m, tau) {
  const F = S.vaseFrame(m, tau), V = m.vase;
  return [[F.W([0, 0.03, 0]), F.W([0, V.hb, 0]), V.rb], [F.W([0, V.hb, 0]), F.W([0, 2 * V.hb - 0.03, 0]), V.rb * 0.85],
    [F.W([0, 2 * V.hb - 0.03, 0]), F.W([0, V.H, 0]), V.rn + 0.01], [F.W([0, V.H, 0]), F.W([0, V.H + V.flTop - 0.03, 0]), 0.055]];
}
function projCaps(cam, caps) {
  return caps.map(([a, b, r]) => { const p = cam.project(...a), q = cam.project(...b), z = (p.z + q.z) / 2; return [p.x, p.y, q.x, q.y, r * cam.f / z]; });
}
function segSeg(a, b) {
  const d = (px, py, x0, y0, x1, y1) => { const vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy; let t = l2 > 0 ? ((px - x0) * vx + (py - y0) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - x0 - t * vx, py - y0 - t * vy); };
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const [a0, a1, a2, a3] = a, [b0, b1, b2, b3] = b;
  const d1 = cross(a0, a1, a2, a3, b0, b1), d2 = cross(a0, a1, a2, a3, b2, b3), d3 = cross(b0, b1, b2, b3, a0, a1), d4 = cross(b0, b1, b2, b3, a2, a3);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(d(a0, a1, b0, b1, b2, b3), d(a2, a3, b0, b1, b2, b3), d(b0, b1, a0, a1, a2, a3), d(b2, b3, a0, a1, a2, a3));
}
export function capsGap(A, B) { let g = Infinity; for (const a of A) for (const b of B) g = Math.min(g, segSeg(a, b) - a[4] - b[4]); return g; }
export function coverFrac(VA, P) {
  let n = 0, hit = 0;
  for (const c of VA) for (let i = 0; i <= 6; i++) for (let j = -2; j <= 2; j++) {
    const t = i / 6, px = c[0] + (c[2] - c[0]) * t, py = c[1] + (c[3] - c[1]) * t, l = Math.hypot(c[2] - c[0], c[3] - c[1]) || 1;
    const x = px + (-(c[3] - c[1]) / l) * c[4] * j / 2.5, y = py + ((c[2] - c[0]) / l) * c[4] * j / 2.5;
    n++;
    if (P.some((q) => segSeg([x, y, x, y, 0], q) <= q[4])) hit++;
  }
  return n ? hit / n : 0;
}
export function observe(m, tau, cam = S.camOf(m)) {
  const VA = projCaps(cam, vaseCaps(m, tau)), vs = S.vaseState(m, tau), TPn = S.tablePose(m, tau), T = m.table;
  const vb = S.vaseFrame(m, tau).W([0, m.vase.hb, 0]), vsc = cam.project(...vb);
  const people = m.people.map((p, i) => {
    const B = S.personAt(m, i, tau);
    if (!B) return { present: false };
    const J = S.bodyJoints(B), PC = projCaps(cam, personCaps(J)), fl = S.bodyFloor(B);
    const chest = S.add3(J.pelvis, J.tor, 0.3 * J.k), cs = cam.project(...chest), ft = cam.project(fl[0], 0, fl[1]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of PC) { x0 = Math.min(x0, c[0] - c[4], c[2] - c[4]); x1 = Math.max(x1, c[0] + c[4], c[2] + c[4]); y0 = Math.min(y0, c[1] - c[4], c[3] - c[4]); y1 = Math.max(y1, c[1] + c[4], c[3] + c[4]); }
    const inFrame = cs.x >= 0 && cs.x <= S.VIEW.w && cs.y >= 0 && cs.y <= S.VIEW.h;
    return {
      present: true, inFrame, full: x0 >= 0 && x1 <= S.VIEW.w && y0 >= 0 && y1 <= S.VIEW.h, seated: !!B.seated, mode: B.mode, floor: fl, chest: [cs.x, cs.y], feet: [ft.x, ft.y], box: [x0, y0, x1, y1],
      gap: capsGap(PC, VA), cover: 0, cdist: Math.hypot(cs.x - vsc.x, cs.y - vsc.y),
      dTable: S.rectDist(TPn, T.L / 2, T.D / 2, fl[0], fl[1]), dVase3: Math.hypot(fl[0] - vb[0], fl[1] - vb[2]), caps: PC, B, J,
    };
  });
  return { tau, people, vase: { ...vs, screen: [vsc.x, vsc.y], caps: VA }, tableShift: Math.hypot(TPn.x - T.x, TPn.z - T.z), tableRot: Math.abs(TPn.yaw - T.yaw) };
}
export const nearestBy = (o, key) => { let k = -1, b = Infinity; o.people.forEach((p, i) => { if (p.present && p.inFrame && p[key] < b) { b = p[key]; k = i; } }); return k; };

export function check(m, { rt = true } = {}) {
  if (!m || m.task !== NAME || !m.live || !Array.isArray(m.people) || ![4, 5, 6].includes(m.people.length) || !Array.isArray(m.seats) || m.seats.length !== m.people.length) return 'contract';
  const N = m.people.length;
  if (!(m.T >= GATE.T[0] - 1e-9 && m.T <= (N > 4 ? GATE.Tbig : GATE.T[1]) + 1e-9) || !(m.hold >= GATE.hold[0] - 1e-9 && m.hold <= GATE.hold[1] + 1e-9)) return 'T';
  const F = m.fall, B = m.bump, R = m.roles, K = m.answer, cam = S.camOf(m), T = m.table, TP0 = { x: T.x, z: T.z, yaw: T.yaw };
  if (K !== R.K || new Set(Object.values(R)).size !== N) return 'roles';
  if (new Set(m.people.map((p) => p.seat)).size !== N) return 'seats';
  if (!(F.delay >= GATE.delay[0] - 1e-9 && F.delay <= GATE.delay[1] + 1e-9) || Math.abs(F.tw - (B.tb + F.delay)) > 2e-3) return 'delay';
  if (Math.abs(F.tLie - (F.tw + F.W + F.Df)) > 2e-3 || F.tLie > m.T - 2.5) return 'fall-time';
  if (!(B.D >= 0.055 && B.D <= 0.095 && Math.abs(B.rot) >= 3.9 && Math.abs(B.rot) <= 7.1)) return 'jolt';
  {
    const BK = S.personAt(m, K, B.tb), fl = S.bodyFloor(BK);
    if (!BK || BK.mode !== 'walk') return 'k-walk';
    if (S.rectDist(TP0, T.L / 2, T.D / 2, fl[0], fl[1]) > GATE.rHit * m.people[K].k + 0.04) return 'k-far';
    const Q = S.toWorld(TP0, B.corner[0], B.corner[1]);
    let dmin = Infinity;
    for (let t = B.tb - 0.15; t <= B.tb + 0.06; t += 0.03) {
      const J = S.bodyJoints(S.personAt(m, K, t));
      for (const L of J.legs) for (let y = T.h - 0.036; y <= T.h + 1e-9; y += 0.012) {
        const a = L.hip, b = L.knee, ab = S.sub3(b, a), ap = S.sub3([Q[0], y, Q[1]], a), u = Math.max(0, Math.min(1, S.dot3(ap, ab) / S.dot3(ab, ab)));
        dmin = Math.min(dmin, S.len3(S.sub3([Q[0], y, Q[1]], S.add3(a, ab, u))) - PERSON_R.thigh * J.k);
      }
    }
    if (dmin > GATE.touch) return 'k-touch';
  }
  const tick = [];
  for (let t = 0; t <= m.T + 1e-9; t += GATE.dt) tick.push(Math.round(t * 1000) / 1000);
  const obs = tick.map((t) => observe(m, t, cam));
  for (const o of obs) {
    const pr = o.people;
    for (const r of Object.keys(R)) {
      if (r === 'K') continue;
      const q = pr[R[r]]; if (!q.present) continue;
      const need = r === 'D4' ? GATE.clearD4 : r === 'D1' && o.tau >= B.tb - GATE.winD1[0] && o.tau <= F.tLie + GATE.winD1[1] ? GATE.clearD1
        : r !== 'D1' && Math.abs(o.tau - m.people[R[r]].passT) <= 0.6 ? GATE.clearD : GATE.clearAll;
      if (q.dTable < need - 1e-6) return 'clear-' + r;
    }
    const qk = pr[K];
    if (qk.present && Math.abs(o.tau - B.tb) > 2.5 && qk.dTable < GATE.clearK - 0.05) return 'clear-K';
  }
  if (sepProblem(m, GATE.dt)) return 'sep';
  {
    let d1Over = Infinity, kGap = Infinity;
    const minGap = m.people.map(() => Infinity);
    for (const o of obs) {
      o.people.forEach((q, i) => { if (q.present) minGap[i] = Math.min(minGap[i], q.gap); });
      const q1 = o.people[R.D1];
      if (q1.present && o.tau >= F.tw - 1.0 && o.tau <= F.tLie) d1Over = Math.min(d1Over, q1.gap);
      if (o.people[K].present && o.tau <= F.tLie + 0.3) kGap = Math.min(kGap, o.people[K].gap);
    }
    if (!(d1Over <= -GATE.d1Over)) return 'd1-overlap';
    if (!(kGap >= GATE.kGap)) return 'k-gap';
    for (let i = 0; i < N; i++) if (i !== R.D1 && !(minGap[i] > minGap[R.D1] + 1)) return 'd1-most';
  }
  for (const o of obs) {
    if (o.tau < F.tw - 1e-9 || o.tau > F.tLie + 0.3) continue;
    if (nearestBy(o, 'gap') === K || nearestBy(o, 'cdist') === K) return 'wobble-nearest';
  }
  { const o = observe(m, F.tw + 0.02, cam); if (nearestBy(o, 'gap') !== R.D1) return 'onset-d1'; }
  { const o = observe(m, B.tb, cam); if (nearestBy(o, 'gap') === K || nearestBy(o, 'cdist') === K) return 'bump-nearest'; }
  for (const o of obs) {
    if (o.tau < F.tw - 1e-9 || o.tau > F.tLie + 0.3) continue;
    const qk = o.people[K], q1 = o.people[R.D1];
    if (qk.present && q1.present && !(qk.dVase3 > q1.dVase3 + 0.2)) return 'wobble-3d';
  }
  { const o = observe(m, B.tb, cam); if (o.people.filter((q) => q.present && q.inFrame && !q.seated).length < 3) return 'standing'; if (!o.people[K].full) return 'k-frame'; }
  {
    const o = observe(m, m.T - GATE.seatedBy + 0.05, cam);
    if (!o.people.every((q) => q.present && q.seated && q.full)) return 'seated';
  }
  if (!rt) return null;
  for (const t of [F.tw + F.P / 4, F.tw + F.W * 0.6, F.tLie + 0.3]) {
    const sc = S.sceneAt(m, t, { fast: true }), s = RT.objectStats(sc, S.ID.vase, 1);
    if (!(s.frac >= GATE.visVase)) return 'vis-vase';
  }
  {
    const sc = S.sceneAt(m, B.tb, { fast: true }), s = RT.objectStats(sc, S.ID.person(K), 2);
    if (!(s.frac >= GATE.visK)) return 'vis-k';
    const Q = S.toWorld(S.tablePose(m, B.tb), B.corner[0], B.corner[1]), h = RT.rayToPoint(sc, Q[0], T.h + 0.004, Q[1]);
    if (!(h.id === S.ID.table || h.id === S.ID.person(K) || h.t > h.tP - 0.03)) return 'vis-corner';
  }
  {
    const sc = S.sceneAt(m, m.T, { fast: true });
    for (let i = 0; i < N; i++) { const s = RT.objectStats(sc, S.ID.person(i), 2); if (!(s.frac >= GATE.visSeat) || !s.pt) return 'vis-seated'; }
  }
  if (!m.tap || !Array.isArray(m.pts) || m.pts.length !== N) return 'tap';
  for (const t of [m.T - 1.0, m.T - 0.5, m.T]) {
    const sc = S.sceneAt(m, t, { fast: true });
    if (RT.pickId(sc, m.tap.x, m.tap.y) !== S.ID.person(K)) return 'tap-k';
    for (let i = 0; i < N; i++) if (RT.pickId(sc, m.pts[i][0], m.pts[i][1]) !== S.ID.person(i)) return 'tap-pts';
  }
  return null;
}
export function tapPoints(m) {
  const sc = S.sceneAt(m, m.T, { fast: true }), pts = [];
  for (let i = 0; i < m.people.length; i++) { const s = RT.objectStats(sc, S.ID.person(i), 1); if (!s.pt) return null; pts.push([r2(s.pt[0]), r2(s.pt[1])]); }
  return pts;
}
