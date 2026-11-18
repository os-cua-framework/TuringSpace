import * as S3 from './_style3d.js';

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function linSampler(T, { size = 1.5, L = 0.4, contrast = 0.8, sat = 0.4, safe = true } = {}) {
  const k = L / Math.max(1e-6, lum(T.mean)), base = T.mean.map((v) => v * k), tpm = T.n / size, S = new Float64Array(3);
  const [h, s0] = S3.hueSat(base);
  const sK = Math.min(1, (safe && !(h >= 18 && h <= 160) ? Math.min(sat, 0.08) : sat) / Math.max(1e-6, s0));
  return (u, v, fp, out) => {
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    for (let c = 0; c < 3; c++) out[c] = base[c] + (S[c] * k - base[c]) * contrast;
    const L2 = lum(out);
    for (let c = 0; c < 3; c++) out[c] = Math.max(0, L2 + (out[c] - L2) * sK);
  };
}
export function lumPattern(T, { size = 0.6, amt = 0.15, lo = 0.75, hi = 1.25 } = {}) {
  const tpm = T.n / size, S = new Float64Array(3), inv = 1 / Math.max(1e-6, lum(T.mean)), g = amt / Math.max(0.05, T.cv);
  return (u, v, fp) => {
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    return Math.max(lo, Math.min(hi, 1 + g * (lum(S) * inv - 1)));
  };
}
export function planar(x, y, z, nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [x, z];
  return ax > az ? [z, -y] : [x, -y];
}
