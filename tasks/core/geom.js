export const TAU = Math.PI * 2;
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

export function normDeg(d) {
  d = ((d % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function rotPt(p, deg, c = { x: 0, y: 0 }) {
  const a = deg2rad(deg), cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function xformPoly(poly, pos, deg = 0) {
  return poly.map((p) => {
    const q = deg ? rotPt(p, deg) : p;
    return { x: q.x + pos.x, y: q.y + pos.y };
  });
}

export function polyBounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function ptInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function ptInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function polyInPoly(inner, outer) {
  return inner.every((p) => ptInPoly(p, outer));
}

export function convexOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const nx = p2.y - p1.y, ny = p1.x - p2.x;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of a) { const d = p.x * nx + p.y * ny; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const p of b) { const d = p.x * nx + p.y * ny; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

export function rectOverlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function visibleFraction(target, covers, step = 4) {
  let total = 0, vis = 0;
  for (let x = target.x + step / 2; x < target.x + target.w; x += step) {
    for (let y = target.y + step / 2; y < target.y + target.h; y += step) {
      total++;
      let covered = false;
      for (const c of covers) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { covered = true; break; }
      }
      if (!covered) vis++;
    }
  }
  return total ? vis / total : 1;
}

export function visibleFractionPoly(targetPoly, coverPolys, step = 4) {
  const b = polyBounds(targetPoly);
  let total = 0, vis = 0;
  for (let x = b.x0 + step / 2; x < b.x1; x += step) {
    for (let y = b.y0 + step / 2; y < b.y1; y += step) {
      const p = { x, y };
      if (!ptInPoly(p, targetPoly)) continue;
      total++;
      if (!coverPolys.some((c) => ptInPoly(p, c))) vis++;
    }
  }
  return total ? vis / total : 1;
}

export function rectPoly(x, y, w, h) {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

export function centeredRect(w, h) {
  return [
    { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
  ];
}
