import { drawPromptText, ACCENT, UI_FONT } from '../core/panel.js';
import { normDeg } from '../core/geom.js';
import { makeCamera, shade3 } from '../common/_proj3d.js';
import { splitIds, nthOf } from '../core/style.js';

const BOARD = { w: 340, h: 280 };
const HARD = { minBars: 12, maxBars: 16 };
const CAM = { cx: 170, cy: 138, dist: 430, fov: 255, minDepth: 80 };
const BASE = '#d9822b';
const TOL = 8;
const FAR = 24;
const START_MIN = 50;
const FAR_RES = 0.15, WIDE = 60, WIDE_RES = 0.3;
const SNAP_MARGIN = 1;
const rad = (d) => d * Math.PI / 180;
const angErr = (a) => Math.abs(normDeg(a));

const NEW = {
  minBars: 18, maxBars: 22,
  D: 470, fov: 255, cx: 154, cy: 140, minDepth: 80, depth: 137,
  pMin: 8, pMax: 62,
  trueP: [16, 54],
  PTOL: 6,
  PFAR: 20,
  startP: [11, 18],
  xMax: 292,
};
const PS = { x: 314, y: 34, w: 18, h: 214 };
export const PITCH_SLIDER = PS;
const pitchOf = (p) => NEW.pMin + Math.min(1, Math.max(0, p)) * (NEW.pMax - NEW.pMin);
const sliderOf = (pitch) => (pitch - NEW.pMin) / (NEW.pMax - NEW.pMin);

const camAt = (yaw, pitch) => makeCamera({
  yaw, pitch, dist: CAM.dist, cx: CAM.cx, cy: CAM.cy, fov: CAM.fov, minDepth: CAM.minDepth,
});
function camSph(yaw, pitch) {
  const a = rad(yaw), p = rad(pitch), D = NEW.D;
  const cam = { x: Math.sin(a) * Math.cos(p) * D, y: Math.sin(p) * D, z: Math.cos(a) * Math.cos(p) * D };
  const f = { x: -cam.x / D, y: -cam.y / D, z: -cam.z / D };
  const rl = Math.hypot(f.z, f.x) || 1, r = { x: -f.z / rl, y: 0, z: f.x / rl };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const project = (q0) => {
    const qx = q0.x - cam.x, qy = q0.y - cam.y, qz = q0.z - cam.z;
    const depth = qx * f.x + qy * f.y + qz * f.z, s = NEW.fov / Math.max(NEW.minDepth, depth);
    return { x: NEW.cx + (qx * r.x + qy * r.y + qz * r.z) * s, y: NEW.cy - (qx * u.x + qy * u.y + qz * u.z) * s, depth };
  };
  return { cam, f, r, u, project };
}
function unproject(cam, sx, sy, depth, K = CAM) {
  const kr = (sx - K.cx) * depth / K.fov, ku = (K.cy - sy) * depth / K.fov;
  return {
    x: cam.cam.x + kr * cam.r.x + ku * cam.u.x + depth * cam.f.x,
    y: cam.cam.y + kr * cam.r.y + ku * cam.u.y + depth * cam.f.y,
    z: cam.cam.z + kr * cam.r.z + ku * cam.u.z + depth * cam.f.z,
  };
}

function starCorners(star) {
  const th0 = rad(-90 + star.phase), out = [];
  for (let a = 0; a < 5; a++) {
    const ao = th0 + rad(72 * a), ai = th0 + rad(72 * a + 36);
    out.push({ x: star.cx + Math.cos(ao) * star.R, y: star.cy + Math.sin(ao) * star.R });
    out.push({ x: star.cx + Math.cos(ai) * star.r, y: star.cy + Math.sin(ai) * star.r });
  }
  return out;
}
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

function d5perms() {
  const perms = [];
  for (let refl = 0; refl < 2; refl++) for (let j = 0; j < 5; j++) {
    const p = new Array(10);
    for (let a = 0; a < 5; a++) {
      const oa = refl ? ((j - a) % 5 + 5) % 5 : (a + j) % 5;
      const ia = refl ? ((j - a - 1) % 5 + 5) % 5 : (a + j) % 5;
      p[2 * a] = 2 * oa; p[2 * a + 1] = 2 * ia + 1;
    }
    perms.push(p);
  }
  return perms;
}
const D5 = d5perms();

function simResidual(src, tgt) {
  const n = src.length;
  let sx = 0, sy = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) { sx += src[i].x; sy += src[i].y; tx += tgt[i].x; ty += tgt[i].y; }
  sx /= n; sy /= n; tx /= n; ty /= n;
  let varS = 0, tgtSq = 0;
  let a1 = 0, b1 = 0, a2 = 0, b2 = 0;
  const S = [], T = [];
  for (let i = 0; i < n; i++) {
    const zsx = src[i].x - sx, zsy = src[i].y - sy, ztx = tgt[i].x - tx, zty = tgt[i].y - ty;
    S.push({ x: zsx, y: zsy }); T.push({ x: ztx, y: zty });
    varS += zsx * zsx + zsy * zsy; tgtSq += ztx * ztx + zty * zty;
    a1 += zsx * ztx + zsy * zty; b1 += zsx * zty - zsy * ztx;
    a2 += zsx * ztx - zsy * zty; b2 += zsx * zty + zsy * ztx;
  }
  if (varS < 1e-6 || tgtSq < 1e-6) return 1;
  const spread = Math.sqrt(varS / n), tgtR = Math.sqrt(tgtSq / n);
  if (spread < 0.2 * tgtR) return 1;
  const resFor = (a, b, mir) => {
    const wr = a / varS, wi = b / varS; let res = 0;
    for (let i = 0; i < n; i++) {
      const zx = S[i].x, zy = mir ? -S[i].y : S[i].y;
      const rx = wr * zx - wi * zy, ry = wr * zy + wi * zx;
      res += (rx - T[i].x) ** 2 + (ry - T[i].y) ** 2;
    }
    return res;
  };
  const res = Math.min(resFor(a1, b1, false), resFor(a2, b2, true));
  return Math.sqrt(res / tgtSq);
}
function starResidual(pts, corners) {
  let best = Infinity;
  for (const perm of D5) {
    const tgt = perm.map((c) => corners[c]);
    best = Math.min(best, simResidual(pts, tgt));
    if (best < 1e-4) break;
  }
  return best;
}

const viewYaw = (rd, v) => normDeg(rd.frontYaw + rd.startOff + v * 360);
const viewPitch = (rd, st) => (rd.startPitch !== undefined ? pitchOf(st.p) : rd.pitch);

function farMargin(bars, corners, cornerRep, frontYaw, pitch) {
  let margin = Infinity;
  for (let d = FAR; d <= 360 - FAR; d += 3) {
    const cam = camAt(normDeg(frontYaw + d), pitch), need = angErr(d) >= WIDE ? WIDE_RES : FAR_RES;
    margin = Math.min(margin, starResidual(cornerRep.map((c) => cam.project(c)), corners) / need);
  }
  return margin;
}
function farMargin2(corners, cornerRep, frontYaw, pitch) {
  let margin = Infinity;
  for (let d = 0; d < 360; d += 3) {
    const ye = angErr(d);
    for (let pp = NEW.pMin; pp <= NEW.pMax + 1e-9; pp += 3) {
      if (ye < FAR && Math.abs(pp - pitch) < NEW.PFAR) continue;
      const cam = camSph(normDeg(frontYaw + d), pp), need = ye >= WIDE ? WIDE_RES : FAR_RES;
      margin = Math.min(margin, starResidual(cornerRep.map((c) => cam.project(c)), corners) / need);
      if (margin < SNAP_MARGIN) return margin;
    }
  }
  return margin;
}
function inFrame(pts) {
  for (let d = 0; d < 360; d += 10) for (const pp of [NEW.pMin, 20, 35, 50, NEW.pMax]) {
    const cam = camSph(d, pp);
    for (const p of pts) { const q = cam.project(p); if (q.depth < 150 || q.x < 14 || q.x > NEW.xMax || q.y < 14 || q.y > BOARD.h - 14) return false; }
  }
  return true;
}

function makeRound2(rng) {
  for (let attempt = 0; attempt < 800; attempt++) {
    const star = { cx: NEW.cx, cy: NEW.cy, R: +rng.uniform(70, 80).toFixed(2), r: 0, phase: +rng.uniform(0, 72).toFixed(2) };
    star.r = +(star.R * rng.uniform(0.38, 0.44)).toFixed(2);
    const corners = starCorners(star);
    const nBars = rng.int(NEW.minBars, NEW.maxBars);
    const extra = new Array(10).fill(0);
    for (let left = nBars - 10; left > 0;) { const e = rng.int(0, 9); if (extra[e] < 2) { extra[e]++; left--; } }
    const cuts = [];
    for (let e = 0; e < 10; e++) {
      cuts.push({ pos: corners[e], corner: e });
      const b = corners[(e + 1) % 10], k = extra[e];
      for (let q = 1; q <= k; q++) { const t = q / (k + 1); cuts.push({ pos: { x: corners[e].x + (b.x - corners[e].x) * t, y: corners[e].y + (b.y - corners[e].y) * t }, corner: -1 }); }
    }
    const frontYaw = +normDeg(rng.uniform(0, 360)).toFixed(2);
    const pitch = +rng.uniform(NEW.trueP[0], NEW.trueP[1]).toFixed(2);
    const cam0 = camSph(frontYaw, pitch);
    const pts = cuts.map((c) => unproject(cam0, c.pos.x, c.pos.y, NEW.D + rng.uniform(-NEW.depth, NEW.depth), NEW));
    if (!inFrame(pts)) continue;
    const cornerRep = [];
    cuts.forEach((c, i) => { if (c.corner >= 0) cornerRep[c.corner] = pts[i]; });
    const margin = farMargin2(corners, cornerRep, frontYaw, pitch);
    if (margin < SNAP_MARGIN) continue;
    const off = rng.uniform(NEW.startP[0], NEW.startP[1]);
    const ups = [pitch + off, pitch - off].filter((p) => p >= NEW.pMin && p <= NEW.pMax);
    if (!ups.length) continue;
    const startPitch = +rng.pick(ups).toFixed(2);
    const startOff = +(rng.sign() * rng.uniform(START_MIN, 180)).toFixed(2);
    const floorY = Math.min(...pts.map((p) => p.y)) - 30;
    const r2 = (p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    return {
      frontYaw, pitch, startOff, startPitch, floorY: +floorY.toFixed(2),
      star: { cx: star.cx, cy: star.cy, R: star.R, r: star.r, phase: star.phase },
      bars: pts.map((a, i) => ({ a: r2(a), b: r2(pts[(i + 1) % pts.length]) })),
      margin: +margin.toFixed(3),
    };
  }
  throw new Error('viewpoint_snap: no valid star');
}

export function gate(m) {
  if (!m || m.task !== 'viewpoint_snap' || m.rounds?.length !== 1) return false;
  if (m.ext) return gateExt(m);
  const rd = m.rounds[0];
  if (!(Array.isArray(rd.bars) && rd.bars.length >= NEW.minBars && rd.bars.length <= NEW.maxBars)) return false;
  if (!(Number.isFinite(rd.frontYaw) && rd.pitch >= NEW.trueP[0] && rd.pitch <= NEW.trueP[1] && Number.isFinite(rd.startOff))) return false;
  if (!(rd.startPitch >= NEW.pMin && rd.startPitch <= NEW.pMax)) return false;
  const po = Math.abs(rd.startPitch - rd.pitch);
  if (po < NEW.startP[0] - 0.01 || po > NEW.startP[1] + 0.01) return false;
  if (angErr(rd.startOff) < START_MIN - 1e-6) return false;
  if (!(rd.star && rd.star.R >= 70 && rd.star.R <= 80 && rd.star.r > 0 && Number.isFinite(rd.floorY))) return false;
  if (!rd.bars.every((s) => s.a && s.b && [s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z].every(Number.isFinite))) return false;
  const C = starCorners(rd.star), c0 = camSph(rd.frontYaw, rd.pitch);
  const ep = rd.bars.flatMap((s) => [c0.project(s.a), c0.project(s.b)]);
  const distOut = (p) => Math.min(...C.map((c, i) => segDist(p, c, C[(i + 1) % 10])));
  if (!ep.every((p) => distOut(p) <= 1.8)) return false;
  const rep = C.map((c) => { let best = null, bd = Infinity; for (const s of rd.bars) for (const w of [s.a, s.b]) { const p = c0.project(w), d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = w; } } return bd <= 1.8 ? best : null; });
  if (rep.some((w) => !w)) return false;
  if (!inFrame(rd.bars.map((s) => s.a))) return false;
  return farMargin2(C, rep, rd.frontYaw, rd.pitch) >= SNAP_MARGIN - 1e-3;
}

const SHAPES = {
  star5: { noun: 'star', star: [5, 0.38, 0.44] },
  star6: { noun: 'six-pointed star', star: [6, 0.5, 0.58] },
  star4: { noun: 'four-pointed star', star: [4, 0.34, 0.42] },
  house: { noun: 'house', pts: [[-0.7, 0.75], [0.7, 0.75], [0.7, -0.05], [0, -0.8], [-0.7, -0.05]] },
  arrow: { noun: 'arrow', pts: [[-0.85, -0.22], [0.25, -0.22], [0.25, -0.62], [0.9, 0], [0.25, 0.62], [0.25, 0.22], [-0.85, 0.22]] },
  plus: { noun: 'plus sign', pts: [[-0.28, -0.9], [0.28, -0.9], [0.28, -0.28], [0.9, -0.28], [0.9, 0.28], [0.28, 0.28], [0.28, 0.9], [-0.28, 0.9], [-0.28, 0.28], [-0.9, 0.28], [-0.9, -0.28], [-0.28, -0.28]] },
  letterL: { noun: 'letter L', pts: [[-0.6, -0.9], [-0.12, -0.9], [-0.12, 0.42], [0.65, 0.42], [0.65, 0.9], [-0.6, 0.9]] },
  letterT: { noun: 'letter T', pts: [[-0.8, -0.85], [0.8, -0.85], [0.8, -0.42], [0.22, -0.42], [0.22, 0.9], [-0.22, 0.9], [-0.22, -0.42], [-0.8, -0.42]] },
  bolt: { noun: 'lightning bolt', pts: [[0.15, -0.95], [-0.6, 0.12], [-0.05, 0.12], [-0.3, 0.95], [0.6, -0.18], [0.05, -0.18]] },
  tree: { noun: 'Christmas tree', pts: [[0, -0.95], [0.45, -0.35], [0.2, -0.35], [0.62, 0.25], [0.15, 0.25], [0.15, 0.82], [-0.15, 0.82], [-0.15, 0.25], [-0.62, 0.25], [-0.2, -0.35], [-0.45, -0.35]] },
  crown: { noun: 'crown', pts: [[-0.8, 0.6], [0.8, 0.6], [0.8, -0.62], [0.4, -0.05], [0, -0.78], [-0.4, -0.05], [-0.8, -0.62]] },
  heart: { noun: 'heart', pts: [[0, 0.85], [-0.62, 0.22], [-0.86, -0.22], [-0.72, -0.62], [-0.34, -0.76], [0, -0.45], [0.34, -0.76], [0.72, -0.62], [0.86, -0.22], [0.62, 0.22]] },
  fish: { noun: 'fish', pts: [[0.9, 0], [0.3, -0.48], [-0.38, -0.1], [-0.88, -0.52], [-0.72, 0], [-0.88, 0.52], [-0.38, 0.1], [0.3, 0.48]] },
};
const SHAPE_IDS = Object.keys(SHAPES);
export const shapeSplit = splitIds('g16_vp_shape', SHAPE_IDS, 2);
export const shapeNoun = (id) => { const n = (SHAPES[id] || SHAPES.star5).noun; return (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n; };
export function shapeCorners(sp) {
  const S = SHAPES[sp.id], th0 = rad(-90 + sp.phase), out = [];
  if (S.star) {
    const n = S.star[0], step = 360 / n;
    for (let a = 0; a < n; a++) {
      const ao = th0 + rad(step * a), ai = th0 + rad(step * a + step / 2);
      out.push({ x: sp.cx + Math.cos(ao) * sp.R, y: sp.cy + Math.sin(ao) * sp.R });
      out.push({ x: sp.cx + Math.cos(ai) * sp.R * sp.ratio, y: sp.cy + Math.sin(ai) * sp.R * sp.ratio });
    }
    return out;
  }
  const c = Math.cos(rad(sp.phase)), s2 = Math.sin(rad(sp.phase));
  for (const [x, y] of S.pts) out.push({ x: sp.cx + sp.R * (c * x - s2 * y), y: sp.cy + sp.R * (s2 * x + c * y) });
  return out;
}
const permCache = new Map();
function relabels(n) {
  if (!permCache.has(n)) {
    const out = [];
    for (let k = 0; k < n; k++) { out.push(Array.from({ length: n }, (_, i) => (i + k) % n)); out.push(Array.from({ length: n }, (_, i) => ((k - i) % n + n) % n)); }
    permCache.set(n, out);
  }
  return permCache.get(n);
}
function shapeResidual(pts, corners) {
  let best = Infinity;
  for (const perm of relabels(corners.length)) {
    best = Math.min(best, simResidual(pts, perm.map((c) => corners[c])));
    if (best < 1e-4) break;
  }
  return best;
}
function farMarginExt(corners, cornerRep, frontYaw, pitch) {
  let margin = Infinity;
  for (let d = FAR; d <= 360 - FAR; d += 3) {
    const cam = camAt(normDeg(frontYaw + d), pitch), need = angErr(d) >= WIDE ? WIDE_RES : FAR_RES;
    margin = Math.min(margin, shapeResidual(cornerRep.map((c) => cam.project(c)), corners) / need);
    if (margin < SNAP_MARGIN) return margin;
  }
  return margin;
}
const EVAL_KEYS = new Set(["viewpoint_snap|star5|y12|s3|p7|b14", "viewpoint_snap|star5|y14|s3|p6|b12", "viewpoint_snap|star5|y23|s-2|p7|b16", "viewpoint_snap|star5|y15|s-3|p6|b14", "viewpoint_snap|star5|y20|s5|p6|b15", "viewpoint_snap|star5|y3|s4|p6|b12", "viewpoint_snap|star5|y18|s-3|p5|b14", "viewpoint_snap|star5|y12|s-4|p5|b12", "viewpoint_snap|star5|y13|s4|p6|b16", "viewpoint_snap|star5|y20|s-6|p5|b16", "viewpoint_snap|star5|y12|s-4|p7|b16", "viewpoint_snap|star5|y21|s4|p6|b12"]);
const EXT_BARS = [HARD.minBars, HARD.maxBars];
function makeRoundExt(rng, split, n) {
  const pool = SHAPE_IDS.filter((k) => shapeSplit(k) === split);
  const N = pool.length * 12, k = Number.isFinite(Number(n)) && Number(n) >= 1 ? nthOf(`viewpoint_snap|${split}|shape_heading`, n, N) : -1;
  for (let attempt = 0; attempt < 900; attempt++) {
    const fixed = k >= 0 && attempt < 700;
    const id = fixed ? pool[k % pool.length] : rng.pick(pool), S = SHAPES[id];
    const sp = { id, cx: CAM.cx, cy: CAM.cy, R: +rng.uniform(74, 84).toFixed(2), ratio: S.star ? +rng.uniform(S.star[1], S.star[2]).toFixed(3) : 1, phase: +rng.uniform(S.star ? 0 : -25, S.star ? 360 / S.star[0] : 25).toFixed(2) };
    const corners = shapeCorners(sp), nC = corners.length;
    if (nC > EXT_BARS[1]) continue;
    const nBars = rng.int(Math.max(EXT_BARS[0], nC), EXT_BARS[1]);
    const extra = new Map();
    for (const e of rng.sample([...Array(nC).keys()], Math.min(nC, nBars - nC))) extra.set(e, 1);
    for (let left = nBars - nC - extra.size; left > 0; left--) { const e = rng.int(0, nC - 1); extra.set(e, (extra.get(e) || 0) + 1); }
    const cuts = [];
    for (let e = 0; e < nC; e++) {
      cuts.push({ pos: corners[e], corner: e });
      const k = extra.get(e) || 0, b = corners[(e + 1) % nC];
      for (let q = 1; q <= k; q++) { const t = q / (k + 1); cuts.push({ pos: { x: corners[e].x + (b.x - corners[e].x) * t, y: corners[e].y + (b.y - corners[e].y) * t }, corner: -1 }); }
    }
    const frontYaw = +normDeg(fixed ? Math.floor(k / pool.length) * 30 + rng.uniform(0, 30) : rng.uniform(0, 360)).toFixed(2);
    const pitch = +rng.uniform(23, 35).toFixed(2);
    const cam0 = camAt(frontYaw, pitch);
    const pts = cuts.map((c) => unproject(cam0, c.pos.x, c.pos.y, rng.uniform(330, 545)));
    const cornerRep = [];
    cuts.forEach((c, i) => { if (c.corner >= 0) cornerRep[c.corner] = pts[i]; });
    const startOff0 = +(rng.sign() * rng.uniform(START_MIN, 180)).toFixed(2);
    if (EVAL_KEYS.has(semanticKey({ rounds: [{ shape: sp, frontYaw, startOff: startOff0, pitch, bars: cuts }] }))) continue;
    let ok = true;
    for (let d = 0; d < 360 && ok; d += 10) {
      const cam = camAt(normDeg(frontYaw + d), pitch);
      for (const p of pts) { const q = cam.project(p); if (q.depth < 150 || q.x < 14 || q.x > BOARD.w - 14 || q.y < 14 || q.y > BOARD.h - 14) { ok = false; break; } }
    }
    if (!ok) continue;
    const margin = farMarginExt(corners, cornerRep, frontYaw, pitch);
    if (margin < SNAP_MARGIN) continue;
    const floorY = Math.min(...pts.map((p) => p.y)) - 30;
    const startOff = startOff0;
    return {
      frontYaw, pitch, startOff, floorY: +floorY.toFixed(2), shape: sp,
      bars: pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { a: { x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2) }, b: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) } }; }),
      margin: +margin.toFixed(3),
    };
  }
  return null;
}
function gateExt(m) {
  const rd = m.rounds[0], sp = rd.shape;
  if (!sp || !SHAPES[sp.id] || !(sp.R >= 74 && sp.R <= 84) || !Number.isFinite(sp.phase) || !(sp.ratio > 0)) return false;
  if (!(Array.isArray(rd.bars) && rd.bars.length >= EXT_BARS[0] && rd.bars.length <= EXT_BARS[1])) return false;
  if (!(Number.isFinite(rd.frontYaw) && rd.pitch >= 23 && rd.pitch <= 35 && Number.isFinite(rd.startOff) && Number.isFinite(rd.floorY))) return false;
  if (angErr(rd.startOff) < START_MIN - 1e-6) return false;
  if (!rd.bars.every((q) => q.a && q.b && [q.a.x, q.a.y, q.a.z, q.b.x, q.b.y, q.b.z].every(Number.isFinite))) return false;
  const C = shapeCorners(sp), n = C.length, c0 = camAt(rd.frontYaw, rd.pitch);
  const ep = rd.bars.flatMap((q) => [c0.project(q.a), c0.project(q.b)]);
  const distOut = (p) => Math.min(...C.map((c, i) => segDist(p, c, C[(i + 1) % n])));
  if (!ep.every((p) => distOut(p) <= 1.8)) return false;
  const rep = C.map((c) => { let best = null, bd = Infinity; for (const q of rd.bars) for (const w of [q.a, q.b]) { const p = c0.project(w), d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = w; } } return bd <= 1.8 ? best : null; });
  if (rep.some((w) => !w)) return false;
  return farMarginExt(C, rep, rd.frontYaw, rd.pitch) >= SNAP_MARGIN - 1e-3;
}

function drawRod(g, pa, pb, w, colour) {
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(40,28,16,.55)'; g.lineWidth = w + 1.6;
  g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
  g.strokeStyle = colour; g.lineWidth = w;
  g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
  const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1, ox = (dy / L) * w * 0.22, oy = (-dx / L) * w * 0.22;
  const s = oy < 0 ? 1 : -1;
  g.strokeStyle = 'rgba(255,236,205,.55)'; g.lineWidth = Math.max(1, w * 0.28);
  g.beginPath(); g.moveTo(pa.x + s * ox, pa.y + s * oy); g.lineTo(pb.x + s * ox, pb.y + s * oy); g.stroke();
}
function drawPitchSlider(g, p, active) {
  const x = PS.x, y = PS.y, w = PS.w, h = PS.h, cx = x + w / 2;
  g.save();
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, w / 2) : g.rect(x, y, w, h);
  g.fillStyle = 'rgba(247,249,250,.92)'; g.fill(); g.strokeStyle = '#cfd6dd'; g.lineWidth = 1; g.stroke();
  const ky = y + w / 2 + (1 - p) * (h - w);
  g.beginPath(); g.roundRect ? g.roundRect(x + 3, ky, w - 6, y + h - w / 2 - ky, (w - 6) / 2) : g.rect(x + 3, ky, w - 6, y + h - w / 2 - ky);
  g.fillStyle = 'rgba(25,145,250,.22)'; g.fill();
  g.beginPath(); g.arc(cx, ky, 11, 0, Math.PI * 2);
  g.fillStyle = active ? ACCENT : '#fff'; g.shadowColor = 'rgba(20,60,120,.3)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5; g.fill();
  g.shadowColor = 'transparent'; g.strokeStyle = active ? ACCENT : '#c4ccd4'; g.lineWidth = 1.2; g.stroke();
  g.strokeStyle = active ? '#fff' : '#7d8a96'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - 4, ky - 2.5); g.lineTo(cx, ky - 6); g.lineTo(cx + 4, ky - 2.5); g.moveTo(cx - 4, ky + 2.5); g.lineTo(cx, ky + 6); g.lineTo(cx + 4, ky + 2.5); g.stroke();
  g.font = `600 9.5px ${UI_FONT}`; g.fillStyle = '#6f7d8a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('high', cx, y - 11); g.fillText('low', cx, y + h + 11);
  g.restore();
}

const task = {
  meta: {
    name: 'viewpoint_snap', family: 'D', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'slider', board: BOARD,
    sliderHint: 'Slide to walk around',
    actionSpace: [
      { op: 'turn', v: '0..1 footer slider (full track = one full turn around the sticks)', final: 'true on release' },
      { op: 'tilt', p: '0..1 side slider (0 = lowest view, 1 = highest view)', final: 'true on release' },
    ],
    promptHuman: 'Turn and raise or lower the view until the sticks form a five-pointed star',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs && knobs.ext) { const rd = makeRoundExt(rng, knobs.ext, knobs.n); if (rd) return { task: 'viewpoint_snap', board: BOARD, ext: 1, rounds: [rd] }; }
    return { task: 'viewpoint_snap', board: BOARD, rounds: [makeRound2(rng)] };
  },

  init(m) {
    const rd = m?.rounds?.[0];
    return { v: 0, p: rd && rd.startPitch !== undefined ? +sliderOf(rd.startPitch).toFixed(4) : 0.5, released: false };
  },

  applyAction(state, action, m) {
    if (action.op === 'turn' && Number.isFinite(action.v)) state.v = Math.min(1, Math.max(0, action.v));
    else if (action.op === 'tilt' && Number.isFinite(action.p) && !m?.ext) state.p = Math.min(1, Math.max(0, action.p));
    else return { ok: false, reason: 'bad-op' };
    if (action.final) state.released = true;
    return { ok: true };
  },

  verify(state, m) {
    const rd = m.rounds[0], err = angErr(viewYaw(rd, state.v) - rd.frontYaw);
    const pErr = Math.abs(viewPitch(rd, state) - rd.pitch);
    const success = state.released && err <= TOL && pErr <= (rd.startPitch !== undefined ? NEW.PTOL : 0.01);
    return { success, error: +(err + pErr).toFixed(2), partial: success ? 1 : Math.max(0, 1 - (err + pErr) / 180), detail: { offDeg: +err.toFixed(2), pitchOffDeg: +pErr.toFixed(2) } };
  },

  oracle(m) {
    const rd = m.rounds[0], v = ((360 - ((rd.startOff % 360) + 360) % 360) % 360) / 360;
    if (rd.startPitch === undefined) return [{ op: 'turn', v: +v.toFixed(4), final: true }];
    return [{ op: 'turn', v: +v.toFixed(4), final: true }, { op: 'tilt', p: +sliderOf(rd.pitch).toFixed(4), final: true }];
  },

  randomPolicy(m, rnd) {
    if (m.ext) return [{ op: 'turn', v: +rnd().toFixed(4), final: true }];
    return [{ op: 'turn', v: +rnd().toFixed(4), final: true }, { op: 'tilt', p: +rnd().toFixed(4), final: true }];
  },

  onSlider(env, v, phase, hooks) {
    hooks.dispatch({ op: 'turn', v, ...(phase === 'up' ? { final: true } : {}) });
  },

  pointer(evt, env) {
    if (env.manifest.ext) return [];
    const pOf = (y) => Math.min(1, Math.max(0, 1 - (y - PS.y - PS.w / 2) / (PS.h - PS.w)));
    if (evt.type === 'down' && evt.x >= PS.x - 12 && evt.x <= PS.x + PS.w + 8 && evt.y >= PS.y - 14 && evt.y <= PS.y + PS.h + 14) {
      this._tilt = true; return [{ op: 'tilt', p: +pOf(evt.y).toFixed(4) }];
    }
    if (evt.type === 'move' && this._tilt) return [{ op: 'tilt', p: +pOf(evt.y).toFixed(4) }];
    if (evt.type === 'up' && this._tilt) { this._tilt = false; return [{ op: 'tilt', p: +pOf(evt.y).toFixed(4), final: true }]; }
    return [];
  },
  wantsMoveRedraw: true,

  featureGeometry() {
    return { featureRequirements: ['target'], features: [{ id: 'panel-slider', kind: 'target', effectiveWidthPx: 56, effectiveHeightPx: 40 }, { id: 'pitch-slider', kind: 'target', effectiveWidthPx: 22, effectiveHeightPx: 22 }],
      coverage: { complete: true, scope: 'The footer slider turns the view; the vertical slider at the board\'s right edge raises or lowers it.' } };
  },

  async mount(env) {
    if (!env || !env.style || !env.manifest?.ext) return;
    const L = await import('../common/_viewpoint_snap_look.js');
    env.assets.vpLook = await L.buildVpLook(L.chooseVpLook(env.style));
    env.assets.vpDraw = L.drawVpBoard;
  },

  drawPrompt(g, r, env) {
    const m = env?.manifest;
    if (m && m.ext) { drawPromptText(g, r, `Turn the view until the sticks form ${shapeNoun(m.rounds[0].shape.id)}`, 'The sticks hang in the air'); return; }
    drawPromptText(g, r, 'Move the view until the sticks form a star', 'Bottom slider: walk around. Side slider: higher or lower');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env, rd = m.rounds[0];
    const hard = rd.startPitch !== undefined;
    const cam = hard ? camSph(viewYaw(rd, st.v), viewPitch(rd, st)) : camAt(viewYaw(rd, st.v), rd.pitch);
    if (!hard && env.style && env.assets?.vpLook) { env.assets.vpDraw(g, br, rd, cam, env.assets.vpLook, { BOARD, CAM, shade3 }); return; }
    const K = hard ? NEW : CAM;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const sky = g.createLinearGradient(0, 0, 0, BOARD.h);
    sky.addColorStop(0, '#f1f4f7'); sky.addColorStop(1, '#e2e7ec');
    g.fillStyle = sky; g.fillRect(0, 0, BOARD.w, BOARD.h);
    const S = 150, fy = rd.floorY, ends = rd.bars.flatMap((b) => [b.a, b.b]);
    const ox = ends.reduce((t, p) => t + p.x, 0) / ends.length, oz = ends.reduce((t, p) => t + p.z, 0) / ends.length;
    const corners = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([x, z]) => cam.project({ x: ox + x, y: fy, z: oz + z }));
    g.fillStyle = 'rgba(206,214,222,.55)'; g.beginPath(); corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(90,104,118,.16)'; g.lineWidth = 1;
    for (let t = -S; t <= S; t += 37.5) {
      for (const [a, b] of [[{ x: ox + t, y: fy, z: oz - S }, { x: ox + t, y: fy, z: oz + S }], [{ x: ox - S, y: fy, z: oz + t }, { x: ox + S, y: fy, z: oz + t }]]) {
        const pa = cam.project(a), pb = cam.project(b); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      }
    }
    const drawn = rd.bars.map((bar) => { const pa = cam.project(bar.a), pb = cam.project(bar.b); return { pa, pb, depth: (pa.depth + pb.depth) / 2 }; })
      .sort((a, b) => b.depth - a.depth);
    const mid = hard ? NEW.D - 30 : 345;
    for (const d of drawn) {
      const w = Math.max(3.4, Math.min(8, K.fov / d.depth * 5.4));
      drawRod(g, d.pa, d.pb, w, shade3(BASE, Math.max(0.62, Math.min(1.06, 1.06 - (d.depth - mid) / 300))));
    }
    if (hard) drawPitchSlider(g, st.p, !!this._tilt);
    g.restore();
  },

  footerStatus(env) {
    if (env.manifest.ext) return env.state.released || env.state.v > 0 ? 'Stop where you see the star' : 'Move the slider';
    return env.state.released ? 'Stop where you see the star' : 'Move both sliders';
  },
};

export default task;

export function semanticKey(m) {
  const rd = m.rounds[0], yaw = ((rd.frontYaw % 360) + 360) % 360;
  const base = `viewpoint_snap|${rd.shape ? rd.shape.id : 'star5'}|y${Math.round(yaw / 15) % 24}|s${Math.round(rd.startOff / 30)}|p${Math.round(rd.pitch / 5)}|b${rd.bars.length}`;
  return rd.startPitch === undefined ? base : `${base}|sp${Math.round((rd.startPitch - rd.pitch) / 5)}`;
}
