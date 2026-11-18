import * as S3 from './_style3d.js';
import { splitIds } from '../core/style.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexOf = (c) => '#' + c.map((v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2)).toString(16).padStart(2, '0')).join('');

const GROUND_SKIP = new Set([
  'metal_grate_rusty', 'rusty_metal_grid', 'stone_tiles_02', 'dry_riverbed_rock', 'aerial_rocks_02', 'aerial_rocks_04',
  'aerial_grass_rock', 'cliff_side', 'seaside_rock', 'rock_face_03',
]);
const OUT = ['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast'];
const HDRI_FOR = {
  terrain: OUT, stone: [...OUT, 'urban'], wood: ['indoor', 'studio', 'outdoor-midday', 'morning-afternoon', 'overcast'],
  floor: ['urban', 'overcast', 'indoor', 'studio', 'morning-afternoon'],
};
const INDOOR = new Set(['indoor', 'studio']);

export function texGround({ tex, texWorld, rot, face, cv, satK = 0.35, ox = 0, oz = 0 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), mean = tex.mean, invL = 1 / Math.max(1e-6, S3.lum(mean));
  const tpm = tex.n / texWorld, ca = Math.cos(rot), sa = Math.sin(rot), S = new Float64Array(3);
  return (x, z, fp, out) => {
    const u = (x * ca - z * sa + ox) * tpm, v = (x * sa + z * ca + oz) * tpm;
    S3.sampleTex(tex, u, v, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const L = S3.lum(S) * invL, t = clamp(1 + k * (L - 1), 0.5, 1.55), Ld = Math.max(1e-6, L);
    for (let c = 0; c < 3; c++) out[c] = face[c] * t * clamp(1 + satK * ((S[c] / Math.max(1e-6, mean[c])) / Ld - 1), 0.75, 1.25);
  };
}
export function paverGround({ tex, w, h, bond, face, grout, cv, jw = 0.005, texWorld = 1, salt = 0, rot = 0 }) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), invL = 1 / Math.max(1e-6, S3.lum(tex.mean));
  const tpm = tex.n / texWorld, S = new Float64Array(3), sq = Math.abs(w - h) < 1e-6, ca = Math.cos(rot), sa = Math.sin(rot);
  return (x0, z0, fp, out) => {
    const x = x0 * ca - z0 * sa, z = x0 * sa + z0 * ca;
    const row = Math.floor(z / h), off = ((row % 2) + 2) % 2 * bond * w, col = Math.floor((x + off) / w);
    const lx = x + off - col * w, lz = z - row * h;
    const h1 = S3.hash2(col + salt, row - salt), h2 = S3.hash2(col - 7 * salt, row + 13), h3 = S3.hash2(col + 101, row + 3 * salt);
    const r = sq ? Math.floor(h1 * 4) : 2 * Math.floor(h1 * 2);
    const a = r === 0 ? lx : r === 1 ? lz : r === 2 ? w - lx : h - lz;
    const b = r === 0 ? lz : r === 1 ? w - lx : r === 2 ? h - lz : lx;
    S3.sampleTex(tex, (a + h2 * texWorld) * tpm, (b + h3 * texWorld) * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const t = (1 + 0.12 * (h1 * 2 - 1)) * clamp(1 + k * (S3.lum(S) * invL - 1), 0.6, 1.4);
    out[0] = face[0] * t; out[1] = face[1] * t; out[2] = face[2] * t;
    const m = Math.max(S3.lineMask(x + off, w, jw, fp), S3.lineMask(z, h, jw, fp));
    const wk = 0.85 * m;
    out[0] += (grout[0] - out[0]) * wk; out[1] += (grout[1] - out[1]) * wk; out[2] += (grout[2] - out[2]) * wk;
  };
}

const groundUseOf = (t) => t.use;
export const PAVE_PATTERNS = ['square', 'running_bond', 'stack_bond', 'diagonal'];
export const GROUND_TINTS = [['sand', 40, 0.3], ['khaki', 55, 0.28], ['sage', 95, 0.24], ['moss', 80, 0.34], ['ochre', 45, 0.4], ['olive', 65, 0.36],
  ['warm_grey', 30, 0.12], ['teal_grey', 165, 0.2], ['umber', 28, 0.3], ['lichen', 110, 0.3], ['straw', 50, 0.36], ['clay', 22, 0.32],
  ['jade', 150, 0.22], ['pewter', 190, 0.08], ['honey', 38, 0.45], ['fern', 120, 0.36],
  ['slate_blue', 215, 0.22], ['denim', 228, 0.3], ['indigo', 245, 0.26], ['lavender', 268, 0.2], ['steel', 205, 0.14], ['dusk', 255, 0.16]];
const isPatterned = (t) => /tile|paving|pavement|cobble|brick|plank|parquet|herringbone|deck|slab|block|floor_08|floor_04|laminate|wood_floor|patern|pattern|slates|monastery/.test(t.id);

export async function envLook(style, { light, uses = ['floor', 'stone', 'terrain', 'wood'], structured = false, paverP = 0.35, wallZ = null, lumRange = [0.2, 0.5], tag = 'ground', named = true, bold = false, wallP = 0, wallZRange = null, tints = false, namedHues = null } = {}) {
  const ground = style.primary('tex', (t) => uses.includes(t.use) && !GROUND_SKIP.has(t.id));
  const rnd = style.rand;
  const kindsOK = HDRI_FOR[groundUseOf(ground)] || OUT;
  const hd = style.pick('hdri', (h) => kindsOK.includes(h.use)) || style.pick('hdri');
  const yardWall = wallZ !== null && !INDOOR.has(hd.use) && wallP > 0 && rnd() < wallP;
  const indoor = (INDOOR.has(hd.use) || yardWall) && wallZ !== null;
  if (indoor && wallZRange) wallZ = wallZRange[0] + (wallZRange[1] - wallZRange[0]) * rnd();
  const wallT = indoor ? style.pick('tex', (t) => t.use === 'wall' || (t.use === 'wood' && /plank|wall/.test(t.id))) : null;
  const [gtex, sky, wtex] = await Promise.all([S3.loadTexture(ground.file), S3.loadSky(hd.sky), wallT ? S3.loadTexture(wallT.file) : null]);
  const toneJ = rnd(), lightJ = rnd(), rot = rnd() * Math.PI, salt = 1 + Math.floor(rnd() * 997), modeR = rnd(), sizeJ = rnd(), bondR = rnd(), wallJ = rnd(), ox = rnd() * 3, oz = rnd() * 3;
  const tint = tints && rnd() >= 0.3 ? pickSplit(style, 'g01_ground_tint', GROUND_TINTS, { minTest: 5, id: (t) => t[0] }) : null;
  const base0 = tint && tint[1] !== null ? S3.hueSatColor(tint[1], tint[2]) : gtex.mean;
  let face = named ? S3.keepNamedHues(base0, namedHues || S3.NAMED_HUES, 0.12, 0.38) : S3.limitSat(base0, 0.42);
  if (!tint) face = named ? S3.keepNamedHues(gtex.mean, S3.NAMED_HUES, 0.12, 0.32) : S3.limitSat(gtex.mean, 0.42);
  face = S3.scaleTo(face, lumRange[0] + (lumRange[1] - lumRange[0]) * toneJ);
  const patterned = isPatterned(ground) || ground.use === 'wood';
  const rough = (ground.use === 'terrain' || ground.use === 'stone') && gtex.cv >= 0.16;
  const asPavers = structured ? !(patterned || rough) : (!patterned && modeR < paverP);
  const texWorld = (ground.use === 'terrain' ? 2 + 2 * sizeJ : patterned ? 1.4 + 1.4 * sizeJ : 1.6 + 1.6 * sizeJ) * (structured && !bold ? 0.6 : 1);
  let floorFn, groundMode;
  if (asPavers) {
    const pat = pickSplit(style, 'g01_pave_pattern', PAVE_PATTERNS);
    const sqr = pat === 'square' || pat === 'diagonal', w = (bold ? 0.45 : 0.32) + 0.5 * sizeJ, h = sqr ? w : w * (0.45 + 0.15 * rnd());
    const grout = S3.scaleTo(S3.limitSat(face, 0.08), S3.lum(face) * (bold ? 0.16 + 0.16 * rnd() : 0.32 + 0.25 * rnd()));
    const prot = pat === 'diagonal' ? Math.PI / 4 : bondR < 0.5 ? 0 : Math.PI / 2;
    floorFn = paverGround({ tex: gtex, w, h, bond: pat === 'running_bond' ? 0.5 : 0, face, grout, cv: (bold ? 0.16 : 0.1) + 0.06 * rnd(), jw: bold ? 0.008 : 0.005, texWorld: Math.max(1, w * 2), salt, rot: prot });
    groundMode = `${pat} ${w.toFixed(2)}x${h.toFixed(2)}`;
  } else {
    floorFn = texGround({ tex: gtex, texWorld, rot, face, cv: bold ? 0.45 : structured ? 0.3 : ground.use === 'terrain' ? 0.24 : 0.2, ox, oz });
    groundMode = 'continuous';
  }
  let L = S3.hdriLight(hd, light, { albedo: face, jitter: lightJ });
  const ndl = Math.max(0, light.dir[1] / Math.hypot(...light.dir)), fd = L.fill.dir, fdl = Math.max(0, fd[1] / Math.hypot(...fd));
  const lit = face.map((v, c) => v * (L.col[c] * ndl + L.sky[c] + L.fill.col[c] * fdl));
  const safe = !named ? S3.limitSat(lit, 0.45) : namedHues ? S3.keepNamedHues(lit, namedHues, 0.12, 0.42) : S3.safeTint(lit, { maxSat: 0.3, otherSat: 0.1 });
  if (safe.some((v, c) => Math.abs(v - lit[c]) > 1e-9)) {
    const f2 = face.map((v, c) => v * safe[c] / Math.max(1e-9, lit[c]));
    for (let c = 0; c < 3; c++) face[c] = f2[c];
    L = S3.hdriLight(hd, light, { albedo: face, jitter: lightJ });
  }
  let wall = null, wface = null;
  if (indoor) {
    wface = S3.safeTint(wtex.mean, { maxSat: 0.18, otherSat: 0.1 });
    wface = S3.scaleTo(wface, Math.min(0.6, Math.max(0.3, 0.25 + 0.8 * S3.lum(wtex.mean))) * (0.92 + 0.16 * wallJ));
    wall = S3.texWall({ tex: wtex, face: wface });
  }
  style.note(`${tag}:${ground.id}`); style.note(`hdri:${hd.id}`); if (wallT) style.note(`wall:${wallT.id}`);
  return {
    light: L, floor: floorFn, face, wall, wallZ: indoor ? wallZ : undefined, wface,
    sky: S3.skyFn(sky, 0.87 * S3.lum(L.sky) / 0.443),
    ids: { ground: ground.id, groundUse: ground.use, groundMode, hdri: hd.id, hdriUse: hd.use, wall: wallT && wallT.id, floorLum: +S3.lum(face).toFixed(3) },
  };
}
export function decorGround(base, d) {
  const ca = Math.cos(d.rot), sa = Math.sin(d.rot), S = new Float64Array(3), tpm = d.tex ? d.tex.n / 0.5 : 0, k = d.tex ? kOf(d.tex, 0.18) : 0;
  return (x, z, fp, out) => {
    base(x, z, fp, out);
    const px = x - d.cx, pz = z - d.cz, lx = px * ca + pz * sa, lz = -px * sa + pz * ca;
    if (d.kind === 'painted_lines') {
      if (Math.abs(lz) > d.hz) return;
      const m = S3.lineMask(lx, d.spacing, d.width / 2, fp);
      if (m > 0) for (let c = 0; c < 3; c++) out[c] += (d.col[c] - out[c]) * 0.9 * m;
      return;
    }
    const e = d.kind === 'round_rug' ? Math.hypot(lx / d.hx, lz / d.hz) : Math.max(Math.abs(lx) / d.hx, Math.abs(lz) / d.hz);
    if (e >= 1) return;
    const span = Math.min(d.hx, d.hz), inEdge = Math.max(0, Math.min(1, (1 - e) * span / Math.max(fp, 1e-6)));
    const t = d.tex ? texL(d.tex, lx, lz, fp, tpm, k, S, 0.75, 1.25) : 1;
    const C = (1 - e) * span < 0.06 ? d.border : d.col;
    for (let c = 0; c < 3; c++) out[c] += (C[c] * t - out[c]) * inEdge;
  };
}
export const sceneEnv = (look) => ({ floorY: 0, floor: look.floor, wallZ: look.wallZ, wall: look.wall || undefined, sky: look.sky });

function boxFace(s, x, y, z, nx, ny, nz) {
  const px = x - s.cx, pz = z - s.cz, lx = px * s.ca - pz * s.sa, lz = px * s.sa + pz * s.ca, ly = y - s.cy;
  const n0 = Math.abs(nx * s.ca - nz * s.sa), n2 = Math.abs(nx * s.sa + nz * s.ca);
  if (Math.abs(ny) >= Math.max(n0, n2)) return s.hx >= s.hz ? [lx, lz, s.hx, s.hz, 0, lx, ly, lz] : [lz, lx, s.hz, s.hx, 0, lx, ly, lz];
  if (n0 > n2) return [lz, ly, s.hz, s.hy, 1, lx, ly, lz];
  return [lx, ly, s.hx, s.hy, 2, lx, ly, lz];
}
const band = (e, hw, fp) => { const f = Math.max(fp, 1e-5); return clamp((hw - Math.abs(e)) / f + 0.5, 0, 1) * Math.min(1, hw * 2 / f); };
function texL(T, u, v, fp, tpm, k, S, lo = 0.6, hi = 1.4) {
  S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
  return clamp(1 + k * (S3.lum(S) / Math.max(1e-6, S3.lum(T.mean)) - 1), lo, hi);
}
const kOf = (T, cv) => (T ? Math.min(1, cv / Math.max(1e-6, T.cv)) : 0);

export function skinMat(kind0, { base, tex = null, wood = null, rnd = () => 0.5, tintHex = null }) {
  const kind = !tex && ['stone', 'concrete', 'brick', 'hay', 'timber', 'cushion'].includes(kind0) ? 'paint' : kind0;
  const S = new Float64Array(3), B = base;
  const put = (out, k, dark = 0, D = [0.05, 0.045, 0.04]) => { for (let c = 0; c < 3; c++) out[c] = (B[c] * k) * (1 - dark) + D[c] * dark; };
  const j1 = rnd(), j2 = rnd();
  if (kind === 'slat' || kind === 'plank' || kind === 'panel' || kind === 'plastic') {
    return S3.crateMaterial({ kind, tint: tintHex || hexOf(B), wood });
  }
  if (kind === 'stone' || kind === 'concrete') {
    const tw = kind === 'stone' ? 0.7 + 0.5 * j1 : 0.9 + 0.6 * j1, tpm = tex.n / tw, k = kOf(tex, kind === 'stone' ? 0.22 : 0.14);
    const lift = 0.18 + 0.1 * j2;
    return { c: B, ks: 0.05, sh: 12, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
      const du = hu - Math.abs(u), dv = hv - Math.abs(v), dm = Math.min(du, dv);
      let t = texL(tex, u + f * 0.37, v + f * 0.61, fp, tpm, k, S);
      t *= 1 - 0.22 * band(dm, 0.012, fp) * (dm < 0.012 ? 1 : 0) - 0.12 * clamp(1 - dm / 0.02, 0, 1);
      let dark = 0;
      if (kind === 'concrete' && f !== 0) dark = 0.18 * S3.lineMask(v + hv, lift, 0.0025, fp);
      put(out, t, dark);
    } };
  }
  if (kind === 'brick') {
    const tpm = tex.n / (0.9 + 0.4 * j1), k = kOf(tex, 0.3), cap = S3.scaleTo(S3.limitSat(B, 0.06), Math.min(0.55, S3.lum(B) * 1.35 + 0.05));
    return { c: B, ks: 0.04, sh: 10, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
      if (f === 0) {
        const t = 1 - 0.15 * clamp(1 - Math.min(hu - Math.abs(u), hv - Math.abs(v)) / 0.02, 0, 1);
        out[0] = cap[0] * t; out[1] = cap[1] * t; out[2] = cap[2] * t; return;
      }
      const t = texL(tex, u + f * 0.5, v + hv, fp, tpm, k, S, 0.5, 1.5);
      put(out, t);
    } };
  }
  if (kind === 'cabinet' || kind === 'metal' || kind === 'tin') {
    const tpm = tex ? tex.n / 0.8 : 0, k = kOf(tex, kind === 'metal' ? 0.12 : 0.06);
    const ribP = 0.05 + 0.02 * j1;
    return { c: B, ks: kind === 'tin' ? 0.45 : 0.3, sh: kind === 'tin' ? 60 : 40, env: kind === 'tin' ? 0.08 : 0.04, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
      const du = hu - Math.abs(u), dv = hv - Math.abs(v), dm = Math.min(du, dv);
      let t = tex ? texL(tex, u + f * 0.4, v, fp, tpm, k, S, 0.8, 1.2) : 1, dark = 0;
      if (kind === 'cabinet') {
        const fw = Math.min(0.03, Math.min(hu, hv) * 0.12);
        if (f !== 0) { dark = Math.max(dark, 0.55 * band(u, 0.0025, fp) * (hu > 0.12 ? 1 : 0), 0.45 * band(dm - fw, 0.002, fp)); }
        dark = Math.max(dark, 0.3 * band(dm, 0.003, fp));
      } else if (kind === 'metal') {
        const fw = Math.min(0.035, Math.min(hu, hv) * 0.2);
        if (dm < fw) t *= 1.08; else if (f !== 0) t *= 1 - 0.14 * S3.lineMask(v + hv, ribP, 0.007, fp);
        dark = Math.max(0.4 * band(dm - fw, 0.0025, fp), 0.3 * band(dm, 0.003, fp));
      } else {
        if (f === 0 && dm < 0.018) t *= 1.12;
        if (f !== 0) { t *= 1 - 0.12 * S3.lineMask(v + hv, Math.max(0.03, hv * 0.66), 0.004, fp); if (hv - v < 0.012) t *= 1.1; }
        dark = 0.25 * band(dm, 0.003, fp);
      }
      put(out, t, dark);
    } };
  }
  if (kind === 'cardboard') {
    const tape = S3.scaleTo(S3.limitSat(B, 0.25), S3.lum(B) * 1.25), tw = 0.022 + 0.01 * j1;
    return { c: B, ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f, lx, ly, lz] = boxFace(s, x, y, z, nx, ny, nz);
      const longX = s.hx >= s.hz;
      let onTape = false, seam = 0;
      if (f === 0) { onTape = Math.abs(v) < tw; seam = 0.5 * band(v, 0.0015, fp); }
      else if ((f === 1 && longX) || (f === 2 && !longX)) onTape = Math.abs(u) < tw && ly > s.hy - 0.07;
      const fib = 0.94 + 0.12 * S3.hash2(Math.floor((lx + 5) * 400), Math.floor((lz + ly + 5) * 60));
      const C = onTape ? tape : B, k = onTape ? 1 : fib;
      const dark = Math.max(seam, 0.3 * band(Math.min(hu - Math.abs(u), hv - Math.abs(v)), 0.003, fp));
      for (let c = 0; c < 3; c++) out[c] = C[c] * k * (1 - dark) + 0.05 * dark;
    } };
  }
  if (kind === 'hay') {
    const tpm = tex.n / 0.6, k = kOf(tex, 0.3), twine = [0.05, 0.04, 0.03], bx = 0.28 + 0.1 * j1;
    return { c: B, ks: 0.02, sh: 8, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f, lx] = boxFace(s, x, y, z, nx, ny, nz);
      const t = texL(tex, f === 0 ? u : u + 0.3, f === 0 ? v : v + 0.7, fp, tpm, k, S, 0.55, 1.45);
      let dark = 0;
      if (!(f === 1)) dark = Math.max(band(Math.abs(lx) - bx * s.hx * 2, 0.006, fp) * 0.85, 0);
      const e = Math.min(hu - Math.abs(u), hv - Math.abs(v));
      put(out, t * (1 - 0.18 * clamp(1 - e / 0.03, 0, 1)), dark, twine);
    } };
  }
  if (kind === 'timber') {
    const T = tex, swap = T.gxy > 1, tpm = T.n / 0.7, k = kOf(T, 0.18);
    return { c: B, ks: 0.08, sh: 18, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
      const a = swap ? v : u, b = swap ? u : v;
      const t = texL(T, a + f * 0.3, b, fp, tpm, k, S);
      put(out, t, 0.3 * band(Math.min(hu - Math.abs(u), hv - Math.abs(v)), 0.003, fp));
    } };
  }
  if (kind === 'book') {
    const tpm = tex ? tex.n / 0.5 : 0, k = kOf(tex, 0.1), P = [0.78, 0.72, 0.6].map((v) => v * (0.92 + 0.08 * j1)), spine = B.map((v) => v * 0.8);
    return { c: B, ks: 0.12, sh: 24, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f, lx, ly, lz] = boxFace(s, x, y, z, nx, ny, nz);
      if (f === 0) { const t = tex ? texL(tex, u, v, fp, tpm, k, S, 0.8, 1.2) : 1; put(out, t * (1 - 0.15 * band(Math.min(hu - Math.abs(u), hv - Math.abs(v)), 0.004, fp))); return; }
      const cover = 0.006;
      if (hv - Math.abs(v) < cover) { put(out, 0.9); return; }
      if (f === 2 && lz < 0) { for (let c = 0; c < 3; c++) out[c] = spine[c] * (1 - 0.3 * band(v, 0.002, fp)); return; }
      const pg = 1 - 0.12 * S3.lineMask(v + hv, 0.0035, 0.0009, fp);
      for (let c = 0; c < 3; c++) out[c] = P[c] * pg;
    } };
  }
  if (kind === 'cushion') {
    const tpm = tex.n / 0.35, k = kOf(tex, 0.16), pipe = B.map((v) => v * 0.7);
    return { c: B, ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
      const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
      const t = texL(tex, u + f * 0.2, v, fp, tpm, k, S, 0.7, 1.3);
      const e = Math.min(hu - Math.abs(u), hv - Math.abs(v));
      if (f !== 0 && Math.abs(v) < 0.004) { for (let c = 0; c < 3; c++) out[c] = pipe[c]; return; }
      const puff = f === 0 ? 1 - 0.28 * Math.pow(Math.max(Math.abs(u) / hu, Math.abs(v) / hv), 6) : 1 - 0.1 * Math.pow(Math.abs(v) / hv, 2);
      put(out, t * puff * (1 - 0.12 * clamp(1 - e / 0.012, 0, 1)));
    } };
  }
  const tpm = tex ? tex.n / 0.6 : 0, k = kOf(tex, 0.05);
  return { c: B, ks: 0.2, sh: 34, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
    const [u, v, hu, hv, f] = boxFace(s, x, y, z, nx, ny, nz);
    const t = tex ? texL(tex, u + f * 0.3, v, fp, tpm, k, S, 0.85, 1.15) : 1;
    put(out, t, 0.25 * band(Math.min(hu - Math.abs(u), hv - Math.abs(v)), 0.003, fp));
  } };
}
export const CYL_KINDS = ['tin', 'pot', 'tub', 'pouf'];
export function cylMat(kind, { base, tex = null, rnd = () => 0.5 }) {
  const B = base, S = new Float64Array(3), j = rnd();
  const soil = [0.05, 0.035, 0.022], rimW = 0.01 + 0.006 * j;
  const tpm = tex ? tex.n / 0.35 : 0, k = kOf(tex, 0.16);
  const gloss = kind === 'tin' || kind === 'drum' ? { ks: 0.45, sh: 60, env: 0.08 } : kind === 'pot' ? { ks: 0.3, sh: 40, env: 0.05 } : kind === 'tub' ? { ks: 0.3, sh: 36 } : kind === 'barrel' ? { ks: 0.08, sh: 16 } : { ks: 0.03, sh: 8 };
  return { c: B, ...gloss, tex: (x, y, z, nx, ny, nz, s, out, fp = 0.002) => {
    const R = s.r ?? s.r1, dx = x - s.cx, dz = z - s.cz, rho = Math.hypot(dx, dz), top = ny > 0.7, h = s.y1 - s.y0, fromTop = s.y1 - y;
    let kk = 1, dark = 0, C = B;
    if (kind === 'tin') {
      if (top) { if (R - rho < rimW) kk = 1.14; dark = 0.35 * band(R - rho - rimW, 0.002, fp); }
      else { kk = 1 - 0.14 * S3.lineMask(y - s.y0, Math.max(0.02, h / 3), 0.003, fp); if (fromTop < 0.008) kk *= 1.12; }
    } else if (kind === 'pot') {
      if (top) { if (R - rho > rimW * 1.4) C = soil; else kk = 1.1; }
      else { if (fromTop < Math.min(0.03, h * 0.25)) kk = 1.1; dark = 0.3 * band(fromTop - Math.min(0.03, h * 0.25), 0.002, fp); }
    } else if (kind === 'tub') {
      if (top) { if (R - rho < rimW) kk = 1.08; dark = 0.25 * band(R - rho - rimW, 0.002, fp); }
      else { const a = Math.atan2(dz, dx) * R; kk = 1 - 0.12 * S3.lineMask(a, 0.035, 0.005, fp); if (fromTop < 0.012) kk *= 1.08; }
    } else if (kind === 'barrel') {
      if (top) { kk = 1 - 0.1 * S3.lineMask(dx * 0.7 + dz * 0.7, 0.06, 0.002, fp); if (R - rho < rimW) kk *= 0.8; }
      else {
        const a = Math.atan2(dz, dx) * R; kk = (0.92 + 0.12 * S3.hash2(Math.floor(a / 0.07), 5)) * (1 - 0.35 * S3.lineMask(a, 0.07, 0.003, fp));
        const yy = (y - s.y0) / h; if (Math.abs(yy - 0.18) < 0.03 || Math.abs(yy - 0.82) < 0.03) { C = [0.05, 0.05, 0.05]; kk = 1.2; }
      }
    } else if (kind === 'drum') {
      if (top) { if (R - rho < rimW) kk = 1.12; if (Math.hypot(dx - R * 0.5, dz) < R * 0.12) kk *= 0.6; }
      else { const yy = y - s.y0; kk = 1 - 0.2 * S3.lineMask(yy, h / 3, 0.005, fp); if (fromTop < 0.01) kk *= 1.1; }
    } else {
      const t = tex ? texL(tex, top ? dx : Math.atan2(dz, dx) * R, top ? dz : y, fp, tpm, k, S, 0.7, 1.3) : 1;
      kk = t * (top ? 1 - 0.25 * Math.pow(rho / R, 6) : 1);
      if (!top && fromTop < 0.006) dark = 0.3;
    }
    for (let c = 0; c < 3; c++) out[c] = C[c] * kk * (1 - dark) + 0.04 * dark;
  } };
}
export const SKIN_TEX = {
  stone: (t) => t.use === 'stone' && !/cobble|pebble|grassy|tile_floor|slab/.test(t.id),
  concrete: (t) => (t.use === 'floor' || t.use === 'wall') && /concrete|cement|plaster/.test(t.id) && !/brick|block/.test(t.id),
  brick: (t) => t.use === 'wall' && /brick|block/.test(t.id),
  metal: (t) => t.use === 'metal' && !/grate|grid|corrugated|shutter/.test(t.id),
  cabinet: (t) => t.use === 'metal' && !/grate|grid|corrugated|shutter|rust/.test(t.id),
  tin: (t) => t.use === 'metal' && !/grate|grid|corrugated|shutter|rust/.test(t.id),
  hay: (t) => t.id === 'thatch_roof_angled' || (t.use === 'fabric' && /hessian/.test(t.id)),
  timber: (t) => t.use === 'wood' && !/laminate|parquet|herringbone|veneer|peeling/.test(t.id),
  book: (t) => (t.use === 'fabric' || t.use === 'flat2d') && /leather|linen|denim|cotton|hessian|corduroy/.test(t.id),
  cushion: (t) => t.use === 'fabric',
  paint: (t) => t.use === 'wood',
  slat: (t) => t.use === 'wood', plank: (t) => t.use === 'wood', panel: (t) => t.use === 'wood', plastic: () => false,
};
export function kindsFor(style, pool, kinds, minTest = 1) {
  const sp = splitIds(pool, kinds, minTest);
  const mine = kinds.filter((k) => sp(k) === style.split);
  return mine.length ? mine : kinds;
}
export function primaryKind(style, pool, kinds, minTest = 1) {
  const ks = kindsFor(style, pool, kinds, minTest);
  const k = ks[style.primaryCombo(pool, [ks.length])[0]];
  style.note(`${pool}:${k}`);
  return k;
}
export function pickSplit(style, pool, items, { minTest = 1, id = (x) => (Array.isArray(x) ? x.join('/') : String(x)) } = {}) {
  const ids = items.map(id), sp = splitIds(pool, ids, minTest);
  const mine = items.filter((x, i) => sp(ids[i]) === style.split), list = mine.length ? mine : items;
  const it = list[Math.floor(style.rand() * list.length)];
  style.note(`${pool}:${id(it)}`);
  return it;
}
export function splitList(style, pool, items, { minTest = 1, id = (x) => (Array.isArray(x) ? x.join('/') : String(x)) } = {}) {
  const ids = items.map(id), sp = splitIds(pool, ids, minTest);
  const mine = items.filter((x, i) => sp(ids[i]) === style.split);
  return mine.length ? mine : items;
}
export async function skinTexture(style, kind) {
  const f = SKIN_TEX[kind];
  if (!f) return null;
  const t = style.pick('tex', f) || (kind === 'hay' ? style.pick('tex', (x) => x.use === 'fabric') : null);
  return t ? S3.loadTexture(t.file) : null;
}

export function huePalette(rnd, n, { sat = [0.55, 0.8], lum = [0.12, 0.3], avoid = [], minDE = 22 } = {}) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const need = minDE - 2 * Math.floor(attempt / 60);
    const phase = rnd() * 360, s = sat[0] + (sat[1] - sat[0]) * rnd(), L = lum[0] + (lum[1] - lum[0]) * rnd(), alt = rnd() < 0.5 ? 1 : -1;
    const cols = Array.from({ length: n }, (_, i) => {
      const h = (phase + i * 360 / n + (rnd() - 0.5) * 360 / n * 0.25) % 360;
      return S3.scaleTo(S3.hueSatColor(h, s), L * (1 + alt * (i % 2 ? 0.28 : -0.22)) * (0.92 + 0.16 * rnd()));
    });
    const hues = cols.map((c) => S3.hueSat(c)[0]);
    if (hues.some((h) => avoid.some(([a, w]) => S3.hueDist(h, a) < w))) continue;
    let ok = true;
    for (let i = 0; i < n && ok; i++) for (let j = i + 1; j < n; j++) if (S3.deltaE(cols[i], cols[j]) < need) { ok = false; break; }
    if (ok) return cols.map(hexOf);
  }
  return null;
}
