import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { makeCamera } from '../common/_proj3d.js';
import { read2d, copyMargin, sigma, relabelErr, turns } from '../common/_track_spot_match_2d.js';
import { splitIds, nthOf } from '../core/style.js';
import * as X from '../common/_style_pool_mat.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 340 };
const TILE = 0.5;
const HARD = Object.freeze({
  rounds: 1, arms: [2, 3, 4, 5], core: [2, 4], margin: 0.15,
  tol: 0.45, duckGap: 1.6, yaw: [60, 300], pitch: [24, 40], dist: [5.0, 7.0],
  tie: [1 / 1.15, 1.15],
});
const CARD = { w: 118, h: 118 };
const HALF_W = 0.12;
const RAIL_H = 0.2;
const DUCK = 0.62;
const SHADOW = [0.13, 0.1];
const CAM = { fov: 300 };
const TAU = Math.PI * 2;
const READERS = [['sim', false], ['stretch', false], ['affine', false], ['sim', true], ['stretch', true], ['affine', true]];

const ring = (pts) => [...pts, pts[0]];
export function cum(pts) {
  const r = ring(pts), c = [0];
  for (let i = 1; i < r.length; i++) c.push(c[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]));
  return c;
}
const perim = (pts) => cum(pts)[pts.length];
export function cycDist(pts, a, b) { const P = perim(pts); const d = Math.abs(a - b) % P; return Math.min(d, P - d); }
export function pointAt(pts, s) {
  const r = ring(pts), c = cum(pts), P = c[c.length - 1];
  s = ((s % P) + P) % P;
  let i = 1;
  while (i < r.length - 1 && c[i] < s) i++;
  const t = (s - c[i - 1]) / (c[i] - c[i - 1] || 1);
  return { x: r[i - 1][0] + t * (r[i][0] - r[i - 1][0]), z: r[i - 1][1] + t * (r[i][1] - r[i - 1][1]), seg: i - 1, dir: Math.atan2(r[i][1] - r[i - 1][1], r[i][0] - r[i - 1][0]) };
}

const PLUS = [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]];
function crossPts(cols, rows, r0) {
  const W = [0], Z = [0];
  for (let k = 0; k < 3; k++) { W.push(W[k] + cols[k] * TILE); Z.push(Z[k] + rows[k] * TILE); }
  const pts = PLUS.map(([i, j]) => [+(W[i] - W[3] / 2).toFixed(3), +(Z[j] - Z[3] / 2).toFixed(3)]);
  return pts.map((_, i) => pts[(i + r0) % 12]);
}
function shapeProblems(rd) {
  const errs = [];
  if (!Array.isArray(rd.cols) || !Array.isArray(rd.rows) || rd.cols.length !== 3 || rd.rows.length !== 3) return ['dims'];
  const arms = [rd.cols[0], rd.cols[2], rd.rows[0], rd.rows[2]];
  if ([...arms].sort((a, b) => a - b).join() !== HARD.arms.join()) errs.push('arms');
  const core = [rd.cols[1], rd.rows[1]];
  if (!core.every((v) => Number.isInteger(v) && v >= HARD.core[0] && v <= HARD.core[1])) errs.push('core');
  if (!Number.isInteger(rd.r0) || rd.r0 < 0 || rd.r0 > 11) errs.push('r0');
  if (errs.length) return errs;
  const want = crossPts(rd.cols, rd.rows, rd.r0);
  if (!Array.isArray(rd.pts) || rd.pts.length !== 12 || rd.pts.some((p, i) => Math.abs(p[0] - want[i][0]) > 1e-9 || Math.abs(p[1] - want[i][1]) > 1e-9)) errs.push('pts');
  else if (copyMargin(rd.pts) < HARD.margin) errs.push('near-symmetric');
  return errs;
}

function camOf(rd) { return makeCamera({ yaw: rd.yaw, pitch: rd.pitch, dist: rd.dist, cx: 0, cy: 0, fov: CAM.fov, minDepth: 0.3 }); }
const views = new WeakMap();
export function viewOf(rd) {
  let v = views.get(rd);
  if (v) return v;
  const cam = camOf(rd);
  const P = (x, z, y = RAIL_H) => { const q = cam.project({ x, y, z }); return { x: rd.fit.s * q.x + rd.fit.tx, y: rd.fit.s * q.y + rd.fit.ty, depth: q.depth }; };
  const scaleAt = (x, z, y = RAIL_H) => rd.fit.s * CAM.fov / Math.max(0.3, cam.project({ x, y, z }).depth);
  const per = perim(rd.pts), samples = [];
  for (let s = 0; s < per; s += 0.02) { const p = pointAt(rd.pts, s); const q = P(p.x, p.z); samples.push({ s, x: q.x, y: q.y }); }
  v = { cam, P, scaleAt, samples, per };
  views.set(rd, v);
  return v;
}
export function viewCorners(rd) {
  const cam = camOf(rd);
  return rd.pts.map(([x, z]) => { const q = cam.project({ x, y: RAIL_H, z }); return [q.x, q.y]; });
}
export function snapS(rd, x, y) {
  const { samples } = viewOf(rd);
  let best = samples[0], bd = Infinity;
  for (const q of samples) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best.s;
}
const duckPx = (v, p) => Math.max(16, Math.min(40, v.scaleAt(p.x, p.z) * DUCK));
export function duckAt(rd, s) {
  const v = viewOf(rd), p = pointAt(rd.pts, s), q = v.P(p.x, p.z), w = duckPx(v, p);
  return { x: q.x, y: q.y, cx: q.x, cy: q.y - w * 0.42, w };
}

function cardRect(rd) { return rd.card === 'TR' ? { x: BOARD.w - CARD.w - 8, y: 8, ...CARD } : { x: 8, y: 8, ...CARD }; }

function railEdges(pts, hw) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  const nrm = pts.map((a, i) => { const b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [sgn * (b[1] - a[1]) / L, -sgn * (b[0] - a[0]) / L]; });
  const outer = [], inner = [];
  for (let i = 0; i < n; i++) {
    const m = [nrm[(i + n - 1) % n][0] + nrm[i][0], nrm[(i + n - 1) % n][1] + nrm[i][1]];
    outer.push([pts[i][0] + hw * m[0], pts[i][1] + hw * m[1]]);
    inner.push([pts[i][0] - hw * m[0], pts[i][1] - hw * m[1]]);
  }
  return { outer, inner, nrm };
}

function fitPoints(rd) {
  const cam = camOf(rd);
  const pts = [];
  const push = (x, z, y = 0) => { const q = cam.project({ x, y, z }); pts.push([q.x, q.y]); };
  const { outer } = railEdges(rd.pts, HALF_W);
  for (const [x, z] of outer) { push(x, z, 0); push(x, z, RAIL_H); push(x + SHADOW[0], z + SHADOW[1], 0); }
  const per = perim(rd.pts);
  for (let s = 0; s < per; s += 0.1) {
    const p = pointAt(rd.pts, s);
    push(p.x, p.z, RAIL_H + DUCK * 0.95);
    for (const k of [-1, 1]) push(p.x + cam.r.x * DUCK * 0.7 * k, p.z + cam.r.z * DUCK * 0.7 * k, RAIL_H + DUCK * 0.5);
  }
  return pts;
}
function forbidden(card) {
  return [
    { x: card.x - 8, y: card.y - 8, w: card.w + 16, h: card.h + 16 },
  ];
}
function fitView(rd) {
  const P = fitPoints(rd);
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const M = 8;
  const sMax = Math.min((BOARD.w - 2 * M) / (x1 - x0), (BOARD.h - 2 * M) / (y1 - y0));
  let best = null;
  for (const card of ['TL', 'TR']) {
    const F = forbidden(cardRect({ card }));
    for (let s = sMax; s > sMax * 0.45; s *= 0.97) {
      const txLo = M - s * x0, txHi = BOARD.w - M - s * x1, tyLo = M - s * y0, tyHi = BOARD.h - M - s * y1;
      if (txLo > txHi || tyLo > tyHi) continue;
      const cands = [];
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const tx = txLo + (txHi - txLo) * a / 8, ty = tyLo + (tyHi - tyLo) * b / 8;
        cands.push([tx, ty, Math.hypot(a - 4, b - 4)]);
      }
      cands.sort((p, q) => p[2] - q[2]);
      let hit = null;
      for (const [tx, ty] of cands) {
        let ok = true;
        for (const [px, py] of P) {
          const X = s * px + tx, Y = s * py + ty;
          if (F.some((f) => X > f.x && X < f.x + f.w && Y > f.y && Y < f.y + f.h)) { ok = false; break; }
        }
        if (ok) { hit = { s, tx, ty }; break; }
      }
      if (hit) { if (!best || hit.s > best.s + 1e-9) best = { ...hit, card }; break; }
    }
  }
  return best && { card: best.card, fit: { s: +best.s.toFixed(4), tx: +best.tx.toFixed(2), ty: +best.ty.toFixed(2) } };
}

export function cardFrame(rd) {
  const r = cardRect(rd);
  const xs = rd.pts.map((p) => p[0]), zs = rd.pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const inner = { x: r.x + 15, y: r.y + 24, w: r.w - 30, h: r.h - 38 };
  const k = Math.min(inner.w / (x1 - x0 || 1), inner.h / (z1 - z0 || 1));
  const ox = inner.x + inner.w / 2 - k * (x0 + x1) / 2, oy = inner.y + inner.h / 2 - k * (z0 + z1) / 2;
  return { r, k, M: (x, z) => ({ x: ox + k * x, y: oy + k * z }) };
}

export function naiveOverlayS(rd) {
  const f = cardFrame(rd), t = pointAt(rd.pts, rd.target), st = f.M(t.x, t.z);
  const u = (st.x - f.r.x) / f.r.w, w = (st.y - f.r.y) / f.r.h;
  return snapS(rd, u * BOARD.w, w * BOARD.h);
}
export function naiveBoxS(rd) {
  const f = cardFrame(rd), t = pointAt(rd.pts, rd.target), st = f.M(t.x, t.z);
  const cp = rd.pts.map((p) => f.M(p[0], p[1]));
  const cx0 = Math.min(...cp.map((p) => p.x)), cx1 = Math.max(...cp.map((p) => p.x)), cy0 = Math.min(...cp.map((p) => p.y)), cy1 = Math.max(...cp.map((p) => p.y));
  const { samples } = viewOf(rd);
  const vx0 = Math.min(...samples.map((q) => q.x)), vx1 = Math.max(...samples.map((q) => q.x)), vy0 = Math.min(...samples.map((q) => q.y)), vy1 = Math.max(...samples.map((q) => q.y));
  const u = (st.x - cx0) / (cx1 - cx0 || 1), w = (st.y - cy0) / (cy1 - cy0 || 1);
  return snapS(rd, vx0 + u * (vx1 - vx0), vy0 + w * (vy1 - vy0));
}

export function candidates(pts) {
  const c = cum(pts), n = pts.length, out = [];
  const t = turns(pts), convex = Math.sign(t.reduce((a, v) => a + v, 0));
  for (let i = 0; i < n; i++) {
    out.push(c[i]);
    if (t[i] === convex && t[(i + 1) % n] === convex) out.push((c[i] + c[i + 1]) / 2);
  }
  return out.map((s) => +s.toFixed(4));
}
function armEnds(pts) {
  const c = cum(pts), n = pts.length, t = turns(pts), convex = Math.sign(t.reduce((a, v) => a + v, 0)), out = [];
  for (let i = 0; i < n; i++) if (t[i] === convex && t[(i + 1) % n] === convex) out.push(+((c[i] + c[i + 1]) / 2).toFixed(4));
  return out;
}
export function tolOf(rd) {
  const c = cum(rd.pts), n = rd.pts.length;
  for (let i = 0; i < n; i++) {
    if (Math.abs(c[i] - rd.target) < 1e-3) return HARD.tol;
    if (Math.abs((c[i] + c[i + 1]) / 2 - rd.target) < 1e-3) return Math.max(HARD.tol, 0.18 * (c[i + 1] - c[i]));
  }
  return HARD.tol;
}
export function mapStar(rd, L) {
  const c = cum(rd.pts), n = rd.pts.length;
  for (let i = 0; i < n; i++) {
    if (Math.abs(c[i] - rd.target) < 1e-3) return c[sigma(L, i, n)];
    if (Math.abs((c[i] + c[i + 1]) / 2 - rd.target) < 1e-3) {
      const a = sigma(L, i, n), b = sigma(L, (i + 1) % n, n), leg = L.rev ? b : a;
      return (c[leg] + c[leg + 1]) / 2;
    }
  }
  for (let i = 0; i < n; i++) {
    if (rd.target > c[i] && rd.target < c[i + 1]) {
      const f = (rd.target - c[i]) / (c[i + 1] - c[i]), a = sigma(L, i, n), b = sigma(L, (i + 1) % n, n);
      return L.rev ? c[b] + (1 - f) * (c[b + 1] - c[b]) : c[a] + f * (c[a + 1] - c[a]);
    }
  }
  return rd.target;
}
export function seamsOf(pts) {
  const P = perim(pts), out = [];
  for (let k = 0; k * TILE < P - 1e-9; k++) out.push(+(k * TILE).toFixed(4));
  return out;
}
const placesOf = (rd) => (rd.seams ? seamsOf(rd.pts) : candidates(rd.pts));
export function lookAlikes(rd) { return [3, 6, 9].map((j) => mapStar(rd, { rev: false, j })); }
export function readerSpots(rd) {
  const A = rd.pts, B = viewCorners(rd);
  return READERS.map(([kind, mirror]) => mapStar(rd, read2d(kind, A, B, mirror)));
}
function armsOf(rd, P) {
  const n = rd.pts.length, t = turns(rd.pts), convex = Math.sign(t.reduce((a, v) => a + v, 0)), c = cum(rd.pts);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (t[i] !== convex || t[(i + 1) % n] !== convex) continue;
    const a = P[i], b = P[(i + 1) % n], ia = P[(i + n - 1) % n], ib = P[(i + 2) % n];
    const tip = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], base = [(ia[0] + ib[0]) / 2, (ia[1] + ib[1]) / 2];
    out.push({ s: (c[i] + c[i + 1]) / 2, len: Math.hypot(tip[0] - base[0], tip[1] - base[1]), wid: Math.hypot(a[0] - b[0], a[1] - b[1]) });
  }
  return out;
}
const ARM_KEYS = { length: (x) => x.len, slimness: (x) => x.len / x.wid };
export function armReaderMaps(rd) {
  const A = armsOf(rd, rd.pts), B = armsOf(rd, viewCorners(rd));
  const out = {};
  for (const [name, key] of Object.entries(ARM_KEYS)) {
    const rank = (arr) => arr.map((x, i) => [key(x), i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    const ra = rank(A), rb = rank(B);
    out[name] = A.map((_, i) => B[rb[ra.indexOf(i)]].s);
  }
  return out;
}
export function armReaderSpot(rd, name) {
  const key = ARM_KEYS[name], A = armsOf(rd, rd.pts), B = armsOf(rd, viewCorners(rd));
  const rank = (arr) => arr.map((x, i) => [key(x), i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[1]);
  let k = 0;
  A.forEach((x, i) => { if (cycDist(rd.pts, x.s, rd.target) < cycDist(rd.pts, A[k].s, rd.target)) k = i; });
  const ra = rank(A), rb = rank(B), b = rb[ra.indexOf(k)];
  return mapStar(rd, { rev: false, j: 3 * (((b - k) % 4) + 4) % 4 });
}
const hitS = (rd, s) => cycDist(rd.pts, s, rd.target) <= tolOf(rd);
export function tieRatio(rd, kind = 'stretch') {
  const B = viewCorners(rd);
  const e = [0, 3, 6, 9].map((j) => relabelErr(kind, rd.pts, B, { rev: false, j }));
  return e[0] / Math.min(e[1], e[2], e[3]);
}
const inTie = (r) => r >= HARD.tie[0] && r <= HARD.tie[1];
function readersProblem(rd) {
  if (!['sim', 'stretch', 'affine'].every((k) => inTie(tieRatio(rd, k)))) return 'not-a-near-tie';
  if (rd.kind !== 'W' && rd.kind !== 'R') return 'kind';
  const slim = hitS(rd, armReaderSpot(rd, 'slimness'));
  if (slim !== (rd.kind === 'R')) return rd.kind === 'W' ? 'a-2d-reader-finds-it' : 'plain-readers-should-find-it';
  const ok = readerSpots(rd).map((s) => hitS(rd, s));
  if (rd.kind === 'W') return ok.some(Boolean) ? 'a-2d-reader-finds-it' : null;
  return ok[0] && ok[1] && ok[2] ? null : 'plain-readers-should-find-it';
}

function roundProblems(rd, { skipReaders = false } = {}) {
  const errs = shapeProblems(rd);
  if (errs.length) return errs;
  if (!placesOf(rd).some((s) => Math.abs(s - rd.target) < 1e-3)) errs.push('target-not-a-place');
  const P = perim(rd.pts);
  if (!(rd.duck >= 0 && rd.duck < P)) errs.push('duck');
  const gap = Math.max(HARD.duckGap, 3 * tolOf(rd));
  if ([rd.target, ...lookAlikes(rd)].some((s) => cycDist(rd.pts, rd.duck, s) < gap - 1e-6)) errs.push('duck-near-a-look-alike');
  const dy = ((rd.yaw % 360) + 360) % 360;
  if (dy < HARD.yaw[0] || dy > HARD.yaw[1]) errs.push('yaw');
  if (!(rd.pitch >= HARD.pitch[0] && rd.pitch <= HARD.pitch[1])) errs.push('pitch');
  if (!(rd.dist >= HARD.dist[0] && rd.dist <= HARD.dist[1])) errs.push('dist');
  if (!rd.fit || !(rd.fit.s > 0)) return [...errs, 'fit'];
  const F = forbidden(cardRect(rd));
  for (const [px, py] of fitPoints(rd)) {
    const X = rd.fit.s * px + rd.fit.tx, Y = rd.fit.s * py + rd.fit.ty;
    if (X < 4 || X > BOARD.w - 4 || Y < 4 || Y > BOARD.h - 4) { errs.push('out'); break; }
    if (F.some((f) => X > f.x + 2 && X < f.x + f.w - 2 && Y > f.y + 2 && Y < f.y + f.h - 2)) { errs.push('overlap'); break; }
  }
  const a = duckAt(rd, rd.duck);
  for (const s of [rd.target, ...lookAlikes(rd)]) { const b = duckAt(rd, s); if (Math.hypot(a.x - b.x, a.y - b.y) < 40) { errs.push('duck-close-on-screen'); break; } }
  if (!skipReaders) { const e = readersProblem(rd); if (e) errs.push(e); }
  return errs;
}

function genRound(rng, kind, fixed, attempts = 4000, place, seams = false) {
  for (let att = 0; att < attempts; att++) {
    let cols, rows;
    if (fixed) { cols = fixed.cols; rows = fixed.rows; } else {
      const arms = rng.shuffle(HARD.arms);
      cols = [arms[0], rng.int(...HARD.core), arms[1]];
      rows = [arms[2], rng.int(...HARD.core), arms[3]];
    }
    const r0 = rng.int(0, 11);
    const pts = crossPts(cols, rows, r0);
    if (copyMargin(pts) < HARD.margin) continue;
    const yaw = +rng.uniform(HARD.yaw[0], HARD.yaw[1]).toFixed(2);
    const pitch = +rng.uniform(HARD.pitch[0], HARD.pitch[1]).toFixed(2);
    const dist = +rng.uniform(HARD.dist[0], HARD.dist[1]).toFixed(3);
    const rd = { kind, cols, rows, r0, pts, target: 0, duck: 0, yaw, pitch, dist, card: 'TL', fit: null };
    if (seams) rd.seams = true;
    if (!inTie(tieRatio(rd, 'sim'))) continue;
    const ts = tieRatio(rd, 'stretch');
    if (!inTie(ts) || (kind === 'W') !== (ts > 1)) continue;
    if (!inTie(tieRatio(rd, 'affine'))) continue;
    const B = viewCorners(rd), Ls = READERS.map(([k, mi]) => read2d(k, pts, B, mi));
    const ok = (t) => {
      const q = { ...rd, target: t }, hit = Ls.map((L) => hitS(q, mapStar(q, L))), slim = hitS(q, armReaderSpot(q, 'slimness'));
      return kind === 'W' ? !hit.some(Boolean) && !slim : hit[0] && hit[1] && hit[2] && slim;
    };
    const places = (seams ? seamsOf(pts) : candidates(pts)).filter((t) => !place || (Math.abs(pointAt(pts, t).x - place[0]) < 1e-6 && Math.abs(pointAt(pts, t).z - place[1]) < 1e-6)).filter(ok);
    if (!places.length) continue;
    const target = rng.pick(places);
    rd.target = target;
    if (readersProblem(rd)) continue;
    const P = perim(pts);
    const gap = Math.max(HARD.duckGap, 3 * tolOf(rd));
    const avoid = [target, ...lookAlikes(rd)];
    let duck = -1;
    for (let k = 0; k < 30 && duck < 0; k++) { const s = +rng.uniform(0, P).toFixed(4); if (s < P && avoid.every((a) => cycDist(pts, s, a) >= gap)) duck = s; }
    if (duck < 0) continue;
    rd.duck = duck;
    const f = fitView(rd);
    if (!f) continue;
    rd.card = f.card; rd.fit = f.fit;
    if (!roundProblems(rd, { skipReaders: true }).length) return rd;
  }
  return null;
}

export function gate(m) {
  if (m && m.ext && !gateExtFields(m)) return false;
  if (!m || m.task !== 'track_spot_match' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  for (const rd of m.rounds) {
    if (!rd || !Array.isArray(rd.pts) || !rd.pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return false;
    if (rd.card !== 'TL' && rd.card !== 'TR') return false;
    if (!m.ext && rd.seams !== true) return false;
    if (roundProblems(rd).length) return false;
  }
  const t = TASK, s = t.init(m);
  for (const a of t.oracle(m)) t.applyAction(s, a, m);
  return t.verify(s, m).success === true;
}

function fillPoly(g, pts) { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); }
function clipFront(cam, a, b, dmin) {
  const d = (p) => (p[0] - cam.cam.x) * cam.f.x + (0 - cam.cam.y) * cam.f.y + (p[1] - cam.cam.z) * cam.f.z;
  const da = d(a), db = d(b);
  if (da < dmin && db < dmin) return null;
  if (da >= dmin && db >= dmin) return [a, b];
  const t = (dmin - da) / (db - da), m = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return da < dmin ? [m, b] : [a, m];
}
function drawFloor(g, rd, v) {
  const grd = g.createLinearGradient(0, 0, 0, BOARD.h);
  grd.addColorStop(0, '#bdb7ad'); grd.addColorStop(1, '#d2ccc2');
  g.fillStyle = grd; g.fillRect(0, 0, BOARD.w, BOARD.h);
  const gx = rd.pts[0][0], gz = rd.pts[0][1], R = 9, cam = v.cam;
  const P0 = (x, z) => v.P(x, z, 0);
  const k0 = Math.floor((-R - gx) / TILE), k1 = Math.ceil((R - gx) / TILE);
  const l0 = Math.floor((-R - gz) / TILE), l1 = Math.ceil((R - gz) / TILE);
  const fade = (q) => Math.max(0, Math.min(1, 1.3 - q.depth / (rd.dist * 2.6)));
  for (let i = k0; i < k1; i++) for (let j = l0; j < l1; j++) {
    const x = gx + i * TILE, z = gz + j * TILE;
    const c = [[x, z], [x + TILE, z], [x + TILE, z + TILE], [x, z + TILE]];
    if (c.some(([cx, cz]) => cam.project({ x: cx, y: 0, z: cz }).depth < 0.5)) continue;
    const q = c.map(([cx, cz]) => P0(cx, cz));
    if (q.every((p) => p.x < -20) || q.every((p) => p.x > BOARD.w + 20) || q.every((p) => p.y < -20) || q.every((p) => p.y > BOARD.h + 20)) continue;
    const f = fade(q[0]);
    g.fillStyle = (i + j) & 1 ? `rgba(92,84,72,${(0.13 * f).toFixed(3)})` : `rgba(255,255,255,${(0.2 * f).toFixed(3)})`;
    fillPoly(g, q);
  }
  g.lineWidth = 0.8;
  for (const [lines, mk] of [[[k0, k1], (i) => [[gx + i * TILE, -R], [gx + i * TILE, R]]], [[l0, l1], (j) => [[-R, gz + j * TILE], [R, gz + j * TILE]]]]) {
    for (let i = lines[0]; i <= lines[1]; i++) {
      const [A, B] = mk(i), seg = clipFront(cam, A, B, 0.5);
      if (!seg) continue;
      const a = P0(seg[0][0], seg[0][1]), b = P0(seg[1][0], seg[1][1]);
      const lg = g.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, `rgba(80,74,66,${(0.4 * fade(a)).toFixed(3)})`); lg.addColorStop(1, `rgba(80,74,66,${(0.4 * fade(b)).toFixed(3)})`);
      g.strokeStyle = lg; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }
}

function drawTrack(g, rd, v) {
  const { outer, inner, nrm } = railEdges(rd.pts, HALF_W);
  const n = rd.pts.length, cam = v.cam;
  const S = (x, z, y) => v.P(x, z, y);
  g.fillStyle = 'rgba(44,40,36,.42)';
  g.beginPath();
  for (const ring0 of [outer, inner]) {
    ring0.forEach(([x, z], i) => { const q = S(x + SHADOW[0], z + SHADOW[1], 0); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
  }
  g.fill('evenodd');
  const walls = [];
  const eye = [cam.cam.x, cam.cam.y, cam.cam.z];
  for (let i = 0; i < n; i++) {
    for (const [poly, sg] of [[outer, 1], [inner, -1]]) {
      const a = poly[i], b = poly[(i + 1) % n], nx = sg * nrm[i][0], nz = sg * nrm[i][1];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if ((eye[0] - mx) * nx + (eye[2] - mz) * nz <= 0) continue;
      const depth = (mx - eye[0]) * cam.f.x + (RAIL_H / 2 - eye[1]) * cam.f.y + (mz - eye[2]) * cam.f.z;
      const lit = 0.5 + 0.5 * Math.max(0, -0.55 * nx - 0.45 * nz);
      walls.push({ depth, q: [S(a[0], a[1], 0), S(b[0], b[1], 0), S(b[0], b[1], RAIL_H), S(a[0], a[1], RAIL_H)], lit });
    }
  }
  walls.sort((p, q) => q.depth - p.depth);
  for (const w of walls) {
    const c = Math.round(168 + 52 * w.lit);
    g.fillStyle = `rgb(${c},${c},${c + 4})`;
    fillPoly(g, w.q);
    g.strokeStyle = 'rgba(90,92,98,.35)'; g.lineWidth = 0.6; g.stroke();
  }
  g.fillStyle = '#fbfbf8';
  g.beginPath();
  for (const ring0 of [outer, inner]) {
    ring0.forEach(([x, z], i) => { const q = S(x, z, RAIL_H); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
  }
  g.fill('evenodd');
  g.strokeStyle = 'rgba(120,122,128,.5)'; g.lineWidth = 0.7; g.stroke();
}

function drawDuck(g, d, faceLeft) {
  const w = d.w;
  g.save();
  g.translate(d.x, d.y);
  g.fillStyle = 'rgba(20,22,26,.30)';
  g.beginPath(); g.ellipse(0, 0, w * 0.5, w * 0.14, 0, 0, TAU); g.fill();
  if (faceLeft) g.scale(-1, 1);
  const k = w / 36;
  g.scale(k, k);
  g.beginPath();
  g.moveTo(-17, -12); g.quadraticCurveTo(-20, -2, -10, 0); g.lineTo(9, 0); g.quadraticCurveTo(18, -1, 16, -12);
  g.quadraticCurveTo(10, -19, -3, -17); g.quadraticCurveTo(-13, -21, -17, -12); g.closePath();
  g.fillStyle = '#ffd23f'; g.fill(); g.strokeStyle = '#8a6500'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.ellipse(-3, -9, 7, 4.2, -0.2, 0, TAU); g.fillStyle = '#f5c21b'; g.fill();
  g.beginPath(); g.arc(8, -23, 7.5, 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); g.strokeStyle = '#8a6500'; g.stroke();
  g.beginPath(); g.moveTo(14, -24); g.quadraticCurveTo(21, -23, 21.5, -20.5); g.quadraticCurveTo(18, -19, 13.5, -20); g.closePath();
  g.fillStyle = '#ff7a1a'; g.fill(); g.strokeStyle = '#a54a00'; g.lineWidth = 1.1; g.stroke();
  g.beginPath(); g.arc(10, -25, 1.5, 0, TAU); g.fillStyle = '#1b1b1b'; g.fill();
  g.restore();
}

function drawCard(g, rd) {
  const f = cardFrame(rd), r = f.r;
  g.save();
  g.shadowColor = 'rgba(10,20,40,.28)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
  rr(g, r.x, r.y, r.w, r.h, 8); g.fillStyle = '#ffffff'; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#c9d0d8'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#6b7784'; g.font = `700 9.5px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Top view', r.x + 9, r.y + 11);
  {
    const xs = rd.pts.map((p) => p[0]), zs = rd.pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - TILE, x1 = Math.max(...xs) + TILE, z0 = Math.min(...zs) - TILE, z1 = Math.max(...zs) + TILE;
    const a = f.M(x0, z0), b = f.M(x1, z1);
    g.save();
    g.beginPath(); g.rect(a.x, a.y, b.x - a.x, b.y - a.y); g.clip();
    for (let i = 0; x0 + i * TILE <= x1 + 1e-9; i++) for (let j = 0; z0 + j * TILE <= z1 + 1e-9; j++) {
      if ((i + j) & 1) continue;
      const q = f.M(x0 + i * TILE, z0 + j * TILE);
      g.fillStyle = 'rgba(120,128,138,.09)'; g.fillRect(q.x, q.y, TILE * f.k, TILE * f.k);
    }
    g.restore();
  }
  const cp = rd.pts.map((p) => f.M(p[0], p[1]));
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  g.beginPath(); cp.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
  g.strokeStyle = '#8f99a4'; g.lineWidth = Math.max(3.5, Math.min(7, HALF_W * 2 * f.k)); g.stroke();
  const t = pointAt(rd.pts, rd.target), st = f.M(t.x, t.z);
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, R = k % 2 ? 3.6 : 8.2;
    const x = st.x + R * Math.cos(a), y = st.y + R * Math.sin(a);
    if (k) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fillStyle = '#e5322d'; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.stroke();
  g.restore();
}

const TASK = {
  meta: {
    name: 'track_spot_match', family: 'B', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'drag', x: 'board px on the duck', y: 'board px', to: { x: 'board px where its feet go (snapped to the track)', y: 'board px' }, note: 'revisable: a later drag replaces the spot until Verify' }],
    promptHuman: 'Slide the duck to the starred spot',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const kind = rng.pick(['W', 'W', 'R']);
    let rd = null;
    for (let k = 0; !rd && k < 40; k++) rd = genRound(rng, kind, null, 4000, undefined, true);
    if (!rd) rd = { ...JSON.parse(JSON.stringify(FALLBACK[kind === 'W' ? 0 : 1])), seams: true };
    return { task: 'track_spot_match', board: { ...BOARD }, rounds: [rd] };
  },

  init(m) { return { s: m.rounds[0].duck }; },

  applyAction(state, a, m) {
    if (a?.op !== 'drag' || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !a.to || !Number.isFinite(a.to.x) || !Number.isFinite(a.to.y)) return { ok: false, reason: 'bad-action' };
    const rd = m.rounds[0];
    const d = duckAt(rd, state.s);
    const grab = Math.hypot(a.x - d.cx, a.y - d.cy) <= Math.max(20, d.w * 0.75) || Math.hypot(a.x - d.x, a.y - d.y) <= 16;
    if (!grab) return { ok: false, reason: 'not-on-duck' };
    state.s = snapS(rd, a.to.x, a.to.y);
    return { ok: true };
  },

  verify(state, m) {
    const rd = m.rounds[0];
    const dist = cycDist(rd.pts, state.s, rd.target);
    const success = dist <= tolOf(rd);
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { dist: +dist.toFixed(3) } };
  },

  oracle(m) {
    const rd = m.rounds[0];
    const d = duckAt(rd, rd.duck), t = duckAt(rd, rd.target);
    return [{ op: 'drag', x: +d.cx.toFixed(1), y: +d.cy.toFixed(1), to: { x: +t.x.toFixed(1), y: +t.y.toFixed(1) } }];
  },

  oraclePoints(m) {
    const rd = m.rounds[0], d = duckAt(rd, rd.duck), t = duckAt(rd, rd.target);
    return [{ from: [d.cx, d.cy], to: [t.x + d.cx - d.x, t.y + d.cy - d.y] }];
  },

  randomPolicy(m, rnd) {
    const rd = m.rounds[0];
    const d = duckAt(rd, rd.duck);
    return [{ op: 'drag', x: d.cx, y: d.cy, to: { x: rnd() * BOARD.w, y: rnd() * BOARD.h } }];
  },

  async mount(env) {
    env.ui = { drag: null };
    if (env.style) env.assets.trackLook = await mountTrackLook(env);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Slide the duck to the starred spot', 'The card shows the track from above');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const rd = m.rounds[0];
    const v = viewOf(rd);
    g.save();
    g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const TL = env.style ? env.assets.trackLook : null;
    if (TL) X.drawCached(g, TL.cache, 'scene', BOARD.w, BOARD.h, (cg) => paintTrackScene(cg, rd, v, TL));
    else {
    drawFloor(g, rd, v);
    drawTrack(g, rd, v);
    }
    const s = env.ui?.drag ? env.ui.drag.s : state.s;
    const d = duckAt(rd, s);
    const p0 = pointAt(rd.pts, s - 0.05), p1 = pointAt(rd.pts, s + 0.05);
    const a = v.P(p0.x, p0.z), b = v.P(p1.x, p1.z);
    drawDuck(g, d, b.x < a.x);
    drawCard(g, rd);
    g.restore();
  },

  wantsMoveRedraw: true,

  pointer(e, env) {
    if (env.submitted) return [];
    const m = env.manifest, st = env.state, rd = m.rounds[0];
    env.ui = env.ui || { drag: null };
    if (e.type === 'down') {
      const d = duckAt(rd, st.s);
      if (Math.hypot(e.x - d.cx, e.y - d.cy) <= Math.max(20, d.w * 0.75) || Math.hypot(e.x - d.x, e.y - d.y) <= 16) {
        env.ui.drag = { gx: e.x, gy: e.y, ox: e.x - d.x, oy: e.y - d.y, s: st.s };
      }
      return [];
    }
    if (e.type === 'move' && env.ui.drag) {
      env.ui.drag.s = snapS(rd, e.x - env.ui.drag.ox, e.y - env.ui.drag.oy);
      return [];
    }
    if (e.type === 'up' && env.ui.drag) {
      const dr = env.ui.drag; env.ui.drag = null;
      return [{ op: 'drag', x: dr.gx, y: dr.gy, to: { x: e.x - dr.ox, y: e.y - dr.oy } }];
    }
    return [];
  },

  footerStatus(env) {
    return 'Drag the duck along the track';
  },
};

const FALLBACK = [
  {"kind": "W", "cols": [4, 4, 2], "rows": [3, 4, 5], "r0": 10, "pts": [[-2.5, -1.5], [-0.5, -1.5], [-0.5, -3], [1.5, -3], [1.5, -1.5], [2.5, -1.5], [2.5, 0.5], [1.5, 0.5], [1.5, 3], [-0.5, 3], [-0.5, 0.5], [-2.5, 0.5]], "target": 5.5, "duck": 19.3118, "yaw": 117.02, "pitch": 32.65, "dist": 6.039, "card": "TL", "fit": {"s": 0.9258, "tx": 220.83, "ty": 188.73}},
  {"kind": "R", "cols": [4, 3, 2], "rows": [3, 4, 5], "r0": 2, "pts": [[1.25, -1.5], [2.25, -1.5], [2.25, 0.5], [1.25, 0.5], [1.25, 3], [-0.25, 3], [-0.25, 0.5], [-2.25, 0.5], [-2.25, -1.5], [-0.25, -1.5], [-0.25, -3], [1.25, -3]], "target": 8, "duck": 11.5132, "yaw": 117.14, "pitch": 30.48, "dist": 6.151, "card": "TL", "fit": {"s": 1.0411, "tx": 185.52, "ty": 192.33}},
];

export default TASK;
export const __test = { armReaderSpot, naiveOverlayS, naiveBoxS, armReaderMaps, tieRatio, HARD, BOARD, cum, perim, cycDist, pointAt, viewOf, viewCorners, snapS, duckAt, candidates, cardFrame, roundProblems, tolOf, mapStar, lookAlikes, readerSpots, genRound, fitView };

const TRACK_CLASSES = [
  ['224325', -1, -2.5, 'W'], ['224325', 0, -2.5, 'W'], ['224325', 0, -1, 'W'], ['224325', 2, -1, 'W'],
  ['224325', 2, -0.5, 'W'], ['224325', 2, 0, 'W'], ['224325', 0, 0, 'W'], ['224325', 0, 2.5, 'W'],
  ['224325', -0.5, 2.5, 'R'], ['224325', -1, 2.5, 'W'], ['224325', -2, 0, 'R'], ['224325', -2, -0.5, 'R'],
  ['224335', -1, -2.75, 'WR'], ['224335', -0.5, -2.75, 'WR'], ['224335', 0, -2.75, 'WR'], ['224335', 0, -1.25, 'WR'],
  ['224335', 2, -1.25, 'R'], ['224335', 2, -0.5, 'R'], ['224335', 2, 0.25, 'R'], ['224335', 0, 0.25, 'R'],
  ['224335', 0, 2.75, 'WR'], ['224335', -0.5, 2.75, 'WR'], ['224335', -1, 2.75, 'WR'], ['224335', -1, 0.25, 'R'],
  ['224335', -2, 0.25, 'R'], ['224335', -2, -0.5, 'R'], ['224335', -2, -1.25, 'R'], ['224335', -1, -1.25, 'R'],
  ['224345', -1, -3, 'WR'], ['224345', -0.5, -3, 'WR'], ['224345', 0, -3, 'WR'], ['224345', 0, -1.5, 'WR'],
  ['224345', 2, -1.5, 'WR'], ['224345', 2, -0.5, 'R'], ['224345', 2, 0.5, 'WR'], ['224345', 0, 0.5, 'WR'],
  ['224345', 0, 3, 'WR'], ['224345', -0.5, 3, 'WR'], ['224345', -1, 3, 'WR'], ['224345', -1, 0.5, 'R'],
  ['224345', -2, 0.5, 'R'], ['224345', -2, -0.5, 'R'], ['224345', -2, -1.5, 'R'], ['224345', -1, -1.5, 'WR'],
  ['234325', -1.25, -2.5, 'WR'], ['234325', -0.5, -2.5, 'WR'], ['234325', 0.25, -2.5, 'WR'], ['234325', 0.25, -1, 'WR'],
  ['234325', 2.25, -1, 'WR'], ['234325', 2.25, -0.5, 'WR'], ['234325', 2.25, 0, 'WR'], ['234325', 0.25, 0, 'WR'],
  ['234325', 0.25, 2.5, 'WR'], ['234325', -0.5, 2.5, 'WR'], ['234325', -1.25, 2.5, 'WR'], ['234325', -1.25, 0, 'WR'],
  ['234325', -2.25, 0, 'WR'], ['234325', -2.25, -0.5, 'WR'], ['234325', -2.25, -1, 'WR'], ['234325', -1.25, -1, 'WR'],
  ['234335', -1.25, -2.75, 'W'], ['234335', -0.5, -2.75, 'W'], ['234335', 0.25, -2.75, 'W'], ['234335', 0.25, -1.25, 'W'],
  ['234335', 2.25, -1.25, 'W'], ['234335', 2.25, -0.5, 'W'], ['234335', 2.25, 0.25, 'W'], ['234335', 0.25, 0.25, 'W'],
  ['234335', 0.25, 2.75, 'WR'], ['234335', -0.5, 2.75, 'WR'], ['234335', -1.25, 2.75, 'WR'], ['234335', -1.25, 0.25, 'R'],
  ['234335', -2.25, 0.25, 'R'], ['234335', -2.25, -0.5, 'R'], ['234335', -2.25, -1.25, 'R'], ['234335', -1.25, -1.25, 'R'],
  ['234345', -1.25, -3, 'WR'], ['234345', -0.5, -3, 'WR'], ['234345', 0.25, -3, 'WR'], ['234345', 0.25, -1.5, 'WR'],
  ['234345', 2.25, -1.5, 'WR'], ['234345', 2.25, -0.5, 'WR'], ['234345', 2.25, 0.5, 'WR'], ['234345', 0.25, 0.5, 'WR'],
  ['234345', 0.25, 3, 'WR'], ['234345', -0.5, 3, 'R'], ['234345', -1.25, 3, 'WR'], ['234345', -1.25, 0.5, 'R'],
  ['234345', -2.25, 0.5, 'R'], ['234345', -2.25, -0.5, 'R'], ['234345', -2.25, -1.5, 'R'], ['234345', -1.25, -1.5, 'R'],
  ['244325', -1.5, -2.5, 'WR'], ['244325', -0.5, -2.5, 'R'], ['244325', 0.5, -2.5, 'WR'], ['244325', 0.5, -1, 'WR'],
  ['244325', 2.5, -1, 'WR'], ['244325', 2.5, -0.5, 'WR'], ['244325', 2.5, 0, 'WR'], ['244325', 0.5, 0, 'WR'],
  ['244325', 0.5, 2.5, 'WR'], ['244325', -0.5, 2.5, 'WR'], ['244325', -1.5, 2.5, 'WR'], ['244325', -1.5, 0, 'WR'],
  ['244325', -2.5, 0, 'WR'], ['244325', -2.5, -0.5, 'WR'], ['244325', -2.5, -1, 'WR'], ['244325', -1.5, -1, 'WR'],
  ['244345', -1.5, -3, 'W'], ['244345', -0.5, -3, 'W'], ['244345', 0.5, -3, 'W'], ['244345', 0.5, -1.5, 'W'],
  ['244345', 2.5, -1.5, 'W'], ['244345', 2.5, -0.5, 'W'], ['244345', 2.5, 0.5, 'W'], ['244345', 0.5, 0.5, 'W'],
  ['244345', 0.5, 3, 'WR'], ['244345', -0.5, 3, 'WR'], ['244345', -1.5, 3, 'WR'], ['244345', -1.5, 0.5, 'R'],
  ['244345', -2.5, 0.5, 'R'], ['244345', -2.5, -0.5, 'R'], ['244345', -2.5, -1.5, 'R'], ['244345', -1.5, -1.5, 'R'],
].flatMap(([shape, x, z, kinds]) => {
  const t = shape.split('');
  const ms = [t[2], t[1], t[0], t[3], t[4], t[5]].join(''), mx = x === 0 ? 0 : -x;
  return [{ id: `${shape}@${x},${z}`, shape, place: [x, z], kinds }, { id: `${ms}@${mx},${z}`, shape: ms, place: [mx, z], kinds }];
});
function canonPlace(cols, rows, x, z) {
  let t = [cols[0], cols[1], cols[2], rows[0], rows[1], rows[2]], p = [x, z], best = null;
  const rot = ([L, cw, Rr, Tt, ch, B]) => [B, ch, Tt, L, cw, Rr];
  for (let k = 0; k < 4; k++) {
    const id = t.join(''); if (!best || id < best[0]) best = [id, p];
    t = rot(t); p = [-p[1], p[0]];
  }
  const f = (v) => (Math.abs(v) < 5e-4 ? 0 : +v.toFixed(3));
  return `${best[0]}@${f(best[1][0])},${f(best[1][1])}`;
}
export function semanticKey(m) {
  const rd = m.rounds[0], p = pointAt(rd.pts, rd.target);
  return `track|${canonPlace(rd.cols, rd.rows, p.x, p.z)}`;
}
const EVAL_CLASS_KEYS = new Set([
  'track|234325@-0.5,-2.5', 'track|224345@-0.5,3', 'track|244523@-2.5,0', 'track|234533@0.25,1.25',
  'track|234543@0.25,1.5', 'track|224533@0,-2.75', 'track|234325@-1.25,-2.5', 'track|244345@2.5,-0.5',
  'track|234335@0.25,-1.25', 'track|224335@-1,0.25', 'track|244543@0.5,1.5', 'track|224345@-1,0.5',
]);
for (const c of TRACK_CLASSES) c.key = 'track|' + canonPlace(c.shape.slice(0, 3).split('').map(Number), c.shape.slice(3).split('').map(Number), c.place[0], c.place[1]);
const EXT_CLASSES = TRACK_CLASSES.filter((c) => !EVAL_CLASS_KEYS.has(c.key));
const classSplit = splitIds('track_spot_match_classes_r3', EXT_CLASSES.map((c) => c.id), 20);
const classOf = (rd) => EXT_CLASSES.find((c) => c.shape === rd.cols.join('') + rd.rows.join('') && (() => { const p = pointAt(rd.pts, rd.target); return Math.abs(p.x - c.place[0]) < 1e-6 && Math.abs(p.z - c.place[1]) < 1e-6; })());
function generateExt(rng, split, nth) {
  const classes = EXT_CLASSES.filter((c) => classSplit(c.id) === split);
  const first = nth ? nthOf(`track_spot_match|${split}|shape-place`, nth, classes.length) : rng.int(0, classes.length - 1);
  for (let k = 0; k < classes.length; k++) {
    const cls = classes[(first + k) % classes.length], t = cls.shape.split('').map(Number);
    const fixed = { cols: [t[0], t[1], t[2]], rows: [t[3], t[4], t[5]] };
    const kinds = cls.kinds === 'WR' ? [rng.pick(['W', 'W', 'R'])] : [cls.kinds];
    if (cls.kinds === 'WR') kinds.push(kinds[0] === 'W' ? 'R' : 'W');
    for (const kind of kinds) for (let r = 0; r < 30; r++) {
      const rd = genRound(rng, kind, fixed, 1500, cls.place);
      if (rd) return { task: 'track_spot_match', board: { ...BOARD }, ext: split, cls: cls.id, rounds: [rd] };
    }
  }
  throw new Error('track_spot_match: no extended round');
}
function gateExtFields(m) {
  if (m.ext !== 'train' && m.ext !== 'test') return false;
  return Array.isArray(m.rounds) && m.rounds.length === 1 && m.rounds.every((rd) => {
    if (!Array.isArray(rd.cols) || !Array.isArray(rd.rows) || !Array.isArray(rd.pts) || !Number.isFinite(rd.target)) return false;
    const c = classOf(rd);
    return !!c && c.id === m.cls && classSplit(c.id) === m.ext;
  });
}
export const __g18 = { TRACK_CLASSES, classSplit };

const RAILS = [
  { id: 'white_plastic', top: '#fbfbf8', wall: [168, 168, 172], edge: 'rgba(120,122,128,.5)' },
  { id: 'concrete', top: '#d9d6cf', wall: [150, 146, 140], edge: 'rgba(90,86,80,.55)' },
  { id: 'pale_wood', top: '#e8d3ad', wall: [176, 146, 104], edge: 'rgba(110,80,40,.5)' },
  { id: 'steel', top: '#dfe4e8', wall: [140, 150, 160], edge: 'rgba(60,70,80,.55)' },
  { id: 'sky_blue', top: '#d7e9fb', wall: [120, 160, 205], edge: 'rgba(40,80,130,.5)' },
  { id: 'mint', top: '#dff3e6', wall: [120, 180, 145], edge: 'rgba(40,100,70,.5)' },
  { id: 'slate', top: '#c9ced6', wall: [96, 104, 116], edge: 'rgba(30,36,44,.6)' },
  { id: 'terracotta', top: '#ecd2c0', wall: [176, 120, 92], edge: 'rgba(110,60,40,.5)' },
];
const FLOOR_TINTS = [null, null, '#b9a582', '#9fae8c', '#8c9aaa', '#8fb0aa', '#b3a98a', '#a7a0b8', '#a58f78', '#7f8f96'];
const FLOOR_SKIP = /tiles|patern|pattern|hexagonal|cobble|brick|paving|pavement|riverbed|stone_tiles|planks|herringbone/;

async function mountTrackLook(env) {
  const st = env.style, rnd = st.rand;
  const floor = st.primary('tex', (t) => (t.use === 'floor' || t.use === 'flat2d') && !FLOOR_SKIP.test(t.id));
  const hd = st.pick('hdri');
  const rails = X.stylePool(st, 'track_rails', RAILS, 1);
  const rail = rails[X.seqPick(st, 'rail', rails.length)];
  const az = rnd() * Math.PI * 2, len = Math.hypot(...SHADOW) * (0.8 + 0.5 * rnd());
  const lin = (c) => X.linToHex(c.map((v) => Math.min(1, v / Math.max(1e-6, Math.max(...c)) * 0.85)));
  const look = {
    floor: await X.loadTex(floor), rail, cache: new Map(),
    floorLum: 0.18 + 0.3 * rnd(), tone: 0.07 + 0.07 * rnd(), grout: 0.32 + 0.2 * rnd(),
    shadow: [Math.cos(az) * len, Math.sin(az) * len], light: [Math.cos(az), Math.sin(az)],
    sky: hd ? [lin(hd.zenith || [0.6, 0.7, 0.8]), lin(hd.horizon || [0.8, 0.8, 0.8])] : ['#c8d0d8', '#e4e6e8'],
    salt: Math.floor(rnd() * 1e6), tint: X.pickSplit(st, 'track_floor_tints', FLOOR_TINTS.map((c, i) => ({ id: c || `natural${i}`, c })), { minTest: 3 }).c,
  };
  st.note(`floor:${floor.id} rail:${rail.id} light:${Math.round(az * 180 / Math.PI)} hdri:${hd ? hd.id : '-'}`);
  return look;
}

const PX = 36, FR = 12;
function topFloor(rd, L) {
  const key = 'top|' + rd.pts[0].join();
  if (L.cache.has(key)) return L.cache.get(key);
  const gx = rd.pts[0][0], gz = rd.pts[0][1];
  const x0 = gx - Math.ceil((FR + gx) / TILE) * TILE, z0 = gz - Math.ceil((FR + gz) / TILE) * TILE;
  const n = Math.ceil((2 * FR) / TILE) + 2, W = Math.round(n * TILE * PX);
  const c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d');
  const tp = TILE * PX, pat = g.createPattern(L.floor.img, 'repeat');
  g.filter = X.texFilter(L.floor, L.floorLum, 0.75);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const h = X.prng((L.salt + i * 7919 + j * 104729) >>> 0), q = Math.floor(h() * 4);
    if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(i * tp + tp / 2, j * tp + tp / 2).rotateSelf(90 * q).translateSelf(-tp / 2 + h() * 300, -tp / 2 + h() * 300).scaleSelf(0.45, 0.45));
    g.fillStyle = pat; g.fillRect(i * tp, j * tp, tp, tp);
  }
  g.filter = 'none';
  if (L.tint) { g.globalCompositeOperation = 'color'; g.globalAlpha = 0.55; g.fillStyle = L.tint; g.fillRect(0, 0, W, W); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) & 1 ? `rgba(30,24,16,${L.tone.toFixed(3)})` : `rgba(255,255,255,${(L.tone * 1.2).toFixed(3)})`;
    g.fillRect(i * tp, j * tp, tp, tp);
  }
  g.strokeStyle = `rgba(40,34,28,${(0.35 + L.grout).toFixed(3)})`; g.lineWidth = 1.6;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * tp, 0); g.lineTo(i * tp, W); g.stroke(); g.beginPath(); g.moveTo(0, i * tp); g.lineTo(W, i * tp); g.stroke(); }
  const out = { c, x0, z0, W };
  L.cache.set(key, out);
  return out;
}

function paintTrackScene(g, rd, v, L) {
  const sky = g.createLinearGradient(0, 0, 0, BOARD.h);
  sky.addColorStop(0, L.sky[0]); sky.addColorStop(1, L.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, BOARD.w, BOARD.h);
  const T = topFloor(rd, L), cam = v.cam;
  const P0 = (x, z) => v.P(x, z, 0);
  const fadeA = (d) => Math.max(0, Math.min(0.8, d / (rd.dist * 2.6) - 0.35));
  const haze = X.hex2rgb(L.sky[1]);
  const step = 1.0;
  for (let x = T.x0; x < T.x0 + T.W / PX - 1e-6; x += step) for (let z = T.z0; z < T.z0 + T.W / PX - 1e-6; z += step) {
    const c = [[x, z], [x + step, z], [x + step, z + step], [x, z + step]];
    if (c.some(([cx, cz]) => cam.project({ x: cx, y: 0, z: cz }).depth < 0.5)) continue;
    const q = c.map(([cx, cz]) => P0(cx, cz));
    if (q.every((p) => p.x < -20) || q.every((p) => p.x > BOARD.w + 20) || q.every((p) => p.y < -20) || q.every((p) => p.y > BOARD.h + 20)) continue;
    const uv = c.map(([cx, cz]) => [(cx - T.x0) * PX, (cz - T.z0) * PX]);
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const [a, b, d] = tri.map((k) => q[k]), [ua, ub, ud] = tri.map((k) => uv[k]);
      const mx = (a.x + b.x + d.x) / 3, my = (a.y + b.y + d.y) / 3, gr = (p) => { const L0 = Math.hypot(p.x - mx, p.y - my) || 1; return { x: p.x + (p.x - mx) / L0 * 0.7, y: p.y + (p.y - my) / L0 * 0.7 }; };
      const A = gr(a), B = gr(b), D = gr(d);
      const du1 = ub[0] - ua[0], dv1 = ub[1] - ua[1], du2 = ud[0] - ua[0], dv2 = ud[1] - ua[1], det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-9) continue;
      const m11 = ((b.x - a.x) * dv2 - (d.x - a.x) * dv1) / det, m12 = ((d.x - a.x) * du1 - (b.x - a.x) * du2) / det;
      const m21 = ((b.y - a.y) * dv2 - (d.y - a.y) * dv1) / det, m22 = ((d.y - a.y) * du1 - (b.y - a.y) * du2) / det;
      g.save();
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(D.x, D.y); g.closePath(); g.clip();
      g.transform(m11, m21, m12, m22, a.x - m11 * ua[0] - m12 * ua[1], a.y - m21 * ua[0] - m22 * ua[1]);
      g.drawImage(T.c, 0, 0);
      g.restore();
    }
    const rr = Math.hypot(x + step / 2, z + step / 2), fa = Math.min(0.95, Math.max(fadeA((q[0].depth + q[2].depth) / 2), (rr - 0.55 * FR) / (0.45 * FR)));
    if (fa > 0.01) { g.fillStyle = `rgba(${haze[0]},${haze[1]},${haze[2]},${fa.toFixed(3)})`; g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); }
  }
  drawTrackStyled(g, rd, v, L);
}

function drawTrackStyled(g, rd, v, L) {
  const { outer, inner, nrm } = railEdges(rd.pts, HALF_W);
  const n = rd.pts.length, cam = v.cam, S = (x, z, y) => v.P(x, z, y), R = L.rail;
  g.fillStyle = 'rgba(30,26,22,.42)';
  g.beginPath();
  for (const ring0 of [outer, inner]) {
    ring0.forEach(([x, z], i) => { const q = S(x + L.shadow[0], z + L.shadow[1], 0); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
  }
  g.fill('evenodd');
  const walls = [], eye = [cam.cam.x, cam.cam.y, cam.cam.z];
  for (let i = 0; i < n; i++) {
    for (const [poly, sg] of [[outer, 1], [inner, -1]]) {
      const a = poly[i], b = poly[(i + 1) % n], nx = sg * nrm[i][0], nz = sg * nrm[i][1];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if ((eye[0] - mx) * nx + (eye[2] - mz) * nz <= 0) continue;
      const depth = (mx - eye[0]) * cam.f.x + (RAIL_H / 2 - eye[1]) * cam.f.y + (mz - eye[2]) * cam.f.z;
      const lit = 0.5 + 0.5 * Math.max(0, -(L.light[0] * nx + L.light[1] * nz));
      walls.push({ depth, q: [S(a[0], a[1], 0), S(b[0], b[1], 0), S(b[0], b[1], RAIL_H), S(a[0], a[1], RAIL_H)], lit });
    }
  }
  walls.sort((p, q) => q.depth - p.depth);
  for (const w of walls) {
    const k = 0.62 + 0.42 * w.lit;
    g.fillStyle = `rgb(${R.wall.map((c) => Math.round(Math.min(255, c * k))).join(',')})`;
    fillPoly(g, w.q);
    g.strokeStyle = R.edge; g.lineWidth = 0.6; g.stroke();
  }
  g.fillStyle = R.top;
  g.beginPath();
  for (const ring0 of [outer, inner]) {
    ring0.forEach(([x, z], i) => { const q = S(x, z, RAIL_H); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
  }
  g.fill('evenodd');
  g.strokeStyle = R.edge; g.lineWidth = 0.7; g.stroke();
}
