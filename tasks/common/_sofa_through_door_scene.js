import * as RT from './_sofa_through_door_rt.js';
import * as G from './_sofa_through_door_geom.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const H_WALL = 0.6;
export const Y_GRAB = 0.45;
export const FABRICS = ['#5d7287', '#c39a45', '#7d977a', '#b0654a', '#5a5d64', '#3f7d86'];
const OUT = RT.lin('#c9c7c2'), OUT2 = RT.lin('#bebcb6');
const SILL = RT.lin('#cfcac2'), SILL2 = RT.lin('#bdb7ad');

export function camera(m, W, H) {
  const c = m.cam;
  return RT.orbitCam({ az: 0, el: c.el, dist: c.dist, fov: c.fov, tx: c.tx, ty: 0, tz: c.tz, shiftY: c.shiftY }, W, H);
}

export function fitCamera(bbox, W, H, margin = 12, el = 60, fov = 30) {
  const [x0, z0, x1, z1] = bbox;
  let tx = (x0 + x1) / 2, tz = (z0 + z1) / 2, shiftY = 0, dist = 20;
  const ext = (cam) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, H_WALL]) {
      const p = cam.project(x, y, z); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y);
    }
    return { a, b, c, d };
  };
  const mk = (ds) => RT.orbitCam({ az: 0, el, dist: ds, fov, tx, ty: 0, tz, shiftY }, W, H);
  for (let it = 0; it < 4; it++) {
    let lo = 2, hi = 80;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2, e = ext(mk(mid));
      if (e.b - e.a <= W - 2 * margin && e.d - e.c <= H - 2 * margin) hi = mid; else lo = mid;
    }
    dist = hi;
    const cam = mk(dist), e = ext(cam);
    const pxPerM = (cam.project(tx + 1, 0, tz).x - cam.project(tx, 0, tz).x);
    tx += ((e.a + e.b) / 2 - W / 2) / pxPerM;
    shiftY -= (e.c + e.d) / 2 - H / 2;
  }
  const r = (v) => +v.toFixed(4);
  return { el, fov, dist: r(dist), tx: r(tx), tz: r(tz), shiftY: r(shiftY) };
}

function fabricTex(hex) {
  const B = RT.lin(hex);
  const D = B.map((v) => v * 0.78), Lg = B.map((v) => Math.min(1, v * 1.12));
  return (x, y, z, nx, ny, nz, s, out) => {
    const n = RT.fbm(x * 38 + z * 11, y * 38 - z * 7, 2);
    RT.mixInto(out, D, Lg, 0.35 + 0.4 * n);
  };
}
function woodTex(light, dark) {
  const L = RT.lin(light), D = RT.lin(dark);
  return (x, y, z, nx, ny, nz, s, out) => { const g = RT.fbm(x * 9 + z * 3, y * 40, 3); RT.mixInto(out, D, L, 0.3 + 0.5 * g); };
}
function wallTex() {
  const SIDE = RT.lin('#ece7de'), TOP = RT.lin('#f7f4ee'), SK = RT.lin('#f4f1ea');
  return (x, y, z, nx, ny, nz, s, out) => {
    if (ny > 0.7) { const n = RT.fbm(x * 6, z * 6, 2); out[0] = TOP[0] * (0.98 + 0.03 * n); out[1] = TOP[1] * (0.98 + 0.03 * n); out[2] = TOP[2] * (0.98 + 0.03 * n); return; }
    const src = y < 0.07 ? SK : SIDE, k = Math.abs(y - 0.07) < 0.005 ? 0.85 : 1;
    out[0] = src[0] * k; out[1] = src[1] * k; out[2] = src[2] * k;
  };
}
export function materials(m) {
  return [
    { c: RT.lin('#ece7de'), ks: 0.02, sh: 6, tex: wallTex() },
    { c: RT.lin(m.style.fabric), ks: 0.03, sh: 8, tex: fabricTex(m.style.fabric) },
    { c: RT.lin('#3b2a1f'), ks: 0.1, sh: 20 },
    { c: RT.lin('#a07650'), ks: 0.08, sh: 18, tex: woodTex('#b4875c', '#8a6040') },
    { c: RT.lin('#f3f1ec'), ks: 0.03, sh: 8 },
    { c: RT.lin(m.style.duvet), ks: 0.02, sh: 6, tex: fabricTex(m.style.duvet) },
    { c: RT.lin('#c9b9a4'), ks: 0.06, sh: 14 },
    { c: RT.lin('#4f7a43'), ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 30, z * 30 + y * 20, 2); RT.mixInto(out, RT.lin('#3b6234'), RT.lin('#6b9a55'), n); } },
    { c: RT.lin('#efe4cf'), ks: 0.02, sh: 6 },
    { c: RT.lin('#8a8f96'), ks: 0.03, sh: 8, tex: fabricTex('#8a8f96') },
  ];
}

export function floorFn(m, dyn) {
  const CARPET = [RT.lin(m.style.carpet[0]), RT.lin(m.style.carpet[1])];
  const oak = RT.plankFloor({ plank: 0.13, plankL: 1.15, base: m.style.wood[0], dark: m.style.wood[1], light: m.style.wood[2] });
  const rugs = m.rugs.map((r) => ({ ...r, A: RT.lin(r.c1), B: RT.lin(r.c2) }));
  const doors = m.floors.filter((f) => f.kind === 'door');
  const inside = m.floors;
  return (x, z, fp, out) => {
    let hit = null;
    for (const f of inside) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) { hit = f; break; }
    if (!hit) { const n = RT.fbm(x * 2.5, z * 2.5, 3, fp); RT.mixInto(out, OUT2, OUT, 0.3 + 0.6 * n); return; }
    if (hit.kind === 'bedroom') {
      const n = RT.fbm(x * 30, z * 30, 3, fp), n2 = RT.fbm(x * 4, z * 4, 2, fp);
      RT.mixInto(out, CARPET[0], CARPET[1], 0.25 + 0.45 * n + 0.2 * n2);
    } else oak(x, z, fp, out);
    for (const d of doors) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) { const n = RT.fbm(x * 9, z * 9, 2, fp); RT.mixInto(out, SILL, SILL2, 0.4 + 0.4 * n); }
    for (const r of rugs) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const e = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
      const n = RT.fbm(x * 22, z * 22, 2, fp);
      const band = e > 0.1 && e < 0.17;
      const base = band ? r.B : r.A;
      out[0] = base[0] * (0.92 + 0.12 * n); out[1] = base[1] * (0.92 + 0.12 * n); out[2] = base[2] * (0.92 + 0.12 * n);
      if (e < 0.012) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; }
    }
    const s = dyn && dyn.sofa;
    if (s) {
      const A = G.axes(s.a), dx = x - s.x, dz = z - s.z;
      const lu = Math.abs(dx * A.ux + dz * A.uz) - m.sofa.L / 2, ln = Math.abs(dx * A.nx + dz * A.nz) - m.sofa.W / 2;
      const d = Math.hypot(Math.max(lu, 0), Math.max(ln, 0)) + Math.min(Math.max(lu, ln), 0);
      if (d < 0.16) { const k = 1 - 0.38 * Math.exp(-Math.max(0, d) / 0.05); out[0] *= k; out[1] *= k; out[2] *= k; }
    }
  };
}

let NEXT = 0;
function staticShapes(m) {
  const S = RT.shape, out = [];
  let id = 100;
  for (const w of m.walls) {
    out.push(S.box(id++, 0, (w[0] + w[2]) / 2, H_WALL / 2, (w[1] + w[3]) / 2, (w[2] - w[0]) / 2, H_WALL / 2, (w[3] - w[1]) / 2, 0, 0.004));
  }
  for (const f of m.furniture) {
    const [x0, z0, x1, z1] = f.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    const fid = id++;
    if (f.kind === 'bed') {
      const hv = [Math.round(f.head[0]), Math.round(f.head[1])];
      const along = hv[0] !== 0 ? hx : hz, across = hv[0] !== 0 ? hz : hx;
      const P = (s, t) => [cx + hv[0] * s + (hv[0] === 0 ? t : 0), cz + hv[1] * s + (hv[1] === 0 ? t : 0)];
      const box = (mat, s0, s1, t0, t1, y0, y1, bev = 0.02) => {
        const [ax, az] = P((s0 + s1) / 2, (t0 + t1) / 2), hs = (s1 - s0) / 2, ht = (t1 - t0) / 2;
        out.push(S.box(fid, mat, ax, (y0 + y1) / 2, az, hv[0] !== 0 ? hs : ht, (y1 - y0) / 2, hv[0] !== 0 ? ht : hs, 0, bev));
      };
      box(3, -along, along, -across, across, 0.05, 0.3, 0.02);
      box(3, along - 0.07, along, -across, across, 0.05, 0.95, 0.025);
      box(4, -along + 0.04, along - 0.08, -across + 0.04, across - 0.04, 0.3, 0.5, 0.06);
      box(5, -along + 0.02, along * 0.25, -across + 0.02, across - 0.02, 0.45, 0.56, 0.06);
      const pw = across * 0.8;
      box(4, along - 0.5, along - 0.12, -across + 0.1, -across + 0.1 + pw, 0.5, 0.62, 0.07);
      box(4, along - 0.5, along - 0.12, across - 0.1 - pw, across - 0.1, 0.5, 0.62, 0.07);
    } else if (f.kind === 'stand') {
      out.push(S.box(fid, 3, cx, 0.26, cz, hx, 0.26, hz, 0, 0.015));
      out.push(S.cyl(fid, 6, cx, cz, 0.52, 0.66, 0.04, 0.01));
      out.push(S.frustum(fid, 8, cx, cz, 0.62, 0.8, 0.13, 0.09));
    } else if (['lamp', 'sidetable', 'stool', 'basket', 'vase', 'pouf', 'bin', 'speaker', 'umbrella'].includes(f.kind)) {
      const r = Math.min(hx, hz);
      if (f.kind === 'lamp') { out.push(S.cyl(fid, 2, cx, cz, 0, 0.04, r * 0.6, 0.01)); out.push(S.cyl(fid, 2, cx, cz, 0.04, 0.95, 0.02, 0)); out.push(S.frustum(fid, 8, cx, cz, 0.8, 1.05, r * 0.75, r * 0.5)); }
      else if (f.kind === 'sidetable') { out.push(S.box(fid, 3, cx, 0.5, cz, hx * 0.95, 0.025, hz * 0.95, 0, 0.01)); for (const a of [-1, 1]) for (const b of [-1, 1]) out.push(S.box(fid, 2, cx + a * hx * 0.75, 0.24, cz + b * hz * 0.75, 0.02, 0.24, 0.02, 0, 0)); out.push(S.cyl(fid, 6, cx, cz, 0.525, 0.68, 0.06, 0.01)); }
      else if (f.kind === 'stool') { out.push(S.cyl(fid, 9, cx, cz, 0.38, 0.46, r * 0.85, 0.02)); for (let k = 0; k < 3; k++) { const a = k * 2.094; out.push(S.cyl(fid, 3, cx + Math.cos(a) * r * 0.55, cz + Math.sin(a) * r * 0.55, 0, 0.38, 0.025, 0)); } }
      else if (f.kind === 'vase') { out.push(S.frustum(fid, 6, cx, cz, 0, 0.5, r * 0.55, r * 0.75)); out.push(S.frustum(fid, 6, cx, cz, 0.5, 0.7, r * 0.75, r * 0.35)); for (const [ox, oz] of [[0.04, 0], [-0.03, 0.03], [0, -0.04]]) out.push(S.cyl(fid, 2, cx + ox, cz + oz, 0.7, 1.0, 0.008, 0)); }
      else if (f.kind === 'pouf') { out.push(S.cyl(fid, 9, cx, cz, 0, 0.36, r * 0.92, 0.06)); }
      else if (f.kind === 'speaker') { out.push(S.box(fid, 2, cx, 0.45, cz, hx * 0.7, 0.45, hz * 0.7, 0, 0.01)); out.push(S.cyl(fid, 8, cx, cz, 0.9, 0.905, r * 0.4, 0)); }
      else if (f.kind === 'umbrella') { out.push(S.cyl(fid, 6, cx, cz, 0, 0.5, r * 0.55, 0.01)); for (const a of [0, 2.1, 4.2]) out.push(S.cyl(fid, 9, cx + Math.cos(a) * r * 0.25, cz + Math.sin(a) * r * 0.25, 0.4, 0.92, 0.025, 0)); }
      else if (f.kind === 'bin') { out.push(S.cyl(fid, 2, cx, cz, 0, 0.45, r * 0.7, 0.01)); }
      else { out.push(S.frustum(fid, 6, cx, cz, 0, 0.42, r * 0.8, r * 0.95)); }
    } else if (f.kind === 'plant') {
      const r = Math.min(hx, hz);
      out.push(S.frustum(fid, 6, cx, cz, 0, 0.36, r * 0.72, r * 0.95));
      const lid = id++;
      for (const [ox, oy, oz, rr] of [[0, 0.62, 0, 0.26], [0.13, 0.5, 0.08, 0.2], [-0.12, 0.52, -0.06, 0.21], [0.02, 0.48, -0.15, 0.18], [-0.06, 0.78, 0.07, 0.17]]) {
        out.push(S.sphere(lid, 7, cx + ox * r / 0.21, oy, cz + oz * r / 0.21, rr * r / 0.21));
      }
    }
  }
  return out;
}

export function sofaShapes(m, pose, id0 = 1) {
  const S = RT.shape, { L, W } = m.sofa, A = G.axes(pose.a), out = [];
  const at = (s, t) => [pose.x + s * A.ux + t * A.nx, pose.z + s * A.uz + t * A.nz];
  const box = (mat, s0, s1, t0, t1, y0, y1, bev) => {
    const [cx, cz] = at((s0 + s1) / 2, (t0 + t1) / 2);
    const s = S.box(id0, mat, cx, (y0 + y1) / 2, cz, (s1 - s0) / 2, (y1 - y0) / 2, (t1 - t0) / 2, pose.a, bev);
    s.noAO = true; out.push(s);
  };
  const hl = L / 2, hw = W / 2, arm = 0.17, back = 0.19;
  for (const sx of [-1, 1]) for (const tz of [-1, 1]) box(2, sx * (hl - 0.1) - 0.025, sx * (hl - 0.1) + 0.025, tz * (hw - 0.09) - 0.025, tz * (hw - 0.09) + 0.025, 0, 0.09, 0.005);
  box(1, -hl + 0.02, hl - 0.02, -hw + 0.02, hw - 0.02, 0.08, 0.3, 0.035);
  box(1, -hl, -hl + arm, -hw, hw, 0.08, 0.6, 0.05);
  box(1, hl - arm, hl, -hw, hw, 0.08, 0.6, 0.05);
  box(1, -hl + arm - 0.01, hl - arm + 0.01, -hw, -hw + back, 0.28, 0.8, 0.06);
  const n = L > 2.02 ? 3 : 2, span = (L - 2 * arm) / n;
  for (let i = 0; i < n; i++) {
    const s0 = -hl + arm + i * span + 0.008, s1 = s0 + span - 0.016;
    box(1, s0, s1, -hw + back - 0.01, hw - 0.01, 0.29, 0.45, 0.05);
    box(1, s0 + 0.01, s1 - 0.01, -hw + back - 0.005, -hw + back + 0.15, 0.43, 0.74, 0.06);
  }
  return out;
}

export function light() {
  return { ...RT.STUDIO_LIGHT, dir: [-0.42, 1.25, -0.32], soft: 0.06, contact: 0.2, contactH: 0.1 };
}

export function makeStaticScene(m, cam, look = null) {
  if (look) return styledScene(m, cam, null, null, look);
  const dyn = { sofa: null };
  const sc = RT.makeScene({ cam, shapes: staticShapes(m), mats: materials(m), light: light(), env: { floorY: 0, floor: floorFn(m, dyn), sky: RT.softSky } });
  sc.exposure = 1.05;
  return sc;
}
export function makeFullScene(m, cam, pose, statics, look = null) {
  if (look) return styledScene(m, cam, pose, statics, look);
  const dyn = { sofa: pose };
  const shapes = (statics || staticShapes(m)).concat(sofaShapes(m, pose));
  const sc = RT.makeScene({ cam, shapes, mats: materials(m), light: light(), env: { floorY: 0, floor: floorFn(m, dyn), sky: RT.softSky } });
  sc.exposure = 1.05;
  return sc;
}
export { staticShapes };

export function sofaRect(m, cam, pose, pad = 3) {
  const lt = light().dir, ly = lt[1], sx = -lt[0] / ly, sz = -lt[2] / ly;
  const cs = G.corners({ sofa: { L: m.sofa.L + 0.36, W: m.sofa.W + 0.36 } }, pose.x, pose.z, pose.a);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [cx, cz] of cs) for (const h of [0, 0.85]) {
    for (const [px, pz] of [[cx, cz], [cx + sx * h, cz + sz * h]]) {
      const p = cam.project(px, h, pz), q = cam.project(px, 0, pz);
      x0 = Math.min(x0, p.x, q.x); x1 = Math.max(x1, p.x, q.x); y0 = Math.min(y0, p.y, q.y); y1 = Math.max(y1, p.y, q.y);
    }
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

const FLOORS = ['planks', 'parquet', 'tiles', 'concrete'];
const WALLS = ['plaster', 'brick', 'panel', 'concrete'];
const OUTS = ['lawn', 'gravel', 'paving', 'deck'];
const SOFA_COLS = [['slate-blue', '#5d7287'], ['mustard', '#c39a45'], ['sage', '#7d977a'], ['rust', '#b0654a'], ['charcoal', '#5a5d64'], ['teal', '#3f7d86'],
  ['navy', '#34466a'], ['olive', '#77784a'], ['plum', '#6e4a66'], ['camel', '#b08a5e'], ['forest', '#3d5e47'], ['dove', '#9a9ca0'], ['ochre', '#c08a3a'], ['denim', '#4f6f93']];
const PLASTER = [['white', '#ece7de'], ['stone', '#e6e2d6'], ['mint', '#dfe6e2'], ['blush', '#e8ded2'], ['powder', '#dde2ea'], ['cream', '#efe9dc'], ['greige', '#e2ddd5']];
const DUVETS = [['white', '#e9e4da'], ['blue', '#c9d6df'], ['rose', '#e3cfc4'], ['sage', '#d2dccb'], ['lilac', '#d8d0e2'], ['butter', '#efe2c6'], ['grey', '#c7ccd2']];
const CARPETS = [['grey', ['#a3adb6', '#b9c2c9']], ['oat', ['#b3a795', '#c6bba9']], ['moss', ['#a2ae9b', '#b7c1ae']], ['heather', ['#a89fae', '#bdb5c2']], ['steel', ['#8f9da2', '#a7b4b8']], ['sand', ['#b9ad9c', '#cbc1b2']]];
const RUG_PATS = ['border', 'stripes', 'checks', 'plain'];
const LEGS = [['walnut', '#3b2a1f'], ['black', '#1f1f22'], ['chrome', '#b9b4aa'], ['oak', '#8a6a4a']];
const POTS = [['clay', '#c9b9a4'], ['white', '#e6e3dc'], ['charcoal', '#4a4d52'], ['terracotta', '#9a6a4c'], ['sage', '#7f9a86']];

export async function styleLook(style) {
  const rnd = style.rand;
  const sp = (pool, ids) => { const f = splitIds(`sofa_through_door|${pool}`, ids, ids.length >= 10 ? 3 : 1); return ids.filter((id) => f(id) === style.split); };
  const floors = sp('floor', FLOORS), walls = sp('wall', WALLS), outs = sp('outside', OUTS), cols = sp('sofa', SOFA_COLS.map((c) => c[0]));
  const [fi, wi, oi] = style.primaryCombo('std-floor-wall-out', [floors.length, walls.length, outs.length]);
  const sofaId = K.pickOf(rnd, cols), fk = floors[fi], wk = walls[wi], ok = outs[oi], sofa = SOFA_COLS.find((c) => c[0] === sofaId);
  const notRed = (t) => { const [h, sat] = S3.hueSat(t.mean_lin); return !(sat > 0.6 && S3.hueDist(h, 2) < 20); };
  const floorT = /planks|parquet/.test(fk) ? style.pick('tex', (t) => t.use === 'wood' && S3.lum(t.mean_lin) > 0.06 && notRed(t))
    : fk === 'tiles' ? style.pick('tex', (t) => (t.use === 'floor' || t.use === 'stone') && notRed(t)) : style.pick('tex', (t) => t.use === 'floor' && /concrete|cement/.test(t.id));
  const wallT = wk === 'brick' ? style.pick('tex', (t) => t.use === 'wall' && /brick/.test(t.id)) : wk === 'panel' ? style.pick('tex', (t) => t.use === 'wood' && S3.lum(t.mean_lin) > 0.08)
    : style.pick('tex', (t) => t.use === 'wall' && /plaster|concrete/.test(t.id));
  const outT = ok === 'lawn' ? style.pick('tex', (t) => t.use === 'terrain' && /grass|forest_ground|mossy/.test(t.id)) : ok === 'gravel' ? style.pick('tex', (t) => t.use === 'terrain' && /gravel|pebble|rocks_ground/.test(t.id))
    : ok === 'paving' ? style.pick('tex', (t) => (t.use === 'floor' || t.use === 'stone') && /pav|cobble|slab|stone/.test(t.id)) : style.pick('tex', (t) => t.use === 'wood');
  const carpetT = style.pick('tex', (t) => t.use === 'fabric');
  const fabT = style.pick('tex', (t) => t.use === 'fabric');
  const woodT = style.pick('tex', (t) => t.use === 'wood');
  const hd = style.pick('hdri', (h) => h.use === 'indoor' || h.use === 'studio' || h.use === 'overcast');
  style.note(`floor:${fk}`); style.note(`wall:${wk}`); style.note(`outside:${ok}`); style.note(`sofa:${sofa[0]}`);
  const T = await Promise.all([floorT, wallT, outT || style.pick('tex', (t) => t.use === 'terrain'), carpetT, fabT, woodT].map((t) => S3.loadTexture(t.file)));
  const [TF, TW, TO, TC, TFab, TWood] = T;
  const J = Array.from({ length: 16 }, () => rnd());
  const muted = (c, L, sat) => S3.scaleTo(S3.limitSat(c, sat), L);
  const floorFace = muted(TF.mean, 0.16 + 0.24 * J[0], fk === 'concrete' ? 0.08 : 0.45);
  const P = (pool, items, r) => K.splitPick(style, 'sofa_through_door', pool, items, r);
  const carpet = P('carpet', CARPETS, J[1])[1].map(S3.linOf);
  if (S3.deltaE(carpet[0], floorFace) < 18) carpet.forEach((c, i) => { carpet[i] = c.map((v) => v * (S3.lum(floorFace) > 0.25 ? 0.75 : 1.3)); });
  const wallSide = wk === 'plaster' ? S3.linOf(P('plaster', PLASTER, J[2])[1]) : muted(TW.mean, wk === 'concrete' ? 0.42 : 0.2 + 0.15 * J[2], 0.4);
  let wallTop = S3.scaleTo(S3.limitSat(wallSide, wk === 'plaster' ? 0.06 : 0.3), Math.min(0.9, Math.max(wk === 'plaster' ? 0.62 : 0.3, S3.lum(wallSide) * 1.3)));
  for (let it = 0; it < 6 && Math.min(S3.deltaE(wallTop, floorFace), S3.deltaE(wallTop, carpet[0])) < 20; it++) wallTop = wallTop.map((v) => Math.min(0.95, v * 1.25));
  const outFace = ok === 'lawn' ? S3.scaleTo(S3.hueSatColor(78 + 30 * J[3], 0.5), 0.1 + 0.08 * J[15]) : muted(TO.mean, 0.14 + 0.18 * J[3], ok === 'deck' ? 0.25 : 0.12);
  const L0 = light();
  const L = S3.hdriLight(hd, L0, { albedo: floorFace, total: 1.62, jitter: J[4] });
  return {
    fk, wk, ok, floorFace, carpet, wallSide, wallTop, outFace, TF, TW, TO, TC, TFab, TWood,
    sofa: S3.linOf(sofa[1]), chair: S3.linOf(K.pickOf(rnd, SOFA_COLS.filter((c) => c[0] !== sofa[0] && cols.includes(c[0])))[1]), legs: S3.linOf(P('legs', LEGS)[1]),
    duvet: S3.linOf(P('duvet', DUVETS, J[5])[1]), rugPat: [P('rug_pattern', RUG_PATS, J[6]), P('rug_pattern', RUG_PATS, J[7])],
    rugHue: J[8], pot: S3.linOf(P('pot', POTS)[1]), leaf: [J[9], J[10]],
    plankW: 0.1 + 0.08 * J[11], plankL: 0.9 + 0.6 * J[12], tile: 0.3 + 0.3 * J[13], wood: K.texMat({ tex: TWood, face: muted(TWood.mean, 0.16 + 0.2 * J[14], 0.5), keep: 0.6, cv: 0.2, texWorld: 0.9, fp: 0.01, ks: 0.08, sh: 18 }),
    light: L, sky: S3.skyFn(await S3.loadSky(hd.sky), 0.9 * S3.lum(L.sky) / 0.45),
    ids: { floor: fk, floorTex: floorT.id, wall: wk, wallTex: wallT.id, outside: ok, sofa: sofa[0], hdri: hd.id },
  };
}

function floorStyled(m, dyn, look) {
  const fk = look.fk, F = look.floorFace, TF = look.TF, S = new Float64Array(3);
  const sample = (T, face, u, v, fp, tw, kc0, keep, out) => {
    const tpm = T.n / tw;
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S);
    const kc = Math.min(1.2, kc0 / Math.max(1e-6, T.cv)), t = Math.max(0.6, Math.min(1.45, 1 + kc * (S3.lum(S) / Math.max(1e-6, S3.lum(T.mean)) - 1)));
    const Lf = S3.lum(face), Ln = Math.max(1e-6, S3.lum(S));
    for (let c = 0; c < 3; c++) out[c] = face[c] * t * (1 - keep) + S[c] / Ln * Lf * t * keep;
  };
  const swap = TF.gxy > 1, PW = look.plankW, PL = look.plankL;
  const main = (x, z, fp, out) => {
    if (fk === 'planks') {
      const row = Math.floor(x / PW), off = RT.hash2(row, 7) * PL, seg = Math.floor((z + off) / PL), tone = RT.hash2(row, seg);
      const a = z + seg * 3.3, b = x + row * 0.71; sample(TF, F, swap ? b : a, swap ? a : b, fp, 1.0, 0.22, 0.5, out);
      const k = (0.88 + 0.24 * tone) * (1 - 0.38 * Math.max(RT.lineMask(x, PW, 0.0035, fp), RT.lineMask(z + off, PL, 0.003, fp) * 0.8));
      out[0] *= k; out[1] *= k; out[2] *= k; return;
    }
    if (fk === 'parquet') {
      const B = 0.4, bx = Math.floor(x / B), bz = Math.floor(z / B), alt = (bx + bz) & 1, lx = x - bx * B, lz = z - bz * B;
      const across = alt ? lx : lz, along = alt ? lz : lx, sl = Math.floor(across / (B / 4)), tone = RT.hash2(bx * 4 + sl, bz);
      sample(TF, F, swap ? across + bx : along + tone * 5, swap ? along + tone * 5 : across + bx, fp, 1.0, 0.2, 0.5, out);
      const k = (0.88 + 0.24 * tone) * (1 - 0.36 * Math.max(RT.lineMask(across, B / 4, 0.0025, fp), RT.lineMask(x, B, 0.003, fp), RT.lineMask(z, B, 0.003, fp)));
      out[0] *= k; out[1] *= k; out[2] *= k; return;
    }
    const tile = fk === 'tiles' ? look.tile : 1.2, ix = Math.floor(x / tile), iz = Math.floor(z / tile), h = RT.hash2(ix, iz);
    sample(TF, F, x + h * 3, z + h * 5, fp, 1.6, 0.15, 0.35, out);
    const k = (0.95 + 0.1 * h) * (1 - (fk === 'tiles' ? 0.5 : 0.3) * Math.max(RT.lineMask(x, tile, 0.004, fp), RT.lineMask(z, tile, 0.004, fp)));
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
  const CARPET = look.carpet, TC = look.TC;
  const rugs = m.rugs.map((r, i) => {
    const pat = look.rugPat[i % 2];
    const h1 = (look.rugHue * 360 + i * 140) % 360;
    const A = S3.scaleTo(S3.hueSatColor(h1, 0.22), 0.3), B = S3.scaleTo(S3.hueSatColor((h1 + 180) % 360, 0.3), 0.12);
    return { ...r, A: pat === 'plain' ? RT.lin(r.c1) : A, B: pat === 'plain' ? RT.lin(r.c2) : B, pat };
  });
  const doors = m.floors.filter((f) => f.kind === 'door1' || f.kind === 'door2');
  const SILL = S3.scaleTo(S3.limitSat(look.wallSide, 0.08), 0.5), OK = look.ok, TO = look.TO, swO = TO.gxy > 1;
  const outside = (x, z, fp, out) => {
    if (OK === 'lawn' || OK === 'gravel') { sample(TO, look.outFace, x, z, fp, 1.2, 0.3, 0.15, out); return; }
    if (OK === 'deck') {
      const row = Math.floor(z / 0.16), off = RT.hash2(row, 3) * 2.4, seg = Math.floor((x + off) / 2.4), tone = RT.hash2(row, seg);
      sample(TO, look.outFace, swO ? z + row : x + seg * 3, swO ? x + seg * 3 : z + row, fp, 1.0, 0.2, 0.5, out);
      const k = (0.86 + 0.26 * tone) * (1 - 0.6 * Math.max(RT.lineMask(z, 0.16, 0.008, fp), RT.lineMask(x + off, 2.4, 0.006, fp)));
      out[0] *= k; out[1] *= k; out[2] *= k; return;
    }
    const P = 0.6, ix = Math.floor(x / P), iz = Math.floor(z / P), h = RT.hash2(ix, iz);
    sample(TO, look.outFace, x + h * 3, z + h * 7, fp, 1.5, 0.15, 0.2, out);
    const k = (0.92 + 0.14 * h) * (1 - 0.45 * Math.max(RT.lineMask(x, P, 0.008, fp), RT.lineMask(z, P, 0.008, fp)));
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
  return (x, z, fp, out) => {
    let hit = null;
    for (const f of m.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) { hit = f; break; }
    if (!hit) { outside(x, z, fp, out); return; }
    if (hit.kind === 'bedroom') {
      sample(TC, CARPET[0], x, z, fp, 0.8, 0.12, 0.0, out);
      const n2 = RT.fbm(x * 4, z * 4, 2, fp); RT.mixInto(out, out, CARPET[1], 0.3 * n2);
    } else main(x, z, fp, out);
    for (const d of doors) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) { const n = RT.fbm(x * 9, z * 9, 2, fp); out[0] = SILL[0] * (0.9 + 0.2 * n); out[1] = SILL[1] * (0.9 + 0.2 * n); out[2] = SILL[2] * (0.9 + 0.2 * n); }
    for (const r of rugs) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const e = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z), n = RT.fbm(x * 22, z * 22, 2, fp);
      let base = r.A;
      if (r.pat === 'border' || r.pat === 'plain') { if (e > 0.1 && e < 0.17) base = r.B; }
      else if (r.pat === 'stripes') { if (Math.floor((x - r.x0) / 0.18) % 2) base = r.B; }
      else if (Math.floor((x - r.x0) / 0.3) + Math.floor((z - r.z0) / 0.3) & 1) base = r.B;
      out[0] = base[0] * (0.92 + 0.12 * n); out[1] = base[1] * (0.92 + 0.12 * n); out[2] = base[2] * (0.92 + 0.12 * n);
      if (e < 0.012) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; }
    }
    const s = dyn && dyn.sofa;
    if (s) {
      const A = G.axes(s.a), dx = x - s.x, dz = z - s.z;
      const lu = Math.abs(dx * A.ux + dz * A.uz) - m.sofa.L / 2, ln = Math.abs(dx * A.nx + dz * A.nz) - m.sofa.W / 2;
      const d = Math.hypot(Math.max(lu, 0), Math.max(ln, 0)) + Math.min(Math.max(lu, ln), 0);
      if (d < 0.16) { const k = 1 - 0.38 * Math.exp(-Math.max(0, d) / 0.05); out[0] *= k; out[1] *= k; out[2] *= k; }
    }
  };
}
function materialsStyled(m, look) {
  const S = new Float64Array(3);
  const fab = (base, T, cv, tw) => {
    const tpm = T.n / tw, kc = Math.min(1, cv / Math.max(1e-6, T.cv)), invL = 1 / Math.max(1e-6, S3.lum(T.mean));
    return (x, y, z, nx, ny, nz, s, out) => {
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const u = ay >= ax && ay >= az ? x : ax >= az ? z : x, v = ay >= ax && ay >= az ? z : y;
      S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, 0.006 * tpm)), S);
      const t = Math.max(0.75, Math.min(1.25, 1 + kc * (S3.lum(S) * invL - 1)));
      out[0] = base[0] * t; out[1] = base[1] * t; out[2] = base[2] * t;
    };
  };
  const WS = look.wallSide, WT = look.wallTop, TW = look.TW, tpm = TW.n / 1.2, invL = 1 / Math.max(1e-6, S3.lum(TW.mean)), kcW = Math.min(1, (look.wk === 'plaster' ? 0.06 : 0.3) / Math.max(1e-6, TW.cv));
  const wall = (x, y, z, nx, ny, nz, s, out) => {
    if (ny > 0.7) { const n = RT.fbm(x * 6, z * 6, 2); out[0] = WT[0] * (0.98 + 0.03 * n); out[1] = WT[1] * (0.98 + 0.03 * n); out[2] = WT[2] * (0.98 + 0.03 * n); return; }
    const u = Math.abs(nx) > Math.abs(nz) ? z : x;
    S3.sampleTex(TW, u * tpm, -y * tpm, Math.log2(Math.max(1e-9, 0.008 * tpm)), S);
    let t = Math.max(0.7, Math.min(1.3, 1 + kcW * (S3.lum(S) * invL - 1)));
    if (y < 0.07) t *= look.wk === 'plaster' ? 1.04 : 0.8;
    if (Math.abs(y - 0.07) < 0.005) t *= 0.85;
    out[0] = WS[0] * t; out[1] = WS[1] * t; out[2] = WS[2] * t;
  };
  const leafA = S3.scaleTo(S3.hueSatColor(80 + 50 * look.leaf[0], 0.6), 0.06), leafB = S3.scaleTo(S3.hueSatColor(85 + 40 * look.leaf[1], 0.5), 0.2);
  return [
    { c: WS, ks: 0.02, sh: 6, tex: wall },
    { c: look.sofa, ks: 0.03, sh: 8, tex: fab(look.sofa, look.TFab, 0.14, 0.5) },
    { c: look.legs, ks: 0.1, sh: 20 },
    look.wood,
    { c: RT.lin('#f3f1ec'), ks: 0.03, sh: 8 },
    { c: look.duvet, ks: 0.02, sh: 6, tex: fab(look.duvet, look.TFab, 0.1, 0.6) },
    { c: look.pot, ks: 0.06, sh: 14 },
    { c: leafA, ks: 0.05, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 30, z * 30 + y * 20, 2); RT.mixInto(out, leafA, leafB, n); } },
    { c: RT.lin('#efe4cf'), ks: 0.02, sh: 6 },
    { c: look.chair, ks: 0.03, sh: 8, tex: fab(look.chair, look.TFab, 0.14, 0.5) },
  ];
}
function styledScene(m, cam, pose, statics, look) {
  const dyn = { sofa: pose };
  const shapes = pose ? (statics || staticShapes(m)).concat(sofaShapes(m, pose)) : staticShapes(m);
  const sc = RT.makeScene({ cam, shapes, mats: materialsStyled(m, look), light: look.light, env: { floorY: 0, floor: floorStyled(m, dyn, look), sky: look.sky } });
  sc.exposure = 1.05;
  return sc;
}
