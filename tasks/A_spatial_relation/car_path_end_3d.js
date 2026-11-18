import { drawPromptText, UI_FONT } from '../core/panel.js';
import { makeIso, isoSteps, boxHull, inConvex } from '../common/_route_maze_iso.js';
import * as RT from '../common/_heading_rt.js';
import { cityLook, buildingMatStyled, groundStyled } from '../common/_car_path_end_3d_city.js';
import * as LOOK from '../common/_heading_look.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 330 };
const HARD = Object.freeze({
  edges: [9, 12], maxTurns: 5, towers: [2, 3], towerH: [1.5, 2.1], tol: 12, balance: 0.3, minCorners: 3, maxMarks: 8, undoR: 6, pinClear: 17,
  minHidden: 22, minFrag: 26, minLastFrag: 42, endTowerGap: 36, endBldGap: 5, stubGap: 42,
  edgeMargin: 30, routeMargin: 14,
});
const EL = 50, DXP = 25;
const STEP = isoSteps(DXP, EL);
const K = 2 * STEP.DY / STEP.DZ;
const S = 0.38;
const G = 14;
const LAT = 0.09;
const SAMPLE = 0.03;
const END_CLEAR = 0.26;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isoOf = (m) => makeIso({ ox: m.cam.ox, oy: m.cam.oy, DX: STEP.DX, DY: STEP.DY, DZ: STEP.DZ });
function distToPoly(poly, x, y) {
  if (inConvex(poly, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ux = b.x - a.x, uy = b.y - a.y, L = ux * ux + uy * uy;
    const t = L ? Math.max(0, Math.min(1, ((x - a.x) * ux + (y - a.y) * uy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - a.x - t * ux, y - a.y - t * uy));
  }
  return best;
}
function hideHeight(f, px, py) {
  const lo = Math.max(f.x0 - px, f.y0 - py, 0), hi = Math.min(f.x1 - px, f.y1 - py);
  return lo > hi ? Infinity : K * lo;
}

export function routeSamples(m) {
  const out = [];
  const R = m.route;
  let acc = 0;
  for (let k = 1; k < R.length; k++) {
    const [ax, ay] = R[k - 1], [bx, by] = R[k];
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / SAMPLE));
    for (let q = k === 1 ? 0 : 1; q <= n; q++) {
      const t = q / n;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, s: acc + L * t, nx: -(by - ay) / L, ny: (bx - ax) / L });
    }
    acc += L;
  }
  return out;
}

export function cornerIdx(R) {
  const out = [];
  for (let k = 1; k < R.length - 1; k++) {
    const d1x = R[k][0] - R[k - 1][0], d1y = R[k][1] - R[k - 1][1], d2x = R[k + 1][0] - R[k][0], d2y = R[k + 1][1] - R[k][1];
    if (Math.abs(d1x * d2y - d1y * d2x) > 1e-9) out.push(k);
  }
  return out;
}
export function targetsOf(m) {
  const iso = isoOf(m), R = m.route;
  return [...cornerIdx(R).map((k) => iso.p(R[k][0], R[k][1], 0)), iso.p(R[R.length - 1][0], R[R.length - 1][1], 0)];
}

function randomRoute(rng) {
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let att = 0; att < 50; att++) {
    const L = rng.int(HARD.edges[0], HARD.edges[1]);
    const pts = [[rng.int(3, G - 3), rng.int(3, G - 3)]];
    const seen = new Set([pts[0][0] * 100 + pts[0][1]]);
    let dir = rng.int(0, 3), turns = 0, ok = true, lastTurn = rng.raw() < 0.5 ? 1 : 3;
    for (let k = 0; k < L; k++) {
      const [x, y] = pts[pts.length - 1];
      const opts = [];
      const same = (dir + lastTurn) % 4, other = (dir + 4 - lastTurn) % 4;
      for (const [d, w] of [[dir, 3], [same, 2.4 * 0.7], [other, 2.4 * 0.3]]) {
        if (d !== dir && (turns >= HARD.maxTurns || k === 0)) continue;
        const nx = x + D[d][0], ny = y + D[d][1];
        if (nx < 1 || nx > G - 1 || ny < 1 || ny > G - 1 || seen.has(nx * 100 + ny)) continue;
        opts.push([d, w]);
      }
      if (!opts.length) { ok = false; break; }
      let u = rng.raw() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0];
      for (const [d, w] of opts) { u -= w; if (u <= 0) { pick = d; break; } }
      if (pick !== dir) { turns++; lastTurn = (pick - dir + 4) % 4; }
      dir = pick;
      const nx = x + D[dir][0], ny = y + D[dir][1];
      seen.add(nx * 100 + ny); pts.push([nx, ny]);
    }
    if (ok) return pts;
  }
  return null;
}

const cities = new WeakMap();
export function cityOf(m) {
  let c = cities.get(m);
  if (c) return c;
  const iso = isoOf(m);
  const samples = routeSamples(m);
  const xs = m.route.map((p) => p[0]), ys = m.route.map((p) => p[1]);
  const rx0 = Math.min(...xs) - 2, rx1 = Math.max(...xs) + 2, ry0 = Math.min(...ys) - 2, ry1 = Math.max(...ys) + 2;
  const [ex, ey] = m.route[m.route.length - 1];
  const clear = [];
  for (let k = 0; k < 12; k++) clear.push([ex + END_CLEAR * Math.cos(k * Math.PI / 6), ey + END_CLEAR * Math.sin(k * Math.PI / 6)]);
  const rnd = mulberry(m.seed);
  const blds = [], open = [];
  for (let bj = -10; bj <= G + 10; bj++) for (let bi = -10; bi <= G + 10; bi++) {
    const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    const tw = m.towers.find((t) => t.bi === bi && t.bj === bj);
    const mg = tw ? [0.04, 0.04, 0.04, 0.04] : r.slice(0, 4).map((u) => 0.03 + u * 0.13);
    const f = { x0: bi + S / 2 + mg[0], x1: bi + 1 - S / 2 - mg[1], y0: bj + S / 2 + mg[2], y1: bj + 1 - S / 2 - mg[3] };
    let h;
    const near = bi + 1 >= rx0 && bi <= rx1 && bj + 1 >= ry0 && bj <= ry1;
    if (tw) h = tw.h;
    else {
      if (r[4] >= 0.11 && r[7] > 0.28) { open.push({ bi, bj, park: r[6] < 0.55 }); continue; }
      h = r[4] < 0.11 ? 1.2 + r[5] * 0.9 : 0.28 + r[5] * 0.8;
      if (near) {
        let safe = Infinity;
        for (const p of samples) for (const k of [-1, 0, 1]) safe = Math.min(safe, hideHeight(f, p.x + p.nx * LAT * k, p.y + p.ny * LAT * k));
        for (const q of clear) safe = Math.min(safe, hideHeight(f, q[0], q[1]));
        h = Math.min(h, safe - 0.05);
      }
      if (h < 0.1) continue;
    }
    const box = { x0: f.x0, x1: f.x1, y0: f.y0, y1: f.y1, z0: 0, z1: +h.toFixed(3), tower: !!tw, near, col: PALETTE[Math.floor(r[6] * PALETTE.length)], win: r[7] };
    const hull = boxHull(iso, box);
    const xsH = hull.map((q) => q.x), ysH = hull.map((q) => q.y);
    if (Math.max(...xsH) < -2 || Math.min(...xsH) > BOARD.w + 2 || Math.max(...ysH) < -2 || Math.min(...ysH) > BOARD.h + 2) continue;
    blds.push(box);
  }
  c = { iso, blds, samples, open };
  cities.set(m, c);
  return c;
}

const towerBox = (t) => ({ x0: t.bi + S / 2 + 0.04, x1: t.bi + 1 - S / 2 - 0.04, y0: t.bj + S / 2 + 0.04, y1: t.bj + 1 - S / 2 - 0.04, z0: 0, z1: t.h, tower: true });
const analyses = new WeakMap();
export function analyse(m) {
  let A = analyses.get(m);
  if (A) return A;
  const iso = isoOf(m), samples = routeSamples(m);
  const towers = m.towers.map(towerBox);
  const hid = samples.map((p) => towers.findIndex((t) => t.z1 > hideHeight(t, p.x, p.y)));
  const scr = samples.map((p) => iso.p(p.x, p.y, 0));
  const runs = [];
  for (let k = 0; k < samples.length; k++) {
    const key = hid[k];
    if (!runs.length || runs[runs.length - 1].key !== key) runs.push({ key, a: k, b: k });
    else runs[runs.length - 1].b = k;
  }
  const len = (a, b) => { let L = 0; for (let k = a + 1; k <= b; k++) L += Math.hypot(scr[k].x - scr[k - 1].x, scr[k].y - scr[k - 1].y); return L; };
  runs.forEach((r) => { r.len = len(r.a, r.b); });
  const C = scr[0], E = scr[scr.length - 1];
  const stubs = [];
  runs.forEach((r, i) => { if (r.key >= 0) { stubs.push(scr[runs[i - 1] ? runs[i - 1].b : r.a], scr[runs[i + 1] ? runs[i + 1].a : r.b]); } });
  A = { iso, towers, towerHulls: towers.map((t) => boxHull(iso, t)), samples, scr, hid, runs, C, E, stubs };
  analyses.set(m, A);
  return A;
}

export function readers(rd) {
  const A = analyse(rd), E = A.E, ends = [...A.stubs, E];
  const vis = A.scr.filter((_, k) => A.hid[k] < 0);
  const cen = { x: vis.reduce((a, q) => a + q.x, 0) / vis.length, y: vis.reduce((a, q) => a + q.y, 0) / vis.length };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const argEnd = (f) => ends.reduce((b, q) => (f(q) > f(b) ? q : b));
  const argPt = (f) => vis.reduce((b, q) => (f(q) > f(b) ? q : b));
  return {
    farthestEndFromCar: argEnd((q) => d(q, A.C)), nearestEndToCar: argEnd((q) => -d(q, A.C)),
    endNearestMiddle: argEnd((q) => -d(q, cen)), endFarthestFromMiddle: argEnd((q) => d(q, cen)),
    topEnd: argEnd((q) => -q.y), bottomEnd: argEnd((q) => q.y), leftEnd: argEnd((q) => -q.x), rightEnd: argEnd((q) => q.x),
    farthestPointFromCar: argPt((q) => d(q, A.C)), topPoint: argPt((q) => -q.y), bottomPoint: argPt((q) => q.y),
    leftPoint: argPt((q) => -q.x), rightPoint: argPt((q) => q.x), middleOfRoute: cen,
  };
}
const WEIGHT = { topEnd: 2, bottomEnd: 2 };
export function endWins(rd) {
  const E = analyse(rd).E;
  return Object.entries(readers(rd)).reduce((n, [k, q]) => n + (Math.hypot(q.x - E.x, q.y - E.y) <= HARD.tol ? (WEIGHT[k] || 1) : 0), 0);
}

function routeProblems(m) {
  const errs = [];
  const A = analyse(m);
  const { towers, towerHulls, scr, runs, C, E, stubs } = A;
  const hiddenRuns = runs.filter((r) => r.key >= 0);
  if (hiddenRuns.length !== towers.length) errs.push('hidden-count');
  if (new Set(hiddenRuns.map((r) => r.key)).size !== hiddenRuns.length) errs.push('tower-hides-twice');
  if (hiddenRuns.some((r) => r.len < HARD.minHidden)) errs.push('short-hidden');
  if (runs[0].key >= 0 || runs[runs.length - 1].key >= 0) errs.push('ends-hidden');
  const vis = runs.filter((r) => r.key < 0);
  if (vis.length !== towers.length + 1) errs.push('pieces');
  if (errs.length) return errs;
  if (vis.slice(0, -1).some((r) => r.len < HARD.minFrag) || vis[vis.length - 1].len < HARD.minLastFrag) errs.push('short-piece');
  if (towerHulls.some((h) => distToPoly(h, E.x, E.y) < HARD.endTowerGap)) errs.push('end-near-tower');
  if (E.x < HARD.edgeMargin || E.x > BOARD.w - HARD.edgeMargin || E.y < HARD.edgeMargin || E.y > BOARD.h - HARD.edgeMargin) errs.push('end-near-edge');
  if (stubs.some((q) => Math.hypot(q.x - E.x, q.y - E.y) < HARD.stubGap)) errs.push('end-near-cut');
  for (const q of scr) if (q.x < HARD.routeMargin || q.x > BOARD.w - HARD.routeMargin || q.y < HARD.routeMargin || q.y > BOARD.h - HARD.routeMargin) { errs.push('route-out'); break; }
  const pin = { x: C.x, y: C.y - 19 };
  if (pin.y < 14 || pin.x < 14 || pin.x > BOARD.w - 14) errs.push('pin-out');
  if (towerHulls.some((h) => distToPoly(h, pin.x, pin.y) < 14)) errs.push('pin-on-tower');
  let arc = 0;
  for (let k = 1; k < scr.length; k++) {
    arc += Math.hypot(scr[k].x - scr[k - 1].x, scr[k].y - scr[k - 1].y);
    if (arc > 30 && Math.hypot(scr[k].x - pin.x, scr[k].y - pin.y) < 16) { errs.push('pin-covers-route'); break; }
  }
  for (let a = 0; a < towerHulls.length; a++) for (let b = a + 1; b < towerHulls.length; b++) {
    const ha = towerHulls[a], hb = towerHulls[b];
    if (ha.some((q) => distToPoly(hb, q.x, q.y) < 12) || hb.some((q) => distToPoly(ha, q.x, q.y) < 12)) errs.push('towers-touch');
  }
  const R = m.route, ci = cornerIdx(R);
  if (ci.length < HARD.minCorners) errs.push('few-corners');
  const arcAt = [0]; for (let k = 1; k < R.length; k++) arcAt.push(arcAt[k - 1] + Math.hypot(R[k][0] - R[k - 1][0], R[k][1] - R[k - 1][1]));
  for (const r of runs) {
    if (r.key < 0) continue;
    const s0 = A.samples[r.a].s - 1e-6, s1 = A.samples[r.b].s + 1e-6;
    let n = 0; for (let k = 1; k < R.length - 1; k++) if (arcAt[k] >= s0 && arcAt[k] <= s1) n++;
    if (n > 1) { errs.push('hidden-vertices'); break; }
  }
  const T = targetsOf(m);
  if (T.some((q) => Math.hypot(q.x - pin.x, q.y - pin.y) < HARD.pinClear)) errs.push('target-under-pin');
  for (let k = 1; k < T.length; k++) if (Math.hypot(T[k].x - T[k - 1].x, T[k].y - T[k - 1].y) < 14) errs.push('targets-close');
  return errs;
}

function cityProblems(m) {
  const { iso, blds, samples } = cityOf(m);
  const E = analyse(m).E;
  if (blds.filter((b) => b.tower).length !== m.towers.length) return ['tower-missing'];
  for (const b of blds) {
    if (b.tower) continue;
    if (b.near || b.z1 >= 2 * K) {
      for (const p of samples) for (const k of [-1, 0, 1]) if (b.z1 > hideHeight(b, p.x + p.nx * LAT * k, p.y + p.ny * LAT * k)) return ['ordinary-building-hides'];
    }
    if (distToPoly(boxHull(iso, b), E.x, E.y) < HARD.endBldGap) return ['end-touches-building'];
  }
  return [];
}

const problems = (m) => { const e = routeProblems(m); return e.length ? e : cityProblems(m); };

function tryInstance(rng) {
  const pts = randomRoute(rng);
  if (!pts) return null;
  const inner = [];
  for (let k = 2; k <= pts.length - 4; k++) inner.push(k);
  const nT = pts.length - 1 >= 11 ? rng.int(HARD.towers[0], HARD.towers[1]) : HARD.towers[0];
  const pick = [];
  for (const k of rng.shuffle(inner)) {
    if (pick.length === nT) break;
    const [i, j] = pts[k];
    if (pick.some((q) => Math.abs(q - k) < 3 || Math.max(Math.abs(pts[q][0] - i), Math.abs(pts[q][1] - j)) < 2)) continue;
    pick.push(k);
  }
  if (pick.length !== nT) return null;
  const towers = pick.sort((a, b) => a - b).map((k) => ({ bi: pts[k][0], bj: pts[k][1], h: +rng.uniform(HARD.towerH[0], HARD.towerH[1]).toFixed(2) }));
  const route = pts.map((p) => p.slice());
  if (rng.raw() < 0.5) route[0] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  if (rng.raw() < 0.5) { const n = pts.length; route[n - 1] = [(pts[n - 2][0] + pts[n - 1][0]) / 2, (pts[n - 2][1] + pts[n - 1][1]) / 2]; }
  const px = route.map(([x, y]) => (x - y) * STEP.DX), py = route.map(([x, y]) => (x + y) * STEP.DY);
  const pe = [px[px.length - 1], py[py.length - 1]], M = HARD.routeMargin;
  let ox = null, oy = null;
  for (let k = 0; k < 24 && ox === null; k++) {
    const ex = rng.uniform(HARD.edgeMargin, BOARD.w - HARD.edgeMargin), ey = rng.uniform(HARD.edgeMargin, BOARD.h - HARD.edgeMargin);
    const cx = ex - pe[0], cy = ey - pe[1];
    if (px.every((x, i) => x + cx >= M && x + cx <= BOARD.w - M && py[i] + cy >= M + 16 && py[i] + cy <= BOARD.h - M)) { ox = +cx.toFixed(2); oy = +cy.toFixed(2); }
  }
  if (ox === null) return null;
  return { route, towers, seed: rng.int(1, 2147483646), cam: { ox, oy } };
}

function cityOk(rd) {
  if (!rd || !Array.isArray(rd.route) || rd.route.length < HARD.edges[0] || !Array.isArray(rd.towers)) return false;
  if (!rd.cam || !Number.isFinite(rd.cam.ox) || !Number.isFinite(rd.cam.oy) || !Number.isInteger(rd.seed)) return false;
  if (rd.towers.length < HARD.towers[0] || rd.towers.length > HARD.towers[1]) return false;
  if (!rd.towers.every((t) => Number.isInteger(t.bi) && Number.isInteger(t.bj) && t.h >= HARD.towerH[0] && t.h <= HARD.towerH[1])) return false;
  const R = rd.route;
  const seen = new Set();
  for (let k = 0; k < R.length; k++) {
    const [x, y] = R[k];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (k > 0 && k < R.length - 1 && (!Number.isInteger(x) || !Number.isInteger(y))) return false;
    if (k > 0) {
      const dx = x - R[k - 1][0], dy = y - R[k - 1][1];
      if (dx !== 0 && dy !== 0) return false;
      const L = Math.abs(dx) + Math.abs(dy);
      if (!(L === 1 || ((k === 1 || k === R.length - 1) && L === 0.5))) return false;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return !problems(rd).length;
}

export function semanticKey(m) {
  const R = m.route, o = R[0], shape = R.map(([x, y]) => `${+(x - o[0]).toFixed(1)},${+(y - o[1]).toFixed(1)}`).join(' ');
  const tw = m.towers.map((t) => R.findIndex(([x, y]) => x === t.bi && y === t.bj)).sort((a, b) => a - b).join(',');
  const E = isoOf(m).p(...R[R.length - 1], 0);
  return `car_path_end_3d|${shape}|towers:${tw}|end:${Math.floor(E.x / (BOARD.w / 8))},${Math.floor(E.y / (BOARD.h / 8))}`;
}

export function gate(m) {
  if (!m || m.task !== 'car_path_end_3d' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if ('rounds' in m || !cityOk(m)) return false;
  const t = TASK, s = t.init(m);
  for (const a of t.oracle(m)) t.applyAction(s, a, m);
  return t.verify(s, m).success === true;
}

const PALETTE = ['#e9e2d6', '#dcd6cc', '#e6dccb', '#d5dbe0', '#e3d9d2', '#d9e0d6'];
export function rtCamera(m) {
  const iso = isoOf(m), W = BOARD.w, H = BOARD.h;
  const u = (W / 2 - iso.ox) / STEP.DX, v = (H / 2 - iso.oy) / STEP.DY;
  const tx = (u + v) / 2, ty = (v - u) / 2, el = EL * Math.PI / 180, D = 2e5, sc = STEP.DX * Math.SQRT2;
  const eye = [tx + D * Math.cos(el) / Math.SQRT2, D * Math.sin(el), ty + D * Math.cos(el) / Math.SQRT2];
  return RT.makeCam({ eye, target: [tx, 0, ty], fovY: 2 * Math.atan(H / (2 * sc * D)) * 180 / Math.PI, W, H });
}
function routeDist(R, x, y) {
  let best = Infinity;
  for (let k = 1; k < R.length; k++) {
    const [ax, ay] = R[k - 1], [bx, by] = R[k];
    const qx = Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), x)), qy = Math.max(Math.min(ay, by), Math.min(Math.max(ay, by), y));
    best = Math.min(best, Math.hypot(x - qx, y - qy));
  }
  return best;
}
function groundFn(m, open) {
  const ASP = RT.lin('#a7abb1'), ASP2 = RT.lin('#9ea2a8'), PAVE = RT.lin('#d9d4cb'), CURB = RT.lin('#c3bdb3');
  const LAWN = RT.lin('#9dba82'), LAWN2 = RT.lin('#8cab72'), SQ = RT.lin('#d2c9b9'), ORG = RT.lin('#ff7417'), WHITE = RT.lin('#ffffff');
  const kinds = new Map(open.map((o) => [o.bi * 1000 + o.bj, o.park ? 1 : 2]));
  const R = m.route;
  return (X, Z, fp, out) => {
    const x = X, y = Z, bi = Math.floor(x), bj = Math.floor(y), fx = x - bi, fy = y - bj;
    const inBlock = fx > S / 2 && fx < 1 - S / 2 && fy > S / 2 && fy < 1 - S / 2;
    if (inBlock) {
      const e = Math.min(fx - S / 2, 1 - S / 2 - fx, fy - S / 2, 1 - S / 2 - fy);
      const kind = kinds.get(bi * 1000 + bj) || 0;
      if (kind === 1 && e > 0.05) RT.mixInto(out, LAWN2, LAWN, 0.4 + 0.6 * RT.fbm(x * 9, y * 9, 3, fp * 9));
      else if (kind === 2 && e > 0.05) { RT.mixInto(out, SQ, PAVE, 0.5 + 0.5 * RT.fbm(x * 6, y * 6, 2, fp * 6)); const g = Math.max(RT.lineMask(x, 0.1, 0.004, fp), RT.lineMask(y, 0.1, 0.004, fp)); RT.mixInto(out, out, CURB, 0.5 * g); }
      else RT.mixInto(out, CURB, PAVE, Math.min(1, e / 0.012));
    } else RT.mixInto(out, ASP2, ASP, 0.5 + 0.5 * RT.fbm(x * 7, y * 7, 3, fp * 7));
    const d = routeDist(R, x, y), aa = Math.max(fp, 0.004);
    const cas = Math.max(0, Math.min(1, (0.135 - d) / aa + 0.5)), core = Math.max(0, Math.min(1, (LAT - d) / aa + 0.5));
    if (cas > 0) RT.mixInto(out, out, WHITE, cas);
    if (core > 0) RT.mixInto(out, out, ORG, core);
  };
}
function buildingMat(hex) {
  const C = RT.lin(hex), G = RT.lin('#7f93a6'), F = RT.lin(hex).map((v) => v * 0.86);
  return { c: C, ks: 0.12, sh: 20, tex: (x, y, z, nx, ny, nz, sh, out) => {
    out[0] = C[0]; out[1] = C[1]; out[2] = C[2];
    if (ny > 0.5) { out[0] = F[0] * 1.08; out[1] = F[1] * 1.08; out[2] = F[2] * 1.08; return; }
    const h = sh.cy + sh.hy;
    if (y < 0.1 || y > h - 0.07) return;
    const u = Math.abs(nx) > 0.5 ? z : x;
    const fu = ((u % 0.16) + 0.16) % 0.16, fv = (((y - 0.1) % 0.18) + 0.18) % 0.18;
    if (fu > 0.05 && fu < 0.12 && fv > 0.06 && fv < 0.13) RT.mixInto(out, out, G, 0.5);
  } };
}
const renders = new WeakMap();
export function citySceneOf(m) {
  let sc = renders.get(m);
  if (sc) return sc;
  const { blds, open } = cityOf(m);
  const mats = PALETTE.map(buildingMat), shapes = [];
  blds.forEach((b, i) => {
    const mi = Math.max(0, PALETTE.indexOf(b.col));
    const s = RT.shape.box(i, mi, (b.x0 + b.x1) / 2, b.z1 / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, b.z1 / 2, (b.y1 - b.y0) / 2, 0, 0.012);
    shapes.push(s);
  });
  sc = RT.makeScene({ cam: rtCamera(m), shapes, mats,
    light: { ...RT.STUDIO_LIGHT, dir: [-0.55, 1.35, 0.25], col: [1.05, 1.0, 0.92], soft: 0.035, sky: [0.55, 0.56, 0.58], ground: [0.3, 0.29, 0.27], aoK: 0.6, contact: 0.25, contactH: 0.12,
      fill: { dir: [0.5, 0.4, 0.7], col: [0.12, 0.12, 0.13] } },
    env: { floorY: 0, floor: groundFn(m, open), sky: RT.softSky } });
  const grid = new Map();
  for (const g of sc.groups) { const k = Math.floor(g.bs[0]) * 4096 + Math.floor(g.bs[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(g); }
  const NONE = [];
  sc.maxY = Math.max(...blds.map((b) => b.z1)) + 0.02;
  sc.nearGroups = (x0, z0, x1, z1) => {
    const i0 = Math.floor(x0), i1 = Math.floor(x1), j0 = Math.floor(z0), j1 = Math.floor(z1);
    if (i0 === i1 && j0 === j1) return grid.get(i0 * 4096 + j0) || NONE;
    const out = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = grid.get(i * 4096 + j); if (l) out.push(...l); }
    return out;
  };
  sc.exposure = 0.86;
  renders.set(m, sc);
  return sc;
}

const CITY_LIGHT = { ...RT.STUDIO_LIGHT, dir: [-0.55, 1.35, 0.25], col: [1.05, 1.0, 0.92], soft: 0.035, sky: [0.55, 0.56, 0.58], ground: [0.3, 0.29, 0.27], aoK: 0.6, contact: 0.25, contactH: 0.12,
  fill: { dir: [0.5, 0.4, 0.7], col: [0.12, 0.12, 0.13] } };
function citySceneStyled(m, look) {
  const { blds, open } = cityOf(m);
  const mats = PALETTE.map((hex, i) => buildingMatStyled(look.walls[i % look.walls.length], look, RT.mixInto)), shapes = [];
  blds.forEach((b, i) => {
    const mi = Math.max(0, PALETTE.indexOf(b.col));
    shapes.push(RT.shape.box(i, mi, (b.x0 + b.x1) / 2, b.z1 / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, b.z1 / 2, (b.y1 - b.y0) / 2, 0, 0.012));
  });
  const kinds = new Map(open.map((o) => [o.bi * 1000 + o.bj, o.park ? 1 : 2]));
  const R = m.route;
  const routeAt = (x, y, fp) => {
    const d = routeDist(R, x, y), aa = Math.max(fp, 0.004);
    return { cas: Math.max(0, Math.min(1, (0.135 - d) / aa + 0.5)), core: Math.max(0, Math.min(1, (LAT - d) / aa + 0.5)) };
  };
  const albedo = look.street.c;
  let light = LOOK.styledLight(look.hd, CITY_LIGHT, { albedo, jitter: look.lightJ });
  light = { ...light, aoK: CITY_LIGHT.aoK, contact: CITY_LIGHT.contact, contactH: CITY_LIGHT.contactH, soft: Math.min(light.soft, 0.05) };
  const sc = RT.makeScene({ cam: rtCamera(m), shapes, mats, light,
    env: { floorY: 0, floor: groundStyled(look, (bi, bj) => kinds.get(bi * 1000 + bj) || 0, S, routeAt, RT.mixInto), sky: RT.softSky } });
  const grid = new Map();
  for (const g of sc.groups) { const k = Math.floor(g.bs[0]) * 4096 + Math.floor(g.bs[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(g); }
  const NONE = [];
  sc.maxY = Math.max(...blds.map((b) => b.z1)) + 0.02;
  sc.nearGroups = (x0, z0, x1, z1) => {
    const i0 = Math.floor(x0), i1 = Math.floor(x1), j0 = Math.floor(z0), j1 = Math.floor(z1);
    if (i0 === i1 && j0 === j1) return grid.get(i0 * 4096 + j0) || NONE;
    const out = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = grid.get(i * 4096 + j); if (l) out.push(...l); }
    return out;
  };
  sc.exposure = 0.86;
  return sc;
}

function drawPin(g, C) {
  const x = C.x, y = C.y - 19;
  g.save();
  g.fillStyle = 'rgba(20,30,50,.25)';
  g.beginPath(); g.ellipse(C.x, C.y, 5, 2.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(C.x, C.y);
  g.lineTo(x - 6.5, y + 7.5); g.arc(x, y, 10.5, Math.PI * 0.77, Math.PI * 0.23); g.closePath();
  g.fillStyle = '#1f5fbf'; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x - 6.5, y + 2.5); g.lineTo(x - 6.5, y - 0.5); g.lineTo(x - 4.2, y - 1.4); g.lineTo(x - 2.6, y - 4.6);
  g.lineTo(x + 2.6, y - 4.6); g.lineTo(x + 4.2, y - 1.4); g.lineTo(x + 6.5, y - 0.5); g.lineTo(x + 6.5, y + 2.5); g.closePath(); g.fill();
  g.fillStyle = '#1f5fbf';
  g.beginPath(); g.arc(x - 3.6, y + 2.8, 1.7, 0, Math.PI * 2); g.arc(x + 3.6, y + 2.8, 1.7, 0, Math.PI * 2); g.fill();
  g.fillRect(x - 1.9, y - 3.6, 3.8, 2.1);
  g.restore();
}

const endOf = (rd) => isoOf(rd).p(...rd.route[rd.route.length - 1], 0);

function genCity(rng) {
  for (let att = 0; att < 4000; att++) {
    const rd = tryInstance(rng);
    if (!rd || routeProblems(rd).length) continue;
    if (rng.raw() >= HARD.balance ** endWins(rd)) continue;
    if (!cityProblems(rd).length) return rd;
  }
  return null;
}

const TASK = {
  meta: {
    name: 'car_path_end_3d', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: '0..380 board px', y: '0..330 board px', note: "add a numbered mark: every corner of the route in order from the car, then the end; a click on a mark removes it and the later ones; Verify submits" }],
    promptHuman: "Click every corner of the car's route in order, starting from the first corner after the car, then click where the route ends",
  },

  generate(rng) {
    const rd = genCity(rng) || JSON.parse(JSON.stringify(FALLBACK));
    return { task: 'car_path_end_3d', board: { ...BOARD }, ...rd };
  },

  init() { return { clicks: [] }; },

  applyAction(state, a) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const at = state.clicks.findIndex((c) => Math.hypot(c.x - a.x, c.y - a.y) <= HARD.undoR);
    if (at >= 0) { state.clicks.length = at; return { ok: true, cleared: true }; }
    if (state.clicks.length >= HARD.maxMarks) return { ok: false, reason: 'full' };
    state.clicks.push({ x: a.x, y: a.y });
    return { ok: true };
  },

  verify(state, m) {
    const T = targetsOf(m), C = state.clicks;
    let prefix = 0;
    while (prefix < C.length && prefix < T.length && Math.hypot(C[prefix].x - T[prefix].x, C[prefix].y - T[prefix].y) <= HARD.tol) prefix++;
    const success = C.length === T.length && prefix === T.length;
    return { success, partial: prefix / T.length, error: success ? 0 : 1, detail: { clicked: C.length, targets: T.length } };
  },

  oracle(m) { return targetsOf(m).map((q) => ({ op: 'click', x: +q.x.toFixed(1), y: +q.y.toFixed(1) })); },

  randomPolicy(m, rnd) { return targetsOf(m).map(() => ({ op: 'click', x: rnd() * BOARD.w, y: rnd() * BOARD.h })); },

  async mount(env) {
    if (env && env.style) env.assets.look = await cityLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, "Click every corner of the car's route in order, then its end", 'Start at the first corner after the car; a corner behind a tower counts');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const rd = m;
    const q = Math.min(2, RT.contextScale(g));
    const C = (this._rt ??= {});
    const look = env.style ? env.assets?.look : null, sk = look ? env.style.key : '';
    if (C.m !== rd || C.q !== q || C.sk !== sk) {
      C.m = rd; C.q = q; C.sk = sk; C.img = RT.render(look ? citySceneStyled(rd, look) : citySceneOf(rd), q);
      const cv = RT.toCanvas(C.img), cg = cv.getContext('2d');
      cg.scale(q, q); drawPin(cg, isoOf(rd).p(...rd.route[0], 0));
      C.cv = cv;
    }
    const cache = { cv: C.cv };
    g.save();
    g.translate(br.x, br.y);
    g.drawImage(cache.cv, 0, 0, BOARD.w, BOARD.h);
    state.clicks.forEach((c, k) => {
      g.beginPath(); g.arc(c.x, c.y, 7.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(25,145,250,.35)'; g.fill(); g.strokeStyle = '#1991fa'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#0b4f94'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), c.x, c.y + 0.5);
    });
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    const n = env.state.clicks.length;
    return n ? `${n} marked \u00b7 click a mark to undo` : 'Click the first corner of the route';
  },
};

const FALLBACK = { route: [[8, 9], [9, 9], [9, 10], [9, 11], [9, 12], [9, 13], [8, 13], [8, 12], [8, 11], [8, 10], [7, 10], [6.5, 10]], towers: [{ bi: 9, bj: 11, h: 1.87 }, { bi: 8, bj: 13, h: 1.78 }], seed: 1097373657, cam: { ox: 318.35, oy: -284.03 } };

export default TASK;
export const __test = { HARD, BOARD, K, cityOf, analyse, problems, routeProblems, cityProblems, readers, endWins, routeSamples, isoOf, tryInstance, distToPoly, endOf };
