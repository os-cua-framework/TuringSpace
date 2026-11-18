import { drawPromptText, UI_FONT, rr, ACCENT } from '../core/panel.js';
import * as RT from '../common/_heading_rt.js';
import { PIECES, ORIENTS, MOVES, SCENE, step, shadow, shadowCells, placed, matching, pathTo, checkRound, sampleRound, cameraOk, mul, orientIndex } from '../common/_silhouette_turn_match_model.js';
import { isXPiece, placedX, shadowX, shadowCellsX, matchingX, checkRoundX, roundsFor } from '../common/_silhouette_turn_match_cubes.js';
import { nthOf } from '../core/style.js';
import * as LOOK from '../common/_heading_look.js';
import { blindProblems, TWO_PRESS, BLIND_TURNS } from '../common/_silhouette_blind_view.js';

const BOARD = { w: 380, h: 378 };
const TARGET = { x: 96, y: 8, w: 188, h: 104, cell: 21 };
const BY = 326;
const BTN = {
  left: { x: 10, y: BY, w: 46, h: 38, glyph: '◀' }, right: { x: 60, y: BY, w: 46, h: 38, glyph: '▶' },
  up: { x: 124, y: BY, w: 46, h: 38, glyph: '▲' }, down: { x: 174, y: BY, w: 46, h: 38, glyph: '▼' },
};
const COLORS = { L4: '#e0564d', T4: '#4a87e0', S4: '#35a05a', P5: '#9a57b8', L5: '#e89a1c', chair: '#d8683a', hook: '#23a0b3' };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const PLACED = (m, o) => (m.ext ? placedX(m.piece, o) : placed(m.piece, o));
const SHCELLS = (m, o) => (m.ext ? shadowCellsX(m.piece, o) : shadowCells(m.piece, o));

export function semanticKey(m) {
  const cells = PLACED(m, m.start).map((c) => c.map((v) => +v.toFixed(1)).join(',')).sort().join(';');
  return `silhouette_turn_match|${cells}|${m.target}`;
}

export function gate(m) {
  try {
    if (m?.task !== 'silhouette_turn_match' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
    if (m.ext) return !('rounds' in m) && isXPiece(m.piece) && cameraOk(m.cam) && checkRoundX(m).length === 0;
    if ('rounds' in m || !PIECES[m.piece]) return false;
    if (m.cue === 'blind') return cameraOk(m.cam) && checkRound(m).length === 0 && blindProblems(m, matching).length === 0;
    return cameraOk(m.cam) && checkRound(m).length === 0;
  } catch { return false; }
}

function poly(g, pts, fill, stroke, lw = 1.2, dash = null) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.save(); if (dash) g.setLineDash(dash); g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); g.restore(); }
}
function rotAxis(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), [x, y, z] = v;
  return axis === 'x' ? [x, c * y - s * z, s * y + c * z] : [c * x + s * z, y, -s * x + c * z];
}

function drawCard(g, T, r, castO, title, card = null) {
  rr(g, T.x, T.y, T.w, T.h, 8); g.fillStyle = card ? card.fill : '#f4eee4'; g.fill(); g.strokeStyle = card ? card.edge : '#b8ad9c'; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = card ? card.text : '#6d6252'; g.font = `600 10.5px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(title, T.x + 8, T.y + 11);
  const cells = SHCELLS(r, r.goal), key = new Set(cells.map(([x, y]) => `${x},${y}`));
  const cast = castO !== null && castO !== undefined ? SHCELLS(r, castO) : [];
  const top = T.y + 22, bot = T.y + T.h - 6, all = [...cells, ...cast];
  const span = (i) => Math.max(...all.map((p) => p[i])) - Math.min(...all.map((p) => p[i])) + 1;
  const c = Math.min(T.cell, (bot - top) / span(1), (T.w - 16) / span(0));
  const cx = T.x + T.w / 2, cy = (top + bot) / 2;
  const sq = (x, y) => [[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]].map(([u, v]) => ({ x: cx + u * c, y: cy - v * c }));
  for (const [x, y] of cells) poly(g, sq(x, y), 'rgba(84,96,110,0.10)', null);
  for (const [x, y] of cast) poly(g, sq(x, y), 'rgba(28,36,46,0.62)', null);
  g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#2f3d4a'; g.lineWidth = 2; g.lineCap = 'round';
  for (const [x, y] of cells) {
    const q = sq(x, y);
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => {
      if (key.has(`${x + dx},${y + dy}`)) return;
      const a = q[i], b = q[(i + 1) % 4]; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    });
  }
  g.restore();
}
function drawTarget(g, m, s, done, card = null) {
  g.fillStyle = '#f7f9fb'; g.fillRect(0, 0, BOARD.w, SCENE.rect.y);
  drawCard(g, TARGET, m, done ? s.o : null, done ? 'Outline and shadow' : 'The wall, seen from the lamp', card);
}

const SR = SCENE.rect;
const PLASTIC = (hex) => ({ c: RT.lin(hex), ks: 0.32, sh: 46, env: 0.18 });
const STEEL = { c: RT.lin('#6f7780'), ks: 0.5, sh: 40, env: 0.25 };
const DARK = { c: RT.lin('#4a525c'), ks: 0.45, sh: 36, env: 0.2 };
const LENS = { c: RT.lin('#fff3c4'), emit: 1.15 };
const PIECE_ID = 1, POST_ID = 2, LAMP_ID = 3;
const LIGHT = { ...RT.STUDIO_LIGHT, dir: [0.55, 1.25, 0.12], soft: 0.06, contact: 0.2 };
const FLOOR = (() => { const A = RT.lin('#c9c4bc'), B = RT.lin('#bdb7ae'); return (x, z, fp, out) => { RT.mixInto(out, A, B, 0.3 + 0.5 * RT.fbm(x * 0.9, z * 0.9, 3, fp)); }; })();
function wallFn(cells) {
  const W = SCENE.wall, P = SCENE.pivot, base = RT.lin('#e2ddd4'), scr = RT.lin('#f6f2ea'), rim = RT.lin('#a99d8a'), sh = RT.lin('#4a4743');
  const set = new Set((cells || []).map(([x, y]) => `${x},${y}`));
  return (x, y, fp, out) => {
    const inScr = x > W.x0 && x < W.x1 && y < W.y1 && y > 0.02;
    const n = RT.fbm(x * 2.2, y * 2.2, 3, fp);
    RT.mixInto(out, base, scr, inScr ? 1 : 0); out[0] *= 0.97 + 0.05 * n; out[1] *= 0.97 + 0.05 * n; out[2] *= 0.97 + 0.05 * n;
    const e = Math.min(Math.abs(x - W.x0), Math.abs(x - W.x1), Math.abs(y - W.y1));
    if (e < 0.07 && x > W.x0 - 0.07 && x < W.x1 + 0.07 && y < W.y1 + 0.07) RT.mixInto(out, out, rim, 0.8);
    if (set.size && inScr) {
      const u = x - P.x, v = y - P.y;
      for (const c of cells) if (Math.abs(u - c[0]) <= 0.5 && Math.abs(v - c[1]) <= 0.5) { RT.mixInto(out, out, sh, 0.72); break; }
    }
  };
}
const CAMS = new Map();
function camOf(cam) {
  const k = `${cam.yaw}|${cam.pitch}`;
  if (CAMS.has(k)) return CAMS.get(k);
  const P = SCENE.pivot, pts = [];
  for (const dx of [-2.2, 2.2]) for (const dy of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) pts.push([P.x + dx, P.y + dy, P.z + dz]);
  pts.push([0, 0, SCENE.lampZ], [0, 3.1, SCENE.lampZ], [0, 0, SCENE.lampZ + 0.6], [0, 0, P.z - 1], [0, 0, P.z + 1]);
  for (const x of [SCENE.wall.x0, SCENE.wall.x1]) for (const y of [0, SCENE.wall.y1]) pts.push([x, y, 0]);
  const c = fitCam(cam.yaw, cam.pitch, pts, SR.w, SR.h, 16);
  CAMS.set(k, c); return c;
}
function fitCam(az, el, pts, W, H, pad) {
  let t = [0, 2.2, 3.6], dist = 16, cam = null;
  for (let it = 0; it < 16; it++) {
    cam = RT.orbitCam({ az, el, dist, fov: 30, tx: t[0], ty: t[1], tz: t[2] }, W, H);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const dx = (x0 + x1) / 2 - W / 2, dy = (y0 + y1) / 2 - H / 2, k = dist / cam.f;
    t = [t[0] + cam.R[0] * dx * k - cam.U[0] * dy * k, t[1] - cam.U[1] * dy * k, t[2] + cam.R[2] * dx * k - cam.U[2] * dy * k];
    dist *= 0.35 + 0.65 * Math.max((x1 - x0) / (W - 2 * pad), (y1 - y0) / (H - 2 * pad));
  }
  return cam;
}
function pieceShapes(cells, mat, axes = null) {
  const P = SCENE.pivot, out = [];
  for (const c of cells) {
    const ctr = [P.x + c[0], P.y + c[1], P.z + c[2]];
    if (axes) out.push(RT.shape.obox(PIECE_ID, mat, ctr, axes, [0.485, 0.485, 0.485]));
    else out.push(RT.shape.box(PIECE_ID, mat, ctr[0], ctr[1], ctr[2], 0.485, 0.485, 0.485, 0, 0.07));
  }
  return out;
}
function staticShapes(cells) {
  const P = SCENE.pivot, out = [], Z = SCENE.lampZ;
  const bottoms = cells.filter((c) => !cells.some((d) => d[0] === c[0] && d[2] === c[2] && d[1] < c[1]));
  const hold = bottoms.reduce((b, c) => (Math.hypot(c[0], c[2]) < Math.hypot(b[0], b[2]) - 1e-9 ? c : b));
  const hx = P.x + hold[0], hz = P.z + hold[2];
  out.push(RT.shape.cyl(POST_ID, 1, hx, hz, 0, P.y + hold[1] - 0.48, 0.07));
  out.push(RT.shape.cyl(POST_ID, 1, hx, hz, 0, 0.08, 0.42, 0.03));
  out.push(RT.shape.cyl(LAMP_ID, 2, 0, Z, 0, 0.1, 0.55, 0.04));
  out.push(RT.shape.cyl(LAMP_ID, 1, 0, Z, 0.1, P.y - 0.42, 0.06));
  out.push(RT.shape.gcyl(LAMP_ID, 2, [0, P.y, Z + 0.45], [0, P.y, Z - 0.35], 0.42));
  out.push(RT.shape.gcyl(LAMP_ID, 3, [0, P.y, Z - 0.33], [0, P.y, Z - 0.37], 0.34));
  return out;
}
function makeSc(m, cells, axes, wallCells, look = null) {
  const cam = camOf(m.cam);
  const mats = look ? [look.piece, look.steel, look.dark, LENS] : [PLASTIC(COLORS[m.piece] || '#4a87e0'), STEEL, DARK, LENS];
  const sideWall = look && look.side ? { wallX: m.cam.yaw > 0 ? -6.2 : 6.2, wallXDir: m.cam.yaw > 0 ? 1 : -1, wallSide: wallFnStyled(null, look, true) } : {};
  const pieceCells = axes ? axes.cells : cells;
  const shapes = [...pieceShapes(pieceCells, 0, axes ? axes.ax : null), ...(look ? staticShapesStyled(cells, look) : staticShapes(cells))];
  const sc = RT.makeScene({ cam, shapes, mats, light: look ? look.light : LIGHT,
    env: look ? { floorY: 0, floor: look.floor, floorMat: { ks: 0, sh: 1, flat: 0.62 }, wallZ: 0, wall: wallFnStyled(wallCells, look), wallMat: { ks: 0, sh: 1, flat: 0.6 }, sky: look.sky, ...sideWall }
      : { floorY: 0, floor: FLOOR, floorMat: { ks: 0, sh: 1, flat: 0.62 }, wallZ: 0, wall: wallFn(wallCells), wallMat: { ks: 0, sh: 1, flat: 0.6 }, sky: RT.softSky } });
  sc.exposure = 1.04;
  return sc;
}

const STM_SKIP = new Set(['herringbone_parquet', 'hexagonal_concrete_paving', 'gingham_check', 'quatrefoil_jacquard_fabric', 'curly_teddy_checkered', 'poly_wool_herringbone']);
const CARDS = [
  { fill: '#f4eee4', edge: '#b8ad9c', text: '#6d6252' }, { fill: '#fbfbf8', edge: '#b9bcc0', text: '#5d6268' },
  { fill: '#eef2f5', edge: '#a9b6c2', text: '#4f5d6b' }, { fill: '#efe3cc', edge: '#b59f78', text: '#6b5636' },
  { fill: '#e9f1ea', edge: '#a3b8a6', text: '#4d6352' }, { fill: '#f3ecef', edge: '#bba9b0', text: '#6b5560' },
];
const LAMP_PAINT = ['#4a525c', '#2f3237', '#b8bcc2', '#7a2f2f', '#2f5f5a', '#c9a23a', '#3f4f7a'];
async function stmLook(style) {
  const room = await LOOK.pickRoom(style, 'stm-floor-wall-hdri', {
    floors: (t) => ['floor', 'wood', 'stone', 'fabric'].includes(t.use) && !STM_SKIP.has(t.id), walls: (t) => t.use === 'wall' });
  const rnd = style.rand, S3 = LOOK.S3;
  const kind = LOOK.pickSplit(style, 'stm_piece_material', ['plastic', 'plastic2', 'wood', 'metal', 'stone']).replace('2', '');
  const matA = kind === 'wood' ? style.pick('tex', (t) => t.use === 'wood') : kind === 'stone' ? style.pick('tex', (t) => t.use === 'stone' || t.use === 'floor') : null;
  const mtex = matA ? await S3.loadTexture(matA.file) : null;
  const toneJ = rnd(), lightJ = rnd(), sizeJ = rnd(), salt = 1 + Math.floor(rnd() * 997);
  let face = LOOK.texFace(room.ftex, { lo: 0.16, hi: 0.46, maxSat: 0.3, j: toneJ });
  let light = LOOK.styledLight(room.hd, LIGHT, { albedo: face, jitter: lightJ });
  face = LOOK.safeFace(face, light, LIGHT);
  light = LOOK.styledLight(room.hd, LIGHT, { albedo: face, jitter: lightJ });
  const floor = room.fl.use === 'wood' ? LOOK.texPlankFloor({ tex: room.ftex, face, plank: 0.22 + 0.12 * sizeJ, plankL: 1.6 + rnd(), cv: 0.14, salt })
    : room.fl.use === 'fabric' ? LOOK.texGround({ tex: room.ftex, face, cv: 0.14, texWorld: 0.9 })
      : S3.texTileFloor({ tex: room.ftex, tile: 0.7 + 0.5 * sizeJ, face, grout: S3.scaleTo(S3.limitSat(face, 0.1), S3.lum(face) * 0.5), cv: 0.1, texWorld: 1.4, salt });
  let wface = S3.safeTint(room.wtex.mean, { maxSat: 0.22, otherSat: 0.1 });
  wface = S3.scaleTo(wface, Math.min(0.5, Math.max(0.24, 0.2 + 0.8 * S3.lum(room.wtex.mean))));
  const hue = LOOK.pickSplit(style, 'g02_paint', LOOK.PAINT, undefined, 3);
  let piece;
  if (kind === 'plastic') piece = { c: S3.scaleTo(S3.linOf(hue), 0.1 + 0.13 * rnd()), ks: 0.32, sh: 46, env: 0.18 };
  else if (kind === 'metal') piece = { c: S3.scaleTo(S3.limitSat(S3.linOf(hue), 0.45), 0.14 + 0.12 * rnd()), ks: 0.55, sh: 60, env: 0.3 };
  else piece = LOOK.texMat({ tex: mtex, tint: S3.scaleTo(S3.limitSat(mtex.mean, 0.4), 0.14 + 0.14 * rnd()), cv: 0.11, world: 2.4, fp: 0.02, ks: kind === 'wood' ? 0.18 : 0.08, sh: 28 });
  const paint = S3.linOf(LOOK.pickSplit(style, 'stm_lamp_paint', LAMP_PAINT));
  const screen = S3.scaleTo(S3.limitSat(S3.linOf(LOOK.pickSplit(style, 'stm_screen', ['#f6f2ea', '#f4f4f1', '#eef0f2', '#f3efe4', '#f1f3ee'])), 0.06), 0.82 + 0.06 * rnd());
  const rim = S3.scaleTo(S3.limitSat(S3.linOf(LOOK.pickSplit(style, 'stm_frame', ['#5a4632', '#3a3d42', '#a99d8a', '#6b6f75', '#2f4f4f'])), 0.3), 0.08 + 0.12 * rnd());
  style.note(`piece:${kind}${matA ? ':' + matA.id : ''}`);
  const tpm = room.wtex.n / 1.6, wk = Math.min(1, 0.22 / Math.max(1e-6, room.wtex.cv)), wInv = 1 / Math.max(1e-6, S3.lum(room.wtex.mean));
  const side = rnd() < 0.55, rugOn = rnd() < 0.5, skirtH = rnd() < 0.7 ? 0.12 + 0.18 * rnd() : 0, frameW = 0.04 + 0.08 * rnd();
  const plainWall = rnd() < 0.45;
  const panel = { x0: SCENE.wall.x0 - 1.4 * rnd(), x1: SCENE.wall.x1 + 1.4 * rnd(), y1: SCENE.wall.y1 + 1.3 * rnd() };
  const lampKind = LOOK.pickSplit(style, 'stm_lamp', ['pole', 'tripod', 'stand', 'crane', 'crates']);
  style.note(`lamp:${lampKind}${plainWall ? '/plain-wall' : ''}`);
  let rug = null;
  if (rugOn) {
    const rugA = style.pick('tex', (t) => t.use === 'fabric' && !STM_SKIP.has(t.id));
    const rtex = await S3.loadTexture(rugA.file);
    const rface = S3.scaleTo(S3.limitSat(S3.linOf(LOOK.pickSplit(style, 'g02_paint', LOOK.PAINT, undefined, 3)), 0.45), Math.max(0.08, Math.min(0.4, S3.lum(face) * (rnd() < 0.5 ? 0.55 : 1.5))));
    rug = { fn: LOOK.texGround({ tex: rtex, face: rface, cv: 0.16, texWorld: 0.8 }), x0: -1.4 - 1.2 * rnd(), x1: 1.4 + 1.2 * rnd(), z0: 1.2 + 0.8 * rnd(), z1: 7.6 + 1.5 * rnd(), border: S3.scaleTo(rface, S3.lum(rface) * 0.55) };
    style.note(`rug:${rugA.id}`);
  }
  const baseFloor = floor;
  const floorFn = !rug ? baseFloor : (x, z, fp, out) => {
    if (x < rug.x0 || x > rug.x1 || z < rug.z0 || z > rug.z1) { baseFloor(x, z, fp, out); return; }
    rug.fn(x, z, fp, out);
    const e = Math.min(x - rug.x0, rug.x1 - x, z - rug.z0, rug.z1 - z);
    if (e < 0.12) { const w = Math.max(0, Math.min(1, (0.12 - e) / Math.max(fp, 1e-4))); RT.mixInto(out, out, rug.border, Math.min(1, w)); }
  };
  return {
    light, floor: floorFn, piece, card: LOOK.pickSplit(style, 'stm_card', CARDS, (c) => c.fill), side, skirtH, frameW, plainWall, panel, lampKind,
    steel: { c: S3.scaleTo(S3.linOf('#6f7780'), 0.16), ks: 0.5, sh: 40, env: 0.25 },
    dark: { c: paint, ks: 0.45, sh: 36, env: 0.2 },
    sky: S3.skyFn(room.sky, 0.87 * S3.lum(light.sky) / 0.443),
    wall: { tex: room.wtex, face: wface, screen, rim, tpm, wk, wInv },
  };
}
function staticShapesStyled(cells, look) {
  const P = SCENE.pivot, Z = SCENE.lampZ;
  const out = staticShapes(cells).filter((s) => s.id === POST_ID);
  const head = [RT.shape.gcyl(LAMP_ID, 2, [0, P.y, Z + 0.45], [0, P.y, Z - 0.35], 0.42), RT.shape.gcyl(LAMP_ID, 3, [0, P.y, Z - 0.33], [0, P.y, Z - 0.37], 0.34)];
  if (look.lampKind === 'tripod') {
    const hub = [0, P.y - 0.55, Z + 0.1];
    for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * 2 * Math.PI / 3; out.push(RT.shape.capsule(LAMP_ID, 1, [0.75 * Math.cos(a), 0.02, Z + 0.1 + 0.75 * Math.sin(a)], hub, 0.045)); }
    out.push(RT.shape.cyl(LAMP_ID, 1, 0, Z + 0.1, P.y - 0.6, P.y - 0.38, 0.06));
    out.push(...head);
  } else if (look.lampKind === 'crane') {
    const px = 0.95, top = P.y + 0.62;
    out.push(RT.shape.box(LAMP_ID, 2, px, 0.05, Z, 0.32, 0.05, 0.32, 0, 0.02));
    out.push(RT.shape.cyl(LAMP_ID, 1, px, Z, 0.1, top, 0.065));
    out.push(RT.shape.gcyl(LAMP_ID, 1, [px, top, Z], [0, top, Z], 0.05));
    out.push(RT.shape.cyl(LAMP_ID, 1, 0, Z, P.y + 0.38, top, 0.05));
    out.push(...head);
  } else if (look.lampKind === 'crates') {
    const h1 = (P.y - 0.42) * 0.55, h2 = (P.y - 0.42) - h1;
    out.push(RT.shape.box(LAMP_ID, 2, 0, h1 / 2, Z + 0.05, 0.55, h1 / 2, 0.5, 8, 0.03));
    out.push(RT.shape.box(LAMP_ID, 1, 0, h1 + h2 / 2, Z, 0.4, h2 / 2, 0.38, -6, 0.03));
    out.push(...head);
  } else if (look.lampKind === 'stand') {
    out.push(RT.shape.box(LAMP_ID, 2, 0, 0.05, Z, 0.5, 0.05, 0.5, 0, 0.02));
    out.push(RT.shape.box(LAMP_ID, 1, 0, (P.y - 0.45) / 2 + 0.05, Z, 0.16, (P.y - 0.45) / 2, 0.16, 0, 0.02));
    out.push(RT.shape.box(LAMP_ID, 2, 0, P.y, Z + 0.1, 0.48, 0.42, 0.42, 0, 0.05));
    out.push(RT.shape.gcyl(LAMP_ID, 3, [0, P.y, Z - 0.31], [0, P.y, Z - 0.36], 0.3));
  } else {
    out.push(RT.shape.cyl(LAMP_ID, 2, 0, Z, 0, 0.1, 0.55, 0.04));
    out.push(RT.shape.cyl(LAMP_ID, 1, 0, Z, 0.1, P.y - 0.42, 0.06));
    out.push(...head);
  }
  return out;
}
function wallFnStyled(cells, look, sideWall = false) {
  const W = look.panel, P = SCENE.pivot, L = look.wall, sh = RT.lin('#4a4743'), S = new Float64Array(3), fw = look.frameW;
  const set = new Set((cells || []).map(([x, y]) => `${x},${y}`));
  const skirt = L.face.map((v) => v * 0.5);
  return (x, y, fp, out) => {
    const inScr = !sideWall && x > W.x0 && x < W.x1 && y < W.y1 && y > 0.02;
    if (inScr || (look.plainWall && !sideWall)) {
      const n = RT.fbm(x * 2.2, y * 2.2, 3, fp);
      out[0] = L.screen[0] * (0.98 + 0.03 * n); out[1] = L.screen[1] * (0.98 + 0.03 * n); out[2] = L.screen[2] * (0.98 + 0.03 * n);
    } else {
      LOOK.S3.sampleTex(L.tex, x * L.tpm, -y * L.tpm, Math.log2(Math.max(1e-9, fp * L.tpm)), S);
      const t = Math.max(0.5, Math.min(1.5, 1 + L.wk * (LOOK.lum(S) * L.wInv - 1)));
      out[0] = L.face[0] * t; out[1] = L.face[1] * t; out[2] = L.face[2] * t;
      if (y < look.skirtH) { out[0] = skirt[0]; out[1] = skirt[1]; out[2] = skirt[2]; }
    }
    if (sideWall) return;
    if (look.plainWall) { if (y < look.skirtH) { out[0] = skirt[0]; out[1] = skirt[1]; out[2] = skirt[2]; } }
    else {
    const e = Math.min(Math.abs(x - W.x0), Math.abs(x - W.x1), Math.abs(y - W.y1));
    if (e < fw && x > W.x0 - fw && x < W.x1 + fw && y < W.y1 + fw) RT.mixInto(out, out, L.rim, 0.85);
    }
    if (set.size && inScr) {
      const u = x - P.x, v = y - P.y;
      for (const c of cells) if (Math.abs(u - c[0]) <= 0.5 && Math.abs(v - c[1]) <= 0.5) { RT.mixInto(out, out, sh, 0.72); break; }
    }
  };
}

function drawButton(g, r, label, enabled, primary = false) {
  rr(g, r.x, r.y, r.w, r.h, 7);
  g.fillStyle = primary ? (enabled ? ACCENT : '#a9cdf5') : '#ffffff'; g.fill();
  g.strokeStyle = primary ? ACCENT : '#aeb9c4'; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = primary ? '#ffffff' : enabled ? '#33414e' : '#b4bec8';
  g.font = primary ? `600 14px ${UI_FONT}` : `17px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
}

const task = {
  meta: {
    name: 'silhouette_turn_match', family: 'B', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    ability: ['MOR', 'SV'], primitive: ['rotate'],
    actionSpace: [
      { op: 'turn', dir: 'left|right (about the vertical axis) | up|down (tip about the axis along the wall), 90° each; the pose on screen is what Verify scores' },
    ],
    promptHuman: 'Turn the block so its shadow fits the outline',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    if (knobs && knobs.cue === 'blind') return generateBlind(rng);
    const piece = rng.pick(Object.keys(PIECES));
    const cam = { yaw: +(rng.sign() * rng.uniform(SCENE.yaw[0] + 1, SCENE.yaw[1] - 1)).toFixed(2), pitch: +rng.uniform(SCENE.pitch[0] + 0.5, SCENE.pitch[1] - 0.5).toFixed(2) };
    const r = sampleRound(rng, piece);
    if (!r) throw new Error('silhouette_turn_match: no admissible scene for ' + piece);
    return { task: 'silhouette_turn_match', board: { ...BOARD }, ...r, cam };
  },

  init(m) { return { o: m.start, presses: 0 }; },

  applyAction(s, a) {
    if (a?.op === 'turn') {
      if (!MOVES[a.dir]) return { ok: false, reason: 'bad-dir' };
      s.o = step(s.o, a.dir); s.presses++; return { ok: true };
    }
    return { ok: false, reason: 'bad-action' };
  },

  verify(s, m) {
    const good = (m.ext ? shadowX(m.piece, s.o) : shadow(m.piece, s.o)) === m.target;
    return { success: good, partial: good ? 1 : 0, error: good ? 0 : 1, detail: { presses: s.presses } };
  },

  oracle(m) {
    return pathTo(m.start, m.ext ? matchingX(m.piece, m.target) : matching(m.piece, m.target)).map((dir) => ({ op: 'turn', dir }));
  },

  randomPolicy(_m, rnd) {
    const acts = [], dirs = Object.keys(MOVES);
    const k = Math.floor(rnd() * 5); for (let i = 0; i < k; i++) acts.push({ op: 'turn', dir: dirs[Math.floor(rnd() * 4)] });
    return acts;
  },

  async mount(env) {
    env.assets.turn = null;
    if (env.style) env.assets.look = await stmLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, 'Turn the block so its shadow fits the outline', env.manifest.cue === 'blind' ? BLIND_SUB : 'The lamp shines straight at the wall');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env, done = !!env.submitted;
    const o = s.o;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const look = env.style ? env.assets.look : null;
    drawTarget(g, m, s, done, look ? look.card : null);
    let A = env.assets.turn;
    if (!A || A.o !== o) {
      const prev = A && A.o !== o ? A.o : null;
      A = env.assets.turn = { o, from: prev, t: prev === null ? 1 : 0 };
    }
    const C = (this._rt ??= { poses: new Map() }), q = Math.min(2, RT.contextScale(g));
    const sk = look ? env.style.key : '';
    if (C.m !== m || C.q !== q || C.sk !== sk) { C.m = m; C.q = q; C.sk = sk; C.poses.clear(); C.empty = null; }
    const cells = PLACED(m, o);
    if (A.t < 1 && A.from !== null) {
      if (!C.empty) {
        const sc = makeSc(m, PLACED(m, A.from), { cells: [], ax: null }, null, look);
        C.empty = RT.render(sc, q); C.empty.canvas = RT.toCanvas(C.empty);
      }
      RT.blit(g, C.empty, SR.x, SR.y);
      const Rn = ORIENTS[o], Ro = ORIENTS[A.from];
      const D = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => Rn[i * 3] * Ro[j * 3] + Rn[i * 3 + 1] * Ro[j * 3 + 1] + Rn[i * 3 + 2] * Ro[j * 3 + 2]));
      const axis = D[0] === 1 ? 'x' : 'y', ang = (axis === 'x' ? Math.asin(D[7]) : Math.asin(D[2])) * (1 - (1 - A.t) ** 2);
      const mid = PLACED(m, A.from).map((c) => rotAxis(c, axis, ang));
      const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rotAxis(v, axis, ang));
      const sc = makeSc(m, PLACED(m, A.from), { cells: mid, ax }, null, look);
      const lay = RT.renderLayer(sc, 0.75, { x: 0, y: 0, w: SR.w, h: SR.h }, new Set([PIECE_ID]));
      lay.canvas = RT.toCanvas(lay);
      g.drawImage(lay.canvas, SR.x + lay.x, SR.y + lay.y, lay.bw, lay.bh);
    } else {
      const key = `${o}|${done ? 1 : 0}`;
      if (!C.poses.has(key)) {
        const img = RT.render(makeSc(m, cells, null, done ? SHCELLS(m, o) : null, look), q);
        img.canvas = RT.toCanvas(img); C.poses.set(key, img);
      }
      RT.blit(g, C.poses.get(key), SR.x, SR.y);
    }
    const cy0 = SR.y + SR.h;
    g.fillStyle = '#f5f7f9'; g.fillRect(0, cy0, BOARD.w, BOARD.h - cy0);
    g.strokeStyle = '#e1e6eb'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, cy0 + 0.5); g.lineTo(BOARD.w, cy0 + 0.5); g.stroke();
    g.beginPath(); g.moveTo(0, SR.y - 0.5); g.lineTo(BOARD.w, SR.y - 0.5); g.stroke();
    for (const [dir, b] of Object.entries(BTN)) drawButton(g, b, b.glyph, !done);
    g.fillStyle = '#7b8793'; g.font = `11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Turn', 58, BY + 46); g.fillText('Tip', 172, BY + 46);
    g.restore();
  },

  tick(env, dt) {
    const A = env.assets.turn;
    if (!A || A.t >= 1) return false;
    A.t = Math.min(1, A.t + dt / 0.2);
    return true;
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    for (const [dir, b] of Object.entries(BTN)) if (inside(e, b)) return [{ op: 'turn', dir }];
    return [];
  },

  footerStatus(env) {
    if (env.submitted) return 'Shadow cast';
    return 'Use the arrows to turn the block';
  },
};
const BLIND_SUB = 'The lamp shines straight at the wall; the shadow shows after Verify';
function generateBlind(rng) {
  const piece = rng.pick(Object.keys(PIECES));
  const W = BLIND_TURNS[piece], tot = Object.values(W).reduce((a, b) => a + b, 0);
  let x = rng.int(1, tot), turn = null;
  for (const [t, w] of Object.entries(W)) if (turn === null && (x -= w) <= 0) turn = t;
  const S = TWO_PRESS[turn];
  for (let attempt = 0; attempt < 4000; attempt++) {
    const cam = { yaw: +(rng.sign() * rng.uniform(SCENE.yaw[0] + 1, SCENE.yaw[1] - 1)).toFixed(2), pitch: +rng.uniform(SCENE.pitch[0] + 0.5, SCENE.pitch[1] - 0.5).toFixed(2) };
    const start = rng.int(0, 23), goal = orientIndex(mul(S, ORIENTS[start]));
    const r = { piece, start, goal, target: shadow(piece, goal) };
    if (checkRound(r).length) continue;
    const m = { task: 'silhouette_turn_match', board: { ...BOARD }, ...r, cam, cue: 'blind' };
    if (!blindProblems(m, matching).length) return m;
  }
  throw new Error('silhouette_turn_match: no admissible blind scene for ' + piece);
}

const EVAL_KEYS = new Set([
  'silhouette_turn_match|-0.5,-1,0.5;-0.5,0,-0.5;-0.5,0,0.5;-0.5,1,-0.5;0.5,0,-0.5|-1,0.5 0,-0.5 0,0.5 1,-0.5',
  'silhouette_turn_match|0,-1,0.5;0,0,-0.5;0,0,0.5;0,1,-0.5;0,1,0.5|-1,-0.5 0,-0.5 0,0.5 1,-0.5 1,0.5',
  'silhouette_turn_match|-0.5,-0.5,-1;-0.5,-0.5,0;-0.5,-0.5,1;-0.5,0.5,-1;0.5,-0.5,0|-0.5,-1 -0.5,0 -0.5,1 0.5,1',
  'silhouette_turn_match|-0.5,-1,0;-0.5,0,0;0.5,-1,0;0.5,0,0;0.5,1,0|-0.5,-1 -0.5,0 -0.5,1 0.5,-1 0.5,0',
  'silhouette_turn_match|-0.5,0,-1;-0.5,0,0;-0.5,0,1;0.5,0,-1|-1,-0.5 0,-0.5 1,-0.5 1,0.5',
  'silhouette_turn_match|0,-0.5,0.5;0,-1.5,0.5;0,0.5,0.5;0,1.5,-0.5;0,1.5,0.5|-0.5,0.5 -1.5,-0.5 -1.5,0.5 0.5,0.5 1.5,0.5',
  'silhouette_turn_match|-0.5,0,-1;-0.5,0,0;0.5,0,0;0.5,0,1|-1,-0.5 0,-0.5 0,0.5 1,0.5',
  'silhouette_turn_match|-0.5,-0.5,0;-0.5,-1.5,0;-0.5,0.5,0;-0.5,1.5,0;0.5,1.5,0|-0.5,1.5 0.5,-0.5 0.5,-1.5 0.5,0.5 0.5,1.5',
  'silhouette_turn_match|-1,0,-0.5;0,0,-0.5;1,0,-0.5;1,0,0.5|-0.5,-1 0.5,-1 0.5,0 0.5,1',
  'silhouette_turn_match|-0.5,-1,-0.5;-0.5,-1,0.5;-0.5,0,0.5;-0.5,1,0.5;0.5,0,0.5|-1,-0.5 -1,0.5 0,0.5 1,0.5',
  'silhouette_turn_match|0,-0.5,0;0,0.5,-1;0,0.5,0;0,0.5,1|-0.5,-1 -0.5,0 -0.5,1 0.5,0',
]);
const QUESTIONS = {};
function questionsFor(split) {
  if (QUESTIONS[split]) return QUESTIONS[split];
  const by = new Map(), seen = new Set();
  for (const [piece, goal, start, target] of roundsFor(split)) {
    const r = { piece, goal, start, target }, k = semanticKey({ ext: split, ...r });
    if (seen.has(k) || EVAL_KEYS.has(k)) continue;
    seen.add(k);
    if (!by.has(target)) by.set(target, []);
    by.get(target).push(r);
  }
  const outs = [...by.keys()].sort(), O = outs.length;
  const order = outs.map((_, i) => outs[nthOf(`silhouette_turn_match|${split}|outlines`, i + 1, O)]);
  const lists = order.map((t) => { const L = by.get(t); return L.map((_, i) => L[nthOf(`silhouette_turn_match|${split}|${t}`, i + 1, L.length)]); });
  const Q = [];
  for (let k = 0; Q.length < seen.size; k++) for (const L of lists) if (k < L.length) Q.push(L[k]);
  return (QUESTIONS[split] = Q);
}
function generateExt(rng, split, n) {
  const Q = questionsFor(split);
  const cam = { yaw: +(rng.sign() * rng.uniform(SCENE.yaw[0] + 1, SCENE.yaw[1] - 1)).toFixed(2), pitch: +rng.uniform(SCENE.pitch[0] + 0.5, SCENE.pitch[1] - 0.5).toFixed(2) };
  const r = Q[Number.isInteger(n) ? ((n - 1) % Q.length + Q.length) % Q.length : Math.floor(rng.raw() * Q.length)];
  return { task: 'silhouette_turn_match', board: { ...BOARD }, ext: split, ...r, cam };
}

export default task;
