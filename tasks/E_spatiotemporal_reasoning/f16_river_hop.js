import { drawPromptText, rr, UI_FONT } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import { clockState } from '../core/clock.js';
import { mix32, r3, makeCam, poly, shade, sphere, box } from '../common/_f16_scene_kit.js';

const NAME = 'f16_river_hop';
const PROMPT = 'Cross the river to the far bank';
const SUB = 'Each button is one turn: Jump forward, Wait (ride the log) or Jump back · land on a log, stay inside the red posts';
const VIEW = { w: 640, h: 380 };
const BTN = { y: VIEW.h + 8, h: 52 };
const BOARD = { w: VIEW.w, h: VIEW.h + 8 + BTN.h + 6 };
const LANES = 4, FAR = LANES + 1, TURNS = 15, N = TURNS + 1;
const CYCLE = 12, XW = 6;
const XLIM = 3.6;
const FOOT = 0.12, SAFE = 0.5;
const LOG_H = 0.22;
const SPARE = 3;

const wrap = (x) => ((((x + XW) % CYCLE) + CYCLE) % CYCLE) - XW;
function cover(m, k, t, x) {
  const ln = m.lanes[k - 1]; let best = -Infinity;
  for (const g of ln.logs) {
    const l = wrap(g.a + ln.s * ln.v * t);
    for (const xx of [x, x + CYCLE, x - CYCLE]) best = Math.max(best, Math.min(xx - l, l + g.L - xx));
  }
  return best;
}
const ride = (m, k, x) => (k >= 1 && k <= LANES ? x + m.lanes[k - 1].s * m.lanes[k - 1].v : x);
function step(m, s, act) {
  if (s.dead || s.won) return s;
  const z = act === 'fwd' ? s.z + 1 : act === 'back' ? Math.max(0, s.z - 1) : s.z;
  const x = act === 'wait' ? ride(m, s.z, s.x) : s.x, t = s.t + 1;
  const o = { z, x, t, dead: null, won: false };
  if (z === FAR) { if (Math.abs(x) <= XLIM) o.won = true; else o.dead = 'drift'; }
  else if (z >= 1) { if (cover(m, z, t, x) < FOOT) o.dead = 'splash'; else if (Math.abs(x) > XLIM) o.dead = 'drift'; }
  return o;
}
const start = (m) => ({ z: 0, x: m.x0, t: 0, dead: null, won: false });
function run(m, acts) { let s = start(m); for (const a of acts) { if (s.dead || s.won || s.t >= TURNS) break; s = step(m, s, a); } return s; }

function greedy(m, mode) {
  const cam = camOf(m), acts = [];
  let s = start(m);
  const safe = (k, t, x, zFrom) => {
    if (k === FAR) return Math.abs(x) <= XLIM - 0.2;
    if (k === 0) return true;
    const tt = mode === 'now' ? t - 1 : t;
    if (mode !== 'screen') return cover(m, k, tt, x) >= SAFE;
    const me = cam.project(x, 0, zFrom - 0.5 + (zFrom === 0 ? -0.1 : 0)), zc = k - 0.5, ln = m.lanes[k - 1];
    for (const g of ln.logs) {
      const l = wrap(g.a + ln.s * ln.v * tt);
      for (const off of [0, CYCLE, -CYCLE]) {
        const a = cam.project(l + off, 0, zc), b = cam.project(l + off + g.L, 0, zc), d = SAFE * a.s;
        if (me.x >= Math.min(a.x, b.x) + d && me.x <= Math.max(a.x, b.x) - d) return true;
      }
    }
    return false;
  };
  for (let turn = 0; turn < TURNS && !s.dead && !s.won; turn++) {
    let act = 'wait';
    if (turn > 0) {
      const t1 = s.t + 1;
      if (safe(s.z + 1, t1, s.x, s.z)) act = 'fwd';
      else if (s.z >= 1 && Math.abs(ride(m, s.z, s.x)) > XLIM - 0.25) act = s.z - 1 >= 0 && safe(s.z - 1, t1, s.x, s.z) ? 'back' : 'wait';
    }
    acts.push(act); s = step(m, s, act);
  }
  return { acts, s };
}
function plan(m, still) {
  const memo = new Set(), mm = still ? { ...m, lanes: m.lanes.map((l) => ({ ...l, v: 0 })) } : m;
  const go = (s, acts) => {
    if (s.won) return acts;
    if (s.dead || s.t >= TURNS) return null;
    const key = `${s.t}|${s.z}|${Math.round(s.x * 100)}`; if (memo.has(key)) return null; memo.add(key);
    for (const a of ['fwd', 'wait', 'back']) {
      const n = step(mm, s, a);
      if (!n.won && !n.dead && n.z >= 1 && (cover(mm, n.z, n.t, n.x) < SAFE || Math.abs(n.x) > XLIM - 0.25)) continue;
      const r = go(n, [...acts, a]); if (r) return r;
    }
    return null;
  };
  return go(still ? start(m) : step(m, start(m), 'wait'), still ? [] : ['wait']);
}
function randomRate(m, k = 400) {
  const rnd = mulberry32(mix32(m.key, 77)); let w = 0;
  for (let i = 0; i < k; i++) { const acts = Array.from({ length: TURNS }, () => ['fwd', 'wait', 'back'][Math.floor(rnd() * 3)]); if (run(m, acts).won) w++; }
  return w / k;
}

function build(rng) {
  const speeds = rng.shuffle([0.3, 0.42, 0.55, 0.68]), s0 = rng.pick([-1, 1]), lanes = [];
  for (let k = 0; k < LANES; k++) {
    const nl = rng.int(2, 3), logs = []; let x = rng.uniform(-XW, XW);
    const Ls = Array.from({ length: nl }, () => rng.uniform(1.3, 2.1)), gapTot = CYCLE - Ls.reduce((a, b) => a + b, 0);
    const cut = Array.from({ length: nl }, () => rng.uniform(0.6, 1.4)), cs = cut.reduce((a, b) => a + b, 0);
    for (let i = 0; i < nl; i++) { logs.push({ a: wrap(x), L: r3(Ls[i]) }); x += Ls[i] + gapTot * cut[i] / cs; }
    lanes.push({ s: k % 2 ? -s0 : s0, v: speeds[k], logs });
  }
  const az = rng.pick([-1, 1]) * rng.uniform(10, 15);
  return { task: NAME, n: N, dt: 1, lanes, x0: r3(rng.uniform(-1.2, 1.2)), cam: { az: r3(az), el: r3(rng.uniform(44, 48)) },
    look: { water: rng.pick(['#3f86b5', '#3b7fa8', '#4a8fb8']), wood: rng.pick(['#8a5a33', '#7d5230', '#94613a']), shirt: rng.pick(['#e8a33a', '#d9534f', '#6a5acd']) } };
}
export function contract(m) {
  const why = [];
  const care = greedy(m, 'lead');
  if (!care.s.won) why.push('careful play fails');
  else if (care.acts.length > TURNS - SPARE) why.push('careful play leaves < 3 spare turns');
  if (greedy(m, 'now').s.won) why.push('no-lead reading wins');
  if (greedy(m, 'screen').s.won) why.push('screen reading wins');
  const st = plan(m, true); if (st && run(m, st).won) why.push('still-logs plan wins');
  if (!plan(m, false)) why.push('no safe route');
  if (randomRate(m) > 0.03) why.push('random > 3 %');
  return { ok: why.length === 0, why };
}

function camOf(m) { return makeCam({ az: m.cam.az, el: m.cam.el, dist: 8.4, tgt: [0, 0, 2.2], fov: 44, W: VIEW.w, H: VIEW.h, cy: 18 }); }
const quad = (cam, x0, x1, z0, z1, y = 0) => [cam.project(x0, y, z0), cam.project(x1, y, z0), cam.project(x1, y, z1), cam.project(x0, y, z1)];
function drawView(g, m, st) {
  const cam = camOf(m), L = m.look, t = st.t;
  g.fillStyle = '#cfe3f0'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const bank = (z0, z1, col) => { poly(g, quad(cam, -9, 9, z0, z1), col); poly(g, quad(cam, -9, 9, z0, z0 + 0.06, 0.02), shade(col, 0.8)); };
  bank(LANES, LANES + 3, '#8fbf6a');
  posts(g, cam, LANES + 0.35);
  if (st.z === FAR) person(g, cam, m, st.x, LANES + 0.5, 0, st);
  for (let k = LANES; k >= 1; k--) {
    buoys(g, cam, k);
    poly(g, quad(cam, -9, 9, k - 1, k), shade(L.water, k % 2 ? 1 : 1.07));
    for (const sg of [-1, 1]) poly(g, quad(cam, sg * XLIM, sg * 9, k - 1, k, 0.001), 'rgba(20,40,70,0.22)');
    flow(g, cam, m, k, t);
    const ln = m.lanes[k - 1];
    for (const lg of ln.logs) {
      const l = wrap(lg.a + ln.s * ln.v * t);
      for (const off of [0, CYCLE, -CYCLE]) {
        const x0 = Math.max(-8.5, l + off), x1 = Math.min(8.5, l + off + lg.L); if (x1 <= x0) continue;
        poly(g, quad(cam, x0 + 0.05, x1 + 0.05, k - 0.86, k - 0.14, 0.003), 'rgba(10,30,50,0.25)');
        box(g, cam, { x0, x1, y0: 0, y1: LOG_H, z0: k - 0.82, z1: k - 0.18 }, L.wood, { top: 1.15, front: 0.85, side: 0.7 });
      }
    }
    if (st.z === k) person(g, cam, m, st.x, k - 0.5, st.dead === 'splash' ? 0 : LOG_H, st);
  }
  buoys(g, cam, 0);
  bank(-3, 0, '#9cc777');
  posts(g, cam, -0.35);
  if (st.z === 0) person(g, cam, m, st.x, -0.45, 0, st);
  if (st.dead || st.won) {
    const msg = st.won ? 'Made it across' : st.dead === 'splash' ? 'Fell in the water' : 'Swept past a red post';
    g.font = `700 20px ${UI_FONT}`; const w = g.measureText(msg).width + 36;
    rr(g, (VIEW.w - w) / 2, 14, w, 38, 10); g.fillStyle = st.won ? 'rgba(46,125,50,0.92)' : 'rgba(198,40,40,0.92)'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, VIEW.w / 2, 33);
  }
}
function buoys(g, cam, k) {
  for (let x = -8; x <= 8; x++) sphere(g, cam, x, 0.04, k, 0.07, '#f4f4f4');
  for (const sg of [-1, 1]) sphere(g, cam, sg * XLIM, 0.06, k, 0.1, '#d32f2f');
}
function landing(g, cam, x, k) {
  const z = k === FAR ? LANES + 0.5 : k - 0.5, y = k === FAR ? 0.01 : 0.012, p = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * 2 * Math.PI; p.push(cam.project(x + Math.cos(a) * 0.26, y, z + Math.sin(a) * 0.26)); }
  poly(g, p, 'rgba(255,235,59,0.28)', '#1f2a36', 4.2); g.setLineDash([5, 3]); poly(g, p, null, '#ffeb3b', 2.4); g.setLineDash([]);
}
function posts(g, cam, z) {
  for (const sg of [-1, 1]) {
    const x = sg * XLIM;
    for (let i = 0; i < 4; i++) box(g, cam, { x0: x - 0.06, x1: x + 0.06, y0: i * 0.25, y1: (i + 1) * 0.25, z0: z - 0.06, z1: z + 0.06 }, i % 2 ? '#ffffff' : '#d32f2f');
  }
}
function flow(g, cam, m, k, t) {
  const ln = m.lanes[k - 1]; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const x = wrap(i * 1.33 + k * 0.7 + ln.s * ln.v * t), z = k - 0.5 + ((i * 37) % 7 - 3) * 0.09;
    const a = cam.project(x - 0.18, 0.005, z), b = cam.project(x + 0.18, 0.005, z);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
}
function person(g, cam, m, x, z, y, st) {
  if (st.dead === 'splash') {
    for (const r of [0.18, 0.32, 0.46]) { const p = []; for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI; p.push(cam.project(x + Math.cos(a) * r, 0.01, z + Math.sin(a) * r * 0.8)); } poly(g, p, null, 'rgba(255,255,255,0.8)', 1.6); }
    sphere(g, cam, x, 0.08, z, 0.12, '#f1c27d');
    return;
  }
  const sh = []; for (let i = 0; i < 20; i++) { const a = i / 20 * 2 * Math.PI; sh.push(cam.project(x + Math.cos(a) * 0.2, y + 0.004, z + Math.sin(a) * 0.14)); }
  poly(g, sh, 'rgba(0,0,0,0.3)');
  box(g, cam, { x0: x - 0.09, x1: x + 0.09, y0: y, y1: y + 0.32, z0: z - 0.07, z1: z + 0.07 }, '#2f3e57');
  box(g, cam, { x0: x - 0.15, x1: x + 0.15, y0: y + 0.32, y1: y + 0.66, z0: z - 0.1, z1: z + 0.1 }, m.look.shirt);
  sphere(g, cam, x, y + 0.79, z, 0.12, '#f1c27d');
}

const DEFS = [{ id: 'back', label: 'Jump back', a: { op: 'hop', a: 'back' } }, { id: 'wait', label: 'Wait', a: { op: 'hop', a: 'wait' } }, { id: 'fwd', label: 'Jump forward', a: { op: 'hop', a: 'fwd' } }];
const buttons = () => { const gap = 10, w = (BOARD.w - 4 * gap) / 3; return DEFS.map((d, i) => ({ ...d, x: gap + i * (w + gap), y: BTN.y, w, h: BTN.h })); };
function drawButtons(g, off) {
  for (const b of buttons()) {
    rr(g, b.x, b.y, b.w, b.h, 12); g.fillStyle = off ? '#f1f3f5' : b.id === 'fwd' ? '#e3f1e6' : '#e6eef7'; g.fill();
    g.strokeStyle = off ? '#d9dee3' : b.id === 'fwd' ? '#7fb38a' : '#8fa9c4'; g.lineWidth = 2; g.stroke();
    g.fillStyle = off ? '#aab3bb' : '#2d4a68'; g.font = `700 17px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

export function gate(m) { try { return contract(m).ok; } catch { return false; } }
export function frameAudit(m) {
  const st = plan(m, true), hits = [];
  if (st && run(m, st).won) hits.push('still-logs plan from frame 1');
  if (greedy(m, 'now').s.won) hits.push('jump when a log is ahead now');
  return { singleFrame: hits.length > 0, hits };
}

const gameOver = (st, m) => st.dead || st.won || st.turn >= TURNS;

const task = {
  meta: {
    turnBased: true,
    name: NAME, family: 'F16', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD }, uses3d: true,
    actionSpace: [{ op: 'hop', a: 'fwd | wait | back', note: 'one turn = one frame; Next frame = {op: wait} = Wait' }],
    promptHuman: PROMPT,
  },
  generate(rng) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 3000; a++) {
      const m = build(R(mulberry32(mix32(key, a)))); m.key = mix32(key, a);
      if (!contract(m).ok) continue;
      m.plan = plan(m, false); m.board = { ...BOARD };
      return m;
    }
    throw new Error(`${NAME}: no instance passed the gate`);
  },
  frames(m) { return { n: N, period: N }; },
  init(m) { return { ...clockState(), ...(m ? start(m) : { z: 0, x: 0, t: 0, dead: null, won: false }), turn: 0 }; },
  applyAction(st, a, m) {
    if (!a || !['wait', 'hop'].includes(a.op)) return { ok: false, reason: 'bad-op' };
    const act = a.op === 'wait' ? 'wait' : a.a;
    if (!['fwd', 'wait', 'back'].includes(act)) return { ok: false, reason: 'bad-hop' };
    if (st.dead || st.won || st.turn >= TURNS) return { ok: false, reason: 'finished' };
    const n = step(m, st, act);
    Object.assign(st, { z: n.z, x: r3(n.x), dead: n.dead, won: n.won }); st.turn++; st.t = st.turn; st.steps++;
    return { ok: true };
  },
  verify(st, m) {
    const ok = !!st.won;
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : st.z / FAR, detail: { won: st.won, dead: st.dead, channel: st.z, x: st.x, turns: st.turn } };
  },
  oracle(m) { return m.plan.map((a) => ({ op: 'hop', a })); },
  randomPolicy(m, rnd) { return Array.from({ length: TURNS }, () => ({ op: 'hop', a: ['fwd', 'wait', 'back'][Math.floor(rnd() * 3)] })); },
  drawPrompt(g, r) { drawPromptText(g, r, PROMPT, SUB); },
  tick() { return false; },
  drawBoard(g, br, env) {
    const m = env.manifest, st = env.state, over = env.submitted || gameOver(env.state, env.manifest);
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.save(); g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip(); drawView(g, m, st); g.restore();
    drawButtons(g, over);
    g.restore();
  },
  canVerify(env) { return gameOver(env.state, env.manifest); },
  pointer(evt, env) {
    const st = env.state;
    if (evt.type !== 'down' || env.submitted || gameOver(env.state, env.manifest)) return [];
    const b = buttons().find((q) => evt.x >= q.x && evt.x <= q.x + q.w && evt.y >= q.y && evt.y <= q.y + q.h);
    return b ? [{ ...b.a }] : [];
  },
  footerStatus(env) {
    const st = env?.state; if (!st) return '';
    return st.won ? 'Across' : st.dead ? 'Fell in' : `Turn ${st.turn + 1} of ${TURNS}`;
  },
  gate, frameAudit, contract,
};
export default task;
export const _sim = { step, run, greedy, plan, cover, randomRate, camOf, start };
