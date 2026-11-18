import { material, texPool, texAt, sRGB, clamp } from './_surface_tex.js';
import { splitIds } from '../core/style.js';

const pick = (rnd, l) => l[Math.floor(rnd() * l.length)];
const BUILDS = ['woodcraft', 'painted', 'acrylic', 'aluminium', 'twotone', 'workshop', 'enamel', 'stone', 'felt', 'concrete'];
const buildSplit = splitIds('gravity_maze_turn|build', BUILDS, 3);
const STAINS = [null, '#ece6d8', '#cfd0cc', '#e2c48e', '#cfdac4', '#d6c8b8', '#c9d6dc', '#d4e4cc', '#c8d8e8', '#ead0c4', '#f0e0a8', '#dcd0ec'];
const PIGMENTS = [null, '#d8c8b8', '#c4ccd8', '#ccd8c4', '#e0ccbc', '#d8d0a8', '#c8dcdc'];
const ENAMEL = ['#f0dc9c', '#c8e2f0', '#d2ecc8', '#f0d0c0', '#e0d6f0', '#f4f0e4', '#c8e8e0'];
const RIB_DARK = ['#2c3e5c', '#2e4a34', '#3a3a40', '#5a3a28', '#3c2e4a', '#204a4e'];
const PAINT = ['#e8dcc4', '#d9e4dc', '#dfe3ea', '#efe6cf', '#e4dbe8', '#e9e9e4', '#d8e2c8'];
const ACRYL = ['#f2f2ee', '#d8ecf0', '#f3e9c8', '#e2f0d8', '#ece0f0'];
const RIB_PLASTIC = ['#2f5f9e', '#2e7d4f', '#d0a020', '#33373d', '#7a3f8f', '#1f7f86'];
const RINGS = [[196, 156, 84], [176, 180, 186], [40, 40, 42], [184, 120, 80], [210, 190, 120]];
const BALLS = ['steel', 'brass', 'glass', 'wood', 'rubber'];

function makeBallSprite(kind, tint, L) {
  const cache = new Map();
  return (sc, rb, makeCanvas) => {
    const k = `${sc}|${rb}`;
    if (cache.has(k)) return cache.get(k);
    const R = rb * sc, size = Math.ceil(2 * R + 4), c0 = size / 2;
    const cv = makeCanvas(size, size);
    if (!cv) return null;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), px = img.data;
    const [lx, ly, lz] = L;
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - c0) / R, ny = (y + 0.5 - c0) / R, d2 = nx * nx + ny * ny, d = Math.sqrt(d2), o = (y * size + x) * 4;
      const alpha = clamp((1 - d) * R + 0.5, 0, 1);
      if (alpha <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
      const spec = Math.pow(Math.max(0, rx * lx + ry * ly + rz * lz), kind === 'rubber' || kind === 'wood' ? 18 : 90);
      let r, g, b;
      if (kind === 'steel' || kind === 'brass') {
        const up = sm(-0.1, -0.85, ry), down = sm(0.15, 0.9, ry);
        let e = 150 + 86 * up - 74 * down;
        const fres = 0.62 + 0.38 * Math.pow(1 - nz, 3), rim = 1 - 0.35 * Math.pow(d, 6);
        e *= fres * rim;
        r = e * tint[0]; g = e * tint[1]; b = e * tint[2];
        const hl = spec * 300; r += hl; g += hl; b += hl;
      } else if (kind === 'glass') {
        const core = 0.55 + 0.45 * nz, caus = Math.pow(Math.max(0, -(nx * lx + ny * ly)), 2) * (1 - nz) * 0.6;
        r = tint[0] * (core + caus); g = tint[1] * (core + caus); b = tint[2] * (core + caus);
        const hl = spec * 320; r += hl; g += hl; b += hl;
      } else {
        const sh = 0.32 + 0.75 * ndl;
        let t = 1;
        if (kind === 'wood') t = 0.9 + 0.1 * Math.sin((nx * 0.8 + ny * 0.3) * 18 + nz * 4);
        r = tint[0] * sh * t; g = tint[1] * sh * t; b = tint[2] * sh * t;
        const hl = spec * (kind === 'rubber' ? 40 : 30); r += hl; g += hl; b += hl;
      }
      px[o] = clamp(r, 0, 255); px[o + 1] = clamp(g, 0, 255); px[o + 2] = clamp(b, 0, 255); px[o + 3] = 255 * alpha;
    }
    ctx.putImageData(img, 0, 0);
    const out = { cv, size: size / sc };
    cache.set(k, out);
    return out;
  };
}

export async function buildMazeLook(style) {
  const rnd = style.rand;
  const builds = BUILDS.filter((b) => buildSplit(b) === style.split);
  const woods = texPool(style, ['wood'], /./);
  const walls = texPool(style, ['wall', 'wood', 'fabric', 'flat2d'], /./);
  const [bi, wi, gi] = style.primaryCombo('build-wood-wall', [builds.length, woods.length, walls.length]);
  const build = builds[bi], wood = woods[wi], wallItem = walls[gi];
  style.note(`build:${build}`); style.note(`tex:${wood.id}`); style.note(`tex:${wallItem.id}`);
  const wood2 = pick(rnd, woods);
  style.note(`tex:${wood2.id}`);
  let plateT, ribT, frameT, plateTint = null, ribTint = null;
  const ks = [0.05, 0.13, 0.13, 0, 0.55];
  switch (build) {
    case 'woodcraft': {
      const st = pick(rnd, STAINS);
      plateT = await material(wood, 140, st ? { lum: 196 + rnd() * 22, cv: 0.12, tint: sRGB(st) } : { lum: 196 + rnd() * 22, cv: 0.12, sat: 0.5 });
      ribT = await material(wood2, 120, { lum: 92 + rnd() * 30, cv: 0.18, sat: 0.6 });
      frameT = await material(wood2, 160, { lum: 76 + rnd() * 24, cv: 0.18, sat: 0.6 });
      break;
    }
    case 'painted':
      plateTint = sRGB(pick(rnd, PAINT));
      plateT = await material(wood, 140, { lum: 205 + rnd() * 20, cv: 0.04, tint: plateTint });
      ribTint = sRGB(pick(rnd, RIB_PLASTIC));
      ribT = await material(wood2, 120, { lum: 90 + rnd() * 30, cv: 0.08, tint: ribTint });
      frameT = await material(wood2, 160, { lum: 70 + rnd() * 25, cv: 0.15, sat: 0.55 });
      ks[0] = 0.12; ks[1] = 0.2; break;
    case 'acrylic':
      plateTint = sRGB(pick(rnd, ACRYL));
      plateT = await material(wood, 400, { lum: 222 + rnd() * 14, cv: 0.015, tint: plateTint });
      ribTint = sRGB(pick(rnd, RIB_PLASTIC));
      ribT = await material(wood2, 400, { lum: 85 + rnd() * 30, cv: 0.02, tint: ribTint });
      frameT = await material(wood2, 400, { lum: 70 + rnd() * 20, cv: 0.02, tint: ribTint });
      ks[0] = 0.3; ks[1] = 0.35; ks[2] = 0.35; break;
    case 'aluminium': {
      const met = pick(rnd, texPool(style, ['metal'], /plate|metal|sheet|shutter/, /corrugated|grid|grate|rust/));
      style.note(`tex:${met.id}`);
      plateT = await material(met, 160, { lum: 200 + rnd() * 20, cv: 0.05, tint: [200, 204, 210] });
      ribT = await material(met, 120, { lum: 90 + rnd() * 20, cv: 0.08, tint: [120, 124, 132] });
      frameT = await material(met, 160, { lum: 70 + rnd() * 20, cv: 0.08, tint: [96, 100, 108] });
      ks[0] = 0.25; ks[1] = 0.45; ks[2] = 0.45; break;
    }
    case 'twotone': {
      const st = pick(rnd, STAINS);
      plateT = await material(wood, 140, st ? { lum: 205 + rnd() * 18, cv: 0.1, tint: sRGB(st) } : { lum: 205 + rnd() * 18, cv: 0.1, sat: 0.35 });
      ribTint = sRGB(pick(rnd, RIB_PLASTIC));
      ribT = await material(wood2, 120, { lum: 80 + rnd() * 30, cv: 0.06, tint: ribTint });
      frameT = await material(wood2, 160, { lum: 78 + rnd() * 25, cv: 0.18, sat: 0.6 });
      ks[1] = 0.22; break;
    }
    case 'enamel': {
      const met = pick(rnd, texPool(style, ['metal', 'wall'], /plate|metal|sheet|plaster|paint/, /corrugated|grid|grate|rust|brick/));
      style.note(`tex:${met.id}`);
      plateT = await material(met, 300, { lum: 212 + rnd() * 18, cv: 0.03, tint: sRGB(pick(rnd, ENAMEL)) });
      const rc = sRGB(pick(rnd, RIB_DARK));
      ribT = await material(met, 300, { lum: 70 + rnd() * 25, cv: 0.03, tint: rc });
      frameT = await material(met, 300, { lum: 60 + rnd() * 20, cv: 0.03, tint: rc });
      ks[0] = 0.3; ks[1] = 0.35; ks[2] = 0.35; break;
    }
    case 'stone': {
      const sto = pick(rnd, texPool(style, ['stone', 'floor', 'wall'], /marble|limestone|sandstone|stone|slab|plaster|travertine|granite/, /brick|cobble|pebble|tile|paving|rock_wall|crack|moss/));
      style.note(`tex:${sto.id}`);
      plateT = await material(sto, 180, { lum: 200 + rnd() * 25, cv: 0.1, sat: 0.3 });
      ribT = await material(wood2, 120, { lum: 80 + rnd() * 30, cv: 0.18, sat: 0.6 });
      frameT = await material(wood2, 160, { lum: 66 + rnd() * 24, cv: 0.18, sat: 0.6 });
      ks[0] = 0.12; break;
    }
    case 'felt': {
      const cloth = pick(rnd, texPool(style, ['fabric', 'flat2d'], /./, /denim|leather|velour|check|gingham/));
      style.note(`tex:${cloth.id}`);
      plateT = await material(cloth, 90, { lum: 175 + rnd() * 30, cv: 0.08, tint: sRGB(pick(rnd, ['#a8c8a0', '#a8b8d8', '#d8c098', '#c8a8b8', '#b8b8b0', '#98c8c8'])) });
      ribT = await material(wood2, 120, { lum: 78 + rnd() * 28, cv: 0.18, sat: 0.6 });
      frameT = await material(wood2, 160, { lum: 64 + rnd() * 22, cv: 0.18, sat: 0.6 });
      break;
    }
    case 'concrete': {
      const con = pick(rnd, texPool(style, ['floor', 'wall'], /concrete|cement|plaster/, /brick|tile|crack|paving/));
      style.note(`tex:${con.id}`);
      const pg = pick(rnd, PIGMENTS);
      plateT = await material(con, 200, pg ? { lum: 192 + rnd() * 26, cv: 0.1, tint: sRGB(pg) } : { lum: 192 + rnd() * 26, cv: 0.1, sat: 0.15 });
      ribT = await material(con, 120, { lum: 52 + rnd() * 20, cv: 0.05, tint: [60, 62, 68] });
      frameT = await material(con, 160, { lum: 46 + rnd() * 16, cv: 0.05, tint: [52, 54, 60] });
      ks[1] = 0.4; ks[2] = 0.4; break;
    }
    default: {
      const met = pick(rnd, texPool(style, ['metal'], /plate|metal|sheet/, /corrugated|grid|grate/));
      style.note(`tex:${met.id}`);
      const st = pick(rnd, STAINS);
      plateT = await material(wood, 120, st ? { lum: 190 + rnd() * 25, cv: 0.14, tint: sRGB(st) } : { lum: 190 + rnd() * 25, cv: 0.14, sat: 0.45 });
      ribT = await material(met, 100, { lum: 95 + rnd() * 25, cv: 0.12, sat: 0.2 });
      frameT = await material(met, 140, { lum: 80 + rnd() * 20, cv: 0.12, sat: 0.2 });
      ks[1] = 0.4; ks[2] = 0.4; break;
    }
  }
  const salt = rnd() * 400;
  const swapP = rnd() < 0.5;
  const plate = (u, v, out) => (swapP ? texAt(plateT, v + salt, u, 1, out) : texAt(plateT, u + salt, v, 1, out));
  const wall = (along, across, idx, out) => texAt(ribT, along + idx * 37.1, across * 1.6 + idx * 11.3, 1, out);
  const frame = (along, across, out) => texAt(frameT, along, across * 1.4 + 50, 1, out);
  const az = rnd() * 2 * Math.PI, el = (40 + 20 * rnd()) * Math.PI / 180;
  const light = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const sx = -Math.cos(az), sy = -Math.sin(az);
  const ballKind = pick(rnd, BALLS);
  const tint = ballKind === 'steel' ? [0.9, 0.92, 0.96] : ballKind === 'brass' ? [1.0, 0.82, 0.48]
    : ballKind === 'glass' ? sRGB(pick(rnd, ['#2f6fb0', '#2f8f5a', '#1f7f86', '#6a4a9a', '#c08a20']))
      : ballKind === 'wood' ? sRGB(pick(rnd, ['#8a5a32', '#6e4426', '#a0703e']))
        : sRGB(pick(rnd, ['#2b5fb0', '#2e8b4e', '#2a2a2e', '#d8a020', '#7a3f8f']));
  style.note(`ball:${ballKind}`);
  const wallLum = wallItem.use === 'wood' ? 150 + rnd() * 40 : 185 + rnd() * 40;
  const paint = rnd() < 0.55 ? pick(rnd, ['#c8d8e8', '#d0e4d0', '#e8dcc8', '#e8ccc0', '#d8d0e8', '#f0e8c8', '#c8e0e0', '#d8d8d4', '#b8c8b0', '#e0c8a8']) : null;
  const wallT = await material(wallItem, 260, paint ? { lum: wallLum, cv: 0.2, tint: sRGB(paint) } : { lum: wallLum, cv: 0.2, sat: 0.3 });
  const wallCache = new Map();
  const wallImage = (w, h, sc, makeCanvas) => {
    const k = `${w}x${h}@${sc}`;
    if (wallCache.has(k)) return wallCache.get(k);
    const W = Math.round(w * sc), H = Math.round(h * sc), cv = makeCanvas(W, H);
    if (!cv) return null;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = img.data, c = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / sc, v = y / sc, o = (y * W + x) * 4;
      const lk = 1.0 + 0.09 * ((u / w - 0.5) * -sx + (v / h - 0.5) * -sy);
      texAt(wallT, u, v, 1 / sc, c);
      px[o] = clamp(c[0] * lk, 0, 255); px[o + 1] = clamp(c[1] * lk, 0, 255); px[o + 2] = clamp(c[2] * lk, 0, 255); px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    wallCache.set(k, cv);
    return cv;
  };
  const TRAYS = [
    { back: ['#b58459', '#94653f', '#6a4428'], lip: ['#d9a874', '#bf8a5a', '#93613b'] },
    { back: ['#8f9aa6', '#6f7a86', '#4c5560'], lip: ['#c3ccd5', '#a5afb9', '#7c8792'] },
    { back: ['#6f8f6a', '#56724f', '#3b5136'], lip: ['#a9c49e', '#8aa77f', '#617a57'] },
    { back: ['#4a4f58', '#363a42', '#22252b'], lip: ['#7a808a', '#5d636d', '#40454d'] },
    { back: ['#c9a46c', '#a8834f', '#7c5d34'], lip: ['#ead0a0', '#d2b07a', '#a8834f'] },
  ];
  return {
    key: style.key, build, plate, wall, frame, ks, light, ringC: pick(rnd, RINGS), holeC: [44, 40, 38],
    ballSprite: makeBallSprite(ballKind, tint, light), ballShadow: [sx * 5.3, sy * 5.3], boardShadow: [sx * 10.3, sy * 10.3],
    wallImage, tray: pick(rnd, TRAYS), boardBack: '#3a3430',
  };
}
