export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const unit = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const rad = (d) => d * Math.PI / 180;

export function lookAt({ eye, target, fov, cx, cy, roll = 0 }) {
  const f = unit(sub(target, eye));
  let r = unit({ x: -f.z, y: 0, z: f.x });
  let u = cross(r, f);
  if (roll) {
    const c = Math.cos(rad(roll)), s = Math.sin(rad(roll));
    const r2 = { x: r.x * c + u.x * s, y: r.y * c + u.y * s, z: r.z * c + u.z * s };
    const u2 = { x: -r.x * s + u.x * c, y: -r.y * s + u.y * c, z: -r.z * s + u.z * c };
    r = r2; u = u2;
  }
  return {
    eye, f, r, u, fov, cx, cy,
    project(p) {
      const q = sub(p, eye), depth = dot(q, f), s = fov / Math.max(1e-6, depth);
      return { x: cx + dot(q, r) * s, y: cy - dot(q, u) * s, depth };
    },
    ray(sx, sy) {
      const a = (sx - cx) / fov, b = (cy - sy) / fov;
      return unit({ x: f.x + a * r.x + b * u.x, y: f.y + a * r.y + b * u.y, z: f.z + a * r.z + b * u.z });
    },
    unproject(sx, sy, h = 0) {
      const d = this.ray(sx, sy);
      if (Math.abs(d.y) < 1e-9) return null;
      const t = (h - eye.y) / d.y;
      return t > 0 ? add(eye, mul(d, t)) : null;
    },
  };
}
export function orbitCamera({ target, yaw, pitch, dist, fov, cx, cy, roll = 0 }) {
  const a = rad(yaw), p = rad(pitch);
  const eye = { x: target.x + Math.sin(a) * Math.cos(p) * dist, y: target.y + Math.sin(p) * dist, z: target.z + Math.cos(a) * Math.cos(p) * dist };
  return lookAt({ eye, target, fov, cx, cy, roll });
}

let AUTO_ID = 1;
export const sphere = (c, r, color, extra = {}) => ({ k: 0, c, r, color, id: extra.id ?? AUTO_ID++, ...extra });
export const box = (x, y0, z, w, h, d, yaw, color, extra = {}) => {
  const a = rad(yaw || 0);
  return { k: 1, x, y0, z, w, h, d, yaw: yaw || 0, ca: Math.cos(a), sa: Math.sin(a), color, id: extra.id ?? AUTO_ID++, ...extra };
};
export const frustum = (x, z, y0, y1, r0, r1, color, extra = {}) => ({ k: 2, x, z, y0, y1, r0, r1, color, id: extra.id ?? AUTO_ID++, ...extra });
export const cylinder = (x, z, y0, h, r, color, extra = {}) => frustum(x, z, y0, y0 + h, r, r, color, extra);
export const cone = (x, z, y0, h, r, color, extra = {}) => frustum(x, z, y0, y0 + h, r, 0, color, extra);

export function bounds(p) {
  if (p.k === 0) return { lo: { x: p.c.x - p.r, y: p.c.y - p.r, z: p.c.z - p.r }, hi: { x: p.c.x + p.r, y: p.c.y + p.r, z: p.c.z + p.r } };
  if (p.k === 1) {
    const ex = Math.abs(p.ca) * p.w / 2 + Math.abs(p.sa) * p.d / 2, ez = Math.abs(p.sa) * p.w / 2 + Math.abs(p.ca) * p.d / 2;
    return { lo: { x: p.x - ex, y: p.y0, z: p.z - ez }, hi: { x: p.x + ex, y: p.y0 + p.h, z: p.z + ez } };
  }
  const R = Math.max(p.r0, p.r1);
  return { lo: { x: p.x - R, y: p.y0, z: p.z - R }, hi: { x: p.x + R, y: p.y1, z: p.z + R } };
}
export function corners(p) {
  const b = bounds(p), out = [];
  for (const x of [b.lo.x, b.hi.x]) for (const y of [b.lo.y, b.hi.y]) for (const z of [b.lo.z, b.hi.z]) out.push({ x, y, z });
  return out;
}
export function surfacePoints(p, n = 24) {
  const out = [];
  if (p.k === 0) {
    for (let i = 0; i <= 8; i++) {
      const phi = -Math.PI / 2 + Math.PI * i / 8, cr = Math.cos(phi), y = p.c.y + p.r * Math.sin(phi);
      for (let j = 0; j < n; j++) { const t = 2 * Math.PI * j / n; out.push({ x: p.c.x + p.r * cr * Math.cos(t), y, z: p.c.z + p.r * cr * Math.sin(t) }); }
    }
    return out;
  }
  if (p.k === 1) {
    for (const lx of [-p.w / 2, p.w / 2]) for (const ly of [0, p.h]) for (const lz of [-p.d / 2, p.d / 2])
      out.push({ x: p.x + lx * p.ca + lz * p.sa, y: p.y0 + ly, z: p.z - lx * p.sa + lz * p.ca });
    return out;
  }
  for (const [y, r] of [[p.y0, p.r0], [p.y1, p.r1]]) {
    if (r <= 0) { out.push({ x: p.x, y, z: p.z }); continue; }
    for (let j = 0; j < n; j++) { const t = 2 * Math.PI * j / n; out.push({ x: p.x + r * Math.cos(t), y, z: p.z + r * Math.sin(t) }); }
  }
  return out;
}

const EPS = 1e-6;
let NX = 0, NY = 0, NZ = 0;

function hitPrim(p, ox, oy, oz, dx, dy, dz, tmax, wantN) {
  if (p.k === 0) {
    const cx = ox - p.c.x, cy = oy - p.c.y, cz = oz - p.c.z;
    const b = cx * dx + cy * dy + cz * dz, c = cx * cx + cy * cy + cz * cz - p.r * p.r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t <= EPS) t = -b + sq;
    if (t <= EPS || t >= tmax) return Infinity;
    if (wantN) { NX = (cx + t * dx) / p.r; NY = (cy + t * dy) / p.r; NZ = (cz + t * dz) / p.r; }
    return t;
  }
  if (p.k === 1) {
    const ca = p.ca, sa = p.sa, rx = ox - p.x, rz = oz - p.z;
    const lx = rx * ca - rz * sa, ly = oy - p.y0 - p.h / 2, lz = rx * sa + rz * ca;
    const ex = dx * ca - dz * sa, ey = dy, ez = dx * sa + dz * ca;
    const hx = p.w / 2, hy = p.h / 2, hz = p.d / 2;
    let tn = -Infinity, tf = Infinity, ax = -1, sg = 0, t1, t2, s1, q;
    if (Math.abs(ex) < 1e-12) { if (lx < -hx || lx > hx) return Infinity; }
    else { t1 = (-hx - lx) / ex; t2 = (hx - lx) / ex; s1 = -1; if (t1 > t2) { q = t1; t1 = t2; t2 = q; s1 = 1; } if (t1 > tn) { tn = t1; ax = 0; sg = s1; } if (t2 < tf) tf = t2; if (tn > tf) return Infinity; }
    if (Math.abs(ey) < 1e-12) { if (ly < -hy || ly > hy) return Infinity; }
    else { t1 = (-hy - ly) / ey; t2 = (hy - ly) / ey; s1 = -1; if (t1 > t2) { q = t1; t1 = t2; t2 = q; s1 = 1; } if (t1 > tn) { tn = t1; ax = 1; sg = s1; } if (t2 < tf) tf = t2; if (tn > tf) return Infinity; }
    if (Math.abs(ez) < 1e-12) { if (lz < -hz || lz > hz) return Infinity; }
    else { t1 = (-hz - lz) / ez; t2 = (hz - lz) / ez; s1 = -1; if (t1 > t2) { q = t1; t1 = t2; t2 = q; s1 = 1; } if (t1 > tn) { tn = t1; ax = 2; sg = s1; } if (t2 < tf) tf = t2; if (tn > tf) return Infinity; }
    if (tn <= EPS || tn >= tmax) return Infinity;
    if (wantN) {
      const nlx = ax === 0 ? sg : 0, nlz = ax === 2 ? sg : 0;
      NX = nlx * ca + nlz * sa; NY = ax === 1 ? sg : 0; NZ = -nlx * sa + nlz * ca;
    }
    return tn;
  }
  const hgt = p.y1 - p.y0, k = (p.r1 - p.r0) / hgt, A = p.r0 - k * p.y0;
  const X0 = ox - p.x, Z0 = oz - p.z;
  let best = Infinity, bn = 0;
  const E = A + k * oy;
  const a = dx * dx + dz * dz - k * k * dy * dy;
  const b = 2 * (X0 * dx + Z0 * dz - k * E * dy);
  const c = X0 * X0 + Z0 * Z0 - E * E;
  if (Math.abs(a) > 1e-12) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (let r = 0; r < 2; r++) {
        const t = (-b + (r ? sq : -sq)) / (2 * a);
        if (t <= EPS || t >= best || t >= tmax) continue;
        const y = oy + t * dy;
        if (y < p.y0 || y > p.y1 || A + k * y < 0) continue;
        best = t; bn = 1;
      }
    }
  }
  if (Math.abs(dy) > 1e-12) {
    for (let cap = 0; cap < 2; cap++) {
      const yc = cap ? p.y1 : p.y0, rc = cap ? p.r1 : p.r0;
      if (rc <= 0) continue;
      const t = (yc - oy) / dy;
      if (t <= EPS || t >= best || t >= tmax) continue;
      const x = X0 + t * dx, z = Z0 + t * dz;
      if (x * x + z * z <= rc * rc) { best = t; bn = cap ? 3 : 2; }
    }
  }
  if (best === Infinity) return Infinity;
  if (wantN) {
    if (bn === 1) {
      const x = X0 + best * dx, z = Z0 + best * dz, y = oy + best * dy, ny = -k * (A + k * y);
      const l = Math.sqrt(x * x + ny * ny + z * z) || 1;
      NX = x / l; NY = ny / l; NZ = z / l;
    } else { NX = 0; NY = bn === 2 ? -1 : 1; NZ = 0; }
  }
  return best;
}

function slab(ox, oy, oz, dx, dy, dz, lo, hi, tmax) {
  let tn = 0, tf = tmax, t1, t2, q;
  if (Math.abs(dx) < 1e-12) { if (ox < lo.x || ox > hi.x) return false; }
  else { t1 = (lo.x - ox) / dx; t2 = (hi.x - ox) / dx; if (t1 > t2) { q = t1; t1 = t2; t2 = q; } if (t1 > tn) tn = t1; if (t2 < tf) tf = t2; if (tn > tf) return false; }
  if (Math.abs(dy) < 1e-12) { if (oy < lo.y || oy > hi.y) return false; }
  else { t1 = (lo.y - oy) / dy; t2 = (hi.y - oy) / dy; if (t1 > t2) { q = t1; t1 = t2; t2 = q; } if (t1 > tn) tn = t1; if (t2 < tf) tf = t2; if (tn > tf) return false; }
  if (Math.abs(dz) < 1e-12) { if (oz < lo.z || oz > hi.z) return false; }
  else { t1 = (lo.z - oz) / dz; t2 = (hi.z - oz) / dz; if (t1 > t2) { q = t1; t1 = t2; t2 = q; } if (t1 > tn) tn = t1; if (t2 < tf) tf = t2; if (tn > tf) return false; }
  return true;
}

function occludedS(scene, ox, oy, oz, dx, dy, dz, tmax, skipId) {
  for (const p of scene.prims) {
    if (p.noShadow || p.id === skipId) continue;
    if (!slab(ox, oy, oz, dx, dy, dz, p._lo, p._hi, tmax)) continue;
    if (hitPrim(p, ox, oy, oz, dx, dy, dz, tmax, false) < tmax) return true;
  }
  return false;
}
export function occluded(scene, o, d, tmax = Infinity, skipId = null) {
  return occludedS(scene, o.x, o.y, o.z, d.x, d.y, d.z, tmax, skipId);
}

function sdfPrimS(p, qx, qy, qz) {
  if (p.k === 0) { const dx = qx - p.c.x, dy = qy - p.c.y, dz = qz - p.c.z; return Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r; }
  if (p.k === 1) {
    const dx = qx - p.x, dz = qz - p.z;
    const lx = Math.abs(dx * p.ca - dz * p.sa) - p.w / 2, ly = Math.abs(qy - p.y0 - p.h / 2) - p.h / 2, lz = Math.abs(dx * p.sa + dz * p.ca) - p.d / 2;
    const ox = lx > 0 ? lx : 0, oy = ly > 0 ? ly : 0, oz = lz > 0 ? lz : 0;
    const inner = Math.max(lx, ly, lz);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + (inner < 0 ? inner : 0);
  }
  const y = qy < p.y0 ? p.y0 : qy > p.y1 ? p.y1 : qy, rr = p.r0 + (p.r1 - p.r0) * (y - p.y0) / (p.y1 - p.y0);
  const ex = qx - p.x, ez = qz - p.z;
  const radial = Math.sqrt(ex * ex + ez * ez) - rr, vert = Math.max(p.y0 - qy, qy - p.y1);
  const ox = radial > 0 ? radial : 0, oy = vert > 0 ? vert : 0;
  const inner = Math.max(radial, vert);
  return Math.sqrt(ox * ox + oy * oy) + (inner < 0 ? inner : 0);
}
export function sdfPrim(p, q) { return sdfPrimS(p, q.x, q.y, q.z); }

function sceneSdfS(scene, qx, qy, qz, skipId, maxD, skipFloor) {
  let m = scene.floor && !skipFloor ? qy : Infinity;
  if (m > maxD) m = maxD;
  for (const p of scene.prims) {
    if (p.id === skipId || p.noAo) continue;
    const lo = p._lo, hi = p._hi;
    const ax = lo.x - qx > 0 ? lo.x - qx : qx - hi.x > 0 ? qx - hi.x : 0;
    const ay = lo.y - qy > 0 ? lo.y - qy : qy - hi.y > 0 ? qy - hi.y : 0;
    const az = lo.z - qz > 0 ? lo.z - qz : qz - hi.z > 0 ? qz - hi.z : 0;
    if (ax * ax + ay * ay + az * az >= m * m) continue;
    const v = sdfPrimS(p, qx, qy, qz); if (v < m) m = v;
  }
  return m;
}
export function sceneSdf(scene, q, skipId = null, maxD = Infinity) { return sceneSdfS(scene, q.x, q.y, q.z, skipId, maxD, false); }

export function prepare(scene, cam) {
  for (const p of scene.prims) {
    const b = bounds(p);
    p._lo = { x: b.lo.x - 1e-6, y: b.lo.y - 1e-6, z: b.lo.z - 1e-6 };
    p._hi = { x: b.hi.x + 1e-6, y: b.hi.y + 1e-6, z: b.hi.z + 1e-6 };
    const pts = corners(p).map((c) => cam.project(c));
    p._sx0 = Math.min(...pts.map((q) => q.x)) - 1; p._sx1 = Math.max(...pts.map((q) => q.x)) + 1;
    p._sy0 = Math.min(...pts.map((q) => q.y)) - 1; p._sy1 = Math.max(...pts.map((q) => q.y)) + 1;
    p._behind = pts.some((q) => q.depth <= 1);
  }
  return scene;
}

let TR_T = 0, TR_PRIM = null, TR_NX = 0, TR_NY = 0, TR_NZ = 0;
function traceS(scene, ox, oy, oz, dx, dy, dz, sx, sy) {
  let best = Infinity, bp = null, nx = 0, ny = 0, nz = 0, floorHit = false;
  const F = scene.floor;
  if (F && dy < -1e-9) {
    const t = -oy / dy, fx = ox + t * dx, fz = oz + t * dz;
    if (t > EPS && (!F.lo || (fx >= F.lo.x && fx <= F.hi.x && fz >= F.lo.z && fz <= F.hi.z))) { best = t; nx = 0; ny = 1; nz = 0; floorHit = true; }
  }
  for (const p of scene.prims) {
    if (p.hidden) continue;
    if (sx !== null && !p._behind && (sx < p._sx0 || sx > p._sx1 || sy < p._sy0 || sy > p._sy1)) continue;
    if (!slab(ox, oy, oz, dx, dy, dz, p._lo, p._hi, best)) continue;
    const t = hitPrim(p, ox, oy, oz, dx, dy, dz, best, true);
    if (t < best) { best = t; bp = p; nx = NX; ny = NY; nz = NZ; }
  }
  if (best === Infinity) return false;
  TR_T = best; TR_PRIM = bp; TR_NX = nx; TR_NY = ny; TR_NZ = nz;
  return floorHit || bp !== null;
}
export function trace(scene, o, d, sx = null, sy = null) {
  if (!traceS(scene, o.x, o.y, o.z, d.x, d.y, d.z, sx, sy)) return null;
  return { t: TR_T, prim: TR_PRIM, n: { x: TR_NX, y: TR_NY, z: TR_NZ } };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function hexRGB(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }

export function render(scene, cam, W, H, q = 1, ss = null, win = null) {
  const ox = win ? win.x : 0, oy = win ? win.y : 0;
  const w = Math.max(1, Math.round(W * q)), h = Math.max(1, Math.round(H * q));
  const S = ss ?? (q >= 2 ? 1 : 2);
  const data = new Uint8ClampedArray(w * h * 4);
  const ids = new Int32Array(w * h);
  const L = scene.light, isPoint = L.kind === 'point';
  const LX = isPoint ? L.pos.x : L.dir.x, LY = isPoint ? L.pos.y : L.dir.y, LZ = isPoint ? L.pos.z : L.dir.z;
  const amb = scene.ambient ?? 0.42, dif = scene.diffuse ?? 0.62, shStr = scene.shadowStrength ?? 0.62;
  const sky0 = scene.sky ? scene.sky[0] : [236, 240, 245], sky1 = scene.sky ? scene.sky[1] : [214, 222, 230];
  const fl = scene.floor, flRGB = fl ? hexRGB(fl.color) : null, tlRGB = fl && fl.tileColor ? hexRGB(fl.tileColor) : null;
  const ao = scene.ao, haze = scene.haze;
  const EX = cam.eye.x, EY = cam.eye.y, EZ = cam.eye.z, Fv = cam.f, Rv = cam.r, Uv = cam.u, FOV = cam.fov, CX = cam.cx, CY = cam.cy;
  const col = [0, 0, 0];
  const shade = (sx, sy) => {
    const a = (sx - CX) / FOV, bb = (CY - sy) / FOV;
    let dx = Fv.x + a * Rv.x + bb * Uv.x, dy = Fv.y + a * Rv.y + bb * Uv.y, dz = Fv.z + a * Rv.z + bb * Uv.z;
    const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz); dx *= il; dy *= il; dz *= il;
    if (!traceS(scene, EX, EY, EZ, dx, dy, dz, sx, sy)) {
      const tt = clamp01(sy / (scene.skyH || H));
      col[0] = sky0[0] + (sky1[0] - sky0[0]) * tt; col[1] = sky0[1] + (sky1[1] - sky0[1]) * tt; col[2] = sky0[2] + (sky1[2] - sky0[2]) * tt;
      return 0;
    }
    const t = TR_T, prim = TR_PRIM, nx = TR_NX, ny = TR_NY, nz = TR_NZ;
    const px = EX + dx * t, py = EY + dy * t, pz = EZ + dz * t;
    const pox = px + nx * 0.02, poy = py + ny * 0.02, poz = pz + nz * 0.02;
    let lx, ly, lz, ldist;
    if (isPoint) { lx = LX - pox; ly = LY - poy; lz = LZ - poz; ldist = Math.sqrt(lx * lx + ly * ly + lz * lz); lx /= ldist; ly /= ldist; lz /= ldist; }
    else { lx = LX; ly = LY; lz = LZ; ldist = Infinity; }
    const lit = shStr > 0 && occludedS(scene, pox, poy, poz, lx, ly, lz, ldist, null) ? 0 : 1;
    let base;
    if (!prim) {
      base = flRGB;
      if (fl.tile) {
        const tx = px / fl.tile, tz = pz / fl.tile;
        const fx = tx - Math.floor(tx), fz = tz - Math.floor(tz);
        const lw = (fl.line ?? 0.035);
        if (tlRGB && (fx < lw || fx > 1 - lw || fz < lw || fz > 1 - lw)) {
          const fade = fl.fade ? clamp01((fl.fade[1] - t) / (fl.fade[1] - fl.fade[0])) : 1;
          base = fade >= 1 ? tlRGB : [base[0] + (tlRGB[0] - base[0]) * fade, base[1] + (tlRGB[1] - base[1]) * fade, base[2] + (tlRGB[2] - base[2]) * fade];
        }
      }
      if (fl.decal) { const dc = fl.decal(px, pz); if (dc) base = dc; }
    } else base = prim._rgb || (prim._rgb = hexRGB(prim.color));
    const lf = lit ? 1 : 1 - shStr;
    let k;
    if (!prim) {
      k = amb + (scene.floorFlat ? (scene.floorLight ?? dif) : dif * (ly > 0 ? ly : 0)) * lf;
    } else if (prim.flat != null) {
      k = (prim.flat + 0.07 * ny) * (prim.noShadow ? 1 - 0.55 * shStr * (1 - lit) : 1);
    } else {
      const ndl = nx * lx + ny * ly + nz * lz;
      k = amb + dif * (ndl > 0 ? ndl : 0) * lf + 0.10 * (ny * 0.5 + 0.5);
    }
    let occ = 1;
    if (ao) {
      const skip = prim ? prim.id : null, reach = 2 * ao.dist;
      if (sceneSdfS(scene, px, py, pz, skip, reach, !prim) < reach) {
        let sum = 0, wgt = 0.5;
        for (let i = 1; i <= 4; i++) {
          const dd = ao.dist * i / 4;
          const qd = sceneSdfS(scene, px + nx * dd, py + ny * dd, pz + nz * dd, skip, dd, false);
          sum += wgt * (dd - qd > 0 ? dd - qd : 0) / ao.dist;
          wgt *= 0.5;
        }
        occ = 1 - clamp01(sum * ao.strength * 2.2);
      }
    }
    const tint = prim && prim.emissive ? 1.0 : k * occ;
    col[0] = base[0] * tint; col[1] = base[1] * tint; col[2] = base[2] * tint;
    if (haze && t > haze.near) {
      const hz = clamp01((t - haze.near) / (haze.far - haze.near)) * haze.max, hc = haze.rgb;
      col[0] += (hc[0] - col[0]) * hz; col[1] += (hc[1] - col[1]) * hz; col[2] += (hc[2] - col[2]) * hz;
    }
    if (prim && prim.k === 0 && lit && !prim.emissive) {
      let hx = lx - dx, hy = ly - dy, hz = lz - dz; const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      const hd = (nx * hx + ny * hy + nz * hz) / hl, sp = Math.pow(hd > 0 ? hd : 0, 40) * 0.35 * 255;
      col[0] += sp; col[1] += sp; col[2] += sp;
    }
    return prim ? prim.id : -1;
  };
  let i = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0, id0 = 0;
      for (let a = 0; a < S; a++) for (let c = 0; c < S; c++) {
        const sx = ox + (px + (c + 0.5) / S) / q, sy = oy + (py + (a + 0.5) / S) / q;
        const id = shade(sx, sy);
        if (a === 0 && c === 0) id0 = id;
        r += col[0]; g += col[1]; b += col[2];
      }
      const n = S * S;
      data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n; data[i + 3] = 255;
      ids[py * w + px] = id0;
      i += 4;
    }
  }
  if (scene.outline) {
    const k = 1 - scene.outline;
    const mark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, a = ids[j];
      if (x + 1 < w && ids[j + 1] !== a && (a > 0 || ids[j + 1] > 0)) { mark[j] = 1; mark[j + 1] = 1; }
      if (y + 1 < h && ids[j + w] !== a && (a > 0 || ids[j + w] > 0)) { mark[j] = 1; mark[j + w] = 1; }
    }
    for (let j = 0; j < w * h; j++) if (mark[j]) { data[j * 4] *= k; data[j * 4 + 1] *= k; data[j * 4 + 2] *= k; }
  }
  return { w, h, data, ids };
}

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h)
    : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 2) / 2)); } catch { return 1; }
}

export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}
export function clipConvex(subject, clip) {
  let out = subject.slice();
  const ccw = polyArea(clip) > 0;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = (p) => { const v = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); return ccw ? v : -v; };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], qq = inp[(j + 1) % inp.length], sp = side(p), sq = side(qq);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push({ x: p.x + t * (qq.x - p.x), y: p.y + t * (qq.y - p.y) }); }
    }
  }
  return out;
}
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < a.x + (b.x - a.x) * (pt.y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}
export function silhouette(p, cam, n = 32) {
  if (p.k === 0) {
    const v = sub(p.c, cam.eye), dd = len(v), u = mul(v, 1 / dd);
    const cc = sub(p.c, mul(u, p.r * p.r / dd)), rr = p.r * Math.sqrt(Math.max(0, 1 - (p.r * p.r) / (dd * dd)));
    const ref = Math.abs(u.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const e1 = unit(cross(u, ref)), e2 = cross(u, e1);
    const out = [];
    for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; out.push(cam.project(add(cc, add(mul(e1, rr * Math.cos(t)), mul(e2, rr * Math.sin(t)))))); }
    return convexHull(out);
  }
  return convexHull(surfacePoints(p, n).map((q) => cam.project(q)));
}
