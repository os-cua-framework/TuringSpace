export const TAU = Math.PI * 2;
export const R3 = (v) => Math.round(v * 1000) / 1000;
export const SELF = { ring: 0, eight: 1, chain: 2 };

export const RG = Object.freeze({
  W: 7,
  step: 2.6,
  minAngle: 50,
  minSep: 21,
  arcEx: 18,
  clear: 13,
  crossClear: 16,
  selfArc: 40,
  inset: 8,
});

function eightPath(r) {
  const th = r.th, c = Math.cos(th), s = Math.sin(th), out = [];
  const line = (a, b, n) => { for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); };
  const arc = (cx, cy, rad, a0, a1, n) => { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } };
  const c1 = r.r1 / s, c2 = r.r2 / s;
  const T1 = [c1 * c * c, c1 * c * s], T2 = [c1 * c * c, -c1 * c * s];
  const T3 = [-c2 * c * c, c2 * c * s], T4 = [-c2 * c * c, -c2 * c * s];
  line([0, 0], T1, 24); arc(c1, 0, r.r1, Math.PI / 2 + th, -(Math.PI / 2 + th), 90); line(T2, [0, 0], 24);
  line([0, 0], T3, 24); arc(-c2, 0, r.r2, Math.PI / 2 - th, Math.PI * 1.5 + th, 90); line(T4, [0, 0], 24);
  return out;
}
function arcVia(out, cx, cy, rad, a0, a1, via, n) {
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  let sweep = norm(a1 - a0);
  if (norm(via - a0) > sweep) sweep -= TAU;
  for (let k = 0; k < n; k++) { const a = a0 + sweep * k / n; out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
}
function chainPath(r) {
  const { d, th, r1, r2, rm } = r, c = Math.cos(th), s = Math.sin(th), t = Math.tan(th), out = [];
  const line = (a, b, n) => { for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); };
  const ang = (p, q) => Math.atan2(p[1] - q[1], p[0] - q[0]);
  const Pt = [0, d * t], Pb = [0, -d * t];
  const Ct = [0, d * t - rm / c], Cb = [0, -d * t + rm / c];
  const Td = [Pt[0] - rm * t * c, Pt[1] - rm * t * s], Ta = [Pt[0] + rm * t * c, Pt[1] - rm * t * s];
  const TbB = [Pb[0] + rm * t * c, Pb[1] + rm * t * s], TbC = [Pb[0] - rm * t * c, Pb[1] + rm * t * s];
  const e1 = r1 / s, e2 = r2 / s, Cl = [-d - e1, 0], Cr = [d + e2, 0];
  const Tr1 = [d + e2 * c * c, -e2 * c * s], Tr2 = [d + e2 * c * c, e2 * c * s];
  const Tl1 = [-d - e1 * c * c, e1 * c * s], Tl2 = [-d - e1 * c * c, -e1 * c * s];
  arcVia(out, Ct[0], Ct[1], rm, ang(Td, Ct), ang(Ta, Ct), Math.PI / 2, 24);
  line(Ta, Tr1, 40);
  arcVia(out, Cr[0], Cr[1], r2, ang(Tr1, Cr), ang(Tr2, Cr), 0, 70);
  line(Tr2, TbB, 40);
  arcVia(out, Cb[0], Cb[1], rm, ang(TbB, Cb), ang(TbC, Cb), -Math.PI / 2, 24);
  line(TbC, Tl1, 40);
  arcVia(out, Cl[0], Cl[1], r1, ang(Tl1, Cl), ang(Tl2, Cl), Math.PI, 70);
  line(Tl2, Td, 40);
  return out;
}
function rawCurve(r, n) {
  let pts;
  if (r.type === 'eight' || r.type === 'chain') {
    pts = (r.type === 'eight' ? eightPath(r) : chainPath(r)).map(([x, y]) => [x + r.w * Math.sin(y / 9 + r.ph), y + r.w * Math.sin(x / 11 + r.ph * 1.7)]);
  } else {
    pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      let x, y;
      if (r.type === 'ring') {
        let rr = 1;
        for (const h of r.harm) rr += h[1] * Math.sin(h[0] * t + h[2]);
        x = r.R * rr * Math.cos(t) * r.sx; y = r.R * rr * Math.sin(t) * r.sy;
      }
      pts.push([x, y]);
    }
  }
  const cr = Math.cos(r.rot), sr = Math.sin(r.rot);
  return pts.map(([x, y]) => [r.x + x * cr - y * sr, r.y + x * sr + y * cr]);
}

export function ribbonPts(r) {
  const raw = rawCurve(r, 480);
  const n = raw.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = raw[i - 1], b = raw[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n], M = Math.max(24, Math.round(L / RG.step)), out = [];
  let j = 0;
  for (let k = 0; k < M; k++) {
    const s = (k / M) * L;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = raw[j], b = raw[(j + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

export function extent(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
}

function segX(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
  const ang = Math.acos(Math.min(1, Math.abs(rx * sx + ry * sy) / (Math.hypot(rx, ry) * Math.hypot(sx, sy)))) * 180 / Math.PI;
  return { x: a[0] + rx * t, y: a[1] + ry * t, t, u, ang };
}

export function findCrossings(P) {
  const segs = [];
  P.forEach((pts, r) => {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      segs.push({ r, i, p, q, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) });
    }
  });
  segs.sort((u, v) => u.x0 - v.x0);
  const out = [];
  for (let s = 0; s < segs.length; s++) {
    const A = segs[s];
    for (let t = s + 1; t < segs.length && segs[t].x0 <= A.x1; t++) {
      const B = segs[t];
      if (B.y0 > A.y1 || B.y1 < A.y0) continue;
      if (A.r === B.r) {
        const n = P[A.r].length, d = Math.abs(A.i - B.i);
        if (Math.min(d, n - d) <= 1) continue;
      }
      const [U, V] = (A.r < B.r || (A.r === B.r && A.i < B.i)) ? [A, B] : [B, A];
      const X = segX(U.p, U.q, V.p, V.q);
      if (X) out.push({ a: U.r, ia: U.i, ta: X.t, b: V.r, ib: V.i, tb: X.u, x: X.x, y: X.y, ang: X.ang });
    }
  }
  out.sort((u, v) => u.a - v.a || u.ia - v.ia || u.b - v.b || u.ib - v.ib);
  return out;
}

const cyc = (i, j, n) => { const d = Math.abs(i - j); return Math.min(d, n - d); };

export function auditRibbons(P, types, TW, TH) {
  const W2 = TW / 2 - RG.inset, H2 = TH / 2 - RG.inset;
  for (const pts of P) for (const p of pts) if (Math.abs(p[0]) > W2 || Math.abs(p[1]) > H2) return { ok: false, why: 'inset' };
  const X = findCrossings(P);
  const self = P.map(() => 0), pair = new Map();
  for (const c of X) {
    if (c.a === c.b) self[c.a]++;
    else { const k = `${c.a},${c.b}`; pair.set(k, (pair.get(k) || 0) + 1); }
  }
  for (let r = 0; r < P.length; r++) if (self[r] !== SELF[types[r]]) return { ok: false, why: 'self-count' };
  for (const v of pair.values()) if (v % 2) return { ok: false, why: 'odd-pair' };
  for (const c of X) if (c.ang < RG.minAngle || c.ang > 180 - RG.minAngle) return { ok: false, why: 'angle' };
  for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) {
    if (Math.hypot(X[i].x - X[j].x, X[i].y - X[j].y) < RG.minSep) return { ok: false, why: 'sep' };
  }
  const on = P.map(() => []);
  X.forEach((c, ci) => { on[c.a].push({ i: c.ia + c.ta, ci }); on[c.b].push({ i: c.ib + c.tb, ci }); });
  const ex = RG.arcEx / RG.step, sepIdx = RG.minSep / RG.step;
  for (let r = 0; r < P.length; r++) {
    const n = P[r].length, L = on[r].map((o) => o.i).sort((u, v) => u - v);
    for (let k = 0; k < L.length; k++) {
      const d = k + 1 < L.length ? L[k + 1] - L[k] : L[0] + n - L[k];
      if (L.length > 1 && d < sepIdx) return { ok: false, why: 'arc-sep' };
    }
  }
  const nearSet = P.map((pts) => new Array(pts.length).fill(null).map(() => []));
  X.forEach((c, ci) => {
    for (const [r, s] of [[c.a, c.ia + c.ta], [c.b, c.ib + c.tb]]) {
      const n = P[r].length;
      for (let d = -Math.ceil(ex); d <= Math.ceil(ex); d++) {
        const i = ((Math.round(s) + d) % n + n) % n;
        if (Math.abs(i - s) <= ex || n - Math.abs(i - s) <= ex) nearSet[r][i].push(ci);
      }
    }
  });
  const cl2 = RG.clear * RG.clear, selfIdx = RG.selfArc / RG.step;
  const flat = [];
  P.forEach((pts, r) => pts.forEach((p, i) => flat.push({ r, i, x: p[0], y: p[1] })));
  flat.sort((u, v) => u.x - v.x);
  for (let s = 0; s < flat.length; s++) {
    const A = flat[s];
    for (let t = s + 1; t < flat.length && flat[t].x - A.x < RG.clear; t++) {
      const B = flat[t];
      const dy = B.y - A.y;
      if (dy * dy + (B.x - A.x) * (B.x - A.x) >= cl2) continue;
      if (A.r === B.r && cyc(A.i, B.i, P[A.r].length) <= selfIdx) continue;
      const na = nearSet[A.r][A.i], nb = nearSet[B.r][B.i];
      if (na.some((c) => nb.includes(c))) continue;
      return { ok: false, why: 'clear' };
    }
  }
  const cc2 = RG.crossClear * RG.crossClear;
  for (let ci = 0; ci < X.length; ci++) {
    const c = X[ci];
    for (let r = 0; r < P.length; r++) {
      const pts = P[r];
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i][0] - c.x, dy = pts[i][1] - c.y;
        if (dx * dx + dy * dy >= cc2) continue;
        if (nearSet[r][i].includes(ci)) continue;
        return { ok: false, why: 'cross-clear' };
      }
    }
  }
  return { ok: true, X };
}

export function mutualCrossings(A, B) {
  const out = [];
  const nb = B.length, bx0 = [], bx1 = [], by0 = [], by1 = [];
  for (let j = 0; j < nb; j++) { const p = B[j], q = B[(j + 1) % nb]; bx0.push(Math.min(p[0], q[0])); bx1.push(Math.max(p[0], q[0])); by0.push(Math.min(p[1], q[1])); by1.push(Math.max(p[1], q[1])); }
  for (let i = 0; i < A.length; i++) {
    const p = A[i], q = A[(i + 1) % A.length];
    const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
    for (let j = 0; j < nb; j++) {
      if (bx0[j] > x1 || bx1[j] < x0 || by0[j] > y1 || by1[j] < y0) continue;
      const X = segX(p, q, B[j], B[(j + 1) % nb]);
      if (X) out.push({ x: X.x, y: X.y, ang: X.ang });
    }
  }
  return out;
}
