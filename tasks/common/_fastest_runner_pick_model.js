import { camFromBasis } from './_props_rt.js';

export const DEG = Math.PI / 180;
export const C = Object.freeze({
  W: 380, H: 384,
  N: [6, 7],
  HR: 1.72,
  VF: [5.0, 6.2],
  RATIO: 2.0,
  RATIO_H: [2.0, 2.5],
  V_LO: 1.5,
  VGAP: 0.15,
  O_H: 1.15,
  T: [2.4, 3.2], F_RUN: 16.5,
  HOLD: [0.8, 1.5],
  YARD: 5,
  GRID_YAW: 22,
  HCAM: [4.0, 5.0], TOP: [0.6, 2.6], F: [450, 540],
  PAD: 12, D_MIN: 5.5, PX: [18, 150],
  D_SEP: 1.2,
  F_RAD: 15, R_RAD: 20, S_RAD: 30, H_LAT: 60,
  LOOM_R: 0.85,
  F_FAR: 40, F_NEAR: 23,
  RULER_M: 1.10, RULER_DT: 1.0,
  SCREEN_M: 1.10, SCREEN_DT: 0.2,
  VIS_ALL: 0.6, VIS_T0: 0.9, VIS_A: 0.75,
  YARD_PX: 6,
  STRIDE_HZ: 1.4,
  HUMAN: { GAMMA: 0.5, B: 0.85, MARGIN: 1.5 },
});
export const COLORS = { red: '#d6302a', orange: '#f08a1c', yellow: '#f5cf2a', cyan: '#22b8cf', blue: '#2b5fd1', purple: '#7d3fc0', pink: '#f27fb6', white: '#f2f2ec', black: '#25262b' };
export const PALETTE = Object.keys(COLORS);

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const argmax = (arr) => arr.reduce((b, v, i) => (v > arr[b] ? i : b), 0);

export function camBasis(yaw, pitch) {
  const y = yaw * DEG, p = pitch * DEG;
  const F = [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
  const l = Math.hypot(F[0], F[2]), R = [-F[2] / l, 0, F[0] / l];
  const U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  return { F, R, U };
}
const CAMS = new WeakMap();
export function camOf(m) {
  let c = CAMS.get(m.cam);
  if (!c) {
    const q = m.cam, B = camBasis(q.yaw, q.pitch);
    c = camFromBasis({ eye: [0, q.h, 0], F: B.F, R: B.R, U: B.U, f: q.f, cx: q.cx, cy: q.cy, W: C.W, H: C.H });
    CAMS.set(m.cam, c);
  }
  return c;
}
export function gridAxes(m) {
  const g = m.grid.yaw * DEG;
  return { A: [Math.sin(g), 0, Math.cos(g)], B: [Math.cos(g), 0, -Math.sin(g)] };
}

export const tEnd = (m) => m.T;
export const loopLen = (m) => m.T + (m.hold ?? 0);
export function sceneT(m, t) { const L = loopLen(m); let u = t % L; if (u < 0) u += L; return Math.min(u, m.T); }
export const GRID = 0.25;
export const gridTimes = (T, step = GRID) => { const g = []; for (let k = 0; k * step < T - 1e-9; k++) g.push(k * step); g.push(T); return g; };
export const headVec = (hd) => [Math.sin(hd * DEG), 0, Math.cos(hd * DEG)];
export function posAt(m, i, t) {
  const q = m.run[i], u = headVec(q.hd);
  return [q.x0 + u[0] * q.v * t, 0, q.z0 + u[2] * q.v * t];
}
export function sightAngle(m, i, t) {
  const p = posAt(m, i, t), u = headVec(m.run[i].hd), l = Math.hypot(p[0], p[2]) || 1;
  const c = Math.abs((p[0] * u[0] + p[2] * u[2]) / l);
  return Math.acos(Math.min(1, c)) / DEG;
}

export function pose(m, i, t) {
  const R0 = posAt(m, i, t), fw = headVec(m.run[i].hd), sd = [fw[2], 0, -fw[0]];
  const th = 2 * Math.PI * (m.run[i].phase + C.STRIDE_HZ * t);
  const W = (f, y, s) => [R0[0] + fw[0] * f + sd[0] * s, y, R0[2] + fw[2] * f + sd[2] * s];
  const lean = 9 * DEG, cl = Math.cos(lean), sl = Math.sin(lean);
  const parts = [];
  const yP = 0.93 + 0.025 * Math.cos(2 * th);
  const legs = [];
  for (const [side, ph] of [[1, th], [-1, th + Math.PI]]) {
    const a = 34 * DEG * Math.sin(ph), b = (16 + 74 * Math.max(0, Math.cos(ph)) ** 1.5) * DEG;
    const hip = [0, yP, side * 0.095];
    const knee = [hip[0] + 0.43 * Math.sin(a), hip[1] - 0.43 * Math.cos(a), hip[2]];
    const s = a - b, ank = [knee[0] + 0.42 * Math.sin(s), knee[1] - 0.42 * Math.cos(s), hip[2]];
    const toe = [ank[0] + 0.17 * Math.cos(s), ank[1] + 0.17 * Math.sin(s), hip[2]];
    legs.push({ side, ph, hip, knee, ank, toe });
  }
  const low = Math.min(...legs.flatMap((L) => [L.ank[1], L.toe[1]]));
  const dy = 0.055 - low;
  const P = (q) => W(q[0], q[1] + dy, q[2]);
  for (const L of legs) {
    parts.push({ k: 'cap', a: P(L.hip), b: P(L.knee), r: 0.085, mat: 'shorts', part: 'thigh' });
    parts.push({ k: 'cap', a: P(L.knee), b: P(L.ank), r: 0.064, mat: 'skin', part: 'shin' });
    parts.push({ k: 'cap', a: P([L.ank[0] - 0.03, L.ank[1], L.ank[2]]), b: P(L.toe), r: 0.056, mat: 'shoe', part: 'foot' });
  }
  const pel = [0, yP + 0.03, 0], chest = [pel[0] + 0.45 * sl, pel[1] + 0.45 * cl, 0];
  parts.push({ k: 'cap', a: P(pel), b: P(chest), r: 0.155, mat: 'shirt', part: 'torso' });
  parts.push({ k: 'cap', a: P([pel[0] - 0.01, pel[1] - 0.04, 0]), b: P([pel[0] + 0.02, pel[1] + 0.06, 0]), r: 0.13, mat: 'shorts', part: 'hips' });
  const head = [chest[0] + 0.23 * sl + 0.02, chest[1] + 0.23 * cl, 0];
  parts.push({ k: 'sph', c: P(head), r: 0.125, mat: 'skin', part: 'head' });
  parts.push({ k: 'sph', c: P([head[0] - 0.03, head[1] + 0.04, 0]), r: 0.112, mat: 'hair', part: 'hair' });
  for (const L of legs) {
    const side = L.side, g = -30 * DEG * Math.sin(L.ph);
    const sh = [chest[0] - 0.02, chest[1] - 0.04, side * 0.2];
    const el = [sh[0] + 0.27 * Math.sin(g), sh[1] - 0.27 * Math.cos(g), sh[2] + side * 0.02];
    const g2 = g + 88 * DEG, hand = [el[0] + 0.25 * Math.sin(g2), el[1] - 0.25 * Math.cos(g2), el[2]];
    parts.push({ k: 'cap', a: P(sh), b: P(el), r: 0.056, mat: 'shirt', part: 'arm' });
    parts.push({ k: 'cap', a: P(el), b: P(hand), r: 0.048, mat: 'skin', part: 'forearm' });
  }
  return { root: R0, fw, sd, parts };
}

export function silhouette(m, cam, i, t) {
  const P = pose(m, i, t), prims = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of P.parts) {
    const a = q.k === 'cap' ? q.a : q.c, b = q.k === 'cap' ? q.b : q.c;
    const pa = cam.project(a[0], a[1], a[2]), pb = cam.project(b[0], b[1], b[2]);
    const r = q.r * cam.f / ((pa.z + pb.z) / 2);
    prims.push({ x0: pa.x, y0: pa.y, x1: pb.x, y1: pb.y, r });
    x0 = Math.min(x0, pa.x - r, pb.x - r); x1 = Math.max(x1, pa.x + r, pb.x + r);
    y0 = Math.min(y0, pa.y - r, pb.y - r); y1 = Math.max(y1, pa.y + r, pb.y + r);
  }
  const e = cam.eye, c = [P.root[0], 1.2, P.root[2]];
  return { prims, depth: Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]), box: [x0, y0, x1, y1] };
}
function segDist2(px, py, q) {
  const dx = q.x1 - q.x0, dy = q.y1 - q.y0, L = dx * dx + dy * dy;
  let u = L > 1e-9 ? ((px - q.x0) * dx + (py - q.y0) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
  const ex = q.x0 + u * dx - px, ey = q.y0 + u * dy - py;
  return ex * ex + ey * ey;
}
export function insideSil(s, x, y, grow = 0) {
  if (x < s.box[0] - grow || x > s.box[2] + grow || y < s.box[1] - grow || y > s.box[3] + grow) return false;
  for (const q of s.prims) { const rr = q.r + grow; if (segDist2(x, y, q) <= rr * rr) return true; }
  return false;
}
export function visibleShares(m, cam, t) {
  const sils = m.run.map((_, i) => silhouette(m, cam, i, t));
  const over = (p, q) => p.box[0] < q.box[2] && q.box[0] < p.box[2] && p.box[1] < q.box[3] && q.box[1] < p.box[3];
  return sils.map((s, i) => {
    const front = sils.filter((o, j) => j !== i && o.depth < s.depth && over(s, o));
    if (!front.length) return 1;
    let tot = 0, vis = 0;
    for (let y = Math.floor(s.box[1]); y <= Math.ceil(s.box[3]); y++) for (let x = Math.floor(s.box[0]); x <= Math.ceil(s.box[2]); x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!insideSil(s, px, py)) continue;
      tot++;
      if (!front.some((o) => insideSil(o, px, py))) vis++;
    }
    return tot ? vis / tot : 0;
  });
}

export function screenOf(m, cam, i, t) {
  const p = posAt(m, i, t), hp = cam.project(p[0], 0.9, p[2]), ft = cam.project(p[0], 0, p[2]), hd = cam.project(p[0], C.HR, p[2]);
  return { hx: hp.x, hy: hp.y, fx: ft.x, fy: ft.y, size: ft.y - hd.y, g: p };
}
export function rulerAll(m, cam, t0, t1, feet = false) {
  return m.run.map((_, i) => {
    const a = screenOf(m, cam, i, t0), b = screenOf(m, cam, i, t1);
    const d = feet ? Math.hypot(b.fx - a.fx, b.fy - a.fy) : Math.hypot(b.hx - a.hx, b.hy - a.hy);
    return d / ((a.size + b.size) / 2);
  });
}
export function screenDispAll(m, cam, t0, t1, feet = false) {
  return m.run.map((_, i) => {
    const a = screenOf(m, cam, i, t0), b = screenOf(m, cam, i, t1);
    return feet ? Math.hypot(b.fx - a.fx, b.fy - a.fy) : Math.hypot(b.hx - a.hx, b.hy - a.hy);
  });
}
export const roleIndex = (m, role) => m.run.findIndex((q) => q.role === role);
export const bodyRuler = (m, t0 = 0, t1 = m.T) => argmax(rulerAll(m, camOf(m), t0, t1));

export function perceived(m, H = C.HUMAN) {
  const n = m.run.length, T = m.T;
  const eh = m.cam.h - 0.9;
  const dist = m.run.map((_, i) => { let s = 0; for (let k = 0; k <= 8; k++) { const p = posAt(m, i, T * k / 8); s += Math.hypot(p[0], p[2], eh); } return s / 9; });
  const dmed = dist.slice().sort((x, y) => x - y)[Math.floor(n / 2)];
  return m.run.map((q, i) => { const c = Math.cos(sightAngle(m, i, T / 2) * DEG); return q.v * (1 - (1 - H.B) * c * c) * Math.pow(dmed / dist[i], H.GAMMA); });
}

let FAIL = '';
export const lastFail = () => FAIL;
const fail = (w) => { FAIL = w; return null; };
export function contract(m) {
  const n = m.run.length, a = m.answer;
  if (!(n >= C.N[0] && n <= C.N[1]) || !(a >= 0 && a < n) || m.run[a].role !== 'F') return fail('c0');
  const iF = a, iH = roleIndex(m, 'H'), iR = roleIndex(m, 'R');
  if (iH < 0 || iR < 0) return fail('c1');
  if (new Set(m.run.map((q) => q.color)).size !== n) return fail('c2');
  const T = m.T, cam = camOf(m), vs = m.run.map((q) => q.v);
  const others = vs.filter((_, i) => i !== iF).sort((x, y) => y - x);
  if (!(vs[iF] >= C.RATIO * others[0] - 1e-9) || !(vs[iF] >= C.RATIO_H[0] * vs[iH] - 1e-9)) return fail('c3');
  const hRank = 1 + vs.filter((v) => v > vs[iH]).length;
  if (hRank !== 2 && hRank !== 3) return fail('c4');
  for (let k = 1; k < others.length; k++) if (others[k - 1] - others[k] < C.VGAP - 1e-9) return fail('c5');
  if (others[others.length - 1] < C.V_LO - 1e-9) return fail('c6');
  const fine = Array.from({ length: Math.ceil(T / 0.05) + 1 }, (_, k) => Math.min(T, k * 0.05));
  for (let k = 0; k < fine.length; k += 2) {
    const t = fine[k];
    if (sightAngle(m, iF, t) > C.F_RAD + 1e-9 || sightAngle(m, iR, t) > C.R_RAD + 1e-9 || sightAngle(m, iH, t) < C.H_LAT - 1e-9) return fail('c7');
    for (let i = 0; i < n; i++) if (m.run[i].role === 'S' && sightAngle(m, i, t) > C.S_RAD + 1e-9) return fail('c8');
  }
  for (const t of [0, T]) { const p = posAt(m, iF, t), d = Math.hypot(p[0], p[2]); if (d > C.F_FAR + 1e-6 || d < C.F_NEAR - 1e-6) return fail('far'); }
  {
    const p = perceived(m);
    for (let i = 0; i < n; i++) if (i !== iF && !(p[iF] >= C.HUMAN.MARGIN * p[i])) return fail('human');
  }
  for (const t of fine) {
    const ps = m.run.map((_, i) => posAt(m, i, t));
    for (let i = 0; i < n; i++) {
      const r = ps[i], e = cam.eye;
      if (Math.hypot(r[0] - e[0], r[1] - e[1], r[2] - e[2]) < C.D_MIN) return fail('c12');
      const u = headVec(m.run[i].hd), sx = u[2], sz = -u[0];
      for (const [dx, y] of [[0.4, 0], [-0.4, 0], [0, C.HR], [0.4, C.HR * 0.8], [-0.4, C.HR * 0.8]]) {
        const p = cam.project(r[0] + sx * dx, y, r[2] + sz * dx);
        if (!(p.z > 0.5 && p.x >= C.PAD && p.x <= C.W - C.PAD && p.y >= C.PAD && p.y <= C.H - C.PAD)) return fail('c13');
      }
      const hp = cam.project(r[0], 0, r[2]).y - cam.project(r[0], C.HR, r[2]).y;
      if (hp < C.PX[0] || hp > C.PX[1]) return fail('c14');
      for (let j = i + 1; j < n; j++) if (Math.hypot(ps[j][0] - r[0], ps[j][2] - r[2]) < C.D_SEP) return fail('c15');
    }
  }
  const g01 = Array.from({ length: Math.floor(T / 0.1 + 1e-9) + 1 }, (_, k) => k * 0.1);
  if (T - g01[g01.length - 1] > 1e-6) g01.push(T);
  const S = g01.map((t) => m.run.map((_, i) => screenOf(m, cam, i, t)));
  for (let p = 0; p < g01.length; p++) for (let q = p + 1; q < g01.length; q++) {
    const dt = g01[q] - g01[p];
    if (dt < C.SCREEN_DT - 1e-9) continue;
    for (const feet of [false, true]) {
      const d = S[p].map((A, i) => { const B = S[q][i]; return feet ? Math.hypot(B.fx - A.fx, B.fy - A.fy) : Math.hypot(B.hx - A.hx, B.hy - A.hy); });
      let best = 0; for (let i = 0; i < n; i++) if (i !== iF) best = Math.max(best, d[i]);
      if (!(best >= C.SCREEN_M * d[iF])) return fail('c16');
      if (dt >= C.RULER_DT - 1e-9) {
        const rl = d.map((x, i) => x / ((S[p][i].size + S[q][i].size) / 2));
        for (let i = 0; i < n; i++) if (i !== iH && !(rl[iH] >= C.RULER_M * rl[i])) return fail('c17');
      }
    }
  }
  const G = gridAxes(m), grid = gridTimes(T);
  for (const t of grid) for (let i = 0; i < n; i++) {
    const p = posAt(m, i, t), pp = cam.project(p[0], 0, p[2]);
    for (const ax of [G.A, G.B]) {
      const q = cam.project(p[0] + ax[0] * C.YARD, 0, p[2] + ax[2] * C.YARD);
      if (Math.hypot(q.x - pp.x, q.y - pp.y) < C.YARD_PX) return fail('c18');
    }
  }
  for (const t of grid) {
    const v = visibleShares(m, cam, t);
    if (v.some((s) => s < C.VIS_ALL) || v[iF] < C.VIS_A) return fail('c19');
    if (t === 0 && v.some((s) => s < C.VIS_T0)) return fail('c20');
  }
  return { ok: true };
}

export const RANK_KEYS = ['sz0', 'szM', 'szT', 'rel', 'abs', 'grow', 'rad', 'cen0', 'cenM', 'cenT', 'cat', 'catS', 'catR'];
export const ALL_RANKS = ['sz0', 'szM', 'szT'];
export const ENDS_RANKS = ['grow', 'cen0', 'cenM', 'cenT'];
export function rankOf(vals, i, desc = true) { return [...vals.keys()].sort((x, y) => (desc ? vals[y] - vals[x] : vals[x] - vals[y]) || x - y).indexOf(i); }
export function catchers(m) {
  const cam = camOf(m), T = m.T, n = m.run.length;
  const s0 = m.run.map((_, i) => screenOf(m, cam, i, 0)), s1 = m.run.map((_, i) => screenOf(m, cam, i, T));
  const g = Array(n).fill(-Infinity), px = Array(n).fill(-Infinity), rl = Array(n).fill(-Infinity), c20 = Math.cos(20 * DEG);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const ui = headVec(m.run[i].hd), uj = headVec(m.run[j].hd);
    if (ui[0] * uj[0] + ui[2] * uj[2] < c20) continue;
    const gap = (t) => { const pi = posAt(m, i, t), pj = posAt(m, j, t); return (pj[0] - pi[0]) * ui[0] + (pj[2] - pi[2]) * ui[2]; };
    const g0 = gap(0), g1 = gap(T);
    if (g0 <= 0 || g0 - g1 <= 0) continue;
    const sg = (S) => Math.hypot(S[j].hx - S[i].hx, S[j].hy - S[i].hy), dpx = sg(s0) - sg(s1);
    g[i] = Math.max(g[i], g0 - g1); px[i] = Math.max(px[i], dpx); rl[i] = Math.max(rl[i], dpx / ((s0[i].size + s1[i].size) / 2));
  }
  return { ground: g, px, ruler: rl };
}
export function fRanks(m, i = m.answer) {
  const cam = camOf(m), T = m.T;
  const s = [0, T / 2, T].map((t) => m.run.map((_, j) => screenOf(m, cam, j, t)));
  const cen = (q) => -Math.hypot(q.hx - C.W / 2, q.hy - C.H / 2);
  const ca = catchers(m), top = (a) => (a[i] > -Infinity && argmax(a) === i ? 0 : 1);
  return {
    sz0: rankOf(s[0].map((q) => q.size), i), szM: rankOf(s[1].map((q) => q.size), i), szT: rankOf(s[2].map((q) => q.size), i),
    rel: rankOf(s[0].map((q, j) => Math.abs(Math.log(s[2][j].size / q.size))), i),
    abs: rankOf(s[0].map((q, j) => Math.abs(s[2][j].size - q.size)), i),
    grow: rankOf(s[0].map((q, j) => Math.log(s[2][j].size / q.size)), i),
    rad: rankOf(m.run.map((_, j) => sightAngle(m, j, T / 2)), i, false),
    cen0: rankOf(s[0].map(cen), i), cenM: rankOf(s[1].map(cen), i), cenT: rankOf(s[2].map(cen), i),
    cat: ca.ground[i] > -Infinity ? 0 : 1, catS: top(ca.px), catR: top(ca.ruler),
  };
}

function camDraw(r) {
  const f = r.uniform(...C.F), half = Math.atan((C.H / 2 - C.PAD) / f) / DEG;
  return { h: r4(r.uniform(...C.HCAM)), yaw: 0, pitch: r4(half + r.uniform(...C.TOP)), f: r4(f), cx: C.W / 2, cy: C.H / 2 };
}
export function attempt(r, tgt, base) {
  const U = r.uniform, n = tgt.n;
  const vF = U(...C.VF);
  if (C.F_RUN / vF < C.T[0]) return 'speeds';
  const T = U(C.T[0], Math.min(C.T[1], C.F_RUN / vF));
  const m = { ...base, T: r4(T),
    cam: camDraw(r),
    grid: { yaw: r4(U(-C.GRID_YAW, C.GRID_YAW)), a0: r4(U(0, C.YARD)), b0: r4(U(0, C.YARD)) } };
  const cam = camOf(m);
  const hHi = vF / C.RATIO_H[0] - (tgt.hRank === 3 ? C.VGAP + 0.1 : 0), hLo = Math.max(2.3, vF / C.RATIO_H[1]);
  if (hHi <= hLo) return 'speeds';
  const vH = U(hLo, hHi);
  let vS = null;
  if (tgt.hRank === 3) { const lo = vH + C.VGAP + 0.05, hi = vF / C.RATIO; if (hi <= lo) return 'speeds'; vS = U(lo, hi); }
  const roles = ['F', 'H'], speeds = [vF, vH];
  if (vS != null) { roles.push('S'); speeds.push(vS); }
  const k = n - roles.length, cap = vH / C.O_H, gap = C.VGAP + 0.005, span = cap - C.V_LO - (k - 1) * gap;
  if (span <= 0) return 'speeds';
  const slow = r.shuffle(Array.from({ length: k }, () => U(0, span)).sort((x, y) => x - y).map((q, j) => C.V_LO + q + j * gap));
  const vR0 = slow.shift();
  roles.push('R'); speeds.push(vR0);
  for (const v of slow) { roles.push('O'); speeds.push(v); }
  const okAt = (g, u) => {
    const e = cam.eye;
    if (Math.hypot(g[0] - e[0], g[1] - e[1], g[2] - e[2]) < C.D_MIN + 0.3) return false;
    const sx = u[2], sz = -u[0];
    for (const [dx, y] of [[0.45, 0], [-0.45, 0], [0, C.HR + 0.05], [0.45, C.HR * 0.8], [-0.45, C.HR * 0.8]]) {
      const p = cam.project(g[0] + sx * dx, y, g[2] + sz * dx);
      if (!(p.z > 0.5 && p.x >= C.PAD + 1 && p.x <= C.W - C.PAD - 1 && p.y >= C.PAD + 1 && p.y <= C.H - C.PAD - 1)) return false;
    }
    const hp = cam.project(g[0], 0, g[2]).y - cam.project(g[0], C.HR, g[2]).y;
    return hp >= C.PX[0] + 0.5 && hp <= C.PX[1] - 0.5;
  };
  const pathOk = (x0, z0, hd, v) => {
    const u = headVec(hd);
    for (let k = 0; k <= 16; k++) { const t = T * k / 16; if (!okAt([x0 + u[0] * v * t, 0, z0 + u[2] * v * t], u)) return false; }
    return true;
  };
  const fromMid = (d, az, hd, v) => { const u = headVec(hd), mx = d * Math.sin(az * DEG), mz = d * Math.cos(az * DEG); return { x0: mx - u[0] * v * T / 2, z0: mz - u[2] * v * T / 2 }; };
  const run = [];
  const tries = 40;
  const sepOk = (x0, z0, hd, v) => {
    const u = headVec(hd);
    for (const q of run) {
      const w = headVec(q.hd);
      for (let k = 0; k <= 20; k++) { const t = T * k / 20; if (Math.hypot(x0 + u[0] * v * t - q.x0 - w[0] * q.v * t, z0 + u[2] * v * t - q.z0 - w[2] * q.v * t) < C.D_SEP + 0.3) return false; }
    }
    return true;
  };
  const place = (role, v, gen) => {
    for (let k = 0; k < tries; k++) {
      const c = gen();
      if (!c) continue;
      if (!pathOk(c.x0, c.z0, c.hd, v) || !sepOk(c.x0, c.z0, c.hd, v)) continue;
      return { role, v: r4(v), x0: r4(c.x0), z0: r4(c.z0), hd: r4(((c.hd % 360) + 540) % 360 - 180) };
    }
    return null;
  };
  const AZ = 17;
  const O_BAND = [[4, 18], [20, 44], [4, 44]][Math.floor(r.raw() * 3)];
  const radial = (dMid, L, lim) => { const dn = Math.max(1, dMid - L / 2); return Math.asin(U(-1, 1) * Math.sin(lim * DEG) * dn / dMid) / DEG; };
  const qF = place('F', vF, () => {
    const L = vF * T, d = U(C.F_NEAR + L / 2, C.F_FAR - L / 2), az = AZ * (U(-1, 1) + U(-1, 1)) / 2;
    if (!(d > 0)) return null;
    const hd = az + radial(d, L, C.F_RAD - 1) + (tgt.dir < 0 ? 180 : 0);
    return { ...fromMid(d, az, hd, vF), hd };
  });
  if (!qF) return 'place-F';
  run.push(qF);
  const qH = place('H', vH, () => { const d = U(20, 44), az = U(-AZ, AZ), hd = az + U(C.H_LAT + 8, 90) * (r.raw() < 0.5 ? 1 : -1); return { ...fromMid(d, az, hd, vH), hd }; });
  if (!qH) return 'place-H';
  run.push(qH);
  const sz = (x, z) => cam.project(x, 0, z).y - cam.project(x, C.HR, z).y;
  const uF = headVec(qF.hd), rhoF = Math.abs(Math.log(sz(qF.x0 + uF[0] * vF * T, qF.z0 + uF[2] * vF * T) / sz(qF.x0, qF.z0)));
  const loomPlace = (role, idx, vMax, dirSign) => {
    const want = U(1.02, 1.15) * rhoF;
    for (let tr = 0; tr < 12; tr++) {
      const az = U(-0.7 * AZ, 0.7 * AZ), ua = headVec(az);
      let dn = null;
      for (let d = 2.5; d <= 12; d += 0.1) if (okAt([d * ua[0], 0, d * ua[2]], ua)) { dn = d; break; }
      if (dn == null) continue;
      dn += U(0, 1.2);
      const hdAway = az + U(-1, 1) * (C.R_RAD - 1), w = headVec(hdAway), Pn = [dn * ua[0], dn * ua[2]];
      const rho = (v) => Math.abs(Math.log(sz(Pn[0], Pn[1]) / sz(Pn[0] + w[0] * v * T, Pn[1] + w[2] * v * T)));
      if (rho(vMax) < want) continue;
      let lo = C.V_LO * 0.5, hi = vMax;
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (rho(mid) < want) lo = mid; else hi = mid; }
      let v = hi;
      for (let moved = true; moved;) { moved = false; for (let j = 1; j < speeds.length; j++) if (j !== idx && Math.abs(v - speeds[j]) < C.VGAP + 0.005) { v = speeds[j] + C.VGAP + 0.006; moved = true; } }
      if (v < C.V_LO || v > vMax) continue;
      const far = [Pn[0] + w[0] * v * T, Pn[1] + w[2] * v * T];
      const c = dirSign > 0 ? { x0: Pn[0], z0: Pn[1], hd: hdAway } : { x0: far[0], z0: far[1], hd: hdAway + 180 };
      if (!pathOk(c.x0, c.z0, c.hd, v)) continue;
      if (!sepOk(c.x0, c.z0, c.hd, v)) continue;
      speeds[idx] = v;
      return { role, v: r4(v), x0: r4(c.x0), z0: r4(c.z0), hd: r4(((c.hd % 360) + 540) % 360 - 180) };
    }
    return null;
  };
  const rDir = r.raw() < 0.5 ? 1 : -1, iRr = roles.indexOf('R');
  let qR = r.raw() < C.LOOM_R ? loomPlace('R', iRr, vH - C.VGAP - 0.05, rDir) : null;
  const vR = speeds[iRr];
  if (!qR) qR = place('R', vR, () => { const d = U(4, 12), az = U(-AZ, AZ), hd = az + radial(d, vR * T, C.R_RAD - 1) + (rDir < 0 ? 180 : 0); return { ...fromMid(d, az, hd, vR), hd }; });
  if (!qR) return 'place-R';
  run.push(qR);
  for (let k2 = 0; k2 < roles.length; k2++) {
    const role = roles[k2];
    if (role !== 'S' && role !== 'O') continue;
    const v = speeds[k2];
    const q = place(role, v, () => {
      const d = role === 'S' ? U(28, 44) : U(...O_BAND), az = U(-AZ, AZ);
      const hd = role === 'S' ? az + U(-(C.S_RAD - 3), C.S_RAD - 3) + (r.raw() < 0.5 ? 180 : 0) : U(-180, 180);
      return { ...fromMid(d, az, hd, v), hd };
    });
    if (!q) return 'place-' + role;
    run.push(q);
  }
  for (let k = 0; k <= 20; k++) {
    const t = T * k / 20;
    const ps = run.map((q) => { const u = headVec(q.hd); return [q.x0 + u[0] * q.v * t, q.z0 + u[2] * q.v * t]; });
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]) < C.D_SEP + 0.3) return 'sep';
  }
  const cols = r.shuffle(PALETTE.slice()).slice(0, run.length);
  m.run = r.shuffle(run.map((q) => ({ ...q, phase: r4(r.raw()) }))).map((q, i) => ({ ...q, color: cols[i] }));
  m.answer = m.run.findIndex((q) => q.role === 'F');
  return m;
}
