import { drawPromptText, ACCENT } from '../core/panel.js';
import {
  orbitCamera, box, cylinder, cone, sphere, surfacePoints, convexHull, silhouette, pointInPoly, clipConvex, polyArea, bounds,
} from '../common/_touch_cells_grid_rt.js';
import { camFromBasis, shape, makeScene, render, blit, lin, hash2, fbm, lineMask, mixInto, contextScale } from '../common/_props_rt.js';
import { splitIds } from '../core/style.js';
import * as S3 from '../common/_style3d.js';
import * as LK from '../common/_block_scene_look.js';

const PANEL_W = 520;
const BOARD = { w: PANEL_W - 20, h: 402 };
const VIEW = { w: BOARD.w, h: BOARD.h };
const CAM = { yaw: 0, pitch: 50, dist: 520, fov: 579, target: { x: 0, y: 22, z: -28 } };
const YARD = { x: 124, back: -112, front: 8, wallH: 118, wallT: 10 };
const HARD = Object.freeze({
  rounds: 1, slots: 5, lamps: 10, objects: 3, lampHi: 104, lampLo: 56, lampOut: 7, slotGap: 56, backX: 96, sideZ: [-86, -8], jitter: 7,
  objR: 52, objZ: -16, objGap: 46, height: [18, 28], minMaxDev: 34, minMeanDev: 22, minFan: 12, tipOut: 12, tipClear: 4,
  twinLen: 0.25, twinTip: 10, twinSep: 38, lampSep: 68, lampHit: 22, edge: 13,
});
const LAMP2 = Object.freeze({
  hi: [92, 100], lo: [58, 70], minGap: 30, ratio: [1.4, 4.2], twinSep: 24,
  dist: { hi: [60, 210], lo: [45, 210] }, cluster: 60, region: { x: 105, z: [-98, 60] }, line: { hit: 10, gap: 12, objects: 2 }, tries: 60000,
});
const isLo = (i) => (i & 1) === 1;
const slotOf = (i) => i >> 1;
const twinOf = (i) => i ^ 1;
const KINDS = ['pillar', 'post', 'cone', 'can', 'crate', 'totem'];
const COLORS = ['#d9826f', '#7f9fd1', '#e2c16d', '#85b98f', '#a58fca', '#6fb3b5', '#e09a5b'];
const WALL = '#d8cdb8', CAP = '#55606b', GLOBE = '#f6efd9';

const r2 = (v) => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;

export const camera = () => orbitCamera({ ...CAM, cx: VIEW.w / 2, cy: VIEW.h / 2 });
const camOf = (r) => (r && r.ext === true && r.cam ? orbitCamera({ ...CAM, ...r.cam, cx: VIEW.w / 2, cy: VIEW.h / 2 }) : camera());
const yardOf = (r) => (r && r.ext === true && r.yard ? r.yard : YARD);
const EXT_KINDS = ['bollard', 'slab', 'stack'];
const EXT_SPLIT = splitIds('lamp_from_shadows_tap|kind', EXT_KINDS, 1);
const kindsOf = (r) => (r && r.ext === true ? [...KINDS, ...EXT_KINDS] : KINDS);

export function objectPrims(o, id0) {
  const { x, z, h, color: col, yaw } = o;
  switch (o.kind) {
    case 'pillar': return [box(x, 0, z, 15, h, 15, yaw, col, { id: id0 })];
    case 'post': return [cylinder(x, z, 0, h, 6.5, col, { id: id0 })];
    case 'cone': return [cone(x, z, 0, h, 13, col, { id: id0 })];
    case 'can': return [cylinder(x, z, 0, h * 0.72, 12, col, { id: id0 })];
    case 'crate': return [box(x, 0, z, 24, h * 0.62, 20, yaw, col, { id: id0 })];
    case 'totem': return [cylinder(x, z, 0, h - 10, 6, col, { id: id0 }), sphere({ x, y: h - 6, z }, 8.5, col, { id: id0 + 1 })];
    case 'bollard': return [cylinder(x, z, 0, h - 8, 9, col, { id: id0 }), sphere({ x, y: h - 8, z }, 9, col, { id: id0 + 1 })];
    case 'slab': return [box(x, 0, z, 30, h * 0.45, 22, yaw, col, { id: id0 })];
    case 'stack': return [box(x, 0, z, 22, h * 0.5, 22, yaw, col, { id: id0 }), box(x, h * 0.5, z, 13, h * 0.5, 13, yaw + 20, col, { id: id0 + 1 })];
    default: return [];
  }
}
export function lampPrims(l, id0) {
  const y = l.y, nx = l.wall === 'left' ? 1 : l.wall === 'right' ? -1 : 0, nz = l.wall === 'back' ? 1 : 0;
  const bx = l.x - nx * HARD.lampOut / 2, bz = l.z - nz * HARD.lampOut / 2;
  return [
    box(bx, y + 4, bz, nx ? HARD.lampOut : 3, 3, nz ? HARD.lampOut : 3, 0, CAP, { id: id0, noShadow: true, flat: 0.9 }),
    sphere({ x: l.x, y, z: l.z }, 7.5, GLOBE, { id: id0 + 1, noShadow: true, flat: 0.98 }),
    box(l.x, y + 6.5, l.z, 6, 3, 6, 0, CAP, { id: id0 + 2, noShadow: true, flat: 0.9 }),
  ];
}
export function wallPrims(Yd = YARD) {
  const { x, back, front, wallH, wallT } = Yd, o = { noShadow: true, flat: 0.93 };
  return [
    box(0, 0, back - wallT / 2, 2 * x + 2 * wallT, wallH, wallT, 0, WALL, { id: 90, ...o }),
    box(-x - wallT / 2, 0, (back + front) / 2, wallT, wallH, front - back, 0, WALL, { id: 91, ...o }),
    box(x + wallT / 2, 0, (back + front) / 2, wallT, wallH, front - back, 0, WALL, { id: 92, ...o }),
  ];
}
export const lampLight = (l) => ({ x: l.x, y: l.y, z: l.z });

function shadowPoly(p, L) {
  return convexHull(surfacePoints(p, 20).map((q) => {
    const s = L.y / (L.y - q.y);
    return { x: L.x + (q.x - L.x) * s, y: L.z + (q.z - L.z) * s };
  })).map((q) => ({ x: q.x, y: 0, z: q.y }));
}

const angBetween = (ax, az, bx, bz) => {
  const a = Math.atan2(az, ax), b = Math.atan2(bz, bx);
  let d = Math.abs(a - b) % TAU; if (d > Math.PI) d = TAU - d;
  return d * 180 / Math.PI;
};
export function decoyDeviation(r, di) {
  const s = r.lamps[r.answer], d = r.lamps[di];
  return r.objects.map((o) => angBetween(o.x - s.x, o.z - s.z, o.x - d.x, o.z - d.z));
}

function floorTip(o, prims, L) {
  const ux = o.x - L.x, uz = o.z - L.z, n = Math.hypot(ux, uz) || 1;
  let tipW = null, best = -Infinity;
  for (const p of prims) for (const q of shadowPoly(p, L)) { const v = ((q.x - o.x) * ux + (q.z - o.z) * uz) / n; if (v > best) { best = v; tipW = q; } }
  return { tipW, len: best };
}
export function roundGeometry(r) {
  const cam = camOf(r), L = lampLight(r.lamps[r.answer]);
  const objs = r.objects.map((o, i) => {
    const prims = objectPrims(o, 10 + 2 * i);
    const hull = convexHull(prims.flatMap((p) => silhouette(p, cam)));
    const floor = prims.flatMap((p) => shadowPoly(p, L));
    const shadow = convexHull(floor.map((q) => cam.project(q)));
    const { tipW, len } = floorTip(o, prims, L);
    return { hull, shadow, tip: cam.project(tipW), len, floor, top: cam.project({ x: o.x, y: o.h, z: o.z }) };
  });
  const lamps = r.lamps.map((l) => ({ c: cam.project({ x: l.x, y: l.y + 1, z: l.z }) }));
  return { objs, lamps };
}
function twinTips(r) {
  const cam = camOf(r), L = lampLight(r.lamps[twinOf(r.answer)]);
  return r.objects.map((o, i) => { const { tipW, len } = floorTip(o, objectPrims(o, 10 + 2 * i), L); return { tip: cam.project(tipW), len }; });
}

function distOutside(pt, hull) {
  if (pointInPoly(pt, hull)) return -1;
  let d = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    d = Math.min(d, Math.hypot(pt.x - a.x - vx * t, pt.y - a.y - vy * t));
  }
  return d;
}
const overlapArea = (a, b) => { const c = clipConvex(a, b); return c.length >= 3 ? Math.abs(polyArea(c)) : 0; };
const rectXZ = (x0, x1, z0, z1) => [{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }];
const WALL_FOOT = [
  rectXZ(-YARD.x - YARD.wallT - 3, -YARD.x + 3, YARD.back - YARD.wallT - 3, YARD.front + 3),
  rectXZ(YARD.x - 3, YARD.x + YARD.wallT + 3, YARD.back - YARD.wallT - 3, YARD.front + 3),
  rectXZ(-YARD.x - YARD.wallT - 3, YARD.x + YARD.wallT + 3, YARD.back - YARD.wallT - 3, YARD.back + 3),
];
const circlePoly = (c, r) => Array.from({ length: 16 }, (_, i) => ({ x: c.x + r * Math.cos(TAU * i / 16), y: c.y + r * Math.sin(TAU * i / 16) }));
const inView = (p, m) => p.x >= m && p.x <= VIEW.w - m && p.y >= m && p.y <= VIEW.h - m;

function evalHeightsOk(r, i) {
  const hi = r.lamps[0].y, lo = r.lamps[1].y, y = r.lamps[i].y;
  return Number.isFinite(hi) && Number.isFinite(lo) && y === (isLo(i) ? lo : hi)
    && hi >= LAMP2.hi[0] && hi <= LAMP2.hi[1] && lo >= LAMP2.lo[0] && lo <= LAMP2.lo[1]
    && hi - lo >= LAMP2.minGap && hi + 10 <= YARD.wallH;
}
export const objTop = (o) => Math.max(...objectPrims(o, 0).map((p) => bounds(p).hi.y));
export function shadowRatios(r) {
  const L = lampLight(r.lamps[r.answer]);
  return r.objects.map((o, i) => floorTip(o, objectPrims(o, 10 + 2 * i), L).len / objTop(o));
}
const ratioOk = (r) => { const m = Math.max(...shadowRatios(r)); return m >= LAMP2.ratio[0] && m <= LAMP2.ratio[1]; };
export function lineMisses(r) {
  const G = roundGeometry(r), la = G.lamps[r.answer].c, lb = G.lamps[twinOf(r.answer)].c;
  return G.objs.map((o) => {
    const dx = o.top.x - o.tip.x, dy = o.top.y - o.tip.y, n = Math.hypot(dx, dy) || 1;
    const miss = (q) => Math.abs((q.x - o.tip.x) * dy - (q.y - o.tip.y) * dx) / n;
    return { lit: miss(la), twin: miss(lb) };
  });
}
const lineOk = (r) => lineMisses(r).filter((d) => d.lit <= LAMP2.line.hit && d.twin - d.lit >= LAMP2.line.gap).length >= LAMP2.line.objects;

function roundProblems(r) {
  const errs = [];
  if (!r || !Array.isArray(r.lamps) || r.lamps.length !== HARD.lamps || !Array.isArray(r.objects) || r.objects.length !== HARD.objects) return ['shape'];
  if (!Number.isInteger(r.answer) || r.answer < 0 || r.answer >= HARD.lamps) return ['answer'];
  for (const o of r.objects) {
    if (!kindsOf(r).includes(o.kind) || !COLORS.includes(o.color) || !(o.h >= HARD.height[0] && o.h <= HARD.height[1])) errs.push('obj');
    if (r.ext === true ? Math.hypot(o.x, o.z - HARD.objZ) > HARD.objR + 1e-6
      : Math.abs(o.x) > LAMP2.region.x + 1e-6 || o.z < LAMP2.region.z[0] - 1e-6 || o.z > LAMP2.region.z[1] + 1e-6) errs.push('obj-far');
  }
  for (let i = 0; i < HARD.objects; i++) for (let j = i + 1; j < HARD.objects; j++) {
    if (Math.hypot(r.objects[i].x - r.objects[j].x, r.objects[i].z - r.objects[j].z) < HARD.objGap - 1e-6) errs.push('obj-close');
  }
  const walls = { back: 0, left: 0, right: 0 };
  r.lamps.forEach((l, i) => {
    if (!(l.wall in walls)) { errs.push('lamp-wall'); return; }
    if (!isLo(i)) walls[l.wall]++;
    if (r.ext === true) {
      if (l.y !== (isLo(i) ? HARD.lampLo : HARD.lampHi) || l.y + 10 > yardOf(r).wallH) errs.push('lamp-height');
    } else if (!evalHeightsOk(r, i)) errs.push('lamp-height');
    const t = r.lamps[twinOf(i)];
    if (!t || t.wall !== l.wall || t.x !== l.x || t.z !== l.z) errs.push('lamp-twin');
    const Yd = yardOf(r), backX = Yd === YARD ? HARD.backX : Yd.x - 28, sideZ = Yd === YARD ? HARD.sideZ : [Yd.back + 26, -8];
    const onWall = l.wall === 'back' ? Math.abs(l.z - (Yd.back + HARD.lampOut)) < 1e-6 && Math.abs(l.x) <= backX + 1e-6
      : Math.abs(Math.abs(l.x) - (Yd.x - HARD.lampOut)) < 1e-6 && Math.sign(l.x) === (l.wall === 'left' ? -1 : 1)
        && l.z >= sideZ[0] - 1e-6 && l.z <= sideZ[1] + 1e-6;
    if (!onWall) errs.push('lamp-pos');
  });
  if (!(walls.back >= 2 && walls.left >= 1 && walls.right >= 1)) errs.push('lamp-split');
  for (let i = 0; i < HARD.lamps; i++) for (let j = i + 1; j < HARD.lamps; j++) {
    const a = r.lamps[i], b = r.lamps[j];
    if (slotOf(i) !== slotOf(j) && a.wall === b.wall && Math.hypot(a.x - b.x, a.z - b.z) < HARD.slotGap - 1e-6) errs.push('lamp-gap');
  }
  if (errs.length) return errs;
  for (let d = 0; d < HARD.lamps; d++) {
    if (slotOf(d) === slotOf(r.answer)) continue;
    const dev = decoyDeviation(r, d);
    if (Math.max(...dev) < HARD.minMaxDev || dev.reduce((a, b) => a + b, 0) / dev.length < HARD.minMeanDev) errs.push(`decoy${d}`);
  }
  const S = r.lamps[r.answer];
  let fan = 0;
  for (const a of r.objects) for (const b of r.objects) fan = Math.max(fan, angBetween(a.x - S.x, a.z - S.z, b.x - S.x, b.z - S.z));
  if (fan < HARD.minFan) errs.push('fan');
  const G = roundGeometry(r);
  const T = twinTips(r);
  G.objs.forEach((o, i) => {
    if (Math.abs(o.len - T[i].len) < HARD.twinLen * Math.max(o.len, T[i].len)) errs.push('twin-len');
    if (Math.hypot(o.tip.x - T[i].tip.x, o.tip.y - T[i].tip.y) < HARD.twinTip) errs.push('twin-tip');
  });
  G.lamps.forEach((l, i) => {
    if (!inView(l.c, 20)) errs.push('lamp-view');
    if (i >= 2 && !isLo(i) && l.c.x < G.lamps[i - 2].c.x) errs.push('lamp-order');
    if (isLo(i) && l.c.y <= G.lamps[i - 1].c.y) errs.push('lamp-order');
  });
  for (let i = 0; i < HARD.lamps; i++) for (let j = i + 1; j < HARD.lamps; j++) {
    const sep = slotOf(i) === slotOf(j) ? (r.ext === true ? HARD.twinSep : LAMP2.twinSep) : HARD.lampSep;
    if (Math.hypot(G.lamps[i].c.x - G.lamps[j].c.x, G.lamps[i].c.y - G.lamps[j].c.y) < sep) errs.push('lamp-sep');
  }
  G.objs.forEach((o, i) => {
    if (!o.hull.every((p) => inView(p, HARD.edge)) || !o.shadow.every((p) => inView(p, 6))) errs.push('obj-view');
    if (!o.floor.every((q) => Math.abs(q.x) <= yardOf(r).x + 60 && q.z >= yardOf(r).back - 60)) errs.push('shadow-far');
    if (r.ext !== true) {
      const hull = convexHull(o.floor.map((q) => ({ x: q.x, y: q.z })));
      if (WALL_FOOT.some((w) => overlapArea(hull, w) > 0)) errs.push('shadow-wall');
    }
    if (distOutside(o.tip, o.hull) < HARD.tipOut) errs.push('tip-hidden');
    for (let j = 0; j < HARD.objects; j++) {
      if (j === i) continue;
      if (overlapArea(o.hull, G.objs[j].hull) > 0) errs.push('obj-overlap');
      if (distOutside(o.tip, G.objs[j].hull) < HARD.tipClear) errs.push('tip-covered');
    }
    for (const l of G.lamps) {
      const c = circlePoly(l.c, HARD.lampHit);
      if (overlapArea(c, o.hull) > 0 || overlapArea(c, o.shadow) > 0) errs.push('lamp-clutter');
    }
  });
  return errs;
}

export function gate(m) {
  try {
    if (!m || m.task !== 'lamp_from_shadows_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
    if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
    return m.rounds.every((r) => Number.isInteger(r.answer) && r.answer >= 0 && r.answer < HARD.lamps
      && (r.ext === true ? layoutOk(r) : !roundProblems(r).length && ratioOk(r) && lineOk(r)));
  } catch { return false; }
}

const SLOTS = [
  { wall: 'left', z: -22 }, { wall: 'back', x: -80 }, { wall: 'back', x: 0 }, { wall: 'back', x: 80 }, { wall: 'right', z: -22 },
];
const twins = (spots) => spots.flatMap((l) => [{ ...l, y: HARD.lampHi }, { ...l, y: HARD.lampLo }]);
export function sampleLayout(rng) {
  const lamps = twins(SLOTS.map((sl) => (sl.wall === 'back'
    ? { wall: 'back', x: r2(sl.x + rng.uniform(-HARD.jitter, HARD.jitter)), z: YARD.back + HARD.lampOut }
    : { wall: sl.wall, x: (sl.wall === 'left' ? -1 : 1) * (YARD.x - HARD.lampOut), z: r2(sl.z + rng.uniform(-HARD.jitter, HARD.jitter)) })));
  const objects = [];
  for (let t = 0; t < 200 && objects.length < HARD.objects; t++) {
    const rr0 = HARD.objR * Math.sqrt(rng.raw()), th = rng.uniform(0, TAU);
    const o = { kind: rng.pick(KINDS), color: rng.pick(COLORS), x: r2(rr0 * Math.sin(th)), z: r2(HARD.objZ + rr0 * Math.cos(th)), h: r2(rng.uniform(HARD.height[0], HARD.height[1])), yaw: rng.int(0, 89) };
    if (objects.every((p) => Math.hypot(p.x - o.x, p.z - o.z) >= HARD.objGap) && objects.every((p) => p.color !== o.color)) objects.push(o);
  }
  if (objects.length < HARD.objects) return null;
  return { lamps, objects };
}
function sampleLayoutEval(rng, hi, lo, answer) {
  const lamps = SLOTS.map((sl) => (sl.wall === 'back'
    ? { wall: 'back', x: r2(sl.x + rng.uniform(-HARD.jitter, HARD.jitter)), z: YARD.back + HARD.lampOut }
    : { wall: sl.wall, x: (sl.wall === 'left' ? -1 : 1) * (YARD.x - HARD.lampOut), z: r2(sl.z + rng.uniform(-HARD.jitter, HARD.jitter)) }))
    .flatMap((l) => [{ ...l, y: hi }, { ...l, y: lo }]);
  const l = lamps[answer], [d0, d1] = isLo(answer) ? LAMP2.dist.lo : LAMP2.dist.hi;
  const D = Math.exp(rng.uniform(Math.log(d0), Math.log(d1)));
  const nx = l.wall === 'left' ? 1 : l.wall === 'right' ? -1 : 0, nz = l.wall === 'back' ? 1 : 0, th = rng.uniform(-1.2, 1.2);
  const cx = l.x + D * (nx * Math.cos(th) - nz * Math.sin(th)), cz = l.z + D * (nx * Math.sin(th) + nz * Math.cos(th));
  const Rg = LAMP2.region, objects = [];
  for (let t = 0; t < 200 && objects.length < HARD.objects; t++) {
    const rr0 = LAMP2.cluster * Math.sqrt(rng.raw()), ph = rng.uniform(0, TAU);
    const o = { kind: rng.pick(KINDS), color: rng.pick(COLORS), x: r2(cx + rr0 * Math.sin(ph)), z: r2(cz + rr0 * Math.cos(ph)), h: r2(rng.uniform(HARD.height[0], HARD.height[1])), yaw: rng.int(0, 89) };
    if (Math.abs(o.x) > Rg.x || o.z < Rg.z[0] || o.z > Rg.z[1]) continue;
    if (objects.every((p) => Math.hypot(p.x - o.x, p.z - o.z) >= HARD.objGap) && objects.every((p) => p.color !== o.color)) objects.push(o);
  }
  if (objects.length < HARD.objects) return null;
  return { lamps, objects };
}
function genRoundEval(rng) {
  const answer = rng.int(0, HARD.lamps - 1);
  let hi = 0, lo = 0;
  for (let t = 0; t < LAMP2.tries; t++) {
    if (t % 400 === 0) {
      do { hi = r2(rng.uniform(LAMP2.hi[0], LAMP2.hi[1])); lo = r2(rng.uniform(LAMP2.lo[0], LAMP2.lo[1])); } while (hi - lo < LAMP2.minGap);
    }
    const L = sampleLayoutEval(rng, hi, lo, answer);
    if (!L) continue;
    const r = { lamps: L.lamps, objects: L.objects, answer };
    if (!ratioOk(r) || roundProblems(r).length || !lineOk(r)) continue;
    return r;
  }
  return null;
}
function tryRound(rng) {
  const L = sampleLayout(rng);
  if (!L) return null;
  const { lamps, objects } = L;
  if (!layoutOk({ lamps, objects })) return null;
  return { lamps, objects, answer: rng.int(0, HARD.lamps - 1) };
}
const EXT_PATTERNS = [
  [['left', 0.55], ['back', -0.62], ['back', 0], ['back', 0.62], ['right', 0.55]],
  [['left', 0.02], ['left', 0.98], ['back', -0.4], ['back', 0.4], ['right', 0.55]],
  [['left', 0.55], ['back', -0.4], ['back', 0.4], ['right', 0.98], ['right', 0.02]],
  [['left', 0.75], ['back', -0.75], ['back', -0.15], ['back', 0.5], ['right', 0.6]],
];
function extConfig(rng) {
  const yard = { x: r2(rng.uniform(112, 136)), back: r2(-rng.uniform(102, 122)), front: 8, wallH: r2(rng.uniform(114, 126)), wallT: 10 };
  return { yard, cam: null, pattern: rng.int(0, EXT_PATTERNS.length - 1) };
}
function sampleLayoutExt(rng, cfg, split) {
  const Yd = cfg.yard, backX = Yd.x - 28, sideZ = [Yd.back + 26, -8];
  const lamps = twins(EXT_PATTERNS[cfg.pattern].map(([wall, f]) => (wall === 'back'
    ? { wall, x: r2(Math.max(-backX, Math.min(backX, f * backX + rng.uniform(-HARD.jitter, HARD.jitter)))), z: Yd.back + HARD.lampOut }
    : { wall, x: (wall === 'left' ? -1 : 1) * (Yd.x - HARD.lampOut), z: r2(Math.max(sideZ[0], Math.min(sideZ[1], sideZ[1] - f * (sideZ[1] - sideZ[0]) + rng.uniform(-HARD.jitter, HARD.jitter)))) })));
  const kinds = [...KINDS, ...EXT_KINDS.filter((k) => EXT_SPLIT(k) === split)];
  const objects = [];
  for (let t = 0; t < 200 && objects.length < HARD.objects; t++) {
    const rr0 = HARD.objR * Math.sqrt(rng.raw()), th = rng.uniform(0, TAU);
    const o = { kind: rng.pick(kinds), color: rng.pick(COLORS), x: r2(rr0 * Math.sin(th)), z: r2(HARD.objZ + rr0 * Math.cos(th)), h: r2(rng.uniform(HARD.height[0], HARD.height[1])), yaw: rng.int(0, 89) };
    if (objects.every((p) => Math.hypot(p.x - o.x, p.z - o.z) >= HARD.objGap) && objects.every((p) => p.color !== o.color)) objects.push(o);
  }
  if (objects.length < HARD.objects) return null;
  return { ext: true, yard: Yd, lamps, objects };
}
const EVAL_KEYS = new Set([
  'lamp_from_shadows_tap|l*bbbr|12x11|can@4,3;cone@4,4;post@3,4',
  'lamp_from_shadows_tap|l*bbbr|12x11|can@4,5;post@3,4;totem@3,3',
  'lamp_from_shadows_tap|lb*bbr|12x11|can@3,3;crate@3,4;totem@4,4',
  'lamp_from_shadows_tap|lb*bbr|12x11|can@3,3;crate@4,5;totem@4,4',
  'lamp_from_shadows_tap|lb*bbr|12x11|can@3,3;pillar@4,4;post@3,4',
  'lamp_from_shadows_tap|lb*bbr|12x11|can@3,4;can@4,4;pillar@4,3',
  'lamp_from_shadows_tap|lb*bbr|12x11|crate@4,4;totem@3,4;totem@3,5',
  'lamp_from_shadows_tap|lb*bbr|12x11|pillar@3,5;post@3,3;post@4,4',
  'lamp_from_shadows_tap|lb*bbr|12x11|post@4,4;totem@3,4;totem@3,4',
  'lamp_from_shadows_tap|lbb*br|12x11|can@4,4;can@4,5;crate@3,5',
  'lamp_from_shadows_tap|lbb*br|12x11|post@4,4;post@4,4;totem@3,3',
  'lamp_from_shadows_tap|lbbbr*|12x11|cone@4,4;crate@3,4;pillar@3,3',
]);
function genRoundExt(rng, split) {
  let cfg = null;
  for (let t = 0; t < 40000; t++) {
    if (t % 300 === 0) cfg = extConfig(rng);
    const L = sampleLayoutExt(rng, cfg, split);
    if (!L || !layoutOk(L)) continue;
    const r = { ...L, answer: rng.int(0, HARD.lamps - 1) };
    if (EVAL_KEYS.has(semanticKey({ rounds: [r] }))) continue;
    return r;
  }
  throw new Error('lamp_from_shadows_tap: extended generator exhausted');
}
function layoutOk(r) {
  for (let a = 0; a < HARD.lamps; a++) if (roundProblems({ ...r, answer: a }).length) return false;
  return true;
}

const task = {
  meta: {
    name: 'lamp_from_shadows_tap', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'pick', lamp: '0..9 (wall slots left to right, upper lamp then lower lamp); a later pick replaces the earlier one' }],
    promptHuman: 'Tap the lamp that casts these shadows',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return { task: 'lamp_from_shadows_tap', board: { ...BOARD }, ext: true, rounds: [genRoundExt(rng, knobs.ext)] };
    const rounds = [];
    for (let k = 0; k < HARD.rounds; k++) {
      const r = genRoundEval(rng);
      if (!r) throw new Error('lamp_from_shadows_tap: generator exhausted');
      rounds.push(r);
    }
    return { task: 'lamp_from_shadows_tap', board: { ...BOARD }, rounds };
  },

  init() { return { pick: null }; },

  applyAction(state, a) {
    if (a?.op !== 'pick') return { ok: false, reason: 'bad-op' };
    if (!Number.isInteger(a.lamp) || a.lamp < 0 || a.lamp >= HARD.lamps) return { ok: false, reason: 'bad-lamp' };
    state.pick = a.lamp;
    return { ok: true };
  },

  verify(state, m) {
    const answered = state.pick != null, good = answered && state.pick === m.rounds[0].answer;
    return { success: good, error: good ? 0 : 1, partial: good ? 1 : 0, detail: { answered, pick: state.pick } };
  },

  oracle(m) { return [{ op: 'pick', lamp: m.rounds[0].answer }]; },

  randomPolicy(m, rnd) { return [{ op: 'pick', lamp: Math.floor(rnd() * HARD.lamps) }]; },

  async mount(env) {
    env.assets.lfs = null;
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap the lamp that casts these shadows', 'Only one lamp is switched on');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const ri = 0, R = m.rounds[0];
    const q = contextScale(g);
    let cache = env.assets.lfs;
    if (!cache || cache.q !== q || cache.m !== m || cache.ri !== ri) {
      const look = env.style ? env.assets.look : null;
      cache = env.assets.lfs = { q, m, ri, img: look ? renderRoundStyled(R, q, look) : renderRound(R, q), geo: roundGeometry(R) };
    }
    g.save(); g.translate(br.x, br.y);
    blit(g, cache.img);
    if (state.pick != null) {
      const l = cache.geo.lamps[state.pick];
      g.beginPath(); g.arc(l.c.x, l.c.y, 17, 0, TAU);
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || e.y >= VIEW.h) return [];
    const G = roundGeometry(env.manifest.rounds[0]);
    let best = -1, bd = HARD.lampHit;
    G.lamps.forEach((l, i) => { const d = Math.hypot(e.x - l.c.x, e.y - l.c.y); if (d < bd) { bd = d; best = i; } });
    return best >= 0 ? [{ op: 'pick', lamp: best }] : [];
  },

  footerStatus(env) {
    return env.state.pick != null ? '1 selected' : 'Tap a lamp';
  },
};
export default task;

const T_A = lin('#e2dccf'), T_B = lin('#d5cdbd'), GROUT = lin('#b3aa98');
function floorTex(x, z, fp, out) {
  const T = 30, ix = Math.floor(x / T), iz = Math.floor(z / T);
  mixInto(out, T_A, T_B, 0.3 * hash2(ix, iz) + 0.45 * fbm(x * 0.07, z * 0.07, 3, fp * 0.07));
  mixInto(out, out, GROUT, 0.6 * Math.max(lineMask(x, T, 0.35, fp), lineMask(z, T, 0.35, fp)));
}
const MAT_BASE = 3;
const MATS = [
  { c: lin('#e3d8c4'), ks: 0, sh: 1, flat: 0.3 },
  { c: lin('#4d5660'), ks: 0.2, sh: 30, flat: 0.5 },
  { c: lin('#f7f0dc'), ks: 0, sh: 1, emit: 1.0 },
  ...COLORS.map((h) => ({ c: lin(h), ks: 0.18, sh: 26, env: 0.05 })),
];
function rtShape(p) {
  const m = p.id >= 90 ? 0 : p.id >= 40 ? (p.k === 0 ? 2 : 1) : MAT_BASE + COLORS.indexOf(p.color);
  let s;
  if (p.k === 0) s = shape.sphere(p.id, m, p.c.x, p.c.y, p.c.z, p.r);
  else if (p.k === 1) s = shape.box(p.id, m, p.x, p.y0 + p.h / 2, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, p.id >= 90 ? 0.8 : Math.min(1.5, p.h / 6));
  else s = p.r0 === p.r1 ? shape.cyl(p.id, m, p.x, p.z, p.y0, p.y1, p.r0, Math.min(1.5, p.r0 / 4)) : shape.frustum(p.id, m, p.x, p.z, p.y0, p.y1, p.r0, p.r1);
  if (p.noShadow) { s.noShadow = true; s.noAO = true; }
  return s;
}
function renderRound(r, q) {
  const c = camOf(r), v = (o) => [o.x, o.y, o.z];
  const cam = camFromBasis({ eye: v(c.eye), F: v(c.f), R: v(c.r), U: v(c.u), f: c.fov, cx: c.cx, cy: c.cy, W: VIEW.w, H: VIEW.h });
  const prims = [];
  r.objects.forEach((o, i) => prims.push(...objectPrims(o, 10 + 2 * i)));
  r.lamps.forEach((l, i) => prims.push(...lampPrims(l, 40 + 3 * i)));
  prims.push(...wallPrims(yardOf(r)));
  const L = lampLight(r.lamps[r.answer]);
  const sc = makeScene({ cam, shapes: prims.map(rtShape), mats: MATS,
    env: { floorY: 0, floor: floorTex, floorMat: { ks: 0, sh: 1, flat: 0.5 }, sky: (dx, dy, dz, out) => { out[0] = 0.86; out[1] = 0.86; out[2] = 0.87; } },
    light: { pos: [L.x, L.y, L.z], radius: 2.5, col: [1.15, 1.1, 1.0], sky: [0.42, 0.42, 0.44], ground: [0.24, 0.22, 0.2],
      fill: { dir: [0.25, 0.9, 0.55], col: [0.32, 0.31, 0.3] }, aoK: 0.7, contact: 0.3, contactH: 3 } });
  return render(sc, q);
}

const PAVE_USES = ['floor', 'stone', 'wood', 'terrain'];
const WALL_USES = ['wall', 'stone', 'wood', 'roof'];
const OBJ_FAMS = ['plastic', 'wood', 'stone', 'metal', 'concrete'];
const BRACKETS = ['#3f454c', '#1f2124', '#8a6a3a', '#d8d6d0', '#5b4a3a'];
const GLOBES = ['#f7f0dc', '#fff8ec', '#f3e3c0', '#eef2f4'];
async function styleLook(style) {
  const rnd = style.rand;
  const paves = style.pool('tex', (t) => PAVE_USES.includes(t.use)), walls = style.pool('tex', (t) => WALL_USES.includes(t.use));
  const SP = (name, items) => LK.splitPool(style, `lamp_from_shadows_tap|${name}`, items);
  const fams = SP('objects', OBJ_FAMS), brackets = SP('bracket', BRACKETS), globes = SP('globe', GLOBES);
  const [pi, wi, oi] = style.primaryCombo('pave-wall-objects', [paves.length, walls.length, fams.length]);
  const pave = paves[pi], wall = walls[wi], fam = fams[oi];
  const outside = LK.pickFrom(style.pool('tex', (t) => t.use === 'terrain' || t.use === 'floor'), rnd());
  const pool = fam === 'plastic' ? [] : LK.familyPool(style, fam), objItem = pool.length ? LK.pickFrom(pool, rnd()) : null;
  const hd = style.pick('hdri');
  for (const it of [pave, wall, outside, objItem]) if (it) style.note(`tex:${it.id}`);
  style.note(`objects:${fam}`); style.note(`hdri:${hd.id}`);
  const load = (it) => (it ? LK.loadTex(it) : null);
  const [Tp, Tw, To, Tob, sky] = await Promise.all([load(pave), load(wall), load(outside), load(objItem), S3.loadSky(hd.sky)]);
  const pLum = 0.3 + 0.25 * rnd();
  let face = S3.scaleTo(S3.limitSat(Tp.mean, 0.2), pLum);
  const temp = { 'outdoor-midday': [1, 0.95, 0.88], 'morning-afternoon': [1, 0.9, 0.78], sunset: [1, 0.84, 0.66], overcast: [0.97, 0.98, 1], urban: [1, 0.93, 0.85], indoor: [1, 0.9, 0.78], studio: [1, 0.97, 0.94] }[hd.use] || [1, 1, 1];
  const up = S3.safeTint(S3.shIrradiance(hd.sh9_norm, 0, 1, 0), { maxSat: 0.18 });
  return {
    pave: S3.texTileFloor({ tex: Tp, tile: 30, face, grout: face.map((v) => v * 0.62), cv: 0.12, texWorld: 30, groutHW: 0.35, groutK: 0.9, salt: 1 + Math.floor(rnd() * 997) }),
    outside: LK.texSurface(To, { lumTarget: 0.08 + 0.14 * rnd(), k: 0.8, maxSat: 0.3, unit: 120, rot: rnd() * Math.PI }),
    wallMat: LK.texMat(Tw, { lumTarget: 0.35 + 0.3 * rnd(), cv: 0.22, maxSat: 0.18, unit: 70, cam: null, ks: 0, sh: 1, env: 0, flat: 0.3, fixedFp: 0.4 }),
    bracket: lin(brackets[Math.floor(rnd() * brackets.length)]), globe: lin(globes[Math.floor(rnd() * globes.length)]),
    fam, Tob, objCv: fam === 'metal' ? 0.12 : 0.22,
    col: S3.scaleTo(temp, S3.lum([1.15, 1.1, 1.0])), sky: S3.scaleTo(up, S3.lum([0.42, 0.42, 0.44]) * (0.9 + 0.2 * rnd())), ground: S3.scaleTo(S3.limitSat(face, 0.15), S3.lum([0.24, 0.22, 0.2])),
    skyFn: S3.skyFn(sky, 0.8, 0.15),
  };
}
function renderRoundStyled(r, q, look) {
  const c = camOf(r), v = (o) => [o.x, o.y, o.z];
  const cam = camFromBasis({ eye: v(c.eye), F: v(c.f), R: v(c.r), U: v(c.u), f: c.fov, cx: c.cx, cy: c.cy, W: VIEW.w, H: VIEW.h });
  const prims = [];
  r.objects.forEach((o, i) => prims.push(...objectPrims(o, 10 + 2 * i)));
  r.lamps.forEach((l, i) => prims.push(...lampPrims(l, 40 + 3 * i)));
  prims.push(...wallPrims(yardOf(r)));
  const L = lampLight(r.lamps[r.answer]), Yd = yardOf(r);
  const wallM = { ...look.wallMat }, wt = wallM.tex;
  wallM.tex = (x, y, z, nx, ny, nz, sh, out) => wt(x, y, z, nx, ny, nz, sh, out, cam);
  const mats = [
    wallM,
    { c: look.bracket, ks: 0.2, sh: 30, flat: 0.5 },
    { c: look.globe, ks: 0, sh: 1, emit: 1.0 },
    ...COLORS.map((h) => (look.fam === 'plastic' || !look.Tob ? { c: lin(h), ks: 0.3, sh: 40, env: 0.06 }
      : LK.texMat(look.Tob, { tint: lin(h), cv: look.objCv, unit: 40, cam, ks: look.fam === 'metal' ? 0.45 : 0.1, sh: look.fam === 'metal' ? 50 : 22, env: look.fam === 'metal' ? 0.1 : 0.03 }))),
  ];
  const floor = (x, z, fp, out) => (Math.abs(x) <= Yd.x + Yd.wallT && z >= Yd.back - Yd.wallT ? look.pave(x, z, fp, out) : look.outside(x, z, fp, out));
  const sc = makeScene({ cam, shapes: prims.map(rtShape), mats,
    env: { floorY: 0, floor, floorMat: { ks: 0, sh: 1, flat: 0.5 }, sky: look.skyFn },
    light: { pos: [L.x, L.y, L.z], radius: 2.5, col: look.col, sky: look.sky, ground: look.ground,
      fill: { dir: [0.25, 0.9, 0.55], col: [0.32, 0.31, 0.3] }, aoK: 0.7, contact: 0.3, contactH: 3 } });
  return render(sc, q);
}

export const __renderParts = { rtShape, objectPrims, renderRound, roundProblems, twinTips };

export function semanticKey(m) {
  const r = m.rounds[0], cam = camOf(r), Yd = yardOf(r), q = (v, s) => Math.floor(v / s);
  const lamps = r.lamps.map((l, i) => `${l.wall[0]}${isLo(i) ? 'L' : 'H'}${i === r.answer ? '*' : ''}`).join('');
  const objs = r.objects.map((o) => { const p = cam.project({ x: o.x, y: 0, z: o.z }); return `${o.kind}@${q(p.x, VIEW.w / 8)},${q(p.y, VIEW.h / 8)}`; }).sort();
  return `lamp_from_shadows_tap|${lamps}|${Math.round(Yd.x / 10)}x${Math.round(-Yd.back / 10)}|${objs.join(';')}`;
}
