export const SOLIDS = Object.freeze({
  cyl: { R: 1.0, H: 2.8 },
  cone: { R: 1.15, H: 2.5 },
  prism: { R: 1.0, H: 2.3 },
  block: { R: 0.42, H: 2.6 },
});
export const EXT_SOLIDS = Object.freeze({ cube: { R: 1.0, H: 2.0 }, pyr: { R: 1.0, H: 2.3 }, hex: { R: 1.05, H: 3.0 }, tube: { R: 1.0, H: 2.6, r: 0.55 } });
export function hexPlanes(solid) {
  const a0 = (solid.yaw || 0) * Math.PI / 180, ap = solid.R * Math.cos(Math.PI / 6), out = [];
  for (let k = 0; k < 6; k++) { const a = a0 + Math.PI / 6 + k * Math.PI / 3; out.push({ n: [Math.cos(a), 0, Math.sin(a)], d: ap }); }
  out.push({ n: [0, 1, 0], d: solid.H }, { n: [0, -1, 0], d: 0 });
  return out;
}
const PYR_PLANES = (R, H) => {
  const k = R / H, l = Math.hypot(1, k);
  return [{ n: [1 / l, k / l, 0], d: R / l }, { n: [-1 / l, k / l, 0], d: R / l }, { n: [0, k / l, 1 / l], d: R / l }, { n: [0, k / l, -1 / l], d: R / l }, { n: [0, -1, 0], d: 0 }];
};
export function convexSection(solid, P) {
  const planes = solid.kind === 'pyr' ? PYR_PLANES(solid.R, solid.H) : solid.kind === 'hex' ? hexPlanes(solid) : BLOCK_PLANES(solid.H);
  const B = 8;
  let poly = [[-B, -B], [B, -B], [B, B], [-B, B]].map(([a, b]) => add(P.p, add(mul(P.u, a), mul(P.v, b))));
  for (const pl of planes) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], C = poly[(i + 1) % poly.length], fa = dot(pl.n, A) - pl.d, fc = dot(pl.n, C) - pl.d;
      if (fa <= 0) out.push(A);
      if ((fa <= 0) !== (fc <= 0)) { const t = fa / (fa - fc); out.push(add(A, mul(sub(C, A), t))); }
    }
    poly = out;
    if (poly.length < 3) return [];
  }
  const res = [];
  for (const q of poly) if (!res.length || Math.hypot(...sub(q, res[res.length - 1])) > 1e-4) res.push(q);
  while (res.length > 1 && Math.hypot(...sub(res[0], res[res.length - 1])) <= 1e-4) res.pop();
  return res;
}

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function prismTri(solid) {
  const R = solid.R, yaw = (solid.yaw || 0) * Math.PI / 180;
  return [0, 1, 2].map((k) => { const a = yaw + k * 2 * Math.PI / 3; return [R * Math.cos(a), R * Math.sin(a)]; });
}
const PLANE_CACHE = new WeakMap();
function prismPlanes(solid) {
  const hit = PLANE_CACHE.get(solid);
  if (hit && hit.yaw === solid.yaw) return hit.planes;
  const planes = buildPrismPlanes(solid);
  PLANE_CACHE.set(solid, { yaw: solid.yaw, planes });
  return planes;
}
function buildPrismPlanes(solid) {
  const T = prismTri(solid), out = [];
  for (let k = 0; k < 3; k++) {
    const a = T[k], b = T[(k + 1) % 3];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]);
    const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    if (nx * (0 - a[0]) + nz * (0 - a[1]) > 0) { nx = -nx; nz = -nz; }
    out.push({ n: [nx, 0, nz], d: nx * a[0] + nz * a[1] });
  }
  out.push({ n: [0, 1, 0], d: solid.H }, { n: [0, -1, 0], d: 0 });
  return out;
}
const BLOCK_PLANES = (H) => [
  { n: [1, 0, 0], d: 1 }, { n: [-1, 0, 0], d: 1 }, { n: [0, 0, 1], d: 1 }, { n: [0, 0, -1], d: 1 },
  { n: [0, 1, 0], d: H }, { n: [0, -1, 0], d: 0 },
];

export function inside(solid, p) {
  const [x, y, z] = p;
  if (y < 0 || y > solid.H) return false;
  switch (solid.kind) {
    case 'cyl': return x * x + z * z <= solid.R * solid.R;
    case 'cone': { const r = solid.R * (1 - y / solid.H); return x * x + z * z <= r * r; }
    case 'prism': return prismPlanes(solid).every((pl) => dot(pl.n, p) <= pl.d + 1e-12);
    case 'block': return Math.abs(x) <= 1 && Math.abs(z) <= 1 && x * x + z * z >= solid.R * solid.R;
    case 'cube': return Math.abs(x) <= 1 && Math.abs(z) <= 1;
    case 'pyr': { const r = solid.R * (1 - y / solid.H); return Math.abs(x) <= r && Math.abs(z) <= r; }
    case 'hex': return hexPlanes(solid).every((pl) => dot(pl.n, p) <= pl.d + 1e-12);
    case 'tube': { const q = x * x + z * z; return q <= solid.R * solid.R && q >= solid.r * solid.r; }
    default: return false;
  }
}
export function insideOuter(solid, p) {
  if (solid.kind === 'tube') return p[1] >= 0 && p[1] <= solid.H && p[0] * p[0] + p[2] * p[2] <= solid.R * solid.R;
  if (solid.kind !== 'block') return inside(solid, p);
  return p[1] >= 0 && p[1] <= solid.H && Math.abs(p[0]) <= 1 && Math.abs(p[2]) <= 1;
}

export const planePoint = (P, s, t) => add(P.p, add(mul(P.u, s), mul(P.v, t)));

export function polarSection(test, c, K = 96, rMax = 6) {
  const pts = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let lo = 0, hi = rMax;
    if (test(c[0] + ca * hi, c[1] + sa * hi)) { pts.push([c[0] + ca * hi, c[1] + sa * hi]); continue; }
    for (let it = 0; it < 32; it++) { const m = (lo + hi) / 2; if (test(c[0] + ca * m, c[1] + sa * m)) lo = m; else hi = m; }
    pts.push([c[0] + ca * lo, c[1] + sa * lo]);
  }
  return pts;
}

export function innerPoint(solid, P, test) {
  let sx = 0, sy = 0, n = 0;
  for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
    const s = i * 0.125, t = j * 0.125;
    if (test(s, t)) { sx += s; sy += t; n++; }
  }
  return n ? [sx / n, sy / n, n * 0.015625] : null;
}

export function section(solid, P) {
  const outerTest = (s, t) => insideOuter(solid, planePoint(P, s, t));
  const c = innerPoint(solid, P, outerTest);
  if (!c) return null;
  const outer = polarSection(outerTest, c);
  let hole = null;
  if (solid.kind === 'block' || solid.kind === 'tube') {
    const hr = solid.kind === 'tube' ? solid.r : solid.R;
    const holeTest = (s, t) => { const q = planePoint(P, s, t); return insideOuter(solid, q) && q[0] * q[0] + q[2] * q[2] < hr * hr; };
    const hc = innerPoint(solid, P, holeTest);
    if (hc) hole = polarSection(holeTest, hc);
  }
  return { outer, hole, c };
}

export function bbox(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

export function widths(pts, K = 90) {
  let mn = Infinity, mx = 0;
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of pts) { const d = x * ca + y * sa; if (d < lo) lo = d; if (d > hi) hi = d; }
    mn = Math.min(mn, hi - lo); mx = Math.max(mx, hi - lo);
  }
  return [mn, mx];
}

export function yRange(solid, P, outer) {
  let lo = Infinity, hi = -Infinity;
  for (const [s, t] of outer) { const y = planePoint(P, s, t)[1]; if (y < lo) lo = y; if (y > hi) hi = y; }
  return [lo, hi];
}

export function hitSolid(solid, o, d) {
  const { R, H } = solid;
  let best = null;
  const take = (l, n, face) => { if (l >= 0 && (!best || l < best.l)) best = { l, n, face }; };
  if (solid.kind === 'tube') {
    const A = d[0] * d[0] + d[2] * d[2], B = 2 * (o[0] * d[0] + o[2] * d[2]), oo = o[0] * o[0] + o[2] * o[2];
    for (const [rad, sg, face] of [[R, 1, 1], [solid.r, -1, 30]]) {
      if (A < 1e-12) continue;
      const D = B * B - 4 * A * (oo - rad * rad);
      if (D < 0) continue;
      const sq = Math.sqrt(D);
      for (const l of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
        const y = o[1] + l * d[1];
        if (y >= 0 && y <= H) { const x = o[0] + l * d[0], z = o[2] + l * d[2]; take(l, norm([sg * x, 0, sg * z]), face); }
      }
    }
    for (const [yc, ny, face] of [[H, 1, 2], [0, -1, 3]]) {
      if (Math.abs(d[1]) < 1e-12) continue;
      const l = (yc - o[1]) / d[1], x = o[0] + l * d[0], z = o[2] + l * d[2], q = x * x + z * z;
      if (q <= R * R && q >= solid.r * solid.r) take(l, [0, ny, 0], face);
    }
    return best;
  }
  if (solid.kind === 'cyl' || solid.kind === 'cone') {
    const k = solid.kind === 'cone' ? R / H : 0;
    const A = d[0] * d[0] + d[2] * d[2] - k * k * d[1] * d[1];
    const B = 2 * (o[0] * d[0] + o[2] * d[2] + k * (R - k * o[1]) * d[1]);
    const C = o[0] * o[0] + o[2] * o[2] - (R - k * o[1]) * (R - k * o[1]);
    if (Math.abs(A) > 1e-12) {
      const D = B * B - 4 * A * C;
      if (D >= 0) {
        const sq = Math.sqrt(D);
        for (const l of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
          const y = o[1] + l * d[1];
          if (y >= 0 && y <= H) {
            const x = o[0] + l * d[0], z = o[2] + l * d[2];
            take(l, norm([x, k * (R - k * y), z]), 1);
          }
        }
      }
    }
    for (const [yc, ny, face] of solid.kind === 'cyl' ? [[H, 1, 2], [0, -1, 3]] : [[0, -1, 3]]) {
      if (Math.abs(d[1]) < 1e-12) continue;
      const l = (yc - o[1]) / d[1], x = o[0] + l * d[0], z = o[2] + l * d[2];
      if (x * x + z * z <= R * R) take(l, [0, ny, 0], face);
    }
    return best;
  }
  const planes = solid.kind === 'prism' ? prismPlanes(solid) : solid.kind === 'pyr' ? PYR_PLANES(R, H) : solid.kind === 'hex' ? hexPlanes(solid) : BLOCK_PLANES(H);
  let lin = -Infinity, lout = Infinity, nin = null, fin = -1;
  for (let i = 0; i < planes.length; i++) {
    const pl = planes[i], den = dot(pl.n, d), num = pl.d - dot(pl.n, o);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const l = num / den;
    if (den < 0) { if (l > lin) { lin = l; nin = pl.n; fin = 10 + i; } } else if (l < lout) lout = l;
  }
  if (lin > lout || lout < 0 || !nin) return null;
  if (solid.kind === 'prism' || solid.kind === 'cube' || solid.kind === 'pyr' || solid.kind === 'hex') return lin >= 0 ? { l: lin, n: nin, face: fin } : null;
  const pin = add(o, mul(d, lin));
  if (pin[0] * pin[0] + pin[2] * pin[2] >= R * R) return { l: lin, n: nin, face: fin };
  const A = d[0] * d[0] + d[2] * d[2];
  if (A < 1e-12) return null;
  const B = 2 * (o[0] * d[0] + o[2] * d[2]), C = o[0] * o[0] + o[2] * o[2] - R * R;
  const D = B * B - 4 * A * C;
  if (D < 0) return null;
  const l2 = (-B + Math.sqrt(D)) / (2 * A);
  if (l2 > lout) return null;
  const q = add(o, mul(d, l2));
  return { l: l2, n: norm([-q[0], 0, -q[2]]), face: 30 };
}
