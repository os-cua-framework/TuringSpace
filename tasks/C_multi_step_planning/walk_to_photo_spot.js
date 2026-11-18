import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { splitIds } from '../core/style.js';
import { mulberry32, R } from '../core/rng.js';
import { DIRS, PROP, poseOf, labelImage, renderView, roomScene, LAB } from '../common/_walk_to_photo_spot_room.js';
import { bakeLightmaps, toCanvas } from '../common/_walk_to_photo_spot_rt.js';
import { sampleRoom, sampleRoomExt, themesFor } from '../common/_walk_to_photo_spot_layout.js';

const NAME = 'walk_to_photo_spot';
const BOARD = { w: 340, h: 356 };
const VIEW = { w: 340, h: 200 };
const PHOTO = { x: 0, y: 212, w: 216, h: 132, pad: 6 };
const BTN = { x: 228, y: 212, w: 112, h: 42, gap: 7 };
const MOVES = ['forward', 'back', 'left', 'right'];
const DEPTH_RATIO = 1.2;
const DISS_MIN = 0.4, MIN_STEPS = 5, MAX_STEPS = 9;
const EXT_DISS_MIN = 0.55, EXT_MIN_STEPS = 3, EXT_MAX_STEPS = 6;
const dissMin = (m) => (m.ext ? EXT_DISS_MIN : DISS_MIN);
const stepRange = (m) => (m.ext ? [EXT_MIN_STEPS, EXT_MAX_STEPS] : [MIN_STEPS, MAX_STEPS]);

const key = (c, r) => `${c},${r}`;
const pkey = (c, r, h) => `${c},${r},${h}`;

function freeSet(m) { return new Set(m.free.map(([c, r]) => key(c, r))); }
function step(fs, c, r, h, mv) {
  if (mv === 'left') return [c, r, (h + 3) % 4];
  if (mv === 'right') return [c, r, (h + 1) % 4];
  const d = mv === 'forward' ? DIRS[h] : DIRS[(h + 2) % 4];
  return fs.has(key(c + d[0], r + d[1])) ? [c + d[0], r + d[1], h] : [c, r, h];
}
function shortest(m, a, b) {
  const fs = freeSet(m), start = pkey(a.col, a.row, a.heading), goal = pkey(b.col, b.row, b.heading);
  const prev = new Map([[start, null]]), q = [[a.col, a.row, a.heading]];
  for (let i = 0; i < q.length; i++) {
    const [c, r, h] = q[i], k = pkey(c, r, h);
    if (k === goal) break;
    for (const mv of MOVES) {
      const n = step(fs, c, r, h, mv), nk = pkey(...n);
      if (!prev.has(nk)) { prev.set(nk, [k, mv]); q.push(n); }
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let k = goal; prev.get(k); k = prev.get(k)[0]) path.unshift(prev.get(k)[1]);
  return path;
}

function twinCanon(m) {
  const map = new Map(), lamps = new Map();
  for (const p of m.props) if (p.type === 'lamp') { if (!lamps.has(p.col)) lamps.set(p.col, 1000 + p.id); map.set(1000 + p.id, lamps.get(p.col)); }
  let win = -1;
  for (const f of m.room.feats) if (f.kind === 'window') { if (win < 0) win = 200 + f.fid; map.set(200 + f.fid, win); }
  return map;
}
function analyse(m) {
  const imgs = new Map(), canon = m.ext ? null : twinCanon(m);
  for (const [c, r] of m.free) for (let h = 0; h < 4; h++) {
    const im = labelImage(m, [c, r], h, VIEW.w, VIEW.h);
    if (canon && canon.size) for (let i = 0; i < im.lab.length; i++) { const q = canon.get(im.lab[i]); if (q !== undefined) im.lab[i] = q; }
    const n = im.lab.length, cnt = new Map(), sx = new Map(), dmin = new Map();
    for (let i = 0; i < n; i++) {
      const l = im.lab[i];
      if (l < 100) continue;
      cnt.set(l, (cnt.get(l) || 0) + 1);
      sx.set(l, (sx.get(l) || 0) + (i % LAB.cols + 0.5) / LAB.cols);
      dmin.set(l, Math.min(dmin.get(l) ?? Infinity, im.dep[i]));
    }
    im.stats = { n, cnt, cx: new Map([...sx].map(([l, v]) => [l, v / cnt.get(l)])), dmin };
    imgs.set(pkey(c, r, h), im);
  }
  return imgs;
}
function diss(A, B) {
  let n = 0, diff = 0;
  for (let i = 0; i < A.lab.length; i++) {
    const a = A.lab[i], b = B.lab[i];
    if (a < 100 && b < 100) continue;
    n++;
    if (a !== b) { diff++; continue; }
    const q = A.dep[i] / B.dep[i];
    if (q > DEPTH_RATIO || q < 1 / DEPTH_RATIO) diff++;
  }
  return n ? diff / n : 0;
}
function photoInfo(im) {
  const { n, cnt, cx, dmin } = im.stats;
  let named = 0, pieces = 0, maxF = 0, dom = -1, near = Infinity;
  for (const [l, k] of cnt) {
    named += k;
    if (l < 1000) continue;
    if (k > maxF) { maxF = k; dom = l; }
    if (k >= 0.025 * n) { pieces++; near = Math.min(near, dmin.get(l)); }
  }
  const ok = pieces >= 2 && maxF <= 0.4 * n && named >= 0.25 * n && near <= 3.6;
  return { ok, dom: dom >= 1000 ? dom - 1000 : -1, domCx: dom >= 0 ? cx.get(dom) : 0.5 };
}
function targetOk(m, imgs, t) {
  const T = imgs.get(pkey(t.col, t.row, t.heading));
  if (!T) return false;
  const info = photoInfo(T);
  if (!info.ok || info.dom < 0) return false;
  if (Math.abs(info.domCx - 0.5) < 0.1) return false;
  if (!freeSet(m).has(key(t.col + DIRS[t.heading][0], t.row + DIRS[t.heading][1]))) return false;
  const dm = dissMin(m);
  for (const [k, im] of imgs) if (k !== pkey(t.col, t.row, t.heading) && diss(T, im) < dm) return false;
  return true;
}
function sharedLandmarks(A, B) {
  let k = 0;
  for (const [l, a] of A.stats.cnt) if (a >= 0.015 * A.stats.n && (B.stats.cnt.get(l) || 0) >= 0.015 * B.stats.n) k++;
  return k;
}
function startOk(m, imgs, s, t) {
  if (s.col === t.col && s.row === t.row) return false;
  if (s.heading === t.heading && (DIRS[s.heading][0] === 0 ? s.col === t.col : s.row === t.row)) return false;
  if (!freeSet(m).has(key(s.col + DIRS[s.heading][0], s.row + DIRS[s.heading][1]))) return false;
  const S = imgs.get(pkey(s.col, s.row, s.heading));
  let named = 0, pieces = 0;
  for (const [l, k] of S.stats.cnt) { named += k; if (l >= 1000 && k >= 0.025 * S.stats.n) pieces++; }
  if (pieces < 1 || named < 0.2 * S.stats.n) return false;
  const path = shortest(m, s, t);
  const [lo, hi] = stepRange(m);
  if (!path || path.length < lo || path.length > hi) return false;
  return sharedLandmarks(imgs.get(pkey(s.col, s.row, s.heading)), imgs.get(pkey(t.col, t.row, t.heading))) >= 2;
}

function structureOk(m) {
  if (!m || m.task !== NAME || !m.room || !Array.isArray(m.props) || !Array.isArray(m.free)) return false;
  const { W, D } = m.room;
  const sizes = [5, 6];
  if (!sizes.includes(W) || !sizes.includes(D)) return false;
  if (m.ext && (!m.props.every((p) => PROP[p.type]) || !themesFor(m.ext).includes(m.room.theme))) return false;
  const occ = new Set();
  for (const p of m.props) for (const [c, r] of p.cells) {
    if (c < 0 || r < 0 || c >= W || r >= D || occ.has(key(c, r))) return false;
    occ.add(key(c, r));
  }
  const fs = freeSet(m);
  if (fs.size + occ.size !== W * D) return false;
  for (const k of fs) if (occ.has(k)) return false;
  const seen = new Set([key(...m.free[0])]), q = [m.free[0]];
  while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of DIRS) { const k = key(c + dc, r + dr); if (fs.has(k) && !seen.has(k)) { seen.add(k); q.push([c + dc, r + dr]); } } }
  if (seen.size !== fs.size) return false;
  for (const p of [m.start, m.target]) if (!p || !fs.has(key(p.col, p.row)) || ![0, 1, 2, 3].includes(p.heading)) return false;
  return true;
}
function contractOk(m, imgs = null) {
  if (!structureOk(m)) return false;
  imgs = imgs || analyse(m);
  if (!targetOk(m, imgs, m.target) || !startOk(m, imgs, m.start, m.target)) return false;
  const path = shortest(m, m.start, m.target);
  return !!path && path.length <= 12;
}
export function semanticKey(m) {
  const props = m.props.map((p) => `${p.type}@${p.cells.map((c) => c.join('.')).sort().join('+')}`).sort().join(';');
  const feats = m.room.feats.map((f) => `${f.kind}@${f.w}:${Math.floor((f.u0 + f.u1) / 2)}`).sort().join(';');
  const pose = (p) => `${p.col},${p.row},${p.heading}`;
  return `walk_to_photo_spot|${m.room.W}x${m.room.D}|${props}|${feats}|S${pose(m.start)}|T${pose(m.target)}`;
}
export function gate(m) { try { return contractOk(m); } catch { return false; } }

function tryBuild(rng, ext = null) {
  const room = ext ? sampleRoomExt(rng, rng.pick(themesFor(ext)), ext) : sampleRoom(rng);
  if (!room) return null;
  const m = ext ? { task: NAME, board: BOARD, room: room.room, props: room.props, free: room.free, ext }
    : { task: NAME, board: BOARD, room: room.room, props: room.props, free: room.free };
  if (!structureOk({ ...m, start: { col: m.free[0][0], row: m.free[0][1], heading: 0 }, target: { col: m.free[0][0], row: m.free[0][1], heading: 0 } })) return null;
  const imgs = analyse(m);
  const poses = [];
  for (const [c, r] of m.free) for (let h = 0; h < 4; h++) poses.push({ col: c, row: r, heading: h });
  for (const t of rng.shuffle(poses).slice(0, 40)) {
    if (!targetOk(m, imgs, t)) continue;
    const starts = poses.filter((s) => startOk(m, imgs, s, t));
    if (!starts.length) continue;
    const byTurn = new Map();
    for (const s of starts) {
      const f = DIRS[s.heading], rt = DIRS[(s.heading + 1) % 4], dx = t.col - s.col, dz = t.row - s.row;
      const dh = (t.heading - s.heading + 4) % 4, ck = `${dx * f[0] + dz * f[1]},${dx * rt[0] + dz * rt[1]}`;
      if (!byTurn.has(dh)) byTurn.set(dh, new Map());
      const g = byTurn.get(dh);
      if (!g.has(ck)) g.set(ck, []);
      g.get(ck).push(s);
    }
    const turns = [...byTurn.keys()].sort();
    const cls = byTurn.get(rng.pick(turns));
    const ks = [...cls.keys()].sort(), wt = ks.map((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a) + Math.abs(b); });
    let x = rng.raw() * wt.reduce((u, v) => u + v, 0), ck = ks[ks.length - 1];
    for (let i = 0; i < ks.length; i++) { x -= wt[i]; if (x <= 0) { ck = ks[i]; break; } }
    const s = rng.pick(cls.get(ck));
    const out = { ...m, start: { ...s }, target: { ...t },
      gtContract: 'the (floor cell, facing) the photo was taken from; Verify needs both' };
    if (contractOk(out, imgs)) return out;
  }
  return null;
}

const VIS = new WeakMap();
function visPose(st) {
  const target = poseOf(st.cell, st.heading);
  let v = VIS.get(st);
  if (!v) { v = { ...target }; VIS.set(st, v); }
  return { v, target };
}
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
function devScale(g) {
  try { const t = g.getTransform(); return Math.max(1, Math.min(2, Math.round(Math.hypot(t.a, t.b) * 4) / 4)); } catch { return 1; }
}
const VIEWS = new WeakMap();
function viewCanvas(m, pose, q, still, look = null) {
  if (!still) return toCanvas(look ? renderView(m, pose, VIEW.w, VIEW.h, 0.45, 1, look) : renderView(m, pose, VIEW.w, VIEW.h, 0.45, 1));
  const store = look ? (look.views ||= new WeakMap()) : VIEWS;
  let cache = store.get(m);
  if (!cache) { cache = new Map(); store.set(m, cache); }
  const k = `${pose.x.toFixed(3)},${pose.z.toFixed(3)},${pose.ang.toFixed(4)},${q}`;
  let cv = cache.get(k);
  if (!cv) {
    cv = toCanvas(look ? renderView(m, pose, VIEW.w, VIEW.h, q, 0, look) : renderView(m, pose, VIEW.w, VIEW.h, q));
    cache.set(k, cv);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return cv;
}
const PHOTOS = new WeakMap();
function photoCanvas(m, q, look = null) {
  const store = look ? (look.photos ||= new WeakMap()) : PHOTOS;
  let p = store.get(m);
  if (!p || p.q !== q) {
    const t = m.target, iw = PHOTO.w - 2 * PHOTO.pad, ih = PHOTO.h - 2 * PHOTO.pad;
    p = { q, cv: toCanvas(look ? renderView(m, poseOf([t.col, t.row], t.heading), iw, ih, q, 0, look) : renderView(m, poseOf([t.col, t.row], t.heading), iw, ih, q)) };
    store.set(m, p);
  }
  return p.cv;
}

const FLOOR_SKIP = new Set(['asphalt_02', 'asphalt_01', 'asphalt_pit_lane', 'asphalt_06', 'gravel_concrete_03', 'dry_riverbed_rock', 'brick_moss_001', 'hangar_concrete_floor', 'cobblestone_floor_08']);
async function walkLook(style) {
  const [S3, T] = await Promise.all([import('../common/_style3d.js'), import('../common/_walk_to_photo_spot_tex.js')]);
  const floors = style.pool('tex', (t) => (t.use === 'wood' || t.use === 'floor' || (t.use === 'fabric' && /carpet|wool|hessian|linen|corduroy|velvet|terry|teddy_natural/.test(t.id))) && !FLOOR_SKIP.has(t.id));
  const walls = style.pool('tex', (t) => t.use === 'wall' || (t.use === 'wood' && /plank|wall/.test(t.id)));
  const hdris = style.pool('hdri', (h) => h.use !== 'indoor' && h.use !== 'studio');
  const [fi, wi, hi] = style.primaryCombo('g09-walk-look', [floors.length, walls.length, hdris.length]);
  const fl = floors[fi], wl = walls[wi], hd = hdris[hi];
  const ac = style.pick('tex', (t) => t.use === 'wall' && t.id !== wl.id), wd = style.pick('tex', (t) => t.use === 'wood'), fb = style.pick('tex', (t) => t.use === 'fabric');
  style.note(`tex:${fl.id}`); style.note(`tex:${wl.id}`); style.note(`hdri:${hd.id}`);
  const r = style.rand;
  const [FT, WT, AT, DT, BT, SKY] = await Promise.all([fl, wl, ac, wd, fb].map((a) => S3.loadTexture(a.file)).concat([S3.loadSky(hd.sky)]));
  const fS = T.linSampler(FT, { size: 1.2 + 1.2 * r(), L: 0.1 + 0.22 * r(), contrast: 0.85, sat: 0.45 });
  const wS = T.linSampler(WT, { size: 1.8 + 1.2 * r(), L: 0.32 + 0.3 * r(), contrast: 0.55, sat: 0.3 });
  const aS = T.linSampler(AT, { size: 1.8, L: 0.18 + 0.25 * r(), contrast: 0.55, sat: 0.35 });
  const woodP = T.lumPattern(DT, { size: 0.7, amt: 0.2 }), clothP = T.lumPattern(BT, { size: 0.35, amt: 0.1, lo: 0.85, hi: 1.15 });
  const sky = S3.skyFn(SKY, 0.62, 0.3);
  const KELV = [['2700', [1.0, 0.86, 0.66]], ['3200', [1.0, 0.9, 0.76]], ['4000', [1.0, 0.94, 0.86]], ['5000', [0.98, 0.98, 0.98]]];
  const kSplit = splitIds('g09_walk_kelvin_v2', KELV.map(([n]) => n), 1), kel = KELV.filter(([n]) => kSplit(n) === style.split);
  const [kName, kelvin] = kel[Math.floor(r() * kel.length)];
  style.note(`g09_walk_kelvin:${kName}`);
  const amb = S3.scaleTo(S3.safeTint(S3.shIrradiance(hd.sh9_norm, 0, 1, 0), { maxSat: 0.15, otherSat: 0.06 }), 1);
  const WALLH = 2.6;
  return {
    ids: { floor: fl.id, wall: wl.id, accent: ac.id, hdri: hd.id },
    mat(name, hex, def) {
      if (name === 'wood') return { ...def, tex: (x, y, z, nx, ny, nz, s, out, fp) => { const [u, v] = T.planar(x, y, z, nx, ny, nz); const f = woodP(u, v, fp || 0.002); out[0] = def.c[0] * f; out[1] = def.c[1] * f; out[2] = def.c[2] * f; } };
      if (name === 'cloth') return { ...def, tex: (x, y, z, nx, ny, nz, s, out, fp) => { const [u, v] = T.planar(x, y, z, nx, ny, nz); const f = clothP(u, v, fp || 0.002); out[0] = def.c[0] * f; out[1] = def.c[1] * f; out[2] = def.c[2] * f; } };
      return def;
    },
    floor: (x, z, fp, out) => fS(x, z, fp, out),
    wall: (w, u, y, fp, accent, out) => (accent ? aS : wS)(u + w * 7.3, WALLH - y, fp, out),
    sky: (dx, dy, dz, out) => sky(dx, Math.max(0, dy), dz, out),
    light(L) {
      L.col = L.col.map((v, c) => v * kelvin[c] / Math.max(...kelvin));
      L.sky = L.sky.map((v, c) => v * amb[c]);
      L.fill = { ...L.fill, col: L.fill.col.map((v, c) => v * amb[c]) };
    },
  };
}

export default {
  meta: {
    name: NAME, family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'move', move: 'forward | back | left | right (turns are 90°)' }],
    promptHuman: 'Walk to where this photo was taken',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      for (let a = 0; a < 200; a++) { const m = tryBuild(rng, knobs.ext); if (m) return m; }
      throw new Error('walk_to_photo_spot: ext generator exhausted');
    }
    for (let a = 0; a < 60; a++) { const m = tryBuild(rng); if (m) return m; }
    for (let k = 0; ; k++) { const m = tryBuild(R(mulberry32(0x5eed + k))); if (m) return m; }
  },

  init(m) {
    return { cell: [m.start.col, m.start.row], heading: m.start.heading };
  },

  applyAction(state, action, m) {
    if (!action || action.op !== 'move' || !MOVES.includes(action.move)) return { ok: false, reason: 'bad-op' };
    const fs = freeSet(m);
    const [c, r, h] = step(fs, state.cell[0], state.cell[1], state.heading, action.move);
    const moved = c !== state.cell[0] || r !== state.cell[1];
    state.cell = [c, r]; state.heading = h;
    return { ok: true, moved };
  },

  verify(state, m) {
    const ok = state.cell[0] === m.target.col && state.cell[1] === m.target.row && state.heading === m.target.heading;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { at: { col: state.cell[0], row: state.cell[1], heading: state.heading } } };
  },

  oracle(m) {
    return shortest(m, m.start, m.target).map((mv) => ({ op: 'move', move: mv }));
  },

  randomPolicy(m, rnd) {
    const n = 1 + Math.floor(rnd() * 8), acts = [];
    for (let i = 0; i < n; i++) acts.push({ op: 'move', move: MOVES[Math.floor(rnd() * 4)] });
    return acts;
  },

  async mount(env) {
    const m = env && env.manifest;
    if (env && env.style) {
      env.assets.look = await walkLook(env.style);
      if (m && typeof document !== 'undefined') bakeLightmaps(roomScene(m, env.assets.look));
      return;
    }
    if (m && typeof document !== 'undefined') bakeLightmaps(roomScene(m));
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Walk to where this photo was taken', 'Face the same way the camera did');
  },

  tick(env, dt) {
    const st = env && env.state;
    if (!st) return false;
    const { v, target } = visPose(st);
    const dx = target.x - v.x, dz = target.z - v.z, da = angDiff(v.ang, target.ang);
    if (Math.abs(dx) + Math.abs(dz) < 1e-3 && Math.abs(da) < 1e-3) { Object.assign(v, target); return false; }
    const k = Math.min(1, dt * 7);
    v.x += dx * k + Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.6);
    v.z += dz * k + Math.sign(dz) * Math.min(Math.abs(dz), dt * 0.6);
    v.ang += da * k + Math.sign(da) * Math.min(Math.abs(da), dt * 0.9);
    if (Math.abs(target.x - v.x) < 0.02 && Math.abs(target.z - v.z) < 0.02 && Math.abs(angDiff(v.ang, target.ang)) < 0.02) Object.assign(v, target);
    return true;
  },

  _drawView(g, m, st, look = null) {
    const { v, target } = visPose(st);
    const still = Math.abs(v.x - target.x) + Math.abs(v.z - target.z) < 1e-6 && Math.abs(angDiff(v.ang, target.ang)) < 1e-6;
    const cv = viewCanvas(m, still ? target : v, devScale(g), still, look);
    g.save(); g.beginPath(); rr(g, 0, 0, VIEW.w, VIEW.h, 8); g.clip();
    g.imageSmoothingEnabled = true;
    if (cv && g.drawImage) g.drawImage(cv, 0, 0, VIEW.w, VIEW.h);
    g.restore();
  },

  _drawPhoto(g, m, look = null) {
    const { x, y, w, h, pad } = PHOTO;
    g.save();
    g.shadowColor = 'rgba(20,30,45,.22)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
    rr(g, x + 1, y, w - 2, h, 4); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    rr(g, x + 1.5, y + 0.5, w - 3, h - 1, 4); g.strokeStyle = '#dde2e8'; g.lineWidth = 1; g.stroke();
    const cv = photoCanvas(m, devScale(g), look);
    if (cv && g.drawImage) g.drawImage(cv, x + pad, y + pad, w - 2 * pad, h - 2 * pad);
  },

  _btnRects() {
    const { x, y, w, h, gap } = BTN, half = (w - gap) / 2;
    return {
      forward: { x, y, w, h },
      left: { x, y: y + h + gap, w: half, h },
      right: { x: x + half + gap, y: y + h + gap, w: half, h },
      back: { x, y: y + 2 * (h + gap), w, h },
    };
  },

  _drawButtons(g) {
    const R = this._btnRects();
    for (const k of ['forward', 'left', 'right', 'back']) {
      const b = R[k];
      rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = '#eef2f6'; g.fill();
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = '#3c4955';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - 6;
      if (k === 'forward') {
        g.beginPath(); g.moveTo(cx, cy + 7); g.lineTo(cx, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy - 1); g.lineTo(cx, cy - 8); g.lineTo(cx + 7, cy - 1); g.stroke();
      } else if (k === 'back') {
        g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 6); g.stroke();
        g.beginPath(); g.moveTo(cx - 7, cy + 1); g.lineTo(cx, cy + 8); g.lineTo(cx + 7, cy + 1); g.stroke();
      } else {
        const s = k === 'left' ? -1 : 1;
        g.beginPath(); g.moveTo(cx - s * 6, cy + 8); g.lineTo(cx - s * 6, cy); g.quadraticCurveTo(cx - s * 6, cy - 6, cx, cy - 6); g.lineTo(cx + s * 7, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 3, cy - 11); g.lineTo(cx + s * 8, cy - 6); g.lineTo(cx + s * 3, cy - 1); g.stroke();
      }
      g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k === 'forward' ? 'Forward' : k === 'back' ? 'Back' : k === 'left' ? 'Turn left' : 'Turn right', cx, b.y + b.h - 8);
    }
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, br.w, br.h);
    const look = env.style ? env.assets.look : null;
    this._drawView(g, m, st, look);
    this._drawPhoto(g, m, look);
    this._drawButtons(g);
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    const R = this._btnRects();
    for (const k of ['left', 'forward', 'right', 'back']) {
      const b = R[k];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ op: 'move', move: k }];
    }
    return [];
  },

  footerStatus() {
    return 'Walk with the buttons';
  },
};
