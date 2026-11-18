import { drawPromptText } from '../core/panel.js';
import { makeCam, makeScene, render, shape, lin, fbm, hash2, lineMask, pickNear, pickId, objectStats, toCanvas, contextScale, silhouetteRing } from '../common/_largest_cube_color_rt.js';

const NAME = 'slide_then_hidden';
const PANEL_W = 480;
const BOARD = { w: 460, h: 380 };
const SQ = 0.8;
const I0 = -3, I1 = 2, J0 = -6, J1 = 1;
const BX0 = I0 * SQ, BX1 = (I1 + 1) * SQ, BZ0 = J0 * SQ, BZ1 = (J1 + 1) * SQ, RIM = 0.12;
const WALL_Z = -6.6;
const HARD = Object.freeze({
  ansMin: 0.30,
  shrink: 0.10,
  grow: 0.20,
  frontOverlap: 0.40,
  overlapH: 0.10,
  nearMargin: 1.15,
  visMin: 0.70,
  boxVisMin: 0.80,
  edge: 6,
  nToys: [6, 8],
  overK: 0.8,
  camD: [7.6, 10.0],
  camH: [0.7, 0.8],
  boxHW: [0.33, 0.37],
  az: 20,
  drift: 0.18,
  aimU: [0.12, 0.88], aimV: [0.24, 0.66], aimBins: [5, 3],
  tx: 3.0, tz: [-2.6, 2.6],
  gapNew: 30, gapOld: 24,
});
const COLORS = [['red', '#d23a2f'], ['blue', '#2d63d6'], ['green', '#2f9a47'], ['yellow', '#f2bf22'],
  ['orange', '#ef7d22'], ['purple', '#8d4bc9'], ['white', '#ece7dc'], ['cyan', '#22b3c4'], ['pink', '#ea76ad']];
const BOX_MAT = COLORS.length;
const r3 = (v) => Math.round(v * 1000) / 1000;
const D2R = Math.PI / 180;
const cellC = (i) => (i + 0.5) * SQ;
const cellOf = (v) => Math.floor(v / SQ);

const CAM_D = 7.0, TARGET_Z = -1.4;
function cameraFor(rd) {
  const a = rd.cam.az * D2R, tx = rd.cam.tx || 0, tz = TARGET_Z + (rd.cam.tz || 0);
  const d = rd.cam.d || CAM_D;
  return makeCam({ eye: [tx + Math.sin(a) * d, rd.cam.h, tz + Math.cos(a) * d], target: [tx, -0.3, tz], fovY: 40, W: BOARD.w, H: BOARD.h });
}
const KRAFT = lin('#b4844f'), TAPE = lin('#d8c49a');
function cartonTex(x, y, z, nx, ny, nz, s, out, fp) {
  const top = s.cy + s.hy;
  const fib = fbm(x * 9 + z * 7 + 3.1, y * 9 - z * 2, 3, fp * 9);
  const tape = Math.abs(x - s.cx) < 0.075 && (ny > 0.5 || (Math.abs(nz) > 0.5 && y > top - 0.26));
  if (tape) { const t = 0.96 + 0.06 * fib; out[0] = TAPE[0] * t; out[1] = TAPE[1] * t; out[2] = TAPE[2] * t; return; }
  let t = 0.9 + 0.18 * fib;
  if (Math.abs(nx) > 0.5 || Math.abs(nz) > 0.5) {
    if (Math.abs(y - (top - 0.26)) < 0.008) t *= 0.72;
  }
  out[0] = KRAFT[0] * t; out[1] = KRAFT[1] * t; out[2] = KRAFT[2] * t;
}
const MATS = [...COLORS.map(([, hex]) => ({ c: lin(hex), ks: 0.45, sh: 45, env: 0.16 })),
  { c: KRAFT, ks: 0.06, sh: 10, env: 0.02, tex: cartonTex }];
const topOf = (o) => (o.kind === 'ball' || o.kind === 'block' ? 2 * o.s : o.h);
function toyShape(o, id) {
  if (o.kind === 'block') return shape.box(id, o.col, o.x, o.s, o.z, o.s, o.s, o.s, o.yaw, o.s * 0.16);
  if (o.kind === 'ball') return shape.sphere(id, o.col, o.x, o.s, o.z, o.s);
  if (o.kind === 'cyl') return shape.cyl(id, o.col, o.x, o.z, 0, o.h, o.s, o.s * 0.12);
  return shape.frustum(id, o.col, o.x, o.z, 0, o.h, o.s, 0);
}
const cartonShape = (id, B, grow = 0) => shape.box(id, BOX_MAT, B.x, (B.h + grow) / 2, B.z - grow / 2, B.hw + grow, (B.h + grow) / 2, B.hw + grow / 2, 0, 0.015);
const boxAt = (rd, col) => ({ x: cellC(col), z: cellC(rd.box.j), hw: rd.box.hw, h: rd.box.h });
const newCol = (rd) => rd.box.i + rd.slide.dir * rd.slide.n;

const ENV = {
  floorY: 0, wallZ: WALL_Z,
  floor(x, z, fp, out) {
    if (x >= BX0 && x <= BX1 && z >= BZ0 && z <= BZ1) {
      const i = Math.floor(x / SQ), j = Math.floor(z / SQ), dark = (i + j) & 1;
      const n = fbm(x * 3.1 + i * 5.3, z * 3.1 + j * 2.9, 3, fp * 3.1);
      const tint = 0.95 + 0.07 * hash2(i + 11, j - 7);
      const seam = Math.max(lineMask(x, SQ, 0.01, fp), lineMask(z, SQ, 0.01, fp));
      const t = tint * (0.93 + 0.12 * n) * (1 - 0.35 * seam);
      if (dark) { out[0] = 0.115 * t; out[1] = 0.13 * t; out[2] = 0.14 * t; }
      else { out[0] = 0.43 * t; out[1] = 0.43 * t; out[2] = 0.4 * t; }
      return;
    }
    if (x >= BX0 - RIM && x <= BX1 + RIM && z >= BZ0 - RIM && z <= BZ1 + RIM) {
      const g = fbm(x * 30, z * 30, 3, fp * 30);
      const t = 0.85 + 0.25 * g;
      out[0] = 0.16 * t; out[1] = 0.075 * t; out[2] = 0.03 * t;
      return;
    }
    const plank = Math.floor(z / 0.55), off = hash2(plank, 3) * 4;
    const grain = fbm((x + off) * 0.8, z * 12 + plank * 3.7, 4, fp * 12);
    const seam = lineMask(z, 0.55, 0.008, fp);
    const t = (0.88 + 0.08 * hash2(plank, 9)) * (0.82 + 0.26 * grain) * (1 - 0.45 * seam);
    out[0] = 0.5 * t; out[1] = 0.31 * t; out[2] = 0.15 * t;
  },
  wall(x, y, fp, out) {
    const n = fbm(x * 2.1, y * 2.1, 3, fp * 2.1);
    const base = y < 0.32 ? 0.6 : 1;
    const v = (0.6 + 0.05 * n) * base;
    out[0] = v * 0.93; out[1] = v * 0.92; out[2] = v * 0.88;
  },
  sky(dx, dy, dz, out) { out[0] = 0.52; out[1] = 0.5; out[2] = 0.47; },
};
const LIGHT = {
  dir: [-0.5, 1, 0.55], col: [1.3, 1.18, 1.02], soft: 0.08,
  sky: [0.42, 0.4, 0.37], ground: [0.18, 0.15, 0.11],
  fill: { dir: [0.7, 0.5, 0.6], col: [0.14, 0.13, 0.14] }, aoK: 1, contact: 0.32, contactH: 0.12,
};
const mk = (cam, shapes) => makeScene({ cam, shapes, mats: MATS, env: ENV, light: LIGHT });
const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) {
    const toys = rd.toys.map((o, id) => toyShape(o, id));
    sc = mk(cameraFor(rd), [...toys, cartonShape(rd.toys.length, boxAt(rd, rd.box.i))]);
    sceneCache.set(rd, sc);
  }
  return sc;
}

function projBB(cam, bb) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    const p = cam.project(c & 1 ? bb[3] : bb[0], c & 2 ? bb[4] : bb[1], c & 4 ? bb[5] : bb[2]);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}
function analyze(rd) {
  const cam = cameraFor(rd);
  const tShapes = rd.toys.map((o, id) => toyShape(o, id));
  const scToys = mk(cam, tShapes);
  const per = tShapes.map((s, i) => {
    const one = mk(cam, [s]), bb = projBB(cam, s.bb);
    const alone = [], vis = [];
    let sx = 0, sy = 0, ax0 = Infinity, ax1 = -Infinity;
    for (let y = Math.floor(bb.y0); y <= Math.ceil(bb.y1); y++) for (let x = Math.floor(bb.x0); x <= Math.ceil(bb.x1); x++) {
      const px = x + 0.5, py = y + 0.5;
      if (pickId(one, px, py) !== i) continue;
      alone.push(px, py); sx += px; sy += py; ax0 = Math.min(ax0, px); ax1 = Math.max(ax1, px);
      if (pickId(scToys, px, py) === i) vis.push(px, py);
    }
    const na = alone.length / 2;
    return { alone, vis, cx: sx / Math.max(1, na), cy: sy / Math.max(1, na), x0: ax0, x1: ax1, area: na, frac: na ? vis.length / alone.length : 0 };
  });
  return { cam, tShapes, per };
}
function coverage(A, B, g = 0) {
  const n = A.tShapes.length, sc = mk(A.cam, [...A.tShapes, cartonShape(n, B, g)]);
  return A.per.map((p) => {
    const v = p.vis, nv = v.length / 2;
    if (!nv) return 0;
    let c = 0;
    for (let k = 0; k < v.length; k += 2) if (pickId(sc, v[k], v[k + 1]) === n) c++;
    return c / nv;
  });
}
function overlapFrac(A, B) {
  const sc = mk(A.cam, [cartonShape(0, B)]);
  return A.per.map((p) => {
    const a = p.alone, na = a.length / 2;
    let c = 0;
    for (let k = 0; k < a.length; k += 2) if (pickId(sc, a[k], a[k + 1]) === 0) c++;
    return na ? c / na : 0;
  });
}
function centreIn(A, B) {
  const sc = mk(A.cam, [cartonShape(0, B)]);
  return A.per.map((p) => pickId(sc, p.cx, p.cy) === 0);
}
const camDepth = (cam, x, y, z) => (x - cam.eye[0]) * cam.F[0] + (y - cam.eye[1]) * cam.F[1] + (z - cam.eye[2]) * cam.F[2];
function cartonPicture(cam, B) {
  const bb = [B.x - B.hw, 0, B.z - B.hw, B.x + B.hw, B.h, B.z + B.hw];
  const r = projBB(cam, bb), c = cam.project(B.x, B.h / 2, B.z);
  return { ...r, cx: c.x, cy: c.y };
}
const onBoardCol = (i) => i >= I0 && i <= I1;
function classify(rd, A, col) {
  const B = boxAt(rd, col);
  const lo = coverage(A, { ...B, hw: B.hw - HARD.shrink, h: B.h - HARD.shrink }), hi = coverage(A, B, HARD.grow), nom = coverage(A, B);
  return { cls: lo.map((v, i) => (v >= HARD.ansMin ? 1 : hi[i] <= 0 ? 0 : -1)), nom, lo, hi };
}
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

export function heuristics(rd, A = analyze(rd), cache = {}) {
  const cam = A.cam, ans = rd.answer, n = rd.toys.length, k = ans.length;
  const nc = newCol(rd), Bn = boxAt(rd, nc), Bo = boxAt(rd, rd.box.i), pic = cartonPicture(cam, Bn);
  const ids = rd.toys.map((_, i) => i), non = ids.filter((i) => !ans.includes(i));
  const out = {};
  const ov = cache.ov || overlapFrac(A, Bn), cin = cache.cin || centreIn(A, Bn);
  out.H_overlap = { set: ids.filter((i) => ov[i] >= HARD.overlapH) };
  out.H_overlap50 = { set: ids.filter((i) => ov[i] >= 0.5) };
  out.H_overlap90 = { set: ids.filter((i) => ov[i] >= 0.9) };
  out.H_centreIn = { set: ids.filter((i) => cin[i]) };
  out.H_xrange = { set: ids.filter((i) => A.per[i].cx >= pic.x0 && A.per[i].cx <= pic.x1) };
  const sideOf = (o) => (o.x - Bo.x) * rd.slide.dir;
  out.H_dir = { set: ids.filter((i) => sideOf(rd.toys[i]) > SQ / 2) };
  const td = ids.map((i) => Math.hypot(rd.toys[i].x - Bn.x, rd.toys[i].z - Bn.z));
  out.H_nearest = { set: ids.slice().sort((a, b) => td[a] - td[b]).slice(0, k) };
  const maxA = Math.max(...ans.map((i) => td[i]));
  out.H_nearest.margin = non.some((i) => td[i] * HARD.nearMargin < maxA);
  const pd = ids.map((i) => Math.hypot(A.per[i].cx - pic.cx, A.per[i].cy - pic.cy));
  out.H_pixNear = { set: ids.slice().sort((a, b) => pd[a] - pd[b]).slice(0, k) };
  const maxP = Math.max(...ans.map((i) => pd[i]));
  out.H_pixNear.margin = non.some((i) => pd[i] * HARD.nearMargin < maxP);
  const dB = camDepth(cam, Bn.x, 0, Bn.z);
  out.H_behind = { set: ids.filter((i) => camDepth(cam, rd.toys[i].x, 0, rd.toys[i].z) > dB) };
  out.H_dirBehind = { set: ids.filter((i) => sideOf(rd.toys[i]) > SQ / 2 && camDepth(cam, rd.toys[i].x, 0, rd.toys[i].z) > dB) };
  out.H_dirBehind.margin = non.some((i) => sideOf(rd.toys[i]) > 0.6 && camDepth(cam, rd.toys[i].x, 0, rd.toys[i].z) > dB + 0.4);
  const alt = (col) => (onBoardCol(col) ? coverage(A, boxAt(rd, col)).map((v, i) => (v >= 0.15 ? i : -1)).filter((i) => i >= 0) : null);
  out.H_wrongDir = { set: alt(rd.box.i - rd.slide.dir * rd.slide.n) };
  const m1 = rd.slide.n - 1, p1 = rd.slide.n + 1;
  out.H_offByOne = { set: alt(rd.box.i + rd.slide.dir * m1), set2: alt(rd.box.i + rd.slide.dir * p1) };
  const Sn = sightFrame(cam, Bn);
  out.H_lineBehind = { set: ids.filter((i) => { const q = Sn.of(rd.toys[i].x, rd.toys[i].z); return q.along > 0 && q.k <= 1; }) };
  const rank = (f) => ids.slice().sort((p, q) => f(q) - f(p)).slice(0, k);
  out.H_slideMost = { set: rank((i) => rd.toys[i].x * rd.slide.dir) };
  out.H_slideMostPic = { set: rank((i) => A.per[i].cx * rd.slide.dir) };
  out.H_slideUp = { set: rank((i) => A.per[i].cx * rd.slide.dir - A.per[i].cy) };
  out.H_gridColumn = { set: ids.filter((i) => cellOf(rd.toys[i].x) === nc && cellOf(rd.toys[i].z) < rd.box.j && cellOf(rd.toys[i].z) >= rd.box.j - 2) };
  const rowsBehind = rd.toys.map((o) => (cellOf(o.x) === nc ? rd.box.j - cellOf(o.z) : -1));
  out.H_colAny = { set: ids.filter((i) => rowsBehind[i] >= 1) };
  out.H_colN = { sets: Array.from({ length: J1 - J0 }, (_, N) => ids.filter((i) => rowsBehind[i] >= 1 && rowsBehind[i] <= N + 1)) };
  for (const [key, h] of Object.entries(out)) {
    let hit = h.set ? sameSet(h.set, ans) : false;
    if (h.sets) hit = h.sets.some((s) => sameSet(s, ans));
    if (key === 'H_offByOne' && h.set2) hit = hit || sameSet(h.set2, ans);
    if ((key === 'H_nearest' || key === 'H_pixNear' || key === 'H_dirBehind') && !h.margin) hit = true;
    h.pass = hit;
  }
  return out;
}
const GATED = ['H_overlap', 'H_overlap50', 'H_overlap90', 'H_centreIn', 'H_xrange', 'H_dir', 'H_nearest', 'H_behind', 'H_dirBehind', 'H_slideMost', 'H_slideMostPic', 'H_wrongDir', 'H_offByOne',
  'H_lineBehind', 'H_gridColumn', 'H_colAny', 'H_colN'];

const footR = (o) => (o.kind === 'block' ? o.s * Math.SQRT2 : o.s);
function pathRect(rd) {
  const xo = cellC(rd.box.i), xn = cellC(newCol(rd)), z = cellC(rd.box.j), hw = rd.box.hw;
  return { x0: Math.min(xo, xn) - hw, x1: Math.max(xo, xn) + hw, z0: z - hw, z1: z + hw };
}
function placeOk(o, others, P) {
  const r = footR(o);
  if (o.x - r < BX0 + 0.04 || o.x + r > BX1 - 0.04 || o.z - r < BZ0 + 0.04 || o.z + r > BZ1 - 0.04) return false;
  for (const p of others) if (p !== o && Math.hypot(p.x - o.x, p.z - o.z) < footR(p) + r + 0.12) return false;
  const dx = Math.max(P.x0 - o.x, 0, o.x - P.x1), dz = Math.max(P.z0 - o.z, 0, o.z - P.z1);
  return Math.hypot(dx, dz) >= r + 0.08;
}
function structOk(rd) {
  const n = rd.toys.length, nc = newCol(rd);
  if (n < HARD.nToys[0] || n > HARD.nToys[1]) return 'count';
  const cm = rd.cam;
  if (!(Math.abs(cm.az) <= HARD.az && cm.d >= HARD.camD[0] && cm.d <= HARD.camD[1] && cm.h >= HARD.camH[0] * cm.d - 1e-3 && cm.h <= HARD.camH[1] * cm.d + 1e-3 && Math.abs(cm.tx) <= HARD.tx && cm.tz >= HARD.tz[0] && cm.tz <= HARD.tz[1])) return 'camera';
  if (!(rd.slide.n >= 1 && rd.slide.n <= 3 && Math.abs(rd.slide.dir) === 1)) return 'slide';
  if (!onBoardCol(rd.box.i) || !onBoardCol(nc) || rd.box.j < J0 || rd.box.j > J1) return 'off-board';
  if (!(rd.box.hw >= HARD.boxHW[0] && rd.box.hw <= HARD.boxHW[1] && rd.box.h >= 0.95 && rd.box.h <= 1.4)) return 'box-size';
  const P = pathRect(rd);
  for (const o of rd.toys) {
    if (!placeOk(o, rd.toys, P)) return 'collision';
    if (footR(o) > 0.29) return 'toy-big';
    if (topOf(o) * 1.3 > rd.box.h) return 'toy-tall';
  }
  const cam = cameraFor(rd);
  const inFrame = (bb) => { const r = projBB(cam, bb); return r.x0 > HARD.edge && r.x1 < BOARD.w - HARD.edge && r.y0 > HARD.edge && r.y1 < BOARD.h - HARD.edge; };
  for (let i = 0; i < n; i++) if (!inFrame(toyShape(rd.toys[i], i).bb)) return 'toy-frame';
  for (const col of [rd.box.i, nc]) { const B = boxAt(rd, col); if (!inFrame([B.x - B.hw, 0, B.z - B.hw, B.x + B.hw, B.h, B.z + B.hw])) return 'box-frame'; }
  return null;
}
function check(rd, A, C) {
  const why = structOk(rd);
  if (why) return why;
  A = A || analyze(rd);
  const cam = A.cam, n = rd.toys.length, nc = newCol(rd);
  for (const p of A.per) if (p.area < 150 || p.frac < HARD.visMin) return 'toy-vis';
  if (coverage(A, boxAt(rd, rd.box.i), HARD.grow).some((v) => v > 0)) return 'hides-now';
  C = C || classify(rd, A, nc);
  if (C.cls.some((c) => c < 0)) return 'ambiguous';
  const ans = C.cls.map((c, i) => (c === 1 ? i : -1)).filter((i) => i >= 0);
  if (ans.length < 1 || ans.length > 3) return 'answer-size';
  if (!sameSet(ans, rd.answer)) return 'answer-mismatch';
  const Bn = boxAt(rd, nc), pic = cartonPicture(cam, Bn), ov = overlapFrac(A, Bn), cin = centreIn(A, Bn), dB = camDepth(cam, Bn.x, 0, Bn.z);
  const non = rd.toys.map((_, i) => i).filter((i) => !ans.includes(i));
  const front = non.filter((i) => camDepth(cam, rd.toys[i].x, 0, rd.toys[i].z) < dB - 0.45 && ov[i] >= HARD.frontOverlap && cin[i]
    && A.per[i].cx > pic.x0 + 0.15 * (pic.x1 - pic.x0) && A.per[i].cx < pic.x1 - 0.15 * (pic.x1 - pic.x0));
  if (!front.length) return 'no-front';
  const aside = non.filter((i) => camDepth(cam, rd.toys[i].x, 0, rd.toys[i].z) > dB + 0.45 && Math.abs(rd.toys[i].x - Bn.x) >= 1.2);
  if (!aside.length) return 'no-aside';
  const Sn = sightFrame(cam, Bn);
  if (!non.some((i) => { const o = rd.toys[i], q = Sn.of(o.x, o.z); return q.along > Bn.hw && q.k <= HARD.overK; })) return 'no-over';
  const Bo = boxAt(rd, rd.box.i);
  for (const i of non) { const o = rd.toys[i], q = Sn.of(o.x, o.z); if (q.along > 0 && q.k <= 1.6) { const g = overGap(cam, o, Bn, Bo); if (Number.isFinite(g.gNew) && !gapOk(g)) return 'over-gap'; } }
  if (!ans.some((i) => C.nom[i] <= 0.85)) return 'no-partial';
  const H = heuristics(rd, A, { ov, cin });
  for (const k of GATED) if (H[k].pass) return `heur:${k}`;
  const st = objectStats(sceneFor(rd), n, 2);
  if (st.frac < HARD.boxVisMin || st.off > 0) return 'box-vis';
  return null;
}

const u = (rng, a, b) => rng.uniform(a, b);
function newToy(rng, kind, col) {
  const o = { kind, col, x: 0, z: 0, s: 0.2, h: 0, yaw: r3(u(rng, 0, 90)) };
  if (kind === 'block') o.s = u(rng, 0.16, 0.2);
  else if (kind === 'ball') o.s = u(rng, 0.19, 0.25);
  else if (kind === 'cyl') { o.s = u(rng, 0.17, 0.23); o.h = u(rng, 0.4, 0.68); }
  else { o.s = u(rng, 0.2, 0.26); o.h = u(rng, 0.45, 0.72); }
  return o;
}
const KINDS = ['block', 'ball', 'cyl', 'cone'];
const ROLE = new WeakMap();
function vFrac(cam, o, B, g) {
  const e = cam.eye, dx = o.x - e[0], dz = o.z - e[2], dl = Math.hypot(dx, dz), r = footR(o);
  const yTop = cam.project(B.x, B.h + g, B.z - B.hw - g).y;
  const yb = cam.project(o.x - dx / dl * r, 0, o.z - dz / dl * r).y, yt = cam.project(o.x + dx / dl * r * (o.kind === 'cone' ? 0 : 1), topOf(o), o.z + dz / dl * r * (o.kind === 'cone' ? 0 : 1)).y;
  return Math.max(0, Math.min(1, (yb - yTop) / Math.max(1e-6, yb - yt)));
}
function toyPicPts(cam, o) {
  const pts = [], N = 32;
  if (o.kind === 'block') {
    const c = Math.cos(o.yaw * D2R), sn = Math.sin(o.yaw * D2R);
    for (let q = 0; q < 8; q++) { const lx = q & 1 ? o.s : -o.s, lz = q & 2 ? o.s : -o.s; pts.push(cam.project(o.x + lx * c - lz * sn, q & 4 ? 2 * o.s : 0, o.z + lx * sn + lz * c)); }
  } else if (o.kind === 'ball') {
    for (let a = 0; a < N; a++) for (let b = 1; b < 12; b++) { const t = a / N * 2 * Math.PI, f = b / 12 * Math.PI; pts.push(cam.project(o.x + o.s * Math.sin(f) * Math.cos(t), o.s - o.s * Math.cos(f), o.z + o.s * Math.sin(f) * Math.sin(t))); }
  } else {
    for (let a = 0; a < N; a++) { const t = a / N * 2 * Math.PI; pts.push(cam.project(o.x + o.s * Math.cos(t), 0, o.z + o.s * Math.sin(t))); if (o.kind === 'cyl') pts.push(cam.project(o.x + o.s * Math.cos(t), o.h, o.z + o.s * Math.sin(t))); }
    if (o.kind === 'cone') pts.push(cam.project(o.x, o.h, o.z));
  }
  return pts;
}
function overGap(cam, o, B, Bo) {
  const pts = toyPicPts(cam, o);
  let x0 = Infinity, x1 = -Infinity, yb = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); yb = Math.max(yb, p.y); }
  const quad = (C) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => cam.project(C.x + sx * C.hw, C.h, C.z + sz * C.hw));
  const qn = quad(B), qo = quad(Bo);
  const upper = (X) => { let y = Infinity; for (let e = 0; e < 4; e++) { const p = qn[e], q = qn[(e + 1) & 3]; if ((X - p.x) * (X - q.x) <= 0 && p.x !== q.x) y = Math.min(y, p.y + (q.y - p.y) * (X - p.x) / (q.x - p.x)); } return y; };
  const qx0 = Math.min(...qn.map((p) => p.x)), qx1 = Math.max(...qn.map((p) => p.x));
  const a = Math.max(x0, qx0), b = Math.min(x1, qx1);
  let top = Infinity;
  if (a <= b) for (const X of [a, b, ...qn.map((p) => p.x).filter((X) => X > a && X < b)]) top = Math.min(top, upper(X));
  return { gNew: top - yb, gOld: Math.min(...qo.map((p) => p.y)) - yb };
}
const gapOk = (g, add = 0) => g.gNew >= HARD.gapNew + add && g.gOld >= HARD.gapOld + add;
function sightFrame(cam, B) {
  const e = cam.eye, ux0 = B.x - e[0], uz0 = B.z - e[2], dB = Math.hypot(ux0, uz0), ux = ux0 / dB, uz = uz0 / dB, unit = B.hw / dB;
  return {
    at(o, along, k) { const dP = dB + along, lat = k * unit * dP; o.x = B.x + ux * along - uz * lat; o.z = B.z + uz * along + ux * lat; },
    of(x, z) { const vx = x - e[0], vz = z - e[2], dP = vx * ux + vz * uz, lat = vz * ux - vx * uz; return { along: dP - dB, k: Math.abs(lat) / dP / unit }; },
    atX(o, along, x) { const lat = (x - B.x - ux * along) / -uz; o.x = x; o.z = B.z + uz * along + ux * lat; },
  };
}
function aimCamera(rd, P, tu, tv) {
  const c = rd.cam, at = () => cameraFor(rd).project(P[0], P[1], P[2]);
  for (let it = 0; it < 8; it++) {
    const p0 = at(), eu = tu - p0.x, ev = tv - p0.y;
    if (Math.abs(eu) < 0.2 && Math.abs(ev) < 0.2) break;
    const d = 0.02;
    c.tx += d; const px = at(); c.tx -= d;
    c.tz += d; const pz = at(); c.tz -= d;
    const a = (px.x - p0.x) / d, b = (pz.x - p0.x) / d, e = (px.y - p0.y) / d, f = (pz.y - p0.y) / d, det = a * f - b * e;
    if (!(Math.abs(det) > 1e-6)) return false;
    c.tx += (eu * f - b * ev) / det; c.tz += (a * ev - e * eu) / det;
    if (!(Math.abs(c.tx) < 8 && Math.abs(c.tz) < 8)) return false;
  }
  c.tx = r3(c.tx); c.tz = r3(c.tz);
  const p = at();
  return Math.abs(p.x - tu) < 2 && Math.abs(p.y - tv) < 2 && Math.abs(c.tx) <= HARD.tx && c.tz >= HARD.tz[0] && c.tz <= HARD.tz[1];
}
function tryScene(rng, flags) {
  const no = (why) => { if (flags.stats) flags.stats[why] = (flags.stats[why] || 0) + 1; return null; };
  const reach = (st) => { if (flags.stats) flags.stats['@' + st] = (flags.stats['@' + st] || 0) + 1; };
  const nSl = flags.n, dir = flags.dir;
  const cd = r3(u(rng, HARD.camD[0], HARD.camD[1]));
  const cam0 = { az: r3(u(rng, -HARD.az, HARD.az)), d: cd, h: r3(cd * u(rng, HARD.camH[0], HARD.camH[1])), tx: 0, tz: 0 };
  const rd = { cam: cam0, box: { i: 0, j: 0, hw: r3(u(rng, HARD.boxHW[0], HARD.boxHW[1])), h: r3(u(rng, 1.0, 1.3)) }, slide: { dir, n: nSl }, toys: [], answer: [] };
  const combos = rng.shuffle(flags.ends.flatMap((c) => [-2, -1, 0].map((j) => [c, j])));
  const boxIn = (c) => { const B = boxAt(rd, c), r = projBB(cameraFor(rd), [B.x - B.hw, 0, B.z - B.hw, B.x + B.hw, B.h, B.z + B.hw]); return r.x0 > HARD.edge && r.x1 < BOARD.w - HARD.edge && r.y0 > HARD.edge && r.y1 < BOARD.h - HARD.edge; };
  let nc = null;
  for (const [c, j] of combos) {
    cam0.tx = 0; cam0.tz = 0; rd.box.i = c - dir * nSl; rd.box.j = j;
    if (aimCamera(rd, [cellC(c), rd.box.h, cellC(j)], flags.tu, flags.tv) && boxIn(c) && boxIn(rd.box.i)) { nc = c; break; }
  }
  if (nc === null) return no('aim');
  const bi = rd.box.i, bj = rd.box.j;
  const cam = cameraFor(rd), Bn = boxAt(rd, nc), Bo = boxAt(rd, bi);
  const driftOk = Math.abs(Bn.x - cam.eye[0]) >= HARD.drift * Math.hypot(Bn.x - cam.eye[0], Bn.z - cam.eye[2]);
  const Sn = sightFrame(cam, Bn), So = sightFrame(cam, Bo), P = pathRect(rd);
  const inPic = (o) => { const r = projBB(cam, toyShape(o, 0).bb); return r.x0 > HARD.edge && r.x1 < BOARD.w - HARD.edge && r.y0 > HARD.edge && r.y1 < BOARD.h - HARD.edge; };
  const cols = rng.shuffle(COLORS.map((_, i) => i));
  const oldSafe = (o) => { const q = So.of(o.x, o.z); return q.along < 0 || q.k > 2.7; };
  let role = '';
  const oldClear = (o) => oldSafe(o) || vFrac(cam, o, Bo, HARD.grow + 0.06) <= 0;
  const tryPut = (kind, place, extra = () => true, tune = () => {}, safe = oldSafe) => {
    const o = newToy(rng, kind || rng.pick(KINDS), cols[rd.toys.length]);
    tune(o);
    for (let a = 0; a < 25; a++) {
      place(o);
      if (placeOk(o, rd.toys, P) && safe(o) && inPic(o) && extra(o)) { rd.toys.push(o); if (flags.stats) ROLE.set(o, role); return o; }
    }
    return null;
  };
  const drift = Math.sign((Bn.x - cam.eye[0]) || 1), sgn = rng.raw() < 0.85 ? drift : -drift;
  const lanes = flags.k === 1 ? [null]
    : flags.k === 2 ? [null, [-0.8, -0.2, 0.05, 0.85]]
      : [null, [-0.25, 0.05, 0.2, 1.0], [-0.8, -0.5, 0.05, 0.8]];
  role = 'ans';
  if (!driftOk) return no('drift');
  const shrunk = { ...Bn, h: Bn.h - HARD.shrink };
  reach('aimed');
  if (!tryPut(null, (o) => Sn.at(o, Bn.hw + footR(o) + u(rng, 0.05, 1.3), drift * u(rng, flags.k > 2 ? 0.25 : 0, 0.75)),
    (o) => cellOf(o.x) !== nc && vFrac(cam, o, shrunk, 0) >= 0.4 && (flags.k > 1 || vFrac(cam, o, Bn, 0) <= 0.75 || Sn.of(o.x, o.z).k >= 0.6))) return no('first-place');
  reach('first');
  lanes.shift();
  for (const [k0, k1, a0, a1] of lanes) {
    const side = sgn;
    if (!tryPut(null, (o) => Sn.at(o, Bn.hw + footR(o) + u(rng, a0, a1), side * u(rng, k0, k1)))
      && !tryPut(null, (o) => Sn.at(o, Bn.hw + footR(o) + u(rng, 0.05, 0.9), u(rng, -0.8, 0.8)))) return no('ans-place');
  }
  reach('answers');
  role = 'over';
  if (!tryPut(rng.raw() < 0.5 ? 'cyl' : 'cone', (o) => {
    const kk = u(rng, -0.5, 0.5);
    let a = Bn.hw + footR(o) + 0.3;
    for (; a < 7; a += 0.05) { Sn.at(o, a, kk); if (vFrac(cam, o, Bn, HARD.grow + 0.06) <= 0 && gapOk(overGap(cam, o, Bn, Bo), 2)) break; }
    Sn.at(o, a + u(rng, 0, 0.25), kk);
  }, (o) => Sn.of(o.x, o.z).k <= HARD.overK - 0.1,
  (o) => { o.h = Math.min(rd.box.h / 1.3 - 0.02, u(rng, 0.6, 0.74)); if (o.kind === 'cyl') o.s = u(rng, 0.17, 0.21); }, oldClear)) return no('over-place');
  reach('over');
  const fBall = rng.raw() < 0.3;
  role = 'front';
  if (!tryPut(fBall ? 'ball' : 'cyl', (o) => Sn.at(o, -(Bn.hw + footR(o) + (fBall ? u(rng, 0.085, 0.11) : u(rng, 0.09, 0.16))), u(rng, -0.35, 0.35)),
    undefined, (o) => { if (o.kind === 'cyl') o.h = Math.min(rd.box.h / 1.3 - 0.02, Math.max(o.h, u(rng, 0.62, 0.76))); else o.s = Math.max(o.s, u(rng, 0.24, 0.25)); })) return no('front-place');
  role = 'beside';
  const away = Math.sign((Bn.x - Bo.x) * (cam.eye[2] - Bn.z) || 1);
  if (!tryPut(null, (o) => Sn.at(o, Bn.hw + footR(o) + u(rng, 0.05, 1.0), away * u(rng, 2.25, 2.9)))) return no('beside-place');
  if (rd.toys.length < flags.N - 1) tryPut(null, (o) => Sn.at(o, Bn.hw + footR(o) + u(rng, 0.05, 1.6), -away * u(rng, 2.25, 3.6)));
  role = 'aside';
  const asideAt = (o) => { o.x = u(rng, BX0 + 0.3, BX1 - 0.3); o.z = u(rng, BZ0 + 0.3, Bn.z - 0.6); };
  const asideOk = (o) => Math.abs(o.x - Bn.x) >= 1.25 && Sn.of(o.x, o.z).k > 2.7;
  if (!tryPut(null, asideAt, (o) => asideOk(o) && (o.x - Bo.x) * dir > 0.6) && !tryPut(null, asideAt, asideOk)) return no('aside-place');
  role = 'beyond';
  if (rd.toys.length < flags.N) tryPut(null, (o) => { o.x = Bn.x + dir * u(rng, 0.3, 2.4); o.z = u(rng, BZ0 + 0.3, BZ1 - 0.3); },
    (o) => { const q = Sn.of(o.x, o.z); return q.along < -0.6 || q.k > 2.7; });
  role = 'fill';
  while (rd.toys.length < flags.N) {
    const back = rng.raw() < 0.8;
    if (!tryPut(null, (o) => { o.x = u(rng, BX0 + 0.3, BX1 - 0.3); o.z = back ? u(rng, BZ0 + 0.3, Bn.z + 0.3) : u(rng, BZ0 + 0.3, BZ1 - 0.3); },
      (o) => { const q = Sn.of(o.x, o.z); return q.along < 0 || q.k > 2.7; })) break;
  }
  if (rd.toys.length < HARD.nToys[0]) return no('few');
  rd.toys = rng.shuffle(rd.toys);
  for (const o of rd.toys) for (const kk of ['x', 'z', 's', 'h']) o[kk] = r3(o[kk]);
  const why0 = structOk(rd);
  if (why0) return no(why0);
  reach('struct');
  const A = analyze(rd);
  for (let i = 0; i < A.per.length; i++) { const p = A.per[i]; if (p.area < 150 || p.frac < HARD.visMin) return no(`toy-vis:${ROLE.get(rd.toys[i])}`); }
  const C = classify(rd, A, nc);
  if (C.cls.some((c) => c < 0)) return no(flags.stats ? `ambiguous:${C.cls.map((c, i) => (c < 0 ? `${ROLE.get(rd.toys[i])}${C.lo[i] > 0.15 ? '+' : '-'}` : '')).filter(Boolean).join(',')}` : 'ambiguous');
  rd.answer = C.cls.map((c, i) => (c === 1 ? i : -1)).filter((i) => i >= 0);
  if (rd.answer.length < 1 || rd.answer.length > 3) return no('answer-size');
  if (!rd.answer.some((i) => C.nom[i] <= 0.85)) return no('no-partial');
  reach('classified');
  const why = check(rd, A, C);
  if (why) return no(why);
  reach('checked');
  const sc = sceneFor(rd);
  for (let id = 0; id < rd.toys.length; id++) {
    const st = objectStats(sc, id, 2);
    if (!st.pt || st.pt[2] < 3) return no('pt');
    rd.toys[id].pt = [r3(st.pt[0]), r3(st.pt[1])];
  }
  return rd;
}
function makeInstance(rng, stats) {
  const [nu, nv] = HARD.aimBins;
  let ub = rng.int(0, nu - 1), vb = rng.int(0, nv - 1);
  const flags = { k: rng.int(1, 3), N: rng.int(HARD.nToys[0], HARD.nToys[1]), stats };
  flags.N = Math.max(flags.N, Math.min(HARD.nToys[1], flags.k + 5));
  const aim = () => {
    flags.tu = BOARD.w * (HARD.aimU[0] + (HARD.aimU[1] - HARD.aimU[0]) * (ub + rng.raw()) / nu);
    flags.tv = BOARD.h * (HARD.aimV[0] + (HARD.aimV[1] - HARD.aimV[0]) * (vb + rng.raw()) / nv);
  };
  aim();
  const slide = () => {
    const n = rng.int(1, 3), side = flags.tu / BOARD.w, dir = side < 0.35 ? -1 : side > 0.65 ? 1 : rng.sign(), ends = [];
    for (let i = I0 + 1; i < I1; i++) if (onBoardCol(i - dir * n)) ends.push(i);
    Object.assign(flags, { n, dir, ends });
  };
  slide();
  const k0 = flags.k;
  for (let a = 0; a < 8000; a++) {
    if (a && a % 1000 === 0) { if (a >= 3000) { ub = rng.int(0, nu - 1); vb = rng.int(0, nv - 1); } aim(); slide(); }
    else if (a && a % 300 === 0) slide();
    flags.k = Math.max(1, k0 - (a >= 1500) - (a >= 2500));
    if (flags.n === 1) flags.k = Math.min(flags.k, 2);
    const rd = tryScene(rng, flags);
    if (rd) return rd;
  }
  throw new Error(`${NAME}: sampler exhausted`);
}

export function gate(m) {
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !m.scene) return false;
  const rd0 = m.scene;
  const rd = { ...rd0, toys: rd0.toys.map((o) => ({ ...o })) };
  if (!Array.isArray(rd.answer) || check(rd)) return false;
  const sc = sceneFor(rd);
  for (let id = 0; id < rd.toys.length; id++) {
    const pt = rd.toys[id].pt;
    if (!Array.isArray(pt) || pickId(sc, pt[0], pt[1]) !== id) return false;
  }
  return true;
}
function renderAt(rd, col, q = 1) {
  const toys = rd.toys.map((o, id) => toyShape(o, id));
  return render(mk(cameraFor(rd), [...toys, cartonShape(rd.toys.length, boxAt(rd, col))]), q);
}
export const _debug = { analyze, classify, check, heuristics, GATED, makeInstance, tryScene, overlap: overlapFrac, coverage, renderAt, cameraFor, sightFrame, HARD };

function promptFor(rd) {
  const n = rd.slide.n, side = rd.slide.dir < 0 ? 'left' : 'right';
  return { main: `If the box slides ${n} square${n > 1 ? 's' : ''} to the ${side}, click every toy it would then hide`, sub: 'Even partly hidden counts, as seen from where you are' };
}
function ringsFor(A, img, sel) {
  const key = sel.slice().sort((a, b) => a - b).join(',');
  if (A.ringKey !== key) { A.rings = sel.map((id) => silhouetteRing(img, id, [25, 145, 250, 255], 2.5)); A.ringKey = key; }
  return A.rings;
}

const task = {
  meta: {
    name: NAME, family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'click a toy to select it, click again to unselect; then Verify' }],
    promptHuman: 'If the box slides 2 squares to the left, click every toy it would then hide',
  },

  generate(rng) {
    return { task: NAME, board: { ...BOARD }, scene: makeInstance(rng) };
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = pickNear(sceneFor(m.scene), a.x, a.y, 10);
    if (id < 0) return { ok: false, reason: 'no-toy' };
    if (id >= m.scene.toys.length) return { ok: false, reason: 'box' };
    const at = s.sel.indexOf(id);
    if (at >= 0) s.sel.splice(at, 1); else s.sel.push(id);
    return { ok: true };
  },

  verify(s, m) {
    const want = new Set(m.scene.answer);
    const hit = s.sel.filter((i) => want.has(i)).length, fp = s.sel.length - hit;
    const success = hit === want.size && fp === 0;
    return { success, error: want.size - hit + fp, partial: Math.max(0, (hit - fp) / want.size), detail: { hit, falsePos: fp, need: want.size } };
  },

  oracle(m) { return m.scene.answer.map((i) => ({ op: 'click', x: m.scene.toys[i].pt[0], y: m.scene.toys[i].pt[1] })); },

  randomPolicy(m, rnd) {
    const ids = m.scene.toys.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, 1 + Math.floor(rnd() * ids.length)).map((i) => ({ op: 'click', x: m.scene.toys[i].pt[0], y: m.scene.toys[i].pt[1] }));
  },

  async mount(env) { env.assets.sth = { img: null, key: '', rings: [], ringKey: '' }; },

  drawPrompt(g, r, env) {
    const p = promptFor(env.manifest.scene);
    drawPromptText(g, r, p.main, p.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.sth || (env.assets.sth = {});
    const q = contextScale(g), key = `${q}`;
    if (A.key !== key || A.m !== m) { A.img = render(sceneFor(m.scene), q); A.canvas = toCanvas(A.img); A.key = key; A.m = m; A.ringKey = null; }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    if (s.sel.length) for (const c of ringsFor(A, A.img, s.sel)) g.drawImage(c, 0, 0, BOARD.w, BOARD.h);
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted || e.type !== 'down' || e.x < 0 || e.y < 0 || e.x > BOARD.w || e.y > BOARD.h) return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    const n = env.state.sel.length;
    return n ? `${n} selected` : 'Click toys, then Verify';
  },
};
export default task;
