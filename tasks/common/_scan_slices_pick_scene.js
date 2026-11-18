import { makeCam, makeScene, box, cvx, lin, vnoise, hash2 } from './_scan_slices_pick_rt.js';
import { objectParts, HALF, TAB_D, BOX_HALF } from './_scan_slices_pick_geom.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const CARD = { w: 114, h: 100 };
export const SCAN = { w: 214, h: 196 };
export const WALL = 0.1;
export const BOX_OUT = BOX_HALF + WALL;
export const BED_Y = 0.14;

const C = {
  obj: lin('#d9c29c'), floor: lin('#e2dfd9'), tile: lin('#f1efea'), tileEdge: lin('#cfcac1'), red: lin('#d8302a'),
  card: lin('#b88a5b'), cardDark: lin('#9c7247'), tape: lin('#d7b98a'), label: lin('#cf3a2d'), labelEdge: lin('#a92a20'),
  bed: lin('#eceef0'), bedEdge: lin('#c9ced3'), metal: lin('#b9c0c7'), dark: lin('#4b535b'), bench: lin('#d9dadb'),
};

function lightFor(cam) {
  const sg = cam.yaw >= 0 ? 1 : -1, az = (cam.yaw - sg * 58) * Math.PI / 180, el = 54 * Math.PI / 180;
  const fz = (cam.yaw + sg * 70) * Math.PI / 180;
  return {
    dir: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], col: [1.0, 0.97, 0.9], soft: 0.06,
    sky: [0.4, 0.42, 0.46], ground: [0.22, 0.21, 0.2],
    fill: { dir: [Math.sin(fz) * 0.8, 0.45, Math.cos(fz) * 0.8], col: [0.16, 0.17, 0.19] },
  };
}
const skyGrad = (top, bot) => (dx, dy, dz, v, out) => { const k = Math.max(0, Math.min(1, v)); for (let c = 0; c < 3; c++) out[c] = top[c] + (bot[c] - top[c]) * k; };

function camFor(cam, W, H, target, dist, fovY, shiftX = 0, shiftY = 0) {
  const ya = cam.yaw * Math.PI / 180, el = cam.elev * Math.PI / 180;
  const eye = [target[0] + dist * Math.sin(ya) * Math.cos(el), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(ya) * Math.cos(el)];
  return makeCam({ eye, target, fovY, W, H, shiftX, shiftY });
}
function fitCam(cam, W, H, target, pts, pad) {
  const dist = 22, c0 = camFor(cam, W, H, target, dist, 20);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const q = c0.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const s = Math.min((W - pad[0] - pad[1]) / (x1 - x0), (H - pad[2] - pad[3]) / (y1 - y0));
  const fov = 2 * Math.atan(Math.tan(10 * Math.PI / 180) / s) * 180 / Math.PI;
  const c1 = camFor(cam, W, H, target, dist, fov);
  x0 = Infinity; x1 = -Infinity; y0 = Infinity; y1 = -Infinity;
  for (const p of pts) { const q = c1.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const sx = (pad[0] + (W - pad[1])) / 2 - (x0 + x1) / 2, sy = (pad[2] + (H - pad[3])) / 2 - (y0 + y1) / 2;
  return camFor(cam, W, H, target, dist, fov, sx, sy);
}
const boxPts = (x0, x1, y0, y1, z0, z1) => { const o = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) o.push([x, y, z]); return o; };

const TILE_H = 2.25, RED_Z = [2.38, 2.68], RED_X = 0.7;
export function cardCamera(m) {
  const H = m.Y[m.Y.length - 1], R = HALF + TAB_D;
  const pts = [...boxPts(-R, R, 0, H, -R, R), ...boxPts(-RED_X, RED_X, 0, 0, RED_Z[0], RED_Z[1])];
  return fitCam(m.cam, CARD.w, CARD.h, [0, H * 0.4, 0], pts, [8, 8, 6, 5]);
}
export function cardScene(m, obj, cam, look = null) {
  if (look) return cardSceneStyled(m, obj, cam, look);
  const sg = m.cam.yaw >= 0 ? 1 : -1;
  const shapes = objectParts(obj).map((p) => (p.k === 'box' ? box(1, 0, p.b) : cvx(1, 0, p.pl, p.bb)));
  const floor = (x, z, out) => {
    let c = C.floor;
    const ax = Math.abs(x), inTile = ax < TILE_H && Math.abs(z) < TILE_H;
    if (inTile) c = (TILE_H - Math.max(ax, Math.abs(z)) < 0.06) ? C.tileEdge : C.tile;
    if (ax < RED_X && z > RED_Z[0] && z < RED_Z[1]) c = C.red;
    const n = 0.97 + 0.03 * vnoise(x * 3.1, z * 3.1);
    out[0] = c[0] * n; out[1] = c[1] * n; out[2] = c[2] * n;
  };
  return makeScene({
    cam, shapes, mats: [{ c: C.obj, ks: 0.05, sh: 14 }],
    env: { floorY: 0, floor, sky: skyGrad(lin('#eef0f3'), lin('#e3e3e1')), fog: [30, 52] },
    light: lightFor(m.cam), ao: { n: 12, range: 1.0, k: 0.9 },
    ink: { c: lin('#4a4038'), sil: 0.5, crease: 0.28 }, inkIds: new Set([1]),
  });
}

export function postXZ(m) {
  const sg = m.cam.yaw >= 0 ? 1 : -1;
  return [-sg * (BOX_OUT + 0.62), BOX_OUT - 0.35];
}
export const POST_HW = 0.13;
export function scanCamera(m) {
  const H = m.Y[m.Y.length - 1], [px, pz] = postXZ(m);
  const pts = [...boxPts(-BOX_OUT, BOX_OUT, BED_Y, BED_Y + H + WALL, -BOX_OUT, BOX_OUT), ...boxPts(px - 0.3, px + 0.3, 0, BED_Y + H + 0.55, pz - 0.3, pz + 0.3),
    ...boxPts(-BOX_OUT - 0.75, BOX_OUT + 0.75, 0, 0, -BOX_OUT - 0.75, BOX_OUT + 0.75)];
  return fitCam(m.cam, SCAN.w, SCAN.h, [0, H * 0.45, 0], pts, [12, 14, 16, 12]);
}
export function scanScene(m, cam, look = null) {
  if (look) return scanSceneStyled(m, cam, look);
  const sg = m.cam.yaw >= 0 ? 1 : -1, H = m.Y[m.Y.length - 1], top = BED_Y + H + WALL, [px, pz] = postXZ(m);
  const B = BOX_OUT;
  const cardTex = (x, y, z, nx, ny, nz, out) => {
    let c = C.card;
    const grain = 0.94 + 0.06 * vnoise(x * 1.7 + z * 1.7, y * 9 + (nx + nz) * 3);
    if (ny > 0.5) {
      if (Math.abs(z) < 0.32) c = C.tape;
      else if (Math.abs(Math.abs(z) - 0.33) < 0.025) c = C.cardDark;
    } else if (Math.abs(nx) > 0.5) {
      if (Math.abs(z) < 0.32 && y > top - 0.7) c = C.tape;
      if (y > top - 0.08) c = C.cardDark;
    } else if (nz > 0.5) {
      const lx = Math.abs(x), ly = y - (top - 0.62);
      if (lx < 0.78 && Math.abs(ly) < 0.3) c = (lx > 0.72 || Math.abs(ly) > 0.24) ? C.labelEdge : C.label;
      else if (y > top - 0.08) c = C.cardDark;
    } else if (y > top - 0.08) c = C.cardDark;
    out[0] = c[0] * grain; out[1] = c[1] * grain; out[2] = c[2] * grain;
  };
  const bedTex = (x, y, z, nx, ny, nz, out) => {
    const e = Math.max(Math.abs(x), Math.abs(z));
    const c = ny > 0.5 && e > B + 0.55 ? C.bedEdge : C.bed;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  const shapes = [
    box(2, 1, [-B, B, BED_Y, top, -B, B]),
    box(3, 2, [-B - 0.75, B + 0.75, 0, BED_Y, -B - 0.75, B + 0.75]),
    box(4, 3, [px - POST_HW, px + POST_HW, BED_Y, top + 0.45, pz - POST_HW, pz + POST_HW]),
    box(4, 4, [px - 0.26, px + 0.26, BED_Y, BED_Y + 0.06, pz - 0.26, pz + 0.26]),
  ];
  const floor = (x, z, out) => { const n = 0.96 + 0.04 * vnoise(x * 2.3, z * 2.3); for (let c = 0; c < 3; c++) out[c] = C.bench[c] * n; };
  return makeScene({
    cam, shapes,
    mats: [{ c: C.obj }, { c: C.card, ks: 0.03, sh: 8, tex: cardTex }, { c: C.bed, ks: 0.06, sh: 30, tex: bedTex }, { c: C.metal, ks: 0.35, sh: 40 }, { c: C.dark, ks: 0.1, sh: 20 }],
    env: { floorY: 0, floor, sky: skyGrad(lin('#eef1f4'), lin('#e2e4e6')), fog: [18, 34] },
    light: lightFor(m.cam), ao: { n: 10, range: 1.2, k: 0.8 },
    ink: { c: lin('#4a4038'), sil: 0.35, crease: 0.18 }, inkIds: new Set([2, 4]),
  });
}
export { hash2 };

const OBJ_MATS = [
  ['pine', '#d9c29c', 0.05, 14], ['birch', '#e3d2b3', 0.05, 14], ['clay', '#b9ab97', 0.03, 8], ['plaster', '#e6e1d6', 0.04, 10],
  ['sage', '#a9c3a3', 0.18, 30], ['sky', '#a8c3dc', 0.2, 32], ['butter', '#e8d48a', 0.1, 20], ['slate', '#9aa3ab', 0.08, 18],
  ['sand', '#d8c49a', 0.04, 10], ['mint', '#b4dcc8', 0.16, 28], ['lilac', '#c4b8dc', 0.16, 28], ['stone', '#bdb6a8', 0.05, 12],
];
const CONTAINERS = ['cardboard', 'crate', 'case', 'suitcase', 'tote', 'gift', 'cooler', 'hamper'];
const BEDS = ['lab', 'conveyor', 'steel', 'wood', 'mat'];
const BACKDROPS = ['plain', 'panels', 'shelves', 'windows', 'pegboard', 'tiles'];
export const HOUSINGS = [
  { id: 'bezel', x: 224, y: 14, w: 152, h: 166, r: 10, bezel: 8, stand: 'foot' },
  { id: 'flat', x: 222, y: 22, w: 156, h: 150, r: 3, bezel: 4, stand: 'arm' },
  { id: 'tablet', x: 230, y: 30, w: 140, h: 150, r: 16, bezel: 12, stand: 'easel', light: true },
  { id: 'crt', x: 222, y: 8, w: 156, h: 178, r: 14, bezel: 16, stand: 'block' },
  { id: 'medical', x: 226, y: 16, w: 150, h: 166, r: 6, bezel: 10, stand: 'pole', buttons: true },
  { id: 'wide', x: 220, y: 40, w: 158, h: 132, r: 8, bezel: 6, stand: 'foot' },
  { id: 'portrait', x: 246, y: 6, w: 118, h: 180, r: 8, bezel: 7, stand: 'foot' },
  { id: 'laptop', x: 224, y: 14, w: 152, h: 120, r: 6, bezel: 7, stand: 'keyboard' },
  { id: 'compact', x: 238, y: 46, w: 128, h: 116, r: 12, bezel: 9, stand: 'pole' },
];
export const MONITORS = [
  { id: 'cyan', bg: '#0f1a23', frame: '#5d7182', fill: '#cdeefc', sheet: [64, 196, 240], bezel: '#252c33' },
  { id: 'ct-grey', bg: '#0b0b0c', frame: '#6a6a6a', fill: '#ebebeb', sheet: [214, 226, 240], bezel: '#2b2b2d' },
  { id: 'phosphor', bg: '#06140a', frame: '#3f6b4a', fill: '#a6f5b6', sheet: [96, 230, 140], bezel: '#1f2a22' },
  { id: 'violet', bg: '#120e1e', frame: '#625a82', fill: '#ddd2ff', sheet: [168, 140, 255], bezel: '#28243a' },
  { id: 'paper', bg: '#eef2f5', frame: '#8a9aab', fill: '#284a62', sheet: [70, 150, 220], bezel: '#3a4148' },
  { id: 'blueprint', bg: '#0d2a4a', frame: '#5f86b0', fill: '#a9d4ff', sheet: [110, 180, 255], bezel: '#1d2633' },
  { id: 'teal-dark', bg: '#0b1e1e', frame: '#3f7474', fill: '#9feee4', sheet: [70, 220, 200], bezel: '#222b2b' },
];
const PAPER = [['teal', '#2f8f8a'], ['navy', '#2e3f6e'], ['mustard', '#d2a72e'], ['forest', '#2f6b45'], ['plum', '#6a4a7e']];
const TOTE = [['grey', '#6d757c'], ['green', '#4f7f5a'], ['yellow', '#d8b43a'], ['blue', '#3c6a9e'], ['black', '#2c2f33']];
const CASEF = [['navy', '#2c3a58'], ['olive', '#5a5f3a'], ['charcoal', '#383b40'], ['teal', '#2d5c5e'], ['tan', '#9a7b55']];
const COOLERS = [['white', '#e6e8e6'], ['sky', '#8fb4d6'], ['navy-white', '#3c5576'], ['green', '#5f8f6a']];
const CARDBOARD = [['kraft', '#b88a5b'], ['light-kraft', '#c9a77c'], ['dark-kraft', '#9e7c58'], ['white-board', '#d9d2c4'], ['grey-board', '#a8a49c']];
const RIBBONS = [['white', '#f2efe6'], ['gold', '#d9b44a'], ['silver', '#c0c4c8'], ['cream', '#e8dcb8']];
const POST_METALS = [['aluminium', '#b9c0c7'], ['steel', '#9aa1a8'], ['champagne', '#c8c2b4'], ['sage', '#8f9a8c'], ['graphite', '#6f757b']];

export async function styleLook(style) {
  const sp = (pool, ids) => { const f = splitIds(`scan_slices_pick|${pool}`, ids, ids.length >= 10 ? 3 : 2); return ids.filter((id) => f(id) === style.split); };
  const rnd = style.rand;
  const conts = sp('container', CONTAINERS), objs = sp('object', OBJ_MATS.map((o) => o[0])), mons = sp('monitor', MONITORS.map((o) => o.id));
  const beds = sp('bed', BEDS);
  const [ci, oi] = style.primaryCombo('ssp-container-object', [conts.length, objs.length]);
  const cont = conts[ci], obj = OBJ_MATS.find((o) => o[0] === objs[oi]);
  const monId = K.pickOf(rnd, mons), mon = MONITORS.find((o) => o.id === monId), bed = K.pickOf(rnd, beds);
  const housing = K.splitPick(style, 'scan_slices_pick', 'housing', HOUSINGS, rnd(), (h) => h.id, 2);
  const backdrop = K.splitPick(style, 'scan_slices_pick', 'backdrop', BACKDROPS, rnd(), undefined, 2);
  const edge = { x: BOX_OUT + 1.45 + 1.5 * rnd(), z: BOX_OUT + 1.0 + 1.6 * rnd() };
  const notRed = (t) => { const [h, sat] = S3.hueSat(t.mean_lin); return !(sat > 0.5 && S3.hueDist(h, 2) < 22); };
  const benchT = style.pick('tex', (t) => notRed(t) && ((t.use === 'floor' && S3.lum(t.mean_lin) > 0.12) || (t.use === 'wood' && S3.lum(t.mean_lin) > 0.12)));
  const wallT = style.pick('tex', (t) => notRed(t) && t.use === 'wall' && S3.lum(t.mean_lin) > 0.2);
  const contT = cont === 'crate' ? style.pick('tex', (t) => t.use === 'wood' && S3.lum(t.mean_lin) > 0.08)
    : cont === 'hamper' ? style.pick('tex', (t) => t.use === 'fabric' || (t.use === 'wood' && /rough|weathered/.test(t.id)))
    : cont === 'suitcase' ? style.pick('tex', (t) => t.use === 'fabric') : cont === 'case' ? style.pick('tex', (t) => t.use === 'metal' && !/rust/.test(t.id)) : null;
  const tileT = style.pick('tex', (t) => (t.use === 'stone' || t.use === 'floor') && S3.lum(t.mean_lin) > 0.18);
  const hd = style.pick('hdri', (h) => h.use === 'indoor' || h.use === 'studio' || h.use === 'overcast');
  style.note(`container:${cont}`); style.note(`object:${obj[0]}`); style.note(`monitor:${mon.id}`); style.note(`bed:${bed}`);
  const [TB, TW, TC, TT] = await Promise.all([S3.loadTexture(benchT.file), S3.loadTexture(wallT.file), contT ? S3.loadTexture(contT.file) : null, S3.loadTexture(tileT.file)]);
  const J = Array.from({ length: 10 }, () => rnd());
  const muted = (c, L, sat) => S3.scaleTo(S3.keepNamedHues(S3.limitSat(c, sat), [[2, 22]], 0.1, sat), L);
  const benchFace = muted(TB.mean, 0.32 + 0.25 * J[0], 0.22);
  const wallTop = muted(TW.mean, 0.62 + 0.2 * J[1], 0.12), wallBot = wallTop.map((v) => v * (0.82 + 0.08 * J[2]));
  const tileFace = muted(TT.mean, 0.7 + 0.15 * J[3], 0.08);
  const P = (pool, items) => K.splitPick(style, 'scan_slices_pick', pool, items);
  const contFace = cont === 'crate' ? muted(TC.mean, 0.2 + 0.12 * J[4], 0.4) : cont === 'case' ? muted(TC.mean, 0.42 + 0.12 * J[4], 0.06)
    : cont === 'suitcase' ? S3.linOf(P('case_fabric', CASEF)[1]) : cont === 'tote' ? S3.linOf(P('tote', TOTE)[1])
      : cont === 'gift' ? S3.linOf(P('paper', PAPER)[1]) : cont === 'cooler' ? S3.linOf(P('cooler', COOLERS)[1])
        : cont === 'hamper' ? muted(TC.mean, 0.25 + 0.15 * J[4], 0.35) : S3.linOf(P('cardboard', CARDBOARD)[1]);
  const ribbon = S3.linOf(P('ribbon', RIBBONS)[1]);
  const base = { dir: [0, 1, 0], col: [1.0, 0.97, 0.9], soft: 0.06, sky: [0.4, 0.42, 0.46], ground: [0.22, 0.21, 0.2], fill: { dir: [0.8, 0.45, 0.5], col: [0.16, 0.17, 0.19] } };
  const L = S3.hdriLight(hd, base, { albedo: benchFace, total: 1.22, jitter: J[5] });
  return {
    cont, obj: { c: S3.linOf(obj[1]), ks: obj[2], sh: obj[3] }, mon, bed, housing, backdrop, edge,
    bench: K.texSurf({ tex: TB, face: benchFace, keep: 0.15, cv: 0.12, texWorld: 1.6, cell: 2.2, salt: 7 }),
    tile: K.texSurf({ tex: TT, face: tileFace, keep: 0.25, cv: 0.1, texWorld: 2.4 }),
    contSurf: TC ? { T: TC, face: contFace } : null, contFace, ribbon,
    wallTop, wallBot, light: { col: L.col, sky: L.sky, ground: L.ground, fillCol: L.fill.col, soft: L.soft },
    metal: S3.linOf(P('post_metal', POST_METALS)[1]),
    ids: { container: cont, object: obj[0], monitor: mon.id, bed, bench: benchT.id, wall: wallT.id, tile: tileT.id, hdri: hd.id },
  };
}
function skyStyled(look) {
  const T = look.wallTop, B = look.wallBot, kind = look.backdrop, D = look.wallBot.map((v) => v * 0.55), W = [0.78, 0.84, 0.9];
  return (dx, dy, dz, v, out) => {
    const k = Math.max(0, Math.min(1, v));
    for (let c = 0; c < 3; c++) out[c] = T[c] + (B[c] - T[c]) * k;
    if (kind === 'plain') return;
    const az = Math.atan2(dx, -dz) * 180 / Math.PI, el = Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI;
    let m = 0, col = D;
    if (kind === 'panels') m = Math.abs(((az / 9) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.5 : 0;
    else if (kind === 'tiles') m = (Math.abs(((az / 4) % 1 + 1) % 1 - 0.5) > 0.44 || Math.abs(((el / 4) % 1 + 1) % 1 - 0.5) > 0.44) ? 0.35 : 0;
    else if (kind === 'pegboard') { const a = ((az / 2.2) % 1 + 1) % 1 - 0.5, b = ((el / 2.2) % 1 + 1) % 1 - 0.5; m = Math.hypot(a, b) < 0.16 ? 0.55 : 0; }
    else if (kind === 'shelves') {
      const band = ((el + 40) / 9) % 1;
      if (band < 0.08) m = 0.6;
      else if (band < 0.55) { const cell = Math.floor(az / 3.5), h = hash2(cell, Math.floor((el + 40) / 9)); if (h > 0.45) { m = 0.45; col = [0.2 + 0.3 * h, 0.22 + 0.2 * hash2(cell, 3), 0.2 + 0.25 * hash2(cell, 7)]; } }
    } else if (kind === 'windows') {
      const cx = ((az / 22) % 1 + 1) % 1, inWin = cx > 0.15 && cx < 0.85 && el > 4 && el < 20;
      if (inWin) { m = 0.7; col = W; if (Math.abs(cx - 0.5) < 0.012 || Math.abs(el - 12) < 0.25) col = D; }
    }
    if (m > 0) for (let c = 0; c < 3; c++) out[c] += (col[c] - out[c]) * m;
  };
}
function benchStyled(look) {
  const BE = look.bench, ex = look.edge.x, ez = look.edge.z, F = look.wallBot.map((v) => v * 0.45);
  return (x, z, fp, out) => {
    if (Math.abs(x) > ex || z < -ez) { const n = 0.92 + 0.08 * vnoise(x * 2.1, z * 2.1); out[0] = F[0] * n; out[1] = F[1] * n; out[2] = F[2] * n; return; }
    BE(x, z, fp, out);
    const e = Math.min(ex - Math.abs(x), z + ez);
    if (e < 0.05) { const k = 0.75 + 5 * e; out[0] *= k; out[1] *= k; out[2] *= k; }
  };
}
function lightStyled(cam, look) {
  const L = lightFor(cam), S = look.light;
  return { ...L, col: S.col, sky: S.sky, ground: S.ground, fill: { dir: L.fill.dir, col: S.fillCol }, soft: Math.max(0.05, Math.min(0.09, S.soft + 0.01)) };
}
function cardSceneStyled(m, obj, cam, look) {
  const shapes = objectParts(obj).map((p) => (p.k === 'box' ? box(1, 0, p.b) : cvx(1, 0, p.pl, p.bb)));
  const TE = look.tile, BE = look.bench, T = new Float64Array(3);
  const floor = (x, z, out) => {
    const ax = Math.abs(x), inTile = ax < TILE_H && Math.abs(z) < TILE_H;
    if (ax < RED_X && z > RED_Z[0] && z < RED_Z[1]) { out[0] = C.red[0]; out[1] = C.red[1]; out[2] = C.red[2]; return; }
    if (inTile) {
      TE(x, z, 0.02, out);
      if (TILE_H - Math.max(ax, Math.abs(z)) < 0.06) { out[0] *= 0.82; out[1] *= 0.82; out[2] *= 0.82; }
      return;
    }
    BE(x, z, 0.03, out);
  };
  return makeScene({
    cam, shapes, mats: [look.obj],
    env: { floorY: 0, floor, sky: skyStyled(look), fog: [30, 52] },
    light: lightStyled(m.cam, look), ao: { n: 12, range: 1.0, k: 0.9 },
    ink: { c: lin('#4a4038'), sil: 0.5, crease: 0.28 }, inkIds: new Set([1]),
  });
}
function scanSceneStyled(m, cam, look) {
  const H = m.Y[m.Y.length - 1], top = BED_Y + H + WALL, [px, pz] = postXZ(m), B = BOX_OUT;
  const cont = look.cont, F = look.contFace, CS = look.contSurf, S = new Float64Array(3);
  const sampleC = (u, v, out) => {
    if (!CS) { out[0] = F[0]; out[1] = F[1]; out[2] = F[2]; return; }
    const T = CS.T, tpm = T.n / 1.4;
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, 0.012 * tpm)), S);
    const r = Math.max(0.7, Math.min(1.35, 1 + (cont === 'case' ? 0.25 : 0.7) * (S3.lum(S) / Math.max(1e-6, S3.lum(T.mean)) - 1)));
    out[0] = F[0] * r; out[1] = F[1] * r; out[2] = F[2] * r;
  };
  const label = (x, y, out) => {
    const lx = Math.abs(x), ly = y - (top - 0.62);
    if (lx < 0.78 && Math.abs(ly) < 0.3) { const c = (lx > 0.72 || Math.abs(ly) > 0.24) ? C.labelEdge : C.label; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return true; }
    return false;
  };
  const contTex = (x, y, z, nx, ny, nz, out) => {
    const front = nz > 0.5 && ny <= 0.5;
    if (front && label(x, y, out)) return;
    const u = Math.abs(nx) > 0.5 ? z : x, v = ny > 0.5 ? z : y;
    sampleC(u, v, out);
    let k = 1;
    if (cont === 'cardboard') {
      const grain = 0.94 + 0.06 * vnoise(x * 1.7 + z * 1.7, y * 9 + (nx + nz) * 3); k *= grain;
      if (ny > 0.5) { if (Math.abs(z) < 0.32) { out[0] = C.tape[0]; out[1] = C.tape[1]; out[2] = C.tape[2]; } else if (Math.abs(Math.abs(z) - 0.33) < 0.025) k *= 0.8; }
      else if (Math.abs(nx) > 0.5 && Math.abs(z) < 0.32 && y > top - 0.7) { out[0] = C.tape[0]; out[1] = C.tape[1]; out[2] = C.tape[2]; }
      if (ny <= 0.5 && y > top - 0.08) k *= 0.82;
    } else if (cont === 'crate') {
      const e = ny > 0.5 ? Math.min(B - Math.abs(x), B - Math.abs(z)) : Math.min(B - Math.abs(u), top - y, y - BED_Y);
      if (ny <= 0.5 && e > 0.12) { const g = ((y - BED_Y) / 0.36) % 1; if (g < 0.06) k *= 0.45; }
      if (ny > 0.5 && e > 0.12) { const g = ((x + B) / 0.36) % 1; if (g < 0.06) k *= 0.45; }
      if (Math.abs(e - 0.12) < 0.012) k *= 0.6;
    } else if (cont === 'case') {
      const e = ny > 0.5 ? Math.min(B - Math.abs(x), B - Math.abs(z)) : Math.min(B - Math.abs(u), top - y, y - BED_Y);
      if (e < 0.09) { out[0] = 0.04; out[1] = 0.04; out[2] = 0.045; return; }
      if (ny <= 0.5 && Math.abs(((y - BED_Y) / 0.5) % 1 - 0.5) < 0.02) k *= 0.7;
    } else if (cont === 'suitcase') {
      const e = ny > 0.5 ? Math.min(B - Math.abs(x), B - Math.abs(z)) : Math.min(B - Math.abs(u), top - y, y - BED_Y);
      if (e < 0.035) k *= 0.55;
      if (ny <= 0.5 && Math.abs(y - (top - 0.25)) < 0.02) k *= 0.5;
    } else if (cont === 'tote') {
      if (ny <= 0.5) { if (top - y < 0.12) k *= 1.08; else if (Math.abs(((y - BED_Y) / 0.3) % 1 - 0.5) < 0.05) k *= 0.82; }
    } else if (cont === 'cooler') {
      if (ny > 0.5 || top - y < 0.16) { out[0] = 0.78; out[1] = 0.79; out[2] = 0.78; k = 1; }
      else if (Math.abs(y - (top - 0.2)) < 0.02) k *= 0.7;
    } else if (cont === 'hamper') {
      const a = Math.floor((ny > 0.5 ? x : u) / 0.09) + Math.floor((ny > 0.5 ? z : y) / 0.09);
      k *= (a & 1) ? 0.82 : 1.06;
    } else if (cont === 'gift') {
      const dots = vnoise(x * 6 + z * 6, y * 6) > 0.7 ? 1.12 : 1;
      k *= dots;
      const band = ny > 0.5 ? Math.min(Math.abs(x), Math.abs(z)) : Math.abs(u);
      if (band < 0.12 && !(front && Math.abs(y - (top - 0.62)) < 0.32)) { out[0] = look.ribbon[0]; out[1] = look.ribbon[1]; out[2] = look.ribbon[2]; return; }
    }
    out[0] *= k; out[1] *= k; out[2] *= k;
  };
  const BED = look.bed;
  const bedTex = (x, y, z, nx, ny, nz, out) => {
    const e = Math.max(Math.abs(x), Math.abs(z));
    let c;
    if (BED === 'conveyor') {
      c = ny > 0.5 && e < B + 0.55 ? [0.035, 0.035, 0.04] : [0.18, 0.19, 0.2];
      if (ny > 0.5 && e < B + 0.55 && Math.abs(((x + 4) / 0.45) % 1) < 0.04) c = [0.06, 0.06, 0.07];
    } else if (BED === 'steel') c = ny > 0.5 && e > B + 0.55 ? [0.32, 0.34, 0.36] : [0.5, 0.52, 0.54];
    else if (BED === 'wood') c = ny > 0.5 ? (Math.abs(((x + 3) / 0.25) % 1) < 0.04 ? [0.2, 0.12, 0.06] : [0.36, 0.22, 0.11]) : [0.24, 0.15, 0.08];
    else if (BED === 'mat') c = ny > 0.5 && e < B + 0.55 ? [0.06, 0.14, 0.09] : [0.1, 0.11, 0.12];
    else c = ny > 0.5 && e > B + 0.55 ? C.bedEdge : C.bed;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  const shapes = [
    box(2, 1, [-B, B, BED_Y, top, -B, B]),
    box(3, 2, [-B - 0.75, B + 0.75, 0, BED_Y, -B - 0.75, B + 0.75]),
    box(4, 3, [px - POST_HW, px + POST_HW, BED_Y, top + 0.45, pz - POST_HW, pz + POST_HW]),
    box(4, 4, [px - 0.26, px + 0.26, BED_Y, BED_Y + 0.06, pz - 0.26, pz + 0.26]),
  ];
  const BE = look.bench;
  const BENCH = benchStyled(look), floor = (x, z, out) => BENCH(x, z, 0.03, out);
  const gloss = cont === 'case' || cont === 'tote' ? { ks: 0.25, sh: 36 } : { ks: 0.03, sh: 8 };
  return makeScene({
    cam, shapes,
    mats: [{ c: look.obj.c }, { c: F, ...gloss, tex: contTex }, { c: C.bed, ks: BED === 'steel' ? 0.3 : 0.06, sh: 30, tex: bedTex }, { c: look.metal, ks: 0.35, sh: 40 }, { c: C.dark, ks: 0.1, sh: 20 }],
    env: { floorY: 0, floor, sky: skyStyled(look), fog: [18, 34] },
    light: lightStyled(m.cam, look), ao: { n: 10, range: 1.2, k: 0.8 },
    ink: { c: lin('#4a4038'), sil: 0.35, crease: 0.18 }, inkIds: new Set([2, 4]),
  });
}
