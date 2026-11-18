import { drawPromptText, UI_FONT } from '../core/panel.js';
import { hash32 } from '../core/style.js';
import { kindTexPairs, primaryOf, natural, detail, tinted, facePat, pat, isoTex, meanHex, lumOf, shade, toneTo, mix, pickSplit } from '../common/_block_mat.js';

const BOARD = { w: 340, h: 340 };
const HARD = Object.freeze({
  n: 4, maxHeight: 4,
  minNonzero: 11, minHidden: 5,
  total: { min: 16, max: 40 },
  answer: { min: 1, max: 48 },
  tol: 0,
});
const GEN_TRIES = 4000;
const ISO = { ox: 170, oy: 250, dx: 34, dy: 17, dz: 30 };
const VIEW_ISO = { ox: 170, oy: 290, dx: 28, dy: 23, dz: 23 };

const COMPOSITIONS = (() => {
  const cells = HARD.n * HARD.n, top = cells * HARD.maxHeight;
  const w = [Array.from({ length: top + 1 }, (_, s) => (s === 0 ? 1 : 0))];
  for (let i = 1; i <= cells; i++) {
    w.push(Array.from({ length: top + 1 }, (_, s) => {
      let acc = 0;
      for (let h = 0; h <= HARD.maxHeight && h <= s; h++) acc += w[i - 1][s - h];
      return acc;
    }));
  }
  return w;
})();

function gridWithTotal(rng, total) {
  const cells = HARD.n * HARD.n;
  const flat = [];
  let left = total;
  for (let i = 0; i < cells; i++) {
    const rest = cells - i - 1;
    let roll = rng.uniform(0, COMPOSITIONS[rest + 1][left]), h = 0;
    for (; h <= HARD.maxHeight; h++) {
      const ways = left - h >= 0 ? COMPOSITIONS[rest][left - h] : 0;
      if (roll < ways) break;
      roll -= ways;
    }
    h = Math.min(h, Math.min(HARD.maxHeight, left));
    flat.push(h); left -= h;
  }
  return Array.from({ length: HARD.n }, (_, r) => flat.slice(r * HARD.n, (r + 1) * HARD.n));
}

function project(x, y, z, iso = ISO) {
  return { x: iso.ox + (x - y) * iso.dx, y: iso.oy - (x + y) * iso.dy - z * iso.dz };
}

function facePath(g, points) {
  g.beginPath();
  points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

function totalCubes(heights) {
  return heights.reduce((sum, row) => sum + row.reduce((a, h) => a + h, 0), 0);
}
function hiddenCubes(heights) {
  return heights.flat().reduce((sum, h) => sum + Math.max(0, h - 1), 0);
}
function nonzeroCols(heights) {
  return heights.flat().filter((h) => h > 0).length;
}

function inConvexQuad(p, q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

function shrinkFace(q, f = 0.82) {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  return q.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
}

function paintedFaces(heights, n) {
  const cubes = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    for (let z = 0; z < heights[y][x]; z++) cubes.push({ x, y, z });
  }
  cubes.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.z - b.z || a.y - b.y);
  return cubes.map(({ x, y, z }, order) => {
    const h = heights[y][x];
    const eastH = x + 1 < n ? heights[y][x + 1] : 0;
    const southH = y + 1 < n ? heights[y + 1][x] : 0;
    const p100 = project(x + 1, y, z), p110 = project(x + 1, y + 1, z), p010 = project(x, y + 1, z);
    const p001 = project(x, y, z + 1), p101 = project(x + 1, y, z + 1), p111 = project(x + 1, y + 1, z + 1), p011 = project(x, y + 1, z + 1);
    const faces = [];
    if (eastH <= z) faces.push([p101, p100, p110, p111]);
    if (southH <= z) faces.push([p011, p111, p110, p010]);
    const topQuad = [p001, p101, p111, p011];
    if (z === h - 1) faces.push(topQuad);
    return { order, x, y, isTop: z === h - 1, topQuad, faces };
  });
}

function allTopsVisible(heights, n) {
  const painted = paintedFaces(heights, n);
  for (const cube of painted) {
    if (!cube.isTop) continue;
    const q = cube.topQuad;
    const c = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
    for (const other of painted) {
      if (other.order <= cube.order) continue;
      if (other.faces.some((f) => inConvexQuad(c, shrinkFace(f)))) return false;
    }
  }
  return true;
}

const BAND_PX = 25;
function visibleFaceAreas(heights, n, iso = VIEW_ISO, mask = null) {
  const W = 340, Hh = 340, buf = new Int32Array(W * Hh).fill(-1), keys = [];
  const fill = (poly, id) => {
    const y0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y)))), y1 = Math.min(Hh - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > yc) !== (b.y > yc)) xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        for (let x = Math.max(0, Math.ceil(xs[q] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[q + 1] - 0.5)); x++) buf[y * W + x] = id;
      }
    }
  };
  const view = (x, y, z) => project(x, y, z, iso);
  const cubes = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let z = 0; z < heights[y][x]; z++) cubes.push({ x, y, z });
  cubes.sort((a, b) => (b.x + b.y) - (a.x + a.y) || a.z - b.z || a.y - b.y);
  void mask;
  for (const { x, y, z } of cubes) {
    const westH = x > 0 ? heights[y][x - 1] : 0, northH = y > 0 ? heights[y - 1][x] : 0;
    const p000 = view(x, y, z), p100 = view(x + 1, y, z), p010 = view(x, y + 1, z);
    const p001 = view(x, y, z + 1), p101 = view(x + 1, y, z + 1), p011 = view(x, y + 1, z + 1), p111 = view(x + 1, y + 1, z + 1);
    if (westH <= z) { keys.push(`${x},${y},${z},W`); fill([p000, p010, p011, p001], keys.length - 1); }
    if (northH <= z) { keys.push(`${x},${y},${z},N`); fill([p000, p100, p101, p001], keys.length - 1); }
    if (z === heights[y][x] - 1) { keys.push(`${x},${y},${z},T`); fill([p001, p101, p111, p011], keys.length - 1); }
  }
  const area = new Array(keys.length).fill(0);
  for (const v of buf) if (v >= 0) area[v]++;
  return new Map(keys.map((k, i) => [k, area[i]]));
}
export function heightsReadable(heights, n = heights.length, iso = VIEW_ISO) {
  const A = visibleFaceAreas(heights, n, iso);
  const seen = (x, y, z, k) => (A.get(`${x},${y},${z},${k}`) || 0) >= BAND_PX;
  const bands = (x, y, z0, z1, k) => { for (let z = z0; z < z1; z++) if (!seen(x, y, z, k)) return false; return true; };
  const H = heights, known = H.map((r) => r.map((h) => h === 0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const h = H[y][x];
    if (h > 0 && !seen(x, y, h - 1, 'T')) return false;
    if (h > 0 && (bands(x, y, 0, h, 'W') || bands(x, y, 0, h, 'N'))) known[y][x] = true;
  }
  for (let grew = true; grew;) {
    grew = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (known[y][x]) continue;
      const h = H[y][x];
      const steps = [
        [x - 1, y, () => H[y][x - 1] <= h && bands(x, y, H[y][x - 1], h, 'W')],
        [x, y - 1, () => H[y - 1][x] <= h && bands(x, y, H[y - 1][x], h, 'N')],
        [x + 1, y, () => H[y][x + 1] >= h && bands(x + 1, y, h, H[y][x + 1], 'W')],
        [x, y + 1, () => H[y + 1][x] >= h && bands(x, y + 1, h, H[y + 1][x], 'N')],
      ];
      if (steps.some(([nx, ny, ok]) => nx >= 0 && ny >= 0 && nx < n && ny < n && known[ny][nx] && ok())) { known[y][x] = true; grew = true; }
    }
  }
  return known.every((r) => r.every(Boolean));
}

const AMB = Object.freeze({ minAltTops: 3, padSeen: BAND_PX, minDiff: 600, maxCombos: 6000, maxTrueShare: 0.5 });
const KW = 340, KH = 340;
const faceKey = (type, u, v) => type * 4096 + (u + 32) * 64 + v;
const PIX_CACHE = new Map();
function quadPixels(poly) {
  const out = [];
  const y0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y)))), y1 = Math.min(KH - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > yc) !== (b.y > yc)) xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      for (let x = Math.max(0, Math.ceil(xs[q] - 0.5)); x <= Math.min(KW - 1, Math.floor(xs[q + 1] - 0.5)); x++) out.push(y * KW + x);
    }
  }
  return Int32Array.from(out);
}
const SP = (u, v) => ({ x: VIEW_ISO.ox + u * VIEW_ISO.dx, y: VIEW_ISO.oy - v * VIEW_ISO.dy });
function facePixels(type, u, v) {
  const k = faceKey(type, u, v);
  let px = PIX_CACHE.get(k);
  if (!px) {
    const q = type === 1 ? [SP(u, v + 1), SP(u + 1, v + 2), SP(u, v + 3), SP(u - 1, v + 2)]
      : type === 2 ? [SP(u, v), SP(u - 1, v + 1), SP(u - 1, v + 2), SP(u, v + 1)]
        : [SP(u, v), SP(u + 1, v + 1), SP(u + 1, v + 2), SP(u, v + 1)];
    px = quadPixels(q); PIX_CACHE.set(k, px);
  }
  return px;
}
const PAD_BASE = new Map();
function padImage(n) {
  if (!PAD_BASE.has(n)) {
    const img = new Int32Array(KW * KH).fill(-1);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      for (const i of quadPixels([SP(x - y, x + y), SP(x + 1 - y, x + y + 1), SP(x - y, x + y + 2), SP(x - y - 1, x + y + 1)])) img[i] = 20000 + y * 8 + x;
    }
    PAD_BASE.set(n, img);
  }
  return PAD_BASE.get(n);
}
function faceMap(H, n) {
  const img = padImage(n).slice();
  const cubes = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let z = 0; z < H[y][x]; z++) cubes.push({ x, y, z });
  cubes.sort((a, b) => (b.x + b.y) - (a.x + a.y) || a.z - b.z || a.y - b.y);
  for (const { x, y, z } of cubes) {
    const u = x - y, v = x + y + z;
    const westH = x > 0 ? H[y][x - 1] : 0, northH = y > 0 ? H[y - 1][x] : 0;
    const paint = (t) => { const k = faceKey(t, u, v); for (const i of facePixels(t, u, v)) img[i] = k; };
    if (westH <= z) paint(2);
    if (northH <= z) paint(3);
    if (z === H[y][x] - 1) paint(1);
  }
  return img;
}
function diffPx(a, b, stop) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d >= stop) return d;
  return d;
}
function diagonalReadings(H, n, cap, banned, visit) {
  const cols = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (H[y][x] > 0) {
    const opts = [];
    for (let k = -n; k <= n; k++) {
      const X = x + k, Y = y + k, h = H[y][x] - 2 * k;
      if (X < 0 || Y < 0 || X >= n || Y >= n || h < 1 || h > cap || banned[Y][X]) continue;
      opts.push([X, Y, h]);
    }
    cols.push(opts);
  }
  const G = Array.from({ length: n }, () => Array(n).fill(0));
  let combos = 0, stopped = false;
  const rec = (i) => {
    if (stopped) return;
    if (i === cols.length) { combos++; if (visit(G) || combos >= AMB.maxCombos) stopped = true; return; }
    for (const [X, Y, h] of cols[i]) {
      if (G[Y][X]) continue;
      G[Y][X] = h; rec(i + 1); G[Y][X] = 0;
      if (stopped) return;
    }
  };
  rec(0);
  return { combos, stopped };
}
function padSeenCells(img, n) {
  const area = new Map();
  for (const v of img) if (v >= 20000) area.set(v, (area.get(v) || 0) + 1);
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (area.get(20000 + y * 8 + x) || 0) >= AMB.padSeen));
}
export function ambiguityStats(heights, n = heights.length, full = true) {
  const H = heights, total = totalCubes(H), img = faceMap(H, n), padSeen = padSeenCells(img, n);
  let altTops = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (H[y][x] > 0) {
    for (const k of [-3, -2, -1, 1, 2, 3]) {
      const X = x + k, Y = y + k, h = H[y][x] - 2 * k;
      if (X >= 0 && Y >= 0 && X < n && Y < n && h >= 1 && h <= HARD.maxHeight && !padSeen[Y][X]) { altTops++; break; }
    }
  }
  const plausible = new Set();
  let nRead = 0, nTrue = 0;
  diagonalReadings(H, n, HARD.maxHeight, padSeen, (G) => { const t = totalCubes(G); plausible.add(t); nRead++; if (t === total) nTrue++; return false; });
  const out = { altTops, plausibleTotals: [...plausible].sort((a, b) => a - b), trueShare: nTrue / Math.max(1, nRead), total };
  if (!full) return out;
  let minDiff = Infinity, nearest = null;
  const none = Array.from({ length: n }, () => Array(n).fill(false));
  const r = diagonalReadings(H, n, 2 * HARD.maxHeight + 2, none, (G) => {
    if (totalCubes(G) === total) return false;
    const d = diffPx(faceMap(G, n), img, minDiff);
    if (d < minDiff) { minDiff = d; nearest = G.map((row) => row.slice()); }
    return minDiff < AMB.minDiff;
  });
  return { ...out, minDiff, nearest, combos: r.combos, exhausted: !r.stopped || minDiff < AMB.minDiff };
}
function ambiguityOk(heights, n = heights.length) {
  const a = ambiguityStats(heights, n, false);
  if (a.altTops < AMB.minAltTops || a.plausibleTotals.length < 2 || a.trueShare > AMB.maxTrueShare) return false;
  const c = ambiguityStats(heights, n, true);
  return c.exhausted && c.minDiff >= AMB.minDiff;
}

export function gate(m) {
  if (m && m.ext) return extGate(m);
  return !!m && m.task === 'block_count' && m.n === HARD.n && m.tol === 0 && m.hidden >= HARD.minHidden && m.nonzero >= HARD.minNonzero
    && m.heights.flat().every((h) => Number.isInteger(h) && h >= 0 && h <= HARD.maxHeight)
    && m.count >= HARD.total.min && m.count <= HARD.total.max
    && m.heights.flat().reduce((a, h) => a + h, 0) === m.count && heightsReadable(m.heights) && ambiguityOk(m.heights);
}

const EXT_SIZES = [{ n: 3, H: 3 }, { n: 4, H: 2 }, { n: 4, H: 3 }, { n: 4, H: 4 }];
function compTable(C, H) {
  const top = C * H, w = [Array.from({ length: top + 1 }, (_, s) => (s === 0 ? 1 : 0))];
  for (let i = 1; i <= C; i++) w.push(Array.from({ length: top + 1 }, (_, s) => { let a = 0; for (let h = 0; h <= H && h <= s; h++) a += w[i - 1][s - h]; return a; }));
  return w;
}
const COMP_CACHE = new Map();
function extFootprint(rng, n) {
  const cut = n === 3 ? rng.int(0, 2) : rng.int(0, 5);
  for (let att = 0; att < 200; att++) {
    const on = Array.from({ length: n }, () => Array(n).fill(true));
    let ok = true;
    for (let k = 0; k < cut && ok; k++) {
      const border = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (on[y][x] && (x === 0 || y === 0 || x === n - 1 || y === n - 1)) border.push([x, y]);
      const [x, y] = rng.pick(border);
      on[y][x] = false;
    }
    const cells = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (on[y][x]) cells.push([x, y]);
    const seen = new Set([cells[0].join()]), st = [cells[0]];
    while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = [x + dx, y + dy]; if (q[0] >= 0 && q[1] >= 0 && q[0] < n && q[1] < n && on[q[1]][q[0]] && !seen.has(q.join())) { seen.add(q.join()); st.push(q); } } }
    if (seen.size !== cells.length) continue;
    return on;
  }
  return Array.from({ length: n }, () => Array(n).fill(true));
}
function extView(rng, n, H) {
  const ry = rng.uniform(0.88, 0.96), rz = rng.uniform(0.5, 0.58);
  const dx = Math.min(36, 150 / n, 290 / (2 * n * ry + H * rz));
  const r1 = (v) => Math.round(v * 10) / 10;
  const v = { dx: r1(dx), dy: r1(dx * ry), dz: r1(dx * rz) };
  const hTot = 2 * n * v.dy + H * v.dz;
  v.ox = r1(170 + rng.uniform(-6, 6));
  v.oy = r1(170 + hTot / 2 + rng.uniform(-4, 4));
  return v;
}
function extFits(view, n, H) {
  const ys = [view.oy, view.oy - 2 * n * view.dy - H * view.dz];
  return view.ox - n * view.dx >= 6 && view.ox + n * view.dx <= 334 && ys[1] >= 6 && ys[0] <= 334;
}
function generateExt(rng) {
  for (let outer = 0; outer < 50; outer++) {
    const { n, H } = rng.pick(EXT_SIZES);
    const foot = extFootprint(rng, n);
    const cells = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (foot[y][x]) cells.push([x, y]);
    const C = cells.length, nzMin = Math.ceil(0.6 * C);
    const tMin = Math.max(HARD.total.min, nzMin + 3), tMax = Math.min(HARD.total.max, Math.floor(C * H * 0.62));
    if (tMax < tMin + 6) continue;
    const view = extView(rng, n, H);
    if (!extFits(view, n, H)) continue;
    const ck = `${C},${H}`;
    if (!COMP_CACHE.has(ck)) COMP_CACHE.set(ck, compTable(C, H));
    const W = COMP_CACHE.get(ck);
    const count = rng.int(tMin, tMax);
    for (let att = 0; att < 400; att++) {
      const flat = []; let left = count;
      for (let i = 0; i < C; i++) {
        const rest = C - i - 1;
        let roll = rng.uniform(0, W[rest + 1][left]), h = 0;
        for (; h <= H; h++) { const ways = left - h >= 0 ? W[rest][left - h] : 0; if (roll < ways) break; roll -= ways; }
        h = Math.min(h, H, left); flat.push(h); left -= h;
      }
      if (left !== 0) continue;
      const heights = Array.from({ length: n }, () => Array(n).fill(0));
      cells.forEach(([x, y], i) => { heights[y][x] = flat[i]; });
      if (nonzeroCols(heights) < nzMin || hiddenCubes(heights) < 3) continue;
      if (!heightsReadable(heights, n, view)) continue;
      const foot01 = foot.map((r) => r.map((b) => (b ? 1 : 0)));
      return {
        task: 'block_count', board: BOARD, n, heights, count: totalCubes(heights),
        hidden: hiddenCubes(heights), nonzero: nonzeroCols(heights),
        min: HARD.answer.min, max: HARD.answer.max, tol: HARD.tol,
        ext: { foot: foot01, maxHeight: H, total: [tMin, tMax] }, view,
      };
    }
  }
  throw new Error('block_count: ext sampler exhausted');
}
function extGate(m) {
  if (m.task !== 'block_count' || !m.view || ![3, 4].includes(m.n) || m.tol !== 0) return false;
  const { foot, maxHeight: H, total } = m.ext;
  if (!Array.isArray(foot) || foot.length !== m.n || !Array.isArray(m.heights) || m.heights.length !== m.n) return false;
  let C = 0;
  for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) {
    const h = m.heights[y][x];
    if (!Number.isInteger(h) || h < 0 || h > H || (!foot[y][x] && h)) return false;
    C += foot[y][x];
  }
  return m.count === totalCubes(m.heights) && m.hidden === hiddenCubes(m.heights) && m.hidden >= 3
    && m.nonzero >= Math.ceil(0.6 * C) && m.count >= total[0] && m.count <= total[1] && m.count >= HARD.total.min && m.count <= HARD.total.max && H <= HARD.maxHeight
    && extFits(m.view, m.n, H) && heightsReadable(m.heights, m.n, m.view);
}

async function mountLook(st) {
  const pairs = kindTexPairs(st, ['wood', 'stone', 'plastic', 'concrete', 'metal'], () => true, 'block_count');
  const pads = st.pool('tex', (t) => (t.use === 'wood' || isoTex(t, 0.25, 0.3)) && t.use !== 'metal');
  const tables = st.pool('tex', (t) => t.use === 'floor' || t.use === 'wall' || t.use === 'wood' || t.use === 'flat2d');
  const [[kind, tex], ptex, ttex] = primaryOf(st, 'g17_block_count', [pairs, pads, tables]);
  st.note(`block:${kind}:${tex.id}`); st.note(`pad:${ptex.id}`); st.note(`table:${ttex.id}`);
  const r = st.rand;
  const TOY = ['#e0483e', '#f2b134', '#3fa65b', '#2f7fd8', '#8e5cc9', '#f07c2b', '#e9e4d8'];
  let top, base;
  if (kind === 'plastic') {
    base = pickSplit(st, 'g17_toy', TOY);
    top = tinted(await detail(tex.file, 128), base, 0.06);
  } else {
    base = meanHex(tex);
    const L = kind === 'metal' ? 0.6 + 0.15 * r() : clamp01(Math.max(0.42, lumOf(base) * 1.6), 0.42, 0.78);
    top = await natural(tex.file, { L, contrast: 0.6, sat: 0.85 });
    base = toneTo(base, L, 0.5);
  }
  const padBase = meanHex(ptex);
  const padL = lumOf(base) > 0.55 ? 0.3 + 0.12 * r() : 0.72 + 0.12 * r();
  const pad = await natural(ptex.file, { L: padL, contrast: 0.5, sat: 0.6 });
  const table = await natural(ttex.file, { L: 0.88 + 0.06 * r(), contrast: 0.22, sat: 0.3 });
  return {
    kind, top, base, pad, table, padLine: padL > 0.5 ? 'rgba(40,40,40,0.45)' : 'rgba(255,255,255,0.55)',
    padEdge: shade(toneTo(padBase, padL, 0.4), 0.6),
    edge: kind === 'plastic' ? shade(base, 0.45) : shade(base, 0.32),
    span: 1.4 + 1.2 * r(), salt: Math.floor(r() * 1e6), studs: kind === 'plastic' && r() < 0.75,
    tableK: 0.6 + 0.5 * r(), tableOff: [r() * 256, r() * 256],
  };
}
const clamp01 = (v, a, b) => Math.max(a, Math.min(b, v));
const FACE_K = { top: 1, right: 0.8, left: 0.62 };
function styledFace(g, L, quad, which, x, y, z) {
  facePath(g, quad);
  const O = quad[0], U = { x: (quad[1].x - O.x) * L.span, y: (quad[1].y - O.y) * L.span }, V = { x: (quad[3].x - O.x) * L.span, y: (quad[3].y - O.y) * L.span };
  const h = hash32(`${L.salt}|${x},${y},${z}|${which}`);
  const fx = (h & 1023) / 1024, fy = ((h >>> 10) & 1023) / 1024;
  const O2 = { x: O.x - U.x * fx - V.x * fy, y: O.y - U.y * fx - V.y * fy };
  g.fillStyle = facePat(g, L.top, O2, U, V); g.fill();
  const k = FACE_K[which];
  if (k < 1) { g.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(3)})`; g.fill(); }
  g.strokeStyle = L.edge; g.stroke();
}
function drawStud(g, L, quad) {
  const c = { x: (quad[0].x + quad[2].x) / 2, y: (quad[0].y + quad[2].y) / 2 };
  const rx = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) * 0.3;
  const ry = rx * Math.abs((quad[2].y - quad[0].y) / Math.max(1, Math.abs(quad[1].x - quad[3].x)));
  g.beginPath(); g.ellipse(c.x, c.y + ry * 0.35, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = shade(L.base, 0.72); g.fill();
  g.beginPath(); g.ellipse(c.x, c.y - ry * 0.15, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = mix(L.base, '#ffffff', 0.12); g.fill();
  g.strokeStyle = L.edge; g.lineWidth = 0.8; g.stroke(); g.lineWidth = 1;
}
function drawStyled(g, br, m, L) {
  const iso = m.view || VIEW_ISO;
  const view = (x, y, z) => project(x, y, z, iso);
  const n = m.n, foot = m.ext?.foot;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = pat(g, L.table, L.tableK, 0, 0, L.tableK, L.tableOff[0], L.tableOff[1]); g.fillRect(0, 0, br.w, br.h);
  if (!m.view) g.translate(0, 12);
  const inFoot = (x, y) => !foot || !!foot[y][x];
  const cellQ = (x, y) => [view(x, y, 0), view(x + 1, y, 0), view(x + 1, y + 1, 0), view(x, y + 1, 0)];
  g.save();
  g.beginPath();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inFoot(x, y)) { const q = cellQ(x, y); g.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i++) g.lineTo(q[i].x, q[i].y); g.closePath(); }
  const P0 = view(0, 0, 0), PX = view(1, 0, 0), PY = view(0, 1, 0);
  g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  g.fillStyle = facePat(g, L.pad, P0, { x: (PX.x - P0.x) * 2.5, y: (PX.y - P0.y) * 2.5 }, { x: (PY.x - P0.x) * 2.5, y: (PY.y - P0.y) * 2.5 });
  g.fill();
  g.restore();
  g.lineWidth = 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inFoot(x, y)) { facePath(g, cellQ(x, y)); g.strokeStyle = L.padLine; g.stroke(); }
  const cubes = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let z = 0; z < m.heights[y][x]; z++) cubes.push({ x, y, z });
  cubes.sort((a, b) => (b.x + b.y) - (a.x + a.y) || a.z - b.z || a.y - b.y);
  g.lineJoin = 'round'; g.lineWidth = 1;
  for (const { x, y, z } of cubes) {
    const h = m.heights[y][x];
    const westH = x > 0 ? m.heights[y][x - 1] : 0, northH = y > 0 ? m.heights[y - 1][x] : 0;
    const p000 = view(x, y, z), p100 = view(x + 1, y, z), p010 = view(x, y + 1, z);
    const p001 = view(x, y, z + 1), p101 = view(x + 1, y, z + 1), p011 = view(x, y + 1, z + 1), p111 = view(x + 1, y + 1, z + 1);
    if (westH <= z) styledFace(g, L, [p001, p011, p010, p000], 'left', x, y, z);
    if (northH <= z) styledFace(g, L, [p001, p101, p100, p000], 'right', x, y, z);
    if (z === h - 1) { const q = [p001, p101, p111, p011]; styledFace(g, L, q, 'top', x, y, z); if (L.studs) drawStud(g, L, q); }
  }
  g.restore();
}

export default {
  meta: {
    name: 'block_count', family: 'D', 
    boardH: BOARD.h + 10, headerH: 54, footer: 'input', board: BOARD,
    inputPlaceholder: 'Number of cubes',
    actionSpace: [{ op: 'input', value: 'typed text; a whole number is read as the count' }],
    promptHuman: 'Type how many cubes are in the stack',
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng);
    const n = HARD.n;
    const count = rng.int(HARD.total.min, HARD.total.max);
    let heights = null;
    for (let attempt = 0; attempt < GEN_TRIES && !heights; attempt++) {
      const g = gridWithTotal(rng, count);
      if (nonzeroCols(g) < HARD.minNonzero) continue;
      if (hiddenCubes(g) < HARD.minHidden) continue;
      if (!allTopsVisible(g, n)) continue;
      if (!heightsReadable(g, n)) continue;
      if (!ambiguityOk(g, n)) continue;
      heights = g;
    }
    if (!heights) throw new Error(`block_count: no readable 4x4 grid with ${count} cubes`);
    return {
      task: 'block_count', board: BOARD, n,
      heights, count: totalCubes(heights),
      hidden: hiddenCubes(heights), nonzero: nonzeroCols(heights),
      min: HARD.answer.min, max: HARD.answer.max, tol: HARD.tol,
    };
  },

  init() { return { text: '', value: null, changes: 0 }; },

  applyAction(state, action) {
    if (action.op !== 'input' || typeof action.value !== 'string') return { ok: false, reason: 'bad-op' };
    state.text = action.value.slice(0, 12);
    const t = state.text.trim();
    state.value = /^\d{1,3}$/.test(t) ? Number(t) : null;
    state.changes++;
    return { ok: true };
  },

  verify(state, manifest) {
    const span = manifest.max - manifest.min;
    const err = state.value === null ? span : Math.abs(state.value - manifest.count);
    return {
      success: state.value !== null && err <= (manifest.tol || 0),
      partial: Math.max(0, 1 - err / span),
      error: err,
      detail: { pick: state.value, text: state.text, rangeSize: span + 1, changes: state.changes },
    };
  },

  oracle(manifest) { return [{ op: 'input', value: String(manifest.count) }]; },

  randomPolicy(m, rnd) { return [{ op: 'input', value: String(m.min + Math.floor(rnd() * (m.max - m.min + 1))) }]; },

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Type how many cubes are in the stack',
      'Count hidden cubes too. None are floating.');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    if (env.assets?.look) { drawStyled(g, br, m, env.assets.look); return; }
    const view = (x, y, z) => project(x, y, z, VIEW_ISO);
    const stack = m;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef2f5'; g.fillRect(0, 0, br.w, br.h);
    g.translate(0, 12);

    const ground = [view(0, 0, 0), view(m.n, 0, 0), view(m.n, m.n, 0), view(0, m.n, 0)];
    facePath(g, ground); g.fillStyle = '#c9d7de'; g.fill();
    g.strokeStyle = '#8fa5b1'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#aabdc7';
    for (let i = 1; i < m.n; i++) {
      const a = view(i, 0, 0), b = view(i, m.n, 0);
      const c = view(0, i, 0), d = view(m.n, i, 0);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      g.moveTo(c.x, c.y); g.lineTo(d.x, d.y); g.stroke();
    }

    const cubes = [];
    for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) {
      for (let z = 0; z < stack.heights[y][x]; z++) cubes.push({ x, y, z });
    }
    cubes.sort((a, b) => (b.x + b.y) - (a.x + a.y) || a.z - b.z || a.y - b.y);
    g.lineJoin = 'round'; g.lineWidth = 1;
    cubes.forEach(({ x, y, z }) => {
      const h = stack.heights[y][x];
      const westH = x > 0 ? stack.heights[y][x - 1] : 0;
      const northH = y > 0 ? stack.heights[y - 1][x] : 0;
      const p000 = view(x, y, z), p100 = view(x + 1, y, z), p010 = view(x, y + 1, z);
      const p001 = view(x, y, z + 1), p101 = view(x + 1, y, z + 1), p011 = view(x, y + 1, z + 1), p111 = view(x + 1, y + 1, z + 1);
      if (westH <= z) {
        facePath(g, [p000, p010, p011, p001]);
        g.fillStyle = '#2e6690'; g.fill(); g.strokeStyle = '#1c4763'; g.stroke();
      }
      if (northH <= z) {
        facePath(g, [p000, p100, p101, p001]);
        g.fillStyle = '#4a8cba'; g.fill(); g.strokeStyle = '#1c4763'; g.stroke();
      }
      if (z === h - 1) {
        facePath(g, [p001, p101, p111, p011]);
        g.fillStyle = '#8ecdf0'; g.fill(); g.strokeStyle = '#1c4763'; g.stroke();
      }
    });

    g.restore();
  },

  pointer() { return []; },
  footerStatus() { return ''; },
};

export function semanticKey(m) {
  return `block_count|${m.n}|${m.heights.map((r) => r.join('')).join('/')}`;
}
