export function makeIso({ ox, oy, DX, DY, DZ }) {
  return {
    ox, oy, DX, DY, DZ,
    p: (x, y, z) => ({ x: ox + (x - y) * DX, y: oy + (x + y) * DY - z * DZ }),
  };
}

export function isoSteps(DX, elDeg) {
  const s = DX * Math.SQRT2, el = elDeg * Math.PI / 180;
  return { DX, DY: DX * Math.sin(el), DZ: s * Math.cos(el) };
}

const EPS = 1e-6;

function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-9) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

export function boxCorners(b) {
  const out = [];
  for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) out.push({ x, y, z });
  return out;
}

export function boxHull(iso, b) { return hull(boxCorners(b).map((c) => iso.p(c.x, c.y, c.z))); }

export function topFace(iso, b) {
  return [iso.p(b.x0, b.y0, b.z1), iso.p(b.x1, b.y0, b.z1), iso.p(b.x1, b.y1, b.z1), iso.p(b.x0, b.y1, b.z1)];
}

function polysOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = -(q.y - p.y), ny = q.x - p.x, L = Math.hypot(nx, ny);
      if (L < 1e-9) continue;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const v of a) { const t = (v.x * nx + v.y * ny) / L; if (t < amin) amin = t; if (t > amax) amax = t; }
      for (const v of b) { const t = (v.x * nx + v.y * ny) / L; if (t < bmin) bmin = t; if (t > bmax) bmax = t; }
      if (amax <= bmin + 0.05 || bmax <= amin + 0.05) return false;
    }
  }
  return true;
}

export function inConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

export function sepOrder(a, b) {
  if (a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS || a.z1 <= b.z0 + EPS) return -1;
  if (b.x1 <= a.x0 + EPS || b.y1 <= a.y0 + EPS || b.z1 <= a.z0 + EPS) return 1;
  return 0;
}

const depthKey = (b) => (b.x0 + b.x1) + (b.y0 + b.y1) + 0.9 * (b.z0 + b.z1);

export function paintOrder(iso, items) {
  const n = items.length;
  const H = items.map((b) => boxHull(iso, b));
  const BB = H.map((h) => ({
    x0: Math.min(...h.map((q) => q.x)), x1: Math.max(...h.map((q) => q.x)),
    y0: Math.min(...h.map((q) => q.y)), y1: Math.max(...h.map((q) => q.y)),
  }));
  const succ = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = BB[i], B = BB[j];
    if (A.x1 <= B.x0 || B.x1 <= A.x0 || A.y1 <= B.y0 || B.y1 <= A.y0) continue;
    if (!polysOverlap(H[i], H[j])) continue;
    let o = sepOrder(items[i], items[j]);
    if (!o) o = depthKey(items[i]) <= depthKey(items[j]) ? -1 : 1;
    if (o < 0) { succ[i].push(j); indeg[j]++; } else { succ[j].push(i); indeg[i]++; }
  }
  const keys = items.map(depthKey), done = new Uint8Array(n), order = [];
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || indeg[i] > 0) continue;
      if (best < 0 || keys[i] < keys[best] - 1e-9 || (Math.abs(keys[i] - keys[best]) <= 1e-9 && i < best)) best = i;
    }
    if (best < 0) {
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || keys[i] < keys[best])) best = i;
    }
    done[best] = 1; order.push(best);
    for (const j of succ[best]) indeg[j]--;
  }
  return order.map((i) => ({ ...items[i], hull: H[i] }));
}

export function pickAt(ordered, x, y, accept = () => true) {
  for (let k = ordered.length - 1; k >= 0; k--) {
    const it = ordered[k];
    if (!it.hull || !inConvex(it.hull, x, y)) continue;
    if (it.noPick) continue;
    return accept(it) ? it : null;
  }
  return null;
}

export function topVisibleFrac(iso, ordered, k, n = 6, skip = () => false) {
  const b = ordered[k];
  let vis = 0, tot = 0;
  for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
    const x = b.x0 + (b.x1 - b.x0) * (a + 0.5) / n, y = b.y0 + (b.y1 - b.y0) * (c + 0.5) / n;
    const s = iso.p(x, y, b.z1);
    tot++;
    if (!pointCoveredAfter(ordered, k, s.x, s.y, skip)) vis++;
  }
  return vis / tot;
}

export function pointCoveredAfter(ordered, k, x, y, skip = () => false) {
  for (let m = k + 1; m < ordered.length; m++) {
    const o = ordered[m];
    if (o.noOcclude || skip(o)) continue;
    if (inConvex(o.hull, x, y)) return true;
  }
  return false;
}

const clampB = (v) => Math.max(0, Math.min(255, Math.round(v)));
export function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(hex, f) { const [r, g, b] = hexRGB(hex); return `rgb(${clampB(r * f)},${clampB(g * f)},${clampB(b * f)})`; }
export function mix(hexA, hexB, t) {
  const A = hexRGB(hexA), B = hexRGB(hexB);
  return `rgb(${clampB(A[0] + (B[0] - A[0]) * t)},${clampB(A[1] + (B[1] - A[1]) * t)},${clampB(A[2] + (B[2] - A[2]) * t)})`;
}

export function polyPath(g, pts) {
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.closePath();
}

export function drawBoxFaces(g, iso, b, c) {
  const P = iso.p;
  const right = [P(b.x1, b.y0, b.z1), P(b.x1, b.y1, b.z1), P(b.x1, b.y1, b.z0), P(b.x1, b.y0, b.z0)];
  const left = [P(b.x0, b.y1, b.z1), P(b.x1, b.y1, b.z1), P(b.x1, b.y1, b.z0), P(b.x0, b.y1, b.z0)];
  const top = topFace(iso, b);
  g.lineWidth = c.lw || 1;
  g.lineJoin = 'round';
  if (b.z1 - b.z0 > 1e-6) {
    polyPath(g, right); g.fillStyle = c.right; g.fill();
    g.strokeStyle = c.edge || c.right; g.stroke();
    polyPath(g, left); g.fillStyle = c.left; g.fill();
    g.strokeStyle = c.edge || c.left; g.stroke();
  }
  polyPath(g, top); g.fillStyle = c.top; g.fill();
  g.strokeStyle = c.topEdge || c.edge || c.top; g.stroke();
  return top;
}

export function shadowOnPlane(b, zr, lx, ly) {
  const pts = [];
  for (const c of boxCorners(b)) {
    const h = c.z - zr;
    if (h < -1e-6) continue;
    pts.push({ x: c.x + lx * h, y: c.y + ly * h });
  }
  const hp = hull(pts.map((q) => ({ x: q.x, y: q.y })));
  return hp;
}

export function fillShadows(g, iso, clipPoly, polys, zr, alpha, fill = null, grow = 0) {
  if (!polys.length) return;
  g.save();
  let clip = clipPoly;
  if (grow > 0) {
    const cx = clipPoly.reduce((a, q) => a + q.x, 0) / clipPoly.length, cy = clipPoly.reduce((a, q) => a + q.y, 0) / clipPoly.length;
    clip = clipPoly.map((q) => { const dx = q.x - cx, dy = q.y - cy, d = Math.hypot(dx, dy) || 1; return { x: q.x + dx / d * grow, y: q.y + dy / d * grow }; });
  }
  polyPath(g, clip); g.clip();
  g.beginPath();
  for (const poly of polys) {
    const sp = poly.map((q) => iso.p(q.x, q.y, zr));
    let area = 0;
    for (let i = 0; i < sp.length; i++) { const a = sp[i], b = sp[(i + 1) % sp.length]; area += a.x * b.y - b.x * a.y; }
    const pts = area < 0 ? sp.slice().reverse() : sp;
    pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.closePath();
  }
  g.fillStyle = fill || `rgba(22,30,44,${alpha})`;
  g.fill('nonzero');
  if (fill) { g.strokeStyle = fill; g.lineWidth = 0.8; g.stroke(); }
  g.restore();
}

export function drawRunner(g, x, y, s = 1) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.ellipse(0, 0, 7.5, 3, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(15,20,30,.30)'; g.fill();
  g.strokeStyle = '#4a5563'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-2.4, -1); g.lineTo(-2.6, -8); g.moveTo(2.4, -1); g.lineTo(2.6, -8); g.stroke();
  g.beginPath();
  g.moveTo(-6, -7); g.quadraticCurveTo(-6.8, -17, 0, -18.5); g.quadraticCurveTo(6.8, -17, 6, -7); g.closePath();
  g.fillStyle = '#f07f2e'; g.fill(); g.strokeStyle = '#7d3a0c'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.arc(0, -23.5, 5.2, 0, Math.PI * 2);
  g.fillStyle = '#ffd9b3'; g.fill(); g.strokeStyle = '#7d3a0c'; g.lineWidth = 1.3; g.stroke();
  g.restore();
}

export function drawFlag(g, x, y, s = 1) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.ellipse(0, 0, 6, 2.4, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(15,20,30,.30)'; g.fill();
  g.strokeStyle = '#3b4652'; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -27); g.stroke();
  g.beginPath(); g.moveTo(1, -27); g.lineTo(15, -22.5); g.lineTo(1, -17.5); g.closePath();
  g.fillStyle = '#e1414f'; g.fill(); g.strokeStyle = '#8f1d27'; g.lineWidth = 1.2; g.stroke();
  g.restore();
}

export function drawGem(g, x, y, s = 1, picked = false) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.ellipse(0, 0, 6.5, 2.6, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(15,20,30,.28)'; g.fill();
  const cy = -12, w = 7.5, h = 9.5;
  if (picked) {
    g.beginPath(); g.arc(0, cy, 14, 0, Math.PI * 2);
    g.strokeStyle = '#1991fa'; g.lineWidth = 3; g.stroke();
  }
  g.beginPath();
  g.moveTo(0, cy - h); g.lineTo(w, cy - 2); g.lineTo(0, cy + h); g.lineTo(-w, cy - 2); g.closePath();
  g.fillStyle = '#2fc7a4'; g.fill(); g.strokeStyle = '#0b6e57'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.moveTo(0, cy - h); g.lineTo(w, cy - 2); g.lineTo(0, cy - 2); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
  g.beginPath(); g.moveTo(0, cy - h); g.lineTo(-w, cy - 2); g.lineTo(0, cy - 2); g.closePath();
  g.fillStyle = 'rgba(6,80,62,.28)'; g.fill();
  g.restore();
}

export function occludedAt(ordered, box, pts) {
  for (const it of ordered) {
    if (it.noOcclude || sepOrder(box, it) !== -1) continue;
    for (const q of pts) if (inConvex(it.hull, q.x, q.y)) return true;
  }
  return false;
}
