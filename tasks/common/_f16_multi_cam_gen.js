import * as W from './_multi_cam_headcount_scene.js';

const RT = W.RT, FEED = W.FEED;
export const NAME = 'f16_multi_cam_headcount';
export const NF = 16, DTF = 1.25;
const DEG = Math.PI / 180;
export const DT = 1.25;
export const LO = 2, HI = 12;
const r3 = (v) => Math.round(v * 1000) / 1000;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const ang = (v) => Math.atan2(v[1], v[0]);
const popc = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1);

export const GATE = {
  T: [18, 25.5], hold: [0.8, 1.5], stand: 1.5,
  strict: 0.75, loose: 0.2, hidden: 0.1, detect: 0.5,
  minPx: 18,
  seenTotal: 3.7, seenRun: 2.4, camSeconds: 1.0,
  pairCo: 3, pairDist: 1.7, minDist: 0.8, pairAct: 1.2,
  sumSnap: 0,
  occEvents: 2,
  covMin: 0.24, covMax: 0.62, unionMin: 0.70, unionMax: 0.97, pairMin: 0.06,
  mergeDist: 1.0,
};

function roundPath(C, r0) {
  const out = [C[0].slice()], mids = [], arcs = [];
  out.mids = mids; out.arcs = arcs;
  const seg = (a, b) => { const L = hyp(a, b), n = Math.max(1, Math.ceil(L / 0.35)); for (let i = 1; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); };
  let cur = C[0];
  for (let i = 1; i < C.length - 1; i++) {
    const din = unit([C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]]), dout = unit([C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1]]);
    const th = Math.abs(angDiff(ang(dout), ang(din)));
    if (th < 1e-3) { seg(cur, C[i]); cur = C[i]; continue; }
    const ri = Array.isArray(r0) ? r0[i - 1] : r0;
    const tl = ri * Math.tan(th / 2), a = [C[i][0] - din[0] * tl, C[i][1] - din[1] * tl];
    if (hyp(cur, a) > 1e-6) seg(cur, a);
    const i0 = out.length - 1;
    const side = Math.sign(din[0] * dout[1] - din[1] * dout[0]);
    const r = ri, nrm = [-din[1] * side, din[0] * side], ctr = [a[0] + nrm[0] * r, a[1] + nrm[1] * r];
    const a0 = ang([a[0] - ctr[0], a[1] - ctr[1]]), n = Math.max(2, Math.ceil(th / (5 * DEG)));
    for (let k = 1; k <= n; k++) { const q = a0 + side * th * k / n; out.push([ctr[0] + r * Math.cos(q), ctr[1] + r * Math.sin(q)]); if (k === Math.round(n / 2)) mids.push(out.length - 1); }
    arcs.push([i0, out.length - 1]);
    cur = out[out.length - 1];
  }
  seg(cur, C[C.length - 1]);
  return out;
}
function param(pts, s0 = 0) {
  const o = []; let L = 0;
  for (let i = 0; i < pts.length; i++) { if (i) L += hyp(pts[i], pts[i - 1]); o.push([pts[i][0], pts[i][1], L - s0, L - s0]); }
  return o;
}
const EASE = 0.6;
function tvBuild(s0, v0, plan, E = EASE) {
  const kn = [[0, s0]]; let t = 0, s = s0, v = v0;
  for (const p of plan) {
    if (p.stop != null) {
      const sa = p.stop - v * E / 2;
      if (!(v > 0) || sa < s - 1e-9) return null;
      t += (sa - s) / v; s = sa; kn.push([t, s]);
      for (let k = 1; k <= 6; k++) { const u = E * k / 6; kn.push([t + u, sa + v * u - v * u * u / (2 * E)]); }
      t += E; s = p.stop; v = 0;
    } else if (p.wait != null) { if (p.wait > 0) { t += p.wait; kn.push([t, s]); } }
    else if (p.go != null) {
      v = p.go;
      for (let k = 1; k <= 6; k++) { const u = E * k / 6; kn.push([t + u, s + v * u * u / (2 * E)]); }
      t += E; s += v * E / 2;
    }
  }
  return { kn: kn.map((q) => [r3(q[0]), r3(q[1])]), t, s };
}
const roundPts = (pp) => pp.map((q) => [r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);
function stopFin(rng, p, tStop, dA) {
  const h = ang(W.poseAt(p, tStop + 0.01).f), t0 = tStop + rng.uniform(0, 0.25);
  p.mv.fin = { t0: r3(t0), t1: r3(t0 + 0.75), a0: r3(h), a1: r3(h + dA) };
}
const endOf = (p) => Math.max(p.mv.tv[p.mv.tv.length - 1][0], p.mv.fin ? p.mv.fin.t1 : 0);

export function cast(r0) {
  const N = 5 + Math.floor(r0() * 3);
  const P = N === 5 ? 2 : (r0() < 0.5 ? 2 : 3);
  return { N, P, hold: r3(GATE.hold[0] + (GATE.hold[1] - GATE.hold[0]) * r0()) };
}

const CS = 0.5;
function gridOf(X, Z, cs = CS) { return { nx: Math.floor(2 * X / cs), nz: Math.floor(2 * Z / cs), cs }; }
const cellX = (g, X, i) => -X + (i + 0.5) * (g.cs || CS), cellZ = (g, Z, j) => -Z + (j + 0.5) * (g.cs || CS);
function standIn(cm, x, z, mg = 3) {
  for (const y of [0.05, 1.7]) { const q = cm.project(x, y, z); if (!(q.z > 0.5) || q.x < mg || q.x > FEED.w - mg || q.y < mg || q.y > FEED.h - mg) return false; }
  return true;
}
function bareCover(cams, X, Z, cs = CS) {
  const g = { nx: Math.floor(2 * X / cs), nz: Math.floor(2 * Z / cs), cs }, mask = new Uint8Array(g.nx * g.nz), deep = new Uint8Array(g.nx * g.nz), cnt = new Array(8).fill(0);
  const cov = [0, 0, 0]; let uni = 0, blindIn = 0;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const x = -X + (i + 0.5) * cs, z = -Z + (j + 0.5) * cs; let mk = 0, dp = 0;
    cams.forEach((c, ci) => { if (standIn(c, x, z)) { mk |= 1 << ci; if (standIn(c, x, z, 14)) dp |= 1 << ci; } });
    mask[j * g.nx + i] = mk; deep[j * g.nx + i] = dp; if (mk) uni++;
    for (let c = 0; c < 3; c++) if (mk >> c & 1) cov[c]++;
    cnt[dp]++; if (mk === 0 && Math.abs(x) <= X - 1.2 && Math.abs(z) <= Z - 1.2) blindIn++;
  }
  const n = g.nx * g.nz, f = cnt.map((v) => v / n);
  return { g, mask, deep, cov: cov.map((v) => v / n), uni: uni / n, only: [f[1], f[2], f[4]], pairOnly: [f[3], f[5], f[6]], tri: f[7], blind: f[0], blindIn: blindIn / n };
}
function pickCams(rng, X, Z) {
  const U = (a, b) => rng.uniform(a, b);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], skip = Math.floor(rng.raw() * 4), cams = [], sw = rng.sign();
  corners.forEach((c, i) => {
    if (i === skip) return;
    const eye = [r3(c[0] * (X + U(0.5, 1.4))), r3(U(4.4, 6.0)), r3(c[1] * (Z + U(0.5, 1.4)))];
    const dx = -eye[0], dz = -eye[2], d = Math.hypot(dx, dz), phi = sw * U(8, 30) * DEG, cp = Math.cos(phi), sp = Math.sin(phi);
    const ux = dx / d * cp - dz / d * sp, uz = dx / d * sp + dz / d * cp, Ld = d * U(0.5, 0.9);
    cams.push({ eye, target: [r3(eye[0] + ux * Ld), 0, r3(eye[2] + uz * Ld)], fov: r3(U(30, 42)) });
  });
  return rng.shuffle(cams);
}
function blockFrac(P, cams, X, Z, bare) {
  const tmp = { props: [P] }, occ = W.occluders(tmp), g = bare.g; let worst = 0;
  cams.forEach((cm, ci) => {
    let n = 0, b = 0;
    for (let j = 0; j < g.nz; j += 2) for (let i = 0; i < g.nx; i += 2) {
      if (!(bare.mask[j * g.nx + i] >> ci & 1)) continue;
      n++; if (W.blockedStatic(occ, cm.eye, cellX(g, X, i), 1.0, cellZ(g, Z, j))) b++;
    }
    if (n) worst = Math.max(worst, b / n);
  });
  return worst;
}
function placeProps(rng, X, Z, cams, bare, camObjs) {
  const U = (a, b) => rng.uniform(a, b), props = [], g = bare.g;
  const cells = []; for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) cells.push([cellX(g, X, i), cellZ(g, Z, j), bare.mask[j * g.nx + i], bare.deep[j * g.nx + i]]);
  const far = (x, z, r) => props.every((P) => Math.hypot(P.x - x, P.z - z) >= r + W.propFoot(P) * 0.55);
  const take = (pred, r, tries = 12, mk = null, lim = 1) => {
    const cand = cells.filter((c) => pred(c) && far(c[0], c[1], r));
    for (let t = 0; t < tries && cand.length; t++) {
      const k = Math.floor(rng.raw() * cand.length), c = cand[k]; cand.splice(k, 1);
      if (mk && blockFrac(mk(c), camObjs, X, Z, bare) > lim) continue;
      return c;
    }
    return null;
  };
  const inner = (c, m = 1.6) => Math.abs(c[0]) <= X - m && Math.abs(c[1]) <= Z - m;
  const bandTints = rng.shuffle(W.BANDS.slice());
  const fc = take((c) => c[3] === 7 && inner(c, 2.4), 0); if (!fc) return nul('props:fountain');
  props.push({ kind: 'fountain', x: r3(fc[0]), z: r3(fc[1]), yaw: 0, r: r3(U(1.1, 1.4)) });
  const PM = rng.shuffle([3, 5, 6]), kioskFirst = rng.raw() < 0.5;
  const ki = { kind: 'kiosk', hx: r3(U(1.0, 1.4)), hz: r3(U(0.7, 1.0)), h: r3(U(2.5, 2.9)), tint: bandTints[3] };
  const mkk = (q) => ({ ...ki, x: q[0], z: q[1], yaw: Math.atan2(-q[0], -q[1]) / DEG });
  const putKiosk = (pred) => { const kc = take(pred, 3.2, 24, mkk, 0.16); if (!kc) return false; props.push({ ...ki, x: r3(kc[0]), z: r3(kc[1]), yaw: r3(Math.atan2(-kc[0], -kc[1]) / DEG + U(-12, 12)) }); return true; };
  const putCol = (pred, k) => {
    const col = { kind: 'column', yaw: 0, r: r3(U(0.32, 0.45)), h: r3(U(3.6, 4.2)), tint: bandTints[k] };
    const c = take(pred, 3.0, 24, (q) => ({ ...col, x: q[0], z: q[1] }), 0.12); if (!c) return false;
    props.push({ ...col, x: r3(c[0]), z: r3(c[1]) }); return true;
  };
  for (let k = 0; k < 3; k++) {
    const pm = PM[k];
    if (k === 2 && kioskFirst) { if (!putKiosk((q) => (q[3] & pm) === pm && inner(q, 1.3))) return nul('props:kioskpair'); }
    else if (!putCol((q) => (q[3] & pm) === pm && inner(q, 1.8), k)) return nul('props:colpair' + k);
  }
  if (!kioskFirst && !putKiosk((q) => q[2] !== 0 && inner(q, 1.3))) return nul('props:kiosk');
  const nTree = 3 + Math.floor(rng.raw() * 3);
  for (let k = 0; k < nTree; k++) {
    const mkt = (q) => ({ kind: 'tree', x: q[0], z: q[1], yaw: 0 });
    const c = take((q) => (Math.abs(q[0]) >= X - 1.4 || Math.abs(q[1]) >= Z - 1.4) && Math.abs(q[0]) <= X - 0.9 && Math.abs(q[1]) <= Z - 0.9 && cams.every((cc) => Math.hypot(cc.eye[0] - q[0], cc.eye[2] - q[1]) > 4.5), 2.8, 8, mkt, 0.03);
    if (c) props.push({ kind: 'tree', x: r3(c[0]), z: r3(c[1]), yaw: 0 });
  }
  const decor = ['bench', 'bench', 'planter', 'planter', 'lamp', 'bollard', 'bollard', 'bin'];
  for (const kind of decor) {
    if (rng.raw() < 0.25) continue;
    const c = take((q) => inner(q, 0.9), 1.6, 4);
    if (c) props.push({ kind, x: r3(c[0]), z: r3(c[1]), yaw: r3(U(0, 360)) });
  }
  for (const C of cams) props.push({ kind: 'pole', x: C.eye[0], z: C.eye[2], yaw: r3(Math.atan2(-C.eye[0], -C.eye[2]) / DEG), h: C.eye[1] - 0.1 });
  return props;
}
function propInView(m, ci, P) {
  for (const y of [0.1, 1.5]) { const q = W.project(m, ci, [P.x, y, P.z]); if (!(q[2] > 0.5) || q[0] < 6 || q[0] > FEED.w - 6 || q[1] < 6 || q[1] > FEED.h - 6) return false; }
  return true;
}

function walkable(m, x, z) {
  const X = m.plaza.X, Z = m.plaza.Z;
  if (Math.abs(x) > X - 0.8 || Math.abs(z) > Z - 0.8) return false;
  for (const P of m.props) if (P.kind !== 'pole' && Math.hypot(P.x - x, P.z - z) < W.propFoot(P)) return false;
  return true;
}
function analyseLayout(m, cs = CS) {
  const X = m.plaza.X, Z = m.plaza.Z, g = gridOf(X, Z, cs), n = g.nx * g.nz;
  const vis = [0, 1, 2].map(() => new Float32Array(n)), px = [0, 1, 2].map(() => new Float32Array(n)), occ = [0, 1, 2].map(() => new Float32Array(n));
  const zones = { E0: [], E1: [], E2: [], O01: [], O02: [], O12: [], TRI: [], D: [], V: [] };
  const cov = [0, 0, 0], pair = [0, 0, 0]; let uni = 0, strictAny = 0, tooSmall = 0;
  const lm = new Uint8Array(n), sm = new Uint8Array(n), walk = new Uint8Array(n);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const idx = j * g.nx + i, x = cellX(g, X, i), z = cellZ(g, Z, j);
    let l = 0, s = 0, mx = 0;
    for (let c = 0; c < 3; c++) {
      const pr = W.visFrac(m, c, x, z, 1, null, true), v = pr.vis; vis[c][idx] = v; occ[c][idx] = pr.occStatic; mx = Math.max(mx, v);
      const hp = W.heightPx(m, c, x, z, 1); px[c][idx] = hp;
      if (v >= GATE.loose) { l |= 1 << c; if (hp < GATE.minPx && walkable(m, x, z)) tooSmall++; }
      if (v >= GATE.strict) s |= 1 << c;
    }
    lm[idx] = l; sm[idx] = s;
    const w = walkable(m, x, z); walk[idx] = w ? 1 : 0;
    if (l) uni++; for (let c = 0; c < 3; c++) if (s >> c & 1) cov[c]++;
    if ((s & 3) === 3) pair[0]++; if ((s & 5) === 5) pair[1]++; if ((s & 6) === 6) pair[2]++;
    if (!w) continue;
    if (mx < GATE.hidden) { }
    else if (l === s && s) {
      zones.V.push(idx);
      if (s === 1) zones.E0.push(idx); else if (s === 2) zones.E1.push(idx); else if (s === 4) zones.E2.push(idx);
      else if (s === 3) zones.O01.push(idx); else if (s === 5) zones.O02.push(idx); else if (s === 6) zones.O12.push(idx); else if (s === 7) zones.TRI.push(idx);
    }
  }
  const deadE = new Uint8Array(n), erd = cs > 0.6 ? 0 : 1;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    let ok = 1;
    for (let dj = -erd; dj <= erd && ok; dj++) for (let di = -erd; di <= erd; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz) continue; const q = jj * g.nx + ii; if (Math.max(vis[0][q], vis[1][q], vis[2][q]) >= GATE.hidden * 0.6) { ok = 0; break; } }
    deadE[j * g.nx + i] = ok;
    if (ok && walk[j * g.nx + i]) zones.D.push(j * g.nx + i);
  }
  return { g, vis, px, occ, lm, sm, walk, deadE, zones, cov: cov.map((v) => v / n), pair: pair.map((v) => v / n), uni: uni / n, tooSmall };
}
function cellOf(A, X, Z, x, z) {
  const g = A.g, i = Math.floor((x + X) / g.cs), j = Math.floor((z + Z) / g.cs);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
}
function buildLayout(rng, C) {
  const U = (a, b) => rng.uniform(a, b);
  const X = r3(U(8.5, 10.0)), Z = r3(U(6.5, 8.0));
  const mkCams = (cs) => cs.map((c) => RT.makeCam({ eye: c.eye, target: c.target, fovY: c.fov, W: FEED.w, H: FEED.h }));
  let cams = null, bare = null, camObjs = null;
  for (let t = 0; t < 1500 && !cams; t++) {
    const cs = pickCams(rng, X, Z), cm = mkCams(cs), q0 = bareCover(cm, X, Z, 2.0);
    if (!(q0.only.every((v) => v >= 0.03) && q0.pairOnly.every((v) => v >= 0.02) && q0.tri >= 0.01 && q0.blindIn >= 0.03 && q0.cov.every((v) => v >= 0.25 && v <= 0.7))) continue;
    const q = bareCover(cm, X, Z, 1.0);
    if (!(q.only.every((v) => v >= 0.05) && q.pairOnly.every((v) => v >= 0.035) && q.tri >= 0.008 && q.tri <= 0.27 && q.blindIn >= 0.05 && q.blind <= 0.34 && q.cov.every((v) => v >= 0.32 && v <= 0.64))) continue;
    const b = bareCover(cm, X, Z);
    if (b.only.every((v) => v >= 0.06) && b.pairOnly.every((v) => v >= 0.04) && b.tri >= 0.01 && b.tri <= 0.25 && b.blindIn >= 0.06 && b.blind <= 0.32 && b.cov.every((v) => v >= 0.34 && v <= 0.62)) { cams = cs; bare = b; camObjs = cm; }
  }
  if (!cams) return nul('cams');
  for (let tp = 0; tp < 8; tp++) {
    const props = placeProps(rng, X, Z, cams, bare, camObjs);
    if (!props) { nul('props'); continue; }
    const m = { task: NAME, live: true, plaza: { X, Z }, cams, props, people: [] };
    const pv = rng.pick(W.PAVING);
    m.ground = { ...pv, tile: r3(U(0.6, 1.0)), rot: r3(U(0, Math.PI)), bond: rng.raw() < 0.5, band: rng.pick([0, 0, 4, 5, 6]) };
    m.sun = { az: r3(U(0, 360)), el: r3(U(40, 62)) };
    let lm = true;
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
      const sh = m.props.filter((P) => ['fountain', 'column', 'kiosk', 'tree'].includes(P.kind) && propInView(m, a, P) && propInView(m, b, P));
      if (sh.length < 2 || !sh.some((P) => P.kind !== 'tree')) lm = false;
    }
    if (!lm) { nul('landmarks'); continue; }
    const okA = (A, f) => {
      if (A.tooSmall > 0) return 'tiny';
      if (!A.cov.every((v) => v >= GATE.covMin && v <= GATE.covMax) || A.uni < GATE.unionMin || A.uni > GATE.unionMax || !A.pair.every((v) => v >= GATE.pairMin)) return 'coverage';
      const Z0 = A.zones;
      const bad = [...['E0', 'E1', 'E2'].filter((k) => Z0[k].length < 10 * f), ...['O01', 'O02', 'O12'].filter((k) => Z0[k].length < 6 * f), ...(Z0.D.length < 20 * f ? ['D'] : [])];
      if (bad.length) return 'zones:' + bad.join('');
      return null;
    };
    const coarse = okA(analyseLayout(m, 1.0), 0.25);
    if (coarse) { nul(coarse); continue; }
    const A = analyseLayout(m);
    const why = okA(A, 1);
    if (why) { nul(why + ':fine'); continue; }
    return { m, A, C };
  }
  return null;
}

const STAGES_E = ['E0', 'E1', 'E2'], STAGES_O = ['O01', 'O02', 'O12'];
const camsOfZone = (z) => (z[0] === 'E' ? [Number(z[1])] : z[0] === 'O' ? [Number(z[1]), Number(z[2])] : [0, 1, 2]);
const FAMILIES = [['both', 14, 900], ['mid', 22, 1500], ['anchor', 10, 100], ['occ', 14, 100], ['ovl', 16, 120], ['single', 14, 120], ['cross', 24, 160], ['early', 3, 150], ['late', 3, 150]];
function stagesOf(rng, fam, hasTri) {
  const E = STAGES_E, O = STAGES_O, vis = E.concat(O), pk = (l) => l[Math.floor(rng.raw() * l.length)];
  if (fam === 'early') return [['D', 0.4], [pk(vis), 0.6]];
  if (fam === 'late') return [[pk(vis), 0.6], ['D', 0.4]];
  if (fam === 'both') return [['D', 0.25], [pk(vis), 0.5], ['D', 0.25]];
  if (fam === 'mid') return [[pk(vis), 0.3], ['D', 0.4], [pk(vis), 0.3]];
  if (fam === 'anchor') return hasTri ? [['TRI', 1]] : [[pk(O), 1]];
  if (fam === 'occ') return [['X', 1]];
  if (fam === 'ovl') return [[pk(O), 1]];
  if (fam === 'single') return [[pk(vis), 1]];
  const e = pk(E), os = O.filter((o) => camsOfZone(o).includes(Number(e[1]))), o = pk(os), r = rng.raw();
  if (r < 0.35) return [[e, 0.5], [o, 0.5]];
  if (r < 0.7) return [[o, 0.5], [e, 0.5]];
  const e2 = pk(E.filter((q) => q !== e && camsOfZone(o).includes(Number(q[1])))); return e2 ? [[e, 0.34], [o, 0.33], [e2, 0.33]] : [[e, 0.5], [o, 0.5]];
}
function occWaypoints(rng, ctx) {
  const { m } = ctx, U = (a, b) => rng.uniform(a, b);
  const cand = m.props.filter((P) => P.kind === 'column' || P.kind === 'kiosk');
  for (let t = 0; t < 30; t++) {
    const P = rng.pick(cand), ci = Math.floor(rng.raw() * 3);
    if (!propInView(m, ci, P)) continue;
    const e = m.cams[ci].eye, d = unit([P.x - e[0], P.z - e[2]]), u = [-d[1], d[0]], rad = P.kind === 'column' ? P.r : Math.max(P.hx, P.hz) * 0.8;
    const dd = rad + U(0.9, 1.5), q = [P.x + d[0] * dd, P.z + d[1] * dd], a = U(2.0, 4.0), b = U(2.0, 4.0), sg = rng.sign();
    const W0 = [r3(q[0] - u[0] * a * sg), r3(q[1] - u[1] * a * sg)], W1 = [r3(q[0] + u[0] * b * sg), r3(q[1] + u[1] * b * sg)];
    if (legClear(m, W0, W1)) return [W0, [r3(q[0]), r3(q[1])], W1];
  }
  return null;
}
const pickCell = (rng, A, X, Z, name) => {
  const L = A.zones[name], idx = L[Math.floor(rng.raw() * L.length)], i = idx % A.g.nx, j = Math.floor(idx / A.g.nx);
  return [r3(cellX(A.g, X, i) + rng.uniform(-0.2, 0.2)), r3(cellZ(A.g, Z, j) + rng.uniform(-0.2, 0.2))];
};
function legClear(m, a, b) {
  const L = hyp(a, b), n = Math.max(1, Math.ceil(L / 0.35));
  for (let i = 0; i <= n; i++) if (!walkable(m, a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)) return false;
  return true;
}
function makeRoute(rng, ctx, stages, hp = null) {
  const { m, A, T } = ctx, X = m.plaza.X, Z = m.plaza.Z, U = (a, b) => rng.uniform(a, b);
  const lurk = stages.some((s) => s[0] === 'D'), firstD = stages[0][0] === 'D', lastD = stages[stages.length - 1][0] === 'D', midD = lurk && !firstD && !lastD;
  const nw = stages[0][0] === 'X' ? 3 + Math.floor(rng.raw() * 2) : lurk ? 3 + Math.floor(rng.raw() * 3) : 2 + Math.floor(rng.raw() * 5);
  const bounds = []; let cum = 0; for (const [nm, f] of stages) { cum += f; bounds.push([nm, cum]); }
  const stageAt = (fr) => (bounds.find((q) => fr <= q[1] + 1e-9) || bounds[bounds.length - 1])[0];
  let wps = [];
  const both = firstD && lastD;
  const hideStart = hp && firstD ? hp.start : firstD ? (both ? U(2.5, 4.5) : U(6, 9.5)) : 0, hideEnd = hp && lastD ? hp.end : lastD ? (both ? U(2.5, 4.5) : U(7, 12)) : 0, hideMid = hp && midD ? hp.mid : midD ? U(5, 11) : 0;
  const tTarget = T - (lastD ? hideEnd : firstD ? U(2.8, 4) : hp && midD ? U(2.8, 3.8) : U(2.8, 7.5)), Lmax = 0.85 * (tTarget - hideStart - hideMid - 1.2); let cumL = 0;
  const wpStage = [];
  if (hp && midD) {
    const vz = stages[0][0];
    for (let t = 0; t < 40 && wps.length < 2; t++) {
      const d = pickCell(rng, A, X, Z, 'D'), p0 = pickCell(rng, A, X, Z, vz), L = hyp(p0, d);
      if (L < 1.3 || L > 3.4 || !legClear(m, p0, d)) continue;
      wps = [p0, d]; wpStage.push(vz, 'D');
    }
    if (wps.length < 2) return nul('route:midpre');
    cumL = hyp(wps[0], wps[1]);
    const npost = 1 + (rng.raw() < 0.4 ? 1 : 0), vz2 = stages[stages.length - 1][0];
    for (let q = 0; q < npost; q++) {
      let got = null;
      for (let t = 0; t < 40 && !got; t++) {
        const c = pickCell(rng, A, X, Z, vz2), p = wps[wps.length - 1], L = hyp(p, c);
        if (L < 1.4 || L > (q === 0 ? 3.6 : 5) || !legClear(m, p, c)) continue;
        const pp = wps[wps.length - 2], d1 = unit([p[0] - pp[0], p[1] - pp[1]]), d2 = unit([c[0] - p[0], c[1] - p[1]]); if (Math.abs(angDiff(ang(d2), ang(d1))) > 178 * DEG) continue;
        got = c;
      }
      if (!got) { if (q === 0) return nul('route:midpost'); break; }
      wps.push(got); wpStage.push(vz2);
    }
  }
  let xPause = 0;
  if (stages[0][0] === 'X') { const ow = occWaypoints(rng, ctx); if (!ow) return nul('route:occ'); wps = ow.slice(); cumL = hyp(ow[0], ow[1]) + hyp(ow[1], ow[2]); wpStage.push('X', 'X', 'X'); xPause = rng.raw() < 0.55 ? U(1.2, 2.6) : 0; }
  for (let k = wps.length; k < (hp && midD ? 0 : nw); k++) {
    const nmk = stages[0][0] === 'X' ? 'V' : stageAt(nw === 1 ? 0 : (k + 0.5) / nw);
    let wp = null;
    for (let t = 0; t < 40 && !wp; t++) {
      const c = pickCell(rng, A, X, Z, nmk);
      if (!wps.length) { wp = c; break; }
      const p = wps[wps.length - 1], L = hyp(p, c);
      if (L < 1.2 || L > 12 || cumL + L > Lmax || !legClear(m, p, c)) continue;
      if (wps.length >= 2) { const q = wps[wps.length - 2], d1 = unit([p[0] - q[0], p[1] - q[1]]), d2 = unit([c[0] - p[0], c[1] - p[1]]); if (Math.abs(angDiff(ang(d2), ang(d1))) > 178 * DEG) continue; }
      wp = c;
    }
    if (!wp) return nul('route:wp');
    if (wps.length) cumL += hyp(wps[wps.length - 1], wp);
    wps.push(wp); wpStage.push(nmk);
  }
  let raw;
  if (wps.length === 2) raw = roundPath(wps, 0.5);
  else {
    const rr = [];
    for (let i = 1; i < wps.length - 1; i++) {
      const L1 = hyp(wps[i - 1], wps[i]), L2 = hyp(wps[i], wps[i + 1]);
      const din = unit([wps[i][0] - wps[i - 1][0], wps[i][1] - wps[i - 1][1]]), dout = unit([wps[i + 1][0] - wps[i][0], wps[i + 1][1] - wps[i][1]]);
      const th = Math.abs(angDiff(ang(dout), ang(din))), t2 = Math.tan(Math.max(th, 0.02) / 2);
      rr.push(Math.max(0.04, Math.min(0.9, 0.42 * Math.min(L1, L2) / t2)));
    }
    raw = roundPath(wps, rr);
  }
  const pts = param(raw, 0), Ltot = pts[pts.length - 1][2];
  if (!(Ltot > 2)) return nul('route:Ltot');
  const sW = [];
  for (let i = 1; i < wps.length - 1; i++) { let best = 1e9, bs = 0; for (const q of pts) { const d = Math.hypot(q[0] - wps[i][0], q[1] - wps[i][1]); if (d < best) { best = d; bs = q[2]; } } sW.push(bs); }
  if (!sW.length) sW.push(Ltot / 2);
  let v = U(0.4, 0.8);
  const nStop = sW.length + 1;
  const walkT = (vv) => Ltot / vv + EASE * (nStop + 1) * 0.5;
  const fixed = hp && midD ? 0 : hideStart + hideMid;
  let slack = tTarget - walkT(v) - fixed;
  if (slack < 0) { v = Math.min(0.85, Ltot / Math.max(1, tTarget - fixed - EASE * (nStop + 1) * 0.5)); slack = tTarget - walkT(v) - fixed; if (slack < -0.6) return nul('route:long'); }
  slack = Math.max(0, slack - xPause);
  const pauses = new Array(sW.length).fill(0); let w0 = hideStart;
  const dIdx = []; for (let i = 0; i < sW.length; i++) if (wpStage[i + 1] === 'D') dIdx.push(i);
  if (midD && dIdx.length) for (const i of dIdx) pauses[i] = hideMid / dIdx.length;
  if (hp && midD && dIdx.length) {
    const i0 = dIdx[0], arrive = sW[i0] / v + EASE * 0.5 - 0.5;
    w0 = hp.tIn - arrive; if (w0 < -1.2) return nul('route:midearly'); if (w0 < 0.3) w0 = 0;
    pauses.fill(0); pauses[i0] = hideMid;
  } else {
    const slots = [];
    if (!firstD) slots.push('w0'); for (let i = 0; i < sW.length; i++) if (!(midD && dIdx.includes(i)) && rng.raw() < (lurk ? 0.6 : 0.5)) slots.push(i);
    if (!slots.length) slots.push(0);
    const wts = slots.map((sl) => (sl === 'w0' ? (rng.raw() < 0.5 ? 0.3 : 1) : 1) * (0.3 + rng.raw()));
    const wsum = wts.reduce((a2, b2) => a2 + b2, 0);
    for (let k = 0; k < slots.length; k++) {
      const d = slack * wts[k] / wsum;
      if (slots[k] === 'w0') w0 = d < 0.3 ? 0 : d; else pauses[slots[k]] += d < 0.8 ? 0 : d;
    }
  }
  if (xPause > 0 && pauses.length) pauses[0] += xPause;
  if (w0 > 14 || pauses.some((q) => q > 14)) return nul('route:slack');
  const plan = []; let v0 = v;
  if (w0 > 0) { plan.push({ wait: w0 }); plan.push({ go: v }); v0 = 0; }
  let lastS = 0;
  for (let i = 0; i < sW.length; i++) {
    if (!(pauses[i] > 0) || sW[i] - lastS < 1.2 || Ltot - sW[i] < 1.2) continue;
    plan.push({ stop: sW[i] }); plan.push({ wait: pauses[i] }); plan.push({ go: v }); lastS = sW[i];
  }
  plan.push({ stop: Ltot });
  const tv = tvBuild(0, v0, plan);
  if (!tv) return nul('route:tv');
  if (!(tv.t <= T - 2.6 && tv.t >= T - (lastD || hp ? 14.5 : 12))) return nul(tv.t > T - 2.6 ? 'route:late' : 'route:early');
  return { mv: { pts: roundPts(pts), tv: tv.kn }, tEnd: tv.t, stages: stages.map((q) => q[0]), v: r3(v), w0: r3(w0) };
}

const PL = 0.10, PS = 0.85, PD = 0.35;
function routeFeatures(ctx, r) {
  const { m, A, T, K } = ctx, X = m.plaza.X, Z = m.plaza.Z;
  const px = new Float32Array(K + 1), pz = new Float32Array(K + 1);
  const Ls = [0, 1, 2].map(() => new Uint8Array(K + 1)), Ss = [0, 1, 2].map(() => new Uint8Array(K + 1)), hid = new Uint8Array(K + 1), anyS = new Uint8Array(K + 1), anyD = new Uint8Array(K + 1);
  const occd = [0, 1, 2].map(() => new Uint8Array(K + 1));
  const p = { mv: r.mv, k: 1 };
  let seen = 0, run = 0, best = 0; const cl = [0, 0, 0], cs = [0, 0, 0];
  for (let k = 0; k <= K; k++) {
    const t = Math.min(T, k * DT), q = ptAtT(p, t); px[k] = q[0]; pz[k] = q[1];
    const ci = cellOf(A, X, Z, q[0], q[1]);
    let mx = 0;
    for (let c = 0; c < 3; c++) {
      const v = ci < 0 ? 0 : A.vis[c][ci]; mx = Math.max(mx, v);
      if (v >= PL) { Ls[c][k] = 1; cl[c] = 1; }
      if (v >= PS) { Ss[c][k] = 1; anyS[k] = 1; cs[c] += DT; }
      if (v >= PD) anyD[k] = 1;
      if (ci >= 0 && A.occ[c][ci] >= 0.4 && v < 0.3) occd[c][k] = 1;
    }
    hid[k] = ci >= 0 && A.deadE[ci] ? 1 : 0;
    if (anyS[k]) { seen += DT; run += DT; best = Math.max(best, run); } else run = 0;
  }
  let ev = 0; const evCand = [];
  for (let c = 0; c < 3; c++) {
    let k = 0;
    while (k <= K) {
      if (!occd[c][k]) { k++; continue; }
      let k1 = k; while (k1 + 1 <= K && occd[c][k1 + 1]) k1++;
      let b4 = false, af = false; for (let q = Math.max(0, k - 2); q < k; q++) if (Ss[c][q]) b4 = true; for (let q = k1 + 1; q <= Math.min(K, k1 + 2); q++) if (Ss[c][q]) af = true;
      if ((k1 - k + 1) * DT >= 0.6 && b4 && af) { ev++; evCand.push([c, Math.max(0, k - 7), Math.min(K, k1 + 7)]); }
      k = k1 + 1;
    }
  }
  const cnt = new Uint8Array(K + 1); let sumC = 0; for (let k = 0; k <= K; k++) { cnt[k] = Ss[0][k] + Ss[1][k] + Ss[2][k]; sumC += cnt[k]; }
  const spd = new Float32Array(K + 1); for (let k = 0; k <= K; k++) { const k1 = Math.min(K, k + 1), k0 = k1 === k ? k - 1 : k; spd[k] = Math.hypot(px[k1] - px[k0], pz[k1] - pz[k0]) / DT; }
  return { r, px, pz, spd, L: Ls, S: Ss, cnt, meanC: sumC / (K + 1), hid, anyS, anyD, ev, evCand, evx: -1, cl, camS: cs.map((q) => (q >= GATE.camSeconds ? 1 : 0)), seen, run: best, fine: null };
}
function exactEvents(f, ctx) {
  if (f.evx >= 0) return f.evx;
  const { m, K } = ctx; let n = 0;
  for (const [c, k0, k1] of f.evCand) {
    const v = [], o = [];
    for (let k = k0; k <= k1; k++) { const pr = W.visFrac(m, c, f.px[k], f.pz[k], 1, null, true); v.push(pr.vis); o.push(pr.occStatic); }
    let k = 0;
    while (k < v.length) {
      if (!(o[k] >= 0.4 && v[k] < 0.3)) { k++; continue; }
      let e = k; while (e + 1 < v.length && o[e + 1] >= 0.4 && v[e + 1] < 0.3) e++;
      let b4 = false, af = false; for (let q = Math.max(0, k - 2); q < k; q++) if (v[q] >= GATE.strict + 0.05) b4 = true; for (let q = e + 1; q <= Math.min(v.length - 1, e + 2); q++) if (v[q] >= GATE.strict + 0.05) af = true;
      if ((e - k + 1) * DT >= 0.75 + 0.25 && b4 && af) n++;
      k = e + 1;
    }
  }
  f.evx = n; void K;
  return n;
}
function ptAtT(p, t) { const s = W.sOf(p.mv.tv, t), q = W.ptAt(p.mv.pts, s); return q; }
function fineOf(f, ctx) {
  if (f.fine) return f.fine;
  const n = Math.floor(ctx.T / 0.1) + 1, a = new Float32Array(n), b = new Float32Array(n), p = { mv: f.r.mv };
  for (let k = 0; k < n; k++) { const q = ptAtT(p, Math.min(ctx.T, k * 0.1)); a[k] = q[0]; b[k] = q[1]; }
  f.fine = [a, b];
  return f.fine;
}
function minDistF(a, b, ctx) { const A = fineOf(a, ctx), B = fineOf(b, ctx); let d = Infinity; for (let k = 0; k < A[0].length; k++) d = Math.min(d, Math.hypot(A[0][k] - B[0][k], A[1][k] - B[1][k])); return d; }
function pairAny(a, b, ctx) {
  const K1 = ctx.K + 1;
  let run = 0, best = 0;
  for (let k = 0; k < K1; k++) { if (a.anyS[k] && b.anyS[k]) { run += DT; best = Math.max(best, run); } else run = 0; }
  if (best < GATE.pairCo + 0.4) return false;
  let act = 0;
  for (let k = 0; k < K1; k++) if (a.anyS[k] && b.anyS[k] && ((a.spd[k] > 0.3 && b.spd[k] < 0.1) || (b.spd[k] > 0.3 && a.spd[k] < 0.1))) act += DT;
  if (act < GATE.pairAct + 0.6) return false;
  return minDistF(a, b, ctx) >= GATE.pairDist + 0.2;
}
function pairSep(a, b, ctx) {
  const K1 = ctx.K + 1;
  for (let c = 0; c < 3; c++) for (let k = 0; k < K1; k++) if (a.L[c][k] && b.L[c][k]) return false;
  return true;
}

function selectCast(rng, ctx, pool, N, P) {
  const K1 = ctx.K + 1, nP = pool.length;
  const mdM = new Float32Array(nP * nP).fill(-1), paM = new Int8Array(nP * nP).fill(-1), psM = new Int8Array(nP * nP).fill(-1);
  const md = (a, b) => { const i = a * nP + b; let v = mdM[i]; if (v < 0) { v = minDistF(pool[a], pool[b], ctx); mdM[i] = v; mdM[b * nP + a] = v; } return v; };
  const pa = (a, b) => { const i = a * nP + b; let v = paM[i]; if (v < 0) { v = pairAny(pool[a], pool[b], ctx) ? 1 : 0; paM[i] = v; paM[b * nP + a] = v; } return v === 1; };
  const ps = (a, b) => { const i = a * nP + b; let v = psM[i]; if (v < 0) { v = pairSep(pool[a], pool[b], ctx) ? 1 : 0; psM[i] = v; psM[b * nP + a] = v; } return v === 1; };
  const good = []; for (let i = 0; i < nP; i++) if (pool[i].seen >= GATE.seenTotal + 1.3 && pool[i].run >= GATE.seenRun + 1.3) good.push(i);
  if (good.length < N + 4) return nul('few good');
  const dmin = GATE.minDist + 0.2;
  let hardPen = 0;
  const penalty = (set, comp = null) => {
    let pen = 0; hardPen = 0; const add = (nm, v, soft = false) => { pen += v; if (!soft) hardPen += v; if (comp && v) comp[nm] = (comp[nm] || 0) + v; };
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = md(set[i], set[j]); if (d < dmin) add('dist', 20 + (dmin - d) * 20); }
    let sep = 0;
    for (let q = 0; q < P; q++) { const a = set[2 * q], b = set[2 * q + 1]; if (!pa(a, b)) add('pairAny', 25); else if (ps(a, b)) sep++; }
    if (!sep) add('noSep', 25);
    let dips = 0, sumDef = 0;
    for (let k = 0; k < K1; k++) {
      let hid = 0, s = 0; for (let i = 0; i < N; i++) { const r = pool[set[i]]; hid |= r.hid[k]; s += r.cnt[k]; }
      if (!hid) add('hid', 3);
      if (s <= N) { dips++; sumDef += N + 1 - s; } else if (s < N + 2) add('sum2', 0.15, true);
    }
    const dipOK = 0;
    if (dips > dipOK) add('sum', 2 * (dips - dipOK) + 0.5 * sumDef); else if (dips) add('sum3', 0.05 * dips, true);
    let sumS = 0;
    for (let c = 0; c < 3; c++) { let nl = 0; for (let i = 0; i < N; i++) { nl += pool[set[i]].cl[c]; sumS += pool[set[i]].camS[c]; } if (nl > N - 1) add('camMax', 10 * (nl - (N - 1))); else if (nl > N - 2) add('camMax2', 0.6, true); if (nl < 2) add('camMin', 10); }
    if (sumS < N + 2) add('camSum', 6 * (N + 2 - sumS));
    let ev = 0; for (let i = 0; i < N; i++) ev += pool[set[i]].ev > 0 ? exactEvents(pool[set[i]], ctx) : 0; const evNeed = N <= 6 ? GATE.occEvents : GATE.occEvents + 1; if (ev < evNeed) add('events', 8 * (evNeed - ev));
    let fl = 0;
    for (let q = 0; q < P; q++) { const a = pool[set[2 * q]], b = pool[set[2 * q + 1]]; fl += Math.max(a.anyD[0] + b.anyD[0], a.anyD[K1 - 1] + b.anyD[K1 - 1]); }
    for (let i = 2 * P; i < N; i++) fl += Math.max(pool[set[i]].anyD[0], pool[set[i]].anyD[K1 - 1]);
    if (fl >= N) add('firstLast', 8);
    return pen;
  };
  const rpick = () => good[Math.floor(rng.raw() * good.length)];
  const lurk = good.filter((i) => pool[i].hid.some((v) => v)), K0 = 0, KL = K1 - 1;
  const bothE = lurk.filter((i) => pool[i].hid[K0] && pool[i].hid[KL]);
  if (!bothE.length) return nul('no both-ender');
  const covers = (list) => { for (let k = 0; k < K1; k++) { let any = false; for (const i of list) if (pool[i].hid[k]) { any = true; break; } if (!any) return false; } return true; };
  const cores = [];
  for (const b of bothE) for (const l of lurk) if (l !== b && covers([b, l]) && md(b, l) >= dmin) cores.push([b, l]);
  if (cores.length < 60) for (let t = 0; t < 4000 && cores.length < 200; t++) {
    const b = bothE[Math.floor(rng.raw() * bothE.length)], l2 = lurk[Math.floor(rng.raw() * lurk.length)], l3 = lurk[Math.floor(rng.raw() * lurk.length)];
    if (new Set([b, l2, l3]).size < 3 || !covers([b, l2, l3]) || md(b, l2) < dmin || md(b, l3) < dmin || md(l2, l3) < dmin) continue;
    cores.push([b, l2, l3]);
  }
  if (!cores.length) return nul('no core');
  stat('cores', cores.length);
  const helpful = good.filter((i) => ['occ', 'ovl', 'anchor', 'cross'].includes(pool[i].r.fam));
  const plC = new Map();
  const partnerList = (c, sep) => { const key = c * 2 + (sep ? 1 : 0); let v = plC.get(key); if (!v) { v = good.filter((r) => r !== c && pa(c, r) && (!sep || ps(c, r))); plC.set(key, v); } return v; };
  const rnd = (arr) => arr[Math.floor(rng.raw() * arr.length)];
  const freePair = () => { for (let t = 0; t < 40; t++) { const a = rpick(), b = rpick(); if (a !== b && pa(a, b)) return [a, b]; } return null; };
  const single = () => (helpful.length && rng.raw() < 0.5 ? rnd(helpful) : rpick());
  for (let restart = 0; restart < 40; restart++) {
    const core0 = cores[Math.floor(rng.raw() * cores.length)], set = new Array(N).fill(-1);
    const groups = [];
    const sepC = core0.filter((c) => partnerList(c, true).length);
    if (!sepC.length) { stat('ls:nosep'); continue; }
    const c0 = rnd(sepC), rest = rng.shuffle(core0.filter((c) => c !== c0));
    let j = 0, sq = 2 * P, okInit = true;
    const placePair = (c, sep) => { set[2 * j] = c; const jj = j; groups.push({ pos: [2 * jj + 1], make: () => [rnd(partnerList(c, sep))] }); j++; };
    placePair(c0, true);
    for (const c of rest) {
      if (j < P && partnerList(c, false).length && rng.raw() < 0.5) placePair(c, false);
      else if (sq < N) set[sq++] = c;
      else if (j < P && partnerList(c, false).length) placePair(c, false);
      else { okInit = false; break; }
    }
    if (!okInit) { stat('ls:nopartner'); continue; }
    for (; j < P; j++) groups.push({ pos: [2 * j, 2 * j + 1], make: freePair });
    for (let q = sq; q < N; q++) groups.push({ pos: [q], make: () => [single()] });
    for (const g of groups) { for (let t = 0; t < 30; t++) { const v = g.make(); if (!v) break; v.forEach((x, k) => { set[g.pos[k]] = x; }); if (new Set(set.filter((x) => x >= 0)).size === set.filter((x) => x >= 0).length) break; } }
    if (set.some((x) => x < 0) || new Set(set).size < N) { stat('ls:dup'); continue; }
    let pen = penalty(set), hp = hardPen;
    for (let it = 0; it < 700 && !(hp === 0 && pen - hp <= 3); it++) {
      if (it === 160 && hp > 30) break;
      const g = rnd(groups), old = g.pos.map((q) => set[q]), v = g.make();
      if (!v) continue;
      g.pos.forEach((q, k) => { set[q] = v[k]; });
      if (new Set(set).size < N) { g.pos.forEach((q, k) => { set[q] = old[k]; }); continue; }
      const p2 = penalty(set), h2 = hardPen, temp = 1.2 * (1 - it / 700) + 0.05;
      if (p2 <= pen || rng.raw() < Math.exp(-(p2 - pen) / temp)) { pen = p2; hp = h2; } else g.pos.forEach((q, k) => { set[q] = old[k]; });
    }
    const okLS = hp === 0 && pen - hp <= 3;
    stat('ls:end', okLS ? 1 : 0);
    if (okLS) { const pairs = []; for (let q = 0; q < P; q++) pairs.push([set[2 * q], set[2 * q + 1]]); return { set, pairs }; }
  }
  return nul('selection');
}

export const _genStats = {};
const nul = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };
const stat = (k, v = 1) => { _genStats['n:' + k] = (_genStats['n:' + k] || 0) + v; };
const fail = (why) => { _genStats['check:' + why] = (_genStats['check:' + why] || 0) + 1; return why; };

function buildPool(rng, ctx) {
  const { A, T, K } = ctx, hasTri = A.zones.TRI.length >= 6, pool = [], U = (a, b) => rng.uniform(a, b);
  const aT = U(3.6, 5.0), bT = T - U(4.4, 6.0);
  ctx.aT = aT; ctx.bT = bT;
  const kA = Math.ceil((aT - 0.25) / DT), kB = Math.floor((bT + 0.25) / DT);
  for (const [fam, quota, tries] of FAMILIES) {
    let got = 0;
    for (let t = 0; t < tries && got < quota; t++) {
      let hp = null;
      if (fam === 'both') hp = { start: Math.max(0.3, aT - U(0.4, 2.0)), end: Math.max(0.3, T - bT - U(0.4, 2.0)) };
      if (fam === 'mid') hp = { mid: Math.max(2, bT - aT + U(0, 1.6)), tIn: aT - U(0.4, 1.0) };
      const r = makeRoute(rng, ctx, stagesOf(rng, fam, hasTri), hp);
      if (!r) { if (fam === 'mid') stat('mid:noroute'); continue; }
      const f = routeFeatures(ctx, r);
      if (fam === 'both') {
        if (!(f.hid[0] && f.hid[K])) continue;
        let k0 = 0; while (k0 <= K && f.hid[k0]) k0++;
        let k1 = K; while (k1 >= 0 && f.hid[k1]) k1--;
        if (Math.abs(k0 * DT - aT) > 1.0 || Math.abs((k1 + 1) * DT - bT) > 1.0) continue;
        let ok = true; for (let k = k0; k <= k1; k++) if (f.hid[k]) { ok = false; break; } if (!ok) continue;
      } else if (fam === 'mid') {
        if (f.hid[0] || f.hid[K]) { stat('mid:endhid'); continue; }
        let ok = true; for (let k = kA; k <= kB; k++) if (!f.hid[k]) { ok = false; break; } if (!ok) { stat('mid:window'); continue; }
      }
      r.fam = fam; pool.push(f); got++;
    }
  }
  return pool;
}
export function tryBuild(rng, C, layIn = null) {
  const U = (a, b) => rng.uniform(a, b);
  let t0 = performance.now();
  const lay = layIn || buildLayout(rng, C);
  stat('t:layout', performance.now() - t0);
  if (!lay) return null;
  stat('layout');
  const { m: base, A } = lay;
  const T = r3(DTF * (NF - 1)), K = NF - 1;
  const ctx = { m: base, A, T, K };
  t0 = performance.now();
  const pool = buildPool(rng, ctx);
  stat('t:pool', performance.now() - t0);
  stat('pool', pool.length);
  if (pool.length < 60) { lay.fails = (lay.fails || 0) + 1; return nul('pool'); }
  for (let it = 0; it < 40; it++) {
    t0 = performance.now();
    const sel = selectCast(rng, ctx, pool, C.N, C.P);
    stat('t:select', performance.now() - t0);
    if (!sel) { lay.fails = (lay.fails || 0) + 1; return null; }
    stat('selected');
    const m = assemble(rng, base, pool, sel, C, T);
    if (!m) continue;
    t0 = performance.now();
    const chk = check(m);
    stat('t:check', performance.now() - t0);
    if (chk === null) { stat('passed'); return m; }
  }
  return null;
}
function assemble(rng, base, pool, sel, C, T) {
  const U = (a, b) => rng.uniform(a, b);
  const nOut = C.N - C.P;
  const tops = rng.shuffle(W.TOPS.map((_, i) => i));
  const topIdx = [];
  for (const t of tops) {
    if (topIdx.length >= nOut) break;
    const nm = W.TOPS[t].name;
    if (nm === 'orange' && topIdx.some((q) => W.TOPS[q].name === 'red')) continue;
    if (nm === 'red' && topIdx.some((q) => W.TOPS[q].name === 'orange')) continue;
    topIdx.push(t);
  }
  if (topIdx.length < nOut) return nul('tops');
  const look = (ti) => ({ top: W.TOPS[ti].hex, colorName: W.TOPS[ti].name, bottom: rng.pick(W.BOTTOMS), hair: rng.pick(W.HAIRS), skin: rng.pick(W.SKINS), k: r3(U(0.94, 1.06)) });
  const people = []; let oi = 0;
  const addRoute = (ri, L, outfit, pair) => people.push({ ...L, ph: r3(U(0, 6.28)), outfit, pair, mv: structuredClone(pool[ri].r.mv), role: pool[ri].r.stages.join('>') });
  sel.pairs.forEach((pr, pi) => { const L = look(topIdx[oi]); addRoute(pr[0], L, oi, pi); addRoute(pr[1], L, oi, pi); oi++; });
  const inPair = new Set(sel.pairs.flat());
  for (const ri of sel.set) if (!inPair.has(ri)) { addRoute(ri, look(topIdx[oi]), oi, -1); oi++; }
  for (const p of people) stopFin(rng, p, p.mv.tv[p.mv.tv.length - 1][0], rng.sign() * U(20, 120) * DEG);
  const order = rng.shuffle(people.map((_, i) => i));
  const m = { ...base, people: order.map((i) => people[i]) };
  m.pairs = sel.pairs.map((_, pi) => m.people.map((p, i) => (p.pair === pi ? i : -1)).filter((i) => i >= 0));
  m.N = C.N; m.answer = C.N; m.T = T; m.hold = 0; m.task = NAME; m.live = false; m.lo = LO; m.hi = HI;
  return m;
}

const TRACKS = new WeakMap();
export function tracks(m, dt = DT) {
  let c = TRACKS.get(m); if (c && c.dt === dt) return c;
  const K = Math.floor(m.T / dt + 1e-9), n = m.people.length, pos = m.people.map(() => []), vis = [0, 1, 2].map(() => m.people.map(() => new Float32Array(K + 1))), oc = [0, 1, 2].map(() => m.people.map(() => new Float32Array(K + 1))), hpx = [0, 1, 2].map(() => m.people.map(() => new Float32Array(K + 1)));
  for (let k = 0; k <= K; k++) {
    const t = Math.min(m.T, k * dt), P = m.people.map((p) => W.poseAt(p, t));
    for (let i = 0; i < n; i++) pos[i].push([P[i].x, P[i].z, P[i].f[0], P[i].f[1], P[i].moving ? 1 : 0]);
    for (let c2 = 0; c2 < 3; c2++) for (let i = 0; i < n; i++) {
      const others = []; for (let j = 0; j < n; j++) if (j !== i) others.push([P[j].x, P[j].z, m.people[j].k]);
      const pr = W.visFrac(m, c2, P[i].x, P[i].z, m.people[i].k, others, true);
      vis[c2][i][k] = pr.vis; oc[c2][i][k] = pr.occStatic; hpx[c2][i][k] = W.heightPx(m, c2, P[i].x, P[i].z, m.people[i].k);
    }
  }
  c = { dt, K, pos, vis, oc, hpx };
  TRACKS.set(m, c);
  return c;
}
const outfitOf = (m, i) => m.people[i].outfit;
export function look(m, tau, offs = [0, 0, 0], rnd = null, noise = 0, thr = GATE.detect) {
  const dets = [[], [], []];
  const tcs = offs.map((o) => Math.max(0, Math.min(m.T, tau + o)));
  const cache = new Map();
  const poses = (t) => { let v = cache.get(t); if (!v) { v = m.people.map((p) => W.poseAt(p, t)); cache.set(t, v); } return v; };
  for (let c = 0; c < 3; c++) {
    const P = poses(tcs[c]);
    for (let i = 0; i < m.people.length; i++) {
      const others = []; for (let j = 0; j < m.people.length; j++) if (j !== i) others.push([P[j].x, P[j].z, m.people[j].k]);
      const v = W.visFrac(m, c, P[i].x, P[i].z, m.people[i].k, others);
      if (v < thr) continue;
      let nx = 0, nz = 0; if (noise > 0 && rnd) { const r = noise * Math.sqrt(rnd()), a = 2 * Math.PI * rnd(); nx = r * Math.cos(a); nz = r * Math.sin(a); }
      dets[c].push({ c, i, o: outfitOf(m, i), x: P[i].x + nx, z: P[i].z + nz, v });
    }
  }
  return { tau, dets };
}
export function clusters(L, thr = GATE.mergeDist) {
  const all = [].concat(...L.dets), cl = all.map((d, k) => ({ id: k, cams: 1 << d.c, o: d.o, members: [k] }));
  const parent = all.map((_, k) => k), find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const cams = all.map((d) => 1 << d.c), members = all.map((_, k) => [k]);
  const pairs = [];
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) if (all[a].o === all[b].o && all[a].c !== all[b].c) { const d = Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z); if (d <= thr) pairs.push([d, a, b]); }
  pairs.sort((p, q) => p[0] - q[0]);
  for (const [, a, b] of pairs) {
    const ra = find(a), rb = find(b); if (ra === rb) continue;
    if (cams[ra] & cams[rb]) continue;
    parent[rb] = ra; cams[ra] |= cams[rb]; members[ra] = members[ra].concat(members[rb]);
  }
  const out = new Map();
  for (let k = 0; k < all.length; k++) if (find(k) === k) out.set(all[k].o, (out.get(all[k].o) || 0) + 1);
  return out;
}
const sumMax = (maps) => { const mx = new Map(); for (const mp of maps) for (const [o, v] of mp) mx.set(o, Math.max(mx.get(o) || 0, v)); let s = 0; for (const v of mx.values()) s += v; return s; };
const camCounts = (L, c) => { const mp = new Map(); for (const d of L.dets[c]) mp.set(d.o, (mp.get(d.o) || 0) + 1); return mp; };
export const READERS = {
  correct: (m, looks) => sumMax(looks.map((L) => clusters(L))),
  sumCams: (m, looks) => [0, 1, 2].reduce((s, c) => s + sumMax(looks.map((L) => camCounts(L, c))), 0),
  maxCam: (m, looks) => Math.max(...[0, 1, 2].map((c) => sumMax(looks.map((L) => camCounts(L, c))))),
  outfits: (m, looks) => { const s = new Set(); for (const L of looks) for (const d of [].concat(...L.dets)) s.add(d.o); return s.size; },
  hybrid: (m, looks) => sumMax(looks.flatMap((L) => [0, 1, 2].map((c) => camCounts(L, c)))),
  snapSumMax: (m, looks) => Math.max(...looks.map((L) => L.dets[0].length + L.dets[1].length + L.dets[2].length)),
  snapSumMed: (m, looks) => { const v = looks.map((L) => L.dets[0].length + L.dets[1].length + L.dets[2].length).sort((a, b) => a - b); return v[v.length >> 1]; },
  unionMax: (m, looks) => Math.max(...looks.map((L) => { let s = 0; for (const v of clusters(L).values()) s += v; return s; })),
  camFrameMax: (m, looks) => Math.max(...looks.flatMap((L) => [0, 1, 2].map((c) => L.dets[c].length))),
  first: (m, looks) => READERS.correct(m, looks.slice(0, 1)),
  last: (m, looks) => READERS.correct(m, looks.slice(-1)),
  firstLast: (m, looks) => READERS.correct(m, [looks[0], looks[looks.length - 1]]),
};
export function denseLooks(m, step = DT) { const looks = []; for (let t = 0; t <= m.T + 1e-9; t += step) looks.push(look(m, Math.min(m.T, t))); return looks; }

const CHECK = new WeakMap();
export function check(m) {
  if (CHECK.has(m)) return CHECK.get(m);
  const r = checkImpl(m);
  CHECK.set(m, r);
  return r;
}
function checkImpl(m) {
  const G = GATE, n = m.people.length, N = m.N;
  if (n !== N || N < 5 || N > 9 || m.answer !== N) return fail('cast');
  if (m.pairs.length < 2 || m.pairs.length > 3) return fail('pairs');
  const outfits = new Set(m.people.map((p) => p.outfit));
  if (outfits.size !== N - m.pairs.length) return fail('outfits');
  const tops = new Set(m.people.map((p) => p.top)); if (tops.size !== outfits.size) return fail('tops');
  for (const pr of m.pairs) {
    const a = m.people[pr[0]], b = m.people[pr[1]];
    if (a.top !== b.top || a.bottom !== b.bottom || a.hair !== b.hair || a.skin !== b.skin || a.k !== b.k || a.outfit !== b.outfit) return fail('pair look');
  }
  if (!(Math.abs(m.T - DTF * (NF - 1)) < 1e-6)) return fail('T range');
  for (const p of m.people) if (endOf(p) > m.T - G.stand + 1e-6) return fail('stand');
  const tr = tracks(m), K = tr.K, dt = tr.dt;
  for (let t = 0; t <= m.T; t += 0.1) {
    const P = m.people.map((p) => W.poseAt(p, t));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) < G.minDist) return fail('collision');
    for (const pr of m.pairs) if (Math.hypot(P[pr[0]].x - P[pr[1]].x, P[pr[0]].z - P[pr[1]].z) < G.pairDist) return fail('pair close');
    for (let i = 0; i < n; i++) if (!walkableM(m, P[i].x, P[i].z)) return fail('off walkable');
  }
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) for (let k = 0; k <= K; k++) if (tr.vis[c][i][k] >= G.loose && tr.hpx[c][i][k] < G.minPx) return fail('size');
  const seenAny = (i, k) => tr.vis[0][i][k] >= G.strict || tr.vis[1][i][k] >= G.strict || tr.vis[2][i][k] >= G.strict;
  for (let i = 0; i < n; i++) { let tot = 0, run = 0, best = 0; for (let k = 0; k <= K; k++) { if (seenAny(i, k)) { tot += dt; run += dt; best = Math.max(best, run); } else run = 0; } if (tot < G.seenTotal || best < G.seenRun) return fail('seen ' + m.people[i].role + ' tot' + tot + ' run' + best); }
  let sumS = 0;
  for (let c = 0; c < 3; c++) {
    let nl = 0;
    for (let i = 0; i < n; i++) { let loose = false, st = 0; for (let k = 0; k <= K; k++) { if (tr.vis[c][i][k] >= G.loose) loose = true; if (tr.vis[c][i][k] >= G.strict) st += dt; } if (loose) nl++; if (st >= G.camSeconds) sumS++; }
    if (nl > N - 1) return fail('cam max');
  }
  if (sumS < N + 2) return fail('cam sum');
  for (let k = 0; k <= K; k++) { let any = false; for (let i = 0; i < n && !any; i++) if (tr.vis[0][i][k] < G.hidden && tr.vis[1][i][k] < G.hidden && tr.vis[2][i][k] < G.hidden) any = true; if (!any) return fail('nobody hidden'); }
  let sepPairs = 0;
  for (const pr of m.pairs) {
    let run = 0, best = 0, shared = false;
    for (let k = 0; k <= K; k++) {
      for (let c = 0; c < 3; c++) if (tr.vis[c][pr[0]][k] >= G.loose && tr.vis[c][pr[1]][k] >= G.loose) shared = true;
      if (seenAny(pr[0], k) && seenAny(pr[1], k)) { run += dt; best = Math.max(best, run); } else run = 0;
    }
    if (best < G.pairCo) return fail('pair together');
    let act = 0;
    for (let k = 0; k < K; k++) {
      if (!(seenAny(pr[0], k) && seenAny(pr[1], k))) continue;
      const sp = (i) => Math.hypot(tr.pos[i][k + 1][0] - tr.pos[i][k][0], tr.pos[i][k + 1][1] - tr.pos[i][k][1]) / dt;
      const sa = sp(pr[0]), sb = sp(pr[1]);
      if ((sa > 0.3 && sb < 0.12) || (sb > 0.3 && sa < 0.12)) act += dt;
    }
    if (act < G.pairAct) return fail('pair acts alike');
    if (!shared) sepPairs++;
  }
  if (sepPairs < 1) return fail('no separated pair');
  let eqN = 0, mxS = 0;
  for (let k = 0; k <= K; k++) { let s = 0; for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) if (tr.vis[c][i][k] >= G.strict) s++; if (s === N) eqN++; mxS = Math.max(mxS, s); }
  if (eqN / (K + 1) > G.sumSnap) return fail('snap sum');
  for (const k of [0, K]) { let s = 0; for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) if (tr.vis[c][i][k] >= G.strict) s++; if (s === N) return fail('snap sum at an end'); }
  if (mxS < N + 2) return fail('snap sum max');
  let events = 0;
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) {
    let k = 0;
    while (k <= K) {
      if (tr.oc[c][i][k] >= 0.4 && tr.vis[c][i][k] < 0.3) {
        let k1 = k; while (k1 + 1 <= K && tr.oc[c][i][k1 + 1] >= 0.4 && tr.vis[c][i][k1 + 1] < 0.3) k1++;
        const before = [], after = []; for (let q = Math.max(0, k - 2); q < k; q++) before.push(tr.vis[c][i][q]); for (let q = k1 + 1; q <= Math.min(K, k1 + 2); q++) after.push(tr.vis[c][i][q]);
        if ((k1 - k + 1) * dt >= 0.75 && before.some((v) => v >= G.strict) && after.some((v) => v >= G.strict)) events++;
        k = k1 + 1;
      } else k++;
    }
  }
  if (events < G.occEvents) return fail('occlusion events');
  const looks = denseLooks(m, DT);
  if (READERS.correct(m, looks) !== N) return fail('correct reading');
  for (const k of ['sumCams', 'maxCam', 'outfits', 'hybrid', 'snapSumMax', 'unionMax', 'camFrameMax', 'first', 'last', 'firstLast']) if (READERS[k](m, looks) === N) return fail('trap ' + k);
  if (frameAudit(m).singleFrame) return fail('single frame');
  return null;
}
function walkableM(m, x, z) {
  const X = m.plaza.X, Z = m.plaza.Z;
  if (Math.abs(x) > X - 0.5 || Math.abs(z) > Z - 0.5) return false;
  for (const P of m.props) if (P.kind !== 'pole' && Math.hypot(P.x - x, P.z - z) < W.propFoot(P) - 0.35) return false;
  return true;
}
export { exactEvents, buildPool, analyseLayout, buildLayout, makeRoute, routeFeatures, selectCast, FAMILIES, stagesOf, pairAny, pairSep };

export function frameAudit(m) {
  const looks = denseLooks(m, DT), N = m.N, hit = [];
  looks.forEach((L, k) => {
    const sum = L.dets[0].length + L.dets[1].length + L.dets[2].length, cl = [...clusters(L).values()].reduce((a, b) => a + b, 0);
    const out = new Set([].concat(...L.dets).map((d) => d.o)).size, mx = Math.max(L.dets[0].length, L.dets[1].length, L.dets[2].length);
    if (sum === N || cl === N || out === N || mx === N) hit.push(k);
  });
  return { singleFrame: hit.length > 0, framesThatDecide: hit, n: looks.length };
}
