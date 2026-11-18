import * as RT from './_props_rt.js';
import * as M from './_fastest_runner_pick_model.js';

const C = M.C, DEG = M.DEG;
export const VIEW = { w: C.W, h: C.H };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hashU = (a, b) => RT.hash2(a | 0, b | 0);

export function lightFor(m) {
  const az = m.look.sunAz * DEG, el = m.look.sunEl * DEG;
  return {
    dir: norm([Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]), col: [1.22, 1.16, 1.04], soft: 0.03,
    sky: [0.42, 0.48, 0.58], ground: [0.16, 0.19, 0.12],
    fill: { dir: norm([-Math.sin(az) * 0.6, 0.5, -0.6]), col: [0.12, 0.13, 0.15] }, aoK: 0.8, contact: 0.25, contactH: 0.12,
  };
}
const SKY0 = RT.lin('#8fb6df'), SKY1 = RT.lin('#dfe9f1'), HAZE = RT.lin('#c9d6dc');
function sky(dx, dy, dz, out) { const t = Math.max(0, Math.min(1, dy * 2.4 + 0.05)); RT.mixInto(out, SKY1, SKY0, t); }

export function fieldBox(m) {
  const G = M.gridAxes(m);
  let aLo = Infinity, aHi = -Infinity, bLo = Infinity, bHi = -Infinity;
  for (let i = 0; i < m.run.length; i++) for (const t of [0, m.T]) {
    const p = M.posAt(m, i, t), a = p[0] * G.A[0] + p[2] * G.A[2], b = p[0] * G.B[0] + p[2] * G.B[2];
    aLo = Math.min(aLo, a); aHi = Math.max(aHi, a); bLo = Math.min(bLo, b); bHi = Math.max(bHi, b);
  }
  return { aLo: Math.min(4, aLo - 14), aHi: aHi + 9, bLo: bLo - 14, bHi: bHi + 14 };
}
function floorFn(m) {
  const G = M.gridAxes(m), B = fieldBox(m), cam = M.camOf(m), e = cam.eye;
  const G0 = RT.lin('#6aa646'), G1 = RT.lin('#5a953b'), ROUGH0 = RT.lin('#5f8d3e'), ROUGH1 = RT.lin('#7a9b4c'), WHITE = RT.lin('#f4f5ef');
  const aa = (d, fp) => Math.max(0, Math.min(1, d / Math.max(fp, 1e-4) + 0.5));
  const a0 = m.grid.a0, b0 = m.grid.b0, Y = C.YARD;
  return (x, z, fp, out) => {
    const a = x * G.A[0] + z * G.A[2], b = x * G.B[0] + z * G.B[2];
    const n = RT.fbm(x * 0.5, z * 0.5, 3, fp * 0.5), gr = RT.fbm(x * 7, z * 7, 2, fp * 7);
    const inField = a > B.aLo && a < B.aHi && b > B.bLo && b < B.bHi;
    if (inField) {
      const ka = ((Math.floor((a - a0) / Y) % 2) + 2) % 2, kb = ((Math.floor((b - b0) / Y) % 2) + 2) % 2;
      const wBand = Math.min(1, fp / Y * 1.5);
      const k = (0.72 * ka + 0.28 * kb) * (1 - wBand) + 0.5 * wBand;
      RT.mixInto(out, G0, G1, k);
      const t = 0.9 + 0.2 * (n - 0.5) + 0.12 * (gr - 0.5); out[0] *= t; out[1] *= t; out[2] *= t;
      let wl = Math.max(RT.lineMask(a - a0, Y, 0.065, fp), RT.lineMask(b - b0, Y, 0.065, fp));
      wl = Math.max(wl, aa(0.07 - Math.abs(b - B.bLo - 0.07), fp), aa(0.07 - Math.abs(b - B.bHi + 0.07), fp));
      wl = Math.max(wl, aa(0.07 - Math.abs(a - B.aLo - 0.07), fp), aa(0.07 - Math.abs(a - B.aHi + 0.07), fp));
      if (wl > 0) RT.mixInto(out, out, WHITE, Math.min(1, wl) * (0.86 + 0.1 * gr));
    } else {
      RT.mixInto(out, ROUGH0, ROUGH1, Math.max(0, Math.min(1, 0.45 + 0.8 * (n - 0.5) + 0.35 * (gr - 0.5))));
    }
    const d = Math.hypot(x - e[0], z - e[2]), hz = Math.max(0, Math.min(0.55, (d - 70) / 160));
    if (hz > 0) RT.mixInto(out, out, HAZE, hz);
  };
}

function propShapes(m, shapes, mats) {
  const at = (def) => { mats.push(def); return mats.length - 1; };
  const G = M.gridAxes(m), B = fieldBox(m);
  const bark = at({ c: RT.lin('#6b4a2e'), ks: 0.02, sh: 6 });
  const leaf = at({ c: RT.lin('#3f7a34'), ks: 0.03, sh: 8, tex: (x, y, z, nx, ny, nz, s, out) => {
    const k = RT.fbm(x * 2.2 + y, z * 2.2 - y, 3); RT.mixInto(out, RT.lin('#2f6229'), RT.lin('#5c9442'), 0.25 + 0.7 * k); } });
  const hedge = at({ c: RT.lin('#3e6f32'), ks: 0.02, sh: 6, tex: (x, y, z, nx, ny, nz, s, out) => {
    const k = RT.fbm(x * 3 + y * 2, z * 3, 3); RT.mixInto(out, RT.lin('#335f2b'), RT.lin('#557f3f'), 0.2 + 0.7 * k); } });
  const post = at({ c: RT.lin('#d9dbd6'), ks: 0.2, sh: 30 });
  const W = (a, b, y = 0) => [a * G.A[0] + b * G.B[0], y, a * G.A[2] + b * G.B[2]];
  const yaw = m.grid.yaw;
  const af = B.aHi + 4, width = B.bHi - B.bLo + 80, mid = (B.bLo + B.bHi) / 2;
  for (let q = -width / 2; q <= width / 2; q += 3) {
    const p = W(af, mid + q);
    shapes.push(RT.shape.box(700, post, p[0], 0.55, p[2], 0.04, 0.55, 0.04, yaw));
  }
  for (const y of [0.45, 1.0]) { const p = W(af, mid); shapes.push(RT.shape.box(701, post, p[0], y, p[2], width / 2, 0.025, 0.02, yaw)); }
  { const p = W(af + 2.5, mid); shapes.push(RT.shape.box(702, hedge, p[0], 0.8, p[2], width / 2, 0.8, 0.7, yaw, 0.2)); }
  const seed = m.look.seed;
  for (let k = 0; k < 18; k++) {
    const q = mid + (k - 8.5) * (width / 17) + (hashU(k, seed) - 0.5) * 3, l = af + 7 + hashU(k + 40, seed) * 10;
    const p = W(l, q), hT = 2.2 + hashU(k + 80, seed) * 1.6, rC = 2.0 + hashU(k + 120, seed) * 1.4;
    shapes.push(RT.shape.cyl(710 + k, bark, p[0], p[2], 0, hT + 0.4, 0.22));
    shapes.push(RT.shape.sphere(710 + k, leaf, p[0], hT + rC * 0.8, p[2], rC));
    shapes.push(RT.shape.sphere(710 + k, leaf, p[0] + 0.9, hT + rC * 0.55, p[2] + 0.4, rC * 0.7));
  }
}
export function buildBackground(m) {
  const shapes = [], mats = [];
  propShapes(m, shapes, mats);
  return RT.makeScene({ cam: M.camOf(m), shapes, mats, light: lightFor(m), env: { floorY: 0, floor: floorFn(m), floorMat: { ks: 0, sh: 1 }, sky }, exposure: 1.0 });
}

const MATS = { skin: '#d9a27c', shorts: '#2c3442', shoe: '#f1f1ee', hair: '#3a2a1e' };
function shadeLin(c, n, L) {
  const hemi = 0.5 + 0.5 * n[1];
  const kd = Math.max(0, dot(n, L.dir)), fd = Math.max(0, dot(n, L.fill.dir));
  return [0, 1, 2].map((i) => {
    let v = c[i] * (L.ground[i] + (L.sky[i] - L.ground[i]) * hemi + L.col[i] * kd + L.fill.col[i] * fd);
    v = v / (1 + 0.12 * v); return Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
  });
}
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
function partColor(m, i, mat) { return RT.lin(mat === 'shirt' ? M.COLORS[m.run[i].color] : MATS[mat]); }

function drawCapsule(g, cam, L, a, b, r, col) {
  const pa = cam.project(a[0], a[1], a[2]), pb = cam.project(b[0], b[1], b[2]);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], pm = cam.project(mid[0], mid[1], mid[2]);
  const rp = r * cam.f / pm.z;
  const v = norm(sub(cam.eye, mid));
  let ax = sub(b, a); const al = Math.hypot(ax[0], ax[1], ax[2]);
  let s, nc;
  if (al < 1e-6) { s = norm(cross([0, 1, 0], v)); nc = v; }
  else { ax = ax.map((q) => q / al); nc = norm(sub(v, ax.map((q) => q * dot(ax, v)))); s = norm(cross(ax, v)); }
  const ps = cam.project(mid[0] + s[0] * r, mid[1] + s[1] * r, mid[2] + s[2] * r);
  let dx = ps.x - pm.x, dy = ps.y - pm.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const sh = (k) => css(shadeLin(col, norm([nc[0] * 0.35 + s[0] * k, nc[1] * 0.35 + s[1] * k, nc[2] * 0.35 + s[2] * k]), L));
  const gr = g.createLinearGradient(pm.x - dx * rp, pm.y - dy * rp, pm.x + dx * rp, pm.y + dy * rp);
  gr.addColorStop(0, sh(-1)); gr.addColorStop(0.5, css(shadeLin(col, nc, L))); gr.addColorStop(1, sh(1));
  g.strokeStyle = gr; g.lineWidth = Math.max(1, 2 * rp); g.lineCap = 'round';
  g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x + (Math.abs(pb.x - pa.x) + Math.abs(pb.y - pa.y) < 0.01 ? 0.01 : 0), pb.y); g.stroke();
}
function drawSphere(g, cam, L, c, r, col) {
  const p = cam.project(c[0], c[1], c[2]), rp = r * cam.f / p.z;
  const v = norm(sub(cam.eye, c)), hv = norm([v[0] + L.dir[0], v[1] + L.dir[1], v[2] + L.dir[2]]);
  const hp = cam.project(c[0] + hv[0] * r * 0.8, c[1] + hv[1] * r * 0.8, c[2] + hv[2] * r * 0.8);
  const rim = norm([v[0] - hv[0] * 1.2, v[1] - hv[1] * 1.2, v[2] - hv[2] * 1.2]);
  const gr = g.createRadialGradient(hp.x, hp.y, 0, p.x, p.y, rp * 1.05);
  gr.addColorStop(0, css(shadeLin(col, hv, L))); gr.addColorStop(0.55, css(shadeLin(col, v, L))); gr.addColorStop(1, css(shadeLin(col, rim, L)));
  g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, Math.max(0.6, rp), 0, Math.PI * 2); g.fill();
}
function shadowPart(g, cam, L, q) {
  const toG = (p) => { const k = p[1] / L.dir[1]; return [p[0] - L.dir[0] * k, 0, p[2] - L.dir[2] * k]; };
  const a = toG(q.k === 'cap' ? q.a : q.c), b = toG(q.k === 'cap' ? q.b : q.c);
  const pa = cam.project(a[0], 0, a[2]), pb = cam.project(b[0], 0, b[2]), rp = q.r * cam.f / ((pa.z + pb.z) / 2);
  g.lineWidth = Math.max(0.8, 2 * rp * 0.9); g.lineCap = 'round';
  g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x + 0.01, pb.y); g.stroke();
}

function shadowCanvas(env, w, h) {
  const S = (env.__frpShadow ??= { c: null });
  if (!S.c || S.c.width !== w || S.c.height !== h) {
    S.c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  return S.c;
}
export function drawView(g, env, t) {
  const m = env.manifest, q = Math.min(2, RT.contextScale(g));
  const Cc = (env.__frpBg ??= { m: null, q: 0, img: null, ms: 0 });
  if (Cc.m !== m || Cc.q !== q) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    Cc.m = m; Cc.q = q; Cc.img = RT.toCanvas(RT.render(buildBackground(m), q));
    Cc.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }
  const cam = M.camOf(m), L = lightFor(m);
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.drawImage(Cc.img, 0, 0, VIEW.w, VIEW.h);
  const poses = m.run.map((_, i) => M.pose(m, i, t));
  const sc = shadowCanvas(env, Math.round(VIEW.w * q), Math.round(VIEW.h * q)), sg = sc.getContext('2d');
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sc.width, sc.height); sg.setTransform(q, 0, 0, q, 0, 0);
  sg.strokeStyle = '#000';
  for (const P of poses) for (const part of P.parts) shadowPart(sg, cam, L, part);
  g.save(); g.globalAlpha = 0.34; g.drawImage(sc, 0, 0, VIEW.w, VIEW.h); g.restore();
  const e = cam.eye, dist = (p) => Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
  const order = poses.map((P, i) => i).sort((a, b) => dist(poses[b].root) - dist(poses[a].root));
  for (const i of order) {
    const parts = poses[i].parts.map((p) => ({ p, d: dist(p.k === 'cap' ? [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2] : p.c) }));
    for (const it of parts) if (it.p.part === 'torso') it.d += 0.005;
    parts.sort((a, b) => b.d - a.d);
    for (const { p } of parts) {
      const col = partColor(m, i, p.mat);
      if (p.k === 'cap') drawCapsule(g, cam, L, p.a, p.b, p.r, col); else drawSphere(g, cam, L, p.c, p.r, col);
    }
  }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}

export function drawShirt(g, cx, cy, hex) {
  g.save();
  g.beginPath();
  g.moveTo(cx - 6, cy - 10); g.lineTo(cx - 13, cy - 6); g.lineTo(cx - 10, cy - 1); g.lineTo(cx - 7.5, cy - 2.5);
  g.lineTo(cx - 7.5, cy + 10); g.lineTo(cx + 7.5, cy + 10); g.lineTo(cx + 7.5, cy - 2.5); g.lineTo(cx + 10, cy - 1);
  g.lineTo(cx + 13, cy - 6); g.lineTo(cx + 6, cy - 10);
  g.quadraticCurveTo(cx, cy - 5.5, cx - 6, cy - 10);
  g.closePath();
  g.fillStyle = hex; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineJoin = 'round'; g.stroke();
  g.restore();
}
