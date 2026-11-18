import { drawPromptText } from '../core/panel.js';
import * as SC from '../common/_lazy_susan_serve_scene.js';
import * as MD from '../common/_lazy_susan_serve_model.js';

const { RT, BOARD, SWEATERS, DISHES, DISH_PAIRS, ID } = SC;
const NAME = 'lazy_susan_serve';
const RANGE = { el: [26, 34], ds: [45, 50], need: [40, 178], short: 80, beta: [15, 21], off: 18, maxBeta: 142 };
const LIM = { platePx: 18, startTarget: 0.85, startOthers: 0.5, goalHidden: 0.6, windowHidden: 0.5, neighbour: 0.7, oracleErr: 0.5 };
const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
const inR = (v, [a, b]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;
const dishOf = (kind) => DISHES.find((d) => d.kind === kind);

export function promptOf(m) {
  const d = dishOf(m.dishes[m.target.dish]), g = m.guests[m.target.guest];
  return `Spin the tray so ${d.noun} ${d.verb} in front of the ${g.woman ? 'woman' : 'man'} in the ${SWEATERS[g.sweater].name} sweater`;
}

export function contract(m) {
  const bad = (reason) => ({ ok: false, reason });
  if (!m || m.task !== NAME) return bad('task');
  if (!m.cam || !inR(m.cam.el, RANGE.el) || !Number.isFinite(m.phi0)) return bad('params');
  if (!Array.isArray(m.guests) || m.guests.length !== 6 || !Array.isArray(m.dishes) || m.dishes.length !== SC.N_DISH) return bad('shape');
  if (new Set(m.guests.map((g) => g.sweater)).size !== 6 || new Set(m.dishes).size !== 6 || !m.dishes.every(dishOf)) return bad('looks');
  if (DISH_PAIRS.some(([a, b]) => m.dishes.includes(a) && m.dishes.includes(b))) return bad('look-alike-dishes');
  const betas = m.guests.map((g) => MD.wrap(g.psi - 180));
  if (betas.some((b) => Math.abs(b) > RANGE.maxBeta) || betas.some((b, k) => k && b - betas[k - 1] < 35)) return bad('seats');
  const t = m.target, kT = t.guest, bT = betas[kT];
  if (!inR(Math.abs(bT), RANGE.beta)) return bad('guest-not-behind-vase');
  if (MD.minPlatePx(m) < LIM.platePx) return bad('plates-small');
  if (!MD.trayUnblocked(m)) return bad('tray-blocked');
  if (!MD.guestsVisible(m)) return bad('guest-hidden');
  const need = -MD.errDeg(m, m.phi0);
  if (!inR(Math.abs(need), RANGE.need)) return bad('start-too-close');
  const vs = [0, 1, 2, 3, 4, 5].map((i) => MD.visAt(m, m.phi0, i));
  if (vs[t.dish] < LIM.startTarget || vs.filter((v) => v < LIM.startOthers).length > 1) return bad('start-hidden');
  const phiG = m.phi0 + need, nb = [(t.dish + 1) % 6, (t.dish + 5) % 6];
  if (1 - MD.visAt(m, phiG, t.dish) < LIM.goalHidden) return bad('goal-not-hidden');
  for (const d of [-MD.TOL - 1.5, -MD.TOL, -MD.TOL / 2, MD.TOL / 2, MD.TOL, MD.TOL + 1.5]) if (1 - MD.visAt(m, phiG + d, t.dish) < LIM.windowHidden) return bad('window-visible');
  if (nb.some((i) => MD.visAt(m, phiG, i) < LIM.neighbour)) return bad('neighbours-hidden');
  if (!Array.isArray(m.plan) || m.plan.length !== 1) return bad('plan');
  let phi = m.phi0;
  for (const a of m.plan) {
    if (a.op !== 'turn' || !Array.isArray(a.path) || a.path.length < 2) return bad('plan-shape');
    if (!a.path.every((q) => q[0] > 4 && q[0] < BOARD.w - 4 && q[1] > 4 && q[1] < BOARD.h - 4)) return bad('plan-off-board');
    const p = MD.turnOfPath(m, a.path);
    if (!p || p.turn === 0) return bad('plan-grab');
    phi += p.turn;
  }
  if (Math.abs(MD.errDeg(m, phi)) > LIM.oracleErr) return bad('plan-misses');
  return { ok: true, metrics: { need, betaT: bT } };
}
export function gate(m) { try { return contract(m).ok; } catch { return false; } }

export function drawCandidate(rng) {
  const el = r2(rng.uniform(...RANGE.el)), ds = rng.uniform(...RANGE.ds);
  const need = rng.sign() * rng.uniform(...RANGE.need);
  const kT = Math.abs(need) < RANGE.short ? (need > 0 ? 2 : 3) : rng.pick([2, 3]), beta = (kT === 2 ? -1 : 1) * rng.uniform(...RANGE.beta);
  const o = beta - (kT - 2.5) * ds;
  if (Math.abs(o) > RANGE.off) return null;
  const sweaters = rng.sample([0, 1, 2, 3, 4, 5, 6, 7], 6);
  const guests = [0, 1, 2, 3, 4, 5].map((k) => {
    const woman = rng.raw() < 0.5;
    const b = k === kT ? beta : o + (k - 2.5) * ds + rng.uniform(-2, 2);
    return { psi: r3(180 + b), sweater: sweaters[k], skin: rng.int(0, 3), hair: rng.int(0, 3), pants: rng.int(0, 3), woman,
      h: r3(woman ? rng.uniform(1.6, 1.68) : rng.uniform(1.7, 1.8)) };
  });
  const kinds = rng.shuffle(['dumplings', 'broccoli', 'grapes', 'pork', rng.pick(['shrimp', 'tomatoes']), rng.pick(['corn', 'fish'])]);
  const dish = rng.int(0, 5);
  const phi0 = r3(MD.wrap(guests[kT].psi - 60 * dish - need));
  rng.raw();
  const m = { task: NAME, board: { ...BOARD }, cam: { el }, floorRot: r2(rng.uniform(0, 180)), guests, dishes: kinds,
    target: { dish, guest: kT }, phi0 };
  m.plan = MD.oraclePlan(m).map((a) => ({ op: 'turn', path: a.path.map((q) => q.map(r3)) }));
  return m;
}
function tryBuild(rng) { const m = drawCandidate(rng); return m && gate(m) ? m : null; }

function pathOf(a) {
  const p = Array.isArray(a.path) ? a.path : (Array.isArray(a.from) && Array.isArray(a.to) ? [a.from, a.to] : null);
  if (!p || p.length < 2 || !p.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) return null;
  return p;
}

export default {
  meta: {
    name: NAME, family: 'C', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'turn', path: '[[x,y], ...] press on the glass tray, then the pointer positions round the table (board px); the tray turns by the angle they sweep round the table centre, measured in the table plane', from: 'with to: a straight drag instead of path', to: '[x,y] release point' }],
    promptHuman: 'Spin the tray so the named dish stops in front of the named guest',
  },

  generate(rng) {
    for (let a = 0; a < 400; a++) { const m = tryBuild(rng); if (m) return m; }
    throw new Error(`${NAME}: no instance passed the gate`);
  },

  init(m) { this._drag = null; return { phi: m.phi0, turns: 0 }; },

  applyAction(st, a, m) {
    const path = a && a.op === 'turn' ? pathOf(a) : null;
    if (!path) return { ok: false, reason: 'bad-action' };
    if (st.turns >= MD.N_TURN) return { ok: false, reason: 'no-turns-left' };
    const p = MD.turnOfPath(m, path);
    if (!p) return { ok: false, reason: 'grab-off-tray' };
    if (p.turn === 0) return { ok: false, reason: 'too-small' };
    st.phi = r3(st.phi + p.turn);
    st.turns++;
    return { ok: true };
  },

  verify(st, m) {
    const e = MD.errDeg(m, st.phi), ok = Math.abs(e) <= MD.TOL;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { turns: st.turns, errDeg: r2(e) } };
  },

  oracle(m) { return m.plan.map((p) => ({ op: 'turn', path: p.path.map((q) => [...q]) })); },

  randomPolicy(m, rnd) {
    const n = 1 + Math.floor(rnd() * 3), out = [];
    for (let i = 0; i < n; i++) {
      const from = MD.grabPoint(m, -75 + 150 * rnd(), 0.26 + 0.2 * rnd()), L = 10 + 230 * rnd(), a = 2 * Math.PI * rnd();
      out.push({ op: 'turn', path: [from, [from[0] + L * Math.cos(a), from[1] + L * Math.sin(a)]] });
    }
    return out;
  },

  async mount() { this._drag = null; this._cache = null; },

  drawPrompt(g, r, env) { drawPromptText(g, r, promptOf(env.manifest), 'You have 3 turns'); },

  tick() { return false; },

  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, q = Math.min(2, RT.contextScale(g));
    const C = (this._cache ??= { m: null });
    if (C.m !== m || C.q !== q) { C.m = m; C.q = q; C.bg = RT.toCanvas(RT.render(SC.buildScene(m, 0, { dishes: false }), q)); C.rest = new Map(); }
    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, BOARD.w, BOARD.h); g.clip();
    g.drawImage(C.bg, 0, 0, BOARD.w, BOARD.h);
    const live = this._drag && !env.submitted ? this._drag.sw.turn : 0, phi = st.phi + live;
    if (Math.abs(live) > 0.05) {
      const sc = SC.buildScene(m, phi, { fast: true }), qa = Math.min(q, 0.75), keep = new Set([0, 1, 2, 3, 4, 5].map(ID.dish));
      for (let i = 0; i < SC.N_DISH; i++) {
        const img = RT.renderLayer(sc, qa, MD.dishBox(m, phi, i, 2), keep);
        g.drawImage(RT.toCanvas(img), img.x, img.y, img.bw, img.bh);
      }
    } else {
      const key = Math.round(phi * 1000);
      let P = C.rest.get(key);
      if (!P) {
        const sc = SC.buildScene(m, phi);
        P = [0, 1, 2, 3, 4, 5].map((i) => { const img = RT.renderRect(sc, q, MD.dishBox(m, phi, i, 5)); return { c: RT.toCanvas(img), x: img.x, y: img.y, w: img.w / q, h: img.h / q }; });
        if (C.rest.size > 8) C.rest.delete(C.rest.keys().next().value);
        C.rest.set(key, P);
      }
      for (const p of P) g.drawImage(p.c, p.x, p.y, p.w, p.h);
    }
    if (this._drag && !env.submitted) this._drawDrag(g);
    g.restore();
  },

  _drawDrag(g) {
    const pts = this._drag.path;
    if (pts.length < 2) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, w] of [['rgba(20,28,40,.55)', 4], ['rgba(255,255,255,.92)', 1.6]]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.strokeStyle = 'rgba(20,28,40,.7)'; g.lineWidth = 1.2;
    for (const [x, y, r] of [[pts[0][0], pts[0][1], 3.2], [pts[pts.length - 1][0], pts[pts.length - 1][1], 4.5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.restore();
  },

  pointer(e, env) {
    const st = env.state, m = env.manifest;
    if (env.submitted || st.turns >= MD.N_TURN) { this._drag = null; return []; }
    if (e.type === 'down') {
      if (!MD.grabAt(m, e.x, e.y)) { this._drag = null; return []; }
      const sw = MD.sweeper(m); sw.feed(e.x, e.y);
      this._drag = { path: [[e.x, e.y]], sw };
      return [];
    }
    const d = this._drag;
    if (!d) return [];
    const last = d.path[d.path.length - 1];
    if (e.type === 'move' || e.type === 'up') {
      if (e.x !== last[0] || e.y !== last[1]) { d.path.push([e.x, e.y]); d.sw.feed(e.x, e.y); }
    }
    if (e.type === 'up') { this._drag = null; return d.path.length < 2 ? [] : [{ op: 'turn', path: d.path }]; }
    return [];
  },
  wantsMoveRedraw: true,

  footerStatus(env) {
    const left = MD.N_TURN - (env?.state?.turns ?? 0);
    return left > 0 ? `${left} turn${left === 1 ? '' : 's'} left` : 'No turns left';
  },
  gate,
};
