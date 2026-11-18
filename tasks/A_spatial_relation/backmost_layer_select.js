import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { kindTexPairs, primaryOf, detail, tinted, natural, pat, KINDS, isoTex, meanHex, lumOf, pickSplit } from '../common/_block_mat.js';

const NAME = 'backmost_layer_select';
const COLS = 4, ROWS = 3;
const CELL = 106, GAP = 5, MARGIN = 6, NCELL = COLS * ROWS;
const BOARD = { w: 2 * MARGIN + COLS * CELL + (COLS - 1) * GAP, h: 2 * MARGIN + ROWS * CELL + (ROWS - 1) * GAP };
const PAD = 4;
const STEP = 2;
const EVIDENCE = 15;
const EDGE = 22;
const VIS = { back: [0.30, 0.60], mid: [0.36, 0.78] };
const PERIM = { back: 0.40, mid: 0.45, circle: 0.50 };
const BAL = { vis: 0.04, far: 4 };
const SCALE = [24, 28.5];
const ROT = 22;
const K = [3, 6];

export const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'cross'];
const COLORS = ['#e0524f', '#f0ad2e', '#3fae62', '#2bb8c8', '#3b6fd4', '#9a5fd0', '#ec6fb0'];
const CLASH = new Set(['0,6', '3,4', '4,5', '5,6']);
const PATTERNS = ['solid', 'stripes', 'dots', 'checker', 'bars'];

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function rawShape(type) {
  const P = [], K = [];
  const pt = (x, y) => ({ x, y });
  if (type === 'circle') for (let i = 0; i < 60; i++) { const a = (2 * Math.PI * i) / 60; P.push(pt(Math.cos(a), Math.sin(a))); }
  else if (type === 'square') { P.push(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)); K.push(...P); }
  else if (type === 'triangle') { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (2 * Math.PI * i) / 3; P.push(pt(Math.cos(a), Math.sin(a))); } K.push(...P); }
  else if (type === 'star') {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 5, r = i % 2 ? 0.47 : 1; P.push(pt(r * Math.cos(a), r * Math.sin(a))); }
    K.push(...P.filter((_, i) => i % 2 === 0));
  } else if (type === 'heart') {
    for (let i = 0; i < 64; i++) {
      const t = (2 * Math.PI * i) / 64;
      P.push(pt(16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))));
    }
    K.push(pt(0, -5), pt(0, 17));
  } else if (type === 'cross') {
    const a = 0.34;
    [[-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a], [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a]]
      .forEach(([x, y]) => P.push(pt(x, y)));
    K.push(pt(a, a), pt(-a, a), pt(a, -a), pt(-a, -a));
  }
  return { P, K };
}
const UNIT = Object.fromEntries(SHAPES.map((type) => {
  const { P, K } = rawShape(type);
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = a.x * b.y - b.x * a.y;
    A += c; cx += (a.x + b.x) * c; cy += (a.y + b.y) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  const maxR = Math.max(...P.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  const k = 0.9 / (0.5 * Math.sqrt(Math.abs(A) / Math.PI) + 0.5 * maxR);
  const f = (p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k });
  return [type, { P: P.map(f), K: K.map(f) }];
}));
const KEY_NEED = { circle: 0, square: 2, triangle: 2, star: 3, heart: 1, cross: 2 };

function place(s) {
  const a = (s.rot * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  const f = (p) => ({ x: s.x + s.s * (c * p.x - n * p.y), y: s.y + s.s * (n * p.x + c * p.y) });
  const P = UNIT[s.type].P.map(f), K = UNIT[s.type].K.map(f);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { P, K, box: { x0, x1, y0, y1 }, c: { x: s.x, y: s.y } };
}
function inside(poly, x, y) {
  if (x < poly.box.x0 || x > poly.box.x1 || y < poly.box.y0 || y > poly.box.y1) return false;
  const P = poly.P;
  let hit = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)) hit = !hit;
  }
  return hit;
}
function outline(poly, n = 120) {
  const P = poly.P, L = [];
  let tot = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const l = Math.hypot(b.x - a.x, b.y - a.y); L.push(l); tot += l; }
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = ((k + 0.5) / n) * tot, i = 0;
    while (d > L[i]) { d -= L[i]; i++; }
    const a = P[i], b = P[(i + 1) % P.length], t = d / L[i];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.step = tot / n;
  return out;
}
function crossEdge(U, L, covers) {
  const o = outline(U, 240);
  return o.filter((p) => inside(L, p.x, p.y) && !covers.some((C) => inside(C, p.x, p.y))).length * o.step;
}

export function analyseCell(shapes) {
  const [B, M, F] = shapes.map(place);
  const n = { aB: 0, aM: 0, vB: 0, vM: 0, oBM: 0, cBM: 0, oMF: 0, cBF: 0 };
  const x0 = Math.min(B.box.x0, M.box.x0, F.box.x0), x1 = Math.max(B.box.x1, M.box.x1, F.box.x1);
  const y0 = Math.min(B.box.y0, M.box.y0, F.box.y0), y1 = Math.max(B.box.y1, M.box.y1, F.box.y1);
  for (let y = Math.floor(y0 / STEP) * STEP + STEP / 2; y <= y1; y += STEP) {
    for (let x = Math.floor(x0 / STEP) * STEP + STEP / 2; x <= x1; x += STEP) {
      const b = inside(B, x, y), m = inside(M, x, y), f = inside(F, x, y);
      if (b) { n.aB++; if (!m && !f) n.vB++; }
      if (m) { n.aM++; if (!f) n.vM++; }
      if (b && m) { n.oBM++; if (!f) n.cBM++; }
      if (m && f) n.oMF++;
      if (b && f && !m) n.cBF++;
    }
  }
  const perimB = outline(B), perimM = outline(M);
  const pB = perimB.filter((p) => !inside(M, p.x, p.y) && !inside(F, p.x, p.y)).length / perimB.length;
  const pM = perimM.filter((p) => !inside(F, p.x, p.y)).length / perimM.length;
  const keyVis = (S, covers) => S.K.filter((k) => {
    const dx = S.c.x - k.x, dy = S.c.y - k.y, d = Math.hypot(dx, dy) || 1;
    return [2, 4.5].every((t) => { const q = { x: k.x + (dx / d) * t, y: k.y + (dy / d) * t }; return !covers.some((C) => inside(C, q.x, q.y)); });
  }).length;
  const allP = [...B.P, ...M.P, ...F.P];
  return {
    visB: n.vB / Math.max(1, n.aB), visM: n.vM / Math.max(1, n.aM),
    cBM: n.cBM, oMF: n.oMF, cBF: n.cBF, pB, pM,
    keyB: keyVis(B, [M, F]), keyM: keyVis(M, [F]),
    eBM: crossEdge(M, B, [F]), eBF: crossEdge(F, B, [M]), eMF: crossEdge(F, M, []),
    dBF: Math.hypot(B.c.x - F.c.x, B.c.y - F.c.y), dMF: Math.hypot(M.c.x - F.c.x, M.c.y - F.c.y),
    ext: { x0: Math.min(...allP.map((p) => p.x)), x1: Math.max(...allP.map((p) => p.x)), y0: Math.min(...allP.map((p) => p.y)), y1: Math.max(...allP.map((p) => p.y)) },
  };
}
function identityOk(type, key, perim, need) {
  if (perim < need) return false;
  if (type === 'circle') return perim >= PERIM.circle;
  return key >= KEY_NEED[type];
}
export function cellProblems(shapes, a = analyseCell(shapes)) {
  const bad = [];
  if (a.ext.x0 < PAD || a.ext.y0 < PAD || a.ext.x1 > CELL - PAD || a.ext.y1 > CELL - PAD) bad.push('bounds');
  if (a.visB < VIS.back[0] || a.visB > VIS.back[1]) bad.push('visB');
  if (a.visM < VIS.mid[0] || a.visM > VIS.mid[1]) bad.push('visM');
  if (a.cBM < EVIDENCE) bad.push('mid-over-back not visible');
  if (a.cBF < EVIDENCE) bad.push('front-over-back not visible');
  if (a.oMF < EVIDENCE) bad.push('front-over-mid not visible');
  if (Math.min(a.eBM, a.eBF, a.eMF) < EDGE) bad.push('crossing edge too short');
  if (!identityOk(shapes[0].type, a.keyB, a.pB, PERIM.back)) bad.push('back identity');
  if (!identityOk(shapes[1].type, a.keyM, a.pM, PERIM.mid)) bad.push('mid identity');
  const near = cellKind(a);
  if (!near) bad.push('near/less-visible disagree or tie');
  return bad;
}
export function cellKind(a) {
  const vis = a.visB <= a.visM - BAL.vis ? 'back' : a.visM <= a.visB - BAL.vis ? 'mid' : null;
  const near = a.dBF <= a.dMF - BAL.far ? 'back' : a.dMF <= a.dBF - BAL.far ? 'mid' : null;
  return vis && vis === near ? near : null;
}

const PROPOSAL = { back: { dN: [0.45, 0.9], dF: [0.7, 1.25], psi: [45, 85] }, mid: { dN: [0.45, 1.1], dF: [0.7, 1.25], psi: [45, 110] } };
function makeCell(rng, types, colors, patterns) {
  const kind = rng.pick(['back', 'mid']);
  const P = PROPOSAL[kind], pivot = kind === 'back' ? 0 : 1, other = 1 - pivot;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const sh = types.map((type, i) => ({ type, s: r2(rng.uniform(...SCALE)), rot: r1(rng.uniform(-ROT, ROT)), x: 0, y: 0, color: colors[i], pattern: patterns[i] }));
    const rb = (0.9 * (sh[0].s + sh[1].s + sh[2].s)) / 3;
    const dN = rng.uniform(...P.dN) * rb, dF = rng.uniform(...P.dF) * rb;
    const a1 = rng.uniform(0, 2 * Math.PI), a2 = a1 + rng.sign() * rng.uniform(...P.psi) * (Math.PI / 180);
    sh[2].x = dN * Math.cos(a1); sh[2].y = dN * Math.sin(a1);
    sh[other].x = dF * Math.cos(a2); sh[other].y = dF * Math.sin(a2);
    const pl = sh.map(place);
    const x0 = Math.min(...pl.map((p) => p.box.x0)), x1 = Math.max(...pl.map((p) => p.box.x1));
    const y0 = Math.min(...pl.map((p) => p.box.y0)), y1 = Math.max(...pl.map((p) => p.box.y1));
    const slackX = CELL - 2 * PAD - 1 - (x1 - x0), slackY = CELL - 2 * PAD - 1 - (y1 - y0);
    if (slackX < 0 || slackY < 0) continue;
    const ox = PAD + 0.5 - x0 + rng.uniform(0, slackX), oy = PAD + 0.5 - y0 + rng.uniform(0, slackY);
    for (const s of sh) { s.x = r1(s.x + ox); s.y = r1(s.y + oy); }
    const a = analyseCell(sh);
    if (cellProblems(sh, a).length || cellKind(a) !== kind) continue;
    return sh;
  }
  return null;
}

function pickColors(rng) {
  for (;;) {
    const c = rng.sample([0, 1, 2, 3, 4, 5, 6], 3);
    const ok = c.every((a, i) => c.every((b, j) => j <= i || !CLASH.has(`${Math.min(a, b)},${Math.max(a, b)}`)));
    if (ok) return c;
  }
}
const midNeed = (k) => Math.max(2, Math.ceil((NCELL - k) / 2));
function roleCounts(k) {
  const rest = NCELL - k, mid = midNeed(k), front = Math.max(1, Math.round(rest * 0.3));
  return { back: k, mid, front, absent: rest - mid - front };
}
const cellRole = (cell, ref) => ['back', 'mid', 'front'][cell.shapes.findIndex((s) => s.type === ref)] || 'absent';

export function gate(m) {
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!SHAPES.includes(m.ref) || !Array.isArray(m.cells) || m.cells.length !== NCELL || !Array.isArray(m.answer)) return false;
  const roles = { back: 0, mid: 0, front: 0, absent: 0 };
  for (const cell of m.cells) {
    const sh = cell?.shapes;
    if (!Array.isArray(sh) || sh.length !== 3) return false;
    if (!sh.every((s) => SHAPES.includes(s.type) && PATTERNS.includes(s.pattern) && Number.isInteger(s.color) && s.color >= 0 && s.color < COLORS.length
      && s.s >= SCALE[0] && s.s <= SCALE[1] && Math.abs(s.rot) <= ROT && Number.isFinite(s.x) && Number.isFinite(s.y))) return false;
    if (new Set(sh.map((s) => s.type)).size !== 3 || new Set(sh.map((s) => s.color)).size !== 3 || new Set(sh.map((s) => s.pattern)).size !== 3) return false;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = sh[i].color, b = sh[j].color;
      if (CLASH.has(`${Math.min(a, b)},${Math.max(a, b)}`)) return false;
    }
    if (cellProblems(sh).length) return false;
    roles[cellRole(cell, m.ref)]++;
  }
  const want = m.cells.map((c, i) => (c.shapes[0].type === m.ref ? i : -1)).filter((i) => i >= 0);
  const got = [...m.answer].sort((a, b) => a - b);
  if (want.length !== got.length || want.some((v, i) => v !== got[i])) return false;
  if (want.length < K[0] || want.length > K[1]) return false;
  return roles.mid >= midNeed(want.length) && roles.front >= 1;
}

function cellRect(i) {
  const c = i % COLS, r = Math.floor(i / COLS);
  return { x: MARGIN + c * (CELL + GAP), y: MARGIN + r * (CELL + GAP), w: CELL, h: CELL };
}
const shadeHex = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.max(0, Math.min(255, v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};
function pathPoly(g, P) { g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
function drawPattern(g, kind, color, box) {
  if (kind === 'solid') return;
  g.fillStyle = color; g.strokeStyle = color;
  const { x0, x1, y0, y1 } = box;
  if (kind === 'stripes') {
    g.lineWidth = 3;
    g.beginPath();
    for (let t = x0 - (y1 - y0) - 8; t < x1 + 8; t += 8) { g.moveTo(t, y1 + 2); g.lineTo(t + (y1 - y0) + 4, y0 - 2); }
    g.stroke();
  } else if (kind === 'bars') {
    g.lineWidth = 3;
    g.beginPath();
    for (let y = y0 + 2; y < y1; y += 7) { g.moveTo(x0 - 2, y); g.lineTo(x1 + 2, y); }
    g.stroke();
  } else if (kind === 'dots') {
    for (let y = y0 + 3, row = 0; y < y1; y += 7, row++)
      for (let x = x0 + 3 + (row % 2) * 3.5; x < x1; x += 7) { g.beginPath(); g.arc(x, y, 1.7, 0, 2 * Math.PI); g.fill(); }
  } else if (kind === 'checker') {
    for (let y = y0, row = 0; y < y1; y += 6, row++)
      for (let x = x0 + (row % 2) * 6; x < x1; x += 12) g.fillRect(x, y, 6, 6);
  }
}
function drawShape(g, s) {
  const p = place(s), hex = COLORS[s.color];
  g.save();
  pathPoly(g, p.P);
  g.fillStyle = hex; g.fill();
  g.clip();
  drawPattern(g, s.pattern, shadeHex(hex, 0.74), p.box);
  g.restore();
  pathPoly(g, p.P);
  g.lineJoin = 'round'; g.lineWidth = 1.7; g.strokeStyle = '#262b33'; g.stroke();
}
function drawShapeStyled(g, s, L, k) {
  const p = place(s), hex = COLORS[s.color];
  g.save();
  pathPoly(g, p.P);
  const sc = L.scale[k % L.scale.length], rot = L.rot[k % L.rot.length];
  const c = Math.cos(rot) * sc, n = Math.sin(rot) * sc;
  g.fillStyle = pat(g, L.fills[s.color], c, n, -n, c, L.off[0] + k * 37, L.off[1] + k * 53); g.fill();
  g.clip();
  drawPattern(g, s.pattern, shadeHex(hex, 0.74), p.box);
  if (L.gloss) {
    const gr = g.createLinearGradient(p.box.x0, p.box.y0, p.box.x1, p.box.y1);
    gr.addColorStop(0, 'rgba(255,255,255,0.30)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = gr; g.fillRect(p.box.x0, p.box.y0, p.box.x1 - p.box.x0, p.box.y1 - p.box.y0);
  }
  g.restore();
  pathPoly(g, p.P);
  g.lineJoin = 'round'; g.lineWidth = 1.7; g.strokeStyle = '#262b33'; g.stroke();
}
async function mountLook(st) {
  const pairs = kindTexPairs(st, ['felt', 'paper', 'plastic', 'wood', 'leather', 'metal'], () => true, 'backmost_layer_select');
  const surf = st.pool('tex', (t) => (isoTex(t, 0.25, 0.3) || t.use === 'wood') && t.use !== 'metal' && lumOf(meanHex(t)) > 0.12);
  const [[kind, tex], stex] = primaryOf(st, 'g17_backmost', [pairs, surf]);
  st.note(`shape:${kind}:${tex.id}`); st.note(`surface:${stex.id}`);
  const det = await detail(tex.file, 128);
  const amp = Math.max(0.22, KINDS[kind].amp) * (0.8 + 0.4 * st.rand());
  const fills = COLORS.map((hex) => tinted(det, hex, amp));
  const CELL_TINTS = ['#e6bcbc', '#e8d8d4', '#eddbcf', '#dfd4c3', '#ede7cf', '#e8e8d4', '#dde6bc', '#e0e8d4', '#dbedcf', '#c9dfc3', '#cfedcf', '#d4e8d8', '#bce6cd', '#d4e8e0', '#cfede7', '#c3dfdf', '#cfe7ed', '#d4e0e8', '#bccde6', '#d4d8e8', '#cfcfed', '#c9c3df', '#dbcfed', '#e0d4e8', '#ddbce6', '#e8d4e8', '#edcfe7', '#dfc3d4', '#edcfdb', '#e8d4d8'];
  const cell = await natural(stex.file, { L: 0.7 + 0.22 * st.rand(), contrast: 0.25 + 0.15 * st.rand(), sat: 0.35, tint: pickSplit(st, 'g17_cell_tint', CELL_TINTS, 10), tintK: 0.6 });
  const scale = [0.35 + 0.3 * st.rand(), 0.35 + 0.3 * st.rand(), 0.35 + 0.3 * st.rand()];
  const rot = [st.rand() * Math.PI, st.rand() * Math.PI, st.rand() * Math.PI];
  return { kind, fills, cell, gloss: !!KINDS[kind].gloss || kind === 'metal', scale, rot, off: [st.rand() * 128, st.rand() * 128],
    cellScale: 0.6 + 0.5 * st.rand(), cellOff: [st.rand() * 256, st.rand() * 256], border: st.rand() < 0.5 ? 'rgba(60,50,40,0.35)' : 'rgba(255,255,255,0.7)' };
}

function drawRef(g, type, cx, cy, size) {
  const s = { type, s: size, rot: 0, x: cx, y: cy };
  const p = place(s);
  pathPoly(g, p.P);
  g.fillStyle = '#5d6875'; g.fill();
  g.lineJoin = 'round'; g.lineWidth = 1.5; g.strokeStyle = '#262b33'; g.stroke();
}

export default {
  meta: {
    name: NAME, family: 'A', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', cell: '0..11 (row-major 4 columns x 3 rows; tap again to unselect)' }],
    promptHuman: 'Tap cells where this shape is at the back',
  },

  generate(rng) {
    const ref = rng.pick(SHAPES);
    const k = rng.int(K[0], K[1]);
    const cnt = roleCounts(k);
    const roles = rng.shuffle([
      ...Array(cnt.back).fill('back'), ...Array(cnt.mid).fill('mid'),
      ...Array(cnt.front).fill('front'), ...Array(cnt.absent).fill('absent'),
    ]);
    const cells = roles.map((role) => {
      for (let tries = 0; tries < 12; tries++) {
        const o = rng.shuffle(SHAPES.filter((t) => t !== ref));
        const types = role === 'back' ? [ref, o[0], o[1]] : role === 'mid' ? [o[0], ref, o[1]]
          : role === 'front' ? [o[0], o[1], ref] : [o[0], o[1], o[2]];
        const shapes = makeCell(rng, types, pickColors(rng), rng.sample(PATTERNS, 3));
        if (shapes) return { shapes };
      }
      throw new Error(`${NAME}: cell sampler exhausted`);
    });
    const answer = roles.map((r, i) => (r === 'back' ? i : -1)).filter((i) => i >= 0);
    return { task: NAME, board: { ...BOARD }, ref, cells, answer };
  },

  init() { return { sel: new Array(NCELL).fill(false) }; },

  applyAction(state, a) {
    if (a?.op !== 'toggle' || !Number.isInteger(a.cell) || a.cell < 0 || a.cell >= NCELL) return { ok: false, reason: 'bad-action' };
    state.sel[a.cell] = !state.sel[a.cell];
    return { ok: true };
  },

  verify(state, m) {
    const want = new Set(m.answer);
    let right = 0, picked = 0, hits = 0;
    for (let i = 0; i < NCELL; i++) {
      if (state.sel[i]) { picked++; if (want.has(i)) hits++; }
      if (state.sel[i] === want.has(i)) right++;
    }
    const success = hits === want.size && picked === want.size;
    return { success, error: NCELL - right, partial: right / NCELL, detail: { selected: picked } };
  },

  oracle(m) { return m.answer.map((cell) => ({ op: 'toggle', cell })); },

  randomPolicy(m, rnd) {
    const acts = [];
    for (let cell = 0; cell < NCELL; cell++) if (rnd() < 0.5) acts.push({ op: 'toggle', cell });
    return acts;
  },

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r, env) {
    const box = { x: r.x + r.w - 46, y: r.y + (r.h - 46) / 2, w: 46, h: 46 };
    drawPromptText(g, { x: r.x, y: r.y, w: r.w - 54, h: r.h }, 'Tap cells where this shape is at the back',
      'The other two shapes cover it there');
    g.save();
    rr(g, box.x, box.y, box.w, box.h, 8);
    g.fillStyle = '#f6f8fa'; g.fill(); g.strokeStyle = '#d6dde4'; g.lineWidth = 1; g.stroke();
    if (env?.manifest?.ref) drawRef(g, env.manifest.ref, box.x + box.w / 2, box.y + box.h / 2, 17);
    g.restore();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    g.save();
    g.translate(br.x, br.y);
    g.fillStyle = '#e9edf2'; g.fillRect(0, 0, br.w, br.h);
    const L = env.assets?.look;
    m.cells.forEach((cell, i) => {
      const R = cellRect(i);
      g.save();
      rr(g, R.x, R.y, R.w, R.h, 7);
      if (L) { const k = L.cellScale; g.fillStyle = pat(g, L.cell, k, 0, 0, k, L.cellOff[0] - R.x * 0.3, L.cellOff[1] - R.y * 0.3); }
      else g.fillStyle = '#fbfcfd';
      g.fill();
      g.clip();
      g.translate(R.x, R.y);
      if (L) cell.shapes.forEach((s, k) => drawShapeStyled(g, s, L, i * 3 + k));
      else for (const s of cell.shapes) drawShape(g, s);
      g.restore();
      rr(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 7);
      g.strokeStyle = L ? L.border : '#d5dce4'; g.lineWidth = 1; g.stroke();
      if (state.sel[i]) {
        rr(g, R.x + 1.5, R.y + 1.5, R.w - 3, R.h - 3, 7);
        g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
        const bx = R.x + R.w - 11, by = R.y + 11;
        g.beginPath(); g.arc(bx, by, 8, 0, 2 * Math.PI); g.fillStyle = ACCENT; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(bx - 3.6, by + 0.2); g.lineTo(bx - 1, by + 2.8); g.lineTo(bx + 3.8, by - 2.6); g.stroke();
        g.lineCap = 'butt';
      }
    });
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    for (let i = 0; i < NCELL; i++) {
      const R = cellRect(i);
      if (e.x >= R.x && e.x <= R.x + R.w && e.y >= R.y && e.y <= R.y + R.h) return [{ op: 'toggle', cell: i }];
    }
    return [];
  },

  footerStatus(env) {
    const n = env.state.sel.filter(Boolean).length;
    return `${n} selected`;
  },
};

export const _internals = { analyseCell, cellRole, cellKind, place, CELL, COLORS };

export function semanticKey(m) {
  return `backmost_layer_select|${m.ref}|` + m.cells.map((c) => c.shapes.map((s) => s.type).join('>')).join(';');
}
