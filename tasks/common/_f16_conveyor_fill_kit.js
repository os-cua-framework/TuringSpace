import { UI_FONT, rr } from '../core/panel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
export function makeCam({ az, el, dist, look, f, cx, cy }) {
  const A = az * Math.PI / 180, E = el * Math.PI / 180;
  const pos = [look[0] + dist * Math.sin(A) * Math.cos(E), look[1] + dist * Math.sin(E), look[2] + dist * Math.cos(A) * Math.cos(E)];
  const fwd = norm(sub(look, pos)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  return { pos, fwd, right, up, proj(p) { const d = sub(p, pos), z = dot(d, fwd); return [cx + f * dot(d, right) / z, cy - f * dot(d, up) / z, z]; } };
}
export function hull(pts) {
  const P = pts.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
export function inHull(h, p) {
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false; }
  return true;
}
export function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((q) => Math.max(0, Math.min(255, Math.round(q * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export function poly(g, pts, fill, stroke, lw = 1) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}
export function drawBox(g, cam, X, Y, Z, base, edge = 'rgba(0,0,0,0.35)') {
  const [x0, x1] = X, [y0, y1] = Y, [z0, z1] = Z;
  const F = [
    [[0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 1.18],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 1.0],
    [[0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0.9],
    [[1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 0.78],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.7],
  ];
  for (const [n, cs, k] of F) {
    const c = [0, 1, 2].map((i) => cs.reduce((s, p) => s + p[i], 0) / 4);
    if (dot(n, sub(cam.pos, c)) <= 0) continue;
    poly(g, cs.map((p) => cam.proj(p)), shade(base, k), edge, 1);
  }
}
export function btnRects(n, W, y, h, gap = 16, margin = 16) {
  const w = (W - 2 * margin - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i) => ({ x: margin + i * (w + gap), y, w, h }));
}
export function drawBtns(g, rects, defs, lastId, disabled) {
  rects.forEach((r, i) => {
    const d = defs[i], on = lastId === d.id;
    rr(g, r.x, r.y, r.w, r.h, 12);
    g.fillStyle = disabled ? '#f1f3f5' : on ? d.color : '#eef2f6'; g.fill();
    g.strokeStyle = disabled ? '#dde1e6' : d.color; g.lineWidth = on ? 3 : 2; g.stroke();
    g.fillStyle = disabled ? '#b5bcc4' : on ? '#ffffff' : '#2f3a45'; g.font = `700 20px ${UI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  });
}
export const hitBtn = (rects, x, y) => rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
