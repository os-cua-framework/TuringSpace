import { drawPromptText } from '../core/panel.js';
import { hull2, inPoly } from '../common/_view3d_common.js';
import { roomLook, drawRoom, drawStackBox } from '../common/_hidden_extent_grid_room.js';
import { splitIds, nthOf, hash32 } from '../core/style.js';

const RING_NEW = ['ring', 'tyre', 'wheel rim', 'rope ring'];
const RING_SPLIT = splitIds('g01_hidden_extent_ring', RING_NEW, 2);
const nounPool = (split) => [...(split === 'train' ? ['hoop'] : []), ...RING_NEW.filter((k) => RING_SPLIT(k) === split)];
const nounOf = (m) => m?.obj || 'hoop';

const PANEL_W = 500;
const BOARD = { w: 480, h: 432 };
const G = 8, CW = BOARD.w / G, CH = BOARD.h / G;
const HW = 6;
const DEP = { x: 9, y: -7 };
const STEP = 0.5;
const FLOOR = [334, 396];
const BOX_H = [34, 64];
const STACK_GAP = 22;
const SEMI = [56, 100];
const RATIO = [0.45, 0.72];
const HARD = Object.freeze({
  minAns: 5, maxAns: 9, hMin: 15, tMin: 15, vertexClear: 11, sideClear: HW + 4,
  minHiddenRun: 40, maxRunFrac: 0.32, minVisibleRun: 30, edgeAngle: 30, visibleFrac: 0.6,
  ringCross: 35, ringGap: 2 * HW + 10, ringCrossOutline: 10, coverFrac: 0.25,
});
const SIN_EDGE = Math.sin((HARD.edgeAngle * Math.PI) / 180);
const SIN_RING = Math.sin((HARD.ringCross * Math.PI) / 180);
const r2 = (v) => Math.round(v * 100) / 100;
const TAU = 2 * Math.PI;

function boxPoly(b) {
  const { x, y, w, h } = b;
  return hull2([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    { x: x + DEP.x, y: y + DEP.y }, { x: x + w + DEP.x, y: y + DEP.y }, { x: x + w + DEP.x, y: y + h + DEP.y }]);
}

function ringAt(r, th, da = 0) {
  const cu = Math.cos(r.phi), su = Math.sin(r.phi), ca = Math.cos(th), sa = Math.sin(th), a = r.a - da, b = r.b - da;
  return { x: r.c.x + a * ca * cu - b * sa * su, y: r.c.y + a * ca * su + b * sa * cu };
}
const ringHalfExtent = (a, b, phi) => ({
  ex: Math.sqrt(a * a * Math.cos(phi) ** 2 + b * b * Math.sin(phi) ** 2),
  ey: Math.sqrt(a * a * Math.sin(phi) ** 2 + b * b * Math.cos(phi) ** 2),
});
function ringQ(r, x, y) {
  const dx = x - r.c.x, dy = y - r.c.y, cu = Math.cos(r.phi), su = Math.sin(r.phi);
  const du = dx * cu + dy * su, dv = -dx * su + dy * cu;
  return (du * du) / (r.a * r.a) + (dv * dv) / (r.b * r.b) - 1;
}
function ringTop(r) {
  const th = Math.atan2(-r.b * Math.cos(r.phi), -r.a * Math.sin(r.phi));
  return ringAt(r, th);
}
function sampleRing(r) {
  const N = 4096, cum = new Float64Array(N + 1);
  let prev = ringAt(r, 0);
  for (let i = 1; i <= N; i++) { const p = ringAt(r, (TAU * i) / N); cum[i] = cum[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  const L = cum[N], pts = [];
  const cu = Math.cos(r.phi), su = Math.sin(r.phi);
  let j = 0;
  for (let t = 0; t < L - 1e-9; t += STEP) {
    while (cum[j + 1] < t) j++;
    const th = (TAU * (j + (t - cum[j]) / (cum[j + 1] - cum[j]))) / N;
    const p = ringAt(r, th);
    const dx = -r.a * Math.sin(th) * cu - r.b * Math.cos(th) * su, dy = -r.a * Math.sin(th) * su + r.b * Math.cos(th) * cu, dl = Math.hypot(dx, dy);
    pts.push({ x: p.x, y: p.y, t, tx: dx / dl, ty: dy / dl });
  }
  return { pts, L };
}

function bucketsOf(list, S = 12) {
  const map = new Map();
  list.forEach((p, i) => { const k = Math.floor(p.x / S) * 4096 + Math.floor(p.y / S); if (!map.has(k)) map.set(k, []); map.get(k).push(i); });
  return { map, S, list };
}
function nearIn(B, x, y, R) {
  const out = [], n = Math.ceil(R / B.S), i0 = Math.floor(x / B.S), j0 = Math.floor(y / B.S);
  for (let di = -n; di <= n; di++) for (let dj = -n; dj <= n; dj++) {
    const arr = B.map.get((i0 + di) * 4096 + j0 + dj); if (!arr) continue;
    for (const i of arr) { const p = B.list[i]; if (Math.hypot(p.x - x, p.y - y) < R) out.push(i); }
  }
  return out;
}
function nearestIn(B, x, y, R) {
  let best = -1, bd = R;
  for (const i of nearIn(B, x, y, R)) { const p = B.list[i], d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } }
  return best < 0 ? null : { i: best, d: bd };
}

const cellOf = (x, y) => ({ i: Math.min(G - 1, Math.max(0, Math.floor(x / CW))), j: Math.min(G - 1, Math.max(0, Math.floor(y / CH))) });
const keyOf = (x, y) => { const c = cellOf(x, y); return c.j * G + c.i; };
const sameSet = (set, key) => [...set].sort((p, q) => p - q).join(',') === key;

function fitCircle(ps) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  const n = ps.length;
  for (const p of ps) { const z = p.x * p.x + p.y * p.y; sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sz += z; sxz += p.x * z; syz += p.y * z; }
  const A = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]];
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  const D = A[0][3] / A[0][0], E = A[1][3] / A[1][1], F = A[2][3] / A[2][2];
  const cx = -D / 2, cy = -E / 2, rr = cx * cx + cy * cy - F;
  return rr > 0 ? { x: cx, y: cy, r: Math.sqrt(rr) } : null;
}

function analyse(m) {
  const fy = m.floorY, W = BOARD.w;
  const boxes = m.stacks.flatMap((st, si) => st.boxes.map((b) => ({ ...b, si })));
  const polys = boxes.map(boxPoly);
  const bbs = polys.map((pl) => ({ x0: Math.min(...pl.map((p) => p.x)), x1: Math.max(...pl.map((p) => p.x)), y0: Math.min(...pl.map((p) => p.y)), y1: Math.max(...pl.map((p) => p.y)) }));
  const inside = (x, y) => { for (let k = 0; k < polys.length; k++) { const b = bbs[k]; if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && inPoly(x, y, polys[k])) return k; } return -1; };
  const near = (x, y, pad) => { for (let k = 0; k < polys.length; k++) { const b = bbs[k]; if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return true; } return false; };
  const rings = m.rings.map((r) => ({ r, ...sampleRing(r) }));
  for (const R of rings) {
    for (const p of R.pts) if (p.x < HW + 6 || p.x > W - HW - 6 || p.y < HW + 6 || p.y > fy - HW - 4) return { ok: false, reason: 'ring-out' };
    const T = ringTop(R.r);
    if (T.y - HW - 18 < 2) return { ok: false, reason: 'hook-out' };
    for (let dy = 0; dy <= HW + 18; dy += 2) for (const dx of [-8, 0, 8]) if (inside(T.x + dx, T.y - dy) >= 0 || near(T.x + dx, T.y - dy, 6)) return { ok: false, reason: 'hook-hidden' };
    const n = R.pts.length;
    R.hidBy = R.pts.map((p) => inside(p.x, p.y));
    const runs = [];
    for (let k = 0; k < n; k++) {
      const h = R.hidBy[k] >= 0;
      if (!runs.length || runs[runs.length - 1].hidden !== h) runs.push({ hidden: h, k0: k, k1: k, stack: h ? boxes[R.hidBy[k]].si : -1 });
      else runs[runs.length - 1].k1 = k;
    }
    if (runs.length === 1) return { ok: false, reason: runs[0].hidden ? 'ring-all-hidden' : 'ring-not-hidden' };
    if (runs[0].hidden === runs[runs.length - 1].hidden) { const last = runs.pop(); runs[0].k0 = last.k0 - n; if (runs[0].hidden && last.stack !== runs[0].stack) return { ok: false, reason: 'run-spans-stacks' }; }
    const len = (r) => (r.k1 - r.k0) * STEP;
    R.runs = runs; R.hiddenRuns = runs.filter((r) => r.hidden);
    if (R.hiddenRuns.some((r) => len(r) < HARD.minHiddenRun)) return { ok: false, reason: 'hidden-run-short' };
    if (R.hiddenRuns.some((r) => len(r) > HARD.maxRunFrac * R.L)) return { ok: false, reason: 'hidden-run-long' };
    if (runs.some((r) => !r.hidden && len(r) < HARD.minVisibleRun)) return { ok: false, reason: 'short-visible-gap' };
    if (R.hiddenRuns.reduce((a, r) => a + len(r), 0) > (1 - HARD.visibleFrac) * R.L) return { ok: false, reason: 'ring-too-hidden' };
    for (const r of R.hiddenRuns) for (let k = r.k0; k <= r.k1; k++) { const q = R.hidBy[(k + n) % n]; if (q >= 0 && boxes[q].si !== r.stack) return { ok: false, reason: 'run-spans-stacks' }; }
  }
  const hid = new Map(), tot = new Map();
  for (const R of rings) R.pts.forEach((p, k) => {
    const key = keyOf(p.x, p.y);
    tot.set(key, (tot.get(key) || 0) + STEP);
    if (R.hidBy[k] >= 0) hid.set(key, (hid.get(key) || 0) + STEP);
  });
  for (const [c, v] of hid) if (v < HARD.hMin || tot.get(c) < HARD.tMin) return { ok: false, reason: 'thin-hidden-cell' };
  const answer = [...hid.keys()].sort((p, q) => p - q);
  if (answer.length < HARD.minAns || answer.length > HARD.maxAns) return { ok: false, reason: 'answer-size', size: answer.length };
  const ans = new Set(answer), key = answer.join(',');
  for (const R of rings) for (let k = 0; k < R.pts.length; k++) {
    if (R.hidBy[k] < 0) continue;
    const p = R.pts[k], gx = Math.round(p.x / CW) * CW, gy = Math.round(p.y / CH) * CH;
    if (Math.hypot(p.x - gx, p.y - gy) < HARD.vertexClear) return { ok: false, reason: 'near-grid-corner' };
    const c = cellOf(p.x, p.y), nb = [];
    if (p.x - c.i * CW < HARD.sideClear && c.i > 0) nb.push(c.j * G + c.i - 1);
    if ((c.i + 1) * CW - p.x < HARD.sideClear && c.i < G - 1) nb.push(c.j * G + c.i + 1);
    if (p.y - c.j * CH < HARD.sideClear && c.j > 0) nb.push((c.j - 1) * G + c.i);
    if ((c.j + 1) * CH - p.y < HARD.sideClear && c.j < G - 1) nb.push((c.j + 1) * G + c.i);
    if (nb.some((q) => !ans.has(q))) return { ok: false, reason: 'hug-grid-line' };
  }
  const hidingStacks = new Set(rings.flatMap((R) => R.hiddenRuns.map((r) => r.stack)));
  const insideStack = (x, y, si) => { const q = inside(x, y); return q >= 0 && boxes[q].si === si; };
  const entryExit = new Set(), chord = new Set(), circ = new Set();
  for (const R of rings) {
    const n = R.pts.length, P = (k) => R.pts[((k % n) + n) % n];
    const vis = R.pts.filter((_, k) => R.hidBy[k] < 0 && k % 4 === 0);
    const fit = fitCircle(vis);
    for (const r of R.hiddenRuns) {
      for (let k = r.k0 - 1; k <= r.k1 + 1; k++) if (R.hidBy[((k % n) + n) % n] < 0 && ans.has(keyOf(P(k).x, P(k).y))) entryExit.add(keyOf(P(k).x, P(k).y));
      for (const k of [r.k0 - 1, r.k1 + 1]) entryExit.add(keyOf(P(k).x, P(k).y));
      const p0 = P(r.k0 - 1), p1 = P(r.k1 + 1), pm = P((r.k0 + r.k1) >> 1);
      const nC = Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / STEP);
      for (let q = 0; q <= nC; q++) { const x = p0.x + ((p1.x - p0.x) * q) / nC, y = p0.y + ((p1.y - p0.y) * q) / nC; if (insideStack(x, y, r.stack)) chord.add(keyOf(x, y)); }
      if (fit) {
        const a0 = Math.atan2(p0.y - fit.y, p0.x - fit.x);
        let d = Math.atan2(p1.y - fit.y, p1.x - fit.x) - a0; d = ((d % TAU) + TAU) % TAU;
        const am = Math.atan2(pm.y - fit.y, pm.x - fit.x);
        let dm = am - a0; dm = ((dm % TAU) + TAU) % TAU;
        const span = dm <= d ? d : d - TAU, nA = Math.ceil((Math.abs(span) * fit.r) / STEP);
        for (let q = 0; q <= nA; q++) { const a = a0 + (span * q) / nA, x = fit.x + fit.r * Math.cos(a), y = fit.y + fit.r * Math.sin(a); if (insideStack(x, y, r.stack)) circ.add(keyOf(x, y)); }
      }
    }
  }
  if (sameSet(chord, key)) return { ok: false, reason: 'chord-shortcut' };
  if (sameSet(circ, key)) return { ok: false, reason: 'circle-shortcut' };
  const edgeOnly = new Set([...entryExit].filter((c) => ans.has(c)));
  if (sameSet(edgeOnly, key)) return { ok: false, reason: 'entry-exit-shortcut' };
  const hidePolys = polys.filter((_, q) => hidingStacks.has(boxes[q].si));
  const cover = [], touch = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    let c = 0;
    for (let u = 0; u < 10; u++) for (let v = 0; v < 10; v++) { const x = (i + (u + 0.5) / 10) * CW, y = (j + (v + 0.5) / 10) * CH; if (hidePolys.some((pl) => inPoly(x, y, pl))) c++; }
    if (c / 100 >= HARD.coverFrac) cover.push(j * G + i);
    if (c > 0) touch.push(j * G + i);
  }
  if (cover.join(',') === key) return { ok: false, reason: 'cover-shortcut' };
  if (touch.join(',') === key) return { ok: false, reason: 'touch-shortcut' };
  const outline = [];
  for (const poly of polys) {
    const cen = { x: poly.reduce((a2, p) => a2 + p.x, 0) / poly.length, y: poly.reduce((a2, p) => a2 + p.y, 0) / poly.length };
    for (let e = 0; e < poly.length; e++) {
      const a = poly[e], b = poly[(e + 1) % poly.length];
      const el = Math.hypot(b.x - a.x, b.y - a.y);
      let nx = (b.y - a.y) / el, ny = -(b.x - a.x) / el;
      if ((a.x - cen.x) * nx + (a.y - cen.y) * ny < 0) { nx = -nx; ny = -ny; }
      for (let u = 0; u <= el; u += 1) {
        const p = { x: a.x + ((b.x - a.x) * u) / el, y: a.y + ((b.y - a.y) * u) / el };
        if (inside(p.x + nx * 1.5, p.y + ny * 1.5) >= 0) continue;
        outline.push({ x: p.x, y: p.y, ex: (b.x - a.x) / el, ey: (b.y - a.y) / el });
      }
    }
  }
  const OB = bucketsOf(outline);
  for (const R of rings) {
    const n = R.pts.length;
    R.crossT = [];
    for (const r of R.hiddenRuns) for (const k of [r.k0, r.k1]) {
      const p = R.pts[((k % n) + n) % n];
      R.crossT.push(p.t);
      const best = nearestIn(OB, p.x, p.y, 4);
      if (!best) return { ok: false, reason: 'crossing-off-outline' };
      const o = outline[best.i];
      if (Math.abs(o.ex * p.ty - o.ey * p.tx) < SIN_EDGE) return { ok: false, reason: 'shallow-crossing' };
    }
  }
  const reach = HARD.sideClear / SIN_EDGE + 2;
  const tDist = (R, a, b) => { const d = Math.abs(a - b); return Math.min(d, R.L - d); };
  const RB = rings.map((R) => bucketsOf(R.pts));
  for (const o of outline) {
    for (let q = 0; q < rings.length; q++) {
      const nb = nearestIn(RB[q], o.x, o.y, HARD.sideClear);
      if (nb && !rings[q].crossT.some((t) => tDist(rings[q], t, rings[q].pts[nb.i].t) <= reach)) return { ok: false, reason: 'grazes-outline' };
    }
  }
  const reachR = HARD.ringGap / SIN_RING + 2;
  for (let A = 0; A < rings.length; A++) for (let B = 0; B < rings.length; B++) {
    if (A === B) continue;
    const RA = rings[A], rB = rings[B].r, n = RA.pts.length, xs = [];
    if (Math.hypot(RA.r.c.x - rB.c.x, RA.r.c.y - rB.c.y) < 30) return { ok: false, reason: 'rings-concentric' };
    for (let k = 0; k < n; k++) {
      const p = RA.pts[k], q = RA.pts[(k + 1) % n];
      if ((ringQ(rB, p.x, p.y) < 0) !== (ringQ(rB, q.x, q.y) < 0)) {
        const nb = nearestIn(RB[B], p.x, p.y, 3);
        if (!nb) return { ok: false, reason: 'ring-cross-lost' };
        const s = rings[B].pts[nb.i];
        if (Math.abs(p.tx * s.ty - p.ty * s.tx) < SIN_RING) return { ok: false, reason: 'rings-shallow-cross' };
        if (nearestIn(OB, p.x, p.y, HARD.ringCrossOutline)) return { ok: false, reason: 'rings-cross-at-outline' };
        xs.push(p.t);
      }
    }
    for (const p of RA.pts) if (nearestIn(RB[B], p.x, p.y, HARD.ringGap) && !xs.some((t) => tDist(RA, t, p.t) <= reachR)) return { ok: false, reason: 'rings-graze' };
  }
  return { ok: true, answer, hiding: [...hidingStacks].sort() };
}

function stackTo(rng, x, w, H, fy, even = false) {
  if (fy - H + DEP.y < 10) return null;
  const feas = [1, 2, 3, 4].filter((n) => H >= n * BOX_H[0] && H <= n * BOX_H[1]);
  if (!feas.length) return null;
  const n = rng.pick(feas);
  const hs = [];
  let left = H;
  for (let q = 0; q < n; q++) {
    const rest = n - q - 1;
    const lo = Math.max(BOX_H[0], left - rest * BOX_H[1]), hi = Math.min(BOX_H[1], left - rest * BOX_H[0]);
    if (lo > hi) return null;
    const h = q === n - 1 ? left : rng.int(Math.ceil(lo), Math.floor(hi));
    hs.push(h); left -= h;
  }
  const boxes = [];
  let y = fy;
  hs.forEach((bh, q) => {
    const bw = q === 0 || even ? w : Math.max(44, Math.min(w, w + rng.int(-14, 4)));
    const bx = even ? x : Math.round(x + (w - bw) / 2 + (q === 0 ? 0 : rng.int(-3, 3)));
    y -= bh;
    boxes.push({ x: bx, y, w: bw, h: bh });
  });
  return { boxes };
}

function makeScene(rng) {
  const fy = rng.int(FLOOR[0], FLOOR[1]), W = BOARD.w;
  const nR = 2;
  const rings = [];
  for (let k = 0; k < nR; k++) {
    let made = null;
    for (let tries = 0; tries < 30 && !made; tries++) {
      const a = rng.uniform(SEMI[0], nR === 3 ? SEMI[1] - 12 : SEMI[1]), b = a * rng.uniform(RATIO[0], RATIO[1]), phi = rng.uniform(0, Math.PI);
      const { ex, ey } = ringHalfExtent(a, b, phi);
      const xLo = ex + HW + 8, xHi = W - ex - HW - 8, yLo = ey + HW + 26, yHi = fy - ey - HW - 8;
      if (xLo > xHi || yLo > yHi) continue;
      const c = { x: r2(rng.uniform(xLo, xHi)), y: r2(rng.uniform(yLo, yHi)) };
      if (rings.some((q) => Math.hypot(q.c.x - c.x, q.c.y - c.y) < 40)) continue;
      if (rings.length && rng.raw() < 0.75 && !rings.some((q) => { const e = ringHalfExtent(q.a, q.b, q.phi); return Math.abs(q.c.x - c.x) < e.ex + ex - 20 && Math.abs(q.c.y - c.y) < e.ey + ey - 20; })) continue;
      made = { c, a: r2(a), b: r2(b), phi: r2(phi) };
    }
    if (!made) return null;
    rings.push(made);
  }
  const stacks = [], spans = [];
  const free = (x0, x1) => x0 >= 6 && x1 <= W - 6 && !spans.some(([s0, s1]) => x0 < s1 + STACK_GAP && x1 > s0 - STACK_GAP);
  const targets = rings.map((_, k) => k);
  if (rng.raw() < 0.3) targets.push(rng.int(0, nR - 1));
  const coarse = (rects) => {
    for (const r of rings) {
      const T = ringTop(r);
      if (rects.some((q) => T.x > q.x0 - 16 && T.x < q.x1 + 16 && T.y - HW - 20 > q.top - 6)) return false;
      const n = 240, hid = [];
      for (let i = 0; i < n; i++) { const p = ringAt(r, (TAU * i) / n); hid.push(rects.some((q) => p.x >= q.x0 && p.x <= q.x1 && p.y >= q.top)); }
      const total = hid.filter(Boolean).length / n;
      if (total > 0.38) return false;
      let run = 0, start = hid.indexOf(false);
      if (start < 0) return false;
      for (let i = 1; i <= n; i++) {
        if (hid[(start + i) % n]) run++;
        else { if (run && (run / n < 0.08 || run / n > 0.3)) return false; run = 0; }
      }
    }
    return true;
  };
  const rects = [];
  for (const k of rng.shuffle(targets)) {
    const r = rings[k], { ey } = ringHalfExtent(r.a, r.b, r.phi);
    for (let tries = 0; tries < 24; tries++) {
      const p = ringAt(r, rng.uniform(0, TAU));
      if (p.y < r.c.y - 0.25 * ey) continue;
      const w = rng.int(44, 110), x0 = Math.round(p.x - rng.uniform(14, w - 14));
      if (!free(x0, x0 + w + DEP.x)) continue;
      const H = Math.round(fy - (p.y - rng.uniform(10, 60)));
      const rect = { x0: x0 - 1, x1: x0 + w + DEP.x + 1, top: fy - H + DEP.y - 1 };
      if (!coarse([...rects, rect])) continue;
      const st = stackTo(rng, x0, w, H, fy, true);
      if (!st) continue;
      stacks.push(st); spans.push([x0, x0 + w + DEP.x]); rects.push(rect);
      break;
    }
  }
  if (stacks.length < 4 && rng.raw() < 0.55) {
    for (let tries = 0; tries < 6; tries++) {
      const w = rng.int(50, 96), x0 = rng.int(6, W - 6 - w - DEP.x);
      if (!free(x0, x0 + w + DEP.x)) continue;
      const H = rng.int(40, 220);
      if (!coarse([...rects, { x0: x0 - 1, x1: x0 + w + DEP.x + 1, top: fy - H + DEP.y - 1 }])) continue;
      const st = stackTo(rng, x0, w, H, fy);
      if (st) { stacks.push(st); spans.push([x0, x0 + w + DEP.x]); }
      break;
    }
  }
  if (stacks.length < 2) return null;
  stacks.sort((p, q) => p.boxes[0].x - q.boxes[0].x);
  return { floorY: fy, stacks, rings };
}

const DEFAULT_SKIN = { mode: 'stripes', a: '#1f8fd6', b: '#f7f5f0', outline: '#2a2622', band: 17 };
function ringPath(g, r, th0, th1, da = 0, closed = false) {
  const n = Math.max(2, Math.ceil(Math.abs(th1 - th0) / 0.01));
  g.beginPath();
  for (let i = 0; i <= n; i++) { const p = ringAt(r, th0 + ((th1 - th0) * i) / n, da); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
  if (closed) g.closePath();
}
function drawRing(g, r, O, clamps) {
  const T = ringTop(r);
  g.save();
  g.strokeStyle = clamps[0]; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(T.x, T.y - HW - 12); g.lineTo(T.x, T.y - HW + 2); g.stroke();
  g.fillStyle = clamps[1]; g.fillRect(T.x - 6, T.y - HW - 16, 12, 6);
  g.lineCap = 'butt'; g.lineJoin = 'round';
  g.strokeStyle = O.outline; g.lineWidth = HW * 2 + 2.5;
  ringPath(g, r, 0, TAU, 0, true); g.stroke();
  const { L } = { L: Math.PI * (3 * (r.a + r.b) - Math.sqrt((3 * r.a + r.b) * (r.a + 3 * r.b))) };
  const seg = (th0, th1, col) => { g.strokeStyle = col; g.lineWidth = HW * 2 - 0.5; ringPath(g, r, th0, th1); g.stroke(); };
  if (O.mode === 'marks') {
    seg(0, TAU, O.a);
    const n = Math.max(6, Math.round(L / O.band));
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; seg(a - 1.6 / r.a, a + 1.6 / r.a, O.b); }
  } else {
    const n = Math.max(8, Math.round(L / (O.band || 17) / 2) * 2);
    for (let k = 0; k < n; k++) seg((k / n) * TAU, ((k + 1) / n) * TAU, k % 2 ? O.b : O.a);
  }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  ringPath(g, r, 0, TAU, 2.5, true); g.stroke();
  g.restore();
}
function drawBoxOne(g, b, tone) {
  const { x, y, w, h } = b;
  g.lineWidth = 1; g.strokeStyle = '#6e4f2b';
  g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w + DEP.x, y + DEP.y); g.lineTo(x + w + DEP.x, y + h + DEP.y); g.lineTo(x + w, y + h); g.closePath();
  g.fillStyle = '#a7793f'; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + DEP.x, y + DEP.y); g.lineTo(x + w + DEP.x, y + DEP.y); g.lineTo(x + w, y); g.closePath();
  g.fillStyle = '#dcb887'; g.fill(); g.stroke();
  g.fillStyle = tone; g.fillRect(x, y, w, h);
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle = 'rgba(245,226,190,.75)'; g.fillRect(x + w / 2 - 5, y, 10, h * 0.42);
  g.strokeStyle = 'rgba(110,79,43,.45)'; g.beginPath(); g.moveTo(x + 3, y + 8.5); g.lineTo(x + w - 3, y + 8.5); g.stroke();
}

export function semanticKey(m) {
  const cx = (x) => Math.floor(x / (BOARD.w / 8)), cy = (y) => Math.floor(y / (BOARD.h / 8));
  const stacks = m.stacks.map((st) => `${cx(st.boxes[0].x)}:${Math.round((m.floorY - st.boxes[st.boxes.length - 1].y) / 40)}`).sort().join(' ');
  const rings = m.rings.map((r) => `${cx(r.c.x)},${cy(r.c.y)} a${Math.round(r.a / 20)} t${Math.round((r.phi * 180) / Math.PI / 30) % 6} q${Math.round((r.b / r.a) * 10)}`).sort().join(' ');
  return `hidden_extent_grid|hoops ${m.rings.length}|answer ${m.answer.join('.')}|stacks ${stacks}|${rings}`;
}

export function gate(m) {
  if (!m || m.task !== 'hidden_extent_grid' || !Array.isArray(m.stacks) || m.stacks.length < 2 || m.stacks.length > 4) return false;
  const fy = m.floorY;
  if (!Number.isInteger(fy) || fy < FLOOR[0] || fy > FLOOR[1] || !Array.isArray(m.rings) || m.rings.length < 2 || m.rings.length > 3) return false;
  for (const r of m.rings) {
    if (!r?.c || ![r.c.x, r.c.y, r.a, r.b, r.phi].every(Number.isFinite)) return false;
    if (r.a < SEMI[0] - 0.01 || r.a > SEMI[1] + 0.01 || r.b / r.a < RATIO[0] - 0.01 || r.b / r.a > RATIO[1] + 0.01 || r.phi < 0 || r.phi > Math.PI + 0.01) return false;
  }
  for (const st of m.stacks) {
    if (!Array.isArray(st.boxes) || !st.boxes.length || st.boxes.length > 4) return false;
    let y = fy;
    for (const b of st.boxes) { if (Math.abs(b.y + b.h - y) > 1e-6 || b.h < BOX_H[0] || b.h > BOX_H[1]) return false; y = b.y; }
    if (y + DEP.y < 10) return false;
  }
  const xs = m.stacks.map((st) => [Math.min(...st.boxes.map((b) => b.x)), Math.max(...st.boxes.map((b) => b.x + b.w)) + DEP.x]);
  for (let k = 1; k < xs.length; k++) if (xs[k][0] - xs[k - 1][1] < STACK_GAP - 4) return false;
  if (xs[0][0] < 0 || xs[xs.length - 1][1] > BOARD.w) return false;
  if (m.ext !== undefined && !(m.ext === 1 && [...nounPool('train'), ...nounPool('test')].includes(m.obj))) return false;
  const a = analyse(m);
  return a.ok && a.answer.join(',') === m.answer.join(',');
}

const cellCenter = (key) => ({ x: ((key % G) + 0.5) * CW, y: (Math.floor(key / G) + 0.5) * CH });

function shifted(sc, dx, dy) {
  return {
    task: 'hidden_extent_grid', board: { ...BOARD }, floorY: sc.floorY + dy,
    stacks: sc.stacks.map((st) => ({ boxes: st.boxes.map((b) => ({ ...b, x: r2(b.x + dx), y: b.y + dy })) })),
    rings: sc.rings.map((r) => ({ ...r, c: { x: r2(r.c.x + dx), y: r2(r.c.y + dy) } })),
  };
}
const GRID_REASONS = new Set(['thin-hidden-cell', 'answer-size', 'hug-grid-line', 'near-grid-corner', 'chord-shortcut', 'circle-shortcut', 'entry-exit-shortcut', 'cover-shortcut', 'touch-shortcut']);
function generateBench(rng) {
  for (let guard = 0; guard < 40000; guard++) {
    const sc = makeScene(rng);
    if (!sc) continue;
    let m = shifted(sc, 0, 0), a = analyse(m);
    for (let s = 0; s < 24 && !a.ok && GRID_REASONS.has(a.reason); s++) {
      const dy = rng.int(-24, 24);
      if (sc.floorY + dy < FLOOR[0] || sc.floorY + dy > FLOOR[1]) continue;
      m = shifted(sc, rng.int(-30, 30), dy);
      const xs = m.stacks.flatMap((st) => st.boxes.flatMap((b) => [b.x, b.x + b.w + DEP.x]));
      if (Math.min(...xs) < 6 || Math.max(...xs) > BOARD.w - 6) { a = { ok: false, reason: 'answer-size' }; continue; }
      a = analyse(m);
    }
    if (!a.ok) continue;
    m.answer = a.answer;
    if (!gate(m)) continue;
    return m;
  }
  throw new Error('hidden_extent_grid: generator exhausted');
}
const EVAL_KEYS = new Set([
  'hidden_extent_grid|hoops 2|answer 21.22.42.50.51|stacks 1:2 5:6|3,5 a5 t5 q6 5,1 a4 t1 q6',
  'hidden_extent_grid|hoops 2|answer 18.26.27.38.45.46|stacks 2:5 5:2|3,2 a4 t4 q6 5,4 a4 t2 q6',
  'hidden_extent_grid|hoops 2|answer 27.34.35.36.37.38|stacks 2:4 4:4|2,3 a3 t0 q6 5,3 a4 t0 q6',
  'hidden_extent_grid|hoops 2|answer 26.27.30.34.35.37.38|stacks 2:4 5:4|4,3 a4 t0 q6 5,3 a5 t3 q6',
  'hidden_extent_grid|hoops 2|answer 28.33.36.41.42|stacks 1:3 4:4|2,4 a4 t5 q7 3,3 a4 t1 q5',
  'hidden_extent_grid|hoops 2|answer 41.42.43.50.51.52|stacks 1:3 3:1|2,4 a4 t5 q5 4,5 a4 t5 q6',
  'hidden_extent_grid|hoops 2|answer 34.37.42.43.44.45|stacks 2:3 4:4|3,4 a4 t4 q6 4,4 a3 t2 q7',
  'hidden_extent_grid|hoops 2|answer 33.41.42.43.44|stacks 1:2 3:2|2,4 a4 t4 q5 3,4 a3 t0 q7',
  'hidden_extent_grid|hoops 2|answer 34.42.46.47.54.55|stacks 1:3 6:2|3,3 a5 t4 q6 6,4 a5 t2 q5',
  'hidden_extent_grid|hoops 2|answer 31.33.34.38.39|stacks 1:4 4:2 6:4|2,3 a3 t0 q7 6,3 a4 t1 q6',
  'hidden_extent_grid|hoops 2|answer 18.26.27.35.44.45|stacks 2:5 4:2|4,2 a5 t0 q7 4,4 a5 t1 q6',
  'hidden_extent_grid|hoops 2|answer 22.23.30.31.38|stacks 2:3 6:6|5,3 a5 t5 q7 6,2 a5 t4 q6',
]);
const SEM_BUCKETS = 136, BUCKET_IDS = Array.from({ length: SEM_BUCKETS }, (_, i) => String(i));
const BUCKET_SPLIT = splitIds('g01_hidden_extent_bucket', BUCKET_IDS, 24);
const BUCKETS = { train: BUCKET_IDS.filter((b) => BUCKET_SPLIT(b) === 'train'), test: BUCKET_IDS.filter((b) => BUCKET_SPLIT(b) === 'test') };
const bucketOf = (k) => hash32(`hidden_extent_grid|${k}`) % SEM_BUCKETS;
function generateExt(rng, knobs) {
  const list = BUCKETS[knobs.ext] || BUCKETS.train, want = Number(list[nthOf(`hidden_extent_grid|${knobs.ext}|bucket`, knobs.n ?? 1, list.length)]);
  for (let tries = 0; tries < 20000; tries++) {
    const m = generateBench(rng), k = semanticKey(m);
    if (EVAL_KEYS.has(k) || bucketOf(k) !== want) continue;
    const pool = nounPool(knobs.ext);
    m.ext = 1; m.obj = pool[rng.int(0, pool.length - 1)];
    return m;
  }
  throw new Error('hidden_extent_grid: no training scene in this bucket');
}

export default {
  meta: {
    name: 'hidden_extent_grid', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: '0..480 board px (a grid square: toggles its selection)', y: '0..432 board px' }],
    promptHuman: 'Select every square where a hoop is hidden behind the boxes',
  },

  generate(rng, _l, _i, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs);
    return generateBench(rng);
  },

  init() { return { sel: [] }; },

  applyAction(state, a) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    if (a.x < 0 || a.y < 0 || a.x >= BOARD.w || a.y >= BOARD.h) return { ok: false, reason: 'off-grid' };
    const key = keyOf(a.x, a.y);
    const k = state.sel.indexOf(key);
    if (k >= 0) state.sel.splice(k, 1); else state.sel.push(key);
    return { ok: true };
  },

  verify(state, m) {
    const want = new Set(m.answer);
    const hit = state.sel.filter((k) => want.has(k)).length;
    const success = state.sel.length === want.size && hit === want.size;
    return { success, partial: hit / want.size, error: success ? 0 : 1, detail: { selected: state.sel.length } };
  },

  oracle(m) { return m.answer.map((key) => ({ op: 'click', ...cellCenter(key) })); },

  randomPolicy(m, rnd) {
    const k = 1 + Math.floor(rnd() * 9);
    const pool = Array.from({ length: G * G }, (_, q) => q);
    const acts = [];
    for (let t = 0; t < k; t++) {
      const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const c = cellCenter(q);
      acts.push({ op: 'click', x: c.x + (rnd() - 0.5) * (CW - 8), y: c.y + (rnd() - 0.5) * (CH - 8) });
    }
    return acts;
  },

  async mount(env) {
    if (env.style) env.assets.look = await roomLook(env.style, 'hoop', nounOf(env.manifest));
  },

  drawPrompt(g, r, env) {
    const what = nounOf(env?.manifest);
    drawPromptText(g, r, `Select every square where a ${what} is hidden behind the boxes`, '');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const fy = m.floorY;
    g.save(); g.translate(br.x, br.y);
    g.save(); g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const look = env.style ? env.assets?.look : null;
    if (look) {
      drawRoom(g, look, BOARD.w, BOARD.h, fy);
      for (const r of m.rings) drawRing(g, r, look.obj, look.clamps);
      m.stacks.forEach((st, si) => st.boxes.forEach((b, bi) => drawStackBox(g, b, DEP, look, si, bi)));
    } else {
      const wall = g.createLinearGradient(0, 0, 0, fy);
      wall.addColorStop(0, '#e7ecef'); wall.addColorStop(1, '#d9dfe3');
      g.fillStyle = wall; g.fillRect(0, 0, BOARD.w, fy);
      g.fillStyle = '#c9cfd4'; g.fillRect(0, fy - 8, BOARD.w, 8);
      g.fillStyle = '#9d8a70'; g.fillRect(0, fy, BOARD.w, BOARD.h - fy);
      g.fillStyle = 'rgba(60,45,30,.18)'; g.fillRect(0, fy, BOARD.w, 3);
      for (const r of m.rings) drawRing(g, r, DEFAULT_SKIN, ['#6d767e', '#8c969f']);
      const tones = ['#c99a5e', '#c4935a', '#cfa468', '#c2945f'];
      m.stacks.forEach((st, si) => st.boxes.forEach((b) => drawBoxOne(g, b, tones[si % tones.length])));
    }
    g.restore();
    for (const key of state.sel) {
      const i = key % G, j = Math.floor(key / G);
      g.fillStyle = 'rgba(25,145,250,.30)'; g.fillRect(i * CW, j * CH, CW, CH);
      g.strokeStyle = '#1991fa'; g.lineWidth = 3; g.strokeRect(i * CW + 1.5, j * CH + 1.5, CW - 3, CH - 3);
      g.beginPath(); g.arc(i * CW + 13, j * CH + 13, 8.5, 0, Math.PI * 2); g.fillStyle = '#1991fa'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(i * CW + 9, j * CH + 13); g.lineTo(i * CW + 12, j * CH + 16.5); g.lineTo(i * CW + 17.5, j * CH + 10); g.stroke();
    }
    g.lineCap = 'butt';
    for (let k = 1; k < G; k++) {
      for (const [w, c] of [[3, 'rgba(255,255,255,.95)'], [1, 'rgba(40,52,64,.55)']]) {
        g.strokeStyle = c; g.lineWidth = w;
        g.beginPath(); g.moveTo(k * CW, 0); g.lineTo(k * CW, BOARD.h); g.stroke();
        g.beginPath(); g.moveTo(0, k * CH); g.lineTo(BOARD.w, k * CH); g.stroke();
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    return [{ op: 'click', x: Math.round(evt.x), y: Math.round(evt.y) }];
  },

  footerStatus(env) { const n = env.state.sel.length; return `${n} selected`; },
};

export { analyse as _analyse, makeScene as _makeScene };
