import { DIRS, PROP, segCell, wallLen, WALL_YAW } from './_walk_to_photo_spot_room.js';
import { splitIds } from '../core/style.js';

const WALL_COLS = ['#ece6db', '#e7e1d4', '#e4e6de', '#ebe5dd', '#eee4d6'];
const ACCENTS = ['#7f9c8d', '#5f7d8f', '#b07a62', '#8e8fb3', '#c9a46a', '#6f8a6a', '#a35f5a'];
const FLOORS = [
  { dark: '#a3825f', light: '#d6bb95' }, { dark: '#8a6444', light: '#b88a5e' },
  { dark: '#b39a7c', light: '#e0ccb0' }, { dark: '#6e4f37', light: '#9c7350' },
];
const FABRICS = ['#5f7f96', '#b5674d', '#6e8f5e', '#c9a14a', '#8a6fa0', '#4f5d6e', '#a5584f', '#3f6f74', '#d1c4ad'];
const PILLOWS = ['#e2b13c', '#f0e6d2', '#c8553d', '#5b7fa6', '#e8a0a0', '#2f4f4f'];
const WOODS = ['#9b6e47', '#7a5236', '#b58a5c', '#5e4230', '#c19a6b'];
const DOORS = ['#8a5a3a', '#6d4a33', '#3f5f7a', '#a8443a', '#b9875a', '#4f6b4f', '#ece8df'];
const RUGS = [
  ['#b9583f', '#e9dcc4', '#7a3a2c'], ['#3f5f7a', '#e6dcc8', '#22384c'], ['#c9a46a', '#5a4632', '#8a6a3a'],
  ['#6f8a6a', '#ece4d2', '#41583f'], ['#8e5a7a', '#eadfd0', '#5a3550'], ['#d7cbb5', '#7c6a52', '#a8987c'],
];
const FRAMES = ['#2b2622', '#c9a35a', '#f2efe8', '#5a3d2b', '#1f2a36'];
const ARTS = [
  ['#c8553d', '#e8c26a', '#2f5d7c', '#efe6d2'], ['#9cc3de', '#6f9a55', '#3f6a3a', '#f4d27a'],
  ['#e9e2d0', '#d9893f', '#3b5e6e', '#b3402f'], ['#2f3a48', '#e0b23e', '#c8d6dc', '#a5584f'],
  ['#f0d9b5', '#7aa6a1', '#d26a4c', '#2f4f4f'], ['#c7d9e8', '#8aa66b', '#5b7d4b', '#f2b84b'],
];
const POTS = ['#c0714f', '#e8e2d6', '#3f4a52', '#b89a5a'];
const VASES = ['#c8553d', '#3f7cc0', '#e0b23e', '#2f6f6a', '#e8e2d6'];

const key = (c, r) => `${c},${r}`;

export function sampleRoom(rng) {
  const W = rng.pick([5, 6]), D = rng.pick([5, 6]);
  const m = {
    room: {
      W, D, wall: rng.pick(WALL_COLS), accent: null, floor: { ...rng.pick(FLOORS), alongX: rng.raw() < 0.5 },
      feats: [], rugs: [],
    },
    props: [],
  };
  if (rng.raw() < 0.6) m.room.accent = { w: rng.int(0, 3), col: rng.pick(ACCENTS) };
  const inRoom = (c, r) => c >= 0 && r >= 0 && c < W && r < D;
  const occ = new Map(), reserved = new Set(), segUse = new Map();
  const sk = (w, s) => `${w},${s}`;
  const len = (w) => wallLen(m, w);
  const feat = (f) => { f.fid = m.room.feats.length; m.room.feats.push(f); return f; };

  const dw = rng.int(0, 3), ds = rng.int(1, len(dw) - 2);
  feat({ kind: 'door', w: dw, u0: ds + 0.5 - 0.46, u1: ds + 0.5 + 0.46, y0: 0, y1: 2.05, col: rng.pick(DOORS), hinge: rng.int(0, 1) });
  segUse.set(sk(dw, ds), 'door');
  reserved.add(key(...segCell(m, dw, ds)));
  const nWin = rng.raw() < 0.8 ? 2 : 1;
  const winHW = rng.uniform(0.5, 0.66);
  for (let k = 0, t = 0; k < nWin && t < 40; t++) {
    const w = rng.int(0, 3), s = rng.int(0, len(w) - 1);
    if ([s - 1, s, s + 1].some((q) => ['door', 'window'].includes(segUse.get(sk(w, q))))) continue;
    if (w === dw && Math.abs(s - ds) < 2) continue;
    if (m.room.feats.some((f) => f.kind === 'window' && f.w === w)) continue;
    const hw = winHW, c = s + 0.5;
    feat({ kind: 'window', w, u0: Math.max(0.22, c - hw), u1: Math.min(len(w) - 0.22, c + hw), y0: 0.95, y1: 2.15 });
    segUse.set(sk(w, s), 'window');
    for (const q of [s - 1, s + 1]) if (q >= 0 && q < len(w) && !segUse.has(sk(w, q))) segUse.set(sk(w, q), 'winEdge');
    k++;
  }

  const free = (c, r) => inRoom(c, r) && !occ.has(key(c, r)) && !reserved.has(key(c, r));
  const addProp = (p, cells) => { p.id = m.props.length; p.cells = cells; m.props.push(p); for (const [c, r] of cells) occ.set(key(c, r), p.id); return p; };
  const wallPos = (w, u, d) => (w === 0 ? [u, d] : w === 1 ? [W - d, u] : w === 2 ? [W - u, D - d] : [d, D - u]);
  const has = (t) => m.props.find((p) => p.type === t);
  function placeWall(type, extra, prefer = null) {
    const P = PROP[type], cands = [];
    for (let w = 0; w < 4; w++) for (let s = 0; s + P.span <= len(w); s++) {
      const segs = Array.from({ length: P.span }, (_, i) => s + i);
      const cells = segs.map((q) => segCell(m, w, q));
      if (!cells.every(([c, r]) => free(c, r))) continue;
      const uses = segs.map((q) => segUse.get(sk(w, q)));
      if (uses.includes('door')) continue;
      if (P.tall && uses.some((u) => u === 'window' || u === 'winEdge')) continue;
      cands.push({ w, s, cells, wt: prefer ? prefer(w, s) : 1 });
    }
    if (!cands.length) return null;
    let tot = cands.reduce((a, c) => a + c.wt, 0), x = rng.raw() * tot, pick = cands[cands.length - 1];
    for (const c of cands) { x -= c.wt; if (x <= 0) { pick = c; break; } }
    const u = pick.s + P.span / 2, [x0, z0] = wallPos(pick.w, u, P.depth / 2 + 0.03);
    return addProp({ type, x: x0, z: z0, yaw: WALL_YAW[pick.w], wall: pick.w, seg: pick.s, ...extra }, pick.cells);
  }
  const wallCount = (c, r) => (c === 0) + (r === 0) + (c === W - 1) + (r === D - 1);
  function placeFree(type, extra, weight) {
    const cands = [];
    for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) if (free(c, r)) { const wt = weight(c, r); if (wt > 0) cands.push({ c, r, wt }); }
    if (!cands.length) return null;
    let tot = cands.reduce((a, q) => a + q.wt, 0), x = rng.raw() * tot, pick = cands[cands.length - 1];
    for (const q of cands) { x -= q.wt; if (x <= 0) { pick = q; break; } }
    let x0 = pick.c + 0.5, z0 = pick.r + 0.5;
    const nudge = type === 'plant' || type === 'lamp' ? 0.12 : 0;
    if (pick.c === 0) x0 -= nudge; if (pick.c === W - 1) x0 += nudge;
    if (pick.r === 0) z0 -= nudge; if (pick.r === D - 1) z0 += nudge;
    return addProp({ type, x: x0, z: z0, yaw: 0, ...extra }, [[pick.c, pick.r]]);
  }
  const nearProp = (p, c, r) => p && p.cells.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) === 1);

  const fabrics = rng.shuffle(FABRICS);
  const sofaP = rng.raw() < 0.85 ? placeWall('sofa', { col: fabrics[0], pillow: rng.pick(PILLOWS) }) : null;
  let coffee = null;
  if (sofaP && rng.raw() < 0.85) {
    const inw = [[0, 1], [-1, 0], [0, -1], [1, 0]][sofaP.wall];
    const cells = sofaP.cells.map(([c, r]) => [c + inw[0], r + inw[1]]);
    if (cells.every(([c, r]) => free(c, r))) {
      coffee = addProp({ type: 'coffee', x: sofaP.x + inw[0] * 1.12, z: sofaP.z + inw[1] * 1.12, yaw: sofaP.yaw, col: rng.pick(WOODS), vase: rng.pick(VASES), long: true }, cells);
      const ux = Math.abs(inw[1]) ? 1 : 0;
      const cx = coffee.x, cz = coffee.z, ha = 1.35, hb = 0.9;
      const [hx, hz] = ux ? [ha, hb] : [hb, ha];
      m.room.rugs.push({ x0: Math.max(0.12, cx - hx), x1: Math.min(W - 0.12, cx + hx), z0: Math.max(0.12, cz - hz), z1: Math.min(D - 0.12, cz + hz), style: rng.int(0, 2), cols: rng.pick(RUGS), along: !!ux });
    }
  }
  if (rng.raw() < 0.7) {
    const ap = placeFree('armchair', { col: fabrics[1], pillow: null }, (c, r) => (coffee ? (nearProp(coffee, c, r) && !nearProp(sofaP, c, r) ? 4 : 0) : (wallCount(c, r) === 1 ? 1 : 0)));
    if (ap) {
      const t = coffee || { x: W / 2, z: D / 2 };
      ap.yaw = Math.round((Math.atan2(t.x - ap.x, t.z - ap.z) * 180 / Math.PI) / 5) * 5;
    }
  }
  if (rng.raw() < 0.55) placeWall('tv', { col: rng.pick(WOODS) }, sofaP ? (w) => (w === (sofaP.wall + 2) % 4 ? 6 : 1) : null);
  if (rng.raw() < 0.7) placeWall('shelf', { col: rng.pick(WOODS), v: rng.int(0, 6) });
  if (rng.raw() < 0.45) placeWall('cabinet', { col: rng.pick(['#e8e2d6', '#5f7d8f', '#2f3a48', '#c9b79c', '#7a5236']), vase: rng.pick(VASES), flower: rng.pick(['#e05a6a', '#f2b84b', '#8e6fc0']) });
  if (rng.raw() < 0.3) placeWall('desk', { col: rng.pick(WOODS), seat: rng.pick(FABRICS) });
  const nPlants = rng.raw() < 0.4 ? 2 : 1, pots = rng.shuffle(POTS);
  for (let k = 0; k < nPlants; k++) {
    placeFree('plant', { v: rng.int(0, 9), scale: k ? 0.8 : 1.05, pot: pots[k], leaf: k ? '#5f9a4a' : '#4e8f45', leaf2: k ? '#7fae5a' : '#3d7a3a' },
      (c, r) => (wallCount(c, r) >= 2 ? 4 : wallCount(c, r) === 1 ? 1 : 0));
  }
  if (rng.raw() < 0.65) {
    const col = rng.pick(['#efe2c4', '#f3ead8', '#e9d3b0']);
    const l1 = placeFree('lamp', { col }, (c, r) => (wallCount(c, r) >= 1 ? (nearProp(sofaP, c, r) || nearProp(has('armchair'), c, r) ? 5 : 1) : 0));
    if (l1) placeFree('lamp', { col }, (c, r) => (wallCount(c, r) >= 1 && Math.abs(c - l1.cells[0][0]) + Math.abs(r - l1.cells[0][1]) >= 3 ? 1 : 0));
  } else if (rng.raw() < 0.55) placeFree('lamp', { col: rng.pick(['#efe2c4', '#f3ead8', '#e9d3b0']) }, (c, r) => (wallCount(c, r) >= 1 ? (nearProp(sofaP, c, r) || nearProp(has('armchair'), c, r) ? 5 : 1) : 0));
  if (rng.raw() < 0.35) placeFree('side', { col: rng.pick(WOODS), lamp: rng.pick(VASES) }, (c, r) => (nearProp(sofaP, c, r) || nearProp(has('armchair'), c, r) ? 3 : wallCount(c, r) >= 1 ? 0.5 : 0));
  if (m.props.length < 5) return null;

  const freeCells = [];
  for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) if (!occ.has(key(c, r))) freeCells.push([c, r]);
  if (freeCells.length < 13) return null;
  const seen = new Set([key(...freeCells[0])]), q = [freeCells[0]];
  while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of DIRS) { const k = key(c + dc, r + dr); if (inRoom(c + dc, r + dr) && !occ.has(k) && !seen.has(k)) { seen.add(k); q.push([c + dc, r + dr]); } } }
  if (seen.size !== freeCells.length) return null;

  const styles = rng.shuffle([0, 1, 2, 3]), arts = rng.shuffle(ARTS);
  let nArt = 0;
  const art = () => { const k = nArt++; return { style: styles[k % 4], cols: arts[k % arts.length] }; };
  const lowOK = (w, s) => { const [c, r] = segCell(m, w, s), id = occ.get(key(c, r)); return id === undefined || ['sofa', 'cabinet', 'desk', 'armchair', 'side', 'coffee'].includes(m.props[id].type); };
  if (sofaP && rng.raw() < 0.6) {
    const u = sofaP.seg + 1, hw = rng.uniform(0.38, 0.55), hh = rng.uniform(0.24, 0.32), cy = 1.62;
    feat({ kind: 'pic', w: sofaP.wall, u0: u - hw, u1: u + hw, y0: cy - hh, y1: cy + hh, frame: rng.pick(FRAMES), ...art(), a: rng.uniform(0.3, 0.7), b: rng.uniform(0.3, 0.6) });
    segUse.set(sk(sofaP.wall, sofaP.seg), 'pic'); segUse.set(sk(sofaP.wall, sofaP.seg + 1), 'pic');
  }
  const slots = [];
  for (let w = 0; w < 4; w++) for (let s = 0; s < len(w); s++) if (!segUse.has(sk(w, s)) && lowOK(w, s)) slots.push([w, s]);
  const nPic = rng.int(1, 2);
  for (const [w, s] of rng.shuffle(slots)) {
    if (m.room.feats.filter((f) => f.kind === 'pic').length >= nPic + (sofaP ? 1 : 0)) break;
    if (segUse.has(sk(w, s)) || segUse.get(sk(w, s - 1)) === 'pic' || segUse.get(sk(w, s + 1)) === 'pic') continue;
    const hw = rng.uniform(0.22, 0.36), hh = rng.uniform(0.2, 0.3), cu = s + 0.5 + rng.uniform(-0.1, 0.1), cy = rng.uniform(1.5, 1.62);
    feat({ kind: 'pic', w, u0: cu - hw, u1: cu + hw, y0: cy - hh, y1: cy + hh, frame: rng.pick(FRAMES), ...art(), a: rng.uniform(0.3, 0.7), b: rng.uniform(0.3, 0.6) });
    segUse.set(sk(w, s), 'pic');
  }
  if (rng.raw() < 0.45) {
    const rest = slots.filter(([w, s]) => !segUse.has(sk(w, s)));
    if (rest.length) {
      const [w, s] = rng.pick(rest), r = 0.17;
      feat({ kind: 'clock', w, u0: s + 0.5 - r, u1: s + 0.5 + r, y0: 1.95 - r, y1: 1.95 + r, frame: rng.pick(['#2b2f35', '#b89a5a', '#7a5236']), hA: rng.uniform(0, 6.28), mA: rng.uniform(0, 6.28) });
      segUse.set(sk(w, s), 'clock');
    }
  }
  if (!coffee && rng.raw() < 0.6) {
    const cx = W / 2 + rng.uniform(-0.5, 0.5), cz = D / 2 + rng.uniform(-0.5, 0.5), hx = rng.uniform(0.9, 1.3), hz = rng.uniform(0.7, 1.0);
    m.room.rugs.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, style: rng.int(0, 2), cols: rng.pick(RUGS), along: rng.raw() < 0.5 });
  }
  m.free = freeCells;
  return m;
}

const WALL_IN_X = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export const EXT_THEMES = ['living', 'bedroom', 'study', 'kitchen'];
const THEME_SPLIT = splitIds('g09_walk_theme', EXT_THEMES.slice(1), 1);
export const themesFor = (split) => EXT_THEMES.filter((t) => t === 'living' || THEME_SPLIT(t) === split);
const NEW_COL_SPLIT = splitIds('g09_walk_colour', ['#8a9a7b', '#f2efe8', '#e8e8e4', '#c4c9cf', '#2f3338', '#d9d2c3', '#9fb7c9', '#e8e4dc', '#3a3f45', '#b8a48a', '#f2f0ea', '#6b6f73'], 3);
const colsFor = (list, split) => { const a = list.filter((c) => NEW_COL_SPLIT(c) === split); return a.length ? a : list; };
const CAB_ALL = ['#e8e2d6', '#5f7d8f', '#2f3a48', '#c9b79c', '#7a5236', '#8a9a7b', '#f2efe8'];
const FRIDGE_ALL = ['#e8e8e4', '#c4c9cf', '#2f3338', '#d9d2c3', '#9fb7c9'];
const TOP_ALL = ['#e8e4dc', '#3a3f45', '#b8a48a', '#f2f0ea', '#6b6f73'];
export function sampleRoomExt(rng, theme, split = 'train') {
  const CAB_COLS = [...CAB_ALL.slice(0, 5), ...CAB_ALL.slice(5).filter((c) => NEW_COL_SPLIT(c) === split)];
  const FRIDGE_COLS = colsFor(FRIDGE_ALL, split), TOP_COLS = colsFor(TOP_ALL, split);
  const W = rng.pick([5, 6]), D = rng.pick([5, 6]);
  const m = {
    room: {
      W, D, wall: rng.pick(WALL_COLS), accent: null, floor: { ...rng.pick(FLOORS), alongX: rng.raw() < 0.5 },
      feats: [], rugs: [], theme,
    },
    props: [],
  };
  if (rng.raw() < 0.6) m.room.accent = { w: rng.int(0, 3), col: rng.pick(ACCENTS) };
  const inRoom = (c, r) => c >= 0 && r >= 0 && c < W && r < D;
  const occ = new Map(), reserved = new Set(), segUse = new Map();
  const sk = (w, s) => `${w},${s}`;
  const len = (w) => wallLen(m, w);
  const feat = (f) => { f.fid = m.room.feats.length; m.room.feats.push(f); return f; };
  const dw = rng.int(0, 3), ds = rng.int(1, len(dw) - 2);
  feat({ kind: 'door', w: dw, u0: ds + 0.5 - 0.46, u1: ds + 0.5 + 0.46, y0: 0, y1: 2.05, col: rng.pick(DOORS), hinge: rng.int(0, 1) });
  segUse.set(sk(dw, ds), 'door');
  reserved.add(key(...segCell(m, dw, ds)));
  const nWin = rng.raw() < 0.45 ? 2 : 1;
  for (let k = 0, t = 0; k < nWin && t < 40; t++) {
    const w = rng.int(0, 3), s = rng.int(0, len(w) - 1);
    if ([s - 1, s, s + 1].some((q) => ['door', 'window'].includes(segUse.get(sk(w, q))))) continue;
    if (w === dw && Math.abs(s - ds) < 2) continue;
    if (m.room.feats.some((f) => f.kind === 'window' && f.w === w)) continue;
    const hw = rng.uniform(0.5, 0.66), c = s + 0.5;
    feat({ kind: 'window', w, u0: Math.max(0.22, c - hw), u1: Math.min(len(w) - 0.22, c + hw), y0: 0.95, y1: 2.15 });
    segUse.set(sk(w, s), 'window');
    for (const q of [s - 1, s + 1]) if (q >= 0 && q < len(w) && !segUse.has(sk(w, q))) segUse.set(sk(w, q), 'winEdge');
    k++;
  }
  const free = (c, r) => inRoom(c, r) && !occ.has(key(c, r)) && !reserved.has(key(c, r));
  const addProp = (p, cells) => { p.id = m.props.length; p.cells = cells; m.props.push(p); for (const [c, r] of cells) occ.set(key(c, r), p.id); return p; };
  const wallPos = (w, u, d) => (w === 0 ? [u, d] : w === 1 ? [W - d, u] : w === 2 ? [W - u, D - d] : [d, D - u]);
  const has = (t) => m.props.find((p) => p.type === t);
  function placeWall(type, extra, prefer = null) {
    const P = PROP[type], rows = P.rows || 1, cands = [];
    for (let w = 0; w < 4; w++) for (let s = 0; s + P.span <= len(w); s++) {
      const segs = Array.from({ length: P.span }, (_, i) => s + i);
      const cells = [];
      for (const q of segs) { const [c0, r0] = segCell(m, w, q); for (let d = 0; d < rows; d++) cells.push([c0 + WALL_IN_X[w][0] * d, r0 + WALL_IN_X[w][1] * d]); }
      if (!cells.every(([c, r]) => free(c, r))) continue;
      const uses = segs.map((q) => segUse.get(sk(w, q)));
      if (uses.includes('door')) continue;
      if (P.tall && uses.some((u) => u === 'window' || u === 'winEdge')) continue;
      cands.push({ w, s, cells, wt: prefer ? prefer(w, s) : 1 });
    }
    const pool = cands.filter((c) => c.wt > 0);
    if (!pool.length) return null;
    let tot = pool.reduce((a, c) => a + c.wt, 0), x = rng.raw() * tot, pick = pool[pool.length - 1];
    for (const c of pool) { x -= c.wt; if (x <= 0) { pick = c; break; } }
    const u = pick.s + P.span / 2, [x0, z0] = wallPos(pick.w, u, P.depth / 2 + 0.03);
    return addProp({ type, x: x0, z: z0, yaw: WALL_YAW[pick.w], wall: pick.w, seg: pick.s, ...extra }, pick.cells);
  }
  const wallCount = (c, r) => (c === 0) + (r === 0) + (c === W - 1) + (r === D - 1);
  function placeFree(type, extra, weight) {
    const cands = [];
    for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) if (free(c, r)) { const wt = weight(c, r); if (wt > 0) cands.push({ c, r, wt }); }
    if (!cands.length) return null;
    let tot = cands.reduce((a, q) => a + q.wt, 0), x = rng.raw() * tot, pick = cands[cands.length - 1];
    for (const q of cands) { x -= q.wt; if (x <= 0) { pick = q; break; } }
    let x0 = pick.c + 0.5, z0 = pick.r + 0.5;
    const nudge = type === 'plant' || type === 'lamp' ? 0.12 : 0;
    if (pick.c === 0) x0 -= nudge; if (pick.c === W - 1) x0 += nudge;
    if (pick.r === 0) z0 -= nudge; if (pick.r === D - 1) z0 += nudge;
    return addProp({ type, x: x0, z: z0, yaw: 0, ...extra }, [[pick.c, pick.r]]);
  }
  const nearProp = (p, c, r) => p && p.cells.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) === 1);
  const sameWallNext = (p) => (w, s) => (p && w === p.wall && (s === p.seg - 1 || s === p.seg + PROP[p.type].span) ? 8 : 0.4);
  const fabrics = rng.shuffle(FABRICS);
  let sofaP = null, coffee = null, anchor = null;
  if (theme === 'living') {
    sofaP = rng.raw() < 0.9 ? placeWall('sofa', { col: fabrics[0], pillow: rng.pick(PILLOWS) }) : null;
    if (sofaP && rng.raw() < 0.85) {
      const inw = WALL_IN_X[sofaP.wall];
      const cells = sofaP.cells.map(([c, r]) => [c + inw[0], r + inw[1]]);
      if (cells.every(([c, r]) => free(c, r))) {
        coffee = addProp({ type: 'coffee', x: sofaP.x + inw[0] * 1.12, z: sofaP.z + inw[1] * 1.12, yaw: sofaP.yaw, col: rng.pick(WOODS), vase: rng.pick(VASES), long: true }, cells);
        const ux = Math.abs(inw[1]) ? 1 : 0, cx = coffee.x, cz = coffee.z, ha = 1.35, hb = 0.9;
        const [hx, hz] = ux ? [ha, hb] : [hb, ha];
        m.room.rugs.push({ x0: Math.max(0.12, cx - hx), x1: Math.min(W - 0.12, cx + hx), z0: Math.max(0.12, cz - hz), z1: Math.min(D - 0.12, cz + hz), style: rng.int(0, 2), cols: rng.pick(RUGS), along: !!ux });
      }
    }
    if (rng.raw() < 0.7) {
      const ap = placeFree('armchair', { col: fabrics[1], pillow: null }, (c, r) => (coffee ? (nearProp(coffee, c, r) && !nearProp(sofaP, c, r) ? 4 : 0) : (wallCount(c, r) === 1 ? 1 : 0)));
      if (ap) { const t = coffee || { x: W / 2, z: D / 2 }; ap.yaw = Math.round((Math.atan2(t.x - ap.x, t.z - ap.z) * 180 / Math.PI) / 5) * 5; }
    }
    if (rng.raw() < 0.6) placeWall('tv', { col: rng.pick(WOODS) }, sofaP ? (w) => (w === (sofaP.wall + 2) % 4 ? 6 : 1) : null);
    if (rng.raw() < 0.7) placeWall('shelf', { col: rng.pick(WOODS), v: rng.int(0, 6) });
    if (rng.raw() < 0.45) placeWall('cabinet', { col: rng.pick(CAB_COLS), vase: rng.pick(VASES), flower: rng.pick(['#e05a6a', '#f2b84b', '#8e6fc0']) });
    anchor = sofaP;
  } else if (theme === 'bedroom') {
    const bedP = placeWall('bed', { col: rng.pick(WOODS), duvet: fabrics[0], pillow: rng.pick(['#f4f1ea', ...PILLOWS]) });
    if (!bedP) return null;
    if (rng.raw() < 0.85) placeWall('nightstand', { col: bedP.col, lamp: rng.pick(VASES) }, sameWallNext(bedP));
    if (rng.raw() < 0.5) placeWall('nightstand', { col: bedP.col, lamp: rng.pick(VASES) }, sameWallNext(bedP));
    if (rng.raw() < 0.85) placeWall('wardrobe', { col: rng.pick(CAB_COLS) }, (w) => (w === bedP.wall ? 0.3 : 1));
    if (rng.raw() < 0.5) placeWall('cabinet', { col: rng.pick(CAB_COLS), vase: rng.pick(VASES), flower: rng.pick(['#e05a6a', '#f2b84b', '#8e6fc0']) });
    if (rng.raw() < 0.35) placeWall('desk', { col: rng.pick(WOODS), seat: rng.pick(FABRICS) });
    if (rng.raw() < 0.4) placeFree('armchair', { col: fabrics[1], pillow: null, yaw: 0 }, (c, r) => (wallCount(c, r) >= 1 && !nearProp(bedP, c, r) ? 1 : 0));
    anchor = bedP;
  } else if (theme === 'study') {
    const deskP = placeWall('desk', { col: rng.pick(WOODS), seat: rng.pick(FABRICS) });
    if (!deskP) return null;
    placeWall('shelf', { col: rng.pick(WOODS), v: rng.int(0, 6) });
    if (rng.raw() < 0.75) placeWall('shelf', { col: rng.pick(WOODS), v: rng.int(0, 6) });
    if (rng.raw() < 0.5) placeWall('cabinet', { col: rng.pick(CAB_COLS), vase: rng.pick(VASES), flower: rng.pick(['#e05a6a', '#f2b84b', '#8e6fc0']) });
    if (rng.raw() < 0.6) {
      const ap = placeFree('armchair', { col: fabrics[1], pillow: rng.raw() < 0.5 ? rng.pick(PILLOWS) : null }, (c, r) => (wallCount(c, r) === 1 ? 1 : 0));
      if (ap) ap.yaw = Math.round((Math.atan2(W / 2 - ap.x, D / 2 - ap.z) * 180 / Math.PI) / 5) * 5;
    }
    if (rng.raw() < 0.5) placeFree('ochair', { col: fabrics[2] }, (c, r) => (wallCount(c, r) === 0 ? 1 : 0.2));
    if (rng.raw() < 0.4) placeWall('tv', { col: rng.pick(WOODS) });
    anchor = deskP;
  } else {
    const cnt = placeWall('counter', { col: rng.pick(CAB_COLS), top: rng.pick(TOP_COLS) });
    if (!cnt) return null;
    placeWall('fridge', { col: rng.pick(FRIDGE_COLS) }, sameWallNext(cnt));
    const din = placeFree('dining', { col: rng.pick(WOODS), seat: fabrics[0], vase: rng.pick(VASES), yaw: rng.pick([0, 90]) }, (c, r) => (wallCount(c, r) === 0 ? 3 : 0.3));
    if (din && rng.raw() < 0.5) m.room.rugs.push({ x0: Math.max(0.12, din.x - 0.95), x1: Math.min(W - 0.12, din.x + 0.95), z0: Math.max(0.12, din.z - 0.95), z1: Math.min(D - 0.12, din.z + 0.95), style: rng.int(0, 2), cols: rng.pick(RUGS), along: rng.raw() < 0.5 });
    if (rng.raw() < 0.6) placeWall('cabinet', { col: cnt.col, vase: rng.pick(VASES), flower: rng.pick(['#e05a6a', '#f2b84b', '#8e6fc0']) });
    if (rng.raw() < 0.5) placeWall('shelf', { col: rng.pick(WOODS), v: rng.int(0, 6) });
    if (rng.raw() < 0.4) placeFree('side', { col: rng.pick(WOODS), lamp: rng.pick(VASES) }, (c, r) => (wallCount(c, r) >= 1 ? 1 : 0));
    anchor = cnt;
  }
  const nPlants = rng.raw() < 0.5 ? 2 : 1, pots = rng.shuffle(POTS);
  for (let k = 0; k < nPlants; k++) {
    placeFree('plant', { v: rng.int(0, 9), scale: k ? 0.8 : 1.05, pot: pots[k], leaf: k ? '#5f9a4a' : '#4e8f45', leaf2: k ? '#7fae5a' : '#3d7a3a' },
      (c, r) => (wallCount(c, r) >= 2 ? 4 : wallCount(c, r) === 1 ? 1 : 0));
  }
  if (rng.raw() < 0.55) placeFree('lamp', { col: rng.pick(['#efe2c4', '#f3ead8', '#e9d3b0']) }, (c, r) => (wallCount(c, r) >= 1 ? (nearProp(anchor, c, r) ? 5 : 1) : 0));
  if (m.props.length < 5) return null;
  const freeCells = [];
  for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) if (!occ.has(key(c, r))) freeCells.push([c, r]);
  if (freeCells.length < 13) return null;
  const seen = new Set([key(...freeCells[0])]), q = [freeCells[0]];
  while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of DIRS) { const k = key(c + dc, r + dr); if (inRoom(c + dc, r + dr) && !occ.has(k) && !seen.has(k)) { seen.add(k); q.push([c + dc, r + dr]); } } }
  if (seen.size !== freeCells.length) return null;
  const styles = rng.shuffle([0, 1, 2, 3]), arts = rng.shuffle(ARTS);
  let nArt = 0;
  const art = () => { const k = nArt++; return { style: styles[k % 4], cols: arts[k % arts.length] }; };
  const LOW = ['sofa', 'cabinet', 'desk', 'armchair', 'side', 'coffee', 'bed', 'nightstand', 'dining', 'ochair'];
  const lowOK = (w, s) => { const [c, r] = segCell(m, w, s), id = occ.get(key(c, r)); return id === undefined || LOW.includes(m.props[id].type); };
  if (anchor && ['sofa', 'bed'].includes(anchor.type) && rng.raw() < 0.6) {
    const u = anchor.seg + 1, hw = rng.uniform(0.38, 0.55), hh = rng.uniform(0.2, 0.28), cy = anchor.type === 'bed' ? 1.72 : 1.62;
    feat({ kind: 'pic', w: anchor.wall, u0: u - hw, u1: u + hw, y0: cy - hh, y1: cy + hh, frame: rng.pick(FRAMES), ...art(), a: rng.uniform(0.3, 0.7), b: rng.uniform(0.3, 0.6) });
    segUse.set(sk(anchor.wall, anchor.seg), 'pic'); segUse.set(sk(anchor.wall, anchor.seg + 1), 'pic');
  }
  const slots = [];
  for (let w = 0; w < 4; w++) for (let s = 0; s < len(w); s++) if (!segUse.has(sk(w, s)) && lowOK(w, s)) slots.push([w, s]);
  const nPic = rng.int(1, 2), base = m.room.feats.filter((f) => f.kind === 'pic').length;
  for (const [w, s] of rng.shuffle(slots)) {
    if (m.room.feats.filter((f) => f.kind === 'pic').length >= nPic + base) break;
    if (segUse.has(sk(w, s)) || segUse.get(sk(w, s - 1)) === 'pic' || segUse.get(sk(w, s + 1)) === 'pic') continue;
    const hw = rng.uniform(0.22, 0.36), hh = rng.uniform(0.2, 0.3), cu = s + 0.5 + rng.uniform(-0.1, 0.1), cy = rng.uniform(1.5, 1.62);
    feat({ kind: 'pic', w, u0: cu - hw, u1: cu + hw, y0: cy - hh, y1: cy + hh, frame: rng.pick(FRAMES), ...art(), a: rng.uniform(0.3, 0.7), b: rng.uniform(0.3, 0.6) });
    segUse.set(sk(w, s), 'pic');
  }
  if (rng.raw() < 0.5) {
    const rest = slots.filter(([w, s]) => !segUse.has(sk(w, s)));
    if (rest.length) {
      const [w, s] = rng.pick(rest), r = 0.17;
      feat({ kind: 'clock', w, u0: s + 0.5 - r, u1: s + 0.5 + r, y0: 1.95 - r, y1: 1.95 + r, frame: rng.pick(['#2b2f35', '#b89a5a', '#7a5236']), hA: rng.uniform(0, 6.28), mA: rng.uniform(0, 6.28) });
      segUse.set(sk(w, s), 'clock');
    }
  }
  if (!coffee && theme !== 'kitchen' && rng.raw() < 0.6) {
    const cx = W / 2 + rng.uniform(-0.5, 0.5), cz = D / 2 + rng.uniform(-0.5, 0.5), hx = rng.uniform(0.9, 1.3), hz = rng.uniform(0.7, 1.0);
    m.room.rugs.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, style: rng.int(0, 2), cols: rng.pick(RUGS), along: rng.raw() < 0.5 });
  }
  m.free = freeCells;
  return m;
}
