const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulv = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vec = { dot, sub, add, mulv, cross, norm };

export function makeCam({ pos, yaw, pitch = 0, f, W, H, cx = W / 2, cy = H / 2, proj = 'pin' }) {
  const ya = yaw * Math.PI / 180, pa = pitch * Math.PI / 180;
  const fwd = [Math.sin(ya) * Math.cos(pa), Math.sin(pa), Math.cos(ya) * Math.cos(pa)];
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const cam = { pos: pos.slice(), yaw, pitch, fwd, right, up, f, W, H, cx, cy, proj };
  cam.ray = (px, py) => {
    if (proj === 'cyl') {
      const phi = (px - cx) / f, h = -(py - cy) / f;
      return norm(add(add(mulv(fwd, Math.cos(phi)), mulv(right, Math.sin(phi))), mulv(up, h)));
    }
    return norm(add(add(fwd, mulv(right, (px - cx) / f)), mulv(up, -(py - cy) / f)));
  };
  cam.project = (p) => {
    const d = sub(p, cam.pos);
    const zf = dot(d, fwd), xr = dot(d, right), yu = dot(d, up);
    if (proj === 'cyl') {
      const rho = Math.hypot(zf, xr);
      return { x: cx + f * Math.atan2(xr, zf), y: cy - f * yu / Math.max(1e-9, rho), depth: rho, front: zf > 0 };
    }
    return { x: cx + f * xr / Math.max(1e-9, zf), y: cy - f * yu / Math.max(1e-9, zf), depth: zf, front: zf > 1e-6 };
  };
  return cam;
}

function planesBound(planes, pts) {
  const c = mulv(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  return { bc: c, br: r + 1e-6 };
}
export function box({ c, h, yaw = 0, col, id }) {
  const a = yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const ax = [ca, 0, -sa], az = [sa, 0, ca], ay = [0, 1, 0];
  const planes = [];
  for (const [ax3, hh] of [[ax, h[0]], [ay, h[1]], [az, h[2]]]) {
    planes.push({ n: ax3, d: dot(ax3, c) + hh });
    planes.push({ n: mulv(ax3, -1), d: -dot(ax3, c) + hh });
  }
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    corners.push(add(add(add(c, mulv(ax, sx * h[0])), mulv(ay, sy * h[1])), mulv(az, sz * h[2])));
  return { k: 'poly', planes, corners, col, id, ...planesBound(planes, corners) };
}
export function gable({ c, w, d, y0, y1, yaw = 0, col, id }) {
  const a = yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const ax = [ca, 0, -sa], az = [sa, 0, ca];
  const P = (lx, y, lz) => [c[0] + ax[0] * lx + az[0] * lz, y, c[2] + ax[2] * lx + az[2] * lz];
  const hw = w / 2, hd = d / 2, rise = y1 - y0;
  const slopeL = norm([-rise, hw, 0]), slopeR = norm([rise, hw, 0]);
  const toW = (nl) => norm([ax[0] * nl[0] + az[0] * nl[2], nl[1], ax[2] * nl[0] + az[2] * nl[2]]);
  const nL = toW(slopeL), nR = toW(slopeR);
  const planes = [
    { n: [0, -1, 0], d: -y0 },
    { n: nL, d: dot(nL, P(-hw, y0, 0)) },
    { n: nR, d: dot(nR, P(hw, y0, 0)) },
    { n: az, d: dot(az, P(0, y0, hd)) },
    { n: mulv(az, -1), d: -dot(az, P(0, y0, -hd)) },
  ];
  const corners = [P(-hw, y0, -hd), P(hw, y0, -hd), P(-hw, y0, hd), P(hw, y0, hd), P(0, y1, -hd), P(0, y1, hd)];
  return { k: 'poly', planes, corners, col, id, ...planesBound(planes, corners) };
}
export function cyl({ x, z, r, y0 = 0, y1, col, id }) {
  const bc = [x, (y0 + y1) / 2, z];
  return { k: 'cyl', x, z, r, y0, y1, col, id, bc, br: Math.hypot(r, (y1 - y0) / 2) + 1e-6 };
}
export function sph({ c, r, col, id }) { return { k: 'sph', c, r, col, id, bc: c, br: r + 1e-6 }; }
export function cone({ x, z, r, y0 = 0, y1, col, id }) {
  const bc = [x, (y0 + y1) / 2, z];
  return { k: 'cone', x, z, r, y0, y1, col, id, bc, br: Math.hypot(r, (y1 - y0) / 2) + 1e-6 };
}

function hit(p, o, d, tmin) {
  const ox0 = o[0] - p.bc[0], oy0 = o[1] - p.bc[1], oz0 = o[2] - p.bc[2];
  const b = ox0 * d[0] + oy0 * d[1] + oz0 * d[2], cc = ox0 * ox0 + oy0 * oy0 + oz0 * oz0 - p.br * p.br;
  if (cc > 0 && b > 0) return null;
  if (b * b - cc < 0) return null;
  if (p.k === 'poly') {
    let tn = -Infinity, tf = Infinity, nn = null;
    for (const pl of p.planes) {
      const den = dot(pl.n, d), num = pl.d - dot(pl.n, o);
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = num / den;
      if (den < 0) { if (t > tn) { tn = t; nn = pl.n; } } else if (t < tf) tf = t;
      if (tn > tf) return null;
    }
    if (tn > tmin && tn <= tf && nn) return { t: tn, n: nn };
    return null;
  }
  if (p.k === 'sph') {
    const disc = b * b - cc, s = Math.sqrt(disc);
    let t = -b - s; if (t <= tmin) t = -b + s; if (t <= tmin) return null;
    const q = add(o, mulv(d, t));
    return { t, n: norm(sub(q, p.c)) };
  }
  if (p.k === 'cyl') {
    let best = null;
    const ox = o[0] - p.x, oz = o[2] - p.z;
    const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), C = ox * ox + oz * oz - p.r * p.r;
    if (A > 1e-12) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        for (const t of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) {
          if (t <= tmin) continue;
          const y = o[1] + d[1] * t;
          if (y < p.y0 || y > p.y1) continue;
          best = { t, n: norm([ox + d[0] * t, 0, oz + d[2] * t]) };
          break;
        }
      }
    }
    for (const [yc, ny] of [[p.y1, 1], [p.y0, -1]]) {
      if (Math.abs(d[1]) < 1e-12) continue;
      const t = (yc - o[1]) / d[1];
      if (t <= tmin || (best && t >= best.t)) continue;
      const x = ox + d[0] * t, z = oz + d[2] * t;
      if (x * x + z * z <= p.r * p.r) best = { t, n: [0, ny, 0] };
    }
    return best;
  }
  if (p.k === 'cone') {
    const k = p.r / (p.y1 - p.y0), k2 = k * k;
    const ox = o[0] - p.x, oz = o[2] - p.z, oy = p.y1 - o[1];
    const A = d[0] * d[0] + d[2] * d[2] - k2 * d[1] * d[1];
    const B = 2 * (ox * d[0] + oz * d[2] + k2 * oy * d[1]);
    const C = ox * ox + oz * oz - k2 * oy * oy;
    let best = null;
    const tryT = (t) => {
      if (t <= tmin || (best && t >= best.t)) return;
      const y = o[1] + d[1] * t;
      if (y < p.y0 || y > p.y1) return;
      const x = ox + d[0] * t, z = oz + d[2] * t;
      const rr = Math.hypot(x, z) || 1e-9;
      best = { t, n: norm([x / rr, k, z / rr]) };
    };
    if (Math.abs(A) > 1e-12) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) { const s = Math.sqrt(disc); tryT((-B - s) / (2 * A)); tryT((-B + s) / (2 * A)); }
    } else if (Math.abs(B) > 1e-12) tryT(-C / B);
    if (Math.abs(d[1]) > 1e-12) {
      const t = (p.y0 - o[1]) / d[1];
      if (t > tmin && (!best || t < best.t)) {
        const x = ox + d[0] * t, z = oz + d[2] * t;
        if (x * x + z * z <= p.r * p.r) best = { t, n: [0, -1, 0] };
      }
    }
    return best;
  }
  return null;
}

export function castRay(scene, o, d, tmin = 1e-4, tmax = Infinity) {
  let best = null;
  for (const p of scene.prims) {
    const h = hit(p, o, d, tmin);
    if (h && h.t < tmax && (!best || h.t < best.t)) best = { ...h, prim: p };
  }
  if (scene.ground !== false && d[1] < -1e-9) {
    const t = -o[1] / d[1];
    if (t > tmin && t < tmax && (!best || t < best.t)) best = { t, n: [0, 1, 0], prim: null };
  }
  return best;
}
export function visible(scene, from, q, tol = 1e-3) {
  const v = sub(q, from), L = Math.hypot(v[0], v[1], v[2]);
  const h = castRay(scene, from, mulv(v, 1 / L), 1e-4, L - tol);
  return !h;
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function groundColor(g, x, z, dist = 0) {
  const base = g.base;
  if (g.kind === 'paving') {
    const fade = Math.exp(-dist / (g.fade || 22));
    const rot = g.rot || 0, cr = Math.cos(rot), sr = Math.sin(rot);
    const s = g.tile, u = (x * cr - z * sr) / s, v = (x * sr + z * cr) / s, iu = Math.floor(u), iv = Math.floor(v);
    const fu = u - iu, fv = v - iv, e = g.joint / s;
    const ta = g.tintAmp ?? 0.2, jd = g.jointDark ?? 0.22;
    const tint = 1 + fade * (ta * hash2(iu, iv) - ta / 2);
    if (fu < e || fv < e) return mulv(base, 1 - jd * fade);
    return mulv(base, tint);
  }
  if (g.kind === 'table') {
    const fade = Math.exp(-dist / (g.fade || 9));
    const plank = Math.floor(z / g.plank), fz = z / g.plank - plank;
    const grain = 1 + fade * 0.03 * Math.sin(x * 5.3 + plank * 1.7 + Math.sin(x * 0.9 + plank) * 1.5);
    const edge = fz < 0.025 ? 1 - 0.16 * fade : 1;
    return mulv(base, grain * edge * (1 + fade * (0.08 * hash2(plank, 7) - 0.04)));
  }
  if (g.kind === 'grass') {
    const s = g.tile, iu = Math.floor(x / s), iv = Math.floor(z / s);
    return mulv(base, 0.92 + 0.16 * hash2(iu, iv));
  }
  return base;
}
function screenBox(p, cam) {
  const c = p.bc, r = p.br;
  const xs = [], ys = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const q = cam.project([c[0] + sx * r, c[1] + sy * r, c[2] + sz * r]);
    if (!q.front || q.depth < 0.05) return null;
    xs.push(q.x); ys.push(q.y);
  }
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (cam.proj === 'cyl') {
    const d = sub(c, cam.pos), rho = Math.hypot(dot(d, cam.fwd), dot(d, cam.right));
    if (rho <= r * 1.05) return null;
    const phi = Math.atan2(dot(d, cam.right), dot(d, cam.fwd)), half = Math.asin(r / rho);
    x0 = cam.cx + cam.f * (phi - half); x1 = cam.cx + cam.f * (phi + half);
  }
  return { x0: x0 - 2, x1: x1 + 2, y0: Math.min(...ys) - 2, y1: Math.max(...ys) + 2 };
}
function shadowBox(p, L) {
  const c = p.bc, r = p.br, t = c[1] / Math.max(0.05, L[1]);
  const gx = c[0] - L[0] * t, gz = c[2] - L[2] * t, pad = r / Math.max(0.05, L[1]) + r;
  return { x0: Math.min(c[0], gx) - pad, x1: Math.max(c[0], gx) + pad, z0: Math.min(c[2], gz) - pad, z1: Math.max(c[2], gz) + pad };
}
export function render(scene, cam, q = 1) {
  const ss = q >= 2 ? 1 : 2, k = q * ss;
  const w = Math.round(cam.W * k), h = Math.round(cam.H * k);
  const col = new Float32Array(w * h * 3), ids = new Int32Array(w * h), dep = new Float32Array(w * h);
  const sun = norm(scene.sun || [-0.4, 0.8, -0.35]);
  const sky = scene.sky || { top: [168, 200, 232], horizon: [226, 234, 240] };
  const fog = scene.fog || null;
  const prims = scene.prims, np = prims.length;
  const boxes = prims.map((p) => screenBox(p, cam));
  const sboxes = prims.map((p) => shadowBox(p, sun));
  const groundOn = scene.ground !== false;
  const rowIdx = new Int32Array(np);
  for (let py = 0; py < h; py++) {
    const Y = (py + 0.5) / k;
    let nr = 0;
    for (let j = 0; j < np; j++) { const b = boxes[j]; if (!b || (Y >= b.y0 && Y <= b.y1)) rowIdx[nr++] = j; }
    for (let px = 0; px < w; px++) {
      const i = py * w + px, X = (px + 0.5) / k;
      const d = cam.ray(X, Y);
      let hh = null;
      for (let r = 0; r < nr; r++) {
        const j = rowIdx[r], b = boxes[j];
        if (b && (X < b.x0 || X > b.x1)) continue;
        const t = hit(prims[j], cam.pos, d, 1e-4);
        if (t && (!hh || t.t < hh.t)) hh = { t: t.t, n: t.n, prim: prims[j] };
      }
      if (groundOn && d[1] < -1e-9) {
        const t = -cam.pos[1] / d[1];
        if (t > 1e-4 && (!hh || t < hh.t)) hh = { t, n: [0, 1, 0], prim: null };
      }
      let c;
      if (!hh) {
        const t = Math.max(0, Math.min(1, d[1] * 2.2));
        c = [sky.horizon[0] + (sky.top[0] - sky.horizon[0]) * t, sky.horizon[1] + (sky.top[1] - sky.horizon[1]) * t, sky.horizon[2] + (sky.top[2] - sky.horizon[2]) * t];
        ids[i] = -2; dep[i] = 1e9;
      } else {
        const P = [cam.pos[0] + d[0] * hh.t, cam.pos[1] + d[1] * hh.t, cam.pos[2] + d[2] * hh.t];
        const n = hh.n;
        const base = hh.prim ? hh.prim.col : groundColor(scene.ground, P[0], P[2], hh.t);
        const ndl = Math.max(0, dot(n, sun));
        let lit = 0;
        if (ndl > 0) {
          lit = 1;
          const o2 = [P[0] + n[0] * 1e-3, P[1] + n[1] * 1e-3, P[2] + n[2] * 1e-3];
          for (let j = 0; j < np; j++) {
            if (!hh.prim) { const sb = sboxes[j]; if (P[0] < sb.x0 || P[0] > sb.x1 || P[2] < sb.z0 || P[2] > sb.z1) continue; }
            if (hit(prims[j], o2, sun, 1e-4)) { lit = 0; break; }
          }
        }
        const amb = (scene.ambient ?? 0.42) + 0.14 * n[1];
        let s = amb + 0.62 * ndl * lit;
        if (!hh.prim) s = 0.62 + 0.4 * lit;
        c = [base[0] * s, base[1] * s, base[2] * s];
        if (fog) {
          const a = 1 - Math.exp(-hh.t / fog.dist);
          c = [c[0] + (fog.col[0] - c[0]) * a, c[1] + (fog.col[1] - c[1]) * a, c[2] + (fog.col[2] - c[2]) * a];
        }
        ids[i] = hh.prim ? hh.prim.id : -1; dep[i] = hh.t;
      }
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
  }
  const ink = scene.ink || [40, 46, 54], ow = scene.outline ?? 0.75;
  const out = new Float32Array(col);
  for (let py = 1; py < h - 1; py++) for (let px = 1; px < w - 1; px++) {
    const i = py * w + px, id = ids[i];
    let edge = false;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (ids[j] === id) continue;
      if (id >= 0 || ids[j] >= 0) {
        if (id >= 0 && (ids[j] < 0 || dep[j] > dep[i] + 1e-3)) { edge = true; break; }
      }
    }
    if (edge) { const o = i * 3; out[o] = out[o] * (1 - ow) + ink[0] * ow; out[o + 1] = out[o + 1] * (1 - ow) + ink[1] * ow; out[o + 2] = out[o + 2] * (1 - ow) + ink[2] * ow; }
  }
  const OW = Math.round(cam.W * q), OH = Math.round(cam.H * q);
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const ix = x * ss + sx, iy = y * ss + sy;
      if (ix >= w || iy >= h) continue;
      const o = (iy * w + ix) * 3; r += out[o]; g += out[o + 1]; b += out[o + 2]; n++;
    }
    const o = (y * OW + x) * 4;
    data[o] = clamp(r / n); data[o + 1] = clamp(g / n); data[o + 2] = clamp(b / n); data[o + 3] = 255;
  }
  return { data, w: OW, h: OH, q };
}

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
