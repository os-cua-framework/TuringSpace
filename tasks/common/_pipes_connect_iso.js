const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function makeIsoCam({ yaw, pitch, scale, ox, oy }) {
  const th = yaw * Math.PI / 180, ph = pitch * Math.PI / 180;
  const R = [Math.cos(th), 0, -Math.sin(th)];
  const U = [-Math.sin(th) * Math.sin(ph), Math.cos(ph), -Math.cos(th) * Math.sin(ph)];
  const V = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
  return makeCam(R, U, V, scale, ox, oy);
}
function makeCam(R, U, V, s, ox, oy) {
  return {
    R, U, V, s, ox, oy,
    project(p) { return { x: ox + s * dot(p, R), y: oy - s * dot(p, U), d: dot(p, V) }; },
    unproject(x, y, planeY = 0) {
      const u = (x - ox) / s, v = (oy - y) / s, w = (planeY - v * U[1]) / V[1];
      return [u * R[0] + v * U[0] + w * V[0], planeY, u * R[2] + v * U[2] + w * V[2]];
    },
  };
}

export const prim = {
  capsule: (a, b, r, m, g = 0) => ({ k: 0, a, b, r, m, g }),
  cyl: (a, b, r, m, g = 0) => ({ k: 1, a, b, r, m, g }),
  sphere: (c, r, m, g = 0) => ({ k: 2, a: c, b: c, r, m, g }),
  box: (lo, hi, m, g = 0) => ({ k: 3, a: lo, b: hi, r: 0, m, g }),
};

export function tube(points, r, m, g = 0, out = [], flatEnds = false) {
  const last = points.length - 2;
  for (let i = 0; i <= last; i++) {
    const flat = flatEnds && (i === 0 || i === last);
    out.push(flat ? prim.cyl(points[i], points[i + 1], r, m, g) : prim.capsule(points[i], points[i + 1], r, m, g));
    if (flat && last > 0) out.push(prim.sphere(i === 0 ? points[1] : points[i], r, m, g));
  }
  return out;
}

function rasterise(prims, cam, W, H, k, floor, wantShade) {
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const n = w * h;
  const depth = new Float32Array(n).fill(-1e9);
  const nx = wantShade ? new Float32Array(n) : null, ny = wantShade ? new Float32Array(n) : null, nz = wantShade ? new Float32Array(n) : null;
  const mat = wantShade ? new Int16Array(n).fill(-1) : null;
  const grp = wantShade ? new Int32Array(n).fill(-1) : null;
  const { R, U, V, s, ox, oy } = cam;
  const toView = (p) => [dot(p, R), dot(p, U), dot(p, V)];
  const put = (i, d, vx, vy, vz, m, g) => {
    if (d <= depth[i]) return;
    depth[i] = d;
    if (wantShade) {
      nx[i] = vx * R[0] + vy * U[0] + vz * V[0];
      ny[i] = vx * R[1] + vy * U[1] + vz * V[1];
      nz[i] = vx * R[2] + vy * U[2] + vz * V[2];
      mat[i] = m; grp[i] = g;
    }
  };
  const u0 = (px) => ((px + 0.5) / k - ox) / s;
  const v0 = (py) => (oy - (py + 0.5) / k) / s;

  if (floor) {
    const fy = floor.y;
    for (let py = 0; py < h; py++) {
      const v = v0(py);
      for (let px = 0; px < w; px++) {
        const u = u0(px);
        const ww = (fy - v * U[1]) / V[1];
        const X = u * R[0] + v * U[0] + ww * V[0], Z = u * R[2] + v * U[2] + ww * V[2];
        if (X < floor.lo[0] || X > floor.hi[0] || Z < floor.lo[1] || Z > floor.hi[1]) continue;
        const i = py * w + px;
        if (ww > depth[i]) { depth[i] = ww; if (wantShade) { nx[i] = 0; ny[i] = 1; nz[i] = 0; mat[i] = floor.m; grp[i] = -2; } }
      }
    }
  }

  for (let pi = 0; pi < prims.length; pi++) {
    const p = prims[pi];
    const r = p.r;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const lo = [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r];
    const hi = [Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r];
    for (let c = 0; c < 8; c++) {
      const q = [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
      const sx = (ox + s * dot(q, R)) * k, sy = (oy - s * dot(q, U)) * k;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    const X0 = Math.max(0, Math.floor(x0) - 1), X1 = Math.min(w - 1, Math.ceil(x1) + 1);
    const Y0 = Math.max(0, Math.floor(y0) - 1), Y1 = Math.min(h - 1, Math.ceil(y1) + 1);
    if (X0 > X1 || Y0 > Y1) continue;

    if (p.k === 3) {
      const F = [-V[0], -V[1], -V[2]];
      for (let py = Y0; py <= Y1; py++) {
        const v = v0(py);
        for (let px = X0; px <= X1; px++) {
          const u = u0(px);
          const O = [u * R[0] + v * U[0] + 50 * V[0], u * R[1] + v * U[1] + 50 * V[1], u * R[2] + v * U[2] + 50 * V[2]];
          let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
          let miss = false;
          for (let a = 0; a < 3; a++) {
            if (Math.abs(F[a]) < 1e-12) { if (O[a] < p.a[a] || O[a] > p.b[a]) { miss = true; break; } continue; }
            let t1 = (p.a[a] - O[a]) / F[a], t2 = (p.b[a] - O[a]) / F[a], sgn = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
            if (t1 > tn) { tn = t1; ax = a; sg = sgn; }
            if (t2 < tf) tf = t2;
            if (tn > tf) { miss = true; break; }
          }
          if (miss || ax < 0) continue;
          const d = 50 - tn;
          const i = py * w + px;
          if (d <= depth[i]) continue;
          const nW = [0, 0, 0]; nW[ax] = sg;
          put(i, d, dot(nW, R), dot(nW, U), dot(nW, V), p.m, p.g);
        }
      }
      continue;
    }

    const A = toView(p.a), B = toView(p.b);
    const r2 = r * r;
    if (p.k === 2) {
      for (let py = Y0; py <= Y1; py++) {
        const dv = v0(py) - A[1];
        for (let px = X0; px <= X1; px++) {
          const du = u0(px) - A[0];
          const q = r2 - du * du - dv * dv;
          if (q < 0) continue;
          const sq = Math.sqrt(q);
          put(py * w + px, A[2] + sq, du / r, dv / r, sq / r, p.m, p.g);
        }
      }
      continue;
    }
    let du_ = B[0] - A[0], dv_ = B[1] - A[1], dw_ = B[2] - A[2];
    const L = Math.hypot(du_, dv_, dw_);
    if (L < 1e-9) continue;
    du_ /= L; dv_ /= L; dw_ /= L;
    const qa = 1 - dw_ * dw_;
    for (let py = Y0; py <= Y1; py++) {
      const vv = v0(py);
      for (let px = X0; px <= X1; px++) {
        const uu = u0(px);
        const mu = uu - A[0], mv = vv - A[1];
        const al = mu * du_ + mv * dv_;
        let best = -1e9, bx = 0, by = 0, bz = 0;
        if (qa > 1e-9) {
          const qb = -2 * al * dw_, qc = mu * mu + mv * mv - al * al - r2;
          const disc = qb * qb - 4 * qa * qc;
          if (disc >= 0) {
            const mw = (-qb + Math.sqrt(disc)) / (2 * qa);
            const pr = al + mw * dw_;
            if (pr >= 0 && pr <= L) {
              best = A[2] + mw;
              bx = (mu - pr * du_) / r; by = (mv - pr * dv_) / r; bz = (mw - pr * dw_) / r;
            }
          }
        }
        if (p.k === 0) {
          for (let e = 0; e < 2; e++) {
            const C = e ? B : A;
            const cu = uu - C[0], cv = vv - C[1];
            const q = r2 - cu * cu - cv * cv;
            if (q < 0) continue;
            const sq = Math.sqrt(q);
            if (C[2] + sq > best) { best = C[2] + sq; bx = cu / r; by = cv / r; bz = sq / r; }
          }
        } else if (Math.abs(dw_) > 1e-9) {
          for (let e = 0; e < 2; e++) {
            const C = e ? B : A;
            const cu = uu - C[0], cv = vv - C[1];
            const mw = -(cu * du_ + cv * dv_) / dw_;
            if (cu * cu + cv * cv + mw * mw > r2) continue;
            if (C[2] + mw > best) { best = C[2] + mw; const sg = e ? 1 : -1; bx = sg * du_; by = sg * dv_; bz = sg * dw_; }
          }
        }
        if (best > -1e8) put(py * w + px, best, bx, by, bz, p.m, p.g);
      }
    }
  }
  return { w, h, k, depth, nx, ny, nz, mat, grp };
}

export const MATERIALS = {
  pipe: { c: [146, 160, 172], kd: 0.62, ks: 0.5, sh: 30, kind: 1 },
  pipeDark: { c: [112, 124, 136], kd: 0.6, ks: 0.4, sh: 24, kind: 1 },
  brass: { c: [201, 158, 74], kd: 0.8, ks: 0.75, sh: 34, kind: 1 },
  cap: { c: [70, 78, 86], kd: 0.7, ks: 0.35, sh: 20, kind: 1 },
  slab: { c: [220, 215, 204], kd: 0.6, ks: 0.04, sh: 8, kind: 0 },
  floor: { c: [150, 156, 162], kd: 0.6, ks: 0.0, sh: 1, kind: 2 },
  floorLight: { c: [222, 226, 230], kd: 0.55, ks: 0.0, sh: 1, kind: 2 },
  base: { c: [128, 136, 144], kd: 0.6, ks: 0.05, sh: 6, kind: 0 },
  tankBlue: { c: [96, 150, 205], kd: 0.8, ks: 0.35, sh: 22, kind: 1 },
  tankWhite: { c: [232, 234, 236], kd: 0.8, ks: 0.3, sh: 22, kind: 1 },
  tankPaint: { c: [206, 222, 236], kd: 0.62, ks: 0.25, sh: 18, kind: 0 },
  water: { c: [70, 140, 215], kd: 0.6, ks: 0.6, sh: 40, kind: 1 },
  red: { c: [196, 72, 60], kd: 0.8, ks: 0.4, sh: 26, kind: 1 },
  steelDark: { c: [88, 96, 104], kd: 0.75, ks: 0.3, sh: 18, kind: 1 },
  rack: { c: [150, 132, 104], kd: 0.8, ks: 0.15, sh: 10, kind: 0 },
  green: { c: [104, 170, 120], kd: 0.8, ks: 0.3, sh: 22, kind: 1 },
  drain: { c: [60, 66, 72], kd: 0.7, ks: 0.2, sh: 10, kind: 0 },
};

export function renderScene(scene, cam, W, H, q = 1) {
  const ss = q >= 2 ? 1 : 2;
  const k = q * ss;
  const mats = scene.mats || MATERIALS;
  const matList = Object.keys(mats);
  const matIndex = Object.fromEntries(matList.map((m, i) => [m, i]));
  const prims = scene.prims.map((p) => ({ ...p, m: matIndex[p.m] ?? 0 }));
  const floor = scene.floor ? { ...scene.floor, m: matIndex[scene.floor.m] ?? 0 } : null;
  const G = rasterise(prims, cam, W, H, k, floor, true);

  const Ld = norm(scene.light || [-0.45, 1, -0.3]);
  const up0 = Math.abs(Ld[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let Rl = norm([up0[1] * Ld[2] - up0[2] * Ld[1], up0[2] * Ld[0] - up0[0] * Ld[2], up0[0] * Ld[1] - up0[1] * Ld[0]]);
  const Ul = norm([Ld[1] * Rl[2] - Ld[2] * Rl[1], Ld[2] * Rl[0] - Ld[0] * Rl[2], Ld[0] * Rl[1] - Ld[1] * Rl[0]]);
  const ext = scene.extent || { lo: [-1, 0, -1], hi: [8, 2, 8] };
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let c = 0; c < 8; c++) {
    const pnt = [c & 1 ? ext.hi[0] : ext.lo[0], c & 2 ? ext.hi[1] : ext.lo[1], c & 4 ? ext.hi[2] : ext.lo[2]];
    const u = dot(pnt, Rl), v = dot(pnt, Ul);
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
  }
  const SL = 110;
  const lcam = makeCam(Rl, Ul, Ld, SL, -umin * SL + 2, vmax * SL + 2);
  const LW = Math.ceil((umax - umin) * SL) + 4, LH = Math.ceil((vmax - vmin) * SL) + 4;
  const SM = rasterise(prims, lcam, LW, LH, 1, floor ? { ...floor, lo: floor.lo, hi: floor.hi } : null, false);

  const HT = 60;
  const tcam = makeCam([1, 0, 0], [0, 0, -1], [0, 1, 0], HT, -ext.lo[0] * HT + 2, -ext.lo[2] * HT + 2);
  const TW = Math.ceil((ext.hi[0] - ext.lo[0]) * HT) + 4, TH = Math.ceil((ext.hi[2] - ext.lo[2]) * HT) + 4;
  const HM = rasterise(prims, tcam, TW, TH, 1, null, false);

  const { w, h, depth, nx, ny, nz, mat, grp } = G;
  const col = new Float32Array(w * h * 3);
  const bg = scene.bg || [236, 240, 244];
  const Vv = cam.V;
  const Hh = norm([Ld[0] + Vv[0], Ld[1] + Vv[1], Ld[2] + Vv[2]]);
  const pcf = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
  const aoK = [[0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08], [0.16, 0.05], [-0.16, -0.05], [0.05, -0.16], [-0.05, 0.16], [0.24, -0.1], [-0.24, 0.1], [0.1, 0.24], [-0.1, -0.24]];
  const grid = scene.floor?.grid;
  const fill = scene.fill === null ? null : norm(scene.fill || [0.8, 0.45, 0.35]);
  const tint = scene.tint || null, fpW = 1 / (cam.s * k), TX = [0, 0, 0];
  for (let py = 0; py < h; py++) {
    const vv = (cam.oy - (py + 0.5) / k) / cam.s;
    for (let px = 0; px < w; px++) {
      const i = py * w + px, o = i * 3;
      if (depth[i] < -1e8) { col[o] = bg[0]; col[o + 1] = bg[1]; col[o + 2] = bg[2]; continue; }
      const uu = ((px + 0.5) / k - cam.ox) / cam.s, ww = depth[i];
      const P = [uu * cam.R[0] + vv * cam.U[0] + ww * Vv[0], uu * cam.R[1] + vv * cam.U[1] + ww * Vv[1], uu * cam.R[2] + vv * cam.U[2] + ww * Vv[2]];
      const M = mats[matList[mat[i]]] || MATERIALS.pipe;
      const N = [nx[i], ny[i], nz[i]];
      const ndl = dot(N, Ld);
      let lit = 0;
      if (ndl > 0) {
        const lu = lcam.ox + SL * dot(P, Rl), lv = lcam.oy - SL * dot(P, Ul), ld = dot(P, Ld);
        const bias = 0.012 + 0.03 * (1 - ndl);
        for (const [dx, dy] of pcf) {
          const tx = Math.floor(lu) + dx, ty = Math.floor(lv) + dy;
          if (tx < 0 || ty < 0 || tx >= SM.w || ty >= SM.h) { lit++; continue; }
          if (SM.depth[ty * SM.w + tx] <= ld + bias) lit++;
        }
        lit /= pcf.length;
      }
      let occ = 0;
      if (N[1] > 0.3) {
        let acc = 0;
        for (const [ax, az] of aoK) {
          const tx = Math.floor(tcam.ox + HT * (P[0] + ax)), ty = Math.floor(tcam.oy + HT * (P[2] + az));
          if (tx < 0 || ty < 0 || tx >= HM.w || ty >= HM.h) continue;
          const top = HM.depth[ty * HM.w + tx];
          const dh = top - P[1];
          if (dh > 0.015) acc += Math.exp(-dh / 0.32);
        }
        occ = acc / aoK.length;
      }
      const amb = 0.36 + 0.12 * N[1];
      let r = M.c[0], g = M.c[1], b = M.c[2];
      if (M.tex) { M.tex(P, N, fpW, TX); r = TX[0]; g = TX[1]; b = TX[2]; }
      if (tint) {
        const diffT = Math.max(0, ndl) * M.kd * lit + (fill ? 0.22 * M.kd * Math.max(0, dot(N, fill)) : 0);
        const fs = M.floorShadow ?? 0.2;
        let sa, sd;
        if (M.kind === 2) { sa = (1 - fs) * (1 - 0.45 * occ); sd = fs * lit * (1 - 0.45 * occ); }
        else { sa = amb * (1 - 0.55 * occ); sd = diffT * (1 - 0.55 * occ); }
        if (M.kind === 1) { const nv = Math.max(0, dot(N, Vv)), fr = 0.72 + 0.28 * Math.sqrt(nv); sa *= fr; sd *= fr; }
        const sp = M.ks > 0 && ndl > 0 ? M.ks * Math.pow(Math.max(0, dot(N, Hh)), M.sh) * lit * 255 : 0;
        col[o] = r * (sa * tint.amb[0] + sd * tint.key[0]) + sp * tint.key[0];
        col[o + 1] = g * (sa * tint.amb[1] + sd * tint.key[1]) + sp * tint.key[1];
        col[o + 2] = b * (sa * tint.amb[2] + sd * tint.key[2]) + sp * tint.key[2];
        continue;
      }
      if (M.kind === 2 && grid) {
        const gx = Math.abs(P[0] / grid.step - Math.round(P[0] / grid.step)), gz = Math.abs(P[2] / grid.step - Math.round(P[2] / grid.step));
        const wline = grid.width / grid.step;
        if (gx < wline || gz < wline) { r = grid.color[0]; g = grid.color[1]; b = grid.color[2]; }
      }
      const diff = Math.max(0, ndl) * M.kd * lit + (fill ? 0.22 * M.kd * Math.max(0, dot(N, fill)) : 0);
      let shade = M.kind === 2 ? (0.8 + 0.2 * lit) * (1 - 0.45 * occ) : (amb + diff) * (1 - 0.55 * occ);
      let spec = 0;
      if (M.ks > 0 && ndl > 0) spec = M.ks * Math.pow(Math.max(0, dot(N, Hh)), M.sh) * lit;
      if (M.kind === 1) { const nv = Math.max(0, dot(N, Vv)); shade *= 0.72 + 0.28 * Math.sqrt(nv); }
      col[o] = r * shade + 255 * spec;
      col[o + 1] = g * shade + 255 * spec;
      col[o + 2] = b * shade + 255 * spec;
    }
  }
  const thr = 0.07, ink = scene.ink || [44, 52, 60];
  const out = new Float32Array(col);
  for (let py = 1; py < h - 1; py++) {
    for (let px = 1; px < w - 1; px++) {
      const i = py * w + px;
      const d0 = depth[i];
      let jump = 0;
      const nb = [i - 1, i + 1, i - w, i + w];
      for (const j of nb) {
        const dj = depth[j];
        if (dj < -1e8) continue;
        const dd = dj - (d0 < -1e8 ? dj - 1 : d0);
        if (dd > jump) jump = dd;
      }
      if (d0 < -1e8) continue;
      if (jump > thr) {
        const a = clamp01((jump - thr) / 0.05) * 0.85;
        const o = i * 3;
        out[o] = out[o] * (1 - a) + ink[0] * a; out[o + 1] = out[o + 1] * (1 - a) + ink[1] * a; out[o + 2] = out[o + 2] * (1 - a) + ink[2] * a;
      } else if (grp[i] >= 0) {
        let edge = false;
        for (const j of nb) if (grp[j] >= 0 && grp[j] !== grp[i] && Math.abs(depth[j] - d0) < thr && depth[j] > d0) { edge = true; break; }
        if (edge) { const o = i * 3; out[o] *= 0.72; out[o + 1] *= 0.72; out[o + 2] *= 0.72; }
      }
    }
  }
  const OW = Math.round(W * q), OH = Math.round(H * q);
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const ix = x * ss + sx, iy = y * ss + sy;
        if (ix >= w || iy >= h) continue;
        const o = (iy * w + ix) * 3;
        r += out[o]; g += out[o + 1]; b += out[o + 2]; c++;
      }
      const o = (y * OW + x) * 4;
      data[o] = r / c; data[o + 1] = g / c; data[o + 2] = b / c; data[o + 3] = 255;
    }
  }
  return { data, w: OW, h: OH, q };
}

export function toCanvas(img) {
  const c = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: img.w, height: img.h }) : new OffscreenCanvas(img.w, img.h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}

export function contextScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}

export function badge(g, x, y, text, { r = 9, fill = '#ffffff', stroke = '#33414c', color = '#22303a', font = '-apple-system, "Segoe UI", Roboto, sans-serif', weight = 800, size } = {}) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = stroke; g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${size ?? Math.round(r * 1.25)}px ${font}`;
  g.fillText(text, x, y + 0.5);
  g.restore();
}
