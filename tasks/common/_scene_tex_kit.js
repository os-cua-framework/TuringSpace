import * as S3 from './_style3d.js';

export { S3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function texColour(T, L, maxSat = 0.45) {
  return S3.scaleTo(S3.limitSat(T.mean, maxSat), L);
}

function sampleAround(T, u, v, fp, tpm, face, keep, kc, invL, lo, hi, S, out) {
  S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
  const Ls = S3.lum(S) * invL;
  const t = clamp(1 + kc * (Ls - 1), lo, hi);
  if (keep <= 0) { out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t; return; }
  const Lf = S3.lum(face), Ln = Math.max(1e-6, S3.lum(S));
  for (let c = 0; c < 3; c++) {
    const own = S[c] / Ln * Lf * t;
    out[c] = face[c] * t * (1 - keep) + own * keep;
  }
}

export function texSurf({ tex, face, keep = 0.5, cv = 0.2, texWorld = 1.5, cell = 0, salt = 0, lo = 0.55, hi = 1.5 }) {
  const kc = Math.min(1.4, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, S3.lum(tex.mean));
  const tpm = tex.n / texWorld, S = new Float64Array(3);
  if (!(cell > 0)) return (u, v, fp, out) => sampleAround(tex, u, v, fp, tpm, face, keep, kc, invL, lo, hi, S, out);
  return (u, v, fp, out) => {
    const iu = Math.floor(u / cell), iv = Math.floor(v / cell), lu = u - iu * cell, lv = v - iv * cell;
    const h1 = S3.hash2(iu + salt, iv - salt), h2 = S3.hash2(iu - 7 * salt, iv + 13), h3 = S3.hash2(iu + 101, iv + 3 * salt);
    const r = Math.floor(h1 * 4);
    const a = r === 0 ? lu : r === 1 ? lv : r === 2 ? cell - lu : cell - lv;
    const b = r === 0 ? lv : r === 1 ? cell - lu : r === 2 ? cell - lv : lu;
    sampleAround(tex, a + h2 * texWorld, b + h3 * texWorld, fp, tpm, face, keep, kc, invL, lo, hi, S, out);
  };
}

export function texMat({ tex, face, keep = 0.5, cv = 0.2, texWorld = 1.2, fp = 0.02, lo = 0.55, hi = 1.5, ...extra }) {
  const kc = Math.min(1.4, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, S3.lum(tex.mean));
  const tpm = tex.n / texWorld, S = new Float64Array(3);
  return {
    c: face, ks: 0.04, sh: 10, ...extra,
    tex: (x, y, z, nx, ny, nz, s, out, fp2) => {
      const f = fp2 || fp, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ay >= ax && ay >= az) sampleAround(tex, x, z, f, tpm, face, keep, kc, invL, lo, hi, S, out);
      else if (ax >= az) sampleAround(tex, z, -y, f, tpm, face, keep, kc, invL, lo, hi, S, out);
      else sampleAround(tex, x, -y, f, tpm, face, keep, kc, invL, lo, hi, S, out);
    },
  };
}

export const fpFor = (cam, dist, ss = 2) => dist / Math.max(1e-6, cam.f) / ss;

export const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

const idOf0 = (x) => (Array.isArray(x) ? String(x[0]) : String(x));
export function splitList(style, task, pool, items, idOf = idOf0, minTest = 1) {
  const f = splitIdsLocal(`${task}|${pool}`, items.map(idOf), minTest);
  const out = items.filter((it) => f(idOf(it)) === style.split);
  return out.length ? out : items;
}
export function splitPick(style, task, pool, items, r = style.rand(), idOf = idOf0, minTest = 1) {
  const l = splitList(style, task, pool, items, idOf, minTest), it = l[Math.floor(r * l.length) % l.length];
  style.note(`${pool}:${idOf(it)}`);
  return it;
}
import { splitIds as splitIdsLocal } from '../core/style.js';

import { hash32 as hash32Local } from '../core/style.js';
export const keyHash = (k) => hash32Local(String(k)).toString(16).padStart(8, '0');
export const keySplit = (k) => (hash32Local('semkey|' + k) % 10 === 0 ? 'test' : 'train');
export const keyAccept = (k, split, evalHashes) => !evalHashes.has(keyHash(k)) && keySplit(k) === split;
import { nthOf as nthOfLocal } from '../core/style.js';
export const keySlot = (k) => hash32Local('slot|' + k) % 100;
export const seedSlot = (task, split, n) => nthOfLocal(`${task}|${split}|slot`, n || 1, 100);
