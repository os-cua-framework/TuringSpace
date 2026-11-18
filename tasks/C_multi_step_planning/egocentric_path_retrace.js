import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { hash32, nthOf, splitIds } from '../core/style.js';
import { mountEgoLook, drawEgoStyled } from '../common/_egocentric_path_retrace_look.js';
import { computeFit, makeView, headVec as hv, drawFloor, drawWalker as drawFloorWalker, drawMark } from '../common/_egocentric_path_retrace_floor.js';

const BOARD = { w: 340, h: 340 };
const CARDS = 3;
const STRIP = { x: 8, y: 8, w: 324, h: 86 };
const CARD_W = 96;
const CARD_GAP = (STRIP.w - CARDS * CARD_W) / (CARDS - 1);
const MAP = { x: 8, y: 104, w: 324, h: 228 };
const GRID_STEP = 28;
const PAD = 14;
const HARD = { segments: 3, maxSpanX: 9, maxSpanY: 6, maxStraights: 1 };
const TURNS = [-90, 0, 90];
const rad = (d) => (d * Math.PI) / 180;
const normDeg = (d) => ((d % 360) + 540) % 360 - 180;

const cardRect = (i) => ({ x: STRIP.x + i * (CARD_W + CARD_GAP), y: STRIP.y, w: CARD_W, h: STRIP.h });
function latticeBounds(origin, step = GRID_STEP, map = MAP) {
  return {
    c0: Math.ceil((map.x + PAD - origin.x) / step), c1: Math.floor((map.x + map.w - PAD - origin.x) / step),
    r0: Math.ceil((map.y + PAD - origin.y) / step), r1: Math.floor((map.y + map.h - PAD - origin.y) / step),
  };
}
function walk(turns, dists, absolute = false, h0 = 0) {
  const pts = [{ x: 0, y: 0 }];
  let heading = absolute ? 0 : h0, cur = { x: 0, y: 0 };
  for (let i = 0; i < turns.length; i++) {
    heading = absolute ? turns[i] : heading + turns[i];
    const a = rad(heading), sx = Math.round(Math.sin(a)), sy = Math.round(Math.cos(a));
    cur = { x: cur.x + dists[i] * sx, y: cur.y - dists[i] * sy };
    pts.push({ ...cur });
  }
  return pts;
}
function misreadEnds(frames) {
  const t = frames.map((f) => f.turn), d = frames.map((f) => f.dist);
  return [
    walk(t, d, true).at(-1),
    walk(t.map((x) => -x), d).at(-1),
    walk(t.map(() => 0), d).at(-1),
  ];
}

function routeOk(frames) {
  const pts = walk(frames.map((f) => f.turn), frames.map((f) => f.dist));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  if (Math.max(...xs) - Math.min(...xs) > HARD.maxSpanX || Math.max(...ys) - Math.min(...ys) > HARD.maxSpanY) return false;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i].x === pts[j].x && pts[i].y === pts[j].y) return false;
  const end = pts.at(-1);
  const legs = pts.slice(1).map((p, i) => ({ s: Math.sign(p.x - pts[i].x), t: Math.sign(p.y - pts[i].y) }));
  if (!((legs.some((l) => l.s > 0) && legs.some((l) => l.s < 0)) || (legs.some((l) => l.t > 0) && legs.some((l) => l.t < 0)))) return false;
  return misreadEnds(frames).every((q) => q.x !== end.x || q.y !== end.y);
}

function snapCell(origin, x, y, step = GRID_STEP, map = MAP) {
  const b = latticeBounds(origin, step, map);
  return {
    c: Math.min(b.c1, Math.max(b.c0, Math.round((x - origin.x) / step))),
    r: Math.min(b.r1, Math.max(b.r0, Math.round((y - origin.y) / step))),
  };
}
const cellXY = (origin, cell, step = GRID_STEP) => ({ x: origin.x + cell.c * step, y: origin.y + cell.r * step });

const EXT = Object.freeze({ steps: [GRID_STEP], maxDist: 4, headings: [0] });
const LAYOUTS = {
  top: { strip: { x: 8, y: 8, w: 324, h: 86 }, map: { x: 8, y: 104, w: 324, h: 228 }, dir: 'row' },
  bottom: { strip: { x: 8, y: 246, w: 324, h: 86 }, map: { x: 8, y: 8, w: 324, h: 228 }, dir: 'row' },
  left: { strip: { x: 8, y: 8, w: 98, h: 324 }, map: { x: 114, y: 8, w: 218, h: 324 }, dir: 'col' },
  right: { strip: { x: 234, y: 8, w: 98, h: 324 }, map: { x: 8, y: 8, w: 218, h: 324 }, dir: 'col' },
};
function cardRectsExt(rng, layout, n) {
  const L = LAYOUTS[layout], S = L.strip;
  const r2 = (v) => Math.round(v * 100) / 100;
  if (L.dir === 'row') {
    const W = n === 3 ? rng.int(84, 100) : rng.int(70, 78), H = rng.int(80, 86);
    const gap = rng.pick([4, 8, (S.w - n * W) / (n - 1)]), tot = n * W + (n - 1) * gap;
    const x0 = S.x + rng.pick([0, (S.w - tot) / 2, S.w - tot]), y0 = S.y + (layout === 'top' ? 0 : S.h - H);
    return Array.from({ length: n }, (_, i) => ({ x: r2(x0 + i * (W + gap)), y: y0, w: W, h: H }));
  }
  const H = n === 3 ? rng.int(88, 104) : rng.int(74, 78), W = rng.int(86, 98);
  const gap = rng.pick([4, 8, (S.h - n * H) / (n - 1)]), tot = n * H + (n - 1) * gap;
  const y0 = S.y + rng.pick([0, (S.h - tot) / 2, S.h - tot]), x0 = S.x + (layout === 'left' ? 0 : S.w - W);
  return Array.from({ length: n }, (_, i) => ({ x: x0, y: r2(y0 + i * (H + gap)), w: W, h: H }));
}
function mapRectExt(rng, layout) {
  const M = LAYOUTS[layout].map, col = LAYOUTS[layout].dir === 'col';
  const l = rng.int(0, col ? 8 : 22), rr = rng.int(0, col ? 8 : 22), t = rng.int(0, 18), b = rng.int(0, 18);
  return { x: M.x + l, y: M.y + t, w: M.w - l - rr, h: M.h - t - b };
}
const inside = (a, B) => a.x >= B.x - 1e-6 && a.y >= B.y - 1e-6 && a.x + a.w <= B.x + B.w + 1e-6 && a.y + a.h <= B.y + B.h + 1e-6;
function layoutOk(m) {
  const L = LAYOUTS[m.layout];
  if (!L || !m.mapRect || !inside(m.mapRect, L.map) || m.mapRect.w < L.map.w - 44 || m.mapRect.h < L.map.h - 36) return false;
  const c = m.cardRects;
  if (!Array.isArray(c) || c.length !== m.frames.length || !c.every((r) => inside(r, L.strip) && r.w >= 70 && r.h >= 74)) return false;
  for (let i = 1; i < c.length; i++) if (L.dir === 'row' ? c[i].x < c[i - 1].x + c[i - 1].w + 3 : c[i].y < c[i - 1].y + c[i - 1].h + 3) return false;
  return true;
}
const areaOf = (map) => ({ x0: map.x + 28, y0: map.y + 30, x1: map.x + map.w - 28, y1: map.y + map.h - 22 });
const mapOf = (m) => (m && m.ext ? m.mapRect : MAP);
const EVAL_ROUTES = new Set(['90,4|-90,1|-90,3', '-90,4|90,4|90,1', '90,4|-90,3|-90,2', '90,3|90,4|90,4', '90,4|-90,3|-90,3', '0,4|90,3|90,4',
  '-90,2|90,3|90,3', '0,4|90,2|90,4', '-90,4|90,2|90,3', '0,4|90,3|90,1', '0,2|-90,3|-90,4', '-90,1|90,3|90,3'].map((k) => canonRoute(k.split('|').map((x) => { const [t, d] = x.split(',').map(Number); return { turn: t, dist: d }; }))));
function canonRoute(frames) {
  const a = frames.map((f) => `${f.turn},${f.dist}`).join('|');
  const b = frames.map((f) => `${f.turn === 180 ? 180 : -f.turn || 0},${f.dist}`).join('|');
  return a < b ? a : b;
}
let SPLIT_FN = null;
const keySplit = (k) => { if (EVAL_ROUTES.has(k)) return 'eval'; ensureRoutes(); return SPLIT_FN(k); };
export const routeSplit = (frames) => keySplit(canonRoute(frames));
export function semanticKey(m) { return `ego|${canonRoute(m.frames)}|h${m.heading0 || 0}`; }
let ROUTES = null;
const ROUTES_SPLIT = {};
function routesFor(split) { ensureRoutes(); return (ROUTES_SPLIT[split] ||= ROUTES.filter(([k]) => keySplit(k) === split)); }
function ensureRoutes() {
  if (!ROUTES) {
    const g = new Map();
    for (const t1 of TURNS) for (const t2 of TURNS) for (const t3 of TURNS) for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 4; c++) {
      const frames = [{ turn: t1, dist: a }, { turn: t2, dist: b }, { turn: t3, dist: c }];
      if (frames.filter((f) => f.turn === 0).length > HARD.maxStraights || !routeOk(frames)) continue;
      const k = canonRoute(frames);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(frames);
    }
    ROUTES = [...g.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    SPLIT_FN = splitIds('g14_ego_route', ROUTES.map(([k]) => k).filter((k) => !EVAL_ROUTES.has(k)), 20);
  }
}
const stepOf = (m) => (m && m.ext ? m.gridStep : GRID_STEP);
const spanOf = (step, map) => { const A = areaOf(map); return { x: Math.floor((A.x1 - A.x0) / step), y: Math.floor((A.y1 - A.y0) / step) }; };
const headVec = (h) => ({ x: Math.round(Math.sin(rad(h))), y: -Math.round(Math.cos(rad(h))) });
function routeOkExt(frames, h0, step, map) {
  const span = spanOf(step, map);
  const t = frames.map((f) => f.turn), d = frames.map((f) => f.dist);
  const pts = walk(t, d, false, h0);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  if (Math.max(...xs) - Math.min(...xs) > span.x || Math.max(...ys) - Math.min(...ys) > span.y) return false;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i].x === pts[j].x && pts[i].y === pts[j].y) return false;
  const end = pts.at(-1);
  const legs = pts.slice(1).map((p, i) => ({ s: Math.sign(p.x - pts[i].x), t: Math.sign(p.y - pts[i].y) }));
  if (!((legs.some((l) => l.s > 0) && legs.some((l) => l.s < 0)) || (legs.some((l) => l.t > 0) && legs.some((l) => l.t < 0)))) return false;
  const mis = [walk(t, d, true).at(-1), walk(t.map((x) => (x === 180 ? 180 : -x)), d, false, h0).at(-1), walk(t.map(() => 0), d, false, h0).at(-1)];
  if (h0 !== 0) mis.push(walk(t, d, false, 0).at(-1));
  return mis.every((q) => q.x !== end.x || q.y !== end.y);
}
function framesOkExt(frames) {
  if (!Array.isArray(frames) || frames.length !== HARD.segments) return false;
  if (!frames.every((f) => TURNS.includes(f.turn) && Number.isInteger(f.dist) && f.dist >= 1 && f.dist <= EXT.maxDist)) return false;
  return frames.filter((f) => f.turn === 0).length <= HARD.maxStraights;
}
function generateExt(rng, split, nIdx) {
  const routes = routesFor(split);
  const [, members] = routes[Number.isFinite(nIdx) ? nthOf(`egocentric_path_retrace|${split}|routes`, nIdx, routes.length) : rng.int(0, routes.length - 1)];
  const frames = rng.pick(members).map((f) => ({ ...f }));
  const turns = frames.map((f) => f.turn), n = HARD.segments, step = GRID_STEP, h0 = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const layout = attempt < 199 ? rng.pick(Object.keys(LAYOUTS)) : 'top';
    const map = attempt < 199 ? mapRectExt(rng, layout) : { ...LAYOUTS.top.map }, AREA = areaOf(map);
    const cardRects = cardRectsExt(rng, layout, n);
    if (!routeOkExt(frames, h0, step, map)) continue;
    const pts = walk(turns, frames.map((f) => f.dist), false, h0);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const oxLo = AREA.x0 - Math.min(...xs) * step, oxHi = AREA.x1 - Math.max(...xs) * step;
    const oyLo = AREA.y0 - Math.min(...ys) * step, oyHi = AREA.y1 - Math.max(...ys) * step;
    const origin = {
      x: +rng.uniform(Math.min(oxLo, oxHi), Math.max(oxLo, oxHi)).toFixed(2),
      y: +rng.uniform(Math.min(oyLo, oyHi), Math.max(oyLo, oyHi)).toFixed(2),
    };
    const m = {
      task: 'egocentric_path_retrace', board: BOARD, frames, origin, heading0: h0,
      cells: pts.slice(1).map((p) => ({ c: p.x, r: p.y })), gridStep: step, mapRect: map, layout, cardRects, steps: n, ext: split,
    };
    if (gateExt(m)) return m;
  }
  throw new Error('egocentric_path_retrace: ext generator exhausted');
}
function gateExt(m) {
  if (!['train', 'test'].includes(m.ext) || !EXT.steps.includes(m.gridStep) || !EXT.headings.includes(m.heading0)) return false;
  if (!layoutOk(m)) return false;
  if (!framesOkExt(m.frames) || m.steps !== m.frames.length || routeSplit(m.frames) !== m.ext) return false;
  const MAP = m.mapRect;
  if (!routeOkExt(m.frames, m.heading0, m.gridStep, MAP)) return false;
  const pts = walk(m.frames.map((f) => f.turn), m.frames.map((f) => f.dist), false, m.heading0);
  if (!Array.isArray(m.cells) || m.cells.length !== m.frames.length) return false;
  if (!pts.slice(1).every((p, i) => p.x === m.cells[i].c && p.y === m.cells[i].r)) return false;
  const b = latticeBounds(m.origin, m.gridStep, MAP);
  for (const p of pts) if (p.x < b.c0 || p.x > b.c1 || p.y < b.r0 || p.y > b.r1) return false;
  const o = m.origin, v = headVec(m.heading0), tip = { x: o.x + v.x * 20, y: o.y + v.y * 20 };
  if (tip.x < MAP.x + 4 || tip.x > MAP.x + MAP.w - 4 || tip.y < MAP.y + 4 || tip.y > MAP.y + MAP.h - 4) return false;
  const end = m.cells.at(-1), e = cellXY(o, end, m.gridStep), sn = snapCell(o, e.x, e.y, m.gridStep, MAP);
  return sn.c === end.c && sn.r === end.r;
}

const HX = Object.freeze({ N: 10, moves: 4, maxDist: 4, maxStraights: 1, minTile: 19, azOff: [20, 70], el: [42, 52], dist: [1.7, 2.1] });
const BOARD_X = { w: 660, h: 420 };
const STRIP_X = { x: 6, y: 6, w: 124, h: BOARD_X.h - 12 };
const FLOOR_X = { x: 138, y: 6, w: BOARD_X.w - 144, h: BOARD_X.h - 12 };
const cardRectX = (i) => { const h = (STRIP_X.h - (HX.moves - 1) * 6) / HX.moves; return { x: STRIP_X.x, y: STRIP_X.y + i * (h + 6), w: STRIP_X.w, h }; };
const VIEWS = new WeakMap();
const viewOf = (m) => { let v = VIEWS.get(m); if (!v) { v = makeView(m); VIEWS.set(m, v); } return v; };
function pathFrom(start, h0, turns, dists, abs = null) {
  const pts = [{ c: start.c, r: start.r }];
  let h = h0, cur = { c: start.c, r: start.r };
  for (let i = 0; i < dists.length; i++) {
    h = abs ? abs[i] : h + turns[i];
    const v = hv(h);
    cur = { c: cur.c + v.x * dists[i], r: cur.r + v.y * dists[i] };
    pts.push(cur);
  }
  return pts;
}
function screenHeading(V, t, s) {
  const o = V.tileCenter(t);
  let best = 0, bc = -2;
  for (const h of [0, 90, 180, 270]) {
    const v = hv(h), q = V.P(t.c + 0.5 + v.x, t.r + 0.5 + v.y);
    const dx = q.x - o.x, dy = q.y - o.y, c = (dx * s.x + dy * s.y) / Math.hypot(dx, dy);
    if (c > bc) { bc = c; best = h; }
  }
  return best;
}
export function misreadEndsX(m, V = viewOf(m)) {
  const t = m.frames.map((f) => f.turn), d = m.frames.map((f) => f.dist), S = m.start, h0 = m.heading0;
  const up = screenHeading(V, S, { x: 0, y: -1 }), lf = screenHeading(V, S, { x: -1, y: 0 }), rt = screenHeading(V, S, { x: 1, y: 0 });
  const out = {
    turnsIgnored: pathFrom(S, h0, t.map(() => 0), d).at(-1),
    leftRightSwapped: pathFrom(S, h0, t.map((x) => -x), d).at(-1),
    facingReversed: pathFrom(S, h0 + 180, t, d).at(-1),
    arrowsAsScreenDirs: pathFrom(S, 0, t, d, t.map((x) => (x === 0 ? up : x < 0 ? lf : rt))).at(-1),
  };
  if (up !== ((h0 % 360) + 360) % 360) out.facingScreenUp = pathFrom(S, up, t, d).at(-1);
  return out;
}
export function viewerHeadings(V, t) {
  const o = V.tileCenter(t);
  return [0, 90, 180, 270].filter((h) => { const v = hv(h); return V.P(t.c + 0.5 + 0.5 * v.x, t.r + 0.5 + 0.5 * v.y).y - o.y > 0; });
}
const onFloor = (q, N) => q.c >= 0 && q.r >= 0 && q.c < N && q.r < N;
export function altRoutesX(m) {
  const t = m.frames.map((f) => f.turn), d = m.frames.map((f) => f.dist), out = [];
  for (const h of [0, 90, 180, 270]) for (const lr of [1, -1]) {
    const pts = pathFrom(m.start, h, t.map((x) => x * lr), d);
    out.push({ h, lr, on: pts.every((p) => onFloor(p, m.N)), end: pts.at(-1) });
  }
  return out;
}
const distinctEnds = (rs) => new Set(rs.map((r) => `${r.end.c},${r.end.r}`)).size === rs.length;
function altOk(m, viewerHs) {
  const alts = altRoutesX(m);
  const hs = [0, 90, 180, 270].filter((h) => alts.filter((r) => r.h === h).every((r) => r.on));
  if (hs.length < 3 || !hs.includes(m.heading0) || !distinctEnds(alts.filter((r) => hs.includes(r.h)))) return false;
  const tv = alts.filter((r) => viewerHs.includes(r.h));
  return tv.every((r) => r.on) && distinctEnds(tv);
}
function routeOkX(m, V) {
  const N = m.N, t = m.frames.map((f) => f.turn), d = m.frames.map((f) => f.dist);
  const pts = pathFrom(m.start, m.heading0, t, d);
  if (!pts.every((p) => p.c >= 0 && p.r >= 0 && p.c < N && p.r < N)) return false;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i].c === pts[j].c && pts[i].r === pts[j].r) return false;
  const legs = pts.slice(1).map((p, i) => ({ s: Math.sign(p.c - pts[i].c), t: Math.sign(p.r - pts[i].r) }));
  if (!((legs.some((l) => l.s > 0) && legs.some((l) => l.s < 0)) || (legs.some((l) => l.t > 0) && legs.some((l) => l.t < 0)))) return false;
  const vh = viewerHeadings(V, m.start);
  if (vh.length !== 2 || !vh.includes(m.heading0)) return false;
  if (!altOk(m, vh)) return false;
  const end = pts.at(-1), mis = misreadEndsX(m, V);
  if (!Object.entries(mis).every(([k, q]) => k === 'turnsIgnored' || onFloor(q, N))) return false;
  return Object.values(mis).every((q) => q.c !== end.c || q.r !== end.r);
}
function gateHard(m) {
  if (!m || m.task !== 'egocentric_path_retrace' || m.design !== 'floor3d' || m.N !== HX.N || m.steps !== HX.moves) return false;
  if (!Array.isArray(m.frames) || m.frames.length !== HX.moves) return false;
  if (!m.frames.every((f) => TURNS.includes(f.turn) && Number.isInteger(f.dist) && f.dist >= 1 && f.dist <= HX.maxDist)) return false;
  if (m.frames.filter((f) => f.turn === 0).length > HX.maxStraights) return false;
  if (![0, 90, 180, 270].includes(m.heading0)) return false;
  const c = m.cam, off = ((c.az % 90) + 90) % 90;
  if (!(off >= HX.azOff[0] && off <= HX.azOff[1] && c.el >= HX.el[0] && c.el <= HX.el[1] && c.dist >= HX.N * HX.dist[0] && c.dist <= HX.N * HX.dist[1])) return false;
  const fit = computeFit(m.N, m.cam, FLOOR_X);
  if (['k', 'ox', 'oy'].some((k) => Math.abs(fit[k] - m.fit[k]) > 1e-3)) return false;
  const V = viewOf(m);
  if (!routeOkX(m, V)) return false;
  const pts = pathFrom(m.start, m.heading0, m.frames.map((f) => f.turn), m.frames.map((f) => f.dist));
  if (!Array.isArray(m.cells) || m.cells.length !== HX.moves || !pts.slice(1).every((p, i) => p.c === m.cells[i].c && p.r === m.cells[i].r)) return false;
  for (let i = 0; i < m.N; i++) for (let j = 0; j < m.N; j++) if (V.tileMinEdge({ c: i, r: j }) < HX.minTile) return false;
  const end = m.cells.at(-1), e = V.tileCenter(end), back = V.tileAt(e.x, e.y);
  return !!back && back.c === end.c && back.r === end.r;
}
function generateHard(rng) {
  const N = HX.N, r2 = (v) => Math.round(v * 100) / 100;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const turns = Array.from({ length: HX.moves }, () => rng.pick(TURNS));
    if (turns.filter((t) => t === 0).length > HX.maxStraights) continue;
    const dists = Array.from({ length: HX.moves }, () => rng.int(1, HX.maxDist));
    const cam = { az: r2(rng.int(0, 3) * 90 + rng.uniform(HX.azOff[0], HX.azOff[1])), el: r2(rng.uniform(HX.el[0], HX.el[1])), dist: r2(N * rng.uniform(HX.dist[0], HX.dist[1])) };
    const frames = turns.map((turn, i) => ({ turn, dist: dists[i] }));
    const base = {
      task: 'egocentric_path_retrace', design: 'floor3d', board: BOARD_X, N, cam, fit: computeFit(N, cam, FLOOR_X),
      frames, steps: HX.moves, panel: { panelWidth: BOARD_X.w + 20, boardH: BOARD_X.h + 10 },
    };
    const V = makeView({ ...base, start: { c: 4, r: 4 } });
    const vh = viewerHeadings(V, { c: 4, r: 4 });
    if (vh.length !== 2) continue;
    const heading0 = rng.pick(vh);
    const ok = [];
    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) {
      const start = { c, r }, pts = pathFrom(start, heading0, turns, dists);
      if (!pts.every((p) => onFloor(p, N))) continue;
      const m = { ...base, start, heading0, cells: pts.slice(1) };
      if (routeOkX(m, V)) ok.push(m);
    }
    if (!ok.length) continue;
    const { panel, steps, ...head } = ok[rng.int(0, ok.length - 1)];
    const m = { ...head, steps, panel };
    if (gateHard(m)) return m;
  }

  throw new Error('egocentric_path_retrace: generator exhausted');
}

export function gate(m) {
  if (m && m.task === 'egocentric_path_retrace' && m.ext !== undefined) return gateExt(m);
  if (m && m.design === 'floor3d') return gateHard(m);
  return false;
}

const isHard = (m) => !!(m && m.design === 'floor3d');
const ORACLE = (m) => {
  if (isHard(m)) { const p = viewOf(m).tileCenter(m.cells.at(-1)); return [{ op: 'mark', x: +p.x.toFixed(2), y: +p.y.toFixed(2) }]; }
  const p = cellXY(m.origin, m.cells.at(-1), stepOf(m)); return [{ op: 'mark', x: +p.x.toFixed(2), y: +p.y.toFixed(2) }];
};
export function randomPolicy(m, rnd) {
  const MAP = isHard(m) ? FLOOR_X : mapOf(m);
  return [{ op: 'mark', x: MAP.x + rnd() * MAP.w, y: MAP.y + rnd() * MAP.h }];
}

function drawMoveCard(g, r, i, f) {
  const round = (x, y, w, h, rr) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rr); else g.rect(x, y, w, h); };
  round(r.x, r.y, r.w, r.h, 8); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#d5dce2'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.arc(r.x + 14, r.y + 14, 9, 0, Math.PI * 2); g.fillStyle = '#5b6b78'; g.fill();
  g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(i + 1), r.x + 14, r.y + 14.5);
  drawMoveArrow(g, r.x + r.w / 2, r.y + r.h * 0.36, f.turn);
  g.fillStyle = '#2f3b46'; g.font = `600 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(f.turn === 0 ? 'Straight' : f.turn < 0 ? 'Turn left' : 'Turn right', r.x + r.w / 2, r.y + r.h * 0.70);
  g.fillStyle = '#5b6b78'; g.font = `500 11px ${UI_FONT}`;
  g.fillText(`walk ${f.dist}`, r.x + r.w / 2, r.y + r.h * 0.87);
}

function drawMoveArrow(g, cx, cy, turn) {
  const s = 15;
  g.save();
  g.strokeStyle = '#2f3b46'; g.fillStyle = '#2f3b46'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx, cy + s);
  let tip, dir;
  if (turn === 0) { g.lineTo(cx, cy - s); tip = { x: cx, y: cy - s - 2 }; dir = { x: 0, y: -1 }; }
  else {
    const sx = turn > 0 ? 1 : -1;
    g.lineTo(cx, cy - 2); g.arcTo(cx, cy - 8, cx + sx * 6, cy - 8, 6); g.lineTo(cx + sx * s, cy - 8);
    tip = { x: cx + sx * (s + 2), y: cy - 8 }; dir = { x: sx, y: 0 };
  }
  g.stroke();
  const px = -dir.y, py = dir.x;
  g.beginPath(); g.moveTo(tip.x + dir.x * 5, tip.y + dir.y * 5);
  g.lineTo(tip.x - dir.x * 5 + px * 7, tip.y - dir.y * 5 + py * 7);
  g.lineTo(tip.x - dir.x * 5 - px * 7, tip.y - dir.y * 5 - py * 7);
  g.closePath(); g.fill();
  g.restore();
}
function drawWalker(g, x, y) {
  g.save();
  g.beginPath(); g.moveTo(x, y - 19); g.lineTo(x - 7, y - 9); g.lineTo(x + 7, y - 9); g.closePath();
  g.fillStyle = '#2c6b3d'; g.fill();
  g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fillStyle = '#2c6b3d'; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.restore();
}

export default {
  meta: {
    name: 'egocentric_path_retrace', family: 'C', 
    panelWidth: BOARD_X.w + 20, boardH: BOARD_X.h + 10, headerH: 56, footer: 'verify', board: BOARD_X,
    actionSpace: [{ op: 'mark', x: 'board px (snaps to the floor tile under the point); the first tap on a tile is final, later taps are rejected', y: 'board px' }],
    promptHuman: 'Follow the four moves and tap the floor tile where the walker ends up (turns are the walker\'s own). One tap only: the first tap is final',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return { ...generateExt(rng, knobs.ext, knobs.n), panel: { panelWidth: 360, boardH: BOARD.h + 10 } };
    return generateHard(rng);
  },

  init(m) { return isHard(m) ? { mark: null, locked: false } : { mark: null }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'mark' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: 'bad-op' };
    if (isHard(manifest)) {
      if (state.locked) return { ok: false, reason: 'answer-recorded' };
      const t = viewOf(manifest).tileAt(action.x, action.y);
      if (!t) return { ok: false, reason: 'outside-floor' };
      state.mark = t;
      state.locked = true;
      return { ok: true, recorded: true };
    }
    const MAP = mapOf(manifest);
    if (action.x < MAP.x || action.x > MAP.x + MAP.w || action.y < MAP.y || action.y > MAP.y + MAP.h) return { ok: false, reason: 'outside-map' };
    state.mark = snapCell(manifest.origin, action.x, action.y, stepOf(manifest), MAP);
    return { ok: true };
  },

  verify(state, manifest) {
    const want = manifest.cells.at(-1), got = state.mark;
    const err = got ? Math.abs(got.c - want.c) + Math.abs(got.r - want.r) : 99;
    return { success: err === 0, error: err, partial: got ? Math.max(0, 1 - err / 8) : 0, detail: { placed: !!got, cellError: err } };
  },

  oracle: ORACLE,
  randomPolicy,
  gate,

  async mount(env) { if (env && env.style && env.manifest && env.manifest.ext) env.assets.ego = await mountEgoLook(env); },

  drawPrompt(g, r, env) {
    if (isHard(env && env.manifest)) drawPromptText(g, r, 'Follow the moves, then tap the tile where you end up', 'You are the green figure. Turn as the figure, then walk. One tap only: your first tap is final');
    else drawPromptText(g, r, 'Follow the moves, then tap where you end up', 'Each move: turn, then walk that many dots');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    if (isHard(m)) {
      g.save(); g.translate(br.x, br.y);
      g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, br.w, br.h);
      m.frames.forEach((f, i) => drawMoveCard(g, cardRectX(i), i, f));
      const V = viewOf(m);
      drawFloor(g, m, V);
      if (st.mark) drawMark(g, m, V, st.mark, ACCENT);
      drawFloorWalker(g, m, V);
      g.restore(); return;
    }
    if (env.style && env.assets?.ego) {
      g.save(); g.translate(br.x, br.y);
      const map = mapOf(m), cards = m.ext ? m.cardRects : m.frames.map((_, i) => cardRect(i));
      drawEgoStyled(g, br, m, st, env.assets.ego, { MAP: map, cards, step: stepOf(m), bounds: latticeBounds(m.origin, stepOf(m), map), cellXY: (c) => cellXY(m.origin, c, stepOf(m)), heading0: m.heading0 || 0 });
      g.restore(); return;
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, br.w, br.h);
    const round = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    m.frames.forEach((f, i) => drawMoveCard(g, m.ext ? m.cardRects[i] : cardRect(i), i, f));
    const MAPr = mapOf(m), step = stepOf(m);
    round(MAPr.x, MAPr.y, MAPr.w, MAPr.h, 10); g.fillStyle = '#e6eee3'; g.fill();
    const o = m.origin, b = latticeBounds(o, step, MAPr);
    g.fillStyle = 'rgba(60,90,66,.38)';
    for (let c = b.c0; c <= b.c1; c++) for (let r = b.r0; r <= b.r1; r++) {
      g.beginPath(); g.arc(o.x + c * step, o.y + r * step, 2.2, 0, Math.PI * 2); g.fill();
    }
    drawWalker(g, o.x, o.y);
    if (st.mark) {
      const p = cellXY(o, st.mark, step);
      g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(p.x, p.y, 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env && env.manifest, MAP = isHard(m) ? FLOOR_X : mapOf(m);
    if (isHard(m) && env.state && env.state.locked) return [];
    if (isHard(m) && !viewOf(m).tileAt(evt.x, evt.y)) return [];
    if (evt.x < MAP.x || evt.x > MAP.x + MAP.w || evt.y < MAP.y || evt.y > MAP.y + MAP.h) return [];
    return [{ op: 'mark', x: evt.x, y: evt.y }];
  },

  footerStatus(env) {
    if (isHard(env.manifest)) return env.state.locked ? 'Answer recorded. Press Verify' : 'One tap only: tap the tile where you end up';
    return env.state.mark ? 'Tap another tile to move your pick' : 'Tap a dot on the map';
  },
};
