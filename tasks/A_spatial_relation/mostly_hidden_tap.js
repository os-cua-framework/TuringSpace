import { drawPromptText, ACCENT } from '../core/panel.js';
import { render, toCanvas, contextScale, shadeAt } from '../common/_mostly_hidden_tap_rt.js';
import * as K from '../common/_scene_tex_kit.js';
import {
  IMG, THEMES, cameraFor, objShapes, objBox, occShape, occFoot, occHull, polyBox, polyArea, inPoly,
  sampleObject, hiddenBy, cutStats, visiblePart, coreExtent, sunDir, shadowShare, buildScene, PROP_LOOKS, styleLook,
} from '../common/_mostly_hidden_tap_scene.js';

const PANEL_W = 400;
const BOARD = { w: IMG.w, h: IMG.h };
const HARD = Object.freeze({
  nObj: [6, 7], ans: [1, 3], lightMin: 2, fullMin: 2,
  rows: 36,
  ansLin: [0.69, 0.92], ansArea: [0.67, 0.9],
  lightLin: [0.08, 0.27], lightArea: [0.055, 0.27],
  aimAns: [0.74, 0.82], aimAnsSide: [0.7, 0.75],
  aimLight: [0.15, 0.23], aimLightSide: [0.17, 0.23],
  aimAnchor: [0.7, 0.74],
  mismatch: 0.08,
  cover: 0.1, coverV: 0.06,
  visArea: 150, visSide: 8,
  shadowMax: 0.2,
  sizeRatio: 1.9,
  inv: 1.0,
  objGap: 8, occGap: 3, edge: 8,
  footGap: 0.1, ownGap: 0.03,
  camNear: 1.4,
  behind: 0.05,
  R: 26, clickMin: 42,
  visGap: 18,
  lumGap: 1,
  tone: [0.88, 1.12],
});
const TIGHT = Object.freeze({
  ...HARD, tag: 'tight',
  ans: [2, 3],
  ansLin: [0.6, 0.78], ansArea: [0.6, 0.78],
  lightLin: [0.08, 0.4], lightArea: [0.055, 0.4],
  lightTop: 0.3,
  aimAns: [0.62, 0.71], aimAnsSide: [0.62, 0.69], aimAnchor: [0.62, 0.66],
  aimLight: [0.32, 0.38], aimLightSide: [0.32, 0.38],
  aimTop: [0.66, 0.72], topLin: [0.65, 0.75], topFar: 1.4, loneFar: [1.45, 1.8],
});
let V = HARD;
const D2R = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const u = (rng, a, b) => rng.uniform(a, b);
const THEME_NAMES = ['penguin', 'pumpkin'];
const boxGap = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
const inFrame = (b, m = HARD.edge) => b[0] >= m && b[1] >= m && b[2] <= IMG.w - m && b[3] <= IMG.h - m;

function objFoot(theme, o) { return { t: 'circ', cx: o.x, cz: o.z, r: THEMES[theme].rad }; }
function obbAxes(f) { const a = f.yaw * D2R; return [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]]; }
function footsHit(a, b, margin) {
  if (a.t === 'circ' && b.t === 'circ') return Math.hypot(a.cx - b.cx, a.cz - b.cz) < a.r + b.r + margin;
  if (a.t === 'circ' || b.t === 'circ') {
    const c = a.t === 'circ' ? a : b, o = a.t === 'circ' ? b : a;
    const [ax, az] = obbAxes(o), px = c.cx - o.cx, pz = c.cz - o.cz;
    const lx = px * ax[0] + pz * ax[1], lz = px * az[0] + pz * az[1];
    const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
    return Math.hypot(lx - qx, lz - qz) < c.r + margin;
  }
  const A = obbAxes(a), B = obbAxes(b), dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const ax of [...A, ...B]) {
    const ra = a.hx * Math.abs(A[0][0] * ax[0] + A[0][1] * ax[1]) + a.hz * Math.abs(A[1][0] * ax[0] + A[1][1] * ax[1]);
    const rb = b.hx * Math.abs(B[0][0] * ax[0] + B[0][1] * ax[1]) + b.hz * Math.abs(B[1][0] * ax[0] + B[1][1] * ax[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) > ra + rb + margin) return false;
  }
  return true;
}

function polyDist(P, x, y) {
  let inside = true, best = Infinity, area2 = 0;
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; area2 += a[0] * b[1] - b[0] * a[1]; }
  const sg = area2 > 0 ? 1 : -1;
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-12;
    if (sg * (ex * (y - a[1]) - ey * (x - a[0])) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
  }
  return inside ? 0 : best;
}

const MEAS = new WeakMap();
function measure(rd) {
  let M = MEAS.get(rd);
  if (M) return M;
  const cam = cameraFor(rd.cam), th = rd.theme;
  const occShapes = rd.occs.map((oc, j) => occShape(oc, 100 + j));
  const occHulls = rd.occs.map((oc) => occHull(cam, oc));
  const occBoxes = occHulls.map(polyBox);
  const occRho = rd.occs.map(propRhoMin);
  const L = sunDir(rd.sun);
  const objs = rd.objs.map((o) => {
    const shapes = objShapes(th, o, 0);
    const S = sampleObject(cam, th, o, HARD.rows, shapes);
    const box = S.box;
    const near = occShapes.filter((_, j) => boxGap(occBoxes[j], box) < 0.5);
    const hid = hiddenBy(S, near);
    const st = cutStats(S, hid, o.cut || null);
    const vis = visiblePart(S, hid);
    const core = coreExtent(S);
    const p = cam.project(o.x, THEMES[th].H / 2, o.z);
    const cdist = vis.n ? Math.min(Infinity, ...occHulls.map((h) => polyDist(h, vis.cx, vis.cy))) : Infinity;
    return { S, hid, st, vis, core, box, depth: p.z, cdist, rho: copyRhoMax(shapes), shadow: o.role === 'answer' ? 0 : shadowShare(S, vis.vis, occShapes, L) };
  });
  M = { cam, occShapes, occHulls, occBoxes, occRho, occAreas: occHulls.map(polyArea), objs };
  MEAS.set(rd, M);
  return M;
}
function luminance(rd) {
  const M = measure(rd);
  if (M.lum) return M.lum;
  const sc = buildScene(rd);
  M.lum = M.objs.map((O) => {
    const P = O.vis.pts, n = P.length / 2, stepK = Math.max(1, Math.ceil(n / 48));
    let t = 0, k = 0;
    for (let i = 0; i < n; i += stepK) { t += shadeAt(sc, P[2 * i], P[2 * i + 1]); k++; }
    return k ? t / k : 0;
  });
  return M.lum;
}
function styledLumOk(rd, look) {
  const M = measure(rd), sc = buildScene(rd, look);
  const lum = M.objs.map((O) => {
    const P = O.vis.pts, n = P.length / 2, stepK = Math.max(1, Math.ceil(n / 48));
    let t = 0, k = 0;
    for (let i = 0; i < n; i += stepK) { t += shadeAt(sc, P[2 * i], P[2 * i + 1]); k++; }
    return k ? t / k : 0;
  });
  const A = rd.answer, NA = rd.objs.map((_, i) => i).filter((i) => !A.includes(i));
  const mx = (ids) => Math.max(...ids.map((i) => lum[i])), mn = (ids) => Math.min(...ids.map((i) => lum[i]));
  return !(mn(A) > mx(NA) - HARD.lumGap || mx(A) < mn(NA) + HARD.lumGap);
}
function objectAt(rd, x, y) {
  if (!(x >= 0 && y >= 0 && x <= IMG.w && y <= IMG.h)) return -1;
  const M = measure(rd);
  let best = HARD.R * HARD.R + 1e-9, id = -1;
  M.objs.forEach((O, i) => {
    const P = O.vis.pts;
    for (let k = 0; k < P.length; k += 2) { const dx = P[k] - x, dy = P[k + 1] - y, d = dx * dx + dy * dy; if (d < best) { best = d; id = i; } }
  });
  return id;
}
function tapSquares(rd, g = 2) {
  const M = measure(rd), R = HARD.R;
  const W = Math.ceil(IMG.w / g), H = Math.ceil(IMG.h / g);
  const best = new Float64Array(W * H).fill(R * R + 1e-9), lab = new Int8Array(W * H).fill(-1);
  const stamp = (x, y, rad, i) => {
    const gx0 = Math.max(0, Math.floor((x - rad) / g)), gx1 = Math.min(W - 1, Math.ceil((x + rad) / g));
    const gy0 = Math.max(0, Math.floor((y - rad) / g)), gy1 = Math.min(H - 1, Math.ceil((y + rad) / g));
    for (let gy = gy0; gy <= gy1; gy++) {
      const py = (gy + 0.5) * g, dy = py - y;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = (gx + 0.5) * g, dx = px - x, d = dx * dx + dy * dy, k = gy * W + gx;
        if (d < best[k] || (d === best[k] && i < lab[k])) { best[k] = d; lab[k] = i; }
      }
    }
  };
  M.objs.forEach((O, i) => {
    const S = O.S, v = O.vis.vis;
    for (let r = 0; r < S.nr; r++) for (let c = 0; c < S.nc; c++) {
      const k = r * S.nc + c; if (!v[k]) continue;
      const edge = c === 0 || r === 0 || c === S.nc - 1 || r === S.nr - 1 || !v[k - 1] || !v[k + 1] || !v[k - S.nc] || !v[k + S.nc];
      stamp(S.x0 + (c + 0.5) * S.s, S.y0 + (r + 0.5) * S.s, edge ? R : S.s * 1.01, i);
    }
  });
  return M.objs.map((_, i) => {
    const D = new Int32Array(W * H);
    for (let k = 0; k < W * H; k++) D[k] = lab[k] === i ? 1 << 20 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!D[k]) continue;
      D[k] = x === 0 || y === 0 ? 1 : Math.min(D[k], D[k - 1] + 1, D[k - W] + 1, D[k - W - 1] + 1, x + 1 < W ? D[k - W + 1] + 1 : 1);
    }
    let mx = 0;
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const k = y * W + x; if (!D[k]) continue;
      D[k] = x === W - 1 || y === H - 1 ? 1 : Math.min(D[k], D[k + 1] + 1, D[k + W] + 1, D[k + W + 1] + 1, x > 0 ? D[k + W - 1] + 1 : 1);
      if (D[k] > mx) mx = D[k];
    }
    return mx ? (2 * mx - 1) * g : 0;
  });
}

function copyProblem(role, cut, st, vis, O, hull) {
  if (role === 'full') return st.hidAll === 0 ? '' : 'full-hidden';
  const bA = role === 'answer' ? V.ansArea : V.lightArea, bL = role === 'answer' ? V.ansLin : V.lightLin;
  if (st.area < bA[0] || st.area > bA[1]) return `${role}-area`;
  if (st.lin < bL[0] || st.lin > bL[1]) return `${role}-lin`;
  if (V !== HARD && role === 'light' && Math.max(st.area, st.lin) < V.lightTop) return 'light-low';
  if (st.mismatch > HARD.mismatch || !st.contiguous) return 'unclean';
  const b = O.core.box, bw = b[2] - b[0], bh = b[3] - b[1];
  if (cut === 'bottom') {
    const y = b[3] - 0.02 * bh;
    if (!inPoly(hull, b[0] - HARD.cover * bw, y) || !inPoly(hull, b[2] + HARD.cover * bw, y)) return 'cover-bottom';
  } else {
    const x = cut === 'left' ? b[0] + 0.02 * bw : b[2] - 0.02 * bw;
    if (!inPoly(hull, x, b[1] - HARD.coverV * bh) || !inPoly(hull, x, b[3] + HARD.coverV * bh)) return 'cover-side';
  }
  if (role === 'answer' && (vis.area < HARD.visArea || Math.min(vis.hgt, vis.wid) < HARD.visSide)) return 'answer-visible';
  return '';
}

function topOnlyPair(rd, M) {
  return rd.objs.some((a, i) => a.role === 'answer' && a.cut === 'bottom' && M.objs[i].st.lin >= V.topLin[0] && M.objs[i].st.lin <= V.topLin[1]
    && rd.objs.some((f, j) => f.role === 'full' && M.objs[j].depth >= V.topFar * M.objs[i].depth && M.objs[i].vis.area <= M.objs[j].vis.area));
}
function roundProblem(rd, opt = { taps: true }) {
  const keep = V;
  V = rd && rd.hard === TIGHT.tag ? TIGHT : HARD;
  try { return roundProblemIn(rd, opt); } finally { V = keep; }
}
function roundProblemIn(rd, opt) {
  if (!rd || !THEMES[rd.theme] || !rd.cam || !rd.sun || !rd.look || !Array.isArray(rd.objs) || !Array.isArray(rd.occs) || !Array.isArray(rd.answer) || !Array.isArray(rd.pts)) return 'shape';
  if (rd.hard !== undefined && rd.hard !== TIGHT.tag) return 'tag';
  const TH = THEMES[rd.theme], N = rd.objs.length;
  if (N < HARD.nObj[0] || N > HARD.nObj[1] || rd.pts.length !== N) return 'count';
  const within = (v, [a, b]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;
  if (rd.cam.fov !== TH.cam.fov || !within(rd.cam.h, TH.cam.h) || !within(rd.cam.g, TH.cam.g)) return 'camera';
  if (!within(Math.abs(rd.sun.az), [96, 122]) || !within(rd.sun.el, TH.sunEl)) return 'sun';
  const used = new Array(rd.occs.length).fill(0);
  let nA = 0, nL = 0, nF = 0, sideAns = 0, bottomLight = 0, sideLight = 0;
  for (const o of rd.objs) {
    if (!['answer', 'light', 'full'].includes(o.role)) return 'role';
    if (rd.theme === 'pumpkin' ? !within(o.tone, HARD.tone) : o.tone !== undefined) return 'tone';
    if (o.role === 'full') { if (o.cut !== null || o.occ !== -1) return 'full-prop'; nF++; continue; }
    if (!['bottom', 'left', 'right'].includes(o.cut) || !Number.isInteger(o.occ) || o.occ < 0 || o.occ >= rd.occs.length) return 'prop-ref';
    used[o.occ]++;
    const oc = rd.occs[o.occ];
    const okStyle = (o.cut === 'bottom' ? TH.bottom : TH.side).includes(oc.style);
    if (!okStyle || !PROP_LOOKS[oc.style] || (oc.kind === 'trunk') !== (oc.style === 'stump' || oc.style === 'trunk')) return 'prop-style';
    if (o.role === 'answer') { nA++; if (o.cut !== 'bottom') sideAns++; } else { nL++; if (o.cut === 'bottom') bottomLight++; else sideLight++; }
  }
  if (used.some((k) => k > 3) || used.filter((k) => k === 0).length > 1) return 'prop-use';
  if (rd.occs.some((oc) => !PROP_LOOKS[oc.style] || ![...TH.bottom, ...TH.side].includes(oc.style) || (oc.kind === 'trunk') !== (oc.style === 'stump' || oc.style === 'trunk'))) return 'prop-style';
  if (nA < V.ans[0] || nA > V.ans[1] || nL < HARD.lightMin || nF < HARD.fullMin) return 'composition';
  if (!sideAns || !bottomLight || !sideLight) return 'cut-mix';
  const ans = rd.objs.map((o, i) => (o.role === 'answer' ? i : -1)).filter((i) => i >= 0);
  if (JSON.stringify(ans) !== JSON.stringify(rd.answer)) return 'answer';
  const foots = [...rd.objs.map((o) => objFoot(rd.theme, o)), ...rd.occs.map(occFoot)];
  for (let a = 0; a < foots.length; a++) for (let b = 0; b < a; b++) {
    const own = b < N && a >= N && rd.objs[b].occ === a - N;
    if (footsHit(foots[a], foots[b], own ? HARD.ownGap : HARD.footGap)) return 'footprint';
  }
  const M = measure(rd);
  if (rd.occs.some(propNearEye)) return 'prop-near-eye';
  for (let i = 0; i < N; i++) {
    const O = M.objs[i], o = rd.objs[i];
    if (!inFrame(O.box)) return 'frame';
    for (let k = 0; k < i; k++) if (boxGap(O.box, M.objs[k].box) < HARD.objGap) return 'objects-close';
    for (let j = 0; j < rd.occs.length; j++) {
      if (j === o.occ || boxGap(O.box, M.occBoxes[j]) >= HARD.occGap) continue;
      if (!(M.occRho[j] > O.rho + HARD.behind) && silGap(M.occHulls[j], O.S) < HARD.occGap) return 'prop-over-other';
    }
    const why = copyProblem(o.role, o.cut, O.st, O.vis, O, o.occ >= 0 ? M.occHulls[o.occ] : null);
    if (why) return why;
    if (o.role !== 'answer' && O.shadow > HARD.shadowMax) return 'shadow';
  }
  const A = ans, NA = rd.objs.map((_, i) => i).filter((i) => !A.includes(i));
  const maxOf = (ids, f) => Math.max(...ids.map(f)), minOf = (ids, f) => Math.min(...ids.map(f));
  if (maxOf(A, (i) => M.objs[i].vis.area) < HARD.inv * minOf(NA, (i) => M.objs[i].vis.area)) return 'lazy-area';
  if (maxOf(A, (i) => M.objs[i].vis.hgt) < HARD.inv * minOf(NA, (i) => M.objs[i].vis.hgt)) return 'lazy-height';
  const lights = NA.filter((i) => rd.objs[i].role === 'light');
  if (!lights.some((l) => A.some((a) => M.occAreas[rd.objs[l].occ] >= 1.05 * M.occAreas[rd.objs[a].occ]))) return 'lazy-prop-size';
  if (minOf(NA, (i) => M.objs[i].cdist) > maxOf(A, (i) => M.objs[i].cdist) - 1) return 'lazy-edge';
  if (A.every((a) => NA.every((n) => M.objs[a].depth < M.objs[n].depth))) return 'lazy-near';
  if (A.every((a) => NA.every((n) => M.objs[a].vis.cy > M.objs[n].vis.cy))) return 'lazy-low';
  const lum = luminance(rd);
  if (minOf(A, (i) => lum[i]) > maxOf(NA, (i) => lum[i]) - HARD.lumGap || maxOf(A, (i) => lum[i]) < minOf(NA, (i) => lum[i]) + HARD.lumGap) return 'lazy-brightness';
  const hs = M.objs.map((O) => O.core.hgt);
  if (Math.max(...hs) < HARD.sizeRatio * Math.min(...hs)) return 'size-ratio';
  const far = rd.objs.map((_, i) => i).sort((a, b) => M.objs[b].depth - M.objs[a].depth).slice(0, 2);
  if (!far.some((i) => rd.objs[i].role === 'full')) return 'far-full';
  if (V !== HARD && !topOnlyPair(rd, M)) return 'no-top-only';
  for (const a of A) for (let i = 0; i < N; i++) if (i !== a && boxGap(M.objs[a].box, M.objs[i].box) < HARD.visGap && visNear(M.objs[a].vis.pts, M.objs[i].vis.pts, HARD.visGap)) return 'vis-gap';
  for (let i = 0; i < N; i++) if (!Array.isArray(rd.pts[i]) || objectAt(rd, rd.pts[i][0], rd.pts[i][1]) !== i) return 'tap-point';
  if (opt.taps && Math.min(...tapSquares(rd, 2)) < HARD.clickMin) return 'tap-region';
  return '';
}

function copyRhoMax(shapes) {
  let m = 0;
  for (const s of shapes) { const b = s.bb; for (const x of [b[0], b[3]]) for (const z of [b[2], b[5]]) m = Math.max(m, Math.hypot(x, z)); }
  return m;
}
function propRhoMin(oc) {
  if (oc.kind === 'trunk') return Math.hypot(oc.x, oc.z) - oc.r;
  const a = oc.yaw * D2R, c = Math.cos(a), sn = Math.sin(a);
  const lx = -oc.x * c + oc.z * sn, lz = -oc.x * sn - oc.z * c;
  const qx = Math.max(-oc.w / 2, Math.min(oc.w / 2, lx)), qz = Math.max(-oc.d / 2, Math.min(oc.d / 2, lz));
  return Math.hypot(lx - qx, lz - qz);
}
const propNearEye = (oc) => Math.hypot(oc.x, oc.z) - (oc.kind === 'trunk' ? oc.r : Math.hypot(oc.w, oc.d) / 2) < HARD.camNear;
function silGap(hull, S) {
  let best = Infinity, area2 = 0;
  const n = hull.length;
  for (let k = 0; k < n; k++) { const a = hull[k], b = hull[(k + 1) % n]; area2 += a[0] * b[1] - b[0] * a[1]; }
  const sg = area2 > 0 ? 1 : -1;
  for (let i = 0; i < S.n; i++) {
    if (S.t[i] === Infinity) continue;
    const x = S.x0 + ((i % S.nc) + 0.5) * S.s, y = S.y0 + (Math.floor(i / S.nc) + 0.5) * S.s;
    let inside = true, dmin = Infinity;
    for (let k = 0; k < n; k++) {
      const a = hull[k], b = hull[(k + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-12;
      if (sg * (ex * (y - a[1]) - ey * (x - a[0])) < 0) inside = false;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
      dmin = Math.min(dmin, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
    }
    const d = inside ? -dmin : dmin;
    if (d < best) best = d;
  }
  return best;
}
function visNear(A, B, g, step = 2) {
  const g2 = g * g;
  for (let i = 0; i < A.length; i += step) for (let j = 0; j < B.length; j += step) { const dx = A[i] - B[j], dy = A[i + 1] - B[j + 1]; if (dx * dx + dy * dy < g2) return true; }
  return false;
}
function pickFree(rng, lo, hi, blocked, anywhere = false) {
  const B = blocked.filter((b) => b[1] > lo && b[0] < hi).sort((a, b) => a[0] - b[0]);
  const free = [];
  let x = lo;
  for (const [a, b] of B) { if (a > x) free.push([x, Math.min(a, hi)]); x = Math.max(x, b); if (x >= hi) break; }
  if (x < hi) free.push([x, hi]);
  const tot = free.reduce((t, [a, b]) => t + Math.max(0, b - a), 0);
  if (tot < 1e-6) return null;
  if (!anywhere) { const [a, b] = free.find(([a0, b0]) => b0 - a0 > 1e-6); return a + Math.min(b - a, rng.raw() * 14); }
  let r = rng.raw() * tot;
  for (const [a, b] of free) { const l = b - a; if (r <= l) return a + r; r -= l; }
  return free[free.length - 1][1];
}

function composition(rng, A) {
  const N = A === 3 ? HARD.nObj[1] : rng.int(HARD.nObj[0], HARD.nObj[1]);
  const F = HARD.fullMin, L = N - A - F;
  const R = [{ role: 'answer', cut: 'side' }];
  for (let k = 1; k < A; k++) R.push({ role: 'answer', cut: rng.raw() < 0.8 ? 'bottom' : 'side' });
  if (V !== HARD) R[1] = { role: 'answer', cut: 'bottom', topOnly: true };
  R.push({ role: 'light', cut: 'bottom' }, { role: 'light', cut: 'side' });
  for (let k = 2; k < L; k++) R.push({ role: 'light', cut: rng.raw() < 0.55 ? 'bottom' : 'side' });
  for (let k = 0; k < F; k++) R.push({ role: 'full', cut: null });
  R[0].anchor = true;
  return R;
}
function groupsFor(rng, roles, sunSide) {
  const bottoms = rng.shuffle(roles.filter((q) => q.cut === 'bottom')), sides = rng.shuffle(roles.filter((q) => q.cut === 'side'));
  const fulls = roles.filter((q) => q.role === 'full');
  const G = [];
  const nw = bottoms.length === 0 ? 0 : bottoms.length <= 3 ? (bottoms.length === 3 && rng.raw() < 0.35 ? 2 : 1) : 2;
  if (nw) {
    const bA = bottoms.filter((q) => q.role === 'answer'), bL = bottoms.filter((q) => q.role !== 'answer');
    const walls = Array.from({ length: nw }, () => []);
    if (bA.length && bL.length && rng.raw() < 0.3) walls[0].push(bA.pop(), bL.pop());
    for (const q of rng.shuffle([...bA, ...bL])) walls.slice().sort((x, y) => x.length - y.length)[0].push(q);
    for (const w of walls) if (w.length) G.push({ kind: 'wall', members: w });
  }
  const sA = sides.filter((q) => q.role === 'answer'), sL = sides.filter((q) => q.role !== 'answer');
  const away = sunSide > 0 ? 'left' : 'right', toward = away === 'left' ? 'right' : 'left';
  const pair = (a, b) => { const [ca, cb] = rng.raw() < 0.5 ? ['left', 'right'] : ['right', 'left']; G.push({ kind: 'pillar', members: [{ ...a, cut: ca }, { ...b, cut: cb }] }); };
  while (sA.length && sL.length && rng.raw() < 0.85) pair(sA.pop(), sL.pop());
  const rest = rng.shuffle([...sA, ...sL]);
  while (rest.length >= 2 && rng.raw() < 0.5) pair(rest.pop(), rest.pop());
  for (const q of rest) G.push({ kind: 'pillar', members: [{ ...q, cut: rng.raw() < 0.5 ? away : toward }] });
  const items = rng.shuffle([...G, ...fulls.slice(1).map((q) => ({ kind: 'lone', members: [q] }))]);
  const rank = V === HARD ? (g) => (g.members.some((q) => q.anchor) ? 0 : 1)
    : (g) => (g.members.some((q) => q.anchor) ? 0 : g.members.some((q) => q.topOnly) ? 1 : g.kind === 'lone' ? 2 : 3);
  items.sort((a, b) => rank(a) - rank(b));
  return [{ kind: 'far', members: [fulls[0]] }, ...items];
}

function frameLocal(x0, z0, yawDeg, lx, lz) { const a = yawDeg * D2R; return [x0 + lx * Math.cos(a) + lz * Math.sin(a), z0 - lx * Math.sin(a) + lz * Math.cos(a)]; }
const readingOf = (S, shapes, cut, role) => { const st = cutStats(S, hiddenBy(S, shapes), cut); return role === 'answer' ? Math.min(st.lin, st.area) : Math.max(st.lin, st.area); };
function bisect(f, lo, hi, aim, rising, it = 16) {
  let a = lo, b = hi;
  for (let k = 0; k < it; k++) { const m = (a + b) / 2; if ((f(m) >= aim) === rising) b = m; else a = m; }
  return rising ? b : a;
}
const COARSE = 12;
const aimFor = (rng, q) => {
  const side = q.cut !== 'bottom';
  if (q.role !== 'answer') return u(rng, ...(side ? V.aimLightSide : V.aimLight));
  if (q.topOnly) return u(rng, ...V.aimTop);
  return q.anchor ? u(rng, ...V.aimAnchor) : u(rng, ...(side ? V.aimAnsSide : V.aimAns));
};
function rotXZ(x, z, phi) { const c = Math.cos(phi), s = Math.sin(phi); return [x * c - z * s, x * s + z * c]; }
function rotated(item, phi) {
  const [x, z] = rotXZ(item.x, item.z, phi);
  return { ...item, x: r3(x), z: r3(z), yaw: item.kind === 'trunk' ? 0 : r2(item.yaw - phi / D2R) };
}
function solver(C, theme, prop0, specs, place, lo, hiOf, w) {
  return (phi, rows = HARD.rows) => {
    const prop = phi ? rotated(prop0, phi) : prop0, shape = [occShape(prop, 1)];
    const fy = prop0.yaw - phi / D2R;
    const copies = specs.map((sp) => {
      const at = (t) => place(prop, fy, sp, t, phi);
      const f = (r) => (t) => readingOf(sampleObject(C, theme, at(t), r), shape, sp.q.cut, sp.q.role);
      if (rows < HARD.rows || sp.x0 === undefined) sp.x0 = bisect(f(COARSE), lo, hiOf(sp), sp.aim, false, 10);
      return at(rows < HARD.rows ? sp.x0 : bisect(f(rows), Math.max(lo, sp.x0 - w), Math.min(hiOf(sp), sp.x0 + w), sp.aim, false, 3));
    });
    return { props: [prop], copies };
  };
}
function fitWall(rng, theme, C, members, dw) {
  const TH = THEMES[theme], eh = C.eye[1], k = members.length;
  const style = rng.pick(TH.bottom), col = rng.int(0, PROP_LOOKS[style].length - 1);
  const thick = style === 'bale' ? u(rng, 0.42, 0.48) : style === 'stone' ? u(rng, 0.26, 0.36) : u(rng, 0.3, 0.46);
  const lightOnly = members.every((q) => q.role !== 'answer');
  const len = TH.W * (1.32 + 1.2 * (k - 1) + u(rng, 0.1, 0.45) + (lightOnly ? u(rng, 0.3, 1.1) : 0));
  const d0 = thick / 2 + TH.rad + 0.08;
  const specs = rng.shuffle(members).map((q) => ({ q, yaw: u(rng, -180, 180), aim: aimFor(rng, q) }));
  const top = Math.max(0, ...specs.filter((sp) => sp.q.role === 'answer').map((sp) => sp.aim));
  const hAns = top ? ((top + 0.08) * TH.H + eh * d0 / dw) / (1 + d0 / dw) : 0;
  let h;
  if (style === 'bale') { h = u(rng, 0.44, 0.52); if (h < hAns) h = 2 * u(rng, 0.4, 0.46); }
  else h = top ? hAns + u(rng, 0, 0.08) * TH.H : u(rng, 0.5, 0.95) * TH.H;
  if (h < hAns) return null;
  const wall0 = { kind: 'block', style, col, x: 0, z: r3(-dw), yaw: r2(u(rng, -10, 10)), w: r3(len), d: r3(thick), h: r3(h), r: 0 };
  const span = len / 2 - TH.W * 0.68, step = k > 1 ? 2 * span / (k - 1) : 0;
  specs.forEach((sp, i) => { sp.lat = k > 1 ? -span + i * step + u(rng, -0.1, 0.1) * step : u(rng, -1, 1) * Math.max(0, span) * 0.5; });
  const place = (wall, fy, sp, dz, phi) => { const [x, z] = frameLocal(wall.x, wall.z, fy, sp.lat, -(d0 + dz)); const o = { x: r3(x), z: r3(z), yaw: r2(sp.yaw - phi / D2R), cut: 'bottom', occ: 0, role: sp.q.role }; if (sp.q.topOnly) o.top = true; return o; };
  return { solve: solver(C, theme, wall0, specs, place, 0, () => 5, 0.08) };
}
function fitPillar(rng, theme, C, members, dp) {
  const TH = THEMES[theme], eh = C.eye[1];
  const style = rng.pick(TH.side), col = rng.int(0, PROP_LOOKS[style].length - 1);
  const trunk = style === 'stump' || style === 'trunk';
  const lightOnly = members.every((q) => q.role !== 'answer'), big = lightOnly && rng.raw() < 0.8 ? u(rng, 1.15, 1.5) : 1;
  const half = (trunk ? TH.W * u(rng, 0.44, 0.62) : TH.W * u(rng, 0.46, 0.66)) * big;
  const thick = trunk ? 2 * half : u(rng, 0.3, 0.46);
  const behind = members.map((q) => u(rng, 0.12, q.anchor ? 0.4 : q.role === 'answer' ? 0.7 : 1.1) + thick / 2 + TH.rad);
  const need = Math.max(...behind.map((b) => eh - (eh - TH.top) * (dp - thick / 2) / (dp + b - TH.rad))) + 0.06;
  let h;
  if (style === 'balestack') { const bale = u(rng, 0.36, 0.42); h = bale * Math.max(2, Math.ceil((need + 0.03) / bale)); }
  else if (style === 'trunk') h = 3.4;
  else h = need + u(rng, 0.04, trunk ? 0.2 : 0.3) + (big > 1 ? u(rng, 0.05, 0.3) : 0);
  const pillar0 = trunk ? { kind: 'trunk', style, col, x: 0, z: r3(-dp), yaw: 0, w: 0, d: 0, h: r3(h), r: r3(half) }
    : { kind: 'block', style, col, x: 0, z: r3(-dp), yaw: r2(u(rng, -20, 20)), w: r3(2 * half), d: r3(thick), h: r3(h), r: 0 };
  const specs = members.map((q, i) => ({ q, b: behind[i], yaw: u(rng, -180, 180), aim: aimFor(rng, q) }));
  const place = (pillar, fy, sp, t, phi) => { const [x, z] = frameLocal(pillar.x, pillar.z, fy, (sp.q.cut === 'left' ? 1 : -1) * t, -sp.b); return { x: r3(x), z: r3(z), yaw: r2(sp.yaw - phi / D2R), cut: sp.q.cut, occ: 0, role: sp.q.role }; };
  return { solve: solver(C, theme, pillar0, specs, place, 0, (sp) => (half + TH.W) * (dp + sp.b) / dp + 0.1, 0.03) };
}
function fitFar(rng, theme, d) {
  const TH = THEMES[theme], style = rng.pick(TH.bottom), col = rng.int(0, PROP_LOOKS[style].length - 1);
  const dep = style === 'bale' ? u(rng, 0.42, 0.48) : u(rng, 0.3, 0.45);
  const h = style === 'bale' ? u(rng, 0.44, 0.52) : TH.H * u(rng, 0.7, 1.05);
  const oc0 = { kind: 'block', style, col, x: 0, z: r3(-d), yaw: r2(u(rng, -18, 18)), w: r3(TH.W * u(rng, 1.4, 2.2)), d: r3(dep), h: r3(h), r: 0 };
  const lat = u(rng, -0.5, 0.5) * oc0.w / 2, back = dep / 2 + TH.rad + u(rng, 0.22, 0.36), yaw = u(rng, -180, 180);
  return { solve: (phi) => {
    const oc = phi ? rotated(oc0, phi) : oc0, [x, z] = frameLocal(oc.x, oc.z, oc0.yaw - phi / D2R, lat, back);
    return { props: [oc], copies: [{ x: r3(x), z: r3(z), yaw: r2(yaw - phi / D2R), cut: null, occ: -1, role: 'full' }] };
  } };
}
function fitLone(rng, d) {
  const yaw = u(rng, -180, 180);
  return { solve: (phi) => { const [x, z] = rotXZ(0, -d, phi); return { props: [], copies: [{ x: r3(x), z: r3(z), yaw: r2(yaw - phi / D2R), cut: null, occ: -1, role: 'full' }] }; } };
}

function tryRound(rng, theme, stats = null, nAns = 2) {
  const why = (k) => { if (stats) stats[k] = (stats[k] || 0) + 1; };
  const TH = THEMES[theme];
  const cam = { h: r3(u(rng, ...TH.cam.h)), g: r3(u(rng, ...TH.cam.g)), fov: TH.cam.fov };
  const sunSide = rng.raw() < 0.5 ? -1 : 1;
  const sun = { az: r2(sunSide * u(rng, 96, 122)), el: r2(u(rng, ...TH.sunEl)) };
  const look = theme === 'penguin' ? { shore: r2(u(rng, 30, 42)), drift: r3(u(rng, 0, 3.1)) } : { back: r2(u(rng, 24, 30)) };
  const C = cameraFor(cam), L = sunDir(sun);
  const groups = groupsFor(rng, composition(rng, nAns), sunSide);
  const objs = [], occs = [], P = [], Q = [];
  const check = (copies, props) => {
    const newP = copies.map((o) => {
      const shapes = objShapes(theme, o, 0), S = sampleObject(C, theme, o, HARD.rows, shapes);
      return { o, box: S.box, foot: objFoot(theme, o), rho: copyRhoMax(shapes), S };
    });
    const newQ = props.map((oc) => { const hull = occHull(C, oc); return { oc, hull, box: polyBox(hull), foot: occFoot(oc), rho: propRhoMin(oc) }; });
    for (const p of newP) {
      if (!inFrame(p.box)) return ['obj-frame'];
      if ([...P, ...newP].some((r) => r !== p && boxGap(r.box, p.box) < HARD.objGap)) return ['obj-obj'];
      if ([...P, ...newP].some((r) => r !== p && footsHit(r.foot, p.foot, HARD.footGap)) || Q.some((q) => footsHit(q.foot, p.foot, HARD.footGap))) return ['obj-foot'];
      if (Q.some((q) => boxGap(q.box, p.box) < HARD.occGap && !(q.rho > p.rho + HARD.behind) && silGap(q.hull, p.S) < HARD.occGap)) return ['obj-prop'];
    }
    for (const q of newQ) {
      if (propNearEye(q.oc)) return ['prop-eye'];
      if (P.some((p) => boxGap(p.box, q.box) < HARD.occGap && !(q.rho > p.rho + HARD.behind) && silGap(q.hull, p.S) < HARD.occGap)) return ['prop-obj'];
      if (P.some((p) => footsHit(p.foot, q.foot, HARD.footGap)) || Q.some((r) => footsHit(r.foot, q.foot, HARD.footGap))) return ['prop-foot'];
      if (newP.some((p) => footsHit(p.foot, q.foot, p.o.role === 'full' ? HARD.footGap : HARD.ownGap))) return ['prop-ownfoot'];
    }
    const allShapes = [...occs, ...props].map((oc, j) => occShape(oc, j));
    for (const p of newP) {
      const o = p.o, hid = hiddenBy(p.S, newQ.map((q) => occShape(q.oc, 1))), vis = visiblePart(p.S, hid);
      if (o.role === 'full' && newQ.length && (hid.some((v) => v) || polyDist(newQ[0].hull, vis.cx, vis.cy) > 1)) return ['backdrop'];
      p.vpts = vis.pts;
      if ([...P, ...newP].some((r) => r !== p && r.vpts && (r.o.role === 'answer' || o.role === 'answer') && boxGap(r.box, p.box) < HARD.visGap && visNear(p.vpts, r.vpts, HARD.visGap, 4))) return ['vis-gap'];
      if (o.role !== 'full') {
        const st = cutStats(p.S, hid, o.cut), cp = copyProblem(o.role, o.cut, st, vis, { core: coreExtent(p.S) }, newQ[0].hull);
        if (cp) return [`copy:${cp}:${newQ[0].oc.style}`];
        if (o.top && (st.lin < V.topLin[0] || st.lin > V.topLin[1])) return ['top-lin'];
      }
      if (o.role !== 'answer' && shadowShare(p.S, vis.vis, allShapes, L) > HARD.shadowMax) return ['shadow'];
    }
    return ['', newP, newQ];
  };
  const commit = (newP, newQ) => {
    const j0 = occs.length;
    for (const q of newQ) { occs.push(q.oc); Q.push(q); }
    for (const p of newP) { p.o.occ = p.o.role === 'full' ? -1 : j0; objs.push(p.o); P.push(p); }
  };
  const azimuth = (x) => Math.atan2(x - C.cx, C.f);
  const [dn, dm] = TH.depth;
  for (const G of groups) {
    let done = false;
    const tries = G.kind === 'lone' ? 9 : 6;
    for (let at = 0; at < tries && !done; at++) {
      const top = V !== HARD ? objs.find((o) => o.top) : null;
      const d = G.kind === 'far' ? u(rng, ...TH.far)
        : G.kind === 'lone' ? (top ? Math.hypot(top.x, top.z) * u(rng, ...V.loneFar) : at < 3 ? u(rng, dn - 0.2, dn + 0.5 * (dm - dn)) : at < 6 ? u(rng, dn, dm + 1.5) : u(rng, dn + 0.3 * (dm - dn), dm + 3.5))
        : V !== HARD && G.members.some((q) => q.topOnly) ? u(rng, dn, dn + 0.6 * (dm - dn))
          : G.members.some((q) => q.anchor) ? u(rng, dn, dn + 0.65 * (dm - dn)) : u(rng, dn, dm);
      const plan = G.kind === 'wall' ? fitWall(rng, theme, C, G.members, d) : G.kind === 'pillar' ? fitPillar(rng, theme, C, G.members, d)
        : G.kind === 'far' ? fitFar(rng, theme, d + 0.5) : fitLone(rng, d);
      if (!plan) { why(`fit-${G.kind}`); continue; }
      const f0 = plan.solve(0, COARSE);
      const blocked = [], SAFE = 4;
      const vOver = (a, b, g) => a[1] < b[3] + g && a[3] > b[1] - g;
      const blockBy = (bx, b, g) => { if (vOver(b, bx, g + SAFE)) blocked.push([b[0] - g - SAFE - bx[2], b[2] + g + SAFE - bx[0]]); };
      const gpOf = (ra, rb) => (ra === 'answer' || rb === 'answer' ? Math.max(HARD.objGap, HARD.visGap * 0.8) : HARD.objGap);
      const cb = f0.copies.map((o) => ({ box: objBox(C, theme, o), rho: copyRhoMax(objShapes(theme, o, 0)), role: o.role }));
      for (const c of cb) {
        for (const p of P) blockBy(c.box, p.box, gpOf(c.role, p.o.role));
        for (const q of Q) if (!(q.rho > c.rho + HARD.behind)) blockBy(c.box, q.box, HARD.occGap);
      }
      for (const oc of f0.props) { const bx = polyBox(occHull(C, oc)), rho = propRhoMin(oc); for (const p of P) if (!(rho > p.rho + HARD.behind)) blockBy(bx, p.box, HARD.occGap); }
      const lo = Math.max(...cb.map((c) => HARD.edge + SAFE - c.box[0])), hi = Math.min(...cb.map((c) => IMG.w - HARD.edge - SAFE - c.box[2]));
      const shift = hi > lo ? pickFree(rng, lo, hi, blocked, G.kind === 'far') : null;
      if (shift === null) { why(`no-room-${G.kind}`); continue; }
      const ca = Math.min(...cb.map((c) => c.box[0])), mid = (ca + Math.max(...cb.map((c) => c.box[2]))) / 2;
      let phi = azimuth(mid + shift) - azimuth(mid), fit = null;
      for (let it = 0; it < 2; it++) {
        fit = plan.solve(phi);
        const a1 = Math.min(...fit.copies.map((o) => objBox(C, theme, o)[0]));
        if (Math.abs(a1 - (ca + shift)) < 3) break;
        phi += azimuth(ca + shift) - azimuth(a1);
      }
      const res = check(fit.copies, fit.props);
      if (res[0]) { why(res[0]); continue; }
      commit(res[1], res[2]);
      done = true;
    }
    if (!done) { why(`group-fail:${G.kind}`); return null; }
  }
  if (theme === 'pumpkin') for (const o of objs) o.tone = r3(u(rng, ...HARD.tone));
  let sunOut = sun;
  if (rng.raw() < 0.5) {
    for (const o of objs) { o.x = r3(-o.x); o.yaw = r2(-o.yaw); if (o.cut === 'left') o.cut = 'right'; else if (o.cut === 'right') o.cut = 'left'; }
    for (const oc of occs) { oc.x = r3(-oc.x); oc.yaw = oc.kind === 'trunk' ? 0 : r2(-oc.yaw); }
    sunOut = { az: r2(-sun.az), el: sun.el };
  }
  const oOrder = rng.shuffle(objs.map((_, i) => i)), pOrder = rng.shuffle(occs.map((_, j) => j));
  const pInv = []; pOrder.forEach((j, k) => { pInv[j] = k; });
  const rd = { theme, cam, sun: sunOut, look, objs: oOrder.map((i) => { const o = { ...objs[i], occ: objs[i].occ >= 0 ? pInv[objs[i].occ] : -1 }; delete o.top; return o; }), occs: pOrder.map((j) => occs[j]), answer: [], pts: [] };
  if (V !== HARD) rd.hard = V.tag;
  rd.answer = rd.objs.map((o, i) => (o.role === 'answer' ? i : -1)).filter((i) => i >= 0);
  rd.pts = measure(rd).objs.map((O) => (O.vis.anchor ? [r2(O.vis.anchor[0]), r2(O.vis.anchor[1])] : [0, 0]));
  const rp = roundProblem(rd);
  if (rp !== '') { why(`round:${rp}`); return null; }
  return rd;
}
function makeRound(rng, theme, isTight = false) {
  const keep = V;
  V = isTight ? TIGHT : HARD;
  try { return makeRoundIn(rng, theme, isTight); } finally { V = keep; }
}
function makeRoundIn(rng, theme, isTight) {
  const r = rng.raw();
  let nAns = isTight ? (r < 0.5 ? 2 : 3) : r < 0.3 ? 1 : r < 0.6 ? 2 : 3;
  for (let a = 0; a < 600; a++) {
    if (nAns === 1 && a === 100) nAns = rng.raw() < 0.5 ? 2 : 3;
    const rd = tryRound(rng, theme, null, nAns);
    if (rd) return rd;
  }
  throw new Error('mostly_hidden_tap: sampler exhausted');
}
export const _internals = { HARD, THEME_NAMES, measure, luminance, objectAt, tapSquares, roundProblem, tryRound, makeRound, composition, groupsFor,
  fitWall, fitPillar };

export function gate(m) {
  if (!m || m.task !== 'mostly_hidden_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (m.rounds !== undefined) return false;
  const { task, board, ...rd0 } = m;
  let why;
  try { why = roundProblem(JSON.parse(JSON.stringify(rd0))); } catch { why = 'malformed'; }
  return why === '';
}

export function semanticKey(m) {
  const q = (v) => Math.round(v / 0.6);
  const pk = m.occs.map((o) => `${o.style}@${q(o.x)},${q(o.z)}`);
  const ok = m.objs.map((o) => `${o.role}:${o.cut || '-'}:${o.occ >= 0 && pk[o.occ] ? pk[o.occ] : '-'}@${q(o.x)},${q(o.z)}`);
  return `mostly_hidden_tap|${m.theme}|${pk.slice().sort().join(';')}|${ok.sort().join(';')}`;
}
const EVAL_KEYS = new Set(["f6b713f2", "1a05c8ba", "ce9f9bb3", "cf0d171e", "45fc3193", "2a7ca8da", "30dbc0d3", "1adb1b80", "2cb1ff41", "27cdd947", "a900c85b", "7ec5e47f"]);

const promptFor = (theme) => ({ main: `Tap every ${THEMES[theme].noun} that is mostly hidden`, sub: `All the ${THEMES[theme].plural} are the same size` });

export default {
  meta: {
    name: 'mostly_hidden_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${IMG.w} board px`, y: `0..${IMG.h} board px`, note: 'select / unselect the copy whose visible part is nearest (within 26 px)' },
    ],
    promptHuman: 'Tap every penguin/pumpkin that is mostly hidden',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      for (let a = 0; a < 400; a++) {
        const theme = THEME_NAMES[rng.raw() < 0.5 ? 0 : 1];
        const m = { task: 'mostly_hidden_tap', board: { ...BOARD }, ...makeRound(rng, theme) };
        if (K.keyAccept(semanticKey(m), knobs.ext, EVAL_KEYS)) return m;
      }
      throw new Error('mostly_hidden_tap: no training instance');
    }
    const theme = THEME_NAMES[rng.raw() < 0.5 ? 0 : 1];
    return { task: 'mostly_hidden_tap', board: { ...BOARD }, ...makeRound(rng, theme, true) };
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = objectAt(m, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-object' };
    const sel = s.sel, k = sel.indexOf(id);
    if (k >= 0) sel.splice(k, 1); else sel.push(id);
    return { ok: true };
  },

  verify(s, m) {
    const success = [...new Set(s.sel || [])].sort((a, b) => a - b).join(',') === m.answer.join(',');
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { selected: (s.sel || []).length } };
  },

  oracle(m) {
    return m.answer.map((i) => ({ op: 'tap', x: m.pts[i][0], y: m.pts[i][1] }));
  },

  randomPolicy(m, rnd) {
    const acts = [];
    m.objs.forEach((_, i) => { if (rnd() < 0.5) acts.push({ op: 'tap', x: m.pts[i][0], y: m.pts[i][1] }); });
    return acts;
  },

  featureGeometry(m) {
    const features = [];
    const sq = tapSquares(m, 1);
    m.objs.forEach((o, i) => features.push({ id: `copy${i + 1}-${o.role}`, kind: 'target', effectiveWidthPx: sq[i], effectiveHeightPx: sq[i],
      source: 'largest square inside the copy\'s tap region: points whose nearest visible sample (of all copies) is this copy\'s, within 26 px, inside the picture' }));
    return { featureRequirements: ['target'], features,
      coverage: { complete: true, scope: 'every copy (answers, light and full distractors) after the nearest-first split' } };
  },

  firstFrameBackground: { checkpoint: 'board', description: 'Only the flat board fill is background. The rendered picture (ground, sea or tree line, sky, props, the copies and their shadows), and the selection rings are foreground.' },

  async mount(env) {
    env.assets.mht = { key: '', canvas: null };
    if (env.style) {
      let look = null;
      for (let v = 0; v < 8 && !look; v++) { const L = await styleLook(env.style, env.manifest, v); if (styledLumOk(env.manifest, L)) look = L; }
      env.assets.look = look;
      if (!look) env.style.note('look:default(lum)');
    }
  },

  drawPrompt(g, r, env) {
    const P = promptFor(env.manifest.theme);
    drawPromptText(g, r, P.main, P.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.mht || (env.assets.mht = {});
    const rd = m, q = contextScale(g);
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.__firstFrameBackground?.('board');
    const look = env.style ? env.assets.look || null : null;
    const key = `${q}|${JSON.stringify(rd.cam)}|${rd.objs.length}${look ? '|' + env.style.key : ''}`;
    if (A.key !== key) { A.canvas = toCanvas(render(look ? buildScene(rd, look) : buildScene(rd), q)); A.key = key; }
    g.drawImage(A.canvas, 0, 0, IMG.w, IMG.h);
    for (const id of s.sel) {
      const [x, y] = rd.pts[id];
      g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3.6; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (objectAt(env.manifest, e.x, e.y) < 0) return [];
    return [{ op: 'tap', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} selected`;
  },
};
