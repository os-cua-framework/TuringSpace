import { drawPromptText, ACCENT } from '../core/panel.js';
import * as RT from '../common/_people_rt.js';
import { peopleMats, hashList, frameOrbit, probeVis, personProbes } from '../common/_people_look.js';
import { envLook, wardrobe, texMat, faceOf, S3 } from '../common/_rt_look.js';
import { pickTex } from '../common/_rt_kit.js';

const BOARD = { w: 340, h: 374 };
const H = BOARD.h;
const N = 8;
const RECIP = 18;
const MUTUAL_MAX = 5;
const MISS_TOL = 35;
const GAZE_EXCL = 16;
const ONE_SIDED_BACK = 60;
const FACE_JIT = 3;
const FIG_R = 13;
const BAND = 7;
const BLOCK_MIN = 12;
const CLEAR_MARGIN = 14;
const MIN_SEP = 60;
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const round2 = (v) => Math.round(v * 100) / 100;
const norm360 = (d) => ((d % 360) + 360) % 360;
const HUES = [8, 40, 88, 142, 190, 232, 286, 330];

function bearingDeg(from, to) {
  return norm360((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}
function angErr(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function ptSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function segRectClip(a, b, r) {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const edges = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return { hit: false, chord: 0 }; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return { hit: false, chord: 0 }; if (t > t0) t0 = t; }
    else { if (t < t0) return { hit: false, chord: 0 }; if (t < t1) t1 = t; }
  }
  if (t1 <= t0) return { hit: false, chord: 0 };
  return { hit: true, chord: Math.hypot(dx, dy) * (t1 - t0) };
}
function segSegDist(p1, p2, p3, p4) {
  const ux = p2.x - p1.x, uy = p2.y - p1.y;
  const vx = p4.x - p3.x, vy = p4.y - p3.y;
  const wx = p1.x - p3.x, wy = p1.y - p3.y;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy, e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
  else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  return Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy);
}
function segRectDist(a, b, r) {
  if (segRectClip(a, b, r).hit) return 0;
  const c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  let m = Infinity;
  for (let i = 0; i < 4; i++) m = Math.min(m, segSegDist(a, b, c[i], c[(i + 1) % 4]));
  return m;
}
function pointRectDist(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
function occlude(figs, pillars, i, j) {
  const a = figs[i], b = figs[j];
  let minClear = Infinity, maxPen = 0;
  for (let k = 0; k < figs.length; k++) {
    if (k === i || k === j) continue;
    const clr = ptSegDist(figs[k], a, b) - FIG_R;
    minClear = Math.min(minClear, clr);
    if (clr < 0) maxPen = Math.max(maxPen, -clr);
  }
  for (const p of pillars) {
    const chord = segRectClip(a, b, p).chord;
    if (chord > 0) { maxPen = Math.max(maxPen, chord); minClear = Math.min(minClear, -chord); }
    else minClear = Math.min(minClear, segRectDist(a, b, p));
  }
  return { minClear, maxPen, blocked: maxPen > 0 };
}
function squarelyBlocked(a, b, pillars) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  for (const p of pillars) {
    let ok = true;
    for (const o of [-BAND, 0, BAND]) {
      const a2 = { x: a.x + nx * o, y: a.y + ny * o }, b2 = { x: b.x + nx * o, y: b.y + ny * o };
      if (segRectClip(a2, b2, p).chord < BLOCK_MIN) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function contractOk(m) {
  if (!m || m.task !== 'eye_contact_pair') return false;
  if (!Array.isArray(m.figs) || m.figs.length !== N) return false;
  if (!Array.isArray(m.pillars) || m.pillars.length < 1) return false;
  if (!Array.isArray(m.answer) || m.answer.length !== 2) return false;
  if (!m.answer.every((i) => Number.isInteger(i) && i >= 0 && i < N) || m.answer[0] === m.answer[1]) return false;
  for (let i = 0; i < N; i++) {
    const f = m.figs[i];
    if (f.id !== i || ![f.x, f.y, f.yaw].every(Number.isFinite)) return false;
    if (f.x < 24 || f.x > BOARD.w - 24 || f.y < 34 || f.y > H - 30) return false;
    for (let j = i + 1; j < N; j++) if (Math.hypot(f.x - m.figs[j].x, f.y - m.figs[j].y) < MIN_SEP - 1) return false;
  }
  for (const p of m.pillars) {
    if (![p.x, p.y, p.w, p.h].every(Number.isFinite)) return false;
    if (p.x < 6 || p.y < 6 || p.x + p.w > BOARD.w - 6 || p.y + p.h > H - 6) return false;
    for (const f of m.figs) if (pointRectDist(f, p) < FIG_R + 3) return false;
  }
  const err = m.figs.map((a) => m.figs.map((b) => (a === b ? 0 : angErr(a.yaw, bearingDeg(a, b)))));
  for (let i = 0; i < N; i++) {
    const near = [];
    for (let j = 0; j < N; j++) if (j !== i && err[i][j] < GAZE_EXCL) near.push(j);
    if (near.length > 1) return false;
    if (near.length === 1 && !(err[i][near[0]] <= MUTUAL_MAX)) return false;
  }
  let mutualClear = 0, facingBlocked = 0, oneSided = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const ei = err[i][j], ej = err[j][i];
      const facing = ei <= RECIP && ej <= RECIP;
      const isAns = m.answer.includes(i) && m.answer.includes(j);
      if (isAns) {
        if (!(ei <= MUTUAL_MAX && ej <= MUTUAL_MAX)) return false;
        const oc = occlude(m.figs, m.pillars, i, j);
        if (oc.blocked || !(oc.minClear >= CLEAR_MARGIN)) return false;
        mutualClear++;
      } else if (facing) {
        if (!(ei <= MUTUAL_MAX && ej <= MUTUAL_MAX)) return false;
        if (!squarelyBlocked(m.figs[i], m.figs[j], m.pillars)) return false;
        facingBlocked++;
      } else {
        if (!(Math.max(ei, ej) >= MISS_TOL)) return false;
        if ((ei <= MUTUAL_MAX && ej >= ONE_SIDED_BACK) || (ej <= MUTUAL_MAX && ei >= ONE_SIDED_BACK)) oneSided++;
      }
    }
  }
  if (mutualClear !== 1) return false;
  if (facingBlocked < 1) return false;
  if (oneSided < 1) return false;
  return true;
}

function setFace(from, to, rng) {
  from.yaw = round2(norm360(bearingDeg(from, to) + rng.uniform(-FACE_JIT, FACE_JIT)));
}
function fillerYaw(figs, i, cx, cy, rng, awayFrom) {
  const f = figs[i];
  const out = bearingDeg({ x: cx, y: cy }, f);
  for (let t = 0; t < 64; t++) {
    const y = norm360(out + rng.uniform(-30, 30));
    let ok = true;
    for (let k = 0; k < figs.length; k++) {
      if (k === i) continue;
      if (angErr(y, bearingDeg(f, figs[k])) < MISS_TOL + 6) { ok = false; break; }
    }
    if (ok && awayFrom != null && angErr(y, bearingDeg(f, figs[awayFrom])) < ONE_SIDED_BACK + 5) ok = false;
    if (ok) return round2(y);
  }
  return null;
}
function makePillar(c, d, figs, rng) {
  for (let t = 0; t < 64; t++) {
    const f = rng.uniform(0.42, 0.58);
    const w = round2(rng.uniform(26, 34)), h = round2(rng.uniform(26, 34));
    const p = {
      x: round2(c.x + (d.x - c.x) * f - w / 2),
      y: round2(c.y + (d.y - c.y) * f - h / 2), w, h,
    };
    if (p.x < 8 || p.y < 8 || p.x + p.w > BOARD.w - 8 || p.y + p.h > H - 8) continue;
    if (!squarelyBlocked(c, d, [p])) continue;
    let bad = false;
    for (const g of figs) if (pointRectDist(g, p) < FIG_R + 6) { bad = true; break; }
    if (bad) continue;
    return p;
  }
  return null;
}

function tryBuild(rng, answer) {
  const cx = 170, cy = 190;
  const base = rng.uniform(0, 360);
  const figs = [];
  for (let i = 0; i < N; i++) {
    const ang = base + i * (360 / N) + rng.uniform(-7, 7);
    const r = rng.uniform(112, 128);
    figs.push({ id: i, x: round2(cx + Math.cos(rad(ang)) * r), y: round2(cy + Math.sin(rad(ang)) * r) });
  }
  for (let i = 0; i < N; i++) {
    const f = figs[i];
    if (f.x < 28 || f.x > BOARD.w - 28 || f.y < 38 || f.y > H - 34) return null;
    for (let j = i + 1; j < N; j++) if (Math.hypot(f.x - figs[j].x, f.y - figs[j].y) < MIN_SEP + 2) return null;
  }
  const [A, B] = answer;
  const rest = rng.shuffle(Array.from({ length: N }, (_, i) => i).filter((i) => i !== A && i !== B));
  const [C, D, E] = rest;
  const X = rng.pick(Array.from({ length: N }, (_, i) => i).filter((i) => i !== E));
  setFace(figs[A], figs[B], rng); setFace(figs[B], figs[A], rng);
  setFace(figs[C], figs[D], rng); setFace(figs[D], figs[C], rng);
  setFace(figs[E], figs[X], rng);
  const special = new Set([A, B, C, D, E]);
  for (let i = 0; i < N; i++) {
    if (special.has(i)) continue;
    const y = fillerYaw(figs, i, cx, cy, rng, i === X ? E : null);
    if (y === null) return null;
    figs[i].yaw = y;
  }
  const pil = makePillar(figs[C], figs[D], figs, rng);
  if (!pil) return null;

  const m = {
    task: 'eye_contact_pair', board: BOARD,
    figs: figs.map((f) => ({ id: f.id, x: f.x, y: f.y, yaw: f.yaw, hue: HUES[f.id] })),
    pillars: [pil],
    answer: [A, B].sort((a, b) => a - b),
    gtContract: 'a pair are in eye contact iff each one faces the other (within 5 deg) AND no third figure '
      + 'or pillar crosses the straight line between them; select the one mutual-gaze unobstructed pair',
  };
  return contractOk(m) ? m : null;
}

const S = 0.02, PCX = 170, PCY = 190;
const COL_H = 2.2;
const toW = (p) => [(p.x - PCX) * S, (p.y - PCY) * S];
function lookOf(m, f) {
  const h = hashList([f.id, f.x, f.y]);
  const female = ((f.id * 5 + Math.floor(h * 7)) % 3) === 0;
  return { skin: Math.floor(h * 97) % 4, hair: Math.floor(h * 53) % 4, shirt: f.id % 8, pants: Math.floor(h * 31) % 5,
    female, h: 1.64 + ((Math.floor(h * 1000) % 13) / 100) };
}
export function sceneParts(m) {
  const looks = m.figs.map((f) => lookOf(m, f));
  const { mats, idx } = peopleMats(looks);
  const stone = mats.length;
  const SC = RT.lin('#a9a49b'), SD = RT.lin('#8f8a82');
  mats.push({ c: SC, ks: 0.04, sh: 8, tex: (x, y, z, nx, ny, nz, sh, out) => { const n = RT.fbm(x * 9 + z * 9, y * 9, 3); RT.mixInto(out, SD, SC, 0.35 + 0.6 * n); } });
  const shapes = [];
  m.figs.forEach((f, i) => {
    const [X, Z] = toW(f), a = rad(f.yaw), L = looks[i];
    const J = RT.standPose(X, Z, Math.cos(a), Math.sin(a), L.h, 0, { headPitch: 4 });
    shapes.push(...RT.personShapes(f.id, J, idx[i], { hair: L.female ? 'long' : 'short', skirt: L.female && f.id % 2 === 0 }));
  });
  m.pillars.forEach((p, k) => {
    const [X, Z] = toW({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
    shapes.push(RT.shape.box(100 + k, stone, X, COL_H / 2, Z, p.w * S / 2, COL_H / 2, p.h * S / 2, 0, 0.012));
  });
  return { shapes, mats, looks };
}
const ENV = { floorY: 0, floor: RT.tileFloor({ tile: 0.6, a: '#cfc9be', b: '#c5beb1', grout: '#a29a8c' }), sky: RT.softSky };
const LIGHT = { ...RT.STUDIO_LIGHT, dir: [-0.4, 1.25, 0.3] };
const EL = 52, FOV = 34, PAD = 26;
const CAMS = new WeakMap();
export function cameraOf(m) {
  if (CAMS.has(m)) return CAMS.get(m);
  const { shapes, mats } = sceneParts(m);
  const pts = [];
  for (const f of m.figs) { const [X, Z] = toW(f); for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) pts.push([X + dx, 0, Z + dz]); pts.push([X, 1.8, Z]); }
  for (const p of m.pillars) for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const [X, Z] = toW({ x: p.x + u * p.w, y: p.y + v * p.h }); pts.push([X, COL_H, Z], [X, 0, Z]); }
  const base = Math.floor(hashList(m.figs.flatMap((f) => [f.x, f.y, f.yaw])) * 24);
  let best = null;
  for (let k = 0; k < 24; k++) {
    const az = ((base + k) % 24) * 15;
    const cam = frameOrbit({ az, el: EL, fov: FOV, pts, W: BOARD.w, H: BOARD.h, pad: PAD });
    const sc = RT.makeScene({ cam, shapes, mats, light: LIGHT, env: ENV });
    let worst = 1;
    for (const f of m.figs) {
      const [X, Z] = toW(f), a = rad(f.yaw);
      worst = Math.min(worst, probeVis(sc, f.id, personProbes(X, Z, [Math.cos(a), 0, Math.sin(a)])));
      if (best && worst <= best.worst) break;
    }
    if (!best || worst > best.worst) best = { cam, worst, az };
    if (worst >= 0.999) break;
  }
  CAMS.set(m, best);
  return best;
}
const SCENES = new WeakMap();
function sceneOf(m) {
  if (!SCENES.has(m)) { const { shapes, mats } = sceneParts(m); SCENES.set(m, RT.makeScene({ cam: cameraOf(m).cam, shapes, mats, light: LIGHT, env: ENV })); }
  return SCENES.get(m);
}
async function styleLook(style) {
  const env = await envLook(style, { tag: 'eye_contact_pair', settings: ['lobby', 'plaza', 'park', 'hall', 'yard'], base: LIGHT,
    tileSizes: [0.5, 0.6, 0.75, 0.9, 1.2], L: [0.25, 0.55], named: [] });
  const wr = await wardrobe(style, N);
  const pc = pickTex(style, (t) => ['stone', 'wall', 'metal', 'wood'].includes(t.use) && !/grate|grid/.test(t.id));
  const PT = await S3.loadTexture(pc.file);
  let L = 0.2 + 0.3 * style.rand();
  if (Math.abs(L - S3.lum(env.face)) < 0.1) L = S3.lum(env.face) > 0.35 ? S3.lum(env.face) - 0.16 : S3.lum(env.face) + 0.16;
  const pillar = texMat(PT, faceOf(PT.mean, L, { maxSat: 0.18, warmSat: 0.4 }), { texWorld: 1.4, cv: 0.3, keep: 0.6, ks: pc.use === 'metal' ? 0.25 : 0.05, sh: pc.use === 'metal' ? 40 : 10 });
  style.note(`tex:${pc.id}`);
  return { key: style.key, env, wr, pillar, ids: { ...env.ids, column: pc.id } };
}
const SCENES_STYLED = new WeakMap();
function sceneStyled(m, look) {
  let byKey = SCENES_STYLED.get(m);
  if (!byKey) { byKey = new Map(); SCENES_STYLED.set(m, byKey); }
  if (!byKey.has(look.key)) {
    const { shapes, mats } = sceneParts(m);
    const W = look.wr.mats();
    const styled = W.mats.concat([look.pillar]);
    if (styled.length !== mats.length) throw new Error('eye_contact_pair: material layout changed');
    byKey.set(look.key, RT.makeScene({ cam: cameraOf(m).cam, shapes, mats: styled, light: look.env.light,
      env: { floorY: 0, floor: look.env.floor, sky: look.env.sky } }));
  }
  return byKey.get(look.key);
}
function screenOf(m, f, y) { const [X, Z] = toW(f); return cameraOf(m).cam.project(X, y, Z); }

export default {
  meta: {
    name: 'eye_contact_pair', family: 'A', 
    boardH: 384, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', item: 'figure id 0..7' }],
    promptHuman: 'Tap the two people looking at each other', uses3d: true,
  },

  generate(rng) {
    const answer = rng.sample(Array.from({ length: N }, (_, i) => i), 2).sort((a, b) => a - b);
    for (let attempt = 0; attempt < 600; attempt++) {
      const m = tryBuild(rng, answer);
      if (m) return m;
    }
    throw new Error('eye_contact_pair: could not place the chosen pair with clear gaze margins');
  },

  init() { return { selected: [] }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'toggle' || !Number.isInteger(action.item)
      || action.item < 0 || action.item >= m.figs.length) return { ok: false, reason: 'bad-item' };
    const i = state.selected.indexOf(action.item);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(action.item);
    state.selected.sort((a, b) => a - b);
    return { ok: true, selected: i < 0 };
  },

  verify(state, m) {
    const want = new Set(m.answer);
    const valid = new Set(m.figs.map((f) => f.id));
    const got = new Set(state.selected.filter((id) => valid.has(id)));
    const correct = [...want].filter((id) => got.has(id)).length;
    const falsePos = [...got].filter((id) => !want.has(id)).length;
    return {
      success: correct === want.size && falsePos === 0,
      partial: Math.max(0, (correct - falsePos) / want.size),
      error: want.size - correct + falsePos,
      detail: { correct, falsePos, required: want.size, selected: [...got] },
    };
  },

  oracle(m) { return m.answer.map((item) => ({ op: 'toggle', item })); },

  randomPolicy(m, rnd) {
    const n = m.figs.length;
    const i = Math.floor(rnd() * n);
    const j = (i + 1 + Math.floor(rnd() * (n - 1))) % n;
    return [{ op: 'toggle', item: i }, { op: 'toggle', item: j }];
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap the two people looking at each other', 'Nothing may block the view between them');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    const C = (this._cache ??= {}), q = Math.min(2, RT.contextScale(g));
    const look = env.style ? env.assets?.look : null, sk = look ? look.key : '';
    if (C.m !== m || C.q !== q || C.sk !== sk) { C.m = m; C.q = q; C.sk = sk; C.img = RT.render(look ? sceneStyled(m, look) : sceneOf(m), q); C.canvas = RT.toCanvas(C.img); C.ringKey = null; }
    g.drawImage(C.canvas, 0, 0, BOARD.w, BOARD.h);
    const sel = new Set(st.selected), rk = st.selected.join(',');
    if (C.ringKey !== rk) { C.ringKey = rk; C.rings = RT.silhouetteRings(C.img, sel, [25, 145, 250, 255], 2.5); }
    if (sel.size) g.drawImage(C.rings, 0, 0, BOARD.w, BOARD.h);
    for (const f of m.figs) {
      if (!sel.has(f.id)) continue;
      const p = screenOf(m, f, 1.95), bx = Math.max(10, Math.min(BOARD.w - 10, p.x)), by = Math.max(10, p.y - 6);
      g.beginPath(); g.arc(bx, by, 8, 0, TAU); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.lineWidth = 1.9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx - 3.4, by); g.lineTo(bx - 1, by + 2.7); g.lineTo(bx + 3.8, by - 3.1); g.stroke();
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest;
    const id = RT.pickId(sceneOf(m), evt.x, evt.y);
    if (id >= 0 && id < m.figs.length) return [{ op: 'toggle', item: id }];
    let best = -1, bd = 22;
    for (const f of m.figs) {
      const p = screenOf(m, f, 1.1), d = Math.hypot(evt.x - p.x, evt.y - p.y);
      if (d < bd) { bd = d; best = f.id; }
    }
    return best >= 0 ? [{ op: 'toggle', item: best }] : [];
  },

  footerStatus(env) { return `${env.state.selected.length} selected`; },
};

export function gate(m) { return contractOk(m); }

export function semanticKey(m) {
  const cx = 170, cy = 190, n = m.figs.length;
  const ang = (p) => (Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 360) % 360;
  const order = m.figs.slice().sort((a, b) => ang(a) - ang(b)).map((f) => f.id);
  const a0 = order.indexOf(m.answer[0]), ringOf = (id) => (order.indexOf(id) - a0 + n) % n;
  const aim = (f) => {
    let best = -1, be = 6;
    for (const g of m.figs) if (g.id !== f.id) { const b = (Math.atan2(g.y - f.y, g.x - f.x) * 180 / Math.PI + 360) % 360; const e = Math.min(Math.abs(b - f.yaw) % 360, 360 - Math.abs(b - f.yaw) % 360); if (e < be) { be = e; best = g.id; } }
    return best;
  };
  const rel = (f) => { const out = (ang(f) + 180) % 360; let d = ((f.yaw - out) % 360 + 360) % 360; return Math.round(d / 30) % 12; };
  const seq = Array.from({ length: n }, (_, k) => {
    const f = m.figs.find((g) => g.id === order[(a0 + k) % n]), t = aim(f);
    return t >= 0 ? `>${ringOf(t)}` : `~${rel(f)}`;
  });
  const P = m.pillars[0], pc = { x: P.x + P.w / 2, y: P.y + P.h / 2 };
  const pa = Math.round(((ang(pc) - ang(m.figs.find((f) => f.id === m.answer[0])) + 360) % 360) / 15) % 24;
  const pr = Math.hypot(pc.x - cx, pc.y - cy) > 60 ? 'o' : 'i';
  return `eye_contact_pair|${seq.join(' ')}|p${pa}${pr}`;
}
