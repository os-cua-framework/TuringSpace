import * as M from './_false_belief_keys_model.js';
const { RT, DEG, BOXN, ROOM } = M;

export const ID = { room: 1, sofa: 2, shelf: 3, furn: 4, decor: 5, box: (i) => 10 + i, anna: 100, bob: 101, keys: 102, lid: (i) => 110 + i };
export const isStatic = (id) => id >= 0 && id < 100;
const yawOf = (f) => Math.atan2(f[0], f[1]) / DEG;
const place = (cx, cz, f, a, b) => [cx + a * f[1] + b * f[0], cz - a * f[0] + b * f[1]];

const MATS = new WeakMap();
export function sceneMats(m) {
  let c = MATS.get(m);
  if (c) return c;
  const mats = [], at = (d) => { mats.push(d); return mats.length - 1; };
  const D = m.decor, lin = RT.lin;
  const M_ = {
    wall: at({ c: lin(D.wall), ks: 0.02, sh: 8 }),
    wallTop: at({ c: lin('#f6f4ee'), ks: 0.02, sh: 8 }),
    base: at({ c: lin('#f7f5ef'), ks: 0.05, sh: 12 }),
    sofa: at({ c: lin(m.sofa.color), ks: 0.04, sh: 8 }),
    sofaDark: at({ c: lin(m.sofa.color).map((v) => v * 0.8), ks: 0.04, sh: 8 }),
    cushion: at({ c: lin(m.sofa.color).map((v) => Math.min(1, v * 1.25 + 0.03)), ks: 0.04, sh: 8 }),
    shelfWood: at({ c: lin(m.shelf.wood), ks: 0.12, sh: 24 }),
    shelfBack: at({ c: lin(m.shelf.wood).map((v) => v * 0.7), ks: 0.04, sh: 8 }),
    wood: at({ c: lin(D.wood), ks: 0.14, sh: 26 }),
    woodDark: at({ c: lin(D.wood).map((v) => v * 0.7), ks: 0.1, sh: 20 }),
    white: at({ c: lin('#f1eee8'), ks: 0.1, sh: 20 }),
    leaf: at({ c: lin('#4c8a4a'), ks: 0.04, sh: 8 }),
    leaf2: at({ c: lin('#5f9f58'), ks: 0.04, sh: 8 }),
    pot: at({ c: lin('#b5624a'), ks: 0.08, sh: 14 }),
    lampMetal: at({ c: lin('#3a3d42'), ks: 0.4, sh: 40 }),
    shade: at({ c: lin('#efe3c6'), ks: 0.02, sh: 8 }),
    glass: at({ c: lin('#dbe9f4').map((v) => v * 1.9), ks: 0.0, sh: 8 }),
    frame: at({ c: lin('#efece4'), ks: 0.06, sh: 14 }),
    picA: at({ c: lin('#8aa9bd'), ks: 0.02, sh: 8 }),
    picB: at({ c: lin('#d4b283'), ks: 0.02, sh: 8 }),
    insideBox: at({ c: lin('#34302c'), ks: 0.0, sh: 4 }),
    phone: at({ c: lin('#1d2025'), ks: 0.35, sh: 50 }),
    screen: at({ c: lin('#bfe6ff').map((v) => v * 2.6), ks: 0.0, sh: 4 }),
    ring: at({ c: lin('#b9bcc2'), ks: 0.7, sh: 70 }),
    fob: at({ c: lin('#e0202a'), ks: 0.25, sh: 40 }),
    fobBand: at({ c: lin('#f5f5f2'), ks: 0.1, sh: 20 }),
    book: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at({ c: lin(['#a8433a', '#3f6a8c', '#d6b25a', '#4e7d5a', '#6b4e7a', '#d9d4c8', '#8a5a3a', '#2f4a5a'][i]), ks: 0.06, sh: 14 })),
    boxBody: m.boxes.map((b) => at({ c: lin(b.hex), ks: 0.12, sh: 24 })),
    boxLid: m.boxes.map((b) => at({ c: lin(b.hex).map((v) => Math.min(1, v * 1.18 + 0.05)), ks: 0.18, sh: 30 })),
    knob: at({ c: lin('#e8e4dc'), ks: 0.4, sh: 50 }),
  };
  const mk = (p) => ({
    skin: at({ c: lin(p.skin), ks: 0.06, sh: 14 }), hair: at({ c: lin(p.hair), ks: 0.08, sh: 16 }),
    top: at({ c: lin(p.top), ks: 0.04, sh: 8 }), bottom: at({ c: lin(p.bottom), ks: 0.04, sh: 8 }), shoe: at({ c: lin('#2a2624'), ks: 0.1, sh: 20 }),
  });
  const people = { anna: mk(m.anna), bob: mk(m.bob) };
  c = { mats, M: M_, people, env: groundEnv(m) };
  MATS.set(m, c);
  return c;
}
function groundEnv(m) {
  const D = m.decor, plank = RT.plankFloor({ base: D.wood, dark: shade(D.wood, 0.78), light: shade(D.wood, 1.14) });
  const out = RT.lin('#e4e8ed'), rug = RT.lin(D.rug), rugB = RT.lin(D.rug).map((v) => v * 0.7);
  const rx0 = Math.min(m.flip * -1.6, m.flip * 0.3), rx1 = Math.max(m.flip * -1.6, m.flip * 0.3), rz0 = m.anna.z - 1.05, rz1 = m.anna.z + 1.15;
  const floor = (x, z, fp, o) => {
    if (x < ROOM.x0 || x > ROOM.x1 || z < ROOM.z0 || z > ROOM.z1) { o[0] = out[0]; o[1] = out[1]; o[2] = out[2]; return; }
    plank(x, z, fp, o);
    if (x > rx0 && x < rx1 && z > rz0 && z < rz1) {
      const edge = Math.min(x - rx0, rx1 - x, z - rz0, rz1 - z), n = RT.fbm(x * 18, z * 18, 2, fp * 18);
      const k = edge < 0.07 ? 0.78 : 1;
      RT.mixInto(o, rug, rugB, 0.25 + 0.35 * n); o[0] *= k; o[1] *= k; o[2] *= k;
    }
  };
  return { floorY: 0, floor, floorMat: { ks: 0.02, sh: 8 }, sky: (dx, dy, dz, o) => { o[0] = 0.88; o[1] = 0.9; o[2] = 0.93; } };
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function lightOf(m, k) {
  const az = (m.cam.az0 + k * M.STEP_DEG + 38) * DEG, el = 54 * DEG;
  return {
    dir: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], col: [1.12, 1.06, 0.97], soft: 0.05,
    sky: [0.5, 0.52, 0.56], ground: [0.26, 0.24, 0.21], fill: { dir: [-Math.sin(az), 0.4, -Math.cos(az)], col: [0.1, 0.1, 0.12] },
    aoK: 0, contact: 0.3, contactH: 0.06,
  };
}

const hash = (a, b) => RT.hash2(a, b);
function boxAt(out, id, mat, cx, cy, cz, hx, hy, hz, yaw = 0, bev = 0.004) { out.push(RT.shape.box(id, mat, cx, cy, cz, hx, hy, hz, yaw, bev)); }
function lbox(out, id, mat, o, a, b, ha, hy, hb, y, bev = 0.004) {
  const p = place(o.cx, o.cz, o.f, a, b);
  boxAt(out, id, mat, p[0], y, p[1], ha, hy, hb, yawOf(o.f), bev);
}
const wallShapes = (m, k, C, out) => {
  const a = (m.cam.az0 + k * M.STEP_DEG) * DEG, dx = Math.sin(a), dz = Math.cos(a), th = 0.1, h = ROOM.h;
  const W = [
    { n: [0, 1], draw: dz > 0.3, c: [(ROOM.x0 + ROOM.x1) / 2, ROOM.z0 - th / 2], hx: (ROOM.x1 - ROOM.x0) / 2 + th, hz: th / 2, name: 'back' },
    { n: [0, -1], draw: -dz > 0.3, c: [(ROOM.x0 + ROOM.x1) / 2, ROOM.z1 + th / 2], hx: (ROOM.x1 - ROOM.x0) / 2 + th, hz: th / 2, name: 'front' },
    { n: [1, 0], draw: dx > 0.3, c: [ROOM.x0 - th / 2, (ROOM.z0 + ROOM.z1) / 2], hx: th / 2, hz: (ROOM.z1 - ROOM.z0) / 2 + th, name: 'left' },
    { n: [-1, 0], draw: -dx > 0.3, c: [ROOM.x1 + th / 2, (ROOM.z0 + ROOM.z1) / 2], hx: th / 2, hz: (ROOM.z1 - ROOM.z0) / 2 + th, name: 'right' },
  ];
  for (const w of W) {
    if (!w.draw) continue;
    boxAt(out, ID.room, C.M.wall, w.c[0], h / 2, w.c[1], w.hx, h / 2, w.hz, 0, 0.003);
    boxAt(out, ID.room, C.M.wallTop, w.c[0], h + 0.012, w.c[1], w.hx, 0.012, w.hz, 0, 0.002);
    const sx = w.n[0] ? w.c[0] + w.n[0] * (th / 2 + 0.012) : w.c[0], sz = w.n[1] ? w.c[1] + w.n[1] * (th / 2 + 0.012) : w.c[1];
    boxAt(out, ID.room, C.M.base, sx, 0.045, sz, w.n[0] ? 0.012 : w.hx, 0.045, w.n[1] ? 0.012 : w.hz, 0, 0.002);
  }
  const D = m.decor;
  if (W[0].draw) {
    const wx = D.winA, zf = ROOM.z0 + 0.004;
    boxAt(out, ID.decor, C.M.glass, wx, 1.45, zf + 0.004, 0.55, 0.62, 0.004, 0, 0.001);
    for (const [cx, cy, hx, hy] of [[wx, 2.1, 0.62, 0.035], [wx, 0.82, 0.62, 0.035], [wx - 0.59, 1.45, 0.035, 0.66], [wx + 0.59, 1.45, 0.035, 0.66], [wx, 1.45, 0.02, 0.62]]) boxAt(out, ID.decor, C.M.frame, cx, cy, zf + 0.02, hx, hy, 0.022, 0, 0.004);
    boxAt(out, ID.decor, C.M.frame, wx, 0.8, zf + 0.06, 0.7, 0.025, 0.07, 0, 0.004);
  }
  const lw = m.flip > 0 ? W[2] : W[3];
  if (lw.draw) {
    const sx = m.flip > 0 ? ROOM.x0 + 0.014 : ROOM.x1 - 0.014;
    D.pics.forEach((q, i) => {
      const zc = m.sofa.z + (i ? 0.62 : -0.62), hw = i ? 0.28 : 0.34, hh = i ? 0.36 : 0.26, cy = 1.55 + (i ? 0.05 : 0);
      boxAt(out, ID.decor, C.M.frame, sx, cy, zc, 0.016, hh + 0.03, hw + 0.03, 0, 0.004);
      boxAt(out, ID.decor, i ? C.M.picB : C.M.picA, sx - m.flip * -0.0, cy, zc, 0.02, hh, hw, 0, 0.002);
    });
  }
};
export function staticShapes(m, k) {
  const C = sceneMats(m), out = [], M_ = C.M;
  wallShapes(m, k, C, out);
  const S = { cx: m.sofa.x, cz: m.sofa.z, f: m.sofa.f };
  lbox(out, ID.sofa, M_.sofaDark, S, 0, 0, 0.88, 0.1, 0.43, 0.1, 0.01);
  lbox(out, ID.sofa, M_.sofa, S, 0, 0.06, 0.8, 0.09, 0.37, 0.3, 0.03);
  lbox(out, ID.sofa, M_.cushion, S, 0, 0.1, 0.74, 0.05, 0.3, 0.42, 0.03);
  lbox(out, ID.sofa, M_.sofa, S, 0, -0.34, 0.88, 0.34, 0.1, 0.64, 0.025);
  for (const s of [-1, 1]) {
    lbox(out, ID.sofa, M_.sofa, S, s * 0.79, 0, 0.09, 0.2, 0.43, 0.5, 0.03);
    lbox(out, ID.sofa, M_.cushion, S, s * 0.38, -0.2, 0.34, 0.2, 0.07, 0.67, 0.03);
  }
  const SH = { cx: m.shelf.x, cz: m.shelf.z, f: m.shelf.f }, w = m.shelf.w, d = m.shelf.d, hh = m.shelf.h;
  lbox(out, ID.shelf, M_.shelfWood, SH, -w / 2 + 0.02, 0, 0.02, hh / 2, d / 2, hh / 2, 0.004);
  lbox(out, ID.shelf, M_.shelfWood, SH, w / 2 - 0.02, 0, 0.02, hh / 2, d / 2, hh / 2, 0.004);
  lbox(out, ID.shelf, M_.shelfWood, SH, 0, 0, w / 2, 0.02, d / 2, hh - 0.02, 0.004);
  lbox(out, ID.shelf, M_.shelfWood, SH, 0, 0, w / 2, 0.03, d / 2, 0.06, 0.004);
  lbox(out, ID.shelf, M_.shelfBack, SH, 0, -d / 2 + 0.012, w / 2 - 0.04, hh / 2, 0.012, hh / 2, 0.002);
  const nSh = 5, gap = (hh - 0.1) / nSh;
  for (let s = 1; s < nSh; s++) lbox(out, ID.shelf, M_.shelfWood, SH, 0, 0, w / 2 + 0.008, 0.016, d / 2 - 0.02, 0.06 + s * gap, 0.003);
  for (let s = 0; s < nSh; s++) {
    const y0 = 0.08 + s * gap + 0.016;
    let a = -w / 2 + 0.06, i = 0;
    while (a < w / 2 - 0.1) {
      const bw = 0.025 + 0.03 * hash(m.decor.seed + s * 31, i), bh = (0.62 + 0.32 * hash(m.decor.seed + s * 17 + 5, i)) * (gap - 0.06), bd = d / 2 - 0.05;
      if (hash(m.decor.seed + s * 13, i + 40) > 0.12) {
        const mi = Math.floor(hash(m.decor.seed + s, i + 90) * 8);
        lbox(out, ID.shelf, M_.book[mi], SH, a + bw, 0.012, bw, bh / 2, bd, y0 + bh / 2, 0.002);
      }
      a += bw * 2 + 0.004; i++;
    }
  }
  const SB = { cx: m.sideboard.x, cz: m.sideboard.z, f: m.sideboard.f }, top = m.sideboard.top;
  lbox(out, ID.furn, M_.wood, SB, 0, 0, 0.85, 0.025, 0.21, top - 0.025, 0.006);
  lbox(out, ID.furn, M_.woodDark, SB, 0, 0, 0.82, (top - 0.1) / 2, 0.19, 0.1 + (top - 0.1) / 2 - 0.0, 0.004);
  for (const s of [-1, 1]) lbox(out, ID.furn, M_.wood, SB, s * 0.41, 0.2, 0.39, (top - 0.14) / 2 - 0.02, 0.012, 0.12 + (top - 0.14) / 2, 0.004);
  for (const s of [-1, 1]) lbox(out, ID.furn, M_.wood, SB, s * 0.78, 0.15, 0.03, 0.05, 0.03, 0.05, 0.004);
  m.supports.forEach((sp, i) => {
    const t = sp.top;
    if (sp.type === 'round') {
      out.push(RT.shape.cyl(ID.furn, M_.wood, sp.x, sp.z, t - 0.03, t, 0.27, 0.004));
      out.push(RT.shape.cyl(ID.furn, M_.woodDark, sp.x, sp.z, 0.03, t - 0.03, 0.04, 0.002));
      out.push(RT.shape.cyl(ID.furn, M_.wood, sp.x, sp.z, 0, 0.03, 0.2, 0.004));
    } else if (sp.type === 'square') {
      boxAt(out, ID.furn, M_.wood, sp.x, t - 0.02, sp.z, 0.24, 0.02, 0.24, 0, 0.004);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxAt(out, ID.furn, M_.woodDark, sp.x + sx * 0.2, (t - 0.04) / 2, sp.z + sz * 0.2, 0.025, (t - 0.04) / 2, 0.025, 0, 0.003);
    } else {
      out.push(RT.shape.cyl(ID.furn, M_.white, sp.x, sp.z, 0, t - 0.02, 0.25, 0.01));
      out.push(RT.shape.cyl(ID.furn, M_.wood, sp.x, sp.z, t - 0.02, t, 0.27, 0.004));
    }
  });
  const pl = m.plant;
  out.push(RT.shape.cyl(ID.furn, M_.pot, pl.x, pl.z, 0, 0.36, pl.r, 0.01));
  out.push(RT.shape.cyl(ID.furn, M_.woodDark, pl.x, pl.z, 0.36, pl.h * 0.62, 0.02, 0.002));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, rr = 0.1 + 0.22 * hash(m.decor.seed, i + 200), y = pl.h * (0.55 + 0.42 * hash(m.decor.seed, i + 300));
    out.push(RT.shape.ellipsoid(ID.furn, i % 2 ? M_.leaf : M_.leaf2, [pl.x + Math.cos(a) * rr, y, pl.z + Math.sin(a) * rr], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.17, 0.09, 0.17]));
  }
  const lp = m.lamp;
  out.push(RT.shape.cyl(ID.furn, M_.lampMetal, lp.x, lp.z, 0, 0.025, lp.r, 0.004));
  out.push(RT.shape.cyl(ID.furn, M_.lampMetal, lp.x, lp.z, 0.025, lp.h - 0.25, 0.012, 0.001));
  out.push(RT.shape.frustum(ID.furn, M_.shade, lp.x, lp.z, lp.h - 0.3, lp.h, 0.2, 0.13));
  m.boxes.forEach((b, i) => {
    const o = { cx: b.x, cz: b.z, f: b.f }, id = ID.box(i), mb = M_.boxBody[i], th = 0.014, y0 = b.y;
    lbox(out, id, mb, o, 0, 0, b.w / 2, th / 2, b.d / 2, y0 + th / 2, 0.003);
    lbox(out, id, M_.insideBox, o, 0, 0, b.w / 2 - th, 0.004, b.d / 2 - th, y0 + th + 0.004, 0.001);
    lbox(out, id, mb, o, 0, b.d / 2 - th / 2, b.w / 2, b.h / 2, th / 2, y0 + b.h / 2, 0.003);
    lbox(out, id, mb, o, 0, -b.d / 2 + th / 2, b.w / 2, b.h / 2, th / 2, y0 + b.h / 2, 0.003);
    for (const s of [-1, 1]) lbox(out, id, mb, o, s * (b.w / 2 - th / 2), 0, th / 2, b.h / 2, b.d / 2, y0 + b.h / 2, 0.003);
  });
  for (const q of out) q.noAO = true;
  return out;
}
const STATICS = new WeakMap();
export function staticCache(m, k) {
  let c = STATICS.get(m); if (!c) { c = new Map(); STATICS.set(m, c); }
  const kk = ((k % M.NPOSE) + M.NPOSE) % M.NPOSE;
  if (!c.has(kk)) c.set(kk, staticShapes(m, kk));
  return c.get(kk);
}

export function personShapes(out, id, J, mats, longHair) {
  const S = RT.shape, k = J.k, f = J.f, n0 = out.length;
  const ax = RT.frame(J.tor, f);
  for (const L of J.legs) {
    out.push(S.capsule(id, mats.bottom, L.hip, L.knee, 0.07 * k));
    out.push(S.capsule(id, mats.bottom, L.knee, L.ankle, 0.055 * k));
    const fa = RT.frame([0, 1, 0], f);
    out.push(S.ellipsoid(id, mats.shoe, [L.ankle[0] + f[0] * 0.045 * k, L.ankle[1] - 0.045 * k, L.ankle[2] + f[2] * 0.045 * k], fa, [0.052 * k, 0.044 * k, 0.128 * k]));
  }
  const T = (d) => M.add3(J.pelvis, J.tor, d * k);
  out.push(S.ellipsoid(id, mats.bottom, J.pelvis, ax, [0.168 * k, 0.118 * k, 0.112 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.16), ax, [0.155 * k, 0.175 * k, 0.102 * k]));
  out.push(S.ellipsoid(id, mats.top, T(0.36), ax, [0.185 * k, 0.195 * k, 0.115 * k]));
  out.push(S.capsule(id, mats.top, M.add3(T(0.44), J.r, -0.13 * k), M.add3(T(0.44), J.r, 0.13 * k), 0.066 * k));
  for (const A of J.arms) {
    out.push(S.capsule(id, mats.top, A.sh, A.el, 0.05 * k));
    out.push(S.capsule(id, mats.skin, A.el, A.hand, 0.039 * k));
    const d = M.sub3(A.hand, A.el);
    out.push(S.ellipsoid(id, mats.skin, M.add3(A.hand, d, 0.16), RT.frame(d, f), [0.028 * k, 0.055 * k, 0.04 * k]));
  }
  out.push(S.capsule(id, mats.skin, J.neck0, J.neck1, 0.05 * k));
  const hax = RT.frame(J.headU, J.headF), hc = J.hc;
  const hp = (fw, u, sd = 0) => M.add3(M.add3(M.add3(hc, J.headF, fw * k), J.headU, u * k), J.r, sd * k);
  out.push(S.ellipsoid(id, mats.skin, hc, hax, [0.082 * k, 0.11 * k, 0.098 * k]));
  out.push(S.ellipsoid(id, mats.hair, hp(-0.032, 0.028), hax, [0.088 * k, 0.102 * k, 0.094 * k]));
  if (longHair) out.push(S.ellipsoid(id, mats.hair, hp(-0.07, -0.08), hax, [0.085 * k, 0.14 * k, 0.055 * k]));
  out.push(S.ellipsoid(id, mats.skin, hp(0.1, -0.012), hax, [0.017 * k, 0.026 * k, 0.026 * k]));
  for (const s of [-1, 1]) out.push(S.ellipsoid(id, mats.skin, hp(-0.002, -0.005, s * 0.082), hax, [0.013 * k, 0.027 * k, 0.019 * k]));
  for (let i = n0; i < out.length; i++) out[i].noAO = true;
}
export function keyShapes(out, mats, p, lying) {
  const S = RT.shape, id = ID.keys;
  if (lying) {
    const ax = [[0.7, 0, -0.7], [0, 1, 0], [0.7, 0, 0.7]], c = M.add3(p, [0, 0.012, 0]);
    out.push(S.obox(id, mats.fob, c, ax, [0.05, 0.011, 0.075], 0.004));
    out.push(S.obox(id, mats.fobBand, M.add3(c, [0, 0.011, 0]), ax, [0.051, 0.0018, 0.015], 0.001));
    out.push(S.sphere(id, mats.ring, c[0] + 0.7 * 0.07, c[1] + 0.004, c[2] + 0.7 * 0.07, 0.019));
    for (const s of [-1, 1]) out.push(S.obox(id, mats.ring, [c[0] + 0.7 * 0.1 + s * 0.7 * 0.03, c[1] + 0.004, c[2] + 0.7 * 0.1 - s * 0.7 * 0.03], ax, [0.011, 0.004, 0.045], 0.001));
    return;
  }
  const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], c = M.add3(p, [0, -0.1, 0.02]);
  out.push(S.obox(id, mats.fob, c, ax, [0.05, 0.075, 0.011], 0.004));
  out.push(S.obox(id, mats.fobBand, M.add3(c, [0, 0, 0.0115]), ax, [0.051, 0.015, 0.0018], 0.001));
  const top = M.add3(c, [0, 0.085, 0]);
  out.push(S.sphere(id, mats.ring, top[0], top[1], top[2], 0.02));
  for (const s of [-1, 1]) out.push(S.obox(id, mats.ring, [top[0] + s * 0.032, top[1] + 0.02, top[2]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.004, 0.045, 0.011], 0.001));
}
export function phoneShapes(out, mats, c, J) {
  const S = RT.shape, id = ID.anna, f = J.f, al = 25 * DEG;
  const a = M.add3(f.map((q) => q * Math.cos(al)), [0, 1, 0], Math.sin(al)), n = M.add3([0, Math.cos(al), 0], f, -Math.sin(al));
  const ax = [J.r, n, a];
  out.push(S.obox(id, mats.phone, c, ax, [0.05, 0.007, 0.095], 0.003));
  out.push(S.obox(id, mats.screen, M.add3(c, n, 0.0075), ax, [0.045, 0.0014, 0.088], 0.0005));
}

export function sceneAt(m, k, tau, opts = {}) {
  const C = sceneMats(m), shapes = staticCache(m, k).slice(), parts = [];
  const add = (id, list, floorY = 0) => { const n0 = shapes.length; for (const s of list) shapes.push(s); parts.push({ id, from: n0, to: shapes.length, floorY }); };
  let aJ, aLids, aKeys = null, aPhone = null;
  if (opts.epi) { const e = M.annaEpi(m, opts.epi.u, opts.epi.found); aJ = e.J; aLids = e.lids; aKeys = e.keys; }
  else { const a = M.annaAt(m, tau); aJ = a.J; aLids = null; aPhone = a.phoneAt; }
  const bob = M.bobAt(m, opts.epi ? m.T : tau);
  const aList = [];
  personShapes(aList, ID.anna, aJ, C.people.anna, true);
  if (aPhone) phoneShapes(aList, C.M, aPhone, aJ);
  add(ID.anna, aList);
  const bList = [];
  personShapes(bList, ID.bob, bob.J, C.people.bob, false);
  add(ID.bob, bList);
  const kList = [];
  const lids = bob.lids.slice();
  let kp = null;
  const keyAt = (where) => {
    if (where.where === 'hand') return { p: bob.J.arms[1].hand, lying: false };
    const b = m.boxes[where.box];
    return { p: [b.x, b.y + 0.02, b.z], lying: true, box: where.box };
  };
  if (opts.epi) {
    for (let i = 0; i < m.boxes.length; i++) lids[i] = aLids[i];
    if (aKeys) {
      if (aKeys.where === 'hand') kp = { p: aJ.arms[1].hand, lying: false };
      else kp = { p: [m.boxes[aKeys.box].x, m.boxes[aKeys.box].y + 0.02, m.boxes[aKeys.box].z], lying: true, box: aKeys.box };
    }
  } else if (bob.keys) kp = keyAt(bob.keys);
  if (kp && kp.lying && !(lids[kp.box] > 0.35)) kp = null;
  if (kp) { keyShapes(kList, C.M, kp.p, kp.lying); add(ID.keys, kList, kp.lying ? m.boxes[kp.box].y : 0); }
  for (let i = 0; i < m.boxes.length; i++) {
    const b = m.boxes[i], lf = M.lidFrame(b, lids[i] || 0), l = [];
    l.push(RT.shape.obox(ID.lid(i), C.M.boxLid[i], lf.centre, lf.ax, lf.half, 0.004));
    const g = M.boxGeom(b);
    const kn = M.add3(M.add3(lf.centre, lf.ax[2], lf.half[2] * 0.72), lf.ax[1], lf.half[1] + 0.008);
    l.push(RT.shape.sphere(ID.lid(i), C.M.knob, kn[0], kn[1], kn[2], 0.015));
    void g;
    for (const q of l) q.noAO = true;
    add(ID.lid(i), l, b.y);
  }
  const sc = RT.makeScene({ cam: M.camOf(m, k), shapes, mats: C.mats, light: lightOf(m, k), env: C.env, exposure: 1.0 });
  sc.parts = parts;
  return sc;
}
export function staticScene(m, k) {
  const C = sceneMats(m);
  const sc = RT.makeScene({ cam: M.camOf(m, k), shapes: staticCache(m, k).slice(), mats: C.mats, light: lightOf(m, k), env: C.env, exposure: 1.0 });
  sc.parts = [];
  return sc;
}
export function partRect(sc, part, m, k) {
  const cam = M.camOf(m, k), L = sc.Ld;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pt = (x, y, z) => { const q = cam.project(x, y, z); if (!(q.z > 0.1)) return; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
  for (let i = part.from; i < part.to; i++) {
    const b = sc.opaque[i].bb;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? b[3] : b[0], y = c & 2 ? b[4] : b[1], z = c & 4 ? b[5] : b[2];
      pt(x, y, z);
      if (L[1] > 0.2 && y > part.floorY) { const t = (y - part.floorY) / L[1]; pt(x - L[0] * t, part.floorY, z - L[2] * t); }
    }
  }
  return [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
}

export function renderFrame(m, k, tau, opts, q, cache, fast = true) {
  const kk = ((k % M.NPOSE) + M.NPOSE) % M.NPOSE, ss = q >= 1.5 ? 1 : (q > 1 ? 2 : 1), key = kk + '|' + q;
  let bg = cache.bg.get(key);
  if (!bg) { const t0 = now(); bg = RT.render(staticScene(m, kk), q, ss); cache.bg.set(key, bg); cache.bgMs = Math.round(now() - t0); }
  const t0 = now(), sc = sceneAt(m, kk, tau, opts);
  const data = new Uint8ClampedArray(bg.data), W = bg.w;
  const pids = new Set(sc.parts.map((p) => p.id));
  let rects = [];
  for (const part of sc.parts) {
    const b = partRect(sc, part, m, kk);
    const r = [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(M.VIEW.w, Math.ceil(b[2])), Math.min(M.VIEW.h, Math.ceil(b[3]))];
    if (r[2] > r[0] && r[3] > r[1]) rects.push(r);
  }
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
      const A = rects[a], B = rects[b];
      if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) { rects[a] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]; rects.splice(b, 1); merged = true; break outer; }
    }
  }
  sc.fast = fast && q === 1;
  let traced = 0;
  for (const r of rects) {
    const patch = RT.renderPatch(sc, bg, { x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1] }, pids, q, ss, sc.fast);
    traced += patch.traced;
    const px = Math.round(patch.x * q), py = Math.round(patch.y * q);
    for (let y = 0; y < patch.h; y++) data.set(patch.data.subarray(y * patch.w * 4, (y + 1) * patch.w * 4), ((py + y) * W + px) * 4);
  }
  cache.ms = cache.ms || []; cache.ms.push([q, Math.round(now() - t0)]); if (cache.ms.length > 400) cache.ms.shift();
  return { data, w: bg.w, h: bg.h, q, traced, rects };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
