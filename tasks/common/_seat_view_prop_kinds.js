import { shape } from './_seat_view_rt.js';
import { cup, book, chair, stool, frame, mats, floorLamp, plant, carton, ball, sofa, tvStand, shelf } from './_seat_view_props.js';
import { splitIds } from '../core/style.js';
import { R, hashStr } from '../core/rng.js';

function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function decorrelate(rng) {
  const w = [0, 1, 2, 3].map(() => Math.floor(rng.raw() * 4294967296));
  const f = sfc32(hashStr(`g05a|${w.join('|')}`), hashStr(`g05b|${w[1]}|${w[2]}`), hashStr(`g05c|${w[3]}|${w[0]}`), w[2] ^ w[3]);
  for (let i = 0; i < 16; i++) f();
  return R(f);
}

const rad = (d) => (d * Math.PI) / 180;
const lin = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2)); };
const mixInto = (out, a, b, t) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; };
const set3 = (out, c) => { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; };
const boxLocal = (s, x, z) => { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; };

export function family(name, ids, def, minTest = ids.length >= 6 ? 2 : 1) {
  const sp = splitIds(`g05_${name}`, ids.filter((i) => i !== def), minTest);
  const of = (id) => (id === def ? 'train' : sp(id));
  return { name, ids, def, of, inSplit: (split) => ids.filter((i) => of(i) === split) };
}
export const pickIn = (rng, fam, split) => rng.pick(fam.inSplit(split));

export const TARGETS = family('target', ['mug', 'glass', 'can', 'jar', 'candle', 'pot', 'vase'], 'mug');
export const TARGET_NOUN = { mug: 'cup', glass: 'glass', can: 'can', jar: 'jar', candle: 'candle', pot: 'potted plant', vase: 'vase' };
export const TARGET_COLS = {
  mug: ['#e0b23e', '#3fa3c9', '#d65a8a', '#f08a3c', '#6fbf5a', '#f4f1ea', '#5b6bd1'],
  glass: ['#d9a23a', '#7fb8d8', '#c96a8a', '#e88a3c', '#86c46a', '#d8dcd4', '#7a84d0'],
  can: ['#d8b22a', '#2a8fc0', '#c94a7a', '#e8742a', '#4aa84a', '#e6e6e0', '#4a58c0'],
  jar: ['#c88a2a', '#6aa0b8', '#a8406a', '#d8742a', '#6a9a3a', '#e8dcc0', '#5a5aa0'],
  candle: ['#f2d36a', '#8ec8e0', '#e48aa8', '#f4a060', '#a8d890', '#f6f2e6', '#9aa4e8'],
  pot: ['#c0714f', '#5a8fb0', '#b85a7a', '#d88a4a', '#7aa060', '#e8e2d6', '#6a70b8'],
  vase: ['#e8c25a', '#5ab0d0', '#e07a9a', '#f09a5a', '#8ac86a', '#faf6ee', '#7a84dc'],
};
export function target(B, id, kind, o, skin = null) {
  const r = o.r, h = o.h, y0 = o.y0 ?? 0, x = o.x, z = o.z, c = lin(o.col);
  if (kind === 'mug') { cup(B, id, o); return; }
  if (kind === 'vase') {
    const m = B.matDef(`vase:${o.col}`, { c, ks: 0.5, sh: 70, env: 0.16 });
    B.add(shape.cyl(id, m, x, z, y0, y0 + 0.008, r * 0.6, 0.003));
    B.add(shape.cyl(id, m, x, z, y0 + 0.006, y0 + h * 0.58, r * 0.94, 0.012));
    B.add(shape.frustum(id, m, x, z, y0 + h * 0.58, y0 + h * 0.76, r * 0.94, r * 0.44));
    B.add(shape.cyl(id, m, x, z, y0 + h * 0.75, y0 + h * 0.93, r * 0.42, 0.004));
    B.add(shape.cyl(id, m, x, z, y0 + h * 0.91, y0 + h * 0.97, r * 0.52, 0.006));
    return;
  }
  if (kind === 'glass') {
    const drink = c.map((v) => v * 0.55);
    const m = B.matDef(`glass:${o.col}`, { c, ks: 0.6, sh: 90, env: 0.3, tex: (px, py, pz, nx, ny, nz, s, out) => {
      if (ny > 0.8) { set3(out, Math.hypot(px - s.cx, pz - s.cz) < s.r1 - 0.004 ? drink : c.map((v) => Math.min(1, v * 1.25 + 0.1))); return; }
      const fill = py < y0 + h * 0.78; set3(out, fill ? c : c.map((v) => Math.min(1, v * 0.6 + 0.35)));
    } });
    B.add(shape.frustum(id, m, x, z, y0, y0 + h * 0.96, r * 0.78, r * 0.97));
    return;
  }
  if (kind === 'can') {
    const silver = lin('#c4c7cb'), white = lin('#f2f1ec');
    const body = B.matDef(`can:${o.col}`, { c, ks: 0.42, sh: 55, env: 0.18, tex: (px, py, pz, nx, ny, nz, s, out) => {
      if (Math.abs(ny) > 0.8) { set3(out, silver); return; }
      const t = (py - y0) / h, a = Math.atan2(px - x, pz - z);
      if (t < 0.07 || t > 0.86) { set3(out, silver); return; }
      const wave = 0.5 + 0.12 * Math.sin(a * 2 + 1.3);
      set3(out, Math.abs(t - wave) < 0.06 ? white : c);
    } });
    B.add(shape.cyl(id, body, x, z, y0, y0 + h * 0.9, r * 0.86, 0.006));
    B.add(shape.cyl(id, B.mat('metal', '#b8bcc2'), x, z, y0 + h * 0.9, y0 + h * 0.96, r * 0.74, 0.004));
    return;
  }
  if (kind === 'jar') {
    const glassC = c.map((v) => v * 0.8), lid = lin(['#c9a640', '#e8e4dc', '#2f3438', '#a8402f'][Math.floor((c[0] * 7 + c[2] * 3) * 10) % 4]);
    const body = B.matDef(`jar:${o.col}`, { c: glassC, ks: 0.55, sh: 80, env: 0.25, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const t = (py - y0) / h;
      const label = t > 0.22 && t < 0.52 && Math.cos(Math.atan2(px - x, pz - z) - 0.7) > -0.2;
      set3(out, label ? lin('#f3ead6') : glassC);
    } });
    B.add(shape.cyl(id, body, x, z, y0, y0 + h * 0.74, r * 0.9, 0.008));
    B.add(shape.frustum(id, body, x, z, y0 + h * 0.74, y0 + h * 0.8, r * 0.9, r * 0.72));
    B.add(shape.cyl(id, B.matDef(`jarlid:${lid.join()}`, { c: lid, ks: 0.4, sh: 50, env: 0.14 }), x, z, y0 + h * 0.8, y0 + h * 0.97, r * 0.76, 0.006));
    return;
  }
  if (kind === 'candle') {
    const wax = B.matDef(`wax:${o.col}`, { c, ks: 0.08, sh: 12, tex: (px, py, pz, nx, ny, nz, s, out) => {
      if (ny > 0.8) { const d = Math.hypot(px - s.cx, pz - s.cz); set3(out, c.map((v) => v * (d < s.r * 0.75 ? 0.82 : 1))); return; }
      set3(out, c);
    } });
    B.add(shape.cyl(id, B.mat('metal', '#b9a27a'), x, z, y0, y0 + 0.01, r * 0.98, 0.004));
    B.add(shape.cyl(id, wax, x, z, y0 + 0.01, y0 + h * 0.88, r * 0.86, 0.008));
    B.add(shape.capsule(id, B.mat('matte', '#2a2420'), x, y0 + h * 0.88, z, x, y0 + h * 0.97, z, 0.0025));
    return;
  }
  const pot = B.matDef(`spot:${o.col}`, { c, ks: 0.2, sh: 30, env: 0.04 });
  B.add(shape.frustum(id, pot, x, z, y0, y0 + h * 0.64, r * 0.82, r * 0.99));
  B.add(shape.cyl(id, B.mat('matte', '#4a3a2c'), x, z, y0 + h * 0.61, y0 + h * 0.64, r * 0.92));
  const leaf = B.mat('plant', '#5f9a5a');
  for (let i = 0; i < 7; i++) {
    const a = rad(i * 360 / 7 + 15), lx = x + Math.sin(a) * r * 0.36, lz = z + Math.cos(a) * r * 0.36;
    const F = frame(lx, lz, i * 360 / 7 + 15);
    B.add(shape.ellipsoid(id, leaf, lx, y0 + h * 0.74, lz, r * 0.26, h * 0.14, r * 0.52, F.M));
  }
  B.add(shape.ellipsoid(id, leaf, x, y0 + h * 0.82, z, r * 0.5, h * 0.18, r * 0.5, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
}

export const BLOCKERS = family('blocker', ['book', 'cereal', 'board', 'binder', 'tin', 'frame', 'boxfile'], 'book');
export function blocker(B, id, kind, o, skin = null) {
  if (kind === 'book') { book(B, id, o); return; }
  const c = lin(o.col), y0 = o.y0 ?? 0, yaw = o.yaw ?? 0, W = o.w / 2, H = o.h / 2, D = o.d / 2;
  let m;
  if (kind === 'cereal') {
    const white = lin('#f4efe2'), bowl = lin('#e8e2d0'), flake = lin('#d9a441');
    m = B.matDef(`cereal:${o.col}`, { c, ks: 0.16, sh: 28, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx, lz] = boxLocal(s, px, pz), ly = py - s.cy, big = Math.abs(nx * s.sa + nz * s.ca) > 0.7;
      if (!big || ny > 0.7) { set3(out, c); return; }
      const v = ly / s.hy, u = lx / s.hx;
      if (v > 0.55) { set3(out, c.map((q) => q * 0.7)); return; }
      const d = Math.hypot(u * 1.2, (v + 0.35) * 1.6);
      if (d < 0.55) { set3(out, v > -0.35 + 0.05 * Math.sin(u * 20) ? flake : bowl); return; }
      set3(out, Math.abs(v - 0.3) < 0.12 ? white : c);
    } });
  } else if (kind === 'board') {
    const wood = lin('#b98a56'), hole = lin('#2a2420');
    const holeTex = (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), ly = py - s.cy, big = Math.abs(nx * s.sa + nz * s.ca) > 0.7;
      return big && Math.hypot(lx, ly - s.hy * 0.72) < 0.018;
    };
    m = B.matDef('board', { c: wood, ks: 0.1, sh: 20, hole: holeTex, tex: (px, py, pz, nx, ny, nz, s, out) => {
      set3(out, holeTex(px, py, pz, nx, ny, nz, s) ? hole : wood.map((v) => v * (0.9 + 0.1 * Math.sin(py * 260 + px * 30))));
    } });
  } else if (kind === 'binder') {
    const lab = lin('#f2efe6');
    m = B.matDef(`binder:${o.col}`, { c, ks: 0.3, sh: 40, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), ly = py - s.cy, side = Math.abs(nx * s.ca - nz * s.sa) > 0.7;
      if (side && Math.abs(ly) < s.hy * 0.45 && ly > -s.hy * 0.05 && Math.abs(lx) < s.hx) { set3(out, lab); return; }
      set3(out, c);
    } });
  } else if (kind === 'tin') {
    const gold = lin('#c9a640');
    m = B.matDef(`tin:${o.col}`, { c, ks: 0.45, sh: 55, env: 0.16, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const v = (py - (s.cy - s.hy)) / (2 * s.hy);
      if (ny > 0.7 || v > 0.9 || v < 0.06 || Math.abs(v - 0.62) < 0.025) { set3(out, gold); return; }
      set3(out, c);
    } });
  } else if (kind === 'frame') {
    const back = lin('#4a3a2c');
    m = B.matDef(`frame:${o.col}`, { c, ks: 0.22, sh: 36, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), ly = py - s.cy, big = Math.abs(nx * s.sa + nz * s.ca) > 0.7;
      const inner = Math.abs(lx) < s.hx - 0.028 && Math.abs(ly) < s.hy - 0.028;
      if (big && inner) { const facing = (nx * s.sa + nz * s.ca) > 0; set3(out, facing ? lin('#d8d2c4') : back); return; }
      set3(out, c);
    } });
  } else {
    const kraft = lin('#b8915e');
    m = B.matDef(`boxfile:${o.col}`, { c: kraft, ks: 0.06, sh: 12, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), ly = py - s.cy, side = Math.abs(nx * s.ca - nz * s.sa) > 0.7;
      if (side && Math.abs(ly - s.hy * 0.4) < s.hy * 0.22) { set3(out, c); return; }
      mixInto(out, kraft, kraft.map((v) => v * 0.86), 0.5 + 0.5 * Math.sin(lx * 300));
    } });
  }
  B.add(shape.box(id, m, o.x, y0 + H, o.z, W, H, D, yaw, kind === 'tin' ? 0.006 : 0.004));
}

export const SEATS = family('seat', ['chair', 'stool', 'bench', 'armless', 'folding'], 'chair');
export function seat(B, id, kind, o, skin = null) {
  if (kind === 'chair') return chair(B, id, o);
  const seatY = o.seatY ?? 0.46;
  if (kind === 'stool') return stool(B, id, { x: o.x, z: o.z, h: seatY, wood: o.wood });
  const F = frame(o.x, o.z, o.yaw), m = B.mat('wood', o.wood ?? '#a8784e');
  if (kind === 'folding') {
    const tube = B.mat('metal', o.metal ?? '#3d4249');
    for (const su of [-1, 1]) {
      const a = F.P(su * 0.19, 0.01, -0.19), b = F.P(su * 0.19, seatY - 0.03, 0.17), c = F.P(su * 0.19, 0.01, 0.19), d = F.P(su * 0.19, seatY - 0.03, -0.17);
      B.add(shape.capsule(id, tube, ...a, ...b, 0.013)); B.add(shape.capsule(id, tube, ...c, ...d, 0.013));
      const e = F.P(su * 0.19, seatY - 0.03, -0.17), f = F.P(su * 0.19, seatY + 0.42, -0.22); B.add(shape.capsule(id, tube, ...e, ...f, 0.013));
    }
    for (let k = 0; k < 4; k++) { const p = F.P(0, seatY - 0.012, -0.15 + k * 0.1); B.add(shape.box(id, m, p[0], p[1], p[2], 0.2, 0.012, 0.042, o.yaw, 0.004)); }
    const bk = F.P(0, seatY + 0.32, -0.205); B.add(shape.box(id, m, bk[0], bk[1], bk[2], 0.19, 0.08, 0.012, o.yaw, 0.006));
    return seatY;
  }
  if (kind === 'bench') {
    for (const su of [-1, 1]) { const p = F.P(su * 0.2, seatY / 2 - 0.02, 0); B.add(shape.box(id, m, p[0], p[1], p[2], 0.018, seatY / 2 - 0.02, 0.17, o.yaw, 0.004)); }
    for (let k = 0; k < 3; k++) { const p = F.P(0, seatY - 0.02, -0.14 + k * 0.14); B.add(shape.box(id, m, p[0], p[1], p[2], 0.22, 0.02, 0.06, o.yaw, 0.006)); }
    const st = F.P(0, 0.12, 0); B.add(shape.box(id, m, st[0], st[1], st[2], 0.19, 0.02, 0.02, o.yaw, 0.004));
    return seatY;
  }
  const up = B.mat('cloth', o.col ?? '#6d8fb3');
  const s0 = F.P(0, seatY / 2, 0); B.add(shape.box(id, m, s0[0], (seatY - 0.06) / 2, s0[2], 0.2, (seatY - 0.06) / 2, 0.2, o.yaw, 0.01));
  const s1 = F.P(0, seatY - 0.03, 0.005); B.add(shape.box(id, up, s1[0], s1[1], s1[2], 0.215, 0.035, 0.21, o.yaw, 0.03));
  const bk = F.P(0, seatY + 0.25, -0.19); B.add(shape.box(id, up, bk[0], bk[1], bk[2], 0.21, 0.24, 0.035, o.yaw, 0.03));
  return seatY;
}

export const SITS = family('sit', ['chair', 'stool', 'armless', 'pouf', 'bench'], 'chair');
export const LIGHTS = family('light', ['floorlamp', 'drumlamp', 'tripod', 'lantern', 'globe'], 'floorlamp');
export const PLANTS = family('plant', ['potplant', 'cactus', 'tree', 'flowers', 'snake'], 'potplant');
export const BALLS = family('ball', ['beach', 'soccer', 'basket', 'volley', 'tennis', 'stripe'], 'beach');
export const BOXES = family('box', ['carton', 'crate', 'suitcase', 'basket', 'chest'], 'carton');
export const FAMILY_OF = { chair: SITS, lamp: LIGHTS, plant: PLANTS, ball: BALLS, box: BOXES };

export function sitProp(B, id, kind, o) {
  if (kind === 'chair' || kind === 'stool' || kind === 'armless' || kind === 'bench') return seat(B, id, kind, { ...o, seatY: 0.46 });
  const up = B.mat('cloth', o.col ?? '#5b7fa6'), pipe = B.mat('cloth', o.trim ?? '#e8e2d6');
  B.add(shape.cyl(id, up, o.x, o.z, 0.02, 0.4, 0.24, 0.05));
  B.add(shape.cyl(id, B.mat('wood', o.wood ?? '#5a4030'), o.x, o.z, 0, 0.02, 0.2, 0.005));
  B.add(shape.capsule(id, pipe, o.x - 0.0001, 0.395, o.z, o.x + 0.0001, 0.395, o.z, 0.012));
  B.add(shape.sphere(id, pipe, o.x, 0.405, o.z, 0.018));
  return 0.4;
}
export function lightProp(B, id, kind, o) {
  if (kind === 'floorlamp') return floorLamp(B, id, o);
  const metal = B.mat('metal', o.metal ?? '#3d4249'), shadeHex = o.col ?? '#efe2c4', h = o.h ?? 1.4, x = o.x, z = o.z;
  const glow = B.matDef(`glow:${shadeHex}`, { c: lin(shadeHex).map((v) => v * 1.25), ks: 0.02, sh: 4 });
  if (kind === 'drumlamp') {
    B.add(shape.cyl(id, metal, x, z, 0, 0.03, 0.16, 0.01));
    B.add(shape.cyl(id, metal, x, z, 0.03, h - 0.22, 0.013));
    B.add(shape.cyl(id, glow, x, z, h - 0.3, h, 0.19, 0.004));
    return;
  }
  if (kind === 'tripod') {
    const hub = h * 0.55;
    for (let i = 0; i < 3; i++) { const a = rad(30 + 120 * i); B.add(shape.capsule(id, metal, x + Math.sin(a) * 0.22, 0.012, z + Math.cos(a) * 0.22, x, hub, z, 0.014)); }
    B.add(shape.capsule(id, metal, x, hub, z, x, h - 0.24, z, 0.012));
    B.add(shape.frustum(id, glow, x, z, h - 0.3, h - 0.02, 0.21, 0.13));
    return;
  }
  if (kind === 'globe') {
    B.add(shape.cyl(id, metal, x, z, 0, 0.025, 0.15, 0.01));
    B.add(shape.cyl(id, metal, x, z, 0.025, h - 0.3, 0.013));
    B.add(shape.sphere(id, glow, x, h - 0.17, z, 0.17));
    return;
  }
  const frameM = B.mat('metal', o.metal ?? '#2f3236'), L = Math.min(0.9, h * 0.6);
  B.add(shape.box(id, frameM, x, 0.03, z, 0.15, 0.03, 0.15, o.yaw ?? 0, 0.008));
  B.add(shape.box(id, glow, x, 0.06 + (L - 0.16) / 2, z, 0.12, (L - 0.16) / 2, 0.12, o.yaw ?? 0));
  const F = frame(x, z, o.yaw ?? 0);
  for (const [u, w] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = F.P(u * 0.125, 0, w * 0.125); B.add(shape.cyl(id, frameM, p[0], p[2], 0.06, L - 0.1, 0.012)); }
  B.add(shape.frustum(id, frameM, x, z, L - 0.1, L, 0.18, 0.05));
  B.add(shape.capsule(id, frameM, x, L, z, x, L + 0.06, z, 0.015));
}
export function plantProp(B, id, kind, o) {
  if (kind === 'potplant') return plant(B, id, o);
  const s = o.scale ?? 1, x = o.x, z = o.z;
  const pot = B.mat('matte', o.pot ?? '#c0714f'), soil = B.mat('matte', '#4a3a2c'), leaf = B.mat('plant', o.leaf ?? '#4e8f45');
  if (kind === 'cactus') {
    B.add(shape.frustum(id, pot, x, z, 0, 0.26 * s, 0.13 * s, 0.16 * s)); B.add(shape.cyl(id, soil, x, z, 0.23 * s, 0.25 * s, 0.14 * s));
    B.add(shape.capsule(id, leaf, x, 0.3 * s, z, x, 0.82 * s, z, 0.075 * s));
    B.add(shape.capsule(id, leaf, x + 0.07 * s, 0.5 * s, z, x + 0.15 * s, 0.52 * s, z, 0.04 * s));
    B.add(shape.capsule(id, leaf, x + 0.15 * s, 0.52 * s, z, x + 0.15 * s, 0.68 * s, z, 0.04 * s));
    B.add(shape.capsule(id, leaf, x - 0.07 * s, 0.6 * s, z + 0.02 * s, x - 0.14 * s, 0.6 * s, z + 0.03 * s, 0.035 * s));
    B.add(shape.capsule(id, leaf, x - 0.14 * s, 0.6 * s, z + 0.03 * s, x - 0.14 * s, 0.74 * s, z + 0.03 * s, 0.035 * s));
    return;
  }
  if (kind === 'tree') {
    B.add(shape.cyl(id, pot, x, z, 0, 0.3 * s, 0.17 * s, 0.01)); B.add(shape.cyl(id, soil, x, z, 0.28 * s, 0.3 * s, 0.155 * s));
    B.add(shape.capsule(id, B.mat('wood', '#6b4a32'), x, 0.28 * s, z, x + 0.02 * s, 0.85 * s, z, 0.025 * s));
    for (const [dx, dy, dz, r] of [[0, 1.0, 0, 0.2], [0.12, 0.88, 0.05, 0.15], [-0.11, 0.9, -0.06, 0.15], [0.02, 0.84, -0.13, 0.13], [-0.03, 1.16, 0.03, 0.13]])
      B.add(shape.sphere(id, leaf, x + dx * s, dy * s, z + dz * s, r * s));
    return;
  }
  if (kind === 'flowers') {
    B.add(shape.frustum(id, pot, x, z, 0, 0.3 * s, 0.12 * s, 0.17 * s)); B.add(shape.cyl(id, soil, x, z, 0.27 * s, 0.29 * s, 0.155 * s));
    const bloom = B.mat('matte', o.bloom ?? '#f2d36a'), mid = B.mat('matte', '#d8a030');
    for (let i = 0; i < 7; i++) {
      const a = rad(i * 360 / 7 + 10), rr = (i % 2 ? 0.1 : 0.05) * s, hh = (0.58 + 0.08 * (i % 3)) * s;
      const fx = x + Math.sin(a) * rr, fz = z + Math.cos(a) * rr;
      B.add(shape.capsule(id, leaf, x, 0.28 * s, z, fx, hh - 0.03 * s, fz, 0.008 * s));
      B.add(shape.sphere(id, bloom, fx, hh, fz, 0.045 * s)); B.add(shape.sphere(id, mid, fx, hh + 0.03 * s, fz, 0.018 * s));
    }
    for (let i = 0; i < 5; i++) { const a = rad(i * 72 + 40), F = frame(x + Math.sin(a) * 0.08 * s, z + Math.cos(a) * 0.08 * s, i * 72 + 40); const p = F.P(0, 0.36 * s, 0); B.add(shape.ellipsoid(id, leaf, p[0], p[1], p[2], 0.05 * s, 0.1 * s, 0.03 * s, F.M)); }
    return;
  }
  B.add(shape.cyl(id, pot, x, z, 0, 0.28 * s, 0.15 * s, 0.01)); B.add(shape.cyl(id, soil, x, z, 0.26 * s, 0.28 * s, 0.135 * s));
  for (let i = 0; i < 7; i++) {
    const a = rad(i * 360 / 7 + 5), rr = (i % 2 ? 0.07 : 0.035) * s, F = frame(x + Math.sin(a) * rr, z + Math.cos(a) * rr, i * 51 + 20);
    const hh = (0.36 + 0.08 * (i % 3)) * s, p = F.P(0, 0.28 * s + hh, 0);
    B.add(shape.ellipsoid(id, leaf, p[0], p[1], p[2], 0.04 * s, hh, 0.012 * s, F.M));
  }
}
const ICO = (() => { const t = (1 + Math.sqrt(5)) / 2, v = []; for (const [a, b] of [[1, t], [-1, t], [1, -t], [-1, -t]]) { v.push([0, a, b], [a, b, 0], [b, 0, a]); } return v.map((q) => { const l = Math.hypot(...q); return q.map((c) => c / l); }); })();
export function ballProp(B, id, kind, o) {
  if (kind === 'beach') return ball(B, id, o);
  const r = o.r ?? 0.16, c1 = lin(kind === 'basket' ? '#d9742a' : kind === 'tennis' ? '#d4e04a' : o.col ?? '#e04b3c'), c2 = lin(o.col2 ?? '#f3efe6'), dark = lin('#1f1f22'), a0 = rad(o.yaw ?? 0), ca = Math.cos(a0), sa = Math.sin(a0);
  let tex;
  if (kind === 'soccer') tex = (x, y, z, nx, ny, nz, s, out) => {
    const lx = nx * ca - nz * sa, lz = nx * sa + nz * ca; let best = 0;
    for (const v of ICO) best = Math.max(best, Math.abs(v[0] * lx + v[1] * ny + v[2] * lz));
    set3(out, best > 0.93 ? (o.col ? c1 : dark) : c2);
  };
  else if (kind === 'basket') tex = (x, y, z, nx, ny, nz, s, out) => {
    const lx = nx * ca - nz * sa, lz = nx * sa + nz * ca;
    const seam = Math.abs(lx) < 0.035 || Math.abs(ny) < 0.035 || Math.abs(Math.abs(lz) - 0.62 - 0.25 * ny * ny) < 0.03;
    set3(out, seam ? dark : c1);
  };
  else if (kind === 'tennis') tex = (x, y, z, nx, ny, nz, s, out) => {
    const lx = nx * ca - nz * sa, lz = nx * sa + nz * ca;
    set3(out, Math.abs(ny - 0.75 * Math.sin(2 * Math.atan2(lx, lz))) < 0.07 ? c2 : c1);
  };
  else if (kind === 'stripe') tex = (x, y, z, nx, ny, nz, s, out) => {
    set3(out, Math.abs(ny) < 0.2 ? c2 : Math.abs(Math.abs(ny) - 0.55) < 0.05 ? c2.map((v) => v * 0.85) : c1);
  };
  else tex = (x, y, z, nx, ny, nz, s, out) => {
    const lx = nx * ca - nz * sa, lz = nx * sa + nz * ca, ax = Math.abs(lx), ay = Math.abs(ny), az = Math.abs(lz);
    const k = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2, u = [ny, lz, lx][k];
    const band = Math.abs(u) < 0.2 ? 0 : 1, edge = Math.abs(Math.abs(u) - 0.2) < 0.025;
    set3(out, edge ? c2.map((v) => v * 0.7) : (k + band) % 3 === 0 ? c1 : (k + band) % 3 === 1 ? c2 : lin(o.col3 ?? '#e8c33a'));
  };
  const m = B.matDef(`ball-${kind}:${o.col}:${o.col2}:${o.yaw}`, { c: c1, ks: kind === 'basket' ? 0.15 : 0.35, sh: kind === 'basket' ? 18 : 45, env: kind === 'basket' ? 0.02 : 0.1, tex });
  B.add(shape.sphere(id, m, o.x, r, o.z, r));
}
export function boxProp(B, id, kind, o) {
  if (kind === 'carton') return carton(B, id, o);
  const hx = o.hx ?? 0.24, hy = o.hy ?? 0.19, hz = o.hz ?? 0.19, yaw = o.yaw ?? 0, x = o.x, z = o.z;
  if (kind === 'crate') {
    const w = lin(o.col ?? '#b8925e'), gap = w.map((v) => v * 0.35);
    const m = B.matDef(`crate:${o.col}`, { c: w, ks: 0.08, sh: 16, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx, lz] = boxLocal(s, px, pz), ly = py - s.cy;
      if (Math.abs(ny) > 0.7) { set3(out, Math.abs(((lx / 0.09) % 1 + 1) % 1 - 0.5) > 0.44 ? gap : w); return; }
      const edge = Math.max(Math.abs(lx) / s.hx, Math.abs(lz) / s.hz) > 0.86 || Math.abs(ly) > s.hy * 0.8;
      set3(out, !edge && Math.abs(((ly / 0.075) % 1 + 1) % 1 - 0.5) > 0.42 ? gap : w.map((v) => v * (edge ? 0.86 : 1)));
    } });
    B.add(shape.box(id, m, x, hy, z, hx, hy, hz, yaw, 0.008));
    return;
  }
  if (kind === 'suitcase') {
    const c = lin(o.col ?? '#3a4a5c'), zip = c.map((v) => v * 0.45);
    const m = B.matDef(`case:${o.col}`, { c, ks: 0.35, sh: 40, env: 0.06, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const ly = py - s.cy; if (Math.abs(ly) < 0.008) { set3(out, zip); return; }
      const [lx] = boxLocal(s, px, pz); set3(out, Math.abs(ny) > 0.7 && Math.abs(((lx / 0.07) % 1 + 1) % 1 - 0.5) > 0.45 ? c.map((v) => v * 0.8) : c);
    } });
    const h2 = hy * 0.8;
    B.add(shape.box(id, m, x, h2, z, hx, h2, hz * 0.95, yaw, 0.04));
    const F = frame(x, z, yaw), p0 = F.P(-0.06, 2 * h2 + 0.025, 0), p1 = F.P(0.06, 2 * h2 + 0.025, 0);
    const hm = B.mat('matte', '#2a2a2e');
    B.add(shape.capsule(id, hm, ...p0, ...p1, 0.012));
    const q0 = F.P(-0.06, 2 * h2, 0), q1 = F.P(0.06, 2 * h2, 0);
    B.add(shape.capsule(id, hm, ...q0, ...p0, 0.008)); B.add(shape.capsule(id, hm, ...q1, ...p1, 0.008));
    return;
  }
  if (kind === 'basket') {
    const c = lin(o.col ?? '#c9a46a'), d = c.map((v) => v * 0.7);
    const m = B.matDef(`basket:${o.col}`, { c, ks: 0.05, sh: 10, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const a = Math.atan2(px - s.cx, pz - s.cz) * 0.2, row = Math.floor(py / 0.025);
      set3(out, ((Math.floor(a / 0.012) + row) & 1) ? c : d);
    } });
    const R0 = Math.min(hx, hz) * 0.82, R1 = Math.min(hx, hz) * 1.05;
    B.add(shape.frustum(id, m, x, z, 0, 2 * hy * 0.95, R0, R1));
    B.add(shape.cyl(id, B.mat('matte', '#3a2e24'), x, z, 2 * hy * 0.95 - 0.004, 2 * hy * 0.95, R1 - 0.015));
    const F = frame(x, z, yaw);
    for (const su of [-1, 1]) { const a = F.P(su * R1, 2 * hy * 0.95, -0.05), b = F.P(su * (R1 + 0.02), 2 * hy * 0.95 + 0.04, 0), c2 = F.P(su * R1, 2 * hy * 0.95, 0.05); B.add(shape.capsule(id, m, ...a, ...b, 0.01)); B.add(shape.capsule(id, m, ...b, ...c2, 0.01)); }
    return;
  }
  const c = lin(o.col ?? '#7a5236'), band = lin('#3a3a3e');
  const m = B.matDef(`chest:${o.col}`, { c, ks: 0.14, sh: 26, tex: (px, py, pz, nx, ny, nz, s, out) => {
    const [lx, lz] = boxLocal(s, px, pz); const b = Math.max(Math.abs(lx) / s.hx, Math.abs(lz) / s.hz) > 0.9;
    set3(out, b ? band : c.map((v) => v * (0.92 + 0.08 * Math.sin(py * 120))));
  } });
  B.add(shape.box(id, m, x, hy * 0.75, z, hx * 0.96, hy * 0.75, hz * 0.96, yaw, 0.01));
  B.add(shape.box(id, m, x, hy * 1.5 + hy * 0.24, z, hx, hy * 0.24, hz, yaw, 0.03));
}

export const POSTS = family('post', ['post', 'pillar', 'stack', 'bollard', 'cone'], 'post');
export const POST_NOUN = { post: 'posts', pillar: 'pillars', stack: 'stacks of crates', bollard: 'bollards', cone: 'cones' };
export function postProp(B, id, kind, o) {
  const { x, z, h, R } = o, mat = B.mat('paint', o.col), stone = B.mat('matte', o.stone ?? '#e8e3d8');
  if (kind === 'post') {
    B.add(shape.cyl(id, stone, x, z, 0, 0.06, R, 0.01));
    B.add(shape.cyl(id, mat, x, z, 0.06, h - 0.03, R * 0.82, 0.01));
    B.add(shape.cyl(id, stone, x, z, h - 0.03, h, R * 0.95, 0.012));
    return;
  }
  if (kind === 'pillar') {
    B.add(shape.box(id, stone, x, 0.04, z, R * 0.98, 0.04, R * 0.98, 0, 0.006));
    B.add(shape.box(id, mat, x, 0.08 + (h - 0.14) / 2, z, R * 0.74, (h - 0.14) / 2, R * 0.74, 0, 0.004));
    B.add(shape.box(id, stone, x, h - 0.03, z, R * 0.9, 0.03, R * 0.9, 0, 0.006));
    return;
  }
  if (kind === 'stack') {
    const n = Math.max(1, Math.round(h / (1.8 * R))), ch = h / n, c = lin(o.col), dark = c.map((v) => v * 0.55);
    const m = B.matDef(`stack:${o.col}`, { c, ks: 0.12, sh: 20, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const lx = px - s.cx, lz = pz - s.cz, ly = py - s.cy, e = Math.max(Math.abs(lx) / s.hx, Math.abs(lz) / s.hz, Math.abs(ly) / s.hy);
      const slat = Math.abs(ny) < 0.7 && Math.abs(((ly / (s.hy * 0.5)) % 1 + 1) % 1 - 0.5) > 0.44;
      set3(out, e > 0.9 || slat ? dark : c);
    } });
    for (let i = 0; i < n; i++) B.add(shape.box(id, m, x, ch * (i + 0.5), z, R * 0.86, ch / 2 - 0.004, R * 0.86, (i % 2) * 6 - 3, 0.008));
    return;
  }
  if (kind === 'bollard') {
    const band = B.mat('paint', '#f2f0ea');
    B.add(shape.cyl(id, mat, x, z, 0, h - R * 0.7, R * 0.78, 0.01));
    B.add(shape.sphere(id, mat, x, h - R * 0.78, z, R * 0.78));
    for (const f of [0.62, 0.78]) { const y = (h - R * 0.7) * f; B.add(shape.cyl(id, band, x, z, y, y + Math.min(0.06, h * 0.06), R * 0.8)); }
    return;
  }
  B.add(shape.box(id, B.mat('matte', '#2e3034'), x, 0.025, z, R * 0.98, 0.025, R * 0.98, 0, 0.006));
  B.add(shape.frustum(id, mat, x, z, 0.05, h, R * 0.85, R * 0.18));
  const band = B.mat('paint', '#f2f0ea'), y0 = 0.05 + (h - 0.05) * 0.45, y1 = y0 + Math.min(0.08, h * 0.1), k = (R * 0.18 - R * 0.85) / (h - 0.05);
  B.add(shape.frustum(id, band, x, z, y0, y1, R * 0.85 + k * (y0 - 0.05) + 0.003, R * 0.85 + k * (y1 - 0.05) + 0.003));
}

export const SOFAS = family('sofa', ['sofa', 'modular', 'settee', 'chesterfield', 'futon'], 'sofa');
export const MEDIA = family('media', ['tv', 'sideboard', 'desk', 'console', 'bureau'], 'tv');
export const SHELVES = family('shelf', ['shelf', 'wardrobe', 'ladder', 'cubby', 'display'], 'shelf');
export function sofaProp(B, id, kind, o) {
  if (kind === 'sofa') return sofa(B, id, o);
  const F = frame(o.x, o.z, o.yaw), up = B.mat('cloth', o.col ?? '#a9674a'), yaw = o.yaw, hw = o.hw ?? 0.82;
  const at = (u, y, w) => F.P(u, y, w);
  if (kind === 'modular') {
    const legs = B.mat('metal', '#2e3034');
    for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = at(su * (hw - 0.06), 0, sw * 0.34); B.add(shape.cyl(id, legs, c[0], c[2], 0, 0.08, 0.018)); }
    let p = at(0, 0.15, 0); B.add(shape.box(id, up, p[0], p[1], p[2], hw, 0.07, 0.42, yaw, 0.02));
    for (const su of [-1, 1]) { p = at(su * (hw - 0.08), 0.36, 0); B.add(shape.box(id, up, p[0], p[1], p[2], 0.08, 0.14, 0.42, yaw, 0.02)); }
    for (const su of [-1, 1]) {
      p = at(su * (hw - 0.16) / 2, 0.29, 0.06); B.add(shape.box(id, up, p[0], p[1], p[2], (hw - 0.17) / 2, 0.07, 0.33, yaw, 0.05));
      p = at(su * (hw - 0.16) / 2, 0.52, -0.31); B.add(shape.box(id, up, p[0], p[1], p[2], (hw - 0.17) / 2, 0.18, 0.09, yaw, 0.06));
    }
    return;
  }
  if (kind === 'chesterfield') {
    const feet = B.mat('wood', o.wood ?? '#3a2a20');
    for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = at(su * (hw - 0.08), 0, sw * 0.32); B.add(shape.sphere(id, feet, c[0], 0.04, c[2], 0.04)); }
    let p = at(0, 0.27, 0); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.02, 0.17, 0.4, yaw, 0.04));
    p = at(0, 0.6, -0.32); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.02, 0.2, 0.08, yaw, 0.05));
    for (const su of [-1, 1]) { const a = at(su * (hw - 0.09), 0.52, -0.4), b = at(su * (hw - 0.09), 0.52, 0.4); B.add(shape.capsule(id, up, ...a, ...b, 0.09)); p = at(su * (hw - 0.09), 0.3, 0); B.add(shape.box(id, up, p[0], p[1], p[2], 0.09, 0.2, 0.4, yaw, 0.03)); }
    const btn = B.mat('cloth', o.trim ?? '#2a2420');
    for (let i = -2; i <= 2; i++) for (const yy of [0.56, 0.68]) { const q = at(i * 0.25 + (yy > 0.6 ? 0.12 : 0), yy, -0.235); B.add(shape.sphere(id, btn, q[0], q[1], q[2], 0.012)); }
    return;
  }
  if (kind === 'futon') {
    const wood = B.mat('wood', o.wood ?? '#a8784e');
    let p = at(0, 0.09, 0); B.add(shape.box(id, wood, p[0], p[1], p[2], hw, 0.09, 0.42, yaw, 0.01));
    p = at(0, 0.25, 0.04); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.04, 0.07, 0.36, yaw, 0.06));
    p = at(0, 0.52, -0.33); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.04, 0.22, 0.07, yaw, 0.06));
    return;
  }
  const wood = B.mat('wood', o.wood ?? '#6b4a32');
  for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = at(su * (hw - 0.05), 0, sw * 0.34); B.add(shape.cyl(id, wood, c[0], c[2], 0, sw < 0 ? 0.62 : 0.56, 0.025)); }
  let p = at(0, 0.36, 0.02); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.04, 0.07, 0.36, yaw, 0.04));
  p = at(0, 0.6, -0.33); B.add(shape.box(id, up, p[0], p[1], p[2], hw - 0.06, 0.2, 0.05, yaw, 0.04));
  for (const su of [-1, 1]) { const a = at(su * (hw - 0.05), 0.56, 0.34), b = at(su * (hw - 0.05), 0.6, -0.34); B.add(shape.capsule(id, wood, ...a, ...b, 0.025)); }
  p = at(0, 0.27, 0.34); B.add(shape.box(id, wood, p[0], p[1], p[2], hw - 0.05, 0.025, 0.02, yaw, 0.008));
}
export function mediaProp(B, id, kind, o) {
  if (kind === 'tv') return tvStand(B, id, o);
  const F = frame(o.x, o.z, o.yaw), yaw = o.yaw, wood = B.mat('wood', o.wood ?? '#6f5340'), dark = B.mat('gloss', '#22262b');
  let p;
  if (kind === 'sideboard') {
    const c = lin(o.col ?? '#8a6a4a');
    const doors = B.matDef(`sideboard:${o.col}`, { c, ks: 0.14, sh: 26, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), front = Math.abs(nx * s.sa + nz * s.ca) > 0.7 && Math.abs(ny) < 0.5;
      const seam = front && (Math.abs(((lx + s.hx) / (2 * s.hx / 3) + 0.5) % 1 - 0.5) < 0.012 || Math.abs(py - (s.cy + s.hy) + 0.03) < 0.006);
      const knob = front && Math.abs(py - s.cy - s.hy * 0.25) < 0.012 && Math.abs(((lx + s.hx) / (2 * s.hx / 3)) % 1 - 0.85) < 0.03;
      set3(out, knob ? lin('#c9a640') : seam ? c.map((v) => v * 0.45) : c);
    } });
    p = F.P(0, 0.05, 0); B.add(shape.box(id, wood, p[0], p[1], p[2], 0.66, 0.05, 0.2, yaw, 0.01));
    p = F.P(0, 0.33, 0); B.add(shape.box(id, doors, p[0], p[1], p[2], 0.7, 0.23, 0.22, yaw, 0.012));
    const vase = B.mat('gloss', o.vase ?? '#2f6f6f'); p = F.P(-0.4, 0.56, 0);
    B.add(shape.cyl(id, vase, p[0], p[2], 0.56, 0.78, 0.06, 0.02)); B.add(shape.cyl(id, vase, p[0], p[2], 0.78, 0.84, 0.035));
    for (let k = 0; k < 3; k++) { p = F.P(0.3 + 0.01 * k, 0.575 + k * 0.035, 0.02 * (k - 1)); B.add(shape.box(id, B.mat('paint', ['#2f5d8c', '#c49a3a', '#3f7a52'][k]), p[0], p[1], p[2], 0.13 - 0.015 * k, 0.017, 0.1, yaw + 6 * (k - 1), 0.003)); }
    return;
  }
  if (kind === 'console') {
    const c = lin(o.col ?? '#8a6a4a');
    const doors = B.matDef(`console:${o.col}`, { c, ks: 0.12, sh: 22, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), front = Math.abs(nx * s.sa + nz * s.ca) > 0.7 && Math.abs(ny) < 0.5;
      set3(out, front && Math.abs(((lx / 0.04) % 1 + 1) % 1 - 0.5) > 0.42 ? c.map((v) => v * 0.6) : c);
    } });
    p = F.P(0, 0.2, 0); B.add(shape.box(id, doors, p[0], p[1], p[2], 0.7, 0.2, 0.22, yaw, 0.01));
    for (const su of [-1, 1]) { p = F.P(su * 0.58, 0.55, 0); B.add(shape.box(id, dark, p[0], p[1], p[2], 0.09, 0.15, 0.1, yaw, 0.01)); }
    p = F.P(0, 0.68, -0.05); B.add(shape.box(id, dark, p[0], p[1], p[2], 0.4, 0.24, 0.02, yaw, 0.006));
    p = F.P(0, 0.68, -0.028); B.add(shape.box(id, B.mat('gloss', '#3a4c62'), p[0], p[1], p[2], 0.38, 0.22, 0.002, yaw));
    p = F.P(0, 0.42, -0.05); B.add(shape.box(id, dark, p[0], p[1], p[2], 0.1, 0.02, 0.06, yaw));
    return;
  }
  if (kind === 'bureau') {
    const c = lin(o.col ?? '#8a6a4a');
    const drawers = B.matDef(`bureau:${o.col}`, { c, ks: 0.14, sh: 26, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), front = Math.abs(nx * s.sa + nz * s.ca) > 0.7 && Math.abs(ny) < 0.5;
      const seam = front && Math.abs(((py - 0.04) / 0.17) % 1) < 0.04, knob = front && Math.abs(((py - 0.04) / 0.17) % 1 - 0.5) < 0.08 && Math.abs(Math.abs(lx) - 0.3) < 0.03;
      set3(out, knob ? lin('#c9a640') : seam ? c.map((v) => v * 0.45) : c);
    } });
    p = F.P(0, 0.36, 0); B.add(shape.box(id, drawers, p[0], p[1], p[2], 0.62, 0.34, 0.22, yaw, 0.01));
    p = F.P(0, 0.92, -0.18); B.add(shape.box(id, wood, p[0], p[1], p[2], 0.34, 0.2, 0.02, yaw, 0.006));
    p = F.P(0, 0.92, -0.159); B.add(shape.box(id, B.mat('gloss', '#c4ccd4'), p[0], p[1], p[2], 0.3, 0.17, 0.002, yaw));
    return;
  }
  p = F.P(0, 0.72, 0); B.add(shape.box(id, wood, p[0], p[1], p[2], 0.7, 0.02, 0.22, yaw, 0.006));
  for (const su of [-1, 1]) { p = F.P(su * 0.66, 0.35, 0); B.add(shape.box(id, wood, p[0], p[1], p[2], 0.02, 0.35, 0.2, yaw, 0.004)); }
  p = F.P(0.1, 0.96, -0.08); B.add(shape.box(id, dark, p[0], p[1], p[2], 0.28, 0.17, 0.015, yaw, 0.006));
  p = F.P(0.1, 0.96, -0.064); B.add(shape.box(id, B.mat('gloss', '#3a4c62'), p[0], p[1], p[2], 0.26, 0.15, 0.002, yaw));
  p = F.P(0.1, 0.77, -0.1); B.add(shape.box(id, dark, p[0], p[1], p[2], 0.03, 0.04, 0.03, yaw));
  const lamp = B.mat('metal', '#2e3034'); const a = F.P(-0.5, 0.74, -0.08), b = F.P(-0.5, 0.98, -0.02);
  B.add(shape.capsule(id, lamp, ...a, ...b, 0.01)); B.add(shape.frustum(id, B.mat('matte', '#efe2c4'), b[0], b[2], 0.92, 1.02, 0.08, 0.05));
}
export function shelfProp(B, id, kind, o) {
  if (kind === 'shelf') return shelf(B, id, o);
  const F = frame(o.x, o.z, o.yaw), yaw = o.yaw, H = 1.6, hw = 0.4, hd = 0.17, m = B.mat('wood', o.col ?? '#3f8f97');
  let p;
  if (kind === 'wardrobe') {
    const c = lin(o.col ?? '#3f8f97');
    const doors = B.matDef(`wardrobe:${o.col}`, { c, ks: 0.16, sh: 26, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), front = Math.abs(nx * s.sa + nz * s.ca) > 0.7 && Math.abs(ny) < 0.5;
      const seam = front && (Math.abs(lx) < 0.006 || Math.abs(py - 0.1) < 0.006);
      const knob = front && Math.abs(Math.abs(lx) - 0.04) < 0.012 && Math.abs(py - 0.9) < 0.05;
      set3(out, knob ? lin('#c9c4b8') : seam ? c.map((v) => v * 0.4) : c);
    } });
    p = F.P(0, H / 2, 0); B.add(shape.box(id, doors, p[0], p[1], p[2], hw, H / 2, hd, yaw, 0.01));
    p = F.P(0, H + 0.015, 0); B.add(shape.box(id, m, p[0], p[1] - 0.015, p[2], hw + 0.01, 0.015, hd + 0.01, yaw, 0.004));
    return;
  }
  const items = ['#c8553d', '#3f7cc0', '#e0b23e', '#4f9a62', '#8a5ab0', '#e8e2d6'];
  if (kind === 'ladder') {
    for (const su of [-1, 1]) { const a = F.P(su * (hw - 0.02), 0, hd - 0.01), b = F.P(su * (hw - 0.02), H, -hd + 0.03); B.add(shape.capsule(id, m, ...a, ...b, 0.02)); }
    for (let k = 0; k < 4; k++) {
      const y = 0.12 + k * 0.42, t = y / H, w0 = hd - 0.01 - t * (2 * hd - 0.04), d = 0.05 + (1 - t) * 0.1;
      p = F.P(0, y, w0 - d); B.add(shape.box(id, m, p[0], p[1], p[2], hw - 0.04, 0.012, d, yaw, 0.004));
      p = F.P(-0.12 + 0.1 * (k % 2), y + 0.08, w0 - d); B.add(shape.box(id, B.mat('paint', items[k]), p[0], p[1], p[2], 0.06, 0.07, Math.min(0.05, d * 0.7), yaw + 8 * k, 0.004));
    }
    return;
  }
  if (kind === 'display') {
    const c = lin(o.col ?? '#3f8f97'), glass = lin('#a9bfc8');
    const front = B.matDef(`display:${o.col}`, { c, ks: 0.3, sh: 50, env: 0.12, tex: (px, py, pz, nx, ny, nz, s, out) => {
      const [lx] = boxLocal(s, px, pz), f = Math.abs(nx * s.sa + nz * s.ca) > 0.7 && Math.abs(ny) < 0.5;
      const inGlass = f && Math.abs(lx) < s.hx - 0.04 && py > 0.5 && py < H - 0.06 && Math.abs(lx) > 0.012;
      if (!inGlass) { set3(out, c); return; }
      const shelfLine = Math.abs(((py - 0.5) / 0.34) % 1) < 0.04;
      set3(out, shelfLine ? c.map((v) => v * 0.7) : glass.map((v) => v * (0.75 + 0.2 * Math.sin(py * 40 + lx * 30))));
    } });
    p = F.P(0, H / 2, 0); B.add(shape.box(id, front, p[0], p[1], p[2], hw, H / 2, hd, yaw, 0.01));
    p = F.P(0, H + 0.02, 0); B.add(shape.box(id, m, p[0], p[1] - 0.005, p[2], hw + 0.015, 0.015, hd + 0.015, yaw, 0.004));
    return;
  }
  const cw = (2 * hw) / 3, ch = H / 4;
  for (let i = 0; i <= 3; i++) { p = F.P(-hw + i * cw, H / 2, 0); B.add(shape.box(id, m, p[0], p[1], p[2], 0.012, H / 2, hd, yaw)); }
  for (let j = 0; j <= 4; j++) { p = F.P(0, Math.min(H - 0.012, Math.max(0.012, j * ch)), 0); B.add(shape.box(id, m, p[0], p[1], p[2], hw, 0.012, hd, yaw)); }
  p = F.P(0, H / 2, -hd + 0.006); B.add(shape.box(id, B.mat('wood', '#cdb08a'), p[0], p[1], p[2], hw - 0.01, H / 2 - 0.01, 0.006, yaw));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const k = (i * 5 + j * 3) % 7; if (k > 3) continue;
    p = F.P(-hw + (i + 0.5) * cw, j * ch + 0.012 + ch * 0.38, 0.01);
    B.add(shape.box(id, B.mat(k === 0 ? 'matte' : 'paint', k === 0 ? '#c9a46a' : items[(i + j) % items.length]), p[0], p[1], p[2], cw / 2 - 0.03, ch * 0.38, hd - 0.03, yaw, 0.01));
  }
}

export { mats };
