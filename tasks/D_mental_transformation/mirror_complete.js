import { drawPromptText, ACCENT } from '../core/panel.js';
import * as K from '../common/_colour_kit.js';
import { hash32 } from '../core/style.js';

const BOARD = { w: 340, h: 340 };
const HARD = Object.freeze({ minOff: 2, attempts: 4000 });
const EXTP = Object.freeze({ pairs: 14, holes: 6 });

const PBOARD = { w: 560, h: 440 };
const PPANEL = { panelWidth: PBOARD.w + 20, boardH: PBOARD.h + 10 };
const PG = 26;
const PN = 11;
const POX = 20, POY = 20;
const PC0 = (PN - 1) / 2;
const P = Object.freeze({
  pairs: 16,
  holes: 8,
  minOff: 2,
  minSep: 1.3,
  minSide: 33,
  anchor: [4, 6],
  tol: PG / 2,
  attempts: 4000,
});
const WANTP = 2 * (P.pairs - P.holes);
const VIEW = Object.freeze({
  pitch: [35, 50],
  yaw: [-25, 25],
  dist: [12.5, 18],
  margin: 0.65,
  pad: 8,
  minEdge: 14,
  farGap: 2,
  tries: 80,
  dotR: 0.27,
});

const AXES = [
  { kind: 'v', u: { x: 0, y: 1 } },
  { kind: 'h', u: { x: 1, y: 0 } },
  { kind: 'd', u: { x: Math.SQRT1_2, y: Math.SQRT1_2 } },
  { kind: 'a', u: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } },
];
const AXIS_DIR = { v: [0, 1], h: [1, 0], d: [1, 1], a: [1, -1] };

const far = (p, pts, d) => pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= d);

function mirrorCell(kind, A, c, r) {
  const dc = c - A.c, dr = r - A.r;
  if (kind === 'v') return { c: A.c - dc, r: A.r + dr };
  if (kind === 'h') return { c: A.c + dc, r: A.r - dr };
  if (kind === 'd') return { c: A.c + dr, r: A.r + dc };
  return { c: A.c - dr, r: A.r - dc };
}
function offCells(kind, A, c, r) {
  const dc = c - A.c, dr = r - A.r;
  if (kind === 'v') return dc;
  if (kind === 'h') return dr;
  if (kind === 'd') return dc - dr;
  return dc + dr;
}
function axisSpan(C, u, R) {
  let lo = -1e6, hi = 1e6;
  const cut = (num, den) => {
    if (Math.abs(den) < 1e-9) return;
    const t = num / den;
    if (den > 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
  };
  cut(R.x + R.w - C.x, u.x); cut(C.x - R.x, -u.x);
  cut(R.y + R.h - C.y, u.y); cut(C.y - R.y, -u.y);
  return [lo, hi];
}

const DEG = Math.PI / 180;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const inLatP = (c, r) => c >= 0 && c < PN && r >= 0 && r < PN;
const pxP = (c, r) => ({ x: POX + c * PG, y: POY + r * PG });
const cellP = (p) => ({ c: (p.x - POX) / PG, r: (p.y - POY) / PG });
const hp = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w, w }; };
function inv3(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function camRows(pitch, yaw, dist) {
  const ct = Math.cos(pitch * DEG), st = Math.sin(pitch * DEG), cp = Math.cos(yaw * DEG), sp = Math.sin(yaw * DEG);
  const X = [cp, sp, -PC0 * cp - PC0 * sp];
  const Y = [sp, -cp, -PC0 * sp + PC0 * cp];
  return [X, Y.map((v) => -st * v), [ct * Y[0], ct * Y[1], ct * Y[2] + dist]];
}
function viewH(v) {
  const M = camRows(v.pitch, v.yaw, v.dist);
  const pr = (u, w) => { const z = M[2][0] * u + M[2][1] * w + M[2][2]; return [(M[0][0] * u + M[0][1] * w + M[0][2]) / z, (M[1][0] * u + M[1][1] * w + M[1][2]) / z]; };
  const lo = -VIEW.margin, hi = PN - 1 + VIEW.margin;
  const cs = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]].map(([u, w]) => pr(u, w));
  const xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const F = Math.min((PBOARD.w - 2 * VIEW.pad) / (x1 - x0), (PBOARD.h - 2 * VIEW.pad) / (y1 - y0));
  const cx = PBOARD.w / 2 - F * (x0 + x1) / 2, cy = PBOARD.h / 2 - F * (y0 + y1) / 2;
  const Hc = [0, 1, 2].map((k) => F * M[0][k] + cx * M[2][k]).concat([0, 1, 2].map((k) => F * M[1][k] + cy * M[2][k]), M[2]);
  const T = [1 / PG, 0, -POX / PG, 0, 1 / PG, -POY / PG, 0, 0, 1];
  const H = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H.push(Hc[i * 3] * T[j] + Hc[i * 3 + 1] * T[3 + j] + Hc[i * 3 + 2] * T[6 + j]);
  const s = Math.abs(H[8]);
  return H.map((x) => x / s);
}
const scr = (m, c, r) => hp(m.view.H, POX + c * PG, POY + r * PG);
function snapView(m, x, y) {
  const q = hp(m.view.Hi, x, y);
  if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;
  const back = hp(m.view.H, q.x, q.y);
  if (!(back.w > 0) || Math.hypot(back.x - x, back.y - y) > 0.5) return null;
  const c = (q.x - POX) / PG, r = (q.y - POY) / PG;
  const e = 0.5 + VIEW.margin;
  if (c < -e || c > PN - 1 + e || r < -e || r > PN - 1 + e) return null;
  return { c: Math.min(PN - 1, Math.max(0, Math.round(c))), r: Math.min(PN - 1, Math.max(0, Math.round(r))) };
}
function minEdgePx(m) {
  let best = Infinity;
  for (let c = 0; c < PN; c++) for (let r = 0; r < PN; r++) {
    const a = scr(m, c, r);
    if (c + 1 < PN) { const b = scr(m, c + 1, r); best = Math.min(best, Math.hypot(b.x - a.x, b.y - a.y)); }
    if (r + 1 < PN) { const b = scr(m, c, r + 1); best = Math.min(best, Math.hypot(b.x - a.x, b.y - a.y)); }
  }
  return best;
}
function farGap(m, c, r) {
  const sides = [[PC0, 0, r], [PN - 1, PC0, PN - 1 - c], [PC0, PN - 1, PN - 1 - r], [0, PC0, c]];
  let best = null;
  for (const [u, v, gap] of sides) { const w = scr(m, u, v).w; if (!best || w > best.w) best = { w, gap }; }
  return best.gap;
}

function readScreenMirror(m, lone) {
  const A = m.axis, d = AXIS_DIR[A.kind];
  const p0 = scr(m, A.c, A.r), p1 = scr(m, A.c + d[0], A.r + d[1]);
  const ux = p1.x - p0.x, uy = p1.y - p0.y, L = Math.hypot(ux, uy), ex = ux / L, ey = uy / L;
  const s = scr(m, lone.c, lone.r), t = (s.x - p0.x) * ex + (s.y - p0.y) * ey;
  const fx = p0.x + t * ex, fy = p0.y + t * ey;
  return snapView(m, 2 * fx - s.x, 2 * fy - s.y);
}
function frameMaps(m) {
  const n = PN - 1, P0 = scr(m, 0, 0), P1 = scr(m, n, 0), P2 = scr(m, n, n), P3 = scr(m, 0, n);
  const pts = [[0, 0, P0], [n, 0, P1], [n, n, P2], [0, n, P3]];
  const fitRow = (k) => {
    let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (const [c, r, Q] of pts) { const z = [c, r, 1], y = k ? Q.y : Q.x; for (let i = 0; i < 3; i++) { v[i] += z[i] * y; for (let j = 0; j < 3; j++) S[i][j] += z[i] * z[j]; } }
    const Si = inv3(S.flat());
    return [0, 1, 2].map((i) => Si[i * 3] * v[0] + Si[i * 3 + 1] * v[1] + Si[i * 3 + 2] * v[2]);
  };
  const ax = fitRow(0), ay = fitRow(1);
  const det = ax[0] * ay[1] - ax[1] * ay[0];
  const affine = {
    fwd: (c, r) => ({ x: ax[0] * c + ax[1] * r + ax[2], y: ay[0] * c + ay[1] * r + ay[2] }),
    inv: (x, y) => { const X = x - ax[2], Y = y - ay[2]; return { c: (ay[1] * X - ax[1] * Y) / det, r: (-ay[0] * X + ax[0] * Y) / det }; },
  };
  const bl = (s, t) => ({
    x: (1 - s) * (1 - t) * P0.x + s * (1 - t) * P1.x + s * t * P2.x + (1 - s) * t * P3.x,
    y: (1 - s) * (1 - t) * P0.y + s * (1 - t) * P1.y + s * t * P2.y + (1 - s) * t * P3.y,
  });
  const bilinear = {
    fwd: (c, r) => bl(c / n, r / n),
    inv: (x, y) => {
      let s = 0.5, t = 0.5;
      for (let k = 0; k < 30; k++) {
        const q = bl(s, t), fx = q.x - x, fy = q.y - y;
        const dsx = (1 - t) * (P1.x - P0.x) + t * (P2.x - P3.x), dsy = (1 - t) * (P1.y - P0.y) + t * (P2.y - P3.y);
        const dtx = (1 - s) * (P3.x - P0.x) + s * (P2.x - P1.x), dty = (1 - s) * (P3.y - P0.y) + s * (P2.y - P1.y);
        const D = dsx * dty - dsy * dtx;
        s -= (fx * dty - fy * dtx) / D; t -= (dsx * fy - dsy * fx) / D;
      }
      return { c: s * n, r: t * n };
    },
  };
  return { affine, bilinear };
}
function readLinear(m, lone, map) {
  const s = scr(m, lone.c, lone.r), q = map.inv(s.x, s.y);
  const t = mirrorCell(m.axis.kind, m.axis, Math.round(q.c), Math.round(q.r));
  const k = map.fwd(t.c, t.r);
  return snapView(m, k.x, k.y);
}
function shortcutReads(m) {
  const maps = frameMaps(m), out = { screen: [], affine: [], bilinear: [] };
  for (const ans of m.answers) {
    const a = cellP(ans), lone = mirrorCell(m.axis.kind, m.axis, a.c, a.r);
    out.screen.push(readScreenMirror(m, lone));
    out.affine.push(readLinear(m, lone, maps.affine));
    out.bilinear.push(readLinear(m, lone, maps.bilinear));
  }
  return out;
}
const sameCell = (p, q) => !!p && !!q && p.c === q.c && p.r === q.r;
function viewOk(m) {
  if (minEdgePx(m) < VIEW.minEdge) return false;
  const ans = m.answers.map(cellP);
  if (ans.some((a) => farGap(m, a.c, a.r) < VIEW.farGap)) return false;
  const R = shortcutReads(m);
  return ['screen', 'affine', 'bilinear'].every((k) => R[k].every((q, i) => !sameCell(q, ans[i])));
}
export const _audit = { viewH, scr, snapView, minEdgePx, farGap, shortcutReads, frameMaps, readLinear, readScreenMirror, mirrorCell, offCells, cellP, pxP, VIEW, P, PN };

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  if (!m || m.task !== 'mirror_complete' || !m.axis || !AXES.some((a) => a.kind === m.axis.kind) || !m.view) return false;
  if (m.board?.w !== PBOARD.w || m.board?.h !== PBOARD.h || m.tol !== P.tol) return false;
  if (!m.grid || m.grid.ox !== POX || m.grid.oy !== POY || m.grid.step !== PG || m.grid.cols !== PN || m.grid.rows !== PN) return false;
  if (!Array.isArray(m.markers) || m.markers.length !== WANTP || !Array.isArray(m.answers) || m.answers.length !== 2) return false;
  const A = m.axis, key = (q) => `${q.c},${q.r}`;
  const cells = m.markers.map(cellP);
  if (!cells.every((q) => Number.isInteger(q.c) && Number.isInteger(q.r) && inLatP(q.c, q.r))) return false;
  const have = new Set(cells.map(key));
  if (have.size !== WANTP) return false;
  let pos = 0, neg = 0;
  const orphans = [];
  for (const q of cells) {
    const o = offCells(A.kind, A, q.c, q.r);
    if (Math.abs(o) < P.minOff) return false;
    if (o > 0) pos++; else neg++;
    const t = mirrorCell(A.kind, A, q.c, q.r);
    if (!inLatP(t.c, t.r)) return false;
    if (!have.has(key(t))) orphans.push({ t, side: Math.sign(o) });
  }
  if (pos !== neg || orphans.length !== 2 || orphans[0].side === orphans[1].side) return false;
  const want = orphans.map((o) => key(o.t)).sort().join('|');
  const got = m.answers.map((p) => key(cellP(p))).sort().join('|');
  if (want !== got) return false;
  const v = m.view;
  const turn = Math.round(v.yaw / 90) * 90, dy = v.yaw - turn;
  if (!(v.pitch >= VIEW.pitch[0] && v.pitch <= VIEW.pitch[1] && dy >= VIEW.yaw[0] && dy <= VIEW.yaw[1] && v.dist >= VIEW.dist[0] && v.dist <= VIEW.dist[1])) return false;
  const H = viewH(v);
  if (!Array.isArray(v.H) || v.H.length !== 9 || H.some((x, i) => Math.abs(x - v.H[i]) > 1e-9 * Math.max(1, Math.abs(x)))) return false;
  const Hi = inv3(H);
  if (!Array.isArray(v.Hi) || v.Hi.length !== 9 || Hi.some((x, i) => Math.abs(x - v.Hi[i]) > 1e-9 * Math.max(1, Math.abs(x)))) return false;
  return viewOk(m);
}

function layoutP(rng) {
  const ax = rng.pick(AXES);
  for (let attempt = 0; attempt < P.attempts; attempt++) {
    const A = { c: rng.int(...P.anchor), r: rng.int(...P.anchor) };
    const pos = [], neg = [];
    for (let c = 0; c < PN; c++) for (let r = 0; r < PN; r++) {
      const o = offCells(ax.kind, A, c, r);
      if (Math.abs(o) < P.minOff) continue;
      const t = mirrorCell(ax.kind, A, c, r);
      if (!inLatP(t.c, t.r)) continue;
      (o > 0 ? pos : neg).push({ c, r });
    }
    if (pos.length < P.minSide || neg.length < P.minSide) continue;
    const pairCells = [], used = [];
    for (const cell of rng.shuffle(pos)) {
      if (pairCells.length >= P.pairs) break;
      const twin = mirrorCell(ax.kind, A, cell.c, cell.r);
      const p = { x: cell.c, y: cell.r }, q = { x: twin.c, y: twin.r };
      if (!far(p, used, P.minSep) || !far(q, used.concat([p]), P.minSep)) continue;
      used.push(p, q); pairCells.push({ p: cell, n: twin });
    }
    if (pairCells.length !== P.pairs) continue;
    if (used.some((p, i) => {
      const twinD = Math.hypot(p.x - used[i ^ 1].x, p.y - used[i ^ 1].y);
      return used.every((q, j) => j === i || j === (i ^ 1) || Math.hypot(p.x - q.x, p.y - q.y) > twinD);
    })) continue;
    const order = rng.shuffle(pairCells.map((_, i) => i));
    const gone = order.slice(0, P.holes - 1), iP = order[P.holes - 1], iN = order[P.holes];
    const dropP = new Set([...gone, iP]), dropN = new Set([...gone, iN]);
    const ansP = pairCells[iP].p, unpN = pairCells[iP].n, ansN = pairCells[iN].n, unpP = pairCells[iN].p;
    const shown = [];
    pairCells.forEach((pr, i) => { if (!dropP.has(i)) shown.push(pr.p); if (!dropN.has(i)) shown.push(pr.n); });
    if (shown.length !== WANTP) continue;
    return { ax, A, shown, unp: [unpP, unpN], ans: [ansP, ansN] };
  }
  return null;
}

function generateP(rng) {
  for (let round = 0; round < 200; round++) {
    const L = layoutP(rng);
    if (!L) break;
    const m = {
      task: 'mirror_complete', board: { ...PBOARD }, panel: { ...PPANEL },
      grid: { ox: POX, oy: POY, step: PG, cols: PN, rows: PN },
      plot: { x: POX - PG / 2 - 4, y: POY - PG / 2 - 4, w: PN * PG + 8, h: PN * PG + 8 },
      axis: { kind: L.ax.kind, c: L.A.c, r: L.A.r }, axisPoint: pxP(L.A.c, L.A.r),
      axisAngle: +Math.atan2(L.ax.u.y, L.ax.u.x).toFixed(4),
      u: { x: +L.ax.u.x.toFixed(6), y: +L.ax.u.y.toFixed(6) },
      markers: rng.shuffle(L.shown).map((cl) => pxP(cl.c, cl.r)),
      unpaired: L.unp.map((cl) => pxP(cl.c, cl.r)),
      answers: rng.shuffle(L.ans).map((cl) => pxP(cl.c, cl.r)),
      tol: P.tol,
      view: null,
    };
    for (let k = 0; k < VIEW.tries; k++) {
      const v = { pitch: r4(rng.uniform(...VIEW.pitch)), yaw: r4(90 * rng.int(0, 3) + rng.uniform(...VIEW.yaw)), dist: r4(rng.uniform(...VIEW.dist)), margin: VIEW.margin };
      v.H = viewH(v); v.Hi = inv3(v.H);
      m.view = v;
      if (viewOk(m)) return m;
    }
  }
  throw new Error('mirror_complete: generator exhausted');
}

function polyCells(m, pts) { return pts.map(([c, r]) => scr(m, c, r)); }
function circleCells(m, c, r, rad, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out.push(scr(m, c + rad * Math.cos(t), r + rad * Math.sin(t))); }
  return out;
}
function pathPts(g, pts) { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); }
function drawPerspective(g, br, env) {
  const { manifest: m, state: s } = env, v = m.view, W = br.w, Hh = br.h;
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, W, Hh); g.clip();
  const tg = g.createLinearGradient(0, 0, 0, Hh);
  tg.addColorStop(0, '#9c7a58'); tg.addColorStop(1, '#c39d74');
  g.fillStyle = tg; g.fillRect(0, 0, W, Hh);
  const yawR = v.yaw * DEG, cp = Math.cos(yawR), sp = Math.sin(yawR);
  const w2c = (X, Y) => [cp * X + sp * Y + PC0, PC0 - (-sp * X + cp * Y)];
  g.lineWidth = 1;
  for (let k = -9; k <= 9; k++) {
    const X = k * 2.6 + 0.9, seg = [];
    for (let Y = -14; Y <= 22; Y += 0.5) { const [c, r] = w2c(X, Y); const q = scr(m, c, r); if (q.w > 0) seg.push(q); }
    if (seg.length < 2) continue;
    g.strokeStyle = 'rgba(70,45,25,0.35)';
    g.beginPath(); seg.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke();
    g.strokeStyle = 'rgba(255,235,205,0.12)';
    g.beginPath(); seg.forEach((q, i) => (i ? g.lineTo(q.x + 1, q.y) : g.moveTo(q.x + 1, q.y))); g.stroke();
  }
  const lo = -VIEW.margin, hi = PN - 1 + VIEW.margin;
  const sheet = polyCells(m, [[lo, lo], [hi, lo], [hi, hi], [lo, hi]]);
  g.save();
  g.shadowColor = 'rgba(30,18,8,0.45)'; g.shadowBlur = 10; g.shadowOffsetX = 2; g.shadowOffsetY = 4;
  pathPts(g, sheet); g.fillStyle = '#fbfaf6'; g.fill();
  g.restore();
  const sg = g.createLinearGradient(0, Math.min(...sheet.map((q) => q.y)), 0, Math.max(...sheet.map((q) => q.y)));
  sg.addColorStop(0, 'rgba(120,110,95,0.10)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  pathPts(g, sheet); g.fillStyle = sg; g.fill();
  g.strokeStyle = 'rgba(120,105,85,0.55)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#aab4c0'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < PN; k++) {
    let a = scr(m, k, 0), b = scr(m, k, PN - 1); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    a = scr(m, 0, k); b = scr(m, PN - 1, k); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
  }
  g.stroke();
  const A = m.axis, d = AXIS_DIR[A.kind], dl = Math.hypot(d[0], d[1]);
  const [t0, t1] = axisSpan({ x: A.c, y: A.r }, { x: d[0] / dl, y: d[1] / dl }, { x: -0.35, y: -0.35, w: PN - 1 + 0.7, h: PN - 1 + 0.7 });
  const e0 = scr(m, A.c + d[0] / dl * t0, A.r + d[1] / dl * t0), e1 = scr(m, A.c + d[0] / dl * t1, A.r + d[1] / dl * t1);
  g.strokeStyle = '#d65a4a'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(e0.x, e0.y); g.lineTo(e1.x, e1.y); g.stroke();
  g.fillStyle = '#3d4855';
  for (const p of m.markers) { const q = cellP(p); pathPts(g, circleCells(m, q.c, q.r, VIEW.dotR)); g.fill(); }
  for (const pick of s.picks || []) {
    pathPts(g, circleCells(m, pick.c, pick.r, VIEW.dotR));
    g.fillStyle = 'rgba(25,145,250,.22)'; g.fill(); g.strokeStyle = ACCENT; g.lineWidth = 2.5; g.stroke();
  }
  g.restore();
}

export default {
  meta: {
    name: 'mirror_complete', family: 'D', boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: 'px', y: 'px' }],
    promptHuman: 'Two dots are missing from the mirror image, one on each side of the red line. Click the grid points where they go.',
  },
  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return generateExt(rng);
    return generateP(rng);
  },
  init() { return { picks: [] }; },
  applyAction(s, a, m) {
    if (a.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-op' };
    if (m && m.ext) return applyExt(s, a, m.grid);
    const cell = snapView(m, a.x, a.y);
    if (!cell) return { ok: false, reason: 'off-sheet' };
    const at = s.picks.findIndex((p) => p.c === cell.c && p.r === cell.r);
    if (at >= 0) { s.picks.splice(at, 1); return { ok: true, cleared: true }; }
    s.picks.push({ c: cell.c, r: cell.r, ...pxP(cell.c, cell.r) });
    if (s.picks.length > 2) s.picks.shift();
    return { ok: true, snapped: true };
  },
  verify(s, m) {
    const taken = new Set();
    let hit = 0;
    for (const ans of m.answers) {
      for (let i = 0; i < s.picks.length; i++) {
        if (taken.has(i)) continue;
        if (Math.hypot(s.picks[i].x - ans.x, s.picks[i].y - ans.y) <= m.tol) { taken.add(i); hit++; break; }
      }
    }
    const ok = s.picks.length === m.answers.length && hit === m.answers.length;
    return { success: ok, partial: hit / m.answers.length, error: 1 - hit / m.answers.length, detail: { picks: s.picks.map((p) => ({ x: p.x, y: p.y })) } };
  },
  oracle(m) {
    if (m.ext) return m.answers.map((p) => ({ op: 'click', x: p.x, y: p.y }));
    return m.answers.map((p) => { const q = cellP(p), k = scr(m, q.c, q.r); return { op: 'click', x: k.x, y: k.y }; });
  },
  randomPolicy(m, rnd) {
    if (m.ext) return randomExt(m, rnd);
    const A = m.axis, side = (p) => { const q = cellP(p); return Math.sign(offCells(A.kind, A, q.c, q.r)); };
    return [1, -1].map((sg) => {
      const pool = m.markers.filter((p) => side(p) === sg);
      const q = cellP(pool[Math.floor(rnd() * pool.length)]);
      const t = mirrorCell(A.kind, A, q.c, q.r), k = scr(m, t.c, t.r);
      return { op: 'click', x: k.x, y: k.y };
    });
  },
  async mount(env) { if (env.style) env.assets.look = await styleLook(env.style); },
  drawPrompt(g, r) { drawPromptText(g, r, 'Click where the two missing mirror dots go', 'One is missing on each side of the line'); },
  drawBoard(g, br, env) {
    if (env.manifest.view) { drawPerspective(g, br, env); return; }
    if (env.style && env.assets.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state: s } = env; g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#fafaf8'; g.fillRect(0, 0, br.w, br.h);
    const gr = m.grid, C = m.axisPoint, u = m.u;
    const L = { x: gr.ox, y: gr.oy, w: (gr.cols - 1) * gr.step, h: (gr.rows - 1) * gr.step };
    g.strokeStyle = '#e1e4e8'; g.lineWidth = 1;
    for (let c = 0; c < gr.cols; c++) { const x = gr.ox + c * gr.step; g.beginPath(); g.moveTo(x, L.y); g.lineTo(x, L.y + L.h); g.stroke(); }
    for (let r = 0; r < gr.rows; r++) { const y = gr.oy + r * gr.step; g.beginPath(); g.moveTo(L.x, y); g.lineTo(L.x + L.w, y); g.stroke(); }
    const [t0, t1] = axisSpan(C, u, { x: L.x - 8, y: L.y - 8, w: L.w + 16, h: L.h + 16 });
    g.strokeStyle = '#d65a4a'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(C.x + u.x * t0, C.y + u.y * t0); g.lineTo(C.x + u.x * t1, C.y + u.y * t1); g.stroke();
    g.fillStyle = '#3d4855';
    for (const p of m.markers) { g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2); g.fill(); }
    for (const pick of s.picks || []) {
      g.beginPath(); g.arc(pick.x, pick.y, 6.5, 0, Math.PI * 2); g.fillStyle = 'rgba(25,145,250,.22)'; g.fill();
      g.strokeStyle = ACCENT; g.lineWidth = 2.5; g.stroke();
    }
    g.restore();
  },
  pointer(e) { return e.type === 'down' ? [{ op: 'click', x: e.x, y: e.y }] : []; },
  footerStatus(env) {
    const k = (env.state.picks || []).length;
    return k === 0 ? 'Click a grid point' : `${k} of 2 placed`;
  },
};

const EXT_STEPS = [26, 28, 30];
const EVAL_KEYS = new Set([2980810649, 2299792995, 504685628, 1049473236, 727765176, 3950279876, 1726523706, 3734289956, 969930194, 3573783452, 4237231894, 4169095546]);
function gridGeom(g) {
  return { px: (c, r) => ({ x: g.ox + c * g.step, y: g.oy + r * g.step }), inLat: (c, r) => c >= 0 && c < g.cols && r >= 0 && r < g.rows };
}
function generateExt(rng) {
  let step = rng.pick(EXT_STEPS);
  for (let attempt = 0; attempt < HARD.attempts; attempt++) {
    if (attempt && attempt % 400 === 0) step = rng.pick(EXT_STEPS);
    const maxC = Math.floor((BOARD.w - 28) / step) + 1, maxR = Math.floor((BOARD.h - 28) / step) + 1;
    const cols = rng.int(Math.max(9, maxC - 2), maxC), rows = rng.int(Math.max(8, maxR - 2), maxR);
    const spanX = (cols - 1) * step, spanY = (rows - 1) * step;
    const grid = { ox: Math.round(rng.uniform(14, BOARD.w - 14 - spanX)), oy: Math.round(rng.uniform(14, BOARD.h - 14 - spanY)), step, cols, rows };
    const { px: pxG, inLat: inG } = gridGeom(grid);
    const pairs = EXTP.pairs, holes = EXTP.holes;
    if (pairs - holes < 7) continue;
    const ax = rng.pick(AXES);
    const A = { c: rng.int(Math.floor(cols / 3), Math.ceil(2 * cols / 3) - 1), r: rng.int(Math.floor(rows / 3), Math.ceil(2 * rows / 3) - 1) };
    const pos = [], neg = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const o = offCells(ax.kind, A, c, r);
      if (Math.abs(o) < HARD.minOff) continue;
      const t = mirrorCell(ax.kind, A, c, r);
      if (!inG(t.c, t.r)) continue;
      (o > 0 ? pos : neg).push({ c, r });
    }
    if (pos.length < 24 || neg.length < 24) continue;
    const minSep = 1.3 * step;
    const pairCells = [], used = [];
    for (const cell of rng.shuffle(pos)) {
      if (pairCells.length >= pairs) break;
      const twin = mirrorCell(ax.kind, A, cell.c, cell.r);
      const p = pxG(cell.c, cell.r), q = pxG(twin.c, twin.r);
      if (!far(p, used, minSep) || !far(q, used.concat([p]), minSep)) continue;
      used.push(p, q); pairCells.push({ p: cell, n: twin });
    }
    if (pairCells.length !== pairs) continue;
    if (used.some((p, i) => {
      const twinD = Math.hypot(p.x - used[i ^ 1].x, p.y - used[i ^ 1].y);
      return used.every((q, j) => j === i || j === (i ^ 1) || Math.hypot(p.x - q.x, p.y - q.y) > twinD);
    })) continue;
    const order = rng.shuffle(pairCells.map((_, i) => i));
    const gone = order.slice(0, holes - 1), iP = order[holes - 1], iN = order[holes];
    const dropP = new Set([...gone, iP]), dropN = new Set([...gone, iN]);
    const ansP = pairCells[iP].p, unpN = pairCells[iP].n, ansN = pairCells[iN].n, unpP = pairCells[iN].p;
    const shownCells = [];
    pairCells.forEach((pr, i) => { if (!dropP.has(i)) shownCells.push(pr.p); if (!dropN.has(i)) shownCells.push(pr.n); });
    if (shownCells.length !== 2 * (pairs - holes)) continue;
    const plot = { x: grid.ox - step / 2 - 4, y: grid.oy - step / 2 - 4, w: cols * step + 8, h: rows * step + 8 };
    const out = {
      task: 'mirror_complete', board: BOARD, grid, plot,
      axis: { kind: ax.kind, c: A.c, r: A.r }, axisPoint: pxG(A.c, A.r),
      axisAngle: +Math.atan2(ax.u.y, ax.u.x).toFixed(4), u: { x: +ax.u.x.toFixed(6), y: +ax.u.y.toFixed(6) },
      markers: rng.shuffle(shownCells).map((cl) => pxG(cl.c, cl.r)),
      unpaired: [pxG(unpP.c, unpP.r), pxG(unpN.c, unpN.r)],
      answers: rng.shuffle([ansP, ansN]).map((cl) => pxG(cl.c, cl.r)),
      tol: step / 2, ext: { pairs, holes },
    };
    if (!EVAL_KEYS.has(hash32(semanticKey(out)))) return out;
  }
  throw new Error('mirror_complete: ext generator exhausted');
}
function snapExt(gr, x, y) {
  return { c: Math.min(gr.cols - 1, Math.max(0, Math.round((x - gr.ox) / gr.step))), r: Math.min(gr.rows - 1, Math.max(0, Math.round((y - gr.oy) / gr.step))) };
}
function applyExt(s, a, gr) {
  const cell = snapExt(gr, a.x, a.y), { px: pxG } = gridGeom(gr);
  const at = s.picks.findIndex((p) => p.c === cell.c && p.r === cell.r);
  if (at >= 0) { s.picks.splice(at, 1); return { ok: true, cleared: true }; }
  s.picks.push({ c: cell.c, r: cell.r, ...pxG(cell.c, cell.r) });
  if (s.picks.length > 2) s.picks.shift();
  return { ok: true, snapped: true };
}
function randomExt(m, rnd) {
  const gr = m.grid, { px: pxG } = gridGeom(gr), cellOf = (p) => snapExt(gr, p.x, p.y);
  const A = m.axis, side = (p) => { const q = cellOf(p); return Math.sign(offCells(A.kind, A, q.c, q.r)); };
  return [1, -1].map((sg) => {
    const pool = m.markers.filter((p) => side(p) === sg);
    const q = cellOf(pool[Math.floor(rnd() * pool.length)]);
    const t = mirrorCell(A.kind, A, q.c, q.r);
    return { op: 'click', ...pxG(t.c, t.r) };
  });
}
function gateExt(m) {
  if (!m || m.task !== 'mirror_complete' || !m.axis || !AXES.some((a) => a.kind === m.axis.kind) || !m.grid || !m.ext) return false;
  const gr = m.grid, { pairs, holes } = m.ext;
  if (!EXT_STEPS.includes(gr.step) || gr.cols < 9 || gr.rows < 8 || m.tol !== gr.step / 2) return false;
  if (gr.ox < 14 || gr.oy < 14 || gr.ox + (gr.cols - 1) * gr.step > BOARD.w - 14 || gr.oy + (gr.rows - 1) * gr.step > BOARD.h - 14) return false;
  if (pairs !== EXTP.pairs || holes !== EXTP.holes) return false;
  const WANTX = 2 * (pairs - holes);
  if (!Array.isArray(m.markers) || m.markers.length !== WANTX || !Array.isArray(m.answers) || m.answers.length !== 2) return false;
  const A = m.axis, key = (q) => `${q.c},${q.r}`, { inLat: inG } = gridGeom(gr);
  const cells = m.markers.map((p) => ({ c: (p.x - gr.ox) / gr.step, r: (p.y - gr.oy) / gr.step }));
  if (!cells.every((q) => Number.isInteger(q.c) && Number.isInteger(q.r) && inG(q.c, q.r))) return false;
  const have = new Set(cells.map(key));
  if (have.size !== WANTX) return false;
  let pos = 0, neg = 0;
  const orphans = [];
  for (const q of cells) {
    const o = offCells(A.kind, A, q.c, q.r);
    if (Math.abs(o) < HARD.minOff) return false;
    if (o > 0) pos++; else neg++;
    const t = mirrorCell(A.kind, A, q.c, q.r);
    if (!inG(t.c, t.r)) return false;
    if (!have.has(key(t))) orphans.push({ t, side: Math.sign(o) });
  }
  if (pos !== neg || orphans.length !== 2 || orphans[0].side === orphans[1].side) return false;
  const want = orphans.map((o) => key(o.t)).sort().join('|');
  const got = m.answers.map((p) => key({ c: (p.x - gr.ox) / gr.step, r: (p.y - gr.oy) / gr.step })).sort().join('|');
  return want === got;
}

const SURFACES = [
  { kind: 'paper', fam: 'flat', lum: [0.8, 0.9], line: 'rgba(70,110,160,0.6)' },
  { kind: 'mat', fam: 'fabric', lum: [0.2, 0.3], line: 'rgba(235,240,235,0.62)' },
  { kind: 'pegboard', fam: 'wood', lum: [0.5, 0.65], line: null },
  { kind: 'tiles', fam: 'stone', lum: [0.6, 0.75], line: 'rgba(40,36,32,0.7)' },
  { kind: 'slate', fam: 'concrete', lum: [0.16, 0.24], line: 'rgba(240,240,232,0.6)' },
  { kind: 'plate', fam: 'metal', lum: [0.5, 0.62], line: 'rgba(25,28,32,0.62)' },
];
const DOTS = ['coin', 'button', 'cap', 'pin', 'marble', 'checker'];
const RED_LINES = ['string', 'tape', 'laser', 'paint'];
async function styleLook(st) {
  const surfs = K.inSplit(st, 'mirror_surface', SURFACES, (x) => x.kind), dots = K.inSplit(st, 'mirror_dot', DOTS);
  const [si, di] = st.primaryCombo('mirror-scene', [surfs.length * 9, dots.length]);
  const sf = surfs[si % surfs.length], pool = K.famPool(st, sf.fam), R = st.rand;
  const t = pool[Math.floor(si / surfs.length + R() * pool.length) % pool.length];
  st.note(`mirror_surface:${sf.kind}`); st.note(`mirror_dot:${dots[di]}`);
  st.note(`tex:${t.id}`);
  const img = await K.texImg(t);
  const sw = K.swatch(img, { lum: sf.lum[0] + R() * (sf.lum[1] - sf.lum[0]), contrast: sf.kind === 'paper' ? 0.3 : 0.42, sat: sf.kind === 'mat' ? 0.9 : 0.6,
    tint: sf.kind === 'mat' ? K.pickIn(st, 'mirror_mattint', ['#2f6d55', '#2b4f7a', '#2a2a2e', '#5a5f66']) : null, tintK: sf.kind === 'mat' ? 0.7 : 0 });
  const sm = K.swatchMean(sw), light = K.lumHex(sm) > 0.35;
  const dot = dots[di], red = K.pickIn(st, 'mirror_red', RED_LINES);
  const dotCol = { coin: light ? '#9a7b3a' : '#d8b25a', button: light ? '#2f3a44' : '#ece6d6', cap: light ? '#3f6f9a' : '#c9cdd2', pin: light ? '#1f1f1f' : '#f2d23c', marble: light ? '#2f5f8a' : '#bfe0ff', checker: light ? '#232323' : '#efe7d4' }[dot];
  return { sw, sm, light, sf, dot, dotCol, red, scale: 0.3 + R() * 0.3, off: [R() * 256, R() * 256], lineW: 1.1 + R() * 0.5 };
}
function paintSurface(g, w, h, L, m) {
  const gr = m.grid, x0 = gr.ox, y0 = gr.oy, x1 = gr.ox + (gr.cols - 1) * gr.step, y1 = gr.oy + (gr.rows - 1) * gr.step;
  g.fillStyle = K.pat(g, L.sw, { scale: L.scale, ox: L.off[0], oy: L.off[1] }); g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, 70, w / 2, h / 2, 260); vg.addColorStop(0, 'rgba(255,255,255,0.05)'); vg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  if (L.sf.kind === 'pegboard') {
    for (let c = 0; c < gr.cols; c++) for (let r = 0; r < gr.rows; r++) {
      const x = x0 + c * gr.step, y = y0 + r * gr.step;
      g.beginPath(); g.arc(x, y, 2.6, 0, TAU2); g.fillStyle = 'rgba(15,10,6,0.85)'; g.fill();
      g.beginPath(); g.arc(x + 0.6, y + 0.8, 2.6, 0, Math.PI); g.strokeStyle = 'rgba(255,240,220,0.35)'; g.lineWidth = 0.8; g.stroke();
    }
    g.strokeStyle = 'rgba(40,28,16,0.22)'; g.lineWidth = 0.8;
  } else { g.strokeStyle = L.sf.line; g.lineWidth = L.lineW; }
  for (let c = 0; c < gr.cols; c++) { const x = x0 + c * gr.step; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  for (let r = 0; r < gr.rows; r++) { const y = y0 + r * gr.step; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  if (L.sf.kind === 'tiles') {
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.8;
    for (let c = 0; c < gr.cols; c++) { const x = x0 + c * gr.step + 1.3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  }
  const C = m.axisPoint, u = m.u;
  const [t0, t1] = axisSpan(C, u, { x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 });
  const P0 = [C.x + u.x * t0, C.y + u.y * t0], P1 = [C.x + u.x * t1, C.y + u.y * t1];
  const line = (w2, col) => { g.strokeStyle = col; g.lineWidth = w2; g.beginPath(); g.moveTo(...P0); g.lineTo(...P1); g.stroke(); };
  g.lineCap = L.red === 'tape' ? 'butt' : 'round';
  if (L.red === 'string') { line(3.6, 'rgba(0,0,0,0.3)'); line(2.4, '#c62f28'); g.setLineDash([2, 2]); line(1.2, '#e8695f'); g.setLineDash([]); }
  else if (L.red === 'tape') { line(6, 'rgba(0,0,0,0.25)'); line(5, 'rgba(214,52,44,0.92)'); line(1, 'rgba(255,255,255,0.25)'); }
  else if (L.red === 'laser') { line(7, 'rgba(255,40,30,0.18)'); line(3.5, 'rgba(255,40,30,0.45)'); line(1.6, '#ff3b2f'); }
  else { line(3, '#d0392f'); }
}
function dotStyled(g, L, x, y) {
  const c = L.dotCol, hi = K.mixHex(c, '#ffffff', 0.5), lo = K.shadeHex(c, 0.55), r = 7.5;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 1.2, y + 1.6, r, 0, TAU2); g.fill();
  if (L.dot === 'marble') {
    const gr = g.createRadialGradient(x - 2.5, y - 2.5, 0.5, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, hi); gr.addColorStop(1, lo);
    g.beginPath(); g.arc(x, y, r, 0, TAU2); g.fillStyle = gr; g.fill();
  } else {
    g.beginPath(); g.arc(x, y, r, 0, TAU2); g.fillStyle = c; g.fill(); g.strokeStyle = lo; g.lineWidth = 1.2; g.stroke();
    if (L.dot === 'coin') { g.beginPath(); g.arc(x, y, r - 2, 0, TAU2); g.strokeStyle = hi; g.lineWidth = 0.9; g.stroke(); }
    else if (L.dot === 'button') { g.fillStyle = lo; for (const [dx, dy] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { g.beginPath(); g.arc(x + dx, y + dy, 1, 0, TAU2); g.fill(); } }
    else if (L.dot === 'cap') { g.beginPath(); g.arc(x, y, r - 1.8, 0, TAU2); g.strokeStyle = lo; g.lineWidth = 1; g.stroke(); g.beginPath(); g.arc(x, y, r - 3.5, 0, TAU2); g.fillStyle = hi; g.fill(); }
    else if (L.dot === 'pin') { const gr = g.createRadialGradient(x - 2, y - 2, 0.5, x, y, r); gr.addColorStop(0, hi); gr.addColorStop(1, c); g.beginPath(); g.arc(x, y, r - 1, 0, TAU2); g.fillStyle = gr; g.fill(); }
    else { for (const f of [0.72, 0.45]) { g.beginPath(); g.arc(x, y, r * f, 0, TAU2); g.strokeStyle = lo; g.lineWidth = 1; g.stroke(); } }
  }
  g.restore();
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state: s } = env;
  g.save(); g.translate(br.x, br.y);
  K.layer(env.assets, 'mirror-surface', g, 0, 0, br.w, br.h, (cg) => paintSurface(cg, br.w, br.h, L, m));
  for (const p of m.markers) dotStyled(g, L, p.x, p.y);
  for (const pick of s.picks || []) {
    g.beginPath(); g.arc(pick.x, pick.y, 8, 0, TAU2); g.fillStyle = 'rgba(25,145,250,.3)'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4.5; g.stroke(); g.strokeStyle = ACCENT; g.lineWidth = 2.5; g.stroke();
  }
  g.restore();
}
const TAU2 = Math.PI * 2;

export function semanticKey(m) {
  const g = m.grid, A = m.axis, cell = (p) => `${(p.x - g.ox) / g.step - A.c},${(p.y - g.oy) / g.step - A.r}`;
  return `mirror|${A.kind}|` + m.markers.map(cell).sort().join(';') + '|' + m.answers.map(cell).sort().join(';');
}
