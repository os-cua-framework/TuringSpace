const DECODED = new Map();

export function hash2(ix, iy) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function lineMask(u, period, hw, fp) {
  const d = Math.abs(u / period - Math.round(u / period)) * period;
  const sharp = Math.max(0, Math.min(1, (hw - d) / Math.max(fp, 1e-6) + 0.5));
  const avg = Math.min(1, 2 * hw / period);
  const blend = Math.max(0, Math.min(1, (fp / period - 0.2) / 0.5));
  return sharp * (1 - blend) + avg * blend;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const linOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2)); };
export const scaleTo = (c, L) => { const k = L / Math.max(1e-6, lum(c)); return [c[0] * k, c[1] * k, c[2] * k]; };
export function hueSat(c) {
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
  if (d < 1e-9) return [0, 0];
  let h;
  if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / d + 2; else h = (c[0] - c[1]) / d + 4;
  return [(h * 60 + 360) % 360, d / mx];
}
export function limitSat(c, maxSat) {
  const [, s] = hueSat(c);
  if (s <= maxSat) return c.slice();
  const L = lum(c);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; const m = c.map((v) => L + (v - L) * t); if (hueSat(m)[1] > maxSat) hi = t; else lo = t; }
  return c.map((v) => L + (v - L) * lo);
}
export function hueSatColor(h, s) {
  const c = s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 1 - c, k = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [r + m, g + m, b + m];
}
export function safeTint(c, { lo = 25, hi = 195, maxSat = 0.3, otherSat = 0.08 } = {}) {
  const [h] = hueSat(c);
  return limitSat(c, h >= lo && h <= hi ? maxSat : otherSat);
}
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
export function labOf(c) {
  const X = 0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.9505), fy = f(Y), fz = f(Z / 1.089);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a, b) => { const p = labOf(a), q = labOf(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export const NAMED_HUES = [[2, 35], [231, 40]];
export function keepNamedHues(c, named = NAMED_HUES, maxSat = 0.12, otherMax = 0.22) {
  const [h] = hueSat(c);
  const near = named.some(([nh, w]) => hueDist(h, nh) < w);
  return limitSat(c, near ? maxSat : otherMax);
}

function assetUrl(file) {
  const raw = `./assets/${file}`;
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[raw.replace(/^(?:\.\/)+/, '')] || raw;
}
async function decodeRGBA(file) {
  const blob = await (await fetch(assetUrl(file))).blob();
  const bmp = await createImageBitmap(blob);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height)
    : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
}
const SRGB2LIN = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));

export function loadTexture(file) {
  if (!DECODED.has(file)) DECODED.set(file, decodeRGBA(file).then(({ w, h, data }) => {
    if (w !== h || (w & (w - 1))) throw new Error(`_style3d: texture ${file} must be square power-of-two`);
    const lv = [new Float32Array(w * w * 3)], sizes = [w];
    for (let i = 0; i < w * w; i++) { lv[0][i * 3] = SRGB2LIN[data[i * 4]]; lv[0][i * 3 + 1] = SRGB2LIN[data[i * 4 + 1]]; lv[0][i * 3 + 2] = SRGB2LIN[data[i * 4 + 2]]; }
    for (let s = w >> 1; s >= 1; s >>= 1) {
      const src = lv[lv.length - 1], S = s * 2, dst = new Float32Array(s * s * 3);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) for (let c = 0; c < 3; c++) {
        dst[(y * s + x) * 3 + c] = 0.25 * (src[((2 * y) * S + 2 * x) * 3 + c] + src[((2 * y) * S + 2 * x + 1) * 3 + c]
          + src[((2 * y + 1) * S + 2 * x) * 3 + c] + src[((2 * y + 1) * S + 2 * x + 1) * 3 + c]);
      }
      lv.push(dst); sizes.push(s);
    }
    const top = lv[lv.length - 1], mean = [top[0], top[1], top[2]];
    const stat = (l) => { const a = lv[l], n = sizes[l] * sizes[l]; let s1 = 0, s2 = 0; for (let i = 0; i < n; i++) { const L = 0.2126 * a[i * 3] + 0.7152 * a[i * 3 + 1] + 0.0722 * a[i * 3 + 2]; s1 += L; s2 += L * L; } const m = s1 / n; return Math.sqrt(Math.max(0, s2 / n - m * m)) / Math.max(1e-6, m); };
    const l64 = sizes.indexOf(64), a = lv[l64];
    let gx = 0, gy = 0;
    const L = (x, y) => { const i = (((y + 64) % 64) * 64 + ((x + 64) % 64)) * 3; return 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d1 = L(x + 1, y) - L(x, y), d2 = L(x, y + 1) - L(x, y); gx += d1 * d1; gy += d2 * d2; }
    return { file, n: w, lv, sizes, mean, cv: stat(Math.min(1, lv.length - 1)), gxy: gx / Math.max(1e-12, gy) };
  }));
  return DECODED.get(file);
}

function bilinear(T, l, u, v, w, out) {
  const s = T.sizes[l], a = T.lv[l], m = s - 1, k = 1 / (1 << l);
  const x = u * k - 0.5, y = v * k - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r0 = (y0 & m) * s, r1 = ((y0 + 1) & m) * s, c0 = x0 & m, c1 = (x0 + 1) & m;
  const i00 = (r0 + c0) * 3, i10 = (r0 + c1) * 3, i01 = (r1 + c0) * 3, i11 = (r1 + c1) * 3;
  const w00 = (1 - fx) * (1 - fy) * w, w10 = fx * (1 - fy) * w, w01 = (1 - fx) * fy * w, w11 = fx * fy * w;
  out[0] += a[i00] * w00 + a[i10] * w10 + a[i01] * w01 + a[i11] * w11;
  out[1] += a[i00 + 1] * w00 + a[i10 + 1] * w10 + a[i01 + 1] * w01 + a[i11 + 1] * w11;
  out[2] += a[i00 + 2] * w00 + a[i10 + 2] * w10 + a[i01 + 2] * w01 + a[i11 + 2] * w11;
}
export function sampleTex(T, u, v, lod, out) {
  out[0] = 0; out[1] = 0; out[2] = 0;
  const L = T.lv.length - 1;
  if (!(lod > 0)) { bilinear(T, 0, u, v, 1, out); return out; }
  if (lod >= L) { out[0] = T.mean[0]; out[1] = T.mean[1]; out[2] = T.mean[2]; return out; }
  const l0 = Math.floor(lod), f = lod - l0;
  bilinear(T, l0, u, v, 1 - f, out);
  if (f > 1e-3) bilinear(T, l0 + 1, u, v, f, out);
  return out;
}

export function loadSky(file) {
  if (!DECODED.has(file)) DECODED.set(file, decodeRGBA(file).then(({ w, h, data }) => {
    const W = 64, H = 16, acc = new Float32Array(W * H * 3), cnt = new Float32Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = Math.floor(y * H / h) * W + Math.floor(x * W / w);
      for (let c = 0; c < 3; c++) { const t = Math.min(0.97, SRGB2LIN[data[i + c]]); acc[o * 3 + c] += t / (1 - t) / 0.6; }
      cnt[o]++;
    }
    for (let o = 0; o < W * H; o++) for (let c = 0; c < 3; c++) acc[o * 3 + c] /= cnt[o];
    const out = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
      out[(y * W + x) * 3 + c] = 0.25 * acc[(y * W + (x + W - 1) % W) * 3 + c] + 0.5 * acc[(y * W + x) * 3 + c] + 0.25 * acc[(y * W + (x + 1) % W) * 3 + c];
    }
    let sw = 0, sl = 0;
    for (let y = 0; y < H; y++) { const wt = Math.sin((y + 0.5) / H * Math.PI / 2); for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; sl += wt * (0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2]); sw += wt; } }
    return { file, W, H, rad: out, meanLum: sl / sw };
  }));
  return DECODED.get(file);
}
export function skyFn(sky, meanLum, maxSat = 0.2) {
  const k = meanLum / Math.max(1e-6, sky.meanLum), { W, H } = sky, rad = new Float32Array(sky.rad.length);
  for (let i = 0; i < W * H; i++) { const c = limitSat([sky.rad[i * 3], sky.rad[i * 3 + 1], sky.rad[i * 3 + 2]], maxSat); rad[i * 3] = c[0]; rad[i * 3 + 1] = c[1]; rad[i * 3 + 2] = c[2]; }
  return (dx, dy, dz, out) => {
    const u = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1, th = Math.acos(clamp(dy, 0, 1));
    const fx = u * W - 0.5, fy = clamp(th / (Math.PI / 2) * H - 0.5, 0, H - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, y1 = Math.min(H - 1, y0 + 1);
    const xa = (x0 + W) % W, xb = (x0 + 1 + W) % W;
    for (let c = 0; c < 3; c++) {
      const v = (rad[(y0 * W + xa) * 3 + c] * (1 - ax) + rad[(y0 * W + xb) * 3 + c] * ax) * (1 - ay)
        + (rad[(y1 * W + xa) * 3 + c] * (1 - ax) + rad[(y1 * W + xb) * 3 + c] * ax) * ay;
      out[c] = v * k;
    }
  };
}

const SHK = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274];
const SHA = [Math.PI, 2 * Math.PI / 3, 2 * Math.PI / 3, 2 * Math.PI / 3, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];
export function shIrradiance(sh, x, y, z) {
  const b = [1, y, z, x, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y];
  const out = [0, 0, 0];
  for (let i = 0; i < 9; i++) { const w = SHA[i] * SHK[i] * b[i]; out[0] += w * sh[i][0]; out[1] += w * sh[i][1]; out[2] += w * sh[i][2]; }
  return out.map((v) => Math.max(0, v));
}
const KEY_TEMP = { 'outdoor-midday': [1.0, 0.94, 0.86], sunset: [1.0, 0.8, 0.6], overcast: [0.95, 0.98, 1.0], indoor: [1.0, 0.9, 0.78], studio: [1.0, 0.97, 0.94] };
const unit = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };

export function hdriLight(h, base, { albedo, total = 1.47, jitter = 0.5 } = {}) {
  const sh = h.sh9_norm, sun = unit(h.sun_dir);
  const Es = shIrradiance(sh, ...sun), Ea = shIrradiance(sh, -sun[0], -sun[1], -sun[2]);
  const dirPart = [0, 1, 2].map((c) => Math.max(0, Es[c] - Ea[c]));
  const dirness = clamp(lum(dirPart) / Math.max(1e-6, lum(Es) + lum(Ea)), 0, 1);
  const up = shIrradiance(sh, 0, 1, 0);
  const fillDir = unit(base.fill ? base.fill.dir : [0.8, 0.4, 0.5]);
  const fillE = shIrradiance(sh, ...fillDir);
  const L = unit(base.dir), ndl = Math.max(0.2, L[1]), fdl = Math.max(0, fillDir[1]);
  const T = total * (0.96 + 0.08 * jitter);
  const keyShare = 0.5 + 0.22 * dirness;
  const fillShare = 0.04;
  const temp = KEY_TEMP[h.use] || KEY_TEMP.studio;
  const dn = lum(dirPart) > 1e-4 ? scaleTo(dirPart, lum(temp)) : temp;
  const keyCol = scaleTo(safeTint(temp.map((v, c) => 0.75 * v + 0.25 * dn[c])), T * keyShare / ndl);
  const fillCol = scaleTo(safeTint(fillE, { maxSat: 0.25 }), fdl > 0 ? T * fillShare / fdl : 0.16);
  const skyCol = scaleTo(safeTint(up, { maxSat: 0.25 }), T * (1 - keyShare - fillShare));
  const a = albedo || [0.5, 0.5, 0.5];
  const ground = [0, 1, 2].map((c) => 0.22 * a[c] * (keyCol[c] * ndl + skyCol[c]));
  return {
    ...base, col: keyCol, sky: skyCol, ground,
    fill: { dir: base.fill ? base.fill.dir : [0.8, 0.4, 0.5], col: fillCol },
    soft: 0.03 + 0.06 * (1 - dirness),
    _hdri: { id: h.id, dirness: +dirness.toFixed(3) },
  };
}

export function texTileFloor({ tex, tile, face, grout, cv = 0.07, texWorld = 1.0, tone = 0.05, salt = 0, groutHW = 0.004, groutK = 0.85 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, lum(tex.mean));
  const tpm = tex.n / texWorld, S = new Float64Array(3);
  return (x, z, fp, out) => {
    const ix = Math.floor(x / tile), iz = Math.floor(z / tile), lx = x - ix * tile, lz = z - iz * tile;
    const h1 = hash2(ix + salt, iz - salt), h2 = hash2(ix - 7 * salt, iz + 13), h3 = hash2(ix + 101, iz + 3 * salt);
    const r = Math.floor(h1 * 4);
    const a = r === 0 ? lx : r === 1 ? lz : r === 2 ? tile - lx : tile - lz;
    const b = r === 0 ? lz : r === 1 ? tile - lx : r === 2 ? tile - lz : lx;
    sampleTex(tex, (a + h2 * texWorld) * tpm, (b + h3 * texWorld) * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const t = (1 + tone * (h1 * 4 - r - 0.5) * 2) * clamp(1 + k * (lum(S) * invL - 1), 0.62, 1.38);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
    const m = Math.max(lineMask(x, tile, groutHW, fp), lineMask(z, tile, groutHW, fp));
    const w = groutK * m;
    out[0] += (grout[0] - out[0]) * w; out[1] += (grout[1] - out[1]) * w; out[2] += (grout[2] - out[2]) * w;
  };
}
export function texWall({ tex, face, cv = 0.25, texWorld = 1.2, skirtH = 0.09, skirt, seam = 0.6 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, lum(tex.mean));
  const tpm = tex.n / texWorld, S = new Float64Array(3), SK = skirt || face.map((v) => v * 0.55);
  return (x, y, fp, out) => {
    if (y < skirtH) { out[0] = SK[0]; out[1] = SK[1]; out[2] = SK[2]; }
    else {
      sampleTex(tex, x * tpm, -y * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
      const t = clamp(1 + k * (lum(S) * invL - 1), 0.4, 1.6);
      out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
    }
    const e = Math.max(0, Math.min(1, (0.006 - Math.abs(y - skirtH)) / Math.max(fp, 1e-6) + 0.5));
    if (e > 0) { const w = 1 - seam * e; out[0] *= w; out[1] *= w; out[2] *= w; }
  };
}

function boxFace(s, x, y, z, nx, ny, nz) {
  const px = x - s.cx, pz = z - s.cz, lx = px * s.ca - pz * s.sa, lz = px * s.sa + pz * s.ca, ly = y - s.cy;
  const n0 = Math.abs(nx * s.ca - nz * s.sa), n2 = Math.abs(nx * s.sa + nz * s.ca);
  if (Math.abs(ny) >= Math.max(n0, n2)) return s.hx >= s.hz ? [lx, lz, s.hx, s.hz, 0] : [lz, lx, s.hz, s.hx, 0];
  if (n0 > n2) return [lz, ly, s.hz, s.hy, 1];
  return [lx, ly, s.hx, s.hy, 2];
}
const band = (e, hw, fp) => { const f = Math.max(fp, 1e-5); return clamp((hw - Math.abs(e)) / f + 0.5, 0, 1) * Math.min(1, hw * 2 / f); };
export const CRATE_KINDS = ['slat', 'plank', 'panel', 'plastic'];
export function crateMaterial({ kind, tint, wood = null, tintK = 0.9 }) {
  const T = linOf(tint), G = [0.07, 0.05, 0.035];
  const swap = wood && wood.gxy > 1;
  const tpm = wood ? wood.n / 0.6 : 0, wk = wood ? Math.min(1, 0.16 / Math.max(1e-6, wood.cv)) : 0, WS = new Float64Array(3);
  const grainAt = (along, across, fp) => {
    if (!wood) return 1;
    const uu = swap ? across : along, vv = swap ? along : across;
    sampleTex(wood, uu * tpm, vv * tpm, Math.log2(Math.max(1e-9, fp * tpm)), WS);
    return clamp(1 + wk * (lum(WS) / Math.max(1e-6, lum(wood.mean)) - 1), 0.7, 1.3);
  };
  const glossy = kind === 'plastic' ? { ks: 0.32, sh: 40 } : kind === 'panel' ? { ks: 0.16, sh: 30 } : { ks: 0.1, sh: 22 };
  const tex = (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
    const [u, v, hu, hv, face] = boxFace(s, x, y, z, nx, ny, nz);
    const du = hu - Math.abs(u), dv = hv - Math.abs(v), dm = Math.min(du, dv);
    let k = 1, dark = 0;
    if (kind === 'slat') {
      const fw = Math.min(0.045, Math.min(hu, hv) * 0.24);
      if (dm < fw) { const horiz = dv < fw && dv <= du; k *= grainAt(horiz ? u : v, horiz ? v : u, fp); dark = Math.max(dark, 0.45 * band(du - dv, 0.003, fp)); k *= 1 - 0.12 * band(dm, 0.004, fp); }
      else {
        const inner = hv - fw, n = Math.max(2, Math.round(inner * 2 / 0.075)), sh = inner * 2 / n, idx = Math.floor((v + inner) / sh);
        k *= (0.9 + 0.2 * hash2(idx, 11)) * grainAt(u, v + idx * 3.1, fp);
        dark = Math.max(dark, 0.85 * lineMask(v + inner, sh, 0.0045, fp));
      }
      dark = Math.max(dark, 0.6 * band(dm - fw, 0.0032, fp));
    } else if (kind === 'plank') {
      const w = 0.07, idx = Math.floor((u + hu) / w);
      k *= (0.9 + 0.2 * hash2(idx, 29)) * grainAt(v + idx * 2.3, u, fp);
      if (face !== 0) dark = Math.max(dark, 0.8 * lineMask(u + hu, w, 0.004, fp));
      dark = Math.max(dark, 0.5 * band(dm, 0.004, fp));
    } else if (kind === 'panel') {
      const fw = Math.min(0.03, Math.min(hu, hv) * 0.16);
      k *= 1 + 0.35 * (grainAt(u, v, fp) - 1);
      if (dm < fw) k *= 0.93;
      dark = Math.max(dark, 0.45 * band(dm - fw, 0.0025, fp), 0.3 * band(dm, 0.003, fp));
    } else {
      if (face !== 0) { const rib = lineMask(v, 0.05, 0.006, fp); k *= 1 - 0.16 * rib; }
      const rim = Math.min(0.03, hv * 0.12);
      if (face !== 0 && hv - v < rim) k *= 1.06;
      dark = Math.max(dark, 0.35 * band(dm, 0.004, fp));
      out[0] = T[0] * k * (1 - 0.6 * dark); out[1] = T[1] * k * (1 - 0.6 * dark); out[2] = T[2] * k * (1 - 0.6 * dark);
      return;
    }
    const wv = 1 - tintK, tk = tintK * (1 - 0.6 * dark) * k;
    const base = [0.52 * k, 0.33 * k, 0.17 * k];
    for (let c = 0; c < 3; c++) { const b = base[c] + (G[c] - base[c]) * dark; out[c] = b * wv + T[c] * tk; }
  };
  return { c: T, ...glossy, tex };
}

export const MARKER_COLOURS = [
  ['yellow', '#e9c43f'], ['lemon', '#efdf4a'], ['chartreuse', '#c3d932'], ['lime', '#93cc3a'],
  ['green', '#3fae4c'], ['emerald', '#1e9a55'], ['white', '#f1efe8'], ['charcoal', '#363636'],
];
export const MARKER_FINISHES = [
  { name: 'gloss', ks: 0.45, sh: 48, env: 0.12 },
  { name: 'satin', ks: 0.22, sh: 26, env: 0.07 },
  { name: 'matte', ks: 0.06, sh: 10, env: 0.03 },
];
export function markerChoices(palette, { named = [[2, 30], [231, 60]], against = [], minDE = 28 } = {}) {
  return palette.filter(([, hex]) => {
    const c = linOf(hex), [h, s] = hueSat(c);
    if (s > 0.15 && named.some(([nh, d]) => hueDist(h, nh) < d)) return false;
    return against.every((a) => deltaE(c, a) >= minDE);
  });
}
