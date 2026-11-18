import { UI_FONT } from '../core/panel.js';
import { splitPool, roundRobinPairs, texCanvas, fillTex, shade, mix, texMeanHex, hexRGB, vignette, rrPath, choose } from './_grid_look_kit.js';
import { splitIds } from '../core/style.js';

const TABLES = [
  { id: 'desk', use: ['wood'] }, { id: 'counter', use: ['stone', 'floor'], re: /marble|slab|tile|plaster|concrete|terrazzo|granular/ },
  { id: 'cloth', use: ['fabric'], re: /linen|jersey|satin|velour|velvet|cotton|terry|wool|denim/ }, { id: 'floor', use: ['floor'], re: /concrete|cement|plaster|painted/ },
  { id: 'bench', use: ['metal'], re: /plate|factory|painted|shutter/ },
];
const tablesOf = splitPool('g14_fvp_table', TABLES, 1);
const MATS = ['paint', 'plastic', 'stain', 'stone', 'felt'];
const PALETTES = {
  toy: ['#e24c46', '#f6be28', '#3a7cd6', '#40a85c', '#f0842c', '#9660c4', '#22a6aa', '#e86ea8'],
  pastel: ['#f28b82', '#fbd46d', '#7fb3f5', '#81c995', '#fdae6b', '#c3a0e8', '#6fd1d4', '#f5a3c7'],
  stain: ['#b5442b', '#d9a441', '#3f6fa8', '#5d8a3a', '#c8742d', '#7a4f8f', '#2f8c86', '#a85a7a'],
  earth: ['#a3452f', '#d6a74b', '#4a6f8a', '#6f8f4e', '#c47a3a', '#7d5a86', '#4f8f88', '#b0707a'],
  okabe: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#999999'],
  neon: ['#ff3d6e', '#ffd400', '#2f80ff', '#22d36b', '#ff8a00', '#b04bff', '#00d1d1', '#ff6ec7'],
  muted: ['#b85450', '#c9a94a', '#5878a8', '#5e9a6a', '#c7834a', '#8a6aa8', '#4f9a9a', '#b8728f'],
};
const PLATES = ['grey', 'wood', 'felt', 'metal', 'marble', 'cork'];
const SIGNS = ['pill', 'wood', 'tag', 'metal', 'chalk'];
const FONTS = [{ id: 'ui', f: (s) => `700 ${s}px ${UI_FONT}` }, { id: 'georgia', f: (s) => `700 ${s}px "SCBX Gelasio", serif` }, { id: 'avenir', f: (s) => `700 ${s}px "SCBX Nunito Sans", sans-serif` },
  { id: 'courier', f: (s) => `700 ${s}px "SCBX Courier Prime", monospace` }, { id: 'trebuchet', f: (s) => `700 ${s}px "SCBX Fira Sans", sans-serif` }, { id: 'gill', f: (s) => `700 ${s}px "SCBX Cabin", sans-serif` }];
const MAT_SPLIT = splitIds('g14_fvp_mat', MATS, 1);

export async function mountFvpLook(env) {
  const st = env.style;
  const tables = tablesOf(st.split);
  const lists = tables.map((t) => { const l = st.pool('tex', (a) => t.use.includes(a.use) && (!t.re || t.re.test(a.id)) && !/gingham|check|pattern_0/.test(a.id)); return l.length ? l : [null, null]; });
  const pairs = roundRobinPairs(tables, lists);
  const matsIn = MATS.filter((x) => MAT_SPLIT(x) === st.split);
  const [pi, mi] = st.primaryCombo('fvp_table_x_mat', [pairs.length, matsIn.length]);
  const [table, ttex] = pairs[pi], mat = matsIn[mi];
  st.note(`g14_fvp_table:${table.id}`); st.note(`g14_fvp_mat:${mat}`); if (ttex) st.note(`tex:${ttex.id}`);
  const r = st.rand;
  const palName = choose(st, 'g14_fvp_palette', Object.keys(PALETTES)), plate = choose(st, 'g14_fvp_plate', PLATES), sign = choose(st, 'g14_fvp_sign', SIGNS);
  const matTexE = mat === 'stain' ? st.pick('tex', (a) => a.use === 'wood' && /fine|oak|plywood|veneer|laminate/.test(a.id))
    : mat === 'stone' ? st.pick('tex', (a) => a.use === 'stone' || /concrete/.test(a.id))
      : mat === 'felt' ? st.pick('tex', (a) => a.use === 'fabric' && /velour|velvet|terry|jersey|wool/.test(a.id)) : mat === 'paint' ? st.pick('tex', (a) => a.use === 'wood') : null;
  const plateTexE = plate === 'wood' ? st.pick('tex', (a) => a.use === 'wood') : plate === 'felt' ? st.pick('tex', (a) => a.use === 'fabric' && /velour|velvet|terry|jersey/.test(a.id))
    : plate === 'metal' ? st.pick('tex', (a) => a.use === 'metal' && /plate/.test(a.id)) : plate === 'marble' ? st.pick('tex', (a) => /marble|slab|plaster/.test(a.id)) : plate === 'cork' ? st.pick('tex', (a) => /hessian|carpet|sand/.test(a.id)) : null;
  const [tcan, mcan, pcan] = await Promise.all([
    ttex ? texCanvas(ttex.file, { size: 256, contrast: 0.6, sat: 0.85 }) : null,
    matTexE ? texCanvas(matTexE.file, { size: 128, contrast: mat === 'paint' ? 0.5 : 0.8, sat: 0, flatTo: 150 }) : null,
    plateTexE ? texCanvas(plateTexE.file, { size: 128, contrast: 0.6, sat: 0.7 }) : null,
  ]);
  for (const t of [matTexE, plateTexE]) if (t) st.note(`tex:${t.id}`);
  const plateC = { grey: ['#dde2e7', '#a9b3bd', '#95a0ab'], wood: ['#c99a64', '#9a6b3f', '#87592f'], felt: ['#3f7d55', '#2f5e40', '#284f36'],
    metal: ['#c9ced3', '#9ba3ab', '#89919a'], marble: ['#ece9e3', '#c4bfb6', '#b1aba1'], cork: ['#c69c6d', '#a07a4f', '#8d6a43'] }[plate];
  return {
    tcan, tableMean: ttex ? texMeanHex(ttex) : '#e7e1d7', mat, mcan, pal: PALETTES[palName].map(hexRGB), plate, plateC, pcan, sign,
    font: choose(st, 'g14_fvp_font', FONTS).f, tScale: 0.5 + 0.4 * r(), tOff: [r() * 256, r() * 256], ink: mat === 'felt' ? '#3a3f45' : '#2b333b',
  };
}

const rgb = (c, f = 1) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v * f)))).join(',')})`;
function poly(g, pts, fill, stroke, lw = 1.1) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}
function texOver(g, pts, can, alpha, op = 'multiply', scale = 0.35) {
  if (!can) return;
  g.save(); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.clip();
  fillTex(g, can, { scale, alpha, op, ox: pts[0].x, oy: pts[0].y }, { x: Math.min(...pts.map((p) => p.x)) - 1, y: Math.min(...pts.map((p) => p.y)) - 1, w: 200, h: 200 });
  g.restore();
}
function signBox(g, x, y, text, L) {
  g.font = L.font(11);
  const w = g.measureText(text).width + 14, h = 19;
  const S = { pill: ['#ffffff', '#51606e', '#2c3a47', 9.5], wood: ['#b9874f', '#5b3a1e', '#2b1a0c', 3], tag: ['#fff8e1', '#9b8a66', '#3a2f20', 2],
    metal: ['#d9dde1', '#5d6670', '#1f262d', 3], chalk: ['#2f4436', '#7a5a3a', '#f2f2ea', 3] }[L.sign];
  rrPath(g, x - w / 2, y - h / 2, w, h, S[3]); g.fillStyle = S[0]; g.fill(); g.strokeStyle = S[1]; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = S[2]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
}

export function drawSceneStyled(g, m, L, { P, SCENE }) {
  const h = m.h, right = m.cam.yaw > 0;
  g.fillStyle = L.tableMean; g.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  if (L.tcan) fillTex(g, L.tcan, { scale: L.tScale, ox: -L.tOff[0], oy: -L.tOff[1] }, SCENE);
  vignette(g, SCENE.x, SCENE.y, SCENE.w, SCENE.h, 0.25);
  const E = 1.62, T = -0.15, c = (x, y, z) => P({ x, y, z }), PC = L.plateC, edge = shade(PC[2], 0.8);
  const rim1 = [c(-E, 0, E), c(E, 0, E), c(E, T, E), c(-E, T, E)];
  const sx = right ? E : -E, rim2 = [c(sx, 0, -E), c(sx, 0, E), c(sx, T, E), c(sx, T, -E)];
  const topq = [c(-E, 0, -E), c(E, 0, -E), c(E, 0, E), c(-E, 0, E)];
  g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 10; g.shadowOffsetY = 4; poly(g, topq, PC[0]); g.restore();
  poly(g, rim1, PC[1], edge); texOver(g, rim1, L.pcan, 0.6);
  poly(g, rim2, PC[2], edge); texOver(g, rim2, L.pcan, 0.6);
  poly(g, topq, PC[0], edge, 1.3); texOver(g, topq, L.pcan, 0.55);
  g.strokeStyle = L.plate === 'felt' ? 'rgba(255,255,255,.4)' : 'rgba(40,45,50,.35)'; g.lineWidth = 1;
  for (const k of [-1.5, -0.5, 0.5, 1.5]) {
    let a = c(k, 0, -1.5), b = c(k, 0, 1.5); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    a = c(-1.5, 0, k); b = c(1.5, 0, k); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  const xs = right ? [0, 1, 2] : [2, 1, 0], ink = L.ink;
  const texA = { paint: 0.18, plastic: 0, stain: 0.45, stone: 0.5, felt: 0.45 }[L.mat];
  for (const x of xs) for (let lv = 0; lv < 3; lv++) for (let z = 0; z < 3; z++) {
    if (h[z][x] <= lv) continue;
    const X0 = x - 1.5, X1 = x - 0.5, Z0 = z - 1.5, Z1 = z - 0.5, Y0 = lv, Y1 = lv + 1;
    const col = L.pal[m.colors?.[z]?.[x] >= 0 ? m.colors[z][x] : 0], f = lv % 2 ? 0.95 : 1;
    const zNext = z < 2 && h[z + 1][x] > lv, xNext = right ? x < 2 && h[z][x + 1] > lv : x > 0 && h[z][x - 1] > lv;
    if (!zNext) { const q = [c(X0, Y0, Z1), c(X1, Y0, Z1), c(X1, Y1, Z1), c(X0, Y1, Z1)]; poly(g, q, rgb(col, 0.9 * f)); texOver(g, q, L.mcan, texA); poly(g, q, null, ink); }
    const XS = right ? X1 : X0;
    if (!xNext) { const q = [c(XS, Y0, Z0), c(XS, Y0, Z1), c(XS, Y1, Z1), c(XS, Y1, Z0)]; poly(g, q, rgb(col, 0.7 * f)); texOver(g, q, L.mcan, texA); poly(g, q, null, ink); }
    if (h[z][x] === lv + 1) {
      const q = [c(X0, Y1, Z0), c(X1, Y1, Z0), c(X1, Y1, Z1), c(X0, Y1, Z1)];
      poly(g, q, rgb(col.map((v) => v + (255 - v) * 0.25))); texOver(g, q, L.mcan, texA);
      if (L.mat === 'plastic') { const a = q[0], b = q[2]; const gr = g.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); poly(g, q, gr); }
      poly(g, q, null, ink);
    }
  }
  const mid = c(0, T, 0);
  for (const [label, a, b] of [['Front', c(-E, T, E), c(E, T, E)], [right ? 'Right' : 'Left', c(sx, T, E), c(sx, T, -E)]]) {
    const ex = (a.x + b.x) / 2, ey = (a.y + b.y) / 2;
    let nx = -(b.y - a.y), ny = b.x - a.x; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx * (ex - mid.x) + ny * (ey - mid.y) < 0) { nx = -nx; ny = -ny; }
    signBox(g, ex + nx * 15, ey + ny * 15, label, L);
  }
}
export { mix };
