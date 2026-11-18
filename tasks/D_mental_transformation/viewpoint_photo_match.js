import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, makeCam, objectStats, shape } from '../common/_seat_view_rt.js';
import { builder, sofa, tvStand, plant, floorLamp, shelf, carton, chair, tripodCamera, roomEnv, orbitCam, sceneOf, LIGHT } from '../common/_seat_view_props.js';
import * as SEAT_LOOK from '../common/_seat_view_look.js';
import * as GP from '../common/_seat_view_prop_kinds.js';

const BOARD = { w: 380, h: 489 };
const N_PROPS = 5, N_CAM = 2, N_PHOTOS = 9, STATION_GAP = 61, CAM_GAP = 100;
const STATION_IN = [16, 150], AIM_J = 85;
const OVER_H = 226;
const ROOM = { x: 0, y: 0, w: 320, h: 320 };
const WALL_GAP = 34;
const S = 0.02;
const HALF = 32;
const EYE = 42;
const IN_M = 6, OUT_M = 14, OUT_CLEAN = 1.5, FAR_OUT = 30, SHOWN_MIN = 0.7, ORDER_GAP = 8;
const DECOY_OUT = OUT_CLEAN;
const MIN_FWD = 84, MAX_DIST = 330;
const CARD_W = 118, CARD_H = 78, CARD_GAP = 7, CARD_Y0 = OVER_H + 12;
const CARD = (i) => ({ x: (BOARD.w - (3 * CARD_W + 2 * CARD_GAP)) / 2 + (i % 3) * (CARD_W + CARD_GAP), y: CARD_Y0 + Math.floor(i / 3) * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H });
const HZ = 0.34;
const DEG = 180 / Math.PI;
const rad = (d) => d / DEG;
const round2 = (v) => Math.round(v * 100) / 100;

const TYPES = [
  { name: 'sofa', a: 43, b: 26, h: 42 },
  { name: 'tv', a: 36, b: 12, h: 53 },
  { name: 'plant', a: 14, b: 14, h: 42 },
  { name: 'lamp', a: 10, b: 10, h: 70 },
  { name: 'shelf', a: 21, b: 10, h: 80 },
  { name: 'box', a: 14, b: 12, h: 24 },
  { name: 'chair', a: 12, b: 12, h: 45 },
];
const ext = (p) => { const t = TYPES[p.t]; return p.rot % 2 ? { a: t.b, b: t.a } : { a: t.a, b: t.b }; };

let BASIS_DIR = NaN, BASIS = null;
function basis(dir) {
  if (dir === BASIS_DIR) return BASIS;
  BASIS_DIR = dir;
  return (BASIS = { f: { x: Math.sin(rad(dir)), y: -Math.cos(rad(dir)) }, r: { x: Math.cos(rad(dir)), y: Math.sin(rad(dir)) } });
}
function shoot(pose, props, r) {
  const { f, r: rt } = basis(pose.dir), F = (r.w / 2) / Math.tan(rad(HALF)), hz = r.h * HZ, items = [];
  for (const p of props) {
    const t = TYPES[p.t], e = ext(p);
    const dx = p.x - pose.x, dy = p.y - pose.y, fwd = dx * f.x + dy * f.y, lat = dx * rt.x + dy * rt.y;
    if (fwd <= 1) continue;
    const bearing = Math.atan2(lat, fwd) * DEG;
    if (Math.abs(bearing) > HALF) continue;
    const halfW = (e.a * Math.abs(rt.x) + e.b * Math.abs(rt.y)) * F / fwd;
    items.push({ p, t, fwd, lat, bearing, dist: Math.hypot(dx, dy), x: r.w / 2 + (lat / fwd) * F, halfW,
      yBase: hz + (EYE / fwd) * F, yTop: hz + ((EYE - t.h) / fwd) * F });
  }
  items.sort((u, v) => u.bearing - v.bearing);
  return { F, hz, items };
}
function span(pose, p) {
  const { f, r } = basis(pose.dir), e = ext(p);
  let lo = Infinity, hi = -Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const dx = p.x + sx * e.a - pose.x, dy = p.y + sy * e.b - pose.y, fwd = dx * f.x + dy * f.y;
    if (fwd <= 4) return null;
    const b = Math.atan2(dx * r.x + dy * r.y, fwd) * DEG;
    lo = Math.min(lo, b); hi = Math.max(hi, b);
  }
  return { lo, hi };
}
function besideOk(pose, p, outM) {
  const { f, r } = basis(pose.dir), e = ext(p);
  let side = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const dx = p.x + sx * e.a - pose.x, dy = p.y + sy * e.b - pose.y, fwd = dx * f.x + dy * f.y, lat = dx * r.x + dy * r.y;
    if (fwd <= 0) { side = side || Math.sign(lat); if (Math.sign(lat) !== side && Math.abs(lat) > 1) return false; continue; }
    const b = Math.atan2(lat, fwd) * DEG;
    if (Math.abs(b) < HALF + 8) return false;
    side = side || Math.sign(b);
    if (Math.sign(b) !== side) return false;
  }
  return true;
}
const centreBearing = (pose, p) => { const { f, r } = basis(pose.dir), dx = p.x - pose.x, dy = p.y - pose.y; return Math.atan2(dx * r.x + dy * r.y, dx * f.x + dy * f.y) * DEG; };
const boxOf = (it) => ({ x0: it.x - it.halfW, x1: it.x + it.halfW, y0: Math.max(0, it.yTop), y1: it.yBase });
function shownFraction(it, items, r) {
  const a = boxOf(it), own = (a.x1 - a.x0) * (a.y1 - a.y0);
  if (own <= 0) return 0;
  const cx0 = Math.max(a.x0, 0), cx1 = Math.min(a.x1, r.w);
  let vis = Math.max(0, cx1 - cx0) * (a.y1 - a.y0);
  for (const o of items) {
    if (o === it || o.fwd >= it.fwd) continue;
    const b = boxOf(o);
    vis -= Math.max(0, Math.min(cx1, b.x1) - Math.max(cx0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  }
  return vis / own;
}
const standsClear = (pose, props) => props.every((p) => { const e = ext(p); return Math.abs(pose.x - p.x) >= e.a + 18 || Math.abs(pose.y - p.y) >= e.b + 18; });
function stationOk(pose, props, outM = OUT_M) {
  if (!standsClear(pose, props)) return null;
  const r = CARD(0), shot = shoot(pose, props, r), { items } = shot;
  if (items.length < 2 || items.length > 4) return null;
  const inShot = new Map(items.map((it) => [it.p, it]));
  for (const p of props) {
    const s = span(pose, p), it = inShot.get(p);
    if (!s) { if (it || !besideOk(pose, p, outM)) return null; continue; }
    if (it) {
      if (s.lo < -(HALF - IN_M) || s.hi > HALF - IN_M) return null;
      if (shownFraction(it, items, r) < SHOWN_MIN) return null;
    } else if (!(s.lo >= HALF + outM || s.hi <= -(HALF + outM))) return null;
  }
  for (const it of items) {
    if (it.fwd < MIN_FWD || it.dist > MAX_DIST) return null;
    if (it.yBase > r.h - 4) return null;
    if (it.halfW * 2 > r.w * 0.62) return null;
    if (it.halfW < 4 || it.yBase - Math.max(0, it.yTop) < 12) return null;
  }
  for (let i = 1; i < items.length; i++) {
    const A = items[i - 1], B = items[i];
    if (B.bearing - A.bearing < ORDER_GAP) return null;
    if (B.x - A.x < Math.max(18, 0.55 * (A.halfW + B.halfW))) return null;
  }
  return shot;
}
const shotKey = (shot) => shot._k ?? (shot._k = shot.items.map((it) => it.p.t).join(','));
const setKey = (shot) => shot._s ?? (shot._s = shot.items.map((it) => it.p.t).sort((u, v) => u - v).join(','));
function distinctShots(A, B) {
  if (shotKey(A) === shotKey(B)) return false;
  if (setKey(A) !== setKey(B)) return true;
  let worst = 0;
  for (const a of A.items) { const b = B.items.find((z) => z.p === a.p); if (!b) return true; worst = Math.max(worst, Math.abs(a.x - b.x)); }
  return worst >= 26;
}
function differentPhotos(A, B) {
  if (shotKey(A) !== shotKey(B)) return true;
  return A.items.some((a) => Math.abs(a.x - B.items.find((z) => z.p === a.p).x) >= 26);
}
const sameShot = (A, B, tol) => shotKey(A) === shotKey(B) && A.items.every((a) => { const b = B.items.find((z) => z.p === a.p); return b && Math.abs(a.x - b.x) < tol; });
function farOut(pose, p) {
  const s = span(pose, p);
  if (!s) return Math.abs(centreBearing(pose, p)) >= 60;
  return s.lo >= HALF + FAR_OUT || s.hi <= -(HALF + FAR_OUT);
}
function robustlyWrong(cam, camShot, photo) {
  const mine = camShot.items.map((it) => it.p), theirs = photo.items.map((it) => it.p);
  if (mine.some((p) => !theirs.includes(p))) return true;
  if (theirs.some((p) => farOut(cam, p))) return true;
  const order = theirs.filter((p) => mine.includes(p));
  return order.some((p, i) => p !== mine[i]);
}

const RC = { x: ROOM.x + ROOM.w / 2, y: ROOM.y + ROOM.h / 2 };
const wx = (x) => (x - RC.x) * S, wz = (y) => (y - RC.y) * S;
const yawOf = (dir) => 180 - dir;
const ROOM_W = ROOM.w * S, ROOM_D = ROOM.h * S, WALL_H = 2.4, WALL_T = 0.08;

function photoCam(pose, w, h) {
  const { f } = basis(pose.dir), F = (w / 2) / Math.tan(rad(HALF));
  const eye = [wx(pose.x), EYE * S, wz(pose.y)], fovY = 2 * Math.atan((h / 2) / F) * DEG;
  return makeCam({ eye, target: [eye[0] + f.x, eye[1], eye[2] + f.y], fovY, W: w, H: h, shiftY: h * HZ - h / 2 });
}

function addProps(B, props, kit = null, SK = null) {
  props.forEach((p, i) => {
    const t = TYPES[p.t], x = wx(p.x), z = wz(p.y), yaw = p.yaw;
    if (SK) B.role = t.name;
    if (kit) { addVariant(B, i, t.name, kit.var[t.name], { x, z, yaw }, SK ? SK.cols : {}); return; }
    if (t.name === 'sofa') sofa(B, i, { x, z, yaw, col: '#a9674a', hw: 0.82 });
    else if (t.name === 'tv') tvStand(B, i, { x, z, yaw });
    else if (t.name === 'plant') plant(B, i, { x, z, scale: 1.0 });
    else if (t.name === 'lamp') floorLamp(B, i, { x, z, h: 1.4 });
    else if (t.name === 'shelf') shelf(B, i, { x, z, yaw, col: '#3f8f97' });
    else if (t.name === 'box') carton(B, i, { x, z, yaw, hx: 0.26, hy: 0.24, hz: 0.22 });
    else chair(B, i, { x, z, yaw, col: '#c8553d' });
  });
}
function addWalls(B, which) {
  if (B.style) B.role = 'wall';
  const m = B.mat('matte', '#ece6db'), base = B.mat('matte', '#f7f4ee');
  const W2 = ROOM_W / 2, D2 = ROOM_D / 2;
  const walls = { n: [0, -D2 - WALL_T / 2, W2 + WALL_T, WALL_T / 2], s: [0, D2 + WALL_T / 2, W2 + WALL_T, WALL_T / 2], w: [-W2 - WALL_T / 2, 0, WALL_T / 2, D2], e: [W2 + WALL_T / 2, 0, WALL_T / 2, D2] };
  for (const k of which) {
    const [cx, cz, hx, hz] = walls[k];
    B.add(shape.box(90, m, cx, WALL_H / 2, cz, hx, WALL_H / 2, hz));
    B.add(shape.box(90, base, cx, 0.04, cz, hx + (hx < hz ? 0.006 : 0), 0.04, hz + (hz < hx ? 0.006 : 0)));
  }
}
const ENV = roomEnv({});
const PHOTO_LIGHT = { ...LIGHT, sky: [0.5, 0.5, 0.52] };

const CACHE = new WeakMap();
function cacheOf(m) { if (!CACHE.has(m)) CACHE.set(m, {}); return CACHE.get(m); }
function overviewScene(m, SK = null) {
  const C = SK ? styledCache(m, SK) : cacheOf(m);
  if (C.over) return C.over;
  const B = SK ? SEAT_LOOK.styledBuilder(SK.remap) : builder();
  if (SK) B.style = true;
  addProps(B, m.props, m.kit, SK);
  const a = rad(m.view.az), far = [Math.cos(a) > 0 ? 'n' : 's', Math.sin(a) > 0 ? 'w' : 'e'];
  addWalls(B, far);
  if (SK) B.role = 'camera';
  m.cameras.forEach((c, k) => tripodCamera(B, 50 + k, { x: wx(c.x), z: wz(c.y), yaw: yawOf(c.dir), h: EYE * S, size: 1.3, col: SK ? SK.cols.camera : undefined }));
  C.over = sceneOf(B, orbitCam({ ...m.view, tx: m.view.tx ?? 0, ty: 0.35, tz: m.view.tz ?? 0 }, BOARD.w, OVER_H), SK ? SK.look.env({}) : ENV, SK ? SK.look.light : LIGHT);
  return C.over;
}
function photoScene(m, i, SK = null) {
  const C = SK ? styledCache(m, SK) : cacheOf(m);
  C.photos = C.photos || [];
  if (C.photos[i]) return C.photos[i];
  const B = SK ? SEAT_LOOK.styledBuilder(SK.remap) : builder();
  if (SK) B.style = true;
  addProps(B, m.props, m.kit, SK);
  addWalls(B, ['n', 's', 'w', 'e']);
  C.photos[i] = sceneOf(B, photoCam(m.cards[i].pose, CARD_W, CARD_H), SK ? SK.look.env({}) : ENV, SK ? { ...SK.look.light, sky: SK.look.light.sky.map((v) => v * 1.087) } : PHOTO_LIGHT);
  return C.photos[i];
}
const STYLED = new WeakMap();
function styledCache(m, SK) { const c = STYLED.get(m); if (c && c.SK === SK) return c; const n = { SK }; STYLED.set(m, n); return n; }

function viewConsistent(pose) {
  const r = CARD(0), { f, r: rt } = basis(pose.dir), cam = photoCam(pose, r.w, r.h);
  const probe = (deg) => {
    const th = rad(deg), k = 140, px = pose.x + (f.x * Math.cos(th) + rt.x * Math.sin(th)) * k, py = pose.y + (f.y * Math.cos(th) + rt.y * Math.sin(th)) * k;
    return cam.project(wx(px), 0.3, wz(py)).x;
  };
  if (!(probe(HALF / 2) > r.w / 2 + 1) || !(probe(-HALF / 2) < r.w / 2 - 1)) return false;
  return true;
}

function planProblems(m) {
  const P = [];
  if (!m || m.task !== 'viewpoint_photo_match' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['task'];
  const { props, cameras, cards, answers } = m;
  if (!Array.isArray(props) || props.length !== N_PROPS || !Array.isArray(cards) || cards.length !== N_PHOTOS) return ['shape'];
  if (!Array.isArray(answers) || answers.length !== N_CAM || !answers.every((a) => Number.isInteger(a) && a >= 0 && a < N_PHOTOS) || new Set(answers).size !== N_CAM
    || !Array.isArray(cameras) || cameras.length !== N_CAM || !m.view) return ['answer'];
  if (new Set(props.map((p) => p.t)).size !== N_PROPS) P.push('kinds');
  for (const p of props) {
    const e = ext(p);
    if (p.x - e.a < ROOM.x + WALL_GAP - 1e-6 || p.x + e.a > ROOM.x + ROOM.w - WALL_GAP + 1e-6 || p.y - e.b < ROOM.y + WALL_GAP - 1e-6 || p.y + e.b > ROOM.y + ROOM.h - WALL_GAP + 1e-6) P.push('prop-wall');
    if (p.yaw !== norm360(p.rot * 90 + p.face)) P.push('prop-yaw');
  }
  for (let i = 0; i < N_PROPS; i++) for (let j = i + 1; j < N_PROPS; j++) {
    const p = props[i], q = props[j], a = ext(p), b = ext(q);
    if (Math.hypot(p.x - q.x, p.y - q.y) < 62) P.push('prop-near');
    if (!(Math.abs(p.x - q.x) >= a.a + b.a + 14 || Math.abs(p.y - q.y) >= a.b + b.b + 14)) P.push('prop-overlap');
  }
  const shots = [];
  for (let i = 0; i < N_PHOTOS; i++) {
    const c = cards[i];
    if (!c || c.id !== i || !c.pose || ![c.pose.x, c.pose.y, c.pose.dir].every(Number.isFinite)) return [...P, 'card'];
    const shot = stationOk(c.pose, props, answers.includes(i) ? OUT_M : DECOY_OUT);
    if (!shot) { P.push(`station${i}`); continue; }
    if (!viewConsistent(c.pose)) P.push(`mirror${i}`);
    shots.push(shot);
  }
  if (shots.length === N_PHOTOS) {
    for (let i = 0; i < N_PHOTOS; i++) for (let j = i + 1; j < N_PHOTOS; j++) {
      if (!(answers.includes(i) || answers.includes(j) ? distinctShots : differentPhotos)(shots[i], shots[j])) P.push('same-photos');
      if (Math.hypot(cards[i].pose.x - cards[j].pose.x, cards[i].pose.y - cards[j].pose.y) <= STATION_GAP - 1) P.push('stations-near');
    }
    if (Math.hypot(cameras[0].x - cameras[1].x, cameras[0].y - cameras[1].y) < CAM_GAP - 1e-6) P.push('cameras-near');    cameras.forEach((cam, k) => {
      const mine = cards[answers[k]].pose;
      if (cam.x !== mine.x || cam.y !== mine.y || cam.dir !== mine.dir) P.push('camera-pose');
      const own = shoot(cam, props, CARD(0));
      const hits = cards.filter((c) => sameShot(shoot(c.pose, props, CARD(0)), own, 24));
      if (hits.length !== 1 || hits[0].id !== answers[k]) P.push('answer');
      for (let i = 0; i < N_PHOTOS; i++) if (i !== answers[k] && !robustlyWrong(cam, own, shots[i])) P.push(i === answers[1 - k] ? 'weak-pair' : 'weak-decoy');
    });
  }
  return [...new Set(P)];
}
function overviewProblems(m) {
  const P = [], sc = overviewScene(m);
  for (const id of [...Array(N_PROPS).keys(), 50, 51]) {
    const st = objectStats(sc, id, 3, true);
    if (st.frac < (id >= 50 ? 0.85 : 0.6)) P.push(`over-occluded${id}`);
    if (!st.box || st.box[0] < 0.04 * BOARD.w || st.box[2] > 0.96 * BOARD.w || st.box[1] < 0.04 * OVER_H || st.box[3] > 0.96 * OVER_H) P.push(`over-frame${id}`);
  }
  return P;
}
const SIDE = [70, 110];
function overviewCam(view) { return orbitCam({ ...view, tx: view.tx ?? 0, ty: 0.35, tz: view.tz ?? 0 }, BOARD.w, OVER_H); }
function trapOf(cam, shot, view, oc = overviewCam(view)) {
  const O = shot.items.map((it) => it.p.t);
  const sx = new Map(shot.items.map((it) => [it.p.t, oc.project(wx(it.p.x), TYPES[it.p.t].h * S / 2, wz(it.p.y)).x]));
  const V = O.slice().sort((u, v) => sx.get(u) - sx.get(v)), rV = V.slice().reverse();
  const th = Math.abs(norm360(cam.dir + view.az + 180) - 180);
  const k = (a) => a.join(',');
  return { O: k(O), V: k(V), rV: k(rV), set: shot.items.map((it) => it.p.t).sort((u, v) => u - v).join(','), th,
    rule: th < 90 ? k(V) : k(rV), trap: k(V) !== k(O) ? k(V) : k(rV) };
}
const isSide = (T) => T.th >= SIDE[0] - 1e-9 && T.th <= SIDE[1] + 1e-9 && T.rule !== T.O;
function trapNeeds(Ts) {
  const side = Ts.findIndex(isSide);
  if (side < 0) return null;
  const need = Ts.map((T) => ({ set: T.set, ord: T.trap }));
  const add = (set, ord) => { if (!need.some((n) => n.set === set && n.ord === ord)) need.push({ set, ord }); };
  add(Ts[side].set, Ts[side].rule);
  for (const which of ['V', 'rV']) {
    const T = Ts.find((t) => t[which] !== t.O && need.some((n) => n.set === t.set && n.ord === t[which])) || Ts.find((t) => t[which] !== t.O);
    if (!T) return null;
    add(T.set, T[which]);
  }
  return need;
}
export function trapInfo(m) {
  const oc = overviewCam(m.view);
  return m.cameras.map((cam) => trapOf(cam, shoot(cam, m.props, CARD(0)), m.view, oc));
}
function trapProblems(m) {
  if (m.kit) return [];
  const P = [], Ts = trapInfo(m), need = trapNeeds(Ts);
  if (!need) return ['no-side-camera'];
  const decoys = m.cards.filter((c) => !m.answers.includes(c.id)).map((c) => shoot(c.pose, m.props, CARD(0)));
  for (const n of need) if (!decoys.some((s) => setKey(s) === n.set && shotKey(s) === n.ord)) P.push('no-trap-decoy');
  return [...new Set(P)];
}
export function contractProblems(m) {
  const P = planProblems(m);
  if (P.some((p) => p === 'task' || p === 'shape' || p === 'answer' || p === 'card')) return P;
  return [...new Set([...P, ...trapProblems(m), ...overviewProblems(m)])];
}
export function framingScores(m) {
  return m.cards.map((c) => {
    let vis = Infinity, full = Infinity;
    for (const p of m.props) {
      const s = span(c.pose, p);
      const k = s ? (s.lo >= -HALF && s.hi <= HALF ? Math.min(s.lo + HALF, HALF - s.hi) : Math.min(Math.abs(s.lo) - HALF, Math.abs(s.hi) - HALF)) : Math.abs(centreBearing(c.pose, p)) - HALF;
      full = Math.min(full, k);
      if (s && s.lo >= -HALF && s.hi <= HALF) vis = Math.min(vis, k);
    }
    return { vis, full };
  });
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }
const norm360 = (d) => ((d % 360) + 360) % 360;

function placeProps(rng) {
  const kinds = rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, N_PROPS), props = [];
  for (const t of kinds) {
    let ok = false;
    for (let tries = 0; tries < 220 && !ok; tries++) {
      const rot = rng.int(0, 3), face = 0;
      const p = { t, rot, face, yaw: norm360(rot * 90 + face), x: 0, y: 0 };
      const e = ext(p);
      p.x = round2(rng.uniform(ROOM.x + WALL_GAP + e.a, ROOM.x + ROOM.w - WALL_GAP - e.a));
      p.y = round2(rng.uniform(ROOM.y + WALL_GAP + e.b, ROOM.y + ROOM.h - WALL_GAP - e.b));
      const clear = props.every((q) => { const qe = ext(q); return Math.hypot(p.x - q.x, p.y - q.y) >= 62 + 1 && (Math.abs(p.x - q.x) >= e.a + qe.a + 15 || Math.abs(p.y - q.y) >= e.b + qe.b + 15); });
      if (clear) { props.push(p); ok = true; }
    }
    if (!ok) return null;
  }
  return props;
}
function aimOk(pose, props, outM) {
  let n = 0;
  for (const p of props) {
    const s = span(pose, p);
    if (!s) { if (!besideOk(pose, p, outM)) return false; continue; }
    if (s.lo >= -(HALF - IN_M) && s.hi <= HALF - IN_M) n++;
    else if (!(s.lo >= HALF + outM || s.hi <= -(HALF + outM))) return false;
  }
  return n >= 2 && n <= 4;
}
function sampleStation(rng, props, outM) {
  for (let k = 0; k < 60; k++) {
    const wall = rng.int(0, 3), IN = rng.uniform(STATION_IN[0], STATION_IN[1]), J = AIM_J;
    let x, y, base;
    if (wall === 0) { x = rng.uniform(ROOM.x + 34, ROOM.x + ROOM.w - 34); y = ROOM.y + IN; base = 180; }
    else if (wall === 1) { x = rng.uniform(ROOM.x + 34, ROOM.x + ROOM.w - 34); y = ROOM.y + ROOM.h - IN; base = 0; }
    else if (wall === 2) { x = ROOM.x + IN; y = rng.uniform(ROOM.y + 34, ROOM.y + ROOM.h - 34); base = 90; }
    else { x = ROOM.x + ROOM.w - IN; y = rng.uniform(ROOM.y + 34, ROOM.y + ROOM.h - 34); base = -90; }
    const pose = { x: round2(x), y: round2(y), dir: round2(base + rng.uniform(-J, J)) };
    if (standsClear(pose, props) && aimOk(pose, props, outM)) return { ...pose, wall };
  }
  return null;
}
function candidatePool(rng, props) {
  const pool = [];
  const draw = (n) => {
    for (let t = 0; t < n; t++) {
      const pose = sampleStation(rng, props, DECOY_OUT);
      if (!pose) continue;
      const shot = stationOk(pose, props, DECOY_OUT);
      if (!shot || !viewConsistent(pose)) continue;
      pool.push({ pose, shot, cam: stationOk(pose, props, OUT_M) !== null });
    }
  };
  draw(70);
  if (pool.length < 10 || pool.filter((c) => c.cam).length < N_CAM) return null;
  draw(330);
  return pool;
}
function chooseStations(rng, pool) {
  const gap = (a, b) => Math.hypot(a.pose.x - b.pose.x, a.pose.y - b.pose.y);
  const camOk = (a, b) => gap(a, b) >= CAM_GAP && distinctShots(a.shot, b.shot) && robustlyWrong(a.pose, a.shot, b.shot) && robustlyWrong(b.pose, b.shot, a.shot);
  const decoyOf = (a, d) => gap(a, d) > STATION_GAP && distinctShots(a.shot, d.shot) && robustlyWrong(a.pose, a.shot, d.shot);
  const decoyPair = (d, e) => gap(d, e) > STATION_GAP && differentPhotos(d.shot, e.shot);
  const cams = pool.filter((c) => c.cam), pairs = [];
  for (let i = 0; i < cams.length; i++) for (let j = i + 1; j < cams.length; j++) if (camOk(cams[i], cams[j])) pairs.push([cams[i], cams[j]]);
  const need = N_PHOTOS - N_CAM;
  for (const [a, b] of rng.shuffle(pairs).slice(0, 12)) {
    const D = rng.shuffle(pool.filter((d) => d !== a && d !== b && decoyOf(a, d) && decoyOf(b, d)));
    if (D.length < need) continue;
    const got = []; let steps = 0;
    const rec = (from) => {
      if (got.length === need) return true;
      for (let i = from; i < D.length && D.length - i >= need - got.length && steps++ < 6000; i++) {
        if (got.every((g) => decoyPair(g, D[i]))) { got.push(D[i]); if (rec(i + 1)) return true; got.pop(); }
      }
      return false;
    };
    if (rec(0)) return [a, b, ...got];
  }
  return null;
}
function tryBuild(rng, kit = null) {
  const props = placeProps(rng);
  if (!props) return null;
  const pool = candidatePool(rng, props);
  if (!pool) return null;
  const sel = chooseStations(rng, pool);
  if (!sel) return null;
  const poses = sel.map((c) => c.pose);
  const wallDist = (pose) => { const { f } = basis(pose.dir); let t = Infinity;
    for (const [p0, d, lo, hi] of [[pose.x, f.x, ROOM.x, ROOM.x + ROOM.w], [pose.y, f.y, ROOM.y, ROOM.y + ROOM.h]]) { if (d > 1e-9) t = Math.min(t, (hi - p0) / d); if (d < -1e-9) t = Math.min(t, (lo - p0) / d); }
    return t; };
  const bothLowest = (v) => v.map((x, i) => [x, i]).sort((u, w) => u[0] - w[0]).slice(0, N_CAM).every(([, i]) => i < N_CAM);
  if (bothLowest(poses.map(wallDist)) && rng.uniform(0, 1) > 0.45) return null;
  if (bothLowest(poses.map((q) => Math.hypot(q.x - (ROOM.x + ROOM.w / 2), q.y - (ROOM.y + ROOM.h / 2)))) && rng.uniform(0, 1) > 0.42) return null;
  const order = rng.shuffle([...Array(N_PHOTOS).keys()]);
  const cards = order.map((k, id) => ({ id, pose: { x: poses[k].x, y: poses[k].y, dir: poses[k].dir } }));
  const answers = [order.indexOf(0), order.indexOf(1)];
  const cameras = [0, 1].map((k) => ({ x: poses[k].x, y: poses[k].y, dir: poses[k].dir }));
  const azFor = (k) => norm360([0, 180, 90, -90][poses[k].wall] + 180 + rng.sign() * rng.uniform(28, 52));
  const first = rng.int(0, 1), azs = [azFor(first), azFor(1 - first), azFor(first), azFor(1 - first)];
  const base = { task: 'viewpoint_photo_match', board: { ...BOARD }, props, cameras, cards, answers, view: { az: 0, el: 43, dist: 9.6, fov: 36 } };
  if (planProblems(base).length) return null;
  const el = round2(rng.uniform(40, 46)), tx = kit ? round2(rng.uniform(-0.3, 0.3)) : null, tz = kit ? round2(rng.uniform(-0.3, 0.3)) : null;
  for (const az of azs) {
    const view = { az: round2(az), el, dist: 9.6, fov: 36 };
    if (kit) { view.tx = tx; view.tz = tz; }
    const m = { ...base, view };
    if (kit) m.kit = kit;
    const bad = overviewProblems(m).length;
    CACHE.delete(m);
    if (!bad) return m;
  }
  return null;
}

function pickDecoys(rng, D, need, want, decoyPair) {
  const lists = need.map((n) => D.filter((d) => setKey(d.shot) === n.set && shotKey(d.shot) === n.ord));
  if (lists.some((l) => !l.length)) return null;
  for (let pass = 0; pass < 40; pass++) {
    const got = [];
    for (const l of lists) {
      if (got.some((g) => l.includes(g))) continue;
      const ok = l.filter((d) => got.every((g) => decoyPair(g, d)));
      if (!ok.length) break;
      got.push(ok[rng.int(0, ok.length - 1)]);
    }
    if (!lists.every((l) => got.some((g) => l.includes(g)))) continue;
    for (const d of rng.shuffle(D)) {
      if (got.length === want) break;
      if (!got.includes(d) && got.every((g) => decoyPair(g, d))) got.push(d);
    }
    if (got.length === want) return got;
  }
  return null;
}
const BENCH_EXTRA = 1200;
const TAN = (d) => Math.tan(rad(d));
const T_IN = TAN(HALF - IN_M), T_BESIDE = TAN(HALF + 8);
function aimOkFast(pose, props, outM) {
  const { f, r } = basis(pose.dir), T_OUT = TAN(HALF + outM);
  let n = 0;
  for (const p of props) {
    const e = ext(p);
    let lo = Infinity, hi = -Infinity, behind = false;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const dx = p.x + sx * e.a - pose.x, dy = p.y + sy * e.b - pose.y, fwd = dx * f.x + dy * f.y;
      if (fwd <= 4) { behind = true; break; }
      const t = (dx * r.x + dy * r.y) / fwd;
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    if (behind) {
      let side = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const dx = p.x + sx * e.a - pose.x, dy = p.y + sy * e.b - pose.y, fwd = dx * f.x + dy * f.y, lat = dx * r.x + dy * r.y;
        if (fwd <= 0) { side = side || Math.sign(lat); if (Math.sign(lat) !== side && Math.abs(lat) > 1) return false; continue; }
        if (Math.abs(lat) < fwd * T_BESIDE) return false;
        side = side || Math.sign(lat);
        if (Math.sign(lat) !== side) return false;
      }
      continue;
    }
    if (lo >= -T_IN && hi <= T_IN) n++;
    else if (!(lo >= T_OUT || hi <= -T_OUT)) return false;
  }
  return n >= 2 && n <= 4;
}
function sampleStationFast(rng, props, outM) {
  for (let k = 0; k < 60; k++) {
    const wall = rng.int(0, 3), IN = rng.uniform(STATION_IN[0], STATION_IN[1]), J = AIM_J;
    let x, y, base;
    if (wall === 0) { x = rng.uniform(ROOM.x + 34, ROOM.x + ROOM.w - 34); y = ROOM.y + IN; base = 180; }
    else if (wall === 1) { x = rng.uniform(ROOM.x + 34, ROOM.x + ROOM.w - 34); y = ROOM.y + ROOM.h - IN; base = 0; }
    else if (wall === 2) { x = ROOM.x + IN; y = rng.uniform(ROOM.y + 34, ROOM.y + ROOM.h - 34); base = 90; }
    else { x = ROOM.x + ROOM.w - IN; y = rng.uniform(ROOM.y + 34, ROOM.y + ROOM.h - 34); base = -90; }
    const pose = { x: round2(x), y: round2(y), dir: round2(base + rng.uniform(-J, J)) };
    if (standsClear(pose, props) && aimOkFast(pose, props, outM)) return { ...pose, wall };
  }
  return null;
}
function benchPool(rng, props, camOk, decoyOf) {
  const pool = [];
  const draw = (n) => {
    for (let t = 0; t < n; t++) {
      const pose = sampleStationFast(rng, props, DECOY_OUT);
      if (!pose) continue;
      const shot = stationOk(pose, props, DECOY_OUT);
      if (!shot || !viewConsistent(pose)) continue;
      pool.push({ pose, shot, cam: stationOk(pose, props, OUT_M) !== null });
    }
  };
  draw(70);
  if (pool.length < 10 || pool.filter((c) => c.cam).length < N_CAM) return null;
  draw(330);
  let best = 0;
  const cams = pool.filter((c) => c.cam);
  for (let i = 0; i < cams.length && best < 4; i++) for (let j = i + 1; j < cams.length && best < 4; j++) {
    if (!camOk(cams[i], cams[j])) continue;
    const keys = new Set();
    for (const d of pool) if (d !== cams[i] && d !== cams[j] && decoyOf(cams[i], d) && decoyOf(cams[j], d)) keys.add(shotKey(d.shot));
    best = Math.max(best, keys.size);
  }
  if (best < 4) return null;
  draw(BENCH_EXTRA);
  return pool;
}
function tryBuildBench(rng) {
  const props = placeProps(rng);
  if (!props) return null;
  const gap = (a, b) => Math.hypot(a.pose.x - b.pose.x, a.pose.y - b.pose.y);
  const camOk = (a, b) => gap(a, b) >= CAM_GAP && distinctShots(a.shot, b.shot) && robustlyWrong(a.pose, a.shot, b.shot) && robustlyWrong(b.pose, b.shot, a.shot);
  const decoyOf = (a, d) => gap(a, d) > STATION_GAP && distinctShots(a.shot, d.shot) && robustlyWrong(a.pose, a.shot, d.shot);
  const pool = benchPool(rng, props, camOk, decoyOf);
  if (!pool) return null;
  const decoyPair = (d, e) => gap(d, e) > STATION_GAP && differentPhotos(d.shot, e.shot);
  const cams = pool.filter((c) => c.cam), pairs = [];
  for (let i = 0; i < cams.length; i++) for (let j = i + 1; j < cams.length; j++) if (camOk(cams[i], cams[j])) pairs.push([cams[i], cams[j]]);
  const need7 = N_PHOTOS - N_CAM, el = round2(rng.uniform(40, 46));
  for (const [a, b] of rng.shuffle(pairs).slice(0, 60)) {
    const D = rng.shuffle(pool.filter((d) => d !== a && d !== b && decoyOf(a, d) && decoyOf(b, d)));
    if (D.length < need7) continue;
    const azs = [];
    for (const c of [a, b]) for (const sg of [-1, 1]) for (let o = 28; o < 52; o += 3) azs.push(norm360([0, 180, 90, -90][c.pose.wall] + 180 + sg * (o + rng.uniform(0, 3))));
    for (const az of rng.shuffle(azs)) {
      const view = { az: round2(az), el, dist: 9.6, fov: 36 }, oc = overviewCam(view);
      const need = trapNeeds([trapOf(a.pose, a.shot, view, oc), trapOf(b.pose, b.shot, view, oc)]);
      if (!need) continue;
      const got = pickDecoys(rng, D, need, need7, decoyPair);
      if (!got) continue;
      const poses = [a, b, ...got].map((c) => c.pose);
      const wallDist = (pose) => { const { f } = basis(pose.dir); let t = Infinity;
        for (const [p0, d, lo, hi] of [[pose.x, f.x, ROOM.x, ROOM.x + ROOM.w], [pose.y, f.y, ROOM.y, ROOM.y + ROOM.h]]) { if (d > 1e-9) t = Math.min(t, (hi - p0) / d); if (d < -1e-9) t = Math.min(t, (lo - p0) / d); }
        return t; };
      const bothLowest = (v) => v.map((x, i) => [x, i]).sort((u, w) => u[0] - w[0]).slice(0, N_CAM).every(([, i]) => i < N_CAM);
      if (bothLowest(poses.map(wallDist)) && rng.uniform(0, 1) > 0.45) continue;
      if (bothLowest(poses.map((q) => Math.hypot(q.x - (ROOM.x + ROOM.w / 2), q.y - (ROOM.y + ROOM.h / 2)))) && rng.uniform(0, 1) > 0.42) continue;
      const order = rng.shuffle([...Array(N_PHOTOS).keys()]);
      const cards = order.map((k, id) => ({ id, pose: { x: poses[k].x, y: poses[k].y, dir: poses[k].dir } }));
      const answers = [order.indexOf(0), order.indexOf(1)];
      const cameras = [0, 1].map((k) => ({ x: poses[k].x, y: poses[k].y, dir: poses[k].dir }));
      const m = { task: 'viewpoint_photo_match', board: { ...BOARD }, props, cameras, cards, answers, view };
      if (planProblems(m).length || trapProblems(m).length) continue;
      const bad = overviewProblems(m).length;
      CACHE.delete(m);
      if (!bad) return m;
    }
  }
  return null;
}

const VARIANTS = { sofa: GP.SOFAS, tv: GP.MEDIA, plant: GP.PLANTS, lamp: GP.LIGHTS, shelf: GP.SHELVES, box: GP.BOXES, chair: GP.SITS };
const PLANT_SCALE = { potplant: 1, cactus: 0.95, tree: 0.66, flowers: 1.1, snake: 1 };
function addVariant(B, id, type, v, a, c) {
  if (type === 'sofa') GP.sofaProp(B, id, v, { ...a, col: c.sofa ?? '#a9674a', hw: 0.82 });
  else if (type === 'tv') GP.mediaProp(B, id, v, { ...a, col: c.media });
  else if (type === 'plant') GP.plantProp(B, id, v, { x: a.x, z: a.z, scale: PLANT_SCALE[v], pot: c.pot, bloom: c.bloom });
  else if (type === 'lamp') GP.lightProp(B, id, v, { x: a.x, z: a.z, yaw: a.yaw, h: 1.4, col: c.shade });
  else if (type === 'shelf') GP.shelfProp(B, id, v, { ...a, col: c.shelf ?? '#3f8f97' });
  else if (type === 'box') GP.boxProp(B, id, v, { ...a, hx: 0.26, hy: 0.24, hz: 0.22, col: c.box });
  else GP.sitProp(B, id, v, { ...a, col: c.chair ?? '#c8553d' });
}
function generateExt(rng0, split) {
  const rng = GP.decorrelate(rng0);
  const kit = { var: {} };
  for (const t of TYPES) kit.var[t.name] = GP.pickIn(rng, VARIANTS[t.name], split);
  for (let k = 0; k < 3000; k++) { const m = tryBuild(rng, kit); if (m) return m; }
  throw new Error('viewpoint_photo_match: generator exhausted (ext)');
}
async function styleSkin(style, m) {
  const look = await SEAT_LOOK.seatLook(style, { setting: 'room', rug: { x0: -1.4, x1: 1.4, z0: -1.4, z1: 1.4 } });
  const rnd = look.rnd, K = look.kit, P = (L, name) => SEAT_LOOK.pickS(style, `vpm_${name}`, L);
  const cols = {
    sofa: P(['#a9674a', '#5a6b7a', '#7a8a5a', '#c9b48a', '#4a4f55', '#8a5a6a', '#2f4f6f', '#b8a898'], 'sofa'),
    chair: P(['#c8553d', '#3f7cc0', '#e0b23e', '#4f9a62', '#2e3034', '#e8e2d6', '#8a5ab0'], 'chair'),
    shelf: P(['#3f8f97', '#e8e4da', '#2f3438', '#8a6a4a', '#5a7a5a', '#b8a888'], 'shelf'),
    media: P(['#8a6a4a', '#2f3438', '#e8e4da', '#5a6a7a'], 'media'),
    pot: P(['#c0714f', '#e8e2d6', '#4a4f55', '#8a9a8a', '#b8a888'], 'pot'), bloom: P(['#f2d36a', '#f4f1ea', '#e8a0b8', '#f0a050'], 'bloom'),
    shade: P(['#efe2c4', '#f4f1ea', '#e8d8b0', '#dfe6e8'], 'shade'), box: P(['#3a4a5c', '#7a5236', '#5a6a4a', '#b8925e', '#c9a46a'], 'box'),
    camera: P(['#2f3640', '#5a5f66', '#8a3a3a', '#2f5d8c', '#e8e4da'], 'camera'),
  };
  const potFinish = P(['matte', 'satin', 'gloss'], 'pot_finish'), wall = look.wallMat, base = look.kit.plaster(P(['#f7f4ee', '#e8e2d6', '#d8d4cc', '#5a4a3a'], 'skirting'));
  const remap = (name, hex, role) => {
    if (role === 'wall') return hex === '#ece6db' ? wall : base;
    if (name === 'wood') return role === 'shelf' || role === 'chair' || role === 'tv' ? K.woodB : K.woodA;
    if (name === 'cloth' && (role === 'sofa' || role === 'chair')) return K.fabric(hex, 0, 0.22);
    if (name === 'metal' && role !== 'camera') return K.metal(hex);
    if (role === 'plant' && name === 'matte' && hex === cols.pot) return K.ceramic(hex, potFinish);
    return null;
  };
  return { look, remap, cols };
}

export function semanticKey(m) {
  const q = (v) => Math.round(v / 40), d = (v) => Math.round(norm360(v) / 15) % 24;
  const props = m.props.map((p) => `${TYPES[p.t].name}@${q(p.x)},${q(p.y)}r${p.rot % 2}`).sort();
  const cards = m.cards.map((c) => `${q(c.pose.x)},${q(c.pose.y)}^${d(c.pose.dir)}${m.answers.includes(c.id) ? '*' : ''}`).sort();
  const cams = m.cameras.map((c) => `${q(c.x)},${q(c.y)}^${d(c.dir)}`).sort();
  return `viewpoint|${props.join(';')}|cams ${cams.join(' ')}|${cards.join(';')}`;
}

export default {
  meta: {
    name: 'viewpoint_photo_match', family: 'D', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'pick', card: '0..8 (tap a photo to select it, tap again to deselect; at most 2 selected)' }],
    promptHuman: 'Pick the 2 photos taken by these cameras',
  },
  generate(rng, level, index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext);
    for (let k = 0; k < 3000; k++) { const m = tryBuildBench(rng); if (m) return m; }
    throw new Error('viewpoint_photo_match: generator exhausted');
  },
  init() { return { sel: [] }; },
  applyAction(s, a) {
    if (a?.op !== 'pick' || !Number.isInteger(a.card) || a.card < 0 || a.card >= N_PHOTOS) return { ok: false, reason: 'bad-card' };
    const at = s.sel.indexOf(a.card);
    if (at >= 0) s.sel.splice(at, 1);
    else if (s.sel.length >= N_CAM) return { ok: false, reason: 'two-selected' };
    else s.sel.push(a.card);
    return { ok: true };
  },
  verify(s, m) { const ok = s.sel.length === N_CAM && m.answers.every((a) => s.sel.includes(a)); return { success: ok, partial: ok ? 1 : 0, error: ok ? 0 : 1, detail: { sel: [...s.sel].sort((u, v) => u - v) } }; },
  oracle(m) { return m.answers.map((card) => ({ op: 'pick', card })); },
  randomPolicy(m, rnd) {
    const a = Math.floor(rnd() * N_PHOTOS); let b = Math.floor(rnd() * (N_PHOTOS - 1)); if (b >= a) b++;
    return [{ op: 'pick', card: a }, { op: 'pick', card: b }];
  },
  async mount(env) {
    env.assets.vpm = {};
    if (env.style) env.assets.skin = await styleSkin(env.style, env.manifest);
  },
  drawPrompt(g, r) { drawPromptText(g, r, 'Pick the 2 photos taken by these cameras', 'Taken at lens height, looking straight ahead'); },

  drawBoard(g, br, env) {
    const m = env.manifest, s = env.state, A = env.assets.vpm || (env.assets.vpm = {});
    const q = contextScale(g), skin = env.style ? env.assets.skin : null, key = `${q}` + (skin ? '|' + env.style.key : '');
    if (A.m !== m || A.key !== key) {
      A.m = m; A.key = key;
      A.over = toCanvas(render(overviewScene(m, skin), q));
      A.photos = m.cards.map((_, i) => toCanvas(render(photoScene(m, i, skin), q)));
    }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.over, 0, 0, BOARD.w, OVER_H);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, OVER_H, br.w, br.h - OVER_H);
    g.strokeStyle = '#dde3ea'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, OVER_H + 0.5); g.lineTo(br.w, OVER_H + 0.5); g.stroke();
    m.cards.forEach((c, i) => {
      const R = CARD(i), sel = s.sel.includes(i);
      g.save(); rr(g, R.x, R.y, R.w, R.h, 6); g.clip(); g.drawImage(A.photos[i], R.x, R.y, R.w, R.h); g.restore();
      g.strokeStyle = sel ? ACCENT : '#cfd7e0'; g.lineWidth = sel ? 3 : 1.2; rr(g, R.x + (sel ? 1.5 : 0.5), R.y + (sel ? 1.5 : 0.5), R.w - (sel ? 3 : 1), R.h - (sel ? 3 : 1), 6); g.stroke();
      if (sel) {
        const bx = R.x + R.w - 13, by = R.y + 13;
        g.beginPath(); g.arc(bx, by, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx - 3.4, by); g.lineTo(bx - 1, by + 2.7); g.lineTo(bx + 3.8, by - 3.1); g.stroke();
      }
    });
    g.restore();
  },
  pointer(e, env) {
    if (env.submitted || e.type !== 'down') return [];
    for (let i = 0; i < N_PHOTOS; i++) { const r = CARD(i); if (e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h) return [{ op: 'pick', card: i }]; }
    return [];
  },
  footerStatus(env) { const n = env.state.sel.length; return n === 0 ? 'Tap 2 photos' : n === 1 ? '1 of 2 selected' : '2 of 2 selected (tap one to change)'; },
};
export function previewImage(m) {
  const over = render(overviewScene(m), 2), W = over.w, H = over.h + 4 + 3 * (CARD_H * 2 + 4);
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < over.h; y++) data.set(over.data.subarray(y * W * 4, (y + 1) * W * 4), y * W * 4);
  m.cards.forEach((c, i) => {
    const im = render(photoScene(m, i), 2), ox = (i % 3) * (CARD_W * 2 + 6), oy = over.h + 4 + Math.floor(i / 3) * (CARD_H * 2 + 4);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const d = ((oy + y) * W + ox + x) * 4, s = (y * im.w + x) * 4; if (ox + x < W && oy + y < H) { data[d] = im.data[s]; data[d + 1] = im.data[s + 1]; data[d + 2] = im.data[s + 2]; data[d + 3] = 255; } }
    if (m.answers.includes(i)) for (let x = 0; x < im.w; x++) for (const yy of [0, 1, 2]) { const d = ((oy + yy) * W + ox + x) * 4; data[d] = 25; data[d + 1] = 145; data[d + 2] = 250; }
  });
  return { data, w: W, h: H };
}
