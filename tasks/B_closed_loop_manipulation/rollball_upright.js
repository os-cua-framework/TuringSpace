import { drawPromptText } from '../core/panel.js';
import { LAYOUT, relativeGestures, axisQ, arc, unit, mul, rotate, semanticUpright, drag, grounded, noIntersect } from '../common/_upright_model.js';
import { controlWitness } from '../common/_upright_controls.js';
import { makeCam, makeScene, render, blit, shape, lin, fbm, hash2, lineMask, mixInto, contextScale } from '../common/_props_rt.js';
import { splitIds, nthOf } from '../core/style.js';
import * as S3 from '../common/_style3d.js';
import * as LK from '../common/_block_scene_look.js';

const BOARD = LAYOUT.board;
const PARTS = [
  { id: 'seat', c: [0, 44, 0.5], s: [42, 4, 40] },
  { id: 'leg_fl', c: [-18, 21, 17.5], s: [3.4, 42, 3.4] },
  { id: 'leg_fr', c: [18, 21, 17.5], s: [3.4, 42, 3.4] },
  { id: 'leg_bl', c: [-18, 45, -17.5], s: [3.6, 90, 3.6] },
  { id: 'leg_br', c: [18, 45, -17.5], s: [3.6, 90, 3.6] },
  { id: 'rail_top', c: [0, 84, -17.5], s: [32.4, 9, 2.6] },
  { id: 'rail_mid', c: [0, 66, -17.5], s: [32.4, 4, 2.2] },
  { id: 'str_l', c: [-18, 12, 0], s: [2.2, 2.6, 31.6] },
  { id: 'str_r', c: [18, 12, 0], s: [2.2, 2.6, 31.6] },
];
const PIVOT_Y = 44;
const B = (id, c, s, m = 'main') => ({ id, c, s, m });
const OBJECTS = {
  stool: { noun: 'stool', pivot: 34, parts: [B('seat', [0, 62, 0], [34, 4, 34]),
    ...[[-13, -13], [13, -13], [-13, 13], [13, 13]].map(([x, z], i) => B(`leg${i}`, [x, 30, z], [3.4, 60, 3.4], 'accent')),
    B('ring_f', [0, 22, 13], [26, 2.2, 2.2], 'accent'), B('ring_b', [0, 22, -13], [26, 2.2, 2.2], 'accent'), B('ring_l', [-13, 22, 0], [2.2, 2.2, 26], 'accent'), B('ring_r', [13, 22, 0], [2.2, 2.2, 26], 'accent')] },
  side_table: { noun: 'side table', pivot: 28, parts: [B('top', [0, 52, 0], [56, 4, 42]),
    ...[[-24, -17], [24, -17], [-24, 17], [24, 17]].map(([x, z], i) => B(`leg${i}`, [x, 25, z], [4, 50, 4], 'accent')),
    B('shelf', [0, 14, 0], [48, 2.4, 34])] },
  bench: { noun: 'bench', pivot: 36, parts: [B('seat', [0, 40, 3], [70, 4, 30]),
    ...[[-31, -10], [31, -10], [-31, 15], [31, 15]].map(([x, z], i) => B(`leg${i}`, [x, 19, z], [4, 38, 4], 'accent')),
    B('post_l', [-31, 58, -14], [4, 34, 3]), B('post_r', [31, 58, -14], [4, 34, 3]), B('back', [0, 66, -14], [62, 12, 2.4])] },
  floor_lamp: { noun: 'floor lamp', pivot: 46, parts: [B('base', [0, 1.5, 0], [30, 3, 30], 'metal'), B('pole', [0, 44, 0], [3, 82, 3], 'metal'),
    B('shade', [0, 84, 0], [30, 22, 30], 'accent'), B('bulb_cap', [0, 96, 0], [8, 2, 8], 'metal')] },
  bookcase: { noun: 'bookcase', pivot: 44, parts: [B('side_l', [-21, 45, 0], [2.4, 78, 28]), B('side_r', [21, 45, 0], [2.4, 78, 28]),
    B('kick', [0, 3, 2], [34, 6, 22], 'accent'), B('bottom', [0, 7, 0], [40, 2, 28]), B('mid', [0, 44, 0], [40, 2, 28]), B('top', [0, 85.5, 0], [47, 3, 32]),
    ...[[-15, 13], [-10, 15], [-5.5, 11], [-1, 14]].map(([x, h], i) => B(`book${i}`, [x, 8 + h / 2, 2], [3.8, h, 20], `book${i}`)),
    ...[[2, 16], [6.5, 12], [11, 15]].map(([x, h], i) => B(`bookb${i}`, [x, 45 + h / 2, 2], [4, h, 20], `book${i + 4}`))] },
  nightstand: { noun: 'nightstand', pivot: 30, parts: [B('body', [0, 34, 0], [40, 40, 34]), B('top', [0, 55.5, 0.5], [44, 3, 37]),
    B('drawer', [0, 42, 17.3], [34, 14, 0.8], 'accent'), B('knob', [0, 42, 18.5], [4, 2.5, 1.8], 'metal'),
    ...[[-17, -14], [17, -14], [-17, 14], [17, 14]].map(([x, z], i) => B(`leg${i}`, [x, 7, z], [3, 14, 3], 'accent'))] },
  mailbox: { noun: 'mailbox', pivot: 44, parts: [B('foot', [0, 2, 0], [26, 4, 26], 'metal'), B('post', [0, 40, 0], [6, 72, 6]),
    B('box', [0, 86, 2], [24, 20, 40], 'accent'), B('flag', [13, 92, 8], [1.2, 14, 3], 'metal'), B('lid', [0, 97, 2], [26, 2.4, 42], 'accent')] },
};
const EXT_NEW = Object.keys(OBJECTS);
const EXT_SPLIT = splitIds('rollball_upright|object', EXT_NEW, 2);
const AZ_BINS = 24, CT_BINS = 6, SP_BINS = 24;
const deg360 = (r) => (((r * 180) / Math.PI) % 360 + 360) % 360;
export function semanticKey(m) {
  const a = Math.floor(deg360(m.azimuth) / 15) % AZ_BINS, c = Math.min(CT_BINS - 1, Math.max(0, Math.floor((m.cosTilt + 1) / 0.25))), s = Math.floor(deg360(m.spin) / 15) % SP_BINS;
  return `rollball_upright|${m.ext === true && m.object ? m.object : 'chair'}|${a},${c},${s}`;
}
const EVAL_KEYS = new Set([
  'rollball_upright|chair|1,2,10',
  'rollball_upright|chair|10,4,7',
  'rollball_upright|chair|10,5,1',
  'rollball_upright|chair|11,4,6',
  'rollball_upright|chair|14,0,11',
  'rollball_upright|chair|15,4,0',
  'rollball_upright|chair|2,2,17',
  'rollball_upright|chair|21,2,12',
  'rollball_upright|chair|22,2,20',
  'rollball_upright|chair|3,1,20',
  'rollball_upright|chair|6,2,16',
  'rollball_upright|chair|9,3,14',
]);
const EXT_CELLS = new Map();
function extCells(split) {
  if (!EXT_CELLS.has(split)) {
    const objs = ['chair', ...EXT_NEW.filter((k) => EXT_SPLIT(k) === split)].filter((k) => split === 'train' || k !== 'chair'), list = [];
    for (const o of objs) for (let a = 0; a < AZ_BINS; a++) for (let c = 0; c < CT_BINS; c++) for (let s = 0; s < SP_BINS; s++) {
      if (!EVAL_KEYS.has(`rollball_upright|${o}|${a},${c},${s}`)) list.push([o, a, c, s]);
    }
    EXT_CELLS.set(split, list);
  }
  return EXT_CELLS.get(split);
}
const objOf = (m) => (m && m.ext === true && OBJECTS[m.object] ? OBJECTS[m.object] : null);
const qMat = (q) => [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])];
export function posedChair(q, obj = null) {
  const ax = qMat(unit(q)), PARTS_ = obj ? obj.parts : PARTS, PIV = obj ? obj.pivot : PIVOT_Y;
  const W = (p) => [0, 1, 2].map((j) => ax[0][j] * p[0] + ax[1][j] * (p[1] - PIV) + ax[2][j] * p[2]);
  const parts = PARTS_.map((p) => ({ id: p.id, c: W(p.c), ax, h: p.s.map((v) => v / 2), m: p.m }));
  let minY = Infinity;
  for (const p of parts) for (let k = 0; k < 8; k++) {
    let y = p.c[1];
    for (let i = 0; i < 3; i++) y += ax[i][1] * p.h[i] * (k >> i & 1 ? 1 : -1);
    minY = Math.min(minY, y);
  }
  for (const p of parts) p.c[1] -= minY;
  return { parts, up: ax[1], lift: -minY };
}
function geometryOf(q, obj = null) {
  const { parts } = posedChair(q, obj);
  const obb = parts.map((p) => ({ type: 'obb', c: { x: p.c[0], y: p.c[1], z: p.c[2] },
    axes: p.ax.map((a) => ({ x: a[0], y: a[1], z: a[2] })), w: p.h[0] * 2, h: p.h[1] * 2, d: p.h[2] * 2 }));
  return { bodies: [{ id: 'chair', supportId: 'floor', parts: obb }],
    supportGeometry: [{ id: 'floor-solid', parts: [{ type: 'box', x: 0, y: -6, z: 0, w: 300, h: 6, d: 300 }] }],
    supports: [{ id: 'floor', type: 'boxTop', bodyId: 'floor-solid', partIndex: 0 }] };
}

const CAM_DIR = (() => { const a = 25 * Math.PI / 180, e = Math.atan(Math.tan(22 * Math.PI / 180)); return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; })();
const TARGET = [0, 34, 0], DIST = 285;
const CAMERA = makeCam({ eye: TARGET.map((v, i) => v + CAM_DIR[i] * DIST), target: TARGET, fovY: 33, W: BOARD.w, H: BOARD.h });
const OAK = lin('#b07a45'), OAK_D = lin('#7f4f27');
function woodTex(x, y, z, nx, ny, nz, s, out) {
  const g = s.grain, px = x - s.gc[0], py = y - s.gc[1], pz = z - s.gc[2];
  const u = px * g[0][0] + py * g[0][1] + pz * g[0][2], v = px * g[1][0] + py * g[1][1] + pz * g[1][2], w = px * g[2][0] + py * g[2][1] + pz * g[2][2];
  const n = fbm(u * 0.04 + s.seed, (v + w) * 0.9, 3), ring = 0.5 + 0.5 * Math.sin((v * 0.7 + w * 0.5 + 6 * n) * 1.3);
  mixInto(out, OAK_D, OAK, 0.45 + 0.35 * n + 0.2 * ring);
}
const MATS = [{ c: OAK, ks: 0.16, sh: 30, env: 0.05, tex: woodTex }];
const TILE_A = lin('#d6d2cb'), TILE_B = lin('#c8c3ba'), GROUT = lin('#a29c92');
function floorTex(x, z, fp, out) {
  const T = 60, ix = Math.floor(x / T), iz = Math.floor(z / T);
  mixInto(out, TILE_A, TILE_B, 0.3 * hash2(ix, iz) + 0.5 * fbm(x * 0.03, z * 0.03, 3, fp * 0.03));
  mixInto(out, out, GROUT, 0.85 * Math.max(lineMask(x, T, 0.5, fp), lineMask(z, T, 0.5, fp)));
}
const ENV = { floorY: 0, floor: floorTex, sky: (dx, dy, dz, out) => { out[0] = 0.8; out[1] = 0.8; out[2] = 0.82; } };
const LIGHT = { dir: [-0.45, 1, 0.5], col: [1.15, 1.1, 1.0], soft: 0.05, sky: [0.46, 0.47, 0.5], ground: [0.22, 0.2, 0.18],
  fill: { dir: [0.7, 0.35, 0.6], col: [0.14, 0.14, 0.16] }, aoK: 0.9, contact: 0.3, contactH: 7 };
export function chairScene(q) {
  const { parts } = posedChair(q);
  const shapes = parts.map((p, i) => {
    const s = shape.obox(0, 0, p.c, p.ax, p.h);
    const order = [0, 1, 2].sort((a, b) => p.h[b] - p.h[a]);
    s.grain = order.map((k) => p.ax[k]); s.gc = p.c; s.seed = i * 7.3;
    return s;
  });
  return makeScene({ cam: CAMERA, shapes, mats: MATS, env: ENV, light: LIGHT });
}

const FINISHES = ['wood', 'painted', 'metal', 'plastic'];
const PAINTS = ['#2f5d50', '#7b2f2a', '#e8e1d0', '#2b2f33', '#c7a24a', '#5a6b7c', '#8a5a3c'];
const BOOKS = ['#7a2e2a', '#2e4a6b', '#3f6b3a', '#c09a3c', '#5b3d66', '#d6cdb8', '#3a3a3a'];
async function styleLook(style) {
  const rnd = style.rand;
  const floors = style.pool('tex', (t) => t.use === 'floor' || t.use === 'wood' || t.use === 'stone'), hdris = style.pool('hdri');
  const SP = (name, items) => LK.splitPool(style, `rollball_upright|${name}`, items);
  const finishes = SP('finish', FINISHES), paints = SP('paint', PAINTS), rooms = SP('room', ['open', 'back', 'corner', 'side']), tiles = SP('tile', [40, 50, 60, 80]), metals = SP('metal', ['#2a2c30', '#8a6a3a', '#9aa0a6', '#c0c4c8']), books = SP('books', BOOKS);
  const [fi, ni, hi] = style.primaryCombo('floor-finish-hdri', [floors.length, finishes.length, hdris.length]);
  const floorItem = floors[fi], finish = finishes[ni], hd = hdris[hi];
  const woodPool = LK.familyPool(style, 'wood'), metalPool = LK.familyPool(style, 'metal');
  const woodItem = LK.pickFrom(woodPool, rnd()), metalItem = LK.pickFrom(metalPool, rnd());
  const room = rooms[Math.floor(rnd() * rooms.length)];
  const wallItem = room === 'open' ? null : LK.pickFrom(style.pool('tex', (t) => t.use === 'wall' || t.use === 'wood'), rnd());
  for (const it of [floorItem, woodItem, metalItem, wallItem]) if (it) style.note(`tex:${it.id}`);
  style.note(`finish:${finish}`); style.note(`hdri:${hd.id}`); style.note(`room:${room}`);
  const load = (it) => (it ? LK.loadTex(it) : null);
  const [Tf, Tw, Tm, Twall, sky] = await Promise.all([load(floorItem), load(woodItem), load(metalItem), load(wallItem), S3.loadSky(hd.sky)]);
  const fLum = 0.14 + 0.36 * rnd(), light = fLum > 0.3;
  const face = S3.scaleTo(S3.limitSat(Tf.mean, 0.25), fLum);
  const oLum = light ? 0.05 + 0.1 * rnd() : 0.22 + 0.2 * rnd();
  const tile = tiles[Math.floor(rnd() * tiles.length)];
  const paint = lin(paints[Math.floor(rnd() * paints.length)]);
  const L = S3.hdriLight(hd, LIGHT, { albedo: face, jitter: rnd() });
  return {
    finish, oLum, paint, Tw, Tm, light: L, books,
    metalTone: metals[Math.floor(rnd() * metals.length)],
    env: {
      floorY: 0, floor: S3.texTileFloor({ tex: Tf, tile, face, grout: face.map((v) => v * 0.6), cv: 0.14, texWorld: tile, groutHW: 0.5, groutK: 0.85, salt: 1 + Math.floor(rnd() * 997) }),
      sky: S3.skyFn(sky, 0.82 * S3.lum(L.sky) / 0.443, 0.15),
      ...(room !== 'open' ? { wall: S3.texWall({ tex: Twall, face: S3.scaleTo(S3.limitSat(Twall.mean, 0.18), 0.2 + 0.3 * rnd()), cv: 0.25, texWorld: 120, skirtH: 8 }) } : {}),
      ...(room === 'back' || room === 'corner' ? { wallZ: -(150 + 120 * rnd()) } : {}),
      ...(room === 'corner' || room === 'side' ? { wallX: -(150 + 100 * rnd()), wallXDir: 1 } : {}),
    },
  };
}
function lookMats(look) {
  const cam = CAMERA, w = look.Tw, mt = look.Tm, L = look.oLum;
  const wood = (k) => (w ? LK.partTexMat(w, { lumTarget: L * k, cv: 0.3, unit: 40, cam, ks: 0.12, sh: 28, env: 0.04 }) : { c: OAK.map((v) => v * k), ks: 0.12, sh: 28 });
  const metal = mt ? LK.partTexMat(mt, { tint: lin(look.metalTone), cv: 0.12, unit: 40, cam, ks: 0.5, sh: 60, env: 0.15 }) : { c: lin(look.metalTone), ks: 0.5, sh: 60, env: 0.15 };
  const paint = (c) => (w ? LK.partTexMat(w, { tint: c, cv: 0.08, unit: 40, cam, ks: 0.22, sh: 40, env: 0.06 }) : { c, ks: 0.22, sh: 40 });
  const tone = (c, k) => c.map((v) => v * k);
  let main, accent;
  if (look.finish === 'wood') { main = wood(1); accent = wood(0.75); }
  else if (look.finish === 'painted') { main = paint(look.paint); accent = paint(tone(look.paint, 0.8)); }
  else if (look.finish === 'metal') { main = metal; accent = mt ? LK.partTexMat(mt, { lumTarget: L, cv: 0.2, unit: 40, cam, ks: 0.4, sh: 50, env: 0.12 }) : metal; }
  else { main = { c: look.paint, ks: 0.4, sh: 50, env: 0.08 }; accent = { c: tone(look.paint, 0.75), ks: 0.35, sh: 40, env: 0.06 }; }
  const mats = [main, accent, metal, ...BOOKS.map((_, i) => ({ c: lin(look.books[i % look.books.length]), ks: 0.08, sh: 16 }))];
  return mats;
}
const roleIndex = (m) => (!m || m === 'main' ? 0 : m === 'accent' ? 1 : m === 'metal' ? 2 : 3 + (Number(m.replace('book', '')) % BOOKS.length));
function styledScene(q, obj, look) {
  const { parts } = obj ? posedChair(q, obj) : posedChair(q);
  const shapes = parts.map((p, i) => {
    const s = shape.obox(0, roleIndex(p.m), p.c, p.ax, p.h);
    const order = [0, 1, 2].sort((a, b) => p.h[b] - p.h[a]);
    s.grain = order.map((k) => p.ax[k]); s.gc = p.c; s.seed = i * 7.3;
    return s;
  });
  look.mats ??= lookMats(look);
  return makeScene({ cam: CAMERA, shapes, mats: look.mats, env: look.env, light: look.light });
}

function sceneFromUniforms(uniforms) {
  const [a, b, d] = uniforms, azimuth = 2 * Math.PI * a, cosTilt = -1 + 1.5 * b, spin = 2 * Math.PI * d;
  const r = Math.sqrt(Math.max(0, 1 - cosTilt * cosTilt)), up = [r * Math.sin(azimuth), cosTilt, r * Math.cos(azimuth)];
  const align = cosTilt === -1 ? axisQ([1, 0, 0], Math.PI) : arc([0, 1, 0], up);
  let q = unit(mul(align, axisQ([0, 1, 0], spin))); if (q[0] < 0) q = q.map((v) => -v);
  return { uniforms: [...uniforms], azimuth, cosTilt, spin, up, q };
}
function relativeHaar(rnd) {
  const u1 = rnd(), u2 = rnd(), u3 = rnd(), a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [b * Math.cos(2 * Math.PI * u3), a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3)];
}
export function inFrame(q, pad = 18, obj = null) {
  for (const p of posedChair(q, obj).parts) for (let k = 0; k < 8; k++) {
    const w = [0, 1, 2].map((j) => p.c[j] + [0, 1, 2].reduce((s, i) => s + p.ax[i][j] * p.h[i] * (k >> i & 1 ? 1 : -1), 0));
    const v = CAMERA.project(w[0], w[1], w[2]);
    if (!(v.x > pad && v.x < BOARD.w - pad && v.y > pad && v.y < BOARD.h - pad)) return false;
  }
  return true;
}
const GRAB_PAD = 10;
function partOutlines(q, obj) {
  return posedChair(q, obj).parts.map((p) => {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const w = [0, 1, 2].map((j) => p.c[j] + [0, 1, 2].reduce((s, i) => s + p.ax[i][j] * p.h[i] * (k >> i & 1 ? 1 : -1), 0));
      const v = CAMERA.project(w[0], w[1], w[2]); pts.push([v.x, v.y]);
    }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
    for (const v of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], v) <= 0) lo.pop(); lo.push(v); }
    for (const v of pts.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], v) <= 0) hi.pop(); hi.push(v); }
    return [...lo.slice(0, -1), ...hi.slice(0, -1)];
  });
}
function outlineDist(H, x, y) {
  let inside = true, d = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ey = b[1] - a[1];
    if (ex * (y - a[1]) - ey * (x - a[0]) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
  }
  return inside ? 0 : d;
}
const onObject = (q, obj, x, y) => partOutlines(q, obj).some((H) => outlineDist(H, x, y) <= GRAB_PAD);
function grabPoint(q, obj) {
  let best = null;
  for (const H of partOutlines(q, obj)) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < H.length; i++) { const [x0, y0] = H[i], [x1, y1] = H[(i + 1) % H.length], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
    if (Math.abs(a) > 1e-9 && (!best || Math.abs(a) > best.a)) best = { a: Math.abs(a), x: cx / (3 * a), y: cy / (3 * a) };
  }
  return [best.x, best.y];
}
const UP_GOAL = Math.cos(8 * Math.PI / 180);
function naturalDrags(m) {
  const obj = objOf(m), out = [];
  let q = [...m.q];
  for (let k = 0; k < 3 && rotate(q, [0, 1, 0])[1] < UP_GOAL; k++) {
    const from = grabPoint(q, obj).map((v) => +v.toFixed(2));
    let best = null;
    for (let y = 6; y <= BOARD.h - 6; y += 2) for (let x = 6; x <= BOARD.w - 6; x += 2) {
      const q1 = drag(q, from, [x, y]), up = rotate(q1, [0, 1, 0])[1];
      if (!best || up > best.up) best = { to: [x, y], up, q1 };
    }
    out.push({ from, to: best.to }); q = best.q1;
  }
  return rotate(q, [0, 1, 0])[1] >= UP_GOAL ? out : null;
}

export function gate(m) {
  if (!m || m.task !== 'rollball_upright' || m.generatorSpec !== 'conditional-Haar' || m.toleranceDegrees !== 20 || m.rounds !== undefined) return false;
  if (!Array.isArray(m.uniforms) || m.uniforms.length !== 3 || !m.uniforms.every((u) => Number.isFinite(u) && u >= 0 && u < 1)) return false;
  const want = sceneFromUniforms(m.uniforms);
  if (Object.keys(want).some((k) => JSON.stringify(want[k]) !== JSON.stringify(m[k]))) return false;
  if (!(m.up[1] <= 0.5 + 1e-12) || semanticUpright(m.q)) return false;
  const obj = objOf(m);
  if (m.ext === true && !obj && m.object !== 'chair') return false;
  const g = obj ? geometryOf(m.q, obj) : geometryOf(m.q);
  return grounded(g).ok && noIntersect(g).ok && (obj ? inFrame(m.q, 18, obj) : inFrame(m.q));
}

const task = {
  meta: { name: 'rollball_upright', family: 'B', board: { ...BOARD }, boardH: 330, headerH: 56, footer: 'verify', uses3d: true,
    chance: (1 - Math.cos(Math.PI / 9)) / 2,
    chanceMeasure: 'One Haar relative rotation realized by a legal two-drag endpoint plan; analytic final-pose measure, not uniform raw screen endpoints',
    actionSpace: [{ op: 'drag', from: '[x,y] on the object', to: '[x,y] captured endpoint; may leave view' }],
    promptHuman: 'Turn the chair upright; any facing is fine. Drag the chair; Verify commits it.' },
  generate(rng, _level, _index, knobs = {}) {
    if (knobs.cue) throw Error('Engineering cue fixtures are unavailable in the conditional-Haar generator');
    if (knobs.ext) {
      const list = extCells(knobs.ext), nn = Math.max(1, Number(knobs.n) || 1);
      for (let hop = 0; hop < list.length; hop++) {
        const [object, a, c, sp] = list[(nthOf(`rollball_upright|${knobs.ext}|cells`, nn, list.length) + hop * 7919) % list.length];
        for (let t = 0; t < 60; t++) {
          const uniforms = [(a + rng.uniform(0, 1)) / AZ_BINS, (c + rng.uniform(0, 1)) * 0.25 / 1.5, (sp + rng.uniform(0, 1)) / SP_BINS];
          if (!uniforms.every((u) => u >= 0 && u < 1)) continue;
          const m = { task: 'rollball_upright', board: { ...BOARD }, generatorSpec: 'conditional-Haar', drawOrder: 'azimuth,cosTilt,localYSpin', ...sceneFromUniforms(uniforms), toleranceDegrees: 20, ext: true, object };
          if (gate(m) && semanticKey(m) === `rollball_upright|${object}|${a},${c},${sp}`) return m;
        }
      }
      throw Error('rollball_upright: no extended pose passed the gate');
    }
    const uniforms = [rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 1)];
    const m = { task: 'rollball_upright', board: { ...BOARD }, generatorSpec: 'conditional-Haar', drawOrder: 'azimuth,cosTilt,localYSpin', ...sceneFromUniforms(uniforms), toleranceDegrees: 20 };
    if (!gate(m)) throw Error('rollball_upright: generated pose failed its own gate');
    return m;
  },
  init(m) { this._drag = null; return { q: [...m.q], gestures: 0 }; },
  applyAction(s, a) {
    if (a?.op !== 'drag' || !Array.isArray(a.from) || !Array.isArray(a.to) || a.from.length !== 2 || a.to.length !== 2 || ![...a.from, ...a.to].every(Number.isFinite)) return { ok: false, reason: 'bad-action' };
    const f = a.from; if (!(f[0] >= 0 && f[0] <= BOARD.w && f[1] >= 0 && f[1] <= BOARD.h)) return { ok: false, reason: 'grab-outside-view' };
    s.q = drag(s.q, a.from, a.to); s.gestures++; return { ok: true };
  },
  verify(s) { const success = semanticUpright(s.q); return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { gestures: s.gestures, upright: success } }; },
  oracle(m) {
    const g = naturalDrags(m) ?? controlWitness(m.q).bestAvailable.gestures;
    return g.map((d) => ({ op: 'drag', from: d.from, to: d.to }));
  },
  oraclePoints(m) { return this.oracle(m).map((a) => ({ from: a.from, to: a.to })); },
  randomPolicy(_m, rnd) { return relativeGestures(relativeHaar(rnd)).map((p) => ({ op: 'drag', ...p })); },
  async mount(env) {
    this._drag = null; env.assets.chair = { key: '', img: null };
    if (env.style) env.assets.look = await styleLook(env.style);
  },
  drawPrompt(g, r, env) {
    const obj = objOf(env?.manifest);
    drawPromptText(g, r, `Turn the ${obj ? obj.noun : 'chair'} upright`, 'Drag to turn it; any facing is fine');
  },
  firstFrameBackground: { checkpoint: 'board', description: 'The tiled floor is background. The chair and its shadow are foreground.' },
  drawBoard(g, br, env) {
    const dragging = !!this._drag, q = this._drag?.q ?? env.state.q, A = env.assets.chair ??= {};
    const qs = dragging ? 0.5 : contextScale(g), key = `${q.join(',')}|${qs}`;
    const look = env.style ? env.assets.look : null, obj = objOf(env.manifest);
    const sceneOf = (qq) => (look ? styledScene(qq, obj, look) : chairScene(qq));
    if (A.key !== key) { A.img = render(sceneOf(q), qs); A.key = key; }
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    if (g.__firstFrameBackground) {
      if (!A.bg || A.bgQ !== qs) { const sc = sceneOf(q); sc.opaque.length = 0; sc.groups.length = 0; sc.occ.length = 0; A.bg = render(sc, qs); A.bgQ = qs; }
      blit(g, A.bg); g.__firstFrameBackground('board');
    }
    blit(g, A.img);
    g.restore();
  },
  pointer(e, env) {
    if (env.submitted) return [];
    if (e.type === 'down') { this._drag = onObject(env.state.q, objOf(env.manifest), e.x, e.y) ? { anchor: [...env.state.q], from: [e.x, e.y], q: [...env.state.q] } : null; return []; }
    if (!this._drag) return [];
    if (e.type === 'move') { this._drag.q = drag(this._drag.anchor, this._drag.from, [e.x, e.y]); return []; }
    if (e.type === 'up') { const d = this._drag; this._drag = null; return [{ op: 'drag', from: d.from, to: [e.x, e.y] }]; }
    return [];
  },
  wantsMoveRedraw: true,
  footerStatus(env) { const obj = objOf(env?.manifest); return `Drag the ${obj ? obj.noun : 'chair'} to turn it`; },
  geometry(m, s) { const obj = objOf(m); return obj ? geometryOf(s?.q ?? m.q, obj) : geometryOf(s?.q ?? m.q); },
  gate,
  featureGeometry(m) {
    const w = controlWitness(m.q).bestAvailable;
    return { featureRequirements: ['target', 'discriminator'],
      features: [{ id: 'object-grab', kind: 'target', ...(() => { const P = partOutlines(m.q, objOf(m)).flat(), xs = P.map((v) => v[0]), ys = P.map((v) => v[1]);
        return { effectiveWidthPx: +(Math.max(...xs) - Math.min(...xs) + 2 * GRAB_PAD).toFixed(2), effectiveHeightPx: +(Math.max(...ys) - Math.min(...ys) + 2 * GRAB_PAD).toFixed(2) }; })() },
        { id: 'endpoint-tolerance', kind: 'discriminator', differencePx: w.certifiedEndpointRadiusPx,
          proof: 'Continuous error radius at all four endpoints of two corrective drags under the 20 deg semantic-up tolerance (_upright_controls.js).' }],
      coverage: { complete: true, scope: 'A press on the object (its parts plus 10 px) grabs the trackball; the only graded quantity is the final up axis.' } };
  },
};
export default task;
