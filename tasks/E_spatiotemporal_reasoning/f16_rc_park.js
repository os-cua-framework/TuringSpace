import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, makeCam, poly, shade, sphere, box } from '../common/_f16_scene_kit.js';

const NAME = 'f16_rc_park';
const PROMPT = 'Park the toy car in the bay, facing its arrow';
const SUB = "Buttons drive the car from its own point of view · the camera circles the lot · the forklift shuttles end to end along its yellow lane";
const VIEW = { w: 640, h: 390 };
const BTN = { y: VIEW.h + 8, h: 46 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const G = 6, TURNS = 15, N = TURNS + 1, SPARE = 3, CELL = 1.2, SPIN = 30;
const DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const ACTS = ['fwd', 'back', 'left', 'right'];
const key = (x, z) => `${x},${z}`;

function fork(m, t) {
  const L = m.fork, n = L.len - 1, per = 2 * n, u = ((L.k + t) % per + per) % per, i = u <= n ? u : per - u;
  return L.axis === 'x' ? [L.a + i, L.b] : [L.b, L.a + i];
}
function step(m, s, act, forkAt = fork) {
  if (s.dead || s.won) return s;
  const o = { ...s, t: s.t + 1 };
  if (act === 'left') o.h = (s.h + 3) % 4; else if (act === 'right') o.h = (s.h + 1) % 4;
  else if (act !== 'wait') { const d = DIR[s.h], k = act === 'fwd' ? 1 : -1; o.x = s.x + k * d[0]; o.z = s.z + k * d[1]; }
  if (o.x < 0 || o.x >= G || o.z < 0 || o.z >= G || m.cones.has(key(o.x, o.z))) o.dead = 'crash';
  const f1 = forkAt(m, o.t), f0 = forkAt(m, s.t);
  if (f1[0] === o.x && f1[1] === o.z) o.dead = 'forklift';
  if (f0[0] === o.x && f0[1] === o.z && f1[0] === s.x && f1[1] === s.z) o.dead = 'forklift';
  if (!o.dead && o.x === m.bay.x && o.z === m.bay.z && o.h === m.bay.h) o.won = true;
  return o;
}
const start = (m) => ({ x: m.car.x, z: m.car.z, h: m.car.h, t: 0, dead: null, won: false });
function run(m, acts, forkAt) { let s = start(m); for (const a of acts) { if (s.dead || s.won || s.t >= TURNS) break; s = step(m, s, a, forkAt); } return s; }
function route(m, forkAt = fork) {
  const seen = new Set(), q = [{ s: start(m), acts: [] }];
  while (q.length) {
    const { s, acts } = q.shift();
    if (s.won) return acts; if (s.dead || s.t >= TURNS) continue;
    const k = `${s.t}|${s.x}|${s.z}|${s.h}`; if (seen.has(k)) continue; seen.add(k);
    for (const a of [...ACTS, 'wait']) { const n = step(m, s, a, forkAt); if (!n.dead) q.push({ s: n, acts: [...acts, a] }); }
  }
  return null;
}
const stillFork = (m) => fork(m, 0);
function stale(m) {
  const acts = []; let s = start(m), h0 = m.car.h;
  for (let i = 0; i < TURNS && !s.dead && !s.won; i++) {
    const q = Math.round((SPIN * s.t) / 90) % 4, hApp = (s.h + q) % 4;
    const dx = m.bay.x - s.x, dz = m.bay.z - s.z;
    const want = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2);
    let a = hApp === want ? 'fwd' : (hApp + 1) % 4 === want ? 'right' : 'left';
    if (dx === 0 && dz === 0) a = (hApp + 1) % 4 === m.bay.h ? 'right' : 'left';
    acts.push(a); s = step(m, s, a);
  }
  return acts;
}
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 3)); let w = 0;
  for (let i = 0; i < k; i++) if (run(m, Array.from({ length: TURNS }, () => ACTS[Math.floor(rnd() * 4)])).won) w++;
  return w / k;
}
function build(rng) {
  const cones = new Set(), car = { x: rng.int(0, G - 1), z: rng.int(0, 1), h: rng.int(0, 3) };
  const bay = { x: rng.int(0, G - 1), z: rng.int(4, 5), h: rng.int(0, 3) };
  const axis = rng.pick(['x', 'z']), b = rng.int(2, 3), a = 0, len = G;
  for (let i = 0; i < rng.int(3, 5); i++) { const c = [rng.int(0, G - 1), rng.int(1, 4)]; if (key(...c) !== key(car.x, car.z) && key(...c) !== key(bay.x, bay.z) && !(axis === 'x' ? c[1] === b : c[0] === b)) cones.add(key(...c)); }
  return { task: NAME, n: N, dt: 1, cones, car, bay, fork: { axis, a, b, len, k: rng.int(0, 2 * (len - 1) - 1) }, spin: rng.pick([-1, 1]) * SPIN, az0: r3(rng.uniform(0, 360)) };
}
export function contract(m) {
  const why = [], r = route(m);
  if (!r) why.push('no route'); else if (r.length > TURNS - SPARE) why.push('< 3 spare turns'); else if (r.length < 6) why.push('route too short');
  const st = route(m, stillFork); if (st && run(m, st).won) why.push('still-forklift plan wins');
  if (run(m, stale(m)).won) why.push('stale-camera reading wins');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

const wx = (x) => (x - (G - 1) / 2) * CELL, wz = (z) => (z - (G - 1) / 2) * CELL;
function camOf(m, t) { return makeCam({ az: m.az0 + m.spin * t, el: 52, dist: 11.5, tgt: [0, 0, 0], fov: 42, W: VIEW.w, H: VIEW.h, cy: 4 }); }
function drawView(g, m, st) {
  const cam = camOf(m, st.t), t = st.t, half = G * CELL / 2;
  g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const P = (x, z, y = 0) => cam.project(x, y, z);
  poly(g, [P(-half - 0.6, -half - 0.6), P(half + 0.6, -half - 0.6), P(half + 0.6, half + 0.6), P(-half - 0.6, half + 0.6)], '#c9c1ad');
  poly(g, [P(-half, -half), P(half, -half), P(half, half), P(-half, half)], '#4b4f57');
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i <= G; i++) { const v = -half + i * CELL; let a = P(v, -half, 0.002), b = P(v, half, 0.002); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); a = P(-half, v, 0.002); b = P(half, v, 0.002); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  const bx = wx(m.bay.x), bz = wz(m.bay.z), q = CELL / 2 - 0.08;
  poly(g, [P(bx - q, bz - q, 0.004), P(bx + q, bz - q, 0.004), P(bx + q, bz + q, 0.004), P(bx - q, bz + q, 0.004)], 'rgba(255,214,0,0.25)', '#ffd600', 2.5);
  const d = DIR[m.bay.h], n = [d[1], -d[0]], A = (u, v) => P(bx + d[0] * u + n[0] * v, bz + d[1] * u + n[1] * v, 0.006);
  poly(g, [A(0.38, 0), A(0.05, 0.22), A(0.05, 0.08), A(-0.35, 0.08), A(-0.35, -0.08), A(0.05, -0.08), A(0.05, -0.22)], '#ffd600');
  { const L = m.fork, c0 = L.a, c1 = L.a + L.len - 1, w = 0.22;
    const cell = (i) => (L.axis === 'x' ? [wx(i), wz(L.b)] : [wx(L.b), wz(i)]);
    const [ax, az] = cell(c0), [bx2, bz2] = cell(c1), ex = L.axis === 'x' ? [CELL / 2, 0] : [0, CELL / 2];
    const sx = L.axis === 'x' ? 0 : w, sz = L.axis === 'x' ? w : 0;
    poly(g, [P(ax - ex[0] - sx, az - ex[1] - sz, 0.003), P(bx2 + ex[0] - sx, bz2 + ex[1] - sz, 0.003), P(bx2 + ex[0] + sx, bz2 + ex[1] + sz, 0.003), P(ax - ex[0] + sx, az - ex[1] + sz, 0.003)], 'rgba(255,214,0,0.35)');
    for (const [cx, cz, k] of [[ax, az, -1], [bx2, bz2, 1]]) { const ox = cx + k * ex[0] * 0.9, oz = cz + k * ex[1] * 0.9; box(g, cam, { x0: ox - (sx || 0.06) * 1.6, x1: ox + (sx || 0.06) * 1.6, y0: 0, y1: 0.3, z0: oz - (sz || 0.06) * 1.6, z1: oz + (sz || 0.06) * 1.6 }, k > 0 ? '#e53935' : '#e53935'); }
  }
  const items = [];
  for (const c of m.cones) { const [x, z] = c.split(',').map(Number); items.push({ x: wx(x), z: wz(z), draw: (X, Z) => cone(g, cam, X, Z) }); }
  const f = fork(m, t); items.push({ x: wx(f[0]), z: wz(f[1]), draw: (X, Z) => forklift(g, cam, X, Z, m.fork.axis) });
  if (!st.won || true) items.push({ x: wx(st.x), z: wz(st.z), draw: (X, Z) => car(g, cam, X, Z, st.h, st.dead) });
  items.sort((a, b) => Math.hypot(b.x - cam.eye[0], b.z - cam.eye[2]) - Math.hypot(a.x - cam.eye[0], a.z - cam.eye[2]));
  for (const it of items) it.draw(it.x, it.z);
  if (st.dead || st.won) {
    const msg = st.won ? 'Parked' : st.dead === 'forklift' ? 'Hit the forklift' : 'Crashed';
    g.font = `700 18px ${UI_FONT}`; const w = g.measureText(msg).width + 34;
    rr(g, (VIEW.w - w) / 2, 12, w, 34, 10); g.fillStyle = st.won ? 'rgba(46,125,50,0.92)' : 'rgba(198,40,40,0.92)'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, VIEW.w / 2, 29);
  }
}
function cone(g, cam, X, Z) {
  const base = [], tip = cam.project(X, 0.55, Z); for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI; base.push(cam.project(X + Math.cos(a) * 0.2, 0.01, Z + Math.sin(a) * 0.2)); }
  poly(g, base, '#e65100'); g.beginPath(); g.moveTo(tip.x, tip.y); const l = base.reduce((a, b) => (b.x < a.x ? b : a)), r = base.reduce((a, b) => (b.x > a.x ? b : a));
  g.lineTo(l.x, l.y); g.lineTo(r.x, r.y); g.closePath(); g.fillStyle = '#ff6d00'; g.fill(); g.strokeStyle = '#8c3a00'; g.lineWidth = 1; g.stroke();
}
function forklift(g, cam, X, Z, axis) {
  box(g, cam, { x0: X - 0.38, x1: X + 0.38, y0: 0, y1: 0.42, z0: Z - 0.38, z1: Z + 0.38 }, '#fbc02d');
  box(g, cam, { x0: X - 0.2, x1: X + 0.2, y0: 0.42, y1: 0.85, z0: Z - 0.2, z1: Z + 0.2 }, '#424242');
}
function car(g, cam, X, Z, h, dead) {
  const d = DIR[h], n = [d[1], -d[0]], c = (u, v, y) => cam.project(X + d[0] * u + n[0] * v, y, Z + d[1] * u + n[1] * v);
  const L = 0.42, W = 0.25, H = 0.26;
  const top = [c(L, W, H), c(L, -W, H), c(-L, -W, H), c(-L, W, H)], bot = [c(L, W, 0.02), c(L, -W, 0.02), c(-L, -W, 0.02), c(-L, W, 0.02)];
  for (let i = 0; i < 4; i++) poly(g, [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], dead ? '#7a2b2b' : '#1565c0', 'rgba(0,0,0,0.35)', 0.8);
  poly(g, top, dead ? '#a33' : '#1e88e5', 'rgba(0,0,0,0.4)', 1);
  poly(g, [c(0.12, W * 0.8, H + 0.01), c(0.12, -W * 0.8, H + 0.01), c(-0.2, -W * 0.8, H + 0.01), c(-0.2, W * 0.8, H + 0.01)], '#bbdefb');
  for (const v of [W * 0.6, -W * 0.6]) sphere(g, cam, X + d[0] * (L + 0.01) + n[0] * v, 0.15, Z + d[1] * (L + 0.01) + n[1] * v, 0.06, '#fff59d');
}
const DEFS = [['left', 'Turn left'], ['fwd', 'Forward'], ['back', 'Back'], ['right', 'Turn right']];
const buttons = () => { const gap = 8, w = (BOARD.w - 5 * gap) / 4; return DEFS.map(([id, label], i) => ({ id, label, x: gap + i * (w + gap), y: BTN.y, w, h: BTN.h })); };

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) { const st = route(m, stillFork), hit = !!st && run(m, st).won; return { singleFrame: hit, hits: hit ? ['still-forklift plan'] : [] }; }
const gameOver = (st, m) => st.dead || st.won || st.turn >= TURNS;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'drive', a: 'fwd | back | left | right', note: "in the car's own frame; one turn = one frame" }, { op: 'wait' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const k0 = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 8000; a++) { const kk = mix32(k0, a), m = build(R(mulberry32(kk))); m.key = kk; if (!contract(m).ok) continue; m.plan = route(m); m.board = { ...BOARD }; m.cones = new Set(m.cones); return m; }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames() { return { n: N, period: N }; },
  init(m) { return { ...clockState(), ...(m ? start(m) : { x: 0, z: 0, h: 0, t: 0, dead: null, won: false }), turn: 0 }; },
  applyAction(st, a, m) {
    const act = a?.op === 'wait' ? 'wait' : a?.op === 'drive' && ACTS.includes(a.a) ? a.a : null;
    if (!act) return { ok: false, reason: 'bad-op' };
    if (st.dead || st.won || st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const n = step(m, st, act); Object.assign(st, { x: n.x, z: n.z, h: n.h, dead: n.dead || null, won: n.won }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st) { const ok = !!st.won; return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { won: st.won, dead: st.dead, at: [st.x, st.z, st.h], turns: st.turn } }; },
  oracle(m) { return m.plan.map((a) => (a === 'wait' ? { op: 'wait' } : { op: 'drive', a })); },
  randomPolicy(m, rnd) { return Array.from({ length: TURNS }, () => ({ op: 'drive', a: ACTS[Math.floor(rnd() * 4)] })); },
  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },
  drawBoard(g, br, env) {
    const st = env.state, over = env.submitted || gameOver(env.state, env.manifest);
    g.save(); g.translate(br.x, br.y); g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip(); drawView(g, env.manifest, st); g.restore();
    for (const b of buttons()) {
      rr(g, b.x, b.y, b.w, b.h, 10); g.fillStyle = over ? '#f1f3f5' : '#e6eef7'; g.fill(); g.strokeStyle = over ? '#d9dee3' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
      g.fillStyle = over ? '#aab3bb' : '#2d4a68'; g.font = `700 15px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    const st = env.state; if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const b = buttons().find((q) => evt.x >= q.x && evt.x <= q.x + q.w && evt.y >= q.y && evt.y <= q.y + q.h);
    return b ? [{ op: 'drive', a: b.id }] : [];
  },
  footerStatus(env) { const st = env?.state; if (!st) return ''; return st.won ? 'Parked' : st.dead ? 'Crashed' : `Turn ${st.turn + 1} of ${TURNS}`; },
  gate, frameAudit, contract,
};
export default task;
