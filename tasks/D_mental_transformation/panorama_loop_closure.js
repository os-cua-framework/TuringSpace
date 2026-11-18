import { loadEmoji } from '../core/assets.js';
import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { themesOf, themeById, pickKinds, panoLook, drawPlace } from '../common/_panorama_loop_closure_look.js';

const BOARD = { w: 340, h: 300 };
const STRIP = { x: 8, y: 8, w: 324, h: 128 };
const GROUND = STRIP.y + 96;
const CARD = { x: 8, y: 152, w: 102, h: 136, gap: 9 };
const CARD_SCALE = 0.88;
const HARD = { n: 9, twins: 4, singles: 1, icon: 32, hit: 19 };
const SLUGS = ['evergreen_tree', 'deciduous_tree', 'palm_tree', 'cactus',
  'automobile', 'bus', 'taxi', 'tractor', 'sunflower', 'umbrella'];

const slotX = (i) => STRIP.x + STRIP.w * (i + 0.5) / HARD.n;
const ICON_Y = GROUND - HARD.icon / 2;

function drawStreet(g, m, icons, picks) {
  const sky = g.createLinearGradient(0, STRIP.y, 0, GROUND);
  sky.addColorStop(0, '#bfe3f6'); sky.addColorStop(1, '#eef8fc');
  g.fillStyle = sky; g.fillRect(STRIP.x - 200, STRIP.y, STRIP.w + 400, GROUND - STRIP.y);
  g.fillStyle = '#d6e9d2';
  g.beginPath(); g.moveTo(STRIP.x - 200, GROUND);
  for (let x = STRIP.x - 200; x <= STRIP.x + STRIP.w + 200; x += 18) g.lineTo(x, GROUND - 26 - 10 * Math.sin(x / 37) - 6 * Math.sin(x / 13 + 1));
  g.lineTo(STRIP.x + STRIP.w + 200, GROUND); g.closePath(); g.fill();
  g.fillStyle = '#e4ddcc'; g.fillRect(STRIP.x - 200, GROUND, STRIP.w + 400, 9);
  g.fillStyle = '#8f959c'; g.fillRect(STRIP.x - 200, GROUND + 9, STRIP.w + 400, STRIP.y + STRIP.h - GROUND - 9);
  g.strokeStyle = '#f2eede'; g.lineWidth = 2; g.setLineDash([10, 8]);
  g.beginPath(); g.moveTo(STRIP.x - 200, GROUND + 18); g.lineTo(STRIP.x + STRIP.w + 200, GROUND + 18); g.stroke(); g.setLineDash([]);
  for (const l of m.landmarks) {
    const img = icons?.[l.slug], s = HARD.icon;
    if (img) g.drawImage(img, l.x - s / 2, l.y - s / 2, s, s);
    else { g.fillStyle = '#8b9aa5'; g.fillRect(l.x - s / 2, l.y - s / 2, s, s); }
  }
}

const D2 = 'rows2';
const BOARD2 = { w: 640, h: 340 };
const STRIP2 = { x: 8, y: 8, w: 624, h: 140 };
const GROUND2 = STRIP2.y + 104;
const ROWS = [{ size: 34, lift: 0 }, { size: 24, lift: 18 }];
const CARD2 = { y: 160, w: 200, h: 172, gap: 12 };
const PH2 = { half: 75, core: 61, zoom: 190 / 150 };
const X2 = { n: 14, kinds: 3, pBack: 0.42, pFlip: 0.2, margin: 22, sep: 20, decoys: 2, centreClear: 18, hit: 17 };
const is2 = (m) => !!(m && m.design === D2);
const minGap2 = (ra, rb) => (ra === rb ? ROWS[ra].size + 3 : 25);
const iconY2 = (row) => GROUND2 - ROWS[row].lift - ROWS[row].size / 2;

function windowOf(m, x, half) {
  return m.landmarks.filter((l) => Math.abs(l.x - x) <= half).map((l) => ({ id: l.id, slug: l.slug, row: l.row, dx: l.x - x }));
}
function covered(A, B, tol) { return A.filter((o) => Math.abs(o.dx) <= PH2.core).every((o) => B.some((q) => q.slug === o.slug && q.row === o.row && Math.abs(q.dx - o.dx) < tol)); }
const sameLook = (m, a, b, tol) => { const A = windowOf(m, a.x, PH2.half), B = windowOf(m, b.x, PH2.half); return covered(A, B, tol) && covered(B, A, tol); };
const inView = (o, x) => { const d = Math.abs(o.x - x), h = ROWS[o.row].size / 2; return d <= PH2.half - h ? 'whole' : d <= PH2.half ? 'most' : d <= PH2.half + h ? 'sliver' : ''; };
const seenSig = (m, l) => m.landmarks.filter((o) => inView(o, l.x)).map((o) => `${o.slug}/${o.row}/${inView(o, l.x)}`).join(',');

function problems2(m) {
  const P = [];
  if (!is2(m) || m.task !== 'panorama_loop_closure' || !Array.isArray(m.landmarks) || m.landmarks.length !== X2.n) return ['shape'];
  if (!Array.isArray(m.targetIds) || m.targetIds.length !== 3 || new Set(m.targetIds).size !== 3) return ['targets'];
  const L = m.landmarks, kinds = [...new Set(L.map((l) => l.slug))];
  if (kinds.length !== X2.kinds || !L.every((l, i) => l.slug === L[i % 3].slug && l.id === i)) P.push('kind-cycle');
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (![0, 1].includes(l.row) || Math.abs(l.y - iconY2(l.row)) > 0.06) P.push('row');
    if (l.x - ROWS[l.row].size / 2 < STRIP2.x + 4 || l.x + ROWS[l.row].size / 2 > STRIP2.x + STRIP2.w - 4) P.push('strip');
    if (i && l.x - L[i - 1].x < minGap2(L[i - 1].row, l.row) - 1e-6) P.push('overlap');
    if (i > 1 && L[i - 2].row === l.row && l.x - L[i - 2].x < ROWS[l.row].size + 3) P.push('overlap2');
  }
  for (const t of m.targetIds) {
    const T = L[t];
    if (!T) { P.push('target'); continue; }
    if (m.targetIds.some((u) => u !== t && L[u] && Math.abs(L[u].x - T.x) <= PH2.half)) P.push('photos-overlap');
    if (T.x - PH2.half < STRIP2.x || T.x + PH2.half > STRIP2.x + STRIP2.w) P.push('photo-off-street');
    if (L.some((l) => l.id !== t && Math.abs(l.x - T.x) < X2.centreClear)) P.push('centre-ambiguous');
    if (L.some((l) => l.id !== t && sameLook(m, T, l, X2.sep))) P.push('look-alike');
    if (nDecoys(m, T) < X2.decoys) P.push('no-spacing-decoy');
  }
  return [...new Set(P)];
}

function generate2(rng) {
  const r1 = (v) => Math.round(v * 10) / 10;
  for (let att = 0; att < 300000; att++) {
    const kinds = rng.shuffle(SLUGS).slice(0, X2.kinds);
    const base = [0, 1, 2].map(() => (rng.raw() < X2.pBack ? 1 : 0));
    const rows = Array.from({ length: X2.n }, (_, i) => base[i % 3] ^ (rng.raw() < X2.pFlip ? 1 : 0));
    const mins = rows.slice(1).map((r, i) => minGap2(rows[i], r));
    const spare = STRIP2.w - 2 * X2.margin - mins.reduce((a, b) => a + b, 0);
    if (spare < 0) continue;
    const w = mins.map(() => -Math.log(1 - rng.raw() * 0.999)), wt = w.reduce((a, b) => a + b, 0);
    const xs = [STRIP2.x + X2.margin];
    mins.forEach((g, i) => xs.push(xs.at(-1) + g + spare * w[i] / wt));
    const landmarks = xs.map((x, i) => ({ id: i, slug: kinds[i % 3], row: rows[i], x: r1(x), y: r1(iconY2(rows[i])) }));
    const m0 = { task: 'panorama_loop_closure', design: D2, board: BOARD2, panel: { panelWidth: BOARD2.w + 20, boardH: BOARD2.h + 10 },
      landmarks, hit: X2.hit };
    const sigs = landmarks.map((l) => seenSig(m0, l));
    const ok = landmarks.filter((T) => nDecoys(m0, T, sigs) >= X2.decoys && !SPOT_CHECKS.some((p) => onlyFor(m0, T, p)));
    const pickT = [];
    for (const l of rng.shuffle(ok)) if (pickT.length < 3 && pickT.every((q) => Math.abs(q.x - l.x) > PH2.half)) pickT.push(l);
    if (pickT.length < 3) continue;
    const m = { ...m0, targetIds: pickT.map((l) => l.id) };
    if (problems2(m).length === 0) return m;
  }
  throw new Error('panorama_loop_closure: generator exhausted');
}
const SPOT_CHECKS = ['photo-off-street', 'centre-ambiguous', 'look-alike', 'no-spacing-decoy'];
function onlyFor(m, T, p) {
  const L = m.landmarks;
  if (p === 'photo-off-street') return T.x - PH2.half < STRIP2.x || T.x + PH2.half > STRIP2.x + STRIP2.w;
  if (p === 'centre-ambiguous') return L.some((l) => l.id !== T.id && Math.abs(l.x - T.x) < X2.centreClear);
  if (p === 'look-alike') return L.some((l) => l.id !== T.id && sameLook(m, T, l, X2.sep));
  if (p === 'no-spacing-decoy') return nDecoys(m, T) < X2.decoys;
  return false;
}
function nDecoys(m, T, sigs = m.landmarks.map((l) => seenSig(m, l))) {
  return sigs.filter((s, i) => i !== T.id && s === sigs[T.id]).length;
}

function drawStreet2(g, m, icons) {
  const S = STRIP2, G = GROUND2;
  const sky = g.createLinearGradient(0, S.y, 0, G);
  sky.addColorStop(0, '#bfe3f6'); sky.addColorStop(1, '#eef8fc');
  g.fillStyle = sky; g.fillRect(S.x - 200, S.y, S.w + 400, G - S.y);
  g.fillStyle = '#d6e9d2'; g.fillRect(S.x - 200, G - 36, S.w + 400, 36);
  g.fillStyle = '#c9dfc4'; g.fillRect(S.x - 200, G - ROWS[1].lift - 1, S.w + 400, 3);
  g.fillStyle = '#e4ddcc'; g.fillRect(S.x - 200, G, S.w + 400, 9);
  g.fillStyle = '#8f959c'; g.fillRect(S.x - 200, G + 9, S.w + 400, S.y + S.h - G - 9);
  g.fillStyle = '#f2eede'; g.fillRect(S.x - 200, G + 19, S.w + 400, 2);
  for (const row of [1, 0]) for (const l of m.landmarks) {
    if (l.row !== row) continue;
    const img = icons?.[l.slug], s = ROWS[row].size;
    if (img) g.drawImage(img, l.x - s / 2, l.y - s / 2, s, s);
    else { g.fillStyle = '#8b9aa5'; g.fillRect(l.x - s / 2, l.y - s / 2, s, s); }
  }
}
function drawBoard2(g, br, env) {
  const { manifest: m, state } = env, icons = env.assets.icons;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, br.w, br.h);
  const round = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const S = STRIP2;
  g.save(); round(S.x, S.y, S.w, S.h, 10); g.clip(); drawStreet2(g, m, icons); g.restore();
  round(S.x, S.y, S.w, S.h, 10); g.strokeStyle = '#c9d1d8'; g.lineWidth = 1; g.stroke();
  state.picks.forEach((id, k) => {
    const l = m.landmarks[id], y = l.y - ROWS[l.row].size / 2 - 13;
    g.beginPath(); g.moveTo(l.x, y + 13); g.lineTo(l.x - 5, y + 5); g.lineTo(l.x + 5, y + 5); g.closePath(); g.fillStyle = ACCENT; g.fill();
    g.beginPath(); g.arc(l.x, y, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(k + 1), l.x, y + 0.5);
  });
  m.targetIds.forEach((tid, k) => {
    const rx = S.x + k * (CARD2.w + CARD2.gap), ry = CARD2.y, pad = 5;
    g.save(); g.shadowColor = 'rgba(30,40,50,.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    round(rx, ry, CARD2.w, CARD2.h, 6); g.fillStyle = '#fff'; g.fill(); g.restore();
    const ix = rx + pad, iy = ry + pad, iw = CARD2.w - 2 * pad, ih = CARD2.h - 2 * pad - 20;
    const l = m.landmarks[tid], z = PH2.zoom, cyS = GROUND2 - 26;
    g.save(); round(ix, iy, iw, ih, 3); g.clip();
    g.translate(ix + iw / 2, iy + ih / 2); g.scale(z, z); g.translate(-l.x, -cyS);
    drawStreet2(g, m, icons);
    g.restore();
    const cx = ix + iw / 2, cy = iy + ih / 2 + (iconY2(1) + iconY2(0)) / 2 * z - cyS * z, h = 30;
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(cx + sx * 18, cy + sy * (h - 8)); g.lineTo(cx + sx * 18, cy + sy * h); g.lineTo(cx + sx * 10, cy + sy * h); g.stroke();
    }
    const done = state.picks.length > k;
    g.fillStyle = done ? ACCENT : '#5b6b78'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`Photo ${k + 1}`, rx + CARD2.w / 2, ry + CARD2.h - 12);
  });
  g.restore();
}

const D3 = 'persp';
const BOARD3 = { w: 760, h: 362 };
const STRIP3 = { x: 8, y: 8, w: 744, h: 140 };
const GROUND3 = STRIP3.y + 104;
const ROWS3 = [{ size: 34, lift: 0 }, { size: 24, lift: 32 }];
const CARD3 = { y: 160, w: 240, h: 194, gap: 12, pad: 5, label: 20 };
const PV = { iw: CARD3.w - 2 * CARD3.pad, ih: CARD3.h - 2 * CARD3.pad - CARD3.label, S1: 1.9, K: 2.5,
  hillTop: 44, backBase: 78, walkTop: 128, frontBase: 144, roadTop: 150 };
const X3 = { pairs: 5, g1: [42, 58], pairGap: 82, nBack: 5, backGap: 70, crossGap: 6, margin: 20, sep: 20,
  minFrac: 0.4, must: 0.6, fit: 6, trapGap: 8, kLo: 2.0, kHi: 3.2, edge: 25, robust: 10, hit: 17,
  early: 40, attempts: 600 };
const is3 = (m) => !!(m && m.design === D3);
const iconY3 = (row) => GROUND3 - ROWS3[row].lift - ROWS3[row].size / 2;
const r1 = (v) => Math.round(v * 10) / 10;

function view3(L, c, sF, sB) {
  return L.map((l) => {
    const s = l.row ? sB : sF, size = ROWS3[l.row].size * s, px = PV.iw / 2 + (l.x - c) * s;
    const frac = Math.max(0, Math.min(PV.iw, px + size / 2) - Math.max(0, px - size / 2)) / size;
    return { id: l.id, k: `${l.slug}/${l.row}`, row: l.row, px, size, frac };
  });
}
const seen3 = (L, T) => view3(L, T.x, PV.S1, PV.S1 / PV.K).filter((o) => o.frac > 0);
function fit3(seen, predAll, edge = 0) {
  const pred = predAll.filter((o) => (edge ? o.px > -edge && o.px < PV.iw + edge : o.frac > 0));
  const must = (o) => (edge ? o.px - o.size / 2 > edge && o.px + o.size / 2 < PV.iw - edge : o.frac >= X3.must);
  let worst = 0;
  for (const k of new Set([...seen, ...pred].map((o) => o.k))) {
    const S = seen.filter((o) => o.k === k).sort((a, b) => a.px - b.px), P = pred.filter((o) => o.k === k).sort((a, b) => a.px - b.px);
    let best = Infinity;
    const rec = (i, j, w) => {
      if (w >= best) return;
      if (i === S.length) { for (let q = j; q < P.length; q++) if (must(P[q])) return; best = w; return; }
      for (let q = j; q < P.length; q++) { rec(i + 1, q + 1, Math.max(w, Math.abs(S[i].px - P[q].px))); if (must(P[q])) break; }
    };
    rec(0, 0, 0);
    if (best === Infinity) return Infinity;
    worst = Math.max(worst, best);
  }
  return worst;
}
function cropCost3(L, seen, c) {
  let b = Infinity;
  const at = (s) => fit3(seen, view3(L, c, s, s));
  const coarse = [];
  for (let s = 0.6; s <= 3.0001; s += 0.04) { const v = at(s); coarse.push([s, v]); if (v < b) b = v; }
  for (const [s, v0] of coarse) if (v0 < b + 12) for (let t = s - 0.04; t <= s + 0.04; t += 0.004) { const v = at(t); if (v < b) b = v; }
  return b;
}
const perspCost3 = (L, seen, c, K, edge = 0) => fit3(seen, view3(L, c, PV.S1, PV.S1 / K), edge);

function spotProblem3(L, T) {
  if (T.row !== 0) return 'centre-row';
  const seen = seen3(L, T);
  if (seen.some((o) => o.frac < X3.minFrac)) return 'sliver';
  const nF = seen.filter((o) => o.row === 0).length, nB = seen.length - nF;
  if (nF > 2 || nB > 2) return 'per-row';
  if (!seen.some((o) => o.row === 0 && o.id !== T.id) || !seen.some((o) => o.row === 1)) return 'one-row';
  const sB = PV.S1 / PV.K, reach = (PV.iw / 2 + ROWS3[1].size * sB / 2) / sB;
  if (T.x - reach < STRIP3.x || T.x + reach > STRIP3.x + STRIP3.w) return 'off-street';
  if (L.some((l) => l.id !== T.id && Math.abs(l.x - T.x) < X3.sep)) return 'centre';
  for (const l of L) if (l.id !== T.id && perspCost3(L, seen, l.x, PV.K) < X3.sep) return 'persp-alike';
  for (const K of [X3.kLo, X3.kHi]) {
    const cT = perspCost3(L, seen, T.x, K, X3.edge);
    if (!(cT < Infinity)) return 'persp-robust';
    for (const l of L) if (l.id !== T.id && perspCost3(L, seen, l.x, K, X3.edge) < cT + X3.robust) return 'persp-robust';
  }
  const front = seen.filter((o) => o.row === 0);
  if (!L.some((l) => l.id !== T.id && fit3(front, view3(L, l.x, PV.S1, PV.S1).filter((o) => o.row === 0)) <= X3.fit)) return 'front-decides';
  return null;
}
function trap3(L, T) {
  const seen = seen3(L, T);
  const cc = L.map((l) => (l.slug === T.slug && l.row === T.row ? cropCost3(L, seen, l.x) : Infinity));
  let bi = T.id;
  cc.forEach((v, i) => { if (v < cc[bi]) bi = i; });
  return { trapped: bi !== T.id && cc[bi] <= X3.fit && cc[T.id] >= cc[bi] + X3.trapGap, pick: bi, cropT: cc[T.id], cropBest: cc[bi],
    flatless: cc[bi] >= X3.sep };
}

function problems3(m) {
  const P = [];
  if (!is3(m) || m.task !== 'panorama_loop_closure' || !Array.isArray(m.landmarks) || m.landmarks.length < 8) return ['shape'];
  if (!Array.isArray(m.targetIds) || m.targetIds.length !== 3 || new Set(m.targetIds).size !== 3) return ['targets'];
  const L = m.landmarks;
  if (new Set(L.map((l) => l.slug)).size > 3) P.push('kinds');
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (l.id !== i || ![0, 1].includes(l.row) || Math.abs(l.y - iconY3(l.row)) > 0.06) P.push('row');
    if (i && l.x < L[i - 1].x) P.push('order');
    if (l.x - ROWS3[l.row].size / 2 < STRIP3.x + 4 || l.x + ROWS3[l.row].size / 2 > STRIP3.x + STRIP3.w - 4) P.push('strip');
    for (let j = 0; j < i; j++) {
      const d = Math.abs(l.x - L[j].x);
      if (L[j].row === l.row ? d < ROWS3[l.row].size + 3 : d < X3.crossGap) P.push('overlap');
    }
  }
  if (P.length) return [...new Set(P)];
  for (const t of m.targetIds) {
    const T = L[t];
    if (!T) { P.push('target'); continue; }
    const p = spotProblem3(L, T);
    if (p) P.push(p);
  }
  if (!P.length && !m.targetIds.some((t) => cleanTrap3(L, m.targetIds, t))) P.push('no-crop-trap');
  if (!P.length && !m.targetIds.some((t) => trap3(L, L[t]).flatless)) P.push('no-calibration-photo');
  return [...new Set(P)];
}

function partner3(L, id) {
  let best = -1;
  for (const l of L) if (l.row === 0 && l.id !== id && (best < 0 || Math.abs(l.x - L[id].x) < Math.abs(L[best].x - L[id].x))) best = l.id;
  return best;
}
function cleanTrap3(L, targetIds, t) {
  const tr = trap3(L, L[t]);
  return tr.trapped && !targetIds.includes(tr.pick) && !targetIds.includes(partner3(L, tr.pick));
}

function street3(rng) {
  const kinds = rng.shuffle(SLUGS).slice(0, 3);
  const g1 = rng.uniform(X3.g1[0], X3.g1[1]);
  const spare = STRIP3.w - 2 * X3.margin - X3.pairs * g1 - (X3.pairs - 1) * X3.pairGap;
  const w = Array.from({ length: X3.pairs + 1 }, () => -Math.log(1 - rng.raw() * 0.999)), wt = w.reduce((a, b) => a + b, 0);
  const L = [];
  let x = STRIP3.x + X3.margin + spare * w[0] / wt;
  for (let p = 0; p < X3.pairs; p++) {
    L.push({ slug: kinds[0], row: 0, x, pair: p, mem: 0 }, { slug: kinds[1], row: 0, x: x + g1, pair: p, mem: 1 });
    x += g1 + X3.pairGap + spare * w[p + 1] / wt;
  }
  for (let att = 0, n = 0; att < 200 && n < X3.nBack; att++) {
    const bx = rng.uniform(STRIP3.x + 16, STRIP3.x + STRIP3.w - 16);
    if (L.some((l) => (l.row ? Math.abs(l.x - bx) < X3.backGap : Math.abs(l.x - bx) < X3.crossGap))) continue;
    L.push({ slug: kinds[Math.floor(rng.raw() * 3)], row: 1, x: bx }); n++;
  }
  return tidy3(L);
}
const tidy3 = (L) => { L.sort((a, b) => a.x - b.x); L.forEach((l, i) => { l.id = i; l.x = r1(l.x); }); return L; };
function plant3(L, T, D) {
  const backs = seen3(L, T).filter((o) => o.row === 1), win = PV.iw / 2 / PV.S1 + 14;
  const out = L.filter((l) => !(l.row === 1 && Math.abs(l.x - D.x) < win + 30)).map((l) => ({ ...l }));
  for (const b of backs) {
    const bx = D.x + (b.px - PV.iw / 2) / PV.S1;
    if (bx < STRIP3.x + 16 || bx > STRIP3.x + STRIP3.w - 16) return null;
    if (out.some((l) => (l.row ? Math.abs(l.x - bx) < ROWS3[1].size + 3 : Math.abs(l.x - bx) < X3.crossGap))) return null;
    out.push({ slug: L[b.id].slug, row: 1, x: bx });
  }
  return tidy3(out);
}
function analyse3(L) {
  return L.filter((T) => T.row === 0 && !spotProblem3(L, T)).map((T) => ({ T, ...trap3(L, T) }));
}
function generate3(rng) {
  const nPairs = (A) => new Set(A.map((a) => a.T.pair)).size, nTrap = (A) => A.filter((a) => a.trapped).length;
  for (let att = 0; att < X3.attempts; att++) {
    const want = att < X3.early ? 2 : 1;
    let L = street3(rng), A = analyse3(L);
    if (nPairs(A) < 3) continue;
    for (let k = 0; k < 4 && nTrap(A) < want; k++) {
      const free = A.filter((a) => !a.trapped);
      if (!free.length) break;
      const a = rng.pick(free);
      const Ds = L.filter((l) => l.row === 0 && l.mem === a.T.mem && l.pair !== a.T.pair && Math.abs(l.x - a.T.x) > 120);
      if (!Ds.length) continue;
      const spots = new Set(A.map((q) => q.T.pair)), outer = Ds.filter((l) => !spots.has(l.pair));
      const L2 = plant3(L, a.T, rng.pick(outer.length ? outer : Ds));
      if (!L2) continue;
      const A2 = analyse3(L2);
      if (nPairs(A2) >= 3 && nTrap(A2) > nTrap(A)) { L = L2; A = A2; }
    }
    const clean = (tri) => tri.filter((q) => q.trapped && !tri.some((o) => o.T.pair === L[q.pick].pair)).length;
    let best = [], bestN = -1;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) for (let k = j + 1; k < A.length; k++) {
      const tri = [A[i], A[j], A[k]];
      if (new Set(tri.map((q) => q.T.pair)).size < 3) continue;
      const c = clean(tri);
      if (c > bestN) { bestN = c; best = [tri]; } else if (c === bestN) best.push(tri);
    }
    best = best.filter((tri) => tri.some((q) => q.flatless));
    if (bestN < want || !best.length) continue;
    const chosen = rng.pick(best);
    const landmarks = L.map((l) => ({ id: l.id, slug: l.slug, row: l.row, x: l.x, y: r1(iconY3(l.row)) }));
    const m = { task: 'panorama_loop_closure', design: D3, board: BOARD3, panel: { panelWidth: BOARD3.w + 20, boardH: BOARD3.h + 10 },
      landmarks, targetIds: rng.shuffle(chosen).map((a) => a.T.id), hit: X3.hit };
    if (problems3(m).length === 0) return m;
  }
  throw new Error('panorama_loop_closure: generator exhausted');
}

const round3 = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
function drawIcon3(g, img, x, yBase, s) {
  if (img) g.drawImage(img, x - s / 2, yBase - s, s, s);
  else { g.fillStyle = '#8b9aa5'; g.fillRect(x - s / 2, yBase - s, s, s); }
}
function drawStreet3(g, m, icons) {
  const S = STRIP3, G = GROUND3, hill = G - ROWS3[1].lift - 34;
  const sky = g.createLinearGradient(0, S.y, 0, hill);
  sky.addColorStop(0, '#bfe3f6'); sky.addColorStop(1, '#eef8fc');
  g.fillStyle = sky; g.fillRect(S.x, S.y, S.w, hill - S.y);
  g.fillStyle = '#d6e9d2'; g.fillRect(S.x, hill, S.w, G - hill);
  g.fillStyle = '#c9dfc4'; g.fillRect(S.x, G - ROWS3[1].lift - 1, S.w, 3);
  g.fillStyle = '#e4ddcc'; g.fillRect(S.x, G, S.w, 9);
  g.fillStyle = '#8f959c'; g.fillRect(S.x, G + 9, S.w, S.y + S.h - G - 9);
  g.fillStyle = '#f2eede'; g.fillRect(S.x, G + 19, S.w, 2);
  for (const row of [1, 0]) for (const l of m.landmarks) if (l.row === row) drawIcon3(g, icons?.[l.slug], l.x, G - ROWS3[row].lift, ROWS3[row].size);
}
function drawPhoto3(g, m, icons, T, ix, iy) {
  const W = PV.iw, H = PV.ih;
  const sky = g.createLinearGradient(0, iy, 0, iy + PV.hillTop);
  sky.addColorStop(0, '#bfe3f6'); sky.addColorStop(1, '#eef8fc');
  g.fillStyle = sky; g.fillRect(ix, iy, W, PV.hillTop);
  const hill = g.createLinearGradient(0, iy + PV.hillTop, 0, iy + PV.walkTop);
  hill.addColorStop(0, '#d6e9d2'); hill.addColorStop(1, '#cfe4ca');
  g.fillStyle = hill; g.fillRect(ix, iy + PV.hillTop, W, PV.walkTop - PV.hillTop);
  g.fillStyle = '#c9dfc4'; g.fillRect(ix, iy + PV.backBase - 1, W, 2);
  g.fillStyle = '#e4ddcc'; g.fillRect(ix, iy + PV.walkTop, W, PV.roadTop - PV.walkTop);
  g.fillStyle = '#8f959c'; g.fillRect(ix, iy + PV.roadTop, W, H - PV.roadTop);
  g.fillStyle = '#f2eede'; g.fillRect(ix, iy + PV.roadTop + 7, W, 3);
  const v = view3(m.landmarks, T.x, PV.S1, PV.S1 / PV.K);
  for (const row of [1, 0]) for (const o of v) {
    if (o.row !== row || o.frac <= 0) continue;
    drawIcon3(g, icons?.[m.landmarks[o.id].slug], ix + o.px, iy + (row ? PV.backBase : PV.frontBase), o.size);
  }
}
function drawBoard3(g, br, env) {
  const { manifest: m, state } = env, icons = env.assets.icons;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, br.w, br.h);
  const S = STRIP3;
  g.save(); round3(g, S.x, S.y, S.w, S.h, 10); g.clip(); drawStreet3(g, m, icons); g.restore();
  round3(g, S.x, S.y, S.w, S.h, 10); g.strokeStyle = '#c9d1d8'; g.lineWidth = 1; g.stroke();
  state.picks.forEach((id, k) => {
    const l = m.landmarks[id], up = l.row === 0, h = ROWS3[l.row].size / 2;
    const y = up ? l.y + h + 13 : l.y - h - 13, tip = up ? l.y + h : l.y - h, base = up ? y - 5 : y + 5;
    g.beginPath(); g.moveTo(l.x, tip); g.lineTo(l.x - 5, base); g.lineTo(l.x + 5, base); g.closePath(); g.fillStyle = ACCENT; g.fill();
    g.beginPath(); g.arc(l.x, y, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(k + 1), l.x, y + 0.5);
  });
  m.targetIds.forEach((tid, k) => {
    const rx = S.x + k * (CARD3.w + CARD3.gap), ry = CARD3.y, pad = CARD3.pad;
    g.save(); g.shadowColor = 'rgba(30,40,50,.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    round3(g, rx, ry, CARD3.w, CARD3.h, 6); g.fillStyle = '#fff'; g.fill(); g.restore();
    const ix = rx + pad, iy = ry + pad;
    g.save(); round3(g, ix, iy, PV.iw, PV.ih, 3); g.clip(); drawPhoto3(g, m, icons, m.landmarks[tid], ix, iy); g.restore();
    const cx = ix + PV.iw / 2, top = iy + PV.backBase + 3, bot = iy + PV.frontBase + 4, hw = 38;
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
    for (const [sx, yy, sy] of [[-1, top, 1], [1, top, 1], [1, bot, -1], [-1, bot, -1]]) {
      g.beginPath(); g.moveTo(cx + sx * hw, yy + sy * 9); g.lineTo(cx + sx * hw, yy); g.lineTo(cx + sx * (hw - 9), yy); g.stroke();
    }
    const done = state.picks.length > k;
    g.fillStyle = done ? ACCENT : '#5b6b78'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`Photo ${k + 1}`, rx + CARD3.w / 2, ry + CARD3.h - 12);
  });
  g.restore();
}

export default {
  meta: {
    name: 'panorama_loop_closure', family: 'D', 
    panelWidth: BOARD3.w + 20, boardH: BOARD3.h + 10, headerH: 56, footer: 'verify', board: { ...BOARD3 },
    actionSpace: [{ op: 'click', x: 'strip px', y: 'strip px' }],
    promptHuman: 'Tap where each photo was taken: the middle object of photo 1, then 2, then 3',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return { ...generateExt(rng, knobs), panel: { panelWidth: 360, boardH: BOARD.h + 10 } };
    return generate3(rng);
  },

  _generateOld(rng) {
    const kinds = rng.shuffle(SLUGS).slice(0, HARD.twins + HARD.singles);
    const bag = [0, 0, 1, 1, 2, 2, 3, 3, 4];
    const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : -1);

    let arr = null, targets = null;
    for (let att = 0; att < 400 && !arr; att++) {
      const a = rng.shuffle(bag);
      const tg = [];
      let ok = true;
      for (let t = 0; t < HARD.twins && ok; t++) {
        const pos = a.map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0);
        const inner = pos.filter((i) => i > 0 && i < HARD.n - 1);
        if (!inner.length) { ok = false; break; }
        const tp = inner.length === 2 ? rng.pick(inner) : inner[0];
        for (const q of pos) {
          if (q !== tp && at(a, q - 1) === at(a, tp - 1) && at(a, q + 1) === at(a, tp + 1)) { ok = false; break; }
        }
        if (ok) tg.push(tp);
      }
      if (ok) { arr = a; targets = tg; }
    }
    if (!arr) {
      arr = [0, 1, 2, 3, 0, 4, 2, 1, 3];
      targets = [4, 1, 6, 3];
    }

    const landmarks = arr.map((v, i) => ({
      id: i, slug: kinds[v],
      x: +slotX(i).toFixed(1), y: +ICON_Y.toFixed(1),
    }));
    const targetIds = rng.shuffle(targets).slice(0, 3);
    return { task: 'panorama_loop_closure', board: BOARD, landmarks, targetIds, hit: HARD.hit };
  },

  init() { return { picks: [] }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'click' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: 'bad-op' };
    let best = -1, bestD = Infinity;
    for (const l of manifest.landmarks) {
      const d = Math.hypot(l.x - action.x, l.y - action.y);
      if (d < bestD) { bestD = d; best = l.id; }
    }
    if (bestD > manifest.hit) return { ok: false, reason: 'miss' };
    const at = state.picks.indexOf(best);
    if (at >= 0) { state.picks.length = at; return { ok: true }; }
    if (state.picks.length >= manifest.targetIds.length) return { ok: false, reason: 'full' };
    state.picks.push(best);
    return { ok: true };
  },

  verify(state, manifest) {
    const want = manifest.targetIds;
    let correct = 0;
    for (let i = 0; i < want.length; i++) if (state.picks[i] === want[i]) correct++;
    const success = correct === want.length && state.picks.length === want.length;
    const first = manifest.landmarks[state.picks[0]];
    const err = first ? Math.abs(first.x - manifest.landmarks[want[0]].x) : manifest.board.w;
    return { success, partial: correct / want.length, error: +err.toFixed(1), detail: { picks: state.picks.slice(), expected: want.slice() } };
  },

  oracle(manifest) {
    return manifest.targetIds.map((id) => {
      const l = manifest.landmarks[id];
      return { op: 'click', x: l.x, y: l.y };
    });
  },

  randomPolicy(manifest, rnd) {
    const ids = manifest.landmarks.map((l) => l.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, manifest.targetIds.length).map((id) => ({ op: 'click', x: manifest.landmarks[id].x, y: manifest.landmarks[id].y }));
  },

  async mount(env) {
    const slugs = [...new Set(env.manifest.landmarks.map((l) => l.slug))];
    const loaded = await Promise.all(slugs.map(async (s) => {
      try { return [s, await loadEmoji(env.index, s, 'twemoji', 96)]; }
      catch { return [s, null]; }
    }));
    env.assets.icons = Object.fromEntries(loaded);
    if (env.manifest.ext && env.style) env.assets.look = await panoLook(env.style, themeById(env.manifest.theme));
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap where each photo was taken', 'Tap the middle object of photo 1, 2, then 3');
  },

  drawBoard(g, br, env) {
    if (is3(env.manifest)) return drawBoard3(g, br, env);
    if (is2(env.manifest)) return drawBoard2(g, br, env);
    const { manifest: m, state } = env, icons = env.assets.icons;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, br.w, br.h);
    const round = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

    const SR = m.ext ? stripRect(m) : STRIP;
    g.save(); round(SR.x, SR.y, SR.w, SR.h, 10); g.clip();
    paintStreet(g, m, icons, env);
    g.restore();
    round(SR.x, SR.y, SR.w, SR.h, 10); g.strokeStyle = '#c9d1d8'; g.lineWidth = 1; g.stroke();
    state.picks.forEach((id, k) => {
      const l = m.landmarks[id], y = l.y - 30;
      g.beginPath(); g.moveTo(l.x, y + 13); g.lineTo(l.x - 5, y + 5); g.lineTo(l.x + 5, y + 5); g.closePath(); g.fillStyle = ACCENT; g.fill();
      g.beginPath(); g.arc(l.x, y, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), l.x, y + 0.5);
    });

    m.targetIds.forEach((tid, k) => {
      const rx = CARD.x + k * (CARD.w + CARD.gap), ry = m.ext ? cardY(m) : CARD.y, pad = 5;
      g.save(); g.shadowColor = 'rgba(30,40,50,.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
      round(rx, ry, CARD.w, CARD.h, 6); g.fillStyle = '#fff'; g.fill(); g.restore();
      const ix = rx + pad, iy = ry + pad, iw = CARD.w - 2 * pad, ih = CARD.h - 2 * pad - 20;
      g.save(); round(ix, iy, iw, ih, 3); g.clip();
      const l = m.landmarks[tid];
      g.translate(ix + iw / 2, iy + ih * 0.5); g.scale(CARD_SCALE, CARD_SCALE);
      if (m.ext) g.translate(-l.x, -(l.y - (ICON_Y - STRIP.y - 62))); else g.translate(-l.x, -(STRIP.y + 62));
      paintStreet(g, m, icons, env);
      g.restore();
      const cx = ix + iw / 2, cy = iy + ih * 0.5 + (ICON_Y - STRIP.y - 62) * CARD_SCALE, h = 22;
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.beginPath(); g.moveTo(cx + sx * h, cy + sy * (h - 7)); g.lineTo(cx + sx * h, cy + sy * h); g.lineTo(cx + sx * (h - 7), cy + sy * h); g.stroke();
      }
      const done = state.picks.length > k;
      g.fillStyle = done ? ACCENT : '#5b6b78'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`Photo ${k + 1}`, rx + CARD.w / 2, ry + CARD.h - 12);
    });
    g.restore();
  },

  pointer(evt) {
    if (evt.type !== 'down') return [];
    return [{ op: 'click', x: evt.x, y: evt.y }];
  },

  footerStatus(env) {
    const n = env.state.picks.length, total = env.manifest.targetIds.length;
    return n ? `${n} of ${total} placed · tap a pin to undo` : 'Start with photo 1';
  },
};

export function gate(m) {
  if (is3(m)) return problems3(m).length === 0;
  if (is2(m)) return problems2(m).length === 0;
  if (m && m.ext) {
    const th = themeById(m.theme);
    if (!th || th.split !== m.ext || !m.landmarks?.every((l) => th.kinds.some(([k]) => k === l.slug))) return false;
  }
  if (!m || m.task !== 'panorama_loop_closure' || !Array.isArray(m.landmarks) || m.landmarks.length !== HARD.n) return false;
  if (!Array.isArray(m.targetIds) || m.targetIds.length !== 3 || new Set(m.targetIds).size !== 3) return false;
  const sl = m.landmarks.map((l) => l.slug);
  return m.targetIds.every((t) => {
    if (!(t > 0 && t < HARD.n - 1)) return false;
    let hits = 0;
    for (let i = 1; i < HARD.n - 1; i++) if (sl[i - 1] === sl[t - 1] && sl[i] === sl[t] && sl[i + 1] === sl[t + 1]) hits++;
    return hits === 1 && sl.filter((x) => x === sl[t]).length === 2;
  });
}

const PLACE = { STRIP, GROUND, ICON: HARD.icon };
const stripRect = (m) => (Number.isFinite(m.stripY) ? { ...STRIP, y: m.stripY } : STRIP);
const cardY = (m) => (Number.isFinite(m.cardY) ? m.cardY : CARD.y);
function paintStreet(g, m, icons, env) {
  if (env.assets.look) drawPlace(g, m, icons, env.assets.look, { ...PLACE, STRIP: stripRect(m), GROUND: m.ground ?? GROUND, ICON: m.icon ?? HARD.icon });
  else drawStreet(g, m, icons);
}

function generateExt(rng, knobs) {
  const themes = themesOf(knobs.ext);
  const theme = themes[Math.floor(rng.raw() * themes.length)];
  const kinds = pickKinds(rng, theme, HARD.twins + HARD.singles);
  const layout = rng.raw() < 0.5 ? 'top' : 'bottom';
  const slack = BOARD.h - STRIP.h - CARD.h, top = rng.int(4, 18), gap = rng.int(8, slack - 4 - top);
  const stripY = layout === 'top' ? top : top + CARD.h + gap, cardTop = layout === 'top' ? top + STRIP.h + gap : top;
  const ground = stripY + rng.int(84, 100), icon = HARD.icon;
  const bag = [0, 0, 1, 1, 2, 2, 3, 3, 4];
  const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : -1);
  for (let att = 0; att < 2000; att++) {
    const a = rng.shuffle(bag);
    const tg = [];
    let ok = true;
    for (let t = 0; t < HARD.twins && ok; t++) {
      const pos = a.map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0);
      const inner = pos.filter((i) => i > 0 && i < HARD.n - 1);
      if (!inner.length) { ok = false; break; }
      const tp = inner.length === 2 ? rng.pick(inner) : inner[0];
      for (const q of pos) if (q !== tp && at(a, q - 1) === at(a, tp - 1) && at(a, q + 1) === at(a, tp + 1)) { ok = false; break; }
      if (ok) tg.push(tp);
    }
    if (!ok) continue;
    const landmarks = a.map((v, i) => ({ id: i, slug: kinds[v], x: +slotX(i).toFixed(1), y: +(ground - icon / 2).toFixed(1) }));
    const targetIds = rng.shuffle(tg).slice(0, 3);
    const m = { task: 'panorama_loop_closure', board: BOARD, ext: knobs.ext, theme: theme.id, layout, stripY, cardY: cardTop, ground, icon, landmarks, targetIds, hit: HARD.hit };
    if (gate(m)) return m;
  }
  throw new Error('panorama_loop_closure: no ext layout');
}

export function semanticKey(m) {
  if (is3(m)) return `panorama_loop_closure|persp|${m.landmarks.map((l) => `${l.row}${l.row ? l.slug : ''}@${Math.round(l.x / 4)}`).join(',')}|${m.targetIds.join(',')}`;
  if (is2(m)) return `panorama_loop_closure|rows2|${m.landmarks.map((l) => `${l.row}@${Math.round(l.x / 4)}`).join(',')}|${m.targetIds.join(',')}`;
  return `panorama_loop_closure|${(m.landmarks || []).map((l) => l.slug).join(',')}|${(m.targetIds || []).join(',')}`;
}
