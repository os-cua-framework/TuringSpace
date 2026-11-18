import * as W from './_house_headcount_scene.js';

const RT = W.RT, VIEW = W.VIEW;
export const NAME = 'house_headcount';
const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

export const GATE = {
  T: [20, 30], hold: [0.8, 1.5], seen: 0.4, hidden: 0.08,
  visIn: 3.2,
  visFront: 4.0,
  frontBefore: 1.5, frontAfter: 2.5,
  backHide: 1.5,
  backSeen: 1.5,
  insideHide: 2.0,
  doorGap: 2.0, eventGap: 1.5, passGap: 1.0,
  doorNear: 1.3, maxSeen: 3, overlap: 0.3, minPx: 40, doorPx: 34,
};

export function timeAtS(seg, s) {
  let lo = seg.t0, hi = seg.t1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (W.walkS(seg, mid) < s) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function walkSeg(pts, t0, v) {
  const len = W.pathLen(pts), t1 = t0 + W.walkTime(len, v);
  return { k: 'walk', t0: r3(t0), t1: r3(t1), pts: pts.map((p) => [r3(p[0]), r3(p[1])]), len: r3(len) };
}
export function doorEvents(m) {
  const H = m.house, zc = H.D / 2 - H.th / 2, ev = [];
  m.people.forEach((p, i) => {
    for (const seg of p.segs) {
      if (seg.k !== 'walk') continue;
      let s = 0;
      for (let j = 1; j < seg.pts.length; j++) {
        const a = seg.pts[j - 1], b = seg.pts[j], l = hyp(a, b);
        if ((a[1] - zc) * (b[1] - zc) < 0 && Math.abs(a[0] - H.xd) < 0.3 && Math.abs(b[0] - H.xd) < 0.3) {
          const u = (a[1] - zc) / (a[1] - b[1]);
          ev.push({ p: i, kind: b[1] < a[1] ? 'in' : 'out', t: r3(timeAtS(seg, s + u * l)) });
        }
        s += l;
      }
    }
    if (p.role === 'front') {
      const seg = p.segs[0], a = seg.pts[0], b = seg.pts[1], u = (H.xd - a[0]) / (b[0] - a[0]);
      ev.push({ p: i, kind: 'pass', t: r3(timeAtS(seg, u * seg.len)) });
    }
  });
  return ev;
}

const TRACKS = new WeakMap();
export function tracks(m, dt = 0.1) {
  const key = dt, c = TRACKS.get(m);
  if (c && c[key]) return c[key];
  const nF = Math.floor(m.T / dt + 1e-9) + 1, per = m.people.map(() => []);
  for (let f = 0; f < nF; f++) {
    const t = Math.min(m.T, f * dt), sc = W.sceneAt(m, t);
    const drawn = new Map(sc.poses);
    m.people.forEach((p, i) => {
      const P = W.poseAt(p, t), D = drawn.get(i);
      if (!D) { per[i].push({ t: r3(t), pose: P, frac: 0, area: 0, occS: 0, occP: 0, box: null, vbox: null, pt: null, feet: 0 }); return; }
      const v = RT.personVis(sc, W.ID.person(i), 3, W.isStaticId);
      per[i].push({ t: r3(t), pose: P, frac: v.frac, area: v.area, occS: v.area ? v.occS / v.area : 0, occP: v.area ? (v.area - v.vis - v.occS - v.off) / v.area : 0, box: v.box, vbox: v.vbox, pt: v.pt, feet: v.feetA ? v.feetV / v.feetA : 0 });
    });
  }
  const out = { dt, nF, per };
  TRACKS.set(m, { ...(c || {}), [key]: out });
  return out;
}
function seenTime(arr, ta = -Infinity, tb = Infinity) {
  let n = 0, dt = arr.length > 1 ? arr[1].t - arr[0].t : 0.1;
  for (const e of arr) if (e.t >= ta && e.t <= tb && e.frac >= GATE.seen) n++;
  return Math.max(0, n - 1) * dt;
}
function longestRun(arr, pred, ta = -Infinity, tb = Infinity) {
  let best = { len: 0, a: NaN, b: NaN }, a = null, prev = null;
  for (const e of arr) {
    if (e.t < ta || e.t > tb) { a = null; continue; }
    if (pred(e)) { if (a == null) a = e.t; prev = e.t; if (prev - a > best.len) best = { len: prev - a, a, b: prev }; }
    else a = null;
  }
  return best;
}
export function backEvents(m, tr) {
  const ev = [];
  m.people.forEach((p, i) => {
    if (p.role !== 'back') return;
    const arr = tr.per[i], seg = p.segs[0];
    const run = longestRun(arr, (e) => e.pose && e.frac <= GATE.hidden, seg.t0 + 0.5, seg.t1 - 0.5);
    if (run.len > 0) { ev.push({ p: i, kind: 'hide', t: run.a }, { p: i, kind: 'show', t: run.b }); }
  });
  return ev;
}
export function doorRect(m) {
  const H = m.house, z = H.D / 2, pts = [[H.xd - H.dw / 2, 0, z], [H.xd + H.dw / 2, 0, z], [H.xd - H.dw / 2, H.dh, z], [H.xd + H.dw / 2, H.dh, z]].map((p) => W.project(m, p));
  return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
}
export function houseRect(m, c = null) {
  const H = m.house, s = H.hr / (H.D / 2), pts = [];
  for (const x of [-H.W / 2, H.W / 2]) for (const z of [-H.D / 2, H.D / 2]) pts.push([x, 0, z]);
  for (const x of [-H.W / 2 - 0.22, H.W / 2 + 0.22]) { for (const z of [-H.D / 2 - H.ov, H.D / 2 + H.ov]) pts.push([x, H.hw - H.ov * s, z]); pts.push([x, H.hw + H.hr + 0.16, 0]); }
  pts.push([H.xd - 0.62, 0, H.D / 2 + 0.42], [H.xd + 0.62, 0, H.D / 2 + 0.42]);
  const q = pts.map((p) => (c ? ((r) => [r.x, r.y, r.z])(c.project(p[0], p[1], p[2])) : W.project(m, p)));
  return [Math.min(...q.map((a) => a[0])), Math.min(...q.map((a) => a[1])), Math.max(...q.map((a) => a[0])), Math.max(...q.map((a) => a[1]))];
}

const CHECK = new WeakMap();
export function check(m) {
  if (CHECK.has(m)) return CHECK.get(m);
  const r = checkImpl(m);
  CHECK.set(m, r);
  return r;
}
const boxIoS = (a, b) => {
  const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
};
function checkImpl(m) {
  if (!m || m.task !== NAME || !Array.isArray(m.people)) return 'shape';
  if (!(m.T >= GATE.T[0] && m.T <= GATE.T[1]) || !(m.hold >= GATE.hold[0] - 1e-9 && m.hold <= GATE.hold[1] + 1e-9) || !m.live) return 'time';
  const P = m.people, N = P.length, roles = P.map((p) => p.role);
  const S = roles.filter((r) => r === 'stay').length, IO = roles.filter((r) => r === 'inout').length;
  const B = roles.filter((r) => r === 'back').length, F = roles.filter((r) => r === 'front').length;
  if (N < 5 || N > 7 || S < 1 || S > 4 || IO !== (N - S >= 2 ? 1 : 0) || B < 1 || B > 3 || S + IO + B + F !== N || m.answer !== S) return 'counts';
  const X = P.findIndex((p) => p.look === 'base'), Y = P.findIndex((p) => p.look === 'twin');
  if (X < 0 || Y < 0 || P[Y].role !== 'stay' || P[X].role !== (IO ? 'inout' : F ? 'front' : 'back')) return 'look';
  if (W.LOOK_TWIN[P[X].top] !== P[Y].top && W.LOOK_TWIN[P[Y].top] !== P[X].top) return 'look';
  if (P[X].bottom !== P[Y].bottom || P.filter((p) => p.top === P[X].top || p.top === P[Y].top).length !== 2) return 'look';
  if (W.HAIR_DARK.includes(P[X].hair) === W.HAIR_DARK.includes(P[Y].hair)) return 'look:hair';
  const dr = doorRect(m);
  if (dr[3] - dr[1] < GATE.doorPx) return 'door:px';
  const dev = doorEvents(m);
  const tr = tracks(m);
  const bev = backEvents(m, tr);
  if (bev.length !== 2 * B) return 'back:events';
  const doorT = dev.filter((e) => e.kind !== 'pass').map((e) => e.t).sort((a, b) => a - b);
  for (let i = 1; i < doorT.length; i++) if (doorT[i] - doorT[i - 1] < GATE.doorGap - 1e-9) return 'gap:door';
  const evs = dev.concat(bev), isDoor = (e) => e.kind === 'in' || e.kind === 'out';
  for (let a = 0; a < evs.length; a++) for (let b = a + 1; b < evs.length; b++) {
    const need = isDoor(evs[a]) && isDoor(evs[b]) ? GATE.doorGap : isDoor(evs[a]) || isDoor(evs[b]) ? GATE.eventGap : GATE.passGap;
    if (Math.abs(evs[a].t - evs[b].t) < need - 1e-9) return 'gap:event';
  }
  const yIn = dev.find((e) => e.p === Y && e.kind === 'in'), xOut = dev.concat(bev).filter((e) => e.p === X && ['out', 'pass', 'show'].includes(e.kind)).pop();
  if (!yIn || !xOut || !(yIn.t < xOut.t)) return 'look:order';
  for (const t of [0, m.T]) for (const p of P) {
    const Q = W.drawnAt(p, t);
    if (Q && !W.offPicture(m, Q.x, Q.z, p.k)) return 'ends';
  }
  const zFront = m.house.D / 2;
  for (let i = 0; i < N; i++) {
    const p = P[i], arr = tr.per[i];
    const seen = (e) => e.frac >= GATE.seen;
    const hmax = Math.max(...arr.filter((e) => e.frac >= 0.95 && e.box).map((e) => e.box[3] - e.box[1]), 0);
    if (hmax < GATE.minPx) return 'px:' + p.role;
    if (p.role === 'stay' || p.role === 'inout') {
      const tin = dev.find((e) => e.p === i && e.kind === 'in').t;
      if (seenTime(arr, -Infinity, tin + 1.0) < GATE.visIn - 1e-9) return 'vis:in';
      const settle = p.segs[0].t1;
      if (settle - tin > 2.2) return 'settle';
      const tEndIn = p.role === 'inout' ? p.segs[2].t0 : m.T;
      if (arr.some((e) => e.t >= tin + 1.4 && e.t <= tEndIn && e.frac > 0)) return 'inside:vis';
      if (!hiddenThere(m, i, p.segs[1].at, p.segs[1].f)) return 'inside:pix';
      if (p.role === 'inout') {
        const tout = dev.find((e) => e.p === i && e.kind === 'out').t;
        if (longestRun(arr, (e) => e.pose && e.frac === 0, tin, tout).len < GATE.insideHide - 1e-9) return 'inside:hide';
        if (seenTime(arr, tout - 1.0, Infinity) < GATE.visIn - 1e-9) return 'vis:out';
      }
    } else if (p.role === 'front') {
      if (seenTime(arr) < GATE.visFront - 1e-9) return 'vis:front';
      if (arr.some((e) => e.occS > 0.05)) return 'front:occ';
      if (!arr.some((e) => e.frac >= GATE.seen && e.box && overlapDoor(e.box, dr))) return 'front:door';
      const tp = dev.find((e) => e.p === i && e.kind === 'pass').t;
      if (seenTime(arr, -Infinity, tp) < GATE.frontBefore - 1e-9 || seenTime(arr, tp, Infinity) < GATE.frontAfter - 1e-9) return 'front:past';
      const sg = p.segs[0];
      for (let u = 0; u <= sg.len; u += 0.25) { const q = W.pathAt(sg.pts, u); if (Math.abs(q[0]) < m.house.W / 2 + 1 && q[1] < zFront + 1.5 && !W.offPicture(m, q[0], q[1], p.k)) return 'front:z'; }
    } else {
      const run = longestRun(arr, (e) => e.pose && e.frac <= GATE.hidden, p.segs[0].t0 + 0.5, p.segs[0].t1 - 0.5);
      if (run.len < GATE.backHide - 1e-9) return 'back:hide';
      if (seenTime(arr, -Infinity, run.a) < GATE.backSeen - 1e-9 || seenTime(arr, run.b, Infinity) < GATE.backSeen - 1e-9) return 'back:seen';
      if (!arr.some((e) => e.area && e.occS >= 0.2 && e.frac >= 0.15 && e.frac <= 0.85)) return 'back:partial';
      if (!arr.some((e) => e.t < run.a && e.frac >= GATE.seen && e.feet >= 0.6)) return 'back:feet';
      const xs = arr.filter((e) => e.t >= run.a && e.t <= run.b && e.pose).map((e) => W.project(m, [e.pose.x, 0.9 * p.k, e.pose.z])[0]);
      if (!(Math.min(...xs) <= dr[0] && Math.max(...xs) >= dr[2])) return 'back:door';
    }
  }
  for (let i = 0; i < N; i++) if (longestRun(tr.per[i], (e) => e.occP > 0.5).len > 0.8) return 'occluded';
  for (let f = 0; f < tr.nF; f++) {
    const vis = [];
    let near = 0;
    for (let i = 0; i < N; i++) {
      const e = tr.per[i][f];
      if (e.frac >= GATE.seen) vis.push(e.box);
      if (e.pose && !(e.pose.standing && P[i].segs[e.pose.seg].inside) && Math.hypot(e.pose.x - m.house.xd, e.pose.z - zFront) < GATE.doorNear) near++;
    }
    if (vis.length > GATE.maxSeen) return 'crowd:n';
    if (near > 1) return 'crowd:door';
    for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) if (boxIoS(vis[a], vis[b]) > GATE.overlap) return 'overlap';
  }
  return null;
}
function overlapDoor(b, dr) {
  const ix = Math.min(b[2], dr[2]) - Math.max(b[0], dr[0]), iy = Math.min(b[3], dr[3]) - Math.max(b[1], dr[1]);
  return ix >= 0.3 * (dr[2] - dr[0]) && iy >= 0.1 * (dr[3] - dr[1]);
}
export function hiddenThere(m, i, at, f) {
  const p = m.people[i], k = p.k;
  const J = W.bodyJoints({ x: at[0], z: at[1], f, k, walking: 0, gait: 0 });
  const C = W.sceneMats(m), sc0 = W.staticScene(m);
  const shapes = sc0.shapes.slice();
  W.personShapes(shapes, W.ID.person(i), J, C.P[i]);
  const sc1 = RT.makeScene({ cam: sc0.cam, shapes, mats: C.mats, light: C.light, env: C.env, exposure: 1.0 });
  const v = RT.personVis(sc1, W.ID.person(i), 2, W.isStaticId);
  if (v.vis > 0) return false;
  const b = W.personScreenBox(m, at[0], at[1], k, 0.5), rc = { x: Math.max(0, b[0]), y: Math.max(0, b[1]), w: Math.min(VIEW.w, b[2]) - Math.max(0, b[0]), h: Math.min(VIEW.h, b[3]) - Math.max(0, b[1]) };
  if (rc.w <= 0 || rc.h <= 0) return true;
  const a0 = RT.renderRect(sc0, 1, rc), a1 = RT.renderRect(sc1, 1, rc);
  for (let j = 0; j < a0.data.length; j++) if (a0.data[j] !== a1.data[j]) return false;
  return true;
}

export const _genStats = {};
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };
export function cast(r0) {
  const S = 1 + Math.floor(r0() * 4), N = 5 + Math.floor(r0() * 3), M = N - S, IO = M >= 2 ? 1 : 0, P = M - IO;
  const B = 1 + Math.floor(r0() * Math.min(P, 3));
  return { S, N, IO, B, F: P - B };
}
const NEAR = { '#3a66b8': ['#2a9a9a', '#7a4bb0'], '#c8372d': ['#e0702a', '#e07aa0'], '#2f8f46': ['#2a9a9a'], '#e0702a': ['#c8372d', '#e2b822'] };
export const SECTORS = 5, SECTOR_DEG = 58;
const sectorAngle = (rng, k) => (-SECTOR_DEG + (k + 0.15 + 0.7 * rng.raw()) * (2 * SECTOR_DEG / SECTORS)) * DEG;
function pushOff(m, g, d, k, max = 16) {
  for (let e = 0.3; e <= max; e += 0.25) { const q = [g[0] + d[0] * e, g[1] + d[1] * e]; if (W.offPicture(m, q[0], q[1], k)) return q; }
  return null;
}
function doorEnd(m, rng, k, A, kk) {
  for (let a = 0; a < 6; a++) {
    const th = sectorAngle(rng, k), d = [Math.sin(th), Math.cos(th)], E = pushOff(m, A, d, kk, 12);
    if (!E) continue;
    let Lb = 0;
    for (let e = 0.3; e <= 12; e += 0.1) { if (W.offPicture(m, A[0] + d[0] * e, A[1] + d[1] * e, kk, false)) { Lb = e; break; } }
    if (Lb < 2.6 || Lb > 8.5) continue;
    return { E, th: th / DEG, Lb };
  }
  return null;
}
function passLine(m, C, d, k) {
  const a = pushOff(m, C, [-d[0], -d[1]], k), b = pushOff(m, C, d, k);
  return a && b ? [a, b] : null;
}

export function tryBuild(rng, C) {
  const { S, IO, B, F } = C;
  const U = rng.uniform, raw = rng.raw, pick = (a) => a[Math.floor(raw() * a.length)];
  const side = raw() < 0.5 ? -1 : 1;
  const Wd = r2(U(3.5, 4.4)), D = r2(U(2.8, 3.3)), hw = r2(U(2.3, 2.55)), hr = r2(U(1.2, 1.55)), th = 0.14, ov = 0.28;
  const dw = r2(U(0.94, 1.0)), dh = r2(U(1.98, 2.05));
  const xd = r2(side * U(-(Wd / 2 - 0.92), Wd / 2 - 1.8));
  const house = { W: Wd, D, hw, hr, th, ov, dw, dh, xd, hide: side, win: [], wall: pick(W.WALLS), roof: pick(W.ROOFS), door: pick(W.DOORS) };
  for (const sg of [side, -side]) {
    const a0 = xd + sg * (dw / 2 + 0.12), a1 = sg * (Wd / 2 - 0.1), wd = Math.abs(a1 - a0);
    if (wd >= 1.15) house.win.push({ wall: 'front', a: r3((a0 + a1) / 2), y: r2(U(1.35, 1.5)), s: r3(Math.min(0.4, (wd - 0.36) / 2)) });
  }
  house.win.push({ wall: 'side', side, a: r3(U(-0.25, 0.25) * D), y: r2(U(1.35, 1.5)), s: 0.38 });
  const camP = { az: r2(side * U(20, 36)), el: r2(U(25, 31)), dist: r2(U(11.2, 12.4)), fov: 40, target: [0, 0.9, r2(D / 2 + U(0.4, 0.9))] };
  const sun = { az: r2(camP.az + (raw() < 0.5 ? -1 : 1) * U(25, 70)), el: r2(U(42, 58)) };
  const az = camP.az * DEG, Fh = [-Math.sin(az), -Math.cos(az)], Rh = [Math.cos(az), -Math.sin(az)];
  const ext = Wd / 2 * Math.abs(Fh[0]) + D / 2 * Math.abs(Fh[1]);
  const bOff = ext + U(1.0, 1.5), hOff = bOff + U(1.8, 2.5);
  const back = { c: [r3(Fh[0] * bOff), r3(Fh[1] * bOff)], d: [r3(Rh[0]), r3(Rh[1])], half: 0.55 };
  const hedge = [];
  for (let u = -13; u <= 13; u += U(1.1, 1.5)) { const q = [Fh[0] * (hOff + U(-0.15, 0.15)) + Rh[0] * u, Fh[1] * (hOff + U(-0.15, 0.15)) + Rh[1] * u]; hedge.push([r3(q[0]), r3(q[1]), r3(U(0.8, 1.05)), r3(U(0.55, 0.72)), r3(U(0.55, 0.7))]); }
  const trees = [];
  for (const sg of [-1, 1]) {
    const u = sg * U(3.4, 6.5), o = hOff + U(1.4, 2.8), x = Fh[0] * o + Rh[0] * u, z = Fh[1] * o + Rh[1] * u, h = U(1.9, 2.4), crown = [];
    for (let c = 0; c < 3; c++) crown.push([r3(U(-0.5, 0.5)), r3(h + U(0.4, 1.0)), r3(U(-0.4, 0.4)), r3(U(0.85, 1.2))]);
    trees.push({ x: r3(x), z: r3(z), h: r3(h), crown });
  }
  const garden = { back, hedge, trees, grass: pick([['#5d8a3a', '#7aa34a'], ['#4f7f36', '#6f9a44'], ['#65913f', '#86ab55']]),
    gravel: pick([['#b9a68a', '#d4c4a6'], ['#a89a86', '#c8bca8']]), hedgeCol: pick(['#3f6e34', '#4a7a3a', '#386a3e']), leafCol: pick(['#4f8a3c', '#5a8f3a', '#46803f']) };
  const m = { task: NAME, board: null, live: true, T: 0, hold: 0, house, cam: camP, sun, garden, people: [], answer: S };
  {
    const off = U(-12, 12), yc = U(0.33, 0.38) * VIEW.h, Rx = Math.cos(camP.az * DEG), Rz = -Math.sin(camP.az * DEG);
    const Fx = -Math.sin(camP.az * DEG), Fz = -Math.cos(camP.az * DEG);
    for (let it = 0; it < 4; it++) {
      const c = W.camOf(m), hr = houseRect(m, c), dx = (hr[0] + hr[2]) / 2 - VIEW.w / 2 - off, dy = (hr[1] + hr[3]) / 2 - yc;
      const sh = dx * camP.dist / c.f, sv = -dy * camP.dist / c.f / Math.sin(camP.el * DEG);
      camP.target = [r3(camP.target[0] + Rx * sh + Fx * sv), camP.target[1], r3(camP.target[2] + Rz * sh + Fz * sv)];
    }
  }
  const cam = W.cam(m);
  const hr0 = houseRect(m), dr = doorRect(m);
  if (hr0[0] < 22 || hr0[2] > VIEW.w - 22 || hr0[1] < 14 || hr0[3] > VIEW.h * 0.66) return fail('frame:house');
  if (dr[3] - dr[1] < GATE.doorPx + 2) return fail('frame:door');
  if (hr0[0] < 56 || VIEW.w - hr0[2] < 56) return fail('frame:back');
  for (const u of [-6, 6]) { const q = W.project(m, [back.c[0] + back.d[0] * u, 0, back.c[1] + back.d[1] * u]); if (q[1] < 50 || q[1] > VIEW.h * 0.6) return fail('frame:backY'); }
  const roles = [...Array(S).fill('stay'), ...Array(IO).fill('inout'), ...Array(B).fill('back'), ...Array(F).fill('front')];
  const ppl = roles.map((role) => ({ role }));
  const X = IO ? S : (F ? S + B : S), Y = Math.floor(raw() * S);
  const base = pick(W.LOOK_BASE), twin = W.LOOK_TWIN[base];
  const swap = raw() < 0.5;
  ppl[X].top = swap ? twin : base; ppl[Y].top = swap ? base : twin; ppl[X].look = 'base'; ppl[Y].look = 'twin';
  const others = rng.shuffle(W.TOPS.filter((c) => c !== base && !(NEAR[base] || []).includes(c)));
  let oi = 0;
  ppl.forEach((p, i) => { if (i !== X && i !== Y) p.top = others[oi++]; });
  const bot = pick(W.BOTTOMS);
  ppl.forEach((p, i) => { p.bottom = i === X || i === Y ? bot : pick(W.BOTTOMS); p.skin = pick(W.SKINS); p.hair = pick(W.HAIRS); });
  { const d = pick(W.HAIR_DARK), l = pick(W.HAIR_LIGHT); if (raw() < 0.5) { ppl[X].hair = d; ppl[Y].hair = l; } else { ppl[X].hair = l; ppl[Y].hair = d; } }
  ppl.forEach((p, i) => { const h = i === X || i === Y ? U(1.7, 1.8) : U(1.62, 1.86); p.k = r3(h / 1.7); });
  const A = [xd, D / 2 + 0.85], I1 = [xd, D / 2 - th - 0.55];
  const scS = W.staticScene(m);
  const sectors = rng.shuffle([...Array(SECTORS).keys()]);
  let si = 0;
  const hideSpot = () => [r3(xd + side * U(0.8, 1.15)), r3(D / 2 - th - U(0.45, 0.8))];
  for (const p of ppl) {
    p.v = r3(p.role === 'back' ? U(1.35, 1.6) : p.role === 'front' ? U(1.1, 1.35) : U(1.15, 1.5));
    if (p.role === 'stay' || p.role === 'inout') {
      const sec = sectors[si++], e = doorEnd(m, rng, sec, A, p.k);
      if (!e) return fail('route:in');
      p.sec = sec; p.E = e.E; p.I2 = hideSpot();
      let Lb = e.Lb;
      if (p.role === 'inout') {
        const outs = [...Array(SECTORS).keys()].filter((q) => Math.abs(q - sec) >= 2);
        const sec2 = pick(outs), e2 = doorEnd(m, rng, sec2, A, p.k);
        if (!e2) return fail('route:out');
        p.sec2 = sec2; p.X = e2.E;
        p.wait = r3(U(2.2, 3.2));
        Lb = Math.min(Lb, e2.Lb);
      }
      p.v = r3(Math.max((Lb + 1.4) / 5.6, Math.min(p.v, (Lb + 1.4) / 4.0)));
      if (p.v < 0.95 || p.v > 1.65) return fail('route:speed');
    } else if (p.role === 'front') {
      const ang = -U(0.15, 0.45) * az + U(-3, 3) * DEG, zc = D / 2 + U(1.8, 2.6), x0 = xd + U(-0.4, 0.4);
      const opts = [];
      for (const sg of [-1, 1]) {
        const d = [sg * Math.cos(ang), sg * Math.sin(ang)], slope = Math.abs(d[1] / d[0]), reach = Wd / 2 + 1 + Math.abs(xd);
        const C0 = [x0, zc + Math.max(0, D / 2 + 1.6 - (zc - slope * reach))];
        const room = (dd) => { for (let e = 0.2; e <= 12; e += 0.1) if (W.offPicture(m, C0[0] + dd[0] * e, C0[1] + dd[1] * e, p.k, false)) return e; return 12; };
        if (room(d) >= 2.6 * p.v + 0.3 && room([-d[0], -d[1]]) >= 1.8 * p.v + 0.3) opts.push({ d, C0 });
      }
      if (!opts.length) return fail('route:front');
      const o = opts[Math.floor(raw() * opts.length)], L = passLine(m, o.C0, o.d, p.k);
      if (!L) return fail('route:front');
      p.pts = L;
    } else {
      const sg = raw() < 0.5 ? -1 : 1, del = U(-4, 4) * DEG, c = Math.cos(del), sn = Math.sin(del);
      const d = [sg * (back.d[0] * c - back.d[1] * sn), sg * (back.d[0] * sn + back.d[1] * c)];
      const L = passLine(m, [back.c[0] + back.d[0] * U(-0.5, 0.5) + Fh[0] * U(-0.2, 0.2), back.c[1] + back.d[1] * U(-0.5, 0.5) + Fh[1] * U(-0.2, 0.2)], d, p.k);
      if (!L) return fail('route:back');
      p.pts = L;
      const len = hyp(L[0], L[1]);
      let v0 = null, v1 = null, h0 = null, h1 = null;
      for (let u = 0; u <= len; u += 0.1) {
        const Q = [L[0][0] + d[0] * u, L[0][1] + d[1] * u];
        if (W.offPicture(m, Q[0], Q[1], p.k, false)) continue;
        if (v0 === null) v0 = u; v1 = u;
        if ([0.12, 0.5, 0.95, 1.35, 1.72].every((y) => { const r = RT.rayToPoint(scS, Q[0], y * p.k, Q[1]); return r.id >= 0 && r.t < r.tP - 0.05; })) { if (h0 === null) h0 = u; h1 = u; }
      }
      if (h0 === null) return fail('route:backhide');
      p.v = r3(Math.min(p.v, (h0 - v0) / 2.0, (v1 - h1) / 2.0));
      if (p.v < 1.0) return fail('route:backnarrow');
    }
  }
  const sc0 = W.staticScene(m), zd = D / 2;
  const buildSegs = (p, t0) => {
    if (p.role === 'stay' || p.role === 'inout') {
      const w1 = walkSeg([p.E, A, I1, p.I2], t0, p.v), f = [-side, 0];
      if (p.role === 'stay') return { segs: [w1, { k: 'stand', t0: w1.t1, t1: Infinity, at: p.I2, f, inside: true }], tEnd: Infinity, end: w1.t1 };
      const st = { k: 'stand', t0: w1.t1, t1: r3(w1.t1 + p.wait), at: p.I2, f, inside: true };
      const w2 = walkSeg([p.I2, I1, A, p.X], st.t1, p.v);
      return { segs: [w1, st, w2], tEnd: w2.t1, end: w2.t1 };
    }
    const w = walkSeg(p.pts, t0, p.v);
    return { segs: [w], tEnd: w.t1, end: w.t1 };
  };
  for (const [i, p] of ppl.entries()) {
    const b0 = buildSegs(p, 0), q = { role: p.role, k: p.k, segs: b0.segs, tEnd: b0.tEnd };
    const mm = { house, people: [q] };
    p.ev = doorEvents(mm).map((e) => ({ kind: e.kind, t: e.t, door: e.kind !== 'pass', pad: 0 }));
    if (p.role === 'back') {
      let a0 = null, b1 = null;
      for (let t = 0; t <= b0.end; t += 0.05) {
        const Q = W.poseAt(q, t);
        if (!Q) continue;
        const hidden = [0.12, 0.5, 0.95, 1.35, 1.72].every((y) => { const r = RT.rayToPoint(sc0, Q.x, y * p.k, Q.z); return r.id >= 0 && r.t < r.tP - 0.05; });
        if (hidden) { if (a0 === null) a0 = t; b1 = t; }
      }
      if (a0 === null || b1 - a0 < GATE.backHide + 0.3) return fail('back:approx');

      p.ev.push({ kind: 'hide', t: a0, door: false, pad: 0.4 }, { kind: 'show', t: b1, door: false, pad: 0.4 });
    }
    const K = Math.ceil(b0.end / 0.1) + 2, boxes = [], near = [];
    const hide = p.ev.find((e) => e.kind === 'hide'), show = p.ev.find((e) => e.kind === 'show');
    for (let k = 0; k <= K; k++) {
      const t = k * 0.1, Q = W.drawnAt(q, t);
      near.push(!!Q && Math.hypot(Q.x - xd, Q.z - zd) < GATE.doorNear);
      let bx = null;
      if (Q && !(Math.abs(Q.x) < Wd / 2 && Math.abs(Q.z) < D / 2) && !(hide && t > hide.t - 0.3 && t < show.t + 0.3)) {
        const bb = W.personScreenBox(m, Q.x, Q.z, p.k, 0.2, false);
        if (!(bb[2] < 0 || bb[0] > VIEW.w || bb[3] < 0 || bb[1] > VIEW.h)) bx = bb;
      }
      boxes.push(bx);
    }
    p.boxes = boxes; p.nearK = near; p.dur = b0.end;
  }
  const GRID = 0.1, NJ = Math.ceil(60 / GRID);
  let stretch = 1;
  for (let a = 0; a < 30; a++) {
    const order0 = ppl.map((p, i) => [p.dur + U(-7, 7), i]).sort((x, y) => y[0] - x[0]).map((x) => x[1]).filter((i) => i !== Y);
    const ix = order0.indexOf(X) + (raw() < 0.5 ? 0 : 1), order = [...order0.slice(0, ix), Y, ...order0.slice(ix)], placed = [];
    const occB = Array.from({ length: NJ }, () => []), occN = new Uint8Array(NJ);
    let fv = U(0.9, 1.6), okS = true;
    for (const i of order) {
      const p = ppl[i];
      let j0 = Math.max(1, Math.round((fv - 0.6) / GRID)), ok = false;
      for (let k = 0; k < 160 && !ok; k++, j0++) {
        const t0 = j0 * GRID;
        ok = j0 + p.boxes.length < NJ && p.ev.every((e) => placed.every((q) => Math.abs(t0 + e.t - q.t) >= (e.door && q.door ? GATE.doorGap : e.door || q.door ? GATE.eventGap : GATE.passGap) + Math.max(e.pad, q.pad)));
        for (let kk = 0; ok && kk < p.boxes.length; kk++) {
          const j = j0 + kk, bx = p.boxes[kk];
          if (p.nearK[kk] && occN[j]) ok = false;
          else if (bx && (occB[j].length + 1 > GATE.maxSeen || occB[j].some((o) => boxIoS(o, bx) > GATE.overlap * 0.8))) ok = false;
        }
      }
      if (!ok) { okS = false; break; }
      j0--;
      const t0 = j0 * GRID;
      p.t0 = t0;
      for (const e of p.ev) placed.push({ t: t0 + e.t, door: !!e.door, pad: e.pad });
      p.boxes.forEach((bx, kk) => { if (bx) occB[j0 + kk].push(bx); if (p.nearK[kk]) occN[j0 + kk] = 1; });
      fv = t0 + 0.6 + U(1.2, 3.8) * stretch;
    }
    if (!okS) { _genStats['s:slide'] = (_genStats['s:slide'] || 0) + 1; continue; }
    const T = r3(Math.max(...ppl.map((p) => p.t0 + p.dur)) + U(0.5, 1.0));
    if (T < GATE.T[0]) { stretch *= 1.2; _genStats['s:T<'] = (_genStats['s:T<'] || 0) + 1; continue; }
    if (T > GATE.T[1]) { stretch *= 0.85; _genStats['s:T>'] = (_genStats['s:T>'] || 0) + 1; continue; }
    m.people = ppl.map((p) => { const b0 = buildSegs(p, p.t0); return { role: p.role, look: p.look, top: p.top, bottom: p.bottom, skin: p.skin, hair: p.hair, k: p.k, v: p.v, segs: b0.segs, tEnd: b0.tEnd, ph: r3(U(0, 6.28)), sec: p.sec ?? null, sec2: p.sec2 ?? null }; });
    m.T = T;
    const dev = doorEvents(m), yIn = dev.find((e) => e.p === Y && e.kind === 'in');
    const xLast = ppl[X].t0 + Math.max(...ppl[X].ev.filter((e) => ['out', 'pass', 'show'].includes(e.kind)).map((e) => e.t));
    if (!(yIn.t < xLast - 0.3)) { _genStats['s:look'] = (_genStats['s:look'] || 0) + 1; continue; }
    return m;
  }
  return fail('schedule');
}
