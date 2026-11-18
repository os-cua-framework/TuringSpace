import { rr, UI_FONT } from '../core/panel.js';

export const D2R = Math.PI / 180;
export const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 1e4) / 1e4;
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

export function makeCam({ az = 0, el = 40, dist = 15, tgt = [0, 0, 0], fov = 40, W = 640, H = 420, cy = 0 }) {
  const A = az * D2R, E = el * D2R;
  const eye = [tgt[0] + dist * Math.cos(E) * Math.sin(A), tgt[1] + dist * Math.sin(E), tgt[2] - dist * Math.cos(E) * Math.cos(A)];
  let f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
  let r = [f[2], 0, -f[0]]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const F = (H / 2) / Math.tan(fov * D2R / 2);
  const project = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2], xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2];
    return { x: W / 2 + F * xc / zc, y: H / 2 + cy - F * yc / zc, z: zc, s: F / zc };
  };
  return { project, eye, F, W, H, f };
}

export function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((q) => Math.max(0, Math.min(255, Math.round(k >= 1 ? q + (255 - q) * (k - 1) : q * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export function poly(g, pts, fill, stroke, lw = 1) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
export function circlePts(cam, cx, cy, cz, r, plane = 'y', n = 28) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    out.push(plane === 'y' ? cam.project(cx + c, cy, cz + s) : cam.project(cx + c, cy + s, cz));
  }
  return out;
}
export function sphere(g, cam, x, y, z, r, col) {
  const q = cam.project(x, y, z), rad = r * q.s;
  const gr = g.createRadialGradient(q.x - rad * 0.35, q.y - rad * 0.4, rad * 0.1, q.x, q.y, rad);
  gr.addColorStop(0, shade(col, 1.55)); gr.addColorStop(1, shade(col, 0.72));
  g.beginPath(); g.arc(q.x, q.y, rad, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
  g.strokeStyle = shade(col, 0.5); g.lineWidth = 1; g.stroke();
  return q;
}
export function box(g, cam, b, col, shadeK = { top: 1.2, front: 0.95, side: 0.75 }) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  const faces = [
    { n: [0, 1, 0], c: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], k: shadeK.top },
    { n: [0, -1, 0], c: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], k: 0.5 },
    { n: [0, 0, -1], c: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], k: shadeK.front },
    { n: [0, 0, 1], c: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], k: 0.6 },
    { n: [-1, 0, 0], c: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], k: shadeK.side },
    { n: [1, 0, 0], c: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], k: shadeK.side },
  ];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  for (const f of faces) {
    const fc = [cx + f.n[0] * (x1 - x0) / 2, cy + f.n[1] * (y1 - y0) / 2, cz + f.n[2] * (z1 - z0) / 2];
    const v = [cam.eye[0] - fc[0], cam.eye[1] - fc[1], cam.eye[2] - fc[2]];
    if (v[0] * f.n[0] + v[1] * f.n[1] + v[2] * f.n[2] <= 0) continue;
    poly(g, f.c.map((p) => cam.project(...p)), shade(col, f.k), 'rgba(0,0,0,0.25)', 0.8);
  }
}
export function hull(pts) {
  const P = pts.map((p) => [p.x, p.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function insideMargin(H, x, y) {
  let m = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    m = Math.min(m, (ex * (y - a[1]) - ey * (x - a[0])) / l);
  }
  return m;
}

export function buttonRects(defs, y, h, W, gap = 10) {
  const w = (W - (defs.length + 1) * gap) / defs.length;
  return defs.map((d, i) => ({ ...d, x: gap + i * (w + gap), y, w, h }));
}
export function hitButton(rects, x, y) { return rects.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null; }
export function drawButtons(g, rects, off) {
  for (const b of rects) {
    rr(g, b.x, b.y, b.w, b.h, 12); g.fillStyle = off ? '#f1f3f5' : '#e6eef7'; g.fill();
    g.strokeStyle = off ? '#d9dee3' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
    const col = off ? '#aab3bb' : '#2d4a68', cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    g.font = `700 17px ${UI_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    const tw = g.measureText(b.label).width, ix = cx - tw / 2 - 20;
    if (b.dir) {
      const s = b.dir; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(ix - s * 12, cy); g.lineTo(ix + s * 10, cy); g.stroke();
      g.beginPath(); g.moveTo(ix + s * 14, cy); g.lineTo(ix + s * 5, cy - 8); g.lineTo(ix + s * 5, cy + 8); g.closePath(); g.fill();
    } else { g.beginPath(); g.arc(ix, cy, 8, 0, Math.PI * 2); g.lineWidth = 3; g.stroke(); }
    g.fillText(b.label, cx + 12, cy + 1);
  }
}
