import { splitPool, roundRobinPairs, texCanvas, fillTex, shade, mix, texMeanHex, relLum, hexOfLin, choose, firstIsotropic } from './_grid_look_kit.js';
import { splitIds } from '../core/style.js';

const TAU = Math.PI * 2;
const THEMES = [
  { id: 'hedge', wall: ['terrain'], wallRe: /leaves|grass|forest|moss/, wallTint: '#2f5a26', path: ['terrain', 'floor'], pathRe: /gravel|sand|pebble/, pathTint: '#ddd2b8', runner: 'explorer' },
  { id: 'dungeon', wall: ['stone', 'wall'], wallRe: /stone|castle|medieval|block|rock_wall/, wallTint: '#3b3833', path: ['floor', 'stone'], pathRe: /tile|slab|monastery|cobble|stone|rock_tile/, pathTint: '#c9c1b2', runner: 'knight' },
  { id: 'ice', wall: ['terrain', 'stone'], wallRe: /rock|snow|cliff/, wallTint: '#1f4f7a', path: ['terrain'], pathRe: /snow/, pathTint: '#eef4fa', runner: 'parka' },
  { id: 'scifi', wall: ['metal'], wallRe: /plate|grate|factory|shutter|corrugated/, wallTint: '#1d2430', path: ['floor', 'metal'], pathRe: /concrete|plate|painted|garage|hangar/, pathTint: '#d6dee8', runner: 'astronaut' },
  { id: 'paper', wall: ['flat2d', 'fabric', 'wall'], wallRe: /concrete|plaster|linen|leather|denim/, wallTint: '#4a4a4a', path: ['flat2d', 'wall', 'fabric'], pathRe: /plaster|white|leather_white|linen|jersey|beige/, pathTint: '#fbfaf5', runner: 'kid', pencil: true },
  { id: 'cave', wall: ['terrain', 'stone'], wallRe: /rock|cliff|boulder|lichen/, wallTint: '#3a322b', path: ['terrain'], pathRe: /sand|mud_dry|dry_ground|gravelly/, pathTint: '#d8c39a', runner: 'explorer' },
  { id: 'garden', wall: ['wall'], wallRe: /brick/, wallTint: '#6a3428', path: ['floor', 'stone'], pathRe: /paving|pavement|cobble|slab|hexagonal|square/, pathTint: '#cfc8bb', runner: 'kid' },
  { id: 'wood_toy', wall: ['wood'], wallRe: /dark|rosewood|walnut|brown|planks|worn/, wallTint: '#4a2c16', path: ['wood'], pathRe: /plywood|oak|fine|laminate|veneer|synthetic|table/, pathTint: '#e2c79b', runner: 'kid' },
  { id: 'corn', wall: ['roof', 'terrain'], wallRe: /thatch|leaves|grass/, wallTint: '#6e7a2a', path: ['terrain'], pathRe: /mud|ground|soil|trail/, pathTint: '#c8a77a', runner: 'farmer' },
];
const themesOf = splitPool('g14_flat_theme', THEMES, 2);
const GEMS = [
  { id: 'emerald', c: '#34d399', e: '#0b7a5b' }, { id: 'ruby', c: '#f0506e', e: '#8f1330' }, { id: 'sapphire', c: '#4f8df7', e: '#173f8f' },
  { id: 'amethyst', c: '#b07cf2', e: '#5a2a96' }, { id: 'topaz', c: '#f6c344', e: '#946b0b' }, { id: 'diamond', c: '#e8f6ff', e: '#5b7d96' },
];
const CUTS = ['rhombus', 'brilliant', 'crystal', 'cushion'];
const GEM_SPLIT = splitIds('g14_flat_gem', GEMS.map((g) => g.id), 2);
const OUTFITS = ['#f0883e', '#2f6fd0', '#c0392b', '#2e8b57', '#8e44ad', '#e3b21b'];

export async function mountFlatLook(env) {
  const st = env.style;
  const themes = themesOf(st.split);
  const lists = themes.map((t) => { const l = st.pool('tex', (a) => t.wall.includes(a.use) && t.wallRe.test(a.id)); return l.length ? l : [null, null]; });
  const pairs = roundRobinPairs(themes, lists);
  const [pi] = st.primaryCombo('flat_theme_x_wall', [pairs.length]);
  const [T, wtex0] = pairs[pi], wl = lists[themes.indexOf(T)];
  const wtex = wtex0 ? await firstIsotropic(wl, wl.indexOf(wtex0)) : null;
  st.note(`g14_flat_theme:${T.id}`); if (wtex) st.note(`tex:${wtex.id}`);
  const r = st.rand;
  const pl = st.pool('tex', (a) => T.path.includes(a.use) && T.pathRe.test(a.id) && a.id !== (wtex && wtex.id));
  const ptex = pl.length ? await firstIsotropic(pl, Math.floor(r() * pl.length)) : null;
  if (ptex) st.note(`tex:${ptex.id}`);
  const [wcan, pcan] = await Promise.all([
    wtex ? texCanvas(wtex.file, { size: 256, contrast: 0.9, sat: 0.6, flatTo: 128 }) : null,
    ptex ? texCanvas(ptex.file, { size: 256, contrast: T.pencil ? 0.15 : 0.35, sat: 0.4, flatTo: 128 }) : null,
  ]);
  const wallBase = mix(T.wallTint, wtex ? hexOfLin(wtex.mean_lin) : T.wallTint, 0.25);
  let pathBase = mix(T.pathTint, ptex ? hexOfLin(ptex.mean_lin) : T.pathTint, 0.2);
  while (relLum(pathBase) - relLum(wallBase) < 0.38) pathBase = mix(pathBase, '#ffffff', 0.25);
  const gemsIn = GEMS.filter((g) => GEM_SPLIT(g.id) === st.split), gems = gemsIn.filter((g) => g.id !== 'diamond' || relLum(pathBase) < 0.35);
  const gem = (gems.length ? gems : gemsIn)[Math.floor(r() * (gems.length || gemsIn.length))];
  st.note(`g14_flat_gem:${gem.id}`);
  const cut = choose(st, 'g14_flat_cut', CUTS);
  return {
    theme: T.id, wcan, pcan, wallBase, pathBase, pencil: !!T.pencil, gem, cut, runner: T.runner,
    outfit: choose(st, 'g14_flat_outfit', OUTFITS),
    wScale: 0.35 + 0.35 * r(), pScale: 0.35 + 0.35 * r(), off: [r() * 256, r() * 256],
  };
}

function drawGemStyled(g, x, y, picked, L) {
  const G = L.gem, w = 9, h = 12;
  if (picked) { g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fillStyle = 'rgba(25,145,250,.28)'; g.fill(); g.strokeStyle = 'rgba(25,145,250,.9)'; g.lineWidth = 2; g.stroke(); }
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  g.beginPath();
  if (L.cut === 'brilliant') { for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + TAU / 16; g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); } }
  else if (L.cut === 'crystal') { g.moveTo(x, y - 13); g.lineTo(x + 6, y - 6); g.lineTo(x + 6, y + 7); g.lineTo(x, y + 12); g.lineTo(x - 6, y + 7); g.lineTo(x - 6, y - 6); }
  else if (L.cut === 'cushion') { g.moveTo(x - 6, y - 9); g.lineTo(x + 6, y - 9); g.quadraticCurveTo(x + 10, y - 9, x + 10, y - 5); g.lineTo(x + 10, y + 5); g.quadraticCurveTo(x + 10, y + 9, x + 6, y + 9); g.lineTo(x - 6, y + 9); g.quadraticCurveTo(x - 10, y + 9, x - 10, y + 5); g.lineTo(x - 10, y - 5); g.quadraticCurveTo(x - 10, y - 9, x - 6, y - 9); }
  else { g.moveTo(x, y - h); g.lineTo(x + w, y - 2); g.lineTo(x, y + h); g.lineTo(x - w, y - 2); }
  g.closePath(); g.fillStyle = G.c; g.fill(); g.restore();
  g.strokeStyle = G.e; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 1, y - 9); g.lineTo(x + 4, y - 4); g.lineTo(x - 1, y - 2); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
}

function drawRunnerStyled(g, x, y, L) {
  g.beginPath(); g.ellipse(x, y + 11, 9, 3.2, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
  const body = L.runner === 'astronaut' ? '#eef2f6' : L.runner === 'knight' ? '#9aa4ae' : L.outfit;
  g.beginPath(); g.moveTo(x - 7, y + 9); g.quadraticCurveTo(x - 8, y - 2, x, y - 3); g.quadraticCurveTo(x + 8, y - 2, x + 7, y + 9); g.closePath();
  g.fillStyle = body; g.fill(); g.strokeStyle = 'rgba(30,20,10,.75)'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(x, y - 8, 5.4, 0, TAU);
  g.fillStyle = L.runner === 'astronaut' ? '#cfe3f2' : L.runner === 'knight' ? '#b9c1c9' : '#ffd9b3'; g.fill(); g.strokeStyle = 'rgba(30,20,10,.75)'; g.lineWidth = 1.4; g.stroke();
  if (L.runner === 'explorer' || L.runner === 'farmer') { g.beginPath(); g.ellipse(x, y - 12, 8, 2.4, 0, 0, TAU); g.fillStyle = L.runner === 'farmer' ? '#e8c35a' : '#8a6a3c'; g.fill(); g.fillRect(x - 4, y - 16, 8, 4); }
  else if (L.runner === 'parka') { g.beginPath(); g.arc(x, y - 8, 6.6, Math.PI * 1.05, Math.PI * 1.95); g.strokeStyle = '#f4f4f4'; g.lineWidth = 2.4; g.stroke(); }
  else if (L.runner === 'knight') { g.fillStyle = '#5b6570'; g.fillRect(x - 4, y - 9, 8, 1.6); }
  else if (L.runner === 'kid') { g.beginPath(); g.arc(x, y - 10, 5.6, Math.PI, 0); g.fillStyle = L.outfit; g.fill(); }
}

export function drawFlatStyled(g, br, round, picked, L, G) {
  const GAP = 5, { CELL, OX, OY, COLS, ROWS } = G;
  g.fillStyle = L.wallBase; g.fillRect(0, 0, br.w, br.h);
  if (L.wcan) fillTex(g, L.wcan, { scale: L.wScale, ox: -L.off[0], oy: -L.off[1], op: 'overlay', alpha: 0.9 }, { x: 0, y: 0, w: br.w, h: br.h });
  const net = new Path2D();
  const rr = (x, y, w, h, r) => { net.moveTo(x + r, y); net.arcTo(x + w, y, x + w, y + h, r); net.arcTo(x + w, y + h, x, y + h, r); net.arcTo(x, y + h, x, y, r); net.arcTo(x, y, x + w, y, r); net.closePath(); };
  for (let i = 0; i < COLS * ROWS; i++) {
    if ((round.walls[i] & 15) === 15) continue;
    const c = i % COLS, r = Math.floor(i / COLS), x = OX + c * CELL, y = OY + r * CELL;
    rr(x + GAP, y + GAP, CELL - 2 * GAP, CELL - 2 * GAP, 3);
    if (!(round.walls[i] & 2) && c < COLS - 1) net.rect(x + CELL - GAP - 1, y + GAP, 2 * GAP + 2, CELL - 2 * GAP);
    if (!(round.walls[i] & 4) && r < ROWS - 1) net.rect(x + GAP, y + CELL - GAP - 1, CELL - 2 * GAP, 2 * GAP + 2);
  }
  g.save(); g.translate(1.8, 2.2); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill(net, 'nonzero'); g.restore();
  if (L.pencil) { g.strokeStyle = 'rgba(40,40,40,.75)'; g.lineWidth = 2.6; g.lineJoin = 'round'; g.stroke(net); }
  g.fillStyle = L.pathBase; g.fill(net, 'nonzero');
  if (L.pcan) { g.save(); g.clip(net, 'nonzero'); fillTex(g, L.pcan, { scale: L.pScale, ox: -L.off[1], oy: -L.off[0], op: 'overlay', alpha: 0.55 }, { x: 0, y: 0, w: br.w, h: br.h }); g.restore(); }
  round.gems.forEach((gm, i) => { const p = G.center(gm.cell); drawGemStyled(g, p.x, p.y, picked === i, L); });
  const rp = G.center(round.avatar);
  drawRunnerStyled(g, rp.x, rp.y, L);
}
export { shade, texMeanHex };
