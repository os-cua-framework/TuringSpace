import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { mulberry32, R } from '../core/rng.js';
import * as M from '../common/_gravity_maze_turn_model.js';
import { GEO, geoFor, litBoard, ballSprite, wallImage, restLocal, cellCentre, exitLocal } from '../common/_gravity_maze_turn_rt.js';
import { buildMazeLook } from '../common/_gravity_maze_turn_look.js';

const NAME = 'gravity_maze_turn';
const BOARD = { w: 340, h: 420 };
const NDEF = 8;
const CX = 170, CY = 166;
const TRAY = { x: CX - GEO.S / 2 - 16, w: GEO.S + 32, y: 330, back: 27, lipY: 351, lipH: 10 };
const BTN = { y: 368, h: 44, w: 152, xs: [12, 176] };
const HARD_RULES = { L: [5, 7], randomMax: 0.05, traps: 3, pits: [4, 6], greedy: true, constPit: false };
const EXT_RULES = { L: [3, 5], randomMax: 0.15, traps: 2, pits: [2, 3], greedy: false, constPit: true };
const rulesFor = (n) => (n === NDEF ? HARD_RULES : EXT_RULES);
function greedyRun(m, tie = 'cw', avoidPits = false, n = 12) {
  let s = M.startState(m);
  const [ec, er] = M.exitCell(m), other = tie === 'cw' ? 'ccw' : 'cw';
  const d = (t) => (t.status === 'out' ? -1 : t.status === 'pit' && avoidPits ? 1e9 : Math.abs(t.c - ec) + Math.abs(t.r - er));
  for (let i = 0; i < n && s.status === 'in'; i++) {
    const a = M.press(m, s, tie).s, b = M.press(m, s, other).s;
    s = d(b) < d(a) ? b : a;
  }
  return s.status;
}

function wallsOf(m, c, r) { let k = 0; for (let d = 0; d < 4; d++) if (M.wallAt(m, c, r, d)) k++; return k; }

function contractOk(m, N = NDEF) {
  if (!m || m.task !== NAME || m.n !== N) return false;
  const RU = rulesFor(N);
  if (!Array.isArray(m.hw) || m.hw.length !== N + 1 || !Array.isArray(m.vw) || m.vw.length !== N) return false;
  for (const row of m.hw) if (!Array.isArray(row) || row.length !== N || row.some((x) => x !== 0 && x !== 1)) return false;
  for (const row of m.vw) if (!Array.isArray(row) || row.length !== N + 1 || row.some((x) => x !== 0 && x !== 1)) return false;
  if (!m.exit || ![0, 1, 2, 3].includes(m.exit.side) || !Number.isInteger(m.exit.k) || m.exit.k < 0 || m.exit.k >= N) return false;
  let gaps = 0;
  for (let i = 0; i < N; i++) gaps += (1 - m.hw[0][i]) + (1 - m.hw[N][i]) + (1 - m.vw[i][0]) + (1 - m.vw[i][N]);
  const [ec, er] = M.exitCell(m);
  if (gaps !== 1 || M.wallAt(m, ec, er, m.exit.side)) return false;
  if (!Array.isArray(m.pits) || m.pits.length < RU.pits[0] || m.pits.length > RU.pits[1]) return false;
  for (const p of m.pits) {
    if (wallsOf(m, p.c, p.r) !== 3 || M.wallAt(m, p.c, p.r, p.open)) return false;
    const oc = p.c + M.DIRS[p.open][0], or = p.r + M.DIRS[p.open][1];
    if (oc < 0 || or < 0 || oc >= N || or >= N || M.pitIndex(m, oc, or) >= 0) return false;
    if (p.c === ec && p.r === er) return false;
    for (const q of m.pits) if (q !== p && Math.abs(q.c - p.c) + Math.abs(q.r - p.r) < 2) return false;
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (wallsOf(m, c, r) === 4) return false;
  if (!m.start || M.pitIndex(m, m.start.c, m.start.r) >= 0 || !M.wallAt(m, m.start.c, m.start.r, 2)) return false;
  const best = M.solve(m);
  if (!best || best.length < RU.L[0] || best.length > RU.L[1]) return false;
  if (!Array.isArray(m.sol) || m.sol.length !== best.length || m.sol.some((d) => d !== 'cw' && d !== 'ccw')) return false;
  if (M.runPresses(m, m.sol).s.status !== 'out') return false;
  if (RU.constPit ? (M.lazyConstant(m, 'cw') !== 'pit' || M.lazyConstant(m, 'ccw') !== 'pit')
    : (M.lazyConstant(m, 'cw') === 'out' || M.lazyConstant(m, 'ccw') === 'out')) return false;
  if (M.lazyExitDown(m, 'cw') === 'out' || M.lazyExitDown(m, 'ccw') === 'out') return false;
  if (M.runPresses(m, ['cw', 'ccw', 'cw', 'ccw', 'cw', 'ccw', 'cw', 'ccw']).s.status === 'out') return false;
  if (M.runPresses(m, ['ccw', 'cw', 'ccw', 'cw', 'ccw', 'cw', 'ccw', 'cw']).s.status === 'out') return false;
  let s = M.startState(m), traps = 0;
  for (const d of m.sol) {
    if (M.press(m, s, d === 'cw' ? 'ccw' : 'cw').s.status === 'pit') traps++;
    s = M.press(m, s, d).s;
  }
  if (traps < RU.traps) return false;
  if (RU.greedy) for (const tie of ['cw', 'ccw']) for (const av of [false, true]) if (greedyRun(m, tie, av) === 'out') return false;
  if (!M.allCanEscape(m)) return false;
  if (M.randomOutProb(m).out > RU.randomMax) return false;
  return true;
}
export function semanticKey(m) {
  return `${m.n}|${m.hw.map((r) => r.join('')).join('/')}|${m.vw.map((r) => r.join('')).join('/')}|x${m.exit.side},${m.exit.k}|${m.pits.map((p) => `${p.c},${p.r},${p.open}`).sort().join(';')}|s${m.start.c},${m.start.r}`;
}

export function gate(m) {
  try {
    if (m && m.ext !== undefined) return (m.ext === 'train' || m.ext === 'test') && EXT_SIZES.includes(m.n) && contractOk(m, m.n);
    return contractOk(m);
  } catch { return false; }
}

export function _tryBuildRaw(rng, N = NDEF) {
  const RU = rulesFor(N);
  const P = rng.uniform(0.22, 0.3);
  const hw = [], vw = [];
  for (let r = 0; r <= N; r++) hw.push(Array.from({ length: N }, () => (r === 0 || r === N ? 1 : (rng.raw() < P ? 1 : 0))));
  for (let r = 0; r < N; r++) vw.push(Array.from({ length: N + 1 }, (_, c) => (c === 0 || c === N ? 1 : (rng.raw() < P ? 1 : 0))));
  const m = { task: NAME, board: BOARD, n: N, hw, vw, pits: [], exit: { side: rng.int(0, 3), k: rng.int(0, N - 1) },
    start: null, sol: null, style: { plate: rng.int(0, 2), seed: rng.int(1, 997) } };
  const [ec, er] = M.exitCell(m);
  M.setWall(m, ec, er, m.exit.side, 0);
  const np = rng.int(RU.pits[0], RU.pits[1]);
  for (const i of rng.shuffle([...Array(N * N).keys()])) {
    if (m.pits.length >= np) break;
    const c = i % N, r = Math.floor(i / N);
    if (c === ec && r === er) continue;
    if (m.pits.some((p) => Math.abs(p.c - c) + Math.abs(p.r - r) < 2)) continue;
    const opens = rng.shuffle([0, 1, 2, 3]).filter((d) => {
      const nc = c + M.DIRS[d][0], nr = r + M.DIRS[d][1];
      return nc >= 0 && nr >= 0 && nc < N && nr < N && M.pitIndex(m, nc, nr) < 0;
    });
    if (!opens.length) continue;
    for (let d = 0; d < 4; d++) M.setWall(m, c, r, d, d === opens[0] ? 0 : 1);
    m.pits.push({ c, r, open: opens[0] });
  }
  if (m.pits.length < RU.pits[0] || M.wallAt(m, ec, er, m.exit.side)) return null;
  const starts = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (M.pitIndex(m, c, r) < 0 && M.wallAt(m, c, r, 2)) starts.push({ c, r });
  for (const s0 of rng.shuffle(starts)) {
    m.start = s0;
    const best = M.solve(m);
    if (!best || best.length < RU.L[0] || best.length > RU.L[1]) continue;
    m.sol = best;
    if (contractOk(m, N)) return rng.raw() < 0.5 ? M.mirror(m) : m;
  }
  return null;
}

const CORNER_KEEP = 0.45;
const CAP = 2;
const SEQ_SHARE = { rrrrl: 10.03, rlllr: 7.66, rrlr: 6.03, rllrl: 3.6, rrrlr: 3.29, rrll: 3.0, rllll: 2.38, rll: 2.22, rlll: 2.18 };
function keepProb(m, N = m.n) {
  let k = m.sol.map((d) => (d === 'cw' ? 'r' : 'l')).join('');
  if (k[0] === 'l') k = k.replace(/[rl]/g, (x) => (x === 'r' ? 'l' : 'r'));
  const f = SEQ_SHARE[k];
  const corner = m.exit.k === 0 || m.exit.k === N - 1;
  return (corner ? CORNER_KEEP : 1) * (f ? Math.min(1, CAP / f) : 1);
}

function mix32(x, i) {
  let h = (x ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

const EXT_SIZES = [6];
function generateExt(rng, split) {
  const n = rng.pick(EXT_SIZES), key = Math.floor(rng.raw() * 4294967296) >>> 0;
  for (let a = 0; a < 200000; a++) {
    const sub = R(mulberry32(mix32(key, a)));
    const m = _tryBuildRaw(sub, n);
    if (m && sub.raw() < keepProb(m, n)) { const out = { ...m, ext: split }; if (gate(out)) return out; }
  }
  throw new Error('gravity_maze_turn: ext sampler exhausted');
}

const FALLBACK = {"task":"gravity_maze_turn","board":{"w":340,"h":420},"n":6,"hw":[[1,1,1,1,1,1],[1,1,0,0,1,0],[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,1,0,1],[1,1,1,1,1,1]],"vw":[[1,0,0,0,1,0,1],[1,0,0,1,0,0,1],[1,0,0,0,0,0,1],[1,0,0,1,1,0,1],[1,0,0,0,0,0,1],[0,0,0,0,0,0,1]],"pits":[{"c":0,"r":0,"open":1},{"c":5,"r":5,"open":3}],"exit":{"side":3,"k":5},"start":{"c":1,"r":0},"sol":["cw","ccw","ccw","cw","ccw"],"style":{"plate":2,"seed":188}};

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function toScreen(p, angDeg) {
  const th = angDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const dx = p[0] - GEO.S / 2, dy = p[1] - GEO.S / 2;
  return [CX + dx * c - dy * s, CY + dx * s + dy * c];
}
const exitRot = (m) => (6 - m.exit.side) % 4;
const trayX = (m) => toScreen(exitLocal(m), exitRot(m) * 90)[0];
const geoM = (m) => geoFor(m.n);
const trayY = (m) => TRAY.y + TRAY.back - geoFor(m.n).rb - 2.5;
function btnRects() { return BTN.xs.map((x) => ({ x, y: BTN.y, w: BTN.w, h: BTN.h })); }

const VIS = new WeakMap();
const T_ROT = 0.22, ACC = 2800, T_SINK = 0.15;
function visOf(st) {
  let v = VIS.get(st);
  if (!v) { v = { turns: st.turns, angle: st.rot * 90, anim: null }; VIS.set(st, v); }
  return v;
}
function startAnim(v, st, m) {
  const L = st.last;
  const a0 = L.rot0 * 90 + 360 * Math.round((v.angle - L.rot0 * 90) / 360);
  const a1 = a0 + (L.dir === 'cw' ? 90 : -90);
  const an = { t: 0, a0, a1, L, rollT: 0, fallT: 0 };
  if (L.status0 === 'in') {
    const g0 = M.gravityDir(L.rot0), g1 = M.gravityDir(L.rot1);
    an.p0 = restLocal(L.c0, L.r0, g0, geoM(m));
    const pi = M.pitIndex(m, L.c1, L.r1);
    an.p1 = L.status1 === 'in' ? restLocal(L.c1, L.r1, g1, geoM(m)) : L.status1 === 'pit' ? cellCentre(m.pits[pi].c, m.pits[pi].r, geoM(m)) : exitLocal(m);
    an.g = M.DIRS[g1];
    const along = (an.p1[0] - an.p0[0]) * an.g[0] + (an.p1[1] - an.p0[1]) * an.g[1];
    an.D = Math.max(0, along);
    an.rollT = Math.max(0.08, Math.sqrt(2 * an.D / ACC));
    if (L.status1 === 'out') {
      const ex = toScreen(an.p1, a1);
      an.fall0 = ex; an.fallT = Math.sqrt(2 * Math.max(1, trayY(m) - ex[1]) / ACC);
    }
    if (L.status1 === 'pit') an.sinkT = T_SINK;
  }
  v.anim = an;
  v.turns = st.turns;
}
function settled(st) { const v = visOf(st); return !v.anim && v.turns >= st.turns; }
function animTotal(an) { return T_ROT + (an.p0 ? an.rollT + (an.fallT || 0) + (an.sinkT || 0) : 0); }

function pose(st, m) {
  const v = visOf(st), an = v.anim;
  if (!an) {
    const angle = v.angle;
    if (st.status === 'in') return { angle, rotA: st.rot, rotB: st.rot, mix: 0, ball: { kind: 'board', p: restLocal(st.c, st.r, M.gravityDir(st.rot), geoM(m)) } };
    if (st.status === 'pit') { const p = m.pits[M.pitIndex(m, st.c, st.r)]; return { angle, rotA: st.rot, rotB: st.rot, mix: 0, ball: { kind: 'pit', p: cellCentre(p.c, p.r, geoM(m)), k: 1 } }; }
    return { angle, rotA: st.rot, rotB: st.rot, mix: 0, ball: { kind: 'tray', x: trayX(m) } };
  }
  const L = an.L, t = an.t;
  const tr = Math.min(1, t / T_ROT);
  const angle = an.a0 + (an.a1 - an.a0) * ease(tr);
  const out = { angle, rotA: L.rot0, rotB: L.rot1, mix: ease(tr), ball: null };
  if (!an.p0) {
    out.ball = st.status === 'pit' ? (() => { const p = m.pits[M.pitIndex(m, st.c, st.r)]; return { kind: 'pit', p: cellCentre(p.c, p.r, geoM(m)), k: 1 }; })()
      : { kind: 'tray', x: trayX(m) };
    return out;
  }
  if (t < T_ROT) { out.ball = { kind: 'board', p: an.p0 }; return out; }
  const tRoll = t - T_ROT;
  if (tRoll < an.rollT) {
    const s = Math.min(an.D, 0.5 * ACC * tRoll * tRoll), f = an.D > 0 ? s / an.D : 1;
    const lat = Math.min(1, tRoll / 0.12);
    const g = an.g, perp = [-g[1], g[0]];
    const dp = [an.p1[0] - an.p0[0], an.p1[1] - an.p0[1]];
    const along = dp[0] * g[0] + dp[1] * g[1], side = dp[0] * perp[0] + dp[1] * perp[1];
    const k = an.D > 0 ? f : Math.min(1, tRoll / an.rollT);
    const a = along * k, b = side * ease(lat);
    out.ball = { kind: 'board', p: [an.p0[0] + g[0] * a + perp[0] * b, an.p0[1] + g[1] * a + perp[1] * b] };
    return out;
  }
  const tAfter = tRoll - an.rollT;
  if (L.status1 === 'pit') { out.ball = { kind: 'pit', p: an.p1, k: Math.min(1, tAfter / an.sinkT) }; return out; }
  if (L.status1 === 'out') {
    const y = Math.min(trayY(m), an.fall0[1] + 0.5 * ACC * tAfter * tAfter);
    out.ball = { kind: 'free', x: an.fall0[0], y };
    return out;
  }
  out.ball = { kind: 'board', p: an.p1 };
  return out;
}

function drawTrayBack(g, T = null) {
  const { x, w, y, back } = TRAY;
  g.save();
  g.shadowColor = 'rgba(60,40,20,.28)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  rr(g, x, y, w, back, 3); g.fillStyle = T ? T.back[1] : '#8a5d3b'; g.fill();
  g.restore();
  const gr = g.createLinearGradient(0, y, 0, y + back);
  gr.addColorStop(0, T ? T.back[0] : '#b58459'); gr.addColorStop(0.15, T ? T.back[1] : '#94653f'); gr.addColorStop(1, T ? T.back[2] : '#6a4428');
  rr(g, x, y, w, back, 3); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,235,200,.35)'; g.fillRect(x + 3, y + 0.5, w - 6, 1.2);
}
function drawTrayLip(g, T = null) {
  const { x, w, lipY, lipH } = TRAY;
  g.save();
  g.shadowColor = 'rgba(50,30,15,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  rr(g, x - 2, lipY, w + 4, lipH, 3); g.fillStyle = T ? T.lip[1] : '#b07c50'; g.fill();
  g.restore();
  const gr = g.createLinearGradient(0, lipY, 0, lipY + lipH);
  gr.addColorStop(0, T ? T.lip[0] : '#d9a874'); gr.addColorStop(0.25, T ? T.lip[1] : '#bf8a5a'); gr.addColorStop(1, T ? T.lip[2] : '#93613b');
  rr(g, x - 2, lipY, w + 4, lipH, 3); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(90,55,30,.18)'; g.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) {
    g.beginPath(); const yy = lipY + 3 + i * 2.6;
    g.moveTo(x + 4, yy); g.bezierCurveTo(x + w * 0.3, yy + 1.2, x + w * 0.6, yy - 1.1, x + w - 4, yy + 0.4); g.stroke();
  }
}
function drawBall(g, sc, x, y, k = 1, dark = 0, G = GEO, look = null) {
  const sp = look ? ballSprite(sc, look, G.rb) : ballSprite(sc, null, G.rb);
  const R = G.rb;
  if (!sp) { g.beginPath(); g.arc(x, y, R * k, 0, Math.PI * 2); g.fillStyle = '#9aa3ab'; g.fill(); return; }
  const s = sp.size * k;
  g.drawImage(sp.cv, x - s / 2, y - s / 2, s, s);
  if (dark > 0) { g.beginPath(); g.arc(x, y, R * k + 0.5, 0, Math.PI * 2); g.fillStyle = `rgba(28,18,10,${dark})`; g.fill(); }
}
function drawBallShadow(g, x, y, G = GEO, look = null) {
  const R = G.rb, sx = x + (look ? look.ballShadow[0] : 3.0), sy = y + (look ? look.ballShadow[1] : 4.4);
  const gr = g.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 1.25);
  gr.addColorStop(0, 'rgba(40,25,10,.42)'); gr.addColorStop(1, 'rgba(40,25,10,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, R * 1.25, 0, Math.PI * 2); g.fill();
}
function drawButtons(g, locked = false) {
  const R = btnRects();
  R.forEach((b, i) => {
    rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = locked ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = locked ? '#dde1e6' : '#c8d0d8'; g.lineWidth = 1; g.stroke();
    const col = locked ? '#b5bcc4' : '#3c4955', cw = i === 1;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - 6, rad = 7.5;
    const deg = Math.PI / 180, [aS, aE] = cw ? [30 * deg, 300 * deg] : [150 * deg, -120 * deg];
    g.beginPath(); g.arc(cx, cy, rad, aS, aE, !cw); g.stroke();
    const hx = cx + rad * Math.cos(aE), hy = cy + rad * Math.sin(aE);
    const tx = cw ? -Math.sin(aE) : Math.sin(aE), ty = cw ? Math.cos(aE) : -Math.cos(aE);
    const nx = Math.cos(aE), ny = Math.sin(aE);
    g.beginPath();
    g.moveTo(hx + tx * 6.5, hy + ty * 6.5);
    g.lineTo(hx - tx * 1.5 + nx * 4.6, hy - ty * 1.5 + ny * 4.6);
    g.lineTo(hx - tx * 1.5 - nx * 4.6, hy - ty * 1.5 - ny * 4.6);
    g.closePath(); g.fill();
    g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(cw ? 'Clockwise' : 'Counterclockwise', cx, b.y + b.h - 9);
  });
}
function drawLostBanner(g) {
  const w = BOARD.w - 24, h = 34, x = 12, y = 8;
  g.save();
  g.shadowColor = 'rgba(80,10,10,.25)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
  rr(g, x, y, w, h, 8); g.fillStyle = '#fdecec'; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#e06a6a'; g.lineWidth = 1.5; g.stroke();
  const cx = x + 22, cy = y + h / 2;
  g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fillStyle = '#e35353'; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 4.5, cy - 4.5); g.lineTo(cx + 4.5, cy + 4.5); g.moveTo(cx + 4.5, cy - 4.5); g.lineTo(cx - 4.5, cy + 4.5); g.stroke();
  g.fillStyle = '#b3261e'; g.font = `700 14px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('The ball fell into a hole: failed', cx + 18, cy + 0.5);
  g.restore();
}

export default {
  meta: {
    name: NAME, family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'turn', dir: "'cw' | 'ccw' — turn the whole board 90° clockwise / counter-clockwise" }],
    promptHuman: 'Turn the maze to roll the ball out',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext);
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    for (let a = 0; a < 80000; a++) {
      const sub = R(mulberry32(mix32(key, a)));
      const m = _tryBuildRaw(sub);
      if (m && sub.raw() < keepProb(m)) return m;
    }
    return JSON.parse(JSON.stringify(FALLBACK));
  },

  init(m) {
    return { c: m.start.c, r: m.start.r, rot: 0, status: 'in', turns: 0, last: null };
  },

  applyAction(state, action, m) {
    if (!action || action.op !== 'turn' || (action.dir !== 'cw' && action.dir !== 'ccw')) return { ok: false, reason: 'bad-op' };
    if (state.status === 'pit') return { ok: false, reason: 'ball-in-hole' };
    const before = { c: state.c, r: state.r, rot: state.rot, status: state.status };
    const { s } = M.press(m, before, action.dir);
    state.last = { dir: action.dir, rot0: before.rot, rot1: s.rot, c0: before.c, r0: before.r, status0: before.status,
      c1: s.c, r1: s.r, status1: s.status };
    state.c = s.c; state.r = s.r; state.rot = s.rot; state.status = s.status;
    state.turns++;
    return { ok: true };
  },

  verify(state) {
    const ok = state.status === 'out';
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { ball: state.status, turns: state.turns } };
  },

  oracle(m) { return m.sol.map((dir) => ({ op: 'turn', dir })); },

  randomPolicy(m, rnd) {
    const k = 3 + Math.floor(rnd() * 6), acts = [];
    for (let i = 0; i < k; i++) acts.push({ op: 'turn', dir: rnd() < 0.5 ? 'cw' : 'ccw' });
    return acts;
  },

  async mount(env) {
    if (env && env.style) env.assets.mazeLook = await buildMazeLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Turn the maze to roll the ball out', 'The ball always rolls down; holes trap it');
  },

  tick(env, dt, hooks) {
    const st = env && env.state, m = env && env.manifest;
    if (!st || !m) return false;
    const v = visOf(st);
    if (v.turns < st.turns && st.last) startAnim(v, st, m);
    if (!v.anim) {
      if (st.status === 'pit' && !env.submitted && !v.lostSent && hooks && typeof hooks.submit === 'function') { v.lostSent = true; hooks.submit(); return true; }
      return false;
    }
    v.anim.t += dt;
    if (v.anim.t >= animTotal(v.anim)) { v.angle = v.anim.a1; v.anim = null; return true; }
    return true;
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const tf = g.getTransform ? g.getTransform() : { a: 1, b: 0 };
    const dpr = Math.hypot(tf.a, tf.b) || 1;
    const sc = Math.min(2, Math.max(1, Math.round(dpr * 2) / 2));
    const look = env.style ? env.assets && env.assets.mazeLook : null, Gm = geoM(m), TP = look ? look.tray : null;
    g.save(); g.translate(br.x, br.y);
    const wall = look ? wallImage(BOARD.w, BOARD.h, sc, look) : wallImage(BOARD.w, BOARD.h, sc);
    if (wall && g.drawImage) g.drawImage(wall, 0, 0, BOARD.w, BOARD.h);
    else { g.fillStyle = '#ebe6dd'; g.fillRect(0, 0, BOARD.w, BOARD.h); }
    drawTrayBack(g, TP);
    const P = pose(st, m);
    const S = GEO.S;
    g.save();
    g.translate(CX, CY); g.rotate(P.angle * Math.PI / 180);
    g.save();
    g.shadowColor = 'rgba(55,38,22,.42)'; g.shadowBlur = 16 * dpr;
    if (look) {
      const th = -P.angle * Math.PI / 180, ox = look.boardShadow[0], oy = look.boardShadow[1];
      g.shadowOffsetX = (ox * Math.cos(th) - oy * Math.sin(th)) * dpr; g.shadowOffsetY = (ox * Math.sin(th) + oy * Math.cos(th)) * dpr;
    } else { g.shadowOffsetX = 5 * dpr; g.shadowOffsetY = 9 * dpr; }
    rr(g, -S / 2 + 1, -S / 2 + 1, S - 2, S - 2, 5); g.fillStyle = look ? look.boardBack : '#6b4a30'; g.fill();
    g.restore();
    const A = look ? litBoard(m, P.rotA, sc, look) : litBoard(m, P.rotA, sc), B = P.mix > 0 && P.rotB !== P.rotA ? (look ? litBoard(m, P.rotB, sc, look) : litBoard(m, P.rotB, sc)) : null;
    if (A && g.drawImage) {
      g.imageSmoothingEnabled = true;
      g.drawImage(A, -S / 2, -S / 2, S, S);
      if (B) { g.globalAlpha = P.mix; g.drawImage(B, -S / 2, -S / 2, S, S); g.globalAlpha = 1; }
    }
    g.restore();
    const b = P.ball;
    if (b.kind === 'board') {
      const [x, y] = toScreen(b.p, P.angle);
      drawBallShadow(g, x, y, Gm, look); drawBall(g, sc, x, y, 1, 0, Gm, look);
    } else if (b.kind === 'pit') {
      const [x, y] = toScreen(b.p, P.angle);
      g.save(); g.beginPath(); g.arc(x, y, Gm.RH + 0.3, 0, Math.PI * 2); g.clip();
      drawBall(g, sc, x + 0.8 * b.k, y + 1.2 * b.k, 1 - 0.14 * b.k, 0.36 * b.k, Gm, look);
      g.restore();
    } else if (b.kind === 'free') {
      drawBall(g, sc, b.x, b.y, 1, 0, Gm, look);
    } else {
      drawBall(g, sc, b.x, trayY(m), 1, 0, Gm, look);
    }
    drawTrayLip(g, TP);
    const lost = st.status === 'pit';
    drawButtons(g, lost);
    if (lost && settled(st)) drawLostBanner(g);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    if (env && env.state && env.state.status === 'pit') return [];
    const R = btnRects();
    for (let i = 0; i < 2; i++) {
      const b = R[i];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) return [{ op: 'turn', dir: i === 1 ? 'cw' : 'ccw' }];
    }
    return [];
  },

  footerStatus(env) {
    const st = env && env.state;
    if (!st || !st.turns) return 'Turn the board with the buttons';
    if (st.status === 'pit' && settled(st)) return 'Failed: the ball fell into a hole';
    return `Turned ${st.turns} time${st.turns > 1 ? 's' : ''}`;
  },
};
