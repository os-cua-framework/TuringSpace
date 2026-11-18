import { rotPt, ptInPoly, polyBounds, normDeg } from '../core/geom.js';
import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { hash32 } from '../core/style.js';
import { mulberry32, R as wrapRng } from '../core/rng.js';

const BOARD = { w: 380, h: 520 };
const POS_TOL = 12;
const ANGLE_STEP = 45;
const KNOB_R = 12;
const MOVE_EPS = 5;
const SIL_BOX = { cx: 190, cy: 114, w: 236, h: 196 };
const TRAY = { x0: 14, y0: 230, x1: 366, y1: 508 };
const COLORS = ['#3f9e8f', '#d98a3d', '#7b6cc4', '#c2577a'];
const N_PIECES = [3, 4];
const MIN_PIECE_A = 4;
const NEAR_EQUAL = 0.85;
const LOOKALIKE_IOU = 0.7;
const LOOKALIKE_SAME_K = 0.55;

const BASES = [
  [[0, 0], [4, 0], [4, 3], [6, 3], [6, 5], [0, 5]],
  [[0, 0], [5, 0], [5, 5], [3, 5], [3, 3], [0, 3]],
  [[0, 1], [3, 1], [3, 0], [6, 3], [3, 6], [3, 5], [0, 5]],
  [[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [2, 4], [2, 6], [0, 6]],
  [[0, 0], [6, 0], [6, 2], [4, 4], [0, 4]],
  [[0, 0], [3, 0], [6, 3], [6, 5], [0, 5]],
  [[0, 3], [3, 0], [6, 0], [6, 4], [4, 6], [0, 6]],
  [[0, 0], [7, 0], [5, 4], [0, 4]],
  [[0, 0], [3, 0], [3, 2], [6, 5], [0, 5]],
];

const r2 = (v) => Math.round(v * 100) / 100;

function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
const area = (poly) => Math.abs(signedArea(poly));

function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const m = poly.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: m.x / poly.length, y: m.y / poly.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
const onSeg = (a, b, p) => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot > 1e-6 && dot < len2 - 1e-6;
};

function isDiagonal(poly, i, j) {
  const n = poly.length;
  if (i === j || (i + 1) % n === j || (j + 1) % n === i) return false;
  const A = poly[i], B = poly[j];
  for (let k = 0; k < n; k++) {
    const C = poly[k], D = poly[(k + 1) % n];
    if (k === i || k === j || (k + 1) % n === i || (k + 1) % n === j) continue;
    if (segCross(A, B, C, D)) return false;
  }
  for (let k = 0; k < n; k++) if (k !== i && k !== j && onSeg(A, B, poly[k])) return false;
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  return ptInPoly(mid, poly);
}

function splitAt(poly, i, j) {
  const [a, b] = i < j ? [i, j] : [j, i];
  const p1 = poly.slice(a, b + 1);
  const p2 = poly.slice(b).concat(poly.slice(0, a + 1));
  return [p1, p2];
}

function symOrder(local) {
  const eps = 0.35;
  const same = (A, B) => {
    if (A.length !== B.length) return false;
    const used = new Array(B.length).fill(false);
    return A.every((p) => {
      const k = B.findIndex((q, idx) => !used[idx] && Math.hypot(p.x - q.x, p.y - q.y) <= eps);
      if (k < 0) return false; used[k] = true; return true;
    });
  };
  let order = 0;
  for (let k = 0; k < 8; k++) if (same(local, local.map((p) => rotPt(p, k * ANGLE_STEP)))) order++;
  return order;
}

function orient(base, mirror, quarter) {
  let pts = base.map((p) => ({ x: mirror ? -p[0] : p[0], y: p[1] }));
  for (let q = 0; q < quarter; q++) pts = pts.map((p) => ({ x: -p.y, y: p.x }));
  if (signedArea(pts) > 0) pts = pts.slice().reverse();
  const b = polyBounds(pts);
  return pts.map((p) => ({ x: p.x - b.x0, y: p.y - b.y0 }));
}

function reflexCount(poly) {
  const s = Math.sign(signedArea(poly));
  let n = 0;
  for (let i = 0, len = poly.length; i < len; i++) {
    const a = poly[(i - 1 + len) % len], b = poly[i], c = poly[(i + 1) % len];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6 && Math.sign(cross) !== s) n++;
  }
  return n;
}

const MIN_ANGLE = 26;
function minCorner(poly) {
  const s = Math.sign(signedArea(poly));
  let mn = 180;
  for (let i = 0, len = poly.length; i < len; i++) {
    const a = poly[(i - 1 + len) % len], b = poly[i], c = poly[(i + 1) % len];
    const ex = b.x - a.x, ey = b.y - a.y, fx = c.x - b.x, fy = c.y - b.y;
    const cross = ex * fy - ey * fx, turn = Math.atan2(Math.abs(cross), ex * fx + ey * fy) * 180 / Math.PI;
    if (Math.abs(cross) > 1e-9 && Math.sign(cross) === s) mn = Math.min(mn, 180 - turn);
  }
  return mn;
}
const FAT_MIN = 0.15;
const shapeReadable = (poly, slack = 0) => minCorner(poly) >= MIN_ANGLE - 1e-6 - 100 * slack
  && (() => { const b = polyBounds(poly); return area(poly) / (b.w * b.w + b.h * b.h) >= FAT_MIN - 1e-6 - slack; })();
function pieceOK(poly) {
  if (poly.length < 3 || poly.length > 6) return false;
  const A = area(poly);
  if (A < MIN_PIECE_A) return false;
  if (!shapeReadable(poly)) return false;
  if (reflexCount(poly) > 1) return false;
  const c = centroid(poly);
  if (symOrder(poly.map((p) => ({ x: p.x - c.x, y: p.y - c.y }))) !== 1) return false;
  return ptInPoly(c, poly);
}

const nearEqualPair = (pieces) => pieces.some((p, i) => pieces.some((q, j) =>
  i < j && Math.min(area(p), area(q)) / Math.max(area(p), area(q)) >= NEAR_EQUAL));

function sameSet(A, B, eps) {
  if (A.length !== B.length) return false;
  const used = new Array(B.length).fill(false);
  return A.every((p) => {
    const k = B.findIndex((q, idx) => !used[idx] && Math.hypot(p.x - q.x, p.y - q.y) <= eps);
    if (k < 0) return false; used[k] = true; return true;
  });
}
function pairwiseDistinct(pieces, eps) {
  const cen = pieces.map((p) => { const c = centroid(p); return p.map((v) => ({ x: v.x - c.x, y: v.y - c.y })); });
  for (let i = 0; i < cen.length; i++) for (let j = i + 1; j < cen.length; j++) {
    for (let k = 0; k < 8; k++) if (sameSet(cen[i].map((p) => rotPt(p, k * ANGLE_STEP)), cen[j], eps)) return false;
  }
  return true;
}

const IOU_RES = 10;
function lookAlike(A, B) {
  const ca = centroid(A), cb = centroid(B);
  const a = A.map((p) => ({ x: p.x - ca.x, y: p.y - ca.y })), b0 = B.map((p) => ({ x: p.x - cb.x, y: p.y - cb.y }));
  const ba = polyBounds(a), unit = Math.sqrt(Math.max(area(a), area(b0))) / 4.5, step = unit / IOU_RES;
  let best = 0;
  for (const mir of [false, true]) for (let k = 0; k < 8; k++) {
    const b = b0.map((p) => rotPt(mir ? { x: -p.x, y: p.y } : p, k * ANGLE_STEP));
    const bb = polyBounds(b);
    const x0 = Math.min(ba.x0, bb.x0), x1 = Math.max(ba.x1, bb.x1), y0 = Math.min(ba.y0, bb.y0), y1 = Math.max(ba.y1, bb.y1);
    let inter = 0, uni = 0;
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
      const ia = ptInPoly({ x, y }, a), ib = ptInPoly({ x, y }, b);
      if (ia && ib) inter++;
      if (ia || ib) uni++;
    }
    if (uni) best = Math.max(best, inter / uni);
  }
  return best;
}
const corners = (p) => simplify(p).length;
const noLookAlikes = (pieces, slack = 0) => pieces.every((p, i) => pieces.every((q, j) => {
  if (j <= i) return true;
  const v = lookAlike(p, q);
  return v < LOOKALIKE_IOU - slack && (corners(p) !== corners(q) || v < LOOKALIKE_SAME_K - slack);
}));

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
function densify(poly) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, g = Math.max(1, gcd(Math.round(Math.abs(dx)), Math.round(Math.abs(dy))));
    for (let k = 0; k < g; k++) out.push({ x: a.x + (dx * k) / g, y: a.y + (dy * k) / g });
  }
  return out;
}
function simplify(poly) {
  return poly.filter((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
  });
}
function randomDecomp(rng, outline, n) {
  let pieces = [outline];
  while (pieces.length < n) {
    const order = pieces.map((p, i) => ({ i, k: area(p) * rng.uniform(0.6, 1.4) })).sort((a, b) => b.k - a.k);
    let done = false;
    for (const { i } of order) {
      const d = densify(pieces[i]), cuts = [];
      for (let a = 0; a < d.length; a++) for (let b = a + 1; b < d.length; b++) {
        if (!isDiagonal(d, a, b)) continue;
        const [p1, p2] = splitAt(d, a, b).map(simplify);
        if (area(p1) >= MIN_PIECE_A && area(p2) >= MIN_PIECE_A) cuts.push([p1, p2]);
      }
      if (!cuts.length) continue;
      const [p1, p2] = rng.pick(cuts);
      pieces = [...pieces.slice(0, i), p1, p2, ...pieces.slice(i + 1)];
      done = true; break;
    }
    if (!done) return null;
  }
  return pieces;
}
const TILE_RES = 6, TILE_OX = 0.3719, TILE_OY = 0.6143;
function onBoundary(p, poly) {
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    if (Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < 1e-6) return true;
  }
  return false;
}
function tilingCount(outline, pieces, cap = 2) {
  const ob = polyBounds(outline);
  const W = Math.round(ob.w * TILE_RES), H = Math.round(ob.h * TILE_RES), N = W * H, words = Math.ceil(N / 32);
  const sx = (i) => ob.x0 + (i + TILE_OX) / TILE_RES, sy = (j) => ob.y0 + (j + TILE_OY) / TILE_RES;
  const inS = new Uint8Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) inS[j * W + i] = ptInPoly({ x: sx(i), y: sy(j) }, outline) ? 1 : 0;
  const inOrOn = (p) => ptInPoly(p, outline) || onBoundary(p, outline);
  const places = pieces.map((piece) => {
    const list = [], seen = new Set();
    for (let k = 0; k < 8; k++) {
      const rv = piece.map((v) => rotPt(v, k * ANGLE_STEP));
      const anchors = k % 2 === 0 ? [0] : rv.map((_, a) => a);
      for (const a of anchors) for (let ly = Math.ceil(ob.y0); ly <= ob.y1; ly++) for (let lx = Math.ceil(ob.x0); lx <= ob.x1; lx++) {
        const tx = lx - rv[a].x, ty = ly - rv[a].y;
        const key = `${k}|${Math.round(tx * 1000)}|${Math.round(ty * 1000)}`;
        if (seen.has(key)) continue; seen.add(key);
        const verts = rv.map((v) => ({ x: v.x + tx, y: v.y + ty }));
        if (!verts.every(inOrOn)) continue;
        const vb = polyBounds(verts), bits = new Uint32Array(words);
        let ok = true, cnt = 0;
        const i0 = Math.max(0, Math.floor((vb.x0 - ob.x0) * TILE_RES - 1)), i1 = Math.min(W - 1, Math.ceil((vb.x1 - ob.x0) * TILE_RES));
        const j0 = Math.max(0, Math.floor((vb.y0 - ob.y0) * TILE_RES - 1)), j1 = Math.min(H - 1, Math.ceil((vb.y1 - ob.y0) * TILE_RES));
        for (let j = j0; j <= j1 && ok; j++) for (let i = i0; i <= i1; i++) {
          if (!ptInPoly({ x: sx(i), y: sy(j) }, verts)) continue;
          const s = j * W + i;
          if (!inS[s]) { ok = false; break; }
          bits[s >> 5] |= 1 << (s & 31); cnt++;
        }
        if (ok && cnt) list.push(bits);
      }
    }
    return list;
  });
  const cov = new Uint32Array(words), used = new Array(pieces.length).fill(false);
  let found = 0;
  const dfs = () => {
    let s = -1;
    for (let q = 0; q < N; q++) if (inS[q] && !(cov[q >> 5] & (1 << (q & 31)))) { s = q; break; }
    if (s < 0) { if (used.every(Boolean)) found++; return; }
    for (let p = 0; p < pieces.length && found < cap; p++) {
      if (used[p]) continue;
      for (const bits of places[p]) {
        if (!(bits[s >> 5] & (1 << (s & 31)))) continue;
        let clash = false;
        for (let w = 0; w < words; w++) if (bits[w] & cov[w]) { clash = true; break; }
        if (clash) continue;
        for (let w = 0; w < words; w++) cov[w] |= bits[w];
        used[p] = true;
        dfs();
        used[p] = false;
        for (let w = 0; w < words; w++) cov[w] &= ~bits[w];
        if (found >= cap) return;
      }
    }
  };
  dfs();
  return found;
}
function decompose(rng, outline, n) {
  for (let t = 0; t < 40; t++) {
    const pieces = randomDecomp(rng, outline, n);
    if (!pieces || !pieces.every(pieceOK) || !nearEqualPair(pieces) || !pairwiseDistinct(pieces, 0.01)) continue;
    if (!noLookAlikes(pieces, 0.03)) continue;
    if (tilingCount(outline, pieces) !== 1) continue;
    return { outline, pieces };
  }
  return null;
}

function place(rng, decomp) {
  const b = polyBounds(decomp.outline);
  for (let shrink = 0; shrink < 6; shrink++) {
    const s = Math.min(SIL_BOX.w / b.w, SIL_BOX.h / b.h) * Math.pow(0.86, shrink);
    const ox = SIL_BOX.cx - (b.x0 + b.w / 2) * s;
    const oy = SIL_BOX.cy - (b.y0 + b.h / 2) * s;
    const toPx = (p) => ({ x: p.x * s + ox, y: p.y * s + oy });
    const outline = decomp.outline.map(toPx);
    const pieces = decomp.pieces.map((poly, idx) => {
      const px = poly.map(toPx);
      const c = centroid(px);
      const local = px.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      const rad = Math.max(...local.map((p) => Math.hypot(p.x, p.y)));
      return { local, target: c, rad, area: area(px), color: COLORS[idx % COLORS.length] };
    });
    const cap = (TRAY.y1 - TRAY.y0) / 2 - 4;
    if (pieces.some((p) => p.rad > cap)) continue;
    let scattered = null;
    for (let tries = 0; tries < 12 && !scattered; tries++) scattered = scatter(rng, pieces);
    if (!scattered) continue;
    return { outline, pieces: scattered, lattice: { s: r2(s), ox: r2(ox), oy: r2(oy) } };
  }
  return null;
}

const TRAY_GAP = 12;
function segDist(a, b, c, d) {
  if (segCross(a, b, c, d)) return 0;
  const pd = (p, u, v) => {
    const dx = v.x - u.x, dy = v.y - u.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / L2)) : 0;
    return Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy);
  };
  return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
}
function polyGap(P, Q) {
  if (P.some((p) => ptInPoly(p, Q)) || Q.some((q) => ptInPoly(q, P))) return 0;
  let m = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) m = Math.min(m, segDist(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]));
  return m;
}
const startVerts = (p) => p.local.map((v) => { const r = rotPt(v, p.initRot * ANGLE_STEP); return { x: r.x + p.initPos.x, y: r.y + p.initPos.y }; });

function scatter(rng, pieces) {
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b].rad - pieces[a].rad);
  const placed = [];
  const out = pieces.map((p) => ({ ...p }));
  let extra = pieces.length;
  for (const i of order) {
    const p = out[i];
    const bump = rng.int(0, Math.min(2, extra)); extra -= bump;
    const offset = 1 + bump;
    const initRot = (8 - offset) % 8;
    const rverts = p.local.map((v) => rotPt(v, initRot * ANGLE_STEP));
    const rb = polyBounds(rverts);
    if (rb.w > TRAY.x1 - TRAY.x0 || rb.h > TRAY.y1 - TRAY.y0) return null;
    let done = false;
    for (let t = 0; t < 300 && !done; t++) {
      const x = rng.uniform(TRAY.x0 - rb.x0, TRAY.x1 - rb.x1);
      const y = rng.uniform(TRAY.y0 - rb.y0, TRAY.y1 - rb.y1);
      if (x + rb.x0 < 6 || x + rb.x1 > BOARD.w - 6 || y + rb.y0 < TRAY.y0 - 2 || y + rb.y1 > BOARD.h - 6) continue;
      const poly = rverts.map((v) => ({ x: v.x + x, y: v.y + y }));
      if (placed.some((q) => polyGap(poly, q) < TRAY_GAP)) continue;
      p.initRot = initRot; p.initPos = { x, y };
      placed.push(poly); done = true;
    }
    if (!done) return null;
  }
  return out;
}

function build(rng) {
  const n = rng.pick(N_PIECES);
  for (let t = 0; t < 600; t++) {
    const outline = orient(rng.pick(BASES), rng.raw() < 0.5, rng.int(0, 3));
    const dec = decompose(rng, outline, n);
    if (!dec) continue;
    const laid = place(rng, dec);
    if (laid) return finish(laid);
  }
  return JSON.parse(JSON.stringify(FALLBACK));
}

function placeFixed(decomp) {
  const b = polyBounds(decomp.outline);
  const s = Math.min(SIL_BOX.w / b.w, SIL_BOX.h / b.h) * 0.7;
  const ox = SIL_BOX.cx - (b.x0 + b.w / 2) * s, oy = SIL_BOX.cy - (b.y0 + b.h / 2) * s;
  const toPx = (p) => ({ x: p.x * s + ox, y: p.y * s + oy });
  const outline = decomp.outline.map(toPx);
  const seats = [{ x: 96, y: 300 }, { x: 244, y: 300 }, { x: 170, y: 336 }];
  const pieces = decomp.pieces.map((poly, idx) => {
    const px = poly.map(toPx), c = centroid(px);
    const local = px.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    return { local, target: c, rad: Math.max(...local.map((p) => Math.hypot(p.x, p.y))),
      area: area(px), color: COLORS[idx % COLORS.length], initRot: 7, initPos: seats[idx] };
  });
  return { outline, pieces };
}

function finish(laid) {
  const pieces = laid.pieces.map((p) => ({
    local: p.local.map((v) => ({ x: r2(v.x), y: r2(v.y) })),
    target: { x: r2(p.target.x), y: r2(p.target.y) },
    initPos: { x: r2(p.initPos.x), y: r2(p.initPos.y) },
    initRot: p.initRot,
    color: p.color,
    area: r2(p.area),
    symOrder: 1,
  }));
  return {
    task: 'silhouette_build', board: BOARD,
    outline: laid.outline.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
    silArea: r2(area(laid.outline)),
    pieces, posTol: POS_TOL, angleStep: ANGLE_STEP,
    lattice: laid.lattice,
  };
}
function toLattice(m, poly) {
  const L = m.lattice;
  return poly.map((p) => ({ x: Math.round((p.x - L.ox) / L.s), y: Math.round((p.y - L.oy) / L.s) }));
}
const FALLBACK = {"task":"silhouette_build","board":{"w":380,"h":520},"outline":[{"x":288,"y":212},{"x":288,"y":146.67},{"x":222.67,"y":146.67},{"x":222.67,"y":81.33},{"x":157.33,"y":81.33},{"x":157.33,"y":16},{"x":92,"y":16},{"x":92,"y":212}],"silArea":25610.67,"pieces":[{"local":[{"x":39.93,"y":-23.59},{"x":39.93,"y":-56.26},{"x":-25.41,"y":-56.26},{"x":-25.41,"y":107.07}],"target":{"x":117.41,"y":72.26},"initPos":{"x":179.77,"y":416.77},"initRot":5,"color":"#3f9e8f","area":6402.67,"symOrder":1},{"local":[{"x":-65.33,"y":24.5},{"x":-65.33,"y":57.17},{"x":65.33,"y":57.17},{"x":32.67,"y":-73.5},{"x":0,"y":-73.5},{"x":0,"y":-106.17}],"target":{"x":157.33,"y":154.83},"initPos":{"x":121.75,"y":299.81},"initRot":6,"color":"#d98a3d","area":12805.33,"symOrder":1},{"local":[{"x":-18.15,"y":50.81},{"x":47.19,"y":50.81},{"x":47.19,"y":-14.52},{"x":-18.15,"y":-14.52},{"x":-18.15,"y":-79.85},{"x":-50.81,"y":-79.85}],"target":{"x":240.81,"y":161.19},"initPos":{"x":294.52,"y":316.6},"initRot":7,"color":"#7b6cc4","area":6402.67,"symOrder":1}],"posTol":12,"angleStep":45,"lattice":{"s":32.67,"ox":92,"oy":16}};

const BOARD_F = { w: 720, h: 450 };
const PANEL_F = { panelWidth: BOARD_F.w + 20, boardH: BOARD_F.h + 10 };
const SIL_F = { cx: 186, cy: 225, w: 330, h: 400 };
const TRAY_F = { x0: 384, y0: 18, x1: 702, y1: 432 };
const ANG_TOL = 4;
const TILT_OFF = [10, 20];
const AXIS_MIN = 6;
const START_MIN = 25;
const S_MAX = 42;
const GRIP_R = 13, GRIP_L = 46, GRIP_HIT = GRIP_R + 5, GRIP_GAP = 2 * GRIP_R + 8;
const RAD = Math.PI / 180;
const tiltOff = (t) => t - 45 * Math.round(t / 45);
function edgeAxisDev(poly) {
  let mn = 90;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = ((Math.atan2(b.y - a.y, b.x - a.x) / RAD) % 90 + 90) % 90;
    mn = Math.min(mn, d, 90 - d);
  }
  return mn;
}
const gripPos = (p, ang, c) => ({ x: c.x + GRIP_L * Math.cos((p.gripAng + ang) * RAD), y: c.y + GRIP_L * Math.sin((p.gripAng + ang) * RAD) });
const freeVerts = (p, ang, c) => p.local.map((v) => { const r = rotPt(v, ang); return { x: r.x + c.x, y: r.y + c.y }; });
const gripOnBoard = (q, slack = 0) => q.x >= GRIP_R + 4 - slack && q.x <= BOARD_F.w - GRIP_R - 4 + slack && q.y >= GRIP_R + 4 - slack && q.y <= BOARD_F.h - GRIP_R - 4 + slack;
function ptPolyDist(q, P) {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
    m = Math.min(m, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return m;
}

function scatterFree(rng, pieces) {
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b].rad - pieces[a].rad);
  const out = pieces.map((p) => ({ ...p })), polys = new Map();
  for (const i of order) {
    const p = out[i];
    let done = false;
    for (let t = 0; t < 300 && !done; t++) {
      const ang = rng.uniform(-180, 180);
      if (Math.abs(ang) < START_MIN) continue;
      const rv = p.local.map((v) => rotPt(v, ang)), rb = polyBounds(rv);
      if (rb.w > TRAY_F.x1 - TRAY_F.x0 || rb.h > TRAY_F.y1 - TRAY_F.y0) continue;
      const x = rng.uniform(TRAY_F.x0 - rb.x0, TRAY_F.x1 - rb.x1), y = rng.uniform(TRAY_F.y0 - rb.y0, TRAY_F.y1 - rb.y1);
      const poly = rv.map((v) => ({ x: v.x + x, y: v.y + y }));
      if ([...polys.values()].some((q) => polyGap(poly, q) < TRAY_GAP)) continue;
      p.initAng = ang; p.initPos = { x, y };
      polys.set(i, poly); done = true;
    }
    if (!done) return null;
  }
  for (const i of order) {
    const p = out[i];
    let best = null;
    for (let t = 0; t < 80; t++) {
      p.gripAng = rng.uniform(0, 360);
      const gs = gripPos(p, p.initAng, p.initPos), gt = gripPos(p, 0, p.target);
      if (!gripOnBoard(gs) || !gripOnBoard(gt)) continue;
      if (out.some((q, j) => j !== i && q.gripAng != null
        && (Math.hypot(gs.x - gripPos(q, q.initAng, q.initPos).x, gs.y - gripPos(q, q.initAng, q.initPos).y) < GRIP_GAP
          || Math.hypot(gt.x - gripPos(q, 0, q.target).x, gt.y - gripPos(q, 0, q.target).y) < GRIP_GAP))) continue;
      if (best == null) best = p.gripAng;
      if ([...polys.entries()].every(([j, P]) => j === i || (!ptInPoly(gs, P) && ptPolyDist(gs, P) >= GRIP_R + 2))) { best = p.gripAng; break; }
    }
    if (best == null) return null;
    p.gripAng = best;
  }
  return out;
}

function placeFree(rng, decomp, tilt) {
  const b = polyBounds(decomp.outline.map((p) => rotPt(p, tilt)));
  for (let shrink = 0; shrink < 5; shrink++) {
    const s = Math.min(SIL_F.w / b.w, SIL_F.h / b.h, S_MAX) * Math.pow(0.9, shrink);
    const ox = SIL_F.cx - (b.x0 + b.w / 2) * s, oy = SIL_F.cy - (b.y0 + b.h / 2) * s;
    const toPx = (p) => { const r = rotPt(p, tilt); return { x: r.x * s + ox, y: r.y * s + oy }; };
    const pieces = decomp.pieces.map((poly, idx) => {
      const px = poly.map(toPx), c = centroid(px);
      const local = px.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      return { local, target: c, rad: Math.max(...local.map((p) => Math.hypot(p.x, p.y))), area: area(px), color: COLORS[idx % COLORS.length] };
    });
    let laid = null;
    for (let tries = 0; tries < 12 && !laid; tries++) laid = scatterFree(rng, pieces);
    if (laid) return { outline: decomp.outline.map(toPx), pieces: laid, tilt, lattice: { s, ox, oy } };
  }
  return null;
}

function finishFree(laid) {
  const pieces = laid.pieces.map((p) => ({
    local: p.local.map((v) => ({ x: r2(v.x), y: r2(v.y) })),
    target: { x: r2(p.target.x), y: r2(p.target.y) },
    initPos: { x: r2(p.initPos.x), y: r2(p.initPos.y) },
    initAng: r2(p.initAng),
    gripAng: r2(p.gripAng),
    color: p.color,
    area: r2(p.area),
    symOrder: 1,
  }));
  return {
    task: 'silhouette_build', board: { ...BOARD_F }, panel: { ...PANEL_F }, free: 1,
    outline: laid.outline.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
    silArea: r2(area(laid.outline)),
    pieces, posTol: POS_TOL, angTol: ANG_TOL, tilt: laid.tilt, gripL: GRIP_L,
    lattice: { s: r2(laid.lattice.s), ox: r2(laid.lattice.ox), oy: r2(laid.lattice.oy) },
  };
}

function buildFree(rng, last = false) {
  const n = rng.pick(N_PIECES);
  for (let t = 0; t < 600; t++) {
    const outline = orient(rng.pick(BASES), rng.raw() < 0.5, rng.int(0, 3));
    const dec = decompose(rng, outline, n);
    if (!dec) continue;
    for (let k = 0; k < 6; k++) {
      const tilt = r2(45 * rng.int(0, 7) + rng.sign() * rng.uniform(TILT_OFF[0], TILT_OFF[1]));
      if (edgeAxisDev(dec.outline.map((p) => rotPt(p, tilt))) < AXIS_MIN + 0.2) continue;
      const laid = placeFree(rng, dec, tilt);
      if (!laid) continue;
      const m = finishFree(laid);
      if (gateFree(m, false)) return m;
    }
  }
  if (last) throw new Error('silhouette_build: free-turn generation failed');
  return buildFree(wrapRng(mulberry32(0x51b19)), true);
}

function toLatticeFree(m, poly) {
  const L = m.lattice;
  return poly.map((p) => { const q = rotPt({ x: (p.x - L.ox) / L.s, y: (p.y - L.oy) / L.s }, -m.tilt); return { x: Math.round(q.x), y: Math.round(q.y) }; });
}

function gateFree(m, tiling = true) {
  if (m.board?.w !== BOARD_F.w || m.board?.h !== BOARD_F.h || m.panel?.panelWidth !== PANEL_F.panelWidth || m.panel?.boardH !== PANEL_F.boardH) return false;
  if (!Array.isArray(m.pieces) || !N_PIECES.includes(m.pieces.length) || m.posTol !== POS_TOL || m.angTol !== ANG_TOL || m.gripL !== GRIP_L) return false;
  if (!Number.isFinite(m.tilt) || !Array.isArray(m.outline) || !m.lattice || !(m.lattice.s > 0)) return false;
  const off = Math.abs(tiltOff(m.tilt));
  if (off < TILT_OFF[0] - 1e-6 || off > TILT_OFF[1] + 1e-6) return false;
  if (edgeAxisDev(m.outline) < AXIS_MIN) return false;
  const ob = polyBounds(m.outline);
  if (ob.x0 < 6 || ob.y0 < 6 || ob.y1 > BOARD_F.h - 6 || ob.x1 > TRAY_F.x0 - 10) return false;
  const locals = m.pieces.map((p) => p.local.map((v) => rotPt(v, -m.tilt)));
  if (!nearEqualPair(locals) || !pairwiseDistinct(locals, 0.35) || !noLookAlikes(locals)) return false;
  if (!locals.every((p) => p.length >= 3 && p.length <= 6 && shapeReadable(p, 0.005))) return false;
  if (!locals.every((p) => area(p) >= (MIN_PIECE_A - 0.05) * m.lattice.s * m.lattice.s)) return false;
  for (let i = 0; i < m.pieces.length; i++) {
    const p = m.pieces[i];
    if (![p.initAng, p.gripAng, p.initPos?.x, p.initPos?.y].every(Number.isFinite)) return false;
    if (Math.abs(normDeg(p.initAng)) < START_MIN - 1e-6) return false;
    if (symOrder(locals[i]) !== 1 || !ptInPoly(p.target, m.outline)) return false;
  }
  const starts = m.pieces.map((p) => freeVerts(p, p.initAng, p.initPos));
  for (const s of starts) { const b = polyBounds(s); if (b.x0 < TRAY_F.x0 - 3 || b.x1 > TRAY_F.x1 + 3 || b.y0 < TRAY_F.y0 - 3 || b.y1 > TRAY_F.y1 + 3) return false; }
  for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++) if (polyGap(starts[i], starts[j]) < TRAY_GAP - 0.5) return false;
  for (const at of ['start', 'place']) {
    const gs = m.pieces.map((p) => (at === 'start' ? gripPos(p, p.initAng, p.initPos) : gripPos(p, 0, p.target)));
    if (!gs.every((q) => gripOnBoard(q, 0.5))) return false;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) if (Math.hypot(gs[i].x - gs[j].x, gs[i].y - gs[j].y) < GRIP_GAP - 0.5) return false;
  }
  const sum = m.pieces.reduce((s, p) => s + area(p.local), 0);
  if (Math.abs(sum - area(m.outline)) > 0.01 * area(m.outline)) return false;
  if (!tiling) return true;
  const lat = m.pieces.map((p) => toLatticeFree(m, p.local.map((v) => ({ x: v.x + p.target.x, y: v.y + p.target.y }))));
  return tilingCount(toLatticeFree(m, m.outline), lat) === 1;
}

const EXT_G = 6;
function cellsOutline(cells) {
  const has = (x, y) => cells.has(`${x},${y}`);
  const next = new Map();
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (!has(x, y - 1)) next.set(`${x},${y}`, [x + 1, y]);
    if (!has(x + 1, y)) next.set(`${x + 1},${y}`, [x + 1, y + 1]);
    if (!has(x, y + 1)) next.set(`${x + 1},${y + 1}`, [x, y + 1]);
    if (!has(x - 1, y)) next.set(`${x},${y + 1}`, [x, y]);
  }
  const start = next.keys().next().value;
  const loop = []; let cur = start, guard = 0;
  do { const [x, y] = cur.split(',').map(Number); loop.push({ x, y }); const n = next.get(cur); if (!n) return null; cur = `${n[0]},${n[1]}`; } while (cur !== start && ++guard < 400);
  if (loop.length !== next.size) return null;
  const out = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
  return out;
}
const D8 = [(p) => [p.x, p.y], (p) => [-p.y, p.x], (p) => [-p.x, -p.y], (p) => [p.y, -p.x], (p) => [-p.x, p.y], (p) => [p.y, p.x], (p) => [p.x, -p.y], (p) => [-p.y, -p.x]];
function dihedralKeys(poly) {
  return D8.map((f) => {
    const pts = poly.map(f), mx = Math.min(...pts.map((q) => q[0])), my = Math.min(...pts.map((q) => q[1]));
    return pts.map(([x, y]) => [r2(x - mx), r2(y - my)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((q) => q.join(',')).join(';');
  });
}
const outlineCanon = (poly) => dihedralKeys(poly).sort()[0];
const BASE_KEYS = new Set(BASES.map((b) => outlineCanon(b.map(([x, y]) => ({ x, y })))));
const outlineSplit = (poly) => { const k = outlineCanon(poly); return BASE_KEYS.has(k) || hash32(`g19_sil_outline|${k}`) % 10 === 0 ? 'test' : 'train'; };
function randomOutline(rng) {
  for (let t = 0; t < 200; t++) {
    const cells = new Set();
    const k = rng.int(2, 3);
    for (let i = 0; i < k; i++) {
      const w = rng.int(2, 5), h = rng.int(2, 5), x0 = rng.int(0, EXT_G - w), y0 = rng.int(0, EXT_G - h);
      for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) cells.add(`${x},${y}`);
    }
    let poly = cellsOutline(cells);
    if (!poly || poly.length < 6) continue;
    const cuts = rng.pick([0, 0, 1, 1, 2]);
    for (let c = 0; c < cuts; c++) {
      const s0 = Math.sign(signedArea(poly));
      const cand = poly.map((p, i) => i).filter((i) => {
        const a = poly[(i - 1 + poly.length) % poly.length], p = poly[i], b = poly[(i + 1) % poly.length];
        const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
        const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
        return Math.sign(cross) === s0 && la >= 2 && lb >= 2 && (p.x === a.x || p.y === a.y) && (p.x === b.x || p.y === b.y);
      });
      if (!cand.length) break;
      const i = rng.pick(cand), a = poly[(i - 1 + poly.length) % poly.length], p = poly[i], b = poly[(i + 1) % poly.length];
      const ua = { x: Math.sign(a.x - p.x), y: Math.sign(a.y - p.y) }, ub = { x: Math.sign(b.x - p.x), y: Math.sign(b.y - p.y) };
      poly = [...poly.slice(0, i), { x: p.x + ua.x, y: p.y + ua.y }, { x: p.x + ub.x, y: p.y + ub.y }, ...poly.slice(i + 1)];
    }
    if (poly.length < 6 || poly.length > 10) continue;
    const keys = dihedralKeys(poly);
    if (keys.slice(1).some((kk) => kk === keys[0])) continue;
    let pts = poly.map((q) => ({ x: q.x, y: q.y }));
    if (signedArea(pts) > 0) pts = pts.slice().reverse();
    const b = polyBounds(pts);
    return pts.map((q) => ({ x: q.x - b.x0, y: q.y - b.y0 }));
  }
  return null;
}
function decomposeOne(rng, poly) {
  return decompose(rng, poly, rng.pick(N_PIECES));
}
function buildExt(rng, split) {
  for (let t = 0; t < 400; t++) {
    const poly = randomOutline(rng);
    if (!poly || outlineSplit(poly) !== split) continue;
    const dec = decomposeOne(rng, poly);
    if (!dec) continue;
    const laid = place(rng, dec);
    if (!laid) continue;
    const m = finish(laid);
    m.ext = 1;
    if (gate(m)) return m;
  }
  throw new Error('silhouette_build: ext generation failed');
}

export function gate(m) {
  if (m && m.task === 'silhouette_build' && m.free) return gateFree(m);
  if (!m || m.task !== 'silhouette_build' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.pieces) || !N_PIECES.includes(m.pieces.length) || m.posTol !== POS_TOL || m.angleStep !== ANGLE_STEP) return false;
  const locals = m.pieces.map((p) => p.local);
  if (!nearEqualPair(locals) || !pairwiseDistinct(locals, 0.35) || !noLookAlikes(locals)) return false;
  if (!locals.every((p) => p.length >= 3 && p.length <= 6 && shapeReadable(p, 0.005))) return false;
  if (!m.lattice || !locals.every((p) => area(p) >= (MIN_PIECE_A - 0.05) * m.lattice.s * m.lattice.s)) return false;
  for (const p of m.pieces) {
    if (!Number.isInteger(p.initRot) || p.initRot < 5 || p.initRot > 7) return false;
    if (symOrder(p.local) !== 1 || !ptInPoly(p.target, m.outline)) return false;
    if (p.initPos.y < TRAY.y0 - 2) return false;
  }
  const starts = m.pieces.map(startVerts);
  for (const s of starts) { const b = polyBounds(s); if (b.x0 < 5 || b.x1 > BOARD.w - 5 || b.y0 < TRAY.y0 - 3 || b.y1 > BOARD.h - 5) return false; }
  for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++) if (polyGap(starts[i], starts[j]) < TRAY_GAP - 0.5) return false;
  const sum = m.pieces.reduce((s, p) => s + area(p.local), 0);
  if (Math.abs(sum - area(m.outline)) > 0.01 * area(m.outline)) return false;
  if (!m.lattice || !(m.lattice.s > 0)) return false;
  const lat = m.pieces.map((p) => toLattice(m, p.local.map((v) => ({ x: v.x + p.target.x, y: v.y + p.target.y }))));
  return tilingCount(toLattice(m, m.outline), lat) === 1;
}

const clampBoard = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function dispVerts(piece, s) {
  const turn = s.ang != null ? s.ang : s.rot * ANGLE_STEP;
  return piece.local.map((v) => { const r = rotPt(v, turn); return { x: r.x + s.x, y: r.y + s.y }; });
}

export default {
  meta: {
    name: 'silhouette_build', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'move', id: 'piece 0..3', x: 'px', y: 'px' },
      { op: 'rotate', id: 'piece 0..3' },
      { op: 'turn', id: 'piece 0..3', deg: '-180..180' },
    ],
    panelWidth: BOARD.w + 20,
    promptHuman: 'Drag and rotate the pieces to fill the grey outline.',
  },

  generate(rng, level, index, knobs) { return knobs && knobs.ext ? buildExt(rng, knobs.ext) : buildFree(rng); },

  init(m) {
    if (m.free) return { pieces: m.pieces.map((p) => ({ ang: p.initAng, x: p.initPos.x, y: p.initPos.y })), z: m.pieces.map((_, i) => i) };
    return {
      pieces: m.pieces.map((p) => ({ rot: p.initRot, x: p.initPos.x, y: p.initPos.y })),
      z: m.pieces.map((_, i) => i),
    };
  },

  applyAction(state, a, m) {
    if (!Number.isInteger(a.id) || a.id < 0 || a.id >= m.pieces.length) return { ok: false, reason: 'bad-id' };
    const p = state.pieces[a.id];
    if (a.op === 'move') {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-xy' };
      p.x = clampBoard(a.x, 0, m.board.w);
      p.y = clampBoard(a.y, 0, m.board.h);
      return { ok: true };
    }
    if (a.op === 'rotate') {
      if (m.free) return { ok: false, reason: 'bad-op' };
      p.rot = (p.rot + 1) % 8;
      return { ok: true };
    }
    if (a.op === 'turn') {
      if (!m.free || !Number.isFinite(a.deg)) return { ok: false, reason: 'bad-op' };
      p.ang = r2(normDeg(a.deg));
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    let correct = 0;
    const detail = [];
    for (let i = 0; i < m.pieces.length; i++) {
      const s = state.pieces[i], t = m.pieces[i].target;
      const near = Math.hypot(s.x - t.x, s.y - t.y) <= m.posTol;
      const aligned = m.free ? Math.abs(normDeg(s.ang)) <= m.angTol : s.rot % 8 === 0;
      const ok = near && aligned;
      if (ok) correct++;
      detail.push({ near, aligned });
    }
    const n = m.pieces.length;
    return { success: correct === n, partial: correct / n, error: n - correct, detail };
  },

  oracle(m) {
    const acts = [];
    m.pieces.forEach((p, id) => {
      acts.push({ op: 'move', id, x: p.target.x, y: p.target.y });
      if (m.free) { acts.push({ op: 'turn', id, deg: 0 }); return; }
      const taps = (8 - p.initRot) % 8;
      for (let k = 0; k < taps; k++) acts.push({ op: 'rotate', id });
    });
    return acts;
  },

  randomPolicy(m, rnd) {
    const b = polyBounds(m.outline), acts = [];
    m.pieces.forEach((_, id) => {
      acts.push({ op: 'move', id, x: b.x0 + rnd() * b.w, y: b.y0 + rnd() * b.h });
      if (m.free) { acts.push({ op: 'turn', id, deg: rnd() * 360 - 180 }); return; }
      const k = Math.floor(rnd() * 8);
      for (let q = 0; q < k; q++) acts.push({ op: 'rotate', id });
    });
    return acts;
  },

  async mount(env) {
    if (!env || !env.style) return;
    const { buildSilLook, drawSilBoard } = await import('../common/_silhouette_build_look.js');
    env.assets.silLook = await buildSilLook(env.style, env.manifest);
    env.assets.drawSilBoard = drawSilBoard;
  },

  drawPrompt(g, r, env) {
    const free = env && env.manifest && env.manifest.free;
    drawPromptText(g, r, 'Fill the grey outline with the pieces', free ? 'Drag ↻ to turn a piece' : 'Tap ↻ to turn a piece');
  },

  _tracePoly(g, verts) {
    g.beginPath();
    verts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
  },

  _drawKnob(g, cx, cy, R = KNOB_R) {
    const k = R / KNOB_R;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = '#3a4048'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = '#3a4048'; g.lineWidth = 1.8; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, 5.6 * k, -0.55 * Math.PI, 0.95 * Math.PI); g.stroke();
    const ang = 0.95 * Math.PI, tx = cx + 5.6 * k * Math.cos(ang), ty = cy + 5.6 * k * Math.sin(ang);
    g.fillStyle = '#3a4048';
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx - 4.4 * k, ty - 1.2 * k);
    g.lineTo(tx - 0.6 * k, ty + 3.9 * k);
    g.closePath(); g.fill();
    g.restore();
  },

  _drawFree(g, br, m, st) {
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef2f6'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = '#e7ebf1';
    rr(g, TRAY_F.x0 - 10, TRAY_F.y0 - 8, TRAY_F.x1 - TRAY_F.x0 + 20, TRAY_F.y1 - TRAY_F.y0 + 16, 10); g.fill();
    this._tracePoly(g, m.outline);
    g.fillStyle = '#c6cdd7'; g.fill();
    g.strokeStyle = '#5a626d'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    for (const i of st.z) {
      this._tracePoly(g, dispVerts(m.pieces[i], st.pieces[i]));
      g.fillStyle = m.pieces[i].color; g.fill();
      g.strokeStyle = '#2b3038'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    }
    this._tracePoly(g, m.outline);
    g.strokeStyle = 'rgba(66,74,84,.9)'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    for (const i of st.z) {
      const s = st.pieces[i], q = gripPos(m.pieces[i], s.ang, s);
      g.strokeStyle = '#3a4048'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(q.x, q.y); g.stroke();
      g.beginPath(); g.arc(s.x, s.y, 4, 0, Math.PI * 2); g.fillStyle = '#3a4048'; g.fill();
      this._drawKnob(g, q.x, q.y, GRIP_R);
    }
    g.restore();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    if (m.free) { this._drawFree(g, br, m, st); return; }
    if (env.assets && env.assets.silLook) {
      env.assets.drawSilBoard(g, br, m, st, env.assets.silLook, { dispVerts, TRAY, knob: (cx, cy) => this._drawKnob(g, cx, cy) });
      return;
    }
    g.save(); g.translate(br.x, br.y);

    g.fillStyle = '#eef2f6'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = '#e7ebf1';
    rr(g, 8, TRAY.y0 - 6, br.w - 16, TRAY.y1 - TRAY.y0 + 12, 10); g.fill();

    this._tracePoly(g, m.outline);
    g.fillStyle = '#c6cdd7'; g.fill();
    g.strokeStyle = '#5a626d'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();

    for (const i of st.z) {
      const verts = dispVerts(m.pieces[i], st.pieces[i]);
      this._tracePoly(g, verts);
      g.fillStyle = m.pieces[i].color; g.fill();
      g.strokeStyle = '#2b3038'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    }
    this._tracePoly(g, m.outline);
    g.strokeStyle = 'rgba(66,74,84,.9)'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();

    for (const i of st.z) this._drawKnob(g, st.pieces[i].x, st.pieces[i].y);

    g.restore();
  },

  wantsMoveRedraw: true,

  _bringFront(st, id) {
    st.z = st.z.filter((k) => k !== id); st.z.push(id);
  },

  _pick(m, st, x, y) {
    for (let z = st.z.length - 1; z >= 0; z--) {
      const id = st.z[z], s = st.pieces[id];
      if (Math.hypot(x - s.x, y - s.y) <= KNOB_R) return { id, knob: true };
    }
    for (let z = st.z.length - 1; z >= 0; z--) {
      const id = st.z[z];
      if (ptInPoly({ x, y }, dispVerts(m.pieces[id], st.pieces[id]))) return { id, knob: false };
    }
    return null;
  },

  _pickFree(m, st, x, y) {
    for (let z = st.z.length - 1; z >= 0; z--) {
      const id = st.z[z], s = st.pieces[id], q = gripPos(m.pieces[id], s.ang, s);
      if (Math.hypot(x - q.x, y - q.y) <= GRIP_HIT) return { id, grip: true };
    }
    for (let z = st.z.length - 1; z >= 0; z--) {
      const id = st.z[z];
      if (ptInPoly({ x, y }, dispVerts(m.pieces[id], st.pieces[id]))) return { id, grip: false };
    }
    return null;
  },

  _pointerFree(evt, m, st) {
    const turnTo = (gr, x, y) => {
      const s = st.pieces[gr.id], a = Math.atan2(y - s.y, x - s.x) / RAD;
      return [{ op: 'turn', id: gr.id, deg: r2(normDeg(gr.ang0 + a - gr.a0)) }];
    };
    if (evt.type === 'down') {
      const hit = this._pickFree(m, st, evt.x, evt.y);
      if (!hit) { this._grab = null; return []; }
      this._bringFront(st, hit.id);
      const s = st.pieces[hit.id];
      this._grab = hit.grip
        ? { id: hit.id, grip: true, a0: Math.atan2(evt.y - s.y, evt.x - s.x) / RAD, ang0: s.ang }
        : { id: hit.id, grip: false, ox: evt.x - s.x, oy: evt.y - s.y, x0: evt.x, y0: evt.y, moved: false };
      return [];
    }
    const gr = this._grab;
    if (!gr || (evt.type !== 'move' && evt.type !== 'up')) return [];
    if (evt.type === 'up') this._grab = null;
    if (gr.grip) return turnTo(gr, evt.x, evt.y);
    if (!gr.moved && Math.hypot(evt.x - gr.x0, evt.y - gr.y0) > MOVE_EPS) gr.moved = true;
    return gr.moved ? [{ op: 'move', id: gr.id, x: r2(evt.x - gr.ox), y: r2(evt.y - gr.oy) }] : [];
  },

  pointer(evt, env) {
    const { manifest: m, state: st } = env;
    if (m.free) return this._pointerFree(evt, m, st);
    if (evt.type === 'down') {
      const hit = this._pick(m, st, evt.x, evt.y);
      if (!hit) { this._grab = null; return []; }
      this._bringFront(st, hit.id);
      const s = st.pieces[hit.id];
      this._grab = { id: hit.id, knob: hit.knob, ox: evt.x - s.x, oy: evt.y - s.y, x0: evt.x, y0: evt.y, moved: false };
      return [];
    }
    if (evt.type === 'move' && this._grab) {
      if (!this._grab.moved && Math.hypot(evt.x - this._grab.x0, evt.y - this._grab.y0) > MOVE_EPS) this._grab.moved = true;
      if (this._grab.moved) return [{ op: 'move', id: this._grab.id, x: r2(evt.x - this._grab.ox), y: r2(evt.y - this._grab.oy) }];
      return [];
    }
    if (evt.type === 'up' && this._grab) {
      const gr = this._grab; this._grab = null;
      if (gr.moved) return [{ op: 'move', id: gr.id, x: r2(evt.x - gr.ox), y: r2(evt.y - gr.oy) }];
      if (gr.knob) return [{ op: 'rotate', id: gr.id }];
      return [];
    }
    return [];
  },

  footerStatus() { return 'Drag the pieces'; },
};

export function semanticKey(m) {
  const b = polyBounds(m.outline), u = Math.max(b.w, b.h) / 12;
  const sil = m.outline.map((p) => `${Math.round((p.x - b.x0) / u)},${Math.round((p.y - b.y0) / u)}`).join(';');
  const A = area(m.outline);
  const W = m.board?.w || BOARD.w, H = m.board?.h || BOARD.h;
  const qx = (v) => Math.floor(v / (W / 8)), qy = (v) => Math.floor(v / (H / 8));
  const turn = (p) => (m.free ? `a${Math.round(normDeg(p.initAng) / 15)}` : p.initRot);
  const pcs = m.pieces.map((p) => `${p.local.length}/${Math.round((20 * area(p.local)) / A)}/${turn(p)}@${qx(p.initPos.x)},${qy(p.initPos.y)}`).sort();
  if (m.free) return `silhouette_build|t${Math.round(tiltOff(m.tilt) / 5)}|${sil}|${pcs.join(' ')}`;
  return `silhouette_build|${sil}|${pcs.join(' ')}`;
}
