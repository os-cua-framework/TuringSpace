import * as S3 from './_style3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lum = S3.lum;
export const toByte = (v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
export const cssOf = (c) => `rgb(${toByte(c[0])},${toByte(c[1])},${toByte(c[2])})`;
export const hexOf = (c) => '#' + c.map((v) => toByte(v).toString(16).padStart(2, '0')).join('');

function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}
function canvasOf(w, h) { return Object.assign(document.createElement('canvas'), { width: w, height: h }); }

export const loadTex = (item) => S3.loadTexture(item.file);
export const loadSky = (item) => S3.loadSky(item.sky);

function level(T, size) { let l = 0; while (l + 1 < T.sizes.length && T.sizes[l] > size) l++; return l; }

export function swatch(T, { tint = null, k = 0.45, lumTarget = null, maxSat = 0.6, size = 256, lo = 0.45, hi = 1.6 } = {}) {
  const l = level(T, size), n = T.sizes[l], a = T.lv[l], Lm = Math.max(1e-6, lum(T.mean));
  const cv = canvasOf(n, n), g = cv.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  const sc = lumTarget ? lumTarget / Lm : 1, f = tint ? 1 : satFactor(T.mean, maxSat);
  for (let i = 0; i < n * n; i++) {
    const c = [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    let o;
    if (tint) { const t = clamp(1 + k * (lum(c) / Lm - 1), lo, hi); o = [tint[0] * t, tint[1] * t, tint[2] * t]; }
    else { const L0 = lum(c); o = c.map((v) => (L0 + (v - L0) * f) * sc); const L = lum(o), Lt = Lm * sc; if (k !== 1 && L > 0) { const t = clamp(1 + k * (L / Lt - 1), lo, hi) * Lt / L; o = o.map((v) => v * t); } }
    d[i * 4] = toByte(o[0]); d[i * 4 + 1] = toByte(o[1]); d[i * 4 + 2] = toByte(o[2]); d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: cv, n, mean: tint ? tint.slice() : S3.limitSat(T.mean.map((v) => v * sc), maxSat) };
}
export function detail(T, { k = 0.5, size = 256, lo = 0.12, hi = 0.88 } = {}) {
  const l = level(T, size), n = T.sizes[l], a = T.lv[l], Lm = Math.max(1e-6, lum(T.mean));
  const cv = canvasOf(n, n), g = cv.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  for (let i = 0; i < n * n; i++) {
    const L = lum([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]) / Lm;
    const v = Math.round(255 * clamp(0.5 + 0.5 * k * (L - 1), lo, hi));
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: cv, n };
}

function faceMatrix(P0, P1, P3, Lu, Lv, n, unit, ox = 0, oy = 0) {
  const su = unit / n / Math.max(1e-6, Lu), sv = unit / n / Math.max(1e-6, Lv);
  const a = (P1.x - P0.x) * su, b = (P1.y - P0.y) * su, c = (P3.x - P0.x) * sv, d = (P3.y - P0.y) * sv;
  return [a, b, c, d, P0.x - a * ox - c * oy, P0.y - b * ox - d * oy];
}
const dist3 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
function path(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
const hashN = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

function patternFor(g, tex, info, unit, salt) {
  const pat = g.createPattern(tex.canvas, 'repeat');
  const n = tex.n;
  let M;
  if (info.world && info.world.length >= 3 && info.pts) {
    const W = info.world, P = info.pts, k = W.length - 1;
    const o = hashN(`${salt}|${Math.round(W[0].x)}|${Math.round(W[0].y)}|${Math.round(W[0].z)}`);
    M = faceMatrix(P[0], P[1], P[k], dist3(W[0], W[1]), dist3(W[0], W[k]), n, unit, o * n, ((o * 7.31) % 1) * n);
  } else {
    const cam = info.camera, pr = info.prim;
    const c = pr.c || pr.base || { x: pr.x || 0, y: pr.y || 0, z: pr.z || 0 };
    const p0 = cam.project(c), p1 = cam.project({ x: c.x + cam.r.x * 10, y: c.y + cam.r.y * 10, z: c.z + cam.r.z * 10 });
    const ppu = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10, s = unit * ppu / n, o = hashN(`${salt}|${Math.round(c.x)}|${Math.round(c.z)}`);
    M = [s, 0, 0, s, p0.x - s * o * n, p0.y - s * ((o * 3.7) % 1) * n];
  }
  try { pat.setTransform(new DOMMatrix(M)); } catch { }
  return pat;
}
function clipInfo(g, info) {
  if (info.circle) { g.beginPath(); g.arc(info.circle.x, info.circle.y, info.circle.r, 0, Math.PI * 2); }
  else path(g, info.pts);
}

export function overlaySkin(det, { unit = 40, alpha = 0.85, mode = 'overlay', salt = 'skin', extra = null } = {}) {
  return (g, info) => {
    g.save();
    clipInfo(g, info);
    g.clip();
    if (det && alpha > 0) {
      g.globalCompositeOperation = mode; g.globalAlpha = alpha;
      g.fillStyle = patternFor(g, det, info, unit, salt);
      clipInfo(g, info); g.fill();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (extra) extra(g, info);
    g.restore();
  };
}
export function sheen(strength = 0.18, tint = '255,255,255') {
  return (g, info) => {
    const pts = info.circle ? null : info.pts;
    let x0, y0, x1, y1;
    if (info.circle) { const c = info.circle; x0 = c.x - c.r; x1 = c.x + c.r; y0 = c.y - c.r; y1 = c.y + c.r; }
    else { x0 = Math.min(...pts.map((p) => p.x)); x1 = Math.max(...pts.map((p) => p.x)); y0 = Math.min(...pts.map((p) => p.y)); y1 = Math.max(...pts.map((p) => p.y)); }
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(${tint},0)`); gr.addColorStop(0.32, `rgba(${tint},${strength.toFixed(3)})`);
    gr.addColorStop(0.48, `rgba(${tint},0)`); gr.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = gr; clipInfo(g, info); g.fill();
  };
}

export function texturedFace(g, pts, world, sw, shade, { unit = 40, salt = 'f', camera = null } = {}) {
  g.save();
  path(g, pts);
  g.fillStyle = patternFor(g, sw, { pts, world, camera }, unit, salt);
  g.fill();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${Math.round(255 * clamp(shade[0], 0, 1))},${Math.round(255 * clamp(shade[1], 0, 1))},${Math.round(255 * clamp(shade[2], 0, 1))})`;
  path(g, pts); g.fill();
  g.restore();
}

const SKY_FULL = new Map();
export function loadSkyFull(item) {
  const file = item.sky;
  if (!SKY_FULL.has(file)) SKY_FULL.set(file, (async () => {
    const url = globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[`assets/${file}`] || `./assets/${file}`;
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = mkCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data, n = bmp.width * bmp.height, lin = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) lin[i * 3 + k] = Math.pow(d[i * 4 + k] / 255, 2.2);
    let s = 0; for (let i = 0; i < n; i++) s += lum([lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]]);
    return { w: bmp.width, h: bmp.height, lin, mean: s / n };
  })());
  return SKY_FULL.get(file);
}
export function skyBackdrop(sky, { meanLum = 0.6, maxSat = 0.35, yaw = 0 } = {}) {
  const { w, h } = sky, k = meanLum / Math.max(1e-6, sky.mean), y0 = yaw / 360;
  const lin = new Float32Array(sky.lin.length);
  for (let i = 0; i < w * h; i++) { const c = S3.limitSat([sky.lin[i * 3], sky.lin[i * 3 + 1], sky.lin[i * 3 + 2]], maxSat); lin[i * 3] = c[0]; lin[i * 3 + 1] = c[1]; lin[i * 3 + 2] = c[2]; }
  return (dx, dy, dz, out) => {
    const u = ((Math.atan2(dz, dx) / (2 * Math.PI) + 1 + y0) % 1) * w - 0.5;
    const th = Math.acos(clamp(dy, 0, 1)), v = clamp(th / (Math.PI / 2) * h - 0.5, 0, h - 1);
    const x0 = Math.floor(u), yA = Math.floor(v), fx = u - x0, fy = v - yA, yB = Math.min(h - 1, yA + 1);
    const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w;
    for (let c = 0; c < 3; c++) {
      out[c] = k * ((lin[(yA * w + xa) * 3 + c] * (1 - fx) + lin[(yA * w + xb) * 3 + c] * fx) * (1 - fy)
        + (lin[(yB * w + xa) * 3 + c] * (1 - fx) + lin[(yB * w + xb) * 3 + c] * fx) * fy);
    }
  };
}

export function renderPlane({ W, H, q = 1, cam, P, floor, floorY = 0, lightK = [1, 1, 1], back, haze = null, wall = null, clipFloor = null, wallK = null, tone = null }) {
  const w = Math.round(W * q), h = Math.round(H * q), cv = canvasOf(w, h), g = cv.getContext('2d');
  const img = g.createImageData(w, h), d = img.data, out = new Float64Array(3), E = cam.cam;
  const f = cam.f, r = cam.r, u = cam.u, fov = P.fov;
  for (let py = 0; py < h; py++) {
    const by = (py + 0.5) / q;
    for (let px = 0; px < w; px++) {
      const bx = (px + 0.5) / q, a = (bx - P.cx) / fov, b = (P.cy - by) / fov;
      const dx = f.x + r.x * a + u.x * b, dy = f.y + r.y * a + u.y * b, dz = f.z + r.z * a + u.z * b;
      const dl = Math.hypot(dx, dy, dz);
      let hit = 0, t = Infinity;
      if (dy < -1e-9) {
        t = (floorY - E.y) / dy;
        const x = E.x + t * dx, z = E.z + t * dz;
        if (!clipFloor || clipFloor(x, z)) {
          const fp = (t * dl / (fov * q)) / Math.sqrt(Math.max(0.12, -dy / dl));
          floor(x, z, fp, out);
          out[0] *= lightK[0]; out[1] *= lightK[1]; out[2] *= lightK[2];
          hit = 1;
        }
      }
      if (!hit && wall && dz < -1e-9) {
        const tw = (wall.z - E.z) / dz;
        if (tw > 0) {
          const x = E.x + tw * dx, y = E.y + tw * dy;
          if (y >= floorY - 1e-6) { wall.fn(x, y, tw * dl / (fov * q), out); const K = wallK || lightK; out[0] *= K[0]; out[1] *= K[1]; out[2] *= K[2]; hit = 2; t = tw; }
        }
      }
      if (!hit) back(dx / dl, dy / dl, dz / dl, out);
      if (haze && hit) {
        const dd = t * dl, m = haze.max * clamp((dd - haze.d0) / (haze.d1 - haze.d0), 0, 1);
        out[0] += (haze.col[0] - out[0]) * m; out[1] += (haze.col[1] - out[1]) * m; out[2] += (haze.col[2] - out[2]) * m;
      }
      if (tone) tone(out, bx, by);
      const o = (py * w + px) * 4;
      d[o] = toByte(out[0]); d[o + 1] = toByte(out[1]); d[o + 2] = toByte(out[2]); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function floorIrradiance(light, tintK = [1, 1, 1]) {
  const ndl = Math.max(0, light.dir.y);
  const k = light.ambient + (1 - light.ambient) * ndl;
  return tintK.map((v) => v * k);
}

export function texMat(T, { tint = null, cv = 0.25, lumTarget = 0.3, maxSat = 0.5, unit = 1, cam, ks = 0.1, sh = 20, env = 0.03, salt = 0, flat, fixedFp = null } = {}) {
  const k = Math.min(1.2, cv / Math.max(1e-6, T.cv)), Lm = Math.max(1e-6, lum(T.mean)), tpm = T.n / unit, S = new Float64Array(3);
  const sc = lumTarget / Lm;
  const base = tint ? tint.slice() : S3.limitSat(T.mean.map((v) => v * sc), maxSat), Lt = lum(base), f = satFactor(T.mean, maxSat);
  const tex = (x, y, z, nx, ny, nz, s, out, camArg = null) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const o = S3.hash2((s.id | 0) + salt * 31, 17 + salt) * 3 * unit;
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    const C = camArg || cam;
    const fp = C ? Math.hypot(x - C.eye[0], y - C.eye[1], z - C.eye[2]) / C.f : fixedFp;
    S3.sampleTex(T, (u + o) * tpm, (v + o * 0.7) * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    if (tint) {
      const t = clamp(1 + k * (lum(S) / Lm - 1), 0.55, 1.45);
      out[0] = tint[0] * t; out[1] = tint[1] * t; out[2] = tint[2] * t;
    } else {
      const L0 = 0.2126 * S[0] + 0.7152 * S[1] + 0.0722 * S[2], L = L0 * sc;
      const t = L > 0 ? clamp(1 + Math.min(1, k) * (L / Lt - 1), 0.5, 1.6) * Lt / L : 1;
      out[0] = (L0 + (S[0] - L0) * f) * sc * t; out[1] = (L0 + (S[1] - L0) * f) * sc * t; out[2] = (L0 + (S[2] - L0) * f) * sc * t;
    }
  };
  const m = { c: base, ks, sh, env, tex };
  if (flat !== undefined) m.flat = flat;
  return m;
}

export const FAMILIES = {
  wood: { uses: ['wood'], ks: 0.08, sh: 18, env: 0.02, sheen: 0.06, k: 0.55 },
  stone: { uses: ['stone'], ks: 0.04, sh: 10, env: 0.0, sheen: 0, k: 0.5 },
  metal: { uses: ['metal'], ks: 0.45, sh: 50, env: 0.18, sheen: 0.26, k: 0.45 },
  fabric: { uses: ['fabric'], ks: 0.0, sh: 4, env: 0.0, sheen: 0, k: 0.55 },
  concrete: { uses: ['floor', 'wall'], ks: 0.03, sh: 8, env: 0.0, sheen: 0, k: 0.45, filter: (t) => /concrete|plaster|cement|stucco|asphalt/.test(t.id) },
  plastic: { uses: [], ks: 0.4, sh: 40, env: 0.08, sheen: 0.2, k: 0.25 },
  leather: { uses: ['flat2d', 'fabric'], ks: 0.12, sh: 20, env: 0.02, sheen: 0.08, k: 0.5, filter: (t) => /leather/.test(t.id) },
};
export const SAFE = {
  wood: ['wood_table_001', 'oak_veneer_01', 'wood_table_worn', 'rough_wood', 'dark_wood', 'rosewood_veneer1', 'fine_grained_wood', 'wood_peeling_paint_weathered', 'plywood', 'wood_cabinet_worn_long', 'kitchen_wood',
    'wood_table', 'stained_pine', 'coated_pine', 'oriented_strand_board', 'lacquered_cherry_wood', 'walnut_veneer_02', 'sakura_bark', 'chinese_cedar_bark'],
  stone: ['clean_pebbles', 'seaside_rock', 'rock_surface', 'rock_face_03', 'rock_01', 'rock_boulder_dry', 'rock_05', 'rock_08', 'rock_04', 'rock_06', 'lichen_rock', 'worn_rock_natural_01', 'mossy_rock', 'rocks_ground_04',
    'dark_rock', 'rocks_ground_05', 'defense_wall', 'coral_fort_wall_03'],
  concrete: ['granular_concrete', 'brushed_concrete', 'gravel_concrete', 'grey_plaster', 'grey_plaster_02', 'grey_plaster_03', 'white_plaster_02', 'concrete_floor_02', 'dirty_concrete', 'scuffed_cement', 'painted_concrete_02', 'garage_floor', 'asphalt_01', 'asphalt_02', 'asphalt_06', 'gravel_embedded_concrete', 'gravel_concrete_03', 'hangar_concrete_floor', 'clay_floor_001', 'concrete_floor_worn_001', 'asphalt_pit_lane',
    'pebble_cemented_floor', 'gravel_concrete_02', 'gravel_concrete_04', 'concrete_wall_006', 'worn_mossy_plasterwall'],
  metal: ['green_metal_rust', 'rust_coarse_01', 'rusty_metal_02', 'rusty_metal_04', 'rusty_metal_sheet', 'rusty_metal_03', 'metal_plate_02', 'rusty_metal_05', 'blue_metal_plate', 'rusty_painted_metal'],
  fabric: ['dirty_carpet', 'hessian_230', 'hessian_380', 'cotton_jersey', 'rough_linen', 'curly_teddy_natural', 'poly_wool_herringbone', 'ribbed_corduroy', 'terlenka', 'jogging_melange', 'terry_cloth', 'velour_velvet', 'crepe_satin', 'denim_fabric_06', 'fabric_leather_01', 'fabric_leather_02',
    'floral_jacquard', 'polar_fleece', 'knitted_fleece', 'waffle_pique_cotton', 'caban', 'denim_fabric_03', 'denim_fabric_04', 'denim_fabric_05', 'bi_stretch', 'scuba_suede', 'stretch_poplin', 'crepe_georgette', 'jersey_melange'],
};
export function familyPool(style, fam, { safe = true } = {}) {
  const F = FAMILIES[fam];
  if (safe && SAFE[fam]) { const ids = new Set(SAFE[fam]); return style.pool('tex', (t) => ids.has(t.id)); }
  if (!F || !F.uses.length) return [];
  return style.pool('tex', (t) => F.uses.includes(t.use) && (!F.filter || F.filter(t)));
}
export function pickFrom(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

const KEY_SRGB = { 'outdoor-midday': [255, 244, 228], 'morning-afternoon': [255, 236, 212], sunset: [255, 226, 196], overcast: [244, 246, 250], urban: [255, 240, 222], indoor: [255, 236, 214], studio: [255, 249, 242] };
export function lightTints(hd) {
  const w = KEY_SRGB[hd.use] || KEY_SRGB.studio;
  const z = S3.limitSat(hd.zenith.map((v) => Math.max(1e-4, v)), 0.16), m = Math.max(...z);
  const cool = z.map((v) => Math.round(255 * Math.pow(Math.min(1, v / m * 0.93), 1 / 2.2)));
  const hx = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  return { warm: hx(w), cool: hx(cool), warmRGB: w, coolRGB: cool };
}
export function faceShade(light, n) {
  const l = Math.hypot(n.x, n.y, n.z) || 1, ndl = Math.max(0, (n.x * light.dir.x + n.y * light.dir.y + n.z * light.dir.z) / l);
  const k = light.ambient + (1 - light.ambient) * ndl;
  const arr = (c) => (Array.isArray(c) ? c : [c.r, c.g, c.b]), W = arr(light.warmRGB), C = arr(light.coolRGB);
  return [0, 1, 2].map((i) => k * (C[i] + (W[i] - C[i]) * ndl) / 255);
}
export function planePattern(g, cam, sw, { Y = 0, unit = 100, ox = 0, oz = 0, rot = 0 } = {}) {
  const pat = g.createPattern(sw.canvas, 'repeat'), n = sw.n, s = unit / n;
  const c = Math.cos(rot), si = Math.sin(rot);
  const W = (tx, ty) => { const x = (tx * c - ty * si) * s + ox, z = (tx * si + ty * c) * s + oz; return cam.project({ x, y: Y, z }); };
  const O = W(0, 0), A = W(1, 0), B = W(0, 1);
  try { pat.setTransform(new DOMMatrix([A.x - O.x, A.y - O.y, B.x - O.x, B.y - O.y, O.x, O.y])); } catch { }
  return pat;
}

const HZ = new Float64Array(3);
function satFactor(mean, maxSat) {
  const m = S3.limitSat(mean, maxSat), L = lum(mean);
  const d0 = Math.max(...mean.map((v) => Math.abs(v - L))), d1 = Math.max(...m.map((v) => Math.abs(v - L)));
  return d0 > 1e-9 ? clamp(d1 / d0, 0, 1) : 1;
}
export function renderBackdrop({ W, H, q = 1, cam, P, planes = [], walls = [], back = null, haze = null, tone = null }) {
  const w = Math.round(W * q), h = Math.round(H * q), cv = canvasOf(w, h), g = cv.getContext('2d');
  const img = g.createImageData(w, h), d = img.data, out = new Float64Array(3), E = cam.cam;
  const f = cam.f, r = cam.r, u = cam.u, fov = P.fov;
  for (let py = 0; py < h; py++) {
    const by = (py + 0.5) / q;
    for (let px = 0; px < w; px++) {
      const bx = (px + 0.5) / q, a = (bx - P.cx) / fov, b = (P.cy - by) / fov;
      const dx = f.x + r.x * a + u.x * b, dy = f.y + r.y * a + u.y * b, dz = f.z + r.z * a + u.z * b;
      const dl = Math.hypot(dx, dy, dz);
      let best = Infinity, hit = null, hx = 0, hy = 0, hz = 0;
      if (dy < -1e-9) for (const pl of planes) {
        const t = (pl.y - E.y) / dy;
        if (!(t > 0) || t >= best) continue;
        const x = E.x + t * dx, z = E.z + t * dz;
        if (pl.clip && !pl.clip(x, z)) continue;
        best = t; hit = pl; hx = x; hy = pl.y; hz = z;
      }
      for (const wl of walls) {
        const nd = wl.nx * dx + wl.nz * dz;
        if (nd > -1e-9) continue;
        const t = (wl.d - (wl.nx * E.x + wl.nz * E.z)) / nd;
        if (!(t > 0) || t >= best) continue;
        const y = E.y + t * dy;
        if (y < wl.y0 || y > wl.y1) continue;
        best = t; hit = wl; hx = E.x + t * dx; hy = y; hz = E.z + t * dz;
      }
      if (hit) {
        const fp = (best * dl / (fov * q));
        if (hit.nx !== undefined) hit.fn(hit.ux * hx + hit.uz * hz, hy, fp / Math.sqrt(Math.max(0.12, Math.abs(hit.nx * dx + hit.nz * dz) / dl)), out);
        else hit.fn(hx, hz, fp / Math.sqrt(Math.max(0.12, -dy / dl)), out);
        const K = hit.K || [1, 1, 1];
        out[0] *= K[0]; out[1] *= K[1]; out[2] *= K[2];
        if (haze) {
          const m = haze.max * clamp((best * dl - haze.d0) / (haze.d1 - haze.d0), 0, 1);
          let hc = haze.col;
          if (typeof hc === 'function') { const hd = Math.hypot(dx, dz) || 1; hc = HZ; haze.col(dx / hd, 0.02, dz / hd, HZ); }
          out[0] += (hc[0] - out[0]) * m; out[1] += (hc[1] - out[1]) * m; out[2] += (hc[2] - out[2]) * m;
        }
      } else if (back) back(dx / dl, dy / dl, dz / dl, out);
      else { d[(py * w + px) * 4 + 3] = 0; continue; }
      if (tone) tone(out, bx, by);
      const o = (py * w + px) * 4;
      d[o] = toByte(out[0]); d[o + 1] = toByte(out[1]); d[o + 2] = toByte(out[2]); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
export function texSurface(T, { tint = null, lumTarget = 0.3, k = 1, maxSat = 0.45, unit = 100, rot = 0, ox = 0, oz = 0, lo = 0.35, hi = 1.8 } = {}) {
  const Lm = Math.max(1e-6, lum(T.mean)), tpm = T.n / unit, S = new Float64Array(3), c = Math.cos(rot), s = Math.sin(rot);
  const sc = lumTarget / Lm, base = tint ? tint : null, f = satFactor(T.mean, maxSat);
  return (x, z, fp, out) => {
    const u = (x * c - z * s) + ox, v = (x * s + z * c) + oz;
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    if (base) { const t = clamp(1 + k * (lum(S) / Lm - 1), lo, hi); out[0] = base[0] * t; out[1] = base[1] * t; out[2] = base[2] * t; return; }
    const L0 = 0.2126 * S[0] + 0.7152 * S[1] + 0.0722 * S[2];
    let r = (L0 + (S[0] - L0) * f) * sc, g = (L0 + (S[1] - L0) * f) * sc, b = (L0 + (S[2] - L0) * f) * sc;
    if (k !== 1) { const L = L0 * sc, Lt = lumTarget; if (L > 0) { const t = clamp(1 + k * (L / Lt - 1), lo, hi) * Lt / L; r *= t; g *= t; b *= t; } }
    out[0] = r; out[1] = g; out[2] = b;
  };
}

export function patternGround(base, { kind = 'tiles', period = 60, amp = 0.07, joint = 0.55, jointHW = 0.6, salt = 0 } = {}) {
  return (x, z, fp, out) => {
    base(x, z, fp, out);
    const ix = Math.floor(x / period), iz = Math.floor(z / period);
    const fade = clamp(1.4 - fp / period * 6, 0, 1);
    let k = 1, j = 0;
    if (kind === 'tiles') { k = 1 + amp * fade * (S3.hash2(ix + salt, iz) * 2 - 1); j = Math.max(S3.lineMask(x, period, jointHW, fp), S3.lineMask(z, period, jointHW, fp)); }
    else if (kind === 'checker') k = 1 + amp * fade * (((ix + iz) & 1) ? 1 : -1);
    else if (kind === 'stripes') k = 1 + amp * fade * ((ix & 1) ? 1 : -1);
    else {
      const row = ix, off = (S3.hash2(row, salt) * 4) | 0;
      k = 1 + amp * fade * (S3.hash2(row + 7, Math.floor((z / period + off) / 4)) * 2 - 1);
      j = Math.max(S3.lineMask(x, period, jointHW, fp), S3.lineMask(z + off * period, 4 * period, jointHW, fp));
    }
    const w = 1 - joint * j;
    out[0] *= k * w; out[1] *= k * w; out[2] *= k * w;
  };
}

export function partTexMat(T, { tint = null, cv = 0.25, lumTarget = 0.3, maxSat = 0.5, unit = 40, cam, ks = 0.1, sh = 20, env = 0.03 } = {}) {
  const k = Math.min(1.2, cv / Math.max(1e-6, T.cv)), Lm = Math.max(1e-6, lum(T.mean)), tpm = T.n / unit, S = new Float64Array(3);
  const sc = lumTarget / Lm, base = tint ? tint.slice() : S3.limitSat(T.mean.map((v) => v * sc), maxSat), Lt = lum(base), pf = satFactor(T.mean, maxSat);
  const tex = (x, y, z, nx, ny, nz, s, out) => {
    const G = s.grain, c = s.gc;
    let u, v;
    if (G && c) {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const a = px * G[0][0] + py * G[0][1] + pz * G[0][2], b = px * G[1][0] + py * G[1][1] + pz * G[1][2], w = px * G[2][0] + py * G[2][1] + pz * G[2][2];
      const n1 = Math.abs(nx * G[1][0] + ny * G[1][1] + nz * G[1][2]), n2 = Math.abs(nx * G[2][0] + ny * G[2][1] + nz * G[2][2]);
      u = a + (s.seed || 0) * 7.1; v = n1 > n2 ? w : b;
    } else { u = x; v = Math.abs(ny) > 0.7 ? z : y; }
    const fp = cam ? Math.hypot(x - cam.eye[0], y - cam.eye[1], z - cam.eye[2]) / cam.f : 0.3;
    S3.sampleTex(T, u * tpm * 0.35, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    if (tint) { const t = clamp(1 + k * (lum(S) / Lm - 1), 0.55, 1.45); out[0] = tint[0] * t; out[1] = tint[1] * t; out[2] = tint[2] * t; return; }
    const L0 = 0.2126 * S[0] + 0.7152 * S[1] + 0.0722 * S[2], L = L0 * sc;
    const t = L > 0 ? clamp(1 + Math.min(1, k) * (L / Lt - 1), 0.5, 1.6) * Lt / L : 1;
    out[0] = (L0 + (S[0] - L0) * pf) * sc * t; out[1] = (L0 + (S[1] - L0) * pf) * sc * t; out[2] = (L0 + (S[2] - L0) * pf) * sc * t;
  };
  return { c: base, ks, sh, env, tex };
}

import { splitIds } from '../core/style.js';
export function splitPool(style, name, items, minTest = 1, id = (x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : JSON.stringify(x))) {
  const ids = items.map(id), f = splitIds(name, ids, minTest);
  const out = items.filter((_, i) => f(ids[i]) === style.split);
  return out.length ? out : items.slice();
}
