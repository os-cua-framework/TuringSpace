import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, objectStats } from '../common/_seat_view_rt.js';
import { builder, person, stool, plant, floorLamp, chair, carton, ball, roomEnv, orbitCam, sceneOf, PERSON_LOOKS } from '../common/_seat_view_props.js';
import * as SEAT_LOOK from '../common/_seat_view_look.js';
import * as GP from '../common/_seat_view_prop_kinds.js';
import { drawIconExt } from '../common/_their_seat_compass_icons.js';
import { nthOf, splitIds } from '../core/style.js';
import { ORBIT_CUE, sampleOrbit, orbitAnswer, orbitMovedManifest, orbitPrompt, orbitGeometryProblems, orbitSceneProblems } from '../common/_their_seat_compass_orbit.js';

const BOARD = { w: 380, h: 410 };
const SCENE_H = 222;
const TAU = Math.PI * 2;
const CX = 268, CY = 318, R_IN = 30, R_OUT = 84, CX0 = CX, CY0 = CY;
const LAYOUTS = ['top-right', 'top-left', 'top-centre', 'bottom-right', 'bottom-left', 'bottom-centre'];
function layoutOf(m) {
  const id = m && m.layout;
  if (!id) return null;
  const [band, dial] = id.split('-'), py = band === 'top' ? SCENE_H : 0;
  return { sceneY: band === 'top' ? 0 : BOARD.h - SCENE_H, py, dial, cx: dial === 'right' ? CX : dial === 'left' ? BOARD.w - CX : BOARD.w / 2, cy: py + (CY - SCENE_H) };
}
const KINDS = ['plant', 'lamp', 'chair', 'box', 'ball'];
const LABELS = { 0: 'Front', 2: 'Right', 4: 'Back', 6: 'Left' };
const HER = 9;

const SECTOR_MARGIN = 10;
const HEUR_MISMATCH = 3;
const R_MIN = 1.2, R_MAX = 1.45;
const OBJ_VIS = 0.7, HER_VIS = 0.7;
const MIN_SCREEN_SEP = 40;
const WALL_Z = -2.6;
const PLACED_R = R_IN + 16, PLACED_SCALE = 0.8;

const round2 = (v) => Math.round(v * 100) / 100;
const round1 = (v) => Math.round(v * 10) / 10;
const rad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => norm360(d + 180) - 180;
function angMin(a, b) { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; }
const bearing = (x, z) => norm360((Math.atan2(x, z) * 180) / Math.PI);
const sectorOf = (theta) => (((Math.round(theta / 45) % 8) + 8) % 8);
function egoTheta(f, x, z) { return norm180(f - bearing(x, z)); }
function insideMargin(theta) { return 22.5 - Math.abs(theta - 45 * Math.round(theta / 45)); }

const SCENES = new WeakMap();
function buildWorld(m, S = null) {
  const B = S ? S.B : builder(), kit = m.kit;
  if (S) B.role = 'stool';
  const seatY = stool(B, 8, { x: 0, z: 0, h: 0.5 });
  if (S) B.role = 'person';
  person(B, HER, { x: 0, z: 0, yaw: m.facing, pose: 'sit', seatY, look: S ? S.outfit : PERSON_LOOKS[m.look], headPitch: 4 });
  for (const o of m.objects) {
    const k = o.kind, a = { x: o.x, z: o.z, yaw: o.yaw };
    if (S) B.role = k;
    if (kit) {
      const v = kit.var[k], c = S ? S.props : {};
      if (k === 'plant') GP.plantProp(B, o.id, v, { ...a, pot: c.pot, leaf: c.leaf, bloom: c.bloom });
      else if (k === 'lamp') GP.lightProp(B, o.id, v, { ...a, h: 1.35, col: c.shade });
      else if (k === 'chair') GP.sitProp(B, o.id, v, { ...a, col: c.cushion ?? '#5b7fa6' });
      else if (k === 'box') GP.boxProp(B, o.id, v, { ...a, hx: 0.24, hy: 0.19, hz: 0.19, col: c.box });
      else GP.ballProp(B, o.id, v, { ...a, r: 0.17, col: c.ball ?? '#e04b3c', col2: c.ball2 });
    } else if (k === 'plant') plant(B, o.id, a);
    else if (k === 'lamp') floorLamp(B, o.id, { ...a, h: 1.35 });
    else if (k === 'chair') chair(B, o.id, { ...a, col: '#5b7fa6' });
    else if (k === 'box') carton(B, o.id, { ...a, hx: 0.24, hy: 0.19, hz: 0.19 });
    else ball(B, o.id, { ...a, r: 0.17, col: '#e04b3c' });
  }
  return B;
}
const AFTER = new WeakMap();
function afterSceneFor(m) {
  if (AFTER.has(m)) return AFTER.get(m);
  const sc = sceneOf(buildWorld(orbitMovedManifest(m)), orbitCam(m.camera, BOARD.w, SCENE_H), roomEnv({ wallZ: WALL_Z }));
  AFTER.set(m, sc);
  return sc;
}
function sceneFor(m) {
  if (SCENES.has(m)) return SCENES.get(m);
  const B = buildWorld(m);
  const sc = sceneOf(B, orbitCam(m.camera, BOARD.w, SCENE_H), roomEnv({ wallZ: WALL_Z }));
  SCENES.set(m, sc);
  return sc;
}
function screenUpBearing(cam) { return bearing(cam.F[0], cam.F[2]); }
function screenSector(cam, x, z) {
  const o = cam.project(0, 0, 0), p = cam.project(x, 0, z);
  return sectorOf((Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90);
}
function facingMismatch(objs, fAssumed) {
  let n = 0;
  for (const o of objs) if (sectorOf(egoTheta(fAssumed, o.x, o.z)) !== o.sector) n++;
  return n;
}

export function contractProblems(m) {
  const P = [];
  if (!m || m.task !== 'their_seat_compass' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['task'];
  if (!m.camera || !Number.isFinite(m.facing)) return ['camera'];
  if (!Array.isArray(m.objects) || m.objects.length !== 5) return ['objects'];
  const sc = sceneFor(m), cam = sc.cam, f = m.facing;
  const suB = screenUpBearing(cam);
  if (angMin(f, suB) < 55 || angMin(f, suB) > 125) P.push('facing-not-sideways');
  const secs = new Set();
  for (const o of m.objects) {
    if (![o.x, o.z].every(Number.isFinite) || !Number.isInteger(o.sector) || o.kind !== KINDS[o.id]) return ['object'];
    const theta = egoTheta(f, o.x, o.z);
    if (sectorOf(theta) !== o.sector) P.push(`sector${o.id}`);
    if (insideMargin(theta) < SECTOR_MARGIN) P.push(`margin${o.id}`);
    const r = Math.hypot(o.x, o.z);
    if (r < R_MIN - 0.01 || r > R_MAX + 0.01) P.push(`radius${o.id}`);
    secs.add(o.sector);
    const st = objectStats(sc, o.id, 2, true);
    if (st.frac < OBJ_VIS) P.push(`occluded${o.id}`);
    if (!st.box || st.box[0] < 0.05 * BOARD.w || st.box[2] > 0.95 * BOARD.w || st.box[1] < 0.05 * SCENE_H || st.box[3] > 0.95 * SCENE_H) P.push(`frame${o.id}`);
  }
  if (secs.size !== 5) P.push('sectors-not-distinct');
  const her = objectStats(sc, HER, 2, true);
  if (her.frac < HER_VIS) P.push('her-occluded');
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const a = cam.project(m.objects[i].x, 0.3, m.objects[i].z), b = cam.project(m.objects[j].x, 0.3, m.objects[j].z);
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_SCREEN_SEP) P.push('screen-sep');
  }
  let screenMiss = 0;
  for (const o of m.objects) if (screenSector(cam, o.x, o.z) !== o.sector) screenMiss++;
  if (screenMiss < HEUR_MISMATCH) P.push('image-frame-heuristic');
  if (facingMismatch(m.objects, suB) < HEUR_MISMATCH) P.push('faces-away-heuristic');
  if (facingMismatch(m.objects, suB + 180) < HEUR_MISMATCH) P.push('faces-me-heuristic');
  if (m.orbit) {
    const G = orbitGeometryProblems(m, cam);
    P.push(...G);
    if (!G.length && !P.length) P.push(...orbitSceneProblems(m, afterSceneFor(m), objectStats, BOARD.w, SCENE_H));
  }
  return [...new Set(P)];
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

function orbitCheck(m) {
  const P = contractProblems(m);
  SCENES.delete(m); AFTER.delete(m);
  return P;
}

function tryBuild(rng, kit = null, sectorsFixed = null) {
  const camera = { az: round2(rng.uniform(-30, 30)), el: round2(rng.uniform(36, 42)), dist: 6.1, fov: 34, tx: 0, ty: 0.42, tz: 0 };
  const cam = orbitCam(camera, BOARD.w, SCENE_H), suB = screenUpBearing(cam);
  const f = round1(norm360(suB + rng.sign() * rng.uniform(62, 118)));
  const sectors = sectorsFixed || rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 5);
  const objects = KINDS.map((kind, i) => {
    const sec = sectors[i], center = sec <= 4 ? sec * 45 : sec * 45 - 360;
    const theta = center + rng.uniform(-8, 8), b = norm360(f - theta), r = rng.uniform(R_MIN + 0.02, R_MAX - 0.02);
    return { id: i, kind, x: round2(Math.sin(rad(b)) * r), z: round2(Math.cos(rad(b)) * r), yaw: round1(rng.uniform(0, 360)), sector: sec };
  });
  const ch = objects[2]; ch.yaw = round1(norm360(bearing(-ch.x, -ch.z) + rng.uniform(-40, 40)));
  const m = { task: 'their_seat_compass', board: { ...BOARD }, camera, facing: f, look: rng.pick([0, 2, 4]), objects };
  if (kit) m.kit = kit;
  const P = contractProblems(m);
  SCENES.delete(m);
  return P.length ? null : m;
}

function drawIcon(g, kind, cx, cy, k = 1) {
  g.save(); g.translate(cx, cy); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round';
  if (kind === 'plant') {
    g.fillStyle = '#c0714f'; g.beginPath(); g.moveTo(-8, 3); g.lineTo(8, 3); g.lineTo(6, 14); g.lineTo(-6, 14); g.closePath(); g.fill();
    g.fillStyle = '#4e8f45';
    for (const [x, y, a] of [[-6, -4, -0.5], [6, -4, 0.5], [0, -9, 0], [-3, -1, -0.2], [3, -1, 0.2]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 4, 8, 0, 0, TAU); g.fill(); g.restore(); }
  } else if (kind === 'lamp') {
    g.strokeStyle = '#3d4249'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 13); g.stroke();
    g.fillStyle = '#3d4249'; rr(g, -7, 12, 14, 3, 1.5); g.fill();
    g.fillStyle = '#efe2c4'; g.strokeStyle = '#c9b88f'; g.lineWidth = 1; g.beginPath(); g.moveTo(-5, -15); g.lineTo(5, -15); g.lineTo(9, -5); g.lineTo(-9, -5); g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'chair') {
    g.fillStyle = '#a8784e'; g.fillRect(-8, -14, 3, 27); g.fillRect(6, 2, 3, 11); g.fillRect(-8, -14, 3, 3);
    g.fillStyle = '#5b7fa6'; rr(g, -8, -1, 17, 4, 1.5); g.fill();
    g.fillStyle = '#a8784e'; g.fillRect(-8, -12, 3, 10);
  } else if (kind === 'box') {
    g.fillStyle = '#c09466'; rr(g, -11, -8, 22, 17, 2); g.fill();
    g.fillStyle = '#dcc39a'; g.fillRect(-2, -8, 4, 17);
    g.strokeStyle = '#a47b50'; g.lineWidth = 1; rr(g, -11, -8, 22, 17, 2); g.stroke();
  } else {
    g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fillStyle = '#f3efe6'; g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.clip();
    g.fillStyle = '#e04b3c'; for (const a of [0, 2.09, 4.19]) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 12, a, a + 1.05); g.closePath(); g.fill(); }
    g.restore();
    g.strokeStyle = '#b8b2a6'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.stroke();
  }
  g.restore();
}

const EVAL_KEYS = new Set(['compass|21054', 'compass|02516', 'compass|71206', 'compass|72501', 'compass|26431', 'compass|24561',
  'compass|26735', 'compass|62510', 'compass|60457', 'compass|62741', 'compass|51620', 'compass|50374']);
const SECTOR_SETS = new Map();
function sectorSets(split) {
  if (SECTOR_SETS.has(split)) return SECTOR_SETS.get(split);
  const all = [], rec = (pre) => { if (pre.length === 5) { const k = `compass|${pre.join('')}`; if (!EVAL_KEYS.has(k)) all.push(k); return; } for (let s = 0; s < 8; s++) if (!pre.includes(s)) rec([...pre, s]); };
  rec([]);
  const sp = splitIds('their_seat_compass|sectors', all, Math.ceil(all.length / 10));
  for (const sl of ['train', 'test']) SECTOR_SETS.set(sl, all.filter((k) => sp(k) === sl));
  return SECTOR_SETS.get(split);
}
function generateExt(rng0, split, n) {
  const rng = GP.decorrelate(rng0);
  const kit = { var: {} };
  for (const k of KINDS) kit.var[k] = GP.pickIn(rng, GP.FAMILY_OF[k], split);
  const L = sectorSets(split), idx = n != null && Number.isFinite(Number(n)) ? Number(n) : null;
  const lsp = splitIds('their_seat_compass|layout', LAYOUTS), layout = rng.pick(LAYOUTS.filter((id) => lsp(id) === split));
  for (let k = 0; k < 6; k++) {
    const key = idx == null ? L[rng.int(0, L.length - 1)] : L[(nthOf(`their_seat_compass|${split}|sectors`, idx, L.length) + k * 7919) % L.length];
    const sectors = key.slice(8).split('').map(Number);
    for (let attempt = 0; attempt < 600; attempt++) { const m = tryBuild(rng, kit, sectors); if (m) { m.layout = layout; return m; } }
  }
  throw new Error('their_seat_compass: generator exhausted (ext)');
}
const ICON_DEFAULT = { wood: '#a8784e', cushion: '#5b7fa6', metal: '#3d4249', shade: '#efe2c4', pot: '#c0714f', leaf: '#4e8f45', bloom: '#f2d36a', box: '#7a5236', kraft: '#c09466', ball: '#e04b3c', ball2: '#f3efe6' };
const toHex = (c) => '#' + c.map((v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)).toString(16).padStart(2, '0')).join('');
async function styleSkin(style, m) {
  const outdoorOk = (mm) => !!(mm.kit && ['lantern', 'globe'].includes(mm.kit.var.lamp));
  const look = await SEAT_LOOK.seatLook(style, { setting: outdoorOk(m) ? 'any' : 'room', rug: { r: 1.0, cx: 0, cz: 0 } });
  const rnd = look.rnd, K = look.kit;
  const [[, shirt]] = SEAT_LOOK.shirtSet(style, 1);
  const outfit = SEAT_LOOK.outfit(style, PERSON_LOOKS[m.look], shirt);
  const props = {
    cushion: SEAT_LOOK.pickS(style, 'prop_cushion', ['#5b7fa6', '#8a6a4a', '#5a7a5a', '#a8a090', '#7a5a7a', '#c9b48a', '#4a5a6a', '#b0705a']),
    shade: SEAT_LOOK.pickS(style, 'prop_shade', ['#efe2c4', '#f4f1ea', '#e8d8b0', '#dfe6e8', '#e6d4c8']),
    pot: SEAT_LOOK.pickS(style, 'prop_pot', ['#c0714f', '#e8e2d6', '#4a4f55', '#8a9a8a', '#b8a888', '#5a6a7a']),
    leaf: SEAT_LOOK.pickS(style, 'prop_leaf', ['#4e8f45', '#3f7a3a', '#5f9a4a', '#4a8a5a']),
    bloom: SEAT_LOOK.pickS(style, 'prop_bloom', ['#f2d36a', '#f4f1ea', '#e8a0b8', '#f0a050']),
    ball: SEAT_LOOK.pickS(style, 'prop_ball', ['#e04b3c', '#3f7cc0', '#e8c33a', '#e07a3a', '#4f9a62']), ball2: '#f3efe6',
    box: SEAT_LOOK.pickS(style, 'prop_box', ['#3a4a5c', '#7a5236', '#5a6a4a', '#8a3a3a', '#b8925e', '#c9a46a']),
    metal: SEAT_LOOK.pickS(style, 'prop_metal', ['#3d4249', '#2a2a2e', '#b8a070', '#a8acb2']),
  };
  const potFinish = SEAT_LOOK.pickS(style, 'pot_finish', ['matte', 'satin', 'gloss']), clothes = SEAT_LOOK.clothesRemap(look, [outfit]);
  const remap = (name, hex, role) => {
    if (role === 'person') return clothes(name, hex);
    if (name === 'wood') return role === 'stool' ? K.woodA : K.woodB;
    if (name === 'cloth' && role === 'chair') return K.fabric(hex, 0, 0.2);
    if (name === 'metal') return K.metal(role === 'lamp' ? props.metal : hex);
    if (role === 'plant' && name === 'matte' && hex === props.pot) return K.ceramic(hex, potFinish);
    return null;
  };
  const icon = { ...ICON_DEFAULT, ...props, wood: toHex(K.woodB.c) };
  return { look, remap, outfit, props, icon };
}
const STYLED = new WeakMap();
function styledScene(m, skin) {
  const c = STYLED.get(m);
  if (c && c.skin === skin) return c.sc;
  const B = SEAT_LOOK.styledBuilder(skin.remap);
  buildWorld(m, { ...skin, B });
  const cam = orbitCam(m.camera, BOARD.w, SCENE_H);
  const sc = sceneOf(B, cam, skin.look.walls({ wallZ: WALL_Z, sideX: 2.3 }, cam.eye[0]), skin.look.light);
  STYLED.set(m, { skin, sc });
  return sc;
}

export function semanticKey(m) {
  if (m.orbit) return `compass-orbit|${orbitAnswer(m).join('')}|${m.orbit.obj}${m.orbit.pivot}`;
  return `compass|${KINDS.map((k) => m.objects.find((o) => o.kind === k).sector).join('')}`;
}

const task = {
  meta: {
    name: 'their_seat_compass', family: 'A', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'grab', obj: 'object id 0..4 (or null to release)' },
      { op: 'ghost', x: 'cursor x', y: 'cursor y' },
      { op: 'place', obj: 'object id 0..4', sector: 'wedge 0..7 in HER frame (0 = front, clockwise)' },
      { op: 'release' },
    ],
    promptHuman: 'Drag each icon onto the dial as she sees it',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs.cue === ORBIT_CUE) return sampleOrbit(rng, { orbitCam, BOARD, SCENE_H, KINDS, R_MIN, R_MAX, check: orbitCheck });
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    for (let attempt = 0; attempt < 600; attempt++) {
      const m = tryBuild(rng);
      if (m) return m;
    }
    throw new Error('their_seat_compass: generator exhausted');
  },

  init() { return { placed: [null, null, null, null, null], grab: null, ghost: null }; },

  applyAction(state, action, m) {
    const op = action && action.op;
    if (op === 'grab') {
      state.grab = Number.isInteger(action.obj) && action.obj >= 0 && action.obj < 5 ? action.obj : null;
      if (state.grab != null) state.placed[state.grab] = null;
      else state.ghost = null;
      return { ok: true };
    }
    if (op === 'ghost') { state.ghost = (Number.isFinite(action.x) && Number.isFinite(action.y)) ? { x: action.x, y: action.y } : null; return { ok: true }; }
    if (op === 'release') { state.grab = null; state.ghost = null; return { ok: true }; }
    if (op === 'place') {
      const s = action.sector, obj = action.obj;
      if (!Number.isInteger(s) || s < 0 || s > 7) return { ok: false, reason: 'bad-sector' };
      if (!Number.isInteger(obj) || obj < 0 || obj > 4) return { ok: false, reason: 'bad-obj' };
      for (let i = 0; i < 5; i++) if (i !== obj && state.placed[i] === s) state.placed[i] = null;
      state.placed[obj] = s; state.grab = null; state.ghost = null;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    let correct = 0, placedN = 0;
    const ans = m.orbit ? orbitAnswer(m) : null;
    for (const o of m.objects) { if (state.placed[o.id] != null) placedN++; if (state.placed[o.id] === (ans ? ans[o.id] : o.sector)) correct++; }
    if (ans) return { success: correct === 5, error: 5 - correct, partial: correct / 5, detail: { correct, placed: placedN, moved: state.placed[m.orbit.obj] === m.orbit.sector } };
    return { success: correct === 5, error: 5 - correct, partial: correct / 5, detail: { correct, placed: placedN } };
  },

  oracle(m) {
    const ans = m.orbit ? orbitAnswer(m) : null;
    return m.objects.map((o) => ({ op: 'place', obj: o.id, sector: ans ? ans[o.id] : o.sector }));
  },

  randomPolicy(m, rnd) {
    const bag = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 7; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    return m.objects.map((o, i) => ({ op: 'place', obj: o.id, sector: bag[i] }));
  },

  async mount(env) {
    env.assets.tsc = {};
    if (env.style) env.assets.skin = await styleSkin(env.style, env.manifest);
  },
  _icon(g, env, kind, x, y, k) {
    const kit = env.manifest.kit, skin = env.style ? env.assets.skin : null;
    if (kit) drawIconExt(g, kind, kit.var[kind], skin ? skin.icon : ICON_DEFAULT, x, y, k);
    else drawIcon(g, kind, x, y, k);
  },

  drawPrompt(g, r, env) {
    const m = env && env.manifest;
    if (m && m.orbit) { const t = orbitPrompt(m); drawPromptText(g, r, t.main, t.sub); return; }
    drawPromptText(g, r, 'Drag each icon onto the dial as she sees it', 'Top of the dial is the way she faces');
  },

  _trayRect(i, m) {
    const L = layoutOf(m);
    if (!L) return { x: 12 + (i % 2) * 64, y: SCENE_H + 14 + Math.floor(i / 2) * 58, w: 56, h: 50 };
    if (L.dial === 'centre') return i < 3 ? { x: 12, y: L.py + 14 + i * 58, w: 56, h: 50 } : { x: BOARD.w - 68, y: L.py + 14 + (i - 3) * 58, w: 56, h: 50 };
    return { x: (L.dial === 'right' ? 12 : BOARD.w - 132) + (i % 2) * 64, y: L.py + 14 + Math.floor(i / 2) * 58, w: 56, h: 50 };
  },
  _sectorAngle(k) { return -90 + 45 * k; },
  _wedgeAt(x, y, m) {
    const L = layoutOf(m), cx = L ? L.cx : CX, cy = L ? L.cy : CY;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d < R_IN - 4 || d > R_OUT + 10) return -1;
    return sectorOf((Math.atan2(dy, dx) * 180) / Math.PI + 90);
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, A = env.assets.tsc || (env.assets.tsc = {});
    const q = contextScale(g), skin = env.style ? env.assets.skin : null, key = `${q}` + (skin ? '|' + env.style.key : '');
    if (A.m !== m || A.key !== key) { A.m = m; A.key = key; A.canvas = toCanvas(render(skin ? styledScene(m, skin) : sceneFor(m), q)); }
    g.save(); g.translate(br.x, br.y);
    const L = layoutOf(m);
    if (!L) {
      g.drawImage(A.canvas, 0, 0, BOARD.w, SCENE_H);
      g.fillStyle = '#f3f5f8'; g.fillRect(0, SCENE_H, br.w, br.h - SCENE_H);
      g.strokeStyle = '#dde3ea'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, SCENE_H + 0.5); g.lineTo(br.w, SCENE_H + 0.5); g.stroke();
    } else {
      g.fillStyle = '#f3f5f8'; g.fillRect(0, L.py, br.w, br.h - SCENE_H);
      g.drawImage(A.canvas, 0, L.sceneY, BOARD.w, SCENE_H);
      const ly = L.sceneY ? L.sceneY - 0.5 : SCENE_H + 0.5;
      g.strokeStyle = '#dde3ea'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, ly); g.lineTo(br.w, ly); g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const R = this._trayRect(i, m), o = m.objects[i], done = st.placed[o.id] != null;
      g.fillStyle = done ? '#e9edf2' : '#ffffff'; rr(g, R.x, R.y, R.w, R.h, 9); g.fill();
      g.strokeStyle = '#cfd7e0'; g.lineWidth = 1.2; rr(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 9); g.stroke();
      if (!done && st.grab !== o.id) this._icon(g, env, o.kind, R.x + R.w / 2, R.y + R.h / 2, 1.05);
    }
    this._drawDial(g, m, st, env);
    if (st.grab != null && st.ghost) { g.globalAlpha = 0.92; this._icon(g, env, m.objects[st.grab].kind, st.ghost.x, st.ghost.y, 1.05); g.globalAlpha = 1; }
    g.restore();
  },

  _drawDial(g, m, st, env) {
    g.save();
    const hover = (st.grab != null && st.ghost) ? this._wedgeAt(st.ghost.x, st.ghost.y, m) : -1;
    const DL = layoutOf(m), CX = DL ? DL.cx : CX0, CY = DL ? DL.cy : CY0;
    for (let k = 0; k < 8; k++) {
      const a0 = rad(this._sectorAngle(k) - 22.5), a1 = rad(this._sectorAngle(k) + 22.5);
      g.beginPath(); g.arc(CX, CY, R_OUT, a0, a1); g.arc(CX, CY, R_IN, a1, a0, true); g.closePath();
      g.fillStyle = k === hover ? '#d7ecff' : '#ffffff'; g.fill();
      g.strokeStyle = k === hover ? ACCENT : '#cdd5de'; g.lineWidth = k === hover ? 2 : 1; g.stroke();
    }
    g.fillStyle = '#5b6b7a'; g.font = `600 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [k, t] of Object.entries(LABELS)) {
      const am = rad(this._sectorAngle(+k));
      g.fillText(t, CX + Math.cos(am) * (R_OUT - 11), CY + Math.sin(am) * (R_OUT - 11));
    }
    for (const o of m.objects) {
      const k = st.placed[o.id];
      if (k == null) continue;
      const am = rad(this._sectorAngle(k)), lr = k % 2 ? (R_IN + R_OUT) / 2 + 4 : PLACED_R;
      this._icon(g, env, o.kind, CX + Math.cos(am) * lr, CY + Math.sin(am) * lr, PLACED_SCALE);
    }
    g.beginPath(); g.arc(CX, CY, R_IN - 2, 0, TAU); g.fillStyle = '#eef2f6'; g.fill();
    const her = env && env.style && env.assets.skin ? env.assets.skin.outfit : null;
    g.fillStyle = her ? her.shirt : '#c8553d'; g.beginPath(); g.ellipse(CX, CY + 2, 12, 7, 0, 0, TAU); g.fill();
    g.fillStyle = her ? her.hair : '#3a2a20'; g.beginPath(); g.arc(CX, CY + 2, 6, 0, TAU); g.fill();
    g.fillStyle = her ? her.skin : '#e2b896'; g.beginPath(); g.arc(CX, CY - 1, 5, Math.PI, TAU); g.fill();
    g.fillStyle = ACCENT; g.beginPath(); g.moveTo(CX, CY - 22); g.lineTo(CX - 5, CY - 14); g.lineTo(CX + 5, CY - 14); g.closePath(); g.fill();
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted) return [];
    const m = env.manifest, st = env.state;
    if (evt.type === 'down') {
      for (let i = 0; i < 5; i++) {
        const R = this._trayRect(i, m);
        if (st.placed[m.objects[i].id] == null && evt.x >= R.x && evt.x <= R.x + R.w && evt.y >= R.y && evt.y <= R.y + R.h) {
          return [{ op: 'grab', obj: m.objects[i].id }, { op: 'ghost', x: evt.x, y: evt.y }];
        }
      }
      const k = this._wedgeAt(evt.x, evt.y, m);
      if (k >= 0) { const o = m.objects.find((q) => st.placed[q.id] === k); if (o) return [{ op: 'grab', obj: o.id }, { op: 'ghost', x: evt.x, y: evt.y }]; }
      return [];
    }
    if (evt.type === 'move') return st.grab != null ? [{ op: 'ghost', x: evt.x, y: evt.y }] : [];
    if (evt.type === 'up') {
      if (st.grab == null) return [];
      const k = this._wedgeAt(evt.x, evt.y, m);
      return k >= 0 ? [{ op: 'place', obj: st.grab, sector: k }] : [{ op: 'release' }];
    }
    return [];
  },

  footerStatus(env) {
    const n = env.state.placed.filter((x) => x != null).length;
    return n ? `${n} of 5 placed` : 'Drag the icons onto the dial';
  },
};
export function previewImage(m) { return render(sceneFor(m), 2); }
export default task;
