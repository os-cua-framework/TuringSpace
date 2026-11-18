const DECODED = new Map();
export function assetUrl(file) {
  const raw = `./assets/${file}`;
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[raw.replace(/^(?:\.\/)+/, '')] || raw;
}
export function decode(file, W, H, aspect = 0) {
  const key = `${file}|${W}x${H}|${aspect}`;
  if (!DECODED.has(key)) DECODED.set(key, (async () => {
    const blob = await (await fetch(assetUrl(file))).blob();
    const bmp = await createImageBitmap(blob);
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (aspect > 0) {
      if (sw / sh > aspect) { const w2 = sh * aspect; sx = (sw - w2) / 2; sw = w2; } else { const h2 = sw / aspect; sy = (sh - h2) / 2; sh = h2; }
    }
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
    return { w: W, h: H, data: g.getImageData(0, 0, W, H).data };
  })());
  return DECODED.get(key);
}

export const S2L = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
export const toS = (v) => 255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
export const lumL = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-9) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
export function redCap(h, other) {
  if (h >= 338 || h < 14) return 0.26;
  if (h < 20) return Math.min(other, 0.48);
  if (h >= 285) return Math.min(other, 0.22);
  return other;
}
export function capSat(c, other, cap = redCap) {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  if (mx <= 1e-9) return c;
  const s = (mx - mn) / mx, S = cap(hueOf(c[0], c[1], c[2]), other);
  if (s <= S) return c;
  const L = lumL(c[0], c[1], c[2]), a = mx - L, b = mn - L;
  const k = clamp(S * L / (a - b - S * a), 0, 1);
  return [L + (c[0] - L) * k, L + (c[1] - L) * k, L + (c[2] - L) * k];
}
const noCap = (h, other) => other;
export { noCap };

export function labS(c) {
  const r = S2L[Math.round(clamp(c[0], 0, 255))], g = S2L[Math.round(clamp(c[1], 0, 255))], b = S2L[Math.round(clamp(c[2], 0, 255))];
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.9505), fy = f(Y), fz = f(Z / 1.089);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const dES = (a, b) => { const p = labS(a), q = labS(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

function mips(out, n, ch) {
  const lv = [out], sizes = [n];
  for (let s = n >> 1; s >= 4; s >>= 1) {
    const src = lv[lv.length - 1], S = s * 2, dst = new Float32Array(s * s * ch);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) for (let c = 0; c < ch; c++) {
      dst[(y * s + x) * ch + c] = 0.25 * (src[((2 * y) * S + 2 * x) * ch + c] + src[((2 * y) * S + 2 * x + 1) * ch + c] + src[((2 * y + 1) * S + 2 * x) * ch + c] + src[((2 * y + 1) * S + 2 * x + 1) * ch + c]);
    }
    lv.push(dst); sizes.push(s);
  }
  return { lv, sizes };
}
function stats(raw) {
  const n = raw.w, N = n * n, d = raw.data, lin = new Float32Array(N * 3);
  let s1 = 0, s2 = 0, mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < N; i++) {
    const r = S2L[d[i * 4]], g = S2L[d[i * 4 + 1]], b = S2L[d[i * 4 + 2]];
    lin[i * 3] = r; lin[i * 3 + 1] = g; lin[i * 3 + 2] = b;
    const L = lumL(r, g, b); s1 += L; s2 += L * L; mr += r; mg += g; mb += b;
  }
  const mean = s1 / N;
  return { n, N, lin, mean, cv: Math.sqrt(Math.max(0, s2 / N - mean * mean)) / Math.max(1e-6, mean), mlin: [mr / N, mg / N, mb / N] };
}
export function prep(raw, { lum = 180, cv = 0.25, sat = 0.35, tint = null, chroma = 1, cap = redCap, lo = 0.35, hi = 1.9 } = {}) {
  const S = stats(raw), { n, N, lin, mean } = S;
  const k = Math.min(1, cv / Math.max(1e-6, S.cv)), target = Math.pow(lum / 255, 2.2);
  const mL = lumL(...S.mlin), mc = S.mlin.map((v) => v / mL);
  let tn = null;
  if (tint) { const t = tint.map((v) => S2L[Math.round(clamp(v, 0, 255))]), tl = Math.max(1e-6, lumL(...t)); tn = t.map((v) => v / tl); }
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = lin[i * 3], g = lin[i * 3 + 1], b = lin[i * 3 + 2], L = Math.max(1e-6, lumL(r, g, b));
    const rel = clamp(1 + k * (L / mean - 1), lo, hi);
    let c;
    if (tn) c = tn;
    else {
      c = [r / L, g / L, b / L];
      if (chroma < 1) c = [mc[0] + (c[0] - mc[0]) * chroma, mc[1] + (c[1] - mc[1]) * chroma, mc[2] + (c[2] - mc[2]) * chroma];
      c = capSat(c, sat, cap);
    }
    const v = rel * target;
    out[i * 3] = toS(c[0] * v); out[i * 3 + 1] = toS(c[1] * v); out[i * 3 + 2] = toS(c[2] * v);
  }
  return { n, ch: 3, ...mips(out, n, 3), meanS: toS(target) };
}
export function prepRel(raw, { cv = 0.15, lo = 0.6, hi = 1.4 } = {}) {
  const S = stats(raw), { n, N, lin, mean } = S, k = Math.min(1, cv / Math.max(1e-6, S.cv));
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = clamp(1 + k * (lumL(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]) / mean - 1), lo, hi);
  return { n, ch: 1, ...mips(out, n, 1) };
}
export function samp(T, a, b, tpp, out) {
  const l = tpp > 1 ? Math.min(T.lv.length - 1, Math.round(Math.log2(tpp))) : 0;
  const s = T.sizes[l], A = T.lv[l], m = s - 1, k = 1 / (1 << l), ch = T.ch;
  const x = a * k - 0.5, y = b * k - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r0 = (y0 & m) * s, r1 = ((y0 + 1) & m) * s, c0 = x0 & m, c1 = (x0 + 1) & m;
  const i00 = (r0 + c0) * ch, i10 = (r0 + c1) * ch, i01 = (r1 + c0) * ch, i11 = (r1 + c1) * ch;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  if (ch === 1) return A[i00] * w00 + A[i10] * w10 + A[i01] * w01 + A[i11] * w11;
  out[0] = A[i00] * w00 + A[i10] * w10 + A[i01] * w01 + A[i11] * w11;
  out[1] = A[i00 + 1] * w00 + A[i10 + 1] * w10 + A[i01 + 1] * w01 + A[i11 + 1] * w11;
  out[2] = A[i00 + 2] * w00 + A[i10 + 2] * w10 + A[i01 + 2] * w01 + A[i11 + 2] * w11;
  return out;
}
export async function material(item, world, opt, size = 256) {
  const T = prep(await decode(item.file, size, size), opt);
  T.tpu = T.n / world; T.id = item.id;
  return T;
}
export async function relMaterial(item, world, opt, size = 256) {
  const T = prepRel(await decode(item.file, size, size), opt);
  T.tpu = T.n / world; T.id = item.id;
  return T;
}
export const texAt = (T, a, b, fp, out) => samp(T, a * T.tpu, b * T.tpu, fp * T.tpu, out);
export function texPool(style, uses, re = /./, skip = null) {
  const all = style.pool('tex', (t) => uses.includes(t.use) && !(skip && skip.test(t.id)));
  const hit = all.filter((t) => re.test(t.id));
  return hit.length ? hit : all;
}
