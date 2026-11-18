import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import { hash32, nthOf } from '../core/style.js';
import { primaryOf, detail, tinted, natural, pat, isoTex, shade, mix, lumOf, ANISO, GRIDDY, splitList } from '../common/_block_mat.js';

const HARD = Object.freeze({ folds: 2, margin: 0.3, minLand: 0.5, minPart: 0.9, sheet: [6, 6], punches: 2, maxHoles: 12 });
const PANEL_W = 400;
const BOARD = { w: PANEL_W - 20, h: 396 };
const N = 4;

const CARD = { w: 186, h: 192, gap: 8, u: 38, top: 24 };
const cardRect = (i) => ({ x: (i % 2) * (CARD.w + CARD.gap), y: Math.floor(i / 2) * (CARD.h + CARD.gap), w: CARD.w, h: CARD.h });
const GU = 44;
const GRID = { x: CARD.w + CARD.gap + Math.round((CARD.w - N * GU) / 2), y: CARD.h + CARD.gap + 14, s: N * GU };

function reflM(a, b, c) {
  const n2 = a * a + b * b;
  return [1 - 2 * a * a / n2, -2 * a * b / n2, 2 * a * c / n2, -2 * a * b / n2, 1 - 2 * b * b / n2, 2 * b * c / n2];
}
function makeFolds() {
  const F = {};
  const add = (kind, c, a, b) => {
    for (const s of [-1, 1]) {
      const id = `${kind}${c}${s < 0 ? '-' : '+'}`;
      F[id] = { id, kind, a, b, c, s, f: (q) => a * q[0] + b * q[1] - c, R: reflM(a, b, c) };
    }
  };
  for (const c of [1, 2, 3]) { add('V', c, 1, 0); add('H', c, 0, 1); }
  for (let c = 1; c <= 7; c++) add('S', c, 1, 1);
  for (let c = -3; c <= 3; c++) add('D', c, 1, -1);
  return F;
}
const FOLD = makeFolds();
const FOLD_IDS = Object.keys(FOLD);
export const foldLine = (id) => { const F = FOLD[id]; return F ? { a: F.a, b: F.b, c: F.c } : null; };

const FIRST = Object.freeze(['V1-', 'V3+', 'H1-', 'H3+', 'V2-', 'V2+', 'H2-', 'H2+', 'S4-', 'S4+', 'D0-', 'D0+',
  'S2-', 'S6+', 'D2+', 'D-2-', 'S3-', 'S5+', 'D1+', 'D-1-']);

const r6 = (v) => Math.round(v * 1e6) / 1e6;
function compose(A, B) {
  return [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
    A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
}
function apply(T, q) { return [r6(T[0] * q[0] + T[1] * q[1] + T[2]), r6(T[3] * q[0] + T[4] * q[1] + T[5])]; }
function invert(T) {
  const det = T[0] * T[4] - T[1] * T[3];
  return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det, -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
}
function clip(poly, fn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = fn(P), fq = fn(Q);
    if (fp >= 0) out.push(P);
    if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
      const t = fp / (fp - fq);
      out.push([r6(P[0] + t * (Q[0] - P[0])), r6(P[1] + t * (Q[1] - P[1]))]);
    }
  }
  const d = [];
  for (const p of out) if (!d.length || Math.hypot(p[0] - d[d.length - 1][0], p[1] - d[d.length - 1][1]) > 1e-7) d.push(p);
  while (d.length > 1 && Math.hypot(d[0][0] - d[d.length - 1][0], d[0][1] - d[d.length - 1][1]) < 1e-7) d.pop();
  return d;
}
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
function inside(poly, q) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(poly, q) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return best;
}
const SHEET = [[0, 0], [4, 0], [4, 4], [0, 4]];
const LAT = [];
for (let x = 0.1; x < 4; x += 0.2) for (let y = 0.13; y < 4; y += 0.2) LAT.push([x, y]);
const LAT_A = 0.04;

function applyFold(layers, F) {
  const zMax = Math.max(...layers.map((l) => l.z));
  const stay = [], flap = [];
  for (const L of layers) {
    const a = clip(L.poly, (q) => -F.s * F.f(q));
    const b = clip(L.poly, (q) => F.s * F.f(q));
    if (a.length >= 3 && area(a) > 1e-6) stay.push({ poly: a, T: L.T, z: L.z });
    if (b.length >= 3 && area(b) > 1e-6) flap.push({ poly: b.map((q) => apply(F.R, q)), T: compose(F.R, L.T), z: 2 * zMax + 1 - L.z });
  }
  for (const L of flap) for (const p of L.poly) if (p[0] < -1e-6 || p[0] > 4 + 1e-6 || p[1] < -1e-6 || p[1] > 4 + 1e-6) return null;
  let sa = 0, fa = 0, land = 0;
  for (const q of LAT) {
    const inS = stay.some((l) => inside(l.poly, q)), inF = flap.some((l) => inside(l.poly, q));
    if (inS) sa++;
    if (inF) { fa++; if (inS) land++; }
  }
  if (sa * LAT_A < HARD.minPart || fa * LAT_A < HARD.minPart || land < HARD.minLand * fa - 1e-9) return null;
  const all = stay.concat(flap).sort((p, q) => p.z - q.z);
  return all.map((l, i) => ({ ...l, z: i }));
}

export function simulate(folds) {
  let layers = [{ poly: SHEET.map((p) => p.slice()), T: [1, 0, 0, 0, 1, 0], z: 0 }];
  const states = [layers];
  for (const id of folds) {
    const F = FOLD[id];
    if (!F) return null;
    layers = applyFold(layers, F);
    if (!layers) return null;
    states.push(layers);
  }
  return states;
}

function punchAt(layers, c, r, margin = HARD.margin) {
  const P = [c + 0.5, r + 0.5];
  const holes = [];
  for (const L of layers) {
    if (edgeDist(L.poly, P) < margin) return null;
    if (!inside(L.poly, P)) continue;
    const Q = apply(invert(L.T), P);
    const qc = Q[0] - 0.5, qr = Q[1] - 0.5;
    if (Math.abs(qc - Math.round(qc)) > 1e-6 || Math.abs(qr - Math.round(qr)) > 1e-6) return null;
    const ci = Math.round(qc), ri = Math.round(qr);
    if (ci < 0 || ci >= N || ri < 0 || ri >= N) return null;
    holes.push(ri * N + ci);
  }
  if (!holes.length || new Set(holes).size !== holes.length) return null;
  return holes.sort((a, b) => a - b);
}

const onSheet = (q) => q[0] > 0 && q[0] < N && q[1] > 0 && q[1] < N;
const cellOf = (q) => Math.floor(q[1]) * N + Math.floor(q[0]);
function images(folds, punch) {
  const [F1, F2] = folds.map((id) => FOLD[id]);
  const P = [punch[0] + 0.5, punch[1] + 0.5], b = apply(F2.R, P);
  const pts = { P, a: apply(F1.R, P), b, c: apply(F1.R, b) };
  const out = {};
  for (const [k, q] of Object.entries(pts)) out[k] = onSheet(q) ? cellOf(q) : -1;
  return out;
}
function classify(folds, punch, holes) {
  const im = images(folds, punch);
  const on = Object.keys(im).filter((k) => im[k] >= 0);
  if (new Set(on.map((k) => im[k])).size !== on.length) return null;
  const pat = on.filter((k) => holes.includes(im[k]));
  if (pat.length !== holes.length) return null;
  return { sub: `${pat.join('')}|${on.join('')}`, im };
}
const SUB = Object.freeze({
  'Pabc|Pabc': ['FM', 0.6], 'Pab|Pab': ['FM', 0.2], 'Pbc|Pbc': ['FM', 0.2],
  'Pa|Pabc': ['F', 1],
  'b|Pab': ['BC', 0.6], 'bc|Pabc': ['BC', 0.4],
});
const CLASSES = ['FM', 'F', 'BC'];

let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = { FM: {}, F: {}, BC: {} };
  for (const f1 of FIRST) for (const f2 of FOLD_IDS) {
    const folds = [f1, f2], st = simulate(folds);
    if (!st) continue;
    const bySub = {};
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const holes = punchAt(st[2], c, r);
      if (!holes) continue;
      const k = classify(folds, [c, r], holes);
      if (!k || !SUB[k.sub]) continue;
      (bySub[k.sub] = bySub[k.sub] || []).push({ c, r, holes });
    }
    for (const [sub, cells] of Object.entries(bySub)) {
      const cls = SUB[sub][0];
      (TABLE[cls][sub] = TABLE[cls][sub] || []).push({ folds, cells });
    }
  }
  return TABLE;
}

function wpick(rng, list) {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let u = rng.raw() * tot;
  for (const [v, w] of list) { u -= w; if (u <= 0) return v; }
  return list[list.length - 1][0];
}

function genScene(rng, cls) {
  const T = table()[cls];
  const sub = wpick(rng, Object.keys(T).map((s) => [s, SUB[s][1]]));
  const prog = rng.pick(T[sub]);
  const cell = rng.pick(prog.cells);
  return { folds: prog.folds.slice(), punch: [cell.c, cell.r], holes: cell.holes.slice() };
}

function mirrorEverythingRight(rd) {
  const im = images(rd.folds, rd.punch);
  const all = [...new Set(Object.values(im).filter((v) => v >= 0))].sort((a, b) => a - b);
  return all.join(',') === rd.holes.join(',');
}

export const _audit = { punchAt, classify, SUB, mirrorEverythingRight, turnReads: (m) => turnReads(m), turnOk: (m) => turnOk(m), turnParts: (m) => turnParts(m) };
function turnParts(m) {
  const sh = m.sheet, W = sh.W, H = sh.H, want = m.holes.join(','), rd = turnReads(m);
  const S = sheet(W, H), st = xSimulate(S, m.folds)[2], id = (q) => q, lr = (q) => [W - q[0], q[1]], tb = (q) => [q[0], H - q[1]];
  return { forgotValid: rd.forgotTurn !== '', forgotWrong: rd.forgotTurn !== want,
    drawnPatterns: !Object.entries(rd.patterns).some(([k, v]) => k.startsWith('drawn') && v === want),
    truePatterns: !Object.entries(rd.patterns).some(([k, v]) => k.startsWith('true') && v === want),
    visTurn: footDiff(S, st, id, lr) >= TURN.minVis, visDir: footDiff(S, st, lr, tb) >= TURN.minVis };
}
export const _ext = { units: (...a) => unitsOf(...a), rot4: () => ROT4, xKey: (...a) => xKey(...a), xTable: (...a) => xTable(...a), generateExt: (...a) => generateExt(...a), xSpace: () => xSpace() };

export function gate(m) {
  if (m && m.ext) return extGate(m);
  if (m && m.sheet) return sheetGate(m);
  if (!m || m.task !== 'paper_fold_punch' || m.rounds !== undefined) return false;
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  if (!Array.isArray(m.folds) || m.folds.length !== HARD.folds) return false;
  if (!FIRST.includes(m.folds[0]) || !FOLD[m.folds[1]]) return false;
  const st = simulate(m.folds);
  if (!st) return false;
  if (!Array.isArray(m.punch) || m.punch.length !== 2 || !m.punch.every((v) => Number.isInteger(v) && v >= 0 && v < N)) return false;
  const holes = punchAt(st[2], m.punch[0], m.punch[1]);
  if (!holes || !Array.isArray(m.holes) || holes.join(',') !== m.holes.join(',')) return false;
  const k = classify(m.folds, m.punch, holes);
  if (!k || !SUB[k.sub] || SUB[k.sub][0] !== m.cls) return false;
  if (mirrorEverythingRight(m) !== (m.cls === 'FM')) return false;
  if (holes.length > 12) return false;
  return true;
}

const PAPER_FRONT = '#f8f2e2', PAPER_BACK = '#cfe8e3', PAPER_EDGE = '#9d927a';
const HOLE = '#262a30', CREASE = '#2f78c4';

function footprintPath(g, layers, ox, oy, u) {
  g.beginPath();
  for (const L of layers) {
    let sa = 0;
    for (let i = 0; i < L.poly.length; i++) { const p = L.poly[i], q = L.poly[(i + 1) % L.poly.length]; sa += p[0] * q[1] - q[0] * p[1]; }
    const pts = sa < 0 ? L.poly.slice().reverse() : L.poly;
    pts.forEach((p, i) => (i ? g.lineTo(ox + p[0] * u, oy + p[1] * u) : g.moveTo(ox + p[0] * u, oy + p[1] * u)));
    g.closePath();
  }
}
function polyPath(g, poly, ox, oy, u, dx = 0, dy = 0) {
  g.beginPath();
  poly.forEach((p, i) => (i ? g.lineTo(ox + p[0] * u + dx, oy + p[1] * u + dy) : g.moveTo(ox + p[0] * u + dx, oy + p[1] * u + dy)));
  g.closePath();
}

function drawSheetState(g, layers, ox, oy, u, ghost, W = N, H = N) {
  if (ghost) {
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = '#a3adb8'; g.lineWidth = 1.2;
    g.strokeRect(ox + 0.5, oy + 0.5, W * u - 1, H * u - 1); g.restore();
  }
  const order = layers.slice().sort((a, b) => a.z - b.z);
  for (const L of order) {
    if (L.z > 0) { polyPath(g, L.poly, ox, oy, u, 2, 2.6); g.fillStyle = 'rgba(40,40,30,0.2)'; g.fill(); }
    const back = (L.T[0] * L.T[4] - L.T[1] * L.T[3]) < 0;
    polyPath(g, L.poly, ox, oy, u); g.fillStyle = back ? PAPER_BACK : PAPER_FRONT; g.fill();
    g.strokeStyle = PAPER_EDGE; g.lineWidth = 1.2; g.stroke();
  }
  g.save();
  footprintPath(g, layers, ox, oy, u); g.clip();
  g.strokeStyle = 'rgba(110,98,72,0.3)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < W; k++) { g.moveTo(ox + k * u, oy); g.lineTo(ox + k * u, oy + H * u); }
  for (let k = 1; k < H; k++) { g.moveTo(ox, oy + k * u); g.lineTo(ox + W * u, oy + k * u); }
  g.stroke();
  g.restore();
  const top = order[order.length - 1];
  polyPath(g, top.poly, ox, oy, u); g.strokeStyle = PAPER_EDGE; g.lineWidth = 1.2; g.stroke();
}

function flapCentroid(layers, F) {
  let sx = 0, sy = 0, n = 0;
  for (const q of LAT) if (F.s * F.f(q) > 0 && layers.some((l) => inside(l.poly, q))) { sx += q[0]; sy += q[1]; n++; }
  return n ? [sx / n, sy / n] : [2, 2];
}

function drawFold(g, layers, F, ox, oy, u) {
  const n = Math.hypot(F.a, F.b), dir = [-F.b / n, F.a / n], p0 = [F.a * F.c / (n * n), F.b * F.c / (n * n)];
  const on = [];
  for (let t = -6; t <= 6.0001; t += 0.04) {
    const q = [p0[0] + dir[0] * t, p0[1] + dir[1] * t];
    if (layers.some((l) => inside(l.poly, q) || edgeDist(l.poly, q) < 1e-3)) on.push(q);
  }
  const seg = on.length ? [on[0], on[on.length - 1]] : [[0, 0], [4, 4]];
  const a = [ox + seg[0][0] * u, oy + seg[0][1] * u], b = [ox + seg[1][0] * u, oy + seg[1][1] * u];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ex = (b[0] - a[0]) / L * 6, ey = (b[1] - a[1]) / L * 6;
  g.save();
  g.setLineDash([7, 4]); g.strokeStyle = CREASE; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(a[0] - ex, a[1] - ey); g.lineTo(b[0] + ex, b[1] + ey); g.stroke();
  g.restore();
  const A0 = flapCentroid(layers, F), B0 = apply(F.R, A0);
  const ext = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) < 1.5 ? 0.3 : 0;
  const A = [A0[0] + (A0[0] - B0[0]) * ext, A0[1] + (A0[1] - B0[1]) * ext], B = [B0[0] + (B0[0] - A0[0]) * ext, B0[1] + (B0[1] - A0[1]) * ext];
  const Ax = ox + A[0] * u, Ay = oy + A[1] * u, Bx = ox + B[0] * u, By = oy + B[1] * u;
  let dx = -(By - Ay), dy = Bx - Ax;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  if (dy > 1e-6 || (Math.abs(dy) < 1e-6 && dx > 0)) { dx = -dx; dy = -dy; }
  const span = Math.hypot(Bx - Ax, By - Ay);
  const bulge = Math.max(16, span * 0.42);
  const Cx = (Ax + Bx) / 2 + dx * bulge, Cy = (Ay + By) / 2 + dy * bulge;
  const sh = 0.16;
  const qa = [Ax + (Cx - Ax) * sh, Ay + (Cy - Ay) * sh];
  const tBx = Bx + (Cx - Bx) * 0.12, tBy = By + (Cy - By) * 0.12;
  g.save();
  g.strokeStyle = CREASE; g.fillStyle = CREASE; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(qa[0], qa[1]); g.quadraticCurveTo(Cx, Cy, tBx, tBy); g.stroke();
  const ang = Math.atan2(tBy - Cy, tBx - Cx), hl = 10;
  g.beginPath();
  g.moveTo(tBx + Math.cos(ang) * 2, tBy + Math.sin(ang) * 2);
  g.lineTo(tBx - Math.cos(ang - 0.45) * hl, tBy - Math.sin(ang - 0.45) * hl);
  g.lineTo(tBx - Math.cos(ang + 0.45) * hl, tBy - Math.sin(ang + 0.45) * hl);
  g.closePath(); g.fill();
  g.restore();
}

function drawHole(g, x, y, r) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = HOLE; g.fill();
  g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.stroke();
}

function drawSteps(g, rd) {
  const st = simulate(rd.folds);
  for (let i = 0; i < 3; i++) {
    const R = cardRect(i);
    rr(g, R.x, R.y, R.w, R.h, 9); g.fillStyle = '#f3f5f7'; g.fill();
    g.strokeStyle = '#dbe1e7'; g.lineWidth = 1; g.stroke();
    g.save(); rr(g, R.x, R.y, R.w, R.h, 9); g.clip();
    const u = CARD.u, ox = R.x + (R.w - N * u) / 2, oy = R.y + CARD.top + (R.h - CARD.top - N * u) / 2;
    drawSheetState(g, st[i], ox, oy, u, i > 0);
    const last = i === 2;
    if (!last) drawFold(g, st[i], FOLD[rd.folds[i]], ox, oy, u);
    else drawHole(g, ox + (rd.punch[0] + 0.5) * u, oy + (rd.punch[1] + 0.5) * u, u * 0.24);
    g.restore();
    g.fillStyle = '#5b6773'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(last ? '3. Punch' : `${i + 1}. Fold`, R.x + 10, R.y + 13);
  }
}

function drawStepsG(g, m) {
  const G = geomOf(m), S = sheet(G.W, G.H), st = xSimulate(S, m.folds), turned = turnedOf(m);
  for (let i = 0; i < 3; i++) {
    const R = cardRect(i);
    rr(g, R.x, R.y, R.w, R.h, 9); g.fillStyle = '#f3f5f7'; g.fill();
    g.strokeStyle = '#dbe1e7'; g.lineWidth = 1; g.stroke();
    g.save(); rr(g, R.x, R.y, R.w, R.h, 9); g.clip();
    const u = G.u, ox = R.x + (R.w - G.W * u) / 2, oy = R.y + CARD.top + (R.h - CARD.top - G.H * u) / 2;
    drawSheetState(g, i === 2 && turned ? turnLayers(st[2], G.W) : st[i], ox, oy, u, i > 0, G.W, G.H);
    if (i < 2) xDrawFold(g, st[i], S.F[m.folds[i]], ox, oy, u, S, CREASE);
    else for (const pu of drawnPunchesOf(m)) drawHole(g, ox + (pu[0] + 0.5) * u, oy + (pu[1] + 0.5) * u, u * 0.24);
    g.restore();
    g.fillStyle = '#5b6773'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const label = i === 2 ? (turned ? '3. Turn over, punch' : '3. Punch') : `${i + 1}. Fold`;
    g.fillText(label, R.x + 10, R.y + 13);
    if (i === 2 && turned) drawTurnIcon(g, R.x + 18 + g.measureText(label).width, R.y + 13, PAPER_FRONT, PAPER_BACK, '#6b7785');
  }
}
const TURN_LR = (W) => [-1, 0, W, 0, 1, 0];
function turnLayers(layers, W) {
  const zMax = Math.max(...layers.map((l) => l.z)), M = TURN_LR(W);
  return layers.map((L) => ({ poly: L.poly.map((p) => [W - p[0], p[1]]), T: compose(M, L.T), z: zMax - L.z }));
}
function drawTurnIcon(g, x, y, front, back, ink) {
  const w = 9, h = 10, top = y + 2 - h / 2;
  g.save(); g.lineWidth = 1; g.strokeStyle = 'rgba(90,80,60,0.75)';
  g.fillStyle = front; g.fillRect(x, top, w, h); g.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
  g.fillStyle = back; g.fillRect(x + 25, top, w, h); g.strokeRect(x + 25.5, top + 0.5, w - 1, h - 1);
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + w / 2 + 1, top - 1); g.quadraticCurveTo(x + 17, top - 7, x + 28.5, top - 1.5); g.stroke();
  const ang = Math.atan2(-1.5 - -7, 28.5 - 17);
  g.beginPath(); g.moveTo(x + 29.5, top - 0.8);
  g.lineTo(x + 29.5 - Math.cos(ang - 0.5) * 5, top - 0.8 - Math.sin(ang - 0.5) * 5);
  g.lineTo(x + 29.5 - Math.cos(ang + 0.5) * 5, top - 0.8 - Math.sin(ang + 0.5) * 5);
  g.closePath(); g.fill();
  g.restore();
}
function drawAnswerSheetG(g, m, sel) {
  const G = geomOf(m), { x, y, w, h } = G.grid, gu = G.gu;
  g.fillStyle = '#5b6773'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Unfolded', x, y - 7);
  g.fillStyle = 'rgba(40,40,30,0.12)'; g.fillRect(x + 2, y + 3, w, h);
  g.fillStyle = PAPER_FRONT; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(110,98,72,0.38)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < G.W; k++) { g.moveTo(x + k * gu + 0.5, y); g.lineTo(x + k * gu + 0.5, y + h); }
  for (let k = 1; k < G.H; k++) { g.moveTo(x, y + k * gu + 0.5); g.lineTo(x + w, y + k * gu + 0.5); }
  g.stroke();
  g.strokeStyle = PAPER_EDGE; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  for (const i of sel) drawHole(g, x + (i % G.W + 0.5) * gu, y + (Math.floor(i / G.W) + 0.5) * gu, gu * 0.26);
}

function drawAnswerSheet(g, sel) {
  const { x, y, s } = GRID;
  g.fillStyle = '#5b6773'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Unfolded', x, y - 3 - 4);
  g.fillStyle = 'rgba(40,40,30,0.12)'; g.fillRect(x + 2, y + 3, s, s);
  g.fillStyle = PAPER_FRONT; g.fillRect(x, y, s, s);
  g.strokeStyle = 'rgba(110,98,72,0.38)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < N; k++) { g.moveTo(x + k * GU + 0.5, y); g.lineTo(x + k * GU + 0.5, y + s); g.moveTo(x, y + k * GU + 0.5); g.lineTo(x + s, y + k * GU + 0.5); }
  g.stroke();
  g.strokeStyle = PAPER_EDGE; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  for (const i of sel) drawHole(g, x + (i % N + 0.5) * GU, y + (Math.floor(i / N) + 0.5) * GU, GU * 0.26);
}

function sheetOf(W, H) {
  const F = {};
  const add = (kind, c, a, b) => {
    for (const s2 of [-1, 1]) {
      const id = `${kind}${c}${s2 < 0 ? '-' : '+'}`;
      F[id] = { id, kind, a, b, c, s: s2, f: (q) => a * q[0] + b * q[1] - c, R: reflM(a, b, c) };
    }
  };
  for (let c = 1; c < W; c++) add('V', c, 1, 0);
  for (let c = 1; c < H; c++) add('H', c, 0, 1);
  for (let c = 1; c < W + H; c++) add('S', c, 1, 1);
  for (let c = -(H - 1); c < W; c++) add('D', c, 1, -1);
  const lat = [];
  for (let x = 0.1; x < W; x += 0.2) for (let y = 0.13; y < H; y += 0.2) lat.push([x, y]);
  return { W, H, F, ids: Object.keys(F), poly: [[0, 0], [W, 0], [W, H], [0, H]], lat };
}
const SHEETS = new Map();
function sheet(W, H) { const k = `${W}x${H}`; if (!SHEETS.has(k)) SHEETS.set(k, sheetOf(W, H)); return SHEETS.get(k); }
function xApplyFold(S, layers, F) {
  const zMax = Math.max(...layers.map((l) => l.z));
  const stay = [], flap = [];
  for (const L of layers) {
    const a = clip(L.poly, (q) => -F.s * F.f(q));
    const b = clip(L.poly, (q) => F.s * F.f(q));
    if (a.length >= 3 && area(a) > 1e-6) stay.push({ poly: a, T: L.T, z: L.z });
    if (b.length >= 3 && area(b) > 1e-6) flap.push({ poly: b.map((q) => apply(F.R, q)), T: compose(F.R, L.T), z: 2 * zMax + 1 - L.z });
  }
  for (const L of flap) for (const p of L.poly) if (p[0] < -1e-6 || p[0] > S.W + 1e-6 || p[1] < -1e-6 || p[1] > S.H + 1e-6) return null;
  let sa = 0, fa = 0, land = 0;
  for (const q of S.lat) {
    const inS = stay.some((l) => inside(l.poly, q)), inF = flap.some((l) => inside(l.poly, q));
    if (inS) sa++;
    if (inF) { fa++; if (inS) land++; }
  }
  if (sa * LAT_A < HARD.minPart || fa * LAT_A < HARD.minPart || land < HARD.minLand * fa - 1e-9) return null;
  return stay.concat(flap).sort((p, q) => p.z - q.z).map((l, i) => ({ ...l, z: i }));
}
function xSimulate(S, folds) {
  let layers = [{ poly: S.poly.map((p) => p.slice()), T: [1, 0, 0, 0, 1, 0], z: 0 }];
  const states = [layers];
  for (const id of folds) {
    const F = S.F[id];
    if (!F) return null;
    layers = xApplyFold(S, layers, F);
    if (!layers) return null;
    states.push(layers);
  }
  return states;
}
function xPunchAt(S, layers, c, r) {
  const P = [c + 0.5, r + 0.5], holes = [];
  for (const L of layers) {
    if (edgeDist(L.poly, P) < HARD.margin) return null;
    if (!inside(L.poly, P)) continue;
    const Q = apply(invert(L.T), P), qc = Q[0] - 0.5, qr = Q[1] - 0.5;
    if (Math.abs(qc - Math.round(qc)) > 1e-6 || Math.abs(qr - Math.round(qr)) > 1e-6) return null;
    const ci = Math.round(qc), ri = Math.round(qr);
    if (ci < 0 || ci >= S.W || ri < 0 || ri >= S.H) return null;
    holes.push(ri * S.W + ci);
  }
  if (!holes.length || new Set(holes).size !== holes.length) return null;
  return holes.sort((a, b) => a - b);
}
function xClassify(S, folds, punch, holes) {
  const [F1, F2] = folds.map((id) => S.F[id]);
  const P = [punch[0] + 0.5, punch[1] + 0.5], b = apply(F2.R, P);
  const pts = { P, a: apply(F1.R, P), b, c: apply(F1.R, b) };
  const im = {};
  for (const [k, q] of Object.entries(pts)) im[k] = q[0] > 0 && q[0] < S.W && q[1] > 0 && q[1] < S.H ? Math.floor(q[1]) * S.W + Math.floor(q[0]) : -1;
  const on = Object.keys(im).filter((k) => im[k] >= 0);
  if (new Set(on.map((k) => im[k])).size !== on.length) return null;
  const pt = on.filter((k) => holes.includes(im[k]));
  if (pt.length !== holes.length) return null;
  return { sub: `${pt.join('')}|${on.join('')}`, im };
}
function xFirst(S) {
  return S.ids.filter((id) => {
    const st = xSimulate(S, [id]);
    if (!st) return false;
    const F = S.F[id];
    let flap = 0, stay = 0;
    for (const q of S.lat) { if (F.s * F.f(q) > 0) flap++; else stay++; }
    return flap <= stay;
  });
}
const SYM8 = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
const ROT4 = SYM8.slice(0, 4);
function xKey(W, H, folds, punch, syms = SYM8) {
  let best = null;
  for (const A of syms) {
    const W2 = A[0] !== 0 ? W : H, H2 = A[0] !== 0 ? H : W;
    const mp = (p) => [A[0] * p[0] + A[1] * p[1], A[2] * p[0] + A[3] * p[1]];
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(mp);
    const tx = -Math.min(...corners.map((c) => c[0])), ty = -Math.min(...corners.map((c) => c[1]));
    const fid = (id) => {
      const m = /^([VHSD])(-?\d+)([+-])$/.exec(id);
      const kind = m[1], c = Number(m[2]), s2 = m[3] === '+' ? 1 : -1;
      const n = { V: [1, 0], H: [0, 1], S: [1, 1], D: [1, -1] }[kind];
      let n2 = [A[0] * n[0] + A[1] * n[1], A[2] * n[0] + A[3] * n[1]], c2 = c + n2[0] * tx + n2[1] * ty, s3 = s2;
      const canon = n2[0] === 0 ? [0, 1] : n2[1] === 0 ? [1, 0] : n2[0] === n2[1] ? [1, 1] : [1, -1];
      if (n2[0] !== canon[0] || n2[1] !== canon[1]) { n2 = canon; c2 = -c2; s3 = -s3; }
      const k2 = canon[0] === 0 ? 'H' : canon[1] === 0 ? 'V' : canon[1] === 1 ? 'S' : 'D';
      return `${k2}${Math.round(c2)}${s3 > 0 ? '+' : '-'}`;
    };
    let key = `${W2}x${H2}|${folds.map(fid).join(',')}`;
    if (punch) {
      const list = Array.isArray(punch[0]) ? punch : [punch];
      key += '|' + list.map((pu) => { const pc = mp([pu[0] + 0.5, pu[1] + 0.5]); return `${Math.floor(pc[0] + tx)},${Math.floor(pc[1] + ty)}`; }).sort().join(';');
    }
    if (best === null || key < best) best = key;
  }
  return best;
}
const EVAL_KEY_LIST = ['4x4|D0+,S3-|1,2', '4x4|D0+,H2-|1,3', '4x4|D-1-,H2-|1,3', '4x4|H1-,D0-|2,0', '4x4|H1-,D0+|0,1', '4x4|H1-,D0-|1,0', '4x4|D-2-,D0+|0,3', '4x4|H2+,D0-|1,0', '4x4|H2+,D1+|1,1', '4x4|D-2-,H2-|0,3', '4x4|H2+,D1+|2,2'];
const EVAL_FOLD_KEYS = new Set(EVAL_KEY_LIST.map((k) => k.split('|').slice(0, 2).join('|')));
const classSplit = (key) => (hash32(`paper_fold_class|${key}`) % 10 === 0 ? 'test' : 'train');
const EXT_GROUPS = [[[4, 4], [3, 4], [4, 3], [3, 3]], [[3, 5], [5, 3], [4, 5], [5, 4]]];
const EXT_SIZES = EXT_GROUPS.flat();
const EVAL_ROT_KEYS = new Set(['4x4|D0+,S5+|1,2', '4x4|D0+,H2-|1,3', '4x4|D-1-,H2-|1,3', '4x4|H1-,D0-|2,0', '4x4|H1-,S4-|3,1', '4x4|H1-,D0-|1,0',
  '4x4|D-2-,D0+|0,3', '4x4|H2+,D0-|1,0', '4x4|H2+,D1+|1,1', '4x4|D-2-,H2-|0,3', '4x4|H2+,D1+|2,2']);
const unitSplit = (rk) => (hash32(`paper_fold_unit|${rk}`) % 10 === 0 ? 'test' : 'train');
function xSequence(W, H, folds) {
  const S = sheet(W, H), st = xSimulate(S, folds);
  if (!st) return null;
  const byCls = { FM: [], F: [], BC: [] };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const holes = xPunchAt(S, st[2], c, r);
    if (!holes || holes.length > 12) continue;
    const cl = xClassify(S, folds, [c, r], holes);
    if (!cl || !SUB[cl.sub]) continue;
    byCls[SUB[cl.sub][0]].push({ punch: [c, r], holes, sub: cl.sub });
  }
  return byCls;
}
const FIRSTS = new Map();
function xFirstOf(W, H) { const k = `${W}x${H}`; if (!FIRSTS.has(k)) FIRSTS.set(k, xFirst(sheet(W, H))); return FIRSTS.get(k); }
function xTable(W, H) {
  const S = sheet(W, H), seqs = [];
  for (const f1 of xFirstOf(W, H)) for (const f2 of S.ids) {
    const byCls = xSequence(W, H, [f1, f2]);
    if (!byCls || (!byCls.FM.length && !byCls.F.length && !byCls.BC.length)) continue;
    const fkey = xKey(W, H, [f1, f2], null);
    seqs.push({ folds: [f1, f2], byCls, fkey, split: classSplit(fkey), evalLike: EVAL_FOLD_KEYS.has(fkey) });
  }
  return seqs;
}
const pickPunch = (rng, list) => { const subs = [...new Set(list.map((e) => e.sub))]; const sub = wpick(rng, subs.map((x) => [x, SUB[x][1]])); return rng.pick(list.filter((e) => e.sub === sub)); };
const XUNITS = new Map();
function unitsOf(split, cls, group) {
  const key = `${split}|${cls}|${group}`;
  if (XUNITS.has(key)) return XUNITS.get(key);
  const all = [];
  for (const [W, H] of EXT_GROUPS[group]) for (const q of xTable(W, H)) for (const e of q.byCls[cls]) {
    const rk = xKey(W, H, q.folds, e.punch, ROT4);
    if (rk !== `${W}x${H}|${q.folds.join(',')}|${e.punch[0]},${e.punch[1]}`) continue;
    if (EVAL_ROT_KEYS.has(rk) || unitSplit(rk) !== split) continue;
    all.push({ W, H, folds: q.folds, punch: e.punch, holes: e.holes });
  }
  const N = all.length;
  const out = Array.from({ length: N }, (_, i) => all[nthOf(`paper_fold_punch|${split}|${cls}|${group}|problems`, i + 1, N)]);
  XUNITS.set(key, out);
  return out;
}
function unitOf(split, cls, j) {
  const A = unitsOf(split, cls, 0);
  if (j <= A.length) return A[j - 1];
  const B = unitsOf(split, cls, 1);
  if (j <= A.length + B.length) return B[j - A.length - 1];
  const all = A.concat(B);
  return all[(j - 1) % all.length];
}
function xTurn(W, H, folds, punch, A) {
  const W2 = A[0] !== 0 ? W : H, H2 = A[0] !== 0 ? H : W;
  const mp = (p) => [A[0] * p[0] + A[1] * p[1], A[2] * p[0] + A[3] * p[1]];
  const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(mp);
  const tx = -Math.min(...corners.map((c) => c[0])), ty = -Math.min(...corners.map((c) => c[1]));
  const f2 = folds.map((id) => {
    const m = /^([VHSD])(-?\d+)([+-])$/.exec(id);
    const c = Number(m[2]), n = { V: [1, 0], H: [0, 1], S: [1, 1], D: [1, -1] }[m[1]];
    let n2 = [A[0] * n[0] + A[1] * n[1], A[2] * n[0] + A[3] * n[1]], c2 = c + n2[0] * tx + n2[1] * ty, s3 = m[3] === '+' ? 1 : -1;
    const canon = n2[0] === 0 ? [0, 1] : n2[1] === 0 ? [1, 0] : n2[0] === n2[1] ? [1, 1] : [1, -1];
    if (n2[0] !== canon[0] || n2[1] !== canon[1]) { c2 = -c2; s3 = -s3; }
    return `${canon[0] === 0 ? 'H' : canon[1] === 0 ? 'V' : canon[1] === 1 ? 'S' : 'D'}${Math.round(c2)}${s3 > 0 ? '+' : '-'}`;
  });
  const pc = mp([punch[0] + 0.5, punch[1] + 0.5]);
  return { W: W2, H: H2, folds: f2, punch: [Math.floor(pc[0] + tx), Math.floor(pc[1] + ty)] };
}
const TEST_PATTERN = ['FM', 'F', 'BC', 'FM', 'BC', 'F', 'FM', 'BC', 'F', 'FM', 'BC', 'FM', 'F', 'BC', 'FM', 'BC', 'F', 'FM', 'BC', 'F'];
function classSlot(split, n) {
  if (split !== 'test') return { cls: CLASSES[(n - 1) % 3], j: Math.floor((n - 1) / 3) + 1 };
  const b = Math.floor((n - 1) / 20), k = (n - 1) % 20, cls = TEST_PATTERN[k];
  const per = TEST_PATTERN.filter((c) => c === cls).length;
  return { cls, j: b * per + TEST_PATTERN.slice(0, k + 1).filter((c) => c === cls).length };
}
function generateExt(rng, split, n) {
  const { cls, j } = classSlot(split, n);
  const u = unitOf(split, cls, j);
  const r0 = rng.int(0, 3);
  for (let k = 0; k < 4; k++) {
    const t = xTurn(u.W, u.H, u.folds, u.punch, ROT4[(r0 + k) % 4]);
    const st = xSimulate(sheet(t.W, t.H), t.folds), holes = st && xPunchAt(sheet(t.W, t.H), st[2], t.punch[0], t.punch[1]);
    if (!holes) continue;
    const m = { task: 'paper_fold_punch', board: { ...BOARD }, cls, folds: t.folds.slice(), punch: t.punch.slice(), holes: holes.slice(),
      ext: { W: t.W, H: t.H, punches: [t.punch.slice()], classes: [cls] } };
    if (extGate(m)) return m;
  }
  return { task: 'paper_fold_punch', board: { ...BOARD }, cls, folds: u.folds.slice(), punch: u.punch.slice(), holes: u.holes.slice(),
    ext: { W: u.W, H: u.H, punches: [u.punch.slice()], classes: [cls] } };
}
function extGate(m) {
  const { W, H, punches, classes } = m.ext || {};
  if (m.task !== 'paper_fold_punch' || !EXT_SIZES.some(([a, b]) => a === W && b === H)) return false;
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !Array.isArray(m.folds) || m.folds.length !== HARD.folds) return false;
  if (!Array.isArray(punches) || punches.length !== 1 || classes.length !== 1 || m.cls !== classes[0]) return false;
  if (EVAL_ROT_KEYS.has(xKey(W, H, m.folds, punches[0], ROT4))) return false;
  return punchesOk(W, H, m.folds, punches, classes, m.holes) && m.punch[0] === punches[0][0] && m.punch[1] === punches[0][1];
}
function punchesOk(W, H, folds, punches, classes, want) {
  const S = sheet(W, H);
  if (!xFirstOf(W, H).includes(folds[0]) || !S.F[folds[1]]) return false;
  const st = xSimulate(S, folds);
  if (!st) return false;
  const all = [];
  for (let i = 0; i < punches.length; i++) {
    const pu = punches[i];
    if (!(pu[0] >= 0 && pu[0] < W && pu[1] >= 0 && pu[1] < H)) return false;
    const holes = xPunchAt(S, st[2], pu[0], pu[1]);
    if (!holes) return false;
    const cl = xClassify(S, folds, pu, holes);
    if (!cl || !SUB[cl.sub] || SUB[cl.sub][0] !== classes[i]) return false;
    const mir = [...new Set(Object.values(cl.im).filter((v) => v >= 0))].sort((a, b) => a - b);
    if ((mir.join(',') === holes.join(',')) !== (classes[i] === 'FM')) return false;
    if (holes.some((h) => all.includes(h)) || punches.some((q, j) => j < i && q[0] === pu[0] && q[1] === pu[1])) return false;
    all.push(...holes);
  }
  all.sort((a, b) => a - b);
  return all.length <= HARD.maxHoles && Array.isArray(want) && all.join(',') === want.join(',');
}
const mixedFB = (cl) => cl.includes('F') && cl.includes('BC');
const bannedPair = (cl) => mixedFB(cl) || cl.every((c) => c === 'FM') || cl.every((c) => c === 'F');
const TURN = Object.freeze({
  minVis: 1.0,
  picks: 12,
});
const PATTERNS = [['P', 'a', 'b', 'c'], ['b'], ['P', 'b'], ['P', 'a'], ['P']];
function patternHoles(S, folds, punches, pat) {
  const out = new Set();
  for (const pu of punches) {
    const [F1, F2] = folds.map((id) => S.F[id]);
    const P0 = [pu[0] + 0.5, pu[1] + 0.5], b = apply(F2.R, P0), pts = { P: P0, a: apply(F1.R, P0), b, c: apply(F1.R, b) };
    for (const k of pat) { const q = pts[k]; if (q[0] > 0 && q[0] < S.W && q[1] > 0 && q[1] < S.H) out.add(Math.floor(q[1]) * S.W + Math.floor(q[0])); }
  }
  return [...out].sort((x, y) => x - y).join(',');
}
function turnReads(m) {
  const sh = m.sheet, S = sheet(sh.W, sh.H), st = xSimulate(S, m.folds), out = { forgotTurn: null, patterns: {} };
  const all = [];
  for (const pu of sh.shown) { const h = xPunchAt(S, st[2], pu[0], pu[1]); if (!h) { out.forgotTurn = ''; break; } all.push(...h); }
  if (out.forgotTurn === null) out.forgotTurn = [...new Set(all)].sort((x, y) => x - y).join(',');
  for (const pat of PATTERNS) for (const [frame, pts] of [['drawn', sh.shown], ['true', sh.punches]]) out.patterns[`${frame}:${pat.join('')}`] = patternHoles(S, m.folds, pts, pat);
  return out;
}
function footDiff(S, layers, f1, f2) {
  const inF = (q) => layers.some((l) => inside(l.poly, q));
  let d = 0;
  for (const q of S.lat) if (inF(f1(q)) !== inF(f2(q))) d++;
  return d * LAT_A;
}
function turnOk(m) {
  const sh = m.sheet, W = sh.W, H = sh.H;
  if (!Array.isArray(sh.shown) || sh.shown.length !== sh.punches.length) return false;
  if (!sh.shown.every((q, i) => q[0] === W - 1 - sh.punches[i][0] && q[1] === sh.punches[i][1])) return false;
  const want = m.holes.join(','), rd = turnReads(m);
  if (rd.forgotTurn === '' || rd.forgotTurn === want) return false;
  if (Object.values(rd.patterns).some((k) => k === want)) return false;
  const S = sheet(W, H), st = xSimulate(S, m.folds)[2], id = (q) => q;
  const lr = (q) => [W - q[0], q[1]], tb = (q) => [q[0], H - q[1]];
  return footDiff(S, st, id, lr) >= TURN.minVis && footDiff(S, st, lr, tb) >= TURN.minVis;
}
function sheetGate(m) {
  const sh = m.sheet;
  if (m.task !== 'paper_fold_punch' || !sh || sh.W !== HARD.sheet[0] || sh.H !== HARD.sheet[1]) return false;
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !Array.isArray(m.folds) || m.folds.length !== HARD.folds) return false;
  if (!Array.isArray(sh.punches) || sh.punches.length !== HARD.punches || !Array.isArray(sh.classes) || sh.classes.length !== HARD.punches) return false;
  if (m.cls !== sh.classes.join('+') || !sh.classes.every((c) => CLASSES.includes(c)) || bannedPair(sh.classes)) return false;
  if (sh.turn !== 'lr') return false;
  return punchesOk(sh.W, sh.H, m.folds, sh.punches, sh.classes, m.holes) && m.punch[0] === sh.punches[0][0] && m.punch[1] === sh.punches[0][1] && turnOk(m);
}
function genSheetScene(rng) {
  const [W, H] = HARD.sheet, S = sheet(W, H), firsts = xFirstOf(W, H);
  let classes;
  do classes = Array.from({ length: HARD.punches }, () => rng.pick(CLASSES)); while (bannedPair(classes));
  for (let t = 0; t < 20000; t++) {
    const folds = [rng.pick(firsts), rng.pick(S.ids)];
    const byCls = xSequence(W, H, folds);
    if (!byCls || !classes.every((cl) => byCls[cl].length)) continue;
    for (let k = 0; k < TURN.picks; k++) {
      const punches = [], all = [];
      let ok = true;
      for (const cl of classes) {
        const opts = byCls[cl].filter((e) => !punches.some((p) => p[0] === e.punch[0] && p[1] === e.punch[1]) && !e.holes.some((h) => all.includes(h)));
        if (!opts.length) { ok = false; break; }
        const e = pickPunch(rng, opts);
        punches.push(e.punch.slice()); all.push(...e.holes);
      }
      if (!ok || all.length > HARD.maxHoles) continue;
      const shown = punches.map((q) => [W - 1 - q[0], q[1]]);
      const m = { task: 'paper_fold_punch', board: { ...BOARD }, cls: classes.join('+'), folds: folds.slice(), punch: punches[0].slice(),
        holes: all.sort((a, b) => a - b), sheet: { W, H, punches, classes, turn: 'lr', shown } };
      if (sheetGate(m)) return m;
    }
  }
  throw new Error('paper_fold_punch: could not build a scene');
}
const dimsOf = (m) => (m.ext ? [m.ext.W, m.ext.H] : m.sheet ? [m.sheet.W, m.sheet.H] : [N, N]);
const punchesOf = (m) => (m.ext ? m.ext.punches : m.sheet ? m.sheet.punches : [m.punch]);
const turnedOf = (m) => !m.ext && m.sheet?.turn === 'lr';
const drawnPunchesOf = (m) => (turnedOf(m) ? m.sheet.shown : punchesOf(m));

const PAPERS = [
  { id: 'kraft', front: '#c79a6b', back: '#f3efe6', grid: 'rgba(70,45,20,0.32)' },
  { id: 'origami_red', front: '#d8463b', back: '#f6f2ea', grid: 'rgba(60,20,20,0.3)' },
  { id: 'origami_blue', front: '#3c6fc4', back: '#f4f3ee', grid: 'rgba(15,30,70,0.3)' },
  { id: 'origami_green', front: '#3f9a5c', back: '#f5f2e8', grid: 'rgba(15,50,25,0.3)' },
  { id: 'cardstock_yp', front: '#f1d36b', back: '#b9a6e0', grid: 'rgba(70,60,30,0.3)' },
  { id: 'cardstock_pc', front: '#f2a7b8', back: '#9fd4cf', grid: 'rgba(70,40,50,0.3)' },
  { id: 'newsprint', front: '#e7e3d8', back: '#9aa0a8', grid: 'rgba(40,40,40,0.3)' },
  { id: 'manila', front: '#ead7a4', back: '#7e8f6e', grid: 'rgba(60,50,20,0.3)' },
  { id: 'cream_teal', front: '#f8f2e2', back: '#cfe8e3', grid: 'rgba(110,98,72,0.3)' },
  { id: 'black_white', front: '#3b3f46', back: '#f2f1ec', grid: 'rgba(200,200,200,0.35)' },
  { id: 'orange_grey', front: '#f08a3c', back: '#d9dde2', grid: 'rgba(70,40,20,0.3)' },
  { id: 'lilac_lime', front: '#b8a2d8', back: '#d5e88d', grid: 'rgba(50,40,70,0.3)' },
];
const INKS = ['#2f78c4', '#c4362f', '#2b2f36', '#1f8a4c', '#7a3fb0', '#e8590c'];
async function mountLook(st) {
  const pids = new Set(splitList(st, 'g17_paper', PAPERS.map((p) => p.id), 3)), papers = PAPERS.filter((p) => pids.has(p.id));
  const fibres = st.pool('tex', (t) => isoTex(t, 0.15, 0.22) && /plaster|concrete|cement|granular|beige|asphalt|jersey|terlenka|velour|satin|leather/.test(t.id));
  const desks = st.pool('tex', (t) => (t.use === 'wood' && ANISO[t.id] && ANISO[t.id][0] < 0.75 && !GRIDDY.test(t.id)) || (['floor', 'fabric', 'flat2d', 'stone'].includes(t.use) && isoTex(t, 0.25, 0.3)));
  const [paper, ftex, dtex] = primaryOf(st, 'g17_paper', [papers, fibres, desks]);
  st.note(`paper:${paper.id}`); st.note(`fibre:${ftex.id}`); st.note(`desk:${dtex.id}`);
  const r = st.rand;
  const det = await detail(ftex.file, 128, 3);
  const amp = 0.035 + 0.035 * r();
  const deskL = 0.45 + 0.4 * r();
  const inks = splitList(st, 'g17_ink', INKS);
  let ink = inks[Math.floor(r() * inks.length)];
  const sep = (c) => Math.min(...[paper.front, paper.back].map((pp) => Math.abs(lumOf(pp) - lumOf(c))));
  if (sep(ink) < 0.18) ink = inks.slice().sort((a, b) => sep(b) - sep(a))[0];
  st.note(`g17_ink:${ink}`);
  return {
    paper, front: tinted(det, paper.front, amp), back: tinted(det, paper.back, amp), grid: paper.grid,
    desk: await natural(dtex.file, { L: deskL, contrast: 0.45, sat: 0.25 }), deskDark: deskL < 0.6,
    ink, k: 0.22 + 0.16 * r(), off: [r() * 128, r() * 128], deskK: 0.6 + 0.5 * r(),
    jit: Array.from({ length: 6 }, () => Math.round((r() * 2 - 1) * 7)),
    hole: deskL < 0.6 ? '#1d1f22' : '#262a30',
  };
}
function geomOf(m) {
  const [W, H] = dimsOf(m);
  const u = m.ext ? Math.min(38, Math.floor(152 / Math.max(W, H * 0.98))) : m.sheet ? Math.min(38, Math.floor(160 / Math.max(W, H))) : CARD.u;
  const gu = (m.ext || m.sheet) ? Math.min(44, Math.floor(176 / Math.max(W, H))) : GU;
  const gx = CARD.w + CARD.gap + Math.round((CARD.w - W * gu) / 2), gy = CARD.h + CARD.gap + 14;
  return { W, H, u, gu, grid: { x: gx, y: gy, w: W * gu, h: H * gu } };
}
function xDrawSheetState(g, layers, ox, oy, u, ghost, G, L) {
  if (ghost) {
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = L.deskDark ? 'rgba(255,255,255,0.6)' : 'rgba(40,40,40,0.5)'; g.lineWidth = 1.2;
    g.strokeRect(ox + 0.5, oy + 0.5, G.W * u - 1, G.H * u - 1); g.restore();
  }
  const order = layers.slice().sort((a, b) => a.z - b.z);
  for (const Ly of order) {
    polyPath(g, Ly.poly, ox, oy, u, 2, 2.6); g.fillStyle = 'rgba(20,20,10,0.22)'; g.fill();
    const back = (Ly.T[0] * Ly.T[4] - Ly.T[1] * Ly.T[3]) < 0;
    polyPath(g, Ly.poly, ox, oy, u); g.fillStyle = pat(g, back ? L.back : L.front, L.k, 0, 0, L.k, L.off[0], L.off[1]); g.fill();
    g.strokeStyle = 'rgba(60,50,35,0.55)'; g.lineWidth = 1.1; g.stroke();
  }
  g.save();
  footprintPath(g, layers, ox, oy, u); g.clip();
  g.strokeStyle = L.grid; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < G.W; k++) { g.moveTo(ox + k * u, oy); g.lineTo(ox + k * u, oy + G.H * u); }
  for (let k = 1; k < G.H; k++) { g.moveTo(ox, oy + k * u); g.lineTo(ox + G.W * u, oy + k * u); }
  g.stroke();
  g.restore();
  const top = order[order.length - 1];
  polyPath(g, top.poly, ox, oy, u); g.strokeStyle = 'rgba(60,50,35,0.55)'; g.lineWidth = 1.1; g.stroke();
}
function xFlapCentroid(layers, F, S) {
  let sx = 0, sy = 0, n = 0;
  for (const q of S.lat) if (F.s * F.f(q) > 0 && layers.some((l) => inside(l.poly, q))) { sx += q[0]; sy += q[1]; n++; }
  return n ? [sx / n, sy / n] : [S.W / 2, S.H / 2];
}
function xDrawFold(g, layers, F, ox, oy, u, S, ink) {
  const n = Math.hypot(F.a, F.b), dir = [-F.b / n, F.a / n], p0 = [F.a * F.c / (n * n), F.b * F.c / (n * n)];
  const on = [];
  for (let t = -10; t <= 10.0001; t += 0.04) {
    const q = [p0[0] + dir[0] * t, p0[1] + dir[1] * t];
    if (layers.some((l) => inside(l.poly, q) || edgeDist(l.poly, q) < 1e-3)) on.push(q);
  }
  const seg = on.length ? [on[0], on[on.length - 1]] : [[0, 0], [S.W, S.H]];
  const a = [ox + seg[0][0] * u, oy + seg[0][1] * u], b = [ox + seg[1][0] * u, oy + seg[1][1] * u];
  const Lg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ex = (b[0] - a[0]) / Lg * 6, ey = (b[1] - a[1]) / Lg * 6;
  g.save(); g.setLineDash([7, 4]); g.strokeStyle = ink; g.lineWidth = 2.2;
  g.shadowColor = 'rgba(255,255,255,0.75)'; g.shadowBlur = 2;
  g.beginPath(); g.moveTo(a[0] - ex, a[1] - ey); g.lineTo(b[0] + ex, b[1] + ey); g.stroke(); g.restore();
  const A0 = xFlapCentroid(layers, F, S), B0 = apply(F.R, A0);
  const ext2 = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) < 1.5 ? 0.3 : 0;
  const A = [A0[0] + (A0[0] - B0[0]) * ext2, A0[1] + (A0[1] - B0[1]) * ext2], B = [B0[0] + (B0[0] - A0[0]) * ext2, B0[1] + (B0[1] - A0[1]) * ext2];
  const Ax = ox + A[0] * u, Ay = oy + A[1] * u, Bx = ox + B[0] * u, By = oy + B[1] * u;
  let dx = -(By - Ay), dy = Bx - Ax;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  if (dy > 1e-6 || (Math.abs(dy) < 1e-6 && dx > 0)) { dx = -dx; dy = -dy; }
  const bulge = Math.max(16, Math.hypot(Bx - Ax, By - Ay) * 0.42);
  const Cx = (Ax + Bx) / 2 + dx * bulge, Cy = (Ay + By) / 2 + dy * bulge;
  const qa = [Ax + (Cx - Ax) * 0.16, Ay + (Cy - Ay) * 0.16], tBx = Bx + (Cx - Bx) * 0.12, tBy = By + (Cy - By) * 0.12;
  g.save(); g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2.6; g.lineCap = 'round';
  g.shadowColor = 'rgba(255,255,255,0.7)'; g.shadowBlur = 2;
  g.beginPath(); g.moveTo(qa[0], qa[1]); g.quadraticCurveTo(Cx, Cy, tBx, tBy); g.stroke();
  const ang = Math.atan2(tBy - Cy, tBx - Cx), hl = 10;
  g.beginPath(); g.moveTo(tBx + Math.cos(ang) * 2, tBy + Math.sin(ang) * 2);
  g.lineTo(tBx - Math.cos(ang - 0.45) * hl, tBy - Math.sin(ang - 0.45) * hl); g.lineTo(tBx - Math.cos(ang + 0.45) * hl, tBy - Math.sin(ang + 0.45) * hl);
  g.closePath(); g.fill(); g.restore();
}
function xDrawHole(g, x, y, r, L) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = L.hole; g.fill();
  g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.stroke();
}
function drawStyled(g, m, sel, L) {
  const big = !!(m.ext || m.sheet);
  const G = geomOf(m), S = big ? sheet(G.W, G.H) : { W: N, H: N, F: FOLD, lat: LAT };
  const st = big ? xSimulate(S, m.folds) : simulate(m.folds);
  g.fillStyle = pat(g, L.desk, L.deskK, 0, 0, L.deskK, L.off[1], L.off[0]); g.fillRect(0, 0, BOARD.w, BOARD.h);
  for (let i = 0; i < 3; i++) {
    const Rc = cardRect(i);
    g.save(); g.beginPath(); g.rect(Rc.x, Rc.y, Rc.w, Rc.h); g.clip();
    const u = G.u, ox = Rc.x + (Rc.w - G.W * u) / 2 + L.jit[2 * i], oy = Rc.y + CARD.top + (Rc.h - CARD.top - G.H * u) / 2 + L.jit[2 * i + 1] * 0.5;
    xDrawSheetState(g, i === 2 && turnedOf(m) ? turnLayers(st[2], G.W) : st[i], ox, oy, u, i > 0, G, L);
    if (i < 2) xDrawFold(g, st[i], S.F[m.folds[i]], ox, oy, u, S, L.ink);
    else for (const pu of drawnPunchesOf(m)) xDrawHole(g, ox + (pu[0] + 0.5) * u, oy + (pu[1] + 0.5) * u, u * 0.24, L);
    g.restore();
    rr(g, Rc.x + 6, Rc.y + 4, 60, 18, 5); g.fillStyle = 'rgba(255,255,255,0.82)'; g.fill();
    g.fillStyle = '#4b5661'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(i === 2 ? (turnedOf(m) ? '3. Turn over, punch' : '3. Punch') : `${i + 1}. Fold`, Rc.x + 10, Rc.y + 13);
  }
  const { x, y, w, h } = G.grid, gu = G.gu;
  rr(g, x - 2, y - 16, 62, 15, 4); g.fillStyle = 'rgba(255,255,255,0.82)'; g.fill();
  g.fillStyle = '#4b5661'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Unfolded', x + 2, y - 8);
  g.fillStyle = 'rgba(40,40,30,0.14)'; g.fillRect(x + 2, y + 3, w, h);
  g.fillStyle = pat(g, L.front, L.k, 0, 0, L.k, L.off[0], L.off[1]); g.fillRect(x, y, w, h);
  g.strokeStyle = L.grid; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < G.W; k++) { g.moveTo(x + k * gu + 0.5, y); g.lineTo(x + k * gu + 0.5, y + h); }
  for (let k = 1; k < G.H; k++) { g.moveTo(x, y + k * gu + 0.5); g.lineTo(x + w, y + k * gu + 0.5); }
  g.stroke();
  g.strokeStyle = 'rgba(60,50,35,0.6)'; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  for (const i of sel) xDrawHole(g, x + (i % G.W + 0.5) * gu, y + (Math.floor(i / G.W) + 0.5) * gu, gu * 0.26, L);
}

export default {
  meta: {
    name: 'paper_fold_punch', family: 'D', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', cell: '0..35 (row*6+col on the reopened 6x6 sheet)' }],
    promptHuman: 'Tap every hole in the unfolded sheet',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, Number.isInteger(knobs.n) && knobs.n > 0 ? knobs.n : 1 + Math.floor(rng.raw() * 400));
    return genSheetScene(rng);
  },

  init() { return { sel: [] }; },

  applyAction(state, a, m) {
    const [dw, dh] = dimsOf(m || {});
    const nc = dw * dh;
    if (a?.op !== 'toggle' || !Number.isInteger(a.cell) || a.cell < 0 || a.cell >= nc) return { ok: false, reason: 'bad-action' };
    const s = state.sel, i = s.indexOf(a.cell);
    if (i >= 0) s.splice(i, 1); else s.push(a.cell);
    return { ok: true };
  },

  verify(state, m) {
    const got = [...new Set(state.sel || [])].sort((a, b) => a - b);
    const success = got.join(',') === m.holes.join(',');
    return { success, partial: success ? 1 : 0, error: success ? 0 : 1, detail: { marked: got.length, holes: m.holes.length } };
  },

  oracle(m) { return m.holes.map((c) => ({ op: 'toggle', cell: c })); },

  randomPolicy(m, rnd) {
    const acts = [];
    const [dw, dh] = dimsOf(m);
    const k = m.sheet ? 2 + Math.floor(rnd() * 7) : 1 + Math.floor(rnd() * 4), pool = Array.from({ length: dw * dh }, (_, i) => i);
    for (let j = 0; j < k; j++) { const t = j + Math.floor(rnd() * (pool.length - j)); [pool[j], pool[t]] = [pool[t], pool[j]]; acts.push({ op: 'toggle', cell: pool[j] }); }
    return acts;
  },

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap where the holes are once unfolded');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    if (env.assets?.look) { drawStyled(g, m, state.sel, env.assets.look); g.restore(); return; }
    if (m.sheet) { drawStepsG(g, m); drawAnswerSheetG(g, m, state.sel); g.restore(); return; }
    drawSteps(g, m);
    drawAnswerSheet(g, state.sel);
    g.restore();
  },

  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    if (env.manifest.ext || env.manifest.sheet) {
      const G = geomOf(env.manifest), c = Math.floor((e.x - G.grid.x) / G.gu), r = Math.floor((e.y - G.grid.y) / G.gu);
      if (c < 0 || c >= G.W || r < 0 || r >= G.H) return [];
      return [{ op: 'toggle', cell: r * G.W + c }];
    }
    const c = Math.floor((e.x - GRID.x) / GU), r = Math.floor((e.y - GRID.y) / GU);
    if (c < 0 || c >= N || r < 0 || r >= N) return [];
    return [{ op: 'toggle', cell: r * N + c }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} marked`;
  },
};

export function semanticKey(m) {
  const [W, H] = dimsOf(m), punches = punchesOf(m);
  return `paper_fold_punch|${xKey(W, H, m.folds, punches, ROT4)}`;
}
