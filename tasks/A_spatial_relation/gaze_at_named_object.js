import { mulberry32, R } from '../core/rng.js';
import { splitIds } from '../core/style.js';
import { drawPromptText, ACCENT } from '../core/panel.js';
import * as RT from '../common/_people_rt.js';
import { peopleMats, hashList, frameOrbit, probeVis, personProbes } from '../common/_people_look.js';
import { envLook, wardrobe, texMat, faceOf, lin as hexLin, pickOf, S3 } from '../common/_rt_look.js';
import { pickTex, splitPick } from '../common/_rt_kit.js';

const BOARD = { w: 340, h: 374 };
const H = BOARD.h;
const N = 8;
const N_OBJ = 4;
const LOOK_TOL = 12;
const LOOKER_MAX = 6;
const LOOKER_LAT = 12;
const NONLOOKER_MIN = 35;
const NONLOOKER_LAT = 40;
const CLEAR_PREF = 50;
const N_LOOK_W = [1, 2, 2];
const N_LOOK_W_B = [0, 1, 1];
const MISS_ERR = [35, 40];
const MISS_LAT = [40, 70];
const SCREEN_MIN = 31;
const SIGHT_CLEAR = 20;
const LOOKER_JIT = 3;
const NEAR_MARGIN = 26;
const FAR_MARGIN = 8;
const HIT_R = 26;
const MIN_SEP = 52;
const MIN_OSEP = 66;
const MIN_PO = 34;
const DECOY_LO = 40, DECOY_HI = 58;
const LOOK_LO = 96, LOOK_HI = 138;
const KINDS = ['lamp', 'plant', 'vase', 'teddy'];
const KIND_NAME = { lamp: 'lamp', plant: 'plant', vase: 'vase', teddy: 'teddy bear',
  clock: 'clock', globe: 'globe', kettle: 'kettle', trophy: 'trophy', candles: 'candles', books: 'books', cactus: 'cactus', toycar: 'toy car', cake: 'cake' };
const EXT_KINDS = ['clock', 'globe', 'kettle', 'trophy', 'candles', 'books', 'cactus', 'toycar', 'cake'];
const ALL_KINDS = [...KINDS, ...EXT_KINDS];
const kindSplit = splitIds('gaze_at_named_object|kind', ALL_KINDS, 4);
const kindPool = (split) => ALL_KINDS.filter((k) => kindSplit(k) === split);
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const round2 = (v) => Math.round(v * 100) / 100;
const norm360 = (d) => ((d % 360) + 360) % 360;

function bearingDeg(from, to) {
  return norm360((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}
function angErr(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ptSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function facingTo(p, yaw, o) {
  const ae = angErr(yaw, bearingDeg(p, o));
  const lat = ae >= 90 ? Infinity : dist(p, o) * Math.sin(rad(ae));
  return { ae, lat };
}
const isLooker = (f) => f.ae <= LOOKER_MAX && f.lat <= LOOKER_LAT;
const isClearNonLooker = (f) => f.ae >= NONLOOKER_MIN && f.lat >= NONLOOKER_LAT;
const isNearMiss = (f) => f.ae >= MISS_ERR[0] && f.ae <= MISS_ERR[1] && f.lat >= MISS_LAT[0] && f.lat <= MISS_LAT[1];

function contractOk(m, extMode = !!(m && m.ext)) {
  if (!m || m.task !== 'gaze_at_named_object') return false;
  if (!Array.isArray(m.people) || m.people.length !== N) return false;
  if (!Array.isArray(m.objects) || m.objects.length !== N_OBJ) return false;
  if (m.rounds !== undefined) return false;
  const ids = m.people.map((p) => p.id).sort((a, b) => a - b);
  if (ids.some((v, i) => v !== i)) return false;
  for (let i = 0; i < N; i++) if (m.people[i].id !== i) return false;
  const oids = m.objects.map((o) => o.id);
  if (oids.some((v, i) => v !== i)) return false;
  for (const p of m.people) {
    if (![p.x, p.y, p.yaw].every(Number.isFinite)) return false;
    if (p.x < 20 || p.x > BOARD.w - 20 || p.y < 24 || p.y > H - 20) return false;
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++)
    if (dist(m.people[i], m.people[j]) < MIN_SEP - 1) return false;
  for (let i = 0; i < N_OBJ; i++) {
    const o = m.objects[i];
    if (![o.x, o.y].every(Number.isFinite)) return false;
    if (!(m.ext ? ALL_KINDS : KINDS).includes(o.kind)) return false;
    if (o.x < 40 || o.x > BOARD.w - 40 || o.y < 54 || o.y > H - 50) return false;
    for (let j = i + 1; j < N_OBJ; j++) if (dist(o, m.objects[j]) < MIN_OSEP - 1) return false;
    for (const p of m.people) if (dist(p, o) < MIN_PO - 1) return false;
  }
  {
    const t = m.target;
    if (!Number.isInteger(t) || t < 0 || t >= N_OBJ) return false;
    const O = m.objects[t], ans = m.answer;
    if (!Array.isArray(ans) || ans.length < (extMode ? 1 : 2) || ans.length > N_LOOK_W.length) return false;
    if (!ans.every((v, i) => Number.isInteger(v) && v >= 0 && v < N && (i === 0 || v > ans[i - 1]))) return false;
    let lookers = 0, nearest = m.people[0], farthest = m.people[0], closeOff = 0, nearMiss = 0;
    let ansNear = Infinity, ansFar = -1;
    for (const p of m.people) {
      const f = facingTo(p, p.yaw, O);
      if (f.ae <= LOOK_TOL) lookers++;
      if (ans.includes(p.id)) {
        ansNear = Math.min(ansNear, dist(p, O)); ansFar = Math.max(ansFar, dist(p, O));
        if (!isLooker(f)) return false;
        for (const q of m.people) if (q.id !== p.id && ptSegDist(q, p, O) < SIGHT_CLEAR) return false;
        for (const o of m.objects) if (o.id !== t && ptSegDist(o, p, O) < SIGHT_CLEAR) return false;
      } else {
        if (!isClearNonLooker(f)) return false;
        if (f.ae < CLEAR_PREF) closeOff++;
        if (isNearMiss(f)) nearMiss++;
      }
      if (dist(p, O) < dist(nearest, O)) nearest = p;
      if (dist(p, O) > dist(farthest, O)) farthest = p;
    }
    if (lookers !== ans.length) return false;
    if (closeOff > 1) return false;
    if (!extMode && nearMiss < 1) return false;
    if (!extMode) {
      for (const p of m.people) if (!ans.includes(p.id) && pictureErr(m, p, O) < SCREEN_MIN) return false;
    }
    if (ans.includes(nearest.id)) return false;
    if (!(ansNear - dist(nearest, O) >= NEAR_MARGIN)) return false;
    if (ans.includes(farthest.id)) return false;
    let someFar = false;
    for (const p of m.people) if (!ans.includes(p.id) && dist(p, O) - ansFar >= FAR_MARGIN) someFar = true;
    if (!someFar) return false;
  }
  return true;
}

function tryBuild(rng, pool = KINDS, ext = null, nLook = 1, bench = false) {
  const objs = [];
  const kinds = rng.shuffle(pool.slice());
  for (let i = 0; i < N_OBJ; i++) {
    let pt = null;
    for (let t = 0; t < 90 && !pt; t++) {
      const x = round2(rng.uniform(52, BOARD.w - 52));
      const y = round2(rng.uniform(72, H - 62));
      if (objs.some((o) => dist(o, { x, y }) < MIN_OSEP + 4)) continue;
      pt = { x, y };
    }
    if (!pt) return null;
    objs.push({ id: i, x: pt.x, y: pt.y, kind: kinds[i] });
  }
  const ord = rng.shuffle([0, 1, 2, 3]);
  const tgt = [ord[0], ord[1]];
  const pid = rng.shuffle(Array.from({ length: N }, (_, i) => i));
  const used = [];
  const okSpot = (x, y) => {
    if (x < 26 || x > BOARD.w - 26 || y < 30 || y > H - 26) return false;
    if (used.some((p) => dist(p, { x, y }) < MIN_SEP + 2)) return false;
    if (objs.some((o) => dist(o, { x, y }) < MIN_PO + 2)) return false;
    return true;
  };
  const placeAt = (id, O, lo, hi) => {
    for (let t = 0; t < 140; t++) {
      const a = rng.uniform(0, 360), d = rng.uniform(lo, hi);
      const x = round2(O.x + Math.cos(rad(a)) * d), y = round2(O.y + Math.sin(rad(a)) * d);
      if (okSpot(x, y)) { const p = { id, x, y }; used.push(p); return p; }
    }
    return null;
  };
  const placeAnywhere = (id) => {
    for (let t = 0; t < 200; t++) {
      const x = round2(rng.uniform(30, BOARD.w - 30)), y = round2(rng.uniform(42, H - 30));
      if (okSpot(x, y)) { const p = { id, x, y }; used.push(p); return p; }
    }
    return null;
  };
  const OA = objs[tgt[0]], OB = objs[tgt[1]];
  const offYaw = (p) => {
    let fallback = null;
    for (const oid of rng.shuffle([0, 1, 2, 3].filter((k) => k !== tgt[0]))) {
      const yaw = round2(norm360(bearingDeg(p, objs[oid]) + rng.uniform(-LOOKER_JIT, LOOKER_JIT)));
      const f = facingTo(p, yaw, OA);
      if (!(f.ae >= NONLOOKER_MIN + 4 && f.lat >= NONLOOKER_LAT + 4)) continue;
      if (bench || f.ae >= CLEAR_PREF + 4) return yaw;
      if (fallback === null) fallback = yaw;
    }
    return fallback;
  };

  const lookers = [];
  for (let k = 0; k < nLook; k++) { const p = placeAt(pid[k], OA, LOOK_LO, LOOK_HI); if (!p) return null; lookers.push(p); }
  const lookerB = placeAt(pid[nLook], OB, LOOK_LO, LOOK_HI); if (!lookerB) return null;
  const decoyA = placeAt(pid[nLook + 1], OA, DECOY_LO, DECOY_HI); if (!decoyA) return null;
  const decoyB = placeAt(pid[nLook + 2], OB, DECOY_LO, DECOY_HI); if (!decoyB) return null;
  let miss = null;
  if (bench) {
    for (let t = 0; t < 400 && !miss; t++) {
      const a = rng.uniform(0, 360), d = rng.uniform(62, 124);
      const x = round2(OA.x + Math.cos(rad(a)) * d), y = round2(OA.y + Math.sin(rad(a)) * d);
      if (!okSpot(x, y)) continue;
      const X = objs[rng.pick([0, 1, 2, 3].filter((k) => k !== tgt[0]))];
      const yaw = round2(norm360(bearingDeg({ x, y }, X) + rng.uniform(-LOOKER_JIT, LOOKER_JIT)));
      const f = facingTo({ x, y }, yaw, OA);
      if (f.ae < MISS_ERR[0] + 0.5 || f.ae > MISS_ERR[1] - 0.5 || f.lat < MISS_LAT[0] + 1 || f.lat > MISS_LAT[1] - 1) continue;
      miss = { id: pid[nLook + 3], x, y, yaw }; used.push(miss);
    }
    if (!miss) return null;
  }
  const fills = [];
  for (let k = nLook + (bench ? 4 : 3); k < N; k++) { const p = placeAnywhere(pid[k]); if (!p) return null; fills.push(p); }

  for (const p of lookers) p.yaw = round2(norm360(bearingDeg(p, OA) + rng.uniform(-LOOKER_JIT, LOOKER_JIT)));
  lookerB.yaw = round2(norm360(bearingDeg(lookerB, OB) + rng.uniform(-LOOKER_JIT, LOOKER_JIT)));
  for (const p of [decoyA, decoyB, ...fills]) {
    const yaw = offYaw(p); if (yaw == null) return null; p.yaw = yaw;
  }

  const people = [...lookers, lookerB, decoyA, decoyB, ...(miss ? [miss] : []), ...fills].sort((a, b) => a.id - b.id);
  const m = {
    task: 'gaze_at_named_object', board: BOARD, people, objects: objs,
    target: tgt[0],
    answer: lookers.map((p) => p.id).sort((a, b) => a - b),
    lookTol: LOOK_TOL,
    gtContract: bench
      ? 'for the named object, tap EVERY person who faces it straight on (2-3 of them; facing within '
        + `${LOOKER_MAX} deg, nothing in between); everyone else faces >= ${NONLOOKER_MIN} deg and >= ${NONLOOKER_LAT} px `
        + `wide of it, exactly one of them under ${CLEAR_PREF} deg and that one a ${MISS_ERR[0]}-${MISS_ERR[1]} deg / `
        + `${MISS_LAT[0]}-${MISS_LAT[1]} px near miss; the nearest person is a decoy; exact set`
      : 'for the named object, tap EVERY person who faces it straight on (1-3 of them; facing within '
      + `${LOOKER_MAX} deg, nothing in between); everyone else faces >= ${NONLOOKER_MIN} deg and >= ${NONLOOKER_LAT} px `
      + `wide of it (at most one under ${CLEAR_PREF} deg); the nearest person is a decoy; exact set`,
    ...(ext ? { ext } : {}),
  };
  return contractOk(m, !bench) ? m : null;
}
function drawLookCount(rng, W = N_LOOK_W) {
  let u = rng.uniform(0, W.reduce((s, v) => s + v, 0));
  for (let i = 0; i < W.length; i++) { u -= W[i]; if (u < 0) return i + 1; }
  return W.length;
}

let FALLBACK = null, FALLBACK_B = null;
function fallback() {
  if (!FALLBACK) {
    const rng = R(mulberry32(0x6a2e5f1d));
    for (let k = 0; k < 5000 && !FALLBACK; k++) FALLBACK = tryBuild(rng);
    if (!FALLBACK) throw new Error('gaze_at_named_object: no fallback instance');
  }
  return JSON.parse(JSON.stringify(FALLBACK));
}
function fallbackBench() {
  if (!FALLBACK_B) {
    const rng = R(mulberry32(0x6a2e5f1d));
    for (let k = 0; k < 5000 && !FALLBACK_B; k++) FALLBACK_B = tryBuild(rng, KINDS, null, 2, true);
    if (!FALLBACK_B) throw new Error('gaze_at_named_object: no bench fallback instance');
  }
  return JSON.parse(JSON.stringify(FALLBACK_B));
}

const S = 0.02, PCX = 170, PCY = 190;
const PLINTH_H = 0.74, PLINTH_R = 0.17;
const OBJ_TOP = { lamp: 0.5, plant: 0.46, vase: 0.42, teddy: 0.36,
  clock: 0.3, globe: 0.31, kettle: 0.27, trophy: 0.33, candles: 0.27, books: 0.16, cactus: 0.42, toycar: 0.16, cake: 0.2 };
const EXT_MAT_HEX = { wood: '#8a5a36', face: '#f2efe6', ink: '#24221f', ocean: '#3b6fa8', land: '#6f9a4a', steel: '#c4c8cc', gold: '#d8b04a',
  wax: '#f1ead8', flame: '#ffc04a', green: '#4f8a3f', pot: '#b8673f', carRed: '#c0392b', carWin: '#9fb8c8', tyre: '#262628', sponge: '#d9a86a', icing: '#f4ecef', cherry: '#b0202a',
  book0: '#2f5f8a', book1: '#9a3a34', book2: '#3f6a4a', book3: '#d8c8a0', book4: '#6a4a7a' };
function extObjectShapes(kind, id, X, Z, y, t, mat, shapes) {
  const fx = Math.cos(t), fz = Math.sin(t), rx = -fz, rz = fx, ax = RT.frame([0, 1, 0], [fx, 0, fz]);
  const P = (side, fwd, up) => [X + rx * side + fx * fwd, y + up, Z + rz * side + fz * fwd];
  const S = RT.shape;
  if (kind === 'clock') {
    shapes.push(S.ellipsoid(id, mat('wood'), P(0, 0, 0.15), ax, [0.135, 0.135, 0.06]));
    for (const sd of [-1, 1]) {
      shapes.push(S.ellipsoid(id, mat('face'), P(0, sd * 0.02, 0.15), ax, [0.11, 0.11, 0.045]));
      shapes.push(S.capsule(id, mat('ink'), P(0, sd * 0.066, 0.15), P(0, sd * 0.066, 0.225), 0.008));
      shapes.push(S.capsule(id, mat('ink'), P(0, sd * 0.066, 0.15), P(sd * 0.05, sd * 0.066, 0.12), 0.009));
    }
    for (const sd of [-1, 1]) shapes.push(S.sphere(id, mat('wood'), ...P(sd * 0.07, 0, 0.018), 0.02));
  } else if (kind === 'globe') {
    shapes.push(S.cyl(id, mat('wood'), X, Z, y, y + 0.03, 0.075, 0.008));
    shapes.push(S.capsule(id, mat('gold'), P(0, 0, 0.03), P(0, 0, 0.1), 0.012));
    shapes.push(S.sphere(id, mat('globe'), X, y + 0.2, Z, 0.105));
  } else if (kind === 'kettle') {
    shapes.push(S.ellipsoid(id, mat('steel'), P(0, 0, 0.1), ax, [0.11, 0.1, 0.11]));
    shapes.push(S.capsule(id, mat('steel'), P(0, 0.08, 0.07), P(0, 0.165, 0.16), 0.018));
    shapes.push(S.sphere(id, mat('ink'), ...P(0, 0, 0.205), 0.022));
    shapes.push(S.capsule(id, mat('ink'), P(0, -0.07, 0.16), P(0, -0.045, 0.25), 0.012));
    shapes.push(S.capsule(id, mat('ink'), P(0, -0.045, 0.25), P(0, 0.045, 0.25), 0.012));
    shapes.push(S.capsule(id, mat('ink'), P(0, 0.045, 0.25), P(0, 0.07, 0.16), 0.012));
  } else if (kind === 'trophy') {
    shapes.push(S.obox(id, mat('wood'), P(0, 0, 0.03), ax, [0.075, 0.03, 0.075], 0.005));
    shapes.push(S.cyl(id, mat('gold'), X, Z, y + 0.06, y + 0.16, 0.02, 0.004));
    shapes.push(S.frustum(id, mat('gold'), X, Z, y + 0.16, y + 0.33, 0.035, 0.1));
    for (const sd of [-1, 1]) {
      shapes.push(S.capsule(id, mat('gold'), P(sd * 0.085, 0, 0.3), P(sd * 0.135, 0, 0.26), 0.012));
      shapes.push(S.capsule(id, mat('gold'), P(sd * 0.135, 0, 0.26), P(sd * 0.065, 0, 0.2), 0.012));
    }
  } else if (kind === 'candles') {
    shapes.push(S.cyl(id, mat('steel'), X, Z, y, y + 0.015, 0.125, 0.005));
    [[0.05, 0.0, 0.22], [-0.03, 0.045, 0.16], [-0.03, -0.05, 0.12]].forEach(([a, b, h]) => {
      const c = P(a, b, 0);
      shapes.push(S.cyl(id, mat('wax'), c[0], c[2], y + 0.015, y + h, 0.025, 0.004));
      shapes.push(S.ellipsoid(id, mat('flame'), [c[0], y + h + 0.03, c[2]], ax, [0.012, 0.026, 0.012]));
    });
  } else if (kind === 'books') {
    let h0 = 0;
    for (let k = 0; k < 5; k++) {
      const hy = 0.014 + 0.004 * ((k * 7) % 3), a = t + (k % 2 ? 0.12 : -0.1) * (k + 1) / 3;
      shapes.push(S.obox(id, mat(`book${k}`), [X, y + h0 + hy, Z], RT.frame([0, 1, 0], [Math.cos(a), 0, Math.sin(a)]), [0.075, hy, 0.105], 0.004));
      h0 += 2 * hy;
    }
  } else if (kind === 'cactus') {
    shapes.push(S.frustum(id, mat('pot'), X, Z, y, y + 0.15, 0.08, 0.1));
    shapes.push(S.capsule(id, mat('green'), [X, y + 0.15, Z], [X, y + 0.38, Z], 0.045));
    shapes.push(S.capsule(id, mat('green'), P(0.04, 0, 0.25), P(0.1, 0, 0.25), 0.028));
    shapes.push(S.capsule(id, mat('green'), P(0.1, 0, 0.25), P(0.1, 0, 0.33), 0.028));
    shapes.push(S.capsule(id, mat('green'), P(-0.04, 0, 0.21), P(-0.095, 0, 0.21), 0.025));
    shapes.push(S.capsule(id, mat('green'), P(-0.095, 0, 0.21), P(-0.095, 0, 0.27), 0.025));
  } else if (kind === 'toycar') {
    shapes.push(S.obox(id, mat('carRed'), P(0, 0, 0.065), ax, [0.06, 0.035, 0.13], 0.012));
    shapes.push(S.obox(id, mat('carWin'), P(0, -0.015, 0.12), ax, [0.05, 0.028, 0.06], 0.01));
    for (const sd of [-1, 1]) for (const fw of [-0.08, 0.08]) shapes.push(S.ellipsoid(id, mat('tyre'), P(sd * 0.062, fw, 0.03), ax, [0.014, 0.03, 0.03]));
  } else if (kind === 'cake') {
    shapes.push(S.cyl(id, mat('sponge'), X, Z, y, y + 0.08, 0.12, 0.006));
    shapes.push(S.cyl(id, mat('icing'), X, Z, y + 0.08, y + 0.1, 0.123, 0.008));
    shapes.push(S.cyl(id, mat('sponge'), X, Z, y + 0.1, y + 0.16, 0.08, 0.006));
    shapes.push(S.cyl(id, mat('icing'), X, Z, y + 0.16, y + 0.175, 0.082, 0.006));
    for (let k = 0; k < 5; k++) { const a = t + k * 1.2566; shapes.push(S.sphere(id, mat('cherry'), X + Math.cos(a) * 0.1, y + 0.105, Z + Math.sin(a) * 0.1, 0.014)); }
    shapes.push(S.sphere(id, mat('cherry'), X, y + 0.19, Z, 0.018));
  }
}
function extMats(mats) {
  const at = new Map();
  return (name) => {
    if (!at.has(name)) {
      let m;
      if (name === 'globe') {
        const O = RT.lin(EXT_MAT_HEX.ocean), Ld = RT.lin(EXT_MAT_HEX.land);
        m = { c: O, ks: 0.35, sh: 50, env: 0.15, tex: (x, yy, z, nx, ny, nz, s, out) => { const n = RT.fbm(nx * 2.2 + 5, ny * 2.2 + nz * 1.7, 3); RT.mixInto(out, O, Ld, n > 0.55 ? 1 : 0); } };
      } else if (name === 'flame') m = { c: RT.lin(EXT_MAT_HEX.flame).map((v) => v * 2.2), ks: 0, sh: 1 };
      else {
        const shiny = name === 'steel' || name === 'gold' || name === 'carRed';
        m = { c: RT.lin(EXT_MAT_HEX[name]), ks: shiny ? 0.5 : 0.08, sh: shiny ? 60 : 14, env: shiny ? 0.2 : 0 };
      }
      mats.push(m); at.set(name, mats.length - 1);
    }
    return at.get(name);
  };
}
const toW = (p) => [(p.x - PCX) * S, (p.y - PCY) * S];
function lookOf(p, base) {
  const h = hashList([p.id, p.x, p.y]);
  const female = ((p.id * 5 + Math.floor(h * 7)) % 3) === 0;
  return { skin: Math.floor(h * 97) % 4, hair: Math.floor(h * 53) % 4, shirt: (p.id + base) % 8, pants: Math.floor(h * 31) % 5,
    female, h: 1.64 + ((Math.floor(h * 1000) % 13) / 100) };
}
function facedObject(m, p) {
  let best = null, be = Infinity;
  for (const o of m.objects) { const e = angErr(p.yaw, bearingDeg(p, o)); if (e < be) { be = e; best = o; } }
  return be <= LOOK_TOL ? best : null;
}
export function sceneParts(m) {
  const base = Math.floor(hashList(m.objects.flatMap((o) => [o.x, o.y])) * 8);
  const looks = m.people.map((p) => lookOf(p, base));
  const { mats, idx } = peopleMats(looks);
  const M = (o) => { mats.push(o); return mats.length - 1; };
  const plinth = M({ c: RT.lin('#e6e2da'), ks: 0.05, sh: 10 });
  const brass = M({ c: RT.lin('#c9a24a'), ks: 0.55, sh: 60, env: 0.25 });
  const fur = M({ c: RT.lin('#9a6a3e'), ks: 0.04, sh: 8 });
  const furL = M({ c: RT.lin('#c99e70'), ks: 0.04, sh: 8 });
  const shade = M({ c: RT.lin('#f1e3bf'), ks: 0.04, sh: 8 });
  const pot = M({ c: RT.lin('#b8673f'), ks: 0.08, sh: 12 });
  const leaf = M({ c: RT.lin('#4f8a3f'), ks: 0.1, sh: 16 });
  const leaf2 = M({ c: RT.lin('#3f7534'), ks: 0.1, sh: 16 });
  const blue = M({ c: RT.lin('#2f63a8'), ks: 0.5, sh: 60, env: 0.3 });
  const dark = M({ c: RT.lin('#3a3530'), ks: 0.2, sh: 20 });
  const shapes = [];
  let extMat = null;
  m.people.forEach((p, i) => {
    const [X, Z] = toW(p), a = rad(p.yaw), L = looks[i];
    const o = facedObject(m, p);
    let pitch = 8;
    if (o) { const [ox, oz] = toW(o); pitch = Math.atan2(1.58 * L.h / 1.7 - (PLINTH_H + OBJ_TOP[o.kind] * 0.6), Math.hypot(ox - X, oz - Z)) * 180 / Math.PI; }
    const J = RT.standPose(X, Z, Math.cos(a), Math.sin(a), L.h, 0, { headPitch: Math.max(4, Math.min(24, pitch)) });
    shapes.push(...RT.personShapes(p.id, J, idx[i], { hair: L.female ? 'long' : 'short', skirt: L.female && p.id % 2 === 0 }));
  });
  m.objects.forEach((o) => {
    const id = 100 + o.id, [X, Z] = toW(o), y = PLINTH_H;
    shapes.push(RT.shape.cyl(id, plinth, X, Z, 0, y, PLINTH_R, 0.01));
    if (o.kind === 'lamp') {
      shapes.push(RT.shape.cyl(id, brass, X, Z, y, y + 0.025, 0.08, 0.008));
      shapes.push(RT.shape.cyl(id, brass, X, Z, y + 0.025, y + 0.3, 0.012));
      shapes.push(RT.shape.frustum(id, shade, X, Z, y + 0.26, y + 0.5, 0.15, 0.085));
    } else if (o.kind === 'plant') {
      shapes.push(RT.shape.frustum(id, pot, X, Z, y, y + 0.17, 0.08, 0.105));
      const h = hashList([o.x, o.y]);
      for (let k = 0; k < 6; k++) {
        const t = k * 1.047 + h * 6, rr = k ? 0.075 : 0;
        shapes.push(RT.shape.sphere(id, k % 2 ? leaf : leaf2, X + Math.cos(t) * rr, y + 0.27 + (k ? 0.02 * Math.sin(t * 3) : 0.08), Z + Math.sin(t) * rr, k ? 0.085 : 0.1));
      }
    } else if (o.kind === 'vase') {
      shapes.push(RT.shape.frustum(id, blue, X, Z, y, y + 0.08, 0.07, 0.11));
      shapes.push(RT.shape.sphere(id, blue, X, y + 0.16, Z, 0.115));
      shapes.push(RT.shape.frustum(id, blue, X, Z, y + 0.22, y + 0.38, 0.06, 0.045));
      shapes.push(RT.shape.cyl(id, blue, X, Z, y + 0.38, y + 0.42, 0.06, 0.01));
    } else if (EXT_KINDS.includes(o.kind)) {
      extObjectShapes(o.kind, id, X, Z, y, hashList([o.x, o.y]) * TAU, extMat || (extMat = extMats(mats)), shapes);
    } else {
      const t = hashList([o.x, o.y]) * TAU, fx = Math.cos(t), fz = Math.sin(t), rx = -fz, rz = fx;
      const P = (side, fwd, up) => [X + rx * side + fx * fwd, y + up, Z + rz * side + fz * fwd];
      const ax = RT.frame([0, 1, 0], [fx, 0, fz]);
      shapes.push(RT.shape.ellipsoid(id, fur, P(0, 0, 0.11), ax, [0.095, 0.11, 0.085]));
      shapes.push(RT.shape.ellipsoid(id, furL, P(0, 0.045, 0.1), ax, [0.06, 0.07, 0.05]));
      shapes.push(RT.shape.sphere(id, fur, ...P(0, 0.01, 0.27), 0.075));
      shapes.push(RT.shape.sphere(id, furL, ...P(0, 0.065, 0.255), 0.032));
      shapes.push(RT.shape.sphere(id, dark, ...P(0, 0.095, 0.262), 0.012));
      for (const sd of [-1, 1]) {
        shapes.push(RT.shape.sphere(id, fur, ...P(sd * 0.055, -0.005, 0.335), 0.03));
        shapes.push(RT.shape.sphere(id, dark, ...P(sd * 0.03, 0.068, 0.29), 0.009));
        shapes.push(RT.shape.capsule(id, fur, P(sd * 0.085, 0.01, 0.17), P(sd * 0.1, 0.07, 0.08), 0.032));
        shapes.push(RT.shape.capsule(id, fur, P(sd * 0.055, 0.03, 0.035), P(sd * 0.065, 0.12, 0.03), 0.038));
      }
    }
  });
  return { shapes, mats };
}
const ENV = { floorY: 0, floor: RT.plankFloor({ plank: 0.15, plankL: 1.2, base: '#c9b394', dark: '#b8a080', light: '#d8c4a6' }), sky: RT.softSky };
const LIGHT = { ...RT.STUDIO_LIGHT, dir: [-0.4, 1.25, 0.3] };
const EL = 52, FOV = 34, PAD = 26;
const CAMS = new WeakMap();
export function cameraOf(m) {
  if (CAMS.has(m)) return CAMS.get(m);
  const { shapes, mats } = sceneParts(m);
  const pts = [];
  for (const p of m.people) { const [X, Z] = toW(p); for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) pts.push([X + dx, 0, Z + dz]); pts.push([X, 1.8, Z]); }
  for (const o of m.objects) { const [X, Z] = toW(o); pts.push([X - 0.2, 0, Z], [X + 0.2, 0, Z], [X, 0, Z - 0.2], [X, 0, Z + 0.2], [X, PLINTH_H + 0.5, Z]); }
  const base = Math.floor(hashList(m.people.flatMap((p) => [p.x, p.y, p.yaw])) * 24);
  let best = null;
  for (let k = 0; k < 24; k++) {
    const az = ((base + k) % 24) * 15;
    const cam = frameOrbit({ az, el: EL, fov: FOV, pts, W: BOARD.w, H: BOARD.h, pad: PAD });
    const sc = RT.makeScene({ cam, shapes, mats, light: LIGHT, env: ENV });
    let worst = 1;
    for (const p of m.people) {
      const [X, Z] = toW(p), a = rad(p.yaw);
      worst = Math.min(worst, probeVis(sc, p.id, personProbes(X, Z, [Math.cos(a), 0, Math.sin(a)])));
      if (best && worst <= best.worst) break;
    }
    for (const o of m.objects) {
      if (best && worst <= best.worst) break;
      const [X, Z] = toW(o), y = PLINTH_H + OBJ_TOP[o.kind] * 0.5;
      worst = Math.min(worst, probeVis(sc, 100 + o.id, [[X, y, Z], [X + 0.06, y, Z], [X - 0.06, y, Z], [X, y, Z + 0.06], [X, y, Z - 0.06], [X, PLINTH_H + 0.03, Z]]));
    }
    if (!best || worst > best.worst) best = { cam, worst, az };
    if (worst >= 0.999) break;
  }
  CAMS.set(m, best);
  return best;
}
const SCENES = new WeakMap();
function sceneOf(m) {
  if (!SCENES.has(m)) { const { shapes, mats } = sceneParts(m); SCENES.set(m, RT.makeScene({ cam: cameraOf(m).cam, shapes, mats, light: LIGHT, env: ENV })); }
  return SCENES.get(m);
}
const LAMP_METALS = [['#c9a24a', 0.55, 60, 0.25], ['#b8bcc2', 0.6, 70, 0.3], ['#2e2e30', 0.4, 40, 0.15], ['#b87333', 0.5, 55, 0.22]];
const SHADES = ['#f1e3bf', '#f4f1ea', '#e2d3b5', '#cfd6c4', '#e9d8c8'];
const POTS = ['#b8673f', '#e8e4dc', '#8a8a86', '#3a3a3c', '#a88a5a', '#6b8a8f'];
const LEAVES = [['#4f8a3f', '#3f7534'], ['#5f9a3a', '#4a7f2c'], ['#3d7a4a', '#2f6238'], ['#6a8f3c', '#557a30']];
const VASES = ['#2f63a8', '#2f7f86', '#e6e2d8', '#9bb8a0', '#3a3a40', '#c0603f', '#7a5aa0', '#d8b04a'];
const FURS = [['#9a6a3e', '#c99e70'], ['#c79a62', '#e2c39a'], ['#7c7c7c', '#b4b4b0'], ['#e2d6c0', '#f2ead8'], ['#6a4630', '#a0785a']];
async function styleLook(style) {
  const rnd = style.rand;
  const env = await envLook(style, { tag: 'gaze_at_named_object', settings: ['lobby', 'plaza', 'park', 'hall', 'yard'], base: LIGHT,
    tileSizes: [0.5, 0.6, 0.75, 0.9, 1.2], L: [0.25, 0.55], named: [] });
  const wr = await wardrobe(style, N);
  const pt = pickTex(style, (t) => !/blocks|brick|planks|tile/.test(t.id) && ((t.use === 'stone' && /surface|monastery|seaside/.test(t.id)) || t.use === 'wood' || (t.use === 'wall' && /plaster|concrete/.test(t.id))), (t) => t.use === 'wood');
  const PT = await S3.loadTexture(pt.file);
  let L = 0.45 + 0.3 * rnd();
  if (Math.abs(L - S3.lum(env.face)) < 0.12) L = Math.min(0.85, S3.lum(env.face) + 0.2);
  const plinth = texMat(PT, faceOf(PT.mean, L, { maxSat: 0.12, warmSat: 0.3 }), { texWorld: 0.8, cv: 0.2, keep: 0.4 });
  const sp = (pool, list) => splitPick(style, `gaze_at_named_object|${pool}`, list);
  const lm = sp('lamp', LAMP_METALS), lv = sp('leaves', LEAVES), fur = sp('fur', FURS);
  const finish = { brass: { c: hexLin(lm[0]), ks: lm[1], sh: lm[2], env: lm[3] }, shade: { c: hexLin(sp('shade', SHADES)), ks: 0.04, sh: 8 },
    pot: { c: hexLin(sp('pot', POTS)), ks: 0.12, sh: 18 }, leaf: { c: hexLin(lv[0]), ks: 0.1, sh: 16 }, leaf2: { c: hexLin(lv[1]), ks: 0.1, sh: 16 },
    vase: { c: hexLin(sp('vase', VASES)), ks: 0.5, sh: 60, env: 0.3 }, fur: { c: hexLin(fur[0]), ks: 0.04, sh: 8 }, furL: { c: hexLin(fur[1]), ks: 0.04, sh: 8 } };
  style.note(`tex:${pt.id}`);
  return { key: style.key, env, wr, plinth, finish, ids: { ...env.ids, plinth: pt.id } };
}
const SCENES_STYLED = new WeakMap();
function sceneStyled(m, look) {
  let byKey = SCENES_STYLED.get(m);
  if (!byKey) { byKey = new Map(); SCENES_STYLED.set(m, byKey); }
  if (!byKey.has(look.key)) {
    const { shapes, mats } = sceneParts(m);
    const W = look.wr.mats(), F = look.finish;
    const base = W.mats.length + 10;
    const styled = W.mats.concat([look.plinth, F.brass, F.fur, F.furL, F.shade, F.pot, F.leaf, F.leaf2, F.vase, mats[base - 1]], mats.slice(base));
    if (styled.length !== mats.length) throw new Error('gaze_at_named_object: material layout changed');
    byKey.set(look.key, RT.makeScene({ cam: cameraOf(m).cam, shapes, mats: styled, light: look.env.light,
      env: { floorY: 0, floor: look.env.floor, sky: look.env.sky } }));
  }
  return byKey.get(look.key);
}
function screenOf(m, p, y) { const [X, Z] = toW(p); return cameraOf(m).cam.project(X, y, Z); }
function pictureErr(m, p, o) {
  const cam = cameraOf(m).cam, [X, Z] = toW(p), [ox, oz] = toW(o), a = rad(p.yaw);
  const p0 = cam.project(X, 0, Z), p1 = cam.project(X + 0.3 * Math.cos(a), 0, Z + 0.3 * Math.sin(a)), po = cam.project(ox, 0, oz);
  return angErr(Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI, Math.atan2(po.y - p0.y, po.x - p0.x) * 180 / Math.PI);
}

export default {
  meta: {
    name: 'gaze_at_named_object', family: 'A', 
    boardH: 384, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', item: 'person id 0..7 (each tap toggles one person; the exact set is scored at Verify)' }],
    promptHuman: 'Tap everyone looking at the named object (facing it straight on).', uses3d: true,
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      const nLook = drawLookCount(rng);
      const pool = kindPool(knobs.ext);
      for (let attempt = 0; attempt < 600; attempt++) {
        const m = tryBuild(rng, pool, knobs.ext, nLook);
        if (m) return m;
      }
      return fallback();
    }
    const nLook = drawLookCount(rng, N_LOOK_W_B);
    for (let attempt = 0; attempt < 600; attempt++) {
      const m = tryBuild(rng, KINDS, null, nLook, true);
      if (m) return m;
    }
    return fallbackBench();
  },

  init() { return { sel: [] }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'toggle' || !Number.isInteger(action.item)
      || action.item < 0 || action.item >= m.people.length) return { ok: false, reason: 'bad-item' };
    const k = state.sel.indexOf(action.item);
    if (k >= 0) state.sel.splice(k, 1); else state.sel.push(action.item);
    state.sel.sort((a, b) => a - b);
    return { ok: true, on: k < 0 };
  },

  verify(state, m) {
    const sel = (state.sel || []).slice().sort((a, b) => a - b), want = m.answer;
    const success = sel.length > 0 && sel.join(',') === want.join(',');
    const correct = sel.filter((i) => want.includes(i)).length, wrong = sel.length - correct;
    return {
      success,
      partial: success ? 1 : Math.max(0, (correct - wrong) / want.length),
      error: success ? 0 : 1,
      detail: { selected: sel, correct, wrong, need: want.length },
    };
  },

  oracle(m) { return m.answer.map((item) => ({ op: 'toggle', item })); },

  randomPolicy(m, rnd) {
    const ids = m.people.map((p) => p.id), k = 1 + Math.floor(rnd() * (ids.length - 1)), acts = [];
    for (let j = 0; j < k; j++) { const t = j + Math.floor(rnd() * (ids.length - j)); [ids[j], ids[t]] = [ids[t], ids[j]]; acts.push({ op: 'toggle', item: ids[j] }); }
    return acts;
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const m = env.manifest;
    drawPromptText(g, r, `Tap everyone looking at the ${KIND_NAME[m.objects[m.target].kind]}`, 'Looking at it = facing it straight on');
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state || { sel: [] }, sel = st.sel || [];
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const C = (this._cache ??= {}), q = Math.min(2, RT.contextScale(g));
    const look = env.style ? env.assets?.look : null, sk = look ? look.key : '';
    if (C.m !== m || C.q !== q || C.sk !== sk) { C.m = m; C.q = q; C.sk = sk; C.img = RT.render(look ? sceneStyled(m, look) : sceneOf(m), q); C.canvas = RT.toCanvas(C.img); C.ringKey = null; }
    g.drawImage(C.canvas, 0, 0, BOARD.w, BOARD.h);
    const rk = sel.join(',');
    if (C.ringKey !== rk) { C.ringKey = rk; C.rings = RT.silhouetteRings(C.img, new Set(sel), [25, 145, 250, 255], 2.5); }
    if (sel.length) g.drawImage(C.rings, 0, 0, BOARD.w, BOARD.h);
    for (const p of m.people) {
      if (!sel.includes(p.id)) continue;
      const t = screenOf(m, p, 1.95), bx = Math.max(10, Math.min(BOARD.w - 10, t.x)), by = Math.max(10, t.y - 6);
      g.beginPath(); g.arc(bx, by, 8, 0, TAU); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.lineWidth = 1.9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx - 3.4, by); g.lineTo(bx - 1, by + 2.7); g.lineTo(bx + 3.8, by - 3.1); g.stroke();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest;
    const id = RT.pickId(sceneOf(m), evt.x, evt.y);
    if (id >= 0 && id < m.people.length) return [{ op: 'toggle', item: id }];
    let best = -1, bd = 22;
    for (const p of m.people) {
      const q = screenOf(m, p, 1.1), d = Math.hypot(evt.x - q.x, evt.y - q.y);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best >= 0 ? [{ op: 'toggle', item: best }] : [];
  },

  footerStatus(env) {
    const n = env && env.state && env.state.sel ? env.state.sel.length : 0;
    return n ? `${n} selected` : 'Tap every person looking at it';
  },
};

export function gate(m) { return contractOk(m); }

export function semanticKey(m) {
  const cell = (p) => `${Math.min(7, Math.floor(p.x / (BOARD.w / 8)))},${Math.min(7, Math.floor(p.y / (BOARD.h / 8)))}`;
  const faced = (p) => { const o = facedObject(m, p); return o ? o.kind : `~${Math.round(p.yaw / 30) % 12}`; };
  const objs = m.objects.map((o) => `${o.kind}@${cell(o)}`).sort().join(' ');
  const ppl = m.people.map((p) => `${cell(p)}:${faced(p)}`).sort().join(' ');
  return `gaze_at_named_object|${m.objects[m.target].kind}|${objs}|${ppl}|ans@${m.answer.map((i) => cell(m.people[i])).sort().join(',')}`;
}
