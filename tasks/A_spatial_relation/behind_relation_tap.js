import { hashStr } from '../core/rng.js';
import { drawPromptText } from '../core/panel.js';
import { makeCam, makeScene, render, shape, lin, fbm, hash2, lineMask, pickNear, pickId, objectStats, toCanvas, contextScale, silhouetteRing } from '../common/_largest_cube_color_rt.js';
import { S3, gridFloor, faceColour, paintMat, FINISHES, loadAll, litFix, splitOf, pickOf } from '../common/_relation_scene_look.js';
import { makeMatInstance, matEnv, matOk, matBaseOk, matPrompt, matSemantic, matHeuristics, matVisNeed, truthAfter } from '../common/_behind_relation_mat.js';

const PANEL_W = 480;
const BOARD = { w: 460, h: 372 };
const TYPES = ['behind', 'closest', 'farthest'];
const HARD = Object.freeze({
  qIn: 0.2,
  sideOut: 1.3,
  sideHi: 2.1,
  minRatio: 1.1,
  domRatio: 1.3,
  tightRatio: 1.35,
  minTight: 3,
  edge: 6,
});
const COLORS = [['red', '#d23a2f'], ['blue', '#2d63d6'], ['green', '#2f9a47'], ['yellow', '#f2bf22'],
  ['orange', '#ef7d22'], ['purple', '#8d4bc9'], ['white', '#ece7dc'], ['cyan', '#22b3c4'], ['pink', '#ea76ad']];
const N_NAMED = 7;
const NOUN = { block: 'block', ball: 'ball', cyl: 'cylinder', cone: 'cone' };
const NB = 8;
const r3 = (v) => Math.round(v * 1000) / 1000;
const D2R = Math.PI / 180;

const WALL_Z = -4.6;
function cameraFor(rd) {
  const a = rd.cam.az * D2R, dist = 6.3;
  const target = rd.cam.tx === undefined ? [-Math.sin(a) * 0.1, 0.0, -Math.cos(a) * 0.1] : [rd.cam.tx, 0.0, -Math.cos(a) * 0.1];
  return makeCam({ eye: [Math.sin(a) * dist, rd.cam.h, Math.cos(a) * dist], target, fovY: 44, W: BOARD.w, H: BOARD.h });
}
const MATS = COLORS.map(([, hex]) => ({ c: lin(hex), ks: 0.45, sh: 45, env: 0.16 }));
const topOf = (o) => (o.kind === 'ball' || o.kind === 'block' ? o.y + 2 * o.s : o.y + o.h);
function shapesFor(rd) {
  return rd.objs.map((o, id) => {
    if (o.kind === 'block') return shape.box(id, o.col, o.x, o.y + o.s, o.z, o.s, o.s, o.s, o.yaw, o.s * 0.16);
    if (o.kind === 'ball') return shape.sphere(id, o.col, o.x, o.y + o.s, o.z, o.s);
    if (o.kind === 'cyl') return shape.cyl(id, o.col, o.x, o.z, o.y, o.y + o.h, o.s, o.s * 0.12);
    return shape.frustum(id, o.col, o.x, o.z, o.y, o.y + o.h, o.s, 0);
  });
}
const SQ = 0.8;
const ENV = {
  floorY: 0, wallZ: WALL_Z,
  floor(x, z, fp, out) {
    const i = Math.floor(x / SQ), j = Math.floor(z / SQ), dark = (i + j) & 1;
    const along = dark ? x : z, across = dark ? z : x;
    const grain = fbm(across * 9 + i * 7.3, along * 0.9 + j * 5.1, 4, fp * 9);
    const tint = 0.9 + 0.16 * hash2(i, j);
    const seam = Math.max(lineMask(x, SQ, 0.012, fp), lineMask(z, SQ, 0.012, fp));
    const t = tint * (0.84 + 0.2 * grain) * (1 - 0.5 * seam);
    if (dark) { out[0] = 0.26 * t; out[1] = 0.13 * t; out[2] = 0.055 * t; }
    else { out[0] = 0.56 * t; out[1] = 0.36 * t; out[2] = 0.18 * t; }
  },
  wall(x, y, fp, out) {
    const n = fbm(x * 2.1, y * 2.1, 3, fp * 2.1);
    const base = y < 0.32 ? 0.55 : 1;
    const v = (0.62 + 0.05 * n) * base;
    out[0] = v * 0.98; out[1] = v * 0.9; out[2] = v * 0.78;
  },
  sky(dx, dy, dz, out) { out[0] = 0.55; out[1] = 0.5; out[2] = 0.44; },
};
const LIGHT = {
  dir: [-0.55, 1, 0.5], col: [1.3, 1.16, 0.98], soft: 0.08,
  sky: [0.42, 0.38, 0.34], ground: [0.2, 0.14, 0.09],
  fill: { dir: [0.7, 0.5, 0.6], col: [0.14, 0.13, 0.14] }, aoK: 1, contact: 0.32, contactH: 0.12,
};
const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = makeScene({ cam: cameraFor(rd), shapes: shapesFor(rd), mats: MATS, env: rd.mat ? matEnv(ENV, rd.mat) : ENV, light: LIGHT }); sceneCache.set(rd, sc); }
  return sc;
}

const footR = (o) => (o.kind === 'block' ? o.s * 1.42 : o.s);
const tdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function sight(rd, R, p) {
  const e = cameraFor(rd).eye, ux = R.x - e[0], uz = R.z - e[2], ul = Math.hypot(ux, uz);
  const vx = p.x - R.x, vz = p.z - R.z, vl = Math.hypot(vx, vz);
  const along = (vx * ux + vz * uz) / ul, lat = (vz * ux - vx * uz) / ul;
  return { ang: Math.atan2(Math.abs(lat), along) / D2R, along, lat, dist: vl };
}
function halfW(o, ux, uz) {
  if (o.kind !== 'block') return o.s;
  const a = o.yaw * D2R, ca = Math.cos(a), sa = Math.sin(a);
  const px = -uz, pz = ux;
  return o.s * (Math.abs(px * ca - pz * sa) + Math.abs(px * sa + pz * ca));
}
function axisK(rd, R, p) {
  const e = cameraFor(rd).eye, ux0 = R.x - e[0], uz0 = R.z - e[2], dR = Math.hypot(ux0, uz0), ux = ux0 / dR, uz = uz0 / dR;
  const s = sight(rd, R, p), dP = Math.hypot(p.x - e[0], p.z - e[2]);
  const unit = halfW(R, ux, uz) / dR;
  return { k: Math.abs(s.lat) / dP / unit, kIn: (Math.abs(s.lat) - halfW(p, ux, uz)) / dP / unit, along: s.along, lat: s.lat };
}
function pixDist(cam, a, b) {
  const c = (o) => cam.project(o.x, o.y + (topOf(o) - o.y) / 2, o.z);
  const p = c(a), q = c(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
function inFrame(cam, o) {
  const R = footR(o), t = topOf(o);
  for (const [x, y, z] of [[o.x - R, o.y, o.z], [o.x + R, o.y, o.z], [o.x, o.y, o.z - R], [o.x, o.y, o.z + R], [o.x - R, t, o.z], [o.x + R, t, o.z], [o.x, t, o.z - R], [o.x, t, o.z + R]]) {
    const p = cam.project(x, y, z);
    if (!(p.z > 0.5 && p.x > HARD.edge + 2 && p.x < BOARD.w - HARD.edge - 2 && p.y > HARD.edge + 2 && p.y < BOARD.h - HARD.edge - 2)) return false;
  }
  return true;
}

const u = (rng, a, b) => rng.uniform(a, b);
function newToy(rng, kind, col) {
  const o = { kind, col, x: 0, z: 0, y: 0, s: 0.3, h: 0, yaw: r3(u(rng, 0, 90)) };
  if (kind === 'block') o.s = u(rng, 0.3, 0.42);
  else if (kind === 'ball') o.s = u(rng, 0.25, 0.36);
  else if (kind === 'cyl') { o.s = u(rng, 0.27, 0.38); o.h = u(rng, 0.6, 1.0); }
  else { o.s = u(rng, 0.28, 0.38); o.h = u(rng, 0.7, 1.1); }
  return o;
}
function clearOf(o, placed, pad = 0.18) {
  return placed.every((p) => (p.y > 0 || o.y > 0) ? true : tdist(p, o) >= footR(p) + footR(o) + pad);
}
function spotRandom(rng, cam, o, placed, ok = () => true) {
  for (let a = 0; a < 60; a++) {
    o.x = u(rng, -3.2, 3.2); o.z = u(rng, -3.6, 3.2);
    if (clearOf(o, placed) && inFrame(cam, o) && ok(o)) return true;
  }
  return false;
}
function finalize(rd) {
  for (const o of rd.objs) { for (const k of ['x', 'z', 'y', 's', 'h']) o[k] = r3(o[k]); }
  return rd;
}
function visibleOk(rd, minFrac) {
  const sc = sceneFor(rd), out = [];
  for (let id = 0; id < rd.objs.length; id++) {
    const st = objectStats(sc, id, 2), need = minFrac(id);
    if (st.off > 0 || st.frac < need || st.vis * 4 < 230 || !st.pt || st.pt[2] < 3) return null;
    rd.objs[id].pt = [r3(st.pt[0]), r3(st.pt[1])];
    out.push(st);
  }
  return out;
}
function peeker(rng, kind, col, R) {
  const Q = newToy(rng, kind, col);
  if (Q.kind === 'cyl' || Q.kind === 'cone') Q.h = Math.max(Q.h, topOf(R) + u(rng, 0.25, 0.5));
  if (Q.kind === 'block') Q.s = Math.max(Q.s, topOf(R) / 2 * u(rng, 0.9, 1.1) + 0.05);
  if (Q.kind === 'ball') Q.s = u(rng, 0.34, 0.42);
  return Q;
}

function tryBehind(rng, cam0, flags, multi = false) {
  const rd = { type: 'behind', cam: cam0, objs: [], ref: 0, answer: 1 };
  const cam = cameraFor(rd);
  const cols = [...rng.shuffle([0, 1, 2, 3, 4, 5, 6]), 7, 8];
  const R = newToy(rng, rng.pick(['cyl', 'block']), cols[0]);
  if (R.kind === 'cyl') { R.s = u(rng, 0.32, 0.42); R.h = u(rng, 0.55, 0.85); } else R.s = u(rng, 0.32, 0.4);
  R.x = u(rng, -1.8, 1.8); R.z = u(rng, -1.2, 1.6);
  if (!inFrame(cam, R)) return null;
  const e = cam.eye, ux0 = R.x - e[0], uz0 = R.z - e[2], dR = Math.hypot(ux0, uz0), ux = ux0 / dR, uz = uz0 / dR;
  const unit = halfW(R, ux, uz) / dR;
  const at = (o, along, k, sgn) => {
    const dP = dR + along, lat = sgn * k * unit * dP;
    o.x = R.x + ux * along - uz * lat; o.z = R.z + uz * along + ux * lat;
  };
  let ci = 1;
  const Q = peeker(rng, rng.pick(['block', 'cone', 'cyl', 'ball']), cols[ci++], R);
  const qAlong = footR(R) + footR(Q) + u(rng, flags.qNear ? 0.15 : 0.5, flags.qNear ? 0.6 : 1.3);
  at(Q, qAlong, u(rng, 0, HARD.qIn * 0.8), rng.sign());
  if (!inFrame(cam, Q)) return null;
  const objs = [R, Q], placed = [R, Q];
  const nA = multi ? flags.k : 1;
  for (let t = 1, prev = Q, prevAlong = qAlong; t < nA; t++) {
    const Q2 = peeker(rng, rng.pick(['block', 'cone', 'cyl', 'ball']), cols[ci++], prev);
    const along2 = prevAlong + footR(prev) + footR(Q2) + u(rng, 0.25, 0.9);
    at(Q2, along2, u(rng, 0, HARD.qIn * 0.8), rng.sign());
    if (!inFrame(cam, Q2) || !clearOf(Q2, placed, 0.1)) return null;
    objs.push(Q2); placed.push(Q2);
    prev = Q2; prevAlong = along2;
  }
  const nN = rng.int(1, 2), side0 = rng.sign();
  for (let k = 0; k < nN; k++) {
    const N = rng.raw() < 0.6 ? peeker(rng, rng.pick(['block', 'cone', 'cyl', 'ball']), cols[ci++], R) : newToy(rng, rng.pick(['block', 'ball', 'cyl', 'cone']), cols[ci++]);
    const sgn = k === 0 ? side0 : -side0;
    let ok = false;
    for (let a = 0; a < 30 && !ok; a++) {
      const along = footR(R) + footR(N) + u(rng, 0.12, flags.qNear ? 1.4 : Math.max(0.2, qAlong - footR(R) - footR(N) - 0.1));
      at(N, along, u(rng, HARD.sideOut + 0.05, HARD.sideHi), sgn);
      const kk = axisK(rd, R, N);
      ok = kk.kIn < 1 && clearOf(N, placed, 0.12) && inFrame(cam, N);
    }
    if (!ok) return null;
    objs.push(N); placed.push(N);
  }
  if (flags.onR) {
    const T = newToy(rng, rng.pick(['ball', 'block']), cols[ci++]);
    T.s = T.kind === 'ball' ? u(rng, 0.2, Math.min(0.3, R.s)) : u(rng, 0.18, Math.min(0.26, R.s * 0.8));
    T.x = R.x; T.z = R.z; T.y = topOf(R);
    objs.push(T);
  }
  if (flags.front) {
    const F = newToy(rng, rng.pick(['ball', 'block', 'cyl']), cols[ci++]);
    if (F.kind === 'cyl') F.h = Math.min(F.h, topOf(R) * 0.55);
    F.s = Math.min(F.s, 0.3);
    at(F, -(footR(R) + footR(F) + u(rng, 0.2, 0.9)), u(rng, 0, HARD.qIn * 0.8), rng.sign());
    if (!inFrame(cam, F) || !clearOf(F, placed, 0.12)) return null;
    objs.push(F); placed.push(F);
  }
  const okLine = (o) => axisK(rd, R, o).k >= HARD.sideOut + 0.6;
  const nPairs = rng.int(1, 2);
  for (let k = 0; k < nPairs; k++) {
    const X = newToy(rng, rng.pick(['cyl', 'block']), cols[ci++ % 9 || 1]);
    if (X.kind === 'cyl') { X.s = u(rng, 0.28, 0.4); X.h = u(rng, 0.55, 0.85); } else X.s = u(rng, 0.28, 0.38);
    if (!spotRandom(rng, cam, X, placed, okLine)) return null;
    const Y = peeker(rng, rng.pick(['block', 'cone', 'cyl', 'ball']), cols[ci++ % 9 || 1], X);
    const vx = X.x - e[0], vz = X.z - e[2], vl = Math.hypot(vx, vz), wx = vx / vl, wz = vz / vl;
    const along = footR(X) + footR(Y) + u(rng, 0.2, 1.4), lat = along * Math.tan(u(rng, -5, 5) * D2R);
    Y.x = X.x + wx * along - wz * lat; Y.z = X.z + wz * along + wx * lat;
    if (!clearOf(Y, placed.concat([X])) || !inFrame(cam, Y) || !okLine(Y)) return null;
    objs.push(X, Y); placed.push(X, Y);
  }
  rd.objs = objs;
  if (multi) rd.answers = Array.from({ length: nA }, (_, i) => i + 1);
  finalize(rd);
  if (!rd.objs.every((o) => inFrame(cam, o))) return null;
  if (!behindOk(rd)) return null;
  const vis = visibleOk(rd, (id) => (id === 0 ? 0.55 : 0.28));
  if (!vis) return null;
  let most = -1, mh = -1;
  vis.forEach((st, id) => { if (id !== 0 && 1 - st.frac > mh) { mh = 1 - st.frac; most = id; } });
  const ansSet = new Set(answersOf(rd));
  if (ansSet.has(most) !== flags.qMost) return null;
  const back = rd.objs.map((o, i) => ({ o, i })).filter((x) => x.i !== 0 && x.o.y === 0 && sight(rd, R, x.o).along > 0);
  const nearest = back.sort((a, b) => pixDist(cam, R, a.o) - pixDist(cam, R, b.o))[0];
  if (ansSet.has(nearest.i) !== flags.qNear) return null;
  return rd;
}
const answersOf = (rd) => (Array.isArray(rd.answers) ? rd.answers : [rd.answer]);
function answersOk(rd) {
  const ans = answersOf(rd);
  if (!ans.every((a) => Number.isInteger(a) && a >= 0 && a < rd.objs.length && a !== rd.ref) || new Set(ans).size !== ans.length) return false;
  if (rd.answers) return ans.length >= 2 && ans.length <= 3 && ans.every((a, i) => i === 0 || a > ans[i - 1]) && rd.answer === ans[0];
  return true;
}
function behindOk(rd) {
  const R = rd.objs[rd.ref];
  if (!R || !answersOk(rd) || R.y !== 0 || !['cyl', 'block'].includes(R.kind)) return false;
  const ans = answersOf(rd);
  if (ans.some((a) => rd.objs[a].y !== 0)) return false;
  if (R.col >= N_NAMED || rd.objs.filter((o) => o.col === R.col).length !== 1) return false;
  for (const a of ans) {
    const Q = rd.objs[a], kq = axisK(rd, R, Q);
    if (!(kq.k <= HARD.qIn && kq.along > footR(R) + footR(Q))) return false;
  }
  let nearLine = 0;
  for (let i = 0; i < rd.objs.length; i++) {
    if (i === rd.ref || ans.includes(i)) continue;
    const o = rd.objs[i];
    if (o.y > 0) { if (Math.abs(o.y - topOf(R)) > 2e-3 || tdist(o, R) > 1e-6) return false; continue; }
    const kk = axisK(rd, R, o);
    if (kk.along < 0 && kk.k <= HARD.qIn) continue;
    if (kk.k < HARD.sideOut) return false;
    if (kk.along > 0 && kk.k <= HARD.sideHi && kk.kIn < 1) nearLine++;
  }
  if (nearLine < 1) return false;
  for (let i = 0; i < rd.objs.length; i++) for (let j = i + 1; j < rd.objs.length; j++) {
    const a = rd.objs[i], b = rd.objs[j];
    if (a.y === 0 && b.y === 0 && tdist(a, b) < footR(a) + footR(b) + 0.1) return false;
  }
  return true;
}

const cellOf = (v) => Math.round(v / SQ - 0.5);
const cellC = (i) => (i + 0.5) * SQ;
const offOf = (G, o) => [Math.abs(cellOf(o.x) - cellOf(G.x)), Math.abs(cellOf(o.z) - cellOf(G.z))].sort((a, b) => a - b);
function allowedVs(type, a, d) {
  const da = Math.hypot(a[0], a[1]), dd = Math.hypot(d[0], d[1]);
  if (type === 'closest') {
    if (dd < da * HARD.minRatio - 1e-9) return false;
    return dd >= da * HARD.domRatio - 1e-9 || (d[0] >= a[0] && d[1] >= a[1]);
  }
  if (dd * HARD.minRatio > da + 1e-9) return false;
  return dd * HARD.domRatio <= da + 1e-9 || (d[0] <= a[0] && d[1] <= a[1]);
}
const tightVs = (type, a, d) => {
  const da = Math.hypot(a[0], a[1]), dd = Math.hypot(d[0], d[1]);
  return type === 'closest' ? dd <= da * HARD.tightRatio + 1e-9 : dd * HARD.tightRatio >= da - 1e-9;
};
const ANS_CLOSE = [[0, 2], [1, 2], [2, 2], [1, 3]];
function tileAt(cam, G) {
  const g0 = cam.project(G.x, 0, G.z), gx = cam.project(G.x + 0.01, 0, G.z), gz = cam.project(G.x, 0, G.z + 0.01);
  const a = (gx.x - g0.x) / 0.01, b = (gz.x - g0.x) / 0.01, c = (gx.y - g0.y) / 0.01, d = (gz.y - g0.y) / 0.01, det = a * d - b * c;
  return (cell) => { const p = cam.project(cellC(cell.i), 0, cellC(cell.j)), dx = p.x - g0.x, dy = p.y - g0.y; return Math.hypot((d * dx - b * dy) / det, (-c * dx + a * dy) / det); };
}
function shortcutPicks(rd) {
  const cam = cameraFor(rd), G = rd.objs[rd.ref];
  const balls = rd.objs.map((o, i) => ({ o, i })).filter((e) => e.o.kind === 'ball');
  const g0 = cam.project(G.x, 0, G.z), gx = cam.project(G.x + 0.01, 0, G.z), gz = cam.project(G.x, 0, G.z + 0.01);
  const a = (gx.x - g0.x) / 0.01, b = (gz.x - g0.x) / 0.01, c = (gx.y - g0.y) / 0.01, d = (gz.y - g0.y) / 0.01, det = a * d - b * c;
  const tile = (o) => { const p = cam.project(o.x, 0, o.z), dx = p.x - g0.x, dy = p.y - g0.y; return Math.hypot((d * dx - b * dy) / det, (-c * dx + a * dy) / det); };
  const pick = (f, bs = balls) => { if (!bs.length) return -1; const srt = bs.slice().sort((p, q) => f(p.o) - f(q.o)); return (rd.type === 'closest' ? srt[0] : srt[srt.length - 1]).i; };
  const gj = cellOf(G.z), behind = (o) => gj - cellOf(o.z) > 0;
  const side = pick(tile, balls.filter((e) => (rd.type === 'closest' ? !behind(e.o) : behind(e.o))));
  const W = rd.objs[criticalOf(rd)], ans = answersOf(rd);
  const tileRank = 1 + balls.filter((e) => !ans.includes(e.i) && (rd.type === 'closest' ? tile(e.o) < tile(W) : tile(e.o) > tile(W))).length;
  return { pix: pick((o) => pixDist(cam, G, o)), tile: pick(tile), side, tileRank };
}
function shortcutSets(rd) {
  const cam = cameraFor(rd), G = rd.objs[rd.ref], k = answersOf(rd).length;
  const balls = rd.objs.map((o, i) => ({ o, i })).filter((e) => e.o.kind === 'ball');
  const tile = tileAt(cam, G), cellOfBall = (o) => ({ i: cellOf(o.x), j: cellOf(o.z) });
  const top = (f, bs) => bs.slice().sort((p, q) => (rd.type === 'closest' ? f(p.o) - f(q.o) : f(q.o) - f(p.o))).slice(0, k).map((e) => e.i).sort((a, b) => a - b).join(',');
  const gj = cellOf(G.z), behind = (o) => gj - cellOf(o.z) > 0;
  return {
    truth: answersOf(rd).slice().sort((a, b) => a - b).join(','),
    pix: top((o) => pixDist(cam, G, o), balls),
    tile: top((o) => tile(cellOfBall(o)), balls),
    side: top((o) => tile(cellOfBall(o)), balls.filter((e) => (rd.type === 'closest' ? !behind(e.o) : behind(e.o)))),
  };
}
const BETTER = 1.08;
const NB_RATIO = 1.2;
const NB_ROWS = 3;
const CLOSE_MAX = 4 + 1e-9;
const DIST_SHAPES = {
  closest: [[3, 1, 16], [3, 2, 13], [1, -3, 16], [2, -3, 16], [3, -1, 13], [3, -2, 13], [4, 0, 13]],
  farthest: [[2, 3, 10], [3, 2, 10], [2, 4, 10], [3, 3, 10], [3, 4, 10], [4, 3, 10], [4, 2, 10], [4, 4, 10], [5, 3, 10], [3, 5, 10]],
};
const SIDE_MISS = { shapes: ['1,-3', '2,-3'], strict: ['1,-3'], p: 0.85 };
const SIDE_MISS_FAR = { shapes: ['2,3', '3,4', '5,3', '3,5'], p: 0.85 };
const BEAT_W = [[1, 50], [2, 30], [3, 20]];
function drawShape(rng, type) {
  const L = DIST_SHAPES[type];
  let x = rng.uniform(0, L.reduce((t, e) => t + e[2], 0));
  for (const e of L) { x -= e[2]; if (x < 0) return [e[0], e[1]]; }
  return [L[L.length - 1][0], L[L.length - 1][1]];
}
const nearBackVs = (type, a, d, rowsBack) => {
  if (rowsBack < NB_ROWS || !allowedVs(type, a, d)) return false;
  const da = Math.hypot(a[0], a[1]), dd = Math.hypot(d[0], d[1]);
  return type === 'closest' ? dd <= da * NB_RATIO + 1e-9 : dd * NB_RATIO >= da - 1e-9;
};
function tryDist(rng, cam0, type, flags, bench = false) {
  const rd = { type, cam: cam0, objs: [], ref: 0, answer: 1 };
  const cam = cameraFor(rd);
  const named = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
  const cols = [named[0], ...rng.shuffle([...named.slice(1), 7, 8])];
  const G = newToy(rng, rng.pick(['block', 'cyl', 'cone']), cols[0]);
  if (G.kind === 'block') G.s = u(rng, 0.27, 0.32);
  const gi = rng.int(-3, 2), gj = rng.int(type === 'farthest' ? -1 : -3, 2);
  G.x = cellC(gi); G.z = cellC(gj);
  if (!inFrame(cam, G)) return null;
  const cells = [];
  for (let i = -4; i <= 3; i++) for (let j = -4; j <= 3; j++) {
    if (i === gi && j === gj) continue;
    const b = { kind: 'ball', x: cellC(i), z: cellC(j), y: 0, s: 0.32, h: 0 };
    if (!inFrame(cam, b) || tdist(b, G) < footR(G) + 0.32 + 0.1) continue;
    cells.push({ i, j, off: [Math.abs(i - gi), Math.abs(j - gj)].sort((a, b) => a - b) });
  }
  let A, chosen, okCells, tight, loose, nT, spare, extraAns = [];
  if (bench) {
    const nbOf = (a) => cells.filter((c) => c !== a && nearBackVs(type, a.off, c.off, gj - c.j));
    const ansCells = cells.filter((c) => Math.abs(c.i - gi) === flags.shape[0] && gj - c.j === flags.shape[1] && nbOf(c).length);
    if (!ansCells.length) return null;
    A = rng.pick(ansCells);
    const D = rng.pick(nbOf(A));
    okCells = cells.filter((c) => c !== A && c !== D && allowedVs(type, A.off, c.off));
    const dA = Math.hypot(A.off[0], A.off[1]);
    const better = cells.filter((c) => c !== A && c !== D && (type === 'closest' ? Math.hypot(c.off[0], c.off[1]) * BETTER <= dA : Math.hypot(c.off[0], c.off[1]) >= dA * BETTER));
    if (better.length < flags.k - 1) return null;
    extraAns = rng.shuffle(better).slice(0, flags.k - 1);
    const t = tileAt(cam, G), tA = t(A), beats = (c) => (type === 'closest' ? t(c) < tA : t(c) > tA);
    const fixed = [D];
    if (flags.sideMiss) {
      const strict = SIDE_MISS.strict.includes(flags.shape.join(','));
      const cand = okCells.filter((c) => (type === 'farthest' ? gj - c.j > 0 : strict ? gj - c.j < 0 : gj - c.j <= 0) && beats(c));
      if (!cand.length) return null;
      fixed.push(rng.pick(cand));
    }
    if (fixed.filter(beats).length < flags.minBeat) {
      const cand = okCells.filter((c) => !fixed.includes(c) && beats(c));
      if (fixed.filter(beats).length + cand.length < flags.minBeat) return null;
      while (fixed.filter(beats).length < flags.minBeat) { const c = rng.pick(cand.filter((x) => !fixed.includes(x))); fixed.push(c); }
    }
    okCells = okCells.filter((c) => !fixed.includes(c));
    tight = rng.shuffle(okCells.filter((c) => tightVs(type, A.off, c.off)));
    loose = rng.shuffle(okCells.filter((c) => !tightVs(type, A.off, c.off)));
    const nFixT = fixed.filter((c) => tightVs(type, A.off, c.off)).length;
    nT = Math.min(tight.length + nFixT, rng.int(HARD.minTight, 5));
    if (nT < HARD.minTight) return null;
    const nMore = Math.max(0, nT - nFixT);
    chosen = [A, ...extraAns, ...fixed, ...tight.slice(0, nMore)];
    spare = tight.slice(nMore);
  } else {
    let ansCells;
    if (type === 'closest') {
      const want = rng.pick(ANS_CLOSE);
      ansCells = cells.filter((c) => c.off[0] === want[0] && c.off[1] === want[1]);
    } else {
      ansCells = cells.filter((c) => Math.hypot(c.off[0], c.off[1]) >= 3.6);
    }
    if (!ansCells.length) return null;
    A = rng.pick(ansCells);
    okCells = cells.filter((c) => c !== A && allowedVs(type, A.off, c.off));
    tight = rng.shuffle(okCells.filter((c) => tightVs(type, A.off, c.off)));
    loose = rng.shuffle(okCells.filter((c) => !tightVs(type, A.off, c.off)));
    nT = Math.min(tight.length, rng.int(HARD.minTight, 5));
    if (nT < HARD.minTight) return null;
    chosen = [A, ...tight.slice(0, nT)];
    spare = tight.slice(nT);
  }
  const pool = rng.shuffle([...spare, ...loose]);
  for (const c of pool) { if (chosen.length >= NB) break; chosen.push(c); }
  if (chosen.length < NB) return null;
  const balls = chosen.map((c, k) => { const b = newToy(rng, 'ball', cols[1 + k]); b.s = u(rng, 0.24, 0.31); b.x = cellC(c.i); b.z = cellC(c.j); return b; });
  const placed = [G, ...balls];
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) if (tdist(placed[a], placed[b]) < footR(placed[a]) + footR(placed[b]) + 0.1) return null;
  const objs = [G, ...balls];
  const O = newToy(rng, rng.pick(['block', 'cyl', 'cone']), rng.pick(cols.slice(1)));
  if (O.kind === 'block') O.s = u(rng, 0.25, 0.3);
  const free = rng.shuffle(cells.filter((c) => !chosen.includes(c)));
  let put = false;
  for (const c of free) {
    O.x = cellC(c.i); O.z = cellC(c.j);
    if (placed.every((p) => tdist(p, O) >= footR(p) + footR(O) + 0.1)) { put = true; break; }
  }
  if (!put) return null;
  objs.push(O);
  rd.objs = objs;
  if (bench) rd.answers = Array.from({ length: flags.k }, (_, i) => i + 1);
  finalize(rd);
  if (!rd.objs.every((o) => inFrame(cam, o))) return null;
  if (!distOk(rd)) return null;
  if (bench) {
    rd.hard = DIST_TAG;
    if (!distHardOk(rd)) return null;
    const sp = shortcutPicks(rd), ss = shortcutSets(rd);
    if (flags.sideMiss && ss.side === ss.truth) return null;
    if (sp.tileRank < flags.minBeat + 1) return null;
  }
  else { const sp = shortcutPicks(rd); if ((sp.pix === 1) !== flags.pixHit || (sp.tile === 1) !== flags.tileHit) return null; }
  if (!visibleOk(rd, () => 0.6)) return null;
  return rd;
}
function criticalOf(rd) {
  const ans = answersOf(rd);
  if (ans.length === 1) return ans[0];
  const G = rd.objs[rd.ref], d = (i) => { const o = offOf(G, rd.objs[i]); return Math.hypot(o[0], o[1]); };
  return ans.reduce((w, i) => ((rd.type === 'closest' ? d(i) > d(w) : d(i) < d(w)) ? i : w));
}
function distOk(rd) {
  const G = rd.objs[rd.ref];
  if (!G || !answersOk(rd)) return false;
  const ans = answersOf(rd), A = rd.objs[criticalOf(rd)];
  if (!A || ans.some((i) => rd.objs[i].kind !== 'ball') || G.kind === 'ball' || G.col >= N_NAMED || rd.objs.filter((o) => o.col === G.col).length !== 1) return false;
  const balls = rd.objs.map((o, i) => ({ o, i })).filter((e) => e.o.kind === 'ball');
  if (balls.length !== NB || !rd.objs.every((o) => o.y === 0)) return false;
  const seen = new Set();
  for (const o of rd.objs) {
    if (Math.abs(o.x - cellC(cellOf(o.x))) > 2e-3 || Math.abs(o.z - cellC(cellOf(o.z))) > 2e-3) return false;
    const k = `${cellOf(o.x)},${cellOf(o.z)}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  const a = offOf(G, A);
  let nTight = 0;
  const da = Math.hypot(a[0], a[1]);
  for (const { o, i } of balls) {
    if (ans.includes(i)) {
      if (i !== criticalOf(rd)) { const dd = Math.hypot(...offOf(G, o)); if (!(rd.type === 'closest' ? dd * BETTER <= da + 1e-9 : dd >= da * BETTER - 1e-9)) return false; }
      continue;
    }
    const d = offOf(G, o);
    if (!allowedVs(rd.type, a, d)) return false;
    if (tightVs(rd.type, a, d)) nTight++;
  }
  if (nTight < HARD.minTight) return false;
  for (let i = 0; i < rd.objs.length; i++) for (let j = i + 1; j < rd.objs.length; j++) {
    const p = rd.objs[i], q = rd.objs[j];
    if (tdist(p, q) < footR(p) + footR(q) + 0.1) return false;
  }
  return true;
}
const DIST_TAG = 'distance';
function distHardOk(rd) {
  const G = rd.objs[rd.ref], w = criticalOf(rd), A = rd.objs[w], ans = answersOf(rd);
  if (ans.length === 1) { const sp = shortcutPicks(rd); if (sp.pix === rd.answer || sp.tile === rd.answer) return false; }
  else { const ss = shortcutSets(rd); if (ss.pix === ss.truth || ss.tile === ss.truth) return false; }
  const gj = cellOf(G.z);
  if (rd.type === 'closest' && Math.hypot(...offOf(G, A)) > CLOSE_MAX) return false;
  const a = offOf(G, A);
  return rd.objs.some((o, i) => !ans.includes(i) && o.kind === 'ball' && nearBackVs(rd.type, a, offOf(G, o), gj - cellOf(o.z)));
}

function makeInstance(rng, type, bench = false) {
  const flags = { qMost: rng.raw() < 0.3, qNear: rng.raw() < 0.2, onR: rng.raw() < 0.85, front: rng.raw() < 0.8,
    pixHit: rng.raw() < 0.2, tileHit: rng.raw() < 0.2 };
  if (bench) flags.k = rng.int(2, 3);
  if (bench && type !== 'behind') {
    flags.shape = drawShape(rng, type);
    const sk = flags.shape.join(',');
    flags.sideMiss = type === 'closest' ? SIDE_MISS.shapes.includes(sk) && rng.raw() < SIDE_MISS.p
      : SIDE_MISS_FAR.shapes.includes(sk) && rng.raw() < SIDE_MISS_FAR.p;
    let x = rng.uniform(0, 100);
    flags.minBeat = Math.min(BEAT_W.find((e) => (x -= e[1]) < 0)?.[0] ?? 1, type === 'closest' && sk === '3,2' ? 2 : 3);
  }
  for (let a = 0; a < 1500; a++) {
    const cam0 = { az: r3(u(rng, -16, 16)), h: r3(u(rng, type === 'behind' ? 4.0 : 3.6, type === 'behind' ? 4.7 : 4.2)) };
    if (bench && a === 600) flags.k = 2;
    const rd0 = type === 'behind' ? tryBehind(rng, cam0, flags, bench) : tryDist(rng, cam0, type, flags, bench);
    if (!rd0) continue;
    const order = rng.shuffle(rd0.objs.map((_, i) => i));
    const rd = { ...rd0, objs: order.map((i) => rd0.objs[i]), ref: order.indexOf(rd0.ref), answer: order.indexOf(rd0.answer) };
    if (rd0.answers) { rd.answers = rd0.answers.map((i) => order.indexOf(i)).sort((x, y) => x - y); rd.answer = rd.answers[0]; }
    return rd;
  }
  throw new Error('behind_relation_tap: sampler exhausted');
}

const BOARD_USES = new Set(['wood', 'floor', 'stone', 'fabric']);
const STYLE_SKIP = new Set(['stone_tiles_02', 'interior_tiles', 'hexagonal_concrete_paving', 'square_floor_patern_01', 'floor_pattern_02',
  'pavement_02', 'rough_plasterbrick_05', 'cobblestone_floor_08', 'curly_teddy_checkered', 'gingham_check', 'quatrefoil_jacquard_fabric', 'dry_riverbed_rock']);
const TEX_WORLD = { wood: 0.9, floor: 1.1, stone: 0.4, fabric: 0.35 };
const PATTERNS = ['checker', 'tiles'].flatMap((mode) => [0.6, 0.7, 0.8, 0.9, 1.0].map((sq) => ({ id: `${mode}-${sq}`, mode, sq })));
const FIN_KEYS = ['gloss', 'satin', 'matte', 'metallic', 'glaze'];
export async function styleLook(style) {
  const boards = style.pool('tex', (t) => BOARD_USES.has(t.use) && !STYLE_SKIP.has(t.id));
  const walls = style.pool('tex', (t) => t.use === 'wall');
  const hdris = style.pool('hdri');
  const [bi, wi, hi] = style.primaryCombo('board-wall-hdri', [boards.length, walls.length, hdris.length]);
  const bA = boards[bi], wl = walls[wi], hd = hdris[hi], rnd = style.rand;
  style.note(`tex:${bA.id}`); style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const pats = splitOf(style, 'behind_relation_tap|board-pattern', PATTERNS, (p) => p.id, 3);
  const okPats = bA.use === 'wood' || bA.use === 'fabric' ? pats.filter((p) => p.mode === 'checker') : pats;
  const pat = (okPats.length ? okPats : pats)[Math.floor(rnd() * (okPats.length || pats.length))], mode = pat.mode;
  style.note(`behind_relation_tap|board-pattern:${pat.id}`);
  const twoMat = mode === 'checker' && rnd() < 0.5;
  const bB = twoMat ? style.pick('tex', (t) => t.use === bA.use && t.id !== bA.id && !STYLE_SKIP.has(t.id)) : null;
  const sq = pat.sq;
  const fin = pickOf(style, 'behind_relation_tap|finish', FIN_KEYS);
  const grainR = rnd(), lA = rnd(), lB = rnd(), lightJ = rnd(), wallJ = rnd(), salt = 1 + Math.floor(rnd() * 997);
  const toyTexItem = (fin === 'satin' || fin === 'matte') && grainR < 0.6
    ? style.pick('tex', (t) => t.use === (fin === 'matte' && grainR < 0.25 ? 'fabric' : 'wood') && !STYLE_SKIP.has(t.id)) : null;
  const [TA, TB, TW, sky, TT] = await loadAll([bA, bB, wl, hd, toyTexItem]);
  const LA = 0.2 + 0.22 * lA;
  const faceA = faceColour(TA.mean, LA);
  const faceB = mode === 'checker' ? faceColour((TB || TA).mean, LA * (0.35 + 0.25 * lB)) : null;
  const tw = TEX_WORLD[bA.use] || 1;
  let floor = gridFloor({ sq, mode, A: TA, B: TB || TA, faceA, faceB, cvA: 0.14, cvB: 0.14, seamHW: mode === 'tiles' ? 0.016 : 0.01,
    seamK: mode === 'tiles' ? 0.6 : 0.45, texWorld: tw, salt });
  let light = S3.hdriLight(hd, LIGHT, { albedo: faceA, total: 1.4, jitter: lightJ });
  const fix = litFix(faceA, light, LIGHT.dir[1] / Math.hypot(...LIGHT.dir));
  if (fix.some((v) => Math.abs(v - 1) > 1e-6)) {
    const base = floor;
    floor = (x, z, fp, out) => { base(x, z, fp, out); out[0] *= fix[0]; out[1] *= fix[1]; out[2] *= fix[2]; };
  }
  const wface = faceColour(TW.mean, Math.min(0.62, Math.max(0.3, 0.25 + 0.8 * S3.lum(TW.mean))) * (0.92 + 0.16 * wallJ), { warm: [18, 50, 0.3], otherSat: 0.1 });
  const wall = S3.texWall({ tex: TW, face: wface, cv: 0.25, texWorld: 1.4, skirtH: 0.32, skirt: wface.map((v) => v * 0.5) });
  const F = FINISHES[fin];
  const mats = COLORS.map(([, hex]) => paintMat(lin(hex), F, TT, { cv: TT && toyTexItem.use === 'fabric' ? 0.14 : 0.1, texWorld: 0.5 }));
  style.note(`board:${mode}/${sq}${bB ? '/' + bB.id : ''}`); style.note(`toys:${fin}${toyTexItem ? '/' + toyTexItem.id : ''}`);
  return {
    mats, light,
    env: { floorY: 0, wallZ: WALL_Z, floor, wall, sky: S3.skyFn(sky, 0.5 * S3.lum(light.sky) / 0.385) },
    ids: { board: bA.id, boardB: bB && bB.id, mode, sq, wall: wl.id, hdri: hd.id, finish: fin, toyTex: toyTexItem && toyTexItem.id },
  };
}
function styledScene(rd, look) {
  return makeScene({ cam: cameraFor(rd), shapes: shapesFor(rd), mats: look.mats, env: rd.mat ? matEnv(look.env, rd.mat) : look.env, light: look.light });
}

export function semanticKey(m) {
  const rd = m.scene, q = (v) => Math.round(v / 0.8);
  const ans = answersOf(rd);
  const toy = (o, i) => `${o.kind}:${o.col}:${o.y > 0 ? 'on' : 'fl'}:${q(o.x)},${q(o.z)}${i === rd.ref ? ':R' : ''}${ans.includes(i) ? ':A' : ''}`;
  return `behind_relation_tap|${rd.type}|${rd.objs.map(toy).sort().join(';')}${rd.mat ? matSemantic(rd) : ''}`;
}

export function gate(m) {
  if (!m || m.task !== 'behind_relation_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if ('rounds' in m || !m.scene || !TYPES.includes(m.scene.type)) return false;
  {
    const rd0 = m.scene;
    const rd = { ...rd0, objs: rd0.objs.map((o) => ({ ...o })) };
    if (!Number.isInteger(rd.ref) || !Number.isInteger(rd.answer)) return false;
    if ('answers' in rd && (rd.mat || !answersOk(rd) || (rd.type !== 'behind' && rd.hard !== DIST_TAG))) return false;
    if (rd.mat) { if (rd.type !== 'behind' || !matOk(rd, MAT_DEPS) || !matBaseOk(rd, MAT_DEPS)) return false; }
    else if (rd.type === 'behind' ? !behindOk(rd) : !distOk(rd)) return false;
    if ('hard' in rd && (rd.hard !== DIST_TAG || rd.type === 'behind' || rd.mat)) return false;
    if (rd.hard === DIST_TAG && !distHardOk(rd)) return false;
    const cam = cameraFor(rd);
    if (!rd.objs.every((o) => inFrame(cam, o))) return false;
    const sc = sceneFor(rd);
    for (let id = 0; id < rd.objs.length; id++) {
      const st = objectStats(sc, id, 2), pt = rd.objs[id].pt;
      const need = rd.mat ? matVisNeed(rd, id) : rd.type === 'behind' ? (id === rd.ref ? 0.55 : 0.28) : 0.6;
      if (st.off > 0 || st.frac < need || st.vis * 4 < 230) return false;
      if (!Array.isArray(pt) || pickId(sc, pt[0], pt[1]) !== id) return false;
    }
  }
  return true;
}

const MAT_DEPS = { cameraFor, axisK, footR, topOf, inFrame, visibleOk, finalize, sceneFor, pickId, BOARD };
export function matAudit(m) { return { truth: truthAfter(m.scene, MAT_DEPS), picks: matHeuristics(m.scene, MAT_DEPS), ok: matOk(m.scene, MAT_DEPS) }; }

function promptFor(rd) {
  const R = rd.objs[rd.ref], name = `${COLORS[R.col][0]} ${NOUN[R.kind]}`;
  if (rd.mat) return matPrompt(rd, name);
  if (rd.answers) {
    const n = rd.answers.length, sub = 'Tap a toy again to deselect it';
    if (rd.type === 'behind') return { main: `Tap the ${n} toys directly behind the ${name}`, sub: `As seen from where you are · ${sub.toLowerCase()}` };
    return { main: `Tap the ${n} balls ${rd.type === 'closest' ? 'closest to' : 'farthest from'} the ${name}`, sub };
  }
  if (rd.type === 'behind') return { main: `Click what is directly behind the ${name}`, sub: 'As seen from where you are' };
  const sub = rd.hard ? undefined : 'Distance on the table, not on screen';
  if (rd.type === 'closest') return { main: `Click the ball closest to the ${name}`, sub };
  return { main: `Click the ball farthest from the ${name}`, sub };
}

export default {
  meta: {
    name: 'behind_relation_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'click a toy to select it, click it again to deselect it; Verify scores the exact set (training data and the cue=mat variant: a click replaces the single choice)' }],
    promptHuman: 'Tap the 2-3 toys the card asks for, all of them: the toys directly behind the named toy (on its line of sight), or the balls closest to / farthest from the named toy (real distance on the board)',
  },

  generate(rng, level, index, knobs) {
    if (knobs?.cue === 'mat') return { task: 'behind_relation_tap', board: { ...BOARD }, scene: makeMatInstance(rng, MAT_DEPS) };
    let type = rng.pick(TYPES);
    if (!knobs?.ext && Number.isInteger(rng.raw.state0)) type = TYPES[((rng.raw.state0 ^ hashStr(`behind_relation_tap|L${level}`)) >>> 0) % 3];
    return { task: 'behind_relation_tap', board: { ...BOARD }, scene: makeInstance(rng, type, !knobs?.ext) };
  },

  init() { return { picks: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = pickNear(sceneFor(m.scene), a.x, a.y, 10);
    if (id < 0) return { ok: false, reason: 'no-toy' };
    if (!m.scene.answers) { s.picks = [id]; return { ok: true }; }
    const at = s.picks.indexOf(id);
    if (at >= 0) { s.picks.splice(at, 1); return { ok: true, cleared: true }; }
    s.picks.push(id);
    return { ok: true };
  },

  verify(s, m) {
    const ans = answersOf(m.scene);
    const hit = s.picks.filter((i) => ans.includes(i)).length, wrong = s.picks.length - hit;
    const success = hit === ans.length && wrong === 0;
    return { success, partial: Math.max(0, hit - wrong) / ans.length, error: success ? 0 : 1, detail: { answered: s.picks.length, hit, wrong, correct: success } };
  },

  oracle(m) { return answersOf(m.scene).map((i) => { const o = m.scene.objs[i]; return { op: 'click', x: o.pt[0], y: o.pt[1] }; }); },

  randomPolicy(m, rnd) {
    const ids = m.scene.objs.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, answersOf(m.scene).length).map((i) => { const o = m.scene.objs[i]; return { op: 'click', x: o.pt[0], y: o.pt[1] }; });
  },

  async mount(env) {
    env.assets.brt = { img: null, key: '', ring: null, ringKey: '' };
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const p = promptFor(env.manifest.scene);
    drawPromptText(g, r, p.main, p.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.brt || (env.assets.brt = {});
    const look = env.style ? env.assets.look : null;
    const q = contextScale(g), key = look ? `${q}|${env.style.key}` : `${q}`;
    if (A.key !== key) { A.img = render(look ? styledScene(m.scene, look) : sceneFor(m.scene), q); A.canvas = toCanvas(A.img); A.key = key; A.rings = new Map(); }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    if (!A.rings) A.rings = new Map();
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
    return n ? `${n} selected` : 'Click a toy';
  },
};
