import { splitIds } from '../core/style.js';
import { loadImage } from '../core/assets.js';

export const AVATARS = ['woman', 'man', 'girl', 'boy', 'dog', 'cat', 'bear', 'penguin', 'robot', 'turtle', 'rabbit', 'fox'];
export const PRONOUN = { woman: 'her', girl: 'her', man: 'his', boy: 'his' };
export const avatarSplit = splitIds('pmw_avatar', AVATARS, 3);
const TAU = Math.PI * 2;

const SKIN = ['#f6d5b8', '#f1c9a5', '#e2b796', '#d4a373', '#c68e5f', '#a86b45', '#8d5a3b', '#6e4430', '#5e3a24', '#4a2c1c'];
const TOPS = ['#c4553f', '#2f6db3', '#3f8f5a', '#d9a321', '#7e57c2', '#455a64', '#e07a9a', '#00897b', '#6d4c41'];
const HAIR = ['#3b2a20', '#1d1d1d', '#8a5a2b', '#d9b26a', '#b0502b', '#9e9e9e'];
const SHOES = ['#4a3b33', '#222222', '#6d4c41', '#f5f5f5', '#1e3a5f', '#8e1b1b'];
const FUR = { dog: ['#c8925a', '#3a2c22', '#e9dcc6', '#8a8a8a', '#b5651d'], cat: ['#f0a04b', '#4a4a4a', '#e8e3da', '#9b7653', '#2b2b2b'],
  bear: ['#6b4a2f', '#3b2a1e', '#e9e4dc', '#8c6239'], fox: ['#d9692a', '#c0561c', '#b0b0b0'], rabbit: ['#e8e0d4', '#9b8b7a', '#6f5b4b'],
  turtle: ['#5b7f3a', '#6d6a3a', '#3f6b5a'], penguin: ['#22262b', '#2c3440'], robot: ['#b0bec5', '#ffca28', '#90caf9', '#ef9a9a', '#a5d6a7'] };
const SPLITS = new Map();
function inSplit(style, pool, items, minTest = 1) {
  if (!SPLITS.has(pool)) SPLITS.set(pool, splitIds(pool, items, minTest));
  const sp = SPLITS.get(pool), a = items.filter((x) => sp(x) === style.split);
  return a.length ? a : items;
}
function pickSplit(style, pool, items, minTest = 1) {
  const a = inSplit(style, pool, items, minTest), it = a[Math.floor(style.rand() * a.length)];
  style.note(`${pool}:${it}`);
  return it;
}

export function chooseSkin(style, kind) {
  return { skin: pickSplit(style, 'pmw_skin', SKIN, 2), top: pickSplit(style, 'pmw_top', TOPS), hair: pickSplit(style, 'pmw_hair', HAIR),
    shoes: pickSplit(style, 'pmw_shoes', SHOES), fur: pickSplit(style, `pmw_fur_${kind}`, FUR[kind] || ['#888888', '#666666']),
    cap: style.rand() < 0.5, accent: pickSplit(style, 'pmw_cap', TOPS) };
}

function E(g, x, y, rx, ry, col, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fillStyle = col; g.fill(); }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.max(0, Math.min(255, k <= 1 ? v * k : v + (255 - v) * (k - 1)))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const shadowOn = (g) => { g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6; g.shadowOffsetY = 2; };
const shadowOff = (g) => { g.shadowColor = 'transparent'; };

function person(g, s, { hairStyle, scale = 1, headK = 1 }) {
  g.save(); g.scale(scale, scale);
  g.save(); shadowOn(g); for (const sx of [-8, 8]) E(g, sx, -14, 5, 9, s.shoes); g.restore();
  for (const sx of [-1, 1]) E(g, sx * 23, -4, 4.5, 10, s.skin, sx * -0.2);
  g.save(); shadowOn(g); E(g, 0, 2, 24, 12, s.top); g.restore();
  g.beginPath(); g.ellipse(0, 2, 24, 12, 0, 0, TAU); g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1; g.stroke();
  const hr = 10 * headK;
  E(g, 0, -hr - 1.5, 2.6, 3.4, s.skin);
  E(g, 0, 0, hr, hr, s.skin);
  if (hairStyle === 'bun') {
    g.beginPath(); g.arc(0, 1.5, hr, Math.PI * 1.08, Math.PI * 1.92, true); g.closePath(); g.fillStyle = s.hair; g.fill();
    E(g, 0, hr + 1, 4.5, 4.5, s.hair);
  } else if (hairStyle === 'short') {
    g.beginPath(); g.arc(0, 0.5, hr + 0.6, Math.PI * 1.15, Math.PI * 1.85, true); g.closePath(); g.fillStyle = s.hair; g.fill();
    if (s.cap) { E(g, 0, 0, hr + 0.8, hr + 0.8, s.accent); E(g, 0, -hr - 2.5, hr * 0.75, 4.2, shade(s.accent, 0.75)); E(g, 0, 0, 2, 2, shade(s.accent, 0.6)); }
  } else if (hairStyle === 'pigtails') {
    g.beginPath(); g.arc(0, 1.5, hr, Math.PI * 1.1, Math.PI * 1.9, true); g.closePath(); g.fillStyle = s.hair; g.fill();
    for (const sx of [-1, 1]) E(g, sx * (hr + 2.5), 3, 3.6, 3.6, s.hair);
  } else {
    g.beginPath(); g.arc(0, 0, hr + 0.4, Math.PI * 1.2, Math.PI * 1.8, true); g.closePath(); g.fillStyle = s.hair; g.fill();
  }
  g.restore();
}

function quadruped(g, s, kind) {
  const fur = s.fur, dark = shade(fur, 0.7), light = shade(fur, 1.35);
  g.save(); shadowOn(g);
  for (const sx of [-1, 1]) { E(g, sx * 11, -8, 4, 5.5, dark); E(g, sx * 11, 16, 4, 5.5, dark); }
  E(g, 0, 5, kind === 'bear' ? 18 : 12.5, kind === 'bear' ? 21 : 22, fur);
  shadowOff(g); g.restore();
  if (kind === 'fox') { E(g, 0, 32, 6, 10, fur); E(g, 0, 39, 3.5, 4, '#f4efe6'); }
  else if (kind === 'cat') { g.strokeStyle = fur; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 25); g.lineTo(0, 42); g.stroke(); }
  else if (kind === 'rabbit') E(g, 0, 27, 5, 5, '#f6f2ea');
  else if (kind === 'dog') E(g, 0, 31, 3.2, 8, fur);
  const hy = kind === 'bear' ? -20 : -19;
  if (kind === 'rabbit') { for (const sx of [-1, 1]) { E(g, sx * 4.5, -36, 3.2, 10, fur, sx * 0.12); E(g, sx * 4.5, -36, 1.5, 7, '#f2b8c6', sx * 0.12); } }
  else if (kind === 'cat' || kind === 'fox') { for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 3.5, hy - 7); g.lineTo(sx * 11, hy - 13); g.lineTo(sx * 10.5, hy - 2); g.closePath(); g.fillStyle = dark; g.fill(); } }
  else if (kind === 'bear') { for (const sx of [-1, 1]) E(g, sx * 9, hy - 8, 4.5, 4.5, dark); }
  else { for (const sx of [-1, 1]) E(g, sx * 10, hy + 1, 4, 8, dark, sx * 0.35); }
  E(g, 0, hy, kind === 'bear' ? 12 : 10, kind === 'bear' ? 11 : 10, fur);
  const sn = kind === 'cat' ? 4.5 : kind === 'rabbit' ? 4 : 5.5;
  E(g, 0, hy - 9, sn, sn + 1.5, kind === 'fox' ? '#f4efe6' : light);
  E(g, 0, hy - 13.5, 2.2, 1.8, '#222');
}

function penguin(g) {
  g.save(); shadowOn(g);
  for (const sx of [-1, 1]) E(g, sx * 6.5, -21, 3.5, 5, '#f39c12');
  for (const sx of [-1, 1]) E(g, sx * 17, 3, 4, 12, '#1b1f24', sx * -0.25);
  E(g, 0, 3, 15, 20, '#22262b');
  shadowOff(g); g.restore();
  E(g, 0, -11, 9.5, 9, '#2b3036');
  g.beginPath(); g.moveTo(-3.5, -18); g.lineTo(0, -27); g.lineTo(3.5, -18); g.closePath(); g.fillStyle = '#f39c12'; g.fill();
  for (const sx of [-1, 1]) E(g, sx * 4.5, -14, 1.6, 1.6, '#ffffff');
}

function robot(g, s) {
  const body = s.fur, dark = shade(body, 0.6);
  g.save(); shadowOn(g);
  for (const sx of [-1, 1]) { g.fillStyle = '#37474f'; g.fillRect(sx * 9 - 4, -24, 8, 12); }
  for (const sx of [-1, 1]) E(g, sx * 24, 0, 4.5, 9, dark);
  g.fillStyle = body; g.beginPath(); g.roundRect(-21, -6, 42, 20, 5); g.fill();
  shadowOff(g); g.restore();
  g.fillStyle = shade(body, 1.2); g.beginPath(); g.roundRect(-10, -14, 20, 18, 4); g.fill();
  g.fillStyle = '#00bcd4'; g.fillRect(-8, -14, 16, 4);
  E(g, 0, -3, 2.2, 2.2, '#e53935');
}

function turtle(g, s) {
  const shell = s.fur, dark = shade(shell, 0.65), skin = '#a3b86c';
  g.save(); shadowOn(g);
  for (const sx of [-1, 1]) { E(g, sx * 17, -12, 5, 6, skin, sx * 0.5); E(g, sx * 16, 14, 5, 6, skin, sx * -0.5); }
  E(g, 0, 23, 3, 5, skin);
  E(g, 0, -27, 6, 8, skin);
  E(g, 0, 1, 18, 22, shell);
  shadowOff(g); g.restore();
  E(g, 0, -31, 1.4, 1.4, '#222');
  g.strokeStyle = dark; g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const x = 7 * Math.cos(a), y = 1 + 8 * Math.sin(a); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.stroke();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.moveTo(7 * Math.cos(a), 1 + 8 * Math.sin(a)); g.lineTo(16 * Math.cos(a), 1 + 20 * Math.sin(a)); g.stroke(); }
}

export function drawAvatar(g, kind, skin, x, y, deg) {
  g.save(); g.translate(x, y); g.rotate((deg * Math.PI) / 180);
  if (kind === 'woman') { g.scale(1.7, 1.7); person(g, skin, { hairStyle: 'bun' }); }
  else if (kind === 'man') { g.scale(1.7, 1.7); person(g, skin, { hairStyle: 'short' }); }
  else if (kind === 'girl') { g.scale(1.45, 1.45); person(g, skin, { hairStyle: 'pigtails', headK: 1.15 }); }
  else if (kind === 'boy') { g.scale(1.45, 1.45); person(g, skin, { hairStyle: 'crop', headK: 1.15 }); }
  else if (kind === 'penguin') { g.scale(1.5, 1.5); penguin(g); }
  else if (kind === 'robot') { g.scale(1.55, 1.55); robot(g, skin); }
  else if (kind === 'turtle') { g.scale(1.45, 1.45); turtle(g, skin); }
  else { g.scale(1.4, 1.4); quadruped(g, skin, kind); }
  g.restore();
}

const GROUND_OK = (t) => (t.use === 'terrain' && !/rock_face|rock_wall|boulder|cliff/.test(t.id))
  || (t.use === 'floor' && /concrete|plaster|cement|terrazzo|clay|asphalt|granular|gravel/.test(t.id) && !/pavement|paving|tiles|pattern|brick|^painted_concrete$/.test(t.id))
  || (t.use === 'fabric' && /velour|terry|linen|jersey|hessian|melange|felt|wool/.test(t.id) && !/herringbone|check|quatrefoil/.test(t.id))
  || (t.use === 'stone' && /pebbles|rock_surface/.test(t.id));
const RUGS = ['round', 'none', 'square', 'ring-stones', 'mat-oval'];
const ARROWS = ['bold', 'needle', 'thin', 'diamond'];
const ARROW_COLS = ['#1991fa', '#e53935', '#ff9800', '#7b1fa2', '#00897b', '#111111', '#ffffff', '#fdd835'];

function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }

export async function buildGroundLook(style) {
  const tex = style.primary('tex', GROUND_OK);
  const img = tex ? await loadImage('assets/' + tex.file) : null;
  const rnd = style.rand;
  const groundLum = tex ? Math.pow((0.2126 * tex.mean_lin[0] + 0.7152 * tex.mean_lin[1] + 0.0722 * tex.mean_lin[2]), 1 / 2.2) : 0.9;
  const splitCols = inSplit(style, 'pmw_arrow_col', ARROW_COLS, 2);
  let cols = splitCols.filter((c) => Math.abs(lum(c) - groundLum) > 0.35);
  if (!cols.length) cols = [splitCols.slice().sort((a, b) => Math.abs(lum(b) - groundLum) - Math.abs(lum(a) - groundLum))[0]];
  const arrowCol = cols[Math.floor(rnd() * cols.length)];
  style.note(`pmw_arrow_col:${arrowCol}`);
  const look = {
    img, rot: rnd() * 360, scale: 0.45 + rnd() * 0.35, groundLum,
    rug: pickSplit(style, 'pmw_rug', RUGS), arrow: pickSplit(style, 'pmw_arrow', ARROWS), arrowCol,
    rugCol: pickSplit(style, 'pmw_rug_col', ['#e4e6e1', '#d9c7a4', '#b9c9d6', '#cfd8c4', '#e6d0d6', '#bfa58a']),
    props: inSplit(style, 'pmw_prop', PROPS, 3),
  };
  return look;
}

export function paintGround(g, w, h, L, C, R) {
  g.fillStyle = '#c9c9c4'; g.fillRect(0, 0, w, h);
  if (L.img) {
    const pat = g.createPattern(L.img, 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().rotateSelf(L.rot).scaleSelf(L.scale, L.scale));
    g.fillStyle = pat; g.fillRect(0, 0, w, h);
  }
  const gr = g.createRadialGradient(C.x, C.y, R * 0.6, C.x, C.y, w * 0.7);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6;
  if (L.rug === 'round') { g.beginPath(); g.arc(C.x, C.y, R + 14, 0, TAU); g.fillStyle = L.rugCol; g.fill(); }
  else if (L.rug === 'square') { g.fillStyle = L.rugCol; g.fillRect(C.x - R - 12, C.y - R - 12, 2 * R + 24, 2 * R + 24); }
  else if (L.rug === 'mat-oval') { g.beginPath(); g.ellipse(C.x, C.y, R + 16, R + 16, 0, 0, TAU); g.fillStyle = L.rugCol; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; g.beginPath(); g.arc(C.x, C.y, R + 10, 0, TAU); g.stroke(); }
  else if (L.rug === 'ring-stones') { g.fillStyle = '#9e9a92'; for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; g.beginPath(); g.arc(C.x + Math.cos(a) * (R + 12), C.y + Math.sin(a) * (R + 12), 4, 0, TAU); g.fill(); } }
  g.restore();
  const light = L.rug === 'none' || L.rug === 'ring-stones' ? L.groundLum < 0.5 : true;
  g.strokeStyle = light && L.rug !== 'none' ? 'rgba(0,0,0,.18)' : L.groundLum < 0.5 ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.25)';
  g.lineWidth = 1.5; g.setLineDash([3, 5]); g.beginPath(); g.arc(C.x, C.y, R, 0, TAU); g.stroke(); g.setLineDash([]);
}

export function drawArrow(g, L, C, R, deg) {
  const a = (deg * Math.PI) / 180, nx = Math.sin(a), ny = -Math.cos(a);
  const a0 = 52, tip = R + 6;
  const col = L.arrowCol, edge = lum(col) > 0.6 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.85)';
  g.save(); g.lineCap = 'round';
  const line = (w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(C.x + nx * a0, C.y + ny * a0); g.lineTo(C.x + nx * (tip - 12), C.y + ny * (tip - 12)); g.stroke(); };
  if (L.arrow === 'thin') { line(5, edge); line(2.6, col); }
  else if (L.arrow === 'needle') { line(8, edge); line(5, col); }
  else { line(7.5, edge); line(5, col); }
  g.translate(C.x + nx * tip, C.y + ny * tip); g.rotate(a);
  g.beginPath();
  if (L.arrow === 'diamond') { g.moveTo(0, -6); g.lineTo(-7, 5); g.lineTo(0, 16); g.lineTo(7, 5); }
  else if (L.arrow === 'needle') { g.moveTo(0, -8); g.lineTo(-7, 12); g.lineTo(0, 7); g.lineTo(7, 12); }
  else if (L.arrow === 'thin') { g.moveTo(0, -4); g.lineTo(-8, 12); g.lineTo(8, 12); }
  else { g.moveTo(0, -4); g.lineTo(-11, 14); g.lineTo(11, 14); }
  g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = edge; g.lineWidth = 1.5; g.stroke();
  g.restore();
}

const PROPS = ['rock', 'bush', 'pot', 'puddle', 'crate', 'leaves', 'stump', 'manhole', 'ball', 'flowers'];
export function placeProps(rnd, w, h, c, R, facing, kinds = PROPS) {
  const n = 3 + Math.floor(rnd() * 5), out = [];
  for (let t = 0; t < 400 && out.length < n; t++) {
    const x = 10 + rnd() * (w - 20), y = 10 + rnd() * (h - 20), r = 8 + rnd() * 12;
    if (Math.hypot(x - c.x, y - c.y) < R + 18 + r) continue;
    const bearing = (Math.atan2(x - c.x, -(y - c.y)) * 180) / Math.PI;
    const rel = ((bearing - facing) % 90 + 90 + 45) % 90 - 45;
    if (Math.abs(rel) < 22 + (r / Math.hypot(x - c.x, y - c.y)) * 57) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 4)) continue;
    out.push({ x, y, r, kind: kinds[Math.floor(rnd() * kinds.length)], rot: rnd() * 6.28, hue: Math.floor(rnd() * 360) });
  }
  return out;
}
export function drawProps(g, props) {
  for (const p of props) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    const r = p.r;
    switch (p.kind) {
      case 'rock': { g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, f = 0.75 + 0.25 * Math.sin(k * 2.3 + p.hue); g.lineTo(r * f * Math.cos(a), r * 0.8 * f * Math.sin(a)); } g.closePath(); g.fillStyle = '#8d8a84'; g.fill(); g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(-r * 0.2, -r * 0.2, r * 0.35, r * 0.25, 0, 0, TAU); g.fill(); break; }
      case 'bush': { g.fillStyle = '#3f7d34'; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.beginPath(); g.arc(r * 0.45 * Math.cos(a), r * 0.45 * Math.sin(a), r * 0.55, 0, TAU); g.fill(); } g.shadowColor = 'transparent'; g.fillStyle = '#5c9e45'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); break; }
      case 'pot': { g.fillStyle = '#b5652b'; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.fill(); g.shadowColor = 'transparent'; g.fillStyle = '#4b3221'; g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.fill(); g.fillStyle = '#4caf50'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(0, 0, r * 0.18, r * 0.6, (k / 5) * TAU, 0, TAU); g.fill(); } break; }
      case 'puddle': { g.shadowColor = 'transparent'; g.fillStyle = 'rgba(90,120,150,.55)'; g.beginPath(); g.ellipse(0, 0, r * 1.2, r * 0.7, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.15, r * 0.4, r * 0.15, 0, 0, TAU); g.fill(); break; }
      case 'crate': { g.fillStyle = '#a97c50'; g.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); g.shadowColor = 'transparent'; g.strokeStyle = '#6d4c2f'; g.lineWidth = 1.5; g.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); g.strokeRect(-r * 0.5, -r * 0.5, r, r); break; }
      case 'leaves': { g.shadowColor = 'transparent'; for (let k = 0; k < 6; k++) { const a = k * 1.9 + p.hue; g.fillStyle = `hsl(${25 + (k * 13) % 30},70%,${40 + (k * 7) % 15}%)`; g.beginPath(); g.ellipse(r * 0.6 * Math.cos(a), r * 0.6 * Math.sin(a), r * 0.28, r * 0.14, a, 0, TAU); g.fill(); } break; }
      case 'stump': { g.fillStyle = '#7a5235'; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.fill(); g.shadowColor = 'transparent'; g.fillStyle = '#d2b48c'; g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.fill(); g.strokeStyle = 'rgba(120,80,40,.6)'; g.lineWidth = 1; for (const q of [0.2, 0.4]) { g.beginPath(); g.arc(0, 0, r * q, 0, TAU); g.stroke(); } break; }
      case 'manhole': { g.shadowColor = 'transparent'; g.fillStyle = '#5b5e63'; g.beginPath(); g.arc(0, 0, r * 0.85, 0, TAU); g.fill(); g.strokeStyle = '#3c3f43'; g.lineWidth = 1.5; for (const q of [0.3, 0.55, 0.75]) { g.beginPath(); g.arc(0, 0, r * q, 0, TAU); g.stroke(); } break; }
      case 'ball': { g.fillStyle = `hsl(${p.hue},70%,55%)`; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(-r * 0.15, -r * 0.15, r * 0.15, 0, TAU); g.fill(); break; }
      default: { g.shadowColor = 'transparent'; g.fillStyle = '#4c8c3a'; g.beginPath(); g.arc(0, 0, r * 0.7, 0, TAU); g.fill(); for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.fillStyle = `hsl(${p.hue},75%,65%)`; g.beginPath(); g.arc(r * 0.45 * Math.cos(a), r * 0.45 * Math.sin(a), r * 0.2, 0, TAU); g.fill(); } }
    }
    g.restore();
  }
}
