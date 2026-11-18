import { splitIds } from '../core/style.js';
import { SLAB } from './_voxel_gravity_drop_world.js';
import { texCanvas, mixHex, hexRGB, rgbHex, rgba, clamp, lumHex, balancedPrimary } from './_board_look_common.js';

export const YARD_THEMES = [
  { id: 'port', ground: (t) => t.use === 'floor' && /asphalt|concrete|cement/.test(t.id), outdoor: true, line: '#e2b93b',
    paints: ['#4f7fb8', '#4b9a67', '#349899', '#8894a1', '#8b77b8', '#d6d0c0'], detail: (t) => t.use === 'metal' },
  { id: 'quarry', ground: (t) => t.use === 'terrain', outdoor: true, line: null, stones: true },
  { id: 'farm', ground: (t) => t.use === 'terrain' && /grass|ground|leaves|mud|path/.test(t.id), outdoor: true, line: null,
    paints: ['#d8b65e', '#efe2b0', '#5f8a4a', '#eef0ec', '#30363a', '#7f97a8'], detail: (t) => t.use === 'fabric' && /hessian|linen|jersey/.test(t.id) },
  { id: 'warehouse', ground: (t) => t.use === 'floor' && /concrete|painted|garage|hangar|epoxy|floor/.test(t.id), outdoor: false, line: '#e2b93b',
    paints: ['#b98a55', '#ebe6da', '#6f7780', '#3f7f5f', '#4f6fa8', '#8a6fb0'], detail: (t) => t.use === 'flat2d' || t.use === 'fabric' },
  { id: 'lumber', ground: (t) => t.use === 'terrain' && /mud|ground|dry|soil/.test(t.id), outdoor: true, line: null, woods: true },
  { id: 'toy', ground: (t) => t.use === 'fabric' || t.use === 'wood', outdoor: false, line: null,
    paints: ['#2f8f4f', '#2f63c8', '#f2c230', '#f4f4f0', '#7a4fb0', '#1fa3a3'], detail: null },
  { id: 'precast', ground: (t) => t.use === 'terrain', outdoor: true, line: null,
    paints: ['#c2bdb2', '#d6b23c', '#5f7f99', '#7f8a6a', '#e6e3da', '#6f6a62'], detail: (t) => (t.use === 'floor' || t.use === 'wall') && /concrete/.test(t.id) },
  { id: 'gift', ground: (t) => t.use === 'floor' || t.use === 'wood', outdoor: false, line: null,
    paints: ['#2f6fd0', '#3aa357', '#f2c230', '#8e44ad', '#1fa3a3', '#f4f1ea'], detail: (t) => t.use === 'fabric' || t.use === 'flat2d' },
  { id: 'books', ground: (t) => t.use === 'wood' || t.use === 'floor', outdoor: false, line: null,
    paints: ['#24406e', '#2f6b4f', '#c9a24a', '#6b4a8a', '#1f7f86', '#e8e2d0'], detail: (t) => t.use === 'fabric' },
  { id: 'bins', ground: (t) => t.use === 'floor', outdoor: false, line: null,
    paints: ['#3f8fd6', '#e0a020', '#4caf50', '#9c6ade', '#26a69a', '#eceff1'], detail: null },
];
const SPLIT = splitIds('g16_yard', YARD_THEMES.map((t) => t.id), 3);
const LIGHT = { top: 1.1, z: 0.9, x: 0.72 };
const RED = '#d8412f', CREAM = '#f4e4cc', EDGE = 'rgba(28,36,46,.62)';
const reddish = (m) => m[0] > 1.7 * m[1] && m[0] > 1.7 * m[2];

export function chooseYardLook(style) {
  const themes = YARD_THEMES.filter((t) => SPLIT(t.id) === style.split);
  const lists = themes.map((th) => style.pool('tex', (t) => th.ground(t) && !reddish(t.mean_lin) && !(t.mean_lin[0] > 1.35 * t.mean_lin[1] && t.mean_lin[0] > 0.25)));
  const [theme, ground] = balancedPrimary(style, 'g16_yard_x_ground', themes.map((th, k) => [th, lists[k]]));
  style.note(`g16_yard:${theme.id}`); style.note(`tex:${ground.id}`);
  const r = style.rand;
  const look = { theme, ground, u: Array.from({ length: 8 }, () => r()) };
  look.hdri = theme.outdoor ? style.pick('hdri', (h) => h.use !== 'indoor' && h.use !== 'studio') : null;
  look.wall = theme.outdoor ? null : style.pick('tex', (t) => t.use === 'wall');
  look.crateWood = style.pick('tex', (t) => t.use === 'wood' && !reddish(t.mean_lin));
  look.detail = theme.detail ? style.pick('tex', theme.detail) : null;
  if (theme.stones || theme.woods) {
    const pool = style.pool('tex', (t) => (theme.stones ? t.use === 'stone' || (t.use === 'wall' && /stone|block|sandstone|castle/.test(t.id)) : t.use === 'wood') && !reddish(t.mean_lin));
    const pick = pool.map((t) => [r(), t]).sort((a, b) => a[0] - b[0]).slice(0, 6).map((x) => x[1]);
    while (pick.length < 6 && pool.length) pick.push(pool[pick.length % pool.length]);
    look.mats = pick;
    pick.forEach((t) => style.note(`tex:${t.id}`));
  }
  return look;
}

export async function buildYardSkin(look) {
  const th = look.theme, u = look.u;
  const skin = { look, theme: th };
  const jobs = [
    texCanvas(look.ground.file, { px: 128, mode: 'photo', tone: th.id === 'toy' ? 0.5 : 0.42 + 0.12 * u[0], sat: 0.85 }),
    look.crateWood ? texCanvas(look.crateWood.file, { px: 64, mode: 'detail', base: '#c9a063', amp: 0.35 }) : null,
    look.wall ? texCanvas(look.wall.file, { px: 128, mode: 'photo', tone: 0.6, sat: 0.6 }) : null,
  ];
  let mats;
  if (look.mats) {
    const tones = [0.24, 0.34, 0.44, 0.54, 0.64, 0.76];
    const order = look.mats.map((t, k) => [lumHex(rgbHex(t.mean_lin.map((v) => Math.pow(clamp(v, 0, 1), 1 / 2.2) * 255))), k]).sort((a, b) => a[0] - b[0]);
    const tone = new Array(6); order.forEach(([, k], i) => { tone[k] = tones[i]; });
    mats = look.mats.map((t, k) => texCanvas(t.file, { px: 64, mode: 'photo', tone: tone[k], sat: 0.7 }));
  } else {
    mats = th.paints.map((p) => (look.detail ? texCanvas(look.detail.file, { px: 64, mode: 'detail', base: p, amp: th.id === 'farm' ? 0.4 : 0.16 }) : null));
  }
  const [ground, crate, wall] = await Promise.all(jobs);
  skin.ground = ground; skin.crate = crate; skin.wall = wall;
  skin.mats = await Promise.all(mats);
  skin.sky = null;
  if (look.hdri) {
    const { loadImage } = await import('../core/assets.js');
    skin.sky = await loadImage('assets/' + look.hdri.sky);
  }
  return skin;
}

function quad(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
function line(g, a, b) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
const at = (F, u, v) => ({ x: F[0].x + u * (F[1].x - F[0].x) + v * (F[3].x - F[0].x), y: F[0].y + u * (F[1].y - F[0].y) + v * (F[3].y - F[0].y) });
function texFace(g, F, cv, uSpan, vSpan, u0 = 0, v0 = 0) {
  const px = cv.width, pat = g.createPattern(cv, 'repeat');
  const ex = { x: (F[1].x - F[0].x) / uSpan, y: (F[1].y - F[0].y) / uSpan }, ey = { x: (F[3].x - F[0].x) / vSpan, y: (F[3].y - F[0].y) / vSpan };
  pat.setTransform(new DOMMatrix([ex.x / px, ex.y / px, ey.x / px, ey.y / px, F[0].x - ex.x * u0 - ey.x * v0, F[0].y - ex.y * u0 - ey.y * v0]));
  quad(g, F); g.fillStyle = pat; g.fill();
}
function shadeFace(g, F, f) {
  quad(g, F);
  if (f < 1) { g.fillStyle = `rgba(0,0,0,${1 - f})`; g.fill(); } else if (f > 1) { g.fillStyle = `rgba(255,255,255,${(f - 1) * 0.9})`; g.fill(); }
}
function faceCorners(kind, x, y, z) {
  if (kind === 'top') return [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
  if (kind === 'x') return [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]];
  return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
}
function outerEdge(a, b, box) {
  let n = 0;
  for (const [k, v] of [[0, box.x0], [0, box.x1], [1, box.y0], [1, box.y1], [2, box.z0], [2, box.z1]]) if (Math.abs(a[k] - v) < 1e-9 && Math.abs(b[k] - v) < 1e-9) n++;
  return n >= 2;
}

function pieceFace(g, F, kind, o, ci, skin) {
  const th = skin.theme.id, mat = skin.mats[o.col % 6];
  const base = skin.theme.paints ? skin.theme.paints[o.col % 6] : '#999999';
  const along = (kind === 'x' && o.axis === 'z') || (kind === 'z' && o.axis === 'x');
  const topAlongV = kind === 'top' && o.axis === 'z';
  if (mat) {
    if (kind === 'top') texFace(g, F, mat, topAlongV ? 1 : 0.5, topAlongV ? 0.5 : 1, topAlongV ? 0 : ci * 0.5, topAlongV ? ci * 0.5 : 0);
    else texFace(g, F, mat, along ? 0.5 : 1, 1, along ? ci * 0.5 : 0, 0);
  } else { quad(g, F); g.fillStyle = base; g.fill(); }
  shadeFace(g, F, LIGHT[kind]);
  g.lineWidth = 1;
  const seam = (col, w) => {
    g.strokeStyle = col; g.lineWidth = w;
    if (kind === 'top') { if (ci > 0) { if (o.axis === 'x') line(g, at(F, 0, 0), at(F, 0, 1)); else line(g, at(F, 0, 0), at(F, 1, 0)); } }
    else if (along && ci > 0) line(g, at(F, 0, 0), at(F, 0, 1));
  };
  const across = (t, a0 = 0.04, a1 = 0.96) => {
    if (kind === 'top') { if (o.axis === 'x') line(g, at(F, t, a0), at(F, t, a1)); else line(g, at(F, a0, t), at(F, a1, t)); }
    else if (along) line(g, at(F, t, a0), at(F, t, a1));
  };
  switch (th) {
    case 'port':
      if (kind === 'top') { g.strokeStyle = 'rgba(0,0,0,.12)'; for (const t of [0.25, 0.5, 0.75]) across(t, 0.06, 0.94); }
      else if (along) { for (let k = 1; k < 6; k++) { g.strokeStyle = k % 2 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)'; line(g, at(F, k / 6, 0.08), at(F, k / 6, 0.92)); } }
      else { g.strokeStyle = 'rgba(0,0,0,.3)'; line(g, at(F, 0.5, 0.08), at(F, 0.5, 0.92)); g.strokeStyle = 'rgba(255,255,255,.35)'; for (const q of [0.28, 0.38, 0.62, 0.72]) line(g, at(F, q, 0.12), at(F, q, 0.88)); }
      seam('rgba(0,0,0,.32)', 1);
      break;
    case 'quarry':
      seam('rgba(0,0,0,.5)', 1.6);
      if (kind === 'top' || along) { g.strokeStyle = 'rgba(255,255,255,.25)'; across(0.035, 0.05, 0.95); }
      break;
    case 'farm': {
      const wrapped = o.col % 6 >= 2;
      if (!wrapped) { g.strokeStyle = 'rgba(90,60,20,.75)'; g.lineWidth = 1.2; across(0.3); across(0.7); }
      else { g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1; across(0.5, 0.1, 0.9); }
      seam(wrapped ? 'rgba(0,0,0,.45)' : 'rgba(70,45,10,.55)', 1.3);
      if (!along && kind !== 'top' && !wrapped) { g.strokeStyle = 'rgba(90,60,20,.35)'; quad(g, [at(F, 0.12, 0.12), at(F, 0.88, 0.12), at(F, 0.88, 0.88), at(F, 0.12, 0.88)]); g.stroke(); }
      break;
    }
    case 'warehouse':
      seam('rgba(0,0,0,.42)', 1.3);
      if (kind === 'top') { g.strokeStyle = o.col % 6 <= 1 ? 'rgba(200,170,110,.85)' : 'rgba(255,255,255,.3)'; g.lineWidth = 2; if (o.axis === 'x') line(g, at(F, 0.02, 0.5), at(F, 0.98, 0.5)); else line(g, at(F, 0.5, 0.02), at(F, 0.5, 0.98)); }
      else if (along) { g.fillStyle = 'rgba(255,255,255,.55)'; quad(g, [at(F, 0.3, 0.3), at(F, 0.7, 0.3), at(F, 0.7, 0.55), at(F, 0.3, 0.55)]); g.fill(); }
      break;
    case 'lumber':
      if (along || kind === 'top') { g.strokeStyle = 'rgba(40,25,10,.35)'; g.lineWidth = 0.8; for (const v of [0.25, 0.5, 0.75]) { if (kind === 'top' && o.axis === 'z') line(g, at(F, v, 0), at(F, v, 1)); else line(g, at(F, 0, v), at(F, 1, v)); } }
      else { g.strokeStyle = 'rgba(60,35,10,.45)'; g.lineWidth = 0.8; for (const [cu, cv] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const c = at(F, cu, cv); g.beginPath(); g.arc(c.x, c.y, 2.2, 0, 6.3); g.stroke(); } }
      g.strokeStyle = 'rgba(30,30,34,.85)'; g.lineWidth = 1.8; across(0.5, 0, 1);
      seam('rgba(30,20,10,.4)', 1);
      break;
    case 'toy':
      seam('rgba(0,0,0,.28)', 1);
      if (kind === 'top') {
        for (const [su, sv] of [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]]) {
          const c = at(F, su, sv), w = Math.hypot(F[1].x - F[0].x, F[1].y - F[0].y) * 0.13;
          g.beginPath(); g.ellipse(c.x, c.y + 1.2, w, w * 0.62, 0, 0, 6.3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill();
          g.beginPath(); g.ellipse(c.x, c.y, w, w * 0.62, 0, 0, 6.3); g.fillStyle = rgba(mixHex(base, '#ffffff', 0.25), 1); g.fill();
        }
      }
      break;
    case 'gift': {
      seam('rgba(0,0,0,.4)', 1.3);
      const rib = o.col % 6 === 2 || o.col % 6 === 5 ? '#24406e' : '#f6e7b0';
      g.strokeStyle = rib; g.lineWidth = 2;
      if (kind === 'top') { across(0.5, 0.02, 0.98); if (o.axis === 'x') line(g, at(F, 0.02, 0.5), at(F, 0.98, 0.5)); else line(g, at(F, 0.5, 0.02), at(F, 0.5, 0.98)); }
      else if (along) across(0.5, 0.02, 0.98);
      else line(g, at(F, 0.5, 0.02), at(F, 0.5, 0.98));
      break;
    }
    case 'books':
      if (kind === 'top') { g.strokeStyle = 'rgba(255,250,235,.55)'; g.lineWidth = 0.8; for (const v of [0.3, 0.5, 0.7]) { if (o.axis === 'x') line(g, at(F, 0.04, v), at(F, 0.96, v)); else line(g, at(F, v, 0.04), at(F, v, 0.96)); } }
      else if (along) { g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.8; for (const v of [0.34, 0.67]) line(g, at(F, 0, v), at(F, 1, v)); g.strokeStyle = 'rgba(255,240,200,.5)'; line(g, at(F, 0, 0.17), at(F, 1, 0.17)); }
      else { g.fillStyle = 'rgba(245,238,220,.85)'; quad(g, [at(F, 0.1, 0.08), at(F, 0.9, 0.08), at(F, 0.9, 0.92), at(F, 0.1, 0.92)]); g.fill(); }
      g.strokeStyle = 'rgba(40,30,20,.9)'; g.lineWidth = 1.8; across(0.5, 0, 1);
      seam('rgba(0,0,0,.45)', 1.2);
      break;
    case 'bins':
      seam('rgba(0,0,0,.45)', 1.4);
      if (kind === 'top') { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; if (o.axis === 'x') { line(g, at(F, 0.1, 0.18), at(F, 0.1, 0.82)); } g.fillStyle = 'rgba(0,0,0,.25)'; const c = at(F, 0.5, 0.5); g.beginPath(); g.ellipse(c.x, c.y, 4, 1.6, 0, 0, 6.3); g.fill(); }
      else if (along) { g.fillStyle = 'rgba(255,255,255,.18)'; quad(g, [at(F, 0, 0), at(F, 1, 0), at(F, 1, 0.2), at(F, 0, 0.2)]); g.fill(); g.strokeStyle = 'rgba(0,0,0,.15)'; for (const u of [0.33, 0.66]) line(g, at(F, u, 0.25), at(F, u, 0.95)); }
      break;
    case 'precast':
      seam('rgba(0,0,0,.5)', 1.5);
      if (kind === 'top') { const c = at(F, 0.5, 0.5); g.strokeStyle = '#5c5f63'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(c.x, c.y, 3, 1.8, 0, Math.PI, 0); g.stroke(); }
      else if (along) { g.strokeStyle = 'rgba(0,0,0,.18)'; line(g, at(F, 0.02, 0.15), at(F, 0.98, 0.15)); }
      break;
    default: seam('rgba(0,0,0,.3)', 1);
  }
}
function crateFace(g, F, kind, fill, trim, skin) {
  if (!trim && skin.crate) texFace(g, F, skin.crate, 1, 1); else { quad(g, F); g.fillStyle = fill; g.fill(); }
  shadeFace(g, F, LIGHT[kind]);
  const m = 0.14, inner = [at(F, m, m), at(F, 1 - m, m), at(F, 1 - m, 1 - m), at(F, m, 1 - m)];
  g.lineWidth = 1.6;
  g.strokeStyle = trim ? (kind === 'top' ? CREAM : kind === 'z' ? '#dccdb8' : '#b0a493') : 'rgba(70,45,15,.5)';
  quad(g, inner); g.stroke();
  g.lineWidth = 1.2;
  if (kind === 'top') line(g, at(F, m, 0.5), at(F, 1 - m, 0.5)); else line(g, at(F, m, m), at(F, 1 - m, 1 - m));
}

export function drawYardStyled(g, rd, O, W, board, skin) {
  const { gx, gz, H } = W, P = O.P, th = skin.theme, u = skin.look.u;
  if (skin.sky) {
    const iw = skin.sky.width, ih = skin.sky.height, sw = board.w * 2.2, sh = board.h * 0.75;
    g.drawImage(skin.sky, (u[1] * 0.5) * iw, 0, iw * 0.5, ih, 0, 0, board.w, sh);
    const gr = g.createLinearGradient(0, sh * 0.6, 0, board.h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(225,228,224,.95)');
    g.fillStyle = gr; g.fillRect(0, 0, board.w, board.h);
    g.fillStyle = 'rgba(255,255,255,.34)'; g.fillRect(0, 0, board.w, board.h);
    void sw;
  } else {
    g.fillStyle = '#e7e3dc'; g.fillRect(0, 0, board.w, board.h);
    if (skin.wall) { const pat = g.createPattern(skin.wall, 'repeat'); g.save(); g.globalAlpha = 0.7; g.fillStyle = pat; g.fillRect(0, 0, board.w, board.h * 0.62); g.restore(); }
    const gr = g.createLinearGradient(0, board.h * 0.55, 0, board.h);
    gr.addColorStop(0, 'rgba(0,0,0,.12)'); gr.addColorStop(0.1, 'rgba(210,205,196,.9)'); gr.addColorStop(1, 'rgba(222,218,210,1)');
    g.fillStyle = gr; g.fillRect(0, board.h * 0.55, board.w, board.h * 0.45);
  }
  g.lineJoin = 'round';
  const side1 = [P(gx, 0, 0), P(gx, 0, gz), P(gx, -SLAB, gz), P(gx, -SLAB, 0)], side2 = [P(0, 0, gz), P(gx, 0, gz), P(gx, -SLAB, gz), P(0, -SLAB, gz)];
  const top = [P(0, 0, 0), P(gx, 0, 0), P(gx, 0, gz), P(0, 0, gz)];
  for (const [F, f] of [[side1, 0.55], [side2, 0.7], [top, 1]]) {
    texFace(g, F, skin.ground, F === top ? gx / 2.2 : 2.2, F === top ? gz / 2.2 : 0.3, u[2], u[3]);
    if (f < 1) { quad(g, F); g.fillStyle = `rgba(0,0,0,${1 - f})`; g.fill(); }
    quad(g, F); g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  }
  g.strokeStyle = th.id === 'toy' || th.id === 'warehouse' ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.6)'; g.lineWidth = 1.2;
  for (let x = 1; x < gx; x++) line(g, P(x, 0, 0), P(x, 0, gz));
  for (let z = 1; z < gz; z++) line(g, P(0, 0, z), P(gx, 0, z));
  if (th.line) { g.strokeStyle = th.line; g.lineWidth = 1.6; quad(g, [P(0.08, 0, 0.08), P(gx - 0.08, 0, 0.08), P(gx - 0.08, 0, gz - 0.08), P(0.08, 0, gz - 0.08)]); g.stroke(); }
  const cells = [];
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) for (let y = 0; y < H[x][z]; y++) cells.push([x, y, z]);
  cells.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[1] - b[1] || a[0] - b[0]);
  for (const [x, y, z] of cells) {
    const o = W.ownerAt(x, y, z);
    const faces = [];
    if (x === gx - 1 || H[x + 1][z] <= y) faces.push('x');
    if (z === gz - 1 || H[x][z + 1] <= y) faces.push('z');
    if (y === H[x][z] - 1) faces.push('top');
    const ci = o.kind === 'con' ? (o.axis === 'x' ? x - o.box.x0 : z - o.box.z0) : 0;
    for (const kind of faces) {
      const Wc = faceCorners(kind, x, y, z), F = Wc.map(([a, b, c]) => P(a, b, c));
      g.save();
      if (o.kind === 'con') pieceFace(g, F, kind, o, ci, skin);
      else if (o.kind === 'red') crateFace(g, F, kind, RED, CREAM, skin);
      else crateFace(g, F, kind, '#c9a063', null, skin);
      g.restore();
      g.strokeStyle = EDGE; g.lineWidth = 1.1;
      for (let e = 0; e < 4; e++) if (outerEdge(Wc[e], Wc[(e + 1) % 4], o.box)) line(g, F[e], F[(e + 1) % 4]);
    }
  }
}
void hexRGB;
