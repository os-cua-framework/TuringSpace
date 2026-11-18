import { splitIds } from '../core/style.js';
import { framePhoto, regionStats, makeCanvas, PHOTO_SCALE } from './_photo_frame.js';

const SIDE_T = ['o', 'i', 'f'], SIDE_R = ['o', 'i', 'f'], SIDE_B = ['i', 'f'], SIDE_L = ['i', 'f'];
const KNOBS = ['arc', 'bulb', 'dove'];
const SILS = ['circle', 'squircle', 'hexagon', 'octagon', 'shield', 'star', 'heart'];
export const SHAPES = [];
for (const t of SIDE_T) for (const r of SIDE_R) for (const b of SIDE_B) for (const l of SIDE_L) {
  const sides = t + r + b + l;
  if (sides === 'offf') continue;
  if (sides === 'ffff') { SHAPES.push({ id: 'jig-ffff', kind: 'jig', sides }); continue; }
  for (const k of KNOBS) if (!(sides === 'ooff' && k === 'arc')) SHAPES.push({ id: `jig-${sides}-${k}`, kind: 'jig', sides, knob: k });
}
for (const s of SILS) SHAPES.push({ id: `sil-${s}`, kind: 'sil', name: s });
export const shapeById = (id) => SHAPES.find((x) => x.id === id) || (/^[oif]{4}$/.test(id) ? { id, kind: 'jig', sides: id, knob: 'arc' } : null);
const SIL_FAMILY = { circle: 'round', squircle: 'round', octagon: 'round', hexagon: 'round', star: 'pointy', heart: 'pointy', shield: 'pointy' };
export function clearlyDifferent(a, b) {
  if (a.kind !== b.kind) return true;
  if (a.kind === 'jig') return [...a.sides].filter((c, i) => c !== b.sides[i]).length >= 2;
  return SIL_FAMILY[a.name] !== SIL_FAMILY[b.name];
}
export const shapesIn = (split) => SHAPES.filter((x) => x.split === split);
const jigSplit = splitIds('jigsaw_shape', SHAPES.filter((s) => s.kind === 'jig').map((s) => s.id), 6);
const silSplit = splitIds('jigsaw_sil', SILS.map((n) => `sil-${n}`), 1);
for (const s of SHAPES) s.split = s.kind === 'jig' ? jigSplit(s.id) : silSplit(s.id);

function knob(g, P0, u, n, len, t, dir, form) {
  const m = len / 2;
  const at = (a, b) => [P0[0] + u[0] * a + n[0] * b * dir, P0[1] + u[1] * a + n[1] * b * dir];
  if (form === 'arc') {
    const [cx, cy] = at(m, 0), a0 = Math.atan2(-u[1], -u[0]);
    g.lineTo(...at(m - t, 0));
    const ccw = (u[0] * n[1] - u[1] * n[0]) * dir > 0;
    g.arc(cx, cy, t, a0, a0 + Math.PI, ccw);
    g.lineTo(...at(m + t, 0));
    return;
  }
  if (form === 'dove') {
    g.lineTo(...at(m - 0.55 * t, 0)); g.lineTo(...at(m - 1.05 * t, t));
    g.lineTo(...at(m + 1.05 * t, t)); g.lineTo(...at(m + 0.55 * t, 0));
    return;
  }
  const hr = 0.62 * t, hc = t - hr;
  g.lineTo(...at(m - 0.42 * t, 0));
  g.bezierCurveTo(...at(m - 0.42 * t, 0.25 * t), ...at(m - 1.0 * hr - 0.1 * t, hc - 0.2 * t), ...at(m - hr, hc));
  g.bezierCurveTo(...at(m - hr, hc + 0.75 * hr), ...at(m - 0.5 * hr, t), ...at(m, t));
  g.bezierCurveTo(...at(m + 0.5 * hr, t), ...at(m + hr, hc + 0.75 * hr), ...at(m + hr, hc));
  g.bezierCurveTo(...at(m + 1.0 * hr + 0.1 * t, hc - 0.2 * t), ...at(m + 0.42 * t, 0.25 * t), ...at(m + 0.42 * t, 0));
  g.lineTo(...at(m + 0.42 * t, 0));
}

export function shapePath(g, x, y, s, t, shape) {
  g.beginPath();
  if (shape.kind === 'jig') {
    const corners = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    g.moveTo(x, y);
    for (let e = 0; e < 4; e++) {
      const P0 = corners[e], P1 = corners[(e + 1) % 4];
      const u = [(P1[0] - P0[0]) / s, (P1[1] - P0[1]) / s];
      const c = shape.sides[e];
      if (c !== 'f') knob(g, P0, u, normals[e], s, t, c === 'o' ? 1 : -1, shape.knob);
      g.lineTo(...P1);
    }
    g.closePath();
    return;
  }
  const S = s + t, cx = x + S / 2, cy = y - t + S / 2, R = S / 2 - 1;
  const poly = (pts) => { pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); };
  const ngon = (k, r, rot) => Array.from({ length: k }, (_, i) => { const a = rot + (i / k) * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  switch (shape.name) {
    case 'circle': g.arc(cx, cy, R, 0, Math.PI * 2); g.closePath(); break;
    case 'squircle': {
      const r = S * 0.26, a = x + 1, b = y - t + 1, w = S - 2;
      g.moveTo(a + r, b); g.arcTo(a + w, b, a + w, b + w, r); g.arcTo(a + w, b + w, a, b + w, r);
      g.arcTo(a, b + w, a, b, r); g.arcTo(a, b, a + w, b, r); g.closePath(); break;
    }
    case 'hexagon': poly(ngon(6, R, 0)); break;
    case 'octagon': poly(ngon(8, R, Math.PI / 8)); break;
    case 'star': poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? R * 0.52 : R; return [cx + r * Math.cos(a), cy + r * Math.sin(a) + R * 0.08]; })); break;
    case 'shield': {
      const a = cx - R * 0.86, b = cy - R * 0.92, w = R * 1.72;
      g.moveTo(a, b); g.lineTo(a + w, b); g.lineTo(a + w, cy + R * 0.05);
      g.quadraticCurveTo(a + w, cy + R * 0.7, cx, cy + R); g.quadraticCurveTo(a, cy + R * 0.7, a, cy + R * 0.05); g.closePath(); break;
    }
    case 'heart': {
      const top = cy - R * 0.45;
      g.moveTo(cx, cy + R * 0.95);
      g.bezierCurveTo(cx - R * 1.25, cy + R * 0.05, cx - R * 0.95, top - R * 0.75, cx, top);
      g.bezierCurveTo(cx + R * 0.95, top - R * 0.75, cx + R * 1.25, cy + R * 0.05, cx, cy + R * 0.95);
      g.closePath(); break;
    }
    default: g.rect(x, y, s, s);
  }
}

export const HOLES = ['dark', 'fog', 'emboss', 'dashed', 'grey', 'frost', 'navy', 'amber', 'ink'];
const holeSplit = splitIds('jigsaw_hole', HOLES, 2);
const LIGHT_HOLES = new Set(['fog', 'frost', 'amber']);
const DARK_HOLES = new Set(['dark', 'emboss', 'dashed', 'grey', 'navy', 'ink']);
export const EDGES = ['white', 'dark', 'glow', 'double', 'shadow', 'gold'];
const edgeSplit = splitIds('jigsaw_edge', EDGES, 1);

function cutHole(g, photo, w, h, path, st) {
  g.save(); path(); g.clip();
  switch (st) {
    case 'dark': g.fillStyle = 'rgba(0,0,0,.52)'; g.fillRect(0, 0, w, h); break;
    case 'fog': g.fillStyle = 'rgba(255,255,255,.58)'; g.fillRect(0, 0, w, h); break;
    case 'navy': g.fillStyle = 'rgba(18,34,74,.55)'; g.fillRect(0, 0, w, h); break;
    case 'amber': g.fillStyle = 'rgba(255,196,64,.5)'; g.fillRect(0, 0, w, h); break;
    case 'ink': g.fillStyle = 'rgba(12,14,18,.72)'; g.fillRect(0, 0, w, h); break;
    case 'dashed': g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, w, h); break;
    case 'grey': g.filter = 'grayscale(1) brightness(0.55) contrast(0.9)'; g.drawImage(photo, 0, 0, w, h); g.filter = 'none'; break;
    case 'frost': g.filter = 'blur(2.5px) brightness(1.35) saturate(0.6)'; g.drawImage(photo, 0, 0, w, h); g.filter = 'none';
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, 0, w, h); break;
    case 'emboss': {
      g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(0, 0, w, h);
      g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 6; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
      g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 4; path(); g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
  g.save(); path();
  if (st === 'dashed') { g.setLineDash([5, 4]); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.6; }
  else if (st === 'fog' || st === 'frost' || st === 'amber') { g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 1.3; }
  else if (st === 'emboss') { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; }
  else { g.strokeStyle = 'rgba(255,255,255,.62)'; g.lineWidth = 1.5; }
  g.stroke(); g.restore();
}

export function strokePiece(g, path, edge) {
  g.save();
  switch (edge) {
    case 'dark': g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.strokeStyle = 'rgba(25,25,30,.85)'; g.lineWidth = 2; path(); g.stroke(); break;
    case 'glow': g.shadowColor = 'rgba(255,255,255,.95)'; g.shadowBlur = 9; g.strokeStyle = '#fff'; g.lineWidth = 2; path(); g.stroke();
      g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8; path(); g.stroke(); break;
    case 'double': g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5; g.strokeStyle = '#fff'; g.lineWidth = 3.2; path(); g.stroke();
      g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(20,20,20,.8)'; g.lineWidth = 1; path(); g.stroke(); break;
    case 'shadow': g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 10; g.shadowOffsetY = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.6; path(); g.stroke(); break;
    case 'gold': g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.strokeStyle = '#f2c94c'; g.lineWidth = 2.2; path(); g.stroke(); break;
    default: g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2; path(); g.stroke();
  }
  g.restore();
}

export async function buildJigsawLook(style, bw, bh, holes, s, t, pieceShape = null) {
  const rects = holes.map((h) => ({ x: h.x, y: h.y - t, w: s + t, h: s + t }));
  const photo = style.primary('photo');
  const score = (L) => {
    const st = rects.map((r) => regionStats(L, bw, bh, r));
    return Math.min(...st.map((q) => q.std)) - 0.15 * Math.abs(st[0].mean - 0.5);
  };
  const fr = await framePhoto(style, photo, bw, bh, { zoom: [1, 1.5], flip: true, tries: 10, score });
  const shape = pieceShape ? shapeById(pieceShape) : pickCode(style, SHAPES);
  const holeShape = (h, i) => (pieceShape && i > 0 && h.shape ? shapeById(h.shape) : shape);
  const mean = rects.map((r) => regionStats(fr.L, bw, bh, r).mean).reduce((a, b) => a + b, 0) / rects.length;
  const splitHoles = HOLES.filter((h) => holeSplit(h) === style.split);
  let holePool = splitHoles;
  if (mean < 0.3) holePool = splitHoles.filter((h) => LIGHT_HOLES.has(h));
  else if (mean > 0.78) holePool = splitHoles.filter((h) => DARK_HOLES.has(h));
  if (!holePool.length) holePool = splitHoles.filter((h) => h === 'dashed' || h === 'frost' || h === 'emboss');
  if (!holePool.length) holePool = splitHoles;
  const hole = holePool[Math.floor(style.rand() * holePool.length)];
  const edges = EDGES.filter((e) => edgeSplit(e) === style.split);
  const edge = edges[Math.floor(style.rand() * edges.length)];
  style.note(`jigsaw_shape:${shape.id}`); style.note(`jigsaw_hole:${hole}`); style.note(`jigsaw_edge:${edge}`);
  const S = PHOTO_SCALE;
  const board = makeCanvas(bw * S, bh * S), g = board.getContext('2d');
  g.drawImage(fr.canvas, 0, 0);
  g.scale(S, S);
  holes.map((h, i) => ({ h, sh: holeShape(h, i) })).sort((p, q) => p.h.x - q.h.x)
    .forEach(({ h, sh }) => cutHole(g, fr.canvas, bw, bh, () => shapePath(g, h.x, h.y, s, t, sh), hole));
  return { shape, hole, edge, photo: fr.canvas, board, s, t };
}

function pickCode(style, pool) {
  const items = pool.filter((x) => x.split === style.split);
  return items[Math.floor(style.rand() * items.length)];
}

export function drawJigsawLook(g, br, look, px, py, gap) {
  const { s, t, shape } = look;
  g.drawImage(look.board, 0, 0, br.w, br.h);
  const path = () => shapePath(g, px, py, s, t, shape);
  g.save(); path(); g.clip();
  g.drawImage(look.photo, px - gap.x, py - gap.y, br.w, br.h);
  g.restore();
  strokePiece(g, path, look.edge);
}
