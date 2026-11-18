import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { makeCam, makeScene, shape, lin, fbm, hash2, lineMask, render, toCanvas, contextScale, ringImage,
  pickNear, pickHit, objectStats, camDir, hitShape } from '../common/_door_swing_clear_rt.js';

export const BOARD = Object.freeze({ w: 640, h: 380 });
const PANEL_W = BOARD.w + 20;
const N_CAB = 6;
const D2R = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const u = (rng, a, b) => rng.uniform(a, b);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const HARD = Object.freeze({
  nCab: N_CAB,
  blocked: [2, 4],
  margin: 0.1,
  beside: 0.12,
  besideMax: 0.17,
  far: 0.3,
  deep: 0.22,
  edgeMax: 0.19,
  tall: 0.85,
  cabSep: 0.05, itemSep: 0.07,
  ovl: 0.03, near: 0.04, nearC: 0.02, bigH: 0.05, bigV: 1.1,
  doorVis: 0.55, itemVis: 0.6, partPx: 6,
  frame: 8, hit: 7, step: 2,
});
const DOOR_T = 0.022, PLINTH = 0.075, TOP_T = 0.03, OVER = 0.012;

function cabGeom(rd, i, flip = false) {
  const c = rd.cabs[i], W = rd.W, left = (c.hinge === 'L') !== flip;
  return { x0: c.x, x1: c.x + W, s: left ? 1 : -1, hx: left ? c.x + 0.003 : c.x + W - 0.003, hz: DOOR_T, W, R: W + 0.004 };
}
const toWorld = (g, a, b) => [g.hx + g.s * a, g.hz + b];
export function sdSector(a, b, R) {
  if (a >= 0 && b >= 0) { const r = Math.hypot(a, b); return r <= R ? -Math.min(a, b, R - r) : r - R; }
  if (a < 0 && b >= 0) return b <= R ? -a : Math.hypot(a, b - R);
  if (b < 0 && a >= 0) return a <= R ? -b : Math.hypot(a - R, b);
  return Math.hypot(a, b);
}
function footPoly(it) {
  if (it.r !== undefined) {
    const n = 24, R = it.r / Math.cos(Math.PI / n);
    return Array.from({ length: n }, (_, k) => [it.x + R * Math.cos(2 * Math.PI * k / n), it.z + R * Math.sin(2 * Math.PI * k / n)]);
  }
  const a = it.yaw * D2R, ca = Math.cos(a), sa = Math.sin(a), hx = it.fw / 2, hz = it.fd / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [it.x + ca * p * hx + sa * q * hz, it.z - sa * p * hx + ca * q * hz]);
}
const OFFS = new WeakMap();
function footOffsets(it) {
  const key = it.r !== undefined ? `c${it.r}` : `r${it.fw},${it.fd},${it.yaw}`;
  if (it.__k === key && OFFS.has(it)) return OFFS.get(it);
  const out = [];
  if (it.r !== undefined) {
    const n = Math.ceil(it.r / 0.01);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const x = i * it.r / n, z = j * it.r / n; if (x * x + z * z <= it.r * it.r + 1e-12) out.push(x, z); }
    for (let k = 0; k < 72; k++) out.push(it.r * Math.cos(k * Math.PI / 36), it.r * Math.sin(k * Math.PI / 36));
  } else {
    const a = it.yaw * D2R, ca = Math.cos(a), sa = Math.sin(a), hx = it.fw / 2, hz = it.fd / 2;
    const nx = Math.ceil(it.fw / 0.01), nz = Math.ceil(it.fd / 0.01);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const p = -hx + i * it.fw / nx, q = -hz + j * it.fd / nz; out.push(ca * p + sa * q, -sa * p + ca * q); }
  }
  const arr = Float64Array.from(out);
  Object.defineProperty(it, '__k', { value: key, writable: true, enumerable: false, configurable: true });
  OFFS.set(it, arr);
  return arr;
}
function minSdAt(offs, cx, cz, g) {
  let m = Infinity;
  for (let k = 0; k < offs.length; k += 2) {
    const d = sdSector(g.s * (cx + offs[k] - g.hx), cz + offs[k + 1] - g.hz, g.R);
    if (d < m) m = d;
  }
  return m;
}
const minSd = (it, g) => minSdAt(footOffsets(it), it.x, it.z, g);
function ext(it) {
  if (it.r !== undefined) return [it.r, it.r];
  const a = it.yaw * D2R, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
  return [ca * it.fw / 2 + sa * it.fd / 2, sa * it.fw / 2 + ca * it.fd / 2];
}

function cross(ax, az, bx, bz, cx, cz) { return (bx - ax) * (cz - az) - (bz - az) * (cx - ax); }
function inPoly(P, x, z) {
  let pos = false, neg = false;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], c = cross(p[0], p[1], q[0], q[1], x, z);
    if (c > 1e-12) pos = true; else if (c < -1e-12) neg = true;
    if (pos && neg) return false;
  }
  return true;
}
function ptSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - ax - t * vx, pz - az - t * vz);
}
function segSeg(a, b, c, d) {
  const d1 = cross(c[0], c[1], d[0], d[1], a[0], a[1]), d2 = cross(c[0], c[1], d[0], d[1], b[0], b[1]);
  const d3 = cross(a[0], a[1], b[0], b[1], c[0], c[1]), d4 = cross(a[0], a[1], b[0], b[1], d[0], d[1]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(ptSeg(a[0], a[1], c[0], c[1], d[0], d[1]), ptSeg(b[0], b[1], c[0], c[1], d[0], d[1]),
    ptSeg(c[0], c[1], a[0], a[1], b[0], b[1]), ptSeg(d[0], d[1], a[0], a[1], b[0], b[1]));
}
function polyDist(P, Q) {
  if (P.length > 2 && Q.some((q) => inPoly(P, q[0], q[1]))) return -1;
  if (Q.length > 2 && P.some((p) => inPoly(Q, p[0], p[1]))) return -1;
  let m = Infinity;
  const ep = P.length > 2 ? P.length : 1, eq = Q.length > 2 ? Q.length : 1;
  for (let i = 0; i < ep; i++) for (let j = 0; j < eq; j++) m = Math.min(m, segSeg(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]));
  return m;
}
function cabKeep(rd, i) {
  const c = rd.cabs[i], x0 = c.x - OVER, x1 = c.x + rd.W + OVER, z0 = -rd.Dc, z1 = DOOR_T + OVER;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

const KINDS = ['carton', 'chair', 'stool', 'bin', 'plant', 'table', 'stack'];
function pieceDims(rng, kind, W, tall) {
  switch (kind) {
    case 'carton': { const fw = W * u(rng, 0.56, 0.7); return { kind, fw: r3(fw), fd: r3(fw * u(rng, 0.76, 1)), h: r3(u(rng, 0.3, 0.5)), yaw: r3(u(rng, -18, 18)), tone: rng.int(0, 2) }; }
    case 'stack': { const fw = W * u(rng, 0.58, 0.7), h1 = u(rng, 0.44, 0.52); return { kind, fw: r3(fw), fd: r3(fw * u(rng, 0.8, 1)), h1: r3(h1), h: r3(h1 + u(rng, 0.41, 0.48)), k2: r3(u(rng, 0.8, 0.9)), yaw: r3(u(rng, -15, 15)), tone: rng.int(0, 2) }; }
    case 'chair': { const fw = W * u(rng, 0.62, 0.7), sh = u(rng, 0.43, 0.47); return { kind, fw: r3(fw), fd: r3(fw), sh: r3(sh), h: r3(sh + u(rng, 0.38, 0.44)), yaw: r3(u(rng, 0, 360)), tone: rng.int(0, 2) }; }
    case 'table': { const fw = W * u(rng, 0.58, 0.7); return { kind, fw: r3(fw), fd: r3(fw * u(rng, 0.85, 1)), h: r3(u(rng, 0.5, 0.6)), yaw: r3(u(rng, -20, 20)), tone: rng.int(0, 2) }; }
    case 'stool': return { kind, r: r3(W * u(rng, 0.28, 0.34)), h: r3(u(rng, 0.48, 0.62)), tone: rng.int(0, 2) };
    case 'bin': return { kind, r: r3(W * u(rng, 0.27, 0.33)), h: r3(u(rng, 0.38, 0.55)), tone: rng.int(0, 2) };
    case 'plant': { const r = W * u(rng, 0.29, 0.35); return { kind, r: r3(r), rp: r3(r * u(rng, 0.68, 0.78)), hp: r3(u(rng, 0.24, 0.32)), h: r3(tall ? u(rng, 1.0, 1.25) : u(rng, 0.58, 0.78)), tone: rng.int(0, 2), seed: rng.int(0, 999) }; }
    default: throw new Error(`door_swing_clear: kind ${kind}`);
  }
}
const isTall = (it) => it.h >= HARD.tall;

function pieceProblem(rd, j, role, it, placed) {
  const P = footPoly(it);
  if (P.some((p) => p[1] < -rd.Dc + 0.015)) return 'wall';
  for (let k = 0; k < rd.cabs.length; k++) if (polyDist(P, cabKeep(rd, k)) < HARD.cabSep) return 'cab';
  for (const o of placed) if (o !== it && polyDist(P, footPoly(o)) < HARD.itemSep) return 'piece';
  let own = 0;
  for (let k = 0; k < rd.cabs.length; k++) {
    const sd = minSd(it, cabGeom(rd, k));
    if (Math.abs(sd) < HARD.margin) return 'margin';
    if (k !== j && sd < 0) return 'other-door';
    if (k === j) own = sd;
  }
  const g = cabGeom(rd, j), W = rd.W, ca = g.s * (it.x - g.hx), cb = it.z - g.hz;
  if (role === 'plain') return own <= -HARD.deep * W ? '' : 'plain';
  if (role === 'edge') return own >= -HARD.edgeMax && own <= -HARD.margin && sdSector(ca, cb, g.R) >= 0.02 ? '' : 'edge';
  if (role === 'corner') return own >= HARD.margin && own <= HARD.edgeMax && ca > 0.2 * W ? '' : 'corner';
  if (role === 'far' || role === 'farlow') return own >= HARD.far * W && ca >= 0 && ca <= W && (role === 'far') === isTall(it) ? '' : 'far';
  if (role === 'beside') return own >= HARD.beside && ca < 0 ? '' : 'beside';
  if (role === 'besideH') return own >= HARD.beside && ca > W ? '' : 'besideH';
  return 'role';
}
function placePiece(rng, rd, j, role, it, placed) {
  const g = cabGeom(rd, j), W = rd.W, offs = footOffsets(it), [ex, ez] = ext(it);
  const bisect = (lo, hi, at, target) => {
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2, [x, z] = at(mid); if (minSdAt(offs, x, z, g) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  for (let at = 0; at < 20; at++) {
    let a, b;
    if (role === 'plain') {
      const rho = u(rng, 0.3, 0.7) * W, ph = u(rng, 12, 78) * D2R; a = rho * Math.cos(ph); b = rho * Math.sin(ph);
    } else if (role === 'edge' || role === 'corner') {
      const ph = (role === 'edge' ? u(rng, 76, 98) : u(rng, 34, 64)) * D2R;
      const target = (role === 'edge' ? -1 : 1) * u(rng, HARD.margin + 0.012, HARD.edgeMax - 0.012);
      const rho = bisect(0.1 * W, 2.6 * W, (q) => toWorld(g, q * Math.cos(ph), q * Math.sin(ph)), target);
      a = rho * Math.cos(ph); b = rho * Math.sin(ph);
    } else if (role === 'far' || role === 'farlow') {
      a = u(rng, 0.12, 0.88) * W;
      b = bisect(0, 3.2 * W, (q) => toWorld(g, a, q), u(rng, HARD.far + 0.04, 0.62) * W);
    } else {
      const c = u(rng, HARD.beside + 0.012, HARD.besideMax);
      a = role === 'beside' ? -(c + ex) : g.R + c + ex;
      b = u(rng, -0.6, 0.5) * ez;
    }
    const [x, z] = toWorld(g, a, b);
    it.x = r3(x); it.z = r3(z);
    if (!pieceProblem(rd, j, role, it, placed)) return true;
  }
  return false;
}

const CAB_PAINTS = ['#5f7f6a', '#3d5875', '#6e7f8e', '#7f3f36', '#5a6448', '#3c6a6e', '#8a6a3c', '#4f4a5e'];
const WALLS = ['#e7e1d5', '#dfe3e2', '#ece5da', '#e2d7c8', '#d9ddd2'];
const FLOORS = ['#c3beb5', '#aeb2b4', '#cbc3b2', '#b8b0a4', '#c9c6be'];

function planRoles(rng) {
  const kb = rng.int(HARD.blocked[0], HARD.blocked[1]), kc = N_CAB - kb;
  const clear = kc === 2 ? ['corner', 'beside'] : ['corner', 'beside', 'far'];
  if (kc === 4) clear.push(rng.pick(['farlow', 'besideH', 'far', 'farlow']));
  const blocked = ['edge', ...Array(kb - 1).fill('plain')];
  return rng.shuffle([...clear, ...blocked]);
}
function sideOf(role, hinge) {
  if (role === 'beside') return hinge === 'L' ? -1 : 1;
  if (role === 'besideH') return hinge === 'L' ? 1 : -1;
  return 0;
}
const STATS = {};
const rej = (why) => { STATS[why] = (STATS[why] || 0) + 1; return null; };
function tryRound(rng, roles) {
  const T = r3(u(rng, 0.27, 0.31)), W = r3(2 * T);
  const rd = { T, W, Dc: r3(u(rng, 0.42, 0.5)), Hc: r3(u(rng, 1.34, 1.56)), cabs: [], items: [], answer: [] };
  const hinges = roles.map(() => (rng.raw() < 0.5 ? 'L' : 'R'));
  const need = new Array(N_CAB - 1).fill(0);
  for (let i = 0; i < N_CAB; i++) {
    const sd = sideOf(roles[i], hinges[i]);
    if (sd < 0 && i > 0) need[i - 1]++;
    if (sd > 0 && i < N_CAB - 1) need[i]++;
  }
  if (need.some((n) => n > 1)) return rej('gap-clash');
  const gaps = need.map((n) => (n ? 3 : rng.raw() < 0.3 ? 2 : 1));
  let x = 0;
  const xs = [];
  for (let i = 0; i < N_CAB; i++) { xs.push(x); x += 2 + (gaps[i] || 0); }
  const off = -Math.round(x / 2) + 0;
  rd.cabs = xs.map((t, i) => ({ x: r3((t + off) * T), hinge: hinges[i] }));
  const bag = rng.shuffle([...KINDS, ...KINDS]);
  const placed = [];
  const order = rng.shuffle(roles.map((_, i) => i)).sort((p, q) => (roles[p].startsWith('beside') ? 0 : 1) - (roles[q].startsWith('beside') ? 0 : 1));
  const items = new Array(N_CAB);
  for (const i of order) {
    const role = roles[i];
    let kind, tall = false;
    if (role === 'far') { kind = rng.raw() < 0.55 ? 'plant' : 'stack'; tall = true; }
    else {
      const k = bag.findIndex((q) => q !== 'stack' || role !== 'farlow');
      kind = bag.splice(k, 1)[0];
      tall = kind === 'plant' && role !== 'farlow' && rng.raw() < 0.25;
      if (role === 'farlow' && (kind === 'stack' || kind === 'chair')) kind = 'carton';
    }
    let ok = false;
    for (let a = 0; a < 3 && !ok; a++) {
      const it = { ...pieceDims(rng, kind, W, tall), cab: i, role };
      if (placePiece(rng, rd, i, role, it, placed)) { items[i] = it; placed.push(it); ok = true; }
    }
    if (!ok) return rej(`place-${role}`);
  }
  rd.items = items;
  rd.look = { cab: rng.int(0, CAB_PAINTS.length - 1), wall: rng.int(0, WALLS.length - 1), floor: rng.int(0, FLOORS.length - 1),
    metal: rng.int(0, 1), wood: rng.int(0, 2) };
  rd.light = { az: r3((rng.raw() < 0.5 ? -1 : 1) * u(rng, 30, 62)), el: r3(u(rng, 44, 58)) };
  rd.answer = truth(rd).clear;
  const kb = N_CAB - rd.answer.length;
  if (kb < HARD.blocked[0] || kb > HARD.blocked[1]) return rej('count');
  const geo = shortcutsGeo(rd);
  if (geo) return rej(`geo-${geo}`);
  const cam0 = { az: r3((rng.raw() < 0.5 ? -1 : 1) * u(rng, 3, 12)), el: r3(u(rng, 48, 60)), fov: 30 };
  rd.cam = fitCamera(rd, cam0);
  if (!rd.cam) return rej('camera');
  const sc = buildScene(rd);
  const sp = sceneProblem(rd, sc);
  if (sp) return rej(`scene-${sp}`);
  rd.pts = rd.cabs.map((_, i) => { const st = objectStats(sc, i, HARD.step); return [r3(st.pt[0]), r3(st.pt[1])]; });
  for (let i = 0; i < N_CAB; i++) if (pickNear(sc, rd.pts[i][0], rd.pts[i][1], HARD.hit, (id) => id < N_CAB) !== i) return rej('pick');
  STATS.ok = (STATS.ok || 0) + 1;
  return rd;
}
function makeRound(rng) {
  for (let a = 0; a < 600; a++) {
    const roles = planRoles(rng);
    for (let b = 0; b < 4; b++) {
      const rd = tryRound(rng, roles);
      if (rd) return rd;
    }
  }
  throw new Error('door_swing_clear: sampler exhausted');
}

export function truth(rd, flip = false) {
  const sd = rd.items.map((it) => rd.cabs.map((_, i) => minSd(it, cabGeom(rd, i, flip))));
  const blocked = rd.cabs.map((_, i) => sd.some((row) => row[i] < 0));
  return { sd, blocked, clear: blocked.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0) };
}
export function proxies(rd) {
  const doors = rd.cabs.map((c) => [[c.x, DOOR_T], [c.x + rd.W, DOOR_T]]);
  const polys = rd.items.map(footPoly);
  const d1 = [], d2 = [], hgt = [], vol = [];
  for (let i = 0; i < N_CAB; i++) {
    let best = Infinity, bj = -1, c2 = Infinity;
    const mx = rd.cabs[i].x + rd.W / 2;
    rd.items.forEach((it, j) => {
      const d = Math.max(0, polyDist(polys[j], doors[i]));
      if (d < best) { best = d; bj = j; }
      c2 = Math.min(c2, Math.hypot(it.x - mx, it.z - DOOR_T));
    });
    const it = rd.items[bj], area = it.r !== undefined ? Math.PI * it.r * it.r : it.fw * it.fd;
    d1.push(best); d2.push(c2); hgt.push(it.h); vol.push(area * it.h);
  }
  const mirror = truth(rd, true).clear;
  const square = [], centre = [];
  for (let i = 0; i < N_CAB; i++) {
    const g = cabGeom(rd, i), sq = [[0, 0], [rd.W, 0], [rd.W, rd.W], [0, rd.W]].map(([a, b]) => toWorld(g, a, b));
    if (!polys.some((P) => polyDist(P, sq) <= 0)) square.push(i);
    if (!rd.items.some((it) => sdSector(g.s * (it.x - g.hx), it.z - g.hz, g.R) < 0)) centre.push(i);
  }
  return { d1, d2, hgt, vol, mirror, square, centre };
}
function thresholdSplits(v, clearSet, clearHigh, margin, ratio = false) {
  const A = [], B = [];
  v.forEach((x, i) => (clearSet.has(i) ? A : B).push(x));
  if (!A.length || !B.length) return true;
  if (clearHigh) return ratio ? Math.min(...A) * margin > Math.max(...B) : Math.min(...A) > Math.max(...B) - margin;
  return ratio ? Math.max(...A) < Math.min(...B) * margin : Math.max(...A) < Math.min(...B) + margin;
}
const sameSet = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
const DESIGN = { skip: new Set() };
function shortcutsGeo(rd, skip = DESIGN.skip) {
  const P = proxies(rd), A = new Set(rd.answer);
  if (thresholdSplits(P.d1, A, true, HARD.near)) return 'nearest-gap';
  if (!skip.has('nearest-centre') && thresholdSplits(P.d2, A, true, HARD.nearC)) return 'nearest-centre';
  if (thresholdSplits(P.hgt, A, false, HARD.bigH)) return 'biggest-height';
  if (thresholdSplits(P.vol, A, false, HARD.bigV, true)) return 'biggest-bulk';
  if (sameSet(P.mirror, rd.answer)) return 'mirror-hinge';
  if (sameSet(P.square, rd.answer)) return 'square';
  if (sameSet(P.centre, rd.answer)) return 'centre';
  return '';
}

function scenePoints(rd) {
  const pts = [];
  for (const c of rd.cabs) for (const x of [c.x - OVER, c.x + rd.W + OVER]) for (const y of [0, rd.Hc + TOP_T]) for (const z of [-rd.Dc, DOOR_T + OVER]) pts.push([x, y, z]);
  for (const it of rd.items) for (const p of footPoly(it)) { pts.push([p[0], 0, p[1]]); pts.push([p[0], it.h, p[1]]); }
  return pts;
}
function camFrom(c) {
  const a = c.az * D2R, e = c.el * D2R, T = c.target;
  const eye = [T[0] + Math.sin(a) * Math.cos(e) * c.dist, T[1] + Math.sin(e) * c.dist, T[2] + Math.cos(a) * Math.cos(e) * c.dist];
  return makeCam({ eye, target: T, fovY: c.fov, W: BOARD.w, H: BOARD.h, shiftX: c.sx || 0, shiftY: c.sy || 0 });
}
function projBox(cam, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); if (q.z <= 0.1) return null; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return [x0, y0, x1, y1];
}
function fitCamera(rd, c0) {
  const pts = scenePoints(rd);
  let zx0 = Infinity, zx1 = -Infinity, zz0 = Infinity, zz1 = -Infinity;
  for (const p of pts) { zx0 = Math.min(zx0, p[0]); zx1 = Math.max(zx1, p[0]); zz0 = Math.min(zz0, p[2]); zz1 = Math.max(zz1, p[2]); }
  const target = [r3((zx0 + zx1) / 2), 0.5, r3((zz0 + zz1) / 2)];
  const room = 2 * (HARD.frame + 4);
  const fits = (d) => { const b = projBox(camFrom({ ...c0, target, dist: d }), pts); return b && b[2] - b[0] <= BOARD.w - room && b[3] - b[1] <= BOARD.h - room; };
  let lo = 3, hi = 30;
  if (!fits(hi)) return null;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  const dist = r3(hi + 0.002);
  const b = projBox(camFrom({ ...c0, target, dist }), pts);
  return { ...c0, target, dist, sx: r3(BOARD.w / 2 - (b[0] + b[2]) / 2), sy: r3(BOARD.h / 2 - (b[1] + b[3]) / 2) };
}

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function tag(s, part) { s.part = part; return s; }
function cabinetShapes(rd, i, M) {
  const c = rd.cabs[i], W = rd.W, Dc = rd.Dc, Hc = rd.Hc, xm = c.x + W / 2, out = [];
  out.push(tag(shape.box(i, M.body, xm, PLINTH + (Hc - PLINTH) / 2, -Dc / 2, W / 2, (Hc - PLINTH) / 2, Dc / 2, 0, 0.004), 'body'));
  out.push(tag(shape.box(i, M.plinth, xm, PLINTH / 2, (-Dc + 0.01 - 0.045) / 2, W / 2 - 0.015, PLINTH / 2, (Dc - 0.01 - 0.045) / 2, 0, 0), 'body'));
  out.push(tag(shape.box(i, M.top, xm, Hc + TOP_T / 2, (-Dc + DOOR_T + OVER) / 2, W / 2 + OVER, TOP_T / 2, (Dc + DOOR_T + OVER) / 2, 0, 0.008), 'body'));
  const y0 = PLINTH + 0.012, y1 = Hc - 0.016;
  out.push(tag(shape.box(i, M.door, xm, (y0 + y1) / 2, DOOR_T / 2, W / 2 - 0.004, (y1 - y0) / 2, DOOR_T / 2, 0, 0.004), 'door'));
  const left = c.hinge === 'L', free = left ? c.x + W - 0.004 : c.x + 0.004, xh = free + (left ? -0.058 : 0.058);
  const hy0 = Hc * 0.42, hy1 = hy0 + 0.3, zf = DOOR_T + 0.034;
  out.push(tag(shape.capsule(i, M.metal, xh, hy0, zf, xh, hy1, zf, 0.011), 'handle'));
  for (const y of [hy0 + 0.025, hy1 - 0.025]) out.push(tag(shape.capsule(i, M.metal, xh, y, DOOR_T, xh, y, zf, 0.008), 'handle'));
  const he = left ? c.x + 0.004 : c.x + W - 0.004, sg = left ? 1 : -1;
  for (const y of [y0 + 0.17, (y0 + y1) / 2, y1 - 0.17]) {
    out.push(tag(shape.cyl(i, M.brass, he, DOOR_T + 0.002, y - 0.055, y + 0.055, 0.016, 0.004), 'hinge'));
    out.push(tag(shape.box(i, M.brass, he + sg * 0.026, y, DOOR_T + 0.0016, 0.024, 0.048, 0.0016, 0, 0), 'hinge'));
  }
  return out;
}
function partXZ(it, lx, lz) {
  const a = (it.yaw || 0) * D2R, ca = Math.cos(a), sa = Math.sin(a);
  return [it.x + ca * lx + sa * lz, it.z - sa * lx + ca * lz];
}
function pieceShapes(it, id, M) {
  const out = [], y = it.yaw || 0;
  if (it.kind === 'carton') out.push(shape.box(id, M.kraft, it.x, it.h / 2, it.z, it.fw / 2, it.h / 2, it.fd / 2, y, 0.006));
  else if (it.kind === 'stack') {
    out.push(shape.box(id, M.kraft, it.x, it.h1 / 2, it.z, it.fw / 2, it.h1 / 2, it.fd / 2, y, 0.006));
    const h2 = it.h - it.h1;
    out.push(shape.box(id, M.kraft2, it.x, it.h1 + h2 / 2, it.z, it.fw / 2 * it.k2, h2 / 2, it.fd / 2 * it.k2, y, 0.006));
  } else if (it.kind === 'chair') {
    const hx = it.fw / 2, hz = it.fd / 2, lw = 0.019, sh = it.sh;
    out.push(shape.box(id, M.wood, it.x, sh - 0.02, it.z, hx, 0.02, hz, y, 0.006));
    for (const p of [-1, 1]) for (const q of [-1, 1]) {
      const [x, z] = partXZ(it, p * (hx - 0.03), q * (hz - 0.03));
      out.push(shape.box(id, M.wood, x, (sh - 0.04) / 2, z, lw, (sh - 0.04) / 2, lw, y, 0));
    }
    for (const p of [-1, 1]) {
      const [x, z] = partXZ(it, p * (hx - 0.03), -(hz - 0.03));
      out.push(shape.box(id, M.wood, x, (sh + it.h) / 2, z, lw, (it.h - sh) / 2, lw, y, 0));
    }
    const [bx, bz] = partXZ(it, 0, -(hz - 0.03));
    out.push(shape.box(id, M.wood, bx, it.h - 0.07, bz, hx - 0.012, 0.06, 0.014, y, 0.004));
    out.push(shape.box(id, M.wood, bx, sh + 0.17, bz, hx - 0.03, 0.022, 0.012, y, 0));
  } else if (it.kind === 'table') {
    const hx = it.fw / 2, hz = it.fd / 2;
    out.push(shape.box(id, M.wood, it.x, it.h - 0.016, it.z, hx, 0.016, hz, y, 0.006));
    for (const p of [-1, 1]) for (const q of [-1, 1]) {
      const [x, z] = partXZ(it, p * (hx - 0.04), q * (hz - 0.04));
      out.push(shape.box(id, M.wood, x, (it.h - 0.032) / 2, z, 0.021, (it.h - 0.032) / 2, 0.021, y, 0));
    }
    out.push(shape.box(id, M.wood, it.x, 0.16, it.z, hx - 0.05, 0.01, hz - 0.05, y, 0));
  } else if (it.kind === 'stool') {
    out.push(shape.cyl(id, M.wood, it.x, it.z, it.h - 0.035, it.h, it.r, 0.012));
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * Math.PI / 2;
      out.push(shape.capsule(id, M.wood, it.x + 0.55 * it.r * Math.cos(a), it.h - 0.04, it.z + 0.55 * it.r * Math.sin(a),
        it.x + 0.86 * it.r * Math.cos(a), 0.016, it.z + 0.86 * it.r * Math.sin(a), 0.016));
    }
  } else if (it.kind === 'bin') {
    const r = it.r - 0.008;
    out.push(shape.frustum(id, M.bin, it.x, it.z, 0, it.h - 0.03, r * 0.86, r));
    out.push(shape.cyl(id, M.lid, it.x, it.z, it.h - 0.032, it.h, it.r, 0.012));
  } else if (it.kind === 'plant') {
    out.push(shape.frustum(id, M.pot, it.x, it.z, 0, it.hp, it.rp * 0.78, it.rp));
    out.push(shape.cyl(id, M.soil, it.x, it.z, it.hp - 0.03, it.hp - 0.018, it.rp - 0.012, 0));
    const top = it.h, base = it.hp - 0.02, n = top - base > 0.6 ? 3 : 2, r = it.r;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, cy = base + (top - base) * f, ry = (top - base) / n * 0.62;
      const rr = r * (k === n - 1 ? 0.72 : 0.96 - 0.08 * k), ph = (it.seed * 0.37 + k * 2.1);
      const ox = (r - rr) * 0.6 * Math.cos(ph), oz = (r - rr) * 0.6 * Math.sin(ph);
      out.push(shape.ellipsoid(id, M.leaf, it.x + ox, cy, it.z + oz, rr, ry, rr, IDENT));
    }
  }
  return out;
}

const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function paintTex(hex, k0 = 1) {
  const c = lin(hex);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const k = k0 * (0.965 + 0.05 * fbm(x * 9 + z * 7, y * 9, 2, fp * 9));
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}
function doorTex(hex) {
  const c = lin(hex);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    let k = 0.97 + 0.05 * fbm(x * 9, y * 9, 2, fp * 9);
    if (nz > 0.7) {
      const d = Math.min(s.hx - Math.abs(x - s.cx), s.hy - Math.abs(y - s.cy)), g = 0.055;
      const w = clamp01((0.0045 - Math.abs(d - g)) / Math.max(fp, 1e-4) + 0.5);
      if (d > g) k *= 0.965;
      k *= 1 - 0.42 * w;
      if (d > g + 0.0045 && d < g + 0.011) k *= 1.04;
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}
function woodTex(hex) {
  const c = lin(hex);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const g = fbm((x + z) * 3, y * 40 + (x - z) * 6, 3, fp * 40), k = 0.86 + 0.24 * g;
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  };
}
const TAPE = lin('#d8c49a');
function kraftTex(hex) {
  const c = lin(hex);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    let col = c, k = 0.9 + 0.14 * fbm(x * 30 + z * 3, y * 30 + z * 17, 3, fp * 30);
    const l2 = (x - s.cx) * s.sa + (z - s.cz) * s.ca;
    if (ny > 0.7 && Math.abs(l2) < 0.028) { col = TAPE; k = 1.02; }
    else if (ny < 0.7 && Math.abs(l2) < 0.028 && y > s.cy + s.hy - 0.09) { col = TAPE; k = 0.98; }
    out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
  };
}
function leafTex(hex) {
  const c = lin(hex);
  return (x, y, z, nx, ny, nz, s, out, fp) => {
    const g = fbm(x * 38 + 3, y * 38 + z * 29, 3, fp * 38), v = fbm(x * 9, z * 9 + y * 4, 2, fp * 9);
    const k = (0.45 + 0.85 * smooth(0.25, 0.75, g)) * (0.85 + 0.3 * v);
    out[0] = c[0] * k * (0.9 + 0.2 * v); out[1] = c[1] * k; out[2] = c[2] * k;
  };
}
const CHAIR_WOODS = ['#a8733f', '#6e4a30', '#c49a62'], TABLE_WOODS = ['#8a5a34', '#b88a58', '#5e4030'];
const BIN_COLS = ['#a3a8ad', '#3f6fa3', '#d9d4ca'], POT_COLS = ['#b5653a', '#d8d1c3', '#3d3f45'], KRAFT = ['#b98f5c', '#a97e4c', '#c49d6c'];
function makeMats(rd) {
  const L = rd.look, mats = [], M = {};
  const add = (k, m) => { M[k] = mats.length; mats.push(m); };
  const paint = CAB_PAINTS[L.cab], dark = '#' + lin(paint).map((v) => Math.round(255 * Math.pow(v * 0.55, 1 / 2.2)).toString(16).padStart(2, '0')).join('');
  add('body', { c: lin(paint), ks: 0.08, sh: 20, tex: paintTex(paint, 0.94) });
  add('top', { c: lin(paint), ks: 0.12, sh: 24, tex: paintTex(paint, 1.0) });
  add('door', { c: lin(paint), ks: 0.12, sh: 26, tex: doorTex(paint) });
  add('plinth', { c: lin(dark), ks: 0.04, sh: 10 });
  add('metal', L.metal ? { c: lin('#2c2c2e'), ks: 0.55, sh: 45, env: 0.12 } : { c: lin('#c9c6bf'), ks: 0.7, sh: 60, env: 0.2 });
  add('brass', { c: lin('#c29a45'), ks: 0.65, sh: 50, env: 0.15 });
  return { mats, M };
}
function pieceMats(it, mats) {
  const add = (m) => { mats.push(m); return mats.length - 1; };
  const M = {};
  if (it.kind === 'chair') M.wood = add({ c: lin(CHAIR_WOODS[it.tone]), ks: 0.1, sh: 18, tex: woodTex(CHAIR_WOODS[it.tone]) });
  if (it.kind === 'table') M.wood = add({ c: lin(TABLE_WOODS[it.tone]), ks: 0.12, sh: 20, tex: woodTex(TABLE_WOODS[it.tone]) });
  if (it.kind === 'stool') M.wood = add({ c: lin(CHAIR_WOODS[(it.tone + 2) % 3]), ks: 0.1, sh: 18, tex: woodTex(CHAIR_WOODS[(it.tone + 2) % 3]) });
  if (it.kind === 'carton' || it.kind === 'stack') {
    M.kraft = add({ c: lin(KRAFT[it.tone]), ks: 0.04, sh: 8, tex: kraftTex(KRAFT[it.tone]) });
    M.kraft2 = add({ c: lin(KRAFT[(it.tone + 1) % 3]), ks: 0.04, sh: 8, tex: kraftTex(KRAFT[(it.tone + 1) % 3]) });
  }
  if (it.kind === 'bin') {
    const b = BIN_COLS[it.tone];
    M.bin = add({ c: lin(b), ks: it.tone === 0 ? 0.6 : 0.3, sh: it.tone === 0 ? 50 : 30, env: it.tone === 0 ? 0.18 : 0.06 });
    M.lid = add({ c: lin(b).map((v) => v * 0.85), ks: 0.5, sh: 40, env: 0.1 });
  }
  if (it.kind === 'plant') {
    M.pot = add({ c: lin(POT_COLS[it.tone]), ks: it.tone === 1 ? 0.35 : 0.06, sh: 30, tex: paintTex(POT_COLS[it.tone]) });
    M.soil = add({ c: lin('#3a2a1e'), ks: 0, sh: 1 });
    M.leaf = add({ c: lin(['#3f7a3a', '#4c8a3c', '#356e44'][it.seed % 3]), ks: 0.08, sh: 14, tex: leafTex(['#3f7a3a', '#4c8a3c', '#356e44'][it.seed % 3]) });
  }
  return M;
}
function makeEnv(rd) {
  const T = rd.T, F = lin(FLOORS[rd.look.floor]), Wl = lin(WALLS[rd.look.wall]), GR = F.map((v) => v * 0.5), SK = lin('#f2f0ea');
  return {
    floorY: 0, wallZ: -rd.Dc, wallH: 9, hedgeZ: -rd.Dc - 40, hedgeH: -1,
    floor(x, z, fp, out) {
      const i = Math.floor(x / T + 1e-7), j = Math.floor(z / T + 1e-7);
      const tone = (0.93 + 0.08 * hash2(i, j)) * (((i + j) & 1) ? 1 : 0.955) * (0.96 + 0.06 * fbm(x * 7, z * 7, 2, fp * 7));
      const gr = Math.max(lineMask(x, T, 0.004, fp), lineMask(z, T, 0.004, fp));
      for (let c = 0; c < 3; c++) out[c] = F[c] * tone * (1 - gr) + GR[c] * gr;
    },
    wall(x, y, fp, out) {
      let k = 0.94 + 0.07 * fbm(x * 2.2, y * 2.2, 3, fp * 2.2), col = Wl;
      if (y < 0.1) { col = SK; k = 0.95; }
      const g = clamp01((0.004 - Math.abs(y - 0.1)) / Math.max(fp, 1e-4) + 0.5);
      k *= 1 - 0.35 * g;
      out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
    },
    hedge(x, y, fp, out) { out[0] = Wl[0]; out[1] = Wl[1]; out[2] = Wl[2]; },
    sky(dx, dy, dz, out) { const k = 0.7 + 0.25 * Math.max(0, dy); out[0] = 0.78 * k; out[1] = 0.78 * k; out[2] = 0.76 * k; },
  };
}
function lightFor(rd) {
  const a = (rd.cam.az + rd.light.az) * D2R, e = rd.light.el * D2R;
  const fa = (rd.cam.az - rd.light.az * 0.7) * D2R;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.2, 1.13, 1.03], soft: 0.075,
    sky: [0.42, 0.42, 0.44], ground: [0.27, 0.25, 0.23],
    fill: { dir: [Math.sin(fa) * 0.7, 0.45, Math.cos(fa) * 0.7], col: [0.14, 0.14, 0.15] },
    aoK: 1, contact: 0.32, contactH: 0.07,
  };
}
export function buildScene(rd) {
  const { mats, M } = makeMats(rd), shapes = [];
  rd.cabs.forEach((_, i) => shapes.push(...cabinetShapes(rd, i, M)));
  rd.items.forEach((it, j) => shapes.push(...pieceShapes(it, N_CAB + j, pieceMats(it, mats))));
  const sc = makeScene({ cam: camFrom(rd.cam), shapes, mats, env: makeEnv(rd), light: lightFor(rd) });
  sc.exposure = 1.04;
  return sc;
}

function partStats(sc, i, part, step) {
  const shapes = sc.byId.get(i).filter((s) => s.part === part), cam = sc.cam, e = cam.eye;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) { const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  }
  let area = 0, vis = 0, byPiece = 0;
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    const d = camDir(cam, x, y), dx = d[0], dy = d[1], dz = d[2];
    let ta = Infinity;
    for (const s of shapes) ta = Math.min(ta, hitShape(s, e[0], e[1], e[2], dx, dy, dz, ta));
    if (ta === Infinity) continue;
    area++;
    const h = pickHit(sc, x, y);
    if (h.id === i && Math.abs(h.t - ta) < 1e-6) vis++;
    else if (h.id >= N_CAB) byPiece++;
  }
  return { area, vis, byPiece };
}
function sceneProblem(rd, sc) {
  const lo = HARD.frame, inFrame = (b) => b && b[0] >= lo && b[1] >= lo && b[2] <= BOARD.w - lo && b[3] <= BOARD.h - lo;
  const ovl = [];
  for (let i = 0; i < N_CAB; i++) {
    const st = objectStats(sc, i, 3, false);
    if (st.off || !inFrame(st.box)) return 'frame-cab';
    const door = partStats(sc, i, 'door', HARD.step);
    if (door.vis < HARD.doorVis * door.area) return 'door-vis';
    ovl.push(door.byPiece / door.area);
    if (partStats(sc, i, 'handle', 1).vis < HARD.partPx) return 'handle-vis';
    if (partStats(sc, i, 'hinge', 1).vis < HARD.partPx) return 'hinge-vis';
  }
  for (let j = 0; j < N_CAB; j++) {
    const st = objectStats(sc, N_CAB + j, HARD.step);
    if (st.off || !inFrame(st.box) || st.frac < HARD.itemVis) return 'piece-vis';
  }
  rd.__ovl = ovl;
  if (thresholdSplits(ovl, new Set(rd.answer), false, HARD.ovl)) return 'screen-overlap';
  return '';
}

function roundProblem(rd) {
  if (!rd || !Array.isArray(rd.cabs) || rd.cabs.length !== N_CAB || !Array.isArray(rd.items) || rd.items.length !== N_CAB || !Array.isArray(rd.answer)) return 'shape';
  if (!(rd.T >= 0.27 - 1e-9 && rd.T <= 0.31 + 1e-9) || Math.abs(rd.W - 2 * rd.T) > 0.002) return 'scale';
  for (let i = 0; i < N_CAB; i++) {
    const c = rd.cabs[i];
    if (c.hinge !== 'L' && c.hinge !== 'R') return 'hinge';
    if (Math.abs(c.x / rd.T - Math.round(c.x / rd.T)) > 0.01) return 'grid';
    if (i && c.x - rd.cabs[i - 1].x - rd.W < rd.T - 0.002) return 'spacing';
  }
  for (const it of rd.items) if (!KINDS.includes(it.kind) || !(it.h > 0.28)) return 'kind';
  for (let j = 0; j < N_CAB; j++) {
    const it = rd.items[j], P = footPoly(it);
    if (P.some((p) => p[1] < -rd.Dc + 0.015)) return 'wall';
    for (let k = 0; k < N_CAB; k++) if (polyDist(P, cabKeep(rd, k)) < HARD.cabSep) return 'cab';
    for (let k = 0; k < j; k++) if (polyDist(P, footPoly(rd.items[k])) < HARD.itemSep) return 'pieces';
  }
  const T = truth(rd);
  for (let j = 0; j < N_CAB; j++) {
    let reach = 0;
    for (let i = 0; i < N_CAB; i++) { const v = T.sd[j][i]; if (Math.abs(v) < HARD.margin) return 'margin'; if (v < 0) reach++; }
    if (reach > 1) return 'two-doors';
  }
  if (!sameSet(T.clear, rd.answer)) return 'answer';
  const kb = N_CAB - rd.answer.length;
  if (kb < HARD.blocked[0] || kb > HARD.blocked[1]) return 'answer-count';
  const s = shortcutsGeo(rd, new Set());
  return s ? `shortcut-${s}` : '';
}

export const _internals = { STATS, DESIGN, HARD, truth, proxies, roundProblem, sceneProblem, partStats, buildScene, makeRound, cabGeom, footPoly, minSd, sdSector, thresholdSplits };

export function gate(m) {
  if (!m || m.task !== 'door_swing_clear' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !m.round) return false;
  const rd = JSON.parse(JSON.stringify(m.round));
  if (roundProblem(rd)) return false;
  if (!rd.cam || !Array.isArray(rd.pts) || rd.pts.length !== N_CAB) return false;
  const sc = buildScene(rd);
  if (sceneProblem(rd, sc)) return false;
  for (let i = 0; i < N_CAB; i++) if (pickNear(sc, rd.pts[i][0], rd.pts[i][1], HARD.hit, (id) => id < N_CAB) !== i) return false;
  return true;
}

const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = buildScene(rd); sceneCache.set(rd, sc); }
  return sc;
}
const PROMPT = { main: 'Tap every cabinet whose door can swing fully open', sub: 'Fully open = turned 90° without touching anything. Verify is final.' };

export default {
  meta: {
    name: 'door_swing_clear', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'tap', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'select / unselect the cabinet under the point (revisable until Verify)' }],
    promptHuman: PROMPT.main,
  },

  generate(rng) {
    for (let k = 0; k < 6; k++) {
      const rd = makeRound(rng);
      delete rd.__ovl;
      const m = { task: 'door_swing_clear', board: { ...BOARD }, round: rd };
      if (gate(m)) return m;
    }
    throw new Error('door_swing_clear: no gated instance');
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = pickNear(sceneFor(m.round), a.x, a.y, HARD.hit, (q) => q < N_CAB);
    if (id < 0 || id >= N_CAB) return { ok: false, reason: 'no-cabinet' };
    const k = s.sel.indexOf(id);
    if (k >= 0) s.sel.splice(k, 1); else { s.sel.push(id); s.sel.sort((p, q) => p - q); }
    return { ok: true };
  },

  verify(s, m) {
    const want = new Set(m.round.answer);
    let right = 0;
    for (let i = 0; i < N_CAB; i++) if (s.sel.includes(i) === want.has(i)) right++;
    const success = right === N_CAB;
    return { success, partial: right / N_CAB, error: N_CAB - right, detail: { selected: s.sel.length, correctCabinets: right, need: want.size } };
  },

  oracle(m) { return m.round.answer.map((i) => ({ op: 'tap', x: m.round.pts[i][0], y: m.round.pts[i][1] })); },

  randomPolicy(m, rnd) {
    const acts = [];
    m.round.pts.forEach((p) => { if (rnd() < 0.5) acts.push({ op: 'tap', x: p[0], y: p[1] }); });
    return acts;
  },

  async mount(env) { env.assets.dsc = { key: '', img: null, canvas: null, ringKey: '', ring: null }; },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT.main, PROMPT.sub); },

  drawBoard(g, br, env) {
    const s = env.state, rd = env.manifest.round, A = env.assets.dsc || (env.assets.dsc = {});
    const q = contextScale(g), key = `${q}`;
    if (A.key !== key) { A.img = render(sceneFor(rd), q); A.canvas = toCanvas(A.img); A.key = key; A.ringKey = ''; }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    const rk = s.sel.join(',');
    if (A.ringKey !== rk) { A.ringKey = rk; A.ring = s.sel.length ? toCanvas(ringImage(A.img, new Set(s.sel))) : null; }
    if (A.ring) g.drawImage(A.ring, 0, 0, BOARD.w, BOARD.h);
    const cam = sceneFor(rd).cam;
    for (const i of s.sel) {
      const c = rd.cabs[i], p = cam.project(c.x + rd.W / 2, rd.Hc + TOP_T, -rd.Dc / 2);
      const bx = Math.min(BOARD.w - 10, Math.max(10, p.x)), by = Math.max(10, p.y - 11);
      g.beginPath(); g.arc(bx, by, 8, 0, Math.PI * 2);
      g.fillStyle = ACCENT; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✓', bx, by + 0.5);
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const id = pickNear(sceneFor(env.manifest.round), e.x, e.y, HARD.hit, (q) => q < N_CAB);
    return id >= 0 && id < N_CAB ? [{ op: 'tap', x: e.x, y: e.y }] : [];
  },

  footerStatus(env) { return `${env.state.sel.length} selected`; },
};
