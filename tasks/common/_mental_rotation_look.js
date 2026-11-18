import { splitIds } from '../core/style.js';
import { swatch, pat, withShadow, shadeHex, relLum, ISO_TEX, splitPool, pickSplit } from './_board_mat.js';

const MATERIALS = [
  { id: 'wood_block', uses: ['wood'], real: true, L: [0.34, 0.6], groove: 'rgba(40,24,10,.55)', bevel: true },
  { id: 'plastic_block', tint: [['#2f6db3', '#8d99ab'], ['#c0392b', '#9aa3ad'], ['#2e8b57', '#a3aab3']], uses: ['floor', 'wall'], amp: 0.05, groove: 'rgba(255,255,255,.55)', bevel: true },
  { id: 'stone_tile', uses: ['stone', 'floor'], real: true, L: [0.36, 0.62], sat: 0.4, groove: 'rgba(30,30,30,.5)', bevel: true },
  { id: 'metal_plate', tint: [['#b0773f', '#9aa2ab'], ['#c9a24e', '#8f979f']], uses: ['metal'], amp: 0.28, groove: 'rgba(20,20,20,.55)', bevel: true, rivet: true },
  { id: 'felt', tint: [['#7a3b52', '#8c8f96'], ['#2f5d7a', '#9a9488'], ['#5d6b2f', '#8f8a9a']], uses: ['fabric'], amp: 0.35, groove: 'rgba(255,255,255,.35)' },
  { id: 'paper_cut', tint: [['#3f6fb5', '#7d8ba3'], ['#d06a3a', '#9a8f86'], ['#6a4fa3', '#8f97a4']], uses: ['wall', 'floor'], amp: 0.06, groove: 'rgba(255,255,255,.6)', shadow: true },
  { id: 'terracotta', tint: [['#9c4f2c', '#c79a72']], uses: ['terrain', 'floor'], amp: 0.2, groove: 'rgba(60,25,10,.45)', bevel: true },
  { id: 'enamel_tile', tint: [['#1f7a8c', '#9aa5ad'], ['#b8336a', '#a3a7ad'], ['#c99a14', '#9ea4aa']], uses: ['wall', 'floor'], amp: 0.04, groove: 'rgba(255,255,255,.6)', bevel: true },
  { id: 'lacquer', tint: [['#8e2c2c', '#a59a8f'], ['#2c4a8e', '#a2a6ae']], uses: ['wood'], amp: 0.12, groove: 'rgba(0,0,0,.4)', bevel: true },
];
const CARDS = [
  { id: 'white_card', fill: '#ffffff', edge: '#dde3ea', uses: ['wall'], amp: 0.03 },
  { id: 'sticky_note', fill: '#fbf1a9', edge: '#e2d27a', uses: ['wall', 'floor'], amp: 0.05, shadow: true },
  { id: 'kraft_tag', fill: '#d8bd92', edge: '#b39467', uses: ['floor', 'terrain'], amp: 0.08, shadow: true },
  { id: 'index_card', fill: '#f7f8fb', edge: '#c8d3e0', uses: ['wall'], amp: 0.03, rule: true },
  { id: 'canvas', fill: '#ece6da', edge: '#c7bca8', uses: ['fabric'], amp: 0.14, shadow: true },
  { id: 'blue_card', fill: '#d3e3f2', edge: '#a9c0d8', uses: ['wall', 'floor'], amp: 0.05, shadow: true },
  { id: 'pink_paper', fill: '#f5dbe0', edge: '#d9b3bb', uses: ['wall'], amp: 0.04 },
  { id: 'mint_card', fill: '#d6efe3', edge: '#a9cfbd', uses: ['wall', 'floor'], amp: 0.05, shadow: true },
  { id: 'grey_board', fill: '#dcdcd8', edge: '#b4b4ae', uses: ['floor'], amp: 0.1, shadow: true },
  { id: 'manila', fill: '#ecd593', edge: '#c9b06a', uses: ['wall', 'floor'], amp: 0.06, shadow: true },
  { id: 'sage_card', fill: '#c4d6bb', edge: '#9fb594', uses: ['wall'], amp: 0.05 },
  { id: 'rose_card', fill: '#e8b9b0', edge: '#c9958b', uses: ['wall', 'floor'], amp: 0.05, shadow: true },
  { id: 'slate_blue', fill: '#aebdd0', edge: '#8a9bb2', uses: ['floor'], amp: 0.06 },
  { id: 'kraft_dark', fill: '#c49a6c', edge: '#9e774c', uses: ['floor', 'terrain'], amp: 0.1, shadow: true },
];
const SURFACES = [
  { id: 'cork', tint: '#b98b5b', uses: ['terrain', 'floor'], amp: 0.3 },
  { id: 'desk', uses: ['wood'], L: 0.45 },
  { id: 'felt_mat', tint: '#3e5a4a', uses: ['fabric'], amp: 0.2 },
  { id: 'concrete', uses: ['floor', 'wall'], L: 0.62 },
  { id: 'linen', tint: '#d9d2c4', uses: ['fabric'], amp: 0.2 },
];
const MAT_SPLIT = splitIds('g19_rot_mat', MATERIALS.map((m) => m.id), 4);
const CARD_SPLIT = splitIds('g19_rot_card', CARDS.map((c) => c.id), 5);

export async function buildRotLook(style) {
  const combos = [];
  for (const sf of splitPool(style, 'g19_rot_surface', SURFACES, 3)) for (const c of CARDS) for (const mt of MATERIALS) {
    if (MAT_SPLIT(mt.id) !== style.split || CARD_SPLIT(c.id) !== style.split) continue;
    combos.push([mt, c, sf]);
  }
  const [ci] = style.primaryCombo('g19_rot_look', [combos.length]);
  const [mat, card, surface] = combos[ci];
  style.note(`rot_mat:${mat.id}`); style.note(`rot_card:${card.id}`); style.note(`rot_surface:${surface.id}`);
  const r = style.rand;
  const look = { mat, card, surface, r: Array.from({ length: 8 }, () => r()) };
  const pick = (uses, iso) => (iso ? style.pick('tex', (t) => uses.includes(t.use) && ISO_TEX.has(t.id)) : null) || style.pick('tex', (t) => uses.includes(t.use));
  const mt = pick(mat.uses, !mat.real);
  if (mat.real) {
    look.matRef = mt ? await swatch(mt.file, { size: 128, mode: 'real', L: mat.L[0], k: 0.8, sat: mat.sat ?? 0.9 }) : null;
    look.matOpt = mt ? await swatch(mt.file, { size: 128, mode: 'real', L: mat.L[1], k: 0.8, sat: mat.sat ?? 0.9 }) : null;
    look.baseRef = '#6b4a2f'; look.baseOpt = '#a88a68';
  } else {
    const [a, b] = mat.tint.length > 1 ? pickSplit(style, `g19_rot_pair_${mat.id}`, mat.tint.map((pr) => Object.assign(pr.slice(), { id: pr.join('/') }))) : mat.tint[0];
    look.baseRef = a; look.baseOpt = b;
    look.matRef = mt ? await swatch(mt.file, { size: 128, mode: 'tint', tint: a, amp: mat.amp, hp: 8 }) : null;
    look.matOpt = mt ? await swatch(mt.file, { size: 128, mode: 'tint', tint: b, amp: mat.amp, hp: 8 }) : null;
  }
  const ct = pick(card.uses, true);
  look.cardTex = ct ? await swatch(ct.file, { size: 128, mode: 'tint', tint: card.fill, amp: card.amp, hp: 8 }) : null;
  const st = pick(surface.uses, !!surface.tint);
  const cardS = Math.pow(relLum(card.fill), 1 / 2.2);
  look.surfTex = st ? await swatch(st.file, { size: 256, mode: 'real', L: cardS * (0.74 + r() * 0.12), k: 0.6, sat: 0.3 }) : null;
  look.texScale = 0.45 + r() * 0.25;
  return look;
}

function rrP(x, y, w, h, r) { const p = new Path2D(); if (p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h); return p; }

function drawShape(g, cells, rot, cx, cy, u, look, isRef, h) {
  const n = h.norm(cells);
  const w = Math.max(...n.map((c) => c[0])) + 1, hh = Math.max(...n.map((c) => c[1])) + 1;
  const P = (x, y) => h.rotPt({ x: (x - w / 2) * u, y: (y - hh / 2) * u }, rot);
  const corners = n.flatMap(([x, y]) => [P(x, y), P(x + 1, y), P(x, y + 1), P(x + 1, y + 1)]);
  const ox = cx - (Math.min(...corners.map((p) => p.x)) + Math.max(...corners.map((p) => p.x))) / 2;
  const oy = cy - (Math.min(...corners.map((p) => p.y)) + Math.max(...corners.map((p) => p.y))) / 2;
  const ptsOf = (x, y) => [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)].map((q) => ({ x: ox + q.x, y: oy + q.y }));
  const quad = (pts) => { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; };
  const qpts = n.map(([x, y]) => ptsOf(x, y));
  const quads = qpts.map(quad);
  const tex = isRef ? look.matRef : look.matOpt, base = isRef ? look.baseRef : look.baseOpt;
  const fill = tex ? pat(g, tex, { s: look.texScale, x: look.r[0] * 128, y: look.r[1] * 128 }) : base;
  if (look.mat.shadow) withShadow(g, () => { g.fillStyle = base; for (const q of quads) g.fill(q); }, { dx: 1.5, dy: 2, blur: 3, a: 0.35 });
  g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 0.8; g.lineJoin = 'round';
  for (const q of quads) { g.fill(q); g.stroke(q); }
  if (look.mat.bevel) {
    const bw = Math.max(1.2, u * 0.12);
    qpts.forEach((pts, qi) => {
      g.save(); g.clip(quads[qi]); g.lineWidth = bw * 2; g.lineCap = 'square';
      const cx = (pts[0].x + pts[2].x) / 2, cy = (pts[0].y + pts[2].y) / 2;
      for (let e = 0; e < 4; e++) {
        const a = pts[e], b = pts[(e + 1) % 4], mx = (a.x + b.x) / 2 - cx, my = (a.y + b.y) / 2 - cy, L = Math.hypot(mx, my) || 1;
        const lit = (-mx - my) / (L * Math.SQRT2);
        g.strokeStyle = lit > 0 ? `rgba(255,255,255,${0.42 * lit})` : `rgba(0,0,0,${0.36 * -lit})`;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.restore();
    });
  }
  const has = new Set(n.map((c) => c.join(',')));
  g.strokeStyle = look.mat.groove; g.lineWidth = 1; g.lineCap = 'butt'; g.beginPath();
  for (const [x, y] of n) {
    if (has.has(`${x + 1},${y}`)) { const a = P(x + 1, y), b = P(x + 1, y + 1); g.moveTo(ox + a.x, oy + a.y); g.lineTo(ox + b.x, oy + b.y); }
    if (has.has(`${x},${y + 1}`)) { const a = P(x, y + 1), b = P(x + 1, y + 1); g.moveTo(ox + a.x, oy + a.y); g.lineTo(ox + b.x, oy + b.y); }
  }
  g.stroke();
  if (look.mat.rivet) {
    g.fillStyle = 'rgba(30,30,30,.45)';
    for (const [x, y] of n) { const c = P(x + 0.5, y + 0.5); g.beginPath(); g.arc(ox + c.x, oy + c.y, Math.max(1, u * 0.09), 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = shadeHex(base, 0.55); g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath();
  for (const [x, y] of n) {
    const edges = [[[x, y], [x + 1, y], [x, y - 1]], [[x + 1, y], [x + 1, y + 1], [x + 1, y]], [[x, y + 1], [x + 1, y + 1], [x, y + 1]], [[x, y], [x, y + 1], [x - 1, y]]];
    for (const [a, b, nb] of edges) {
      if (has.has(nb.join(','))) continue;
      const pa = P(...a), pb = P(...b); g.moveTo(ox + pa.x, oy + pa.y); g.lineTo(ox + pb.x, oy + pb.y);
    }
  }
  g.stroke();
}

function drawCard(g, x, y, w, hgt, look, sel, ACCENT) {
  const p = rrP(x, y, w, hgt, 7);
  if (look.card.shadow) withShadow(g, () => { g.fillStyle = look.card.fill; g.fill(p); }, { dx: 1, dy: 2, blur: 4, a: 0.3 });
  else withShadow(g, () => { g.fillStyle = look.card.fill; g.fill(p); }, { dx: 0, dy: 1, blur: 2, a: 0.18 });
  g.fillStyle = look.cardTex ? pat(g, look.cardTex, { s: 0.6 }) : look.card.fill; g.fill(p);
  if (look.card.rule) { g.save(); g.clip(p); g.strokeStyle = 'rgba(220,80,80,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x + w, y + 9); g.stroke(); g.restore(); }
  g.strokeStyle = sel ? ACCENT : look.card.edge; g.lineWidth = sel ? 3 : 1; g.stroke(p); g.lineWidth = 1;
}

export function drawRotBoard(g, br, m, state, look, h) {
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
  g.fillStyle = look.surfTex ? pat(g, look.surfTex, { s: 0.6, x: look.r[2] * 256, y: look.r[3] * 256 }) : '#8a7a66';
  g.fillRect(0, 0, br.w, br.h);
  drawCard(g, br.w / 2 - 58, 8, 116, 108, look, false, h.ACCENT);
  drawShape(g, m.ref.cells, m.ref.rot, br.w / 2, 62, 17, look, true, h);
  const cw = h.cellRect(0).w - 2 * h.CARD_PAD;
  const cu = Math.max(11.5, Math.min(h.CARD_U_MAX, ...m.cells.map((c) => cw / h.spanAt(c.cells, c.rot))));
  m.cells.forEach((c, i) => {
    const rc = h.cellRect(i), sel = state.sel[i];
    drawCard(g, rc.x, rc.y, rc.w, rc.h, look, sel, h.ACCENT);
    drawShape(g, c.cells, c.rot, rc.x + rc.w / 2, rc.y + rc.h / 2, cu, look, false, h);
    if (sel) {
      g.beginPath(); g.arc(rc.x + rc.w - 12, rc.y + 12, 8, 0, Math.PI * 2); g.fillStyle = h.ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(rc.x + rc.w - 16, rc.y + 12); g.lineTo(rc.x + rc.w - 13, rc.y + 15); g.lineTo(rc.x + rc.w - 8, rc.y + 9); g.stroke(); g.lineWidth = 1;
    }
  });
  g.restore();
}
