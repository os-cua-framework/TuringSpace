import { splitPool, roundRobinPairs, detailMap, tintDetail, shade, mix, hexOfLin, contrast, relLum, jitterHex, rgb2hsl, hexRGB, choose, firstIsotropic } from './_grid_look_kit.js';
import { splitIds } from '../core/style.js';

const TAU = Math.PI * 2;
const PACKS = [
  { id: 'meadow', top: ['terrain'], topRe: /grass|forest_ground|aerial_grass/, topC: '#9fcf7e', side: ['terrain'], sideRe: /mud|soil|ground/, sideC: '#b58e62', stair: 'stone', bridge: 'wood', sky: ['#eef5fa', '#dfe9ef'] },
  { id: 'desert', top: ['terrain'], topRe: /sand|gravelly/, topC: '#e8cf9a', side: ['wall', 'stone'], sideRe: /sandstone|seaworn/, sideC: '#c08a55', stair: 'stone', bridge: 'wood', sky: ['#fbf1de', '#f0dfc0'] },
  { id: 'snowfield', top: ['terrain'], topRe: /snow/, topC: '#eef3f8', side: ['terrain', 'stone'], sideRe: /rock|cliff/, sideC: '#7e8fa3', stair: 'stone', bridge: 'wood', sky: ['#e8eef5', '#d3dde8'] },
  { id: 'volcanic', top: ['terrain', 'floor'], topRe: /gray_rocks|gravel|asphalt|rocks_ground/, topC: '#a59e95', side: ['terrain', 'stone'], sideRe: /rock|cliff/, sideC: '#4a4440', stair: 'metal', bridge: 'metal', sky: ['#f2e6dc', '#dcc9bb'] },
  { id: 'moon', top: ['floor', 'terrain'], topRe: /concrete|plaster|cement|rock_05|rock_08/, topC: '#cfcfd2', side: ['stone', 'terrain'], sideRe: /rock/, sideC: '#7a7b80', stair: 'metal', bridge: 'metal', sky: ['#20232b', '#3a3f4b'] },
  { id: 'autumn', top: ['terrain'], topRe: /leaves/, topC: '#d9a46a', side: ['terrain'], sideRe: /mud|soil|ground/, sideC: '#8f6a48', stair: 'wood', bridge: 'wood', sky: ['#fbf3e6', '#efdcc4'] },
  { id: 'moss_stone', top: ['terrain', 'stone'], topRe: /moss|lichen|grassy/, topC: '#a9c08a', side: ['stone', 'wall'], sideRe: /stone|block|castle|medieval/, sideC: '#8d8a80', stair: 'stone', bridge: 'wood', sky: ['#eef2ec', '#d9e2d6'] },
  { id: 'beach', top: ['terrain'], topRe: /sand|coast/, topC: '#efe0bb', side: ['terrain', 'stone'], sideRe: /rock|seaside|boulder/, sideC: '#8f8478', stair: 'wood', bridge: 'wood', sky: ['#e4f2fb', '#cfe6f3'] },
  { id: 'plaza', top: ['floor', 'stone'], topRe: /paving|pavement|cobble|gravel_concrete|granular/, topC: '#d5cfc4', side: ['wall'], sideRe: /brick/, sideC: '#a35e46', stair: 'stone', bridge: 'metal', sky: ['#f1f4f7', '#dde4ea'] },
  { id: 'canyon', top: ['terrain'], topRe: /laterite|dry|mud_dry|red/, topC: '#d79a6a', side: ['terrain', 'stone'], sideRe: /rock|cliff/, sideC: '#a2563a', stair: 'stone', bridge: 'wood', sky: ['#fbefe2', '#f0d9c2'] },
];
const packsOf = splitPool('g14_iso_pack', PACKS, 3);
const GEMS = [{ id: 'emerald', c: ['#2fc7a4', '#0b6e57'] }, { id: 'ruby', c: ['#f0506e', '#8f1330'] }, { id: 'sapphire', c: ['#4f8df7', '#173f8f'] },
  { id: 'amethyst', c: ['#b07cf2', '#5a2a96'] }, { id: 'topaz', c: ['#f6c344', '#946b0b'] }, { id: 'aquamarine', c: ['#4dd0e1', '#00646f'] }];
const GEM_SPLIT = splitIds('g14_iso_gem', GEMS.map((g) => g.id), 2);
const OUTFITS = ['#f07f2e', '#2f6fd0', '#c0392b', '#2e8b57', '#8e44ad', '#e3b21b'];
const BUILD = { stone: '#ece2cc', wood: '#c28b52', metal: '#aab3bc' };

export async function mountIsoLook(env) {
  const st = env.style;
  const packs = packsOf(st.split);
  const lists = packs.map((p) => { const l = st.pool('tex', (a) => p.top.includes(a.use) && p.topRe.test(a.id)); return l.length ? l : [null, null]; });
  const pairs = roundRobinPairs(packs, lists);
  const [pi] = st.primaryCombo('iso_pack_x_top', [pairs.length]);
  const [P, ttex0] = pairs[pi], tl = lists[packs.indexOf(P)];
  const ttex = ttex0 ? await firstIsotropic(tl, tl.indexOf(ttex0)) : null;
  st.note(`g14_iso_pack:${P.id}`); if (ttex) st.note(`tex:${ttex.id}`);
  const r = st.rand;
  const stex = st.pick('tex', (a) => P.side.includes(a.use) && P.sideRe.test(a.id));
  if (stex) st.note(`tex:${stex.id}`);
  const top = jitterHex(ttex ? mix(P.topC, hexOfLin(ttex.mean_lin), 0.25) : P.topC, r, 5, 0.08, 0.02);
  let side = jitterHex(stex ? mix(P.sideC, hexOfLin(stex.mean_lin), 0.3) : P.sideC, r, 5, 0.08, 0.02);
  while (relLum(shade(side, 0.92)) > relLum(top) / 1.5) side = shade(side, 0.88);
  const [tdet, sdet] = await Promise.all([ttex ? detailMap(ttex.file) : null, stex ? detailMap(stex.file) : null]);
  const amp = 0.1 + 0.05 * r();
  let rimF = 0.42, rim;
  for (;;) { rim = mix(top, shade(top, rimF), 0.6); if (contrast(rim, top) >= 1.9 || rimF < 0.1) break; rimF -= 0.04; }
  const th = rgb2hsl(hexRGB(top))[0];
  const gemsIn = GEMS.filter((g) => GEM_SPLIT(g.id) === st.split);
  const gems = gemsIn.filter((g) => { const h = rgb2hsl(hexRGB(g.c[0]))[0], d = Math.abs(h - th) % 360; return Math.min(d, 360 - d) > 45; });
  const gemE = (gems.length ? gems : gemsIn)[Math.floor(r() * (gems.length ? gems.length : gemsIn.length))];
  st.note(`g14_iso_gem:${gemE.id}`);
  const gem = gemE.c;
  const build = { stair: BUILD[P.stair], bridge: BUILD[P.bridge] };
  return {
    pack: P.id, sky: P.sky.map((c) => jitterHex(c, r, 6, 0.1, 0.015)), top, side, rim, gem,
    canv: { top: tintDetail(tdet, top, amp), shadow: tintDetail(tdet, shade(top, 0.78), amp), left: tintDetail(sdet, shade(side, 0.92), 0.16), right: tintDetail(sdet, shade(side, 0.72), 0.16) },
    build, outfit: choose(st, 'g14_iso_outfit', OUTFITS), hat: r() < 0.5,
    texScale: 1.4 + 0.8 * r(), off: { x: r() * 4, y: r() * 4 }, dark: P.id === 'moon',
  };
}

function pats(g, L) {
  if (!L._pats || L._patsCtx !== g) {
    L._pats = {}; L._patsCtx = g;
    for (const k of Object.keys(L.canv)) L._pats[k] = g.createPattern(L.canv[k], 'repeat');
  }
  return L._pats;
}
function topPat(g, L, V, z, which = 'top') {
  const p = pats(g, L)[which], S = L.canv.top.width / L.texScale, o = L.off;
  p.setTransform(new DOMMatrix([V.DX / S, V.DY / S, -V.DX / S, V.DY / S, V.ox + (o.x - o.y) * V.DX, V.oy + (o.x + o.y) * V.DY - z * V.DZ]));
  return p;
}
function sidePat(g, L, V, which, at) {
  const p = pats(g, L)[which], S = L.canv.left.width / 1.2;
  if (which === 'right') p.setTransform(new DOMMatrix([-V.DX / S, V.DY / S, 0, V.DZ / S, V.ox + at * V.DX, V.oy + at * V.DY]));
  else p.setTransform(new DOMMatrix([V.DX / S, V.DY / S, 0, V.DZ / S, V.ox - at * V.DX, V.oy + at * V.DY]));
  return p;
}

function gemStyled(g, x, y, picked, L) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.ellipse(0, 0, 6.5, 2.6, 0, 0, TAU); g.fillStyle = 'rgba(15,20,30,.28)'; g.fill();
  const cy = -12, w = 7.5, h = 9.5, [c, e] = L.gem;
  if (picked) { g.beginPath(); g.arc(0, cy, 14, 0, TAU); g.strokeStyle = '#1991fa'; g.lineWidth = 3; g.stroke(); }
  g.beginPath(); g.moveTo(0, cy - h); g.lineTo(w, cy - 2); g.lineTo(0, cy + h); g.lineTo(-w, cy - 2); g.closePath();
  g.fillStyle = c; g.fill(); g.strokeStyle = e; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.moveTo(0, cy - h); g.lineTo(w, cy - 2); g.lineTo(0, cy - 2); g.closePath(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
  g.beginPath(); g.moveTo(0, cy - h); g.lineTo(-w, cy - 2); g.lineTo(0, cy - 2); g.closePath(); g.fillStyle = 'rgba(0,0,0,.2)'; g.fill();
  g.restore();
}
function runnerStyled(g, x, y, L) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.ellipse(0, 0, 7.5, 3, 0, 0, TAU); g.fillStyle = 'rgba(15,20,30,.30)'; g.fill();
  g.strokeStyle = '#4a5563'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-2.4, -1); g.lineTo(-2.6, -8); g.moveTo(2.4, -1); g.lineTo(2.6, -8); g.stroke();
  g.beginPath(); g.moveTo(-6, -7); g.quadraticCurveTo(-6.8, -17, 0, -18.5); g.quadraticCurveTo(6.8, -17, 6, -7); g.closePath();
  g.fillStyle = L.outfit; g.fill(); g.strokeStyle = shade(L.outfit, 0.45); g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.arc(0, -23.5, 5.2, 0, TAU); g.fillStyle = '#ffd9b3'; g.fill(); g.strokeStyle = shade(L.outfit, 0.45); g.lineWidth = 1.3; g.stroke();
  if (L.hat) { g.beginPath(); g.ellipse(0, -27.5, 6.5, 2, 0, 0, TAU); g.fillStyle = shade(L.outfit, 0.7); g.fill(); g.fillRect(-3.5, -31.5, 7, 4); }
  g.restore();
}

export function drawIsoStyled(g, br, r, ord, shadowsFor, pickedGem, L, K) {
  const { VIEW: V, polyPath, drawBoxFaces, fillShadows, ck } = K;
  const sky = g.createLinearGradient(0, 0, 0, br.h);
  sky.addColorStop(0, L.sky[0]); sky.addColorStop(1, L.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, br.w, br.h);
  const B = L.build;
  const COL = {
    step: { top: B.stair, left: shade(B.stair, 0.82), right: shade(B.stair, 0.64), edge: null, topEdge: shade(B.stair, 0.9) },
    deck: { top: B.bridge, left: shade(B.bridge, 0.8), right: shade(B.bridge, 0.62), edge: null },
    rail: { top: shade(B.bridge, 0.85), left: shade(B.bridge, 0.7), right: shade(B.bridge, 0.55), edge: null },
  };
  const lipC = shade(L.top, 0.8), cellLine = mix(L.top, '#000000', 0.55);
  for (const it of ord) {
    if (it.role === 'runner') { const p = V.p((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0); runnerStyled(g, p.x, p.y, L); continue; }
    if (it.role === 'gem') { const p = V.p((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0); gemStyled(g, p.x, p.y, it.gem === pickedGem, L); continue; }
    if (it.role !== 'ground') { drawBoxFaces(g, V, it, COL[it.role]); continue; }
    const c = { top: topPat(g, L, V, it.z1), left: sidePat(g, L, V, 'left', it.y1), right: sidePat(g, L, V, 'right', it.x1), edge: null };
    const top = drawBoxFaces(g, V, it, c);
    const lip = (a, b, cc, d) => { polyPath(g, [a, b, cc, d]); g.fillStyle = lipC; g.fill(); };
    const z1 = it.z1, z2 = it.z1 - 0.1;
    lip(V.p(it.x1, it.y0, z1), V.p(it.x1, it.y1, z1), V.p(it.x1, it.y1, z2), V.p(it.x1, it.y0, z2));
    lip(V.p(it.x0, it.y1, z1), V.p(it.x1, it.y1, z1), V.p(it.x1, it.y1, z2), V.p(it.x0, it.y1, z2));
    fillShadows(g, V, top, shadowsFor(it) || [], it.z1, 0, topPat(g, L, V, it.z1, 'shadow'), 0.9);
    polyPath(g, top); g.strokeStyle = `rgba(${hexRGB(cellLine).join(',')},.16)`; g.lineWidth = 1; g.stroke();
    const i = it.x0, j = it.y0, h = r.H[ck(i, j)];
    g.strokeStyle = L.rim; g.lineWidth = 1.6;
    if (i > 0 && r.H[ck(i - 1, j)] < h) { const a = V.p(i, j, it.z1), b = V.p(i, j + 1, it.z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    if (j > 0 && r.H[ck(i, j - 1)] < h) { const a = V.p(i, j, it.z1), b = V.p(i + 1, j, it.z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  }
}
