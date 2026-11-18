import { bgByTag, loadImage } from '../core/assets.js';
import { drawCover, plainBoard, drawGlyph, drawBadge, promptThumb, CHAR_COLORS } from '../skins/draw.js';
import { drawPromptText, UI_FONT } from '../core/panel.js';
import * as X from '../common/_char_click_fonts.js';
import { nthOf } from '../core/style.js';

const BOARD = { w: 340, h: 274 };
const BG_TAGS = ['landscape', 'city', 'nature', 'water', 'architecture', 'winter', 'desert'];

const EN_POOL = 'ABCDEFGHJKLMNPQRSTVWXY23456789'.split('');
const EN_ASYM = 'BCDEFGJKLNPQRS2345679'.split('');
const LOOKALIKE = ['3E', '25', '9P', 'JL', '8B', '5S', '2S'];
const lookalike = (a, b) => LOOKALIKE.includes([a, b].sort().join(''));
const EN_MIRROR = 'FGRBCDK'.split('');
const NS = 'SCB Noto Sans SC', KL = 'SCB ZCOOL KuaiLe', HY = 'SCB ZCOOL HuangYou';
const MIRROR_SKIP_FONTS = { G: [HY], B: [KL, HY], C: [NS, KL, HY], D: [KL, HY], K: [KL] };
const MIN_DX = 14, X_TIE = 22;
const MIRROR_ROT = 45, MIRROR_SHEAR = 0.12, GAP = 8, NEAR = 40, HALO = 3;
const INK = {
  en: { 'SCB Noto Sans SC': [-0.29, 0.32, -0.37, 0.4], 'SCB ZCOOL KuaiLe': [-0.34, 0.36, -0.36, 0.4],
    'SCB ZCOOL HuangYou': [-0.2, 0.21, -0.34, 0.39], 'SCB Noto Serif SC': [-0.34, 0.38, -0.37, 0.4] },
};
const hueFamily = (col) => ({ '#e8483f': 0, '#f04fa0': 0, '#ff8c1a': 1, '#ffd21f': 1, '#39c26d': 2, '#18b5a3': 2, '#2f8ef5': 3, '#8f5bf0': 3 })[col] ?? col;
function outline(c, lang, x, y, ink = INK[lang]) {
  const [l, r, t, b] = (ink[c.font] || [-0.56, 0.56, -0.52, 0.57]).map((v) => v * c.size);
  const a = c.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return [[l - HALO, t - HALO], [r + HALO, t - HALO], [r + HALO, b + HALO], [l - HALO, b + HALO]].map(([px, py]) => {
    let u = px + c.shear * py; if (c.flipH) u = -u;
    return [x + u * ca - py * sa, y + u * sa + py * ca];
  });
}
function polyGap(A, B) {
  const axes = (P) => P.map((p, i) => { const q = P[(i + 1) % P.length]; return [q[1] - p[1], p[0] - q[0]]; });
  const sep = [...axes(A), ...axes(B)].some(([ax, ay]) => {
    const pa = A.map(([x, y]) => x * ax + y * ay), pb = B.map(([x, y]) => x * ax + y * ay);
    return Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa);
  });
  if (!sep) return 0;
  const segD = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segD(p, Q[i], Q[(i + 1) % Q.length]));
  return d;
}

const HARD = { k: 4, decoys: 5, size: [30, 38], rot: 70, shear: 0.22, mirror: true, mirrorFrac: 0.5 };

const EN_ORDER_DECOYS = 10;
const EN_CONFUSE = {
  A: 'H4RV', B: 'RPDE', C: 'GQ6', D: 'PBQ', E: 'FBK', F: 'EPT', G: 'C6Q', H: 'NKX', J: 'T7Y', K: 'XRYH', L: 'TEF',
  M: 'NHA', N: 'HMK', P: 'RBDF', Q: 'GDC', R: 'PBK', S: '836', T: 'YF7J', V: 'YXA', W: 'VN', X: 'KYH', Y: 'VXTK',
  2: '73', 3: '829', 4: 'AH9', 5: '63', 6: 'G85', 7: 'TY2J', 8: '3S6', 9: '4QG3',
};
const HARD_LOOKALIKE = [...LOOKALIKE, 'MW', '69'];
const hardLookalike = (a, b) => HARD_LOOKALIKE.includes([a, b].sort().join(''));

function fontPool(index, lang) {
  return index.fonts.filter((f) => ['canonical', 'glyph-easy'].includes(f.role)).map((f) => f.family);
}

function place(rnd, chars, w, h, apart = null, fits = null) {
  const M = 28;
  for (const c of chars) {
    let ok = false;
    for (let t = 0; t < 500 && !ok; t++) {
      const x = M + rnd() * (w - 2 * M), y = M + 6 + rnd() * (h - 2 * M - 6);
      ok = (!fits || fits(c, x, y)) && chars.every((o) => o === c || o.x === undefined ||
        (Math.hypot(o.x - x, o.y - y) > (o.size + c.size) * 0.58 && (!apart || apart(o, c, x, y))));
      if (ok) { c.x = Math.round(x); c.y = Math.round(y); }
    }
    if (!ok) return false;
  }
  return true;
}

function generateExt(rng, lang, cue, split, n) {
  const fonts = X.extFonts(split);
  const ink = X.INK_EXT[lang];
  const glyphStyle = (extra, fontPool, rot, shear) => {
    const font = rng.pick(fontPool);
    return {
      size: Math.round(rng.uniform(HARD.size[0], HARD.size[1]) * (X.SIZE_K[font] || 1)),
      rot: Math.round(rng.uniform(-rot, rot)), shear: +(rng.uniform(-shear, shear)).toFixed(3),
      font, color: rng.pick(CHAR_COLORS), ...extra,
    };
  };
  if (cue === 'mirror') {
    const pairs = X.mirrorPairs(fonts);
    const src = [...pairs.keys()];
    const nG = 9;
    let chs = src.length >= nG ? rng.sample(src, nG) : [];
    while (chs.length < nG) chs.push(...rng.shuffle(src.slice()));
    const glyphs = chs.slice(0, nG).map((ch) => ({ ch }));
    const nMirror = rng.int(3, 6);
    const mirrorIdx = new Set(rng.sample(glyphs.map((_, i) => i), nMirror));
    glyphs.forEach((c, i) => {
      Object.assign(c, glyphStyle({ flipH: mirrorIdx.has(i), isTarget: mirrorIdx.has(i) }, pairs.get(c.ch), MIRROR_ROT, MIRROR_SHEAR));
      c.hitR = Math.max(20, Math.round(c.size * 0.55));
    });
    const fits = (c, x, y) => outline(c, lang, x, y, ink).every(([px, py]) => px >= 4 && py >= 4 && px <= BOARD.w - 4 && py <= BOARD.h - 4);
    const apart = (o, c, x, y) => (!(o.isTarget && c.isTarget) || Math.abs(o.x - x) >= MIN_DX) &&
      polyGap(outline(o, lang, o.x, o.y, ink), outline(c, lang, x, y, ink)) >= GAP;
    let placed = false;
    for (let t = 0; t < 200 && !placed; t++) { glyphs.forEach((c) => delete c.x); placed = place(rng.raw, glyphs, BOARD.w, BOARD.h, apart, fits); }
    if (!placed) throw new Error('char_click ext: mirror placement failed');
    glyphs.forEach((c, i) => {
      const near = glyphs.slice(0, i).filter((o) => polyGap(outline(o, lang, o.x, o.y, ink), outline(c, lang, c.x, c.y, ink)) < NEAR).map((o) => o.color);
      const fams = near.map(hueFamily);
      if (!fams.includes(hueFamily(c.color))) return;
      const free = CHAR_COLORS.filter((col) => !fams.includes(hueFamily(col)));
      c.color = rng.pick(free.length ? free : CHAR_COLORS.filter((col) => !near.includes(col)));
    });
    const order = glyphs.map((_, i) => i).filter((i) => glyphs[i].isTarget).sort((a, b) => glyphs[a].x - glyphs[b].x);
    return { task: 'char_click', board: BOARD, bgFile: null, ext: true, chars: glyphs, zOrder: rng.shuffle(glyphs.map((_, i) => i)), order, k: order.length, lang, cue, phrase: null };
  }
  const look = (a, b) => lookalike(a, b) || X.LOOKALIKE_EXT.includes([a, b].sort().join(''));
  let targets, phrase = null;
  const k = HARD.k;
  do targets = rng.sample(EN_POOL, k);
  while (targets.some((a, i) => targets.some((b, j) => j > i && look(a, b))));
  const nDecoy = HARD.decoys;
  const decoys = [];
  const src = EN_POOL;
  const okDecoy = (c) => !targets.includes(c) && !decoys.includes(c) && !(lang === 'en' && targets.some((t) => look(t, c)));
  while (decoys.length < nDecoy) { const c = rng.pick(src); if (okDecoy(c)) decoys.push(c); }
  let chars, ok = false, drop = 0;
  while (!ok && drop <= decoys.length) {
    chars = [
      ...targets.map((ch, i) => ({ ch, isTarget: true, orderIdx: i })),
      ...decoys.slice(0, decoys.length - drop).map((ch) => ({ ch, isTarget: false })),
    ];
    chars.forEach((c) => {
      const flipH = lang === 'en' && EN_ASYM.includes(c.ch) && rng.raw() < HARD.mirrorFrac;
      Object.assign(c, glyphStyle({ flipH }, fonts, HARD.rot, HARD.shear));
      c.hitR = Math.max(20, Math.round(c.size * 0.55));
      delete c.x;
    });
    ok = place(rng.raw, chars, BOARD.w, BOARD.h);
    drop++;
  }
  const zOrder = rng.shuffle(chars.map((_, i) => i));
  const order = [];
  for (let i = 0; i < targets.length; i++) order.push(chars.findIndex((c) => c.orderIdx === i));
  return { task: 'char_click', board: BOARD, bgFile: null, ext: true, chars, zOrder, order, k: targets.length, lang, cue, phrase };
}

export function semanticKey(m) {
  const cell = (c) => `${Math.floor(c.x / (BOARD.w / 8))}.${Math.floor(c.y / (BOARD.h / 8))}`;
  if (m.cue === 'mirror') return `char_click|mirror|${m.lang}|` + m.chars.map((c) => `${c.ch}${c.flipH ? '~' : ''}@${cell(c)}`).sort().join(' ');
  return `char_click|order|${m.lang}|` + m.order.map((i) => `${m.chars[i].ch}@${cell(m.chars[i])}`).join(' ') + '|' +
    m.chars.filter((c) => !c.isTarget).map((c) => c.ch).sort().join('');
}

export default {
  meta: {
    name: 'char_click', family: 'A', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'click', x: '0..340 board px', y: '0..252 board px' }],
    promptHuman: 'Click the characters in order',
  },

  generate(rng, level, index, knobs = {}) {
    const L = HARD;
    const lang = 'en';
    const cue = knobs.cue === 'mirror' ? 'mirror' : 'order';
    if (knobs.ext) return generateExt(rng, lang, cue, knobs.ext, knobs.n);
    const bg = bgByTag(index, rng.raw, BG_TAGS);
    const pool = fontPool(index, lang);
    const style = (extra, fonts = pool, rot = L.rot, shear = L.shear) => ({
      size: Math.round(rng.uniform(L.size[0], L.size[1])),
      rot: Math.round(rng.uniform(-rot, rot)),
      shear: +(rng.uniform(-shear, shear)).toFixed(3),
      font: rng.pick(fonts),
      color: rng.pick(CHAR_COLORS),
      ...extra,
    });

    if (cue === 'mirror') {
      const src = EN_MIRROR;
      const n = 9;
      let chs = src.length >= n ? rng.sample(src, n) : [];
      while (chs.length < n) chs.push(...rng.shuffle(src.slice()));
      const glyphs = chs.slice(0, n).map((ch) => ({ ch }));
      const nMirror = rng.int(3, 6);
      const mirrorIdx = new Set(rng.sample(glyphs.map((_, i) => i), nMirror));
      const mpool = pool;
      glyphs.forEach((c, i) => {
        const skip = lang === 'en' && MIRROR_SKIP_FONTS[c.ch];
        Object.assign(c, style({ flipH: mirrorIdx.has(i), isTarget: mirrorIdx.has(i) }, skip ? mpool.filter((f) => !skip.includes(f)) : mpool, MIRROR_ROT, MIRROR_SHEAR));
        c.hitR = Math.max(20, Math.round(c.size * 0.55));
        delete c.x;
      });
      const fits = (c, x, y) => outline(c, lang, x, y).every(([px, py]) => px >= 4 && py >= 4 && px <= BOARD.w - 4 && py <= BOARD.h - 4);
      const apart = (o, c, x, y) => (!(o.isTarget && c.isTarget) || Math.abs(o.x - x) >= MIN_DX) &&
        polyGap(outline(o, lang, o.x, o.y), outline(c, lang, x, y)) >= GAP;
      for (let t = 0; t < 200 && !place(rng.raw, glyphs, BOARD.w, BOARD.h, apart, fits); t++) glyphs.forEach((c) => delete c.x);
      glyphs.forEach((c, i) => {
        const near = glyphs.slice(0, i).filter((o) => polyGap(outline(o, lang, o.x, o.y), outline(c, lang, c.x, c.y)) < NEAR).map((o) => o.color);
        const fams = near.map(hueFamily);
        if (!fams.includes(hueFamily(c.color))) return;
        const free = CHAR_COLORS.filter((col) => !fams.includes(hueFamily(col)));
        c.color = rng.pick(free.length ? free : CHAR_COLORS.filter((col) => !near.includes(col)));
      });
      const order = glyphs.map((_, i) => i).filter((i) => glyphs[i].isTarget)
        .sort((a, b) => glyphs[a].x - glyphs[b].x);
      const zOrder = rng.shuffle(glyphs.map((_, i) => i));
      return {
        task: 'char_click', board: BOARD, bgFile: bg.file, chars: glyphs, zOrder, order,
        k: order.length, lang, cue, phrase: null,
      };
    }

    let targets, phrase = null;
    do targets = rng.sample(EN_POOL, L.k);
    while (targets.some((a, i) => targets.some((b, j) => j > i && hardLookalike(a, b))));
    const decoys = [];
    const src = EN_POOL;
    const okDecoy = (c) => !targets.includes(c) && !decoys.includes(c) && !(lang === 'en' && targets.some((t) => hardLookalike(t, c)));
    const nDecoy = lang === 'en' ? EN_ORDER_DECOYS : L.decoys;
    if (lang === 'en') {
      for (let round = 0; round < 2; round++) for (const t of targets) {
        const c = rng.shuffle(EN_CONFUSE[t].split('')).find(okDecoy);
        if (c && decoys.length < nDecoy) decoys.push(c);
      }
    }
    while (decoys.length < nDecoy) { const c = rng.pick(src); if (okDecoy(c)) decoys.push(c); }

    let chars, ok = false, drop = 0;
    while (!ok && drop <= decoys.length) {
      chars = [
        ...targets.map((ch, i) => ({ ch, isTarget: true, orderIdx: i })),
        ...decoys.slice(0, decoys.length - drop).map((ch) => ({ ch, isTarget: false })),
      ];
      chars.forEach((c) => {
        const flipH = L.mirror && lang === 'en' && EN_ASYM.includes(c.ch) && rng.raw() < L.mirrorFrac;
        Object.assign(c, style({ flipH }));
        c.hitR = Math.max(20, Math.round(c.size * 0.55));
        delete c.x;
      });
      ok = place(rng.raw, chars, BOARD.w, BOARD.h);
      drop++;
    }
    const zOrder = rng.shuffle(chars.map((_, i) => i));
    const order = [];
    for (let i = 0; i < targets.length; i++) order.push(chars.findIndex((c) => c.orderIdx === i));
    return { task: 'char_click', board: BOARD, bgFile: bg.file, chars, zOrder, order, k: targets.length, lang, cue, phrase };
  },

  init() { return { clicks: [] }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'click') return { ok: false, reason: 'bad-op' };
    const { x, y } = action;
    if (x == null || y == null) return { ok: false, reason: 'bad-args' };
    const bi = state.clicks.findIndex((c) => Math.hypot(c.x - x, c.y - y) <= 14);
    if (bi >= 0) { state.clicks.splice(bi, 1); return { ok: true, removed: bi }; }
    if (state.clicks.length >= manifest.k) return { ok: false, reason: 'full' };
    state.clicks.push({ x, y });
    return { ok: true };
  },

  verify(state, manifest) {
    const { chars, order, k } = manifest;
    const resolve = (c) => {
      let best = -1, bd = Infinity;
      chars.forEach((ch, i) => { const d = Math.hypot(ch.x - c.x, ch.y - c.y); if (d <= ch.hitR && d < bd) { bd = d; best = i; } });
      return best;
    };
    const seq = state.clicks.map(resolve);
    const tset = new Set(order), used = new Set();
    const fits = (g, i) => manifest.cue === 'mirror'
      ? tset.has(g) && !used.has(g) && order.every((u) => used.has(u) || chars[g].x < chars[u].x + X_TIE)
      : g === order[i];
    let prefix = 0;
    for (let i = 0; i < Math.min(seq.length, k); i++) { if (fits(seq[i], i)) { used.add(seq[i]); prefix++; } else break; }
    const success = seq.length === k && prefix === k;
    return { success, partial: prefix / k, error: k - prefix, detail: { seq, clicks: state.clicks.length } };
  },

  oracle(manifest) {
    return manifest.order.map((i) => ({ op: 'click', x: manifest.chars[i].x, y: manifest.chars[i].y }));
  },

  randomPolicy(m, rnd) {
    const ids = m.chars.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, m.k).map((i) => ({ op: 'click', x: m.chars[i].x, y: m.chars[i].y }));
  },

  async mount(env) {
    if (env.style) {
      const [{ framePhoto, noText }, { chooseGlyphLook }] = await Promise.all([import('../common/_photo_frame.js'), import('../common/_char_click_glyph.js')]);
      const photo = env.style.primary('photo', noText);
      const fr = await framePhoto(env.style, photo, BOARD.w, BOARD.h, { zoom: [1, 1.6], flip: true });
      env.assets.photo = fr.canvas;
      let sum = 0, n = 0;
      for (const c of env.manifest.chars) for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
        const x = Math.min(BOARD.w - 1, Math.max(0, Math.round(c.x + dx))), y = Math.min(BOARD.h - 1, Math.max(0, Math.round(c.y + dy)));
        sum += fr.L[y * BOARD.w + x]; n++;
      }
      env.assets.glyph = { look: chooseGlyphLook(env.style, sum / n), draw: (await import('../common/_char_click_glyph.js')).drawGlyphStyled };
      return;
    }
    env.assets.bg = await loadImage('assets/backgrounds/' + env.manifest.bgFile);
  },

  drawPrompt(g, r, env) {
    const { manifest, state } = env;
    if (manifest.cue === 'mirror') {
      drawPromptText(g, { x: r.x, y: r.y, w: r.w, h: r.h },
        'Click each mirrored character', 'Go from left to right');
      return;
    }
    drawPromptText(g, { x: r.x, y: r.y, w: r.w, h: r.h }, 'Click in order', '');
    g.font = `600 14px ${UI_FONT}`;
    const tx = r.x + g.measureText('Click in order').width + 12;
    const s = 32, gap = 7;
    manifest.order.forEach((ci, i) => {
      const x = tx + i * (s + gap), y = r.y + (r.h - s) / 2;
      promptThumb(g, x, y, s, (bx, by, bs) => {
        g.font = `700 ${bs - 10}px "SCB Noto Sans SC Bold", "SCB Noto Sans SC", ${UI_FONT}`;
        g.fillStyle = '#333b44';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(manifest.chars[ci].ch, bx + bs / 2, by + bs / 2 + 1);
      }, i < state.clicks.length);
    });
  },

  drawBoard(g, br, env) {
    const { manifest, state } = env;
    g.save();
    g.translate(br.x, br.y);
    if (env.style && env.assets.glyph) {
      g.drawImage(env.assets.photo, 0, 0, br.w, br.h);
      const { look, draw } = env.assets.glyph;
      for (const i of manifest.zOrder) draw(g, manifest.chars[i], look);
      state.clicks.forEach((c, n) => drawBadge(g, c.x, c.y, n + 1));
      g.restore();
      return;
    }
    if (env.skin === 'plain' || !env.assets.bg) plainBoard(g, { x: 0, y: 0, w: br.w, h: br.h });
    else drawCover(g, env.assets.bg, { x: 0, y: 0, w: br.w, h: br.h });
    for (const i of manifest.zOrder) drawGlyph(g, manifest.chars[i]);
    state.clicks.forEach((c, n) => drawBadge(g, c.x, c.y, n + 1));
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    return [{ op: 'click', x: Math.round(evt.x), y: Math.round(evt.y) }];
  },

  footerStatus(env) {
    const { manifest, state } = env;
    return `${state.clicks.length} of ${manifest.k} clicked · click a number to undo`;
  },
};
