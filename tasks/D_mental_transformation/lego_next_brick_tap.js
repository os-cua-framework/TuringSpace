import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { makeCamera } from '../common/_proj3d.js';
import { makeScene, makeLight } from '../common/_scene3d.js';
import { splitIds } from '../core/style.js';
import * as LK from '../common/_block_scene_look.js';
import { deltaE } from '../common/_style3d.js';

const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 276 };
const VIEW_L = { x: 4, y: 22, w: 184, h: 246 };
const VIEW_R = { x: 192, y: 22, w: 184, h: 246 };
const ARRANGE = ['lr-top', 'rl-top', 'lr-bottom', 'rl-bottom'];
const ARRANGE_SPLIT = splitIds('lego_next_brick_tap|arrange', ARRANGE, 2);
function panels(m) {
  const a = m?.arrange;
  if (!a) return { L: VIEW_L, R: VIEW_R, labelY: 11 };
  const top = a.endsWith('top'), y = top ? 22 : 4, left = { x: 4, y, w: 184, h: 246 }, right = { x: 192, y, w: 184, h: 246 };
  return a.startsWith('rl') ? { L: right, R: left, labelY: top ? 11 : 263 } : { L: left, R: right, labelY: top ? 11 : 263 };
}
const HARD = Object.freeze({
  plate: 8, bricksMin: 7, bricksMax: 9,
  colorsMin: 2, colorsMax: 3,
  yawGapMin: 80, yawGapMax: 100, offAxis: 15,
  pitchMin: 36, pitchMax: 43,
  dist: 200,
  margin: 6,
  guessSep: 6,
  visTopL: 0.6, visL: 0.5, visFootR: 0.78, visAny: 0.3,
  attempts: 400,
});
const P = 8, BH = 9.6, PLATE_T = 3.2, STUD_R = 2.35, STUD_H = 1.8;
const SIZES = [[1, 2], [2, 2], [1, 3], [2, 3], [2, 4]];
const EXT_NEW = [[1, 4], [1, 6], [2, 6]];
const EXT_SPLIT = splitIds('lego_next_brick_tap|size', EXT_NEW.map((s) => s.join('x')), 1);
const EXT_SIZES = (split) => [...SIZES, ...EXT_NEW.filter((s) => EXT_SPLIT(s.join('x')) === split)];
const EXT_ALL = [...SIZES, ...EXT_NEW];
const COLORS = ['#d9453b', '#2f6fd1', '#f2c230', '#3aa655', '#f08a24', '#f4f3ee', '#8e5cc4', '#5bc0e8', '#e87aa6', '#8b6a4a'];
const PLATE_COLOR = '#a9b2bb';
const HALF = HARD.plate * P / 2;

const r2 = (v) => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;

const boxOf = (b) => ({ x0: -HALF + b.i * P, x1: -HALF + (b.i + b.w) * P, y0: b.layer * BH, y1: (b.layer + 1) * BH, z0: -HALF + b.j * P, z1: -HALF + (b.j + b.d) * P });
const cells = (b) => { const c = []; for (let a = 0; a < b.w; a++) for (let e = 0; e < b.d; e++) c.push([b.i + a, b.j + e]); return c; };
const key = (i, j) => i * 16 + j;
function occupancy(bricks, layer) { const s = new Set(); for (const b of bricks) if (b.layer === layer) for (const [i, j] of cells(b)) s.add(key(i, j)); return s; }

export function modelProblems(bricks, sizes = SIZES) {
  const out = [];
  const G = HARD.plate;
  const seen = new Map();
  for (const b of bricks) {
    if (![b.i, b.j, b.w, b.d, b.layer].every(Number.isInteger)) return ['brick-int'];
    if (!sizes.some(([w, d]) => (w === b.w && d === b.d) || (w === b.d && d === b.w))) out.push('brick-size');
    if (b.i < 0 || b.j < 0 || b.i + b.w > G || b.j + b.d > G || b.layer < 0 || b.layer > 2) out.push('brick-bounds');
    for (const [i, j] of cells(b)) { const k = key(i, j) + b.layer * 1000; if (seen.has(k)) out.push('brick-overlap'); seen.set(k, b); }
    if (b.layer > 0) {
      const below = occupancy(bricks, b.layer - 1);
      if (cells(b).filter(([i, j]) => below.has(key(i, j))).length < needSupport(b)) out.push('unsupported');
    }
  }
  const nCol = new Set(bricks.map((b) => b.color)).size;
  if (nCol < HARD.colorsMin || nCol > HARD.colorsMax || !bricks.every((b) => COLORS.includes(b.color))) out.push('colours');
  for (let a = 0; a < bricks.length; a++) for (let c = a + 1; c < bricks.length; c++) {
    if (bricks[a].color === bricks[c].color && touches(bricks[a], bricks[c])) { out.push('same-colour-touch'); a = bricks.length; break; }
  }
  return [...new Set(out)];
}
function touches(a, c) {
  const ov = (p0, p1, q0, q1) => Math.min(p1, q1) - Math.max(p0, q0);
  const oi = ov(a.i, a.i + a.w, c.i, c.i + c.w), oj = ov(a.j, a.j + a.d, c.j, c.j + c.d);
  if (a.layer === c.layer) return (oi === 0 && oj > 0) || (oj === 0 && oi > 0);
  if (Math.abs(a.layer - c.layer) === 1) return oi > 0 && oj > 0;
  return false;
}
const sameSize = (a, c) => (a.w === c.w && a.d === c.d) || (a.w === c.d && a.d === c.w);
function rotBrick(b, k) {
  let { i, j, w, d } = b;
  for (let t = 0; t < k; t++) [i, j, w, d] = [HARD.plate - (j + d), i, d, w];
  return { ...b, i, j, w, d };
}
const sigOf = (b) => `${b.i},${b.j},${b.w},${b.d},${b.layer},${b.color}`;
export function otherMatches(bricks, missing) {
  const want = bricks.filter((_, id) => id !== missing).map(sigOf).sort().join('|');
  const X = bricks[missing], out = [];
  for (let k = 1; k < 4; k++) for (let y = 0; y < bricks.length; y++) {
    const got = bricks.filter((_, id) => id !== y).map((b) => sigOf(rotBrick(b, k))).sort().join('|');
    if (got !== want) continue;
    const Y = rotBrick(bricks[y], k);
    if (Y.i !== X.i || Y.j !== X.j || Y.w !== X.w || Y.d !== X.d || Y.layer !== X.layer) out.push({ k, y });
  }
  return out;
}
const needSupport = (b) => Math.max(2, Math.ceil(b.w * b.d / 2));
const topFree = (bricks, b) => { const above = occupancy(bricks, b.layer + 1); return cells(b).every(([i, j]) => !above.has(key(i, j))); };

function solids(bricks, skip = -1) {
  const S = [{ x0: -HALF, x1: HALF, y0: -PLATE_T, y1: 0, z0: -HALF, z1: HALF, id: -1 }];
  bricks.forEach((b, id) => { if (id !== skip) S.push({ ...boxOf(b), id }); });
  return S;
}
function segHitsBox(a, b, B, eps = 0.02) {
  let t0 = 0, t1 = 1;
  for (const ax of ['x', 'y', 'z']) {
    const d = b[ax] - a[ax], lo = B[ax + '0'] + eps, hi = B[ax + '1'] - eps;
    if (Math.abs(d) < 1e-12) { if (a[ax] <= lo || a[ax] >= hi) return false; continue; }
    let u0 = (lo - a[ax]) / d, u1 = (hi - a[ax]) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 >= t1) return false;
  }
  return t1 > 1e-6 && t0 < 1 - 1e-6;
}
function visibleFrac(camera, pts, boxes) {
  let v = 0;
  for (const p of pts) if (!boxes.some((B) => segHitsBox(camera.cam, p, B))) v++;
  return v / pts.length;
}
function faceSamples(B, face, n = 3) {
  const out = [], f = (k) => 0.15 + 0.7 * k / (n - 1);
  for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
    const u = f(a), v = f(c);
    const X = B.x0 + (B.x1 - B.x0) * u, Z = B.z0 + (B.z1 - B.z0) * v, Y = B.y0 + (B.y1 - B.y0) * v;
    if (face === 'top') out.push({ x: X, y: B.y1 + 0.01, z: Z });
    else if (face === 'bottom') out.push({ x: X, y: B.y0 + 0.01, z: Z });
    else if (face === 'x0') out.push({ x: B.x0 - 0.01, y: Y, z: B.z0 + (B.z1 - B.z0) * u });
    else if (face === 'x1') out.push({ x: B.x1 + 0.01, y: Y, z: B.z0 + (B.z1 - B.z0) * u });
    else if (face === 'z0') out.push({ x: X, y: Y, z: B.z0 - 0.01 });
    else if (face === 'z1') out.push({ x: X, y: Y, z: B.z1 + 0.01 });
  }
  return out;
}

function camOf(c) { return makeCamera({ yaw: c.yaw, pitch: c.pitch, dist: c.dist, cx: c.cx, cy: c.cy, fov: c.fov, minDepth: 40 }); }
const camCache = new Map();
function camFor(c) { const k = JSON.stringify(c); let v = camCache.get(k); if (!v) { if (camCache.size > 64) camCache.clear(); v = camOf(c); camCache.set(k, v); } return v; }
function modelCorners(bricks) {
  const pts = [];
  const add = (B) => { for (const x of [B.x0, B.x1]) for (const y of [B.y0, B.y1]) for (const z of [B.z0, B.z1]) pts.push({ x, y, z }); };
  add({ x0: -HALF, x1: HALF, y0: -PLATE_T, y1: 0, z0: -HALF, z1: HALF });
  for (const b of bricks) { const B = boxOf(b); add({ ...B, y1: B.y1 + STUD_H }); }
  return pts;
}
function frameCams(bricks, yawL, yawR, pitch, rng) {
  const pts = modelCorners(bricks);
  const ext = (yaw) => {
    const c = makeCamera({ yaw, pitch, dist: HARD.dist, cx: 0, cy: 0, fov: 1, minDepth: 40 });
    const q = pts.map(c.project);
    return { x0: Math.min(...q.map((p) => p.x)), x1: Math.max(...q.map((p) => p.x)), y0: Math.min(...q.map((p) => p.y)), y1: Math.max(...q.map((p) => p.y)) };
  };
  const eL = ext(yawL), eR = ext(yawR);
  const fov = Math.min((VIEW_L.w - 26) / Math.max(eL.x1 - eL.x0, eR.x1 - eR.x0), (VIEW_L.h - 70) / Math.max(eL.y1 - eL.y0, eR.y1 - eR.y0));
  const mk = (yaw, e) => {
    const sx = Math.max(0, (VIEW_L.w - 10 - fov * (e.x1 - e.x0)) / 2), sy = Math.max(0, (VIEW_L.h - 10 - fov * (e.y1 - e.y0)) / 2);
    const jx = rng.uniform(-sx, sx), jy = rng.uniform(-sy, sy);
    return { yaw: r2(yaw), pitch: r2(pitch), dist: HARD.dist, fov: r2(fov), cx: r2(VIEW_L.w / 2 + jx - fov * (e.x0 + e.x1) / 2), cy: r2(VIEW_L.h / 2 + jy - fov * (e.y0 + e.y1) / 2) };
  };
  return { L: mk(yawL, eL), R: mk(yawR, eR) };
}

function hull2(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}
function hullsOverlap(A, B) {
  for (const P0 of [A, B]) {
    for (let i = 0; i < P0.length; i++) {
      const a = P0[i], b = P0[(i + 1) % P0.length], nx = a.y - b.y, ny = b.x - a.x;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of A) { const d = q.x * nx + q.y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const q of B) { const d = q.x * nx + q.y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
    }
  }
  return true;
}
function primList(bricks, skip) {
  const prims = [{ kind: 'box', B: { x0: -HALF, x1: HALF, y0: -PLATE_T, y1: 0, z0: -HALF, z1: HALF }, color: PLATE_COLOR }];
  const occ = [new Set(), new Set(), new Set()];
  bricks.forEach((b, id) => { if (id !== skip) for (const [i, j] of cells(b)) occ[b.layer].add(key(i, j)); });
  bricks.forEach((b, id) => { if (id !== skip) prims.push({ kind: 'box', B: boxOf(b), color: b.color }); });
  for (let i = 0; i < HARD.plate; i++) for (let j = 0; j < HARD.plate; j++) if (!occ[0].has(key(i, j))) prims.push(stud(i, j, 0, PLATE_COLOR));
  bricks.forEach((b, id) => {
    if (id === skip) return;
    for (const [i, j] of cells(b)) if (b.layer + 1 > 2 || !occ[b.layer + 1].has(key(i, j))) prims.push(stud(i, j, (b.layer + 1) * BH, b.color));
  });
  return prims;
}
function stud(i, j, y, color) {
  const cx = -HALF + (i + 0.5) * P, cz = -HALF + (j + 0.5) * P;
  return { kind: 'stud', c: { x: cx, y, z: cz }, B: { x0: cx - STUD_R, x1: cx + STUD_R, y0: y, y1: y + STUD_H, z0: cz - STUD_R, z1: cz + STUD_R }, color };
}
function paintOrder(prims, camera) {
  const n = prims.length;
  const info = prims.map((p) => {
    const B = p.B, V = [];
    for (const x of [B.x0, B.x1]) for (const y of [B.y0, B.y1]) for (const z of [B.z0, B.z1]) V.push(camera.project({ x, y, z }));
    const h = hull2(V);
    return { h, bx0: Math.min(...h.map((q) => q.x)), bx1: Math.max(...h.map((q) => q.x)), by0: Math.min(...h.map((q) => q.y)), by1: Math.max(...h.map((q) => q.y)),
      depth: camera.project({ x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2, z: (B.z0 + B.z1) / 2 }).depth };
  });
  const before = Array.from({ length: n }, () => []);
  const C = camera.cam;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = info[a], Bi = info[b];
    if (A.bx1 <= Bi.bx0 || Bi.bx1 <= A.bx0 || A.by1 <= Bi.by0 || Bi.by1 <= A.by0) continue;
    if (!hullsOverlap(A.h, Bi.h)) continue;
    const PA = prims[a].B, PB = prims[b].B;
    let far = -1;
    for (const ax of ['y', 'x', 'z']) {
      if (PA[ax + '1'] <= PB[ax + '0'] + 1e-9) { far = C[ax] > PA[ax + '1'] ? a : b; break; }
      if (PB[ax + '1'] <= PA[ax + '0'] + 1e-9) { far = C[ax] > PB[ax + '1'] ? b : a; break; }
    }
    if (far < 0) continue;
    const near = far === a ? b : a;
    before[near].push(far);
  }
  const order = [], mark = new Uint8Array(n);
  let cyclic = false;
  const visit = (i) => {
    if (mark[i] === 2) return;
    if (mark[i] === 1) { cyclic = true; return; }
    mark[i] = 1;
    for (const j of before[i]) visit(j);
    mark[i] = 2; order.push(i);
  };
  const byDepth = Array.from({ length: n }, (_, i) => i).sort((i, j) => info[j].depth - info[i].depth || i - j);
  for (const i of byDepth) visit(i);
  return { order, cyclic };
}

function ghostHull(rd) {
  const cam = camFor(rd.camR), B = boxOf(rd.bricks[rd.missing]), V = [], VR = panels(rd).R;
  for (const x of [B.x0, B.x1]) for (const z of [B.z0, B.z1]) {
    const q = cam.project({ x, y: B.y0, z }); V.push({ x: q.x + VR.x, y: q.y + VR.y });
  }
  return hull2(V);
}
function distToHull(pt, H) {
  let inside = true, m = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const cr = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (cr < 0) inside = false;
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L)) : 0;
    m = Math.min(m, Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy));
  }
  return inside ? 0 : m;
}
export function semanticKey(m) {
  const b = m.bricks.map((x, i) => `${x.w}x${x.d}@${x.i},${x.j},${x.layer}${i === m.missing ? '*' : ''}`).sort();
  const turn = Math.sign(((m.camR.yaw - m.camL.yaw) % 360 + 540) % 360 - 180);
  return `lego_next_brick_tap|${b.join(';')}|L${Math.round(m.camL.yaw / 15) % 24}|turn${turn}`;
}
export function hitsTarget(rd, pt) { return !!pt && distToHull(pt, ghostHull(rd)) <= HARD.margin; }
function spotCenter3(b) { const B = boxOf(b); return { x: (B.x0 + B.x1) / 2, y: B.y0, z: (B.z0 + B.z1) / 2 }; }
export function targetPoint(rd) {
  const q = camFor(rd.camR).project(spotCenter3(rd.bricks[rd.missing])), VR = panels(rd).R;
  return { x: r2(q.x + VR.x), y: r2(q.y + VR.y) };
}
function nearSpots(rd) {
  const b = rd.bricks[rd.missing], base = rd.bricks.filter((_, id) => id !== rd.missing);
  const camR = camFor(rd.camR), VR = panels(rd).R, out = [];
  for (let di = -b.w; di <= b.w; di++) for (let dj = -b.d; dj <= b.d; dj++) {
    if (!di && !dj) continue;
    const s = { i: b.i + di, j: b.j + dj, w: b.w, d: b.d, layer: b.layer };
    if (!fits(base, s)) continue;
    const q = camR.project(spotCenter3(s));
    out.push({ x: q.x + VR.x, y: q.y + VR.y, di, dj });
  }
  return out;
}
function wrongGuesses(rd) {
  const b = rd.bricks[rd.missing], c = spotCenter3(b), camR = camFor(rd.camR), camL = camFor(rd.camL), VIEW_R = panels(rd).R;
  const out = [];
  for (const k of [1, 2, 3]) {
    const a = k * Math.PI / 2, x = c.x * Math.cos(a) - c.z * Math.sin(a), z = c.x * Math.sin(a) + c.z * Math.cos(a);
    const q = camR.project({ x, y: c.y, z }); out.push({ why: `rot${k * 90}`, x: q.x + VIEW_R.x, y: q.y + VIEW_R.y });
  }
  const l = camL.project(c);
  out.push({ why: 'same-spot', x: l.x + VIEW_R.x, y: l.y + VIEW_R.y });
  out.push({ why: 'mirror', x: VIEW_L.w - l.x + VIEW_R.x, y: l.y + VIEW_R.y });
  {
    const ground = new Set();
    rd.bricks.forEach((o, id) => { if (id !== rd.missing && o.layer === 0) for (const [i, j] of cells(o)) ground.add(key(i, j)); });
    const seen = new Set(); let best = [];
    for (let i0 = 0; i0 < HARD.plate; i0++) for (let j0 = 0; j0 < HARD.plate; j0++) {
      const k0 = key(i0, j0);
      if (ground.has(k0) || seen.has(k0)) continue;
      const comp = [], stack = [[i0, j0]]; seen.add(k0);
      while (stack.length) {
        const [i, j] = stack.pop(); comp.push([i, j]);
        for (const [a, e] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
          const k = key(a, e);
          if (a >= 0 && e >= 0 && a < HARD.plate && e < HARD.plate && !ground.has(k) && !seen.has(k)) { seen.add(k); stack.push([a, e]); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    if (best.length) {
      const ci = best.reduce((t, c) => t + c[0], 0) / best.length, cj = best.reduce((t, c) => t + c[1], 0) / best.length;
      const q = camR.project({ x: -HALF + (ci + 0.5) * P, y: 0, z: -HALF + (cj + 0.5) * P });
      out.push({ why: 'largest-gap', x: q.x + VIEW_R.x, y: q.y + VIEW_R.y });
    }
  }
  if (b.layer > 0) {
    const mine = new Set(cells(b).map(([i, j]) => key(i, j)));
    for (const s of rd.bricks) {
      if (s.layer !== b.layer - 1 || !cells(s).some(([i, j]) => mine.has(key(i, j)))) continue;
      const S = boxOf(s), q = camR.project({ x: (S.x0 + S.x1) / 2, y: S.y1, z: (S.z0 + S.z1) / 2 });
      out.push({ why: 'support-centre', x: q.x + VIEW_R.x, y: q.y + VIEW_R.y });
    }
  }
  return out;
}

export function sceneProblems(rd, fast = false) {
  const out = [];
  const stop = () => fast && out.length > 0;
  if (!rd || !Array.isArray(rd.bricks) || rd.bricks.length < HARD.bricksMin || rd.bricks.length > HARD.bricksMax) return ['brick-count'];
  out.push(...modelProblems(rd.bricks, rd.ext === true ? EXT_ALL : SIZES));
  if (out.length) return out;
  const b = rd.bricks[rd.missing];
  if (!b) return ['missing'];
  if (!topFree(rd.bricks, b)) out.push('missing-not-on-top');
  if (!rd.bricks.some((o, id) => id !== rd.missing && o.color === b.color && sameSize(o, b))) out.push('no-twin');
  if (otherMatches(rd.bricks, rd.missing).length) out.push('ambiguous-match');
  if (stop()) return out;
  for (const c of [rd.camL, rd.camR]) {
    if (!c || ![c.yaw, c.pitch, c.dist, c.fov, c.cx, c.cy].every(Number.isFinite)) return out.concat('camera');
    const off = ((c.yaw % 90) + 90) % 90;
    if (off < HARD.offAxis - 1e-6 || off > 90 - HARD.offAxis + 1e-6) out.push('face-on-view');
    if (c.pitch < HARD.pitchMin - 1e-6 || c.pitch > HARD.pitchMax + 1e-6 || c.dist !== HARD.dist) out.push('camera-range');
  }
  if (rd.camL.pitch !== rd.camR.pitch || rd.camL.fov !== rd.camR.fov) out.push('views-differ');
  const gap = Math.abs(((rd.camR.yaw - rd.camL.yaw) % 360 + 540) % 360 - 180);
  if (gap < HARD.yawGapMin - 1e-6 || gap > HARD.yawGapMax + 1e-6) out.push('yaw-gap');
  if (stop()) return out;
  const camL = camFor(rd.camL), camR = camFor(rd.camR);
  for (const [c, V] of [[camL, panels(rd).L], [camR, panels(rd).R]]) {
    for (const p of modelCorners(rd.bricks)) { const q = c.project(p); if (q.x < 3 || q.x > V.w - 3 || q.y < 3 || q.y > V.h - 3) { out.push('out-of-panel'); break; } }
  }
  const H = ghostHull(rd);
  for (const w of wrongGuesses(rd)) {
    const need = w.why === 'support-centre' ? HARD.margin + 2 : HARD.margin + HARD.guessSep;
    if (distToHull(w, H) < need) out.push('guess-' + w.why);
  }
  if (b.layer > 0) {
    const Bm = boxOf(b), mine = new Set(cells(b).map(([i, j]) => key(i, j)));
    for (const s of rd.bricks) {
      if (s.layer !== b.layer - 1 || !cells(s).some(([i, j]) => mine.has(key(i, j)))) continue;
      const S = boxOf(s), cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
      if (cx > Bm.x0 - 3 && cx < Bm.x1 + 3 && cz > Bm.z0 - 3 && cz < Bm.z1 + 3) out.push('covers-support-centre');
    }
  }
  if (!hitsTarget(rd, targetPoint(rd))) out.push('target');
  if (!nearSpots(rd).some((s) => distToHull(s, H) >= HARD.margin + HARD.guessSep)) out.push('no-near-spot');
  if (stop()) return out;
  const B = boxOf(b), all = solids(rd.bricks).filter((s) => s.id !== -1);
  const facing = (cam, Bx) => ['top', cam.cam.x < Bx.x0 ? 'x0' : cam.cam.x > Bx.x1 ? 'x1' : null, cam.cam.z < Bx.z0 ? 'z0' : cam.cam.z > Bx.z1 ? 'z1' : null].filter(Boolean);
  const occL = all.filter((s) => s.id !== rd.missing);
  const topL = visibleFrac(camL, faceSamples(B, 'top'), occL);
  const allL = visibleFrac(camL, facing(camL, B).flatMap((f) => faceSamples(B, f)), occL);
  if (topL < HARD.visTopL || allL < HARD.visL) out.push('brick-hidden-left');
  const footR = visibleFrac(camR, faceSamples(B, 'bottom'), occL);
  if (footR < HARD.visFootR) out.push('place-hidden-right');
  if (stop()) return out;
  for (const [cam, skip] of [[camL, -1], [camR, rd.missing]]) {
    for (let id = 0; id < rd.bricks.length; id++) {
      if (id === skip) continue;
      const Bi = boxOf(rd.bricks[id]);
      const occ = all.filter((s) => s.id !== id && s.id !== skip);
      if (visibleFrac(cam, facing(cam, Bi).flatMap((f) => faceSamples(Bi, f)), occ) < HARD.visAny) { out.push('some-brick-hidden'); break; }
    }
  }
  if (stop()) return out;
  if (paintOrder(primList(rd.bricks, -1), camL).cyclic || paintOrder(primList(rd.bricks, rd.missing), camR).cyclic) out.push('paint-cycle');
  return [...new Set(out)];
}

function baseModel(rng, sizes = SIZES) {
  const G = HARD.plate, bricks = [];
  const tryPlace = (layer) => {
    for (let t = 0; t < 60; t++) {
      const [w0, d0] = rng.pick(sizes), rot = rng.raw() < 0.5, w = rot ? d0 : w0, d = rot ? w0 : d0;
      const b = { i: rng.int(0, G - w), j: rng.int(0, G - d), w, d, layer };
      if (fits(bricks, b)) { bricks.push(b); return true; }
    }
    return false;
  };
  const n0 = rng.int(4, 5), n1 = rng.int(2, 3), n2 = rng.raw() < 0.3 ? 1 : 0;
  for (let k = 0; k < n0; k++) tryPlace(0);
  for (let k = 0; k < n1; k++) tryPlace(1);
  for (let k = 0; k < n2; k++) tryPlace(2);
  return bricks;
}
function fits(bricks, b) {
  const G = HARD.plate;
  if (b.i < 0 || b.j < 0 || b.i + b.w > G || b.j + b.d > G) return false;
  const occ = occupancy(bricks, b.layer);
  if (cells(b).some(([a, e]) => occ.has(key(a, e)))) return false;
  if (b.layer > 0) { const below = occupancy(bricks, b.layer - 1); if (cells(b).filter(([a, e]) => below.has(key(a, e))).length < needSupport(b)) return false; }
  const above = occupancy(bricks, b.layer + 1);
  return !cells(b).some(([a, e]) => above.has(key(a, e)));
}
function placements(bricks, upper, sizes = SIZES) {
  const out = [];
  for (const [w0, d0] of sizes) for (const rot of [false, true]) {
    if (rot && w0 === d0) continue;
    const w = rot ? d0 : w0, d = rot ? w0 : d0;
    for (const layer of upper ? [1, 2] : [0]) for (let i = 0; i + w <= HARD.plate; i++) for (let j = 0; j + d <= HARD.plate; j++) {
      const b = { i, j, w, d, layer };
      if (!fits(bricks, b)) continue;
      if (layer > 0) {
        const B = boxOf(b), mine = new Set(cells(b).map(([a, e]) => key(a, e)));
        const covered = bricks.some((s) => {
          if (s.layer !== layer - 1 || !cells(s).some(([a, e]) => mine.has(key(a, e)))) return false;
          const S = boxOf(s), cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
          return cx > B.x0 - 3 && cx < B.x1 + 3 && cz > B.z0 - 3 && cz < B.z1 + 3;
        });
        if (covered) continue;
      }
      out.push(b);
    }
  }
  return out;
}

function paintColours(bricks, missing, rng) {
  const X = bricks[missing];
  const twins = bricks.map((o, id) => id).filter((id) => id !== missing && sameSize(bricks[id], X) && !touches(bricks[id], X));
  if (!twins.length) return false;
  for (let t = 0; t < 30; t++) {
    const pal = rng.sample(COLORS, rng.int(HARD.colorsMin, HARD.colorsMax));
    bricks.forEach((b) => { delete b.color; });
    X.color = rng.pick(pal); bricks[rng.pick(twins)].color = X.color;
    let ok = true;
    for (const id of rng.shuffle(bricks.map((_, k) => k))) {
      const b = bricks[id];
      if (b.color) continue;
      const free = pal.filter((c) => !bricks.some((o) => o !== b && o.color === c && touches(o, b)));
      if (!free.length) { ok = false; break; }
      b.color = rng.pick(free);
    }
    if (ok && new Set(bricks.map((b) => b.color)).size >= HARD.colorsMin) return true;
  }
  return false;
}

function yawOffAxis(rng) { return rng.int(0, 3) * 90 + rng.uniform(HARD.offAxis + 1, 90 - HARD.offAxis - 1); }

function genScene(rng, diag = null, forceUpper = null, sizes = null, arrange = null) {
  const wantUpper = forceUpper === null ? rng.raw() < 0.5 : forceUpper;
  for (let t = 0; t < HARD.attempts; t++) {
    const base = sizes ? baseModel(rng, sizes) : baseModel(rng);
    if (base.length + 1 < HARD.bricksMin || base.length + 1 > HARD.bricksMax) continue;
    const cand = (sizes ? placements(base, wantUpper, sizes) : placements(base, wantUpper))
      .filter((c) => base.some((o) => sameSize(o, c) && !touches(o, c)));
    if (!cand.length) continue;
    const add = rng.pick(cand);
    const missing = rng.int(0, base.length);
    const bricks = base.slice(0, missing).concat([add], base.slice(missing));
    if (!paintColours(bricks, missing, rng)) continue;
    if (modelProblems(bricks, sizes || SIZES).length) continue;
    if (otherMatches(bricks, missing).length) continue;
    for (let v = 0; v < 6; v++) {
      const yawL = yawOffAxis(rng);
      let yawR = yawL + rng.sign() * rng.uniform(HARD.yawGapMin + 0.5, HARD.yawGapMax - 0.5);
      yawR = ((yawR % 360) + 360) % 360;
      const off = yawR % 90;
      if (off < HARD.offAxis + 0.5 || off > 90 - HARD.offAxis - 0.5) continue;
      const pitch = rng.uniform(HARD.pitchMin + 0.3, HARD.pitchMax - 0.3);
      const cams = frameCams(bricks, yawL, yawR, pitch, rng);
      const rd = { bricks: bricks.map((b) => ({ ...b })), missing, camL: cams.L, camR: cams.R };
      if (sizes) rd.ext = true;
      if (arrange) rd.arrange = arrange;
      const pr = sceneProblems(rd, !diag);
      if (pr.length === 0) return rd;
      if (diag) for (const w of pr) diag[w] = (diag[w] || 0) + 1;
    }
  }
  if (diag) return null;
  throw new Error('lego_next_brick_tap: could not build a scene');
}

export function gate(m) {
  if (!m || m.task !== 'lego_next_brick_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (m.rounds !== undefined) return false;
  if (m.arrange !== undefined && !ARRANGE.includes(m.arrange)) return false;
  return Number.isInteger(m.missing) && sceneProblems(m).length === 0;
}

const LIGHT = makeLight({ dir: { x: -0.45, y: 0.85, z: 0.3 }, ambient: 0.42 });
function paintModel(g, bricks, skip, c, look = null) {
  const camera = camFor(c);
  if (look) return paintModelStyled(g, bricks, skip, camera, look);
  const prims = primList(bricks, skip);
  const { order } = paintOrder(prims, camera);
  const s0 = camera.project({ x: 0, y: -PLATE_T, z: 0 }), s1 = camera.project({ x: HALF * 1.25, y: -PLATE_T, z: 0 }), s2 = camera.project({ x: 0, y: -PLATE_T, z: HALF * 1.25 });
  const rx = Math.max(Math.hypot(s1.x - s0.x, s1.y - s0.y), Math.hypot(s2.x - s0.x, s2.y - s0.y));
  g.save(); g.translate(s0.x, s0.y + 4); g.scale(1, 0.42);
  const sh = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  sh.addColorStop(0, 'rgba(40,50,60,.26)'); sh.addColorStop(1, 'rgba(40,50,60,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  for (const i of order) {
    const p = prims[i];
    const scene = makeScene(g, camera, { light: LIGHT, fog: null, width: VIEW_L.w, height: VIEW_L.h });
    if (p.kind === 'box') {
      const B = p.B;
      scene.prism({ polygon: [{ x: B.x0, z: B.z0 }, { x: B.x1, z: B.z0 }, { x: B.x1, z: B.z1 }, { x: B.x0, z: B.z1 }], y: B.y0, h: B.y1 - B.y0, color: p.color, shadowY: null });
    } else {
      scene.cylinder({ base: p.c, axis: { x: 0, y: STUD_H, z: 0 }, r: STUD_R, color: p.color, shadowY: null });
    }
    scene.render({ background: false });
  }
}
const SURF_USES = ['wood', 'floor', 'stone', 'fabric'];
const BRICK_FAMS = ['plastic', 'wood', 'metal', 'concrete', 'stone'];
const PLATE_COLS = ['#a9b2bb', '#6f7a84', '#5f8a52', '#c8b48c', '#e2dfd6', '#40454c', '#8a7a68'];
const hexLin = (h) => [1, 3, 5].map((k) => Math.pow(parseInt(h.slice(k, k + 2), 16) / 255, 2.2));
async function styleLook(style, m) {
  const rnd = style.rand;
  const surfaces = style.pool('tex', (t) => SURF_USES.includes(t.use));
  const SP = (name, items) => LK.splitPool(style, `lego_next_brick_tap|${name}`, items);
  const fams = SP('brick', BRICK_FAMS), plates = SP('plate', PLATE_COLS), plateFams = SP('platefam', ['plastic', 'wood', 'metal', 'concrete']), rooms = SP('room', ['open', 'wall-z', 'wall-x', 'corner']);
  const [si, bf, pc] = style.primaryCombo('surface-brick-plate', [surfaces.length, fams.length, plates.length]);
  const surf = surfaces[si], fam = fams[bf];
  const cols = m.bricks.map((b) => hexLin(b.color));
  let plate = plates[pc];
  for (let k = 0; k < plates.length; k++) {
    const h = plates[(pc + k) % plates.length];
    if (cols.every((c) => deltaE(c, hexLin(h)) >= 25)) { plate = h; break; }
  }
  const hd = style.pick('hdri');
  const pool = LK.familyPool(style, fam), brickItem = pool.length ? LK.pickFrom(pool, rnd()) : null;
  const plateFam = plateFams[Math.floor(rnd() * plateFams.length)], pPool = LK.familyPool(style, plateFam), plateItem = pPool.length ? LK.pickFrom(pPool, rnd()) : null;
  const room = rooms[Math.floor(rnd() * rooms.length)];
  const wallItem = room === 'open' ? null : LK.pickFrom(style.pool('tex', (t) => ['wall', 'wood', 'stone'].includes(t.use) && t.id !== surf.id), rnd());
  for (const it of [surf, brickItem, plateItem, wallItem]) if (it) style.note(`tex:${it.id}`);
  style.note(`bricks:${fam}`); style.note(`plate:${plate}/${plateFam}`); style.note(`hdri:${hd.id}`); style.note(`room:${room}`);
  const load = (it) => (it ? LK.loadTex(it) : null);
  const [Ts, Tb, Tp, Tw] = await Promise.all([load(surf), load(brickItem), load(plateItem), load(wallItem)]);
  const tints = LK.lightTints(hd);
  const light = makeLight({ dir: { x: -0.45, y: 0.85, z: 0.3 }, ambient: 0.38 + 0.12 * rnd(), warm: tints.warm, cool: tints.cool });
  const dark = rnd() < 0.2, sLum = dark ? 0.07 + 0.08 * rnd() : 0.3 + 0.32 * rnd();
  const skinOf = (f, T, k) => {
    if (f === 'plastic' || !T) return LK.overlaySkin(null, { alpha: 0, extra: LK.sheen(0.22) });
    return LK.overlaySkin(LK.detail(T, { k, lo: 0.25, hi: 0.75 }), { unit: 30 + 20 * rnd(), alpha: 0.85, salt: f, extra: f === 'metal' ? LK.sheen(0.24) : f === 'wood' ? LK.sheen(0.06) : null });
  };
  return {
    light, plate, dark, room,
    brickSkin: skinOf(fam, Tb, fam === 'stone' || fam === 'concrete' ? 0.4 : 0.5), plateSkin: skinOf(plateFam, Tp, 0.45),
    surf: LK.texSurface(Ts, { lumTarget: sLum, k: 0.8, maxSat: 0.3, unit: 60 + 60 * rnd(), rot: rnd() * Math.PI, ox: 300 * rnd(), oz: 300 * rnd() }),
    wall: Tw ? LK.texSurface(Tw, { lumTarget: dark ? 0.05 + 0.08 * rnd() : 0.25 + 0.25 * rnd(), k: 0.8, maxSat: 0.3, unit: 70 + 50 * rnd() }) : null,
    wallD: 55 + 50 * rnd(), wallSide: rnd() < 0.5 ? -1 : 1, wallAx: rnd() < 0.5 ? 'x' : 'z',
  };
}
const linK = (k) => k.map((x) => Math.pow(Math.max(0, x), 2.2));
function panelBackdrop(c, V, look, q) {
  const camera = camFor(c), up = linK(LK.faceShade(look.light, { x: 0, y: 1, z: 0 }));
  const walls = [];
  if (look.room !== 'open') {
    const D = look.wallD, s = look.wallSide, wl = (nx, nz) => ({ nx, nz, d: -D, ux: nz !== 0 ? 1 : 0, uz: nx !== 0 ? 1 : 0, fn: look.wall, K: linK(LK.faceShade(look.light, { x: nx, y: 0, z: nz })), y0: -PLATE_T, y1: 2000 });
    if (look.room === 'wall-z' || look.room === 'corner') walls.push(wl(0, s));
    if (look.room === 'wall-x' || look.room === 'corner') walls.push(wl(-s, 0));
  }
  const vis = walls.filter((w) => w.nx * camera.cam.x + w.nz * camera.cam.z > w.d);
  return LK.renderBackdrop({ W: V.w, H: V.h, q, cam: camera, P: { fov: c.fov, cx: c.cx, cy: c.cy }, planes: [{ y: -PLATE_T, fn: look.surf, K: up }], walls: vis, back: (dx, dy, dz, out) => { out[0] = out[1] = out[2] = 0.5; } });
}
function paintModelStyled(g, bricks, skip, camera, look) {
  const prims = primList(bricks, skip);
  const { order } = paintOrder(prims, camera);
  const s0 = camera.project({ x: 0, y: -PLATE_T, z: 0 }), s1 = camera.project({ x: HALF * 1.25, y: -PLATE_T, z: 0 }), s2 = camera.project({ x: 0, y: -PLATE_T, z: HALF * 1.25 });
  const rx = Math.max(Math.hypot(s1.x - s0.x, s1.y - s0.y), Math.hypot(s2.x - s0.x, s2.y - s0.y));
  g.save(); g.translate(s0.x, s0.y + 4); g.scale(1, 0.42);
  const sh = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  sh.addColorStop(0, 'rgba(20,22,26,.4)'); sh.addColorStop(1, 'rgba(20,22,26,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  for (const i of order) {
    const p = prims[i], isPlate = p.color === PLATE_COLOR;
    const color = isPlate ? look.plate : p.color, skin = isPlate ? look.plateSkin : look.brickSkin;
    const scene = makeScene(g, camera, { light: look.light, fog: null, width: VIEW_L.w, height: VIEW_L.h });
    if (p.kind === 'box') {
      const B = p.B;
      scene.prism({ polygon: [{ x: B.x0, z: B.z0 }, { x: B.x1, z: B.z0 }, { x: B.x1, z: B.z1 }, { x: B.x0, z: B.z1 }], y: B.y0, h: B.y1 - B.y0, color, shadowY: null, skin });
    } else {
      scene.cylinder({ base: p.c, axis: { x: 0, y: STUD_H, z: 0 }, r: STUD_R, color, shadowY: null, skin });
    }
    scene.render({ background: false });
  }
}
function contextScale(g) { try { const t = g.getTransform(); return Math.max(1, Math.hypot(t.a, t.b)); } catch { return 1; } }

function drawPanelFrame(g, V, active) {
  g.save();
  rr(g, V.x, V.y, V.w, V.h, 8);
  const bg = g.createLinearGradient(0, V.y, 0, V.y + V.h);
  bg.addColorStop(0, active ? '#f3f7fc' : '#f5f6f8'); bg.addColorStop(1, active ? '#dde7f2' : '#e3e7ec');
  g.fillStyle = bg; g.fill();
  g.strokeStyle = active ? 'rgba(25,145,250,.55)' : '#d3d9e0'; g.lineWidth = active ? 1.6 : 1; g.stroke();
  g.restore();
}

export default {
  meta: {
    name: 'lego_next_brick_tap', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `${VIEW_R.x}..${VIEW_R.x + VIEW_R.w} board px (right panel)`, y: `${VIEW_R.y}..${VIEW_R.y + VIEW_R.h} board px` },
    ],
    promptHuman: 'Tap the spot where the missing brick sits',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) {
      const arrange = rng.pick(ARRANGE.filter((a) => ARRANGE_SPLIT(a) === knobs.ext));
      return { task: 'lego_next_brick_tap', board: { ...BOARD }, ...genScene(rng, null, null, EXT_SIZES(knobs.ext), arrange) };
    }
    const rd = genScene(rng);
    return { task: 'lego_next_brick_tap', board: { ...BOARD }, ...rd };
  },

  init() { return { tap: null }; },

  applyAction(state, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-op' };
    const VR = panels(m).R;
    if (a.x < VR.x || a.x > VR.x + VR.w || a.y < VR.y || a.y > VR.y + VR.h) return { ok: false, reason: 'outside-right-panel' };
    state.tap = { x: a.x, y: a.y };
    return { ok: true };
  },

  verify(state, m) {
    const success = hitsTarget(m, state.tap);
    return { success, error: success ? 0 : 1, partial: success ? 1 : 0, detail: { tapped: !!state.tap } };
  },

  oracle(m) {
    const p = targetPoint(m);
    return [{ op: 'tap', x: p.x, y: p.y }];
  },

  randomPolicy(m, rnd) {
    const VR = panels(m).R;
    return [{ op: 'tap', x: VR.x + rnd() * VR.w, y: VR.y + rnd() * VR.h }];
  },

  async mount(env) {
    env.assets.lego = null;
    if (env.style) env.assets.look = await styleLook(env.style, env.manifest);
  },

  drawPrompt(g, r, env) {
    const side = panels(env?.manifest).R.x < BOARD.w / 2 ? 'left' : 'right';
    drawPromptText(g, r, 'Tap where the missing brick goes', `The ${side} photo is taken from another side`);
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const rd = m;
    const q = contextScale(g);
    const ck = `${q}`;
    let cache = env.assets?.lego;
    const look = env.style ? env.assets?.look : null;
    if (typeof document !== 'undefined' && (!cache || cache.key !== ck)) {
      const cv = document.createElement('canvas');
      cv.width = Math.round(BOARD.w * q); cv.height = Math.round(BOARD.h * q);
      const cg = cv.getContext('2d');
      cg.scale(q, q);
      for (const [V, skip, c, active] of [[panels(rd).L, -1, rd.camL, false], [panels(rd).R, rd.missing, rd.camR, true]]) {
        if (look) {
          cg.save(); rr(cg, V.x, V.y, V.w, V.h, 8); cg.clip();
          cg.drawImage(panelBackdrop(c, V, look, q), V.x, V.y, V.w, V.h);
          cg.translate(V.x, V.y);
          paintModel(cg, rd.bricks, skip, c, look);
          cg.restore();
          cg.save(); rr(cg, V.x, V.y, V.w, V.h, 8);
          cg.strokeStyle = active ? 'rgba(25,145,250,.85)' : '#d3d9e0'; cg.lineWidth = active ? 2 : 1; cg.stroke(); cg.restore();
          continue;
        }
        drawPanelFrame(cg, V, active);
        cg.save(); cg.translate(V.x, V.y);
        rr(cg, 0, 0, V.w, V.h, 8); cg.clip();
        paintModel(cg, rd.bricks, skip, c);
        cg.restore();
      }
      cache = { key: ck, canvas: cv };
      if (env.assets) env.assets.lego = cache;
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    if (cache) g.drawImage(cache.canvas, 0, 0, BOARD.w, BOARD.h);
    g.font = `700 10.5px ${UI_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    const PN = panels(m);
    g.fillStyle = '#6b7885'; g.fillText('Finished', PN.L.x + 4, PN.labelY);
    g.fillStyle = '#1b6fc2'; g.fillText('Now · one brick missing', PN.R.x + 4, PN.labelY);
    const tp = state.tap;
    if (tp) {
      g.save();
      g.beginPath(); g.arc(tp.x, tp.y, 9, 0, TAU); g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
      g.beginPath(); g.arc(tp.x, tp.y, 9, 0, TAU); g.strokeStyle = ACCENT; g.lineWidth = 2.4; g.stroke();
      g.beginPath(); g.arc(tp.x, tp.y, 2.6, 0, TAU); g.fillStyle = ACCENT; g.fill();
      g.restore();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const VR = panels(env.manifest).R;
    if (e.x >= VR.x && e.x <= VR.x + VR.w && e.y >= VR.y && e.y <= VR.y + VR.h) return [{ op: 'tap', x: r2(e.x), y: r2(e.y) }];
    return [];
  },

  footerStatus(env) {
    return env.state.tap ? 'Spot marked' : `Tap in the ${panels(env.manifest).R.x < BOARD.w / 2 ? 'left' : 'right'} photo`;
  },
};

export const __test = { genScene, sceneProblems, modelProblems, ghostHull, targetPoint, wrongGuesses, hitsTarget, primList, paintOrder, camFor, boxOf, solids, visibleFrac, faceSamples, VIEW_R, VIEW_L, HARD, STUD_H, P, BH, HALF, cells, topFree };
