import { drawPromptText, ACCENT } from '../core/panel.js';
import * as K from '../common/_colour_kit.js';

const PANEL_W = 600;
const BOARD = { w: 580, h: 440 };
const HARD = Object.freeze({
  mod: 3.6,
  gearTeeth: [13, 17],
  compTeeth: [16, 19],
  pulleyR: [21, 27],
  compFrac: 0.68,
  beltD: [128, 160],
  meshJit: 0.5, beltJit: 0.32,
  minGap: 12,
  pinFrac: [0.5, 0.62],
  pinOff: 40,
  deadMargin: 0.5,
  railDot: 0.85,
  rodMin: 84, rodMax: 100,
  railFromWheel: 6,
  blockClear: 30,
  railHalf: 17,
  padGap: 34, padStep: 17, btnR: 13, hitR: 15,
  beltW: 4,
  margin: 8,
  tries: 400, redraws: 60,
});
const BENCH = Object.freeze({
  pinOff: 55,
  nearDead: [45, 55],
  pinLat: 7,
  guardFrac: [0.40, 0.60],
  guardPad: 7,
  stubMin: 14,
});
const DIRS = Object.freeze([
  { id: 0, dx: -1, dy: 0 },
  { id: 1, dx: 1, dy: 0 },
  { id: 2, dx: 0, dy: -1 },
  { id: 3, dx: 0, dy: 1 },
]);
const METALS = ['steel', 'brass', 'copper'];
const LINKS = ['mesh', 'open', 'cross'];

const r2 = (v) => Math.round(v * 100) / 100;
const hyp = (x, y) => Math.hypot(x, y);
const TAU = Math.PI * 2;

export function senses(rd) {
  const s = [rd.spin];
  for (let k = 0; k < rd.links.length; k++) s.push(rd.links[k] === 'open' ? s[k] : -s[k]);
  return s;
}
export function sliderDir(W, o, w) {
  const px = W.x + o.pin.r * Math.cos(o.pin.a), py = W.y + o.pin.r * Math.sin(o.pin.a);
  const vx = -w * (py - W.y), vy = w * (px - W.x);
  const ex = o.slider.x - px, ey = o.slider.y - py, el = hyp(ex, ey);
  const ux = o.rail.ux, uy = o.rail.uy;
  const ue = (ux * ex + uy * ey) / el;
  const s = ((vx * ex + vy * ey) / el) / ue;
  const dx = Math.sign(s) * ux, dy = Math.sign(s) * uy;
  const d = DIRS.find((q) => q.dx === dx && q.dy === dy);
  const vl = hyp(vx, vy);
  return { dir: d ? d.id : -1, dead: Math.abs((vx * ex + vy * ey) / (vl * el)), railDot: Math.abs(ue), pin: { x: px, y: py } };
}
export function solveRound(rd) {
  const S = senses(rd);
  return rd.outs.map((o) => sliderDir(rd.wheels[o.wheel], o, S[o.wheel]));
}

const outerR = (W) => (W.gear ? W.gear.r + HARD.mod : W.pulley.r + 3);
const faceR = (W) => (W.pulley ? W.pulley.r : W.gear.r);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return hyp(px - ax - t * dx, py - ay - t * dy);
}
const cr = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
function segCross(A, B) {
  return cr(A[0], A[1], A[2], A[3], B[0], B[1]) * cr(A[0], A[1], A[2], A[3], B[2], B[3]) < 0
    && cr(B[0], B[1], B[2], B[3], A[0], A[1]) * cr(B[0], B[1], B[2], B[3], A[2], A[3]) < 0;
}
function segSeg(A, B) {
  if (segCross(A, B)) return 0;
  return Math.min(segDist(A[0], A[1], ...B), segDist(A[2], A[3], ...B), segDist(B[0], B[1], ...A), segDist(B[2], B[3], ...A));
}
function railRect(rd, o) {
  const W = rd.wheels[o.wheel], { ux, uy, a, b } = o.rail;
  return { cx: W.x, cy: W.y, ux, uy, a, b, ax: W.x + ux * a, ay: W.y + uy * a, bx: W.x + ux * b, by: W.y + uy * b };
}
function ptRect(x, y, R) {
  const dx = x - R.cx, dy = y - R.cy;
  const al = dx * R.ux + dy * R.uy, ac = -dx * R.uy + dy * R.ux;
  return hyp(Math.max(0, R.a - al, al - R.b), Math.max(0, Math.abs(ac) - HARD.railHalf));
}
function segRect(S, R) {
  const L = hyp(S[2] - S[0], S[3] - S[1]), n = Math.max(2, Math.ceil(L / 2.5));
  let m = Infinity;
  for (let i = 0; i <= n; i++) m = Math.min(m, ptRect(S[0] + (S[2] - S[0]) * i / n, S[1] + (S[3] - S[1]) * i / n, R));
  return m;
}
function guardBox(rd, G) {
  const A = rd.wheels[G.link], B = rd.wheels[G.link + 1], d = hyp(B.x - A.x, B.y - A.y);
  return { cx: A.x, cy: A.y, ux: (B.x - A.x) / d, uy: (B.y - A.y) / d, a: G.a, b: G.b, half: G.half, d };
}
function ptBox(x, y, R) {
  const dx = x - R.cx, dy = y - R.cy;
  const al = dx * R.ux + dy * R.uy, ac = -dx * R.uy + dy * R.ux;
  return hyp(Math.max(0, R.a - al, al - R.b), Math.max(0, Math.abs(ac) - R.half));
}
function boxCorners(R) {
  return [[R.a, -R.half], [R.a, R.half], [R.b, R.half], [R.b, -R.half]].map(([al, ac]) => [R.cx + R.ux * al - R.uy * ac, R.cy + R.uy * al + R.ux * ac]);
}
function segBox(S, R) {
  const L = hyp(S[2] - S[0], S[3] - S[1]), n = Math.max(2, Math.ceil(L / 2));
  let m = Infinity;
  for (let i = 0; i <= n; i++) m = Math.min(m, ptBox(S[0] + (S[2] - S[0]) * i / n, S[1] + (S[3] - S[1]) * i / n, R));
  return m;
}
const boxEdges = (R) => { const c = boxCorners(R); return c.map((p, i) => [...p, ...c[(i + 1) % 4]]); };
const railBox = (R) => ({ cx: R.cx, cy: R.cy, ux: R.ux, uy: R.uy, a: R.a, b: R.b, half: HARD.railHalf });
const boxBox = (P, Q) => Math.min(...boxEdges(P).map((e) => segBox(e, Q)), ...boxEdges(Q).map((e) => segBox(e, P)));

export function beltGeom(A, B, crossed) {
  const rA = A.pulley.r, rB = B.pulley.r, dx = B.x - A.x, dy = B.y - A.y, d = hyp(dx, dy), phi = Math.atan2(dy, dx);
  if (!crossed) {
    const q = Math.PI / 2 - Math.asin((rA - rB) / d);
    const spans = [1, -1].map((s) => { const n = phi + s * q; return [A.x + rA * Math.cos(n), A.y + rA * Math.sin(n), B.x + rB * Math.cos(n), B.y + rB * Math.sin(n)]; });
    return { spans, arcA: [phi + q, phi + TAU - q], arcB: [phi - q, phi + q] };
  }
  const q = Math.PI / 2 - Math.asin((rA + rB) / d);
  const spans = [1, -1].map((s) => { const n = phi + s * q; return [A.x + rA * Math.cos(n), A.y + rA * Math.sin(n), B.x - rB * Math.cos(n), B.y - rB * Math.sin(n)]; });
  return { spans, arcA: [phi + q, phi + TAU - q], arcB: [phi + Math.PI + q, phi + 3 * Math.PI - q] };
}
function allSpans(rd) {
  const out = [];
  rd.links.forEach((L, k) => {
    if (L === 'mesh') return;
    const bg = beltGeom(rd.wheels[k], rd.wheels[k + 1], L === 'cross');
    for (const s of bg.spans) out.push({ seg: s, own: [k, k + 1], link: k });
  });
  return out;
}
function padButtons(o) {
  const { ux, uy } = o.rail;
  return [1, -1].map((k) => {
    const dx = k * ux, dy = k * uy;
    return { id: DIRS.find((d) => d.dx === dx && d.dy === dy).id, x: o.pad.x + dx * HARD.padStep, y: o.pad.y + dy * HARD.padStep };
  });
}
function arrowSamples(rd, n = 16) {
  const h = rd.wheels[0], ar = outerR(h) + 12, pts = [];
  for (let k = 0; k <= n; k++) { const t = rd.arrow.a0 + (rd.arrow.a1 - rd.arrow.a0) * k / n; pts.push([h.x + ar * Math.cos(t), h.y + ar * Math.sin(t)]); }
  return pts;
}
function extentPoints(rd) {
  const pts = [];
  for (const W of rd.wheels) { const t = outerR(W) + 2; pts.push([W.x - t, W.y - t], [W.x + t, W.y + t]); }
  for (const [x, y] of arrowSamples(rd, 12)) pts.push([x - 6, y - 6], [x + 6, y + 6]);
  for (const o of rd.outs) {
    const R = railRect(rd, o), nx = -o.rail.uy, ny = o.rail.ux, s = HARD.railHalf + 1;
    pts.push([R.ax + nx * s, R.ay + ny * s], [R.ax - nx * s, R.ay - ny * s], [R.bx + nx * s, R.by + ny * s], [R.bx - nx * s, R.by - ny * s]);
    for (const b of padButtons(o)) pts.push([b.x - HARD.hitR, b.y - HARD.hitR], [b.x + HARD.hitR, b.y + HARD.hitR]);
  }
  return pts;
}

export function roundProblems(rd, bench = false) {
  const out = [];
  const Wh = rd.wheels, M = HARD.mod;
  if (!Array.isArray(Wh) || Wh.length !== 5) return ['wheel-count'];
  if (!Array.isArray(rd.links) || rd.links.length !== 4 || !rd.links.every((L) => LINKS.includes(L))) return ['links'];
  if (rd.links.filter((L) => L === 'mesh').length !== 2) return ['link-mix'];
  for (let k = 0; k < 3; k++) if (rd.links[k] !== 'mesh' && rd.links[k + 1] !== 'mesh') return ['belts-share-wheel'];
  if (rd.spin !== 1 && rd.spin !== -1) return ['spin'];
  if (bench && (rd.links.filter((L) => L === 'open').length !== 1 || rd.links.filter((L) => L === 'cross').length !== 1)) return ['belt-mix'];
  if (!Array.isArray(rd.outs) || rd.outs.length !== 4) return ['out-count'];
  if (rd.outs.some((o, k) => o.wheel !== k + 1)) return ['out-wheels'];
  for (let i = 0; i < 5; i++) {
    const W = Wh[i];
    if (![W.x, W.y].every(Number.isFinite)) return ['wheel-num'];
    const needGear = (i > 0 && rd.links[i - 1] === 'mesh') || (i < 4 && rd.links[i] === 'mesh');
    const needPulley = (i > 0 && rd.links[i - 1] !== 'mesh') || (i < 4 && rd.links[i] !== 'mesh');
    if (!!W.gear !== needGear || !!W.pulley !== needPulley) { out.push('wheel-kind'); continue; }
    if (W.gear) {
      const g = W.gear;
      if (![g.r, g.teeth, g.phase].every(Number.isFinite) || !Number.isInteger(g.teeth) || Math.abs(g.r - g.teeth * M / 2) > 0.02) out.push('gear-module');
      if (!METALS.includes(g.metal)) out.push('gear-metal');
    }
    if (W.pulley && !(W.pulley.r >= 18 && W.pulley.r <= 28)) out.push('pulley-size');
    if (W.gear && W.pulley && W.pulley.r > W.gear.r - 1.25 * M - 3) out.push('pulley-over-teeth');
  }
  if (out.length) return out;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const d = hyp(Wh[i].x - Wh[j].x, Wh[i].y - Wh[j].y);
    if (j === i + 1 && rd.links[i] === 'mesh') { if (Math.abs(d - Wh[i].gear.r - Wh[j].gear.r) > 0.02) out.push('mesh-distance'); }
    else if (j === i + 1) { if (d < HARD.beltD[0] - 2 || d > HARD.beltD[1] + 2) out.push('belt-length'); }
    else if (d - outerR(Wh[i]) - outerR(Wh[j]) < HARD.minGap) out.push('false-contact');
  }
  if (out.length) return out;
  const spans = allSpans(rd);
  const sols = solveRound(rd);
  const rails = rd.outs.map((o) => railRect(rd, o));
  const rods = rd.outs.map((o, k) => [sols[k].pin.x, sols[k].pin.y, o.slider.x, o.slider.y]);
  for (const s of spans) {
    for (let i = 0; i < 5; i++) if (!s.own.includes(i) && segDist(Wh[i].x, Wh[i].y, ...s.seg) < outerR(Wh[i]) + 8) out.push('belt-over-wheel');
    for (const t of spans) if (t.link !== s.link && segSeg(s.seg, t.seg) < 10) out.push('belts-touch');
    for (const R of rails) if (segRect(s.seg, R) < 6) out.push('belt-over-rail');
  }
  rd.outs.forEach((o, k) => {
    const W = Wh[o.wheel], { ux, uy } = o.rail, sol = sols[k], R = rails[k];
    if (!((Math.abs(ux) === 1 && uy === 0) || (Math.abs(uy) === 1 && ux === 0))) { out.push('rail-axis'); return; }
    const fr = faceR(W);
    if (!(o.pin.r >= HARD.pinFrac[0] * fr - 0.05 && o.pin.r <= HARD.pinFrac[1] * fr + 0.05)) out.push('pin-radius');
    const pinAlong = Math.cos(o.pin.a) * ux + Math.sin(o.pin.a) * uy;
    if (Math.abs(pinAlong) > Math.sin((bench ? BENCH.pinOff : HARD.pinOff) * Math.PI / 180) + 1e-6) out.push('pin-near-dead-centre');
    if (bench && o.pin.r * Math.sqrt(Math.max(0, 1 - pinAlong * pinAlong)) < BENCH.pinLat - 0.01) out.push('pin-half-unreadable');
    const sx = o.slider.x - W.x, sy = o.slider.y - W.y, along = sx * ux + sy * uy;
    if (Math.abs(sx * uy - sy * ux) > 0.02) out.push('slider-off-rail');
    const rodL = hyp(o.slider.x - sol.pin.x, o.slider.y - sol.pin.y);
    if (Math.abs(rodL - o.rod) > 0.05 || o.rod < HARD.rodMin - 0.01 || o.rod > HARD.rodMax + 0.01) out.push('rod-length');
    if (sol.dead < HARD.deadMargin) out.push('near-stall');
    if (sol.railDot < HARD.railDot) out.push('rod-too-steep');
    if (sol.dir !== o.answer) out.push('answer-mismatch');
    if (o.rail.a < outerR(W) + HARD.railFromWheel - 0.05 || o.rail.a > along - HARD.blockClear || o.rail.b < along + 30) out.push('rail-span');
    for (let i = 0; i < 5; i++) {
      if (i === o.wheel) continue;
      if (ptRect(Wh[i].x, Wh[i].y, R) < outerR(Wh[i]) + 8) out.push('rail-over-wheel');
      if (segDist(Wh[i].x, Wh[i].y, ...rods[k]) < outerR(Wh[i]) + 8) out.push('rod-over-wheel');
    }
    for (let j = 0; j < 4; j++) {
      if (j === k) continue;
      if (j > k && segSeg([R.ax, R.ay, R.bx, R.by], [rails[j].ax, rails[j].ay, rails[j].bx, rails[j].by]) < 2 * HARD.railHalf + 14) out.push('rails-too-close');
      if (segRect(rods[k], rails[j]) < 8) out.push('rod-over-other-rail');
      if (j > k && segSeg(rods[k], rods[j]) < 16) out.push('rods-touch');
    }
    for (const s of spans) {
      const d = segSeg(rods[k], s.seg);
      if (d >= 8) continue;
      if (!s.own.includes(o.wheel)) { out.push('rod-over-belt'); continue; }
      const a1 = Math.atan2(rods[k][3] - rods[k][1], rods[k][2] - rods[k][0]), a2 = Math.atan2(s.seg[3] - s.seg[1], s.seg[2] - s.seg[0]);
      const ang = Math.abs(Math.sin(a1 - a2));
      if (ang < Math.sin(Math.PI / 4)) out.push('rod-along-belt');
    }
    const nx = -uy, ny = ux;
    const off = (o.pad.x - o.slider.x) * nx + (o.pad.y - o.slider.y) * ny;
    const offAlong = (o.pad.x - o.slider.x) * ux + (o.pad.y - o.slider.y) * uy;
    if (Math.abs(Math.abs(off) - HARD.padGap) > 0.02 || Math.abs(offAlong) > 0.02) out.push('pad-placement');
    for (const b of padButtons(o)) {
      for (const V of Wh) if (hyp(b.x - V.x, b.y - V.y) < outerR(V) + HARD.hitR + 5) out.push('pad-over-wheel');
      for (let j = 0; j < 4; j++) {
        if (ptRect(b.x, b.y, rails[j]) < HARD.hitR + 1) out.push('pad-over-rail');
        if (segDist(b.x, b.y, ...rods[j]) < HARD.hitR + 8) out.push('pad-over-rod');
        if (j !== k) for (const c of padButtons(rd.outs[j])) if (hyp(b.x - c.x, b.y - c.y) < 2 * HARD.hitR + 12) out.push('pads-too-close');
      }
      for (const s of spans) if (segDist(b.x, b.y, ...s.seg) < HARD.hitR + 6) out.push('pad-over-belt');
    }
  });
  if (!(rd.arrow.a1 - rd.arrow.a0 > 1.2 && rd.arrow.a1 - rd.arrow.a0 < 2.4)) out.push('arrow-span');
  for (const [x, y] of arrowSamples(rd)) {
    for (let i = 1; i < 5; i++) if (hyp(x - Wh[i].x, y - Wh[i].y) < outerR(Wh[i]) + 9) out.push('arrow-over-wheel');
    for (let j = 0; j < 4; j++) {
      if (ptRect(x, y, rails[j]) < 8) out.push('arrow-over-rail');
      if (segDist(x, y, ...rods[j]) < 12) out.push('arrow-over-rod');
      for (const b of padButtons(rd.outs[j])) if (hyp(x - b.x, y - b.y) < HARD.hitR + 10) out.push('arrow-over-pad');
    }
    for (const s of spans) if (segDist(x, y, ...s.seg) < 9) out.push('arrow-over-belt');
  }
  if (!Number.isFinite(rd.handle)) out.push('handle');
  for (const [x, y] of extentPoints(rd)) {
    if (x < HARD.margin || x > BOARD.w - HARD.margin || y < HARD.margin || y > BOARD.h - HARD.margin) { out.push('out-of-board'); break; }
  }
  if (bench) out.push(...benchProblems(rd, spans, rails, rods));
  return [...new Set(out)];
}

function benchProblems(rd, spans, rails, rods) {
  const out = [], Wh = rd.wheels;
  const S = senses(rd);
  for (const rule of [(L) => (L === 'mesh' ? -1 : 1), () => -1]) {
    const T = [rd.spin]; for (let k = 0; k < 4; k++) T.push(T[k] * rule(rd.links[k]));
    if (rd.outs.every((o) => T[o.wheel] === S[o.wheel])) out.push('belt-rule-survives');
  }
  const near = rd.outs.filter((o) => Math.abs(Math.cos(o.pin.a) * o.rail.ux + Math.sin(o.pin.a) * o.rail.uy) >= Math.sin(BENCH.nearDead[0] * Math.PI / 180) - 1e-6);
  if (near.length < 1) out.push('no-near-dead-pin');
  const belts = rd.links.map((L, k) => (L === 'mesh' ? -1 : k)).filter((k) => k >= 0);
  if (!Array.isArray(rd.guards) || rd.guards.length !== belts.length || !rd.guards.every((G, i) => G.link === belts[i])) return [...out, 'guards'];
  const boxes = rd.guards.map((G) => guardBox(rd, G));
  boxes.forEach((R, gi) => {
    const k = rd.guards[gi].link, A = Wh[k], B = Wh[k + 1];
    const frac = (R.b - R.a) / R.d, c = R.d * A.pulley.r / (A.pulley.r + B.pulley.r);
    if (frac < BENCH.guardFrac[0] - 0.001 || frac > BENCH.guardFrac[1] + 0.001) out.push('guard-length');
    if (c < R.a + 0.2 * (R.b - R.a) || c > R.b - 0.2 * (R.b - R.a)) out.push('guard-off-crossing');
    if (R.half < Math.max(A.pulley.r, B.pulley.r) + BENCH.guardPad - 0.05) out.push('guard-narrow');
    for (const W of [A, B]) if (ptBox(W.x, W.y, R) < W.pulley.r + 6) out.push('guard-over-pulley');
    for (let j = Math.max(0, k - 1); j <= Math.min(3, k + 1); j++) {
      if (rd.links[j] !== 'mesh') continue;
      const P = Wh[j], Q = Wh[j + 1], dd = hyp(Q.x - P.x, Q.y - P.y), t = P.gear.r / dd;
      if (ptBox(P.x + (Q.x - P.x) * t, P.y + (Q.y - P.y) * t, R) < 12) out.push('guard-over-mesh');
    }
    for (const s of spans.filter((q) => q.link === k)) {
      const L = hyp(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]), n = Math.ceil(L / 0.5);
      let t0 = -1, t1 = -1;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (ptBox(s.seg[0] + (s.seg[2] - s.seg[0]) * t, s.seg[1] + (s.seg[3] - s.seg[1]) * t, R) <= 0) { if (t0 < 0) t0 = t; t1 = t; }
      }
      if (t0 < 0 || t0 * L < BENCH.stubMin || (1 - t1) * L < BENCH.stubMin) out.push('guard-stub');
    }
    for (let i = 0; i < 5; i++) if (i !== k && i !== k + 1 && ptBox(Wh[i].x, Wh[i].y, R) < outerR(Wh[i]) + 6) out.push('guard-over-wheel');
    for (const Rr of rails) if (boxBox(R, railBox(Rr)) < 6) out.push('guard-over-rail');
    for (const rod of rods) if (segBox(rod, R) < 6) out.push('guard-over-rod');
    for (const o of rd.outs) for (const b of padButtons(o)) if (ptBox(b.x, b.y, R) < HARD.hitR + 4) out.push('guard-over-pad');
    for (const [x, y] of arrowSamples(rd)) if (ptBox(x, y, R) < 8) out.push('guard-over-arrow');
    for (const s of spans) if (s.link !== k && segBox(s.seg, R) < 6) out.push('guard-over-belt');
    boxes.forEach((Q, gj) => { if (gj > gi && boxBox(R, Q) < 6) out.push('guards-touch'); });
    for (const [x, y] of boxCorners(R)) if (x < HARD.margin || x > BOARD.w - HARD.margin || y < HARD.margin || y > BOARD.h - HARD.margin) out.push('guard-out-of-board');
  });
  return out;
}

function drawFeatures(rng, bench = false) {
  for (;;) {
    const beltAt = rng.pick([[0, 2], [0, 3], [1, 3]]);
    const kinds = bench ? (rng.sign() > 0 ? ['open', 'cross'] : ['cross', 'open']) : null;
    const links = [0, 1, 2, 3].map((k) => (beltAt.includes(k) ? (bench ? kinds[beltAt.indexOf(k)] : rng.pick(['open', 'cross'])) : 'mesh'));
    const sides = [1, 2, 3, 4].map((i) => (i === 4 ? rng.pick(['up', 'down', 'out']) : rng.pick(['up', 'down'])));
    let bad = false;
    for (let i = 1; i < 4; i++) if (links[i] === 'mesh' && sides[i - 1] === sides[i]) bad = true;
    if (bad) continue;
    return {
      links, sides, sx: rng.sign(), spin: rng.sign(),
      pinHalf: [0, 1, 2, 3].map(() => rng.sign()), padSide: [0, 1, 2, 3].map(() => rng.sign()),
      metal: rng.int(0, METALS.length - 1),
      bench, nearDead: bench ? rng.int(0, 3) : -1,
    };
  }
}

function buildRound(rng, f) {
  const M = HARD.mod;
  const wheels = [0, 1, 2, 3, 4].map((i) => {
    const needGear = (i > 0 && f.links[i - 1] === 'mesh') || (i < 4 && f.links[i] === 'mesh');
    const needPulley = (i > 0 && f.links[i - 1] !== 'mesh') || (i < 4 && f.links[i] !== 'mesh');
    const W = { x: 0, y: 0, gear: null, pulley: null };
    if (needGear) {
      const n = needPulley ? rng.int(...HARD.compTeeth) : rng.int(...HARD.gearTeeth);
      W.gear = { r: n * M / 2, teeth: n, phase: 0, metal: METALS[(f.metal + i) % METALS.length] };
    }
    if (needPulley) W.pulley = { r: needGear ? r2(W.gear.r * HARD.compFrac) : r2(rng.uniform(...HARD.pulleyR)) };
    return W;
  });
  const head = f.sx > 0 ? 0 : Math.PI;
  for (let k = 0; k < 4; k++) {
    const A = wheels[k], B = wheels[k + 1], mesh = f.links[k] === 'mesh';
    const th = head + rng.uniform(-1, 1) * (mesh ? HARD.meshJit : HARD.beltJit);
    const d = mesh ? A.gear.r + B.gear.r : rng.uniform(...HARD.beltD);
    B.x = A.x + d * Math.cos(th); B.y = A.y + d * Math.sin(th);
  }
  const h = wheels[0], nb = wheels[1];
  const toNb = Math.atan2(nb.y - h.y, nb.x - h.x);
  const span = rng.uniform(1.45, 2.0);
  const mid = toNb + Math.PI + rng.uniform(-0.8, 0.8);
  const arrow = { a0: r2(mid - span / 2), a1: r2(mid + span / 2) };
  const handle = r2(mid + rng.uniform(-0.5, 0.5));
  const outs = [1, 2, 3, 4].map((i, k) => {
    const W = wheels[i], side = f.sides[k];
    const u = side === 'up' ? { x: 0, y: -1 } : side === 'down' ? { x: 0, y: 1 } : { x: f.sx, y: 0 };
    const v = { x: -u.y, y: u.x };
    const pr = r2(faceR(W) * (f.bench && k === f.nearDead ? rng.uniform(0.57, HARD.pinFrac[1] - 0.005) : rng.uniform(HARD.pinFrac[0] + 0.005, HARD.pinFrac[1] - 0.005)));
    const off = (f.bench && k === f.nearDead ? rng.sign() * rng.uniform(BENCH.nearDead[0] + 1, BENCH.nearDead[1] - 1) : rng.uniform(-HARD.pinOff + 4, HARD.pinOff - 4)) * Math.PI / 180;
    const pa = r2(Math.atan2(f.pinHalf[k] * v.y, f.pinHalf[k] * v.x) + off);
    const px = pr * Math.cos(pa), py = pr * Math.sin(pa);
    const rod = r2(rng.uniform(HARD.rodMin, HARD.rodMax));
    const pAlong = px * u.x + py * u.y, pAcross = px * v.x + py * v.y;
    const along = pAlong + Math.sqrt(rod * rod - pAcross * pAcross);
    return { wheel: i, u, v, pr, pa, rod, along, padSide: f.padSide[k], railExtra: rng.uniform(36, 46) };
  });
  const mkOut = (o, W) => {
    const slider = { x: W.x + o.u.x * o.along, y: W.y + o.u.y * o.along };
    return {
      wheel: o.wheel, pin: { r: o.pr, a: o.pa }, rod: o.rod,
      rail: { ux: o.u.x, uy: o.u.y, a: r2(outerR(W) + HARD.railFromWheel), b: r2(o.along + o.railExtra) },
      slider, pad: { x: slider.x + o.v.x * o.padSide * HARD.padGap, y: slider.y + o.v.y * o.padSide * HARD.padGap }, answer: -1,
    };
  };
  let rd = { wheels, links: f.links.slice(), spin: f.spin, handle, arrow, outs: outs.map((o) => mkOut(o, wheels[o.wheel])) };
  const pts = extentPoints(rd);
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const BW = BOARD.w - 2 * HARD.margin - 2, BH = BOARD.h - 2 * HARD.margin - 2;
  if (x1 - x0 > BW || y1 - y0 > BH) return null;
  const tx = HARD.margin + 1 - x0 + rng.uniform(0, BW - (x1 - x0));
  const ty = HARD.margin + 1 - y0 + rng.uniform(0, BH - (y1 - y0));
  for (const W of wheels) { W.x = r2(W.x + tx); W.y = r2(W.y + ty); }
  for (let k = 0; k < 4; k++) {
    if (f.links[k] !== 'mesh') continue;
    const a = wheels[k], b = wheels[k + 1], d = hyp(b.x - a.x, b.y - a.y), want = a.gear.r + b.gear.r;
    const dx = (b.x - a.x) * (want / d - 1), dy = (b.y - a.y) * (want / d - 1);
    for (let j = k + 1; j < 5; j++) { wheels[j].x += dx; wheels[j].y += dy; }
  }
  for (let k = 0; k < 5; k++) {
    const G = wheels[k].gear;
    if (G && !(k > 0 && f.links[k - 1] === 'mesh')) G.phase = rng.uniform(0, TAU / G.teeth);
    if (k === 4 || f.links[k] !== 'mesh') continue;
    const A = wheels[k], B = wheels[k + 1], a = A.gear, b = B.gear;
    const th = Math.atan2(B.y - A.y, B.x - A.x), pitchA = TAU / a.teeth;
    let delta = ((th - a.phase) % pitchA + pitchA) % pitchA;
    if (delta > pitchA / 2) delta -= pitchA;
    b.phase = th + Math.PI - a.r * (-delta) / b.r + Math.PI / b.teeth;
  }
  rd.outs = outs.map((o) => mkOut(o, wheels[o.wheel]));
  const sols = solveRound(rd);
  rd.outs.forEach((o, k) => { o.answer = sols[k].dir; });
  if (f.bench) {
    rd.guards = [];
    f.links.forEach((L, k) => {
      if (L === 'mesh') return;
      const A = wheels[k], B = wheels[k + 1], d = hyp(B.x - A.x, B.y - A.y);
      const c = d * A.pulley.r / (A.pulley.r + B.pulley.r), len = d * rng.uniform(BENCH.guardFrac[0] + 0.005, BENCH.guardFrac[1] - 0.005);
      rd.guards.push({ link: k, a: r2(c - len / 2), b: r2(c + len / 2), half: r2(Math.max(A.pulley.r, B.pulley.r) + BENCH.guardPad) });
    });
  }
  return rd;
}
function tryRound(rng, f) {
  const rd = buildRound(rng, f);
  return rd && roundProblems(rd, f.bench).length === 0 ? rd : null;
}

function genRound(rng, bench = false) {
  for (let r = 0; r < HARD.redraws; r++) {
    const f = drawFeatures(rng, bench);
    for (let t = 0; t < HARD.tries; t++) {
      const rd = tryRound(rng, f);
      if (rd) return rd;
    }
  }
  throw new Error('mechanism_predict: could not lay out a round');
}

export function gate(m) {
  if (!m || m.task !== 'mechanism_predict' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  return m.rounds.every((rd) => Array.isArray(rd.outs) && rd.outs.length === 4
    && rd.outs.every((o) => Number.isInteger(o.answer) && o.answer >= 0 && o.answer < 4) && roundProblems(rd, !m.ext).length === 0);
}

const METAL_FILL = {
  steel: ['#dfe5ea', '#aab5bf', '#7d8994'],
  brass: ['#f1dc9a', '#d2ac55', '#9c7a2e'],
  copper: ['#f0c3a1', '#cf8a5c', '#99582f'],
};
function gearPath(g, W) {
  const gr = W.gear, M = HARD.mod, ra = gr.r + M, rf = gr.r - 1.25 * M, n = gr.teeth, p = TAU / n;
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const c = gr.phase + k * p;
    const pts = [[c - p * 0.5, rf], [c - p * 0.3, rf], [c - p * 0.2, ra], [c + p * 0.2, ra], [c + p * 0.3, rf]];
    for (const [a, rr0] of pts) {
      const x = W.x + rr0 * Math.cos(a), y = W.y + rr0 * Math.sin(a);
      if (k === 0 && a === pts[0][0]) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  g.closePath();
}
function drawGear(g, W) {
  const gr = W.gear, [hi, mid, lo] = METAL_FILL[gr.metal];
  g.save();
  g.shadowColor = 'rgba(20,30,40,.28)'; g.shadowBlur = 5; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2.5;
  gearPath(g, W);
  const grd = g.createRadialGradient(W.x - gr.r * 0.35, W.y - gr.r * 0.4, gr.r * 0.1, W.x, W.y, gr.r * 1.15);
  grd.addColorStop(0, hi); grd.addColorStop(0.6, mid); grd.addColorStop(1, lo);
  g.fillStyle = grd; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(40,48,56,.85)'; g.lineWidth = 1.1; g.stroke();
  if (!W.pulley) {
    g.beginPath(); g.arc(W.x, W.y, gr.r * 0.78, 0, TAU); g.strokeStyle = 'rgba(40,48,56,.28)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.arc(W.x, W.y, gr.r * 0.26, 0, TAU); g.fillStyle = hi; g.fill();
    g.strokeStyle = 'rgba(40,48,56,.6)'; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}
function drawPulley(g, W) {
  const r = W.pulley.r;
  g.save();
  g.shadowColor = 'rgba(20,30,40,.3)'; g.shadowBlur = W.gear ? 3 : 5; g.shadowOffsetX = 1.2; g.shadowOffsetY = 2;
  g.beginPath(); g.arc(W.x, W.y, r, 0, TAU);
  const grd = g.createRadialGradient(W.x - r * 0.35, W.y - r * 0.4, r * 0.1, W.x, W.y, r * 1.1);
  grd.addColorStop(0, '#eef1f4'); grd.addColorStop(0.65, '#c3cad1'); grd.addColorStop(1, '#8f99a3');
  g.fillStyle = grd; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#4a545e'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.arc(W.x, W.y, r - 3.2, 0, TAU); g.strokeStyle = 'rgba(60,70,80,.55)'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.arc(W.x, W.y, r * 0.3, 0, TAU); g.fillStyle = '#dde2e7'; g.fill();
  g.strokeStyle = 'rgba(60,70,80,.6)'; g.lineWidth = 1; g.stroke();
  g.restore();
}
function drawAxle(g, W) {
  g.beginPath(); g.arc(W.x, W.y, 3.2, 0, TAU); g.fillStyle = '#39424c'; g.fill();
}
function drawBelt(g, A, B, crossed, look, noHalo = false) {
  const bg = beltGeom(A, B, crossed), col = look?.belt || '#23272b', w = HARD.beltW;
  g.save(); g.lineCap = 'butt';
  g.beginPath(); g.arc(A.x, A.y, A.pulley.r, bg.arcA[0], bg.arcA[1]); g.strokeStyle = col; g.lineWidth = w; g.stroke();
  g.beginPath(); g.arc(B.x, B.y, B.pulley.r, bg.arcB[0], bg.arcB[1]); g.stroke();
  bg.spans.forEach((s, k) => {
    g.lineCap = 'round';
    if (crossed && k === 1 && !noHalo) {
      g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.strokeStyle = look?.beltHalo || 'rgba(238,242,245,0.95)'; g.lineWidth = w + 4; g.stroke();
    }
    g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.strokeStyle = col; g.lineWidth = w; g.stroke();
    g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
  });
  g.restore();
}
function drawGuard(g, rd, G) {
  const R = guardBox(rd, G), ang = Math.atan2(R.uy, R.ux), len = R.b - R.a, h = R.half;
  g.save();
  g.translate(R.cx + R.ux * R.a, R.cy + R.uy * R.a); g.rotate(ang);
  const rr = 6;
  const box = () => {
    g.beginPath();
    g.moveTo(rr, -h); g.lineTo(len - rr, -h); g.arcTo(len, -h, len, -h + rr, rr); g.lineTo(len, h - rr); g.arcTo(len, h, len - rr, h, rr);
    g.lineTo(rr, h); g.arcTo(0, h, 0, h - rr, rr); g.lineTo(0, -h + rr); g.arcTo(0, -h, rr, -h, rr); g.closePath();
  };
  g.shadowColor = 'rgba(20,30,40,.32)'; g.shadowBlur = 6; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2.5;
  box();
  const gr = g.createLinearGradient(0, -h, 0, h);
  gr.addColorStop(0, '#d5dbe0'); gr.addColorStop(0.45, '#b9c2ca'); gr.addColorStop(1, '#98a3ad');
  g.fillStyle = gr; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#56626d'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.rect(4, -h + 4, len - 8, 2 * h - 8); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke();
  for (const x of [9, len - 9]) {
    g.beginPath(); g.arc(x, 0, 3, 0, TAU); g.fillStyle = '#7d8893'; g.fill();
    g.strokeStyle = '#3f4a54'; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}
function drawArrowHead(g, x, y, ang, size, color) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(size, 0); g.lineTo(-size * 0.7, -size * 0.75); g.lineTo(-size * 0.35, 0); g.lineTo(-size * 0.7, size * 0.75); g.closePath();
  g.fillStyle = color; g.fill(); g.restore();
}
function drawRail(g, rd, o) {
  const e = railRect(rd, o), nx = -o.rail.uy, ny = o.rail.ux;
  g.save();
  const W2 = 15;
  g.beginPath();
  g.moveTo(e.ax + nx * W2, e.ay + ny * W2); g.lineTo(e.bx + nx * W2, e.by + ny * W2);
  g.lineTo(e.bx - nx * W2, e.by - ny * W2); g.lineTo(e.ax - nx * W2, e.ay - ny * W2); g.closePath();
  g.fillStyle = '#b7c1ca'; g.fill();
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(e.ax + nx * s * W2, e.ay + ny * s * W2); g.lineTo(e.bx + nx * s * W2, e.by + ny * s * W2);
    g.strokeStyle = '#4f5b66'; g.lineWidth = 3; g.lineCap = 'round'; g.stroke();
  }
  for (const [x, y] of [[e.ax, e.ay], [e.bx, e.by]]) {
    g.beginPath(); g.moveTo(x + nx * (W2 + 2), y + ny * (W2 + 2)); g.lineTo(x - nx * (W2 + 2), y - ny * (W2 + 2));
    g.strokeStyle = '#4f5b66'; g.lineWidth = 4; g.stroke();
  }
  g.restore();
}
function drawSlider(g, o) {
  const ux = o.rail.ux, uy = o.rail.uy, nx = -uy, ny = ux, c = o.slider;
  g.save();
  const bl = 17, bw = 12;
  g.beginPath();
  const corners = [[-bl, -bw], [bl, -bw], [bl, bw], [-bl, bw]].map(([a, b]) => [c.x + ux * a + nx * b, c.y + uy * a + ny * b]);
  corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.shadowColor = 'rgba(20,30,40,.3)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
  const sg = g.createLinearGradient(c.x - 12, c.y - 12, c.x + 12, c.y + 12);
  sg.addColorStop(0, '#f2a25c'); sg.addColorStop(1, '#c86a22');
  g.fillStyle = sg; g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = '#7a3f12'; g.lineWidth = 1.3; g.stroke();
  g.restore();
}
function drawRod(g, pin, c) {
  g.save();
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(pin.x, pin.y); g.lineTo(c.x, c.y);
  g.strokeStyle = '#2f3a45'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = '#6c7a88'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.stroke();
  for (const p of [pin, c]) {
    g.beginPath(); g.arc(p.x, p.y, 4.4, 0, TAU); g.fillStyle = '#e9edf1'; g.fill();
    g.strokeStyle = '#2f3a45'; g.lineWidth = 1.5; g.stroke();
  }
  g.restore();
}
function drawPad(g, o, picked) {
  g.save();
  for (const b of padButtons(o)) {
    const on = picked === b.id;
    g.beginPath(); g.arc(b.x, b.y, HARD.btnR, 0, TAU);
    g.fillStyle = on ? ACCENT : '#ffffff'; g.fill();
    g.strokeStyle = on ? '#0f5fb0' : '#8795a3'; g.lineWidth = 1.5; g.stroke();
    const d = DIRS[b.id], ang = Math.atan2(d.dy, d.dx);
    g.save(); g.translate(b.x, b.y); g.rotate(ang);
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(2, 0); g.strokeStyle = on ? '#fff' : '#2f3a45'; g.lineWidth = 2.4; g.lineCap = 'round'; g.stroke();
    g.beginPath(); g.moveTo(7, 0); g.lineTo(0.5, -5); g.lineTo(0.5, 5); g.closePath(); g.fillStyle = on ? '#fff' : '#2f3a45'; g.fill();
    g.restore();
  }
  g.restore();
}
function drawHandle(g, rd, knob, white) {
  const h = rd.wheels[0];
  g.save();
  const kr = faceR(h) * 0.7, kx = h.x + kr * Math.cos(rd.handle), ky = h.y + kr * Math.sin(rd.handle);
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(kx, ky); g.strokeStyle = '#2b333b'; g.lineWidth = 7; g.stroke();
  g.strokeStyle = '#56616c'; g.lineWidth = 4; g.stroke();
  g.beginPath(); g.arc(kx, ky, 7.5, 0, TAU);
  const kg = g.createRadialGradient(kx - 2.5, ky - 2.5, 1, kx, ky, 8);
  kg.addColorStop(0, knob ? K.mixHex(knob, '#ffffff', 0.45) : '#ff8a80'); kg.addColorStop(1, knob || '#c62828');
  g.fillStyle = kg; g.fill(); g.strokeStyle = knob ? K.shadeHex(knob, 0.45) : '#6d1010'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.arc(h.x, h.y, 4.5, 0, TAU); g.fillStyle = '#2b333b'; g.fill();
  const ar = outerR(h) + 12, cw = rd.spin > 0;
  g.beginPath(); g.arc(h.x, h.y, ar, rd.arrow.a0 + (cw ? 0 : 0.12), rd.arrow.a1 - (cw ? 0.12 : 0), false);
  if (white) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; g.stroke(); }
  g.strokeStyle = '#1565c0'; g.lineWidth = 3.4; g.stroke();
  const t = cw ? rd.arrow.a1 : rd.arrow.a0;
  drawArrowHead(g, h.x + ar * Math.cos(t), h.y + ar * Math.sin(t), cw ? t + Math.PI / 2 - 0.1 : t - Math.PI / 2 + 0.1, 9, '#1565c0');
  g.restore();
}
function drawRound(g, rd, picks) {
  const sols = solveRound(rd);
  for (const o of rd.outs) drawRail(g, rd, o);
  for (const W of rd.wheels) if (W.gear) drawGear(g, W);
  for (const W of rd.wheels) if (W.pulley) drawPulley(g, W);
  rd.links.forEach((L, k) => { if (L !== 'mesh') drawBelt(g, rd.wheels[k], rd.wheels[k + 1], L === 'cross', null, !!rd.guards); });
  for (const G of rd.guards || []) drawGuard(g, rd, G);
  for (const W of rd.wheels) drawAxle(g, W);
  for (const o of rd.outs) drawSlider(g, o);
  rd.outs.forEach((o, k) => drawRod(g, sols[k].pin, o.slider));
  drawHandle(g, rd, null, false);
  rd.outs.forEach((o, k) => drawPad(g, o, picks[k]));
}

export default {
  meta: {
    name: 'mechanism_predict', family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'pick', slider: '0..3 (the sliders on wheels 1..4 along the chain from the handle)', dir: '0 left | 1 right | 2 up | 3 down (along that slider\'s rail; a re-tap replaces the pick until Verify)' }],
    promptHuman: 'Which way does each slider move?',
  },

  generate(rng, level, index, knobs = {}) {
    const m = { task: 'mechanism_predict', board: { ...BOARD }, rounds: [genRound(rng, !(knobs && knobs.ext))] };
    if (knobs && knobs.ext) m.ext = { v: 2 };
    return m;
  },

  init() { return { picks: [-1, -1, -1, -1] }; },

  applyAction(state, a, m) {
    if (!a || a.op !== 'pick' || !Number.isInteger(a.slider) || a.slider < 0 || a.slider > 3 || !Number.isInteger(a.dir) || a.dir < 0 || a.dir > 3) return { ok: false, reason: 'bad-op' };
    const o = m.rounds[0].outs[a.slider];
    if (!padButtons(o).some((b) => b.id === a.dir)) return { ok: false, reason: 'off-rail' };
    state.picks[a.slider] = a.dir;
    return { ok: true };
  },

  verify(state, m) {
    const outs = m.rounds[0].outs;
    const answered = state.picks.every((p) => p >= 0);
    const good = outs.map((o, k) => state.picks[k] === o.answer);
    const success = answered && good.every(Boolean);
    return { success, error: good.filter((x) => !x).length, partial: good.filter(Boolean).length / outs.length, detail: { answered, picks: [...state.picks] } };
  },

  oracle(m) { return m.rounds[0].outs.map((o, k) => ({ op: 'pick', slider: k, dir: o.answer })); },

  randomPolicy(m, rnd) { return m.rounds[0].outs.map((o, k) => ({ op: 'pick', slider: k, dir: padButtons(o)[Math.floor(rnd() * 2)].id })); },

  async mount(env) { if (env.style) env.assets.look = await styleLook(env.style); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Which way does each slider move?', 'The handle turns as its blue arrow shows · tap one arrow per slider');
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.look) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state } = env;
    const rd = m.rounds[0];
    g.save(); g.translate(br.x, br.y);
    const bg = g.createLinearGradient(0, 0, br.w, br.h);
    bg.addColorStop(0, '#eef2f5'); bg.addColorStop(1, '#dde4ea');
    g.fillStyle = bg; g.fillRect(0, 0, br.w, br.h);
    drawRound(g, rd, state.picks);
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const rd = env.manifest.rounds[0];
    let best = null, bd = HARD.hitR;
    rd.outs.forEach((o, k) => {
      for (const b of padButtons(o)) { const d = hyp(e.x - b.x, e.y - b.y); if (d <= bd) { bd = d; best = { op: 'pick', slider: k, dir: b.id }; } }
    });
    return best ? [best] : [];
  },

  footerStatus(env) {
    const n = env.state.picks.filter((p) => p >= 0).length;
    return `${n} of 4 sliders picked`;
  },
};

export const __test = { solveRound, senses, sliderDir, roundProblems, padButtons, beltGeom, drawFeatures, buildRound, HARD, DIRS };

const GEAR_SETS = [
  { name: 'metals', fams: ['metal', 'metal', 'metal'], tints: ['#c9d0d6', '#d9b45a', '#c9845a'] },
  { name: 'woods', fams: ['wood', 'wood', 'wood'], tints: [null, null, null] },
  { name: 'nylon', fams: ['flat', 'flat', 'flat'], tints: ['#f2efe6', '#2c2c2e', '#d9573f'] },
  { name: 'cast', fams: ['metal', 'metal', 'metal'], tints: ['#5d6166', '#a9adb2', '#b58a4c'] },
];
const GEAR_STYLES = ['web', 'spoked', 'solid', 'ring'];
const RAIL_KINDS = ['alu', 'wood', 'steel', 'nylon'];
const ROD_KINDS = ['flat', 'round', 'wood', 'carbon'];
const KNOBS = ['#c62828', '#1f1f1f', '#e0b03a', '#2e7d32'];
async function styleLook(st) {
  const bases = [...K.famPool(st, 'wood'), ...K.famPool(st, 'metal'), ...K.famPool(st, 'concrete'), ...K.famPool(st, 'fabric')];
  const sets = K.inSplit(st, 'mech_gearset', GEAR_SETS, (x) => x.name), styles = K.inSplit(st, 'mech_gearstyle', GEAR_STYLES);
  const [bi, si, yi] = st.primaryCombo('mech-scene', [bases.length, sets.length, styles.length]);
  const base = bases[bi], set = sets[si], gearStyle = styles[yi], R = st.rand;
  st.note(`mech_gearset:${set.name}`); st.note(`mech_gearstyle:${gearStyle}`);
  st.note(`tex:${base.id}`);
  const gTex = set.fams.map((f) => { const p = K.famPool(st, f === 'flat' ? 'concrete' : f); return p[Math.floor(R() * p.length)]; });
  const rail = K.pickIn(st, 'mech_rail', RAIL_KINDS), rod = K.pickIn(st, 'mech_rod', ROD_KINDS);
  const slideFam = K.pickIn(st, 'mech_slider', ['wood', 'metal', 'stone', 'concrete']);
  const sPool = K.famPool(st, slideFam), sTex = sPool[Math.floor(R() * sPool.length)];
  const railTex = rail === 'wood' ? st.pick('tex', K.FAMILY.wood) : st.pick('tex', K.FAMILY.metal);
  for (const t of [...gTex, sTex, railTex]) st.note(`tex:${t.id}`);

  const imgs = await Promise.all([base, ...gTex, sTex, railTex].map(K.texImg));
  const [bImg, g0, g1, g2, sImg, rImg] = imgs;
  const gearSw = [g0, g1, g2].map((im, k) => set.tints[k]
    ? K.swatch(im, { lum: K.lumHex(set.tints[k]) ** 0.45 * 0.85, contrast: set.name === 'nylon' ? 0.25 : 0.7, sat: 0, tint: set.tints[k], tintK: 0.85 })
    : K.swatch(im, { lum: 0.42 + 0.12 * k, contrast: 1.0, sat: 0.9 }));
  const baseLum = 0.55 + R() * 0.2;
  return {
    base: K.swatch(bImg, { lum: baseLum, contrast: 0.6, sat: 0.55 }), baseScale: 0.35 + R() * 0.3, off: [R() * 256, R() * 256],
    gearSw, gearMean: gearSw.map(K.swatchMean), gearStyle, set: set.name,
    rail, railSw: K.swatch(rImg, { lum: rail === 'alu' ? 0.72 : rail === 'nylon' ? 0.8 : rail === 'steel' ? 0.3 : 0.4, contrast: rail === 'nylon' ? 0.25 : 0.7, sat: rail === 'wood' ? 0.85 : rail === 'nylon' ? 0 : 0.2 }),
    rod, slideSw: K.swatch(sImg, { lum: 0.42 + R() * 0.12, contrast: 1.1, sat: 0.8 }), knob: K.pickIn(st, 'mech_knob', KNOBS),
    screws: R() < 0.6,
  };
}
const METAL_IDX = { steel: 0, brass: 1, copper: 2 };
function drawGearStyled(g, L, W) {
  const gr = W.gear, k = METAL_IDX[gr.metal] ?? 0, sw = L.gearSw[k], mean = L.gearMean[k];
  g.save();
  g.shadowColor = 'rgba(10,14,18,.4)'; g.shadowBlur = 6; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
  gearPath(g, W); g.fillStyle = mean; g.fill();
  g.shadowColor = 'transparent';
  gearPath(g, W); K.fillPat(g, sw, { scale: 0.3, ox: W.x * 3, oy: W.y * 2 });
  const grd = g.createRadialGradient(W.x - gr.r * 0.4, W.y - gr.r * 0.45, gr.r * 0.1, W.x, W.y, gr.r * 1.2);
  grd.addColorStop(0, 'rgba(255,255,255,0.28)'); grd.addColorStop(0.55, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(20,22,26,.9)'; g.lineWidth = 1.1; g.stroke();
  if (!W.pulley) {
    if (L.gearStyle === 'ring' || L.gearStyle === 'web') {
      for (const f of [0.78, 0.62]) { g.beginPath(); g.arc(W.x, W.y, gr.r * f, 0, TAU); g.strokeStyle = 'rgba(25,28,32,.28)'; g.lineWidth = 1; g.stroke(); }
    } else {
      g.beginPath(); g.arc(W.x, W.y, gr.r * 0.78, 0, TAU); g.strokeStyle = 'rgba(25,28,32,.35)'; g.lineWidth = 1.4; g.stroke();
    }
    g.beginPath(); g.arc(W.x, W.y, gr.r * 0.24, 0, TAU); g.fillStyle = mean; g.fill(); g.strokeStyle = 'rgba(25,28,32,.7)'; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}
function drawRailStyled(g, L, rd, o) {
  const e = railRect(rd, o), nx = -o.rail.uy, ny = o.rail.ux, W2 = 15;
  g.save();
  g.beginPath();
  g.moveTo(e.ax + nx * W2, e.ay + ny * W2); g.lineTo(e.bx + nx * W2, e.by + ny * W2); g.lineTo(e.bx - nx * W2, e.by - ny * W2); g.lineTo(e.ax - nx * W2, e.ay - ny * W2); g.closePath();
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  K.fillPat(g, L.railSw, { scale: 0.25 }); g.shadowColor = 'transparent';
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fill();
  const wall = L.rail === 'alu' ? '#9aa3ab' : L.rail === 'wood' ? '#6b4a2b' : L.rail === 'nylon' ? '#c9c4b8' : '#2f343a';
  for (const sg of [-1, 1]) {
    g.beginPath(); g.moveTo(e.ax + nx * sg * W2, e.ay + ny * sg * W2); g.lineTo(e.bx + nx * sg * W2, e.by + ny * sg * W2);
    g.strokeStyle = wall; g.lineWidth = 4.5; g.lineCap = 'round'; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1; g.stroke();
  }
  for (const [x, y] of [[e.ax, e.ay], [e.bx, e.by]]) {
    g.beginPath(); g.moveTo(x + nx * (W2 + 2), y + ny * (W2 + 2)); g.lineTo(x - nx * (W2 + 2), y - ny * (W2 + 2));
    g.strokeStyle = wall; g.lineWidth = 5; g.stroke();
  }
  g.restore();
}
function drawSliderStyled(g, L, o) {
  const ux = o.rail.ux, uy = o.rail.uy, nx = -uy, ny = ux, c = o.slider, bl = 17, bw = 12;
  g.save();
  g.beginPath();
  [[-bl, -bw], [bl, -bw], [bl, bw], [-bl, bw]].map(([a, b]) => [c.x + ux * a + nx * b, c.y + uy * a + ny * b]).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.shadowColor = 'rgba(10,14,18,.4)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
  K.fillPat(g, L.slideSw, { scale: 0.25 }); g.shadowColor = 'transparent';
  K.vShade(g, c.x - 18, c.y - 18, 36, 36, 0.2, 0.25);
  g.strokeStyle = 'rgba(15,12,10,.95)'; g.lineWidth = 1.4; g.stroke();
  for (const sg of [-1, 1]) { const x = c.x + ux * sg * 11, y = c.y + uy * sg * 11; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fillStyle = '#1d2024'; g.fill(); }
  g.restore();
}
function drawRodStyled(g, L, pin, c) {
  g.save(); g.lineCap = 'round';
  g.beginPath(); g.moveTo(pin.x, pin.y); g.lineTo(c.x, c.y);
  if (L.rod === 'wood') { g.strokeStyle = '#3d2814'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#b8874f'; g.lineWidth = 6.4; g.stroke(); g.strokeStyle = 'rgba(255,235,200,.35)'; g.lineWidth = 1.5; g.stroke(); }
  else if (L.rod === 'carbon') { g.strokeStyle = '#0e0f11'; g.lineWidth = 8; g.stroke(); g.strokeStyle = '#2a2d31'; g.lineWidth = 5.5; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.2; g.stroke(); }
  else if (L.rod === 'round') { g.strokeStyle = '#22262b'; g.lineWidth = 8; g.stroke(); g.strokeStyle = '#9aa2aa'; g.lineWidth = 5.5; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.4; g.stroke(); }
  else { g.strokeStyle = '#1f2327'; g.lineWidth = 10; g.stroke(); g.strokeStyle = '#596470'; g.lineWidth = 7.4; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.stroke(); }
  for (const p of [pin, c]) { g.beginPath(); g.arc(p.x, p.y, 4.4, 0, TAU); g.fillStyle = '#e4e6e8'; g.fill(); g.strokeStyle = '#1f2327'; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(p.x, p.y, 1.4, 0, TAU); g.fillStyle = '#1f2327'; g.fill(); }
  g.restore();
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state } = env, rd = m.rounds[0], sols = solveRound(rd);
  g.save(); g.translate(br.x, br.y);
  K.layer(env.assets, 'mech-base', g, 0, 0, br.w, br.h, (cg) => {
    cg.fillStyle = K.pat(cg, L.base, { scale: L.baseScale, ox: L.off[0], oy: L.off[1] }); cg.fillRect(0, 0, br.w, br.h);
    const vg = cg.createRadialGradient(br.w * 0.4, br.h * 0.35, 40, br.w / 2, br.h / 2, 340); vg.addColorStop(0, 'rgba(255,255,255,0.1)'); vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    cg.fillStyle = vg; cg.fillRect(0, 0, br.w, br.h);
    if (L.screws) for (const [x, y] of [[10, 10], [br.w - 10, 10], [10, br.h - 10], [br.w - 10, br.h - 10]]) {
      cg.beginPath(); cg.arc(x, y, 4, 0, TAU); cg.fillStyle = '#b9bec4'; cg.fill(); cg.strokeStyle = '#3a3f45'; cg.lineWidth = 1; cg.stroke();
      cg.beginPath(); cg.moveTo(x - 2.5, y); cg.lineTo(x + 2.5, y); cg.stroke();
    }
  });
  for (const o of rd.outs) drawRailStyled(g, L, rd, o);
  for (const W of rd.wheels) if (W.gear) drawGearStyled(g, L, W);
  for (const W of rd.wheels) if (W.pulley) drawPulley(g, W);
  rd.links.forEach((Lk, k) => { if (Lk !== 'mesh') drawBelt(g, rd.wheels[k], rd.wheels[k + 1], Lk === 'cross', { belt: '#1b1d20', beltHalo: 'rgba(255,255,255,0.85)' }); });
  for (const W of rd.wheels) drawAxle(g, W);
  for (const o of rd.outs) drawSliderStyled(g, L, o);
  rd.outs.forEach((o, k) => drawRodStyled(g, L, sols[k].pin, o.slider));
  drawHandle(g, rd, L.knob, true);
  rd.outs.forEach((o, k) => drawPad(g, o, state.picks[k]));
  g.restore();
}

export function semanticKey(m) {
  const rd = m.rounds[0], W = rd.wheels, O = W[0], q = (v) => Math.round(v / 40), b = (a) => ((Math.round(a / (Math.PI / 12)) % 24) + 24) % 24;
  const wheels = W.map((w) => `${w.gear ? w.gear.teeth : 0}/${w.pulley ? Math.round(w.pulley.r) : 0}@${q(w.x - O.x)},${q(w.y - O.y)}`).join(';');
  const outs = rd.outs.map((o) => `${o.wheel}:${o.rail.ux},${o.rail.uy}:${b(o.pin.a)}:${Math.sign(Math.round((o.pad.x - o.slider.x) * -o.rail.uy + (o.pad.y - o.slider.y) * o.rail.ux))}:${o.answer}`).join(';');
  return `mech2|${rd.spin}|${rd.links.join(',')}|${wheels}|${outs}|${b(rd.handle)}`;
}
