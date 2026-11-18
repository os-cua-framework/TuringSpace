const rad = (d) => (d * Math.PI) / 180;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

export const SLAB = 0.32;
export const PAWN_H = 0.7;
export const headVec = (h) => ({ x: Math.round(Math.sin(rad(h))), y: Math.round(Math.cos(rad(h))) });

export function makeCamera(N, cam) {
  const T = { x: N / 2, y: N / 2, z: 0 };
  const ce = Math.cos(rad(cam.el)), se = Math.sin(rad(cam.el));
  const C = { x: T.x + cam.dist * ce * Math.cos(rad(cam.az)), y: T.y + cam.dist * ce * Math.sin(rad(cam.az)), z: cam.dist * se };
  const f = norm(sub(T, C));
  const r = norm(cross(f, { x: 0, y: 0, z: 1 }));
  const u = cross(r, f);
  return { N, C, f, r, u };
}
function projRaw(K, p) {
  const d = sub(p, K.C), w = dot(d, K.f);
  return { X: dot(d, K.r) / w, Y: -dot(d, K.u) / w, w };
}
export function computeFit(N, cam, area) {
  const K = makeCamera(N, cam);
  const pts = [];
  for (const [x, y] of [[0, 0], [N, 0], [N, N], [0, N]]) for (const z of [0, -SLAB]) pts.push(projRaw(K, { x, y, z }));
  for (const [x, y] of [[0.5, 0.5], [N - 0.5, 0.5], [N - 0.5, N - 0.5], [0.5, N - 0.5]]) pts.push(projRaw(K, { x, y, z: PAWN_H + 0.1 }));
  const X0 = Math.min(...pts.map((p) => p.X)), X1 = Math.max(...pts.map((p) => p.X));
  const Y0 = Math.min(...pts.map((p) => p.Y)), Y1 = Math.max(...pts.map((p) => p.Y));
  const k = Math.min(area.w / (X1 - X0), area.h / (Y1 - Y0));
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  return { k: r4(k), ox: r4(area.x + area.w / 2 - k * (X0 + X1) / 2), oy: r4(area.y + area.h / 2 - k * (Y0 + Y1) / 2) };
}
export function makeView(m) {
  const K = makeCamera(m.N, m.cam), F = m.fit;
  const P = (x, y, z = 0) => { const q = projRaw(K, { x, y, z }); return { x: F.ox + F.k * q.X, y: F.oy + F.k * q.Y, w: q.w }; };
  const unproject = (sx, sy) => {
    const X = (sx - F.ox) / F.k, Y = (sy - F.oy) / F.k;
    const d = { x: K.f.x + X * K.r.x - Y * K.u.x, y: K.f.y + X * K.r.y - Y * K.u.y, z: K.f.z + X * K.r.z - Y * K.u.z };
    if (d.z >= -1e-9) return null;
    const t = -K.C.z / d.z;
    return { x: K.C.x + t * d.x, y: K.C.y + t * d.y };
  };
  const tileAt = (sx, sy) => {
    const p = unproject(sx, sy);
    if (!p || p.x < 0 || p.y < 0 || p.x >= m.N || p.y >= m.N) return null;
    return { c: Math.floor(p.x), r: Math.floor(p.y) };
  };
  const tileCenter = (t) => P(t.c + 0.5, t.r + 0.5);
  const tileMinEdge = (t) => {
    const a = P(t.c, t.r), b = P(t.c + 1, t.r), c = P(t.c + 1, t.r + 1), d = P(t.c, t.r + 1);
    return Math.min(Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(c.x - d.x, c.y - d.y), Math.hypot(d.x - a.x, d.y - a.y));
  };
  return { K, P, unproject, tileAt, tileCenter, tileMinEdge };
}

function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }

export function drawFloor(g, m, V) {
  const N = m.N, K = V.K;
  const sides = [
    { a: [0, 0], b: [N, 0], n: { x: 0, y: -1, z: 0 } }, { a: [N, 0], b: [N, N], n: { x: 1, y: 0, z: 0 } },
    { a: [N, N], b: [0, N], n: { x: 0, y: 1, z: 0 } }, { a: [0, N], b: [0, 0], n: { x: -1, y: 0, z: 0 } },
  ];
  for (const s of sides) {
    const mid = { x: (s.a[0] + s.b[0]) / 2, y: (s.a[1] + s.b[1]) / 2, z: 0 };
    if (dot(s.n, sub(K.C, mid)) <= 0) continue;
    poly(g, [V.P(s.a[0], s.a[1]), V.P(s.b[0], s.b[1]), V.P(s.b[0], s.b[1], -SLAB), V.P(s.a[0], s.a[1], -SLAB)]);
    g.fillStyle = s.n.x !== 0 ? '#8fa088' : '#a3b39b'; g.fill();
    g.strokeStyle = '#6f7f69'; g.lineWidth = 1; g.stroke();
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    poly(g, [V.P(i, j), V.P(i + 1, j), V.P(i + 1, j + 1), V.P(i, j + 1)]);
    g.fillStyle = (i + j) % 2 ? '#dfe8d8' : '#f4f7f0'; g.fill();
  }
  g.strokeStyle = 'rgba(70,95,72,.45)'; g.lineWidth = 1;
  for (let i = 0; i <= N; i++) {
    const a = V.P(i, 0), b = V.P(i, N), c = V.P(0, i), d = V.P(N, i);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(c.x, c.y); g.lineTo(d.x, d.y); g.stroke();
  }
  poly(g, [V.P(0, 0), V.P(N, 0), V.P(N, N), V.P(0, N)]);
  g.strokeStyle = '#5f7259'; g.lineWidth = 1.5; g.stroke();
}

export function drawWalker(g, m, V) {
  const s = m.start, cx = s.c + 0.5, cy = s.r + 0.5, d = headVec(m.heading0), p = { x: d.y, y: -d.x };
  poly(g, [V.P(s.c, s.r), V.P(s.c + 1, s.r), V.P(s.c + 1, s.r + 1), V.P(s.c, s.r + 1)]);
  g.fillStyle = '#4f9a5f'; g.fill(); g.strokeStyle = '#2c6b3d'; g.lineWidth = 1.5; g.stroke();
  const bx = cx - d.x * 0.17, by = cy - d.y * 0.17;
  const W = (a, b, z = 0) => V.P(bx + d.x * a + p.x * b, by + d.y * a + p.y * b, z);
  const K = V.K, toCam = d.x * (K.C.x - bx) + d.y * (K.C.y - by);
  const ex = V.P(bx + 0.5 * K.r.x, by + 0.5 * K.r.y), wx = V.P(bx - 0.5 * K.r.x, by - 0.5 * K.r.y);
  const sc = Math.hypot(ex.x - wx.x, ex.y - wx.y);
  const wedge = () => {
    poly(g, [W(0.66, 0), W(0.2, 0.27), W(0.2, -0.27)]);
    g.fillStyle = '#123820'; g.fill(); g.strokeStyle = '#123820'; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke();
  };
  if (toCam <= 0) wedge();
  const base = V.P(bx, by);
  g.save(); g.translate(base.x, base.y); g.scale(1, 0.5);
  g.beginPath(); g.arc(0, 0, sc * 0.3, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill(); g.restore();
  const top = V.P(bx, by, 0.56), bw = sc * 0.2;
  g.beginPath(); g.moveTo(base.x - bw, base.y); g.lineTo(top.x - bw * 0.85, top.y); g.lineTo(top.x + bw * 0.85, top.y);
  g.lineTo(base.x + bw, base.y); g.closePath();
  g.fillStyle = '#1f5a30'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
  const R = 0.27, hz = 0.56 + R * 0.85, hc = W(0, 0, hz), rpx = sc * R;
  const C3 = { x: K.C.x - bx, y: K.C.y - by, z: K.C.z - hz }, cl = Math.hypot(C3.x, C3.y, C3.z);
  const facing = (a, b, z) => (a * d.x * C3.x + a * d.y * C3.y + b * p.x * C3.x + b * p.y * C3.y + z * C3.z) / cl;
  const nose = () => {
    poly(g, [W(R * 0.9, 0.055, hz - 0.005), W(R + 0.09, 0, hz - 0.05), W(R * 0.9, -0.055, hz - 0.005)]);
    g.fillStyle = '#e0a477'; g.fill(); g.strokeStyle = '#9a5a35'; g.lineWidth = 1; g.stroke();
  };
  if (toCam <= 0) nose();
  g.beginPath(); g.arc(hc.x, hc.y, rpx, 0, Math.PI * 2); g.fillStyle = '#3a2a1e'; g.fill();
  g.save(); g.beginPath(); g.arc(hc.x, hc.y, rpx, 0, Math.PI * 2); g.clip();
  const fc = W(R * 0.62, 0, hz - 0.02);
  g.beginPath(); g.arc(fc.x, fc.y, rpx * 0.84, 0, Math.PI * 2); g.fillStyle = '#f2cda4'; g.fill();
  g.restore();
  g.beginPath(); g.arc(hc.x, hc.y, rpx, 0, Math.PI * 2); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
  for (const sgn of [1, -1]) {
    const a = Math.cos(rad(30)), b = sgn * Math.sin(rad(30)) * 0.97, z = 0.2;
    if (facing(a, b, z) <= 0.55) continue;
    const e = W(R * 0.92 * a, R * 0.92 * b, hz + R * 0.92 * z);
    g.beginPath(); g.arc(e.x, e.y, Math.max(1.3, rpx * 0.13), 0, Math.PI * 2); g.fillStyle = '#1b1b1b'; g.fill();
  }
  if (toCam > 0) nose();
  if (toCam > 0) wedge();
}

export function drawMark(g, m, V, t, color) {
  poly(g, [V.P(t.c, t.r), V.P(t.c + 1, t.r), V.P(t.c + 1, t.r + 1), V.P(t.c, t.r + 1)]);
  g.fillStyle = 'rgba(25,145,250,.30)'; g.fill(); g.strokeStyle = color; g.lineWidth = 2.2; g.stroke();
  const q = V.tileCenter(t);
  g.beginPath(); g.arc(q.x, q.y, 3.2, 0, Math.PI * 2); g.fillStyle = color; g.fill();
}
