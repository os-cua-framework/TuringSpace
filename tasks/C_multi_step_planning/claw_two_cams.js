import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { render as rtRender, renderLayer, blit, contextScale } from '../common/_claw_two_cams_rt.js';
import {
  A, N, cellX, cellZ, VIEW, CLAW, CLAW_ID, KINDS, KIND_NAMES, toyTop, toyAABB, chuteAABB,
  projectIn, sceneOf, clawBox, objectStats, lightFor, WALLMAP, plushNoise, HATS, HAT_OK, HAT_ID0,
} from '../common/_claw_two_cams_scene.js';
import { S3, texMod, loadAll, splitOf, pickOf } from '../common/_relation_scene_look.js';

const BOARD = { w: 340, h: 414 };
const DPAD = { cx: 276, cy: 359, b: 34, gap: 3 };
const CAMB = { x: 10, w: 184, h: 46, y: [307, 361] };
const HARD = Object.freeze({
  toys: [10, 12], jit: 0.03, yaw: 35, s: [0.93, 1.07], el: [19, 25], dist: [3.4, 4.0],
  moves: [4, 6], visFrac: 0.55, visPx: 260, alignMargin: 0.3, clear: 0.006,
  hatVisFrac: 0.7, hatVisPx: 44, edgeTarget: false,
});
const BENCH = Object.freeze({
  sideDist: [3.0, 3.3],
  minRows: 2,
  pitchRatio: 1.25,
  divideMiss: 0.5,
  rowVisFrac: 0.45,
  startRowMargin: 0.12,
});
const isPhoto = (m) => m && m.photo === 'side';
const twinOf = (m) => m.toys.findIndex((t, k) => k !== m.target && t.kind === m.toys[m.target].kind);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const r3 = (v) => Math.round(v * 1000) / 1000;
const nearCol = (m) => (m.side === 'R' ? N - 1 : 0);
const FRONT_ROW = N - 1;

const toyCenter = (t) => [cellX(t.i) + t.dx, 0.07, cellZ(t.j) + t.dz];
const clawSX = (m, which, i, j) => projectIn(m, which, [cellX(i), 0.52, cellZ(j)]).x;

function alignMargin(m, which) {
  const t = m.toys[m.target], tx = projectIn(m, which, toyCenter(t)).x;
  let worst = Infinity;
  for (let d = 0; d < N; d++) {
    const xs = [];
    for (let a = 0; a < N; a++) xs.push(which === 'front' ? clawSX(m, which, a, d) : clawSX(m, which, d, a));
    const want = which === 'front' ? t.i : t.j;
    const err = xs.map((x) => Math.abs(x - tx));
    const best = err.indexOf(Math.min(...err));
    if (best !== want) return -1;
    const second = Math.min(...err.filter((_, k) => k !== want));
    const spacing = Math.abs(xs[1] - xs[0]);
    worst = Math.min(worst, (second - err[want]) / spacing);
  }
  return worst;
}
export function screenTouchPick(m, which) {
  const t = m.toys[m.target], topY = projectIn(m, which, [cellX(t.i) + t.dx, toyTop(t), cellZ(t.j) + t.dz]).y;
  let best = -1, bd = Infinity;
  for (let d = 0; d < N; d++) {
    const p = which === 'front' ? [cellX(t.i), CLAW.tip, cellZ(d)] : [cellX(d), CLAW.tip, cellZ(t.j)];
    const e = Math.abs(projectIn(m, which, p).y - topY);
    if (e < bd) { bd = e; best = d; }
  }
  return best;
}
function visibility(m, which) {
  const sc = sceneOf(m, which, { claw: m.start });
  const st = objectStats(sc, m.target + 1, 3, true);
  const hats = [m.target, twinOf(m)].map((k) => { const h = objectStats(sc, HAT_ID0 + k, 1, true); return { frac: h.frac, px: h.vis }; });
  return { frac: st.frac, px: st.vis * 9, hats };
}

const photoRowX = (m, i, j) => projectIn(m, 'side', [cellX(i), 0.07, cellZ(j)]).x;
const photoClawX = (m, i, j) => clawSX(m, 'side', i, j);
const photoPitch = (m, i) => Math.abs(photoRowX(m, i, N - 1) - photoRowX(m, i, 0)) / (N - 1);
const toyPhotoX = (m, t) => projectIn(m, 'side', toyCenter(t)).x;
export function photoPitchRatio(m) {
  const a = photoPitch(m, 0), b = photoPitch(m, N - 1);
  return Math.max(a, b) / Math.min(a, b);
}
export function photoDivideRead(m) {
  const t = m.toys[m.target], tw = m.toys[twinOf(m)];
  const d = Math.abs(photoClawX(m, m.start[0], m.start[1]) - toyPhotoX(m, t));
  const p = Math.abs(toyPhotoX(m, tw) - toyPhotoX(m, t));
  return { ratio: d / p, read: Math.round(d / p), truth: Math.abs(m.start[1] - t.j) };
}
export function photoStartRowMargin(m) {
  const [si, sj] = m.start, cx = photoClawX(m, si, sj);
  let worst = Infinity;
  for (let d = 0; d < N; d++) {
    const err = [];
    for (let j = 0; j < N; j++) err.push(Math.abs(photoRowX(m, d, j) - cx));
    const best = err.indexOf(Math.min(...err));
    if (best !== sj) return -1;
    worst = Math.min(worst, (Math.min(...err.filter((_, k) => k !== sj)) - err[sj]) / photoPitch(m, d));
  }
  return worst;
}
function photoRowsReadable(m) {
  const sc = sceneOf(m, 'side', { claw: m.start }), seen = new Set();
  m.toys.forEach((t, k) => { if (!seen.has(t.j) && objectStats(sc, k + 1, 3, true).frac >= BENCH.rowVisFrac) seen.add(t.j); });
  return seen.size === N;
}

function problems(m) {
  if (!m || m.task !== 'claw_two_cams' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['shape'];
  if (m.side !== 'L' && m.side !== 'R') return ['side'];
  if (m.chute !== 0 && m.chute !== N - 1) return ['chute'];
  if (m.photo !== undefined && m.photo !== 'side') return ['photo'];
  for (const w of ['front', 'side']) {
    const c = m.cams?.[w], D = isPhoto(m) && w === 'side' ? BENCH.sideDist : HARD.dist;
    if (!c || !(c.el >= HARD.el[0] && c.el <= HARD.el[1]) || !(c.dist >= D[0] && c.dist <= D[1])) return ['cams'];
  }
  const T = m.toys;
  if (!Array.isArray(T) || T.length < HARD.toys[0] || T.length > HARD.toys[1]) return ['toy-count'];
  const kinds = {}, cells = new Set();
  for (const t of T) {
    if (!KINDS[t.kind] || (kinds[t.kind] = (kinds[t.kind] || 0) + 1) > 2) return ['kinds'];
    if (t.hat !== undefined && !HATS[t.hat]) return ['hat'];
    if (!Number.isInteger(t.i) || !Number.isInteger(t.j) || t.i < 0 || t.i >= N || t.j < 0 || t.j >= N) return ['cell'];
    if (t.i === m.chute && t.j === N - 1) return ['on-chute'];
    if (cells.has(`${t.i},${t.j}`)) return ['cell-twice'];
    cells.add(`${t.i},${t.j}`);
    if (Math.abs(t.dx) > HARD.jit + 1e-9 || Math.abs(t.dz) > HARD.jit + 1e-9 || Math.abs(t.yaw) > HARD.yaw + 1e-9 || t.s < HARD.s[0] - 1e-9 || t.s > HARD.s[1] + 1e-9) return ['toy-params'];
  }
  const boxes = T.map(toyAABB).concat([chuteAABB(m.chute)]);
  const apart = (a, b) => a[2] + HARD.clear <= b[0] || b[2] + HARD.clear <= a[0] || a[3] + HARD.clear <= b[1] || b[3] + HARD.clear <= a[1];
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) if (!apart(boxes[a], boxes[b])) return ['toys-touch'];
  for (const b of boxes) if (b[0] < -A + HARD.clear || b[1] < -A + HARD.clear || b[2] > A - HARD.clear || b[3] > A - HARD.clear) return ['toy-in-wall'];
  const tg = T[m.target];
  if (!tg) return ['target'];
  const tw = T[twinOf(m)];
  if (!tw || kinds[tg.kind] !== 2) return ['twin'];
  if (tw.i !== tg.i || tw.j === tg.j) return ['twin-place'];
  if (!tg.hat || !tw.hat || tg.hat === tw.hat || !HAT_OK[tg.kind].includes(tg.hat) || !HAT_OK[tg.kind].includes(tw.hat)
    || [tg.hat, tw.hat].sort().join() === 'green,red') return ['hats'];
  if (T.some((t) => t.kind !== tg.kind && t.hat)) return ['hat-on-other'];
  const errs = [];
  if (tg.j === FRONT_ROW || tg.i === nearCol(m)) errs.push('target-near-camera');
  if (!HARD.edgeTarget && (tg.i === 0 || tg.i === N - 1 || tg.j === 0)) errs.push('target-on-edge');
  if (!T.some((t, k) => k !== m.target && t.i === tg.i && t.j !== tg.j)) errs.push('alone-in-column');
  if (!T.some((t, k) => k !== m.target && t.j === tg.j && t.i !== tg.i)) errs.push('alone-in-row');
  const [si, sj] = m.start || [];
  if (!Number.isInteger(si) || !Number.isInteger(sj) || si < 0 || si >= N || sj < 0 || sj >= N) return ['start'];
  const dx = Math.abs(si - tg.i), dz = Math.abs(sj - tg.j);
  if (dx < 1 || dz < 1) errs.push('start-shares-a-line');
  if (dx + dz < HARD.moves[0] || dx + dz > HARD.moves[1]) errs.push('moves');
  if (isPhoto(m)) {
    if (dz < BENCH.minRows) errs.push('photo-rows');
    if (tw.j !== tg.j + Math.sign(tg.j - sj)) errs.push('twin-not-past-target');
    for (let j = 0; j < N; j++) if (!T.some((t) => t.j === j)) { errs.push('empty-row'); break; }
  }
  if (errs.length) return errs;
  if (screenTouchPick(m, 'front') === tg.j) errs.push('touch-front');
  if (screenTouchPick(m, 'side') === tg.i) errs.push('touch-side');
  if (alignMargin(m, 'front') < HARD.alignMargin) errs.push('align-front');
  if (alignMargin(m, 'side') < HARD.alignMargin) errs.push('align-side');
  for (const w of ['front', 'side']) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const b = clawBox(m, w, i, j);
    if (b[0] < 4 || b[2] > VIEW.w - 4 || b[1] < 30 || b[3] > VIEW.h - 4) { errs.push('claw-out'); i = N; break; }
  }
  if (isPhoto(m)) {
    if (photoPitchRatio(m) < BENCH.pitchRatio) errs.push('photo-pitch-ratio');
    const dv = photoDivideRead(m);
    if (Math.abs(dv.ratio - dv.truth) < BENCH.divideMiss) errs.push('photo-divide-works');
    if (photoStartRowMargin(m) < BENCH.startRowMargin) errs.push('photo-start-row');
  }
  if (errs.length) return errs;
  for (const w of ['front', 'side']) {
    const v = visibility(m, w);
    if (v.frac < HARD.visFrac || v.px < HARD.visPx) errs.push(`hidden-${w}`);
    if (v.hats.some((h) => h.frac < HARD.hatVisFrac || h.px < HARD.hatVisPx)) errs.push(`hat-hidden-${w}`);
  }
  if (!errs.length && isPhoto(m) && !photoRowsReadable(m)) errs.push('photo-row-hidden');
  return errs;
}
export function gate(m) {
  try { return problems(m).length === 0; } catch { return false; }
}
export const __problems = problems;

export function semanticKey(m) {
  const toys = m.toys.map((t) => `${t.kind}${t.hat ? '+' + t.hat : ''}@${t.i},${t.j}`).sort().join(';');
  const tg = m.toys[m.target];
  return `claw_two_cams|${m.side}|chute${m.chute}|${toys}|T:${tg.kind}+${tg.hat}|S:${m.start.join(',')}`;
}

function tryBuild(rng) {
  const side = rng.pick(['L', 'R']), chute = rng.pick([0, N - 1]);
  const cams = {
    front: { el: r3(rng.uniform(...HARD.el)), dist: r3(rng.uniform(...HARD.dist)) },
    side: { el: r3(rng.uniform(...HARD.el)), dist: r3(rng.uniform(...HARD.dist)) },
  };
  const n = rng.int(...HARD.toys);
  const near = side === 'R' ? N - 1 : 0;
  const tKind = rng.pick(KIND_NAMES), others = KIND_NAMES.filter((k) => k !== tKind);
  const otherKinds = rng.shuffle(others.concat(others)).slice(0, n - 2);
  const free = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!(i === chute && j === N - 1)) free.push([i, j]);
  const tc = rng.pick(free.filter(([i, j]) => j !== FRONT_ROW && i !== near && (HARD.edgeTarget || (i > 0 && i < N - 1 && j > 0))));
  const wc = rng.pick(free.filter(([i, j]) => i === tc[0] && j !== tc[1]));
  const rest = rng.shuffle(free.filter(([i, j]) => !(i === tc[0] && (j === tc[1] || j === wc[1])))).slice(0, n - 2);
  let hats = null;
  for (let a = 0; a < 20 && !hats; a++) {
    const h = rng.shuffle(HAT_OK[tKind]).slice(0, 2);
    if (h.slice().sort().join() !== 'green,red') hats = h;
  }
  if (!hats) return null;
  const spec = [{ kind: tKind, c: tc, hat: hats[0], tgt: true }, { kind: tKind, c: wc, hat: hats[1] }]
    .concat(otherKinds.map((kind, k) => ({ kind, c: rest[k] })));
  const toys = rng.shuffle(spec).map((q) => ({
    kind: q.kind, i: q.c[0], j: q.c[1],
    dx: r3(rng.uniform(-HARD.jit, HARD.jit)), dz: r3(rng.uniform(-HARD.jit, HARD.jit)),
    yaw: Math.round(rng.uniform(-HARD.yaw, HARD.yaw)), s: r3(rng.uniform(...HARD.s)),
    ...(q.hat ? { hat: q.hat } : {}), _t: !!q.tgt,
  }));
  const target = toys.findIndex((t) => t._t);
  for (const t of toys) delete t._t;
  const base = { task: 'claw_two_cams', board: { ...BOARD }, side, chute, cams, toys, target, start: [0, 0] };
  const tg = toys[target];
  if (!toys.some((u, q) => q !== target && u.j === tg.j && u.i !== tg.i)) return null;
  const starts = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const dx = Math.abs(i - tg.i), dz = Math.abs(j - tg.j);
    if (dx >= 1 && dz >= 1 && dx + dz >= HARD.moves[0] && dx + dz <= HARD.moves[1]) starts.push([i, j]);
  }
  if (!starts.length) return null;
  const fits = (oi, oj) => {
    let c = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (j === FRONT_ROW || i === near || (!HARD.edgeTarget && (i === 0 || i === N - 1 || j === 0))) continue;
      if (i + oi >= 0 && i + oi < N && j + oj >= 0 && j + oj < N) c++;
    }
    return c;
  };
  const wts = starts.map(([i, j]) => 1 / fits(i - tg.i, j - tg.j));
  let r = rng.uniform(0, wts.reduce((a, b) => a + b, 0)), pick = starts.length - 1;
  for (let k = 0; k < starts.length; k++) { r -= wts[k]; if (r < 0) { pick = k; break; } }
  base.start = starts[pick];
  const m = { ...base, gtContract: 'the claw must end over the cell of the named toy (toys[target].i, .j)' };
  return gate(m) ? m : null;
}

const benchTargetOk = (i, j) => j !== FRONT_ROW && i > 0 && i < N - 1 && j > 0;
const benchStartOk = (i, j, ti, tj) => {
  const dx = Math.abs(i - ti), dz = Math.abs(j - tj);
  return i >= 0 && i < N && j >= 0 && j < N && dx >= 1 && dz >= BENCH.minRows && dx + dz >= HARD.moves[0] && dx + dz <= HARD.moves[1];
};
const BENCH_OFFSETS = (() => {
  const out = [];
  for (let oi = -(N - 1); oi <= N - 1; oi++) for (let oj = -(N - 1); oj <= N - 1; oj++) {
    let fit = false;
    for (let i = 0; i < N && !fit; i++) for (let j = 0; j < N && !fit; j++) if (benchTargetOk(i, j) && benchStartOk(i + oi, j + oj, i, j)) fit = true;
    if (fit) out.push([oi, oj]);
  }
  return out;
})();
function tryBuildBench(rng, off, raw = false) {
  const side = rng.pick(['L', 'R']), chute = rng.pick([0, N - 1]);
  const cams = {
    front: { el: r3(rng.uniform(...HARD.el)), dist: r3(rng.uniform(...HARD.dist)) },
    side: { el: r3(rng.uniform(...HARD.el)), dist: r3(rng.uniform(...BENCH.sideDist)) },
  };
  const n = rng.int(...HARD.toys);
  const tKind = rng.pick(KIND_NAMES), others = KIND_NAMES.filter((k) => k !== tKind);
  const otherKinds = rng.shuffle(others.concat(others)).slice(0, n - 2);
  const free = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!(i === chute && j === N - 1)) free.push([i, j]);
  const tcs = free.filter(([i, j]) => benchTargetOk(i, j) && benchStartOk(i + off[0], j + off[1], i, j));
  if (!tcs.length) return null;
  const tc = rng.pick(tcs), start = [tc[0] + off[0], tc[1] + off[1]];
  const wc = [tc[0], tc[1] + Math.sign(tc[1] - start[1])];
  if (chute === wc[0] && wc[1] === N - 1) return null;
  const rest = rng.shuffle(free.filter(([i, j]) => !(i === tc[0] && (j === tc[1] || j === wc[1])))).slice(0, n - 2);
  let hats = null;
  for (let a = 0; a < 20 && !hats; a++) {
    const h = rng.shuffle(HAT_OK[tKind]).slice(0, 2);
    if (h.slice().sort().join() !== 'green,red') hats = h;
  }
  if (!hats) return null;
  const spec = [{ kind: tKind, c: tc, hat: hats[0], tgt: true }, { kind: tKind, c: wc, hat: hats[1] }]
    .concat(otherKinds.map((kind, k) => ({ kind, c: rest[k] })));
  const toys = rng.shuffle(spec).map((q) => ({
    kind: q.kind, i: q.c[0], j: q.c[1],
    dx: r3(rng.uniform(-HARD.jit, HARD.jit)), dz: r3(rng.uniform(-HARD.jit, HARD.jit)),
    yaw: Math.round(rng.uniform(-HARD.yaw, HARD.yaw)), s: r3(rng.uniform(...HARD.s)),
    ...(q.hat ? { hat: q.hat } : {}), _t: !!q.tgt,
  }));
  const target = toys.findIndex((t) => t._t);
  for (const t of toys) delete t._t;
  const m = { task: 'claw_two_cams', board: { ...BOARD }, side, chute, cams, toys, target, start, photo: 'side',
    gtContract: 'the claw must end over the cell of the named toy (toys[target].i, .j)' };
  return raw || gate(m) ? m : null;
}
export const __tryBuildBench = tryBuildBench, __BENCH_OFFSETS = BENCH_OFFSETS;

const task = {
  meta: {
    name: 'claw_two_cams', family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'move', dir: 'up | down | left | right — the claw moves one cell in the MACHINE frame (up = away from the front glass), whichever camera is showing' },
      { op: 'cam', cam: 'front | side — which camera feed is shown' },
    ],
    promptHuman: 'Move the claw right above the named toy (kind and hat colour)',
  },

  generate(rng, _level, _index, knobs) {
    if (knobs && knobs.ext) {
      for (let a = 0; a < 3000; a++) { const m = tryBuild(rng); if (m) return m; }
      throw new Error('claw_two_cams: generator exhausted');
    }
    const off = rng.pick(BENCH_OFFSETS);
    for (let a = 0; a < 20000; a++) { const m = tryBuildBench(rng, off); if (m) return m; }
    throw new Error('claw_two_cams: bench generator exhausted');
  },

  init(m) { return { claw: m.start.slice(), cam: 'front', moved: false }; },

  applyAction(state, a) {
    if (a?.op === 'move') {
      const d = DIRS[a.dir];
      if (!d) return { ok: false, reason: 'bad-dir' };
      const i = state.claw[0] + d[0], j = state.claw[1] + d[1];
      if (i < 0 || i >= N || j < 0 || j >= N) return { ok: true, moved: false };
      state.claw = [i, j]; state.moved = true;
      return { ok: true, moved: true };
    }
    if (a?.op === 'cam') {
      if (a.cam !== 'front' && a.cam !== 'side') return { ok: false, reason: 'bad-cam' };
      state.cam = a.cam;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const t = m.toys[m.target];
    const ok = state.claw[0] === t.i && state.claw[1] === t.j;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { claw: state.claw.slice(), target: [t.i, t.j], off: [state.claw[0] - t.i, state.claw[1] - t.j] } };
  },

  oracle(m) {
    const t = m.toys[m.target], [si, sj] = m.start, acts = [];
    for (let k = 0; k < Math.abs(t.i - si); k++) acts.push({ op: 'move', dir: t.i > si ? 'right' : 'left' });
    acts.push({ op: 'cam', cam: 'side' });
    for (let k = 0; k < Math.abs(t.j - sj); k++) acts.push({ op: 'move', dir: t.j > sj ? 'down' : 'up' });
    return acts;
  },

  randomPolicy(m, rnd) {
    const n = 2 + Math.floor(rnd() * 9), acts = [];
    const dirs = ['up', 'down', 'left', 'right'];
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.2) acts.push({ op: 'cam', cam: rnd() < 0.5 ? 'front' : 'side' });
      else acts.push({ op: 'move', dir: dirs[Math.floor(rnd() * 4)] });
    }
    return acts;
  },

  async mount(env) {
    env.assets.claw = { bg: {}, patch: null };
    env.fx = null;
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    const m = env.manifest;
    const t = m.toys[m.target];
    drawPromptText(g, r, `Move the claw right above the ${KINDS[t.kind].label} in the ${t.hat} hat`, 'Arrows move it as seen from the front');
  },

  tick(env, dt) {
    syncFx(env);
    if (!env.fx || env.fx.age >= DROP_T) return false;
    env.fx.age = Math.min(DROP_T, env.fx.age + dt);
    return true;
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    syncFx(env);
    const which = st.cam, q = Math.min(2, contextScale(g));
    const A2 = env.assets.claw || (env.assets.claw = { bg: {}, patch: null });
    const look = env.style ? env.assets.look : null, sk = look ? `|${env.style.key}` : '';
    if (A2.m !== m || A2.sk !== sk) { A2.m = m; A2.sk = sk; A2.bg = {}; A2.patch = null; }
    const bgKey = `${which}|${q}`;
    if (!A2.bg[bgKey]) A2.bg[bgKey] = rtRender(sceneOf(m, which, { claw: null, look }), q);
    const other = which === 'front' ? 'side' : 'front', oKey = `${other}|${q}`;
    if (!A2.bg[oKey] && !A2.pending && typeof setTimeout === 'function') {
      A2.pending = true;
      setTimeout(() => { if (env.assets.claw === A2 && A2.m === m && A2.sk === sk && !A2.bg[oKey]) A2.bg[oKey] = rtRender(sceneOf(m, other, { claw: null, look }), q); A2.pending = false; }, 60);
    }
    const still = false, claw = st.claw;
    const drop = still ? 0 : dropOf(m, st, env);
    const pq = !still && env.fx && env.fx.age < DROP_T ? 1 : q;
    const pkey = `${which}|${claw}|${drop.toFixed(4)}|${pq}`;
    if (!A2.patch || A2.patch.key !== pkey) {
      const b = clawBox(m, which, claw[0], claw[1], drop), pad = 3;
      A2.patch = { key: pkey, img: renderLayer(sceneOf(m, which, { claw, drop, look }), pq,
        { x: b[0] - pad, y: b[1] - pad, w: b[2] - b[0] + 2 * pad, h: b[3] - b[1] + 2 * pad }, new Set([CLAW_ID])) };
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); rr(g, 0, 0, VIEW.w, VIEW.h, 8); g.clip();
    const bg = A2.bg[bgKey];
    g.imageSmoothingEnabled = true;
    g.drawImage(bg.canvas || (bg.canvas = toCanvasSafe(bg)), 0, 0, VIEW.w, VIEW.h);
    const x = cellX(claw[0]), z = cellZ(claw[1]);
    const p0 = projectIn(m, which, [x, CLAW.hubTop - drop, z]), p1 = projectIn(m, which, [x, 2.0, z]);
    g.lineCap = 'butt';
    g.strokeStyle = '#3b3f47'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(p0.x + 0.4, p0.y); g.lineTo(p1.x + 0.4, p1.y); g.stroke();
    const P = A2.patch.img;
    blit(g, P, P.x, P.y);
    if (still) {
      g.strokeStyle = '#fbfbf8'; g.lineWidth = 12; g.strokeRect(0, 0, VIEW.w, VIEW.h);
      g.strokeStyle = 'rgba(60,70,80,.35)'; g.lineWidth = 1; g.strokeRect(6.5, 6.5, VIEW.w - 13, VIEW.h - 13);
    }
    const label = which === 'front' ? 'FRONT CAM' : 'SIDE CAM';
    g.font = `700 10px ${UI_FONT}`;
    const tw = g.measureText(label).width, ly = 8;
    rr(g, ly, ly, tw + 30, 20, 10); g.fillStyle = 'rgba(18,22,30,.55)'; g.fill();
    camGlyph(g, ly + 11, ly + 10, '#fff', 0.8);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, ly + 20, ly + 10.5);
    g.restore();
    this._drawControls(g, st, env);
    g.restore();
  },

  _dpadRects(env) {
    const U = env && env.style ? env.assets?.look?.ui : null;
    const { b, gap } = DPAD, cx = U ? U.dpad : DPAD.cx, cy = DPAD.cy, o = b + gap;
    return {
      up: { x: cx - b / 2, y: cy - b / 2 - o, w: b, h: b },
      down: { x: cx - b / 2, y: cy - b / 2 + o, w: b, h: b },
      left: { x: cx - b / 2 - o, y: cy - b / 2, w: b, h: b },
      right: { x: cx - b / 2 + o, y: cy - b / 2, w: b, h: b },
    };
  },
  _camRects(env) {
    const U = env && env.style ? env.assets?.look?.ui : null;
    if (U) return { front: { ...U.front }, side: { ...U.side } };
    return { front: { x: CAMB.x, y: CAMB.y[0], w: CAMB.w, h: CAMB.h }, side: { x: CAMB.x, y: CAMB.y[1], w: CAMB.w, h: CAMB.h } };
  },

  _drawControls(g, st, env) {
    const live = !env.submitted;
    const C = this._camRects(env), compact = C.front.w < 150;
    for (const k of ['front', 'side']) {
      const b = C[k], on = st.cam === k;
      rr(g, b.x, b.y, b.w, b.h, 9);
      g.fillStyle = on ? '#e2effd' : '#eef2f6'; g.fill();
      g.strokeStyle = on ? ACCENT : '#c8d0d8'; g.lineWidth = on ? 1.6 : 1; g.stroke();
      const col = on ? '#1670c4' : '#3c4955';
      camGlyph(g, b.x + (compact ? 18 : 26), b.y + b.h / 2, col, 1.25);
      g.fillStyle = col; g.font = `700 13px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(k === 'front' ? 'Front cam' : 'Side cam', b.x + (compact ? 34 : 46), b.y + b.h / 2 + 0.5);
    }
    const R = this._dpadRects(env), cx = R.up.x + R.up.w / 2, cy = DPAD.cy;
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fillStyle = '#dde3ea'; g.fill();
    for (const k of ['up', 'down', 'left', 'right']) {
      const b = R[k];
      rr(g, b.x, b.y, b.w, b.h, 8); g.fillStyle = '#eef2f6'; g.fill();
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = live ? '#3c4955' : '#9aa7b4';
      g.strokeStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
      const mx = b.x + b.w / 2, my = b.y + b.h / 2, [ux, uy] = DIRS[k];
      g.beginPath(); g.moveTo(mx - ux * 8, my - uy * 8); g.lineTo(mx + ux * 7, my + uy * 7); g.stroke();
      g.beginPath();
      g.moveTo(mx + ux * 9 - uy * 6 - ux * 6, my + uy * 9 + ux * 6 - uy * 6);
      g.lineTo(mx + ux * 9, my + uy * 9);
      g.lineTo(mx + ux * 9 + uy * 6 - ux * 6, my + uy * 9 - ux * 6 - uy * 6);
      g.stroke();
    }
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const hit = (b) => evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h;
    const R = this._dpadRects(env);
    for (const k of ['up', 'down', 'left', 'right']) if (hit(R[k])) return [{ op: 'move', dir: k }];
    const C = this._camRects(env);
    for (const k of ['front', 'side']) if (hit(C[k])) return [{ op: 'cam', cam: k }];
    return [];
  },

  footerStatus(env) {
    if (env.fx || env.submitted) return 'Claw dropped';
    return env.state.moved ? 'Claw moved' : 'Use the arrows to move the claw';
  },
};
export default task;

const PATTERNS = ['dots', 'stars', 'checks', 'stripes', 'hearts', 'diamonds', 'plaid', 'confetti', 'rings', 'triangles'];
const HUES = [0, 30, 50, 90, 140, 180, 200, 220, 250, 280, 310, 335];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function patternAt(kind, u, y, p, fp, salt) {
  const aa = (d) => clamp01(d / Math.max(fp, 1e-5) + 0.5);
  const gx = u / p, gy = y / p, row = Math.floor(gy), col = Math.floor(gx), fx = gx - col - 0.5, fy = gy - row - 0.5;
  switch (kind) {
    case 'dots': { const off = row % 2 ? 0.5 : 0, dx = gx - Math.floor(gx + off) - 0.5 + off; return aa((0.2 - Math.hypot(dx, fy)) * p); }
    case 'stars': {
      const off = row % 2 ? 0.5 : 0, dx = gx - Math.floor(gx + off) - 0.5 + off, a = Math.atan2(fy, dx), r = Math.hypot(dx, fy);
      const k = Math.cos((((a / (2 * Math.PI / 5)) % 1 + 1) % 1 - 0.5) * 2 * Math.PI / 5), R = 0.27 * (0.55 + 0.45 * Math.pow(Math.abs(k), 6)) ;
      return aa((R - r) * p);
    }
    case 'checks': { const e = clamp01(Math.min(0.5 - Math.abs(fx), 0.5 - Math.abs(fy)) * p / Math.max(fp, 1e-5)); return (col + row) & 1 ? 0.5 + 0.5 * e : 0.5 - 0.5 * e; }
    case 'stripes': return aa((0.22 - Math.abs(fx)) * p);
    case 'hearts': {
      const off = row % 2 ? 0.5 : 0, dx = Math.abs(gx - Math.floor(gx + off) - 0.5 + off) * 1.25, dy = -fy * 1.25 + 0.05;
      const q = dx * dx + Math.pow(dy - Math.sqrt(Math.max(0, dx)) * 0.62, 2);
      return aa((0.1 - q) * p * 1.6);
    }
    case 'diamonds': return aa((0.33 - Math.abs(fx) - Math.abs(fy)) * p);
    case 'plaid': return 0.55 * aa((0.14 - Math.abs(fx)) * p) + 0.55 * aa((0.14 - Math.abs(fy)) * p) - 0.1 * aa((0.14 - Math.abs(fx)) * p) * aa((0.14 - Math.abs(fy)) * p);
    case 'confetti': { const h = S3.hash2(col + salt, row - salt), cx = (S3.hash2(col, row + 7) - 0.5) * 0.4, cy = (S3.hash2(col + 3, row) - 0.5) * 0.4; return h < 0.7 ? aa((0.14 - Math.hypot(fx - cx, fy - cy)) * p) : 0; }
    case 'rings': { const off = row % 2 ? 0.5 : 0, dx = gx - Math.floor(gx + off) - 0.5 + off; return aa((0.06 - Math.abs(Math.hypot(dx, fy) - 0.22)) * p); }
    default: { const off = row % 2 ? 0.5 : 0, dx = gx - Math.floor(gx + off) - 0.5 + off; return aa((Math.min(0.22 + fy * 0.9 - Math.abs(dx) * 1.6, 0.22 - fy)) * p * 0.6); }
  }
}
const TOY_LIN = Object.values(KINDS).map((k) => S3.linOf(k.col));
const CLAW_FINISHES = [{ id: 'chrome', tint: null }, { id: 'gold', tint: [1.0, 0.78, 0.42] }, { id: 'brass', tint: [0.92, 0.8, 0.55] }, { id: 'satin-steel', tint: [0.86, 0.88, 0.9] }];
const UI_LAYOUTS = [
  { id: 'cams-left', dpad: 276, front: { x: 10, y: 307, w: 184, h: 46 }, side: { x: 10, y: 361, w: 184, h: 46 } },
  { id: 'cams-left-swap', dpad: 276, front: { x: 10, y: 361, w: 184, h: 46 }, side: { x: 10, y: 307, w: 184, h: 46 } },
  { id: 'cams-right', dpad: 64, front: { x: 146, y: 307, w: 184, h: 46 }, side: { x: 146, y: 361, w: 184, h: 46 } },
  { id: 'cams-right-swap', dpad: 64, front: { x: 146, y: 361, w: 184, h: 46 }, side: { x: 146, y: 307, w: 184, h: 46 } },
  { id: 'cams-split', dpad: 170, front: { x: 6, y: 336, w: 108, h: 46 }, side: { x: 226, y: 336, w: 108, h: 46 } },
  { id: 'cams-split-rev', dpad: 170, front: { x: 226, y: 336, w: 108, h: 46 }, side: { x: 6, y: 336, w: 108, h: 46 } },
];
export async function styleLook(style) {
  const pats = splitOf(style, 'claw_two_cams|back-print', PATTERNS, (p) => p, 3), hues = splitOf(style, 'claw_two_cams|scheme-hue', HUES, (h) => String(h), 3);
  const floors = style.pool('tex', (t) => t.use === 'fabric' && !['curly_teddy_checkered', 'gingham_check', 'quatrefoil_jacquard_fabric'].includes(t.id));
  const hdris = style.pool('hdri');
  const [pi, fi, hi] = style.primaryCombo('print-floor-hdri', [pats.length * hues.length, floors.length, hdris.length]);
  const pat = pats[pi % pats.length], hue = hues[Math.floor(pi / pats.length)], fl = floors[fi], hd = hdris[hi], rnd = style.rand;
  style.note(`claw_two_cams|back-print:${pat}`); style.note(`claw_two_cams|scheme-hue:${hue}`); style.note(`tex:${fl.id}`); style.note(`hdri:${hd.id}`);
  const sideItem = style.pick('tex', (t) => ['wood', 'metal', 'wall', 'floor'].includes(t.use) && !/rust|corrugat|brick|grate|shutter/.test(t.id));
  const plushItem = style.pick('tex', (t) => t.use === 'fabric' && !['curly_teddy_checkered', 'gingham_check', 'quatrefoil_jacquard_fabric'].includes(t.id));
  const [TF, sky, TS, TP] = await loadAll([fl, hd, sideItem, plushItem]);
  const bL = 0.42 + 0.25 * rnd(), bS = 0.16 + 0.18 * rnd(), inkLight = rnd() < 0.55, period = 0.05 + 0.04 * rnd(), salt = 1 + Math.floor(rnd() * 99);
  const ground = S3.scaleTo(S3.hueSatColor(hue, bS), bL);
  const ink = inkLight ? S3.scaleTo(S3.hueSatColor(hue, bS * 0.35), Math.min(0.92, bL * 1.45))
    : S3.scaleTo(S3.hueSatColor((hue + (rnd() < 0.5 ? 0 : 180)) % 360, Math.min(0.55, bS + 0.2)), bL * 0.55);
  let side = null;
  for (let k = 0; k < 12 && !side; k++) {
    const neutral = rnd() < 0.3, h2 = (hue + 90 + rnd() * 180) % 360;
    const c = S3.scaleTo(neutral ? S3.limitSat(TS ? TS.mean : [0.5, 0.5, 0.5], 0.08) : S3.hueSatColor(h2, 0.12 + 0.16 * rnd()), 0.3 + 0.35 * rnd());
    if (S3.deltaE(c, ground) >= 25 && S3.deltaE(c, ink) >= 18) side = c;
  }
  if (!side) side = S3.scaleTo([0.5, 0.5, 0.5], S3.lum(ground) > 0.5 ? 0.3 : 0.62);
  let floorC = null;
  for (let k = 0; k < 24 && !floorC; k++) {
    const c = S3.scaleTo(S3.hueSatColor(rnd() * 360, 0.12 + 0.3 * rnd()), 0.12 + 0.33 * rnd());
    if (TOY_LIN.every((t) => S3.deltaE(c, t) >= 18) && S3.deltaE(c, ground) >= 12) floorC = c;
  }
  if (!floorC) floorC = S3.scaleTo([0.5, 0.5, 0.52], 0.2);
  const cab = S3.scaleTo(S3.hueSatColor(rnd() * 360, 0.5), 0.02 + 0.04 * rnd()), cab2 = cab.map((v) => v * 0.6);
  const lightJ = rnd(), clawFin = pickOf(style, 'claw_two_cams|claw-finish', CLAW_FINISHES, (f) => f.id);
  const ui = pickOf(style, 'claw_two_cams|ui-layout', UI_LAYOUTS, (u) => u.id);
  const fm = texMod(TF, { cv: 0.16, texWorld: 0.25, lo: 0.7, hi: 1.3 });
  const sm = TS ? texMod(TS, { cv: 0.1, texWorld: 0.5, lo: 0.8, hi: 1.2 }) : () => 1;
  const pm = TP ? texMod(TP, { cv: 0.12, texWorld: 0.06, lo: 0.75, hi: 1.25 }) : null;
  const walls = {
    back: (u, y, fp, out) => { const k = patternAt(pat, u, y, period, fp, salt); for (let c = 0; c < 3; c++) out[c] = ground[c] + (ink[c] - ground[c]) * k; },
    side: (u, y, fp, out) => { const k = sm(u, y, fp); for (let c = 0; c < 3; c++) out[c] = side[c] * k; },
    front: (u, y, fp, out) => { out[0] = 0.56; out[1] = 0.64; out[2] = 0.7; },
  };
  const floor = (x, z, fp, out) => { const k = fm(x, z, fp); out[0] = floorC[0] * k; out[1] = floorC[1] * k; out[2] = floorC[2] * k; };
  const skyF = S3.skyFn(sky, 0.75);
  const plush = pm
    ? (x, y, z, nx, ny, nz, s, out) => { const ax = Math.abs(nx), ay = Math.abs(ny); const k = ay > 0.6 ? pm(x, z, 0.003) : ax > Math.abs(nz) ? pm(z, y, 0.003) : pm(x, y, 0.003); out[0] = s.col[0] * k; out[1] = s.col[1] * k; out[2] = s.col[2] * k; }
    : (x, y, z, nx, ny, nz, s, out) => { const k = plushNoise(x, y, z); out[0] = s.col[0] * k; out[1] = s.col[1] * k; out[2] = s.col[2] * k; };
  const TINT = clawFin.tint;
  const plain = (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0]; out[1] = s.col[1]; out[2] = s.col[2]; };
  const mats = [
    { c: [1, 1, 1], ks: 0.035, sh: 6, tex: plush },
    { c: [1, 1, 1], ks: 0.75, sh: 110, tex: plain },
    { c: [1, 1, 1], ks: 0.22, sh: 26, tex: plain },
    { c: [1, 1, 1], ks: 0.95, sh: 70, env: 0.55, tex: TINT ? (x, y, z, nx, ny, nz, s, out) => { out[0] = s.col[0] * TINT[0]; out[1] = s.col[1] * TINT[1]; out[2] = s.col[2] * TINT[2]; } : plain },
    { c: [1, 1, 1], ks: 0.35, sh: 40, env: 0.25, tex: plain },
    { c: [1, 1, 1], ks: 0.12, sh: 20, tex: plain },
  ];
  style.note(`side:${sideItem ? sideItem.id : 'plain'}`);
  const A0 = A;
  return {
    mats,
    env: (vk) => {
      const W = WALLMAP[vk];
      return {
        floorY: 0, box: A0, floor, wallMat: { ks: 0, sh: 1, flat: 0.55 },
        walls: [{ ax: 2, pos: -A0, n: 1, tex: walls[W.zneg] }, { ax: 0, pos: -A0, n: 1, tex: walls[W.xneg] }, { ax: 0, pos: A0, n: -1, tex: walls[W.xpos] }],
        sky: skyF,
        outside: (dx, dy, dz, out) => { const t = clamp01(0.5 - dy * 3); for (let c = 0; c < 3; c++) out[c] = cab[c] + (cab2[c] - cab[c]) * t; },
      };
    },
    light: (V) => S3.hdriLight(hd, lightFor(V), { albedo: floorC, total: 1.39, jitter: lightJ }),
    ui,
    ids: { print: pat, hue, floor: fl.id, hdri: hd.id, side: sideItem && sideItem.id, plush: plushItem && plushItem.id, claw: clawFin.id, ui: ui.id },
  };
}

const DROP_T = 0.7;
function syncFx(env) { if (env.submitted && !env.fx) env.fx = { age: 0 }; }
function dropOf(m, st, env) {
  if (!env.fx) return 0;
  const [i, j] = st.claw;
  const t = m.toys.find((u) => u.i === i && u.j === j);
  const stopTip = t ? toyTop(t) * 0.72 : (i === m.chute && j === N - 1) ? 0.15 : 0.03;
  const k = Math.min(1, env.fx.age / DROP_T), e = 1 - (1 - k) * (1 - k);
  return (CLAW.tip - stopTip) * e;
}
function toCanvasSafe(img) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), { width: img.w, height: img.h });
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return c;
}
function camGlyph(g, cx, cy, col, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = col;
  rr(g, -7, -4.5, 10.5, 9, 2); g.fill();
  g.beginPath(); g.moveTo(3.5, -1.5); g.lineTo(7.5, -4); g.lineTo(7.5, 4); g.lineTo(3.5, 1.5); g.closePath(); g.fill();
  g.restore();
}
