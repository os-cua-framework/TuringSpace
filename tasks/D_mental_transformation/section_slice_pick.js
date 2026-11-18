import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { SOLIDS, EXT_SOLIDS, section, widths, yRange, prismTri, dot, norm, cross, mul, sub, convexSection } from '../common/_section_slice_pick_geom.js';
import { camera, fullPlane, renderScene, renderSection, toCanvas } from '../common/_section_slice_pick_render.js';
import { buildSectionLook } from '../common/_section_slice_pick_look.js';
import { hashStr } from '../core/rng.js';
import { nthOf } from '../core/style.js';

const HARD = Object.freeze({ rounds: 1, cards: 6, minFacing: 0.33 });
const EXT_CARDS = 4;
const PANEL_W = 560;
const BOARD = { w: PANEL_W - 20, h: 352 };
const SCENE = { x: 0, y: 0, w: BOARD.w, h: 222 };
const CARD = { y: 232, w: 82, h: 90, gap: 8 };
const KINDS6 = Object.freeze({
  cyl: ['circle', 'ell_mid', 'ell_steep', 'dshape', 'rect_c', 'rect_off'],
  cone: ['circle', 'ell_mid', 'ell_steep', 'triangle', 'arch_near', 'arch_far'],
  prism: ['tri', 'tri_mid', 'tri_steep', 'rect_wide', 'rect_narrow', 'trap'],
  block: ['sq_hole', 'ehole_mid', 'ehole_steep', 'bars', 'bars_off', 'rect'],
});
const KINDS = Object.freeze({
  cyl: ['circle', 'ellipse', 'dshape', 'rect'],
  cone: ['circle', 'ellipse', 'triangle', 'arch'],
  prism: ['tri', 'tri_long', 'rect', 'trap'],
  block: ['sq_hole', 'bars', 'rect', 'rect_ehole'],
});
const EXT_KINDS = Object.freeze({
  cube: ['square', 'rect', 'triangle', 'hexagon'], pyr: ['square', 'triangle', 'trapezoid', 'pentagon'],
  tube: ['ring', 'bars', 'rect', 'oval_ring'], hex: ['hexagon', 'rect', 'long_hex'],
});
function polyStats(solid, P) {
  const v = convexSection(solid, P);
  let mn = Infinity, mx = 0;
  for (let i = 0; i < v.length; i++) { const e = Math.hypot(...sub(v[(i + 1) % v.length], v[i])); mn = Math.min(mn, e); mx = Math.max(mx, e); }
  return { n: v.length, ratio: mx > 0 ? mn / mx : 0 };
}
const D2R = Math.PI / 180;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const vr4 = (a) => a.map(r4);

export function cardRect(i, top = false, n = HARD.cards) {
  const x0 = (BOARD.w - (n * CARD.w + (n - 1) * CARD.gap)) / 2;
  return { x: x0 + i * (CARD.w + CARD.gap), y: top ? CARD_TOP_Y : CARD.y, w: CARD.w, h: CARD.h };
}
const CARD_TOP_Y = 8, SCENE_BELOW_Y = BOARD.h - SCENE.h;
const cardsOnTop = (env) => !!(env && env.style && env.assets && env.assets.sspLook && env.assets.sspLook.cardsOnTop);

const nFrom = (th, al) => [Math.sin(th) * Math.cos(al), Math.cos(th), Math.sin(th) * Math.sin(al)];
const tiltOf = (n) => Math.acos(Math.min(1, Math.abs(n[1]))) / D2R;
const horiz = (n) => { const l = Math.hypot(n[0], n[2]); return l < 1e-9 ? [0, 0, 0] : [n[0] / l, 0, n[2] / l]; };

const leanOK = (h, th, cam) => Math.abs(dot(h, cam.r)) >= 0.5 && Math.abs(dot(nFrom(th, Math.atan2(h[2], h[0])), cam.c)) >= 0.38;
function sidewaysAz(rng, cam, th) {
  for (let t = 0; t < 80; t++) { const a = rng.uniform(0, 2 * Math.PI); if (leanOK([Math.cos(a), 0, Math.sin(a)], th, cam)) return a; }
  return null;
}
const FACE = [0.4, 0.62];
function facingAz(rng, cam) {
  for (let t = 0; t < 80; t++) { const a = rng.uniform(0, 2 * Math.PI); const f = Math.abs(Math.cos(a) * cam.c[0] + Math.sin(a) * cam.c[2]); if (f >= FACE[0] && f <= FACE[1]) return a; }
  return Math.atan2(cam.c[2], cam.c[0]) + 1.0;
}

function altitudeDirs(solid) {
  const out = [];
  for (const v of prismTri(solid)) { const a = norm([v[0], 0, v[1]]); out.push(a, mul(a, -1)); }
  return out;
}

function triChord(T, h, s) {
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const a = T[k], b = T[(k + 1) % 3];
    const fa = h[0] * a[0] + h[2] * a[1] - s, fb = h[0] * b[0] + h[2] * b[1] - s;
    if ((fa <= 0 && fb > 0) || (fa > 0 && fb <= 0)) { const t = fa / (fa - fb); pts.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return pts.length === 2 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : 0;
}

function makePlane(solid, kind, rng, cam) {
  const { R, H } = solid;
  const up = [0, 1, 0];
  switch (`${solid.kind}:${kind}`) {
    case 'cyl:circle': case 'cone:circle': case 'prism:tri': case 'block:sq_hole': {
      const lo = solid.kind === 'cone' ? 0.5 : 0.8, hi = solid.kind === 'cone' ? 1.25 : H - lo;
      return { n: up, p: [0, rng.uniform(lo, hi), 0] };
    }
    case 'cyl:ellipse': {
      const th = rng.uniform(45, 50) * D2R, a = sidewaysAz(rng, cam, th);
      return a === null ? null : { n: nFrom(th, a), p: [0, H / 2 + rng.uniform(-0.05, 0.05), 0] };
    }
    case 'cyl:dshape': {
      const th = rng.uniform(57, 63) * D2R, a = sidewaysAz(rng, cam, th);
      return a === null ? null : { n: nFrom(th, a), p: [0, 0.15 + R * Math.tan(th) + rng.uniform(0.03, 0.12), 0] };
    }
    case 'cyl:rect': case 'cone:triangle': case 'cone:arch': {
      const a = facingAz(rng, cam);
      let n = nFrom(Math.PI / 2, a);
      if (dot(n, cam.c) < 0) n = mul(n, -1);
      const d = kind === 'rect' ? rng.uniform(0, 0.4) * rng.sign() : kind === 'arch' ? rng.uniform(0.36, 0.49) * R : 0;
      return { n, p: [n[0] * d, H * 0.45, n[2] * d] };
    }
    case 'cone:ellipse': {
      const th = rng.uniform(42, 48) * D2R, k = R / H;
      let y0 = null;
      for (let y = 0.8; y <= 2.0; y += 0.01) { const rho = R * (1 - y / H) / (1 - k * Math.tan(th)); if (y - rho * Math.tan(th) >= 0.16) { y0 = y; break; } }
      const a = sidewaysAz(rng, cam, th);
      if (y0 === null || a === null) return null;
      return { n: nFrom(th, a), p: [0, y0 + rng.uniform(0.04, 0.16), 0] };
    }
    case 'prism:rect': {
      const T = prismTri(solid);
      for (let t = 0; t < 40; t++) {
        const a = facingAz(rng, cam), n = nFrom(Math.PI / 2, a), d = rng.uniform(-0.45, 0.45);
        const c = triChord(T, n, d);
        if (c >= 0.8 && c <= 1.65) return { n, p: [n[0] * d, H / 2, n[2] * d] };
      }
      return null;
    }
    case 'prism:tri_long': {
      const th = rng.uniform(47, 51) * D2R;
      const opts = altitudeDirs(solid).filter((h) => leanOK(h, th, cam));
      if (!opts.length) return null;
      const h = rng.pick(opts);
      const pr = prismTri(solid).map((v) => v[0] * h[0] + v[1] * h[2]);
      const mid = (Math.min(...pr) + Math.max(...pr)) / 2;
      return { n: norm([Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]]), p: [0, H / 2 + Math.tan(th) * mid + rng.uniform(-0.04, 0.04), 0] };
    }
    case 'prism:trap': {
      const th = rng.uniform(66.5, 69) * D2R, span = H / Math.tan(th);
      const opts = altitudeDirs(solid).filter((h) => leanOK(h, th, cam));
      if (!opts.length) return null;
      const h = rng.pick(opts);
      const apexward = prismTri(solid).some((v) => dot(norm([v[0], 0, v[1]]), h) > 1 - 1e-9) ? h : mul(h, -1);
      const sLo = rng.uniform(-R / 2 + 0.08, 0.6 * R - span);
      const sMid = sLo + span / 2;
      const n = norm([Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]]);
      return { n, p: [apexward[0] * sMid, H / 2, apexward[2] * sMid] };
    }
    case 'block:bars': case 'block:rect': {
      const axes = [[1, 0, 0], [0, 0, 1]].filter((a) => Math.abs(dot(a, cam.c)) >= 0.42);
      if (!axes.length) return null;
      const ax = rng.pick(axes), sg = rng.sign();
      const d = kind === 'bars' ? rng.uniform(-0.1, 0.1) : sg * rng.uniform(0.64, 0.82);
      return { n: ax, p: [ax[0] * d, H / 2, ax[2] * d] };
    }
    case 'block:rect_ehole': {
      const th = rng.uniform(44, 50) * D2R;
      const hs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].filter((h) => Math.abs(dot(h, cam.r)) >= 0.45 && Math.abs(dot(nFrom(th, Math.atan2(h[2], h[0])), cam.c)) >= 0.38);
      if (!hs.length) return null;
      const h = rng.pick(hs);
      return { n: [Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]], p: [0, H / 2, 0] };
    }
    case 'cyl:ell_mid': case 'cyl:ell_steep': {
      const th = (kind === 'ell_mid' ? rng.uniform(37, 38) : rng.uniform(51.2, 52)) * D2R, a = sidewaysAz(rng, cam, th);
      return a === null ? null : { n: nFrom(th, a), p: [0, H / 2 + rng.uniform(-0.01, 0.01), 0] };
    }
    case 'cyl:rect_c': case 'cyl:rect_off': case 'cone:arch_near': case 'cone:arch_far': {
      const a = facingAz(rng, cam);
      let n = nFrom(Math.PI / 2, a);
      if (dot(n, cam.c) < 0) n = mul(n, -1);
      const d = kind === 'rect_c' ? rng.uniform(0, 0.12) * rng.sign() : kind === 'rect_off' ? rng.uniform(0.64, 0.72) * R
        : kind === 'arch_near' ? rng.uniform(0.36, 0.44) * R : rng.uniform(0.64, 0.72) * R;
      return { n, p: [n[0] * d, H * 0.45, n[2] * d] };
    }
    case 'cone:ell_mid': case 'cone:ell_steep': {
      const th = (kind === 'ell_mid' ? rng.uniform(33.5, 34.5) : rng.uniform(46, 48)) * D2R, k = R / H;
      let y0 = null;
      for (let y = 0.8; y <= 2.0; y += 0.01) { const rho = R * (1 - y / H) / (1 - k * Math.tan(th)); if (y - rho * Math.tan(th) >= 0.16) { y0 = y; break; } }
      const a = sidewaysAz(rng, cam, th);
      if (y0 === null || a === null) return null;
      return { n: nFrom(th, a), p: [0, y0 + rng.uniform(0.04, 0.16), 0] };
    }
    case 'prism:tri_mid': case 'prism:tri_steep': {
      const th = (kind === 'tri_mid' ? rng.uniform(37, 37.6) : rng.uniform(51, 51.6)) * D2R;
      const opts = altitudeDirs(solid).filter((h) => leanOK(h, th, cam));
      if (!opts.length) return null;
      const h = rng.pick(opts);
      const pr = prismTri(solid).map((v) => v[0] * h[0] + v[1] * h[2]);
      const mid = (Math.min(...pr) + Math.max(...pr)) / 2;
      return { n: norm([Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]]), p: [0, H / 2 + Math.tan(th) * mid + rng.uniform(-0.015, 0.015), 0] };
    }
    case 'prism:rect_wide': case 'prism:rect_narrow': {
      const T = prismTri(solid), [cLo, cHi] = kind === 'rect_wide' ? [1.45, 1.65] : [0.85, 1.05];
      for (let t = 0; t < 60; t++) {
        const a = facingAz(rng, cam), n = nFrom(Math.PI / 2, a), d = rng.uniform(-0.6, 0.6);
        const c = triChord(T, n, d);
        if (c >= cLo && c <= cHi) return { n, p: [n[0] * d, H / 2, n[2] * d] };
      }
      return null;
    }
    case 'block:ehole_mid': case 'block:ehole_steep': {
      const th = (kind === 'ehole_mid' ? rng.uniform(37, 37.4) : rng.uniform(50.6, 51)) * D2R;
      const hs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].filter((h) => Math.abs(dot(h, cam.r)) >= 0.45 && Math.abs(dot(nFrom(th, Math.atan2(h[2], h[0])), cam.c)) >= 0.38);
      if (!hs.length) return null;
      const h = rng.pick(hs);
      return { n: [Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]], p: [0, H / 2, 0] };
    }
    case 'block:bars_off': {
      const axes = [[1, 0, 0], [0, 0, 1]].filter((a) => Math.abs(dot(a, cam.c)) >= 0.42);
      if (!axes.length) return null;
      const ax = rng.pick(axes), d = rng.uniform(0.27, 0.31) * rng.sign();
      return { n: ax, p: [ax[0] * d, H / 2, ax[2] * d] };
    }
    case 'cube:square': return { n: up, p: [0, rng.uniform(0.5, H - 0.5), 0] };
    case 'cube:rect': {
      const th = rng.uniform(42, 45) * D2R;
      const hs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].filter((h) => leanOK(h, th, cam));
      if (!hs.length) return null;
      const h = rng.pick(hs);
      return { n: [Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]], p: [0, H / 2, 0] };
    }
    case 'cube:triangle': case 'cube:hexagon': {
      const sx = Math.sign(cam.c[0]) || 1, sz = Math.sign(cam.c[2]) || 1;
      const opts = kind === 'triangle' ? [[sx, sz]] : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const [ax, az] = rng.pick(opts), n = norm([ax, 1, az]);
      const sOff = kind === 'triangle' ? rng.uniform(0.85, 1.25) : rng.uniform(-0.1, 0.1);
      return { n, p: [n[0] * sOff, H / 2 + n[1] * sOff, n[2] * sOff] };
    }
    case 'cyl:barrel': {
      const th = rng.uniform(64, 72) * D2R, a = sidewaysAz(rng, cam, th);
      return a === null ? null : { n: nFrom(th, a), p: [0, H / 2 + rng.uniform(-0.06, 0.06), 0] };
    }
    case 'cone:dome': {
      const th = rng.uniform(35, 45) * D2R, a = sidewaysAz(rng, cam, th);
      if (a === null) return null;
      const dd = rng.uniform(0.22, 0.52) * R;
      return { n: nFrom(th, a), p: [0, dd * Math.tan(th), 0] };
    }
    case 'tube:ring': case 'hex:hexagon': return { n: up, p: [0, rng.uniform(0.38, 0.62) * H, 0] };
    case 'tube:bars': case 'tube:rect': case 'hex:rect': {
      const a = facingAz(rng, cam);
      let n = nFrom(Math.PI / 2, a);
      if (dot(n, cam.c) < 0) n = mul(n, -1);
      const d = kind === 'bars' ? rng.uniform(-0.08, 0.08) : solid.kind === 'tube' ? rng.uniform(solid.r + 0.08, R - 0.15) : rng.uniform(0.3, 0.7) * R * rng.sign();
      return { n, p: [n[0] * d, H * 0.5, n[2] * d] };
    }
    case 'tube:oval_ring': case 'hex:long_hex': {
      const th = (solid.kind === 'tube' ? rng.uniform(40, 47) : rng.uniform(48, 53)) * D2R, a = sidewaysAz(rng, cam, th);
      return a === null ? null : { n: nFrom(th, a), p: [0, H / 2 + rng.uniform(-0.04, 0.04), 0] };
    }
    case 'pyr:square': return { n: up, p: [0, rng.uniform(0.3, 0.6) * H, 0] };
    case 'pyr:triangle': case 'pyr:trapezoid': {
      const axes = [[1, 0, 0], [0, 0, 1]].filter((a) => Math.abs(dot(a, cam.c)) >= 0.42);
      if (!axes.length) return null;
      let ax = rng.pick(axes);
      if (dot(ax, cam.c) < 0) ax = mul(ax, -1);
      const d = kind === 'triangle' ? 0 : rng.uniform(0.38, 0.6) * R;
      return { n: ax, p: [ax[0] * d, H * 0.45, ax[2] * d] };
    }
    case 'pyr:pentagon': {
      const th = rng.uniform(50, 68) * D2R;
      const hs = [[1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1]].map(norm).filter((h) => leanOK(h, th, cam));
      if (!hs.length) return null;
      const h = rng.pick(hs);
      return { n: [Math.sin(th) * h[0], Math.cos(th), Math.sin(th) * h[2]], p: [0, rng.uniform(0.25, 0.55) * H, 0] };
    }
    default: return null;
  }
}

function planeProblems(solid, kind, pl, cam) {
  const n = norm(pl.n), th = tiltOf(n), { R, H } = solid;
  const P = { n, p: pl.p, u: norm(cross([0, 1, 0], n)), v: [0, 0, 0] };
  if (th < 1e-6) { P.u = [1, 0, 0]; P.v = [0, 0, 1]; } else { P.v = norm(cross(n, P.u)); }
  const sec = section(solid, P);
  if (!sec || sec.outer.length < 8) return 'no-section';
  if (Math.abs(dot(n, cam.c)) < HARD.minFacing) return 'edge-on';
  const [wMin, wMax] = widths(sec.outer), asp = wMax / wMin;
  const [y0, y1] = yRange(solid, P, sec.outer);
  const hd = horiz(n), off = Math.abs(dot(hd, pl.p));
  const level = th < 0.5, upright = th > 89.5;
  switch (`${solid.kind}:${kind}`) {
    case 'cyl:circle': return level && pl.p[1] > 0.3 && pl.p[1] < H - 0.3 ? '' : 'circle';
    case 'cyl:ellipse': return th >= 44.5 && th <= 50.5 && y0 >= 0.1 && y1 <= H - 0.1 && asp >= 1.38 ? '' : 'ellipse';
    case 'cyl:dshape': {
      const dc = (H - pl.p[1]) / Math.tan(th * D2R);
      return th >= 56.5 && th <= 63.5 && y0 >= 0.1 && y1 >= H - 1e-6 && Math.abs(dc) >= 0.2 && Math.abs(dc) <= 0.62 ? '' : 'dshape';
    }
    case 'cyl:rect': return upright && off <= 0.41 ? '' : 'rect';
    case 'cone:circle': return level && pl.p[1] >= 0.45 && pl.p[1] <= 1.3 ? '' : 'circle';
    case 'cone:ellipse': return th >= 41.5 && th <= 48.5 && y0 >= 0.12 && asp >= 1.38 ? '' : 'ellipse';
    case 'cone:triangle': return upright && off < 1e-6 && Math.abs(dot(n, cam.c)) <= FACE[1] + 0.01 ? '' : 'triangle';
    case 'cone:arch': {
      const towardViewer = dot([pl.p[0], 0, pl.p[2]], cam.c) > 0;
      return upright && off >= 0.35 * R && off <= 0.5 * R && towardViewer && Math.abs(dot(n, cam.c)) <= FACE[1] + 0.01 ? '' : 'arch';
    }
    case 'prism:tri': return level && pl.p[1] > 0.4 && pl.p[1] < H - 0.4 ? '' : 'tri';
    case 'prism:rect': { const c = triChord(prismTri(solid), hd, dot(hd, pl.p)); return upright && c >= 0.8 && c <= 1.66 ? '' : 'rect'; }
    case 'prism:tri_long': {
      const alt = altitudeDirs(solid).some((a) => dot(a, hd) > 1 - 1e-6);
      return alt && th >= 46.5 && th <= 51.5 && y0 >= 0.18 && y1 <= H - 0.18 ? '' : 'tri_long';
    }
    case 'prism:trap': {
      if (!(th >= 66 && th <= 69.5) || y0 > 1e-6 || y1 < H - 1e-6) return 'trap';
      const T = prismTri(solid);
      const lvl = (y) => (dot(n, pl.p) - n[1] * y) / Math.hypot(n[0], n[2]);
      const cb = triChord(T, hd, lvl(0)), ct = triChord(T, hd, lvl(H));
      const par = [0, 1, 2].some((k) => { const a = norm([T[k][0], 0, T[k][1]]); return Math.abs(Math.abs(dot(a, hd)) - 1) < 1e-6; });
      const side = R * Math.sqrt(3);
      return par && Math.min(cb, ct) >= 0.24 * side && Math.max(cb, ct) / Math.min(cb, ct) >= 1.8 ? '' : 'trap';
    }
    case 'block:sq_hole': return level && pl.p[1] > 0.4 && pl.p[1] < H - 0.4 && sec.hole ? '' : 'sq_hole';
    case 'block:bars': case 'block:rect': {
      const ax = Math.abs(n[0]) > 0.9999 || Math.abs(n[2]) > 0.9999;
      const ok = upright && ax && (kind === 'bars' ? off <= 0.12 && sec.hole : off >= 0.62 && off <= 0.84 && !sec.hole);
      return ok ? '' : kind;
    }
    case 'block:rect_ehole': {
      const axis = Math.abs(hd[0]) > 0.9999 || Math.abs(hd[2]) > 0.9999;
      return axis && th >= 43.5 && th <= 50.5 && y0 >= 0.1 && y1 <= H - 0.1 && sec.hole && Math.hypot(pl.p[0], pl.p[2]) < 1e-9 ? '' : 'rect_ehole';
    }
    case 'cyl:ell_mid': return th >= 36.9 && th <= 38.1 && y0 >= 0.1 && y1 <= H - 0.1 && asp >= 1.24 && asp <= 1.29 ? '' : 'ell_mid';
    case 'cyl:ell_steep': return th >= 51.1 && th <= 52.1 && y0 >= 0.1 && y1 <= H - 0.1 && asp >= 1.58 ? '' : 'ell_steep';
    case 'cyl:rect_c': return upright && off <= 0.13 ? '' : 'rect_c';
    case 'cyl:rect_off': return upright && off >= 0.63 * R && off <= 0.73 * R && dot([pl.p[0], 0, pl.p[2]], cam.c) > 0 ? '' : 'rect_off';
    case 'cone:ell_mid': return th >= 33.4 && th <= 34.6 && y0 >= 0.12 && asp >= 1.24 && asp <= 1.3 ? '' : 'ell_mid';
    case 'cone:ell_steep': return th >= 45.9 && th <= 48.1 && y0 >= 0.12 && asp >= 1.6 ? '' : 'ell_steep';
    case 'cone:arch_near': case 'cone:arch_far': {
      const [lo, hi] = kind === 'arch_near' ? [0.355, 0.445] : [0.635, 0.725];
      const towardViewer = dot([pl.p[0], 0, pl.p[2]], cam.c) > 0;
      return upright && off >= lo * R && off <= hi * R && towardViewer && Math.abs(dot(n, cam.c)) <= FACE[1] + 0.01 ? '' : kind;
    }
    case 'prism:tri_mid': case 'prism:tri_steep': {
      const alt = altitudeDirs(solid).some((a) => dot(a, hd) > 1 - 1e-6);
      const [lo, hi] = kind === 'tri_mid' ? [36.9, 37.7] : [50.9, 51.7];
      return alt && th >= lo && th <= hi && y0 >= 0.18 && y1 <= H - 0.18 ? '' : kind;
    }
    case 'prism:rect_wide': case 'prism:rect_narrow': {
      const c = triChord(prismTri(solid), hd, dot(hd, pl.p)), [lo, hi] = kind === 'rect_wide' ? [1.44, 1.66] : [0.84, 1.06];
      return upright && c >= lo && c <= hi ? '' : kind;
    }
    case 'block:ehole_mid': case 'block:ehole_steep': {
      const axis = Math.abs(hd[0]) > 0.9999 || Math.abs(hd[2]) > 0.9999;
      const [lo, hi] = kind === 'ehole_mid' ? [36.9, 37.5] : [50.5, 51.1];
      return axis && th >= lo && th <= hi && y0 >= 0.05 && y1 <= H - 0.05 && sec.hole && Math.hypot(pl.p[0], pl.p[2]) < 1e-9 ? '' : kind;
    }
    case 'block:bars_off': {
      const ax = Math.abs(n[0]) > 0.9999 || Math.abs(n[2]) > 0.9999;
      return upright && ax && off >= 0.265 && off <= 0.315 && sec.hole ? '' : 'bars_off';
    }
    case 'cube:square': return level && pl.p[1] > 0.4 && pl.p[1] < H - 0.4 ? '' : 'square';
    case 'cube:rect': {
      const axis = Math.abs(hd[0]) > 0.9999 || Math.abs(hd[2]) > 0.9999;
      return axis && th >= 41.5 && th <= 45.5 && y0 >= -1e-6 && y1 <= H + 1e-6 && Math.hypot(pl.p[0], pl.p[2]) < 1e-9 ? '' : 'rect';
    }
    case 'cyl:barrel': return th >= 63.5 && th <= 72.5 && y0 <= 1e-6 && y1 >= H - 1e-6 && Math.hypot(pl.p[0], pl.p[2]) < 1e-9 && Math.abs(pl.p[1] - H / 2) <= 0.07 ? '' : 'barrel';
    case 'cone:dome': {
      const dd = Math.abs(dot(n, pl.p)) / Math.max(1e-9, Math.hypot(n[0], n[2]));
      return th >= 34.5 && th <= 45.5 && y0 <= 1e-6 && dd >= 0.21 * R && dd <= 0.53 * R && Math.hypot(pl.p[0], pl.p[2]) < 1e-9 ? '' : 'dome';
    }
    case 'tube:ring': return level && pl.p[1] > 0.35 * H && pl.p[1] < 0.65 * H && sec.hole ? '' : 'ring';
    case 'tube:bars': return upright && off <= 0.09 && sec.hole ? '' : 'bars';
    case 'tube:rect': return upright && off >= solid.r + 0.07 && off <= R - 0.14 && !sec.hole && dot([pl.p[0], 0, pl.p[2]], cam.c) > 0 && asp >= 1.5 ? '' : 'rect';
    case 'tube:oval_ring': return th >= 39.5 && th <= 47.5 && y0 >= 0.1 && y1 <= H - 0.1 && sec.hole && asp >= 1.28 ? '' : 'oval_ring';
    case 'hex:hexagon': return level && pl.p[1] > 0.35 * H && pl.p[1] < 0.65 * H && polyStats(solid, P).n === 6 ? '' : 'hexagon';
    case 'hex:rect': return upright && off <= 0.72 * R && polyStats(solid, P).n === 4 && asp >= 1.45 ? '' : 'rect';
    case 'hex:long_hex': return th >= 47.5 && th <= 53.5 && y0 >= 0.08 && y1 <= H - 0.08 && polyStats(solid, P).n === 6 && asp >= 1.6 ? '' : 'long_hex';
    case 'pyr:square': case 'pyr:triangle': case 'pyr:trapezoid': case 'pyr:pentagon': {
      const ps = polyStats(solid, P);
      if (kind === 'square') return level && ps.n === 4 && pl.p[1] >= 0.29 * H && pl.p[1] <= 0.61 * H ? '' : 'square';
      const axis = Math.abs(n[0]) > 0.9999 || Math.abs(n[2]) > 0.9999;
      if (kind === 'triangle') return upright && axis && off < 1e-6 && ps.n === 3 ? '' : 'triangle';
      if (kind === 'trapezoid') return upright && axis && off >= 0.37 * R && off <= 0.61 * R && dot([pl.p[0], 0, pl.p[2]], cam.c) > 0 && ps.n === 4 ? '' : 'trapezoid';
      return th >= 49.5 && th <= 68.5 && ps.n === 5 && ps.ratio >= 0.15 ? '' : 'pentagon';
    }
    case 'cube:triangle': case 'cube:hexagon': {
      const diag = Math.abs(Math.abs(n[0]) - n[1]) < 2e-3 && Math.abs(Math.abs(n[2]) - n[1]) < 2e-3 && n[1] > 0;
      const so = dot(n, [pl.p[0], pl.p[1] - H / 2, pl.p[2]]);
      if (!diag) return kind;
      if (kind === 'hexagon') return Math.abs(so) <= 0.11 ? '' : 'hexagon';
      return so >= 0.84 && so <= 1.26 && dot([n[0], 0, n[2]], cam.c) > 0 ? '' : 'triangle';
    }
    default: return 'kind';
  }
}

export function gate(m) {
  if (!m || m.task !== 'section_slice_pick' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  if (m.ext !== undefined) return extGate(m);
  for (const rd of m.rounds) {
    const S = rd.solid, base = SOLIDS[S?.kind];
    if (!base || S.R !== base.R || S.H !== base.H) return false;
    const cs = rd.cam;
    if (!cs || !(Math.abs(cs.yaw) >= 24 && Math.abs(cs.yaw) <= 38) || !(cs.pitch >= 22 && cs.pitch <= 27)) return false;
    if (S.kind === 'prism') {
      const c = camera(cs), toCam = Math.atan2(c.c[2], c.c[0]) / D2R;
      const off = Math.min(...[0, 120, 240].map((k) => { const d = Math.abs((((S.yaw + k - toCam) % 360) + 540) % 360 - 180); return d; }));
      if (!Number.isFinite(S.yaw) || off > 18.01) return false;
    }
    if (!Number.isInteger(rd.answer) || rd.answer < 0 || rd.answer >= HARD.cards) return false;
    if (!Array.isArray(rd.kinds) || rd.kinds.length !== HARD.cards || [...rd.kinds].sort().join() !== [...KINDS6[S.kind]].sort().join()) return false;
    if (!Array.isArray(rd.planes) || rd.planes.length !== HARD.cards) return false;
    const cam = camera(rd.cam);
    for (let i = 0; i < HARD.cards; i++) if (planeProblems(S, rd.kinds[i], rd.planes[i], cam)) return false;
  }
  return true;
}

const EXT_DIM = { R: [0.9, 1.1], H: [0.85, 1.2] };
const EXT_EXTRA = Object.freeze({ cyl: ['barrel'], cone: ['dome'] });
const EXT_TRAIN_ONLY = ['pyr', 'tube'], EXT_TEST_ONLY = ['cube'];
const EVAL_KEYS = new Set(["block|rect_ehole|block:rect,block:bars,block:rect_ehole,block:sq_hole|2", "block|bars|block:rect_ehole,block:sq_hole,block:rect,block:bars|3", "cone|triangle|cone:triangle,cone:circle,cone:ellipse,cone:arch|0", "cyl|rect|cyl:ellipse,cyl:circle,cyl:rect,cyl:dshape|2", "cone|triangle|cone:ellipse,cone:circle,cone:arch,cone:triangle|3", "block|sq_hole|block:bars,block:rect,block:sq_hole,block:rect_ehole|2", "block|rect_ehole|block:bars,block:sq_hole,block:rect_ehole,block:rect|2", "block|rect|block:sq_hole,block:bars,block:rect,block:rect_ehole|2", "cyl|dshape|cyl:ellipse,cyl:dshape,cyl:circle,cyl:rect|1", "cone|arch|cone:circle,cone:ellipse,cone:arch,cone:triangle|2", "cyl|circle|cyl:dshape,cyl:rect,cyl:circle,cyl:ellipse|2", "prism|tri_long|prism:tri,prism:rect,prism:tri_long,prism:trap|2"]);
const kindsOf = (k) => (KINDS[k] ? [...KINDS[k], ...(EXT_EXTRA[k] || [])] : EXT_KINDS[k]);
const CLASS = {
  'cyl:circle': 'circle', 'cyl:ellipse': 'ellipse', 'cyl:dshape': 'dshape', 'cyl:rect': 'rect', 'cyl:barrel': 'barrel',
  'cone:circle': 'circle', 'cone:ellipse': 'ellipse', 'cone:triangle': 'triangle', 'cone:arch': 'arch', 'cone:dome': 'arch',
  'prism:tri': 'triangle', 'prism:tri_long': 'long_triangle', 'prism:rect': 'rect', 'prism:trap': 'trapezoid',
  'block:sq_hole': 'sq_hole', 'block:bars': 'bars', 'block:rect': 'rect', 'block:rect_ehole': 'oval_hole',
  'pyr:square': 'square', 'pyr:triangle': 'triangle', 'pyr:trapezoid': 'trapezoid', 'pyr:pentagon': 'pentagon',
  'tube:ring': 'ring', 'tube:bars': 'bars', 'tube:rect': 'rect', 'tube:oval_ring': 'oval_ring',
  'cube:square': 'square', 'cube:rect': 'rect', 'cube:triangle': 'triangle', 'cube:hexagon': 'hexagon',
  'hex:hexagon': 'hexagon', 'hex:rect': 'rect', 'hex:long_hex': 'long_hexagon',
};
const clsOf = (sk, k) => CLASS[`${sk}:${k}`];
const keyOf = (sk, kinds, answer) => `${sk}|${kinds[answer]}|${kinds.map((k) => `${sk}:${k}`).join(',')}|${answer}`;
const comboSplit = (sk, key) => (EXT_TEST_ONLY.includes(sk) ? 'test' : EXT_TRAIN_ONLY.includes(sk) ? 'train' : hashStr(`section_slice_pick|q|${key}`) % 10 === 0 ? 'test' : 'train');
function perms(a) { if (a.length <= 1) return [a.slice()]; const out = []; a.forEach((x, i) => { for (const p of perms(a.filter((_, j) => j !== i))) out.push([x, ...p]); }); return out; }
const COMBOS = {};
function comboList(split) {
  if (COMBOS[split]) return COMBOS[split];
  const out = [];
  for (const sk of [...Object.keys(KINDS), ...EXT_TRAIN_ONLY, ...EXT_TEST_ONLY]) {
    const K = kindsOf(sk);
    for (let a = 0; a < K.length; a++) for (let b = a + 1; b < K.length; b++) for (let c = b + 1; c < K.length; c++) for (let d = c + 1; d < K.length; d++) {
      const sub = [K[a], K[b], K[c], K[d]];
      if (new Set(sub.map((k) => clsOf(sk, k))).size !== 4) continue;
      for (const order of perms(sub)) for (let ans = 0; ans < 4; ans++) {
        const key = keyOf(sk, order, ans);
        if (!EVAL_KEYS.has(key) && comboSplit(sk, key) === split) out.push({ sk, kinds: order, answer: ans, key });
      }
    }
  }
  return (COMBOS[split] = out);
}
export function semanticKey(m) {
  const rd = m.rounds[0];
  return keyOf(rd.solid.kind, rd.kinds, rd.answer);
}
function extGate(m) {
  if (m.ext !== 'train' && m.ext !== 'test') return false;
  for (const rd of m.rounds) {
    const S = rd.solid;
    if (!S || !kindsOf(S.kind)) return false;
    const ext = EXT_SOLIDS[S.kind], base = SOLIDS[S.kind];
    if (ext) { if (S.R !== ext.R || S.H !== ext.H || (ext.r !== undefined && S.r !== ext.r)) return false; }
    else if (!(S.R >= base.R * EXT_DIM.R[0] - 1e-9 && S.R <= base.R * EXT_DIM.R[1] + 1e-9 && S.H >= base.H * EXT_DIM.H[0] - 1e-9 && S.H <= base.H * EXT_DIM.H[1] + 1e-9)) return false;
    const cs = rd.cam;
    if (!cs || !(Math.abs(cs.yaw) >= 24 && Math.abs(cs.yaw) <= 38) || !(cs.pitch >= 22 && cs.pitch <= 27)) return false;
    if (S.kind === 'prism') {
      const c = camera(cs), toCam = Math.atan2(c.c[2], c.c[0]) / D2R;
      const off = Math.min(...[0, 120, 240].map((k) => { const d = Math.abs((((S.yaw + k - toCam) % 360) + 540) % 360 - 180); return d; }));
      if (!Number.isFinite(S.yaw) || off > 18.01) return false;
    }
    if (!Number.isInteger(rd.answer) || rd.answer < 0 || rd.answer >= EXT_CARDS) return false;
    if (!Array.isArray(rd.kinds) || rd.kinds.length !== EXT_CARDS || !Array.isArray(rd.planes) || rd.planes.length !== EXT_CARDS) return false;
    if (new Set(rd.kinds).size !== EXT_CARDS || rd.kinds.some((k) => !kindsOf(S.kind).includes(k))) return false;
    if (new Set(rd.kinds.map((k) => clsOf(S.kind, k))).size !== EXT_CARDS) return false;
    const key = keyOf(S.kind, rd.kinds, rd.answer);
    if (EVAL_KEYS.has(key) || comboSplit(S.kind, key) !== m.ext) return false;
    const cam = camera(rd.cam);
    for (let i = 0; i < EXT_CARDS; i++) if (planeProblems(S, rd.kinds[i], rd.planes[i], cam)) return false;
  }
  return true;
}
function genRoundExt(rng, combo) {
  const { sk: kind, kinds, answer } = combo;
  for (let att = 0; att < 200; att++) {
    const b = EXT_SOLIDS[kind] || SOLIDS[kind], solid = { kind, R: b.R, H: b.H };
    if (b.r) solid.r = b.r;
    if (!EXT_SOLIDS[kind]) { solid.R = r4(b.R * rng.uniform(...EXT_DIM.R)); solid.H = r4(b.H * rng.uniform(...EXT_DIM.H)); }
    const camSpec = { yaw: r4(rng.sign() * rng.uniform(24, 38)), pitch: r4(rng.uniform(22, 27)) };
    const cam = camera(camSpec);
    if (kind === 'prism') { const toCam = Math.atan2(cam.c[2], cam.c[0]) / D2R; solid.yaw = r4(((toCam + rng.uniform(-18, 18)) % 120 + 120) % 120); }
    const planes = [];
    for (const k of kinds) {
      let pl = null;
      for (let t = 0; t < 16 && !pl; t++) {
        const c = makePlane(solid, k, rng, cam);
        if (!c) continue;
        const cand = { n: vr4(norm(c.n)), p: vr4(c.p) };
        if (!planeProblems(solid, k, cand, cam)) pl = cand;
      }
      if (!pl) break;
      planes.push(pl);
    }
    if (planes.length < EXT_CARDS) continue;
    return { solid, cam: camSpec, kinds: kinds.slice(), planes, answer };
  }
  return null;
}
function generateExt(rng, split, n) {
  const list = comboList(split), solids = [...new Set(list.map((c) => c.sk))];
  const nn = Number.isFinite(Number(n)) && n !== undefined ? Number(n) : 1 + Math.floor(rng.raw() * 1e6);
  const sk = solids[nthOf(`section_slice_pick|${split}|solid`, nn, solids.length)], mine = list.filter((c) => c.sk === sk);
  const base = nthOf(`section_slice_pick|${split}|${sk}`, Math.ceil(nn / solids.length), mine.length);
  for (let t = 0; t < 8; t++) {
    const rd = genRoundExt(rng, mine[(base + t * 7919) % mine.length]);
    if (!rd) continue;
    const m = { task: 'section_slice_pick', board: { ...BOARD }, ext: split, rounds: [rd] };
    if (gate(m)) return m;
  }
  throw new Error('section_slice_pick: ext generator exhausted');
}

function genRound(rng, kind) {
  for (let att = 0; att < 60; att++) {
    const solid = { kind, R: SOLIDS[kind].R, H: SOLIDS[kind].H };
    const camSpec = { yaw: r4(rng.sign() * rng.uniform(24, 38)), pitch: r4(rng.uniform(22, 27)) };
    const cam = camera(camSpec);
    if (kind === 'prism') {
      const toCam = Math.atan2(cam.c[2], cam.c[0]) / D2R;
      solid.yaw = r4(((toCam + rng.uniform(-18, 18)) % 120 + 120) % 120);
    }
    const kinds = rng.shuffle(KINDS6[kind]);
    const planes = [];
    for (const k of kinds) {
      let pl = null;
      for (let t = 0; t < 16 && !pl; t++) {
        const c = makePlane(solid, k, rng, cam);
        if (!c) continue;
        const cand = { n: vr4(norm(c.n)), p: vr4(c.p) };
        if (!planeProblems(solid, k, cand, cam)) pl = cand;
      }
      if (!pl) break;
      planes.push(pl);
    }
    if (planes.length < HARD.cards) continue;
    return { solid, cam: camSpec, kinds, planes, answer: rng.int(0, HARD.cards - 1) };
  }
  throw new Error('section_slice_pick: generator exhausted');
}

export default {
  meta: {
    name: 'section_slice_pick', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'pick', card: '0..5 (left to right; a re-pick replaces the pick until Verify)' }],
    promptHuman: 'Tap the shape of the cut face',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const solid = rng.pick(Object.keys(KINDS));
    return { task: 'section_slice_pick', board: { ...BOARD }, rounds: [genRound(rng, solid)] };
  },

  init() { return { pick: -1 }; },

  applyAction(s, a) {
    if (a?.op !== 'pick' || !Number.isInteger(a.card) || a.card < 0 || a.card >= HARD.cards) return { ok: false, reason: 'bad-action' };
    s.pick = a.card;
    return { ok: true };
  },

  verify(s, m) {
    const answered = s.pick >= 0;
    const success = answered && s.pick === m.rounds[0].answer;
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { answered } };
  },

  oracle(m) { return [{ op: 'pick', card: m.rounds[0].answer }]; },

  randomPolicy(m, rnd) { return [{ op: 'pick', card: Math.floor(rnd() * m.rounds[0].kinds.length) }]; },

  async mount(env) {
    env.assets.ssp = null;
    if (env.style) env.assets.sspLook = await buildSectionLook(env.style);
  },

  drawPrompt(g, r, env) {
    const block = env?.manifest?.rounds?.[0]?.solid?.kind === 'block' || env?.manifest?.rounds?.[0]?.solid?.kind === 'tube';
    drawPromptText(g, r, 'Pick the shape of the cut face',
      block ? 'The glass cuts it; the hole goes right through' : 'The glass pane cuts the solid in two');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env;
    const ri = 0, rd = m.rounds[0];
    const pick = s.pick;
    let q = 2; try { const t = g.getTransform(); q = Math.max(1, Math.min(3, Math.round(Math.hypot(t.a, t.b) * 2) / 2)); } catch { q = 2; }
    const look = env.style ? env.assets.sspLook : null;
    const key = look ? `${ri}|${q}|${env.style.key}` : `${ri}|${q}`;
    let cache = env.assets.ssp;
    if (!cache || cache.key !== key) {
      const cam = camera(rd.cam);
      const cardSolid = (i) => (rd.cardSolids && rd.cardSolids[i]) || rd.solid;
      const fps = rd.planes.map((pl, i) => fullPlane(cardSolid(i), pl, cam));
      const scene = toCanvas(look ? renderScene(rd.solid, fps[rd.answer], rd.cam, SCENE.w, SCENE.h, q, look) : renderScene(rd.solid, fps[rd.answer], rd.cam, SCENE.w, SCENE.h, q));
      const cards = fps.map((fp, i) => toCanvas(look ? renderSection(cardSolid(i), fp, CARD.w, CARD.h, q, undefined, look) : renderSection(rd.solid, fp, CARD.w, CARD.h, q)));
      cache = env.assets.ssp = { key, scene, cards };
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    const top = cardsOnTop(env);
    if (top) {
      g.drawImage(cache.scene, SCENE.x, SCENE_BELOW_Y, SCENE.w, SCENE.h);
      g.strokeStyle = '#e4e7eb'; g.beginPath(); g.moveTo(0, SCENE_BELOW_Y - 0.5); g.lineTo(BOARD.w, SCENE_BELOW_Y - 0.5); g.stroke();
    } else {
    g.drawImage(cache.scene, SCENE.x, SCENE.y, SCENE.w, SCENE.h);
    g.strokeStyle = '#e4e7eb'; g.beginPath(); g.moveTo(0, SCENE.h + 0.5); g.lineTo(BOARD.w, SCENE.h + 0.5); g.stroke();
    }
    const nc = rd.kinds.length;
    for (let i = 0; i < nc; i++) {
      const R = cardRect(i, top, nc);
      g.save(); rr(g, R.x, R.y, R.w, R.h, 7); g.clip(); g.drawImage(cache.cards[i], R.x, R.y, R.w, R.h); g.restore();
      rr(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 7);
      g.strokeStyle = i === pick ? ACCENT : '#cfd8e1'; g.lineWidth = i === pick ? 3 : 1.2; g.stroke();
      if (i === pick) {
        g.fillStyle = ACCENT; g.beginPath(); g.arc(R.x + 13, R.y + 13, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `800 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('✓', R.x + 13, R.y + 13.5);
      }
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const nc = env.manifest.rounds[0].kinds.length;
    for (let i = 0; i < nc; i++) {
      const R = cardRect(i, cardsOnTop(env), nc);
      if (e.x >= R.x && e.x <= R.x + R.w && e.y >= R.y && e.y <= R.y + R.h) return [{ op: 'pick', card: i }];
    }
    return [];
  },

  footerStatus(env) {
    return env.state.pick >= 0 ? '1 shape selected' : 'Pick a shape';
  },
};
