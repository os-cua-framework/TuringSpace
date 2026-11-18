import { makeCam, hull, poly, drawBox } from './_f16_conveyor_fill_kit.js';
import { UI_FONT } from '../core/panel.js';
export const BOARD = { w: 720, h: 400 }, SCENE_H = 328;
export const T = 15, N = 16, STEP = 0.11, DWELL = 4, GAP = 5;
const CAMS = new WeakMap();
export function camOf(m) {
  let c = CAMS.get(m);
  if (!c) { c = makeCam({ ...m.cam, look: [0, 0.22, 0.3], f: 560, cx: BOARD.w / 2, cy: 160 }); CAMS.set(m, c); }
  return c;
}
export const rad = (c, h) => c.Rb + (c.Rm - c.Rb) * h / c.H;
export const volOf = (c, h) => Math.PI * c.H * (rad(c, h) ** 3 - c.Rb ** 3) / (3 * (c.Rm - c.Rb));
export function levelOf(c, v) { const r = Math.cbrt(c.Rb ** 3 + 3 * (c.Rm - c.Rb) * v / (Math.PI * c.H)); return Math.min(c.H, c.H * (r - c.Rb) / (c.Rm - c.Rb)); }
export const zoneCup = (m, t) => m.cups.findIndex((c) => t - c.w >= 0 && t - c.w <= DWELL - 1);
export const cupZ = (c, t) => (t - c.w - 1.5) * STEP;
export function newState(m) { return { t: 0, steps: 0, turn: 0, tap: false, vol: m.cups.map(() => 0), hist: m.cups.map(() => [0]), spill: 0, over: 0, last: null }; }
export function stepWorld(m, st, open) {
  st.turn++; st.t += m.dt; st.steps++; st.tap = open; st.last = open ? 'open' : 'close';
  if (open) {
    const j = zoneCup(m, st.turn);
    if (j < 0) st.spill++; else { st.vol[j] += m.Q; if (st.vol[j] > volOf(m.cups[j], m.cups[j].H) + 1e-12) { st.over++; st.vol[j] = volOf(m.cups[j], m.cups[j].H); } }
  }
  m.cups.forEach((c, j) => st.hist[j].push(levelOf(c, st.vol[j])));
}
export const level = (m, st, j) => levelOf(m.cups[j], st.vol[j]);
export const inBand = (c, h) => Math.abs(h - c.mark) <= c.tol + 1e-9;
export const judge = (m, st) => st.turn === T && st.spill === 0 && st.over === 0 && m.cups.every((c, j) => inBand(c, level(m, st, j)));
export function runPlan(m, openAt) { const st = newState(m); for (let i = 0; i < T; i++) stepWorld(m, st, openAt(i + 1, st)); return st; }
export function humanOpen(m) {
  return (t, st) => {
    const j = zoneCup(m, t); if (j < 0) return false;
    const c = m.cups[j], h = st.hist[j], L = h[h.length - 1];
    if (h.length === 1) return true;
    if (L >= c.mark - c.tol) return false;
    const r1 = h[h.length - 1] - h[h.length - 2], r0 = h.length > 2 ? h[h.length - 2] - h[h.length - 3] : null;
    const est = r1 * (r0 ? Math.max(0.6, Math.min(1, r1 / r0)) : 1);
    return L + est <= c.mark + c.tol;
  };
}
export function planOpen(m, kOf) { return (t) => m.cups.some((c, j) => t >= c.w && t < c.w + kOf(c, j)); }
export const cylK = (m) => (c) => Math.max(1, Math.min(DWELL, Math.round(c.mark / (m.Q / (Math.PI * c.Rb ** 2)))));
function ringPts(cam, cx, cz, h, r, n = 32, th0 = 0, span = Math.PI * 2) {
  const out = []; for (let k = 0; k <= n; k++) { const a = th0 + span * k / n; out.push(cam.proj([cx + r * Math.cos(a), h, cz + r * Math.sin(a)])); } return out;
}
function drawCup(g, cam, c, z, L, mark) {
  const P0 = ringPts(cam, 0, z, 0, c.Rb), P1 = ringPts(cam, 0, z, c.H, c.Rm);
  poly(g, hull([...P0, ...P1]), 'rgba(205,228,245,0.38)', '#6f8da6', 1.6);
  if (L > 1e-5) {
    const Pw = ringPts(cam, 0, z, L, rad(c, L));
    poly(g, hull([...P0, ...Pw]), 'rgba(40,128,220,0.78)', null);
    poly(g, Pw, 'rgba(130,195,250,0.95)', '#2f6fb5', 1);
  }
  poly(g, P1, 'rgba(255,255,255,0.12)', '#56748d', 1.8);
  const phi = Math.atan2(cam.pos[2] - z, cam.pos[0]), lo = Math.max(0, c.mark - c.tol), hi = Math.min(c.H, c.mark + c.tol);
  const A = ringPts(cam, 0, z, lo, rad(c, lo), 20, phi - Math.PI / 2, Math.PI), B = ringPts(cam, 0, z, hi, rad(c, hi), 20, phi - Math.PI / 2, Math.PI).reverse();
  poly(g, [...A, ...B], 'rgba(222,36,36,0.6)', '#b01818', 1.2);
}
export function drawScene(g, m, st) {
  const cam = camOf(m), t = st.turn, P = (x, y, z) => cam.proj([x, y, z]);
  g.save(); g.beginPath(); g.rect(0, 0, BOARD.w, SCENE_H); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, SCENE_H); gr.addColorStop(0, '#e9eef4'); gr.addColorStop(1, '#cfd8e2');
  g.fillStyle = gr; g.fillRect(0, 0, BOARD.w, SCENE_H);
  poly(g, [P(-3, -0.5, -4), P(3, -0.5, -4), P(3, -0.5, 4), P(-3, -0.5, 4)], '#bfc9d4', null);
  const BZ = 1.95;
  drawBox(g, cam, [-0.36, 0.36], [-0.5, -0.1], [-BZ, BZ], '#6c7783');
  poly(g, [P(-0.33, 0, -BZ), P(0.33, 0, -BZ), P(0.33, 0, BZ), P(-0.33, 0, BZ)], '#3a424c', '#222');
  for (let i = -20; i < 20; i++) {
    const z0 = ((i * 0.2 + t * STEP + 100 * 0.2) % 3.9) - BZ;
    if (z0 < -BZ || z0 + 0.03 > BZ) continue;
    poly(g, [P(-0.33, 0, z0), P(0.33, 0, z0), P(0.33, 0, z0 + 0.03), P(-0.33, 0, z0 + 0.03)], '#59636f', null);
  }
  drawBox(g, cam, [-0.37, -0.33], [0, 0.04], [-BZ, BZ], '#8c97a3'); drawBox(g, cam, [0.33, 0.37], [0, 0.04], [-BZ, BZ], '#8c97a3');
  const items = m.cups.map((c, j) => ({ d: P(0, 0.15, cupZ(c, t))[2], j }));
  items.push({ d: P(0, 0.7, 0)[2] - 0.12, tap: true });
  items.sort((a, b) => b.d - a.d);
  const zj = zoneCup(m, t);
  for (const it of items) {
    if (it.tap) {
      drawBox(g, cam, [-0.5, -0.43], [0, 0.78], [-0.035, 0.035], '#7a8696');
      drawBox(g, cam, [-0.5, 0.04], [0.71, 0.78], [-0.035, 0.035], '#7a8696');
      drawBox(g, cam, [-0.04, 0.04], [0.6, 0.71], [-0.04, 0.04], '#5d6a7a');
      const hnd = P(-0.46, 0.84, 0); g.fillStyle = st.tap ? '#2fa84f' : '#9aa5b1'; g.beginPath(); g.arc(hnd[0], hnd[1], 9, 0, 7); g.fill(); g.strokeStyle = '#4a5562'; g.lineWidth = 1.5; g.stroke();
    } else { const c = m.cups[it.j]; drawCup(g, cam, c, cupZ(c, t), level(m, st, it.j), c.mark); }
  }
  if (st.tap) {
    const top = P(0, 0.6, 0), tgtY = zj >= 0 ? Math.max(0.0, level(m, st, zj)) : 0, bot = P(0, tgtY, 0), w = Math.max(2.5, 0.03 * 560 / top[2]);
    g.strokeStyle = 'rgba(50,140,235,0.92)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(bot[0], bot[1]); g.stroke();
    if (zj < 0) { g.fillStyle = 'rgba(50,140,235,0.7)'; g.beginPath(); g.ellipse(bot[0], bot[1], 22, 7, 0, 0, 7); g.fill(); for (const d of [-14, 0, 14]) { g.beginPath(); g.arc(bot[0] + d, bot[1] - 9 - Math.abs(d) / 3, 2.5, 0, 7); g.fill(); } }
  }
  g.font = `700 16px ${UI_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = st.tap ? '#238a3e' : '#6b7785'; g.fillText(st.tap ? 'Tap: OPEN' : 'Tap: CLOSED', 16, 22);
  if (st.spill || st.over) { g.fillStyle = '#c62828'; g.textAlign = 'right'; g.fillText('Water spilled', BOARD.w - 16, 22); }
  g.restore();
}
