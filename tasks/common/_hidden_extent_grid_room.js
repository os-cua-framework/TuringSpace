import * as S3 from './_style3d.js';
import { splitIds } from '../core/style.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toS = (v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
export const hexOf = (c) => '#' + c.map((v) => toS(v).toString(16).padStart(2, '0')).join('');
const rgba = (c, a) => `rgba(${toS(c[0])},${toS(c[1])},${toS(c[2])},${a})`;
const shade = (c, k) => c.map((v) => clamp(v * k, 0, 1));

function assetUrl(file) {
  const raw = `./assets/${file}`;
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[raw.replace(/^(?:\.\/)+/, '')] || raw;
}
const mkCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const SRGB2LIN = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
async function texTile(file, size, col, cv) {
  const bmp = await createImageBitmap(await (await fetch(assetUrl(file))).blob());
  const c = mkCanvas(size, size), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, size, size);
  const im = g.getImageData(0, 0, size, size), d = im.data, n = size * size, L = new Float32Array(n);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const l = 0.2126 * SRGB2LIN[d[i * 4]] + 0.7152 * SRGB2LIN[d[i * 4 + 1]] + 0.0722 * SRGB2LIN[d[i * 4 + 2]]; L[i] = l; s1 += l; s2 += l * l; }
  const m = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)), k = Math.min(1, cv / Math.max(1e-6, sd / Math.max(1e-6, m)));
  for (let i = 0; i < n; i++) {
    const t = clamp(1 + k * (L[i] / Math.max(1e-6, m) - 1), 0.55, 1.45);
    d[i * 4] = toS(col[0] * t); d[i * 4 + 1] = toS(col[1] * t); d[i * 4 + 2] = toS(col[2] * t); d[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}
function patFill(g, tile, px, sy = 1, ox = 0, oy = 0) {
  const p = g.createPattern(tile, 'repeat'), k = px / tile.width;
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([k, 0, 0, k * sy, ox, oy]));
  g.fillStyle = p; g.fill();
}

export const STACK_KINDS = ['cardboard', 'crate', 'tote', 'drawers', 'stone', 'suitcase'];
const SKINS_FOR = {
  pole: ['barrier', 'hazard', 'timber'], pipe: ['pipe'], rod: ['steel', 'brass'], 'bamboo cane': ['bamboo'], 'curtain rod': ['curtain'],
  hoop: ['hula', 'taped', 'rattan'], ring: ['wood', 'steel'], tyre: ['tyre'], 'wheel rim': ['rim'], 'rope ring': ['rope'],
};
const HULA = [['#1f8fd6', '#f7f5f0'], ['#2e9d57', '#f7f5f0'], ['#e8862a', '#5a3d8c'], ['#e04c8a', '#f2d34a'], ['#1aa6a6', '#f2efe6'], ['#7a4fc4', '#f5d74a'], ['#d9442c', '#f7f5f0'], ['#2a2f8f', '#e9e4d8']];
const TAPE = [['#2b3a4a', '#e9e4d8'], ['#7d1f2a', '#f2c94c'], ['#2f5d3a', '#f2efe6'], ['#444444', '#e8862a']];
const TOTE = ['#3d6fb0', '#3f8f5a', '#d9a531', '#5b5f66', '#c8553d', '#2f8c8c', '#8a8f86'];
const PAINT = ['#7f8a83', '#a39a84', '#5f6f63', '#8b9196', '#b4ab94', '#56636e', '#b7b0a3'];
const CASE = ['#2f3d4f', '#6b2f2f', '#3e5a3a', '#7a6a55', '#4a4a52', '#8a5a2b'];
const splitOf = (style, pool, kinds) => { const sp = splitIds(pool, kinds, 1); const k = kinds.filter((x) => sp(x) === style.split); return k.length ? k : kinds; };
function pickSplit(style, pool, items) {
  const id = (x) => (Array.isArray(x) ? x.join('/') : String(x));
  const list = splitOf(style, pool, items.map(id)), want = list[Math.floor(style.rand() * list.length)], it = items.find((x) => id(x) === want);
  style.note(`${pool}:${id(it)}`);
  return it;
}
const KRAFT = ['#c99a5e', '#b98d58', '#d0a76e', '#a9824f'];
const BAMBOO = ['#b9b25a', '#a7a24c', '#c4b86a'];
const TIMBER = ['#b98a52', '#a0744a', '#c79a62'];
const HOOP_WOOD = ['#c49a62', '#b0814e', '#d1ab74'];
const CLAMPS = [['#7d8790', '#5c656d'], ['#3f4549', '#2a2e31'], ['#9a8f7a', '#6f6656']];

export async function roomLook(style, shapeKind, noun = shapeKind) {
  const rnd = style.rand;
  const wall = style.primary('tex', (t) => t.use === 'wall' || (t.use === 'wood' && !/veneer|table|laminate|parquet|herringbone/.test(t.id))
    || (t.use === 'stone' && /wall|brick|block|slates/.test(t.id)));
  const ground = style.pick('tex', (t) => ['floor', 'wood', 'stone', 'terrain'].includes(t.use) && !/grate|grid/.test(t.id));
  const sk = splitOf(style, 'g01_hidden_extent_stack', STACK_KINDS);
  const stackKind = sk[style.primaryCombo('stack-kind', [sk.length])[0]];
  style.note(`g01_hidden_extent_stack:${stackKind}`);
  const wallCol = S3.scaleTo(S3.limitSat(wall.mean_lin, 0.14), 0.36 + 0.3 * rnd());
  const groundCol = S3.scaleTo(S3.limitSat(ground.mean_lin, 0.2), 0.1 + 0.16 * rnd());
  const skirtCol = rnd() < 0.5 ? shade(wallCol, 0.78) : S3.scaleTo(S3.limitSat(wall.mean_lin, 0.08), 0.6);
  const [wallTile, groundTile] = await Promise.all([texTile(wall.file, 256, wallCol, 0.22), texTile(ground.file, 256, groundCol, 0.28)]);
  let stack = { kind: stackKind, edge: '#3b3128' };
  if (stackKind === 'cardboard') {
    const base = S3.linOf(pickSplit(style, 'g01_kraft_tone', KRAFT));
    stack = { ...stack, tones: [0, 1, 2, 3].map((i) => hexOf(shade(base, 0.94 + 0.04 * i))), top: hexOf(shade(base, 1.18)), side: hexOf(shade(base, 0.8)), edge: hexOf(shade(base, 0.45)), tape: rgba(shade(base, 1.3), 0.8) };
  } else if (stackKind === 'crate' || stackKind === 'stone') {
    const t = style.pick('tex', stackKind === 'crate' ? (x) => x.use === 'wood' && !/laminate|parquet|herringbone/.test(x.id) : (x) => x.use === 'stone' && !/cobble|pebble|grassy|tile_floor|slab/.test(x.id));
    const base = stackKind === 'crate' ? S3.scaleTo(S3.limitSat(t.mean_lin, 0.45), 0.2 + 0.15 * rnd()) : S3.scaleTo(S3.limitSat(t.mean_lin, 0.12), 0.18 + 0.16 * rnd());
    stack = { ...stack, tile: await texTile(t.file, 256, base, stackKind === 'crate' ? 0.22 : 0.28), base, top: hexOf(shade(base, 1.2)), side: hexOf(shade(base, 0.72)), edge: hexOf(shade(base, 0.38)), px: stackKind === 'crate' ? 90 + 60 * rnd() : 120 + 80 * rnd() };
  } else {
    const list = stackKind === 'tote' ? TOTE : stackKind === 'drawers' ? PAINT : CASE;
    const base = S3.linOf(pickSplit(style, `g01_${stackKind}_colour`, list));
    stack = { ...stack, base, fill: hexOf(base), top: hexOf(shade(base, 1.22)), side: hexOf(shade(base, 0.72)), edge: hexOf(shade(base, 0.42)), hi: hexOf(shade(base, 1.35)), lo: hexOf(shade(base, 0.62)) };
  }
  const objKind = (SKINS_FOR[noun] || SKINS_FOR[shapeKind])[Math.floor(rnd() * (SKINS_FOR[noun] || SKINS_FOR[shapeKind]).length)];
  style.note(`g01_hidden_extent_skin:${objKind}`);
  const obj = { kind: objKind, band: 13 + Math.floor(10 * rnd()), mode: 'stripes' };
  const two = (list) => list[Math.floor(rnd() * list.length)];
  if (objKind === 'barrier') Object.assign(obj, { a: '#d8372f', b: '#f7f5f0', outline: '#2a2622' });
  else if (objKind === 'hazard') Object.assign(obj, { a: '#e9c02a', b: '#24211d', outline: '#1d1a17' });
  else if (objKind === 'bamboo') Object.assign(obj, { a: pickSplit(style, 'g01_bamboo_tone', BAMBOO), node: '#6f6a2c', outline: '#4a4620', band: 30 + Math.floor(16 * rnd()) });
  else if (objKind === 'timber') Object.assign(obj, { mode: 'bands', a: pickSplit(style, 'g01_timber_tone', TIMBER), b: '#6b4a2b', outline: '#3d2a18', band: 22 + Math.floor(12 * rnd()) });
  else if (objKind === 'steel') Object.assign(obj, { mode: shapeKind === 'pole' ? 'bands' : 'marks', a: '#6c757d', b: '#c2c8cd', outline: '#2c3136', band: 24 + Math.floor(14 * rnd()) });
  else if (objKind === 'brass') Object.assign(obj, { mode: 'bands', a: '#b8954a', b: '#7d6328', outline: '#4a3a14', band: 24 + Math.floor(14 * rnd()) });
  else if (objKind === 'pipe') { const [a, b] = two([['#7d868d', '#b9c0c5'], ['#b06a3b', '#7a4524'], ['#e6e6df', '#9a9a93']]); Object.assign(obj, { mode: 'bands', a, b, outline: '#2a2e31', band: 50 + Math.floor(20 * rnd()) }); }
  else if (objKind === 'curtain') { const [a, b] = two([['#2f2f33', '#8a8a90'], ['#8a5a32', '#c49a62']]); Object.assign(obj, { mode: 'bands', a, b, outline: '#151515', band: 16 + Math.floor(7 * rnd()) }); }
  else if (objKind === 'hula') { const [a, b] = pickSplit(style, 'g01_hula_colours', HULA); Object.assign(obj, { a, b, outline: '#2a2622' }); }
  else if (objKind === 'taped') { const [a, b] = pickSplit(style, 'g01_tape_colours', TAPE); Object.assign(obj, { a, b, outline: '#1f1c1a', band: 9 + Math.floor(6 * rnd()) }); }
  else if (objKind === 'wood') Object.assign(obj, { mode: 'marks', a: pickSplit(style, 'g01_hoop_wood_tone', HOOP_WOOD), b: '#8a6237', outline: '#4a3320', band: 26 + Math.floor(12 * rnd()) });
  else if (objKind === 'rim') Object.assign(obj, { mode: 'marks', a: '#59636c', b: '#c9ced2', outline: '#22272b', band: 20 + Math.floor(8 * rnd()) });
  else if (objKind === 'tyre') Object.assign(obj, { a: '#2a2a2a', b: '#4f4f4f', outline: '#0f0f0f', band: 6 + Math.floor(3 * rnd()) });
  else if (objKind === 'rope') Object.assign(obj, { a: '#c8a66a', b: '#93703e', outline: '#4f3b1f', band: 6 + Math.floor(3 * rnd()) });
  else Object.assign(obj, { a: '#c8a56a', b: '#9c7b45', outline: '#4f3b1f', band: 8 + Math.floor(4 * rnd()) });
  const clamps = pickSplit(style, 'g01_clamp_colours', CLAMPS);
  return {
    wallTile, groundTile, wallPx: 120 + 120 * rnd(), groundPx: 110 + 120 * rnd(), wallOx: rnd() * 200, groundOx: rnd() * 200,
    skirt: hexOf(skirtCol), skirtH: 5 + Math.floor(6 * rnd()), stack, obj, clamps,
    ids: { wall: wall.id, ground: ground.id, stack: stackKind, object: noun, skin: objKind },
  };
}

export function drawRoom(g, look, W, H, fy) {
  g.save();
  g.beginPath(); g.rect(0, 0, W, fy); patFill(g, look.wallTile, look.wallPx, 1, -look.wallOx, 0);
  const sh = g.createLinearGradient(0, 0, 0, fy); sh.addColorStop(0, 'rgba(255,255,255,.06)'); sh.addColorStop(1, 'rgba(0,0,0,.10)');
  g.fillStyle = sh; g.fillRect(0, 0, W, fy);
  g.fillStyle = look.skirt; g.fillRect(0, fy - look.skirtH, W, look.skirtH);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, fy - look.skirtH - 1, W, 1);
  g.beginPath(); g.rect(0, fy, W, H - fy); patFill(g, look.groundTile, look.groundPx, 0.35, -look.groundOx, fy);
  g.fillStyle = 'rgba(30,22,14,.22)'; g.fillRect(0, fy, W, 3);
  g.restore();
}

function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
export function drawStackBox(g, b, DEP, look, si, bi) {
  const { x, y, w, h } = b, S = look.stack;
  const side = [[x + w, y], [x + w + DEP.x, y + DEP.y], [x + w + DEP.x, y + h + DEP.y], [x + w, y + h]];
  const top = [[x, y], [x + DEP.x, y + DEP.y], [x + w + DEP.x, y + DEP.y], [x + w, y]];
  g.save();
  g.lineWidth = 1; g.strokeStyle = S.edge;
  poly(g, side); g.fillStyle = S.side; g.fill(); g.stroke();
  poly(g, top); g.fillStyle = S.top; g.fill(); g.stroke();
  g.beginPath(); g.rect(x, y, w, h);
  if (S.tile) patFill(g, S.tile, S.px, 1, x * 0.37 + si * 41, y * 0.21 + bi * 17);
  else { g.fillStyle = S.kind === 'cardboard' ? S.tones[si % S.tones.length] : S.fill; g.fill(); }
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (S.kind === 'cardboard') {
    g.fillStyle = S.tape; g.fillRect(x + w / 2 - 5, y, 10, h * 0.42);
    g.strokeStyle = 'rgba(80,58,30,.45)'; g.beginPath(); g.moveTo(x + 3, y + 8.5); g.lineTo(x + w - 3, y + 8.5); g.stroke();
  } else if (S.kind === 'crate') {
    const fw = Math.min(6, w * 0.12, h * 0.16);
    g.strokeStyle = 'rgba(20,12,6,.55)'; g.lineWidth = 1;
    g.strokeRect(x + fw + 0.5, y + fw + 0.5, w - 2 * fw - 1, h - 2 * fw - 1);
    const n = Math.max(2, Math.round((h - 2 * fw) / 11));
    for (let i = 1; i < n; i++) { const yy = Math.round(y + fw + (h - 2 * fw) * i / n) + 0.5; g.beginPath(); g.moveTo(x + fw, yy); g.lineTo(x + w - fw, yy); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, w, fw); g.fillRect(x, y + h - fw, w, fw);
  } else if (S.kind === 'stone') {
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else if (S.kind === 'tote') {
    g.fillStyle = S.hi; g.fillRect(x, y, w, 4);
    g.strokeStyle = S.lo; g.lineWidth = 1;
    for (let yy = y + 9; yy < y + h - 3; yy += 7) { g.beginPath(); g.moveTo(x + 4, Math.round(yy) + 0.5); g.lineTo(x + w - 4, Math.round(yy) + 0.5); g.stroke(); }
  } else if (S.kind === 'drawers') {
    const n = h > 48 ? 3 : 2; g.strokeStyle = S.lo; g.lineWidth = 1.2;
    for (let i = 1; i < n; i++) { const yy = Math.round(y + h * i / n) + 0.5; g.beginPath(); g.moveTo(x + 2, yy); g.lineTo(x + w - 2, yy); g.stroke(); }
    g.fillStyle = S.hi;
    for (let i = 0; i < n; i++) { const cy = y + h * (i + 0.5) / n; g.fillRect(x + w / 2 - 7, cy - 1.5, 14, 3); }
  } else if (S.kind === 'suitcase') {
    g.fillStyle = S.lo; const c = Math.min(7, w * 0.12, h * 0.18);
    g.fillRect(x, y, c, c); g.fillRect(x + w - c, y, c, c); g.fillRect(x, y + h - c, c, c); g.fillRect(x + w - c, y + h - c, c, c);
    g.strokeStyle = S.hi; g.lineWidth = 1;
    for (const fx of [0.3, 0.7]) { g.beginPath(); g.moveTo(Math.round(x + w * fx) + 0.5, y + c); g.lineTo(Math.round(x + w * fx) + 0.5, y + h - c); g.stroke(); }
  }
  g.restore();
  g.strokeStyle = S.edge; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.restore();
}

export function drawPoleSkin(g, s, HW, look, L) {
  const O = look.obj, tx = (s.b.x - s.a.x) / L, ty = (s.b.y - s.a.y) / L;
  g.save(); g.lineCap = 'butt';
  g.strokeStyle = O.outline; g.lineWidth = HW * 2 + 2.5;
  g.beginPath(); g.moveTo(s.a.x, s.a.y); g.lineTo(s.b.x, s.b.y); g.stroke();
  const seg = (t0, t1, col, wd = HW * 2 - 0.5) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(s.a.x + tx * t0, s.a.y + ty * t0); g.lineTo(s.a.x + tx * t1, s.a.y + ty * t1); g.stroke(); };
  if (O.kind === 'bamboo') {
    seg(0, L, O.a);
    for (let t = O.band * 0.6; t < L - 3; t += O.band) seg(t - 1.2, t + 1.2, O.node);
  } else if (O.mode === 'bands') {
    seg(0, L, O.a);
    for (let t = O.band * 0.5; t < L - 3; t += O.band) seg(t - 2, t + 2, O.b);
  } else {
    for (let t = 0, k = 0; t < L; t += O.band, k++) seg(t, Math.min(L, t + O.band), k % 2 ? O.b : O.a);
  }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(s.a.x - ty * 2.5, s.a.y + tx * 2.5); g.lineTo(s.b.x - ty * 2.5, s.b.y + tx * 2.5); g.stroke();
  for (const e of [s.a, s.b]) { g.beginPath(); g.arc(e.x, e.y, HW + 1, 0, Math.PI * 2); g.fillStyle = O.outline; g.fill(); }
  for (const t of [20, L - 20]) {
    g.save(); g.translate(s.a.x + tx * t, s.a.y + ty * t); g.rotate(Math.atan2(ty, tx));
    g.fillStyle = look.clamps[0]; g.fillRect(-4, -HW - 4, 8, HW * 2 + 8);
    g.fillStyle = look.clamps[1]; g.fillRect(-4, HW + 1, 8, 3);
    g.restore();
  }
  g.restore();
}
export function drawHoopSkin(g, s, HW, look) {
  const O = look.obj;
  g.save();
  if (s.hang) {
    const hx = s.c.x, hy = s.c.y - s.r - HW;
    g.strokeStyle = look.clamps[0]; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy - 12); g.lineTo(hx, hy + 2); g.stroke();
    g.fillStyle = look.clamps[1]; g.fillRect(hx - 6, hy - 16, 12, 6);
  }
  g.lineCap = 'butt';
  g.strokeStyle = O.outline; g.lineWidth = HW * 2 + 2.5;
  g.beginPath(); g.arc(s.c.x, s.c.y, s.r, 0, Math.PI * 2); g.stroke();
  const C = 2 * Math.PI * s.r, arc = (a0, a1, col) => { g.strokeStyle = col; g.lineWidth = HW * 2 - 0.5; g.beginPath(); g.arc(s.c.x, s.c.y, s.r, a0, a1); g.stroke(); };
  if (O.mode === 'marks') {
    arc(0, Math.PI * 2, O.a);
    const n = Math.max(6, Math.round(C / O.band));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; arc(a - 1.6 / s.r, a + 1.6 / s.r, O.b); }
  } else {
    const n = Math.max(8, Math.round(C / O.band / 2) * 2);
    for (let k = 0; k < n; k++) arc((k / n) * Math.PI * 2, ((k + 1) / n) * Math.PI * 2, k % 2 ? O.b : O.a);
  }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  g.beginPath(); g.arc(s.c.x, s.c.y, s.r - 2.5, 0, Math.PI * 2); g.stroke();
  g.restore();
}
