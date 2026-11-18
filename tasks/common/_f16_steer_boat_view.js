import { makeCam, poly, circlePts, sphere, shade, D2R } from './_f16_scene_kit.js';
import * as M from './_f16_steer_boat_model.js';

export const VIEW = { w: 640, h: 420 };
const GRASS = ['#8fb573', '#9bbf7a', '#86ad6a'], WATER = ['#4f9bc1', '#4a8fb8', '#5aa5c4'], MIST = '#c3d8e2';
const BOATS = [['#b5703a', '#e6c48f'], ['#a23d3d', '#e9d7c0'], ['#2f6f8f', '#e9ddc3'], ['#6b8f3a', '#eadfc0']];
export const camAt = (x, z) => makeCam({ az: 0, el: 52, dist: 18, tgt: [x, 0, z + 5.2], fov: 44, W: VIEW.w, H: VIEW.h });
const TREES = new WeakMap();
function trees(m) {
  let T = TREES.get(m); if (T) return T;
  const G = M.geo(m); let h = m.look.seed >>> 0; const rnd = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  T = [];
  for (let j = 0; j < G.R; j++) for (let u = -1; u < G.len[j] + 1; u += 0.9) for (const sd of [-1, 1]) for (let q = 0; q < 2; q++) {
    const v = sd * (M.HALFW + 0.8 + rnd() * 2.2 + q * 1.2), uu = u + rnd() * 0.6, x = G.ax[j] + G.dx[j] * uu + G.nx[j] * v, z = G.az[j] + G.dz[j] * uu + G.nz[j] * v;
    let d = 1e9; for (let i = 0; i < G.R; i++) { const px = x - G.ax[i], pz = z - G.az[i], t = Math.max(0, Math.min(G.len[i], px * G.dx[i] + pz * G.dz[i])); d = Math.min(d, Math.hypot(px - t * G.dx[i], pz - t * G.dz[i])); }
    if (d < M.HALFW + 0.75) continue;
    T.push({ x, z, h: 1.0 + rnd() * 0.8, r: 0.5 + rnd() * 0.25, c: rnd() });
  }
  TREES.set(m, T); return T;
}
export function leafAt(m, i, k) {
  const L = m.leaves[i], G = M.geo(m), j = L.j, len = G.len[j], w = 2 * M.LEAF_V;
  const u = (((L.u + m.su[j] * k) % len) + len) % len, v = ((((L.v + m.sv[j] * k) + M.LEAF_V) % w) + w) % w - M.LEAF_V;
  return { x: G.ax[j] + G.dx[j] * u + G.nx[j] * v, z: G.az[j] + G.dz[j] * u + G.nz[j] * v, fade: Math.min(1, Math.min(u, len - u, M.LEAF_V - Math.abs(v)) / 0.5), rot: L.rot };
}
const reachRect = (G, j, w) => [[G.ax[j] + G.nx[j] * w, G.az[j] + G.nz[j] * w], [G.ax[j] - G.nx[j] * w, G.az[j] - G.nz[j] * w],
  [G.ax[j] + G.dx[j] * G.len[j] - G.nx[j] * w, G.az[j] + G.dz[j] * G.len[j] - G.nz[j] * w], [G.ax[j] + G.dx[j] * G.len[j] + G.nx[j] * w, G.az[j] + G.dz[j] * G.len[j] + G.nz[j] * w]];

export function drawView(g, m, st) {
  const { w: W, h: H } = VIEW, G = M.geo(m), cam = camAt(st.x, st.z), P = (x, z, y = 0) => cam.project(x, y, z);
  const J = st.J, look = m.look;
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#dbe8ee'); sky.addColorStop(0.35, '#eef3ee'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const gz0 = st.z - 12, gz1 = st.z + 60;
  poly(g, [P(st.x - 80, gz0), P(st.x + 80, gz0), P(st.x + 80, gz1), P(st.x - 80, gz1)], GRASS[look.grass]);
  const ground = (pts, fill, stroke, lw, y = 0) => poly(g, pts.map(([x, z]) => P(x, z, y)), fill, stroke, lw);
  const disc = (x, z, r, fill, y = 0) => poly(g, circlePts(cam, x, y, z, r, 'y', 32), fill);
  for (let j = 0; j < G.R; j++) ground(reachRect(G, j, M.HALFW + 0.4), '#d8cfae');
  for (let j = 0; j <= G.R; j++) disc(m.pts[j][0], m.pts[j][1], M.HALFW + 0.4, '#d8cfae');
  const wcol = (j) => (j <= J ? WATER[look.water] : MIST);
  for (let j = 0; j < G.R; j++) ground(reachRect(G, j, M.HALFW), wcol(j));
  for (let j = 0; j <= G.R; j++) disc(m.pts[j][0], m.pts[j][1], M.HALFW, wcol(Math.min(j, G.R - 1)) === MIST && j < G.R ? MIST : wcol(Math.min(j, G.R - 1)));
  g.save(); g.lineCap = 'round';
  for (let j = 0; j <= Math.min(J, G.R - 1); j++) for (let i = 0; i < 5; i++) {
    const u = (i * 1.37 + 0.6 + j * 0.4) % (G.len[j] - 0.8) + 0.3, v = ((i * 0.83 + j) % 3.4) - 1.7;
    const x = G.ax[j] + G.dx[j] * u + G.nx[j] * v, z = G.az[j] + G.dz[j] * u + G.nz[j] * v, a = P(x, z), b = P(x + G.dx[j] * 0.7, z + G.dz[j] * 0.7);
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  g.restore();
  for (let j = J + 1; j < G.R; j++) {
    const c = P(G.ax[j] + G.dx[j] * G.len[j] / 2, G.az[j] + G.dz[j] * G.len[j] / 2), gr = g.createRadialGradient(c.x, c.y, 4, c.x, c.y, 120 * c.s / 18 * 6);
    gr.addColorStop(0, 'rgba(244,248,250,0.78)'); gr.addColorStop(1, 'rgba(244,248,250,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  { const k = G.R - 1, ex = m.pts[G.R][0] + G.dx[k] * 0.5, ez = m.pts[G.R][1] + G.dz[k] * 0.5;
    for (let q = -4; q <= 4; q++) { const v = q * (M.HALFW + 0.2) / 4, a = P(ex + G.nx[k] * v - G.dx[k] * 0.12, ez + G.nz[k] * v - G.dz[k] * 0.12, 0.1), b = P(ex + G.nx[k] * v + G.dx[k] * 0.12, ez + G.nz[k] * v + G.dz[k] * 0.12, 0.1);
      g.strokeStyle = '#6b4a2b'; g.lineWidth = Math.max(4, 0.42 * a.s); g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
  { const D = m.dock, k = G.R - 1, ring = circlePts(cam, D.x, 0.03, D.z, D.r, 'y', 40);
    poly(g, ring, 'rgba(255,255,255,0.22)'); g.save(); g.setLineDash([9, 6]); poly(g, ring, null, '#16a05a', 3.2); g.restore();
    const s = D.side, v0 = s * (M.HALFW + 0.5), v1 = s * (Math.abs(D.v) - 0.2), u0 = D.u - 0.55, u1 = D.u + 0.55;
    const q = (u, v, y) => P(G.ax[k] + G.dx[k] * u + G.nx[k] * v, G.az[k] + G.dz[k] * u + G.nz[k] * v, y);
    const top = [q(u0, v0, 0.3), q(u1, v0, 0.3), q(u1, v1, 0.3), q(u0, v1, 0.3)], base = [q(u0, v0, 0), q(u1, v0, 0), q(u1, v1, 0), q(u0, v1, 0)];
    for (let i = 0; i < 4; i++) poly(g, [base[i], base[(i + 1) % 4], top[(i + 1) % 4], top[i]], '#7a5632', 'rgba(0,0,0,0.2)', 0.8);
    poly(g, top, '#b88a55', '#6e4d2b', 1.2);
    for (let i = 1; i < 4; i++) { const a = q(u0, v0 + (v1 - v0) * i / 4, 0.3), b = q(u1, v0 + (v1 - v0) * i / 4, 0.3); g.strokeStyle = 'rgba(80,50,20,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    const f0 = q(D.u, v1, 0.3), f1 = q(D.u, v1, 1.7); g.strokeStyle = '#444'; g.lineWidth = 2; g.beginPath(); g.moveTo(f0.x, f0.y); g.lineTo(f1.x, f1.y); g.stroke();
    poly(g, [f1, { x: f1.x + 17, y: f1.y + 5 }, { x: f1.x, y: f1.y + 11 }], '#e8412c'); }
  { g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 1; i < st.hist.length; i++) { const a = P(...st.hist[i - 1]), b = P(...st.hist[i]); g.strokeStyle = `rgba(255,255,255,${0.15 + 0.5 * i / st.hist.length})`; g.lineWidth = 5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.restore(); }
  for (let i = 0; i < m.leaves.length; i++) {
    if (m.leaves[i].j > J) continue;
    const k = st.turn, L1 = leafAt(m, i, k), L0 = leafAt(m, i, Math.max(0, k - 1)), a = P(L0.x, L0.z), b = P(L1.x, L1.z);
    if (L1.fade <= 0.02) continue;
    g.save(); g.globalAlpha = L1.fade;
    if (k > 0 && Math.hypot(L1.x - L0.x, L1.z - L0.z) < 3) { g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    const lp = [[0.34, 0], [0.1, 0.17], [-0.3, 0.05], [-0.3, -0.05], [0.1, -0.17]].map(([u, v]) => { const c = Math.cos(L1.rot), s = Math.sin(L1.rot); return P(L1.x + u * c - v * s, L1.z + u * s + v * c, 0.02); });
    poly(g, lp, i % 2 ? '#d9822b' : '#7fae3c', 'rgba(0,0,0,0.35)', 1); g.restore();
  }
  if (!st.crashed && !st.docked && !st.done) {
    for (const a of [-1, 0, 1]) {
      const ok = M.stepW(G, m, st.x, st.z, a, M.R_REACH - 1), o = G.out, q = P(o.x, o.z, 0.05), rad = 0.3 * q.s;
      g.save(); g.globalAlpha = 0.9; g.setLineDash([4, 3]); g.lineWidth = 2.4; g.strokeStyle = ok ? '#ffffff' : '#e5483a'; g.fillStyle = ok ? 'rgba(255,255,255,0.28)' : 'rgba(229,72,58,0.3)';
      g.beginPath(); g.ellipse(q.x, q.y, rad, rad * 0.62, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
    }
  }
  const objs = trees(m).map((t) => ({ z: t.z, kind: 't', o: t }));
  for (const r of m.rocks) if (r.j <= J) objs.push({ z: r.z, kind: 'r', o: r });
  objs.push({ z: st.z, kind: 'b', o: null });
  objs.sort((p, q) => q.z - p.z);
  for (const it of objs) {
    if (it.kind === 't') {
      const t = it.o, b = P(t.x, t.z), top = P(t.x, t.z, t.h), r = t.r * b.s;
      if (top.y < -40 || b.y > H + 40) continue;
      g.strokeStyle = '#5b3d22'; g.lineWidth = Math.max(2, r * 0.35); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(top.x, top.y + r * 0.2); g.stroke();
      g.fillStyle = shade(t.c < 0.5 ? '#3f7d45' : '#4f8f3d', 0.9 + t.c * 0.2); g.beginPath(); g.arc(top.x, top.y - r * 0.2, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(top.x - r * 0.3, top.y - r * 0.5, r * 0.45, 0, Math.PI * 2); g.fill();
    } else if (it.kind === 'r') {
      const r = it.o; poly(g, circlePts(cam, r.x, 0.02, r.z, M.ROCKR + 0.14, 'y', 24), 'rgba(255,255,255,0.55)');
      sphere(g, cam, r.x, 0.12, r.z, M.ROCKR, '#6e747a');
    } else drawBoat(g, cam, m, st);
  }
  if (st.crashed || st.docked) {
    const msg = st.crashed ? (st.why === 'rock' ? 'Hit a rock' : st.why === 'end' ? 'Hit the log boom' : 'Ran aground') : 'Docked';
    g.save(); g.font = '700 20px -apple-system, "PingFang SC", sans-serif'; const tw = g.measureText(msg).width + 36;
    g.fillStyle = st.crashed ? 'rgba(200,50,40,0.92)' : 'rgba(22,160,90,0.92)'; g.beginPath(); g.roundRect(W / 2 - tw / 2, 12, tw, 36, 10); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, W / 2, 31); g.restore();
  }
}
function drawBoat(g, cam, m, st) {
  const ps = BOATS[m.look.boat], psi = st.hdg, c = Math.cos(psi), s = Math.sin(psi);
  const rot = (u, v) => [st.x + v * c + u * s, st.z - v * s + u * c];
  const hull = [[0.62, 0], [0.18, 0.3], [-0.5, 0.26], [-0.5, -0.26], [0.18, -0.3]], deck = [[0.5, 0], [0.14, 0.2], [-0.36, 0.17], [-0.36, -0.17], [0.14, -0.2]];
  const H = (pts, y) => pts.map(([u, v]) => { const [x, z] = rot(u, v); return cam.project(x, y, z); });
  poly(g, H(hull, 0.02).map((p) => ({ x: p.x + 2, y: p.y + 3 })), 'rgba(0,0,0,0.25)');
  const lo = H(hull, 0.02), hi = H(hull, 0.3);
  for (let i = 0; i < lo.length; i++) poly(g, [lo[i], lo[(i + 1) % lo.length], hi[(i + 1) % lo.length], hi[i]], shade(ps[0], 0.8), 'rgba(0,0,0,0.25)', 0.8);
  poly(g, hi, ps[0], 'rgba(0,0,0,0.35)', 1.2); poly(g, H(deck, 0.31), ps[1], 'rgba(0,0,0,0.25)', 1);
  const m0 = cam.project(st.x, 0.31, st.z), m1 = cam.project(st.x, 1.25, st.z);
  g.strokeStyle = '#444'; g.lineWidth = 2; g.beginPath(); g.moveTo(m0.x, m0.y); g.lineTo(m1.x, m1.y); g.stroke();
  poly(g, [m1, { x: m1.x + 13, y: m1.y + 4 }, { x: m1.x, y: m1.y + 9 }], '#f2f2f2', 'rgba(0,0,0,0.3)', 0.8);
  if (st.crashed) { g.strokeStyle = '#d63a2c'; g.lineWidth = 4; const q = cam.project(st.x, 0.5, st.z); g.beginPath(); g.moveTo(q.x - 12, q.y - 12); g.lineTo(q.x + 12, q.y + 12); g.moveTo(q.x + 12, q.y - 12); g.lineTo(q.x - 12, q.y + 12); g.stroke(); }
}
