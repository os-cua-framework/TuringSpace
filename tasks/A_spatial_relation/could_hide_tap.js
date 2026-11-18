import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, ringImage, pickId } from '../common/_could_hide_tap_rt.js';
import { IMG, cameraFor, buildScene, screenBox, catScreenBox, extent, CAT_ID, LOOKS, SPECIES, SPECIES_NAMES, sizeK, coatsOf,
  lightFor, woodPlanks, painted, staves, plastic, cardboard } from '../common/_could_hide_tap_scene.js';
import { lin, fbm, hash2, lineMask } from '../common/_could_hide_tap_rt.js';
import { S3, texMod, faceColour, loadAll, totalOf, splitOf, pickOf } from '../common/_relation_scene_look.js';
import { canHide, maxHidden, gapPixels, inBand } from '../common/_could_hide_tap_hide.js';

const PANEL_W = 400;
const BOARD = { w: IMG.w, h: IMG.h };
const HARD = Object.freeze({
  rounds: 1, perType: 2, ansMin: 2, ansMax: 4,
  tScale: 1.2, tMargin: 1,
  fScale: 0.8, fMax: 0.66,
  fMaxOpen: 0.6,
  fMaxOpenSmall: 0.56,
  sizeRatio: [0.9, 1.1],
  gapZ: [1.15, 1.5],
  roomZ: [0.85, 1.15],
  gapPx: 40,
  sep: 8, catSep: 10, edge: 5,
  minH: 18,
});
const TYPES = ['size', 'wall', 'hollow'];
const OPEN_CRATE = Object.freeze({ pw: 0.018, sh: 0.018 });
const MODELS = { size: ['crate', 'carton', 'barrel'], wall: ['cabinet', 'crate', 'bin'], hollow: ['screen', 'cabinet', 'crate'] };
const D2R = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const u = (rng, a, b) => rng.uniform(a, b);

function dimsFor(rng, kind, type, k = 1) {
  const d = dimsCat(rng, kind, type);
  return { w: d.w * k, d: d.d * k, h: d.h * k, k };
}
function dimsCat(rng, kind, type) {
  if (kind === 'crate') {
    if (type === 'wall') return { w: u(rng, 0.64, 0.78), d: u(rng, 0.3, 0.4), h: u(rng, 0.58, 0.72) };
    if (type === 'size') { const w = u(rng, 0.5, 0.62); return { w, d: w * u(rng, 0.9, 1.04), h: u(rng, 0.44, 0.52) }; }
    const w = u(rng, 0.52, 0.64);
    return { w, d: w * u(rng, 0.9, 1.04), h: u(rng, 0.52, 0.62) };
  }
  if (kind === 'carton') { const w = u(rng, 0.5, 0.64); return { w, d: w * u(rng, 0.7, 0.95), h: u(rng, 0.44, 0.52) }; }
  if (kind === 'cabinet') return type === 'wall' ? { w: u(rng, 0.76, 0.95), d: u(rng, 0.28, 0.36), h: u(rng, 1.0, 1.2) } : { w: u(rng, 0.62, 0.76), d: u(rng, 0.3, 0.34), h: u(rng, 0.76, 0.88) };
  if (kind === 'bin') return { w: u(rng, 0.58, 0.68), d: u(rng, 0.38, 0.46), h: u(rng, 0.9, 1.02) };
  if (kind === 'barrel') { const dd = u(rng, 0.54, 0.64); return { w: dd, d: dd, h: u(rng, 0.44, 0.52) }; }
  if (kind === 'screen') return { w: u(rng, 0.7, 0.86), d: 0.045, h: u(rng, 0.72, 0.84) };
  throw new Error(`dimsFor ${kind}`);
}
function lookFor(rng, kind) {
  const n = kind === 'cabinet' ? LOOKS.cabinet.length : LOOKS[kind].length;
  return { col: rng.int(0, n - 1), wire: rng.int(0, 1) };
}
function makeObj(kind, dims, look, x, z, yaw, sc = 1, open = false, extra = {}) {
  const k = dims.k || 1;
  const o = { kind, open, x, z, yaw, w: dims.w * sc, d: kind === 'screen' ? dims.d : dims.d * sc, h: dims.h * sc, sc, col: kind === 'cabinet' && open ? look.wire : look.col };
  if (kind === 'crate') { o.plank = 0.1 * k * sc; if (open) { o.gap = extra.gap; o.pw = OPEN_CRATE.pw * k; o.sh = OPEN_CRATE.sh * k; } }
  if (kind === 'screen' && open) o.gap = extra.gap;
  if (kind === 'cabinet' && open) o.shelves = extra.shelves;
  return o;
}
function tidy(o) {
  for (const k of ['x', 'z', 'yaw', 'w', 'd', 'h', 'sc', 'plank', 'gap', 'pw', 'sh']) if (o[k] !== undefined) o[k] = r3(o[k]);
  return o;
}

const camScale = (rd) => Math.sqrt(SPECIES[rd.sp].H / SPECIES.cat.H);
const objScale = (k) => k ** 0.6;
function eyeGround(cam) { const a = cam.az * D2R; return [cam.D * Math.sin(a), cam.D * Math.cos(a)]; }
function along(cam, g, l) {
  const a = cam.az * D2R, [ex, ez] = eyeGround(cam);
  return [ex - g * Math.sin(a) + l * Math.cos(a), ez - g * Math.cos(a) - l * Math.sin(a)];
}
function xAtScreen(cam, sx, zc) {
  let lo = -12, hi = 12;
  const px = (x) => cam.project(x, 0, zc).x;
  const inc = px(hi) > px(lo);
  for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if ((px(m) < sx) === inc) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const solo = (rd, o) => ({ cam: rd.cam, look: rd.look, sun: rd.sun, cat: { sp: rd.sp, x: 60, z: 60, yaw: 0, s: 1, coat: 0 }, objs: [o] });
const boxH = (b) => b[3] - b[1];
const inFrame = (b, m = HARD.edge) => b[0] >= m && b[1] >= m && b[2] <= IMG.w - m && b[3] <= IMG.h - m;
const boxGap = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);

function isTrue(rd, i, cam) { return !!canHide(rd, i, HARD.tScale, HARD.tMargin, cam); }
function isFalse(rd, i, cam) { const lim = rd.objs[i].open ? (sizeK(rd.cat) < 1 ? HARD.fMaxOpenSmall : HARD.fMaxOpen) : HARD.fMax; return maxHidden(rd, i, HARD.fScale, cam, null, lim + 1e-9).share <= lim; }
function soloTrue(rd, o, cam) { return isTrue(solo(rd, o), 0, cam); }
function soloFalse(rd, o, cam) { return isFalse(solo(rd, o), 0, cam); }

function sizeTwins(rng, rd, cam, kind, dims, look, yaw) {
  const ko = dims.k || 1, k = SPECIES[rd.sp].H / SPECIES.cat.H, e = extent({ kind, w: dims.w, d: dims.d, sc: 1 });
  const zT = u(rng, HARD.roomZ[0] + 0.01, HARD.roomZ[1] - 0.01) * k + e.hz, gF = u(rng, 1.7, 2.25) * camScale(rd);
  const xT = xAtScreen(cam, u(rng, 25, IMG.w - 25), zT);
  const T = makeObj(kind, dims, look, xT, zT, yaw);
  const bT = screenBox(T, cam);
  if (!inFrame(bT)) return null;
  const [xF, zF] = along(rd.cam, gF, u(rng, -1.1, 1.1) * gF * 0.42);
  const want = boxH(bT) * u(rng, HARD.sizeRatio[0] + 0.01, HARD.sizeRatio[1] - 0.01);
  let lo = 0.12, hi = 0.9;
  for (let it = 0; it < 22; it++) { const k = (lo + hi) / 2, h = boxH(screenBox(makeObj(kind, dims, look, xF, zF, yaw, k), cam)); if (h < want) lo = k; else hi = k; }
  const F = makeObj(kind, dims, look, xF, zF, yaw, (lo + hi) / 2);
  if (!inFrame(screenBox(F, cam))) return null;
  if (F.h > 0.2 * k) return null;
  return { T, F };
}

function planRound(rng) {
  const sp = rng.pick(SPECIES_NAMES);
  for (;;) {
    const kinds = TYPES.map((t) => rng.pick(MODELS[t]));
    if (new Set(kinds).size === 3) {
      let coins;
      do { coins = Array.from({ length: 6 }, () => (rng.raw() < 0.5 ? 1 : 0)); } while (coins.reduce((a, b) => a + b, 0) < HARD.ansMin || coins.reduce((a, b) => a + b, 0) > HARD.ansMax);
      return { sp, kinds, coins };
    }
  }
}
function templates(rng, plan) {
  const [kS, kW, kH] = plan.kinds, k = SPECIES[plan.sp].H / SPECIES.cat.H, ko = objScale(k);
  return {
    size: { type: 'size', kind: kS, dims: dimsFor(rng, kS, 'size', ko), look: lookFor(rng, kS), yaw: r3(u(rng, -12, 12)) },
    wall: { type: 'wall', kind: kW, dims: dimsFor(rng, kW, 'wall', ko), look: lookFor(rng, kW) },
    hollow: { type: 'hollow', kind: kH, dims: dimsFor(rng, kH, 'hollow', ko), look: lookFor(rng, kH),
      extra: { gap: (kH === 'crate' ? u(rng, 0.21, 0.24) : u(rng, 0.18, 0.22)) * Math.max(k, 1 / k), shelves: rng.int(3, 4) } },
  };
}
function sampleSlot(rng, rd, cam, T, truth) {
  let real, twin;
  if (T.type === 'hollow') {
    const g = u(rng, 2.15, 2.9) * camScale(rd), [x, z] = along(rd.cam, g, u(rng, -1, 1) * g * 0.42), yaw = u(rng, -14, 14);
    const S = tidy(makeObj(T.kind, T.dims, T.look, x, z, yaw, 1, false)), O = tidy(makeObj(T.kind, T.dims, T.look, S.x, S.z, S.yaw, 1, true, T.extra));
    [real, twin] = truth ? [S, O] : [O, S];
  } else if (T.type === 'wall') {
    const e = extent({ kind: T.kind, ...T.dims, sc: 1 }), gap = u(rng, HARD.gapZ[0] + 0.01, HARD.gapZ[1] - 0.01) * (SPECIES[rd.sp].H / SPECIES.cat.H);
    const x = xAtScreen(cam, u(rng, 25, IMG.w - 25), (gap + e.hz + e.hz) / 2);
    const arel = Math.abs(Math.atan2(cam.eye[0] - x, cam.eye[2] - e.hz) / D2R);
    if (arel < 6 || arel > 22) return null;
    const R = tidy(makeObj(T.kind, T.dims, T.look, x, gap + e.hz, 0)), F = tidy(makeObj(T.kind, T.dims, T.look, x, e.hz + 0.006, 0));
    [real, twin] = truth ? [R, F] : [F, R];
    if (!inFrame(screenBox(twin, cam))) return null;
  } else {
    const tw = sizeTwins(rng, rd, cam, T.kind, T.dims, T.look, T.yaw);
    if (!tw) return null;
    const A = tidy(tw.T), B = tidy(tw.F);
    [real, twin] = truth ? [A, B] : [B, A];
  }
  return { real, twin };
}
function validSlot(rd, cam, T, real, twin, truth) {
  const [t, f] = truth ? [real, twin] : [twin, real];
  if (!soloTrue(rd, t, cam) || !soloFalse(rd, f, cam)) return false;
  if (T.type !== 'hollow' && gapPixels(solo(rd, t), 0, cam) < HARD.gapPx) return false;
  return true;
}
function twinRecord(T, twin) {
  if (T.type === 'wall') return { x: twin.x, z: twin.z };
  if (T.type === 'size') return { x: twin.x, z: twin.z, sc: twin.sc };
  return { open: twin.open, col: twin.col, ...(twin.gap !== undefined ? { gap: twin.gap } : {}), ...(twin.shelves !== undefined ? { shelves: twin.shelves } : {}) };
}
function tryRound(rng, plan) {
  const cs = camScale({ sp: plan.sp });
  const az = (rng.raw() < 0.5 ? -1 : 1) * u(rng, 10, 20);
  const rd = {
    sp: plan.sp,
    cam: { az: r3(az), h: r3(u(rng, 1.7, 1.85) * cs), D: r3(u(rng, 6.4, 6.9) * cs), g: r3(u(rng, 3.9, 4.1) * cs), fov: 50 },
    sun: { az: r3(az + (rng.raw() < 0.5 ? -1 : 1) * u(rng, 30, 65)), el: r3(u(rng, 42, 55)) },
    look: { lawn: rng.int(0, 2), fence: rng.int(0, 3), fenceH: r3(u(rng, 1.1, 1.25)) },
    cat: null, objs: [],
  };
  const cam = cameraFor(rd.cam), TPL = templates(rng, plan);
  const slots = [['hollow', 4], ['hollow', 5], ['wall', 0], ['wall', 1], ['size', 2], ['size', 3]].map(([t, c]) => ({ T: TPL[t], truth: plan.coins[c], real: null, twin: null, box: null }));
  const freeFor = (b, k) => inFrame(b) && boxH(b) >= HARD.minH && slots.every((q, j) => j === k || !q.box || boxGap(q.box, b) >= HARD.sep);
  const layout = (k, tries) => {
    const S = slots[k];
    for (let a = 0; a < tries; a++) {
      const got = sampleSlot(rng, rd, cam, S.T, S.truth);
      if (!got) continue;
      const b = screenBox(got.real, cam);
      if (!freeFor(b, k)) continue;
      S.real = got.real; S.twin = got.twin; S.box = b;
      return true;
    }
    return false;
  };
  for (let k = 0; k < 6; k++) if (!layout(k, 80)) return null;
  for (let k = 0; k < 6; k++) {
    let ok = validSlot(rd, cam, slots[k].T, slots[k].real, slots[k].twin, slots[k].truth);
    for (let a = 0; a < 6 && !ok; a++) {
      const keep = slots[k].box; slots[k].box = null;
      if (!layout(k, 60)) { slots[k].box = keep; continue; }
      ok = validSlot(rd, cam, slots[k].T, slots[k].real, slots[k].twin, slots[k].truth);
    }
    if (!ok) return null;
  }
  for (const S of slots) {
    const o = S.real;
    o.type = S.T.type; o.lk = S.T.look.col; o.truth = S.truth; o.twin = twinRecord(S.T, S.twin);
    rd.objs.push(o);
  }
  {
    const boxes = slots.map((S) => S.box);
    let ok = false;
    for (let a = 0; a < 80 && !ok; a++) {
      const g = u(rng, 2.3, 4.4) * cs, [x, z] = along(rd.cam, g, u(rng, -1, 1) * g * 0.42);
      const [ex, ez] = eyeGround(rd.cam), yaw = Math.atan2(ex - x, ez - z) / D2R + u(rng, -60, 60);
      const cat = { sp: plan.sp, x: r3(x), z: r3(z), yaw: r3(yaw), s: 1, coat: rng.int(0, coatsOf({ sp: plan.sp }).length - 1) };
      const b = catScreenBox(cat, cam);
      if (!inFrame(b, 12) || boxes.some((q) => boxGap(q, b) < HARD.catSep)) continue;
      if (rd.objs.some((o) => inBand(o, cat.x, cat.z, sizeK(cat)))) continue;
      rd.cat = cat; ok = true;
    }
    if (!ok) return null;
  }
  const order = rng.shuffle(rd.objs.map((_, i) => i));
  rd.objs = order.map((i) => rd.objs[i]);
  rd.answer = rd.objs.map((o, i) => (o.truth ? i : -1)).filter((i) => i >= 0);
  if (roundProblem(rd, { twins: false })) return null;
  rd.pts = rd.objs.map((o) => { const b = screenBox(o, cam); return [r3((b[0] + b[2]) / 2), r3((b[1] + b[3]) / 2)]; });
  return rd;
}
function makeRound(rng) {
  let sp = null;
  for (let p = 0; p < 4; p++) {
    const plan = planRound(rng);
    if (sp) plan.sp = sp; else sp = plan.sp;
    for (let a = 0; a < 150; a++) {
      const rd = tryRound(rng, plan);
      if (rd) return rd;
    }
  }
  throw new Error('could_hide_tap: sampler exhausted');
}

function roundProblem(rd, opt = { twins: true }) {
  if (!rd || !rd.cam || !rd.cat || !Array.isArray(rd.objs) || rd.objs.length !== 6 || !Array.isArray(rd.answer)) return 'shape';
  if (!SPECIES_NAMES.includes(rd.sp) || rd.cat.sp !== rd.sp || rd.cat.s !== 1 || !(rd.cat.coat >= 0 && rd.cat.coat < coatsOf(rd.cat).length)) return 'animal';
  const cam = cameraFor(rd.cam), K = sizeK(rd.cat);
  const nT = rd.objs.filter((o) => o.truth).length;
  if (nT < HARD.ansMin || nT > HARD.ansMax) return 'answer-count';
  if (JSON.stringify(rd.answer) !== JSON.stringify(rd.objs.map((o, i) => (o.truth ? i : -1)).filter((i) => i >= 0))) return 'answer';
  for (const t of TYPES) {
    const P = rd.objs.filter((o) => o.type === t);
    if (P.length !== 2 || P[0].kind !== P[1].kind || P[0].lk !== P[1].lk) return `pair-${t}`;
    if (!MODELS[t].includes(P[0].kind)) return `model-${t}`;
  }
  if (new Set(TYPES.map((t) => rd.objs.find((o) => o.type === t).kind)).size !== 3) return 'models';
  const boxes = rd.objs.map((o) => screenBox(o, cam));
  for (let i = 0; i < 6; i++) {
    if (!inFrame(boxes[i]) || boxH(boxes[i]) < HARD.minH) return 'frame';
    for (let j = 0; j < i; j++) if (boxGap(boxes[i], boxes[j]) < HARD.sep) return 'overlap';
  }
  const cb = catScreenBox(rd.cat, cam);
  if (!inFrame(cb, 12) || boxes.some((b) => boxGap(b, cb) < HARD.catSep)) return 'cat';
  if (rd.objs.some((o) => inBand(o, rd.cat.x, rd.cat.z, K))) return 'cat-band';
  for (let i = 0; i < 6; i++) {
    const o = rd.objs[i];
    if (o.truth ? !isTrue(rd, i, cam) : !isFalse(rd, i, cam)) return `truth-${o.type}`;
    const tw = twinOf(o, objScale(K));
    if (!tw) return 'twin';
    if (opt.twins && (o.truth ? !soloFalse(rd, tw, cam) : !soloTrue(rd, tw, cam))) return `twin-${o.type}`;
    if (o.type === 'size') {
      const r = boxH(boxes[i]) / boxH(screenBox(tw, cam));
      if (r < HARD.sizeRatio[0] || r > HARD.sizeRatio[1]) return 'size-ratio';
      const big = o.truth ? o : tw;
      if (big.sc !== 1) return 'size-template';
      if (o.truth && gapPixels(rd, i, cam) < HARD.gapPx) return 'size-gap-px';
      if (opt.twins && !o.truth && gapPixels(solo(rd, tw), 0, cam) < HARD.gapPx) return 'size-gap-px-twin';
    }
    if (o.type === 'wall') {
      const roomy = o.truth ? o : tw, e = extent(roomy);
      if (Math.abs(o.yaw) > 1e-9 || roomy.z - e.hz < HARD.gapZ[0] * K - 1e-3 || roomy.z - e.hz > HARD.gapZ[1] * K + 1e-3) return 'wall-gap';
      const flush = o.truth ? tw : o;
      if (flush.z - extent(flush).hz > 0.01) return 'wall-flush';
      if (o.truth && gapPixels(rd, i, cam) < HARD.gapPx) return 'wall-gap-px';
      if (opt.twins && !o.truth && gapPixels(solo(rd, tw), 0, cam) < HARD.gapPx) return 'wall-gap-px-twin';
    }
    if (o.type === 'hollow' && (o.open === !!o.truth || tw.open === !o.truth)) return 'hollow-variant';
  }
  return '';
}
function twinOf(o, k = 1) {
  const w = o.twin;
  if (!w) return null;
  const t = { ...o };
  delete t.twin;
  if (o.type === 'wall') { t.x = w.x; t.z = w.z; }
  else if (o.type === 'size') {
    const q = w.sc / o.sc;
    t.x = w.x; t.z = w.z; t.sc = w.sc; t.w = o.w * q; t.d = o.d * q; t.h = o.h * q;
    if (t.plank !== undefined) t.plank = 0.1 * k * t.sc;
  } else if (o.type === 'hollow') {
    for (const k of ['gap', 'pw', 'sh', 'shelves']) delete t[k];
    t.open = w.open; t.col = w.col;
    if (w.open) {
      if (o.kind === 'crate') { t.gap = w.gap; t.pw = r3(OPEN_CRATE.pw * k); t.sh = r3(OPEN_CRATE.sh * k); }
      if (o.kind === 'screen') t.gap = w.gap;
      if (o.kind === 'cabinet') t.shelves = w.shelves;
    }
  } else return null;
  return t;
}

const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = buildScene(rd); sceneCache.set(rd, sc); }
  return sc;
}
export const _internals = { HARD, planRound, tryRound, makeRound, roundProblem, twinOf, sceneFor, sizeTwins, dimsFor, lookFor, makeObj };

const OUTDOOR = new Set(['outdoor-midday', 'morning-afternoon', 'sunset', 'overcast', 'urban']);
const GROUND_SKIP = new Set(['stone_tiles_02', 'interior_tiles', 'hexagonal_concrete_paving', 'square_floor_patern_01', 'floor_pattern_02',
  'pavement_02', 'rough_plasterbrick_05', 'cobblestone_floor_08', 'dry_riverbed_rock', 'white_plaster_02', 'grey_plaster', 'grey_plaster_02', 'grey_plaster_03',
  'painted_concrete', 'painted_concrete_02', 'concrete_floor_painted', 'snow_01', 'snow_02', 'garage_floor', 'hangar_concrete_floor']);
const FENCE_SKIP = new Set(['corrugated_iron', 'corrugated_iron_02', 'worn_corrugated_iron', 'box_profile_metal_sheet', 'raw_plank_wall']);
const CAB_PAINT = ['#6f9277', '#7890aa', '#cdb68c', '#a8583f', '#5d7c8a', '#8a8f5a', '#c9c3b5', '#7a5c78', '#3f5f55', '#b07a3e', '#55606e', '#9c4a4a'];
const BIN_PAINT = ['#3f7d3b', '#4a4f58', '#2f5f93', '#6d4c34', '#7a7f86', '#8a2f2f', '#c49a2a', '#2e6b6b', '#5b4a7a', '#2b2d30'];
const SCREEN_PAINT = ['#e5e1d8', '#9e9b93', '#5f6b62', '#7a6a58', '#3e4a52'];
const CARTONS = [...LOOKS.carton, ['#a98257', '#d6c49c'], ['#c4a27a', '#f0e6d0']];
const HEDGE_HUES = [{ id: 'green', h: 100 }, { id: 'deep-green', h: 115 }, { id: 'olive', h: 85 }, { id: 'blue-green', h: 140 }, { id: 'copper-beech', h: 28 }];
const c01 = (v) => Math.max(0, Math.min(1, v));
const hexOf = (c) => '#' + c.map((v) => Math.round(255 * Math.pow(c01(v), 1 / 2.2)).toString(16).padStart(2, '0')).join('');
export async function styleLook(style, rd) {
  const fences = style.pool('tex', (t) => ['wood', 'wall', 'stone'].includes(t.use) && !FENCE_SKIP.has(t.id));
  const grounds = style.pool('tex', (t) => (t.use === 'terrain' || t.use === 'floor') && !GROUND_SKIP.has(t.id));
  const hdris = style.pool('hdri', (h) => OUTDOOR.has(h.use));
  const [fi, gi, hi] = style.primaryCombo('fence-ground-hdri', [fences.length, grounds.length, hdris.length]);
  const fe = fences[fi], gr = grounds[gi], hd = hdris[hi], rnd = style.rand;
  style.note(`tex:${fe.id}`); style.note(`tex:${gr.id}`); style.note(`hdri:${hd.id}`);
  const lawn = rnd() < 0.4, bgKind = pickOf(style, 'could_hide_tap|background', ['hedge', 'trees', 'house', 'shed', 'garden-wall']);
  const woodItems = [0, 1, 2].map(() => style.pick('tex', (t) => t.use === 'wood'));
  const flatBg = bgKind === 'house' || bgKind === 'shed' || bgKind === 'garden-wall';
  const bgItem = bgKind === 'house' ? style.pick('tex', (t) => t.use === 'wall') : bgKind === 'shed' ? style.pick('tex', (t) => t.use === 'wood')
    : bgKind === 'garden-wall' ? style.pick('tex', (t) => t.use === 'stone') : style.pick('tex', (t) => t.use === 'terrain' && /leaves|grass|moss|forest/.test(t.id));
  const [TF, TG, sky, TB, ...TW] = await loadAll([fe, gr, hd, bgItem, ...woodItems]);
  const fur = lin(coatsOf(rd.cat)[rd.cat.coat].fur), fenceH = rd.look.fenceH;
  let gface = null, g0 = null, g1 = null;
  const gL = rnd(), lawnHue = 78 + 30 * rnd(), lawnSat = 0.45 + 0.2 * rnd(), stripe = 0.5 + 0.3 * rnd(), stripeK = 0.07 + 0.06 * rnd();
  for (let k = 0; k < 6; k++) {
    const L = 0.1 + 0.22 * ((gL + 0.37 * k) % 1);
    gface = lawn ? S3.scaleTo(S3.hueSatColor(lawnHue, lawnSat), L) : faceColour(TG.mean, L, { warm: [18, 140, 0.5], otherSat: 0.18 });
    if (S3.deltaE(gface, fur) >= 18) break;
  }
  if (lawn) { g0 = gface.map((v) => v * 0.86); g1 = gface.map((v) => v * 1.14); }
  const gm = texMod(TG, { cv: lawn ? 0.12 : 0.3, texWorld: lawn ? 0.8 : 1.2 + 0.8 * rnd(), lo: 0.5, hi: 1.5 }), grot = rnd() * Math.PI, gc = Math.cos(grot), gs = Math.sin(grot);
  const floor = (x, z, fp, out) => {
    const t = gm(x * gc - z * gs, x * gs + z * gc, fp);
    if (lawn) {
      const band = Math.floor(z / stripe + 0.5 * Math.sin(x * 0.15)), bandK = (band & 1) ? 1 : 1 - stripeK;
      const g = fbm(x * 1.3, z * 1.3, 3, fp * 1.3);
      for (let c = 0; c < 3; c++) out[c] = (g0[c] + (g1[c] - g0[c]) * c01(0.2 + 0.6 * g)) * bandK * t;
    } else {
      const g = 0.92 + 0.16 * fbm(x * 0.4 + 5, z * 0.4, 2, fp * 0.4);
      for (let c = 0; c < 3; c++) out[c] = gface[c] * t * g;
    }
  };
  const boards = fe.use === 'wood', BW = 0.1 + 0.08 * rnd(), paintFence = boards && rnd() < 0.3;
  let fface = paintFence ? S3.scaleTo(S3.hueSatColor(rnd() * 360, 0.08 + 0.12 * rnd()), 0.25 + 0.3 * rnd())
    : faceColour(TF.mean, 0.18 + 0.3 * rnd(), { warm: [12, 55, 0.5], otherSat: 0.16 });
  if (S3.deltaE(fface, gface) < 12) fface = S3.scaleTo(fface, S3.lum(gface) > 0.2 ? S3.lum(gface) * 0.55 : Math.min(0.55, S3.lum(gface) * 2.2));
  const fm = texMod(TF, { cv: boards ? 0.12 : 0.26, texWorld: boards ? 1.2 : 1.1 + 0.5 * rnd(), lo: 0.55, hi: 1.45 });
  const fd = fface.map((v) => v * 0.62), fl = fface.map((v) => v * 1.1);
  const wall = (x, y, fp, out) => {
    let k = 1;
    if (boards) {
      const col = Math.floor(x / BW);
      const g = fbm(x * 30 + col * 3.3, y * 3, 2, fp * 30);
      for (let c = 0; c < 3; c++) out[c] = fd[c] + (fl[c] - fd[c]) * c01(0.45 + 0.35 * (hash2(col, 17) - 0.5) + 0.35 * (g - 0.5));
      const t = paintFence ? 1 : fm(y * 0.5, x, fp);
      out[0] *= t; out[1] *= t; out[2] *= t;
      k = 1 - 0.55 * lineMask(x, BW, 0.004, fp);
      if (y < 0.12) k *= 0.93;
      if (Math.abs(y - 0.12) < 0.005 + fp * 0.5) k *= 0.75;
    } else {
      const t = fm(x, -y, fp);
      for (let c = 0; c < 3; c++) out[c] = fface[c] * t;
    }
    if (y > fenceH - 0.07) k *= 1.1;
    if (Math.abs(y - (fenceH - 0.07)) < 0.006 + fp * 0.5) k *= 0.7;
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
  const light = S3.hdriLight(hd, lightFor(rd), { albedo: gface, total: totalOf(lightFor(rd)), jitter: rnd() });
  const skyF = S3.skyFn(sky, 0.62 * S3.lum(light.sky) / 0.46);
  const hedgeH = fenceH + (bgKind === 'house' ? 1.4 + 0.8 * rnd() : bgKind === 'garden-wall' ? 0.5 + 0.4 * rnd() : 1.1 + 0.9 * rnd()), amp = bgKind === 'trees' ? 0.9 : bgKind === 'hedge' ? 0.3 : 0;
  const hueB = flatBg ? 0 : pickOf(style, 'could_hide_tap|hedge-colour', HEDGE_HUES, (h) => h.id).h;
  const bface = flatBg ? faceColour(TB.mean, 0.2 + 0.25 * rnd(), { warm: [12, 55, 0.4], otherSat: 0.12 })
    : S3.scaleTo(S3.hueSatColor(hueB, 0.45 + 0.15 * rnd()), (bgKind === 'trees' ? 0.035 : 0.05) + 0.05 * rnd());
  const bm = texMod(TB, { cv: flatBg ? 0.22 : 0.3, texWorld: flatBg ? 1.4 : 0.9, lo: 0.5, hi: 1.5 });
  const hn = [0, 0.35, 0.94];
  const Ld = light.dir, Ll = Math.hypot(...Ld), ndl = Math.max(0, (hn[1] * Ld[1] + hn[2] * Ld[2]) / Ll);
  const F = light.fill, fdl = F ? Math.max(0, (hn[1] * F.dir[1] + hn[2] * F.dir[2]) / Math.hypot(...F.dir)) : 0;
  const Eh = [0, 1, 2].map((c) => light.ground[c] + (light.sky[c] - light.ground[c]) * (0.5 + 0.5 * hn[1]) + light.col[c] * ndl + (F ? F.col[c] * fdl : 0));
  const SK = new Float64Array(3);
  const hedge = (x, y, fp, out) => {
    const top = hedgeH - amp * fbm(x * (bgKind === 'trees' ? 0.5 : 0.8), 3.1, 2);
    if (y > top) { skyF(0.05, Math.min(1, 0.08 + (y - top) * 0.05), -1, SK); for (let c = 0; c < 3; c++) out[c] = SK[c] / Math.max(1e-3, Eh[c]); return; }
    const t = bm(x, -y, fp);
    if (flatBg) {
      for (let c = 0; c < 3; c++) out[c] = bface[c] * t;
      if (bgKind === 'shed') { const k = 1 - 0.4 * lineMask(x, 0.16, 0.005, fp); out[0] *= k; out[1] *= k; out[2] *= k; }
      if (y > hedgeH - (bgKind === 'garden-wall' ? 0.08 : 0.3)) { out[0] *= 0.45; out[1] *= 0.45; out[2] *= 0.48; }
    } else {
      const g = fbm(x * 2.2, y * 2.2, 3, fp * 2.2);
      for (let c = 0; c < 3; c++) out[c] = bface[c] * t * (0.7 + 0.6 * g);
    }
  };
  const far = (c, refs = [gface], minDE = 22) => {
    if (refs.every((r) => S3.deltaE(c, r) >= minDE)) return c;
    for (const k of [1.6, 0.55, 2.2, 0.4, 3]) { const d = c.map((v) => Math.min(0.9, v * k)); if (refs.every((r) => S3.deltaE(d, r) >= minDE)) return d; }
    return c;
  };
  const farHex = (h) => hexOf(far(lin(h)));
  const woods = TW.map((T, i) => { const b = far(faceColour(T.mean, 0.22 + 0.2 * ((rnd() + i * 0.3) % 1), { warm: [12, 55, 0.6], otherSat: 0.15 })); return [hexOf(b), hexOf(b.map((v) => v * 0.62))]; });
  const wires = LOOKS.wire.map((h) => S3.deltaE(lin(h), gface) >= 25 ? h : LOOKS.wire.find((w) => w !== h));
  const CABS = splitOf(style, 'could_hide_tap|cabinet-paint', CAB_PAINT, (h) => h, 3), BINS = splitOf(style, 'could_hide_tap|bin-paint', BIN_PAINT, (h) => h, 3);
  const SCRS = splitOf(style, 'could_hide_tap|screen-paint', SCREEN_PAINT, (h) => h, 2), CARTS = splitOf(style, 'could_hide_tap|carton', CARTONS, (c) => c[0], 2);
  const sh = [Math.floor(rnd() * 12), Math.floor(rnd() * 10), Math.floor(rnd() * 5), Math.floor(rnd() * 3)];
  const objMats = (o) => {
    const M = {}, k = o.lk ?? o.col ?? 0;
    if (o.kind === 'crate') { const [b, d] = woods[(k + sh[3]) % 3]; M.crate = { c: lin(b), ks: 0.06, sh: 14, tex: woodPlanks(b, d) }; M.crateDark = { c: lin(d), ks: 0.06, sh: 14, tex: woodPlanks(d, d, false) }; }
    else if (o.kind === 'cabinet') {
      if (!o.open) { const b = farHex(CABS[(k + sh[0]) % CABS.length]), d = hexOf(lin(b).map((v) => v * 0.6)); M.cabinet = { c: lin(b), ks: 0.12, sh: 22, tex: painted(b, d) }; M.cabRoof = { c: lin(d), ks: 0.1, sh: 20 }; M.knob = { c: lin('#d8d4c8'), ks: 0.4, sh: 50 }; }
      else M.wire = { c: lin(wires[o.col % 2]), ks: 0.5, sh: 60, env: 0.15 };
    } else if (o.kind === 'bin') { const b = farHex(BINS[(k + sh[1]) % BINS.length]); M.bin = { c: lin(b), ks: 0.25, sh: 30, tex: plastic(b) }; M.binLid = { c: lin(b).map((v) => v * 0.85), ks: 0.3, sh: 30 }; M.tyre = { c: lin('#2a2a2c'), ks: 0.1, sh: 10 }; }
    else if (o.kind === 'barrel') { const [b, d] = woods[(k + sh[3] + 1) % 3]; M.barrel = { c: lin(b), ks: 0.08, sh: 16, tex: staves(b, d) }; M.hoop = { c: lin('#3a3936'), ks: 0.35, sh: 40 }; }
    else if (o.kind === 'carton') { const [b0, t] = CARTS[k % CARTS.length], b = farHex(b0); M.carton = { c: lin(b), ks: 0.05, sh: 12, tex: cardboard(b, t) }; }
    else if (o.kind === 'screen') {
      const sp = farHex(SCRS[(k + sh[2]) % SCRS.length]);
      const [b, d] = sh[2] < 2 ? woods[(k + sh[3] + 2) % 3] : [sp, hexOf(lin(sp).map((v) => v * 0.7))];
      M.screen = { c: lin(b), ks: 0.06, sh: 14, tex: woodPlanks(b, d, false) }; M.screenDark = { c: lin(d), ks: 0.06, sh: 14, tex: woodPlanks(d, d, false) };
    }
    M.main = Object.values(M)[0];
    return M;
  };
  style.note(`ground:${lawn ? 'lawn' : 'tex'}`); style.note(`fence:${boards ? (paintFence ? 'painted boards' : 'boards') : 'wall'}`); if (bgItem) style.note(`tex:${bgItem.id}`);
  return {
    objMats,
    env: (r) => ({ floorY: 0, wallZ: 0, wallH: r.look.fenceH, hedgeZ: -1.6, hedgeH, floor, wall, hedge, sky: skyF }),
    light: () => light,
    ids: { fence: fe.id, ground: gr.id, hdri: hd.id, lawn, bg: bgKind },
  };
}

export function semanticKey(m) {
  const rd = m.rounds[0], q = (v) => Math.round(v / 0.6);
  const objs = rd.objs.map((o) => `${o.kind}:${o.type}:${o.open ? 'open' : 'solid'}:${o.truth ? 'T' : 'F'}:${q(o.x)},${q(o.z)}:${Math.round(o.sc / 0.25)}`).sort();
  return `could_hide_tap|${rd.sp || (rd.cat && rd.cat.sp) || 'cat'}|${objs.join(';')}`;
}

export function gate(m) {
  if (!m || m.task !== 'could_hide_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  for (const rd0 of m.rounds) {
    const rd = JSON.parse(JSON.stringify(rd0));
    if (roundProblem(rd) !== '') return false;
    if (!Array.isArray(rd.pts) || rd.pts.length !== 6) return false;
    const sc = buildScene(rd);
    for (let i = 0; i < 6; i++) if (objectAt(sc, rd, rd.pts[i][0], rd.pts[i][1]) !== i) return false;
  }
  return true;
}

function objectAt(sc, rd, x, y) {
  if (x < 0 || y < 0 || x > IMG.w || y > IMG.h) return -1;
  const id = pickId(sc, x, y);
  if (id >= 0 && id < rd.objs.length) return id;
  if (id === CAT_ID) return -1;
  const cam = sc.cam;
  for (let i = 0; i < rd.objs.length; i++) {
    const b = screenBox(rd.objs[i], cam);
    if (x >= b[0] - 3 && x <= b[2] + 3 && y >= b[1] - 3 && y <= b[3] + 3) return i;
  }
  return -1;
}
const PROMPT = (sp) => { const n = SPECIES[sp || 'cat'].name; return { main: `Tap everything a second ${n} could hide behind`, sub: `It is the same size as this ${n}` }; };

export default {
  meta: {
    name: 'could_hide_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'tap', x: `0..${IMG.w} board px`, y: `0..${IMG.h} board px`, note: 'select / unselect the object under the point (revisable until Verify)' },
    ],
    promptHuman: "Tap what the animal's twin could hide behind",
  },

  generate(rng) {
    for (let k = 0; k < 8; k++) {
      const m = { task: 'could_hide_tap', board: { ...BOARD }, rounds: Array.from({ length: HARD.rounds }, () => makeRound(rng)) };
      if (gate(m)) return m;
    }
    throw new Error('could_hide_tap: no gated instance');
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const rd = m.rounds[0], id = objectAt(sceneFor(rd), rd, a.x, a.y);
    if (id < 0) return { ok: false, reason: 'no-object' };
    const k = s.sel.indexOf(id);
    if (k >= 0) s.sel.splice(k, 1); else s.sel.push(id);
    return { ok: true };
  },

  verify(s, m) {
    const rd = m.rounds[0], sel = [...new Set(s.sel || [])].sort((a, b) => a - b);
    const success = sel.length > 0 && sel.join(',') === rd.answer.join(',');
    const hit = sel.filter((i) => rd.answer.includes(i)).length, extra = sel.length - hit;
    const partial = Math.max(0, (hit - extra) / rd.answer.length);
    return { success, partial: success ? 1 : partial, error: success ? 0 : 1, detail: { selected: sel.length, correct: hit, wrong: extra, need: rd.answer.length } };
  },

  oracle(m) {
    const rd = m.rounds[0];
    return rd.answer.map((i) => ({ op: 'tap', x: rd.pts[i][0], y: rd.pts[i][1] }));
  },

  randomPolicy(m, rnd) {
    const rd = m.rounds[0], acts = [];
    rd.objs.forEach((o, i) => { if (rnd() < 0.5) acts.push({ op: 'tap', x: rd.pts[i][0], y: rd.pts[i][1] }); });
    return acts;
  },

  async mount(env) {
    env.assets.chd = { key: '', img: null, canvas: null, ringKey: '', ring: null };
    if (env.style) env.assets.look = await styleLook(env.style, env.manifest.rounds[0]);
  },

  drawPrompt(g, r, env) {
    const P = PROMPT(env?.manifest?.rounds?.[0]?.sp);
    drawPromptText(g, r, P.main, P.sub);
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.chd || (env.assets.chd = {});
    const rd = m.rounds[0], q = contextScale(g);
    const look = env.style ? env.assets.look : null;
    const key = look ? `0|${q}|${env.style.key}` : `0|${q}`;
    if (A.key !== key) { A.img = render(look ? buildScene(rd, look) : sceneFor(rd), q); A.canvas = toCanvas(A.img); A.key = key; A.ringKey = ''; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.drawImage(A.canvas, 0, 0, IMG.w, IMG.h);
    const sel = s.sel, rk = `${key}|${sel.slice().sort((a, b) => a - b).join(',')}`;
    const solidSel = sel.filter((id) => !rd.objs[id].open);
    if (A.ringKey !== rk) { A.ringKey = rk; A.ring = solidSel.length ? toCanvas(ringImage(A.img, new Set(solidSel))) : null; }
    if (A.ring) g.drawImage(A.ring, 0, 0, IMG.w, IMG.h);
    const cam = sceneFor(rd).cam;
    for (const id of sel) {
      if (!rd.objs[id].open) continue;
      const b = screenBox(rd.objs[id], cam);
      rr(g, b[0] - 3, b[1] - 3, b[2] - b[0] + 6, b[3] - b[1] + 6, 5);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 2.2; g.stroke();
    }
    for (const id of sel) {
      const b = screenBox(rd.objs[id], cam), bx = Math.min(IMG.w - 10, Math.max(10, (b[0] + b[2]) / 2)), by = Math.max(10, b[1] - 9);
      g.beginPath(); g.arc(bx, by, 8, 0, Math.PI * 2);
      g.fillStyle = ACCENT; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✓', bx, by + 0.5);
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const rd = env.manifest.rounds[0];
    if (objectAt(sceneFor(rd), rd, e.x, e.y) < 0) return [];
    return [{ op: 'tap', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} selected`;
  },
};
