export const GW = 7, GH = 7;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const FOV = 72 * Math.PI / 180, PLANE = Math.tan(FOV / 2);
export const EYE = 0.95, WALL_H = 1.55, HORIZON = 0.42;
export const DOOR_U = [0.27, 0.73], DOOR_V = 1.22;
export const MIN_FLOORS = 18, MIN_FACES = 34;
const PATH_LEN = [11, 16], LEGS = [4, 6], ROOMS = [5, 7];
export const MIRROR = { u: [0.24, 0.76], v: [0.30, 1.32] };
export const WINDOW = { u: [0.2, 0.8], v: [0.42, 1.24] };
export const PIC = { u: [0.31, 0.69], v: [0.84, 1.26] };
export const POSTER = { u: [0.3, 0.7], v: [0.62, 1.3] };
export const BODY_R = 0.13, BODY_TOP = EYE + 0.1;

const key = (c, r) => `${c},${r}`;
export const faceId = (c, r, d) => (((r + 2) * 11 + (c + 2)) * 4 + d);
export const fid = (f) => faceId(f.col, f.row, f.dir);
export const sameFace = (a, b) => !!a && !!b && a.col === b.col && a.row === b.row && a.dir === b.dir;
const inGrid = (c, r) => c >= 0 && c < GW && r >= 0 && r < GH;
export function dirBetween(a, b) {
  const dc = b[0] - a[0], dr = b[1] - a[1];
  if (dc > 0) return 1; if (dc < 0) return 3; if (dr > 0) return 2; return 0;
}
const FSETS = new WeakMap();
export function floorSet(m) {
  let s = FSETS.get(m.floors);
  if (!s) { s = new Set(m.floors.map((f) => key(f[0], f[1]))); FSETS.set(m.floors, s); }
  return s;
}
export const isFloor = (m, c, r) => floorSet(m).has(key(c, r));
export function wallFaces(m) {
  const out = [];
  for (const [c, r] of m.floors) for (let d = 0; d < 4; d++) if (!isFloor(m, c + DIRS[d][0], r + DIRS[d][1])) out.push({ col: c, row: r, dir: d });
  return out;
}
export const isWallFace = (m, f) => !!f && isFloor(m, f.col, f.row) && !isFloor(m, f.col + DIRS[f.dir][0], f.row + DIRS[f.dir][1]);

export function tryBuildMaze(rng, opt = {}) {
  const edges = [];
  for (let c = 1; c < GW - 1; c++) { edges.push([c, 0, 2]); edges.push([c, GH - 1, 0]); }
  for (let r = 1; r < GH - 1; r++) { edges.push([0, r, 1]); edges.push([GW - 1, r, 3]); }
  const [sc, sr, h0] = rng.pick(edges);
  let dir = h0, cell = [sc, sr];
  const path = [cell.slice()];
  const occ = new Map([[key(sc, sr), 0]]);
  const legs = rng.int(LEGS[0], LEGS[1]);
  for (let leg = 0; leg < legs; leg++) {
    if (leg > 0) dir = (dir + (rng.raw() < 0.5 ? 1 : 3)) % 4;
    const len = leg === 0 ? rng.int(1, 2) : rng.int(1, 4);
    for (let s = 0; s < len; s++) {
      const nc = [cell[0] + DIRS[dir][0], cell[1] + DIRS[dir][1]];
      if (!inGrid(nc[0], nc[1]) || occ.has(key(nc[0], nc[1]))) return null;
      for (const [dc, dr] of DIRS) {
        const j = occ.get(key(nc[0] + dc, nc[1] + dr));
        if (j !== undefined && j !== path.length - 1) return null;
      }
      cell = nc; occ.set(key(cell[0], cell[1]), path.length); path.push(cell.slice());
    }
  }
  if (path.length < PATH_LEN[0] || path.length > PATH_LEN[1]) return null;
  const floors = path.map((p) => p.slice());
  const fset = new Set(floors.map((p) => key(p[0], p[1])));
  const RM = opt.rooms || ROOMS, want = path.length + rng.int(RM[0], RM[1]);
  for (const a of rng.shuffle(path.slice(1))) {
    if (floors.length >= want) break;
    for (const dd of rng.shuffle([0, 1, 2, 3])) {
      const s = [a[0] + DIRS[dd][0], a[1] + DIRS[dd][1]];
      if (!inGrid(s[0], s[1]) || fset.has(key(s[0], s[1]))) continue;
      let nb = 0;
      for (const [dc, dr] of DIRS) if (fset.has(key(s[0] + dc, s[1] + dr))) nb++;
      if (nb !== 1) continue;
      floors.push(s); fset.add(key(s[0], s[1])); break;
    }
  }
  if (floors.length < (opt.minFloors ?? MIN_FLOORS)) return null;
  const m = { grid: { w: GW, h: GH }, start: { col: sc, row: sr, heading: h0 }, path, floors };
  if (wallFaces(m).length < (opt.minFaces ?? MIN_FACES)) return null;
  return m;
}

const relCell = (c, z) => { const fw = DIRS[z.h], rt = DIRS[(z.h + 1) % 4], dx = c[0] - z.c, dz = c[1] - z.r; return [dx * fw[0] + dz * fw[1], dx * rt[0] + dz * rt[1]]; };
const absCell = (a, z) => { const fw = DIRS[z.h], rt = DIRS[(z.h + 1) % 4]; return [z.c + fw[0] * a[0] + rt[0] * a[1], z.r + fw[1] * a[0] + rt[1] * a[1]]; };
function deadEndOk(fl, s, nb) {
  if (!inGrid(s[0], s[1]) || fl.has(key(s[0], s[1]))) return false;
  let n = 0, ok = false;
  for (const [dc, dr] of DIRS) { const q = [s[0] + dc, s[1] + dr]; if (fl.has(key(q[0], q[1]))) { n++; if (q[0] === nb[0] && q[1] === nb[1]) ok = true; } }
  return n === 1 && ok;
}
export function twinMap(Z0, Q0) {
  return (s) => { const a = relCell([s.c, s.r], Z0), c = absCell(a, Q0); return { c: c[0], r: c[1], h: (s.h - Z0.h + Q0.h + 4) % 4 }; };
}
export const doorZone = (P, i, h) => [P[i + 1], P[i + 2]].map((c) => ({ c: c[0], r: c[1], h }));
export const RULE_MIN = 5;
export function ruleWalls(m) {
  const P = m.path, out = [], fs = new Set(m.floors.map((f) => key(f[0], f[1]))), onP = new Set(P.map((p) => key(p[0], p[1])));
  const room = (s) => fs.has(key(s[0], s[1])) && !onP.has(key(s[0], s[1]));
  for (let i = 1; i + 1 < P.length; i++) {
    const d = dirBetween(P[i - 1], P[i]), d2 = dirBetween(P[i], P[i + 1]);
    if (d2 === d) {
      for (const sd of [1, 3]) {
        const s = [P[i][0] + DIRS[(d + sd) % 4][0], P[i][1] + DIRS[(d + sd) % 4][1]];
        if (room(s)) out.push({ col: s[0], row: s[1], dir: (d + 2) % 4, type: 'side' });
      }
    } else {
      const s = [P[i][0] - DIRS[d2][0], P[i][1] - DIRS[d2][1]];
      if (room(s)) out.push({ col: s[0], row: s[1], dir: (d2 + 2) % 4, type: 'end' });
    }
  }
  return out.filter((f) => isWallFace({ floors: m.floors }, f));
}
export function buildTwinMaze(rng, opt = {}) {
  let base = null;
  for (let k = 0; k < 400 && !base; k++) base = tryBuildMaze(rng, { rooms: [0, 0], minFloors: 0, minFaces: 0 });
  if (!base) return null;
  const P = base.path, n = P.length - 1;
  const fl = new Set(P.map((p) => key(p[0], p[1]))), floors = P.map((p) => p.slice());
  const add = (c) => { fl.add(key(c[0], c[1])); floors.push(c.slice()); };
  const del = (c) => { fl.delete(key(c[0], c[1])); const k = floors.findIndex((f) => f[0] === c[0] && f[1] === c[1]); floors.splice(k, 1); };
  const sigOf = (z) => signature({ floors: floors.slice() }, z.c, z.r, z.h);
  const dpos = [];
  for (let i = 4; i + 2 <= n; i++) {
    const dIn0 = dirBetween(P[i - 1], P[i]), dOut = dirBetween(P[i], P[i + 1]);
    if (dirBetween(P[i + 1], P[i + 2]) !== dOut) continue;
    if (dIn0 === dOut) {
      for (const sd of [1, 3]) { const s = [P[i][0] + DIRS[(dOut + sd) % 4][0], P[i][1] + DIRS[(dOut + sd) % 4][1]]; if (deadEndOk(fl, s, P[i])) dpos.push({ i, room: s, dIn: (dOut + 2) % 4, type: 'side' }); }
    } else if (i + 2 === n || dirBetween(P[i + 2], P[i + 3]) !== dOut) {
      const s = [P[i][0] - DIRS[dOut][0], P[i][1] - DIRS[dOut][1]];
      if (deadEndOk(fl, s, P[i])) dpos.push({ i, room: s, dIn: (dOut + 2) % 4, type: 'end' });
    }
  }
  const want = opt.type || (rng.raw() < 0.5 ? 'side' : 'end');
  const order = dpos.filter((d) => !opt.type || d.type === want).map((d) => ({ d, k: d.i + 3 * rng.raw() + (d.type === want ? 0 : 100) })).sort((a, b) => a.k - b.k).map((x) => x.d);
  for (const d of order) {
    const Z = doorZone(P, d.i, d.dIn), relR = relCell(d.room, Z[0]), relPi = relCell(P[d.i], Z[0]);
    add(d.room);
    const s0 = Z.map(sigOf);
    const tw = [];
    for (const [qc, qr] of P) for (let hh = 0; hh < 4; hh++) {
      const Q = [{ c: qc, r: qr, h: hh }, { c: qc - DIRS[hh][0], r: qr - DIRS[hh][1], h: hh }];
      if (!Q.every((q) => fl.has(key(q.c, q.r)))) continue;
      if (Q.some((q) => Z.some((z) => z.c === q.c && z.r === q.r))) continue;
      const R2 = absCell(relR, Q[0]), Pi2 = absCell(relPi, Q[0]);
      if (!deadEndOk(fl, R2, Pi2)) continue;
      add(R2);
      const ok = Q.every((q, k) => sigOf(q) === sigOf(Z[k]));
      del(R2);
      if (ok) tw.push({ Q, R2 });
    }
    const dist = (a, b) => cellDist({ floors: floors.slice() }, a, b);
    const far = tw.filter((t) => dist([Z[0].c, Z[0].r], [t.Q[0].c, t.Q[0].r]) >= 4);
    if (!far.length) { del(d.room); continue; }
    const onWayOut = (t) => { const k = P.findIndex((p) => p[0] === t.Q[0].c && p[1] === t.Q[0].r); return k > 0 && k < d.i && dirBetween(P[k], P[k + 1]) === t.Q[0].h && P[k - 1][0] === t.Q[1].c && P[k - 1][1] === t.Q[1].r; };
    const pref = far.filter(onWayOut), t = rng.pick(pref.length && rng.raw() < 0.85 ? pref : far);
    add(t.R2);
    const T = (c) => absCell(relCell(c, Z[0]), t.Q[0]), Ti = (c) => absCell(relCell(c, t.Q[0]), Z[0]);
    const same = () => t.Q.every((q, k) => sigOf(q) === sigOf(Z[k]));
    const wantN = floors.length + rng.int(3, 5);
    for (const a of rng.shuffle(P.slice(1))) {
      if (floors.length >= wantN) break;
      for (const dd of rng.shuffle([0, 1, 2, 3])) {
        const s = [a[0] + DIRS[dd][0], a[1] + DIRS[dd][1]];
        if (!deadEndOk(fl, s, a)) continue;
        add(s);
        if (same()) break;
        let kept = false;
        for (const g of [T, Ti]) {
          const s2 = g(s), a2 = g(a);
          if (deadEndOk(fl, s2, a2)) { add(s2); if (same()) { kept = true; break; } del(s2); }
        }
        if (kept) break;
        del(s);
      }
    }
    for (let tries = 0; ruleWalls({ path: P, floors }).length < RULE_MIN && tries < 3; tries++) {
      for (const j of rng.shuffle([...Array(n - 1).keys()].map((k) => k + 1))) {
        if (ruleWalls({ path: P, floors }).length >= RULE_MIN) break;
        const dO = dirBetween(P[j - 1], P[j]), d2 = dirBetween(P[j], P[j + 1]);
        const spots = dO === d2 ? [1, 3].map((sd) => [P[j][0] + DIRS[(dO + sd) % 4][0], P[j][1] + DIRS[(dO + sd) % 4][1]]) : [[P[j][0] - DIRS[d2][0], P[j][1] - DIRS[d2][1]]];
        for (const s of rng.shuffle(spots)) {
          if (!deadEndOk(fl, s, P[j])) continue;
          add(s); if (same()) break;
          let kept = false;
          for (const g of [T, Ti]) { const s2 = g(s), a2 = g(P[j]); if (deadEndOk(fl, s2, a2)) { add(s2); if (same()) { kept = true; break; } del(s2); } }
          if (kept) break;
          del(s);
        }
      }
    }
    const isRoomAt = (j) => DIRS.some(([dc, dr]) => { const s = [P[j][0] + dc, P[j][1] + dr]; return fl.has(key(s[0], s[1])) && !P.some((p) => p[0] === s[0] && p[1] === s[1]) && !(s[0] === d.room[0] && s[1] === d.room[1]) && !(s[0] === t.R2[0] && s[1] === t.R2[1]); });
    if (!(n - d.i >= 2 && n - d.i <= 3) && !(isRoomAt(d.i + 2) || (d.i + 3 <= n && isRoomAt(d.i + 3)))) {
      let ok = false;
      for (const j of rng.shuffle([d.i + 2, d.i + 3].filter((j) => j <= n - 1))) {
        for (const dd of rng.shuffle([0, 1, 2, 3])) {
          const s = [P[j][0] + DIRS[dd][0], P[j][1] + DIRS[dd][1]];
          if (!deadEndOk(fl, s, P[j])) continue;
          add(s); if (same()) { ok = true; break; } del(s);
        }
        if (ok) break;
      }
      if (!ok) { while (floors.length > P.length) del(floors[floors.length - 1]); continue; }
    }
    const mz = { grid: { w: GW, h: GH }, start: base.start, path: P, floors: floors.slice() };
    if (mz.floors.length < MIN_FLOORS || wallFaces(mz).length < MIN_FACES) return null;
    if (!same()) return null;
    return { mz, door: { ...d, face: { col: d.room[0], row: d.room[1], dir: d.dIn } }, twin: { room: t.R2, face: { col: t.R2[0], row: t.R2[1], dir: t.Q[0].h }, Q: t.Q, wayOut: onWayOut(t) }, Z };
  }
  return null;
}

const TAU = Math.PI * 2, H = Math.PI / 2;
export const angOf = (h) => h * H;
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const smooth = (u) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const rp = (p) => [r4(p[0]), r4(p[1])];
const CEN = (c) => [c[0] + 0.5, c[1] + 0.5];
const add = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s];
export const ARC_LEN = Math.PI / 4;
const RAMP_K = 0.8;
export function lineTiming(L, v0, v1, vcWant) {
  const fit = (vc) => { const t0 = RAMP_K * Math.abs(vc - v0), t1 = RAMP_K * Math.abs(vc - v1); return { vc, t0r: t0, t1r: t1, d0: (v0 + vc) / 2 * t0, d1: (v1 + vc) / 2 * t1 }; };
  let f = fit(vcWant);
  if (f.d0 + f.d1 > L) {
    let lo = 0.02, hi = vcWant;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const g = fit(mid); if (g.d0 + g.d1 > L) hi = mid; else lo = mid; }
    f = fit(lo);
  }
  const tc = Math.max(0, (L - f.d0 - f.d1) / f.vc);
  return { vc: r4(f.vc), t0r: r4(f.t0r), t1r: r4(f.t1r), tc: r4(tc), dur: f.t0r + tc + f.t1r };
}
function lineDist(s, t) {
  const { v0, v1, vc, t0r, tc, t1r } = s;
  if (t <= 0) return 0;
  const ramp = (va, vb, T, x) => (T <= 1e-9 ? 0 : va * x + (vb - va) / 2 * (x - T / Math.PI * Math.sin(Math.PI * x / T)));
  if (t < t0r) return ramp(v0, vc, t0r, t);
  const d0 = ramp(v0, vc, t0r, t0r);
  if (t < t0r + tc) return d0 + vc * (t - t0r);
  return d0 + vc * tc + ramp(vc, v1, t1r, Math.min(t1r, t - t0r - tc));
}
export function poseAt(m, tau) {
  const S = m.route.segs;
  let lo = 0, hi = S.length - 1;
  const t = Math.max(0, Math.min(m.route.T, tau));
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  const s = S[lo], dt = t - s.t0, dur = s.t1 - s.t0;
  if (s.k === 'hold') return { x: s.p[0], z: s.p[1], ang: s.a };
  if (s.k === 'rot') { const u = smooth(dur > 0 ? dt / dur : 1); return { x: s.p[0], z: s.p[1], ang: s.a0 + (s.a1 - s.a0) * u }; }
  if (s.k === 'line') {
    const L = Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]), d = Math.min(L, lineDist(s, dt)), f = L > 0 ? d / L : 1;
    return { x: s.p0[0] + (s.p1[0] - s.p0[0]) * f, z: s.p0[1] + (s.p1[1] - s.p0[1]) * f, ang: s.a };
  }
  const u = dur > 0 ? Math.min(1, dt / dur) : 1, ph = u * H;
  const ex = s.ea[0] - s.o[0], ez = s.ea[1] - s.o[1], fx = s.eb[0] - s.o[0], fz = s.eb[1] - s.o[1];
  return { x: s.o[0] + ex * Math.cos(ph) + fx * Math.sin(ph), z: s.o[1] + ez * Math.cos(ph) + fz * Math.sin(ph), ang: s.a0 + (s.a1 - s.a0) * u };
}
export const segAtTime = (m, tau) => { const S = m.route.segs; let k = 0; for (let i = 0; i < S.length; i++) if (S[i].t0 <= tau) k = i; return S[k]; };

export function routeCells(mz, plan) {
  const p = mz.path, seq = [];
  for (let i = 0; i <= plan.j; i++) seq.push(p[i].slice());
  if (plan.room) seq.push(plan.room.slice());
  const u = seq.length - 1;
  if (plan.room) seq.push(p[plan.j].slice());
  for (let i = plan.j - 1; i >= plan.e; i--) seq.push(p[i].slice());
  return { seq, u };
}
export function routeRuns(seq, u) {
  const runs = [];
  let k = 1, pos = CEN(seq[0]), dir = dirBetween(seq[0], seq[1]);
  while (k < seq.length) {
    let k2 = k;
    while (k2 + 1 < seq.length && k2 !== u && dirBetween(seq[k2], seq[k2 + 1]) === dir) k2++;
    const c = seq[k2];
    if (k2 === u) {
      const end = add(CEN(c), DIRS[dir], -0.1);
      runs.push({ from: pos, to: end, dir, ev: 'uturn', cell: c, out: true, cells: seq.slice(k - 1, k2 + 1) });
      pos = end; dir = (dir + 2) % 4; k = k2 + 1;
    } else if (k2 === seq.length - 1) {
      runs.push({ from: pos, to: CEN(c), dir, ev: 'end', cell: c, out: k2 <= u, cells: seq.slice(k - 1, k2 + 1) });
      break;
    } else {
      const nd = dirBetween(seq[k2], seq[k2 + 1]);
      runs.push({ from: pos, to: add(CEN(c), DIRS[dir], -0.5), dir, ev: 'corner', nd, cell: c, out: k2 < u, cells: seq.slice(k - 1, k2 + 1) });
      pos = add(CEN(c), DIRS[nd], 0.5); dir = nd; k = k2 + 1;
    }
  }
  return runs;
}
const runLen = (R) => Math.hypot(R.to[0] - R.from[0], R.to[1] - R.from[1]);

export function timeRoute(runs, X, rng) {
  const U = rng.uniform, segs = [];
  let t = 0;
  const push = (s, dur) => { s.t0 = r4(t); t += dur; s.t1 = r4(t); segs.push(s); };
  const hold = (p, a, dur) => push({ k: 'hold', p: rp(p), a }, r4(dur));
  const ev = { uturn: null, back: null, look: null, pause: null, corners: [] };
  hold(runs[0].from, angOf(runs[0].dir), U(0.7, 1.1));
  const arcDur = runs.map((R) => (R.ev === 'corner' ? r4(U(1.3, 1.6)) : 0));
  for (let ri = 0; ri < runs.length; ri++) {
    const R = runs[ri], a = angOf(R.dir), L = runLen(R), D = DIRS[R.dir];
    const vIn = ri > 0 && runs[ri - 1].ev === 'corner' ? ARC_LEN / arcDur[ri - 1] : 0;
    const vOut = R.ev === 'corner' ? ARC_LEN / arcDur[ri] : 0;
    const stops = [];
    if (X.pause && X.pause.run === ri) stops.push({ s: X.pause.s, k: 'pause' });
    if (X.look && X.look.run === ri) stops.push({ s: X.look.s, k: 'look' });
    if (X.back && X.back.run === ri) stops.push({ s: X.back.s, k: 'back' });
    stops.sort((p, q) => p.s - q.s);
    let s0 = 0, v0 = vIn;
    const line = (sA, sB, va, vb, vc, back = false) => {
      const lenAB = Math.abs(sB - sA); if (lenAB < 1e-6) return;
      const T = lineTiming(lenAB, va, vb, vc);
      push({ k: 'line', p0: rp(add(R.from, D, sA)), p1: rp(add(R.from, D, sB)), a, v0: r4(va), v1: r4(vb), vc: T.vc, t0r: T.t0r, tc: T.tc, t1r: T.t1r, back }, r4(T.dur));
    };
    for (const st of stops) {
      line(s0, st.s, v0, 0, U(0.76, 1.0));
      const p = add(R.from, D, st.s);
      if (st.k === 'pause') { const t0 = t; hold(p, a, X.pause.long ? U(1.4, 2.0) : U(0.6, 1.0)); ev.pause = [r4(t0), r4(t)]; s0 = st.s; }
      else if (st.k === 'look') {
        const t0 = t, a1 = a + X.look.side * H;
        push({ k: 'rot', p: rp(p), a0: a, a1 }, r4(U(0.8, 1.0)));
        hold(p, a1, U(0.35, 0.6));
        push({ k: 'rot', p: rp(p), a0: a1, a1: a }, r4(U(0.8, 1.0)));
        ev.look = [r4(t0), r4(t)]; s0 = st.s;
      } else {
        hold(p, a, U(0.12, 0.25));
        const t0 = t;
        line(st.s, st.s - X.back.b, 0, 0, U(0.42, 0.55), true);
        ev.back = [r4(t0), r4(t)];
        hold(add(R.from, D, st.s - X.back.b), a, U(0.3, 0.5));
        s0 = st.s - X.back.b;
      }
      v0 = 0;
    }
    line(s0, L, v0, vOut, U(0.76, 1.0));
    if (R.ev === 'corner') {
      const c = R.cell, nd = R.nd, o = add(add(CEN(c), DIRS[R.dir], -0.5), DIRS[nd], 0.5);
      let a1 = angOf(nd); if (angDiff(a, a1) > 0) a1 = a + H; else a1 = a - H;
      const t0 = t;
      push({ k: 'arc', o: rp(o), ea: rp(R.to), eb: rp(add(CEN(c), DIRS[nd], 0.5)), a0: a, a1 }, arcDur[ri]);
      ev.corners.push([r4(t0), r4(t)]);
    } else if (R.ev === 'uturn') {
      const t0 = t;
      push({ k: 'rot', p: rp(R.to), a0: a, a1: a + X.uturnSide * Math.PI }, r4(U(1.9, 2.4)));
      ev.uturn = [r4(t0), r4(t)];
    }
  }
  for (const s of segs) {
    if (s.k === 'hold' || s.k === 'line') s.a = r4(((s.a % TAU) + TAU) % TAU);
    else { const w = ((s.a0 % TAU) + TAU) % TAU, d = s.a1 - s.a0; s.a0 = r4(w); s.a1 = r4(w + d); }
  }
  return { segs, T: r4(t), ev };
}

export function dda(isF, px, pz, mx, mz, rx, rz) {
  const ddx = Math.abs(1 / (rx || 1e-12)), ddz = Math.abs(1 / (rz || 1e-12));
  const sx = rx < 0 ? -1 : 1, sz = rz < 0 ? -1 : 1;
  let sdx = rx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
  let sdz = rz < 0 ? (pz - mz) * ddz : (mz + 1 - pz) * ddz;
  let side = 0;
  for (let i = 0; i < 64; i++) {
    if (sdx < sdz) { sdx += ddx; mx += sx; side = 0; } else { sdz += ddz; mz += sz; side = 1; }
    if (!isF(mx, mz)) break;
  }
  const t = side === 0 ? sdx - ddx : sdz - ddz;
  let c, r, d, u;
  if (side === 0) { c = mx - sx; r = mz; d = sx > 0 ? 1 : 3; const zh = pz + t * rz, f = zh - Math.floor(zh); u = d === 1 ? f : 1 - f; }
  else { c = mx; r = mz - sz; d = sz > 0 ? 2 : 0; const xh = px + t * rx, f = xh - Math.floor(xh); u = d === 0 ? f : 1 - f; }
  return { c, r, d, u, t };
}
const DECO = new WeakMap();
export function decorMap(m) {
  let d = DECO.get(m.decor);
  if (!d) { d = new Map(); for (const x of m.decor || []) d.set(faceId(x.col, x.row, x.dir), x); DECO.set(m.decor, d); }
  return d;
}
export const decorAt = (m, c, r, d) => decorMap(m).get(faceId(c, r, d)) || null;
export function annexIsF(w) {
  const d = w.dir, a = [w.col + DIRS[d][0], w.row + DIRS[d][1]], s = DIRS[(d + 1) % 4];
  return (c, r) => {
    const dc = c - a[0], dr = r - a[1];
    if (dc * DIRS[d][0] + dr * DIRS[d][1] !== 0) return false;
    const k = dc * s[0] + dr * s[1];
    return Math.abs(k) <= 3 && Math.abs(dc * s[1] - dr * s[0]) === 0;
  };
}
export const annexDoorFace = (w) => {
  const d = w.dir, s = DIRS[(d + 1) % 4], k = w.annexK;
  return { col: w.col + DIRS[d][0] + s[0] * k, row: w.row + DIRS[d][1] + s[1] * k, dir: d };
};
export function castFull(m, pose, camX) {
  const dX = Math.sin(pose.ang), dZ = -Math.cos(pose.ang);
  const pX = -dZ * PLANE, pZ = dX * PLANE;
  const rx = dX + pX * camX, rz = dZ + pZ * camX;
  const isF = (c, r) => isFloor(m, c, r);
  const h = dda(isF, pose.x, pose.z, Math.floor(pose.x), Math.floor(pose.z), rx, rz);
  const out = { h, rx, rz, via: null };
  const dc = decorAt(m, h.c, h.r, h.d);
  if (!dc) return out;
  const hx = pose.x + h.t * rx, hz = pose.z + h.t * rz;
  if (dc.kind === 'mirror' && h.u > MIRROR.u[0] && h.u < MIRROR.u[1]) {
    const xs = h.d === 1 || h.d === 3, qx = xs ? -rx : rx, qz = xs ? rz : -rz;
    const h2 = dda(isF, hx, hz, h.c, h.r, qx, qz);
    h2.t += h.t;
    const ox = hx - pose.x, oz = hz - pose.z, A = qx * qx + qz * qz, B = 2 * (ox * qx + oz * qz), Cc = ox * ox + oz * oz - BODY_R * BODY_R;
    const disc = B * B - 4 * A * Cc;
    let body = null;
    if (disc > 0) { const s1 = (-B - Math.sqrt(disc)) / (2 * A); if (s1 > 0 && h.t + s1 < h2.t) body = h.t + s1; }
    Object.assign(out, { via: 'mirror', h2, hp: [hx, hz], r2: [qx, qz], body });
  } else if (dc.kind === 'window' && h.u > WINDOW.u[0] && h.u < WINDOW.u[1]) {
    const h2 = dda(annexIsF(dc), hx, hz, h.c + DIRS[h.d][0], h.r + DIRS[h.d][1], rx, rz);
    h2.t += h.t;
    Object.assign(out, { via: 'window', h2, hp: [hx, hz], r2: [rx, rz] });
  }
  return out;
}

export const TURN_TOL = 22 * Math.PI / 180;
export function snap(p) {
  const h = (((Math.round(p.ang / H) % 4) + 4) % 4);
  return { c: Math.floor(p.x), r: Math.floor(p.z), h, turning: Math.abs(angDiff(p.ang, angOf(h))) > TURN_TOL };
}
export function signature(m, c, r, h) {
  const f = DIRS[h], L = DIRS[(h + 3) % 4], Rt = DIRS[(h + 1) % 4];
  const F = (x, z) => (isFloor(m, x, z) ? 1 : 0);
  let k = 0;
  while (k < 6 && F(c + f[0] * (k + 1), r + f[1] * (k + 1))) k++;
  let s = `k${k}`;
  for (let i = 0; i <= k; i++) {
    const x = c + f[0] * i, z = r + f[1] * i;
    for (const sd of [L, Rt]) {
      const o = F(x + sd[0], z + sd[1]);
      s += o;
      if (o && i <= 2) { const sx = x + sd[0], sz = z + sd[1]; s += `(${F(sx + f[0], sz + f[1])}${F(sx + sd[0], sz + sd[1])}${F(sx - f[0], sz - f[1])})`; }
    }
    s += '|';
  }
  return s;
}
const SIGS = new WeakMap();
export function stateTable(m) {
  let T = SIGS.get(m.floors);
  if (!T) {
    const states = [];
    for (const [c, r] of m.floors) for (let h = 0; h < 4; h++) states.push({ c, r, h, sig: signature(m, c, r, h) });
    const bySig = new Map();
    states.forEach((s, i) => { s.i = i; if (!bySig.has(s.sig)) bySig.set(s.sig, []); bySig.get(s.sig).push(i); });
    const idx = new Map(states.map((s, i) => [`${s.c},${s.r},${s.h}`, i]));
    T = { states, bySig, idx };
    SIGS.set(m.floors, T);
  }
  return T;
}
export function relFace(f, c0, r0, h) {
  const fw = DIRS[h], rt = DIRS[(h + 1) % 4], dx = f.col - c0, dz = f.row - r0;
  return { a: dx * fw[0] + dz * fw[1], l: dx * rt[0] + dz * rt[1], dd: (f.dir - h + 4) % 4 };
}
export function absFace(rel, c0, r0, h) {
  const fw = DIRS[h], rt = DIRS[(h + 1) % 4];
  return { col: c0 + fw[0] * rel.a + rt[0] * rel.l, row: r0 + fw[1] * rel.a + rt[1] * rel.l, dir: (rel.dd + h) % 4 };
}
export function frameCandidates(m, sn, face) {
  const T = stateTable(m), sig = signature(m, sn.c, sn.r, sn.h), rel = relFace(face, sn.c, sn.r, sn.h);
  const out = new Map();
  for (const i of T.bySig.get(sig) || []) {
    const s = T.states[i], g = absFace(rel, s.c, s.r, s.h);
    if (isWallFace(m, g)) out.set(fid(g), { face: g, state: i });
  }
  return [...out.values()];
}

const DIST = new WeakMap();
export function distTable(m) {
  let D = DIST.get(m.floors);
  if (!D) {
    const n = m.floors.length, id = new Map(m.floors.map((f, i) => [key(f[0], f[1]), i]));
    const M = Array.from({ length: n }, () => new Int16Array(n).fill(99));
    for (let a = 0; a < n; a++) {
      const q = [a]; M[a][a] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const v = q[qi], [c, r] = m.floors[v];
        for (const [dc, dr] of DIRS) { const w = id.get(key(c + dc, r + dr)); if (w !== undefined && M[a][w] === 99) { M[a][w] = M[a][v] + 1; q.push(w); } }
      }
    }
    D = { M, id };
    DIST.set(m.floors, D);
  }
  return D;
}
export function cellDist(m, a, b) { const D = distTable(m), i = D.id.get(key(a[0], a[1])), j = D.id.get(key(b[0], b[1])); return i === undefined || j === undefined ? 99 : D.M[i][j]; }

export const DT = 0.1, NC = 95;
export function timeline(m, opts = {}) {
  const dt = opts.dt || DT, nc = opts.nc || NC, out = [];
  const N = Math.round(m.route.T / dt);
  for (let k = 0; k <= N; k++) {
    const tau = Math.min(m.route.T, k * dt), p = poseAt(m, tau), sn = snap(p);
    const faces = new Map(), seen2 = new Map();
    for (let i = 0; i < nc; i++) {
      const cf = castFull(m, p, (2 * (i + 0.5)) / nc - 1), h = cf.h, id = faceId(h.c, h.r, h.d);
      let e = faces.get(id); if (!e) { e = { n: 0, nd: 0, np: 0, nq: 0 }; faces.set(id, e); }
      e.n++;
      if (h.u > DOOR_U[0] && h.u < DOOR_U[1]) e.nd++;
      if (h.u > PIC.u[0] && h.u < PIC.u[1]) e.np++;
      if (h.u > POSTER.u[0] && h.u < POSTER.u[1]) e.nq++;
      if (cf.via) {
        const g = cf.h2, k2 = `${cf.via}|${faceId(g.c, g.r, g.d)}`;
        let e2 = seen2.get(k2); if (!e2) { e2 = { n: 0, nd: 0 }; seen2.set(k2, e2); }
        e2.n++; if (g.u > DOOR_U[0] && g.u < DOOR_U[1]) e2.nd++;
      }
    }
    out.push({ tau, p, sn, faces, seen2 });
  }
  return out;
}
