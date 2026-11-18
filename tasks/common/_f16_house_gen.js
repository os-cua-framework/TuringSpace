import * as W from './_house_headcount_scene.js';
import { GATE, NAME, tracks, doorEvents, backEvents, doorRect, hiddenThere } from './_house_headcount_gen.js';
const RT = W.RT, VIEW = W.VIEW;
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

const boxIoS = (a, b) => {
  const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
};
export function checkLoose(m) {
  if (!m || m.task !== NAME || !Array.isArray(m.people)) return 'shape';
  if (!(m.T >= GATE.T[0] && m.T <= GATE.T[1]) || !(m.hold >= GATE.hold[0] - 1e-9 && m.hold <= GATE.hold[1] + 1e-9) || !m.live) return 'time';
  const P = m.people, N = P.length, roles = P.map((p) => p.role);
  const S = roles.filter((r) => r === 'stay').length, IO = roles.filter((r) => r === 'inout').length;
  const B = roles.filter((r) => r === 'back').length, F = roles.filter((r) => r === 'front').length;
  if (N < 4 || N > 8 || S < 1 || S > 4 || IO < 1 || IO > 2 || B < 1 || B > 2 || F > 1 || S + IO + B + F !== N || m.answer !== S) return 'counts';
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
export function overlapDoor(b, dr) {
  const ix = Math.min(b[2], dr[2]) - Math.max(b[0], dr[0]), iy = Math.min(b[3], dr[3]) - Math.max(b[1], dr[1]);
  return ix >= 0.3 * (dr[2] - dr[0]) && iy >= 0.1 * (dr[3] - dr[1]);
}
