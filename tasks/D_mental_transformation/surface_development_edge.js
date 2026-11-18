import { drawPromptText, ACCENT } from '../core/panel.js';
import { yawMat, matMul, matVec, dot3, treeKey } from '../common/_surface_development_edge_solids.js';
import { XSOLIDS, solidInfo, unfoldS, allNetTrees } from '../common/_solid_nets.js';
import { HSOLIDS, hInfo } from '../common/_surface_development_edge_hsolids.js';
import { primaryOf, kindTexPairs, detail, tinted, natural, pat, isoTex, ANISO, GRIDDY, pickSplit } from '../common/_block_mat.js';
import { nthOf, hash32 } from '../core/style.js';

const PANEL_W = 640;
const BOARD = { w: PANEL_W - 20, h: 400 };
const ROUNDS = 1;
const H_SPLIT = 222;
const H_SOLID_BOX = { x: 14, y: 46, w: 194, h: 300 };
const H_NET_AREA = { x: 238, y: 12, w: 370, h: 376 };
const H_UNIT = { solid: 96, netMax: 62, netMin: 50 };
const H_ELEV = [26, 38];
const H_SOLIDS = ['j8', 'j3'];
const HIT_FRAC = 0.19;
const VIS_MIN = 0.12;
const MARK_VIS = 0.3;
const RED_FACE_VIS = 0.25;
const RED_MIN_LEN = 0.5;
const EXT_PANEL_W = 400;
const EXT_BOARD = { w: EXT_PANEL_W - 20, h: 410 };
const ELEV = 32;
const SOLID_BOX = { x: 96, y: 12, w: 184, h: 172 };
const NET_AREA = { x: 12, y: 204, w: 356, h: 200 };
const UNIT_MAX = { solid: 112, net: 74 }, UNIT_MIN_NET = 50;

function segDist(p, sg) {
  const vx = sg.b.x - sg.a.x, vy = sg.b.y - sg.a.y, L2 = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(1, ((p.x - sg.a.x) * vx + (p.y - sg.a.y) * vy) / L2));
  return { d: Math.hypot(p.x - sg.a.x - vx * t, p.y - sg.a.y - vy * t), t };
}
function hitSeg(nl, p) {
  const tol = HIT_FRAC * nl.unitPx;
  let best = -1, bd = Infinity;
  nl.segs.forEach((sg, i) => { const { d, t } = segDist(p, sg); if (t > 0.1 && t < 0.9 && d <= tol && d < bd) { bd = d; best = i; } });
  return best;
}
const mid = (sg) => ({ x: (sg.a.x + sg.b.x) / 2, y: (sg.a.y + sg.b.y) / 2 });
function restMat(n) {
  const d = [0, -1, 0], c = dot3(n, d);
  if (c > 1 - 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (c < -1 + 1e-9) return [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  const a = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]], s0 = Math.hypot(...a), k = a.map((v) => v / s0);
  const t = 1 - c, [x, y, z] = k;
  return [[c + x * x * t, x * y * t - z * s0, x * z * t + y * s0], [y * x * t + z * s0, c + y * y * t, y * z * t - x * s0], [z * x * t - y * s0, z * y * t + x * s0, c + z * z * t]];
}
const camAt = (elevDeg) => { const e = elevDeg * Math.PI / 180; return { v: [0, Math.sin(e), Math.cos(e)], right: [1, 0, 0], up: [0, Math.cos(e), -Math.sin(e)] }; };
function layNet(S, U, fa, netTurn, A, unitMax, shift = [0, 0]) {
  const a = U.polys[fa][0], b = U.polys[fa][1];
  const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]) + netTurn * Math.PI / 2;
  const c = Math.cos(ang), s0 = Math.sin(ang), rot = (p) => [p[0] * c - p[1] * s0, p[0] * s0 + p[1] * c];
  const all = U.polys.flat().map(rot), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const unitPx = Math.min(unitMax, A.w / w, A.h / h);
  const cx = A.x + A.w / 2 + shift[0] * (A.w - unitPx * w) / 2, cy = A.y + A.h / 2 + shift[1] * (A.h - unitPx * h) / 2;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
  const px = (p) => { const q = rot(p); return { x: cx + unitPx * (q[0] - mx), y: cy - unitPx * (q[1] - my) }; };
  return { unitPx, polys: U.polys.map((P) => P.map(px)), segs: U.segs.map((sg) => ({ a: px(sg.a), b: px(sg.b), edge: sg.edge, fold: sg.fold, face: sg.face })), area: A };
}
function netFits(lay, minUnit) {
  const A = lay.area;
  if (lay.unitPx < minUnit) return false;
  const inside = (p) => p.x >= A.x - 0.5 && p.x <= A.x + A.w + 0.5 && p.y >= A.y - 0.5 && p.y <= A.y + A.h + 0.5;
  if (!lay.polys.flat().every(inside)) return false;
  return lay.segs.every((sg, i) => lay.segs.every((o, j) => i === j || segDist(mid(sg), o).d >= 2 * HIT_FRAC * lay.unitPx));
}
function laySolid(S, M, C, B, unitMax) {
  const world = S.V.map((v) => matVec(M, [v[0] - S.center[0], v[1] - S.center[1], v[2] - S.center[2]]));
  const flat = (p) => [dot3(p, C.right), -dot3(p, C.up)];
  const pts = world.map(flat), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const sc = Math.min(unitMax, B.w / w, B.h / h);
  const ox = B.x + B.w / 2 - sc * (Math.max(...xs) + Math.min(...xs)) / 2;
  const oy = B.y + B.h / 2 - sc * (Math.max(...ys) + Math.min(...ys)) / 2;
  const proj = (p) => { const q = flat(p); return { x: ox + sc * q[0], y: oy + sc * q[1] }; };
  return { P: world.map(proj), s: sc, world, proj, M, box: B };
}
const inBox = (lay) => lay.P.every((p) => p.x >= lay.box.x - 0.5 && p.x <= lay.box.x + lay.box.w + 0.5 && p.y >= lay.box.y - 0.5 && p.y <= lay.box.y + lay.box.h + 0.5);

const isHard = (rd) => !!(rd && rd.hard === 1);
const isExt = (rd) => !!(rd && rd.pose && rd.pose.rest !== undefined && !isHard(rd));
function hPose(rd) { return matMul(yawMat(rd.pose.yaw), restMat(HSOLIDS[rd.solid].normals[rd.pose.rest])); }
function hFaceVis(rd) { const S = HSOLIDS[rd.solid], M = hPose(rd), C = camAt(rd.elev); return S.normals.map((n) => dot3(matVec(M, n), C.v)); }
function hSolidLayout(rd) { return laySolid(HSOLIDS[rd.solid], hPose(rd), camAt(rd.elev), H_SOLID_BOX, H_UNIT.solid); }
function hNetLayout(rd) {
  const S = HSOLIDS[rd.solid];
  return layNet(S, unfoldS(S, rd.tree), S.faceKind.indexOf('sq'), rd.netTurn, H_NET_AREA, H_UNIT.netMax);
}
function standsOn(S, f) {
  const n = S.normals[f], P = S.faces[f].map((v) => S.V[v]), c = S.center;
  const d = dot3(n, P[0]) - dot3(n, c), q = [c[0] + n[0] * d, c[1] + n[1] * d, c[2] + n[2] * d];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const cr = [ab[1] * aq[2] - ab[2] * aq[1], ab[2] * aq[0] - ab[0] * aq[2], ab[0] * aq[1] - ab[1] * aq[0]];
    if (dot3(cr, n) < 0.05) return false;
  }
  return true;
}
const isIdentity = (g) => g.facePerm.every((x, i) => x === i);
function marksAsym(solid, marks) {
  const set = new Set(marks);
  return !hInfo(solid).group.some((g) => !isIdentity(g) && marks.every((f) => set.has(g.facePerm[f])));
}
const H_CACHE = {};
function hStatic(solid) {
  if (!H_CACHE[solid]) {
    const I = hInfo(solid), S = I.S, nF = S.faces.length, pairs = [];
    for (let a = 0; a < nF; a++) for (let b = a + 1; b < nF; b++) if (marksAsym(solid, [a, b])) pairs.push([a, b]);
    H_CACHE[solid] = { rests: S.faces.map((_, f) => f).filter((f) => standsOn(S, f)), pairs, treeKeys: new Set(I.trees.map(treeKey)) };
  }
  return H_CACHE[solid];
}
const hViewOk = (vis) => vis.every((v) => Math.abs(v) >= VIS_MIN) && vis.filter((v) => v > 0).length >= 3;
function hRedOk(rd, vis, sl) {
  const S = HSOLIDS[rd.solid], e = S.edges[rd.red];
  if (e.faces.some((f) => rd.marks.includes(f))) return false;
  if (Math.max(vis[e.faces[0]], vis[e.faces[1]]) < RED_FACE_VIS) return false;
  const a = sl.P[e.v[0]], b = sl.P[e.v[1]];
  return Math.hypot(b.x - a.x, b.y - a.y) >= RED_MIN_LEN * sl.s;
}
const answerOf = (nl, red) => nl.segs.map((sg, i) => (sg.edge === red ? i : -1)).filter((i) => i >= 0);

function hRoundOk(rd) {
  if (!isHard(rd) || !H_SOLIDS.includes(rd.solid) || !rd.pose || !Array.isArray(rd.tree) || !Array.isArray(rd.marks) || !Array.isArray(rd.answer)) return false;
  const S = HSOLIDS[rd.solid], st = hStatic(rd.solid);
  if (!st.rests.includes(rd.pose.rest) || !Number.isFinite(rd.pose.yaw)) return false;
  if (!Number.isFinite(rd.elev) || rd.elev < H_ELEV[0] || rd.elev > H_ELEV[1]) return false;
  if (!st.treeKeys.has(treeKey(rd.tree)) || rd.tree.length !== S.faces.length - 1 || ![0, 1, 2, 3].includes(rd.netTurn)) return false;
  if (!Number.isInteger(rd.red) || rd.red < 0 || rd.red >= S.edges.length) return false;
  if (rd.marks.length !== 2 || !rd.marks.every((f) => Number.isInteger(f) && f >= 0 && f < S.faces.length) || rd.marks[0] === rd.marks[1]) return false;
  if (!marksAsym(rd.solid, rd.marks)) return false;
  const vis = hFaceVis(rd);
  if (!hViewOk(vis) || !rd.marks.every((f) => vis[f] >= MARK_VIS)) return false;
  const sl = hSolidLayout(rd);
  if (!inBox(sl) || !hRedOk(rd, vis, sl)) return false;
  const nl = hNetLayout(rd);
  if (!netFits(nl, H_UNIT.netMin)) return false;
  const want = answerOf(nl, rd.red), ans = rd.answer.slice().sort((a, b) => a - b);
  return want.length >= 1 && want.length <= 2 && ans.length === want.length && ans.every((x, k) => x === want[k]);
}
function contractOk(m) {
  if (m && m.ext) return xContractOk(m);
  if (!m || m.task !== 'surface_development_edge' || !m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== ROUNDS) return false;
  return m.rounds.every(hRoundOk);
}

function buildHard(rng) {
  const solid = rng.raw() < 0.5 ? 'j8' : 'j3';
  const S = HSOLIDS[solid], I = hInfo(solid), st = hStatic(solid);
  for (let att = 0; att < 1000; att++) {
    const rd = { hard: 1, solid, pose: { rest: rng.pick(st.rests), yaw: Math.round(rng.uniform(0, 360) * 10) / 10 },
      elev: Math.round(rng.uniform(H_ELEV[0], H_ELEV[1]) * 2) / 2, tree: null, netTurn: 0, marks: [], red: -1, answer: [] };
    const vis = hFaceVis(rd);
    if (!hViewOk(vis)) continue;
    const sl = hSolidLayout(rd);
    if (!inBox(sl)) continue;
    const pairs = st.pairs.filter(([a, b]) => vis[a] >= MARK_VIS && vis[b] >= MARK_VIS);
    if (!pairs.length) continue;
    const pr = rng.pick(pairs);
    rd.marks = rng.raw() < 0.5 ? pr.slice() : [pr[1], pr[0]];
    const reds = S.edges.map((_, i) => i).filter((i) => { rd.red = i; return hRedOk(rd, vis, sl); });
    if (!reds.length) continue;
    rd.red = rng.pick(reds);
    for (let k = 0; k < 30; k++) {
      rd.tree = rng.pick(I.trees).slice();
      rd.netTurn = rng.int(0, 3);
      const nl = hNetLayout(rd);
      if (!netFits(nl, H_UNIT.netMin)) continue;
      rd.answer = answerOf(nl, rd.red);
      if (hRoundOk(rd)) return rd;
    }
  }
  throw new Error(`surface_development_edge: sampler exhausted (${solid})`);
}

const LIGHT = (() => { const l = [-0.45, 0.85, 0.55], n = Math.hypot(...l); return l.map((x) => x / n); })();
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = (v) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
const PLAIN = '#e8eef6', TINT = '#f6c453';

const EXT_SOLIDS = { train: ['prism', 'pyramid', 'bipyr'], test: ['prism', 'pyramid', 'bipyr'] };
const probSplit = (pk) => (hash32(`surface_problem|${pk}`) % 10 === 0 ? 'test' : 'train');
const extTrees = (solid) => (solid === 'prism' ? allNetTrees('prism') : solidInfo(solid).trees);
function xPose(rd) { const S = XSOLIDS[rd.solid]; return matMul(yawMat(rd.pose.yaw), restMat(S.normals[rd.pose.rest])); }
const camOf = (rd) => camAt(rd.view.elev);
function xBoxes(rd) {
  const L = rd.view;
  const solid = { x: SOLID_BOX.x + L.solidDx, y: L.netTop ? 222 : SOLID_BOX.y, w: SOLID_BOX.w, h: SOLID_BOX.h };
  const net = L.netTop ? { x: NET_AREA.x, y: 8, w: NET_AREA.w, h: NET_AREA.h } : NET_AREA;
  return { solid, net, split: L.netTop ? 214 : 196 };
}
function xFaceVis(rd) { const S = XSOLIDS[rd.solid], M = xPose(rd), C = camOf(rd); return S.normals.map((n) => dot3(matVec(M, n), C.v)); }
function xSolidLayout(rd) { return laySolid(XSOLIDS[rd.solid], xPose(rd), camOf(rd), xBoxes(rd).solid, UNIT_MAX.solid); }
function xNetLayout(rd) {
  const S = XSOLIDS[rd.solid], U = unfoldS(S, rd.tree);
  let fa = S.faceKind.findIndex((k) => k === 'sq' || k === 'side' || k === 'base');
  if (fa < 0) fa = 0;
  return layNet(S, U, fa, rd.netTurn, xBoxes(rd).net, UNIT_MAX.net, rd.view.netShift);
}
const xNetOk = (lay) => netFits(lay, UNIT_MIN_NET);
const xSolidOk = (lay) => inBox(lay);
function xAnswerUnique(rd) {
  const marked = new Set(rd.marks);
  for (const g of solidInfo(rd.solid).group) {
    let consistent = true;
    g.facePerm.forEach((gf, f) => { if (marked.has(gf) !== marked.has(f)) consistent = false; });
    if (consistent && g.edgePerm[rd.red] !== rd.red) return false;
  }
  return true;
}
function xRedOk(rd, vis, lay) {
  const S = XSOLIDS[rd.solid], e = S.edges[rd.red];
  if (Math.max(vis[e.faces[0]], vis[e.faces[1]]) < RED_FACE_VIS) return false;
  const a = lay.P[e.v[0]], b = lay.P[e.v[1]];
  return Math.hypot(b.x - a.x, b.y - a.y) >= RED_MIN_LEN * lay.s;
}
const xViewOk = (vis) => vis.every((v) => Math.abs(v) >= VIS_MIN) && vis.filter((v) => v > 0).length >= 3;
const xMarksOk = (rd, vis) => rd.marks.length === 2 && new Set(rd.marks).size === 2 && rd.marks.every((f) => vis[f] >= MARK_VIS);
function xRoundOk(rd, split) {
  if (!rd || !isExt(rd) || !XSOLIDS[rd.solid] || !Array.isArray(rd.tree) || !Array.isArray(rd.marks) || !Array.isArray(rd.answer)) return false;
  if (split && !EXT_SOLIDS[split].includes(rd.solid)) return false;
  const S = XSOLIDS[rd.solid];
  if (!Number.isInteger(rd.pose.rest) || rd.pose.rest < 0 || rd.pose.rest >= S.faces.length || !Number.isFinite(rd.pose.yaw)) return false;
  const V = rd.view;
  if (!V || V.elev !== ELEV || !(Math.abs(V.solidDx) <= 70) || !Array.isArray(V.netShift) || !V.netShift.every((v) => Math.abs(v) <= 1)) return false;
  if (!extTrees(rd.solid).some((t) => treeKey(t) === treeKey(rd.tree)) || ![0, 1, 2, 3].includes(rd.netTurn)) return false;
  if (EVAL_PROB_KEYS.has(probKey(rd.solid, rd.marks, rd.red, rd.tree)) || (split && probSplit(probKey(rd.solid, rd.marks, rd.red, rd.tree)) !== split)) return false;
  if (!Number.isInteger(rd.red) || rd.red < 0 || rd.red >= S.edges.length) return false;
  if (!rd.marks.every((f) => Number.isInteger(f) && f >= 0 && f < S.faces.length)) return false;
  const vis = xFaceVis(rd);
  if (!xViewOk(vis) || !xMarksOk(rd, vis)) return false;
  const sl = xSolidLayout(rd);
  if (!xSolidOk(sl) || !xRedOk(rd, vis, sl) || !xAnswerUnique(rd)) return false;
  const nl = xNetLayout(rd);
  if (!xNetOk(nl)) return false;
  const want = answerOf(nl, rd.red);
  if (want.length === 1 && S.edges[rd.red].faces.some((f) => rd.marks.includes(f))) return false;
  const ans = rd.answer.slice().sort((a, b) => a - b);
  return want.length >= 1 && want.length <= 2 && ans.length === want.length && ans.every((x, k) => x === want[k]);
}
function xContractOk(m) {
  if (m.task !== 'surface_development_edge' || !m.board || m.board.w !== EXT_BOARD.w || m.board.h !== EXT_BOARD.h) return false;
  return Array.isArray(m.rounds) && m.rounds.length === 1 && xRoundOk(m.rounds[0], m.ext.split);
}
const POSES = new Map();
function posesOf(solid) {
  if (POSES.has(solid)) return POSES.get(solid);
  const S = XSOLIDS[solid], out = [];
  for (let rest = 0; rest < S.faces.length; rest++) for (let yaw = 0; yaw < 360; yaw += 7.5) {
    const rd = { solid, pose: { rest, yaw }, view: { elev: ELEV, netTop: false, solidDx: 0, netShift: [0, 0] }, marks: [], red: -1 };
    const vis = xFaceVis(rd);
    if (!xViewOk(vis)) continue;
    const sl = xSolidLayout(rd);
    if (!xSolidOk(sl, rd)) continue;
    const markable = S.faces.map((_, f) => f).filter((f) => vis[f] >= MARK_VIS);
    const redable = S.edges.map((_, e) => e).filter((e) => { rd.red = e; return xRedOk(rd, vis, sl); });
    out.push({ rest, yaw, markable: new Set(markable), redable: new Set(redable) });
  }
  POSES.set(solid, out);
  return out;
}
function probKeyG(group, solid, marks, red, tree) {
  let best = null;
  for (const g of group) {
    const k = JSON.stringify([marks.map((f) => g.facePerm[f]).sort((x, y) => x - y), g.edgePerm[red], tree.map((e) => g.edgePerm[e]).sort((x, y) => x - y)]);
    if (best === null || k < best) best = k;
  }
  return `${solid}|${best}`;
}
const probKey = (solid, marks, red, tree) => probKeyG(solidInfo(solid).group, solid, marks, red, tree);
function fitTurns(solid, tree) {
  return [0, 1, 2, 3].filter((t) => xNetOk(xNetLayout({ solid, tree, netTurn: t, view: { elev: ELEV, netTop: false, solidDx: 0, netShift: [0, 0] } })));
}
const XPROBS = new Map();
function problemsOf(split, type) {
  const key = `${split}|${type}`;
  if (XPROBS.has(key)) return XPROBS.get(key);
  const all = [];
  for (const solid of EXT_SOLIDS[split]) {
    const S = XSOLIDS[solid], poses = posesOf(solid);
    for (const tree of extTrees(solid)) {
      const turns = fitTurns(solid, tree);
      if (!turns.length) continue;
      for (let f1 = 0; f1 < S.faces.length; f1++) for (let f2 = f1 + 1; f2 < S.faces.length; f2++) {
        const marks = [f1, f2];
        for (let red = 0; red < S.edges.length; red++) {
          const fold = tree.includes(red), nM = S.edges[red].faces.filter((f) => marks.includes(f)).length;
          if ((type === 'fold') !== fold || (nM > 0 && fold)) continue;
          if (!xAnswerUnique({ solid, marks, red })) continue;
          const pk = probKey(solid, marks, red, tree);
          if (pk !== `${solid}|${JSON.stringify([marks, red, tree.slice().sort((x, y) => x - y)])}` || EVAL_PROB_KEYS.has(pk) || probSplit(pk) !== split) continue;
          const ok = poses.filter((p) => p.markable.has(f1) && p.markable.has(f2) && p.redable.has(red));
          if (ok.length) all.push({ solid, marks, red, tree: tree.slice(), turns, poses: ok });
        }
      }
    }
  }
  const N = all.length;
  const out = Array.from({ length: N }, (_, i) => all[nthOf(`surface_development_edge|${split}|${type}|problems`, i + 1, N)]);
  XPROBS.set(key, out);
  return out;
}
export const SEMANTIC_CAPACITY = { train: 77, test: 15 };
const FOLD_QUOTA = { train: 20, test: 4 };
const EVAL_PROB_KEY_LIST = ['pyramid|[[1,2],7,[0,2,4,5]]', 'pyramid|[[1,2],4,[0,5,6,7]]', 'prism|[[0,2],6,[1,2,5,7]]', 'prism|[[0,2],5,[1,2,5,8]]', 'pyramid|[[1,2],4,[0,1,3,5]]', 'prism|[[0,2],0,[1,4,5,8]]', 'prism|[[0,2],5,[0,2,5,6]]', 'pyramid|[[1,2],4,[0,1,5,6]]', 'prism|[[0,2],5,[1,4,5,7]]', 'pyramid|[[1,2],4,[0,1,5,6]]', 'pyramid|[[1,2],4,[0,1,3,6]]', 'pyramid|[[1,2],4,[0,1,6,7]]'];
const EVAL_PROB_KEYS = new Set(EVAL_PROB_KEY_LIST);
function generateExt(rng, split, n) {
  const C = SEMANTIC_CAPACITY[split], NF = FOLD_QUOTA[split], k = ((n - 1) % C) + 1;
  const folds = (x) => Math.floor((x * NF) / C);
  const wantFold = folds(k) > folds(k - 1), j = wantFold ? folds(k) : k - folds(k);
  const list = problemsOf(split, wantFold ? 'fold' : 'cut');
  const P = list[(j - 1) % list.length];
  const r2 = (v) => Math.round(v * 100) / 100;
  for (let att = 0; att < 400; att++) {
    const pose = rng.pick(P.poses);
    const view = { elev: ELEV, netTop: rng.raw() < 0.4, solidDx: Math.round(rng.uniform(-70, 70)), netShift: [r2(rng.uniform(-1, 1)), r2(rng.uniform(-1, 1))] };
    const rd = { solid: P.solid, pose: { rest: pose.rest, yaw: Math.round((pose.yaw + rng.uniform(-3, 3) + 360) % 360 * 10) / 10 }, view,
      tree: P.tree.slice(), netTurn: rng.pick(P.turns), marks: rng.raw() < 0.5 ? P.marks.slice() : P.marks.slice().reverse(), red: P.red, answer: [] };
    const nl = xNetLayout(rd);
    rd.answer = answerOf(nl, rd.red);
    if (xRoundOk(rd, split)) return { task: 'surface_development_edge', board: { ...EXT_BOARD }, rounds: [rd], ext: { split }, panel: { panelWidth: EXT_PANEL_W, boardH: EXT_BOARD.h + 10 } };
  }
  throw new Error('surface_development_edge: ext sampler exhausted');
}

function geoOf(rd) {
  if (isHard(rd)) return { S: HSOLIDS[rd.solid], M: hPose(rd), nl: hNetLayout(rd), sl: hSolidLayout(rd), vis: hFaceVis(rd) };
  return { S: XSOLIDS[rd.solid], M: xPose(rd), nl: xNetLayout(rd), sl: xSolidLayout(rd), vis: xFaceVis(rd) };
}
const netOf = (rd) => (isHard(rd) ? hNetLayout(rd) : xNetLayout(rd));

const PLAIN_TONES = ['#e8eef6', '#f1ece2', '#e7e7e4', '#e9e2d0', '#e2ebe3', '#ede4ec', '#dcd3c2'];
async function mountLook(st) {
  const pairs = kindTexPairs(st, ['paper', 'plastic', 'concrete', 'stone', 'felt'], (t) => isoTex(t, 0.2, 0.26), 'surface_development_edge');
  const desks = st.pool('tex', (t) => (t.use === 'wood' && ANISO[t.id] && ANISO[t.id][0] < 0.75 && !GRIDDY.test(t.id)) || (['floor', 'fabric', 'flat2d', 'stone', 'wall'].includes(t.use) && isoTex(t, 0.25, 0.3)));
  const [[kind, tex], dtex] = primaryOf(st, 'g17_surfdev', [pairs, desks]);
  st.note(`solid:${kind}:${tex.id}`); st.note(`desk:${dtex.id}`);
  const r = st.rand;
  const det = await detail(tex.file, 128, kind === 'paper' ? 3 : 6);
  const amp = kind === 'plastic' ? 0.05 : kind === 'paper' ? 0.08 : 0.2;
  const plainHex = pickSplit(st, 'g17_plain_tone', PLAIN_TONES), netHex = r() < 0.6 ? '#ffffff' : pickSplit(st, 'g17_plain_tone', PLAIN_TONES);
  return {
    kind, plain: tinted(det, plainHex, amp), tint: tinted(det, TINT, amp), netPlain: tinted(det, netHex, 0.06), netTint: tinted(det, TINT, 0.06),
    k: 0.4 + 0.3 * r(), off: [r() * 128, r() * 128],
    desk: await natural(dtex.file, { L: 0.58 + 0.3 * r(), contrast: 0.4, sat: 0.22 }), deskK: 0.6 + 0.5 * r(),
    split: r() < 0.5,
  };
}
function drawStyled(g, br, env, L, task) {
  const { manifest: m, state: st } = env, rd = m.rounds[0];
  const { nl, sl, vis, S, M } = task._net(rd);
  const marked = new Set(rd.marks);
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = pat(g, L.desk, L.deskK, 0, 0, L.deskK, L.off[0], L.off[1]); g.fillRect(0, 0, br.w, br.h);
  if (L.split) {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    if (isHard(rd)) g.fillRect(H_SPLIT, 0, br.w - H_SPLIT, br.h);
    else { const y0 = xBoxes(rd).split; if (rd.view.netTop) g.fillRect(0, 0, br.w, y0); else g.fillRect(0, y0, br.w, br.h - y0); }
  }
  const down = S.normals.findIndex((n) => matVec(M, n)[1] < -0.999);
  if (down >= 0) { poly(g, S.faces[down].map((v) => sl.proj([sl.world[v][0] + 0.07, sl.world[v][1], sl.world[v][2] + 0.07]))); g.fillStyle = 'rgba(20,25,30,0.22)'; g.fill(); }
  S.faces.forEach((f, fi) => {
    if (vis[fi] <= 0) return;
    const n = matVec(M, S.normals[fi]), l = Math.max(0, dot3(n, LIGHT));
    const k = marked.has(fi) ? 0.88 + 0.12 * l : 0.72 + 0.28 * l;
    poly(g, f.map((v) => sl.P[v]));
    g.fillStyle = pat(g, marked.has(fi) ? L.tint : L.plain, L.k, 0, 0, L.k, L.off[0], L.off[1]); g.fill();
    g.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(3)})`; g.fill();
  });
  g.lineCap = 'round'; g.lineJoin = 'round';
  S.edges.forEach((e, ei) => {
    if (ei === rd.red || Math.max(vis[e.faces[0]], vis[e.faces[1]]) <= 0) return;
    const a = sl.P[e.v[0]], b = sl.P[e.v[1]];
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#3a444e'; g.lineWidth = 1.7; g.stroke();
  });
  const e = S.edges[rd.red], a = sl.P[e.v[0]], b = sl.P[e.v[1]];
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.stroke();
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#e03131'; g.lineWidth = 4.6; g.stroke();
  g.lineCap = 'butt';
  g.save(); g.shadowColor = 'rgba(20,25,30,0.25)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
  nl.polys.forEach((P, fi) => { poly(g, P); g.fillStyle = pat(g, marked.has(fi) ? L.netTint : L.netPlain, L.k, 0, 0, L.k, L.off[1], L.off[0]); g.fill(); });
  g.restore();
  g.lineCap = 'round';
  nl.segs.forEach((sg) => {
    g.beginPath(); g.moveTo(sg.a.x, sg.a.y); g.lineTo(sg.b.x, sg.b.y);
    if (sg.fold) { g.setLineDash([5, 4]); g.strokeStyle = 'rgba(70,82,95,0.8)'; g.lineWidth = 1.3; } else { g.setLineDash([]); g.strokeStyle = '#3a444e'; g.lineWidth = 1.9; }
    g.stroke();
  });
  g.setLineDash([]);
  const glow = (i, col, w) => {
    if (i == null || i < 0 || !nl.segs[i]) return;
    const sg = nl.segs[i], ux = sg.b.x - sg.a.x, uy = sg.b.y - sg.a.y;
    g.beginPath(); g.moveTo(sg.a.x + ux * 0.04, sg.a.y + uy * 0.04); g.lineTo(sg.b.x - ux * 0.04, sg.b.y - uy * 0.04); g.strokeStyle = col; g.lineWidth = w; g.stroke();
  };
  const hover = task._hover ? task._hover.seg : null;
  if (hover != null && hover !== st.pick) glow(hover, 'rgba(25,145,250,0.35)', 7);
  glow(st.pick, ACCENT, 5.5);
  g.lineCap = 'butt';
  g.restore();
}

const task = {
  meta: {
    name: 'surface_development_edge', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'pick', seg: 'the pattern edge under a click (nearest, within 0.19 x edge length of its middle part); a later pick replaces it' },
    ],
    promptHuman: 'Which pattern edge becomes the red edge?',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, Number.isInteger(knobs.n) && knobs.n > 0 ? knobs.n : 1 + Math.floor(rng.raw() * 400));
    return { task: 'surface_development_edge', board: { ...BOARD }, rounds: [buildHard(rng)] };
  },

  init() { return { pick: null }; },

  applyAction(state, a, m) {
    if (a && a.op === 'pick') {
      const n = netOf(m.rounds[0]).segs.length;
      if (!Number.isInteger(a.seg) || a.seg < 0 || a.seg >= n) return { ok: false, reason: 'bad-seg' };
      state.pick = a.seg;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const ok = state.pick != null && m.rounds[0].answer.includes(state.pick);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { picked: state.pick, correct: ok } };
  },

  oracle(m) { return [{ op: 'pick', seg: m.rounds[0].answer[0] }]; },

  randomPolicy(m, rnd) {
    const n = netOf(m.rounds[0]).segs.length;
    return [{ op: 'pick', seg: Math.floor(rnd() * n) }];
  },

  gate: (m) => contractOk(m),

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Click the pattern edge that becomes the red edge', 'The pattern folds up into this solid; the side you see is the outside');
  },

  _net(rd) {
    if (!this._cache || this._cache.rd !== rd) {
      this._cache = { rd, ...geoOf(rd) };
      this._hover = null;
    }
    return this._cache;
  },

  _drawSolid(g, rd, geo) {
    const { S, M, sl, vis } = geo, marked = new Set(rd.marks);
    const down = S.normals.findIndex((n) => matVec(M, n)[1] < -0.999);
    if (down >= 0) {
      poly(g, S.faces[down].map((v) => sl.proj([sl.world[v][0] + 0.07, sl.world[v][1], sl.world[v][2] + 0.07])));
      g.fillStyle = 'rgba(30,40,55,0.14)'; g.fill();
    }
    S.faces.forEach((f, fi) => {
      if (vis[fi] <= 0) return;
      const n = matVec(M, S.normals[fi]), l = Math.max(0, dot3(n, LIGHT));
      poly(g, f.map((v) => sl.P[v]));
      g.fillStyle = marked.has(fi) ? shade(TINT, 0.88 + 0.12 * l) : shade(PLAIN, 0.72 + 0.28 * l); g.fill();
    });
    g.lineCap = 'round'; g.lineJoin = 'round';
    S.edges.forEach((e, ei) => {
      if (ei === rd.red || Math.max(vis[e.faces[0]], vis[e.faces[1]]) <= 0) return;
      const a = sl.P[e.v[0]], b = sl.P[e.v[1]];
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#3a444e'; g.lineWidth = 1.7; g.stroke();
    });
    const e = S.edges[rd.red], a = sl.P[e.v[0]], b = sl.P[e.v[1]];
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.stroke();
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = '#e03131'; g.lineWidth = 4.6; g.stroke();
    g.lineCap = 'butt';
  },

  _drawNet(g, rd, nl, pick, hover) {
    const marked = new Set(rd.marks);
    g.save();
    g.shadowColor = 'rgba(30,40,55,0.16)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    nl.polys.forEach((P, fi) => { poly(g, P); g.fillStyle = marked.has(fi) ? TINT : '#ffffff'; g.fill(); });
    g.restore();
    g.lineCap = 'round';
    nl.segs.forEach((sg) => {
      g.beginPath(); g.moveTo(sg.a.x, sg.a.y); g.lineTo(sg.b.x, sg.b.y);
      if (sg.fold) { g.setLineDash([5, 4]); g.strokeStyle = 'rgba(70,82,95,0.75)'; g.lineWidth = 1.3; }
      else { g.setLineDash([]); g.strokeStyle = '#3a444e'; g.lineWidth = 1.9; }
      g.stroke();
    });
    g.setLineDash([]);
    const glow = (i, col, w) => {
      if (i == null || i < 0 || !nl.segs[i]) return;
      const sg = nl.segs[i];
      const ux = (sg.b.x - sg.a.x), uy = (sg.b.y - sg.a.y);
      g.beginPath(); g.moveTo(sg.a.x + ux * 0.04, sg.a.y + uy * 0.04); g.lineTo(sg.b.x - ux * 0.04, sg.b.y - uy * 0.04);
      g.strokeStyle = col; g.lineWidth = w; g.stroke();
    };
    if (hover != null && hover !== pick) glow(hover, 'rgba(25,145,250,0.35)', 7);
    glow(pick, ACCENT, 5.5);
    g.lineCap = 'butt';
  },

  drawBoard(g, br, env) {
    if (env.assets?.look) { drawStyled(g, br, env, env.assets.look, this); return; }
    const { manifest: m, state: st } = env, rd = m.rounds[0];
    const geo = this._net(rd);
    g.save(); g.translate(br.x, br.y);
    if (isHard(rd)) {
      const bg = g.createLinearGradient(0, 0, 0, br.h);
      bg.addColorStop(0, '#e3e9f0'); bg.addColorStop(1, '#eef2f6');
      g.fillStyle = bg; g.fillRect(0, 0, H_SPLIT, br.h);
      g.fillStyle = '#f7f8fa'; g.fillRect(H_SPLIT, 0, br.w - H_SPLIT, br.h);
      g.strokeStyle = '#d6dce3'; g.lineWidth = 1; g.beginPath(); g.moveTo(H_SPLIT + 0.5, 0); g.lineTo(H_SPLIT + 0.5, br.h); g.stroke();
    } else {
      const y0 = xBoxes(rd).split, top = rd.view.netTop;
      g.fillStyle = '#e8edf3'; g.fillRect(0, 0, br.w, br.h);
      g.fillStyle = '#f7f8fa'; if (top) g.fillRect(0, 0, br.w, y0); else g.fillRect(0, y0, br.w, br.h - y0);
      g.strokeStyle = '#d6dce3'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y0 + 0.5); g.lineTo(br.w, y0 + 0.5); g.stroke();
    }
    this._drawSolid(g, rd, geo);
    this._drawNet(g, rd, geo.nl, st.pick, this._hover ? this._hover.seg : null);
    g.restore();
  },

  pointer(evt, env) {
    const rd = env.manifest.rounds[0];
    const { nl } = this._net(rd);
    if (evt.type === 'move') { const i = hitSeg(nl, evt); this._hover = i >= 0 ? { seg: i } : null; return []; }
    if (evt.type !== 'down') return [];
    const i = hitSeg(nl, evt);
    return i >= 0 ? [{ op: 'pick', seg: i }] : [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    return env.state.pick == null ? 'Click an edge' : '1 edge selected';
  },
};

export const _test = { hNetLayout, hSolidLayout, hFaceVis, hitSeg, hPose, marksAsym, geoOf };
export function gate(m) { return contractOk(m); }
export default task;

export function semanticKey(m) {
  const rd = m.rounds[0];
  const group = isHard(rd) ? hInfo(rd.solid).group : solidInfo(rd.solid).group;
  return `surface_development_edge|${probKeyG(group, rd.solid, rd.marks, rd.red, rd.tree)}`;
}
