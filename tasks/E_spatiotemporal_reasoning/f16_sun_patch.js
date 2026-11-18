import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, makeCam, poly, shade, sphere, box } from '../common/_f16_scene_kit.js';

const NAME = 'f16_sun_patch';
const PROMPT = 'Give each of the 3 plants 3 sunny frames in a row';
const SUB = 'Tap a free tile to set down a plant (or Wait) · the sun patch slides across the floor · the table shades the tiles under it';
const VIEW = { w: 640, h: 400 };
const BTN = { y: VIEW.h + 8, h: 44 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const C = 7, RW = 6, TS = 0.8, TURNS = 15, N = TURNS + 1, PLANTS = 3, NEED = 3, PW = 3, PH = 3;
const key = (c, r) => `${c},${r}`;

function litSet(m, t) {
  const c0 = m.c0 + m.dc * t, r0 = m.r0 + m.dr * Math.floor(t / 2), s = new Set();
  for (let c = c0; c < c0 + PW; c++) for (let r = r0; r < r0 + PH; r++) if (c >= 0 && c < C && r >= 0 && r < RW && !m.table.has(key(c, r))) s.add(key(c, r));
  return s;
}
function step(m, s, act) {
  if (s.won) return s;
  const o = { ...s, t: s.t + 1, plants: s.plants.map((p) => ({ ...p })) };
  if (act !== 'wait' && o.plants.length < PLANTS) o.plants.push({ c: act[0], r: act[1], run: 0, best: 0 });
  const L = litSet(m, o.t);
  for (const p of o.plants) { if (L.has(key(p.c, p.r))) p.run++; else p.run = 0; p.best = Math.max(p.best, p.run); }
  if (o.plants.length === PLANTS && o.plants.every((p) => p.best >= NEED)) o.won = true;
  return o;
}
const free = (m, s, c, r) => c >= 0 && c < C && r >= 0 && r < RW && !m.table.has(key(c, r)) && !s.plants.some((p) => p.c === c && p.r === r);
const start = () => ({ t: 0, plants: [], won: false });
function run(m, acts) { let s = start(); for (const a of acts) { if (s.won || s.t >= TURNS) break; s = step(m, s, a); } return s; }
const goodTile = (m, s) => { for (let r = 0; r < RW; r++) for (let c = 0; c < C; c++) { if (!free(m, s, c, r)) continue; let ok = true; for (let k = 1; k <= NEED; k++) if (!litSet(m, s.t + k).has(key(c, r))) ok = false; if (ok) return [c, r]; } return null; };
function careful(m) {
  const acts = ['wait']; let s = step(m, start(), 'wait');
  while (!s.won && s.t < TURNS) { const g = s.plants.length < PLANTS ? goodTile(m, s) : null; const a = g || 'wait'; acts.push(a); s = step(m, s, a); }
  return s.won ? acts : null;
}
function centre(m) {
  const acts = []; let s = start();
  while (!s.won && s.t < TURNS) {
    let a = 'wait';
    if (s.plants.length < PLANTS) { const L = [...litSet(m, s.t)].map((k) => k.split(',').map(Number)); if (L.length) { const cx = L.reduce((u, v) => u + v[0], 0) / L.length, cz = L.reduce((u, v) => u + v[1], 0) / L.length; const best = L.filter(([c, r]) => free(m, s, c, r)).sort((p, q) => Math.hypot(p[0] - cx, p[1] - cz) - Math.hypot(q[0] - cx, q[1] - cz))[0]; if (best) a = best; } }
    acts.push(a); s = step(m, s, a);
  }
  return acts;
}
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 29)); let w = 0;
  for (let i = 0; i < k; i++) { const acts = Array.from({ length: TURNS }, () => (rnd() < 0.5 ? 'wait' : [Math.floor(rnd() * C), Math.floor(rnd() * RW)])); let s = start(); for (const a of acts) { if (s.won) break; s = step(m, s, a !== 'wait' && !free(m, s, a[0], a[1]) ? 'wait' : a); } if (s.won) w++; }
  return w / k;
}
function build(rng) {
  const dc = rng.pick([-1, 1]), dr = rng.pick([-1, 0, 1]), c0 = dc > 0 ? -2 : C - 1, r0 = rng.int(dr > 0 ? 0 : 1, dr < 0 ? 3 : 2);
  const table = new Set(), tc = rng.int(2, 4), tr = rng.int(1, 3);
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) table.add(key(tc + a, tr + b));
  return { task: NAME, n: N, dt: 1, dc, dr, c0, r0, table, look: { floor: rng.pick(['#d8c3a5', '#cdb894', '#e0cfb1']), wall: rng.pick(['#f1ebe0', '#e8eef0']) } };
}
export function contract(m) {
  const why = [];
  if (!careful(m)) why.push('no careful play');
  if (run(m, centre(m)).won) why.push('centre play wins');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

const tx = (c) => (c - (C - 1) / 2) * TS, tz = (r) => (r - (RW - 1) / 2) * TS;
function camOf() { return makeCam({ az: 18, el: 46, dist: 8.4, tgt: [0, 0, 0.2], fov: 46, W: VIEW.w, H: VIEW.h, cy: 4 }); }
function drawView(g, m, st) {
  const cam = camOf(), P = (x, y, z) => cam.project(x, y, z), L = litSet(m, st.t), hx = C * TS / 2, hz = RW * TS / 2;
  g.fillStyle = '#3a3f47'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  poly(g, [P(-hx, 0, hz), P(hx, 0, hz), P(hx, 2.4, hz), P(-hx, 2.4, hz)], m.look.wall);
  const wxs = m.dc > 0 ? -hx : hx;
  poly(g, [P(wxs, 0, -hz), P(wxs, 0, hz), P(wxs, 2.4, hz), P(wxs, 2.4, -hz)], shade(m.look.wall, 0.88));
  poly(g, [P(wxs, 1.0, -0.6), P(wxs, 1.0, 0.6), P(wxs, 2.0, 0.6), P(wxs, 2.0, -0.6)], '#bfe3f7', '#5d6b78', 2);
  for (let r = 0; r < RW; r++) for (let c = 0; c < C; c++) {
    const X = tx(c), Z = tz(r), q = TS / 2 - 0.02, k = key(c, r);
    poly(g, [P(X - q, 0, Z - q), P(X + q, 0, Z - q), P(X + q, 0, Z + q), P(X - q, 0, Z + q)], L.has(k) ? '#ffe082' : m.table.has(k) ? shade(m.look.floor, 0.7) : m.look.floor, 'rgba(0,0,0,0.12)', 1);
  }
  const T = [...m.table].map((k) => k.split(',').map(Number)), x0 = Math.min(...T.map((v) => tx(v[0]))) - TS / 2, x1 = Math.max(...T.map((v) => tx(v[0]))) + TS / 2, z0 = Math.min(...T.map((v) => tz(v[1]))) - TS / 2, z1 = Math.max(...T.map((v) => tz(v[1]))) + TS / 2;
  for (const [a, b] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) box(g, cam, { x0: a - 0.04, x1: a + 0.04, y0: 0, y1: 0.72, z0: b - 0.04, z1: b + 0.04 }, '#6d4c41');
  box(g, cam, { x0, x1, y0: 0.72, y1: 0.8, z0, z1 }, '#8d6e63');
  for (const p of [...st.plants].sort((a, b) => tz(b.r) - tz(a.r))) {
    const X = tx(p.c), Z = tz(p.r);
    box(g, cam, { x0: X - 0.14, x1: X + 0.14, y0: 0, y1: 0.24, z0: Z - 0.14, z1: Z + 0.14 }, '#bf6a3d');
    sphere(g, cam, X, 0.42, Z, 0.2, p.best >= NEED ? '#43a047' : '#7cb342');
    const q = P(X, 0.8, Z); g.font = `700 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = p.best >= NEED ? '#1b5e20' : '#fff'; g.fillText(p.best >= NEED ? '✓' : String(p.run), q.x, q.y);
  }
  g.font = `700 14px ${UI_FONT}`; const msg = `Plants left ${PLANTS - st.plants.length}`, w = g.measureText(msg).width + 20;
  rr(g, 10, 10, w, 26, 8); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(); g.fillStyle = '#2d3a46'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(msg, 20, 23);
  if (st.won) { const s2 = 'Every plant got 3 sunny frames'; g.font = `700 17px ${UI_FONT}`; const w2 = g.measureText(s2).width + 34; rr(g, (VIEW.w - w2) / 2, 44, w2, 32, 10); g.fillStyle = 'rgba(46,125,50,0.92)'; g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(s2, VIEW.w / 2, 60); }
}
function tileAt(px, py) {
  const cam = camOf(); let best = null, bd = 26;
  for (let r = 0; r < RW; r++) for (let c = 0; c < C; c++) { const q = cam.project(tx(c), 0, tz(r)), d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = [c, r]; } }
  return best;
}
const WAIT = { x: VIEW.w / 2 - 110, y: BTN.y, w: 220, h: BTN.h };

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) { const hit = run(m, centre(m)).won; return { singleFrame: hit, hits: hit ? ['centre of the current patch'] : [] }; }
const gameOver = (st, m) => st.won || st.turn >= TURNS;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'plant', c: '0..6', r: '0..5' }, { op: 'wait' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const k0 = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 8000; a++) { const kk = mix32(k0, a), m = build(R(mulberry32(kk))); m.key = kk; if (!contract(m).ok) continue; m.plan = careful(m); m.board = { ...BOARD }; return m; }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames() { return { n: N, period: N }; },
  init() { return { ...clockState(), ...start(), turn: 0 }; },
  applyAction(st, a, m) {
    let act = null;
    if (a?.op === 'wait') act = 'wait';
    else if (a?.op === 'plant' && Number.isInteger(a.c) && Number.isInteger(a.r)) { if (!free(m, st, a.c, a.r) || st.plants.length >= PLANTS) return { ok: false, reason: 'not-free' }; act = [a.c, a.r]; }
    if (act === null) return { ok: false, reason: 'bad-op' };
    if (st.won || st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const n = step(m, st, act); Object.assign(st, { plants: n.plants, won: n.won }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st) { const ok = !!st.won; return { success: ok, error: ok ? 0 : 1, partial: st.plants.filter((p) => p.best >= NEED).length / PLANTS, detail: { won: st.won, plants: st.plants, turns: st.turn } }; },
  oracle(m) { return m.plan.map((a) => (a === 'wait' ? { op: 'wait' } : { op: 'plant', c: a[0], r: a[1] })); },
  randomPolicy(m, rnd) { return Array.from({ length: TURNS }, () => (rnd() < 0.5 ? { op: 'wait' } : { op: 'plant', c: Math.floor(rnd() * C), r: Math.floor(rnd() * RW) })); },
  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },
  drawBoard(g, br, env) {
    const st = env.state, over = env.submitted || gameOver(env.state, env.manifest);
    g.save(); g.translate(br.x, br.y); g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip(); drawView(g, env.manifest, st); g.restore();
    rr(g, WAIT.x, WAIT.y, WAIT.w, WAIT.h, 12); g.fillStyle = over ? '#f1f3f5' : '#e6eef7'; g.fill(); g.strokeStyle = over ? '#d9dee3' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
    g.fillStyle = over ? '#aab3bb' : '#2d4a68'; g.font = `700 17px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Wait', WAIT.x + WAIT.w / 2, WAIT.y + WAIT.h / 2 + 1);
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    const st = env.state; if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    if (evt.x >= WAIT.x && evt.x <= WAIT.x + WAIT.w && evt.y >= WAIT.y && evt.y <= WAIT.y + WAIT.h) return [{ op: 'wait' }];
    if (evt.y > VIEW.h) return [];
    const c = tileAt(evt.x, evt.y); return c ? [{ op: 'plant', c: c[0], r: c[1] }] : [];
  },
  footerStatus(env) { const st = env?.state; if (!st) return ''; return st.won ? 'Done' : `Turn ${st.turn + 1} of ${TURNS}`; },
  gate, frameAudit, contract,
};
export default task;
export const _dbg = { build, contract };
