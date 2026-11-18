import { drawPromptText, UI_FONT, rr } from '../core/panel.js';

const BOARD = { w: 380, h: 262 };
const HARD = Object.freeze({ minScramble: 5, maxScramble: 8, minDist: 5, samples: 7, minInk: 12, minDiff: 12 });
const T = 78, GAP = 3, SIDE = 3 * T + 2 * GAP;
const PX = 12, PY = 11;
const THUMB = { x: 272, y: 48, s: 96 };
const COLORS = ['#e04f4f', '#f29a2e', '#e8c53a', '#47a35a', '#2f86d6', '#7b52c7', '#d6559b', '#2bb3b1', '#6b4a35'];

function makeShape(rng, type, color) {
  const c = () => rng.uniform(0.35, 2.65);
  if (type === 'disc') return { type, color, cx: c(), cy: c(), r: rng.uniform(0.55, 0.95) };
  if (type === 'ring') return { type, color, cx: c(), cy: c(), r: rng.uniform(0.6, 0.9), w: 0.26 };
  if (type === 'tri') {
    const cx = c(), cy = c(), R0 = rng.uniform(0.8, 1.15), a0 = rng.uniform(0, Math.PI * 2);
    return { type, color, pts: [0, 1, 2].map((k) => [cx + R0 * Math.cos(a0 + k * 2.094), cy + R0 * Math.sin(a0 + k * 2.094)]) };
  }
  if (type === 'bar') {
    const vert = rng.raw() < 0.5, p = rng.uniform(0.4, 2.6), a = rng.uniform(0.1, 0.8), b = rng.uniform(2.2, 2.9);
    return { type, color, w: 0.34, pts: vert ? [[p, a], [p, b]] : [[a, p], [b, p]] };
  }
  const p0 = [rng.uniform(0.2, 2.8), rng.uniform(0.2, 2.8)];
  const ang = rng.uniform(0, Math.PI * 2), L1 = rng.uniform(0.9, 1.4), turn = rng.sign() * rng.uniform(0.5, 1.1), L2 = rng.uniform(0.8, 1.2);
  const p1 = [p0[0] + L1 * Math.cos(ang), p0[1] + L1 * Math.sin(ang)];
  const p2 = [p1[0] + L2 * Math.cos(ang + turn), p1[1] + L2 * Math.sin(ang + turn)];
  return { type: 'arrow', color, w: 0.24, pts: [p0, p1, p2], dir: ang + turn };
}

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const inTri = (p, [a, b, c]) => {
  const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
function arrowHead(sh) {
  const [x, y] = sh.pts[2], d = sh.dir, L = 0.42, W = 0.3;
  return [[x + L * Math.cos(d), y + L * Math.sin(d)], [x + W * Math.cos(d + 1.5708), y + W * Math.sin(d + 1.5708)], [x + W * Math.cos(d - 1.5708), y + W * Math.sin(d - 1.5708)]];
}
function covers(sh, p) {
  switch (sh.type) {
    case 'disc': return Math.hypot(p[0] - sh.cx, p[1] - sh.cy) <= sh.r;
    case 'ring': return Math.abs(Math.hypot(p[0] - sh.cx, p[1] - sh.cy) - sh.r) <= sh.w / 2;
    case 'tri': return inTri(p, sh.pts);
    case 'bar': return segDist(p, sh.pts[0], sh.pts[1]) <= sh.w / 2;
    case 'arrow': return segDist(p, sh.pts[0], sh.pts[1]) <= sh.w / 2 || segDist(p, sh.pts[1], sh.pts[2]) <= sh.w / 2 || inTri(p, arrowHead(sh));
  }
  return false;
}
function tileSignature(shapes, home) {
  const r0 = Math.floor(home / 3), c0 = home % 3, n = HARD.samples, sig = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const p = [c0 + (b + 0.5) / n, r0 + (a + 0.5) / n];
    let top = -1; shapes.forEach((sh, k) => { if (covers(sh, p)) top = k; });
    sig.push(top);
  }
  return sig;
}
function pictureOk(shapes, gapHome) {
  const sigs = [];
  for (let h = 0; h < 9; h++) {
    if (h === gapHome) continue;
    const s = tileSignature(shapes, h);
    if (s.filter((v) => v >= 0).length < HARD.minInk) return false;
    sigs.push(s);
  }
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) {
    let d = 0; for (let k = 0; k < sigs[i].length; k++) if (sigs[i][k] !== sigs[j][k]) d++;
    if (d < HARD.minDiff) return false;
  }
  return true;
}

const SOLVED = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const nbrs = (c) => { const r = Math.floor(c / 3), q = c % 3, o = []; if (r > 0) o.push(c - 3); if (r < 2) o.push(c + 3); if (q > 0) o.push(c - 1); if (q < 2) o.push(c + 1); return o; };
const isSolved = (b) => b.every((v, i) => v === i);
const slide = (b, cell, gh) => { const g = b.indexOf(gh); if (!nbrs(g).includes(cell)) return null; const n = b.slice(); n[g] = n[cell]; n[cell] = gh; return n; };
export function solvePath(start, gh, maxDepth = 12) {
  const key = (b) => b.join('');
  if (isSolved(start)) return [];
  const prev = new Map([[key(start), null]]); let frontier = [start];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const b of frontier) {
      const g = b.indexOf(gh);
      for (const c of nbrs(g)) {
        const n = slide(b, c, gh), k = key(n);
        if (prev.has(k)) continue;
        prev.set(k, { from: key(b), cell: c });
        if (isSolved(n)) {
          const path = []; let cur = k;
          while (prev.get(cur)) { path.push(prev.get(cur).cell); cur = prev.get(cur).from; }
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

function generate(rng) {
  for (let att = 0; att < 400; att++) {
    const nShapes = rng.int(4, 5);
    const types = rng.shuffle(['disc', 'ring', 'tri', 'bar', 'arrow', 'disc', 'tri']).slice(0, nShapes);
    if (!types.includes('arrow') && !types.includes('bar')) types[0] = 'arrow';
    const cols = rng.shuffle(COLORS.slice());
    const gapHome = rng.int(0, 8);
    const shapes = types.map((t, k) => round3(makeShape(rng, t, cols[k])));
    if (!pictureOk(shapes, gapHome)) continue;
    const k = rng.int(HARD.minScramble, HARD.maxScramble);
    let b = SOLVED.slice(), last = -1;
    for (let i = 0; i < k; i++) {
      const g = b.indexOf(gapHome);
      const opts = nbrs(g).filter((c) => c !== last);
      const c = rng.pick(opts);
      b = slide(b, c, gapHome); last = g;
    }
    const path = solvePath(b, gapHome, HARD.maxScramble);
    if (!path || path.length < HARD.minDist) continue;
    const hue = rng.int(0, 359);
    return {
      task: 'sliding_tile_short', board: BOARD, shapes, gapHome, start: b, solution: path,
      bg: [`hsl(${hue},45%,92%)`, `hsl(${(hue + 40) % 360},40%,80%)`],
    };
  }
  throw new Error('sliding_tile_short: no instance');
}
function round3(sh) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const o = { ...sh };
  for (const k of ['cx', 'cy', 'r', 'w', 'dir']) if (typeof o[k] === 'number') o[k] = r(o[k]);
  if (o.pts) o.pts = o.pts.map((p) => p.map(r));
  return o;
}

function drawPicture(g, m, S) {
  const u = S / 3;
  const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, m.bg[0]); grd.addColorStop(1, m.bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const P = (p) => [p[0] * u, p[1] * u];
  for (const sh of m.shapes) {
    g.fillStyle = sh.color; g.strokeStyle = sh.color; g.lineCap = 'round'; g.lineJoin = 'round';
    if (sh.type === 'disc') { g.beginPath(); g.arc(sh.cx * u, sh.cy * u, sh.r * u, 0, 7); g.fill(); }
    else if (sh.type === 'ring') { g.lineWidth = sh.w * u; g.beginPath(); g.arc(sh.cx * u, sh.cy * u, sh.r * u, 0, 7); g.stroke(); }
    else if (sh.type === 'tri') { g.beginPath(); sh.pts.map(P).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    else if (sh.type === 'bar') { g.lineWidth = sh.w * u; g.lineCap = 'butt'; g.beginPath(); g.moveTo(...P(sh.pts[0])); g.lineTo(...P(sh.pts[1])); g.stroke(); }
    else if (sh.type === 'arrow') {
      g.lineWidth = sh.w * u; g.beginPath(); sh.pts.map(P).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.beginPath(); arrowHead(sh).map(P).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    }
  }
}
const cellXY = (c) => ({ x: PX + (c % 3) * (T + GAP), y: PY + Math.floor(c / 3) * (T + GAP) });

export default {
  meta: {
    name: 'sliding_tile_short', family: 'B', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'slide', cell: '0..8 (row-major cell of a tile next to the empty cell; it slides into the gap)' }],
    promptHuman: 'Slide the tiles to rebuild the picture',
  },
  generate(rng) { return generate(rng); },
  init(m) { return { b: m.start.slice(), moves: 0 }; },
  applyAction(s, a, m) {
    if (a?.op !== 'slide' || !Number.isInteger(a.cell) || a.cell < 0 || a.cell > 8) return { ok: false, reason: 'bad-action' };
    const n = slide(s.b, a.cell, m.gapHome);
    if (!n) return { ok: false, reason: 'not-next-to-gap' };
    s.b = n; s.moves++;
    return { ok: true };
  },
  verify(s, m) {
    const home = s.b.filter((v, i) => v === i && v !== m.gapHome).length;
    const success = isSolved(s.b);
    return { success, partial: home / 8, error: 8 - home, detail: { tilesHome: home, moves: s.moves } };
  },
  oracle(m) { return m.solution.map((cell) => ({ op: 'slide', cell })); },
  randomPolicy(m, rnd) { return Array.from({ length: 30 }, () => ({ op: 'slide', cell: Math.floor(rnd() * 9) })); },
  drawPrompt(g, r) { drawPromptText(g, r, 'Slide the tiles to rebuild the picture', 'Tap a tile next to the empty square to slide it; match the Goal'); },
  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    g.fillStyle = '#4a4f57'; rr(g, PX - 6, PY - 6, SIDE + 12, SIDE + 12, 8); g.fill();
    for (let c = 0; c < 9; c++) {
      const { x, y } = cellXY(c), t = s.b[c];
      if (t === m.gapHome) { g.fillStyle = '#2e3238'; rr(g, x, y, T, T, 4); g.fill(); continue; }
      g.save(); rr(g, x, y, T, T, 4); g.clip();
      g.translate(x - (t % 3) * T, y - Math.floor(t / 3) * T);
      drawPicture(g, m, 3 * T);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; rr(g, x + .75, y + .75, T - 1.5, T - 1.5, 4); g.stroke();
    }
    const { x: tx, y: ty, s: ts } = THUMB;
    g.fillStyle = '#333b44'; g.font = `700 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText('Goal', tx + ts / 2, ty - 7);
    g.fillStyle = '#ffffff'; rr(g, tx - 4, ty - 4, ts + 8, ts + 8, 6); g.fill();
    g.strokeStyle = '#b9bec6'; g.lineWidth = 1; rr(g, tx - 4, ty - 4, ts + 8, ts + 8, 6); g.stroke();
    g.save(); g.translate(tx, ty); g.beginPath(); g.rect(0, 0, ts, ts); g.clip(); drawPicture(g, m, ts);
    g.fillStyle = '#2e3238'; g.fillRect(((m.gapHome % 3) * ts) / 3, (Math.floor(m.gapHome / 3) * ts) / 3, ts / 3, ts / 3);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1;
    for (const k of [1, 2]) { g.beginPath(); g.moveTo((k * ts) / 3, 0); g.lineTo((k * ts) / 3, ts); g.moveTo(0, (k * ts) / 3); g.lineTo(ts, (k * ts) / 3); g.stroke(); }
    g.restore();
    g.fillStyle = '#8b97a3'; g.font = `11px ${UI_FONT}`; g.textBaseline = 'top';
    g.fillText('the empty square', tx + ts / 2, ty + ts + 10);
    g.fillText('ends where it is dark', tx + ts / 2, ty + ts + 24);
    g.restore();
  },
  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const col = Math.floor((e.x - PX) / (T + GAP)), row = Math.floor((e.y - PY) / (T + GAP));
    if (col < 0 || col > 2 || row < 0 || row > 2) return [];
    const cell = row * 3 + col;
    return slide(env.state.b, cell, env.manifest.gapHome) ? [{ op: 'slide', cell }] : [];
  },
  footerStatus(env) { const n = env.state.moves; return n ? `${n} slide${n > 1 ? 's' : ''}` : 'Tap a tile next to the gap'; },
};

export function gate(m) {
  if (!m || m.task !== 'sliding_tile_short' || !pictureOk(m.shapes, m.gapHome)) return false;
  const p = solvePath(m.start, m.gapHome, HARD.maxScramble);
  return !!p && p.length >= HARD.minDist && p.length <= HARD.maxScramble && p.length === m.solution.length;
}
