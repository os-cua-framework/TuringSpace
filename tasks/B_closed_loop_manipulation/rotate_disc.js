import { loadImage } from '../core/assets.js';
import { DISC_PHOTOS, photoUrl } from '../common/_photo_picks.js';
import { normDeg } from '../core/geom.js';
import { drawCover } from '../skins/draw.js';
import { drawPromptText } from '../core/panel.js';
import { coverCrop, drawCropN, photoFileUrl, extPhotos, nthItem, imgId, HELD_OUT_OI } from '../common/_oi_photos.js';
import { splitIds } from '../core/style.js';
import { DISC_OK } from '../common/_oi_photo_lists.js';

const BOARD = { w: 340, h: 268 };

const HARD = { tau: 3, theta: [40, 176], radius: 74, tilt: [25, 70] };
const EXT_HARD = { tau: 5, theta: [40, 176], radius: 74 };

const tiltOf = (m) => Number(m.tilt) || 0;

function tiltBox(w, h, cx, cy, deg) {
  const a = (Math.abs(deg) * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const bw = w * c + h * s + 4, bh = w * s + h * c + 4;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export default {
  meta: {
    name: 'rotate_disc', family: 'B', 
    boardH: 278, headerH: 50, footer: 'slider', board: BOARD,
    sliderHint: 'Slide to rotate',
    actionSpace: [{ op: 'slide', v: '0..1 (track fraction; spins the disc v*360° clockwise)', final: 'true on release (Verify submits; the slider can be moved again)' }],
    promptHuman: 'Rotate the disc to match the photo',
  },

  generate(rng, level, index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng, _knobs);
    const L = HARD;
    const photo = DISC_PHOTOS[Math.floor(rng.raw() * DISC_PHOTOS.length)];
    const sign = rng.sign();
    const theta0 = Math.round(sign * rng.uniform(L.theta[0], L.theta[1]));
    const tilt = Math.round(rng.sign() * rng.uniform(L.tilt[0], L.tilt[1]));
    return { task: 'rotate_disc', board: BOARD, photo, theta0, tilt, tau: L.tau, radius: L.radius };
  },

  init(manifest) { return { v: 0, angle: tiltOf(manifest) + manifest.theta0, released: false }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'slide') return { ok: false, reason: 'bad-op' };
    state.v = Math.min(1, Math.max(0, action.v));
    state.angle = tiltOf(manifest) + manifest.theta0 + state.v * 360;
    if (action.final) state.released = true;
    return { ok: true };
  },

  verify(state, manifest) {
    const off = normDeg(state.angle - tiltOf(manifest));
    const err = Math.abs(off);
    const success = state.released !== false && err <= manifest.tau;
    return { success, error: +err.toFixed(2), partial: 1 - err / 180, detail: { angle: +off.toFixed(2) } };
  },

  randomPolicy(m, rnd) { return [{ op: 'slide', v: +rnd().toFixed(4), final: true }]; },

  oracle(manifest) {
    const v = ((360 - (((manifest.theta0 % 360) + 360) % 360)) % 360) / 360;
    return [{ op: 'slide', v: +v.toFixed(4), final: true }];
  },

  async mount(env) {
    if (env.manifest.ext) { await mountExt(env); return; }
    env.assets.bg = await loadImage(photoUrl(env.manifest.photo));
  },

  onSlider(env, v, phase, hooks) {
    if (phase === 'move' || phase === 'down') hooks.dispatch({ op: 'slide', v });
    else if (phase === 'up') hooks.dispatch({ op: 'slide', v, final: true });
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Rotate the disc to match the photo');
  },

  drawBoard(g, br, env) {
    if (env.manifest.ext) { drawBoardExt(g, br, env); return; }
    const { manifest: m, state } = env;
    const img = env.assets.bg;
    const cx = br.w / 2, cy = br.h / 2, R = m.radius;
    const tilt = tiltOf(m), box = tiltBox(br.w, br.h, cx, cy, tilt);
    const rotated = (deg) => {
      g.translate(cx, cy); g.rotate((deg * Math.PI) / 180); g.translate(-cx, -cy);
      if (img) drawCover(g, img, box);
    };
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#dde3ea'; g.fillRect(0, 0, br.w, br.h);
    g.save(); rotated(tilt); g.restore();
    g.save();
    g.fillStyle = 'rgba(15,25,40,.28)';
    g.fillRect(0, 0, br.w, br.h);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.restore();
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    rotated(state.angle);
    g.restore();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R - 1.5, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.18)'; g.stroke();
    g.lineWidth = 1;
    g.restore();
  },

  pointer() { return []; },
  footerStatus() { return ''; },
};

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  return !!m && m.task === 'rotate_disc' && DISC_PHOTOS.includes(m.photo) && m.tau === HARD.tau
    && Math.abs(m.theta0) >= HARD.theta[0] && Math.abs(m.theta0) <= HARD.theta[1]
    && Number.isFinite(m.tilt) && Math.abs(m.tilt) >= HARD.tilt[0] && Math.abs(m.tilt) <= HARD.tilt[1];
}

const EXT = { zoom: [1, 1.15], pan: [0.25, 0.75], dx: 28, dy: 14 };
function generateExt(rng, knobs) {
  const pool = extPhotos(knobs, DISC_OK);
  if (!pool.length) throw new Error('rotate_disc: empty photo pool for ' + knobs.ext);
  const p = nthItem(pool, `rotate_disc|${knobs.ext}|photo`, knobs);
  const center = { x: Math.round(BOARD.w / 2 + rng.uniform(-EXT.dx, EXT.dx)), y: Math.round(BOARD.h / 2 + rng.uniform(-EXT.dy, EXT.dy)) };
  const theta0 = Math.round(rng.sign() * rng.uniform(EXT_HARD.theta[0], EXT_HARD.theta[1]) * 10) / 10;
  return { task: 'rotate_disc', board: BOARD, ext: knobs.ext, photoId: p.id, file: p.file, w: p.w, h: p.h, center, theta0, tau: EXT_HARD.tau, radius: EXT_HARD.radius };
}

function gateExt(m) {
  return m.task === 'rotate_disc' && (m.ext === 'train' || m.ext === 'test') && DISC_OK.has(m.photoId) && !HELD_OUT_OI.has(m.photoId)
    && m.tau === EXT_HARD.tau && m.radius === EXT_HARD.radius && Number.isFinite(m.theta0) && !m.tilt
    && Math.abs(m.theta0) >= EXT_HARD.theta[0] && Math.abs(m.theta0) <= EXT_HARD.theta[1]
    && !!m.center && Math.abs(m.center.x - BOARD.w / 2) <= EXT.dx + 0.5 && Math.abs(m.center.y - BOARD.h / 2) <= EXT.dy + 0.5;
}

async function mountExt(env) {
  const st = env.style, m = env.manifest;
  env.assets.bg = await loadImage(photoFileUrl(m.file));
  const u = (a, b) => (st ? a + (b - a) * st.rand() : (a + b) / 2);
  env.assets.crop = coverCrop(m, BOARD.w / BOARD.h, u(EXT.zoom[0], EXT.zoom[1]), u(EXT.pan[0], EXT.pan[1]), u(EXT.pan[0], EXT.pan[1]));
  env.assets.ring = st ? ringLook(st) : RING_LOOKS[0];
}

const RING_LOOKS = [
  { id: 'white', dim: 'rgba(15,25,40,.28)', ring: 'rgba(255,255,255,.85)', w: 2, inner: 'rgba(0,0,0,.18)' },
  { id: 'soft', dim: 'rgba(15,25,40,.16)', ring: 'rgba(250,250,250,.95)', w: 2.5, inner: 'rgba(0,0,0,.22)' },
  { id: 'dark', dim: 'rgba(10,12,18,.36)', ring: 'rgba(25,28,34,.70)', w: 2, inner: 'rgba(255,255,255,.22)' },
  { id: 'steel', dim: 'rgba(20,30,45,.22)', ring: 'rgba(200,208,218,.95)', w: 3, inner: 'rgba(40,48,60,.35)' },
  { id: 'warm', dim: 'rgba(40,25,10,.24)', ring: 'rgba(255,244,225,.9)', w: 2, inner: 'rgba(60,30,0,.2)' },
];
const ringSplit = splitIds('rotate_disc_ring', RING_LOOKS.map((r) => r.id), 1);
function ringLook(st) {
  const looks = RING_LOOKS.filter((r) => ringSplit(r.id) === st.split);
  const look = looks[Math.floor(st.rand() * looks.length)];
  st.note('rotate_disc_ring:' + look.id);
  return look;
}

function drawBoardExt(g, br, env) {
  const { manifest: m, state } = env;
  const img = env.assets.bg, crop = env.assets.crop, look = env.assets.ring || RING_LOOKS[0];
  const cx = m.center.x, cy = m.center.y, R = m.radius, full = { x: 0, y: 0, w: br.w, h: br.h };
  g.save();
  g.translate(br.x, br.y);
  if (img) drawCropN(g, img, crop, full);
  else { g.fillStyle = '#dde3ea'; g.fillRect(0, 0, br.w, br.h); }
  g.save();
  g.fillStyle = look.dim;
  g.fillRect(0, 0, br.w, br.h);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy); g.rotate((state.angle * Math.PI) / 180); g.translate(-cx, -cy);
  if (img) drawCropN(g, img, crop, full);
  g.restore();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
  g.lineWidth = look.w; g.strokeStyle = look.ring; g.stroke();
  g.beginPath(); g.arc(cx, cy, R - look.w / 2 - 0.5, 0, Math.PI * 2);
  g.lineWidth = 3; g.strokeStyle = look.inner; g.stroke();
  g.lineWidth = 1;
  g.restore();
}

export function semanticKey(m) {
  const t = Number(m.theta0) || 0;
  const k = `rotate_disc|${imgId(m.ext ? m.photoId : m.photo)}|${Math.sign(t)}${Math.round(Math.abs(t) / 15)}`;
  const tl = tiltOf(m);
  return tl ? `${k}|t${Math.sign(tl)}${Math.round(Math.abs(tl) / 15)}` : k;
}
