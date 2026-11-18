import { drawPromptText, ACCENT } from '../core/panel.js';
import { hash32, splitIds } from '../core/style.js';
import * as K from '../common/_colour_kit.js';

const BOARD = { w: 560, h: 372 };
const PANEL_W = BOARD.w + 20;
const HARD = { options: 9, correct: [2, 3], mirrors: [2, 3], profileBreakers: 1, runs: [4, 4], runLen: [2, 3], cubes: [9, 11], span: 5 };
const BOARD_EXT = { w: 340, h: 382 };
const HARD_EXT = { options: 6, correct: 1, mirrors: 2, edits: 3, runs: [3, 4], runLen: [2, 3], cubes: [8, 11], span: 4 };
const PANEL_EXT = { panelWidth: 360, boardH: 392 };
const CELL_SCALE = 0.73, REF_SCALE = 1.1;
const CELL_DRAW_MAX = 1.5, REF_DRAW_MAX = 2.0;
const MIN_FACE_PX = 3;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const PALETTES = [
  { top: '#b4cff2', left: '#5f92d6', right: '#3f6fb2' },
  { top: '#f5cfa4', left: '#e0904e', right: '#bb6b2e' },
  { top: '#bfe3c8', left: '#62ae7c', right: '#3f8a5a' },
  { top: '#d4c6f2', left: '#9077d2', right: '#6c55ad' },
  { top: '#b1dfdf', left: '#47a5a6', right: '#2f8283' },
];

function permutationParity(p) {
  let inv = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  return inv % 2 ? -1 : 1;
}

const ROTATIONS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (permutationParity(p) * sx * sy * sz === 1) out.push({ p, s: [sx, sy, sz] });
  }
  return out;
})();

const cellKey = (p) => `${p.x},${p.y},${p.z}`;

function transform(shape, rot) {
  return shape.map((q) => {
    const v = [q.x, q.y, q.z];
    return { x: rot.s[0] * v[rot.p[0]], y: rot.s[1] * v[rot.p[1]], z: rot.s[2] * v[rot.p[2]] };
  });
}

function normalizedKey(shape) {
  const minX = Math.min(...shape.map((p) => p.x));
  const minY = Math.min(...shape.map((p) => p.y));
  const minZ = Math.min(...shape.map((p) => p.z));
  return shape.map((p) => `${p.x - minX},${p.y - minY},${p.z - minZ}`).sort().join(';');
}

const parseKey = (k) => k.split(';').map((s) => {
  const [x, y, z] = s.split(',').map(Number);
  return { x, y, z };
});

function rotationKeys(shape) { return new Set(ROTATIONS.map((r) => normalizedKey(transform(shape, r)))); }
function mirrorOf(shape) { return shape.map((p) => ({ x: -p.x, y: p.y, z: p.z })); }
function isChiral(shape) { return !rotationKeys(shape).has(normalizedKey(mirrorOf(shape))); }
function canonicalKey(shape) {
  let best = null;
  for (const r of ROTATIONS) { const k = normalizedKey(transform(shape, r)); if (best === null || k < best) best = k; }
  return best;
}

function orientations(shape) {
  const seen = new Set();
  const out = [];
  for (const r of ROTATIONS) {
    const k = normalizedKey(transform(shape, r));
    if (!seen.has(k)) { seen.add(k); out.push(parseKey(k)); }
  }
  return out;
}

function connected(shape) {
  const keys = new Set(shape.map(cellKey));
  const seen = new Set([cellKey(shape[0])]);
  const stack = [shape[0]];
  while (stack.length) {
    const p = stack.pop();
    for (const d of DIRS) {
      const q = { x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] }, k = cellKey(q);
      if (keys.has(k) && !seen.has(k)) { seen.add(k); stack.push(q); }
    }
  }
  return seen.size === shape.length;
}

function layout(shape, scale) {
  const w = 7.2 * scale, d = 4.1 * scale, h = 10.5 * scale;
  const pts = shape.map((p, i) => ({ ...p, i, px: (p.x - p.y) * w, py: (p.x + p.y) * d - p.z * h }));
  pts.sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));
  const minX = Math.min(...pts.map((p) => p.px - w)), maxX = Math.max(...pts.map((p) => p.px + w));
  const minY = Math.min(...pts.map((p) => p.py - h)), maxY = Math.max(...pts.map((p) => p.py + 2 * d));
  return { w, d, h, pts, minX, maxX, minY, maxY };
}

function cubeQuads(cx, cy, w, d, h) {
  const A = { x: cx, y: cy - h }, B = { x: cx + w, y: cy - h + d };
  const C = { x: cx, y: cy - h + 2 * d }, D = { x: cx - w, y: cy - h + d };
  const Bd = { x: B.x, y: B.y + h }, Cd = { x: C.x, y: C.y + h }, Dd = { x: D.x, y: D.y + h };
  return [[D, C, Cd, Dd], [C, B, Bd, Cd], [A, B, C, D]];
}

function insideQuad(q, X, Y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (Y - a.y) - (b.y - a.y) * (X - a.x);
    if (c > 1e-9) { if (sign < 0) return false; sign = 1; }
    else if (c < -1e-9) { if (sign > 0) return false; sign = -1; }
  }
  return true;
}

const STEP = 0.5;
function visibleAreas(shape, scale) {
  const L = layout(shape, scale);
  const W = Math.ceil((L.maxX - L.minX) / STEP) + 2, H = Math.ceil((L.maxY - L.minY) / STEP) + 2;
  const owner = new Int16Array(W * H).fill(-1);
  for (const p of L.pts) {
    const cx = p.px - L.minX, cy = p.py - L.minY;
    for (const q of cubeQuads(cx, cy, L.w, L.d, L.h)) {
      const x0 = Math.max(0, Math.floor(Math.min(...q.map((v) => v.x)) / STEP));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map((v) => v.x)) / STEP));
      const y0 = Math.max(0, Math.floor(Math.min(...q.map((v) => v.y)) / STEP));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map((v) => v.y)) / STEP));
      for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
        if (insideQuad(q, X * STEP + STEP / 2, Y * STEP + STEP / 2)) owner[Y * W + X] = p.i;
      }
    }
  }
  const area = new Array(shape.length).fill(0);
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) area[owner[i]]++;
  return area.map((a) => a * STEP * STEP);
}

const legibleCache = new Map();
function legible(shape, scale) {
  const ck = `${scale}|${normalizedKey(shape)}`;
  let v = legibleCache.get(ck);
  if (v === undefined) { v = visibleAreas(shape, scale).every((a) => a >= MIN_FACE_PX); legibleCache.set(ck, v); }
  return v;
}
const legibleViews = (shape, scale) => orientations(shape).filter((s) => legible(s, scale));

const spinZ = (sh) => sh.map((p) => ({ x: -p.y, y: p.x, z: p.z }));
const tipX = (sh) => sh.map((p) => ({ x: p.x, y: -p.z, z: p.y }));
const tipXBack = (sh) => sh.map((p) => ({ x: p.x, y: p.z, z: -p.y }));
function turned(shape, k, tip) {
  let s = tip === 1 ? tipX(shape) : tip === -1 ? tipXBack(shape) : shape.map((p) => ({ ...p }));
  for (let i = 0; i < k; i++) s = spinZ(s);
  return parseKey(normalizedKey(s));
}
const TURNS = [];
for (let k = 0; k < 4; k++) TURNS.push({ k, tip: 0 });

function walk(dirs, lens) {
  const cells = [{ x: 0, y: 0, z: 0 }];
  const seen = new Set(['0,0,0']);
  let p = cells[0];
  for (let r = 0; r < dirs.length; r++) {
    const d = DIRS[dirs[r]];
    for (let s = 0; s < lens[r]; s++) {
      p = { x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] };
      const k = cellKey(p);
      if (seen.has(k)) return null;
      seen.add(k); cells.push(p);
    }
  }
  return cells;
}
const axisOf = (di) => Math.floor(di / 2);
function spanOk(shape, span = HARD.span) {
  for (const a of ['x', 'y', 'z']) {
    const v = shape.map((p) => p[a]);
    if (Math.max(...v) - Math.min(...v) + 1 > span) return false;
  }
  return true;
}
function armOk(dirs, cells, H = HARD) {
  if (!cells || !spanOk(cells, H.span) || cells.length < H.cubes[0] || cells.length > H.cubes[1]) return false;
  if (new Set(dirs.map(axisOf)).size !== 3) return false;
  for (let i = 1; i < dirs.length; i++) if (axisOf(dirs[i]) === axisOf(dirs[i - 1])) return false;
  return isChiral(cells);
}
function randomArm(rng, H = HARD) {
  for (let t = 0; t < 500; t++) {
    const nRuns = rng.int(H.runs[0], H.runs[1]);
    const dirs = [], lens = [];
    for (let r = 0; r < nRuns; r++) {
      const choices = [0, 1, 2, 3, 4, 5].filter((di) => r === 0 || axisOf(di) !== axisOf(dirs[r - 1]));
      dirs.push(rng.pick(choices)); lens.push(rng.int(H.runLen[0], H.runLen[1]));
    }
    const cells = walk(dirs, lens);
    if (armOk(dirs, cells, H)) return { dirs, lens, cells: parseKey(normalizedKey(cells)) };
  }
  return null;
}

const verticalProfile = (dirs) => dirs.map((d) => (d === 4 ? 'U' : d === 5 ? 'D' : 'h')).join('');

function sameLengthEdits(arm) {
  const bad = new Set([canonicalKey(arm.cells), canonicalKey(mirrorOf(arm.cells))]);
  const prof = verticalProfile(arm.dirs);
  const same = new Map(), other = new Map();
  const rec = (dirs) => {
    if (dirs.length === arm.dirs.length) {
      const cells = walk(dirs, arm.lens);
      if (!armOk(dirs, cells)) return;
      const k = canonicalKey(cells);
      if (bad.has(k) || same.has(k)) return;
      const rep = { dirs: dirs.slice(), cells: parseKey(normalizedKey(cells)) };
      if (verticalProfile(dirs) === prof) { other.delete(k); same.set(k, rep); } else if (!other.has(k)) other.set(k, rep);
      return;
    }
    for (let di = 0; di < 6; di++) {
      if (dirs.length && axisOf(di) === axisOf(dirs[dirs.length - 1])) continue;
      rec([...dirs, di]);
    }
  };
  rec([]);
  return { same: [...same.values()], other: [...other.values()] };
}

function pathSignature(shape) {
  const keys = new Map(shape.map((p, i) => [cellKey(p), i]));
  const nb = shape.map((p) => DIRS.map((d) => keys.get(cellKey({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] }))).filter((j) => j !== undefined));
  if (nb.some((n) => n.length > 2)) return null;
  const ends = nb.map((n, i) => (n.length === 1 ? i : -1)).filter((i) => i >= 0);
  if (ends.length !== 2) return null;
  const order = [ends[0]], seen = new Set(order);
  while (order.length < shape.length) {
    const nx = nb[order[order.length - 1]].find((j) => !seen.has(j));
    if (nx === undefined) return null;
    order.push(nx); seen.add(nx);
  }
  const steps = [];
  for (let i = 1; i < order.length; i++) {
    const a = shape[order[i - 1]], b = shape[order[i]];
    steps.push({ k: `${b.x - a.x},${b.y - a.y},${b.z - a.z}`, v: b.z - a.z > 0 ? 'U' : b.z - a.z < 0 ? 'D' : 'h' });
  }
  const lens = [], prof = [];
  for (let i = 0; i < steps.length; i++) {
    if (i && steps[i].k === steps[i - 1].k) lens[lens.length - 1]++; else { lens.push(1); prof.push(steps[i].v); }
  }
  const lf = lens.join(','), lr = lens.slice().reverse().join(',');
  const ff = `${lf}|${prof.join('')}`, fr = `${lr}|${prof.slice().reverse().map((c) => (c === 'U' ? 'D' : c === 'D' ? 'U' : c)).join('')}`;
  return { lens: lf < lr ? lf : lr, full: ff < fr ? ff : fr };
}
function bentVariant(arm, rng, bad, span = HARD_EXT.span) {
  for (let t = 0; t < 200; t++) {
    const dirs = arm.dirs.slice(), lens = arm.lens.slice();
    if (rng.raw() < 0.5) {
      const r = rng.int(0, dirs.length - 1);
      const choices = [0, 1, 2, 3, 4, 5].filter((di) => di !== dirs[r]
        && (r === 0 || axisOf(di) !== axisOf(dirs[r - 1]))
        && (r === dirs.length - 1 || axisOf(di) !== axisOf(dirs[r + 1])));
      if (!choices.length) continue;
      dirs[r] = rng.pick(choices);
    } else {
      const [a, b] = rng.sample(lens.map((_, i) => i), 2);
      if (lens[b] <= 1) continue;
      lens[a]++; lens[b]--;
    }
    const cells = walk(dirs, lens);
    if (!cells || !spanOk(cells, span) || !connected(cells)) continue;
    const k = canonicalKey(cells);
    if (bad.has(k)) continue;
    return parseKey(normalizedKey(cells));
  }
  return null;
}

const spinKeys = (shape) => new Set([0, 1, 2, 3].map((q) => normalizedKey(turned(shape, q, 0))));
const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
export function gate(m) {
  if (m && m.ext && !extFitOk(m)) return false;
  const H = m && m.ext ? HARD_EXT : HARD;
  if (!m || m.task !== 'block_rotation_match' || !Array.isArray(m.cells) || m.cells.length !== H.options) return false;
  if (!Array.isArray(m.answer) || !Array.isArray(m.reference)) return false;
  if (m.ext ? m.answer.length !== H.correct : !inRange(m.answer.length, HARD.correct)) return false;
  if (new Set(m.answer).size !== m.answer.length) return false;
  if (!PALETTES[m.palette] || !isChiral(m.reference) || !connected(m.reference)) return false;
  const rk = rotationKeys(m.reference), mk = rotationKeys(mirrorOf(m.reference));
  const spinR = spinKeys(m.reference), spinM = spinKeys(mirrorOf(m.reference));
  const keys = new Set([normalizedKey(m.reference)]);
  const refSig = m.ext ? null : pathSignature(m.reference);
  if (!m.ext && (!refSig || refSig.lens.split(',').length !== HARD.runs[1] || !spanOk(m.reference))) return false;
  let mirrors = 0, edits = 0, breakers = 0;
  const editSolids = new Set();
  for (let i = 0; i < m.cells.length; i++) {
    const c = m.cells[i], k = normalizedKey(c);
    if (keys.has(k)) return false;
    keys.add(k);
    if (rk.has(k) !== m.answer.includes(i)) return false;
    if (!m.ext && rk.has(k) && !spinR.has(k)) return false;
    if (mk.has(k)) {
      if (!m.ext && !spinM.has(k)) return false;
      mirrors++;
    } else if (!rk.has(k)) {
      if (c.length !== m.reference.length || !connected(c)) return false;
      if (!m.ext) {
        const sig = pathSignature(c), solid = canonicalKey(c);
        if (!sig || sig.lens !== refSig.lens || !isChiral(c) || !spanOk(c) || editSolids.has(solid)) return false;
        editSolids.add(solid);
        if (sig.full !== refSig.full) breakers++;
      }
      edits++;
    }
    if (!legible(c, CELL_SCALE)) return false;
  }
  if (m.ext) return mirrors === H.mirrors && edits === H.edits && legible(m.reference, REF_SCALE);
  return inRange(mirrors, HARD.mirrors) && edits === HARD.options - m.answer.length - mirrors
    && breakers <= HARD.profileBreakers && legible(m.reference, REF_SCALE);
}

export default {
  meta: {
    name: 'block_rotation_match', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', cell: '0..8 (selects that tile; tapping it again clears it; select every matching tile)' }],
    promptHuman: 'Tap every tile that is the left shape turned',
  },

  generate(rng, level, index, _knobs = {}) {
    if (_knobs && _knobs.ext) return generateExt(rng, _knobs.ext);
    for (let attempt = 0; attempt < 400; attempt++) {
      const arm = randomArm(rng);
      if (!arm) continue;
      const nCorrect = rng.int(HARD.correct[0], HARD.correct[1]), nMirrors = rng.int(HARD.mirrors[0], HARD.mirrors[1]);
      const nEdits = HARD.options - nCorrect - nMirrors;
      const pool = sameLengthEdits(arm);
      if (pool.same.length < nEdits - HARD.profileBreakers || pool.same.length + pool.other.length < nEdits) continue;
      const base = arm.cells;
      const mirror = mirrorOf(base);
      const spins = (shape, scale) => rng.shuffle(TURNS).map((t) => turned(shape, t.k, t.tip)).filter((s) => legible(s, scale));

      const refViews = spins(base, REF_SCALE);
      if (!refViews.length) continue;
      const reference = refViews[0];
      const used = new Set([normalizedKey(reference)]);
      const take = (cands) => { const s = cands.find((c) => !used.has(normalizedKey(c))); if (s) used.add(normalizedKey(s)); return s; };
      const takeN = (cands, n) => { const out = []; for (let i = 0; i < n; i++) { const s = take(cands); if (!s) return null; out.push(s); } return out; };

      const correct = takeN(spins(base, CELL_SCALE), nCorrect);
      if (!correct) continue;
      const mirrored = takeN(spins(mirror, CELL_SCALE), nMirrors);
      if (!mirrored) continue;
      const options = [...correct.map((shape) => ({ shape, correct: true })), ...mirrored.map((shape) => ({ shape, correct: false }))];
      let edits = 0;
      for (const e of [...rng.shuffle(pool.same), ...rng.shuffle(pool.other)]) {
        if (edits === nEdits) break;
        const s = take(spins(e.cells, CELL_SCALE));
        if (s) { options.push({ shape: s, correct: false }); edits++; }
      }
      if (edits < nEdits) continue;

      const cells = rng.shuffle(options);
      const m = {
        task: 'block_rotation_match', board: BOARD,
        cubes: base.length, palette: rng.int(0, PALETTES.length - 1),
        reference,
        cells: cells.map((o) => o.shape),
        answer: cells.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0),
      };
      if (gate(m)) return m;
    }
    throw new Error('block_rotation_match: could not build an instance');
  },

  init(m) { return { selected: new Array(m && Array.isArray(m.cells) ? m.cells.length : HARD.options).fill(false) }; },

  applyAction(state, action, m) {
    if (action.op !== 'toggle' || !Number.isInteger(action.cell) || action.cell < 0 || action.cell >= state.selected.length) return { ok: false, reason: 'bad-op' };
    const was = state.selected[action.cell];
    if (m && m.ext) state.selected.fill(false);
    state.selected[action.cell] = !was;
    return { ok: true };
  },

  verify(state, manifest) {
    const answer = new Set(manifest.answer);
    let exact = 0, selected = 0, truePositive = 0;
    state.selected.forEach((v, i) => {
      if (v) { selected++; if (answer.has(i)) truePositive++; }
      if (v === answer.has(i)) exact++;
    });
    const n = manifest.cells.length;
    return {
      success: selected === answer.size && truePositive === answer.size,
      error: n - exact, partial: exact / n, detail: { selected },
    };
  },

  oracle(manifest) { return manifest.answer.map((cell) => ({ op: 'toggle', cell })); },

  randomPolicy(manifest, rnd) {
    const n = manifest.cells.length;
    if (manifest.ext) return [{ op: 'toggle', cell: Math.floor(rnd() * n) }];
    const k = HARD.correct[0] + Math.floor(rnd() * (HARD.correct[1] - HARD.correct[0] + 1));
    const ids = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, k).map((cell) => ({ op: 'toggle', cell }));
  },

  async mount(env) { if (env.style) env.assets.look = await styleLook(env.style); },

  drawPrompt(g, r, env) {
    if (env && env.manifest && env.manifest.ext) drawPromptText(g, r, 'Tap the shape that is the top one turned', 'Mirror images do not count');
    else drawPromptText(g, r, 'Tap every tile that is the left shape turned', 'Several tiles match; mirror images do not count');
  },

  _refRect(m) {
    if (m && m.ext) return extRefRect(m.ext.layout || 'top');
    return { x: 6, y: 6, w: 190, h: BOARD.h - 12 };
  },

  _cellRect(i, m) {
    if (m && m.ext && m.ext.layout) return extCellRect(i, m.ext.layout);
    const w = 112, h = 112, gap = 6;
    const row = Math.floor(i / 3), col = i % 3;
    const x0 = BOARD.w - 6 - 3 * w - 2 * gap, y0 = (BOARD.h - 3 * h - 2 * gap) / 2;
    return { x: x0 + col * (w + gap), y: y0 + row * (h + gap), w, h };
  },

  _drawShape(g, shape, cx, cy, scale, pal) {
    const L = layout(shape, scale);
    const ox = cx - (L.minX + L.maxX) / 2, oy = cy - (L.minY + L.maxY) / 2;
    const fills = [pal.left, pal.right, pal.top];
    for (const p of L.pts) {
      cubeQuads(ox + p.px, oy + p.py, L.w, L.d, L.h).forEach((q, k) => {
        g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath();
        g.fillStyle = fills[k]; g.fill();
        g.strokeStyle = 'rgba(25,38,55,.55)'; g.lineWidth = 0.8; g.lineJoin = 'round'; g.stroke();
      });
    }
  },

  _scales(m) {
    if (m.ext && m.ext.layout) return extScales(m);
    const ext = (shape) => { const L = layout(shape, 1); return [L.maxX - L.minX, L.maxY - L.minY]; };
    const r0 = this._cellRect(0, m), rr = this._refRect(m), fit = (shape, w, h) => { const [a, b] = ext(shape); return Math.min(w / a, h / b); };
    const cell = Math.max(CELL_SCALE, Math.min(CELL_DRAW_MAX, ...m.cells.map((c) => fit(c, r0.w - 18, r0.h - 18))));
    const ref = Math.max(REF_SCALE, Math.min(REF_DRAW_MAX, fit(m.reference, rr.w - 28, rr.h - 40)));
    return { cell, ref };
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.look) { drawStyled(this, g, br, env, env.assets.look); return; }
    const { manifest: m, state } = env;
    const S = this._scales(m), pal = PALETTES[m.palette] || PALETTES[0];
    const rr = this._refRect(m);
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, br.w, br.h);
    g.fillStyle = '#fff'; g.strokeStyle = '#d5dde6'; g.lineWidth = 1;
    if (m.ext) {
      g.beginPath(); g.roundRect(br.w / 2 - 80, 6, 160, 150, 8); g.fill(); g.stroke();
      this._drawShape(g, m.reference, br.w / 2, 81, S.ref, pal);
    } else {
      g.beginPath(); g.roundRect(rr.x, rr.y, rr.w, rr.h, 8); g.fill(); g.stroke();
      this._drawShape(g, m.reference, rr.x + rr.w / 2, rr.y + rr.h / 2, S.ref, pal);
    }
    m.cells.forEach((shape, i) => {
      const r = this._cellRect(i, m), sel = state.selected[i];
      g.fillStyle = '#fff'; g.strokeStyle = sel ? ACCENT : '#d5dde6'; g.lineWidth = sel ? 3 : 1;
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 7); g.fill(); g.stroke(); g.lineWidth = 1;
      this._drawShape(g, shape, r.x + r.w / 2, r.y + r.h / 2, S.cell, pal);
      if (sel) {
        g.beginPath(); g.arc(r.x + r.w - 12, r.y + 12, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(r.x + r.w - 16, r.y + 12); g.lineTo(r.x + r.w - 13, r.y + 15); g.lineTo(r.x + r.w - 8, r.y + 9); g.stroke(); g.lineWidth = 1;
      }
    });
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const n = env && env.manifest && Array.isArray(env.manifest.cells) ? env.manifest.cells.length : HARD.options;
    for (let i = 0; i < n; i++) {
      const r = this._cellRect(i, env && env.manifest);
      if (evt.x >= r.x && evt.x <= r.x + r.w && evt.y >= r.y && evt.y <= r.y + r.h) return [{ op: 'toggle', cell: i }];
    }
    return [];
  },

  footerStatus(env) { return `${env.state.selected.filter(Boolean).length} selected`; },
};

const EVAL_KEYS = new Set([284411070, 2124660255, 3592763100, 3767325352, 165106980, 316649884, 57800329, 219075729, 792371361, 2314133701, 3944173147, 2608639472]);
const armClass = (cells) => { const a = canonicalKey(cells), b = canonicalKey(mirrorOf(cells)); return a < b ? a : b; };
const UNBUILDABLE = new Set([2483126883, 426590749, 3872760343]);
let ARM_SIDE = null;
function armSide() {
  if (ARM_SIDE) return ARM_SIDE;
  const classes = new Set();
  const rec = (dirs, lens) => {
    if (dirs.length >= HARD_EXT.runs[0]) { const cells = walk(dirs, lens); if (armOk(dirs, cells, HARD_EXT)) classes.add(armClass(parseKey(normalizedKey(cells)))); }
    if (dirs.length === HARD_EXT.runs[1]) return;
    for (let di = 0; di < 6; di++) {
      if (dirs.length && axisOf(di) === axisOf(dirs[dirs.length - 1])) continue;
      for (let L = HARD_EXT.runLen[0]; L <= HARD_EXT.runLen[1]; L++) rec([...dirs, di], [...lens, L]);
    }
  };
  rec([], []);
  ARM_SIDE = splitIds('block_rotation_match_arm', [...classes].filter((c) => !UNBUILDABLE.has(hash32(c))).sort(), 3);
  return ARM_SIDE;
}
function randomArmExt(rng, split) {
  const side = armSide();
  for (let t = 0; t < 4000; t++) { const arm = randomArm(rng, HARD_EXT); if (arm && side(armClass(arm.cells)) === split) return arm; }
  return null;
}
function fitScale(shape, w, h) { const L = layout(shape, 1); return Math.min(w / (L.maxX - L.minX), h / (L.maxY - L.minY)); }
const EXT_LAYOUTS = ['top', 'topleft', 'topright', 'strip'];
function extRefRect(L) {
  if (L === 'topleft') return { x: 6, y: 6, w: 170, h: 150 };
  if (L === 'topright') return { x: 164, y: 6, w: 170, h: 150 };
  if (L === 'strip') return { x: 6, y: 6, w: 328, h: 146 };
  return { x: 90, y: 6, w: 160, h: 150 };
}
function extCellRect(i, L) {
  const w = 104, gap = L === 'topleft' ? 4 : L === 'topright' ? 8 : 6;
  const x0 = (BOARD_EXT.w - 3 * w - 2 * gap) / 2, y0 = 382 - 2 * w - gap - (L === 'top' ? 4 : 6);
  return { x: x0 + (i % 3) * (w + gap), y: y0 + Math.floor(i / 3) * (w + gap), w, h: w };
}
function extScales(m) {
  const r0 = extCellRect(0, m.ext.layout), rr = extRefRect(m.ext.layout);
  const cell = Math.max(CELL_SCALE, Math.min(CELL_DRAW_MAX, ...m.cells.map((c) => fitScale(c, r0.w - 18, r0.h - 18))));
  const ref = Math.max(REF_SCALE, Math.min(REF_DRAW_MAX, fitScale(m.reference, rr.w - 24, rr.h - 22)));
  return { cell, ref };
}
function extFitOk(m) {
  if (!m.ext || !EXT_LAYOUTS.includes(m.ext.layout)) return false;
  const r0 = extCellRect(0, m.ext.layout), rr = extRefRect(m.ext.layout);
  return Array.isArray(m.cells) && m.cells.every((c) => fitScale(c, r0.w - 10, r0.h - 10) >= CELL_SCALE)
    && fitScale(m.reference, rr.w - 10, rr.h - 10) >= REF_SCALE;
}
function generateExt(rng, split) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const arm = randomArmExt(rng, split);
    if (!arm) continue;
    const base = arm.cells, mirror = mirrorOf(base);
    const bad = new Set([canonicalKey(base), canonicalKey(mirror)]);
    const view = (shape, scale) => rng.shuffle(TURNS).map((t) => turned(shape, t.k, t.tip)).filter((s) => legible(s, scale));
    const refViews = [0, 1, 2, 3].map((k) => turned(base, k, 0)).filter((s) => legible(s, REF_SCALE));
    if (!refViews.length) continue;
    const reference = rng.pick(refViews);
    const used = new Set([normalizedKey(reference)]);
    const take = (cands) => { const s = cands.find((c) => !used.has(normalizedKey(c))); if (s) used.add(normalizedKey(s)); return s; };
    const correct = take(view(base, CELL_SCALE));
    if (!correct) continue;
    const options = [{ shape: correct, correct: true }];
    let ok = true;
    for (let i = 0; i < HARD_EXT.mirrors && ok; i++) { const s = take(view(mirror, CELL_SCALE)); if (s) options.push({ shape: s, correct: false }); else ok = false; }
    const editKeys = new Set(bad);
    for (let i = 0; i < HARD_EXT.edits && ok; i++) {
      const e = bentVariant(arm, rng, editKeys);
      const s = e && take(view(e, CELL_SCALE));
      if (s) { options.push({ shape: s, correct: false }); editKeys.add(canonicalKey(e)); } else ok = false;
    }
    if (!ok) continue;
    const cells = rng.shuffle(options);
    const m = {
      task: 'block_rotation_match', board: BOARD_EXT, panel: { ...PANEL_EXT }, cubes: base.length, palette: rng.int(0, PALETTES.length - 1),
      reference, cells: cells.map((o) => o.shape), answer: cells.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0),
      ext: { armClassHash: hash32(armClass(base)), layout: rng.pick(EXT_LAYOUTS) },
    };
    if (extFitOk(m) && !EVAL_KEYS.has(hash32(semanticKey(m)))) return m;
  }
  throw new Error('block_rotation_match: could not build an ext instance');
}

const BLOCK_FAMS = ['wood', 'stone', 'metal', 'concrete', 'painted'];
const PAINTS = ['#5f92d6', '#e0904e', '#62ae7c', '#9077d2', '#47a5a6', '#d0b43a'];
async function styleLook(st) {
  const blockPool = K.inSplit(st, 'brm_blockfam', BLOCK_FAMS).flatMap((f) => (f === 'painted' ? K.famPool(st, 'wood').slice(0, 6) : K.famPool(st, f)).map((t) => ({ t, f })));
  const tables = K.inSplit(st, 'brm_tablefam', ['wood', 'fabric', 'floor', 'stone']).flatMap((f) => K.famPool(st, f));
  const cards = K.inSplit(st, 'brm_cardfam', ['plaster', 'flat', 'concrete', 'wood']).flatMap((f) => K.famPool(st, f));
  const [bi, ti, ci] = st.primaryCombo('brm-scene', [blockPool.length, tables.length, cards.length]);
  const bk = blockPool[bi], tb = tables[ti], cd = cards[ci], R = st.rand;
  st.note(`tex:${bk.t.id}`); st.note(`tex:${tb.id}`); st.note(`tex:${cd.id}`); st.note(`brm_blockfam:${bk.f}`);
  const [bImg, tImg, cImg] = await Promise.all([K.texImg(bk.t), K.texImg(tb), K.texImg(cd)]);
  const paint = bk.f === 'painted' ? K.pickIn(st, 'brm_paint', PAINTS) : null;
  const base = bk.f === 'metal' ? 0.42 : bk.f === 'painted' ? 0.45 : 0.4 + R() * 0.12;
  const opt = (k) => bk.f === 'painted'
    ? { lum: Math.min(0.95, base * k), contrast: 0.3, sat: 0, tint: paint, tintK: 0.85 }
    : { lum: Math.min(0.95, base * k), contrast: bk.f === 'metal' ? 0.8 : 1.0, sat: bk.f === 'metal' ? 0.35 : 0.85 };
  return {
    faces: [K.swatch(bImg, opt(0.86)), K.swatch(bImg, opt(0.62)), K.swatch(bImg, opt(1.35))],
    table: K.swatch(tImg, { lum: 0.2 + R() * 0.14, contrast: 0.8, sat: 0.75 }),
    card: K.swatch(cImg, { lum: 0.84 + R() * 0.08, contrast: 0.3, sat: 0.4 }),
    texel: 70 + R() * 40, off: [R() * 256, R() * 256], tScale: 0.3 + R() * 0.3, fam: bk.f,
    edge: bk.f === 'metal' ? 'rgba(10,12,16,.75)' : 'rgba(20,16,12,.7)', radius: [3, 7, 10][Math.floor(R() * 3)],
    tileCards: R() < 0.55,
  };
}
function drawShapeStyled(g, shape, cx, cy, scale, L, salt) {
  const Lr = layout(shape, scale);
  const ox = cx - (Lr.minX + Lr.maxX) / 2, oy = cy - (Lr.minY + Lr.maxY) / 2, T = L.texel;
  const pats = L.faces.map((f) => g.createPattern(f, 'repeat'));
  for (const p of Lr.pts) {
    cubeQuads(ox + p.px, oy + p.py, Lr.w, Lr.d, Lr.h).forEach((q, k) => {
      g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath();
      const e1 = { x: q[1].x - q[0].x, y: q[1].y - q[0].y }, e2 = { x: q[3].x - q[0].x, y: q[3].y - q[0].y };
      const tu = (K.hash01(p.x, p.y, p.z, k, salt) * 256 + L.off[0]) % 256, tv = (K.hash01(p.z, p.x, k, p.y, salt) * 256 + L.off[1]) % 256;
      const a = e1.x / T, b = e1.y / T, c = e2.x / T, d = e2.y / T;
      const pt = pats[k];
      if (pt.setTransform && typeof DOMMatrix !== 'undefined') pt.setTransform(new DOMMatrix([a, b, c, d, q[0].x - tu * a - tv * c, q[0].y - tu * b - tv * d]));
      g.fillStyle = pt; g.fill();
      g.strokeStyle = L.edge; g.lineWidth = 0.9; g.lineJoin = 'round'; g.stroke();
    });
  }
}
function drawStyled(task, g, br, env, L) {
  const { manifest: m, state } = env, S = task._scales(m);
  g.save(); g.translate(br.x, br.y);
  K.layer(env.assets, 'brm-table', g, 0, 0, br.w, br.h, (cg) => {
    cg.fillStyle = K.pat(cg, L.table, { scale: L.tScale, ox: L.off[0], oy: L.off[1] }); cg.fillRect(0, 0, br.w, br.h);
    const vg = cg.createRadialGradient(br.w / 2, br.h * 0.4, 60, br.w / 2, br.h / 2, 280); vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    cg.fillStyle = vg; cg.fillRect(0, 0, br.w, br.h);
    const cardAt = (x, y, w, h, r) => {
      cg.fillStyle = 'rgba(0,0,0,0.4)'; cg.beginPath(); cg.roundRect(x + 2, y + 3, w, h, r); cg.fill();
      cg.beginPath(); cg.roundRect(x, y, w, h, r); cg.fillStyle = K.pat(cg, L.card, { scale: 0.45, ox: x * 3, oy: y }); cg.fill();
      cg.strokeStyle = 'rgba(0,0,0,0.25)'; cg.lineWidth = 1; cg.stroke();
    };
    const rf = task._refRect(m);
    cardAt(rf.x, rf.y, rf.w, rf.h, L.radius + 1);
    for (let i = 0; i < m.cells.length; i++) {
      const r = task._cellRect(i, m);
      if (L.tileCards) cardAt(r.x, r.y, r.w, r.h, L.radius);
      else { cg.fillStyle = 'rgba(0,0,0,0.22)'; cg.beginPath(); cg.ellipse(r.x + r.w / 2, r.y + r.h * 0.62, r.w * 0.42, r.h * 0.3, 0, 0, Math.PI * 2); cg.fill(); }
    }
  });
  const rf = task._refRect(m);
  drawShapeStyled(g, m.reference, rf.x + rf.w / 2, rf.y + rf.h / 2, S.ref, L, 99);
  m.cells.forEach((shape, i) => {
    const r = task._cellRect(i, m), sel = state.selected[i];
    drawShapeStyled(g, shape, r.x + r.w / 2, r.y + r.h / 2, S.cell, L, i);
    if (sel) {
      g.strokeStyle = ACCENT; g.lineWidth = 3; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, L.radius); g.stroke(); g.lineWidth = 1;
      g.beginPath(); g.arc(r.x + r.w - 12, r.y + 12, 8, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(r.x + r.w - 16, r.y + 12); g.lineTo(r.x + r.w - 13, r.y + 15); g.lineTo(r.x + r.w - 8, r.y + 9); g.stroke(); g.lineWidth = 1;
    }
  });
  g.restore();
}

export function semanticKey(m) {
  const arm = (() => { const a = canonicalKey(m.reference), b = canonicalKey(mirrorOf(m.reference)); return a < b ? a : b; })();
  const opts = m.cells.map((c, i) => normalizedKey(c) + (m.answer.includes(i) ? '*' : '')).sort().join('|');
  return `brm|${hash32(arm)}|${hash32(normalizedKey(m.reference))}|${hash32(opts)}`;
}
