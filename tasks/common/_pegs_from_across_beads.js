import { shape, makeScene, lin, fbm } from './_seat_view_rt.js';
import { cup } from './_seat_view_props.js';
import { GEO, BASE_TOP, pegTopY, ballY, IDS, LIGHT_DIR, MUG_HEX, sceneFor as sceneFor0 } from './_pegs_from_across_scene.js';
import * as GP from './_seat_view_prop_kinds.js';
import * as SEAT_LOOK from './_seat_view_look.js';

export const BEADS = GP.family('bead', ['ball', 'cube', 'disc', 'bead', 'hexnut', 'barrel', 'gem'], 'ball');
function prism(n, r, h, x, y, rot = 0) {
  const v = [], f = [[], []];
  for (let k = 0; k < n; k++) { const a = rot + (k * 2 * Math.PI) / n; v.push([x + r * Math.cos(a), y - h, r * Math.sin(a)]); }
  for (let k = 0; k < n; k++) { const a = rot + (k * 2 * Math.PI) / n; v.push([x + r * Math.cos(a), y + h, r * Math.sin(a)]); }
  for (let k = 0; k < n; k++) { f[0].push(k); f[1].push(n + k); f.push([k, (k + 1) % n, n + (k + 1) % n, n + k]); }
  return [v, f];
}
export const LANDMARKS = GP.TARGETS;
export const BALL_HEX0 = { red: '#c9372c', yellow: '#ecb72a', blue: '#2b63c6', green: '#2e8f47' };

function bead(B, id, kind, m, x, y) {
  const R = GEO.R;
  let s;
  if (kind === 'cube') s = B.add(shape.box(id, m, x, y, 0, R * 0.84, R * 0.84, R * 0.84, 0, R * 0.18));
  else if (kind === 'disc') s = B.add(shape.cyl(id, m, x, 0, y - R * 0.72, y + R * 0.72, R, R * 0.2));
  else if (kind === 'bead') s = B.add(shape.ellipsoid(id, m, x, y, 0, R, R * 0.86, R, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  else if (kind === 'hexnut') { const [v, f] = prism(6, R, R * 0.62, x, y, Math.PI / 6); s = B.add(shape.poly(id, m, v, f)); }
  else if (kind === 'barrel') s = B.add(shape.cyl(id, m, x, 0, y - R * 0.9, y + R * 0.9, R * 0.78, R * 0.3));
  else if (kind === 'gem') {
    const v = [[x, y + R * 0.95, 0], [x, y - R * 0.95, 0], [x + R * 0.95, y, 0], [x - R * 0.95, y, 0], [x, y, R * 0.95], [x, y, -R * 0.95]];
    s = B.add(shape.poly(id, m, v, [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]]));
  }
  else s = B.add(shape.sphere(id, m, x, y, 0, R));
  s.noAO = true;
}

function buildX(look, arrangement, flip, skin) {
  const B = skin ? SEAT_LOOK.styledBuilder(skin.remap) : SEAT_LOOK.styledBuilder(() => null), sg = flip ? -1 : 1, T = GEO.TABLE, kit = look.kit || {};
  const plain = (hex, ks = 0.12, sh = 26) => ({ c: lin(hex), ks, sh });
  B.role = 'table';
  const tableM = B.matDef('table', plain('#86603f'));
  B.role = 'base';
  const baseM = B.matDef('base', plain('#dcb47c'));
  B.role = 'dowel';
  const dowM = B.matDef('dowel', plain('#e3c79b', 0.14, 30));
  const zn = sg * T.zNear, zf = sg * T.zFar, tz = (zn + zf) / 2, thz = Math.abs(zn - zf) / 2;
  const top = B.add(shape.box(IDS.table, tableM, 0, -T.thick / 2, tz, T.hx, T.thick / 2, thz, 0, 0.008)); top.noAO = true;
  B.add(shape.box(IDS.base, baseM, 0, GEO.BASE.hy, 0, GEO.BASE.hx, GEO.BASE.hy, GEO.BASE.hz, 0, 0.006));
  B.role = 'bead';
  look.slots.forEach((pid, slot) => {
    const x = sg * GEO.SLOT_X[slot];
    B.add(shape.cyl(IDS.peg(pid), dowM, x, 0, BASE_TOP - 0.003, pegTopY(pid), GEO.PEG_R, 0.0025));
    (arrangement[pid] || []).forEach((b, lvl) => {
      const name = look.colors[b], hex = skin ? skin.ballHex[name] : BALL_HEX0[name];
      bead(B, IDS.ball(b), kit.bead || 'ball', B.matDef(`ball:${name}`, { c: lin(hex), ...(skin ? skin.ballFinish : { ks: 0.42, sh: 64, env: 0.1 }) }), x, ballY(lvl));
    });
  });
  if (look.mug) {
    const M = GEO.MUG, kind = kit.landmark || 'mug';
    const col = skin ? skin.landmarkHex : kind === 'mug' ? MUG_HEX[look.mug.col] : GP.TARGET_COLS[kind][look.mug.col * 2];
    B.role = 'landmark';
    const o = { x: sg * look.mug.side * M.x, z: sg * M.z, col, r: M.r, h: M.h, y0: 0, handleYaw: (flip ? 180 : 0) + look.mug.handle };
    if (kind === 'mug') cup(B, IDS.mug, o); else GP.target(B, IDS.mug, kind, o);
  }
  return B;
}

function envX(skin, flip) {
  const look = skin.look, FY = GEO.FLOOR_Y;
  const e = look.env({ floorY: FY, wallZ: flip ? -skin.nearD : -skin.farD });
  const far = e.wall, near = skin.nearWall;
  e.wall = flip ? (x, y, fp, out) => near(x, y - FY, fp, out) : (x, y, fp, out) => far(x, y - FY, fp, out);
  e.wallSide = e.wall;
  return e;
}
function lightX(skin, flip) {
  const L = skin.look.light, d = flip ? [-LIGHT_DIR[0], LIGHT_DIR[1], -LIGHT_DIR[2]] : LIGHT_DIR, f = flip ? [-0.7, 0.45, -0.55] : [0.7, 0.45, 0.55];
  return { dir: d, col: L.col, soft: Math.max(0.05, L.soft), sky: L.sky, ground: L.ground, fill: { dir: f, col: L.fill.col }, aoK: 1, contact: 0, contactH: 0.1 };
}
export function sceneForX(look, arrangement, cam, flip, skin = null) {
  if (!look.kit && !skin) return sceneFor0(look, arrangement, cam, flip);
  const B = buildX(look, arrangement, flip, skin);
  if (!skin) return makeScene({ cam, shapes: B.shapes, mats: B.mats, env: { floorY: GEO.FLOOR_Y, floor: (x, z, fp, out) => { out[0] = out[1] = out[2] = 0.3; }, wallZ: flip ? -GEO.WALL_NEAR : -GEO.WALL_D, wall: (x, y, fp, out) => { out[0] = out[1] = out[2] = 0.6; }, sky: (dx, dy, dz, out) => { out[0] = out[1] = out[2] = 0.7; } }, light: { dir: LIGHT_DIR, col: [1, 1, 1], soft: 0.07, sky: [0.5, 0.5, 0.5], ground: [0.2, 0.2, 0.2] } });
  return makeScene({ cam, shapes: B.shapes, mats: B.mats, env: envX(skin, flip), light: lightX(skin, flip) });
}

const BALL_FAMILIES = [['red', ['#c9372c', '#d0452a']], ['orange', ['#e8742a', '#f08a3c']], ['yellow', ['#ecb72a', '#e8d03a']], ['green', ['#2e8f47', '#5aa83a']],
  ['teal', ['#1f9a8f', '#2a8aa0']], ['blue', ['#2b63c6', '#3a52b8']], ['purple', ['#7a3fb0', '#9a4aa8']], ['pink', ['#e06a9a', '#d85a8a']],
  ['white', ['#f2f0ea']], ['black', ['#2a2c30']]];
export async function styleSkin(style, m) {
  const look = await SEAT_LOOK.seatLook(style, { setting: 'room', layouts: ['back'], floorL: [0.1, 0.36] });
  const rnd = look.rnd, K = look.kit, T = K.textures, P = (L, name) => SEAT_LOOK.pickS(style, `pfa_${name}`, L);
  const nf = SEAT_LOOK.faceOf(T.PT.mean, 0.42 + 0.25 * rnd(), { otherSat: 0.12, warmSat: 0.22 });
  const nearFace = SEAT_LOOK.S3.deltaE(nf, look.wallFace) < 12 ? SEAT_LOOK.S3.scaleTo(nf, SEAT_LOOK.S3.lum(nf) * 0.7) : nf;
  const smp = SEAT_LOOK.texSampler(T.PT, { cv: 0.12, texWorld: 1.6, chroma: 0.1 }), frameC = SEAT_LOOK.hex2lin(P(['#f6f4ef', '#e8e2d6', '#3a3d42', '#8a6a4a'], 'window_frame'));
  const sky = look.sky, S = [0, 0, 0], panes = P([3, 4, 5], 'window_panes');
  const nearWall = (x, y, fp, out) => {
    const wx0 = -1.3, wx1 = 1.3, wy0 = 0.36, wy1 = 2.1, sill = 0.04;
    if (x > wx0 - 0.07 && x < wx1 + 0.07 && y > wy0 - sill && y < wy1 + 0.07) {
      const inGlass = x > wx0 && x < wx1 && y > wy0 && y < wy1, pane = (wx1 - wx0) / panes, u = (x - wx0) / pane;
      const mull = Math.abs(u - Math.round(u)) * pane < 0.024 || Math.abs(y - 1.05) < 0.022;
      if (!inGlass || mull) { const k = y < wy0 ? 0.9 : 1; out[0] = frameC[0] * k; out[1] = frameC[1] * k; out[2] = frameC[2] * k; return; }
      sky(Math.sin(x * 0.4), 0.15 + 0.5 * Math.min(1, (y - wy0) / 1.6), -1, S);
      const k = 3.2 / Math.max(0.05, SEAT_LOOK.S3.lum(S)); out[0] = 0.35 + S[0] * k * 0.55; out[1] = 0.4 + S[1] * k * 0.55; out[2] = 0.45 + S[2] * k * 0.55; return;
    }
    if (y < 0.09) { out[0] = frameC[0]; out[1] = frameC[1]; out[2] = frameC[2]; return; }
    smp(x, y, fp, nearFace, out);
  };
  const topKind = P(['woodA', 'woodA', 'woodB', 'stone', 'cloth'], 'table_top');
  const tableTop = topKind === 'woodA' ? K.woodA : topKind === 'woodB' ? K.woodB : topKind === 'stone' ? { ...K.stone(0.3 + 0.3 * rnd()), ks: 0.25, sh: 40 } : K.fabric(P(['#d8d0c0', '#d8c4a0', '#b4c4b0', '#c8b49a', '#a8b4c4'], 'cloth'), 0, 0.3);
  const boardT = SEAT_LOOK.texMat(T.WB, SEAT_LOOK.faceOf(T.WB.mean, 0.32 + 0.22 * rnd(), { warmSat: 0.5 }), { cv: 0.3, texWorld: 0.5, chroma: 0.5, grain: true, ks: 0.12, sh: 26 });
  const dowelC = SEAT_LOOK.faceOf(T.WB.mean, 0.42 + 0.2 * rnd(), { warmSat: 0.4 }), dowel = { c: dowelC, ks: 0.14, sh: 30 };
  const fams = [];
  for (const [fam, shades] of SEAT_LOOK.shuffled(rnd, SEAT_LOOK.splitList(style, 'pfa_ball_family', BALL_FAMILIES, { idOf: (x) => x[0], minTest: 5 }))) {
    const hex = shades[Math.floor(rnd() * shades.length)], c = SEAT_LOOK.hex2lin(hex);
    if (SEAT_LOOK.S3.deltaE(c, tableTop.c) < 25 || SEAT_LOOK.S3.deltaE(c, boardT.c) < 25) continue;
    if (fams.every((h) => SEAT_LOOK.S3.deltaE(SEAT_LOOK.hex2lin(h), c) >= 38)) fams.push(hex);
    if (fams.length === 4) break;
  }
  const ballHex = {}; ['red', 'yellow', 'blue', 'green'].forEach((k, i) => { ballHex[k] = fams[i] || BALL_HEX0[k]; });
  const ballFinish = P([{ ks: 0.42, sh: 64, env: 0.1 }, { ks: 0.22, sh: 30, env: 0.04 }, { ks: 0.08, sh: 12, env: 0 }], 'ball_finish');
  const kind = m.kit ? m.kit.landmark : 'mug';
  const landmarkHex = kind === 'mug' ? MUG_HEX[m.mug.col] : GP.TARGET_COLS[kind][m.mug.col * 2];
  for (const h of fams) style.note(`pfa_ball:${h}`);
  const remap = (name, hex, role) => {
    if (name === 'def' && hex === 'table') return tableTop;
    if (name === 'def' && hex === 'base') return boardT;
    if (name === 'def' && hex === 'dowel') return dowel;
    return null;
  };
  const farD = +(1.15 + 1.2 * rnd()).toFixed(2), nearD = +(0.85 + 0.5 * rnd()).toFixed(2);
  return { look, remap, nearWall, ballHex, ballFinish, landmarkHex, farD, nearD };
}
