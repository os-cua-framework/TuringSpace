import { drawPromptText, UI_FONT, rr } from '../core/panel.js';

const BOARD = { w: 380, h: 292 };
const HARD = Object.freeze({ maxH: 3, maxRandomPass: 0.01 });
const CELL = 42, PG = { x: 46, y: 140 };
const ISO = { s: 23, ox: 238, oy: 236 };
const VIEW_SQ = 18;
const CUBE = { top: '#f0c75a', left: '#d9a63a', right: '#b8862a', edge: '#6b4e17' };

export const frontView = (H) => [0, 1, 2].map((j) => Math.max(H[0][j], H[1][j], H[2][j]));
export const rightView = (H) => [0, 1, 2].map((i) => Math.max(...H[i]));
const eq = (a, b) => a.every((v, k) => v === b[k]);
const rev = (a) => a.slice().reverse();

export function countFields(F, S) {
  let total = 0;
  for (let A = 0; A < 8; A++) for (let B = 0; B < 8; B++) {
    let prod = 1;
    for (let i = 0; i < 3 && prod; i++) for (let j = 0; j < 3; j++) {
      const u = Math.min(S[i], F[j]);
      let n = u + 1;
      const ra = (A >> i) & 1 && S[i] === u, cb = (B >> j) & 1 && F[j] === u;
      if (ra || cb) n -= 1;
      prod *= n;
      if (!prod) break;
    }
    const sign = ((popc(A) + popc(B)) & 1) ? -1 : 1;
    total += sign * prod;
  }
  return total;
}
const popc = (x) => (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1);

function viewsOk(F, S) {
  if (Math.max(...F) !== Math.max(...S) || Math.max(...F) < 2) return false;
  if (eq(F, rev(F)) || eq(S, rev(S))) return false;
  if (eq(F, S) || eq(F, rev(S))) return false;
  return countFields(F, S) / 4 ** 9 <= HARD.maxRandomPass;
}

const FB_VIEWS = ['front', 'back'], SIDE_VIEWS = ['right', 'left'];
const VIEW_TITLE = { front: 'Front view', back: 'Back view', right: 'Right-side view', left: 'Left-side view' };
const viewsValid = (v) => Array.isArray(v) && v.length === 2 && FB_VIEWS.includes(v[0]) && SIDE_VIEWS.includes(v[1]);
export const shownViews = (m) => {
  const v = m.views || ['front', 'right'];
  return [v[0] === 'back' ? rev(m.front) : m.front.slice(), v[1] === 'left' ? rev(m.right) : m.right.slice()];
};

function generate(rng, knobs) {
  for (let att = 0; att < 2000; att++) {
    const H = [0, 1, 2].map(() => [0, 1, 2].map(() => (rng.raw() < 0.35 ? 0 : rng.int(1, HARD.maxH))));
    const F = frontView(H), S = rightView(H);
    if (!viewsOk(F, S)) continue;
    const m = { task: 'build_from_two_views', board: BOARD, front: F, right: S, pRandom: +(countFields(F, S) / 4 ** 9).toFixed(5) };
    if (!(knobs && knobs.ext)) m.views = [rng.pick(FB_VIEWS), rng.pick(SIDE_VIEWS)];
    return m;
  }
  throw new Error('build_from_two_views: no instance');
}

function drawSilhouette(g, x0, y0, title, heights, leftLab, rightLab) {
  const w = 3 * VIEW_SQ, base = y0 + 22 + 3 * VIEW_SQ, cx = x0 + 80;
  g.fillStyle = '#ffffff'; rr(g, x0, y0, 160, 98, 8); g.fill();
  g.strokeStyle = '#c9ced6'; g.lineWidth = 1; rr(g, x0, y0, 160, 98, 8); g.stroke();
  g.fillStyle = '#333b44'; g.font = `700 12.5px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText(title, cx, y0 + 5);
  const gx = cx - w / 2;
  g.strokeStyle = '#e3e6ea'; g.lineWidth = 1;
  for (let k = 0; k <= 3; k++) { g.beginPath(); g.moveTo(gx + k * VIEW_SQ, base); g.lineTo(gx + k * VIEW_SQ, base - 3 * VIEW_SQ); g.stroke(); g.beginPath(); g.moveTo(gx, base - k * VIEW_SQ); g.lineTo(gx + w, base - k * VIEW_SQ); g.stroke(); }
  heights.forEach((h, k) => {
    for (let z = 0; z < h; z++) {
      g.fillStyle = '#4a5260'; g.fillRect(gx + k * VIEW_SQ, base - (z + 1) * VIEW_SQ, VIEW_SQ, VIEW_SQ);
      g.strokeStyle = '#a7afbb'; g.lineWidth = 1; g.strokeRect(gx + k * VIEW_SQ + .5, base - (z + 1) * VIEW_SQ + .5, VIEW_SQ - 1, VIEW_SQ - 1);
    }
  });
  g.strokeStyle = '#333b44'; g.lineWidth = 2; g.beginPath(); g.moveTo(gx - 14, base + 1); g.lineTo(gx + w + 14, base + 1); g.stroke();
  if (leftLab == null) return;
  g.fillStyle = '#6b7684'; g.font = `600 10.5px ${UI_FONT}`; g.textBaseline = 'top';
  g.textAlign = 'right'; g.fillText(leftLab, gx + 4, base + 5);
  g.textAlign = 'left'; g.fillText(rightLab, gx + w - 4, base + 5);
}

function isoPt(x, y, z) {
  const cx = ISO.s * 0.866, cy = ISO.s * 0.5;
  return [ISO.ox + (x + y) * cx, ISO.oy + (x - y) * cy - z * ISO.s];
}
function poly(g, pts, fill, stroke) {
  g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}
function drawIso(g, H) {
  poly(g, [isoPt(0, 0, 0), isoPt(3, 0, 0), isoPt(3, 3, 0), isoPt(0, 3, 0)], '#dfe3e8', '#8f98a5');
  g.strokeStyle = '#b4bcc7'; g.lineWidth = 1;
  for (let k = 1; k < 3; k++) {
    g.beginPath(); g.moveTo(...isoPt(k, 0, 0)); g.lineTo(...isoPt(k, 3, 0)); g.stroke();
    g.beginPath(); g.moveTo(...isoPt(0, k, 0)); g.lineTo(...isoPt(3, k, 0)); g.stroke();
  }
  g.fillStyle = '#6b7684'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fl = isoPt(1.5, -0.45, 0); g.save(); g.translate(fl[0], fl[1] + 4); g.rotate(Math.atan2(0.5, 0.866)); g.fillText('FRONT', 0, 0); g.restore();
  const rl = isoPt(3.45, 1.5, 0); g.save(); g.translate(rl[0] + 4, rl[1]); g.rotate(-Math.atan2(0.5, 0.866)); g.fillText('RIGHT', 0, 0); g.restore();
  const cells = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([i, j]);
  cells.sort((a, b) => (b[0] - b[1]) - (a[0] - a[1]));
  for (const [i, j] of cells) for (let z = 0; z < H[i][j]; z++) {
    const x = j, y = i;
    poly(g, [isoPt(x, y, z + 1), isoPt(x + 1, y, z + 1), isoPt(x + 1, y + 1, z + 1), isoPt(x, y + 1, z + 1)], CUBE.top, CUBE.edge);
    poly(g, [isoPt(x, y, z), isoPt(x + 1, y, z), isoPt(x + 1, y, z + 1), isoPt(x, y, z + 1)], CUBE.left, CUBE.edge);
    poly(g, [isoPt(x + 1, y, z), isoPt(x + 1, y + 1, z), isoPt(x + 1, y + 1, z + 1), isoPt(x + 1, y, z + 1)], CUBE.right, CUBE.edge);
  }
}
const planCell = (i, j) => ({ x: PG.x + j * CELL, y: PG.y + (2 - i) * CELL });

const task = {
  meta: {
    name: 'build_from_two_views', family: 'B', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'tap', row: '0..2 (0 = FRONT row)', col: '0..2 (0 = LEFT column)', note: 'adds one cube; 3 -> 0' }],
    promptHuman: 'Stack cubes so the {front|back} and {right|left} views match',
  },
  generate(rng, level, index, knobs) { return generate(rng, knobs); },
  init() { return { H: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], taps: 0 }; },
  applyAction(s, a) {
    if (a?.op !== 'tap' || ![0, 1, 2].includes(a.row) || ![0, 1, 2].includes(a.col)) return { ok: false, reason: 'bad-action' };
    s.H[a.row][a.col] = (s.H[a.row][a.col] + 1) % (HARD.maxH + 1); s.taps++;
    return { ok: true };
  },
  verify(s, m) {
    const F = frontView(s.H), S = rightView(s.H);
    const okF = eq(F, m.front), okS = eq(S, m.right);
    const hit = F.filter((v, k) => v === m.front[k]).length + S.filter((v, k) => v === m.right[k]).length;
    return { success: okF && okS, partial: hit / 6, error: 6 - hit, detail: { front: F, right: S, cubes: s.H.flat().reduce((a, b) => a + b, 0) } };
  },
  oracle(m) {
    const acts = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < Math.min(m.front[j], m.right[i]); k++) acts.push({ op: 'tap', row: i, col: j });
    return acts;
  },
  randomPolicy(m, rnd) {
    const acts = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const k = Math.floor(rnd() * (HARD.maxH + 1)); for (let t = 0; t < k; t++) acts.push({ op: 'tap', row: i, col: j }); }
    return acts;
  },
  drawPrompt(g, r, env) {
    const v = (env && env.manifest && env.manifest.views) || ['front', 'right'];
    drawPromptText(g, r, `Stack cubes so the ${v[0]} and ${v[1]} views match`, 'Tap a square on the plan to add a cube (after 3 it empties)');
  },
  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    if (m.views) {
      const [a, b] = shownViews(m);
      drawSilhouette(g, 16, 4, VIEW_TITLE[m.views[0]], a);
      drawSilhouette(g, 204, 4, VIEW_TITLE[m.views[1]], b);
    } else {
      drawSilhouette(g, 16, 4, 'Front view', m.front, 'left', 'right');
      drawSilhouette(g, 204, 4, 'Right-side view', m.right, 'front', 'back');
    }
    g.fillStyle = '#333b44'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('Plan (tap)', 6, PG.y - 15);
    g.fillStyle = '#6b7684'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FRONT', PG.x + 1.5 * CELL, PG.y + 3 * CELL + 9);
    if (!m.views) {
      g.fillText('BACK', PG.x + 1.5 * CELL, PG.y - 8);
      g.save(); g.translate(PG.x - 10, PG.y + 1.5 * CELL); g.rotate(-Math.PI / 2); g.fillText('LEFT', 0, 0); g.restore();
      g.save(); g.translate(PG.x + 3 * CELL + 10, PG.y + 1.5 * CELL); g.rotate(Math.PI / 2); g.fillText('RIGHT', 0, 0); g.restore();
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const { x, y } = planCell(i, j), h = s.H[i][j];
      g.fillStyle = h ? ['#fbeec8', '#f5d98a', '#eec254'][h - 1] : '#ffffff';
      g.fillRect(x, y, CELL, CELL);
      g.strokeStyle = '#8f98a5'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
      if (h) { g.fillStyle = '#5a4312'; g.font = `800 17px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(h), x + CELL / 2, y + CELL / 2 + 1); }
    }
    g.fillStyle = '#333b44'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('Your build (3D)', 206, PG.y - 15);
    drawIso(g, s.H);
    g.restore();
  },
  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const j = Math.floor((e.x - PG.x) / CELL), r = Math.floor((e.y - PG.y) / CELL);
    if (j < 0 || j > 2 || r < 0 || r > 2) return [];
    return [{ op: 'tap', row: 2 - r, col: j }];
  },
  footerStatus(env) { const n = env.state.H.flat().reduce((a, b) => a + b, 0); return n ? `${n} cube${n > 1 ? 's' : ''} placed` : 'Tap the plan to add cubes'; },
};
export default task;

export function gate(m) {
  if (!m || m.task !== 'build_from_two_views' || !viewsOk(m.front, m.right)) return false;
  if (m.views !== undefined && !viewsValid(m.views)) return false;
  const H = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Math.min(m.front[j], m.right[i])));
  return eq(frontView(H), m.front) && eq(rightView(H), m.right);
}
