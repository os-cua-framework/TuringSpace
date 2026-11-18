import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import {
  FAMILIES, TOP_ONLY, VARIANTS, mirrorLabel, objectOf, bandAt, sliceRects, sliceRaster, rasterArea, rasterDiff,
  signature, congruent, pairCongruent, coarseView, viewDiff, BOX_HALF,
} from '../common/_scan_slices_pick_geom.js';
import { render, toCanvas, contextScale } from '../common/_scan_slices_pick_rt.js';
import { CARD, SCAN, BED_Y, BOX_OUT, WALL, POST_HW, postXZ, cardCamera, cardScene, scanCamera, scanScene, styleLook } from '../common/_scan_slices_pick_scene.js';
import * as K from '../common/_scene_tex_kit.js';
import { nthOf } from '../core/style.js';

const NAME = 'scan_slices_pick';
const PANEL_W = 608;
const BOARD = { w: 588, h: 432 };
const NC = 12;
const SCAN_AT = { x: 2, y: 2 };
const MON = { x: 14, y: 208, w: 190, h: 218 };
const CARDS = { x: 226, y: 4, gap: 8 };
const T_MIN = 0.01, T_MAX = 0.99, T_Q = 0.005;
const HARD = Object.freeze({
  bandMin: 0.7, bandMax: 0.95, yaw: [36, 50], elev: [27, 34], t0Margin: 0.2,
  samples: 300, diffMin: 60, visFeat: 0.45, visPair: 0.8, repeatP: 0.35,
});
const LOW_VARS = { notch: ['FL', 'FR', 'BR'], slot: ['col', 'row'], tab: ['F0', 'F1', 'F2', 'R0', 'R1', 'R2'], step: ['F', 'R'] };
const TOP_VARS = { ...LOW_VARS, notch: ['FL', 'FR', 'BR', 'BL'], ramp: ['F', 'R'], post: ['FL', 'FR', 'BR', 'BL'] };
const LOW_POOL = { notch: ['FL', 'FR', 'BR'], tab: ['F0', 'F2', 'R0', 'R2'] };
const TOP_POOL = { notch: ['FL', 'FR', 'BR', 'BL'], tab: ['F0', 'F2', 'R0', 'R2'], post: ['FL', 'FR', 'BR', 'BL'] };
const poolOf = (fam, b) => (b < NB - 1 ? LOW_POOL : TOP_POOL)[fam];
const BAND_W = [
  [['notch', 3.5], ['tab', 2.2]],
  [['notch', 3], ['tab', 2.4]],
];
const REPEAT_FAMS = ['notch', 'tab'];
const TOP_W = [['notch', 1.4], ['tab', 1.2], ['post', 1.4]];
const r2 = (v) => Math.round(v * 100) / 100;
const qT = (t) => Math.round(Math.max(T_MIN, Math.min(T_MAX, t)) / T_Q) * T_Q;
const NB = 4;
const NV = 3;
const ROLE_SET = ['0000', '0100', '0010', '0001', '0200', '1000', '1100', '1010', '1001', '1020', '1002', '2000'].map((s) => [...s].map(Number));
const PERMS = (() => { const out = []; const rec = (cur, rest) => { if (!rest.length) { out.push(cur); return; } rest.forEach((x, i) => rec([...cur, x], rest.filter((_, k) => k !== i))); }; rec([], [0, 1, 2, 3]); return out; })();
function roleCards(perm) {
  const cards = ROLE_SET.map((v) => { const c = new Array(NB).fill(0); v.forEach((x, r) => { c[perm[r]] = x; }); return c; });
  return { cards, answer: 0 };
}

export const LAYOUTS = [
  ['std', { scan: { x: 2, y: 2 }, mdx: -190, mdy: 210, cardX: 226 }],
  ['mirror', { scan: { x: 372, y: 2 }, mdx: 180, mdy: 210, cardX: 2 }],
  ['monitor-top', { scan: { x: 2, y: 234 }, mdx: -190, mdy: 4, cardX: 226 }],
  ['monitor-top-mirror', { scan: { x: 372, y: 234 }, mdx: 180, mdy: 4, cardX: 2 }],
];
export const CARD_ORDERS = [['as-is', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], ['cols-swapped', [2, 1, 0, 5, 4, 3, 8, 7, 6, 11, 10, 9]],
  ['rows-reversed', [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]], ['turned', [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]];
const layoutOf = (env) => (env && env.style && env.assets && env.assets.look ? env.assets.look.layout : null);
const scanAt = (L) => (L ? L.scan : SCAN_AT);
function cardRectL(i, L) {
  if (!L) return cardRect(i);
  return cardRect(L.order[i], L.cardX);
}

export function cardRect(i, x0 = CARDS.x) {
  return { x: x0 + (i % 3) * (CARD.w + CARDS.gap), y: CARDS.y + Math.floor(i / 3) * (CARD.h + CARDS.gap), w: CARD.w, h: CARD.h };
}

function plainView(m, bits, b, cam) {
  const o = objectOf(m, bits);
  o.fams = o.fams.slice(); o.vars = o.vars.slice(); o.fams[b] = 'plain'; o.vars[b] = '-';
  return coarseView(o, cam);
}
function unitFacePx(m, N = 72) { const span = 2.6 + 0.5 * m.Y[NB]; return (N / (2 * span)) ** 2; }

export function gateWhy(m) {
  if (!m || m.task !== NAME || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return 'shape';
  const cam = m.cam;
  if (!cam || !(Math.abs(cam.yaw) >= HARD.yaw[0] && Math.abs(cam.yaw) <= HARD.yaw[1]) || !(cam.elev >= HARD.elev[0] && cam.elev <= HARD.elev[1])) return 'camera';
  if (!Array.isArray(m.Y) || m.Y.length !== NB + 1 || m.Y[0] !== 0) return 'Y';
  for (let b = 0; b < NB; b++) { const h = m.Y[b + 1] - m.Y[b]; if (!(h >= HARD.bandMin - 1e-9 && h <= HARD.bandMax + 1e-9)) return 'band-h'; }
  if (!Array.isArray(m.bands) || m.bands.length !== NB) return 'bands';
  const famCount = {};
  for (let b = 0; b < NB; b++) {
    const { fam, pair } = m.bands[b];
    if (!FAMILIES.includes(fam) || (b < NB - 1 && TOP_ONLY.has(fam)) || (b === 0 && fam === 'step')) return 'family';
    if (!Array.isArray(pair) || pair.length !== NV || new Set(pair).size !== NV || !pair.every((v) => VARIANTS[fam].includes(v))) return 'variant';
    for (let i = 0; i < NV; i++) for (let j = i + 1; j < NV; j++) if (!pairCongruent(fam, pair[i], pair[j])) return 'pair-shape';
    const canon = cam.yaw >= 0 ? pair : pair.map((v) => mirrorLabel(fam, v));
    if (!canon.every((v) => (b < NB - 1 ? LOW_VARS : TOP_VARS)[fam]?.includes(v))) return 'pair-side';
    famCount[fam] = (famCount[fam] || 0) + 1;
  }
  if (Math.max(...Object.values(famCount)) > 2) return 'repeat3';
  if (!Array.isArray(m.cards) || m.cards.length !== NC) return 'cards';
  const keys = new Set(m.cards.map((c) => c.join('')));
  if (keys.size !== NC || !m.cards.every((c) => c.length === NB && c.every((x) => Number.isInteger(x) && x >= 0 && x < NV))) return 'card-bits';
  if (!Number.isInteger(m.answer) || m.answer < 0 || m.answer >= NC) return 'answer';
  const H = m.Y[NB], ans = m.cards[m.answer];
  const ham = (a, b) => a.reduce((s, x, i) => s + (x !== b[i] ? 1 : 0), 0), diffs = (a, b) => a.map((x, i) => (x !== b[i] ? i : -1)).filter((i) => i >= 0);
  const major = Array.from({ length: NB }, (_, b) => {
    const cnt = new Array(NV).fill(0); m.cards.forEach((c) => cnt[c[b]]++);
    const top = Math.max(...cnt); return cnt.filter((n) => n === top).length === 1 ? cnt.indexOf(top) : -1;
  });
  const decoy = m.cards.findIndex((c) => c.every((x, b) => x === major[b]));
  const tot = m.cards.map((c) => m.cards.reduce((s, d) => s + ham(c, d), 0)), mn = Math.min(...tot);
  if (decoy < 0 || decoy === m.answer || tot[decoy] !== mn || tot.filter((t) => t === mn).length !== 1) return 'typical';
  const objs = m.cards.map((c) => objectOf(m, c)), truth = objs[m.answer];
  const sigs = objs.map(signature);
  for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) if (congruent(sigs[a], sigs[b])) return 'congruent';
  for (let j = 0; j < HARD.samples; j++) {
    const y = (j + 0.5) / HARD.samples * H, bj = bandAt(m.Y, y);
    const rs = objs.map((o) => sliceRaster(o, y)), tr = rs[m.answer];
    if (rs.filter((r) => rasterDiff(r, tr) === 0).length < 5) return 'slice-unique';
    for (let i = 0; i < NC; i++) if (m.cards[i][bj] === ans[bj] && rasterDiff(rs[i], tr) !== 0) return 'twin-slice';
    const a0 = rasterArea(rs[0]);
    if (!rs.every((r) => rasterArea(r) === a0)) return 'slice-area';
  }
  const ctr = [], ctrR = objs.map(() => []);
  for (let b = 0; b < NB; b++) { const y = (m.Y[b] + m.Y[b + 1]) / 2; ctr.push(y); objs.forEach((o, i) => ctrR[i].push(sliceRaster(o, y))); }
  const left = (S) => ctrR.filter((r) => S.every((b) => rasterDiff(r[b], ctrR[m.answer][b]) === 0)).length;
  for (let mask = 1; mask < (1 << NB); mask++) {
    const S = [0, 1, 2, 3].filter((b) => (mask >> b) & 1), n = left(S);
    if ((S.length === NB - 1 && n < 2) || (S.length === NB && n !== 1)) return 'scans';
  }
  const yStart = m.t0 * H, trStart = sliceRaster(truth, yStart);
  if (objs.filter((o) => rasterDiff(sliceRaster(o, yStart), trStart) !== 0).length > 3) return 'start-slice';
  for (let b = 0; b < NB; b++) for (let u = 0; u < NV; u++) for (let v = u + 1; v < NV; v++) {
    const R = (x) => sliceRaster(objectOf(m, ans.map((a, q) => (q === b ? x : a))), ctr[b]);
    if (rasterDiff(R(u), R(v)) < HARD.diffMin) return 'variant-slice';
  }
  for (let c = 0; c < NC; c++) {
    if (c === m.answer) continue;
    let best = 0;
    for (let b = 0; b < NB; b++) { const y = (m.Y[b] + m.Y[b + 1]) / 2; best = Math.max(best, rasterDiff(sliceRaster(objs[c], y), sliceRaster(truth, y))); }
    if (best < HARD.diffMin) return 'distractor-close';
  }
  const U = unitFacePx(m), views = new Map();
  const view = (bits) => { const k = bits.join(''); if (!views.has(k)) views.set(k, coarseView(objectOf(m, bits), cam)); return views.get(k); };
  for (let i = 0; i < NC; i++) {
    const A = view(m.cards[i]);
    for (let b = 0; b < NB; b++) if (viewDiff(A, plainView(m, m.cards[i], b, cam)).n < HARD.visFeat * U) return 'vis-feat';
    for (let j = i + 1; j < NC; j++) if (ham(m.cards[i], m.cards[j]) === 1 && viewDiff(A, view(m.cards[j])).n < HARD.visPair * U) return 'vis-pair';
  }
  if (!(m.t0 >= T_MIN && m.t0 <= T_MAX)) return 't0';
  const y0 = m.t0 * H, b0 = bandAt(m.Y, y0);
  if (y0 - m.Y[b0] < HARD.t0Margin || m.Y[b0 + 1] - y0 < HARD.t0Margin) return 't0-margin';
  return planOracle(m).length <= 12 ? '' : 'oracle';
}
export function gate(m) { return gateWhy(m) === ''; }

export function semanticKey(m) {
  const canon = (fam, v) => (m.cam.yaw >= 0 ? v : mirrorLabel(fam, v));
  const obj = (bits) => m.bands.map((b, i) => `${b.fam}:${canon(b.fam, b.pair[bits[i]])}`).join('/');
  return `scan_slices_pick|${m.cards.map(obj).sort().join('|')}|answer:${obj(m.cards[m.answer])}`;
}
const EVAL_KEYS = new Set(["fc140e74", "bdd2ce98", "171ba6fd", "8aed32a7", "756fd08c", "4250dae1", "56131ac3", "387c7d97", "4179661f", "b4b6e48a", "af6c4cf8", "30c14154"]);

function pickW(rng, table) {
  const tot = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.uniform(0, tot);
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return table[table.length - 1][0];
}
const randomCam = (rng) => { const sg = rng.sign(); return { yaw: Math.round(sg * rng.uniform(HARD.yaw[0], HARD.yaw[1]) * 10) / 10, elev: Math.round(rng.uniform(HARD.elev[0], HARD.elev[1]) * 10) / 10 }; };
function assemble(rng, cam, fams, pairs, perm, ext) {
  const sg = cam.yaw >= 0 ? 1 : -1;
  const bands = fams.map((fam, b) => ({ fam, pair: sg > 0 ? pairs[b] : pairs[b].map((v) => mirrorLabel(fam, v)) }));
  const rc = roleCards(perm), cards = rng.shuffle(rc.cards.map((c) => c.slice()));
  const answer = cards.findIndex((c) => c.join('') === rc.cards[rc.answer].join(''));
  const Y = [0];
  for (let b = 0; b < NB; b++) Y.push(r2(Y[b] + r2(rng.uniform(HARD.bandMin, HARD.bandMax))));
  const b0 = rng.pick([0, 1, 2, 3].filter((b) => b !== perm[0])), f0 = rng.uniform(0.32, 0.68);
  const t0 = qT((Y[b0] + f0 * (Y[b0 + 1] - Y[b0])) / Y[NB]);
  return { task: NAME, board: { ...BOARD }, cam, Y, bands, cards, answer, t0, ...(ext ? { ext } : {}),
    gtContract: 'the card whose object has, band by band, the slices the scanner shows' };
}
export function tryBuild(rng, ext = null) {
  const cam = randomCam(rng);
  const fams = [pickW(rng, BAND_W[0]), pickW(rng, BAND_W[1]), pickW(rng, BAND_W[1]), pickW(rng, TOP_W)];
  const rep = rng.raw() < HARD.repeatP ? rng.int(0, NB - 2) : -1;
  if (rep >= 0) fams[rep] = fams[rep + 1] = rng.pick(REPEAT_FAMS);
  const cnt = {};
  for (const f of fams) cnt[f] = (cnt[f] || 0) + 1;
  if (Math.max(...Object.values(cnt)) > 2) return null;
  const pairs = fams.map((fam, b) => rng.shuffle(poolOf(fam, b).slice()).slice(0, NV));
  return assemble(rng, cam, fams, pairs, rng.pick(PERMS), ext);
}

let EXT_FAMQ = null;
function extFamq() {
  if (EXT_FAMQ) return EXT_FAMQ;
  const list = [], pairsOf = (fam, b) => { const pool = poolOf(fam, b); return pool.flatMap((x, i) => pool.flatMap((y, j) => (j === i ? [] : pool.flatMap((z, k) => (k === i || k === j ? [] : [[x, y, z]]))))); };
  const famsLow = BAND_W[0].map(([f]) => f), famsMid = BAND_W[1].map(([f]) => f), famsTop = TOP_W.map(([f]) => f);
  let cum = 0;
  for (const f0 of famsLow) for (const f1 of famsMid) for (const f2 of famsMid) for (const f3 of famsTop) {
    const fams = [f0, f1, f2, f3], cnt = {};
    for (const f of fams) cnt[f] = (cnt[f] || 0) + 1;
    if (Math.max(...Object.values(cnt)) > 2) continue;
    const pairs = fams.map((f, b) => pairsOf(f, b)), n = pairs.reduce((p, l) => p * l.length, 1) * PERMS.length;
    list.push({ fams, pairs, start: cum, n }); cum += n;
  }
  return (EXT_FAMQ = { list, total: cum });
}
function extClass(i) {
  const e = extFamq().list.find((x) => i >= x.start && i < x.start + x.n);
  let r = i - e.start;
  const perm = PERMS[r % PERMS.length]; r = Math.floor(r / PERMS.length);
  const pairs = e.pairs.map((l) => { const p = l[r % l.length]; r = Math.floor(r / l.length); return p; });
  return { fams: e.fams, pairs, perm };
}
function classKey(c) {
  const rc = roleCards(c.perm);
  return semanticKey({ cam: { yaw: 1 }, bands: c.fams.map((fam, b) => ({ fam, pair: c.pairs[b] })), cards: rc.cards, answer: rc.answer });
}
function buildFromClass(rng, c, split) {
  return assemble(rng, randomCam(rng), c.fams, c.pairs, c.perm, split);
}
function generateExt(rng, split, n) {
  const N = extFamq().total;
  for (let j = 0; j < 200; j++) {
    const c = extClass(nthOf(`${NAME}|${split}|class`, (n || 1) + 100 * j, N));
    const k = classKey(c);
    if (!K.keyAccept(k, split, EVAL_KEYS)) continue;
    for (let t = 0; t < 30; t++) { const m = buildFromClass(rng, c, split); if (gate(m)) return m; }
  }
  throw new Error(`${NAME}: no training instance (ext)`);
}

function planOracle(m) {
  const H = m.Y[NB], b0 = bandAt(m.Y, m.t0 * H), acts = [];
  for (let b = 0; b < NB; b++) if (b !== b0) acts.push({ op: 'scan', t: qT((m.Y[b] + m.Y[b + 1]) / 2 / H) });
  acts.push({ op: 'pick', card: m.answer });
  return acts;
}

function headPoint(m, cam, t) { const [px, pz] = postXZ(m); return cam.project(px, BED_Y + t * m.Y[NB], pz); }
function solveT(m, yAt, y) {
  if (y >= yAt(0)) return T_MIN;
  if (y <= yAt(1)) return T_MAX;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (yAt(mid) > y) lo = mid; else hi = mid; }
  return qT((lo + hi) / 2);
}
function tFromPointer(m, cam, x, y) {
  const sg = m.cam.yaw >= 0 ? 1 : -1, B = BOX_OUT, H = m.Y[NB], [px, pz] = postXZ(m);
  const hx = cam.project(px, BED_Y + 0.5 * H, pz).x;
  if (Math.abs(x - hx) < 12) return solveT(m, (t) => headPoint(m, cam, t).y, y);
  const walls = [
    (u, yy) => cam.project(-sg * B + u * 2 * sg * B, yy, B),
    (u, yy) => cam.project(sg * B, yy, -B + u * 2 * B),
  ];
  const mid = BED_Y + 0.5 * H;
  let best = null;
  for (const W of walls) {
    const x0 = W(0, mid).x, x1 = W(1, mid).x;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const xc = Math.max(lo, Math.min(hi, x)), d = Math.abs(x - xc);
    let a = 0, b = 1;
    for (let k = 0; k < 24; k++) { const c = (a + b) / 2; if ((W(c, mid).x < xc) === (x0 < x1)) a = c; else b = c; }
    const u = (a + b) / 2;
    if (!best || d < best.d) best = { d, W, u };
  }
  return solveT(m, (t) => best.W(best.u, BED_Y + t * H).y, y);
}
function onScanLine(m, cam, t, x, y) {
  const head = headPoint(m, cam, t);
  if (Math.hypot(x - head.x, y - head.y) <= 18) return true;
  const sg = m.cam.yaw >= 0 ? 1 : -1, B = BOX_OUT, yy = BED_Y + t * m.Y[NB];
  const line = [cam.project(-sg * B, yy, B), cam.project(sg * B, yy, B), cam.project(sg * B, yy, -B)];
  for (let i = 0; i < 2; i++) {
    const a = line[i], dx = line[i + 1].x - a.x, dy = line[i + 1].y - a.y;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(x - a.x - u * dx, y - a.y - u * dy) <= 12) return true;
  }
  return false;
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function drawScanOverlay(g, m, cam, t, pal = null) {
  const SC = pal ? pal.sheet : [64, 196, 240];
  const sg = m.cam.yaw >= 0 ? 1 : -1, H = m.Y[NB], B = BOX_OUT, y = BED_Y + t * H, top = BED_Y + H + WALL;
  const [px, pz] = postXZ(m);
  const P = (x, yy, z) => { const q = cam.project(x, yy, z); return [q.x, q.y]; };
  const e = 0.42, xs = sg > 0 ? [px, B + e] : [-B - e, px];
  const sheet = [P(xs[0], y, -B - e), P(xs[1], y, -B - e), P(xs[1], y, B + e), P(xs[0], y, B + e)];
  const upper = [];
  for (const xx of [-B, B]) for (const yy of [y, top]) for (const zz of [-B, B]) upper.push(P(xx, yy, zz));
  const hu = hull(upper);
  g.save();
  g.beginPath(); g.rect(-50, -50, SCAN.w + 100, SCAN.h + 100);
  g.moveTo(hu[0][0], hu[0][1]); for (const q of hu.slice(1)) g.lineTo(q[0], q[1]); g.closePath();
  g.clip('evenodd');
  g.beginPath(); g.moveTo(sheet[0][0], sheet[0][1]); for (const q of sheet.slice(1)) g.lineTo(q[0], q[1]); g.closePath();
  g.fillStyle = pal ? `rgba(${SC},0.20)` : 'rgba(64,196,240,0.20)'; g.fill();
  g.strokeStyle = pal ? `rgba(${SC},0.55)` : 'rgba(64,196,240,0.55)'; g.lineWidth = 1; g.stroke();
  g.restore();
  const line = [P(-sg * B, y, B), P(sg * B, y, B), P(sg * B, y, -B)];
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const LC = pal ? [[6, `rgba(${SC},0.28)`], [3, `rgba(${SC.map((v) => Math.min(255, v + 40))},0.65)`], [1.3, 'rgba(244,250,255,1)']]
    : [[6, 'rgba(80,210,255,0.28)'], [3, 'rgba(120,225,255,0.65)'], [1.3, 'rgba(240,252,255,1)']];
  for (const [w, c] of LC) {
    g.beginPath(); g.moveTo(line[0][0], line[0][1]); g.lineTo(line[1][0], line[1][1]); g.lineTo(line[2][0], line[2][1]);
    g.strokeStyle = c; g.lineWidth = w; g.stroke();
  }
  g.restore();
  g.save(); g.strokeStyle = 'rgba(60,68,76,0.75)'; g.lineWidth = 1;
  for (let k = 0; k <= 10; k++) {
    const yy = BED_Y + k / 10 * H, a = P(px + sg * POST_HW, yy, pz + POST_HW), b = P(px + sg * POST_HW + sg * (k % 5 === 0 ? 0.22 : 0.13), yy, pz + POST_HW);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  g.restore();
  const hw = 0.26, hh = 0.13;
  const corner = (dx, dy, dz) => P(px + dx, y + dy, pz + dz);
  const faces = [
    { pts: [corner(-hw, hh, -hw), corner(hw, hh, -hw), corner(hw, hh, hw), corner(-hw, hh, hw)], c: '#5b646d' },
    { pts: [corner(-hw, -hh, hw), corner(hw, -hh, hw), corner(hw, hh, hw), corner(-hw, hh, hw)], c: '#3d454d' },
    { pts: [corner(sg * hw, -hh, -hw), corner(sg * hw, -hh, hw), corner(sg * hw, hh, hw), corner(sg * hw, hh, -hw)], c: '#2f363d' },
  ];
  for (const f of faces) {
    g.beginPath(); g.moveTo(f.pts[0][0], f.pts[0][1]); for (const q of f.pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath();
    g.fillStyle = f.c; g.fill(); g.strokeStyle = 'rgba(20,24,28,0.6)'; g.lineWidth = 0.8; g.stroke();
  }
  const l0 = corner(sg * hw, 0, -hw * 0.7), l1 = corner(sg * hw, 0, hw * 0.7);
  g.beginPath(); g.moveTo(l0[0], l0[1]); g.lineTo(l1[0], l1[1]); g.strokeStyle = pal ? `rgb(${SC.map((v) => Math.min(255, v + 60))})` : '#8fe6ff'; g.lineWidth = 2; g.stroke();
}

function drawHousing(g, hs, pal) {
  const { x, y, w, h } = hs, light = !!hs.light, body = light ? '#e9ecef' : (hs.id === 'crt' ? '#cfc8b8' : pal.bezel);
  g.fillStyle = '#b9c0c7';
  if (hs.stand === 'foot') { g.fillRect(x + w / 2 - 7, y + h, 14, 10); g.fillStyle = '#c9cfd5'; rr(g, x + w / 2 - 30, y + h + 9, 60, 6, 3); g.fill(); }
  else if (hs.stand === 'arm') { g.fillRect(x + w - 26, y + h, 8, 18); g.fillRect(x + w - 26, y + h + 14, 34, 6); }
  else if (hs.stand === 'easel') { g.beginPath(); g.moveTo(x + w * 0.3, y + h); g.lineTo(x + w * 0.22, y + h + 16); g.moveTo(x + w * 0.7, y + h); g.lineTo(x + w * 0.78, y + h + 16); g.strokeStyle = '#9aa3ab'; g.lineWidth = 4; g.stroke(); }
  else if (hs.stand === 'block') { g.fillStyle = '#bfb8a8'; rr(g, x + 20, y + h - 4, w - 40, 14, 4); g.fill(); }
  else if (hs.stand === 'pole') { g.fillRect(x + w / 2 - 4, y + h, 8, 22); }
  else if (hs.stand === 'keyboard') {
    g.fillStyle = light ? '#d9dde1' : '#596169'; g.beginPath(); g.moveTo(x - 2, y + h + 2); g.lineTo(x + w + 2, y + h + 2); g.lineTo(x + w + 0, y + h + 30); g.lineTo(x, y + h + 30); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) g.fillRect(x + 10 + c * 11.3, y + h + 6 + r * 7, 9, 5);
  }
  g.save();
  g.shadowColor = 'rgba(20,30,40,0.25)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  rr(g, x, y, w, h, hs.r); g.fillStyle = body; g.fill();
  g.restore();
  if (hs.buttons) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + w - hs.bezel / 2, y + 30 + i * 18, 2.5, 0, Math.PI * 2); g.fillStyle = i ? '#7f8a94' : '#5bd18a'; g.fill(); }
}
function drawSlice(g, m, t, pal, sx, sy, sw, sh) {
  rr(g, sx, sy, sw, sh, 4); g.fillStyle = pal.bg; g.fill();
  const S = Math.min(sw, sh) - 24, ox = sx + (sw - S) / 2, oy = sy + (sh - S) / 2 - 4, k = S / (2 * BOX_HALF);
  g.strokeStyle = pal.frame; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, S + 2, S + 2);
  g.fillStyle = '#e0473a'; rr(g, ox + S * 0.3, oy + S + 4, S * 0.4, 4, 2); g.fill();
  const obj = objectOf(m, m.cards[m.answer]);
  const rects = sliceRects(obj, t * m.Y[NB]);
  g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip();
  g.beginPath();
  for (const r of rects) g.rect(ox + (r[0] + BOX_HALF) * k, oy + (r[2] + BOX_HALF) * k, (r[1] - r[0]) * k, (r[3] - r[2]) * k);
  g.fillStyle = pal.fill; g.fill('nonzero');
  g.restore();
}
function drawMonitor(g, m, t, pal = null, hs = null) {
  const { x, y, w, h } = hs || MON;
  if (hs) { drawHousing(g, hs, pal); drawSlice(g, m, t, pal, x + hs.bezel, y + hs.bezel, w - 2 * hs.bezel, h - 2 * hs.bezel - 8 * 0); return; }
  g.fillStyle = '#b9c0c7'; g.fillRect(x + w / 2 - 7, y + h - 12, 14, 10);
  g.fillStyle = '#c9cfd5'; rr(g, x + w / 2 - 30, y + h - 3, 60, 6, 3); g.fill();
  g.save();
  g.shadowColor = 'rgba(20,30,40,0.25)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  rr(g, x, y, w, h - 8, 10); g.fillStyle = pal ? pal.bezel : '#252c33'; g.fill();
  g.restore();
  const sx = x + 8, sy = y + 8, sw = w - 16, sh = h - 24;
  rr(g, sx, sy, sw, sh, 5); g.fillStyle = pal ? pal.bg : '#0f1a23'; g.fill();
  const S = Math.min(sw, sh) - 22, ox = sx + (sw - S) / 2, oy = sy + (sh - S) / 2 - 2, k = S / (2 * BOX_HALF);
  g.strokeStyle = pal ? pal.frame : '#5d7182'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, S + 2, S + 2);
  g.fillStyle = '#e0473a'; rr(g, ox + S * 0.3, oy + S + 4, S * 0.4, 4, 2); g.fill();
  const obj = objectOf(m, m.cards[m.answer]);
  const rects = sliceRects(obj, t * m.Y[NB]);
  g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip();
  g.beginPath();
  for (const r of rects) g.rect(ox + (r[0] + BOX_HALF) * k, oy + (r[2] + BOX_HALF) * k, (r[1] - r[0]) * k, (r[3] - r[2]) * k);
  g.fillStyle = pal ? pal.fill : '#cdeefc'; g.fill('nonzero');
  g.restore();
}

export default {
  meta: {
    name: NAME, family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'scan', t: 'scan height as a fraction of the box height, 0.01..0.99 (drag on the scanner picture)' },
      { op: 'pick', card: '0..11 (the 3 x 4 card grid in reading order: left to right, top row first; a re-pick replaces the pick until Verify)' },
    ],
    promptHuman: 'Scan the box. Which object is inside?',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    for (let a = 0; a < 300; a++) { const m = tryBuild(rng); if (m && gate(m)) return m; }
    throw new Error(`${NAME}: generator exhausted`);
  },

  init(m) { return { t: m.t0, pick: -1 }; },

  applyAction(s, a) {
    if (a?.op === 'scan') {
      if (typeof a.t !== 'number' || !Number.isFinite(a.t)) return { ok: false, reason: 'bad-t' };
      s.t = qT(a.t); return { ok: true };
    }
    if (a?.op === 'pick') {
      if (!Number.isInteger(a.card) || a.card < 0 || a.card >= NC) return { ok: false, reason: 'bad-card' };
      s.pick = a.card; return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(s, m) {
    const ok = s.pick === m.answer;
    return { success: ok, partial: ok ? 1 : 0, error: ok ? 0 : 1, detail: { picked: s.pick } };
  },

  oracle(m) { return planOracle(m); },

  oraclePoints(m, env) {
    const cam = env && env.assets && env.assets.ssp && env.assets.ssp.scanCam;
    if (!cam) return null;
    const SA = scanAt(layoutOf(env)), at = (t) => { const p = headPoint(m, cam, t); return [SA.x + p.x, SA.y + p.y]; };
    let t = m.t0;
    return planOracle(m).map((a) => { if (a.op !== 'scan') return null; const g = { from: at(t), to: at(a.t) }; t = a.t; return g; });
  },

  randomPolicy(m, rnd) {
    const acts = [], n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) acts.push({ op: 'scan', t: T_MIN + rnd() * (T_MAX - T_MIN) });
    acts.push({ op: 'pick', card: Math.floor(rnd() * NC) });
    return acts;
  },

  async mount(env) {
    env.assets.ssp = { key: '', drag: false };
    if (env.style) {
      const look = await styleLook(env.style);
      const [, lay] = K.splitPick(env.style, NAME, 'layout', LAYOUTS);
      const [, order] = K.splitPick(env.style, NAME, 'card_order', CARD_ORDERS);
      look.layout = { ...lay, order };
      env.assets.look = look;
    }
  },

  drawPrompt(g, r) { drawPromptText(g, r, 'Scan the box. Which object is inside?', 'Drag the scan line. Red marks the front.'); },

  _cache(g, env) {
    const m = env.manifest, A = env.assets.ssp || (env.assets.ssp = { key: '', drag: false });
    const look = env.style ? env.assets.look || null : null;
    const q = contextScale(g), key = look ? `${q}|${env.style.key}` : `${q}`;
    if (A.key !== key) {
      const cc = cardCamera(m);
      A.cards = m.cards.map((bits) => toCanvas(render(cardScene(m, objectOf(m, bits), cc, look), q)));
      A.scanCam = scanCamera(m);
      A.scan = toCanvas(render(scanScene(m, A.scanCam, look), q));
      A.key = key;
    }
    return A;
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env;
    const A = this._cache(g, env);
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    const LY = layoutOf(env), SA = scanAt(LY);
    g.save(); g.translate(SA.x, SA.y);
    rr(g, 0, 0, SCAN.w, SCAN.h, 7); g.save(); g.clip();
    g.drawImage(A.scan, 0, 0, SCAN.w, SCAN.h);
    const pal = env.style && env.assets.look ? env.assets.look.mon : null;
    if (pal) drawScanOverlay(g, m, A.scanCam, s.t, pal); else drawScanOverlay(g, m, A.scanCam, s.t);
    g.restore();
    g.restore();
    if (pal) { const hs = env.assets.look.housing, L0 = LY || LAYOUTS[0][1]; drawMonitor(g, m, s.t, pal, { ...hs, x: hs.x + L0.mdx, y: hs.y + L0.mdy }); } else drawMonitor(g, m, s.t);
    for (let i = 0; i < NC; i++) {
      const R = cardRectL(i, LY);
      g.save(); rr(g, R.x, R.y, R.w, R.h, 7); g.clip(); g.drawImage(A.cards[i], R.x, R.y, R.w, R.h); g.restore();
      rr(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 7);
      const on = i === s.pick;
      g.strokeStyle = on ? ACCENT : '#cfd8e1'; g.lineWidth = on ? 3 : 1.2; g.stroke();
      if (on) {
        g.fillStyle = ACCENT; g.beginPath(); g.arc(R.x + 14, R.y + 14, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `800 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('✓', R.x + 14, R.y + 14.5);
      }
    }
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted) return [];
    const A = env.assets.ssp || (env.assets.ssp = { key: '', drag: false });
    const LY = layoutOf(env), SA = scanAt(LY);
    const inScan = e.x >= SA.x && e.x <= SA.x + SCAN.w && e.y >= SA.y && e.y <= SA.y + SCAN.h;
    if (e.type === 'down') {
      A.drag = false;
      if (inScan) {
        if (!A.scanCam || !onScanLine(env.manifest, A.scanCam, env.state.t, e.x - SA.x, e.y - SA.y)) return [];
        A.drag = true; return [{ op: 'scan', t: tFromPointer(env.manifest, A.scanCam, e.x - SA.x, e.y - SA.y) }];
      }
      for (let i = 0; i < NC; i++) {
        const R = cardRectL(i, LY);
        if (e.x >= R.x && e.x <= R.x + R.w && e.y >= R.y && e.y <= R.y + R.h) return [{ op: 'pick', card: i }];
      }
      return [];
    }
    if (e.type === 'move' && A.drag && A.scanCam) {
      const t = tFromPointer(env.manifest, A.scanCam, e.x - SA.x, e.y - SA.y);
      return t === env.state.t ? [] : [{ op: 'scan', t }];
    }
    if (e.type === 'up') A.drag = false;
    return [];
  },

  footerStatus(env) { return env.state.pick >= 0 ? '1 object selected' : 'Pick the object in the box'; },
};
