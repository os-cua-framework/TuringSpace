import { S3, clamp, mix3, faceOf, texRGB, texLum, pickOf, pickTex, splitList, splitPick } from './_rt_kit.js';

const lum = S3.lum;
export const BUSY_FLOOR = new Set(['stone_tiles_02', 'dry_riverbed_rock', 'pavement_02', 'hexagonal_concrete_paving', 'interior_tiles',
  'cobblestone_floor_08', 'floor_pattern_02', 'square_floor_patern_01', 'brick_moss_001', 'concrete_pavement', 'painted_concrete']);
export const GROUND_OK = /grass|sand|gravel|mud|soil|snow|leaves|forest|forrest|trail|ground|pebbles|coast|dry_ground/;

export const SETTINGS = {
  lobby: { hdri: ['indoor', 'studio'], floor: (t) => (t.use === 'floor' || t.use === 'stone' && /slab|tile|monastery|marble|sandstone|rock_surface/.test(t.id)) && !BUSY_FLOOR.has(t.id), tiles: true },
  plaza: { hdri: ['outdoor-midday', 'morning-afternoon', 'urban', 'overcast', 'sunset'], floor: (t) => (t.use === 'floor' || t.use === 'stone' && /slab|tile|monastery|sandstone|rock_surface|pebbles/.test(t.id)) && !BUSY_FLOOR.has(t.id), tiles: true },
  park: { hdri: ['outdoor-midday', 'morning-afternoon', 'overcast', 'sunset'], floor: (t) => t.use === 'terrain' && GROUND_OK.test(t.id), tiles: false },
  hall: { hdri: ['indoor', 'studio'], floor: (t) => t.use === 'wood' && !/peeling|raw_plank|cabinet/.test(t.id), tiles: true, parquet: true },
  yard: { hdri: ['overcast', 'urban', 'outdoor-midday', 'morning-afternoon'], floor: (t) => t.use === 'floor' && /concrete|asphalt|cement|garage|hangar|granular|gravel|plaster/.test(t.id) && !BUSY_FLOOR.has(t.id), tiles: false },
  boards: { hdri: ['indoor', 'studio', 'morning-afternoon', 'overcast'], floor: (t) => t.use === 'wood' && !/peeling|raw_plank|cabinet|herringbone|parquet/.test(t.id), tiles: false, boards: true },
  workshop: { hdri: ['indoor', 'studio', 'overcast'], floor: (t) => t.use === 'floor' && /concrete|cement|garage|hangar|plaster|granular/.test(t.id) && !BUSY_FLOOR.has(t.id), tiles: true },
};

export function boardFloor({ tex, face, plank = 0.16, plankL = 1.3, seamK = 0.38, cv = 0.22, salt = 1 }) {
  const T = texRGB(tex, { face, texWorld: 1.2, cv, keep: 0.5, lo: 0.55, hi: 1.45 }), swap = tex.gxy > 1;
  return (x, z, fp, out) => {
    const row = Math.floor(x / plank), off = S3.hash2(row + salt, 7) * plankL, seg = Math.floor((z + off) / plankL);
    const tone = 0.88 + 0.24 * S3.hash2(row * 3 + salt, seg), du = S3.hash2(row, seg + salt) * 3, dv = S3.hash2(seg, row) * 3;
    if (swap) T(x + du, z + dv, fp, out); else T(z + dv, x + du, fp, out);
    const seam = Math.max(S3.lineMask(x, plank, 0.0035, fp), S3.lineMask(z + off, plankL, 0.003, fp) * 0.8);
    const k = tone * (1 - seamK * seam); out[0] *= k; out[1] *= k; out[2] *= k;
  };
}

export function groundFloor({ tex, face, texWorld = 2.0, cv = 0.25, keep = 0.6 }) {
  const T = texRGB(tex, { face, texWorld, cv, keep, lo: 0.5, hi: 1.55 });
  return (x, z, fp, out) => { T(x, z, fp, out); };
}

export async function envLook(style, { tag, settings, base, tileSizes = [0.5, 0.6, 0.8], ruler = null, L = [0.22, 0.52], named = S3.NAMED_HUES, wall = false, wallL = [0.35, 0.6], plank = null, layouts = null }) {
  const rnd = style.rand;
  const names = splitList(style, `${tag}|setting`, settings, 1);
  const [si, fi, hi] = style.primaryCombo(`${tag}|setting-floor-hdri`, [names.length, 43, 47]);
  const name = names[si], S = SETTINGS[name];
  let floors = style.pool('tex', S.floor);
  if (!floors.length) floors = style.pool('tex', SETTINGS.plaza.floor);
  const fl = floors[fi % floors.length];
  let hdris = style.pool('hdri', (h) => S.hdri.includes(h.use));
  if (!hdris.length) hdris = style.pool('hdri');
  const hd = hdris[hi % hdris.length];
  style.note(`setting:${name}`); style.note(`tex:${fl.id}`); style.note(`hdri:${hd.id}`);
  const wl = wall ? pickTex(style, (t) => t.use === 'wall' || (t.use === 'stone' && /wall|blocks/.test(t.id))) : null;
  if (wl) style.note(`tex:${wl.id}`);
  const [ftex, sky, wtex] = await Promise.all([S3.loadTexture(fl.file), S3.loadSky(hd.sky), wl ? S3.loadTexture(wl.file) : null]);
  const toneJ = rnd(), lightJ = rnd(), salt = 1 + Math.floor(rnd() * 997);
  const tiles = !!ruler || (S.tiles && !S.boards);
  const tile = ruler ? ruler.tile : S.parquet ? splitPick(style, `${tag}|parquet`, [0.35, 0.45, 0.55]) : splitPick(style, `${tag}|tile`, tileSizes);
  const woody = S.parquet || S.boards;
  let face = S3.keepNamedHues(faceOf(ftex.mean, L[0] + (L[1] - L[0]) * toneJ, { maxSat: name === 'park' ? 0.32 : 0.2, warmSat: woody ? 0.5 : 0.35 }), named, 0.1, woody ? 0.5 : name === 'park' ? 0.35 : 0.3);
  let light = S3.hdriLight(hd, base, { albedo: face, jitter: lightJ });
  const ndl = Math.max(0.2, base.dir[1] / Math.hypot(...base.dir)), fd = light.fill.dir, fdl = Math.max(0, fd[1] / Math.hypot(...fd));
  const lit = face.map((v, c) => v * (light.col[c] * ndl + light.sky[c] + light.fill.col[c] * fdl));
  const safe = S3.keepNamedHues(S3.safeTint(lit, { maxSat: 0.35, otherSat: 0.12 }), named, 0.1, 0.4);
  if (safe.some((v, c) => Math.abs(v - lit[c]) > 1e-9)) {
    face = face.map((v, c) => v * safe[c] / Math.max(1e-9, lit[c]));
    light = S3.hdriLight(hd, base, { albedo: face, jitter: lightJ });
  }
  let floor;
  if (tiles) {
    const ratio = ruler ? ruler.ratio : 0.42 + 0.25 * rnd();
    const grout = S3.scaleTo(S3.limitSat(face, 0.1), lum(face) * ratio);
    const base = S3.texTileFloor({ tex: ftex, tile, face, grout, salt, cv: S.parquet ? 0.16 : 0.09, texWorld: S.parquet ? 0.6 : 1.0,
      groutHW: ruler ? ruler.hw : 0.004, groutK: ruler ? ruler.k : 0.85 });
    const lay = ruler || S.parquet || !layouts ? 'grid' : splitPick(style, `${tag}|layout`, layouts);
    if (lay === 'diagonal') { const c = Math.SQRT1_2; floor = (x, z, fp, out) => base((x + z) * c, (z - x) * c, fp, out); }
    else if (lay === 'bond') floor = (x, z, fp, out) => { const row = Math.floor(z / tile); base(x * 0.5 + (row & 1 ? tile / 2 : 0), z, fp, out); };
    else if (lay === 'stagger') floor = (x, z, fp, out) => { const row = Math.floor(z / tile); base(x + (row & 1 ? tile / 2 : 0), z, fp, out); };
    else floor = base;
  } else if (S.boards) floor = boardFloor({ tex: ftex, face, plank: plank ? plank[0] + (plank[1] - plank[0]) * rnd() : 0.14 + 0.06 * rnd(), plankL: 1.0 + 0.6 * rnd(), salt });
  else floor = groundFloor({ tex: ftex, face, texWorld: 1.6 + 1.2 * rnd(), cv: 0.22, keep: 0.5 });
  let wallFn = null;
  if (wtex) {
    let wface = S3.keepNamedHues(faceOf(wtex.mean, wallL[0] + (wallL[1] - wallL[0]) * rnd(), { maxSat: 0.16, warmSat: 0.3 }), named, 0.08, 0.25);
    wallFn = S3.texWall({ tex: wtex, face: wface });
  }
  return {
    name, light, floor, face, tile: tiles ? tile : 0, wall: wallFn,
    sky: S3.skyFn(sky, 0.87 * lum(light.sky) / 0.443),
    ids: { setting: name, floor: fl.id, hdri: hd.id, tile: tiles ? tile : 0, wall: wl ? wl.id : null },
  };
}

export function texMat(T, face, { texWorld = 1.2, cv = 0.25, keep = 0.5, ks = 0.05, sh = 10, env = 0, fp = 0.004 } = {}) {
  const R = texRGB(T, { face, texWorld, cv, keep, lo: 0.5, hi: 1.5 });
  return {
    c: face, ks, sh, env,
    tex: (x, y, z, nx, ny, nz, s, out) => {
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ay >= ax && ay >= az) R(x, z, fp, out); else if (ax >= az) R(z + 3.1, -y, fp, out); else R(x + 1.7, -y, fp, out);
    },
  };
}

const SHIRTS = ['#b4533c', '#4d77a8', '#cf9f3a', '#5a8c57', '#7b5d9e', '#c4733d', '#3e8c8e', '#b25579', '#d8d4c8', '#2f3b52', '#8c2f39',
  '#e0b84a', '#6f8f3a', '#3b6f9e', '#a0522d', '#9a7fb8', '#e07b5a', '#4fa3a5', '#c9c2b0', '#55606e', '#d46a8a', '#7a6a52', '#2e6b4f', '#f0e2c0'];
const PANTS = ['#363b47', '#4b4d56', '#5a4a3c', '#2e3442', '#6a6458', '#1f2a44', '#3c3c3c', '#7a6f5a', '#2b4a6b', '#5b5f3a', '#8a8070', '#20262e'];
const SKINS = ['#f0cfae', '#e8c09c', '#d7a57e', '#c48e66', '#b47f57', '#8d5e3e', '#6e4a32'];
const HAIRS = ['#2b1f18', '#161616', '#5b3b23', '#8c6a3e', '#3a2a20', '#a08060', '#6b6b6b'];
const SHOES = ['#2a2a2f', '#4a3a2c', '#e6e2da', '#3a3f4b', '#6b3a2a'];
const lin = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2)); };
export async function wardrobe(style, n, { exclude = [] } = {}) {
  const rnd = style.rand, ex = new Set(exclude);
  const pool = splitList(style, 'g03|shirt', SHIRTS, 8).filter((c) => !ex.has(c));
  const pants = splitList(style, 'g03|pants', PANTS, 3), skins = splitList(style, 'g03|skin', SKINS, 2), hairs = splitList(style, 'g03|hair', HAIRS, 2), shoes = splitList(style, 'g03|shoe', SHOES, 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const knit = pickTex(style, (t) => t.use === 'fabric' && !/teddy|velour|leather|carpet/.test(t.id), (t) => t.use === 'fabric');
  const denim = style.pick('tex', (t) => t.use === 'fabric' && /denim|corduroy|linen|herringbone|melange|hessian/.test(t.id)) || knit;
  const [KT, DT] = await Promise.all([knit ? S3.loadTexture(knit.file) : null, denim ? S3.loadTexture(denim.file) : null]);
  const shirtTex = KT ? texLum(KT, { texWorld: 0.35, cv: 0.18 }) : null, pantsTex = DT ? texLum(DT, { texWorld: 0.3, cv: 0.2 }) : null;
  const clothMat = (hex, T, ks = 0.05) => {
    const c = lin(hex);
    if (!T) return { c, ks, sh: 10 };
    return { c, ks, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => { const ax = Math.abs(nx), az = Math.abs(nz); const t = Math.abs(ny) > 0.7 ? T(x, z, 0.004) : ax > az ? T(z, y, 0.004) : T(x, y, 0.004); out[0] = c[0] * t; out[1] = c[1] * t; out[2] = c[2] * t; } };
  };
  const people = Array.from({ length: n }, (_, i) => ({
    shirt: pool[i % pool.length], pants: pickOf(rnd, pants), skin: pickOf(rnd, skins), hair: pickOf(rnd, hairs), shoe: pickOf(rnd, shoes),
  }));
  style.note(`fabric:${knit ? knit.id : '-'}+${denim ? denim.id : '-'}`);
  style.note(`g03|wardrobe:${style.split}-half`);
  return {
    people,
    mats(order = null) {
      const mats = [], idx = [];
      people.forEach((p, i) => {
        const q = order ? people[order[i]] : p, b = mats.length;
        mats.push({ c: lin(q.skin), ks: 0.12, sh: 22 }, { c: lin(q.hair), ks: 0.16, sh: 30 }, clothMat(q.shirt, shirtTex), clothMat(q.pants, pantsTex), clothMat(q.shoe, null, 0.22));
        idx.push({ skin: b, hair: b + 1, top: b + 2, bottom: b + 3, shoe: b + 4 });
      });
      return { mats, idx };
    },
    lin, clothMat, shirtTex, pantsTex,
  };
}
export { lin, mix3, clamp, faceOf, texRGB, texLum, pickOf, S3 };
