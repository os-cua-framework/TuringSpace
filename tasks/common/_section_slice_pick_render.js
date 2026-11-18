import { hitSolid, inside, planePoint, section, bbox, dot, sub, add, mul, norm, cross } from './_section_slice_pick_geom.js';

export function camera(cam) {
  const ps = cam.yaw * Math.PI / 180, ph = cam.pitch * Math.PI / 180;
  const c = [Math.sin(ps) * Math.cos(ph), Math.sin(ph), Math.cos(ps) * Math.cos(ph)];
  const r = [Math.cos(ps), 0, -Math.sin(ps)];
  const u = [-Math.sin(ps) * Math.sin(ph), Math.cos(ph), -Math.cos(ps) * Math.sin(ph)];
  return { c, r, u };
}

export function planeAxes(n, cam, kind) {
  let v;
  if (Math.abs(n[1]) > 0.999) {
    v = norm([-cam.c[0], 0, -cam.c[2]]);
    if (kind === 'block' || kind === 'cube' || kind === 'pyr') {
      let best = null;
      for (const a of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (!best || dot(a, v) > dot(best, v)) best = a;
      v = best;
    }
  } else v = norm(sub([0, 1, 0], mul(n, n[1])));
  let u = norm(cross(v, n));
  if (dot(u, cam.r) < 0) u = mul(u, -1);
  return { u, v };
}

function paneHalf(solid) {
  const w = solid.kind === 'block' || solid.kind === 'cube' ? Math.SQRT2 : solid.R;
  return Math.hypot(w, solid.H / 2) + 0.12;
}
export function fullPlane(solid, pl, cam) {
  const n = dot(pl.n, cam.c) < 0 ? mul(pl.n, -1) : pl.n;
  const { u, v } = planeAxes(n, cam, solid.kind);
  const P = { n, p: pl.p, u, v };
  const sec = section(solid, P);
  const rel = sub([0, solid.H / 2, 0], pl.p);
  const sc = dot(rel, u), tc = dot(rel, v), half = paneHalf(solid);
  let t0 = tc - half;
  if (v[1] > 1e-6) t0 = Math.max(t0, (-0.02 - pl.p[1]) / v[1]);
  return { ...P, s0: sc - half, s1: sc + half, t0, t1: tc + half, sec };
}

function solidBoxPts(solid) {
  const H = solid.H, w = solid.kind === 'block' || solid.kind === 'cube' ? 1 : solid.R;
  const pts = [];
  for (const x of [-w, w]) for (const y of [0, H]) for (const z of [-w, w]) pts.push([x, y, z]);
  return pts;
}

export function fitView(solid, FP, cam, W, H, pad = 30) {
  const pts = solidBoxPts(solid);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const a = dot(p, cam.r), b = dot(p, cam.u); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
  const s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0));
  return { s, cx: W / 2 - s * (x0 + x1) / 2, cy: H / 2 + s * (y0 + y1) / 2 };
}

const SOLID_RGB = [214, 205, 188], PLANE_RGB = [238, 126, 40], CUT_RGB = [196, 78, 18], INK = [52, 58, 66];
const LIGHT = norm([-0.45, 0.8, 0.42]);

export function renderScene(solid, FP, camSpec, W, H, q = 2, look = null) {
  const cam = camera(camSpec);
  const PLANE = look ? look.plane : PLANE_RGB, CUT = look ? look.cut : CUT_RGB, INKC = look ? look.ink : INK, LGT = look ? look.light : LIGHT;
  const TMP = [0, 0, 0];
  const view = fitView(solid, FP, cam, W, H);
  const ss = q >= 2 ? 1 : 2, k = q * ss;
  const w = Math.round(W * k), h = Math.round(H * k), N = w * h;
  const face = new Int16Array(N).fill(-1), front = new Uint8Array(N), inq = new Uint8Array(N);
  const col = new Float32Array(N * 3);
  const d = mul(cam.c, -1);
  const den = dot(FP.n, d);
  for (let py = 0; py < h; py++) {
    const b = (view.cy - (py + 0.5) / k) / view.s;
    const g0 = 1 - 0.07 * (py / h);
    for (let px = 0; px < w; px++) {
      const a = ((px + 0.5) / k - view.cx) / view.s;
      const o = add(add(mul(cam.r, a), mul(cam.u, b)), mul(cam.c, 30));
      const i = py * w + px, o3 = i * 3;
      const hit = hitSolid(solid, o, d);
      let r = 240 * g0, g = 243 * g0, bl = 247 * g0;
      if (hit) {
        face[i] = hit.face;
        let lam = 0.4 + 0.6 * Math.max(0, dot(hit.n, LGT));
        if (hit.face === 30) lam *= 0.62;
        if (look) { look.solid(o[0] + hit.l * d[0], o[1] + hit.l * d[1], o[2] + hit.l * d[2], hit.n, 1 / (view.s * k), TMP); r = TMP[0] * lam; g = TMP[1] * lam; bl = TMP[2] * lam; }
        else { r = SOLID_RGB[0] * lam; g = SOLID_RGB[1] * lam; bl = SOLID_RGB[2] * lam; }
      } else {
        if (d[1] < 0) {
          const l = -o[1] / d[1], gx = o[0] + l * d[0], gz = o[2] + l * d[2];
          if (look) { look.floor(gx, gz, 1 / (view.s * k * Math.max(0.2, -d[1])), TMP); r = TMP[0] * g0; g = TMP[1] * g0; bl = TMP[2] * g0; }
          const sq = solid.kind === 'block' || solid.kind === 'cube' || solid.kind === 'pyr';
          const rr = sq ? Math.max(Math.abs(gx), Math.abs(gz)) : Math.hypot(gx, gz);
          const R0 = sq ? 1 : solid.R;
          const sh = Math.max(0, Math.min(1, (R0 + 0.28 - rr) / 0.28));
          const f = 1 - 0.13 * sh;
          r *= f; g *= f; bl *= f;
        }
      }
      if (Math.abs(den) > 1e-9) {
        const lp = dot(FP.n, sub(FP.p, o)) / den;
        const qp = add(o, mul(d, lp)), rel = sub(qp, FP.p);
        const su = dot(rel, FP.u), tv = dot(rel, FP.v);
        if (su >= FP.s0 && su <= FP.s1 && tv >= FP.t0 && tv <= FP.t1) {
          inq[i] = 1;
          if (!hit || lp < hit.l) {
            front[i] = 1;
            const al = 0.34;
            r = r * (1 - al) + PLANE[0] * al; g = g * (1 - al) + PLANE[1] * al; bl = bl * (1 - al) + PLANE[2] * al;
          }
        }
      }
      col[o3] = r; col[o3 + 1] = g; col[o3 + 2] = bl;
    }
  }
  const out = new Float32Array(col);
  const paint = (i, rgb, a) => { const o3 = i * 3; out[o3] = out[o3] * (1 - a) + rgb[0] * a; out[o3 + 1] = out[o3 + 1] * (1 - a) + rgb[1] * a; out[o3 + 2] = out[o3 + 2] * (1 - a) + rgb[2] * a; };
  const lw = Math.max(1, Math.round(k * 0.8));
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = py * w + px;
    let ink = false, cut = false, border = false;
    for (let dd = 1; dd <= lw; dd++) {
      for (const j of [px + dd < w ? i + dd : -1, py + dd < h ? i + dd * w : -1, px - dd >= 0 ? i - dd : -1, py - dd >= 0 ? i - dd * w : -1]) {
        if (j < 0) continue;
        if (face[j] !== face[i] && (face[i] >= 0 || face[j] >= 0)) {
          if (face[i] >= 0) ink = true;
        }
        if (face[i] >= 0 && face[j] >= 0 && inq[i] && inq[j] && front[i] !== front[j]) cut = true;
        if (inq[i] !== inq[j] && inq[i] && (front[i] || face[i] < 0)) border = true;
      }
    }
    if (ink) paint(i, INKC, 0.78);
    if (border) paint(i, CUT, 0.7);
    if (cut) paint(i, CUT, 0.95);
  }
  const OW = Math.round(W * q), OH = Math.round(H * q);
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const ix = x * ss + sx, iy = y * ss + sy;
      if (ix >= w || iy >= h) continue;
      const o3 = (iy * w + ix) * 3; r += out[o3]; g += out[o3 + 1]; b += out[o3 + 2]; n++;
    }
    const o4 = (y * OW + x) * 4;
    data[o4] = r / n; data[o4 + 1] = g / n; data[o4 + 2] = b / n; data[o4 + 3] = 255;
  }
  return { data, w: OW, h: OH };
}

export function renderSection(solid, FP, W, H, q = 2, bg = [246, 248, 250], look = null) {
  const b = bbox(FP.sec.outer);
  const pad = 9;
  const sc = Math.min((W - 2 * pad) / b.w, (H - 2 * pad) / b.h);
  const cs = (b.x0 + b.x1) / 2, ct = (b.y0 + b.y1) / 2;
  const ss = 2, k = q * ss, w = Math.round(W * k), h = Math.round(H * k);
  const ins = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const s = cs + ((px + 0.5) / k - W / 2) / sc, t = ct - ((py + 0.5) / k - H / 2) / sc;
    ins[py * w + px] = inside(solid, planePoint(FP, s, t)) ? 1 : 0;
  }
  const FILL = look ? look.fill : [247, 196, 150], EDGE = look ? look.edge : [178, 72, 20];
  const lw = Math.max(1, Math.round(k * 0.9));
  const OW = Math.round(W * q), OH = Math.round(H * q);
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let r = 0, g = 0, bl = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const ix = x * ss + sx, iy = y * ss + sy, i = iy * w + ix;
      let edge = false;
      for (let dd = 1; dd <= lw && !edge; dd++) {
        for (const [jx, jy] of [[ix + dd, iy], [ix - dd, iy], [ix, iy + dd], [ix, iy - dd]]) {
          const o = jx < 0 || jy < 0 || jx >= w || jy >= h ? 0 : ins[jy * w + jx];
          if (o !== ins[i]) { edge = true; break; }
        }
      }
      const c = edge && ins[i] ? EDGE : edge ? mixc(bg, EDGE, 0.55) : ins[i] ? FILL : bg;
      r += c[0]; g += c[1]; bl += c[2];
    }
    const o4 = (y * OW + x) * 4, n = ss * ss;
    data[o4] = r / n; data[o4 + 1] = g / n; data[o4 + 2] = bl / n; data[o4 + 3] = 255;
  }
  return { data, w: OW, h: OH };
}
const mixc = (a, b, t) => [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];

export function toCanvas(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
