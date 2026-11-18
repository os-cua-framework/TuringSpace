const SPH = 0, BOX = 1, CYL = 2, FRU = 3, CAP = 4, ELL = 5, OBX = 6, CONVEX = 7, GCYL = 8, EPS = 1e-4, NEAR = 0.05;
const SEG = 20, RING = 10, GROW = 1 / Math.cos(Math.PI / SEG);

function tess(s) {
  const T = [];
  const tri = (a, b, c) => T.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const ellipsoid = (c, ax, h, g) => {
    const P = [];
    for (let i = 0; i <= RING; i++) {
      const th = Math.PI * i / RING, sy = Math.cos(th), sr = Math.sin(th), row = [];
      for (let j = 0; j < SEG; j++) {
        const ph = 2 * Math.PI * j / SEG, lx = sr * Math.cos(ph) * g * g, ly = sy * g, lz = sr * Math.sin(ph) * g * g;
        row.push([0, 1, 2].map((k) => c[k] + ax[0][k] * lx * h[0] + ax[1][k] * ly * h[1] + ax[2][k] * lz * h[2]));
      }
      P.push(row);
    }
    for (let i = 0; i < RING; i++) for (let j = 0; j < SEG; j++) quad(P[i][j], P[i][(j + 1) % SEG], P[i + 1][(j + 1) % SEG], P[i + 1][j]);
  };
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], gS = 1 / Math.cos(Math.PI / RING);
  const frustum = (cx, cz, y0, y1, r0, r1, ax) => {
    const B = [], Tp = [];
    for (let j = 0; j < SEG; j++) {
      const ph = 2 * Math.PI * j / SEG, c = Math.cos(ph) * GROW, sn = Math.sin(ph) * GROW;
      if (ax) { const [u, a, v, o, len] = ax; B.push([0, 1, 2].map((k) => o[k] + (u[k] * c + v[k] * sn) * r0)); Tp.push([0, 1, 2].map((k) => o[k] + a[k] * len + (u[k] * c + v[k] * sn) * r1)); }
      else { B.push([cx + c * r0, y0, cz + sn * r0]); Tp.push([cx + c * r1, y1, cz + sn * r1]); }
    }
    const cb = ax ? ax[3] : [cx, y0, cz], ct = ax ? [0, 1, 2].map((k) => ax[3][k] + ax[1][k] * ax[4]) : [cx, y1, cz];
    for (let j = 0; j < SEG; j++) { const n = (j + 1) % SEG; quad(B[j], B[n], Tp[n], Tp[j]); tri(cb, B[n], B[j]); tri(ct, Tp[j], Tp[n]); }
  };
  const boxCorners = (c, ax, h) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1, sz = i & 4 ? 1 : -1;
    return [0, 1, 2].map((k) => c[k] + ax[0][k] * sx * h[0] + ax[1][k] * sy * h[1] + ax[2][k] * sz * h[2]);
  });
  const boxFaces = (P) => { quad(P[0], P[1], P[3], P[2]); quad(P[4], P[6], P[7], P[5]); quad(P[0], P[4], P[5], P[1]); quad(P[2], P[3], P[7], P[6]); quad(P[0], P[2], P[6], P[4]); quad(P[1], P[5], P[7], P[3]); };
  switch (s.k) {
    case SPH: ellipsoid([s.cx, s.cy, s.cz], I3, [s.r, s.r, s.r], gS); break;
    case ELL: ellipsoid(s.c, s.ax, s.h, gS); break;
    case BOX: { const g = 1 + 1e-3; boxFaces(boxCorners([s.cx, s.cy, s.cz], [[s.ca, 0, -s.sa], [0, 1, 0], [s.sa, 0, s.ca]], [s.hx * g, s.hy * g, s.hz * g])); break; }
    case OBX: { const g = 1 + 1e-3; boxFaces(boxCorners(s.c, s.ax, [s.h[0] * g, s.h[1] * g, s.h[2] * g])); break; }
    case CYL: frustum(s.cx, s.cz, s.y0, s.y1, s.r, s.r); break;
    case FRU: frustum(s.cx, s.cz, s.y0, s.y1, s.r0, s.r1); break;
    case CAP: case GCYL: {
      const a = s.a, b = s.b, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1e-9, A = d.map((v) => v / len);
      let u = Math.abs(A[1]) < 0.9 ? [A[2], 0, -A[0]] : [0, -A[2], A[1]]; const ul = Math.hypot(u[0], u[1], u[2]); u = u.map((v) => v / ul);
      const v = [A[1] * u[2] - A[2] * u[1], A[2] * u[0] - A[0] * u[2], A[0] * u[1] - A[1] * u[0]];
      frustum(0, 0, 0, 0, s.r, s.r, [u, A, v, a, len]);
      if (s.k === CAP) { ellipsoid(a, I3, [s.r, s.r, s.r], gS); ellipsoid(b, I3, [s.r, s.r, s.r], gS); }
      break;
    }
    case CONVEX: {
      const P = s.planes, bb = s.bb, R = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) + 1, cen = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
      for (let i = 0; i < P.length; i++) {
        const n = P[i], dd = n[3] - (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2]), o = [cen[0] + n[0] * dd, cen[1] + n[1] * dd, cen[2] + n[2] * dd];
        let u = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [0, -n[2], n[1]]; const ul = Math.hypot(u[0], u[1], u[2]); u = u.map((x) => x / ul);
        const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        let poly = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b2]) => [0, 1, 2].map((k) => o[k] + (u[k] * a + v[k] * b2) * R));
        for (let j = 0; j < P.length && poly.length; j++) {
          if (j === i) continue;
          const m = P[j], f = (p) => m[0] * p[0] + m[1] * p[1] + m[2] * p[2] - m[3] - 1e-6, out = [];
          for (let q = 0; q < poly.length; q++) {
            const A = poly[q], B = poly[(q + 1) % poly.length], fa = f(A), fb = f(B);
            if (fa <= 0) out.push(A);
            if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
          }
          poly = out;
        }
        for (let q = 1; q + 1 < poly.length; q++) tri(poly[0], poly[q], poly[q + 1]);
      }
      break;
    }
    default: break;
  }
  return T;
}
const MESH = new WeakMap();
const meshOf = (s, X) => { let m = MESH.get(s); if (!m) { m = new Float64Array(tess(X?.norm ? X.norm(s) : s)); MESH.set(s, m); } return m; };

function fillTri(ax, ay, aw, bx, by, bw, cx, cy, cw, W, H, zb, sb, id) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (!(Math.abs(area) > 1e-12)) return;
  const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
  const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), y1 = Math.min(H - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
  if (x0 > x1 || y0 > y1) return;
  const inv = 1 / area, d0 = (by - cy) * inv, d1 = (cy - ay) * inv, dz = d0 * (aw - cw) + d1 * (bw - cw);
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5, px = x0 + 0.5;
    let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
    let z = w0 * aw + w1 * bw + (1 - w0 - w1) * cw, i = y * W + x0;
    for (let x = x0; x <= x1; x++, w0 += d0, w1 += d1, z += dz, i++) {
      if (w0 < -1e-9 || w1 < -1e-9 || w0 + w1 > 1 + 1e-9) continue;
      if (z > zb[i]) { zb[i] = z; sb[i] = id; }
    }
  }
}
function drawMesh(M, toS, W, H, zb, sb, id, near) {
  for (let i = 0; i < M.length; i += 9) {
    const P = [[M[i], M[i + 1], M[i + 2]], [M[i + 3], M[i + 4], M[i + 5]], [M[i + 6], M[i + 7], M[i + 8]]];
    let poly = P;
    if (near) {
      const d = P.map(near), ok = d.map((v) => v > NEAR);
      if (!ok[0] && !ok[1] && !ok[2]) continue;
      if (!(ok[0] && ok[1] && ok[2])) {
        poly = [];
        for (let k = 0; k < 3; k++) {
          const A = P[k], B = P[(k + 1) % 3], da = d[k], db = d[(k + 1) % 3];
          if (da > NEAR) poly.push(A);
          if ((da > NEAR) !== (db > NEAR)) { const t = (da - NEAR) / (da - db); poly.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
        }
      }
    }
    const S = poly.map((p) => toS(p[0], p[1], p[2]));
    for (let k = 1; k + 1 < S.length; k++) fillTri(S[0][0], S[0][1], S[0][2], S[k][0], S[k][1], S[k][2], S[k + 1][0], S[k + 1][1], S[k + 1][2], W, H, zb, sb, id);
  }
}

const SMN = 1024;
function shadowMap(sc, shapes, X) {
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, cam = sc.cam, e = cam.eye;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const near = shapes.filter((s) => Math.hypot(s.bs[0] - e[0], s.bs[1] - e[1], s.bs[2] - e[2]) - s.bs[3] < 150);
  for (const s of near) { const b = s.bb; for (let i = 0; i < 8; i++) { const p = [b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]], u = p[0] * T1[0] + p[1] * T1[1] + p[2] * T1[2], v = p[0] * T2[0] + p[1] * T2[1] + p[2] * T2[2]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } }
  if (!(u1 > u0)) return null;
  const F = cam.F, tc = F[1] < -1e-3 ? Math.min(60, (e[1] - (sc.env.floorY ?? 0)) / -F[1]) : 30, c = [e[0] + F[0] * tc, e[1] + F[1] * tc, e[2] + F[2] * tc];
  const cu = c[0] * T1[0] + c[1] * T1[1] + c[2] * T1[2], cv = c[0] * T2[0] + c[1] * T2[1] + c[2] * T2[2];
  u0 = Math.max(u0, cu - 80); u1 = Math.min(u1, cu + 80); v0 = Math.max(v0, cv - 80); v1 = Math.min(v1, cv + 80);
  const span = Math.pow(2, Math.ceil(4 * Math.log2(Math.max(u1 - u0, v1 - v0, 1) * 1.25)) / 4), tx = span / SMN;
  const U0 = (Math.floor(((u0 + u1) / 2) / (tx * 64)) * 64 - SMN / 2) * tx, V0 = (Math.floor(((v0 + v1) / 2) / (tx * 64)) * 64 - SMN / 2) * tx, sk = SMN / span;
  const zb = new Float32Array(SMN * SMN).fill(-Infinity), sb = new Int32Array(SMN * SMN);
  const toS = (x, y, z) => [(x * T1[0] + y * T1[1] + z * T1[2] - U0) * sk, (x * T2[0] + y * T2[1] + z * T2[2] - V0) * sk, x * L[0] + y * L[1] + z * L[2]];
  for (const s of near) drawMesh(meshOf(s, X), toS, SMN, SMN, zb, sb, 0, null);
  return { zb, U0, V0, sk, texel: 1 / sk };
}
function lit(SM, sc, x, y, z, nx, ny, nz) {
  if (!SM) return 1;
  const L = sc.Ld, T1 = sc.T1, T2 = sc.T2, off = SM.texel * 1.5 + 0.01;
  x += nx * off; y += ny * off; z += nz * off;
  const u = (x * T1[0] + y * T1[1] + z * T1[2] - SM.U0) * SM.sk - 0.5, v = (x * T2[0] + y * T2[1] + z * T2[2] - SM.V0) * SM.sk - 0.5;
  const d = x * L[0] + y * L[1] + z * L[2] + SM.texel * 1.5 + 0.02;
  let n = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = Math.round(u) + i, b = Math.round(v) + j;
    if (a < 0 || b < 0 || a >= SMN || b >= SMN) { n++; continue; }
    if (!(SM.zb[b * SMN + a] > d)) n++;
  }
  return n / 9;
}

const SMAPS = new WeakMap();
const NRM = new Float64Array(3), COL = new Float64Array(3), BASE = new Float64Array(3), TMP = new Float64Array(3);
function samples(sc, k, X0s, Y0s, ws, hs, X) {
  const cam = sc.cam, e = cam.eye, F = cam.F, R = cam.R, U = cam.U, f = cam.f, env = sc.env, fy = env.floorY ?? 0;
  const shapes = sc.opaque, n = ws * hs;
  const zb = new Float32Array(n), sb = new Int32Array(n).fill(-1);
  const toS = (x, y, z) => {
    const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * F[0] + dy * F[1] + dz * F[2];
    return [(cam.cx + f * (dx * R[0] + dy * R[1] + dz * R[2]) / zc) * k - X0s, (cam.cy - f * (dx * U[0] + dy * U[1] + dz * U[2]) / zc) * k - Y0s, 1 / zc];
  };
  const depth = (p) => (p[0] - e[0]) * F[0] + (p[1] - e[1]) * F[1] + (p[2] - e[2]) * F[2];
  const around = [];
  shapes.forEach((s, i) => {
    const bb = s.bb;
    if (e[0] >= bb[0] && e[0] <= bb[3] && e[1] >= bb[1] && e[1] <= bb[4] && e[2] >= bb[2] && e[2] <= bb[5]) { around.push(i); return; }
    const b = s.bs, zc = (b[0] - e[0]) * F[0] + (b[1] - e[1]) * F[1] + (b[2] - e[2]) * F[2];
    if (zc + b[3] < NEAR) return;
    if (zc - b[3] > NEAR) {
      const [x, y] = toS(b[0], b[1], b[2]), r = b[3] * f * k / (zc - b[3]) + 2;
      if (x + r < 0 || y + r < 0 || x - r > ws || y - r > hs) return;
    }
    drawMesh(meshOf(s, X), toS, ws, hs, zb, sb, i, depth);
  });
  let SMs = SMAPS.get(sc);
  if (!SMs) { SMs = [shadowMap(sc, shapes, X), sc.proxyGroups?.length ? shadowMap(sc, sc.proxyGroups.map((g) => g.opaque[0]).concat(shapes), X) : null]; SMAPS.set(sc, SMs); }
  const [SM, SMP] = SMs;
  const rgb = new Float32Array(n * 3), id = new Int16Array(n).fill(-1);
  for (let sy = 0; sy < hs; sy++) for (let sx = 0; sx < ws; sx++) {
    const i = sy * ws + sx, px = X0s + sx, py = Y0s + sy, bx = (px + 0.5) / k, by = (py + 0.5) / k;
    const a = bx - cam.cx, b = cam.cy - by;
    let dx = F[0] * f + R[0] * a + U[0] * b, dy = F[1] * f + U[1] * b, dz = F[2] * f + R[2] * a + U[2] * b;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
    let s = null, t = Infinity, nx = 0, ny = 0, nz = 0;
    const tryS = (j) => { if (j < 0) return; const q = shapes[j], tt = X.hitN(q, e[0], e[1], e[2], dx, dy, dz, NRM); if (tt < t) { t = tt; s = q; nx = NRM[0]; ny = NRM[1]; nz = NRM[2]; } };
    const j0 = sb[i]; tryS(j0);
    let j1 = -1, j2 = -1, j3 = -1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const xx = sx + ox, yy = sy + oy; if (xx < 0 || yy < 0 || xx >= ws || yy >= hs) continue;
      const j = sb[yy * ws + xx];
      if (j < 0 || j === j0 || j === j1 || j === j2 || j === j3) continue;
      if (j1 < 0) j1 = j; else if (j2 < 0) j2 = j; else j3 = j;
      tryS(j);
    }
    for (const j of around) tryS(j);
    let tf = Infinity, kindEnv = 0;
    if (dy < -1e-9) { const tt = (fy - e[1]) / dy; if (tt > EPS) { tf = tt; kindEnv = 1; } }
    if (env.wallZ !== undefined && dz < -1e-9) { const tt = (env.wallZ - e[2]) / dz; if (tt > EPS && tt < tf && e[1] + tt * dy >= fy - 1e-6) { tf = tt; kindEnv = 2; } }
    if (env.wallX !== undefined && dx * (env.wallXDir || 1) < -1e-9) { const tt = (env.wallX - e[0]) / dx; if (tt > EPS && tt < tf && e[1] + tt * dy >= fy - 1e-6) { tf = tt; kindEnv = 3; } }
    let r, g, bl, oid = -1;
    if (s && t <= tf) {
      const x = e[0] + t * dx, y = e[1] + t * dy, z = e[2] + t * dz, mat = sc.mats[s.m];
      let base = mat.c; if (mat.tex) { mat.tex(x, y, z, nx, ny, nz, s, BASE); base = BASE; }
      const fl = nx * dx + ny * dy + nz * dz > 0 ? -1 : 1;
      X.shade(sc, x, y, z, nx, ny, nz, dx, dy, dz, base, mat, s.id, px, py, COL, lit(SM, sc, x, y, z, nx * fl, ny * fl, nz * fl), 1);
      const kd = env.dim ? env.dim(x, y, z) : 1; r = COL[0] * kd; g = COL[1] * kd; bl = COL[2] * kd; oid = s.id;
    } else if (kindEnv) {
      const x = e[0] + tf * dx, y = e[1] + tf * dy, z = e[2] + tf * dz, fp = tf / cam.f;
      let N = [0, 1, 0], sid = -1, mat = env.floorMat || { ks: 0, sh: 1 };
      if (kindEnv === 1) env.floor(x, z, fp, TMP);
      else if (kindEnv === 2) { env.wall(x, y, fp, TMP); N = [0, 0, 1]; sid = -2; mat = env.wallMat || { ks: 0, sh: 1 }; }
      else { (env.wallSide || env.wall)(z, y, fp, TMP); N = [env.wallXDir || 1, 0, 0]; sid = -3; mat = env.wallMat || { ks: 0, sh: 1 }; }
      if (kindEnv === 1 && X.shadeFloor && X.shadeFloor(sc, x, y, z, TMP, dx, dy, dz, px, py, COL)) { }
      else X.shade(sc, x, y, z, N[0], N[1], N[2], dx, dy, dz, TMP, mat, sid, px, py, COL, lit(SMP || SM, sc, x, y, z, N[0], N[1], N[2]), 1);
      const kd = env.dim ? env.dim(x, y, z) : 1; r = COL[0] * kd; g = COL[1] * kd; bl = COL[2] * kd;
    } else { env.sky(dx, dy, dz, COL); r = COL[0]; g = COL[1]; bl = COL[2]; }
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = bl; id[i] = oid;
  }
  return { rgb, id };
}
const TONE = new Uint8Array(65536).map((_, i) => Math.round(255 * Math.pow(i / 65535, 1 / 2.2)));
const tone = (v, expo) => { v *= expo; v = v / (1 + 0.12 * v); return TONE[Math.round(65535 * Math.max(0, Math.min(1, v)))]; };

export function picture(sc, q, ss, OX0, OY0, OW, OH, X, keep = null) {
  const S = samples(sc, q * ss, OX0 * ss, OY0 * ss, OW * ss, OH * ss, X), ws = OW * ss, expo = sc.exposure ?? 1;
  const data = new Uint8ClampedArray(OW * OH * 4), ids = new Int16Array(OW * OH).fill(-1);
  for (let oy = 0; oy < OH; oy++) for (let ox = 0; ox < OW; ox++) {
    let r = 0, g = 0, b = 0, n = 0, idk = -1;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const si = (oy * ss + j) * ws + ox * ss + i, sid = S.id[si];
      if (i === 0 && j === 0) idk = sid;
      if (keep && !(sid >= 0 && keep.has(sid))) continue;
      r += S.rgb[si * 3]; g += S.rgb[si * 3 + 1]; b += S.rgb[si * 3 + 2]; n++;
    }
    const o = (oy * OW + ox) * 4;
    if (n) { data[o] = tone(r / n, expo); data[o + 1] = tone(g / n, expo); data[o + 2] = tone(b / n, expo); }
    data[o + 3] = keep ? Math.round(255 * n / (ss * ss)) : 255;
    ids[oy * OW + ox] = keep ? (n && idk >= 0 && keep.has(idk) ? idk : -1) : idk;
  }
  return { data, ids };
}
export const _dbg = { tess };
