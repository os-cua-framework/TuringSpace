import { loadImage } from '../core/assets.js';
import { drawCover } from '../skins/draw.js';
import { ANNOTATED_IMAGES, cleanBoxes } from '../common/_annotated_photo_common.js';
import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { extPhotos, coverCrop, drawCropN, imgId, HELD_OUT_OI } from '../common/_oi_photos.js';
import { nthOf } from '../core/style.js';
import { PATCH_OBJS } from '../common/_oi_photo_lists.js';
import { SPOTS, SPOT_STEP } from '../common/_photo_patch_locate_spots.js';

const BOARD = { w: 340, h: 374 };
const PHOTO = { x: 8, y: 8, w: 324, h: 196 };
const PATCH_BOX = 64;
const CS_MIN = 44, CS_MAX = 70;
const CROP_CTX = 1.25;
const SLOTS = 8;
const EXT_SLOTS = 4;
const ROW = 4, ROW_GAP = 8;
const CS_SET = [56, 64];
const tolHard = (cs) => cs / 2;
const SEP_TRUE = 1.0, SEP_DECOY = 0.75;
const TRAY_Y = 228;
const GRAB_PAD = 10;

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const tolOf = (cs) => Math.round(cs * Math.SQRT1_2);

function trayRect(i, n = SLOTS) {
  const per = Math.min(n, ROW), row = Math.floor(i / ROW), col = i % ROW;
  const gap = (PHOTO.w - per * PATCH_BOX) / (per + 1);
  return { x: PHOTO.x + gap + col * (PATCH_BOX + gap), y: TRAY_Y + row * (PATCH_BOX + ROW_GAP), w: PATCH_BOX, h: PATCH_BOX };
}

const LC_MAX = 3, OBJ_MAX = 4.5;
const SPOT_CACHE = new Map();
function objectRects(file, cs) {
  const im = ANNOTATED_IMAGES.find((x) => x.file === file);
  if (!im) return [];
  const lc = {};
  for (const b of im.bboxes || []) if (b.label) lc[b.label] = (lc[b.label] || 0) + 1;
  const ir = im.width / im.height, rr2 = PHOTO.w / PHOTO.h;
  const fx = (x) => ir > rr2 ? PHOTO.x + ((x - (1 - rr2 / ir) / 2) / (rr2 / ir)) * PHOTO.w : PHOTO.x + x * PHOTO.w;
  const fy = (y) => ir > rr2 ? PHOTO.y + y * PHOTO.h : PHOTO.y + ((y - (1 - ir / rr2) / 2) / (ir / rr2)) * PHOTO.h;
  return cleanBoxes(im, (b) => (lc[b.label] || 1) <= LC_MAX)
    .map((b) => ({ x0: fx(b.box.x_min), x1: fx(b.box.x_max), y0: fy(b.box.y_min), y1: fy(b.box.y_max) }))
    .filter((o) => Math.max(o.x1 - o.x0, o.y1 - o.y0) <= OBJ_MAX * cs);
}
function spotSet(file, cs) {
  const k = file + '|' + cs;
  if (!SPOT_CACHE.has(k)) {
    const e = SPOTS[file]?.[cs], set = new Set(), objs = objectRects(file, cs);
    const onObj = (x, y) => objs.some((o) => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);
    if (e) {
      const bit = (hex, i) => (parseInt(hex[i >> 2], 16) >> (3 - (i & 3))) & 1;
      for (let j = 0; j < e.ny; j++) for (let i = 0; i < e.nx; i++) {
        const q = j * e.nx + i;
        const x = PHOTO.x + e.x0 + SPOT_STEP * i, y = PHOTO.y + e.y0 + SPOT_STEP * j;
        if (bit(e.t, q) && bit(e.d, q) && onObj(x, y)) set.add(`${x},${y}`);
      }
    }
    SPOT_CACHE.set(k, set);
  }
  return SPOT_CACHE.get(k);
}
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

function coverSrc(img, r) {
  const ir = img.width / img.height, rr2 = r.w / r.h;
  if (ir > rr2) { const sh = img.height, sw = sh * rr2; return { sx: (img.width - sw) / 2, sy: 0, sw, sh }; }
  const sw = img.width, sh = sw / rr2; return { sx: 0, sy: (img.height - sh) / 2, sw, sh };
}

function drawRegion(g, img, sr, dest, crop = null, flip = false) {
  if (!img) { g.fillStyle = '#c8d2dc'; g.fillRect(dest.x, dest.y, dest.w, dest.h); return; }
  if (flip) {
    g.save(); g.translate(dest.x + dest.w, dest.y); g.scale(-1, 1);
    drawRegion(g, img, sr, { x: 0, y: 0, w: dest.w, h: dest.h }, crop, false);
    g.restore(); return;
  }
  if (crop) {
    const isx = (crop.x + ((sr.x - PHOTO.x) / PHOTO.w) * crop.w) * img.width, isy = (crop.y + ((sr.y - PHOTO.y) / PHOTO.h) * crop.h) * img.height;
    g.drawImage(img, isx, isy, (sr.w / PHOTO.w) * crop.w * img.width, (sr.h / PHOTO.h) * crop.h * img.height, dest.x, dest.y, dest.w, dest.h);
    return;
  }
  const { sx, sy, sw, sh } = coverSrc(img, PHOTO);
  const isx = sx + ((sr.x - PHOTO.x) / PHOTO.w) * sw;
  const isy = sy + ((sr.y - PHOTO.y) / PHOTO.h) * sh;
  const isw = (sr.w / PHOTO.w) * sw, ish = (sr.h / PHOTO.h) * sh;
  g.drawImage(img, isx, isy, isw, ish, dest.x, dest.y, dest.w, dest.h);
}

function objScreen(im, b) {
  const ir = im.width / im.height, rr2 = PHOTO.w / PHOTO.h;
  const cxN = (b.box.x_min + b.box.x_max) / 2, cyN = (b.box.y_min + b.box.y_max) / 2;
  const bwN = b.box.x_max - b.box.x_min, bhN = b.box.y_max - b.box.y_min;
  let scrX, scrY, objW, objH;
  if (ir > rr2) {
    const nsx = (1 - rr2 / ir) / 2, nsw = rr2 / ir;
    if (cxN < nsx || cxN > nsx + nsw) return null;
    scrX = PHOTO.x + ((cxN - nsx) / nsw) * PHOTO.w; scrY = PHOTO.y + cyN * PHOTO.h;
    objW = (bwN / nsw) * PHOTO.w; objH = bhN * PHOTO.h;
  } else {
    const nsy = (1 - ir / rr2) / 2, nsh = ir / rr2;
    if (cyN < nsy || cyN > nsy + nsh) return null;
    scrX = PHOTO.x + cxN * PHOTO.w; scrY = PHOTO.y + ((cyN - nsy) / nsh) * PHOTO.h;
    objW = bwN * PHOTO.w; objH = (bhN / nsh) * PHOTO.h;
  }
  const cs = Math.round(clampN(Math.max(objW, objH) * CROP_CTX, CS_MIN, CS_MAX));
  const tol = tolOf(cs), m = tol + 2, half = cs / 2;
  scrX = Math.round(scrX); scrY = Math.round(scrY);
  if (scrX < PHOTO.x + m || scrX > PHOTO.x + PHOTO.w - m || scrY < PHOTO.y + m || scrY > PHOTO.y + PHOTO.h - m) return null;
  if (scrX - half < PHOTO.x || scrX + half > PHOTO.x + PHOTO.w || scrY - half < PHOTO.y || scrY + half > PHOTO.y + PHOTO.h) return null;
  return { scrX, scrY, cs, tol };
}

function goodObjects(im) {
  const lc = {};
  for (const b of im.bboxes || []) if (b.label) lc[b.label] = (lc[b.label] || 0) + 1;
  return cleanBoxes(im, (b) => b.area >= 0.03 && b.area <= 0.14 && !b.flags?.truncated)
    .map((b) => { const o = objScreen(im, b); return o && { ...o, lc: lc[b.label] || 1 }; })
    .filter(Boolean);
}

const patchFrom = (file, o, isTrue) => ({ file, isTrue, cs: o.cs, src: { x: o.scrX - o.cs / 2, y: o.scrY - o.cs / 2, w: o.cs, h: o.cs } });

function generateScene(rng) {
  const files = ANNOTATED_IMAGES.map((im) => im.file).filter((f) => SPOTS[f]);
  for (let attempt = 0; attempt < 500; attempt++) {
    const file = rng.pick(files), cs = rng.pick(CS_SET);
    const spots = [...spotSet(file, cs)].map((k) => k.split(',').map(Number));
    if (spots.length < SLOTS) continue;
    const t = rng.pick(spots), picked = [];
    for (const d of rng.shuffle(spots)) {
      if (picked.length === SLOTS - 1) break;
      if (cheb(d, t) < SEP_TRUE * cs || picked.some((q) => cheb(d, q) < SEP_DECOY * cs)) continue;
      picked.push(d);
    }
    if (picked.length < SLOTS - 1) continue;
    const mk = (c, isTrue) => ({ file, isTrue, mirror: !isTrue, cs, src: { x: c[0] - cs / 2, y: c[1] - cs / 2, w: cs, h: cs } });
    const patches = rng.shuffle([mk(t, true), ...picked.map((c) => mk(c, false))]).map((p, slot) => ({ slot, ...p }));
    const m = {
      task: 'photo_patch_locate', design: 'mirror8', board: BOARD, photo: PHOTO, photoFile: file,
      patches, truthSlot: patches.findIndex((p) => p.isTrue), gt: { x: t[0], y: t[1] }, tol: tolHard(cs),
    };
    if (sceneGate(m)) return m;
  }
  throw new Error('photo_patch_locate: no scene');
}

function verifyScene(state, m) {
    const pickOK = state.picked === m.truthSlot;
    const dist = state.drop ? Math.hypot(state.drop.x - m.gt.x, state.drop.y - m.gt.y) : Infinity;
    const dropOK = dist <= m.tol;
    const success = pickOK && dropOK;
    return {
      success,
      partial: (pickOK ? 0.5 : 0) + (Number.isFinite(dist) ? 0.5 * Math.max(0, 1 - dist / (2 * m.tol)) : 0),
      error: success ? 0 : +Math.min(999, Number.isFinite(dist) ? dist : 999).toFixed(1),
      detail: { pickOK, placed: !!state.drop, dropDist: +Math.min(999, dist).toFixed(1), tol: m.tol },
    };
}

function sceneGate(m) {
  if (m?.task !== 'photo_patch_locate' || m.design !== 'mirror8' || m.patches?.length !== SLOTS) return false;
  const P = m.patches, cs = P[0]?.cs, set = spotSet(m.photoFile, cs);
  if (!CS_SET.includes(cs) || m.tol !== tolHard(cs)) return false;
  if (P.filter((p) => p.isTrue).length !== 1 || !Number.isInteger(m.truthSlot) || P[m.truthSlot]?.isTrue !== true) return false;
  if (P.some((p, i) => p.slot !== i || p.file !== m.photoFile || p.cs !== cs || p.mirror !== !p.isTrue)) return false;
  const c = P.map((p) => [p.src.x + p.src.w / 2, p.src.y + p.src.h / 2]);
  if (P.some((p, i) => p.src.w !== cs || p.src.h !== cs || !set.has(`${c[i][0]},${c[i][1]}`)
    || p.src.x < m.photo.x || p.src.y < m.photo.y || p.src.x + cs > m.photo.x + m.photo.w || p.src.y + cs > m.photo.y + m.photo.h)) return false;
  if (c[m.truthSlot][0] !== m.gt.x || c[m.truthSlot][1] !== m.gt.y) return false;
  for (let i = 0; i < SLOTS; i++) for (let j = i + 1; j < SLOTS; j++) {
    const k = (i === m.truthSlot || j === m.truthSlot) ? SEP_TRUE : SEP_DECOY;
    if (cheb(c[i], c[j]) < k * cs) return false;
  }
  return m.gt.x - m.tol >= m.photo.x && m.gt.x + m.tol <= m.photo.x + m.photo.w && m.gt.y - m.tol >= m.photo.y && m.gt.y + m.tol <= m.photo.y + m.photo.h;
}

function sceneGate4(m) { return m.task === 'photo_patch_locate' && m.patches?.length === 4 && m.patches.filter((p) => p.isTrue).length === 1 && Number.isInteger(m.truthSlot) && m.patches[m.truthSlot]?.isTrue === true && new Set(m.patches.map((p) => p.slot)).size === 4 && new Set(m.patches.map((p) => p.file)).size === 4 && m.patches[m.truthSlot].file === m.photoFile && m.patches.filter((p) => !p.isTrue).every((p) => p.file !== m.photoFile) && m.tol >= 31 && m.tol <= 49 && m.tol === Math.round(m.patches[m.truthSlot].cs * Math.SQRT1_2) && m.gt.x - m.tol >= m.photo.x && m.gt.x + m.tol <= m.photo.x + m.photo.w && m.gt.y - m.tol >= m.photo.y && m.gt.y + m.tol <= m.photo.y + m.photo.h && Math.abs(m.gt.x - (m.patches[m.truthSlot].src.x + m.patches[m.truthSlot].src.w / 2)) < 0.6 && Math.abs(m.gt.y - (m.patches[m.truthSlot].src.y + m.patches[m.truthSlot].src.h / 2)) < 0.6 && m.patches.every((p) => p.src.w === p.cs && p.src.h === p.cs && p.cs >= 44 && p.cs <= 70 && p.src.x >= m.photo.x && p.src.x + p.src.w <= m.photo.x + m.photo.w && p.src.y >= m.photo.y && p.src.y + p.src.h <= m.photo.y + m.photo.h); }

export default {
  meta: {
    name: 'photo_patch_locate', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [
      { op: 'pick', slot: '0..7' },
      { op: 'place', x: 'photo px', y: 'photo px' },
    ],
    promptHuman: 'Find the one patch cut straight from the photo (the other 7 are mirror images), then drag it to its spot.',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs);
    return generateScene(rng);
  },

  init() { return { picked: -1, drop: null }; },

  applyAction(state, action, manifest) {
    const m = manifest;
    if (action.op === 'pick') {
      if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= m.patches.length) return { ok: false, reason: 'bad-slot' };
      state.picked = action.slot;
      return { ok: true };
    }
    if (action.op === 'place') {
      if (state.picked < 0) return { ok: false, reason: 'pick-first' };
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: 'bad-xy' };
      state.drop = {
        x: clampN(action.x, m.photo.x, m.photo.x + m.photo.w),
        y: clampN(action.y, m.photo.y, m.photo.y + m.photo.h),
      };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    return verifyScene({ picked: state.picked, drop: state.drop }, m);
  },

  oracle(m) {
    return [{ op: 'pick', slot: m.truthSlot }, { op: 'place', x: m.gt.x, y: m.gt.y }];
  },

  oraclePoints(m) {
    const t = trayRect(m.truthSlot, m.patches.length), c = [t.x + t.w / 2, t.y + t.h / 2];
    return [{ at: c }, { from: c, to: [m.gt.x, m.gt.y] }];
  },

  randomPolicy(m, rnd) {
    const slot = Math.floor(rnd() * m.patches.length), margin = m.tol + 2;
    return [{ op: 'pick', slot }, { op: 'place',
      x: PHOTO.x + margin + rnd() * (PHOTO.w - 2 * margin),
      y: PHOTO.y + margin + rnd() * (PHOTO.h - 2 * margin) }];
  },

  async mount(env) {
    env.assets.byFile = {};
    const files = [...new Set(env.manifest.patches.map(p => p.file))];
    await Promise.all(files.map(async (f) => {
      try { env.assets.byFile[f] = await loadImage((env.manifest.ext ? 'assets/' : 'assets/openimages_spatial/') + f); }
      catch { env.assets.byFile[f] = null; }
    }));
  },

  drawPrompt(g, r, env) {
    if (env.manifest.ext) drawPromptText(g, r, 'Drag the matching patch to its spot', 'One patch was cut from this photo');
    else drawPromptText(g, r, 'Drag the exact patch to its spot', 'Only one is cut from this photo; 7 are mirrored');
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef1f5'; g.fillRect(0, 0, br.w, br.h);

    g.save();
    rr(g, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, 6); g.clip();
    if (env.assets?.byFile?.[m.photoFile] && m.ext) drawCropN(g, env.assets.byFile[m.photoFile], m.photoCrop, PHOTO);
    else if (env.assets?.byFile?.[m.photoFile]) drawCover(g, env.assets.byFile[m.photoFile], PHOTO);
    else { g.fillStyle = '#c8d2dc'; g.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h); }
    g.restore();
    rr(g, PHOTO.x + 0.5, PHOTO.y + 0.5, PHOTO.w - 1, PHOTO.h - 1, 6); g.strokeStyle = '#b7c2ce'; g.lineWidth = 1; g.stroke();

    if (s.drop && s.picked >= 0) {
      const p = m.patches[s.picked], img = env.assets?.byFile?.[p.file];
      const d = { x: s.drop.x - p.cs / 2, y: s.drop.y - p.cs / 2, w: p.cs, h: p.cs };
      g.save();
      rr(g, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, 6); g.clip();
      g.globalAlpha = 0.92; drawRegion(g, img, p.src, d, p.crop, !!p.mirror); g.globalAlpha = 1;
      rr(g, d.x, d.y, d.w, d.h, 4); g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.stroke();
      rr(g, d.x - 1.5, d.y - 1.5, d.w + 3, d.h + 3, 5); g.strokeStyle = ACCENT; g.lineWidth = 2; g.stroke();
      g.restore();
    }

    g.fillStyle = '#5a6673'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('Patches', PHOTO.x + 2, TRAY_Y - 8.5);

    const n = m.patches.length;
    for (let i = 0; i < n; i++) {
      const r = trayRect(i, n), p = m.patches[i], img = env.assets?.byFile?.[p.file];
      const held = this._drag && this._drag.slot === i;
      g.save();
      g.shadowColor = 'rgba(15,30,50,.18)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
      g.fillStyle = '#ffffff'; rr(g, r.x, r.y, r.w, r.h, 7); g.fill();
      g.shadowColor = 'transparent';
      g.save(); rr(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 5); g.clip();
      drawRegion(g, img, p.src, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, p.crop, !!p.mirror);
      if (held) { g.fillStyle = 'rgba(25,145,250,.16)'; g.fillRect(r.x, r.y, r.w, r.h); }
      g.restore();
      const sel = s.picked === i;
      rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 7);
      g.strokeStyle = sel ? ACCENT : '#d2dae2'; g.lineWidth = sel ? 3 : 1; g.stroke();
      if (sel) {
        g.fillStyle = ACCENT; g.beginPath(); g.arc(r.x + 12, r.y + 12, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `800 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('✓', r.x + 12, r.y + 12.5); g.textBaseline = 'alphabetic';
      }
      g.restore();
    }

    if (this._drag && this._ghost && s.picked >= 0) {
      const p = m.patches[s.picked], img = env.assets?.byFile?.[p.file];
      const d = { x: this._ghost.x - p.cs / 2, y: this._ghost.y - p.cs / 2, w: p.cs, h: p.cs };
      g.save(); g.globalAlpha = 0.85; drawRegion(g, img, p.src, d, p.crop, !!p.mirror); g.globalAlpha = 1;
      rr(g, d.x, d.y, d.w, d.h, 4); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
      g.restore();
    }
    g.restore();
  },

  pointer(evt, env) {
    const s = env.state;
    if (evt.type === 'down') {
      const n = env.manifest.patches.length;
      for (let i = 0; i < n; i++) {
        if (inRect(evt.x, evt.y, trayRect(i, n))) {
          this._drag = { slot: i, dx: 0, dy: 0, undo: s.drop && s.picked !== i ? s.picked : -1 }; this._ghost = { x: evt.x, y: evt.y };
          return [{ op: 'pick', slot: i }];
        }
      }
      if (s.picked >= 0 && s.drop) {
        const half = env.manifest.patches[s.picked].cs / 2 + GRAB_PAD;
        if (Math.abs(evt.x - s.drop.x) <= half && Math.abs(evt.y - s.drop.y) <= half) {
          this._drag = { slot: s.picked, dx: evt.x - s.drop.x, dy: evt.y - s.drop.y, undo: -1 }; this._ghost = { x: s.drop.x, y: s.drop.y }; return [];
        }
      }
      this._drag = null; this._ghost = null;
      return [];
    }
    if (evt.type === 'move' && this._drag) { this._ghost = { x: evt.x - this._drag.dx, y: evt.y - this._drag.dy }; return []; }
    if (evt.type === 'up' && this._drag) {
      const { dx, dy, undo } = this._drag;
      this._drag = null; this._ghost = null;
      if (inRect(evt.x, evt.y, PHOTO)) return [{ op: 'place', x: Math.round(evt.x - dx), y: Math.round(evt.y - dy) }];
      return undo >= 0 ? [{ op: 'pick', slot: undo }] : [];
    }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    const s = env.state;
    if (s.picked < 0) return 'Pick a patch';
    if (!s.drop) return 'Drag it onto the photo';
    return 'Patch placed';
  },
};

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  return m?.task === 'photo_patch_locate' && m.board?.w === BOARD.w && m.board?.h === BOARD.h
  && !('rounds' in m) && !m.ext && sceneGate(m);
}

const EXTZ = [1, 1.35];
function objScreenCrop(e, o, crop) {
  const [, x0, y0, x1, y1, lc] = o;
  const cxN = (x0 + x1) / 2, cyN = (y0 + y1) / 2;
  if (cxN < crop.x || cxN > crop.x + crop.w || cyN < crop.y || cyN > crop.y + crop.h) return null;
  let scrX = PHOTO.x + ((cxN - crop.x) / crop.w) * PHOTO.w, scrY = PHOTO.y + ((cyN - crop.y) / crop.h) * PHOTO.h;
  const objW = ((x1 - x0) / crop.w) * PHOTO.w, objH = ((y1 - y0) / crop.h) * PHOTO.h;
  const cs = Math.round(clampN(Math.max(objW, objH) * CROP_CTX, CS_MIN, CS_MAX));
  const tol = tolOf(cs), mg = tol + 2, half = cs / 2;
  scrX = Math.round(scrX); scrY = Math.round(scrY);
  if (scrX < PHOTO.x + mg || scrX > PHOTO.x + PHOTO.w - mg || scrY < PHOTO.y + mg || scrY > PHOTO.y + PHOTO.h - mg) return null;
  if (scrX - half < PHOTO.x || scrX + half > PHOTO.x + PHOTO.w || scrY - half < PHOTO.y || scrY + half > PHOTO.y + PHOTO.h) return null;
  if (Math.max(objW, objH) > CS_MAX * 2) return null;
  return { scrX, scrY, cs, tol, lc };
}
const PLACEABLE = new Map();
function placeable(p, o) {
  const key = p.id + '|' + o.join(',');
  if (!PLACEABLE.has(key)) {
    let ok = false;
    for (const z of [1, 1.15, 1.35]) for (const sx of [0.3, 0.5, 0.7]) for (const sy of [0.35, 0.5, 0.65]) {
      if (ok) break;
      const c = coverCrop(p, PHOTO.w / PHOTO.h, z), cx = (o[1] + o[3]) / 2, cy = (o[2] + o[4]) / 2;
      const crop = { x: Math.min(1 - c.w, Math.max(0, cx - sx * c.w)), y: Math.min(1 - c.h, Math.max(0, cy - sy * c.h)), w: c.w, h: c.h };
      ok = !!objScreenCrop(PATCH_OBJS[p.id], o, crop);
    }
    PLACEABLE.set(key, ok);
  }
  return PLACEABLE.get(key);
}
function viewAround(rng, p, o) {
  const c = coverCrop(p, PHOTO.w / PHOTO.h, rng.uniform(EXTZ[0], EXTZ[1]));
  const sx = rng.uniform(0.18, 0.82), sy = rng.uniform(0.2, 0.8);
  const cx = (o[1] + o[3]) / 2, cy = (o[2] + o[4]) / 2;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  return { x: r4(Math.min(1 - c.w, Math.max(0, cx - sx * c.w))), y: r4(Math.min(1 - c.h, Math.max(0, cy - sy * c.h))), w: c.w, h: c.h };
}
function viewOf(rng, p) {
  return coverCrop(p, PHOTO.w / PHOTO.h, rng.uniform(EXTZ[0], EXTZ[1]), rng.raw(), rng.raw());
}
function generateExt(rng, knobs) {
  const pool = extPhotos(knobs, PATCH_OBJS);
  if (pool.length < EXT_SLOTS) throw new Error('photo_patch_locate: photo pool too small for ' + knobs.ext);
  const pairs = pool.flatMap((q) => PATCH_OBJS[q.id].objs.map((o, j) => [q, j, o])).filter(([q, , o]) => placeable(q, o));
  const k0 = nthOf(`photo_patch_locate|${knobs.ext}|photo-object`, Number.isFinite(knobs.n) ? knobs.n : 1, pairs.length);
  for (let a = 0; a < 200 * pairs.length; a++) {
    const [p, j] = pairs[(k0 + Math.floor(a / 200)) % pairs.length], e = PATCH_OBJS[p.id];
    const crop = viewAround(rng, p, e.objs[j]);
    const main = objScreenCrop(e, e.objs[j], crop);
    if (!main) continue;
    const others = rng.shuffle(pool.filter((q) => q.id !== p.id)).slice(0, 12);
    const decoys = [];
    for (const q of others) {
      if (decoys.length === EXT_SLOTS - 1) break;
      const qc = viewOf(rng, q), qo = PATCH_OBJS[q.id].objs.map((o) => objScreenCrop(PATCH_OBJS[q.id], o, qc)).filter(Boolean);
      if (qo.length) decoys.push({ ...patchFrom(q.file, rng.pick(qo), false), crop: qc });
    }
    if (decoys.length < EXT_SLOTS - 1) continue;
    const truePatch = { ...patchFrom(p.file, main, true), crop };
    const patches = rng.shuffle([truePatch, ...decoys]).map((q, slot) => ({ slot, ...q }));
    const m = {
      task: 'photo_patch_locate', board: BOARD, photo: PHOTO, ext: knobs.ext, photoId: p.id, photoFile: p.file, photoCrop: crop, truthObj: j,
      patches, truthSlot: patches.findIndex((q) => q.isTrue), gt: { x: main.scrX, y: main.scrY }, tol: main.tol,
    };
    if (gateExt(m)) return m;
  }
  throw new Error('photo_patch_locate: no ext scene');
}
function gateExt(m) {
  const ok = (c) => !!c && [c.x, c.y, c.w, c.h].every(Number.isFinite) && c.x >= -1e-4 && c.y >= -1e-4 && c.x + c.w <= 1.0002 && c.y + c.h <= 1.0002;
  return m.task === 'photo_patch_locate' && (m.ext === 'train' || m.ext === 'test') && m.board?.w === BOARD.w && m.board?.h === BOARD.h
    && !!PATCH_OBJS[m.photoId] && !HELD_OUT_OI.has(m.photoId) && !m.patches?.some((q) => HELD_OUT_OI.has(imgId(q.file))) && ok(m.photoCrop) && m.patches?.every((q) => ok(q.crop)) && sceneGate4(m);
}

export function semanticKey(m) {
  const obj = m.ext ? `o${m.truthObj}` : `${Math.round(m.gt.x / (BOARD.w / 8))},${Math.round(m.gt.y / (BOARD.h / 8))}`;
  return `photo_patch_locate|${imgId(m.ext ? m.photoId : m.photoFile)}|${obj}`;
}
