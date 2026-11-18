import { drawPromptText, ACCENT } from '../core/panel.js';
import { angleError } from '../common/_card_ui.js';
import { splitIds, nthOf } from '../core/style.js';
import { AVATARS, PRONOUN, avatarSplit } from '../common/_point_my_way_avatar.js';
import * as RT from '../common/_point_my_way_rt.js';

const BOARD = { w: 340, h: 300 };
const EXT_BOARD = { w: 340, h: 276 };
const C = { x: 170, y: 138 };
const R = 92;
const TOL = 15;
const EXT_TOL = 25;
const ARROW_IN = 52, ARROW_GRAB = 18;
const TAU = Math.PI * 2;

const DELTA = { L: -90, R: 90, B: 180 };
const REL_KEYS = ['L', 'R', 'B'];

const rad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const dirVec = (deg) => ({ x: Math.sin(rad(deg)), y: -Math.cos(rad(deg)) });
const compassAngle = (px, py) => Math.atan2(px - C.x, -(py - C.y)) * 180 / Math.PI;
function onArrow(x, y, c, rr, deg) {
  const d = dirVec(deg), px = x - c.x, py = y - c.y, t = Math.max(ARROW_IN, Math.min(rr + 10, px * d.x + py * d.y));
  return Math.hypot(px - d.x * t, py - d.y * t) <= ARROW_GRAB;
}

const RD = 1.15;
const AR = { r0: 0.4, r1: RD + 0.17, shaft: 0.05, headL: 0.27, headW: 0.15 };
const EL = [30, 40], FOV = 36, PAD = 14;
const GRAB3 = 16;
const SHIRTS = ['#b4533c', '#4d77a8', '#cf9f3a', '#5a8c57', '#7b5d9e', '#c4733d', '#3e8c8e', '#b25579'];
const PANTS = ['#363b47', '#4b4d56', '#5a4a3c', '#2e3442', '#6a6458'];
const SKINS = ['#e8c09c', '#d7a57e', '#b47f57', '#8d5e3e'];
const HAIRS = ['#2b1f18', '#161616', '#5b3b23', '#8c6a3e'];
const FLOORS = [
  { a: '#cfc9be', b: '#c5beb1', grout: '#a29a8c', disc: '#e6e1d6' },
  { a: '#c9cfd2', b: '#bfc6ca', grout: '#9aa3a8', disc: '#e1e6e8' },
  { a: '#d6c7ad', b: '#cbbb9f', grout: '#a8987c', disc: '#ece2cf' },
];

const EVAL_RELS = ['L', 'R'];
const READ_MIN = { screen90: 22, screenSnap: 20, camSnap: 17, tileSnap: 17 };
const READ_H = [0, 1.41];
const FACING_STEP = 0.5;
const camFwdOf = (view) => norm360(Math.atan2(-Math.cos(rad(view.az)), -Math.sin(rad(view.az))) * 180 / Math.PI);
const d45 = (a) => { const r = norm360(a) % 45; return Math.min(r, 45 - r); };
function screenAngle(cam, b, h = 0) {
  const o = cam.project(0, h, 0), q = cam.project(Math.cos(rad(b)), h, Math.sin(rad(b)));
  return norm360(Math.atan2(q.x - o.x, -(q.y - o.y)) * 180 / Math.PI);
}
const INV = new WeakMap();
function floorFromScreen(cam, s) {
  if (!INV.has(cam)) {
    const N = 1440, b = new Float64Array(N + 1), u = new Float64Array(N + 1);
    for (let k = 0; k <= N; k++) { b[k] = (k * 360) / N; const a = screenAngle(cam, b[k]); u[k] = k ? u[k - 1] + norm360(a - u[k - 1] + 180) - 180 : a; }
    INV.set(cam, { b, u, N });
  }
  const { b, u, N } = INV.get(cam);
  let x = u[0] + norm360(s - u[0]);
  if (x > u[N]) x -= 360;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (u[mid] <= x) lo = mid; else hi = mid; }
  const t = (x - u[lo]) / Math.max(1e-9, u[hi] - u[lo]);
  return norm360(b[lo] + t * (b[hi] - b[lo]));
}
function coarseErrors(cam, view, f, rel) {
  const d = DELTA[rel], t = norm360(f + d), cf = camFwdOf(view);
  let screen90 = Infinity, screenSnap = Infinity;
  for (const h of READ_H) {
    const sf = screenAngle(cam, f, h);
    screen90 = Math.min(screen90, angleError(floorFromScreen(cam, sf + d), t));
    screenSnap = Math.min(screenSnap, angleError(floorFromScreen(cam, Math.round(sf / 45) * 45 + d), t));
  }
  return { screen90, screenSnap, camSnap: angleError(cf + Math.round(norm360(f - cf) / 45) * 45 + d, t), tileSnap: d45(t) };
}
function coarseOk(cam, view, f, rel) {
  if (d45(f - camFwdOf(view)) < READ_MIN.camSnap || d45(f + DELTA[rel]) < READ_MIN.tileSnap) return false;
  const e = coarseErrors(cam, view, f, rel);
  return Object.keys(READ_MIN).every((k) => e[k] >= READ_MIN[k]);
}
function qualifyingFacings(view, rel) {
  const cam = cameraOf({ view }), out = [];
  for (let k = 0; k < 360 / FACING_STEP; k++) { const f = k * FACING_STEP; if (coarseOk(cam, view, f, rel)) out.push(f); }
  return out;
}
function makeRound3d(rng, view) {
  const rel = rng.pick(EVAL_RELS);
  const ok = qualifyingFacings(view, rel);
  if (!ok.length) return null;
  const facing = rng.pick(ok);
  const target = +norm360(facing + DELTA[rel]).toFixed(2);
  const start = +norm360(target + rng.sign() * rng.uniform(70, 150)).toFixed(2);
  return { facing, rel, target, start };
}

function frameOrbit({ az, el, fov, pts, W, H, pad }) {
  let t = [0, 0, 0];
  for (const p of pts) { t[0] += p[0] / pts.length; t[1] += p[1] / pts.length; t[2] += p[2] / pts.length; }
  let dist = 8;
  const box = (cam) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return [x0, x1, y0, y1];
  };
  let cam = null;
  for (let it = 0; it < 16; it++) {
    cam = RT.orbitCam({ az, el, dist, fov, tx: t[0], ty: t[1], tz: t[2] }, W, H);
    const b = box(cam);
    const dx = (b[0] + b[1]) / 2 - W / 2, dy = (b[2] + b[3]) / 2 - H / 2;
    const s = dist / cam.f;
    t = [t[0] + cam.R[0] * dx * s - cam.U[0] * dy * s, t[1] - cam.U[1] * dy * s, t[2] + cam.R[2] * dx * s - cam.U[2] * dy * s];
    const k = Math.max((b[1] - b[0]) / (W - 2 * pad), (b[3] - b[2]) / (H - 2 * pad));
    dist *= 0.35 + 0.65 * k;
  }
  return RT.orbitCam({ az, el, dist, fov, tx: t[0], ty: t[1], tz: t[2] }, W, H);
}
const CAMS = new WeakMap();
function cameraOf(m) {
  if (!CAMS.has(m)) {
    const pts = [];
    for (let k = 0; k < 36; k++) { const t = (k / 36) * TAU; pts.push([Math.cos(t) * (AR.r1 + 0.1), 0, Math.sin(t) * (AR.r1 + 0.1)]); }
    pts.push([0, 2.0, 0]);
    CAMS.set(m, frameOrbit({ az: m.view.az, el: m.view.el, fov: FOV, pts, W: BOARD.w, H: BOARD.h, pad: PAD }));
  }
  return CAMS.get(m);
}
function floorOf(m) {
  const F = FLOORS[m.look.floor % FLOORS.length];
  const base = RT.tileFloor({ tile: 0.5, a: F.a, b: F.b, grout: F.grout });
  const RING = RT.lin('#33414f'), DISC = RT.lin(F.disc);
  return (x, z, fp, out) => {
    base(x, z, fp, out);
    const rho = Math.hypot(x, z);
    const inside = Math.max(0, Math.min(1, (RD + 0.06 - rho) / Math.max(fp, 1e-4) + 0.5));
    if (inside > 0) RT.mixInto(out, out, DISC, 0.55 * inside);
    const d = Math.abs(rho - RD), k = Math.max(0, Math.min(1, (0.024 - d) / Math.max(fp, 1e-4) + 0.5));
    if (k > 0) RT.mixInto(out, out, RING, 0.9 * k);
  };
}
const LIGHT = { ...RT.STUDIO_LIGHT, dir: [-0.35, 1.3, 0.45] };
const SCENES = new WeakMap();
function sceneOf(m) {
  if (!SCENES.has(m)) {
    const L = m.look;
    const mats = [RT.skinMat(SKINS[L.skin]), RT.hairMat(HAIRS[L.hair]), RT.clothMat(SHIRTS[L.shirt]), RT.clothMat(PANTS[L.pants]), RT.clothMat('#2a2a2f', 0.22)];
    const a = rad(m.rounds[0].facing);
    const J = RT.standPose(0, 0, Math.cos(a), Math.sin(a), L.h, 0, { headPitch: 5 });
    const shapes = RT.personShapes(0, J, { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4 }, { hair: 'long' });
    SCENES.set(m, RT.makeScene({ cam: cameraOf(m), shapes, mats, light: LIGHT, env: { floorY: 0, floor: floorOf(m), sky: RT.softSky } }));
  }
  return SCENES.get(m);
}
function arrowScreen(cam, deg) {
  const u = [Math.cos(rad(deg)), Math.sin(rad(deg))], n = [-u[1], u[0]];
  const P = (r, w) => cam.project(u[0] * r + n[0] * w, 0.003, u[1] * r + n[1] * w);
  const hb = AR.r1 - AR.headL;
  return {
    poly: [P(AR.r0, AR.shaft), P(hb, AR.shaft), P(hb, AR.headW), P(AR.r1, 0), P(hb, -AR.headW), P(hb, -AR.shaft), P(AR.r0, -AR.shaft)],
    line: [P(AR.r0, 0), P(AR.r1, 0)],
  };
}
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};
function onArrow3d(x, y, cam, deg) {
  const s = arrowScreen(cam, deg);
  return segDist({ x, y }, s.line[0], s.line[1]) <= GRAB3;
}
function floorBearing(cam, x, y) {
  const p = RT.planeAtPixel(cam, x, y, 0);
  return p && Math.hypot(p.x, p.z) > 0.05 ? norm360(Math.atan2(p.z, p.x) * 180 / Math.PI) : null;
}
function newCanvas(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}
function bodyMask(img) {
  const c = newCanvas(img.w, img.h), ctx = c.getContext('2d'), d = ctx.createImageData(img.w, img.h);
  for (let i = 0; i < img.w * img.h; i++) if (img.ids[i] >= 0) d.data[i * 4 + 3] = 255;
  ctx.putImageData(d, 0, 0);
  return c;
}
function pathPoly(ctx, poly) { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
function drawFloorArrow(g, cache, cam, deg) {
  const s = arrowScreen(cam, deg), img = cache.img;
  g.save(); g.globalAlpha = 0.38; pathPoly(g, s.poly); g.fillStyle = ACCENT; g.fill(); g.restore();
  if (!cache.tmp) cache.tmp = newCanvas(img.w, img.h);
  const t = cache.tmp.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, img.w, img.h);
  t.setTransform(img.q, 0, 0, img.q, 0, 0);
  pathPoly(t, s.poly); t.fillStyle = ACCENT; t.fill();
  t.lineWidth = 1.3; t.strokeStyle = 'rgba(255,255,255,.9)'; t.lineJoin = 'round'; t.stroke();
  t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'destination-out'; t.drawImage(cache.mask, 0, 0);
  t.globalCompositeOperation = 'source-over';
  g.drawImage(cache.tmp, 0, 0, BOARD.w, BOARD.h);
}

export function gate(m) {
  if (!m || m.task !== 'point_my_way' || !Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  const r = m.rounds[0];
  if (!REL_KEYS.includes(r.rel) || ![r.facing, r.target, r.start].every(Number.isFinite)) return false;
  const rot = Math.abs(norm360(r.facing + DELTA[r.rel]) - r.target) < 1e-6 || Math.abs(Math.abs(norm360(r.facing + DELTA[r.rel]) - r.target) - 360) < 1e-6;
  if (m.ext) return m.tolerance === EXT_TOL && rot && angleError(r.start, r.target) >= 60;
  if (m.tolerance !== TOL || !m.view || !(m.view.el >= EL[0] && m.view.el <= EL[1]) || !Number.isFinite(m.view.az)) return false;
  if (!m.look || ![m.look.skin, m.look.hair, m.look.shirt, m.look.pants, m.look.floor, m.look.h].every(Number.isFinite)) return false;
  if (!rot || angleError(r.start, r.target) < 60) return false;
  if (!EVAL_RELS.includes(r.rel)) return false;
  const e = coarseErrors(cameraOf(m), m.view, r.facing, r.rel);
  return Object.keys(READ_MIN).every((k) => e[k] >= READ_MIN[k]);
}

const BIN_KEYS = [];
for (const rel of REL_KEYS) for (let b = 0; b < 24; b++) BIN_KEYS.push(`${rel}|${b}`);
const binSplit = splitIds('point_my_way_combo', BIN_KEYS, 7);
const EVAL_KEYS = new Set(['woman|B|15', 'woman|R|19', 'woman|L|16', 'woman|B|0', 'woman|R|16', 'woman|B|17', 'woman|R|18', 'woman|R|3', 'woman|L|2', 'woman|R|13', 'woman|L|23', 'woman|B|4']);
const QUESTIONS = {};
for (const split of ['train', 'test']) {
  QUESTIONS[split] = [];
  for (const a of AVATARS) if (avatarSplit(a) === split) for (const k of BIN_KEYS) if (binSplit(k) === split && !EVAL_KEYS.has(`${a}|${k}`)) QUESTIONS[split].push(`${a}|${k}`);
}
function generateExt(rng, split, n) {
  const pool = QUESTIONS[split];
  const q = Number.isFinite(n) ? pool[nthOf(`point_my_way|${split}|question`, n, pool.length)] : rng.pick(pool);
  const [avatar, rel, binS] = q.split('|');
  const facing = Number(binS) * 15 + rng.int(0, 14);
  const target = norm360(facing + DELTA[rel]);
  const start = norm360(target + rng.sign() * rng.uniform(70, 150));
  const pad = R + 16;
  const center = { x: rng.int(pad, EXT_BOARD.w - pad), y: rng.int(Math.min(pad, EXT_BOARD.h / 2), Math.max(EXT_BOARD.h - pad, EXT_BOARD.h / 2)) };
  return { task: 'point_my_way', board: EXT_BOARD, tolerance: EXT_TOL, ext: true, avatar, center, R,
    rounds: [{ facing, rel, target: +target.toFixed(2), start: +start.toFixed(2) }] };
}

export function semanticKey(m) {
  const r = m.rounds[0];
  if (!m.view) return `${m.avatar || 'woman'}|${r.rel}|${Math.floor((((r.facing % 360) + 360) % 360) / 15)}`;
  return `3d|${r.rel}|${Math.floor(norm360(r.facing - camFwdOf(m.view)) / 5)}`;
}

export default {
  meta: {
    name: 'point_my_way', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'aim', deg: '0..360 floor bearing set from the pointer (the floor point under it, seen from her feet)' }],
    promptHuman: 'Turn the arrow on the floor to point to her left / right / behind her (her own left and right).',
    uses3d: true,
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    for (let attempt = 0; attempt < 300; attempt++) {
      const view = { az: +rng.uniform(0, 360).toFixed(1), el: +rng.uniform(EL[0], EL[1]).toFixed(1) };
      const round = makeRound3d(rng, view);
      if (!round) continue;
      const look = { skin: rng.int(0, 3), hair: rng.int(0, 3), shirt: rng.int(0, 7), pants: rng.int(0, 4), floor: rng.int(0, 2), h: +rng.uniform(1.64, 1.74).toFixed(2) };
      const m = { task: 'point_my_way', board: BOARD, tolerance: TOL, view, look, rounds: [round],
        gtContract: 'her left / right is her facing -90 / +90 deg measured on the floor; the arrow\'s floor bearing must be within 15 deg' };
      if (gate(m)) return m;
    }
    throw new Error('point_my_way: no valid instance');
  },

  init(manifest) {
    return { round: 0, angles: [manifest.rounds[0].start] };
  },

  applyAction(state, action) {
    if (action.op === 'aim') {
      if (!Number.isFinite(action.deg)) return { ok: false, reason: 'bad-angle' };
      if (state.round > 0) return { ok: false, reason: 'done' };
      state.angles[state.round] = +norm360(action.deg).toFixed(2);
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, manifest) {
    const e0 = angleError(state.angles[0], manifest.rounds[0].target);
    const g0 = e0 <= manifest.tolerance;
    return { success: g0, partial: g0 ? 1 : 0, error: +e0.toFixed(2), detail: { e0: +e0.toFixed(1), r1: g0 } };
  },

  oracle(manifest) {
    return [{ op: 'aim', deg: manifest.rounds[0].target }];
  },

  oraclePoints(m) {
    const r0 = m.rounds[0];
    if (m.view) {
      const cam = cameraOf(m), p = (d) => { const q = cam.project(Math.cos(rad(d)) * RD, 0, Math.sin(rad(d)) * RD); return [q.x, q.y]; };
      return [{ from: p(r0.start), to: p(r0.target) }];
    }
    const c = m.center || C, rr = m.R || R;
    const p = (d) => [c.x + dirVec(d).x * rr, c.y + dirVec(d).y * rr];
    return [{ from: p(r0.start), to: p(r0.target) }];
  },

  randomPolicy(m, rnd) { return [{ op: 'aim', deg: rnd() * 360 }]; },

  async mount(env) {
    if (!env || !env.style || !env.manifest?.ext) return;
    const A = await import('../common/_point_my_way_avatar.js');
    env.assets.av = A;
    env.assets.look = await A.buildGroundLook(env.style);
    env.assets.skin = A.chooseSkin(env.style, env.manifest.avatar || 'woman');
    const m = env.manifest;
    env.assets.props = A.placeProps(env.style.rand, EXT_BOARD.w, EXT_BOARD.h, m.center || C, m.R || R, m.rounds[0].facing, env.assets.look.props);
  },

  drawPrompt(g, r, env) {
    const rel = env?.manifest?.rounds?.[0]?.rel || 'L';
    if (env?.manifest?.ext) {
      const pr = PRONOUN[env.manifest.avatar] || 'its', subj = { her: 'She', his: 'He', its: 'It' }[pr];
      const Pr = pr[0].toUpperCase() + pr.slice(1), obj = { her: 'her', his: 'him', its: 'it' }[pr];
      if (rel === 'B') drawPromptText(g, r, `Turn the arrow to point behind ${obj}`, `${subj} is seen from above`);
      else drawPromptText(g, r, `Turn the arrow to point to ${pr} ${rel === 'L' ? 'left' : 'right'}`, `${Pr} ${rel === 'L' ? 'left' : 'right'}, not yours. ${subj} is seen from above`);
      return;
    }
    if (rel === 'B') drawPromptText(g, r, 'Turn the floor arrow to point behind her', 'The arrow lies flat on the floor');
    else drawPromptText(g, r, `Turn the floor arrow to point to her ${rel === 'L' ? 'left' : 'right'}`, `Her ${rel === 'L' ? 'left' : 'right'}, not yours. The arrow lies on the floor`);
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const rd = m.rounds[0];
    g.save(); g.translate(br.x, br.y);
    if (m.view) {
      g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
      const K = (this._cache3 ??= {}), q = Math.min(2, RT.contextScale(g));
      if (K.m !== m || K.q !== q) { K.m = m; K.q = q; K.img = RT.render(sceneOf(m), q); K.canvas = RT.toCanvas(K.img); K.mask = bodyMask(K.img); K.tmp = null; }
      g.drawImage(K.canvas, 0, 0, BOARD.w, BOARD.h);
      drawFloorArrow(g, K, cameraOf(m), st.angles[0]);
      g.restore();
      return;
    }
    if (env.style && env.assets.look) {
      const A = env.assets.av, c = m.center || C, rr = m.R || R;
      A.paintGround(g, br.w, br.h, env.assets.look, c, rr);
      A.drawProps(g, env.assets.props);
      A.drawArrow(g, env.assets.look, c, rr, st.angles[0]);
      A.drawAvatar(g, m.avatar || 'woman', env.assets.skin, c.x, c.y, rd.facing);
      g.restore();
      return;
    }
    const c = m.center || C, rr = m.R || R;
    g.fillStyle = '#f1f2ef'; g.fillRect(0, 0, br.w, br.h);
    g.beginPath(); g.arc(c.x, c.y, rr + 14, 0, TAU); g.fillStyle = '#e4e6e1'; g.fill();
    g.strokeStyle = '#cfd3cc'; g.lineWidth = 1.5; g.setLineDash([3, 5]);
    g.beginPath(); g.arc(c.x, c.y, rr, 0, TAU); g.stroke(); g.setLineDash([]);
    const nd = dirVec(st.angles[0]);
    const a0 = 52, tip = rr + 6;
    g.strokeStyle = ACCENT; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c.x + nd.x * a0, c.y + nd.y * a0); g.lineTo(c.x + nd.x * (tip - 12), c.y + nd.y * (tip - 12)); g.stroke();
    g.save(); g.translate(c.x + nd.x * tip, c.y + nd.y * tip); g.rotate(rad(st.angles[0]));
    g.beginPath(); g.moveTo(0, -4); g.lineTo(-11, 14); g.lineTo(11, 14); g.closePath(); g.fillStyle = ACCENT; g.fill();
    g.restore();
    drawPerson(g, c.x, c.y, rd.facing);
    g.restore();
  },

  pointer(evt, env) {
    const m = env.manifest;
    if (!m.view) return this._pointerFlat(evt, m, env.state.angles[0]);
    const cam = cameraOf(m);
    if (evt.type === 'down' && onArrow3d(evt.x, evt.y, cam, env.state.angles[0])) {
      this._drag = true; const b = floorBearing(cam, evt.x, evt.y); return b === null ? [] : [{ op: 'aim', deg: b }];
    }
    if ((evt.type === 'move' || evt.type === 'up') && this._drag) {
      if (evt.type === 'up') this._drag = false;
      const b = floorBearing(cam, evt.x, evt.y); return b === null ? [] : [{ op: 'aim', deg: b }];
    }
    return [];
  },

  _pointerFlat(evt, m, deg) {
    const c = m.center || C, rr = m.R || R, ang = () => Math.atan2(evt.x - c.x, -(evt.y - c.y)) * 180 / Math.PI;
    if (evt.type === 'down' && onArrow(evt.x, evt.y, c, rr, deg)) { this._drag = true; return [{ op: 'aim', deg: ang() }]; }
    if (evt.type === 'move' && this._drag) return [{ op: 'aim', deg: ang() }];
    if (evt.type === 'up' && this._drag) { this._drag = false; return [{ op: 'aim', deg: ang() }]; }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    if (env?.manifest?.ext) return `Drag the arrow around ${{ her: 'her', his: 'him' }[PRONOUN[env.manifest.avatar]] || 'it'}`;
    return 'Drag the arrow round her on the floor';
  },
};

function drawPerson(g, x, y, deg) {
  g.save(); g.translate(x, y); g.rotate(rad(deg)); g.scale(1.7, 1.7);
  const shadow = () => { g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = 6; g.shadowOffsetY = 2; };
  g.save(); shadow(); g.fillStyle = '#4a3b33';
  for (const sx of [-8, 8]) { g.beginPath(); g.ellipse(sx, -14, 5, 9, 0, 0, TAU); g.fill(); }
  g.restore();
  g.fillStyle = '#e2b796';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 23, -4, 4.5, 10, sx * -0.2, 0, TAU); g.fill(); }
  g.save(); shadow();
  g.beginPath(); g.ellipse(0, 2, 24, 12, 0, 0, TAU); g.fillStyle = '#c4553f'; g.fill();
  g.restore();
  g.beginPath(); g.ellipse(0, 2, 24, 12, 0, 0, TAU); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.ellipse(0, -11, 2.6, 3.4, 0, 0, TAU); g.fillStyle = '#e2b796'; g.fill();
  g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fillStyle = '#e2b796'; g.fill();
  g.beginPath(); g.arc(0, 1.5, 10, Math.PI * 1.08, Math.PI * 1.92, true); g.closePath(); g.fillStyle = '#3b2a20'; g.fill();
  g.beginPath(); g.arc(0, 11, 4.5, 0, TAU); g.fillStyle = '#3b2a20'; g.fill();
  g.restore();
}

export const _debug = { sceneOf, cameraOf, arrowScreen, RD, coarseErrors, screenAngle, floorFromScreen, camFwdOf };
