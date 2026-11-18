import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import * as X from '../common/_style_pool_mat.js';

const BOARD = { w: 340, h: 388 };
const N = 8, TARGET_MIN = 2, TARGET_MAX = 5;
const ROWS = [3, 2, 3];
const MX = 12, MY = 14, GX = 10, GY = 12;
const TILE = 96;
const RMIN = 30, RMAX = 36;
const R0 = 4;
const TURN_MIN = 2.5, TURN_MAX = 2.8;
const HEAD = 6.5;
const STEPS = 100;
const JIT = 3;
const CCW = 1;
const COIL = '#2f5568';

const r2 = (v) => +v.toFixed(2);

function tileRects() {
  const rects = [];
  const innerW = BOARD.w - 2 * MX;
  const rowH = (BOARD.h - 2 * MY - (ROWS.length - 1) * GY) / ROWS.length;
  ROWS.forEach((n, row) => {
    const cw = (innerW - (n - 1) * GX) / n;
    const cy0 = MY + row * (rowH + GY);
    for (let c = 0; c < n; c++) {
      const cx0 = MX + c * (cw + GX);
      rects.push({ x: cx0 + (cw - TILE) / 2, y: cy0 + (rowH - TILE) / 2, w: TILE, h: TILE });
    }
  });
  return rects;
}

function coilPath(o) {
  const pts = [];
  const thetaMax = o.turns * 2 * Math.PI;
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    const th = thetaMax * f;
    const rad = o.r0 + (o.R - o.r0) * f;
    const ang = o.phi + o.dir * th;
    pts.push({ x: o.cx + rad * Math.cos(ang), y: o.cy + rad * Math.sin(ang) });
  }
  return pts;
}

function coilWind(R, turns, phi, dir) {
  const thetaMax = turns * 2 * Math.PI;
  let a = 0, px = R0 * Math.cos(phi), py = R0 * Math.sin(phi);
  for (let i = 1; i <= STEPS; i++) {
    const f = i / STEPS, th = thetaMax * f, rad = R0 + (R - R0) * f, ang = phi + dir * th;
    const x = rad * Math.cos(ang), y = rad * Math.sin(ang);
    a += px * y - x * py;
    px = x; py = y;
  }
  return a >= 0 ? -1 : 1;
}

function makeCoil(id, tile, R, turns, phi, jx, jy, want) {
  const cx = r2(tile.x + tile.w / 2 + jx);
  const cy = r2(tile.y + tile.h / 2 + jy);
  const base = { cx, cy, R: r2(R), r0: R0, turns: r2(turns), phi: r2(phi) };
  const dir = coilWind(base.R, base.turns, base.phi, 1) === want ? 1 : -1;
  const wind = coilWind(base.R, base.turns, base.phi, dir);
  return {
    id, ...base, dir, wind,
    tx: r2(tile.x), ty: r2(tile.y), tw: r2(tile.w), th: r2(tile.h),
  };
}

function contractOk(m) {
  const c = m.coils;
  if (!c || c.length !== N || !m.targetIds
      || m.targetIds.length < TARGET_MIN || m.targetIds.length > TARGET_MAX) return false;
  const targ = c.filter((o) => o.wind === CCW).map((o) => o.id).sort((a, b) => a - b);
  const want = [...m.targetIds].sort((a, b) => a - b);
  if (targ.length !== want.length || targ.some((id, i) => id !== want[i])) return false;
  for (const o of c) {
    if (o.turns < TURN_MIN - 1e-6) return false;
    if (o.R < RMIN - 0.5 || o.R > RMAX + 0.5) return false;
    if (o.wind !== 1 && o.wind !== -1) return false;
    const reach = o.R + HEAD + 1;
    if (Math.abs(o.cx - (o.tx + o.tw / 2)) + reach > o.tw / 2) return false;
    if (Math.abs(o.cy - (o.ty + o.th / 2)) + reach > o.th / 2) return false;
  }
  return true;
}

export function gate(m) { return m && m.ext ? gateExt(m) : contractOk(m); }

function fallbackManifest() {
  const tiles = tileRects();
  const targetIds = new Set([0, 3, 6]);
  const coils = tiles.map((t, id) =>
    makeCoil(id, t, 33, 2.8, (id * Math.PI) / 3, 0, 0, targetIds.has(id) ? CCW : -CCW));
  return {
    task: 'coil_direction_pick', board: BOARD, coils,
    targetIds: coils.filter((o) => o.wind === CCW).map((o) => o.id).sort((a, b) => a - b),
  };
}

function coilAt(m, x, y) {
  for (const o of m.coils) if (x >= o.tx && x <= o.tx + o.tw && y >= o.ty && y <= o.ty + o.th) return o.id;
  let best = null, bd = Infinity;
  for (const o of m.coils) {
    const d = Math.hypot(x - o.cx, y - o.cy);
    if (d < bd) { bd = d; best = o.id; }
  }
  return bd <= 58 ? best : null;
}

function drawCoil(g, o) {
  const pts = coilPath(o);
  const n = pts.length - 1;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = COIL; g.fillStyle = COIL;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    g.lineWidth = 0.9 + 4.0 * f;
    g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke();
  }
  const head = pts[n], inr = pts[n - 4];
  let ux = head.x - inr.x, uy = head.y - inr.y;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const px = -uy, py = ux, AL = 10, AW = 6.5;
  g.beginPath();
  g.moveTo(head.x + ux * AL, head.y + uy * AL);
  g.lineTo(head.x - ux * 1.5 + px * AW, head.y - uy * 1.5 + py * AW);
  g.lineTo(head.x - ux * 1.5 - px * AW, head.y - uy * 1.5 - py * AW);
  g.closePath(); g.fill();
}

export default {
  meta: {
    name: 'coil_direction_pick', family: 'A', 
    boardH: 398, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', id: 'coil index' }, { op: 'click', x: 'px', y: 'px' }],
    promptHuman: 'Select all coils that wind counter-clockwise',
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng, _knobs.ext);
    for (let attempt = 0; attempt < 40; attempt++) {
      const tiles = tileRects();
      const order = rng.shuffle(Array.from({ length: N }, (_, i) => i));
      const targetSet = new Set(order.slice(0, rng.int(TARGET_MIN, TARGET_MAX)));
      const coils = tiles.map((t, id) => makeCoil(
        id, t,
        rng.uniform(RMIN, RMAX),
        rng.uniform(TURN_MIN, TURN_MAX),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-JIT, JIT), rng.uniform(-JIT, JIT),
        targetSet.has(id) ? CCW : -CCW,
      ));
      const m = {
        task: 'coil_direction_pick', board: BOARD, coils,
        targetIds: coils.filter((o) => o.wind === CCW).map((o) => o.id).sort((a, b) => a - b),
      };
      if (contractOk(m)) return m;
    }
    return fallbackManifest();
  },

  init() { return { selected: [] }; },

  applyAction(state, action, manifest) {
    let id;
    if (action.op === 'click') {
      id = coilAt(manifest, action.x, action.y);
      if (id == null) return { ok: false, reason: 'miss' };
    } else if (action.op === 'toggle') {
      id = action.id;
    } else return { ok: false, reason: 'bad-op' };
    if (!manifest.coils.some((o) => o.id === id)) return { ok: false, reason: 'bad-id' };
    const pos = state.selected.indexOf(id);
    if (pos >= 0) state.selected.splice(pos, 1); else state.selected.push(id);
    state.selected.sort((a, b) => a - b);
    return { ok: true, selected: pos < 0 };
  },

  verify(state, manifest) {
    const want = new Set(manifest.targetIds), got = new Set(state.selected);
    const correct = state.selected.filter((id) => want.has(id)).length;
    const falsePos = state.selected.length - correct;
    const success = got.size === want.size && [...want].every((id) => got.has(id));
    return {
      success,
      partial: Math.max(0, (correct - falsePos) / want.size),
      error: want.size - correct + falsePos,
      detail: { correct, selected: state.selected.length, required: want.size },
    };
  },

  oracle(manifest) {
    return manifest.targetIds.map((id) => ({ op: 'toggle', id }));
  },

  randomPolicy(m, rnd) {
    return m.coils.filter(() => rnd() < 0.5).map((o) => ({ op: 'toggle', id: o.id }));
  },

  async mount(env) { if (env.manifest?.ext) env.assets.coilLook = await mountCoilLook(env); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Select every counter-clockwise coil', 'Follow each coil out to its arrow');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const sel = new Set(st.selected);
    if (m.ext) { drawCoilsExt(g, br, env, sel); return; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef1f5'; g.fillRect(0, 0, br.w, br.h);

    for (const o of m.coils) {
      const on = sel.has(o.id);
      rr(g, o.tx, o.ty, o.tw, o.th, 12);
      g.fillStyle = on ? '#e6f1ff' : '#ffffff'; g.fill();
      g.lineWidth = on ? 3 : 1.2; g.strokeStyle = on ? ACCENT : '#dce1e8'; g.stroke();

      drawCoil(g, o);

      if (on) {
        const dx = o.tx + o.tw - 13, dy = o.ty + 13;
        g.beginPath(); g.arc(dx, dy, 8.5, 0, Math.PI * 2);
        g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 1.9; g.lineCap = 'round';
        g.beginPath(); g.moveTo(dx - 3.6, dy); g.lineTo(dx - 1, dy + 2.8); g.lineTo(dx + 4, dy - 3.2); g.stroke();
      }
    }
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    return [{ op: 'click', x: Math.round(evt.x), y: Math.round(evt.y) }];
  },

  footerStatus(env) {
    return `${env.state.selected.length} selected`;
  },
};

const EXT_LAYOUTS = [
  ...Array.from({ length: 9 }, (_, k) => ({ id: `g${k}`, cells: Array.from({ length: 9 }, (_, c) => c).filter((c) => c !== k).map((c) => [Math.floor(c / 3), c % 3]) })),
  ...[[3, 2, 3], [3, 3, 2], [2, 3, 3]].map((rows) => ({ id: `c${rows.join('')}`, cells: rows.flatMap((n, r) => Array.from({ length: n }, (_, c) => [r, n === 3 ? c : c + 0.5])) })),
];
const EXT_STEPS = 140;
const extLayoutSplit = X.splitPool('coil_direction_pick_layouts_r2', EXT_LAYOUTS.map((l) => ({ id: l.id })), 2);
const layoutsOf = (split) => EXT_LAYOUTS.filter((l) => extLayoutSplit.find((x) => x.id === l.id).split === split);
function extTiles(rng, layout, gx, gy) {
  const innerW = BOARD.w - 2 * MX, innerH = BOARD.h - 2 * MY;
  const blockW = 3 * TILE + 2 * gx, blockH = 3 * TILE + 2 * gy;
  const bx = MX + rng.uniform(0, Math.max(0, innerW - blockW)), by = MY + rng.uniform(0, Math.max(0, innerH - blockH));
  return layout.cells.map(([r, c]) => ({ x: r2(bx + c * (TILE + gx)), y: r2(by + r * (TILE + gy)), w: TILE, h: TILE }));
}
function coilPathExt(o) {
  const pts = [], thetaMax = o.turns * 2 * Math.PI;
  for (let i = 0; i <= EXT_STEPS; i++) {
    const f = i / EXT_STEPS, rad = o.r0 + (o.R - o.r0) * Math.pow(f, o.grow), ang = o.phi + o.dir * thetaMax * f;
    pts.push({ x: o.cx + rad * Math.cos(ang), y: o.cy + rad * Math.sin(ang) });
  }
  return pts;
}
function windExt(o) {
  const pts = coilPathExt(o);
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += (pts[i - 1].x - o.cx) * (pts[i].y - o.cy) - (pts[i].x - o.cx) * (pts[i - 1].y - o.cy);
  return a >= 0 ? -1 : 1;
}
const headOf = (o) => HEAD * o.tw / TILE;
function generateExt(rng, split) {
  for (let att = 0; att < 100; att++) {
    const layout = rng.pick(layoutsOf(split));
    const tiles = extTiles(rng, layout, rng.int(GX - 2, GX + 1), rng.int(GY - 4, GY + 12));
    const n = tiles.length;
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const targetSet = new Set(order.slice(0, rng.int(TARGET_MIN, TARGET_MAX)));
    const grow = rng.uniform(0.85, 1.15);
    const coils = tiles.map((t, id) => {
      const R = r2(rng.uniform(RMIN, RMAX)), turns = r2(rng.uniform(TURN_MIN, TURN_MAX));
      const o = { id, cx: r2(t.x + t.w / 2 + rng.uniform(-JIT, JIT)), cy: r2(t.y + t.h / 2 + rng.uniform(-JIT, JIT)), R, r0: r2(rng.uniform(3.5, 4.5)), turns, phi: r2(rng.uniform(0, Math.PI * 2)), grow: r2(grow + rng.uniform(-0.03, 0.03)), dir: 1, tx: t.x, ty: t.y, tw: t.w, th: t.h };
      const want = targetSet.has(id) ? CCW : -CCW;
      if (windExt(o) !== want) o.dir = -1;
      o.wind = windExt(o);
      return o;
    });
    const m = { task: 'coil_direction_pick', board: BOARD, ext: split, layout: layout.id, coils, targetIds: coils.filter((o) => o.wind === CCW).map((o) => o.id).sort((a, b) => a - b) };
    if (gateExt(m)) return m;
  }
  throw new Error('coil_direction_pick: no extended board');
}
export function semanticKey(m) {
  const order = m.coils.map((o, i) => [Math.round(o.ty / 40), o.tx, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  const bin = (phi) => ((Math.round(((phi % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
  return `coil|${m.layout || 'c323'}|${order.map((i) => (m.coils[i].wind === CCW ? 'L' : 'R') + bin(m.coils[i].phi)).join('')}`;
}
function gateExt(m) {
  if (m.task !== 'coil_direction_pick' || (m.ext !== 'train' && m.ext !== 'test') || !layoutsOf(m.ext).some((l) => l.id === m.layout)) return false;
  const c = m.coils;
  if (!Array.isArray(c) || c.length !== N || !Array.isArray(m.targetIds) || m.targetIds.length < TARGET_MIN || m.targetIds.length > TARGET_MAX) return false;
  const targ = c.filter((o) => o.wind === CCW).map((o) => o.id).sort((a, b) => a - b), want = [...m.targetIds].sort((a, b) => a - b);
  if (targ.length !== want.length || targ.some((id, i) => id !== want[i])) return false;
  for (const [i, o] of c.entries()) {
    if (o.id !== i || o.turns < TURN_MIN - 1e-6 || o.turns > TURN_MAX + 1e-6 || (o.dir !== 1 && o.dir !== -1) || windExt(o) !== o.wind) return false;
    if (o.tw !== TILE || o.th !== TILE || o.R < RMIN - 0.5 || o.R > RMAX + 0.5 || !(o.grow >= 0.81 && o.grow <= 1.19)) return false;
    const reach = o.R + headOf(o) + 1;
    if (Math.abs(o.cx - (o.tx + o.tw / 2)) + reach > o.tw / 2 || Math.abs(o.cy - (o.ty + o.th / 2)) + reach > o.th / 2) return false;
    if (o.tx < 0 || o.ty < 0 || o.tx + o.tw > BOARD.w || o.ty + o.th > BOARD.h) return false;
  }
  return true;
}

const COIL_MATS = [
  { id: 'ink_blue', type: 'ink', col: '#1f4f8a' },
  { id: 'ink_black', type: 'ink', col: '#1b1d20' },
  { id: 'ink_red', type: 'ink', col: '#a3261d' },
  { id: 'copper_wire', type: 'metal', col: '#b8612f', dark: '#5e2a10', light: '#f7c6a0' },
  { id: 'steel_spring', type: 'metal', col: '#8a949e', dark: '#3a4148', light: '#f3f6f8' },
  { id: 'brass_wire', type: 'metal', col: '#c99b3e', dark: '#6e4f12', light: '#fbe9b8' },
  { id: 'gold_wire', type: 'metal', col: '#d8a920', dark: '#7a5a05', light: '#fff1b0' },
  { id: 'chalk', type: 'chalk', col: '#f2f2ec' },
  { id: 'cord_red', type: 'cord', col: '#c8372d', dark: '#6a120c' },
  { id: 'cord_navy', type: 'cord', col: '#24406e', dark: '#0d1d38' },
  { id: 'neon_cyan', type: 'neon', col: '#5ff3ff' },
  { id: 'neon_pink', type: 'neon', col: '#ff6ad5' },
  { id: 'hose_green', type: 'hose', col: '#2f9a45', dark: '#145a22' },
  { id: 'pencil', type: 'ink', col: '#4a4d52', grain: true },
  { id: 'licorice', type: 'cord', col: '#2a2224', dark: '#0d0a0b' },
];
const TILE_LOOKS = [
  { id: 'paper', fill: '#fbf9f2', edge: '#ddd6c4', dark: false, tex: 'flat2d' },
  { id: 'white_card', fill: '#ffffff', edge: '#dce1e8', dark: false },
  { id: 'kraft', fill: '#d6b98a', edge: '#ad8f5f', dark: false },
  { id: 'birch_ply', fill: '#e2c99d', edge: '#b39561', dark: false, tex: 'wood' },
  { id: 'ceramic', fill: '#eef0ee', edge: '#c3c8c6', dark: false, tex: 'floor' },
  { id: 'slate', fill: '#2c3236', edge: '#15191b', dark: true, tex: 'stone' },
  { id: 'blackboard', fill: '#28392f', edge: '#162019', dark: true },
  { id: 'night_glass', fill: '#141821', edge: '#2c3446', dark: true },
  { id: 'steel_plate', fill: '#c4cad0', edge: '#8a929a', dark: false, tex: 'metal' },
  { id: 'linen', fill: '#e8e1d3', edge: '#c4b9a3', dark: false, tex: 'fabric' },
];
const LIGHT_MATS = new Set(['chalk', 'neon']);
const SURF_USES = new Set(['wood', 'stone', 'floor', 'wall', 'fabric', 'metal']);

async function mountCoilLook(env) {
  const st = env.style;
  env.assets.kcache = new Map();
  if (!st) return null;
  const rnd = st.rand;
  const surf = st.primary('tex', (t) => SURF_USES.has(t.use));
  const mats = X.stylePool(st, 'coil_mats', COIL_MATS, 4);
  const mat = mats[X.seqPick(st, 'coil-mat', mats.length)];
  const tsplit = X.stylePool(st, 'coil_tiles', TILE_LOOKS, 3);
  const tiles = tsplit.filter((t) => (LIGHT_MATS.has(mat.type) ? t.dark : mat.type === 'metal' ? true : !t.dark));
  const tile = tiles.length ? tiles[X.seqPick(st, 'tile', tiles.length)] : tsplit.slice().sort((p, q) => X.contrastHex(mat.col, q.fill) - X.contrastHex(mat.col, p.fill))[0];
  st.note(`coil_tiles:${tile.id}`); st.note(`coil_mats:${mat.id}`);
  const ttex = tile.tex ? st.pick('tex', (t) => t.use === tile.tex) : null;
  st.note(`coil:${mat.id} tile:${tile.id}`);
  return {
    surf: await X.loadTex(surf), surfLum: 0.1 + 0.35 * rnd(), surfRot: 90 * Math.floor(rnd() * 4), surfScale: 0.35 + 0.4 * rnd(),
    mat, tile, ttex: ttex ? await X.loadTex(ttex) : null, widthK: 0.85 + 0.5 * rnd(), radius: 4 + Math.floor(rnd() * 12),
  };
}

function drawCoilExt(g, o, M, k) {
  const pts = coilPathExt(o), n = pts.length - 1, s = o.tw / 96;
  const w = (f) => (0.9 + 4.0 * f) * s * k;
  const seg = (col, wk, alpha = 1, off = 0) => {
    g.strokeStyle = col; g.globalAlpha = alpha;
    for (let i = 0; i < n; i++) { const f = i / n; g.lineWidth = Math.max(0.7, w(f) * wk); g.beginPath(); g.moveTo(pts[i].x + off, pts[i].y + off); g.lineTo(pts[i + 1].x + off, pts[i + 1].y + off); g.stroke(); }
    g.globalAlpha = 1;
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (M.type === 'metal' || M.type === 'cord' || M.type === 'hose') seg('rgba(0,0,0,0.28)', 1.05, 1, 1.4 * s);
  if (M.type === 'neon') { g.save(); g.shadowColor = M.col; g.shadowBlur = 8 * s; seg(M.col, 1.1); g.restore(); seg('#ffffff', 0.45, 0.85); }
  else if (M.type === 'metal') { seg(M.dark, 1.15); seg(M.col, 0.85); seg(M.light, 0.32, 0.9, -0.5 * s); }
  else if (M.type === 'cord' || M.type === 'hose') { seg(M.dark, 1.2); seg(M.col, 0.9); seg('rgba(255,255,255,0.35)', 0.25, 1, -0.6 * s); }
  else if (M.type === 'chalk') { seg(M.col, 1, 0.9); seg('rgba(40,50,45,0.35)', 0.35, 1, 0.3); }
  else { seg(M.col, 1); if (M.grain) seg('rgba(255,255,255,0.25)', 0.3); }
  const head = pts[n], inr = pts[n - 5];
  let ux = head.x - inr.x, uy = head.y - inr.y;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const px = -uy, py = ux, AL = headOf(o) * 1.5 * (0.85 + 0.15 * k), AW = headOf(o) * k;
  g.beginPath();
  g.moveTo(head.x + ux * AL, head.y + uy * AL);
  g.lineTo(head.x - ux * 1.5 + px * AW, head.y - uy * 1.5 + py * AW);
  g.lineTo(head.x - ux * 1.5 - px * AW, head.y - uy * 1.5 - py * AW);
  g.closePath();
  if (M.type === 'neon') { g.save(); g.shadowColor = M.col; g.shadowBlur = 8 * s; g.fillStyle = M.col; g.fill(); g.restore(); }
  else { g.fillStyle = M.type === 'metal' || M.type === 'cord' || M.type === 'hose' ? M.dark : M.col; g.fill(); if (M.type === 'metal') { g.strokeStyle = M.col; g.lineWidth = 1; g.stroke(); } }
}

function drawCoilsExt(g, br, env, sel) {
  const m = env.manifest, L = env.assets.coilLook;
  const T = L ? L.tile : TILE_LOOKS[1], M = L ? L.mat : { id: 'ink', type: 'ink', col: COIL };
  g.save(); g.translate(br.x, br.y);
  X.drawCached(g, env.assets.kcache, 'board', br.w, br.h, (cg) => {
    if (L) X.fillTex(cg, L.surf, { rect: [0, 0, br.w, br.h], lum: L.surfLum, sat: 0.8, scale: L.surfScale, rot: L.surfRot });
    else { cg.fillStyle = '#eef1f5'; cg.fillRect(0, 0, br.w, br.h); }
    for (const o of m.coils) {
      cg.save(); cg.shadowColor = 'rgba(0,0,0,0.3)'; cg.shadowBlur = 6; cg.shadowOffsetY = 2;
      rr(cg, o.tx, o.ty, o.tw, o.th, L ? L.radius : 12); cg.fillStyle = T.fill; cg.fill(); cg.restore();
      if (L && L.ttex) { rr(cg, o.tx, o.ty, o.tw, o.th, L.radius); X.fillTex(cg, L.ttex, { lum: X.relLum(T.fill), sat: 0.3, scale: 0.3, rot: 0, alpha: 0.3 }); }
      rr(cg, o.tx, o.ty, o.tw, o.th, L ? L.radius : 12); cg.strokeStyle = T.edge; cg.lineWidth = 1.2; cg.stroke();
      drawCoilExt(cg, o, M, L ? L.widthK : 1);
    }
  });
  for (const o of m.coils) {
    if (!sel.has(o.id)) continue;
    rr(g, o.tx, o.ty, o.tw, o.th, L ? L.radius : 12);
    g.fillStyle = 'rgba(25,145,250,0.10)'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = ACCENT; g.stroke();
    const dx = o.tx + o.tw - 13, dy = o.ty + 13;
    g.beginPath(); g.arc(dx, dy, 8.5, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1.9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(dx - 3.6, dy); g.lineTo(dx - 1, dy + 2.8); g.lineTo(dx + 4, dy - 3.2); g.stroke();
  }
  g.restore();
}
