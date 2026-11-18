import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { angleError } from '../common/_card_ui.js';
import { splitIds, nthOf } from '../core/style.js';
import { LANDMARKS_EXT, landmarkSplit } from '../common/_map_align_look.js';
import * as RT from '../common/_map_align_rt.js';

const BOARD = { w: 340, h: 400 };
const EXT_BOARD = { w: 340, h: 300 };
const HARD = { tolerance: 12, landmarks: 8, startOffset: [48, 166], upMargin: 30 };
const C = { x: 170, y: 158 }, R = 112;
const MAP_GRAB = 10;
const HEADINGS = [
  ['NE', 45], ['E', 90], ['SE', 135],
  ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
];
const TAU = Math.PI * 2;
const rad = (d) => d * Math.PI / 180;

function norm(d) {
  d = ((d % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}
const norm360 = (d) => ((d % 360) + 360) % 360;

function vec(deg, len) {
  const a = deg * Math.PI / 180;
  return { x: Math.sin(a) * len, y: -Math.cos(a) * len };
}

const TOL = 8;
const SEP_M = 8.5, REL_SEP = 12;
const PHOTO = { x: 0, y: 0, w: 340, h: 170 };
const MAPC = { x: 170, y: 290 }, MR = 104;
const CAMH = 9, PITCH = 20, HFOV = 70;
const HALF = HFOV / 2;
const IN_REL = [8.5, 34], OUT_REL = 47;
const IN_D = [13, 27], OUT_D = [8, 27], MAX_D = 28;
const N_IN = 3, SIDE_OFF = 2 * TOL, NEAR_REL = 25, NEAR_D = 20;
const MSCALE = (MR - 14) / MAX_D;
const KINDS = ['tower', 'fountain', 'kiosk', 'statue', 'tent', 'container', 'silo'];
const NAMES = { tower: 'Tower', fountain: 'Fountain', kiosk: 'Kiosk', statue: 'Statue', tent: 'Tent', container: 'Container', silo: 'Silo', tree: 'Tree' };
const FOOT = { tower: 1.6, fountain: 2.4, kiosk: 1.9, statue: 1.1, tent: 2.6, container: 3.2, silo: 1.6, tree: 2.1 };
const HEIGHT = { tower: 7.5, fountain: 2.8, kiosk: 2.8, statue: 4.3, tent: 4.2, container: 2.6, silo: 6.7, tree: 6.0 };
const posOf = (b, d) => ({ x: Math.sin(rad(b)) * d, z: -Math.cos(rad(b)) * d });

const photoCamFor = (H) => {
  const f = [Math.sin(rad(H)), 0, -Math.cos(rad(H))], c = Math.cos(rad(PITCH)), s = Math.sin(rad(PITCH));
  const eye = [0, CAMH, 0], target = [f[0] * c * 10, CAMH - s * 10, f[2] * c * 10];
  const fy = 2 * Math.atan((PHOTO.h / 2) / ((PHOTO.w / 2) / Math.tan(rad(HALF)))) * 180 / Math.PI;
  return RT.makeCam({ eye, target, fovY: fy, W: PHOTO.w, H: PHOTO.h });
};

function coneSeq(lms, H) {
  return lms.map((l) => ({ k: l.kind, r: norm(l.b - H) })).filter((o) => Math.abs(o.r) <= HALF).sort((a, b) => a.r - b.r).map((o) => o.k).join(',');
}

const MATS = (() => {
  const M = {}, list = [];
  const add = (name, hex, ks = 0.05, sh = 10, extra = {}) => { M[name] = list.length; list.push({ c: RT.lin(hex), ks, sh, ...extra }); };
  add('brick', '#a8442f'); add('roof', '#3b3f46', 0.1, 14); add('stone', '#b9b3a7'); add('water', '#3d8fd1', 0.35, 40);
  add('bark', '#6b4a2f'); add('leaf', '#4f8f3a'); add('leaf2', '#5fa046'); add('yellow', '#e2b52f'); add('red', '#c43b2f');
  add('pedestal', '#d7d2c6'); add('bronze', '#8a6a3a', 0.25, 30); add('canvas', '#f2efe8'); add('orange', '#e8742a');
  add('blue', '#2f5fa8', 0.12, 18); add('silver', '#c9ced3', 0.3, 30); add('pole', '#555a60');
  return { M, list };
})();
function landmarkShapes(id, l) {
  const M = MATS.M, S = RT.shape, x = l.x, z = l.z, yw = l.yaw || 0, out = [];
  switch (l.kind) {
    case 'tower': out.push(S.box(id, M.brick, x, 2.9, z, 1.1, 2.9, 1.1, yw, 0.03), S.frustum(id, M.roof, x, z, 5.8, 7.5, 1.65, 0.06)); break;
    case 'fountain': out.push(S.cyl(id, M.stone, x, z, 0, 0.7, 2.4, 0.06), S.cyl(id, M.water, x, z, 0.7, 0.72, 2.05), S.cyl(id, M.stone, x, z, 0.7, 2.2, 0.28), S.sphere(id, M.stone, x, 2.4, z, 0.45)); break;
    case 'tree': out.push(S.cyl(id, M.bark, x, z, 0, 2.7, 0.32), S.sphere(id, M.leaf, x, 4.0, z, 2.0), S.sphere(id, M.leaf2, x + 0.5, 4.8, z - 0.4, 1.25)); break;
    case 'kiosk': out.push(S.box(id, M.yellow, x, 1.2, z, 1.3, 1.2, 1.3, yw, 0.03), S.box(id, M.red, x, 2.6, z, 1.75, 0.2, 1.75, yw, 0.05)); break;
    case 'statue': out.push(S.box(id, M.pedestal, x, 1.0, z, 0.75, 1.0, 0.75, yw, 0.03), S.capsule(id, M.bronze, [x, 2.35, z], [x, 3.4, z], 0.34), S.sphere(id, M.bronze, x, 3.95, z, 0.3)); break;
    case 'tent': out.push(S.frustum(id, M.canvas, x, z, 0, 3.4, 2.6, 0.07), S.cyl(id, M.pole, x, z, 3.3, 4.2, 0.05), S.box(id, M.orange, x + 0.35 * Math.cos(rad(yw)), 4.0, z + 0.35 * Math.sin(rad(yw)), 0.32, 0.17, 0.02, -yw)); break;
    case 'container': out.push(S.box(id, M.blue, x, 1.3, z, 3.0, 1.3, 1.2, yw, 0.04)); break;
    case 'silo': out.push(S.cyl(id, M.silver, x, z, 0, 5.2, 1.5, 0.05), S.sphere(id, M.silver, x, 5.2, z, 1.5)); break;
    default: throw new Error('map_align: unknown kind ' + l.kind);
  }
  return out;
}
const GRASS = [['#7da55a', '#93b86b'], ['#86a35c', '#a0b974'], ['#77a062', '#8fb878']];
function floorOf(m) {
  const [ga, gb] = GRASS[m.look.grass % GRASS.length], A = RT.lin(ga), B = RT.lin(gb), P = RT.lin('#d8ccb0'), PE = RT.lin('#bfb294');
  const pads = m.landmarks.map((l) => [l.x, l.z, FOOT[l.kind] + 0.9]);
  return (x, z, fp, out) => {
    const n = RT.fbm(x * 0.35, z * 0.35, 4, fp * 0.35), n2 = RT.fbm(x * 2.2 + 7, z * 2.2, 2, fp * 2.2);
    RT.mixInto(out, A, B, 0.25 + 0.55 * n + 0.2 * n2);
    for (const [px, pz, pr] of pads) {
      const d = Math.hypot(x - px, z - pz);
      if (d > pr + 0.3) continue;
      const k = Math.max(0, Math.min(1, (pr - d) / Math.max(fp, 0.02) + 0.5));
      const rim = Math.max(0, Math.min(1, 1 - Math.abs(d - pr + 0.12) / 0.12));
      RT.mixInto(out, out, P, k * 0.92);
      if (rim > 0) RT.mixInto(out, out, PE, rim * 0.6);
    }
  };
}
const SCENES = new WeakMap();
function sceneOf(m) {
  if (!SCENES.has(m)) {
    const shapes = [];
    m.landmarks.forEach((l) => shapes.push(...landmarkShapes(l.id, l)));
    const sun = rad(m.look.sun);
    const light = { ...RT.STUDIO_LIGHT, dir: [Math.sin(sun) * 0.7, 1.2, -Math.cos(sun) * 0.7], col: [1.25, 1.18, 1.05], sky: [0.42, 0.45, 0.5], ground: [0.16, 0.18, 0.12], contact: 0.2 };
    SCENES.set(m, RT.makeScene({ cam: photoCamFor(m.heading), shapes, mats: MATS.list, light, env: { floorY: 0, floor: floorOf(m), sky: RT.softSky } }));
  }
  return SCENES.get(m);
}
function probes(l) {
  const h = HEIGHT[l.kind], r = Math.min(0.6, FOOT[l.kind] * 0.4);
  return [[l.x, h * 0.5, l.z], [l.x, h * 0.85, l.z], [l.x + r, h * 0.3, l.z], [l.x - r, h * 0.3, l.z], [l.x, h * 0.3, l.z + r], [l.x, h * 0.3, l.z - r]];
}
function visShare(sc, l) {
  let n = 0;
  const ps = probes(l);
  for (const p of ps) { const r = RT.rayToPoint(sc, p[0], p[1], p[2]); if (r.id === l.id || r.t >= r.tP - 0.05) n++; }
  return n / ps.length;
}
function outOfPhoto(cam, l) {
  const f = FOOT[l.kind] + 0.3, h = HEIGHT[l.kind];
  for (const [dx, dz] of [[-f, -f], [f, -f], [f, f], [-f, f]]) for (const y of [0, h]) {
    const p = cam.project(l.x + dx, y, l.z + dz);
    if (p.z > 0.1 && p.x > -6 && p.x < PHOTO.w + 6 && p.y > -6 && p.y < PHOTO.h + 6) return false;
  }
  return true;
}

function tryBuild(rng) {
  const H = +rng.uniform(0, 360).toFixed(1);
  const others = rng.sample(KINDS, 6);
  const nIn = N_IN;
  const treeIn = rng.uniform(0, 1) < 0.6;
  const inKinds = others.slice(0, nIn - (treeIn ? 1 : 0)).concat(treeIn ? ['tree'] : []);
  const outKinds = others.slice(nIn - (treeIn ? 1 : 0)).concat(treeIn ? ['tree'] : ['tree', 'tree']);
  const lms = [];
  const okSep = (p, kind) => lms.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= Math.max(SEP_M, FOOT[o.kind] + FOOT[kind] + 1.6));
  const side = rng.sign(), slack = IN_REL[1] - IN_REL[0] - (nIn - 1) * REL_SEP;
  const cuts = [0, 0, 0].map(() => rng.uniform(0, slack)).sort((a, b) => a - b);
  const rels = cuts.map((c, i) => side * (IN_REL[0] + c + i * REL_SEP));
  const inOrder = rng.shuffle(inKinds);
  for (let i = 0; i < nIn; i++) {
    const kind = inOrder[i], rel = rels[i], dHi = Math.abs(rel) >= NEAR_REL ? NEAR_D : IN_D[1];
    let placed = null;
    for (let t = 0; t < 60 && !placed; t++) {
      const d = rng.uniform(IN_D[0], dHi);
      const p = posOf(H + rel, d);
      if (okSep(p, kind)) placed = { kind, b: +norm360(H + rel).toFixed(2), d: +d.toFixed(2), rel, inView: true, ...p };
    }
    if (!placed) return null;
    lms.push(placed);
  }
  for (const kind of outKinds) {
    let placed = null;
    for (let t = 0; t < 60 && !placed; t++) {
      const rel = rng.sign() * rng.uniform(OUT_REL, 180), d = rng.uniform(OUT_D[0], OUT_D[1]);
      const p = posOf(H + rel, d);
      if (okSep(p, kind)) placed = { kind, b: +norm360(H + rel).toFixed(2), d: +d.toFixed(2), rel, inView: false, ...p };
    }
    if (!placed) return null;
    lms.push(placed);
  }
  const trees = lms.filter((l) => l.kind === 'tree');
  if (angleError(trees[0].b, trees[1].b) < 60) return null;
  const order = rng.shuffle(lms.map((_, i) => i));
  const landmarks = order.map((i, id) => {
    const l = lms[i];
    return { id, kind: l.kind, b: l.b, d: l.d, x: +l.x.toFixed(3), z: +l.z.toFixed(3), yaw: +rng.uniform(0, 180).toFixed(1), inView: l.inView };
  });
  const solution = +norm(-H).toFixed(2);
  const initial = +norm(solution + rng.sign() * rng.uniform(HARD.startOffset[0], HARD.startOffset[1])).toFixed(2);
  return {
    task: 'map_align', board: BOARD, heading: H, solution, initial, tolerance: TOL, landmarks,
    look: { grass: rng.int(0, 2), sun: +rng.uniform(0, 360).toFixed(1) },
    gtContract: 'the photo is taken from the map centre looking along heading H; the map is aligned when H points to the top of the map (within 10 deg)',
  };
}

function contractOk(m) {
  if (!m || m.task !== 'map_align' || m.tolerance !== TOL || !Array.isArray(m.landmarks) || m.landmarks.length !== 8) return false;
  if (!Number.isFinite(m.heading) || Math.abs(norm(m.solution + m.heading)) > 1e-6 || !Number.isFinite(m.initial)) return false;
  if (angleError(m.initial, m.solution) < HARD.startOffset[0] - 1e-6) return false;
  const L = m.landmarks;
  const kinds = L.map((l) => l.kind);
  if (kinds.filter((k) => k === 'tree').length !== 2 || new Set(kinds).size !== 7) return false;
  const inV = L.filter((l) => l.inView);
  if (inV.length < 3 || inV.length > 4) return false;
  for (const l of L) {
    const rel = Math.abs(norm(l.b - m.heading));
    if (l.inView && !(rel >= IN_REL[0] - 1e-6 && rel <= IN_REL[1] + 1e-6 && l.d >= IN_D[0] - 1e-6 && l.d <= IN_D[1] + 1e-6)) return false;
    if (!l.inView && !(rel >= OUT_REL - 1e-6 && l.d >= OUT_D[0] - 1e-6 && l.d <= OUT_D[1] + 1e-6)) return false;
    const p = posOf(l.b, l.d);
    if (Math.hypot(p.x - l.x, p.z - l.z) > 0.01) return false;
  }
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < Math.max(SEP_M, FOOT[a.kind] + FOOT[b.kind] + 1.6) - 1e-6) return false;
    if (a.inView && b.inView && angleError(a.b, b.b) < REL_SEP - 1e-6) return false;
  }
  const trees = L.filter((l) => l.kind === 'tree');
  if (angleError(trees[0].b, trees[1].b) < 60) return false;
  const rels = inV.map((l) => norm(l.b - m.heading));
  const mid = (Math.min(...rels) + Math.max(...rels)) / 2, mean = rels.reduce((a, b) => a + b, 0) / rels.length;
  if (Math.abs(mid) < SIDE_OFF || Math.abs(mean) < SIDE_OFF) return false;
  if (!inV.some((l) => Math.abs(norm(l.b - m.heading)) >= NEAR_REL && l.d <= NEAR_D)) return false;
  const seq = coneSeq(L, m.heading);
  for (let d = 40; d <= 320; d += 2) if (coneSeq(L, m.heading + d) === seq) return false;
  return true;
}
const MAX_CLIP = 0.2;
function frameOut(cam, l) {
  const r = FOOT[l.kind] * 0.8, h = HEIGHT[l.kind];
  let out = 0, tot = 0;
  for (let k = 0; k < 16; k++) for (const y of [0, h / 2, h]) {
    const a = k * Math.PI / 8, p = cam.project(l.x + Math.cos(a) * r, y, l.z + Math.sin(a) * r);
    tot++; if (!(p.z > 0.1 && p.x >= 0 && p.x <= PHOTO.w && p.y >= 0 && p.y <= PHOTO.h)) out++;
  }
  return out / tot;
}
const CHECKED = new WeakMap();
function sceneCheck(m) {
  if (CHECKED.has(m)) return CHECKED.get(m);
  const sc = sceneOf(m), cam = sc.cam;
  let ok = true;
  for (const l of m.landmarks) {
    if (l.inView) {
      const c = cam.project(l.x, HEIGHT[l.kind] * 0.5, l.z), base = cam.project(l.x, 0, l.z), top = cam.project(l.x, HEIGHT[l.kind], l.z);
      if (!(c.x > 18 && c.x < PHOTO.w - 18 && base.y < PHOTO.h - 8 && top.y > 6)) { ok = false; break; }
      if (visShare(sc, l) < 0.6) { ok = false; break; }
      if (frameOut(cam, l) > MAX_CLIP) { ok = false; break; }
    } else if (!outOfPhoto(cam, l)) { ok = false; break; }
  }
  CHECKED.set(m, ok);
  return ok;
}

const COMBOS = [];
for (const [h, hd] of HEADINGS) for (let b = 0; b < 24; b++) {
  let ok = false;
  for (let k = 0; k < 15 && !ok; k += 0.5) ok = angleError(15 * b + k, hd) >= HARD.upMargin;
  if (ok) COMBOS.push(`${h}|N|${b}`);
}
const EVAL_KEYS = new Set(['E|N|11', 'SW|N|11', 'E|N|0', 'E|N|22', 'NW|N|1', 'E|N|9', 'NE|N|21', 'S|N|0', 'SE|N|18', 'E|N|3', 'NE|N|13', 'W|N|13']);
const comboSplit = splitIds('map_align_question', COMBOS.filter((k) => !EVAL_KEYS.has(k)), 20);
function generateExt(rng, split, n) {
  const pool = COMBOS.filter((k) => !EVAL_KEYS.has(k) && comboSplit(k) === split);
  const key = Number.isFinite(n) ? pool[nthOf(`map_align|${split}|question`, n, pool.length)] : rng.pick(pool);
  const [headingLabel, , binS] = key.split('|');
  const targetHeading = HEADINGS.find(([h]) => h === headingLabel)[1], bin = Number(binS);
  let needle;
  do needle = (bin * 150 + rng.int(0, 149)) / 10; while (angleError(needle, targetHeading) < HARD.upMargin);
  const solution = norm(needle - targetHeading);
  const offset = rng.sign() * rng.uniform(HARD.startOffset[0], HARD.startOffset[1]);
  const initial = +norm(solution + offset).toFixed(2);
  const names = rng.sample(LANDMARKS_EXT.filter((nm) => landmarkSplit(nm) === split), HARD.landmarks);
  const a0 = rng.uniform(0, Math.PI * 2);
  const bx = 0, by = -(R - 20);
  const landmarks = names.map((kind, i) => {
    let x, y;
    for (let t = 0; t < 40; t++) {
      const a = a0 + (i / HARD.landmarks) * Math.PI * 2 + rng.uniform(-0.25, 0.25);
      const rr = rng.uniform(38, 86);
      x = +(Math.cos(a) * rr).toFixed(2); y = +(Math.sin(a) * rr).toFixed(2);
      if (Math.hypot(x - bx, y - by) >= 24 && Math.hypot(x - bx, y + 12 - by) >= 24) break;
    }
    return { x, y, kind, hue: rng.int(0, 11) * 30 };
  });
  return { task: 'map_align', board: EXT_BOARD, panel: { boardH: EXT_BOARD.h + 10 }, ext: true, targetHeading, headingLabel, needle,
    solution, initial, tolerance: HARD.tolerance, landmarks };
}

export function semanticKey(m) {
  if (m.ext || m.needle !== undefined) return `${m.headingLabel}|${m.refLetter || 'N'}|${Math.floor((((m.needle % 360) + 360) % 360) / 15)}`;
  return `photo|${coneSeq(m.landmarks, m.heading)}|h${Math.floor(norm360(m.heading) / 30)}`;
}

export function gate(m) {
  if (m && m.ext) return m.task === 'map_align' && m.landmarks?.length === 8 && m.tolerance === HARD.tolerance && Number.isFinite(m.solution);
  return contractOk(m) && sceneCheck(m);
}

function drawIcon(g, kind, yawDeg) {
  g.rotate(rad(-yawDeg));
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(40,40,40,.75)';
  switch (kind) {
    case 'tower': g.fillStyle = '#a8442f'; g.fillRect(-6.5, -6.5, 13, 13); g.strokeRect(-6.5, -6.5, 13, 13);
      g.fillStyle = '#3b3f46'; g.beginPath(); g.moveTo(0, -4.5); g.lineTo(4.5, 0); g.lineTo(0, 4.5); g.lineTo(-4.5, 0); g.closePath(); g.fill(); break;
    case 'fountain': g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fillStyle = '#b9b3a7'; g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, 6.2, 0, TAU); g.fillStyle = '#3d8fd1'; g.fill(); g.beginPath(); g.arc(0, 0, 1.8, 0, TAU); g.fillStyle = '#b9b3a7'; g.fill(); break;
    case 'tree': g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fillStyle = '#4f8f3a'; g.fill(); g.stroke();
      g.beginPath(); g.arc(2, -2, 4, 0, TAU); g.fillStyle = '#5fa046'; g.fill(); break;
    case 'kiosk': g.fillStyle = '#c43b2f'; g.fillRect(-7, -7, 14, 14); g.strokeRect(-7, -7, 14, 14); g.fillStyle = '#e2b52f'; g.fillRect(-4.5, -4.5, 9, 9); break;
    case 'statue': g.fillStyle = '#d7d2c6'; g.fillRect(-5, -5, 10, 10); g.strokeRect(-5, -5, 10, 10); g.beginPath(); g.arc(0, 0, 2.8, 0, TAU); g.fillStyle = '#8a6a3a'; g.fill(); break;
    case 'tent': g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fillStyle = '#f2efe8'; g.fill(); g.stroke();
      g.strokeStyle = 'rgba(120,110,90,.6)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const a = k * TAU / 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); g.stroke(); }
      g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fillStyle = '#e8742a'; g.fill(); break;
    case 'container': g.save(); g.fillStyle = '#2f5fa8'; g.fillRect(-10, -4.2, 20, 8.4); g.strokeRect(-10, -4.2, 20, 8.4);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; for (const t of [-5, 0, 5]) { g.beginPath(); g.moveTo(t, -4.2); g.lineTo(t, 4.2); g.stroke(); } g.restore(); break;
    case 'silo': g.beginPath(); g.arc(0, 0, 7.5, 0, TAU); g.fillStyle = '#c9ced3'; g.fill(); g.stroke();
      g.beginPath(); g.arc(-1.8, -1.8, 3, 0, TAU); g.fillStyle = '#eef1f3'; g.fill(); break;
    default: break;
  }
}
function drawMap(g, m, rot) {
  const cx = MAPC.x, cy = MAPC.y;
  g.save();
  g.beginPath(); g.arc(cx, cy, MR, 0, TAU); g.clip();
  g.fillStyle = '#e4ecd6'; g.fillRect(cx - MR, cy - MR, 2 * MR, 2 * MR);
  g.translate(cx, cy); g.rotate(rad(rot));
  g.strokeStyle = 'rgba(90,110,70,.13)'; g.lineWidth = 1;
  for (let t = -MR; t <= MR; t += 26) { g.beginPath(); g.moveTo(t, -MR); g.lineTo(t, MR); g.stroke(); g.beginPath(); g.moveTo(-MR, t); g.lineTo(MR, t); g.stroke(); }
  for (const l of m.landmarks) { g.beginPath(); g.arc(l.x * MSCALE, l.z * MSCALE, (FOOT[l.kind] + 0.9) * MSCALE, 0, TAU); g.fillStyle = '#d9cfb6'; g.fill(); }
  g.restore();
  const cr = Math.cos(rad(rot)), sr = Math.sin(rad(rot));
  for (const l of m.landmarks) {
    const px = cx + (l.x * cr - l.z * sr) * MSCALE, py = cy + (l.x * sr + l.z * cr) * MSCALE;
    g.save(); g.translate(px, py); g.rotate(rad(rot)); drawIcon(g, l.kind, l.yaw); g.restore();
    g.font = `600 8px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = 2.6; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(NAMES[l.kind], px, py + 10);
    g.fillStyle = '#3a4652'; g.fillText(NAMES[l.kind], px, py + 10);
  }
  g.save();
  g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, MR - 2, rad(-90 - HALF), rad(-90 + HALF)); g.closePath();
  g.fillStyle = 'rgba(25,145,250,.13)'; g.fill();
  g.strokeStyle = 'rgba(25,145,250,.75)'; g.lineWidth = 1.6; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(cx + Math.cos(rad(-90 - HALF)) * (MR - 2), cy + Math.sin(rad(-90 - HALF)) * (MR - 2)); g.lineTo(cx, cy); g.lineTo(cx + Math.cos(rad(-90 + HALF)) * (MR - 2), cy + Math.sin(rad(-90 + HALF)) * (MR - 2)); g.stroke();
  g.strokeStyle = 'rgba(25,145,250,.45)'; g.lineWidth = 1.2; g.setLineDash([2, 4]);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - MR + 2); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.arc(cx, cy, 6, 0, TAU); g.fillStyle = ACCENT; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.restore();
  g.beginPath(); g.arc(cx, cy, MR, 0, TAU); g.strokeStyle = '#6f7f8f'; g.lineWidth = 2.5; g.stroke();
  g.beginPath(); g.arc(cx, cy, MR + 4, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.stroke();
}

function drawNeedle(g, needle) {
  const v1 = vec(needle, R - 8), v2 = vec(needle, R + 10);
  g.strokeStyle = '#e6463c'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(C.x + v1.x, C.y + v1.y); g.lineTo(C.x + v2.x, C.y + v2.y); g.stroke();
  const tip = vec(needle, R + 12);
  g.save(); g.translate(C.x + tip.x, C.y + tip.y); g.rotate(needle * Math.PI / 180);
  g.fillStyle = '#e6463c'; g.beginPath(); g.moveTo(0, -11); g.lineTo(-8, 3); g.lineTo(8, 3); g.closePath(); g.fill();
  g.restore();
}

export default {
  meta: {
    name: 'map_align', family: 'D', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'rotate', deg: 'absolute map rotation in degrees' }],
    promptHuman: 'Turn the map to match the photo (the photo was taken from the blue dot, looking along the blue cone)',
    uses3d: true,
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng, _knobs.ext, _knobs.n);
    for (let attempt = 0; attempt < 4000; attempt++) {
      const m = tryBuild(rng);
      if (m && contractOk(m) && sceneCheck(m)) return m;
    }
    throw new Error('map_align: could not build a park that fits the contract');
  },

  init(manifest) { return { rotation: manifest.initial, turns: 0 }; },

  applyAction(state, action) {
    if (action.op !== 'rotate') return { ok: false, reason: 'bad-op' };
    if (!Number.isFinite(action.deg)) return { ok: false, reason: 'bad-angle' };
    state.rotation = +norm(action.deg).toFixed(3);
    if (!action.transient) state.turns++;
    return { ok: true };
  },

  verify(state, manifest) {
    let error;
    if (manifest.ext || manifest.needle !== undefined) error = angleError(norm(state.rotation + manifest.targetHeading), manifest.needle);
    else error = angleError(state.rotation, manifest.solution);
    return {
      success: error <= manifest.tolerance,
      partial: Math.max(0, 1 - error / 180),
      error: +error.toFixed(3),
      detail: { rotation: +state.rotation.toFixed(2), turns: state.turns },
    };
  },

  oracle(manifest) { return [{ op: 'rotate', deg: manifest.solution }]; },

  oraclePoints(m) {
    const hard = !(m.ext || m.needle !== undefined), c = hard ? MAPC : C, rr = hard ? MR : R;
    const s = norm(m.solution - m.initial), rho = 0.7 * rr, t0 = -90 - s / 2;
    const pt = (t) => [c.x + rho * Math.cos(t * Math.PI / 180), c.y + rho * Math.sin(t * Math.PI / 180)];
    return [{ from: pt(t0), to: pt(t0 + s) }];
  },

  randomPolicy(m, rnd) { return [{ op: 'rotate', deg: rnd() * 360 - 180 }]; },

  async mount(env) {
    if (!env || !env.style || !env.manifest?.ext) return;
    env.assets.map = await import('../common/_map_align_look.js');
    env.assets.look = await env.assets.map.buildMapLook(env.style, env.manifest, R);
  },

  drawPrompt(g, r, env) {
    const m = env.manifest;
    if (m.ext || m.needle !== undefined) { drawPromptText(g, r, 'Turn the map to match the compass', `The red arrow points ${m.headingLabel}`); return; }
    drawPromptText(g, r, 'Turn the map to match the photo', 'Taken from the blue dot, looking along the blue cone');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    if (!(m.ext || m.needle !== undefined)) {
      g.save(); g.translate(br.x, br.y);
      g.fillStyle = '#eef2f5'; g.fillRect(0, 0, br.w, br.h);
      const K = (this._cache3 ??= {}), q = Math.min(2, RT.contextScale(g));
      if (K.m !== m || K.q !== q) { K.m = m; K.q = q; K.img = RT.render(sceneOf(m), q); K.canvas = RT.toCanvas(K.img); }
      g.save(); g.beginPath(); g.rect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h); g.clip();
      g.drawImage(K.canvas, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h); g.restore();
      const mx = PHOTO.x + PHOTO.w / 2;
      g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = 'rgba(25,145,250,.9)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(mx - 6, PHOTO.y); g.lineTo(mx + 6, PHOTO.y); g.lineTo(mx, PHOTO.y + 9); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(mx - 6, PHOTO.y + PHOTO.h); g.lineTo(mx + 6, PHOTO.y + PHOTO.h); g.lineTo(mx, PHOTO.y + PHOTO.h - 9); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(20,28,36,.62)'; g.beginPath(); g.roundRect ? g.roundRect(8, 8, 46, 17, 4) : g.rect(8, 8, 46, 17); g.fill();
      g.font = `700 9.5px ${UI_FONT}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PHOTO', 31, 17);
      g.fillStyle = 'rgba(20,28,36,.62)'; g.beginPath(); g.roundRect ? g.roundRect(8, PHOTO.h + 10, 40, 17, 4) : g.rect(8, PHOTO.h + 10, 40, 17); g.fill();
      g.fillStyle = '#fff'; g.fillText('MAP', 28, PHOTO.h + 19);
      drawMap(g, m, state.rotation);
      g.restore();
      return;
    }
    if (env.style && env.assets.look) {
      g.save(); g.translate(br.x, br.y);
      g.fillStyle = '#e9eef3'; g.fillRect(0, 0, br.w, br.h);
      env.assets.map.drawMapLook(g, env.assets.look, C.x, C.y, state.rotation);
      drawNeedle(g, m.needle);
      g.restore();
      return;
    }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#e9eef3'; g.fillRect(0, 0, br.w, br.h);
    g.save();
    g.beginPath(); g.arc(C.x, C.y, R, 0, Math.PI * 2); g.clip();
    g.translate(C.x, C.y); g.rotate(state.rotation * Math.PI / 180);
    g.fillStyle = '#f7f1df'; g.fillRect(-R, -R, 2 * R, 2 * R);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = 13;
    [-55, 0, 54].forEach((y, i) => { g.beginPath(); g.moveTo(-R, y + (i - 1) * 7); g.bezierCurveTo(-38, y - 18, 42, y + 18, R, y - 4); g.stroke(); });
    g.strokeStyle = '#cbd3d7'; g.lineWidth = 1.2;
    [-55, 0, 54].forEach((y, i) => { g.beginPath(); g.moveTo(-R, y + (i - 1) * 7); g.bezierCurveTo(-38, y - 18, 42, y + 18, R, y - 4); g.stroke(); });
    g.strokeStyle = '#fff'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(-35, -R); g.quadraticCurveTo(-7, -20, -25, R); g.stroke();
    g.strokeStyle = '#cbd3d7'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-35, -R); g.quadraticCurveTo(-7, -20, -25, R); g.stroke();
    m.landmarks.forEach((p) => {
      g.beginPath(); g.arc(p.x, p.y, 8, 0, Math.PI * 2);
      g.fillStyle = `hsl(${p.hue},48%,58%)`; g.fill();
      g.strokeStyle = 'rgba(45,55,65,.35)'; g.stroke();
      g.font = `700 6.5px ${UI_FONT}`; g.fillStyle = '#364554'; g.textAlign = 'center';
      g.fillText(p.kind, p.x, p.y + 14);
    });
    g.fillStyle = '#354f69'; g.font = `800 15px ${UI_FONT}`; g.textAlign = 'center';
    g.fillText('N', 0, -R + 18);
    g.beginPath(); g.moveTo(0, -R + 25); g.lineTo(-5, -R + 35); g.lineTo(5, -R + 35); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fillStyle = '#176bc0'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.restore();
    g.beginPath(); g.arc(C.x, C.y, R, 0, Math.PI * 2);
    g.strokeStyle = '#6f7f8f'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(C.x, C.y, R + 8, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 5; g.stroke();
    drawNeedle(g, m.needle);
    g.restore();
  },

  pointer(evt, env) {
    const m = env.manifest, hard = !(m.ext || m.needle !== undefined), c = hard ? MAPC : C, rr = hard ? MR : R;
    const a = Math.atan2(evt.y - c.y, evt.x - c.x) * 180 / Math.PI;
    if (evt.type === 'down' && Math.hypot(evt.x - c.x, evt.y - c.y) <= rr + MAP_GRAB) {
      this._drag = { start: a, base: env.state.rotation };
      return [];
    }
    if (evt.type === 'move' && this._drag) return [{ op: 'rotate', deg: this._drag.base + a - this._drag.start, transient: true }];
    if (evt.type === 'up' && this._drag) {
      const deg = this._drag.base + a - this._drag.start;
      this._drag = null;
      return [{ op: 'rotate', deg }];
    }
    return [];
  },

  wantsMoveRedraw: true,
  footerStatus(env) {
    return env.state.turns ? 'Map turned' : 'Drag the map to turn it';
  },
};

export const _debug = { sceneOf, coneSeq };
