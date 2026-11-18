import { splitIds } from '../core/style.js';

export const GLYPH_PALETTES = [
  { id: 'vivid', c: ['#e8483f', '#ff8c1a', '#ffd21f', '#39c26d', '#18b5a3', '#2f8ef5', '#8f5bf0', '#f04fa0'] },
  { id: 'pastel', c: ['#ff8a80', '#ffb366', '#ffe680', '#8ee0a8', '#7fdccf', '#8cc4ff', '#c3a6ff', '#ff9ccf'], light: true },
  { id: 'deep', c: ['#b3261e', '#c45f00', '#c99a00', '#1e7f45', '#0f7a6d', '#1f5fb8', '#5b34b0', '#b02a6e'] },
  { id: 'neon', c: ['#ff3b5c', '#ff7a00', '#e6ff00', '#00ff85', '#00e5d4', '#00a8ff', '#b04dff', '#ff2bd6'] },
  { id: 'earth', c: ['#b5523b', '#c8803a', '#d6b14a', '#6f8f3a', '#3f8f7f', '#4a6f9a', '#7a5c9e', '#b0607e'] },
  { id: 'candy', c: ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#06d6a0', '#4361ee', '#7209b7', '#f72585'] },
  { id: 'retro', c: ['#d1495b', '#edae49', '#f2d06b', '#66a182', '#2e8b8b', '#00798c', '#6a4c93', '#c75b9b'] },
];
export const GLYPH_OUTLINES = ['stroke', 'double', 'tinted', 'glow', 'shadow'];
export const GLYPH_FILLS = ['solid', 'gradient', 'extrude'];
const palSplit = splitIds('char_palette', GLYPH_PALETTES.map((p) => p.id), 1);
const outlineSplit = splitIds('char_outline', GLYPH_OUTLINES, 1);
const fillSplit = splitIds('char_fill', GLYPH_FILLS, 1);
const DEFAULT = ['#e8483f', '#ff8c1a', '#ffd21f', '#39c26d', '#18b5a3', '#2f8ef5', '#8f5bf0', '#f04fa0'];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (k <= 1 ? v * k : v + (255 - v) * (k - 1)));
  return '#' + ch.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function chooseGlyphLook(style, bgLum = 0.5) {
  const inSplit = (arr, sp) => arr.filter((x) => sp(x.id || x) === style.split);
  const pals = inSplit(GLYPH_PALETTES, palSplit), outs = inSplit(GLYPH_OUTLINES, outlineSplit), fills = inSplit(GLYPH_FILLS, fillSplit);
  const pal = pals[Math.floor(style.rand() * pals.length)];
  const outline = outs[Math.floor(style.rand() * outs.length)];
  const fill = fills[Math.floor(style.rand() * fills.length)];
  const lightHalo = bgLum < 0.45 && !pal.light;
  const map = new Map(DEFAULT.map((c, i) => [c, pal.c[i]]));
  style.note(`char_palette:${pal.id}`); style.note(`char_outline:${outline}`); style.note(`char_fill:${fill}`); style.note(`halo:${lightHalo ? 'light' : 'dark'}`);
  return { pal: pal.id, outline, fill, map, lightHalo };
}

export function drawGlyphStyled(g, { ch, x, y, size, rot = 0, shear = 0, flipH = false, flipV = false, font, color }, look) {
  const col = look.map.get(color) || color;
  g.save();
  const T0 = g.getTransform();
  g.translate(x, y);
  g.rotate((rot * Math.PI) / 180);
  if (flipH || flipV) g.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  if (shear) g.transform(1, 0, shear, 1, 0, 0);
  g.font = `${size}px "${font}"`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const lw = Math.max(2.5, size * 0.09);
  const shadow = (a, b, o) => { g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = b; g.shadowOffsetX = o; g.shadowOffsetY = o; };
  const noShadow = () => { g.shadowColor = 'transparent'; };
  const halo = look.lightHalo ? 'rgba(255,255,255,.95)' : 'rgba(14,16,22,.92)', anti = look.lightHalo ? 'rgba(14,16,22,.85)' : 'rgba(255,255,255,.95)';
  switch (look.outline) {
    case 'double': shadow(0.4, 3, 1); g.strokeStyle = halo; g.lineWidth = lw + 2.5; g.strokeText(ch, 0, 0);
      noShadow(); g.strokeStyle = anti; g.lineWidth = lw * 0.6; g.strokeText(ch, 0, 0); break;
    case 'tinted': shadow(0.45, 4, 1.5); g.strokeStyle = look.lightHalo ? shade(col, 1.7) : shade(col, 0.4); g.lineWidth = lw; g.strokeText(ch, 0, 0); break;
    case 'glow': g.shadowColor = halo; g.shadowBlur = 7; g.strokeStyle = halo; g.lineWidth = lw * 0.7; g.strokeText(ch, 0, 0); g.strokeText(ch, 0, 0); break;
    case 'shadow': shadow(0.85, 7, 2); g.strokeStyle = halo; g.lineWidth = Math.max(1.6, lw * 0.55); g.strokeText(ch, 0, 0); break;
    default: shadow(0.5, 4, 1.5); g.strokeStyle = halo; g.lineWidth = lw; g.strokeText(ch, 0, 0);
  }
  noShadow();
  if (look.fill === 'extrude') {
    const inv = g.getTransform().inverse();
    const loc = (px, py) => inv.transformPoint(T0.transformPoint(new DOMPoint(px, py)));
    const o = loc(0, 0);
    g.fillStyle = shade(col, 0.5);
    for (const d of [2.2, 1.4, 0.7]) { const p = loc(d, d); g.fillText(ch, p.x - o.x, p.y - o.y); }
    g.fillStyle = col;
  } else if (look.fill === 'gradient') {
    const gr = g.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
    gr.addColorStop(0, shade(col, 1.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, 0.78));
    g.fillStyle = gr;
  } else g.fillStyle = col;
  g.fillText(ch, 0, 0);
  g.restore();
}
