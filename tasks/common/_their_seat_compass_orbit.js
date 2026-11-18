export const ORBIT_CUE = 'orbit';

export const ORBIT = {
  NEW_MARGIN: 20,
  PIVOT_MIN: 0.8,
  CLEAR_OBJ: 0.6,
  CLEAR_HER: 1.0,
  WALL_IN: 0.35,
  SIDE_X: 2.0,
  VIS_AFTER: 0.5,
  REL: [[56, 65], [115, 124]],
};

const rad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => norm360(d + 180) - 180;
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const bearing = (x, z) => norm360((Math.atan2(x, z) * 180) / Math.PI);
const sectorOf = (theta) => (((Math.round(theta / 45) % 8) + 8) % 8);
const egoTheta = (f, x, z) => norm180(f - bearing(x, z));
const insideMargin = (theta) => 22.5 - Math.abs(theta - 45 * Math.round(theta / 45));
const centre = (s) => (s <= 4 ? s * 45 : s * 45 - 360);
const polar = (f, theta, r) => { const b = rad(f - theta); return { x: Math.sin(b) * r, z: Math.cos(b) * r }; };
const screenUpBearing = (cam) => bearing(cam.F[0], cam.F[2]);
function screenSector(cam, x, z) {
  const o = cam.project(0, 0, 0), p = cam.project(x, 0, z);
  return sectorOf((Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90);
}
export function snappedFacing(f, suB) { return norm360(suB + 90 * Math.round(norm180(f - suB) / 90)); }

export function orbitAnswer(m) { return m.objects.map((o) => (o.id === m.orbit.obj ? m.orbit.sector : o.sector)); }
export function orbitMovedManifest(m) {
  const { orbit, ...rest } = m;
  return { ...rest, objects: m.objects.map((o) => (o.id === orbit.obj ? { ...o, x: orbit.x, z: orbit.z } : o)) };
}

export function orbitPrompt(m) {
  const q = m.objects[m.orbit.obj].kind, p = m.objects[m.orbit.pivot].kind;
  return {
    main: `Drag each icon onto the dial as she sees it after the ${q} is moved to the other side of the ${p}`,
    sub: `Straight across the ${p}, the same distance from it`,
  };
}

export function orbitReadings(m, cam) {
  const ans = orbitAnswer(m), q = m.orbit.obj, X = m.objects[q], f = m.facing, suB = screenUpBearing(cam);
  const fs = snappedFacing(f, suB);
  const with1 = (s) => ans.map((v, i) => (i === q ? s : v));
  const P = m.objects[m.orbit.pivot];
  const sP = P.sector, sX = X.sector;
  return {
    stay: with1(sX),
    flip: with1((sX + 4) % 8),
    viaHer: with1(sectorOf(egoTheta(f, -X.x, -X.z))),
    snapMoved: with1(sectorOf(egoTheta(fs, m.orbit.x, m.orbit.z))),
    snapAll: m.objects.map((o, i) => sectorOf(egoTheta(fs, i === q ? m.orbit.x : o.x, i === q ? m.orbit.z : o.z))),
    screenMoved: with1(screenSector(cam, m.orbit.x, m.orbit.z)),
    awayMoved: with1(sectorOf(egoTheta(suB, m.orbit.x, m.orbit.z))),
    meMoved: with1(sectorOf(egoTheta(suB + 180, m.orbit.x, m.orbit.z))),
    anchorAll: (() => { const a = anchorThing(m), fa = bearing(a.x, a.z);
      return m.objects.map((o, i) => sectorOf(egoTheta(fa, i === q ? m.orbit.x : o.x, i === q ? m.orbit.z : o.z))); })(),
    anchorOne: (() => { const a = anchorThing(m); return ans.map((v, i) => (i === a.id ? 0 : v)); })(),
    wedgeMirror: with1((((2 * sP - sX) % 8) + 8) % 8),
  };
}
export const GATED_READINGS = ['stay', 'flip', 'viaHer', 'snapMoved', 'snapAll', 'screenMoved', 'awayMoved', 'meMoved', 'anchorAll', 'anchorOne'];
const same = (a, b) => a.every((v, i) => v === b[i]);
function anchorThing(m) {
  let best = null;
  for (const o of m.objects) if (o.id !== m.orbit.obj) { const t = Math.abs(egoTheta(m.facing, o.x, o.z)); if (!best || t < best.t) best = { t, o }; }
  return best.o;
}

export function orbitGeometryProblems(m, cam) {
  const P = [], o = m.orbit;
  if (!o || !Number.isInteger(o.obj) || !Number.isInteger(o.pivot) || o.obj === o.pivot || o.obj < 0 || o.obj > 4 || o.pivot < 0 || o.pivot > 4) return ['orbit'];
  const X = m.objects[o.obj], Pv = m.objects[o.pivot], f = m.facing, suB = screenUpBearing(cam);
  if (Math.abs(o.x - (2 * Pv.x - X.x)) > 0.006 || Math.abs(o.z - (2 * Pv.z - X.z)) > 0.006) P.push('orbit-not-reflection');
  const tN = egoTheta(f, o.x, o.z);
  if (sectorOf(tN) !== o.sector) P.push('orbit-sector');
  if (insideMargin(tN) < ORBIT.NEW_MARGIN) P.push('orbit-margin');
  if (Math.hypot(X.x - Pv.x, X.z - Pv.z) < ORBIT.PIVOT_MIN) P.push('orbit-pivot-close');
  const rel = angMinD(f, suB);
  if (Math.abs(rel - 90) < 24.5) P.push('orbit-facing-near-profile');
  const ans = orbitAnswer(m);
  if (new Set(ans).size !== 5) P.push('orbit-wedge-taken');
  const R = orbitReadings(m, cam);
  for (const k of GATED_READINGS) if (same(R[k], ans)) P.push(`orbit-${k}`);
  if (ans.includes(0) || m.objects.some((b) => b.sector === 0)) P.push('orbit-front-filled');
  if (!m.objects.some((b) => b.id !== o.obj && (b.sector === 1 || b.sector === 7))) P.push('orbit-no-front-decoy');
  if (ans.filter((s) => s % 2 === 1).length < 3) P.push('orbit-few-diagonals');
  if (o.z < -2.6 + ORBIT.WALL_IN || Math.abs(o.x) > ORBIT.SIDE_X) P.push('orbit-outside-room');
  if (Math.hypot(o.x, o.z) < ORBIT.CLEAR_HER) P.push('orbit-hits-her');
  for (const b of m.objects) if (b.id !== o.obj && Math.hypot(b.x - o.x, b.z - o.z) < ORBIT.CLEAR_OBJ) P.push('orbit-collides');
  return P;
}
function angMinD(a, b) { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; }

export function orbitSceneProblems(m, scAfter, objectStats, W, H) {
  const P = [], st = objectStats(scAfter, m.orbit.obj, 2, true);
  if (st.frac < ORBIT.VIS_AFTER) P.push('orbit-after-occluded');
  if (!st.box || st.box[0] < 0.05 * W || st.box[2] > 0.95 * W || st.box[1] < 0.05 * H || st.box[3] > 0.95 * H) P.push('orbit-after-frame');
  return P;
}

export function sampleOrbit(rng, deps) {
  const { orbitCam, BOARD, SCENE_H, KINDS, R_MIN, R_MAX, check } = deps;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const camera = { az: round2(rng.uniform(-30, 30)), el: round2(rng.uniform(36, 42)), dist: 6.1, fov: 34, tx: 0, ty: 0.42, tz: 0 };
    const cam = orbitCam(camera, BOARD.w, SCENE_H), suB = screenUpBearing(cam);
    const band = rng.pick(ORBIT.REL);
    const f = round1(norm360(suB + rng.sign() * rng.uniform(band[0], band[1])));
    const sP = rng.int(0, 7), d = rng.sign(), sN = (sP + d + 8) % 8;
    const e = rng.uniform(-1.5, 1.5), tN = centre(sN) + e;
    const rP = rng.uniform(R_MIN + 0.02, R_MAX - 0.02), rX = rng.uniform(R_MIN + 0.02, R_MAX - 0.02);
    const aMax = rX < 2 * rP ? (Math.asin(rX / (2 * rP)) * 180) / Math.PI : 180, aLo = 33 + d * e, aHi = Math.min(57 + d * e, aMax);
    if (aHi <= aLo) continue;
    const tP = tN - d * rng.uniform(aLo, aHi);
    const Pp = polar(f, tP, rP), ub = rad(f - tN), u = { x: Math.sin(ub), z: Math.cos(ub) };
    const pu = Pp.x * u.x + Pp.z * u.z, disc = 4 * pu * pu - 4 * rP * rP + rX * rX;
    const pick = rng.sign();
    if (disc < 0) continue;
    const t = 2 * pu + pick * Math.sqrt(disc);
    if (t <= 0.5) continue;
    const Xp = { x: 2 * Pp.x - t * u.x, z: 2 * Pp.z - t * u.z };
    const tX = egoTheta(f, Xp.x, Xp.z), sX = sectorOf(tX);
    if (insideMargin(tX) < 10.5 || sX === sP || sX === sN) continue;
    const used = new Set([sP, sX, sN]);
    const rest = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7].filter((s) => !used.has(s))).slice(0, 3);
    const ids = rng.shuffle([0, 1, 2, 3, 4]), q = ids[0], p = ids[1];
    const sectors = []; sectors[q] = sX; sectors[p] = sP; ids.slice(2).forEach((id, k) => { sectors[id] = rest[k]; });
    const objects = KINDS.map((kind, i) => {
      let x, z;
      if (i === q) { x = Xp.x; z = Xp.z; } else if (i === p) { x = Pp.x; z = Pp.z; } else {
        const th = centre(sectors[i]) + rng.uniform(-8, 8), r = rng.uniform(R_MIN + 0.02, R_MAX - 0.02), c = polar(f, th, r);
        x = c.x; z = c.z;
      }
      return { id: i, kind, x: round2(x), z: round2(z), yaw: round1(rng.uniform(0, 360)), sector: sectors[i] };
    });
    const ch = objects[2]; ch.yaw = round1(norm360(bearing(-ch.x, -ch.z) + rng.uniform(-40, 40)));
    const X = objects[q], Pv = objects[p], nx = round2(2 * Pv.x - X.x), nz = round2(2 * Pv.z - X.z);
    const m = { task: 'their_seat_compass', board: { ...BOARD }, camera, facing: f, look: rng.pick([0, 2, 4]), objects,
      cue: ORBIT_CUE, orbit: { obj: q, pivot: p, x: nx, z: nz, sector: sectorOf(egoTheta(f, nx, nz)) } };
    if (orbitGeometryProblems(m, cam).length) continue;
    if (check(m).length) continue;
    return m;
  }
  throw new Error('their_seat_compass: generator exhausted (orbit)');
}
