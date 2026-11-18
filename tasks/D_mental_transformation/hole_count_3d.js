import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import * as K from '../common/_colour_kit.js';
import { hash32 } from '../core/style.js';

const PANEL_W = 520;
const BOARD = { w: PANEL_W - 20, h: 420 };
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const R3 = (v) => Math.round(v * 1000) / 1000;
const SLOTS = [[85, 78], [250, 78], [415, 78], [85, 210], [250, 210], [415, 210], [85, 342], [250, 342], [415, 342]];
const HARD = Object.freeze({
  elev: [50, 56], az: [-28, 28],
  targets: [[2, 0.3], [3, 0.35], [4, 0.25], [5, 0.1]],
  levels: [[10, 11.2], [11.8, 13]],
  rHole: [7, 12], maxHoles: 5,
  tubeWallPx: 5.5,
  tubeQ: 0.6,
  matTubeQ: 0.95,
  dishFrac: [0.3, 0.55],
  rSample: [7.2, 11.8],
  dishMin: 2.5,
  dishQ: 0.85,
  matPlates: [9, 9],
  edgeClear: 4, holeGap: 5,
  boardMargin: 6, partGap: 8,
});
const MATERIALS = [
  { name: 'wood', top: '#d9a766', side: '#b07a3c', grain: 'wood' },
  { name: 'steel', top: '#c3cad2', side: '#8d97a3', grain: 'brushed' },
  { name: 'brass', top: '#dcb54f', side: '#a8832a', grain: 'brushed' },
  { name: 'red', top: '#dc5a52', side: '#a83a33', grain: 'plastic' },
  { name: 'orange', top: '#f0934a', side: '#bd6a2b', grain: 'plastic' },
  { name: 'pink', top: '#e98fb4', side: '#b8607f', grain: 'plastic' },
  { name: 'ivory', top: '#ece6d8', side: '#bdb3a0', grain: 'plastic' },
  { name: 'purple', top: '#a487d6', side: '#735aa6', grain: 'plastic' },
];
const MAT = { base: '#2f6d55', line: 'rgba(225,245,232,.30)', major: 'rgba(225,245,232,.5)', step: 22 };

const pickW = (rng, pairs) => {
  let u = rng.raw() * pairs.reduce((s, p) => s + p[1], 0);
  for (const [v, w] of pairs) { u -= w; if (u <= 0) return v; }
  return pairs[pairs.length - 1][0];
};

function camera(c) {
  const ca = Math.cos(c.az), sa = Math.sin(c.az), sE = Math.sin(c.E), cE = Math.cos(c.E);
  return {
    ca, sa, sE, cE,
    proj: (x, y, z) => [c.X0 + (x * ca - z * sa), c.Y0 + (x * sa + z * ca) * sE - y * cE],
    depth: (x, z) => x * sa + z * ca,
    ground: (X, Y) => { const u = X - c.X0, d = (Y - c.Y0) / sE; return [u * ca + d * sa, -u * sa + d * ca]; },
  };
}

function arcPts(out, cx, cz, r, a0, a1, n) {
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
}
function rrectPts(x0, z0, x1, z1, cr, n = 5) {
  const pts = [];
  arcPts(pts, x1 - cr, z0 + cr, cr, -Math.PI / 2, 0, n);
  arcPts(pts, x1 - cr, z1 - cr, cr, 0, Math.PI / 2, n);
  arcPts(pts, x0 + cr, z1 - cr, cr, Math.PI / 2, Math.PI, n);
  arcPts(pts, x0 + cr, z0 + cr, cr, Math.PI, Math.PI * 1.5, n);
  return pts;
}
function outlineLocal(p) {
  const s = p.shape, pts = [];
  if (s.kind === 'disc') { for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push([s.R * Math.cos(a), s.R * Math.sin(a)]); } return pts; }
  if (s.kind === 'hex') {
    const cr = 4;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU, cx = (s.R - cr / Math.cos(Math.PI / 6)) * Math.cos(a), cz = (s.R - cr / Math.cos(Math.PI / 6)) * Math.sin(a);
      arcPts(pts, cx, cz, cr, a - Math.PI / 6, a + Math.PI / 6, 3);
    }
    return pts;
  }
  if (s.kind === 'stadium') {
    arcPts(pts, s.L, 0, s.W, -Math.PI / 2, Math.PI / 2, 16);
    arcPts(pts, -s.L, 0, s.W, Math.PI / 2, Math.PI * 1.5, 16);
    return pts;
  }
  if (s.kind === 'rrect') return rrectPts(-s.hx, -s.hz, s.hx, s.hz, s.cr);
  if (EXT_OUTLINE[s.kind]) return EXT_OUTLINE[s.kind](s);
  const { hx, hz, nx, nz } = s, cr = 4;
  arcPts(pts, hx - cr, -hz + cr, cr, -Math.PI / 2, 0, 3);
  pts.push([hx, hz - nz]); pts.push([hx - nx, hz - nz]); pts.push([hx - nx, hz]);
  arcPts(pts, -hx + cr, hz - cr, cr, Math.PI / 2, Math.PI, 3);
  arcPts(pts, -hx + cr, -hz + cr, cr, Math.PI, Math.PI * 1.5, 3);
  return pts;
}
function toWorld(p, lx, lz, extraYaw = 0) {
  const c = Math.cos(p.yaw + extraYaw), s = Math.sin(p.yaw + extraYaw);
  return [p.cx + lx * c - lz * s, p.cz + lx * s + lz * c];
}
function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function ptPolyDist(x, y, P) {
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ax = P[j][0], ay = P[j][1], vx = P[i][0] - ax, vy = P[i][1] - ay, L = vx * vx + vy * vy;
    let t = L > 0 ? ((x - ax) * vx + (y - ay) * vy) / L : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
    if (d < best) best = d;
  }
  return best;
}
const baseY = () => 0;

function partScreen(p, cam) {
  const pts = [];
  for (const [lx, lz] of outlineLocal(p)) { const [x, z] = toWorld(p, lx, lz); pts.push(cam.proj(x, baseY(p), z), cam.proj(x, baseY(p) + p.t, z)); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return { x0, y0, x1, y1 };
}
const qOf = (cam, depth, r) => (depth * cam.cE) / (r * cam.sE);

function makeShape(rng, holes, rMax, ext = false) {
  if (ext) return makeShapeExt(rng, holes, rMax);
  const k = Math.min(4, holes - 1), g = Math.max(0, rMax - 12) * 1.6;
  const u = (lo, hi) => R3(rng.uniform(lo[k] + g, hi[k] + g));
  const kind = rng.pick(['rrect', 'disc', 'hex', 'stadium', 'lshape', ...(holes >= 3 ? ['rrect'] : []), ...(holes >= 4 ? ['rrect', 'rrect', 'hex'] : [])]);
  if (kind === 'disc') return { kind, R: u([24, 30, 33, 37, 40], [28, 34, 37, 41, 44]) };
  if (kind === 'hex') return { kind, R: u([26, 32, 35, 39, 42], [30, 36, 39, 43, 46]) };
  if (kind === 'stadium') return { kind, L: u([8, 13, 17, 22, 26], [12, 18, 21, 26, 30]), W: R3(rng.uniform(18 + g * 0.5 + (k >= 3 ? 3 : 0), 23 + g * 0.5 + (k >= 3 ? 3 : 0))) };
  if (kind === 'rrect') return { kind, hx: u([24, 31, 34, 39, 43], [30, 37, 40, 45, 49]), hz: u([20, 23, 27, 30, 32], [25, 28, 32, 35, 37]), cr: R3(rng.uniform(5, 10)) };
  const hx = rng.uniform([30, 35, 37, 42, 46][k] + g, [34, 40, 42, 47, 51][k] + g), hz = rng.uniform([26, 30, 33, 36, 39][k] + g, [30, 34, 37, 40, 43][k] + g);
  return { kind: 'lshape', hx: R3(hx), hz: R3(hz), nx: R3(hx * rng.uniform(0.7, 0.9)), nz: R3(hz * rng.uniform(0.7, 0.9)) };
}

function radiusWindow(cam, through, d, onMat) {
  const tanE = cam.sE / cam.cE;
  if (through) {
    const lo = Math.max(HARD.rHole[0], onMat ? d / (HARD.matTubeQ * tanE) : 0), hi = Math.min(HARD.rHole[1], d / (HARD.tubeQ * tanE));
    return [lo, hi];
  }
  return [Math.max(HARD.rHole[0], d / (HARD.dishQ * tanE)), HARD.rHole[1]];
}
function buildPart(rng, cam, slot, role, ext = false) {
  const nT = role.through, nB = role.blind, n = nT + nB;
  const rTop = n >= 4 ? 10.5 : n >= 3 ? 11.2 : HARD.rHole[1];
  for (let attempt = 0; attempt < 80; attempt++) {
    const level = rng.int(0, HARD.levels.length - 1);
    const t = R3(rng.uniform(HARD.levels[level][0], HARD.levels[level][1]));
    if (nT && t * cam.cE < HARD.tubeWallPx) continue;
    const dB = R3(rng.uniform(Math.max(HARD.dishMin, HARD.dishFrac[0] * t), HARD.dishFrac[1] * t));
    const bores = rng.shuffle([...Array(nT).fill(true), ...Array(nB).fill(false)]).map((th) => ({ through: th, d: th ? t : dB }));
    let bad = false;
    for (const b of bores) {
      const [lo0, hi0] = radiusWindow(cam, b.through, b.d, role.onMat);
      const lo = Math.max(lo0, HARD.rSample[0]), hi = Math.min(hi0, rTop, HARD.rSample[1]);
      if (lo > hi) { bad = true; break; }
      b.r = rng.uniform(lo, hi);
    }
    if (bad) continue;
    const jit = ext ? 11 : 5;
    const [gx, gz] = cam.ground(slot[0] + rng.uniform(-jit, jit), slot[1] + rng.uniform(-jit, jit));
    const p = {
      cx: R3(gx), cz: R3(gz), yaw: R3(rng.uniform(0, TAU)), shape: makeShape(rng, n, Math.max(...bores.map((b) => b.r)), ext),
      mat: rng.int(0, MATERIALS.length - 1), t,
      riser: null,
      holes: [],
    };
    const L = outlineLocal(p);
    let ok = true;
    for (const b of bores) {
      let done = false;
      for (let tries = 0; tries < 80 && !done; tries++) {
        const lx = rng.uniform(-52, 52), lz = rng.uniform(-46, 46);
        if (!pointInPoly(lx, lz, L) || ptPolyDist(lx, lz, L) < b.r + HARD.edgeClear + 0.3) continue;
        if (p.holes.some((h) => Math.hypot(h.x - lx, h.z - lz) < h.r + b.r + HARD.holeGap + 0.3)) continue;
        p.holes.push({ x: R3(lx), z: R3(lz), r: R3(b.r), through: b.through, d: b.d });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (ok && partOk(p, cam, ext)) return p;
  }
  return null;
}

function planRoles(rng, N) {
  const k = pickW(rng, HARD.targets);
  const roles = [];
  for (let i = 0; i < k; i++) roles.push({ through: N, blind: rng.int(1, Math.min(3, HARD.maxHoles - N)) });
  const t0 = rng.int(0, N - 1);
  roles.push({ through: t0, blind: N - t0 });
  const near = [N - 1, N + 1].filter((v) => v >= 0 && v <= 4);
  const far = [0, 1, 2, 3, 4].filter((v) => v !== N && !near.includes(v));
  while (roles.length < SLOTS.length) {
    const th = rng.raw() < 0.75 ? rng.pick(near) : rng.pick(far);
    const minB = th === 0 ? 1 : (rng.raw() < 0.75 ? 1 : 0), maxB = Math.min(3, HARD.maxHoles - th);
    let b = rng.int(Math.min(minB, maxB), maxB);
    if (th < N && rng.raw() < 0.4) b = N - th;
    roles.push({ through: th, blind: b });
  }
  roles.forEach((r) => { r.onMat = true; });
  return rng.shuffle(roles);
}

function lazyReadings(m) {
  const N = m.N, P = m.parts;
  const sel = (f) => P.map((p, i) => (f(p) ? i : -1)).filter((i) => i >= 0);
  const out = [
    ['count-all', sel((p) => p.holes.length === N)],
    ['thin-level', sel((p) => p.t < HARD.levels[1][0])], ['thick-level', sel((p) => p.t >= HARD.levels[1][0])],
    ['most-holes', sel((p) => p.holes.length === Math.max(...P.map((o) => o.holes.length)))],
  ];
  const ts = [...new Set(P.map((p) => p.t))].sort((a, b) => a - b);
  for (const th of ts) { out.push(['thick-cut', sel((p) => p.t >= th)]); out.push(['thin-cut', sel((p) => p.t <= th)]); }
  const rs = [...new Set(P.flatMap((p) => p.holes.map((h) => h.r)))].sort((a, b) => a - b);
  const cuts = [rs[0] - 1, ...rs.map((v, i) => (i + 1 < rs.length ? (v + rs[i + 1]) / 2 : v + 1))];
  for (const th of cuts) for (const dir of [1, -1]) {
    const big = (h) => dir * (h.r - th) > 0;
    out.push(['radius-cut', sel((p) => p.holes.filter(big).length === N)]);
  }
  return out;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function partOk(p, cam, ext = false) {
  if (!p || !isNum(p.cx) || !isNum(p.cz) || !isNum(p.yaw) || !isNum(p.t)) return false;
  if (!HARD.levels.some(([lo, hi]) => p.t >= lo - 1e-6 && p.t <= hi + 1e-6)) return false;
  if (!Number.isInteger(p.mat) || p.mat < 0 || p.mat >= MATERIALS.length) return false;
  if (!p.shape || !(['disc', 'hex', 'stadium', 'rrect', 'lshape'].includes(p.shape.kind) || (ext && EXT_OUTLINE[p.shape.kind]))) return false;
  if (p.riser !== null) return false;
  if (!Array.isArray(p.holes) || p.holes.length < 1 || p.holes.length > HARD.maxHoles) return false;
  const L = outlineLocal(p);
  const dishD = p.holes.filter((h) => !h.through).map((h) => h.d);
  if (dishD.some((d) => Math.abs(d - dishD[0]) > 1e-6)) return false;
  for (let i = 0; i < p.holes.length; i++) {
    const h = p.holes[i];
    if (!isNum(h.x) || !isNum(h.z) || !isNum(h.r) || !isNum(h.d) || typeof h.through !== 'boolean') return false;
    if (h.r < HARD.rHole[0] - 1e-6 || h.r > HARD.rHole[1] + 1e-6) return false;
    if (!pointInPoly(h.x, h.z, L) || ptPolyDist(h.x, h.z, L) < h.r + HARD.edgeClear) return false;
    for (let j = 0; j < i; j++) { const o = p.holes[j]; if (Math.hypot(o.x - h.x, o.z - h.z) < o.r + h.r + HARD.holeGap) return false; }
    const q = qOf(cam, h.d, h.r);
    if (h.through) {
      if (Math.abs(h.d - p.t) > 1e-6 || h.d * cam.cE < HARD.tubeWallPx - 1e-6 || q < HARD.tubeQ - 1e-3) return false;
      if (q > HARD.matTubeQ + 1e-3) return false;
    } else {
      if (h.d < Math.max(HARD.dishMin, HARD.dishFrac[0] * p.t) - 2e-3 || h.d > HARD.dishFrac[1] * p.t + 2e-3) return false;
      if (q > HARD.dishQ + 1e-3) return false;
    }
  }
  const b = partScreen(p, cam), M = HARD.boardMargin;
  return b.x0 >= M && b.y0 >= M && b.x1 <= BOARD.w - M && b.y1 <= BOARD.h - M;
}
const throughCount = (p) => p.holes.filter((h) => h.through).length;

function contractOk(m) {
  if (!m || m.task !== 'hole_count_3d' || !m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (m.N !== 1 && m.N !== 2 && !(m.N === 3 && !m.ext)) return false;
  const c = m.cam;
  if (!c || !isNum(c.E) || !isNum(c.az) || !isNum(c.X0) || !isNum(c.Y0)) return false;
  if (c.E < HARD.elev[0] * DEG - 1e-3 || c.E > HARD.elev[1] * DEG + 1e-3) return false;
  if (Math.abs(c.az) > HARD.az[1] * DEG + 1e-3) return false;
  const cam = camera(c);
  if (!Array.isArray(m.parts) || m.parts.length !== SLOTS.length) return false;
  if (!m.parts.every((p) => partOk(p, cam, !!m.ext))) return false;
  const boxes = m.parts.map((p) => partScreen(p, cam));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1), gy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
    if (Math.max(gx, gy) < HARD.partGap) return false;
  }
  const T = m.parts.map(throughCount), tot = m.parts.map((p) => p.holes.length);
  const k = T.filter((v) => v === m.N).length;
  if (k < 2 || k > 5) return false;
  const nMat = m.parts.filter((p) => !p.riser).length;
  if (nMat < HARD.matPlates[0] || nMat > HARD.matPlates[1]) return false;
  if (!m.parts.some((p, i) => T[i] !== m.N && tot[i] === m.N)) return false;
  const key = answerOf(m).join(',');
  if (lazyReadings(m).some(([, s]) => s.join(',') === key)) return false;
  return true;
}
export function gate(m) { try { return contractOk(m); } catch { return false; } }

const answerOf = (m) => m.parts.map((p, i) => (throughCount(p) === m.N ? i : -1)).filter((i) => i >= 0);
function partAt(m, x, y) {
  const cam = camera(m.cam);
  let best = -1, bd = Infinity;
  m.parts.forEach((p, i) => {
    const b = partScreen(p, cam);
    if (x < b.x0 - 5 || x > b.x1 + 5 || y < b.y0 - 5 || y > b.y1 + 5) return;
    const d = Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.max(0, Math.min(255, v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function lcg(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}
function drawMat(g, cam, plain) {
  g.fillStyle = plain ? '#5d7f71' : MAT.base; g.fillRect(0, 0, BOARD.w, BOARD.h);
  if (plain) return;
  const S = MAT.step, ext = 460;
  g.lineWidth = 0.9;
  for (let k = -22; k <= 22; k++) {
    const v = k * S;
    g.strokeStyle = k % 5 === 0 ? MAT.major : MAT.line;
    let a = cam.proj(v, 0, -ext), b = cam.proj(v, 0, ext);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    a = cam.proj(-ext, 0, v); b = cam.proj(ext, 0, v);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  const vg = g.createRadialGradient(BOARD.w / 2, BOARD.h / 2, 60, BOARD.w / 2, BOARD.h / 2, 270);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,5,.22)');
  g.fillStyle = vg; g.fillRect(0, 0, BOARD.w, BOARD.h);
}
function polyPath(g, P) { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); }

function drawTopTexture(g, p, cam, topPts, mat, plain, yTop, extraYaw = 0, salt = 0) {
  g.fillStyle = mat.top; g.fill();
  if (plain) return;
  const rnd = lcg((p.cx * 1000 + p.cz * 7 + p.yaw * 131 + salt) | 0);
  const b = topPts.reduce((a, q) => ({ x0: Math.min(a.x0, q[0]), x1: Math.max(a.x1, q[0]), y0: Math.min(a.y0, q[1]), y1: Math.max(a.y1, q[1]) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
  if (mat.grain === 'wood' || mat.grain === 'brushed') {
    const [ax, az] = toWorld(p, -70, 0, extraYaw), [bx, bz] = toWorld(p, 70, 0, extraYaw);
    const A = cam.proj(ax, yTop, az), B = cam.proj(bx, yTop, bz);
    const ux = (B[0] - A[0]) / 140, uy = (B[1] - A[1]) / 140;
    const [nx0, nz0] = toWorld(p, 0, 1, extraYaw), [cx, cz] = toWorld(p, 0, 0, extraYaw);
    const N0 = cam.proj(nx0, yTop, nz0), C0 = cam.proj(cx, yTop, cz);
    const vx = N0[0] - C0[0], vy = N0[1] - C0[1];
    const step = mat.grain === 'wood' ? 3.2 : 1.6;
    for (let s = -62; s <= 62; s += step) {
      const alpha = mat.grain === 'wood' ? 0.06 + rnd() * 0.12 : 0.05 + rnd() * 0.07;
      g.strokeStyle = mat.grain === 'wood' ? `rgba(110,62,22,${alpha.toFixed(3)})` : (rnd() < 0.5 ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(40,50,60,${alpha.toFixed(3)})`);
      g.lineWidth = mat.grain === 'wood' ? 0.8 + rnd() * 0.9 : 0.6;
      const amp = mat.grain === 'wood' ? 0.8 + rnd() * 1.6 : 0, ph = rnd() * TAU;
      g.beginPath();
      for (let u = -70; u <= 70; u += 6) {
        const w = s + Math.sin(u * 0.07 + ph) * amp;
        const x = C0[0] + ux * u + vx * w, y = C0[1] + uy * u + vy * w;
        if (u === -70) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const sh = g.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.08)');
  g.fillStyle = sh; g.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
}

function drawWalls(g, cam, L, y0, y1, mat, sideShade = 1) {
  const bot = L.map(([x, z]) => cam.proj(x, y0, z)), top = L.map(([x, z]) => cam.proj(x, y1, z));
  let area = 0;
  for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  const faces = [];
  const lx = 0.8 * cam.sa - 0.6 * cam.ca, lz = 0.8 * cam.ca + 0.6 * cam.sa;
  for (let i = 0; i < L.length; i++) {
    const j = (i + 1) % L.length, a = L[i], b = L[j];
    let nx = (b[1] - a[1]) * sgn, nz = -(b[0] - a[0]) * sgn;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const facing = nx * cam.sa + nz * cam.ca;
    if (facing <= 0) continue;
    const lit = Math.max(0, nx * lx + nz * lz);
    faces.push({ i, j, d: cam.depth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), f: (0.62 + 0.3 * lit) * sideShade });
  }
  faces.sort((u, v) => u.d - v.d);
  for (const fc of faces) {
    g.beginPath(); g.moveTo(top[fc.i][0], top[fc.i][1]); g.lineTo(top[fc.j][0], top[fc.j][1]); g.lineTo(bot[fc.j][0], bot[fc.j][1]); g.lineTo(bot[fc.i][0], bot[fc.i][1]); g.closePath();
    g.fillStyle = shade(mat.side, fc.f / 0.8); g.fill();
    g.strokeStyle = shade(mat.side, fc.f / 0.8); g.lineWidth = 0.6; g.stroke();
  }
  return { bot, top, faces };
}

const bottomDark = (q) => Math.min(1, q / 1.5);

function drawPart(g, p, cam, env, matLayer) {
  const mat = MATERIALS[p.mat], plain = env.skin === 'plain';
  const y0 = baseY(p), y1 = y0 + p.t;
  const L = outlineLocal(p).map(([lx, lz]) => toWorld(p, lx, lz));
  const bot = L.map(([x, z]) => cam.proj(x, y0, z)), top = L.map(([x, z]) => cam.proj(x, y1, z));
  g.save();
  g.shadowColor = 'rgba(0,18,8,.55)'; g.shadowBlur = 7; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3.5;
  polyPath(g, bot); g.fillStyle = 'rgba(0,18,8,.35)'; g.fill();
  g.restore();
  const { faces } = drawWalls(g, cam, L, y0, y1, mat);
  g.save(); polyPath(g, top); g.clip(); polyPath(g, top); drawTopTexture(g, p, cam, top, mat, plain, y1); g.restore();
  for (const h of p.holes) {
    const [wx, wz] = toWorld(p, h.x, h.z);
    const [cx, cy] = cam.proj(wx, y1, wz);
    const a = h.r, b = h.r * cam.sE, dy = h.d * cam.cE, q = qOf(cam, h.d, h.r), k = bottomDark(q);
    const showsMat = h.through;
    g.save();
    g.beginPath(); g.ellipse(cx, cy, a, b, 0, 0, TAU); g.clip();
    const wg = g.createLinearGradient(0, cy - b, 0, cy - b + dy + 2);
    wg.addColorStop(0, shade(mat.side, 0.95)); wg.addColorStop(1, shade(mat.side, 0.34));
    g.fillStyle = wg; g.fillRect(cx - a - 1, cy - b - 1, 2 * a + 2, 2 * b + dy + 2);
    g.beginPath(); g.ellipse(cx, cy + dy, a, b, 0, 0, TAU); g.clip();
    if (showsMat) g.drawImage(matLayer, 0, 0, BOARD.w, BOARD.h);
    else {
      const fg = g.createRadialGradient(cx - a * 0.15, cy + dy + b * 0.1, 1, cx, cy + dy, a * 1.1);
      fg.addColorStop(0, shade(mat.top, 0.97)); fg.addColorStop(1, shade(mat.top, 0.8));
      g.fillStyle = fg; g.fillRect(cx - a - 1, cy - b - 1, 2 * a + 2, 2 * b + dy + 2);
    }
    g.fillStyle = `rgba(0,0,0,${(0.05 + 0.45 * k).toFixed(3)})`; g.fillRect(cx - a - 1, cy - b - 1, 2 * a + 2, 2 * b + dy + 2);
    g.restore();
    g.save();
    g.beginPath(); g.ellipse(cx, cy, a, b, 0, 0, TAU); g.clip();
    g.beginPath(); g.ellipse(cx, cy + dy, a, b, 0, Math.PI, TAU);
    g.strokeStyle = 'rgba(30,22,14,.45)'; g.lineWidth = 1; g.stroke();
    g.restore();
    g.beginPath(); g.ellipse(cx, cy, a, b, 0, Math.PI, TAU); g.strokeStyle = 'rgba(30,24,18,.55)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.ellipse(cx, cy, a, b, 0, 0, Math.PI); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke();
  }
  polyPath(g, top); g.strokeStyle = 'rgba(28,24,20,.55)'; g.lineWidth = 1; g.stroke();
  g.beginPath();
  for (const fc of faces) { g.moveTo(bot[fc.i][0], bot[fc.i][1]); g.lineTo(bot[fc.j][0], bot[fc.j][1]); }
  g.strokeStyle = 'rgba(10,20,14,.55)'; g.lineWidth = 1;
  g.stroke(); g.lineWidth = 1;
}

function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}
function ctxScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
const CACHE = new WeakMap();

function drawCheck(g, x, y) {
  g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fillStyle = ACCENT; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.moveTo(x - 4, y + 0.2); g.lineTo(x - 1.2, y + 3); g.lineTo(x + 4.2, y - 3.2);
  g.strokeStyle = '#fff'; g.lineWidth = 2.1; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  g.lineCap = 'butt';
}

export default {
  meta: {
    name: 'hole_count_3d', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'toggles the part under the cursor' }],
    promptHuman: 'Select parts with exactly N through-holes',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext);
    const N = rng.int(1, 3);
    for (let attempt = 0; attempt < 400; attempt++) {
      const E = rng.uniform(HARD.elev[0], HARD.elev[1]) * DEG;
      const az = rng.uniform(HARD.az[0], HARD.az[1]) * DEG;
      const c = { E: R3(E), az: R3(az), X0: BOARD.w / 2, Y0: BOARD.h / 2 };
      const cam = camera(c);
      const roles = planRoles(rng, N);
      const parts = [];
      for (let i = 0; i < SLOTS.length; i++) {
        const p = buildPart(rng, cam, SLOTS[i], roles[i]);
        if (!p) break;
        parts.push(p);
      }
      if (parts.length !== SLOTS.length) continue;
      const m = { task: 'hole_count_3d', board: { ...BOARD }, N, cam: c, parts };
      if (contractOk(m)) return m;
    }
    throw new Error('hole_count_3d: generator exhausted');
  },

  init() { return { sel: [] }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'click' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: 'bad-op' };
    const i = partAt(m, action.x, action.y);
    if (i < 0) return { ok: false, reason: 'no-part' };
    const k = state.sel.indexOf(i);
    if (k >= 0) state.sel.splice(k, 1); else state.sel.push(i);
    state.sel.sort((a, b) => a - b);
    return { ok: true, on: k < 0 };
  },

  verify(state, m) {
    const want = new Set(answerOf(m)), got = new Set(state.sel);
    const hits = [...got].filter((i) => want.has(i)).length;
    const falsePos = got.size - hits, missed = want.size - hits;
    return {
      success: falsePos === 0 && missed === 0,
      error: falsePos + missed,
      partial: want.size ? Math.max(0, (hits - falsePos) / want.size) : 0,
      detail: { selected: got.size, correct: hits, falsePos, missed },
    };
  },

  oracle(m) {
    const cam = camera(m.cam);
    return answerOf(m).map((i) => { const b = partScreen(m.parts[i], cam); return { op: 'click', x: R3((b.x0 + b.x1) / 2), y: R3((b.y0 + b.y1) / 2) }; });
  },

  randomPolicy(m, rnd) {
    const cam = camera(m.cam);
    const ids = m.parts.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const k = 1 + Math.floor(rnd() * 5);
    return ids.slice(0, k).map((i) => { const b = partScreen(m.parts[i], cam); return { op: 'click', x: b.x0 + rnd() * (b.x1 - b.x0), y: b.y0 + rnd() * (b.y1 - b.y0) }; });
  },

  async mount(env) { if (env.style) env.assets.look = await styleLook(env.style); },

  drawPrompt(g, r, env) {
    const N = env?.manifest?.N ?? 2;
    drawPromptText(g, r, `Select parts with exactly ${N} through-hole${N === 1 ? '' : 's'}`, 'Count holes that go all the way through');
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state } = env;
    const cam = camera(m.cam), plain = env.skin === 'plain', q = ctxScale(g);
    let cache = CACHE.get(m);
    if (!cache || cache.q !== q || cache.plain !== plain) {
      const c = mkCanvas(Math.ceil(BOARD.w * q), Math.ceil(BOARD.h * q)), cg = c.getContext('2d');
      cg.setTransform(q, 0, 0, q, 0, 0); drawMat(cg, cam, plain);
      cache = { q, plain, mat: c }; CACHE.set(m, cache);
    }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(cache.mat, 0, 0, BOARD.w, BOARD.h);
    const order = m.parts.map((p, i) => i).sort((a, b) => cam.depth(m.parts[a].cx, m.parts[a].cz) - cam.depth(m.parts[b].cx, m.parts[b].cz));
    for (const i of order) drawPart(g, m.parts[i], cam, env, cache.mat);
    for (const i of state.sel) {
      const b = partScreen(m.parts[i], cam);
      rr(g, b.x0 - 5, b.y0 - 5, b.x1 - b.x0 + 10, b.y1 - b.y0 + 10, 8);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
      drawCheck(g, b.x1 + 1, b.y0 - 1);
    }
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    return [{ op: 'click', x: Math.round(evt.x * 10) / 10, y: Math.round(evt.y * 10) / 10 }];
  },

  footerStatus(env) {
    const n = env.state.sel.length;
    return `${n} selected`;
  },
};

const EVAL_KEYS = new Set([2016415736, 1448968117, 335640047, 581079820, 1718846616, 792131550, 2402576901, 581039228, 555259752, 4159216376, 3494704373, 705803337]);
const keySide = (k) => (hash32('hole_count_3d|q|' + k) % 10 === 0 ? 'test' : 'train');
function ngonPts(n, R, cr, a0 = -Math.PI / 2) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * TAU, d = R - cr / Math.cos(Math.PI / n);
    arcPts(pts, d * Math.cos(a), d * Math.sin(a), cr, a - Math.PI / n, a + Math.PI / n, 3);
  }
  return pts;
}
const EXT_OUTLINE = {
  tri: (s) => ngonPts(3, s.R, 6),
  pent: (s) => ngonPts(5, s.R, 5),
  oval: (s) => { const pts = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push([s.a * Math.cos(a), s.b * Math.sin(a)]); } return pts; },
  plus: (s) => { const w = s.w, L = s.L; return [[w, -L], [w, -w], [L, -w], [L, w], [w, w], [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w], [-w, -L]]; },
  trap: (s) => [[-s.hb, s.hz], [-s.ht, -s.hz], [s.ht, -s.hz], [s.hb, s.hz]].reverse(),
  tee: (s) => [[-s.hx, -s.hz], [s.hx, -s.hz], [s.hx, -s.hz + 2 * s.bar], [s.sw, -s.hz + 2 * s.bar], [s.sw, s.hz], [-s.sw, s.hz], [-s.sw, -s.hz + 2 * s.bar], [-s.hx, -s.hz + 2 * s.bar]],
};
function makeShapeExt(rng, holes, rMax) {
  const k = Math.min(2, holes - 1), g = Math.max(0, rMax - 12) * 1.6;
  const u = (lo, hi) => R3(rng.uniform(lo[k] + g, hi[k] + g));
  const kinds = holes >= 3 ? ['rrect', 'lshape', 'rrect', 'lshape', 'disc', 'hex', 'pent', 'oval', 'trap', 'tee', 'plus'] : ['rrect', 'disc', 'hex', 'stadium', 'lshape', 'tri', 'pent', 'oval', 'plus', 'trap', 'tee'];
  const kind = rng.pick(kinds);
  if (kind === 'tri') return { kind, R: u([46, 52, 56], [50, 56, 58]) };
  if (kind === 'pent') return { kind, R: u([28, 34, 37], [32, 38, 41]) };
  if (kind === 'oval') return { kind, a: u([30, 36, 40], [34, 41, 44]), b: R3(rng.uniform(22 + g * 0.5, 28 + g * 0.5)) };
  if (kind === 'plus') return { kind, w: R3(rng.uniform(17 + g * 0.4, 20 + g * 0.4)), L: u([34, 40, 42], [38, 44, 46]) };
  if (kind === 'trap') { const hz = u([22, 25, 28], [26, 29, 32]), hb = u([32, 38, 41], [36, 42, 45]); return { kind, hz, hb, ht: R3(hb * rng.uniform(0.55, 0.75)) }; }
  if (kind === 'tee') { const hx = u([36, 42, 44], [40, 46, 48]), hz = u([30, 36, 38], [34, 40, 42]); return { kind, hx, hz, bar: R3(rng.uniform(16, 19) + g * 0.4), sw: R3(rng.uniform(16, 19) + g * 0.4) }; }
  if (kind === 'disc') return { kind, R: u([24, 30, 33], [28, 34, 37]) };
  if (kind === 'hex') return { kind, R: u([26, 32, 35], [30, 36, 39]) };
  if (kind === 'stadium') return { kind, L: u([8, 13, 17], [12, 18, 21]), W: R3(rng.uniform(18 + g * 0.5, 23 + g * 0.5)) };
  if (kind === 'rrect') return { kind, hx: u([24, 31, 34], [30, 37, 40]), hz: u([20, 23, 27], [25, 28, 32]), cr: R3(rng.uniform(5, 10)) };
  const hx = rng.uniform([30, 35, 37][k] + g, [34, 40, 42][k] + g), hz = rng.uniform([26, 30, 33][k] + g, [30, 34, 37][k] + g);
  return { kind: 'lshape', hx: R3(hx), hz: R3(hz), nx: R3(hx * rng.uniform(0.7, 0.9)), nz: R3(hz * rng.uniform(0.7, 0.9)) };
}
function planRolesExt(rng, N) {
  const k = pickW(rng, HARD.targets);
  const roles = [];
  for (let i = 0; i < k; i++) roles.push({ through: N, blind: rng.int(0, HARD.maxHoles - N) });
  const t0 = rng.int(0, N - 1);
  roles.push({ through: t0, blind: N - t0 });
  while (roles.length < SLOTS.length) {
    const th = rng.pick([0, 1, 2, 3].filter((v) => v !== N));
    const minB = th === 0 ? 1 : 0, maxB = HARD.maxHoles - th;
    let b = rng.int(minB, maxB);
    if (th < N && rng.raw() < 0.5) b = N - th;
    roles.push({ through: th, blind: b });
  }
  roles.forEach((r) => { r.onMat = true; });
  return rng.shuffle(roles);
}
function generateExt(rng, split) {
  const N = rng.raw() < 0.5 ? 1 : 2;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const E = rng.uniform(HARD.elev[0], HARD.elev[1]) * DEG, az = rng.uniform(HARD.az[0], HARD.az[1]) * DEG;
    const c = { E: R3(E), az: R3(az), X0: BOARD.w / 2, Y0: 173 }, cam = camera(c);
    const roles = planRolesExt(rng, N), parts = [];
    for (let i = 0; i < SLOTS.length; i++) { const p = buildPart(rng, cam, SLOTS[i], roles[i], true); if (!p) break; parts.push(p); }
    if (parts.length !== SLOTS.length) continue;
    const m = { task: 'hole_count_3d', board: { ...BOARD }, N, cam: c, parts, ext: { shapes: 'bench' } };
    if (!contractOk(m)) continue;
    const k = semanticKey(m);
    if (keySide(k) === split && !EVAL_KEYS.has(hash32(k))) return m;
  }
  throw new Error('hole_count_3d: ext generator exhausted');
}

const MAT_TINTS = [['green', '#2f6d55'], ['blue', '#27548e'], ['black', '#25272a'], ['teal', '#1e6668'], ['navy', '#1f2f4f'], ['maroon', '#5e2431'], ['purple', '#3d2f63'], ['olive', '#4b5a2c'],
  ['slate', '#3a4652'], ['forest', '#24452f'], ['indigo', '#2a2f6b'], ['wine', '#4a1f2e']];
const PLASTICS = ['#dc5a52', '#f0934a', '#ece6d8', '#e9c43f', '#a487d6', '#e98fb4'];
const PLATE_FAMS = ['wood', 'metal', 'stone', 'concrete', 'plastic'];
async function styleLook(st) {
  const grains = [...K.famPool(st, 'fabric'), ...K.famPool(st, 'flat'), ...K.famPool(st, 'concrete')];
  const tints = K.inSplit(st, 'hc3d_mat', MAT_TINTS, (x) => x[0], 3);
  const [ti, gi, si] = st.primaryCombo('hc3d-scene', [tints.length, grains.length, 64]);
  const [tname, tint] = tints[ti], grain = grains[gi], R = st.rand;
  const [mh] = K.hueSatHex(tint), dark = ['black', 'navy', 'purple', 'maroon', 'slate', 'indigo', 'wine', 'forest'].includes(tname);
  st.note(`tex:${grain.id}`); st.note(`hc3d_mat:${tname}`);
  const okHex = (hex) => { const [h, sat] = K.hueSatHex(hex); return (sat < 0.25 || K.hueDist(h, mh) > 55) && (!dark || K.lumHex(hex) > 0.12); };
  const slots = [];
  const fams = K.inSplit(st, 'hc3d_platefam', PLATE_FAMS, String, 2);
  for (const f of fams) st.note(`hc3d_platefam:${f}`);
  const plastics = K.inSplit(st, 'hc3d_plastic', PLASTICS, String, 2);
  for (let k = 0; k < 8; k++) {
    const f = fams[(k + si) % fams.length];
    if (f === 'plastic') { const c = plastics.filter(okHex); slots.push({ f, tint: c[Math.floor(R() * c.length)] || '#ece6d8' }); continue; }
    const pool = K.famPool(st, f).filter((t) => okHex(K.linHex(t.mean_lin.map((v) => v * 2.2))));
    const t = (pool.length ? pool : K.famPool(st, f))[Math.floor(R() * Math.max(1, pool.length || K.famPool(st, f).length))];
    slots.push({ f, t });
  }
  const imgs = await Promise.all([K.texImg(grain), ...slots.map((sl) => (sl.t ? K.texImg(sl.t) : K.texImg(grain)))]);
  for (const sl of slots) if (sl.t) st.note(`tex:${sl.t.id}`);
  const mats = slots.map((sl, k) => {
    const img = imgs[k + 1];
    const top = sl.f === 'plastic'
      ? K.swatch(img, { lum: Math.max(0.3, K.lumHex(sl.tint) ** 0.45), contrast: 0.12, sat: 0, tint: sl.tint, tintK: 0.92 })
      : K.swatch(img, { lum: 0.45 + 0.12 * ((k * 7) % 3) / 2, contrast: 0.65, sat: sl.f === 'metal' ? 0.3 : 0.8 });
    const mean = K.swatchMean(top);
    return { top, mean, side: K.shadeHex(mean, 0.7), fam: sl.f };
  });
  return {
    mat: K.swatch(imgs[0], { lum: dark ? 0.12 : 0.25, contrast: 0.35, sat: 0, tint, tintK: 0.85 }), matTint: tint, matName: tname,
    grid: { step: [18, 20, 22, 25][Math.floor(R() * 4)], major: R() < 0.5 ? 5 : 4, a: 0.22 + R() * 0.12 },
    mats, texK: 0.32 + R() * 0.12, off: [R() * 256, R() * 256],
  };
}
function paintMatStyled(g, cam, L) {
  g.fillStyle = K.pat(g, L.mat, { scale: 0.5, ox: L.off[0], oy: L.off[1] }); g.fillRect(0, 0, BOARD.w, BOARD.h);
  const S = L.grid.step, ext = 460, n = Math.ceil(ext / S);
  g.lineWidth = 0.9;
  for (let k = -n; k <= n; k++) {
    const v = k * S;
    g.strokeStyle = `rgba(232,244,236,${(k % L.grid.major === 0 ? L.grid.a * 1.7 : L.grid.a).toFixed(3)})`;
    let a = cam.proj(v, 0, -ext), b = cam.proj(v, 0, ext);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    a = cam.proj(-ext, 0, v); b = cam.proj(ext, 0, v);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  const vg = g.createRadialGradient(BOARD.w / 2, BOARD.h / 2, 60, BOARD.w / 2, BOARD.h / 2, 270);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = vg; g.fillRect(0, 0, BOARD.w, BOARD.h);
}
function topPattern(g, p, cam, y, M, L) {
  const P0 = cam.proj(...((a) => [a[0], y, a[1]])(toWorld(p, 0, 0)));
  const Px = cam.proj(...((a) => [a[0], y, a[1]])(toWorld(p, 1, 0)));
  const Pz = cam.proj(...((a) => [a[0], y, a[1]])(toWorld(p, 0, 1)));
  const k = L.texK, a = (Px[0] - P0[0]) * k, b = (Px[1] - P0[1]) * k, c = (Pz[0] - P0[0]) * k, d = (Pz[1] - P0[1]) * k;
  const pt = g.createPattern(M.top, 'repeat');
  const ox = (p.cx * 13 + L.off[0]) % 256, oy = (p.cz * 7 + L.off[1]) % 256;
  if (pt.setTransform && typeof DOMMatrix !== 'undefined') pt.setTransform(new DOMMatrix([a, b, c, d, P0[0] - ox * a - oy * c, P0[1] - ox * b - oy * d]));
  return pt;
}
function drawPartStyled(g, p, cam, L, matLayer) {
  const M = L.mats[p.mat % L.mats.length];
  const y0 = baseY(p), y1 = y0 + p.t;
  const W = outlineLocal(p).map(([lx, lz]) => toWorld(p, lx, lz));
  const bot = W.map(([x, z]) => cam.proj(x, y0, z)), top = W.map(([x, z]) => cam.proj(x, y1, z));
  g.save();
  g.shadowColor = 'rgba(0,10,6,.6)'; g.shadowBlur = 7; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3.5;
  polyPath(g, bot); g.fillStyle = 'rgba(0,10,6,.4)'; g.fill();
  g.restore();
  const { faces } = drawWalls(g, cam, W, y0, y1, { side: M.side });
  const tp = topPattern(g, p, cam, y1, M, L);
  g.save(); polyPath(g, top); g.fillStyle = tp; g.fill();
  const b = top.reduce((a, q) => ({ x0: Math.min(a.x0, q[0]), x1: Math.max(a.x1, q[0]), y0: Math.min(a.y0, q[1]), y1: Math.max(a.y1, q[1]) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
  const sh = g.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  sh.addColorStop(0, 'rgba(255,255,255,.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.1)');
  g.fillStyle = sh; g.fill(); g.restore();
  for (const h of p.holes) {
    const [wx, wz] = toWorld(p, h.x, h.z), [cx, cy] = cam.proj(wx, y1, wz);
    const a = h.r, bb = h.r * cam.sE, dy = h.d * cam.cE, kq = bottomDark(qOf(cam, h.d, h.r));
    g.save();
    g.beginPath(); g.ellipse(cx, cy, a, bb, 0, 0, TAU); g.clip();
    const wg = g.createLinearGradient(0, cy - bb, 0, cy - bb + dy + 2);
    wg.addColorStop(0, shade(M.side, 0.95)); wg.addColorStop(1, shade(M.side, 0.34));
    g.fillStyle = wg; g.fillRect(cx - a - 1, cy - bb - 1, 2 * a + 2, 2 * bb + dy + 2);
    g.beginPath(); g.ellipse(cx, cy + dy, a, bb, 0, 0, TAU); g.clip();
    if (h.through) g.drawImage(matLayer, 0, 0, BOARD.w, BOARD.h);
    else { g.fillStyle = topPattern(g, p, cam, y1 - h.d, M, L); g.fillRect(cx - a - 1, cy - bb - 1, 2 * a + 2, 2 * bb + dy + 2); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(cx - a - 1, cy - bb - 1, 2 * a + 2, 2 * bb + dy + 2); }
    g.fillStyle = `rgba(0,0,0,${(0.05 + 0.45 * kq).toFixed(3)})`; g.fillRect(cx - a - 1, cy - bb - 1, 2 * a + 2, 2 * bb + dy + 2);
    g.restore();
    g.save(); g.beginPath(); g.ellipse(cx, cy, a, bb, 0, 0, TAU); g.clip();
    g.beginPath(); g.ellipse(cx, cy + dy, a, bb, 0, Math.PI, TAU); g.strokeStyle = 'rgba(30,22,14,.45)'; g.lineWidth = 1; g.stroke(); g.restore();
    g.beginPath(); g.ellipse(cx, cy, a, bb, 0, Math.PI, TAU); g.strokeStyle = 'rgba(30,24,18,.6)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.ellipse(cx, cy, a, bb, 0, 0, Math.PI); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke();
  }
  polyPath(g, top); g.strokeStyle = 'rgba(28,24,20,.6)'; g.lineWidth = 1; g.stroke();
  g.beginPath(); for (const fc of faces) { g.moveTo(bot[fc.i][0], bot[fc.i][1]); g.lineTo(bot[fc.j][0], bot[fc.j][1]); }
  g.strokeStyle = 'rgba(10,20,14,.55)'; g.stroke();
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state } = env, cam = camera(m.cam), q = ctxScale(g);
  let mat = env.assets.hc3dMat;
  if (!mat || mat.q !== q) {
    const c = mkCanvas(Math.ceil(BOARD.w * q), Math.ceil(BOARD.h * q)), cg = c.getContext('2d');
    cg.setTransform(q, 0, 0, q, 0, 0); paintMatStyled(cg, cam, L);
    env.assets.hc3dMat = mat = { q, c };
  }
  g.save(); g.translate(br.x, br.y);
  g.drawImage(mat.c, 0, 0, BOARD.w, BOARD.h);
  const order = m.parts.map((p, i) => i).sort((a, b) => cam.depth(m.parts[a].cx, m.parts[a].cz) - cam.depth(m.parts[b].cx, m.parts[b].cz));
  for (const i of order) drawPartStyled(g, m.parts[i], cam, L, mat.c);
  for (const i of state.sel) {
    const b = partScreen(m.parts[i], cam);
    rr(g, b.x0 - 5, b.y0 - 5, b.x1 - b.x0 + 10, b.y1 - b.y0 + 10, 8);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
    drawCheck(g, b.x1 + 1, b.y0 - 1);
  }
  g.restore();
}

export function semanticKey(m) {
  return `hc3d|${m.N}|` + m.parts.map((p) => `${throughCount(p)}/${p.holes.length}/${p.t >= HARD.levels[1][0] ? 1 : 0}`).join(',');
}
