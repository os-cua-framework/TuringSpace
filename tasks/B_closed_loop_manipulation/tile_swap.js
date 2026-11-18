import { loadImage } from '../core/assets.js';
import { drawPromptText, ACCENT } from '../core/panel.js';
import { photoUrl } from '../common/_photo_picks.js';
import { splitIds, nthOf } from '../core/style.js';

const GRID = 3;
const TILE = 88;
const GAP = 2;
const SIDE = GRID * TILE + (GRID - 1) * GAP;
const BOARD = { w: 340, h: 300 };
const OX = (BOARD.w - SIDE) / 2, OY = (BOARD.h - SIDE) / 2;

const HARD = { swaps: 3 };

export const SWAP_PHOTOS = [
  'backgrounds/bg_city_05.jpg', 'backgrounds/bg_indoor_03.jpg', 'backgrounds/bg_indoor_04.jpg',
  'coco_grid/000000029596.jpg', 'coco_grid/000000007574.jpg', 'coco_grid/000000298396.jpg',
  'coco_grid/000000458410.jpg', 'coco_grid/000000514376.jpg', 'coco_grid/000000540502.jpg',
  'coco_grid/000000255165.jpg', 'coco_grid/000000520531.jpg', 'coco_grid/000000175364.jpg',
  'coco_grid/000000066817.jpg', 'coco_grid/000000194724.jpg', 'coco_grid/000000213224.jpg',
  'coco_grid/000000248314.jpg', 'coco_grid/000000250766.jpg', 'coco_grid/000000333772.jpg',
  'coco_grid/000000369751.jpg', 'coco_grid/000000527784.jpg', 'coco_grid/000000529568.jpg',
  'coco_grid/000000550322.jpg', 'coco_grid/000000555009.jpg', 'coco_grid/000000562059.jpg',
  'openimages_spatial/1b8500e0e4938e77.jpg', 'openimages_spatial/2ebea253f54ba55f.jpg',
  'openimages_spatial/3f6e15958d41abf9.jpg', 'openimages_spatial/aeb082b467a2c39e.jpg',
  'openimages_spatial/e456b97c9d61ff57.jpg', 'openimages_spatial/9f791f1ac0364b02.jpg',
  'openimages_spatial/a234b17c1813407c.jpg',
];
export const SWAP_LOOKALIKE = {
  'backgrounds/bg_city_05.jpg': ['02'], 'backgrounds/bg_indoor_04.jpg': ['27'],
  'coco_grid/000000458410.jpg': ['78'], 'coco_grid/000000369751.jpg': ['35'],
};
const lookalike = (file, a, b) => (SWAP_LOOKALIKE[file] || []).includes(`${Math.min(a, b)}${Math.max(a, b)}`);

const ALL_SCRAMBLES = (() => {
  const out = new Set();
  const rec = (perm, free, k) => {
    if (k === HARD.swaps) { out.add(perm.join('')); return; }
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const p = perm.slice(); [p[free[i]], p[free[j]]] = [p[free[j]], p[free[i]]];
      rec(p, free.filter((_, x) => x !== i && x !== j), k + 1);
    }
  };
  rec([0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8], 0);
  return [...out].sort();
})();
const EVAL_KEYS = new Set(['034125768', '512640387', '073248615', '765342108', '016573248', '842315760',
  '016387254', '512870643', '812354760', '108435672', '105432678', '103254678']);
const SCRAMBLE_SPLIT = splitIds('tile_swap|scramble', ALL_SCRAMBLES.filter((k) => !EVAL_KEYS.has(k)), 2);

function generateExt(rng, knobs) {
  const pool = ALL_SCRAMBLES.filter((k) => !EVAL_KEYS.has(k) && SCRAMBLE_SPLIT(k) === knobs.ext);
  const n = Number(knobs.n);
  const key = Number.isFinite(n) ? pool[nthOf(`tile_swap|${knobs.ext}|scramble`, n, pool.length)] : rng.pick(pool);
  return { task: 'tile_swap', board: BOARD, ext: 1, perm0: [...key].map(Number), swaps: HARD.swaps };
}

export function semanticKey(m) { return 'tile_swap|' + m.perm0.join(''); }

export default {
  meta: {
    name: 'tile_swap', family: 'B', 
    boardH: 310, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'swap', a: 'cell 0..8', b: 'cell 0..8' }],
    promptHuman: 'Swap tiles to fix the picture',
  },

  generate(rng, level, index, _knobs = {}) {
    if (_knobs && _knobs.ext) return generateExt(rng, _knobs);
    const L = HARD;
    const bg = { file: SWAP_PHOTOS[Math.floor(rng.raw() * SWAP_PHOTOS.length)] };
    const perm = Array.from({ length: GRID * GRID }, (_, i) => i);
    const touched = new Set();
    let guard = 0;
    while (touched.size < L.swaps * 2 && guard++ < 200) {
      const a = Math.floor(rng.raw() * perm.length);
      const b = Math.floor(rng.raw() * perm.length);
      if (a === b || touched.has(a) || touched.has(b) || lookalike(bg.file, a, b)) continue;
      [perm[a], perm[b]] = [perm[b], perm[a]];
      touched.add(a); touched.add(b);
    }
    return { task: 'tile_swap', board: BOARD, bgFile: bg.file, perm0: perm, swaps: L.swaps };
  },

  init(manifest) { return { perm: manifest.perm0.slice(), sel: -1, moves: 0 }; },

  applyAction(state, action) {
    if (action.op === 'select') { state.sel = action.a; return { ok: true }; }
    if (action.op !== 'swap') return { ok: false, reason: 'bad-op' };
    const { a, b } = action;
    if (a === b || a == null || b == null || a < 0 || b < 0 || a > 8 || b > 8) {
      return { ok: false, reason: 'bad-args' };
    }
    [state.perm[a], state.perm[b]] = [state.perm[b], state.perm[a]];
    state.moves++;
    state.sel = -1;
    return { ok: true };
  },

  verify(state, manifest) {
    const correct = state.perm.filter((v, i) => v === i).length;
    const success = correct === state.perm.length;
    return {
      success, partial: correct / state.perm.length,
      error: state.perm.length - correct,
      detail: { moves: state.moves, optimal: manifest.swaps },
    };
  },

  oracle(manifest) {
    const perm = manifest.perm0.slice();
    const acts = [];
    for (let i = 0; i < perm.length; i++) {
      if (perm[i] === i) continue;
      const j = perm.indexOf(i);
      acts.push({ op: 'swap', a: i, b: j });
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    return acts;
  },

  randomPolicy(m, rnd) {
    const out = [];
    while (out.length < HARD.swaps) {
      const a = Math.floor(rnd() * 9), b = Math.floor(rnd() * 9);
      if (a !== b) out.push({ op: 'swap', a, b });
    }
    return out;
  },

  async mount(env) {
    const photo = env.style ? env.style.primary('photo_swap') : null;
    env.assets.bg = await loadImage(photo ? 'assets/' + photo.file : photoUrl(env.manifest.bgFile || SWAP_PHOTOS[0]));
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Swap tiles to fix the picture', 'Tap two tiles to swap them');
  },

  drawBoard(g, br, env) {
    const { state } = env;
    const img = env.assets.bg;
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#f2f4f7';
    g.fillRect(0, 0, br.w, br.h);
    if (img) {
      const side = Math.min(img.width, img.height);
      const cx = (img.width - side) / 2, cy = (img.height - side) / 2;
      const ts = side / GRID;
      for (let cell = 0; cell < GRID * GRID; cell++) {
        const orig = state.perm[cell];
        const dx = OX + (cell % GRID) * (TILE + GAP);
        const dy = OY + Math.floor(cell / GRID) * (TILE + GAP);
        const sx = cx + (orig % GRID) * ts;
        const sy = cy + Math.floor(orig / GRID) * ts;
        g.drawImage(img, sx, sy, ts, ts, dx, dy, TILE, TILE);
        if (state.sel === cell) {
          g.strokeStyle = ACCENT; g.lineWidth = 3;
          g.strokeRect(dx + 1.5, dy + 1.5, TILE - 3, TILE - 3);
          g.lineWidth = 1;
        }
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const x = evt.x - OX, y = evt.y - OY;
    if (x < 0 || y < 0 || x >= SIDE || y >= SIDE) return [];
    const col = Math.min(GRID - 1, Math.floor(x / (TILE + GAP)));
    const row = Math.min(GRID - 1, Math.floor(y / (TILE + GAP)));
    const cell = row * GRID + col;
    const sel = env.state.sel;
    if (sel < 0) return [{ op: 'select', a: cell }];
    if (sel === cell) return [{ op: 'select', a: -1 }];
    return [{ op: 'swap', a: sel, b: cell }];
  },

  footerStatus(env) {
    const k = env.state.moves;
    return `${k} swap${k === 1 ? '' : 's'}`;
  },
};

export function gate(manifest) {
  const m = manifest, size = GRID * GRID;
  if (m && m.ext) {
    return m.task === 'tile_swap' && m.ext === 1 && m.board?.w === BOARD.w && m.board?.h === BOARD.h && m.swaps === HARD.swaps
      && Array.isArray(m.perm0) && ALL_SCRAMBLES.includes(m.perm0.join('')) && !EVAL_KEYS.has(m.perm0.join(''));
  }
  if (!m || m.task !== 'tile_swap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h
    || !SWAP_PHOTOS.includes(m.bgFile) || m.swaps !== HARD.swaps) return false;
  const p = m.perm0;
  if (!Array.isArray(p) || p.length !== size || new Set(p).size !== size
    || !Array.from(p).every((v) => Number.isInteger(v) && v >= 0 && v < size)) return false;
  return p.every((v, i) => p[v] === i && (v === i || !lookalike(m.bgFile, i, v))) && p.filter((v, i) => v !== i).length === HARD.swaps * 2;
}
