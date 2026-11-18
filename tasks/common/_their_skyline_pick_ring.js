import { UI_FONT, ACCENT, rr } from '../core/panel.js';
import { render, toCanvas, contextScale, makeCam, objectStats, shape } from './_seat_view_rt.js';
import { builder, person, plazaEnv, orbitCam, sceneOf, PERSON_LOOKS } from './_seat_view_props.js';

export const BOARD = { w: 500, h: 470 };
export const SCENE_H = 322;
const HER = 9;
export const POSTS = [
  { id: 0, h: 0.5, color: '#e0b23e' },
  { id: 1, h: 0.75, color: '#4f9a42' },
  { id: 2, h: 1.0, color: '#cf4b3a' },
  { id: 3, h: 1.25, color: '#3f6fc0' },
  { id: 4, h: 1.5, color: '#7a4ab0' },
  { id: 5, h: 1.8, color: '#3a3d42' },
];
const NP = POSTS.length, HMAX = 1.8;
export const RULE = {
  R: 0.11,
  dMin: 1.3, dMax: 2.7,
  front: 55,
  back: 125,
  kFront: [2, 3, 4],
  gapDeg: 18,
  latGap: 0.35,
  sep: 0.6,
  el: [36, 50], fov: 32,
  sepPx: 6,
  visPost: 0.85, visHer: 0.9,
  eye: 1.62,
};
const PADX = 0.06 * BOARD.w, PADY = 0.07 * SCENE_H;

const round2 = (v) => Math.round(v * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const DEG = 180 / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;
const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
const seqEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function axes(yaw) { const a = rad(yaw); return { f: [Math.sin(a), Math.cos(a)], r: [-Math.cos(a), Math.sin(a)] }; }
export function rel(yaw, p) {
  const { f, r } = axes(yaw), fwd = p.x * f[0] + p.z * f[1], lat = p.x * r[0] + p.z * r[1];
  return { fwd, lat, th: Math.atan2(lat, fwd) * DEG, d: Math.hypot(p.x, p.z) };
}
export function herView(m) {
  return m.posts.map((p) => ({ id: p.id, ...rel(m.yaw, p) })).filter((q) => q.fwd > 0)
    .sort((a, b) => a.th - b.th || a.id - b.id).map((q) => q.id);
}
export function viewAs(m, dy, mirror = false) {
  const v = herView({ ...m, yaw: norm360(m.yaw + dy) });
  return mirror ? v.slice().reverse() : v;
}
function eyeOrderOk(m) {
  const { f } = axes(m.yaw);
  const cam = makeCam({ eye: [0, RULE.eye, 0], target: [f[0], RULE.eye * 0.75, f[1]], fovY: 100, W: 800, H: 400 });
  const seen = [];
  for (const p of m.posts) {
    const q = cam.project(p.x, 0.4, p.z);
    if (q.z > 0.05) seen.push({ id: p.id, x: q.x });
  }
  const ord = seen.sort((a, b) => a.x - b.x).map((e) => e.id);
  return seqEq(ord, herView(m));
}

function boxOf(cam, pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, z] of pts) { const q = cam.project(x, y, z); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, x1, y0, y1 };
}
function cylPts(x, z, R, h) { const P = []; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; for (const y of [0, h]) P.push([x + R * Math.cos(a), y, z + R * Math.sin(a)]); } return P; }
const postPts = (p) => cylPts(p.x, p.z, RULE.R * 1.2, POSTS[p.id].h);
const herPts = () => cylPts(0, 0, 0.27, 1.8);
function hull(pts) {
  pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop(); return lo.concat(hi);
}
function satGap(A, B) {
  let best = -Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b.y - a.y, ny = a.x - b.x, l = Math.hypot(nx, ny) || 1;
    const pa = A.map((q) => (q.x * nx + q.y * ny) / l), pb = B.map((q) => (q.x * nx + q.y * ny) / l);
    best = Math.max(best, Math.min(...pa) - Math.max(...pb), Math.min(...pb) - Math.max(...pa));
  }
  return best;
}
const projHull = (cam, pts) => hull(pts.map(([x, y, z]) => cam.project(x, y, z)));
export function fitCamera(posts, az, el) {
  const all = [...herPts(), ...posts.flatMap(postPts)];
  const xs = all.map((p) => p[0]), zs = all.map((p) => p[2]);
  const tx = round2((Math.min(...xs) + Math.max(...xs)) / 2), tz = round2((Math.min(...zs) + Math.max(...zs)) / 2);
  for (let dist = 4; dist <= 16; dist = round2(dist + 0.1)) {
    const c = { az, el, dist, fov: RULE.fov, tx, ty: 0.6, tz };
    const E = boxOf(orbitCam(c, BOARD.w, SCENE_H), all);
    if (E.x0 >= PADX && E.x1 <= BOARD.w - PADX && E.y0 >= PADY && E.y1 <= SCENE_H - PADY) return c;
  }
  return null;
}
export const displayCam = (m) => orbitCam(m.camera, BOARD.w, SCENE_H);
export function screenView(m, cam = displayCam(m)) {
  const { f } = axes(m.yaw), H = cam.project(0, 0, 0), A = cam.project(f[0], 0, f[1]);
  let Fx = A.x - H.x, Fy = A.y - H.y; const l = Math.hypot(Fx, Fy) || 1; Fx /= l; Fy /= l;
  const Rx = -Fy, Ry = Fx;
  return m.posts.map((p) => { const q = cam.project(p.x, 0, p.z), dx = q.x - H.x, dy = q.y - H.y; return { id: p.id, a: dx * Fx + dy * Fy, b: dx * Rx + dy * Ry }; })
    .filter((e) => e.a > 0).sort((u, v) => u.b - v.b || u.id - v.id).map((e) => e.id);
}

const SCENES = new WeakMap();
function buildWorld(m) {
  const B = builder();
  person(B, HER, { x: 0, z: 0, yaw: m.yaw, look: PERSON_LOOKS[m.look] });
  for (const p of m.posts) {
    const t = POSTS[p.id], R = RULE.R, paint = B.mat('paint', t.color), stone = B.mat('matte', '#e8e3d8');
    B.add(shape.cyl(p.id, stone, p.x, p.z, 0, 0.05, R * 1.2, 0.01));
    B.add(shape.cyl(p.id, paint, p.x, p.z, 0.05, t.h - 0.03, R, 0.01));
    B.add(shape.cyl(p.id, stone, p.x, p.z, t.h - 0.03, t.h, R * 1.12, 0.01));
  }
  return B;
}
export function sceneFor(m) {
  if (SCENES.has(m)) return SCENES.get(m);
  const sc = sceneOf(buildWorld(m), displayCam(m), plazaEnv());
  SCENES.set(m, sc);
  return sc;
}
export function previewImage(m) { return render(sceneFor(m), 2); }

export function problems(m, layoutOnly = false) {
  const P = [];
  if (!Array.isArray(m.posts) || m.posts.length !== NP || m.posts.map((p) => p.id).sort().join('') !== '012345') return ['posts'];
  if (![m.yaw, ...m.posts.flatMap((p) => [p.x, p.z])].every(Number.isFinite)) return ['numbers'];
  const R = m.posts.map((p) => ({ id: p.id, ...rel(m.yaw, p) }));
  for (const q of R) {
    if (q.d < RULE.dMin - 0.01 || q.d > RULE.dMax + 0.01) P.push('distance');
    const a = Math.abs(q.th);
    if (a > RULE.front + 0.5 && a < RULE.back - 0.5) P.push('side-band');
  }
  const F = R.filter((q) => q.fwd > 0).sort((a, b) => a.th - b.th), Bk = R.filter((q) => q.fwd <= 0);
  if (!RULE.kFront.includes(F.length)) P.push('front-count');
  for (let i = 1; i < F.length; i++) {
    if (F[i].th - F[i - 1].th < RULE.gapDeg - 0.5) P.push('front-gap');
    if (F[i].lat - F[i - 1].lat < RULE.latGap - 0.01) P.push('front-lateral');
  }
  const bth = Bk.map((q) => norm360(q.th)).sort((a, b) => a - b);
  for (let i = 1; i < bth.length; i++) if (bth[i] - bth[i - 1] < RULE.gapDeg - 0.5) P.push('back-gap');
  for (let i = 0; i < NP; i++) for (let j = i + 1; j < NP; j++) {
    const a = m.posts[i], b = m.posts[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < RULE.sep - 0.01) P.push('post-sep');
  }
  if (!eyeOrderOk(m)) P.push('eye-order');
  if (layoutOnly) return [...new Set(P)];
  const want = fitCamera(m.posts, m.camera?.az, m.camera?.el);
  if (!want || ['az', 'el', 'dist', 'fov', 'tx', 'ty', 'tz'].some((k) => want[k] !== m.camera[k])) P.push('camera');
  if (!(m.camera.el >= RULE.el[0] && m.camera.el <= RULE.el[1])) P.push('elevation');
  const cam = displayCam(m), HH = projHull(cam, herPts()), PH = m.posts.map((p) => projHull(cam, postPts(p)));
  for (let i = 0; i < NP; i++) {
    if (satGap(HH, PH[i]) < RULE.sepPx) P.push('her-merge');
    for (let j = i + 1; j < NP; j++) if (satGap(PH[i], PH[j]) < RULE.sepPx) P.push('post-merge');
  }
  const truth = herView(m);
  if (seqEq(viewAs(m, 180), truth) || seqEq(viewAs(m, 0, true), truth) || seqEq(viewAs(m, 180, true), truth)) P.push('decoy-equal');
  if (!Array.isArray(m.answer) || !seqEq(m.answer, truth)) P.push('answer');
  if (P.length) return [...new Set(P)];
  const sc = sceneFor(m);
  for (const p of m.posts) if (objectStats(sc, p.id, 2, true).frac < RULE.visPost) P.push(`occluded${p.id}`);
  if (objectStats(sc, HER, 2, true).frac < RULE.visHer) P.push('occluded-her');
  return [...new Set(P)];
}

function spreadAngles(rng, k, lo, hi, gap) {
  for (let t = 0; t < 400; t++) {
    const a = Array.from({ length: k }, () => rng.uniform(lo, hi)).sort((x, y) => x - y);
    let ok = true;
    for (let i = 1; i < k; i++) if (a[i] - a[i - 1] < gap) { ok = false; break; }
    if (ok) return a;
  }
  return null;
}
function sampleLayout(rng) {
  const yaw = round2(rng.uniform(0, 360)), kF = rng.pick(RULE.kFront), kB = NP - kF;
  const thF = spreadAngles(rng, kF, -RULE.front + 1, RULE.front - 1, RULE.gapDeg + 1);
  const thB = spreadAngles(rng, kB, RULE.back + 1, 360 - RULE.back - 1, RULE.gapDeg + 1);
  if (!thF || !thB) return null;
  const ids = rng.shuffle([0, 1, 2, 3, 4, 5]), near = rng.sign() > 0;
  const { f, r } = axes(yaw), lo = RULE.dMin + 0.02, hi = RULE.dMax - 0.02, mid = (lo + hi) / 2;
  const posts = [...thF, ...thB].map((th, i) => {
    const d = i < kF ? (((i % 2 === 0) === near) ? rng.uniform(lo, mid - 0.15) : rng.uniform(mid + 0.15, hi)) : rng.uniform(lo, hi);
    const c = Math.cos(rad(th)) * d, s = Math.sin(rad(th)) * d;
    return { id: ids[i], x: round2(c * f[0] + s * r[0]), z: round2(c * f[1] + s * r[1]) };
  }).sort((a, b) => a.id - b.id);
  return { yaw, posts };
}
function cameraOk(m) {
  const cam = displayCam(m), HH = projHull(cam, herPts()), PH = m.posts.map((p) => projHull(cam, postPts(p)));
  for (let i = 0; i < NP; i++) {
    if (satGap(HH, PH[i]) < RULE.sepPx) return false;
    for (let j = i + 1; j < NP; j++) if (satGap(PH[i], PH[j]) < RULE.sepPx) return false;
  }
  return true;
}
function sampleOnce(rng, look) {
  const L = sampleLayout(rng);
  if (!L) return null;
  const m = { task: 'their_skyline_pick', ring: 1, board: { ...BOARD }, yaw: L.yaw, look, posts: L.posts, camera: null };
  m.answer = herView(m);
  m.camera = { az: 0, el: RULE.el[0] };
  const pre = problems(m, true);
  if (pre.length) return null;
  for (let c = 0; c < 36; c++) {
    const camera = fitCamera(m.posts, round2(rng.uniform(0, 360)), round2(rng.uniform(RULE.el[0], RULE.el[1])));
    if (!camera) continue;
    m.camera = camera;
    if (!cameraOk(m)) continue;
    const P = problems(m);
    SCENES.delete(m);
    if (!P.length) return m;
  }
  return null;
}
export function generate(rng) {
  const look = rng.pick([0, 2, 4]);
  for (let t = 0; t < 3000; t++) {
    const m = sampleOnce(rng, look);
    if (m) return m;
  }
  return null;
}

const LOW_Y = SCENE_H + 10, LOW_H = BOARD.h - SCENE_H - 14;
const STRIP = { x: 6, y: LOW_Y, w: 292, h: LOW_H };
const PAL = { x: 308, y: LOW_Y, w: BOARD.w - 314, h: LOW_H };
const BAR_MAX = LOW_H - 52;
const barH = (id) => Math.max(10, (POSTS[id].h / HMAX) * BAR_MAX);
const STRIP_PITCH = 44, STRIP_BW = 24;
function stripSlots(n) {
  const x0 = STRIP.x + 22;
  return Array.from({ length: n }, (_, k) => ({ x: x0 + k * STRIP_PITCH, w: STRIP_BW }));
}
const PAL_PITCH = PAL.w / NP;
function palCol(i) { return { x: PAL.x + i * PAL_PITCH, w: PAL_PITCH }; }
const groundY = (R) => R.y + R.h - 26;
export function paletteBarCenter(id) { const c = palCol(id); return { x: c.x + c.w / 2, y: groundY(PAL) - barH(id) / 2 }; }

export function init() { return { seq: [] }; }
export function applyAction(state, a) {
  if (!a || a.op !== 'toggle' || !Number.isInteger(a.id) || a.id < 0 || a.id >= NP) return { ok: false, reason: 'bad-action' };
  const S = state.seq || (state.seq = []), i = S.indexOf(a.id);
  if (i >= 0) { S.splice(i, 1); return { ok: true, placed: false }; }
  S.push(a.id);
  return { ok: true, placed: true };
}
export function verify(state, m) {
  const got = state.seq || [], want = m.answer;
  const ok = seqEq(got, want);
  let same = 0;
  for (let k = 0; k < Math.min(got.length, want.length); k++) if (got[k] === want[k]) same++;
  return { success: ok, error: ok ? 0 : Math.max(got.length, want.length) - same, partial: want.length ? same / Math.max(got.length, want.length) : 0,
    detail: { seq: got.slice(), want: want.slice(), camAz: m.camera.az, yaw: m.yaw } };
}
export function oracle(m) { return m.answer.map((id) => ({ op: 'toggle', id })); }
export function randomPolicy(m, rnd) {
  const k = 2 + Math.floor(rnd() * 3), ids = [0, 1, 2, 3, 4, 5];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, k).map((id) => ({ op: 'toggle', id }));
}
export function pointer(evt, env) {
  if (env.submitted || evt.type !== 'down') return [];
  const S = env.state.seq || [];
  if (evt.y >= PAL.y && evt.y <= PAL.y + PAL.h && evt.x >= PAL.x && evt.x <= PAL.x + PAL.w) {
    const i = Math.min(NP - 1, Math.floor((evt.x - PAL.x) / PAL_PITCH));
    return [{ op: 'toggle', id: i }];
  }
  if (evt.y >= STRIP.y && evt.y <= STRIP.y + STRIP.h) {
    const sl = stripSlots(S.length);
    for (let k = 0; k < S.length; k++) if (evt.x >= sl[k].x - 9 && evt.x <= sl[k].x + sl[k].w + 9) return [{ op: 'toggle', id: S[k] }];
  }
  return [];
}
export function footerStatus(env) {
  const n = (env.state.seq || []).length;
  return n ? `${n} post${n > 1 ? 's' : ''} placed` : 'Tap posts to build her view';
}
function bar(g, x, yBase, w, id, faded = false) {
  const h = barH(id);
  g.save();
  if (faded) g.globalAlpha = 0.28;
  g.fillStyle = POSTS[id].color; rr(g, x, yBase - h, w, h, 3); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + 1, yBase - h + 1, w - 2, 3);
  g.restore();
}
function label(g, text, x, y, align = 'left', col = '#7a8794', size = 11) {
  g.fillStyle = col; g.font = `${size}px ${UI_FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y);
}
export function drawBoard(g, br, env) {
  const m = env.manifest, S = env.state.seq || [], A = env.assets.sky || (env.assets.sky = {});
  const q = contextScale(g), key = `${q}`;
  if (A.m !== m || A.key !== key) { A.m = m; A.key = key; A.canvas = toCanvas(render(sceneFor(m), q)); }
  g.save(); g.translate(br.x, br.y);
  g.drawImage(A.canvas, 0, 0, BOARD.w, SCENE_H);
  g.fillStyle = '#f3f5f8'; g.fillRect(0, SCENE_H, br.w, br.h - SCENE_H);
  g.strokeStyle = '#dde3ea'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, SCENE_H + 0.5); g.lineTo(br.w, SCENE_H + 0.5); g.stroke();
  g.fillStyle = '#ffffff'; rr(g, STRIP.x, STRIP.y, STRIP.w, STRIP.h, 8); g.fill();
  g.strokeStyle = S.length ? ACCENT : '#d3dae2'; g.lineWidth = S.length ? 1.6 : 1.2; rr(g, STRIP.x + 0.5, STRIP.y + 0.5, STRIP.w - 1, STRIP.h - 1, 8); g.stroke();
  label(g, 'Her view', STRIP.x + 10, STRIP.y + 12, 'left', '#4a5561', 12);
  const gy = groundY(STRIP);
  g.strokeStyle = '#b9c3cd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(STRIP.x + 12, gy + 0.5); g.lineTo(STRIP.x + STRIP.w - 12, gy + 0.5); g.stroke();
  label(g, '← her left', STRIP.x + 12, gy + 13);
  label(g, 'her right →', STRIP.x + STRIP.w - 12, gy + 13, 'right');
  const sl = stripSlots(S.length);
  S.forEach((id, k) => bar(g, sl[k].x, gy, sl[k].w, id));
  g.fillStyle = '#ffffff'; rr(g, PAL.x, PAL.y, PAL.w, PAL.h, 8); g.fill();
  g.strokeStyle = '#d3dae2'; g.lineWidth = 1.2; rr(g, PAL.x + 0.5, PAL.y + 0.5, PAL.w - 1, PAL.h - 1, 8); g.stroke();
  label(g, 'Posts', PAL.x + 10, PAL.y + 12, 'left', '#4a5561', 12);
  const py = groundY(PAL);
  g.strokeStyle = '#b9c3cd'; g.beginPath(); g.moveTo(PAL.x + 8, py + 0.5); g.lineTo(PAL.x + PAL.w - 8, py + 0.5); g.stroke();
  for (let i = 0; i < NP; i++) { const c = palCol(i), w = 20; bar(g, c.x + (c.w - w) / 2, py, w, i, S.includes(i)); }
  label(g, 'tap to add / remove', PAL.x + PAL.w / 2, py + 13, 'center');
  g.restore();
}

export function semanticKey(m) {
  const cells = m.posts.map((p) => { const q = rel(m.yaw, p); return `${p.id}:${Math.round(q.th / 30)},${Math.round(q.d / 0.5)}`; });
  return `skyline|ring|${m.answer.join('')}|${cells.join(';')}`;
}
