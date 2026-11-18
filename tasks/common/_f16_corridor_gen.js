import * as W from './_f16_corridor_world.js';
import * as RD from './_f16_corridor_read.js';

export const NAME = 'f16_corridor_door';
export const G = Object.freeze({
  maxN: 16,
  doorFrames: 2,
  seeDecor: 1,
  seeMirror: 1,
  kinds: 3,
  windowP: 0.5,
  tShare: 0.5,
});
const r3 = (v) => Math.round(v * 1000) / 1000;

export function sideRooms(m) {
  const onP = new Set(m.path.map((p) => p.join(',')));
  return m.floors.filter((f) => !onP.has(f.join(','))).map((s) => ({ s, i: m.path.findIndex((p) => Math.abs(p[0] - s[0]) + Math.abs(p[1] - s[1]) === 1) }));
}
export function routeOptions(mz, opt) {
  const n = mz.path.length - 1, out = [];
  const P = mz.path, open = (e) => e >= 1 && W.isFloor(mz, P[e][0] + W.DIRS[W.dirBetween(P[e + 1], P[e])][0], P[e][1] + W.DIRS[W.dirBetween(P[e + 1], P[e])][1]);
  const e0 = [opt.i - 2, opt.i - 3].find(open);
  if (e0 === undefined) return out;
  if (n - opt.i >= 2 && n - opt.i <= 3) out.push({ j: n, room: null, e: e0 });
  return out;
}

export function faceSeries(TL, f, field = 'nd') { const id = W.fid(f); return TL.map((x) => x.faces.get(id)?.[field] || 0); }
export function longestWindow(TL, ser, min = RD.SEE_MIN) {
  let best = 0, run = 0, at = null, cur = null;
  for (let k = 0; k < TL.length; k++) {
    if (ser[k] >= min && !TL[k].sn.turning) { if (!run) cur = TL[k].tau; run += W.DT; if (run > best) { best = run; at = [cur, TL[k].tau]; } } else run = 0;
  }
  return { len: r3(best), at };
}
const total = (TL, ser, min = RD.SEE_MIN) => r3(TL.reduce((s, x, k) => s + (ser[k] >= min && !x.sn.turning ? W.DT : 0), 0));
function seen2Series(TL, via, face) { const k2 = `${via}|${W.fid(face)}`; return TL.map((x) => x.seen2.get(k2)?.nd || 0); }

export function doorProblem(m, TL) {
  const kU = m.kU, n = TL.length, nd = faceSeries(TL, m.door);
  if (TL.some((x, k) => nd[k] > 0 && (k < kU || k === 0 || k === n - 1))) return 'hidden';
  const w = longestWindow(TL, nd);
  if (w.len < G.doorFrames - 1e-9) return 'window';
  for (let k = 0; k < n; k++) if (nd[k] >= RD.SEE_MIN && !TL[k].sn.turning && W.frameCandidates(m, TL[k].sn, m.door).length < 2) return 'unique-frame';
  const tw = faceSeries(TL, m.twin.face);
  if (total(TL, tw) < G.seeDecor - 1e-9) return 'twin-unseen';
  return '';
}
export function frameLooks(m) {
  const out = []; let t = 0, prev = null;
  for (let k = 0; k < m.frames.length; k++) {
    const f = m.frames[k];
    if (prev) t += Math.max(0.5, Math.abs(f.c - prev.c) + Math.abs(f.r - prev.r));
    out.push({ t, obs: RD.observe(m, k) }); prev = f;
  }
  return out;
}
export function twinShare(m) {
  const Tm = W.twinMap(m.twin.Z[0], m.twin.Q[0]);
  let amb = 0, tot = 0;
  for (let k = 0; k < m.frames.length; k++) {
    const sn = W.snap(W.poseAt(m, k)); if (sn.turning) continue; tot++;
    const q = Tm({ c: sn.c, r: sn.r, h: sn.h });
    if (W.isFloor(m, q.c, q.r) && W.signature(m, q.c, q.r, q.h) === W.signature(m, sn.c, sn.r, sn.h)) amb++;
  }
  return tot ? amb / tot : 1;
}

const PIC_N = 4;
function placeDecor(rng, m, TL) {
  const faces = W.wallFaces(m), used = new Set();
  const across = { ...m.door, dir: (m.door.dir + 2) % 4 }, twin = m.twin.face;
  const ban = [m.door, across, twin, { ...twin, dir: (twin.dir + 2) % 4 }];
  for (const f of ban) used.add(W.fid(f));
  const seenTot = (f, field) => total(TL, faceSeries(TL, f, field));
    const free = (f) => !used.has(W.fid(f));
  const take = (f) => used.add(W.fid(f));
  const decor = [];
  const tc = rng.raw() < 0.5 ? 'orange' : 'maroon';
  decor.push({ kind: 'door', ...twin, color: tc, role: 'twin' });
  const oc = tc === 'orange' ? 'maroon' : 'orange';
  const dCand = rng.shuffle(faces.filter((f) => free(f) && seenTot(f, 'nd') >= G.seeDecor));
  if (!dCand.length) return null;
  decor.push({ kind: 'door', ...dCand[0], color: oc, role: 'other' }); take(dCand[0]);
  const pCand = rng.shuffle(faces.filter((f) => free(f) && seenTot(f, 'nq') >= G.seeDecor));
  if (!pCand.length) return null;
  decor.push({ kind: 'poster', ...pCand[0], style: rng.int(0, 2) }); take(pCand[0]);
  const mCand = rng.shuffle(faces.filter((f) => free(f) && seenTot(f, 'n') >= 1.0 && !(f.col === m.door.col && f.row === m.door.row)));
  for (const f of mCand.slice(0, 14)) {
    const mm = { ...m, decor: [...decor, { kind: 'mirror', ...f }] };
    if (mirrorShows(mm, f, TL) >= G.seeMirror) { decor.push({ kind: 'mirror', ...f }); take(f); break; }
  }
  const nd = faceSeries(TL, m.door), dT = TL.filter((x, k) => nd[k] > 0).map((x) => x.tau);
  const near = (tau) => dT.length && tau >= dT[0] - 1 && tau <= dT[dT.length - 1] + 1;
  const bnd = rng.raw() < G.windowP ? rng.shuffle(faces.filter((f) => free(f) && !isInGridNb(f) && seenTot(f, 'n') >= 1.0)) : [];
  outer: for (const f of bnd.slice(0, 10)) for (const k of rng.shuffle([-1, 0, 1])) {
    const w = { kind: 'window', ...f, annexK: k };
    const mm = { ...m, decor: [...decor, w] }, ws = windowShows(mm, w, TL);
    if (ws.s >= G.seeMirror && !ws.taus.some(near)) { decor.push(w); take(f); break outer; }
  }
  const pics = rng.shuffle(faces.filter(free)).slice(0, PIC_N);
  for (const f of pics) { decor.push({ kind: 'picture', ...f, style: rng.int(0, 3) }); take(f); }
  return decor;
}
const isInGridNb = (f) => { const c = f.col + W.DIRS[f.dir][0], r = f.row + W.DIRS[f.dir][1]; return c >= 0 && c < W.GW && r >= 0 && r < W.GH; };
function mirrorShows(m, f, TL) {
  const id = W.fid(f); let s = 0;
  for (const x of TL) {
    if (x.sn.turning || !(x.faces.get(id)?.n > 0)) continue;
    let c = 0;
    for (let i = 0; i < W.NC; i++) {
      const cf = W.castFull(m, x.p, (2 * (i + 0.5)) / W.NC - 1);
      if (cf.via === 'mirror' && W.sameFace({ col: cf.h2.c, row: cf.h2.r, dir: cf.h2.d }, m.door) && cf.h2.u > W.DOOR_U[0] && cf.h2.u < W.DOOR_U[1]) c++;
    }
    if (c >= RD.SEE_MIN) s += W.DT;
  }
  return r3(s);
}
function windowShows(m, w, TL) {
  const id = W.fid(w), af = W.annexDoorFace(w), taus = []; let s = 0;
  for (const x of TL) {
    if (x.sn.turning || !(x.faces.get(id)?.n > 0)) continue;
    let c = 0;
    for (let i = 0; i < W.NC; i++) {
      const cf = W.castFull(m, x.p, (2 * (i + 0.5)) / W.NC - 1);
      if (cf.via === 'window' && cf.h2.c === af.col && cf.h2.r === af.row && cf.h2.d === af.dir && cf.h2.u > W.DOOR_U[0] && cf.h2.u < W.DOOR_U[1]) c++;
    }
    if (c > 0) taus.push(x.tau);
    if (c >= RD.SEE_MIN) s += W.DT;
  }
  return { s: r3(s), taus };
}

export function deadReckon(m) {
  const F = m.frames;
  let b = { x: F[0].x, z: F[0].z, ang: F[0].ang };
  const votes = new Map();
  const step = (dx, dz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.05));
    for (let i = 0; i < n; i++) { const x = b.x + dx / n, z = b.z + dz / n; if (!W.isFloor(m, Math.floor(x), Math.floor(z))) return; b.x = x; b.z = z; }
  };
  for (let k = 1; k < F.length; k++) {
    const prev = F[k - 1], p = F[k];
    let da = W.angDiff(prev.ang, p.ang);
    const fx = Math.sin(prev.ang), fz = -Math.cos(prev.ang), rx = -fz, rz = fx;
    const dx = p.x - prev.x, dz = p.z - prev.z;
    const fw = dx * fx + dz * fz, lt = dx * rx + dz * rz;
    if (Math.abs(da) > 2.5) da = 0;
    const bfx = Math.sin(b.ang), bfz = -Math.cos(b.ang);
    step(bfx * fw - bfz * lt, bfz * fw + bfx * lt);
    b.ang += da;
    const o = RD.observe(m, k);
    if (!o.door) continue;
    const sn = W.snap({ x: b.x, z: b.z, ang: b.ang });
    const f = W.absFace(o.door, sn.c, sn.r, sn.h);
    const id = W.isWallFace(m, f) ? W.fid(f) : 'none';
    const e = votes.get(id) || { face: W.isWallFace(m, f) ? f : null, n: 0 }; e.n++; votes.set(id, e);
  }
  let best = null; for (const e of votes.values()) if (!best || e.n > best.n) best = e;
  return best ? best.face : null;
}

export function contract(m, opt = {}) {
  if (!m || m.task !== NAME || !Array.isArray(m.frames) || !m.door || !Array.isArray(m.decor)) return 'shape';
  const n = m.frames.length;
  if (n < 6 || n > G.maxN) return 'n';
  if (W.wallFaces(m).length < W.MIN_FACES || m.floors.length < W.MIN_FLOORS) return 'size';
  if (!W.isWallFace(m, m.door) || (m.doorType === 'side' && !W.isWallFace(m, { ...m.door, dir: (m.door.dir + 2) % 4 }))) return 'door-wall';
  if (m.doorType !== 'side' && m.doorType !== 'end') return 'door-type';
  if (!m.twin || !m.doorRoom || m.door.col !== m.doorRoom[0] || m.door.row !== m.doorRoom[1]) return 'rooms';
  for (const [s, f] of [[m.doorRoom, m.door], [m.twin.room, m.twin.face]]) {
    if (!W.isFloor(m, s[0], s[1]) || m.path.some((p) => p[0] === s[0] && p[1] === s[1])) return 'rooms';
    if (W.DIRS.filter(([dc, dr]) => W.isFloor(m, s[0] + dc, s[1] + dr)).length !== 1 || f.col !== s[0] || f.row !== s[1]) return 'rooms';
  }
  { const P = m.path, i = m.doorI; if (!(i >= 4 && i + 2 < P.length) || Math.abs(P[i][0] - m.doorRoom[0]) + Math.abs(P[i][1] - m.doorRoom[1]) !== 1 || m.door.dir !== W.dirBetween(P[i + 1], P[i])) return 'rooms'; }
  if (!W.sameFace(m.twin.face, (m.decor.find((d) => d.role === 'twin') || {}))) return 'twin';
  if (m.decor.some((d) => !W.isWallFace(m, d) || W.sameFace(d, m.door))) return 'decor-wall';
  if (!m.twin.Z || !m.twin.Q || twinShare(m) > G.tShare + 1e-9) return 'twin-share';
  for (let k = 1; k < n; k++) { const a = m.frames[k - 1], b = m.frames[k]; if (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) > 2) return 'jump'; if ((a.c !== b.c || a.r !== b.r) && a.h !== b.h) return 'jump-turn'; }
  const TL = opt.TL || W.timeline(m);
  const dp = doorProblem(m, TL); if (dp) return dp;
  const kinds = new Set(['twin']);
  for (const d of m.decor) {
    if (d.kind === 'door' && d.role === 'other' && total(TL, faceSeries(TL, d, 'nd')) >= G.seeDecor - 1e-9) kinds.add('door');
    if (d.kind === 'poster' && total(TL, faceSeries(TL, d, 'nq')) >= G.seeDecor - 1e-9) kinds.add('poster');
    if (d.kind === 'mirror' && total(TL, seen2Series(TL, 'mirror', m.door)) >= G.seeMirror - 1e-9) kinds.add('mirror');
    if (d.kind === 'window' && total(TL, seen2Series(TL, 'window', W.annexDoorFace(d))) >= G.seeMirror - 1e-9) kinds.add('window');
  }
  if (kinds.size < G.kinds) return 'kinds';
  if (!opt.skipReaders) {
    { const f = deadReckon(m); if (f && W.sameFace(f, m.door)) return 'dr-uturn'; }
    const wv = RD.watch(m, frameLooks(m));
    if (!wv.face || !W.sameFace(wv.face, m.door)) return 'frame-watch';
    const au = frameAudit(m, TL); if (au.singleFrame) return 'single-frame';
  }
  return '';
}
export function distractorKinds(m, TL) {
  const kinds = ['twin'];
  for (const d of m.decor) {
    if (d.kind === 'door' && d.role === 'other' && total(TL, faceSeries(TL, d, 'nd')) >= G.seeDecor - 1e-9) kinds.push(`door-${d.color}`);
    if (d.kind === 'poster' && total(TL, faceSeries(TL, d, 'nq')) >= G.seeDecor - 1e-9) kinds.push('poster');
    if (d.kind === 'mirror' && total(TL, seen2Series(TL, 'mirror', m.door)) >= G.seeMirror - 1e-9) kinds.push('mirror');
    if (d.kind === 'window' && total(TL, seen2Series(TL, 'window', W.annexDoorFace(d))) >= G.seeMirror - 1e-9) kinds.push(`window`);
  }
  return kinds;
}

export function frameAudit(m, TL = null) {
  TL = TL || W.timeline(m);
  const n = TL.length, nd = faceSeries(TL, m.door), cand = [];
  for (let k = 0; k < n; k++) if (nd[k] >= RD.SEE_MIN && !TL[k].sn.turning) cand.push(W.frameCandidates(m, TL[k].sn, m.door).length);
  const bad = cand.some((c) => c < 2) || nd[0] > 0 || nd[n - 1] > 0;
  return { singleFrame: bad, wallsPerDoorFrame: cand, n };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function tryBuild(rng, type = null) {
  const B = W.buildTwinMaze(rng, { type });
  if (!B) return fail('maze');
  const mz2 = B.mz, dopt = B.door, twin = B.twin;
  const ropts = routeOptions(mz2, { ...dopt, twinRoom: twin.room });
  if (!ropts.length) return fail('no-route');
  const plan = rng.pick(ropts);
  const fr = W.routeStations(mz2, plan, { i: dopt.i, dIn: dopt.dIn }, G.maxN);
  if (!fr) return fail('stations');
  if (fr.frames.length > G.maxN) return fail('long');
  const m = {
    task: NAME, grid: mz2.grid, start: mz2.start, path: mz2.path, floors: mz2.floors,
    door: { col: dopt.room[0], row: dopt.room[1], dir: dopt.dIn }, doorRoom: dopt.room, doorI: dopt.i, doorType: dopt.type,
    twin: { room: twin.room, face: twin.face, wayOut: twin.wayOut, Q: twin.Q, Z: B.Z }, decor: [],
    frames: fr.frames, kU: fr.kU, plan: { ...plan, room: null },
  };
  if (twinShare(m) > G.tShare) return fail('twin-share');
  const TL = W.timeline(m);
  const dp = doorProblem(m, TL); if (dp) return fail(dp);
  const decor = placeDecor(rng, m, TL);
  if (!decor) return fail('decor');
  m.decor = decor;
  const TL2 = W.timeline(m);
  const c = contract(m, { TL: TL2 }); if (c) return fail(c);
  _stats.ok = (_stats.ok || 0) + 1;
  return m;
}
