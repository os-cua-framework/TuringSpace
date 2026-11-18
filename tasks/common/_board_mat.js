import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';

const idOfItem = (x) => (x && typeof x === 'object' && x.id !== undefined ? String(x.id) : Array.isArray(x) ? x.join(',') : String(x));
export function splitPool(style, pool, items, minTest = 1) {
  const sp = splitIds(pool, items.map(idOfItem), minTest);
  return items.filter((it) => sp(idOfItem(it)) === style.split);
}
export function pickSplit(style, pool, items, minTest = 1) {
  const L = splitPool(style, pool, items, minTest);
  const it = L[Math.floor(style.rand() * L.length) % L.length];
  style.note(`${pool}:${idOfItem(it)}`);
  return it;
}
export function splitColours(style, pool, palette, n, minTest = 1) {
  const L = splitPool(style, pool, palette, minTest).slice();
  for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(style.rand() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; }
  style.note(`${pool}:${L.join('/')}`);
  const out = [];
  for (let k = 0; out.length < n; k++) {
    const base = L[k % L.length], round = Math.floor(k / L.length);
    out.push(round === 0 ? base : round % 2 ? mixHex(base, '#ffffff', 0.35 * Math.ceil(round / 2)) : shadeHex(base, 1 - 0.3 * (round / 2)));
  }
  return out;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const mixHex = (a, b, t) => { const p = hexRGB(a), q = hexRGB(b); return rgbHex(p.map((v, k) => v * (1 - t) + q[k] * t)); };
export const shadeHex = (hex, f) => rgbHex(hexRGB(hex).map((v) => v * f));
export const rgba = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const relLum = (hex) => { const [r, g, b] = hexRGB(hex).map(s2l); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const lin2hex = (c) => rgbHex(c.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055)));
export const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

export const ISO_TEX = new Set(('asphalt_floor granular_concrete terlenka asphalt_pit_lane concrete_floor_worn_001 terry_cloth '
  + 'gravel_embedded_concrete crepe_satin rocky_trail cotton_jersey red_laterite_soil_stones clean_pebbles concrete_floor_01 '
  + 'plastered_wall_05 velour_velvet forrest_ground_01 brown_mud_leaves_01 plastered_wall gravelly_sand forest_ground_04 '
  + 'brown_mud_dry cracked_concrete worn_rock_natural_01 rocks_ground_01 clay_floor_001 seaside_rock rock_04 garage_floor '
  + 'rocky_trail_02 rock_05 gray_rocks scuffed_cement hangar_concrete_floor rock_01 forest_leaves_02 lichen_rock rocky_terrain_02 '
  + 'rock_boulder_cracked concrete_wall_007 rock_wall_11 dry_ground_rocks mossy_rock gravel_concrete rock_pitted_mossy '
  + 'sandstone_cracks brushed_concrete aerial_rocks_04 forest_leaves_04 brown_mud asphalt_06 brown_mud_02 concrete_floor_painted '
  + 'coast_sand_rocks_02 grass_path_2 white_rough_plaster dry_riverbed_rock rock_08 dirty_carpet sandy_gravel_02 concrete_wall_008 '
  + 'rock_06 aerial_grass_rock asphalt_01 asphalt_02 snow_01 concrete_floor_02 brown_mud_03 rock_wall_08 rock_wall_02 rock_face_03 '
  + 'rock_wall_04 ganges_river_pebbles sand_01').split(' '));

export function jitterHex(hex, u1, u2, dl = 0.06, dh = 0) {
  let [r, g, b] = hexRGB(hex);
  const f = 1 + (u1 * 2 - 1) * dl;
  if (dh) { const t = (u2 * 2 - 1) * dh / 60; r += t * 12; b -= t * 12; }
  return rgbHex([r * f, g * f, b * f]);
}

const SWATCH = new Map();
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function swatch(file, { size = 256, mode = 'real', L = 0.55, k = 1, sat = 1, tint = '#888888', amp = 0.3, hp = 0, warm = null } = {}) {
  const key = `${file}|${size}|${mode}|${L}|${k}|${sat}|${tint}|${amp}|${hp}|${warm}`;
  if (SWATCH.has(key)) return SWATCH.get(key);
  const p = loadImage('assets/' + file).then((img) => {
    const c = mk(size, size), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, size, size);
    let im;
    try { im = g.getImageData(0, 0, size, size); } catch { return c; }
    const d = im.data, n = size * size;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
    let low = null;
    if (hp > 0) low = boxBlur(boxBlur(lum, size, hp), size, hp);
    let mean = 0; for (let i = 0; i < n; i++) mean += lum[i]; mean /= n;
    let ss = 0; for (let i = 0; i < n; i++) { const v = lum[i] - (low ? low[i] : mean); ss += v * v; }
    const std = Math.sqrt(ss / n) || 1;
    const target = clamp(L, 0.02, 0.98) * 255;
    const [tr, tg, tb] = hexRGB(tint);
    for (let i = 0; i < n; i++) {
      const det = (lum[i] - (low ? low[i] : mean)) / std;
      if (mode === 'tint') {
        const f = 1 + amp * clamp(det / 2, -1, 1);
        d[4 * i] = tr * f; d[4 * i + 1] = tg * f; d[4 * i + 2] = tb * f;
      } else {
        const Li = Math.max(1, lum[i]);
        const Lnew = clamp(target + k * det * std * (target / Math.max(8, mean)), 2, 253);
        let r = d[4 * i] / Li * Lnew, gg = d[4 * i + 1] / Li * Lnew, b = d[4 * i + 2] / Li * Lnew;
        if (sat !== 1) { r = Lnew + (r - Lnew) * sat; gg = Lnew + (gg - Lnew) * sat; b = Lnew + (b - Lnew) * sat; }
        if (warm) { r *= warm[0]; gg *= warm[1]; b *= warm[2]; }
        d[4 * i] = r; d[4 * i + 1] = gg; d[4 * i + 2] = b;
      }
      d[4 * i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    let vc = 0, vr = 0, tot = 0;
    const col = new Float32Array(size), row = new Float32Array(size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = lum[y * size + x] - mean; col[x] += v / size; row[y] += v / size; tot += v * v; }
    for (let i = 0; i < size; i++) { vc += col[i] * col[i] * size; vr += row[i] * row[i] * size; }
    c.vStripe = tot ? vc / tot : 0; c.hStripe = tot ? vr / tot : 0;
    return c;
  });
  SWATCH.set(key, p);
  return p;
}

function boxBlur(a, S, R) {
  const n = S * S, tmp = new Float32Array(n), out = new Float32Array(n), w = 2 * R + 1;
  for (let y = 0; y < S; y++) {
    let s = 0; for (let d = -R; d <= R; d++) s += a[y * S + ((d + S) % S)];
    for (let x = 0; x < S; x++) {
      tmp[y * S + x] = s / w;
      s += a[y * S + ((x + R + 1) % S)] - a[y * S + ((x - R + S) % S)];
    }
  }
  for (let x = 0; x < S; x++) {
    let s = 0; for (let d = -R; d <= R; d++) s += tmp[((d + S) % S) * S + x];
    for (let y = 0; y < S; y++) {
      out[y * S + x] = s / w;
      s += tmp[((y + R + 1) % S) * S + x] - tmp[((y - R + S) % S) * S + x];
    }
  }
  return out;
}

export function pat(g, canvas, t = {}) {
  const p = g.createPattern(canvas, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') {
    const m = new DOMMatrix();
    m.translateSelf(t.x || 0, t.y || 0);
    if (t.r) m.rotateSelf((t.r * 180) / Math.PI);
    const sx = (t.sx || 1) * (t.s || 1), sy = (t.sy || 1) * (t.s || 1);
    if (sx !== 1 || sy !== 1) m.scaleSelf(sx, sy);
    p.setTransform(m);
  }
  return p;
}

export function innerShade(g, path, { w = 3, hi = 0.35, lo = 0.35, blur = 3, box = null } = {}) {
  const ring = new Path2D();
  if (box) { const M = 2 * w + 2 * blur + 4; ring.rect(box[0] - M, box[1] - M, box[2] - box[0] + 2 * M, box[3] - box[1] + 2 * M); }
  else ring.rect(-4000, -4000, 8000, 8000);
  ring.addPath(path);
  for (const [col, ox, oy] of [[`rgba(0,0,0,${lo})`, -w, -w], [`rgba(255,255,255,${hi})`, w, w]]) {
    if (!(parseFloat(col.split(',')[3]) > 0)) continue;
    g.save(); g.clip(path);
    g.shadowColor = col; g.shadowBlur = blur; g.shadowOffsetX = ox; g.shadowOffsetY = oy;
    g.fillStyle = '#000'; g.fill(ring, 'evenodd');
    g.restore();
  }
}

export const boxOf = (pts) => [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];

export function withShadow(g, fn, { dx = 2, dy = 3, blur = 5, a = 0.3 } = {}) {
  g.save();
  g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy;
  fn();
  g.restore();
}

export function fillTex(g, path, fill, tone = null) {
  g.fillStyle = fill; g.fill(path);
  if (tone) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = tone; g.fill(path); g.restore(); }
}

export function pickTex(style, uses, filter = () => true) {
  return style.pick('tex', (t) => uses.includes(t.use) && filter(t));
}
