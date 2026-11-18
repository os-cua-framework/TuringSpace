import { poly, circlePts, sphere, box, hull, shade } from './_f16_scene_kit.js';
import * as M from './_f16_catch_ball_model.js';

const WOOD = [['#c9a46a', '#a98245'], ['#b9c7d6', '#8fa1b5'], ['#d8c3a5', '#b39a74']], BALL = ['#e5483a', '#2f7fd1', '#f0a020'], BASKET = ['#a8542c', '#2d8a6e', '#7b4aa8'];
const WALL = ['#e9e4d9', '#dde5e8', '#ece3dc'];

function peg(g, cam, p, col) {
  const a = circlePts(cam, p.x, p.y, 0.0, M.RP, "z", 16), b = circlePts(cam, p.x, p.y, -0.1, M.RP, 'z', 16);
  poly(g, hull(a.concat(b)).map(([x, y]) => ({ x, y })), shade(col, 0.7), 'rgba(0,0,0,0.3)', 0.6);
  poly(g, b, shade(col, 1.25), 'rgba(0,0,0,0.35)', 0.8);
}
export function drawView(g, m, st) {
  const { w: W, h: H } = M.VIEW, cam = M.camOf(m.look), L = m.look, P = (x, y, z) => cam.project(x, y, z);
  g.fillStyle = WALL[L.wood]; g.fillRect(0, 0, W, H);
  poly(g, [P(-4, 0, 1.5), P(4, 0, 1.5), P(4, 0, -3), P(-4, 0, -3)], '#9aa29b');
  for (let z = -3; z <= 1; z += 0.5) { const a = P(-4, 0, z), b = P(4, 0, z); g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  const wood = WOOD[L.wood];
  box(g, cam, { x0: -2.1, x1: 2.1, y0: 0, y1: 3.5, z0: 0, z1: 0.3 }, wood[0], { top: 1.1, front: 1.0, side: 0.7 });
  poly(g, [P(-2.0, 0.08, 0), P(2.0, 0.08, 0), P(2.0, 3.42, 0), P(-2.0, 3.42, 0)], null, wood[1], 3);
  box(g, cam, { x0: -2.1, x1: 2.1, y0: 0, y1: 0.05, z0: -0.3, z1: 0 }, '#5b5f66');
  for (let j = -9; j <= 9; j++) { const x = m.xb0 + M.STEP * j; if (Math.abs(x) > M.XB_MAX + 0.01) continue; const a = P(x, 0.051, -0.04), b = P(x, 0.051, -0.26); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  for (const p of m.pegs) peg(g, cam, p, '#7f8791');
  const k = st.turn, tr = m.traj;
  for (const [q, al] of [[k - 2, 0.18], [k - 1, 0.32]]) if (q >= 0) { const s = tr[q], c = P(s.x, s.y, -0.06); g.fillStyle = `rgba(80,90,100,${al})`; g.beginPath(); g.arc(c.x, c.y, M.RB * c.s * 0.8, 0, Math.PI * 2); g.fill(); }
  const bx = st.xb, bk = BASKET[L.basket];
  box(g, cam, { x0: bx - 0.3, x1: bx + 0.3, y0: 0.05, y1: M.YR, z0: -0.26, z1: -0.0 }, bk, { top: 1.0, front: 1.0, side: 0.75 });
  poly(g, [P(bx - 0.25, M.YR + 0.001, -0.04), P(bx + 0.25, M.YR + 0.001, -0.04), P(bx + 0.25, M.YR + 0.001, -0.22), P(bx - 0.25, M.YR + 0.001, -0.22)], shade(bk, 0.35));
  const b = tr[k]; sphere(g, cam, b.x, b.y, -0.06, M.RB, BALL[L.ballc]);
  { const B = M.BAFFLE; box(g, cam, B, '#8b98a8', { top: 1.15, front: 1.0, side: 0.75 });
    const f = [P(B.x0 + 0.06, B.y0 + 0.06, B.z0), P(B.x1 - 0.06, B.y0 + 0.06, B.z0), P(B.x1 - 0.06, B.y1 - 0.06, B.z0), P(B.x0 + 0.06, B.y1 - 0.06, B.z0)];
    poly(g, f, null, 'rgba(255,255,255,0.55)', 2);
    for (const [x, y] of [[B.x0 + 0.12, B.y0 + 0.12], [B.x1 - 0.12, B.y0 + 0.12], [B.x0 + 0.12, B.y1 - 0.12], [B.x1 - 0.12, B.y1 - 0.12]]) { const c = P(x, y, B.z0); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(c.x, c.y, 3, 0, Math.PI * 2); g.fill(); } }
  if (st.done) {
    const ok = Math.abs(st.xb - tr[m.n].x) <= M.CATCH, msg = ok ? 'Caught' : 'Missed';
    g.save(); g.font = '700 20px -apple-system, "PingFang SC", sans-serif'; const tw = g.measureText(msg).width + 36;
    g.fillStyle = ok ? 'rgba(22,160,90,0.92)' : 'rgba(200,50,40,0.92)'; g.beginPath(); g.roundRect(W / 2 - tw / 2, 12, tw, 36, 10); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, W / 2, 31); g.restore();
  }
}
