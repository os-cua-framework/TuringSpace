import { splitIds } from '../core/style.js';
import { personShapes, standPose, shape, frame, hash2, fbm, lineMask, lin } from './_people_rt.js';
import { C, GUARD_H } from './_hide_from_guard_geom.js';
import { S3, clamp, mix3, faceOf, texRGB, texLum, hdriTone, loadSkyImage, skyImageFn, pickOf, pickTex, poolTex, splitList, splitPick } from './_rt_kit.js';

const lum = S3.lum;
const SETTINGS = ['yard', 'street', 'warehouse', 'quarry', 'garden', 'alley', 'dock', 'courtyard'];
const STACK_KINDS = ['crate', 'carton', 'concrete', 'masonry', 'container', 'shelf', 'hay', 'sacks'];
const kindSplit = splitIds('hide_from_guard|stack', STACK_KINDS, 2);
const BY_SETTING = {
  yard: ['crate', 'carton', 'concrete', 'masonry', 'container', 'hay', 'sacks'],
  street: ['container', 'concrete', 'masonry', 'crate', 'carton', 'sacks'],
  warehouse: ['shelf', 'crate', 'carton', 'container', 'sacks'],
  quarry: ['concrete', 'masonry', 'hay', 'crate', 'container', 'sacks'],
  garden: ['hay', 'masonry', 'crate', 'concrete', 'sacks'],
  alley: ['container', 'crate', 'carton', 'sacks', 'concrete', 'masonry'],
  dock: ['container', 'crate', 'carton', 'sacks', 'concrete', 'shelf'],
  courtyard: ['masonry', 'hay', 'crate', 'sacks', 'concrete'],
};
const HDRI_USE = {
  yard: ['outdoor-midday', 'morning-afternoon', 'overcast', 'sunset', 'urban'],
  street: ['urban', 'overcast', 'outdoor-midday', 'morning-afternoon', 'sunset'],
  warehouse: ['indoor', 'studio'],
  quarry: ['outdoor-midday', 'morning-afternoon', 'overcast', 'sunset'],
  garden: ['outdoor-midday', 'morning-afternoon', 'overcast', 'sunset'],
  alley: ['urban', 'overcast', 'morning-afternoon'],
  dock: ['overcast', 'outdoor-midday', 'urban', 'morning-afternoon'],
  courtyard: ['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast'],
};
const SKIP_FLOOR = new Set(['stone_tiles_02', 'dry_riverbed_rock', 'pavement_02', 'hexagonal_concrete_paving', 'interior_tiles',
  'cobblestone_floor_08', 'floor_pattern_02', 'square_floor_patern_01', 'brick_moss_001', 'concrete_pavement', 'painted_concrete']);
const isConcreteish = (t) => /concrete|cement|plaster|asphalt|garage|hangar|granular|gravel|clay/.test(t.id);

const UNIFORMS = [['navy', '#2b3a56'], ['black', '#1f2024'], ['charcoal', '#3b3e44'], ['slate', '#4f5966'], ['olive', '#4a5233'],
  ['khaki', '#8a7a55'], ['brown', '#4b3a2c'], ['teal', '#22474c'], ['grey', '#65686d'], ['sand', '#a08c66']];
const VESTS = [['yellow', '#d6dc3c'], ['orange', '#ee7a26'], ['lime', '#a4dc3a'], ['amber', '#f0b030']];
const SKINS = ['#e8c09c', '#d7a57e', '#c99a76', '#b47f57', '#8d5e3e', '#6e4a32'];
const HAIRS = ['#1d1f24', '#2b1f18', '#5b3b23', '#8c6a3e', '#8f8f8f'];

function guardKit(style) {
  const rnd = style.rand, sp = (pool, list, k = 1) => splitPick(style, `hide_from_guard|${pool}`, list, k);
  const uni = sp('uniform', UNIFORMS, 2), vest = sp('vest', VESTS);
  const dark = uni[1], skin = sp('skin', SKINS), hair = sp('hair', HAIRS);
  const trouserK = 0.55 + 0.3 * rnd(), cap = rnd() < 0.55, wb = 0.9 + 0.24 * rnd(), bands = rnd() < 0.7;
  const T = lin(dark), Tr = [T[0] * trouserK, T[1] * trouserK, T[2] * trouserK];
  const mats = [
    { c: lin(skin), ks: 0.1, sh: 20 },
    { c: lin(hair), ks: 0.12, sh: 18 },
    { c: T, ks: 0.04, sh: 8 },
    { c: Tr, ks: 0.04, sh: 8 },
    { c: lin('#18181b'), ks: 0.2, sh: 30 },
    { c: lin(vest[1]), ks: 0.08, sh: 12, vest: bands },
    { c: [T[0] * 0.8, T[1] * 0.8, T[2] * 0.8], ks: 0.06, sh: 10 },
  ];
  const shapes = (x, z, fx, fz) => {
    const J = standPose(x, z, fx, fz, GUARD_H);
    const base = personShapes(1, J, { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4 });
    const out = base.map((s) => {
      if (s.m !== 2 && s.m !== 3) return s;
      if (s.k === 5) return shape.ellipsoid(s.id, s.m, s.c, s.ax, [s.h[0] * wb, s.h[1], s.h[2] * (0.5 + 0.5 * wb)]);
      if (s.k === 4) return shape.capsule(s.id, s.m, s.a, s.b, s.r * (0.6 + 0.4 * wb));
      return s;
    });
    const k = J.k, pel = J.pelvis, ax = frame([0, 1, 0], J.f), f = J.f;
    const at = (fwd, up) => [pel[0] + f[0] * fwd * k, pel[1] + up * k, pel[2] + f[2] * fwd * k];
    out.push(shape.ellipsoid(1, 5, at(0.004, 0.36), ax, [0.186 * k * wb, 0.2 * k, 0.118 * k * (0.5 + 0.5 * wb)]));
    out.push(shape.ellipsoid(1, 5, at(0.0, 0.17), ax, [0.158 * k * wb, 0.17 * k, 0.106 * k * (0.5 + 0.5 * wb)]));
    if (cap) {
      const hc = [pel[0] + f[0] * 0.017 * k, pel[1] + 0.65 * k, pel[2] + f[2] * 0.017 * k];
      out.push(shape.frustum(1, 6, hc[0] - f[0] * 0.012 * k, hc[2] - f[2] * 0.012 * k, hc[1] + 0.035 * k, hc[1] + 0.128 * k, 0.093 * k, 0.078 * k));
      out.push(shape.ellipsoid(1, 6, [hc[0] + f[0] * 0.095 * k, hc[1] + 0.045 * k, hc[2] + f[2] * 0.095 * k], frame([0, 1, 0], f), [0.072 * k, 0.011 * k, 0.06 * k]));
    }
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const s of out) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], s.bb[i]); bb[i + 3] = Math.max(bb[i + 3], s.bb[i + 3]); }
    return { shapes: out, bb };
  };
  return { mats, shapes, ids: `${uni[0]}/${vest[0]}${cap ? '/cap' : ''}/w${wb.toFixed(2)}` };
}

function stackPainter(kind, tex, style) {
  const rnd = style.rand, sp = (pool, list, k = 1) => splitPick(style, `hide_from_guard|${kind}-${pool}`, list, k);
  const toneK = 0.12 + 0.1 * rnd();
  const lenOf = (P, f) => (f % 2 === 0 ? P.x1 - P.x0 : P.z1 - P.z0);
  const dark = (out, c, k) => { out[0] += (c[0] - out[0]) * k; out[1] += (c[1] - out[1]) * k; out[2] += (c[2] - out[2]) * k; };
  if (kind === 'crate') {
    const face = faceOf(tex.mean, 0.2 + 0.2 * rnd(), { warmSat: 0.5 }), G = [face[0] * 0.18, face[1] * 0.16, face[2] * 0.14];
    const W = texRGB(tex, { face, texWorld: 0.9, cv: 0.22, keep: 0.6 });
    const frW = 0.07 + 0.04 * rnd(), slat = 0.11 + 0.06 * rnd(), vert = rnd() < 0.35;
    return (P, f, u, v, fp, out) => {
      const top = v > P.split, v0 = top ? P.split : 0, lv = v - v0, H = (top ? P.h : P.split) - v0, len = lenOf(P, f);
      const inFrame = u < frW || u > len - frW || lv < frW || lv > H - frW;
      const sd = P.seed + (top ? 7 : 0) + f * 3, t = 1 + (P.tone - 0.5) * toneK * 2 + 0.08 * (hash2(sd, 3) - 0.5);
      if (inFrame) W(lv * 3 + sd, u, fp, out); else if (vert) W(lv + sd * 0.7, u + sd, fp, out); else W(u + sd * 0.37, lv * 2.1 + sd, fp, out);
      out[0] *= t; out[1] *= t; out[2] *= t;
      if (!inFrame) { const gap = vert ? lineMask(u - frW, slat, 0.005, fp) : lineMask(lv - frW, slat, 0.005, fp); if (gap > 0) dark(out, G, 0.8 * gap); }
      const e = Math.max(lineMask(u - frW, 1e3, 0.004, fp), lineMask(u - (len - frW), 1e3, 0.004, fp), lineMask(lv - frW, 1e3, 0.004, fp), lineMask(lv - (H - frW), 1e3, 0.004, fp));
      if (e > 0) dark(out, G, 0.55 * e);
      const seam = lineMask(v - P.split, 1e3, 0.012, fp); if (seam > 0) dark(out, G, 0.9 * seam);
    };
  }
  if (kind === 'carton') {
    const CARD = sp('card', [['#caa271', '#a77d4c'], ['#d8cfc0', '#b9ae9c'], ['#b9905e', '#8f6a42'], ['#c8b49a', '#a08a70']]);
    const L = lin(CARD[0]), D = lin(CARD[1]), TAPE = lin(sp('tape', ['#d9c08e', '#e2e0da', '#c9a660', '#7f8c99']));
    const PAL = faceOf(tex.mean, 0.16, { warmSat: 0.45 }), PG = lin('#2a2119'), wrap = rnd() < 0.6;
    const bw = 0.32 + 0.16 * rnd(), bh = 0.26 + 0.12 * rnd();
    return (P, f, u, v, fp, out) => {
      const top = v > P.split, v0 = top ? P.split : 0, lv = v - v0, sd = P.seed + (top ? 5 : 0) + f * 11;
      if (lv < 0.14) {
        const blk = Math.abs(((u / 0.42) % 1) - 0.5) < 0.17, deck = lv > 0.105 || lv < 0.025;
        const c = deck || blk ? PAL.map((x) => x * (0.85 + 0.3 * hash2(sd, Math.floor(u / 0.42)))) : PG;
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return;
      }
      const rv = lv - 0.14, row = Math.floor(rv / bh), cu = Math.floor((u + (row % 2) * bw / 2) / bw);
      const t = clamp(0.35 + 0.35 * hash2(sd + cu, row) + 0.2 * fbm(u * 6, v * 6, 2, fp * 6) + (P.tone - 0.5) * 0.3, 0, 1);
      const c = mix3(D, L, t); out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      const ty = (rv % bh) / bh; if (Math.abs(ty - 0.5) < 0.035) dark(out, TAPE, 0.5);
      const seam = Math.max(lineMask(rv, bh, 0.004, fp), lineMask(u + (row % 2) * bw / 2, bw, 0.004, fp)); if (seam > 0) dark(out, PG, 0.6 * seam);
      if (wrap) { const sh = 0.05 * Math.max(0, Math.sin(v * 2.1 + u * 0.7 + sd)); out[0] += sh; out[1] += sh; out[2] += sh; }
    };
  }
  if (kind === 'concrete') {
    const face = faceOf(tex.mean, 0.22 + 0.2 * rnd(), { maxSat: 0.08, warmSat: 0.12 });
    const T = texRGB(tex, { face, texWorld: 1.3, cv: 0.2, keep: 0.3 }), J = face.map((x) => x * 0.3);
    const bh = sp('block', [0.6, 0.8]), bl = bh * 2;
    return (P, f, u, v, fp, out) => {
      const row = Math.floor(v / bh), off = (row % 2) * bl / 2, col = Math.floor((u + off) / bl);
      T(u + P.seed * 0.31, v, fp, out);
      const t = 0.92 + 0.16 * hash2(P.seed + col, row + f * 7); out[0] *= t; out[1] *= t; out[2] *= t;
      const j = Math.max(lineMask(v, bh, 0.012, fp), lineMask(u + off, bl, 0.012, fp)); if (j > 0) dark(out, J, 0.75 * j);
    };
  }
  if (kind === 'masonry') {
    const face = faceOf(tex.mean, 0.18 + 0.2 * rnd(), { maxSat: 0.16, warmSat: 0.35 });
    const T = texRGB(tex, { face, texWorld: 1.6 + 0.8 * rnd(), cv: 0.35, keep: 0.6 }), CAP = face.map((x) => x * 1.35);
    return (P, f, u, v, fp, out) => {
      if (v > P.h - 0.12) { out[0] = CAP[0]; out[1] = CAP[1]; out[2] = CAP[2]; if (v < P.h - 0.105) { out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6; } return; }
      T(u + f * 1.7, P.h - v, fp, out);
      const dirt = 1 - 0.25 * Math.exp(-v / 0.3); out[0] *= dirt; out[1] *= dirt; out[2] *= dirt;
    };
  }
  if (kind === 'container') {
    const paint = lin(sp('paint', ['#8a4b32', '#3f5f7a', '#4f6b45', '#7d7f80', '#a8834a', '#5c4a6a', '#9a9d98', '#2f4f5f']));
    const R = texLum(tex, { texWorld: 1.2, cv: 0.18 }), FR = paint.map((x) => x * 0.55), pitch = 0.1 + 0.06 * rnd();
    return (P, f, u, v, fp, out) => {
      const len = lenOf(P, f);
      const corr = 0.86 + 0.14 * Math.sin(u / pitch * 2 * Math.PI) * clamp(1 - fp / pitch * 2, 0, 1);
      const t = corr * R(u + P.seed, v, fp) * (1 + (P.tone - 0.5) * 0.12);
      out[0] = paint[0] * t; out[1] = paint[1] * t; out[2] = paint[2] * t;
      const fr = u < 0.09 || u > len - 0.09 || v < 0.12 || v > P.h - 0.1;
      if (fr) { out[0] = FR[0]; out[1] = FR[1]; out[2] = FR[2]; }
    };
  }
  if (kind === 'shelf') {
    const steel = lin(sp('upright', ['#d8792a', '#2f5f9a', '#4a4d52', '#c9a227'])), beam = lin(sp('beam', ['#d8792a', '#e0b03a', '#c45a2a']));
    const goods = [['#c6a271', '#a07a4a'], ['#d8d2c4', '#b4ab9a'], ['#6f7f8a', '#55636c'], ['#8a6a4a', '#6a4e34'], ['#a9b4a0', '#87927f']];
    const BACK = lin('#2a2a2c'), lv = [0.12, 0.95 + 0.2 * rnd(), 1.75 + 0.2 * rnd()];
    return (P, f, u, v, fp, out) => {
      const len = lenOf(P, f);
      if (u < 0.07 || u > len - 0.07) { out[0] = steel[0]; out[1] = steel[1]; out[2] = steel[2]; if (Math.abs(((v / 0.075) % 1) - 0.5) < 0.12 && (u > 0.02 && u < 0.05 || u < len - 0.02 && u > len - 0.05)) { out[0] *= 0.4; out[1] *= 0.4; out[2] *= 0.4; } return; }
      for (const y of lv) if (v > y && v < y + 0.09) { out[0] = beam[0]; out[1] = beam[1]; out[2] = beam[2]; return; }
      const bay = v < lv[1] ? 0 : v < lv[2] ? 1 : 2, y0 = lv[bay] + 0.09, y1 = bay < 2 ? lv[bay + 1] : P.h;
      const n = Math.max(1, Math.round((len - 0.14) / 0.45)), w = (len - 0.14) / n, i = Math.floor((u - 0.07) / w), lu = u - 0.07 - i * w;
      const gh = (y1 - y0) * (0.62 + 0.3 * hash2(P.seed + i, bay + f * 5));
      if (v - y0 > gh || lu < 0.025 || lu > w - 0.025) { out[0] = BACK[0]; out[1] = BACK[1]; out[2] = BACK[2]; return; }
      const g = goods[Math.floor(hash2(P.seed * 3 + i, bay + f) * goods.length)], t = 0.4 + 0.5 * hash2(P.seed + i * 7, bay) + 0.15 * fbm(u * 8, v * 8, 2, fp * 8);
      const c = mix3(lin(g[1]), lin(g[0]), clamp(t, 0, 1)); out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      const seam = Math.max(lineMask(v - y0, 0.3, 0.004, fp), lineMask(lu, w / 2, 0.004, fp)); if (seam > 0) dark(out, BACK, 0.5 * seam);
    };
  }
  if (kind === 'hay') {
    const L = lin(sp('straw', ['#d6bd78', '#c9ab62', '#d2b98a'])), D = lin('#8c7440'), bh = 0.45 + 0.1 * rnd(), bl = 1.0 + 0.2 * rnd();
    return (P, f, u, v, fp, out) => {
      const row = Math.floor(v / bh), off = (row % 2) * bl / 2, col = Math.floor((u + off) / bl), ly = v - row * bh;
      const straw = fbm(u * 3 + col * 7, v * 40 + row, 3, fp * 40), t = clamp(0.3 + 0.55 * straw + 0.15 * hash2(P.seed + col, row), 0, 1);
      const c = mix3(D, L, t); out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      const tw = Math.max(lineMask(u + off - bl * 0.3, bl, 0.008, fp), lineMask(u + off - bl * 0.7, bl, 0.008, fp)) * (ly > 0.03 && ly < bh - 0.03 ? 1 : 0);
      if (tw > 0) dark(out, lin('#6a5a3a'), 0.6 * tw);
      const j = Math.max(lineMask(v, bh, 0.02, fp), lineMask(u + off, bl, 0.02, fp)); if (j > 0) dark(out, D.map((x) => x * 0.35), 0.7 * j);
    };
  }
  const SL = lin(sp('sack', ['#cdbb94', '#e2ddd2', '#b9a47a', '#c9c1a8', '#d9d2bd'])), GAP = lin('#2a2420');
  const T = texLum(tex, { texWorld: 0.5, cv: 0.2 }), sh = 0.24 + 0.06 * rnd(), sw = 0.62 + 0.15 * rnd();
  const PAL = lin('#7a6248');
  return (P, f, u, v, fp, out) => {
    if (v < 0.13) { const blk = Math.abs(((u / 0.42) % 1) - 0.5) < 0.17, deck = v > 0.1 || v < 0.025; const c = deck || blk ? PAL : GAP; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
    const vv = v - 0.13, row = Math.floor(vv / sh), off = (row % 2) * sw / 2, col = Math.floor((u + off) / sw);
    const lu = (u + off) / sw - col, lvv = vv / sh - row;
    const ex = Math.abs(2 * lu - 1), ey = Math.abs(2 * lvv - 1);
    const pill = Math.sqrt(Math.max(0, 1 - Math.pow(ex, 6))) * Math.pow(Math.max(0, 1 - ey * ey), 0.45);
    const light = 0.55 + 0.45 * pill + 0.18 * (0.5 - lvv) * pill;
    const t = light * T(u, v, fp) * (0.9 + 0.2 * hash2(P.seed + col * 3, row + f * 13));
    out[0] = SL[0] * t; out[1] = SL[1] * t; out[2] = SL[2] * t;
    const g = clamp(1 - pill / 0.22, 0, 1);
    if (g > 0) dark(out, GAP, 0.75 * g);
  };
}

function wallPainter(setting, texs, style, sideTone) {
  const rnd = style.rand, sp = (pool, list, k = 1) => splitPick(style, `hide_from_guard|${setting}-${pool}`, list, k);
  const faces = texs.map((T, i) => faceOf(T.mean, (setting === 'warehouse' ? 0.3 : 0.32) + 0.22 * rnd(), { maxSat: 0.18, warmSat: 0.38 }).map((x, c) => x * sideTone[i][c]));
  const samp = texs.map((T, i) => texRGB(T, { face: faces[i], texWorld: setting === 'street' ? 2.4 : 1.8 + 0.6 * rnd(), cv: 0.3, keep: 0.6 }));
  if (setting === 'garden') {
    const greens = [0, 1, 2, 3].map(() => lin(sp('hedge', ['#3f6a35', '#4a7a3a', '#355e2e', '#5a7a3a', '#46703f', '#3a5f3a'])));
    return (P, x, v, fp, out) => {
      const s = P.side, G = greens[s].map((c, i) => c * sideTone[s][i]);
      const n = fbm(x * 6 + s * 17, v * 6, 3, fp * 6), m = fbm(x * 22 + 3, v * 22 - s, 2, fp * 22);
      const t = (0.55 + 0.6 * n + 0.25 * (m - 0.5)) * (1 - 0.35 * Math.exp(-v / 0.4)) * (v > P.h - 0.12 ? 1.12 : 1);
      out[0] = G[0] * t; out[1] = G[1] * t; out[2] = G[2] * t;
    };
  }
  if (setting === 'alley') {
    const pipeC = lin(sp('pipe', ['#2e3236', '#5a5e62', '#3b3328'])), doorC = lin(sp('door', ['#3d4650', '#5a3a2c', '#2f3d33', '#6b6f73'])), pipeP = 3 + 2.5 * rnd(), off = rnd() * 7;
    return (P, x, v, fp, out) => {
      const s = P.side, lx = ((x + off + s * 2.3) % pipeP + pipeP) % pipeP;
      samp[s](x, P.h - v, fp, out);
      const dirt = 1 - 0.25 * Math.exp(-v / 0.5); out[0] *= dirt; out[1] *= dirt; out[2] *= dirt;
      if (lx < 0.09) { const k = 0.85 + 0.3 * lx / 0.09; out[0] = pipeC[0] * k; out[1] = pipeC[1] * k; out[2] = pipeC[2] * k; return; }
      const dl = ((x + off * 1.7 + s * 3.1) % 7.3 + 7.3) % 7.3;
      if (dl > 2 && dl < 3.05 && v < 2.15) { const fr = dl < 2.07 || dl > 2.98 || v > 2.08; const k = fr ? 0.6 : 1 - 0.1 * lineMask(v, 0.5, 0.01, fp); out[0] = doorC[0] * k; out[1] = doorC[1] * k; out[2] = doorC[2] * k; return; }
      const wl = ((x + off * 0.6 + s) % 4.1 + 4.1) % 4.1;
      if (v > 3.4 && v < 4.2 && wl > 1.6 && wl < 2.3) { const bar = lineMask(wl - 1.6, 0.14, 0.012, fp); const k = 0.28 + 0.4 * bar; out[0] *= k; out[1] *= k; out[2] *= k; }
    };
  }
  if (setting === 'dock') {
    const doorC = lin(sp('door', ['#b8bcc0', '#8f9aa3', '#9a8a6a', '#6b7680', '#c9c4ba'])), dw = 2.8 + 0.6 * rnd(), bay = 5 + 2 * rnd(), off = rnd() * bay;
    return (P, x, v, fp, out) => {
      const s = P.side, lx = ((x + off + s * 1.9) % bay + bay) % bay, d0 = (bay - dw) / 2;
      if (lx > d0 && lx < d0 + dw && v > 0.15 && v < 3.6) {
        const rib = 1 - 0.25 * lineMask(v, 0.1, 0.012, fp), edge = lx < d0 + 0.08 || lx > d0 + dw - 0.08 ? 0.55 : 1;
        out[0] = doorC[0] * rib * edge; out[1] = doorC[1] * rib * edge; out[2] = doorC[2] * rib * edge; return;
      }
      if (v > 0.25 && v < 0.75 && (Math.abs(lx - d0 + 0.25) < 0.14 || Math.abs(lx - d0 - dw - 0.25) < 0.14)) { out[0] = 0.02; out[1] = 0.02; out[2] = 0.022; return; }
      samp[s](x, P.h - v, fp, out);
      if (v < 1.1) { const k = 0.7 * (0.95 + 0.1 * fbm(x * 3, v * 3, 2, fp * 3)); out[0] *= k; out[1] *= k; out[2] *= k; }
    };
  }
  if (setting === 'courtyard') {
    const bay = 2.4 + 0.8 * rnd(), archW = bay * (0.58 + 0.12 * rnd()), archH = 2.2 + 0.4 * rnd(), off = rnd() * bay;
    return (P, x, v, fp, out) => {
      const s = P.side, F = faces[s];
      if (v > P.h - 0.2) { out[0] = F[0] * 1.2; out[1] = F[1] * 1.2; out[2] = F[2] * 1.2; if (v < P.h - 0.17) { out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6; } return; }
      samp[s](x, P.h - v, fp, out);
      const lx = ((x + off + s * 0.7) % bay + bay) % bay - bay / 2, r = archW / 2;
      const inArch = Math.abs(lx) < r && (v < archH || Math.hypot(lx, v - archH) < r);
      if (inArch) { const k = 0.42 + 0.12 * Math.min(1, v / archH); out[0] *= k; out[1] *= k; out[2] *= k; }
      else if (Math.abs(Math.abs(lx) - r) < 0.05 && v < archH || (v >= archH && Math.abs(Math.hypot(lx, v - archH) - r) < 0.05)) { out[0] *= 1.15; out[1] *= 1.15; out[2] *= 1.15; }
    };
  }
  if (setting === 'street') {
    const glass = lin(sp('glass', ['#3d4a55', '#4a5560', '#36404a'])), frame = lin(sp('frame', ['#e6e2da', '#2e2f33', '#7a5a3e', '#c9c4ba']));
    const shop = lin(sp('shop', ['#6c7378', '#57606a', '#7d6f5d'])), plinthK = 0.62;
    const wx = 2.0 + 0.6 * rnd(), ww = 0.95 + 0.25 * rnd(), floorH = 2.9 + 0.3 * rnd(), off = rnd() * wx;
    return (P, x, v, fp, out) => {
      const s = P.side, F = faces[s];
      if (v > P.h - 0.25) { out[0] = F[0] * 1.25; out[1] = F[1] * 1.25; out[2] = F[2] * 1.25; if (v < P.h - 0.22) { out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6; } return; }
      samp[s](x, P.h - v, fp, out);
      if (v < 0.45) { out[0] *= plinthK; out[1] *= plinthK; out[2] *= plinthK; }
      const lx = ((x + off + s * 0.7) % wx + wx) % wx - (wx - ww) / 2;
      if (v > 0.45 && v < 2.5 && (s + Math.floor((x + off) / wx)) % 3 === 0 && lx > -0.2 && lx < ww + 0.2) {
        const fr = lx < -0.12 || lx > ww + 0.12 || v > 2.42;
        const c = fr ? frame : shop; const sh = 0.8 + 0.2 * lineMask(v, 0.08, 0.01, fp); out[0] = c[0] * (fr ? 1 : sh); out[1] = c[1] * (fr ? 1 : sh); out[2] = c[2] * (fr ? 1 : sh); return;
      }
      const fl = Math.floor((v - 0.4) / floorH), lv = v - 0.4 - fl * floorH;
      if (fl >= 1 && lx > 0 && lx < ww && lv > 0.8 && lv < 2.3) {
        const fr = lx < 0.06 || lx > ww - 0.06 || lv < 0.86 || lv > 2.24 || Math.abs(lx - ww / 2) < 0.025 || Math.abs(lv - 1.75) < 0.025;
        if (fr) { out[0] = frame[0]; out[1] = frame[1]; out[2] = frame[2]; return; }
        const t = 0.7 + 0.5 * (lv - 0.8) / 1.5; out[0] = glass[0] * t; out[1] = glass[1] * t; out[2] = glass[2] * t; return;
      }
      if (fl >= 1 && lx > -0.08 && lx < ww + 0.08 && lv > 0.72 && lv < 0.8) { out[0] = F[0] * 1.3; out[1] = F[1] * 1.3; out[2] = F[2] * 1.3; }
    };
  }
  if (setting === 'warehouse') {
    const base = faces.map((F) => F.map((x) => x * 0.8)), plinth = 0.9 + 0.5 * rnd();
    const bay = 2.2 + 1.6 * rnd(), off = rnd() * bay, colW = 0.16 + 0.1 * rnd();
    const colC = lin(sp('column', ['#3d4650', '#6b2f2a', '#2f4a6b', '#4a5a3a', '#7a7d80', '#c9a227'])), door = lin(sp('door', ['#b8bcc0', '#8f9aa3', '#9a8a6a', '#5f6b74']));
    const doorH = 3.0 + 0.8 * rnd(), doorEvery = 2 + Math.floor(rnd() * 3), doorSalt = Math.floor(rnd() * 7);
    return (P, x, v, fp, out) => {
      const s = P.side, bx = x + off + s * 1.3, bi = Math.floor(bx / bay), lx = bx - bi * bay;
      if (lx < colW) { const sh = 0.85 + 0.3 * (lx / colW); out[0] = colC[0] * sh; out[1] = colC[1] * sh; out[2] = colC[2] * sh; return; }
      if ((bi + doorSalt + s) % doorEvery === 0 && v < doorH && lx > colW + 0.25 && lx < bay - 0.25) {
        const rib = 1 - 0.25 * lineMask(v, 0.09, 0.012, fp), top = v > doorH - 0.25 ? 0.7 : 1;
        out[0] = door[0] * rib * top; out[1] = door[1] * rib * top; out[2] = door[2] * rib * top; return;
      }
      samp[s](x, P.h - v, fp, out);
      if (v < plinth) { const n = 0.9 + 0.1 * fbm(x * 3, v * 3, 2, fp * 3); out[0] = base[s][0] * 0.75 * n; out[1] = base[s][1] * 0.75 * n; out[2] = base[s][2] * 0.75 * n; }
      const girt = Math.max(lineMask(v - plinth, 2.2, 0.03, fp), lineMask(v - plinth, 1e3, 0.012, fp));
      if (girt > 0) { const k = 1 - 0.35 * girt; out[0] *= k; out[1] *= k; out[2] *= k; }
    };
  }
  const cope = faces.map((F) => F.map((x) => x * 1.15)), pierP = 2.4 + 2.2 * rnd(), pierOff = rnd() * pierP, pierW = rnd() < 0.5 ? 0 : 0.3 + 0.15 * rnd();
  const gateSide = Math.floor(rnd() * 4), gateX = 1.5 + 5 * rnd(), gateW = 1.6 + 1.2 * rnd(), gateC = lin(sp('gate', ['#3a3d42', '#5a4632', '#2f4a3a', '#6b6f73']));
  return (P, x, v, fp, out) => {
    const s = P.side;
    if (s === gateSide && x > gateX && x < gateX + gateW && v < P.h - 0.3) {
      const bar = lineMask(x - gateX, 0.14, 0.022, fp), rail = Math.max(lineMask(v, 0.9, 0.03, fp), lineMask(v - 0.25, 1e3, 0.04, fp));
      const k = 0.75 + 0.25 * Math.max(bar, rail); out[0] = gateC[0] * k; out[1] = gateC[1] * k; out[2] = gateC[2] * k; return;
    }
    if (v > P.h - 0.08) { out[0] = cope[s][0]; out[1] = cope[s][1]; out[2] = cope[s][2]; if (v < P.h - 0.065) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; } return; }
    samp[s](x, P.h - v, fp, out);
    if (pierW > 0) { const lp = ((x + pierOff + s * 0.9) % pierP + pierP) % pierP; if (lp < pierW) { const k = 1.12 - 0.1 * Math.abs(lp / pierW - 0.5); out[0] *= k; out[1] *= k; out[2] *= k; if (lp < 0.015 || lp > pierW - 0.015) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; } } }
    const dirt = 1 - 0.22 * Math.exp(-v / 0.35); out[0] *= dirt; out[1] *= dirt; out[2] *= dirt;
  };
}

export async function buildHideLook(style, m) {
  const rnd = style.rand;
  const settings = splitList(style, 'hide_from_guard|setting', SETTINGS, 3);
  const floorsAll = poolTex(style, (t) => (t.use === 'floor' || t.use === 'stone' && /slab|rock_tile|monastery|seaworn|rock_surface/.test(t.id)) && !SKIP_FLOOR.has(t.id), (t) => t.use === 'floor');
  const hdriAll = style.pool('hdri');
  const [si, fi, wi, hi] = style.primaryCombo('setting-floor-wall-hdri', [settings.length, 29, 31, 37]);
  const setting = settings[si];
  const floorPool = setting === 'warehouse' && floorsAll.some(isConcreteish) ? floorsAll.filter(isConcreteish) : floorsAll;
  const anyWall = (t) => t.use === 'wall';
  const wallPool = setting === 'warehouse' ? poolTex(style, (t) => t.use === 'metal' && !/grate|grid|plate/.test(t.id) || /concrete_wall|concrete_brick|rough_block/.test(t.id), (t) => t.use === 'metal' && !/grid|grate/.test(t.id), anyWall)
    : setting === 'quarry' ? poolTex(style, (t) => t.use === 'stone' && /wall|rock|castle|broken|cliff|medieval/.test(t.id), anyWall)
      : setting === 'street' || setting === 'alley' ? poolTex(style, (t) => t.use === 'wall' && !/cracked|white_rough|plastered_stone/.test(t.id), anyWall)
        : setting === 'dock' ? poolTex(style, (t) => t.use === 'metal' && !/grate|grid/.test(t.id) || /concrete_wall|concrete_brick|rough_block/.test(t.id), anyWall)
          : setting === 'courtyard' ? poolTex(style, (t) => t.use === 'wall' && /plaster|beige|render|sandstone|white/.test(t.id), anyWall)
        : poolTex(style, (t) => t.use === 'wall' || t.use === 'stone' && /wall|blocks|castle/.test(t.id), anyWall);
  const hdris = hdriAll.filter((h) => HDRI_USE[setting].includes(h.use));
  const fl = floorPool[fi % floorPool.length], hd = (hdris.length ? hdris : hdriAll)[hi % (hdris.length || hdriAll.length)];
  const w0 = wallPool[wi % wallPool.length];
  const sameMat = ['warehouse', 'quarry', 'garden', 'dock', 'courtyard'].includes(setting) || rnd() < 0.5;
  const walls = [w0, ...[1, 2, 3].map(() => (sameMat ? w0 : pickOf(rnd, wallPool)))];
  style.note(`setting:${setting}`); style.note(`tex:${fl.id}`); for (const w of new Set(walls)) style.note(`tex:${w.id}`); style.note(`hdri:${hd.id}`);
  const half = STACK_KINDS.filter((k) => kindSplit(k) === style.split), own = BY_SETTING[setting].filter((k) => half.includes(k));
  const kinds = own.length ? own : half;
  const kA = pickOf(rnd, kinds), kB = rnd() < 0.3 || kinds.length < 2 ? kA : pickOf(rnd, kinds.filter((k) => k !== kA));
  style.note(`hide_from_guard|stack:${kA}`); style.note(`hide_from_guard|stack:${kB}`);
  const wood = (t) => t.use === 'wood';
  const texFor = (k) => (k === 'crate' || k === 'carton' ? pickTex(style, wood)
    : k === 'concrete' ? pickTex(style, (t) => /concrete|cement/.test(t.id) && (t.use === 'floor' || t.use === 'wall'), (t) => t.use === 'floor')
      : k === 'masonry' ? pickTex(style, (t) => t.use === 'stone' && /wall|blocks|castle|sandstone/.test(t.id) || t.use === 'wall' && /brick|block/.test(t.id), anyWall)
        : k === 'container' ? pickTex(style, (t) => t.use === 'metal')
          : k === 'sacks' ? pickTex(style, (t) => t.use === 'fabric' && /hessian|linen|jersey|denim|melange|terry/.test(t.id), (t) => t.use === 'fabric' && !/leather/.test(t.id), (t) => t.use === 'fabric')
            : pickTex(style, wood));
  const [tA, tB] = [texFor(kA), texFor(kB)];
  const sky = setting === 'warehouse' ? null : await loadSkyImage(hd.sky);
  const [ftex, ...rest] = await Promise.all([S3.loadTexture(fl.file), ...walls.map((w) => S3.loadTexture(w.file)), S3.loadTexture(tA.file), S3.loadTexture(tB.file)]);
  const wtex = rest.slice(0, 4), [stA, stB] = rest.slice(4);
  const tone = hdriTone(hd), dirK = setting === 'warehouse' ? 0.45 : 0.6 + 0.5 * tone.dirness;
  const sunCol = S3.scaleTo(tone.key, 1.23 * clamp(dirK, 0.45, 1.05));
  const skyAmb = S3.scaleTo(tone.amb, 0.38 * (setting === 'warehouse' ? 1.55 : 1.45 - 0.55 * tone.dirness));
  const toneJ = rnd();
  let face = faceOf(ftex.mean, 0.2 + 0.3 * toneJ, { maxSat: 0.14, warmSat: 0.3 });
  const grassJoint = setting === 'garden' || (setting === 'quarry' && rnd() < 0.5);
  const grout = grassJoint ? S3.scaleTo([0.12, 0.2, 0.06], S3.lum(face) * 0.33) : S3.scaleTo(S3.limitSat(face, 0.1), S3.lum(face) * 0.33);
  const floor = S3.texTileFloor({ tex: ftex, tile: C, face, grout, cv: 0.1, texWorld: 1.4, groutHW: 0.009, groutK: 0.8, salt: 1 + Math.floor(rnd() * 997) });
  const gndAmb = S3.scaleTo(S3.limitSat(face, 0.2), 0.18 * S3.lum(skyAmb) / 0.38);
  const tones = [[1, 1, 1], [0.93, 0.95, 0.97], [1.05, 1.02, 0.97], [0.9, 0.9, 0.92]];
  const sideTone = [0, 1, 2, 3].map(() => tones.splice(Math.floor(rnd() * tones.length), 1)[0]);
  const wallH = setting === 'street' ? [0, 1, 2, 3].map(() => 6.4 + 3.2 * rnd()) : setting === 'alley' ? [0, 1, 2, 3].map(() => 5 + 3 * rnd())
    : setting === 'dock' ? [0, 1, 2, 3].map(() => 5.5 + rnd()) : setting === 'courtyard' ? [0, 1, 2, 3].map(() => 3.4 + 1.2 * rnd())
      : setting === 'warehouse' ? [5.6, 5.6, 5.6, 5.6] : [0, 1, 2, 3].map(() => 2.9 + (setting === 'quarry' ? 0.6 * rnd() : setting === 'garden' ? -0.3 + 0.5 * rnd() : 0));
  if (setting === 'warehouse') { const H = 5.2 + 1.4 * rnd(); for (let i = 0; i < 4; i++) wallH[i] = H; }
  const wall = wallPainter(setting, wtex, style, sideTone);
  const pa = stackPainter(kA, stA, style), pb = kB === kA ? pa : stackPainter(kB, stB, style);
  const stack = (P, f, u, v, fp, out) => (P.style === 1 ? pb : pa)(P, f, u, v, fp, out);
  const el = (m.sun?.el ?? 56) * Math.PI / 180, az = (m.sun?.az ?? 30) * Math.PI / 180;
  const sceneAz = Math.atan2(-Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az));
  const skyImg = sky ? skyImageFn(sky, { meanLum: 0.5 + 0.2 * rnd(), maxSat: 0.4, azOff: tone.sunAz - sceneAz }) : null;
  const roofH = wallH[0], beamP = 2.4 + 0.6 * rnd(), skyP = 3 + Math.floor(rnd() * 3), deck = lin(splitPick(style, 'hide_from_guard|roof', ['#6d6f72', '#8a8c8e', '#5a5c60', '#7a746a']));
  const roofAmb = skyAmb.map((x) => x * 1.05);
  const guard = guardKit(style);
  style.note(`stacks:${kA}+${kB}`); style.note(`guard:${guard.ids}`);
  const key = style.key;
  return {
    key, setting, wallH, floor, wall, stack,
    light: { sun: sunCol, sky: skyAmb, gnd: gndAmb, expo: 1.0 },
    guardShapes: guard.shapes, guardMats: guard.mats,
    sky: skyImg || ((dx, dy, dz, out, Ex, Ez, fpk) => {
        const t = (roofH - 1.6) / Math.max(1e-4, dy), x = Ex + t * dx, z = Ez + t * dz, fp = t * fpk;
        const beam = lineMask(z, beamP, 0.12, fp), rib = lineMask(x, 0.2, 0.03, fp);
        const strip = Math.abs(((x / (beamP * skyP)) % 1 + 1) % 1 - 0.5) < 0.12;
        if (strip && beam < 0.5) { out[0] = 1.25; out[1] = 1.27; out[2] = 1.3; return; }
        const k = (1 - 0.25 * rib) * (1 - 0.5 * beam);
        out[0] = deck[0] * roofAmb[0] * 1.6 * k; out[1] = deck[1] * roofAmb[1] * 1.6 * k; out[2] = deck[2] * roofAmb[2] * 1.6 * k;
      }),
    ids: { setting, floor: fl.id, walls: walls.map((w) => w.id), hdri: hd.id, stacks: [kA, kB], guard: guard.ids },
  };
}
