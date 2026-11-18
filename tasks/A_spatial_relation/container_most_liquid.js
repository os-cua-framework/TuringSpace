import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { makeCam, makeScene, render, shape, lin, fbm, hash2, lineMask, pickNear, pickId, objectStats, toCanvas, contextScale, silhouetteRing } from '../common/_largest_cube_color_rt.js';
import { S3, texSurface, texMod, faceColour, reflectFn, loadAll, litFix, splitOf, pickOf } from '../common/_relation_scene_look.js';

const PANEL_W = 560;
const BOARD = { w: 540, h: 322 };
const HARD = Object.freeze({
  glasses: 6,
  ndMin: 1, ndMax: 2,
  ratios: [1.6, 1.5, 1.4],
  pix: 1.06,
  gap: 5,
  edge: 6,
  camDist: 9.0,
});
const CAPS = (() => { const c2 = 1 / HARD.ratios[0], c3 = c2 / HARD.ratios[1], c4 = c3 / HARD.ratios[2]; return [c2, c3, c4, c4, c4]; })();
const TOPN = 3;
const WALL = 0.045, BASE = 0.1;
const DRINKS = [
  { name: 'water', hex: '#2a7fd4', sig: 11 },
  { name: 'juice', hex: '#f08a17', sig: 13 },
  { name: 'berry', hex: '#c2254f', sig: 11 },
  { name: 'lime', hex: '#63b52e', sig: 11 },
];
const r3 = (v) => Math.round(v * 1000) / 1000;
const D2R = Math.PI / 180;

const WALL_Z = -3.4;
function cameraFor(rd) {
  const a = rd.cam.az * D2R, dist = HARD.camDist;
  return makeCam({ eye: [Math.sin(a) * dist, rd.cam.h, Math.cos(a) * dist], target: [0, 0.85, 0.2], fovY: 35, W: BOARD.w, H: BOARD.h });
}
const inner = (g) => g.R - WALL;
const volume = (g) => (g.shape === 'box' ? 4 * inner(g) ** 2 : Math.PI * inner(g) ** 2) * (g.L - BASE);
function shapesFor(rd) {
  const d = DRINKS[rd.drink], liq = lin(d.hex);
  return rd.objs.map((g, id) => shape.vessel(id, { cx: g.x, cz: g.z, R: g.R, H: g.H, w: WALL, b: BASE, L: g.L, liq, sig: d.sig, box: g.shape === 'box', yawDeg: g.yaw }));
}
const ENV = {
  floorY: 0, wallZ: WALL_Z,
  floor(x, z, fp, out) {
    const n = fbm(x * 0.8, z * 0.8, 4, fp * 0.8), fleck = fbm(x * 14 + 3, z * 14, 2, fp * 14);
    const f = Math.max(0, fleck - 0.62) * 2.2 * Math.max(0, 1 - fp * 8);
    const t = 0.5 + 0.05 * n - 0.12 * f;
    out[0] = t * 0.9; out[1] = t * 0.94; out[2] = t;
  },
  wall(x, y, fp, out) {
    const tw = 0.55, th = 0.27, row = Math.floor(y / th), xo = x + (row & 1) * tw / 2;
    const g = Math.max(lineMask(y, th, 0.014, fp), lineMask(xo, tw, 0.014, fp));
    const t = (0.84 + 0.05 * hash2(Math.floor(xo / tw), row)) * (1 - 0.35 * g);
    out[0] = t * 0.93; out[1] = t * 0.95; out[2] = t * 0.97;
  },
  sky(dx, dy, dz, out) { out[0] = 0.8; out[1] = 0.82; out[2] = 0.86; },
  reflect(dx, dy, dz, out) { const t = Math.max(0, Math.min(1, dy * 1.5 + 0.5)); out[0] = 0.35 + 0.6 * t; out[1] = 0.37 + 0.6 * t; out[2] = 0.4 + 0.6 * t; },
};
const LIGHT = { dir: [-0.5, 0.9, 0.55], col: [1.15, 1.12, 1.08], soft: 0.08, sky: [0.55, 0.57, 0.6], ground: [0.3, 0.3, 0.31], aoK: 1, contact: 0.3 };
const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = makeScene({ cam: cameraFor(rd), shapes: shapesFor(rd), mats: [], env: ENV, light: LIGHT }); sceneCache.set(rd, sc); }
  return sc;
}

function liquidPixels(rd, cam, g) {
  const sc = { k: 5, cx: g.x, cz: g.z, box: g.shape === 'box', ca: Math.cos((g.yaw || 0) * D2R), sa: Math.sin((g.yaw || 0) * D2R) };
  const Ri = inner(g), e = cam.eye;
  const b = screenBox(cam, g), step = 2;
  let n = 0;
  for (let y = Math.floor(b[1]); y <= b[3]; y += step) for (let x = Math.floor(b[0]); x <= b[2]; x += step) {
    const a = x - cam.cx, bb = cam.cy - y, f = cam.f, F = cam.F, R = cam.R, U = cam.U;
    let dx = F[0] * f + R[0] * a + U[0] * bb, dy = F[1] * f + U[1] * bb, dz = F[2] * f + R[2] * a + U[2] * bb;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    if (liquidHit(sc, Ri, g.L, e, dx, dy, dz)) n++;
  }
  return n * step * step;
}
function liquidHit(v, Ri, L, e, dx, dy, dz) {
  let lo = -Infinity, hi = Infinity;
  const px = e[0] - v.cx, pz = e[2] - v.cz;
  if (v.box) {
    const o0 = px * v.ca - pz * v.sa, o2 = px * v.sa + pz * v.ca, d0 = dx * v.ca - dz * v.sa, d2 = dx * v.sa + dz * v.ca;
    for (const [o, d] of [[o0, d0], [o2, d2]]) {
      if (Math.abs(d) < 1e-12) { if (o < -Ri || o > Ri) return false; continue; }
      let t1 = (-Ri - o) / d, t2 = (Ri - o) / d; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      lo = Math.max(lo, t1); hi = Math.min(hi, t2);
    }
  } else {
    const a = dx * dx + dz * dz, b = px * dx + pz * dz, c = px * px + pz * pz - Ri * Ri, disc = b * b - a * c;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc); lo = (-b - sq) / a; hi = (-b + sq) / a;
  }
  let t1 = (BASE - e[1]) / dy, t2 = (L - e[1]) / dy; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
  lo = Math.max(lo, t1); hi = Math.min(hi, t2);
  return lo < hi && hi > 0;
}
function screenBox(cam, g) {
  const r = g.shape === 'box' ? g.R * Math.SQRT2 : g.R;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const y of [0, g.H]) {
      const p = cam.project(g.x + r * Math.cos(a), y, g.z + r * Math.sin(a));
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  return [x0, y0, x1, y1];
}

const u = (rng, a, b) => rng.uniform(a, b);
const xsec = (shape, R) => (shape === 'box' ? 4 : Math.PI) * (R - WALL) ** 2;
function glass(rng, shape, R, h, headroom) {
  const L = BASE + h, H = L + headroom;
  if (!(h >= 0.1) || H > 2.5 || R < WALL + 0.15) return null;
  return { shape, yaw: r3(u(rng, 0, 90)), x: 0, z: 0, R, H, L };
}
const pickShape = (rng) => (rng.raw() < 0.35 ? 'box' : 'cyl');
function roleGlass(rng, role, A, strong, capRel, tight) {
  const sh = pickShape(rng), VA = volume(A), cap = VA * capRel * 0.97, hA = A.L - BASE, riA = inner(A), mg = 1 / capRel;
  const lvl = (lo, hi) => (tight ? u(rng, 0.88, 1) : u(rng, lo, hi));
  if (role === 'high') {
    const kA = A.shape === 'box' ? 4 : Math.PI, kD = sh === 'box' ? 4 : Math.PI, gain = strong ? 1.3 : 0;
    const lo = Math.max(0.26, 0.16 / riA, strong ? gain * hA / (2.5 - BASE - 0.12) : 0.26);
    const hi = strong ? 0.97 * kA / (mg * kD * gain) : 0.6;
    if (lo >= hi) return null;
    const rho = u(rng, lo, hi);
    const etaMax = 0.97 * kA / (mg * kD * rho * rho);
    const etaMin = strong ? gain / rho : Math.max(1.05, (hA + 0.12) / hA);
    if (etaMin > etaMax) return null;
    const R = rho * riA + WALL;
    let h = Math.min(hA * u(rng, etaMin, Math.min(etaMax, etaMin * 1.3)), cap / xsec(sh, R), 2.5 - BASE - 0.1);
    if (h <= hA + 0.12 || (strong && rho * h / hA < gain * 0.999)) return null;
    return glass(rng, sh, R, h, u(rng, 0.08, Math.min(0.45, 2.5 - BASE - h)));
  }
  if (role === 'wideLow') {
    const R = Math.min(sh === 'box' ? 0.86 : 0.95, A.R * (strong ? u(rng, 1.3, 1.6) : u(rng, 1.35, 1.9)));
    if (R < A.R * 1.28) return null;
    const h = cap / xsec(sh, R) * (strong ? u(rng, 0.85, 1) : lvl(0.45, 0.95));
    const H = Math.min(2.4, Math.max(A.H * u(rng, 0.5, 1.05), BASE + h + 0.3));
    return glass(rng, sh, R, h, H - BASE - h);
  }
  if (role === 'wide') {
    const R = Math.min(sh === 'box' ? 0.86 : 0.95, A.R * u(rng, 1.1, 1.35));
    const h = cap / xsec(sh, R) * lvl(0.5, 1.0);
    const H = Math.min(2.4, Math.max(A.H * u(rng, 0.95, 1.3), BASE + h + 0.5));
    return glass(rng, sh, R, h, H - BASE - h);
  }
  if (role === 'mid') {
    const R = Math.min(sh === 'box' ? 0.86 : 0.95, A.R * u(rng, 0.75, 1.25));
    if (R < WALL + 0.2) return null;
    const h = cap / xsec(sh, R) * lvl(0.55, 1.0);
    return glass(rng, sh, R, h, u(rng, 0.15, 0.9));
  }
  const R = u(rng, 0.28, Math.max(0.32, A.R * 0.8));
  const h = tight ? cap / xsec(sh, R) * u(rng, 0.88, 1) : Math.min(hA * u(rng, 0.35, 0.85), cap / xsec(sh, R));
  if (tight && h > hA * 1.1) return null;
  return glass(rng, sh, R, h, u(rng, 0.2, 1.0));
}
function tryRound(rng, spec) {
  const rd = { drink: spec.drink, nd: spec.nd, tall: !!spec.tall, cam: { az: r3(u(rng, -10, 10)), h: r3(u(rng, 2.1, 2.7)) }, objs: [], answer: -1 };
  const cam = cameraFor(rd);
  const sh = pickShape(rng);
  const roles = [];
  let A;
  if (spec.tall) {
    A = glass(rng, sh, sh === 'box' ? u(rng, 0.3, 0.46) : u(rng, 0.33, 0.52), u(rng, 0.95, 1.6), u(rng, 0.2, 0.8));
    for (let i = 0; i < spec.nd; i++) roles.push(['wideLow', true]);
    const rest = [];
    for (let i = spec.nd; i < spec.wides; i++) rest.push(['wideLow', false]);
    if (spec.high) rest.push(['high', false]);
    while (roles.length + rest.length < HARD.glasses - 1) rest.push([rng.pick(['mid', 'mid', 'small', 'wideLow']), false]);
    roles.push(...rng.shuffle(rest).slice(0, HARD.glasses - 1 - roles.length));
  } else {
    A = spec.nd > 0
      ? glass(rng, sh, sh === 'box' ? u(rng, 0.52, 0.74) : u(rng, 0.58, 0.84), u(rng, 0.3, 0.62), u(rng, 0.15, 0.9))
      : glass(rng, sh, sh === 'box' ? u(rng, 0.42, 0.74) : u(rng, 0.46, 0.84), u(rng, 0.45, 1.5), u(rng, 0.15, 0.7));
    for (let i = 0; i < spec.nd; i++) roles.push(['high', true]);
    const rest = [];
    if (spec.wide) rest.push(['wide', false]);
    if (spec.high && spec.nd === 0) rest.push(['high', false]);
    while (roles.length + rest.length < HARD.glasses - 1) rest.push([rng.pick(['mid', 'mid', 'wide', 'small']), false]);
    roles.push(...rng.shuffle(rest).slice(0, HARD.glasses - 1 - roles.length));
  }
  if (!A) return null;
  while (roles.length < HARD.glasses - 1) roles.push(['small', false]);
  const G = [A];
  for (let k = 0; k < roles.length; k++) { const [r, strong] = roles[k]; const g = roleGlass(rng, r, A, strong, CAPS[k], k < TOPN - 1); if (!g) return null; G.push(g); }
  if (!podiumOk(G.map(volume), 0)) return null;
  const zs = G.map(() => u(rng, -1.8, 2.2)).sort((a, b) => b - a);
  const rest = rng.shuffle(G.slice(1));
  A.z = zs[spec.rank];
  rest.forEach((g, i) => { g.z = zs[i < spec.rank ? i : i + 1]; });
  for (const g of G) for (const key of ['z', 'R', 'H', 'L']) g[key] = r3(g[key]);
  const slots = rng.shuffle(G.map((_, k) => k));
  const widthOf = (g) => { const b = screenBox(cam, { ...g, x: 0 }); return b[2] - b[0]; };
  const byPos = slots.map((s, k) => ({ s, k })).sort((a, b) => a.s - b.s).map((e) => e.k);
  const widths = byPos.map((k) => widthOf(G[k]) + 4);
  const spare = BOARD.w - 2 * HARD.edge - 4 - widths.reduce((t, w) => t + w, 0) - (G.length - 1) * HARD.gap;
  if (spare < 0) return null;
  const cuts = G.map(() => rng.raw()).concat(rng.raw()), cs = cuts.reduce((t, c) => t + c, 0);
  let at = HARD.edge + 2;
  const boxes = [];
  for (let p = 0; p < byPos.length; p++) {
    const g = G[byPos[p]];
    at += spare * cuts[p] / cs;
    const want = at + widths[p] / 2;
    at += widths[p] + HARD.gap;
    let lo = -12, hi = 12;
    for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (cam.project(mid, g.H / 2, g.z).x < want) lo = mid; else hi = mid; }
    g.x = r3((lo + hi) / 2);
    const b = screenBox(cam, g);
    if (b[0] < HARD.edge || b[2] > BOARD.w - HARD.edge || b[1] < HARD.edge || b[3] > BOARD.h - HARD.edge) return null;
    if (boxes.some((c) => b[0] < c[2] + HARD.gap && c[0] < b[2] + HARD.gap && b[1] < c[3] + HARD.gap && c[1] < b[3] + HARD.gap)) return null;
    boxes.push(b);
  }
  const order = rng.shuffle(G.map((_, k) => k));
  rd.objs = order.map((i) => G[i]);
  rd.answer = order.indexOf(0);
  rd.order = podium(rd.objs.map(volume));
  if (!roundOk(rd)) return null;
  const sc = sceneFor(rd);
  for (let id = 0; id < rd.objs.length; id++) {
    const st = objectStats(sc, id, 2);
    if (st.off > 0 || st.frac < 0.97 || !st.pt) return null;
    rd.objs[id].pt = [r3(st.pt[0]), r3(st.pt[1])];
  }
  return rd;
}
const podium = (vols) => vols.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, TOPN).map((e) => e[1]);
function podiumOk(vols, ans) {
  const sorted = vols.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  if (sorted[0][1] !== ans) return false;
  for (let k = 0; k < TOPN; k++) if (!(sorted[k][0] >= HARD.ratios[k] * sorted[k + 1][0] * (1 + 1e-9))) return false;
  return true;
}
function roundOk(rd) {
  const A = rd.objs[rd.answer];
  if (!A || rd.objs.length !== HARD.glasses) return false;
  for (const g of rd.objs) {
    if (!['cyl', 'box'].includes(g.shape) || !(g.R >= WALL + 0.149) || !(g.L - BASE >= 0.099) || !(g.L <= g.H - 0.07) || g.H > 2.5) return false;
  }
  const vols = rd.objs.map(volume);
  if (!podiumOk(vols, rd.answer)) return false;
  const pod = podium(vols);
  if (!Array.isArray(rd.order) || rd.order.length !== TOPN || rd.order.some((v, k) => v !== pod[k]) || rd.order[0] !== rd.answer) return false;
  const N = HARD.glasses;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = rd.objs[i], b = rd.objs[j], ra = a.shape === 'box' ? a.R * Math.SQRT2 : a.R, rb = b.shape === 'box' ? b.R * Math.SQRT2 : b.R;
    if (Math.hypot(a.x - b.x, a.z - b.z) < ra + rb + 0.12) return false;
  }
  const cam = cameraFor(rd), boxes = rd.objs.map((g) => screenBox(cam, g));
  for (let i = 0; i < N; i++) {
    const b = boxes[i];
    if (b[0] < HARD.edge || b[2] > BOARD.w - HARD.edge || b[1] < HARD.edge || b[3] > BOARD.h - HARD.edge) return false;
    for (let j = i + 1; j < N; j++) {
      const c = boxes[j];
      if (b[0] < c[2] + HARD.gap && c[0] < b[2] + HARD.gap && b[1] < c[3] + HARD.gap && c[1] < b[3] + HARD.gap) return false;
    }
  }
  const px = rd.objs.map((g) => liquidPixels(rd, cam, g)), pA = px[rd.answer];
  let more = 0, less = 0;
  px.forEach((p, i) => { if (i === rd.answer) return; if (p >= pA * HARD.pix) more++; else if (p * HARD.pix <= pA) less++; });
  if (!(rd.nd >= HARD.ndMin && rd.nd <= HARD.ndMax) || more !== rd.nd || less !== N - 1 - rd.nd) return false;
  return noOrderedShortcut(rd);
}
function makeRound(rng, drink) {
  const N = HARD.glasses, nd = rng.int(HARD.ndMin, HARD.ndMax), tall = rng.raw() < 0.5;
  const pTall = Array.from({ length: N }, (_, r) => {
    let s = 0;
    for (let d = HARD.ndMin; d <= HARD.ndMax; d++) if (r >= d) s += 1 / (N - d);
    return s / (HARD.ndMax - HARD.ndMin + 1);
  });
  const WIDE_RANK_W = pTall.map((p) => Math.max(0, 2 / N - p));
  const wsum = WIDE_RANK_W.reduce((t, w) => t + w, 0);
  const wideRank = () => { let x = rng.raw() * wsum; for (let r = 0; r < N - 1; r++) { if ((x -= WIDE_RANK_W[r]) < 0) return r; } return N - 1; };
  for (let k = 0; k < 40; k++) {
    const rank = tall ? rng.int(nd, N - 1) : wideRank();
    const spec = { drink, nd, tall, wides: rng.int(1, 3), rank, wide: rng.raw() < 0.75, high: rng.raw() < 0.75 };
    const cands = [];
    for (let a = 0; a < 1500; a++) {
      const rd = tryRound(rng, spec);
      if (rd) { cands.push({ rd, hits: shortcutHits(rd), tie: rng.raw() }); if (cands.length >= CAND) break; }
    }
    if (cands.length) return cands.sort((x, y) => x.hits - y.hits || x.tie - y.tie)[0].rd;
  }
  throw new Error('container_most_liquid: sampler exhausted');
}

const DRINK_PAL = [
  ['water', '#2a7fd4', 11], ['juice', '#f08a17', 13], ['berry', '#c2254f', 11], ['lime', '#63b52e', 11],
  ['cola', '#5a2a12', 12], ['tea', '#b0601c', 12], ['red_wine', '#7a1430', 12], ['grape', '#6a2f96', 11],
  ['mint', '#22a88c', 11], ['lemonade', '#d8c02a', 13], ['cranberry', '#b81d3a', 11], ['blueberry', '#3b45a8', 11],
  ['coffee', '#4a2c18', 13], ['matcha', '#7aa83a', 12], ['rose', '#d8507a', 11], ['orange_soda', '#f26a1b', 12],
  ['curacao', '#1c8fd0', 10], ['apple', '#c9a22a', 12], ['pomegranate', '#9e1b32', 12], ['kiwi', '#8fbf2f', 12],
];
const COUNTER_OK = (t) => ['wood', 'stone', 'floor'].includes(t.use) || ['metal_plate', 'metal_plate_02'].includes(t.id);
const COUNTER_SKIP = new Set(['stone_tiles_02', 'interior_tiles', 'hexagonal_concrete_paving', 'square_floor_patern_01', 'floor_pattern_02',
  'pavement_02', 'rough_plasterbrick_05', 'cobblestone_floor_08', 'dry_riverbed_rock']);
const TEX_WORLD = { wood: 1.4, floor: 1.6, stone: 0.7, metal: 1.4 };
const GLASS_TINTS = [{ id: 'clear', t: null }, { id: 'blue', t: [0.975, 0.988, 0.995] }, { id: 'green', t: [0.978, 0.994, 0.982] }, { id: 'amber', t: [0.994, 0.984, 0.965] }];
const BACKSPLASH = [
  { id: 'plain', h: 0 }, { id: 'subway', h: 0.5, bond: true }, { id: 'stack-bond', h: 0.5, bond: false }, { id: 'square', h: 1, bond: false },
  { id: 'square-offset', h: 1, bond: true }, { id: 'strip-offset', h: 0.33, bond: true }, { id: 'strip-stack', h: 0.33, bond: false }, { id: 'plain-2', h: 0 },
];
export async function styleLook(style) {
  const counters = style.pool('tex', (t) => COUNTER_OK(t) && !COUNTER_SKIP.has(t.id));
  const walls = style.pool('tex', (t) => t.use === 'wall');
  const hdris = style.pool('hdri');
  const [ci, wi, hi] = style.primaryCombo('counter-wall-hdri', [counters.length, walls.length, hdris.length]);
  const ct = counters[ci], wl = walls[wi], hd = hdris[hi], rnd = style.rand;
  style.note(`tex:${ct.id}`); style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const [TC, TW, sky] = await loadAll([ct, wl, hd]);
  const cL = rnd(), wL = rnd(), lightJ = rnd(), rot = rnd() * Math.PI;
  const bs = pickOf(style, 'container_most_liquid|backsplash', BACKSPLASH, (b) => b.id, 2), tiled = bs.h > 0;
  const tw = 0.2 + 0.4 * rnd(), th = tw * (bs.h || 1), bond = !!bs.bond, groutDark = rnd() < 0.6;
  const tint = pickOf(style, 'container_most_liquid|glass', GLASS_TINTS, (g) => g.id).t, drinkR = rnd();
  let cface = faceColour(TC.mean, 0.18 + 0.37 * cL, { warm: [20, 55, 0.45], otherSat: 0.08 });
  let wface = faceColour(TW.mean, 0.3 + 0.4 * wL, { warm: [20, 55, 0.3], otherSat: 0.08 });
  const light = S3.hdriLight(hd, LIGHT, { albedo: cface, total: 1.44, jitter: lightJ });
  const LY = LIGHT.dir[1] / Math.hypot(...LIGHT.dir), LZ = LIGHT.dir[2] / Math.hypot(...LIGHT.dir);
  const cf = litFix(cface, light, LY, { warm: [20, 55, 0.45], otherSat: 0.08 }), wf = litFix(wface, light, LZ, { warm: [20, 55, 0.3], otherSat: 0.08 });
  cface = cface.map((v, c) => v * cf[c]); wface = wface.map((v, c) => v * wf[c]);
  const floor = texSurface({ T: TC, face: cface, cv: 0.2, texWorld: TEX_WORLD[ct.use] || 1.4, rot });
  const wm = texMod(TW, { cv: tiled ? 0.12 : 0.25, texWorld: 1.3, lo: 0.5, hi: 1.5 });
  const grout = groutDark ? wface.map((v) => v * 0.55) : wface.map((v) => Math.min(0.75, v * 1.35 + 0.05));
  const wall = (x, y, fp, out) => {
    const t = wm(x, -y, fp);
    out[0] = wface[0] * t; out[1] = wface[1] * t; out[2] = wface[2] * t;
    if (tiled) {
      const row = Math.floor(y / th), xo = x + (bond && (row & 1) ? tw / 2 : 0);
      const g = Math.max(S3.lineMask(y, th, 0.011, fp), S3.lineMask(xo, tw, 0.011, fp));
      const k = 0.94 + 0.12 * S3.hash2(Math.floor(xo / tw) + 17, row);
      for (let c = 0; c < 3; c++) out[c] = out[c] * k * (1 - g) + grout[c] * g;
    }
  };
  const pal = splitOf(style, 'container_most_liquid|drink', DRINK_PAL, (d) => d[0], 3);
  const ok = pal.filter(([, hex]) => { const c = lin(hex); return S3.deltaE(c, cface) >= 30 && S3.deltaE(c, wface) >= 30; });
  const dr = (ok.length ? ok : pal)[Math.floor(drinkR * (ok.length || pal.length))];
  const skyF = S3.skyFn(sky, 0.8 * S3.lum(light.sky) / 0.57);
  style.note(`container_most_liquid|drink:${dr[0]}`);
  return {
    light, drink: { liq: lin(dr[1]), sig: dr[2] }, tint,
    env: { floorY: 0, wallZ: WALL_Z, floor, wall, sky: skyF, reflect: reflectFn(skyF, cface.map((v) => v * 1.2)) },
    ids: { counter: ct.id, wall: wl.id, hdri: hd.id, drink: dr[0], tiled },
  };
}
function styledScene(rd, look) {
  const shapes = rd.objs.map((g, id) => shape.vessel(id, { cx: g.x, cz: g.z, R: g.R, H: g.H, w: WALL, b: BASE, L: g.L, liq: look.drink.liq, sig: look.drink.sig,
    box: g.shape === 'box', yawDeg: g.yaw, tint: look.tint }));
  return makeScene({ cam: cameraFor(rd), shapes, mats: [], env: look.env, light: look.light });
}

export function semanticKey(m) {
  const q = (v, s) => Math.round(v / s);
  const g = m.objs.map((o, i) => ({ o, i })).sort((a, b) => a.o.x - b.o.x)
    .map(({ o, i }) => `${o.shape}:${q(o.R, 0.1)}:${q(o.L - BASE, 0.25)}:${q(o.H, 0.25)}:${q(o.x, 0.75)},${q(o.z, 0.75)}${i === m.answer ? ':A' : ''}`);
  return `container_most_liquid|${m.tall ? 'tall' : 'wide'}|nd${m.nd}|${g.join(';')}`;
}

export function shortcutFeatures(m) {
  const cam = cameraFor(m);
  return m.objs.map((g) => {
    const b = screenBox(cam, g), h = g.L - BASE;
    return {
      widest: g.R, capacity: xsec(g.shape, g.R) * (g.H - BASE), tallest: g.H, level: g.L, levelFrac: h / (g.H - BASE),
      liqPixels: liquidPixels(m, cam, g), liqWidthPx: b[2] - b[0], boxArea: (b[2] - b[0]) * (b[3] - b[1]), xsec: xsec(g.shape, g.R),
    };
  });
}
const SHORTCUTS = ['widest', 'capacity', 'tallest', 'level', 'levelFrac', 'liqPixels', 'liqWidthPx', 'boxArea', 'xsec'];
function shortcutPicks(f, key, sign) { return f.map((_, i) => i).sort((a, b) => sign * (f[b][key] - f[a][key])).slice(0, TOPN); }
function noOrderedShortcut(m) {
  const f = shortcutFeatures(m);
  return SHORTCUTS.every((k) => [1, -1].every((sg) => !shortcutPicks(f, k, sg).every((v, i) => v === m.order[i])));
}
const CAND = 6;
const SOFT = { top1: ['tallest', 'tallest', 'widest', 'capacity', 'xsec', 'boxArea', 'level', 'levelFrac', 'levelFrac', 'liqWidthPx'],
  set3: ['widest', 'capacity', 'xsec', 'boxArea', 'level', 'liqWidthPx', 'liqPixels', 'tallest'] };
function shortcutHits(rd) {
  const f = shortcutFeatures(rd);
  return SOFT.top1.filter((k) => shortcutPicks(f, k, 1)[0] === rd.order[0]).length
    + SOFT.set3.filter((k) => shortcutPicks(f, k, 1).every((v) => rd.order.includes(v))).length;
}

export function gate(m) {
  if (!m || m.task !== 'container_most_liquid' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if ('rounds' in m) return false;
  for (const rd0 of [m]) {
    if (!DRINKS[rd0.drink] || !Array.isArray(rd0.objs) || !Number.isInteger(rd0.answer) || !Number.isInteger(rd0.nd)) return false;
    const rd = { ...rd0, objs: rd0.objs.map((g) => ({ ...g })) };
    if (!roundOk(rd)) return false;
    const sc = sceneFor(rd);
    for (let id = 0; id < rd.objs.length; id++) {
      const st = objectStats(sc, id, 2), pt = rd.objs[id].pt;
      if (st.off > 0 || st.frac < 0.97) return false;
      if (!Array.isArray(pt) || pickId(sc, pt[0], pt[1]) !== id) return false;
    }
  }
  return true;
}

function badge(g, x, y, n) {
  g.beginPath(); g.arc(x, y, 10.5, 0, Math.PI * 2);
  g.fillStyle = ACCENT; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), x, y + 0.5);
}

export default {
  meta: {
    name: 'container_most_liquid', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'click a glass to number it as the next pick (1st = most liquid, then 2nd, 3rd); clicking a numbered glass clears it and every later number; Verify scores the order' }],
    promptHuman: 'Click the three glasses holding the most liquid, in order: most first, then second most, then third most',
  },

  generate(rng) {
    const drink = rng.shuffle([0, 1, 2, 3])[0];
    return { task: 'container_most_liquid', board: { ...BOARD }, ...makeRound(rng, drink) };
  },

  init() { return { picks: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const id = pickNear(sceneFor(m), a.x, a.y, 10);
    if (id < 0) return { ok: false, reason: 'no-glass' };
    const at = s.picks.indexOf(id);
    if (at >= 0) { s.picks.length = at; return { ok: true, cleared: true }; }
    if (s.picks.length >= TOPN) return { ok: false, reason: 'full' };
    s.picks.push(id);
    return { ok: true };
  },

  verify(s, m) {
    let prefix = 0;
    while (prefix < s.picks.length && s.picks[prefix] === m.order[prefix]) prefix++;
    const success = s.picks.length === TOPN && prefix === TOPN;
    return { success, partial: prefix / TOPN, error: success ? 0 : 1, detail: { answered: s.picks.length, picks: s.picks.slice() } };
  },

  oracle(m) { return m.order.map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] })); },

  randomPolicy(m, rnd) {
    const ids = m.objs.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, TOPN).map((i) => ({ op: 'click', x: m.objs[i].pt[0], y: m.objs[i].pt[1] }));
  },

  async mount(env) {
    env.assets.cml = { img: null, key: '', ring: null, ringKey: '' };
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Click the 3 glasses with the most liquid, most first', 'The real amounts, not how tall they look');
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.cml || (env.assets.cml = {});
    const look = env.style ? env.assets.look : null;
    const q = contextScale(g), key = look ? `${q}|${env.style.key}` : `${q}`;
    if (A.key !== key) { A.img = render(look ? styledScene(m, look) : sceneFor(m), q); A.canvas = toCanvas(A.img); A.key = key; A.ring = null; A.ringKey = ''; }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    if (!A.rings || A.ringsKey !== key) { A.rings = new Map(); A.ringsKey = key; }
    const cam = cameraFor(m);
    s.picks.forEach((id, k) => {
      let ring = A.rings.get(id);
      if (!ring) { ring = silhouetteRing(A.img, id, [25, 145, 250, 255], 2.5); A.rings.set(id, ring); }
      g.drawImage(ring, 0, 0, BOARD.w, BOARD.h);
      const b = screenBox(cam, m.objs[id]);
      badge(g, Math.max(14, Math.min(BOARD.w - 14, (b[0] + b[2]) / 2)), Math.max(14, b[1] - 12), k + 1);
    });
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted || e.type !== 'down') return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    const n = env.state.picks.length;
    return n ? `${n}/${TOPN} picked \u00b7 click a number to undo` : `0/${TOPN} picked`;
  },
};
