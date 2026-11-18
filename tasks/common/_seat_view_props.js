import { lin, fbm, hash2, lineMask, makeCam, makeScene, shape } from './_seat_view_rt.js';

const rad = (d) => (d * Math.PI) / 180;
const cA = (hex) => lin(hex);
function mixInto(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; }
function boxLocal(s, x, z) { const px = x - s.cx, pz = z - s.cz; return [px * s.ca - pz * s.sa, px * s.sa + pz * s.ca]; }

function woodTex(base, k = 1) {
  const lo = base.map((v) => v * 0.82), hi = base.map((v) => Math.min(1, v * 1.1));
  return (x, y, z, nx, ny, nz, s, out) => {
    let u = x, v = z;
    if (s.k === 1) [u, v] = boxLocal(s, x, z);
    const g = fbm(u * 2.2, (v + y * 0.7) * 26 * k, 3);
    const ring = 0.5 + 0.5 * Math.sin((v * 90 + g * 6) * k);
    mixInto(out, lo, hi, 0.35 * g + 0.27 * ring + 0.2);
  };
}
function clothTex(base) {
  const lo = base.map((v) => v * 0.9), hi = base.map((v) => Math.min(1, v * 1.06));
  return (x, y, z, nx, ny, nz, s, out) => { mixInto(out, lo, hi, fbm(x * 60 + z * 13, y * 60 - z * 7, 2)); };
}
export function mats(name, hex) {
  const c = cA(hex);
  switch (name) {
    case 'cloth': return { c, ks: 0.04, sh: 8, tex: clothTex(c) };
    case 'skin': return { c, ks: 0.12, sh: 18 };
    case 'hair': return { c, ks: 0.18, sh: 30 };
    case 'shoe': return { c, ks: 0.25, sh: 30 };
    case 'wood': return { c, ks: 0.1, sh: 24, tex: woodTex(c) };
    case 'paint': return { c, ks: 0.22, sh: 36 };
    case 'gloss': return { c, ks: 0.45, sh: 60, env: 0.15 };
    case 'metal': return { c, ks: 0.4, sh: 45, env: 0.15 };
    case 'matte': return { c, ks: 0.03, sh: 6 };
    case 'plant': return { c, ks: 0.12, sh: 14, tex: (x, y, z, nx, ny, nz, s, out) => { mixInto(out, c.map((v) => v * 0.7), c.map((v) => Math.min(1, v * 1.15)), fbm(x * 30, (y + z) * 30, 2)); } };
    default: return { c, ks: 0.1, sh: 20 };
  }
}

export function builder() {
  const B = { shapes: [], mats: [], idx: new Map() };
  B.mat = (name, hex) => {
    const key = `${name}:${hex}`;
    if (!B.idx.has(key)) { B.idx.set(key, B.mats.length); B.mats.push(mats(name, hex)); }
    return B.idx.get(key);
  };
  B.matDef = (key, def) => {
    if (!B.idx.has(key)) { B.idx.set(key, B.mats.length); B.mats.push(def); }
    return B.idx.get(key);
  };
  B.add = (s) => { B.shapes.push(s); return s; };
  return B;
}

export function frame(x, z, yaw) {
  const a = rad(yaw), fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
  const P = (u, y, w) => [x + rx * u + fx * w, y, z + rz * u + fz * w];
  const M = [rx, 0, rz, 0, 1, 0, fx, 0, fz];
  return { P, M, f: [fx, fz], r: [rx, rz] };
}
function ell(B, id, m, F, u, y, w, ru, ry, rw) { const p = F.P(u, y, w); return B.add(shape.ellipsoid(id, m, p[0], p[1], p[2], ru, ry, rw, F.M)); }
function cap(B, id, m, F, a, b, r) { const p = F.P(...a), q = F.P(...b); return B.add(shape.capsule(id, m, p[0], p[1], p[2], q[0], q[1], q[2], r)); }

export const PERSON_LOOKS = [
  { shirt: '#c8553d', pants: '#3b4a5c', hair: '#3a2a20', skin: '#e2b896', long: true },
  { shirt: '#3f7cc0', pants: '#4a4036', hair: '#1f1a17', skin: '#c99a76' },
  { shirt: '#4f9a62', pants: '#34393f', hair: '#6b4a2e', skin: '#edc6a6', long: true },
  { shirt: '#e0b23e', pants: '#40506a', hair: '#2a2420', skin: '#b98563' },
  { shirt: '#8a5ab0', pants: '#3a3d45', hair: '#4a3324', skin: '#e6bf9e', long: true },
  { shirt: '#d4dde6', pants: '#2f3a48', hair: '#2b211b', skin: '#d4a581' },
];
export function person(B, id, o) {
  const look = { ...PERSON_LOOKS[0], long: false, ...o.look };
  const F = frame(o.x, o.z, o.yaw), s = o.scale ?? 1;
  const mS = B.mat('cloth', look.shirt), mP = B.mat('cloth', look.pants), mK = B.mat('skin', look.skin);
  const mH = B.mat('hair', look.hair), mF = B.mat('shoe', '#2c2a2a');
  const sit = o.pose === 'sit';
  const hipY = sit ? (o.seatY ?? 0.46) + 0.07 : 0.92 * s;
  const L = (k) => k * s;
  for (const side of [-1, 1]) {
    const u = side * L(0.095);
    if (sit) {
      const kneeW = L(0.44), kneeY = hipY - L(0.01);
      cap(B, id, mP, F, [u, hipY, L(0.02)], [u * 1.05, kneeY, kneeW], L(0.068));
      cap(B, id, mP, F, [u * 1.05, kneeY, kneeW], [u * 1.05, L(0.1), kneeW + L(0.02)], L(0.054));
      ell(B, id, mF, F, u * 1.05, L(0.045), kneeW + L(0.08), L(0.048), L(0.045), L(0.12));
    } else {
      cap(B, id, mP, F, [u, hipY - L(0.04), 0], [u * 1.02, L(0.5), L(0.005)], L(0.072));
      cap(B, id, mP, F, [u * 1.02, L(0.5), L(0.005)], [u * 1.04, L(0.1), -L(0.01)], L(0.055));
      ell(B, id, mF, F, u * 1.04, L(0.045), L(0.05), L(0.048), L(0.045), L(0.12));
    }
  }
  ell(B, id, mP, F, 0, hipY, sit ? L(0.0) : 0, L(0.175), L(0.11), L(0.115));
  const chestY = hipY + L(0.3);
  ell(B, id, mS, F, 0, chestY, 0, L(0.18), L(0.27), L(0.115));
  ell(B, id, mS, F, 0, chestY + L(0.17), 0, L(0.19), L(0.085), L(0.1));
  for (const side of [-1, 1]) {
    const sh = [side * L(0.195), chestY + L(0.17), 0];
    let el, wr;
    if (sit) { el = [side * L(0.22), chestY - L(0.1), L(0.08)]; wr = [side * L(0.17), hipY + L(0.05), L(0.3)]; }
    else { el = [side * L(0.235), chestY - L(0.1), L(0.02)]; wr = [side * L(0.225), chestY - L(0.37), L(0.06)]; }
    cap(B, id, mS, F, sh, el, L(0.046));
    cap(B, id, mK, F, el, wr, L(0.04));
    const h = F.P(wr[0], wr[1] - L(0.04), wr[2] + (sit ? L(0.04) : 0));
    B.add(shape.sphere(id, mK, h[0], h[1], h[2], L(0.045)));
  }
  const neckY = chestY + L(0.25);
  cap(B, id, mK, F, [0, neckY - L(0.03), 0], [0, neckY + L(0.07), L(0.005)], L(0.05));
  const headY = neckY + L(0.17);
  const pc = rad(o.headPitch ?? 0), cp = Math.cos(pc), sp = Math.sin(pc), pivotY = neckY + L(0.06);
  const HF = { P: (u, y, w) => { const dy = y - pivotY; return F.P(u, pivotY + dy * cp - w * sp, w * cp + dy * sp); },
    M: [F.M[0], F.M[1], F.M[2], F.f[0] * sp, cp, F.f[1] * sp, F.f[0] * cp, -sp, F.f[1] * cp] };
  ell(B, id, mK, HF, 0, headY, L(0.01), L(0.083), L(0.108), L(0.098));
  ell(B, id, mH, HF, 0, headY + L(0.022), -L(0.016), L(0.09), L(0.1), L(0.097));
  if (look.long) ell(B, id, mH, HF, 0, headY - L(0.09), -L(0.05), L(0.1), L(0.14), L(0.065));
  ell(B, id, mK, HF, 0, headY - L(0.012), L(0.102), L(0.016), L(0.022), L(0.02));
  const eye = HF.P(0, headY + L(0.01), L(0.085));
  const head = HF.P(0, headY, L(0.01));
  return { eye, head, top: headY + L(0.13), F };
}

export function chair(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), m = B.mat('wood', o.wood ?? '#a8784e'), seatY = o.seatY ?? 0.46;
  const cushion = B.mat('cloth', o.col ?? '#5b7fa6');
  const p = F.P(0, seatY - 0.02, 0);
  B.add(shape.box(id, m, p[0], p[1], p[2], 0.22, 0.02, 0.22, o.yaw, 0.01));
  const q = F.P(0, seatY + 0.015, 0.01);
  B.add(shape.box(id, cushion, q[0], q[1], q[2], 0.2, 0.017, 0.2, o.yaw, 0.012));
  for (const [u, w] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    const c = F.P(u, 0, w);
    B.add(shape.cyl(id, m, c[0], c[2], 0, seatY - 0.04, 0.02));
  }
  if (o.back !== false) {
    for (const u of [-0.19, 0.19]) { const c = F.P(u, 0, -0.2); B.add(shape.cyl(id, m, c[0], c[2], seatY, seatY + 0.42, 0.02)); }
    const b = F.P(0, seatY + 0.33, -0.2);
    B.add(shape.box(id, m, b[0], b[1], b[2], 0.2, 0.09, 0.015, o.yaw, 0.008));
  }
  return seatY;
}
export function stool(B, id, o) {
  const m = B.mat('wood', o.wood ?? '#b5875a'), h = o.h ?? 0.46;
  B.add(shape.cyl(id, m, o.x, o.z, h - 0.035, h, 0.18, 0.012));
  for (let i = 0; i < 4; i++) {
    const a = rad(45 + 90 * i), x = o.x + Math.sin(a) * 0.12, z = o.z + Math.cos(a) * 0.12;
    B.add(shape.capsule(id, m, x, 0.02, z, o.x + Math.sin(a) * 0.1, h - 0.04, o.z + Math.cos(a) * 0.1, 0.018));
  }
  return h;
}
export function table(B, id, o) {
  const m = B.mat('wood', o.wood ?? '#b07d4f'), top = o.top ?? 0.74, yaw = o.yaw ?? 0;
  const F = frame(o.x, o.z, yaw);
  const t = F.P(0, top - 0.02, 0);
  B.add(shape.box(id, m, t[0], t[1], t[2], o.hx, 0.02, o.hz, yaw, 0.012));
  for (const su of [-1, 1]) for (const sw of [-1, 1]) {
    const c = F.P(su * (o.hx - 0.06), 0, sw * (o.hz - 0.06));
    B.add(shape.box(id, m, c[0], (top - 0.04) / 2, c[2], 0.025, (top - 0.04) / 2, 0.025, yaw, 0.006));
  }
  return top;
}
export function roundTable(B, id, o) {
  const m = B.mat('wood', o.wood ?? '#b58a5c'), top = o.top ?? 0.74;
  B.add(shape.cyl(id, m, o.x, o.z, top - 0.035, top, o.r, 0.012));
  B.add(shape.cyl(id, m, o.x, o.z, 0.03, top - 0.035, 0.05));
  B.add(shape.cyl(id, m, o.x, o.z, 0, 0.03, o.r * 0.45, 0.01));
  return top;
}
export function floorLamp(B, id, o) {
  const metal = B.mat('metal', '#3d4249'), shade = B.mat('matte', o.col ?? '#efe2c4'), h = o.h ?? 1.5;
  B.add(shape.cyl(id, metal, o.x, o.z, 0, 0.025, 0.15, 0.01));
  B.add(shape.cyl(id, metal, o.x, o.z, 0.025, h - 0.2, 0.014));
  B.add(shape.frustum(id, shade, o.x, o.z, h - 0.28, h, 0.2, 0.13));
}
export function plant(B, id, o) {
  const pot = B.mat('matte', o.pot ?? '#c0714f'), soil = B.mat('matte', '#4a3a2c'), leaf = B.mat('plant', o.leaf ?? '#4e8f45');
  const s = o.scale ?? 1;
  B.add(shape.frustum(id, pot, o.x, o.z, 0, 0.3 * s, 0.13 * s, 0.17 * s));
  B.add(shape.cyl(id, soil, o.x, o.z, 0.27 * s, 0.29 * s, 0.15 * s));
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = rad(i * 360 / n + 17), r = (i % 2 ? 0.12 : 0.07) * s, y = (0.5 + 0.09 * (i % 3)) * s;
    const x = o.x + Math.sin(a) * r, z = o.z + Math.cos(a) * r;
    const F = frame(x, z, i * 360 / n + 17);
    B.add(shape.ellipsoid(id, leaf, x, y, z, 0.1 * s, 0.2 * s, 0.07 * s, F.M));
  }
  B.add(shape.ellipsoid(id, leaf, o.x, 0.66 * s, o.z, 0.09 * s, 0.17 * s, 0.09 * s, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
}
export function carton(B, id, o) {
  const k = B.matDef('carton', {
    c: cA('#c09466'), ks: 0.05, sh: 12,
    tex: (() => { const kraft = cA('#c09466'), tape = cA('#dcc39a'), dark = cA('#a47b50'); return (x, y, z, nx, ny, nz, s, out) => {
      const [u] = boxLocal(s, x, z);
      if (Math.abs(u) < 0.03 && (ny > 0.7 || s.cy + s.hy - y < 0.06)) { out[0] = tape[0]; out[1] = tape[1]; out[2] = tape[2]; return; }
      mixInto(out, kraft, dark, 0.35 * fbm(x * 14 + y * 3, z * 14 - y * 5, 2));
    }; })(),
  });
  const hx = o.hx ?? 0.25, hy = o.hy ?? 0.2, hz = o.hz ?? 0.2;
  B.add(shape.box(id, k, o.x, hy, o.z, hx, hy, hz, o.yaw ?? 0, 0.01));
}
export function ball(B, id, o) {
  const r = o.r ?? 0.16, c1 = cA(o.col ?? '#e04b3c'), c2 = cA('#f3efe6');
  const m = B.matDef(`ball:${o.col}`, { c: c1, ks: 0.4, sh: 50, env: 0.12,
    tex: (x, y, z, nx, ny, nz, s, out) => { const a = Math.atan2(nx, nz); const band = Math.floor((a / Math.PI + 1) * 3) % 2; const src = band ? c1 : c2; out[0] = src[0]; out[1] = src[1]; out[2] = src[2]; } });
  B.add(shape.sphere(id, m, o.x, r, o.z, r));
}
export function book(B, id, o) {
  const m = B.mat('paint', o.col), pages = B.mat('matte', '#efe6cf'), yaw = o.yaw ?? 0, y0 = o.y0 ?? 0;
  B.add(shape.box(id, m, o.x, y0 + o.h / 2, o.z, o.w / 2, o.h / 2, o.d / 2, yaw, 0.004));
  const F = frame(o.x, o.z, yaw);
  const p = F.P(0, y0 + o.h, 0);
  B.add(shape.box(id, pages, p[0], p[1] + 0.002, p[2], o.w / 2 - 0.004, 0.003, o.d / 2 - 0.006, yaw));
}
export function cup(B, id, o) {
  const col = cA(o.col), inner = col.map((v) => v * 0.3), y0 = o.y0 ?? 0, r = o.r ?? 0.04, h = o.h ?? 0.09;
  const m = B.matDef(`cup:${o.col}`, { c: col, ks: 0.45, sh: 60, env: 0.15,
    tex: (x, y, z, nx, ny, nz, s, out) => {
      const src = ny > 0.8 && Math.hypot(x - s.cx, z - s.cz) < s.r - 0.007 ? inner : col; out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
    } });
  B.add(shape.cyl(id, m, o.x, o.z, y0, y0 + h, r, 0.004));
  if (o.handle !== false) {
    const a = rad(o.handleYaw ?? 90), hx = Math.sin(a), hz = Math.cos(a);
    const mm = B.mat('gloss', o.col);
    const p0 = [o.x + hx * r, y0 + h * 0.78, o.z + hz * r], p1 = [o.x + hx * (r + 0.028), y0 + h * 0.68, o.z + hz * (r + 0.028)];
    const p2 = [o.x + hx * (r + 0.028), y0 + h * 0.32, o.z + hz * (r + 0.028)], p3 = [o.x + hx * r, y0 + h * 0.22, o.z + hz * r];
    B.add(shape.capsule(id, mm, ...p0, ...p1, 0.008));
    B.add(shape.capsule(id, mm, ...p1, ...p2, 0.008));
    B.add(shape.capsule(id, mm, ...p2, ...p3, 0.008));
  }
}
export function sofa(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), m = B.mat('cloth', o.col ?? '#a9674a'), feet = B.mat('wood', '#5a4030');
  const hw = o.hw ?? 0.85, yaw = o.yaw;
  const base = F.P(0, 0.26, 0); B.add(shape.box(id, m, base[0], base[1], base[2], hw, 0.16, 0.42, yaw, 0.05));
  const back = F.P(0, 0.6, -0.33); B.add(shape.box(id, m, back[0], back[1], back[2], hw, 0.24, 0.1, yaw, 0.06));
  for (const su of [-1, 1]) { const a = F.P(su * (hw - 0.09), 0.5, 0.0); B.add(shape.box(id, m, a[0], a[1], a[2], 0.09, 0.14, 0.42, yaw, 0.05)); }
  for (const su of [-1, 1]) for (const sw of [-1, 1]) { const c = F.P(su * (hw - 0.08), 0, sw * 0.34); B.add(shape.cyl(id, feet, c[0], c[2], 0, 0.1, 0.03)); }
}
export function bed(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), wood = B.mat('wood', '#9b6e47'), sheet = B.mat('cloth', o.col ?? '#6f86bf'), pil = B.mat('cloth', '#eef0f4');
  const yaw = o.yaw, hw = 0.75, hl = 1.0;
  const fr = F.P(0, 0.2, 0); B.add(shape.box(id, wood, fr[0], fr[1], fr[2], hw, 0.2, hl, yaw, 0.02));
  const mt = F.P(0, 0.46, 0.02); B.add(shape.box(id, sheet, mt[0], mt[1], mt[2], hw - 0.03, 0.08, hl - 0.04, yaw, 0.05));
  const hb = F.P(0, 0.55, -hl + 0.03); B.add(shape.box(id, wood, hb[0], hb[1], hb[2], hw, 0.55, 0.04, yaw, 0.02));
  for (const su of [-1, 1]) { const p = F.P(su * 0.35, 0.58, -hl + 0.25); B.add(shape.box(id, pil, p[0], p[1], p[2], 0.28, 0.06, 0.15, yaw, 0.05)); }
}
export function tvStand(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), wood = B.mat('wood', '#6f5340'), dark = B.mat('gloss', '#22262b'), screen = B.mat('gloss', '#3a4c62');
  const yaw = o.yaw;
  const c = F.P(0, 0.22, 0); B.add(shape.box(id, wood, c[0], c[1], c[2], 0.7, 0.22, 0.22, yaw, 0.015));
  const s = F.P(0, 0.75, 0); B.add(shape.box(id, dark, s[0], s[1], s[2], 0.6, 0.3, 0.03, yaw, 0.01));
  const g = F.P(0, 0.75, 0.031); B.add(shape.box(id, screen, g[0], g[1], g[2], 0.56, 0.27, 0.003, yaw));
  const n = F.P(0, 0.46, 0); B.add(shape.box(id, dark, n[0], n[1], n[2], 0.08, 0.03, 0.08, yaw));
}
export function shelf(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), m = B.mat('wood', o.col ?? '#3f8f97'), yaw = o.yaw, H = 1.6, hw = 0.4, hd = 0.17;
  for (const su of [-1, 1]) { const p = F.P(su * (hw - 0.015), H / 2, 0); B.add(shape.box(id, m, p[0], p[1], p[2], 0.015, H / 2, hd, yaw)); }
  const back = B.mat('wood', '#cdb08a');
  const bk = F.P(0, H / 2, -hd + 0.01); B.add(shape.box(id, back, bk[0], bk[1], bk[2], hw - 0.03, H / 2 - 0.02, 0.012, yaw));
  const tp = F.P(0, H - 0.015, 0); B.add(shape.box(id, m, tp[0], tp[1], tp[2], hw, 0.015, hd, yaw));
  const cols = ['#c8553d', '#3f7cc0', '#e0b23e', '#4f9a62', '#8a5ab0'];
  for (let k = 0; k < 5; k++) {
    const y = k * (H - 0.03) / 4 + 0.015, p = F.P(0, y, 0);
    B.add(shape.box(id, m, p[0], p[1], p[2], hw, 0.015, hd, yaw));
    if (k < 4) for (let j = 0; j < 4; j++) {
      const bh = 0.2 + 0.05 * ((j + k) % 3), q = F.P(-hw + 0.1 + j * 0.15, y + 0.015 + bh / 2, 0.02);
      B.add(shape.box(id, B.mat('paint', cols[(j + 2 * k) % 5]), q[0], q[1], q[2], 0.05, bh / 2, hd - 0.05, yaw));
    }
  }
}
export function tripodCamera(B, id, o) {
  const F = frame(o.x, o.z, o.yaw), metal = B.mat('metal', '#2b2f35'), body = B.mat('gloss', o.col ?? '#2f3640'), glass = B.mat('gloss', '#7fa7c9');
  const h = o.h ?? 1.25;
  for (let i = 0; i < 3; i++) {
    const a = rad(o.yaw + 60 + 120 * i), fx = o.x + Math.sin(a) * 0.32, fz = o.z + Math.cos(a) * 0.32;
    B.add(shape.capsule(id, metal, fx, 0.01, fz, o.x, h - 0.12, o.z, 0.013));
  }
  B.add(shape.cyl(id, metal, o.x, o.z, h - 0.14, h - 0.08, 0.035));
  const k = o.size ?? 1;
  const c = F.P(0, h, -0.03 * k); B.add(shape.box(id, body, c[0], c[1], c[2], 0.15 * k, 0.1 * k, 0.09 * k, o.yaw, 0.02 * k));
  const t = F.P(-0.06 * k, h + 0.12 * k, -0.03 * k); B.add(shape.box(id, body, t[0], t[1], t[2], 0.05 * k, 0.03 * k, 0.05 * k, o.yaw, 0.01));
  const a0 = F.P(0, h, 0.05 * k), a1 = F.P(0, h, 0.24 * k);
  B.add(shape.capsule(id, body, ...a0, ...a1, 0.07 * k));
  const g0 = F.P(0, h, 0.24 * k), g1 = F.P(0, h, 0.32 * k);
  B.add(shape.capsule(id, glass, ...g0, ...g1, 0.052 * k));
  return F.P(0, h, 0.32 * k);
}

const FLOOR_DARK = cA('#a3825f'), FLOOR_LIGHT = cA('#d6bb95');
const WALL = cA('#ece6db'), BASEBOARD = cA('#f7f4ee');
export function roomEnv({ wallZ, wallX, wallXDir, plank = 0.15, floorDark = FLOOR_DARK, floorLight = FLOOR_LIGHT, wall = WALL } = {}) {
  const PL = 1.1;
  const wallFn = (u, y, fp, out) => {
    const n = fbm(u * 5, y * 5, 3, fp);
    const src = y < 0.08 ? BASEBOARD : wall;
    const k = (y < 0.08 ? 1 : 0.97 + 0.05 * n) * (Math.abs(y - 0.08) < 0.004 ? 0.82 : 1);
    out[0] = src[0] * k; out[1] = src[1] * k; out[2] = src[2] * k;
  };
  return {
    floorY: 0,
    floor(x, z, fp, out) {
      const row = Math.floor(x / plank), off = hash2(row, 7) * PL;
      const seg = Math.floor((z + off) / PL), tone = hash2(row, seg);
      const g = fbm(x * 3 + row * 1.7, z * 0.9 + seg * 3.1, 3, fp);
      const grain = fbm(x * 40 + row * 3, z * 2.2, 2, fp * 18);
      mixInto(out, floorDark, floorLight, 0.25 + 0.4 * tone + 0.25 * g + 0.1 * grain);
      const seam = Math.max(lineMask(x, plank, 0.0035, fp), lineMask(z + off, PL, 0.003, fp) * 0.8);
      const k = 1 - 0.36 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    wallZ, wallX, wallXDir,
    wall: wallFn,
    wallSide: wallFn,
    sky(dx, dy, dz, out) {
      const t = Math.max(0, Math.min(1, dy * 1.4 + 0.45));
      out[0] = 0.55 + 0.3 * t; out[1] = 0.55 + 0.3 * t; out[2] = 0.55 + 0.32 * t;
    },
  };
}
export function plazaEnv() {
  const A = cA('#c9c4ba'), Bc = cA('#a9a399');
  return {
    floorY: 0,
    floor(x, z, fp, out) {
      const S = 0.6, ix = Math.floor(x / S), iz = Math.floor(z / S), tone = hash2(ix, iz);
      const g = fbm(x * 4, z * 4, 3, fp);
      mixInto(out, Bc, A, 0.45 + 0.3 * tone + 0.25 * g);
      const seam = Math.max(lineMask(x, S, 0.006, fp), lineMask(z, S, 0.006, fp));
      const k = 1 - 0.3 * seam; out[0] *= k; out[1] *= k; out[2] *= k;
    },
    sky(dx, dy, dz, out) {
      const t = Math.max(0, Math.min(1, dy * 2.2));
      out[0] = 0.78 - 0.33 * t; out[1] = 0.83 - 0.25 * t; out[2] = 0.88 - 0.08 * t;
    },
    fog: { d0: 7, d1: 22, col: [0.74, 0.78, 0.82], max: 0.85 },
  };
}
export const LIGHT = {
  dir: [-0.45, 1, 0.55], col: [1.18, 1.12, 1.03], soft: 0.05,
  sky: [0.46, 0.46, 0.48], ground: [0.22, 0.19, 0.16],
  fill: { dir: [0.8, 0.4, 0.5], col: [0.16, 0.16, 0.18] }, aoK: 1, contact: 0.28, contactH: 0.14,
};

export function orbitCam({ az, el, dist, fov, tx = 0, ty = 0, tz = 0, shiftY = 0 }, W, H) {
  const a = rad(az), e = rad(el);
  const eye = [tx + dist * Math.sin(a) * Math.cos(e), ty + dist * Math.sin(e), tz + dist * Math.cos(a) * Math.cos(e)];
  return makeCam({ eye, target: [tx, ty, tz], fovY: fov, W, H, shiftY });
}
export function sceneOf(B, cam, env, light = LIGHT) {
  return makeScene({ cam, shapes: B.shapes, mats: B.mats, env, light });
}
