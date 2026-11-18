import { drawPromptText, UI_FONT } from '../core/panel.js';
import { projection, checkRound, sampleRound, sampleFixed, cameraFor, count, SKYLINES, FOOTPRINTS } from '../common/_front_view_paint_model.js';
import { splitIds, nthOf } from '../core/style.js';
import { mountFvpLook, drawSceneStyled } from '../common/_front_view_paint_look.js';
import * as M4 from '../common/_front_view_paint_grid4.js';

const BOARD4 = { w: 380, h: 440 }, SCENE4 = { x: 0, y: 0, w: 380, h: 250 }, GRID4 = { x: 196, y: 276, cell: 34 };
const BOARD = { w: 380, h: 400 };
const SCENE = { x: 0, y: 0, w: 380, h: 236 }, SCENE0 = SCENE;
const GRID = { x: 214, y: 266, cell: 38 };
const VIEW_NAME = { front: 'front', right: 'right', top: 'top', left: 'left', back: 'back' };
const is4 = (m) => !m?.ext && Array.isArray(m?.h) && m.h.length === M4.N;

const mirrorLR9 = (v) => { const n = Math.round(Math.sqrt(v.length)); return v.map((_, i) => v[Math.floor(i / n) * n + (n - 1 - (i % n))]); };
const canonKey = (view, target) => { const a = target.join(''), b = mirrorLR9(target).join(''); return `${view === 'top' ? 'top' : 'side'}|${a < b ? a : b}`; };
const SIDE_KEYS = [...new Set(SKYLINES.map((s) => canonKey('front', projection([[0, 0, 0], [0, 0, 0], s], 'front'))))];
const TOP_KEYS = [...new Set(FOOTPRINTS.map((f) => canonKey('top', f)))];
const sideSplit = splitIds('g14_fvp_skyline', SIDE_KEYS, 3), topSplit = splitIds('g14_fvp_footprint', TOP_KEYS, 8);
export const patternSplit = (view, target) => { const k = canonKey(view, target); return (view === 'top' ? topSplit : sideSplit)(k); };
const POOLS = {};
function poolsFor(split) {
  if (!POOLS[split]) POOLS[split] = {
    skylines: SKYLINES.filter((s) => sideSplit(canonKey('front', projection([[0, 0, 0], [0, 0, 0], s], 'front'))) === split),
    footprints: FOOTPRINTS.filter((f) => topSplit(canonKey('top', f)) === split),
  };
  return POOLS[split];
}
function mirrorRound(m) {
  return {
    ...m, h: m.h.map((row) => row.slice().reverse()), colors: m.colors.map((row) => row.slice().reverse()),
    cam: { ...m.cam, yaw: -m.cam.yaw }, view: m.view === 'right' ? 'left' : m.view === 'left' ? 'right' : m.view, target: mirrorLR9(m.target),
  };
}
function gateExt(m) {
  if (!['train', 'test'].includes(m.ext) || typeof m.mirror !== 'boolean' || !layoutOk(m.layout)) return false;
  if (m.mirror ? !['front', 'left', 'top'].includes(m.view) : !['front', 'right', 'top'].includes(m.view)) return false;
  if (!Array.isArray(m.target) || patternSplit(m.view, m.target) !== m.ext) return false;
  const base = m.mirror ? mirrorRound(m) : m;
  const coloursOk = Array.isArray(base.colors) && base.colors.length === 3 && base.colors.every((row, z) => Array.isArray(row) && row.length === 3
    && row.every((c, x) => (base.h?.[z]?.[x] > 0 ? Number.isInteger(c) && c >= 0 && c < TOY.length : c === -1)));
  return coloursOk && checkRound(base).length === 0;
}
function layoutExt(rng) {
  const sceneH = SCENE.h, top = rng.raw() < 0.5, cell = GRID.cell, left = rng.raw() < 0.5;
  const scene = { x: 0, y: top ? 0 : 400 - sceneH, w: 380, h: sceneH }, panel = { y: top ? sceneH : 0, h: 400 - sceneH };
  const W = 3 * cell, gx = left ? rng.int(64, 84) : 380 - W - rng.int(48, 70);
  const gy = panel.y + Math.max(16, Math.min(panel.h - W - 24, Math.round((panel.h - W) / 2) + rng.int(-6, 2)));
  return { scene, panel, grid: { x: gx, y: gy, cell }, textRight: left };
}
function layoutOk(L) {
  if (!L || !L.scene || !L.panel || !L.grid) return false;
  const { scene: S, panel: P, grid: G } = L, W = 3 * G.cell;
  if (S.x !== 0 || S.w !== 380 || S.h !== SCENE.h || P.h !== 400 - S.h || !(S.y === 0 ? P.y === S.h : S.y === P.h && P.y === 0)) return false;
  if (G.cell !== GRID.cell || G.x < 60 || G.x + W > 380 - 44) return false;
  return G.y >= P.y + 14 && G.y + W <= P.y + P.h - 22;
}
const layoutOf = (m) => (m && m.ext && m.layout ? m.layout : null);
const NO_SIDE = new Set(['003', '033', '300', '330']);
const NO_TOP = new Set(['000011010', '000011001', '000010011', '000001011', '000011011']);
const viewClass = (v) => (v === 'top' ? 'top' : v === 'front' ? 'front' : 'side');
export function semanticKey(m) { return `fvp|${viewClass(m.view)}|${canonKey(m.view, m.target)}`; }
const EVAL_KEYS = new Set([
  "fvp|front|side|000001111", "fvp|front|side|000011011", "fvp|front|side|001001011", "fvp|front|side|001111111", "fvp|front|side|010010011", "fvp|side|side|001001101", "fvp|side|side|010011011", "fvp|top|top|011001101", "fvp|top|top|011100010", "fvp|top|top|111001000",
]);
const SLOTS = {};
function slotsFor(split) {
  if (SLOTS[split]) return SLOTS[split];
  const groups = (list, view, bad) => {
    const g = new Map();
    for (const p of list) {
      const t = view === 'top' ? p : projection([[0, 0, 0], [0, 0, 0], p], 'front'), k = canonKey(view, t);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    }
    return [...g.entries()].filter(([, ms]) => !ms.some((p) => bad.has(p.join('')))).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  const P = poolsFor(split), side = groups(P.skylines, 'front', NO_SIDE), top = groups(P.footprints, 'top', NO_TOP);
  const classes = [['front', side], ['side', side], ['top', top]], order = [];
  for (let r = 0; r < Math.max(side.length, top.length); r++) {
    for (const [c, list0] of classes) {
      const list = list0.filter(([k]) => !EVAL_KEYS.has(`fvp|${c}|${k}`));
      if (r < list.length) order.push([c, list[nthOf(`front_view_paint|${split}|${c}`, r + 1, list.length)][1]]);
    }
  }
  return (SLOTS[split] = order);
}
function generateExt(rng, split, n) {
  if (Number.isFinite(n)) {
    const order = slotsFor(split), [cls, members] = order[(((n - 1) % order.length) + order.length) % order.length];
    for (let t = 0; t < 20; t++) {
      const round = sampleFixed(rng, cls === 'side' ? 'right' : cls, rng.pick(members), 300);
      if (!round) continue;
      let m = { task: 'front_view_paint', board: { ...BOARD }, ...round, colors: stackColours(rng, round.h) };
      const mirror = rng.raw() < 0.5;
      if (mirror) m = mirrorRound(m);
      m.ext = split; m.mirror = mirror; m.layout = layoutExt(rng);
      if (gateExt(m)) return m;
    }
  }
  for (let t = 0; t < 50; t++) {
    const round = sampleRound(rng, poolsFor(split));
    if (!round) continue;
    let m = { task: 'front_view_paint', board: { ...BOARD }, ...round, colors: stackColours(rng, round.h) };
    const mirror = rng.raw() < 0.5;
    if (mirror) m = mirrorRound(m);
    m.ext = split; m.mirror = mirror; m.layout = layoutExt(rng);
    if (gateExt(m)) return m;
  }
  throw new Error('front_view_paint: ext generator exhausted');
}

export function gate(m) {
  try {
    if (m && m.ext !== undefined) return m.task === 'front_view_paint' && m.board?.w === BOARD.w && m.board?.h === BOARD.h && gateExt(m);
    if (m?.task !== 'front_view_paint' || m.board?.w !== BOARD4.w || m.board?.h !== BOARD4.h || m.panel?.boardH !== BOARD4.h + 10 || !is4(m)) return false;
    const n = M4.N, coloursOk4 = Array.isArray(m.colors) && m.colors.length === n && m.colors.every((row, z) => Array.isArray(row) && row.length === n
      && row.every((c, x) => (m.h[z][x] > 0 ? Number.isInteger(c) && c >= 0 && c < TOY.length : c === -1)));
    return coloursOk4 && M4.checkRound(m).length === 0;
  } catch { return false; }
}
export function gate3(m) {
  try {
    if (m?.task !== 'front_view_paint' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
    const coloursOk = Array.isArray(m.colors) && m.colors.length === 3 && m.colors.every((row, z) => Array.isArray(row) && row.length === 3
      && row.every((c, x) => (m.h?.[z]?.[x] > 0 ? Number.isInteger(c) && c >= 0 && c < TOY.length : c === -1)));
    return coloursOk && checkRound(m).length === 0;
  } catch { return false; }
}

function cellAt(x, y, G = GRID, n = 3) {
  const c = Math.floor((x - G.x) / G.cell), r = Math.floor((y - G.y) / G.cell);
  return c >= 0 && c < n && r >= 0 && r < n ? r * n + c : -1;
}
const cellOf = (m, x, y) => { const LO = layoutOf(m); return LO ? cellAt(x, y, LO.grid) : is4(m) ? cellAt(x, y, GRID4, M4.N) : cellAt(x, y); };

const TOY = [[226, 76, 70], [246, 190, 40], [58, 124, 214], [64, 168, 92], [240, 132, 44], [150, 96, 196], [34, 166, 170], [232, 110, 168]];
const rgb = (c, f = 1) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v * f)))).join(',')})`;
function stackColours(rng, h) {
  const order = rng.shuffle(TOY.map((_, i) => i)), out = [[-1, -1, -1], [-1, -1, -1], [-1, -1, -1]];
  let k = 0;
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) if (h[z][x]) out[z][x] = order[k++ % order.length];
  return out;
}
function stackColours4(rng, h) {
  const n = h.length, out = h.map((row) => row.map(() => -1)), order = rng.shuffle(TOY.map((_, i) => i));
  let k = 0;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    if (!h[z][x]) continue;
    const near = new Set();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = out[z + dz]?.[x + dx]; if (c >= 0) near.add(c); }
    for (let t = 0; t < order.length; t++) { const c = order[(k + t) % order.length]; if (!near.has(c)) { out[z][x] = c; k = (k + t + 1) % order.length; break; } }
  }
  return out;
}

function fitProjector(m, SCENE = SCENE0) {
  const four = is4(m), cam = four ? M4.cameraFor(m) : cameraFor(m), pts = [], half = m.h.length / 2, E = half + 0.12;
  for (const x of [-E, E]) for (const z of [-E, E]) pts.push(cam.project({ x, y: -0.15, z }));
  const top = Math.min(m.h.length, Math.max(...m.h.flat()) + 0.6);
  for (const x of [-half, half]) for (const z of [-half, half]) pts.push(cam.project({ x, y: top, z }));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const padX = 20, padTop = 10, padBottom = 34;
  const s = Math.min((SCENE.w - 2 * padX) / (x1 - x0), (SCENE.h - padTop - padBottom) / (y1 - y0));
  const ox = SCENE.x + SCENE.w / 2 - s * (x0 + x1) / 2, oy = SCENE.y + padTop + (SCENE.h - padTop - padBottom) / 2 - s * (y0 + y1) / 2;
  return (p) => { const q = cam.project(p); return { x: ox + s * q.x, y: oy + s * q.y }; };
}

function poly(g, pts, fill, stroke, lw = 1.1) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}

function pill(g, x, y, text) {
  g.font = `700 11px ${UI_FONT}`;
  const w = g.measureText(text).width + 14, h = 19;
  g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - h / 2, w, h, 9.5) : g.rect(x - w / 2, y - h / 2, w, h);
  g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#51606e'; g.lineWidth = 1.3; g.stroke();
  g.fillStyle = '#2c3a47'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
}

function drawScene(g, m) {
  const SC = is4(m) ? SCENE4 : SCENE;
  const P = fitProjector(m, SC), h = m.h, right = m.cam.yaw > 0, n = h.length, half = n / 2;
  const bg = g.createLinearGradient(0, SC.y, 0, SC.y + SC.h);
  bg.addColorStop(0, '#f6f3ee'); bg.addColorStop(1, '#e7e1d7');
  g.fillStyle = bg; g.fillRect(SC.x, SC.y, SC.w, SC.h);
  const E = half + 0.12, T = -0.15;
  const c = (x, y, z) => P({ x, y, z });
  poly(g, [c(-E, 0, E), c(E, 0, E), c(E, T, E), c(-E, T, E)], '#a9b3bd', '#7f8b97');
  const sx = right ? E : -E;
  poly(g, [c(sx, 0, -E), c(sx, 0, E), c(sx, T, E), c(sx, T, -E)], '#95a0ab', '#7f8b97');
  poly(g, [c(-E, 0, -E), c(E, 0, -E), c(E, 0, E), c(-E, 0, E)], '#dde2e7', '#7f8b97', 1.3);
  g.strokeStyle = '#a7b1bb'; g.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    const k = i - half;
    let a = c(k, 0, -half), b = c(k, 0, half); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    a = c(-half, 0, k); b = c(half, 0, k); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  const xs = right ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
  for (const x of xs) for (let lv = 0; lv < n; lv++) for (let z = 0; z < n; z++) {
    if (h[z][x] <= lv) continue;
    const X0 = x - half, X1 = x - half + 1, Z0 = z - half, Z1 = z - half + 1, Y0 = lv, Y1 = lv + 1;
    const col = TOY[m.colors?.[z]?.[x] >= 0 ? m.colors[z][x] : 0], f = lv % 2 ? 0.95 : 1;
    const ink = '#2b333b';
    const zNext = z < n - 1 && h[z + 1][x] > lv, xNext = right ? x < n - 1 && h[z][x + 1] > lv : x > 0 && h[z][x - 1] > lv;
    if (!zNext) poly(g, [c(X0, Y0, Z1), c(X1, Y0, Z1), c(X1, Y1, Z1), c(X0, Y1, Z1)], rgb(col, 0.9 * f), ink);
    const XS = right ? X1 : X0;
    if (!xNext) poly(g, [c(XS, Y0, Z0), c(XS, Y0, Z1), c(XS, Y1, Z1), c(XS, Y1, Z0)], rgb(col, 0.7 * f), ink);
    if (h[z][x] === lv + 1) poly(g, [c(X0, Y1, Z0), c(X1, Y1, Z0), c(X1, Y1, Z1), c(X0, Y1, Z1)], rgb(col.map((v) => v + (255 - v) * 0.25)), ink);
  }
  const mid = c(0, T, 0);
  for (const [label, a, b] of [['Front', c(-E, T, E), c(E, T, E)], ['Right', c(E, T, E), c(E, T, -E)]]) {
    const ex = (a.x + b.x) / 2, ey = (a.y + b.y) / 2;
    let nx = -(b.y - a.y), ny = b.x - a.x; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx * (ex - mid.x) + ny * (ey - mid.y) < 0) { nx = -nx; ny = -ny; }
    pill(g, ex + nx * 15, ey + ny * 15, label);
  }
}

function drawAnswer(g, m, cells) {
  const four = is4(m), G = four ? GRID4 : GRID, SC = four ? SCENE4 : SCENE, BD = four ? BOARD4 : BOARD, n = four ? M4.N : 3;
  const { x: gx, y: gy, cell } = G, W = cell * n, view = m.view;
  g.fillStyle = '#f7f9fb'; g.fillRect(0, SC.y + SC.h, BD.w, BD.h - SC.h);
  g.strokeStyle = '#e1e6eb'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, SC.h + 0.5); g.lineTo(BD.w, SC.h + 0.5); g.stroke();
  g.fillStyle = '#2c3a47'; g.font = `700 13px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Your answer:', 16, SC.h + 17);
  g.fillText(`View from the ${VIEW_NAME[view]}`, 16, SC.h + 35);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), cc = i % n, x = gx + cc * cell, y = gy + r * cell;
    g.fillStyle = cells[i] ? '#4a5a6a' : '#ffffff'; g.fillRect(x, y, cell, cell);
    g.strokeStyle = cells[i] ? '#2f3b47' : '#b9c3cc'; g.lineWidth = 1.2; g.strokeRect(x + 0.6, y + 0.6, cell - 1.2, cell - 1.2);
  }
  g.strokeStyle = '#51606e'; g.lineWidth = 1.6; g.strokeRect(gx, gy, W, W);
  g.fillStyle = '#51606e'; g.font = `700 11px ${UI_FONT}`; g.textBaseline = 'middle';
  if (view === 'top') {
    g.textAlign = 'center'; g.fillText('Front', gx + W / 2, gy + W + 11); g.fillText('Back', gx + W / 2, gy - 8);
    g.textAlign = 'left'; g.fillText('Right', gx + W + 8, gy + W / 2);
    g.textAlign = 'right'; g.fillText('Left', gx - 8, gy + W / 2);
  } else {
    g.strokeStyle = '#51606e'; g.lineWidth = 3; g.beginPath(); g.moveTo(gx - 16, gy + W + 1.5); g.lineTo(gx + W + 16, gy + W + 1.5); g.stroke();
    g.fillStyle = '#8a96a2'; g.font = `11px ${UI_FONT}`; g.textAlign = 'center'; g.fillText('ground', gx + W / 2, gy + W + 12);
    g.fillStyle = '#51606e'; g.font = `700 11px ${UI_FONT}`;
    const [l, r] = view === 'front' ? ['Left', 'Right'] : view === 'back' ? ['Right', 'Left'] : view === 'left' ? ['Back', 'Front'] : ['Front', 'Back'];
    g.textAlign = 'right'; g.fillText(l, gx - 8, gy + W / 2);
    g.textAlign = 'left'; g.fillText(r, gx + W + 8, gy + W / 2);
  }
}

function drawAnswerAt(g, m, cells, L) {
  const { x: gx, y: gy, cell } = L.grid, W = cell * 3, view = m.view, P = L.panel;
  g.fillStyle = '#f7f9fb'; g.fillRect(0, P.y, BOARD.w, P.h);
  const ly = P.y === 0 ? P.h - 0.5 : P.y + 0.5;
  g.strokeStyle = '#e1e6eb'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, ly); g.lineTo(BOARD.w, ly); g.stroke();
  g.fillStyle = '#2c3a47'; g.font = `700 13px ${UI_FONT}`; g.textBaseline = 'middle';
  g.textAlign = L.textRight ? 'right' : 'left';
  const tx = L.textRight ? BOARD.w - 16 : 16;
  g.fillText('Your answer:', tx, P.y + 17);
  g.fillText(`View from the ${VIEW_NAME[view]}`, tx, P.y + 35);
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3), cc = i % 3, x = gx + cc * cell, y = gy + r * cell;
    g.fillStyle = cells[i] ? '#4a5a6a' : '#ffffff'; g.fillRect(x, y, cell, cell);
    g.strokeStyle = cells[i] ? '#2f3b47' : '#b9c3cc'; g.lineWidth = 1.2; g.strokeRect(x + 0.6, y + 0.6, cell - 1.2, cell - 1.2);
  }
  g.strokeStyle = '#51606e'; g.lineWidth = 1.6; g.strokeRect(gx, gy, W, W);
  g.fillStyle = '#51606e'; g.font = `700 11px ${UI_FONT}`; g.textBaseline = 'middle';
  if (view === 'top') {
    g.textAlign = 'center'; g.fillText('Front', gx + W / 2, gy + W + 11); g.fillText('Back', gx + W / 2, gy - 8);
    g.textAlign = 'left'; g.fillText('Right', gx + W + 8, gy + W / 2);
    g.textAlign = 'right'; g.fillText('Left', gx - 8, gy + W / 2);
  } else {
    g.strokeStyle = '#51606e'; g.lineWidth = 3; g.beginPath(); g.moveTo(gx - 16, gy + W + 1.5); g.lineTo(gx + W + 16, gy + W + 1.5); g.stroke();
    g.fillStyle = '#8a96a2'; g.font = `11px ${UI_FONT}`; g.textAlign = 'center'; g.fillText('ground', gx + W / 2, gy + W + 12);
    g.fillStyle = '#51606e'; g.font = `700 11px ${UI_FONT}`;
    const [l, r] = view === 'front' ? ['Left', 'Right'] : view === 'left' ? ['Back', 'Front'] : ['Front', 'Back'];
    g.textAlign = 'right'; g.fillText(l, gx - 8, gy + W / 2);
    g.textAlign = 'left'; g.fillText(r, gx + W + 8, gy + W / 2);
  }
}

const PROMPT = {
  front: 'Paint the view from the front',
  right: 'Paint the view from the right side',
  top: 'Paint the view from straight above',
  left: 'Paint the view from the left side',
  back: 'Paint the view from the back side',
};

const task = {
  meta: {
    name: 'front_view_paint', family: 'D', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    ability: ['SV', 'MOR'], primitive: ['click', 'multi_select'],
    actionSpace: [
      { op: 'set', cell: '0..15 (4x4 answer grid, row-major from its top-left)', on: '0|1' },
      { op: 'click', x: 'board px', y: 'board px (toggles the grid square under it)' },
    ],
    promptHuman: 'Paint the blocks as seen from the named side',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const round = M4.sampleRound(rng);
    if (!round) throw new Error('front_view_paint: no admissible arrangement');
    return { task: 'front_view_paint', board: { ...BOARD4 }, panel: { boardH: BOARD4.h + 10 }, ...round, colors: stackColours4(rng, round.h) };
  },

  init(m) { return { cells: new Array(m?.target?.length || 9).fill(0) }; },

  applyAction(s, a, m) {
    if (a?.op === 'set') {
      if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell >= m.target.length || (a.on !== 0 && a.on !== 1 && a.on !== true && a.on !== false)) return { ok: false, reason: 'bad-set' };
      s.cells[a.cell] = a.on ? 1 : 0; return { ok: true };
    }
    if (a?.op === 'click' && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      const i = cellOf(m, a.x, a.y);
      if (i < 0) return { ok: false, reason: 'outside-grid' };
      s.cells[i] = s.cells[i] ? 0 : 1; return { ok: true };
    }
    return { ok: false, reason: 'bad-action' };
  },

  verify(s, m) {
    const L = m.target.length, wrong = m.target.reduce((n, v, i) => n + (v !== s.cells[i] ? 1 : 0), 0);
    return { success: wrong === 0, partial: (L - wrong) / L, error: wrong, detail: { painted: count(s.cells) } };
  },

  oracle(m) { return m.target.map((v, cell) => (v ? { op: 'set', cell, on: 1 } : null)).filter(Boolean); },

  randomPolicy(m, rnd) { return Array.from({ length: m.target.length }, (_, cell) => ({ op: 'set', cell, on: rnd() < 0.5 ? 1 : 0 })); },

  async mount(env) { this._brush = null; if (env && env.style) env.assets.fvp = await mountFvpLook(env); },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, PROMPT[env.manifest.view], 'Fill each square where you would see a block');
  },

  drawBoard(g, br, env) {
    g.save(); g.translate(br.x, br.y);
    const BD = is4(env.manifest) ? BOARD4 : BOARD;
    g.beginPath(); g.rect(0, 0, BD.w, BD.h); g.clip();
    const LO = layoutOf(env.manifest);
    if (env.style && env.assets?.fvp) {
      const SC = LO ? LO.scene : SCENE;
      g.save(); g.beginPath(); g.rect(SC.x, SC.y, SC.w, SC.h); g.clip();
      drawSceneStyled(g, env.manifest, env.assets.fvp, { P: fitProjector(env.manifest, SC), SCENE: SC });
      g.restore();
      if (LO) drawAnswerAt(g, env.manifest, env.state.cells, LO); else drawAnswer(g, env.manifest, env.state.cells);
    } else {
      drawScene(g, env.manifest);
      drawAnswer(g, env.manifest, env.state.cells);
    }
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted) return [];
    if (e.type === 'down') {
      const i = cellOf(env.manifest, e.x, e.y);
      if (i < 0) { this._brush = null; return []; }
      const on = env.state.cells[i] ? 0 : 1;
      this._brush = { on, last: i };
      return [{ op: 'set', cell: i, on }];
    }
    if (e.type === 'move' && this._brush) {
      const i = cellOf(env.manifest, e.x, e.y);
      if (i < 0 || i === this._brush.last) return [];
      this._brush.last = i;
      return env.state.cells[i] === this._brush.on ? [] : [{ op: 'set', cell: i, on: this._brush.on }];
    }
    if (e.type === 'up') this._brush = null;
    return [];
  },

  footerStatus(env) {
    const n = count(env.state.cells);
    return `${n} filled · click or drag to paint`;
  },
};
export default task;
export { projection };
