import { ACCENT } from '../core/panel.js';
import { splitPool, roundRobinPairs, texCanvas, fillTex, rrPath, shade, mix, texMeanHex, vignette, choose } from './_grid_look_kit.js';

const TAU = Math.PI * 2;
const THEMES = [
  { id: 'optical_bench', floor: ['metal'], floorRe: /plate|factory/, floorK: 0.35, tint: '#c9d0d6', frame: '#2f363d', marks: 'holes', mirror: 'silver', emitter: 'module', beam: '#ff3b30', desk: ['wood', 'floor'] },
  { id: 'wood_game', floor: ['wood'], floorRe: /./, floorK: 0.5, tint: null, frame: '#5b3a1e', frameTex: 'wood', marks: 'grooves', mirror: 'glass_wood', emitter: 'flashlight', beam: '#ffd54a', desk: ['fabric', 'wood'] },
  { id: 'blueprint', floor: ['floor', 'wall'], floorRe: /concrete|plaster/, floorK: 0.18, tint: '#1f4e79', frame: '#e8f1fb', marks: 'dashes', mirror: 'ink_light', emitter: 'symbol', beam: '#ffd166', desk: ['wood', 'wall'] },
  { id: 'paper', floor: ['flat2d', 'fabric', 'wall'], floorRe: /plaster|white|linen|jersey|leather_white|beige/, floorK: 0.2, tint: '#f7f4ea', frame: '#2b2b2b', marks: 'graph', mirror: 'ink', emitter: 'pointer', beam: '#e53935', desk: ['wood'] },
  { id: 'scifi', floor: ['metal'], floorRe: /plate|grate|factory|shutter/, floorK: 0.3, tint: '#27313d', frame: '#46e0ff', marks: 'glow', mirror: 'crystal', emitter: 'module', beam: '#3dff8a', desk: ['metal', 'floor'] },
  { id: 'stone_slab', floor: ['stone', 'floor'], floorRe: /slab|tile|marble|monastery|rock_tile|sandstone|plaster/, floorK: 0.3, tint: null, frame: '#6f675b', marks: 'carved', mirror: 'bronze', emitter: 'pointer', beam: '#ff5252', desk: ['terrain', 'stone'] },
  { id: 'felt_table', floor: ['fabric'], floorRe: /velour|velvet|terry|jersey|linen|satin/, floorK: 0.4, tint: '#2f6b45', frame: '#6b4425', frameTex: 'wood', marks: 'dots', mirror: 'silver', emitter: 'pointer', beam: '#ff3b30', desk: ['wood', 'floor'] },
  { id: 'concrete_lab', floor: ['floor'], floorRe: /concrete|cement|garage|hangar|plaster/, floorK: 0.5, tint: null, frame: '#e0b21a', marks: 'paint', mirror: 'steel', emitter: 'module', beam: '#ff2d55', desk: ['floor', 'metal'] },
  { id: 'cardboard', floor: ['flat2d', 'fabric'], floorRe: /leather|hessian|denim|linen|book|concrete_floor/, floorK: 0.25, tint: '#c9a173', frame: '#9c7444', marks: 'pencil', mirror: 'foil', emitter: 'flashlight', beam: '#ffe066', desk: ['wood', 'floor'] },
  { id: 'marble_lab', floor: ['stone', 'floor', 'wall'], floorRe: /marble|white|plaster|terrazzo/, floorK: 0.35, tint: null, frame: '#d9d6cf', marks: 'carved', mirror: 'steel', emitter: 'pointer', beam: '#ff3b30', desk: ['wood', 'floor'] },
  { id: 'sand_tray', floor: ['terrain'], floorRe: /sand|gravelly|coast/, floorK: 0.4, tint: null, frame: '#7a5534', frameTex: 'wood', marks: 'dots', mirror: 'bronze', emitter: 'flashlight', beam: '#ffd54a', desk: ['wood', 'terrain'] },
  { id: 'leather_desk', floor: ['flat2d', 'fabric'], floorRe: /leather/, floorK: 0.35, tint: null, frame: '#3a2a1e', marks: 'pencil', mirror: 'silver', emitter: 'pointer', beam: '#e53935', desk: ['wood'] },
];
const themesOf = splitPool('g14_laser_theme', THEMES, 4);

export async function mountLaserLook(env) {
  const st = env.style;
  const themes = themesOf(st.split);
  const lists = themes.map((t) => { const l = st.pool('tex', (a) => t.floor.includes(a.use) && t.floorRe.test(a.id)); return l.length ? l : [null, null]; });
  const pairs = roundRobinPairs(themes, lists);
  const [pi] = st.primaryCombo('laser_theme_x_tex', [pairs.length]);
  const [theme, tex] = pairs[pi];
  st.note(`g14_laser_theme:${theme.id}`); if (tex) st.note(`tex:${tex.id}`);
  const r = st.rand;
  const floor = tex ? await texCanvas(tex.file, { size: 256, contrast: theme.floorK, sat: theme.tint ? 0.3 : 0.8 }) : null;
  const desk = st.pick('tex', (a) => theme.desk.includes(a.use) && !/brick|gingham|check/.test(a.id));
  const deskTex = desk ? await texCanvas(desk.file, { size: 256, contrast: 0.6, sat: 0.7, gain: 0.95 }) : null;
  const frameWood = theme.frameTex ? st.pick('tex', (a) => a.use === 'wood') : null;
  const frameTex = frameWood ? await texCanvas(frameWood.file, { size: 256, contrast: 0.8 }) : null;
  for (const t of [desk, frameWood]) if (t) st.note(`tex:${t.id}`);
  const floorBase = theme.tint || (tex ? texMeanHex(tex) : '#d9d4c8');
  return {
    theme: theme.id, marks: r() < 0.5 ? theme.marks : choose(st, 'g14_laser_marks', ['holes', 'carved', 'dots', 'grooves']), mirror: theme.mirror, emitter: theme.emitter, beam: theme.beam, frame: theme.frame,
    floor, floorBase, floorTinted: !!theme.tint, deskTex, deskMean: desk ? texMeanHex(desk) : '#cfd5da', frameTex,
    texScale: 0.4 + 0.4 * r(), texOff: [r() * 256, r() * 256], frameW: 5 + Math.round(4 * r()), deskScale: 0.5 + 0.4 * r(),
    bodyC: choose(st, 'g14_laser_body', ['#39434d', '#22262b', '#5a2f2f', '#2d4a3a', '#3b3f8f']),
  };
}

function drawChamber(g, G, L) {
  const { box: B, S, cols, rows } = G, fw = L.frameW;
  g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
  rrPath(g, B.x - fw, B.y - fw, B.w + 2 * fw, B.h + 2 * fw, Math.min(10, fw + 3));
  g.fillStyle = L.theme === 'blueprint' || L.theme === 'paper' ? shade(L.floorBase, 0.92) : L.frame; g.fill(); g.restore();
  if (L.frameTex) { rrPath(g, B.x - fw, B.y - fw, B.w + 2 * fw, B.h + 2 * fw, Math.min(10, fw + 3)); fillTex(g, L.frameTex, { scale: 0.5, alpha: 0.85, op: 'multiply' }); }
  g.fillStyle = L.floorBase; g.fillRect(B.x, B.y, B.w, B.h);
  if (L.floor) fillTex(g, L.floor, { scale: L.texScale, ox: B.x - L.texOff[0], oy: B.y - L.texOff[1], ...(L.floorTinted ? { alpha: 0.55, op: L.theme === 'scifi' || L.theme === 'blueprint' ? 'soft-light' : 'multiply' } : {}) }, { x: B.x, y: B.y, w: B.w, h: B.h });
  g.strokeStyle = L.theme === 'scifi' ? 'rgba(70,224,255,.9)' : L.theme === 'blueprint' ? 'rgba(232,241,251,.9)' : L.theme === 'paper' ? '#2b2b2b' : 'rgba(0,0,0,.45)';
  g.lineWidth = L.theme === 'paper' ? 2 : 1.5; g.strokeRect(B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1);
  const cx = (c) => B.x + c * S + S / 2, cy = (r) => B.y + r * S + S / 2;
  g.save();
  switch (L.marks) {
    case 'holes':
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { g.beginPath(); g.arc(cx(c), cy(r), 2.4, 0, TAU); g.fillStyle = 'rgba(20,24,28,.55)'; g.fill(); }
      break;
    case 'grooves': case 'carved': case 'paint': case 'pencil': case 'graph': case 'glow': case 'dashes': {
      const col = { grooves: 'rgba(60,35,15,.35)', carved: 'rgba(30,25,20,.35)', paint: 'rgba(250,250,250,.55)', pencil: 'rgba(60,45,30,.3)', graph: 'rgba(60,120,200,.3)', glow: 'rgba(70,224,255,.22)', dashes: 'rgba(232,241,251,.3)' }[L.marks];
      g.strokeStyle = col; g.lineWidth = L.marks === 'carved' || L.marks === 'grooves' ? 1.6 : 1;
      if (L.marks === 'dashes') g.setLineDash([4, 4]);
      for (let c = 1; c < cols; c++) { g.beginPath(); g.moveTo(B.x + c * S, B.y); g.lineTo(B.x + c * S, B.y + B.h); g.stroke(); }
      for (let r = 1; r < rows; r++) { g.beginPath(); g.moveTo(B.x, B.y + r * S); g.lineTo(B.x + B.w, B.y + r * S); g.stroke(); }
      g.setLineDash([]);
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { g.beginPath(); g.arc(cx(c), cy(r), 1.6, 0, TAU); g.fillStyle = col; g.fill(); }
      break;
    }
    default:
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { g.beginPath(); g.arc(cx(c), cy(r), 2, 0, TAU); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); }
  }
  g.restore();
}

function drawMirror(g, x, y, kind, S, L) {
  const h = S * 0.36, Lh = h * Math.SQRT2, t = Math.max(4, S * 0.14);
  g.save(); g.translate(x, y);
  if (L.mirror === 'silver' || L.mirror === 'steel') { g.beginPath(); g.arc(0, 0, S * 0.19, 0, TAU); g.fillStyle = L.mirror === 'steel' ? '#9aa3ab' : '#d4dbe1'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.stroke(); }
  g.rotate(kind === '\\' ? Math.PI / 4 : -Math.PI / 4);
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
  const plate = (c0, c1, c2, edge, r = 2) => {
    const gr = g.createLinearGradient(0, -t / 2, 0, t / 2);
    gr.addColorStop(0, c0); gr.addColorStop(0.5, c1); gr.addColorStop(1, c0);
    rrPath(g, -Lh, -t / 2, 2 * Lh, t, r); g.fillStyle = gr; g.fill();
    g.shadowColor = 'transparent'; if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.stroke(); }
    if (c2) { g.beginPath(); g.moveTo(-Lh + 2, 0); g.lineTo(Lh - 2, 0); g.strokeStyle = c2; g.lineWidth = 1; g.stroke(); }
  };
  switch (L.mirror) {
    case 'glass_wood': plate('#7a5230', '#7a5230', null, '#3e2814', 2); g.fillStyle = 'rgba(205,232,245,.95)'; g.fillRect(-Lh + 3, -t / 2 + 1.6, 2 * Lh - 6, t - 3.2); break;
    case 'ink': plate('#1d1d1d', '#1d1d1d', null, null, 1); break;
    case 'ink_light': plate('#f2f7fc', '#f2f7fc', null, null, 1); break;
    case 'crystal': plate('rgba(120,240,255,.55)', 'rgba(220,255,255,.95)', null, 'rgba(160,250,255,1)', 2); break;
    case 'bronze': plate('#8c5a24', '#e3b26a', '#f6d79a', '#5a3610', 2); break;
    case 'foil': plate('#9ea6ad', '#f4f6f8', null, 'rgba(60,60,60,.5)', 1); break;
    case 'steel': plate('#7d8791', '#e6eaee', null, '#4b545c', 2); break;
    default: plate('#7f909f', '#f4f8fb', null, '#5d6e7c', 2);
  }
  g.restore();
}

function drawEmitter(g, G, em, L) {
  const { box: B, S } = G;
  let px, py, ang;
  if (em.side === 'L') { px = B.x; py = B.y + em.idx * S + S / 2; ang = 0; }
  else if (em.side === 'R') { px = B.x + B.w; py = B.y + em.idx * S + S / 2; ang = Math.PI; }
  else if (em.side === 'T') { px = B.x + em.idx * S + S / 2; py = B.y; ang = Math.PI / 2; }
  else { px = B.x + em.idx * S + S / 2; py = B.y + B.h; ang = -Math.PI / 2; }
  g.save(); g.translate(px, py); g.rotate(ang); g.scale(1.15, 1.15);
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
  const body = L.bodyC;
  const halo = () => { g.save(); g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.4; g.stroke(); g.restore(); };
  switch (L.emitter) {
    case 'pointer':
      rrPath(g, -22, -4, 21, 8, 4); g.fillStyle = body; g.fill(); halo();
      g.shadowColor = 'transparent'; g.fillStyle = '#c9ced3'; g.fillRect(-4, -3.5, 3, 7); g.fillRect(-18, -5, 8, 1.6);
      break;
    case 'flashlight':
      rrPath(g, -22, -4.5, 12, 9, 3); g.fillStyle = body; g.fill(); halo();
      g.beginPath(); g.moveTo(-11, -4.5); g.lineTo(-2, -8); g.lineTo(-2, 8); g.lineTo(-11, 4.5); g.closePath(); g.fillStyle = shade(body, 1.3); g.fill(); halo();
      g.shadowColor = 'transparent'; g.fillStyle = '#fff6c8'; g.fillRect(-3, -7, 2, 14);
      break;
    case 'symbol':
      g.shadowColor = 'transparent'; g.strokeStyle = '#e8f1fb'; g.lineWidth = 1.6; g.strokeRect(-22, -8, 18, 16);
      g.beginPath(); g.moveTo(-19, -4); g.lineTo(-7, 0); g.lineTo(-19, 4); g.stroke();
      break;
    default:
      rrPath(g, -21, -9, 19, 18, 4); g.fillStyle = body; g.fill(); halo();
      g.shadowColor = 'transparent'; g.fillStyle = shade(body, 1.4); g.fillRect(-19, -6, 3, 12);
  }
  g.restore();
  const dx = Math.cos(ang), dy = Math.sin(ang), len = S * 0.45;
  g.beginPath(); g.arc(px - dx * 2, py - dy * 2, 3.2, 0, TAU); g.fillStyle = L.beam; g.fill();
  g.strokeStyle = L.beam; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * len, py + dy * len); g.stroke();
  const tx = px + dx * (len + 2), ty = py + dy * (len + 2), nx = -dy, ny = dx;
  g.fillStyle = L.beam; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - dx * 7 + nx * 4, ty - dy * 7 + ny * 4); g.lineTo(tx - dx * 7 - nx * 4, ty - dy * 7 - ny * 4); g.closePath(); g.fill();
}

export function drawLaserStyled(g, br, G, mirrors, em, pick, L) {
  g.fillStyle = L.deskMean; g.fillRect(0, 0, br.w, br.h);
  if (L.deskTex) fillTex(g, L.deskTex, { scale: L.deskScale }, { x: 0, y: 0, w: br.w, h: br.h });
  vignette(g, 0, 0, br.w, br.h, 0.25);
  drawChamber(g, G, L);
  for (const q of mirrors) drawMirror(g, G.box.x + q.c * G.S + G.S / 2, G.box.y + q.r * G.S + G.S / 2, q.kind, G.S, L);
  drawEmitter(g, G, em, L);
  if (pick) {
    g.beginPath(); g.arc(pick.x, pick.y, 9, 0, TAU); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke();
    g.beginPath(); g.arc(pick.x, pick.y, 9, 0, TAU); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(pick.x, pick.y, 2.5, 0, TAU); g.fillStyle = ACCENT; g.fill();
  }
}
export { mix };
