import { drawPromptText, ACCENT } from '../core/panel.js';
import { shape, makeScene, makeCam, plankFloor, plasterWall, softSky, STUDIO_LIGHT, cA, paintTraced, planeAtPixel } from '../common/_object_rt.js';
import { envLook, pickOf, S3 } from '../common/_rt_look.js';
import { pickTex, splitPick } from '../common/_rt_kit.js';
import { splitIds, nthOf } from '../core/style.js';

const BOARD = { w: 340, h: 320 };
const CRATE = { w: 0.5, d: 0.42 };
const CRATE_H = [0.42, 0.6];
const CRATE_YAW = 18;
const EYE_H = 1.6, FOV = 46;
const CAM_YAW = [-7, 7], CAM_PITCH = [22, 30];
const DEPTH_A = [1.8, 5.5];
const DEPTH_MAX = 16;
const RHO = [2.0, 8.5];
export const FRACS = [[1, 4, 'a quarter of'], [1, 3, 'one third of'], [1, 2, 'halfway'], [2, 3, 'two thirds of'], [3, 4, 'three quarters of']];
export const TOL = 0.10;
const MIN_GAP = 1.6;
export const TOL_PX = 9;
const LIN_MISS = 1.25;
const rhoLo = (fn) => Math.max(RHO[0], (fn / (fn - LIN_MISS * TOL) - fn) / (1 - fn) + 0.05);
const CLEAR_PX = 14;
const EDGE = 26;
const WALL_Z = -19;
const EPS = 1e-6;

const rad = (d) => d * Math.PI / 180;
export function cameraOf(m) {
  const yaw = rad(m.cam.yaw), p = rad(m.cam.pitch);
  const fwd = [-Math.sin(yaw) * Math.cos(p), -Math.sin(p), -Math.cos(yaw) * Math.cos(p)];
  const eye = [0, EYE_H, 0];
  return makeCam({ eye, target: [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], fovY: FOV, W: BOARD.w, H: BOARD.h });
}
function crateCorners(c) {
  const a = rad(c.yawDeg), cs = Math.cos(a), sn = Math.sin(a), out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, c.h]) {
    const lx = sx * c.w / 2, lz = sz * c.d / 2;
    out.push([c.x + lx * cs + lz * sn, y, c.z - lx * sn + lz * cs]);
  }
  return out;
}
export function crateOnBoard(c, cam, pad = EDGE) {
  return crateCorners(c).map(([x, y, z]) => cam.project(x, y, z)).every((v) =>
    v.z > 0.2 && v.x >= pad && v.x <= BOARD.w - pad && v.y >= pad && v.y <= BOARD.h - pad);
}
function hull2(ps) {
  const p = ps.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function hullDist(p, h) {
  let inside = 0, best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], dx = b.x - a.x, dy = b.y - a.y;
    const side = Math.sign(dx * (p.y - a.y) - dy * (p.x - a.x));
    if (i === 0) inside = side; else if (side !== inside) inside = false;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return inside ? 0 : best;
}
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inBand = (v, [lo, hi]) => Number.isFinite(v) && v >= lo - EPS && v <= hi + EPS;
export const redCrate = (m) => (m.redNear ? m.A : m.B);
export const blueCrate = (m) => (m.redNear ? m.B : m.A);
export function targetOf(m) {
  const r = redCrate(m), b = blueCrate(m), f = FRACS[m.frac][0] / FRACS[m.frac][1];
  return { x: r.x + (b.x - r.x) * f, z: r.z + (b.z - r.z) * f };
}
export const tolOf = (m) => TOL * distXZ(m.A, m.B);
export function tolPx(cam, t, R) {
  let lo = Infinity;
  const c = cam.project(t.x, 0, t.z);
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, p = cam.project(t.x + R * Math.cos(a), 0, t.z + R * Math.sin(a)); lo = Math.min(lo, Math.hypot(p.x - c.x, p.y - c.y)); }
  return lo;
}

function contractOk(m) {
  if (!m || m.task !== 'midpoint_tap' || 'rounds' in m) return false;
  if (!m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!m.cam || !inBand(m.cam.yaw, CAM_YAW) || !inBand(m.cam.pitch, CAM_PITCH)) return false;
  if (!Number.isInteger(m.frac) || m.frac < 0 || m.frac >= FRACS.length || typeof m.redNear !== 'boolean') return false;
  for (const c of [m.A, m.B]) {
    if (!c || c.w !== CRATE.w || c.d !== CRATE.d) return false;
    if (!inBand(c.h, CRATE_H) || !inBand(c.yawDeg, [-CRATE_YAW, CRATE_YAW])) return false;
  }
  if (distXZ(m.A, m.B) < MIN_GAP) return false;
  const cam = cameraOf(m);
  if (!crateOnBoard(m.A, cam) || !crateOnBoard(m.B, cam)) return false;
  const pa = cam.project(m.A.x, 0, m.A.z), pb = cam.project(m.B.x, 0, m.B.z);
  if (!inBand(pa.z, DEPTH_A) || pb.z > DEPTH_MAX + EPS) return false;
  if (!(pb.z >= pa.z * RHO[0] - EPS && pb.z <= pa.z * RHO[1] + EPS)) return false;
  const t = targetOf(m), tp = cam.project(t.x, 0, t.z);
  for (const c of [m.A, m.B]) if (hullDist(tp, hull2(crateCorners(c).map(([x, y, z]) => cam.project(x, y, z)))) < CLEAR_PX) return false;
  const r = redCrate(m), b = blueCrate(m), f = FRACS[m.frac][0] / FRACS[m.frac][1];
  const pr = cam.project(r.x, 0, r.z), pbl = cam.project(b.x, 0, b.z);
  const q = { x: pr.x + (pbl.x - pr.x) * f, y: pr.y + (pbl.y - pr.y) * f };
  if (Math.hypot(q.x - tp.x, q.y - tp.y) < LIN_MISS * TOL_PX) return false;
  const qf = planeAtPixel(cam, q.x, q.y, 0);
  if (!qf || distXZ(qf, t) < LIN_MISS * tolOf(m)) return false;
  return true;
}
export function gate(m) { return contractOk(m); }

const MATS = [
  { c: cA('#b8463a'), ks: 0.12, sh: 24 },
  { c: cA('#3f67b5'), ks: 0.12, sh: 24 },
];
function sceneOf(m) {
  const shapes = [], add = (id, mat, c) => shapes.push(shape.box(id, mat, c.x, c.h / 2, c.z, c.w / 2, c.h / 2, c.d / 2, c.yawDeg, 0.02));
  add(100, 0, redCrate(m)); add(101, 1, blueCrate(m));
  return makeScene({ cam: cameraOf(m), shapes, mats: MATS, light: { ...STUDIO_LIGHT, dir: [-0.35, 1, 0.25] },
    env: { floorY: 0, floor: plankFloor({ plank: 0.16, plankL: 1.3 }), wallZ: WALL_Z, wall: plasterWall(), sky: softSky } });
}
const floorAt = (m, x, y) => planeAtPixel(cameraOf(m), x, y, 0);

const EVAL_KEYS = new Set(['midpoint_tap|f0n|rho0|s3|y-1|c15', 'midpoint_tap|f2f|rho0|s5|y1|c52', 'midpoint_tap|f0n|rho6|s6|y-1|c25', 'midpoint_tap|f2f|rho1|s6|y1|c42',
  'midpoint_tap|f1n|rho7|s7|y-1|c43', 'midpoint_tap|f2n|rho4|s7|y1|c41', 'midpoint_tap|f1n|rho0|s4|y1|c52', 'midpoint_tap|f2n|rho3|s7|y-1|c42',
  'midpoint_tap|f0n|rho1|s3|y1|c52', 'midpoint_tap|f4f|rho4|s5|y1|c63', 'midpoint_tap|f2f|rho0|s5|y-1|c26', 'midpoint_tap|f2f|rho2|s6|y-1|c36']);
const EXT_LAYOUTS = (() => {
  const L = [];
  for (const [redNear, frac] of [[true, 0], [true, 1], [true, 2], [false, 2], [false, 3], [false, 4]]) for (const ys of [-1, 1])
    for (let ca = 1; ca <= 6; ca++) for (let cb = 1; cb <= 6; cb++) L.push({ redNear, frac, ys, ca, cb, id: `${frac}${redNear ? 'n' : 'f'}|${ys}|${ca}${cb}` });
  const f = splitIds('midpoint_tap|layout', L.map((e) => e.id), 2);
  return { train: L.filter((e) => f(e.id) === 'train'), test: L.filter((e) => f(e.id) === 'test') };
})();
function generateExt(rng, knobs) {
  const L = EXT_LAYOUTS[knobs.ext === 'test' ? 'test' : 'train'], E = L[nthOf(`midpoint_tap|${knobs.ext}|layout`, Number(knobs.n) || 1, L.length)];
  const { redNear, frac } = E, colX = (c) => [Math.max(50, c * BOARD.w / 8 + 0.5), Math.min(BOARD.w - 50, (c + 1) * BOARD.w / 8 - 0.5)];
  const [a0, a1] = colX(E.ca), [b0, b1] = colX(E.cb);
  for (let draw = 0; draw < 60; draw++) {
    const fn = redNear ? FRACS[frac][0] / FRACS[frac][1] : 1 - FRACS[frac][0] / FRACS[frac][1];
    const sOf = (r) => (fn * r) / ((1 - fn) + fn * r);
    const sDraw = rng.uniform(sOf(rhoLo(fn)), sOf(RHO[1]));
    const rho = (sDraw * (1 - fn)) / (fn * (1 - sDraw));
    const pitchHi = CAM_PITCH[1] - (CAM_PITCH[1] - CAM_PITCH[0]) * Math.max(0, Math.min(1, (rho - 3) / 2.5));
    for (let attempt = 0; attempt < 600; attempt++) {
      const cam = { yaw: +(E.ys * rng.uniform(0.01, CAM_YAW[1])).toFixed(2), pitch: +rng.uniform(CAM_PITCH[0], pitchHi).toFixed(2) };
      const yw = rad(cam.yaw), pr = rad(cam.pitch), f = (BOARD.h / 2) / Math.tan(rad(FOV / 2));
      const at = (d, sx) => { const D = (d - EYE_H * Math.sin(pr)) / Math.cos(pr), l = (sx - BOARD.w / 2) * d / f;
        return { x: +(-Math.sin(yw) * D + Math.cos(yw) * l).toFixed(3), z: +(-Math.cos(yw) * D - Math.sin(yw) * l).toFixed(3) }; };
      const dA = rng.uniform(DEPTH_A[0], Math.min(DEPTH_A[1], DEPTH_MAX / rho));
      const crate = (p) => ({ ...p, w: CRATE.w, d: CRATE.d, h: +rng.uniform(CRATE_H[0], CRATE_H[1]).toFixed(3), yawDeg: +rng.uniform(-CRATE_YAW, CRATE_YAW).toFixed(1) });
      const A = crate(at(dA, rng.uniform(a0, a1))), B = crate(at(dA * rho, rng.uniform(b0, b1)));
      const m = { task: 'midpoint_tap', board: BOARD, cam, A, B, frac, redNear };
      if (!contractOk(m)) continue;
      const k = semanticKey(m);
      if (EVAL_KEYS.has(k) || !k.endsWith(`|y${E.ys}|c${E.ca}${E.cb}`)) continue;
      m.ext = knobs.ext;
      return m;
    }
  }
  throw new Error('midpoint_tap: no valid scene for layout ' + E.id);
}

async function styleLook(style) {
  const rnd = style.rand;
  const env = await envLook(style, { tag: 'midpoint_tap', settings: ['boards', 'lobby', 'plaza', 'hall', 'workshop'], base: { ...STUDIO_LIGHT, dir: [-0.35, 1, 0.25] },
    tileSizes: [0.3, 0.4, 0.5, 0.6], L: [0.24, 0.52], wall: true, plank: [0.12, 0.22],
    named: [[0, 16], [231, 40]], layouts: ['grid', 'diagonal', 'bond', 'stagger'] });
  const kind = splitPick(style, 'midpoint_tap|crate', S3.CRATE_KINDS);
  const wood = pickTex(style, (t) => t.use === 'wood');
  const wtx = await S3.loadTexture(wood.file);
  style.note(`tex:${wood.id}`);
  const mats = [S3.crateMaterial({ kind, tint: '#b8463a', wood: wtx }), S3.crateMaterial({ kind, tint: '#3f67b5', wood: wtx })];
  return { key: style.key, mats, env, ids: { ...env.ids, crate: kind, wood: wood.id } };
}
function sceneStyled(m, look) {
  const shapes = [], add = (id, mat, c) => shapes.push(shape.box(id, mat, c.x, c.h / 2, c.z, c.w / 2, c.h / 2, c.d / 2, c.yawDeg, 0.02));
  add(100, 0, redCrate(m)); add(101, 1, blueCrate(m));
  return makeScene({ cam: cameraOf(m), shapes, mats: look.mats, light: look.env.light,
    env: { floorY: 0, floor: look.env.floor, wallZ: WALL_Z, wall: look.env.wall, sky: look.env.sky } });
}

const task = {
  meta: {
    name: 'midpoint_tap', family: 'A', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'tap', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'marks the floor point under the tap; a later tap moves the mark; Verify scores' }],
    promptHuman: 'Tap the floor point the asked fraction of the way from the red crate to the blue crate (measured along the floor)',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs);
    const redNear = rng.raw() < 0.5, frac = redNear ? rng.int(0, 2) : rng.int(2, 4);
    for (let draw = 0; draw < 12; draw++) {
    const fn = redNear ? FRACS[frac][0] / FRACS[frac][1] : 1 - FRACS[frac][0] / FRACS[frac][1];
    const sOf = (r) => (fn * r) / ((1 - fn) + fn * r);
    const sDraw = rng.uniform(sOf(rhoLo(fn)), sOf(RHO[1]));
    const rho = (sDraw * (1 - fn)) / (fn * (1 - sDraw));
    const pitchHi = CAM_PITCH[1] - (CAM_PITCH[1] - CAM_PITCH[0]) * Math.max(0, Math.min(1, (rho - 3) / 2.5));
    for (let attempt = 0; attempt < 4000; attempt++) {
      const cam = { yaw: +rng.uniform(CAM_YAW[0], CAM_YAW[1]).toFixed(2), pitch: +rng.uniform(CAM_PITCH[0], pitchHi).toFixed(2) };
      const yw = rad(cam.yaw), pr = rad(cam.pitch), f = (BOARD.h / 2) / Math.tan(rad(FOV / 2));
      const at = (d, sx) => { const D = (d - EYE_H * Math.sin(pr)) / Math.cos(pr), l = (sx - BOARD.w / 2) * d / f;
        return { x: +(-Math.sin(yw) * D + Math.cos(yw) * l).toFixed(3), z: +(-Math.cos(yw) * D - Math.sin(yw) * l).toFixed(3) }; };
      const dA = rng.uniform(DEPTH_A[0], Math.min(DEPTH_A[1], DEPTH_MAX / rho));
      const crate = (p) => ({ ...p, w: CRATE.w, d: CRATE.d, h: +rng.uniform(CRATE_H[0], CRATE_H[1]).toFixed(3), yawDeg: +rng.uniform(-CRATE_YAW, CRATE_YAW).toFixed(1) });
      const A = crate(at(dA, rng.uniform(50, BOARD.w - 50))), B = crate(at(dA * rho, rng.uniform(50, BOARD.w - 50)));
      const m = { task: 'midpoint_tap', board: BOARD, cam, A, B, frac, redNear };
      if (contractOk(m)) return m;
    }
    }
    throw new Error('midpoint_tap: no valid scene');
  },

  init() { return { tap: null }; },
  applyAction(s, a, m) {
    if (a?.op !== 'tap' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    if (a.x < 0 || a.x > BOARD.w || a.y < 0 || a.y > BOARD.h) return { ok: false, reason: 'outside' };
    const p = floorAt(m, a.x, a.y);
    if (!p || p.z < WALL_Z) return { ok: false, reason: 'not-floor' };
    s.tap = { x: +p.x.toFixed(4), z: +p.z.toFixed(4), px: a.x, py: a.y };
    return { ok: true };
  },
  verify(s, m) {
    const d = s.tap ? distXZ(s.tap, targetOf(m)) : Infinity, L = distXZ(m.A, m.B);
    let success = !!s.tap && d <= tolOf(m);
    if (s.tap && !success) {
      const t = targetOf(m), cam = cameraOf(m), a = cam.project(s.tap.x, 0, s.tap.z), b = cam.project(t.x, 0, t.z);
      success = Math.hypot(a.x - b.x, a.y - b.y) <= TOL_PX;
    }
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { tapped: !!s.tap, missShareOfGap: Number.isFinite(d) ? +(d / L).toFixed(3) : null } };
  },
  oracle(m) { const t = targetOf(m), p = cameraOf(m).project(t.x, 0, t.z); return [{ op: 'tap', x: +p.x.toFixed(2), y: +p.y.toFixed(2) }]; },
  randomPolicy(m, rnd) {
    const cam = cameraOf(m), a = cam.project(m.A.x, 0, m.A.z), b = cam.project(m.B.x, 0, m.B.z), u = rnd();
    return [{ op: 'tap', x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }];
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const f = FRACS[env.manifest.frac];
    drawPromptText(g, r, f[0] * 2 === f[1] ? 'Tap the floor halfway between the crates' : `Tap ${f[2]} the way from red to blue`, 'Measured along the floor');
  },

  featureGeometry(m) {
    const cam = cameraOf(m), t = targetOf(m), r = Math.max(TOL_PX, tolPx(cam, t, tolOf(m)));
    return { featureRequirements: ['target'],
      features: [{ id: 'floor-target', kind: 'target', effectiveWidthPx: 2 * r, effectiveHeightPx: 2 * r }],
      coverage: { complete: true, scope: `The accepted region (floor radius ${TOL} x crate gap, at least ${TOL_PX} px on screen) around the asked point, smallest on-screen radius.` } };
  },

  drawBoard(g, br, env) {
    const m = env.manifest;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    this._cache ??= {};
    const look = env.style ? env.assets?.look : null;
    if (look) paintTraced(g, this._cache, JSON.stringify([m.cam, m.A, m.B, m.redNear]) + '|style|' + look.key, () => sceneStyled(m, look));
    else paintTraced(g, this._cache, JSON.stringify([m.cam, m.A, m.B, m.redNear]), () => sceneOf(m));
    const tp = env.state.tap;
    if (tp) {
      const cam = cameraOf(m), pts = [];
      for (let k = 0; k < 28; k++) { const a = k * Math.PI / 14, p = cam.project(tp.x + 0.1 * Math.cos(a), 0, tp.z + 0.1 * Math.sin(a)); pts.push(p); }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      g.fillStyle = 'rgba(25,145,250,.28)'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 2.2; g.stroke();
      const c = cam.project(tp.x, 0, tp.z);
      g.beginPath(); g.arc(c.x, c.y, 2.4, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (env.submitted || evt.type !== 'down') return [];
    return [{ op: 'tap', x: evt.x, y: evt.y }];
  },

  footerStatus(env) {
    return env.state.tap ? 'Point marked' : 'Tap the floor';
  },
};

export default task;

export function semanticKey(m) {
  const cam = cameraOf(m), pa = cam.project(m.A.x, 0, m.A.z), pb = cam.project(m.B.x, 0, m.B.z), t = targetOf(m), pt = cam.project(t.x, 0, t.z);
  const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1, s = ((pt.x - pa.x) * (pb.x - pa.x) + (pt.y - pa.y) * (pb.y - pa.y)) / (L * L);
  const col = (p) => Math.max(0, Math.min(7, Math.floor(p.x / (BOARD.w / 8))));
  return `midpoint_tap|f${m.frac}${m.redNear ? 'n' : 'f'}|rho${Math.round(Math.log(pb.z / pa.z) / 0.25)}|s${Math.round(s * 10)}|y${Math.sign(m.cam.yaw)}|c${col(pa)}${col(pb)}`;
}
