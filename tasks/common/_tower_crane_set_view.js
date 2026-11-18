import * as RT from './_props_rt.js';
import * as M from './_tower_crane_set_model.js';

const C = M.C, DEG = M.DEG;
export const VIEW = { w: 380, h: 384 };
const YEL = '#e9b417', YEL_D = '#c99a0f', STEEL = '#5d6670', CW = '#a9a59c', WOOD = '#9a6b3e', BLOCK = '#a3a29c', CAB = '#eef1f2';
const MAST_W = 1.6, MAST_TOP = C.JIB_Y, JIB_L = 18, CJIB_L = 6.4, TOP_CH = 1.25;

export function cameraFor(m) {
  const base = M.camBase(m, VIEW.w, VIEW.h), e = base.eye, F = base.F, R = base.R, U = base.U;
  const proj = (p) => { const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2], zc = dx * F[0] + dy * F[1] + dz * F[2];
    return [(dx * R[0] + dy * R[1] + dz * R[2]) / zc, -(dx * U[0] + dy * U[1] + dz * U[2]) / zc]; };
  const pts = [];
  for (const b of m.bays) for (const [x, z] of M.square(b.x, b.z, b.yaw, C.BAY + 0.4)) pts.push([x, 0, z]);
  for (const sx of [-2, 2]) for (const sz of [-2, 2]) pts.push([sx, 0, sz]);
  pts.push([0, MAST_TOP + 1.8, 0]);
  const spots = [[0, 0], [m.goal.dk, m.goal.dj]];
  for (const [k, j] of spots) {
    const [x, z] = M.polar(M.thOf(m, k), M.rOf(m, j));
    for (const [px, pz] of M.square(x, z, 0, C.PAL + 1.4)) pts.push([px, 0, pz]);
    pts.push([x, m.H + M.LOAD_TOTAL + 0.3, z], [x, MAST_TOP + 0.4, z]);
  }
  const xs = pts.map((p) => proj(p)[0]), ys = pts.map((p) => proj(p)[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 10, f = Math.min((VIEW.w - 2 * pad) / (x1 - x0), (VIEW.h - 2 * pad) / (y1 - y0));
  return RT.camFromBasis({ eye: e, F, R, U, f, cx: VIEW.w / 2 - f * (x0 + x1) / 2, cy: VIEW.h / 2 - f * (y0 + y1) / 2, W: VIEW.w, H: VIEW.h });
}

function lightFor(m) {
  const a = m.cam.az * DEG;
  return {
    dir: [0, 1, 0], col: [1.18, 1.13, 1.04], soft: 0.06,
    sky: [0.4, 0.45, 0.53], ground: [0.17, 0.16, 0.14],
    fill: { dir: norm([Math.sin(a) * 0.8, 0.45, Math.cos(a) * 0.8]), col: [0.3, 0.3, 0.32] }, aoK: 0.7, contact: 0.25, contactH: 0.12,
  };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const SKY0 = RT.lin('#9fc0e2'), SKY1 = RT.lin('#e4edf5');
function sky(dx, dy, dz, out) { const t = Math.max(0, Math.min(1, dy * 2.2 + 0.1)); RT.mixInto(out, SKY1, SKY0, t); }

function floorFn(m, COLORS) {
  const phi = Math.atan2(m.cam.look[0], m.cam.look[2]);
  const ca = Math.cos(phi), sa = Math.sin(phi);
  const CON0 = RT.lin('#a29f98'), CON1 = RT.lin('#b6b3ab'), STAIN = RT.lin('#8f8b83'), DIRT0 = RT.lin('#8a7558'), DIRT1 = RT.lin('#a48d6c');
  const bays = m.bays.map((b) => { const u = [Math.sin(b.yaw * DEG), Math.cos(b.yaw * DEG)];
    return { x: b.x, z: b.z, u, v: [u[1], -u[0]], col: RT.lin(COLORS[b.color]) }; });
  const h = C.BAY / 2, lw = 0.18;
  return (x, z, fp, out) => {
    const sx = x * ca - z * sa, sz = x * sa + z * ca;
    if (Math.abs(sx) > 21 || sz < -12 || sz > 22) {
      const n = RT.fbm(x * 0.6, z * 0.6, 3, fp), gr = RT.fbm(x * 9, z * 9, 2, fp * 9);
      RT.mixInto(out, DIRT0, DIRT1, Math.max(0, Math.min(1, 0.3 + 0.6 * (n - 0.5) + 0.4 * (gr - 0.5) + 0.3)));
      return;
    }
    const n = RT.fbm(x * 0.35 + 3, z * 0.35, 3, fp), gr = RT.fbm(x * 14, z * 14, 2, fp * 14);
    RT.mixInto(out, CON0, CON1, Math.max(0, Math.min(1, 0.55 + 0.7 * (n - 0.5) + 0.3 * (gr - 0.5))));
    const st = RT.fbm(x * 0.22 - 9, z * 0.22 + 4, 2, fp * 0.22);
    if (st > 0.66) RT.mixInto(out, out, STAIN, Math.min(0.25, (st - 0.66) * 1.2));
    const joint = Math.max(RT.lineMask(sx, 4.5, 0.012, fp), RT.lineMask(sz, 4.5, 0.012, fp));
    const kj = 1 - 0.35 * joint; out[0] *= kj; out[1] *= kj; out[2] *= kj;
    for (const b of bays) {
      const px = x - b.x, pz = z - b.z, a = Math.abs(px * b.u[0] + pz * b.u[1]), c = Math.abs(px * b.v[0] + pz * b.v[1]);
      if (a > h + 0.05 || c > h + 0.05) continue;
      const edge = Math.min(h - a, h - c);
      const aa = (d) => Math.max(0, Math.min(1, d / Math.max(fp, 1e-4) + 0.5));
      const line = aa(edge) * aa(lw - edge);
      const inner = aa(edge - lw);
      const wear = 0.82 + 0.18 * RT.fbm(x * 7, z * 7, 2, fp * 7);
      const rim = aa(edge) * aa(0.035 - edge);
      if (inner > 0) RT.mixInto(out, out, b.col, 0.42 * inner * wear);
      if (line > 0) RT.mixInto(out, out, b.col, 0.97 * line * wear);
      if (rim > 0) { const k = 1 - 0.45 * rim; out[0] *= k; out[1] *= k; out[2] *= k; }
    }
  };
}

function hash(i, s) { return RT.hash2(i * 7 + 3, s * 13 + 1); }
function staticShapes(m, shapes, mats) {
  const at = (def) => { mats.push(def); return mats.length - 1; };
  const conc = at({ c: RT.lin('#bdb9b0'), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => { const n = RT.fbm(x * 3 + z * 2, y * 4 + z, 3); RT.mixInto(out, RT.lin('#aaa69d'), RT.lin('#c8c4ba'), 0.3 + 0.6 * n); } });
  const steel = at({ c: RT.lin('#4f565d'), ks: 0.3, sh: 30 });
  const brick = at({ c: RT.lin('#9c4a30'), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
    const row = Math.floor(y / 0.075), off = row % 2 ? 0.11 : 0, mort = Math.min(Math.abs(((y / 0.075) % 1) - 0.5) * 2, 1);
    const u = Math.abs(nx) > 0.5 ? z : x, col = Math.abs((((u + off) / 0.22) % 1 + 1) % 1 - 0.5) * 2;
    const k = (mort > 0.86 || col > 0.92) ? 0.55 : 0.85 + 0.15 * RT.hash2(Math.floor((u + off) / 0.22), row);
    const base = RT.lin('#9c4a30'); out[0] = base[0] * k + 0.05 * (1 - k); out[1] = base[1] * k + 0.05 * (1 - k); out[2] = base[2] * k + 0.05 * (1 - k); } });
  const wood = at({ c: RT.lin(WOOD), ks: 0.03, sh: 8 });
  const cone = at({ c: RT.lin('#e2571c'), ks: 0.2, sh: 20 });
  const pipe = at({ c: RT.lin('#7b8187'), ks: 0.5, sh: 40 });
  const barrier = at({ c: RT.lin('#e9e6df'), ks: 0.06, sh: 10, tex: (x, y, z, nx, ny, nz, s, out) => {
    const st = (Math.floor((x + z) / 0.5) & 1) && y > 0.35; const b = RT.lin(st ? '#c8352a' : '#ece9e2'); out[0] = b[0]; out[1] = b[1]; out[2] = b[2]; } });
  shapes.push(RT.shape.box(900, conc, 0, 0.25, 0, 1.9, 0.25, 1.9, 0, 0.03));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) shapes.push(RT.shape.box(901, steel, sx * 0.72, 0.62, sz * 0.72, 0.16, 0.12, 0.16, 0, 0.02));
  const phi = Math.atan2(m.cam.look[0], m.cam.look[2]) / DEG, seedA = Math.round((m.start.th * 7 + m.H * 31) * 10);
  const spots = [];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1, a = phi + side * (70 + 80 * hash(i, seedA)), r = 16.8 + 2.4 * hash(i + 11, seedA);
    spots.push([r * Math.sin(a * DEG), r * Math.cos(a * DEG), a]);
  }
  spots.forEach(([x, z, a], i) => {
    const kind = i % 4, id = 910 + i;
    if (kind === 0) {
      shapes.push(RT.shape.box(id, wood, x, 0.07, z, 0.6, 0.07, 0.5, a, 0.01));
      shapes.push(RT.shape.box(id, brick, x, 0.14 + 0.36, z, 0.56, 0.36, 0.46, a, 0.01));
    } else if (kind === 1) {
      const u = [Math.sin(a * DEG), 0, Math.cos(a * DEG)], v = [u[2], 0, -u[0]];
      for (let p = 0; p < 5; p++) {
        const o = (p - 2) * 0.22, yy = 0.12 + (p % 2) * 0.17;
        shapes.push(RT.shape.gcyl(id, pipe, [x - u[0] * 2.4 + v[0] * o, yy, z - u[2] * 2.4 + v[2] * o], [x + u[0] * 2.4 + v[0] * o, yy, z + u[2] * 2.4 + v[2] * o], 0.11));
      }
    } else if (kind === 2) {
      for (const d of [0, 1.2]) { shapes.push(RT.shape.frustum(id, cone, x + d, z, 0.02, 0.7, 0.17, 0.035)); shapes.push(RT.shape.box(id, cone, x + d, 0.02, z, 0.24, 0.02, 0.24)); }
    } else {
      for (let q = 0; q < 3; q++) { const u = [Math.sin(a * DEG), Math.cos(a * DEG)]; shapes.push(RT.shape.box(id, barrier, x + u[1] * q * 1.25, 0.4, z - u[0] * q * 1.25, 0.6, 0.4, 0.22, a + 90, 0.06)); }
    }
  });
}
export function buildBackground(m, COLORS) {
  const shapes = [], mats = [];
  staticShapes(m, shapes, mats);
  return RT.makeScene({ cam: cameraFor(m), shapes, mats, light: lightFor(m), env: { floorY: 0, floor: floorFn(m, COLORS), floorMat: { ks: 0, sh: 1 }, sky }, exposure: 1.0 });
}

function shadeRGB(hex, n, m, k = 1) {
  const L = lightFor(m), c = RT.lin(hex), hemi = 0.5 + 0.5 * n[1];
  const amb = [0, 1, 2].map((i) => L.ground[i] + (L.sky[i] - L.ground[i]) * hemi);
  const kd = Math.max(0, n[1]), fd = Math.max(0, n[0] * L.fill.dir[0] + n[1] * L.fill.dir[1] + n[2] * L.fill.dir[2]);
  const out = [0, 1, 2].map((i) => { let v = c[i] * (amb[i] + L.col[i] * kd + L.fill.col[i] * fd) * k; v = v / (1 + 0.12 * v); return Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)); });
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}
function boxFaces(cam, c, ax, h) {
  const P = (a, b, d) => [c[0] + ax[0][0] * h[0] * a + ax[1][0] * h[1] * b + ax[2][0] * h[2] * d,
    c[1] + ax[0][1] * h[0] * a + ax[1][1] * h[1] * b + ax[2][1] * h[2] * d, c[2] + ax[0][2] * h[0] * a + ax[1][2] * h[1] * b + ax[2][2] * h[2] * d];
  const faces = [];
  for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) {
    const n = ax[i].map((v) => v * sg), fc = [c[0] + n[0] * h[i], c[1] + n[1] * h[i], c[2] + n[2] * h[i]];
    const toEye = [cam.eye[0] - fc[0], cam.eye[1] - fc[1], cam.eye[2] - fc[2]];
    if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] <= 0) continue;
    const j = (i + 1) % 3, l = (i + 2) % 3, q = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const s = [0, 0, 0]; s[i] = sg; s[j] = a; s[l] = b; q.push(P(s[0], s[1], s[2])); }
    faces.push({ n, i, sg, q });
  }
  return faces;
}
function proj(cam, p) { const r = cam.project(p[0], p[1], p[2]); return [r.x, r.y, r.z]; }
function fillQuad(g, cam, q, style) {
  g.beginPath(); q.forEach((p, i) => { const s = proj(cam, p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath();
  g.fillStyle = style; g.fill();
}
function drawBox(g, cam, m, c, ax, h, hex, opts = {}) {
  for (const f of boxFaces(cam, c, ax, h)) {
    fillQuad(g, cam, f.q, shadeRGB(hex, f.n, m, opts.k ?? 1));
    if (opts.edge !== false) { g.strokeStyle = 'rgba(30,30,30,0.18)'; g.lineWidth = 0.5; g.stroke(); }
    if (opts.deco) opts.deco(g, f);
  }
}
function seg(g, cam, a, b, wM, style) {
  const pa = proj(cam, a), pb = proj(cam, b), px = Math.max(0.6, wM * cam.f / ((pa[2] + pb[2]) / 2));
  g.strokeStyle = style; g.lineWidth = px; g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
}

function jibFrame(th) { const u = [Math.sin(th * DEG), 0, Math.cos(th * DEG)], v = [u[2], 0, -u[0]]; return { u, v, up: [0, 1, 0] }; }
const along = (F, s, y, side) => [F.u[0] * s + F.v[0] * side, y, F.u[2] * s + F.v[2] * side];

function drawMast(g, cam, m) {
  const h = MAST_W / 2, y0 = 0.5, y1 = MAST_TOP - 0.15, n = 8, dy = (y1 - y0) / n;
  const cs = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const eye = cam.eye, items = [];
  for (let f = 0; f < 4; f++) {
    const a = cs[f], b = cs[(f + 1) % 4], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const depth = Math.hypot(mid[0] - eye[0], mid[1] - eye[2]);
    items.push({ depth, draw: () => {
      for (let i = 0; i < n; i++) {
        const ya = y0 + i * dy, yb = ya + dy, k = i % 2;
        seg(g, cam, [a[0], ya, a[1]], [b[0], ya, b[1]], 0.07, shadeRGB(YEL_D, [0, 1, 0], m, 0.8));
        seg(g, cam, k ? [a[0], ya, a[1]] : [b[0], ya, b[1]], k ? [b[0], yb, b[1]] : [a[0], yb, a[1]], 0.06, shadeRGB(YEL, norm([mid[0], 0, mid[1]]), m));
      }
    } });
  }
  for (const [x, z] of cs) items.push({ depth: Math.hypot(x - eye[0], z - eye[2]) - 0.01, draw: () => seg(g, cam, [x, y0, z], [x, y1, z], 0.16, shadeRGB(YEL, norm([x, 0, z]), m)) });
  items.sort((p, q) => q.depth - p.depth).forEach((it) => it.draw());
}
function craneItems(g, cam, m, th, trolleyR) {
  const F = jibFrame(th), items = [], eye = cam.eye;
  const depthOf = (p) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
  const bar = (a, b, w, hex, n = F.up, k = 1) => items.push({ d: depthOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), f: () => seg(g, cam, a, b, w, shadeRGB(hex, n, m, k)) });
  const box = (c, ax, h, hex, opts) => items.push({ d: depthOf(c), f: () => drawBox(g, cam, m, c, ax, h, hex, opts) });
  const yb = C.JIB_Y, yt = C.JIB_Y + TOP_CH, hw = 0.5;
  box([0, MAST_TOP + 0.45, 0], [F.u, F.up, F.v], [1.0, 0.5, 1.0], YEL);
  box(along(F, 0.4, MAST_TOP + 0.95, 1.35), [F.u, F.up, F.v], [0.75, 0.75, 0.55], CAB, { deco: (gg, f) => {
    if (f.i === 0 && f.sg > 0) { const q = f.q, c0 = q.map((p) => p.slice()); const shrink = (p, o) => p.map((v, i) => v + (o[i] - v) * 0.22);
      const mc = [0, 1, 2].map((i) => (q[0][i] + q[1][i] + q[2][i] + q[3][i]) / 4); fillQuad(gg, cam, c0.map((p) => shrink(p, mc)), '#2b3640'); } } });
  const sEnd = JIB_L, s0 = 1.0;
  for (const sd of [-hw, hw]) bar(along(F, s0, yb, sd), along(F, sEnd, yb, sd), 0.13, YEL, F.up);
  bar(along(F, s0, yt, 0), along(F, sEnd - 0.6, yt, 0), 0.13, YEL, F.up, 1.05);
  for (let s = s0, i = 0; s < sEnd - 0.5; s += 1.5, i++) {
    const s2 = Math.min(sEnd - 0.6, s + 1.5);
    for (const sd of [-hw, hw]) {
      bar(along(F, s, yb, sd), along(F, s + 0.75, yt, 0), 0.07, YEL_D, norm([F.v[0] * sd, 0.6, F.v[2] * sd]));
      bar(along(F, s + 0.75, yt, 0), along(F, s2, yb, sd), 0.07, YEL_D, norm([F.v[0] * sd, 0.6, F.v[2] * sd]));
    }
    bar(along(F, s, yb, -hw), along(F, s, yb, hw), 0.06, YEL_D, F.up, 0.8);
  }
  box(along(F, sEnd, yb + 0.3, 0), [F.u, F.up, F.v], [0.25, 0.35, 0.6], YEL);
  for (const sd of [-0.6, 0.6]) bar(along(F, -0.9, yb + 0.1, sd), along(F, -CJIB_L, yb + 0.1, sd), 0.14, YEL, F.up);
  for (let s = -1.6; s > -CJIB_L; s -= 1.2) bar(along(F, s, yb + 0.1, -0.6), along(F, s, yb + 0.1, 0.6), 0.07, YEL_D, F.up, 0.85);
  box(along(F, -3.0, yb + 0.12, 0), [F.u, F.up, F.v], [2.0, 0.04, 0.62], '#7b7f84', { edge: false });
  for (let b = 0; b < 3; b++) box(along(F, -CJIB_L + 0.45 + b * 0.78, yb - 0.35, 0), [F.u, F.up, F.v], [0.36, 0.75, 0.85], CW);
  box(along(F, trolleyR, yb - 0.18, 0), [F.u, F.up, F.v], [0.55, 0.2, 0.6], STEEL);
  return items;
}
function loadItems(g, cam, m, th, trolley, load) {
  const items = [], F = jibFrame(th), eye = cam.eye;
  const up = load.up, u0 = F.u;
  const dotp = u0[0] * up[0] + u0[1] * up[1] + u0[2] * up[2];
  const u = norm([u0[0] - up[0] * dotp, u0[1] - up[1] * dotp, u0[2] - up[2] * dotp]);
  const v = [up[1] * u[2] - up[2] * u[1], up[2] * u[0] - up[0] * u[2], up[0] * u[1] - up[1] * u[0]];
  const base = load.base;
  const at = (a, b, d) => [base[0] + up[0] * b + u[0] * a + v[0] * d, base[1] + up[1] * b + u[1] * a + v[1] * d, base[2] + up[2] * b + u[2] * a + v[2] * d];
  const ax = [u, up, v];
  const pal = at(0, C.PAL_H / 2, 0), blk = at(0, C.PAL_H + C.LOAD_H / 2, 0);
  const deco = (gg, f) => {
    gg.strokeStyle = 'rgba(55,55,52,0.45)'; gg.lineWidth = 0.6;
    const q = f.q, lerp = (p, r, t) => p.map((x, i) => x + (r[i] - x) * t);
    for (const t of [1 / 3, 2 / 3]) {
      for (const [A, B, Cc, D] of [[q[0], q[1], q[3], q[2]], [q[0], q[3], q[1], q[2]]]) {
        const a = proj(cam, lerp(A, B, t)), b = proj(cam, lerp(Cc, D, t));
        gg.beginPath(); gg.moveTo(a[0], a[1]); gg.lineTo(b[0], b[1]); gg.stroke();
      }
    }
  };
  items.push(() => {
    drawBox(g, cam, m, pal, ax, [C.PAL / 2, C.PAL_H / 2, C.PAL / 2], WOOD);
    drawBox(g, cam, m, blk, ax, [C.PAL / 2 - 0.05, C.LOAD_H / 2, C.PAL / 2 - 0.05], BLOCK, { deco });
    const hk = load.hook;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) => at(a * (C.PAL / 2 - 0.08), M.LOAD_TOTAL, d * (C.PAL / 2 - 0.08)));
    const sorted = corners.map((p) => ({ p, d: Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) })).sort((a, b) => b.d - a.d);
    for (const { p } of sorted) seg(g, cam, [hk[0], hk[1] - 0.25, hk[2]], p, 0.035, 'rgba(40,40,40,0.9)');
    drawBox(g, cam, m, hk, [F.u, [0, 1, 0], F.v], [0.16, 0.24, 0.12], '#d9a514');
    seg(g, cam, [hk[0], hk[1] - 0.24, hk[2]], [hk[0], hk[1] - 0.36, hk[2]], 0.06, '#333');
    for (const sd of [-0.06, 0.06]) seg(g, cam, [hk[0] + F.v[0] * sd, hk[1] + 0.24, hk[2] + F.v[2] * sd], [trolley[0] + F.v[0] * sd, trolley[1], trolley[2] + F.v[2] * sd], 0.03, 'rgba(35,35,35,0.95)');
  });
  return items;
}

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function groundPoly(g, cam, poly, grow, style) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  g.beginPath();
  poly.forEach((p, i) => { const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz) || 1, s = proj(cam, [p[0] + dx / l * grow, 0, p[1] + dz / l * grow]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  g.closePath(); g.fillStyle = style; g.fill();
}
function softShadow(g, cam, poly, a = 0.42) {
  groundPoly(g, cam, poly, 0.14, `rgba(18,20,24,${(a * 0.22).toFixed(3)})`);
  groundPoly(g, cam, poly, 0.07, `rgba(18,20,24,${(a * 0.3).toFixed(3)})`);
  groundPoly(g, cam, poly, 0, `rgba(18,20,24,${(a * 0.62).toFixed(3)})`);
}
function craneShadows(g, cam, th, trolleyR) {
  const F = jibFrame(th), hw = 0.5;
  const line = (s0, s1, sd0, sd1, w, a) => { const p = proj(cam, along(F, s0, 0, sd0)), q = proj(cam, along(F, s1, 0, sd1));
    g.strokeStyle = `rgba(18,20,24,${a})`; g.lineWidth = Math.max(0.6, w * cam.f / p[2]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
  g.save(); g.lineCap = 'butt';
  for (const sd of [-hw, hw]) line(1, JIB_L, sd, sd, 0.13, 0.2);
  for (let s = 1; s < JIB_L - 0.5; s += 1.5) { line(s, s + 0.75, -hw, 0, 0.07, 0.12); line(s + 0.75, s + 1.5, 0, -hw, 0.07, 0.12); line(s, s + 0.75, hw, 0, 0.07, 0.12); line(s + 0.75, s + 1.5, 0, hw, 0.07, 0.12); }
  for (const sd of [-0.6, 0.6]) line(-0.9, -CJIB_L, sd, sd, 0.14, 0.2);
  groundPoly(g, cam, [along(F, -CJIB_L + 0.1, 0, -0.85), along(F, -CJIB_L + 2.4, 0, -0.85), along(F, -CJIB_L + 2.4, 0, 0.85), along(F, -CJIB_L + 0.1, 0, 0.85)].map((p) => [p[0], p[2]]), 0.03, 'rgba(18,20,24,0.28)');
  groundPoly(g, cam, [along(F, trolleyR - 0.55, 0, -0.6), along(F, trolleyR + 0.55, 0, -0.6), along(F, trolleyR + 0.55, 0, 0.6), along(F, trolleyR - 0.55, 0, 0.6)].map((p) => [p[0], p[2]]), 0.03, 'rgba(18,20,24,0.26)');
  g.restore();
}

function poseOf(m, st, fr, extra = {}) {
  const th = fr ? fr.th : M.thOf(m, st.k), r = fr ? fr.r : M.rOf(m, st.j);
  const [hx, hz] = fr ? [fr.x, fr.z] : M.polar(th, r);
  const dx = fr ? fr.dx : st.dx, dz = fr ? fr.dz : st.dz;
  const y = fr && fr.y !== undefined ? fr.y : m.H;
  return { th, r, hx, hz, dx, dz, y, ...extra };
}
function loadGeom(m, P) {
  const trolley = [P.hx, C.TROLLEY_Y, P.hz];
  if (P.landed) {
    const L = P.landed, base = [L.x, 0, L.z];
    let up = [0, 1, 0];
    if (L.tipK > 0) {
      const v = Math.hypot(L.vx, L.vz) > 1e-3 ? [L.vx, L.vz] : [L.x - P.hx, L.z - P.hz], l = Math.hypot(v[0], v[1]) || 1, a = L.tipK * 86 * DEG;
      const dir = [v[0] / l, v[1] / l], e = C.PAL / 2;
      up = [dir[0] * Math.sin(a), Math.cos(a), dir[1] * Math.sin(a)];
      base[0] = L.x + dir[0] * e * (1 - Math.cos(a)); base[2] = L.z + dir[1] * e * (1 - Math.cos(a)); base[1] = e * Math.sin(a);
    }
    const hk = L.tipK > 0 ? [L.x, M.LOAD_TOTAL + C.SLING * 0.7, L.z] : [base[0], M.LOAD_TOTAL + C.SLING + 0.24, base[2]];
    return { trolley, load: { base, up, hook: hk } };
  }
  const L = M.pendL(m), up = norm([-P.dx, L, -P.dz]);
  const cx = P.hx + P.dx, cz = P.hz + P.dz;
  const base = [cx - up[0] * M.LOAD_TOTAL / 2, P.y, cz - up[2] * M.LOAD_TOTAL / 2];
  const hk = [base[0] + up[0] * (M.LOAD_TOTAL + C.SLING + 0.24), base[1] + up[1] * (M.LOAD_TOTAL + C.SLING + 0.24), base[2] + up[2] * (M.LOAD_TOTAL + C.SLING + 0.24)];
  return { trolley, load: { base, up, hook: hk } };
}
function loadShadowPoly(m, G) {
  const { base, up } = G.load, uu = [Math.sin(G.th * DEG), 0, Math.cos(G.th * DEG)];
  const dotp = uu[0] * up[0] + uu[1] * up[1] + uu[2] * up[2];
  const u = norm([uu[0] - up[0] * dotp, uu[1] - up[1] * dotp, uu[2] - up[2] * dotp]);
  const v = [up[1] * u[2] - up[2] * u[1], up[2] * u[0] - up[0] * u[2], up[0] * u[1] - up[1] * u[0]], pts = [];
  for (const a of [-1, 1]) for (const d of [-1, 1]) for (const b of [0, M.LOAD_TOTAL]) {
    pts.push([base[0] + up[0] * b + (u[0] * a + v[0] * d) * C.PAL / 2, base[2] + up[2] * b + (u[2] * a + v[2] * d) * C.PAL / 2]);
  }
  return hull(pts);
}

const ANIM = { press: C.T, drop: C.T_LOW, tip: 0.7 };
function animOf(env) { return (env.__crane ??= { n: 0, a: null }); }
function startAnim(env) {
  const st = env.state, m = env.manifest, A = animOf(env), L = st.last;
  A.n = st.n;
  if (!L) { A.a = null; return; }
  const frames = [];
  if (L.op === 'drop') {
    M.dropOutcome(m, L.pre, frames, 1);
    A.a = { kind: 'drop', frames, t: 0, total: ANIM.drop + (st.land && st.land.tipped ? ANIM.tip : 0.15) };
  } else {
    M.integratePress(m, L.pre, L.kind, L.dir, frames, 1);
    A.a = { kind: 'press', frames, t: 0, total: ANIM.press };
  }
}
export function busy(env) { const A = animOf(env); return !!A.a; }
export function tick(env, dt) {
  const st = env && env.state; if (!st) return false;
  const A = animOf(env);
  if (A.n !== st.n) startAnim(env);
  if (!A.a) return false;
  A.a.t += dt;
  if (A.a.t >= A.a.total) { A.a = null; return true; }
  return true;
}
function frameAt(a, t) {
  const fr = a.frames, T = fr[fr.length - 1].t, tt = Math.min(T, t);
  const i = Math.min(fr.length - 2, Math.floor(tt / C.DT)), f0 = fr[i], f1 = fr[i + 1], k = Math.max(0, Math.min(1, (tt - f0.t) / (f1.t - f0.t || 1)));
  const o = {}; for (const key of Object.keys(f0)) o[key] = f0[key] + (f1[key] - f0[key]) * k;
  return o;
}

export function drawView(g, env, COLORS) {
  const m = env.manifest, st = env.state, q = Math.min(2, RT.contextScale(g));
  const Cc = (env.__craneBg ??= { m: null, q: 0, img: null, cam: null });
  if (Cc.m !== m || Cc.q !== q) { Cc.m = m; Cc.q = q; Cc.cam = cameraFor(m); Cc.img = RT.toCanvas(RT.render(buildBackground(m, COLORS), q)); }
  const cam = Cc.cam;
  const A = animOf(env);
  if (A.n !== st.n) startAnim(env);
  let P;
  const a = A.a;
  if (a && a.kind === 'press') P = poseOf(m, st, frameAt(a, a.t));
  else if (a && a.kind === 'drop') {
    const tl = Math.min(a.t, ANIM.drop), fr = frameAt(a, tl);
    P = poseOf(m, st, fr);
    if (a.t >= ANIM.drop && st.land) P.landed = { ...st.land, tipK: st.land.tipped ? easeIn(Math.min(1, (a.t - ANIM.drop) / ANIM.tip)) : 0 };
  } else {
    P = poseOf(m, st, null);
    if (st.dropped && st.land) { const [hx, hz] = M.polar(st.land.yaw, M.rOf(m, st.j)); P = { ...P, hx, hz, landed: { ...st.land, tipK: st.land.tipped ? 1 : 0 } }; }
  }
  const G = { ...loadGeom(m, P), th: P.th };
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.drawImage(Cc.img, 0, 0, VIEW.w, VIEW.h);
  craneShadows(g, cam, P.th, P.r);
  const poly = loadShadowPoly(m, G);
  softShadow(g, cam, poly, P.landed ? 0.5 : 0.46);
  drawMast(g, cam, m);
  for (const f of loadItems(g, cam, m, P.th, G.trolley, G.load)) f();
  const items = craneItems(g, cam, m, P.th, P.r);
  items.sort((x, y) => y.d - x.d).forEach((it) => it.f());
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
const easeIn = (u) => u * u;
