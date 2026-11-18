import { splitIds } from '../core/style.js';
import { texCanvas, texPattern, mixHex, shadeHex, prng, hashS, balancedPrimary } from './_board_look_common.js';

export const PLAN_THEMES = [
  { id: 'apartment', floors: (t) => t.use === 'wood' || (t.use === 'floor' && /tile|pattern|square/.test(t.id)), ground: (t) => t.use === 'floor' && /pavement|paving|concrete|asphalt/.test(t.id), wall: '#2f3540' },
  { id: 'cottage', floors: (t) => t.use === 'wood' || t.use === 'fabric', ground: (t) => t.use === 'terrain' && /grass|moss|forest|leaves|path/.test(t.id), wall: '#3b2c22' },
  { id: 'office', floors: (t) => t.use === 'fabric' || (t.use === 'floor' && /concrete|plaster|cement/.test(t.id)), ground: (t) => t.use === 'floor' && /concrete|asphalt/.test(t.id), wall: '#1f2a44' },
  { id: 'villa', floors: (t) => t.use === 'stone' || (t.use === 'floor' && /tile|stone|marble|terrazzo/.test(t.id)) || t.use === 'wood', ground: (t) => t.use === 'terrain' && /gravel|sand|pebbles|rock/.test(t.id), wall: '#2a2a2a' },
  { id: 'loft', floors: (t) => (t.use === 'floor' && /concrete|cement|garage|hangar/.test(t.id)) || t.use === 'wood', ground: (t) => t.use === 'floor' || t.use === 'stone', wall: '#3a3f47' },
  { id: 'school', floors: (t) => t.use === 'floor' && /tile|pattern|square|terrazzo|painted/.test(t.id), ground: (t) => t.use === 'floor' && /asphalt|concrete|pavement/.test(t.id), wall: '#2d3a4a' },
  { id: 'barn', floors: (t) => t.use === 'wood' || (t.use === 'terrain' && /dirt|mud|straw|hay/.test(t.id)), ground: (t) => t.use === 'terrain' && /grass|mud|dirt|ground/.test(t.id), wall: '#3a2a20' },
  { id: 'beachhouse', floors: (t) => t.use === 'wood' || t.use === 'fabric', ground: (t) => t.use === 'terrain' && /sand|beach|coast|dune/.test(t.id), wall: '#27445a' },
  { id: 'chalet', floors: (t) => t.use === 'wood' || t.use === 'fabric', ground: (t) => t.use === 'terrain' && /snow|ice|rock/.test(t.id), wall: '#2b211c' },
  { id: 'museum', floors: (t) => t.use === 'stone' || (t.use === 'floor' && /tile|marble|terrazzo|stone/.test(t.id)), ground: (t) => (t.use === 'floor' || t.use === 'stone') && /cobble|paving|tile|slab/.test(t.id), wall: '#262626' },
  { id: 'clinic', floors: (t) => t.use === 'floor' || t.use === 'fabric', ground: (t) => t.use === 'terrain' && /grass|gravel|moss/.test(t.id), wall: '#30404a' },
];
const SPLIT = splitIds('g16_plan_theme', PLAN_THEMES.map((t) => t.id), 3);
const NO = new Set(['fabric_pattern_05', 'fabric_pattern_07', 'gingham_check', 'curly_teddy_checkered', 'quatrefoil_jacquard_fabric', 'book_pattern', 'denim_fabric_06', 'terry_cloth', 'velour_velvet']);
const BODIES = ['vacuum', 'pod', 'mower', 'ball', 'purifier'];
const BODY_SPLIT = splitIds('g16_plan_robot', BODIES, 1);

export function choosePlanLook(style, m) {
  const themes = PLAN_THEMES.filter((t) => SPLIT(t.id) === style.split);
  const lists = themes.map((th) => style.pool('tex', (t) => th.floors(t) && !NO.has(t.id)));
  const [theme, f0] = balancedPrimary(style, 'g16_plan_theme_x_floor', themes.map((th, k) => [th, lists[k]]));
  const r = style.rand;
  const extra = [style.pick('tex', (t) => theme.floors(t) && !NO.has(t.id) && t.id !== f0.id), style.pick('tex', (t) => theme.floors(t) && !NO.has(t.id) && t.id !== f0.id)].filter(Boolean);
  const floors = [f0, ...extra.slice(0, 1 + Math.floor(r() * 2))];
  const ground = style.pick('tex', (t) => theme.ground(t) && !NO.has(t.id));
  const bodies = BODIES.filter((b) => BODY_SPLIT(b) === style.split);
  const body = bodies[Math.floor(r() * bodies.length)];
  style.note(`g16_plan_theme:${theme.id}`); floors.forEach((f) => style.note(`tex:${f.id}`)); style.note(`g16_plan_robot:${body}`);
  const roomFloor = m.rooms.map(() => Math.floor(r() * floors.length));
  return { theme, floors, ground, body, roomFloor, u: Array.from({ length: 6 }, () => r()), wall: mixHex(theme.wall, '#000000', 0.15 * r()) };
}

export async function buildPlanLook(look) {
  const u = look.u;
  const floorCvs = await Promise.all(look.floors.map((f, k) => texCanvas(f.file, { px: 128, mode: 'photo', tone: 0.62 + 0.1 * ((u[k] + k * 0.37) % 1), sat: f.use === 'fabric' ? 0.35 : 0.6 })));
  const groundCv = look.ground ? await texCanvas(look.ground.file, { px: 128, mode: 'photo', tone: 0.55, sat: 0.8 }) : null;
  return { ...look, floorCvs, groundCv };
}

export function paintGround(g, br, m, L) {
  g.fillStyle = '#e3e6e2'; g.fillRect(0, 0, br.w, br.h);
  if (L.groundCv) { g.save(); g.globalAlpha = 0.9; g.fillStyle = texPattern(g, L.groundCv, { scale: 0.55, ox: L.u[4] * 80 }); g.fillRect(0, 0, br.w, br.h); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,.12)';
  for (const r of m.rooms) g.fillRect(r.x + 3, r.y + 3, r.w, r.h);
}
export function paintFloor(g, room, L) {
  const cv = L.floorCvs[L.roomFloor[room.id] % L.floorCvs.length];
  g.fillStyle = texPattern(g, cv, { scale: 0.42, ox: L.u[5] * 60, oy: (L.roomFloor[room.id] * 37) % 128 });
  g.fillRect(room.x, room.y, room.w, room.h);
}
export function drawRobot(g, x, y, R, L) {
  const TAU = Math.PI * 2;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  const body = { vacuum: '#2b2f36', pod: '#f4f6f8', mower: '#3f8f4a', ball: '#f7f7f2', purifier: '#e9e4da' }[L.body];
  g.beginPath(); g.arc(x, y, R, 0, TAU); g.fillStyle = body; g.fill();
  g.restore();
  g.lineWidth = 1.2;
  switch (L.body) {
    case 'vacuum': g.beginPath(); g.arc(x, y, R - 2, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke(); g.beginPath(); g.arc(x, y - 2.5, 2.2, 0, TAU); g.fillStyle = '#4fc3f7'; g.fill(); break;
    case 'pod': g.beginPath(); g.arc(x, y, R - 1.5, 0, TAU); g.strokeStyle = '#2f80ed'; g.lineWidth = 1.6; g.stroke(); g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fillStyle = '#2f80ed'; g.fill(); break;
    case 'mower': g.beginPath(); g.arc(x, y, R - 2.4, 0, TAU); g.strokeStyle = '#d7f0c0'; g.stroke(); g.fillStyle = '#1f3d22'; g.fillRect(x - 3, y - 1, 6, 2); break;
    case 'ball': { g.fillStyle = '#26282c'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * TAU) / 5, px = x + Math.cos(a) * 2.6, py = y + Math.sin(a) * 2.6; if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); g.fill(); g.beginPath(); g.arc(x, y, R, 0, TAU); g.strokeStyle = '#8a8d92'; g.stroke(); break; }
    default: g.beginPath(); g.arc(x, y, R - 3, 0, TAU); g.strokeStyle = '#9aa1a8'; g.setLineDash([1.5, 1.5]); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(x, y, R, 0, TAU); g.strokeStyle = '#7d8590'; g.stroke();
  }
}
void shadeHex; void prng; void hashS;
