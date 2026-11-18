import * as RT from './_heading_rt.js';
import { SCENE, ORIENTS, MOVE_NAMES, step, placed, orientIndex, I3 } from './_silhouette_turn_match_model.js';

const SR = SCENE.rect;
const KEY = [0.55, 1.25, 0.12];
const HALF = 0.485;

function fitCam(az, el, pts, W, H, pad) {
  let t = [0, 2.2, 3.6], dist = 16, cam = null;
  for (let it = 0; it < 16; it++) {
    cam = RT.orbitCam({ az, el, dist, fov: 30, tx: t[0], ty: t[1], tz: t[2] }, W, H);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const dx = (x0 + x1) / 2 - W / 2, dy = (y0 + y1) / 2 - H / 2, k = dist / cam.f;
    t = [t[0] + cam.R[0] * dx * k - cam.U[0] * dy * k, t[1] - cam.U[1] * dy * k, t[2] + cam.R[2] * dx * k - cam.U[2] * dy * k];
    dist *= 0.35 + 0.65 * Math.max((x1 - x0) / (W - 2 * pad), (y1 - y0) / (H - 2 * pad));
  }
  return cam;
}
const CAMS = new Map();
export function viewCam(cam) {
  const k = `${cam.yaw}|${cam.pitch}`;
  if (CAMS.has(k)) return CAMS.get(k);
  const P = SCENE.pivot, pts = [];
  for (const dx of [-2.2, 2.2]) for (const dy of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) pts.push([P.x + dx, P.y + dy, P.z + dz]);
  pts.push([0, 0, SCENE.lampZ], [0, 3.1, SCENE.lampZ], [0, 0, SCENE.lampZ + 0.6], [0, 0, P.z - 1], [0, 0, P.z + 1]);
  for (const x of [SCENE.wall.x0, SCENE.wall.x1]) for (const y of [0, SCENE.wall.y1]) pts.push([x, y, 0]);
  const c = fitCam(cam.yaw, cam.pitch, pts, SR.w, SR.h, 16);
  if (CAMS.size > 256) CAMS.clear();
  CAMS.set(k, c); return c;
}

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const corners = (c) => { const P = SCENE.pivot, out = []; for (const a of [-HALF, HALF]) for (const b of [-HALF, HALF]) for (const d of [-HALF, HALF]) out.push([P.x + c[0] + a, P.y + c[1] + b, P.z + c[2] + d]); return out; };
export function camPolys(cam, piece, o, placedFn = placed) {
  const C = viewCam(cam);
  return placedFn(piece, o).map((c) => hull(corners(c).map((p) => { const q = C.project(p[0], p[1], p[2]); return [q.x, -q.y]; })));
}
export function floorPolys(cam, piece, o, placedFn = placed) {
  const C = viewCam(cam);
  return placedFn(piece, o).map((c) => hull(corners(c).map((p) => {
    const t = p[1] / KEY[1], f = [p[0] - KEY[0] * t, 0, p[2] - KEY[2] * t];
    const q = C.project(f[0], f[1], f[2]); return [q.x, -q.y];
  })));
}
const inConvex = (poly, x, y) => {
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
};
const withBox = (p) => { p.bb = [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]; return p; };
const inPolys = (polys, x, y) => polys.some((p) => x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && inConvex(p, x, y));
const inCells = (cells, x, y) => cells.some(([cx, cy]) => Math.abs(x - cx) <= 0.5 && Math.abs(y - cy) <= 0.5);

function polyShape(polys) {
  polys.forEach(withBox);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const n = 64, h = Math.max(x1 - x0, y1 - y0) / n;
  let sx = 0, sy = 0, k = 0;
  for (let y = y0 + h / 2; y < y1; y += h) for (let x = x0 + h / 2; x < x1; x += h) if (inPolys(polys, x, y)) { sx += x; sy += y; k++; }
  return { inside: (x, y) => inPolys(polys, x, y), cx: sx / k, cy: sy / k, area: k * h * h, box: [x0, y0, x1, y1] };
}
function cellShape(cells) {
  const n = cells.length, cx = cells.reduce((s, c) => s + c[0], 0) / n, cy = cells.reduce((s, c) => s + c[1], 0) / n;
  const box = [Math.min(...cells.map((c) => c[0])) - 0.5, Math.min(...cells.map((c) => c[1])) - 0.5, Math.max(...cells.map((c) => c[0])) + 0.5, Math.max(...cells.map((c) => c[1])) + 0.5];
  return { inside: (x, y) => inCells(cells, x, y), cx, cy, area: n, box };
}
const G = 48, L = 2.4;
function maskArea(S, rot = 0) {
  const m = new Uint8Array(G * G), s = Math.sqrt(S.area), c = Math.cos(rot), si = Math.sin(rot);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const u = -L + (2 * L) * (i + 0.5) / G, v = -L + (2 * L) * (j + 0.5) / G;
    const ur = c * u + si * v, vr = -si * u + c * v;
    m[j * G + i] = S.inside(S.cx + ur * s, S.cy + vr * s) ? 1 : 0;
  }
  return m;
}
function maskBox(S) {
  const m = new Uint8Array(G * G), [x0, y0, x1, y1] = S.box;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const u = -1 + 2 * (i + 0.5) / G, v = -1 + 2 * (j + 0.5) / G;
    m[j * G + i] = S.inside((x0 + x1) / 2 + u * (x1 - x0) / 2, (y0 + y1) / 2 + v * (y1 - y0) / 2) ? 1 : 0;
  }
  return m;
}
function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; }

const ROTS = [-30, -20, -10, 0, 10, 20, 30].map((d) => d * Math.PI / 180);
export function scores(m, kind = 'cam', placedFn = placed) {
  const cells = m.target.split(' ').map((t) => t.split(',').map(Number));
  const T = cellShape(cells), tA = maskArea(T), tB = maskBox(T), tR = ROTS.map((r) => maskArea(T, r));
  const out = { A: [], R: [], B: [] };
  for (let o = 0; o < ORIENTS.length; o++) {
    const S = polyShape((kind === 'floor' ? floorPolys : camPolys)(m.cam, m.piece, o, placedFn));
    const sA = maskArea(S);
    out.A.push(iou(sA, tA));
    out.R.push(Math.max(...tR.map((t) => iou(sA, t))));
    out.B.push(iou(maskBox(S), tB));
  }
  return out;
}

export function ball(start, r) {
  const d = new Map([[start, 0]]), q = [start];
  while (q.length) { const o = q.shift(); if (d.get(o) >= r) continue; for (const mv of MOVE_NAMES) { const n = step(o, mv); if (!d.has(n)) { d.set(n, d.get(o) + 1); q.push(n); } } }
  return [...d.keys()];
}
export const argmax = (arr, among) => among.reduce((b, o) => (arr[o] > arr[b] + 1e-12 || (Math.abs(arr[o] - arr[b]) <= 1e-12 && o < b) ? o : b), among[0]);

export const TWO_PRESS = (() => {
  const o0 = orientIndex(I3), near = ball(o0, 1), out = {};
  for (const o of ball(o0, 2).filter((p) => !near.includes(p))) {
    const prev = new Map([[o0, null]]), q = [o0];
    while (q.length) { const a = q.shift(); for (const mv of MOVE_NAMES) { const b = step(a, mv); if (!prev.has(b)) { prev.set(b, [a, mv]); q.push(b); } } }
    const seq = []; for (let k = o; prev.get(k); k = prev.get(k)[0]) seq.unshift(prev.get(k)[1]);
    out[seq.join('+')] = ORIENTS[o];
  }
  return out;
})();
export const BLIND_TURNS = {
  L4: { 'right+right': 1, 'right+up': 2, 'right+down': 2, 'left+up': 2, 'left+down': 2, 'up+right': 2, 'up+left': 2, 'up+up': 4, 'down+right': 2, 'down+left': 2 },
  T4: { 'right+right': 10, 'up+right': 3, 'up+left': 3, 'down+right': 3, 'down+left': 3 },
  S4: { 'right+up': 3, 'right+down': 3, 'left+up': 3, 'left+down': 3, 'up+right': 2, 'up+left': 2, 'down+right': 2, 'down+left': 2 },
  P5: { 'right+right': 1, 'right+up': 2, 'right+down': 2, 'left+up': 2, 'left+down': 2, 'up+right': 2, 'up+left': 2, 'up+up': 4, 'down+right': 2, 'down+left': 2 },
  L5: { 'right+right': 1, 'right+up': 2, 'right+down': 2, 'left+up': 2, 'left+down': 2, 'up+right': 2, 'up+left': 2, 'up+up': 4, 'down+right': 2, 'down+left': 2 },
  chair: { 'right+right': 6, 'right+up': 2, 'right+down': 2, 'left+down': 3, 'up+right': 2, 'up+left': 2, 'down+right': 2, 'down+left': 2 },
  hook: { 'right+right': 1, 'right+up': 3, 'right+down': 3, 'left+up': 3, 'left+down': 3, 'up+right': 1, 'up+left': 1, 'up+up': 6, 'down+right': 1, 'down+left': 1 },
};

const D8 = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
const canon = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return [...new Set(cells.map(([x, y]) => `${x - mx},${y - my}`))].sort().join(' ');
};
export function topCongruent(m, o, placedFn = placed) {
  const top = placedFn(m.piece, o).map((c) => [c[0], c[2]]);
  const target = m.target.split(' ').map((t) => t.split(',').map(Number));
  const tk = canon(target);
  return D8.some(([a, b, c, d]) => canon(top.map(([x, y]) => [a * x + b * y, c * x + d * y])) === tk);
}

export const CAM_MARGIN = 0.04, FLOOR_MAX = 0.6;
export function blindProblems(m, matchingFn) {
  const errs = [];
  const good = new Set(matchingFn(m.piece, m.target));
  if (!good.size) return ['no-match'];
  const sets = { all: [...Array(ORIENTS.length).keys()], near: ball(m.start, 2) };
  for (const kind of ['cam', 'floor']) {
    const sc = scores(m, kind), margin = kind === 'cam' ? CAM_MARGIN : 1e-9;
    for (const [k, arr] of Object.entries(sc)) for (const [sn, set] of Object.entries(sets)) {
      const wrong = set.filter((o) => !good.has(o)), right = set.filter((o) => good.has(o));
      if (!right.length) continue;
      const bw = Math.max(...wrong.map((o) => arr[o])), bc = Math.max(...right.map((o) => arr[o]));
      if (bw - bc < margin) errs.push(`${kind}-${k}-${sn}`);
    }
    if (kind === 'floor' && [...good].some((o) => sc.A[o] >= FLOOR_MAX)) errs.push('floor-looks-like-outline');
    if (errs.length) return errs;
  }
  if ([...good].some((o) => topCongruent(m, o))) errs.push('top-view-is-outline');
  let solving = 0;
  for (const a of MOVE_NAMES) for (const b of MOVE_NAMES) if (good.has(step(step(m.start, a), b))) solving++;
  if (solving > 2) errs.push('many-two-press-answers');
  return errs;
}
