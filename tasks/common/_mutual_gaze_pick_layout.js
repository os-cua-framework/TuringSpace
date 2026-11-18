import * as W from './_mutual_gaze_pick_scene.js';

const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
export const LAYOUT6 = { ringA: [1.4, 1.65], ringB: [1.8, 2.1], ringGap: 40, minSep: 1.1, sep: 28 };
export const LSTATS = {};
const lf = (k) => { LSTATS[k] = (LSTATS[k] || 0) + 1; };
export const LAYOUT = { xz: [0.7, 5.0], minSep: 1.3, ringA: [1.05, 1.3], ringB: [1.8, 2.2], ringGap: 56, maxSep: 3.7, pad: [10, 10], az: [28, 62], el: [17, 23], fMin: 0, bScreen: 16, psiMax: 12, bAng: 34, sep: 31.5, beyond: 1.1, dxMin: 40, stagBeta: 45, stagDepth: 1.0, looseBeta: 60, looseDepth: 0.8 };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function offPlane(eye, a, d, e) {
  const n = norm3(cross3(sub3(a, eye), sub3(d, eye)));
  return Math.asin(Math.min(1, Math.abs(dot3(norm3(sub3(e, a)), n)))) / DEG;
}
export function stagger(b, p, q) {
  const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  const beta = Math.acos(Math.min(1, Math.abs(dot3(norm3(sub3(q, p)), norm3(sub3(mid, b.eye)))))) / DEG;
  return { beta, dz: Math.abs(W.camNorm(b, p)[2] - W.camNorm(b, q)[2]) };
}
export const staggered = (b, p, q) => { const s = stagger(b, p, q); return s.beta <= LAYOUT.stagBeta && s.dz >= LAYOUT.stagDepth; };
export const staggeredLoose = (b, p, q) => { const s = stagger(b, p, q); return s.beta <= LAYOUT.looseBeta && s.dz >= LAYOUT.looseDepth; };

export function fitCamera(m) {
  const b = W.camBasis(m);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of W.fitPoints(m)) { const [u, v] = W.camNorm(b, p); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const [px, py] = LAYOUT.pad;
  const f = Math.min((W.VIEW.w - 2 * px) / (u1 - u0), (W.VIEW.h - 2 * py) / (v1 - v0));
  m.cam.f = r2(f);
  m.cam.cx = r2(W.VIEW.w / 2 - f * (u0 + u1) / 2);
  m.cam.cy = r2(W.VIEW.h / 2 - f * (v0 + v1) / 2);
  return f;
}

export function angAt(p, q, r) {
  const u = [q.x - p.x, q.z - p.z], v = [r.x - p.x, r.z - p.z];
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI;
}
export const lookOk = (ps, i, j, sep = LAYOUT.sep) => ps.every((q, k) => k === i || k === j || angAt(ps[i], ps[j], q) >= sep);
export function usablePairs(ps, sep = LAYOUT.sep) {
  const ok = (i, j) => lookOk(ps, i, j, sep);
  const out = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (ok(i, j) && ok(j, i)) out.push([i, j]);
  return out;
}

export function layout(rng, n, dis = false) {
  const U = rng.uniform;
  const LY = n >= 6 ? { ...LAYOUT, ...LAYOUT6 } : LAYOUT;
  const inRoom = (x, z) => x >= LAYOUT.xz[0] && x <= LAYOUT.xz[1] && z >= LAYOUT.xz[0] && z <= LAYOUT.xz[1];
  const cam = { az: r2(U(...LAYOUT.az)), el: r2(U(...LAYOUT.el)), dist: r2(U(7.5, 9)), target: [r3(U(2.5, 3.0)), 0.75, r3(U(2.5, 3.0))] };
  const b = W.camBasis({ cam }), Rh = W.yawOf([b.R[0], 0, b.R[2]]), Fh = [b.F[0], 0, b.F[2]];
  let people = null, trip = null, ring = null;
  for (let a = 0; a < 200 && !people; a++) {
    const ra = U(...LY.ringA), rb = U(...LY.ringB), c0 = cam.target, rot = U(0, 360), ps = [];
    const fh = W.yawOf([b.F[0], 0, b.F[2]]) + U(-40, 40), ax = W.yawVec(fh + 90), az = W.yawVec(fh), step = 360 / n;
    const gw = Array.from({ length: n }, () => -Math.log(Math.max(1e-9, rng.raw()))), gs = gw.reduce((p2, q2) => p2 + q2, 0);
    const phs = []; let acc = rot;
    if (n >= 6) {
      const small = [0, 1, 2].map(() => U(38, 54)), rest = 360 - small.reduce((p2, q2) => p2 + q2, 0), big = [0, 1, 2].map(() => 66 + (rest - 3 * 66) * gw[0 + 0] * 0);
      const w3 = [0, 1, 2].map(() => 0.3 + rng.raw()), ws = w3.reduce((p2, q2) => p2 + q2, 0);
      for (let k = 0; k < 3; k++) big[k] = 66 + (rest - 3 * 66) * w3[k] / ws;
      const arcs = []; for (let k = 0; k < 3; k++) arcs.push(small[k], big[k]);
      for (let k = 0; k < n; k++) { phs.push(acc); acc += arcs[k]; }
    } else
    for (let k = 0; k < n; k++) { phs.push(acc); acc += LY.ringGap + (360 - n * LY.ringGap) * gw[k] / gs; }
    void step;
    for (let k = 0; k < n; k++) {
      const ph = phs[k] * Math.PI / 180, j = U(0.92, 1.08);
      const u = Math.sin(ph) * ra * j, v = Math.cos(ph) * rb * j;
      ps.push({ x: r3(c0[0] + ax[0] * u + az[0] * v), z: r3(c0[2] + ax[2] * u + az[2] * v), k: r3(U(0.94, 1.06)) });
    }
    if (!ps.every((q) => inRoom(q.x, q.z))) { lf('room'); continue; }
    if (ps.some((p, i) => ps.some((q, j) => j > i && Math.hypot(p.x - q.x, p.z - q.z) < LY.minSep))) { lf('minSep'); continue; }
    let tab = null;
    if (n >= 6) {
      tab = new Float64Array(n * n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) {
        const ux = ps[j].x - ps[i].x, uz = ps[j].z - ps[i].z, lu = Math.sqrt(ux * ux + uz * uz);
        for (let k = 0; k < n; k++) if (k !== i && k !== j) {
          const vx = ps[k].x - ps[i].x, vz = ps[k].z - ps[i].z;
          tab[(i * n + j) * n + k] = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * Math.sqrt(vx * vx + vz * vz))))) * 180 / Math.PI;
        }
      }
    }
    const okAt = tab ? (i, j) => { for (let k = 0; k < n; k++) if (k !== i && k !== j && tab[(i * n + j) * n + k] < LY.sep) return false; return true; } : (i, j) => lookOk(ps, i, j, LY.sep);
    let both;
    if (tab) { both = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (okAt(i, j) && okAt(j, i)) both.push([i, j]); } else both = usablePairs(ps, LY.sep);
    if (both.length < 3) { lf('both<3'); continue; }
    const hl = ps.map((q) => W.headLevel(q)), pn = hl.map((c) => W.camNorm(b, c));
    const trips = [], ok = ps.map((_, i) => ps.map((_, j) => i !== j && okAt(i, j)));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      if (i === j || i === k || j === k || !(pn[k][2] > pn[j][2] + 0.5)) continue;
      if (!ok[j][i] || !ok[i][k]) continue;
      if ((tab ? tab[(i * n + j) * n + k] : angAt(ps[i], ps[j], ps[k])) < LAYOUT.bAng) continue;
      const u = [pn[j][0] - pn[i][0], pn[j][1] - pn[i][1]], w = [pn[k][0] - pn[i][0], pn[k][1] - pn[i][1]];
      const sS = Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w))))) * 180 / Math.PI;
      if (!(sS <= LAYOUT.bScreen && Math.hypot(...w) >= LAYOUT.beyond * Math.hypot(...u))) continue;
      if (offPlane(b.eye, hl[i], hl[j], hl[k]) > LAYOUT.psiMax) continue;
      const same = (p, a2, b2) => (p[0] === a2 && p[1] === b2) || (p[0] === b2 && p[1] === a2);
      if (!both.some((p) => !same(p, i, j) && !same(p, i, k) && (dis ? !p.includes(i) && !p.includes(j) && staggeredLoose(b, hl[p[0]], hl[p[1]]) : staggered(b, hl[p[0]], hl[p[1]])))) continue;
      trips.push([i, j, k]);
    }
    if (!trips.length) { lf('trips'); continue; }
    const tmp = { people: ps, cam: { ...cam } };
    fitCamera(tmp);
    const bt = W.camBasis(tmp), hx = ps.map((q) => tmp.cam.cx + tmp.cam.f * W.camNorm(bt, W.headLevel(q))[0]);
    if (hx.some((x, i) => hx.some((x2, j) => j > i && Math.abs(x - x2) < LAYOUT.dxMin))) { lf('dxMin'); continue; }
    people = ps; trip = trips[Math.floor(rng.raw() * trips.length)]; ring = { x: c0[0], z: c0[2], yaw: fh };
  }
  if (!people) return null;
  const tops = rng.shuffle([...W.SWEATERS.keys()]), caps = rng.shuffle([...W.CAPS.keys()]);
  people.forEach((P, i) => {
    P.baseYaw = r2(U(0, 72));
    P.chair = Math.floor(rng.raw() * W.CHAIRS.length);
    P.cap = true;
    P.long = rng.raw() < 0.4;
    P.look = { top: tops[i], bottom: Math.floor(rng.raw() * W.PANTS.length), skin: Math.floor(rng.raw() * W.SKINS.length), hair: Math.floor(rng.raw() * W.HAIRS.length), cap: caps[i] };
  });
    const m = {
    people, trip, cam,
    room: {
      floor: Math.floor(rng.raw() * 3), rot: rng.raw() < 0.5, wall: Math.floor(rng.raw() * 4),
      win: { wall: rng.raw() < 0.5 ? 'z' : 'x', a0: 0, a1: 0, y0: 0.95, y1: 2.15 },
      picture: { wall: 'z', a0: 0, a1: 0, y0: 1.35, y1: 1.95 }, pic: ['#7aa0c8', '#e8d8a8', '#5a8a4a'],
      table: null, plant: null,
    },
  };
  const R = m.room, wa = r2(U(1.0, 3.0));
  R.win.a0 = wa; R.win.a1 = r2(wa + U(1.2, 1.7));
  R.picture.wall = R.win.wall === 'z' ? 'x' : 'z';
  const pa = r2(U(1.0, 3.2)); R.picture.a0 = pa; R.picture.a1 = r2(pa + U(0.7, 1.0));
  R.pic = [['#7aa0c8', '#e8d8a8', '#5a8a4a'], ['#c87a5a', '#f0d8a0', '#4a6a8a'], ['#e0c070', '#a0b8c8', '#6a8a5a']][Math.floor(rng.raw() * 3)];
  R.table = { x: r3(ring.x), z: r3(ring.z), yaw: r2(ring.yaw), hw: r2(U(0.3, 0.36)), hd: r2(U(0.6, 0.75)) };
  const pl = { x: r3(U(0.35, 0.55)), z: r3(U(0.35, 0.55)) };
  if (people.every((P) => Math.hypot(P.x - pl.x, P.z - pl.z) > 0.8)) R.plant = pl;
  const f = fitCamera(m);
  if (f < LAYOUT.fMin) return null;
  return m;
}
