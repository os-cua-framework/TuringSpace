import { drawPromptText } from '../core/panel.js';
import { render, toCanvas, contextScale, ringImage, pickNear, objectStats, segmentBlocker } from '../common/_seat_view_rt.js';
import { builder, person, chair, table, book, cup, roomEnv, orbitCam, sceneOf, PERSON_LOOKS } from '../common/_seat_view_props.js';
import * as SEAT_LOOK from '../common/_seat_view_look.js';
import * as GP from '../common/_seat_view_prop_kinds.js';
import { makeRemoveVariant } from '../common/_count_visible_remove.js';

const BOARD = { w: 380, h: 316 };
const N = 6;
const DECOY_MIN = 1;
const DECOY_PX = 4;
const TAB = { hx: 0.65, hz: 0.5, top: 0.74 };
const CUP_R = 0.057, CUP_H = 0.12;
const BOOK = { thick: [0.04, 0.055], wide: [0.23, 0.27], tall: [0.3, 0.34], dist: [0.5, 0.64] };
const BOOK_COLS = ['#2f5d8c', '#9a3f36', '#3f7a52', '#6b4a8a'];
const CUP_COLS = ['#e0b23e', '#3fa3c9', '#d65a8a', '#f08a3c', '#6fbf5a', '#f4f1ea', '#5b6bd1'];
const SEAT_GAP = 0.3;
const WALL_Z = -1.9;

const MARGIN = Object.freeze({ hideDeg: 5, clearDeg: 6, behind: 0.04, front: 0.08, overTop: 0.04, cupGapDeg: 3 });
const SLACK = 0.25;
const MIN_SEP = 0.18;
const CUP_BOOK = 0.09;
const TABLE_IN = 0.07;
const CAM_VIS = 0.85;
const MIN_PX = 230;
const CUP_SEP_PX = 30;

const round3 = (v) => Math.round(v * 1000) / 1000;
const round2 = (v) => Math.round(v * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;
const sAng = (a, b) => ((a - b + 540) % 360) - 180;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const bearing = (from, to) => deg(Math.atan2(to.z - from.z, to.x - from.x));
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const SEATS = [
  { side: 'far', yaw: 0, at: (j) => ({ x: j, z: -(TAB.hz + SEAT_GAP) }), cam: [[-80, -58], [58, 80]] },
];

const SCENES = new WeakMap();
function buildWorld(m, S = null) {
  const B = S ? S.B : builder(), kit = m.kit, role = (r) => { if (S) B.role = r; };
  role('table');
  table(B, 20, { x: 0, z: 0, hx: TAB.hx, hz: TAB.hz, top: TAB.top });
  const s = m.seat;
  role('seat');
  const seatY = kit ? GP.seat(B, 21, kit.seat, { x: s.x, z: s.z, yaw: s.yaw, col: S ? S.cushion : '#6d8fb3' })
    : chair(B, 21, { x: s.x, z: s.z, yaw: s.yaw, col: '#6d8fb3' });
  role('person');
  const P = person(B, 22, { x: s.x, z: s.z + 0, yaw: s.yaw, pose: 'sit', seatY, look: S ? S.outfit : PERSON_LOOKS[m.look], headPitch: 18 });
  role('blocker');
  m.books.forEach((b, i) => {
    const o = { x: b.x, z: b.z, yaw: b.yaw, w: b.w, d: b.d, h: b.h, col: S ? S.bookHex(b, i) : BOOK_COLS[b.col], y0: TAB.top };
    if (kit) GP.blocker(B, 30 + i, kit.occ[i], o); else book(B, 30 + i, o);
  });
  role('target');
  m.cups.forEach((c) => {
    const o = { x: c.x, z: c.z, y0: TAB.top, r: CUP_R, h: CUP_H, col: S ? S.cupHex(c) : kit ? GP.TARGET_COLS[kit.target][c.col] : CUP_COLS[c.col], handleYaw: c.hy };
    if (kit) GP.target(B, c.id, kit.target, o); else cup(B, c.id, o);
  });
  return { B, eye: P.eye, F: P.F };
}
function sceneFor(m) {
  if (SCENES.has(m)) return SCENES.get(m);
  const { B, eye, F } = buildWorld(m);
  const sc = sceneOf(B, orbitCam(m.camera, BOARD.w, BOARD.h), roomEnv({ wallZ: WALL_Z }));
  const out = { sc, eye, F };
  SCENES.set(m, out);
  return out;
}
function eyePoints(eye, F) {
  const [rx, rz] = F.r, [fx, fz] = F.f, out = [];
  for (const [u, w] of [[-0.032, 0], [0.032, 0], [0, 0], [-0.032, -0.04], [0.032, -0.04]]) out.push({ x: eye[0] + rx * u + fx * w, y: eye[1], z: eye[2] + rz * u + fz * w });
  return out;
}

function bookCorners(b) {
  const a = rad(b.yaw), ca = Math.cos(a), sa = Math.sin(a), out = [];
  for (const lx of [-b.w / 2, b.w / 2]) for (const lz of [-b.d / 2, b.d / 2]) out.push({ x: b.x + lx * ca + lz * sa, z: b.z - lx * sa + lz * ca });
  return out;
}
function bookLocal(b, p) {
  const a = rad(b.yaw), ca = Math.cos(a), sa = Math.sin(a), dx = p.x - b.x, dz = p.z - b.z;
  return { x: ca * dx - sa * dz, y: sa * dx + ca * dz };
}
function cupBookDist(b, p) {
  const q = bookLocal(b, p);
  return Math.hypot(Math.max(Math.abs(q.x) - b.w / 2, 0), Math.max(Math.abs(q.y) - b.d / 2, 0));
}
function bookGap(a, b) {
  let m = Infinity;
  for (const c of bookCorners(a)) m = Math.min(m, cupBookDist(b, c));
  for (const c of bookCorners(b)) m = Math.min(m, cupBookDist(a, c));
  return m;
}
function bookSpan(b, e, ref) {
  let lo = Infinity, hi = -Infinity, near = Infinity, far = -Infinity;
  for (const c of bookCorners(b)) {
    const t = sAng(bearing(e, c), ref), d = dist2(e, c);
    lo = Math.min(lo, t); hi = Math.max(hi, t); near = Math.min(near, d); far = Math.max(far, d);
  }
  return { lo, hi, near, far };
}
function worldVerdict(g, books, eyes, extra = 0) {
  let hidBy = -1, visible = true;
  books.forEach((b, bi) => {
    let covers = true, clear = true;
    for (const e of eyes) {
      const ref = bearing(e, g), D = dist2(e, g), half = deg(Math.asin(CUP_R / D)), S = bookSpan(b, e, ref);
      const rimY = TAB.top + CUP_H, lineAtBook = e.y - (e.y - rimY) * (S.near / Math.max(1e-6, D - CUP_R));
      if (!(S.lo <= -(half + MARGIN.hideDeg + extra) && S.hi >= half + MARGIN.hideDeg + extra
        && D - CUP_R >= S.far + MARGIN.behind && lineAtBook <= TAB.top + b.h - MARGIN.overTop)) covers = false;
      const aside = S.hi <= -(half + MARGIN.clearDeg + extra) || S.lo >= half + MARGIN.clearDeg + extra;
      const inFront = D + CUP_R <= S.near - MARGIN.front;
      if (!(aside || inFront)) clear = false;
    }
    if (covers) hidBy = bi;
    if (!clear) visible = false;
  });
  if (hidBy >= 0) return { hidden: hidBy };
  return visible ? { visible: true } : null;
}
function cupCovered(near, farC, e, extra = 0) {
  const Dn = dist2(e, near), Df = dist2(e, farC);
  if (Dn >= Df) return false;
  return Math.abs(sAng(bearing(e, near), bearing(e, farC))) - deg(Math.asin(CUP_R / Dn)) - deg(Math.asin(CUP_R / Df)) < MARGIN.cupGapDeg + extra;
}
function cupSamples(c) {
  const out = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.push([c.x + Math.cos(a) * (CUP_R + 0.002), TAB.top + CUP_H + 0.002, c.z + Math.sin(a) * (CUP_R + 0.002)]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; out.push([c.x + Math.cos(a) * (CUP_R + 0.002), TAB.top + CUP_H * 0.5, c.z + Math.sin(a) * (CUP_R + 0.002)]); }
  return out;
}
function rayVis(sc, c, e) {
  const S = cupSamples(c), skip = new Set([c.id, 22]);
  let n = 0, tot = 0;
  for (const q of S) {
    if ((q[0] - c.x) * (e.x - c.x) + (q[2] - c.z) * (e.z - c.z) < 0 && q[1] < TAB.top + CUP_H) continue;
    tot++;
    if (segmentBlocker(sc, e.x, e.y, e.z, q[0], q[1], q[2], skip) < 0) n++;
  }
  return n / tot;
}

const separable = (cups, hidden, key) => {
  const ord = cups.map((c) => ({ h: hidden.has(c.id), k: key(c) })).sort((a, b) => a.k - b.k);
  return ord.slice(1).filter((e, i) => e.h !== ord[i].h).length <= 1;
};

function hull(pts) {
  const p = pts.map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function bookOutline(cam, b) {
  const pts = [];
  for (const c of bookCorners(b)) for (const y of [TAB.top, TAB.top + b.h]) pts.push(cam.project(c.x, y, c.z));
  return hull(pts);
}
function depthIn(P, q) {
  let cx = 0, cy = 0;
  for (const p of P) { cx += p.x; cy += p.y; }
  cx /= P.length; cy /= P.length;
  let d = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    let nx = a.y - b.y, ny = b.x - a.x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    if ((cx - a.x) * nx + (cy - a.y) * ny < 0) { nx = -nx; ny = -ny; }
    d = Math.min(d, (q.x - a.x) * nx + (q.y - a.y) * ny);
  }
  return d;
}
function segDepth(P, p, q) {
  const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
  let best = -Infinity;
  for (let i = 0; i <= n; i++) { const t = i / n; best = Math.max(best, depthIn(P, { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })); }
  return best;
}
function lineRuleBlocked(cam, outlines, eyes, c) {
  const e = eyes[2], pe = cam.project(e.x, e.y, e.z);
  for (const y of [TAB.top + CUP_H / 2, TAB.top + CUP_H]) {
    const pc = cam.project(c.x, y, c.z);
    if (!outlines.some((P) => segDepth(P, pe, pc) >= DECOY_PX)) return false;
  }
  return true;
}

export function contractProblems(m) {
  if (m?.cue === 'remove') return removeV().contractProblems(m);
  const P = [];
  if (!m || m.task !== 'count_visible_from_their_seat') return ['task'];
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['board'];
  const seatDef = SEATS.find((s) => s.side === m.seat?.side);
  if (!seatDef || m.seat.yaw !== seatDef.yaw) return ['seat'];
  if (!Array.isArray(m.books) || m.books.length !== 2 || !Array.isArray(m.cups) || m.cups.length !== N) return ['shape'];
  const { sc, eye, F } = sceneFor(m), cam = sc.cam, eyes = eyePoints(eye, F);
  const E0 = { x: eye[0], y: eye[1], z: eye[2] };
  const relCam = Math.abs(sAng(m.camera.az, m.seat.yaw));
  if (relCam < 38 || relCam > 92) P.push('camera-angle');
  for (const b of m.books) {
    if (b.w < BOOK.wide[0] - 1e-6 || b.w > BOOK.wide[1] + 1e-6 || b.d < BOOK.thick[0] - 1e-6 || b.d > BOOK.thick[1] + 1e-6 || b.h < BOOK.tall[0] - 1e-6 || b.h > BOOK.tall[1] + 1e-6) P.push('book-size');
    if (bookCorners(b).some((c) => Math.abs(c.x) > TAB.hx - TABLE_IN + 1e-6 || Math.abs(c.z) > TAB.hz - TABLE_IN + 1e-6)) P.push('book-edge');
  }
  if (bookGap(m.books[0], m.books[1]) < 0.06) P.push('book-gap');
  const hidden = new Set(), vis = [];
  const ids = m.cups.map((c) => c.id).sort((a, b) => a - b);
  if (!arrEq(ids, [...Array(N).keys()])) P.push('ids');
  for (const c of m.cups) {
    if (Math.abs(c.x) > TAB.hx - TABLE_IN || Math.abs(c.z) > TAB.hz - TABLE_IN) P.push(`cup-edge${c.id}`);
    for (const o of m.cups) if (o.id < c.id && dist2(o, c) < MIN_SEP - 1e-6) P.push('cup-sep');
    if (m.books.some((b) => cupBookDist(b, c) < CUP_BOOK - 1e-6)) P.push(`cup-book${c.id}`);
    const w = worldVerdict(c, m.books, eyes);
    if (!w) { P.push(`ambiguous${c.id}`); continue; }
    const rv = eyes.map((e) => rayVis(sc, c, e));
    if (w.visible && !rv.every((v) => v === 1)) P.push(`ray-visible${c.id}`);
    if (!w.visible && !rv.every((v) => v === 0)) P.push(`ray-hidden${c.id}`);
    if (w.visible) vis.push(c.id); else hidden.add(c.id);
    const st = objectStats(sc, c.id, 2, true);
    if (st.frac < CAM_VIS || st.vis * 4 < MIN_PX) P.push(`cam-vis${c.id}`);
    if (!st.box || st.box[0] < 0.06 * BOARD.w || st.box[2] > 0.94 * BOARD.w || st.box[1] < 0.06 * BOARD.h || st.box[3] > 0.94 * BOARD.h) P.push(`frame${c.id}`);
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = cam.project(m.cups[i].x, TAB.top + CUP_H, m.cups[i].z), b = cam.project(m.cups[j].x, TAB.top + CUP_H, m.cups[j].z);
    if (Math.hypot(a.x - b.x, a.y - b.y) < CUP_SEP_PX) P.push('cup-sep-px');
  }
  for (const e of eyes) for (const i of vis) for (const c of m.cups) if (c.id !== i && cupCovered(c, m.cups.find((q) => q.id === i), e)) P.push('cup-covers-cup');
  vis.sort((a, b) => a - b);
  if (hidden.size < 1 || hidden.size > 3) P.push('hidden-count');
  if (!Array.isArray(m.answer) || !arrEq(m.answer, vis)) P.push('answer');
  if (separable(m.cups, hidden, (c) => dist2(E0, c))) P.push('distance-shortcut');
  const outlines = m.books.map((b) => bookOutline(cam, b));
  if (m.cups.filter((c) => !hidden.has(c.id) && lineRuleBlocked(cam, outlines, eyes, c)).length < DECOY_MIN) P.push('decoys');
  for (const id of [20, 21, 22, 30, 31]) {
    const st = objectStats(sc, id, 4, false);
    if (!st.box || st.box[0] < 0.05 * BOARD.w || st.box[2] > 0.95 * BOARD.w || st.box[1] < 0.04 * BOARD.h || st.box[3] > 0.96 * BOARD.h) P.push(`frame-obj${id}`);
  }
  return [...new Set(P)];
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

let REMOVE = null;
export function removeV() {
  return REMOVE || (REMOVE = makeRemoveVariant({ BOARD, N, TAB, CUP_R, CUP_H, MARGIN, SLACK, MIN_SEP, CUP_BOOK, TABLE_IN, CAM_VIS, MIN_PX, CUP_SEP_PX, SEATS,
    buildWorld, sceneFor, dropScene: (m) => SCENES.delete(m), eyePoints, bookCorners, cupBookDist, bookGap, bookSpan, cupCovered, cupSamples,
    separable, segmentBlocker, objectStats, orbitCam, bookOutline, segDepth }));
}

function tryBuild(rng, k, kit = null) {
  const seatDef = rng.pick(SEATS), j = round3(rng.uniform(-0.12, 0.12)), pos = seatDef.at(j);
  const camRange = rng.pick(seatDef.cam);
  const camera = { az: round2(rng.uniform(...camRange)), el: round2(rng.uniform(42, 48)), dist: 3.55, fov: 34, tx: round3(pos.x * 0.2), ty: 0.5, tz: round3(pos.z * 0.2) };
  const m = { task: 'count_visible_from_their_seat', board: { ...BOARD }, camera, seat: { side: seatDef.side, x: pos.x, z: pos.z, yaw: seatDef.yaw },
    look: rng.int(0, PERSON_LOOKS.length - 1), books: [], cups: [], answer: [] };
  if (kit) m.kit = kit;
  const probe = buildWorld(m), eyes = eyePoints(probe.eye, probe.F), E0 = { x: probe.eye[0], y: probe.eye[1], z: probe.eye[2] };
  const face = deg(Math.atan2(probe.F.f[1], probe.F.f[0]));
  const gap = rng.uniform(48, 70), centre = face + rng.uniform(-8, 8);
  const bcols = rng.shuffle([0, 1, 2, 3]);
  for (const [bi, phi0] of [centre - gap / 2, centre + gap / 2].entries()) {
    let placed = null;
    for (let t = 0; t < 40 && !placed; t++) {
      const phi = phi0 + rng.uniform(-3, 3), D = rng.uniform(...BOOK.dist);
      const b = { x: round3(E0.x + D * Math.cos(rad(phi))), z: round3(E0.z + D * Math.sin(rad(phi))),
        w: round3(rng.uniform(...BOOK.wide)), d: round3(rng.uniform(...BOOK.thick)), h: round3(rng.uniform(...BOOK.tall)),
        yaw: 0, col: bcols[bi] };
      b.yaw = round2(norm360(deg(Math.atan2(E0.x - b.x, E0.z - b.z)) + rng.uniform(-8, 8)));
      if (bookCorners(b).some((c) => Math.abs(c.x) > TAB.hx - TABLE_IN - 0.005 || Math.abs(c.z) > TAB.hz - TABLE_IN - 0.005)) continue;
      if (m.books.some((o) => bookGap(o, b) < 0.07)) continue;
      placed = b;
    }
    if (!placed) return null;
    m.books.push(placed);
  }
  const perBook = k === 1 ? rng.shuffle([1, 0]) : k === 2 ? (rng.uniform(0, 1) < 0.5 ? [1, 1] : rng.shuffle([2, 0])) : rng.shuffle([2, 1]);
  const cups = [];
  const fwd = (c) => (c.x - E0.x) * Math.cos(rad(face)) + (c.z - E0.z) * Math.sin(rad(face));
  const spaced = (c) => fwd(c) >= 0.34 && cups.every((o) => dist2(o, c) >= MIN_SEP + 0.005) && m.books.every((b) => cupBookDist(b, c) >= CUP_BOOK + 0.005)
    && Math.abs(c.x) <= TAB.hx - TABLE_IN && Math.abs(c.z) <= TAB.hz - TABLE_IN;
  for (const [bi, b] of m.books.entries()) {
    for (let n = 0; n < perBook[bi]; n++) {
      let placed = null;
      for (let t = 0; t < 80 && !placed; t++) {
        const half = deg(Math.atan(b.w / 2 / dist2(E0, b))) - 9, phi = bearing(E0, b) + rng.uniform(-Math.max(2, half), Math.max(2, half)), D = dist2(E0, b) + rng.uniform(0.12, 0.36);
        const c = { x: round3(E0.x + D * Math.cos(rad(phi))), z: round3(E0.z + D * Math.sin(rad(phi))) };
        if (!spaced(c)) continue;
        const w = worldVerdict(c, m.books, eyes, SLACK);
        if (!w || w.hidden !== bi) continue;
        placed = c;
      }
      if (!placed) return null;
      cups.push({ ...placed, hidden: true });
    }
  }
  const nearHidden = Math.min(...cups.map((c) => dist2(E0, c)));
  const cam = orbitCam(camera, BOARD.w, BOARD.h), outlines = m.books.map((b) => bookOutline(cam, b));
  for (let n = 0; n < N - k; n++) {
    let placed = null;
    for (let t = 0; t < (n < DECOY_MIN ? 400 : 200) && !placed; t++) {
      const c = { x: round3(rng.uniform(-TAB.hx + TABLE_IN, TAB.hx - TABLE_IN)), z: round3(rng.uniform(-TAB.hz + TABLE_IN, TAB.hz - TABLE_IN)) };
      if (!spaced(c)) continue;
      if (n === 0 && dist2(E0, c) <= nearHidden + 0.03) continue;
      if (n < DECOY_MIN && !lineRuleBlocked(cam, outlines, eyes, c)) continue;
      const w = worldVerdict(c, m.books, eyes, SLACK);
      if (!w || !w.visible) continue;
      if (eyes.some((e) => cups.some((o) => cupCovered(o, c, e, SLACK) || (!o.hidden && cupCovered(c, o, e, SLACK))))) continue;
      placed = c;
    }
    if (!placed) return null;
    cups.push({ ...placed, hidden: false });
  }
  const ids = rng.shuffle([...Array(N).keys()]), cols = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
  m.cups = cups.map((c, i) => ({ id: ids[i], x: c.x, z: c.z, col: cols[i], hy: round2(rng.uniform(0, 360)) })).sort((a, b) => a.id - b.id);
  m.answer = cups.map((c, i) => (c.hidden ? -1 : ids[i])).filter((i) => i >= 0).sort((a, b) => a - b);
  const P = contractProblems(m);
  SCENES.delete(m);
  return P.length ? null : m;
}

function generateExt(rng0, split) {
  const rng = GP.decorrelate(rng0);
  const kit = { target: GP.pickIn(rng, GP.TARGETS, split), occ: [GP.pickIn(rng, GP.BLOCKERS, split), GP.pickIn(rng, GP.BLOCKERS, split)], seat: GP.pickIn(rng, GP.SEATS, split) };
  const k = rng.int(1, 3);
  for (let attempt = 0; attempt < 12000; attempt++) {
    const m = tryBuild(rng, k, kit);
    if (m) return m;
  }
  throw new Error('count_visible_from_their_seat: generator exhausted (ext)');
}
const COVER_HEX = ['#2f5d8c', '#9a3f36', '#3f7a52', '#6b4a8a', '#c49a3a', '#2f6f6f', '#5a4632', '#3a3d45', '#b8683a', '#7a8a3a', '#8a2f4f', '#4a6a9a'];
const PAINT_TOPS = ['#f2efe8', '#2e3034', '#9fb09a', '#c9b79a', '#7d8f9f', '#e8dcc6', '#5a6b5a'];
async function styleSkin(style, m) {
  const look = await SEAT_LOOK.seatLook(style, { setting: 'any', rug: { x0: -1.05, x1: 1.05, z0: -1.35, z1: 0.95 } });
  const rnd = look.rnd, K = look.kit;
  const topKind = SEAT_LOOK.pickS(style, 'cv_top', ['wood', 'wood', 'painted', 'stone', 'cloth', 'metal']);
  let top, legs = K.woodA;
  if (topKind === 'wood') top = K.woodA;
  else if (topKind === 'painted') { top = { ...K.plaster(SEAT_LOOK.pickS(style, 'cv_paint_top', PAINT_TOPS)), ks: 0.2, sh: 34 }; legs = rnd() < 0.5 ? top : K.woodA; }
  else if (topKind === 'stone') { top = { ...K.stone(0.3 + 0.35 * rnd()), ks: 0.25, sh: 40, env: 0.05 }; legs = K.metal('#2e3034'); }
  else if (topKind === 'cloth') top = K.fabric(SEAT_LOOK.pickS(style, 'cv_cloth', ['#eeeae2', '#e8dcc0', '#c9d3c4', '#d8d0e0', '#e6d2b8']), 0, 0.3);
  else { top = K.metal(SEAT_LOOK.pickS(style, 'cv_metal_top', ['#a8acb2', '#6a6e74', '#c9c4b8'])); legs = K.metal('#3a3d42'); }
  const tableMat = { ...top, tex: (x, y, z, nx, ny, nz, s, out, fp) => ((s.k === 1 && s.hx > 0.1 && s.hy < 0.03) ? top : legs).tex(x, y, z, nx, ny, nz, s, out, fp) };
  const [[, shirt]] = SEAT_LOOK.shirtSet(style, 1);
  const outfit = SEAT_LOOK.outfit(style, PERSON_LOOKS[m.look], shirt);
  const cushion = SEAT_LOOK.pickS(style, 'cushion', ['#6d8fb3', '#8a6a4a', '#5a7a5a', '#a8a090', '#7a5a7a', '#c9b48a', '#4a5a6a']);
  const covers = SEAT_LOOK.shuffled(rnd, SEAT_LOOK.splitList(style, 'cv_cover', COVER_HEX, { minTest: 4 })), coverK = SEAT_LOOK.pickS(style, 'cv_cover_kind', ['cloth', 'paper', 'leather']);
  const kind = m.kit ? m.kit.target : 'mug', cols = m.kit ? GP.TARGET_COLS[kind] : CUP_COLS;
  const glaze = SEAT_LOOK.pickS(style, 'glaze', ['gloss', 'gloss', 'satin', 'matte']);
  const clothes = SEAT_LOOK.clothesRemap(look, [outfit]), cache = new Map();
  const remap = (name, hex, role, def) => {
    if (role === 'table' && name === 'wood') return tableMat;
    if (role === 'seat') { if (name === 'wood') return K.woodB; if (name === 'cloth') return K.fabric(hex, 0, 0.2); }
    if (role === 'person') return clothes(name, hex);
    if (role === 'blocker') {
      if (name === 'paint') { if (!cache.has(hex)) cache.set(hex, coverK === 'cloth' ? K.fabric(hex, 0, 0.16) : coverK === 'leather' ? { ...K.fabric(hex, 1, 0.1), ks: 0.25, sh: 30 } : SEAT_LOOK.flatMat(hex, 'satin')); return cache.get(hex); }
      if (name === 'def' && hex === 'board') return { ...K.woodB, tex: (x, y, z, nx, ny, nz, s, out, fp) => { if (def.hole(x, y, z, nx, ny, nz, s)) { out[0] = 0.02; out[1] = 0.018; out[2] = 0.015; } else K.woodB.tex(x, y, z, nx, ny, nz, s, out, fp); } };
    }
    if (role === 'target' && name === 'def' && def && /^(cup|vase|spot):/.test(hex)) return { ...def, ...SEAT_LOOK.FINISH[glaze] };
    return null;
  };
  const bookHex = m.cue === 'remove' ? (b) => BOOK_COLS[b.col] : (b, i) => covers[(b.col + i) % covers.length];
  return { look, remap, outfit, cushion, bookHex, cupHex: (c) => cols[c.col % cols.length] };
}
const STYLED = new WeakMap();
function styledScene(m, skin) {
  const c = STYLED.get(m);
  if (c && c.skin === skin) return c.sc;
  const B = SEAT_LOOK.styledBuilder(skin.remap);
  buildWorld(m, { ...skin, B });
  const cam = orbitCam(m.camera, BOARD.w, BOARD.h);
  const sc = sceneOf(B, cam, skin.look.walls({ wallZ: WALL_Z, sideX: 2.1 }, cam.eye[0]), skin.look.light);
  STYLED.set(m, { skin, sc });
  return sc;
}

export function semanticKey(m) {
  if (m?.cue === 'remove') return removeV().semanticKey(m);
  const q = (v) => Math.round(v / 0.16), vis = new Set(m.answer);
  const things = m.cups.map((c) => `${q(c.x)},${q(c.z)}${vis.has(c.id) ? 'v' : 'h'}`).sort();
  const blockers = m.books.map((b) => `${q(b.x)},${q(b.z)}`).sort();
  return `count_visible|${m.seat.side}|${things.join(';')}|${blockers.join(';')}`;
}

const task = {
  meta: {
    name: 'count_visible_from_their_seat', family: 'A', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'toggle', item: 'cup id 0..5 (tap a cup; tap again to unselect)' }],
    promptHuman: 'Select every cup the seated person can see',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs.cue === 'remove') return removeV().generate(rng);
    if (knobs.ext) return generateExt(rng, knobs.ext);
    const k = rng.int(1, 3);
    for (let attempt = 0; attempt < 12000; attempt++) {
      const m = tryBuild(rng, k);
      if (m) return m;
    }
    throw new Error('count_visible_from_their_seat: generator exhausted');
  },

  init() { return { sel: [] }; },

  applyAction(state, action, m) {
    if (action?.op !== 'toggle') return { ok: false, reason: 'bad-op' };
    const it = action.item;
    if (!Number.isInteger(it) || it < 0 || it >= N) return { ok: false, reason: 'bad-item' };
    const i = state.sel.indexOf(it);
    if (i >= 0) state.sel.splice(i, 1); else state.sel.push(it);
    state.sel.sort((a, b) => a - b);
    return { ok: true, on: i < 0 };
  },

  verify(state, m) {
    const want = new Set(m.answer), got = new Set(state.sel.filter((id) => id >= 0 && id < N));
    const correct = [...want].filter((id) => got.has(id)).length, falsePos = [...got].filter((id) => !want.has(id)).length;
    const success = correct === want.size && falsePos === 0;
    return { success, error: success ? 0 : 1, partial: want.size ? correct / want.size : 0, detail: { correct, falsePos } };
  },

  oracle(m) { return m.answer.map((id) => ({ op: 'toggle', item: id })); },

  randomPolicy(m, rnd) {
    const acts = [];
    for (let id = 0; id < N; id++) if (rnd() < 0.5) acts.push({ op: 'toggle', item: id });
    return acts;
  },

  async mount(env) {
    env.assets.cvs = {};
    if (env.style) env.assets.skin = await styleSkin(env.style, env.manifest);
  },

  drawPrompt(g, r, env) {
    const kit = env?.manifest?.kit;
    if (env?.manifest?.cue === 'remove') { drawPromptText(g, r, ...removeV().prompt(env.manifest)); return; }
    if (kit) { drawPromptText(g, r, `Select every ${GP.TARGET_NOUN[kit.target]} the seated person can see`, 'Judge from their seat, not from yours'); return; }
    drawPromptText(g, r, 'Select every cup the seated person can see', 'Judge from their chair, not from yours');
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, A = env.assets.cvs || (env.assets.cvs = {});
    const q = contextScale(g), skin = env.style ? env.assets.skin : null, key = `${q}` + (skin ? '|' + env.style.key : '');
    if (A.m !== m || A.key !== key) { A.m = m; A.key = key; A.img = render(skin ? styledScene(m, skin) : sceneFor(m).sc, q); A.canvas = toCanvas(A.img); A.ringKey = ''; }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    const rk = st.sel.join(',');
    if (rk) {
      if (A.ringKey !== rk) { A.ring = toCanvas(ringImage(A.img, new Set(st.sel))); A.ringKey = rk; }
      g.drawImage(A.ring, 0, 0, BOARD.w, BOARD.h);
    }
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down' || evt.x < 0 || evt.y < 0 || evt.x > BOARD.w || evt.y > BOARD.h) return [];
    const id = pickNear(sceneFor(env.manifest).sc, evt.x, evt.y, 12, (i) => i >= 0 && i < N);
    return id >= 0 ? [{ op: 'toggle', item: id }] : [];
  },

  footerStatus(env) {
    const n = env.state.sel.length, kit = env.manifest.kit;
    return n ? `${n} selected` : kit ? `Tap a ${GP.TARGET_NOUN[kit.target]} to select it` : 'Tap a cup to select it';
  },
};
export function previewImage(m) { return render(sceneFor(m).sc, 2); }
export default task;
