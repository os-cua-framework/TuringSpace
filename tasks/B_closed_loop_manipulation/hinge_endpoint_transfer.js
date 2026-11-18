import { makeCompositeTask } from '../common/_composite_task_common.js';
import { hingeEndpointTransferSpec } from '../common/_composite_ab_scenes.js';
import { UI_FONT } from '../core/panel.js';
import { kindsFor, pickKind, texItems, makeMat, fillMat, localPattern, domeShade, letterBadge } from '../common/_object_mat.js';
import { tableFit, makeTableView, drawTableFloor, tableDisc, tableBar, fillStroke } from '../common/_hinge_endpoint_transfer_table.js';

const TAU = Math.PI * 2;
const EPS = 1e-6;
const DEG = Math.PI / 180;
const L1 = 86, L2 = 62;
const BASE_TURNS = [30, 60, 90, 120, 150];
const ELBOW_TURNS = [30, 60, 90, 120];
const N_SOCKETS = 16;
const SOCKET_GAP = 32;
const SOCKET_HIT = 16;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const label = (id) => String.fromCharCode(65 + id);
const dirWord = (deg) => (deg > 0 ? 'clockwise' : 'counterclockwise');

function poseOf(scene, k1, k2) {
  const p = scene.pivotW || scene.pivot;
  const e = { x: p.x + Math.cos(scene.a1 + k1 * DEG) * scene.L1, y: p.y + Math.sin(scene.a1 + k1 * DEG) * scene.L1 };
  return { elbow: e, tip: { x: e.x + Math.cos(scene.a2 + k2 * DEG) * scene.L2, y: e.y + Math.sin(scene.a2 + k2 * DEG) * scene.L2 } };
}
const answerPose = (scene) => [scene.baseTurn, scene.baseTurn + scene.elbowTurn];
const target = (scene) => poseOf(scene, ...answerPose(scene)).tip;

function segDist(q, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(q.x - a.x - t * vx, q.y - a.y - t * vy);
}

function ikElbow(scene, t) {
  const p = scene.pivotW || scene.pivot;
  const phi = Math.atan2(t.y - p.y, t.x - p.x);
  const d = Math.max(Math.abs(scene.L1 - scene.L2) + 1e-3, Math.min(scene.L1 + scene.L2 - 1e-3, Math.hypot(t.x - p.x, t.y - p.y)));
  const al = Math.acos(Math.max(-1, Math.min(1, (scene.L1 * scene.L1 + d * d - scene.L2 * scene.L2) / (2 * scene.L1 * d))));
  const tip = { x: p.x + Math.cos(phi) * d, y: p.y + Math.sin(phi) * d };
  for (const s of [1, -1]) {
    const e = { x: p.x + Math.cos(phi + s * al) * scene.L1, y: p.y + Math.sin(phi + s * al) * scene.L1 };
    const cross = (e.x - p.x) * (tip.y - e.y) - (e.y - p.y) * (tip.x - e.x);
    if (Math.sign(cross) === scene.bendSign) return { elbow: e, tip };
  }
  return { elbow: { x: p.x + Math.cos(phi) * scene.L1, y: p.y + Math.sin(phi) * scene.L1 }, tip };
}

function socketPoses(rng, T1, T2) {
  const anchors = [
    [T1, T2],
    [T1, T1 - T2],
    [-T1, -T1 + T2],
  ];
  const tier1 = [
    [T1, T1],
    [0, T2],
    [T1 + T2, T1 + T2],
    [-T1, -T1 - T2],
  ];
  const near = [];
  for (const [a, b] of [[T1, T1 + T2], ...anchors]) {
    near.push([a, b + 30], [a, b - 30], [a + 30, b + 30], [a - 30, b - 30]);
  }
  const tier2 = [
    [T1, T1 + T2 + 60], [T1, T1 + T2 - 60], [T1 + 30, T1 + T2], [T1 - 30, T1 + T2],
    [-T1, T2], [-T1, -T1], [T1 + T2, T2], [T1, T2 + 60], [T1, T2 - 60], [-T1, -T1 + T2 + 60], [-T1, -T1 + T2 - 60],
  ];
  const fill = [];
  for (let k1 = -180; k1 < 180; k1 += 30) for (let k2 = -180; k2 < 180; k2 += 30) fill.push([k1, k2]);
  return [...rng.shuffle(anchors), ...rng.shuffle(tier1), ...rng.shuffle(near), ...rng.shuffle(tier2), ...rng.shuffle(fill)];
}

function buildArmScene(rng, pivot) {
  const a1 = rng.uniform(-Math.PI, Math.PI);
  const bend0 = rng.sign() * rng.uniform(45, 135) * DEG;
  const a2 = a1 + bend0;
  const baseTurn = BASE_TURNS[rng.int(0, BASE_TURNS.length - 1)] * rng.sign();
  const elbowTurn = ELBOW_TURNS[rng.int(0, ELBOW_TURNS.length - 1)] * rng.sign();
  const scene = { pivot, L1, L2, a1, a2, bendSign: Math.sign(bend0), baseTurn, elbowTurn };
  const bend1 = bend0 + elbowTurn * DEG;
  if (Math.sign(bend1) !== scene.bendSign || Math.abs(bend1) < 25 * DEG || Math.abs(bend1) > 155 * DEG) return null;
  const s0 = poseOf(scene, 0, 0);
  scene.elbow0 = s0.elbow; scene.start = s0.tip;
  const ok = (q) => q.x >= 16 && q.x <= 340 - 16 && q.y >= 16 && q.y <= 360 - 16
    && dist(q, scene.start) >= 30 && dist(q, pivot) >= 28 && dist(q, scene.elbow0) >= 24
    && segDist(q, pivot, scene.elbow0) >= 22 && segDist(q, scene.elbow0, scene.start) >= 22;
  const answerTip = target(scene);
  if (!ok(answerTip)) return null;
  const picked = [{ ...answerTip, pose: answerPose(scene) }];
  for (const [k1, k2] of socketPoses(rng, baseTurn, elbowTurn)) {
    if (picked.length >= N_SOCKETS) break;
    const t = poseOf(scene, k1, k2).tip;
    if (ok(t) && picked.every((c) => dist(c, t) >= SOCKET_GAP)) picked.push({ ...t, pose: [((k1 % 360) + 540) % 360 - 180, ((k2 % 360) + 540) % 360 - 180] });
  }
  if (picked.length < N_SOCKETS) return null;
  const crowd = (c) => picked.filter((o) => o !== c && dist(o, c) < 50).length;
  if (picked.slice(1).every((c) => crowd(c) < crowd(picked[0]))) return null;
  scene.candidates = rng.shuffle(picked).map((c, id) => ({ x: c.x, y: c.y, hitRadius: SOCKET_HIT, pose: c.pose, id }));
  scene.source = { ...scene.start, r: 14, label: '' };
  return scene;
}

function pairwiseSeparated(points, gap) {
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (dist(points[i], points[j]) < gap) return false;
  return true;
}

const PITCH = [35, 45];
const CAM_DIST = 640;
const TILE = 30;
const REACH_FIT = L1 + L2 + 18;
const FIT_AREA = { x: 14, y: 14, w: 312, h: 332 };
const SOCK_R = 12;
const SOCK_GAP_S = 28;
const TRAP_GAP = 28;
const TRAP_MARGIN = 6;
const sdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wOf = (c) => ({ x: c.wx, y: c.wy });

function shortcutEnds(scene, V) {
  const P = scene.pivot, E = scene.elbow0, T = scene.start, t1 = scene.baseTurn * DEG, t2 = scene.elbowTurn * DEG;
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const e1 = { x: P.x + rot({ x: E.x - P.x, y: E.y - P.y }, t1).x, y: P.y + rot({ x: E.x - P.x, y: E.y - P.y }, t1).y };
  const r2v = rot({ x: T.x - E.x, y: T.y - E.y }, t1 + t2);
  const flat = { x: e1.x + r2v.x, y: e1.y + r2v.y };
  const a = poseOf(scene, ...answerPose(scene)), Ea = V.P(a.elbow.x, a.elbow.y), Ta = V.P(a.tip.x, a.tip.y);
  const along = (from, to, len) => { const d = sdist(from, to) || 1; return { x: (to.x - from.x) * len / d, y: (to.y - from.y) * len / d }; };
  const d1 = along(P, Ea, sdist(P, E)), e2 = { x: P.x + d1.x, y: P.y + d1.y };
  const d2 = along(Ea, Ta, sdist(E, T));
  return { flat, keepLen: { x: e2.x + d2.x, y: e2.y + d2.y } };
}
function trapHolds(scene, answer, q) {
  let best = scene.candidates[0];
  for (const c of scene.candidates) if (sdist(c, q) < sdist(best, q)) best = c;
  const da = sdist(scene.candidates[answer], q);
  return best.id !== answer && da >= TRAP_GAP && da - sdist(best, q) >= TRAP_MARGIN;
}

function buildPerspScene(rng) {
  const az = rng.uniform(0, 360), el = rng.uniform(PITCH[0], PITCH[1]);
  const a1 = rng.uniform(-Math.PI, Math.PI);
  const bend0 = rng.sign() * rng.uniform(45, 135) * DEG;
  const a2 = a1 + bend0;
  const baseTurn = BASE_TURNS[rng.int(0, BASE_TURNS.length - 1)] * rng.sign();
  const elbowTurn = ELBOW_TURNS[rng.int(0, ELBOW_TURNS.length - 1)] * rng.sign();
  const bend1 = bend0 + elbowTurn * DEG;
  if (Math.sign(bend1) !== Math.sign(bend0) || Math.abs(bend1) < 25 * DEG || Math.abs(bend1) > 155 * DEG) return null;
  const view = { az, el, dist: CAM_DIST, tile: TILE, tileOff: { u: rng.uniform(0, TILE), v: rng.uniform(0, TILE) } };
  view.fit = tableFit(view, REACH_FIT, FIT_AREA);
  const V = makeTableView(view);
  const pivotW = { x: 0, y: 0 };
  const scene = { view, pivotW, L1, L2, a1, a2, bendSign: Math.sign(bend0), baseTurn, elbowTurn };
  const s0 = poseOf(scene, 0, 0);
  scene.elbow0W = s0.elbow; scene.startW = s0.tip;
  scene.pivot = V.P(0, 0); scene.elbow0 = V.P(s0.elbow.x, s0.elbow.y); scene.start = V.P(s0.tip.x, s0.tip.y);
  const ok = (q, s) => s.x >= 16 && s.x <= 340 - 16 && s.y >= 16 && s.y <= 360 - 16
    && dist(q, scene.startW) >= 30 && sdist(s, scene.start) >= 30 && dist(q, pivotW) >= 28 && dist(q, scene.elbow0W) >= 24
    && segDist(q, pivotW, scene.elbow0W) >= 22 && segDist(q, scene.elbow0W, scene.startW) >= 22;
  const ansW = target(scene), ansS = V.P(ansW.x, ansW.y);
  if (!ok(ansW, ansS)) return null;
  const picked = [{ w: ansW, s: ansS, pose: answerPose(scene) }];
  for (const [k1, k2] of socketPoses(rng, baseTurn, elbowTurn)) {
    if (picked.length >= N_SOCKETS) break;
    const t = poseOf(scene, k1, k2).tip, s = V.P(t.x, t.y);
    if (ok(t, s) && picked.every((c) => dist(c.w, t) >= SOCKET_GAP && sdist(c.s, s) >= SOCK_GAP_S)) {
      picked.push({ w: t, s, pose: [((k1 % 360) + 540) % 360 - 180, ((k2 % 360) + 540) % 360 - 180] });
    }
  }
  if (picked.length < N_SOCKETS) return null;
  const crowd = (c) => picked.filter((o) => o !== c && dist(o.w, c.w) < 50).length;
  if (picked.slice(1).every((c) => crowd(c) < crowd(picked[0]))) return null;
  scene.candidates = rng.shuffle(picked).map((c, id) => ({ x: c.s.x, y: c.s.y, wx: c.w.x, wy: c.w.y, hitRadius: SOCKET_HIT, pose: c.pose, id }));
  scene.source = { ...scene.start, r: 14, label: '' };
  const answer = solvePersp(scene), sc = shortcutEnds(scene, V);
  if (!trapHolds(scene, answer, sc.flat) || !trapHolds(scene, answer, sc.keepLen)) return null;
  return scene;
}

function solvePersp(scene) {
  const t = target(scene);
  return scene.candidates.reduce((best, c) => (dist(wOf(c), t) < dist(wOf(best), t) ? c : best), scene.candidates[0]).id;
}

function validatePersp(scene, answer) {
  const v = scene.view;
  if (!v || !Number.isFinite(v.az) || !(v.el >= PITCH[0] - EPS && v.el <= PITCH[1] + EPS) || v.dist !== CAM_DIST || v.tile !== TILE) return false;
  const fit = tableFit(v, REACH_FIT, FIT_AREA);
  if (!v.fit || ['k', 'ox', 'oy'].some((k) => Math.abs(fit[k] - v.fit[k]) > 1e-6)) return false;
  if (!BASE_TURNS.includes(Math.abs(scene.baseTurn)) || !ELBOW_TURNS.includes(Math.abs(scene.elbowTurn))) return false;
  if (scene.L1 !== L1 || scene.L2 !== L2 || ![-1, 1].includes(scene.bendSign) || scene.pivotW?.x !== 0 || scene.pivotW?.y !== 0) return false;
  const bend0 = wrapPi(scene.a2 - scene.a1), bend1 = bend0 + scene.elbowTurn * DEG;
  if (Math.sign(bend0) !== scene.bendSign || Math.sign(bend1) !== scene.bendSign || Math.abs(bend1) < 25 * DEG - EPS || Math.abs(bend1) > 155 * DEG + EPS) return false;
  const V = makeTableView(v), s0 = poseOf(scene, 0, 0);
  const same = (a, b) => sdist(a, b) < 1e-6;
  if (!same(scene.pivot, V.P(0, 0)) || !same(scene.elbow0, V.P(s0.elbow.x, s0.elbow.y)) || !same(scene.start, V.P(s0.tip.x, s0.tip.y))) return false;
  if (!same(scene.elbow0W, s0.elbow) || !same(scene.startW, s0.tip)) return false;
  const cs = scene.candidates;
  if (cs.length !== N_SOCKETS || !(answer >= 0)) return false;
  if (!cs.every((c) => c.pose.every((k) => k % 30 === 0) && same(poseOf(scene, c.pose[0], c.pose[1]).tip, wOf(c)) && same(c, V.P(c.wx, c.wy)))) return false;
  if (cs.some((c) => dist(wOf(c), scene.startW) < 30 || sdist(c, scene.start) < 30)) return false;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    if (dist(wOf(cs[i]), wOf(cs[j])) < SOCKET_GAP - EPS || sdist(cs[i], cs[j]) < SOCK_GAP_S - EPS) return false;
  }
  const t = target(scene), errors = cs.map((c) => dist(wOf(c), t)).sort((a, b) => a - b);
  if (!(errors[0] < EPS && errors[1] >= SOCKET_GAP - EPS) || dist(wOf(cs[answer]), t) > EPS) return false;
  if (dist(ikElbow(scene, wOf(cs[answer])).elbow, poseOf(scene, ...answerPose(scene)).elbow) > 1e-3) return false;
  const sc = shortcutEnds(scene, V);
  return trapHolds(scene, answer, sc.flat) && trapHolds(scene, answer, sc.keepLen);
}

function constrainPersp(scene, point) {
  const V = makeTableView(scene.view), q = V.unproject(point.x, point.y);
  if (!q) return { ...scene.start };
  const tip = ikElbow(scene, q).tip;
  return V.P(tip.x, tip.y);
}

function drawPersp(g, scene, { state, board }) {
  const V = makeTableView(scene.view);
  drawTableFloor(g, V, scene.view, board);
  const chosen = state.picks[0] == null ? null : scene.candidates[state.picks[0]];
  const moved = !!(chosen || state.grabbed);
  const cur = state.grabbed && state.cursor ? state.cursor : chosen;
  const curW = moved && cur ? V.unproject(cur.x, cur.y) : null;
  const pose = curW ? ikElbow(scene, curW) : { elbow: scene.elbow0W, tip: scene.startW };
  for (const c of scene.candidates) {
    const ring = tableDisc(V, c.wx, c.wy, SOCK_R);
    fillStroke(g, ring, 'rgba(255,255,255,.9)', null);
    g.setLineDash([4, 3]); fillStroke(g, ring, null, '#526f85', 1.8); g.setLineDash([]);
    g.fillStyle = '#405b70'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label(c.id), c.x, c.y + 0.4);
  }
  const P0 = scene.pivotW;
  if (moved) {
    fillStroke(g, tableBar(V, P0, scene.elbow0W, 12), 'rgba(82,111,133,.22)', null);
    fillStroke(g, tableBar(V, scene.elbow0W, scene.startW, 9.5), 'rgba(82,111,133,.22)', null);
    fillStroke(g, tableDisc(V, scene.elbow0W.x, scene.elbow0W.y, 7), 'rgba(70,93,112,.22)', null);
  }
  fillStroke(g, tableBar(V, P0, pose.elbow, 12), '#526f85', '#3c5466', 1);
  fillStroke(g, tableBar(V, pose.elbow, pose.tip, 9.5), '#6a8aa1', '#4b677b', 1);
  fillStroke(g, tableDisc(V, pose.elbow.x, pose.elbow.y, 7.5), '#3f5568', null);
  fillStroke(g, tableDisc(V, pose.elbow.x, pose.elbow.y, 2.8), '#d6e1e8', null);
  fillStroke(g, tableDisc(V, 0, 0, 14), '#34475a', null);
  fillStroke(g, tableDisc(V, 0, 0, 10), '#566e82', null);
  fillStroke(g, tableDisc(V, 0, 0, 4), '#d6e1e8', null);
}

const promptFor = (scene) => `Turn the whole arm ${Math.abs(scene.baseTurn)}° ${dirWord(scene.baseTurn)} at the base, then the outer link ${Math.abs(scene.elbowTurn)}° ${dirWord(scene.elbowTurn)} at the elbow`;

const spec = {
  ...hingeEndpointTransferSpec,
  estimatedGuessRate: 1 / N_SOCKETS,
  operationBudget: 6,
  generationAttempts: 2000,
  promptHuman: 'Turn the two-link arm as the prompt says (first the whole arm at the base, then the outer link at the elbow); drag its blue end into the socket where it lands.',
  promptMain: 'Turn the whole arm at the base, then the outer link at the elbow',
  promptSub: 'drag the blue end into the socket where it lands',
  promptHumanForScene: promptFor,
  promptSubForScene: () => 'Drag the blue end to where it lands',
  headerH: 74,
  gtContract: 'turn the rendered two-link arm about its base by the first stated angle (outer link carried along), then the outer link about the elbow by the second; the socket at the end wins',
  toleranceDesign: '16 sockets on the 30-deg lattice of both joints, >= 32 px apart; 16 px drop targets with snapping',
  buildScene(rng) {
    return buildPerspScene(rng);
  },
  constrainDrag(scene, point) {
    if (scene.view) return constrainPersp(scene, point);
    return ikElbow(scene, point).tip;
  },
  solve(scene) {
    if (scene.view) return solvePersp(scene);
    const t = target(scene);
    return scene.candidates.reduce((best, c) => (dist(c, t) < dist(best, t) ? c : best), scene.candidates[0]).id;
  },
  validateScene(scene, answer) {
    if (!BASE_TURNS.includes(Math.abs(scene.baseTurn)) || !ELBOW_TURNS.includes(Math.abs(scene.elbowTurn))) return false;
    if (scene.L1 !== L1 || scene.L2 !== L2 || ![-1, 1].includes(scene.bendSign)) return false;
    const bend0 = wrapPi(scene.a2 - scene.a1), bend1 = bend0 + scene.elbowTurn * DEG;
    if (Math.sign(bend0) !== scene.bendSign || Math.sign(bend1) !== scene.bendSign || Math.abs(bend1) < 25 * DEG - EPS || Math.abs(bend1) > 155 * DEG + EPS) return false;
    const t = target(scene), errors = scene.candidates.map((c) => dist(c, t)).sort((a, b) => a - b);
    if (scene.candidates.some((c) => dist(c, scene.start) < 30)) return false;
    if (!scene.candidates.every((c) => { const q = poseOf(scene, c.pose[0], c.pose[1]).tip; return dist(q, c) < 1e-6 && c.pose.every((k) => k % 30 === 0); })) return false;
    const ik = ikElbow(scene, scene.candidates[answer]), want = poseOf(scene, ...answerPose(scene)).elbow;
    if (dist(ik.elbow, want) > 1e-3) return false;
    return answer >= 0 && scene.candidates.length === N_SOCKETS && pairwiseSeparated(scene.candidates, SOCKET_GAP) && errors[0] < EPS && errors[1] >= SOCKET_GAP - EPS;
  },
  drawScene(g, scene, { state }) {
    const p = scene.pivot;
    const chosen = state.picks[0] == null ? null : scene.candidates[state.picks[0]];
    const moved = !!(chosen || state.grabbed);
    const pose = moved ? ikElbow(scene, state.grabbed && state.cursor ? state.cursor : chosen) : { elbow: scene.elbow0, tip: scene.start };
    for (const c of scene.candidates) {
      g.beginPath(); g.arc(c.x, c.y, 13, 0, TAU); g.fillStyle = 'rgba(255,255,255,.92)'; g.fill();
      g.setLineDash([4, 3]); g.strokeStyle = '#526f85'; g.lineWidth = 1.8; g.stroke(); g.setLineDash([]);
      g.fillStyle = '#405b70'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label(c.id), c.x, c.y + .4);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (moved) {
      g.strokeStyle = 'rgba(82,111,133,.22)'; g.lineWidth = 9;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(scene.elbow0.x, scene.elbow0.y); g.lineTo(scene.start.x, scene.start.y); g.stroke();
      g.beginPath(); g.arc(scene.elbow0.x, scene.elbow0.y, 7, 0, TAU); g.fillStyle = 'rgba(70,93,112,.22)'; g.fill();
    }
    g.strokeStyle = '#526f85'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(pose.elbow.x, pose.elbow.y); g.stroke();
    g.strokeStyle = '#6a8aa1'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(pose.elbow.x, pose.elbow.y); g.lineTo(pose.tip.x, pose.tip.y); g.stroke();
    g.beginPath(); g.arc(pose.elbow.x, pose.elbow.y, 7.5, 0, TAU); g.fillStyle = '#3f5568'; g.fill();
    g.beginPath(); g.arc(pose.elbow.x, pose.elbow.y, 2.8, 0, TAU); g.fillStyle = '#d6e1e8'; g.fill();
    g.fillStyle = '#34475a'; g.fillRect(p.x - 13, p.y - 13, 26, 26);
    g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.fillStyle = '#566e82'; g.fill();
    g.beginPath(); g.arc(p.x, p.y, 4, 0, TAU); g.fillStyle = '#d6e1e8'; g.fill();
    g.fillStyle = '#a9b8c4';
    for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { g.beginPath(); g.arc(p.x + dx, p.y + dy, 1.6, 0, TAU); g.fill(); }
    g.lineCap = 'butt'; g.lineJoin = 'miter';
  },
};

function buildSceneExt(rng) {
  return buildArmScene(rng, { x: 170 + rng.int(-12, 12), y: 180 + rng.int(-12, 12) });
}
function validateAny(scene, answer) {
  if (scene && scene.view) return validatePersp(scene, answer);
  return spec.validateScene(scene, answer);
}

export function semanticKey(m) {
  const s = m.rounds[0], q = (v) => Math.round(v / 42), h = (a) => ((Math.round(a / DEG / 15) * 15) % 360 + 360) % 360;
  const cam = s.view ? `|v${Math.round(s.view.az / 30) % 12},${Math.round(s.view.el / 5)}` : '';
  return `hinge2|t${s.baseTurn},${s.elbowTurn}|a${h(s.a1)},${h(s.a2)}|p${q(s.pivot.x)},${q(s.pivot.y)}|n${s.candidates.length}${cam}`;
}

const ARMS = ['plank', 'steel', 'boom', 'lattice', 'pipe', 'log', 'oar'];
const PIVOTS = ['bolt', 'pedestal', 'hub', 'clevis', 'flange'];
async function mount(env) {
  const st = env.style;
  if (!st) return;
  const grounds = texItems(st, ['floor', 'terrain', 'wood', 'stone']);
  const arms = kindsFor('g12_arm', ARMS, st.split);
  const [gi, ai] = st.primaryCombo('g12_hinge', [grounds.length, arms.length]);
  const arm = arms[ai]; st.note(`g12_arm:${arm}`);
  const pivot = pickKind(st, 'g12_pivot', PIVOTS);
  const pick = (L) => L[Math.floor(st.rand() * L.length)];
  const armUse = { plank: ['wood'], log: ['wood'], oar: ['wood'], steel: ['metal'], pipe: ['metal'], lattice: ['metal'], boom: ['metal'] }[arm];
  const gItem = grounds[gi];
  const [ground, body, pivMat] = await Promise.all([
    makeMat(st, gItem, { scale: [0.3, 0.6] }), makeMat(st, pick(texItems(st, armUse)), { scale: [0.12, 0.2], rotate: false }),
    makeMat(st, pick(texItems(st, pivot === 'pedestal' ? ['stone'] : ['metal'])), { scale: [0.1, 0.18] }),
  ]);
  const gl = 0.2126 * gItem.mean_lin[0] + 0.7152 * gItem.mean_lin[1] + 0.0722 * gItem.mean_lin[2];
  env.assets.g12 = { arm, pivot, ground, body, pivMat, light: gl > 0.16, width: 12 + st.rand() * 4, dim: st.rand() * 0.12 };
}

function drawLink(g, L, a, b, w) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y), k = L.arm;
  g.save(); g.translate(a.x, a.y); g.rotate(ang);
  const body = () => {
    g.beginPath();
    if (k === 'oar') { g.moveTo(-6, -w * 0.28); g.lineTo(len * 0.62, -w * 0.28); g.quadraticCurveTo(len * 0.75, -w * 0.62, len + 4, -w * 0.55); g.lineTo(len + 4, w * 0.55); g.quadraticCurveTo(len * 0.75, w * 0.62, len * 0.62, w * 0.28); g.lineTo(-6, w * 0.28); g.closePath(); }
    else if (k === 'pipe' || k === 'boom' || k === 'log') { const r = k === 'log' ? w * 0.6 : w * 0.42; g.moveTo(-6, -r); g.lineTo(len, -r); g.arc(len, 0, r, -Math.PI / 2, Math.PI / 2); g.lineTo(-6, r); g.arc(-6, 0, r, Math.PI / 2, -Math.PI / 2); g.closePath(); }
    else { const h = k === 'lattice' ? w * 0.6 : w / 2; g.rect(-8, -h, len + 12, 2 * h); }
  };
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5; g.shadowOffsetX = 3; g.shadowOffsetY = 4; body(); g.fillStyle = '#000'; g.fill(); g.restore();
  if (k === 'lattice') {
    const h = w * 0.6;
    g.fillStyle = 'rgba(20,20,20,.25)'; body(); g.fill();
    g.strokeStyle = localPattern(g, L.body, 0, 0, 0); g.lineWidth = 3;
    g.beginPath(); g.moveTo(-8, -h + 1.5); g.lineTo(len + 4, -h + 1.5); g.moveTo(-8, h - 1.5); g.lineTo(len + 4, h - 1.5); g.stroke();
    g.lineWidth = 1.8; g.beginPath();
    for (let x = -8, i = 0; x < len; x += 2 * h, i++) { g.moveTo(x, i % 2 ? -h : h); g.lineTo(x + 2 * h, i % 2 ? h : -h); }
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8; body(); g.stroke();
  } else {
    body(); g.fillStyle = localPattern(g, L.body, 0, 0, 0); g.fill();
    if (k === 'boom') {
      g.save(); body(); g.clip();
      for (let x = 14; x < len - 18; x += 24) { g.fillStyle = 'rgba(200,40,35,.82)'; g.fillRect(x, -w, 12, 2 * w); }
      g.restore();
    }
    const sh = g.createLinearGradient(0, -w * 0.6, 0, w * 0.6);
    sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.38)');
    body(); g.fillStyle = sh; g.fill();
    if (k === 'steel') { g.fillStyle = 'rgba(15,15,15,.7)'; for (let x = 22; x < len - 14; x += 22) { g.beginPath(); g.arc(x, 0, 1.8, 0, TAU); g.fill(); } }
    if (k === 'log') { g.strokeStyle = 'rgba(40,25,12,.45)'; g.lineWidth = 1; for (let x = 10; x < len; x += 17) { g.beginPath(); g.moveTo(x, -w * 0.5); g.lineTo(x + 6, -w * 0.15); g.stroke(); } }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; body(); g.stroke();
  }
  g.restore();
}

function drawPivot(g, L, p, R) {
  const plate = () => {
    g.beginPath();
    if (L.pivot === 'pedestal') { for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + Math.PI / 8; i ? g.lineTo(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R) : g.moveTo(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); } g.closePath(); }
    else if (L.pivot === 'clevis') g.rect(p.x - R - 2, p.y - R - 2, 2 * R + 4, 2 * R + 4);
    else g.arc(p.x, p.y, R, 0, TAU);
  };
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
  plate(); g.fillStyle = '#000'; g.fill(); g.restore();
  g.save(); plate(); fillMat(g, L.pivMat); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.2; g.stroke(); g.restore();
  domeShade(g, p.x, p.y, R, 0.7);
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6, r = Math.min(5.5, R * 0.55); i ? g.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r) : g.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } g.closePath();
  g.fillStyle = '#9aa3aa'; g.fill(); g.strokeStyle = '#3d4449'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.arc(p.x, p.y, 2, 0, TAU); g.fillStyle = '#4b545a'; g.fill();
}

function drawStyled(g, scene, L, board, state) {
  g.beginPath(); g.rect(0, 0, board.w, board.h); fillMat(g, L.ground);
  if (L.dim > 0) { g.fillStyle = `rgba(0,0,0,${L.dim})`; g.fillRect(0, 0, board.w, board.h); }
  const p = scene.pivot;
  const chosen = state.picks[0] == null ? null : scene.candidates[state.picks[0]];
  const moved = !!(chosen || state.grabbed);
  const pose = moved ? ikElbow(scene, state.grabbed && state.cursor ? state.cursor : chosen) : { elbow: scene.elbow0, tip: scene.start };
  for (const c of scene.candidates) {
    g.beginPath(); g.arc(c.x, c.y, 14, 0, TAU); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
    letterBadge(g, c.x, c.y, label(c.id), { r: 12.5, size: 11, dash: [4, 3], ring: '#2d4356', ink: '#2d4356', alpha: 0.9 });
  }
  if (moved) {
    g.save(); g.globalAlpha = 0.28; drawLink(g, L, p, scene.elbow0, L.width); drawLink(g, L, scene.elbow0, scene.start, L.width * 0.8); g.restore();
  }
  drawLink(g, L, p, pose.elbow, L.width);
  drawLink(g, L, pose.elbow, pose.tip, L.width * 0.8);
  drawPivot(g, L, pose.elbow, 8);
  drawPivot(g, L, p, L.pivot === 'pedestal' ? 15 : 13);
}

function drawSceneAny(g, scene, ctx) {
  const look = ctx && ctx.env && ctx.env.style ? ctx.env.assets.g12 : null;
  if (look) return drawStyled(g, scene, look, ctx.board, ctx.state);
  if (scene.view) return drawPersp(g, scene, ctx);
  return spec.drawScene(g, scene, ctx);
}

const built = makeCompositeTask({ ...spec, buildSceneExt, validateScene: validateAny, drawScene: drawSceneAny, mount, extGenerationAttempts: 300 });
export const gate = built.gate;
export const _audit = { poseOf, target, answerPose };
export default {
  ...built.task,
  footerStatus(env) {
    return env.state.picks.length ? 'Socket chosen' : 'Drag the blue end onto a socket';
  },
};
