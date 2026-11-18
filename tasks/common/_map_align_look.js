import { splitIds } from '../core/style.js';
import { loadImage } from '../core/assets.js';
import { makeCanvas } from './_photo_frame.js';

export const MAP_THEMES = ['street', 'parchment', 'satellite', 'topo', 'nautical', 'night', 'transit', 'park', 'cityplan', 'treasure', 'atlas', 'sketch',
  'blueplan', 'desert', 'winter'];
const themeSplit = splitIds('map_theme', MAP_THEMES, 3);
export const LAYOUTS = ['grid', 'organic', 'radial', 'coast', 'river-grid'];
const MARKERS = ['tri', 'arrow', 'star', 'badge'];
const PINS = ['dot', 'pin', 'square'];
const RIMS = ['grey', 'metal', 'ticks'];
const layoutSplit = splitIds('map_layout', LAYOUTS, 1), markerSplit = splitIds('map_marker', MARKERS, 1);
const pinSplit = splitIds('map_pin', PINS, 1), rimSplit = splitIds('map_rim', RIMS, 1);
const inSplit = (items, sp, split) => items.filter((x) => sp(x) === split);
const LABEL_FONT = { serif: '"SCB Noto Serif SC", "SCBX Gelasio", serif', sans: '"SCBX Inter", "SCB Noto Sans SC", sans-serif', hand: '"SCB Long Cang", "SCB Noto Sans SC", sans-serif' };

const P = {
  street: { base: '#f3eddc', block: '#e4dccb', bldg: '#d8ccb6', road: '#ffffff', casing: '#c9c0ac', park: '#cfe3b5', water: '#a9cfe8', label: '#2f3d4b', halo: '#ffffff', font: 'sans', you: '#176bc0' },
  parchment: { base: '#e6d3a8', road: '#7a5532', casing: null, park: 'rgba(92,120,60,.35)', water: 'rgba(70,110,150,.45)', label: '#3f2a16', halo: 'rgba(240,226,190,.9)', font: 'serif', you: '#8a2a1a', tex: 'paper' },
  satellite: { base: '#55624a', road: '#6b6b68', casing: '#3b3b38', park: null, water: '#1f4252', label: '#ffffff', halo: 'rgba(0,0,0,.75)', font: 'sans', you: '#36a3ff', tex: 'aerial' },
  topo: { base: '#eef0db', road: '#d0623a', casing: null, park: '#d3e5b4', water: '#9cc7e0', contour: 'rgba(150,105,60,.45)', label: '#333333', halo: 'rgba(255,255,255,.9)', font: 'serif', you: '#1b5fb0' },
  nautical: { base: '#bcdcef', land: '#efe3c2', road: '#7a6a48', casing: null, park: null, water: null, contour: 'rgba(40,90,150,.35)', label: '#1c3557', halo: 'rgba(240,248,255,.9)', font: 'serif', you: '#c0392b' },
  night: { base: '#1b2130', block: '#232a39', bldg: '#2b3345', road: '#45506a', casing: null, major: '#c9a24a', park: '#1e3a2c', water: '#0f2a3f', label: '#e3e9f4', halo: 'rgba(10,14,22,.85)', font: 'sans', you: '#5fb4ff' },
  transit: { base: '#fafafa', road: '#e4e4e4', casing: null, park: '#e6f2dc', water: '#d6eaf6', label: '#1f1f1f', halo: '#ffffff', font: 'sans', you: '#111111', lines: ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'] },
  park: { base: '#d6eabd', road: '#c7a36f', casing: null, park: '#bcdc9a', water: '#8cc8e8', tree: '#7fb35a', label: '#2b4421', halo: 'rgba(240,250,230,.9)', font: 'sans', you: '#c0392b' },
  cityplan: { base: '#f6f5f0', block: '#e1dfd6', bldg: null, road: '#f6f5f0', casing: '#3c3c3c', park: '#dfe9d2', water: '#d4e4ee', label: '#111111', halo: '#f6f5f0', font: 'serif', you: '#b71c1c', hatch: true },
  treasure: { base: '#d9bf8a', road: '#9b3b22', casing: null, park: 'rgba(80,110,50,.35)', water: 'rgba(60,100,140,.5)', label: '#4a2c14', halo: 'rgba(230,210,160,.85)', font: 'hand', you: '#9b3b22', tex: 'paper', dashed: true },
  atlas: { base: '#f4ecd2', block: null, road: '#b4503a', casing: null, park: '#cfe0a8', water: '#9fc6dd', contour: 'rgba(120,150,90,.35)', label: '#3a3328', halo: 'rgba(250,245,230,.9)', font: 'serif', you: '#283593' },
  sketch: { base: '#fbfbf8', road: '#5a5a5a', casing: null, park: 'rgba(120,160,90,.25)', water: 'rgba(90,140,190,.3)', label: '#2a2a2a', halo: '#fbfbf8', font: 'hand', you: '#d32f2f', tex: 'paper', sketchy: true },
  blueplan: { base: '#1f4f7a', block: 'rgba(255,255,255,.07)', bldg: null, road: '#1f4f7a', casing: '#dbe9f7', park: 'rgba(160,220,170,.18)', water: 'rgba(120,190,240,.35)', label: '#ffffff', halo: 'rgba(15,45,75,.9)', font: 'sans', you: '#ffd166' },
  desert: { base: '#c9a46c', road: '#5d5348', casing: '#3d362f', park: null, water: '#2f6f7a', label: '#ffffff', halo: 'rgba(0,0,0,.72)', font: 'sans', you: '#36a3ff', tex: 'aerial', terrain: /sand|gravelly|dry_ground|laterite|brown_mud_dry|coast_sand/ },
  winter: { base: '#e6eaee', road: '#77797c', casing: '#55575a', park: 'rgba(40,70,50,.45)', water: '#a7c4d6', label: '#ffffff', halo: 'rgba(20,30,40,.75)', font: 'sans', you: '#e53935', tex: 'aerial', terrain: /snow/ },
};

const TEX_PAPER = /plaster|beige|concrete_wall|linen|hessian|cotton|jersey|terlenka/;
function texPattern(g, img, rnd, scale) {
  const pat = g.createPattern(img, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().rotateSelf(rnd() * 360).scaleSelf(scale, scale).translateSelf(rnd() * 512, rnd() * 512));
  return pat;
}

function gridAngle(rnd) {
  for (;;) { const a = rnd() * 90; if (a > 12 && a < 78) return a + 90 * Math.floor(rnd() * 4); }
}
function bez(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
function blob(rnd, cx, cy, r, k = 9) {
  const ph = Array.from({ length: 3 }, () => rnd() * 6.28), am = [0.18, 0.1, 0.06].map((a) => a * (0.5 + rnd()));
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2, f = 1 + am[0] * Math.sin(2 * a + ph[0]) + am[1] * Math.sin(3 * a + ph[1]) + am[2] * Math.sin(5 * a + ph[2]);
    return [cx + r * f * Math.cos(a), cy + r * f * Math.sin(a)];
  });
}
function edgePoint(rnd, R) { const a = rnd() * Math.PI * 2; return [R * 1.15 * Math.cos(a), R * 1.15 * Math.sin(a)]; }
function curveRoad(rnd, R) {
  const p0 = edgePoint(rnd, R); let p3 = edgePoint(rnd, R);
  while (Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) < R * 1.3) p3 = edgePoint(rnd, R);
  const m = () => [(rnd() - 0.5) * R * 1.2, (rnd() - 0.5) * R * 1.2];
  return bez(p0, m(), m(), p3);
}
function gridRoads(rnd, R, c, withBlocks) {
  const a = (gridAngle(rnd) * Math.PI) / 180, s = 22 + rnd() * 22, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)];
  const n = Math.ceil((R * 1.5) / s), off = [rnd() * s, rnd() * s];
  const at = (i, j) => [ux[0] * (i * s + off[0]) + uy[0] * (j * s + off[1]), ux[1] * (i * s + off[0]) + uy[1] * (j * s + off[1])];
  const drop = 0.1 + rnd() * 0.25;
  for (let i = -n; i <= n; i++) { if (rnd() < drop) continue; c.roads.push([at(i, -n), at(i, n)]); }
  for (let j = -n; j <= n; j++) { if (rnd() < drop) continue; c.roads.push([at(-n, j), at(n, j)]); }
  if (withBlocks) for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
    const q = [at(i + 0.17, j + 0.17), at(i + 0.83, j + 0.17), at(i + 0.83, j + 0.83), at(i + 0.17, j + 0.83)];
    const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    if (Math.hypot(cx, cy) < R + s) c.blocks.push(q);
  }
}
function circlePts(cx, cy, r, n = 64) { return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cy + r * Math.sin((k / n) * Math.PI * 2)]); }
export function mapContent(rnd, R, theme, layout) {
  const c = { roads: [], major: [], blocks: [], parks: [], water: [], river: null, riverTop: false, sea: null, land: [], contours: [], trees: [], lines: [], houses: [] };
  const blocky = ['street', 'night', 'cityplan', 'satellite', 'blueplan', 'desert', 'winter'].includes(theme);
  if (layout === 'grid' || layout === 'river-grid') {
    gridRoads(rnd, R, c, blocky);
    c.major.push(curveRoad(rnd, R));
    if (layout === 'river-grid') { c.river = { pts: curveRoad(rnd, R), w: 14 + rnd() * 12 }; c.riverTop = true; }
  } else if (layout === 'radial') {
    const hx = (rnd() - 0.5) * R * 0.7, hy = (rnd() - 0.5) * R * 0.7;
    const r1 = 22 + rnd() * 16, r2 = r1 + 28 + rnd() * 22;
    c.roads.push(circlePts(hx, hy, r1), circlePts(hx, hy, r2));
    const k = 5 + Math.floor(rnd() * 3), a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < k; i++) { const a = a0 + (i / k) * Math.PI * 2 + (rnd() - 0.5) * 0.4; c.roads.push([[hx, hy], [hx + Math.cos(a) * R * 2.2, hy + Math.sin(a) * R * 2.2]]); }
    c.major.push(c.roads[1]);
  } else {
    const k = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) c.roads.push(curveRoad(rnd, R));
    c.major.push(c.roads[0]);
  }
  if (blocky && layout !== 'grid' && layout !== 'river-grid') {
    for (let i = 0; i < 40; i++) { const x = (rnd() - 0.5) * 2 * R, y = (rnd() - 0.5) * 2 * R, w = 6 + rnd() * 9, h = 6 + rnd() * 9, a = rnd() * Math.PI;
      const q = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([px, py]) => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]); c.blocks.push(q); }
  }
  if (theme === 'nautical' || layout === 'coast') {
    if (theme === 'nautical') for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) c.land.push(blob(rnd, (rnd() - 0.5) * R * 1.6, (rnd() - 0.5) * R * 1.6, R * (0.3 + rnd() * 0.3)));
    else {
      const a = rnd() * Math.PI * 2, d = (rnd() - 0.2) * R * 0.6, ph = rnd() * 6.28, amp = 8 + rnd() * 12;
      const ux = Math.cos(a), uy = Math.sin(a), pts = [];
      for (let t = -1.6; t <= 1.6; t += 0.05) { const w = d + amp * Math.sin(t * 4 + ph) + amp * 0.5 * Math.sin(t * 9 + ph * 2); pts.push([ux * w - uy * t * R, uy * w + ux * t * R]); }
      pts.push([ux * R * 2 + uy * 1.6 * R, uy * R * 2 - ux * 1.6 * R], [ux * R * 2 - uy * 1.6 * R, uy * R * 2 + ux * 1.6 * R]);
      c.sea = pts;
    }
  } else {
    const w = rnd();
    if (!c.river && w < 0.3) c.river = { pts: curveRoad(rnd, R), w: 10 + rnd() * 10 };
    else if (w < 0.7) c.water.push(blob(rnd, (rnd() - 0.5) * R, (rnd() - 0.5) * R, R * (0.12 + rnd() * 0.16)));
  }
  for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) c.parks.push(blob(rnd, (rnd() - 0.5) * R * 1.4, (rnd() - 0.5) * R * 1.4, R * (0.08 + rnd() * 0.16)));
  if (['topo', 'nautical', 'atlas'].includes(theme)) {
    for (let p = 0; p < 1 + Math.floor(rnd() * 2); p++) {
      const cx = (rnd() - 0.5) * R * 1.2, cy = (rnd() - 0.5) * R * 1.2;
      for (let r = 10 + rnd() * 8; r < R * 0.9; r += 8 + rnd() * 7) c.contours.push(blob(rnd, cx, cy, r));
    }
  }
  if (theme === 'park') for (let i = 0; i < 30 + Math.floor(rnd() * 30); i++) c.trees.push([(rnd() - 0.5) * 2 * R, (rnd() - 0.5) * 2 * R, 2.5 + rnd() * 3]);
  if (theme === 'transit') for (let i = 0; i < 3 + Math.floor(rnd() * 2); i++) c.lines.push(curveRoad(rnd, R));
  return c;
}

function path(g, pts, close = false) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); }

export async function buildMapLook(style, m, R) {
  const themes = MAP_THEMES.filter((t) => themeSplit(t) === style.split);
  const layouts = inSplit(LAYOUTS, layoutSplit, style.split);
  const [ti, li] = style.primaryCombo('map-theme-layout', [themes.length, layouts.length]);
  const theme = themes[ti], layout = layouts[li], pal = { ...P[theme] }, rnd = style.rand;
  const markers = inSplit(MARKERS, markerSplit, style.split), marker = markers[Math.floor(rnd() * markers.length)];
  const content = mapContent(rnd, R, theme, layout);
  let texBase = null, texRoof = null, texRoad = null;
  if (pal.tex === 'paper') texBase = style.pick('tex', (t) => TEX_PAPER.test(t.id));
  if (pal.tex === 'aerial') {
    texBase = style.pick('tex', (t) => t.use === 'terrain' && (pal.terrain ? pal.terrain.test(t.id) : !/snow|rock_face|rock_wall|boulder|sand/.test(t.id)))
      || style.pick('tex', (t) => t.use === 'terrain');
    texRoof = style.pick('tex', (t) => t.use === 'roof');
    texRoad = style.pick('tex', (t) => t.use === 'floor' && /asphalt|concrete/.test(t.id));
  }
  const [iBase, iRoof, iRoad] = await Promise.all([texBase, texRoof, texRoad].map((t) => (t ? loadImage('assets/' + t.file) : null)));
  style.note(`map_theme:${theme}`); style.note(`map_layout:${layout}`); style.note(`map_marker:${marker}`);
  const S = 2, W = 2 * R;
  const cv = makeCanvas(W * S, W * S), g = cv.getContext('2d');
  g.scale(S, S); g.translate(R, R);
  g.save(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = pal.base; g.fillRect(-R, -R, W, W);
  if (iBase) {
    g.save();
    if (pal.tex === 'paper') { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; }
    g.fillStyle = texPattern(g, iBase, rnd, pal.tex === 'aerial' ? 0.32 : 0.45); g.fillRect(-R, -R, W, W);
    g.restore();
  }
  const C = content;
  if (C.land.length) { g.fillStyle = pal.land; for (const b of C.land) { path(g, b, true); g.fill(); } g.strokeStyle = 'rgba(90,70,40,.5)'; g.lineWidth = 1; for (const b of C.land) { path(g, b, true); g.stroke(); } }
  if (pal.park) { g.fillStyle = pal.park; for (const b of C.parks) { path(g, b, true); g.fill(); } }
  if (theme === 'satellite') {
    g.fillStyle = 'rgba(25,55,25,.45)'; for (const b of C.parks) { path(g, b, true); g.fill(); }
  }
  for (const b of C.contours) { g.strokeStyle = pal.contour; g.lineWidth = 0.8; path(g, b, true); g.stroke(); }
  const waterCol = pal.water || '#9cc7e0';
  const drawRiver = () => { if (C.river) { g.strokeStyle = waterCol; g.lineWidth = C.river.w; g.lineCap = 'round'; path(g, C.river.pts); g.stroke(); } };
  if (!C.riverTop) drawRiver();
  for (const b of C.water) { g.fillStyle = waterCol; path(g, b, true); g.fill(); }
  if (theme === 'parchment' || theme === 'treasure') {
    g.strokeStyle = 'rgba(50,80,120,.45)'; g.lineWidth = 0.7;
    for (const b of C.water) { path(g, b.map(([x, y]) => [x * 1.08, y * 1.08]), true); g.stroke(); }
  }
  if (C.blocks.length && (pal.block || theme === 'satellite')) {
    const roof = iRoof ? texPattern(g, iRoof, rnd, 0.12) : null;
    for (const q of C.blocks) {
      if (theme === 'satellite') { if (rnd() < 0.45) continue; g.fillStyle = roof || '#8a8077'; path(g, q, true); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.6; g.stroke(); continue; }
      g.fillStyle = pal.block; path(g, q, true); g.fill();
      if (pal.hatch) { g.save(); path(g, q, true); g.clip(); g.strokeStyle = 'rgba(60,60,60,.25)'; g.lineWidth = 0.6; for (let k = -60; k < 60; k += 4) { g.beginPath(); g.moveTo(q[0][0] + k, q[0][1] - 60); g.lineTo(q[0][0] + k + 60, q[0][1]); g.stroke(); } g.restore(); }
      if (pal.bldg && rnd() < 0.6) { const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2; g.fillStyle = pal.bldg; path(g, q.map(([x, y]) => [cx + (x - cx) * 0.55, cy + (y - cy) * 0.55]), true); g.fill(); }
    }
  }
  if (C.riverTop) drawRiver();
  const roadW = theme === 'cityplan' ? 7 : theme === 'satellite' ? 6 : theme === 'sketch' ? 1.6 : ['parchment', 'treasure', 'topo', 'atlas'].includes(theme) ? 2 : 8;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (pal.casing) { g.strokeStyle = pal.casing; g.lineWidth = roadW + 2; for (const r of C.roads) { path(g, r); g.stroke(); } }
  g.strokeStyle = theme === 'satellite' && iRoad ? texPattern(g, iRoad, rnd, 0.2) : pal.road;
  g.lineWidth = roadW;
  if (pal.dashed) g.setLineDash([5, 4]);
  for (const r of C.roads) { path(g, r); g.stroke(); }
  if (theme === 'sketch') { g.lineWidth = 0.8; for (const r of C.roads) { path(g, r.map(([x, y], k) => [x + Math.sin(k * 1.7) * 1.2, y + Math.cos(k * 1.3) * 1.2])); g.stroke(); } }
  g.setLineDash([]);
  if (pal.major) { g.strokeStyle = pal.major; g.lineWidth = roadW * 0.6; for (const r of C.major) { path(g, r); g.stroke(); } }
  if (theme === 'transit') {
    C.lines.forEach((l, i) => { g.strokeStyle = pal.lines[i % pal.lines.length]; g.lineWidth = 4; path(g, l); g.stroke(); });
    C.lines.forEach((l) => { for (let k = 3; k < l.length; k += 6) { g.beginPath(); g.arc(l[k][0], l[k][1], 2.6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#222'; g.lineWidth = 1; g.stroke(); } });
  }
  if (C.sea) {
    g.fillStyle = theme === 'satellite' || pal.tex === 'aerial' ? '#1f4252' : waterCol.startsWith('rgba') ? '#a9c9de' : waterCol; path(g, C.sea, true); g.fill();
    g.strokeStyle = 'rgba(40,70,100,.5)'; g.lineWidth = 1.2; g.stroke();
  }
  if (theme === 'park') { g.fillStyle = pal.tree; for (const [x, y, r] of C.trees) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } }
  if (theme === 'treasure' || theme === 'parchment') {
    const gr = g.createRadialGradient(0, 0, R * 0.6, 0, 0, R);
    gr.addColorStop(0, 'rgba(90,50,20,0)'); gr.addColorStop(1, 'rgba(90,50,20,.45)');
    g.fillStyle = gr; g.fillRect(-R, -R, W, W);
  }
  const font = LABEL_FONT[pal.font];
  const pins = inSplit(PINS, pinSplit, style.split), pin = pins[Math.floor(rnd() * pins.length)], mk = PINS.indexOf(pin);
  style.note(`map_pin:${pin}`);
  for (const p of m.landmarks) {
    const hue = p.hue;
    g.save();
    if (mk === 0) { g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2); g.fillStyle = `hsl(${hue},55%,52%)`; g.fill(); g.strokeStyle = pal.halo; g.lineWidth = 1.4; g.stroke(); }
    else if (mk === 1) { g.beginPath(); g.moveTo(p.x, p.y + 3); g.arc(p.x, p.y - 5, 5, Math.PI * 0.8, Math.PI * 0.2, false); g.closePath(); g.fillStyle = `hsl(${hue},60%,48%)`; g.fill(); g.strokeStyle = pal.halo; g.lineWidth = 1.2; g.stroke(); g.beginPath(); g.arc(p.x, p.y - 5, 1.8, 0, Math.PI * 2); g.fillStyle = pal.halo; g.fill(); }
    else { g.fillStyle = `hsl(${hue},50%,50%)`; g.fillRect(p.x - 5, p.y - 5, 10, 10); g.strokeStyle = pal.halo; g.lineWidth = 1.2; g.strokeRect(p.x - 5, p.y - 5, 10, 10); }
    g.font = `700 7.5px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.strokeStyle = pal.halo; g.lineWidth = 2.6; g.strokeText(p.kind, p.x, p.y + 12);
    g.fillStyle = pal.label; g.fillText(p.kind, p.x, p.y + 12);
    g.restore();
  }
  const letter = m.refLetter || 'N', b = { N: 0, E: 90, S: 180, W: 270 }[letter] * Math.PI / 180;
  const lx = Math.sin(b) * (R - 20), ly = -Math.cos(b) * (R - 20);
  g.save(); g.translate(lx, ly);
  const ink = pal.label, plate = pal.halo;
  g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fillStyle = plate; g.fill();
  g.fillStyle = ink; g.strokeStyle = ink;
  g.save(); g.rotate(b);
  if (marker === 'tri') { g.beginPath(); g.moveTo(0, -17); g.lineTo(-5, -9); g.lineTo(5, -9); g.closePath(); g.fill(); }
  else if (marker === 'arrow') { g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(0, -19); g.stroke(); g.beginPath(); g.moveTo(0, -22); g.lineTo(-4, -16); g.lineTo(4, -16); g.closePath(); g.fill(); }
  else if (marker === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2 : 4.5; g.lineTo(r * Math.cos(a), -15 + r * Math.sin(a)); } g.closePath(); g.fill(); }
  else { g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-3.5, -10); g.lineTo(0, -15); g.lineTo(3.5, -10); g.closePath(); g.fill(); }
  g.restore();
  g.font = `800 13px ${LABEL_FONT[pal.font === 'hand' ? 'sans' : pal.font]}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 0, 1);
  g.restore();
  g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fillStyle = pal.you; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.restore();
  const rims = inSplit(RIMS, rimSplit, style.split), rimId = rims[Math.floor(rnd() * rims.length)], rim = RIMS.indexOf(rimId);
  style.note(`map_rim:${rimId}`);
  return { canvas: cv, theme, marker, rim, R };
}

export function drawMapLook(g, look, cx, cy, rotationDeg) {
  const R = look.R;
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy); g.rotate((rotationDeg * Math.PI) / 180);
  g.drawImage(look.canvas, -R, -R, 2 * R, 2 * R);
  g.restore();
  if (look.rim === 1) {
    const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, '#d9dde2'); gr.addColorStop(0.5, '#8b939c'); gr.addColorStop(1, '#e3e6ea');
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.strokeStyle = gr; g.lineWidth = 8; g.stroke();
  } else if (look.rim === 2) {
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.strokeStyle = '#3d4650'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1;
    for (let k = 0; k < 36; k++) { const a = (k * 10 * Math.PI) / 180; g.beginPath(); g.moveTo(cx + Math.sin(a) * (R + 1), cy - Math.cos(a) * (R + 1)); g.lineTo(cx + Math.sin(a) * (R + (k % 3 ? 4 : 7)), cy - Math.cos(a) * (R + (k % 3 ? 4 : 7))); g.stroke(); }
  } else {
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.strokeStyle = '#6f7f8f'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 5; g.stroke();
  }
}

export const LANDMARKS_EXT = ['PARK', 'CAFE', 'BANK', 'SHOP', 'HILL', 'LAKE', 'POST', 'MUSEUM', 'SCHOOL', 'LIBRARY', 'HOTEL', 'STATION',
  'MARKET', 'CHURCH', 'TOWER', 'BRIDGE', 'FARM', 'PIER', 'ZOO', 'STADIUM', 'HOSPITAL', 'CASTLE', 'MILL', 'GARDEN', 'THEATER', 'HARBOR',
  'BAKERY', 'CINEMA', 'GYM', 'PHARMACY', 'FOUNTAIN', 'PLAZA', 'TEMPLE', 'LIGHTHOUSE', 'CAMP', 'AIRFIELD', 'POLICE', 'COLLEGE', 'ARENA',
  'MALL', 'DINER', 'CLINIC', 'DOCKS', 'FOREST', 'BEACH', 'QUARRY', 'WINERY', 'ORCHARD', 'GALLERY', 'TOWN HALL', 'BUS STOP', 'POOL',
  'GOLF', 'RANCH', 'MONUMENT', 'OBSERVATORY', 'AQUARIUM', 'CANAL', 'DAM', 'VILLAGE', 'CHAPEL', 'FORT', 'INN', 'SAWMILL', 'BAZAAR',
  'TERMINAL', 'GARAGE', 'FERRY', 'MEADOW', 'POND', 'SPRING', 'CAVE', 'RUINS', 'WINDMILL', 'BARN', 'DEPOT'];
export const landmarkSplit = splitIds('map_landmark', LANDMARKS_EXT, 8);
