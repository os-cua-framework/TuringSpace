import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { render, toCanvas, contextScale, objectRing, pickObj, screenRects, hitsAny } from '../common/_slope_roll_tap_ray.js';
import {
  rampFrame, flatFrame, objFrame, onPlank, footprint, objHeight, rollClass, bookBoxes, sceneFor, renderScene,
  frameCamera, framePoints, cameraFor, RAMP_ID, FLAT_ID, BOOK_ID0, STY, BOOK_COLS, renderSceneStyled,
} from '../common/_slope_roll_tap_scene.js';
import { buildSlopeLook } from '../common/_slope_roll_tap_look.js';

const NAME = 'slope_roll_tap';
const PANEL_W = 400;
const BOARD = { w: 380, h: 316 };
const SCENE = { w: 380, h: 316 };

const VIEW_ZOOM = 0.86;
const viewRound = (rd) => ({ ...rd, cam: { ...rd.cam, fov: 2 * Math.atan(Math.tan((rd.cam.fov * Math.PI) / 360) / VIEW_ZOOM) * 180 / Math.PI } });
const toView = (x, y) => [SCENE.w / 2 + (x - SCENE.w / 2) * VIEW_ZOOM, SCENE.h / 2 + (y - SCENE.h / 2) * VIEW_ZOOM];
const fromView = (x, y) => [SCENE.w / 2 + (x - SCENE.w / 2) / VIEW_ZOOM, SCENE.h / 2 + (y - SCENE.h / 2) / VIEW_ZOOM];
const RAD = Math.PI / 180;
const HARD = Object.freeze({
  nMin: 9, nMax: 10, ansMin: 3, ansMax: 5,
  el: [33, 39], fov: 30,
  bandF: [20, 48],
  bandS: [54, 68],
  theta: [12, 15],
  rampL: [0.84, 0.9], rampW: [0.37, 0.4], over: [0.06, 0.09],
  flatL: [0.5, 0.6], flatW: [0.26, 0.3],
  bookOut: [0.08, 0.12], bookD: [0.22, 0.26],
  gap: [0.06, 0.12], plankClear: 0.05, layouts: 8, placeTries: 12,
  edge: 0.014,
  sep: 0.03,
  lane: 0.02,
  pathShare: 0.2,
  canGamma: 42,
  pad: 6,
  visFrac: 0.9, minInner: 3, gapPx: 4, plankGapPx: 3,
  minVis: { ball: 170, can: 300, wheel: 200, cart: 420, box: 170 },
  plankVis: 0.7, bookVis: 700,
  dist: [1.0, 2.6],
  tapTol: 7,
});
const SIZE = Object.freeze({
  ball: { r: [0.032, 0.035] },
  can: { r: [0.031, 0.034], l: [0.118, 0.126] },
  wheel: { R: [0.041, 0.045], w: [0.03, 0.033] },
  cart: { L: [0.138, 0.148], W: [0.078, 0.086] },
  box: { a: [0.052, 0.06] },
});
const KINDS = Object.keys(SIZE);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const inR = (v, [a, b]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const sameSet = (a, b) => { if (a.length !== b.length) return false; const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q); return x.every((v, i) => v === y[i]); };

function rectFrom(cx, cy, fx, fy, a0, a1, b0, b1) {
  const gx = -fy, gy = fx, ac = (a0 + a1) / 2, bc = (b0 + b1) / 2;
  return { cx: cx + fx * ac + gx * bc, cy: cy + fy * ac + gy * bc, ax: [fx, fy], bx: [gx, gy], ha: (a1 - a0) / 2, hb: (b1 - b0) / 2 };
}
function projR(R, ax) {
  const c = R.cx * ax[0] + R.cy * ax[1];
  const r = R.ha * Math.abs(R.ax[0] * ax[0] + R.ax[1] * ax[1]) + R.hb * Math.abs(R.bx[0] * ax[0] + R.bx[1] * ax[1]);
  return [c - r, c + r];
}
function rectsClose(A, B, m) {
  for (const R of [A, B]) for (const ax of [R.ax, R.bx]) {
    const pa = projR(A, ax), pb = projR(B, ax);
    if (pa[1] + m <= pb[0] || pb[1] + m <= pa[0]) return false;
  }
  return true;
}
function corners(R) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [R.cx + R.ax[0] * R.ha * p + R.bx[0] * R.hb * q, R.cy + R.ax[1] * R.ha * p + R.bx[1] * R.hb * q]);
}
function objRect(ob) {
  const [a0, a1, b0, b1] = footprint(ob);
  return rectFrom(ob.s, ob.t, Math.cos(ob.phi * RAD), Math.sin(ob.phi * RAD), a0, a1, b0, b1);
}
function corridor(ob) {
  const rc = rollClass(ob, true);
  let [a0, a1, b0, b1] = footprint(ob);
  const fx = Math.cos(ob.phi * RAD), fy = Math.sin(ob.phi * RAD), E = 1.3;
  if (rc.dir === 'down' || rc.dir === 'f') { if (fx < 0) a1 += E; else a0 -= E; }
  else if (rc.dir === 'g') { if (-fy < 0) b1 += E; else b0 -= E; }
  return rectFrom(ob.s, ob.t, fx, fy, a0, a1, b0, b1);
}
function rollDir(ob) {
  const rc = rollClass(ob, true), fx = Math.cos(ob.phi * RAD), fy = Math.sin(ob.phi * RAD);
  if (rc.dir === 'down') return [-1, 0];
  if (rc.dir === 'f') return fx < 0 ? [fx, fy] : [-fx, -fy];
  return -fy < 0 ? [-fy, fx] : [fy, -fx];
}
function extents(ob) {
  const cs = corners(objRect(ob));
  return { s0: Math.min(...cs.map((q) => q[0])), s1: Math.max(...cs.map((q) => q[0])), t0: Math.min(...cs.map((q) => q[1])), t1: Math.max(...cs.map((q) => q[1])) };
}
function insidePlank(R, L, W, m) {
  return corners(R).every(([s, t]) => s >= m - 1e-9 && s <= L - m + 1e-9 && t >= -W / 2 + m - 1e-9 && t <= W / 2 - m + 1e-9);
}

function tableRects(rd) {
  const R = rampFrame(rd.ramp), run = rd.ramp.L * Math.cos(rd.ramp.theta * RAD);
  const d = [R.dh[0], R.dh[2]];
  const ramp = rectFrom(R.P0[0], R.P0[2], d[0], d[1], -run, 0, -rd.ramp.W / 2, rd.ramp.W / 2);
  const books = bookBoxes(rd.ramp).map((B) => rectFrom(B.C[0], B.C[2], B.ax[2][0], B.ax[2][2], -B.h[2], B.h[2], -B.h[0], B.h[0]));
  const F = flatFrame(rd.flat), fc = [rd.flat.x, rd.flat.z];
  const flat = rectFrom(fc[0], fc[1], F.u[0], F.u[2], -rd.flat.L / 2, rd.flat.L / 2, -rd.flat.W / 2, rd.flat.W / 2);
  const down = rectFrom(R.P0[0], R.P0[2], d[0], d[1], 0, 0.45, -rd.ramp.W / 2 - 0.2, rd.ramp.W / 2 + 0.2);
  return { ramp, books, flat, down };
}
function layoutOK(rd) {
  const T = tableRects(rd);
  if (rectsClose(T.flat, T.ramp, HARD.plankClear)) return false;
  if (T.books.some((B) => rectsClose(T.flat, B, HARD.plankClear))) return false;
  if (rectsClose(T.flat, T.down, 0)) return false;
  return true;
}

function roleOf(ob) {
  const rc = rollClass(ob, ob.pl === 'R');
  return { rolls: rc.rolls, cls: rc.cls };
}
function compositionOK(rd) {
  const objs = rd.objs, n = objs.length;
  if (n < HARD.nMin || n > HARD.nMax) return false;
  const ramp = objs.filter((o) => o.pl === 'R'), flat = objs.filter((o) => o.pl === 'F');
  if (ramp.length + flat.length !== n) return false;
  for (const o of objs) if (roleOf(o).cls === null) return false;
  const cnt = (list, k, p, cls) => list.filter((o) => o.k === k && (p === null || o.p === p) && (cls === null || roleOf(o).cls === cls)).length;
  if (cnt(ramp, 'can', 'lie', 'across') < 1 || cnt(ramp, 'can', 'lie', 'along') < 1 || cnt(ramp, 'can', 'lie', null) > 3) return false;
  if (cnt(ramp, 'cart', null, 'along') !== 1 || cnt(ramp, 'cart', null, 'across') !== 1) return false;
  const nw = cnt(ramp, 'wheel', null, null);
  if (nw < 1 || nw > 2) return false;
  const extras = ramp.filter((o) => !(o.k === 'can' && o.p === 'lie') && o.k !== 'cart' && o.k !== 'wheel');
  if (extras.length > 1 || extras.some((o) => !(o.k === 'ball' || o.k === 'box' || (o.k === 'can' && o.p === 'stand')))) return false;
  if (ramp.length < 6 || ramp.length > 7) return false;
  if (cnt(flat, 'ball', null, null) !== 1 || flat.length !== 3) return false;
  if (FLAT_TRAP && !flat.some((o) => (o.k === 'can' && o.p === 'lie') || o.k === 'cart')) return false;
  const keys = flat.map((o) => `${o.k}:${o.p}`);
  if (new Set(keys).size !== keys.length) return false;
  for (const k of KINDS) {
    const same = objs.filter((o) => o.k === k);
    if (!same.length) continue;
    const s0 = JSON.stringify(same[0].sz), st0 = same[0].sty;
    if (same.some((o) => JSON.stringify(o.sz) !== s0 || o.sty !== st0)) return false;
    if (!Object.keys(SIZE[k]).every((q) => inR(same[0].sz[q], SIZE[k][q])) || Object.keys(same[0].sz).length !== Object.keys(SIZE[k]).length) return false;
    if (!Number.isInteger(st0) || st0 < 0 || st0 >= STY[k].length) return false;
  }
  const fam = ['ball', 'can', 'cart'].map((k) => objs.find((o) => o.k === k)?.sty).filter((v) => v !== undefined);
  if (new Set(fam).size !== fam.length) return false;
  return true;
}
function answerOf(rd) { return rd.objs.map((o, i) => (roleOf(o).rolls ? i : -1)).filter((i) => i >= 0); }

function placementOK(rd) {
  for (const pl of ['R', 'F']) {
    const P = pl === 'R' ? rd.ramp : rd.flat;
    const list = rd.objs.filter((o) => o.pl === pl);
    const rects = list.map(objRect);
    for (let i = 0; i < list.length; i++) {
      if (!inR(list[i].s, [0, P.L]) || !inR(list[i].t, [-P.W / 2, P.W / 2])) return false;
      if (!insidePlank(rects[i], P.L, P.W, HARD.edge)) return false;
      for (let j = 0; j < i; j++) if (rectsClose(rects[i], rects[j], HARD.sep)) return false;
    }
    if (pl === 'R') {
      for (let i = 0; i < list.length; i++) {
        if (!roleOf(list[i]).rolls) continue;
        const C = corridor(list[i]);
        for (let j = 0; j < list.length; j++) if (j !== i && !roleOf(list[j]).rolls && rectsClose(C, rects[j], HARD.lane)) return false;
      }
    }
  }
  return true;
}
function canGamma(rd, ob, cam) {
  const P = ob.pl === 'R' ? rampFrame(rd.ramp) : flatFrame(rd.flat), F = objFrame(P, ob);
  const C = [F.B[0] + F.n[0] * ob.sz.r, F.B[1] + F.n[1] * ob.sz.r, F.B[2] + F.n[2] * ob.sz.r];
  const v = [C[0] - cam.eye[0], C[1] - cam.eye[1], C[2] - cam.eye[2]], l = Math.hypot(v[0], v[1], v[2]);
  const c = Math.abs(v[0] * F.f[0] + v[1] * F.f[1] + v[2] * F.f[2]) / l;
  return Math.acos(Math.min(1, c)) / RAD;
}

const STEP = 2;
const PICS = new WeakMap();
export function pictureStats(rd) {
  if (PICS.has(rd)) return PICS.get(rd);
  const W = SCENE.w, H = SCENE.h, sc = sceneFor(rd, W, H), ix = sc.ix, n = rd.objs.length;
  const cols = Math.floor(W / STEP) + 1, rows = Math.floor(H / STEP) + 1;
  const idm = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) idm[r * cols + c] = pickObj(ix, c * STEP, r * STEP);
  const at = (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows ? idm[r * cols + c] : -9);
  const bboxOf = (list) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of list) {
      const [lo, hi] = ix.boxes[k];
      for (let q = 0; q < 8; q++) {
        const p = sc.cam.project([q & 1 ? hi[0] : lo[0], q & 2 ? hi[1] : lo[1], q & 4 ? hi[2] : lo[2]]);
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
    }
    return [Math.floor(x0 / STEP) - 1, Math.ceil(x1 / STEP) + 1, Math.floor(y0 / STEP) - 1, Math.ceil(y1 / STEP) + 1];
  };
  const aloneStats = (list, id) => {
    const [c0, c1, q0, q1] = bboxOf(list), rects = screenRects(ix, list);
    let area = 0, vis = 0, off = 0;
    for (let r = q0; r <= q1; r++) for (let c = c0; c <= c1; c++) {
      const x = c * STEP, y = r * STEP;
      if (!hitsAny(ix, rects, x, y)) continue;
      area++;
      if (x < HARD.pad || y < HARD.pad || x > W - HARD.pad || y > H - HARD.pad) off++;
      if (at(c, r) === id) vis++;
    }
    return { area, vis, off, frac: area ? vis / area : 0 };
  };
  const obj = [];
  const Rg = Math.ceil(HARD.gapPx / STEP), Rp = Math.ceil(HARD.plankGapPx / STEP);
  for (let i = 0; i < n; i++) {
    const S = aloneStats(sc.objIdx[i], i);
    const other = rd.objs[i].pl === 'R' ? FLAT_ID : RAMP_ID;
    let best = -1, pt = null, sepBad = false, plankBad = false, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, m = 0;
    const [c0, c1, q0, q1] = bboxOf(sc.objIdx[i]);
    for (let r = q0; r <= q1; r++) for (let c = c0; c <= c1; c++) {
      if (at(c, r) !== i) continue;
      m++; sx += c; sy += r; sxx += c * c; syy += r * r; sxy += c * r;
      let d = 0;
      for (let k = 1; k <= 10; k++) {
        let ok = true;
        for (let dy = -k; dy <= k && ok; dy++) for (let dx = -k; dx <= k; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue; if (at(c + dx, r + dy) !== i) { ok = false; break; } }
        if (!ok) break;
        d = k;
      }
      const score = d * 1000 - Math.abs(r - (q0 + q1) / 2);
      if (score > best) { best = score; pt = [c * STEP, r * STEP, (d + 0.5) * STEP]; }
      for (let dy = -Rg; dy <= Rg && !sepBad; dy++) for (let dx = -Rg; dx <= Rg; dx++) { const v = at(c + dx, r + dy); if (v >= 0 && v < n && v !== i) { sepBad = true; break; } }
      for (let dy = -Rp; dy <= Rp && !plankBad; dy++) for (let dx = -Rp; dx <= Rp; dx++) { if (at(c + dx, r + dy) === other) { plankBad = true; break; } }
    }
    let axis = 0;
    if (m > 2) {
      const mx = sx / m, my = sy / m, cxx = sxx / m - mx * mx, cyy = syy / m - my * my, cxy = sxy / m - mx * my;
      axis = 0.5 * Math.atan2(2 * cxy, cxx - cyy) / RAD;
    }
    obj.push({ ...S, visPx: S.vis * STEP * STEP, pt, inner: pt ? pt[2] : 0, sepBad, plankBad, blobAxis: axis, cy: m ? (sy / m) * STEP : 0, cx: m ? (sx / m) * STEP : 0, areaPx: S.area * STEP * STEP });
  }
  const planks = [RAMP_ID, FLAT_ID].map((id) => aloneStats(id === RAMP_ID ? sc.rampIdx : sc.flatIdx, id));
  let bookPx = 0, touch = false;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = idm[r * cols + c];
    if (v >= BOOK_ID0) bookPx += STEP * STEP;
    if (v === RAMP_ID && !touch) for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (at(c + dx, r + dy) === FLAT_ID) { touch = true; break; }
  }
  let pathBad = 0;
  const Rf = rampFrame(rd.ramp);
  rd.objs.forEach((ob, i) => {
    if (ob.pl !== 'R' || !roleOf(ob).rolls) return;
    const d = rollDir(ob), lim = [];
    if (d[0] < -1e-9) lim.push(ob.s / -d[0]);
    if (d[1] > 1e-9) lim.push((rd.ramp.W / 2 - ob.t) / d[1]);
    if (d[1] < -1e-9) lim.push((ob.t + rd.ramp.W / 2) / -d[1]);
    const D = Math.min(...lim), hgt = objHeight(ob), P2 = [];
    for (const [cs, ct] of corners(objRect(ob))) for (const lam of [0, D]) for (const h of [0, hgt]) {
      const q = sc.cam.project(onPlank(Rf, cs + d[0] * lam, ct + d[1] * lam, h));
      P2.push([q[0] / STEP, q[1] / STEP]);
    }
    const hull = convexHull(P2);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const inside = new Array(n).fill(0);
    for (let r = Math.max(0, Math.floor(y0)); r <= Math.min(rows - 1, Math.ceil(y1)); r++) for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(cols - 1, Math.ceil(x1)); c++) {
      const v = idm[r * cols + c];
      if (v >= 0 && v < n && v !== i && inHull(hull, c, r)) inside[v]++;
    }
    for (let j = 0; j < n; j++) if (j !== i && !(rd.objs[j].pl === 'R' && roleOf(rd.objs[j]).rolls) && obj[j].vis > 0 && inside[j] >= HARD.pathShare * obj[j].vis) pathBad++;
  });
  const res = { obj, planks, bookPx, touch, pathBad };
  PICS.set(rd, res);
  return res;
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function hullsApart(A, B, m) {
  for (const Q of [A, B]) for (let i = 0; i < Q.length; i++) {
    const p = Q[i], q = Q[(i + 1) % Q.length], nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny);
    if (l < 1e-9) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of A) { const d = (v[0] * nx + v[1] * ny) / l; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const v of B) { const d = (v[0] * nx + v[1] * ny) / l; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 + m <= b0 || b1 + m <= a0) return true;
  }
  return false;
}
function inHull(h, x, y) {
  for (let k = 0; k < h.length; k++) {
    const a = h[k], b = h[(k + 1) % h.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

function quickSeparation(rd) {
  const W = SCENE.w, H = SCENE.h, sc = sceneFor(rd, W, H), ix = sc.ix, n = rd.objs.length;
  const cols = Math.floor(W / STEP) + 1, rows = Math.floor(H / STEP) + 1, R = Math.ceil(HARD.gapPx / STEP);
  const idm = new Int16Array(cols * rows).fill(-9), boxes = [];
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of sc.objIdx[i]) {
      const [lo, hi] = ix.boxes[k];
      for (let q = 0; q < 8; q++) {
        const p = sc.cam.project([q & 1 ? hi[0] : lo[0], q & 2 ? hi[1] : lo[1], q & 4 ? hi[2] : lo[2]]);
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
    }
    boxes.push([Math.max(0, Math.floor(x0 / STEP) - R), Math.min(cols - 1, Math.ceil(x1 / STEP) + R), Math.max(0, Math.floor(y0 / STEP) - R), Math.min(rows - 1, Math.ceil(y1 / STEP) + R)]);
  }
  for (const [c0, c1, r0, r1] of boxes) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (idm[r * cols + c] === -9) idm[r * cols + c] = pickObj(ix, c * STEP, r * STEP);
  const at = (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows ? idm[r * cols + c] : -9);
  for (let i = 0; i < n; i++) {
    const [c0, c1, r0, r1] = boxes[i];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (at(c, r) !== i) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const v = at(c + dx, r + dy); if (v >= 0 && v < n && v !== i) return false; }
    }
  }
  return true;
}

function screenTilt(cam, A, B) {
  const a = cam.project(A), b = cam.project(B);
  const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 180;
  return Math.min(ang, 180 - ang);
}
export function axisTilts(rd) {
  const cam = cameraFor(rd, SCENE.w, SCENE.h);
  return rd.objs.map((ob) => {
    const P = ob.pl === 'R' ? rampFrame(rd.ramp) : flatFrame(rd.flat), F = objFrame(P, ob);
    const h = ob.k === 'can' ? ob.sz.r : ob.k === 'wheel' ? ob.sz.R : 0.04, len = ob.k === 'can' ? ob.sz.l / 2 : ob.k === 'wheel' ? ob.sz.R : ob.k === 'cart' ? ob.sz.L / 2 : 0;
    if (!((ob.k === 'can' && ob.p === 'lie') || (ob.k === 'wheel' && ob.p === 'stand') || ob.k === 'cart')) return null;
    const C = [F.B[0] + F.n[0] * h, F.B[1] + F.n[1] * h, F.B[2] + F.n[2] * h];
    return screenTilt(cam, [C[0] - F.f[0] * len, C[1] - F.f[1] * len, C[2] - F.f[2] * len], [C[0] + F.f[0] * len, C[1] + F.f[1] * len, C[2] + F.f[2] * len]);
  });
}
export function axisScreenLens(rd) {
  const cam = cameraFor(rd, SCENE.w, SCENE.h);
  return rd.objs.map((ob) => {
    if (!((ob.k === 'can' && ob.p === 'lie') || (ob.k === 'wheel' && ob.p === 'stand') || ob.k === 'cart')) return 0;
    const P = ob.pl === 'R' ? rampFrame(rd.ramp) : flatFrame(rd.flat), F = objFrame(P, ob);
    const h = ob.k === 'can' ? ob.sz.r : ob.k === 'wheel' ? ob.sz.R : 0.04, len = ob.k === 'can' ? ob.sz.l / 2 : ob.k === 'wheel' ? ob.sz.R : ob.sz.L / 2;
    const C = [F.B[0] + F.n[0] * h, F.B[1] + F.n[1] * h, F.B[2] + F.n[2] * h];
    const a = cam.project([C[0] - F.f[0] * len, C[1] - F.f[1] * len, C[2] - F.f[2] * len]), b = cam.project([C[0] + F.f[0] * len, C[1] + F.f[1] * len, C[2] + F.f[2] * len]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
}
export function screenRule(rd, tilts, mode) {
  return rd.objs.map((ob, i) => {
    if (ob.pl !== 'R') return -1;
    if (ob.k === 'ball') return i;
    const t = tilts[i];
    if (t === null) return -1;
    const vertical = t > 45;
    if (ob.k === 'can') return (mode === 'v' ? !vertical : vertical) ? i : -1;
    return (mode === 'v' ? vertical : !vertical) ? i : -1;
  }).filter((i) => i >= 0);
}
function rampOrderSets(rd, k) {
  const ids = rd.objs.map((o, i) => i).filter((i) => rd.objs[i].pl === 'R');
  const bySd = ids.slice().sort((a, b) => rd.objs[a].s - rd.objs[b].s || a - b);
  return [bySd.slice(0, k), bySd.slice(-k)];
}

export function checkRound(rd) {
  if (!rd || !rd.cam || !rd.light || !rd.ramp || !rd.flat || !Array.isArray(rd.objs)) return null;
  const { cam, light, ramp, flat } = rd;
  if (!inR(cam.el, HARD.el) || cam.fov !== HARD.fov || !inR(cam.dist, HARD.dist) || !Array.isArray(cam.target) || cam.target.length !== 3 || !cam.target.every(Number.isFinite) || cam.target[1] !== 0.06) return null;
  if (!inR(Math.abs(angDiff(light.az, 180)), [22, 55]) || !inR(light.el, [52, 62])) return null;
  if (!inR(ramp.beta, [0, 360]) || !(inR(angDiff(ramp.beta, 180), HARD.bandF) || inR(angDiff(ramp.beta, 180), HARD.bandS)) || !inR(ramp.theta, HARD.theta) || !inR(ramp.L, HARD.rampL) || !inR(ramp.W, HARD.rampW) || !inR(ramp.L - ramp.sp, HARD.over)) return null;
  if (ramp.x !== 0 || ramp.z !== 0 || ![0, 1].includes(ramp.wood) || !Number.isFinite(ramp.seed)) return null;
  if (!Array.isArray(ramp.books) || ramp.books.length < 3 || ramp.books.length > 4) return null;
  const hTot = ramp.sp * Math.sin(ramp.theta * RAD), wSum = ramp.books.reduce((a, b) => a + b.w, 0);
  for (const b of ramp.books) {
    if (!inR(b.w, [0.8, 1.25]) || !inR(hTot * b.w / wSum, [0.035, 0.08])) return null;
    if (!inR(b.l - ramp.W, HARD.bookOut) || !inR(b.d, HARD.bookD) || !inR(b.ds, [-0.015, 0.015]) || !inR(b.dt, [-0.015, 0.015]) || !inR(b.yaw, [-4, 4])) return null;
    if (!Number.isInteger(b.col) || b.col < 0 || b.col >= BOOK_COLS.length || !Number.isInteger(b.spine) || b.spine < 0 || b.spine > 3) return null;
  }
  if (new Set(ramp.books.map((b) => b.col)).size !== ramp.books.length) return null;
  const top = ramp.books[ramp.books.length - 1];
  if (top.d < (ramp.L - ramp.sp) * Math.cos(ramp.theta * RAD) + 0.12) return null;
  if (!inR(flat.L, HARD.flatL) || !inR(flat.W, HARD.flatW) || ![0, 1].includes(flat.wood) || flat.wood === ramp.wood || !Number.isFinite(flat.seed)) return null;
  const rel = angDiff(flat.yaw, ramp.beta) % 180;
  if (!(Math.min(rel, 180 - rel) <= 20 + 1e-9 || Math.abs(Math.min(rel, 180 - rel) - 90) <= 20 + 1e-9)) return null;
  if (!layoutOK(rd)) return null;
  for (const o of rd.objs) {
    if (!KINDS.includes(o.k) || !['R', 'F'].includes(o.pl) || ![o.s, o.t, o.phi, o.aux].every(Number.isFinite)) return null;
    if ((o.k === 'can' || o.k === 'wheel') ? !['lie', 'stand'].includes(o.p) : o.p !== '') return null;
    if (!inR(o.phi, [-360, 360]) || !inR(o.aux, [0, 360])) return null;
  }
  if (!compositionOK(rd)) return null;
  const ans = answerOf(rd);
  if (ans.length < HARD.ansMin || ans.length > HARD.ansMax) return null;
  if (!Array.isArray(rd.answer) || !sameSet(rd.answer, ans) || rd.answer.some((v, k) => v !== ans[k])) return null;
  if (!placementOK(rd)) return null;
  const camO = cameraFor(rd, SCENE.w, SCENE.h);
  for (const P of framePoints(rd)) {
    const q = camO.project(P);
    if (q[2] <= 0.2 || q[0] < HARD.pad - 0.5 || q[0] > SCENE.w - HARD.pad + 0.5 || q[1] < HARD.pad - 0.5 || q[1] > SCENE.h - HARD.pad + 0.5) return null;
  }
  for (const o of rd.objs) if (o.k === 'can' && o.p === 'lie' && canGamma(rd, o, camO) < HARD.canGamma) return null;
  const k = ans.length;
  for (const S of rampOrderSets(rd, k)) if (sameSet(S, ans)) return null;
  const pic = pictureStats(rd);
  const obj0 = pic.obj;
  for (const s of pic.obj) {
    if (s.off > 0) return null;
    if (s.frac < HARD.visFrac) return null;
    if (s.visPx < HARD.minVis[rd.objs[obj0.indexOf(s)].k]) return null;
    if (!s.pt || s.inner < HARD.minInner) return null;
    if (s.sepBad) return null;
    if (s.plankBad) return null;
  }
  if (pic.planks.some((s) => s.frac < HARD.plankVis) || pic.touch || pic.bookPx < HARD.bookVis) return null;
  if (pic.pathBad) return null;
  const sc = sceneFor(rd, SCENE.w, SCENE.h);
  const pts = pic.obj.map((s) => [s.pt[0], s.pt[1]]);
  if (pts.some((p, i) => pickObj(sc.ix, p[0], p[1]) !== i)) return null;
  const tilts = axisTilts(rd), blob = pic.obj.map((q, i) => (tilts[i] === null ? null : tiltOf(q.blobAxis)));
  const kr = {};
  const ids = rd.objs.map((_, i) => i), rampIds = ids.filter((i) => rd.objs[i].pl === 'R');
  const firstK = (list, key) => list.slice().sort((x, y) => key(x) - key(y) || x - y).slice(0, k);
  kr.lowOnScreen = sameSet(firstK(ids, (i) => -pic.obj[i].cy), ans);
  kr.highOnScreen = sameSet(firstK(ids, (i) => pic.obj[i].cy), ans);
  kr.largest = sameSet(firstK(ids, (i) => -pic.obj[i].visPx), ans);
  kr.smallest = sameSet(firstK(ids, (i) => pic.obj[i].visPx), ans);
  kr.leftmost = sameSet(firstK(ids, (i) => pic.obj[i].cx), ans);
  kr.rightmost = sameSet(firstK(ids, (i) => -pic.obj[i].cx), ans);
  kr.rampLowOnScreen = sameSet(firstK(rampIds, (i) => -pic.obj[i].cy), ans);
  kr.rampLargest = sameSet(firstK(rampIds, (i) => -pic.obj[i].visPx), ans);
  const lens = axisScreenLens(rd), pr = { s: [], y: [], area: [], full: [], len: [], tilt: [] };
  const cmp = (a, b, tol) => (a > b + tol ? 1 : b > a + tol ? -1 : 0);
  for (const kind of ['can', 'cart']) {
    const pair = ids.filter((i) => rd.objs[i].pl === 'R' && rd.objs[i].k === kind && (kind === 'cart' || rd.objs[i].p === 'lie'));
    const r = pair.find((i) => roleOf(rd.objs[i]).rolls), t = pair.find((i) => !roleOf(rd.objs[i]).rolls);
    pr.s.push(cmp(rd.objs[r].s, rd.objs[t].s, 0.005));
    pr.y.push(cmp(pic.obj[r].cy, pic.obj[t].cy, 1));
    pr.area.push(cmp(pic.obj[r].visPx, pic.obj[t].visPx, 0.02 * Math.max(pic.obj[r].visPx, pic.obj[t].visPx)));
    pr.full.push(cmp(pic.obj[r].areaPx, pic.obj[t].areaPx, 0.02 * Math.max(pic.obj[r].areaPx, pic.obj[t].areaPx)));
    pr.len.push(cmp(lens[r], lens[t], 1));
    pr.tilt.push(cmp(tilts[r], tilts[t], 1));
  }
  return {
    pts, pr,
    v: sameSet(screenRule(rd, tilts, 'v'), ans), h: sameSet(screenRule(rd, tilts, 'h'), ans),
    vS: sameSet(screenRule(rd, blob, 'v'), ans), hS: sameSet(screenRule(rd, blob, 'h'), ans),
    kr, band: inR(angDiff(rd.ramp.beta, 180), HARD.bandS) ? 'S' : 'F',
  };
}
const tiltOf = (deg) => { const a = ((deg % 180) + 180) % 180; return Math.min(a, 180 - a); };
export function sceneProblems(q) {
  const errs = [];
  for (const key of ['v', 'h', 'vS', 'hS']) if (q[key]) errs.push(`screen-rule-${key}`);
  for (const key of Object.keys(q.kr)) if (q.kr[key]) errs.push(`rank-${key}`);
  return errs;
}

function sampleSizes(rng) {
  const out = {};
  for (const k of KINDS) { out[k] = {}; for (const [q, [a, b]] of Object.entries(SIZE[k])) out[k][q] = r3(rng.uniform(a, b)); }
  return out;
}
const U = (rng, a, b) => rng.uniform(a, b);
function mk(k, p, pl, sz, sty, phi, aux) { return { k, p, pl, s: 0, t: 0, phi: r2(phi), sz: { ...sz[k] }, sty: sty[k], aux: r2(aux) }; }
function layoutSpread(rd, el) {
  const T = tableRects(rd), pts = [];
  for (const Rt of [T.ramp, T.flat, ...T.books]) for (const [x, z] of corners(Rt)) pts.push([x, 0, z], [x, 0.24, z]);
  const cx = (T.ramp.cx + T.flat.cx) / 2, cz = (T.ramp.cy + T.flat.cy) / 2;
  const cam = cameraFor({ cam: { el, fov: HARD.fov, dist: 1.8, target: [cx, 0.06, cz] } }, SCENE.w, SCENE.h);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const P of pts) { const q = cam.project(P); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return { k: Math.max((x1 - x0) / (SCENE.w - 2 * HARD.pad), (y1 - y0) / (SCENE.h - 2 * HARD.pad)), cam };
}
function planksApart(rd, cam, px) {
  const quad = (P) => [[0, -1], [0, 1], [1, 1], [1, -1]].map(([a, b]) => cam.project([P.O[0] + P.u[0] * P.L * a + P.c[0] * P.W / 2 * b, P.O[1] + P.u[1] * P.L * a + P.c[1] * P.W / 2 * b, P.O[2] + P.u[2] * P.L * a + P.c[2] * P.W / 2 * b]));
  const A = quad(rampFrame(rd.ramp)), B = quad(flatFrame(rd.flat));
  for (const Q of [A, B]) for (let i = 0; i < 4; i++) {
    const p = Q[i], q = Q[(i + 1) % 4], nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny) || 1;
    const pa = A.map((v) => (v[0] * nx + v[1] * ny) / l), pb = B.map((v) => (v[0] * nx + v[1] * ny) / l);
    if (Math.max(...pa) + px <= Math.min(...pb) || Math.max(...pb) + px <= Math.min(...pa)) return true;
  }
  return false;
}
function tryRound(rng, band, upper, comp) {
  const el = r2(U(rng, ...HARD.el));
  const theta = r2(U(rng, ...HARD.theta)), L = r3(U(rng, ...HARD.rampL)), W = r3(U(rng, ...HARD.rampW));
  const sp = r3(L - U(rng, HARD.over[0] + 0.001, HARD.over[1] - 0.001));
  const bd = band === 'S' ? HARD.bandS : HARD.bandF;
  const beta = r2(180 + rng.sign() * U(rng, bd[0] + 0.01, bd[1] - 0.01));
  const nb = rng.int(3, 4), cols = rng.shuffle(BOOK_COLS.map((_, i) => i)).slice(0, nb);
  const books = cols.map((col) => ({ w: r3(U(rng, 0.8, 1.25)), l: r3(W + U(rng, HARD.bookOut[0] + 0.001, HARD.bookOut[1] - 0.001)), d: r3(U(rng, ...HARD.bookD)), ds: r3(U(rng, -0.015, 0.015)), dt: r3(U(rng, -0.015, 0.015)), yaw: r2(U(rng, -4, 4)), col, spine: rng.int(0, 3) }));
  const wood = rng.int(0, 1);
  const ramp = { x: 0, z: 0, beta, theta, L, W, sp, books, wood, seed: r2(U(rng, 0, 50)) };
  const fl = r3(U(rng, ...HARD.flatL)), fw = r3(U(rng, ...HARD.flatW)), fseed = r2(U(rng, 0, 50));
  const R = rampFrame(ramp), run = L * Math.cos(theta * RAD);
  const mid = [R.P0[0] - R.dh[0] * run / 2, R.P0[2] - R.dh[2] * run / 2];
  const bookHalf = Math.max(...books.map((b) => b.l)) / 2;
  let flat = null, bestK = Infinity;
  for (let c = 0; c < HARD.layouts; c++) {
    const relYaw = rng.raw() < 0.5 ? U(rng, -19.5, 19.5) : 90 + U(rng, -19.5, 19.5);
    const cand = { x: 0, z: 0, yaw: r2(((beta + relYaw) % 360 + 360) % 360), L: fl, W: fw, wood: 1 - wood, seed: fseed };
    const a = (cand.yaw - beta - 90) * RAD, halfC = Math.abs(Math.cos(a)) * fl / 2 + Math.abs(Math.sin(a)) * fw / 2;
    const side = rng.sign(), along = U(rng, -0.3, 0.35);
    const off = side * (Math.max(W / 2, along > run / 2 - 0.2 ? bookHalf : W / 2) + U(rng, ...HARD.gap) + halfC);
    cand.x = r3(mid[0] + R.c[0] * off - R.dh[0] * along); cand.z = r3(mid[1] + R.c[2] * off - R.dh[2] * along);
    const rdc = { ramp, flat: cand, objs: [] };
    if (!layoutOK(rdc)) continue;
    const { k, cam } = layoutSpread(rdc, el);
    if (k >= bestK || !planksApart(rdc, cam, 10)) continue;
    bestK = k; flat = cand;
  }
  if (!flat) return null;
  const TL = tableRects({ ramp, flat, objs: [] }), Dest = 1.8 * bestK;
  const eyeEst = [(TL.ramp.cx + TL.flat.cx) / 2, 0.06 + Dest * Math.sin(el * RAD), (TL.ramp.cy + TL.flat.cy) / 2 + Dest * Math.cos(el * RAD)];
  const camEst = cameraFor({ cam: { el, fov: HARD.fov, dist: Dest, target: [(TL.ramp.cx + TL.flat.cx) / 2, 0.06, (TL.ramp.cy + TL.flat.cy) / 2] } }, SCENE.w, SCENE.h);
  const Pr = rampFrame(ramp), Pf = flatFrame(flat);
  const hullOf = (o) => {
    const P = o.pl === 'R' ? Pr : Pf, hgt = objHeight(o), pts = [];
    for (const [cs, ct] of corners(objRect(o))) for (const h of [0, hgt]) { const q = camEst.project(onPlank(P, cs, ct, h)); pts.push([q[0], q[1]]); }
    return convexHull(pts);
  };
  const hulls = new Map(), paths = new Map();
  const pathOf = (o) => {
    const d = rollDir(o), lim = [];
    if (d[0] < -1e-9) lim.push(o.s / -d[0]);
    if (d[1] > 1e-9) lim.push((ramp.W / 2 - o.t) / d[1]);
    if (d[1] < -1e-9) lim.push((o.t + ramp.W / 2) / -d[1]);
    const D = Math.min(...lim), hgt = objHeight(o), pts = [];
    for (const [cs, ct] of corners(objRect(o))) for (const lam of [0, D]) for (const h of [0, hgt]) { const q = camEst.project(onPlank(Pr, cs + d[0] * lam, ct + d[1] * lam, h)); pts.push([q[0], q[1]]); }
    return convexHull(pts);
  };
  const centroid = (h) => [h.reduce((a, p) => a + p[0], 0) / h.length, h.reduce((a, p) => a + p[1], 0) / h.length];
  const inPath = (path, h, c) => inHull(path, c[0], c[1]) || h.filter((p) => inHull(path, p[0], p[1])).length * 2 >= h.length;
  const sz = sampleSizes(rng);
  const fam = rng.shuffle([0, 1, 2, 3]);
  const sty = { ball: fam[0], can: fam[1], cart: fam[2], box: rng.int(0, 3), wheel: rng.int(0, 3) };
  const pm = () => rng.pick([0, 180]), pp = () => rng.pick([90, -90]);
  const vN = [0, -Math.sin(el * RAD), -Math.cos(el * RAD)];
  const clearOfSight = (o) => {
    const f = objFrame(o.pl === 'R' ? rampFrame(ramp) : flatFrame(flat), o).f;
    return Math.acos(Math.min(1, Math.abs(f[0] * vN[0] + f[1] * vN[1] + f[2] * vN[2]))) / RAD >= HARD.canGamma + 2;
  };
  const lyingCan = (pl, draw) => { let o = null; for (let t = 0; t < 12; t++) { o = mk('can', 'lie', pl, sz, sty, draw(), 0); if (clearOfSight(o)) break; } return o; };
  const objs = [];
  objs.push(mk('cart', '', 'R', sz, sty, pm() + U(rng, -14.5, 14.5), 0));
  objs.push(mk('cart', '', 'R', sz, sty, pp() + U(rng, -2.9, 2.9), 0));
  objs.push(lyingCan('R', () => pp() + U(rng, -14.5, 14.5)));
  objs.push(lyingCan('R', () => pm() + U(rng, -1.4, 1.4)));
  if (comp.wheelStands) objs.push(mk('wheel', 'stand', 'R', sz, sty, pm() + U(rng, -14.5, 14.5), U(rng, 0, 360)));
  else objs.push(mk('wheel', 'lie', 'R', sz, sty, U(rng, 0, 360), U(rng, 0, 360)));
  for (const ex of comp.extras) {
    if (ex === 'ball') objs.push(mk('ball', '', 'R', sz, sty, 0, U(rng, 0, 360)));
    else if (ex === 'box') objs.push(mk('box', '', 'R', sz, sty, U(rng, 0, 360), 0));
    else if (ex === 'can') objs.push(mk('can', 'stand', 'R', sz, sty, U(rng, 0, 360), 0));
    else if (ex === 'canAcross') objs.push(lyingCan('R', () => pp() + U(rng, -14.5, 14.5)));
    else if (ex === 'canAlong') objs.push(lyingCan('R', () => pm() + U(rng, -1.4, 1.4)));
    else if (ex === 'wheelStand') objs.push(mk('wheel', 'stand', 'R', sz, sty, pm() + U(rng, -14.5, 14.5), U(rng, 0, 360)));
    else if (ex === 'wheelLie') objs.push(mk('wheel', 'lie', 'R', sz, sty, U(rng, 0, 360), U(rng, 0, 360)));
  }
  objs.push(mk('ball', '', 'F', sz, sty, 0, U(rng, 0, 360)));
  for (const [kk, p] of comp.flat) objs.push(kk === 'can' && p === 'lie' ? lyingCan('F', () => U(rng, 0, 360)) : mk(kk, p, 'F', sz, sty, U(rng, 0, 360), U(rng, 0, 360)));
  const order = objs.map((_, i) => i).sort((a, b) => (objs[b].k === 'cart') - (objs[a].k === 'cart') || a - b);
  const placeAll = () => {
    const placed = [];
    for (const i of order) {
      const o = objs[i], P = o.pl === 'R' ? ramp : flat;
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        o.t = r3(U(rng, -P.W / 2 + 0.03, P.W / 2 - 0.03));
        let sLo = 0.03, sHi = P.L - 0.03;
        if (o.pl === 'R') {
          o.s = 0;
          const me = extents(o), rollsO = roleOf(o).rolls;
          for (const j of placed) {
            const q = objs[j];
            if (q.pl !== 'R') continue;
            const e = extents(q);
            if (me.t1 + HARD.lane <= e.t0 || e.t1 + HARD.lane <= me.t0) continue;
            const rollsQ = roleOf(q).rolls;
            if (rollsO && !rollsQ) sHi = Math.min(sHi, e.s0 - HARD.lane - me.s1);
            if (rollsQ && !rollsO) sLo = Math.max(sLo, e.s1 + HARD.lane - me.s0);
          }
          if (i in upper && placed.includes(i - 1)) { if (upper[i]) sLo = Math.max(sLo, objs[i - 1].s + 0.02); else sHi = Math.min(sHi, objs[i - 1].s - 0.02); }
          if ((i + 1) in upper && placed.includes(i + 1)) { if (upper[i + 1]) sHi = Math.min(sHi, objs[i + 1].s - 0.02); else sLo = Math.max(sLo, objs[i + 1].s + 0.02); }
          if (sLo > sHi) continue;
        }
        o.s = r3(U(rng, sLo, sHi));
        if (i in upper && placed.includes(i - 1) && (upper[i] ? o.s < objs[i - 1].s + 0.02 : o.s > objs[i - 1].s - 0.02)) continue;
        if ((i + 1) in upper && placed.includes(i + 1) && (upper[i + 1] ? objs[i + 1].s < o.s + 0.02 : objs[i + 1].s > o.s - 0.02)) continue;
        const R0 = objRect(o);
        if (!insidePlank(R0, P.L, P.W, HARD.edge)) continue;
        if (o.k === 'can' && o.p === 'lie' && canGamma({ ramp, flat }, o, { eye: eyeEst }) < HARD.canGamma + 3) continue;
        let bad = false;
        for (const j of placed) {
          const q = objs[j];
          if (q.pl !== o.pl) continue;
          if (rectsClose(R0, objRect(q), HARD.sep)) { bad = true; break; }
          if (o.pl === 'R') {
            if (roleOf(q).rolls && !roleOf(o).rolls && rectsClose(corridor(q), R0, HARD.lane)) { bad = true; break; }
            if (roleOf(o).rolls && !roleOf(q).rolls && rectsClose(corridor(o), objRect(q), HARD.lane)) { bad = true; break; }
          }
        }
        if (!bad) {
          const hq = hullOf(o), pq = o.pl === 'R' && roleOf(o).rolls ? pathOf(o) : null, cq = centroid(hq);
          for (const j of placed) {
            if (!hullsApart(hq, hulls.get(j), 1)) { bad = true; break; }
            if (paths.has(j) && !pq && inPath(paths.get(j), hq, cq)) { bad = true; break; }
            if (pq && !paths.has(j) && inPath(pq, hulls.get(j), centroid(hulls.get(j)))) { bad = true; break; }
          }
          if (!bad) { hulls.set(i, hq); if (pq) paths.set(i, pq); ok = true; }
        }
      }
      if (!ok) return false;
      placed.push(i);
    }
    return true;
  };
  let placedOK = false;
  for (let tries = 0; tries < HARD.placeTries && !placedOK; tries++) placedOK = placeAll();
  if (!placedOK) return null;
  const perm = rng.shuffle(objs.map((_, i) => i));
  const rd = {
    cam: { el, fov: HARD.fov, dist: 1.8, target: [0, 0.06, 0] },
    light: { az: r2(180 + rng.sign() * U(rng, 22, 55)), el: r2(U(rng, 52, 62)) },
    ramp, flat, objs: perm.map((i) => objs[i]), answer: [],
  };
  rd.answer = answerOf(rd);
  if (!compositionOK(rd) || !placementOK(rd)) return null;
  const T = tableRects(rd);
  rd.cam.target = [r3((T.ramp.cx + T.flat.cx) / 2), 0.06, r3((T.ramp.cy + T.flat.cy) / 2)];
  if (!frameCamera(rd, SCENE.w, SCENE.h, HARD.pad + 1)) return null;
  rd.cam.target = [r3(rd.cam.target[0]), 0.06, r3(rd.cam.target[2])];
  const camO = cameraFor(rd, SCENE.w, SCENE.h);
  for (const o of rd.objs) if (o.k === 'can' && o.p === 'lie' && canGamma(rd, o, camO) < HARD.canGamma) return null;
  const k2 = rd.answer.length;
  for (const S of rampOrderSets(rd, k2)) if (sameSet(S, rd.answer)) return null;
  if (!quickSeparation(rd)) return null;
  const res = checkRound(rd);
  if (!res) return null;
  rd.objs.forEach((o, i) => { o.pt = res.pts[i]; });
  return { rd, res };
}
const RAMP_EXTRAS = [['wheelStand', 0.3], ['wheelLie', 0.3], ['ball', 0.14], ['box', 0.13], ['can', 0.13]];
const ROLLS_X = new Set(['canAcross', 'wheelStand', 'ball']);
const FLAT_TRAP = true;
function drawComposition(rng) {
  for (;;) {
    const wheelStands = rng.raw() < 0.5, nx = 1, extras = [];
    while (extras.length < nx) {
      let u = rng.raw() * RAMP_EXTRAS.reduce((a, e) => a + e[1], 0), ex = RAMP_EXTRAS[RAMP_EXTRAS.length - 1][0];
      for (const [k, w] of RAMP_EXTRAS) { u -= w; if (u <= 0) { ex = k; break; } }
      const kindOf = (e) => (e.startsWith('canA') ? 'lyingCan' : e.startsWith('wheel') ? 'wheel' : 'other');
      if (extras.some((e) => kindOf(e) === kindOf(ex))) continue;
      extras.push(ex);
    }
    const rollers = 2 + (wheelStands ? 1 : 0) + extras.filter((e) => ROLLS_X.has(e)).length;
    if (rollers < HARD.ansMin) continue;
    const k = 2;
    const flat = rng.shuffle([['box', ''], ['can', 'stand'], ['can', 'lie'], ['wheel', 'stand'], ['wheel', 'lie'], ['cart', '']]).slice(0, k);
    if (FLAT_TRAP && !flat.some(([kk, p]) => (kk === 'can' && p === 'lie') || kk === 'cart')) continue;
    return { wheelStands, extras, flat };
  }
}
function makeRound(rng, band, upper) {
  const comp = drawComposition(rng);
  const pats = [[false, false], [false, true], [true, true], [true, false]];
  let p0 = pats.findIndex((q) => q[0] === upper[1] && q[1] === upper[3]);
  for (let k = 0; k < 4; k++) {
    const pq = pats[(p0 + k) % 4], up = { 1: pq[0], 3: pq[1] };
    for (let a = 0; a < 2500; a++) {
      const r = tryRound(rng, band, up, comp);
      if (r) return r;
    }
  }
  throw new Error(`slope_roll_tap: sampler exhausted (${band} ${JSON.stringify(comp)})`);
}

export function contractProblems(m) {
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['header'];
  if (m.rounds !== undefined) return ['rounds'];
  const { task, board, ...rd0 } = m;
  const rd = JSON.parse(JSON.stringify(rd0));
  for (const o of rd.objs || []) delete o.pt;
  const q = checkRound(rd);
  if (!q) return ['scene'];
  const errs = [];
  rd0.objs.forEach((o, i) => { if (!Array.isArray(o.pt) || o.pt[0] !== q.pts[i][0] || o.pt[1] !== q.pts[i][1]) errs.push(`pt${i}`); });
  if (errs.length) return errs;
  return sceneProblems(q);
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

export function semanticKey(m) {
  const band = inR(angDiff(m.ramp.beta, 180), HARD.bandS) ? 'S' : 'F';
  const tag = (o) => `${o.k}${o.p ? ':' + o.p : ''}:${rollClass(o, o.pl === 'R').cls}`;
  const ramp = m.objs.filter((o) => o.pl === 'R').sort((a, b) => a.s - b.s).map(tag).join(',');
  const flat = m.objs.filter((o) => o.pl === 'F').map(tag).sort().join(',');
  return `${band}|b${Math.round((((m.ramp.beta % 360) + 360) % 360) / 15)}|R[${ramp}]|F[${flat}]`;
}

function pickNear(rd, x, y) {
  const sc = sceneFor(rd, SCENE.w, SCENE.h), n = rd.objs.length;
  const id0 = pickObj(sc.ix, x, y);
  if (id0 >= 0 && id0 < n) return id0;
  for (let r = 2.5; r <= HARD.tapTol; r += 2.25) {
    const votes = new Map(), nn = Math.max(8, Math.round(r * 2));
    for (let k = 0; k < nn; k++) {
      const a = (k / nn) * Math.PI * 2, id = pickObj(sc.ix, x + r * Math.cos(a), y + r * Math.sin(a));
      if (id >= 0 && id < n) votes.set(id, (votes.get(id) || 0) + 1);
    }
    if (votes.size) {
      let best = -1, bv = -1;
      for (const [id, v] of votes) if (v > bv || (v === bv && id < best)) { best = id; bv = v; }
      return best;
    }
  }
  return -1;
}
const PROMPT = 'Tap everything that will roll away on its own';

export default {
  meta: {
    name: NAME, family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'click', x: `0..${SCENE.w} board px`, y: `0..${SCENE.h} board px`, note: 'tap a toy to select it; tap again to unselect' },
    ],
    promptHuman: PROMPT,
  },

  generate(rng) {
    const band = rng.pick(['F', 'S']), upper = { 1: rng.raw() < 0.5, 3: rng.raw() < 0.5 };
    for (let t = 0; t < 60; t++) {
      const r = makeRound(rng, band, upper);
      if (!sceneProblems(r.res).length) return { task: NAME, board: { ...BOARD }, ...r.rd };
    }
    throw new Error('slope_roll_tap: scene sampler exhausted');
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    if (a.y > SCENE.h) return { ok: false, reason: 'outside' };
    const id = pickNear(m, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-toy' };
    const sel = s.sel, k = sel.indexOf(id);
    if (k >= 0) sel.splice(k, 1); else sel.push(id);
    sel.sort((x, y) => x - y);
    return { ok: true, on: k < 0 };
  },

  verify(s, m) {
    const got = new Set(s.sel), ans = new Set(m.answer);
    const tp = [...got].filter((i) => ans.has(i)).length, want = ans.size, fp = got.size - tp;
    const success = tp === want && got.size === want;
    return { success, partial: want ? Math.max(0, (tp - fp) / want) : 0, error: success ? 0 : 1, detail: { hit: tp, falsePositives: fp, want } };
  },

  oracle(m) {
    return m.answer.map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] }));
  },

  randomPolicy(m, rnd) {
    const ids = m.objs.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const k = HARD.ansMin + Math.floor(rnd() * (HARD.ansMax - HARD.ansMin + 1));
    return ids.slice(0, k).map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] }));
  },

  async mount(env) {
    env.assets.srt = { key: '', img: null, canvas: null, rings: new Map() };
    if (env.style) env.assets.srtLook = await buildSlopeLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, PROMPT);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.srt || (env.assets.srt = { rings: new Map() });
    const rd = m, q = Math.min(2, contextScale(g));
    const look = env.style ? env.assets.srtLook : null;
    const key = look ? `${q}|${env.style.key}` : `${q}`;
    if (A.key !== key || A.m !== m) {
      const { sc, scene } = look ? renderSceneStyled(viewRound(rd), SCENE.w, SCENE.h, look) : renderScene(viewRound(rd), SCENE.w, SCENE.h);
      A.img = render(scene, sc.ix, q);
      A.canvas = toCanvas(A.img); A.key = key; A.m = m; A.rings = new Map();
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef1f4'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.drawImage(A.canvas, 0, 0, SCENE.w, SCENE.h);
    for (const id of s.sel) {
      if (!A.rings.has(id)) A.rings.set(id, objectRing(A.img, id, [25, 145, 250, 255], 2.5));
      g.drawImage(A.rings.get(id), 0, 0, SCENE.w, SCENE.h);
    }
    for (const id of s.sel) {
      const [px, py] = toView(rd.objs[id].pt[0], rd.objs[id].pt[1]), bx = Math.min(SCENE.w - 10, px + 14), by = Math.max(10, py - 18);
      g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx - 3, by); g.lineTo(bx - 0.8, by + 2.4); g.lineTo(bx + 3.4, by - 2.8); g.stroke();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (e.y > SCENE.h) return [];
    const [x, y] = fromView(e.x, e.y);
    return [{ op: 'click', x: +x.toFixed(2), y: +y.toFixed(2) }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} tapped`;
  },
};
