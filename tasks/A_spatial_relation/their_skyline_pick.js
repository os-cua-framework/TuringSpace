import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, makeCam, objectStats, shape } from '../common/_seat_view_rt.js';
import { builder, person, plazaEnv, orbitCam, sceneOf, PERSON_LOOKS } from '../common/_seat_view_props.js';
import * as SEAT_LOOK from '../common/_seat_view_look.js';
import * as GP from '../common/_seat_view_prop_kinds.js';
import { nthOf, splitIds } from '../core/style.js';
import * as RING from '../common/_their_skyline_pick_ring.js';

const BOARD = { w: 380, h: 402 };
const SCENE_H = 248;
const TAU = Math.PI * 2;
const S = 0.0208;
const CAM_EL = 45, CAM_FOV = 32;

const TOWERS = [
  { id: 0, h: 22, color: '#2f9e9a' },
  { id: 1, h: 44, color: '#e0b23e' },
  { id: 2, h: 84, color: '#cf4b3a' },
];
const HEIGHTS = TOWERS.map((t) => t.h);
const MAXH = 84;
const TOWER_W = 14;
const EYE_Y = 77;
const LAT = 63, LAT_JIT = 6, PERP_MIN = 13, PERP_MAX = 22, PERP_JIT = 3, OBL = 12;
const SEAT = { rMin: 128, rMax: 152 };
const HER_ANG_SEP = 6, HER_APP_MAX = 0.86, HER_FOV_MAX = 34, DEPTH_FRAC_MAX = 0.55;
const CAM_SEP_PX = 8, FIG_SEP_PX = 8, CAM_HR_MAX = 0.88;
const PADX = 0.08 * BOARD.w, PADY = 0.07 * SCENE_H;
const HER = 9;

const round2 = (v) => Math.round(v * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const DEG = 180 / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;
const wrapDeg = (a) => ((a % 360) + 540) % 360 - 180;
const permEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const NCARD = 6;
const REL_OK = [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1]];

function azInterval(seat, p) {
  const c = Math.atan2(p.x - seat.x, p.z - seat.z) * DEG;
  const us = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
    const a = Math.atan2(p.x + (sx * TOWER_W) / 2 - seat.x, p.z + (sz * TOWER_W) / 2 - seat.z) * DEG;
    return c + wrapDeg(a - c);
  });
  return { lo: Math.min(...us), hi: Math.max(...us), c };
}
function herSepDeg(seat, pos) {
  const iv = pos.map((p) => azInterval(seat, p));
  let worst = Infinity;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const a = iv[i], b = iv[j]; worst = Math.min(worst, a.c < b.c ? b.lo - a.hi : a.lo - b.hi); }
  return worst;
}
function herOrder(seat, pos) {
  const look = Math.atan2(-seat.x, -seat.z) * DEG;
  return pos.map((p) => ({ id: p.id, a: wrapDeg(Math.atan2(p.x - seat.x, p.z - seat.z) * DEG - look) }))
    .sort((u, v) => v.a - u.a || u.id - v.id).map((e) => e.id);
}
function herCam(seat) { return makeCam({ eye: [seat.x * S, EYE_Y * S, seat.z * S], target: [0, EYE_Y * S * 0.6, 0], fovY: 60, W: 400, H: 300 }); }
function herOrderConsistent(seat, pos) {
  const cam = herCam(seat);
  const xs = (y) => pos.map((p) => { const q = cam.project(p.x * S, y, p.z * S); return { id: p.id, x: q.x, z: q.z }; });
  for (const y of [0, MAXH * S]) {
    const pr = xs(y);
    if (pr.some((q) => q.z <= 0.3)) return false;
    const ord = pr.slice().sort((u, v) => u.x - v.x || u.id - v.id).map((e) => e.id);
    if (!permEq(ord, herOrder(seat, pos))) return false;
  }
  return true;
}
const eyeDist = (seat, p) => Math.hypot(p.x - seat.x, p.z - seat.z);
function herAppWorst(seat, pos) {
  const d = pos.map((p) => eyeDist(seat, p));
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === j) continue; for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) worst = Math.max(worst, (HEIGHTS[a] / d[i]) / (HEIGHTS[b] / d[j])); }
  return worst;
}
function depthFrac(seat, pos) {
  const r = Math.hypot(seat.x, seat.z) || 1, dir = { x: -seat.x / r, z: -seat.z / r };
  const dp = pos.map((p) => (p.x - seat.x) * dir.x + (p.z - seat.z) * dir.z);
  return (Math.max(...dp) - Math.min(...dp)) / r;
}
function herFovMax(seat, pos) {
  const look = Math.atan2(-seat.x, -seat.z) * DEG;
  return Math.max(...pos.map((p) => { const iv = azInterval(seat, p); return Math.max(Math.abs(wrapDeg(iv.lo - look)), Math.abs(wrapDeg(iv.hi - look))); }));
}

function postBox(cam, p, h) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, h]) pts.push(cam.project((p.x + sx * TOWER_W / 2) * S, y * S, (p.z + sz * TOWER_W / 2) * S));
  return { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
}
function figBox(cam, seat) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.82]) pts.push(cam.project(seat.x * S + sx * 0.3, y, seat.z * S + sz * 0.3));
  return { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
}
const boxGap = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
function postHull(cam, p, h) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, h]) pts.push(cam.project((p.x + sx * TOWER_W / 2) * S, y * S, (p.z + sz * TOWER_W / 2) * S));
  return hull(pts);
}
function hull(pts) {
  pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop(); return lo.concat(hi);
}
function satGap(A, B) {
  let best = -Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b.y - a.y, ny = a.x - b.x, l = Math.hypot(nx, ny) || 1;
    const pa = A.map((q) => (q.x * nx + q.y * ny) / l), pb = B.map((q) => (q.x * nx + q.y * ny) / l);
    best = Math.max(best, Math.min(...pa) - Math.max(...pb), Math.min(...pb) - Math.max(...pa));
  }
  return best;
}
function camSepPx(cam, pos) { const H = pos.map((p) => postHull(cam, p, MAXH)); let w = Infinity; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) w = Math.min(w, satGap(H[i], H[j])); return w; }
function figHull(cam, seat) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.8]) pts.push(cam.project(seat.x * S + sx * 0.26, y, seat.z * S + sz * 0.26));
  return hull(pts);
}
function figSepPx(cam, seat, pos) { const F = figHull(cam, seat); return Math.min(...pos.map((p) => satGap(F, postHull(cam, p, MAXH)))); }
function camHeightWorst(cam, pos) {
  const px = pos.map((p) => HEIGHTS.map((h) => { const b = postBox(cam, p, h); return b.y1 - b.y0; }));
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === j) continue; for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) worst = Math.max(worst, px[i][a] / px[j][b]); }
  return worst;
}
function camOrder(cam, pos) {
  return pos.map((p) => { const b = postBox(cam, p, MAXH); return { id: p.id, x: (b.x0 + b.x1) / 2 }; }).sort((u, v) => u.x - v.x || u.id - v.id).map((e) => e.id);
}
function extent(cam, seat, pos) {
  const B = [figBox(cam, seat), ...pos.map((p) => postBox(cam, p, MAXH))];
  return { x0: Math.min(...B.map((b) => b.x0)), x1: Math.max(...B.map((b) => b.x1)), y0: Math.min(...B.map((b) => b.y0)), y1: Math.max(...B.map((b) => b.y1)) };
}
function frameCamera(seat, pos, az) {
  const pts = [seat, ...pos];
  const tx = round2(pts.reduce((s, p) => s + p.x, 0) / pts.length * S), tz = round2(pts.reduce((s, p) => s + p.z, 0) / pts.length * S);
  for (let dist = 6; dist <= 16; dist += 0.25) {
    const c = { az, el: CAM_EL, dist, fov: CAM_FOV, tx, ty: 0.75, tz };
    const cam = orbitCam(c, BOARD.w, SCENE_H), E = extent(cam, seat, pos);
    if (E.x0 >= PADX && E.x1 <= BOARD.w - PADX && E.y0 >= PADY && E.y1 <= SCENE_H - PADY) {
      return c;
    }
  }
  return null;
}

const SCENES = new WeakMap();
function buildWorld(m, SK = null) {
  const R = m.rounds[0], B = SK ? SK.B : builder(), kit = m.kit;
  if (SK) B.role = 'person';
  person(B, HER, { x: R.seat.x * S, z: R.seat.z * S, yaw: R.seat.yaw, look: SK ? SK.outfit : PERSON_LOOKS[m.look] });
  if (SK) B.role = 'post';
  for (const p of R.pos) {
    const t = TOWERS[p.id], x = p.x * S, z = p.z * S;
    if (kit) { GP.postProp(B, p.id, kit.post, { x, z, h: t.h * S, R: TOWER_W * S / 2, col: SK ? SK.colors[p.id] : t.color }); continue; }
    const mat = B.mat('paint', t.color), stone = B.mat('matte', '#e8e3d8'), R = TOWER_W * S / 2;
    B.add(shape.cyl(p.id, stone, x, z, 0, 0.06, R, 0.01));
    B.add(shape.cyl(p.id, mat, x, z, 0.06, t.h * S - 0.03, R * 0.82, 0.01));
    B.add(shape.cyl(p.id, stone, x, z, t.h * S - 0.03, t.h * S, R * 0.95, 0.012));
  }
  return B;
}
function sceneFor(m) {
  if (SCENES.has(m)) return SCENES.get(m);
  const B = buildWorld(m);
  const sc = sceneOf(B, orbitCam(m.camera, BOARD.w, SCENE_H), plazaEnv());
  SCENES.set(m, sc);
  return sc;
}

function roundProblems(m) {
  const P = [], R = m.rounds[0], pos = R.pos, cand = R.candidates, seat = R.seat;
  if (!Array.isArray(pos) || pos.length !== 3 || pos.map((p) => p.id).sort().join('') !== '012') return ['pos'];
  if (!seat || ![seat.x, seat.z, seat.yaw].every(Number.isFinite)) return ['seat'];
  const r = Math.hypot(seat.x, seat.z);
  if (r < SEAT.rMin - 2 || r > SEAT.rMax + 2) P.push('seat-radius');
  if (Math.abs(wrapDeg(seat.yaw - norm360(Math.atan2(-seat.x, -seat.z) * DEG))) > 1) P.push('not-facing-row');
  if (!(herSepDeg(seat, pos) >= HER_ANG_SEP)) P.push('her-merge');
  if (!(herAppWorst(seat, pos) <= HER_APP_MAX)) P.push('her-heights');
  if (!(herFovMax(seat, pos) <= HER_FOV_MAX)) P.push('her-fov');
  if (!(depthFrac(seat, pos) <= DEPTH_FRAC_MAX)) P.push('her-oblique');
  if (!herOrderConsistent(seat, pos)) P.push('her-order-render');
  const want = frameCamera(seat, pos, m.camera.az);
  if (!want || ['az', 'el', 'dist', 'fov', 'tx', 'ty', 'tz'].some((k) => want[k] !== m.camera[k])) P.push('camera');
  const cam = orbitCam(m.camera, BOARD.w, SCENE_H);
  if (!(camSepPx(cam, pos) >= CAM_SEP_PX)) P.push('cam-merge');
  if (!(figSepPx(cam, seat, pos) >= FIG_SEP_PX)) P.push('fig-merge');
  if (!(camHeightWorst(cam, pos) <= CAM_HR_MAX)) P.push('cam-heights');
  const sc = sceneFor(m);
  for (const id of [0, 1, 2, HER]) if (objectStats(sc, id, 2, true).frac < 0.9) P.push(`occluded${id}`);
  const her = herOrder(seat, pos), disp = camOrder(cam, pos), rev = disp.slice().reverse();
  if (permEq(her, disp) || permEq(her, rev)) P.push('display-order');
  if (!Array.isArray(cand) || cand.length !== NCARD) return [...P, 'cards'];
  for (const c of cand) if (!Array.isArray(c) || c.length !== 3 || c.slice().sort().join('') !== '012') return [...P, 'card'];
  for (let i = 0; i < NCARD; i++) for (let j = i + 1; j < NCARD; j++) if (permEq(cand[i], cand[j])) P.push('dup-card');
  if (!Number.isInteger(R.answer) || !cand[R.answer] || !permEq(cand[R.answer], her)) P.push('answer');
  return [...new Set(P)];
}
export function contractProblems(m) {
  if (m && m.ring) {
    if (m.task !== 'their_skyline_pick' || m.board?.w !== RING.BOARD.w || m.board?.h !== RING.BOARD.h) return ['task'];
    return RING.problems(m);
  }
  if (!m || m.task !== 'their_skyline_pick' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['task'];
  if (!Array.isArray(m.rounds) || m.rounds.length !== 1 || !m.camera) return ['rounds'];
  return roundProblems(m);
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

function tryBuild(rng, want, look, kit = null, asgFixed = null) {
  for (let att = 0; att < 90; att++) {
    const psi = round2(rng.uniform(0, 360)), camAz = round2(norm360(psi + rng.sign() * rng.uniform(55, 125)));
    const phi = norm360(psi + 90 * rng.sign() + rng.uniform(-OBL, OBL));
    const u = { x: Math.sin(rad(phi)), z: Math.cos(rad(phi)) }, n = { x: Math.cos(rad(phi)), z: -Math.sin(rad(phi)) };
    const r = rng.uniform(SEAT.rMin, SEAT.rMax);
    const seat = { x: round2(Math.sin(rad(psi)) * r), z: round2(Math.cos(rad(psi)) * r) };
    seat.yaw = round2(norm360(Math.atan2(-seat.x, -seat.z) * DEG));
    const t = [-LAT, 0, LAT].map((v) => v + rng.uniform(-LAT_JIT, LAT_JIT));
    const e = rng.uniform(PERP_MIN, PERP_MAX);
    const bow = [-e, 0, e].map((v) => v + rng.uniform(-PERP_JIT, PERP_JIT));
    for (const q of rng.shuffle(PERMS)) {
      const pts = t.map((tk, i) => ({ x: round2(u.x * tk + n.x * bow[q[i]]), z: round2(u.z * tk + n.z * bow[q[i]]) }));
      const probe = pts.map((p, i) => ({ id: i, x: p.x, z: p.z }));
      if (!(herSepDeg(seat, probe) >= HER_ANG_SEP) || !(herAppWorst(seat, probe) <= HER_APP_MAX)) continue;
      if (!(herFovMax(seat, probe) <= HER_FOV_MAX) || !(depthFrac(seat, probe) <= DEPTH_FRAC_MAX)) continue;
      if (!herOrderConsistent(seat, probe)) continue;
      const camera = frameCamera(seat, probe, camAz);
      if (!camera) continue;
      const cam = orbitCam(camera, BOARD.w, SCENE_H);
      if (!(camSepPx(cam, probe) >= CAM_SEP_PX)) continue;
      if (!(figSepPx(cam, seat, probe) >= FIG_SEP_PX)) continue;
      if (!(camHeightWorst(cam, probe) <= CAM_HR_MAX)) continue;
      const slotHer = herOrder(seat, probe), slotDisp = camOrder(cam, probe);
      const rho = slotHer.map((s) => slotDisp.indexOf(s));
      if (!permEq(rho, want)) continue;
      const asg = asgFixed || PERMS[rng.int(0, 5)];
      const pos = pts.map((p, i) => ({ id: asg[i], x: p.x, z: p.z }));
      const her = slotHer.map((s) => asg[s]);
      const cand = rng.shuffle(PERMS).map((p) => p.slice());
      const m = { task: 'their_skyline_pick', board: { ...BOARD }, camera, look,
        rounds: [{ seat, pos, candidates: cand, answer: cand.findIndex((c) => permEq(c, her)) }] };
      if (kit) m.kit = kit;
      const P = contractProblems(m);
      SCENES.delete(m);
          if (!P.length) return m;
    }
  }
  return null;
}

const EVAL_KEYS = new Set(['skyline|120|0:-5,11;1:4,10;2:0,8', 'skyline|012|0:4,8;1:0,10;2:-4,8', 'skyline|201|0:0,11;1:-4,10;2:4,8',
  'skyline|120|0:-4,11;1:4,11;2:0,8', 'skyline|210|0:-4,7;1:0,10;2:4,9', 'skyline|012|0:4,9;1:0,10;2:-4,6', 'skyline|012|0:4,9;1:0,7;2:-4,10',
  'skyline|201|0:0,7;1:-4,9;2:4,11', 'skyline|201|0:0,10;1:-4,9;2:4,7', 'skyline|021|0:4,10;1:-4,11;2:0,8', 'skyline|012|0:5,12;1:0,9;2:-4,10',
  'skyline|210|0:-4,10;1:0,8;2:4,11']);
const SLOT_LAT = [60, 0, -60];
const FEASIBLE_DEPTHS = ['8,6,8', '8,6,9', '9,6,8', '9,6,9', '8,7,10', '9,7,9', '9,7,10', '10,7,8', '10,7,9', '10,7,10', '9,8,11', '10,8,9', '10,8,10',
  '10,8,11', '11,8,9', '11,8,10', '11,8,11', '10,9,12', '11,9,11', '11,9,12', '12,9,10', '12,9,11', '12,9,12', '8,10,8', '8,10,9', '9,10,8', '12,10,12',
  '8,11,8', '8,11,9', '8,11,10', '9,11,8', '9,11,9', '10,11,8', '9,12,9', '9,12,10', '9,12,11', '10,12,9', '10,12,10', '11,12,9'].map((k) => k.split(',').map(Number));
function placeInHerFrame(psi, r, rel) {
  const seat = { x: round2(Math.sin(rad(psi)) * r), z: round2(Math.cos(rad(psi)) * r) };
  seat.yaw = round2(norm360(Math.atan2(-seat.x, -seat.z) * DEG));
  const a = Math.atan2(-seat.x, -seat.z), F = [Math.sin(a), Math.cos(a)], L = [Math.cos(a), -Math.sin(a)];
  return { seat, pts: rel.map(([lat, dep]) => ({ x: round2(seat.x + lat * L[0] + dep * F[0]), z: round2(seat.z + lat * L[1] + dep * F[1]) })) };
}
const LAYOUTS = new Map();
function layouts(split) {
  if (LAYOUTS.has(split)) return LAYOUTS.get(split);
  const all = [];
  for (const deps of FEASIBLE_DEPTHS) {
    const { seat, pts } = placeInHerFrame(0, 140, deps.map((d, k) => [SLOT_LAT[k], d * 15]));
    const probe = pts.map((p, k) => ({ id: k, ...p }));
    if (!(herSepDeg(seat, probe) >= HER_ANG_SEP) || !(herAppWorst(seat, probe) <= HER_APP_MAX) || !(herFovMax(seat, probe) <= HER_FOV_MAX)
      || !(depthFrac(seat, probe) <= DEPTH_FRAC_MAX) || !herOrderConsistent(seat, probe)) continue;
    for (const her of PERMS) {
      const m = { rounds: [{ seat, pos: her.map((id, k) => ({ id, ...pts[k] })) }] };
      const key = semanticKey(m);
      if (!EVAL_KEYS.has(key)) all.push({ her, deps, key });
    }
  }
  const sp = splitIds('their_skyline_pick|layout', all.map((x) => x.key), Math.ceil(all.length / 10));
  for (const sl of ['train', 'test']) LAYOUTS.set(sl, all.filter((x) => sp(x.key) === sl));
  return LAYOUTS.get(split);
}
function buildFromLayout(rng, lay, look, kit) {
  const psi = round2(rng.uniform(0, 360)), camAz = round2(norm360(psi + rng.sign() * rng.uniform(55, 125))), r = rng.uniform(SEAT.rMin, SEAT.rMax);
  const rel = lay.deps.map((d, k) => [SLOT_LAT[k] + rng.uniform(-4, 4), d * 15 + rng.uniform(-4, 4)]);
  const { seat, pts } = placeInHerFrame(psi, r, rel);
  const pos = pts.map((p, k) => ({ id: lay.her[k], x: p.x, z: p.z }));
  if (semanticKey({ rounds: [{ seat, pos }] }) !== lay.key) return null;
  const camera = frameCamera(seat, pos, camAz);
  if (!camera) return null;
  const her = herOrder(seat, pos), cand = rng.shuffle(PERMS).map((p) => p.slice());
  const m = { task: 'their_skyline_pick', board: { ...BOARD }, camera, look,
    rounds: [{ seat, pos: pos.slice().sort((u, v) => u.id - v.id), candidates: cand, answer: cand.findIndex((c) => permEq(c, her)) }], kit };
  const P = contractProblems(m);
  SCENES.delete(m);
  return P.length ? null : m;
}
function generateExt(rng0, split, n) {
  const rng = GP.decorrelate(rng0), look = rng.pick([0, 2, 4]), kit = { post: GP.pickIn(rng, GP.POSTS, split) };
  const L = layouts(split), idx = n != null && Number.isFinite(Number(n)) ? Number(n) : null;
  for (let k = 0; k < 8; k++) {
    const lay = idx == null ? L[rng.int(0, L.length - 1)] : L[(nthOf(`their_skyline_pick|${split}|layout`, idx, L.length) + k * 7919) % L.length];
    for (let a = 0; a < 1500; a++) { const m = buildFromLayout(rng, lay, look, kit); if (m) return m; }
  }
  throw new Error('their_skyline_pick: generator exhausted (ext)');
}
function drawPostIcon(g, kind, b, col) {
  g.fillStyle = col;
  if (kind === 'pillar') { rr(g, b.x + 1.5, b.y + 2, b.w - 3, b.h - 4, 1); g.fill(); g.fillStyle = '#cfc8ba'; g.fillRect(b.x, b.y, b.w, 3); g.fillRect(b.x, b.y + b.h - 3, b.w, 3); }
  else if (kind === 'stack') {
    const n = Math.max(1, Math.round(b.h / 16)), ch = b.h / n;
    for (let i = 0; i < n; i++) { g.fillStyle = col; g.fillRect(b.x + 1, b.y + i * ch + 0.5, b.w - 2, ch - 1); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(b.x + 1.5, b.y + i * ch + 1, b.w - 3, ch - 2); }
  } else if (kind === 'bollard') {
    rr(g, b.x + 1, b.y, b.w - 2, b.h, Math.min(8, (b.w - 2) / 2)); g.fill();
    g.fillStyle = '#f2f0ea'; for (const f of [0.38, 0.22]) g.fillRect(b.x + 1, b.y + b.h * f, b.w - 2, Math.max(2, b.h * 0.06));
  } else if (kind === 'cone') {
    g.beginPath(); g.moveTo(b.x + 1, b.y + b.h - 2); g.lineTo(b.x + b.w / 2 - 2, b.y); g.lineTo(b.x + b.w / 2 + 2, b.y); g.lineTo(b.x + b.w - 1, b.y + b.h - 2); g.closePath(); g.fill();
    g.fillStyle = '#2e3034'; g.fillRect(b.x, b.y + b.h - 2.5, b.w, 2.5);
  } else { rr(g, b.x, b.y, b.w, b.h, 2); g.fill(); }
}
const POST_PAINTS = [['red', '#cf4b3a'], ['orange', '#e07a2a'], ['yellow', '#e0b23e'], ['green', '#4f9a42'], ['teal', '#2f9e9a'], ['blue', '#3f6fc0'], ['purple', '#7a4ab0'], ['pink', '#d86a9a'], ['black', '#2e3034'], ['white', '#eeeae2']];
async function styleSkin(style, m) {
  const look = await SEAT_LOOK.seatLook(style, { setting: 'outdoor', paving: true, fogD0: 9, fogD1: 30 });
  const rnd = look.rnd, K = look.kit;
  const cols = [];
  for (const [name, hex] of SEAT_LOOK.shuffled(rnd, SEAT_LOOK.splitList(style, 'post_paint', POST_PAINTS, { idOf: (x) => x[0], minTest: 5 }))) {
    if (cols.every(([, h]) => SEAT_LOOK.S3.deltaE(SEAT_LOOK.hex2lin(h), SEAT_LOOK.hex2lin(hex)) >= 40) && SEAT_LOOK.S3.deltaE(SEAT_LOOK.hex2lin(hex), look.floorFace) >= 25) cols.push([name, hex]);
    if (cols.length === 3) break;
  }
  for (const t of TOWERS) if (cols.length < 3) cols.push(['default', t.color]);
  for (const [n] of cols) style.note(`post_paint:${n}`);
  const [[, shirt]] = SEAT_LOOK.shirtSet(style, 1);
  const outfit = SEAT_LOOK.outfit(style, PERSON_LOOKS[m.look], shirt);
  const trim = K.stone(0.45 + 0.25 * rnd()), clothes = SEAT_LOOK.clothesRemap(look, [outfit]), finish = SEAT_LOOK.pickS(style, 'paint_finish', ['satin', 'gloss', 'matte']);
  const remap = (name, hex, role) => {
    if (role === 'person') return clothes(name, hex);
    if (role === 'post' && name === 'matte' && hex === '#e8e3d8') return trim;
    if (role === 'post' && name === 'paint') return SEAT_LOOK.flatMat(hex, finish);
    return null;
  };
  return { look, remap, outfit, colors: cols.map(([, h]) => h) };
}
const STYLED = new WeakMap();
function styledScene(m, skin) {
  const c = STYLED.get(m);
  if (c && c.skin === skin) return c.sc;
  const B = SEAT_LOOK.styledBuilder(skin.remap);
  buildWorld(m, { ...skin, B });
  const sc = sceneOf(B, orbitCam(m.camera, BOARD.w, SCENE_H), skin.look.env({}), skin.look.light);
  STYLED.set(m, { skin, sc });
  return sc;
}

export function semanticKey(m) {
  if (m.ring) return RING.semanticKey(m);
  const R0 = m.rounds[0], seat = R0.seat, a = Math.atan2(-seat.x, -seat.z), fx = Math.sin(a), fz = Math.cos(a);
  const q = (v) => Math.round(v / 15);
  const rel = R0.pos.slice().sort((u, v) => u.id - v.id).map((p) => { const dx = p.x - seat.x, dz = p.z - seat.z; return `${p.id}:${q(dx * fz - dz * fx)},${q(dx * fx + dz * fz)}`; });
  return `skyline|${herOrder(seat, R0.pos).join('')}|${rel.join(';')}`;
}

const CARD_W = 116, CARD_H = 66, CARD_GAP = 8, CARD_Y0 = SCENE_H + 12;
const task = {
  meta: {
    name: 'their_skyline_pick', family: 'A', 
    panelWidth: RING.BOARD.w + 20, boardH: RING.BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...RING.BOARD }, uses3d: true,
    actionSpace: [{ op: 'toggle', id: 'post 0..5 from the palette: appended to her view, or removed if already there' }],
    promptHuman: 'Build what she sees, from her left to her right',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs.ext) return { ...generateExt(rng, knobs.ext, knobs.n), panel: { panelWidth: BOARD.w + 20, boardH: BOARD.h + 10 } };
    const m = RING.generate(rng);
    if (m) return m;
    throw new Error('their_skyline_pick: generator exhausted');
  },

  init(m) { return m && m.ring ? RING.init() : { round: 0, picks: [null] }; },

  applyAction(state, action, m) {
    if (m && m.ring) return RING.applyAction(state, action);
    if (!action || action.op !== 'pick') return { ok: false, reason: 'bad-op' };
    const c = action.choice;
    if (!Number.isInteger(c) || c < 0 || c >= NCARD) return { ok: false, reason: 'bad-choice' };
    state.picks[0] = c;
    return { ok: true };
  },

  verify(state, m) {
    if (m.ring) return RING.verify(state, m);
    const ok = state.picks[0] === m.rounds[0].answer;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { pick: state.picks[0] } };
  },

  oracle(m) { return m.ring ? RING.oracle(m) : [{ op: 'pick', choice: m.rounds[0].answer }]; },

  randomPolicy(m, rnd) { return m.ring ? RING.randomPolicy(m, rnd) : [{ op: 'pick', choice: Math.floor(rnd() * NCARD) }]; },

  async mount(env) {
    env.assets.sky = {};
    if (env.style && !env.manifest?.ring) env.assets.skin = await styleSkin(env.style, env.manifest);
  },

  drawPrompt(g, r, env) {
    if (env?.manifest?.ring) { drawPromptText(g, r, 'Build what she sees, from her left to her right', 'Tap the posts in front of her, in that order; tap again to remove'); return; }
    const kit = env?.manifest?.kit;
    drawPromptText(g, r, 'Pick what she sees, from her left to right', kit ? `She is looking at the three ${GP.POST_NOUN[kit.post]}` : 'She is looking at the three posts');
  },

  _cardRect(i) {
    const col = i % 3, row = Math.floor(i / 3);
    const x0 = (BOARD.w - (3 * CARD_W + 2 * CARD_GAP)) / 2;
    return { x: x0 + col * (CARD_W + CARD_GAP), y: CARD_Y0 + row * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
  },
  _skylineBars(R, perm) {
    const base = R.y + R.h - 12, bw = 18, gap = 14, x0 = R.x + (R.w - (3 * bw + 2 * gap)) / 2;
    return perm.map((id, k) => { const h = (TOWERS[id].h / MAXH) * (R.h - 22); return { id, x: x0 + k * (bw + gap), y: base - h, w: bw, h }; });
  },

  drawBoard(g, br, env) {
    if (env.manifest.ring) { RING.drawBoard(g, br, env); return; }
    const m = env.manifest, st = env.state, A = env.assets.sky || (env.assets.sky = {});
    const q = contextScale(g), skin = env.style ? env.assets.skin : null, key = `${q}` + (skin ? '|' + env.style.key : '');
    if (A.m !== m || A.key !== key) { A.m = m; A.key = key; A.canvas = toCanvas(render(skin ? styledScene(m, skin) : sceneFor(m), q)); }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, SCENE_H);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, SCENE_H, br.w, br.h - SCENE_H);
    g.strokeStyle = '#dde3ea'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, SCENE_H + 0.5); g.lineTo(br.w, SCENE_H + 0.5); g.stroke();
    const R0 = m.rounds[0];
    R0.candidates.forEach((perm, i) => {
      const R = this._cardRect(i), sel = st.picks[0] === i;
      g.fillStyle = sel ? '#eaf4ff' : '#ffffff'; rr(g, R.x, R.y, R.w, R.h, 8); g.fill();
      g.strokeStyle = sel ? ACCENT : '#d3dae2'; g.lineWidth = sel ? 2.5 : 1.2; rr(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); g.stroke();
      g.strokeStyle = '#b9c3cd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(R.x + 12, R.y + R.h - 11.5); g.lineTo(R.x + R.w - 12, R.y + R.h - 11.5); g.stroke();
      if (m.kit) for (const b of this._skylineBars(R, perm)) drawPostIcon(g, m.kit.post, b, skin ? skin.colors[b.id] : TOWERS[b.id].color);
      else for (const b of this._skylineBars(R, perm)) { g.fillStyle = TOWERS[b.id].color; rr(g, b.x, b.y, b.w, b.h, 2); g.fill(); }
    });
    g.restore();
  },

  pointer(evt, env) {
    if (env.manifest.ring) return RING.pointer(evt, env);
    if (env.submitted || evt.type !== 'down') return [];
    for (let i = 0; i < NCARD; i++) {
      const R = this._cardRect(i);
      if (evt.x >= R.x && evt.x <= R.x + R.w && evt.y >= R.y && evt.y <= R.y + R.h) return [{ op: 'pick', choice: i }];
    }
    return [];
  },

  footerStatus(env) { if (env.manifest?.ring) return RING.footerStatus(env); return env.state.picks[0] == null ? 'Tap a picture' : '1 picture selected'; },
};
export function previewImage(m) { return m.ring ? RING.previewImage(m) : render(sceneFor(m), 2); }
export default task;
