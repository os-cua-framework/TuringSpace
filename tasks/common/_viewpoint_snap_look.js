import { splitIds } from '../core/style.js';
import { texCanvas, texPattern, mixHex, shadeHex, rgba, balancedPrimary } from './_board_look_common.js';

export const VP_ENVS = [
  { id: 'garden', sky: true, mat: (t) => t.use === 'terrain' && /grass|moss|forest|leaves|path/.test(t.id), mats: ['wood', 'painted', 'copper'] },
  { id: 'beach', sky: true, mat: (t) => t.use === 'terrain' && /sand|coast|pebbles/.test(t.id), mats: ['wood', 'steel', 'painted'] },
  { id: 'snow', sky: true, mat: (t) => t.use === 'terrain' && /snow|rock/.test(t.id), mats: ['carbon', 'painted', 'copper'] },
  { id: 'workshop', sky: false, top: ['#efe6d8', '#d9cbb5'], mat: (t) => t.use === 'wood', mats: ['steel', 'brass', 'carbon'] },
  { id: 'gallery', sky: false, top: ['#f4f4f2', '#dcdcd8'], mat: (t) => t.use === 'floor' && /concrete|plaster|cement|terrazzo|tile/.test(t.id), mats: ['glass', 'brass', 'painted', 'wood'] },
  { id: 'night', sky: false, top: ['#1d2333', '#2c3448'], mat: (t) => t.use === 'floor' || t.use === 'metal', mats: ['neon'] },
  { id: 'studio', sky: false, top: ['#eef1f4', '#d5dbe2'], mat: (t) => t.use === 'fabric' || t.use === 'flat2d', mats: ['wood', 'copper', 'carbon', 'glass'] },
];
const SPLIT = splitIds('g16_vp_env', VP_ENVS.map((e) => e.id), 1);
const NO = new Set(['fabric_pattern_05', 'fabric_pattern_07', 'gingham_check', 'curly_teddy_checkered', 'quatrefoil_jacquard_fabric', 'book_pattern', 'herringbone_parquet']);
const MAT_COL = {
  wood: ['#d9822b', '#c8a165', '#8a5530', '#e0b070'], copper: ['#b87333'], brass: ['#c9a240'], steel: ['#8d99a6', '#a9b3bd'],
  carbon: ['#3a3d42'], glass: ['#7fd3e0'], painted: ['#d64545', '#2f7fd0', '#3a9a5a', '#e0a020', '#8e44ad'], neon: ['#ff4fd8', '#4fffe0', '#ffe14f', '#7dff4f', '#ff8a3b'],
};

export function chooseVpLook(style) {
  const envs = VP_ENVS.filter((e) => SPLIT(e.id) === style.split);
  const lists = envs.map((e) => style.pool('tex', (t) => e.mat(t) && !NO.has(t.id)));
  const [env, mat] = balancedPrimary(style, 'g16_vp_env_x_mat', envs.map((e, k) => [e, lists[k]]));
  const r = style.rand;
  const kind = env.mats[Math.floor(r() * env.mats.length)], cols = MAT_COL[kind], col = cols[Math.floor(r() * cols.length)];
  const hdri = env.sky ? style.pick('hdri', (h) => h.use === 'outdoor-midday' || h.use === 'morning-afternoon' || h.use === 'overcast') : null;
  style.note(`g16_vp_env:${env.id}`); style.note(`tex:${mat.id}`); style.note(`vp_sticks:${kind}/${col}`);
  return { env, mat, kind, col, hdri, u: Array.from({ length: 6 }, () => r()) };
}

export async function buildVpLook(look) {
  const matCv = await texCanvas(look.mat.file, { px: 128, mode: 'photo', tone: look.env.id === 'night' ? 0.18 : look.env.id === 'snow' ? 0.78 : 0.55 + 0.1 * look.u[0], sat: 0.75 });
  let sky = null;
  if (look.hdri) { const { loadImage } = await import('../core/assets.js'); sky = await loadImage('assets/' + look.hdri.sky); }
  return { ...look, matCv, sky };
}

function rod(g, pa, pb, w, colour, kind, glow) {
  g.lineCap = 'round';
  if (kind === 'neon') {
    g.strokeStyle = rgba(glow, 0.28); g.lineWidth = w + 6; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    g.strokeStyle = colour; g.lineWidth = w; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, w * 0.3); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    return;
  }
  const edge = kind === 'glass' ? 'rgba(30,80,100,.45)' : kind === 'carbon' ? 'rgba(0,0,0,.7)' : 'rgba(40,28,16,.55)';
  g.strokeStyle = edge; g.lineWidth = w + 1.6; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
  g.strokeStyle = kind === 'glass' ? rgba(colour, 0.75) : colour; g.lineWidth = w; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
  const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1, ox = (dy / L) * w * 0.22, oy = (-dx / L) * w * 0.22, s = oy < 0 ? 1 : -1;
  const hl = kind === 'wood' ? 'rgba(255,236,205,.55)' : kind === 'carbon' ? 'rgba(200,210,220,.35)' : 'rgba(255,255,255,.7)';
  g.strokeStyle = hl; g.lineWidth = Math.max(1, w * (kind === 'steel' || kind === 'glass' ? 0.36 : 0.28));
  g.beginPath(); g.moveTo(pa.x + s * ox, pa.y + s * oy); g.lineTo(pb.x + s * ox, pb.y + s * oy); g.stroke();
}

export function drawVpBoard(g, br, rd, cam, L, K) {
  const { BOARD, CAM, shade3 } = K;
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
  if (L.sky) {
    const iw = L.sky.width, ih = L.sky.height, pan = Math.atan2(cam.f.x, cam.f.z) / (2 * Math.PI) + 1 + L.u[1];
    const sx = ((pan % 1) + 1) % 1 * iw;
    const w1 = Math.min(iw * 0.4, iw - sx);
    g.save(); g.filter = 'blur(3px)';
    g.drawImage(L.sky, sx, 0, w1, ih * 0.45, -6, -6, (BOARD.w + 12) * (w1 / (iw * 0.4)), BOARD.h + 12);
    if (w1 < iw * 0.4) g.drawImage(L.sky, 0, 0, iw * 0.4 - w1, ih * 0.45, -6 + (BOARD.w + 12) * (w1 / (iw * 0.4)), -6, (BOARD.w + 12) * (1 - w1 / (iw * 0.4)), BOARD.h + 12);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, 0, BOARD.w, BOARD.h);
  } else {
    const gr = g.createLinearGradient(0, 0, 0, BOARD.h); gr.addColorStop(0, L.env.top[0]); gr.addColorStop(1, L.env.top[1]);
    g.fillStyle = gr; g.fillRect(0, 0, BOARD.w, BOARD.h);
  }
  const S = 150, fy = rd.floorY, ends = rd.bars.flatMap((b) => [b.a, b.b]);
  const ox = ends.reduce((t, p) => t + p.x, 0) / ends.length, oz = ends.reduce((t, p) => t + p.z, 0) / ends.length;
  const corners = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([x, z]) => cam.project({ x: ox + x, y: fy, z: oz + z }));
  g.save();
  g.beginPath(); corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  g.clip();
  const [p0, p1, , p3] = corners, px = L.matCv.width, rep = 2.5;
  const pat = g.createPattern(L.matCv, 'repeat');
  pat.setTransform(new DOMMatrix([(p1.x - p0.x) / (px * rep), (p1.y - p0.y) / (px * rep), (p3.x - p0.x) / (px * rep), (p3.y - p0.y) / (px * rep), p0.x, p0.y]));
  g.fillStyle = pat; g.fillRect(0, 0, BOARD.w, BOARD.h);
  g.restore();
  g.beginPath(); corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  g.strokeStyle = L.env.id === 'night' ? 'rgba(160,180,220,.35)' : 'rgba(40,40,40,.25)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = L.env.id === 'night' ? 'rgba(160,180,220,.22)' : 'rgba(30,30,30,.18)'; g.lineWidth = 1;
  for (let t = -S; t <= S; t += 37.5) {
    for (const [a, b] of [[{ x: ox + t, y: fy, z: oz - S }, { x: ox + t, y: fy, z: oz + S }], [{ x: ox - S, y: fy, z: oz + t }, { x: ox + S, y: fy, z: oz + t }]]) {
      const pa = cam.project(a), pb = cam.project(b); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    }
  }
  const drawn = rd.bars.map((bar) => { const pa = cam.project(bar.a), pb = cam.project(bar.b); return { pa, pb, depth: (pa.depth + pb.depth) / 2 }; })
    .sort((a, b) => b.depth - a.depth);
  for (const d of drawn) {
    const w = Math.max(3.4, Math.min(8, CAM.fov / d.depth * 5.4));
    const f = Math.max(0.62, Math.min(1.06, 1.06 - (d.depth - 345) / 300));
    rod(g, d.pa, d.pb, w, shade3(L.col, L.kind === 'neon' ? Math.max(0.85, f) : f), L.kind, L.col);
  }
  g.restore();
}
void mixHex; void shadeHex; void texPattern;
