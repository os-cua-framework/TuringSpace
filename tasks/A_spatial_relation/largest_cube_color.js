import { drawPromptText } from '../core/panel.js';
import { makeCam, makeScene, render, shape, lin, fbm, hash2, lineMask, pickNear, pickId, objectStats, toCanvas, contextScale, silhouetteRing } from '../common/_props_rt.js';
import { splitIds } from '../core/style.js';
import * as S3 from '../common/_style3d.js';
import * as LK from '../common/_block_scene_look.js';

const PANEL_W = 560;
const BOARD = { w: 540, h: 400 };
const HARD = Object.freeze({
  nK: 6, fillers: 0,
  nS: 4,
  pairMargin: 1.25,
  margin: 1.25,
  marginHi: 1.31,
  closeR: 1.5,
  farR: 2.0,
  invert: 1.08,
  sepA: 1.14,
  visNamed: 0.85,
  visFrac: 0.6,
  minVisPx: 300,
  minHgt: 24,
  edge: 16,
});
const COLORS = [
  ['red', '#c8342c'], ['blue', '#2e5cd8'], ['green', '#2b9848'], ['yellow', '#e2c11c'],
  ['purple', '#8d45cc'], ['cyan', '#23b3c3'], ['orange', '#e8801f'],
];
const KINDS = ['cube', 'ball', 'cylinder'];
const EXT_KINDS = ['cone', 'pyramid', 'capsule'];
const EXT_SPLIT = splitIds('largest_cube_color|kind', EXT_KINDS, 1);
const tallKind = (k) => k === 'cylinder' || k === 'cone' || k === 'pyramid' || k === 'capsule';
const QUEST = {
  largest: { word: 'largest' }, smallest: { word: 'smallest' }, tallest: { word: 'tallest' },
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const TILE_M = 1.0;

function cameraFor(rd) {
  const a = rd.cam.az * Math.PI / 180, dist = 10.2, h = rd.cam.h;
  const eye = [Math.sin(a) * dist, h, Math.cos(a) * dist];
  const tgt = [-Math.sin(a) * 1.6, 0.3, -Math.cos(a) * 1.6];
  return makeCam({ eye, target: tgt, fovY: 43, W: BOARD.w, H: BOARD.h });
}
const MATS = [];
for (const [, hex] of COLORS) {
  const c = lin(hex);
  MATS.push({ c, ks: 0.12, sh: 16, env: 0.06 });
  MATS.push({ c, ks: 0.55, sh: 60, env: 0.3 });
}
const PED = Object.freeze({ half: 0.85, body: 0.74, cap: 0.07, mat: COLORS.length * 2, id0: 100, lo: 0.5, hi: 2.0, tall: 1.4 });
MATS.push({ c: lin('#727880'), ks: 0.08, sh: 14, env: 0.03 });
MATS.push({ c: lin('#aeb3b9'), ks: 0.1, sh: 16, env: 0.04 });
const pedOf = (o) => o.ped || 0;
function pyramidShape(id, m, o) {
  const a = (o.yaw || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), pl = [0, -1, 0, 0];
  for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ux * ca + uz * sa, nz = -ux * sa + uz * ca, L = Math.hypot(o.h, o.s);
    const n = [nx * o.h / L, o.s / L, nz * o.h / L];
    pl.push(n[0], n[1], n[2], n[0] * o.x + n[1] * o.h + n[2] * o.z);
  }
  const R = o.s * 1.42;
  return shape.convex(id, m, pl, [o.x - R, 0, o.z - R, o.x + R, o.h, o.z + R]);
}
function shapesFor(rd) {
  const out = rd.objs.map((o, id) => {
    const m = o.col * 2 + o.gloss, b = pedOf(o);
    if (o.kind === 'cube') return shape.box(id, m, o.x, b + o.s, o.z, o.s, o.s, o.s, o.yaw, o.s * 0.09);
    if (o.kind === 'ball') return shape.sphere(id, m, o.x, b + o.s, o.z, o.s);
    if (o.kind === 'cone') return shape.frustum(id, m, o.x, o.z, 0, o.h, o.s, 0);
    if (o.kind === 'pyramid') return pyramidShape(id, m, o);
    if (o.kind === 'capsule') return shape.capsule(id, m, [o.x, o.s, o.z], [o.x, o.h - o.s, o.z], o.s);
    return shape.cyl(id, m, o.x, o.z, b, b + o.h, o.s, o.s * 0.08);
  });
  rd.objs.forEach((o, id) => {
    if (!pedOf(o)) return;
    const bh = o.ped - PED.cap;
    out.push(shape.box(PED.id0 + id, PED.mat, o.x, bh / 2, o.z, PED.body, bh / 2, PED.body, o.yaw, 0.02));
    out.push(shape.box(PED.id0 + id, PED.mat + 1, o.x, o.ped - PED.cap / 2, o.z, PED.half, PED.cap / 2, PED.half, o.yaw, 0.02));
  });
  return out;
}
const ENV = {
  floorY: 0,
  floor(x, z, fp, out) {
    const n = fbm(x * 0.9 + 3.1, z * 0.9 - 1.7, 4, fp * 0.9);
    const tile = hash2(Math.floor(x / TILE_M), Math.floor(z / TILE_M));
    const seam = Math.max(lineMask(x, TILE_M, 0.012, fp), lineMask(z, TILE_M, 0.012, fp));
    const sq = (u) => { const f = u / TILE_M, t = f - Math.floor(f), e = Math.min(t, 1 - t) * TILE_M;
      return (Math.floor(f) & 1 ? -1 : 1) * Math.min(1, e / Math.max(fp, 1e-6)); };
    const chk = sq(x) * sq(z) * (1 - Math.max(0, Math.min(1, (fp / TILE_M - 0.12) / 0.3)));
    let v = (0.4 + 0.022 * (n - 0.5) + 0.012 * (tile - 0.5)) * (1 - 0.28 * seam) * (1 + 0.06 * chk);
    const far = Math.max(0, Math.min(1, (fp - 0.03) / 0.05));
    v = v * (1 - far) + 0.47 * far;
    out[0] = v * 1.03; out[1] = v; out[2] = v * 0.94;
  },
  sky(dx, dy, dz, out) { out[0] = 0.86; out[1] = 0.84; out[2] = 0.8; },
};
const LIGHT = {
  dir: [-0.5, 1, 0.62], col: [1.12, 1.08, 1.0], soft: 0.08,
  sky: [0.46, 0.47, 0.5], ground: [0.2, 0.19, 0.18],
  fill: { dir: [0.75, 0.45, 0.45], col: [0.15, 0.15, 0.17] }, aoK: 1, contact: 0.3, contactH: 0.16,
};
const sceneCache = new WeakMap();
export function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = makeScene({ cam: cameraFor(rd), shapes: shapesFor(rd), mats: MATS, env: ENV, light: LIGHT }); sceneCache.set(rd, sc); }
  return sc;
}

const FACE_IDS = new Set([...LK.SAFE.concrete, ...LK.SAFE.stone, ...LK.SAFE.wood, 'sand_01', 'gravelly_sand', 'rocky_trail', 'brown_mud_dry', 'rock_01', 'rock_08']);
const OBJ_FAMS = ['plastic', 'rubber', 'wood', 'stone', 'metal', 'ceramic', 'concrete'];
async function styleLook(style, rd) {
  const rnd = style.rand;
  const faces = style.pool('tex', (t) => FACE_IDS.has(t.id)), hdris = style.pool('hdri');
  const fams = LK.splitPool(style, 'largest_cube_color|objects', OBJ_FAMS), rooms = LK.splitPool(style, 'largest_cube_color|room', ['back', 'open', 'corner', 'side']);
  const [fi, mi, hi] = style.primaryCombo('face-material-hdri', [faces.length, fams.length, hdris.length]);
  const faceItem = faces[fi], fam = fams[mi], hd = hdris[hi];
  const texFam = { wood: 'wood', stone: 'stone', metal: 'metal', concrete: 'concrete' }[fam];
  const pool = texFam ? LK.familyPool(style, texFam) : [], objItem = pool.length ? LK.pickFrom(pool, rnd()) : null;
  const roomKind = rooms[Math.floor(rnd() * rooms.length)], room = roomKind !== 'open';
  const wallItem = room ? LK.pickFrom(style.pool('tex', (t) => t.use === 'wall' || t.use === 'wood'), rnd()) : null;
  for (const it of [faceItem, objItem, wallItem]) if (it) style.note(`tex:${it.id}`);
  style.note(`hdri:${hd.id}`); style.note(`objects:${fam}`); style.note(room ? 'room' : 'open');
  const load = (it) => (it ? LK.loadTex(it) : null);
  const [Tf, To, Tw, sky] = await Promise.all([load(faceItem), load(objItem), load(wallItem), S3.loadSky(hd.sky)]);
  let face = S3.limitSat(Tf.mean, 0.22);
  face = S3.scaleTo(face, 0.13 + 0.37 * rnd());
  const grout = face.map((v) => v * 0.72);
  const light = S3.hdriLight(hd, LIGHT, { albedo: face, jitter: rnd() });
  const cam = cameraFor(rd);
  const mats = [];
  for (const [, hex] of COLORS) {
    const c = lin(hex);
    for (const gloss of [0, 1]) {
      let mt;
      if (fam === 'plastic') mt = { c, ks: gloss ? 0.6 : 0.2, sh: gloss ? 70 : 24, env: gloss ? 0.25 : 0.06 };
      else if (fam === 'rubber') mt = { c, ks: gloss ? 0.18 : 0.03, sh: 12, env: 0.02 };
      else if (fam === 'ceramic') mt = { c, ks: gloss ? 0.8 : 0.35, sh: gloss ? 110 : 40, env: gloss ? 0.3 : 0.12 };
      else if (!To) mt = { c, ks: gloss ? 0.5 : 0.12, sh: 40, env: 0.08 };
      else mt = LK.texMat(To, { tint: c, cv: fam === 'metal' ? 0.12 : 0.2, unit: 0.9, cam, ks: fam === 'metal' ? (gloss ? 0.7 : 0.45) : gloss ? 0.35 : 0.06, sh: fam === 'metal' ? 60 : 30, env: fam === 'metal' ? 0.12 : gloss ? 0.1 : 0.02 });
      mats.push(mt);
    }
  }
  mats.push({ c: S3.scaleTo(face.map((v) => v * 0.6 + 0.4 * 0.5), 0.55), ks: 0.06, sh: 12, env: 0.03 });
  mats.push({ c: S3.scaleTo(face.map((v) => v * 0.6 + 0.4 * 0.5), 0.75), ks: 0.08, sh: 14, env: 0.03 });
  const env = {
    floorY: 0,
    floor: S3.texTileFloor({ tex: Tf, tile: TILE_M, face, grout, cv: 0.16, texWorld: 1.0, groutHW: 0.012, groutK: 1, salt: 1 + Math.floor(rnd() * 997) }),
    sky: S3.skyFn(sky, 0.85 * S3.lum(light.sky) / 0.443, 0.15),
  };
  if (room) env.wall = S3.texWall({ tex: Tw, face: S3.scaleTo(S3.limitSat(Tw.mean, 0.15), 0.28 + 0.25 * rnd()), cv: 0.22, texWorld: 2.4, skirtH: 0.12 });
  if (roomKind === 'back' || roomKind === 'corner') env.wallZ = -14.6;
  if (roomKind === 'corner' || roomKind === 'side') { env.wallX = -(7.8 + 1.5 * rnd()); env.wallXDir = 1; }
  return { mats, env, light };
}

function screenSize(sc, o, id) {
  const st = objectStats(sc, id, 2, false), cam = sc.cam;
  let axis = st.hgt;
  if (o.kind === 'cylinder') {
    const a = cam.project(o.x, pedOf(o), o.z), b = cam.project(o.x, pedOf(o) + o.h, o.z);
    axis = Math.hypot(a.x - b.x, a.y - b.y);
  }
  return { area: st.area * st.step * st.step, hgt: st.hgt, axis, aspect: axis / Math.max(1, st.wid), st };
}
const realSize = (o, q) => (q === 'tallest' ? o.h : o.s);

function footR(o) { return pedOf(o) ? PED.half * 1.42 : o.kind === 'cube' || o.kind === 'pyramid' ? o.s * 1.42 : o.s; }
function inFrame(cam, o) {
  const R = footR(o), top = pedOf(o) + (tallKind(o.kind) ? o.h : o.s * 2), x = o.x, z = o.z;
  const pts = [[x - R, 0, z], [x + R, 0, z], [x, 0, z + R], [x, 0, z - R], [x - R, top, z], [x + R, top, z], [x, top, z - R], [x, top, z + R]];
  return pts.every(([px, py, pz]) => { const p = cam.project(px, py, pz); return p.z > 0.5 && p.x > HARD.edge + 2 && p.x < BOARD.w - HARD.edge - 2 && p.y > HARD.edge + 2 && p.y < BOARD.h - HARD.edge - 2; });
}
const rej = (why) => { const h = globalThis.__rej; if (h) h[why] = (h[why] || 0) + 1; return null; };
const Z0 = -10, Z1 = 4.6;
function tryRound(rng, q, kind, az, h, nd, sup, eUp, refIn, ext = null) {
  const rd = { q, kind, trap: nd > 0, nd, sup, refIn, cam: { az, h }, objs: [], ref: -1, answer: -1 };
  const cam = cameraFor(rd), eye = cam.eye;
  const cols = rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, HARD.nK + HARD.fillers);
  const decoyGroups = new Set(rng.shuffle([1, 2, 3, 4, 5]).slice(0, 2));
  const groupSize = (i) => (i === 0 || decoyGroups.has(i) ? HARD.nS : 2);
  const others = ext ? [...KINDS.filter((k) => k !== kind), ...EXT_KINDS.filter((k) => EXT_SPLIT(k) === ext)] : KINDS.filter((k) => k !== kind);
  const big = q !== 'smallest';
  const u = (a, b) => rng.uniform(a, b);
  const K = [];
  for (let i = 0; i < HARD.nK; i++) K.push({ kind, col: cols[i], gloss: rng.int(0, 1), s: 0.5, h: 1, yaw: r3(u(0, 90)) });
  const E = K[0];
  const ratios = [1, u(HARD.margin, HARD.marginHi), u(HARD.marginHi, 1.42), u(HARD.marginHi, 1.42), u(1.42, 1.6), u(HARD.closeR, HARD.farR)];
  if (q === 'largest') { E.s = u(0.5, 0.78); K.forEach((o, i) => { if (i) o.s = E.s / ratios[i]; }); }
  else if (q === 'smallest') { E.s = kind === 'cube' ? u(0.27, 0.36) : u(0.28, 0.37); K.forEach((o, i) => { if (i) o.s = E.s * ratios[i]; }); }
  else { E.h = u(1.35, 1.95); K.forEach((o, i) => { o.s = u(0.2, 0.55); if (i) o.h = E.h / ratios[i]; }); }
  const v = (o) => (q === 'tallest' ? o.h : o.s);
  const dy = eye[1] - 0.6;
  const dAt = (z) => Math.hypot(dy, eye[2] - z);
  const zFor = (d) => eye[2] - Math.sqrt(Math.max(0, d * d - dy * dy));
  const sh = rng.shuffle(K.slice(1)), decs = new Set(sh.slice(0, nd));
  const sep = q === 'tallest' ? HARD.sepA * 1.1 : HARD.sepA;
  E.z = u(Z0, Z1 - 1.2);
  const dE = dAt(E.z);
  for (const o of K.slice(1)) {
    const rho = v(o) / v(E);
    const dBig = dE * rho / sep, dSmall = dE * rho * sep;
    const wantBig = decs.has(o) === big;
    let lo = Z0, hi = Z1;
    if (wantBig) lo = Math.max(lo, zFor(dBig)); else hi = Math.min(hi, zFor(dSmall));
    if (wantBig && dBig < dAt(Z1)) return rej('decNear');
    if (hi - lo < 0.15) return rej('zone');
    o.z = u(lo, hi);
  }
  const raise = (o, lo, hi) => { o.ped = r3(u(lo, hi)); };
  if (big) {
    if (sup) raise(K[1], 1.5, PED.hi);
    if (eUp) raise(E, PED.lo, sup ? 0.85 : PED.hi);
  } else if (eUp) raise(E, PED.tall, PED.hi);
  const nRaise = big ? rng.int(2, 3) : 3;
  for (const o of rng.shuffle(K.slice(1).filter((x) => !x.ped))) { if (K.filter((x) => x.ped).length >= nRaise) break; raise(o, PED.lo, PED.hi); }
  const placed = [];
  const lateral = (o) => {
    for (let a = 0; a < 40; a++) {
      o.x = rng.uniform(-6.8, 6.8);
      if (placed.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < footR(p) + footR(o) + 0.35)) continue;
      if (!inFrame(cam, o)) continue;
      placed.push(o); return true;
    }
    return false;
  };
  for (const o of K) if (!lateral(o)) return rej('lateralK');
  const size = (k) => (k === 'cube' ? u(0.3, 0.62) : k === 'ball' ? u(0.3, 0.6) : k === 'cylinder' ? u(0.26, 0.52) : k === 'capsule' ? u(0.24, 0.42) : u(0.36, 0.62));
  const extra = [];
  for (let i = 0; i < HARD.nK + HARD.fillers; i++) for (let t = 0; t < (i < HARD.nK ? groupSize(i) - 1 : 1); t++) {
    const kk = rng.pick(others), col = i < HARD.nK ? K[i].col : cols[i];
    if (!ext || !EXT_KINDS.includes(kk)) extra.push({ kind: kk, col, gloss: rng.int(0, 1), s: size(kk), h: kk === 'cylinder' ? u(0.6, 1.4) : 0, yaw: r3(u(0, 90)) });
    else { const sz = size(kk); extra.push({ kind: kk, col, gloss: rng.int(0, 1), s: sz, h: kk === 'capsule' ? u(Math.max(0.9, 2.4 * sz), 1.6) : u(0.8, 1.6), yaw: r3(u(0, 90)) }); }
  }
  const nTw = HARD.nS - 1, all = [...K, ...extra];
  for (const o of extra) if (!EXT_KINDS.includes(o.kind) && rng.uniform(0, 1) < 0.15) o.ped = r3(u(PED.lo, 1.4));
  for (const o of extra.slice(nTw)) {
    let ok = false;
    for (let a = 0; a < 14 && !ok; a++) { o.z = u(Z0, Z1); ok = lateral(o); }
    if (!ok) return rej('lateralX');
  }
  const tw = extra.slice(0, nTw), pools = tw.map((o) => {
    const out = [];
    for (let a = 0; a < 160 && out.length < 50; a++) {
      o.x = rng.uniform(-6.8, 6.8); o.z = u(Z0, Z1);
      if (placed.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < footR(p) + footR(o) + 0.35) || !inFrame(cam, o)) continue;
      out.push([o.x, o.z]);
    }
    return out;
  });
  let twinsOk = false;
  if (pools.every((pl) => pl.length)) {
    for (let a = 0; a < 3000 && !twinsOk; a++) {
      const pick = pools.map((pl) => rng.pick(pl));
      tw.forEach((o, i) => { o.x = pick[i][0]; o.z = pick[i][1]; });
      if (tw.some((o, i) => tw.some((p, j) => j > i && Math.hypot(p.x - o.x, p.z - o.z) < footR(p) + footR(o) + 0.35))) continue;
      if (pairInfo({ cam: rd.cam, objs: all, ref: 0, refIn }).ok) twinsOk = true;
    }
  }
  if (twinsOk) placed.push(...tw);
  if (!twinsOk) return rej('twins');
  for (const o of all) { o.x = r3(o.x); o.z = r3(o.z); o.s = r3(o.s); o.h = tallKind(o.kind) ? r3(o.h) : 0; if (!o.ped) delete o.ped; }
  const order = rng.shuffle(all.map((_, i) => i));
  rd.objs = order.map((i) => all[i]);
  rd.ref = order.indexOf(0);
  const pr = pairInfo(rd);
  if (!pr.ok) return rej('pair');
  rd.answer = pr.answer;
  return finishRound(rd);
}
const centreOf = (o) => [o.x, pedOf(o) + (tallKind(o.kind) ? o.h / 2 : o.s), o.z];
export function pairInfo(rd) {
  const ref = rd.objs[rd.ref];
  if (!ref) return { ok: false };
  const S = rd.objs.map((o, i) => i).filter((i) => rd.objs[i].col === ref.col);
  if (S.length !== HARD.nS) return { ok: false };
  const cam = cameraFor(rd), P = S.map((i) => { const c = centreOf(rd.objs[i]); return { c, p: cam.project(c[0], c[1], c[2]) }; });
  const pairs = [];
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const A = P[a], B = P[b];
    pairs.push({ ids: [S[a], S[b]], world: Math.hypot(A.c[0] - B.c[0], A.c[2] - B.c[2]), scr: Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y),
      scrX: Math.abs(A.p.x - B.p.x), wx: Math.abs(A.c[0] - B.c[0]), wz: Math.abs(A.c[2] - B.c[2]) });
  }
  const top = (k) => pairs.reduce((b, q) => (q[k] > b[k] ? q : b));
  const best = top('world');
  const second = Math.max(...pairs.filter((q) => q !== best).map((q) => q.world));
  if (!(best.world >= second * HARD.pairMargin)) return { ok: false };
  if (typeof rd.refIn === 'boolean' && best.ids.includes(rd.ref) !== rd.refIn) return { ok: false };
  if (['scr', 'scrX', 'wx', 'wz'].some((k) => top(k) === best)) return { ok: false };
  return { ok: true, answer: best.ids.slice().sort((x, y) => x - y), group: S };
}
function finishRound(rd) {
  if (!pictureTrap(rd)) return rej('trap');
  const sc = sceneFor(rd), pts = [];
  for (let id = 0; id < rd.objs.length; id++) {
    const st = objectStats(sc, id, 2);
    const vf = rd.objs[id].kind === rd.kind ? HARD.visNamed : HARD.visFrac;
    if (st.off > 0 || st.frac < vf || st.vis * st.step * st.step < HARD.minVisPx || !st.pt || st.pt[2] < 4) return rej('vis');
    pts.push([r3(st.pt[0]), r3(st.pt[1])]);
  }
  rd.objs.forEach((o, id) => { o.pt = pts[id]; });
  return rd;
}
function pictureTrap(rd) {
  const sc = sceneFor(rd);
  const named = rd.objs.map((o, id) => ({ o, id })).filter((e) => e.o.kind === rd.kind);
  if (named.length !== HARD.nK) return false;
  const ref = named.find((e) => e.id === rd.ref);
  if (!ref) return false;
  const rv = realSize(ref.o, rd.q);
  const rat = named.filter((e) => e.id !== rd.ref).map((e) => { const x = realSize(e.o, rd.q); return rd.q === 'smallest' ? x / rv : rv / x; }).sort((a, b) => a - b);
  if (!(rat[0] >= HARD.margin - 1e-3 && rat[0] <= HARD.marginHi + 1e-3)) return false;
  if (!(rat[2] <= HARD.closeR + 1e-3) || !(rat[rat.length - 1] <= HARD.farR + 1e-3)) return false;
  const sz = new Map(named.map((e) => [e.id, screenSize(sc, e.o, e.id)]));
  if ([...sz.values()].some((z) => z.hgt < HARD.minHgt)) return false;
  const Rf = sz.get(rd.ref);
  const rest = named.filter((e) => e.id !== rd.ref).map((e) => sz.get(e.id));
  const e = sc.cam.eye, dist = (o) => Math.hypot(o.x - e[0], o.z - e[2]);
  const farthest = named.every((x) => x.id === rd.ref || dist(x.o) < dist(ref.o));
  if (rd.q !== 'smallest' && !farthest && !rest.some((z) => z.st.box[1] < Rf.st.box[1] - 3)) return false;
  if (typeof rd.sup !== 'boolean') return false;
  if (rd.sup) {
    const cam = sc.cam, fl = Math.hypot(cam.F[0], cam.F[2]);
    const yh = cam.project(cam.eye[0] + cam.F[0] / fl * 1e6, 0, cam.eye[2] + cam.F[2] / fl * 1e6).y;
    const naive = (z) => (rd.q === 'tallest' ? z.axis : z.hgt) / Math.max(1, z.st.box[3] - yh);
    const ne = naive(Rf), nr = rest.map(naive);
    if (rd.q === 'smallest' ? !(Math.min(...nr) * 1.06 <= ne) : !(Math.max(...nr) >= ne * 1.06)) return false;
  }
  const nd = rd.nd;
  if (rd.trap !== (nd > 0) || !(nd >= 0 && nd <= HARD.nK - 1)) return false;
  let beat = 0, lost = 0;
  if (rd.q === 'tallest') {
    for (const z of rest) {
      if (z.axis >= Rf.axis * HARD.invert) beat++;
      else if (Rf.axis >= z.axis * HARD.invert) lost++;
    }
  } else {
    const bigr = (a, b) => (rd.q === 'smallest' ? a * HARD.invert <= b : a >= b * HARD.invert);
    for (const z of rest) {
      if (bigr(z.area, Rf.area) && bigr(z.hgt, Rf.hgt)) beat++;
      else if (bigr(Rf.area, z.area) && bigr(Rf.hgt, z.hgt)) lost++;
    }
  }
  return beat === nd && lost === rest.length - nd;
}
function makeRound(rng, q, kind, ext = null) {
  const nd = rng.uniform(0, 1) < 0.2 ? 0 : rng.int(1, 3);
  const sup = rng.uniform(0, 1) < (q === 'smallest' ? 0.6 : 0.75);
  const eUp = q === 'smallest' ? sup : rng.uniform(0, 1) < 0.5;
  const refIn = rng.uniform(0, 1) < 0.5;
  for (let a = 0; a < 20000; a++) {
    const az = r3(rng.uniform(-14, 14)), h = r3(rng.uniform(4.6, 5.4));
    const rd = ext ? tryRound(rng, q, kind, az, h, nd, sup, eUp, refIn, ext) : tryRound(rng, q, kind, az, h, nd, sup, eUp, refIn);
    if (rd) return rd;
  }
  throw new Error('largest_cube_color: sampler exhausted');
}

export function semanticKey(m) {
  const q = (v, s) => Math.floor(v / s);
  const grp = (id) => m.objs.filter((o) => o.col === m.objs[id].col).length;
  const role = (o, id) => (id === m.ref ? 'E' : m.answer.includes(id) ? 'A' : m.objs[id].col === m.objs[m.ref].col ? 'G' : o.kind === m.kind ? 'N' + grp(id) : 'T' + grp(id));
  const objs = m.objs.map((o, id) => `${role(o, id)}${o.kind}${o.ped ? '^' : ''}@${q(o.pt[0], BOARD.w / 8)},${q(o.pt[1], BOARD.h / 8)}`).sort();
  return `largest_cube_color|${m.q}|${m.kind}|${m.trap ? 'trap' + m.nd : 'plain'}|${m.sup ? 'sup' : 'nosup'}|az${Math.round(m.cam.az / 15)}|${objs.join(';')}`;
}

export function gate(m) {
  if (!m || m.task !== 'largest_cube_color' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (m.rounds !== undefined || typeof m.trap !== 'boolean' || typeof m.refIn !== 'boolean') return false;
  if (!(m.q === 'largest' ? m.kind === 'cube' : m.q === 'tallest' ? m.kind === 'cylinder' : m.q === 'smallest' && ['cube', 'ball'].includes(m.kind))) return false;
  const rd0 = m;
  if (!QUEST[rd0.q] || !KINDS.includes(rd0.kind) || !Array.isArray(rd0.objs)) return false;
  if (rd0.objs.length !== HARD.nK + 3 * (HARD.nS - 1) + 3 + HARD.fillers) return false;
  const rd = { ...rd0, objs: rd0.objs.map((o) => ({ ...o })) };
  const named = rd.objs.filter((o) => o.kind === rd.kind);
  if (named.length !== HARD.nK) return false;
  if (!rd.objs.every((o) => KINDS.includes(o.kind) || (m.ext === true && EXT_KINDS.includes(o.kind)))) return false;
  const byCol = new Map();
  rd.objs.forEach((o, id) => { if (!byCol.has(o.col)) byCol.set(o.col, []); byCol.get(o.col).push(id); });
  for (const [, ids] of byCol) if (ids.filter((i) => rd.objs[i].kind === rd.kind).length !== 1) return false;
  if (byCol.size !== HARD.nK + HARD.fillers) return false;
  if (rd.objs[rd.ref]?.kind !== rd.kind) return false;
  const sizes = named.map((o) => byCol.get(o.col).length);
  if (byCol.get(rd.objs[rd.ref].col).length !== HARD.nS || sizes.filter((z) => z === HARD.nS).length !== 3 || sizes.filter((z) => z === 2).length !== 3) return false;
  const pr = pairInfo(rd);
  if (!pr.ok || !Array.isArray(rd.answer) || rd.answer.length !== 2 || rd.answer[0] !== pr.answer[0] || rd.answer[1] !== pr.answer[1]) return false;
  if (rd.answer.includes(rd.ref) !== rd.refIn) return false;
  for (const o of rd.objs) if (o.ped !== undefined) {
    if (!(o.ped >= PED.lo - 1e-3 && o.ped <= PED.hi + 1e-3) || EXT_KINDS.includes(o.kind) || o.s > PED.half - 0.05) return false;
  }
  for (let i = 0; i < rd.objs.length; i++) for (let j = i + 1; j < rd.objs.length; j++) {
    const a = rd.objs[i], b = rd.objs[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < footR(a) + footR(b) + 0.2) return false;
  }
  const sc = sceneFor(rd);
  if (!pictureTrap(rd)) return false;
  for (let id = 0; id < rd.objs.length; id++) {
    const st = objectStats(sc, id, 2), pt = rd.objs[id].pt;
    const vf = rd.objs[id].kind === rd.kind ? HARD.visNamed : HARD.visFrac;
    if (st.off > 0 || st.frac < vf || st.vis * st.step * st.step < HARD.minVisPx) return false;
    if (!Array.isArray(pt) || pickId(sc, pt[0], pt[1]) !== id) return false;
  }
  return true;
}

function promptFor(rd) {
  const noun = rd.kind === 'cylinder' ? 'cylinder' : rd.kind, dim = rd.q === 'tallest' ? 'height' : 'size';
  return {
    main: `Find the ${QUEST[rd.q].word} ${noun}; of the objects in its color (it too), click the 2 farthest apart`,
    sub: `Real ${dim}, not on screen · floor distance, not picture distance · stands don't count`,
  };
}

export default {
  meta: {
    name: 'largest_cube_color', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'click an object to select it, click it again to deselect; two objects are selected at most (a third drops the oldest); Verify scores the pair' }],
    promptHuman: 'Find the extreme solid named on the card (the largest cube, the smallest cube or ball, or the tallest cylinder: its own real size, grey stands do not count), then, among the objects of its color (the extreme solid itself counts), click the 2 that are farthest apart on the floor',
  },

  generate(rng, _level, _index, knobs = {}) {
    const q = rng.pick(['largest', 'smallest', 'tallest']);
    const kind = q === 'largest' ? 'cube' : q === 'tallest' ? 'cylinder' : rng.pick(['cube', 'ball']);
    if (knobs.ext) return { task: 'largest_cube_color', board: { ...BOARD }, ext: true, ...makeRound(rng, q, kind, knobs.ext) };
    return { task: 'largest_cube_color', board: { ...BOARD }, ...makeRound(rng, q, kind) };
  },

  init() { return { picks: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = pickNear(sceneFor(m), a.x, a.y, 10);
    if (id < 0 || id >= m.objs.length) return { ok: false, reason: 'no-object' };
    const at = s.picks.indexOf(id);
    if (at >= 0) { s.picks.splice(at, 1); return { ok: true, cleared: true }; }
    s.picks.push(id);
    if (s.picks.length > 2) s.picks.shift();
    return { ok: true };
  },

  verify(s, m) {
    const hit = s.picks.filter((i) => m.answer.includes(i)).length;
    const success = s.picks.length === 2 && hit === 2;
    return { success, partial: hit / 2, error: success ? 0 : 1, detail: { done: s.picks.length, picks: s.picks.slice(), answer: m.answer, q: m.q, kind: m.kind, trap: m.trap } };
  },

  oracle(m) { return m.answer.map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] })); },

  randomPolicy(m, rnd) {
    const a = Math.floor(rnd() * m.objs.length);
    let b = Math.floor(rnd() * (m.objs.length - 1)); if (b >= a) b++;
    return [a, b].map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] }));
  },

  async mount(env) {
    env.assets.lcc = { img: null, key: '', ring: null, ringKey: '' };
    if (env.style) env.assets.look = await styleLook(env.style, env.manifest);
  },

  drawPrompt(g, r, env) {
    const p = promptFor(env.manifest);
    drawPromptText(g, r, p.main, p.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.lcc || (env.assets.lcc = {});
    const q = contextScale(g);
    const key = `${q}`;
    const look = env.style ? env.assets.look : null;
    if (A.key !== key) {
      A.img = render(look ? makeScene({ cam: cameraFor(m), shapes: shapesFor(m), mats: look.mats, env: look.env, light: look.light }) : sceneFor(m), q);
      A.canvas = toCanvas(A.img); A.key = key; A.ring = null; A.ringKey = '';
    }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    if (!A.rings || A.ringsKey !== key) { A.rings = new Map(); A.ringsKey = key; }
    for (const id of s.picks) {
      let ring = A.rings.get(id);
      if (!ring) { ring = silhouetteRing(A.img, id, [25, 145, 250, 255], 2.5); A.rings.set(id, ring); }
      g.drawImage(ring, 0, 0, BOARD.w, BOARD.h);
    }
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted || e.type !== 'down') return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    const n = env.state.picks.length;
    return n ? `${n}/2 selected \u00b7 click one again to deselect` : 'Click the 2 objects';
  },
};
