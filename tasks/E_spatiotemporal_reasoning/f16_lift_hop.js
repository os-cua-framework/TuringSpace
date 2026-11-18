import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, makeCam, poly, shade, sphere, box } from '../common/_f16_scene_kit.js';

const NAME = 'f16_lift_hop';
const PROMPT = 'Reach the top loading dock';
const SUB = 'Each button is one turn · a step lands next frame: climb at most 1 level, drop at most 2 (a groove = 1 level)';
const VIEW = { w: 640, h: 390 };
const BTN = { y: VIEW.h + 8, h: 46 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const ROWS = 4, COLS = 3, TURNS = 15, N = TURNS + 1, SPARE = 3;
const UP = 1, DOWN = 2, MARGIN = 0, START_L = 0, GOAL_L = 4;
const MOVES = { fwd: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0], wait: [0, 0] };

const LV = 0.5;
function level(m, c, r, t) {
  if (r === 0) return START_L; if (r === ROWS + 1) return GOAL_L;
  const P = m.plat[r - 1][c], span = P.hi - P.lo, per = 2 * span, u = ((P.k + t) % per + per) % per;
  return u <= span ? P.lo + u : P.hi - (u - span);
}
const height = (m, c, r, t) => level(m, c, r, t) * LV;
const onBoard = (c, r) => c >= 0 && c < COLS && r >= 0 && r <= ROWS + 1 && (r > 0 || c === 1) && (r <= ROWS || c === 1);
function step(m, s, act, rule = 'lead', margin = 0) {
  if (s.dead || s.won) return s;
  const [dc, dr] = MOVES[act], c = s.c + dc, r = s.r + dr, t = s.t + 1, o = { ...s, t };
  if (act === 'wait') return o;
  if (!onBoard(c, r)) { o.dead = 'edge'; return o; }
  const tt = rule === 'now' ? s.t : rule === 'still' ? 0 : t, ts = rule === 'still' ? 0 : rule === 'now' ? s.t : t;
  const mine = level(m, s.c, s.r, ts), theirs = level(m, c, r, tt), d = theirs - mine;
  if (d > UP) o.dead = 'bump'; else if (d < -DOWN) o.dead = 'fell';
  else { o.c = c; o.r = r; if (r === ROWS + 1) o.won = true; }
  return o;
}
const start = () => ({ c: 1, r: 0, t: 0, dead: null, won: false });
function run(m, acts, rule) { let s = start(); for (const a of acts) { if (s.dead || s.won || s.t >= TURNS) break; s = step(m, s, a, rule); } return s; }
function route(m, rule, margin, s0 = start(), pre = []) {
  const seen = new Set(), q = [{ s: s0, acts: pre }];
  while (q.length) {
    const { s, acts } = q.shift();
    if (s.won) return acts;
    if (s.dead || s.t >= TURNS) continue;
    const k = `${s.t}|${s.c}|${s.r}`; if (seen.has(k)) continue; seen.add(k);
    for (const a of Object.keys(MOVES)) { const n = step(m, s, a, rule, margin); if (!n.dead) q.push({ s: n, acts: [...acts, a] }); }
  }
  return null;
}
const careful = (m) => route(m, 'lead', MARGIN, step(m, start(), 'wait'), ['wait']);
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 13)), A = Object.keys(MOVES); let w = 0;
  for (let i = 0; i < k; i++) if (run(m, Array.from({ length: TURNS }, () => A[Math.floor(rnd() * A.length)])).won) w++;
  return w / k;
}
function build(rng) {
  const plat = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const lo = rng.int(0, r + 1), hi = lo + rng.int(2, 3);
      row.push({ lo, hi, k: rng.int(0, 2 * (hi - lo) - 1) });
    }
    plat.push(row);
  }
  return { task: NAME, n: N, dt: 1, plat, cam: { az: r3(rng.pick([-1, 1]) * rng.uniform(16, 24)), el: r3(rng.uniform(46, 52)) },
    look: { stone: rng.pick(['#b9b1a3', '#a9b0b8', '#c2b39a']), shirt: rng.pick(['#e8a33a', '#d9534f', '#6a5acd']) } };
}
export function contract(m) {
  const why = [], c = careful(m);
  if (!c) why.push('no careful route'); else if (c.length > TURNS - SPARE) why.push('< 3 spare turns');
  const now = route(m, 'now', 0); if (now && run(m, now).won) why.push('no-lead plan wins');
  const still = route(m, 'still', 0); if (still && run(m, still).won) why.push('still plan wins');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

const wx = (c) => (c - 1) * 1.25, wz = (r) => r * 1.3;
function camOf(m) { return makeCam({ az: m.cam.az, el: m.cam.el, dist: 11.5, tgt: [0, 0.4, wz(ROWS + 1) / 2], fov: 44, W: VIEW.w, H: VIEW.h, cy: 6 }); }
function drawView(g, m, st) {
  const cam = camOf(m), t = st.t;
  const bg = g.createLinearGradient(0, 0, 0, VIEW.h); bg.addColorStop(0, '#39424d'); bg.addColorStop(0.55, '#4c5560'); bg.addColorStop(1, '#8a8f94'); g.fillStyle = bg; g.fillRect(0, 0, VIEW.w, VIEW.h);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; for (let x = 0; x < VIEW.w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, VIEW.h * 0.55); g.stroke(); }
  const items = [];
  for (let r = 0; r <= ROWS + 1; r++) for (let c = 0; c < COLS; c++) if (onBoard(c, r)) items.push({ c, r });
  items.sort((a, b) => Math.hypot(wx(b.c) - cam.eye[0], wz(b.r) - cam.eye[2]) - Math.hypot(wx(a.c) - cam.eye[0], wz(a.r) - cam.eye[2]));
  for (let r = ROWS + 1; r >= 0; r--) pole(g, cam, r);
  for (const it of items) {
    const X = wx(it.c), Z = wz(it.r), h = height(m, it.c, it.r, t), ledge = it.r === 0 || it.r === ROWS + 1;
    const half = ledge ? 0.55 : 0.48;
    box(g, cam, { x0: X - half, x1: X + half, y0: -2.5, y1: h, z0: Z - 0.5, z1: Z + 0.5 }, ledge ? '#bdb8ad' : '#3d5a80', { top: 1.2, front: 0.9, side: 0.7 });
    if (!ledge) hazardTop(g, cam, X, Z, half, h);
    grooves(g, cam, X, Z, half, h);
    if (!st.dead && !st.won && Math.abs(it.c - st.c) + Math.abs(it.r - st.r) === 1) footRing(g, cam, X, Z, half, height(m, st.c, st.r, t), h);
    if (it.r === ROWS + 1) exitSign(g, cam, X, h, Z);
    if (!st.dead && st.c === it.c && st.r === it.r) person(g, cam, m, X, h, Z);
  }
  if (st.dead) { const X = wx(st.c), Z = wz(st.r); person(g, cam, m, X, height(m, st.c, st.r, t) - 1.4, Z); }
  if (st.dead || st.won) {
    const msg = st.won ? 'Reached the top dock' : st.dead === 'bump' ? 'Too high to climb' : st.dead === 'fell' ? 'Dropped too far' : 'Stepped off the edge';
    g.font = `700 18px ${UI_FONT}`; const w = g.measureText(msg).width + 34;
    rr(g, (VIEW.w - w) / 2, 12, w, 34, 10); g.fillStyle = st.won ? 'rgba(46,125,50,0.92)' : 'rgba(198,40,40,0.92)'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, VIEW.w / 2, 29);
  }
}
function footRing(g, cam, X, Z, half, y, top) {
  const C = [[X - half, Z - 0.5], [X + half, Z - 0.5], [X + half, Z + 0.5], [X - half, Z + 0.5]];
  const line = (a, b) => { const p = cam.project(a[0], y, a[1]), q = cam.project(b[0], y, b[1]); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#ffd600'; g.lineWidth = 2.2; g.stroke(); };
  g.save();
  if (y < top - 0.01) {
    const N = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if ((cam.eye[0] - mx) * N[i][0] + (cam.eye[2] - mz) * N[i][1] > 0) line(a, b); }
  } else {
    g.setLineDash([5, 4]); for (let i = 0; i < 4; i++) line(C[i], C[(i + 1) % 4]);
  }
  g.restore();
}
function grooves(g, cam, X, Z, half, h) {
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.1;
  const sides = [[[X - half, Z - 0.5], [X + half, Z - 0.5], [0, -1]], [[X + half, Z - 0.5], [X + half, Z + 0.5], [1, 0]], [[X + half, Z + 0.5], [X - half, Z + 0.5], [0, 1]], [[X - half, Z + 0.5], [X - half, Z - 0.5], [-1, 0]]];
  for (let y = -1.5; y < h - 0.01; y += LV) for (const [a, b, n] of sides) {
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if ((cam.eye[0] - mx) * n[0] + (cam.eye[2] - mz) * n[1] <= 0) continue;
    const p = cam.project(a[0], y, a[1]), q = cam.project(b[0], y, b[1]); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  }
}
function pole(g, cam, r) {
  const X = wx(-0.75), Z = wz(r);
  for (let y = -1; y < 3; y += 0.5) box(g, cam, { x0: X - 0.05, x1: X + 0.05, y0: y, y1: y + 0.5, z0: Z - 0.05, z1: Z + 0.05 }, (y * 2) % 2 === 0 ? '#f2c230' : '#1f1f1f');
}
function hazardTop(g, cam, X, Z, half, y) {
  const P = (u, v) => cam.project(X + u, y + 0.002, Z + v);
  poly(g, [P(-half, -0.5), P(half, -0.5), P(half, 0.5), P(-half, 0.5)], '#f2c230', 'rgba(0,0,0,0.5)', 1);
  const k = 0.12;
  for (let i = -4; i < 4; i++) { const a = i * 0.25; poly(g, [P(Math.max(-half, a), -0.5), P(Math.min(half, a + 0.12), -0.5), P(Math.min(half, a + 0.12), -0.5 + k), P(Math.max(-half, a), -0.5 + k)], '#1f1f1f'); }
  for (let i = -4; i < 4; i++) { const a = i * 0.25; poly(g, [P(Math.max(-half, a), 0.5 - k), P(Math.min(half, a + 0.12), 0.5 - k), P(Math.min(half, a + 0.12), 0.5), P(Math.max(-half, a), 0.5)], '#1f1f1f'); }
}
function exitSign(g, cam, X, y, Z) {
  box(g, cam, { x0: X - 0.03, x1: X + 0.03, y0: y, y1: y + 0.75, z0: Z + 0.2, z1: Z + 0.26 }, '#555');
  const P = (u, v) => cam.project(X + u, y + v, Z + 0.2);
  poly(g, [P(-0.4, 0.75), P(0.4, 0.75), P(0.4, 1.1), P(-0.4, 1.1)], '#1e9e4a', '#0d5c2a', 1.5);
  const c = cam.project(X, y + 0.925, Z + 0.2); g.fillStyle = '#fff'; g.font = `700 ${Math.max(9, 0.22 * c.s)}px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', c.x, c.y);
}
function flag(g, cam, X, y, Z) {
  box(g, cam, { x0: X + 0.25, x1: X + 0.29, y0: y, y1: y + 0.9, z0: Z - 0.02, z1: Z + 0.02 }, '#444');
  poly(g, [cam.project(X + 0.29, y + 0.9, Z), cam.project(X + 0.7, y + 0.78, Z), cam.project(X + 0.29, y + 0.64, Z)], '#e53935', '#9a1f1c', 1);
}
function person(g, cam, m, X, y, Z) {
  box(g, cam, { x0: X - 0.08, x1: X + 0.08, y0: y, y1: y + 0.3, z0: Z - 0.06, z1: Z + 0.06 }, '#2f3e57');
  box(g, cam, { x0: X - 0.13, x1: X + 0.13, y0: y + 0.3, y1: y + 0.6, z0: Z - 0.09, z1: Z + 0.09 }, m.look.shirt);
  sphere(g, cam, X, y + 0.72, Z, 0.11, '#f1c27d');
}
const DEFS = [['back', 'Back'], ['left', 'Left'], ['wait', 'Wait'], ['right', 'Right'], ['fwd', 'Forward']];
const buttons = () => { const gap = 8, w = (BOARD.w - 6 * gap) / 5; return DEFS.map(([id, label], i) => ({ id, label, x: gap + i * (w + gap), y: BTN.y, w, h: BTN.h })); };

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) {
  const hits = [], now = route(m, 'now', 0), still = route(m, 'still', 0);
  if (now && run(m, now).won) hits.push('step when heights match now'); if (still && run(m, still).won) hits.push('still plan from frame 1');
  return { singleFrame: hits.length > 0, hits };
}
const gameOver = (st, m) => st.dead || st.won || st.turn >= TURNS;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'move', a: 'fwd | back | left | right | wait', note: 'one turn = one frame' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const k0 = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 6000; a++) { const kk = mix32(k0, a), m = build(R(mulberry32(kk))); m.key = kk; if (!contract(m).ok) continue; m.plan = careful(m); m.board = { ...BOARD }; return m; }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames() { return { n: N, period: N }; },
  init() { return { ...clockState(), ...start(), turn: 0 }; },
  applyAction(st, a, m) {
    const act = a?.op === 'wait' ? 'wait' : a?.op === 'move' ? a.a : null;
    if (!act || !MOVES[act]) return { ok: false, reason: 'bad-op' };
    if (st.dead || st.won || st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const n = step(m, st, act); Object.assign(st, { c: n.c, r: n.r, dead: n.dead || null, won: n.won }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st) { const ok = !!st.won; return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : st.r / (ROWS + 1), detail: { won: st.won, dead: st.dead, at: [st.c, st.r], turns: st.turn } }; },
  oracle(m) { return m.plan.map((a) => ({ op: 'move', a })); },
  randomPolicy(m, rnd) { const A = Object.keys(MOVES); return Array.from({ length: TURNS }, () => ({ op: 'move', a: A[Math.floor(rnd() * A.length)] })); },
  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },
  drawBoard(g, br, env) {
    const st = env.state, over = env.submitted || gameOver(env.state, env.manifest);
    g.save(); g.translate(br.x, br.y); g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip(); drawView(g, env.manifest, st); g.restore();
    for (const b of buttons()) {
      rr(g, b.x, b.y, b.w, b.h, 10); g.fillStyle = over ? '#f1f3f5' : b.id === 'fwd' ? '#e3f1e6' : '#e6eef7'; g.fill();
      g.strokeStyle = over ? '#d9dee3' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
      g.fillStyle = over ? '#aab3bb' : '#2d4a68'; g.font = `700 15px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    const st = env.state; if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const b = buttons().find((q) => evt.x >= q.x && evt.x <= q.x + q.w && evt.y >= q.y && evt.y <= q.y + q.h);
    return b ? [{ op: 'move', a: b.id }] : [];
  },
  footerStatus(env) { const st = env?.state; if (!st) return ''; return st.won ? 'On the top dock' : st.dead ? 'Fell' : `Turn ${st.turn + 1} of ${TURNS}`; },
  gate, frameAudit, contract,
};
export default task;
