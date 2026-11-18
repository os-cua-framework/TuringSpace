import { mulberry32, R } from '../core/rng.js';
import * as W from './_cat_hide_where_scene.js';
const { RT, VIEW } = W;

export const NAME = 'cat_hide_where';
const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
export const GATE = {
  T: [8, 12], hold: [0.8, 1.5], dt: 0.05,
  seen: 0.15,
  hid: 0.12,
  clear: 0.45,
  passMin: 1.0,
  dipMax: 0.8,
  passAlone: 0.35,
  firstWalk: 1.2,
  finalVis: 2.2,
  finalVisFrac: 0.3,
  endHidden: 1.2,
  restAloneB: 0.4,
  nearDepth: 0.6,
  overA: 0.15,
  overWin: 1.5,
  touchPx: 6, touchWin: 0.5,
  nearShare: 0.6,
  nearWin: 2.0,
  vanishFarA: 0.45,
  vanishNearB: 0.4,
  cabRatio: 1.1,
  pieceVis: 0.4, pieceArea: 500, margin: 4,
  readerOk: 0.8,
  readerWin: 2.0,
};

function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
export { mix32 };
function corners(F, g) {
  const hw = F.w / 2 + g, hd = F.d / 2 + g;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => W.fromLocal(F, u, v));
}
function rectsOverlap(A, gA, B, gB) {
  const ca = corners(A, gA), cb = corners(B, gB);
  for (const poly of [ca, cb]) for (let i = 0; i < 4; i++) {
    const p = poly[i], q = poly[(i + 1) % 4], nx = -(q[1] - p[1]), nz = q[0] - p[0];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const c of ca) { const d = c[0] * nx + c[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const c of cb) { const d = c[0] * nx + c[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}
const strips = (F) => {
  const S = W.strip(F), u = (S.u0 + S.u1) / 2, v = (S.v0 + S.v1) / 2, [x, z] = W.fromLocal(F, u, v);
  return { x, z, yaw: F.yaw, w: S.u1 - S.u0, d: S.v1 - S.v0 };
};
export const _genStats = {};
export const _lastFail = {};
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };

function dims(rng, kind) {
  const U = rng.uniform;
  switch (kind) {
    case 'cabinet': return { w: U(1.25, 1.5), d: U(0.55, 0.62), h: U(2.04, 2.2) };
    case 'sofa': { const h = U(0.8, 0.88); return { w: U(1.6, 1.9), d: U(0.84, 0.92), h, seat: U(0.42, 0.45), arm: U(0.16, 0.2), backT: U(0.18, 0.22), armH: U(0.58, 0.64) }; }
    case 'armchair': { const h = U(0.94, 1.06); return { w: U(0.9, 1.02), d: U(0.82, 0.9), h, seat: U(0.42, 0.45), arm: U(0.15, 0.18), backT: U(0.17, 0.2), armH: U(0.6, 0.66) }; }
    case 'box': return { w: U(0.64, 0.8), d: U(0.52, 0.64), h: U(0.6, 0.7) };
    case 'curtain': { const fold = U(0.045, 0.055); return { w: U(0.72, 0.95), d: 2 * fold, h: U(2.05, 2.2), fold }; }
    case 'table': return { w: U(0.86, 1.1), d: U(0.7, 0.84), h: U(0.72, 0.76) };
    default: throw new Error(kind);
  }
}
function lookOf(rng, kind, used) {
  const n = W.LOOKS[kind].length, free = [...Array(n).keys()].filter((i) => !used.includes(`${kind}:${i}`));
  const i = free.length ? free[Math.floor(rng.raw() * free.length)] : Math.floor(rng.raw() * n);
  used.push(`${kind}:${i}`);
  return i;
}
function onWall(F, wall, a, gap) {
  F.wall = wall; F.gap = r3(gap);
  if (wall === 'z') { F.yaw = 0; F.x = r3(a); F.z = r3(gap + F.d / 2); } else { F.yaw = 90; F.z = r3(a); F.x = r3(gap + F.d / 2); }
  return F;
}
function wallRange(cam, wall) {
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a <= 6; a += 0.05) {
    const p = wall === 'z' ? cam.project(a, 0, 0) : cam.project(0, 0, a);
    if (p.z > 0 && p.x > 20 && p.x < VIEW.w - 20 && p.y > 0 && p.y < VIEW.h) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
  }
  return lo < hi ? [lo, hi] : null;
}

function tryBuild(rng, plan) {
  const U = rng.uniform, pick = (a) => a[Math.floor(rng.raw() * a.length)];
  const m = {
    task: NAME, board: { w: VIEW.w, h: VIEW.h + 4 }, live: true,
    cam: { az: r2(U(28, 62)), el: r2(U(30, 37)), dist: r2(U(6.0, 6.6)), fov: 43, tx: r3(U(1.9, 2.3)), ty: 0.65, tz: r3(U(1.9, 2.3)) },
    light: {}, room: {}, furn: [], cat: {}, route: null, answer: -1, passes: [], nearA: -1,
  };
  { const sl = U(-0.9, 0.9), a = m.cam.az * DEG; m.cam.tx = r3(m.cam.tx + sl * Math.cos(a)); m.cam.tz = r3(m.cam.tz - sl * Math.sin(a)); }
  m.light = { az: r2(m.cam.az + U(-35, 35)), el: r2(U(46, 58)) };
  const cam = W.camOf(m);
  const room = m.room;
  room.floor = Math.floor(rng.raw() * W.FLOORS.length); room.floorRot = rng.raw() < 0.5;
  room.wall = W.WALLS[Math.floor(rng.raw() * W.WALLS.length)];
  const used = [], ranges = { z: wallRange(cam, 'z'), x: wallRange(cam, 'x') };
  if (!ranges.z || !ranges.x) return fail('wallrange');
  const furn = [];
  const fits = (F, grow = 0.28) => {
    for (const c of corners(F, 0)) if (c[0] < -1e-6 || c[1] < -1e-6) { fail('fit:wall:' + F.kind); return false; }
    for (const c of corners(F, 0.02)) for (const y of [0, F.h + 0.04]) { const q = cam.project(c[0], y, c[1]); if (!(q.z > 0) || q.x < 6 || q.y < 6 || q.x > VIEW.w - 6 || q.y > VIEW.h - 6) { fail('fit:frame:' + F.kind); return false; } }
    for (const G of furn) {
      if (rectsOverlap(F, grow, G, 0)) { fail('fit:G:' + F.kind + '/' + G.kind); return false; }
      if (W.HIDERS.includes(G.kind) && rectsOverlap(F, 0.12, strips(G), 0)) { fail('fit:Gs:' + F.kind + '/' + G.kind); return false; }
      if (W.HIDERS.includes(F.kind) && rectsOverlap(strips(F), 0.12, G, 0)) { fail('fit:Fs:' + F.kind + '/' + G.kind); return false; }
    }
    return true;
  };
  const wallPiece = (kind, gap, wallPref = null, grow = 0.28) => {
    for (let k = 0; k < 30; k++) {
      const wall = wallPref || (rng.raw() < 0.5 ? 'z' : 'x'), [lo, hi] = ranges[wall], D = dims(rng, kind);
      const F = onWall({ kind, ...D, look: lookOf(rng, kind, used) }, wall, 0, typeof gap === 'function' ? gap() : gap);
      const a = U(lo + F.w / 2 - 0.3, hi - F.w / 2 + 0.3);
      onWall(F, wall, a, F.gap);
      if (fits(F, grow)) return F;
    }
    return null;
  };
  const freePiece = (kind, at = null, yaw = null, faceCam = false) => {
    for (let k = 0; k < 30; k++) {
      const D = dims(rng, kind);
      let x, z;
      if (at) { [x, z] = at(); } else {
        const p = RT.planeAtPixel(cam, U(50, VIEW.w - 50), U(150, VIEW.h - 50), 0); if (!p) continue; x = p.x; z = p.z;
      }
      const F = { kind, ...D, look: lookOf(rng, kind, used), x: r3(x), z: r3(z), wall: null, gap: 0.4 };
      const e = cam.eye;
      F.yaw = r2(yaw != null ? yaw : faceCam ? W.yawOf(e[0] - x, e[2] - z) + U(-15, 15) : (rng.raw() < 0.5 ? 0 : 90) + U(-15, 15));
      if (fits(F)) return F;
    }
    return null;
  };
  const aKinds = ['box', 'armchair', 'table'].filter((k) => k !== plan.bKind);
  const aKind = pick(aKinds), e = cam.eye;
  let B = null, A = null, AP = null, endSign = rng.raw() < 0.5 ? -1 : 1, vmB = 0;
  const camSide = (F) => { const ux = W.fromLocal(F, 1, 0), o = W.fromLocal(F, 0, 0); return Math.sign((ux[0] - o[0]) * (e[0] - F.x) + (ux[1] - o[1]) * (e[2] - F.z)) || 1; };
  const endOk = (F, es) => { const p = W.fromLocal(F, es * (F.w / 2 + 0.3), 0), q = cam.project(p[0], 0, p[1]); return q.x > 70 && q.x < VIEW.w - 70; };
  const cells = [[30, 150], [130, 250], [230, 350]], cc = cells[plan.cell ?? 1];
  const [cx0, cx1] = plan.flip ? [VIEW.w - cc[1], VIEW.w - cc[0]] : cc;
  const inCell = (F) => { if (plan.cell == null) return true; const q = cam.project(F.x, F.h / 2, F.z); return q.x >= cx0 && q.x <= cx1; };
  for (let kb = 0; kb < 16 && !A; kb++) {
    furn.length = 0;
    const wallB = plan.bKind === 'curtain' || (plan.wallB ?? (rng.raw() < (plan.bKind === 'sofa' ? 0.5 : 0.4)));
    const gapB = plan.bKind === 'curtain' ? () => U(0.2, 0.26) : plan.bKind === 'sofa' ? () => U(0.32, 0.46) : () => U(0.34, 0.52);
    B = null;
    if (wallB) {
      for (let k = 0; k < 30 && !B; k++) { const F = wallPiece(plan.bKind, gapB); if (F && endOk(F, camSide(F)) && inCell(F)) B = F; }
    } else {
      B = freePiece(plan.bKind, () => { const p = RT.planeAtPixel(cam, U(Math.max(80, cx0), Math.min(VIEW.w - 80, cx1)), U(150, 260), 0); return p ? [p.x, p.z] : [1.5, 1.5]; }, null, true);
      if (B && !inCell(B)) B = null;
    }
    if (!B) continue;
    if (wallB) endSign = camSide(B);
    furn.push(B);
    const SB = W.strip(B);
    vmB = B.kind === 'table' ? -B.d / 2 - Math.min(0.35, B.gap ?? 0.35) / 2 : (SB.v0 + SB.v1) / 2;
    for (let k = 0; k < 16 && !A; k++) {
      const es = B.wall ? endSign : (k % 2 ? -endSign : endSign);
      const ap = U(0.0, 0.3), P = W.fromLocal(B, es * (B.w / 2 + 0.2 + ap), vmB);
      const dh = Math.hypot(e[0] - P[0], e[2] - P[1]), cd = [(e[0] - P[0]) / dh, (e[2] - P[1]) / dh], pp = [-cd[1], cd[0]];
      const inB = W.fromLocal(B, -es, vmB), o = W.fromLocal(B, 0, vmB), inSg = Math.sign((inB[0] - o[0]) * pp[0] + (inB[1] - o[1]) * pp[1]) || 1;
      const D = dims(rng, aKind), yOcc = U(0.14, 0.3), sAl = (D.h - yOcc) / (e[1] - yOcc), Dp = sAl * dh;
      const lat = inSg * (B.wall ? U(0.08, 0.3) : U(-0.55, 0.2)) * D.w, c = Dp + D.d / 2;
      const F = { kind: aKind, ...D, look: lookOf(rng, aKind, used), x: r3(P[0] + cd[0] * c + pp[0] * lat), z: r3(P[1] + cd[1] * c + pp[1] * lat), wall: null, gap: 0.4,
        yaw: r2(W.yawOf(cd[0], cd[1]) + U(-12, 12)) };
      if (fits(F, 0.24)) { A = F; AP = { ap: r3(ap), x: P[0], z: P[1] }; endSign = es; }
    }
  }
  if (!B) return fail('B');
  if (!A) return fail('A');
  furn.push(A);
  const cab = wallPiece('cabinet', 0.004, null, 0.14); if (!cab) return fail('cab');
  furn.push(cab);
  const coats = W.COATS.map((_, i) => i).filter((i) => W.coatContrast(i, room.floor) >= 0.28);
  m.cat = { coat: pick(coats), k: r3(U(1.15, 1.28)), swayPh: r2(U(0, 6.28)) };
  const restKinds = [...rng.shuffle(['sofa', 'curtain'].filter((k) => k !== plan.bKind)), ...rng.shuffle(W.HIDERS.filter((k) => k !== plan.bKind && k !== aKind && k !== 'sofa' && k !== 'curtain'))];
  const placeKind = (kind, extraOk = null, wallFirst = false) => {
    let F = null;
    for (let k = 0; k < 4 && !F; k++) {
      F = kind === 'curtain' ? wallPiece('curtain', () => U(0.2, 0.26)) : (wallFirst && k < 2) || rng.raw() < 0.7 ? wallPiece(kind, () => (kind === 'sofa' ? U(0.32, 0.46) : U(0.34, 0.52)))
        : freePiece(kind, () => { const p = RT.planeAtPixel(cam, U(50, VIEW.w - 50), U(120, VIEW.h - 60), 0); return p ? [p.x, p.z] : [1.5, 1.5]; });
      if (F && extraOk && !extraOk(F)) F = null;
    }
    return F;
  };
  if (plan.n > 6) restKinds.push(...rng.shuffle(W.HIDERS.slice()), ...rng.shuffle(W.HIDERS.slice()));
  let P2 = null;
  if (plan.np === 2) { P2 = placeKind(restKinds.shift()); if (!P2) return fail('P2'); furn.push(P2); }
  const base = furn.slice();
  let done = false;
  for (let r = 0; r < 6 && !done; r++) {
    furn.length = 0; furn.push(...base); m.furn = furn;
    if (!buildRoute(rng, m, cam, B, A, P2, endSign, AP)) continue;
    const path = W.routeSamples(m), clearOfPath = (F) => { for (let i = 0; i < path.N; i += 3) if (W.inFootprint(F, path.xs[i], path.zs[i], 0.3)) return false; return true; };
    for (let d = 0; d < 3 && !done; d++) {
      furn.length = base.length;
      for (const kind of restKinds) {
        if (furn.length >= plan.n) break;
        const F = placeKind(kind, clearOfPath, furn.length === base.length);
        if (!F) { fail('fill:' + kind); continue; }
        furn.push(F);
      }
      done = furn.length === plan.n;
    }
  }
  if (!done) return fail('route/fill');
  const order = rng.shuffle(furn.map((_, i) => i));
  m.furn = order.map((i) => furn[i]);
  const idOf = (F) => m.furn.indexOf(F);
  m.answer = idOf(B); m.nearA = idOf(A); m.cabinet = idOf(cab);
  m.passes = P2 ? [idOf(P2), idOf(A)] : [idOf(A)];
  for (const F of m.furn) {
    if (F.kind === 'table') { F.check = rng.raw() < 0.4; if (rng.raw() < 0.6) { F.bowl = [r3(U(-0.2, 0.2) * F.w), r3(U(-0.2, 0.2) * F.d)]; F.bowlC = pick(['#e9e4d8', '#3d6fb6', '#c8643c', '#2f8a6a']); } }
    for (const k of Object.keys(F)) if (typeof F[k] === 'number') F[k] = r3(F[k]);
  }
  const cur = m.furn.find((F) => F.kind === 'curtain');
  if (cur) {
    const a = cur.wall === 'z' ? cur.x : cur.z, side = rng.raw() < 0.5 ? -1 : 1, ww = U(1.0, 1.3);
    const c0 = a - side * cur.w * U(0.1, 0.3);
    room.window = { wall: cur.wall, a0: r3(Math.min(c0, c0 + side * ww)), a1: r3(Math.max(c0, c0 + side * ww)), y0: r2(U(0.82, 0.95)), y1: r2(U(1.95, 2.1)) };
  }
  if (rng.raw() < 0.6) {
    const p = RT.planeAtPixel(cam, U(120, 260), U(250, 330), 0);
    if (p) room.rug = { x: r3(p.x), z: r3(p.z), yaw: r2(U(-10, 10) + (rng.raw() < 0.5 ? 0 : 90)), hw: r3(U(0.7, 1.0)), hd: r3(U(0.5, 0.75)), c0: pick(['#7c4a3a', '#38506b', '#5d6b4a', '#8a7a62']), c1: pick(['#c9a46a', '#d8cdb8', '#b5643c', '#9fb0c0']) };
  }
  return m;
}

function stripPath(F, from, inset = 0.2, near = null) {
  const S = W.strip(F), vm = F.kind === 'table' ? -F.d / 2 - Math.min(0.35, F.gap ?? 0.35) / 2 : (S.v0 + S.v1) / 2;
  const a = W.fromLocal(F, S.u0 - inset, vm), b = W.fromLocal(F, S.u1 + inset, vm), c = W.fromLocal(F, (S.u0 + S.u1) / 2, vm);
  const ref = near || from;
  const da = Math.hypot(a[0] - ref[0], a[1] - ref[1]), db = Math.hypot(b[0] - ref[0], b[1] - ref[1]);
  return da <= db ? [a, c, b] : [b, c, a];
}
function segClear(m, a, b, skip, rad = 0.13) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.05));
  for (let i = 0; i <= n; i++) {
    const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
    if (x < rad || z < rad) return false;
    for (let j = 0; j < m.furn.length; j++) if (!skip.has(j) && W.inFootprint(m.furn[j], x, z, rad)) return false;
  }
  return true;
}
function buildRoute(rng, m, cam, B, A, P2, endSign, AP) {
  const U = rng.uniform;
  const vOpen = U(0.42, 0.56), vSneak = vOpen * U(0.68, 0.82);
  const aEnd = stripPath(A, [AP.x, AP.z], 0.2, [AP.x, AP.z])[0], fx = cam.project(aEnd[0], 0, aEnd[1]).x;
  const side = rng.raw() < 0.8 ? (fx < VIEW.w / 2 ? -1 : 1) : (fx < VIEW.w / 2 ? 1 : -1);
  let ep = null, inward = null;
  for (let k = 0; k < 6 && !ep; k++) {
    const sy = U(0.6, 0.9) * VIEW.h;
    const e = RT.planeAtPixel(cam, side < 0 ? 8 : VIEW.w - 8, sy, 0), w = RT.planeAtPixel(cam, side < 0 ? U(55, 110) : VIEW.w - U(55, 110), sy + U(-25, 15), 0);
    if (e && w && e.x > 0.15 && e.z > 0.15) { ep = e; inward = w; }
  }
  if (!ep) return fail('entry');
  const wp = [{ p: [ep.x, ep.z] }];
  const add = (p, v, o = {}) => wp.push({ p, v, ...o });
  const vIn = vOpen * U(1.0, 1.2);
  if (rng.raw() < 0.5) add([inward.x, inward.z], vIn, { entry: true });
  const idOf = (F) => m.furn.indexOf(F);
  for (const F of P2 ? [P2, A] : [A]) {
    const [a, c, b] = stripPath(F, wp[wp.length - 1].p, 0.2, F === A ? [AP.x, AP.z] : null);
    if (F === A) {
      const prev = wp[wp.length - 1].p, [ua] = W.toLocal(A, a[0], a[1]), [up, vp] = W.toLocal(A, prev[0], prev[1]);
      const front = (sg) => W.fromLocal(A, sg * (A.w / 2 + U(0.3, 0.5)), A.d / 2 + U(0.3, 0.55));
      if (Math.sign(up) !== Math.sign(ua) && vp < A.d / 2 + 0.3) add(front(Math.sign(up)), vIn, { entry: true });
      if (Math.sign(up) !== Math.sign(ua) || Math.abs(up) < A.w / 2 + 0.2) add(front(Math.sign(ua)), vIn, { entry: true });
    }
    add(a, vIn, { entry: true }); add(c, vSneak, { pause: r2(U(0.5, 1.0)), fixed: true }); add(b, vSneak, { fixed: true });
  }
  const last = wp[wp.length - 1].p, [ul] = W.toLocal(A, last[0], last[1]);
  const APl = W.toLocal(A, AP.x, AP.z);
  const qs = [];
  for (const lo of [0.45, 0.6, 0.8]) for (const dv of [0, 0.15, 0.3]) qs.push(W.fromLocal(A, Math.sign(ul) * (A.w / 2 + lo + U(-0.05, 0.05)), Math.max(APl[1] + dv + U(-0.05, 0.05), -A.d / 2 - 0.45)));
  const qOk = (q) => segClear(m, last, q, new Set(), 0.085) && segClear(m, q, [AP.x, AP.z], new Set(), 0.085);
  const q = rng.shuffle(qs).find(qOk) || qs[0];
  add(q, vOpen, rng.raw() < 0.5 ? { pause: r2(U(0.3, 0.7)) } : {});
  const vApp = vOpen * U(0.72, 0.85);
  if (AP.ap > 0.2) add([AP.x, AP.z], vApp, { fixed: true });
  const S = W.strip(B), idB = idOf(B);
  let vm = (S.v0 + S.v1) / 2;
  if (B.kind === 'table') {
    vm = -B.d / 2 - Math.min(0.35, B.gap ?? 0.35) / 2;
    add(W.fromLocal(B, endSign * (B.w / 2 + 0.22), vm), vApp, { fixed: true });
    add(W.fromLocal(B, endSign * U(0.0, 0.25) * B.w, vm), vSneak, { into: idB, fixed: true });
    add(W.fromLocal(B, endSign * U(0.0, 0.18) * B.w, U(-0.12, 0.08)), vSneak * 0.8, { into: idB, fixed: true });
  } else {
    add(W.fromLocal(B, endSign * (B.w / 2 + 0.2), vm), vApp, { fixed: true });
    const inner = Math.max(0.32, Math.min(B.w - 0.22, B.w * U(0.42, 0.62)));
    add(W.fromLocal(B, endSign * (B.w / 2 - inner), vm), vSneak, { into: idB, fixed: true });
  }
  const clear = (i) => segClear(m, wp[i].p, wp[i + 1].p, new Set(wp[i + 1].into != null ? [wp[i + 1].into] : []), i === 0 ? 0.0 : 0.085);
  let detours = 0;
  for (let i = 0; i < wp.length - 1; i++) {
    if (clear(i)) continue;
    if (wp[i + 1].fixed && wp[i].fixed) { _lastFail.wp = wp; _lastFail.i = i; _lastFail.m = m; return fail('route:fixed'); }
    const a = wp[i].p, b = wp[i + 1].p, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    let ok = false, half = null;
    for (const off of [0.35, -0.35, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6]) {
      const mid = [(a[0] + b[0]) / 2 + n[0] * off, (a[1] + b[1]) / 2 + n[1] * off];
      if (mid[0] < 0.15 || mid[1] < 0.15) continue;
      wp.splice(i + 1, 0, { p: mid, v: wp[i + 1].v, entry: wp[i + 1].entry });
      if (clear(i) && clear(i + 1)) { ok = true; break; }
      if (!half && clear(i)) half = mid;
      wp.splice(i + 1, 1);
    }
    if (!ok && half && detours < 3) { wp.splice(i + 1, 0, { p: half, v: wp[i + 1].v, entry: wp[i + 1].entry }); ok = true; }
    if (!ok || ++detours > 4) { _lastFail.wp = wp; _lastFail.i = i; _lastFail.m = m; return fail('route:' + i); }
  }
  const pts = wp.map((w) => [r3(w.p[0]), r3(w.p[1])]), v = wp.slice(1).map((w) => r3(w.v));
  const entryLeg = wp.slice(1).map((w) => !!w.entry);
  const pause = wp.map((w, i) => (w.pause ? [i, w.pause] : null)).filter(Boolean);
  m.route = { pts, v, pause, stride: r3(U(0.27, 0.31)), rr: 0.22 };
  let tEnd = W.arrivalT(m);
  const rest = U(1.35, 1.9), hiT = GATE.T[1] - 0.3, loT = GATE.T[0] + 0.3;
  for (let it = 0; it < 8 && tEnd + rest > hiT && entryLeg.some((e, i) => e && m.route.v[i] < 0.85); it++) {
    m.route = { ...m.route, v: m.route.v.map((x, i) => (entryLeg[i] ? r3(Math.min(0.85, x * 1.12)) : x)) };
    tEnd = W.arrivalT(m);
  }
  const want = Math.max(loT, Math.min(hiT, tEnd + rest)), paused = pause.reduce((a, x) => a + x[1], 0);
  if (Math.abs(want - (tEnd + rest)) > 1e-9) {
    const scale = (tEnd - paused) / Math.max(0.5, want - rest - paused);
    const nv = m.route.v.map((x, i) => r3(entryLeg[i] ? Math.min(0.85, x * scale) : x * scale));
    if (Math.max(...nv.filter((_, i) => !entryLeg[i])) > 0.75 || Math.min(...nv) < 0.26) { _lastFail.wp = wp; _lastFail.m = m; _lastFail.i = -1; _lastFail.tEnd = tEnd; return fail('speed'); }
    m.route = { ...m.route, v: nv };
    tEnd = W.arrivalT(m);
  }
  m.T = r3(tEnd + rest);
  if (m.T < GATE.T[0] || m.T > GATE.T[1]) return fail('T');
  m.tRest = r3(tEnd);
  return true;
}

const AN = new WeakMap();
export function analyse(m) {
  let a = AN.get(m);
  if (a) return a;
  const dt = GATE.dt, n = Math.floor(m.T / dt + 1e-9) + 1, bit = (j) => 1 << j;
  const ts = [], vf = [], vfNoA = [], vfNoB = [], vfNoCab = [], blkA = [], cen = [], pos = [];
  const noPass = m.passes.map(() => []);
  for (let i = 0; i < n; i++) {
    const t = r3(i * dt), pose = W.catPose(m, t), pr = W.probeAt(m, t, pose);
    ts.push(t); vf.push(W.visFrac(pr)); vfNoA.push(W.visFrac(pr, bit(m.nearA))); vfNoB.push(W.visFrac(pr, bit(m.answer)));
    vfNoCab.push(W.visFrac(pr, bit(m.cabinet))); blkA.push(W.blockedBy(pr, m.nearA)); cen.push(W.visCentroid(pr)); pos.push([pose.x, pose.z, pose.yaw]);
    m.passes.forEach((p, k) => noPass[k].push(W.visFrac(pr, bit(p))));
  }
  const runs = [], H = GATE.hid;
  for (let i = 0; i < n;) { if (vf[i] > H) { i++; continue; } let j = i; while (j + 1 < n && vf[j + 1] <= H) j++; runs.push([ts[i], ts[j], i, j]); i = j + 1; }
  let iv = -1; for (let i = 0; i < n; i++) if (vf[i] >= GATE.seen) iv = i;
  a = { ts, vf, vfNoA, vfNoB, vfNoCab, blkA, cen, pos, noPass, runs, iv, tv: iv >= 0 ? ts[iv] : null, n };
  AN.set(m, a);
  return a;
}

const SCR = new WeakMap();
export function screenInfo(m) {
  let s = SCR.get(m);
  if (s) return s;
  const sc = W.furnitureScene(m);
  s = m.furn.map((_, i) => {
    const st = RT.objectStats(sc, i, 2, true, true);
    const box = (() => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const P = st.pix || []; for (let k = 0; k < P.length; k += 2) { x0 = Math.min(x0, P[k]); x1 = Math.max(x1, P[k]); y0 = Math.min(y0, P[k + 1]); y1 = Math.max(y1, P[k + 1]); } return [x0, y0, x1, y1]; })();
    return { pix: st.pix || [], vis: st.vis * 4, area: st.area * 4, frac: st.frac, pt: st.pt, abox: st.box, box };
  });
  SCR.set(m, s);
  return s;
}
export function pieceDepth(m, j) {
  const cam = W.camCached(m), F = m.furn[j];
  let best = Infinity;
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const [x, z] = W.fromLocal(F, u * F.w / 2, v * F.d / 2), p = cam.project(x, F.h / 2, z);
    best = Math.min(best, p.z);
  }
  return best;
}
export function screenNearest(m, c) {
  const S = screenInfo(m);
  const d = S.map((s) => { let b = Infinity; const P = s.pix; for (let k = 0; k < P.length; k += 2) { const q = (P[k] - c[0]) ** 2 + (P[k + 1] - c[1]) ** 2; if (q < b) b = q; } return Math.sqrt(b); });
  const dmin = Math.min(...d);
  const near = d.map((x, j) => [x, j]).filter(([x]) => x <= dmin + 3).map(([, j]) => j);
  near.sort((a, b) => pieceDepth(m, a) - pieceDepth(m, b));
  return { id: near[0], d };
}
export function touchPx(m, tau, j) {
  const pr = W.probeAt(m, tau), P = screenInfo(m)[j].pix;
  let b = Infinity;
  for (let i = 0; i < pr.n; i++) {
    if (pr.masks[i] !== 0) continue;
    const x = pr.pts2[2 * i], y = pr.pts2[2 * i + 1];
    for (let k = 0; k < P.length; k += 2) { const q = (P[k] - x) ** 2 + (P[k + 1] - y) ** 2; if (q < b) b = q; }
  }
  return Math.sqrt(b);
}
export function screenBoxPiece(m, c) {
  const S = screenInfo(m), inside = [];
  const dist = S.map((s, j) => { const b = s.box, dx = Math.max(b[0] - c[0], 0, c[0] - b[2]), dy = Math.max(b[1] - c[1], 0, c[1] - b[3]); if (!dx && !dy) inside.push(j); return Math.hypot(dx, dy); });
  if (inside.length) return inside.sort((a, b) => pieceDepth(m, a) - pieceDepth(m, b))[0];
  return dist.indexOf(Math.min(...dist));
}
export function aimReading(m, p, yawDeg) {
  const h = W.headingVec(yawDeg);
  let best = -1, bc = Infinity;
  m.furn.forEach((F, j) => {
    if (F.kind === 'cabinet') return;
    const S = W.strip(F), [u, v] = W.toLocal(F, p[0], p[1]);
    const cu = Math.max(S.u0, Math.min(S.u1, u)), cv = Math.max(S.v0, Math.min(S.v1, v)), q = W.fromLocal(F, cu, cv);
    const dx = q[0] - p[0], dz = q[1] - p[1], d = Math.hypot(dx, dz);
    let cost;
    if (d < 0.03) cost = 0;
    else {
      const th = Math.acos(Math.max(-1, Math.min(1, (dx * h[0] + dz * h[1]) / d))) * 180 / Math.PI;
      if (th > 75) return;
      cost = th / 30 + d / 1.0;
    }
    if (cost < bc) { bc = cost; best = j; }
  });
  return best >= 0 ? best : nearestStrip(m, p);
}
export function nearestStrip(m, p) {
  let best = -1, bd = Infinity;
  m.furn.forEach((F, j) => { if (F.kind === 'cabinet') return; const d = W.stripDist(F, p[0], p[1]); if (d < bd) { bd = d; best = j; } });
  return best;
}

export function gateProblem(m, opts = {}) {
  const errs = [], bad = (r) => { if (!errs.includes(r)) errs.push(r); return !opts.all; };
  const G = GATE, an = analyse(m), { ts, vf, n } = an, B = m.furn[m.answer], A = m.furn[m.nearA];
  if (!(m.T >= G.T[0] - 1e-9 && m.T <= G.T[1] + 1e-9)) { if (bad('T')) return errs[0]; }
  if (!(m.hold >= G.hold[0] - 1e-9 && m.hold <= G.hold[1] + 1e-9)) { if (bad('hold')) return errs[0]; }
  if (B.kind === 'cabinet' || m.passes.includes(m.answer) || m.furn[m.cabinet].kind !== 'cabinet' || m.furn.filter((F) => F.kind === 'cabinet').length !== 1) { if (bad('roles')) return errs[0]; }
  if (m.passes[m.passes.length - 1] !== m.nearA) { if (bad('roles:A')) return errs[0]; }
  {
    const pr0 = W.probeAt(m, 0); let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < pr0.n; i++) { x0 = Math.min(x0, pr0.pts2[2 * i]); x1 = Math.max(x1, pr0.pts2[2 * i]); }
    if (!(vf[0] > 0.1) || !(x0 < 4 || x1 > VIEW.w - 4)) { if (bad('entry:0')) return errs[0]; }
  }
  if (!vf.slice(0, Math.round(1 / G.dt)).some((x) => x >= G.clear)) { if (bad('entry:in')) return errs[0]; }
  if (an.iv < 0) return opts.all ? ['never'] : 'never';
  const tv = an.tv;
  const runs = an.runs.filter((r) => r[1] < tv - 1e-9);
  const long = runs.filter((r) => r[1] - r[0] + G.dt >= G.passMin);
  if (long.length !== m.passes.length) { if (bad('pass:count')) return errs[0]; }
  const t1st = long.length ? long[0][0] : Infinity;
  if (runs.some((r) => !long.includes(r) && r[1] - r[0] + G.dt > (r[0] > t1st ? G.dipMax : 0.25))) { if (bad('pass:extra')) return errs[0]; }
  if (!long.length) return opts.all ? errs : errs[0];
  for (let k = 0; k < Math.min(long.length, m.passes.length); k++) {
    const [, , i0, i1] = long[k], F = m.furn[m.passes[k]], mid = (i0 + i1) >> 1;
    if (!(an.noPass[k][mid] >= G.passAlone)) { if (bad('pass:alone')) return errs[0]; }
    const p = an.pos[mid]; if (W.stripDist(F, p[0], p[1]) > 0.3) { if (bad('pass:where')) return errs[0]; }
    const pre = vf.slice(Math.max(0, i0 - Math.round(1.2 / G.dt)), i0), post = vf.slice(i1 + 1, Math.min(n, i1 + 1 + Math.round(1.2 / G.dt)));
    if (!pre.some((x) => x >= G.clear) || !post.some((x) => x >= G.clear)) { if (bad('pass:out')) return errs[0]; }
  }
  if (long[0][0] < G.firstWalk) { if (bad('firstwalk')) return errs[0]; }
  const iE = long[long.length - 1][3] + 1;
  let visT = 0; for (let i = iE; i <= an.iv; i++) if (vf[i] >= G.finalVisFrac) visT += G.dt;
  if (visT < G.finalVis) { if (bad('final:short')) return errs[0]; }
  const tLie = m.tRest + W.LIE_T;
  for (let i = an.iv + 1; i < n; i++) { if (ts[i] >= tLie - 1e-9 && vf[i] > 0) { if (bad('final:peek')) return errs[0]; } }
  if (m.T - tv < G.endHidden || m.T - tLie < 0.6) { if (bad('final:end')) return errs[0]; }
  const iR = n - 1;
  if (vf[iR] !== 0 || an.vfNoA[iR] !== 0) { if (bad('rest:A')) return errs[0]; }
  if (!(an.vfNoB[iR] >= G.restAloneB)) { if (bad('rest:B')) return errs[0]; }
  for (let i = 0; i < n; i++) if (an.vfNoCab[i] !== vf[i]) { if (bad('cab:hides')) return errs[0]; }
  if (!an.cen[an.iv]) return opts.all ? [...errs, 'vanish:cen'] : 'vanish:cen';
  let nA = 0, nT = 0;
  for (let i = Math.max(iE, an.iv - Math.round(G.nearWin / G.dt)); i <= an.iv; i++) { if (vf[i] < G.seen || !an.cen[i]) continue; nT++; if (screenNearest(m, an.cen[i]).id === m.nearA) nA++; }
  if (!nT || nA / nT < G.nearShare) { if (bad('trap:near')) return errs[0]; }
  let ov = 0; for (let i = Math.max(0, an.iv - Math.round(G.overWin / G.dt)); i <= an.iv; i++) ov = Math.max(ov, an.blkA[i]);
  if (ov < G.overA) { if (bad('trap:overlap')) return errs[0]; }
  let touch = Infinity; for (let i = Math.max(0, an.iv - Math.round(G.touchWin / G.dt)); i <= an.iv; i++) touch = Math.min(touch, touchPx(m, an.ts[i], m.nearA));
  if (touch > G.touchPx) { if (bad('trap:touch')) return errs[0]; }
  const cam = W.camCached(m), pv = an.pos[an.iv], dCat = cam.project(pv[0], 0.15, pv[1]).z;
  if (dCat - pieceDepth(m, m.nearA) < G.nearDepth) { if (bad('trap:depth')) return errs[0]; }
  if (W.stripDist(A, pv[0], pv[1]) < G.vanishFarA) { if (bad('trap:farA')) return errs[0]; }
  if (W.stripDist(B, pv[0], pv[1]) > G.vanishNearB) { if (bad('trap:nearB')) return errs[0]; }
  let ok = 0, tot = 0;
  for (let i = Math.max(iE, an.iv - Math.round(G.readerWin / G.dt)); i <= an.iv; i++) { if (vf[i] < G.finalVisFrac) continue; tot++; if (aimReading(m, an.pos[i], an.pos[i][2]) === m.answer) ok++; }
  if (!tot || ok / tot < G.readerOk) { if (bad('reader')) return errs[0]; }
  const S = screenInfo(m);
  for (const s of S) {
    if (!s.pt || s.frac < G.pieceVis || s.vis < G.pieceArea) { if (bad('piece:vis')) return errs[0]; }
    const b = s.abox; if (!b || b[0] < G.margin || b[1] < G.margin || b[2] > VIEW.w - G.margin || b[3] > VIEW.h - G.margin) { if (bad('piece:frame')) return errs[0]; }
  }
  const areas = S.map((s) => s.vis), ac = areas[m.cabinet], other = Math.max(...areas.filter((_, j) => j !== m.cabinet));
  if (!(ac >= G.cabRatio * other)) { if (bad('cab:size')) return errs[0]; }
  if (opts.pixels) { const px = restPixelDiff(m, 1) + restPixelDiff(m, 2); if (px > 0) { if (bad('rest:pixels')) return errs[0]; } }
  return opts.all ? errs : '';
}

export function restPixelDiff(m, q = 1) {
  const pose = W.catPose(m, m.T), sc1 = W.sceneAt(m, m.T, { pose }), sc0 = W.sceneAt(m, m.T, { noCat: true });
  const rc = patchRect(m, pose, 6);
  if (!rc) return 0;
  const a = RT.renderRect(sc1, q, rc), b = RT.renderRect(sc0, q, rc);
  let k = 0;
  for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) > 2 || Math.abs(a.data[i + 1] - b.data[i + 1]) > 2 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 2) k++;
  return k;
}
export function patchRect(m, pose, pad = 4) {
  const cam = W.camCached(m), C = W.sceneMats(m), L = C.light.dir, l = Math.hypot(...L), Ld = L.map((v) => v / l);
  const pts = W.catPoints(pose, m.cat.k);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => { const q = cam.project(p[0], p[1], p[2]); if (!(q.z > 0)) return; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
  for (const p of pts) {
    add(p);
    let t = p[1] / Ld[1];
    if (Ld[2] > 1e-6) t = Math.min(t, p[2] / Ld[2]);
    if (Ld[0] > 1e-6) t = Math.min(t, p[0] / Ld[0]);
    add([p[0] - Ld[0] * t, p[1] - Ld[1] * t, p[2] - Ld[2] * t]);
  }
  const k = m.cat.k, ext = 0.06 * k * cam.f / Math.max(1, cam.project(pose.x, 0.15, pose.z).z);
  x0 -= ext + pad; y0 -= ext + pad; x1 += ext + pad; y1 += ext + pad;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(VIEW.w, Math.ceil(x1)); y1 = Math.min(VIEW.h, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function generate(rng, knobs = {}) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0;
  const r0 = mulberry32(mix32(key, 0x5eed0000));
  const plan = { bKind: W.HIDERS[Math.floor(r0() * W.HIDERS.length)], n: r0() < 0.65 ? 5 : 6, np: 1 };
  if (plan.bKind === 'armchair') plan.n = 5;
  const hold = r3(0.8 + 0.7 * r0());
  const flip = r0() < 0.5;
  plan.flip = flip; plan.cell = Math.floor(r0() * 3);
  for (let a = 0; a < 100000; a++) {
    const m = tryBuild(R(mulberry32(mix32(key, a))), plan);
    if (!m) continue;
    m.hold = hold; m.flip = flip;
    const why = gateProblem(m, { pixels: true });
    if (why) { fail('g:' + why); continue; }
    finish(m);
    _genStats.ok = (_genStats.ok || 0) + 1;
    _genStats.attempts = (_genStats.attempts || 0) + a + 1;
    return m;
  }
  throw new Error('cat_hide_where: generator exhausted');
}
function finish(m) {
  const S = screenInfo(m), an = analyse(m);
  m.taps = S.map((s) => [r2(m.flip ? VIEW.w - s.pt[0] : s.pt[0]), r2(s.pt[1])]);
  const runs = an.runs.filter((r) => r[1] - r[0] + GATE.dt >= GATE.passMin && r[1] < an.tv);
  m.events = { passes: runs.map((r) => [r[0], r2(r[1] + GATE.dt)]), vanish: an.tv, rest: m.tRest };
}
export function _tryBuild(rng, plan) { return tryBuild(rng, plan); }
