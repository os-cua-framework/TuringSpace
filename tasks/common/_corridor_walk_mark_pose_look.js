import { splitIds, hash32 } from '../core/style.js';

const DECODED = new Map();
function assetUrl(file) {
  const raw = `./assets/${file}`;
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[raw.replace(/^(?:\.\/)+/, '')] || raw;
}
function decode(file, W, H, aspect = 0) {
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

const S2L = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
const toS = (v) => 255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
const lumL = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-9) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function satCap(h, other) {
  if (h >= 338 || h < 14) return 0.26;
  if (h < 20) return Math.min(other, 0.48);
  if (h >= 285) return Math.min(other, 0.22);
  return other;
}
function capSat(c, other) {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  if (mx <= 1e-9) return c;
  const s = (mx - mn) / mx, S = satCap(hueOf(c[0], c[1], c[2]), other);
  if (s <= S) return c;
  const L = lumL(c[0], c[1], c[2]);
  const a = mx - L, b = mn - L;
  const t = S * L / (a - b - S * a);
  const k = clamp(t, 0, 1);
  return [L + (c[0] - L) * k, L + (c[1] - L) * k, L + (c[2] - L) * k];
}
const sRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function prep(raw, { lum = 180, cv = 0.25, sat = 0.35, tint = null, chroma = 1 }) {
  const n = raw.w, N = n * n, d = raw.data, lin = new Float32Array(N * 3);
  let s1 = 0, s2 = 0, mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < N; i++) {
    const r = S2L[d[i * 4]], g = S2L[d[i * 4 + 1]], b = S2L[d[i * 4 + 2]];
    lin[i * 3] = r; lin[i * 3 + 1] = g; lin[i * 3 + 2] = b;
    const L = lumL(r, g, b); s1 += L; s2 += L * L; mr += r; mg += g; mb += b;
  }
  const mean = s1 / N, cvT = Math.sqrt(Math.max(0, s2 / N - mean * mean)) / Math.max(1e-6, mean);
  const k = Math.min(1, cv / Math.max(1e-6, cvT)), target = Math.pow(lum / 255, 2.2);
  const mL = lumL(mr / N, mg / N, mb / N), mc = [mr / N / mL, mg / N / mL, mb / N / mL];
  let tn = null;
  if (tint) { const t = tint.map((v) => S2L[Math.round(clamp(v, 0, 255))]), tl = lumL(...t); tn = capSat(t.map((v) => v / tl), 0.9); }
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = lin[i * 3], g = lin[i * 3 + 1], b = lin[i * 3 + 2], L = Math.max(1e-6, lumL(r, g, b));
    const rel = clamp(1 + k * (L / mean - 1), 0.35, 1.9);
    let c;
    if (tn) c = tn;
    else {
      c = [r / L, g / L, b / L];
      if (chroma < 1) c = [mc[0] + (c[0] - mc[0]) * chroma, mc[1] + (c[1] - mc[1]) * chroma, mc[2] + (c[2] - mc[2]) * chroma];
      c = capSat(c, sat);
    }
    const v = rel * target;
    out[i * 3] = toS(c[0] * v); out[i * 3 + 1] = toS(c[1] * v); out[i * 3 + 2] = toS(c[2] * v);
  }
  const lv = [out], sizes = [n];
  for (let s = n >> 1; s >= 4; s >>= 1) {
    const src = lv[lv.length - 1], S = s * 2, dst = new Float32Array(s * s * 3);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) for (let c = 0; c < 3; c++) {
      dst[(y * s + x) * 3 + c] = 0.25 * (src[((2 * y) * S + 2 * x) * 3 + c] + src[((2 * y) * S + 2 * x + 1) * 3 + c] + src[((2 * y + 1) * S + 2 * x) * 3 + c] + src[((2 * y + 1) * S + 2 * x + 1) * 3 + c]);
    }
    lv.push(dst); sizes.push(s);
  }
  return { n, lv, sizes };
}
function samp(T, a, b, tpp, out) {
  let l = tpp > 1 ? Math.min(T.lv.length - 1, Math.round(Math.log2(tpp))) : 0;
  const s = T.sizes[l], A = T.lv[l], m = s - 1, k = 1 / (1 << l);
  const x = a * k - 0.5, y = b * k - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r0 = (y0 & m) * s, r1 = ((y0 + 1) & m) * s, c0 = x0 & m, c1 = (x0 + 1) & m;
  const i00 = (r0 + c0) * 3, i10 = (r0 + c1) * 3, i01 = (r1 + c0) * 3, i11 = (r1 + c1) * 3;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  out[0] = A[i00] * w00 + A[i10] * w10 + A[i01] * w01 + A[i11] * w11;
  out[1] = A[i00 + 1] * w00 + A[i10 + 1] * w10 + A[i01 + 1] * w01 + A[i11 + 1] * w11;
  out[2] = A[i00 + 2] * w00 + A[i10 + 2] * w10 + A[i01 + 2] * w01 + A[i11 + 2] * w11;
  return out;
}
async function mat(item, world, opt) {
  const raw = await decode(item.file, 256, 256);
  const T = prep(raw, opt);
  T.tpu = T.n / world; T.id = item.id;
  return T;
}
async function photoMat(item) {
  const W = 40, H = 45, raw = await decode(item.file, W, H, 0.33 / 0.37), d = raw.data;
  const out = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const c = capSat([S2L[d[i * 4]], S2L[d[i * 4 + 1]], S2L[d[i * 4 + 2]]], 0.75);
    out[i * 3] = toS(c[0]); out[i * 3 + 1] = toS(c[1]); out[i * 3 + 2] = toS(c[2]);
  }
  return { w: W, h: H, px: out, id: item.id };
}
async function skyMat(item) {
  const raw = await decode(item.sky, 256, 64), d = raw.data, out = new Float32Array(256 * 64 * 3);
  for (let i = 0; i < 256 * 64; i++) {
    const c = capSat([S2L[d[i * 4]], S2L[d[i * 4 + 1]], S2L[d[i * 4 + 2]]], 0.35);
    out[i * 3] = toS(c[0]); out[i * 3 + 1] = toS(c[1]); out[i * 3 + 2] = toS(c[2]);
  }
  return { w: 256, h: 64, px: out, id: item.id };
}

export const THEMES = ['hotel', 'office', 'stone', 'warehouse', 'school', 'hospital', 'basement', 'mine', 'garden', 'loft', 'metro', 'library'];
const themeSplit = splitIds('corridor_walk_mark_pose|theme', THEMES, 3);

const rx = (re) => (t) => re.test(t.id);
const ROLE = {
  plaster: { use: ['wall'], re: /plaster|beige|concrete_wall|white_rough|painted/ },
  fabric: { use: ['fabric', 'flat2d'], re: /./ },
  carpet: { use: ['fabric', 'flat2d'], re: /wool|carpet|corduroy|melange|hessian|jersey|linen|terlenka|teddy|herringbone|denim|gingham|pattern|leather/ },
  woodfloor: { use: ['wood'], re: /floor|parquet|laminate|plank/ },
  wood: { use: ['wood'], re: /./ },
  stonewall: { use: ['stone', 'wall'], re: /wall|block|castle|medieval|sandstone|brick|rock_wall|cliff|slate/ },
  stonefloor: { use: ['stone', 'floor'], re: /cobble|slab|tile|flagstone|monastery|pebble|paving|pavement|stone/ },
  blockwall: { use: ['wall'], re: /concrete|block|plaster/ },
  metal: { use: ['metal', 'roof'], re: /corrugated|shutter|plate|sheet|metal|profile/ },
  concrete: { use: ['floor'], re: /concrete|cement|asphalt|garage|hangar/ },
  speckle: { use: ['floor'], re: /gravel|granular|pattern|terrazzo|interior|concrete|plaster/ },
  brick: { use: ['wall'], re: /brick/ },
  rock: { use: ['terrain', 'stone'], re: /rock|cliff|boulder/ },
  dirt: { use: ['terrain'], re: /mud|trail|gravel|sand|ground|soil/ },
  leaves: { use: ['terrain'], re: /leaves|moss|grass|lichen|forest/ },
  gravel: { use: ['terrain', 'stone'], re: /gravel|sand|pebble|path|rocks_ground/ },
  tilefloor: { use: ['floor', 'stone'], re: /tile|pattern|paving|terrazzo|interior|slab/ },
};
function rolePool(style, role) {
  const R = ROLE[role];
  const all = style.pool('tex', (t) => R.use.includes(t.use));
  const hit = all.filter((t) => R.re.test(t.id));
  return hit.length ? hit : all;
}

const PAINT_PALE = ['#e9e4d8', '#e2e4e1', '#dfe5dc', '#dde3e8', '#ebe2cf', '#e6e1ea', '#f0ece2', '#d9dfd4'];
const PAINT_MID = ['#93a596', '#7f93a6', '#a7a089', '#6f8473', '#8d8f99', '#b3a77f', '#5f7487', '#8a9a83'];
const CARPET = ['#4e5b72', '#5d6b5a', '#6d6458', '#55595e', '#3f5f62', '#6a6f78', '#4b4f63', '#7a6e57'];
const LOCKER = ['#4f78a8', '#3f8c8a', '#5a8f5c', '#c4a240', '#8a9097', '#3c587f', '#6aa0c4', '#7d8a4e'];
const BOOKS = ['#2f4a6d', '#2f5a3f', '#b8963d', '#6b4a2f', '#d9cfb4', '#5b5f66', '#2e6f74', '#1f2328', '#6e6a33', '#4d3b5c', '#8a6a3a', '#3e5568'];
const BANDS = ['#2f7a4f', '#2f5f9f', '#d1a62c', '#2a2d33', '#3f8f9a', '#7c8f3a'];
const REDS = [[176, 52, 42], [190, 44, 40], [162, 40, 36], [198, 58, 46], [172, 38, 48]];
const DOORS_FOR = {
  hotel: ['panel2', 'panel6'], office: ['flush', 'steel'], stone: ['plank'], warehouse: ['steel'], school: ['flush', 'panel2'],
  hospital: ['flush'], basement: ['steel', 'flush'], mine: ['plank'], garden: ['plank', 'panel2'], loft: ['steel', 'flush'],
  metro: ['steel', 'flush'], library: ['panel2', 'panel6'],
};

export async function buildCorridorLook(style, pictureCount = 4) {
  const themes = THEMES.filter((t) => themeSplit(t) === style.split);
  const [ti, ia, ib] = style.primaryCombo('theme-wall-floor', [themes.length, 40, 40]);
  const theme = themes[ti], rnd = style.rand;
  style.note(`theme:${theme}`);
  const pickRole = (role, i) => { const P = rolePool(style, role); const it = P[i % P.length]; style.note(`tex:${it.id}`); return it; };
  const pickRand = (role) => { const P = rolePool(style, role); const it = P[Math.floor(rnd() * P.length)]; style.note(`tex:${it.id}`); return it; };
  const pal = (list) => list[Math.floor(rnd() * list.length)];
  const L = {
    theme, key: style.key, amb: [1, 1, 1], pool: 0.32, poolBase: 0.78, wallAO: 0.28, sky: null,
    red: REDS[Math.floor(rnd() * REDS.length)], doorStyle: pal(DOORS_FOR[theme]), frame: [240, 238, 232], knob: [222, 182, 84],
    picFrame: 'wood', lamp: 'round', ceilBase: [226, 224, 218],
  };
  const M = {};
  switch (theme) {
    case 'hotel': {
      const paper = rnd() < 0.5;
      M.upper = await mat(paper ? pickRole('fabric', ia) : pickRole('plaster', ia), paper ? 0.5 : 1.2, { lum: 200 + rnd() * 30, cv: paper ? 0.18 : 0.08, sat: 0.35, tint: paper ? null : sRGB(pal(PAINT_PALE)) });
      const woodW = rnd() < 0.5;
      M.wains = await mat(pickRand('wood'), 0.8, woodW ? { lum: 95 + rnd() * 40, cv: 0.2, sat: 0.55 } : { lum: 130 + rnd() * 50, cv: 0.05, tint: sRGB(pal(PAINT_MID)) });
      L.wainsGroove = woodW ? 4 : 6;
      const carpet = rnd() < 0.55;
      M.floor = await mat(carpet ? pickRole('carpet', ib) : pickRole('woodfloor', ib), carpet ? 0.6 : 1.4, carpet ? { lum: 85 + rnd() * 50, cv: 0.2, tint: sRGB(pal(CARPET)) } : { lum: 110 + rnd() * 50, cv: 0.22, sat: 0.6 });
      L.floorKind = carpet ? 'tex' : 'tex';
      L.frame = rnd() < 0.5 ? [240, 238, 232] : [96, 66, 44];
      L.trim = [238, 235, 228];
      L.lamp = rnd() < 0.5 ? 'round' : 'down';
      L.amb = [1.03, 1.0, 0.94]; L.picFrame = rnd() < 0.5 ? 'wood' : 'gold';
      break;
    }
    case 'office': {
      M.upper = await mat(pickRole('plaster', ia), 1.4, { lum: 210 + rnd() * 25, cv: 0.07, tint: sRGB(pal(PAINT_PALE)) });
      M.floor = await mat(pickRole('carpet', ib), 0.5, { lum: 80 + rnd() * 60, cv: 0.22, tint: sRGB(pal(CARPET)) });
      L.floorKind = 'tiles'; L.tile = 0.5;
      L.bumper = rnd() < 0.5 ? [196, 199, 204] : [150, 118, 84];
      L.frame = [170, 174, 180]; L.lamp = 'panel'; L.ceilGrid = 0.5; L.ceilBase = [232, 233, 234];
      L.amb = [0.97, 1.0, 1.03]; L.picFrame = 'black'; L.knob = [200, 202, 206];
      break;
    }
    case 'stone': {
      M.upper = await mat(pickRole('stonewall', ia), 1.1, { lum: 120 + rnd() * 50, cv: 0.3, sat: 0.3 });
      M.floor = await mat(pickRole('stonefloor', ib), 1.6, { lum: 105 + rnd() * 45, cv: 0.3, sat: 0.3 });
      M.ceil = await mat(pickRand('wood'), 1.0, { lum: 70 + rnd() * 30, cv: 0.25, sat: 0.45 });
      L.frame = [86, 80, 72]; L.lamp = 'lantern'; L.ceilKind = 'beams'; L.knob = [40, 38, 36];
      L.amb = [1.06, 0.97, 0.86]; L.picFrame = 'wood'; L.pool = 0.42; L.poolBase = 0.66;
      break;
    }
    case 'warehouse': {
      M.lower = await mat(pickRole('blockwall', ia), 1.2, { lum: 150 + rnd() * 40, cv: 0.22, sat: 0.25 });
      M.upper = await mat(pickRole('metal', ia + 7), 0.9, { lum: 140 + rnd() * 50, cv: 0.3, sat: 0.3 });
      M.floor = await mat(pickRole('concrete', ib), 1.8, { lum: 135 + rnd() * 40, cv: 0.2, sat: 0.2 });
      L.floorLine = rnd() < 0.7 ? [222, 186, 40] : [232, 232, 226];
      L.hazard = true; L.frame = rnd() < 0.5 ? [214, 178, 40] : [120, 124, 130];
      L.lamp = 'highbay'; L.ceilKind = 'deck'; L.ceilBase = [92, 96, 102]; L.knob = [196, 198, 202];
      L.amb = [1.0, 1.0, 1.0]; L.picFrame = 'metal';
      break;
    }
    case 'school': {
      L.locker = sRGB(pal(LOCKER));
      M.locker = await mat(pickRole('metal', ia), 0.6, { lum: 110, cv: 0.06, tint: L.locker });
      M.upper = await mat(pickRole('blockwall', ia + 3), 1.0, { lum: 205 + rnd() * 25, cv: 0.12, tint: sRGB(pal(PAINT_PALE)) });
      L.stripe = sRGB(pal(BANDS));
      M.floor = await mat(pickRole('speckle', ib), 0.7, { lum: 200, cv: 0.1, sat: 0.15 });
      L.floorKind = 'checker'; L.checkB = sRGB(pal(PAINT_MID));
      L.frame = [150, 154, 160]; L.lamp = 'panel'; L.ceilGrid = 0.5; L.ceilBase = [230, 230, 228];
      L.amb = [0.99, 1.0, 1.0]; L.picFrame = 'poster'; L.knob = [196, 198, 202];
      break;
    }
    case 'hospital': {
      M.upper = await mat(pickRole('plaster', ia), 1.4, { lum: 222 + rnd() * 18, cv: 0.05, tint: sRGB(pal(PAINT_PALE)) });
      L.guard = sRGB(pal(['#cfe0d6', '#cdd9e4', '#e3dccb', '#d6d8dc', '#d9e3c9']));
      L.rail = pal([[160, 120, 84], [236, 236, 232], [186, 190, 196]]);
      M.floor = await mat(pickRole('speckle', ib), 0.9, { lum: 175 + rnd() * 35, cv: 0.12, tint: sRGB(pal(['#d8d2c4', '#c9ced4', '#cbd2c4', '#d2cfc9'])) });
      L.frame = [236, 236, 232]; L.lamp = 'panel'; L.ceilGrid = 0.5; L.ceilBase = [236, 237, 238];
      L.amb = [0.96, 1.0, 1.04]; L.picFrame = 'silver'; L.knob = [200, 202, 206];
      break;
    }
    case 'basement': {
      M.upper = await mat(pickRole('blockwall', ia), 1.3, { lum: 125 + rnd() * 45, cv: 0.3, sat: 0.2 });
      M.floor = await mat(pickRole('concrete', ib), 1.6, { lum: 110 + rnd() * 40, cv: 0.25, sat: 0.2 });
      M.ceil = await mat(pickRole('concrete', ib + 5), 1.6, { lum: 120, cv: 0.2, sat: 0.15 });
      L.pipe = pal([[150, 154, 160], [92, 128, 96], [86, 112, 150], [196, 168, 70], [170, 120, 80]]);
      L.dado = rnd() < 0.75 ? { h: 0.42 + rnd() * 0.36, c: sRGB(pal(['#5d6b63', '#59626e', '#7a7468', '#4f5f52', '#6c7a86', '#8a8a82'])) } : null;
      L.frame = [120, 124, 130]; L.lamp = 'bulb'; L.ceilKind = 'tex'; L.knob = [196, 198, 202];
      L.amb = [1.0, 0.98, 0.94]; L.picFrame = 'metal'; L.pool = 0.45; L.poolBase = 0.6;
      break;
    }
    case 'mine': {
      M.upper = await mat(pickRole('rock', ia), 0.9, { lum: 125 + rnd() * 40, cv: 0.26, sat: 0.3 });
      M.timber = await mat(pickRand('wood'), 0.9, { lum: 62 + rnd() * 25, cv: 0.3, sat: 0.5 });
      M.floor = await mat(pickRole('dirt', ib), 1.5, { lum: 100 + rnd() * 40, cv: 0.3, sat: 0.35 });
      L.frame = [90, 66, 46]; L.lamp = 'lantern'; L.ceilKind = 'rock'; L.knob = [40, 38, 36];
      L.amb = [1.07, 0.96, 0.82]; L.picFrame = 'wood'; L.pool = 0.5; L.poolBase = 0.58;
      break;
    }
    case 'garden': {
      const greens = ['#4f7a3a', '#3f6b35', '#5b8040', '#46703f', '#62813d'];
      M.upper = await mat(pickRole('leaves', ia), 0.45, { lum: 85 + rnd() * 30, cv: 0.5, tint: sRGB(pal(greens)) });
      M.floor = await mat(pickRole('gravel', ib), 1.4, { lum: 145 + rnd() * 35, cv: 0.28, sat: 0.3 });
      const skies = style.pool('hdri', (h) => ['outdoor-midday', 'morning-afternoon', 'overcast'].includes(h.use));
      const sk = skies.length ? skies[Math.floor(rnd() * skies.length)] : style.pick('hdri');
      if (sk) { style.note(`hdri:${sk.id}`); L.sky = await skyMat(sk); }
      L.edging = pal([[196, 192, 182], [168, 160, 146], [120, 116, 110], [210, 204, 190]]);
      L.frame = [196, 192, 182]; L.lamp = 'none'; L.ceilKind = 'sky'; L.knob = [40, 38, 36];
      L.amb = [1.0, 1.0, 0.98]; L.picFrame = 'sign'; L.pool = 0; L.poolBase = 1.0; L.wallAO = 0.36;
      break;
    }
    case 'loft': {
      M.upper = await mat(pickRole('brick', ia), 1.1, { lum: 120 + rnd() * 40, cv: 0.3, sat: 0.3 });
      M.floor = await mat(pickRole('concrete', ib), 2.0, { lum: 150 + rnd() * 35, cv: 0.14, sat: 0.12 });
      L.paintLow = rnd() < 0.6 ? { h: 0.5 + rnd() * 0.35, c: sRGB(pal(['#e8e6e0', '#d9dcd6', '#3d4248', '#c9cfd4', '#2f3a35'])) } : null;
      L.frame = [44, 44, 46]; L.lamp = 'pendant'; L.ceilKind = 'deck'; L.ceilBase = [58, 60, 64]; L.knob = [180, 182, 186];
      L.amb = [1.02, 0.99, 0.95]; L.picFrame = 'black'; L.pool = 0.4; L.poolBase = 0.68;
      break;
    }
    case 'metro': {
      L.tileCol = sRGB(pal(['#ecebe4', '#e9e3cf', '#d8e4da', '#d6e0e8', '#efefef']));
      L.band = sRGB(pal(BANDS));
      M.floor = await mat(pickRole('tilefloor', ib), 1.2, { lum: 140 + rnd() * 40, cv: 0.2, sat: 0.2 });
      L.frame = [130, 134, 140]; L.lamp = 'strip'; L.ceilBase = [214, 214, 210]; L.knob = [196, 198, 202];
      L.amb = [0.98, 1.0, 1.02]; L.picFrame = 'black';
      break;
    }
    case 'library': {
      M.shelf = await mat(pickRole('wood', ia), 0.8, { lum: 95 + rnd() * 50, cv: 0.2, sat: 0.55 });
      const carpet = rnd() < 0.5;
      M.floor = await mat(carpet ? pickRole('carpet', ib) : pickRole('woodfloor', ib), carpet ? 0.6 : 1.4, carpet ? { lum: 80 + rnd() * 40, cv: 0.2, tint: sRGB(pal(CARPET)) } : { lum: 105 + rnd() * 45, cv: 0.22, sat: 0.55 });
      L.bookSalt = 1 + Math.floor(rnd() * 9999);
      L.frame = [96, 66, 44]; L.lamp = 'round'; L.ceilBase = [228, 222, 210];
      L.amb = [1.04, 1.0, 0.93]; L.picFrame = 'gold';
      break;
    }
    default: throw new Error(`corridor look: ${theme}`);
  }
  const photos = style.pool('photo');
  L.photos = [];
  if (photos.length) {
    const base = Math.floor(rnd() * photos.length), stepP = 1 + Math.floor(rnd() * Math.max(1, photos.length - 1));
    for (let k = 0; k < pictureCount; k++) {
      const it = photos[(base + k * stepP) % photos.length];
      style.note(`photo:${it.id}`);
      L.photos.push(await photoMat(it));
    }
  }
  L.M = M;
  L.salt = 1 + Math.floor(rnd() * 997);
  L.swapPanels = rnd() < 0.5;
  return L;
}

const T3 = [0, 0, 0];
function hash2(a, b) { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const setc = (out, c, k = 1) => { out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; };
const mixc = (out, c, t) => { out[0] += (c[0] - out[0]) * t; out[1] += (c[1] - out[1]) * t; out[2] += (c[2] - out[2]) * t; };
function texAt(T, a, b, fp, out) { return samp(T, a * T.tpu, b * T.tpu, fp * T.tpu, out); }

const DOOR_U0 = 0.27, DOOR_U1 = 0.73;
function doorPx(L, u, v, out) {
  if (u < DOOR_U0 || u > DOOR_U1 || v > 1.22) { setc(out, L.frame); if (L.theme === 'stone' || L.theme === 'garden') { const n = hash2((u * 60) | 0, (v * 60) | 0); out[0] *= 0.92 + 0.12 * n; out[1] *= 0.92 + 0.12 * n; out[2] *= 0.92 + 0.12 * n; } return; }
  const R = L.red, pu = (u - DOOR_U0) / (DOOR_U1 - DOOR_U0), pv = v / 1.22;
  let k = 1, c = R;
  const edgeK = 0.73, inK = 0.91;
  switch (L.doorStyle) {
    case 'panel2': case 'panel6': {
      const rows = L.doorStyle === 'panel2' ? [[0.1, 0.46], [0.56, 0.9]] : [[0.08, 0.3], [0.38, 0.62], [0.7, 0.92]];
      const cols = L.doorStyle === 'panel2' ? [[0.16, 0.84]] : [[0.14, 0.46], [0.54, 0.86]];
      for (const [a, b] of rows) for (const [p, q] of cols) {
        if (pu > p && pu < q && pv > a && pv < b) k = inK;
        else if (pu > p - 0.02 && pu < q + 0.02 && pv > a - 0.015 && pv < b + 0.015) k = edgeK;
      }
      const kx = (pu - 0.86) / 0.035, ky = (pv - 0.47) / 0.025;
      if (kx * kx + ky * ky < 1) { setc(out, L.knob); return; }
      break;
    }
    case 'flush': {
      if (pu > 0.6 && pu < 0.8 && pv > 0.55 && pv < 0.86) { const g = 0.75 + 0.25 * (pv - 0.55) / 0.31; setc(out, [70 * g, 84 * g, 96 * g]); if (pu < 0.615 || pu > 0.785 || pv < 0.565 || pv > 0.845) setc(out, [150, 150, 152]); return; }
      if (pu > 0.7 && pu < 0.9 && pv > 0.455 && pv < 0.485) { setc(out, L.knob); return; }
      if (pu > 0.84 && pu < 0.9 && pv > 0.43 && pv < 0.5) { setc(out, L.knob, 0.85); return; }
      if (pu < 0.03 || pu > 0.97) k = 0.86;
      break;
    }
    case 'steel': {
      if (pv < 0.12) { setc(out, [168, 170, 174], 0.95 + 0.05 * Math.sin(pu * 90)); return; }
      if (pu > 0.1 && pu < 0.9 && pv > 0.44 && pv < 0.48) { setc(out, [205, 207, 210], pv > 0.46 ? 1 : 0.82); return; }
      if (pu > 0.2 && pu < 0.8 && pv > 0.17 && pv < 0.32) { k = ((pv - 0.17) / 0.025) % 1 < 0.45 ? 0.55 : 0.95; }
      if (pu < 0.025 || pu > 0.975 || pv > 0.985) k = 0.8;
      break;
    }
    case 'plank': {
      const w = pu * 5, seam = w - Math.floor(w);
      k = (0.9 + 0.12 * hash2(Math.floor(w), 7)) * (seam < 0.05 || seam > 0.97 ? 0.62 : 1);
      if ((pv > 0.18 && pv < 0.23) || (pv > 0.76 && pv < 0.81)) { setc(out, [38, 36, 34]); return; }
      const rx2 = (pu - 0.78) / 0.07, ry2 = (pv - 0.5) / 0.06, rr = Math.sqrt(rx2 * rx2 + ry2 * ry2);
      if (rr > 0.7 && rr < 1.05) { setc(out, [44, 42, 40]); return; }
      break;
    }
    default: break;
  }
  setc(out, c, k);
}

function picturePx(L, p, idx, u, v, out) {
  const inner = !(u < 0.335 || u > 0.665 || v < 0.865 || v > 1.235);
  const ph = L.photos.length ? L.photos[idx % L.photos.length] : null;
  const photo = (pu, pv) => {
    if (!ph) { setc(out, [150, 160, 170]); return; }
    const x = clamp(Math.floor(pu * ph.w), 0, ph.w - 1), y = clamp(Math.floor((1 - pv) * ph.h), 0, ph.h - 1), i = (y * ph.w + x) * 3;
    out[0] = ph.px[i]; out[1] = ph.px[i + 1]; out[2] = ph.px[i + 2];
  };
  const pu = (u - 0.335) / 0.33, pv = (v - 0.865) / 0.37;
  switch (L.picFrame) {
    case 'poster': {
      if (!inner) return false;
      if (pu < 0.06 || pu > 0.94 || pv < 0.05 || pv > 0.95) { setc(out, [244, 242, 236]); if ((pu < 0.12 || pu > 0.88) && pv > 0.9) setc(out, [222, 214, 170]); return true; }
      photo((pu - 0.06) / 0.88, (pv - 0.05) / 0.9); return true;
    }
    case 'sign': {
      if (!inner && (u < 0.32 || u > 0.68 || v < 0.85 || v > 1.25)) return false;
      if (!inner) { setc(out, [118, 86, 56], 0.9 + 0.1 * Math.sin(v * 200)); return true; }
      photo(pu, pv); return true;
    }
    default: {
      if (!inner) {
        const F = { wood: [92, 62, 40], gold: [176, 146, 82], black: [40, 40, 42], silver: [178, 182, 188], metal: [128, 132, 138] }[L.picFrame] || [92, 62, 40];
        setc(out, F);
        if (L.picFrame === 'metal') { const bx = Math.abs(u - 0.32) < 0.008 || Math.abs(u - 0.68) < 0.008, by = Math.abs(v - 0.85) < 0.008 || Math.abs(v - 1.25) < 0.008; if (bx && by) setc(out, [70, 72, 76]); }
        if (L.picFrame === 'gold') { const e = Math.min(u - 0.31, 0.69 - u, v - 0.84, 1.26 - v); if (e < 0.006) setc(out, F, 0.75); }
        return true;
      }
      if (L.picFrame === 'black' || L.picFrame === 'silver') {
        if (pu < 0.08 || pu > 0.92 || pv < 0.07 || pv > 0.93) { setc(out, [240, 238, 232]); return true; }
        photo((pu - 0.08) / 0.84, (pv - 0.07) / 0.86); return true;
      }
      photo(pu, pv); return true;
    }
  }
}

export function wallPx(L, u, v, face, s, fp, m, out) {
  const door = m.door;
  if (face.c === door.col && face.r === door.row && face.d === door.dir && u > DOOR_U0 - 0.035 && u < DOOR_U1 + 0.035 && v < 1.26) { doorPx(L, u, v, out); return; }
  for (let k = 0; k < m.pictures.length; k++) {
    const p = m.pictures[k];
    if (p.col !== face.c || p.row !== face.r || p.dir !== face.d) continue;
    if (u > 0.31 && u < 0.69 && v > 0.84 && v < 1.26) { if (picturePx(L, p, k, u, v, out)) return; }
  }
  const M = L.M;
  switch (L.theme) {
    case 'hotel': {
      if (v < 0.085) { setc(out, L.trim, v > 0.075 ? 0.86 : 1); return; }
      if (v < 0.6) { texAt(M.wains, s, v, fp, out); const g = (s * L.wainsGroove) % 1; if (g < 0.03 || g > 0.985) { out[0] *= 0.82; out[1] *= 0.82; out[2] *= 0.82; } return; }
      if (v < 0.65) { setc(out, L.trim, v < 0.61 || v > 0.64 ? 0.9 : 1); return; }
      if (v > 1.5) { setc(out, L.trim, v < 1.51 ? 0.88 : 1.02); return; }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'office': {
      if (v < 0.065) { setc(out, [70, 72, 76], v > 0.058 ? 0.8 : 1); return; }
      if (v > 0.42 && v < 0.47) { setc(out, L.bumper, v > 0.455 ? 1.05 : v < 0.428 ? 0.78 : 0.95); return; }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'stone': case 'basement': {
      texAt(M.upper, s, v, fp, out);
      if (L.theme === 'basement' && v > 1.28 && v < 1.5) {
        for (const [a, b] of [[1.3, 1.37], [1.41, 1.48]]) if (v > a && v < b) { const t = (v - a) / (b - a), sh = 0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.1)); setc(out, L.pipe, Math.min(1.15, sh)); return; }
        if (((s * 2) % 1) < 0.025 && v < 1.49) { setc(out, [70, 72, 76]); return; }
      }
      if (L.theme === 'stone' && v < 0.04) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; }
      if (L.dado && v < L.dado.h) { const k = (out[0] + out[1] + out[2]) / 3 / 150; setc(out, L.dado.c, Math.min(1.2, 0.85 + 0.15 * k)); if (v > L.dado.h - 0.02) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; } }
      return;
    }
    case 'warehouse': {
      if (v < 0.07) { const st = ((s + v) * 6) % 1 < 0.5; setc(out, st ? [222, 186, 40] : [36, 36, 38]); return; }
      if (v < 0.62) { texAt(M.lower, s, v, fp, out); return; }
      if (v < 0.64) { setc(out, [150, 152, 156], 0.8); return; }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'school': {
      if (v < 0.05) { setc(out, [60, 62, 66]); return; }
      if (v < 0.95) {
        const w = s * 3, f = w - Math.floor(w);
        texAt(M.locker, s, v, fp, out);
        if (f < 0.025 || f > 0.975 || v > 0.94 || v < 0.06) { out[0] *= 0.62; out[1] *= 0.62; out[2] *= 0.62; return; }
        if (v > 0.8 && v < 0.9 && f > 0.3 && f < 0.7 && ((v - 0.8) / 0.02) % 1 < 0.45) { out[0] *= 0.5; out[1] *= 0.5; out[2] *= 0.5; return; }
        if (f > 0.78 && f < 0.86 && v > 0.48 && v < 0.6) { setc(out, [190, 192, 196]); return; }
        return;
      }
      if (v > 1.05 && v < 1.1) { setc(out, L.stripe); return; }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'hospital': {
      if (v < 0.06) { setc(out, L.guard, 0.72); return; }
      if (v < 0.42) { setc(out, L.guard, 0.97 + 0.03 * Math.sin(s * 3)); if (v > 0.415) { out[0] *= 0.85; out[1] *= 0.85; out[2] *= 0.85; } return; }
      if (v < 0.5) { const t = (v - 0.42) / 0.08; setc(out, L.rail, 0.62 + 0.5 * Math.sin(Math.PI * t)); return; }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'mine': {
      const post = u < 0.075 || u > 0.925;
      if (post || v > 1.42) {
        if (post) texAt(M.timber, v, u * 0.9, fp, out); else texAt(M.timber, s, v, fp, out);
        const e = post ? Math.min(Math.abs(u - 0.075), Math.abs(u - 0.925)) : Math.abs(v - 1.42);
        if (e < 0.008) { out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6; }
        return;
      }
      texAt(M.upper, s, v, fp, out); return;
    }
    case 'garden': {
      if (v < 0.09) {
        const a = s / 0.22, ia = Math.floor(a), fa = a - ia;
        setc(out, L.edging, 0.86 + 0.2 * hash2(ia + L.salt, 3));
        if (fa < 0.05 || fa > 0.95 || v > 0.082) { out[0] *= 0.55; out[1] *= 0.55; out[2] *= 0.55; }
        return;
      }
      texAt(M.upper, s, v, fp, out);
      if (v > 1.47) { const t = (v - 1.47) / 0.08; out[0] *= 1 + 0.15 * t; out[1] *= 1 + 0.15 * t; out[2] *= 1 + 0.15 * t; }
      return;
    }
    case 'loft': {
      if (v < 0.06) { setc(out, [48, 48, 50]); return; }
      if (v > 1.44) { setc(out, [40, 42, 46], v < 1.452 ? 0.7 : 1); return; }
      texAt(M.upper, s, v, fp, out);
      if (L.paintLow && v < L.paintLow.h) { const k = (out[0] + out[1] + out[2]) / 3 / 140; setc(out, L.paintLow.c, Math.min(1.15, 0.8 + 0.2 * k)); }
      return;
    }
    case 'metro': {
      if (v < 0.08) { setc(out, [70, 74, 78], 0.95); return; }
      const th = 0.06, tw = 0.12, row = Math.floor(v / th), off = (row & 1) * tw / 2;
      const a = (s + off) / tw, fa = a - Math.floor(a), fb = v / th - row;
      const band = v > 0.9 && v < 1.02;
      const col = band ? L.band : L.tileCol;
      setc(out, col, 0.96 + 0.06 * hash2(Math.floor(a) + L.salt, row));
      const gw = Math.max(0.06, Math.min(0.5, fp / tw * 0.8));
      if (fa < gw * 0.5 || fa > 1 - gw * 0.5 || fb < gw || fb > 1 - gw) mixc(out, [150, 150, 146], 0.7);
      return;
    }
    case 'library': {
      if (v < 0.06) { texAt(M.shelf, s, v, fp, out); out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; return; }
      if (v > 1.46) { texAt(M.shelf, s, v, fp, out); out[0] *= 0.85; out[1] *= 0.85; out[2] *= 0.85; return; }
      const sh = 0.35, row = Math.floor((v - 0.06) / sh), fv = (v - 0.06) / sh - row;
      if (fv < 0.07) { texAt(M.shelf, s, v, fp, out); return; }
      const post = ((s * 2) % 1);
      if (post < 0.04) { texAt(M.shelf, v, s, fp, out); out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; return; }
      const bw = 0.028, bi = Math.floor(s / bw), hsh = hash2(bi + L.bookSalt, row * 31 + 7);
      const top = 0.07 + (0.62 + 0.3 * hsh) * 0.93;
      if (fv > top) { setc(out, [46, 34, 26]); return; }
      const col = sRGB(BOOKS[Math.floor(hash2(bi * 3 + 1, row + L.bookSalt) * BOOKS.length)]);
      const fs = s / bw - bi;
      setc(out, col, (fs < 0.1 || fs > 0.92 ? 0.62 : 0.92 + 0.12 * hash2(bi, row)) * ((fv > 0.6 * top && fv < 0.66 * top) ? 1.25 : 1));
      return;
    }
    default: setc(out, [200, 200, 200]);
  }
}

export function floorPx(L, x, z, fp, isF, out) {
  const M = L.M;
  if (L.floorKind === 'tiles') {
    const t = L.tile, ix = Math.floor(x / t), iz = Math.floor(z / t), lx = x - ix * t, lz = z - iz * t, r = Math.floor(hash2(ix + L.salt, iz) * 4);
    const a = r === 0 ? lx : r === 1 ? lz : r === 2 ? t - lx : t - lz, b = r === 0 ? lz : r === 1 ? t - lx : r === 2 ? t - lz : lx;
    texAt(M.floor, a, b, fp, out);
    const e = Math.min(lx, lz, t - lx, t - lz);
    if (e < 0.006) { out[0] *= 0.86; out[1] *= 0.86; out[2] *= 0.86; }
    return;
  }
  if (L.floorKind === 'checker') {
    texAt(M.floor, x, z, fp, out);
    if ((Math.floor(x * 3) + Math.floor(z * 3)) & 1) { const k = out[0] / 200; setc(out, L.checkB, k); }
    return;
  }
  texAt(M.floor, x, z, fp, out);
  if (L.floorLine) {
    const c = Math.floor(x), r = Math.floor(z), fx = x - c, fz = z - r;
    const near = (f) => f > 0.09 && f < 0.13;
    if ((!isF(c, r - 1) && near(fz)) || (!isF(c, r + 1) && near(1 - fz)) || (!isF(c - 1, r) && near(fx)) || (!isF(c + 1, r) && near(1 - fx))) setc(out, L.floorLine, 0.9);
  }
}

export function ceilPx(L, x, z, fp, az, el, out) {
  const fx = x - Math.floor(x) - 0.5, fz = z - Math.floor(z) - 0.5, d2 = fx * fx + fz * fz;
  const M = L.M;
  switch (L.ceilKind) {
    case 'sky': {
      const S = L.sky;
      if (!S) { setc(out, [200, 214, 230]); return true; }
      const u = ((az / (2 * Math.PI)) % 1 + 1) % 1, v = clamp(1 - el / (Math.PI / 2), 0, 1);
      const fx = u * S.w - 0.5, fy = clamp(v * S.h - 0.5, 0, S.h - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      const xa = (x0 + S.w) % S.w, xb = (x0 + 1) % S.w, ya = y0, yb = Math.min(S.h - 1, y0 + 1);
      for (let c = 0; c < 3; c++) out[c] = (S.px[(ya * S.w + xa) * 3 + c] * (1 - ax) + S.px[(ya * S.w + xb) * 3 + c] * ax) * (1 - ay) + (S.px[(yb * S.w + xa) * 3 + c] * (1 - ax) + S.px[(yb * S.w + xb) * 3 + c] * ax) * ay;
      return true;
    }
    case 'beams': {
      texAt(M.ceil, x, z, fp, out);
      const b = (z * 2) % 1;
      if (b < 0.14) { out[0] *= 0.62; out[1] *= 0.62; out[2] *= 0.62; }
      break;
    }
    case 'rock': {
      texAt(M.upper, x, z, fp, out); out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7;
      const bz = z - Math.floor(z);
      if (bz < 0.06 || bz > 0.96) texAt(M.timber, x, z * 0.5, fp, out);
      break;
    }
    case 'tex': texAt(M.ceil, x, z, fp, out); break;
    case 'deck': {
      setc(out, L.ceilBase, ((x * 4) % 1) < 0.5 ? 1 : 0.86);
      break;
    }
    default: {
      setc(out, L.ceilBase);
      if (L.ceilGrid) { const g = L.ceilGrid, ax = (x / g) % 1, az2 = (z / g) % 1; if (ax < 0.02 || az2 < 0.02) setc(out, L.ceilBase, 0.84); }
    }
  }
  switch (L.lamp) {
    case 'round': if (d2 < 0.011) setc(out, [255, 252, 236]); else { const gl = Math.exp(-d2 / 0.05) * 18; out[0] += gl; out[1] += gl; out[2] += gl; } break;
    case 'down': if (d2 < 0.004) setc(out, [255, 250, 230]); else if (d2 < 0.006) setc(out, [190, 190, 186]); break;
    case 'panel': if (Math.abs(fx) < 0.2 && Math.abs(fz) < 0.12) setc(out, Math.abs(fx) < 0.19 && Math.abs(fz) < 0.11 ? [252, 253, 255] : [200, 202, 206]); break;
    case 'strip': if (Math.abs(fz) < 0.035 && Math.abs(fx) < 0.42) setc(out, [255, 255, 250]); break;
    case 'highbay': case 'pendant': case 'bulb': case 'lantern': {
      const R2 = L.lamp === 'highbay' ? 0.012 : L.lamp === 'pendant' ? 0.008 : 0.003;
      const col = L.lamp === 'lantern' ? [255, 226, 160] : [255, 250, 232];
      if (d2 < R2) setc(out, col);
      else if (d2 < R2 * 1.6 && L.lamp !== 'bulb') setc(out, L.lamp === 'lantern' ? [50, 40, 30] : [70, 72, 76]);
      else { const gl = Math.exp(-d2 / 0.03) * (L.lamp === 'lantern' ? 40 : 26); out[0] += gl; out[1] += gl * 0.95; out[2] += gl * 0.85; }
      break;
    }
    default: break;
  }
  return false;
}

export const lookKey = (L) => `${L.key}|${L.theme}`;
export const themeTestIds = () => THEMES.filter((t) => themeSplit(t) === 'test');
void hash32;
