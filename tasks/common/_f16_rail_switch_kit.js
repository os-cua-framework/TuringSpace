import { UI_FONT, rr } from '../core/panel.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r2 = (v) => Math.round(v * 100) / 100;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function makeCam(pos, target, f, cx, cy) {
  const fw = norm(sub(target, pos)), right = norm(cross([0, 1, 0], fw)), up = cross(fw, right);
  return { pos, fw, right, up, f, cx, cy };
}
export function project(cam, p) {
  const v = sub(p, cam.pos), z = dot(v, cam.fw);
  const k = cam.f / Math.max(z, 1e-6);
  return [cam.cx + dot(v, cam.right) * k, cam.cy - dot(v, cam.up) * k, z];
}
export function pxPer(cam, p) { return cam.f / Math.max(dot(sub(p, cam.pos), cam.fw), 1e-6); }

export function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(h, k) { const c = hex2rgb(h); return `rgb(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))})`; }
export function mixHex(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join(''); }

export function poly(g, cam, pts, fill, stroke, lw = 1) {
  const near = 0.3, out = [];
  const P = pts.map((p) => ({ p, z: dot(sub(p, cam.pos), cam.fw) }));
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (a.z >= near) out.push(a.p);
    if ((a.z >= near) !== (b.z >= near)) {
      const t = (near - a.z) / (b.z - a.z);
      out.push([a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t]);
    }
  }
  if (out.length < 3) return false;
  g.beginPath();
  out.forEach((p, i) => { const s = project(cam, p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  return true;
}
export function gquad(g, cam, x0, x1, z0, z1, fill, stroke, y = 0) {
  return poly(g, cam, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, stroke);
}
export function gline(g, cam, a, b, w, fill, y = 0) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
  return poly(g, cam, [[a[0] + nx, y, a[1] + nz], [b[0] + nx, y, b[1] + nz], [b[0] - nx, y, b[1] - nz], [a[0] - nx, y, a[1] - nz]], fill, null);
}

const LIGHT = norm([-0.35, 0.85, -0.45]);
export function boxFaces(b) {
  const [cx, y0, cz] = b.c, [w, h, d] = b.s, th = b.yaw || 0, co = Math.cos(th), si = Math.sin(th);
  const loc = (lx, ly, lz) => [cx + lx * co + lz * si, y0 + ly, cz - lx * si + lz * co];
  const hw = w / 2, hd = d / 2;
  const v = [loc(-hw, 0, -hd), loc(hw, 0, -hd), loc(hw, 0, hd), loc(-hw, 0, hd), loc(-hw, h, -hd), loc(hw, h, -hd), loc(hw, h, hd), loc(-hw, h, hd)];
  return [
    { n: [0, 1, 0], q: [4, 5, 6, 7], k: 1.0 },
    { n: [co, 0, -si], q: [1, 2, 6, 5], k: 0 },
    { n: [-co, 0, si], q: [0, 3, 7, 4], k: 0 },
    { n: [si, 0, co], q: [3, 2, 6, 7], k: 0 },
    { n: [-si, 0, -co], q: [0, 1, 5, 4], k: 0 },
  ].map((f) => ({ ...f, pts: f.q.map((i) => v[i]), ctr: [0, 1, 2].map((a) => f.q.reduce((s, i) => s + v[i][a], 0) / 4) }));
}
export function drawBox(g, cam, b, opts = {}) {
  const faces = boxFaces(b).filter((f) => dot(f.n, sub(cam.pos, f.ctr)) > 0);
  for (const f of faces) {
    const k = f.n[1] > 0.5 ? 1.08 : 0.62 + 0.42 * clamp(dot(f.n, LIGHT), 0, 1);
    const tex = opts.faceCol && opts.faceCol(f) || b.col;
    poly(g, cam, f.pts, shade(tex, k), opts.edge === false ? null : shade(tex, 0.5 * k), 0.8);
  }
}
export function boxAABB(b) {
  const sw = Math.abs(Math.sin(b.yaw || 0)) > 0.7;
  const w = sw ? b.s[2] : b.s[0], d = sw ? b.s[0] : b.s[2];
  return { x0: b.c[0] - w / 2, x1: b.c[0] + w / 2, y0: b.c[1], y1: b.c[1] + b.s[1], z0: b.c[2] - d / 2, z1: b.c[2] + d / 2 };
}
export function orderAABB(cam, items) {
  const c = cam.pos;
  const front = (A, B) => {
    const a = A.aabb, b = B.aabb;
    if (a.x1 <= b.x0 + 1e-9) return c[0] <= (a.x1 + b.x0) / 2;
    if (b.x1 <= a.x0 + 1e-9) return c[0] >= (b.x1 + a.x0) / 2;
    if (a.z1 <= b.z0 + 1e-9) return c[2] <= (a.z1 + b.z0) / 2;
    if (b.z1 <= a.z0 + 1e-9) return c[2] >= (b.z1 + a.z0) / 2;
    return null;
  };
  const rest = items.slice(), out = [];
  while (rest.length) {
    let pick = -1;
    for (let i = 0; i < rest.length && pick < 0; i++) {
      let ok = true;
      for (let j = 0; j < rest.length && ok; j++) {
        if (j === i) continue;
        const f = front(rest[i], rest[j]);
        if (f === true || (f === null && rest[i].dep < rest[j].dep)) ok = false;
      }
      if (ok) pick = i;
    }
    out.push(rest.splice(pick < 0 ? 0 : pick, 1)[0]);
  }
  return out;
}

export function drawTurnButton(g, b, state = {}) {
  const on = !!state.on, off = !!state.disabled;
  rr(g, b.x, b.y, b.w, b.h, 12);
  g.fillStyle = off ? '#eceff2' : on ? shade(b.color, 1.0) : mixHex(b.color, '#ffffff', 0.82); g.fill();
  g.lineWidth = on ? 3 : 2; g.strokeStyle = off ? '#d5dae0' : b.color; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = off ? '#a9b1ba' : on ? '#ffffff' : shade(b.color, 0.55);
  g.font = `800 17px ${UI_FONT}`; g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 8 : 0));
  if (b.sub) { g.font = `600 11.5px ${UI_FONT}`; g.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + 12); }
}
export function hitRect(rects, x, y) { return rects.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null; }
export { rr, UI_FONT };
