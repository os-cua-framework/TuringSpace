import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, makeCam, objectStats, shape } from '../common/_seat_view_rt.js';
import { builder, sofa, bed, plant, carton, ball, chair, roomEnv, sceneOf, LIGHT } from '../common/_seat_view_props.js';
import { lowShelf, LOW_SHELF } from '../common/_two_view_where_props.js';

const PW = 380, PH = 160, P2Y = 166;
const RW = 9.0, RD = 7.2, NC = 6, NR = 6, CW = RW / NC, CD = RD / NR;
const S = 40;
const PX0 = PW + 18, PY0 = 4;
const PLAN = { x: PX0, y: PY0, w: RW * S, h: RD * S };
const LEG_Y = PY0 + RD * S + 16, LEG_DY = 22, LEG_DX = 122;
const BOARD = { w: PX0 + RW * S + 4, h: LEG_Y + LEG_DY + 12 };
const EYE = 1.6, HFOV = 78, PITCH = [6, 30];
const FOCAL = (PW / 2) / Math.tan((HFOV / 2) * Math.PI / 180);
const FOVY = 2 * Math.atan((PH / 2) / FOCAL) * 180 / Math.PI;
const WALL_H = 2.4, WALL_T = 0.1;
const HARD = Object.freeze({
  headDiff: 60, inM: 8, outM: 16, vis: 0.85, lMinW: 60, sepPx: 34,
  yCx: 0.3, yCz: 0.2, heurM: 0.2, rotErr: 15, depErr: [0.75, 1.33], latErr: [0.8, 1.2], gapBehind: 1.5,
  frontClear: 1.3, frontAz: 75, sideDiff: 50, camClear: 0.6, camMinD: 1.6, camMaxD: 6.6, wallM: 0.3, wallC: 0.18, wallO: 0.12,
});

const L_KINDS = ['sofa', 'bookcase', 'bed'];
const O_KINDS = ['plant', 'box', 'ball', 'chair'];
const NAME = { sofa: 'sofa', bookcase: 'bookcase', bed: 'bed', plant: 'plant', box: 'box', ball: 'ball', chair: 'chair' };
const FOOT = { sofa: [0.95, 0.43], bookcase: [LOW_SHELF.hw, LOW_SHELF.hd], bed: [0.75, 1.03], plant: [0.27, 0.27], box: [0.3, 0.25], ball: [0.22, 0.22], chair: [0.23, 0.23] };
const ID = { L: 1, X: 2, Y: 3, D: 10, WALL: 90 };
const N_DIS = [2, 3];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const norm360 = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; };
const bearingTo = (dx, dz) => norm360(deg(Math.atan2(dx, dz)));

const cellOf = (x, z) => (x < 0 || z < 0 || x >= RW || z >= RD) ? null : { c: Math.floor(x / CW), r: Math.floor(z / CD) };
const sameCell = (a, b) => !!a && !!b && a.c === b.c && a.r === b.r;
function distToCell(x, z, cell) {
  const x0 = cell.c * CW, z0 = cell.r * CD;
  const dx = Math.max(x0 - x, 0, x - (x0 + CW)), dz = Math.max(z0 - z, 0, z - (z0 + CD));
  return Math.hypot(dx, dz);
}
function frameOf(cam) { const h = rad(cam.yaw); return { f: [Math.sin(h), Math.cos(h)], r: [-Math.cos(h), Math.sin(h)] }; }
function footprintRect(o) {
  const [a, b] = FOOT[o.kind], q = ((Math.round(norm360(o.yaw ?? 0) / 90) % 2) + 2) % 2;
  const hx = q ? b : a, hz = q ? a : b;
  return { x0: o.x - hx, x1: o.x + hx, z0: o.z - hz, z1: o.z + hz };
}
function frontClear(L) {
  const R = footprintRect(L), q = ((Math.round(norm360(L.yaw) / 90) % 4) + 4) % 4;
  return [RD - R.z1, RW - R.x1, R.z0, R.x0][q];
}
function sideAz(L, c) { return ((bearingTo(c.x - L.x, c.z - L.z) - L.yaw + 540) % 360) - 180; }
function rectGap(a, b) {
  const dx = Math.max(a.x0 - b.x1, 0, b.x0 - a.x1), dz = Math.max(a.z0 - b.z1, 0, b.z0 - a.z1);
  return Math.hypot(dx, dz);
}
const pointRectGap = (x, z, R) => Math.hypot(Math.max(R.x0 - x, 0, x - R.x1), Math.max(R.z0 - z, 0, z - R.z1));

function addThing(B, id, o) {
  const a = { x: o.x, z: o.z, yaw: o.yaw ?? 0 };
  switch (o.kind) {
    case 'sofa': sofa(B, id, { ...a, col: '#a9674a', hw: 0.95 }); break;
    case 'bookcase': lowShelf(B, id, { ...a, col: '#3f8f97' }); break;
    case 'bed': bed(B, id, { ...a, col: '#6f86bf' }); break;
    case 'plant': plant(B, id, { x: o.x, z: o.z, scale: 1.3 }); break;
    case 'box': carton(B, id, { ...a, hx: 0.3, hy: 0.25, hz: 0.25 }); break;
    case 'ball': ball(B, id, { x: o.x, z: o.z, r: 0.22, col: '#e04b3c' }); break;
    case 'chair': chair(B, id, { ...a, col: '#4f9a62' }); break;
    default: throw new Error('two_view_where: kind ' + o.kind);
  }
}
function addWalls(B) {
  const m = B.mat('matte', '#ece6db'), base = B.mat('matte', '#f7f4ee'), t = WALL_T / 2;
  const walls = [[RW / 2, -t, RW / 2 + WALL_T, t], [RW / 2, RD + t, RW / 2 + WALL_T, t], [-t, RD / 2, t, RD / 2], [RW + t, RD / 2, t, RD / 2]];
  for (const [cx, cz, hx, hz] of walls) {
    B.add(shape.box(ID.WALL, m, cx, WALL_H / 2, cz, hx, WALL_H / 2, hz));
    B.add(shape.box(ID.WALL, base, cx, 0.04, cz, hx + (hx < hz ? 0.008 : 0), 0.04, hz + (hz < hx ? 0.008 : 0)));
  }
}
function camOf(c) {
  const h = rad(c.yaw), p = rad(c.pitch), eye = [c.x, EYE, c.z];
  return makeCam({ eye, target: [c.x + Math.sin(h) * Math.cos(p), EYE - Math.sin(p), c.z + Math.cos(h) * Math.cos(p)], fovY: FOVY, W: PW, H: PH });
}
const ENV = roomEnv({});
const PHOTO_LIGHT = { ...LIGHT, sky: [0.52, 0.52, 0.54] };
const CACHE = new WeakMap();
function scenesOf(m) {
  if (CACHE.has(m)) return CACHE.get(m);
  const B = builder();
  addThing(B, ID.L, m.L); addThing(B, ID.X, m.X); addThing(B, ID.Y, m.Y);
  m.D.forEach((d, k) => addThing(B, ID.D + k, d));
  addWalls(B);
  const sc = m.cams.map((c) => sceneOf(B, camOf(c), ENV, PHOTO_LIGHT));
  const out = { B, sc };
  CACHE.set(m, out);
  return out;
}
function aabbOf(B, id) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const s of B.shapes) if (s.id === id) { const b = s.bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
  return [x0, y0, z0, x1, y1, z1];
}
function inFrame(cam, bb, M) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    const p = cam.project(c & 1 ? bb[3] : bb[0], c & 2 ? bb[4] : bb[1], c & 4 ? bb[5] : bb[2]);
    if (p.z < 0.3) return null;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  if (x0 < M || x1 > PW - M || y0 < M || y1 > PH - M) return null;
  return [x0, y0, x1, y1];
}
function outOfFrame(cam, bb, M) {
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
    const x = bb[0] + (bb[3] - bb[0]) * i / 4, y = bb[1] + (bb[4] - bb[1]) * j / 4, z = bb[2] + (bb[5] - bb[2]) * k / 4;
    const p = cam.project(x, y, z);
    if (p.z <= 0.02) continue;
    if (p.x > -M && p.x < PW + M && p.y > -M && p.y < PH + M) return false;
  }
  return true;
}

function offsetIn(cam, o, L) {
  const F = frameOf(cam), dx = o.x - L.x, dz = o.z - L.z;
  return { lat: dx * F.r[0] + dz * F.r[1], dep: dx * F.f[0] + dz * F.f[1] };
}
function placeIn(cam, L, lat, dep) { const F = frameOf(cam); return { x: L.x + lat * F.r[0] + dep * F.f[0], z: L.z + lat * F.r[1] + dep * F.f[1] }; }
export function heuristics(m) {
  const [c1, c2] = m.cams, L = m.L, Y = m.Y, { lat, dep } = offsetIn(c2, Y, L);
  const cam1 = camOf(c1), cam2 = camOf(c2), py = cam2.project(Y.x, 0, Y.z);
  const north = { yaw: 180 };
  const d = (() => {
    const a = py.x - cam1.cx, b = cam1.cy - py.y, F = cam1.F, R = cam1.R, U = cam1.U, f = cam1.f;
    return [F[0] * f + R[0] * a + U[0] * b, F[1] * f + U[1] * b, F[2] * f + R[2] * a + U[2] * b];
  })();
  const t = d[1] < -1e-9 ? -EYE / d[1] : Infinity;
  return {
    samePhoto: placeIn(c1, L, lat, dep),
    mirror: placeIn(c2, L, -lat, dep),
    swapLR: placeIn(c1, L, -lat, dep),
    northUp: placeIn(north, L, lat, dep),
    screen: { x: (py.x / PW) * RW, z: (py.y / PH) * RD },
    cam1Ray: Number.isFinite(t) ? { x: c1.x + d[0] * t, z: c1.z + d[2] * t } : { x: -99, z: -99 },
    onL: { x: L.x, z: L.z },
    onX: { x: m.X.x, z: m.X.z },
    farX: planPick(m, (c) => Math.hypot(c.x - m.X.x, c.z - m.X.z)),
    oppX: (() => { const x = Math.min(RW - 0.01, Math.max(0.01, 2 * L.x - m.X.x)), z = Math.min(RD - 0.01, Math.max(0.01, 2 * L.z - m.X.z)); return { x, z }; })(),
    farXL: planPick(m, (c) => Math.hypot(c.x - m.X.x, c.z - m.X.z) + Math.hypot(c.x - L.x, c.z - L.z)),
    farAll: planPick(m, (c) => Math.min(...pieces(m).map((o) => Math.hypot(c.x - o.x, c.z - o.z)))),
    farNotL: planPick(m, (c) => Math.min(...pieces(m).filter((o) => o !== L).map((o) => Math.hypot(c.x - o.x, c.z - o.z)))),
    nearL: planPick(m, (c) => -Math.hypot(c.x - L.x, c.z - L.z)),
    ...Object.fromEntries(AWAY_X.map((k) => { const dx = L.x - m.X.x, dz = L.z - m.X.z, d = Math.hypot(dx, dz) || 1; return [`awayX${k}`, { x: L.x + dx / d * k, z: L.z + dz / d * k }]; })),
  };
}
const AWAY_X = [1, 1.5, 2, 2.5, 3];
const pieces = (m) => [m.L, m.X, ...m.D];
const CELL_KEYS = new Set(['onL', 'onX', 'farX', 'farXL', 'farAll', 'farNotL', 'nearL']);
export function planCells(m) {
  const taken = pieces(m).map((o) => cellOf(o.x, o.z)), out = [];
  for (let c = 0; c < NC; c++) for (let r = 0; r < NR; r++) if (!taken.some((t) => sameCell({ c, r }, t))) out.push({ c, r, x: (c + 0.5) * CW, z: (r + 0.5) * CD });
  return out;
}
function planPick(m, score) { let best = null, bs = -Infinity; for (const c of planCells(m)) { const v = score(c); if (v > bs) { bs = v; best = c; } } return { x: best.x, z: best.z }; }
export function heuristicHits(m) {
  const cell = cellOf(m.Y.x, m.Y.z), H = heuristics(m), out = {};
  for (const [k, p] of Object.entries(H)) {
    if (CELL_KEYS.has(k)) out[k] = sameCell(cellOf(p.x, p.z), cell);
    else {
      const x = Math.min(RW - 0.01, Math.max(0.01, p.x)), z = Math.min(RD - 0.01, Math.max(0.01, p.z));
      out[k] = distToCell(x, z, cell) < HARD.heurM;
    }
  }
  return out;
}
function humanMarginOk(m) {
  const c2 = m.cams[1], L = m.L, cell = cellOf(m.Y.x, m.Y.z), { lat, dep } = offsetIn(c2, m.Y, L);
  const trials = [];
  for (const s of [-1, 1]) trials.push({ yaw: c2.yaw + s * HARD.rotErr, lat, dep });
  for (const k of HARD.depErr) trials.push({ yaw: c2.yaw, lat, dep: dep * k });
  for (const k of HARD.latErr) trials.push({ yaw: c2.yaw, lat: lat * k, dep });
  for (const s of [-1, 1]) for (const k of HARD.depErr) trials.push({ yaw: c2.yaw + s * HARD.rotErr * 0.6, lat, dep: dep * (1 + (k - 1) * 0.6) });
  return trials.every((t) => { const p = placeIn({ yaw: t.yaw }, L, t.lat, t.dep); return sameCell(cellOf(p.x, p.z), cell); });
}
export function wallBehind(m) {
  const c = m.cams[1], Y = m.Y, dx = Y.x - c.x, dz = Y.z - c.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (RW - c.x) / ux);
  if (ux < -1e-9) t = Math.min(t, -c.x / ux);
  if (uz > 1e-9) t = Math.min(t, (RD - c.z) / uz);
  if (uz < -1e-9) t = Math.min(t, -c.z / uz);
  const k = Math.max(d, t - 0.3);
  return { gap: t - d, at: { x: c.x + ux * k, z: c.z + uz * k } };
}
function wallMisreadCosts(m) {
  const w = wallBehind(m);
  return w.gap < HARD.gapBehind && !sameCell(cellOf(w.at.x, w.at.z), cellOf(m.Y.x, m.Y.z));
}

function layoutProblems(m) {
  const P = [];
  if (!m || m.task !== 'two_view_where' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['task'];
  const { L, X, Y, cams, D } = m;
  if (!L || !X || !Y || !Array.isArray(cams) || cams.length !== 2) return ['shape'];
  if (!Array.isArray(D) || D.length < N_DIS[0] || D.length > N_DIS[1]) return ['shape'];
  if (!L_KINDS.includes(L.kind) || !O_KINDS.includes(X.kind) || !O_KINDS.includes(Y.kind) || X.kind === Y.kind) return ['kinds'];
  const all = [L, X, Y, ...D];
  if (D.some((d) => !FOOT[d.kind]) || new Set(all.map((o) => o.kind)).size !== all.length) return ['kinds'];
  for (const o of all) {
    const R = footprintRect(o), w = o === L || (o !== X && o !== Y && L_KINDS.includes(o.kind)) ? HARD.wallM : HARD.wallO;
    if (R.x0 < w - 1e-6 || R.z0 < w - 1e-6 || R.x1 > RW - w + 1e-6 || R.z1 > RD - w + 1e-6) P.push(`wall-${o.kind}`);
  }
  const RL = footprintRect(L), RX = footprintRect(X), RY = footprintRect(Y), RD_ = D.map(footprintRect);
  if (rectGap(RL, RX) < 0.5 || rectGap(RL, RY) < 0.5 || rectGap(RX, RY) < 0.8) P.push('crowded');
  RD_.forEach((R, k) => { for (const Q of [RL, RX, RY, ...RD_.slice(k + 1)]) if (rectGap(R, Q) < 0.5) P.push('crowded-D'); });
  if (D.some((d) => sameCell(cellOf(d.x, d.z), cellOf(Y.x, Y.z)))) P.push('D-in-Y-cell');
  const cell = cellOf(Y.x, Y.z);
  if (!cell || !sameCell(cell, m.answer)) P.push('answer');
  else {
    const cx = (cell.c + 0.5) * CW, cz = (cell.r + 0.5) * CD;
    if (Math.abs(Y.x - cx) > HARD.yCx + 1e-6 || Math.abs(Y.z - cz) > HARD.yCz + 1e-6) P.push('y-off-centre');
  }
  if (angDiff(cams[0].yaw, cams[1].yaw) < HARD.headDiff - 1e-6) P.push('headings-close');
  if (frontClear(L) < HARD.frontClear - 1e-6) P.push('L-faces-wall');
  const az = cams.map((c) => sideAz(L, c));
  if (Math.min(Math.abs(az[0]), Math.abs(az[1])) > HARD.frontAz + 1e-6) P.push('L-front-unseen');
  if (angDiff(az[0], az[1]) < HARD.sideDiff - 1e-6) P.push('L-same-side');
  for (const c of cams) {
    if (c.x < HARD.wallC || c.z < HARD.wallC || c.x > RW - HARD.wallC || c.z > RD - HARD.wallC) P.push('cam-wall');
    if (c.pitch < PITCH[0] - 1e-6 || c.pitch > PITCH[1] + 1e-6) P.push('cam-pitch');
    for (const R of [RL, RX, RY, ...RD_]) if (pointRectGap(c.x, c.z, R) < HARD.camClear) P.push('cam-clear');
  }
  const seen = [[L, X], [L, Y]];
  cams.forEach((c, k) => {
    for (const o of seen[k]) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < HARD.camMinD || d > HARD.camMaxD) P.push(`dist${k}`); }
  });
  const hits = heuristicHits(m);
  for (const [k, v] of Object.entries(hits)) if (v) P.push(`heur-${k}`);
  if (!humanMarginOk(m)) P.push('human-margin');
  if (wallMisreadCosts(m)) P.push('y-near-wall-behind');
  return P;
}
function photoProblems(m) {
  const P = [], { B, sc } = scenesOf(m);
  const bb = { L: aabbOf(B, ID.L), X: aabbOf(B, ID.X), Y: aabbOf(B, ID.Y) };
  const plan = [['L', 'X', 'Y'], ['L', 'Y', 'X']];
  m.D.forEach((d, k) => { if (!outOfFrame(sc[1].cam, aabbOf(B, ID.D + k), HARD.outM)) P.push(`leak-D${k}`); });
  sc.forEach((s, k) => {
    const cam = s.cam, [l, show, hide] = plan[k];
    const bl = inFrame(cam, bb[l], HARD.inM), bs = inFrame(cam, bb[show], HARD.inM);
    if (!bl) P.push(`frame-L${k}`);
    if (!bs) P.push(`frame-${show}${k}`);
    if (!outOfFrame(cam, bb[hide], HARD.outM)) P.push(`leak-${hide}${k}`);
    if (bl && bl[2] - bl[0] < HARD.lMinW) P.push(`small-L${k}`);
    if (P.length) return;
    const pl = cam.project(m.L.x, 0.4, m.L.z), o = m[show], ps = cam.project(o.x, 0.3, o.z);
    if (Math.hypot(pl.x - ps.x, pl.y - ps.y) < HARD.sepPx) P.push(`sep${k}`);
    for (const [id, name] of [[ID.L, 'L'], [ID[show], show]]) {
      const st = objectStats(s, id, 2, true);
      if (st.frac < HARD.vis) P.push(`occluded-${name}${k}`);
    }
  });
  return P;
}
export function contractProblems(m) {
  const P = layoutProblems(m);
  if (P.length) return P;
  return photoProblems(m);
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

function sampleL(rng, kind) {
  const yaw = rng.pick([0, 90, 180, 270]), L = sampleThing(rng, kind, [yaw]);
  if (rng.uniform(0, 1) < (kind === 'bed' ? 0.75 : 0.5)) {
    const R = footprintRect(L), gap = rng.uniform(HARD.wallM, HARD.wallM + 0.1), q = Math.round(yaw / 90) % 4;
    if (q === 0) L.z = r2(L.z - (R.z0 - gap));
    else if (q === 1) L.x = r2(L.x - (R.x0 - gap));
    else if (q === 2) L.z = r2(L.z + (RD - gap - R.z1));
    else L.x = r2(L.x + (RW - gap - R.x1));
  }
  return frontClear(L) >= HARD.frontClear ? L : null;
}
function sampleThing(rng, kind, yawSet = null) {
  const yaw = yawSet ? rng.pick(yawSet) : r1(rng.uniform(0, 360));
  const [a, b] = FOOT[kind], q = Math.round(yaw / 90) % 2, hx = q ? b : a, hz = q ? a : b;
  const M = (yawSet ? HARD.wallM : HARD.wallO) + 0.02;
  return { kind, x: r2(rng.uniform(M + hx, RW - M - hx)), z: r2(rng.uniform(M + hz, RD - M - hz)), yaw };
}
const HEIGHT = { sofa: 0.86, bookcase: LOW_SHELF.h, bed: 1.12, plant: 1.1, box: 0.5, ball: 0.44, chair: 0.92 };
function cornersOf(o) {
  const R = footprintRect(o), [a, b] = FOOT[o.kind], free = !['sofa', 'bookcase', 'bed'].includes(o.kind);
  const e = free ? Math.hypot(a, b) : 0;
  return [[R.x0 - e * 0.3, R.z0 - e * 0.3], [R.x1 + e * 0.3, R.z0 - e * 0.3], [R.x0 - e * 0.3, R.z1 + e * 0.3], [R.x1 + e * 0.3, R.z1 + e * 0.3]];
}
function approxBB(o) {
  const C = cornersOf(o);
  return [Math.min(...C.map((p) => p[0])), 0, Math.min(...C.map((p) => p[1])), Math.max(...C.map((p) => p[0])), HEIGHT[o.kind] + 0.05, Math.max(...C.map((p) => p[1]))];
}
function hiddenFrom(c, o) { return outOfFrame(camOf(c), approxBB(o), HARD.outM + 1); }
function aimCam(rng, a, b, avoid, hide, yawAway = null) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, half = HFOV / 2 - 6, vhalf = FOVY / 2 - 3.5;
  for (let t = 0; t < 80; t++) {
    const x = r2(rng.uniform(HARD.wallC + 0.01, RW - HARD.wallC - 0.01)), z = r2(rng.uniform(HARD.wallC + 0.01, RD - HARD.wallC - 0.01));
    if (avoid.some((R) => pointRectGap(x, z, R) < HARD.camClear + 0.05)) continue;
    if ([a, b].some((o) => { const d = Math.hypot(o.x - x, o.z - z); return d < HARD.camMinD + 0.05 || d > HARD.camMaxD - 0.05; })) continue;
    const b0 = bearingTo(mx - x, mz - z);
    let lo = Infinity, hi = -Infinity;
    for (const o of [a, b]) for (const [cx, cz] of cornersOf(o)) { let d = bearingTo(cx - x, cz - z) - b0; d = ((d + 540) % 360) - 180; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    if (hi - lo > 2 * half) continue;
    const slack = half - (hi - lo) / 2;
    let u = rng.uniform(-1, 1);
    if (hide) { let dh = bearingTo(hide.x - x, hide.z - z) - b0; dh = ((dh + 540) % 360) - 180; const away = -Math.sign(dh - (lo + hi) / 2) || 1; u = away * rng.uniform(0.5, 1); }
    const yaw = r1(norm360(b0 + (lo + hi) / 2 + u * slack));
    if (yawAway != null && angDiff(yaw, yawAway) < HARD.headDiff + 1) continue;
    const h = rad(yaw), fx = Math.sin(h), fz = Math.cos(h);
    let elo = Infinity, ehi = -Infinity;
    for (const o of [a, b]) for (const [cx, cz] of cornersOf(o)) {
      const dep = (cx - x) * fx + (cz - z) * fz;
      if (dep < 0.5) { elo = -Infinity; break; }
      elo = Math.min(elo, deg(Math.atan2(-EYE, dep))); ehi = Math.max(ehi, deg(Math.atan2(HEIGHT[o.kind] - EYE, dep)));
    }
    if (!(ehi - elo <= 2 * vhalf)) continue;
    const pitch = r1(-(elo + ehi) / 2 + rng.uniform(-1, 1) * Math.min(2, vhalf - (ehi - elo) / 2));
    if (pitch < PITCH[0] || pitch > PITCH[1]) continue;
    if (hide && !hiddenFrom({ x, z, yaw, pitch }, hide)) continue;
    return { x, z, yaw, pitch };
  }
  return null;
}
let KEEP = null;
export function _setKeep(k) { KEEP = k; }
const RANK_CAP = 9;
export function planRankTable(m) {
  const cs = planCells(m), ox = 2 * m.L.x - m.X.x, oz = 2 * m.L.z - m.X.z;
  const rank = (f) => { const o = cs.slice().sort((a, b) => f(b) - f(a)); return (c) => Math.min(RANK_CAP, o.indexOf(c)); };
  const far = rank((c) => Math.hypot(c.x - m.X.x, c.z - m.X.z)), near = rank((c) => -Math.hypot(c.x - m.L.x, c.z - m.L.z)), opp = rank((c) => -Math.hypot(c.x - ox, c.z - oz));
  return cs.map((c) => ({ c: c.c, r: c.r, far: far(c), near: near(c), opp: opp(c), cell: c.r * NC + c.c }));
}
export function planRanks(m) {
  return planRankTable(m).find((t) => t.c === m.answer.c && t.r === m.answer.r);
}
const RBIN = (r) => (r <= 3 ? r : r <= 5 ? 4 : r <= 8 ? 5 : 6);
export const jointIndex = (t) => RBIN(t.far) * 49 + RBIN(t.near) * 7 + RBIN(t.opp);
function sampleY(rng, kind, cell, RL) {
  const y = { kind, x: r2((cell.c + 0.5) * CW + rng.uniform(-HARD.yCx, HARD.yCx)), z: r2((cell.r + 0.5) * CD + rng.uniform(-HARD.yCz, HARD.yCz)), yaw: r1(rng.uniform(0, 360)) };
  const R = footprintRect(y), w = HARD.wallO;
  if (R.x0 < w || R.z0 < w || R.x1 > RW - w || R.z1 > RD - w || rectGap(RL, R) < 0.5) return null;
  return y;
}
function earlyProblems(L, Y, c2, cell) {
  const m = { L, Y, cams: [null, c2] };
  if (!humanMarginOk(m)) return true;
  if (wallMisreadCosts(m)) return true;
  const { lat, dep } = offsetIn(c2, Y, L), py = camOf(c2).project(Y.x, 0, Y.z);
  for (const p of [placeIn(c2, L, -lat, dep), placeIn({ yaw: 180 }, L, lat, dep), { x: (py.x / PW) * RW, z: (py.y / PH) * RD }]) {
    const x = Math.min(RW - 0.01, Math.max(0.01, p.x)), z = Math.min(RD - 0.01, Math.max(0.01, p.z));
    if (distToCell(x, z, cell) < HARD.heurM) return true;
  }
  return false;
}
function sampleD(rng, kind, c2, edge) {
  let d = L_KINDS.includes(kind) ? sampleL(rng, kind) : sampleThing(rng, kind);
  if (!d) return null;
  if (edge) {
    const b = rad(c2.yaw + rng.sign() * (HFOV / 2 + rng.uniform(8, 26))), r = rng.uniform(1.5, 5.5);
    d = { ...d, x: r2(c2.x + Math.sin(b) * r), z: r2(c2.z + Math.cos(b) * r) };
  }
  const F = footprintRect(d), w = (L_KINDS.includes(kind) ? HARD.wallM : HARD.wallO) + 0.02;
  if (F.x0 < w || F.z0 < w || F.x1 > RW - w || F.z1 > RD - w) return null;
  if (L_KINDS.includes(kind) && frontClear(d) < HARD.frontClear) return null;
  return d;
}
function tryBuild(rng) {
  const lk = rng.pick(L_KINDS), [xk, yk] = rng.shuffle(O_KINDS).slice(0, 2);
  const L = sampleL(rng, lk);
  if (!L) return null;
  const RL = footprintRect(L), lc = cellOf(L.x, L.z);
  const cells = [];
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (!sameCell({ c, r }, lc)) cells.push({ c, r });
  const cell = rng.pick(cells);
  if (KEEP && rng.uniform(0, 1) >= KEEP.cell[cell.r * NC + cell.c]) return null;
  const Y = sampleY(rng, yk, cell, RL);
  if (!Y) return null;
  const RY = footprintRect(Y);
  const c2 = aimCam(rng, L, Y, [RL, RY], null);
  if (!c2) return null;
  if (earlyProblems(L, Y, c2, cell)) return null;
  let X = null, c1 = null;
  for (let t = 0; t < 30 && !c1; t++) {
    let x = sampleThing(rng, xk);
    if (t % 2) {
      const side = rng.sign(), b = rad(c2.yaw + side * (HFOV / 2 + rng.uniform(8, 26))), d = rng.uniform(1.8, 5.5);
      x = { ...x, x: r2(c2.x + Math.sin(b) * d), z: r2(c2.z + Math.cos(b) * d) };
      const F = footprintRect(x), w = HARD.wallO + 0.02;
      if (F.x0 < w || F.z0 < w || F.x1 > RW - w || F.z1 > RD - w) continue;
    }
    const R = footprintRect(x);
    if (rectGap(RL, R) < 0.5 || rectGap(R, RY) < 0.8 || sameCell(cellOf(x.x, x.z), cell)) continue;
    if (pointRectGap(c2.x, c2.z, R) < HARD.camClear + 0.05 || !hiddenFrom(c2, x)) continue;
    const c = aimCam(rng, L, x, [RL, RY, R], Y, c2.yaw);
    if (c) { X = x; c1 = c; }
  }
  if (!c1) return null;
  const dk = rng.shuffle([...L_KINDS, ...O_KINDS].filter((k) => k !== lk && k !== xk && k !== yk)).slice(0, rng.int(N_DIS[0], N_DIS[1]));
  const D = [], placed = [RL, footprintRect(X), RY];
  for (const kind of dk) {
    let ok = null;
    for (let t = 0; t < 40 && !ok; t++) {
      const d = sampleD(rng, kind, c2, t % 2 === 1);
      if (!d) continue;
      const R = footprintRect(d);
      if (placed.some((Q) => rectGap(R, Q) < 0.5) || sameCell(cellOf(d.x, d.z), cell)) continue;
      if ([c1, c2].some((c) => pointRectGap(c.x, c.z, R) < HARD.camClear + 0.05) || !hiddenFrom(c2, d)) continue;
      ok = d; placed.push(R);
    }
    if (!ok) return null;
    D.push(ok);
  }
  const m = { task: 'two_view_where', board: { ...BOARD }, room: { w: RW, d: RD, cols: NC, rows: NR }, L, X, Y, D, cams: [c1, c2], answer: { c: cell.c, r: cell.r } };
  const P = layoutProblems(m);
  if (P.length) return null;
  if (KEEP && rng.uniform(0, 1) >= KEEP.joint[jointIndex(planRanks(m))]) return null;
  const Q = photoProblems(m);
  CACHE.delete(m);
  return Q.length ? null : m;
}

function iconL(g, kind) {
  const k = S;
  if (kind === 'sofa') {
    const w = 1.9 * k, d = 0.86 * k, bk = 0.26 * k, arm = 0.2 * k;
    g.fillStyle = '#6e3c28'; rr(g, -w / 2, -d / 2, w, d, 4); g.fill();
    g.fillStyle = '#c98a6c'; const sw = (w - 2 * arm) / 2;
    for (const i of [0, 1]) { rr(g, -w / 2 + arm + i * sw + 1, -d / 2 + bk + 1, sw - 2, d - bk - 2.5, 2.5); g.fill(); }
    g.strokeStyle = '#4e2a1c'; g.lineWidth = 1.2; rr(g, -w / 2, -d / 2, w, d, 4); g.stroke();
  } else if (kind === 'bookcase') {
    const w = 2 * LOW_SHELF.hw * k, d = Math.max(2 * LOW_SHELF.hd * k, 15), bb = 4.5;
    g.fillStyle = '#3f8f97'; g.fillRect(-w / 2, -d / 2, w, d);
    g.fillStyle = '#cdb08a'; g.fillRect(-w / 2 + 2, -d / 2 + 1.5, w - 4, bb);
    const cols = ['#c8553d', '#3f7cc0', '#e0b23e', '#4f9a62', '#8a5ab0', '#d4dde6'];
    const n = 9, bw = (w - 6) / n;
    for (let j = 0; j < n; j++) { g.fillStyle = cols[j % cols.length]; g.fillRect(-w / 2 + 3 + j * bw, -d / 2 + bb + 2.5, bw - 1, d - bb - 4.5); }
    g.strokeStyle = '#2d6a70'; g.lineWidth = 1.2; g.strokeRect(-w / 2, -d / 2, w, d);
  } else {
    const w = 1.5 * k, d = 2.06 * k;
    g.fillStyle = '#9b6e47'; rr(g, -w / 2, -d / 2, w, d, 3); g.fill();
    g.fillStyle = '#6f86bf'; rr(g, -w / 2 + 2, -d / 2 + 0.55 * k, w - 4, d - 0.55 * k - 2, 3); g.fill();
    g.fillStyle = '#eef0f4'; for (const s of [-1, 1]) { rr(g, s * 0.35 * k - 0.28 * k, -d / 2 + 0.12 * k, 0.56 * k, 0.32 * k, 4); g.fill(); }
    g.fillStyle = '#6b4a2e'; g.fillRect(-w / 2, -d / 2, w, 0.08 * k);
    g.strokeStyle = '#5a3e26'; g.lineWidth = 1.2; rr(g, -w / 2, -d / 2, w, d, 3); g.stroke();
  }
}
function iconO(g, kind, sz = 1) {
  g.save(); g.scale(sz, sz);
  if (kind === 'plant') {
    g.fillStyle = '#c0714f'; g.beginPath(); g.arc(0, 0, 7.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4e8f45';
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; g.beginPath(); g.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 5.2, 3, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#3f7a3a'; g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fill();
  } else if (kind === 'box') {
    g.fillStyle = '#c09466'; rr(g, -9, -8, 18, 16, 1.5); g.fill();
    g.fillStyle = '#dcc39a'; g.fillRect(-1.6, -8, 3.2, 16);
    g.strokeStyle = '#a47b50'; g.lineWidth = 1; rr(g, -9, -8, 18, 16, 1.5); g.stroke();
  } else if (kind === 'ball') {
    g.fillStyle = '#f3efe6'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e04b3c'; for (const a of [0, 2.09, 4.19]) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 8, a, a + 1.05); g.closePath(); g.fill(); }
    g.strokeStyle = '#b8b2a6'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
  } else {
    g.fillStyle = '#a8784e'; g.fillRect(-8, -9, 16, 3.5);
    g.fillStyle = '#4f9a62'; rr(g, -7.5, -5, 15, 13, 2); g.fill();
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 1; rr(g, -7.5, -5, 15, 13, 2); g.stroke();
  }
  g.restore();
}
const planRot = (yaw) => -rad(yaw);
const ICON_O = 1.35;

const task = {
  meta: {
    name: 'two_view_where', family: 'D', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'tap', x: 'board x on the floor plan', y: 'board y on the floor plan' }],
    promptHuman: 'Tap on the plan where the <object> is',
  },

  generate(rng, level, index, knobs = {}) {
    for (let attempt = 0; attempt < 200000; attempt++) {
      const m = tryBuild(rng);
      if (m) return m;
    }
    throw new Error('two_view_where: generator exhausted');
  },

  init() { return { tap: null }; },

  applyAction(state, a, m) {
    if (!a || a.op !== 'tap') return { ok: false, reason: 'bad-op' };
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-point' };
    if (a.x < PLAN.x || a.x > PLAN.x + PLAN.w || a.y < PLAN.y || a.y > PLAN.y + PLAN.h) return { ok: false, reason: 'off-plan' };
    state.tap = { x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10 };
    return { ok: true };
  },

  verify(state, m) {
    const ans = m.answer;
    if (!state.tap) return { success: false, partial: 0, error: 1, detail: { tapped: false, answer: ans } };
    const wx = (state.tap.x - PLAN.x) / S, wz = (state.tap.y - PLAN.y) / S;
    const cell = cellOf(Math.min(RW - 1e-6, Math.max(0, wx)), Math.min(RD - 1e-6, Math.max(0, wz)));
    const ok = sameCell(cell, ans);
    return { success: ok, partial: ok ? 1 : 0, error: ok ? 0 : Math.abs(cell.c - ans.c) + Math.abs(cell.r - ans.r),
      detail: { tapped: true, cell, answer: ans, distM: r2(Math.hypot(wx - m.Y.x, wz - m.Y.z)) } };
  },

  oracle(m) { return [{ op: 'tap', x: r1(PLAN.x + m.Y.x * S), y: r1(PLAN.y + m.Y.z * S) }]; },

  randomPolicy(m, rnd) { return [{ op: 'tap', x: r1(PLAN.x + rnd() * PLAN.w), y: r1(PLAN.y + rnd() * PLAN.h) }]; },

  async mount(env) { env.assets.tvw = {}; },

  drawPrompt(g, r, env) {
    const m = env.manifest;
    drawPromptText(g, r, `Tap on the plan where the ${NAME[m.Y.kind]} is`, 'Both photos show the same room');
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, A = env.assets.tvw || (env.assets.tvw = {});
    const q = contextScale(g);
    if (A.m !== m || A.q !== q) { A.m = m; A.q = q; A.photos = scenesOf(m).sc.map((s) => toCanvas(render(s, q))); }
    g.save(); g.translate(br.x, br.y);
    [0, P2Y].forEach((y, i) => {
      g.save(); rr(g, 0, y, PW, PH, 6); g.clip(); g.drawImage(A.photos[i], 0, y, PW, PH); g.restore();
      g.strokeStyle = '#cfd7e0'; g.lineWidth = 1; rr(g, 0.5, y + 0.5, PW - 1, PH - 1, 6); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.92)'; rr(g, 6, y + 6, 52, 18, 9); g.fill();
      g.fillStyle = '#333b44'; g.font = `600 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`Photo ${i + 1}`, 32, y + 15.5);
    });
    g.fillStyle = '#f3f5f8'; g.fillRect(PW + 9, 0, br.w - PW - 9, br.h);
    g.fillStyle = '#fbf8f2'; g.fillRect(PLAN.x, PLAN.y, PLAN.w, PLAN.h);
    if (st.tap) {
      const wx = (st.tap.x - PLAN.x) / S, wz = (st.tap.y - PLAN.y) / S, c = cellOf(Math.min(RW - 1e-6, wx), Math.min(RD - 1e-6, wz));
      if (c) { g.fillStyle = 'rgba(25,145,250,0.13)'; g.fillRect(PLAN.x + c.c * CW * S, PLAN.y + c.r * CD * S, CW * S, CD * S); }
    }
    g.strokeStyle = '#dde2e8'; g.lineWidth = 1; g.setLineDash([3, 3]);
    for (let c = 1; c < NC; c++) { const x = PLAN.x + c * CW * S + 0.5; g.beginPath(); g.moveTo(x, PLAN.y); g.lineTo(x, PLAN.y + PLAN.h); g.stroke(); }
    for (let r = 1; r < NR; r++) { const y = PLAN.y + r * CD * S + 0.5; g.beginPath(); g.moveTo(PLAN.x, y); g.lineTo(PLAN.x + PLAN.w, y); g.stroke(); }
    g.setLineDash([]);
    g.save(); g.beginPath(); g.rect(PLAN.x, PLAN.y, PLAN.w, PLAN.h); g.clip();
    for (const o of pieces(m)) {
      g.save(); g.translate(PLAN.x + o.x * S, PLAN.y + o.z * S);
      if (L_KINDS.includes(o.kind)) { g.rotate(planRot(o.yaw)); iconL(g, o.kind); }
      else { if (o.kind === 'chair' || o.kind === 'box') g.rotate(planRot(o.yaw)); iconO(g, o.kind, ICON_O); }
      g.restore();
    }
    g.restore();
    g.strokeStyle = '#4a5562'; g.lineWidth = 3.5; g.strokeRect(PLAN.x - 1.75, PLAN.y - 1.75, PLAN.w + 3.5, PLAN.h + 3.5);
    g.font = `500 11px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const slot = (k) => ({ x: PLAN.x + (k % 3) * LEG_DX, y: LEG_Y + Math.floor(k / 3) * LEG_DY });
    g.fillStyle = '#5b6b7a'; g.fillText('Plan', slot(0).x + 2, slot(0).y);
    pieces(m).slice().sort((a, b) => NAME[a.kind].localeCompare(NAME[b.kind])).forEach((o, i) => {
      const { x, y } = slot(i + 1);
      g.save(); g.translate(x + 14, y);
      if (L_KINDS.includes(o.kind)) {
        const [a, b] = FOOT[o.kind], turn = b > a, w = 2 * S * Math.max(a, b), d = 2 * S * Math.min(a, b), k = Math.min(1, 26 / w, 16 / d);
        if (turn) g.rotate(Math.PI / 2);
        g.scale(k, k); iconL(g, o.kind);
      } else iconO(g, o.kind, 1);
      g.restore();
      g.fillStyle = '#333b44'; g.fillText(NAME[o.kind], x + 34, y);
    });
    if (st.tap) {
      const x = st.tap.x, y = st.tap.y;
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + 1, 5, 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = ACCENT; g.strokeStyle = '#fff'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 3, y - 7, x - 8, y - 10, x - 8, y - 16); g.arc(x, y - 16, 8, Math.PI, 0); g.bezierCurveTo(x + 8, y - 10, x + 3, y - 7, x, y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - 16, 3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    if (evt.x < PLAN.x || evt.x > PLAN.x + PLAN.w || evt.y < PLAN.y || evt.y > PLAN.y + PLAN.h) return [];
    return [{ op: 'tap', x: r1(evt.x), y: r1(evt.y) }];
  },

  footerStatus(env) { return env.state.tap ? 'Tap again to move the pin' : 'Tap the plan'; },
};
export function previewImage(m) { return render(scenesOf(m).sc[1], 2); }
export default task;
