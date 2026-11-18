import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, makeCam, poly, shade, sphere, box, hull, insideMargin } from '../common/_f16_scene_kit.js';

const NAME = 'f16_bridges';
const PROMPT = 'Reach the flag';
const SUB = 'Tap a pillar next to you, or across a turning plank, or Wait · each choice moves the clip one frame';
const VIEW = { w: 640, h: 400 };
const BTN = { y: VIEW.h + 8, h: 48 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const GW = 5, GD = 7, LV = 0.55, TURNS = 15, N = TURNS + 1, SPARE = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, z) => `${x},${z}`;

const angle = (p, t) => ((p.a0 + p.w * t) % 180 + 180) % 180;
const along = (p, t, axis) => angle(p, t) === (axis === 'x' ? 0 : 90);
const pillar = (m, x, z) => m.cells[key(x, z)];
const stairKey = (a, b) => [a, b].sort().join('|');
function moves(m, c) {
  const out = [], hc = pillar(m, c[0], c[1]).h;
  for (const [dx, dz] of DIRS) {
    const n = [c[0] + dx, c[1] + dz], p = pillar(m, ...n);
    if (p) {
      const kind = p.h === hc ? 'step' : Math.abs(p.h - hc) === 1 && m.stairs.has(stairKey(key(...c), key(...n))) ? 'stair' : 'climb';
      out.push({ to: n, kind });
    } else {
      const pl = m.planks.find((q) => q.x === n[0] && q.z === n[1]), f = [c[0] + 2 * dx, c[1] + 2 * dz], pf = pillar(m, ...f);
      if (pl && pf && pl.h === hc && pf.h === hc) out.push({ to: f, kind: 'cross', plank: pl, axis: dx ? 'x' : 'z' });
    }
  }
  return out;
}
function step(m, s, act, rule = 'lead') {
  if (s.dead || s.won) return s;
  const o = { ...s, t: s.t + 1, bump: false };
  if (act !== 'wait') {
    const mv = moves(m, s.at).find((q) => q.to[0] === act[0] && q.to[1] === act[1]);
    if (!mv || mv.kind === 'climb') o.bump = true;
    else if (mv.kind === 'cross') {
      const tt = rule === 'now' ? s.t : rule === 'still' ? 0 : s.t + 1;
      if (along(mv.plank, tt, mv.axis)) o.at = mv.to; else { o.dead = 'fell'; o.at = [(s.at[0] + mv.to[0]) / 2, (s.at[1] + mv.to[1]) / 2]; }
    } else o.at = mv.to;
  }
  if (!o.dead && o.at[0] === m.goal[0] && o.at[1] === m.goal[1]) o.won = true;
  return o;
}
const start = (m) => ({ at: m.start.slice(), t: 0, dead: null, won: false, bump: false });
function run(m, acts, rule) { let s = start(m); for (const a of acts) { if (s.dead || s.won || s.t >= TURNS) break; s = step(m, s, a, rule); } return s; }
function route(m, rule, s0 = start(m), pre = []) {
  const seen = new Set(), q = [{ s: s0, acts: pre }];
  while (q.length) {
    const { s, acts } = q.shift();
    if (s.won) return acts;
    if (s.dead || s.t >= TURNS) continue;
    const k = `${s.t}|${s.at}`; if (seen.has(k)) continue; seen.add(k);
    const opts = ['wait', ...moves(m, s.at).filter((v) => v.kind !== 'climb').map((v) => v.to)];
    for (const a of opts) { const n = step(m, s, a, rule); if (!n.dead && !n.bump) q.push({ s: n, acts: [...acts, a] }); }
  }
  return null;
}
const carefulPlay = (m) => route(m, 'lead', step(m, start(m), 'wait'), ['wait']);
function reachableWithoutPlanks(m) {
  const seen = new Set([key(...m.start)]), q = [m.start];
  while (q.length) { const c = q.shift(); for (const v of moves(m, c)) if (v.kind === 'step' || v.kind === 'stair') { const k = key(...v.to); if (!seen.has(k)) { seen.add(k); q.push(v.to); } } }
  return seen.has(key(...m.goal));
}
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 91)); let w = 0;
  for (let i = 0; i < k; i++) {
    let s = start(m);
    for (let t = 0; t < TURNS && !s.dead && !s.won; t++) { const o = ['wait', ...moves(m, s.at).map((v) => v.to)]; s = step(m, s, o[Math.floor(rnd() * o.length)]); }
    if (s.won) w++;
  }
  return w / k;
}

function build(rng) {
  const cells = {}, stairs = new Set(), planks = [], used = new Set();
  let c = [rng.int(1, 3), 0], h = rng.int(0, 1);
  cells[key(...c)] = { h }; used.add(key(...c));
  const startC = c.slice(); let crosses = 0, nst = 0;
  for (let guard = 0; guard < 40 && c[1] < GD - 1; guard++) {
    const want = c[1] >= GD - 3 ? 'cross' : rng.pick(['walk', 'walk', 'stair', 'cross', 'cross']);
    const dirs = rng.shuffle([[0, 1], [0, 1], [1, 0], [-1, 0]]);
    let done = false;
    for (const [dx, dz] of dirs) {
      if (want === 'cross') {
        const g = [c[0] + dx, c[1] + dz], f = [c[0] + 2 * dx, c[1] + 2 * dz];
        if (f[0] < 0 || f[0] >= GW || f[1] >= GD || used.has(key(...g)) || used.has(key(...f))) continue;
        const step = 45, a0 = step * rng.int(0, 180 / step - 1);
        planks.push({ x: g[0], z: g[1], h, a0, w: step * rng.pick([-1, 1]) });
        used.add(key(...g)); used.add(key(...f)); cells[key(...f)] = { h }; c = f; crosses++; done = true; break;
      }
      const n = [c[0] + dx, c[1] + dz];
      if (n[0] < 0 || n[0] >= GW || n[1] >= GD || used.has(key(...n))) continue;
      let nh = h;
      if (want === 'stair') { nh = h + rng.pick([-1, 1]); if (nh < 0) nh = h + 1; if (nh > 3) nh = h - 1; stairs.add(stairKey(key(...c), key(...n))); nst++; }
      cells[key(...n)] = { h: nh }; used.add(key(...n)); c = n; h = nh; done = true; break;
    }
    if (!done) return null;
  }
  if (c[1] < GD - 2 || crosses < 2 || nst < 1) return null;
  const goal = c.slice();
  for (let x = 0; x < GW; x++) for (let z = 0; z < GD; z++) {
    const k = key(x, z); if (used.has(k) || rng.uniform(0, 1) < 0.55) continue;
    cells[k] = { h: rng.int(0, 3) };
  }
  const m = { task: NAME, n: N, dt: 1, cells, stairs, planks, start: startC, goal,
    cam: { az: r3(rng.pick([-1, 1]) * rng.uniform(28, 38)), el: r3(rng.uniform(48, 54)) },
    look: { stone: rng.pick(['#b9b1a3', '#a9b0b8', '#c2b39a']), plank: rng.pick(['#8a5a33', '#7d5230']), shirt: rng.pick(['#e8a33a', '#d9534f', '#6a5acd']) } };
  m.path = [...used];
  declutter(m);
  return m;
}
function declutter(m) {
  const cam = camOf(m), pathSet = new Set(m.path), eye = cam.eye;
  const targets = [];
  for (const k of m.path) {
    const [x, z] = k.split(',').map(Number), p = pillar(m, x, z), pl = m.planks.find((q) => q.x === x && q.z === z);
    const y = top(p ? p.h : pl ? pl.h : 0);
    for (const dy of [0.05, 0.4, 0.8]) for (const [u, v] of [[0, 0], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]]) targets.push([wx(x) + u, y + dy, wz(z) + v]);
  }
  for (const [k, p] of Object.entries(m.cells)) {
    if (pathSet.has(k)) continue;
    const [x, z] = k.split(',').map(Number), X = wx(x), Z = wz(z), yt = top(p.h);
    const corners = [];
    for (const yy of [-3, yt]) for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) corners.push(cam.project(X + 0.45 * u, yy, Z + 0.45 * v));
    const H = hull(corners), dMe = Math.hypot(X - eye[0], Z - eye[2]);
    const blocks = targets.some((T) => { const q = cam.project(...T); return Math.hypot(T[0] - eye[0], T[2] - eye[2]) > dMe && insideMargin(H, q.x, q.y) > -2; });
    if (blocks) delete m.cells[k];
  }
}
export function contract(m) {
  const why = [];
  const care = carefulPlay(m);
  if (!care) why.push('no careful route');
  else if (care.length > TURNS - SPARE) why.push('careful route leaves < 3 spare turns');
  else if (care.filter((a) => a !== 'wait').length < 4) why.push('route too short');
  if (reachableWithoutPlanks(m)) why.push('flag reachable on foot');
  const now = route(m, 'now'); if (now && run(m, now).won) why.push('no-lead plan wins');
  const still = route(m, 'still'); if (still && run(m, still).won) why.push('still-planks plan wins');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

const wx = (x) => (x - (GW - 1) / 2) * 1.0, wz = (z) => z * 1.0, top = (h) => h * LV;
function camOf(m) { return makeCam({ az: m.cam.az, el: m.cam.el, dist: 10.5, tgt: [0, 0.4, (GD - 1) / 2], fov: 42, W: VIEW.w, H: VIEW.h, cy: 10 }); }
function drawView(g, m, st) {
  const cam = camOf(m), t = st.t;
  const sky = g.createLinearGradient(0, 0, 0, VIEW.h); sky.addColorStop(0, '#dfe9f2'); sky.addColorStop(1, '#5d6b7a');
  g.fillStyle = sky; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const items = [];
  for (const [k, p] of Object.entries(m.cells)) { const [x, z] = k.split(',').map(Number); items.push({ kind: 'pillar', x, z, p }); }
  for (const pl of m.planks) items.push({ kind: 'plank', x: pl.x, z: pl.z, pl });
  const d = (it) => { const X = wx(it.x), Z = wz(it.z); return Math.hypot(X - cam.eye[0], Z - cam.eye[2]); };
  items.sort((a, b) => d(b) - d(a));
  for (const it of items) {
    const X = wx(it.x), Z = wz(it.z);
    if (it.kind === 'pillar') {
      const h = it.p.h;
      box(g, cam, { x0: X - 0.45, x1: X + 0.45, y0: -3, y1: top(h), z0: Z - 0.45, z1: Z + 0.45 }, m.look.stone, { top: 1.2, front: 0.88, side: 0.68 });
      levelMarks(g, cam, X, Z, h);
      pads(g, cam, m, it.x, it.z);
      stairsOn(g, cam, m, it.x, it.z);
      if (it.x === m.goal[0] && it.z === m.goal[1]) flag(g, cam, X, top(h), Z);
      if (!st.dead && st.at[0] === it.x && st.at[1] === it.z) person(g, cam, m, X, top(h), Z);
    } else plank(g, cam, m, it.pl, t);
    if (st.dead && Math.abs(st.at[0] - it.x) < 0.01 && Math.abs(st.at[1] - it.z) < 0.01) person(g, cam, m, X, top(it.pl ? it.pl.h : 0) - 0.9, Z, true);
  }
  if (st.dead || st.won || st.bump) {
    const msg = st.won ? 'Reached the flag' : st.dead ? 'Fell into the chasm' : 'Blocked: too high or too low';
    g.font = `700 18px ${UI_FONT}`; const w = g.measureText(msg).width + 34;
    rr(g, (VIEW.w - w) / 2, 12, w, 34, 10); g.fillStyle = st.won ? 'rgba(46,125,50,0.92)' : st.dead ? 'rgba(198,40,40,0.92)' : 'rgba(90,100,115,0.88)'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, VIEW.w / 2, 29);
  }
}
function levelMarks(g, cam, X, Z, h) {
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.2;
  const sides = [[[X - 0.45, Z - 0.45], [X + 0.45, Z - 0.45], [0, -1]], [[X + 0.45, Z - 0.45], [X + 0.45, Z + 0.45], [1, 0]], [[X + 0.45, Z + 0.45], [X - 0.45, Z + 0.45], [0, 1]], [[X - 0.45, Z + 0.45], [X - 0.45, Z - 0.45], [-1, 0]]];
  for (let i = 0; i < h; i++) {
    const y = top(i);
    for (const [a, b, n] of sides) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if ((cam.eye[0] - mx) * n[0] + (cam.eye[2] - mz) * n[1] <= 0) continue;
      const p = cam.project(a[0], y, a[1]), q = cam.project(b[0], y, b[1]);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
  }
}
function pads(g, cam, m, x, z) {
  const me = pillar(m, x, z), X = wx(x), Z = wz(z), y = top(me.h) + 0.004;
  for (const [dx, dz] of DIRS) {
    const pl = m.planks.find((q) => q.x === x + dx && q.z === z + dz);
    if (!pl || pl.h !== me.h) continue;
    const c = (u, v) => cam.project(X + (dx ? dx * u : v), y, Z + (dz ? dz * u : v));
    poly(g, [c(0.12, -0.24), c(0.45, -0.24), c(0.45, 0.24), c(0.12, 0.24)], 'rgba(60,40,25,0.55)', 'rgba(30,20,10,0.7)', 1);
  }
}
function stairsOn(g, cam, m, x, z) {
  const me = pillar(m, x, z);
  for (const [dx, dz] of DIRS) {
    const n = pillar(m, x + dx, z + dz);
    if (!n || n.h !== me.h + 1 || !m.stairs.has(stairKey(key(x, z), key(x + dx, z + dz)))) continue;
    const X = wx(x), Z = wz(z);
    for (let i = 0; i < 3; i++) {
      const a = 0.45 - (i + 1) * 0.15, b = 0.45 - i * 0.15, y1 = top(me.h) + (i + 1) * LV / 3;
      const bx = dx ? { x0: X + dx * Math.min(a, b), x1: X + dx * Math.max(a, b), z0: Z - 0.3, z1: Z + 0.3 } : { x0: X - 0.3, x1: X + 0.3, z0: Z + dz * Math.min(a, b), z1: Z + dz * Math.max(a, b) };
      if (bx.x0 > bx.x1) [bx.x0, bx.x1] = [bx.x1, bx.x0]; if (bx.z0 > bx.z1) [bx.z0, bx.z1] = [bx.z1, bx.z0];
      box(g, cam, { ...bx, y0: top(me.h), y1 }, '#d9cfbf', { top: 1.15, front: 0.92, side: 0.78 });
    }
  }
}
function plank(g, cam, m, pl, t) {
  const X = wx(pl.x), Z = wz(pl.z), y = top(pl.h), a = angle(pl, t) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  box(g, cam, { x0: X - 0.07, x1: X + 0.07, y0: -3, y1: y - 0.08, z0: Z - 0.07, z1: Z + 0.07 }, '#5b5f66');
  const L = 1.0, Wd = 0.2, T = 0.08;
  const c = (u, v, yy) => cam.project(X + u * ca - v * sa, yy, Z + u * sa + v * ca);
  const topF = [c(-L, -Wd, y), c(L, -Wd, y), c(L, Wd, y), c(-L, Wd, y)], bot = [c(-L, -Wd, y - T), c(L, -Wd, y - T), c(L, Wd, y - T), c(-L, Wd, y - T)];
  for (let i = 0; i < 4; i++) poly(g, [topF[i], topF[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], shade(m.look.plank, 0.7), 'rgba(0,0,0,0.3)', 0.8);
  poly(g, topF, shade(m.look.plank, 1.1), 'rgba(0,0,0,0.35)', 1);
  sphere(g, cam, X, y + 0.02, Z, 0.07, '#d0d4da');
}
function flag(g, cam, X, y, Z) {
  box(g, cam, { x0: X + 0.15, x1: X + 0.19, y0: y, y1: y + 0.9, z0: Z - 0.02, z1: Z + 0.02 }, '#444');
  poly(g, [cam.project(X + 0.19, y + 0.9, Z), cam.project(X + 0.6, y + 0.78, Z), cam.project(X + 0.19, y + 0.64, Z)], '#e53935', '#9a1f1c', 1);
}
function person(g, cam, m, X, y, Z, falling) {
  const sh = []; for (let i = 0; i < 18; i++) { const a = i / 18 * 2 * Math.PI; sh.push(cam.project(X + Math.cos(a) * 0.18, y + 0.004, Z + Math.sin(a) * 0.14)); }
  if (!falling) poly(g, sh, 'rgba(0,0,0,0.3)');
  box(g, cam, { x0: X - 0.08, x1: X + 0.08, y0: y, y1: y + 0.3, z0: Z - 0.06, z1: Z + 0.06 }, '#2f3e57');
  box(g, cam, { x0: X - 0.13, x1: X + 0.13, y0: y + 0.3, y1: y + 0.6, z0: Z - 0.09, z1: Z + 0.09 }, m.look.shirt);
  sphere(g, cam, X, y + 0.72, Z, 0.11, '#f1c27d');
}

function topPoly(cam, m, x, z) { const X = wx(x), Z = wz(z), y = top(pillar(m, x, z).h); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => cam.project(X + 0.45 * u, y, Z + 0.45 * v)); }
function inside(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i].y > y) !== (P[j].y > y) && x < (P[j].x - P[i].x) * (y - P[i].y) / (P[j].y - P[i].y) + P[i].x) c = !c; } return c; }
function tapTarget(m, st, px, py) {
  const cam = camOf(m), c = st.at, cand = [];
  for (const [dx, dz] of DIRS) for (const k of [1, 2]) { const n = [c[0] + k * dx, c[1] + k * dz]; if (pillar(m, ...n)) cand.push(n); }
  const outline = (n) => { const X = wx(n[0]), Z = wz(n[1]), y1 = top(pillar(m, ...n).h), c = []; for (const yy of [y1 - 1.2, y1]) for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.push(cam.project(X + 0.45 * u, yy, Z + 0.45 * v)); return hull(c); };
  const hit = cand.filter((n) => inside(topPoly(cam, m, ...n), px, py) || insideMargin(outline(n), px, py) > 0);
  if (hit.length) {
    hit.sort((a, b) => Math.hypot(wx(a[0]) - cam.eye[0], wz(a[1]) - cam.eye[2]) - Math.hypot(wx(b[0]) - cam.eye[0], wz(b[1]) - cam.eye[2]));
    return hit[0];
  }
  let best = null, bd = 28;
  for (const n of cand) { const q = cam.project(wx(n[0]), top(pillar(m, ...n).h), wz(n[1])), d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = n; } }
  return best;
}
const WAIT = { x: VIEW.w / 2 - 110, y: BTN.y, w: 220, h: BTN.h };

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) {
  const hits = [], still = route(m, 'still'), now = route(m, 'now');
  if (still && run(m, still).won) hits.push('still-planks plan from frame 1');
  if (now && run(m, now).won) hits.push('cross when the plank points across now');
  return { singleFrame: hits.length > 0, hits };
}
const gameOver = (st, m) => st.dead || st.won || st.turn >= TURNS;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'go', x: 'grid x', z: 'grid z', note: 'step to a neighbour or cross a plank; one turn' }, { op: 'wait', note: 'one turn' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const k0 = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 6000; a++) {
      const kk = mix32(k0, a), m = build(R(mulberry32(kk))); if (!m) continue;
      m.key = kk; if (!contract(m).ok) continue;
      m.plan = carefulPlay(m); m.board = { ...BOARD };
      return m;
    }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames(m) { return { n: N, period: N }; },
  init(m) { return { ...clockState(), ...(m ? start(m) : { at: [0, 0], t: 0, dead: null, won: false, bump: false }), turn: 0 }; },
  applyAction(st, a, m) {
    if (!a || !['wait', 'go'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    if (st.dead || st.won || st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const act = a.op === 'wait' ? 'wait' : [a.x, a.z];
    if (act !== 'wait' && !pillar(m, ...act)) return { ok: false, reason: 'no-pillar' };
    const n = step(m, st, act);
    Object.assign(st, { at: n.at, dead: n.dead, won: n.won, bump: n.bump }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st) { const ok = !!st.won; return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { won: st.won, dead: st.dead, at: st.at, turns: st.turn } }; },
  oracle(m) { return m.plan.map((a) => (a === 'wait' ? { op: 'wait' } : { op: 'go', x: a[0], z: a[1] })); },
  randomPolicy(m, rnd) {
    let s = start(m); const out = [];
    for (let t = 0; t < TURNS && !s.dead && !s.won; t++) { const o = ['wait', ...moves(m, s.at).map((v) => v.to)], a = o[Math.floor(rnd() * o.length)]; out.push(a === 'wait' ? { op: 'wait' } : { op: 'go', x: a[0], z: a[1] }); s = step(m, s, a); }
    return out;
  },
  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },
  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, over = env.submitted || gameOver(env.state, env.manifest);
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip(); drawView(g, m, st); g.restore();
    rr(g, WAIT.x, WAIT.y, WAIT.w, WAIT.h, 12); g.fillStyle = over ? '#f1f3f5' : '#e6eef7'; g.fill();
    g.strokeStyle = over ? '#d9dee3' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
    g.fillStyle = over ? '#aab3bb' : '#2d4a68'; g.font = `700 17px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Wait', WAIT.x + WAIT.w / 2, WAIT.y + WAIT.h / 2 + 1);
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    const st = env.state;
    if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    if (evt.x >= WAIT.x && evt.x <= WAIT.x + WAIT.w && evt.y >= WAIT.y && evt.y <= WAIT.y + WAIT.h) return [{ op: 'wait' }];
    if (evt.y > VIEW.h) return [];
    const c = tapTarget(env.manifest, st, evt.x, evt.y);
    return c ? [{ op: 'go', x: c[0], z: c[1] }] : [];
  },
  footerStatus(env) { const st = env?.state; if (!st) return ''; return st.won ? 'At the flag' : st.dead ? 'Fell' : `Turn ${st.turn + 1} of ${TURNS}`; },
  gate, frameAudit, contract,
};
export default task;
export const _sim = { step, run, route, carefulPlay, moves, start, randomRate, camOf, top, wx, wz, pillar };
