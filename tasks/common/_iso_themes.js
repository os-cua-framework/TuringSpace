import { splitIds } from '../core/style.js';
import { loadImage } from '../core/assets.js';

export const ISO_THEMES = [
  {
    id: 'stone_bridge', 
    top: '#e6d8bb', pillar: '#b9a37f', rim: 'rgba(120,96,62,.45)',
    ground: { top: '#90c3d8', edge: 'rgba(36,82,104,.38)', tex: null, amp: 0 },
    grid: { color: 'rgba(255,255,255,.26)', width: 1, dash: null },
    shadowAlpha: 0.26, sky: ['#eef4f8', '#d8e5ed'],
    deco: { kind: 'ripple', colors: ['rgba(255,255,255,.55)'], n: 16 },
    tex: ['floor', 'wall'], texAmp: 0.12,
  },
  {
    id: 'grass_path', 
    top: '#dcc69c', pillar: '#94754f', rim: 'rgba(110,84,48,.45)',
    ground: { top: '#9cc67d', edge: 'rgba(52,84,36,.4)', tex: ['terrain'], amp: 0.09 },
    grid: { color: 'rgba(58,92,38,.20)', width: 1, dash: null },
    shadowAlpha: 0.28, sky: ['#f1f6ee', '#dce9d4'],
    deco: { kind: 'tuft', colors: ['#6b9a4c', '#5f8c43'], n: 22 },
    tex: ['terrain', 'floor'], texAmp: 0.12,
  },
  {
    id: 'snowfield', 
    top: '#b2b8c1', pillar: '#87919e', rim: 'rgba(255,255,255,.75)',
    ground: { top: '#edf2f7', edge: 'rgba(90,115,145,.35)', tex: ['terrain', 'floor'], amp: 0.05 },
    grid: { color: 'rgba(100,132,168,.24)', width: 1, dash: null },
    shadowAlpha: 0.24, sky: ['#e8eef5', '#d0dbe7'],
    deco: { kind: 'sparkle', colors: ['rgba(255,255,255,.95)', 'rgba(170,195,225,.9)'], n: 20 },
    tex: ['floor', 'wall', 'terrain'], texAmp: 0.11,
  },
  {
    id: 'desert_sandstone', 
    top: '#efe0c2', pillar: '#b78658', rim: 'rgba(150,104,58,.45)',
    ground: { top: '#d3a668', edge: 'rgba(110,70,30,.4)', tex: ['terrain', 'floor'], amp: 0.08 },
    grid: { color: 'rgba(120,78,30,.20)', width: 1, dash: [3, 3] },
    shadowAlpha: 0.27, sky: ['#fbf2e0', '#efdbb8'],
    deco: { kind: 'pebble', colors: ['#a97a4b', '#bf9461'], n: 18 },
    tex: ['terrain', 'floor', 'wall', 'wood', 'flat2d'], texAmp: 0.11,
  },
  {
    id: 'swamp_boardwalk', 
    top: '#c79a68', pillar: '#6b4f33', rim: 'rgba(72,46,22,.6)',
    ground: { top: '#6f8968', edge: 'rgba(30,45,28,.45)', tex: null, amp: 0 },
    grid: { color: 'rgba(220,236,200,.20)', width: 1, dash: null },
    shadowAlpha: 0.32, sky: ['#eef1e6', '#d6ddca'],
    deco: { kind: 'lily', colors: ['#557f47', '#4a7340'], n: 12 },
    tex: ['wood', 'flat2d'], texAmp: 0.13,
  },
  {
    id: 'scifi_platform', 
    top: '#d2dbe5', pillar: '#7b8897', rim: 'rgba(70,215,255,.9)',
    ground: { top: '#53667e', edge: 'rgba(10,20,35,.55)', tex: null, amp: 0 },
    grid: { color: 'rgba(110,228,255,.42)', width: 1, dash: null },
    shadowAlpha: 0.38, sky: ['#28323f', '#3b485a'],
    deco: { kind: 'dot', colors: ['rgba(120,235,255,.85)'], n: 0 },
    tex: ['floor', 'flat2d'], texAmp: 0.08,
  },
  {
    id: 'toy_blocks', 
    top: '#f3cd4f', pillar: '#5aae69', rim: 'rgba(255,255,255,.6)',
    ground: { top: '#b4dfc0', edge: 'rgba(60,110,80,.35)', tex: null, amp: 0 },
    grid: { color: 'rgba(255,255,255,.55)', width: 1.2, dash: null },
    shadowAlpha: 0.26, sky: ['#fdf7ea', '#f2e8d2'],
    deco: { kind: 'stud', colors: ['rgba(255,255,255,.35)', 'rgba(70,130,90,.35)'], n: 0 },
    tex: ['flat2d', 'floor'], texAmp: 0.05,
  },
  {
    id: 'moss_steps', 
    top: '#b9c19e', pillar: '#8b8d75', rim: 'rgba(80,98,52,.5)',
    ground: { top: '#5f8b86', edge: 'rgba(24,52,50,.45)', tex: null, amp: 0 },
    grid: { color: 'rgba(220,242,236,.22)', width: 1, dash: null },
    shadowAlpha: 0.32, sky: ['#e9efe9', '#d0dbd2'],
    deco: { kind: 'ripple', colors: ['rgba(225,245,240,.5)'], n: 14 },
    tex: ['terrain', 'wall'], texAmp: 0.13,
  },
  {
    id: 'canal_concrete', 
    top: '#d6d6d0', pillar: '#a19f97', rim: 'rgba(70,70,66,.35)',
    ground: { top: '#69a4a5', edge: 'rgba(22,62,64,.42)', tex: null, amp: 0 },
    grid: { color: 'rgba(255,255,255,.24)', width: 1, dash: null },
    shadowAlpha: 0.28, sky: ['#f2f4f5', '#dde3e6'],
    deco: { kind: 'ripple', colors: ['rgba(255,255,255,.45)'], n: 14 },
    tex: ['floor', 'wall'], texAmp: 0.11,
  },
  {
    id: 'autumn_park', 
    top: '#dbcdb6', pillar: '#86664a', rim: 'rgba(104,74,46,.45)',
    ground: { top: '#c79b60', edge: 'rgba(96,60,24,.42)', tex: ['terrain'], amp: 0.09 },
    grid: { color: 'rgba(92,52,20,.18)', width: 1, dash: null },
    shadowAlpha: 0.28, sky: ['#fbf3e6', '#eedbc2'],
    deco: { kind: 'leaf', colors: ['#d8682c', '#e2a03a', '#b5442b'], n: 26 },
    tex: ['terrain', 'wood'], texAmp: 0.12,
  },
  {
    id: 'brick_moat', 
    top: '#cf9a7c', pillar: '#8a5640', rim: 'rgba(96,52,32,.5)',
    ground: { top: '#5f8f98', edge: 'rgba(24,56,62,.45)', tex: null, amp: 0 },
    grid: { color: 'rgba(230,245,245,.22)', width: 1, dash: null },
    shadowAlpha: 0.3, sky: ['#f3efe8', '#e0d9cc'],
    deco: { kind: 'ripple', colors: ['rgba(235,250,250,.5)'], n: 14 },
    tex: ['wall', 'floor', 'roof'], texAmp: 0.12,
  },
  {
    id: 'harbor_dock', 
    top: '#b39572', pillar: '#5c4632', rim: 'rgba(58,38,22,.55)',
    ground: { top: '#4a86ad', edge: 'rgba(16,48,72,.5)', tex: null, amp: 0 },
    grid: { color: 'rgba(255,255,255,.2)', width: 1, dash: null },
    shadowAlpha: 0.32, sky: ['#eaf3f9', '#cddfeb'],
    deco: { kind: 'ripple', colors: ['rgba(255,255,255,.5)'], n: 18 },
    tex: ['wood'], texAmp: 0.13,
  },
  {
    id: 'zen_gravel', 
    top: '#e3ddd0', pillar: '#7a766c', rim: 'rgba(84,80,70,.4)',
    ground: { top: '#a39d8d', edge: 'rgba(60,56,46,.42)', tex: ['terrain', 'stone'], amp: 0.08 },
    grid: { color: 'rgba(70,66,56,.2)', width: 1, dash: null },
    shadowAlpha: 0.28, sky: ['#f4f3ef', '#e2dfd7'],
    deco: { kind: 'pebble', colors: ['#827c6e', '#b3ad9f'], n: 20 },
    tex: ['stone', 'floor'], texAmp: 0.11,
  },
];

const NO_WALK_TEX = new Set(['fabric_pattern_05', 'fabric_pattern_07']);

const THEME_SPLIT = splitIds('iso_theme', ISO_THEMES.map((t) => t.id), 3);
export const isoThemeSplit = (id) => THEME_SPLIT(id);
export const isoThemesFor = (split) => ISO_THEMES.filter((t) => THEME_SPLIT(t.id) === split);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function jitter(hex, u1, u2, u3, dh = 7, ds = 0.1, dl = 0.03) {
  const [h, s, l] = rgb2hsl(hexRGB(hex));
  return rgbHex(hsl2rgb([(h + (u1 * 2 - 1) * dh + 360) % 360, clamp(s * (1 + (u2 * 2 - 1) * ds), 0, 1), clamp(l + (u3 * 2 - 1) * dl, 0, 1)]));
}
function tintToward(hex, meanLin, t) {
  const s = meanLin.map(lin2srgb), lum = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  const ch = s.map((v) => clamp(lum > 1e-4 ? v / lum : 1, 0.8, 1.25));
  return rgbHex(hexRGB(hex).map((v, k) => v * (1 - t + t * ch[k])));
}
const shadeHex = (hex, f) => rgbHex(hexRGB(hex).map((v) => v * f));

export function chooseIsoLook(style, N = 6) {
  const themes = isoThemesFor(style.split);
  const lists = themes.map((th) => style.pool('tex', (a) => th.tex.includes(a.use) && !NO_WALK_TEX.has(a.id)));
  const pairs = [];
  for (let r = 0; r < Math.max(0, ...lists.map((l) => l.length)); r++) {
    themes.forEach((th, k) => { if (r < lists[k].length) pairs.push([th, lists[k][r]]); });
  }
  if (!pairs.length) return null;
  const [idx] = style.primaryCombo('iso_theme_x_tex', [pairs.length]);
  const [theme, tex] = pairs[idx];
  style.note(`iso_theme:${theme.id}`);
  style.note(`tex:${tex.id}`);
  const r = style.rand;
  const top = tintToward(jitter(theme.top, r(), r(), r(), 6, 0.08, 0.025), tex.mean_lin, 0.22);
  const groundTop = jitter(theme.ground.top, r(), r(), r(), 6, 0.08, 0.025);
  const sky = theme.sky.map((c) => jitter(c, r(), r(), r(), 8, 0.1, 0.015));
  const light = { x: -0.2 - 0.25 * r(), y: -0.7 - 0.25 * r() };
  const texScale = 1.6 + 0.8 * r();
  const texOff = { x: r() * 4, y: r() * 4 };
  const groundTex = theme.ground.tex ? style.pick('tex', (a) => theme.ground.tex.includes(a.use) && a.id !== tex.id) : null;
  const deco = [];
  const dk = theme.deco.kind;
  if (dk === 'stud') {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) deco.push({ x: i + 0.5, y: j + 0.5 });
  } else if (dk === 'dot') {
    for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) deco.push({ x: i, y: j });
  } else {
    for (let k = 0; k < theme.deco.n; k++) {
      deco.push({ x: 0.15 + r() * (N - 0.3), y: 0.15 + r() * (N - 0.3), c: theme.deco.colors[Math.floor(r() * theme.deco.colors.length)], rot: r() * Math.PI, s: 0.8 + 0.4 * r() });
    }
  }
  return { theme, tex, groundTex, top, groundTop, sky, light, texScale, texOff, deco };
}

const TEX_PX = 64;

async function detailMap(file) {
  const img = await loadImage('assets/' + file);
  let src = img, w = img.width, h = img.height;
  while (w > TEX_PX * 2 || h > TEX_PX * 2) {
    const c = document.createElement('canvas');
    c.width = Math.max(TEX_PX, w >> 1); c.height = Math.max(TEX_PX, h >> 1);
    const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  const c = document.createElement('canvas'); c.width = c.height = TEX_PX;
  const cg = c.getContext('2d', { willReadFrequently: true }); cg.imageSmoothingQuality = 'high';
  cg.drawImage(src, 0, 0, TEX_PX, TEX_PX);
  let px;
  try { px = cg.getImageData(0, 0, TEX_PX, TEX_PX).data; } catch { return null; }
  const n = TEX_PX * TEX_PX, L = new Float32Array(n);
  for (let k = 0; k < n; k++) L[k] = 0.2126 * px[4 * k] + 0.7152 * px[4 * k + 1] + 0.0722 * px[4 * k + 2];
  const blur = (a) => {
    const R = 5, out = new Float32Array(n), tmp = new Float32Array(n);
    for (let y = 0; y < TEX_PX; y++) for (let x = 0; x < TEX_PX; x++) {
      let s = 0; for (let d = -R; d <= R; d++) s += a[y * TEX_PX + ((x + d + TEX_PX) % TEX_PX)];
      tmp[y * TEX_PX + x] = s / (2 * R + 1);
    }
    for (let y = 0; y < TEX_PX; y++) for (let x = 0; x < TEX_PX; x++) {
      let s = 0; for (let d = -R; d <= R; d++) s += tmp[((y + d + TEX_PX) % TEX_PX) * TEX_PX + x];
      out[y * TEX_PX + x] = s / (2 * R + 1);
    }
    return out;
  };
  const low = blur(blur(L));
  let ss = 0;
  for (let k = 0; k < n; k++) { L[k] -= low[k]; ss += L[k] * L[k]; }
  const rms = Math.sqrt(ss / n) || 1;
  for (let k = 0; k < n; k++) L[k] /= rms;
  return L;
}

function tintCanvas(det, hex, amp) {
  const c = document.createElement('canvas'); c.width = c.height = TEX_PX;
  const cg = c.getContext('2d'), im = cg.createImageData(TEX_PX, TEX_PX), [r, g, b] = hexRGB(hex);
  for (let k = 0; k < TEX_PX * TEX_PX; k++) {
    const f = 1 + amp * clamp(det[k] / 2, -1, 1);
    im.data[4 * k] = clamp(Math.round(r * f), 0, 255); im.data[4 * k + 1] = clamp(Math.round(g * f), 0, 255);
    im.data[4 * k + 2] = clamp(Math.round(b * f), 0, 255); im.data[4 * k + 3] = 255;
  }
  cg.putImageData(im, 0, 0);
  return c;
}

const rgbaHex = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };

export async function buildIsoSkin(look) {
  if (!look) return null;
  const { theme } = look;
  const [det, gdet] = await Promise.all([detailMap(look.tex.file), look.groundTex ? detailMap(look.groundTex.file) : null]);
  const top = look.top, gtop = look.groundTop;
  const canv = {
    top: det ? tintCanvas(det, top, theme.texAmp) : null,
    shadow: det ? tintCanvas(det, shadeHex(top, 0.74), theme.texAmp) : null,
    ground: gdet ? tintCanvas(gdet, gtop, theme.ground.amp) : null,
  };
  const S = TEX_PX / look.texScale;
  const pats = new WeakMap();
  const patternFor = (g, which, view, z) => {
    let p = pats.get(g);
    if (!p) { p = {}; pats.set(g, p); }
    if (!p[which]) p[which] = g.createPattern(canv[which], 'repeat');
    const o = look.texOff;
    p[which].setTransform(new DOMMatrix([view.DX / S, view.DY / S, -view.DX / S, view.DY / S,
      view.ox + (o.x - o.y) * view.DX, view.oy + (o.x + o.y) * view.DY - z * view.DZ]));
    return p[which];
  };
  const gnd = gtop;
  return {
    themeId: theme.id, texId: look.tex.id, groundTexId: look.groundTex?.id || null,
    sky: look.sky, light: look.light, shadowAlpha: theme.shadowAlpha, grid: theme.grid,
    walk: { left: shadeHex(top, 0.8), right: shadeHex(top, 0.6), stepEdge: shadeHex(top, 0.86), rim: theme.rim },
    ground: { left: shadeHex(gnd, 0.79), right: shadeHex(gnd, 0.66), edge: theme.ground.edge },
    pillar: { top: theme.pillar, left: shadeHex(theme.pillar, 0.84), right: shadeHex(theme.pillar, 0.64), edge: rgbaHex(shadeHex(theme.pillar, 0.45), 0.4) },
    topFill: (g, view, z) => (canv.top ? patternFor(g, 'top', view, z) : top),
    shadowFill: (g, view, z) => (canv.shadow ? patternFor(g, 'shadow', view, z) : shadeHex(top, 0.74)),
    groundFill: (g, view, z) => (canv.ground ? patternFor(g, 'ground', view, z) : gtop),
    drawDeco: (g, view, clip) => drawDeco(g, view, clip, theme.deco, look.deco),
    groundCache: new WeakMap(),
  };
}

function drawDeco(g, view, clip, spec, items) {
  if (!items.length) return;
  const fy = view.DY / view.DX;
  g.save();
  g.beginPath(); clip.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.clip();
  g.lineCap = 'round';
  for (const d of items) {
    const p = view.p(d.x, d.y, 0), s = d.s || 1, c = d.c || spec.colors[0];
    switch (spec.kind) {
      case 'ripple':
        g.strokeStyle = c; g.lineWidth = 1.1;
        g.beginPath(); g.ellipse(p.x, p.y, 6 * s, 6 * s * fy, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.beginPath(); g.ellipse(p.x + 2, p.y + 3, 3.5 * s, 3.5 * s * fy, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
        break;
      case 'tuft':
        g.strokeStyle = c; g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(p.x - 2, p.y); g.lineTo(p.x - 3.2 * s, p.y - 4 * s);
        g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 5 * s);
        g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3.2 * s, p.y - 4 * s);
        g.stroke();
        break;
      case 'sparkle':
        g.strokeStyle = c; g.lineWidth = 1;
        g.beginPath(); g.moveTo(p.x - 2 * s, p.y); g.lineTo(p.x + 2 * s, p.y); g.moveTo(p.x, p.y - 2 * s); g.lineTo(p.x, p.y + 2 * s); g.stroke();
        break;
      case 'pebble':
        g.fillStyle = c; g.beginPath(); g.ellipse(p.x, p.y, 2.4 * s, 1.5 * s, d.rot * 0.3, 0, Math.PI * 2); g.fill();
        break;
      case 'lily':
        g.fillStyle = c; g.beginPath(); g.moveTo(p.x, p.y);
        g.ellipse(p.x, p.y, 4.6 * s, 4.6 * s * fy, 0, d.rot + 0.35, d.rot + Math.PI * 2 - 0.35); g.closePath(); g.fill();
        break;
      case 'leaf':
        g.fillStyle = c; g.beginPath(); g.ellipse(p.x, p.y, 2.8 * s, 1.3 * s, d.rot, 0, Math.PI * 2); g.fill();
        break;
      case 'stud':
        g.beginPath(); g.ellipse(p.x, p.y, 5, 5 * fy, 0, 0, Math.PI * 2);
        g.fillStyle = spec.colors[0]; g.fill(); g.strokeStyle = spec.colors[1]; g.lineWidth = 1; g.stroke();
        break;
      case 'dot':
        g.fillStyle = c; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, Math.PI * 2); g.fill();
        break;
      default: break;
    }
  }
  g.restore();
}
