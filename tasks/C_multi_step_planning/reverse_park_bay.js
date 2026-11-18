import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import * as RT from '../common/_reverse_park_bay_rt.js';
import { NB, BW, BD, XE, ACTIONS, bayX, footprint, drive, success, headErrDeg, insideFrac,
  shortestPlan, greedyRun, poseOf, collides, lotOf, parkedWell } from '../common/_reverse_park_bay_logic.js';
import { VIEW, STYLES, PLAYER_PAINTS, PARKED_PAINTS, buildScene, playerRect,
  PLAYER_PAINTS_EXT, PARKED_PAINTS_EXT, styleLook } from '../common/_reverse_park_bay_scene.js';
import { splitIds } from '../core/style.js';
import * as K from '../common/_scene_tex_kit.js';

const BOARD = { w: 340, h: 420 };
const BTN = { y: VIEW.h + 8, h: 42, gap: 8, rowGap: 6 };
const PLAN = { min: 4, max: 7, revMax: 8, oracleMax: 9 };
const GREEDY_W = [0, 0.5, 1, 2, 4];
const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
const PRESS_BUDGET = 15;
const pressBudget = (m) => (m && !m.ext && Number.isInteger(m.budget) ? m.budget : null);

function startClear(m, p) {
  const r = footprint(p), { zf, xe } = lotOf(m);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const x = r.cx + r.c * r.hl * a - r.s * r.hw * b, z = r.cz + r.s * r.hl * a + r.c * r.hw * b;
    if (z < BD + 0.3 || z > zf - 0.3 || x < -xe + 0.3 || x > xe - 0.3) return false;
  }
  return !collides(m, p);
}
function contract(m, bench = !m?.ext) {
  if (!m || m.task !== 'reverse_park_bay' || !m.lot || !m.start || !m.camera || !Array.isArray(m.parked)) return null;
  const { aw, empty } = m.lot;
  if (!(aw >= 7 && aw <= 8) || !Number.isInteger(empty) || empty < 1 || empty > NB - 2) return null;
  if (m.parked.length !== NB - 1 || m.parked.some((q) => !STYLES[q.style])) return null;
  const bays = new Set(m.parked.map((q) => Math.round(q.x / BW + (NB - 1) / 2)));
  if (bays.size !== NB - 1 || bays.has(empty)) return null;
  const p = poseOf(m);
  if (!startClear(m, p) || success(m, p)) return null;
  const plan = shortestPlan(m, p, PLAN.max);
  if (!plan || plan.length < PLAN.min) return null;
  if (shortestPlan(m, p, PLAN.revMax, ACTIONS.filter((a) => a.dir < 0))) return null;
  if (GREEDY_W.some((w) => greedyRun(m, p, { headW: w }).ok)) return null;
  const oracle = shortestPlan(m, p, Math.min(PLAN.oracleMax, plan.length + 2), ACTIONS, parkedWell);
  if (oracle) oracle.shortest = plan.length;
  return oracle;
}
export function gate(m) {
  const plan = contract(m);
  if (!plan || !Array.isArray(m.plan) || m.plan.length !== plan.length) return false;
  if (!m.ext && (m.shortest !== plan.shortest || m.budget !== PRESS_BUDGET || m.plan.length > m.budget)) return false;
  let p = poseOf(m);
  for (const a of m.plan) p = drive(m, p, a.dir, a.steer).pose;
  return parkedWell(m, p) && success(m, p);
}

export function semanticKey(m) {
  const q = (v, s) => Math.round(v / s), h = ((m.start.h % 360) + 360) % 360;
  return `reverse_park_bay|empty${m.lot.empty}|aw${q(m.lot.aw, 0.5)}|start${q(m.start.x, 2.4)},${q(m.start.z, 2.4)},${q(h, 15) % 24}|noses${m.parked.map((p) => (p.h > 0 ? 'o' : 'i')).join('')}`;
}
const EVAL_KEYS = new Set(["925577cc", "763d6ea4", "421821a1", "c108ab0e", "350f083c", "81751121", "fe1b4d86", "8031ffb0", "25476f6e", "4ee6684a", "0402f70d", "0f6c6d16"]);

function tryBuild(rng, pools = null, pre = null) {
  const P = pools || DEFAULT_POOLS;
  const aw = r2(rng.uniform(7.0, 8.0)), empty = rng.int(1, NB - 2);
  const parked = [];
  for (let i = 0; i < NB; i++) {
    if (i === empty) continue;
    const style = rng.pick(P.styles), st = STYLES[style];
    const noseOut = rng.raw() < 0.5, gap = rng.uniform(0.25, 0.6);
    parked.push({ x: r3(bayX(i) + rng.uniform(-0.15, 0.15)), z: r3(gap + st.L / 2), h: r2((noseOut ? 90 : -90) + rng.uniform(-2.5, 2.5)),
      L: st.L, W: st.W, style, paint: rng.pick(P.parked) });
  }
  const zf = BD + aw, k = rng.int(0, 11);
  const start = { x: r3(rng.uniform(-XE + 1, XE - 1)), z: r3(rng.uniform(BD + 1, zf - 1)), h: r2(90 + 30 * k + rng.uniform(-6, 6)) };
  const m = { task: 'reverse_park_bay', board: { ...BOARD }, lot: { aw, empty }, parked, start,
    camera: { az: r2(rng.uniform(0, 360)), el: r2(rng.uniform(52, 64)) }, look: { paint: rng.pick(P.player) } };
  if (pre && !pre(m)) return null;
  if (!startClear(m, poseOf(m))) return null;
  const bench = !pools;
  const plan = contract(m, bench);
  if (!plan) return null;
  m.plan = plan.map((a) => ({ op: 'drive', dir: a.dir, steer: a.steer }));
  m.gtContract = 'final pose: heading within 15 deg of nose-out and >= 80% of the footprint inside the empty bay';
  if (bench) { m.shortest = plan.shortest; m.budget = PRESS_BUDGET; }
  return m;
}
const DEFAULT_POOLS = { styles: ['sedan', 'sedan', 'hatch', 'suv'], parked: PARKED_PAINTS, player: PLAYER_PAINTS };
function extPools(split) {
  const keep = (pool, ids) => { const f = splitIds(`reverse_park_bay|${pool}`, ids, ids.length >= 10 ? 3 : 1); return ids.filter((id) => f(id) === split); };
  const styles = keep('parked_style', Object.keys(STYLES));
  const parked = keep('parked_paint', PARKED_PAINTS_EXT.map(([n]) => n));
  const player = keep('player_paint', PLAYER_PAINTS_EXT.map(([n]) => n));
  return { styles, parked: PARKED_PAINTS_EXT.filter(([n]) => parked.includes(n)).map(([, h]) => h),
    player: PLAYER_PAINTS_EXT.filter(([n]) => player.includes(n)).map(([, h]) => h) };
}
const FALLBACK = {"task":"reverse_park_bay","board":{"w":340,"h":420},"lot":{"aw":7.54,"empty":3},"parked":[{"x":-5.873,"z":2.532,"h":88.91,"L":4.4,"W":1.8,"style":"sedan","paint":"#e8e8e4"},{"x":-3.017,"z":2.642,"h":89.58,"L":4.4,"W":1.8,"style":"sedan","paint":"#5b6168"},{"x":0.055,"z":2.783,"h":-87.95,"L":4.4,"W":1.8,"style":"sedan","paint":"#e8e8e4"},{"x":5.937,"z":2.37,"h":88.67,"L":4.08,"W":1.76,"style":"hatch","paint":"#e8e8e4"}],"start":{"x":2.731,"z":9.048,"h":335.28},"camera":{"az":234.36,"el":61.67},"look":{"paint":"#20897c"},"plan":[{"op":"drive","dir":1,"steer":0},{"op":"drive","dir":-1,"steer":-1},{"op":"drive","dir":1,"steer":1},{"op":"drive","dir":-1,"steer":-1},{"op":"drive","dir":-1,"steer":-1},{"op":"drive","dir":-1,"steer":0},{"op":"drive","dir":-1,"steer":0}],"gtContract":"final pose: heading within 15 deg of nose-out and >= 80% of the footprint inside the empty bay","shortest":7,"budget":15};

const BUTTONS = [];
for (const [row, dir] of [[0, 1], [1, -1]]) for (const [col, steer] of [[0, -1], [1, 0], [2, 1]]) {
  const word = dir > 0 ? 'Forward' : 'Reverse';
  BUTTONS.push({ row, col, dir, steer, label: steer < 0 ? `${word} left` : steer > 0 ? `${word} right` : word });
}

export default {
  meta: {
    name: 'reverse_park_bay', family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'drive', dir: '+1 forward / -1 reverse', steer: '-1 left / 0 straight / +1 right (front wheels, driver\'s left/right)', budget: 'evaluation instances: 15 presses in all, bumps included; further presses refused' }],
    promptHuman: 'Back the car into the empty space',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      const pools = extPools(knobs.ext), slot = K.seedSlot('reverse_park_bay', knobs.ext, knobs.n);
      const pre = (m) => { const k = semanticKey(m); return K.keyAccept(k, knobs.ext, EVAL_KEYS) && K.keySlot(k) === slot; };
      for (let a = 0; a < 200000; a++) { const m = tryBuild(rng, pools, pre); if (m) { m.ext = knobs.ext; return m; } }
      throw new Error('reverse_park_bay: no gated training instance');
    }
    for (let a = 0; a < 400; a++) { const m = tryBuild(rng); if (m) return m; }
    return JSON.parse(JSON.stringify(FALLBACK));
  },

  init(m) { const p = poseOf(m); return { x: p.x, z: p.z, h: p.h, moves: 0 }; },

  applyAction(st, a, m) {
    if (!a || a.op !== 'drive' || (a.dir !== 1 && a.dir !== -1) || ![-1, 0, 1].includes(a.steer)) return { ok: false, reason: 'bad-op' };
    const budget = pressBudget(m);
    if (budget !== null && st.moves >= budget) return { ok: false, reason: 'no-presses-left' };
    const r = drive(m, { x: st.x, z: st.z, h: st.h }, a.dir, a.steer);
    st.x = r.pose.x; st.z = r.pose.z; st.h = r.pose.h; st.moves++;
    return { ok: true, moved: r.frac > 0 };
  },

  verify(st, m) {
    const p = { x: st.x, z: st.z, h: st.h }, budget = pressBudget(m);
    const ok = success(m, p) && (budget === null || st.moves <= budget);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { headErrDeg: Math.round(headErrDeg(p) * 10) / 10, inside: Math.round(insideFrac(m, p) * 100) / 100, moves: st.moves,
        ...(budget !== null ? { budget } : {}) } };
  },

  oracle(m) {
    const plan = Array.isArray(m.plan) ? m.plan : (shortestPlan(m, poseOf(m), 9) || []);
    return plan.map((a) => ({ op: 'drive', dir: a.dir, steer: a.steer }));
  },

  randomPolicy(m, rnd) {
    const n = 3 + Math.floor(rnd() * 8);
    return Array.from({ length: n }, () => { const b = BUTTONS[Math.floor(rnd() * BUTTONS.length)]; return { op: 'drive', dir: b.dir, steer: b.steer }; });
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Back the car into the empty space', 'Left and right mean the driver\'s left and right');
  },

  _btnRects() {
    const w = (BOARD.w - 2 * BTN.gap) / 3;
    return BUTTONS.map((b) => ({ ...b, x: b.col * (w + BTN.gap), y: BTN.y + b.row * (BTN.h + BTN.rowGap), w, h: BTN.h }));
  },

  _icon(g, cx, cy, dir, steer) {
    g.beginPath();
    if (!steer) {
      g.moveTo(cx, cy + dir * 8); g.lineTo(cx, cy - dir * 7); g.stroke();
      g.beginPath(); g.moveTo(cx - 6, cy - dir * 1.5); g.lineTo(cx, cy - dir * 8); g.lineTo(cx + 6, cy - dir * 1.5); g.stroke();
      return;
    }
    const x0 = cx - steer * 4, y0 = cy + dir * 9, x1 = cx - steer * 4, y1 = cy - dir * 1, x2 = cx + steer * 6, y2 = cy - dir * 8;
    g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke();
    let ux = x2 - x1, uy = y2 - y1; const l = Math.hypot(ux, uy); ux /= l; uy /= l;
    g.beginPath();
    g.moveTo(x2 - ux * 7 - uy * 5, y2 - uy * 7 + ux * 5); g.lineTo(x2, y2); g.lineTo(x2 - ux * 7 + uy * 5, y2 - uy * 7 - ux * 5); g.stroke();
  },

  _drawButtons(g) {
    for (const b of this._btnRects()) {
      rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = '#eef2f6'; g.fill();
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = '#3c4955';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
      this._icon(g, b.x + b.w / 2, b.y + 16, b.dir, b.steer);
      g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h - 8);
    }
  },

  _drawView(g, m, st, look = null, lookKey = '') {
    const q = Math.min(2, RT.contextScale(g));
    const C = (this._cache ??= { m: null, q: 0, bg: null, patches: new Map() });
    if (C.m !== m || C.q !== q || (C.lk || '') !== lookKey) {
      C.m = m; C.q = q; C.patches = new Map(); C.lk = lookKey;
      C.bg = RT.toCanvas(RT.render(buildScene(m, null, look), q));
    }
    const pose = { x: st.x, z: st.z, h: st.h };
    const key = `${st.x.toFixed(4)},${st.z.toFixed(4)},${st.h.toFixed(5)}`;
    let p = C.patches.get(key);
    if (!p) {
      const sc = buildScene(m, pose, look), img = RT.renderRect(sc, q, playerRect(m, pose, sc.cam));
      p = { canvas: RT.toCanvas(img), x: img.x, y: img.y, w: img.w / q, h: img.h / q };
      if (C.patches.size > 40) C.patches.delete(C.patches.keys().next().value);
      C.patches.set(key, p);
    }
    g.save(); g.beginPath(); rr(g, 0, 0, VIEW.w, VIEW.h, 8); g.clip();
    g.drawImage(C.bg, 0, 0, VIEW.w, VIEW.h);
    g.drawImage(p.canvas, p.x, p.y, p.w, p.h);
    g.restore();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, br.w, br.h);
    const look = env.style ? env.assets?.look : null;
    if (look) this._drawView(g, m, st, look, env.style.key);
    else this._drawView(g, m, st);
    this._drawButtons(g);
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    for (const b of this._btnRects()) {
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ op: 'drive', dir: b.dir, steer: b.steer }];
    }
    return [];
  },

  footerStatus(env) {
    const n = env && env.state ? env.state.moves : 0;
    const budget = pressBudget(env && env.manifest), left = budget === null ? '' : ` · Presses left: ${Math.max(0, budget - n)}`;
    return (n ? `${n} move${n === 1 ? '' : 's'}` : 'Drive with the six buttons') + left;
  },
};
