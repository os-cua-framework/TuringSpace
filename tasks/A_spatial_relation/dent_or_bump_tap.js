import { drawPromptText, ACCENT } from '../core/panel.js';
import {
  RHO, DEPTH, SLOPE_DEG, LAMP, cameraFor, sceneFromRound, render, toCanvas, contextScale, rimScreen,
} from '../common/_dent_or_bump_tap_rt.js';
import { buildDentLook } from '../common/_dent_or_bump_tap_look.js';

const PANEL_W = 560;
const SCENE_H = 400;
const BOARD = { w: 540, h: SCENE_H };
const HARD = Object.freeze({
  rounds: 1,
  counts: [10, 11, 12],
  askMin: 3,
  camEl: [60, 66],
  camJit: 0.3,
  lampH: [1.65, 1.85],
  lightEl: [27, 37],
  twinDeg: 45,
  gap: 0.3,
  sepPx: 50,
  ring: 1.2,
  edgePx: 5,
  minRimPx: 30,
  shadowGap: 0.08,
  lampPx: 8,
  lampEdgePx: 12,
});
const KINDS = ['bump', 'dent'];
const ASK = {
  dent: 'Tap every dent pressed into the plate',
  bump: 'Tap every bump raised on the plate',
};
const SUB = 'All the same size · the lamp is the only light';
const r3 = (v) => Math.round(v * 1000) / 1000;
const deg = (r) => r * 180 / Math.PI;
const rad = (d) => d * Math.PI / 180;
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const cameraOf = (rd) => cameraFor(rd.cam, BOARD.w, SCENE_H);
const elevAt = (lamp, p) => deg(Math.atan2(lamp.h, Math.hypot(p.x - lamp.x, p.z - lamp.z)));
function shadowReach(el) {
  const t = Math.tan(rad(el)), rs = Math.min(RHO, RHO * RHO * t / (2 * DEPTH));
  return rs + DEPTH * (1 - rs * rs / (RHO * RHO)) / t;
}
function towardLampPsi(cam, lamp, f) {
  const dx = lamp.x - f.x, dz = lamp.z - f.z, l = Math.hypot(dx, dz);
  const a = cam.project(f.x, 0, f.z), b = cam.project(f.x + 0.3 * dx / l, 0, f.z + 0.3 * dz / l);
  return deg(Math.atan2(b.y - a.y, b.x - a.x));
}
const brightPsi = (cam, lamp, f) => towardLampPsi(cam, lamp, f) + (f.kind === 'bump' ? 0 : 180);
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, L ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L : 0));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
function ptSegDist2(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function inPoly(p, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function roundGeom(rd) {
  const cam = cameraOf(rd), L = rd.lamp;
  const foot = cam.project(L.x, 0, L.z), top = cam.project(L.x, L.h + LAMP.bulb, L.z), bulb = cam.project(L.x, L.h, L.z);
  const bulbPx = Math.abs(cam.project(L.x, L.h + LAMP.bulb, L.z).y - bulb.y);
  const footPx = Math.abs(cam.project(L.x + LAMP.foot, 0, L.z).x - foot.x) + Math.abs(cam.project(L.x, 0, L.z + LAMP.foot).x - foot.x);
  return { cam, lamp: L, foot, top, bulb, bulbPx, footPx };
}
function shadowSeg(f, G) {
  const dx = f.x - G.lamp.x, dz = f.z - G.lamp.z, l = Math.hypot(dx, dz);
  const len = Math.max(0, shadowReach(elevAt(G.lamp, f)) - RHO + HARD.shadowGap);
  return [f, { x: f.x + dx / l * len, z: f.z + dz / l * len }];
}

function featureOk(G, f, others) {
  const cam = G.cam, ring = rimScreen(cam, f.x, f.z, HARD.ring), rim = rimScreen(cam, f.x, f.z, 1);
  const [x0, y0, x1, y1] = ring.box;
  if (x0 < HARD.edgePx || y0 < HARD.edgePx || x1 > BOARD.w - HARD.edgePx || y1 > SCENE_H - HARD.edgePx) return false;
  const el = elevAt(G.lamp, f);
  if (el < HARD.lightEl[0] || el > HARD.lightEl[1]) return false;
  let minD = Infinity;
  for (let i = 0; i < rim.pts.length / 2; i++) { const p = rim.pts[i], q = rim.pts[i + rim.pts.length / 2]; minD = Math.min(minD, Math.hypot(p.x - q.x, p.y - q.y)); }
  if (minD < HARD.minRimPx) return false;
  if (ring.pts.some((p) => ptSegDist2(p, G.foot, G.top) < HARD.lampPx + Math.max(G.bulbPx, G.footPx / 2))) return false;
  if (inPoly(G.foot, ring.pts) || inPoly(G.bulb, ring.pts)) return false;
  const [s0, s1] = shadowSeg(f, G), c = rim.c;
  for (const o of others) {
    if (Math.hypot(o.x - f.x, o.z - f.z) < 2 * RHO + HARD.gap) return false;
    const oc = cam.project(o.x, 0, o.z);
    if (Math.hypot(oc.x - c.x, oc.y - c.y) < HARD.sepPx) return false;
    const [a0, a1] = shadowSeg(o, G);
    if (segDist(f, a0, a1) < 2 * RHO + HARD.shadowGap || segDist(o, s0, s1) < 2 * RHO + HARD.shadowGap) return false;
  }
  return true;
}
function twinsOk(cam, lamp, feats) {
  const psi = feats.map((f) => brightPsi(cam, lamp, f));
  return feats.every((f, i) => feats.some((g, j) => g.kind !== f.kind && angDiff(psi[i], psi[j]) <= HARD.twinDeg));
}
function roundProblems(rd) {
  const errs = [];
  if (!rd || !rd.cam || !rd.lamp || !Array.isArray(rd.feats)) return ['shape'];
  if (![rd.cam.az, rd.cam.el, rd.cam.tx, rd.cam.tz, rd.lamp.x, rd.lamp.z, rd.lamp.h].every(Number.isFinite)) return ['nan'];
  if (rd.cam.el < HARD.camEl[0] || rd.cam.el > HARD.camEl[1]) errs.push('camEl');
  if (Math.hypot(rd.cam.tx - rd.lamp.x, rd.cam.tz - rd.lamp.z) > HARD.camJit + 1e-9) errs.push('camJit');
  if (rd.lamp.h < HARD.lampH[0] || rd.lamp.h > HARD.lampH[1]) errs.push('lampH');
  if (HARD.camEl[0] - SLOPE_DEG < 15 || SLOPE_DEG - HARD.lightEl[1] < 2) errs.push('constants');
  const n = rd.feats.length;
  if (!HARD.counts.includes(n)) return ['count'];
  const G = roundGeom(rd), m = HARD.lampEdgePx;
  for (const p of [G.foot, G.top]) if (p.x < m || p.x > BOARD.w - m || p.y < m || p.y > SCENE_H - m) errs.push('lampFrame');
  const ok = [];
  rd.feats.forEach((f, i) => {
    if (!f || f.id !== i || !KINDS.includes(f.kind) || ![f.x, f.z].every(Number.isFinite)) { errs.push(`feat${i}`); return; }
    if (!featureOk(G, f, ok)) errs.push(`place${i}`);
    if (i > 0 && G.cam.project(rd.feats[i - 1].x, 0, rd.feats[i - 1].z).x > G.cam.project(f.x, 0, f.z).x) errs.push(`order${i}`);
    ok.push(f);
  });
  if (!errs.length && !twinsOk(G.cam, rd.lamp, rd.feats)) errs.push('twins');
  return errs;
}

function contractProblems(m) {
  if (!m || m.task !== 'dent_or_bump_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['header'];
  if (!KINDS.includes(m.ask) || !Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return ['rounds'];
  const errs = [];
  m.rounds.forEach((rd, r) => {
    for (const e of roundProblems(rd)) errs.push(`r${r}:${e}`);
    if (!Array.isArray(rd.feats)) return;
    const asked = rd.feats.filter((f) => f.kind === m.ask).map((f) => f.id);
    if (asked.length < HARD.askMin || rd.feats.length - asked.length < HARD.askMin) errs.push(`r${r}:askedCount`);
    if (!Array.isArray(rd.answer) || rd.answer.join(',') !== asked.join(',')) errs.push(`r${r}:answer`);
  });
  return errs;
}
export function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

export function semanticKey(m) {
  const rd = m.rounds[0], cam = cameraOf(rd), cx = BOARD.w / 8, cy = SCENE_H / 8;
  const cell = (x, z) => { const p = cam.project(x, 0, z); return `${Math.floor(p.x / cx)}.${Math.floor(p.y / cy)}`; };
  return `${m.ask}|lamp${cell(rd.lamp.x, rd.lamp.z)}|${rd.feats.map((f) => `${f.kind[0]}${cell(f.x, f.z)}`).join(',')}`;
}

function genRound(rng, ask) {
  const n = rng.pick(HARD.counts);
  const other = ask === 'dent' ? 'bump' : 'dent';
  for (let attempt = 0; attempt < 200; attempt++) {
    const lamp = { x: 0, z: 0, h: r3(rng.uniform(HARD.lampH[0], HARD.lampH[1])) };
    const ja = rng.uniform(0, Math.PI * 2), jr = rng.uniform(0, HARD.camJit - 0.01);
    const camSpec = { az: r3(rng.uniform(0, 360)), el: r3(rng.uniform(HARD.camEl[0], HARD.camEl[1])), tx: r3(jr * Math.sin(ja)), tz: r3(jr * Math.cos(ja)) };
    const rd0 = { cam: camSpec, lamp, feats: [] };
    const G = roundGeom(rd0), mg = HARD.lampEdgePx + 2;
    if ([G.foot, G.top].some((p) => p.x < mg || p.x > BOARD.w - mg || p.y < mg || p.y > SCENE_H - mg)) continue;
    const dLo = lamp.h / Math.tan(rad(HARD.lightEl[1] - 0.3)), dHi = lamp.h / Math.tan(rad(HARD.lightEl[0] + 0.3));
    const placed = [];
    for (let t = 0; t < 2500 && placed.length < n; t++) {
      const a = rng.uniform(0, Math.PI * 2), d = Math.sqrt(rng.uniform(dLo * dLo, dHi * dHi));
      const f = { x: r3(lamp.x + d * Math.sin(a)), z: r3(lamp.z + d * Math.cos(a)) };
      if (featureOk(G, f, placed)) placed.push(f);
    }
    if (placed.length < n) continue;
    placed.sort((p, q) => G.cam.project(p.x, 0, p.z).x - G.cam.project(q.x, 0, q.z).x);
    for (let kt = 0; kt < 300; kt++) {
      const k = rng.int(HARD.askMin, n - HARD.askMin);
      const askedIds = new Set(rng.sample(placed.map((_, i) => i), k));
      const feats = placed.map((f, i) => ({ id: i, x: f.x, z: f.z, kind: askedIds.has(i) ? ask : other }));
      if (!twinsOk(G.cam, lamp, feats)) continue;
      const rd = { cam: camSpec, lamp, feats, answer: feats.filter((f) => f.kind === ask).map((f) => f.id) };
      if (roundProblems(rd).length) break;
      return rd;
    }
  }
  return null;
}

function hitFeature(rd, x, y) {
  const cam = cameraOf(rd);
  let best = -1, bd = Infinity;
  for (const f of rd.feats) {
    const c = cam.project(f.x, 0, f.z), d = Math.hypot(x - c.x, y - c.y);
    const inside = inPoly({ x, y }, rimScreen(cam, f.x, f.z, 1.35).pts);
    if ((inside || d <= 20) && d < bd) { bd = d; best = f.id; }
  }
  return best;
}

const task = {
  meta: {
    name: 'dent_or_bump_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'toggle', item: 'feature id (ids run left to right on screen); tap again to undo (revisable until Verify)' },
    ],
    promptHuman: 'Tap every dent pressed into the plate',
  },

  generate(rng) {
    const ask = rng.pick(KINDS);
    for (let tries = 0; tries < 30; tries++) {
      const r0 = genRound(rng, ask);
      if (!r0) continue;
      const m = { task: 'dent_or_bump_tap', board: { ...BOARD }, ask, rounds: [r0] };
      if (gate(m)) return m;
    }
    throw new Error('dent_or_bump_tap: sampler exhausted');
  },

  init() { return { sel: [] }; },

  applyAction(s, a, m) {
    if (a?.op !== 'toggle') return { ok: false, reason: 'bad-op' };
    const rd = m.rounds[0];
    if (!Number.isInteger(a.item) || a.item < 0 || a.item >= rd.feats.length) return { ok: false, reason: 'bad-item' };
    const i = s.sel.indexOf(a.item);
    if (i >= 0) s.sel.splice(i, 1); else s.sel.push(a.item);
    s.sel.sort((x, y) => x - y);
    return { ok: true, on: i < 0 };
  },

  verify(s, m) {
    const rd = m.rounds[0], sel = s.sel || [];
    const success = sel.length > 0 && sel.join(',') === rd.answer.join(',');
    const hit = sel.filter((i) => rd.answer.includes(i)).length, wrong = sel.length - hit;
    return { success, partial: success ? 1 : Math.max(0, (hit - wrong) / rd.answer.length), error: success ? 0 : 1, detail: { selected: sel.length, correct: hit, wrong, need: rd.answer.length } };
  },

  oracle(m) {
    return m.rounds[0].answer.map((id) => ({ op: 'toggle', item: id }));
  },

  randomPolicy(m, rnd) {
    const rd = m.rounds[0], acts = [];
    const ids = rd.feats.map((f) => f.id), k = 1 + Math.floor(rnd() * (ids.length - 1));
    for (let j = 0; j < k; j++) { const t = j + Math.floor(rnd() * (ids.length - j)); [ids[j], ids[t]] = [ids[t], ids[j]]; acts.push({ op: 'toggle', item: ids[j] }); }
    return acts;
  },

  async mount(env) {
    env.assets.dob = { key: '', canvas: null };
    if (env.style) env.assets.dobLook = await buildDentLook(env.style);
  },

  drawPrompt(g, r, env) {
    drawPromptText(g, r, ASK[env.manifest.ask], SUB);
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const rd = m.rounds[0];
    const A = env.assets.dob || (env.assets.dob = {});
    const q = contextScale(g), look = env.style ? env.assets.dobLook : null, key = look ? `0|${q}|${env.style.key}` : `0|${q}`;
    if (A.key !== key) { A.canvas = toCanvas(render(look ? sceneFromRound(rd, BOARD.w, SCENE_H, look) : sceneFromRound(rd, BOARD.w, SCENE_H), q)); A.key = key; }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, SCENE_H);
    const cam = cameraOf(rd), sel = new Set(st.sel);
    for (const f of rd.feats) {
      if (!sel.has(f.id)) continue;
      const ring = rimScreen(cam, f.x, f.z, HARD.ring, 48).pts;
      g.beginPath(); ring.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = ACCENT; g.lineWidth = 2.6; g.stroke();
      const tip = ring.reduce((a, p) => (p.x - p.y > a.x - a.y ? p : a), ring[0]);
      g.beginPath(); g.arc(tip.x, tip.y, 7, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(tip.x - 3.2, tip.y + 0.2); g.lineTo(tip.x - 0.8, tip.y + 2.6); g.lineTo(tip.x + 3.4, tip.y - 2.6); g.stroke();
    }
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (e.y < 0 || e.y >= SCENE_H || e.x < 0 || e.x >= BOARD.w) return [];
    const id = hitFeature(env.manifest.rounds[0], e.x, e.y);
    return id >= 0 ? [{ op: 'toggle', item: id }] : [];
  },

  footerStatus(env) {
    return `${env.state.sel.length} selected`;
  },
};
export default task;
