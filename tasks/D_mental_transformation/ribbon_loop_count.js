import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import { TAU, R3, SELF, RG, ribbonPts, extent, findCrossings, mutualCrossings, auditRibbons } from '../common/_ribbon_loop_count_geom.js';
import { primaryOf, splitList, texPool, makeMaterial, fillMaterial, rectShape, hsl, hslAtLum } from '../common/_material_kit.js';

const BOARD = { w: 508, h: 412 };
const COLS = 3, ROWS = 3, MARGIN = 5, GAP = 6;
const TW = (BOARD.w - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
const TH = (BOARD.h - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
const TARGET = 3;
const HARD = Object.freeze({
  maxCross: 6,
  maxCrossTarget: 5,
  targets: [[1, 0.2], [2, 0.35], [3, 0.3], [4, 0.15]],
  targetMix: [[['ring', 'ring', 'ring'], 0.3], [['ring', 'ring', 'eight'], 0.38], [['ring', 'eight', 'chain'], 0.32]],
  otherL: [[1, 0.12], [2, 0.43], [4, 0.45]],
  mix1: [[['chain'], 0.6], [['eight'], 0.4]],
  mix2: [[['ring', 'ring'], 0.16], [['ring', 'eight'], 0.28], [['eight', 'eight'], 0.12], [['ring', 'chain'], 0.18], [['chain', 'eight'], 0.26]],
  mix4: [[['ring', 'ring', 'ring', 'ring'], 1]],
  clusters: {
    rrr: [[1, 0.4], [2, 0.35], [3, 0.25]], err: [[1, 0.4], [2, 0.35], [3, 0.25]],
    cer: [[2, 0.6], [3, 0.4]],
    rr: [[1, 0.55], [2, 0.45]], er: [[1, 0.55], [2, 0.45]], ee: [[1, 0.55], [2, 0.45]], cr: [[1, 0.55], [2, 0.45]], ce: [[1, 1]],
    rrrr: [[2, 0.6], [3, 0.4]], c: [[1, 1]], e: [[1, 1]],
  },
  ringR: { 1: [15, 20], 2: [16, 27], 3: [13, 22], 4: [14, 18.5] },
  ovSteps: [6, 8, 10, 12, 14, 16, 18],
});
const FAMILIES = [
  ['#e2527a', '#ef8a43'], ['#8b5ad3', '#cf55ad'], ['#1d9a8b', '#3a86cf'], ['#e39a17', '#dc5b2a'],
  ['#3d78d8', '#7458cf'], ['#3fa14e', '#1a978a'], ['#c94f9c', '#e0607a'],
];

export function tileRect(i) {
  const c = i % COLS, r = Math.floor(i / COLS);
  return { x: MARGIN + c * (TW + GAP), y: MARGIN + r * (TH + GAP), w: TW, h: TH };
}
function tileAt(x, y) {
  for (let i = 0; i < COLS * ROWS; i++) {
    const t = tileRect(i);
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return i;
  }
  return -1;
}
const pickW = (rng, pairs) => {
  let u = rng.raw() * pairs.reduce((s, p) => s + p[1], 0);
  for (const [v, w] of pairs) { u -= w; if (u <= 0) return v; }
  return pairs[pairs.length - 1][0];
};

function makeRibbon(rng, type, ringR, tilt = 0.5) {
  const base = { type, x: 0, y: 0, rot: rng.uniform(0, TAU), cyc: rng.int(2, 3), ph0: rng.uniform(0, 1) };
  if (type === 'ring') {
    const sx = rng.uniform(0.86, 1.16);
    Object.assign(base, { R: rng.uniform(ringR[0], ringR[1]), harm: [[2, rng.uniform(0, 0.11), rng.uniform(0, TAU)], [3, rng.uniform(0, 0.06), rng.uniform(0, TAU)]], sx, sy: 1 / sx });
  } else if (type === 'eight') {
    Object.assign(base, { r1: rng.uniform(12.5, 15.5), r2: rng.uniform(12.5, 15.5), th: rng.uniform(0.72, 0.92), w: rng.uniform(0, 1.4), ph: rng.uniform(0, TAU) });
  } else {
    Object.assign(base, { d: rng.uniform(16, 19), th: rng.uniform(0.9, 1.0), r1: rng.uniform(11.5, 14), r2: rng.uniform(11.5, 14), rm: rng.uniform(8, 11), w: rng.uniform(0, 1.2), ph: rng.uniform(0, TAU) });
  }
  if (type !== 'ring') base.rot = rng.uniform(-tilt, tilt) + (rng.raw() < 0.5 ? 0 : Math.PI);
  return base;
}
function roundRibbon(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'number' ? (Number.isInteger(v) ? v : R3(v)) : k === 'harm' ? v.map((h) => [h[0], R3(h[1]), R3(h[2])]) : v;
  return o;
}
function lengthOf(P) { let L = 0; for (let j = 0; j < P.length; j++) { const a = P[j], b = P[(j + 1) % P.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
const shift = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy]);
function support(pts, dx, dy) {
  let best = -Infinity;
  for (const p of pts) { const v = p[0] * dx + p[1] * dy; if (v > best) best = v; }
  return best;
}
function pairClean(A, B, selfA, selfB) {
  const mutual = mutualCrossings(A, B);
  if (mutual.length !== 2) return false;
  if (mutual.some((c) => c.ang < RG.minAngle + 3)) return false;
  const X = [...mutual, ...selfA, ...selfB], d = RG.minSep + 1.5;
  for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) if (Math.hypot(X[i].x - X[j].x, X[i].y - X[j].y) < d) return false;
  return true;
}
function pairApart(A, B) {
  for (const p of A) for (const q of B) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < RG.clear + 2) return false;
  return true;
}

function buildTile(rng, plan) {
  const types = plan.types, L = types.length;
  const lim = { x: TW / 2 - RG.inset - 0.5, y: TH / 2 - RG.inset - 0.5 };
  for (let shapeTry = 0; shapeTry < 20; shapeTry++) {
    const withChain = L > 1 && types.includes('chain');
    const rs = types.map((t) => makeRibbon(rng, t, HARD.ringR[L], withChain && t === 'eight' ? 1.3 : 0.5));
    const loc = rs.map((r) => ribbonPts({ ...r, x: 0, y: 0 }));
    const ext = loc.map(extent);
    const selfLoc = loc.map((P) => findCrossings([P]).map((c) => ({ x: c.x, y: c.y })));
    if (ext.some((e) => (e.x1 - e.x0) / 2 > lim.x || (e.y1 - e.y0) / 2 > lim.y)) continue;
    const woven = new Set(rng.sample(Array.from({ length: L - 1 }, (_, i) => i + 1), L - plan.c));
    const links = types.map((_, k) => woven.has(k));
    for (let placeTry = 0; placeTry < 10; placeTry++) {
      const order = rng.shuffle(rs.map((_, i) => i));
      const cen = new Array(rs.length);
      cen[order[0]] = [0, 0];
      const side = rng.raw() < 0.5 ? 0 : Math.PI;
      let ok = true;
      for (let k = 1; k < order.length && ok; k++) {
        const ri = order[k], aj = rng.raw() < 0.75 ? order[k - 1] : order[rng.int(0, k - 1)];
        const A = shift(loc[aj], cen[aj][0], cen[aj][1]);
        const sA = selfLoc[aj].map((c) => ({ x: c.x + cen[aj][0], y: c.y + cen[aj][1] }));
        let placed = false;
        for (let dirTry = 0; dirTry < 6 && !placed; dirTry++) {
          const phi = side + (rng.raw() < 0.6 ? rng.uniform(-0.55, 0.55) : rng.uniform(-1.4, 1.4));
          const dx = Math.cos(phi), dy = Math.sin(phi);
          const reach = support(loc[aj], dx, dy) + support(loc[ri], -dx, -dy);
          if (links[k]) {
            for (const ov of rng.shuffle(HARD.ovSteps)) {
              const c = [cen[aj][0] + (reach - ov) * dx, cen[aj][1] + (reach - ov) * dy];
              if (pairClean(A, shift(loc[ri], c[0], c[1]), sA, selfLoc[ri].map((q) => ({ x: q.x + c[0], y: q.y + c[1] })))) { cen[ri] = c; placed = true; break; }
            }
          } else {
            const c = [cen[aj][0] + (reach + rng.uniform(15, 24)) * dx, cen[aj][1] + (reach + rng.uniform(15, 24)) * dy];
            if (pairApart(A, shift(loc[ri], c[0], c[1]))) { cen[ri] = c; placed = true; }
          }
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      rs.forEach((_, i) => { x0 = Math.min(x0, cen[i][0] + ext[i].x0); x1 = Math.max(x1, cen[i][0] + ext[i].x1); y0 = Math.min(y0, cen[i][1] + ext[i].y0); y1 = Math.max(y1, cen[i][1] + ext[i].y1); });
      const sx = lim.x - (x1 - x0) / 2, sy = lim.y - (y1 - y0) / 2;
      if (sx < 0 || sy < 0) continue;
      const ox = -(x0 + x1) / 2 + rng.uniform(-sx, sx) * 0.8, oy = -(y0 + y1) / 2 + rng.uniform(-sy, sy) * 0.8;
      const ribbons = rs.map((r, i) => roundRibbon({ ...r, x: cen[i][0] + ox, y: cen[i][1] + oy }));
      const P = ribbons.map(ribbonPts);
      const a = auditRibbons(P, types, TW, TH);
      if (!a.ok || a.X.length > maxCrossOf(L) || clustersOf({ ribbons, cross: a.X }) !== plan.c) continue;
      const cross = a.X.map((c) => ({ x: R3(c.x), y: R3(c.y), a: c.a, ia: c.ia, b: c.b, ib: c.ib, top: rng.raw() < 0.5 ? 'a' : 'b' }));
      return { fam: rng.int(0, FAMILIES.length - 1), ribbons, cross };
    }
  }
  return null;
}

const maxCrossOf = (L) => (L === TARGET ? HARD.maxCrossTarget : HARD.maxCross);
const selfOf = (t) => t.ribbons.reduce((s, r) => s + SELF[r.type], 0);
const lobesOf = (t) => t.ribbons.length + selfOf(t);
function clustersOf(t) {
  const par = t.ribbons.map((_, i) => i);
  const f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  for (const c of t.cross) par[f(c.a)] = f(c.b);
  return new Set(t.ribbons.map((_, i) => f(i))).size;
}
function inkOf(t) { return t.ribbons.reduce((a, r) => a + lengthOf(ribbonPts(r)), 0); }
const EVAL_KEYS = new Set(["ribbon_loop_count|errx5c1|erx3c1|rrrrx4c2|errx3c2|cx2c1|rrrrx4c2", "ribbon_loop_count|errx3c2|rrrrx2c3|errx3c2|rrrx2c2|rrrx4c1|erx3c1", "ribbon_loop_count|erx1c2|errx5c1|errx5c1|rrrrx4c2|errx1c3|errx3c2", "ribbon_loop_count|rrrrx2c3|cex5c1|erx1c2|cex5c1|errx5c1|cex5c1", "ribbon_loop_count|errx3c2|erx3c1|ex1c1|eex4c1|errx5c1|rrrrx2c3", "ribbon_loop_count|errx5c1|erx3c1|rrrx0c3|cx2c1|errx3c2|errx5c1", "ribbon_loop_count|cex5c1|errx1c3|erx1c2|erx3c1|rrrrx2c3|rrrx0c3", "ribbon_loop_count|erx3c1|errx5c1|crx2c2|rrrx0c3|rrrrx2c3|errx5c1", "ribbon_loop_count|rrrrx4c2|rrrx2c2|erx3c1|cx2c1|errx3c2|rrrx2c2", "ribbon_loop_count|rrrx4c1|cx2c1|rrrrx4c2|errx5c1|crx4c1|rrrrx2c3", "ribbon_loop_count|errx5c1|cx2c1|eex4c1|rrx0c2|rrrx4c1|rrrx4c1", "ribbon_loop_count|rrrrx4c2|errx5c1|erx3c1|errx3c2|errx1c3|errx5c1"]);
export const CELL_FEATURES = {
  lobes: { f: lobesOf, eq: true },
  clusters: { f: clustersOf, eq: true },
  crossings: { f: (t) => t.cross.length, eq: true },
  selfX: { f: selfOf, eq: true },
  ink: { f: inkOf, eq: false, band: 20 },
};

const mixKey = (types) => types.map((t) => t[0]).sort().join('');
function redrawOther(rng) {
  const L = pickW(rng, HARD.otherL);
  const types = pickW(rng, L === 1 ? HARD.mix1 : L === 2 ? HARD.mix2 : HARD.mix4).slice();
  return { types, c: pickW(rng, HARD.clusters[mixKey(types)]) };
}
function planTiles(rng) {
  const k = pickW(rng, HARD.targets);
  const mixes = [];
  for (let i = 0; i < k; i++) mixes.push(pickW(rng, HARD.targetMix).slice());
  for (let i = k; i < COLS * ROWS; i++) {
    const L = pickW(rng, HARD.otherL);
    mixes.push(pickW(rng, L === 1 ? HARD.mix1 : L === 2 ? HARD.mix2 : HARD.mix4).slice());
  }
  const S = (p) => p.reduce((s, t) => s + SELF[t], 0);
  if (!mixes.slice(0, k).some((p) => S(p) > 0)) mixes[rng.int(0, k - 1)] = ['ring', 'ring', 'eight'];
  if (!mixes.slice(k).some((p) => p.length + S(p) === TARGET)) mixes[k + rng.int(0, mixes.length - k - 1)] = rng.raw() < 0.6 ? ['ring', 'eight'] : ['chain'];
  return rng.shuffle(mixes.map((types) => ({ types, c: pickW(rng, HARD.clusters[mixKey(types)]) })));
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inR = (v, lo, hi) => isNum(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
function ribbonParamsOk(r) {
  if (!r || !['ring', 'eight', 'chain'].includes(r.type) || !isNum(r.x) || !isNum(r.y) || !isNum(r.rot)) return false;
  if (!Number.isInteger(r.cyc) || r.cyc < 2 || r.cyc > 3 || !inR(r.ph0, 0, 1)) return false;
  if (r.type === 'ring') return inR(r.R, 13, 27) && inR(r.sx, 0.86, 1.16) && inR(r.sy, 0.86, 1.17) && Array.isArray(r.harm) && r.harm.length === 2 && r.harm.every((h) => Array.isArray(h) && inR(h[1], 0, 0.11));
  if (r.type === 'eight') return inR(r.r1, 12.5, 15.5) && inR(r.r2, 12.5, 15.5) && inR(r.th, 0.72, 0.92) && inR(r.w, 0, 1.4) && isNum(r.ph);
  return inR(r.d, 16, 19) && inR(r.th, 0.9, 1.0) && inR(r.r1, 11.5, 14) && inR(r.r2, 11.5, 14) && inR(r.rm, 8, 11) && inR(r.w, 0, 1.2) && isNum(r.ph);
}
function tileOk(t) {
  if (!t || !Number.isInteger(t.fam) || t.fam < 0 || t.fam >= FAMILIES.length) return false;
  if (!Array.isArray(t.ribbons) || t.ribbons.length < 1 || t.ribbons.length > 4 || !t.ribbons.every(ribbonParamsOk)) return false;
  const P = t.ribbons.map(ribbonPts);
  const a = auditRibbons(P, t.ribbons.map((r) => r.type), TW, TH);
  if (!a.ok || a.X.length > maxCrossOf(t.ribbons.length)) return false;
  if (!Array.isArray(t.cross) || t.cross.length !== a.X.length) return false;
  return t.cross.every((c, i) => c && (c.top === 'a' || c.top === 'b') && c.a === a.X[i].a && c.b === a.X[i].b && c.ia === a.X[i].ia && c.ib === a.X[i].ib
    && Math.abs(c.x - a.X[i].x) < 0.01 && Math.abs(c.y - a.X[i].y) < 0.01);
}
function featureRulesFail(m, f, eq, band) {
  const isT = m.tiles.map((t) => t.ribbons.length === m.target);
  const vals = m.tiles.map(f);
  const T = vals.filter((_, i) => isT[i]), O = vals.filter((_, i) => !isT[i]);
  if (!T.length || !O.length) return false;
  if (eq && T.every((v) => v === T[0]) && !O.includes(T[0])) return false;
  if (Math.max(...O) <= Math.min(...T) - (eq ? 1 : 0) || Math.min(...O) >= Math.max(...T) + (eq ? 1 : 0)) return false;
  if (band && !O.some((v) => v >= Math.min(...T) - band && v <= Math.max(...T) + band)) return false;
  return true;
}
function instanceOk(m) {
  const k = m.tiles.filter((t) => t.ribbons.length === TARGET).length;
  if (k < 1 || k > 4) return false;
  if (!m.tiles.some((t) => t.ribbons.length === TARGET && lobesOf(t) > TARGET)) return false;
  if (!m.tiles.some((t) => t.ribbons.length !== TARGET && lobesOf(t) === TARGET)) return false;
  for (const { f, eq, band } of Object.values(CELL_FEATURES)) if (!featureRulesFail(m, f, eq, band)) return false;
  return true;
}
function contractOk(m) {
  if (!m || m.task !== 'ribbon_loop_count' || m.target !== TARGET) return false;
  if (!m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!Array.isArray(m.tiles) || m.tiles.length !== COLS * ROWS || !m.tiles.every(tileOk)) return false;
  return instanceOk(m);
}
export function gate(m) { try { return contractOk(m); } catch { return false; } }

const answerOf = (m) => m.tiles.map((t, i) => (t.ribbons.length === m.target ? i : -1)).filter((i) => i >= 0);

const CACHE = new WeakMap();
const PAPER = '#f7f4ee', PAPER_PLAIN = '#f3f4f6';
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}
function ctxScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const mixRgb = (c1, c2, f) => [0, 1, 2].map((i) => Math.round(c1[i] + (c2[i] - c1[i]) * f));
const css = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

function ribbonGeom(r) {
  const pts = ribbonPts(r), n = pts.length, N = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    N.push([-ty / L, tx / L]);
  }
  return { pts, N, n };
}
function drawBand(g, r, G, fam, i0, count) {
  const [h1, h2] = FAMILIES[fam].map(hexRgb);
  const n = G.n, W = RG.W, idx = [];
  for (let k = 0; k <= count; k++) idx.push((i0 + k) % n);
  const colAt = (i) => mixRgb(h1, h2, 0.5 - 0.5 * Math.cos(TAU * (r.cyc * (i + 0.5) / n + r.ph0)));
  const off = (i, d) => [G.pts[i][0] + G.N[i][0] * d, G.pts[i][1] + G.N[i][1] * d];
  for (let k = 0; k + 1 < idx.length; k++) {
    const i = idx[k], j = idx[k + 1];
    const a1 = off(i, W / 2), a2 = off(j, W / 2), b2 = off(j, -W / 2), b1 = off(i, -W / 2);
    g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.lineTo(b1[0], b1[1]); g.closePath();
    const c = css(colAt(i));
    g.fillStyle = c; g.fill();
    g.strokeStyle = c; g.lineWidth = 0.6; g.stroke();
  }
  const mid = mixRgb(h1, h2, 0.5);
  const line = (d, style, w) => {
    g.beginPath();
    idx.forEach((i, k) => { const p = off(i, d); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.strokeStyle = style; g.lineWidth = w; g.stroke();
  };
  g.lineCap = 'butt'; g.lineJoin = 'round';
  line(W / 2 - 1.7, 'rgba(255,255,255,.55)', 0.8);
  line(-W / 2 + 1.7, 'rgba(255,255,255,.55)', 0.8);
  line(W / 2, css(mixRgb(mid, [25, 18, 22], 0.45)), 1);
  line(-W / 2, css(mixRgb(mid, [25, 18, 22], 0.45)), 1);
}

function renderTile(t, q, plain) {
  const Wc = Math.ceil(TW * q), Hc = Math.ceil(TH * q);
  const c = mkCanvas(Wc, Hc), g = c.getContext('2d');
  g.setTransform(q, 0, 0, q, (TW / 2) * q, (TH / 2) * q);
  const paper = plain ? PAPER_PLAIN : PAPER;
  g.fillStyle = paper; g.fillRect(-TW / 2 - 1, -TH / 2 - 1, TW + 2, TH + 2);
  const fam = plain ? 4 : t.fam;
  const Gs = t.ribbons.map(ribbonGeom);
  t.ribbons.forEach((r, ri) => drawBand(g, r, Gs[ri], fam, 0, Gs[ri].n));
  const RC = RG.minSep / 2 - 0.3, span = Math.ceil(17 / RG.step);
  for (const cr of t.cross) {
    const [ri, ii] = cr.top === 'a' ? [cr.a, cr.ia] : [cr.b, cr.ib];
    const G = Gs[ri], r = t.ribbons[ri];
    const i0 = (ii - span + G.n) % G.n;
    g.save();
    g.beginPath(); g.arc(cr.x, cr.y, RC, 0, TAU); g.clip();
    g.beginPath();
    for (let k = 0; k <= 2 * span + 1; k++) { const p = G.pts[(i0 + k) % G.n]; if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(40,24,30,.38)'; g.shadowBlur = 2.5 * q; g.shadowOffsetX = 1.2 * q; g.shadowOffsetY = 1.6 * q;
    g.strokeStyle = paper; g.lineWidth = RG.W + 5; g.stroke();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
    drawBand(g, r, G, fam, i0, 2 * span + 1);
    g.restore();
  }
  return c;
}

function drawCheck(g, x, y) {
  g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fillStyle = ACCENT; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.moveTo(x - 4, y + 0.2); g.lineTo(x - 1.2, y + 3); g.lineTo(x + 4.2, y - 3.2);
  g.strokeStyle = '#fff'; g.lineWidth = 2.1; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  g.lineCap = 'butt';
}

export default {
  meta: {
    name: 'ribbon_loop_count', family: 'D', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: '0..508 board px', y: '0..412 board px', note: 'toggles the cell under the cursor (3 x 3 cells)' }],
    promptHuman: 'Select cells with exactly 3 separate ribbons',
  },

  generate(rng, _level, _index, knobs) {
    if (knobs && knobs.ext) { let m; for (let k = 0; k < 20; k++) { m = this.generate(rng); if (!EVAL_KEYS.has(semanticKey(m))) return m; } return m; }
    for (let attempt = 0; attempt < 30; attempt++) {
      const plans = planTiles(rng);
      const tiles = plans.map((p) => buildTile(rng, p));
      if (tiles.some((t) => !t)) continue;
      const m = { task: 'ribbon_loop_count', board: { ...BOARD }, target: TARGET, tiles };
      const others = plans.map((p, i) => (p.types.length !== TARGET ? i : -1)).filter((i) => i >= 0);
      for (let step = 0; step < 16 && !instanceOk(m); step++) {
        const i = others[rng.int(0, others.length - 1)];
        const witnesses = others.filter((j) => lobesOf(m.tiles[j]) === TARGET);
        const plan = witnesses.length === 1 && witnesses[0] === i ? plans[i] : redrawOther(rng);
        const t = buildTile(rng, plan);
        if (t) { plans[i] = plan; m.tiles[i] = t; }
      }
      if (contractOk(m)) return m;
    }
    throw new Error('ribbon_loop_count: generator exhausted');
  },

  init() { return { sel: [] }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'click' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: 'bad-op' };
    const i = tileAt(action.x, action.y);
    if (i < 0 || i >= m.tiles.length) return { ok: false, reason: 'no-tile' };
    const k = state.sel.indexOf(i);
    if (k >= 0) state.sel.splice(k, 1); else state.sel.push(i);
    state.sel.sort((a, b) => a - b);
    return { ok: true, on: k < 0 };
  },

  verify(state, m) {
    const want = new Set(answerOf(m)), got = new Set(state.sel);
    const hits = [...got].filter((i) => want.has(i)).length;
    const falsePos = got.size - hits, missed = want.size - hits;
    return {
      success: falsePos === 0 && missed === 0,
      error: falsePos + missed,
      partial: want.size ? Math.max(0, (hits - falsePos) / want.size) : 0,
      detail: { selected: got.size, correct: hits, falsePos, missed },
    };
  },

  oracle(m) {
    return answerOf(m).map((i) => { const r = tileRect(i); return { op: 'click', x: R3(r.x + r.w / 2), y: R3(r.y + r.h / 2) }; });
  },

  randomPolicy(m, rnd) {
    const ids = m.tiles.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const k = 1 + Math.floor(rnd() * 4);
    return ids.slice(0, k).map((i) => { const r = tileRect(i); return { op: 'click', x: r.x + 4 + rnd() * (r.w - 8), y: r.y + 4 + rnd() * (r.h - 8) }; });
  },

  async mount(env) { if (env && env.style) env.assets.g15 = await mountLook(env.style); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Select all pictures with exactly 3 ribbons', 'Ribbons may cross themselves or each other');
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.g15) { drawStyled(g, br, env, env.assets.g15); return; }
    const { manifest: m, state } = env;
    const q = ctxScale(g), plain = env.skin === 'plain';
    let cache = CACHE.get(m);
    if (!cache || cache.q !== q || cache.plain !== plain) { cache = { q, plain, tiles: m.tiles.map((t) => renderTile(t, q, plain)) }; CACHE.set(m, cache); }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#e6e9ee'; g.fillRect(0, 0, br.w, br.h);
    m.tiles.forEach((t, i) => {
      const r = tileRect(i);
      g.save(); rr(g, r.x, r.y, r.w, r.h, 6); g.clip();
      g.drawImage(cache.tiles[i], r.x, r.y, Math.ceil(TW * q) / q, Math.ceil(TH * q) / q);
      g.restore();
      rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 6); g.strokeStyle = 'rgba(40,52,64,.22)'; g.lineWidth = 1; g.stroke();
    });
    for (const i of state.sel) {
      const r = tileRect(i);
      rr(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 6); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
      drawCheck(g, r.x + r.w - 12, r.y + 12);
    }
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    return [{ op: 'click', x: Math.round(evt.x * 10) / 10, y: Math.round(evt.y * 10) / 10 }];
  },

  footerStatus(env) {
    const n = env.state.sel.length;
    return `${n} selected`;
  },
};

const RIBBON_MATS = ['satin', 'grosgrain', 'velvet', 'leather', 'rope', 'rubber', 'paper', 'webbing', 'silk', 'denim'];
async function mountLook(st) {
  const mat = primaryOf(st, 'g15_ribbon_mat', splitList('g15_ribbon_material', RIBBON_MATS, st.split, 3), 'g15_ribbon_material');
  const backs = texPool(st, ['fabric', 'wood', 'flat2d', 'wall', 'floor']);
  const back = await makeMaterial(st, st.primary('tex', (t) => backs.includes(t)), { scale: [0.25, 0.45], rotate: false });
  const boards = texPool(st, ['wood', 'stone', 'metal', 'fabric']);
  const board = await makeMaterial(st, boards[Math.floor(st.rand() * boards.length)], { scale: [0.3, 0.5], rotate: false });
  const h0 = st.rand() * 360, sat = 55 + st.rand() * 20, lum = 0.12 + st.rand() * 0.08, drift = 22 + st.rand() * 14;
  const fams = Array.from({ length: FAMILIES.length }, (_, i) => [hslAtLum(h0 + i * 360 / FAMILIES.length, sat, lum), hslAtLum(h0 + i * 360 / FAMILIES.length + drift, sat, lum)]);
  return { mat, back, board, fams, backL: 0.8 + st.rand() * 0.1, boardL: 0.42 + st.rand() * 0.18, key: st.key };
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state } = env;
  const q = ctxScale(g);
  if (!L.cache || L.cache.q !== q || L.cache.m !== m) L.cache = { q, m, tiles: m.tiles.map((t) => renderTileStyled(t, q, L)) };
  g.save(); g.translate(br.x, br.y);
  fillMaterial(g, L.board, rectShape(0, 0, br.w, br.h), { target: L.boardL, contrastK: 0.6, desat: 0.4 });
  m.tiles.forEach((t, i) => {
    const r = tileRect(i);
    g.save(); rr(g, r.x, r.y, r.w, r.h, 6); g.clip();
    g.drawImage(L.cache.tiles[i], r.x, r.y, Math.ceil(TW * q) / q, Math.ceil(TH * q) / q);
    g.restore();
    rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 6); g.strokeStyle = 'rgba(30,36,44,.35)'; g.lineWidth = 1; g.stroke();
  });
  for (const i of state.sel) {
    const r = tileRect(i);
    rr(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 6); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
    drawCheck(g, r.x + r.w - 12, r.y + 12);
  }
  g.restore();
}
function renderTileStyled(t, q, L) {
  const Wc = Math.ceil(TW * q), Hc = Math.ceil(TH * q);
  const c = mkCanvas(Wc, Hc), g = c.getContext('2d');
  g.setTransform(q, 0, 0, q, 0, 0);
  const i0 = t.ribbons.length * 131 + Math.round(t.ribbons[0].x * 7);
  fillMaterial(g, { ...L.back, ox: L.back.ox + i0, oy: L.back.oy + i0 * 0.7 }, rectShape(0, 0, TW, TH), { target: L.backL, contrastK: 0.7, desat: 0.5 });
  const lay = mkCanvas(Wc, Hc), lg = lay.getContext('2d');
  lg.setTransform(q, 0, 0, q, (TW / 2) * q, (TH / 2) * q);
  const fam = L.fams[t.fam];
  const Gs = t.ribbons.map(ribbonGeom);
  t.ribbons.forEach((r, ri) => drawBandStyled(lg, r, Gs[ri], fam, 0, Gs[ri].n, L.mat));
  const RC = RG.minSep / 2 - 0.3, span = Math.ceil(17 / RG.step);
  for (const cr of t.cross) {
    const [ri, ii] = cr.top === 'a' ? [cr.a, cr.ia] : [cr.b, cr.ib];
    const G = Gs[ri], r = t.ribbons[ri];
    const i0c = (ii - span + G.n) % G.n;
    const path = () => { lg.beginPath(); for (let k = 0; k <= 2 * span + 1; k++) { const p = G.pts[(i0c + k) % G.n]; if (k) lg.lineTo(p[0], p[1]); else lg.moveTo(p[0], p[1]); } };
    lg.save();
    lg.beginPath(); lg.arc(cr.x, cr.y, RC, 0, TAU); lg.clip();
    lg.lineCap = 'butt'; lg.lineJoin = 'round';
    lg.globalCompositeOperation = 'destination-out'; path(); lg.strokeStyle = '#000'; lg.lineWidth = RG.W + 5; lg.stroke();
    lg.globalCompositeOperation = 'source-atop';
    lg.shadowColor = 'rgba(40,24,30,.5)'; lg.shadowBlur = 2.5 * q; lg.shadowOffsetX = 1.2 * q + 2000 * q; lg.shadowOffsetY = 1.6 * q;
    lg.save(); lg.translate(-2000, 0); path(); lg.strokeStyle = '#000'; lg.lineWidth = RG.W + 5; lg.stroke(); lg.restore();
    lg.shadowColor = 'transparent'; lg.shadowBlur = 0; lg.shadowOffsetX = 0; lg.shadowOffsetY = 0;
    lg.globalCompositeOperation = 'source-over';
    drawBandStyled(lg, r, G, fam, i0c, 2 * span + 1, L.mat);
    lg.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(lay, 0, 0);
  return c;
}
function drawBandStyled(g, r, G, famPair, i0, count, mat) {
  const [h1, h2] = famPair.map(hexRgb);
  const n = G.n, W = RG.W, idx = [];
  for (let k = 0; k <= count; k++) idx.push((i0 + k) % n);
  const colAt = (i) => mixRgb(h1, h2, 0.5 - 0.5 * Math.cos(TAU * (r.cyc * (i + 0.5) / n + r.ph0)));
  const off = (i, d) => [G.pts[i][0] + G.N[i][0] * d, G.pts[i][1] + G.N[i][1] * d];
  for (let k = 0; k + 1 < idx.length; k++) {
    const i = idx[k], j = idx[k + 1];
    const a1 = off(i, W / 2), a2 = off(j, W / 2), b2 = off(j, -W / 2), b1 = off(i, -W / 2);
    g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.lineTo(b1[0], b1[1]); g.closePath();
    const c = css(colAt(i));
    g.fillStyle = c; g.fill();
    g.strokeStyle = c; g.lineWidth = 0.6; g.stroke();
  }
  const mid = mixRgb(h1, h2, 0.5), dark = css(mixRgb(mid, [25, 18, 22], 0.5)), light = 'rgba(255,255,255,.55)';
  const line = (d, style, w, dash) => {
    g.beginPath();
    idx.forEach((i, k) => { const p = off(i, d); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.strokeStyle = style; g.lineWidth = w; if (dash) g.setLineDash(dash); g.stroke(); if (dash) g.setLineDash([]);
  };
  const ticks = (step, style, w, slant) => {
    g.strokeStyle = style; g.lineWidth = w; g.beginPath();
    for (let k = 0; k < idx.length; k += step) {
      const i = idx[k], j = idx[Math.min(idx.length - 1, k + slant)];
      const a = off(i, W / 2 - 0.4), b = off(j, -W / 2 + 0.4);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
  };
  g.lineCap = 'butt'; g.lineJoin = 'round';
  if (mat === 'satin' || mat === 'silk') {
    line(W / 2 - 1.7, light, 0.8); line(-W / 2 + 1.7, light, 0.8);
    if (mat === 'silk') line(0, 'rgba(255,255,255,.28)', 1.6);
  } else if (mat === 'grosgrain') {
    ticks(1, 'rgba(0,0,0,.16)', 0.5, 0);
  } else if (mat === 'velvet') {
    line(W / 2 - 1, 'rgba(0,0,0,.22)', 1.6); line(-W / 2 + 1, 'rgba(0,0,0,.22)', 1.6);
  } else if (mat === 'leather') {
    line(0, 'rgba(255,240,210,.75)', 0.8, [1.6, 1.4]);
  } else if (mat === 'rope') {
    ticks(2, 'rgba(0,0,0,.28)', 0.8, 1);
  } else if (mat === 'rubber') {
    line(W / 2 - 2, 'rgba(255,255,255,.4)', 1.1);
  } else if (mat === 'webbing') {
    line(W / 2 - 1.3, 'rgba(0,0,0,.25)', 0.6); line(-W / 2 + 1.3, 'rgba(0,0,0,.25)', 0.6); line(0, 'rgba(0,0,0,.18)', 0.6);
  } else if (mat === 'denim') {
    line(W / 2 - 1.4, 'rgba(255,214,140,.8)', 0.6, [1.2, 1]); line(-W / 2 + 1.4, 'rgba(255,214,140,.8)', 0.6, [1.2, 1]);
  }
  line(W / 2, dark, 1); line(-W / 2, dark, 1);
}

export function semanticKey(m) {
  return `ribbon_loop_count|${m.tiles.map((t) => `${t.ribbons.map((r) => r.type[0]).sort().join('')}x${t.cross.length}c${clustersOf(t)}`).join('|')}`;
}
