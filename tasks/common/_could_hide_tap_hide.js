import { catParts, catFootprint, footprints, solidBody, worldParts, CAT_FOOT, cameraFor, eyeOf, EAR_FACES, extent, toLocal, speciesOf, sizeK } from './_could_hide_tap_scene.js';
import { makeCam, camDir, hitShape, shape, envHit } from './_could_hide_tap_rt.js';

const D2R = Math.PI / 180;
export const ZONE = 0.8, SIDE = 0.12;
export const SIDE_F = 0.3, BESIDE_D = 0.45;
function bandPoints(o, step, k = 1) {
  const ext = extent(o), a = (o.yaw || 0) * D2R, c = Math.cos(a), sn = Math.sin(a), out = [];
  for (let lz = -ext.hz - 0.03 * k; lz >= -ext.hz - ZONE * k - 1e-9; lz -= step) for (let lx = -ext.hx - SIDE * k; lx <= ext.hx + SIDE * k + 1e-9; lx += step) {
    out.push([o.x + lx * c + lz * sn, o.z - lx * sn + lz * c, lx, lz]);
  }
  return out;
}
function inBand(o, x, z, k = 1) {
  const ext = extent(o), [lx, lz] = toLocal(o, x, z);
  return lz < -ext.hz && lz >= -ext.hz - ZONE * k - 1e-9 && Math.abs(lx) <= ext.hx + SIDE * k + 1e-9;
}
export { inBand };
function inSearch(o, ext, lx, lz, k = 1) {
  if (Math.abs(lx) <= ext.hx + SIDE * k + 1e-9 && lz <= -ext.hz + 1e-9 && lz >= -ext.hz - ZONE * k - 1e-9) return true;
  return Math.abs(lx) > ext.hx && Math.abs(lx) <= ext.hx + SIDE_F * k + 1e-9 && lz <= 1e-9 && lz >= -ext.hz - BESIDE_D * k - 1e-9;
}

function obbOverlap(a, b, pad = 0) {
  const axes = [];
  for (const o of [a, b]) { const t = o.yaw * D2R; axes.push([Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]); }
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const [ux, uz] of axes) {
    const ra = proj(a, ux, uz), rb = proj(b, ux, uz), d = Math.abs(dx * ux + dz * uz);
    if (d > ra + rb + pad) return false;
  }
  return true;
}
function proj(o, ux, uz) {
  const t = o.yaw * D2R, c = Math.cos(t), s = Math.sin(t);
  return o.hx * Math.abs(c * ux - s * uz) + o.hz * Math.abs(s * ux + c * uz);
}
function obbCircle(a, c, pad = 0) {
  const [lx, lz] = toLocal({ x: a.cx, z: a.cz, yaw: a.yaw }, c.cx, c.cz);
  const qx = Math.max(-a.hx, Math.min(a.hx, lx)), qz = Math.max(-a.hz, Math.min(a.hz, lz));
  return Math.hypot(lx - qx, lz - qz) < c.r + pad;
}
function obbCorners(a) {
  const t = a.yaw * D2R, c = Math.cos(t), s = Math.sin(t), out = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = sx * a.hx, lz = sz * a.hz; out.push([a.cx + lx * c + lz * s, a.cz - lx * s + lz * c]); }
  return out;
}
export function blockersFor(rd, s, skip = -1) {
  const list = [];
  const H = speciesOf(rd.cat).H, k = sizeK(rd.cat);
  rd.objs.forEach((o, j) => { if (j !== skip) for (const f of footprints(o, H * s)) list.push(f); });
  const rc = catFootprint(rd.cat);
  list.push({ t: 'obb', cx: rc.cx, cz: rc.cz, hx: rc.hx + 0.03 * k, hz: rc.hz + 0.03 * k, yaw: rc.yaw });
  return list;
}
export function placementOK(cat, blockers, pad = 0.004) {
  const F = catFootprint(cat);
  for (const [, z] of obbCorners(F)) if (z < 0.008) return false;
  for (const b of blockers) {
    if (b.t === 'obb' ? obbOverlap(F, b, pad) : obbCircle(F, b, pad)) return false;
  }
  return true;
}

function hull2(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}
export function coneOf(cam, body) {
  const E = cam.eye;
  const pts = body.verts.map((v, k) => { const p = cam.project(v[0], v[1], v[2]); return [p.x, p.y, k]; });
  const H = hull2(pts), C = body.center, planes = [];
  for (let a = 0; a < H.length; a++) {
    const A = body.verts[H[a][2]], B = body.verts[H[(a + 1) % H.length][2]];
    const ax = A[0] - E[0], ay = A[1] - E[1], az = A[2] - E[2], bx = B[0] - E[0], by = B[1] - E[1], bz = B[2] - E[2];
    let n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-12) continue;
    n = n.map((q) => q / l);
    if (n[0] * (C[0] - E[0]) + n[1] * (C[1] - E[1]) + n[2] * (C[2] - E[2]) < 0) n = n.map((q) => -q);
    planes.push(n);
  }
  return planes;
}
function partMin(p, n, E) {
  if (p.k === 'e') {
    const M = p.M, r = p.r;
    const s0 = r[0] * (n[0] * M[0] + n[1] * M[1] + n[2] * M[2]), s1 = r[1] * (n[0] * M[3] + n[1] * M[4] + n[2] * M[5]), s2 = r[2] * (n[0] * M[6] + n[1] * M[7] + n[2] * M[8]);
    return n[0] * (p.c[0] - E[0]) + n[1] * (p.c[1] - E[1]) + n[2] * (p.c[2] - E[2]) - Math.hypot(s0, s1, s2);
  }
  if (p.k === 'k') {
    const a = n[0] * (p.a[0] - E[0]) + n[1] * (p.a[1] - E[1]) + n[2] * (p.a[2] - E[2]);
    const b = n[0] * (p.b[0] - E[0]) + n[1] * (p.b[1] - E[1]) + n[2] * (p.b[2] - E[2]);
    return Math.min(a, b) - p.r;
  }
  let m = Infinity;
  for (const v of p.verts) m = Math.min(m, n[0] * (v[0] - E[0]) + n[1] * (v[1] - E[1]) + n[2] * (v[2] - E[2]));
  return m;
}
function partCenter(p) {
  if (p.k === 'e') return [p.c, Math.max(...p.r)];
  if (p.k === 'k') return [[(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2], Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2 + p.r];
  const c = [0, 0, 0]; for (const v of p.verts) { c[0] += v[0] / p.verts.length; c[1] += v[1] / p.verts.length; c[2] += v[2] / p.verts.length; }
  let r = 0; for (const v of p.verts) r = Math.max(r, Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]));
  return [c, r];
}
function bodyExit(bodyShapes, E, u) {
  let tin = Infinity;
  for (const s of bodyShapes) tin = Math.min(tin, hitShape(s, E[0], E[1], E[2], u[0], u[1], u[2], Infinity));
  if (tin === Infinity) return -Infinity;
  const F = 1000, O = [E[0] + u[0] * F, E[1] + u[1] * F, E[2] + u[2] * F];
  let tb = Infinity;
  for (const s of bodyShapes) tb = Math.min(tb, hitShape(s, O[0], O[1], O[2], -u[0], -u[1], -u[2], Infinity));
  return F - tb;
}
function bodyShapesOf(o) {
  const p = worldParts(o).find((q) => q.body);
  if (!p) return [];
  if (p.t === 'box') return [shape.box(0, 0, p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw, 0)];
  return [shape.cyl(0, 0, p.x, p.z, p.y0, p.y1, p.r, 0)];
}
function hiddenBy(parts, planes, E, f, marginPx, bodyShapes) {
  for (const p of parts) {
    const [c, r] = partCenter(p), dist = Math.hypot(c[0] - E[0], c[1] - E[1], c[2] - E[2]);
    const need = marginPx / f * (dist + r);
    for (const n of planes) if (partMin(p, n, E) < need) return false;
  }
  for (const p of parts) {
    const [c, r] = partCenter(p), dx = c[0] - E[0], dy = c[1] - E[1], dz = c[2] - E[2], dist = Math.hypot(dx, dy, dz);
    const u = [dx / dist, dy / dist, dz / dist], te = bodyExit(bodyShapes, E, u);
    if (!(dist - r > te)) return false;
  }
  return true;
}
const YAWS16 = Array.from({ length: 16 }, (_, k) => k * 22.5);
export function canHide(rd, i, s = 1.2, marginPx = 1, cam = cameraFor(rd.cam)) {
  const o = rd.objs[i], body = solidBody(o);
  if (!body) return null;
  const E = cam.eye, planes = coneOf(cam, body), bodyShapes = bodyShapesOf(o), blockers = blockersFor(rd, s), sp = rd.cat.sp, k = sizeK(rd.cat);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const v of body.verts) { const p = cam.project(v[0], v[1], v[2]); bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); by0 = Math.min(by0, p.y); by1 = Math.max(by1, p.y); }
  const cands = [];
  for (const [x, z, lx, lz] of bandPoints(o, 0.04 * k, k)) {
    if (z < 0.02) continue;
    const g = cam.project(x, 0, z);
    if (g.x < bx0 || g.x > bx1 || g.y > by1 + 2 || g.y < by0) continue;
    cands.push([x, z, Math.abs(lx) - 0.3 * lz]);
  }
  cands.sort((a, b) => a[2] - b[2]);
  for (const [x, z] of cands) {
    for (const yaw of YAWS16) {
      const cat = { sp, x, z, yaw, s };
      if (!placementOK(cat, blockers)) continue;
      if (hiddenBy(catParts(cat), planes, E, cam.f, marginPx, bodyShapes)) return cat;
    }
  }
  return null;
}

const SIL = new Map();
const SIL_D0 = 5, SIL_PX = 0.011;
export const PHI_STEP = 2.5, PSI_STEP = 22.5;
function silhouette(sp, phiB, psiB) {
  const key = `${sp || 'cat'}|${phiB * 100 + psiB}`;
  let S = SIL.get(key);
  if (S) return S;
  const k = sizeK({ sp }), phi = phiB * PHI_STEP * D2R, psi = psiB * PSI_STEP;
  const eye = [0, SIL_D0 * Math.sin(phi), SIL_D0 * Math.cos(phi)];
  const f0 = SIL_D0 / (SIL_PX * k), W = 100, H = 100;
  const cam = makeCam({ eye, target: [0, 0.15 * k, 0], fovY: 2 * Math.atan(H / 2 / f0) / D2R, W, H });
  const shapes = catShapes({ sp, x: 0, z: 0, yaw: psi, s: 1 });
  const pts = [], c = Math.cos(psi * D2R), sn = Math.sin(psi * D2R);
  for (let y = 18; y < 82; y++) for (let x = 20; x < 80; x++) {
    const d = camDir(cam, x + 0.5, y + 0.5);
    let t = Infinity;
    for (const s of shapes) t = Math.min(t, hitShape(s, eye[0], eye[1], eye[2], d[0], d[1], d[2], t));
    if (t === Infinity) continue;
    const X = eye[0] + t * d[0], Y = eye[1] + t * d[1], Z = eye[2] + t * d[2];
    pts.push(X * c - Z * sn, Y, X * sn + Z * c);
  }
  S = new Float32Array(pts);
  SIL.set(key, S);
  return S;
}
function catShapes(cat) {
  return catParts(cat).map((p) => {
    if (p.k === 'e') return shape.ellipsoid(0, 0, p.c[0], p.c[1], p.c[2], p.r[0], p.r[1], p.r[2], p.M);
    if (p.k === 'k') return shape.capsule(0, 0, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r);
    return shape.poly(0, 0, p.verts, EAR_FACES);
  });
}
export { catShapes };

const TILE = 8;
export function occluderIndex(rd, i, cam = cameraFor(rd.cam)) {
  const shapes = objShapes(rd.objs[i]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const boxes = shapes.map((s) => {
    const b = s.bb; let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (let c = 0; c < 8; c++) { const p = cam.project(c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]); a0 = Math.min(a0, p.x); a1 = Math.max(a1, p.x); c0 = Math.min(c0, p.y); c1 = Math.max(c1, p.y); }
    x0 = Math.min(x0, a0); x1 = Math.max(x1, a1); y0 = Math.min(y0, c0); y1 = Math.max(y1, c1);
    return [a0 - 0.5, c0 - 0.5, a1 + 0.5, c1 + 0.5];
  });
  const TX0 = Math.floor(x0 / TILE), TY0 = Math.floor(y0 / TILE), NX = Math.floor(x1 / TILE) - TX0 + 1, NY = Math.floor(y1 / TILE) - TY0 + 1;
  const tiles = Array.from({ length: NX * NY }, () => []);
  boxes.forEach((b, k) => {
    for (let ty = Math.floor(b[1] / TILE); ty <= Math.floor(b[3] / TILE); ty++) for (let tx = Math.floor(b[0] / TILE); tx <= Math.floor(b[2] / TILE); tx++) {
      const c = tx - TX0, r = ty - TY0;
      if (c >= 0 && r >= 0 && c < NX && r < NY) tiles[r * NX + c].push(k);
    }
  });
  return { shapes, boxes, tiles, TX0, TY0, NX, NY, box: [x0, y0, x1, y1] };
}
export function objShapes(o) {
  return worldParts(o).map((p) => {
    if (p.t === 'box') return shape.box(0, 0, p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw, 0);
    if (p.t === 'cyl') return shape.cyl(0, 0, p.x, p.z, p.y0, p.y1, p.r, 0);
    return shape.capsule(0, 0, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r);
  });
}

function hiddenShare(occ, cam, x, z, yaw, s, stride = 1, sp = 'cat') {
  const E = cam.eye, gx = x - E[0], gz = z - E[2], gd = Math.hypot(gx, gz);
  const phi = Math.atan2(E[1], gd) / D2R;
  const toCam = Math.atan2(E[0] - x, E[2] - z) / D2R;
  const psi = ((yaw - toCam) % 360 + 360) % 360;
  const phiB = Math.max(2, Math.min(26, Math.round(phi / PHI_STEP))), psiB = Math.round(psi / PSI_STEP) % 16;
  const S = silhouette(sp, phiB, psiB);
  const a = yaw * D2R, c = Math.cos(a), sn = Math.sin(a);
  const F = cam.F, R = cam.R, U = cam.U, f = cam.f, ccx = cam.cx, ccy = cam.cy, ex = E[0], ey = E[1], ez = E[2];
  const { shapes, boxes, tiles, TX0, TY0, NX, NY } = occ;
  let hid = 0, n = 0;
  for (let q = 0; q < S.length; q += 3 * stride) {
    const lx = S[q] * s, ly = S[q + 1] * s, lz = S[q + 2] * s;
    const dx = x + lx * c + lz * sn - ex, dy = ly - ey, dz = z - lx * sn + lz * c - ez;
    const zc = dx * F[0] + dy * F[1] + dz * F[2];
    const px = ccx + f * (dx * R[0] + dz * R[2]) / zc, py = ccy - f * (dx * U[0] + dy * U[1] + dz * U[2]) / zc;
    n++;
    const tc = Math.floor(px / TILE) - TX0, tr = Math.floor(py / TILE) - TY0;
    if (tc < 0 || tr < 0 || tc >= NX || tr >= NY) continue;
    const list = tiles[tr * NX + tc];
    if (!list.length) continue;
    const dist = Math.hypot(dx, dy, dz), ux = dx / dist, uy = dy / dist, uz = dz / dist;
    for (let k = 0; k < list.length; k++) {
      const b = boxes[list[k]];
      if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) continue;
      if (hitShape(shapes[list[k]], ex, ey, ez, ux, uy, uz, dist) < dist) { hid++; break; }
    }
  }
  return n ? hid / n : 0;
}
export function maxHidden(rd, i, s = 0.8, cam = cameraFor(rd.cam), index = null, limit = Infinity) {
  const M = index || occluderIndex(rd, i, cam), E = cam.eye;
  const o = rd.objs[i], ext = extent(o), a = (o.yaw || 0) * D2R, c = Math.cos(a), sn = Math.sin(a);
  const sp = rd.cat.sp, K = sizeK(rd.cat);
  const reach = Math.hypot(ext.hx, ext.hz) + (ZONE + SIDE + 0.5) * K;
  const blockers = blockersFor(rd, s).filter((b) => Math.hypot(b.cx - o.x, b.cz - o.z) - (b.t === 'obb' ? Math.hypot(b.hx, b.hz) : b.r) < reach);
  const W = (lx, lz) => [o.x + lx * c + lz * sn, o.z - lx * sn + lz * c];
  const see = !!o.open;
  const backs = (see ? [0, 0.08, 0.2, 0.38, 0.6] : [0, 0.04, 0.1, 0.2]).map((v) => v * K);
  const nHead = see ? 8 : 12, lxStep = (see ? 0.04 : 0.03) * K, stride = see ? 7 : 5;
  const lz0 = -ext.hz - 0.004, lzMin = -ext.hz - ZONE * K;
  const okAt = (lx, lz, yaw) => { const [x, z] = W(lx, lz); return z >= 0.02 && placementOK({ sp, x, z, yaw, s }, blockers); };
  const touch = (lx, yaw) => {
    if (okAt(lx, lz0, yaw)) return lz0;
    let bad = lz0;
    for (let lz = lz0 - 0.025 * K; lz >= lzMin - 1e-9; lz -= 0.025 * K) {
      const [, z] = W(lx, lz);
      if (z < 0.02) return null;
      if (okAt(lx, lz, yaw)) {
        let good = lz;
        for (let it = 0; it < 3; it++) { const m = (bad + good) / 2; if (okAt(lx, m, yaw)) good = m; else bad = m; }
        return good;
      }
      bad = lz;
    }
    return null;
  };
  const scan = [];
  const lzLow = -ext.hz - BESIDE_D * K;
  const sideTouch = (side, lz, yaw) => {
    let out = ext.hx + SIDE_F * K, inn = ext.hx;
    if (!okAt(side * out, lz, yaw)) return null;
    if (okAt(side * inn, lz, yaw)) return inn;
    for (let it = 0; it < 7; it++) { const m = (inn + out) / 2; if (okAt(side * m, lz, yaw)) out = m; else inn = m; }
    return out;
  };
  const [elx] = toLocal(o, E[0], E[2]), farSide = elx > 0 ? -1 : 1;
  const besideAt = (side, lz, yaw, st) => {
    const t = sideTouch(side, lz, yaw);
    if (t === null) return null;
    const [x, z] = W(side * t, lz);
    return { h: hiddenShare(M, cam, x, z, yaw, s, st, sp), x, z, yaw };
  };
  const beside = [];
  const tallSolid = !see && o.h >= 0.5 * K;
  for (const side of [farSide, -farSide]) {
    const nH = tallSolid ? (side === farSide ? 24 : 8) : (side === farSide ? 8 : 4);
    for (let k = 0; k < nH; k++) {
      for (let lz = 0; lz >= lzLow - 1e-9; lz -= 0.03 * K) {
        const [cx0, cz0] = W(side * (ext.hx + 0.12 * K), lz);
        if (cz0 < 0.02) break;
        const yaw = k * 360 / nH + Math.atan2(E[0] - cx0, E[2] - cz0) / D2R;
        const r = besideAt(side, lz, yaw, 6);
        if (!r) continue;
        if (r.h >= limit && (r.h = hiddenShare(M, cam, r.x, r.z, r.yaw, s, 1, sp)) >= limit) return { share: r.h, at: { x: r.x, z: r.z, yaw: r.yaw }, early: true };
        beside.push([r.h, side, lz, yaw]);
      }
    }
  }
  beside.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const cornerRefined = [];
  for (const [, side, lz0b, yaw0] of beside.slice(0, 5)) {
    for (let dz = -0.015 * K; dz <= 0.015 * K + 1e-9; dz += 0.015 * K) for (let dy = -7.5; dy <= 7.5 + 1e-9; dy += 3.75) {
      const lz = lz0b + dz;
      if (lz > 1e-9 || lz < lzLow) continue;
      const r = besideAt(side, lz, yaw0 + dy, 2);
      if (!r) continue;
      if (r.h >= limit && (r.h = hiddenShare(M, cam, r.x, r.z, r.yaw, s, 1, sp)) >= limit) return { share: r.h, at: { x: r.x, z: r.z, yaw: r.yaw }, early: true };
      cornerRefined.push([r.h, r.x, r.z, r.yaw]);
    }
  }
  for (let k = 0; k < nHead; k++) {
    const yawRel = k * 360 / nHead;
    for (let lx = -ext.hx - SIDE * K; lx <= ext.hx + SIDE * K + 1e-9; lx += lxStep) {
      const [x1, z1] = W(lx, lz0 - 0.1 * K);
      const yaw = yawRel + Math.atan2(E[0] - x1, E[2] - z1) / D2R;
      const t = touch(lx, yaw);
      if (t === null) continue;
      for (const back of backs) {
        const lz = t - back;
        if (lz < lzMin) break;
        const [x, z] = W(lx, lz);
        if (z < 0.02) break;
        if (back && !placementOK({ sp, x, z, yaw, s }, blockers)) continue;
        let h = hiddenShare(M, cam, x, z, yaw, s, stride, sp);
        if (h >= limit && (h = hiddenShare(M, cam, x, z, yaw, s, 1, sp)) >= limit) return { share: h, at: { x, z, yaw }, early: true };
        scan.push([h, lx, lz, yaw, back === 0]);
      }
    }
  }
  scan.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const picked = [], refined = [];
  const nPick = see ? 6 : 10, DX = (see ? 0.02 : 0.015) * K, DY = see ? 22.5 : 11.25, nd = see ? 1 : 2, rStride = see ? 3 : 2;
  for (const [, lx0, lzA, y0, touching] of scan) {
    if (picked.length >= nPick) break;
    if (picked.some(([x, z, y]) => Math.abs(x - lx0) < 0.025 * K && Math.abs(z - lzA) < 0.025 * K && Math.abs(y - y0) < 20)) continue;
    picked.push([lx0, lzA, y0]);
    for (let a = -nd; a <= nd; a++) for (let b = -nd; b <= nd; b++) {
      const lx = lx0 + a * DX / nd, yaw = y0 + b * DY / nd;
      const lzs = touching ? [touch(lx, yaw)] : [lzA - 0.03 * K, lzA, lzA + 0.03 * K];
      for (const lz of lzs) {
        if (lz === null || !inSearch(o, ext, lx, lz, K)) continue;
        const [x, z] = W(lx, lz);
        if (z < 0.02 || !placementOK({ sp, x, z, yaw, s }, blockers)) continue;
        let h = hiddenShare(M, cam, x, z, yaw, s, rStride, sp);
        if (h >= limit && (h = hiddenShare(M, cam, x, z, yaw, s, 1, sp)) >= limit) return { share: h, at: { x, z, yaw }, early: true };
        refined.push([h, x, z, yaw]);
      }
    }
  }
  for (const r of cornerRefined) refined.push(r);
  refined.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  let best = { share: refined.length ? refined[0][0] : 0, at: refined.length ? { x: refined[0][1], z: refined[0][2], yaw: refined[0][3] } : null };
  for (const [, x, z, yaw] of refined.slice(0, 5)) {
    const h = hiddenShare(M, cam, x, z, yaw, s, 1, sp);
    if (h > best.share) best = { share: h, at: { x, z, yaw } };
  }
  return best;
}

export function gapPixels(rd, i, cam = cameraFor(rd.cam)) {
  const o = rd.objs[i], ext = extent(o), E = cam.eye;
  const a = (o.yaw || 0) * D2R, c = Math.cos(a), sn = Math.sin(a);
  const W = (lx, lz) => [o.x + lx * c + lz * sn, o.z - lx * sn + lz * c];
  const far = -ext.hz - (o.z + ext.hx + ext.hz) / Math.max(0.2, Math.abs(c));
  const corners = [W(-ext.hx, -ext.hz), W(ext.hx, -ext.hz), W(-ext.hx, far), W(ext.hx, far)].map(([x, z]) => cam.project(x, 0, Math.max(0, z)));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)))), x1 = Math.min(cam.W, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)))), y1 = Math.min(cam.H, Math.ceil(Math.max(...corners.map((p) => p.y))));
  const shapes = [];
  const meets = (sh) => {
    const b = sh.bb; let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (let k = 0; k < 8; k++) { const p = cam.project(k & 1 ? b[3] : b[0], k & 2 ? b[4] : b[1], k & 4 ? b[5] : b[2]); a0 = Math.min(a0, p.x); a1 = Math.max(a1, p.x); c0 = Math.min(c0, p.y); c1 = Math.max(c1, p.y); }
    return a1 >= x0 - 1 && a0 <= x1 + 1 && c1 >= y0 - 1 && c0 <= y1 + 1;
  };
  rd.objs.forEach((q) => { for (const sh of objShapes(q)) if (meets(sh)) shapes.push(sh); });
  for (const sh of catShapes(rd.cat)) if (meets(sh)) shapes.push(sh);
  const envL = { floorY: 0, wallZ: 0, wallH: rd.look.fenceH, hedgeZ: -1.6, hedgeH: rd.look.fenceH + 1.5 };
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = camDir(cam, x + 0.5, y + 0.5);
    const eh = envHit(envL, E[0], E[1], E[2], d[0], d[1], d[2]);
    if (eh.kind !== 1) continue;
    const t = eh.t, X = E[0] + t * d[0], Z = E[2] + t * d[2];
    const [lx, lz] = toLocal(o, X, Z);
    if (Math.abs(lx) > ext.hx || lz > -ext.hz || Z < 0) continue;
    let blocked = false;
    for (const s of shapes) if (hitShape(s, E[0], E[1], E[2], d[0], d[1], d[2], t) < t) { blocked = true; break; }
    if (!blocked) n++;
  }
  return n;
}
export { CAT_FOOT, eyeOf, hiddenShare as _hiddenShare };
