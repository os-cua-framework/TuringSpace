import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import * as L from '../common/_unblock_red_car_logic.js';
import * as S from '../common/_unblock_red_car_scene.js';

const { N, RED_ROW, EXIT_ANCHOR } = L;
const RT = S.RT;
const BOARD = { w: 340, h: 268 };
const HARD = Object.freeze({ minBlockers: 5, maxBlockers: 7, minMoves: 4, maxMoves: 6, slack: 2, vanShare: 0.3 });
const CAMERA = Object.freeze({ off: [20, 70], el: [35, 50], aim: [20, 32], aimEl: [35, 44], tries: 6 });
const VIS = Object.freeze({ body: 0.5, roof: 0.5, gapVisibleMax: 0.5, exit: 0.6 });
const TALL = Object.freeze({ min: 1.6, max: 2.0, near: 1.75 });
const COLORS = ['#3f7fd8', '#47a35a', '#e8c53a', '#7b52c7', '#2bb3b1', '#8d6e63', '#5c6bc0', '#9aa3ad', '#3c4f63'];
const RED = '#d93a32';
const tint = (hex, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('');

function layout(rng) {
  const vs = [{ dir: 'h', fixed: RED_ROW, len: 2 }], anchors = [rng.int(0, 2)];
  const nb = rng.int(HARD.minBlockers, HARD.maxBlockers);
  let fails = 0;
  while (vs.length < nb + 1 && fails < 80) {
    const len = rng.raw() < 0.7 ? 2 : 3, dir = rng.raw() < 0.6 ? 'v' : 'h';
    const fixed = rng.int(0, N - 1), a = rng.int(0, N - len);
    if (dir === 'h' && fixed === RED_ROW) { fails++; continue; }
    const v = { dir, fixed, len }, g = L.occupancy(vs, anchors);
    if (L.cellsOf(v, a).some(([r, c]) => g[r][c] >= 0)) { fails++; continue; }
    vs.push(v); anchors.push(a);
  }
  return vs.length === nb + 1 ? { vs, anchors } : null;
}
function dress(rng, vs, tall = -1) {
  const cols = rng.shuffle(COLORS);
  return vs.map((v, i) => {
    if (!i) return { ...v, kind: 'car', style: 'sedan', nose: 1, paint: RED };
    const kind = v.len === 3 ? 'truck' : (i === tall || rng.raw() < HARD.vanShare) ? 'van' : 'car';
    const out = { ...v, kind, nose: rng.raw() < 0.5 ? 1 : -1, paint: cols[(i - 1) % cols.length] };
    if (kind === 'car') out.style = rng.raw() < 0.5 ? 'sedan' : 'hatch';
    else out.H = +(S.CAR_ROOF * rng.uniform(i === tall ? TALL.near : TALL.min, TALL.max)).toFixed(2);
    if (kind === 'truck') out.box = tint(out.paint, 0.72);
    return out;
  });
}
function sampleCamera(rng) {
  const az = 90 * rng.int(0, 3) + rng.uniform(CAMERA.off[0], CAMERA.off[1]);
  return { az: +az.toFixed(2), el: +rng.uniform(CAMERA.el[0], CAMERA.el[1]).toFixed(2) };
}
function aimedCamera(rng, m, cand) {
  const v = m.vehicles[cand.p.a], sg = cand.near === cand.p.a ? -cand.p.s : cand.p.s;
  const dir = v.dir === 'h' ? [sg, 0] : [0, sg];
  const az = Math.atan2(dir[0], dir[1]) * 180 / Math.PI + rng.sign() * rng.uniform(CAMERA.aim[0], CAMERA.aim[1]);
  return { az: +(((az % 360) + 360) % 360).toFixed(2), el: +rng.uniform(CAMERA.aimEl[0], CAMERA.aimEl[1]).toFixed(2) };
}
function generate3d(rng) {
  for (let att = 0; att < 4000; att++) {
    const lay = layout(rng);
    if (!lay) continue;
    const { vs, anchors } = lay;
    if (!L.needsChain(vs, anchors)) continue;
    const plan = L.solveRush(vs, anchors, HARD.maxMoves);
    if (!plan || plan.length < HARD.minMoves) continue;
    const budget = plan.length + HARD.slack;
    const memo = new Map(), cands = [];
    for (const p of L.gapPairs(vs, anchors)) for (const far of [p.a, p.b]) {
      const o = L.misreadOutcome(vs, anchors, p, far, budget, budget);
      memo.set(`${p.a}|${p.s}|${far}`, o);
      if (o && o.decisive && (far === p.a ? p.b : p.a) !== 0) cands.push({ p, far, near: far === p.a ? p.b : p.a });
    }
    if (!cands.length) continue;
    const cand = rng.pick(cands);
    const vehicles = dress(rng, vs, cand.near);
    const m = { task: 'unblock_red_car', view: 'oblique', board: BOARD, camera: null, vehicles, start: anchors, plan, budget };
    m.camera = aimedCamera(rng, m, cand);
    const base = S.buildScene(m, anchors);
    for (let k = 0; k < CAMERA.tries; k++) {
      if (k) m.camera = aimedCamera(rng, m, cand);
      const sc = S.withCamera(base, m.camera);
      const trap = findTrap(m, L.gapPairs(vs, anchors), sc, memo);
      if (!trap || !visibilityOk(m, sc)) continue;
      m.trap = trap;
      return m;
    }
  }
  return JSON.parse(JSON.stringify(FALLBACK));
}

const sceneMemo = new Map();
function startScene(m) {
  const k = JSON.stringify([m.camera, m.vehicles, m.start]);
  if (!sceneMemo.has(k)) { if (sceneMemo.size > 16) sceneMemo.clear(); sceneMemo.set(k, S.buildScene(m, m.start)); }
  return sceneMemo.get(k);
}
function screenBox(sc, id) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of sc.byId.get(id)) {
    const b = s.bb;
    for (let c = 0; c < 8; c++) {
      const p = sc.cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  return [x0, y0, x1, y1];
}
const hitsAlone = (sc, id, d) => { const e = sc.cam.eye; for (const s of sc.byId.get(id)) if (RT.hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], Infinity) < Infinity) return true; return false; };
function touchOnScreen(sc, ia, ib) {
  const A = screenBox(sc, ia), B = screenBox(sc, ib);
  const x0 = Math.max(A[0], B[0]), y0 = Math.max(A[1], B[1]), x1 = Math.min(A[2], B[2]), y1 = Math.min(A[3], B[3]);
  for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
    const d = RT.camDir(sc.cam, x, y);
    if (hitsAlone(sc, ia, d) && hitsAlone(sc, ib, RT.camDir(sc.cam, x, y))) return true;
  }
  return false;
}
function slotVisible(sc, r, c) {
  let vis = 0, n = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = S.slotX(c) + (-0.5 + (i + 0.5) / 5) * (S.CELL - 0.3), z = S.slotZ(r) + (-0.5 + (j + 0.5) / 5) * (S.CELL - 0.3);
    const h = RT.rayToPoint(sc, x, 0.01, z); n++;
    if (h.id < 0 || h.t >= h.tP - 1e-3) vis++;
  }
  return vis / n;
}
const depthOf = (sc, p) => { const e = sc.cam.eye, F = sc.cam.F; return (p.x - e[0]) * F[0] + (0.5 - e[1]) * F[1] + (p.z - e[2]) * F[2]; };
function findTrap(m, pairs, sc = startScene(m), memo = new Map()) {
  for (const p of pairs) {
    const pa = S.placeOf(m.vehicles[p.a], m.start[p.a]), pb = S.placeOf(m.vehicles[p.b], m.start[p.b]);
    const far = depthOf(sc, pa) > depthOf(sc, pb) ? p.a : p.b;
    if (slotVisible(sc, p.gap.r, p.gap.c) > VIS.gapVisibleMax) continue;
    if (!touchOnScreen(sc, S.VID(p.a), S.VID(p.b))) continue;
    const k = `${p.a}|${p.s}|${far}`;
    if (!memo.has(k)) memo.set(k, L.misreadOutcome(m.vehicles, m.start, p, far, m.budget, m.budget));
    const o = memo.get(k);
    if (!o || !o.decisive) continue;
    return { a: p.a, b: p.b, s: p.s, gap: p.gap, misread: far };
  }
  return null;
}
function roofPoints(v, a) {
  const p = S.placeOf(v, a), f = [Math.cos(p.h), Math.sin(p.h)], r = [-Math.sin(p.h), Math.cos(p.h)];
  let u0, u1, hw, y;
  if (v.kind === 'car') { const st = S.STYLES[v.style]; const c0 = -st.L / 2 + st.RO; u0 = c0 + st.cab[1] + 0.1; u1 = c0 + st.cab[2] - 0.1; hw = st.W / 2 - 0.07 - (st.roof - st.belt) * Math.tan(13 * Math.PI / 180) - 0.08; y = st.roof; }
  else if (v.kind === 'van') { u0 = -S.VAN.L / 2 + 0.15; u1 = S.VAN.L / 2 - 1.05; hw = S.VAN.W / 2 - 0.12; y = v.H; }
  else { u0 = -S.TRUCK.L / 2 + 0.15; u1 = S.TRUCK.L / 2 - 2.3; hw = S.TRUCK.W / 2 - 0.12; y = v.H; }
  const pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const u = u0 + (u1 - u0) * (i + 0.5) / 5, w = -hw + 2 * hw * (j + 0.5) / 3;
    pts.push([p.x + f[0] * u + r[0] * w, y + 0.005, p.z + f[1] * u + r[1] * w]);
  }
  return pts;
}
function roofVisible(sc, m, i) {
  const id = S.VID(i), pts = roofPoints(m.vehicles[i], m.start[i]);
  return pts.filter(([x, y, z]) => { const h = RT.rayToPoint(sc, x, y, z); return h.id === id && Math.abs(h.t - h.tP) < 0.06; }).length / pts.length;
}
function exitVisible(sc) {
  const pts = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
    const x = S.EXIT.x + 0.35 + 2.35 * (i + 0.5) / 12, z = S.EXIT.z0 + S.CELL * (j + 0.5) / 6;
    if (S.EXIT.inArrow(x, z)) pts.push([x, z]);
  }
  return pts.filter(([x, z]) => { const h = RT.rayToPoint(sc, x, 0.01, z); return h.id < 0 || h.t >= h.tP - 1e-3; }).length / pts.length;
}
function visibilityOk(m, sc = startScene(m)) {
  if (exitVisible(sc) < VIS.exit) return false;
  for (let i = 0; i < m.vehicles.length; i++) if (roofVisible(sc, m, i) < VIS.roof) return false;
  for (let i = 0; i < m.vehicles.length; i++) if (RT.objectStats(sc, S.VID(i), 2).frac < VIS.body) return false;
  return true;
}

function gate3d(m) {
  const vs = m.vehicles;
  if (!Array.isArray(vs) || !Array.isArray(m.start) || vs.length !== m.start.length) return false;
  const nb = vs.length - 1;
  if (nb < HARD.minBlockers || nb > HARD.maxBlockers) return false;
  const r0 = vs[0];
  if (!(r0.dir === 'h' && r0.fixed === RED_ROW && r0.len === 2 && r0.kind === 'car' && r0.paint === RED)) return false;
  if (vs.some((v, i) => i && (v.dir === 'h' && v.fixed === RED_ROW || v.paint === RED))) return false;
  for (const v of vs) {
    if (v.len === 3 ? v.kind !== 'truck' : !['car', 'van'].includes(v.kind)) return false;
    if (v.kind === 'car' && !S.STYLES[v.style]) return false;
    if (v.kind !== 'car' && !(v.H / S.CAR_ROOF >= TALL.min - 0.004 && v.H / S.CAR_ROOF <= TALL.max + 0.004)) return false;
  }
  const g = L.occupancy(vs, m.start);
  let cells = 0; for (const row of g) for (const c of row) if (c >= 0) cells++;
  if (cells !== vs.reduce((t, v) => t + v.len, 0)) return false;
  const cam = m.camera, off = cam && ((cam.az % 90) + 90) % 90;
  if (!cam || !(off >= CAMERA.off[0] && off <= CAMERA.off[1]) || !(cam.el >= CAMERA.el[0] && cam.el <= CAMERA.el[1])) return false;
  const lv = vs;
  if (!L.needsChain(lv, m.start)) return false;
  const p = L.solveRush(lv, m.start, HARD.maxMoves);
  if (!p || p.length < HARD.minMoves || p.length !== m.plan.length || m.budget !== p.length + HARD.slack) return false;
  if (!L.playClamped(lv, m.start, m.plan, m.budget).ok) return false;
  if (!findTrap(m, L.gapPairs(lv, m.start))) return false;
  return visibilityOk(m);
}

const stateKey = (s) => s.a.join(',');
const sceneCache = { m: null, map: new Map() };
function sceneFor(m, a) {
  if (sceneCache.m !== m) { sceneCache.m = m; sceneCache.map = new Map(); }
  const k = a.join(',');
  if (!sceneCache.map.has(k)) { if (sceneCache.map.size > 12) sceneCache.map.clear(); sceneCache.map.set(k, S.buildScene(m, a)); }
  return sceneCache.map.get(k);
}
const axisOf = (v) => (v.dir === 'h' ? [1, 0, 0] : [0, 0, 1]);
function grab(m, a, x, y) {
  const sc = sceneFor(m, a), id = RT.pickId(sc, x, y), i = id - S.VID(0);
  if (!(i >= 0 && i < m.vehicles.length)) return null;
  const d = RT.camDir(sc.cam, x, y).slice(), e = sc.cam.eye;
  let t = Infinity;
  for (const s of sc.byId.get(id)) t = Math.min(t, RT.hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], t));
  return { i, P: [e[0] + d[0] * t, e[1] + d[1] * t, e[2] + d[2] * t] };
}
function slideFor(m, P, v, x, y) {
  const cam = S.cameraFor(m.camera), A = axisOf(v);
  let best = 0, bd = Infinity;
  for (let d = -N * S.CELL; d <= N * S.CELL; d += 0.02) {
    const q = cam.project(P[0] + A[0] * d, P[1], P[2] + A[2] * d);
    if (!(q.z > 0)) continue;
    const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
const DRAG = new WeakMap();
function pointer3d(e, env) {
  const { manifest: m, state: s } = env;
  if (env.submitted) { DRAG.delete(s); return []; }
  if (e.type === 'down') {
    if (s.moves >= m.budget) return [];
    const gr = grab(m, s.a, e.x, e.y);
    if (!gr) return [];
    const [lo, hi] = L.freeRange(m.vehicles, s.a, gr.i);
    DRAG.set(s, { ...gr, lo, hi, cells: 0 });
    return [];
  }
  const d = DRAG.get(s);
  if (!d) return [];
  const v = m.vehicles[d.i], off = slideFor(m, d.P, v, e.x, e.y);
  d.cells = Math.max(d.lo, Math.min(d.hi, Math.round(off / S.CELL)));
  if (e.type === 'up') { DRAG.delete(s); return d.cells ? [{ op: 'move', id: d.i, d: d.cells }] : []; }
  return [];
}
function boxCorners(v, a, off) {
  const p = S.placeOf(v, a, off), hl = S.lengthOf(v) / 2, hw = S.widthOf(v) / 2, H = S.heightOf(v), c = Math.cos(p.h), sn = Math.sin(p.h);
  const out = [];
  for (const y of [0, H]) for (const [u, w] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) out.push([p.x + c * u - sn * w, y, p.z + sn * u + c * w]);
  return out;
}
const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function drawGhost(g, cam, corners, fill, stroke) {
  const P = corners.map(([x, y, z]) => cam.project(x, y, z));
  g.lineJoin = 'round';
  for (const f of FACES) {
    g.beginPath(); f.forEach((k, j) => (j ? g.lineTo(P[k].x, P[k].y) : g.moveTo(P[k].x, P[k].y))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = 'rgba(30,45,60,.5)'; g.lineWidth = 3; g.stroke(); g.strokeStyle = stroke; g.lineWidth = 1.4; g.stroke(); }
  }
}
const imgCache = { m: null, map: new Map() };
function drawBoard3d(g, br, env) {
  const { manifest: m, state: s } = env;
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
  const q = Math.min(2, RT.contextScale(g));
  if (imgCache.m !== m) { imgCache.m = m; imgCache.map = new Map(); }
  const key = `${q}|${stateKey(s)}`;
  let canvas = imgCache.map.get(key);
  if (!canvas) {
    canvas = RT.toCanvas(RT.render(sceneFor(m, s.a), q));
    if (imgCache.map.size > 16) imgCache.map.delete(imgCache.map.keys().next().value);
    imgCache.map.set(key, canvas);
  }
  g.drawImage(canvas, 0, 0, BOARD.w, BOARD.h);
  const cam = S.cameraFor(m.camera), zc = (S.EXIT.z0 + S.EXIT.z1) / 2, p0 = cam.project(S.EXIT.x, 0, zc), p1 = cam.project(S.EXIT.x + S.EXIT_LANE, 0, zc);
  const dl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  g.font = `800 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText('EXIT').width + 10;
  const lx = Math.max(tw / 2 + 2, Math.min(BOARD.w - tw / 2 - 2, p1.x + (p1.x - p0.x) / dl * 20)), ly = Math.max(11, Math.min(BOARD.h - 11, p1.y + (p1.y - p0.y) / dl * 14));
  g.fillStyle = 'rgba(255,255,255,.88)'; rr(g, lx - tw / 2, ly - 9, tw, 18, 4); g.fill();
  g.fillStyle = '#2f9e55'; g.fillText('EXIT', lx, ly + 0.5);
  const d = !env.submitted && DRAG.get(s);
  if (d) {
    const v = m.vehicles[d.i];
    drawGhost(g, cam, boxCorners(v, s.a[d.i], 0), 'rgba(255,255,255,.28)', null);
    if (d.cells) drawGhost(g, cam, boxCorners(v, s.a[d.i], d.cells), 'rgba(255,255,255,.22)', 'rgba(255,255,255,.95)');
  }
  g.restore();
}
function oraclePoints3d(m) {
  const a = m.start.slice(), out = [];
  for (const mv of m.plan) {
    const sc = sceneFor(m, a), st = RT.objectStats(sc, S.VID(mv.id), 1);
    const [x, y] = st.pt, gr = grab(m, a, x, y), A = axisOf(m.vehicles[mv.id]), dd = mv.d * S.CELL;
    const to = S.cameraFor(m.camera).project(gr.P[0] + A[0] * dd, gr.P[1], gr.P[2] + A[2] * dd);
    out.push({ from: [+x.toFixed(2), +y.toFixed(2)], to: [+to.x.toFixed(2), +to.y.toFixed(2)] });
    a[mv.id] += mv.d;
  }
  return out;
}

const is3d = (m) => m && m.view === 'oblique';
const task = {
  meta: {
    name: 'unblock_red_car', family: 'C', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'move', id: 'vehicle index (0 = red car)', d: 'signed whole cells along its own length (+ = right/down)', budget: 'evaluation instances: shortest plan + 2 moves in all; further moves refused' }],
    promptHuman: 'Get the red car out through the exit',
  },
  wantsMoveRedraw: true,
  generate(rng, level, index, knobs) { return knobs && knobs.ext ? generateFlat(rng) : generate3d(rng); },
  init(m) { return { a: m.start.slice(), moves: 0 }; },
  applyAction(s, act, m) {
    if (act?.op !== 'move' || !Number.isInteger(act.id) || !m.vehicles[act.id] || !Number.isInteger(act.d) || !act.d) return { ok: false, reason: 'bad-action' };
    if (is3d(m) && s.moves >= m.budget) return { ok: false, reason: 'no-moves-left' };
    const [lo, hi] = is3d(m) ? L.freeRange(m.vehicles, s.a, act.id) : freeRangeL(m.vehicles, s.a, act.id);
    if (act.d < lo || act.d > hi) return { ok: false, reason: 'blocked' };
    s.a[act.id] += act.d; s.moves++;
    return { ok: true };
  },
  verify(s, m) {
    const success = solvedL(s.a);
    const g = occupancyL(m.vehicles, s.a);
    let clear = 0; for (let c = s.a[0] + 2; c < N; c++) if (g[RED_ROW][c] < 0) clear++;
    const need = N - (s.a[0] + 2);
    return { success, partial: success ? 1 : (need ? clear / need : 1) * 0.5, error: EXIT_ANCHOR - s.a[0], detail: { redCol: s.a[0], moves: s.moves } };
  },
  oracle(m) { return m.plan.map((p) => ({ op: 'move', id: p.id, d: p.d })); },
  oraclePoints(m) { return is3d(m) ? oraclePoints3d(m) : []; },
  randomPolicy(m, rnd) {
    return Array.from({ length: 6 }, () => {
      const d = (1 + Math.floor(rnd() * 4)) * (rnd() < 0.5 ? -1 : 1);
      return { op: 'move', id: Math.floor(rnd() * m.vehicles.length), d };
    });
  },
  drawPrompt(g, r) { drawPromptText(g, r, 'Get the red car out through the exit', 'Drag cars and trucks along their length to clear its way'); },
  drawBoard(g, br, env) { return is3d(env.manifest) ? drawBoard3d(g, br, env) : drawBoardFlat(g, br, env); },
  pointer(e, env) { return is3d(env.manifest) ? pointer3d(e, env) : pointerFlat(e, env); },
  footerStatus(env) {
    const n = env.state.moves, m = env.manifest;
    if (!is3d(m)) return n ? `${n} move${n > 1 ? 's' : ''}` : 'Drag a vehicle';
    return `${n ? `${n} move${n > 1 ? 's' : ''}` : 'Drag a vehicle'} · Moves left: ${Math.max(0, m.budget - n)}`;
  },
};
export default task;

export function gate(m) {
  if (!m || m.task !== 'unblock_red_car') return false;
  return is3d(m) ? gate3d(m) : gateFlat(m);
}
export { solveRushL as solveRush, needsChainL as needsChain };
export { findTrap as _findTrap, visibilityOk as _visibilityOk, touchOnScreen as _touchOnScreen, slotVisible as _slotVisible, startScene as _startScene, grab as _grab, slideFor as _slideFor };

const FALLBACK = {"task":"unblock_red_car","view":"oblique","board":{"w":340,"h":268},"camera":{"az":201.35,"el":40.54},"vehicles":[{"dir":"h","fixed":2,"len":2,"kind":"car","style":"sedan","nose":1,"paint":"#d93a32"},{"dir":"v","fixed":5,"len":2,"kind":"van","nose":-1,"paint":"#e8c53a","H":2.75},{"dir":"v","fixed":2,"len":2,"kind":"car","nose":-1,"paint":"#7b52c7","style":"hatch"},{"dir":"v","fixed":3,"len":2,"kind":"car","nose":-1,"paint":"#5c6bc0","style":"sedan"},{"dir":"v","fixed":4,"len":3,"kind":"truck","nose":-1,"paint":"#3c4f63","H":2.74,"box":"#c8ced3"},{"dir":"h","fixed":5,"len":2,"kind":"car","nose":-1,"paint":"#9aa3ad","style":"sedan"},{"dir":"v","fixed":0,"len":2,"kind":"car","nose":1,"paint":"#3f7fd8","style":"hatch"},{"dir":"v","fixed":2,"len":2,"kind":"van","nose":1,"paint":"#8d6e63","H":2.46}],"start":[1,2,4,3,0,4,1,0],"plan":[{"id":1,"d":-2},{"id":2,"d":-1},{"id":5,"d":-4},{"id":4,"d":3},{"id":0,"d":3}],"budget":7,"trap":{"a":1,"b":5,"s":1,"gap":{"r":4,"c":5},"misread":5}};
export const _fallbackOk = () => gate(JSON.parse(JSON.stringify(FALLBACK)));

const CELL = 40, GX = 18, GY = 14, SIDE = N * CELL;
const HARD_L = Object.freeze({ minBlockers: 3, maxBlockers: 5, minMoves: 3, maxMoves: 4, maxBfs: 6 });
const cellsOfL = (v, a) => Array.from({ length: v.len }, (_, k) => (v.dir === 'h' ? [v.fixed, a + k] : [a + k, v.fixed]));
function occupancyL(vs, anchors, skip = -1) {
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  vs.forEach((v, i) => { if (i !== skip) for (const [r, c] of cellsOfL(v, anchors[i])) g[r][c] = i; });
  return g;
}
function freeRangeL(vs, anchors, i) {
  const g = occupancyL(vs, anchors, i), v = vs[i], a = anchors[i];
  const free = (b) => b >= 0 && b + v.len <= N && cellsOfL(v, b).every(([r, c]) => g[r][c] < 0);
  let lo = a, hi = a;
  while (free(lo - 1)) lo--;
  while (free(hi + 1)) hi++;
  return [lo - a, hi - a];
}
const solvedL = (anchors) => anchors[0] === EXIT_ANCHOR;
const laneBlockersL = (vs, anchors) => {
  const g = occupancyL(vs, anchors), ids = new Set();
  for (let c = anchors[0] + 2; c < N; c++) if (g[RED_ROW][c] > 0) ids.add(g[RED_ROW][c]);
  return [...ids];
};
function needsChainL(vs, anchors) {
  const lane = laneBlockersL(vs, anchors);
  if (!lane.length) return false;
  return lane.some((i) => {
    const [lo, hi] = freeRangeL(vs, anchors, i);
    for (let d = lo; d <= hi; d++) if (!cellsOfL(vs[i], anchors[i] + d).some(([r]) => r === RED_ROW)) return false;
    return true;
  });
}
function solveRushL(vs, start, maxDepth = HARD_L.maxBfs) {
  if (solvedL(start)) return [];
  const key = (a) => a.join(',');
  const prev = new Map([[key(start), null]]); let frontier = [start];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const st of frontier) {
      for (let i = 0; i < vs.length; i++) {
        const [lo, hi] = freeRangeL(vs, st, i);
        for (let d = lo; d <= hi; d++) {
          if (!d) continue;
          const n = st.slice(); n[i] += d; const k = key(n);
          if (prev.has(k)) continue;
          prev.set(k, { from: key(st), id: i, d });
          if (solvedL(n)) {
            const path = []; let cur = k;
            while (prev.get(cur)) { const p = prev.get(cur); path.push({ id: p.id, d: p.d }); cur = p.from; }
            return path.reverse();
          }
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return null;
}
function generateFlat(rng) {
  for (let att = 0; att < 3000; att++) {
    const vs = [{ id: 0, dir: 'h', fixed: RED_ROW, len: 2, color: '#d93a32', red: true }];
    const anchors = [rng.int(0, 2)];
    const nb = rng.int(HARD_L.minBlockers, HARD_L.maxBlockers), cols = rng.shuffle(COLORS.slice());
    let fails = 0;
    while (vs.length < nb + 1 && fails < 60) {
      const len = rng.raw() < 0.7 ? 2 : 3, dir = rng.raw() < 0.6 ? 'v' : 'h';
      const fixed = rng.int(0, N - 1), a = rng.int(0, N - len);
      if (dir === 'h' && fixed === RED_ROW) { fails++; continue; }
      const v = { id: vs.length, dir, fixed, len, color: cols[vs.length - 1] };
      const g = occupancyL(vs, anchors);
      if (cellsOfL(v, a).some(([r, c]) => g[r][c] >= 0)) { fails++; continue; }
      vs.push(v); anchors.push(a);
    }
    if (vs.length !== nb + 1) continue;
    if (!needsChainL(vs, anchors)) continue;
    const plan = solveRushL(vs, anchors, HARD_L.maxMoves);
    if (!plan || plan.length < HARD_L.minMoves || plan.length > HARD_L.maxMoves) continue;
    return { task: 'unblock_red_car', board: BOARD, vehicles: vs, start: anchors, plan };
  }
  throw new Error('unblock_red_car: no instance');
}
function gateFlat(m) {
  const nb = m.vehicles.length - 1;
  if (nb < HARD_L.minBlockers || nb > HARD_L.maxBlockers) return false;
  if (m.vehicles.some((v, i) => i && v.dir === 'h' && v.fixed === RED_ROW)) return false;
  if (!needsChainL(m.vehicles, m.start)) return false;
  const p = solveRushL(m.vehicles, m.start, HARD_L.maxMoves);
  return !!p && p.length >= HARD_L.minMoves && p.length === m.plan.length;
}
function vehicleRect(v, a, off = 0) {
  const x0 = v.dir === 'h' ? a * CELL + off : v.fixed * CELL, y0 = v.dir === 'h' ? v.fixed * CELL : a * CELL + off;
  const w = v.dir === 'h' ? v.len * CELL : CELL, h = v.dir === 'h' ? CELL : v.len * CELL;
  return { x: GX + x0 + 4, y: GY + y0 + 4, w: w - 8, h: h - 8 };
}
function drawVehicle(g, v, a, off) {
  const R = vehicleRect(v, a, off), horiz = v.dir === 'h';
  g.save();
  g.fillStyle = 'rgba(0,0,0,.22)'; rr(g, R.x + 2, R.y + 3, R.w, R.h, 7); g.fill();
  g.fillStyle = v.color; g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; rr(g, R.x, R.y, R.w, R.h, 7); g.fill(); g.stroke();
  g.fillStyle = 'rgba(25,35,50,.55)';
  const band = (t) => { if (horiz) rr(g, R.x + t, R.y + 5, 7, R.h - 10, 2); else rr(g, R.x + 5, R.y + t, R.w - 10, 7, 2); g.fill(); };
  if (v.len === 2) { band(7); band((horiz ? R.w : R.h) - 14); }
  else {
    band(6);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.2;
    for (let k = 1; k <= 4; k++) {
      const t = 22 + k * (((horiz ? R.w : R.h) - 30) / 5);
      g.beginPath(); if (horiz) { g.moveTo(R.x + t, R.y + 5); g.lineTo(R.x + t, R.y + R.h - 5); } else { g.moveTo(R.x + 5, R.y + t); g.lineTo(R.x + R.w - 5, R.y + t); } g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,.22)'; rr(g, R.x + (horiz ? 18 : 5), R.y + (horiz ? 5 : 18), horiz ? R.w - 36 : R.w - 10, horiz ? R.h - 10 : R.h - 36, 3); g.fill();
  g.restore();
}
function drawBoardFlat(g, br, env) {
  const { manifest: m, state: s } = env;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, BOARD.w, BOARD.h);
  g.fillStyle = '#5b6068'; rr(g, GX - 7, GY - 7, SIDE + 14, SIDE + 14, 6); g.fill();
  g.fillStyle = '#d6d3cb'; g.fillRect(GX, GY, SIDE, SIDE);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1;
  for (let k = 1; k < N; k++) {
    g.beginPath(); g.moveTo(GX + k * CELL, GY); g.lineTo(GX + k * CELL, GY + SIDE); g.stroke();
    g.beginPath(); g.moveTo(GX, GY + k * CELL); g.lineTo(GX + SIDE, GY + k * CELL); g.stroke();
  }
  const ey = GY + RED_ROW * CELL;
  g.fillStyle = '#d6d3cb'; g.fillRect(GX + SIDE - 1, ey, 9, CELL);
  g.fillStyle = '#2f9e55';
  g.beginPath(); g.moveTo(GX + SIDE + 14, ey + 12); g.lineTo(GX + SIDE + 40, ey + 12); g.lineTo(GX + SIDE + 40, ey + 4); g.lineTo(GX + SIDE + 56, ey + CELL / 2);
  g.lineTo(GX + SIDE + 40, ey + CELL - 4); g.lineTo(GX + SIDE + 40, ey + CELL - 12); g.lineTo(GX + SIDE + 14, ey + CELL - 12); g.closePath(); g.fill();
  g.fillStyle = '#2f9e55'; g.font = `800 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText('EXIT', GX + SIDE + 36, ey - 3);
  const drag = env.drag && !env.submitted ? env.drag : null;
  m.vehicles.forEach((v, i) => { if (!drag || drag.id !== i) drawVehicle(g, v, s.a[i], 0); });
  if (drag) drawVehicle(g, m.vehicles[drag.id], s.a[drag.id], drag.off);
  g.restore();
}
function pointerFlat(e, env) {
  const { manifest: m, state: s } = env;
  if (env.submitted) { env.drag = null; return []; }
  if (e.type === 'down') {
    const c = Math.floor((e.x - GX) / CELL), r = Math.floor((e.y - GY) / CELL);
    if (r < 0 || r >= N || c < 0 || c >= N) return [];
    const id = occupancyL(m.vehicles, s.a)[r][c];
    if (id < 0) return [];
    const [lo, hi] = freeRangeL(m.vehicles, s.a, id), h = m.vehicles[id].dir === 'h';
    env.drag = { id, h, start: h ? e.x : e.y, off: 0, min: lo * CELL, max: hi * CELL };
    return [];
  }
  const d = env.drag;
  if (!d) return [];
  d.off = Math.max(d.min, Math.min(d.max, (d.h ? e.x : e.y) - d.start));
  if (e.type === 'up') {
    env.drag = null;
    const cells = Math.round(d.off / CELL);
    return cells ? [{ op: 'move', id: d.id, d: cells }] : [];
  }
  return [];
}
