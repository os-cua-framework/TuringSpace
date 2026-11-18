import { drawPromptText } from '../core/panel.js';
import * as RT from '../common/_crate_steps_reach_rt.js';
import { S3, texMod, faceColour, loadAll, totalOf, splitOf, pickOf } from '../common/_relation_scene_look.js';

const G = 5;
const U = 0.75;
const HALF = (G * U) / 2;
const MAXH = 4;
const BOARD = { w: 340, h: 420 };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const BOARD_T = 0.06;
const MIN_VIS = 60;
const STEP = 2;

const idx = (c, r) => r * G + c;
const inb = (c, r) => c >= 0 && c < G && r >= 0 && r < G;
const cOf = (i) => i % G, rOf = (i) => (i / G) | 0;
const wx = (c) => -HALF + (c + 0.5) * U, wz = (r) => -HALF + (r + 0.5) * U;

const BASES = new WeakMap();
function baseOf(m) {
  let b = BASES.get(m);
  if (b) return b;
  const f = new Array(G * G).fill(0), ledge = new Set();
  for (const [c, r] of m.ledge) { f[idx(c, r)] = m.S; ledge.add(idx(c, r)); }
  for (const [c, r, h] of m.fixed) f[idx(c, r)] = h;
  const person = idx(m.person[0], m.person[1]);
  const allowed = [];
  for (let i = 0; i < G * G; i++) if (!ledge.has(i) && i !== person) allowed.push(i);
  b = { f, ledge, person, allowed };
  BASES.set(m, b);
  return b;
}
function initCounts(m) {
  const n = new Array(G * G).fill(0);
  for (const [c, r, k] of m.crates) n[idx(c, r)] += k;
  return n;
}
const heightsOf = (m, n) => baseOf(m).f.map((v, i) => v + n[i]);

function reaches(m, H, diag = false) {
  const { ledge, person } = baseOf(m);
  const seen = new Uint8Array(G * G), q = [person];
  seen[person] = 1;
  const moves = diag ? N4.concat(D8) : N4;
  for (let h = 0; h < q.length; h++) {
    const p = q[h], c = cOf(p), r = rOf(p);
    if (ledge.has(p)) return true;
    for (const [dc, dr] of moves) {
      const nc = c + dc, nr = r + dr;
      if (!inb(nc, nr)) continue;
      const j = idx(nc, nr);
      if (seen[j] || H[j] - H[p] > 1) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return false;
}

function canMove(m, n, s, t) {
  const { f, ledge, person } = baseOf(m);
  if (s === t || n[s] <= 0) return false;
  if (ledge.has(t) || t === person) return false;
  return f[t] + n[t] + 1 <= MAXH;
}

function eachPlacement(m, k, visit) {
  const { f, allowed } = baseOf(m);
  const n = new Array(G * G).fill(0);
  const rec = (a, left) => {
    if (left === 0) return visit(n) === true;
    for (let j = a; j < allowed.length; j++) {
      const i = allowed[j];
      if (f[i] + n[i] + 1 > MAXH) continue;
      n[i]++;
      const stop = rec(j, left - 1);
      n[i]--;
      if (stop) return true;
    }
    return false;
  };
  rec(0, k);
}
function solves(m, n, diag = false) { return reaches(m, heightsOf(m, n), diag); }
function minCrates(m, maxK, diag = false) {
  for (let k = 0; k <= maxK; k++) {
    let found = false;
    eachPlacement(m, k, (n) => { if (solves(m, n, diag)) { found = true; return true; } return false; });
    if (found) return k;
  }
  return Infinity;
}
function anySolution(m, pred) {
  let found = false;
  eachPlacement(m, m.N, (n) => { if (pred(n) && solves(m, n)) { found = true; return true; } return false; });
  return found;
}

function bestLayout(m) {
  const I = initCounts(m);
  let best = null, bestCost = Infinity;
  eachPlacement(m, m.N, (n) => {
    let cost = 0;
    for (let i = 0; i < G * G; i++) if (n[i] > I[i]) cost += n[i] - I[i];
    if (cost < bestCost && solves(m, n)) { bestCost = cost; best = n.slice(); }
    return false;
  });
  return best ? { n: best, cost: bestCost } : null;
}

const DIST = 12, TY = 1.0;
const MARGIN = { x: 8, top: 4, bottom: 8 };
const CAMS = new WeakMap();
export function camOf(m) {
  let cam = CAMS.get(m);
  if (cam) return cam;
  const a = (m.cam.az * Math.PI) / 180, e = (m.cam.el * Math.PI) / 180;
  const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const eye = [dir[0] * DIST, TY + dir[1] * DIST, dir[2] * DIST];
  const F = [-dir[0], -dir[1], -dir[2]];
  let R = [-F[2], 0, F[0]];
  const rl = Math.hypot(R[0], R[2]); R = [R[0] / rl, 0, R[2] / rl];
  const Uv = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  const o = HALF + 0.12, top = 3.45;
  const pts = [[-HALF, 0, -HALF], [o, 0, -HALF], [-HALF, 0, o], [o, 0, o], [-HALF, top, -HALF]];
  const lt = m.S * U + BOARD_T + 0.35;
  for (const [c, r] of m.ledge) for (const dx of [0, 1]) for (const dz of [0, 1]) pts.push([-HALF + (c + dx) * U, lt, -HALF + (r + dz) * U]);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const zc = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
    const u = (d[0] * R[0] + d[2] * R[2]) / zc, v = -(d[0] * Uv[0] + d[1] * Uv[1] + d[2] * Uv[2]) / zc;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const W = BOARD.w, H = BOARD.h;
  const f = Math.min((W - 2 * MARGIN.x) / (u1 - u0), (H - MARGIN.top - MARGIN.bottom) / (v1 - v0));
  const cx = W / 2 - (f * (u0 + u1)) / 2;
  const cy = H - MARGIN.bottom - f * v1;
  cam = RT.camFromBasis({ eye, F, R, U: Uv, f, cx, cy, W, H });
  CAMS.set(m, cam);
  return cam;
}

function slab(o, d, x0, y0, z0, x1, y1, z1) {
  let tn = -Infinity, tf = Infinity;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo[a] || o[a] > hi[a]) return Infinity; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tn) tn = t1;
    if (t2 < tf) tf = t2;
    if (tn > tf) return Infinity;
  }
  return tn > 1e-6 ? tn : Infinity;
}
const PERSON = { r: 0.27, h: 1.78 };
const NONE = { kind: 'none' };
function castAt(m, cam, H, px, py) {
  const dd = RT.camDir(cam, px, py), d = [dd[0], dd[1], dd[2]], o = cam.eye;
  const { ledge, person } = baseOf(m);
  let best = Infinity, hit = NONE;
  if (d[0] < 0) { const t = (-HALF - o[0]) / d[0]; if (t > 0 && o[1] + t * d[1] >= 0 && t < best) { best = t; hit = NONE; } }
  if (d[2] < 0) { const t = (-HALF - o[2]) / d[2]; if (t > 0 && o[1] + t * d[1] >= 0 && t < best) { best = t; hit = NONE; } }
  if (d[1] < 0) {
    const t = -o[1] / d[1];
    if (t < best) {
      best = t;
      const c = Math.floor((o[0] + t * d[0] + HALF) / U), r = Math.floor((o[2] + t * d[2] + HALF) / U);
      hit = inb(c, r) ? { kind: 'cell', i: idx(c, r) } : NONE;
    }
  }
  for (let i = 0; i < G * G; i++) {
    if (H[i] <= 0) continue;
    const c = cOf(i), r = rOf(i), x0 = -HALF + c * U, z0 = -HALF + r * U;
    const top = H[i] * U + (ledge.has(i) ? BOARD_T : 0);
    const t = slab(o, d, x0, 0, z0, x0 + U, top, z0 + U);
    if (t < best) { best = t; hit = ledge.has(i) ? { kind: 'ledge' } : { kind: 'cell', i }; }
  }
  const pc = [wx(cOf(person)), wz(rOf(person))];
  const ox = o[0] - pc[0], oz = o[2] - pc[1], A = d[0] * d[0] + d[2] * d[2];
  if (A > 1e-12) {
    const B = ox * d[0] + oz * d[2], C = ox * ox + oz * oz - PERSON.r * PERSON.r, disc = B * B - A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / A, y = o[1] + t * d[1];
      if (t > 0 && t < best && y >= 0 && y <= PERSON.h) { best = t; hit = { kind: 'person' }; }
      else if (d[1] < 0) {
        const tt = (PERSON.h - o[1]) / d[1], qx = ox + tt * d[0], qz = oz + tt * d[2];
        if (tt > 0 && tt < best && qx * qx + qz * qz <= PERSON.r * PERSON.r) { best = tt; hit = { kind: 'person' }; }
      }
    }
  }
  return hit;
}
const onBoard = (px, py) => px >= 0 && py >= 0 && px <= BOARD.w && py <= BOARD.h;
function dropTarget(m, cam, n, s, px, py) {
  if (!onBoard(px, py)) return -1;
  const n2 = n.slice(); n2[s]--;
  const h = castAt(m, cam, heightsOf(m, n2), px, py);
  if (h.kind !== 'cell') return -1;
  if (h.i === s) return s;
  return canMove(m, n, s, h.i) ? h.i : -1;
}
function pickSource(m, cam, n, px, py) {
  if (!onBoard(px, py)) return -1;
  const h = castAt(m, cam, heightsOf(m, n), px, py);
  return h.kind === 'cell' && n[h.i] > 0 ? h.i : -1;
}

function regionIn(m, cam, H, bb, want, step = STEP) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    const p = cam.project(k & 1 ? bb[3] : bb[0], k & 2 ? bb[4] : bb[1], k & 4 ? bb[5] : bb[2]);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const pts = [];
  const sx = Math.max(step / 2, Math.floor(x0 / step) * step + step / 2), sy = Math.max(step / 2, Math.floor(y0 / step) * step + step / 2);
  for (let y = sy; y <= Math.min(BOARD.h, y1 + step); y += step) for (let x = sx; x <= Math.min(BOARD.w, x1 + step); x += step) {
    if (want(castAt(m, cam, H, x, y))) pts.push(x, y);
  }
  return { k: pts.length / 2, pts };
}
const colBox = (i, h) => { const x0 = -HALF + cOf(i) * U, z0 = -HALF + rOf(i) * U; return [x0, 0, z0, x0 + U, Math.max(h, 0) * U + BOARD_T, z0 + U]; };
const cellRegion = (m, cam, H, i) => regionIn(m, cam, H, colBox(i, H[i]), (h) => h.kind === 'cell' && h.i === i);

function innerPoint(region, test) {
  const p = region.pts;
  if (!p.length) return null;
  let sx = 0, sy = 0;
  for (let k = 0; k < p.length; k += 2) { sx += p[k]; sy += p[k + 1]; }
  sx /= p.length / 2; sy /= p.length / 2;
  let best = null, bd = Infinity;
  for (let k = 0; k < p.length; k += 2) {
    const x = p[k], y = p[k + 1];
    let inside = true;
    for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-4, -4], [4, 4], [-4, 4], [4, -4]]) if (!test(x + dx, y + dy)) { inside = false; break; }
    if (!inside) continue;
    const d = Math.hypot(x - sx, y - sy);
    if (d < bd) { bd = d; best = [Math.round(x), Math.round(y)]; }
  }
  return best;
}

const PLANS = new WeakMap();
function planOf(m) {
  if (PLANS.has(m)) return PLANS.get(m);
  const lay = bestLayout(m);
  let plan = null;
  if (lay) {
    const I = initCounts(m), srcs = [], dsts = [];
    for (let i = 0; i < G * G; i++) {
      for (let k = 0; k < I[i] - lay.n[i]; k++) srcs.push(i);
      for (let k = 0; k < lay.n[i] - I[i]; k++) dsts.push(i);
    }
    const cam = camOf(m);
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, j) => perms(a.slice(0, j).concat(a.slice(j + 1))).map((p) => [x, ...p])));
    const seenKey = new Set();
    let tries = 0;
    outer: for (const ps of perms(srcs)) for (const pd of perms(dsts)) {
      const key = ps.join(',') + '|' + pd.join(',');
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      if (++tries > 40) break outer;
      const n = I.slice(), moves = [];
      let ok = true;
      for (let j = 0; j < ps.length && ok; j++) {
        const s = ps[j], t = pd[j];
        if (!canMove(m, n, s, t)) { ok = false; break; }
        const H = heightsOf(m, n);
        const R1 = cellRegion(m, cam, H, s);
        if (R1.k < MIN_VIS) { ok = false; break; }
        const n2 = n.slice(); n2[s]--;
        const H2 = heightsOf(m, n2), R2 = cellRegion(m, cam, H2, t);
        if (R2.k < MIN_VIS) { ok = false; break; }
        const from = innerPoint(R1, (x, y) => pickSource(m, cam, n, x, y) === s);
        const to = innerPoint(R2, (x, y) => dropTarget(m, cam, n, s, x, y) === t);
        if (!from || !to) { ok = false; break; }
        moves.push({ s, t, from, to });
        n[s]--; n[t]++;
      }
      if (ok && solves(m, n)) { plan = { moves, layout: lay.n }; break outer; }
    }
  }
  PLANS.set(m, plan);
  return plan;
}

function structureOk(m) {
  if (!m || m.task !== 'crate_steps_reach' || m.grid !== G) return false;
  if (![3, 4].includes(m.S) || ![3, 4].includes(m.N)) return false;
  if (!m.cam || !(m.cam.az >= 24 && m.cam.az <= 66) || !(m.cam.el >= 35 && m.cam.el <= 43)) return false;
  if (!['N', 'W'].includes(m.wall) || !Array.isArray(m.ledge) || m.ledge.length < 1 || m.ledge.length > 2) return false;
  const used = new Set();
  const cell = (p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && inb(p[0], p[1]);
  for (const p of m.ledge) {
    if (!cell(p) || (m.wall === 'N' ? p[1] !== 0 : p[0] !== 0)) return false;
    if (used.has(idx(p[0], p[1]))) return false; used.add(idx(p[0], p[1]));
  }
  if (m.ledge.length === 2 && Math.abs(m.ledge[0][0] - m.ledge[1][0]) + Math.abs(m.ledge[0][1] - m.ledge[1][1]) !== 1) return false;
  if (!cell(m.gem) || !m.ledge.some((p) => p[0] === m.gem[0] && p[1] === m.gem[1])) return false;
  if (!Array.isArray(m.fixed) || m.fixed.length > 6) return false;
  for (const p of m.fixed) {
    if (!cell(p) || ![1, 2].includes(p[2]) || used.has(idx(p[0], p[1]))) return false;
    used.add(idx(p[0], p[1]));
  }
  if (!cell(m.person) || used.has(idx(m.person[0], m.person[1]))) return false;
  used.add(idx(m.person[0], m.person[1]));
  if (!Array.isArray(m.crates)) return false;
  let tot = 0;
  for (const p of m.crates) {
    if (!cell(p) || !Number.isInteger(p[2]) || p[2] < 1 || p[2] > 2 || used.has(idx(p[0], p[1]))) return false;
    used.add(idx(p[0], p[1])); tot += p[2];
  }
  return tot === m.N;
}
function templateWorks(m, d) {
  const { f, ledge, person } = baseOf(m), I = initCounts(m), n = new Array(G * G).fill(0);
  let used = 0;
  const cells = [];
  for (let k = 1; k < m.S; k++) {
    const c = m.gem[0] + d[0] * k, r = m.gem[1] + d[1] * k;
    if (!inb(c, r)) return false;
    const i = idx(c, r), need = m.S - k - f[i];
    if (ledge.has(i) || i === person || need < 0) return false;
    n[i] = need; used += need; cells.push(i);
  }
  if (used > m.N) return false;
  let left = m.N - used;
  for (let i = 0; i < G * G && left > 0; i++) if (!cells.includes(i)) { const k = Math.min(I[i], left); n[i] += k; left -= k; }
  return left === 0 && solves(m, n);
}
const templateDirs = (m) => (m.wall === 'N' ? [[0, 1], [1, 0], [-1, 0]] : [[1, 0], [0, 1], [0, -1]]);

function logicOk(m) {
  if (solves(m, initCounts(m))) return false;
  const k = minCrates(m, m.N);
  if (!(k === m.N || k === m.N - 1)) return false;
  const { f } = baseOf(m);
  if (anySolution(m, (n) => n.filter((v) => v > 0).length === 1)) return false;
  if (anySolution(m, (n) => n.every((v, i) => v === 0 || (v === 1 && f[i] === 0)))) return false;
  if (templateDirs(m).some((d) => templateWorks(m, d))) return false;
  return true;
}
function faceVisible(m, cam, H, i, face) {
  const { ledge, person } = baseOf(m), e = cam.eye, c = cOf(i), r = rOf(i);
  const x0 = -HALF + c * U, z0 = -HALF + r * U, top = H[i] * U + (ledge.has(i) ? BOARD_T : 0);
  const pc = [wx(cOf(person)), wz(rOf(person))];
  let vis = 0, tot = 0;
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    const s = 0.1 + 0.2 * a, t = 0.1 + 0.2 * b;
    const P = face === 'top' ? [x0 + s * U, top, z0 + t * U] : face === 'x' ? [x0 + U, t * top, z0 + s * U] : [x0 + s * U, t * top, z0 + U];
    const d = [P[0] - e[0], P[1] - e[1], P[2] - e[2]], dl = Math.hypot(d[0], d[1], d[2]), dn = [d[0] / dl, d[1] / dl, d[2] / dl];
    let hidden = false;
    for (let j = 0; j < G * G && !hidden; j++) {
      if (H[j] <= 0) continue;
      const bx = -HALF + cOf(j) * U, bz = -HALF + rOf(j) * U;
      if (slab(e, dn, bx, 0, bz, bx + U, H[j] * U + (ledge.has(j) ? BOARD_T : 0), bz + U) < dl - 1e-3) hidden = true;
    }
    if (!hidden) {
      const ox = e[0] - pc[0], oz = e[2] - pc[1], A = dn[0] * dn[0] + dn[2] * dn[2], B = ox * dn[0] + oz * dn[2];
      const disc = B * B - A * (ox * ox + oz * oz - PERSON.r * PERSON.r);
      if (disc >= 0) { const tt = (-B - Math.sqrt(disc)) / A, y = e[1] + tt * dn[1]; if (tt > 0 && tt < dl && y >= 0 && y <= PERSON.h) hidden = true; }
    }
    tot++; if (!hidden) vis++;
  }
  return vis / tot;
}
const readable = (m, cam, H, i) => faceVisible(m, cam, H, i, 'top') >= 0.5 && Math.max(faceVisible(m, cam, H, i, 'x'), faceVisible(m, cam, H, i, 'z')) >= 0.4;

function visibleOk(m) {
  const cam = camOf(m), n = initCounts(m), H = heightsOf(m, n), { person, ledge } = baseOf(m);
  const pc = [wx(cOf(person)), wz(rOf(person))];
  const pb = [pc[0] - 0.3, 0, pc[1] - 0.3, pc[0] + 0.3, PERSON.h, pc[1] + 0.3];
  const pv = regionIn(m, cam, H, pb, (h) => h.kind === 'person').k;
  const pa = regionIn(m, cam, baseOf(m).f.map((v, i) => (ledge.has(i) ? v : 0)), pb, (h) => h.kind === 'person').k;
  if (pv < 80 || pv < 0.85 * pa) return false;
  let lk = 0;
  for (const i of ledge) lk += regionIn(m, cam, H, colBox(i, m.S), (h) => h.kind === 'ledge').k;
  if (lk < 120) return false;
  for (const [c, r] of m.fixed) if (cellRegion(m, cam, H, idx(c, r)).k < MIN_VIS || !readable(m, cam, H, idx(c, r))) return false;
  for (const [c, r] of m.crates) if (cellRegion(m, cam, H, idx(c, r)).k < MIN_VIS || !readable(m, cam, H, idx(c, r))) return false;
  if (!m.ledge.some(([c, r]) => readable(m, cam, H, idx(c, r)))) return false;
  const gx = wx(m.gem[0]), gz = wz(m.gem[1]), gy = m.S * U + BOARD_T + 0.1;
  const p = cam.project(gx, gy, gz);
  if (!(p.x > 12 && p.x < BOARD.w - 12 && p.y > 12 && p.y < BOARD.h - 12)) return false;
  const e = cam.eye, d = [gx - e[0], gy - e[1], gz - e[2]], dl = Math.hypot(d[0], d[1], d[2]);
  const dn = [d[0] / dl, d[1] / dl, d[2] / dl];
  for (let i = 0; i < G * G; i++) {
    if (H[i] <= 0 || ledge.has(i)) continue;
    const x0 = -HALF + cOf(i) * U, z0 = -HALF + rOf(i) * U;
    if (slab(e, dn, x0, 0, z0, x0 + U, H[i] * U, z0 + U) < dl) return false;
  }
  return true;
}
function planOk(m) {
  const p = planOf(m);
  return !!p && p.moves.length >= 3 && p.moves.length <= 6;
}
const PATH_VIS = 0.5, LEDGE_SIDE = 0.75, ROUTE_SIDE = 0.6;
function pathVisible(m) {
  const p = planOf(m), cam = camOf(m), H1 = heightsOf(m, p.layout), H0 = heightsOf(m, initCounts(m)), { ledge, person } = baseOf(m);
  const prev = new Map([[person, -1]]), q = [person];
  let end = -1;
  for (let h = 0; h < q.length && end < 0; h++) {
    const c = q[h];
    if (ledge.has(c)) { end = c; break; }
    for (const [dc, dr] of N4) {
      const nc = cOf(c) + dc, nr = rOf(c) + dr;
      if (!inb(nc, nr)) continue;
      const j = idx(nc, nr);
      if (prev.has(j) || H1[j] - H1[c] > 1) continue;
      prev.set(j, c); q.push(j);
    }
  }
  if (end < 0) return false;
  const side = (i) => Math.max(faceVisible(m, cam, H0, i, 'x'), faceVisible(m, cam, H0, i, 'z'));
  if (![...ledge].some((i) => side(i) >= LEDGE_SIDE)) return false;
  for (let i = prev.get(end); i !== person && i !== -1; i = prev.get(i)) if (baseOf(m).f[i] > 0 && side(i) < ROUTE_SIDE) return false;
  for (let i = prev.get(end); i !== person && i !== -1; i = prev.get(i)) {
    const y = H0[i] * U;
    let ok = 0;
    for (let a = 1; a <= 7; a++) for (let b = 1; b <= 7; b++) {
      const pt = cam.project(-HALF + (cOf(i) + a / 8) * U, y, -HALF + (rOf(i) + b / 8) * U), hit = castAt(m, cam, H0, pt.x, pt.y);
      if (hit.kind === 'cell' && hit.i === i) ok++;
    }
    if (ok / 49 < PATH_VIS) return false;
  }
  return true;
}
export function gate(m) {
  try { return structureOk(m) && logicOk(m) && visibleOk(m) && planOk(m) && pathVisible(m); } catch { return false; }
}
export const _fallbackForTest = () => JSON.parse(JSON.stringify(FALLBACK));

const BASE_OPTS = {
  3: [[0, 0]],
  4: [[2, 0, 0], [0, 2, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1], [2, 1, 0], [2, 0, 1], [1, 2, 0], [0, 2, 1], [1, 1, 1]],
};
const SHIRTS = ['#3f6fa8', '#b5523b', '#4f7d4a', '#7a5a9a', '#c08a2e'];
function tryBuild(rng) {
  const S = rng.raw() < 0.5 ? 3 : 4;
  const wall = rng.raw() < 0.5 ? 'N' : 'W';
  const w = rng.raw() < 0.45 ? 1 : 2;
  const a0 = rng.int(0, G - w);
  const ledge = [];
  for (let k = 0; k < w; k++) ledge.push(wall === 'N' ? [a0 + k, 0] : [0, a0 + k]);
  if (a0 === 0 && rng.raw() < 0.5) return null;
  const occ = new Map();
  ledge.forEach(([c, r]) => occ.set(idx(c, r), 'L'));
  let cur = rng.pick(ledge);
  const path = [];
  for (let k = 0; k < S; k++) {
    const opts = N4.map(([dc, dr]) => [cur[0] + dc, cur[1] + dr]).filter(([c, r]) => inb(c, r) && !occ.has(idx(c, r)));
    if (!opts.length) return null;
    cur = rng.pick(opts);
    occ.set(idx(cur[0], cur[1]), 'P');
    path.push(cur);
  }
  const bases = rng.pick(BASE_OPTS[S]);
  const need = bases.map((_, k) => S - 1 - k);
  const C = need.reduce((a, v, k) => a + v - bases[k], 0);
  const Ns = [C, C + 1].filter((v) => v === 3 || v === 4);
  if (!Ns.length) return null;
  const N = rng.pick(Ns);
  const fixed = [];
  bases.forEach((b, k) => { if (b > 0) fixed.push([path[k][0], path[k][1], b]); });
  const free = () => {
    const out = [];
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (!occ.has(idx(c, r))) out.push([c, r]);
    return out;
  };
  if (rng.raw() < 0.45) {
    const cands = [];
    for (const [lc, lr] of ledge) for (const [dc, dr] of D8) {
      const c = lc + dc, r = lr + dr;
      if (!inb(c, r) || occ.has(idx(c, r))) continue;
      if (ledge.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) === 1)) continue;
      cands.push([c, r]);
    }
    if (cands.length) { const p = rng.pick(cands); fixed.push([p[0], p[1], 2]); occ.set(idx(p[0], p[1]), 'F'); }
  }
  const extra = rng.int(0, 2);
  for (let k = 0; k < extra; k++) {
    const fr = free();
    if (!fr.length) break;
    const p = rng.pick(fr);
    fixed.push([p[0], p[1], rng.raw() < 0.6 ? 1 : 2]); occ.set(idx(p[0], p[1]), 'F');
  }
  const gem = rng.pick(ledge);
  const manOn = [];
  for (const d of templateDirs({ wall })) {
    const tiles = [];
    let open = true;
    for (let k = 1; k < S && open; k++) {
      const c = gem[0] + d[0] * k, r = gem[1] + d[1] * k;
      const st = fixed.find((q) => q[0] === c && q[1] === r);
      if (!inb(c, r) || occ.get(idx(c, r)) === 'L' || (st && st[2] > S - k)) open = false;
      else tiles.push([c, r]);
    }
    if (!open) continue;
    const last = tiles[tiles.length - 1], freeTiles = tiles.filter(([c, r]) => !occ.has(idx(c, r)));
    const opts = [];
    if (!occ.has(idx(last[0], last[1]))) opts.push('stone');
    if (freeTiles.length) opts.push('man');
    if (!opts.length) continue;
    if (rng.pick(opts) === 'stone') { fixed.push([last[0], last[1], 2]); occ.set(idx(last[0], last[1]), 'F'); }
    else manOn.push(freeTiles);
  }
  let pf = free();
  if (manOn.length) for (const list of manOn) pf = pf.filter(([c, r]) => list.some(([a, b]) => a === c && b === r));
  else pf = pf.filter(([c, r]) => !ledge.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) <= 1));
  if (!pf.length) return null;
  const person = rng.pick(pf);
  occ.set(idx(person[0], person[1]), 'M');
  const near = (c, r) => path.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) <= 0) || ledge.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) <= 1);
  const shapes = N === 3 ? [[2, 1], [1, 1, 1], [1, 2]] : [[2, 2], [2, 1, 1], [1, 1, 1, 1], [1, 2, 1]];
  const counts = rng.pick(shapes);
  const fr = rng.shuffle(free().filter(([c, r]) => !near(c, r)));
  let pile = null;
  for (const start of fr) {
    const cells = [start], seen = new Set([idx(start[0], start[1])]);
    for (let k = 1; k < counts.length; k++) {
      const opts = [];
      for (const [c, r] of cells) for (const [dc, dr] of N4) {
        const nc = c + dc, nr = r + dr;
        if (inb(nc, nr) && !occ.has(idx(nc, nr)) && !seen.has(idx(nc, nr)) && !near(nc, nr)) opts.push([nc, nr]);
      }
      if (!opts.length) break;
      const p = rng.pick(opts); cells.push(p); seen.add(idx(p[0], p[1]));
    }
    if (cells.length === counts.length) { pile = cells.map((p, k) => [p[0], p[1], counts[k]]); break; }
  }
  if (!pile) return null;
  const m = {
    task: 'crate_steps_reach', grid: G, board: { ...BOARD }, S, N, wall,
    ledge, gem, fixed, person, crates: pile,
    cam: { az: Math.round(rng.uniform(24, 66) * 10) / 10, el: Math.round(rng.uniform(35, 43) * 10) / 10 },
    look: { shirt: rng.pick(SHIRTS) },
    plannedSteps: path.slice(0, S - 1),
  };
  return gate(m) ? m : null;
}

export function semanticKey(m) {
  const enc = (T) => {
    const f = (p) => (T ? [p[1], p[0], ...p.slice(2)] : p.slice()).join(',');
    const wall = T ? (m.wall === 'N' ? 'W' : 'N') : m.wall;
    return [`S${m.S}`, `N${m.N}`, wall, m.ledge.map(f).sort().join(' '), f(m.gem), m.fixed.map(f).sort().join(' '), f(m.person), m.crates.map(f).sort().join(' ')].join('|');
  };
  const a = enc(false), b = enc(true);
  return `crate_steps_reach|${a < b ? a : b}`;
}

const EVAL_KEYS = new Set(["S3|N3|N|0,0|0,0|2,0,2 3,3,1|0,2|2,4,1 3,4,1 4,4,1","S3|N3|N|3,0 4,0|4,0|4,2,2|0,2|1,4,1 2,4,1 3,4,1","S4|N3|N|1,0 2,0|2,0|3,0,1 4,0,2|2,1|1,3,2 1,4,1","S4|N4|N|1,0 2,0|1,0|3,4,1 4,0,2|1,2|0,3,2 0,4,1 1,3,1","S4|N4|N|1,0 2,0|1,0|1,3,2 3,0,2 4,0,1|1,4|2,3,2 3,3,2","S4|N3|N|2,0 3,0|3,0|3,1,1 4,0,2 4,4,1|3,3|1,3,2 1,4,1","S3|N4|N|3,0 4,0|4,0||4,2|0,0,2 0,1,2","S4|N4|N|0,0|0,0|0,3,2 1,0,2|3,0|1,4,1 2,4,1 3,3,1 3,4,1","S3|N4|N|0,0 1,0|0,0||0,1|3,4,2 4,4,2","S4|N4|N|2,0 3,0|3,0|2,1,2 3,1,1 4,0,2|3,2|1,3,1 1,4,2 2,4,1","S4|N4|N|1,0 2,0|2,0|2,1,2|2,3|0,2,1 0,3,1 0,4,1 1,4,1","S3|N3|N|1,0 2,0|2,0|4,0,2|2,1|3,2,1 3,3,1 3,4,1"].map((k) => `crate_steps_reach|${k}`));

const FALLBACK = {"task": "crate_steps_reach", "grid": 5, "board": {"w": 340, "h": 420}, "S": 4, "N": 3, "wall": "N", "ledge": [[1, 0], [2, 0]], "gem": [2, 0], "fixed": [[3, 0, 2], [4, 0, 1], [0, 1, 2]], "person": [2, 2], "crates": [[0, 2, 1], [1, 2, 1], [1, 3, 1]], "cam": {"az": 43.3, "el": 41.6}, "look": {"shirt": "#b5523b"}, "plannedSteps": [[3, 0], [4, 0], [4, 1]]};

function crateTex() {
  const L = RT.lin('#c99a62'), D = RT.lin('#8a6236');
  return (x, y, z, nx, ny, nz, s, out) => {
    const [lu, lv] = RT.boxLocal(s, x, z), ly = y - s.cy;
    let a, b;
    if (Math.abs(ny) > 0.7) { a = lu / s.hx; b = lv / s.hz; }
    else if (Math.abs(nx * s.ca - nz * s.sa) > 0.7) { a = lv / s.hz; b = ly / s.hy; }
    else { a = lu / s.hx; b = ly / s.hy; }
    const edge = Math.max(Math.abs(a), Math.abs(b)) > 0.8;
    const grain = RT.fbm((x + z) * 30 + s.id * 3.1, y * 30 + (x - z) * 4, 2);
    const plank = Math.abs(((b + 1) * 2.5) % 1 - 0.5) > 0.46;
    RT.mixInto(out, D, L, edge ? 0.15 + 0.2 * grain : (plank ? 0.3 : 0.55 + 0.35 * grain));
  };
}
function stoneTex() {
  const A = RT.lin('#b3aea4'), B = RT.lin('#8c877e');
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 7 + z * 5, y * 7 + (x - z) * 2.5, 3);
    const t = RT.hash2(s.id * 13 + Math.round(s.cy * 8), 5);
    RT.mixInto(out, B, A, 0.2 + 0.45 * n + 0.3 * t);
  };
}
function floorFn() {
  const A = RT.lin('#d9d3c7'), B = RT.lin('#c8c1b3'), GR = RT.lin('#8e877b'), EDGE = RT.lin('#5f5a52');
  const plank = RT.plankFloor({ plank: 0.16, plankL: 1.3, base: '#9f7a55', dark: '#7d5c3e', light: '#b38c64' });
  return (x, z, fp, out) => {
    if (x > HALF + 0.045 || z > HALF + 0.045) plank(x, z, fp, out);
    else if (x > HALF || z > HALF) { out[0] = EDGE[0]; out[1] = EDGE[1]; out[2] = EDGE[2]; }
    else {
      const gx = (x + HALF) / U, gz = (z + HALF) / U, ix = Math.floor(gx), iz = Math.floor(gz);
      const n = RT.fbm(x * 6, z * 6, 3, fp);
      RT.mixInto(out, A, B, 0.3 * RT.hash2(ix + 11, iz + 3) + 0.5 * n);
      const gm = Math.max(RT.lineMask(x + HALF, U, 0.009, fp), RT.lineMask(z + HALF, U, 0.009, fp));
      RT.mixInto(out, out, GR, 0.9 * gm);
    }
    const dw = Math.min(x + HALF, z + HALF);
    const k = 1 - 0.22 * Math.exp(-Math.max(0, dw) / 0.12);
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
}
function wallFn(side) {
  const W = RT.lin('#e7e0d4'), SK = RT.lin('#7c6a58');
  return (u, y, fp, out) => {
    const n = RT.fbm(u * 4 + (side ? 9 : 0), y * 4, 3, fp);
    if (y < 0.1) { out[0] = SK[0]; out[1] = SK[1]; out[2] = SK[2]; }
    else { const k = 0.96 + 0.06 * n; out[0] = W[0] * k; out[1] = W[1] * k; out[2] = W[2] * k; }
    const kc = (1 - 0.25 * Math.exp(-Math.max(0, u + HALF) / 0.18)) * (1 - 0.2 * Math.exp(-Math.max(0, y) / 0.1));
    out[0] *= kc; out[1] *= kc; out[2] *= kc;
  };
}
function lightOf(m) {
  const az = m.cam.az, side = az > 45 ? -1 : 1;
  const ka = ((az + side * 38) * Math.PI) / 180, fa = ((az - side * 55) * Math.PI) / 180;
  return { ...RT.STUDIO_LIGHT, dir: [0.8 * Math.sin(ka), 1.25, 0.8 * Math.cos(ka)],
    fill: { dir: [0.9 * Math.sin(fa), 0.35, 0.9 * Math.cos(fa)], col: [0.3, 0.3, 0.32] } };
}
export function traceScene(m, n, look = null) {
  const cam = camOf(m), { f } = baseOf(m);
  const mats = look ? look.mats(m) : [
    RT.skinMat('#dcae8a'), RT.hairMat('#2f2219'), RT.clothMat(m.look.shirt), RT.clothMat('#34383f'), RT.clothMat('#2a2a2f', 0.22),
    { c: RT.lin('#b88a55'), ks: 0.08, sh: 14, tex: crateTex() },
    { c: RT.lin('#a29d94'), ks: 0.05, sh: 10, tex: stoneTex() },
    { c: RT.lin('#8a5f3a'), ks: 0.1, sh: 18 },
    { c: RT.lin('#e0284a'), ks: 1.1, sh: 90, env: 0.35 },
  ];
  const shapes = [], e = 0.006;
  m.ledge.forEach(([c, r], j) => {
    for (let k = 0; k < m.S; k++) shapes.push(RT.shape.box(200 + j, 6, wx(c), (k + 0.5) * U, wz(r), U / 2 - e, U / 2 - 0.001, U / 2 - e, 0, 0.022));
  });
  {
    const cs = m.ledge.map((p) => p[0]), rs = m.ledge.map((p) => p[1]), o = 0.035;
    let x0 = -HALF + Math.min(...cs) * U - o, x1 = -HALF + (Math.max(...cs) + 1) * U + o;
    let z0 = -HALF + Math.min(...rs) * U - o, z1 = -HALF + (Math.max(...rs) + 1) * U + o;
    if (m.wall === 'N') z0 = -HALF; else x0 = -HALF;
    x0 = Math.max(x0, -HALF); z0 = Math.max(z0, -HALF);
    shapes.push(RT.shape.box(210, 7, (x0 + x1) / 2, m.S * U + BOARD_T / 2, (z0 + z1) / 2, (x1 - x0) / 2, BOARD_T / 2, (z1 - z0) / 2, 0, 0.01));
    const gx = wx(m.gem[0]), gz = wz(m.gem[1]), y0 = m.S * U + BOARD_T;
    const s3 = 1 / Math.sqrt(3), s6 = 1 / Math.sqrt(6), s2 = 1 / Math.sqrt(2), yw = 0.4;
    const rot = (v) => [v[0] * Math.cos(yw) - v[2] * Math.sin(yw), v[1], v[0] * Math.sin(yw) + v[2] * Math.cos(yw)];
    const ax = [rot([2 * s6, s3, 0]), rot([-s6, s3, s2]), rot([-s6, s3, -s2])];
    const hg = 0.085;
    shapes.push(RT.shape.obox(220, 8, [gx, y0 + hg * Math.sqrt(3) - 0.012, gz], ax, [hg, hg, hg], 0.006));
  }
  m.fixed.forEach(([c, r, h], j) => {
    for (let k = 0; k < h; k++) shapes.push(RT.shape.box(300 + j, 6, wx(c), (k + 0.5) * U, wz(r), U / 2 - e, U / 2 - 0.001, U / 2 - e, 0, 0.022));
  });
  for (let i = 0; i < G * G; i++) for (let k = 0; k < n[i]; k++) {
    const lvl = f[i] + k, hs = U * 0.45;
    shapes.push(RT.shape.box(400 + i * 4 + k, 5, wx(cOf(i)), (lvl + 0.5) * U, wz(rOf(i)), hs, U / 2 - 0.001, hs, 0, 0.02));
  }
  const px = wx(m.person[0]), pz = wz(m.person[1]);
  let fx = wx(m.gem[0]) - px, fz = wz(m.gem[1]) - pz;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  shapes.push(...RT.personShapes(70, RT.standPose(px, pz, fx, fz, 1.75), { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4 }));
  if (look) return RT.makeScene({ cam, shapes, mats, light: look.light(lightOf(m)), env: look.env });
  const light = lightOf(m);
  return RT.makeScene({ cam, shapes, mats, light,
    env: { floorY: 0, floor: floorFn(), wallZ: -HALF, wall: wallFn(0), wallX: -HALF, wallXDir: 1, wallSide: wallFn(1), sky: RT.softSky } });
}

const TILE_SKIP = new Set(['stone_tiles_02', 'interior_tiles', 'hexagonal_concrete_paving', 'square_floor_patern_01', 'floor_pattern_02',
  'pavement_02', 'rough_plasterbrick_05', 'cobblestone_floor_08', 'dry_riverbed_rock', 'brick_moss_001']);
const PLAIN_STONE = (t) => t.use === 'stone' && /rock|cliff|seaside|surface/.test(t.id);
const CRATE_KINDS_X = ['slat', 'plank', 'plastic', 'panel'];
const CRATE_TINTS = ['#b88a55', '#c99a62', '#a8764a', '#d0a670', '#5f7f5a', '#4f6f8f', '#8a4a3a', '#c8a040', '#6d7f8c', '#3f6f6a'];
const SKINS = ['#dcae8a', '#c68e6a', '#8d5a3c', '#f0c8a8', '#a8724f', '#e6b896'];
const HAIRS = ['#2f2219', '#5a3a22', '#b08a50', '#1a1a1a', '#7a7a78', '#8a4a2a'];
const SHIRTS_X = ['#3f6fa8', '#b5523b', '#4f7d4a', '#7a5a9a', '#c08a2e', '#2f8a8a', '#d6d2c4', '#46505e', '#a8a03a', '#c07090', '#5a7fc0', '#7a4a32'];
const TROUSERS = ['#34383f', '#3b4a63', '#5a4a3a', '#2a2a2f', '#6b6f5a', '#8a8378'];
export async function styleLook(style, m) {
  const tiles = style.pool('tex', (t) => (t.use === 'floor' || PLAIN_STONE(t)) && !TILE_SKIP.has(t.id));
  const walls = style.pool('tex', (t) => t.use === 'wall');
  const hdris = style.pool('hdri');
  const [ti, wi, hi] = style.primaryCombo('tile-wall-hdri', [tiles.length, walls.length, hdris.length]);
  const tl = tiles[ti], wl = walls[wi], hd = hdris[hi], rnd = style.rand;
  style.note(`tex:${tl.id}`); style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const stoneItem = style.pick('tex', (t) => PLAIN_STONE(t) || /^concrete_wall_00|^concrete$|^cracked_concrete_wall$/.test(t.id));
  const woodItem = style.pick('tex', (t) => t.use === 'wood'), outerItem = style.pick('tex', (t) => t.use === 'wood' || t.use === 'floor');
  const [TT, TW, sky, TS, TWd, TO] = await loadAll([tl, wl, hd, stoneItem, woodItem, outerItem]);
  const kind = pickOf(style, 'crate_steps_reach|crate-kind', CRATE_KINDS_X);
  const face = faceColour(TT.mean, 0.3 + 0.3 * rnd(), { warm: [18, 55, 0.35], otherSat: 0.1 });
  const grout = S3.scaleTo(S3.limitSat(face, 0.08), S3.lum(face) * 0.42), EDGE = RT.lin('#5f5a52');
  const tm = texMod(TT, { cv: 0.14, texWorld: 0.9, lo: 0.7, hi: 1.3 }), salt = 1 + Math.floor(rnd() * 997);
  const oface = faceColour(TO.mean, 0.12 + 0.18 * rnd(), { warm: [18, 55, 0.55], otherSat: 0.12 }), om = texMod(TO, { cv: 0.25, texWorld: 1.6, lo: 0.5, hi: 1.5 });
  const floor = (x, z, fp, out) => {
    if (x > HALF + 0.045 || z > HALF + 0.045) { const t = om(z, x, fp); for (let c = 0; c < 3; c++) out[c] = oface[c] * t; }
    else if (x > HALF || z > HALF) { out[0] = EDGE[0]; out[1] = EDGE[1]; out[2] = EDGE[2]; }
    else {
      const gx = (x + HALF) / U, gz = (z + HALF) / U, ix = Math.floor(gx), iz = Math.floor(gz), lx = (gx - ix) * U, lz = (gz - iz) * U;
      const h1 = RT.hash2(ix + salt, iz), r = Math.floor(h1 * 4), a = r === 0 ? lx : r === 1 ? lz : r === 2 ? U - lx : U - lz, b = r === 0 ? lz : r === 1 ? U - lx : r === 2 ? U - lz : lx;
      const t = tm(a + RT.hash2(ix, iz + salt), b + RT.hash2(ix + 7, iz), fp) * (0.95 + 0.1 * RT.hash2(ix + 11, iz + 3));
      for (let c = 0; c < 3; c++) out[c] = face[c] * t;
      const gm = Math.max(RT.lineMask(x + HALF, U, 0.009, fp), RT.lineMask(z + HALF, U, 0.009, fp));
      RT.mixInto(out, out, grout, 0.9 * gm);
    }
    const dw = Math.min(x + HALF, z + HALF);
    const k = 1 - 0.22 * Math.exp(-Math.max(0, dw) / 0.12);
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
  const wface = faceColour(TW.mean, 0.35 + 0.3 * rnd(), { warm: [18, 55, 0.3], otherSat: 0.1 }), SK = wface.map((v) => v * 0.45);
  const wm = texMod(TW, { cv: 0.22, texWorld: 1.4, lo: 0.55, hi: 1.45 });
  const wallFnS = (side) => (u, y, fp, out) => {
    if (y < 0.1) { out[0] = SK[0]; out[1] = SK[1]; out[2] = SK[2]; }
    else { const t = wm(u + (side ? 3.7 : 0), -y, fp); for (let c = 0; c < 3; c++) out[c] = wface[c] * t; }
    const kc = (1 - 0.25 * Math.exp(-Math.max(0, u + HALF) / 0.18)) * (1 - 0.2 * Math.exp(-Math.max(0, y) / 0.1));
    out[0] *= kc; out[1] *= kc; out[2] *= kc;
  };
  const sface = faceColour(TS.mean, 0.2 + 0.22 * rnd(), { warm: [18, 55, 0.12], otherSat: 0.06 });
  const sm = texMod(TS, { cv: 0.15, texWorld: 0.8, lo: 0.65, hi: 1.35 });
  const stoneMat = { c: sface, ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.004) => {
    const t = sm(Math.abs(ny) > 0.7 ? x : x + z, Math.abs(ny) > 0.7 ? z : y, fp) * (0.88 + 0.24 * RT.hash2(s.id * 13 + Math.round(s.cy * 8), 5));
    for (let c = 0; c < 3; c++) out[c] = sface[c] * t;
  } };
  const TINTS = splitOf(style, 'crate_steps_reach|crate-colour', CRATE_TINTS, (h) => h, 3);
  const tints = TINTS.filter((h) => S3.deltaE(RT.lin(h), sface) >= 25 && S3.deltaE(RT.lin(h), face) >= 15);
  const tint = (tints.length ? tints : TINTS)[Math.floor(rnd() * (tints.length || TINTS.length))];
  style.note(`crate_steps_reach|crate-colour:${tint}`);
  const crateMat = S3.crateMaterial({ kind, tint, wood: kind === 'plastic' ? null : TWd });
  const boardC = faceColour(TWd.mean, 0.12 + 0.12 * rnd(), { warm: [18, 55, 0.6], otherSat: 0.12 });
  const skin = pickOf(style, 'crate_steps_reach|skin', SKINS), hair = pickOf(style, 'crate_steps_reach|hair', HAIRS);
  const trousers = pickOf(style, 'crate_steps_reach|trousers', TROUSERS), SHIRTS_S = splitOf(style, 'crate_steps_reach|shirt', SHIRTS_X, (h) => h, 3);
  const shirtShift = Math.floor(rnd() * SHIRTS_S.length);
  const shirt = SHIRTS_S[(Math.max(0, SHIRTS.indexOf(m.look.shirt)) + shirtShift) % SHIRTS_S.length];
  style.note(`crate_steps_reach|shirt:${shirt}`);
  const lightJ = rnd();
  style.note(`tex:${stoneItem.id}`);
  return {
    mats: () => [RT.skinMat(skin), RT.hairMat(hair), RT.clothMat(shirt), RT.clothMat(trousers), RT.clothMat('#2a2a2f', 0.22),
      crateMat, stoneMat, { c: boardC, ks: 0.1, sh: 18 }, { c: RT.lin('#e0284a'), ks: 1.1, sh: 90, env: 0.35 }],
    env: { floorY: 0, floor, wallZ: -HALF, wall: wallFnS(0), wallX: -HALF, wallXDir: 1, wallSide: wallFnS(1), sky: S3.skyFn(sky, 0.7) },
    light: (base) => S3.hdriLight(hd, base, { albedo: face, total: totalOf(base), jitter: lightJ }),
    ids: { tile: tl.id, wall: wl.id, hdri: hd.id, stone: stoneItem.id, crate: kind, tint },
  };
}

function boxFaces(cam, x0, y0, z0, x1, y1, z1) {
  const P = (x, y, z) => { const p = cam.project(x, y, z); return [p.x, p.y]; };
  const e = cam.eye, faces = [];
  if (e[1] > y1) faces.push([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]);
  if (e[0] > x1) faces.push([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]);
  if (e[0] < x0) faces.push([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)]);
  if (e[2] > z1) faces.push([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]);
  if (e[2] < z0) faces.push([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)]);
  return faces;
}
function crateBox(m, i, level) {
  const c = cOf(i), r = rOf(i), hs = U * 0.45;
  return [wx(c) - hs, level * U, wz(r) - hs, wx(c) + hs, (level + 1) * U, wz(r) + hs];
}

const DRAG = new WeakMap();

export default {
  meta: {
    name: 'crate_steps_reach', family: 'C', uses3d: true,
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'move', fc: 'col of the column whose top crate is dragged', fr: 'its row', tc: 'col of the tile dropped on', tr: 'its row' },
    ],
    promptHuman: 'Stack crates so he can climb to the gem',
  },

  generate(rng, level, index, knobs = {}) {
    for (let a = 0; a < 3000; a++) { const m = tryBuild(rng); if (m && !(knobs.ext && EVAL_KEYS.has(semanticKey(m)))) return m; }
    return JSON.parse(JSON.stringify(FALLBACK));
  },

  init(m) { return { n: initCounts(m), moves: 0 }; },

  applyAction(st, a, m) {
    if (!a || a.op !== 'move') return { ok: false, reason: 'bad-op' };
    const { fc, fr, tc, tr } = a;
    if (![fc, fr, tc, tr].every(Number.isInteger) || !inb(fc, fr) || !inb(tc, tr)) return { ok: false, reason: 'bad-cell' };
    const s = idx(fc, fr), t = idx(tc, tr);
    if (!canMove(m, st.n, s, t)) return { ok: false, reason: 'cannot-drop' };
    st.n[s]--; st.n[t]++; st.moves++;
    return { ok: true };
  },

  verify(st, m) {
    const ok = solves(m, st.n);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { moves: st.moves } };
  },

  oracle(m) {
    const p = planOf(m);
    return p ? p.moves.map((mv) => ({ op: 'move', fc: cOf(mv.s), fr: rOf(mv.s), tc: cOf(mv.t), tr: rOf(mv.t) })) : [];
  },
  oraclePoints(m) {
    const p = planOf(m);
    if (!p) return [];
    const cam = camOf(m), n = initCounts(m), f = baseOf(m).f, P = (x, y, z) => { const q = cam.project(x, y, z); return [q.x, q.y]; };
    const onTop = (i, y, ok) => {
      const pts = [];
      for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
        const q = P(-HALF + (cOf(i) + a / 10) * U, y, -HALF + (rOf(i) + b / 10) * U);
        if (ok(q[0], q[1])) pts.push(q);
      }
      if (!pts.length) return null;
      const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length, cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
      return pts.reduce((b, q) => (Math.hypot(q[0] - cx, q[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? q : b)).map((v) => +v.toFixed(2));
    };
    return p.moves.map((mv) => {
      const H = heightsOf(m, n), n2 = n.slice(); n2[mv.s]--;
      const top = (i, h) => h * U + (baseOf(m).ledge.has(i) ? BOARD_T : 0);
      const from = onTop(mv.s, top(mv.s, H[mv.s]), (x, y) => pickSource(m, cam, n, x, y) === mv.s)
        ?? (() => { const q = P(wx(cOf(mv.s)), (H[mv.s] - 0.5) * U, wz(rOf(mv.s))); return pickSource(m, cam, n, q[0], q[1]) === mv.s ? q.map((v) => +v.toFixed(2)) : null; })() ?? mv.from;
      const to = onTop(mv.t, top(mv.t, f[mv.t] + n2[mv.t]), (x, y) => dropTarget(m, cam, n, mv.s, x, y) === mv.t) ?? mv.to;
      n[mv.s]--; n[mv.t]++;
      return { from, to };
    });
  },

  randomPolicy(m, rnd) {
    const n = initCounts(m), acts = [], k = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < k; j++) {
      const srcs = [];
      for (let i = 0; i < G * G; i++) if (n[i] > 0) srcs.push(i);
      const s = srcs[Math.floor(rnd() * srcs.length)], t = Math.floor(rnd() * G * G);
      acts.push({ op: 'move', fc: cOf(s), fr: rOf(s), tc: cOf(t), tr: rOf(t) });
      if (canMove(m, n, s, t)) { n[s]--; n[t]++; }
    }
    return acts;
  },

  async mount(env) {
    if (env && env.style) env.assets.look = await styleLook(env.style, env.manifest);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Stack crates so he can climb to the gem', 'He steps up one crate at a time, never diagonally');
  },

  wantsMoveRedraw: true,

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
    const C = (this._cache ??= { m: null, imgs: new Map() }), q = Math.min(1.5, RT.contextScale(g));
    if (C.m !== m) { C.m = m; C.imgs = new Map(); }
    const look = env.style ? env.assets.look : null;
    const key = look ? `${q}|${st.n.join('')}|${env.style.key}` : `${q}|${st.n.join('')}`;
    let canvas = C.imgs.get(key);
    if (!canvas) {
      canvas = RT.toCanvas(RT.render(traceScene(m, st.n, look), q));
      if (C.imgs.size > 24) C.imgs.delete(C.imgs.keys().next().value);
      C.imgs.set(key, canvas);
    }
    g.drawImage(canvas, 0, 0, br.w, br.h);
    const d = DRAG.get(st);
    if (d) {
      const cam = camOf(m), { f } = baseOf(m);
      const src = crateBox(m, d.s, f[d.s] + st.n[d.s] - 1);
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const poly of boxFaces(cam, ...src)) { g.beginPath(); poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
      const t = dropTarget(m, cam, st.n, d.s, d.x, d.y);
      if (t >= 0 && t !== d.s) {
        const lvl = f[t] + st.n[t];
        const faces = boxFaces(cam, ...crateBox(m, t, lvl));
        g.lineJoin = 'round';
        for (const poly of faces) {
          g.beginPath(); poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
          g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
          g.strokeStyle = 'rgba(30,45,60,.45)'; g.lineWidth = 3; g.stroke();
          g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.4; g.stroke();
        }
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    const m = env.manifest, st = env.state, cam = camOf(m);
    if (evt.type === 'down') {
      const s = pickSource(m, cam, st.n, evt.x, evt.y);
      if (s >= 0) DRAG.set(st, { s, x: evt.x, y: evt.y });
      return [];
    }
    const d = DRAG.get(st);
    if (!d) return [];
    if (evt.type === 'move') { d.x = evt.x; d.y = evt.y; return []; }
    if (evt.type === 'up') {
      DRAG.delete(st);
      const t = dropTarget(m, cam, st.n, d.s, evt.x, evt.y);
      if (t < 0 || t === d.s) return [];
      return [{ op: 'move', fc: cOf(d.s), fr: rOf(d.s), tc: cOf(t), tr: rOf(t) }];
    }
    return [];
  },

  footerStatus(env) {
    const k = env.state.moves;
    return k ? `${k} crate${k === 1 ? '' : 's'} moved` : 'Drag a crate onto a tile or a stack';
  },
};
