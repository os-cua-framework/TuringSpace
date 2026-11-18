import { drawPromptText, UI_FONT } from '../core/panel.js';
import { shape, makeScene, orbitCam, plankFloor, plasterWall, softSky, STUDIO_LIGHT, cA, fbm, mixInto,
  render, renderLayer, toCanvas, contextScale } from '../common/_object_rt.js';
import { envLook, texMat, faceOf, pickOf, S3 } from '../common/_rt_look.js';
import { pickTex, splitPick, splitList } from '../common/_rt_kit.js';
import { splitIds, nthOf } from '../core/style.js';

const PROMPT = 'Turn the plug so it fits the socket';
const HINT = 'Use the slider to turn it';
const SLIDER_HINT = 'Slide to turn the plug';
const BOARD = { w: 340, h: 320 };
const SCENE_H = 272;
const LEGEND = { x: 14, y: 280, w: BOARD.w - 28, h: 32 };

const START_CLEARANCE = 20;
const ANG_TOL = 5;
const MIN_SEP = 20;
const LONG_LEN = 0.24;
const NEAR_LEN = 0.18;
const NEAR_MARGIN = 9;
const OFF_DEG = [18, 26];
const SETTLE_MS = 200;
const LOW_Q = 0.5;
const CAM = { az: 30, el: 34, dist: 3.6, fov: 30, tx: 0, ty: 0.48, tz: 0 };

const R_SOCK = 0.52, H_SOCK = 0.24, TOP_Y = H_SOCK;
const R_PLUG = 0.3, H_PLUG = 0.3, FLOAT_GAP = 0.6;
const KEY_LEN = 0.15, TAB_LEN = 0.1;

const rad = (d) => (d * Math.PI) / 180;
const round2 = (v) => Math.round(v * 100) / 100;
const norm360 = (d) => ((d % 360) + 360) % 360;
function angErr(a, b) { let d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; }

function seatOk(theta, keyways, tol) {
  const keyAz = norm360(theta), tabAz = norm360(theta + 180);
  const keyOk = keyways.some((k) => k.deep && angErr(keyAz, k.az) <= tol);
  const tabOk = keyways.some((k) => k.pocket && angErr(tabAz, k.az) <= tol);
  return keyOk && tabOk;
}

function seatWindows(keyways, tol) {
  const N = 1440, step = 360 / N, arr = new Array(N);
  let cnt = 0, cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    const t = i * step, s = seatOk(t, keyways, tol);
    arr[i] = s;
    if (s) { cnt++; cx += Math.cos(rad(t)); cy += Math.sin(rad(t)); }
  }
  let runs = 0;
  for (let i = 0; i < N; i++) if (arr[i] && !arr[(i - 1 + N) % N]) runs++;
  return { count: runs, width: cnt * step, center: norm360((Math.atan2(cy, cx) * 180) / Math.PI) };
}

function contractOk(m, tol = ANG_TOL) {
  if (!m || m.task !== 'keyway_roll_align') return false;
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!m.plug || m.plug.key !== 0 || m.plug.tab !== 180 || m.tol !== tol) return false;
  const K = m.keyways;
  if (!Array.isArray(K) || K.length < 4) return false;
  for (const k of K) {
    if (!Number.isFinite(k.az)) return false;
    if (!k.deep && slotLen(k) > LONG_LEN - 0.05) return false;
  }
  const pocket = K.filter((k) => k.pocket);
  if (pocket.length < 1) return false;
  if (pocket.some((k) => !k.deep)) return false;
  const w = seatWindows(K, tol);
  if (w.count !== 1) return false;
  if (w.width < 2 * tol - 2 || w.width > 2 * tol + 2) return false;
  const A = answerSlot(m);
  if (!A || A.pocket || angErr(w.center, A.az) > 1.5) return false;
  const tw = K.find((k) => k.pocket && angErr(k.az, norm360(A.az + 180)) <= 1);
  if (!tw) return false;
  for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++)
    if (angErr(K[i].az, K[j].az) < MIN_SEP - 0.5) return false;
  for (const k of K) if (!k.deep) {
    if (k.pocket) return false;
    if (angErr(k.az, A.az) < tol + 12 || angErr(k.az, tw.az) < tol + 12) return false;
  }
  for (const d of K) if (d.deep && d !== A)
    for (const p of pocket) if (angErr(norm360(d.az + 180), p.az) < tol + NEAR_MARGIN) return false;
  if (!Number.isFinite(m.plug.roll0) || angErr(m.plug.roll0, A.az) < START_CLEARANCE - 0.01) return false;
  if (!seatOk(A.az, K, tol) || seatOk(tw.az, K, tol)) return false;
  return true;
}

function answerSlot(m) {
  return m.keyways.find((k) => k.deep && seatOk(k.az, m.keyways, m.tol));
}

const BENCH = { tol: 9, majorWin: 30, screen: [18, 22], otherScreen: 18, sep: 18, off: [20, 50], rClear: 30, nNoPocketLong: 3 };
const MAJOR_AZ = [norm360(CAM.az + 90), norm360(CAM.az - 90)];
let CAM0 = null;
const cam0 = () => (CAM0 ??= orbitCam(CAM, BOARD.w, SCENE_H));
function screenAz(az, r = 0.4) {
  const c = cam0(), o = c.project(0, TOP_Y, 0), p = c.project(Math.sin(rad(az)) * r, TOP_Y, Math.cos(rad(az)) * r);
  return norm360((Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI);
}
const screenDev = (slotAz, pocketAz) => angErr(screenAz(pocketAz), screenAz(slotAz) + 180);
const screenSep = (a, b) => angErr(screenAz(a), screenAz(b));
const circMid = (a, b) => norm360((Math.atan2(Math.sin(rad(a)) + Math.sin(rad(b)), Math.cos(rad(a)) + Math.cos(rad(b))) * 180) / Math.PI);
function plugBottomY(roll) {
  const c = cam0(), y0 = TOP_Y + FLOAT_GAP, ys = [];
  for (let i = 0; i < 32; i++) { const a = (i * Math.PI) / 16; ys.push(c.project(Math.sin(a) * R_PLUG, y0, Math.cos(a) * R_PLUG).y); }
  const midY = y0 + H_PLUG / 2;
  for (const [az, len, hw, hh] of [[roll, KEY_LEN, 0.05, 0.055], [roll + 180, TAB_LEN, 0.04, 0.045]]) {
    const a = rad(az), r1 = R_PLUG + len - 0.02;
    for (const r of [R_PLUG - 0.02, r1]) for (const s of [-hw, hw]) for (const dy of [-hh, hh]) {
      const x = Math.sin(a) * r + Math.cos(a) * s, z = Math.cos(a) * r - Math.sin(a) * s;
      ys.push(c.project(x, midY + dy, z).y);
    }
  }
  return Math.max(...ys);
}
function slotTopY(k) {
  const c = cam0(), a = rad(k.az), r1 = R_SOCK - 0.02, r0 = r1 - slotLen(k);
  let y = Infinity;
  for (let i = 0; i <= 8; i++) { const r = r0 + ((r1 - r0) * i) / 8; for (const s of [-0.04, 0.04]) y = Math.min(y, c.project(Math.sin(a) * r + Math.cos(a) * s, TOP_Y, Math.cos(a) * r - Math.sin(a) * s).y); }
  return y;
}
function b2Parts(m) {
  const K = m.keyways, A = answerSlot(m);
  if (!A) return null;
  const free = K.filter((k) => k.deep && !k.pocket);
  if (free.length !== BENCH.nNoPocketLong || !free.includes(A)) return null;
  const pockets = K.filter((k) => k.pocket);
  let dec = null;
  for (const q of free) if (q !== A) for (const p of pockets) {
    const w = angErr(norm360(q.az + 180), p.az), sd = screenDev(q.az, p.az), mid = circMid(q.az, norm360(p.az + 180));
    if (w >= BENCH.off[0] - 0.5 && w <= BENCH.off[1] + 0.5 && sd >= BENCH.screen[0] && sd <= BENCH.screen[1]
      && MAJOR_AZ.some((x) => angErr(mid, x) <= BENCH.majorWin)) { dec = { q, p, sd }; break; }
  }
  if (!dec) return null;
  const r = free.find((k) => k !== A && k !== dec.q && K.every((o) => o === k || angErr(o.az, norm360(k.az + 180)) >= BENCH.rClear));
  return r ? { A, q: dec.q, p: dec.p, r, sd: dec.sd } : null;
}
function b2Ok(m) {
  if (!contractOk(m, BENCH.tol) || m.ext || m.cam) return false;
  const P = b2Parts(m);
  if (!P) return false;
  for (const d of m.keyways) if (d.deep && d !== P.A)
    for (const p of m.keyways) if (p.pocket && p !== d && !(d === P.q && p === P.p) && screenDev(d.az, p.az) < BENCH.otherScreen) return false;
  const tw = m.keyways.find((k) => k.pocket && angErr(k.az, norm360(P.A.az + 180)) <= 1);
  for (const k of m.keyways) {
    if (k !== P.A && screenSep(k.az, P.A.az) < BENCH.sep) return false;
    if (k !== tw && screenSep(k.az, tw.az) < BENCH.sep) return false;
  }
  const pb = plugBottomY(m.plug.roll0);
  if ([P.A, P.q, P.r].some((k) => slotTopY(k) < pb + 2)) return false;
  return true;
}

export function gate(m) { return m && m.ext ? contractOk(m) : b2Ok(m); }

function tryBuild(rng) {
  const A = round2(rng.uniform(0, 360));
  const twin = round2(norm360(A + 180));
  const keyways = [
    { id: 0, az: A, deep: true, pocket: false, depth: 1 },
    { id: 1, az: twin, deep: true, pocket: true, depth: 1 },
  ];
  const free = (az) => keyways.every((k) => angErr(az, k.az) >= MIN_SEP + 1);
  const add = (o) => keyways.push({ id: keyways.length, ...o });
  let ok = false;
  for (let t = 0; t < 200 && !ok; t++) {
    const p = round2(rng.uniform(0, 360)), o = round2(norm360(p + 180));
    if (!free(p) || !free(o)) continue;
    add({ az: p, deep: true, pocket: true, depth: 1 });
    add({ az: o, deep: false, pocket: false, depth: 0.8, len: NEAR_LEN });
    ok = true;
  }
  if (!ok) return null;
  ok = false;
  for (let t = 0; t < 200 && !ok; t++) {
    const p = round2(rng.uniform(0, 360)), q = round2(norm360(p + 180 + rng.sign() * rng.uniform(OFF_DEG[0], OFF_DEG[1])));
    if (!free(p) || !free(q) || angErr(p, q) < MIN_SEP + 1) continue;
    add({ az: p, deep: true, pocket: true, depth: 1 });
    add({ az: q, deep: true, pocket: false, depth: 1 });
    ok = true;
  }
  if (!ok) return null;
  const extra = rng.int(1, 2), base = keyways.length;
  for (let t = 0; keyways.length < base + extra && t < 240; t++) {
    const az = round2(rng.uniform(0, 360));
    if (free(az)) add({ az, deep: false, pocket: false, depth: round2(rng.uniform(0.35, 0.58)) });
  }
  if (keyways.length < base + 1) return null;
  const order = rng.shuffle(keyways.map((_, i) => i));
  keyways.forEach((k, i) => { k.id = order[i]; });
  keyways.sort((a, b) => a.id - b.id);
  const roll0 = round2(norm360(A + rng.uniform(START_CLEARANCE, 360 - START_CLEARANCE)));
  const m = { task: 'keyway_roll_align', board: BOARD, keyways, plug: { roll0, key: 0, tab: 180 }, tol: ANG_TOL };
  return contractOk(m) ? m : null;
}

function tryBuildBench(rng) {
  const A = round2(rng.uniform(0, 360));
  const twin = round2(norm360(A + 180));
  const keyways = [
    { id: 0, az: A, deep: true, pocket: false, depth: 1 },
    { id: 1, az: twin, deep: true, pocket: true, depth: 1 },
  ];
  const blanks = [];
  const free = (az) => keyways.every((k) => angErr(az, k.az) >= MIN_SEP + 1) && blanks.every((b) => angErr(az, b) >= BENCH.rClear + 0.5)
    && screenSep(az, A) >= BENCH.sep + 0.5 && screenSep(az, twin) >= BENCH.sep + 0.5;
  const add = (o) => keyways.push({ id: keyways.length, ...o });
  let ok = false;
  for (let t = 0; t < 400 && !ok; t++) {
    const mid = norm360(rng.pick(MAJOR_AZ) + rng.uniform(-BENCH.majorWin + 1, BENCH.majorWin - 1));
    const s = rng.sign(), d = rng.uniform(BENCH.off[0], BENCH.off[1]);
    const q = round2(norm360(mid + (s * d) / 2)), p = round2(norm360(mid - (s * d) / 2 + 180));
    if (!free(p) || !free(q) || angErr(p, q) < MIN_SEP + 1) continue;
    const sd = screenDev(q, p);
    if (sd < BENCH.screen[0] + 0.2 || sd > BENCH.screen[1] - 0.2) continue;
    add({ az: p, deep: true, pocket: true, depth: 1 });
    add({ az: q, deep: true, pocket: false, depth: 1 });
    ok = true;
  }
  if (!ok) return null;
  ok = false;
  for (let t = 0; t < 400 && !ok; t++) {
    const r = round2(rng.uniform(0, 360)), o = norm360(r + 180);
    if (!free(r) || keyways.some((k) => angErr(k.az, o) < BENCH.rClear + 0.5)) continue;
    add({ az: r, deep: true, pocket: false, depth: 1 });
    blanks.push(o);
    ok = true;
  }
  if (!ok) return null;
  ok = false;
  for (let t = 0; t < 400 && !ok; t++) {
    const p = round2(rng.uniform(0, 360)), o = round2(norm360(p + 180));
    if (!free(p) || !free(o)) continue;
    add({ az: p, deep: true, pocket: true, depth: 1 });
    add({ az: o, deep: false, pocket: false, depth: 0.8, len: NEAR_LEN });
    ok = true;
  }
  if (!ok) return null;
  const extra = rng.int(1, 2), base = keyways.length;
  for (let t = 0; keyways.length < base + extra && t < 400; t++) {
    const az = round2(rng.uniform(0, 360));
    if (free(az)) add({ az, deep: false, pocket: false, depth: round2(rng.uniform(0.35, 0.58)) });
  }
  if (keyways.length < base + 1) return null;
  const order = rng.shuffle(keyways.map((_, i) => i));
  keyways.forEach((k, i) => { k.id = order[i]; });
  keyways.sort((a, b) => a.id - b.id);
  const roll0 = round2(norm360(A + rng.uniform(START_CLEARANCE, 360 - START_CLEARANCE)));
  const m = { task: 'keyway_roll_align', board: BOARD, keyways, plug: { roll0, key: 0, tab: 180 }, tol: BENCH.tol };
  return b2Ok(m) ? m : null;
}

const COL = { socket: cA('#c9ccd0'), slot: cA('#2b2f35'), pocket: cA('#8a6cc4'), plug: cA('#c4513f'), key: cA('#e0973a'), tab: cA('#8a6cc4') };
const MATS = [
  { c: COL.socket, ks: 0.35, sh: 45, env: 0.12, tex: (x, y, z, nx, ny, nz, s, out) => { const g = fbm(x * 18, z * 18 + y * 9, 2); mixInto(out, COL.socket, COL.socket.map((v) => v * 0.86), 0.5 * g); } },
  { c: COL.slot, ks: 0.05, sh: 10 },
  { c: COL.pocket, ks: 0.25, sh: 30 },
  { c: COL.plug, ks: 0.4, sh: 50, env: 0.1 },
  { c: COL.key, ks: 0.4, sh: 50 },
  { c: COL.tab, ks: 0.4, sh: 50 },
];
const slotLen = (k) => (k.deep ? LONG_LEN : Number.isFinite(k.len) ? k.len : round2((7 + k.depth * 9) / 100));
function socketShapes(m, out) {
  out.push(shape.cyl(1, 0, 0, 0, 0, H_SOCK, R_SOCK, 0.02));
  out.push(shape.cyl(1, 1, 0, 0, TOP_Y - 0.01, TOP_Y + 0.004, 0.27, 0));
  for (const k of m.keyways) {
    const len = slotLen(k), cr = R_SOCK - len / 2 - 0.02, a = rad(k.az);
    out.push(shape.box(1, 1, Math.sin(a) * cr, TOP_Y, Math.cos(a) * cr, 0.04, 0.006, len / 2, k.az, 0));
    if (k.pocket) {
      const pr = cr - len / 2 + 0.035;
      out.push(shape.box(1, 2, Math.sin(a) * pr, TOP_Y + 0.012, Math.cos(a) * pr, 0.035, 0.012, 0.035, k.az, 0.006));
    }
  }
}
function plugShapes(roll, out) {
  const baseY = TOP_Y + FLOAT_GAP, midY = baseY + H_PLUG / 2;
  const kR = rad(roll), tR = rad(roll + 180), kcr = R_PLUG + KEY_LEN / 2 - 0.02, tcr = R_PLUG + TAB_LEN / 2 - 0.02;
  out.push(shape.cyl(2, 3, 0, 0, baseY, baseY + H_PLUG, R_PLUG, 0.025));
  out.push(shape.box(2, 4, Math.sin(kR) * kcr, midY, Math.cos(kR) * kcr, 0.05, 0.055, KEY_LEN / 2, roll, 0.012));
  out.push(shape.box(2, 5, Math.sin(tR) * tcr, midY, Math.cos(tR) * tcr, 0.04, 0.045, TAB_LEN / 2, roll + 180, 0.01));
}
const ENV = { floorY: 0, floor: plankFloor({ plank: 0.2, plankL: 1.6, base: '#a47a52', dark: '#8b6440', light: '#b88c62' }), wallZ: -3.2, wall: plasterWall('#e6e2da'), sky: softSky };
const LIGHT = { ...STUDIO_LIGHT, dir: [-0.3, 1, 0.42] };
const camera = () => orbitCam(CAM, BOARD.w, SCENE_H);
const camOf = (m) => (m && m.cam ? orbitCam({ ...CAM, az: m.cam.az, el: m.cam.el, dist: m.cam.dist,
  tx: Math.cos(rad(m.cam.az)) * (m.cam.pan || 0), tz: -Math.sin(rad(m.cam.az)) * (m.cam.pan || 0) }, BOARD.w, SCENE_H) : camera());
function sceneOf(m, roll, withPlug) {
  const shapes = [];
  socketShapes(m, shapes);
  if (withPlug) plugShapes(roll, shapes);
  return makeScene({ cam: camOf(m), shapes, mats: MATS, env: ENV, light: LIGHT });
}
function plugRect(m) {
  const cam = camOf(m), r = R_PLUG + KEY_LEN + 0.02, pts = [];
  for (let i = 0; i < 16; i++) for (const y of [TOP_Y + FLOAT_GAP, TOP_Y + FLOAT_GAP + H_PLUG]) {
    const a = i * Math.PI / 8; pts.push(cam.project(Math.sin(a) * r, y, Math.cos(a) * r));
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs) - 3, y: Math.min(...ys) - 3, w: Math.max(...xs) - Math.min(...xs) + 6, h: Math.max(...ys) - Math.min(...ys) + 6 };
}

const EVAL_KEYS = new Set(['keyway_roll_align|P12,s3,s9|r4', 'keyway_roll_align|P12,s19,s3,s4|r11', 'keyway_roll_align|P12,s2,s21|r10',
  'keyway_roll_align|P12,s17,s21|r6', 'keyway_roll_align|P12,s17,s3,s8|r4', 'keyway_roll_align|P12,s14,s22|r11', 'keyway_roll_align|P12,s15,s20,s22|r8',
  'keyway_roll_align|P12,s15,s19,s3|r5', 'keyway_roll_align|P12,s2,s22|r3', 'keyway_roll_align|P12,s16,s3,s6|r11', 'keyway_roll_align|P12,s3,s8|r11',
  'keyway_roll_align|P12,s21,s6,s8|r7']);
const binD = (a, b) => Math.min((a - b + 24) % 24, (b - a + 24) % 24);
const layoutKey = (bins, rb) => `keyway_roll_align|${['P12', ...bins.map((b) => `s${b}`)].sort().join(',')}|r${rb}`;
const EXT_LAYOUTS = (() => {
  const lists = { 1: [], 2: [] }, seen = new Set();
  const free = (b, used) => binD(b, 0) >= 2 && binD(b, 12) >= 2 && used.every((u) => binD(b, u) >= 2);
  for (const near of [2, 3, 21, 22]) for (let rb = 1; rb <= 11; rb++) {
    for (let e1 = 0; e1 < 24; e1++) {
      if (!free(e1, [near])) continue;
      for (const e2 of [null, ...Array.from({ length: 24 }, (_, i) => i)]) {
        if (e2 !== null && (e2 <= e1 || !free(e2, [near, e1]))) continue;
        const bins = e2 === null ? [near, e1] : [near, e1, e2], k = layoutKey(bins, rb);
        if (seen.has(k) || EVAL_KEYS.has(k)) continue;
        seen.add(k); lists[bins.length - 1].push({ near, extra: bins.slice(1), rb, k });
      }
    }
  }
  const split = (L, tag) => { const f = splitIds(`keyway_roll_align|layout${tag}`, L.map((e) => e.k), 2); return { train: L.filter((e) => f(e.k) === 'train'), test: L.filter((e) => f(e.k) === 'test') }; };
  return { 1: split(lists[1], 1), 2: split(lists[2], 2) };
})();
function generateExt(rng, knobs) {
  const n = Number(knobs.n) || 1, cnt = n % 2 ? 1 : 2, L = EXT_LAYOUTS[cnt][knobs.ext === 'test' ? 'test' : 'train'];
  const E = L[nthOf(`keyway_roll_align|${knobs.ext}|layout${cnt}`, Math.ceil(n / 2), L.length)];
  const inBin = (A, b, lo = -7.4, hi = 7.4) => round2(norm360(A + b * 15 + rng.uniform(lo, hi)));
  for (let attempt = 0; attempt < 4000; attempt++) {
    const A = round2(rng.uniform(0, 360)), twin = round2(norm360(A + 180));
    const keyways = [{ id: 0, az: A, deep: true, pocket: false, depth: 1 }, { id: 1, az: twin, deep: true, pocket: true, depth: 1 }];
    const nr = E.near === 2 ? [30, 37.4] : E.near === 3 ? [37.6, 48] : E.near === 22 ? [-37.4, -30] : [-48, -37.6];
    keyways.push({ id: 2, az: round2(norm360(A + rng.uniform(nr[0], nr[1]))), deep: false, pocket: false, depth: round2(rng.uniform(0.42, 0.6)) });
    for (const b of E.extra) keyways.push({ id: keyways.length, az: inBin(A, b), deep: false, pocket: false, depth: round2(rng.uniform(0.35, 0.58)) });
    const lo = Math.max(START_CLEARANCE, E.rb * 30 - 14.9), hi = Math.min(360 - START_CLEARANCE, E.rb * 30 + 14.9);
    const roll0 = round2(norm360(A + rng.uniform(lo, hi)));
    const m = { task: 'keyway_roll_align', board: BOARD, keyways, plug: { roll0, key: 0, tab: 180 }, tol: ANG_TOL };
    if (!contractOk(m) || semanticKey(m) !== E.k) continue;
    m.cam = { az: round2(rng.uniform(0, 360)), el: CAM.el, dist: CAM.dist, pan: round2(rng.sign() * rng.uniform(0.08, 0.26)) };
    m.ext = knobs.ext;
    return m;
  }
  throw new Error('keyway_roll_align: no instance for layout ' + E.k);
}

const PLUG_COLS = ['#c4513f', '#5a6470', '#2f4f6f', '#3f6a4a', '#e6e2d8', '#2b2b2e', '#7a8a96', '#8a3a34'];
const NAMED = [[2, 20], [32, 18], [268, 40]];
async function styleLook(style) {
  const rnd = style.rand;
  const env = await envLook(style, { tag: 'keyway_roll_align', settings: ['boards', 'workshop', 'lobby', 'hall', 'plaza'], base: LIGHT,
    tileSizes: [0.3, 0.4, 0.5], L: [0.2, 0.42], wall: true, plank: [0.14, 0.24], named: [[268, 40]] });
  const sp = (pool, list) => splitPick(style, `keyway_roll_align|${pool}`, list);
  const body = sp('socket', ['round', 'square', 'taper', 'plate']);
  const sm = pickTex(style, (t) => (t.use === 'metal' && /metal_plate|corrugated_iron$|painted_metal/.test(t.id)) || (t.use === 'stone' && /slab|surface|sandstone_brick|seaworn/.test(t.id) && !/tile/.test(t.id))
    || (t.use === 'floor' && /concrete|plaster|cement/.test(t.id) && !/pavement|hexagonal|plasterbrick/.test(t.id)) || (t.use === 'wood' && /oak|fine|plywood|table|kitchen/.test(t.id)), (t) => t.use === 'floor');
  const ST = await S3.loadTexture(sm.file);
  const sockFace = S3.keepNamedHues(faceOf(ST.mean, 0.42 + 0.22 * rnd(), { maxSat: 0.1, warmSat: 0.2 }), NAMED, 0.06, 0.15);
  const metal = sm.use === 'metal';
  const socket = texMat(ST, sockFace, { texWorld: 0.9, cv: 0.16, keep: 0.3, ks: metal ? 0.4 : 0.2, sh: metal ? 50 : 30, env: metal ? 0.12 : 0.05 });
  const plugC = sp('plug', PLUG_COLS), knob = rnd() < 0.5;
  const PROPS = splitList(style, 'keyway_roll_align|prop', ['toolbox', 'mug', 'papers', 'can', 'block', 'jar'], 2);
  const PCOL = splitList(style, 'keyway_roll_align|propcol', ['#4a6a8a', '#8a3a34', '#3f6a4a', '#d8d2c4', '#2b2b2e', '#b8a070', '#6a6f78'], 2);
  const props = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ kind: pickOf(rnd, PROPS), side: rnd() < 0.5 ? -1 : 1, a: 25 + 50 * rnd(), r: 1.05 + 0.5 * rnd(), yaw: 360 * rnd(), col: pickOf(rnd, PCOL) }));
  props.forEach((p) => style.note(`keyway_roll_align|prop:${p.kind}`));
  const mats = [socket, MATS[1], MATS[2], { c: cA(plugC), ks: 0.4, sh: 50, env: 0.1 }, MATS[4], MATS[5], { c: cA('#3a3d42'), ks: 0.3, sh: 40 },
    ...props.map((p) => ({ c: cA(p.col), ks: 0.2, sh: 30 })), { c: cA('#e8e4dc'), ks: 0.1, sh: 20 }];
  style.note(`tex:${sm.id}`);
  return { key: style.key, env, mats, body, knob, props, ids: { ...env.ids, socket: body, socketTex: sm.id, plug: plugC, props: props.map((p) => p.kind) } };
}
function sceneStyled(m, roll, withPlug, look) {
  const shapes = [];
  if (look.body === 'round') shapes.push(shape.cyl(1, 0, 0, 0, 0, H_SOCK, R_SOCK, 0.02));
  else if (look.body === 'square') shapes.push(shape.box(1, 0, 0, H_SOCK / 2, 0, R_SOCK + 0.03, H_SOCK / 2, R_SOCK + 0.03, 0, 0.025));
  else if (look.body === 'taper') { shapes.push(shape.frustum(1, 0, 0, 0, 0, H_SOCK - 0.02, R_SOCK + 0.1, R_SOCK)); shapes.push(shape.cyl(1, 0, 0, 0, H_SOCK - 0.02, H_SOCK, R_SOCK, 0.01)); }
  else { shapes.push(shape.box(1, 0, 0, 0.03, 0, R_SOCK + 0.12, 0.03, R_SOCK + 0.12, 0, 0.01)); shapes.push(shape.cyl(1, 0, 0, 0, 0.06, H_SOCK, R_SOCK, 0.02)); }
  const tmp = [];
  socketShapes(m, tmp);
  shapes.push(...tmp.slice(1));
  const az = m.cam ? m.cam.az : CAM.az, white = 7 + look.props.length;
  look.props.forEach((p, i) => {
    const a = rad(az + 180 + p.side * p.a), X = Math.sin(a) * p.r, Z = Math.cos(a) * p.r, mi = 7 + i;
    if (p.kind === 'toolbox') { shapes.push(shape.box(3, mi, X, 0.11, Z, 0.24, 0.11, 0.12, p.yaw, 0.02)); shapes.push(shape.box(3, 6, X, 0.25, Z, 0.1, 0.02, 0.02, p.yaw, 0.01)); }
    else if (p.kind === 'mug') { shapes.push(shape.cyl(3, mi, X, Z, 0, 0.12, 0.05, 0.01)); }
    else if (p.kind === 'papers') { for (let k = 0; k < 4; k++) shapes.push(shape.box(3, white, X + 0.01 * k, 0.006 + 0.012 * k, Z, 0.15, 0.006, 0.105, p.yaw + 7 * k, 0)); }
    else if (p.kind === 'can') { shapes.push(shape.cyl(3, mi, X, Z, 0, 0.2, 0.07, 0.01)); shapes.push(shape.cyl(3, 6, X, Z, 0.2, 0.215, 0.072, 0.005)); }
    else if (p.kind === 'block') { shapes.push(shape.box(3, mi, X, 0.08, Z, 0.16, 0.08, 0.08, p.yaw, 0.01)); }
    else { shapes.push(shape.cyl(3, white, X, Z, 0, 0.22, 0.065, 0.01)); shapes.push(shape.cyl(3, mi, X, Z, 0.22, 0.26, 0.068, 0.01)); }
  });
  if (withPlug) {
    plugShapes(roll, shapes);
    if (look.knob) { const y = TOP_Y + FLOAT_GAP + H_PLUG; shapes.push(shape.cyl(2, 6, 0, 0, y, y + 0.07, 0.09, 0.015)); }
  }
  return makeScene({ cam: camOf(m), shapes, mats: look.mats, env: { floorY: 0, floor: look.env.floor, wallZ: -3.2, wall: look.env.wall, sky: look.env.sky }, light: look.env.light });
}

const task = {
  meta: {
    name: 'keyway_roll_align', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'slider', board: BOARD, uses3d: true,
    sliderHint: SLIDER_HINT,
    actionSpace: [{ op: 'slide', v: '0..1 (track fraction; turns the plug v*360 deg from its start roll)', final: 'true on release (Verify submits; the slider can be moved again)' }],
    promptHuman: 'Turn the plug with the slider so it fits the socket (orange key into a long slot, purple tab into the purple pocket)',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs);
    for (let attempt = 0; attempt < 240; attempt++) {
      const m = tryBuildBench(rng);
      if (m) return m;
    }
    throw new Error('keyway_roll_align: no valid keyways');
  },

  init(m) { return { v: 0, roll: m.plug.roll0, sliding: false, released: false }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'slide') return { ok: false, reason: 'bad-op' };
    if (!Number.isFinite(action.v)) return { ok: false, reason: 'bad-v' };
    state.v = Math.min(1, Math.max(0, action.v));
    state.roll = norm360(m.plug.roll0 + state.v * 360);
    if (action.final) { state.released = true; state.sliding = false; }
    else state.sliding = true;
    return { ok: true };
  },

  verify(state, m) {
    const seated = state.released !== false && seatOk(state.roll, m.keyways, m.tol);
    return { success: seated, error: seated ? 0 : 1, partial: seated ? 1 : 0, detail: { roll: round2(state.roll), v: +Number(state.v || 0).toFixed(4) } };
  },

  oracle(m) {
    const A = answerSlot(m).az;
    return [{ op: 'slide', v: +(norm360(A - m.plug.roll0) / 360).toFixed(4), final: true }];
  },

  randomPolicy(m, rnd) { return [{ op: 'slide', v: +rnd().toFixed(4), final: true }]; },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  onSlider(env, v, phase, hooks) {
    if (phase === 'move' || phase === 'down') hooks.dispatch({ op: 'slide', v });
    else if (phase === 'up') hooks.dispatch({ op: 'slide', v, final: true });
  },

  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, HINT); },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const C = (this._cache ??= {}), q = contextScale(g);
    const look = env.style ? env.assets?.look : null;
    g.save(); g.translate(br.x, br.y);
    const skey = JSON.stringify(m.keyways) + q + (look ? `|${look.key}|${JSON.stringify(m.cam || null)}` : '');
    if (C.skey !== skey) { C.skey = skey; const img = render(look ? sceneStyled(m, 0, false, look) : sceneOf(m, 0, false), q); C.base = toCanvas(img); C.plug = null; C.pkey = null; }
    g.drawImage(C.base, 0, 0, BOARD.w, SCENE_H);
    const cam = camOf(m), c0 = cam.project(-0.06, TOP_Y + 0.005, -0.05), ex = cam.project(R_PLUG * 0.95 - 0.06, TOP_Y + 0.005, -0.05);
    const rx = Math.abs(ex.x - c0.x), grad = g.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, rx);
    grad.addColorStop(0, 'rgba(20,24,30,.28)'); grad.addColorStop(1, 'rgba(20,24,30,0)');
    g.save(); g.translate(c0.x, c0.y); g.scale(1, 0.5); g.translate(-c0.x, -c0.y);
    g.fillStyle = grad; g.beginPath(); g.arc(c0.x, c0.y, rx, 0, Math.PI * 2); g.fill(); g.restore();
    const now = performance.now();
    if (C.roll !== st.roll) { C.roll = st.roll; C.moveT = now; }
    const moving = st.sliding && now - (C.moveT || 0) < SETTLE_MS;
    const pq = moving ? Math.max(LOW_Q, q / 3) : q;
    C.plugLow = pq !== q;
    const pkey = `${round2(st.roll)}|${pq}` + (look ? `|${look.key}` : '');
    if (C.pkey !== pkey) {
      C.pkey = pkey;
      const sc = look ? sceneStyled(m, st.roll, true, look) : sceneOf(m, st.roll, true), img = renderLayer(sc, pq, plugRect(m), new Set([2]));
      C.plug = { canvas: toCanvas(img), img };
    }
    const L = C.plug.img;
    g.drawImage(C.plug.canvas, L.x, L.y, L.bw, L.bh);
    g.fillStyle = '#f4f6f8'; g.beginPath(); g.roundRect?.(LEGEND.x, LEGEND.y, LEGEND.w, LEGEND.h, 8); g.fill();
    g.font = `500 12px ${UI_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    const cy = LEGEND.y + LEGEND.h / 2;
    g.fillStyle = '#e0973a'; g.fillRect(LEGEND.x + 12, cy - 5, 14, 10);
    g.fillStyle = '#455466'; g.fillText('key → long slot', LEGEND.x + 32, cy);
    g.fillStyle = '#8a6cc4'; g.fillRect(LEGEND.x + 160, cy - 5, 10, 10);
    g.fillStyle = '#455466'; g.fillText('tab → purple pocket', LEGEND.x + 176, cy);
    g.restore();
  },

  pointer() { return []; },

  tick() { return !!this._cache?.plugLow; },

  footerStatus(env) { return env.state.released ? 'Verify when it fits' : ''; },
};

export default task;

export function semanticKey(m) {
  const Ak = answerSlot(m), A = Ak.az;
  const rel = (az) => ((az - A) % 360 + 360) % 360;
  const slots = m.keyways.filter((k) => k !== Ak).map((k) => `${k.pocket ? 'P' : k.deep ? 'L' : Number.isFinite(k.len) ? 'm' : 's'}${Math.round(rel(k.az) / 15) % 24}`).sort().join(',');
  return `keyway_roll_align|${slots}|r${Math.round(rel(m.plug.roll0) / 30) % 12}`;
}
