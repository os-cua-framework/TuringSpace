import { splitIds } from '../core/style.js';
import { swatch, pat, innerShade, withShadow, mixHex, relLum, ISO_TEX, boxOf, splitPool, pickSplit, splitColours } from './_board_mat.js';

const MATERIALS = [
  { id: 'wood', uses: ['wood'], real: true, Ls: [0.32, 0.5, 0.68] },
  { id: 'felt', uses: ['fabric'], tints: ['#b0413e', '#2f6f8f', '#d1a23a', '#4f8a4a', '#7a4f9a'], amp: 0.35 },
  { id: 'card_paper', uses: ['wall', 'floor'], tints: ['#e07a3f', '#3f9e8f', '#7b6cc4', '#d4b13a', '#c2557a'], amp: 0.06, iso: true },
  { id: 'painted_metal', uses: ['metal'], tints: ['#b94a3b', '#3d6fa8', '#d9a53a', '#4b8b6a'], amp: 0.22 },
  { id: 'stone', uses: ['stone', 'floor'], real: true, Ls: [0.38, 0.55, 0.72], sat: 0.5 },
  { id: 'cork_leather', uses: ['flat2d', 'fabric', 'terrain'], tints: ['#8a5a3a', '#c9a173', '#5a3f2e', '#a8794f'], amp: 0.3 },
];
const DESKS = [
  { id: 'oak_desk', uses: ['wood'], L: 0.55 },
  { id: 'concrete', uses: ['floor', 'wall'], L: 0.68 },
  { id: 'linen', uses: ['fabric'], tint: '#e3ddd0', amp: 0.18 },
  { id: 'slate', uses: ['stone', 'roof'], L: 0.4 },
  { id: 'paper', uses: ['wall'], tint: '#f3efe6', amp: 0.06 },
];
const TRAYS = [
  { id: 'felt', uses: ['fabric'], tint: '#3f5a4c', amp: 0.25 },
  { id: 'cardboard', uses: ['floor', 'terrain'], tint: '#b8936a', amp: 0.15 },
  { id: 'wood', uses: ['wood'], L: 0.4 },
  { id: 'none', none: true },
];
const MAT_SPLIT = splitIds('g19_sil_mat', MATERIALS.map((m) => m.id), 1);
const DESK_SPLIT = splitIds('g19_sil_desk', DESKS.map((d) => d.id), 1);

export async function buildSilLook(style, m) {
  const combos = [];
  for (const tr of splitPool(style, 'g19_sil_tray', TRAYS)) for (const d of DESKS) for (const mt of MATERIALS) {
    if (MAT_SPLIT(mt.id) !== style.split || DESK_SPLIT(d.id) !== style.split) continue;
    combos.push([mt, d, tr]);
  }
  const [ci] = style.primaryCombo('g19_sil_look', [combos.length]);
  const [mat, desk, tray] = combos[ci];
  style.note(`sil_mat:${mat.id}`); style.note(`sil_desk:${desk.id}`); style.note(`sil_tray:${tray.id}`);
  const r = style.rand;
  const look = { mat, desk, tray, r: Array.from({ length: 8 }, () => r()) };
  const pick = (uses, iso) => (iso ? style.pick('tex', (t) => uses.includes(t.use) && ISO_TEX.has(t.id)) : null) || style.pick('tex', (t) => uses.includes(t.use));
  const dt = pick(desk.uses, desk.id !== 'oak_desk');
  look.deskTex = dt ? await swatch(dt.file, desk.tint ? { size: 256, mode: 'tint', tint: desk.tint, amp: desk.amp, hp: 10 } : { size: 256, mode: 'real', L: desk.L, k: 0.7, sat: 0.7 }) : null;
  if (!tray.none) {
    const tt = pick(tray.uses, !!tray.tint);
    const deskS = desk.tint ? Math.pow(relLum(desk.tint), 1 / 2.2) : desk.L;
    look.trayTex = tt ? await swatch(tt.file, { size: 256, mode: 'real', L: deskS * (0.82 + r() * 0.1), k: 0.6, sat: 0.3 }) : null;
  }
  look.pieceTex = []; look.pieceBase = [];
  if (mat.real) {
    const texs = [pick(mat.uses, false), pick(mat.uses, false), pick(mat.uses, false)];
    const Ls = mat.Ls.slice(); for (let i = Ls.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [Ls[i], Ls[j]] = [Ls[j], Ls[i]]; }
    for (let i = 0; i < m.pieces.length; i++) {
      look.pieceTex.push(texs[i] ? await swatch(texs[i].file, { size: 128, mode: 'real', L: Ls[i], k: 0.9, sat: mat.sat ?? 0.95 }) : null);
      look.pieceBase.push(mixHex('#000000', '#ffffff', Ls[i]));
    }
  } else {
    const t = pick(mat.uses, !!mat.iso);
    const tints = splitColours(style, `g19_sil_tint_${mat.id}`, mat.tints, m.pieces.length);
    for (let i = 0; i < m.pieces.length; i++) {
      look.pieceTex.push(t ? await swatch(t.file, { size: 128, mode: 'tint', tint: tints[i], amp: mat.amp, hp: 8 }) : null);
      look.pieceBase.push(tints[i]);
    }
  }
  look.silGrey = pickSplit(style, 'g19_sil_grey', ['#c6cdd7', '#bfc4cb', '#c9cbcf', '#c2c8d0']);
  return look;
}

function polyPath(verts) { const p = new Path2D(); verts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; }

export function drawSilBoard(g, br, m, st, look, h) {
  const T = h.TRAY;
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
  g.fillStyle = look.deskTex ? pat(g, look.deskTex, { s: 0.6, x: look.r[0] * 256, y: look.r[1] * 256 }) : '#eef2f6';
  g.fillRect(0, 0, br.w, br.h);
  if (look.trayTex) {
    const tp = new Path2D(); if (tp.roundRect) tp.roundRect(8, T.y0 - 6, br.w - 16, T.y1 - T.y0 + 12, 10); else tp.rect(8, T.y0 - 6, br.w - 16, T.y1 - T.y0 + 12);
    withShadow(g, () => { g.fillStyle = '#777'; g.fill(tp); }, { dx: 0, dy: 2, blur: 6, a: 0.2 });
    g.fillStyle = pat(g, look.trayTex, { s: 0.6, x: look.r[2] * 256, y: look.r[3] * 256 }); g.fill(tp);
    innerShade(g, tp, { w: 3, hi: 0.15, lo: 0.25, blur: 4, box: [8, T.y0 - 6, br.w - 8, T.y1 + 6] });
  }
  const sil = polyPath(m.outline);
  g.fillStyle = look.silGrey; g.fill(sil);
  g.strokeStyle = '#5a626d'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke(sil);
  for (const i of st.z) {
    const vv = h.dispVerts(m.pieces[i], st.pieces[i]), p = polyPath(vv);
    withShadow(g, () => { g.fillStyle = look.pieceBase[i] || '#888'; g.fill(p); }, { dx: 1.5, dy: 2.5, blur: 4, a: 0.35 });
    g.fillStyle = look.pieceTex[i] ? pat(g, look.pieceTex[i], { s: 0.5, x: i * 41, y: i * 67 }) : (look.pieceBase[i] || '#888'); g.fill(p);
    innerShade(g, p, { w: 2, hi: 0.35, lo: 0.35, blur: 2, box: boxOf(vv) });
    g.strokeStyle = '#2b3038'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(p);
  }
  g.strokeStyle = 'rgba(66,74,84,.9)'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(sil);
  for (const i of st.z) h.knob(st.pieces[i].x, st.pieces[i].y);
  g.restore();
}
