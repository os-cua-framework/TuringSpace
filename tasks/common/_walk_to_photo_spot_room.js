import { shape, lin, fbm, hash2, lineMask, makeCam, makeRoomScene, labelAt, render, bakeLightmaps } from './_walk_to_photo_spot_rt.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const WALL_H = 2.6;
export const CAM = { eye: 1.5, back: 0.4, fovY: 56, pitch: 11 };

const rad = (d) => (d * Math.PI) / 180;
const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
function setC(out, c, k = 1) { out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; }
function boxLocal(s, x, z) { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; }

function woodTex(base, k = 1) {
  const lo = base.map((v) => v * 0.8), hi = base.map((v) => Math.min(1, v * 1.12));
  return (x, y, z, nx, ny, nz, s, out) => {
    let u = x, v = z;
    if (s.k === 1) [u, v] = boxLocal(s, x, z);
    const g = fbm(u * 2.2, (v + y * 0.7) * 26 * k, 3);
    const ring = 0.5 + 0.5 * Math.sin((v * 90 + g * 6) * k);
    mixInto(out, lo, hi, 0.35 * g + 0.27 * ring + 0.2);
  };
}
function clothTex(base) {
  const lo = base.map((v) => v * 0.88), hi = base.map((v) => Math.min(1, v * 1.07));
  return (x, y, z, nx, ny, nz, s, out) => { mixInto(out, lo, hi, fbm(x * 60 + z * 13, y * 60 - z * 7, 2)); };
}
function mats(name, hex) {
  const c = cA(hex);
  switch (name) {
    case 'cloth': return { c, ks: 0.03, sh: 8, tex: clothTex(c) };
    case 'wood': return { c, ks: 0.1, sh: 24, tex: woodTex(c) };
    case 'paint': return { c, ks: 0.2, sh: 36 };
    case 'gloss': return { c, ks: 0.45, sh: 60, env: 0.15 };
    case 'metal': return { c, ks: 0.4, sh: 45, env: 0.15 };
    case 'matte': return { c, ks: 0.03, sh: 6 };
    case 'shade': return { c, ks: 0, sh: 1, emit: 1.25 };
    case 'leaf': return { c, ks: 0.14, sh: 16, tex: (x, y, z, nx, ny, nz, s, out) => { mixInto(out, c.map((v) => v * 0.62), c.map((v) => Math.min(1, v * 1.18)), fbm(x * 24 + s.cx * 9, (y + z) * 24, 2)); } };
    default: return { c, ks: 0.1, sh: 20 };
  }
}
function builder(look = null) {
  const B = { shapes: [], mats: [], idx: new Map() };
  B.mat = (name, hex) => {
    const key = `${name}:${hex}`;
    if (!B.idx.has(key)) { B.idx.set(key, B.mats.length); B.mats.push(look ? look.mat(name, hex, mats(name, hex)) : mats(name, hex)); }
    return B.idx.get(key);
  };
  B.matDef = (key, def) => {
    if (!B.idx.has(key)) { B.idx.set(key, B.mats.length); B.mats.push(def); }
    return B.idx.get(key);
  };
  B.add = (s) => { B.shapes.push(s); return s; };
  return B;
}
function frame(x, z, yaw) {
  const a = rad(yaw), fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
  const P = (u, y, w) => [x + rx * u + fx * w, y, z + rz * u + fz * w];
  const M = [rx, 0, rz, 0, 1, 0, fx, 0, fz];
  return { P, M };
}
const box = (B, id, m, F, yaw, u, y, w, hu, hy, hw, bev = 0) => { const p = F.P(u, y, w); return B.add(shape.box(id, m, p[0], p[1], p[2], hu, hy, hw, yaw, bev)); };

function sofa(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), m = B.mat('cloth', o.col), feet = B.mat('wood', '#4e3828');
  const hw = o.hw, seats = hw > 0.6 ? 2 : 1;
  box(B, id, m, F, yaw, 0, 0.255, 0.02, hw, 0.145, 0.41, 0.04);
  for (let i = 0; i < seats; i++) {
    const cw = (hw - 0.17) / seats, u = -hw + 0.17 + cw * (2 * i + 1) - 0.08 * 0;
    box(B, id, m, F, yaw, u - 0.0, 0.45, 0.07, cw - 0.012, 0.055, 0.33, 0.05);
  }
  box(B, id, m, F, yaw, 0, 0.63, -0.3, hw, 0.24, 0.1, 0.07);
  for (const su of [-1, 1]) box(B, id, m, F, yaw, su * (hw - 0.08), 0.5, 0.02, 0.08, 0.15, 0.41, 0.05);
  for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = F.P(su * (hw - 0.08), 0, sw * 0.33); B.add(shape.cyl(id, feet, c[0], c[2], 0, 0.11, 0.025)); }
  if (o.pillow) {
    const pm = B.mat('cloth', o.pillow);
    for (const su of (seats > 1 ? [-1, 1] : [0])) {
      const p = F.P(su * (hw - 0.36), 0.66, -0.15);
      B.add(shape.ellipsoid(id, pm, p[0], p[1], p[2], 0.17, 0.15, 0.06, frame(p[0], p[2], yaw + su * 8).M));
    }
  }
}
function coffeeTable(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), m = B.mat('wood', o.col), top = 0.42, hl = o.long ? 0.62 : 0.46;
  box(B, id, m, F, yaw, 0, top - 0.025, 0, hl, 0.025, 0.3, 0.012);
  for (const su of [-1, 1]) for (const sw of [-1, 1]) box(B, id, m, F, yaw, su * (hl - 0.06), (top - 0.05) / 2, sw * 0.24, 0.025, (top - 0.05) / 2, 0.025, 0.006);
  box(B, id, m, F, yaw, 0, 0.12, 0, hl - 0.06, 0.012, 0.24);
  const vase = B.mat('gloss', o.vase);
  const v = F.P(hl * 0.45, 0, -0.05); B.add(shape.cyl(id, vase, v[0], v[2], top, top + 0.2, 0.055, 0.01));
  const b1 = B.mat('paint', '#3f6e9c'), b2 = B.mat('paint', '#e8dcc0');
  box(B, id, b1, F, yaw + 10, -hl * 0.4, top + 0.02, 0.05, 0.13, 0.02, 0.09, 0.004);
  box(B, id, b2, F, yaw - 5, -hl * 0.4, top + 0.055, 0.05, 0.11, 0.015, 0.08, 0.004);
}
function sideLamp(B, id, o) {
  const m = B.mat('wood', o.col), top = 0.58;
  B.add(shape.cyl(id, m, o.x, o.z, top - 0.03, top, 0.25, 0.01));
  B.add(shape.cyl(id, m, o.x, o.z, 0.03, top - 0.03, 0.035));
  B.add(shape.cyl(id, m, o.x, o.z, 0, 0.03, 0.16, 0.01));
  const base = B.mat('gloss', o.lamp);
  B.add(shape.frustum(id, base, o.x, o.z, top, top + 0.22, 0.09, 0.05));
  B.add(shape.cyl(id, B.mat('metal', '#b89a5a'), o.x, o.z, top + 0.22, top + 0.33, 0.012));
  B.add(shape.frustum(id, B.mat('shade', '#f3e6c8'), o.x, o.z, top + 0.3, top + 0.52, 0.19, 0.12));
}
function floorLamp(B, id, o) {
  const metal = B.mat('metal', '#33373d'), h = 1.62;
  B.add(shape.cyl(id, metal, o.x, o.z, 0, 0.03, 0.17, 0.01));
  B.add(shape.cyl(id, metal, o.x, o.z, 0.03, h - 0.24, 0.016));
  B.add(shape.frustum(id, B.mat('shade', o.col), o.x, o.z, h - 0.34, h, 0.25, 0.17));
}
function plant(B, id, o) {
  const pot = B.mat('matte', o.pot), soil = B.mat('matte', '#4a3a2c'), s = o.scale;
  B.add(shape.frustum(id, pot, o.x, o.z, 0, 0.42 * s, 0.17 * s, 0.22 * s));
  B.add(shape.cyl(id, soil, o.x, o.z, 0.38 * s, 0.4 * s, 0.2 * s));
  const stem = B.mat('wood', '#6b5135');
  B.add(shape.cyl(id, stem, o.x, o.z, 0.38 * s, 1.0 * s, 0.022 * s));
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = i * 137.5 + o.v * 29, t = i / (n - 1);
    const leaf = B.mat('leaf', i % 3 === 0 ? o.leaf2 : o.leaf);
    const r = (0.16 + 0.12 * (1 - Math.abs(t - 0.45) * 1.6)) * s, y = (0.62 + 0.62 * t) * s;
    const x = o.x + Math.sin(rad(a)) * r, z = o.z + Math.cos(rad(a)) * r;
    B.add(shape.ellipsoid(id, leaf, x, y, z, 0.16 * s, 0.075 * s, 0.1 * s, frame(x, z, a + 90).M));
  }
  B.add(shape.ellipsoid(id, B.mat('leaf', o.leaf), o.x, 1.32 * s, o.z, 0.12 * s, 0.14 * s, 0.1 * s, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
}
function shelf(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), m = B.mat('wood', o.col), H = 1.86, hw = 0.43, hd = 0.17;
  for (const su of [-1, 1]) box(B, id, m, F, yaw, su * (hw - 0.018), H / 2, 0, 0.018, H / 2, hd);
  box(B, id, B.mat('wood', '#cdb08a'), F, yaw, 0, H / 2, -hd + 0.012, hw - 0.03, H / 2 - 0.02, 0.012);
  const cols = ['#b5483a', '#3f7cc0', '#d9a73a', '#4f8a5a', '#7a5aa0', '#e6dcc6', '#2f3a48'];
  for (let k = 0; k < 5; k++) {
    const y = 0.07 + k * (H - 0.1) / 4;
    box(B, id, m, F, yaw, 0, y, 0, hw, 0.018, hd);
    if (k === 4) continue;
    let u = -hw + 0.05;
    for (let j = 0; u < hw - 0.08 && j < 9; j++) {
      const r = hash2(o.v * 31 + k * 7 + j, 5), bw = 0.035 + 0.035 * r, bh = 0.2 + 0.1 * hash2(o.v + k, j * 3);
      if ((j + k + o.v) % 5 === 4) { u += 0.08; continue; }
      box(B, id, B.mat('paint', cols[(j * 3 + k * 2 + o.v) % cols.length]), F, yaw, u + bw, y + 0.018 + bh / 2, 0.02, bw - 0.004, bh / 2, hd - 0.05, 0.004);
      u += 2 * bw + 0.004;
    }
  }
  box(B, id, m, F, yaw, 0, H - 0.015, 0, hw, 0.015, hd);
}
function tvStand(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), wood = B.mat('wood', o.col), dark = B.mat('gloss', '#1d2126'), screen = B.mat('gloss', '#2c3a4c');
  box(B, id, wood, F, yaw, 0, 0.27, 0, 0.82, 0.24, 0.21, 0.015);
  for (const su of [-1, 1]) box(B, id, wood, F, yaw, su * 0.74, 0.015, 0, 0.03, 0.015, 0.16);
  box(B, id, dark, F, yaw, 0, 0.53, -0.02, 0.1, 0.02, 0.07);
  box(B, id, dark, F, yaw, 0, 0.6, -0.04, 0.02, 0.06, 0.02);
  box(B, id, dark, F, yaw, 0, 0.98, -0.04, 0.6, 0.35, 0.025, 0.006);
  box(B, id, screen, F, yaw, 0, 0.98, -0.013, 0.575, 0.325, 0.003);
}
function cabinet(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), hy = 0.42;
  const body = cA(o.col), groove = body.map((v) => v * 0.55);
  const m = B.matDef(`cab:${o.col}`, { c: body, ks: 0.12, sh: 30, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, w] = boxLocal(s, x, z);
    const front = Math.abs(w) > s.hz - 0.002 || Math.abs(u) > s.hx - 0.002;
    if (front && ny < 0.5 && y > 0.08 && y < 2 * hy - 0.03) {
      const g = Math.max(lineMask(y - 0.08, (2 * hy - 0.11) / 3, 0.006, fp || 0.002), Math.abs(w) > s.hz - 0.002 ? lineMask(u, s.hx, 0.006, fp || 0.002) : 0);
      mixInto(out, body, groove, g * 0.8); return;
    }
    setC(out, body);
  } });
  box(B, id, m, F, yaw, 0, hy + 0.04, 0, 0.45, hy, 0.22, 0.01);
  const legs = B.mat('wood', '#5b4330');
  for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = F.P(su * 0.4, 0, sw * 0.17); B.add(shape.cyl(id, legs, c[0], c[2], 0, 0.06, 0.02)); }
  const knob = B.mat('metal', '#b89a5a');
  for (let k = 0; k < 3; k++) { const p = F.P(0, 0.08 + (k + 0.5) * (2 * hy - 0.11) / 3, 0.225); B.add(shape.sphere(id, knob, p[0], p[1], p[2], 0.018)); }
  const vase = B.mat('gloss', o.vase), top = 2 * hy + 0.04;
  const v = F.P(-0.2, 0, 0); B.add(shape.frustum(id, vase, v[0], v[2], top, top + 0.24, 0.07, 0.05));
  for (let i = 0; i < 5; i++) {
    const a = rad(i * 72 + 10), q = [v[0] + Math.sin(a) * 0.07, top + 0.3 + 0.04 * (i % 2), v[2] + Math.cos(a) * 0.07];
    B.add(shape.sphere(id, B.mat('matte', i % 2 ? o.flower : '#f2efe6'), q[0], q[1], q[2], 0.045));
  }
  const bk = F.P(0.18, 0, 0); B.add(shape.box(id, B.mat('paint', '#2f4f6a'), bk[0], top + 0.12, bk[2], 0.04, 0.12, 0.09, yaw + 90, 0.004));
}
function desk(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), m = B.mat('wood', o.col), top = 0.75;
  box(B, id, m, F, yaw, 0, top - 0.02, 0, 0.5, 0.02, 0.27, 0.01);
  for (const su of [-1, 1]) box(B, id, m, F, yaw, su * 0.47, (top - 0.04) / 2, 0, 0.02, (top - 0.04) / 2, 0.25);
  box(B, id, m, F, yaw, 0.28, top - 0.1, 0.0, 0.18, 0.06, 0.24, 0.006);
  const metal = B.mat('metal', '#2f3338');
  const l = F.P(-0.36, 0, -0.12); B.add(shape.cyl(id, metal, l[0], l[2], top, top + 0.02, 0.07));
  B.add(shape.capsule(id, metal, l[0], top + 0.02, l[2], l[0], top + 0.38, l[2], 0.012));
  B.add(shape.frustum(id, B.mat('shade', '#f0e2c0'), l[0], l[2], top + 0.3, top + 0.42, 0.11, 0.06));
  const lap = B.mat('metal', '#9aa2ab');
  box(B, id, lap, F, yaw, 0.02, top + 0.01, 0.02, 0.17, 0.008, 0.12);
  box(B, id, lap, F, yaw, 0.02, top + 0.13, -0.1, 0.17, 0.12, 0.006);
  const cw = B.mat('wood', '#7a5a3c'), cush = B.mat('cloth', o.seat), seatY = 0.47;
  const C = frame(...F.P(0, 0, 0.42).filter((_, i) => i !== 1), yaw + 180), cyaw = yaw + 180;
  box(B, id, cw, C, cyaw, 0, seatY - 0.02, 0, 0.21, 0.02, 0.21, 0.01);
  box(B, id, cush, C, cyaw, 0, seatY + 0.015, 0.01, 0.19, 0.016, 0.19, 0.012);
  for (const [u, w] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const c = C.P(u, 0, w); B.add(shape.cyl(id, cw, c[0], c[2], 0, seatY - 0.04, 0.019)); }
  for (const u of [-0.18, 0.18]) { const c = C.P(u, 0, -0.19); B.add(shape.cyl(id, cw, c[0], c[2], seatY, seatY + 0.42, 0.019)); }
  box(B, id, cw, C, cyaw, 0, seatY + 0.34, -0.19, 0.19, 0.08, 0.014, 0.008);
}

function bed(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), wood = B.mat('wood', o.col), sheet = B.mat('cloth', '#f1eee6'), duvet = B.mat('cloth', o.duvet), pil = B.mat('cloth', o.pillow || '#f4f1ea');
  const hw = 0.78, hd = 0.94;
  box(B, id, wood, F, yaw, 0, 0.16, 0.03, hw, 0.16, hd - 0.03, 0.02);
  box(B, id, sheet, F, yaw, 0, 0.4, 0.04, hw - 0.04, 0.08, hd - 0.07, 0.05);
  box(B, id, duvet, F, yaw, 0, 0.47, 0.27, hw - 0.01, 0.055, hd * 0.68, 0.05);
  box(B, id, wood, F, yaw, 0, 0.55, -hd + 0.035, hw + 0.03, 0.55, 0.035, 0.015);
  for (const su of [-1, 1]) { const p = F.P(su * 0.36, 0.53, -hd + 0.3); B.add(shape.ellipsoid(id, pil, p[0], p[1], p[2], 0.3, 0.07, 0.15, frame(p[0], p[2], yaw).M)); }
}
function wardrobe(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), hy = 0.98, body = cA(o.col), groove = body.map((v) => v * 0.5);
  const m = B.matDef(`ward:${o.col}`, { c: body, ks: 0.12, sh: 30, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
    const [u, w] = boxLocal(s, x, z);
    if (Math.abs(w) > s.hz - 0.002 && ny < 0.5 && y > 0.06) { mixInto(out, body, groove, 0.85 * lineMask(u, s.hx, 0.005, fp || 0.002)); return; }
    setC(out, body);
  } });
  box(B, id, m, F, yaw, 0, hy + 0.04, 0, 0.46, hy, 0.28, 0.01);
  box(B, id, B.mat('wood', '#4e3828'), F, yaw, 0, 0.02, 0, 0.44, 0.02, 0.26);
  const knob = B.mat('metal', '#b89a5a');
  for (const su of [-1, 1]) box(B, id, knob, F, yaw, su * 0.05, 1.05, 0.29, 0.008, 0.12, 0.012);
}
function nightstand(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), m = B.mat('wood', o.col), top = 0.52;
  box(B, id, m, F, yaw, 0, top / 2, 0, 0.24, top / 2, 0.2, 0.01);
  box(B, id, B.mat('metal', '#b89a5a'), F, yaw, 0, top * 0.62, 0.205, 0.05, 0.008, 0.008);
  const l = F.P(0.05, 0, -0.02);
  B.add(shape.frustum(id, B.mat('gloss', o.lamp), l[0], l[2], top, top + 0.2, 0.07, 0.04));
  B.add(shape.frustum(id, B.mat('shade', '#f3e6c8'), l[0], l[2], top + 0.18, top + 0.36, 0.15, 0.09));
}
function fridge(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), body = cA(o.col), seam = body.map((v) => v * 0.45);
  const m = B.matDef(`fridge:${o.col}`, { c: body, ks: 0.35, sh: 50, env: 0.1, tex: (x, y, z, nx, ny, nz, s, out, fp) => {
    const [, w] = boxLocal(s, x, z);
    if (Math.abs(w) > s.hz - 0.002 && ny < 0.5) { mixInto(out, body, seam, 0.9 * lineMask(y - 1.22, 10, 0.006, fp || 0.002)); return; }
    setC(out, body);
  } });
  box(B, id, m, F, yaw, 0, 0.93, 0, 0.36, 0.91, 0.32, 0.02);
  const h = B.mat('metal', '#9aa2ab');
  box(B, id, h, F, yaw, 0.28, 1.5, 0.34, 0.012, 0.2, 0.015);
  box(B, id, h, F, yaw, 0.28, 0.95, 0.34, 0.012, 0.16, 0.015);
}
function counter(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), cab = B.mat('paint', o.col), top = B.mat('gloss', o.top), dark = B.mat('metal', '#3a3f45'), steel = B.mat('metal', '#c4c9cf');
  box(B, id, cab, F, yaw, 0, 0.44, 0.0, 0.98, 0.42, 0.29, 0.01);
  box(B, id, B.mat('wood', '#3a2c20'), F, yaw, 0, 0.03, 0.02, 0.96, 0.03, 0.27);
  box(B, id, top, F, yaw, 0, 0.885, 0.01, 1.0, 0.02, 0.31, 0.004);
  box(B, id, steel, F, yaw, -0.45, 0.9, 0.03, 0.22, 0.008, 0.18);
  const t = F.P(-0.45, 0, -0.2); B.add(shape.capsule(id, steel, t[0], 0.9, t[2], t[0], 1.12, t[2], 0.014));
  box(B, id, dark, F, yaw, 0.45, 0.9, 0.02, 0.26, 0.008, 0.2);
  for (const u of [-0.75, -0.25, 0.25, 0.75]) box(B, id, B.mat('metal', '#9aa2ab'), F, yaw, u, 0.78, 0.295, 0.06, 0.008, 0.008);
  box(B, id, cab, F, yaw, 0, 1.78, -0.12, 0.98, 0.32, 0.17, 0.01);
}
function dining(B, id, o) {
  const wood = B.mat('wood', o.col), seat = B.mat('cloth', o.seat), top = 0.74;
  B.add(shape.cyl(id, wood, o.x, o.z, top - 0.03, top, 0.36, 0.01));
  B.add(shape.cyl(id, wood, o.x, o.z, 0.03, top - 0.03, 0.04));
  B.add(shape.cyl(id, wood, o.x, o.z, 0, 0.03, 0.2, 0.01));
  const a = rad(o.yaw || 0), dx = Math.sin(a), dz = Math.cos(a);
  for (const sg of [-1, 1]) {
    const cx = o.x + dx * 0.33 * sg, cz = o.z + dz * 0.33 * sg;
    B.add(shape.cyl(id, seat, cx, cz, 0.44, 0.48, 0.13, 0.01));
    B.add(shape.cyl(id, wood, cx, cz, 0, 0.44, 0.022));
  }
  const v = B.mat('gloss', o.vase); B.add(shape.cyl(id, v, o.x + 0.1, o.z - 0.05, top, top + 0.16, 0.045, 0.01));
}
function officeChair(B, id, o) {
  const yaw = o.yaw, F = frame(o.x, o.z, yaw), dark = B.mat('metal', '#2f3338'), seat = B.mat('cloth', o.col);
  for (let k = 0; k < 5; k++) { const a = rad(k * 72 + 10); B.add(shape.capsule(id, dark, o.x, 0.06, o.z, o.x + Math.sin(a) * 0.28, 0.04, o.z + Math.cos(a) * 0.28, 0.018)); }
  B.add(shape.cyl(id, dark, o.x, o.z, 0.06, 0.44, 0.025));
  box(B, id, seat, F, yaw, 0, 0.47, 0, 0.23, 0.04, 0.22, 0.03);
  box(B, id, seat, F, yaw, 0, 0.8, -0.2, 0.21, 0.24, 0.035, 0.03);
  box(B, id, dark, F, yaw, 0, 0.55, -0.19, 0.02, 0.08, 0.015);
}

export const PROP = {
  sofa: { span: 2, depth: 0.86, wall: true, tall: false },
  tv: { span: 2, depth: 0.42, wall: true, tall: true },
  shelf: { span: 1, depth: 0.34, wall: true, tall: true },
  cabinet: { span: 1, depth: 0.44, wall: true, tall: false },
  desk: { span: 1, depth: 0.54, wall: true, tall: false },
  coffee: { span: 1, free: true },
  armchair: { span: 1, free: true },
  plant: { span: 1, free: true },
  lamp: { span: 1, free: true },
  side: { span: 1, free: true },
  bed: { span: 2, depth: 1.94, wall: true, tall: false, rows: 2 },
  wardrobe: { span: 1, depth: 0.58, wall: true, tall: true },
  nightstand: { span: 1, depth: 0.42, wall: true, tall: false },
  fridge: { span: 1, depth: 0.66, wall: true, tall: true },
  counter: { span: 2, depth: 0.62, wall: true, tall: true },
  dining: { span: 1, free: true },
  ochair: { span: 1, free: true },
};
function buildProp(B, f) {
  const o = { ...f, id: f.id };
  switch (f.type) {
    case 'sofa': return sofa(B, f.id, { ...o, hw: 0.92 });
    case 'armchair': return sofa(B, f.id, { ...o, hw: 0.41 });
    case 'coffee': return coffeeTable(B, f.id, o);
    case 'side': return sideLamp(B, f.id, o);
    case 'lamp': return floorLamp(B, f.id, o);
    case 'plant': return plant(B, f.id, o);
    case 'shelf': return shelf(B, f.id, o);
    case 'tv': return tvStand(B, f.id, o);
    case 'cabinet': return cabinet(B, f.id, o);
    case 'desk': return desk(B, f.id, o);
    case 'bed': return bed(B, f.id, o);
    case 'wardrobe': return wardrobe(B, f.id, o);
    case 'nightstand': return nightstand(B, f.id, o);
    case 'fridge': return fridge(B, f.id, o);
    case 'counter': return counter(B, f.id, o);
    case 'dining': return dining(B, f.id, o);
    case 'ochair': return officeChair(B, f.id, o);
    default: throw new Error('unknown prop ' + f.type);
  }
}

export function wallLen(m, w) { return w % 2 === 0 ? m.room.W : m.room.D; }
export function segCell(m, w, s) {
  const { W, D } = m.room;
  if (w === 0) return [s, 0];
  if (w === 1) return [W - 1, s];
  if (w === 2) return [W - 1 - s, D - 1];
  return [0, D - 1 - s];
}
const WALL_IN = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export const WALL_YAW = [0, 270, 180, 90];

function smooth(a, b, t) { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); }

function artColor(p, pu, pv, out) {
  const C = p.cols.map(cA);
  switch (p.style) {
    case 0: {
      const c = pu < p.a ? (pv < p.b ? C[0] : C[1]) : (pv < 1 - p.b ? C[2] : C[3]);
      const n = 0.94 + 0.08 * fbm(pu * 30, pv * 30, 2);
      setC(out, c, n); return;
    }
    case 1: {
      const hill = 0.38 + 0.1 * Math.sin(pu * 6 + p.a * 5) + 0.05 * Math.sin(pu * 15 + p.b * 9);
      const hill2 = 0.22 + 0.06 * Math.sin(pu * 9 + 2);
      const sx = pu - (0.25 + 0.5 * p.a), sy = pv - 0.72;
      if (sx * sx + sy * sy < 0.011) { setC(out, C[3]); return; }
      if (pv < hill2) { setC(out, C[2], 0.8 + 0.3 * pv); return; }
      if (pv < hill) { setC(out, C[1], 0.8 + 0.3 * pv); return; }
      mixInto(out, C[0], [0.85, 0.85, 0.82], (pv - hill) * 0.5); return;
    }
    case 2: {
      const d1 = Math.hypot(pu - 0.42, pv - 0.55), d2 = Math.hypot(pu - 0.7, pv - 0.3);
      if (d2 < 0.15) { setC(out, C[2]); return; }
      if (d1 < 0.3) { setC(out, d1 < 0.16 ? C[3] : C[1]); return; }
      setC(out, C[0], 0.95 + 0.06 * fbm(pu * 25, pv * 25, 2)); return;
    }
    default: {
      const b = Math.floor((pu + pv * 0.7) * 3.2 + p.a) % 4;
      setC(out, C[(b + 4) % 4], 0.95 + 0.06 * fbm(pu * 25, pv * 25, 2)); return;
    }
  }
}

function roomSurfaces(m, look = null) {
  const R = m.room, W = R.W, D = R.D, H = WALL_H;
  const wallC = cA(R.wall), accentC = R.accent ? cA(R.accent.col) : null;
  const base = cA('#f4f1ea'), crown = cA('#f6f4ef');
  const casing = cA('#f2efe8');
  const fl = R.floor, fDark = cA(fl.dark), fLight = cA(fl.light);
  const feats = [[], [], [], []];
  for (const f of R.feats) feats[f.w].push(f);
  const rugs = R.rugs.map((r) => ({ ...r, C: r.cols.map(cA) }));
  const ceilC = cA('#f3f1ec'), lampC = [3.2, 3.0, 2.6];
  const sky0 = cA('#cfe0ee'), sky1 = cA('#8fb6dc'), tree0 = cA('#3f6a3a'), tree1 = cA('#6f9a55'), lawn = cA('#86a85e');
  const FW = 0.065;
  function plainWall(w, u, y, fp, out) {
    if (y < 0.1) { setC(out, base, Math.abs(y - 0.1) < 0.006 ? 0.8 : 1); return; }
    if (y > H - 0.07) { setC(out, crown, Math.abs(y - (H - 0.07)) < 0.006 ? 0.85 : 1); return; }
    if (look) { look.wall(w, u, y, fp, !!(R.accent && R.accent.w === w), out); return; }
    const c = R.accent && R.accent.w === w ? accentC : wallC;
    setC(out, c, 0.97 + 0.05 * fbm(u * 5 + w * 13, y * 5, 3, fp));
  }
  return {
    W, D, H,
    floorMat: { ks: 0.06, sh: 30 }, wallMat: { ks: 0, sh: 1 },
    floor(x, z, fp, out) {
      for (const r of rugs) {
        if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
        const e = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
        const n = 0.9 + 0.14 * fbm(x * 40, z * 40, 2, fp * 10);
        if (e < 0.11) { setC(out, r.C[1], n); return; }
        if (e < 0.14) { setC(out, r.C[2], n); return; }
        if (r.style === 1) { const b = Math.floor((r.along ? x : z) * 5) % 2; setC(out, b ? r.C[0] : r.C[2], n); return; }
        if (r.style === 2) {
          const q = Math.abs(((x - r.x0) * 3.2) % 1 - 0.5) + Math.abs(((z - r.z0) * 3.2) % 1 - 0.5);
          setC(out, q < 0.22 ? r.C[2] : r.C[0], n); return;
        }
        setC(out, r.C[0], n); return;
      }
      if (look) { look.floor(x, z, fp, out); return; }
      const P = 0.16, PL = 1.3, a = fl.alongX ? z : x, b = fl.alongX ? x : z;
      const row = Math.floor(a / P), off = hash2(row, 7) * PL;
      const seg = Math.floor((b + off) / PL), tone = hash2(row, seg);
      const g = fbm(a * 3 + row * 1.7, b * 0.9 + seg * 3.1, 3, fp);
      const grain = fbm(a * 40 + row * 3, b * 2.2, 2, fp * 18);
      mixInto(out, fDark, fLight, 0.25 + 0.4 * tone + 0.25 * g + 0.1 * grain);
      const seam = Math.max(lineMask(a, P, 0.0035, fp), lineMask(b + off, PL, 0.003, fp) * 0.8);
      const k = 1 - 0.36 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    ceil(x, z, fp, out) {
      const d = Math.hypot(x - W / 2, z - D / 2);
      if (d < 0.2) { out[0] = lampC[0]; out[1] = lampC[1]; out[2] = lampC[2]; return 1; }
      if (d < 0.24) { setC(out, ceilC, 0.8); return 0; }
      setC(out, ceilC); return 0;
    },
    wall(w, u, y, fp, dx, dy, dz, out) {
      for (const f of feats[w]) {
        if (u < f.u0 - FW - 0.03 || u > f.u1 + FW + 0.03 || y < f.y0 - FW - 0.06 || y > f.y1 + FW) continue;
        const pu = (u - f.u0) / (f.u1 - f.u0), pv = (y - f.y0) / (f.y1 - f.y0);
        const inU = u >= f.u0 && u <= f.u1, inV = y >= f.y0 && y <= f.y1;
        if (f.kind === 'door') {
          if (u >= f.u0 - FW && u <= f.u1 + FW && y <= f.y1 + FW) {
            if (!(inU && inV)) { setC(out, casing, (u < f.u0 - FW + 0.008 || u > f.u1 + FW - 0.008 || y > f.y1 + FW - 0.008) ? 0.85 : 1); return 0; }
            const dc = cA(f.col), hx = f.hinge ? 0.1 : 0.9;
            const kx = (pu - hx) * (f.u1 - f.u0) / 0.035, ky = (y - 1.0) / 0.035;
            if (kx * kx + ky * ky < 1) { setC(out, cA('#c9a24a'), 1.05); return 0; }
            const inPanel = pu > 0.15 && pu < 0.85 && ((pv > 0.08 && pv < 0.45) || (pv > 0.53 && pv < 0.92));
            const edge = pu > 0.13 && pu < 0.87 && ((pv > 0.065 && pv < 0.465) || (pv > 0.515 && pv < 0.935)) && !inPanel;
            setC(out, dc, edge ? 0.72 : inPanel ? 0.92 : 1); return 0;
          }
          continue;
        }
        if (f.kind === 'window') {
          if (u >= f.u0 - FW && u <= f.u1 + FW && y >= f.y0 - FW - 0.05 && y <= f.y1 + FW) {
            if (y < f.y0 - FW) { setC(out, casing, y < f.y0 - FW - 0.04 ? 0.7 : 0.96); return 0; }
            const mull = Math.abs(pu - 0.5) * (f.u1 - f.u0) < 0.022 || Math.abs(pv - 0.62) * (f.y1 - f.y0) < 0.02;
            if (!(inU && inV) || mull) { setC(out, casing, 1); return 0; }
            const az = Math.atan2(dx, dz), el = dy;
            const tl = -0.04 + 0.12 * fbm(az * 5 + w * 3.1, 1.3, 3) + 0.04 * fbm(az * 23, 4.2, 2);
            if (el < -0.16) setC(out, lawn, 0.9 + 0.2 * fbm(az * 30, el * 30, 2));
            else if (el < tl) mixInto(out, tree0, tree1, fbm(az * 40, el * 40, 3));
            else if (look) look.sky(dx, dy, dz, out);
            else mixInto(out, sky0, sky1, smooth(0.0, 0.6, el));
            out[0] *= 1.25; out[1] *= 1.25; out[2] *= 1.25;
            return 1;
          }
          continue;
        }
        if (f.kind === 'pic') {
          if (u >= f.u0 - FW && u <= f.u1 + FW && y >= f.y0 - FW && y <= f.y1 + FW) {
            if (!(inU && inV)) { setC(out, cA(f.frame), (u > f.u1 + FW - 0.012 || y < f.y0 - FW + 0.012) ? 0.7 : 1); return 0; }
            artColor(f, pu, pv, out); return 0;
          }
          if (u > f.u0 - FW + 0.03 && y < f.y0 - FW && y > f.y0 - FW - 0.05) { plainWall(w, u, y, fp, out); out[0] *= 0.82; out[1] *= 0.82; out[2] *= 0.82; return 0; }
          continue;
        }
        if (f.kind === 'clock') {
          const cu = (f.u0 + f.u1) / 2, cv = (f.y0 + f.y1) / 2, r = (f.u1 - f.u0) / 2, du = u - cu, dv = y - cv, d = Math.hypot(du, dv);
          if (d < r) {
            if (d > r - 0.03) { setC(out, cA(f.frame)); return 0; }
            const ang = Math.atan2(du, dv);
            const hand = (a, len, wd) => { const ux = Math.sin(a), uy = Math.cos(a), along = du * ux + dv * uy, perp = Math.abs(du * uy - dv * ux); return along > -0.02 && along < len && perp < wd; };
            if (hand(f.hA, r * 0.5, 0.012) || hand(f.mA, r * 0.78, 0.008) || d < 0.016) { setC(out, cA('#22262b')); return 0; }
            const tick = d > r - 0.07 && Math.abs(((ang / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42;
            setC(out, cA('#f7f5ef'), tick ? 0.25 : 1); return 0;
          }
          if (d < r + 0.04 && dv < 0 && du > -r * 0.4) { plainWall(w, u, y, fp, out); out[0] *= 0.86; out[1] *= 0.86; out[2] *= 0.86; return 0; }
          continue;
        }
      }
      plainWall(w, u, y, fp, out);
      return 0;
    },
    label(kind, x, y, z, u) {
      if (kind === 1) {
        for (let j = 0; j < rugs.length; j++) { const r = rugs[j]; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return 100 + j; }
        return 1;
      }
      if (kind === 2) return 3;
      const w = kind - 3;
      for (const f of feats[w]) {
        const pad = f.kind === 'pic' || f.kind === 'clock' ? FW : FW;
        if (u >= f.u0 - pad && u <= f.u1 + pad && y >= f.y0 - pad - (f.kind === 'window' ? 0.05 : 0) && y <= f.y1 + pad) return 200 + f.fid;
      }
      return R.accent && R.accent.w === w ? 5 : 2;
    },
  };
}

const SCENES = new WeakMap();
export function roomScene(m, look = null) {
  const cache = look ? (look.scenes ||= new WeakMap()) : SCENES;
  let sc = cache.get(m);
  if (sc) return sc;
  const B = builder(look);
  for (const f of m.props) buildProp(B, f);
  const room = roomSurfaces(m, look);
  const win = m.room.feats.find((f) => f.kind === 'window');
  const fillDir = win ? [-WALL_IN[win.w][0], 0.35, -WALL_IN[win.w][1]] : [0.4, 0.5, 0.3];
  const fl = Math.hypot(...fillDir);
  const light = {
    pos: [m.room.W / 2, WALL_H - 0.32, m.room.D / 2], radius: 0.32, falloff: 2.8,
    col: [2.35, 2.18, 1.9], sky: [0.4, 0.4, 0.42], ground: [0.24, 0.205, 0.17],
    fill: { dir: fillDir.map((v) => v / fl), col: [0.2, 0.21, 0.23] }, aoK: 1, contact: 0.3, contactH: 0.12, bounce: 0.28,
  };
  if (look) look.light(light);
  sc = makeRoomScene({ shapes: B.shapes, mats: B.mats, room, light });
  sc.exposure = 1.05;
  cache.set(m, sc);
  return sc;
}

export function poseOf(cell, heading) {
  return { x: cell[0] + 0.5 - DIRS[heading][0] * CAM.back, z: cell[1] + 0.5 - DIRS[heading][1] * CAM.back, ang: heading * Math.PI / 2 };
}
export function camAt(pose, W, H) {
  const fx = Math.sin(pose.ang), fz = -Math.cos(pose.ang), p = rad(CAM.pitch);
  const eye = [pose.x, CAM.eye, pose.z];
  return makeCam({ eye, target: [eye[0] + fx * Math.cos(p), eye[1] - Math.sin(p), eye[2] + fz * Math.cos(p)], fovY: CAM.fovY, W, H });
}
export function viewScene(m, pose, W, H, look = null) {
  const base = roomScene(m, look);
  return { ...base, cam: camAt(pose, W, H), tiles: null };
}
export function renderView(m, pose, W, H, q, ss = 0, look = null) {
  bakeLightmaps(roomScene(m, look));
  return render(viewScene(m, pose, W, H, look), q, null, 0, Infinity, ss);
}

export const LAB = { cols: 56, rows: 33 };
export function labelImage(m, cell, heading, W, H) {
  const sc = viewScene(m, poseOf(cell, heading), W, H);
  const n = LAB.cols * LAB.rows, lab = new Int16Array(n), dep = new Float32Array(n);
  for (let j = 0; j < LAB.rows; j++) for (let i = 0; i < LAB.cols; i++) {
    const h = labelAt(sc, (i + 0.5) * W / LAB.cols, (j + 0.5) * H / LAB.rows);
    lab[j * LAB.cols + i] = h.lab; dep[j * LAB.cols + i] = h.t;
  }
  return { lab, dep };
}
