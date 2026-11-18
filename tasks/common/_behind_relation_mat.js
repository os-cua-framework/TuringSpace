import { fbm, hash2 } from './_largest_cube_color_rt.js';

const SQ = 0.8;
const D2R = Math.PI / 180;
export const MAT = Object.freeze({
  qIn: 0.2,
  sideOut: 1.6,
  qInCam: 0.15,
  behindMin: 0.2,
  onLineK: 0.5,
  maxG: 3,
  dirCone: 45,
  visR: 0.7, visA: 0.75, vis: 0.5,
  azMax: 19.5,
  yawMax: 18,
  tries: 3000,
});
const cellC = (i) => (i + 0.5) * SQ;
const cellOf = (v) => Math.round(v / SQ - 0.5);
const r3 = (v) => Math.round(v * 1000) / 1000;
const NAMED = [0, 1, 3, 4, 5, 6];
const OTHER = [0, 1, 3, 4, 5, 6, 7, 8];
const FELT = [0.026, 0.17, 0.045];

const PAD = 0.1;
export const matRect = (M) => ({ x0: M.i0 * SQ - PAD, x1: (M.i1 + 1) * SQ + PAD, z0: M.j0 * SQ, z1: (M.j1 + 1) * SQ + PAD });
export const matShift = (M) => M.s * M.n * SQ;
export function onMat(o, M) {
  const i = cellOf(o.x), j = cellOf(o.z);
  return o.y === 0 && i >= M.i0 && i <= M.i1 && j >= M.j0 && j <= M.j1;
}
export function matEnv(env, M) {
  const { x0, x1, z0, z1 } = matRect(M), base = env.floor;
  const W = new Float64Array(3);
  const floor = (x, z, fp, out) => {
    const dIn = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    const w = Math.max(fp, 1e-4);
    const cov = Math.max(0, Math.min(1, 0.5 + dIn / w));
    if (cov < 1) {
      base(x, z, fp, W);
      const e = -dIn, k = (x > x1 || z < z0) ? 0.05 : 0.03;
      if (e > 0 && e < k) { const t = 0.5 + 0.5 * (e / k); W[0] *= t; W[1] *= t; W[2] *= t; }
    }
    if (cov > 0) {
      const fuzz = 0.86 + 0.24 * fbm(x * 11 + 3.1, z * 11 - 1.7, 3, fp * 11) + 0.04 * (hash2(Math.floor(x * 90), Math.floor(z * 90)) - 0.5);
      let t = fuzz;
      if (dIn < 0.055) t *= 0.62;
      else {
        const sd = Math.abs(dIn - 0.085);
        if (sd < 0.009 + 0.5 * fp) t *= 1.35;
      }
      const fr = FELT[0] * t, fg = FELT[1] * t, fb = FELT[2] * t;
      if (cov >= 1) { out[0] = fr; out[1] = fg; out[2] = fb; return; }
      out[0] = W[0] + (fr - W[0]) * cov; out[1] = W[1] + (fg - W[1]) * cov; out[2] = W[2] + (fb - W[2]) * cov;
      return;
    }
    out[0] = W[0]; out[1] = W[1]; out[2] = W[2];
  };
  return { ...env, floor };
}

const shifted = (rd, pred, dx) => rd.objs.map((o, i) => (pred(o, i) ? { ...o, x: r3(o.x + dx) } : o));
function pickBehind(rd, objs, D) {
  const R = objs[rd.ref], cand = [];
  objs.forEach((o, i) => {
    if (i === rd.ref) return;
    const kk = D.axisK(rd, R, o);
    if (kk.along > MAT.behindMin) cand.push({ i, k: kk.k, along: kk.along });
  });
  if (!cand.length) return -1;
  const line = cand.filter((c) => c.k < MAT.onLineK).sort((a, b) => a.along - b.along);
  if (line.length) return line[0].i;
  return cand.sort((a, b) => a.k - b.k)[0].i;
}
export function truthAfter(rd, D, qIn = MAT.qIn) {
  const M = rd.mat, objs = shifted(rd, (o) => onMat(o, M), matShift(M)), R = objs[rd.ref];
  let ans = -1;
  for (let i = 0; i < objs.length; i++) {
    if (i === rd.ref) continue;
    const o = objs[i], kk = D.axisK(rd, R, o);
    if (kk.along <= MAT.behindMin) continue;
    if (kk.k <= qIn && kk.along > D.footR(R) + D.footR(o) && kk.along <= MAT.maxG * SQ + 0.25) { if (ans >= 0) return -1; ans = i; continue; }
    if (kk.k < MAT.sideOut) return -1;
  }
  return ans;
}
const centre = (cam, o, D) => cam.project(o.x, o.y + (D.topOf(o) - o.y) / 2, o.z);
function dirPick(pts, ref, dx, dy, align = false) {
  let best = -1, bd = Infinity, alt = -1, ba = Infinity;
  const c = Math.cos(MAT.dirCone * D2R);
  pts.forEach((p, i) => {
    if (i === ref) return;
    const vx = p.x - pts[ref].x, vy = p.y - pts[ref].y, L = Math.hypot(vx, vy) || 1e-9, cs = (vx * dx + vy * dy) / L;
    if (cs >= c && L < bd) { bd = L; best = i; }
    if (-cs < ba) { ba = -cs; alt = i; }
  });
  return best >= 0 && !align ? best : alt;
}
function nearestPix(pts, ref, ok = () => true) {
  let best = -1, bd = Infinity;
  pts.forEach((p, i) => { if (i === ref || !ok(i)) return; const L = Math.hypot(p.x - pts[ref].x, p.y - pts[ref].y); if (L < bd) { bd = L; best = i; } });
  return best;
}
function farthestUp(pts, ref, ok) {
  let best = -1, by = Infinity;
  pts.forEach((p, i) => { if (i !== ref && ok(p) && p.y < by) { by = p.y; best = i; } });
  return best;
}
export function matHeuristics(rd, D) {
  const M = rd.mat, mx = matShift(M), on = rd.objs.map((o) => onMat(o, M)), rOn = on[rd.ref], cam = D.cameraFor(rd);
  const cfg = (pred, dx = mx) => shifted(rd, pred, dx);
  const after = cfg((o, i) => on[i]);
  const pix = (objs) => objs.map((o) => centre(cam, o, D));
  const pNow = pix(rd.objs), pAfter = pix(after);
  const R = rd.objs[rd.ref];
  return {
    static: pickBehind(rd, rd.objs, D),
    all: pickBehind(rd, cfg(() => true), D),
    wrongSet: pickBehind(rd, cfg((o, i) => !on[i]), D),
    onlyR: rOn ? pickBehind(rd, cfg((o, i) => i === rd.ref), D) : -1,
    notR: rOn ? pickBehind(rd, cfg((o, i) => on[i] && i !== rd.ref), D) : -1,
    wrongDir: pickBehind(rd, cfg((o, i) => on[i], -mx), D),
    dirTable: dirPick(rd.objs.map((o) => ({ x: o.x, y: o.z })), rd.ref, M.s, 0),
    dirScreen: dirPick(pNow, rd.ref, M.s, 0),
    dirAfter: dirPick(after.map((o) => ({ x: o.x, y: o.z })), rd.ref, M.s, 0),
    dirAlign: dirPick(rd.objs.map((o) => ({ x: o.x, y: o.z })), rd.ref, M.s, 0, true),
    dirAlignScr: dirPick(pNow, rd.ref, M.s, 0, true),
    nearScr: nearestPix(pNow, rd.ref),
    nearScrAfter: nearestPix(pAfter, rd.ref),
    above: nearestPix(pNow, rd.ref, (i) => D.axisK(rd, R, rd.objs[i]).along > 0),
    top: farthestUp(pNow, rd.ref, () => true),
    backMid: farthestUp(pNow, rd.ref, (p) => Math.abs(p.x - D.BOARD.w / 2) < 60),
  };
}

export function matOk(rd, D) {
  const M = rd.mat;
  if (!M || ![1, -1].includes(M.s) || ![1, 2, 3].includes(M.n) || !(M.i1 >= M.i0 + 1) || !(M.j1 >= M.j0 + 1) || M.i1 - M.i0 > 5 || M.j1 - M.j0 > 2) return false;
  if (M.j0 < -5) return false;
  const R = rd.objs[rd.ref];
  if (!R || !Number.isInteger(rd.answer) || rd.answer === rd.ref || !rd.objs[rd.answer]) return false;
  if (!['cyl', 'block'].includes(R.kind) || !NAMED.includes(R.col) || rd.objs.filter((o) => o.col === R.col).length !== 1) return false;
  if (rd.objs.some((o) => o.col === 2 || o.y !== 0)) return false;
  const mx = matShift(M), on = rd.objs.map((o) => onMat(o, M));
  const sx0 = Math.min(M.i0, M.i0 + M.s * M.n), sx1 = Math.max(M.i1, M.i1 + M.s * M.n);
  const seen = new Set(), seenA = new Set();
  for (let k = 0; k < rd.objs.length; k++) {
    const o = rd.objs[k], i = cellOf(o.x), j = cellOf(o.z);
    if (Math.abs(o.x - cellC(i)) > 2e-3 || Math.abs(o.z - cellC(j)) > 2e-3) return false;
    if (footExt(o) > 0.3) return false;
    const key = `${i},${j}`, keyA = `${on[k] ? i + M.s * M.n : i},${j}`;
    if (seen.has(key) || seenA.has(keyA)) return false;
    seen.add(key); seenA.add(keyA);
    if (!on[k]) {
      if (j >= M.j0 && j <= M.j1 && i >= sx0 - 1 && i <= sx1 + 1) return false;
      if (j >= M.j0 && j <= M.j1 + 1 && i >= M.i0 - 1 && i <= M.i1 + 1) return false;
    }
  }
  const cam = D.cameraFor(rd), { x0, x1, z0, z1 } = matRect(M);
  for (const dx of [0, mx]) for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const p = cam.project(x + dx, 0, z);
    if (!(p.z > 0.5 && p.x > 8 && p.x < D.BOARD.w - 8 && p.y > 8 && p.y < D.BOARD.h - 8)) return false;
  }
  if (!rd.objs.every((o) => D.inFrame(cam, o))) return false;
  if (!shifted(rd, (o, i) => on[i], mx).every((o) => D.inFrame(cam, o))) return false;
  if (Math.abs(rd.cam.az) > MAT.azMax || !Number.isFinite(rd.cam.tx)) return false;
  const e = cam.eye;
  if (Math.abs(Math.atan2(rd.cam.tx - e[0], e[2])) > MAT.yawMax * D2R + 1e-3) return false;
  if (truthAfter(rd, D) !== rd.answer) return false;
  if (on[rd.ref] === on[rd.answer]) return false;
  const h = matHeuristics(rd, D);
  if (!Object.values(h).every((v) => v !== rd.answer)) return false;
  const trap = on[rd.ref] ? h.onlyR : h.static;
  if (trap < 0 || !on[trap]) return false;
  const objs = on[rd.ref] ? shifted(rd, (o, i) => i === rd.ref, mx) : rd.objs;
  return D.axisK(rd, objs[rd.ref], objs[trap]).k < MAT.onLineK;
}

const footExt = (o) => (o.kind === 'block' ? o.s * (Math.abs(Math.cos(o.yaw * D2R)) + Math.abs(Math.sin(o.yaw * D2R))) : o.s);
function toy(rng, kind, col) {
  const o = { kind, col, x: 0, z: 0, y: 0, s: 0.25, h: 0, yaw: r3(rng.uniform(-12, 12)) };
  if (kind === 'block') o.s = rng.uniform(0.2, 0.235);
  else if (kind === 'ball') o.s = rng.uniform(0.22, 0.285);
  else if (kind === 'cyl') { o.s = rng.uniform(0.22, 0.28); o.h = rng.uniform(0.5, 0.9); }
  else { o.s = rng.uniform(0.24, 0.285); o.h = rng.uniform(0.6, 1.0); }
  return o;
}
const KINDS = ['block', 'ball', 'cyl', 'cone'];
function tryMat(rng, F, D) {
  const { s, n, onR } = F;
  const cP = rng.int(-3, 2);
  const ex = cellC(cP) + rng.uniform(-0.1, 0.1);
  if (Math.abs(ex) > 6.3 * Math.sin(MAT.azMax * D2R)) return null;
  const az = Math.asin(ex / 6.3), tx = rng.uniform(-1.6, 1.6);
  if (Math.abs(Math.atan2(tx - ex, 6.3 * Math.cos(az))) > MAT.yawMax * D2R) return null;
  const rd = { type: 'behind', cue: 'mat', cam: { az: r3(az / D2R), h: r3(rng.uniform(4.0, 4.7)), tx: r3(tx) }, objs: [], ref: 0, answer: 1, mat: null };
  const refCol = rng.pick(NAMED);
  const pal = rng.shuffle(OTHER.filter((c) => c !== refCol));
  let ci = 0;
  const used = new Set();
  const nextToy = (kinds = KINDS) => {
    for (let a = 0; a < 20; a++) {
      const kind = rng.pick(kinds), col = pal[ci % pal.length];
      if (used.has(`${kind}:${col}`)) { ci++; continue; }
      used.add(`${kind}:${col}`); ci++;
      return toy(rng, kind, col);
    }
    return null;
  };
  const objs = [];
  const at = (o, i, j) => { if (!o) return null; o.x = cellC(i); o.z = cellC(j); objs.push(o); return o; };
  const R = toy(rng, rng.pick(['cyl', 'block']), refCol);
  if (R.kind === 'cyl') { R.s = rng.uniform(0.25, 0.28); R.h = rng.uniform(0.6, 0.9); } else R.s = rng.uniform(0.215, 0.235);
  const low = () => { const o = nextToy(['ball', 'block', 'cyl']); if (o && o.kind === 'cyl') o.h = Math.min(o.h, D.topOf(R) * 0.55); if (o) o.s = Math.min(o.s, 0.25); return o; };
  const rows = (a, b) => { const out = []; for (let j = a; j <= b; j++) out.push(j); return out; };
  let M;
  if (!onR) {
    const rR = rng.int(0, 2), nR = rng.int(2, 3);
    const j1 = rR - 2 - (rng.raw() < 0.3 ? 1 : 0), j0 = j1 - nR + 1;
    const a0 = cP - s * n, rA = rng.int(Math.max(j0, rR - MAT.maxG), j1);
    if (rA > j1) return null;
    const wantX = n <= 2 && rng.raw() < 0.6;
    let lo = Math.min(a0, cP), hi = Math.max(a0, cP);
    if (wantX) { lo = Math.min(lo, cP + s * n); hi = Math.max(hi, cP + s * n); }
    lo -= rng.raw() < 0.35 ? 1 : 0; hi += rng.raw() < 0.35 ? 1 : 0;
    if (hi - lo > 5) return null;
    M = { i0: lo, i1: hi, j0, j1, s, n };
    at(R, cP, rR);
    at(nextToy(), a0, rA);
    const free = rows(j0, j1).filter((j) => j !== rA);
    at(nextToy(), cP, rng.pick(free));
    if (wantX) at(nextToy(), cP + s * n, rng.pick(rows(j0, j1)));
    if (rng.raw() < 0.7) at(low(), cP, rR + 1);
    if (rng.raw() < 0.7) at(nextToy(), cP + s * rng.int(1, 2), rR);
  } else {
    const c0 = cP - s * n, rR = rng.int(0, 2), nR = rng.int(2, 3), back = rng.int(1, nR - 1);
    const j0 = rR - back, j1 = j0 + nR - 1;
    const wantB = rng.raw() < 0.7;
    let lo = Math.min(c0, cP), hi = Math.max(c0, cP);
    if (wantB) { lo = Math.min(lo, c0 + s); hi = Math.max(hi, c0 + s); }
    lo -= rng.raw() < 0.5 ? 1 : 0; hi += rng.raw() < 0.5 ? 1 : 0;
    if (hi - lo < 1) { if (rng.raw() < 0.5) lo--; else hi++; }
    if (hi - lo > 5) return null;
    M = { i0: lo, i1: hi, j0, j1, s, n };
    const rA = j0 - rng.int(1, 2);
    if (rR - rA > MAT.maxG) return null;
    at(R, c0, rR);
    at(nextToy(), cP, rA);
    if (rng.raw() < 0.85) at(nextToy(), c0, j0 - rng.int(1, 2));
    at(nextToy(), cP, rng.int(j0, rR - 1));
    if (wantB) at(nextToy(), c0 + s, rR);
    if (rng.raw() < 0.6) at(low(), cP, j1 + 2);
    if (rng.raw() < 0.5) at(nextToy(), c0 - s * n, j0 - rng.int(1, 2));
  }
  if (objs.length < 2 || objs.includes(null)) return null;
  const want = Math.max(8, objs.length + rng.int(1, 3));
  for (let a = 0; a < 60 && objs.length < Math.min(10, want); a++) {
    const o = nextToy(); if (!o) break;
    o.x = cellC(rng.int(-4, 3)); o.z = cellC(rng.int(-5, 3));
    const trial = { ...rd, mat: M, objs: objs.concat([o]) };
    if (fillerOk(trial, D)) objs.push(o); else used.delete(`${o.kind}:${o.col}`);
  }
  if (objs.length < 8) return null;
  rd.mat = M; rd.objs = objs;
  D.finalize(rd);
  if (!matOk(rd, D)) return null;
  if (truthAfter(rd, D, MAT.qInCam) !== 1) return null;
  if (!matBaseOk(rd, D)) return null;
  if (!D.visibleOk(rd, (id) => matVisNeed(rd, id))) return null;
  return rd;
}
function fillerOk(rd, D) {
  const M = rd.mat, on = rd.objs.map((o) => onMat(o, M)), cam = D.cameraFor(rd);
  const sx0 = Math.min(M.i0, M.i0 + M.s * M.n), sx1 = Math.max(M.i1, M.i1 + M.s * M.n);
  const seen = new Set(), seenA = new Set();
  for (let k = 0; k < rd.objs.length; k++) {
    const o = rd.objs[k], i = cellOf(o.x), j = cellOf(o.z), keyA = `${on[k] ? i + M.s * M.n : i},${j}`;
    if (seen.has(`${i},${j}`) || seenA.has(keyA)) return false;
    seen.add(`${i},${j}`); seenA.add(keyA);
    if (!on[k] && ((j >= M.j0 && j <= M.j1 && i >= sx0 - 1 && i <= sx1 + 1) || (j >= M.j0 && j <= M.j1 + 1 && i >= M.i0 - 1 && i <= M.i1 + 1))) return false;
  }
  const o = rd.objs[rd.objs.length - 1];
  if (!D.inFrame(cam, o)) return false;
  if (on[on.length - 1] && !D.inFrame(cam, { ...o, x: o.x + matShift(M) })) return false;
  return true;
}

export const matVisNeed = (rd, id) => (id === rd.ref ? MAT.visR : id === rd.answer ? MAT.visA : MAT.vis);
export function matBaseOk(rd, D) {
  const sc = D.sceneFor(rd), cam = sc.cam, e = cam.eye;
  for (let id = 0; id < rd.objs.length; id++) {
    const o = rd.objs[id], ux0 = e[0] - o.x, uz0 = e[2] - o.z, ul = Math.hypot(ux0, uz0), ux = ux0 / ul, uz = uz0 / ul;
    const ext = o.kind === 'block' ? o.s * (Math.abs(ux * Math.cos(o.yaw * D2R) - uz * Math.sin(o.yaw * D2R)) + Math.abs(ux * Math.sin(o.yaw * D2R) + uz * Math.cos(o.yaw * D2R))) : o.s;
    const y = 0.06, r = o.kind === 'ball' ? Math.sqrt(Math.max(0, o.s * o.s - (o.s - y) ** 2)) : o.kind === 'cone' ? o.s * (1 - y / o.h) : o.s;
    const pts = [[o.x + ux * r * 0.9, y, o.z + uz * r * 0.9, id]];
    for (const d of [0.06, 0.13]) pts.push([o.x + ux * (ext + d), 0, o.z + uz * (ext + d), -1]);
    for (const [x, yy, z, want] of pts) {
      const p = cam.project(x, yy, z);
      if (!(p.x > 1 && p.y > 1 && p.x < cam.W - 1 && p.y < cam.H - 1)) return false;
      if (D.pickId(sc, p.x, p.y) !== want) return false;
    }
  }
  return true;
}

export function makeMatInstance(rng, D) {
  let F = { s: rng.sign(), n: rng.int(1, 3), onR: rng.raw() < 0.5 };
  for (let round = 0; round < 6; round++) {
    for (let a = 0; a < MAT.tries; a++) {
      const rd0 = tryMat(rng, F, D);
      if (!rd0) continue;
      const order = rng.shuffle(rd0.objs.map((_, i) => i));
      return { ...rd0, objs: order.map((i) => rd0.objs[i]), ref: order.indexOf(rd0.ref), answer: order.indexOf(rd0.answer) };
    }
    F = { s: rng.sign(), n: rng.int(1, 3), onR: rng.raw() < 0.5 };
  }
  throw new Error('behind_relation_tap(cue=mat): sampler exhausted');
}

export function matPrompt(rd, name) {
  const M = rd.mat;
  return {
    main: `After the green mat slides ${M.n} square${M.n > 1 ? 's' : ''} to the ${M.s > 0 ? 'right' : 'left'}, carrying what stands on it, click what is directly behind the ${name}`,
    sub: 'As seen from where you are',
  };
}
export function matSemantic(rd) {
  const M = rd.mat;
  return `|mat:${M.i0},${M.i1},${M.j0},${M.j1}>${M.s * M.n}`;
}
