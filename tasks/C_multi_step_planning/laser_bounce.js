import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { hash32, nthOf } from '../core/style.js';
import { mountLaserLook, drawLaserStyled } from '../common/_laser_bounce_look.js';
import { L3, PANEL3, trace2, allExits, exitGap, exitPoint as exitPoint3, exitQuad, inPanel, audit3, sceneOf, yawOk, facesCamera, camOf } from '../common/_laser_bounce_3d.js';
import { render as render3, toCanvas as toCanvas3, contextScale as contextScale3 } from '../common/_laser_bounce_rt.js';

const BOARD = { w: 340, h: 300 };
const COLS = 7, ROWS = 5, S = 42;
const BOX = { x: 23, y: 46, w: COLS * S, h: ROWS * S };
const HARD = Object.freeze({ minMirrors: 2, maxMirrors: 3, minTurns: 2, tol: 17 });
const HB = Object.freeze({ cols: 10, rows: 8, S: 36, box: { x: 30, y: 31 }, board: { w: 420, h: 350 },
  panel: { panelWidth: 440, boardH: 360 }, minTurns: 5, maxTurns: 6, decoys: 2, minSeg: 2, tol: 14 });
const cx = (c) => BOX.x + c * S + S / 2;
const cy = (r) => BOX.y + r * S + S / 2;
const reflect = (d, kind) => (kind === '\\' ? [d[1], d[0]] : [-d[1], -d[0]]);

function simulate(mirrors, er) {
  const at = (c, r) => mirrors.find((m) => m.c === c && m.r === r);
  let c = 0, r = er, d = [1, 0], turns = 0;
  const cells = [];
  for (let step = 0; step < 120; step++) {
    const m = at(c, r);
    if (m) { d = reflect(d, m.kind); turns++; }
    cells.push({ c, r });
    const nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
      const exit = d[0] === 1 ? { x: BOX.x + BOX.w, y: cy(r) } : d[0] === -1 ? { x: BOX.x, y: cy(r) }
        : d[1] === 1 ? { x: cx(c), y: BOX.y + BOX.h } : { x: cx(c), y: BOX.y };
      return { exit: { x: +exit.x.toFixed(2), y: +exit.y.toFixed(2) }, turns, cells };
    }
    c = nc; r = nr;
  }
  return null;
}

const EXITS = [
  ...Array.from({ length: ROWS }, (_, row) => ['L', 'R'].map(side => ({ side, row }))).flat(),
  ...Array.from({ length: COLS }, (_, col) => ['T', 'B'].map(side => ({ side, col }))).flat(),
];
const exitPoint = e => e.side === 'L' ? { x: BOX.x, y: cy(e.row) } : e.side === 'R' ? { x: BOX.x + BOX.w, y: cy(e.row) }
  : { x: cx(e.col), y: e.side === 'T' ? BOX.y : BOX.y + BOX.h };
const mirrorFor = (from, to) => reflect(from, '\\').every((v, i) => v === to[i]) ? '\\' : '/';
function makeRound(rng) {
  const goal = rng.pick(EXITS), horizontal = goal.row !== undefined;
  const midRow = horizontal ? goal.row : rng.int(0, ROWS - 1);
  const er = rng.pick(Array.from({ length: ROWS }, (_, i) => i).filter(i => i !== midRow));
  const col = rng.pick(Array.from({ length: COLS }, (_, i) => i).filter(i => horizontal || i !== goal.col));
  const vertical = [0, Math.sign(midRow - er)];
  const across = horizontal ? [goal.side === 'R' ? 1 : -1, 0] : [Math.sign(goal.col - col), 0];
  const mirrors = [
    { c: col, r: er, kind: mirrorFor([1, 0], vertical) },
    { c: col, r: midRow, kind: mirrorFor(vertical, across) },
  ];
  if (!horizontal) mirrors.push({ c: goal.col, r: midRow, kind: mirrorFor(across, [0, goal.side === 'B' ? 1 : -1]) });
  return { emitterRow: er, mirrors, exit: exitPoint(goal), tol: HARD.tol };
}

const hbGeom = () => ({ cols: HB.cols, rows: HB.rows, S: HB.S, box: { x: HB.box.x, y: HB.box.y, w: HB.cols * HB.S, h: HB.rows * HB.S } });
function hbExits() {
  const G = hbGeom(), out = [];
  for (let r = 0; r < HB.rows; r++) for (const side of ['L', 'R']) out.push({ side, idx: r, x: side === 'L' ? G.box.x : G.box.x + G.box.w, y: G.box.y + r * HB.S + HB.S / 2 });
  for (let c = 0; c < HB.cols; c++) for (const side of ['T', 'B']) out.push({ side, idx: c, x: G.box.x + c * HB.S + HB.S / 2, y: side === 'T' ? G.box.y : G.box.y + G.box.h });
  return out;
}
function hbTrace(mirrors, er) {
  const G = hbGeom(), at = (c, r) => mirrors.find((q) => q.c === c && q.r === r);
  let c = 0, r = er, d = [1, 0];
  const cells = new Set(), hits = [];
  for (let step = 0; step < 400; step++) {
    const q = at(c, r);
    if (q) { d = reflect(d, q.kind); hits.push(`${c},${r}`); }
    cells.add(`${c},${r}`);
    const nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nc >= G.cols || nr < 0 || nr >= G.rows) {
      const exit = d[0] === 1 ? { x: G.box.x + G.box.w, y: G.box.y + r * G.S + G.S / 2 } : d[0] === -1 ? { x: G.box.x, y: G.box.y + r * G.S + G.S / 2 }
        : d[1] === 1 ? { x: G.box.x + c * G.S + G.S / 2, y: G.box.y + G.box.h } : { x: G.box.x + c * G.S + G.S / 2, y: G.box.y };
      return { exit: { x: +exit.x.toFixed(2), y: +exit.y.toFixed(2) }, cells, hits };
    }
    c = nc; r = nr;
  }
  return null;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function hbOk(m) {
  if (m.cols !== HB.cols || m.rows !== HB.rows || m.S !== HB.S || m.tol !== HB.tol || m.box?.x !== HB.box.x || m.box?.y !== HB.box.y) return false;
  if (!m.emitter || m.emitter.side !== 'L' || !Number.isInteger(m.emitter.idx) || m.emitter.idx < 0 || m.emitter.idx >= HB.rows) return false;
  if (!Array.isArray(m.mirrors) || !m.mirrors.every((q) => Number.isInteger(q.c) && q.c >= 0 && q.c < HB.cols && Number.isInteger(q.r) && q.r >= 0 && q.r < HB.rows && ['/', '\\'].includes(q.kind))) return false;
  if (new Set(m.mirrors.map((q) => q.c + ',' + q.r)).size !== m.mirrors.length) return false;
  const t = hbTrace(m.mirrors, m.emitter.idx);
  if (!t || new Set(t.hits).size !== t.hits.length) return false;
  const turns = t.hits.length, decoys = m.mirrors.filter((q) => !t.hits.includes(`${q.c},${q.r}`));
  if (turns < HB.minTurns || turns > HB.maxTurns || decoys.length !== HB.decoys) return false;
  if (!decoys.every((q) => N4.some(([dc, dr]) => t.cells.has(`${q.c + dc},${q.r + dr}`)))) return false;
  const G = hbGeom(), entry = { x: G.box.x, y: G.box.y + m.emitter.idx * G.S + G.S / 2 };
  if (t.exit.x === entry.x && t.exit.y === entry.y) return false;
  return t.exit.x === m.exit?.x && t.exit.y === m.exit?.y;
}
function hbRoute(rng, er, turns) {
  const mirrors = [], used = new Set();
  let c = 0, r = er, d = [1, 0];
  used.add(`${c},${r}`);
  for (let t = 0; t < turns; t++) {
    const room = [];
    for (let k = 1; ; k++) {
      const nc = c + d[0] * k, nr = r + d[1] * k;
      if (nc < 0 || nc >= HB.cols || nr < 0 || nr >= HB.rows) break;
      if (mirrors.some((q) => q.c === nc && q.r === nr)) break;
      if (k >= HB.minSeg && !used.has(`${nc},${nr}`)) room.push(k);
    }
    if (!room.length) return null;
    const k = rng.pick(room);
    for (let j = 1; j <= k; j++) used.add(`${c + d[0] * j},${r + d[1] * j}`);
    c += d[0] * k; r += d[1] * k;
    const nd = rng.pick(d[0] !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]);
    mirrors.push({ c, r, kind: mirrorFor(d, nd) });
    d = nd;
  }
  return mirrors;
}
function makeHardRound(rng) {
  const exits = hbExits();
  for (let outer = 0; outer < 200; outer++) {
    const goal = rng.pick(exits);
    for (let tries = 0; tries < 4000; tries++) {
      const er = rng.int(0, HB.rows - 1), turns = rng.int(HB.minTurns, HB.maxTurns);
      const path = hbRoute(rng, er, turns);
      if (!path) continue;
      const t = hbTrace(path, er);
      if (!t || t.hits.length !== turns || t.exit.x !== goal.x || t.exit.y !== goal.y) continue;
      const near = [];
      for (let c = 0; c < HB.cols; c++) for (let r = 0; r < HB.rows; r++) {
        const k = `${c},${r}`;
        if (t.cells.has(k) || (c === 0 && r === er)) continue;
        if (!N4.some(([dc, dr]) => t.cells.has(`${c + dc},${r + dr}`))) continue;
        near.push({ c, r });
      }
      const mirrors = path.slice();
      for (let j = 0; j < HB.decoys; j++) {
        const ok = near.filter((p) => !mirrors.some((q) => q.c === p.c && q.r === p.r));
        if (!ok.length) break;
        const p = rng.pick(ok);
        mirrors.push({ c: p.c, r: p.r, kind: rng.pick(['/', '\\']) });
      }
      const m = { cols: HB.cols, rows: HB.rows, S: HB.S, box: { ...HB.box }, emitter: { side: 'L', idx: er },
        mirrors: rng.shuffle(mirrors), tol: HB.tol, exit: { x: goal.x, y: goal.y } };
      if (hbOk(m)) return m;
    }
  }
  throw new Error('laser_bounce: no layout found');
}

const H3 = Object.freeze({ minTurns: 5, maxTurns: 6, decoys: 2, lows: 2, minSeg: 2, minGap: 2 });
const N4b = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function route3(rng, er, turns) {
  const mirrors = [], used = new Set();
  let c = 0, r = er, d = [1, 0];
  used.add(`${c},${r}`);
  for (let t = 0; t < turns; t++) {
    const room = [];
    for (let k = 1; ; k++) {
      const nc = c + d[0] * k, nr = r + d[1] * k;
      if (nc < 0 || nc >= L3.cols || nr < 0 || nr >= L3.rows) break;
      if (mirrors.some((q) => q.c === nc && q.r === nr)) break;
      if (k >= H3.minSeg && !used.has(`${nc},${nr}`)) room.push(k);
    }
    if (!room.length) return null;
    const k = rng.pick(room);
    for (let j = 1; j <= k; j++) used.add(`${c + d[0] * j},${r + d[1] * j}`);
    c += d[0] * k; r += d[1] * k;
    const nd = rng.pick(d[0] !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]);
    mirrors.push({ c, r, kind: mirrorFor(d, nd), low: false });
    d = nd;
  }
  return mirrors;
}
const sameExit = (a, b) => !!a && !!b && a.side === b.side && a.idx === b.idx;
const close2 = (a, b) => Math.abs(a - b) <= 0.02;
export function problems3(m) {
  const P = [];
  if (!m || m.view3d !== 1 || m.board?.w !== L3.W || m.board?.h !== L3.H || m.panel?.panelWidth !== PANEL3.panelWidth || m.panel?.boardH !== PANEL3.boardH) return ['header'];
  if (m.cols !== L3.cols || m.rows !== L3.rows || m.tol !== L3.tol) return ['dims'];
  if (!m.emitter || m.emitter.side !== 'L' || !Number.isInteger(m.emitter.idx) || m.emitter.idx < 0 || m.emitter.idx >= L3.rows) return ['emitter'];
  if (!Array.isArray(m.mirrors) || !m.mirrors.every((q) => Number.isInteger(q.c) && q.c >= 0 && q.c < L3.cols && Number.isInteger(q.r) && q.r >= 0 && q.r < L3.rows && ['/', '\\'].includes(q.kind) && typeof q.low === 'boolean')) return ['mirrors'];
  if (new Set(m.mirrors.map((q) => q.c + ',' + q.r)).size !== m.mirrors.length) return ['mirror-cells'];
  if (!m.cam || !yawOk(m.cam.yaw) || !(m.cam.el >= L3.elLo && m.cam.el <= L3.elHi) || m.cam.dist !== L3.dist) return ['camera'];
  const er = m.emitter.idx, A = audit3(m), t = A.truth;
  if (!t || new Set(t.hits).size !== t.hits.length) return ['truth'];
  const lows = m.mirrors.filter((q) => q.low), tall = m.mirrors.filter((q) => !q.low);
  const decoys = tall.filter((q) => !t.hits.includes(`${q.c},${q.r}`));
  if (t.hits.length < H3.minTurns || t.hits.length > H3.maxTurns) P.push('turns');
  if (decoys.length !== H3.decoys || !decoys.every((q) => N4b.some(([dc, dr]) => t.cells.has(`${q.c + dc},${q.r + dr}`)))) P.push('decoys');
  if (lows.length !== H3.lows || !lows.every((q) => t.straight.includes(`${q.c},${q.r}`) && !(q.c === 0 && q.r === er) && facesCamera(q, A.cam))) P.push('lows');
  if (t.exit.side === 'L' && t.exit.idx === er) P.push('exit-is-entry');
  if (!sameExit(t.exit, m.exitId)) P.push('exitId');
  for (const [k, w] of [['allReflect', A.allReflect], ['screen', A.screen], ['screenAll', A.screenAll], ['frameB', A.swapped]]) if (w && exitGap(w.exit, t.exit) < H3.minGap) P.push('reading:' + k);
  const ep = exitPoint3(t.exit, A.cam), quad = exitQuad(t.exit, A.cam);
  if (!m.exit || !close2(m.exit.x, ep.x) || !close2(m.exit.y, ep.y)) P.push('exit-point');
  if (!Array.isArray(m.exitQuad) || m.exitQuad.length !== 4 || !m.exitQuad.every((p, i) => close2(p[0], quad[i][0]) && close2(p[1], quad[i][1]))) P.push('exit-quad');
  const wpx = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]), hpx = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
  if (wpx < L3.minPanelW || hpx < L3.minPanelH) P.push('panel-size');
  const pts = allExits().map((e) => [e, exitPoint3(e, A.cam)]);
  if (!pts.every(([, p]) => p.x >= 2 && p.y >= 2 && p.x <= L3.W - 2 && p.y <= L3.H - 2)) P.push('exit-offboard');
  if (pts.some(([e, p]) => !sameExit(e, t.exit) && inPanel(p.x, p.y, quad, L3.tol))) P.push('panel-overlap');
  const V = A.vis;
  if (!V.boards.every((v) => v >= L3.minVis) || !V.boardsAll.every((v) => v >= L3.minVisAll) || !V.corners) P.push('boards-hidden');
  if (V.stub < 3) P.push('stub-hidden');
  if (V.exitBlocked) P.push('exit-hidden');
  return P;
}
function make3DRound(rng) {
  const exits = allExits();
  for (let outer = 0; outer < 400; outer++) {
    const goal = rng.pick(exits);
    for (let tries = 0; tries < 3000; tries++) {
      const er = rng.int(0, L3.rows - 1), turns = rng.int(H3.minTurns, H3.maxTurns);
      if (goal.side === 'L' && goal.idx === er) continue;
      const path = route3(rng, er, turns);
      if (!path) continue;
      const t = trace2(path, er, (q) => q.kind);
      if (!t || t.hits.length !== turns || !sameExit(t.exit, goal)) continue;
      const mirrors = path.slice(), occ = (c, r) => mirrors.some((q) => q.c === c && q.r === r);
      const near = [];
      for (let c = 0; c < L3.cols; c++) for (let r = 0; r < L3.rows; r++) {
        if (t.cells.has(`${c},${r}`) || (c === 0 && r === er)) continue;
        if (N4b.some(([dc, dr]) => t.cells.has(`${c + dc},${r + dr}`))) near.push({ c, r });
      }
      for (let j = 0; j < H3.decoys; j++) {
        const ok = near.filter((p) => !occ(p.c, p.r));
        if (!ok.length) break;
        const p = rng.pick(ok);
        mirrors.push({ c: p.c, r: p.r, kind: rng.pick(['/', '\\']), low: false });
      }
      const straight = t.straight.filter((k) => k !== `0,${er}`).map((k) => k.split(',').map(Number)).filter(([c, r]) => !occ(c, r));
      for (let j = 0; j < H3.lows && straight.length; j++) {
        const [c, r] = straight.splice(rng.int(0, straight.length - 1), 1)[0];
        mirrors.push({ c, r, kind: '/', low: true });
      }
      const base = { task: 'laser_bounce', view3d: 1, board: { w: L3.W, h: L3.H }, panel: { ...PANEL3 }, cols: L3.cols, rows: L3.rows,
        emitter: { side: 'L', idx: er }, mirrors: rng.shuffle(mirrors), tol: L3.tol, exitId: { ...goal } };
      for (let k = 0; k < 4; k++) {
        const d = Math.round(rng.uniform(L3.dLo, L3.dHi - 0.1) * 10) / 10;
        const yaw = rng.pick([90, 270]) + rng.pick([-1, 1]) * d, el = Math.round(rng.uniform(L3.elLo, L3.elHi) * 10) / 10;
        const m = { ...base, cam: { yaw, el, dist: L3.dist } }, cam = camOf(m);
        m.mirrors = m.mirrors.map((q) => (q.low ? { ...q, kind: facesCamera(q, cam) ? q.kind : (q.kind === '/' ? '\\' : '/') } : q));
        const A = audit3(m);
        if (!A.truth || !sameExit(A.truth.exit, goal)) break;
        m.exit = exitPoint3(goal, A.cam); m.exitQuad = exitQuad(goal, A.cam);
        if (!problems3(m).length) return m;
      }
    }
  }
  throw new Error('laser_bounce: no 3D layout');
}

const EXT = Object.freeze({ boxY: [24, 66] });
const SIDES = ['L', 'R'];
const swapKind = (k) => (k === '/' ? '\\' : '/');
const flipV = (L) => ({ emitterRow: ROWS - 1 - L.emitterRow, mirrors: L.mirrors.map((q) => ({ c: q.c, r: ROWS - 1 - q.r, kind: swapKind(q.kind) })) });
const flipH = (L) => ({ emitterRow: L.emitterRow, mirrors: L.mirrors.map((q) => ({ c: COLS - 1 - q.c, r: q.r, kind: swapKind(q.kind) })) });
const lkey = (L) => `${L.emitterRow}|` + L.mirrors.map((q) => `${q.c},${q.r}${q.kind}`).sort().join(';');
const toLeft = (m) => { const L = { emitterRow: m.ext ? m.emitter.idx : m.emitterRow, mirrors: m.mirrors }; return m.ext && m.emitter.side === 'R' ? flipH(L) : L; };
const classKey = (L) => { const a = lkey(L), b = lkey(flipV(L)); return a < b ? a : b; };
export function semanticKey(m) { return 'laser|' + classKey(toLeft(m)); }
const EVAL_CLASSES = new Set([
  "1|4,1\\;4,4/", "2|4,1/;4,2/", "0|4,0\\;4,4\\", "2|0,1/;5,1\\;5,2/", "0|0,0\\;0,3\\", "2|2,1/;2,2/", "2|3,1/;3,2/;4,1\\", "1|5,1\\;5,2/", "2|0,0\\;0,2/", "1|0,1\\;0,4/", "1|0,4\\;6,1\\;6,4/", "1|5,0\\;5,1/",
]);
let LAYOUTS = null;
function defaultLayouts() {
  if (LAYOUTS) return LAYOUTS;
  const out = new Map(), rows = [...Array(ROWS).keys()], cols = [...Array(COLS).keys()];
  for (const goal of EXITS) {
    const horizontal = goal.row !== undefined;
    for (const midRow of horizontal ? [goal.row] : rows) for (const er of rows.filter((i) => i !== midRow)) for (const col of cols.filter((i) => horizontal || i !== goal.col)) {
      const vertical = [0, Math.sign(midRow - er)];
      const across = horizontal ? [goal.side === 'R' ? 1 : -1, 0] : [Math.sign(goal.col - col), 0];
      const mirrors = [{ c: col, r: er, kind: mirrorFor([1, 0], vertical) }, { c: col, r: midRow, kind: mirrorFor(vertical, across) }];
      if (!horizontal) mirrors.push({ c: goal.col, r: midRow, kind: mirrorFor(across, [0, goal.side === 'B' ? 1 : -1]) });
      const m = { board: BOARD, emitterRow: er, mirrors, exit: exitPoint(goal), tol: HARD.tol };
      const sim = simulate(mirrors, er);
      if (!sim || sim.turns !== mirrors.length || !gateLayout(m)) continue;
      out.set(lkey(m), { emitterRow: er, mirrors });
    }
  }
  const cls = new Map();
  for (const L of out.values()) { const k = classKey(L); if (!cls.has(k)) cls.set(k, []); cls.get(k).push(L); }
  LAYOUTS = [...cls.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return LAYOUTS;
}
export const classSplit = (k) => (EVAL_CLASSES.has(k) ? 'eval' : hash32(`laser_class|${k}`) % 10 === 0 ? 'test' : 'train');
const CLASSES = {};
const classesFor = (split) => (CLASSES[split] ||= defaultLayouts().filter(([k]) => classSplit(k) === split));
function extGeom(m) { return { cols: m.cols, rows: m.rows, S: m.S, box: { x: m.box.x, y: m.box.y, w: m.cols * m.S, h: m.rows * m.S } }; }
export function simulateExt(m) {
  const G = extGeom(m), at = (c, r) => m.mirrors.find((q) => q.c === c && q.r === r);
  const e = m.emitter;
  let c = e.side === 'L' ? 0 : G.cols - 1, r = e.idx, d = e.side === 'L' ? [1, 0] : [-1, 0];
  const ccx = (cc) => G.box.x + cc * G.S + G.S / 2, ccy = (rr2) => G.box.y + rr2 * G.S + G.S / 2;
  let turns = 0; const hit = new Set();
  for (let step = 0; step < 400; step++) {
    const q = at(c, r);
    if (q) { d = reflect(d, q.kind); turns++; hit.add(`${c},${r}`); }
    const nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nc >= G.cols || nr < 0 || nr >= G.rows) {
      const exit = d[0] === 1 ? { x: G.box.x + G.box.w, y: ccy(r) } : d[0] === -1 ? { x: G.box.x, y: ccy(r) }
        : d[1] === 1 ? { x: ccx(c), y: G.box.y + G.box.h } : { x: ccx(c), y: G.box.y };
      return { exit: { x: +exit.x.toFixed(2), y: +exit.y.toFixed(2) }, turns, hit };
    }
    c = nc; r = nr;
  }
  return null;
}
function extOk(m) {
  if (!['train', 'test'].includes(m.ext) || m.cols !== COLS || m.rows !== ROWS || m.S !== S || m.tol !== HARD.tol) return false;
  if (!m.box || m.box.x !== BOX.x || !Number.isInteger(m.box.y) || m.box.y < EXT.boxY[0] || m.box.y > EXT.boxY[1]) return false;
  if (!m.emitter || !SIDES.includes(m.emitter.side) || !Number.isInteger(m.emitter.idx) || m.emitter.idx < 0 || m.emitter.idx >= ROWS) return false;
  if (!Array.isArray(m.mirrors) || !m.mirrors.every((q) => Number.isInteger(q.c) && q.c >= 0 && q.c < COLS && Number.isInteger(q.r) && q.r >= 0 && q.r < ROWS && ['/', '\\'].includes(q.kind))) return false;
  const L = toLeft(m), d0 = simulate(L.mirrors, L.emitterRow);
  if (!d0 || d0.turns !== L.mirrors.length || !gateLayout({ board: BOARD, emitterRow: L.emitterRow, mirrors: L.mirrors, tol: HARD.tol, exit: d0.exit })) return false;
  const sim = simulateExt(m);
  return !!sim && sim.exit.x === m.exit?.x && sim.exit.y === m.exit?.y && classSplit(classKey(L)) === m.ext;
}
const ORDER = {};
function orderFor(split) {
  if (ORDER[split]) return ORDER[split];
  const all = classesFor(split), g = [2, 3].map((k) => all.filter(([, ms]) => ms[0].mirrors.length === k)), out = [];
  for (let r = 0; r < Math.max(g[0].length, g[1].length); r++) g.forEach((grp, j) => { if (r < grp.length) out.push(grp[nthOf(`laser_bounce|${split}|${j + 2}`, r + 1, grp.length)][1]); });
  return (ORDER[split] = out);
}
function generateExt(rng, split, n) {
  const order = orderFor(split);
  const members = order[Number.isFinite(n) ? (((n - 1) % order.length) + order.length) % order.length : rng.int(0, order.length - 1)];
  let L = rng.pick(members);
  if (rng.raw() < 0.5) L = flipV(L);
  const right = rng.raw() < 0.5;
  if (right) L = flipH(L);
  const m = { task: 'laser_bounce', board: BOARD, ext: split, cols: COLS, rows: ROWS, S, box: { x: BOX.x, y: rng.int(...EXT.boxY) },
    emitter: { side: right ? 'R' : 'L', idx: L.emitterRow }, mirrors: L.mirrors, tol: HARD.tol };
  m.exit = simulateExt(m).exit;
  if (!extOk(m)) throw new Error('laser_bounce: ext instance failed its own check');
  return m;
}
function extExits(m) {
  const G = extGeom(m), out = [];
  if (m.mirrors.length === 2) { for (let r = 0; r < ROWS; r++) if (r !== m.emitter.idx) out.push({ x: G.box.x, y: G.box.y + r * S + S / 2 }, { x: G.box.x + G.box.w, y: G.box.y + r * S + S / 2 }); }
  else for (let c = 0; c < COLS; c++) out.push({ x: G.box.x + c * S + S / 2, y: G.box.y }, { x: G.box.x + c * S + S / 2, y: G.box.y + G.box.h });
  return out;
}

export default {
  meta: {
    name: 'laser_bounce', family: 'C', boardH: 310, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: 'px', y: 'px' }],
    promptHuman: 'Trace the laser through the 45° mirrors and click where it leaves the chamber.',
  },
  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    return make3DRound(rng);
  },
  init() { return { pick: null }; },
  applyAction(s, a) {
    if (a.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-op' };
    s.pick = { x: a.x, y: a.y }; return { ok: true };
  },
  verify(s, m) {
    const good = !!s.pick && (m.view3d ? inPanel(s.pick.x, s.pick.y, m.exitQuad, m.tol) : Math.hypot(s.pick.x - m.exit.x, s.pick.y - m.exit.y) <= m.tol);
    return { success: good, partial: good ? 1 : 0, error: good ? 0 : 1 };
  },
  oracle(m) { return [{ op: 'click', ...m.exit }]; },
  randomPolicy(m, rnd) {
    if (m.ext) { const ex = extExits(m); return [{ op: 'click', ...ex[Math.floor(rnd() * ex.length)] }]; }
    if (m.view3d) {
      const ex = allExits().filter((e) => !(e.side === 'L' && e.idx === m.emitter.idx));
      const p = exitPoint3(ex[Math.floor(rnd() * ex.length)], audit3(m).cam);
      return [{ op: 'click', x: p.x, y: p.y }];
    }
    if (m.cols) {
      const ex = hbExits().filter((e) => !(e.side === 'L' && e.idx === m.emitter.idx));
      const e = ex[Math.floor(rnd() * ex.length)];
      return [{ op: 'click', x: e.x, y: e.y }];
    }
    const exits = EXITS.filter(e => m.mirrors.length === 2 ? e.row !== undefined && e.row !== m.emitterRow : e.col !== undefined);
    return [{ op: 'click', ...exitPoint(exits[Math.floor(rnd() * exits.length)]) }];
  },
  async mount(env) { if (env && env.style) env.assets.laser = await mountLaserLook(env); },
  drawPrompt(g, r, env) {
    if (env?.manifest?.ext) drawPromptText(g, r, 'Click where the laser beam leaves the box', 'Each mirror turns the beam 90°');
    else drawPromptText(g, r, 'Click where the laser beam leaves the box');
  },
  drawBoard(g, br, env) {
    const m = env.manifest, s = env.state, TAU = Math.PI * 2;
    if (m.view3d) {
      const A = env.assets.l3 || (env.assets.l3 = {}), q = contextScale3(g);
      if (A.m !== m || A.q !== q) { A.m = m; A.q = q; A.canvas = toCanvas3(render3(sceneOf(m), q)); }
      g.save(); g.translate(br.x, br.y);
      g.drawImage(A.canvas, 0, 0, L3.W, L3.H);
      if (s.pick) { g.beginPath(); g.arc(s.pick.x, s.pick.y, 9, 0, TAU); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke(); g.beginPath(); g.arc(s.pick.x, s.pick.y, 2.5, 0, TAU); g.fillStyle = ACCENT; g.fill(); }
      g.restore(); return;
    }
    if (env.style && env.assets?.laser) {
      g.save(); g.translate(br.x, br.y);
      const G = m.ext ? extGeom(m) : { cols: COLS, rows: ROWS, S, box: BOX };
      const em = m.ext ? m.emitter : { side: 'L', idx: m.emitterRow };
      drawLaserStyled(g, br, G, m.mirrors, em, s.pick, env.assets.laser);
      g.restore(); return;
    }
    const GG = m.cols ? hbGeom() : { cols: COLS, rows: ROWS, S, box: BOX };
    const BX = GG.box, SS = GG.S, gx = (c) => BX.x + c * SS + SS / 2, gy = (r) => BX.y + r * SS + SS / 2;
    const er0 = m.cols ? m.emitter.idx : m.emitterRow;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef1f4'; g.fillRect(0, 0, br.w, br.h);
    g.save(); g.shadowColor = 'rgba(40,55,70,.16)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
    rr(g, BX.x - 5, BX.y - 5, BX.w + 10, BX.h + 10, 8); g.fillStyle = '#c9d2da'; g.fill(); g.restore();
    rr(g, BX.x - 5, BX.y - 5, BX.w + 10, BX.h + 10, 8); g.strokeStyle = '#aab6c1'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#fbfcfd'; g.fillRect(BX.x + 1.5, BX.y + 1.5, BX.w - 3, BX.h - 3);
    g.fillStyle = '#dde3e8';
    for (let c = 0; c < GG.cols; c++) for (let r = 0; r < GG.rows; r++) { g.beginPath(); g.arc(gx(c), gy(r), 2.2, 0, TAU); g.fill(); }
    m.mirrors.forEach((mi) => {
      const x = gx(mi.c), y = gy(mi.r), h = SS * 0.36;
      g.beginPath(); g.arc(x, y, 8 * SS / 42, 0, TAU); g.fillStyle = '#d4dbe1'; g.fill();
      g.save(); g.translate(x, y); g.rotate(mi.kind === '\\' ? Math.PI / 4 : -Math.PI / 4);
      g.shadowColor = 'rgba(30,45,60,.28)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
      const L = h * Math.SQRT2, plate = g.createLinearGradient(0, -3, 0, 3);
      plate.addColorStop(0, '#f4f8fb'); plate.addColorStop(0.5, '#b9c7d3'); plate.addColorStop(1, '#7f909f');
      rr(g, -L, -3, 2 * L, 6, 2); g.fillStyle = plate; g.fill();
      g.shadowColor = 'transparent'; g.strokeStyle = '#5d6e7c'; g.lineWidth = 1; g.stroke();
      g.restore();
    });
    const ey = gy(er0), ex0 = BX.x - 22;
    g.save(); g.shadowColor = 'rgba(30,40,50,.25)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
    rr(g, ex0, ey - 9, 20, 18, 4); g.fillStyle = '#39434d'; g.fill(); g.restore();
    g.fillStyle = '#566370'; g.fillRect(ex0 + 3, ey - 6, 3, 12);
    g.beginPath(); g.arc(BX.x - 2, ey, 3.2, 0, TAU); g.fillStyle = '#ff5a4f'; g.fill();
    g.strokeStyle = 'rgba(235,60,50,.9)'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(BX.x, ey); g.lineTo(BX.x + SS * 0.45, ey); g.stroke();
    g.fillStyle = 'rgba(235,60,50,.9)'; g.beginPath(); g.moveTo(BX.x + SS * 0.45 + 2, ey); g.lineTo(BX.x + SS * 0.45 - 5, ey - 4); g.lineTo(BX.x + SS * 0.45 - 5, ey + 4); g.closePath(); g.fill();
    if (s.pick) { g.beginPath(); g.arc(s.pick.x, s.pick.y, 9, 0, TAU); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke(); g.beginPath(); g.arc(s.pick.x, s.pick.y, 2.5, 0, TAU); g.fillStyle = ACCENT; g.fill(); }
    g.restore();
  },
  pointer(e, env) {
    if (e.type !== 'down') return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },
  footerStatus(env) { return env.state.pick ? 'Exit marked' : 'Click where the beam exits'; },
};

export function gate(m) {
  if (m && m.ext !== undefined) return m.board?.w === BOARD.w && m.board?.h === BOARD.h && extOk(m);
  if (m && m.view3d !== undefined) return problems3(m).length === 0;
  return m.board?.w === HB.board.w && m.board?.h === HB.board.h && m.panel?.panelWidth === HB.panel.panelWidth && m.panel?.boardH === HB.panel.boardH && hbOk(m);
}
function gateLayout(m) {
  return m.board?.w === BOARD.w && m.board?.h === BOARD.h && !('rounds' in m) && [m].every(r => {
    if (!Number.isInteger(r.emitterRow) || r.emitterRow < 0 || r.emitterRow >= ROWS || !Array.isArray(r.mirrors) || r.mirrors.length < HARD.minMirrors || r.mirrors.length > HARD.maxMirrors || r.tol !== HARD.tol) return false;
    if (!r.mirrors.every(q => Number.isInteger(q.c) && q.c >= 0 && q.c < COLS && Number.isInteger(q.r) && q.r >= 0 && q.r < ROWS && ['/', '\\'].includes(q.kind))) return false;
    if (new Set(r.mirrors.map(q => q.c + ',' + q.r)).size !== r.mirrors.length) return false;
    const sim = simulate(r.mirrors, r.emitterRow);
    return !!sim && sim.turns >= HARD.minTurns && sim.exit.x === r.exit?.x && sim.exit.y === r.exit?.y;
  });
}
