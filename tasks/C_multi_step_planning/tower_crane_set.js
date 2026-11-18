import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import * as M from '../common/_tower_crane_set_model.js';
import * as V from '../common/_tower_crane_set_view.js';

const NAME = 'tower_crane_set';
const C = M.C;
export const COLORS = { red: '#d42a1f', blue: '#1f55c9', yellow: '#f5bd00', green: '#1f9a3e' };
const BOARD = { w: V.VIEW.w, h: V.VIEW.h + 106 };
const BTN = { y: V.VIEW.h + 8, h: 44, gap: 8, rowGap: 6 };
const GATE = { moves: [5, 10], extra: 5, wMax: 6, shadowVis: 0.7, bayVis: 0.8, decoyMin: 1.5, shadowPx: 12 };
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return d; };

export function screenAlign(m, cam = M.camBase(m)) {
  const b = m.bays[m.target], q = cam.project(b.x, 0, b.z);
  let best = null;
  for (let k = -24; k <= 24; k++) for (let j = -14; j <= 14; j++) {
    if (!M.jOk(m, j)) continue;
    const p = M.loadScreen(m, cam, k, j), d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { k, j, d };
  }
  return best;
}
function robustWait(p) {
  for (let w = 1; w <= GATE.wMax; w++) if (p[w - 1] && p[w] && p[w + 1] && p[w + 2]) return w;
  return -1;
}
function contract(m) {
  if (!m || m.task !== NAME || !Array.isArray(m.bays) || !m.goal || !m.start) return null;
  const { dk, dj } = m.goal, moves = Math.abs(dk) + Math.abs(dj);
  if (moves < GATE.moves[0] || moves > GATE.moves[1] || !M.jOk(m, dj)) return null;
  const tb = m.bays[m.target];
  if (!tb || M.insideFrac(tb, ...M.polar(M.thOf(m, dk), M.rOf(m, dj)), M.thOf(m, dk)) < 0.95) return null;
  const [sx, sz] = M.polar(m.start.th, m.start.r);
  if (m.bays.some((b) => M.insideFrac(b, sx, sz, m.start.th) > 0)) return null;
  const prof = {}; let wMin = Infinity;
  for (const o of M.ORDERS) {
    const p = M.waitProfile(m, dk, dj, o, GATE.wMax + 2);
    if (p[0] || p[1]) return null;
    prof[o] = p; const w = p.indexOf(true); if (w >= 0) wMin = Math.min(wMin, w);
  }
  if (!Number.isFinite(wMin)) return null;
  let order = null, wo = -1;
  for (const o of M.ORDERS) { const w = robustWait(prof[o]); if (w > 0 && (wo < 0 || w < wo)) { order = o; wo = w; } }
  if (!order) return null;
  const shortest = moves + wMin + 1, budget = shortest + GATE.extra;
  if (moves + wo + 1 > budget) return null;
  const cam = M.camBase(m), sa = screenAlign(m, cam);
  const prof2 = (() => { let s = { k: 0, j: 0, dx: 0, dz: 0, vx: 0, vz: 0 };
    for (const [kind, dir] of M.routeMoves(sa.k, sa.j, 'slew-first')) s = M.integratePress(m, s, kind, dir);
    for (let w = 0; w < 8; w++) s = M.integratePress(m, s, 'wait', 0);
    return M.dropOutcome(m, s); })();
  if (Math.hypot(prof2.x - tb.x, prof2.z - tb.z) < GATE.decoyMin) return null;
  if (!m.bays.some((b, i) => i !== m.target && M.insideFrac(b, prof2.x, prof2.z, prof2.yaw) >= C.INSIDE)) return null;
  const eye = cam.eye;
  let s = { k: 0, j: 0, dx: 0, dz: 0, vx: 0, vz: 0 };
  const plan = [...M.routeMoves(dk, dj, order), ...Array.from({ length: wo }, () => ['wait', 0])];
  for (const [kind, dir] of plan) {
    const fr = []; s = M.integratePress(m, s, kind, dir, fr, 6);
    if (fr.some((f) => M.shadowVisible(m, eye, f) < GATE.shadowVis)) return null;
  }
  const frD = []; M.dropOutcome(m, s, frD, 6);
  if (frD.some((f) => f.y > 1 && M.shadowVisible(m, eye, f) < GATE.shadowVis)) return null;
  const mastOcc = M.occluders(m, { th: 0, x: 0, z: 0, dx: 0, dz: 0 })[0];
  for (const b of m.bays) {
    const pts = M.square(b.x, b.z, b.yaw, C.BAY * 0.8).concat([[b.x, b.z]]);
    let vis = 0;
    for (const [x, z] of pts) {
      const d = [x - eye[0], -eye[1], z - eye[2]], L = Math.hypot(...d);
      if (!rayHitsBox(eye, d.map((q) => q / L), mastOcc, L)) vis++;
    }
    if (vis / pts.length < GATE.bayVis) return null;
  }
  const vc = V.cameraFor(m);
  for (const [k, j] of [[0, 0], [dk, dj]]) {
    const [x, z] = M.polar(M.thOf(m, k), M.rOf(m, j)), q = M.square(x, z, M.thOf(m, k), C.PAL).map(([a, b]) => vc.project(a, 0, b));
    const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) < GATE.shadowPx || Math.max(...ys) - Math.min(...ys) < GATE.shadowPx) return null;
  }
  return { order, wo, wMin, shortest, budget, sa, plan };
}
function rayHitsBox(o, d, B, tmax) {
  let tn = -Infinity, tf = tmax;
  for (let i = 0; i < 3; i++) {
    const a = B.ax[i], oc = (o[0] - B.c[0]) * a[0] + (o[1] - B.c[1]) * a[1] + (o[2] - B.c[2]) * a[2], dd = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
    if (Math.abs(dd) < 1e-12) { if (Math.abs(oc) > B.h[i]) return false; continue; }
    let t1 = (-B.h[i] - oc) / dd, t2 = (B.h[i] - oc) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tn = Math.max(tn, t1); tf = Math.min(tf, t2); if (tn > tf) return false;
  }
  return tn > 1e-6 && tn < tmax;
}
export function gate(m) {
  const c = contract(m);
  if (!c || !Array.isArray(m.plan) || m.budget !== c.budget) return false;
  const want = planActions(c.plan);
  if (m.plan.length !== want.length || m.plan.some((a, i) => a.op !== want[i].op || a.dir !== want[i].dir)) return false;
  const st = M.initState(m);
  for (const a of [...m.plan, { op: 'drop' }]) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
function planActions(plan) {
  return plan.map(([kind, dir]) => kind === 'slew' ? { op: 'slew', dir: dir > 0 ? 'left' : 'right' }
    : kind === 'trolley' ? { op: 'trolley', dir: dir > 0 ? 'out' : 'in' } : { op: 'wait' });
}

function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
const ROUTES = [];
for (let a = 2; a <= 6; a++) for (let b = 1; b <= 5; b++) if (a + b >= GATE.moves[0] && a + b <= GATE.moves[1]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) ROUTES.push([a * sa, b * sb]);
function tryBuild(rng, route) {
  const U = rng.uniform;
  const phi = U(0, 360), H = r2(U(3, 5)), zeta = r3(U(0.16, 0.22));
  const th0 = r2(phi + U(-40, 40)), r0 = r2(U(6, 14.5));
  const [dk, dj] = route;
  const m = { task: NAME, board: { ...BOARD }, H, zeta, start: { th: th0, r: r0 }, goal: { dk, dj }, bays: [], target: 0,
    cam: { az: r2((phi + U(-70, 70) + 360) % 360), el: r2(U(35, 45)), look: [0, 0, 0] } };
  const rt = M.rOf(m, dj), tht = M.thOf(m, dk);
  if (rt < 8 || rt > 14.5 || Math.abs(angDiff(tht, phi)) > 48) return null;
  const [sx, sz] = M.polar(th0, r0), [tx, tz] = M.polar(tht, rt);
  m.cam.look = [r2((sx + tx) * 0.4), 0, r2((sz + tz) * 0.4)];
  const jit = () => U(-0.25, 0.25);
  const tb = M.bayAt(m, dk, dj);
  const bays = [{ x: r3(tb.x + jit()), z: r3(tb.z + jit()), yaw: r2(tb.yaw + U(-3, 3)) }];
  m.bays = bays;
  const sa = screenAlign(m);
  const db = M.bayAt(m, sa.k, sa.j), dr = M.rOf(m, sa.j);
  if (dr < 5 || dr > 15.5) return null;
  const decoy = { x: r3(db.x + U(-0.15, 0.15)), z: r3(db.z + U(-0.15, 0.15)), yaw: r2(db.yaw + U(-3, 3)) };
  const far = (b, list) => list.every((q) => Math.hypot(q.x - b.x, q.z - b.z) >= C.BAY * 1.5);
  if (!far(decoy, bays)) return null;
  bays.push(decoy);
  const nb = rng.raw() < 0.5 ? 3 : 4;
  for (let tries = 0; bays.length < nb && tries < 60; tries++) {
    const th = phi + U(-55, 55), r = U(6.5, 15);
    const [x, z] = M.polar(th, r), b = { x: r3(x), z: r3(z), yaw: r2(th + U(-3, 3)) };
    if (far(b, bays) && M.insideFrac(b, sx, sz, th0) === 0) bays.push(b);
  }
  if (bays.length < nb) return null;
  const cols = rng.shuffle(Object.keys(COLORS)).slice(0, nb);
  bays.forEach((b, i) => { b.color = cols[i]; });
  const order = rng.shuffle(bays.map((_, i) => i));
  m.bays = order.map((i) => bays[i]);
  m.target = order.indexOf(0);
  const c = contract(m);
  if (!c) return null;
  m.budget = c.budget;
  m.plan = planActions(c.plan);
  m.gtContract = 'Drop once; the pallet must land >= 80% inside the named bay with swing amplitude <= 0.35 m at touch-down';
  return m;
}

const BUTTONS = [
  { row: 0, col: 0, n: 4, a: { op: 'slew', dir: 'left' }, label: 'Turn left', icon: 'ccw' },
  { row: 0, col: 1, n: 4, a: { op: 'slew', dir: 'right' }, label: 'Turn right', icon: 'cw' },
  { row: 0, col: 2, n: 4, a: { op: 'trolley', dir: 'in' }, label: 'Trolley in', icon: 'in' },
  { row: 0, col: 3, n: 4, a: { op: 'trolley', dir: 'out' }, label: 'Trolley out', icon: 'out' },
  { row: 1, col: 0, n: 2, a: { op: 'wait' }, label: 'Wait', icon: 'wait' },
  { row: 1, col: 1, n: 2, a: { op: 'drop' }, label: 'Drop', icon: 'drop' },
];
function btnRects() {
  return BUTTONS.map((b) => {
    const w = (BOARD.w - (b.n - 1) * BTN.gap) / b.n;
    return { ...b, x: b.col * (w + BTN.gap), y: BTN.y + b.row * (BTN.h + BTN.rowGap), w, h: BTN.h };
  });
}
const pressesLeft = (st, m) => Math.max(0, m.budget - st.n);

const task = {
  meta: {
    name: NAME, family: 'C', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [
      { op: 'slew', dir: "'left' | 'right' -- the jib turns 8 deg counter-clockwise / clockwise seen from above" },
      { op: 'trolley', dir: "'in' | 'out' -- the trolley runs 1.2 m toward / away from the mast" },
      { op: 'wait' }, { op: 'drop', note: 'once; lowers the load to the ground' },
    ],
    promptHuman: 'Set the pallet down in the <colour> bay',
  },

  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 6000; a++) {
      const route = ROUTES[Math.floor(mulberry32(mix32(key, 0x5eed0000 + Math.floor(a / 60)))() * ROUTES.length)];
      const m = tryBuild(R(mulberry32(mix32(key, a))), route);
      if (m) return m;
    }
    throw new Error('tower_crane_set: generator exhausted');
  },

  init(m) { return M.initState(m); },

  applyAction(st, a, m) {
    if (!a || !['slew', 'trolley', 'wait', 'drop'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (st.dropped) return { ok: false, reason: 'dropped' };
    if (st.n >= m.budget) return { ok: false, reason: 'no-presses-left' };
    const pre = M.swingOf(st);
    if (a.op === 'drop') {
      st.land = M.dropOutcome(m, pre);
      st.dropped = true; st.n++;
      st.last = { n: st.n, op: 'drop', pre };
      return { ok: true };
    }
    const pk = M.pressKind(a);
    if (!pk) return { ok: false, reason: 'bad-dir' };
    const s = M.integratePress(m, pre, pk.kind, pk.dir);
    Object.assign(st, s); st.n++;
    st.last = { n: st.n, op: a.op, kind: pk.kind, dir: pk.dir, pre };
    return { ok: true, moved: pk.kind !== 'wait' && (s.k !== pre.k || s.j !== pre.j) };
  },

  verify(st, m) {
    const L = st.land, b = m.bays[m.target];
    const ok = !!st.dropped && M.outcomeOk(m, L);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0,
      detail: { dropped: !!st.dropped, tipped: L ? L.tipped : null, inside: L ? r2(M.insideFrac(b, L.x, L.z, L.yaw)) : 0,
        amp: L ? r2(L.amp) : null, off: L ? r2(Math.hypot(L.x - b.x, L.z - b.z)) : null, presses: st.n, budget: m.budget } };
  },

  oracle(m) { return [...m.plan.map((a) => ({ ...a })), { op: 'drop' }]; },

  randomPolicy(m, rnd) {
    const n = 4 + Math.floor(rnd() * 11), acts = [], moves = BUTTONS.slice(0, 5).map((b) => b.a);
    for (let i = 0; i < n; i++) acts.push({ ...moves[Math.floor(rnd() * moves.length)] });
    acts.push({ op: 'drop' });
    return acts;
  },

  drawPrompt(g, r, env) {
    const m = env.manifest;
    drawPromptText(g, r, `Set the pallet down in the ${m.bays[m.target].color} bay`, 'Drop works only once');
  },

  tick(env, dt) { return V.tick(env, dt); },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    V.drawView(g, env, COLORS);
    drawButtons(g, st.dropped || pressesLeft(st, m) === 0 || env.submitted);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const st = env.state, m = env.manifest;
    if (st.dropped || pressesLeft(st, m) === 0 || V.busy(env)) return [];
    for (const b of btnRects()) if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ ...b.a }];
    return [];
  },

  footerStatus(env) {
    const st = env.state, m = env.manifest, left = pressesLeft(st, m);
    if (st.dropped) return 'Load set down';
    return `${left} press${left === 1 ? '' : 'es'} left`;
  },
};
export default task;

function drawButtons(g, locked) {
  for (const b of btnRects()) {
    rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = locked ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = locked ? '#dde1e6' : '#c8d0d8'; g.lineWidth = 1; g.stroke();
    const col = locked ? '#b5bcc4' : '#3c4955';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
    const wide = b.n === 2, cx = wide ? b.x + b.w / 2 - 34 : b.x + b.w / 2, cy = wide ? b.y + b.h / 2 : b.y + 15;
    icon(g, b.icon, cx, cy);
    g.font = `700 ${wide ? 13 : 11}px ${UI_FONT}`; g.textAlign = wide ? 'left' : 'center'; g.textBaseline = 'middle';
    g.fillText(b.label, wide ? cx + 18 : cx, wide ? cy + 0.5 : b.y + b.h - 9);
  }
}
function icon(g, kind, cx, cy) {
  if (kind === 'ccw' || kind === 'cw') {
    const cw = kind === 'cw', rad = 7, deg = Math.PI / 180, [aS, aE] = cw ? [30 * deg, 300 * deg] : [150 * deg, -120 * deg];
    g.beginPath(); g.arc(cx, cy, rad, aS, aE, !cw); g.stroke();
    const hx = cx + rad * Math.cos(aE), hy = cy + rad * Math.sin(aE);
    const tx = cw ? -Math.sin(aE) : Math.sin(aE), ty = cw ? Math.cos(aE) : -Math.cos(aE), nx = Math.cos(aE), ny = Math.sin(aE);
    g.beginPath(); g.moveTo(hx + tx * 6, hy + ty * 6); g.lineTo(hx - tx * 1.5 + nx * 4.4, hy - ty * 1.5 + ny * 4.4); g.lineTo(hx - tx * 1.5 - nx * 4.4, hy - ty * 1.5 - ny * 4.4); g.closePath(); g.fill();
  } else if (kind === 'in' || kind === 'out') {
    g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 14, cy - 7); g.lineTo(cx - 14, cy + 7); g.moveTo(cx - 14, cy - 5); g.lineTo(cx + 14, cy - 5); g.stroke();
    g.lineWidth = 2.4; const s = kind === 'out' ? 1 : -1, x0 = cx - s * 7, x1 = cx + s * 8, y = cy + 3;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.beginPath(); g.moveTo(x1 + s * 2, y); g.lineTo(x1 - s * 4, y - 4.5); g.lineTo(x1 - s * 4, y + 4.5); g.closePath(); g.fill();
  } else if (kind === 'wait') {
    g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - 5); g.lineTo(cx, cy); g.lineTo(cx + 4, cy + 2.5); g.stroke();
  } else if (kind === 'drop') {
    g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx, cy + 3); g.stroke();
    g.beginPath(); g.moveTo(cx - 5.5, cy - 1); g.lineTo(cx, cy + 5); g.lineTo(cx + 5.5, cy - 1); g.stroke();
    g.beginPath(); g.moveTo(cx - 9, cy + 9); g.lineTo(cx + 9, cy + 9); g.stroke();
  }
}
