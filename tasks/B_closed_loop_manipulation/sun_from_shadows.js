import { clamp, deg2rad, rad2deg } from '../core/geom.js';
import { drawPromptText, UI_FONT } from '../core/panel.js';
import { nthOf } from '../core/style.js';
import { mulberry32, R as RW } from '../core/rng.js';
import { splitList, chooseSplit, primaryOf, texPool, isDirectional, makeMaterial, fillMaterial, rectShape, skyWindow, skyGradient, paintedSky, hsl, shadeHex, rgba } from '../common/_material_kit.js';

const BOARD = { w: 340, h: 380 };
const HORIZON_Y = 236;
const ARC = { cx: BOARD.w / 2, cy: HORIZON_Y, R: 150 };
const ROWS = [266, 306, 346];
const DEFAULT_T = 90;
const GRAB_R = 24;
const HARD = Object.freeze({
  rounds: 1, posts: 3, tolDeg: 12,
  heightBands: [[56, 62], [67, 73], [78, 84]],
  minLen: 10, maxLen: 300, edge: 14, minGapX: 22, minHeightRatio: 1.25,
});
const T_BANDS = [[16, 78], [102, 164]];

const cot = (tDeg) => 1 / Math.tan(deg2rad(tDeg));
export const sunPos = (t) => ({ x: ARC.cx + ARC.R * Math.cos(deg2rad(t)), y: ARC.cy - ARC.R * Math.sin(deg2rad(t)) });
export const angleOf = (x, y) => clamp(rad2deg(Math.atan2(ARC.cy - y, x - ARC.cx)), 0, 180);

const SCENE = Object.freeze({
  pitch: [34, 48], azim: [30, 58], camK: [2.8, 3.6], gridTurn: [20, 35], RA: 140, gridStep: 34,
  archW: 230, archH: 210, archTop: [26, 64], spreadX: 1.5, spreadY: [-0.9, 1.5],
  margin: 14, baseGap: 36, topGap: 26, shadowClear: 14, footClear: 26, handleClear: 34, archClear: 16,
  minShadow: 14, shadowOut: 10,
  shortcutMiss: 15, search: 24,
});
const isView = (m) => !!(m && m.view);
function proj(v, X, Y, Z = 0) {
  const p = deg2rad(v.p), cp = Math.cos(p), sp = Math.sin(p), D = v.k * v.RA;
  const xc = X, yc = Y * sp + Z * cp, zc = Y * cp - Z * sp + D;
  return { x: v.cx + v.f * xc / zc, y: v.cy - v.f * yc / zc, s: v.f / zc };
}
function archDir(v, t) {
  const a = deg2rad(v.a), tr = deg2rad(t);
  return { X: Math.cos(tr) * Math.cos(a), Y: Math.cos(tr) * Math.sin(a), Z: Math.sin(tr) };
}
function sunPos3(v, t) { const d = archDir(v, t); return proj(v, v.RA * d.X, v.RA * d.Y, v.RA * d.Z); }
function nearestT(v, x, y) {
  let best = 90, bd = Infinity;
  for (let t = 0; t <= 180; t += 0.5) { const s = sunPos3(v, t), d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = t; } }
  for (let t = Math.max(0, best - 0.5); t <= Math.min(180, best + 0.5); t += 0.05) { const s = sunPos3(v, t), d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = t; } }
  return +best.toFixed(2);
}
function postScreen(v, t, P) {
  const a = deg2rad(v.a), k = cot(t);
  const tipW = { X: P.X - P.h * k * Math.cos(a), Y: P.Y - P.h * k * Math.sin(a) };
  const b = proj(v, P.X, P.Y), top = proj(v, P.X, P.Y, P.h), tip = proj(v, tipW.X, tipW.Y);
  return { b, top, tip, tipW };
}
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
};
function sceneOk(v, rd) {
  const M = SCENE.margin, W = BOARD.w, H = BOARD.h;
  const arch = [];
  for (let t = 0; t <= 180; t += 3) arch.push(sunPos3(v, t));
  if (arch.some((s) => s.x < 20 || s.x > W - 20 || s.y < 20 || s.y > H - 20)) return false;
  const feet = [sunPos3(v, 0), sunPos3(v, 180), proj(v, 0, 0)], handle = sunPos3(v, 90);
  const g = rd.posts.map((P) => postScreen(v, rd.t, P));
  for (let i = 0; i < g.length; i++) {
    const q = g[i];
    for (const pt of [q.b, q.tip]) if (pt.x < M || pt.x > W - M || pt.y < M || pt.y > H - M) return false;
    if (q.top.y < M + 10 || q.top.x < M + 8 || q.top.x > W - M - 22) return false;
    if (feet.some((f) => Math.hypot(f.x - q.b.x, f.y - q.b.y) < SCENE.footClear || segDist(f, q.b, q.tip) < 10)) return false;
    if (Math.hypot(q.tip.x - q.b.x, q.tip.y - q.b.y) < SCENE.minShadow || segDist(q.tip, q.b, q.top) < SCENE.shadowOut) return false;
    const crown = { x: q.top.x, y: q.top.y - 10 };
    if (arch.some((s) => segDist(s, q.b, crown) < SCENE.archClear)) return false;
    if (segDist(handle, q.b, crown) < SCENE.handleClear) return false;
    for (let j = 0; j < g.length; j++) {
      if (j === i) continue;
      const o = g[j];
      if (Math.hypot(q.b.x - o.b.x, q.b.y - o.b.y) < SCENE.baseGap || Math.hypot(q.top.x - o.top.x, q.top.y - o.top.y) < SCENE.topGap) return false;
      if (segDist(q.b, o.b, o.tip) < SCENE.shadowClear) return false;
      if (Math.abs(q.b.x - o.b.x) < 30 && q.top.y < o.b.y && q.b.y > o.top.y) return false;
    }
  }
  return true;
}
function shortcutMissOf(v, rd) {
  return Math.abs(shortcutTs(v, rd).ratio - rd.t);
}
function shortcutTs(v, rd) {
  const g = rd.posts.map((P) => postScreen(v, rd.t, P));
  let e = 0, side = 0, dx = 0, dy = 0;
  for (const q of g) {
    const H = Math.hypot(q.top.x - q.b.x, q.top.y - q.b.y), L = Math.hypot(q.tip.x - q.b.x, q.tip.y - q.b.y);
    e += rad2deg(Math.atan2(H, L)) / g.length;
    side += q.tip.x < q.b.x ? 1 : -1;
    const n = Math.hypot(q.top.x - q.tip.x, q.top.y - q.tip.y) || 1;
    dx += (q.top.x - q.tip.x) / n; dy += (q.top.y - q.tip.y) / n;
  }
  const ratio = side > 0 ? e : 180 - e;
  const peg = proj(v, 0, 0), da = Math.atan2(dy, dx);
  let screenDir = 90, best = Infinity;
  for (let t = 0; t <= 180; t += 0.5) {
    const s = sunPos3(v, t);
    let d = Math.abs(Math.atan2(s.y - peg.y, s.x - peg.x) - da);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < best) { best = d; screenDir = t; }
  }
  return { ratio, screenDir };
}
function makeRound3(rng, v, t, heights, kinds) {
  for (let att = 0; att < 150; att++) {
    const posts = heights.map((h, i) => ({
      X: +rng.uniform(-SCENE.spreadX * v.RA, SCENE.spreadX * v.RA).toFixed(1),
      Y: +rng.uniform(SCENE.spreadY[0] * v.RA, SCENE.spreadY[1] * v.RA).toFixed(1),
      h, kind: kinds[i],
    }));
    const rd = { t, posts };
    if (!sceneOk(v, rd)) continue;
    const order = posts.map((P, i) => i).sort((i, j) => posts[j].Y - posts[i].Y);
    order.forEach((i, r) => { posts[i].row = r; });
    posts.forEach((P) => { const q = postScreen(v, t, P); P.x = +q.b.x.toFixed(2); P.sy = +q.b.y.toFixed(2); });
    return rd;
  }
  return null;
}
function generate3(rng) {
  const band = rng.pick(T_BANDS), t = rng.int(band[0], band[1]);
  const heights = rng.shuffle(HARD.heightBands.map(([a, b]) => +rng.uniform(a, b).toFixed(1)));
  const kinds = rng.shuffle([0, 1, 2]);
  let best = null, bestMiss = -1, found = 0;
  for (let att = 0; att < 800 && found < SCENE.search && bestMiss < SCENE.shortcutMiss; att++) {
    const v = {
      p: rng.int(SCENE.pitch[0], SCENE.pitch[1]), a: rng.pick([-1, 1]) * rng.int(SCENE.azim[0], SCENE.azim[1]),
      k: +rng.uniform(SCENE.camK[0], SCENE.camK[1]).toFixed(3),
      grid: rng.pick([-1, 1]) * rng.int(SCENE.gridTurn[0], SCENE.gridTurn[1]),
      RA: SCENE.RA, f: 1, cx: 0, cy: 0,
    };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let tt = 0; tt <= 180; tt += 3) { const s = sunPos3(v, tt); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    v.f = +Math.min(SCENE.archW / (x1 - x0), SCENE.archH / (y1 - y0)).toFixed(3);
    v.cx = +(BOARD.w / 2 - v.f * (x0 + x1) / 2).toFixed(2);
    v.cy = +(rng.int(SCENE.archTop[0], SCENE.archTop[1]) - v.f * y0).toFixed(2);
    const rd = makeRound3(rng, v, t, heights, kinds);
    if (!rd) continue;
    found++;
    const miss = shortcutMissOf(v, rd);
    if (miss > bestMiss) { bestMiss = miss; best = { task: 'sun_from_shadows', board: BOARD, view: v, tolDeg: HARD.tolDeg, rounds: [rd] }; }
  }
  if (!best) throw new Error('sun_from_shadows: no oblique scene fits');
  best.shortcutMiss = +bestMiss.toFixed(1);
  return best;
}
function gate3(m) {
  const v = m.view;
  if (m.task !== 'sun_from_shadows' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || m.tolDeg !== HARD.tolDeg) return false;
  if (!Number.isInteger(v.p) || v.p < SCENE.pitch[0] || v.p > SCENE.pitch[1] || !Number.isInteger(v.a) || Math.abs(v.a) < SCENE.azim[0] || Math.abs(v.a) > SCENE.azim[1]) return false;
  if (v.RA !== SCENE.RA || !(v.k >= SCENE.camK[0] && v.k <= SCENE.camK[1]) || !(v.f > 0)) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  const r = m.rounds[0];
  if (!Number.isInteger(r.t) || !T_BANDS.some(([a, b]) => r.t >= a && r.t <= b) || !Array.isArray(r.posts) || r.posts.length !== HARD.posts) return false;
  const hs = r.posts.map((p) => p.h);
  if (new Set(hs).size !== HARD.posts || Math.max(...hs) / Math.min(...hs) < HARD.minHeightRatio) return false;
  if (new Set(r.posts.map((p) => p.kind)).size !== HARD.posts) return false;
  if (!r.posts.every((p) => p.h >= HARD.heightBands[0][0] && p.h <= HARD.heightBands[2][1])) return false;
  return sceneOk(v, r);
}

function xRange(len, dir) {
  const lo = dir < 0 ? HARD.edge + len : HARD.edge + 10;
  const hi = dir < 0 ? BOARD.w - HARD.edge - 10 : BOARD.w - HARD.edge - len;
  return [lo, hi];
}

function makeRound(rng) {
  const band = rng.pick(T_BANDS), t = rng.int(band[0], band[1]);
  const k = cot(t), absK = Math.abs(k), dir = k > 0 ? -1 : 1;
  const heights = rng.shuffle(HARD.heightBands.map(([a, b]) => +rng.uniform(a, b).toFixed(1)));
  const kinds = rng.shuffle([0, 1, 2]);
  const order = [0, 1, 2].sort((a, b) => heights[b] - heights[a]);
  let xs = null;
  for (let attempt = 0; attempt < 60 && !xs; attempt++) {
    const got = [];
    for (const i of order) {
      const [lo, hi] = xRange(heights[i] * absK, dir);
      let x = null;
      for (let tries = 0; tries < 40 && x == null; tries++) {
        const c = +rng.uniform(lo, hi).toFixed(1);
        if (got.every((g) => Math.abs(g.x - c) >= HARD.minGapX)) x = c;
      }
      if (x == null) break;
      got.push({ i, x });
    }
    if (got.length === 3) { xs = []; got.forEach((g) => { xs[g.i] = g.x; }); }
  }
  if (!xs) {
    xs = [];
    order.forEach((i, n) => {
      const [lo, hi] = xRange(heights[i] * absK, dir);
      xs[i] = +(dir < 0 ? hi - n * HARD.minGapX : lo + n * HARD.minGapX).toFixed(1);
    });
  }
  const posts = heights.map((h, i) => ({
    row: i, x: xs[i], h, kind: kinds[i], dir,
    len: +(h * absK).toFixed(2), tipX: +(xs[i] - h * k).toFixed(2),
  }));
  return { t, dir, posts };
}

function drawObject(g, x, groundY, h, kind) {
  g.fillStyle = '#20262f';
  if (kind === 0) {
    const cr = 13;
    g.fillRect(x - 2.5, groundY - h + 12, 5, h - 12);
    for (const [dx, dy, rr] of [[0, 0, cr], [-8, 7, 9.5], [8, 7, 9.5]]) {
      g.beginPath(); g.arc(x + dx, groundY - h + cr + dy, rr, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 1) {
    g.fillRect(x - 2, groundY - h, 4, h);
    g.beginPath(); g.moveTo(x + 2, groundY - h + 2); g.lineTo(x + 21, groundY - h + 8);
    g.lineTo(x + 2, groundY - h + 14); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, groundY - h, 3, 0, Math.PI * 2); g.fill();
  } else {
    g.fillRect(x - 2.5, groundY - h + 7, 5, h - 7);
    g.beginPath(); g.arc(x, groundY - h + 7, 7, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(x - 7, groundY - h + 6, 14, 3.5);
  }
  g.fillStyle = 'rgba(20,24,30,0.6)';
  g.beginPath(); g.ellipse(x, groundY, 5, 2, 0, 0, Math.PI * 2); g.fill();
}

function drawShadow(g, x, groundY, tipX) {
  g.save();
  const grad = g.createLinearGradient(x, 0, tipX, 0);
  grad.addColorStop(0, 'rgba(18,16,28,0.62)');
  grad.addColorStop(1, 'rgba(18,16,28,0.22)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, groundY - 3.6); g.lineTo(tipX, groundY - 1.1);
  g.lineTo(tipX, groundY + 1.1); g.lineTo(x, groundY + 3.6); g.closePath(); g.fill();
  g.restore();
}

function drawSun(g, t, faded) { drawSunAt(g, sunPos(t), faded); }
function drawSunAt(g, s, faded) {
  g.save();
  const glow = g.createRadialGradient(s.x, s.y, 4, s.x, s.y, 32);
  glow.addColorStop(0, `rgba(255,224,140,${faded ? 0.5 : 0.92})`);
  glow.addColorStop(0.4, `rgba(255,204,110,${faded ? 0.16 : 0.34})`);
  glow.addColorStop(1, 'rgba(255,204,110,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(s.x, s.y, 32, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(s.x, s.y, 14, 0, Math.PI * 2);
  g.fillStyle = faded ? 'rgba(255,213,93,0.75)' : '#ffd55d'; g.fill();
  g.strokeStyle = '#e0a52a'; g.lineWidth = 2; g.stroke();
  g.restore();
}

export default {
  meta: {
    name: 'sun_from_shadows', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'set', theta: '0..180 (0 = right horizon, 90 = overhead)', final: 'true on release (places the sun; a later drag replaces it until Verify)' }],
    promptHuman: 'Drag the sun to where it must be to cast these shadows',
  },

  generate(rng, _level, _index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    return generate3(rng);
  },

  init() { return { placed: null, aimT: null }; },

  applyAction(s, a) {
    if (a?.op !== 'set' || !Number.isFinite(a.theta) || typeof a.final !== 'boolean') return { ok: false, reason: 'bad-op' };
    const theta = clamp(a.theta, 0, 180);
    s.aimT = theta;
    if (a.final) { s.placed = +theta.toFixed(2); s.aimT = null; }
    return { ok: true };
  },

  verify(s, m) {
    const done = s.placed != null;
    const err = done ? Math.abs(s.placed - m.rounds[0].t) : Infinity;
    const success = done && err <= m.tolDeg;
    return {
      success, error: success ? 0 : 1, partial: success ? 1 : 0,
      detail: { done, errors: [Number.isFinite(err) ? +err.toFixed(1) : null] },
    };
  },

  oracle(m) { return [{ op: 'set', theta: m.rounds[0].t, final: true }]; },

  oraclePoints(m) {
    const sp = isView(m) ? (t) => sunPos3(m.view, t) : sunPos;
    const a = sp(DEFAULT_T), b = sp(m.rounds[0].t);
    return [{ from: [a.x, a.y], to: [b.x, b.y] }];
  },

  randomPolicy(m, rnd) {
    const band = T_BANDS[Math.floor(rnd() * T_BANDS.length)];
    return [{ op: 'set', theta: band[0] + Math.floor(rnd() * (band[1] - band[0] + 1)), final: true }];
  },

  async mount(env) { if (env && env.style) env.assets.g15 = await mountLook(env.style); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Drag the sun to cast these shadows', 'Move it along the dashed arc');
  },

  drawBoard(g, br, env) {
    if (isView(env.manifest)) { draw3(g, br, env); return; }
    if (env.style && env.assets.g15) { drawStyled(g, br, env, env.assets.g15); return; }
    const { manifest: m, state: s } = env;
    const rd = m.rounds[0];
    g.save(); g.translate(br.x, br.y);

    const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, '#31517d'); sky.addColorStop(0.62, '#7f86a0'); sky.addColorStop(0.88, '#e7b489'); sky.addColorStop(1, '#f4cf9a');
    g.fillStyle = sky; g.fillRect(0, 0, BOARD.w, HORIZON_Y);
    const grd = g.createLinearGradient(0, HORIZON_Y, 0, BOARD.h);
    grd.addColorStop(0, '#9aab70'); grd.addColorStop(1, '#5c6d41');
    g.fillStyle = grd; g.fillRect(0, HORIZON_Y, BOARD.w, BOARD.h - HORIZON_Y);
    g.strokeStyle = 'rgba(40,52,30,0.40)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, HORIZON_Y + 0.5); g.lineTo(BOARD.w, HORIZON_Y + 0.5); g.stroke();
    g.strokeStyle = 'rgba(40,52,30,0.16)';
    for (const y of ROWS) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(BOARD.w, y + 0.5); g.stroke(); }

    g.save();
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(ARC.cx, ARC.cy, ARC.R, Math.PI, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.restore();

    for (let row = 0; row < ROWS.length; row++) {
      for (const p of rd.posts) {
        if (p.row !== row) continue;
        drawShadow(g, p.x, ROWS[row], p.tipX);
        drawObject(g, p.x, ROWS[row], p.h, p.kind);
      }
    }

    const showT = s.aimT != null ? s.aimT : (s.placed != null ? s.placed : DEFAULT_T);
    drawSun(g, showT, s.aimT == null && s.placed == null);
    g.restore();
  },

  pointer(e, env) {
    const m = env.manifest;
    const sp = isView(m) ? (t) => sunPos3(m.view, t) : sunPos;
    const tOf = isView(m) ? (x, y) => nearestT(m.view, x, y) : angleOf;
    if (e.type === 'down') {
      const s = env.state, t0 = s.aimT != null ? s.aimT : (s.placed != null ? s.placed : DEFAULT_T), c = sp(t0);
      if (Math.hypot(e.x - c.x, e.y - c.y) > GRAB_R) { this._placing = null; return []; }
      this._placing = { off: tOf(e.x, e.y) - t0 };
      return [{ op: 'set', theta: t0, final: false }];
    }
    if (!this._placing) return [];
    const theta = clamp(tOf(e.x, e.y) - this._placing.off, 0, 180);
    if (e.type === 'move') return [{ op: 'set', theta, final: false }];
    if (e.type === 'up') { this._placing = null; return [{ op: 'set', theta, final: true }]; }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    return env.state.placed != null ? 'Sun placed' : 'Drag the sun';
  },
};

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  if (isView(m)) return gate3(m);
  return gateSide(m);
}
function gateSide(m) {
  if (m?.task !== 'sun_from_shadows' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h
      || m.scene?.horizonY !== HORIZON_Y || !Array.isArray(m.scene?.rows) || m.scene.rows.join() !== ROWS.join()
      || m.arc?.cx !== ARC.cx || m.arc?.cy !== ARC.cy || m.arc?.R !== ARC.R
      || !Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds || m.tolDeg !== HARD.tolDeg) return false;
  if (ARC.cx - ARC.R < 0 || ARC.cx + ARC.R > BOARD.w || ARC.cy - ARC.R - 30 < 0) return false;
  return m.rounds.every((r) => {
    if (!Number.isInteger(r.t) || !T_BANDS.some(([a, b]) => r.t >= a && r.t <= b)
        || r.dir !== (cot(r.t) > 0 ? -1 : 1) || !Array.isArray(r.posts) || r.posts.length !== HARD.posts) return false;
    const hs = r.posts.map((p) => p.h);
    if (new Set(hs).size !== HARD.posts || Math.max(...hs) / Math.min(...hs) < HARD.minHeightRatio) return false;
    if (new Set(r.posts.map((p) => p.row)).size !== HARD.posts || new Set(r.posts.map((p) => p.kind)).size !== HARD.posts) return false;
    return r.posts.every((p, i) => p.dir === r.dir && Number.isFinite(p.h)
      && p.h >= HARD.heightBands[0][0] && p.h <= HARD.heightBands[2][1]
      && Number.isInteger(p.row) && p.row >= 0 && p.row < ROWS.length
      && p.len >= HARD.minLen && p.len <= HARD.maxLen
      && p.x >= HARD.edge && p.x <= BOARD.w - HARD.edge
      && p.tipX >= HARD.edge && p.tipX <= BOARD.w - HARD.edge
      && ROWS[p.row] - p.h > 0
      && Math.abs(p.len - p.h * Math.abs(cot(r.t))) <= 0.01
      && Math.abs(p.tipX - (p.x - p.h * cot(r.t))) <= 0.01
      && r.posts.every((q, j) => j <= i || Math.abs(p.x - q.x) >= HARD.minGapX));
  });
}

const EXT_KINDS = ['tree', 'flag', 'lamp', 'pine', 'sign', 'utility', 'person', 'obelisk', 'cypress', 'cactus', 'totem', 'birdhouse', 'mast', 'clock', 'watertower', 'lantern'];
const extKinds = (split) => splitList('g15_sun_from_shadows_obj', EXT_KINDS, split, 3);
const EVAL_KEYS = new Set(['sun_from_shadows|9|3:0.5:2.6:1', 'sun_from_shadows|3|7:0.4:2.7:1', 'sun_from_shadows|4|2:0.3:1.3:2',
  'sun_from_shadows|4|7:1.2:0.6:2', 'sun_from_shadows|2|5:1.6:2.2:0', 'sun_from_shadows|4|7:0.5:1.2:2', 'sun_from_shadows|8|7:1.5:0.6:2',
  'sun_from_shadows|11|3:0.1:2.2:1', 'sun_from_shadows|7|4:2.1:1.1:0', 'sun_from_shadows|9|6:2.3:1.4:0', 'sun_from_shadows|10|3:0.2:2.4:1',
  'sun_from_shadows|4|2:2.7:1.3:0']);
const T_BINS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
const BAND_PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function tRangeOf(tb) {
  const band = T_BANDS.find(([a, b]) => 15 * tb + 7 >= a && 15 * tb - 7 <= b);
  return [Math.max(band[0], 15 * tb - 7), Math.min(band[1], 15 * tb + 7)];
}
function realiseCombo(rng, tb, perm, k) {
  const [tlo, thi] = tRangeOf(tb);
  for (let attempt = 0; attempt < 200; attempt++) {
    const t = rng.int(tlo, thi), c = cot(t), absK = Math.abs(c), dir = c > 0 ? -1 : 1;
    const heights = perm.map((bi) => +rng.uniform(...HARD.heightBands[bi]).toFixed(1));
    const si = perm.indexOf(0);
    const [lo, hi] = xRange(heights[si] * absK, dir);
    const bins = [];
    for (let b = 0; b <= 8; b++) if (Math.max(lo, b * 42 - 20.9) <= Math.min(hi, b * 42 + 20.9)) bins.push(b);
    if (k >= bins.length) continue;
    const b = bins[k], xs = [];
    xs[si] = +rng.uniform(Math.max(lo, b * 42 - 20.9), Math.min(hi, b * 42 + 20.9)).toFixed(1);
    if (Math.round(xs[si] / 42) !== b) continue;
    let ok = true;
    for (const i of [0, 1, 2].filter((i) => i !== si).sort((p, q) => heights[q] - heights[p])) {
      const [l2, h2] = xRange(heights[i] * absK, dir);
      let x = null;
      for (let tries = 0; tries < 40 && x == null; tries++) {
        const cnd = +rng.uniform(l2, h2).toFixed(1);
        if (xs.every((v) => v == null || Math.abs(v - cnd) >= HARD.minGapX)) x = cnd;
      }
      if (x == null) { ok = false; break; }
      xs[i] = x;
    }
    if (!ok) continue;
    const posts = heights.map((h, i) => ({ row: i, x: xs[i], h, kind: i, dir, len: +(h * absK).toFixed(2), tipX: +(xs[i] - h * c).toFixed(2) }));
    const rd = { t, dir, posts };
    if (EVAL_KEYS.has(semanticKey({ rounds: [rd] }))) continue;
    return rd;
  }
  return null;
}
let SUN_COMBOS = null;
function comboIds() {
  if (SUN_COMBOS) return SUN_COMBOS;
  const out = [];
  T_BINS.forEach((tb) => BAND_PERMS.forEach((perm, pi) => [0, 1, 2].forEach((k) => {
    if (realiseCombo(RW(mulberry32(tb * 1000 + pi * 10 + k + 7)), tb, perm, k)) out.push(`${tb}.${pi}.${k}`);
  })));
  SUN_COMBOS = out;
  return out;
}
function generateExt(rng, split, n) {
  const ids = splitList('g15_sun_from_shadows_combo', comboIds(), split, 30);
  const id = Number.isFinite(n) ? ids[nthOf(`sun_from_shadows|${split}|combo`, n, ids.length)] : rng.pick(ids);
  const [tb, pi, k] = id.split('.').map(Number);
  const rd = realiseCombo(rng, tb, BAND_PERMS[pi], k) || makeRound(rng);
  const kinds = rng.sample(extKinds(split), 3);
  rd.posts.forEach((p, i) => { p.kind = kinds[i]; });
  return { task: 'sun_from_shadows', board: BOARD, ext: split,
    scene: { horizonY: HORIZON_Y, rows: ROWS.slice() }, arc: { ...ARC }, tolDeg: HARD.tolDeg, rounds: [rd] };
}
function gateExt(m) {
  if (EVAL_KEYS.has(semanticKey(m))) return false;
  const pool = extKinds(m.ext);
  if (!m.rounds?.[0]?.posts?.every((p) => pool.includes(p.kind))) return false;
  const mm = JSON.parse(JSON.stringify(m)); delete mm.ext;
  mm.rounds.forEach((r) => r.posts.forEach((p) => { p.kind = EXT_KINDS.indexOf(p.kind); }));
  return gateSide(mm);
}

function draw3(g, br, env) {
  const { manifest: m, state: s } = env;
  const v = m.view, rd = m.rounds[0], W = BOARD.w, H = BOARD.h;
  g.save(); g.translate(br.x, br.y);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#a9b981'); grd.addColorStop(1, '#6f8250');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const gt = deg2rad(v.grid), e1 = { X: Math.cos(gt), Y: Math.sin(gt) }, e2 = { X: -Math.sin(gt), Y: Math.cos(gt) };
  const sp = Math.sin(deg2rad(v.p)), cpv = Math.cos(deg2rad(v.p)), D = v.k * v.RA, ext = 1400;
  const nearOk = (X, Y) => Y * cpv + D > 0.35 * D;
  g.strokeStyle = 'rgba(40,56,28,0.22)'; g.lineWidth = 1;
  for (let k = -40; k <= 40; k++) {
    for (const [a, b] of [[e1, e2], [e2, e1]]) {
      const o = { X: a.X * k * SCENE.gridStep, Y: a.Y * k * SCENE.gridStep };
      g.beginPath(); let pen = false;
      for (let s2 = -ext; s2 <= ext; s2 += 17) {
        const X = o.X + b.X * s2, Y = o.Y + b.Y * s2;
        if (!nearOk(X, Y)) { pen = false; continue; }
        const q = proj(v, X, Y);
        if (pen) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); pen = true; }
      }
      g.stroke();
    }
  }
  const order = rd.posts.slice().sort((a, b) => b.Y - a.Y);
  const a = deg2rad(v.a), u = { X: Math.cos(a), Y: Math.sin(a) }, nrm = { X: -u.Y, Y: u.X };
  for (const P of order) {
    const q = postScreen(v, rd.t, P);
    const w0 = 4, w1 = 1.4;
    const c0 = proj(v, P.X + nrm.X * w0, P.Y + nrm.Y * w0), c1 = proj(v, q.tipW.X + nrm.X * w1, q.tipW.Y + nrm.Y * w1);
    const c2 = proj(v, q.tipW.X - nrm.X * w1, q.tipW.Y - nrm.Y * w1), c3 = proj(v, P.X - nrm.X * w0, P.Y - nrm.Y * w0);
    const sg = g.createLinearGradient(q.b.x, q.b.y, q.tip.x, q.tip.y);
    sg.addColorStop(0, 'rgba(18,16,28,0.62)'); sg.addColorStop(1, 'rgba(18,16,28,0.24)');
    g.fillStyle = sg;
    g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.closePath(); g.fill();
  }
  const peg = proj(v, 0, 0), f0 = sunPos3(v, 0), f1 = sunPos3(v, 180);
  const groundDisc = (w, r) => {
    g.beginPath();
    for (let k = 0; k < 24; k++) { const an = k * Math.PI / 12, q = proj(v, w.X + r * Math.cos(an), w.Y + r * Math.sin(an)); if (k) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
    g.closePath();
  };
  const ua = deg2rad(v.a);
  g.fillStyle = 'rgba(50,46,40,0.55)';
  for (const sgn of [1, -1]) { groundDisc({ X: sgn * v.RA * Math.cos(ua), Y: sgn * v.RA * Math.sin(ua) }, 5); g.fill(); }
  g.fillStyle = 'rgba(255,250,235,0.92)'; g.strokeStyle = 'rgba(50,46,40,0.7)'; g.lineWidth = 1.2;
  groundDisc({ X: 0, Y: 0 }, 4.5); g.fill(); g.stroke();
  void f0; void f1; void sp; void peg;
  g.save();
  g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,0.78)'; g.lineWidth = 1.8;
  g.beginPath();
  for (let t = 0; t <= 180; t += 2) { const p = sunPos3(v, t); if (t) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
  g.stroke();
  g.setLineDash([]); g.restore();
  const sRef = proj(v, 0, 0).s;
  for (const P of order) {
    const q = postScreen(v, rd.t, P);
    const len = Math.hypot(q.top.x - q.b.x, q.top.y - q.b.y), ang = Math.atan2(q.top.x - q.b.x, q.b.y - q.top.y);
    const ks = Math.max(0.75, Math.min(1.3, q.b.s / sRef));
    g.save(); g.translate(q.b.x, q.b.y); g.rotate(ang); g.scale(ks, ks);
    drawObject(g, 0, 0, len / ks, P.kind);
    g.restore();
  }
  const showT = s.aimT != null ? s.aimT : (s.placed != null ? s.placed : DEFAULT_T);
  drawSunAt(g, sunPos3(v, showT), s.aimT == null && s.placed == null);
  g.restore();
}

async function mountLook(st) {
  const skies = st.pool('hdri', (h) => /outdoor|morning|overcast|urban/.test(h.use));
  const [hi, mode] = st.primaryCombo('g15_sky', [skies.length, 3]);
  const pick = skies[hi], painted = mode === 2;
  let sky = null;
  if (!painted) { try { sky = await skyWindow(st, pick, BOARD.w / HORIZON_Y, { mean: 0.6, margin: 90, maxAsym: 0.045, maxBusy: 0.03, flip: mode === 1 }); } catch { sky = null; } }
  if (!sky) sky = paintedSky(st, pick, BOARD.w, HORIZON_Y, 0.62, chooseSplit(st, 'g15_sun_horizon', ['hills', 'trees', 'skyline', 'mountains'], 1));
  st.note(`sky:${pick.id}${painted ? ':painted' : ''}`);
  const pool = texPool(st, ['terrain', 'floor', 'stone'], (t) => !isDirectional(t));
  const ground = await makeMaterial(st, st.primary('tex', (x) => pool.includes(x)), { scale: [0.28, 0.45], rotate: false });
  const target = Math.max(0.42, Math.min(0.7, ground.lum * 0.55 + 0.26));
  return { sky, ground, target, hue: st.rand(), v: st.rand(), w: st.rand() };
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state: s } = env;
  const rd = m.rounds[0];
  g.save(); g.translate(br.x, br.y);
  if (L.sky) { g.imageSmoothingQuality = 'high'; g.drawImage(L.sky, 0, 0, BOARD.w, HORIZON_Y); }
  else { const sk = g.createLinearGradient(0, 0, 0, HORIZON_Y); sk.addColorStop(0, '#6f9fd0'); sk.addColorStop(1, '#d9e7f2'); g.fillStyle = sk; g.fillRect(0, 0, BOARD.w, HORIZON_Y); }
  g.save(); g.beginPath(); g.rect(0, HORIZON_Y, BOARD.w, BOARD.h - HORIZON_Y); g.clip();
  g.translate(0, HORIZON_Y); g.scale(1, 0.5);
  fillMaterial(g, L.ground, rectShape(0, 0, BOARD.w, 2 * (BOARD.h - HORIZON_Y)), { target: L.target, contrastK: 0.75 });
  g.restore();
  const grd = g.createLinearGradient(0, HORIZON_Y, 0, BOARD.h);
  grd.addColorStop(0, 'rgba(255,255,255,0.16)'); grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd; g.fillRect(0, HORIZON_Y, BOARD.w, BOARD.h - HORIZON_Y);
  g.strokeStyle = 'rgba(30,34,30,0.45)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, HORIZON_Y + 0.5); g.lineTo(BOARD.w, HORIZON_Y + 0.5); g.stroke();
  g.strokeStyle = 'rgba(30,34,30,0.18)';
  for (const y of ROWS) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(BOARD.w, y + 0.5); g.stroke(); }
  g.save();
  g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,255,255,0.62)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(ARC.cx, ARC.cy, ARC.R, Math.PI, Math.PI * 2); g.stroke();
  g.setLineDash([]); g.restore();
  for (let row = 0; row < ROWS.length; row++) {
    for (const p of rd.posts) {
      if (p.row !== row) continue;
      drawShadow(g, p.x, ROWS[row], p.tipX);
      drawKind(g, p.x, ROWS[row], p.h, p.kind, L);
    }
  }
  const showT = s.aimT != null ? s.aimT : (s.placed != null ? s.placed : DEFAULT_T);
  drawSun(g, showT, s.aimT == null && s.placed == null);
  g.restore();
}
function drawKind(g, x, gy, h, kind, L) {
  const k = typeof kind === 'number' ? ['tree', 'flag', 'lamp'][kind] : kind;
  const top = gy - h, ink = 'rgba(16,18,22,0.85)';
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  const shape = (fill, build) => { g.beginPath(); build(); g.fillStyle = fill; g.fill(); g.strokeStyle = ink; g.lineWidth = 1.1; g.stroke(); };
  const rect = (fill, x0, y0, w, hh) => shape(fill, () => g.rect(x0, y0, w, hh));
  const disc = (fill, cx, cy, r) => shape(fill, () => g.arc(cx, cy, r, 0, Math.PI * 2));
  const tri = (fill, pts) => shape(fill, () => { pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); });
  const green = hsl(95 + L.hue * 40, 40, 32), metal = L.v < 0.5 ? '#4b535b' : '#5d5a4f', wood = '#6e4f33';
  if (k === 'tree') {
    rect(wood, x - 2.5, top + 12, 5, h - 12);
    for (const [dx, dy, rr] of [[-8, 7, 9.5], [8, 7, 9.5], [0, 0, 13]]) disc(dx ? shadeHex(green, -0.12) : green, x + dx, top + 13 + dy, rr);
  } else if (k === 'flag') {
    rect('#a7adb3', x - 2, top, 4, h);
    tri(hsl(L.w * 360, 65, 48), [[x + 2, top + 2], [x + 21, top + 8], [x + 2, top + 14]]);
    disc('#d7b347', x, top + 2.5, 2.5);
  } else if (k === 'lamp') {
    rect(metal, x - 2.5, top + 7, 5, h - 7);
    shape('#9aa2a8', () => { g.arc(x, top + 7, 7, Math.PI, Math.PI * 2); g.closePath(); });
    rect(metal, x - 7, top + 6, 14, 3.5);
  } else if (k === 'lantern') {
    rect(metal, x - 2, top + 16, 4, h - 16);
    rect('#a9b0b5', x - 5, top + 5, 10, 11);
    tri(metal, [[x - 7, top + 6], [x + 7, top + 6], [x, top]]);
  } else if (k === 'pine') {
    rect('#5b3b24', x - 2, gy - 10, 4, 10);
    const c = hsl(140 + L.hue * 20, 34, 27);
    tri(c, [[x - 13, gy - 10], [x + 13, gy - 10], [x, top]]);
  } else if (k === 'cypress') {
    rect('#5b3b24', x - 2, gy - 8, 4, 8);
    shape(hsl(125 + L.hue * 25, 30, 26), () => { g.moveTo(x, top); g.quadraticCurveTo(x + 11, top + h * 0.45, x + 3, gy - 8); g.lineTo(x - 3, gy - 8); g.quadraticCurveTo(x - 11, top + h * 0.45, x, top); });
  } else if (k === 'sign') {
    rect('#7b8188', x - 2, top + 12, 4, h - 12);
    rect(L.w < 0.5 ? '#2f7d4f' : '#2f5f9e', x - 12, top, 24, 13);
  } else if (k === 'utility') {
    rect('#6d5136', x - 2.5, top, 5, h);
    rect('#5c432c', x - 14, top + 6, 28, 3.5);
  } else if (k === 'person') {
    const c = hsl(L.w * 360, 45, 40);
    disc('#e0b48c', x, top + 5, 5);
    shape(c, () => { g.moveTo(x - 6, top + 11); g.lineTo(x + 6, top + 11); g.lineTo(x + 5, top + h * 0.55); g.lineTo(x - 5, top + h * 0.55); g.closePath(); });
    rect('#3a3f55', x - 5, top + h * 0.55, 4, h * 0.45); rect('#3a3f55', x + 1, top + h * 0.55, 4, h * 0.45);
  } else if (k === 'obelisk') {
    const c = L.v < 0.5 ? '#b8b1a1' : '#8f8a84';
    tri(c, [[x - 6, gy], [x + 6, gy], [x + 3.5, top + 8], [x, top], [x - 3.5, top + 8]]);
  } else if (k === 'cactus') {
    const c = hsl(105 + L.hue * 25, 36, 33);
    shape(c, () => { g.moveTo(x - 4, gy); g.lineTo(x - 4, top + 4); g.arc(x, top + 4, 4, Math.PI, 0); g.lineTo(x + 4, gy); g.closePath(); });
    shape(c, () => { g.rect(x - 13, top + h * 0.45, 9, 4); g.rect(x - 13, top + h * 0.25, 4, h * 0.24); });
    shape(c, () => { g.rect(x + 4, top + h * 0.55, 8, 4); g.rect(x + 8, top + h * 0.35, 4, h * 0.24); });
  } else if (k === 'totem') {
    const n = 4, hh = h / n;
    for (let i = 0; i < n; i++) rect(hsl((L.hue * 360 + i * 70) % 360, 42, 40), x - 5, gy - (i + 1) * hh, 10, hh);
  } else if (k === 'birdhouse') {
    rect('#7a5a37', x - 2, top + 16, 4, h - 16);
    rect(hsl(L.w * 360, 40, 46), x - 7, top + 6, 14, 11);
    tri('#5b3c25', [[x - 9, top + 7], [x + 9, top + 7], [x, top]]);
  } else if (k === 'mast') {
    shape(metal, () => { g.moveTo(x - 6, gy); g.lineTo(x + 6, gy); g.lineTo(x + 1, top); g.lineTo(x - 1, top); g.closePath(); });
    g.strokeStyle = 'rgba(16,18,22,0.6)'; g.lineWidth = 1;
    for (let y = gy - 10; y > top + 6; y -= 10) { const w = 6 * (y - top) / h; g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y - 10); g.stroke(); }
  } else if (k === 'clock') {
    rect(metal, x - 2.5, top + 16, 5, h - 16);
    disc('#f1efe6', x, top + 8, 8);
  } else {
    shape('#7d7468', () => { g.moveTo(x - 9, gy); g.lineTo(x - 5, top + 20); g.lineTo(x + 5, top + 20); g.lineTo(x + 9, gy); g.lineTo(x + 7, gy); g.lineTo(x, top + 26); g.lineTo(x - 7, gy); g.closePath(); });
    rect('#9a8f80', x - 9, top + 8, 18, 12);
    tri('#6a5f52', [[x - 10, top + 8], [x + 10, top + 8], [x, top]]);
  }
  g.restore();
}

export function semanticKey(m) {
  const r = m.rounds[0];
  const band = (h) => (h < 65 ? 0 : h < 76 ? 1 : 2);
  const rows = r.posts.slice().sort((a, b) => a.row - b.row).map((p) => `${Math.round(p.x / 42)}:${band(p.h)}`);
  return `sun_from_shadows|${Math.round(r.t / 15)}|${rows.join('.')}`;
}
