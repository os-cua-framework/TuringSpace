function centred(P) {
  const n = P.length;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += P[i][0]; y += P[i][1]; }
  x /= n; y /= n;
  const d = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { d[2 * i] = P[i][0] - x; d[2 * i + 1] = P[i][1] - y; }
  return { c: [x, y], d, n };
}

function simErr(a, b) {
  let sd = 0, sc = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.n; i++) {
    const ax = a.d[2 * i], ay = a.d[2 * i + 1], bx = b.d[2 * i], by = b.d[2 * i + 1];
    sd += ax * bx + ay * by; sc += ax * by - ay * bx; aa += ax * ax + ay * ay; bb += bx * bx + by * by;
  }
  return bb - (sd * sd + sc * sc) / aa;
}
function stretchAt(a, b, th) {
  const c = Math.cos(th), s = Math.sin(th);
  let uxbx = 0, uxux = 0, uyby = 0, uyuy = 0, bb = 0;
  for (let i = 0; i < a.n; i++) {
    const ax = a.d[2 * i], ay = a.d[2 * i + 1];
    const ux = c * ax - s * ay, uy = s * ax + c * ay, bx = b.d[2 * i], by = b.d[2 * i + 1];
    uxbx += ux * bx; uxux += ux * ux; uyby += uy * by; uyuy += uy * uy; bb += bx * bx + by * by;
  }
  const gx = uxbx > 0 ? uxbx * uxbx / uxux : 0, gy = uyby > 0 ? uyby * uyby / uyuy : 0;
  return bb - gx - gy;
}
function stretchErr(a, b) {
  const K = 120;
  let best = Infinity, bk = 0;
  for (let k = 0; k < K; k++) { const e = stretchAt(a, b, k / K * 2 * Math.PI); if (e < best) { best = e; bk = k; } }
  let lo = (bk - 1) / K * 2 * Math.PI, hi = (bk + 1) / K * 2 * Math.PI;
  for (let it = 0; it < 28; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (stretchAt(a, b, m1) < stretchAt(a, b, m2)) hi = m2; else lo = m1;
  }
  return Math.min(best, stretchAt(a, b, (lo + hi) / 2));
}
function affineErr(a, b) {
  let sxx = 0, sxy = 0, syy = 0, uxv = 0, uyv = 0, vxv = 0, vyv = 0, bb = 0;
  for (let i = 0; i < a.n; i++) {
    const x = a.d[2 * i], y = a.d[2 * i + 1], u = b.d[2 * i], v = b.d[2 * i + 1];
    sxx += x * x; sxy += x * y; syy += y * y; uxv += u * x; uyv += u * y; vxv += v * x; vyv += v * y; bb += u * u + v * v;
  }
  const det = sxx * syy - sxy * sxy;
  const m00 = (uxv * syy - uyv * sxy) / det, m01 = (uyv * sxx - uxv * sxy) / det;
  const m10 = (vxv * syy - vyv * sxy) / det, m11 = (vyv * sxx - vxv * sxy) / det;
  if (m00 * m11 - m01 * m10 <= 0) return Infinity;
  return bb - (m00 * uxv + m01 * uyv + m10 * vxv + m11 * vyv);
}
const ERR = { sim: simErr, stretch: stretchErr, affine: affineErr };

export function relabellings(n, mirror) {
  const out = [];
  for (let j = 0; j < n; j++) out.push({ rev: false, j });
  if (mirror) for (let j = 0; j < n; j++) out.push({ rev: true, j });
  return out;
}
export const sigma = (L, i, n) => (L.rev ? ((L.j - i) % n + n) % n : (i + L.j) % n);

export function read2d(kind, A, B, mirror) {
  const n = A.length, f = ERR[kind];
  const aFwd = centred(A), aRev = centred(A.map((p) => [-p[0], p[1]]));
  let best = null, second = Infinity;
  const perm = new Array(n);
  for (const L of relabellings(n, mirror)) {
    for (let i = 0; i < n; i++) perm[i] = B[sigma(L, i, n)];
    const b = centred(perm);
    const e = f(L.rev ? aRev : aFwd, b);
    if (!best || e < best.err - 1e-9) { if (best) second = Math.min(second, best.err); best = { rev: L.rev, j: L.j, err: e }; }
    else second = Math.min(second, e);
  }
  best.second = second;
  return best;
}

export function turns(P) {
  const n = P.length;
  return P.map((b, i) => { const a = P[(i + n - 1) % n], c = P[(i + 1) % n]; return Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])); });
}
export function symmetries(P, mirror) {
  const t = turns(P), n = P.length;
  return relabellings(n, mirror).filter((L) => t.every((v, i) => t[sigma(L, i, n)] === v));
}
export function copyMargin(P) {
  const n = P.length, a = centred(P), aRev = centred(P.map((p) => [-p[0], p[1]]));
  let R = 0;
  for (let i = 0; i < n; i++) R += a.d[2 * i] ** 2 + a.d[2 * i + 1] ** 2;
  R = Math.sqrt(R / n);
  let m = Infinity;
  for (const L of symmetries(P, true)) {
    if (!L.rev && L.j === 0) continue;
    const perm = P.map((_, i) => P[sigma(L, i, n)]);
    m = Math.min(m, Math.sqrt(Math.max(0, simErr(L.rev ? aRev : a, centred(perm))) / n) / R);
  }
  return m;
}

export function relabelErr(kind, A, B, L) {
  const n = A.length;
  const perm = A.map((_, i) => B[sigma(L, i, n)]);
  return ERR[kind](centred(L.rev ? A.map((p) => [-p[0], p[1]]) : A), centred(perm));
}
