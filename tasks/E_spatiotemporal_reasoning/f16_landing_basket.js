import { mulberry32, R } from '../core/rng.js';
import { makeTask, mix32, r3, argMin, RT } from '../common/_f16_pick_kit.js';
import * as W from '../common/_f16_landing_basket_scene.js';

const NAME = 'f16_landing_basket';
const PROMPT = 'Which basket will the ball land in?', SUB = 'Answer on the last frame · tap a basket, then Verify';
const N = 12, DT = 0.05, K = 10;
const hy = Math.hypot;

const baskets = (m) => m.baskets.map((_, i) => W.basketScreen(m, i));
const nearestTo = (bs, x, y, ground = false) => argMin(bs.map((b) => hy((ground ? b.gx : b.x) - x, (ground ? b.gy : b.y) - y)));
function fit(ts, vs, quad) {
  const n = ts.length, cols = quad ? 3 : 2, A = ts.map((t) => (quad ? [1, t, t * t] : [1, t]));
  const M = Array.from({ length: cols }, (_, i) => Array.from({ length: cols }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const y = Array.from({ length: cols }, (_, i) => A.reduce((s, r, k) => s + r[i] * vs[k], 0));
  for (let i = 0; i < cols; i++) { for (let j = i + 1; j < cols; j++) { const f = M[j][i] / M[i][i]; for (let k = i; k < cols; k++) M[j][k] -= f * M[i][k]; y[j] -= f * y[i]; } }
  const x = new Array(cols).fill(0); for (let i = cols - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < cols; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  void n; return x;
}
export function screenParabola(m) {
  const ts = [], xs = [], ys = [];
  for (let k = 0; k < m.n; k++) { const b = W.ballScreen(m, k); ts.push(W.timeOf(m, k)); xs.push(b.x); ys.push(b.y); }
  const [ax, bx] = fit(ts, xs, false), [ay, by, cy] = fit(ts, ys, true);
  const t = cy > 1e-6 ? -by / cy : NaN;
  return Number.isFinite(t) && t > 0 ? [ax + bx * t, ay] : null;
}
export function shadowDouble(m) {
  const a = W.ballScreen(m, 0), b = W.ballScreen(m, m.n - 1);
  return [a.sx + 2 * (b.sx - a.sx), a.sy + 2 * (b.sy - a.sy)];
}
export function mirrorAboutWall(m) {
  const P = [2 * m.wall.x - m.p0[0], 2 * m.wall.z - m.p0[2]];
  return argMin(m.baskets.map((b) => hy(b[0] - P[0], b[1] - P[1])));
}
export function lawnDouble(m, tTop = W.topTime(m)) {
  const c = W.camCached(m), ts = [], xs = [], zs = [];
  for (let k = 0; k < m.n; k++) { const b = W.ballScreen(m, k); if (b.onWall) continue; const g = RT.planeAtPixel(c, b.sx, b.sy, 0); if (!g) continue; ts.push(W.timeOf(m, k)); xs.push(g.x); zs.push(g.z); }
  const [ax, bx] = fit(ts, xs, false), [az, bz] = fit(ts, zs, false), tT = tTop;
  return [ax + 2 * bx * tT, az + 2 * bz * tT];
}
export function groundPoints(m) {
  const g = (t) => { const B = W.ballAt(m, t); return [B[0], B[2]]; }, tL = W.timeOf(m, m.n - 1), gl = g(tL), p0 = [m.p0[0], m.p0[2]];
  return { ballGroundLast: gl, mirrorLast: [p0[0] + 2 * (gl[0] - p0[0]), p0[1] + 2 * (gl[1] - p0[1])], apexGround: g(W.topTime(m)) };
}
const byDistance = (m, pt) => m.baskets.map((b, i) => [hy(b[0] - pt[0], b[1] - pt[1]), i]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
function frameReadings(m, k, bs) {
  const B = W.ballScreen(m, k);
  const below = bs.map((b, i) => i).filter((i) => bs[i].y > B.y);
  const out = {
    nearestOnScreen: nearestTo(bs, B.x, B.y),
    belowOnScreen: (below.length ? below : bs.map((_, i) => i)).reduce((a, i) => (Math.abs(bs[i].x - B.x) < Math.abs(bs[a].x - B.x) ? i : a)),
    nearestToShadow: nearestTo(bs, B.sx, B.sy, true),
  };
  if (k >= 1) {
    const A = W.ballScreen(m, k - 1), vx = B.x - A.x, vy = B.y - A.y, vl = hy(vx, vy) || 1;
    out.screenRay = argMin(bs.map((b) => { const px = b.x - B.x, py = b.y - B.y, t = Math.max(0, (px * vx + py * vy) / vl); return hy(px - t * vx / vl, py - t * vy / vl); }));
  }
  return out;
}
const MARGIN = { x: 4, y: 4, cen: 4, size: 0.06 };
function staticCues(bs) {
  const cx = W.VIEW.w / 2, cy = W.VIEW.h / 2, out = [];
  const feat = { x: bs.map((b) => b.x), y: bs.map((b) => b.y), size: bs.map((b) => b.w), cen: bs.map((b) => hy(b.x - cx, b.y - cy)) };
  for (const [nm, v] of Object.entries(feat)) for (const dir of ['max', 'min']) {
    const ord = v.map((x, i) => i).sort((a, b) => (dir === 'max' ? v[b] - v[a] : v[a] - v[b])), gap = Math.abs(v[ord[0]] - v[ord[1]]);
    if (gap >= (nm === 'size' ? MARGIN.size * Math.abs(v[ord[0]]) : MARGIN[nm])) out.push({ cue: `${nm}-${dir}`, picks: ord[0] });
  }
  return out;
}
export function cueList(m) {
  const out = [], bs = baskets(m);
  for (let k = 0; k < m.n; k++) for (const [nm, i] of Object.entries(frameReadings(m, k, bs))) out.push({ frame: k + 1, cue: nm, picks: i });
  for (const c of staticCues(bs)) out.push({ frame: 0, cue: c.cue, picks: c.picks });
  out.push({ frame: 0, cue: 'mirrorAboutWall', picks: mirrorAboutWall(m) });
  { const L0 = W.ballScreen(m, 0), L1 = W.ballScreen(m, 1), dy = (i) => Math.abs(bs[i].y - L0.y), all = bs.map((_, i) => i), side = Math.sign(L1.x - L0.x);
    out.push({ frame: 1, cue: 'launchHeight', picks: all.reduce((a, i) => (dy(i) < dy(a) ? i : a)) });
    const ahead = all.filter((i) => Math.sign(bs[i].x - L0.x) === side);
    if (ahead.length) out.push({ frame: 2, cue: 'launchHeightAhead', picks: ahead.reduce((a, i) => (dy(i) < dy(a) ? i : a)) }); }
  const sd = shadowDouble(m); out.push({ frame: 0, cue: 'shadowDouble', picks: nearestTo(bs, sd[0], sd[1], true) });
  return out;
}
export function readings(m) {
  const bs = baskets(m), last = frameReadings(m, m.n - 1, bs), sp = screenParabola(m), sd = shadowDouble(m);
  const named = new Set(cueList(m).map((c) => c.picks));
  const ld = lawnDouble(m), lh = cueList(m).find((c) => c.cue === 'launchHeight');
  return { ...last, mirrorAboutWall: mirrorAboutWall(m), launchHeight: lh ? lh.picks : null, screenParabola: sp ? nearestTo(bs, sp[0], sp[1]) : null, shadowDouble: nearestTo(bs, sd[0], sd[1], true), lawnDouble: argMin(m.baskets.map((b) => hy(b[0] - ld[0], b[1] - ld[1]))),
    unnamed: [...Array(K).keys()].filter((i) => !named.has(i)) };
}
const GATE = { flightTop: [0.67, 0.75], before: [0.12, 0.2], mirrorFar: 1.0, others: 1.4, apart: 1.15, wallFrames: [2, 3], rank: 2, humanSlack: 0.05 };
export function contract(m) {
  const bad = (why) => ({ ok: false, why });
  if (!m || m.n !== N || m.K !== K || m.baskets?.length !== K || !m.wall) return bad('shape');
  const Ld = W.landing(m), tT = W.topTime(m), tLast = W.timeOf(m, N - 1);
  if (!(tT >= GATE.flightTop[0] && tT <= GATE.flightTop[1] && tT - tLast >= GATE.before[0] - 1e-9 && tT - tLast <= GATE.before[1] + 1e-9)) return bad('clip');
  const dist = m.baskets.map((b) => hy(b[0] - Ld[0], b[1] - Ld[2]));
  if (m.answer !== argMin(dist) || dist[m.answer] > 0.1) return bad('answer');
  for (let i = 0; i < K; i++) if (i !== m.answer && dist[i] < GATE.others) return bad('second-landing');
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (hy(m.baskets[i][0] - m.baskets[j][0], m.baskets[i][1] - m.baskets[j][1]) < GATE.apart) return bad('crowded');
  const onWall = Array.from({ length: N }, (_, k) => W.shadowAt(m, k).onWall);
  const nw = onWall.filter(Boolean).length;
  if (nw < GATE.wallFrames[0] || nw > GATE.wallFrames[1] || onWall.some((w, k) => w !== (k >= N - nw))) return bad('wall-frames');
  const Wl = m.wall, wallDist = (p) => { const dx = p[0] - Wl.x, dz = p[1] - Wl.z, a = dx * Wl.ux + dz * Wl.uz, b = -dx * Wl.uz + dz * Wl.ux; return hy(Math.max(0, Math.abs(a) - Wl.hl), Math.max(0, Math.abs(b) - Wl.ht)); };
  for (const [i, b] of m.baskets.entries()) if (wallDist(b) < W.BASK.r1 + 0.35) return bad('wall-basket');
  if (wallDist([m.p0[0], m.p0[2]]) < 1.0) return bad('wall-launcher');
  for (let t = 0; t <= W.flightTime(m); t += 0.02) { const B = W.ballAt(m, t); if (wallDist([B[0], B[2]]) < W.BALLR + 0.05 && B[1] - W.BALLR < Wl.h + 0.3) return bad('wall-ball'); }
  { const gp = groundPoints(m); for (const [nm, pt] of Object.entries(gp)) if (nm !== 'mirrorLast' && byDistance(m, pt).indexOf(m.answer) < GATE.rank) return bad(`ground-${nm}`);
    for (let k = 0; k < N; k++) { const B = W.ballAt(m, W.timeOf(m, k)); if (byDistance(m, [B[0], B[2]])[0] === m.answer) return bad('ground-any-frame'); } }
  { for (const t of [W.topTime(m) - GATE.humanSlack, W.topTime(m) + GATE.humanSlack]) {
      const P = lawnDouble(m, t), d = m.baskets.map((b) => hy(b[0] - P[0], b[1] - P[1]));
      if (argMin(d) !== m.answer) return bad('human-apex'); } }
  for (let k = 0; k < N; k++) { const b = W.ballScreen(m, k); if (b.x < 16 || b.x > W.VIEW.w - 16 || b.y < 16 || b.y > W.VIEW.h - 16 || b.size < 12) return bad('ball-off'); if (b.sx < 8 || b.sx > W.VIEW.w - 8 || b.sy < 8 || b.sy > W.VIEW.h - 8) return bad('shadow-off'); }
  const bs = baskets(m);
  for (const [i, b] of bs.entries()) if (b.x < 24 || b.x > W.VIEW.w - 24 || b.y < 20 || b.y > W.VIEW.h - 14 || b.w < 22) return bad('basket-off');
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
    if (Math.abs(bs[i].x - bs[j].x) < 0.85 * (bs[i].w + bs[j].w) / 2 && Math.abs(bs[i].y - bs[j].y) < 0.8 * (bs[i].size + bs[j].size) / 2 + 6) return bad('overlap');
  }
  { const P = lawnDouble(m), d = m.baskets.map((b) => hy(b[0] - P[0], b[1] - P[1])), o = d.filter((_, i) => i !== m.answer);
    if (Math.min(...o) - d[m.answer] < 0.5) return bad('human-lawn'); }
  for (let i = 0; i < K; i++) if (i !== m.answer && hy(bs[i].x - bs[m.answer].x, bs[i].y - bs[m.answer].y) < 46) return bad('answer-near-on-screen');
  { const c = W.camCached(m), q = c.project(m.p0[0], m.p0[1], m.p0[2]); if (q.x < 14 || q.x > W.VIEW.w - 14 || q.y < 14 || q.y > W.VIEW.h - 14) return bad('launcher-off'); }
  { const cl = cueList(m), h = cl.find((c) => c.picks === m.answer); if (h) return bad(`cue-${h.cue}`);
    if (K - new Set(cl.map((c) => c.picks)).size < 3) return bad('cue-elimination'); }
  for (let k = 0; k < N; k++) {
    const sc = W.sceneAt(m, k), st = RT.objectStats(sc, 100, 1);
    if (st.frac < 0.9) return bad(`ball-hidden-${k + 1}`);
    if (k === 0 || k === N - 1) for (let i = 0; i < K; i++) { const o = RT.objectStats(sc, i, 2); if (o.frac < 0.75) return bad(`basket-hidden-${i}`); if (o.off > 0 || o.box[0] < 3 || o.box[2] > W.VIEW.w - 3 || o.box[1] < 3 || o.box[3] > W.VIEW.h - 3) return bad('basket-cut'); }
  }
  return { ok: true };
}
export function gate(m) {
  try {
    if (!contract(m).ok) return false;
    const st = task.init(m);
    for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
    return task.verify(st, m).success;
  } catch { return false; }
}
export function frameAudit(m) {
  const hits = cueList(m).filter((c) => c.picks === m.answer);
  return { singleFrame: hits.length > 0, oneFrameCuesOnAnswer: hits, readings: readings(m), answer: m.answer,
    landing: W.landing(m).map(r3), top: r3(W.topTime(m)), lastFrameAfterTop: r3(W.timeOf(m, N - 1) - W.topTime(m)),
    shadowOnWallFrames: Array.from({ length: N }, (_, k) => k).filter((k) => W.shadowAt(m, k).onWall).map((k) => k + 1), frames: m.n, dt: m.dt };
}

const DEGR = Math.PI / 180;
const SPREAD = { ansBeta: [-8, 48], range: [3.8, 7.6], rad: [3.2, 10.0], beta: [-15, 55], dist: [9.6, 11], maxMirrorRank: 5 };
const F = (w) => { (globalThis.__fl ??= {})[w] = (globalThis.__fl[w] || 0) + 1; return null; };
function tryBuild(r) {
  const s = r.sign(), beta = r.uniform(SPREAD.ansBeta[0], SPREAD.ansBeta[1]) * DEGR, tT = r.uniform(GATE.flightTop[0], GATE.flightTop[1]);
  if (tT - DT * (N - 1) < GATE.before[0] || tT - DT * (N - 1) > GATE.before[1]) return F('clip');
  const vy = W.G * tT, vh = r.uniform(SPREAD.range[0], SPREAD.range[1]) / (2 * tT);
  if (2 * vh * (tT - DT * (N - 1)) < GATE.mirrorFar) return F('mirror-near');
  const m = { n: N, dt: DT, K, p0: [-s * r.uniform(2.6, 3.4), W.BASK.h, r.uniform(0.4, 1.8)], v: [s * vh * Math.cos(beta), vy, -vh * Math.sin(beta)], baskets: [] };
  const Ld = W.landing(m), u = [s * Math.cos(beta), -Math.sin(beta)];
  const h = r.uniform(0.6, 0.8), len = r.int(2, 3), kw = N - len;
  const sOn = (k) => { const B = W.ballAt(m, W.timeOf(m, k)); return [B[0] + (-W.LIGHT_DIR[0] / W.LIGHT_DIR[1]) * (B[1] - h), B[2] + (-W.LIGHT_DIR[2] / W.LIGHT_DIR[1]) * (B[1] - h)]; };
  const a0 = sOn(kw), a1 = sOn(N - 1), dv = [a1[0] - a0[0], a1[1] - a0[1]], dl = hy(...dv), du = [dv[0] / dl, dv[1] / dl];
  const th = r.sign() * r.uniform(45, 65) * DEGR, ax = [du[0] * Math.cos(th) - du[1] * Math.sin(th), du[0] * Math.sin(th) + du[1] * Math.cos(th)];
  const cross = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], hl = r.uniform(1.1, 1.4), off = r.sign() * r.uniform(0.6, 0.95) * hl;
  m.wall = { x: cross[0] + ax[0] * off, z: cross[1] + ax[1] * off, ux: ax[0], uz: ax[1], hl, ht: (dl / 2 + 0.09) * Math.abs(Math.sin(th)), h };
  const Wl = m.wall, wallDist = (p) => { const dx = p[0] - Wl.x, dz = p[1] - Wl.z, a = dx * Wl.ux + dz * Wl.uz, b = -dx * Wl.uz + dz * Wl.ux; return hy(Math.max(0, Math.abs(a) - Wl.hl), Math.max(0, Math.abs(b) - Wl.ht)); };
  if (wallDist([Ld[0], Ld[2]]) < W.BASK.r1 + 0.4) return F('wall-landing');
  const pts = [[Ld[0] + r.uniform(-0.06, 0.06), Ld[2] + r.uniform(-0.06, 0.06)]];
  const ok = (p) => pts.every((q) => hy(q[0] - p[0], q[1] - p[1]) >= GATE.apart + 0.05) && hy(p[0] - Ld[0], p[1] - Ld[2]) >= GATE.others + 0.05 && hy(p[0] - m.p0[0], p[1] - m.p0[2]) >= 2.0 && wallDist(p) > W.BASK.r1 + 0.4;
  const gp = groundPoints(m), M = gp.mirrorLast, dM = hy(M[0] - Ld[0], M[1] - Ld[2]), nM = r.int(0, SPREAD.maxMirrorRank);
  for (let t = 0, got = 0; got < nM && t < 300; t++) {
    const a = r.uniform(0, 2 * Math.PI), rr = Math.sqrt(r.uniform(0, 1)) * (dM - 0.12), p = [M[0] + rr * Math.cos(a), M[1] + rr * Math.sin(a)];
    if (ok(p)) { pts.push(p); got++; }
  }
  if (pts.length < 1 + nM) return F('near-M');
  const gam = Math.exp(r.uniform(-1.1, 1.1));
  for (let tries = 0; pts.length < K && tries < 400; tries++) {
    const rr = SPREAD.rad[0] + (SPREAD.rad[1] - SPREAD.rad[0]) * Math.pow(r.uniform(0, 1), gam), be = r.uniform(SPREAD.beta[0], SPREAD.beta[1]) * DEGR;
    const p = [m.p0[0] + s * rr * Math.cos(be), m.p0[2] - rr * Math.sin(be)];
    if (ok(p) && hy(p[0] - M[0], p[1] - M[1]) >= dM + 0.12) pts.push(p);
  }
  if (pts.length < K) return F('fill');
  const cx = 0.6 * pts.reduce((a, p) => a + p[0], 0) / K + 0.4 * m.p0[0], cz = 0.6 * pts.reduce((a, p) => a + p[1], 0) / K + 0.4 * m.p0[2];
  m.cam = { az: r.uniform(-18, 18), el: r.uniform(38, 44), dist: r.uniform(SPREAD.dist[0], SPREAD.dist[1]), fov: r.uniform(50, 54), tgt: [cx + r.uniform(-0.3, 0.3), 0.6, cz + r.uniform(-0.3, 0.3)] };
  const order = r.shuffle([...Array(K).keys()]);
  m.baskets = order.map((j) => pts[j]); m.answer = order.indexOf(0); m.nM = nM;
  m.fenceZ = Math.min(...m.baskets.map((b) => b[1]), Ld[2], m.wall.z - 2) - 3.4;
  void u;
  return m;
}
export const rawBuild = (r) => tryBuild(r);

export const THIN_STATE = { on: true };
export const THIN = {"M":[0.2847,0.0187,0.0113,0.0802,0.9002,1],"gl":[1,1,0.0474,0.0152,0.0281,0.1195,0.7068,1,1],"apex":[1,1,0.0188,0.018,0.0716,0.3097,1,1,1],"launcher":[1,1,0.7055,0.0297,0.0322,0.0722,0.193,1,1,1],"wallMirror":[1,0.045,0.0186,0.0589,0.1729,1,1,1,1,1],"under5":[1,1,0.2149,0.0153,0.0162,0.0807,0.151,1,1,1],"y":[1,1,1,1,1,0.3064,0.0636,0.0216,0.0193,1],"launchHeight":[1,0.0569,0.0617,0.2276,0.4902,1,1,1,1]};
const ptRank = (m, p) => { const d = m.baskets.map((b) => hy(b[0] - p[0], b[1] - p[1])); return d.filter((v, j) => j !== m.answer && v < d[m.answer]).length; };
const rkOf = (vals, a) => vals.filter((v, j) => j !== a && v < vals[a]).length;
export function thinKeys(m) {
  const a = m.answer, bs = baskets(m), gp = groundPoints(m), out = {};
  out.M = ptRank(m, gp.mirrorLast); out.gl = ptRank(m, gp.ballGroundLast); out.apex = ptRank(m, gp.apexGround); out.launcher = ptRank(m, [m.p0[0], m.p0[2]]);
  out.wallMirror = ptRank(m, [2 * m.wall.x - m.p0[0], 2 * m.wall.z - m.p0[2]]);
  for (const k of [5]) { const B = W.ballAt(m, W.timeOf(m, k)); out['under' + k] = ptRank(m, [B[0], B[2]]); }
  out.y = rkOf(bs.map((b) => b.y), a);
  const L0 = W.ballScreen(m, 0); out.launchHeight = rkOf(bs.map((b) => Math.abs(b.y - L0.y)), a);
  return out;
}
function thinAccept(m, u) {
  if (!THIN_STATE.on) return true;
  let p = 1; for (const [k, v] of Object.entries(thinKeys(m))) p = Math.min(p, THIN[k]?.[v] ?? 1);
  return u() < p;
}

const task = makeTask({
  name: NAME, prompt: PROMPT, sub: SUB, view: W.VIEW, picks: 1,
  tapNote: 'tap a basket to select it (tap it again to clear; revisable until Verify)',
  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0, acc = mulberry32(mix32(key, 0x5ba));
    for (let a = 0; a < 3000000; a++) {
      const m = tryBuild(R(mulberry32(mix32(key, a)))); if (!m || !contract(m).ok) continue;
      if (!thinAccept(m, acc)) continue;
      m.gen = { tries: a + 1 }; return m;
    }
    throw new Error(`${NAME}: generator exhausted`);
  },
  sceneAt: W.sceneAt,
  anchor: (m, c) => [m.baskets[c][0], W.BASK.h * 0.55, m.baskets[c][1]],
  detail: (m) => ({ landing: W.landing(m).map(r3), top: r3(W.topTime(m)) }),
});
const atEnd = (env) => Math.round(env.state.t / env.manifest.dt) >= env.manifest.n - 1;
const pickBasket = task.pointer;
task.pointer = (evt, env) => (atEnd(env) ? pickBasket.call(task, evt, env) : []);
task.canVerify = atEnd;
task.gate = gate; task.frameAudit = frameAudit; task.contract = contract;
task.randomPolicy = (m, rnd) => task.oracle({ ...m, answer: Math.min(m.K - 1, Math.floor(rnd() * m.K)) });
export default task;
