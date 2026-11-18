import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { makeIsoCam, prim, tube, renderScene, toCanvas, contextScale, badge, MATERIALS } from '../common/_pipes_connect_iso.js';

const HARD = Object.freeze({ lanes: 8, valves: 4, decoys: 4, rows: [1, 2, 3, 4, 5, 6, 7], minMoves: 6, merges: 2, tanks: 6, minMoved: 3, minDistinct: 3, maxH1: 1 / 20 });
const PANEL_W = 480;
const BOARD = { w: PANEL_W - 20, h: 430 };
const LABELS = ['A', 'B', 'C', 'D'];
const Z_FRONT = 8.0, Z_TANK = 8.55;
const RP = 0.095, YF = RP + 0.035, YU = 0.66;

export function simulate(m) {
  const L = m.lanes;
  const flowOf = new Array(m.pipes.length).fill(0).map((_, i) => i);
  const f = (x) => { while (flowOf[x] !== x) { flowOf[x] = flowOf[flowOf[x]]; x = flowOf[x]; } return x; };
  const occ = new Array(L).fill(-1);
  const segStart = new Array(L).fill(null);
  const floor = [];
  const runs = [];
  for (const p of m.pipes) { occ[p.lane] = p.id; segStart[p.lane] = 0; }
  for (const mv of m.moves) {
    const p = occ[mv.from];
    if (p < 0) return null;
    floor.push({ lane: mv.from, z0: segStart[mv.from], z1: mv.z, pipe: p, riseEnd: true });
    occ[mv.from] = -1; segStart[mv.from] = null;
    const lo = Math.min(mv.from, mv.to), hi = Math.max(mv.from, mv.to);
    const over = [];
    for (let l = lo + 1; l < hi; l++) if (occ[l] >= 0) over.push(l);
    const merge = occ[mv.to] >= 0;
    runs.push({ pipe: p, from: mv.from, to: mv.to, z: mv.z, merge, over, overPipes: over.map((l) => occ[l]) });
    if (merge) { const a = f(p), b = f(occ[mv.to]); flowOf[a] = b; }
    else { occ[mv.to] = p; segStart[mv.to] = mv.z; }
  }
  for (let l = 0; l < L; l++) if (occ[l] >= 0) floor.push({ lane: l, z0: segStart[l], z1: Z_FRONT, pipe: occ[l], toTank: true });
  const finalLane = new Array(m.pipes.length).fill(-1);
  for (let l = 0; l < L; l++) if (occ[l] >= 0) finalLane[f(occ[l])] = l;
  const laneOfPipe = m.pipes.map((p) => finalLane[f(p.id)]);
  return { floor, runs, laneOfPipe, root: m.pipes.map((p) => f(p.id)) };
}

function tanksOf(m, sim) {
  const lanes = [...new Set(sim.floor.filter((s) => s.toTank).map((s) => s.lane))].sort((a, b) => a - b);
  return lanes;
}

export function h1Chance(m) {
  const sim = simulate(m);
  const n = m.pipes.length;
  const par = [...Array(n).keys()];
  const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let i = 0; i < n; i++) { const a = f(i), b = f(sim.root[i]); if (a !== b) par[a] = b; }
  for (const r of sim.runs) for (const q of r.overPipes) { const a = f(r.pipe), b = f(q); if (a !== b) par[a] = b; }
  let pr = 1;
  for (const v of m.valves) {
    const g = f(v.pipe);
    const lanes = new Set(m.pipes.filter((p) => f(p.id) === g).map((p) => sim.laneOfPipe[p.id]).filter((l) => l >= 0));
    const truth = sim.laneOfPipe[v.pipe];
    pr *= lanes.has(truth) ? 1 / lanes.size : 0;
  }
  return pr;
}

function problems(m) {
  const errs = [];
  const sim = simulate(m);
  if (!sim) return ['bad-move'];
  const tanks = tanksOf(m, sim);
  if (tanks.length !== HARD.tanks) errs.push('tank-count');
  if (sim.runs.length < HARD.minMoves) errs.push('few-moves');
  if (sim.runs.filter((r) => r.merge).length !== HARD.merges) errs.push('merge-count');
  if (sim.runs.some((r) => !r.over.length)) errs.push('run-without-crossing');
  const valveRoots = new Set(m.valves.map((v) => sim.root[v.pipe]));
  for (const mr of sim.runs.filter((r) => r.merge)) if (!valveRoots.has(sim.root[mr.pipe])) errs.push('merge-without-valve');
  const movers = new Set(sim.runs.map((r) => r.pipe));
  if (!m.valves.every((v) => movers.has(v.pipe))) errs.push('valve-never-rises');
  if (!m.pipes.some((p) => p.kind === 'cap' && movers.has(p.id))) errs.push('no-dead-pipe-moves');
  const moved = m.valves.filter((v) => sim.laneOfPipe[v.pipe] !== v.lane).length;
  if (moved < HARD.minMoved) errs.push('valves-stay-straight');
  const ans = m.valves.map((v) => tanks.indexOf(sim.laneOfPipe[v.pipe]));
  if (ans.some((a) => a < 0)) errs.push('valve-without-tank');
  if (new Set(ans).size < HARD.minDistinct) errs.push('all-same-tank');
  if (JSON.stringify(ans) !== JSON.stringify(m.answer)) errs.push('answer-mismatch');
  if (h1Chance(m) > HARD.maxH1) errs.push('crossings-as-joints-guessable');
  return errs;
}

export function valveFeatures(m) {
  const sim = simulate(m);
  const rises = new Set(sim.runs.map((r) => r.from)), drops = new Set(sim.runs.map((r) => r.to)), tee = new Set(sim.runs.filter((r) => r.merge).map((r) => r.to));
  return m.valves.map((v) => m.tanks.map((t) => {
    const d = t.lane - v.lane, a = Math.abs(d);
    const dr = drops.has(t.lane) ? 1 : 0, ri = rises.has(t.lane) ? 1 : 0, te = tee.has(t.lane) ? 1 : 0;
    return [d, a, d * d, t.idx, v.lane, t.idx * v.lane, dr, ri, te, dr * a, te * a, ri * a, t.lane];
  }));
}
const FPOS = [
  { quad: false, kappa: 1, mu: [-0.0196,2.0532,6.3211,1.5,2.5188,3.7781,0.9046,0.6531,0.1432,1.8573,0.3135,1.2778,2.4992], sd: [2.5141,1.4511,7.1029,1.118,1.7571,4.3285,0.2938,0.476,0.3503,1.5351,0.9659,1.5644,1.7577], w: [0.0184,0.7221,-1.2973,0.3204,0,-0.552,0.9969,0.3235,-0.231,1.0478,0.2002,-0.2924,0.0263] },
  { quad: false, kappa: 1, mu: [-0.0066,2.0643,6.3711,1.5,2.509,3.7635,0.9336,0.6808,0.1391,1.9284,0.3082,1.3443,2.5024], sd: [2.5241,1.4525,7.1184,1.118,1.7511,4.3129,0.2489,0.4662,0.3461,1.5158,0.9558,1.5752,1.7639], w: [0.0045,0.5512,-1.027,0.2495,0,-0.4037,0.9107,0.1733,-0.16,0.8157,0.1255,-0.1555,0.0064] },
  { quad: false, kappa: 1, mu: [-0.0137,2.0761,6.4149,1.5,2.5143,3.7714,0.9533,0.6961,0.1449,1.9816,0.3287,1.3838,2.5006], sd: [2.5327,1.4507,7.1191,1.118,1.7424,4.3044,0.2111,0.46,0.352,1.4992,0.984,1.5787,1.7646], w: [0.0174,0.4628,-0.8412,0.1067,0,-0.229,0.8025,0.1487,-0.1672,0.6648,0.1316,-0.1302,0.025] },
  { quad: true, kappa: 1, mu: [0.0235,2.0773,6.4256,1.5,2.4876,3.7313,0.9705,0.7116,0.1419,2.0182,0.3309,1.4125,2.5111], sd: [2.5348,1.4527,7.1342,1.118,1.7308,4.2684,0.1692,0.453,0.3489,1.4841,0.991,1.5759,1.7718], w: [-0.0103,0.2188,0.0505,-0.0195,0,0.0604,0.1637,0.1311,-0.1268,0.2768,0.5217,-0.3369,-0.0139,0.0278,0.002,0.0251,-0.0608,-0.0317,-0.019,0.0177,0.043,0.0526,0.0109,-0.0573,0.0281,0.0082,-0.253,-1.8044,-0.1519,-0.1107,0.3582,0.1506,-0.7911,0.6396,-0.1773,-1.0311,1.2686,-0.1077,2.3991,0.2046,0.2184,-0.6871,0.1688,0.6973,-0.285,-1.689,1.2496,-1.7586,0.2585,-0.3365,0.0913,0.1057,0.0115,-0.1138,-0.0451,-0.1417,0.0885,-0.1421,0.0004,0,-0.0036,-0.0127,0.0077,-0.1003,-0.1156,0.1823,-0.1632,-0.0454,-0.0574,-0.0498,0.1048,0.0702,0.3225,-0.2134,0.2561,-0.0296,-0.3845,-0.1151,-0.0442,-0.0824,0.0254,-0.1078,0.013,-0.0689,0.116,-0.8347,-0.7029,-0.1999,0.0716,-0.1292,0.6069,0.6347,-0.0126,-0.0229,-0.2196,-1.0088,1.1998,-0.098,-0.7229,0.3442,0.0947,1.3668,-0.1134,-0.0345] },
  { quad: true, kappa: 1, mu: [0.0067,2.0794,6.4156,1.5,2.5059,3.7588,0.9787,0.7275,0.135,2.0358,0.3219,1.4481,2.5126], sd: [2.5329,1.4462,7.1077,1.118,1.713,4.2567,0.1444,0.4452,0.3418,1.4685,0.9845,1.5696,1.7823], w: [-0.02,0.1513,0.0823,0.022,0,0.0468,0.1108,0.1113,-0.0878,0.1883,0.4151,-0.2443,-0.0271,0.0483,0.0864,-0.0508,-0.0652,-0.0257,0.0627,-0.0118,0.0172,-0.0667,0.0807,0.0428,0.0029,0.0441,-0.0896,-1.6193,-0.2062,-0.2358,0.4943,0.1038,-0.5723,0.519,-0.044,-0.9005,1.0524,-0.1042,2.1724,0.1445,0.2584,-0.505,0.1229,0.5511,-0.2914,-1.5367,1.3005,-1.726,0.1815,-0.3147,0.0574,0.103,-0.0063,-0.0099,0.0136,-0.2059,0.0217,-0.0447,-0.0392,0,-0.0041,0.0077,-0.0123,-0.0454,-0.2295,0.085,-0.0562,-0.0363,-0.0721,-0.0357,0.0368,0.1004,0.4684,-0.0985,0.0488,0.0892,-0.3233,-0.0809,-0.0281,-0.0596,0.018,-0.0708,-0.0094,-0.0601,-0.0781,-0.6014,-0.3935,-0.1432,0.0124,-0.0923,0.5003,0.5066,0.1268,-0.1366,-0.0731,-0.8864,1.004,-0.1063,-0.6161,0.1523,0.1329,1.1115,-0.0514,0.0264] },
];
export function fvnDesign(x, f) {
  const z = x.map((v, k) => (v - f.mu[k]) / f.sd[k]);
  if (f.quad) { const K0 = z.length; for (let a = 0; a < K0; a++) for (let b = a; b < K0; b++) z.push(z[a] * z[b] / 2); }
  return z;
}
function posAccept(m) {
  if (!FPOS.length) return 1;
  const F = valveFeatures(m);
  let w = 1;
  for (const f of FPOS) {
    F.forEach((rowsV, v) => {
      const sc = rowsV.map((x) => Math.exp(fvnDesign(x, f).reduce((acc, z, k) => acc + z * f.w[k], 0)));
      const p = sc[m.answer[v]] / sc.reduce((a, b) => a + b, 0);
      w *= Math.min(1, f.kappa / (rowsV.length * p));
    });
  }
  return w;
}

function generateOnce(rng) {
  const L = HARD.lanes;
  const lanes = rng.shuffle([...Array(L).keys()]);
  const valveLanes = lanes.slice(0, HARD.valves).sort((a, b) => a - b);
  const decoyLanes = lanes.slice(HARD.valves, HARD.valves + HARD.decoys);
  const pipes = [];
  const labels = rng.shuffle(LABELS);
  valveLanes.forEach((l, k) => pipes.push({ id: pipes.length, kind: 'valve', lane: l, label: labels[k] }));
  decoyLanes.forEach((l) => pipes.push({ id: pipes.length, kind: 'cap', lane: l }));
  const moves = [];
  const occ = new Array(L).fill(false);
  for (const p of pipes) occ[p.lane] = true;
  let merges = 0;
  const who = new Array(L).fill(-1);
  for (const p of pipes) who[p.lane] = p.id;
  const movedPipe = new Set();
  for (const z of HARD.rows) {
    if (moves.length >= HARD.minMoves && rng.raw() < 0.25) continue;
    const occupied = [...Array(L).keys()].filter((l) => occ[l]);
    const fresh = occupied.filter((l) => who[l] >= 0 && !movedPipe.has(who[l]));
    const from = rng.pick(fresh.length && rng.raw() < 0.8 ? fresh : occupied);
    const cands = [];
    for (let to = 0; to < L; to++) {
      if (to === from) continue;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      let crossed = 0; for (let l = lo + 1; l < hi; l++) if (occ[l]) crossed++;
      if (!crossed) continue;
      if (occ[to] && merges >= HARD.merges) continue;
      cands.push(to);
    }
    if (!cands.length) continue;
    const to = rng.pick(cands);
    if (occ[to]) merges++;
    movedPipe.add(who[from]);
    if (!occ[to]) who[to] = who[from];
    who[from] = -1;
    occ[from] = false; occ[to] = true;
    moves.push({ from, to, z });
  }
  const m = { task: 'fluid_valve_network', board: { ...BOARD }, lanes: L, pipes, moves,
    valves: LABELS.map((lab) => pipes.find((p) => p.label === lab)).map((p) => ({ label: p.label, lane: p.lane, pipe: p.id })) };
  const sim = simulate(m);
  if (!sim) return null;
  const tanks = tanksOf(m, sim);
  m.tanks = tanks.map((lane, idx) => ({ lane, idx }));
  m.answer = m.valves.map((v) => tanks.indexOf(sim.laneOfPipe[v.pipe]));
  if (problems(m).length) return null;
  return rng.raw() < posAccept(m) ? m : null;
}

const r1 = (v) => Math.round(v * 10) / 10;
function withExtView(m, rng, split) {
  return { ...m, view: { yaw: r1(rng.sign() * rng.uniform(18, 26)), pitch: r1(rng.uniform(42, 48)) }, ext: split };
}
const viewOk = (v) => !!v && Number.isFinite(v.yaw) && Math.abs(v.yaw) >= 17.9 && Math.abs(v.yaw) <= 26.1 && v.pitch >= 41.9 && v.pitch <= 48.1;

export function semanticKey(m) {
  return `fluid_valve_network|${m.pipes.map((p) => `${p.kind === 'valve' ? p.label : 'x'}${p.lane}`).join(',')}|${m.moves.map((v) => `${v.from}>${v.to}@${v.z}`).join(',')}|${m.answer.join('')}`;
}

export function gate(m) {
  if (m && m.ext && !viewOk(m.view)) return false;
  if (!m || m.task !== 'fluid_valve_network' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || m.lanes !== HARD.lanes) return false;
  if (!Array.isArray(m.pipes) || m.pipes.length !== HARD.valves + HARD.decoys) return false;
  const lanesUsed = new Set();
  for (const [i, p] of m.pipes.entries()) {
    if (!p || p.id !== i || !Number.isInteger(p.lane) || p.lane < 0 || p.lane >= m.lanes || lanesUsed.has(p.lane)) return false;
    lanesUsed.add(p.lane);
    if (!['valve', 'cap'].includes(p.kind)) return false;
  }
  if (m.pipes.filter((p) => p.kind === 'valve').length !== HARD.valves) return false;
  if (!Array.isArray(m.valves) || m.valves.length !== HARD.valves) return false;
  const vp = m.pipes.filter((p) => p.kind === 'valve');
  if (vp.some((p, k) => k && p.lane <= vp[k - 1].lane)) return false;
  if (JSON.stringify(vp.map((p) => p.label).sort()) !== JSON.stringify(LABELS)) return false;
  if (!m.valves.every((v, k) => v.label === LABELS[k] && m.pipes[v.pipe]?.kind === 'valve' && m.pipes[v.pipe].label === v.label && m.pipes[v.pipe].lane === v.lane)) return false;
  if (!Array.isArray(m.moves) || m.moves.length > HARD.rows.length) return false;
  let lastZ = 0;
  for (const mv of m.moves) {
    if (!Number.isInteger(mv.from) || !Number.isInteger(mv.to) || mv.from === mv.to || mv.from < 0 || mv.to < 0 || mv.from >= m.lanes || mv.to >= m.lanes) return false;
    if (!HARD.rows.includes(mv.z) || mv.z <= lastZ) return false;
    lastZ = mv.z;
  }
  if (!Array.isArray(m.tanks) || m.tanks.length !== HARD.tanks || !m.tanks.every((t, k) => t.idx === k && Number.isInteger(t.lane) && (k === 0 || t.lane > m.tanks[k - 1].lane))) return false;
  const sim = simulate(m);
  if (!sim || JSON.stringify(tanksOf(m, sim)) !== JSON.stringify(m.tanks.map((t) => t.lane))) return false;
  if (!Array.isArray(m.answer) || m.answer.length !== HARD.valves || !m.answer.every((a) => Number.isInteger(a) && a >= 0 && a < HARD.tanks)) return false;
  return problems(m).length === 0;
}

const CAM = { yaw: 22, pitch: 45 };
function camFor(prims, view = null) {
  const V = view ? { yaw: view.yaw, pitch: view.pitch } : CAM;
  const c0 = makeIsoCam({ ...V, scale: 1, ox: 0, oy: 0 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of prims) {
    for (const e of [p.a, p.b]) {
      const q = c0.project(e);
      x0 = Math.min(x0, q.x - p.r); x1 = Math.max(x1, q.x + p.r); y0 = Math.min(y0, q.y - p.r); y1 = Math.max(y1, q.y + p.r);
    }
  }
  const padX = 10, top = 34, bottom = 30;
  const s = Math.min((BOARD.w - 2 * padX) / (x1 - x0), (BOARD.h - top - bottom) / (y1 - y0));
  return makeIsoCam({ ...V, scale: s, ox: BOARD.w / 2 - s * (x0 + x1) / 2, oy: top + (BOARD.h - top - bottom) / 2 - s * (y0 + y1) / 2 });
}

function rounded(points, rad = 0.16, seg = 5) {
  const out = [points[0]];
  for (let i = 1; i + 1 < points.length; i++) {
    const p = points[i], a = points[i - 1], b = points[i + 1];
    const da = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], db = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const la = Math.hypot(...da), lb = Math.hypot(...db);
    const r = Math.min(rad, la / 2, lb / 2);
    const pa = da.map((v, k) => p[k] + v / la * r), pb = db.map((v, k) => p[k] + v / lb * r);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t;
      out.push([0, 1, 2].map((q) => u * u * pa[q] + 2 * u * t * p[q] + t * t * pb[q]));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function sceneFor(m, look = null) {
  const sim = simulate(m);
  const prims = [];
  let g = 1000;
  const X = (lane) => lane;
  const labels = [];
  const pipeGrp = (id) => 100 + id;
  for (const s of sim.floor) {
    const x = X(s.lane);
    const z0 = s.z0 === 0 ? 0.02 : s.z0, z1 = s.z1;
    const grp = pipeGrp(s.pipe);
    const pts = [];
    if (s.riseEnd) {
      pts.push([x, YF, z0], [x, YF, z1], [x, YU, z1]);
    } else pts.push([x, YF, z0], [x, YF, z1 + (s.toTank ? 0.3 : 0)]);
    tube(rounded(pts), RP, 'pipe', grp, prims, true);
    for (let z = Math.ceil(z0 + 0.35); z < z1 - 0.1; z += 1) prims.push(prim.box([x - 0.13, 0, z - 0.05], [x + 0.13, YF - RP + 0.01, z + 0.05], 'steelDark', g++));
  }
  for (const r of sim.runs) {
    const x0 = X(r.from), x1 = X(r.to), z = r.z;
    const grp = pipeGrp(r.pipe);
    const pts = [[x0, YU - 0.3, z], [x0, YU, z], [x1, YU, z], [x1, YF + (r.merge ? RP * 1.2 : 0), z]];
    if (!r.merge) pts.push([x1, YF, z + 0.35]);
    tube(rounded(pts, 0.18), RP, 'pipe', grp, prims, true);
    for (const l of r.over) {
      const x = X(l), cg = g++;
      prims.push(prim.cyl([x - 0.06, YU, z], [x + 0.06, YU, z], RP * 1.3, 'brass', cg));
      prims.push(prim.cyl([x - 0.09, YU, z], [x - 0.055, YU, z], RP * 1.6, 'brass', cg));
      prims.push(prim.cyl([x + 0.055, YU, z], [x + 0.09, YU, z], RP * 1.6, 'brass', cg));
    }
    if (r.merge) {
      const t = g++;
      prims.push(prim.sphere([x1, YF, z], RP * 1.55, 'brass', t));
      prims.push(prim.cyl([x1, YF, z - 0.2], [x1, YF, z + 0.2], RP * 1.3, 'brass', t));
      prims.push(prim.cyl([x1, YF + RP * 0.6, z], [x1, YF + RP * 2.2, z], RP * 1.3, 'brass', t));
    }
    for (let x = Math.min(x0, x1) + 0.5; x < Math.max(x0, x1); x += 1) {
      const sg = g++;
      prims.push(prim.box([x - 0.07, 0, z - 0.07], [x + 0.07, 0.03, z + 0.07], 'steelDark', sg));
      prims.push(prim.cyl([x, 0.03, z], [x, YU - RP - 0.03, z], 0.028, 'rack', sg));
      prims.push(prim.box([x - 0.06, YU - RP - 0.05, z - 0.05], [x + 0.06, YU - RP - 0.01, z + 0.05], 'rack', sg));
    }
  }
  for (const p of m.pipes) {
    const x = X(p.lane);
    if (p.kind === 'valve') {
      const grp = pipeGrp(p.id);
      tube(rounded([[x, 0.0, -0.55], [x, YF, -0.55], [x, YF, 0.05]], 0.16), RP, 'pipe', grp, prims, true);
      prims.push(prim.cyl([x, 0, -0.55], [x, 0.03, -0.55], RP * 1.9, 'steelDark', g++));
      prims.push(prim.cyl([x, YF, -0.2], [x, YF, 0.02], RP * 1.55, 'pipeDark', g++));
      prims.push(prim.cyl([x, YF, -0.09], [x, YF + 0.3, -0.09], 0.022, 'steelDark', g++));
      const wy = YF + 0.3, wr = 0.15;
      if (look) g = look.valve(prims, x, wy, -0.09, g);
      else {
        const wg = g++;
        const ring = [];
        for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([x + wr * Math.cos(a), wy, -0.09 + wr * Math.sin(a)]); }
        tube(ring, 0.024, 'red', wg, prims);
        for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.3; prims.push(prim.capsule([x, wy, -0.09], [x + wr * Math.cos(a), wy, -0.09 + wr * Math.sin(a)], 0.014, 'red', wg)); }
      }
      labels.push({ kind: 'valve', label: p.label, pipe: p.id, at: [x, wy + 0.24, -0.09] });
    } else {
      const grp = pipeGrp(p.id);
      tube([[x, YF, 0.0], [x, YF, 0.05]], RP, 'pipe', grp, prims, true);
      prims.push(prim.cyl([x, YF, -0.07], [x, YF, 0.02], RP * 1.38, 'cap', g++));
    }
  }
  for (const t of m.tanks) {
    const x = X(t.lane);
    if (look) g = look.store(prims, x, Z_TANK, g);
    else {
      const tg = g++;
      prims.push(prim.cyl([x, 0, Z_TANK], [x, 0.78, Z_TANK], 0.3, 'tankPaint', tg));
      prims.push(prim.cyl([x, 0.68, Z_TANK], [x, 0.72, Z_TANK], 0.312, 'pipeDark', g++));
      prims.push(prim.cyl([x, 0.04, Z_TANK], [x, 0.1, Z_TANK], 0.315, 'pipeDark', g++));
    }
    labels.push({ kind: 'tank', idx: t.idx, lane: t.lane, at: [x, 0.42, Z_TANK + 0.3], top: [x, 0.78, Z_TANK], bot: [x, 0, Z_TANK] });
  }
  return { prims, labels };
}

function render(m, q, look = null) {
  const { prims, labels } = sceneFor(m);
  const cam = camFor(prims, m.view);
  const L = HARD.lanes;
  const img = look ? renderScene(look.scene(m, sceneFor(m, look).prims), cam, BOARD.w, BOARD.h, q) : renderScene({
    prims,
    floor: { y: 0, lo: [-6, -6], hi: [L + 6, Z_TANK + 6], m: 'floorLight' },
    light: [-0.55, 1, 0.3],
    extent: { lo: [-1, 0, -1.2], hi: [L + 0.2, 1.1, Z_TANK + 0.8] },
    bg: [238, 241, 245],
  }, cam, BOARD.w, BOARD.h, q);
  const hits = labels.map((l) => {
    const p = cam.project(l.at);
    if (l.kind === 'tank') {
      const a = cam.project(l.top), b = cam.project(l.bot), w = 0.3 * cam.s + 3;
      return { ...l, x: p.x, y: p.y, axis: [a.x, a.y, b.x, b.y], reach: 0.34 * cam.s + 4, box: { x: a.x - w, y: a.y - 0.22 * cam.s, w: 2 * w, h: b.y - a.y + 0.44 * cam.s } };
    }
    return { ...l, x: p.x, y: p.y };
  });
  return { img, hits, cam };
}

export function renderPreview(m, q = 2) { return render(m, q); }

async function fluidLook(style) {
  const X = await import('../common/_pipes_look.js');
  const L = await X.buildPipeLook(style, 'fluid');
  const r = L.rnd;
  const storeKind = X.pickSplit(style, r, 'g09_store_kind_v2', X.STORE_KINDS), valveKind = X.pickSplit(style, r, 'g09_valve_kind_v2', X.VALVE_KINDS);
  const handle = X.pickSplit(style, r, 'g09_handle_kind', X.HANDLE_COLS);
  const dAz = (r() * 2 - 1) * 15, dEl = r();
  const rackMat = { c: [150, 132, 104], kd: 0.8, ks: 0.12, sh: 10, kind: 0, tex: X.texAlbedo(L.TT, { size: 0.5, L: 0.06 + 0.2 * r(), contrast: 0.5, sat: 0.3, safe: true }) };
  const smats = X.storeMats(storeKind, L, r);
  const t = L.theme;
  const L0 = [-0.55, 1, 0.3], el = (52 + 12 * dEl) * Math.PI / 180, hz = Math.hypot(L0[0], L0[2]);
  const Lel = [L0[0] / hz * Math.cos(el), Math.sin(el), L0[2] / hz * Math.cos(el)];
  const mats = {
    ...MATERIALS, ...L.mats, ...smats,
    brass: { c: t.tee, kd: 0.8, ks: 0.7, sh: 34, kind: 1 },
    rack: rackMat,
    steelDark: { c: [72, 78, 84], kd: 0.75, ks: 0.3, sh: 18, kind: 1 },
    handle: { c: handle, kd: 0.8, ks: 0.4, sh: 26, kind: 1 },
    valveTrim: { c: [96, 102, 108], kd: 0.75, ks: 0.4, sh: 24, kind: 1 },
  };
  return {
    ids: { theme: t.id, rack: L.tray.id, ground: L.ground.id, hdri: L.hd && L.hd.id, storeKind, valveKind },
    store: (prims, x, z, g) => X.storeVessel(prim, tube, prims, storeKind, x, z, g),
    valve: (prims, x, wy, zc, g) => X.valveHandle(prim, tube, prims, valveKind, x, wy, zc, g),
    scene(m, prims) {
      const yaw = m.view ? m.view.yaw : CAM.yaw, Lanes = HARD.lanes;
      return {
        prims, mats, tint: L.tint, ink: L.ink, bg: [150, 150, 150],
        floor: { y: 0, lo: [-6, -6], hi: [Lanes + 6, Z_TANK + 6], m: 'floorG' },
        light: X.rotateLight(Lel, CAM.yaw, yaw, dAz),
        extent: { lo: [-1, 0, -1.2], hi: [Lanes + 0.2, 1.1, Z_TANK + 0.8] },
      };
    },
  };
}

export default {
  meta: {
    name: 'fluid_valve_network', family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 60, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'select', valve: '0..3 (A, B, C, D)' }, { op: 'assign', valve: '0..3', tank: '0..5 (tank 1..6)' },
      { op: 'clear', valve: '0..3' }],
    promptHuman: 'Tap the tank each valve fills',
  },

  generate(rng, level, index, knobs) {
    for (let att = 0; att < 20000; att++) {
      const m = generateOnce(rng);
      if (m && knobs && knobs.ext) return withExtView(m, rng, knobs.ext);
      if (m) return m;
    }
    throw new Error('fluid_valve_network: generator exhausted');
  },

  init() { return { sel: 0, assign: {} }; },

  applyAction(state, a, m) {
    const nV = m.valves.length, nT = m.tanks.length;
    const okV = (v) => Number.isInteger(v) && v >= 0 && v < nV;
    if (a?.op === 'select' && okV(a.valve)) { state.sel = a.valve; return { ok: true }; }
    if (a?.op === 'clear' && okV(a.valve)) { delete state.assign[a.valve]; state.sel = a.valve; return { ok: true }; }
    if (a?.op === 'assign' && okV(a.valve) && Number.isInteger(a.tank) && a.tank >= 0 && a.tank < nT) {
      state.assign[a.valve] = a.tank;
      let nxt = -1;
      for (let k = 1; k <= nV; k++) { const v = (a.valve + k) % nV; if (!(v in state.assign)) { nxt = v; break; } }
      state.sel = nxt;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-action' };
  },

  verify(state, m) {
    const nV = m.valves.length;
    const correct = m.answer.filter((t, v) => state.assign[v] === t).length;
    const assigned = Object.keys(state.assign).length;
    return { success: assigned === nV && correct === nV, partial: correct / nV, error: nV - correct, detail: { assigned } };
  },

  oracle(m) { return m.answer.map((tank, valve) => ({ op: 'assign', valve, tank })); },

  randomPolicy(m, rnd) { return m.valves.map((_, valve) => ({ op: 'assign', valve, tank: Math.floor(rnd() * m.tanks.length) })); },

  async mount(env) {
    env.assets.fvn = null;
    if (env.style) env.assets.look = await fluidLook(env.style);
  },

  drawPrompt(g, r) { drawPromptText(g, r, 'Tap the tank each valve fills', 'Tap a valve letter, then its tank'); },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const q = contextScale(g);
    let c = env.assets.fvn;
    if (!c || c.q !== q) { const r = render(m, q, env.style ? env.assets.look : null); c = env.assets.fvn = { q, canvas: toCanvas(r.img), hits: r.hits }; }
    g.save();
    g.translate(br.x, br.y);
    g.drawImage(c.canvas, 0, 0, BOARD.w, BOARD.h);
    for (const h of c.hits) {
      if (h.kind === 'valve') {
        const v = m.valves.findIndex((vv) => vv.pipe === h.pipe);
        const sel = st.sel === v;
        badge(g, h.x, h.y, h.label, { r: 10.5, fill: sel ? ACCENT : '#ffffff', color: sel ? '#ffffff' : '#1f2d38', stroke: sel ? ACCENT : '#1f2d38' });
        if (v in st.assign) {
          g.fillStyle = '#1f2d38'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(`→${st.assign[v] + 1}`, h.x, h.y - 17);
        }
      } else {
        const fed = m.valves.map((vv, v) => (st.assign[v] === h.idx ? vv.label : null)).filter(Boolean);
        badge(g, h.x, h.y, String(h.idx + 1), { r: 10, fill: fed.length ? '#e8f3ff' : '#ffffff', stroke: fed.length ? ACCENT : '#1f2d38' });
        if (fed.length) {
          g.fillStyle = ACCENT; g.font = `800 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(fed.join(''), h.x, h.y + 18);
        }
      }
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const m = env.manifest, st = env.state;
    const hits = env.assets.fvn?.hits || render(m, 1).hits;
    for (const h of hits) {
      if (h.kind !== 'valve' || Math.hypot(e.x - h.x, e.y - h.y) > 16) continue;
      const v = m.valves.findIndex((vv) => vv.pipe === h.pipe);
      return [st.sel === v && v in st.assign ? { op: 'clear', valve: v } : { op: 'select', valve: v }];
    }
    let best = null, bestD = Infinity;
    for (const h of hits) {
      if (h.kind !== 'tank') continue;
      const [ax, ay, bx, by] = h.axis, dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.y - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(e.x - ax - t * dx, e.y - ay - t * dy);
      if (d <= h.reach && d < bestD) { best = h; bestD = d; }
    }
    if (!best) return [];
    if (st.sel < 0) {
      const v = m.valves.findIndex((_, k) => st.assign[k] === best.idx);
      return v >= 0 ? [{ op: 'select', valve: v }] : [];
    }
    if (st.assign[st.sel] === best.idx) return [{ op: 'clear', valve: st.sel }];
    return [{ op: 'assign', valve: st.sel, tank: best.idx }];
  },

  footerStatus(env) {
    const { state: st, manifest: m } = env, n = Object.keys(st.assign).length;
    if (st.sel < 0) return `${n} of ${m.valves.length} set · tap a valve letter to change`;
    const label = m.valves[st.sel].label;
    return st.sel in st.assign ? `Valve ${label} → tank ${st.assign[st.sel] + 1} · tap ${label} again to clear` : `Valve ${label}: tap its tank`;
  },
};
