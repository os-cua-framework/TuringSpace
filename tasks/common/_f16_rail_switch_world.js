import * as K from './_f16_rail_switch_kit.js';

export const VIEW = { w: 640, h: 400 };
export const CAM = K.makeCam([0, 12, -12], [0, 0, 12], 640, 320, 190);
export const PAL = [
  { name: 'red', c: '#d9453d' }, { name: 'blue', c: '#2f6fd6' }, { name: 'yellow', c: '#e9b824' },
  { name: 'green', c: '#2f9e5b' }, { name: 'purple', c: '#8a56c9' },
];
export const SPEEDS = [1.5, 2, 2.5, 3];
export const TMIN = 8, TMAX = 15;
export const NT = 4;
export const TRAIN_LEN = 2.5;

const E_PTS = [[[-6, 1], [-6, 6], [0, 15], [0, 18]], [[-2, 1], [-2, 8], [0, 13], [0, 18]], [[2, 1], [2, 8], [0, 13], [0, 18]], [[6, 1], [6, 6], [0, 16.5], [0, 18]]];
export const LEAF_X = [-6, -2, 2, 6];
const BRANCH = [
  [[0, 18], [-3, 20.4], [-6, 22], [-6, 22.6]], [[0, 18], [-3, 20.4], [-2, 21.4], [-2, 22.6]],
  [[0, 18], [3, 20.4], [2, 21.4], [2, 22.6]], [[0, 18], [3, 20.4], [6, 22], [6, 22.6]],
];
export const A_POS = [0, 18], B_POS = [[-3, 20.4], [3, 20.4]];
function mkPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
export const ROUTE = E_PTS.map((e) => BRANCH.map((b) => mkPath([...e, ...b.slice(1)])));
export const UA = E_PTS.map((e) => mkPath(e).len);
export const UB = UA.map((ua) => ua + mkPath(BRANCH[0].slice(0, 2)).len);
export function posAt(path, u) {
  const uu = Math.max(0, Math.min(path.len, u));
  let i = 1; while (i < path.pts.length - 1 && path.cum[i] < uu) i++;
  const a = path.pts[i - 1], b = path.pts[i], l = path.cum[i] - path.cum[i - 1] || 1, t = (uu - path.cum[i - 1]) / l;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export function initWorld(m) {
  return { k: 0, a: m.a0, b: m.b0, tr: m.trains.map((t) => ({ u: t.u0, d: 0, decA: false, decB: false, done: false, at: -1 })) };
}
export function step(m, w, act) {
  const n = { k: w.k + 1, a: w.a, b: w.b, tr: w.tr.map((t) => ({ ...t })) };
  if (act === 'A') n.a ^= 1;
  if (act === 'B') n.b ^= 1;
  n.tr.forEach((t, i) => {
    if (t.done) return;
    const e = m.trains[i].entry, u0 = t.u, u1 = u0 + m.trains[i].v;
    if (!t.decA && u0 < UA[e] && u1 >= UA[e]) { t.decA = true; t.d = 2 * n.a; }
    if (!t.decB && t.decA && u0 < UB[e] && u1 >= UB[e]) { t.decB = true; t.d = t.d - (t.d & 1) + n.b; }
    t.u = u1;
    if (t.u >= ROUTE[e][t.d].len) { t.done = true; t.at = t.d; t.doneK = n.k; }
  });
  return n;
}
export function run(m, acts) { let w = initWorld(m); for (const a of acts) w = step(m, w, a); return w; }
export const solved = (m, w) => w.tr.every((t, i) => t.done && t.at === m.trains[i].dest);
export const stepsToFinish = (m, i) => Math.ceil((ROUTE[m.trains[i].entry][m.trains[i].dest].len - m.trains[i].u0) / m.trains[i].v - 1e-9);

const crossStep = (u0, v, U) => Math.ceil((U - u0) / v - 1e-9) - 1;
export function events(m, speedOf = (t) => t.v) {
  const ev = [];
  m.trains.forEach((t, i) => {
    const v = speedOf(t);
    ev.push({ c: crossStep(t.u0, v, UA[t.entry]), sw: 'A', req: t.dest >> 1, i });
    ev.push({ c: crossStep(t.u0, v, UB[t.entry]), sw: 'B', req: t.dest & 1, i });
  });
  return ev;
}
export function windows(ev, sw, init) {
  const list = ev.filter((e) => e.sw === sw).sort((x, y) => x.c - y.c), out = [];
  let cur = init, lo = 0, bad = false;
  for (const e of list) {
    if (e.req !== cur) { if (e.c < lo) bad = true; out.push({ sw, lo, hi: e.c, c: e.c }); cur = e.req; }
    lo = e.c + 1;
  }
  return { out, bad, list };
}
export function planFromEvents(ev, T, a0, b0, strict = true) {
  const wa = windows(ev, 'A', a0), wb = windows(ev, 'B', b0);
  if (strict && (wa.bad || wb.bad)) return null;
  const all = [...wa.out, ...wb.out].sort((x, y) => (x.hi - x.lo) - (y.hi - y.lo));
  const acts = Array(T).fill(null), used = new Set();
  for (const w of all) {
    const hi = Math.min(w.hi, T - 1), mid = Math.floor((w.lo + hi) / 2);
    const cand = []; for (let k = w.lo; k <= hi; k++) cand.push(k);
    cand.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
    const k = cand.find((q) => !used.has(q));
    if (k === undefined) { if (strict) return null; continue; }
    used.add(k); acts[k] = w.sw;
  }
  return acts;
}
export function minWindow(m) {
  const ev = events(m), ws = [...windows(ev, 'A', m.a0).out, ...windows(ev, 'B', m.b0).out];
  return ws.length ? Math.min(...ws.map((w) => w.hi - w.lo + 1)) : 99;
}
export function randomSuccess(m, T) {
  const ev = events(m);
  let p = [[0, 0], [0, 0]]; p[m.a0][m.b0] = 1;
  for (let k = 0; k < T; k++) {
    const q = [[0, 0], [0, 0]];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      q[a][b] += p[a][b] / 3; q[a ^ 1][b] += p[a][b] / 3; q[a][b ^ 1] += p[a][b] / 3;
    }
    for (const e of ev) if (e.c === k) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if ((e.sw === 'A' ? a : b) !== e.req) q[a][b] = 0;
    p = q;
  }
  if (ev.some((e) => e.c >= T)) return 0;
  return p[0][0] + p[0][1] + p[1][0] + p[1][1];
}

const T_OF = (m) => m.T;
export function readerEqual(m, v) {
  const ev = events(m, () => v), plan = planFromEvents(ev, T_OF(m), m.a0, m.b0, false);
  return solved(m, run(m, plan));
}
export function readerScreen(m) {
  const ev = [];
  m.trains.forEach((t, i) => {
    const R = ROUTE[t.entry][t.dest], pr = (u) => { const q = posAt(R, u); return K.project(CAM, [q.x, 0, q.z]); };
    const p0 = pr(t.u0), p1 = pr(t.u0 + t.v), ps = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-6;
    const plen = (U) => { let s = 0, prev = p0; for (let u = t.u0 + 0.25; u < U + 0.125; u += 0.25) { const q = pr(Math.min(u, U)); s += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; } return s; };
    ev.push({ c: Math.max(0, Math.ceil(plen(UA[t.entry]) / ps - 1e-9) - 1), sw: 'A', req: t.dest >> 1, i });
    ev.push({ c: Math.max(0, Math.ceil(plen(UB[t.entry]) / ps - 1e-9) - 1), sw: 'B', req: t.dest & 1, i });
  });
  return solved(m, run(m, planFromEvents(ev, T_OF(m), m.a0, m.b0, false)));
}
export function readerRank(m) {
  const sp = (x, z) => K.project(CAM, [x, 0, z]), pA = sp(...A_POS);
  const dist = (i, P) => { const t = m.trains[i], q = posAt(ROUTE[t.entry][t.dest], t.u0), p = sp(q.x, q.z); return Math.hypot(p[0] - P[0], p[1] - P[1]); };
  const ev = [], rank = m.trains.map((_, i) => i).sort((x, y) => dist(x, pA) - dist(y, pA));
  rank.forEach((i, r) => {
    const t = m.trains[i];
    ev.push({ c: 2 + 3 * r, sw: 'A', req: t.dest >> 1, i });
    ev.push({ c: 4 + 3 * r, sw: 'B', req: t.dest & 1, i });
  });
  return solved(m, run(m, planFromEvents(ev, m.T, m.a0, m.b0, false)));
}

const DARK = '#2a2f36';
function drawSwitchMark(g, pos, label, dirLeft) {
  const s = K.project(CAM, [pos[0], 1.4, pos[1]]), r = 13;
  g.beginPath(); g.arc(s[0], s[1], r, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#27313b'; g.stroke();
  g.fillStyle = '#27313b'; g.font = `800 14px ${K.UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, s[0], s[1] + 0.5);
  const ax = s[0] + (dirLeft ? -r - 11 : r + 11);
  g.fillStyle = '#17a34a'; g.beginPath();
  g.moveTo(ax + (dirLeft ? -9 : 9), s[1]); g.lineTo(ax + (dirLeft ? 6 : -6), s[1] - 8); g.lineTo(ax + (dirLeft ? 6 : -6), s[1] + 8); g.closePath(); g.fill();
}
function strip(g, pts, w, fill) { for (let i = 1; i < pts.length; i++) K.gline(g, CAM, pts[i - 1], pts[i], w, fill); }
function sleepers(g, pts) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    for (let s = 0.5; s < l; s += 1) {
      const c = [a[0] + tx * s, a[1] + tz * s];
      K.gline(g, CAM, [c[0] - tz * 0.85, c[1] + tx * 0.85], [c[0] + tz * 0.85, c[1] - tx * 0.85], 0.28, '#7b5a3c');
    }
  }
}
function rails(g, pts) {
  for (const o of [-0.5, 0.5]) {
    const off = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0] - (b[1] - a[1]) / l * o, p[1] + (b[0] - a[0]) / l * o]; });
    strip(g, off, 0.13, '#59616b');
  }
}
export function drawWorld(g, m, w) {
  const sky = g.createLinearGradient(0, 0, 0, 120); sky.addColorStop(0, '#cfe4f5'); sky.addColorStop(1, '#eef4f8');
  g.fillStyle = sky; g.fillRect(0, 0, VIEW.w, VIEW.h);
  K.gquad(g, CAM, -60, 60, -14, 80, '#bdd3a6');
  K.gquad(g, CAM, -60, 60, 24.9, 80, '#a9c492');
  const a = w.a ? 1 : 0, b = w.b ? 1 : 0;
  const AL = BRANCH[0].slice(0, 2), AR = BRANCH[2].slice(0, 2);
  const forks = [BRANCH[0].slice(1), BRANCH[1].slice(1), BRANCH[2].slice(1), BRANCH[3].slice(1)];
  const edges = [E_PTS[0].slice(0, 3), E_PTS[1].slice(0, 3), E_PTS[2].slice(0, 3), E_PTS[3].slice(0, 3), [[0, 13], [0, 18]], AL, AR, ...forks];
  for (const e of edges) strip(g, e, 1.9, '#b9b3a8');
  const first = (pts, len) => { const out = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length && acc < len; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const t = Math.min(1, (len - acc) / l); out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); acc += l; } return out; };
  [AL, AR].forEach((p, i) => strip(g, first(p, 4.2), 1.9, i === a ? '#6fd08c' : '#d9d5cd'));
  forks.forEach((p, i) => strip(g, first(p, 2.4), 1.9, (i & 1) === b ? '#6fd08c' : '#d9d5cd'));
  for (const e of edges) { sleepers(g, e); rails(g, e); }
  const col = m.stationCol;
  for (const lf of [0, 1, 2, 3]) {
    const x = LEAF_X[lf];
    K.drawBox(g, CAM, { c: [x, 0, 23.8], s: [2.8, 1.5, 2.0], yaw: 0, col: '#e7e3da' });
    K.drawBox(g, CAM, { c: [x, 1.5, 23.8], s: [3.1, 0.4, 2.3], yaw: 0, col: col[lf] });
    K.drawBox(g, CAM, { c: [x, 0, 22.7], s: [1.2, 1.0, 0.12], yaw: 0, col: '#33383f' });
  }
  const pb = B_POS.map((q) => K.project(CAM, [q[0], 1.4, q[1]]));
  g.setLineDash([5, 4]); g.strokeStyle = '#27313b'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(pb[0][0] + 14, pb[0][1]); g.lineTo(pb[1][0] - 14, pb[1][1]); g.stroke(); g.setLineDash([]);
  drawSwitchMark(g, A_POS, 'A', a === 0);
  B_POS.forEach((q) => drawSwitchMark(g, q, 'B', b === 0));
  const items = [];
  w.tr.forEach((t, i) => {
    if (t.done) return;
    const tr = m.trains[i], Rt = ROUTE[tr.entry][t.d];
    [[0.7, 1.25, 0.95], [2.0, 1.1, 0.8]].forEach(([back, d, h], j) => {
      const q = posAt(Rt, t.u - back);
      const bx = { c: [q.x, 0.18, q.z], s: [1.05, h, d], yaw: q.yaw, col: PAL.find((p) => p.name === tr.col).c };
      items.push({ b: bx, dep: K.project(CAM, [q.x, 0, q.z])[2], head: j === 0 ? [Math.sin(q.yaw), Math.cos(q.yaw)] : null });
    });
  });
  items.sort((x, y) => y.dep - x.dep);
  for (const it of items) {
    K.drawBox(g, CAM, { ...it.b, c: [it.b.c[0], 0.0, it.b.c[2]], s: [it.b.s[0] + 0.1, 0.18, it.b.s[2] + 0.1], col: '#3a3f46' }, { edge: false });
    K.drawBox(g, CAM, it.b, { faceCol: it.head ? (f) => ((f.n[0] * it.head[0] + f.n[2] * it.head[1]) > 0.85 ? '#2a2f36' : undefined) : null });
  }
  const cnt = [0, 0, 0, 0];
  w.tr.forEach((t, i) => {
    if (!t.done) return;
    const lf = t.at, tr = m.trains[i], p = K.project(CAM, [LEAF_X[lf] - 0.9 + cnt[lf] * 0.9, 2.4, 23.8]); cnt[lf]++;
    g.beginPath(); g.arc(p[0], p[1] - 4, 8, 0, Math.PI * 2); g.fillStyle = PAL.find((q) => q.name === tr.col).c; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2a2f36'; g.stroke();
    g.strokeStyle = lf === tr.dest ? '#17a34a' : '#e11d48'; g.lineWidth = 3; g.beginPath();
    if (lf === tr.dest) { g.moveTo(p[0] - 4, p[1] - 4); g.lineTo(p[0] - 1, p[1]); g.lineTo(p[0] + 5, p[1] - 9); } else { g.moveTo(p[0] - 4, p[1] - 8); g.lineTo(p[0] + 4, p[1]); g.moveTo(p[0] + 4, p[1] - 8); g.lineTo(p[0] - 4, p[1]); }
    g.stroke();
  });
}
void DARK;
