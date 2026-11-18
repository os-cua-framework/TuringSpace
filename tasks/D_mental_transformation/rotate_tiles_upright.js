import { loadImage } from '../core/assets.js';
import { drawPromptText } from '../core/panel.js';
import { TILE_UP_CUES, photoUrl } from '../common/_photo_picks.js';
import { extPhotos, photoFileUrl, imgId, HELD_OUT_OI } from '../common/_oi_photos.js';
import { nthOf } from '../core/style.js';
import { TILE_CUES } from '../common/_oi_photo_lists.js';

const BOARD = { w: 340, h: 300 };
const HARD = { n: 3, rotatedMin: 4, rotatedMax: 5, maxClicks: 12 };
const SIDE = 282, GAP = 3;
const OX = (BOARD.w - SIDE) / 2, OY = (BOARD.h - SIDE) / 2;
const PHOTOS = Object.keys(TILE_UP_CUES);

export default {
  meta: {
    name: 'rotate_tiles_upright', family: 'D', 
    boardH: 310, headerH: 52, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'rotate', cell: '0..8 (90° clockwise)' }],
    promptHuman: 'Turn the tiles so the photo is upright',
  },

  generate(rng, _level, index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng, _knobs);
    const photo = PHOTOS[Math.floor(rng.raw() * PHOTOS.length)];
    const cues = TILE_UP_CUES[photo];
    const cellCount = HARD.n * HARD.n;
    let rotations = new Array(cellCount).fill(0);
    for (let tries = 0; tries < 60; tries++) {
      rotations = new Array(cellCount).fill(0);
      const wrong = rng.shuffle(cues.slice())
        .slice(0, Math.min(cues.length, rng.int(HARD.rotatedMin, HARD.rotatedMax)));
      wrong.forEach((cell) => { rotations[cell] = rng.int(1, 3); });
      if (rotations.reduce((s, r) => s + (4 - r) % 4, 0) <= HARD.maxClicks) break;
    }
    return { task: 'rotate_tiles_upright', board: BOARD, n: HARD.n, bgFile: photo, rotations };
  },

  init(manifest) { return { rotations: manifest.rotations.slice(), turns: 0, last: -1 }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'rotate') return { ok: false, reason: 'bad-op' };
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= manifest.n * manifest.n) {
      return { ok: false, reason: 'bad-cell' };
    }
    state.rotations[action.cell] = (state.rotations[action.cell] + 1) % 4;
    state.turns++;
    state.last = action.cell;
    return { ok: true };
  },

  verify(state) {
    const correct = state.rotations.filter((r) => r === 0).length;
    return {
      success: correct === state.rotations.length,
      partial: correct / state.rotations.length,
      error: state.rotations.length - correct,
      detail: { correct, turns: state.turns },
    };
  },

  oracle(manifest) {
    const actions = [];
    manifest.rotations.forEach((r, cell) => {
      for (let k = 0; k < (4 - r) % 4; k++) actions.push({ op: 'rotate', cell });
    });
    return actions;
  },

  randomPolicy(m, rnd) {
    const actions = [];
    for (let cell = 0; cell < m.n * m.n; cell++) {
      const k = Math.floor(rnd() * 4);
      for (let t = 0; t < k; t++) actions.push({ op: 'rotate', cell });
    }
    return actions;
  },

  async mount(env) {
    env.assets.bg = await loadImage(env.manifest.ext ? photoFileUrl(env.manifest.file) : photoUrl(env.manifest.bgFile));
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Turn the tiles so the photo is upright', 'Tap a tile to turn it');
  },

  _cellRect(i, n) {
    const tile = (SIDE - GAP * (n - 1)) / n;
    return {
      x: OX + (i % n) * (tile + GAP),
      y: OY + Math.floor(i / n) * (tile + GAP),
      s: tile,
    };
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const img = env.assets.bg;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#e9edf2'; g.fillRect(0, 0, br.w, br.h);
    let cropX = 0, cropY = 0, cropSide = 1;
    if (img && m.ext) {
      cropSide = m.crop.w * img.width;
      cropX = m.crop.x * img.width;
      cropY = m.crop.y * img.height;
    } else if (img) {
      cropSide = Math.min(img.width, img.height);
      cropX = (img.width - cropSide) / 2;
      cropY = (img.height - cropSide) / 2;
    }
    for (let i = 0; i < m.n * m.n; i++) {
      const r = this._cellRect(i, m.n), cx = r.x + r.s / 2, cy = r.y + r.s / 2;
      g.save();
      g.beginPath(); g.rect(r.x, r.y, r.s, r.s); g.clip();
      g.translate(cx, cy); g.rotate(state.rotations[i] * Math.PI / 2);
      if (img) {
        const ss = cropSide / m.n;
        const sx = cropX + (i % m.n) * ss, sy = cropY + Math.floor(i / m.n) * ss;
        g.drawImage(img, sx, sy, ss, ss, -r.s / 2, -r.s / 2, r.s, r.s);
      } else {
        const hue = 195 + i * 7;
        g.fillStyle = `hsl(${hue},40%,${42 + (i % 3) * 8}%)`; g.fillRect(-r.s / 2, -r.s / 2, r.s, r.s);
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.beginPath(); g.moveTo(0, -r.s * 0.34); g.lineTo(r.s * 0.16, -r.s * 0.08); g.lineTo(r.s * 0.05, -r.s * 0.08);
        g.lineTo(r.s * 0.05, r.s * 0.3); g.lineTo(-r.s * 0.05, r.s * 0.3); g.lineTo(-r.s * 0.05, -r.s * 0.08);
        g.lineTo(-r.s * 0.16, -r.s * 0.08); g.closePath(); g.fill();
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.92)';
      g.lineWidth = 1.2;
      g.strokeRect(r.x + 0.75, r.y + 0.75, r.s - 1.5, r.s - 1.5);
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    for (let i = 0; i < env.manifest.n * env.manifest.n; i++) {
      const r = this._cellRect(i, env.manifest.n);
      if (evt.x >= r.x && evt.x <= r.x + r.s && evt.y >= r.y && evt.y <= r.y + r.s) {
        return [{ op: 'rotate', cell: i }];
      }
    }
    return [];
  },

  footerStatus(env) {
    const t = env.state.turns;
    return `${t} turn${t === 1 ? '' : 's'}`;
  },
};

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  const cues = TILE_UP_CUES[m?.bgFile];
  return !!cues && m.n === 3 && m.rotations?.length === 9
    && m.rotations.every((r, i) => Number.isInteger(r) && r >= 0 && r <= 3 && (r === 0 || cues.includes(i)))
    && m.rotations.filter(Boolean).length >= HARD.rotatedMin && m.rotations.filter(Boolean).length <= HARD.rotatedMax;
}

const winCrop = (p, key) => {
  const [f, u, v] = key.split(',').map(Number), s = f * Math.min(p.w, p.h);
  const r = (x) => Math.round(x * 1e5) / 1e5;
  return { x: r(((p.w - s) * u) / p.w), y: r(((p.h - s) * v) / p.h), w: r(s / p.w), h: r(s / p.h) };
};
function generateExt(rng, knobs) {
  const pool = extPhotos(knobs, TILE_CUES);
  if (!pool.length) throw new Error('rotate_tiles_upright: empty photo pool for ' + knobs.ext);
  const k = nthOf(`rotate_tiles_upright|${knobs.ext}|photo-round`, Number.isFinite(knobs.n) ? knobs.n : 1, pool.length * 8);
  const p = pool[k % pool.length], round = Math.floor(k / pool.length);
  const wins = Object.keys(TILE_CUES[p.id]);
  const win = wins[nthOf(`rotate_tiles_upright|${p.id}|window`, round + 1, wins.length)];
  const cues = TILE_CUES[p.id][win];
  let rotations = new Array(9).fill(0);
  for (let tries = 0; tries < 60; tries++) {
    rotations = new Array(9).fill(0);
    const wrong = rng.shuffle(cues.slice()).slice(0, Math.min(cues.length, rng.int(HARD.rotatedMin, HARD.rotatedMax)));
    wrong.forEach((cell) => { rotations[cell] = rng.int(1, 3); });
    if (rotations.reduce((s, r) => s + (4 - r) % 4, 0) <= HARD.maxClicks) break;
  }
  return { task: 'rotate_tiles_upright', board: BOARD, n: HARD.n, ext: knobs.ext, photoId: p.id, file: p.file, win, crop: winCrop(p, win), rotations };
}

function gateExt(m) {
  const cues = TILE_CUES[m.photoId]?.[m.win];
  const k = Array.isArray(m.rotations) ? m.rotations.filter(Boolean).length : -1;
  return m.task === 'rotate_tiles_upright' && (m.ext === 'train' || m.ext === 'test') && !!cues && !HELD_OUT_OI.has(m.photoId) && m.n === 3
    && !!m.crop && m.crop.w > 0 && m.crop.x >= 0 && m.crop.y >= 0 && m.crop.x + m.crop.w <= 1.00001 && m.crop.y + m.crop.h <= 1.00001
    && m.rotations.length === 9 && m.rotations.every((r, i) => Number.isInteger(r) && r >= 0 && r <= 3 && (r === 0 || cues.includes(i)))
    && k >= HARD.rotatedMin && k <= HARD.rotatedMax
    && m.rotations.reduce((s, r) => s + (4 - r) % 4, 0) <= HARD.maxClicks;
}

export function semanticKey(m) {
  return `rotate_tiles_upright|${imgId(m.ext ? m.photoId : m.bgFile)}|${m.ext ? m.win : 'centre'}|${(m.rotations || []).join('')}`;
}
