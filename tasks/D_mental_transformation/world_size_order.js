import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { orderedTaps } from '../common/_mech_common.js';
import { shape, makeScene, orbitCam, tileFloor, plasterWall, softSky, STUDIO_LIGHT, cA, paintTraced } from '../common/_object_rt.js';
import { envLook, texRGB, faceOf, pickOf, S3 } from '../common/_rt_look.js';
import { pickTex, splitPick } from '../common/_rt_kit.js';

const BOARD = { w: 340, h: 300 };
const N = 7;
const LADDER = [0.46, 0.515, 0.577, 0.646, 0.724, 0.811, 0.908];
const JIT = 0.006;
const MIN_WORLD_RATIO = 1.09;
const MIN_SCREEN_RATIO = 1.04;
const MIN_SCREEN_SEP = 34;
const WALL_Z = -2.5;
const CAM = { dist: 2.85, fov: 50, tx: 0, ty: 0.25, tz: -0.26 };
const CAM_YAW = 10, CAM_PITCH = [24, 28];
const COLS = [50, 90, 130, 170, 210, 250, 290], COL_JIT = 6;
const W_RANGE = [0.08, 0.2], D_RANGE = [0.08, 0.16];
const X_MAX = 2.4;
const Z_RANGE = [-2.2, 1.0];
const MIN_K_LENGTH = 5;
const MIN_K_TOP = 3;
const MIN_K_DEPTH = 3;
const MIN_K_ASPECT = 3;
const SCRAMBLE_K = [5, 9];
const SCRAMBLE_TRIES = 1500;
const TILE = 0.4;
const MIN_TILE_RATIO = 1.05;
const MARGIN = { x: 26, top: 34, bottom: 18 };
const EPS = 1e-6;
const mech = orderedTaps();

function cameraOf(m) {
  return orbitCam({ az: m.cam.yaw, el: m.cam.pitch, ...CAM }, BOARD.w, BOARD.h);
}
function boxCorners(p) {
  const a = p.yawDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, p.h]) {
    const lx = sx * p.w / 2, lz = sz * p.d / 2;
    out.push([p.x + lx * c + lz * s, y, p.z - lx * s + lz * c]);
  }
  return out;
}
function screenBox(p, cam) {
  const v = boxCorners(p).map(([x, y, z]) => cam.project(x, y, z));
  return { x0: Math.min(...v.map((q) => q.x)), x1: Math.max(...v.map((q) => q.x)),
    y0: Math.min(...v.map((q) => q.y)), y1: Math.max(...v.map((q) => q.y)) };
}
const screenH = (p, cam) => { const b = screenBox(p, cam); return b.y1 - b.y0; };
function orderIdx(n, keyOf) {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => keyOf(a) - keyOf(b) || a - b);
}
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function kendall(a, b) {
  const pos = []; b.forEach((v, i) => { pos[v] = i; });
  let k = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (pos[a[i]] > pos[a[j]]) k++;
  return k;
}
function readings(pillars, cam) {
  return pillars.map((p) => {
    const b = screenBox(p, cam), foot = cam.project(p.x, 0, p.z), head = cam.project(p.x, p.h, p.z);
    const cs = boxCorners(p);
    let edge = 0, edgeFoot = -Infinity;
    for (let k = 0; k < cs.length; k += 2) {
      const a = cam.project(...cs[k]), t = cam.project(...cs[k + 1]);
      if (a.y > edgeFoot) { edgeFoot = a.y; edge = Math.hypot(a.x - t.x, a.y - t.y); }
    }
    const tl = cam.project(p.x - TILE / 2, 0, p.z), tr = cam.project(p.x + TILE / 2, 0, p.z);
    const axis = Math.hypot(foot.x - head.x, foot.y - head.y);
    return { box: b.y1 - b.y0, axis, edge, top: b.y0, foot: foot.y, aspect: (b.y1 - b.y0) / (b.x1 - b.x0),
      tiles: axis / Math.hypot(tr.x - tl.x, tr.y - tl.y) };
  });
}
function scramble(pillars, cam, order) {
  const r = readings(pillars, cam), byAxis = orderIdx(N, (i) => r[i].axis), pos = [];
  byAxis.forEach((v, i) => { pos[v] = i; });
  return order.map((v) => pos[v]).join('');
}
function axisK(pillars, cam, order) {
  const r = readings(pillars, cam);
  return kendall(orderIdx(N, (i) => r[i].axis), order);
}

function layoutOk(pillars, cam) {
  const bs = pillars.map((p) => screenBox(p, cam));
  for (const b of bs) {
    if (![b.x0, b.x1, b.y0, b.y1].every(Number.isFinite)) return false;
    if (b.x0 < MARGIN.x || b.x1 > BOARD.w - MARGIN.x || b.y0 < MARGIN.top || b.y1 > BOARD.h - MARGIN.bottom) return false;
  }
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if (a.x0 < b.x1 + 6 && b.x0 < a.x1 + 6 && a.y0 < b.y1 + 6 && b.y0 < a.y1 + 6) return false;
    const ca = { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 }, cb = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < MIN_SCREEN_SEP) return false;
  }
  return true;
}

function contractOk(m) {
  if (!m || m.task !== 'world_size_order') return false;
  if (!m.board || m.board.w !== BOARD.w || m.board.h !== BOARD.h) return false;
  if (!m.cam || !Number.isFinite(m.cam.yaw) || !Number.isFinite(m.cam.pitch)) return false;
  if (Math.abs(m.cam.yaw) > CAM_YAW + EPS) return false;
  if (m.cam.pitch < CAM_PITCH[0] - EPS || m.cam.pitch > CAM_PITCH[1] + EPS) return false;
  if (!Array.isArray(m.pillars) || m.pillars.length !== N) return false;
  if (!Array.isArray(m.order) || m.order.length !== N) return false;
  for (const c of m.pillars) {
    if (!c || !['x', 'z', 'w', 'd', 'h', 'yawDeg'].every((k) => Number.isFinite(c[k]))) return false;
    if (Math.abs(c.x) > X_MAX + EPS || c.z < Z_RANGE[0] - EPS || c.z > Z_RANGE[1] + EPS) return false;
    if (c.w < W_RANGE[0] - EPS || c.w > W_RANGE[1] + EPS || c.d < D_RANGE[0] - EPS || c.d > D_RANGE[1] + EPS) return false;
    if (Math.abs(c.yawDeg) > 25 + EPS) return false;
  }
  const seen = new Set(m.order);
  if (seen.size !== N || !m.order.every((i) => Number.isInteger(i) && i >= 0 && i < N)) return false;
  const worldRank = orderIdx(N, (i) => m.pillars[i].h);
  if (!arrEq(worldRank, m.order)) return false;
  const hs = m.pillars.map((c) => c.h).sort((a, b) => a - b);
  for (let i = 0; i < N; i++) if (Math.abs(hs[i] - LADDER[i]) > JIT + EPS) return false;
  for (let i = 1; i < N; i++) if (hs[i] / hs[i - 1] < MIN_WORLD_RATIO) return false;
  const cam = cameraOf(m);
  if (!layoutOk(m.pillars, cam)) return false;
  const scr = m.pillars.map((c) => screenH(c, cam));
  const ss = scr.slice().sort((a, b) => a - b);
  for (let i = 1; i < N; i++) if (ss[i] / ss[i - 1] < MIN_SCREEN_RATIO - EPS) return false;
  const r = readings(m.pillars, cam);
  const far = (k) => kendall(orderIdx(N, (i) => r[i][k]), worldRank);
  const both = (k) => { const o = orderIdx(N, (i) => r[i][k]); return Math.min(kendall(o, worldRank), kendall(o.slice().reverse(), worldRank)); };
  if (far('box') < MIN_K_LENGTH || far('axis') < MIN_K_LENGTH || far('edge') < MIN_K_LENGTH) return false;
  if (both('top') < MIN_K_TOP || both('foot') < MIN_K_DEPTH) return false;
  if (far('aspect') < MIN_K_ASPECT) return false;
  for (let k = 1; k < N; k++) if (r[worldRank[k]].tiles / r[worldRank[k - 1]].tiles < MIN_TILE_RATIO - EPS) return false;
  return true;
}

export function gate(m) { return contractOk(m); }
export function screenBoxes(m) { const cam = cameraOf(m); return m.pillars.map((p) => screenBox(p, cam)); }

const POST = { c: cA('#6f8fa3'), ks: 0.18, sh: 30, env: 0.06 };
const CAP = { c: cA('#e9e4da'), ks: 0.2, sh: 30 };
function sceneOf(m) {
  const mats = [POST, CAP], shapes = [];
  m.pillars.forEach((p, i) => {
    shapes.push(shape.box(i, 0, p.x, p.h / 2 - 0.006, p.z, p.w / 2, p.h / 2 - 0.006, p.d / 2, p.yawDeg, 0.012));
    shapes.push(shape.box(i, 1, p.x, p.h - 0.006, p.z, p.w / 2 + 0.004, 0.006, p.d / 2 + 0.004, p.yawDeg, 0.003));
  });
  return makeScene({ cam: cameraOf(m), shapes, mats, light: STUDIO_LIGHT,
    env: { floorY: 0, floor: tileFloor({ tile: TILE }), wallZ: WALL_Z, wall: plasterWall(), sky: softSky } });
}

const POST_KINDS = {
  painted: (t) => (t.use === 'flat2d' && /concrete|asphalt/.test(t.id)) || ['grey_plaster', 'grey_plaster_02', 'white_plaster_02', 'grey_plaster_03', 'brushed_concrete', 'scuffed_cement'].includes(t.id),
  concrete: (t) => ['concrete_floor_02', 'granular_concrete', 'gravel_concrete', 'gravel_concrete_03', 'dirty_concrete', 'concrete_wall_003', 'concrete_wall_007', 'concrete', 'cracked_concrete_wall', 'garage_floor', 'concrete_floor_worn_001'].includes(t.id),
  timber: (t) => ['fine_grained_wood', 'oak_veneer_01', 'rosewood_veneer1', 'wood_table_001', 'wood_table_worn', 'kitchen_wood', 'dark_wood', 'plywood', 'rough_wood'].includes(t.id),
  steel: (t) => t.use === 'metal' && /metal_plate_02|green_metal_rust|rusty_metal_sheet|rust_coarse|rusty_metal_05|blue_metal_plate/.test(t.id),
  stone: (t) => (t.use === 'terrain' || t.use === 'stone') && /rock_0|rock_surface|lichen|seaside|rock_face|worn_rock|rock_boulder/.test(t.id),
};
const POST_PAINT = ['#6f8fa3', '#8a7f6a', '#5f7a64', '#9a8c7a', '#7d8590', '#a07a5a', '#6a6f78', '#b0a48a'];
const CAP_COLS = ['#e9e4da', '#d8d2c6', '#2f3134', '#c9c2b4', '#f2efe8'];
async function styleLook(style) {
  const rnd = style.rand;
  const env = await envLook(style, { tag: 'world_size_order', settings: ['lobby', 'plaza', 'workshop', 'hall', 'yard'], base: STUDIO_LIGHT,
    ruler: { tile: TILE, hw: 0.004, k: 0.85, ratio: 0.56 }, L: [0.3, 0.6], wall: true, named: [] });
  const kind = splitPick(style, 'world_size_order|post', Object.keys(POST_KINDS));
  const pt = pickTex(style, POST_KINDS[kind], POST_KINDS.concrete, (t) => t.use === 'floor' && /concrete|plaster/.test(t.id));
  const PT = await S3.loadTexture(pt.file);
  const fL = S3.lum(env.face);
  let L = fL > 0.35 ? 0.1 + 0.12 * rnd() : 0.45 + 0.2 * rnd();
  const paint = kind === 'painted' || kind === 'steel' ? S3.scaleTo(S3.linOf(splitPick(style, 'world_size_order|paint', POST_PAINT)), L) : faceOf(PT.mean, L, { maxSat: 0.2, warmSat: 0.4 });
  const swap = PT.gxy < 1;
  const R = texRGB(PT, { face: paint, texWorld: 1.5, cv: 0.14, keep: kind === 'painted' || kind === 'steel' ? 0.15 : 0.5, lo: 0.7, hi: 1.3 });
  const post = { c: paint, ks: kind === 'steel' ? 0.3 : kind === 'painted' ? 0.18 : 0.06, sh: kind === 'steel' ? 40 : 24, env: kind === 'steel' ? 0.08 : 0.03,
    tex: (x, y, z, nx, ny, nz, s, out) => {
      const u = Math.abs(nx) > Math.abs(nz) ? z + s.cx * 3.7 : x + s.cz * 3.1, v = y + s.cx * 2.3 + s.cz * 1.9;
      if (swap) R(v, u, 0.004, out); else R(u, v, 0.004, out);
    } };
  const cap = { c: S3.linOf(splitPick(style, 'world_size_order|cap', CAP_COLS)), ks: 0.2, sh: 30 };
  style.note(`posts:${kind}`); style.note(`tex:${pt.id}`);
  return { key: style.key, env, mats: [post, cap], ids: { ...env.ids, posts: kind, postTex: pt.id } };
}
function sceneStyled(m, look) {
  const shapes = [];
  m.pillars.forEach((p, i) => {
    shapes.push(shape.box(i, 0, p.x, p.h / 2 - 0.006, p.z, p.w / 2, p.h / 2 - 0.006, p.d / 2, p.yawDeg, 0.012));
    shapes.push(shape.box(i, 1, p.x, p.h - 0.006, p.z, p.w / 2 + 0.004, 0.006, p.d / 2 + 0.004, p.yawDeg, 0.003));
  });
  return makeScene({ cam: cameraOf(m), shapes, mats: look.mats, light: look.env.light,
    env: { floorY: 0, floor: look.env.floor, wallZ: WALL_Z, wall: look.env.wall, sky: look.env.sky } });
}

const task = {
  meta: {
    name: 'world_size_order', family: 'D', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'tap', idx: 'post 0..6' }],
    promptHuman: 'Tap the posts from shortest to tallest (real height)',
  },

  generate(rng) {
    let want = rng.int(SCRAMBLE_K[0], SCRAMBLE_K[1]), tries = 0;
    for (let attempt = 0; attempt < 120000; attempt++) {
      if (++tries > SCRAMBLE_TRIES) { want = rng.int(SCRAMBLE_K[0], SCRAMBLE_K[1]); tries = 1; }
      const cam = { yaw: +rng.uniform(-CAM_YAW, CAM_YAW).toFixed(2), pitch: +rng.uniform(CAM_PITCH[0], CAM_PITCH[1]).toFixed(2) };
      const m = { task: 'world_size_order', board: BOARD, cam };
      const camera = cameraOf(m);
      const hs = LADDER.map((h) => +(h + rng.uniform(-JIT, JIT)).toFixed(3));
      const cols = rng.shuffle(COLS.slice());
      const pillars = [];
      let ok = true;
      for (let i = 0; i < N && ok; i++) {
        let placed = false;
        for (let t = 0; t < 60 && !placed; t++) {
          const c = { x: 0, z: +rng.uniform(Z_RANGE[0], Z_RANGE[1]).toFixed(3),
            w: +rng.uniform(W_RANGE[0], W_RANGE[1]).toFixed(3), d: +rng.uniform(D_RANGE[0], D_RANGE[1]).toFixed(3), h: hs[i], yawDeg: +rng.uniform(-25, 25).toFixed(1) };
          const u = (cols[i] + rng.uniform(-COL_JIT, COL_JIT) - camera.cx) / camera.f, F = camera.F, Rv = camera.R, e = camera.eye;
          const dz = c.z - e[2], dy = c.h / 2 - e[1];
          c.x = +(e[0] + (dz * Rv[2] - u * (dy * F[1] + dz * F[2])) / (u * F[0] - Rv[0])).toFixed(3);
          if (!layoutOk([...pillars, c], camera)) continue;
          pillars.push(c); placed = true;
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;
      const disp = rng.shuffle(pillars);
      m.pillars = disp;
      m.order = orderIdx(N, (i) => disp[i].h);
      if (axisK(disp, camera, m.order) !== want) continue;
      if (!contractOk(m)) continue;
      return m;
    }
    throw new Error('world_size_order: no valid scene');
  },

  ...mech,

  randomPolicy(m, rnd) {
    const ids = m.pillars.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.map((idx) => ({ op: 'tap', idx }));
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap the posts from shortest to tallest', 'By real height, not size on screen');
  },

  featureGeometry(m) {
    const bs = screenBoxes(m);
    return { featureRequirements: ['target'],
      features: bs.map((b, i) => ({ id: `post${i}`, kind: 'target', effectiveWidthPx: b.x1 - b.x0 + 12, effectiveHeightPx: b.y1 - b.y0 + 12 })),
      coverage: { complete: true, scope: 'Every post tap region (its projected box plus a 6 px pad); posts never overlap on screen.' } };
  },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state;
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    this._cache ??= {};
    const look = env.style ? env.assets?.look : null;
    if (look) paintTraced(g, this._cache, JSON.stringify(m.pillars) + JSON.stringify(m.cam) + '|style|' + look.key, () => sceneStyled(m, look));
    else paintTraced(g, this._cache, JSON.stringify(m.pillars) + JSON.stringify(m.cam), () => sceneOf(m));
    const cam = cameraOf(m);
    m.pillars.forEach((c, i) => {
      const k = st.seq.indexOf(i);
      if (k < 0) return;
      const b = screenBox(c, cam), x = (b.x0 + b.x1) / 2, y = b.y0 - 15;
      g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2);
      g.fillStyle = ACCENT; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 12px ${UI_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), x, y + 0.5);
    });
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const bs = screenBoxes(env.manifest);
    let best = -1, bd = Infinity;
    bs.forEach((b, i) => {
      if (evt.x < b.x0 - 6 || evt.x > b.x1 + 6 || evt.y < b.y0 - 28 || evt.y > b.y1 + 6) return;
      const d = Math.abs(evt.x - (b.x0 + b.x1) / 2);
      if (d < bd) { bd = d; best = i; }
    });
    return best >= 0 ? [{ op: 'tap', idx: best }] : [];
  },

  footerStatus(env) {
    const n = env.state.seq.length;
    return n ? `${n} of ${N} tapped · tap a number to undo` : 'Tap the shortest post first';
  },
};

export default task;

export function semanticKey(m) {
  const cam = cameraOf(m), xs = m.pillars.map((p) => cam.project(p.x, p.h / 2, p.z).x);
  const rankX = xs.map((x) => xs.filter((y) => y < x).length);
  const real = m.order;
  return `world_size_order|${scramble(m.pillars, cam, m.order)}|${real.map((i) => `${rankX[i]}:${Math.round(m.pillars[i].z / 0.5)}`).join(' ')}`;
}
