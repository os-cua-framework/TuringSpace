import * as W from './_corridor_watch_mark_door_world.js';

const { DIRS, PLANE, EYE, WALL_H, HORIZON, DOOR_U, DOOR_V, MIRROR, WINDOW, PIC, POSTER } = W;
export const COLORS = { red: [198, 32, 26], orange: [226, 116, 34], maroon: [104, 40, 36] };
function hash2(a, b) { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const PIC_STYLES = [
  { sky: [126, 170, 208], hill: [92, 138, 84], sun: [244, 214, 120] },
  { sky: [236, 176, 132], hill: [120, 96, 140], sun: [250, 236, 190] },
  { sky: [170, 200, 214], hill: [64, 112, 120], sun: [255, 255, 240] },
  { sky: [214, 200, 160], hill: [150, 110, 70], sun: [240, 120, 80] },
];
const POSTER_STYLES = [{ bg: [196, 36, 34], fg: [246, 236, 214] }, { bg: [214, 44, 40], fg: [255, 214, 120] }, { bg: [180, 28, 40], fg: [240, 240, 240] }];
const PAINT = { main: { wain: [150, 166, 150], plaster: [236, 226, 206], trim: [238, 235, 228] }, annex: { wain: [128, 146, 170], plaster: [214, 222, 232], trim: [232, 236, 242] } };

function doorPx(u, v, color, out) {
  if (!(u > DOOR_U[0] - 0.035 && u < DOOR_U[1] + 0.035 && v < DOOR_V + 0.04)) return false;
  if (u < DOOR_U[0] || u > DOOR_U[1] || v > DOOR_V) { out[0] = 240; out[1] = 238; out[2] = 232; return true; }
  const C = COLORS[color];
  let r = C[0], g = C[1], b = C[2];
  const pu = (u - DOOR_U[0]) / (DOOR_U[1] - DOOR_U[0]), pv = v / DOOR_V;
  const inPanel = (pu > 0.16 && pu < 0.84) && ((pv > 0.1 && pv < 0.46) || (pv > 0.56 && pv < 0.9));
  const edge = (pu > 0.14 && pu < 0.86) && ((pv > 0.085 && pv < 0.475) || (pv > 0.545 && pv < 0.915)) && !inPanel;
  if (edge) { r *= 0.72; g *= 0.72; b *= 0.72; } else if (inPanel) { r *= 0.88; g *= 0.88; b *= 0.88; }
  const kx = (pu - 0.86) / 0.035, ky = (pv - 0.47) / 0.025;
  if (kx * kx + ky * ky < 1) { r = 222; g = 182; b = 84; }
  out[0] = r; out[1] = g; out[2] = b; return true;
}
function picturePx(u, v, style, out) {
  if (!(u > PIC.u[0] && u < PIC.u[1] && v > PIC.v[0] && v < PIC.v[1])) return false;
  if (u < 0.335 || u > 0.665 || v < 0.865 || v > 1.235) { out[0] = 92; out[1] = 62; out[2] = 40; return true; }
  const S = PIC_STYLES[style % PIC_STYLES.length];
  const pu = (u - 0.335) / 0.33, pv = (v - 0.865) / 0.37;
  const hill = 0.42 + 0.12 * Math.sin(pu * 7 + style) + 0.06 * Math.sin(pu * 17);
  const sx = pu - 0.7, sy = pv - 0.74;
  if (sx * sx + sy * sy < 0.012) { out[0] = S.sun[0]; out[1] = S.sun[1]; out[2] = S.sun[2]; return true; }
  const c = pv < hill ? S.hill : S.sky, k = pv < hill ? 0.8 + 0.4 * pv : 0.85 + 0.25 * pv;
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return true;
}
function posterPx(u, v, style, out) {
  if (!(u > POSTER.u[0] && u < POSTER.u[1] && v > POSTER.v[0] && v < POSTER.v[1])) return false;
  const S = POSTER_STYLES[style % POSTER_STYLES.length];
  const pu = (u - POSTER.u[0]) / (POSTER.u[1] - POSTER.u[0]), pv = (v - POSTER.v[0]) / (POSTER.v[1] - POSTER.v[0]);
  if (pu < 0.025 || pu > 0.975 || pv < 0.02 || pv > 0.98) { out[0] = 248; out[1] = 248; out[2] = 246; return true; }
  let fg = false;
  if (style % 3 === 0) { const dx = pu - 0.5, dy = (pv - 0.62) * 1.5; fg = Math.abs(Math.hypot(dx, dy) - 0.22) < 0.045; }
  else if (style % 3 === 1) fg = pv > 0.18 && pv < 0.34 && ((pu * 10) | 0) % 2 === 0;
  else { const dx = pu - 0.5, dy = (pv - 0.6) * 1.4, a = Math.atan2(dy, dx); fg = Math.hypot(dx, dy) < 0.12 + 0.07 * Math.cos(a * 5); }
  if (pv > 0.12 && pv < 0.16 && pu > 0.2 && pu < 0.8) fg = true;
  const c = fg ? S.fg : S.bg;
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return true;
}
function plainWall(u, v, P, out) {
  if (v < 0.085) { const t = v > 0.075 ? 0.86 : 1; out[0] = P.trim[0] * t; out[1] = P.trim[1] * t; out[2] = P.trim[2] * t; return; }
  if (v < 0.6) { const g = (u * 6) % 1 < 0.035 ? 0.88 : 1; out[0] = P.wain[0] * g; out[1] = P.wain[1] * g; out[2] = P.wain[2] * g; return; }
  if (v < 0.65) { const t = v < 0.61 || v > 0.64 ? 0.9 : 1; out[0] = P.trim[0] * t; out[1] = P.trim[1] * t; out[2] = P.trim[2] * t; return; }
  if (v > WALL_H - 0.05) { out[0] = P.trim[0] + 6; out[1] = P.trim[1] + 7; out[2] = P.trim[2] + 8; return; }
  const n = (hash2((u * 90) | 0, (v * 90) | 0) - 0.5) * 6;
  out[0] = P.plaster[0] + n; out[1] = P.plaster[1] + n; out[2] = P.plaster[2] + n;
}
function wallColor(m, face, u, v, out) {
  if (face.c === m.door.col && face.r === m.door.row && face.d === m.door.dir && doorPx(u, v, 'red', out)) return;
  const dc = W.decorAt(m, face.c, face.r, face.d);
  if (dc) {
    if (dc.kind === 'door' && doorPx(u, v, dc.color, out)) return;
    if (dc.kind === 'picture' && picturePx(u, v, dc.style, out)) return;
    if (dc.kind === 'poster' && posterPx(u, v, dc.style, out)) return;
    if (dc.kind === 'mirror' && u > MIRROR.u[0] - 0.03 && u < MIRROR.u[1] + 0.03 && v > MIRROR.v[0] - 0.03 && v < MIRROR.v[1] + 0.03) { out[0] = 120; out[1] = 92; out[2] = 58; return; }
    if (dc.kind === 'window' && u > WINDOW.u[0] - 0.035 && u < WINDOW.u[1] + 0.035 && v > WINDOW.v[0] - 0.04 && v < WINDOW.v[1] + 0.035) { out[0] = 246; out[1] = 246; out[2] = 244; return; }
  }
  plainWall(u, v, PAINT.main, out);
}
function annexWall(w, face, u, v, out) {
  const af = W.annexDoorFace(w);
  if (face.c === af.col && face.r === af.row && face.d === af.dir && doorPx(u, v, 'red', out)) return;
  plainWall(u, v, PAINT.annex, out);
}
function floorColor(x, z, out) {
  const plank = Math.floor(x * 6), run = z * 0.9 + hash2(plank, 7) * 3, piece = Math.floor(run);
  const tone = 0.9 + 0.16 * hash2(plank, piece);
  const fx = x * 6 - plank;
  const grain = 0.97 + 0.03 * Math.sin(z * 70 + 3 * Math.sin(x * 50 + plank * 1.7));
  const seam = fx < 0.04 || run - piece < 0.012 ? 0.72 : 1;
  const k = tone * grain * seam;
  out[0] = 188 * k; out[1] = 140 * k; out[2] = 96 * k;
}
function annexFloor(x, z, out) {
  const tx = x * 3, tz = z * 3, fx = tx - Math.floor(tx), fz = tz - Math.floor(tz);
  const k = (fx < 0.05 || fz < 0.05 ? 0.78 : 1) * (0.94 + 0.08 * hash2(Math.floor(tx) + 99, Math.floor(tz)));
  out[0] = 176 * k; out[1] = 178 * k; out[2] = 180 * k;
}
function ceilColor(x, z, out) {
  const fx = x - Math.floor(x) - 0.5, fz = z - Math.floor(z) - 0.5, d2 = fx * fx + fz * fz;
  if (d2 < 0.011) { out[0] = 255; out[1] = 252; out[2] = 236; return; }
  const glow = Math.exp(-d2 / 0.05) * 18;
  out[0] = 226 + glow; out[1] = 224 + glow; out[2] = 218 + glow;
}
function floorLight(isF, x, z) {
  const c = Math.floor(x), r = Math.floor(z), fx = x - c, fz = z - r;
  const dx = fx - 0.5, dz = fz - 0.5;
  let L = 0.78 + 0.32 * Math.exp(-(dx * dx + dz * dz) / 0.09);
  const ao = (t) => 1 - 0.28 * Math.exp(-t / 0.05);
  if (!isF(c, r - 1)) L *= ao(fz);
  if (!isF(c, r + 1)) L *= ao(1 - fz);
  if (!isF(c - 1, r)) L *= ao(fx);
  if (!isF(c + 1, r)) L *= ao(1 - fx);
  return L;
}
const shadeOf = (d) => 1 / (1 + 0.035 * d * d);
function wallLight(isF, h, dist) {
  const sideL = (h.d === 1 || h.d === 3) ? 0.84 : 1;
  const lc = [h.c + DIRS[(h.d + 3) % 4][0], h.r + DIRS[(h.d + 3) % 4][1]];
  const rc = [h.c + DIRS[(h.d + 1) % 4][0], h.r + DIRS[(h.d + 1) % 4][1]];
  let corner = 1;
  if (!isF(lc[0], lc[1])) corner *= 1 - 0.22 * Math.exp(-h.u / 0.06);
  if (!isF(rc[0], rc[1])) corner *= 1 - 0.22 * Math.exp(-(1 - h.u) / 0.06);
  return sideL * corner * shadeOf(dist);
}
const BODY = { leg: [58, 60, 70], coat: [44, 112, 120], skin: [214, 170, 138], hair: [58, 42, 32] };
function bodyHit(px, pz, hx, hz, qx, qz, tFrom, tTo) {
  const hit = (R) => { const ox = hx - px, oz = hz - pz, A = qx * qx + qz * qz, B = 2 * (ox * qx + oz * qz), C = ox * ox + oz * oz - R * R, D = B * B - 4 * A * C; if (D <= 0) return null; const s = (-B - Math.sqrt(D)) / (2 * A); return s > 0 && tFrom + s < tTo ? { t: tFrom + s, nx: (ox + s * qx) / R, nz: (oz + s * qz) / R } : null; };
  return { body: hit(W.BODY_R), head: hit(0.075) };
}

export function renderFrame(m, pose, Wd, Hd, buf = null) {
  const data = buf && buf.length === Wd * Hd * 4 ? buf : new Uint8ClampedArray(Wd * Hd * 4);
  const pd = (Wd / 2) / PLANE, y0 = Hd * HORIZON, col = [0, 0, 0];
  const isF = (c, r) => W.isFloor(m, c, r);
  const put = (i, L, tint) => {
    let r = col[0] * L, g = col[1] * L, b = col[2] * L;
    if (tint) { r = r * tint[0] + tint[3]; g = g * tint[1] + tint[3]; b = b * tint[2] + tint[3]; }
    data[i] = r > 255 ? 255 : r; data[i + 1] = g > 255 ? 255 : g; data[i + 2] = b > 255 ? 255 : b; data[i + 3] = 255;
  };
  for (let x = 0; x < Wd; x++) {
    const camX = (2 * (x + 0.5)) / Wd - 1;
    const cf = W.castFull(m, pose, camX), h = cf.h;
    const dist = Math.max(1e-3, h.t);
    const top = y0 - (WALL_H - EYE) * pd / dist, bot = y0 + EYE * pd / dist;
    const face = { c: h.c, r: h.r, d: h.d };
    const wallL = wallLight(isF, h, dist);
    let ap = null;
    if (cf.via) {
      const h2 = cf.h2, dist2 = Math.max(1e-3, h2.t), mirror = cf.via === 'mirror';
      const w = mirror ? null : W.decorAt(m, h.c, h.r, h.d), isF2 = mirror ? isF : W.annexIsF(w);
      const A = mirror ? MIRROR : WINDOW;
      ap = { m, h2, dist2, mirror, w, isF2, A, wl: wallLight(isF2, h2, dist2), bh: mirror ? bodyHit(pose.x, pose.z, cf.hp[0], cf.hp[1], cf.r2[0], cf.r2[1], h.t, h2.t) : null };
    }
    for (let y = 0; y < Hd; y++) {
      const i = (y * Wd + x) * 4, yc = y + 0.5;
      if (yc >= top && yc < bot) {
        const v = EYE + (y0 - yc) * dist / pd;
        if (ap && v > ap.A.v[0] && v < ap.A.v[1]) {
          if (!ap.mirror && (Math.abs(h.u - 0.5) < 0.014 || Math.abs(v - 0.83) < 0.018)) {
            col[0] = 244; col[1] = 244; col[2] = 242; put(i, wallL); continue;
          }
          shadeSecond(ap, cf, pose, yc, y0, pd, col);
          const sheen = ((h.u * 2.2 + v * 0.9) % 1) < 0.07 ? 16 : 0;
          const tint = ap.mirror ? [0.9, 0.93, 0.96, 4 + sheen * 0.5] : [0.9, 0.94, 0.98, 10 + sheen + 10 * Math.max(0, (v - 0.8))];
          put(i, 1, tint); continue;
        }
        wallColor(m, face, h.u, v, col);
        const vl = 0.9 + 0.1 * Math.min(1, v / WALL_H), floorAO = 1 - 0.25 * Math.exp(-v / 0.06);
        put(i, wallL * vl * floorAO);
      } else if (yc >= bot) {
        const rd = EYE * pd / (yc - y0), wx = pose.x + rd * cf.rx, wz = pose.z + rd * cf.rz;
        floorColor(wx, wz, col); put(i, floorLight(isF, wx, wz) * shadeOf(rd));
      } else {
        const rd = (WALL_H - EYE) * pd / (y0 - yc), wx = pose.x + rd * cf.rx, wz = pose.z + rd * cf.rz;
        ceilColor(wx, wz, col); put(i, shadeOf(rd) * 0.97);
      }
    }
  }
  return { w: Wd, h: Hd, data };
}
function shadeSecond(ap, cf, pose, yc, y0, pd, col) {
  const h = cf.h, h2 = ap.h2, slope = (y0 - yc) / pd;
  const at = (t) => (t <= h.t ? [pose.x + t * cf.rx, pose.z + t * cf.rz] : [cf.hp[0] + (t - h.t) * cf.r2[0], cf.hp[1] + (t - h.t) * cf.r2[1]]);
  if (ap.bh) {
    for (const [k, R] of [['head', 0.075], ['body', W.BODY_R]]) {
      const b = ap.bh[k]; if (!b) continue;
      const vb = EYE + slope * b.t;
      const inPart = k === 'head' ? vb > EYE - 0.14 && vb < W.BODY_TOP : vb >= 0 && vb <= EYE - 0.14;
      if (!inPart) continue;
      const c = k === 'head' ? (vb > EYE - 0.02 ? BODY.hair : BODY.skin) : (vb < 0.44 ? BODY.leg : BODY.coat);
      const lam = 0.62 + 0.38 * Math.max(0, -(b.nx * cf.r2[0] + b.nz * cf.r2[1]) / Math.hypot(cf.r2[0], cf.r2[1]));
      const L = lam * shadeOf(b.t);
      col[0] = c[0] * L; col[1] = c[1] * L; col[2] = c[2] * L; return;
    }
  }
  const v2 = EYE + slope * ap.dist2;
  if (v2 >= 0 && v2 <= WALL_H) {
    const f2 = { c: h2.c, r: h2.r, d: h2.d };
    if (ap.mirror) wallColor(ap.m, f2, h2.u, v2, col); else annexWall(ap.w, f2, h2.u, v2, col);
    const vl = 0.9 + 0.1 * Math.min(1, v2 / WALL_H), floorAO = 1 - 0.25 * Math.exp(-v2 / 0.06);
    const L = ap.wl * vl * floorAO; col[0] *= L; col[1] *= L; col[2] *= L; return;
  }
  if (v2 < 0) {
    const rd = EYE / -slope, p = at(rd);
    if (ap.mirror) floorColor(p[0], p[1], col); else annexFloor(p[0], p[1], col);
    const L = floorLight(ap.isF2, p[0], p[1]) * shadeOf(rd); col[0] *= L; col[1] *= L; col[2] *= L; return;
  }
  const rd = (WALL_H - EYE) / slope, p = at(rd);
  ceilColor(p[0], p[1], col);
  const L = shadeOf(rd) * 0.97; col[0] *= L; col[1] *= L; col[2] *= L;
}
