import { loadImage } from '../core/assets.js';
import { normDeg, clamp } from '../core/geom.js';
import { drawCover } from '../skins/draw.js';
import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import { coverCrop, drawCropN, photoFileUrl, extPhotos, imgId, HELD_OUT_OI } from '../common/_oi_photos.js';
import { nthOf } from '../core/style.js';
import { LEVEL_OK } from '../common/_oi_photo_lists.js';

const BOARD = { w: 340, h: 290 };
const HARD = { tiltMin: 10, tiltMax: 30, tau: 2, gain: 0.15, maxRot: 360 };

const PHOTOS = [
  'bg_landscape_02.jpg', 'bg_landscape_03.jpg', 'bg_landscape_04.jpg', 'bg_landscape_05.jpg',
  'bg_landscape_06.jpg', 'bg_landscape_08.jpg', 'bg_landscape_09.jpg',
  'bg_city_01.jpg', 'bg_city_03.jpg', 'bg_city_05.jpg', 'bg_city_06.jpg', 'bg_city_09.jpg',
  'bg_architecture_06.jpg', 'bg_architecture_07.jpg',
];

const PAD = 14;
const FRAME = { x: PAD, y: 12, w: BOARD.w - 2 * PAD, h: 196 };
const DIAL = { x: 20, y: 226, w: BOARD.w - 40, h: 50 };
const DIAL_GRAB = 10;
const OVERSCAN = Math.round(Math.hypot(FRAME.w, FRAME.h)) + 16;
const SP = 11;

export default {
  meta: {
    name: 'photo_level', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'rotate', delta: 'degrees, relative (horizontal drag = 0.15°/px)' }],
    promptHuman: 'Drag the dial to straighten the tilted photo (make it level).',
  },

  generate(rng, _level, index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng, _knobs);
    const pool = (index && index.backgrounds ? index.backgrounds : []).filter((b) => PHOTOS.includes(b.file));
    const file = pool.length ? pool[Math.floor(rng.raw() * pool.length)].file : PHOTOS[rng.int(0, PHOTOS.length - 1)];
    const tiltDeg = +(rng.sign() * rng.uniform(HARD.tiltMin, HARD.tiltMax)).toFixed(2);
    return { task: 'photo_level', board: BOARD, bgFile: file, tiltDeg, tau: HARD.tau, gain: HARD.gain, maxRot: HARD.maxRot };
  },

  init() { return { userRot: 0 }; },

  applyAction(state, action, manifest) {
    if (!action || action.op !== 'rotate') return { ok: false, reason: 'bad-op' };
    const d = Number(action.delta);
    if (!Number.isFinite(d)) return { ok: false, reason: 'bad-delta' };
    state.userRot = clamp(state.userRot + d, -manifest.maxRot, manifest.maxRot);
    return { ok: true };
  },

  verify(state, manifest) {
    const residual = normDeg(manifest.tiltDeg + state.userRot);
    const err = Math.abs(residual);
    return {
      success: err <= manifest.tau,
      error: +err.toFixed(2),
      partial: +clamp(1 - err / (HARD.tiltMax + 2), 0, 1).toFixed(3),
      detail: { residual: +residual.toFixed(2), userRot: +state.userRot.toFixed(2) },
    };
  },

  oracle(manifest) { return [{ op: 'rotate', delta: +(-manifest.tiltDeg).toFixed(2) }]; },

  oraclePoints(m) {
    const dx = -m.tiltDeg / m.gain, cx = DIAL.x + DIAL.w / 2, y = DIAL.y + DIAL.h / 2;
    return [{ from: [cx - dx / 2, y], to: [cx + dx / 2, y] }];
  },

  randomPolicy(m, rnd) { return [{ op: 'rotate', delta: rnd() * 360 - 180 }]; },

  async mount(env) {
    if (env.manifest.ext) { await mountExt(env); return; }
    env.assets.bg = await loadImage('assets/backgrounds/' + env.manifest.bgFile).catch(() => null);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Straighten the photo', 'Drag the dial until it looks level');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const img = env.assets.bg;
    const angle = (m.tiltDeg + st.userRot - (m.ext ? env.assets.level0 || 0 : 0)) * Math.PI / 180;
    g.save(); g.translate(br.x, br.y);

    g.fillStyle = '#eceff3'; g.fillRect(0, 0, br.w, br.h);

    const cx = FRAME.x + FRAME.w / 2, cy = FRAME.y + FRAME.h / 2;
    g.save();
    rr(g, FRAME.x, FRAME.y, FRAME.w, FRAME.h, 8); g.clip();
    g.save();
    g.translate(cx, cy); g.rotate(angle);
    if (img && m.ext && env.assets.crop) {
      if (env.assets.flip) g.scale(-1, 1);
      drawCropN(g, img, env.assets.crop, { x: -OVERSCAN / 2, y: -OVERSCAN / 2, w: OVERSCAN, h: OVERSCAN });
    } else if (img) {
      drawCover(g, img, { x: -OVERSCAN / 2, y: -OVERSCAN / 2, w: OVERSCAN, h: OVERSCAN });
    } else {
      g.fillStyle = '#9cc4e4'; g.fillRect(-OVERSCAN / 2, -OVERSCAN / 2, OVERSCAN, OVERSCAN);
      g.fillStyle = '#3f6d54'; g.fillRect(-OVERSCAN / 2, 0, OVERSCAN, OVERSCAN / 2);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.38)'; g.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = FRAME.x + FRAME.w * i / 3, gy = FRAME.y + FRAME.h * i / 3;
      g.beginPath(); g.moveTo(gx, FRAME.y); g.lineTo(gx, FRAME.y + FRAME.h); g.stroke();
      g.beginPath(); g.moveTo(FRAME.x, gy); g.lineTo(FRAME.x + FRAME.w, gy); g.stroke();
    }
    g.restore();

    g.strokeStyle = '#c3ccd6'; g.lineWidth = 1.5;
    rr(g, FRAME.x + 0.75, FRAME.y + 0.75, FRAME.w - 1.5, FRAME.h - 1.5, 8); g.stroke();

    this._drawDial(g, st);
    g.restore();
  },

  _drawDial(g, st) {
    const D = DIAL, midY = D.y + D.h / 2;
    rr(g, D.x, D.y, D.w, D.h, 10);
    g.save(); g.clip();
    g.fillStyle = '#f4f6f9'; g.fillRect(D.x, D.y, D.w, D.h);
    const shift = st.userRot / HARD.gain;
    const off = ((shift % SP) + SP) % SP;
    for (let x = D.x + (SP - off); x < D.x + D.w - 1; x += SP) {
      const worldK = Math.round((x - D.x + shift) / SP);
      const tall = ((worldK % 5) + 5) % 5 === 0;
      const h = tall ? 15 : 9;
      g.strokeStyle = tall ? '#9aa7b4' : '#c8d0d8'; g.lineWidth = tall ? 1.6 : 1;
      g.beginPath(); g.moveTo(x, midY - h / 2); g.lineTo(x, midY + h / 2); g.stroke();
    }
    for (const [gx0, gx1, x0] of [[0, 1, D.x], [1, 0, D.x + D.w - 22]]) {
      const grad = g.createLinearGradient(x0, 0, x0 + 22, 0);
      grad.addColorStop(0, `rgba(244,246,249,${gx0})`); grad.addColorStop(1, `rgba(244,246,249,${gx1})`);
      g.fillStyle = grad; g.fillRect(x0, D.y, 22, D.h);
    }
    g.restore();
    g.strokeStyle = '#d3dae1'; g.lineWidth = 1.2;
    rr(g, D.x + 0.6, D.y + 0.6, D.w - 1.2, D.h - 1.2, 10); g.stroke();
    const nx = D.x + D.w / 2;
    g.fillStyle = ACCENT;
    g.beginPath(); g.moveTo(nx, D.y + 13); g.lineTo(nx - 6, D.y + 2); g.lineTo(nx + 6, D.y + 2); g.closePath(); g.fill();
    g.strokeStyle = ACCENT; g.lineWidth = 2;
    g.beginPath(); g.moveTo(nx, D.y + 8); g.lineTo(nx, D.y + D.h - 5); g.stroke();
  },

  pointer(evt, env) {
    const gain = env.manifest.gain;
    if (evt.type === 'down') {
      const M = DIAL_GRAB;
      this._dragging = evt.x >= DIAL.x - M && evt.x <= DIAL.x + DIAL.w + M && evt.y >= DIAL.y - M && evt.y <= DIAL.y + DIAL.h + M;
      this._lastX = evt.x; return [];
    }
    if (evt.type === 'move' && this._dragging) {
      const dx = evt.x - this._lastX; this._lastX = evt.x;
      return dx ? [{ op: 'rotate', delta: dx * gain }] : [];
    }
    if (evt.type === 'up') { this._dragging = false; return []; }
    return [];
  },

  wantsMoveRedraw: true,
  footerStatus() { return 'Drag the dial'; },
};

export function gate(m) {
  if (m && m.ext) {
    return m.task === 'photo_level' && (m.ext === 'train' || m.ext === 'test') && m.board?.w === BOARD.w && m.board?.h === BOARD.h
      && Number.isFinite(m.tiltDeg) && Math.abs(m.tiltDeg) >= HARD.tiltMin && Math.abs(m.tiltDeg) <= HARD.tiltMax
      && Object.prototype.hasOwnProperty.call(LEVEL_OK, m.photoId) && !HELD_OUT_OI.has(m.photoId)
      && !!m.view && m.view.u >= 0 && m.view.u <= 1 && m.tau === HARD.tau && m.gain === HARD.gain && m.maxRot === HARD.maxRot;
  }
  return m?.task === 'photo_level' && m.board?.w === BOARD.w && m.board?.h === BOARD.h
    && PHOTOS.includes(m.bgFile) && Number.isFinite(m.tiltDeg)
    && Math.abs(m.tiltDeg) >= HARD.tiltMin && Math.abs(m.tiltDeg) <= HARD.tiltMax
    && m.tau === HARD.tau && m.gain === HARD.gain && m.maxRot === HARD.maxRot;
}

const LEVEL_BUCKETS = [[-22.49, -10], [-30, -22.5], [10, 22.49], [22.5, 30]];
function generateExt(rng, knobs) {
  const pool = extPhotos(knobs, LEVEL_OK);
  if (!pool.length) throw new Error('photo_level: empty photo pool for ' + knobs.ext);
  const k = nthOf(`photo_level|${knobs.ext}|photo-roll`, Number.isFinite(knobs.n) ? knobs.n : 1, pool.length * LEVEL_BUCKETS.length);
  const p = pool[k % pool.length], [lo, hi] = LEVEL_BUCKETS[Math.floor(k / pool.length)];
  const tiltDeg = +rng.uniform(lo, hi).toFixed(2);
  const view = { u: Math.round(rng.raw() * 1e4) / 1e4 };
  return { task: 'photo_level', board: BOARD, ext: knobs.ext, photoId: p.id, file: p.file, w: p.w, h: p.h, text: !!p.text, tiltDeg, view, tau: HARD.tau, gain: HARD.gain, maxRot: HARD.maxRot };
}
async function mountExt(env) {
  const st = env.style, m = env.manifest;
  env.assets.bg = await loadImage(photoFileUrl(m.file)).catch(() => null);
  const [roll, uLo, uHi] = LEVEL_OK[m.photoId];
  const vi = st ? Math.floor(st.rand() * 4) : 0;
  env.assets.flip = !m.text && (vi & 1) === 1;
  const zoom = m.text ? [1, 1.07, 1.14, 1.2][vi] : (vi & 2 ? 1.16 : 1);
  if (st) st.note(`photo_level_variant:${env.assets.flip ? 'mirror' : 'plain'}-${zoom}`);
  env.assets.level0 = env.assets.flip ? -roll : roll;
  env.assets.crop = coverCrop(m, 1, zoom, uLo + (uHi - uLo) * m.view.u, 0.5);
}

export function semanticKey(m) {
  const t = Number(m.tiltDeg) || 0;
  return `photo_level|${imgId(m.ext ? m.photoId : m.bgFile)}|${Math.sign(t)}${Math.round(Math.abs(t) / 15)}`;
}
