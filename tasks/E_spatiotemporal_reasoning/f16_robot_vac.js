import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, makeCam, poly, shade, sphere, box, circlePts, hull } from '../common/_f16_scene_kit.js';

const NAME = 'f16_robot_vac';
const PROMPT = "Don't let the robot vacuum swallow any toy";
const SUB = 'The robot drives diagonally one tile per frame, bounces off the walls and can pass under the sofa · tap a toy to put it in the basket (room for 4) or Wait';
const VIEW = { w: 640, h: 400 };
const BTN = { y: VIEW.h + 8, h: 44 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const C = 8, RW = 6, TS = 0.7, TURNS = 15, N = TURNS + 1, BASKET = 4, TOYS = 10, HIT = 4;
const key = (c, r) => `${c},${r}`;
const hexK = (h, k) => '#' + shade(h, k).match(/\d+/g).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
const TOY_LOOK = [['ball', '#e53935'], ['block', '#1e88e5'], ['ball', '#fdd835'], ['block', '#8e24aa'], ['ball', '#43a047'], ['block', '#fb8c00'], ['ball', '#00acc1'], ['block', '#6d4c41'], ['ball', '#f06292'], ['block', '#c0ca33']];

function path(c, r, dc, dr, flipBoth = false) {
  const P = [[c, r]];
  for (let t = 1; t <= TURNS; t++) {
    let hitC = c + dc < 0 || c + dc >= C, hitR = r + dr < 0 || r + dr >= RW;
    if (flipBoth && (hitC || hitR)) hitC = hitR = true;
    if (hitC) dc = -dc; if (hitR) dr = -dr;
    c += dc; r += dr; P.push([c, r]);
  }
  return P;
}
const posAt = (m, t) => m.path[Math.max(0, Math.min(m.path.length - 1, Math.round(t)))];
const underSofa = (m, c, r) => r === RW - 1 && c >= m.sofa && c < m.sofa + 3;
function step(m, s, pick) {
  const o = { ...s, t: s.t + 1, toys: s.toys.slice(), basket: s.basket.slice(), eaten: s.eaten.slice() };
  if (pick !== 'wait' && o.basket.length < BASKET && o.toys.includes(pick)) { o.toys = o.toys.filter((i) => i !== pick); o.basket.push(pick); }
  const [c, r] = posAt(m, o.t);
  for (const i of o.toys.slice()) if (m.toys[i][0] === c && m.toys[i][1] === r) { o.toys = o.toys.filter((j) => j !== i); o.eaten.push(i); }
  return o;
}
const start = (m) => ({ t: 0, toys: m.toys.map((_, i) => i), basket: [], eaten: [] });
function run(m, acts) { let s = start(m); for (let k = 0; k < TURNS; k++) s = step(m, s, acts[k] ?? 'wait'); return s; }
const wins = (m, acts) => run(m, acts).eaten.length === 0;
function reached(m, P) { const out = []; for (let t = 1; t <= TURNS; t++) m.toys.forEach(([c, r], i) => { if (P[t][0] === c && P[t][1] === r && !out.includes(i)) out.push(i); }); return out; }
const careful = (m) => ['wait', ...reached(m, m.path)];
function guessCentre(m) {
  const [c, r] = m.path[0]; return reached(m, path(c, r, c < C / 2 ? 1 : -1, r < RW / 2 ? 1 : -1)).slice(0, BASKET);
}
function nearest(m) { const [c, r] = m.path[0]; return m.toys.map((p, i) => [Math.max(Math.abs(p[0] - c), Math.abs(p[1] - r)), i]).sort((a, b) => a[0] - b[0]).slice(0, BASKET).map((v) => v[1]); }
function straight(m) {
  const [c0, r0] = m.path[0], [c1, r1] = m.path[1], dc = c1 - c0, dr = r1 - r0, out = [];
  for (let k = 2; k <= 2 * C; k++) { const c = c0 + dc * k, r = r0 + dr * k; const i = m.toys.findIndex((p) => p[0] === c && p[1] === r); if (i >= 0) out.push(i); }
  return ['wait', ...out.slice(0, BASKET)];
}
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 31)); let w = 0;
  for (let i = 0; i < k; i++) if (wins(m, Array.from({ length: TURNS }, () => (rnd() < 0.5 ? 'wait' : Math.floor(rnd() * TOYS))))) w++;
  return w / k;
}
function build(rng) {
  const sofa = rng.int(1, C - 4), c = rng.int(0, C - 1), r = rng.int(0, RW - 2), dc = rng.pick([-1, 1]), dr = rng.pick([-1, 1]);
  const P = path(c, r, dc, dr), first = new Map();
  P.forEach(([a, b], t) => { if (t >= 1 && !first.has(key(a, b))) first.set(key(a, b), t); });
  const okTile = (a, b) => a >= 0 && a < C && b >= 0 && b < RW && !underSofa({ sofa }, a, b) && !(a === c && b === r);
  const bounce = P.findIndex((p, t) => t >= 1 && ((p[0] - P[t - 1][0]) * dc < 0 || (p[1] - P[t - 1][1]) * dr < 0));
  const cand = [...first].filter(([k, t]) => t >= 3 && okTile(...k.split(',').map(Number)));
  if (cand.length < HIT || bounce < 0) return null;
  const hidden = P.findIndex(([a, b], t) => t >= 1 && underSofa({ sofa }, a, b));
  const hit = rng.sample(cand, HIT);
  if (hit.filter(([, t]) => t > bounce).length < 2 || !(hidden > 0 && hit.some(([, t]) => t > hidden))) return null;
  const onPath = new Set(P.slice(1).map(([a, b]) => key(a, b))), pool = new Set();
  for (const [ec, er] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (ec !== dc || er !== dr) path(c, r, ec, er).slice(1, 9).forEach(([a, b]) => pool.add(key(a, b)));
  path(c, r, dc, dr, true).slice(1).forEach(([a, b]) => pool.add(key(a, b)));
  P.slice(2).forEach(([a, b]) => { for (const [x, y] of [[a + 2, b], [a - 2, b], [a, b + 2], [a, b - 2]]) pool.add(key(x, y)); });
  const dec = [...pool].filter((k) => !onPath.has(k) && okTile(...k.split(',').map(Number)));
  if (dec.length < TOYS - HIT) return null;
  const toys = rng.shuffle([...hit.map(([k]) => k), ...rng.sample(dec, TOYS - HIT)]).map((k) => k.split(',').map(Number));
  return { task: NAME, n: N, dt: 1, path: P, sofa, toys, look: { floor: rng.pick(['#b98b5e', '#c49a6c', '#a87b52']), sofa: rng.pick(['#5c6bc0', '#607d8b', '#8d6e63']) } };
}
export function contract(m) {
  const why = [], hid = m.path.slice(2, 13).some(([c, r]) => underSofa(m, c, r));
  if (!wins(m, careful(m))) why.push('no careful play');
  if (!hid) why.push('never hidden under the sofa');
  if (wins(m, guessCentre(m))) why.push('first-frame guess wins');
  if (wins(m, nearest(m))) why.push('nearest toys win');
  if (wins(m, straight(m))) why.push('straight line wins');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

const tx = (c) => (c - (C - 1) / 2) * TS, tz = (r) => (r - (RW - 1) / 2) * TS;
function camOf() { return makeCam({ az: -32, el: 52, dist: 7.8, tgt: [-0.2, 0, -0.3], fov: 46, W: VIEW.w, H: VIEW.h, cy: 6 }); }
function drawRobot(g, cam, c, r) {
  const X = tx(c), Z = tz(r), rad = 0.26, lo = circlePts(cam, X, 0.02, Z, rad), hi = circlePts(cam, X, 0.13, Z, rad);
  g.beginPath(); hull([...lo, ...hi]).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = '#263238'; g.fill();
  poly(g, hi, '#cfd8dc', '#263238', 1.5);
  poly(g, circlePts(cam, X, 0.131, Z, 0.09), '#455a64');
}
function drawToy(g, cam, i, c, r) {
  const [kind, col] = TOY_LOOK[i], X = tx(c), Z = tz(r);
  if (kind === 'ball') sphere(g, cam, X, 0.13, Z, 0.13, col);
  else box(g, cam, { x0: X - 0.12, x1: X + 0.12, y0: 0, y1: 0.22, z0: Z - 0.12, z1: Z + 0.12 }, col);
}
function drawSofa(g, cam, m) {
  const x0 = tx(m.sofa) - TS / 2, x1 = tx(m.sofa + 2) + TS / 2, z1 = tz(RW - 1) + TS / 2, z0 = z1 - TS, col = m.look.sofa;
  box(g, cam, { x0, x1, y0: 0.16, y1: 0.42, z0, z1 }, col);
  box(g, cam, { x0, x1, y0: 0.16, y1: 0.95, z0: z1 - 0.2, z1 }, hexK(col, 0.85));
  for (const xa of [x0, x1 - 0.16]) box(g, cam, { x0: xa, x1: xa + 0.16, y0: 0.16, y1: 0.62, z0, z1 }, hexK(col, 0.9));
  for (const [a, b] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05]]) box(g, cam, { x0: a - 0.03, x1: a + 0.03, y0: 0, y1: 0.16, z0: b - 0.03, z1: b + 0.03 }, '#3e2723');
}
function drawView(g, m, st) {
  const cam = camOf(), P = (x, y, z) => cam.project(x, y, z), hx = C * TS / 2, hz = RW * TS / 2, H = 2.2;
  g.fillStyle = '#2f3437'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  poly(g, [P(-hx, 0, hz), P(hx, 0, hz), P(hx, H, hz), P(-hx, H, hz)], '#e9e4d8');
  poly(g, [P(hx, 0, -hz), P(hx, 0, hz), P(hx, H, hz), P(hx, H, -hz)], '#d9d3c5');
  poly(g, [P(hx, 0.9, -0.9), P(hx, 0.9, 0.3), P(hx, 1.8, 0.3), P(hx, 1.8, -0.9)], '#9fb8c8', '#6d5c4b', 3);
  for (let r = 0; r < RW; r++) for (let c = 0; c < C; c++) {
    const X = tx(c), Z = tz(r), q = TS / 2;
    poly(g, [P(X - q, 0, Z - q), P(X + q, 0, Z - q), P(X + q, 0, Z + q), P(X - q, 0, Z + q)], (c + r) % 2 ? m.look.floor : shade(m.look.floor, 0.9), 'rgba(60,35,15,0.35)', 1);
  }
  const [rc, rrw] = posAt(m, st.t), items = st.toys.map((i) => ({ i, c: m.toys[i][0], r: m.toys[i][1] }));
  items.push({ robot: true, c: rc, r: rrw });
  const depth = (o) => -P(tx(o.c), 0, tz(o.r)).z;
  const back = items.filter((o) => o.r === RW - 1).sort((a, b) => depth(a) - depth(b)), front = items.filter((o) => o.r < RW - 1).sort((a, b) => depth(a) - depth(b));
  const put = (o) => (o.robot ? drawRobot(g, cam, o.c, o.r) : drawToy(g, cam, o.i, o.c, o.r));
  back.forEach(put); drawSofa(g, cam, m); front.forEach(put);
  for (const i of st.eaten) { const q = P(tx(m.toys[i][0]), 0.05, tz(m.toys[i][1])); g.strokeStyle = '#d32f2f'; g.lineWidth = 4; g.beginPath(); g.moveTo(q.x - 9, q.y - 9); g.lineTo(q.x + 9, q.y + 9); g.moveTo(q.x + 9, q.y - 9); g.lineTo(q.x - 9, q.y + 9); g.stroke(); }
  g.font = `700 14px ${UI_FONT}`; const msg = `Basket ${st.basket.length} / ${BASKET}`, w = g.measureText(msg).width + 20;
  rr(g, 10, 10, w, 26, 8); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill(); g.fillStyle = '#2d3a46'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(msg, 20, 23);
  if (st.eaten.length) { const s2 = 'The robot swallowed a toy'; g.font = `700 17px ${UI_FONT}`; const w2 = g.measureText(s2).width + 34; rr(g, (VIEW.w - w2) / 2, 44, w2, 32, 10); g.fillStyle = 'rgba(198,40,40,0.92)'; g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(s2, VIEW.w / 2, 60); }
}
function toyAt(m, st, px, py) {
  const cam = camOf(); let best = null, bd = 28;
  for (const i of st.toys) { const q = cam.project(tx(m.toys[i][0]), 0.12, tz(m.toys[i][1])), d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = i; } }
  return best;
}
const WAIT = { x: VIEW.w / 2 - 110, y: BTN.y, w: 220, h: BTN.h };

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) { const hit = wins(m, nearest(m)) || wins(m, guessCentre(m)); return { singleFrame: hit, hits: hit ? ['first-frame reading'] : [] }; }
const gameOver = (st, m) => st.turn >= TURNS || st.basket.length >= BASKET || st.eaten.length > 0;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'pick', toy: '0..6' }, { op: 'wait' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const k0 = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 20000; a++) { const kk = mix32(k0, a), m = build(R(mulberry32(kk))); if (!m) continue; m.key = kk; if (!contract(m).ok) continue; m.plan = careful(m); m.board = { ...BOARD }; return m; }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames() { return { n: N, period: N }; },
  init(m) { return { ...clockState(), ...start(m), turn: 0 }; },
  applyAction(st, a, m) {
    let act = null;
    if (a?.op === 'wait') act = 'wait';
    else if (a?.op === 'pick' && Number.isInteger(a.toy)) { if (!st.toys.includes(a.toy) || st.basket.length >= BASKET) return { ok: false, reason: 'not-pickable' }; act = a.toy; }
    if (act === null) return { ok: false, reason: 'bad-op' };
    if (st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const n = step(m, st, act); Object.assign(st, { toys: n.toys, basket: n.basket, eaten: n.eaten }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st, m) {
    let s = { t: st.turn, toys: st.toys.slice(), basket: st.basket.slice(), eaten: st.eaten.slice() };
    while (s.t < TURNS) s = step(m, s, 'wait');
    const ok = s.eaten.length === 0;
    return { success: ok, error: ok ? 0 : 1, partial: 1 - s.eaten.length / TOYS, detail: { eaten: s.eaten, basket: st.basket, turns: st.turn } };
  },
  oracle(m) { return m.plan.map((a) => (a === 'wait' ? { op: 'wait' } : { op: 'pick', toy: a })); },
  randomPolicy(m, rnd) { return Array.from({ length: TURNS }, () => (rnd() < 0.5 ? { op: 'wait' } : { op: 'pick', toy: Math.floor(rnd() * TOYS) })); },
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
    if (evt.y > VIEW.h || st.basket.length >= BASKET) return [];
    const i = toyAt(env.manifest, st, evt.x, evt.y); return i === null ? [] : [{ op: 'pick', toy: i }];
  },
  footerStatus(env) { const st = env?.state; if (!st) return ''; return `Turn ${Math.min(st.turn + 1, TURNS)} of ${TURNS}`; },
  gate, frameAudit, contract,
};
export default task;
export const _dbg = { build, contract };
