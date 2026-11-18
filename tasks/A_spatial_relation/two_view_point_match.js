import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { splitIds } from '../core/style.js';
import { makeCam, box, cyl, sph, cone, gable, castRay, visible, render, toCanvas, contextScale } from '../common/_camera_turn_direction_rt.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 290 };
const VIEW = { w: 182, h: 236, y: 22, xa: 4, xb: 194 };
const HINT_Y = 252 + 16;
const HARD = Object.freeze({ turn: [75, 140], pitch: [-52, -36], dist: 5.0, f: 272, margin: 14, minSep: 26, minSepA: 14, tolK: 0.42, tol: [9, 13], ringA: 9, frame: 3,
  minCornersBox: 6, minCornersB: 12, twins: [2, 3], symSep: 0.45 });
const r2 = (v) => Math.round(v * 1000) / 1000;
const PALETTE = [[70, 132, 196], [236, 150, 60], [92, 170, 120], [150, 116, 196], [226, 196, 72], [72, 178, 186], [226, 128, 160], [150, 150, 158]];

function boxCorners(o) {
  const a = o.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const lx = sx * o.w / 2, lz = sz * o.d / 2;
    out.push([o.x + lx * ca + lz * sa, sy * o.h, o.z - lx * sa + lz * ca]);
  }
  return out;
}
function objPrims(o, id) {
  if (o.t === 'box') return [box({ c: [o.x, o.h / 2, o.z], h: [o.w / 2, o.h / 2, o.d / 2], yaw: o.yaw, col: o.c, id })];
  if (o.t === 'cyl') return [cyl({ x: o.x, z: o.z, r: o.r, y0: 0, y1: o.h, col: o.c, id })];
  if (o.t === 'ball') return [sph({ c: [o.x, o.r, o.z], r: o.r, col: o.c, id })];
  if (o.t === 'cone') return [cone({ x: o.x, z: o.z, r: o.r, y0: 0, y1: o.h, col: o.c, id })];
  if (o.t === 'prism') return [gable({ c: [o.x, 0, o.z], w: o.w, d: o.d, y0: 0, y1: o.h, yaw: o.yaw, col: o.c, id })];
  if (o.t === 'pyramid') return [pyramid(o, id)];
  return [];
}
const scenePrims = (objs) => objs.flatMap((o, i) => objPrims(o, i));
const footR = (o) => (o.t === 'box' || o.t === 'prism' ? Math.hypot(o.w, o.d) / 2 : o.t === 'pyramid' ? o.w / Math.SQRT2 : o.r);
function pyramidPts(o) {
  const a = o.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), b = o.w / 2, P = (lx, y, lz) => [o.x + ca * lx + sa * lz, y, o.z - sa * lx + ca * lz];
  return { base: [P(-b, 0, -b), P(b, 0, -b), P(b, 0, b), P(-b, 0, b)], apex: P(0, o.h, 0), ax: [ca, 0, -sa], az: [sa, 0, ca] };
}
function pyramid(o, id) {
  const { base, apex, ax, az } = pyramidPts(o), b = o.w / 2, planes = [{ n: [0, -1, 0], d: 0 }];
  for (const [u, sg] of [[ax, 1], [ax, -1], [az, 1], [az, -1]]) {
    const n0 = [u[0] * sg * o.h, b, u[2] * sg * o.h], l = Math.hypot(...n0), n = n0.map((v) => v / l);
    const q = [o.x + u[0] * sg * b, 0, o.z + u[2] * sg * b];
    planes.push({ n, d: n[0] * q[0] + n[1] * q[1] + n[2] * q[2] });
  }
  const corners = [...base, apex], bc = [o.x, o.h / 3, o.z];
  const br = Math.max(...corners.map((p) => Math.hypot(p[0] - bc[0], p[1] - bc[1], p[2] - bc[2]))) + 1e-6;
  return { k: 'poly', planes, corners, col: o.c, id, bc, br };
}
function makeScene(rng) {
  const objs = [];
  const nTwin = rng.int(HARD.twins[0], HARD.twins[1]);
  const kinds = rng.shuffle([...Array(nTwin).fill('twin'), ...(rng.raw() < 0.5 ? ['box'] : []), rng.pick(['cyl', 'cone']), 'ball']);
  const cols = rng.shuffle(PALETTE);
  const twin = { w: r2(rng.uniform(0.45, 0.9)), d: r2(rng.uniform(0.35, 0.7)), h: r2(rng.uniform(0.3, 0.75)), c: cols[0] };
  let ci = 1;
  for (const t0 of kinds) {
    const t = t0 === 'twin' ? 'box' : t0;
    let placed = false;
    for (let guard = 0; guard < 80; guard++) {
      const o = { t, x: r2(rng.uniform(-1.15, 1.15)), z: r2(rng.uniform(-1.15, 1.15)) };
      if (t0 === 'twin') Object.assign(o, { w: twin.w, d: twin.d, h: twin.h, yaw: rng.int(0, 89), c: twin.c });
      else if (t === 'box') Object.assign(o, { w: r2(rng.uniform(0.45, 0.9)), d: r2(rng.uniform(0.35, 0.7)), h: r2(rng.uniform(0.3, 0.75)), yaw: rng.int(0, 89), c: cols[ci] });
      else if (t === 'cyl') Object.assign(o, { r: r2(rng.uniform(0.17, 0.26)), h: r2(rng.uniform(0.45, 0.85)), c: cols[ci] });
      else if (t === 'cone') Object.assign(o, { r: r2(rng.uniform(0.2, 0.28)), h: r2(rng.uniform(0.5, 0.8)), c: cols[ci] });
      else Object.assign(o, { r: r2(rng.uniform(0.17, 0.26)), c: cols[ci] });
      if (Math.hypot(o.x, o.z) + footR(o) > 1.55) continue;
      if (!objs.every((p) => Math.hypot(p.x - o.x, p.z - o.z) > footR(p) + footR(o) + 0.14)) continue;
      objs.push(o); if (t0 !== 'twin') ci++;
      placed = true;
      break;
    }
    if (!placed) return null;
  }
  return objs;
}
const twinsOf = (objs, i) => objs.map((o, k) => k).filter((k) => String(objs[k].c) === String(objs[i].c));
function swapMismatch(objs, i, j) {
  const A = objs[i], B = objs[j];
  let best = Infinity;
  for (let deg = 0; deg < 360; deg += 2) {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const bx = B.x - (c * A.x + s * A.z), bz = B.z - (-s * A.x + c * A.z);
    const yawOk = (o, p) => { const per = Math.abs(o.w - o.d) < 0.12 ? 90 : 180, dy = (((o.yaw + deg - p.yaw) % per) + per) % per; return Math.min(dy, per - dy) < 12; };
    if (!yawOk(A, B)) continue;
    let worst = 0;
    for (const o of objs) {
      const x = c * o.x + s * o.z + bx, z = -s * o.x + c * o.z + bz;
      let near = Infinity;
      for (const p of objs) {
        if (p.t !== o.t || String(p.c) !== String(o.c)) continue;
        if (o.t === 'box' && !yawOk(o, p)) continue;
        near = Math.min(near, Math.hypot(p.x - x, p.z - z));
      }
      worst = Math.max(worst, near);
      if (worst >= best) break;
    }
    best = Math.min(best, worst);
  }
  return best;
}
function camFor(v) {
  const ya = v.yaw * Math.PI / 180, pa = v.pitch * Math.PI / 180;
  const fwd = [Math.sin(ya) * Math.cos(pa), Math.sin(pa), Math.cos(ya) * Math.cos(pa)];
  const T = [0, 0.22, 0];
  const dist = v.dist ?? HARD.dist;
  const pos = [T[0] - fwd[0] * dist, T[1] - fwd[1] * dist, T[2] - fwd[2] * dist];
  return makeCam({ pos, yaw: v.yaw, pitch: v.pitch, f: HARD.f, W: VIEW.w, H: VIEW.h, proj: 'pin' });
}
function cornerSeen(scene, cam, p) {
  const d = [cam.pos[0] - p[0], cam.pos[1] - p[1], cam.pos[2] - p[2]], L = Math.hypot(...d);
  const q = [p[0] + d[0] / L * 2e-3, p[1] + d[1] / L * 2e-3, p[2] + d[2] / L * 2e-3];
  return visible(scene, cam.pos, q, 1e-4);
}
function inFrame(pt, m) { return pt.x >= m && pt.x <= VIEW.w - m && pt.y >= m && pt.y <= VIEW.h - m; }
function outlinePts(o) {
  if (o.t === 'box') return boxCorners(o);
  if (o.t === 'pyramid') { const { base, apex } = pyramidPts(o); return [...base, apex]; }
  if (o.t === 'prism') {
    const a = o.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), P = (lx, y, lz) => [o.x + ca * lx + sa * lz, y, o.z - sa * lx + ca * lz];
    return [P(-o.w / 2, 0, -o.d / 2), P(o.w / 2, 0, -o.d / 2), P(-o.w / 2, 0, o.d / 2), P(o.w / 2, 0, o.d / 2), P(0, o.h, -o.d / 2), P(0, o.h, o.d / 2)];
  }
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, cx = o.x + o.r * Math.cos(a), cz = o.z + o.r * Math.sin(a);
    if (o.t === 'ball') { pts.push([cx, o.r, cz]); continue; }
    pts.push([cx, 0, cz]); if (o.t === 'cyl') pts.push([cx, o.h, cz]);
  }
  if (o.t === 'ball') pts.push([o.x, 2 * o.r, o.z], [o.x, 0, o.z]);
  if (o.t === 'cone') pts.push([o.x, o.h, o.z]);
  return pts;
}
function ringClear(scene, cam, p, rad, id) {
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, d = cam.ray(p.x + rad * Math.cos(a), p.y + rad * Math.sin(a));
    const h = castRay(scene, cam.pos, d);
    if (h && h.prim && h.prim.id !== id) return false;
  }
  return true;
}

function analyseRound(r) {
  const scene = { prims: scenePrims(r.objs) };
  const ca = camFor(r.viewA), cb = camFor(r.viewB);
  const tb = r.objs[r.target.obj];
  if (!tb || tb.t !== 'box') return null;
  const corners = boxCorners(tb);
  const P = corners[r.target.corner];
  if (!P) return null;
  const pa = ca.project(P), pb = cb.project(P);
  if (!pa.front || !pb.front || !inFrame(pa, HARD.margin) || !inFrame(pb, HARD.margin)) return null;
  if (!cornerSeen(scene, ca, P) || !cornerSeen(scene, cb, P)) return null;
  for (const o of r.objs) for (const q of outlinePts(o)) for (const cam of [ca, cb]) { const s2 = cam.project(q); if (!s2.front || !inFrame(s2, HARD.frame)) return null; }
  if (!ringClear(scene, ca, pa, HARD.ringA, r.target.obj)) return null;
  let dminA = Infinity;
  r.objs.forEach((o, oi) => {
    if (o.t !== 'box') return;
    boxCorners(o).forEach((c, ci) => {
      if (oi === r.target.obj && ci === r.target.corner) return;
      const q = ca.project(c);
      if (q.front && cornerSeen(scene, ca, c)) dminA = Math.min(dminA, Math.hypot(q.x - pa.x, q.y - pa.y));
    });
  });
  const others = [];
  r.objs.forEach((o, oi) => {
    if (o.t !== 'box') return;
    boxCorners(o).forEach((c, ci) => {
      if (oi === r.target.obj && ci === r.target.corner) return;
      const q = cb.project(c);
      if (q.front && cornerSeen(scene, cb, c)) others.push({ oi, ci, x: q.x, y: q.y });
    });
  });
  const dmin = Math.min(...others.map((o) => Math.hypot(o.x - pb.x, o.y - pb.y)));
  const tol = Math.max(HARD.tol[0], Math.min(HARD.tol[1], HARD.tolK * dmin));
  if (!ringClear(scene, cb, pb, tol, r.target.obj)) return null;
  const sameObj = (cam) => corners.map((c, ci) => ({ ci, q: cam.project(c), seen: cornerSeen(scene, cam, c) })).filter((c) => c.seen && c.q.front);
  const A = sameObj(ca), B = sameObj(cb);
  const bbox = (L) => ({ x0: Math.min(...L.map((c) => c.q.x)), x1: Math.max(...L.map((c) => c.q.x)), y0: Math.min(...L.map((c) => c.q.y)), y1: Math.max(...L.map((c) => c.q.y)) });
  const ba = bbox(A), bb = bbox(B);
  const guesses = [{ why: 'same spot', x: pa.x, y: pa.y }];
  const u = (pa.x - ba.x0) / Math.max(1, ba.x1 - ba.x0), v = (pa.y - ba.y0) / Math.max(1, ba.y1 - ba.y0);
  guesses.push({ why: 'same place in outline', x: bb.x0 + u * (bb.x1 - bb.x0), y: bb.y0 + v * (bb.y1 - bb.y0) });
  const ext = [['left', (c) => c.q.x], ['right', (c) => -c.q.x], ['top', (c) => c.q.y], ['bottom', (c) => -c.q.y], ['near', (c) => c.q.depth]];
  for (const [why, key] of ext) {
    const bestA = A.reduce((s, c) => (key(c) < key(s) ? c : s));
    if (bestA.ci !== r.target.corner) continue;
    const bestB = B.reduce((s, c) => (key(c) < key(s) ? c : s));
    guesses.push({ why: `${why}-most corner`, x: bestB.q.x, y: bestB.q.y });
  }
  const lazyMiss = Math.min(...guesses.map((g) => Math.hypot(g.x - pb.x, g.y - pb.y)));
  const twinCornersB = twinsOf(r.objs, r.target.obj).reduce((n, k) => n + boxCorners(r.objs[k]).filter((c) => { const q = cb.project(c); return q.front && cornerSeen(scene, cb, c); }).length, 0);
  return { pa, pb, dmin, dminA, tol, others, lazyMiss, visibleCornersB: B.length, twinCornersB, sameColourB: B.map((c) => ({ x: c.q.x, y: c.q.y, ci: c.ci })) };
}
function roundBad(r, a) {
  if (!a || a.dmin < HARD.minSep || a.dminA < HARD.minSepA || a.lazyMiss <= a.tol + 4 || a.visibleCornersB < HARD.minCornersBox) return true;
  if (r.ext) return false;
  if (a.twinCornersB < HARD.minCornersB) return true;
  const tw = twinsOf(r.objs, r.target.obj);
  return tw.some((j) => j !== r.target.obj && swapMismatch(r.objs, r.target.obj, j) < HARD.symSep);
}

function tryRound(rng) {
  const objs = makeScene(rng);
  if (!objs) return null;
  const c0 = String(PALETTE.find((c) => objs.filter((o) => String(o.c) === String(c)).length > 1));
  const twins = objs.map((o, i) => (String(o.c) === c0 ? i : -1)).filter((i) => i >= 0);
  if (twins.length < HARD.twins[0]) return null;
  const yawA = rng.int(0, 359), turn = rng.int(HARD.turn[0], HARD.turn[1]) * rng.sign();
  const viewA = { yaw: yawA, pitch: rng.int(HARD.pitch[0], HARD.pitch[1]) };
  const viewB = { yaw: (yawA + turn + 360) % 360, pitch: rng.int(HARD.pitch[0], HARD.pitch[1]) };
  const obj = rng.pick(twins);
  const order = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  for (const corner of order) {
    const r = { objs, viewA, viewB, target: { obj, corner } };
    const a = analyseRound(r);
    if (roundBad(r, a)) continue;
    return { ...r, answer: { x: r2(a.pb.x), y: r2(a.pb.y), tol: r2(a.tol) } };
  }
  return null;
}

const EXT = Object.freeze({ turn: [75, 140], pitch: [-52, -36], dist: [4.85, 5.15] });
const EXT_PALETTE = [[70, 132, 196], [236, 150, 60], [92, 170, 120], [150, 116, 196], [226, 196, 72], [72, 178, 186], [150, 150, 158],
  [128, 88, 60], [238, 234, 222], [56, 62, 74], [166, 198, 78], [98, 96, 186], [200, 170, 120], [40, 120, 100]];
const EXT_KINDS = ['box', 'cyl', 'ball', 'cone', 'prism', 'pyramid'];
const NEW_SHAPES = ['prism', 'pyramid'];
const SHAPE_SPLIT = splitIds('g09_tvp_shape', NEW_SHAPES, 1);
const DEFAULT_COLS = PALETTE.map(String);
const COL_SPLIT = splitIds('g09_tvp_colour', EXT_PALETTE.filter((c) => !DEFAULT_COLS.includes(String(c))).map((c) => c.join('-')), 1);
const colsFor = (split) => EXT_PALETTE.filter((c) => DEFAULT_COLS.includes(String(c)) || COL_SPLIT(c.join('-')) === split);
const kindsFor = (split) => EXT_KINDS.filter((k) => !NEW_SHAPES.includes(k) || SHAPE_SPLIT(k) === split);
function makeSceneExt(rng, split) {
  const objs = [];
  const nBox = rng.int(2, 4), nOther = rng.int(Math.max(1, 4 - nBox), 5 - nBox);
  const others = kindsFor(split).filter((k) => k !== 'box');
  const kinds = rng.shuffle([...Array(nBox).fill('box'), ...Array.from({ length: nOther }, () => rng.pick(others))]);
  const cols = rng.shuffle(colsFor(split));
  let ci = 0;
  for (const t of kinds) {
    for (let guard = 0; guard < 80; guard++) {
      const o = { t, x: r2(rng.uniform(-1.2, 1.2)), z: r2(rng.uniform(-1.2, 1.2)) };
      if (t === 'box') Object.assign(o, { w: r2(rng.uniform(0.4, 0.95)), d: r2(rng.uniform(0.32, 0.75)), h: r2(rng.uniform(0.25, 0.8)), yaw: rng.int(0, 89), c: cols[ci] });
      else if (t === 'prism') Object.assign(o, { w: r2(rng.uniform(0.45, 0.8)), d: r2(rng.uniform(0.45, 0.85)), h: r2(rng.uniform(0.3, 0.55)), yaw: rng.int(0, 179), c: cols[ci] });
      else if (t === 'pyramid') Object.assign(o, { w: r2(rng.uniform(0.4, 0.7)), h: r2(rng.uniform(0.35, 0.7)), yaw: rng.int(0, 89), c: cols[ci] });
      else if (t === 'cyl') Object.assign(o, { r: r2(rng.uniform(0.15, 0.27)), h: r2(rng.uniform(0.35, 0.9)), c: cols[ci] });
      else if (t === 'cone') Object.assign(o, { r: r2(rng.uniform(0.18, 0.3)), h: r2(rng.uniform(0.45, 0.85)), c: cols[ci] });
      else Object.assign(o, { r: r2(rng.uniform(0.15, 0.27)), c: cols[ci] });
      if (Math.hypot(o.x, o.z) + footR(o) > 1.6) continue;
      if (!objs.every((p) => Math.hypot(p.x - o.x, p.z - o.z) > footR(p) + footR(o) + 0.14)) continue;
      objs.push(o); ci++;
      break;
    }
  }
  return objs;
}
function tryRoundExt(rng, split) {
  const objs = makeSceneExt(rng, split);
  const boxes = objs.map((o, i) => (o.t === 'box' ? i : -1)).filter((i) => i >= 0);
  if (boxes.length < 2) return null;
  const yawA = rng.int(0, 359), turn = rng.int(EXT.turn[0], EXT.turn[1]) * rng.sign();
  const viewA = { yaw: yawA, pitch: rng.int(EXT.pitch[0], EXT.pitch[1]), dist: r2(rng.uniform(...EXT.dist)) };
  const viewB = { yaw: (yawA + turn + 360) % 360, pitch: rng.int(EXT.pitch[0], EXT.pitch[1]), dist: r2(rng.uniform(...EXT.dist)) };
  const obj = rng.pick(boxes);
  for (const corner of rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7])) {
    const r = { objs, viewA, viewB, target: { obj, corner } };
    const a = analyseRound(r);
    if (roundBad({ ...r, ext: split }, a)) continue;
    return { ...r, answer: { x: r2(a.pb.x), y: r2(a.pb.y), tol: r2(a.tol) } };
  }
  return null;
}
export function semanticKey(m) {
  const q = (v, g) => Math.round(v / g);
  const objs = m.objs.map((o) => `${o.t}@${q(o.x, 0.4)},${q(o.z, 0.4)}${o.t === 'box' || o.t === 'prism' || o.t === 'pyramid' ? '/' + (q(((o.yaw % 90) + 90) % 90, 15) % 6) : ''}`).sort().join(';');
  const c = boxCorners(m.objs[m.target.obj])[m.target.corner];
  return `two_view_point_match|${objs}|${q(c[0], 0.2)},${q(c[1], 0.2)},${q(c[2], 0.2)}`;
}
const extViewOk = (v) => !!v && Number.isFinite(v.yaw) && v.pitch >= EXT.pitch[0] && v.pitch <= EXT.pitch[1] && v.dist >= EXT.dist[0] - 1e-9 && v.dist <= EXT.dist[1] + 1e-9;

export function gate(m) {
  if (!m || m.task !== 'two_view_point_match' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if ('rounds' in m) return false;
  for (const r of [m]) {
    if (!r || !Array.isArray(r.objs) || r.objs.filter((o) => o.t === 'box').length < 2) return false;
    const kinds = r.ext ? kindsFor(r.ext) : ['box', 'cyl', 'ball', 'cone'];
    if (r.ext && (!extViewOk(r.viewA) || !extViewOk(r.viewB))) return false;
    if (r.ext && !r.objs.every((o) => colsFor(r.ext).some((c) => String(c) === String(o.c)))) return false;
    if (!r.objs.every((o) => kinds.includes(o?.t) && Number.isFinite(o.x) && Number.isFinite(o.z))) return false;
    if (r.ext) {
      if (new Set(r.objs.map((o) => String(o.c))).size !== r.objs.length) return false;
    } else {
      const T = r.objs[r.target?.obj];
      if (!T || T.t !== 'box') return false;
      const tw = twinsOf(r.objs, r.target.obj);
      if (tw.length < HARD.twins[0] || tw.length > HARD.twins[1]) return false;
      if (!tw.every((k) => r.objs[k].t === 'box' && r.objs[k].w === T.w && r.objs[k].d === T.d && r.objs[k].h === T.h)) return false;
      if (new Set(r.objs.map((o) => String(o.c))).size !== r.objs.length - tw.length + 1) return false;
      if (!r.objs.some((o) => o.t === 'ball') || !r.objs.some((o) => o.t === 'cyl' || o.t === 'cone')) return false;
    }
    for (let i = 0; i < r.objs.length; i++) for (let j = i + 1; j < r.objs.length; j++)
      if (Math.hypot(r.objs[i].x - r.objs[j].x, r.objs[i].z - r.objs[j].z) <= footR(r.objs[i]) + footR(r.objs[j]) + 0.1) return false;
    const dyaw = Math.abs(((r.viewB.yaw - r.viewA.yaw) % 360 + 540) % 360 - 180);
    const turn = r.ext ? EXT.turn : HARD.turn;
    if (dyaw < turn[0] || dyaw > turn[1]) return false;
    const a = analyseRound(r);
    if (roundBad(r, a)) return false;
    if (Math.abs(a.pb.x - r.answer.x) > 0.01 || Math.abs(a.pb.y - r.answer.y) > 0.01 || Math.abs(a.tol - r.answer.tol) > 0.01) return false;
    if (a.tol * 2 >= a.dmin) return false;
  }
  return true;
}

function sceneFor(r) {
  return {
    prims: scenePrims(r.objs),
    ground: { kind: 'table', base: [214, 188, 150], plank: 0.42 },
    sun: [0.35, 0.9, 0.25], fog: null, outline: 0.7, ink: [44, 40, 38], ambient: 0.5,
  };
}
function dot(g, x, y, r, col) {
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2.6; g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1;
}

const GROUND_USES = ['wood', 'floor', 'stone', 'fabric', 'terrain', 'flat2d'];
const GROUND_SKIP = new Set(['book_pattern', 'fabric_pattern_05', 'fabric_pattern_07', 'gingham_check', 'curly_teddy_checkered', 'quatrefoil_jacquard_fabric']);
const FINISHES = ['gloss', 'paint', 'woodpaint', 'felt'];
const FINISH_SPLIT = splitIds('g09_tvp_finish', FINISHES, 1);
async function tvpLook(style) {
  const [X, S3, RT] = await Promise.all([import('../common/_pipes_look.js'), import('../common/_style3d.js'), import('../common/_two_view_point_match_rt.js')]);
  const grounds = style.pool('tex', (t) => GROUND_USES.includes(t.use) && !GROUND_SKIP.has(t.id));
  const hdris = style.pool('hdri');
  const fins = FINISHES.filter((f) => FINISH_SPLIT(f) === style.split);
  const [gi, fi, hi] = style.primaryCombo('g09-tvp-look', [grounds.length, fins.length, hdris.length]);
  const gr = grounds[gi], finish = fins[fi], hd = hdris[hi];
  style.note(`tex:${gr.id}`); style.note(`g09_tvp_finish:${finish}`); style.note(`hdri:${hd.id}`);
  const r = style.rand;
  const detail = finish === 'woodpaint' ? style.pick('tex', (t) => t.use === 'wood') : finish === 'felt' ? style.pick('tex', (t) => t.use === 'fabric') : null;
  const [GT, DT] = await Promise.all([S3.loadTexture(gr.file), detail ? S3.loadTexture(detail.file) : null]);
  const Lg = 0.26 + 0.3 * r(), az = r() * 2 * Math.PI, el = (50 + 25 * r()) * Math.PI / 180;
  const tint = X.hdriTint(hd, r());
  const ground = X.texAlbedo(GT, { size: 1.6 + 1.6 * r(), L: Lg, contrast: 0.42, sat: 0.3, safe: true });
  const N = [0, 1, 0];
  const lumL = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const S = new Float64Array(3), inv = DT ? 1 / Math.max(1e-6, lumL(DT.mean)) : 1, amt = finish === 'woodpaint' ? 0.1 : 0.07, tpm = DT ? DT.n / 0.5 : 1;
  const skin = (col) => (P, n, fp, out) => {
    const u = Math.abs(n[1]) > 0.6 ? P[0] : P[0] + P[2], v = Math.abs(n[1]) > 0.6 ? P[2] : -P[1] * 1.0;
    S3.sampleTex(DT, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const f = Math.max(0.78, Math.min(1.22, 1 + amt / Math.max(0.05, DT.cv) * (lumL(S) * inv - 1)));
    out[0] = col[0] * f; out[1] = col[1] * f; out[2] = col[2] * f;
  };
  return {
    RT, ids: { ground: gr.id, finish, hdri: hd.id },
    scene(rd) {
      const prims = scenePrims(rd.objs).map((p) => {
        const q = { ...p };
        if (finish === 'gloss') Object.assign(q, { ks: 0.42, sh: 46 });
        else if (finish === 'paint') Object.assign(q, { ks: 0.08, sh: 14 });
        else if (DT) Object.assign(q, { tex: skin(p.col), ks: finish === 'woodpaint' ? 0.12 : 0, sh: 20 });
        return q;
      });
      return {
        prims, groundFn: (x, z, fp, out) => ground([x, 0, z], N, fp, out),
        sun: [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)],
        sunCol: tint.key, ambCol: tint.amb, outline: 0.7, ink: [36, 34, 32], ambient: 0.5,
      };
    },
  };
}

export default {
  meta: {
    name: 'two_view_point_match', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'tap', x: `${VIEW.xb}..${VIEW.xb + VIEW.w} board px (photo B)`, y: `${VIEW.y}..${VIEW.y + VIEW.h} board px`, note: 'tap again to move the marker' }],
    promptHuman: 'Tap the red-ringed corner in photo B',
  },

  generate(rng, level, index, knobs) {
    let r = null;
    if (knobs && knobs.ext) {
      for (let t = 0; t < 600 && !r; t++) r = tryRoundExt(rng, knobs.ext);
      if (!r) throw new Error('two_view_point_match: could not build an ext scene');
      return { task: 'two_view_point_match', board: { ...BOARD }, ...r, ext: knobs.ext };
    }
    for (let t = 0; t < 300 && !r; t++) r = tryRound(rng);
    if (!r) throw new Error('two_view_point_match: could not build a scene');
    return { task: 'two_view_point_match', board: { ...BOARD }, ...r };
  },

  init() { return { tap: null }; },

  applyAction(state, a) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const x = a.x - VIEW.xb, y = a.y - VIEW.y;
    if (x < 0 || x > VIEW.w || y < 0 || y > VIEW.h) return { ok: false, reason: 'outside-photo-B' };
    state.tap = { x, y };
    return { ok: true };
  },

  verify(state, m) {
    const t = state.tap, err = t ? Math.hypot(t.x - m.answer.x, t.y - m.answer.y) : Infinity;
    const good = err <= m.answer.tol;
    return { success: good, partial: good ? 1 : 0, error: good ? 0 : 1, detail: { tapped: !!t } };
  },

  oracle(m) { return [{ op: 'tap', x: VIEW.xb + m.answer.x, y: VIEW.y + m.answer.y }]; },

  randomPolicy(m, rnd) { return [{ op: 'tap', x: VIEW.xb + rnd() * VIEW.w, y: VIEW.y + rnd() * VIEW.h }]; },

  async mount(env) {
    env.assets.tvp = null;
    if (env.style) env.assets.look = await tvpLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Tap the red-ringed corner in photo B', 'Same table, seen from another side');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const R = m;
    const q = contextScale(g);
    const look = env.style ? env.assets.look : null;
    const key = `${q}${look ? '|' + env.style.key : ''}`;
    let cache = env.assets.tvp;
    if (!cache || cache.key !== key) {
      const sc = look ? look.scene(R) : sceneFor(R), rend = look ? look.RT.render : render;
      cache = env.assets.tvp = { key, a: toCanvas(rend(sc, camFor(R.viewA), q)), b: toCanvas(rend(sc, camFor(R.viewB), q)), dot: camFor(R.viewA).project(boxCorners(R.objs[R.target.obj])[R.target.corner]) };
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f1f3f6'; g.fillRect(0, 0, br.w, br.h);
    for (const [img, x, label] of [[cache.a, VIEW.xa, 'A'], [cache.b, VIEW.xb, 'B']]) {
      g.save(); rr(g, x, VIEW.y, VIEW.w, VIEW.h, 6); g.clip();
      g.drawImage(img, x, VIEW.y, VIEW.w, VIEW.h);
      g.restore();
      rr(g, x + 0.5, VIEW.y + 0.5, VIEW.w - 1, VIEW.h - 1, 6); g.strokeStyle = label === 'B' ? ACCENT : '#c9d2dc'; g.lineWidth = label === 'B' ? 1.6 : 1; g.stroke();
      rr(g, x + 6, VIEW.y + 6, 22, 20, 5); g.fillStyle = 'rgba(255,255,255,.92)'; g.fill();
      g.fillStyle = '#2f3a45'; g.font = `800 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x + 17, VIEW.y + 16.5);
    }
    dot(g, VIEW.xa + cache.dot.x, VIEW.y + cache.dot.y, 6.5, '#e5322d');
    const tap = state.tap;
    if (tap) {
      const x = VIEW.xb + tap.x, y = VIEW.y + tap.y;
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 11, y); g.moveTo(x, y - 11); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 11); g.stroke();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (e.x >= VIEW.xb && e.x <= VIEW.xb + VIEW.w && e.y >= VIEW.y && e.y <= VIEW.y + VIEW.h) return [{ op: 'tap', x: e.x, y: e.y }];
    return [];
  },

  footerStatus(env) {
    return env.state.tap ? 'Marker placed' : 'Tap photo B';
  },
};

export const _internals = { analyseRound, camFor, sceneFor, boxCorners, VIEW, HARD, makeScene, tryRound };
