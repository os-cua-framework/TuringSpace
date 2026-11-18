import { drawPromptText, ACCENT, rr } from '../core/panel.js';

const BOARD = { w: 340, h: 336 };
const NF = 5, NB = 6;
const DOT_R = 8;
const HIT_R = 15;
const CLICK_SEP = 26;
const MERGE_EPS = 5;
const CLEAR = 18;
const TILT_MIN = 14;
const SX0 = 24, SX1 = 316, SY0 = 26, SY1 = 320;
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const R1 = (v) => Math.round(v);
const R2 = (v) => Math.round(v * 100) / 100;
const norm360 = (d) => ((d % 360) + 360) % 360;

const G = Object.freeze({
  nf: 7, nb: 8, coincide: 4,
  unit: 5.6,
  sep: 36,
  axisGap: 22,
  posEps: 4,
  clear: 24,
  angEps: 1,
  hit: 18,
  nearMin: 22, nearMax: 32,
  rough: 45,
  diagMin: 8,
  x0: 31, x1: 309, y0: 33, y1: 307,
});
const F_CELLS = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [2, 2], [2, 3], [1, 3], [1, 5], [0, 5]];
const F_POLY = F_CELLS.map(([x, y]) => [(x - 1.5) * G.unit, (y - 2.5) * G.unit]);

function axisBasis(ax) { const a = rad(ax.ang); return { c: Math.cos(a), s: Math.sin(a), cx: ax.cx, cy: ax.cy }; }
function toAxis(P, b) { const dx = P.x - b.cx, dy = P.y - b.cy; return { a: dx * b.c + dy * b.s, s: -dx * b.s + dy * b.c }; }
function fromAxis(a, s, b) { return { x: b.cx + a * b.c - s * b.s, y: b.cy + a * b.s + s * b.c }; }
function reflect(P, ax) { const b = axisBasis(ax); const u = toAxis(P, b); return fromAxis(u.a, -u.s, b); }
function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
function cardinalGap(deg) { const d = norm360(deg) % 90; return Math.min(d, 90 - d); }
function diagGap(deg) { const d = norm360(deg) % 180; return Math.min(Math.abs(d - 45), Math.abs(d - 135)); }
function inSheet(p) { return p.x >= SX0 && p.x <= SX1 && p.y >= SY0 && p.y <= SY1; }
function inGlyphSheet(p) { return p.x >= G.x0 && p.x <= G.x1 && p.y >= G.y0 && p.y <= G.y1; }
const angDiff = (a, b) => { const d = norm360(a - b); return Math.min(d, 360 - d); };

function foldedPose(pose, ax) {
  const t = rad(pose.rot), h = pose.flip ? -1 : 1, a2 = rad(2 * ax.ang);
  const A = [[Math.cos(t) * h, -Math.sin(t)], [Math.sin(t) * h, Math.cos(t)]];
  const Rf = [[Math.cos(a2), Math.sin(a2)], [Math.sin(a2), -Math.cos(a2)]];
  const B01 = Rf[0][0] * A[0][1] + Rf[0][1] * A[1][1];
  const B11 = Rf[1][0] * A[0][1] + Rf[1][1] * A[1][1];
  return { rot: R2(norm360((Math.atan2(-B01, B11) * 180) / Math.PI)), flip: pose.flip ? 0 : 1 };
}
const samePose = (p, q) => p.flip === q.flip && angDiff(p.rot, q.rot) <= G.angEps;

function glyphContractOk(m) {
  if (!m || m.task !== 'foldline_match_pick' || !Array.isArray(m.glyphs)) return false;
  if (!m.axis || ![m.axis.cx, m.axis.cy, m.axis.ang].every(Number.isFinite)) return false;
  if (cardinalGap(m.axis.ang) < TILT_MIN) return false;
  if (diagGap(m.axis.ang) < G.diagMin) return false;
  const flap = m.glyphs.filter((d) => d.side === 'F'), base = m.glyphs.filter((d) => d.side === 'B');
  if (flap.length !== G.nf || base.length !== G.nb || m.glyphs.length !== G.nf + G.nb) return false;
  if (!Array.isArray(m.answer) || m.answer.length !== 2) return false;
  const b = axisBasis(m.axis);
  for (const d of m.glyphs) {
    if (![d.x, d.y, d.rot].every(Number.isFinite) || ![0, 1].includes(d.flip) || !inGlyphSheet(d)) return false;
    const s = toAxis(d, b).s;
    if (Math.abs(s) < G.axisGap || (d.side === 'F') !== (s > 0)) return false;
  }
  for (let i = 0; i < m.glyphs.length; i++) for (let j = i + 1; j < m.glyphs.length; j++) if (dist(m.glyphs[i], m.glyphs[j]) < G.sep) return false;
  let full = 0, posOnly = 0, ansF = -1, ansB = -1, lureOk = false, rough = 0;
  const kinds = [];
  for (const f of flap) {
    const img = reflect(f, m.axis), pose = foldedPose(f, m.axis);
    if (!inGlyphSheet(img)) return false;
    for (const bb of base) {
      const d = dist(img, bb);
      if (d < G.posEps) {
        const dA = angDiff(bb.rot, pose.rot);
        if (bb.flip === pose.flip && dA <= G.rough) rough++;
        if (samePose(pose, bb)) { full++; ansF = f.id; ansB = bb.id; }
        else {
          posOnly++;
          if (bb.flip === pose.flip && dA < 90) {
            if (dA < G.nearMin || dA > G.nearMax) return false;
            kinds.push('near');
          } else kinds.push(bb.flip === pose.flip ? 'turned' : 'unmirrored');
        }
      } else if (d < G.clear) return false;
      else if (samePose(pose, bb)) lureOk = true;
    }
  }
  if (full !== 1 || posOnly !== G.coincide - 1) return false;
  if (!kinds.includes('turned') || !kinds.includes('unmirrored') || kinds.filter((k) => k === 'near').length !== 1) return false;
  if (rough < 2) return false;
  if (!lureOk) return false;
  const ans = m.answer.slice().sort((p, q) => p - q);
  return ans[0] === Math.min(ansF, ansB) && ans[1] === Math.max(ansF, ansB);
}

function place(a, s, b) { const p = fromAxis(a, s, b); return { x: R1(p.x), y: R1(p.y) }; }
const randPose = (rng) => ({ rot: R2(rng.uniform(0, 360)), flip: rng.raw() < 0.5 ? 1 : 0 });

function tryBuildGlyphs(rng) {
  const angBase = rng.pick([26, 34, 58, 122, 146, 154]);
  const ang = R2(angBase + rng.uniform(-4, 4));
  if (cardinalGap(ang) < TILT_MIN + 1 || diagGap(ang) < G.diagMin) return null;
  const axis = { cx: R1(170 + rng.uniform(-12, 12)), cy: R1(170 + rng.uniform(-10, 10)), ang };
  const b = axisBasis(axis);
  const flaps = [], bases = [];
  const all = () => flaps.concat(bases);
  const free = (p) => inGlyphSheet(p) && !all().some((d) => dist(d, p) < G.sep);
  const negKinds = rng.shuffle(['unmirrored', 'near', 'turned']);
  for (let n = 0; n < G.coincide; n++) {
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      const a = rng.uniform(-135, 135), s = rng.uniform(G.axisGap + 2, 112);
      const pf = place(a, s, b), pb = place(a, -s, b);
      if (!free(pf) || !free(pb) || dist(pf, pb) < G.sep) continue;
      const fp = randPose(rng);
      const img = foldedPose(fp, axis);
      let bp;
      if (n === 0) bp = img;
      else if (negKinds[n - 1] === 'unmirrored') bp = { rot: img.rot, flip: fp.flip };
      else if (negKinds[n - 1] === 'near') {
        const off = rng.uniform(G.nearMin + 0.5, G.nearMax - 0.5) * (rng.raw() < 0.5 ? -1 : 1);
        bp = { rot: R2(norm360(img.rot + off)), flip: img.flip };
      }
      else bp = { rot: R2(norm360(img.rot + 180)), flip: img.flip };
      flaps.push({ side: 'F', x: pf.x, y: pf.y, ...fp, _true: n === 0 });
      bases.push({ side: 'B', x: pb.x, y: pb.y, ...bp, _true: n === 0 });
      ok = true;
    }
    if (!ok) return null;
  }
  for (let n = G.coincide; n < G.nf; n++) {
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      const p = place(rng.uniform(-135, 135), rng.uniform(G.axisGap + 2, 112), b);
      if (!free(p)) continue;
      const img = reflect(p, axis);
      if (!inGlyphSheet(img) || bases.some((d) => dist(d, img) < G.clear + 4)) continue;
      flaps.push({ side: 'F', x: p.x, y: p.y, ...randPose(rng) }); ok = true;
    }
    if (!ok) return null;
  }
  const images = flaps.map((f) => reflect(f, axis));
  const lureSrc = flaps[G.coincide + Math.floor(rng.raw() * (G.nf - G.coincide))];
  for (let n = G.coincide; n < G.nb; n++) {
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      const p = place(rng.uniform(-135, 135), -rng.uniform(G.axisGap + 2, 112), b);
      if (!free(p) || images.some((q) => dist(q, p) < G.clear + 4)) continue;
      const pose = n === G.coincide ? foldedPose(lureSrc, axis) : randPose(rng);
      bases.push({ side: 'B', x: p.x, y: p.y, ...pose }); ok = true;
    }
    if (!ok) return null;
  }
  const fOrder = rng.shuffle(flaps), bOrder = rng.shuffle(bases);
  const glyphs = [];
  let tf = -1, tb = -1;
  fOrder.forEach((d, i) => { glyphs.push({ id: i, side: 'F', x: d.x, y: d.y, rot: d.rot, flip: d.flip }); if (d._true) tf = i; });
  bOrder.forEach((d, i) => { const id = G.nf + i; glyphs.push({ id, side: 'B', x: d.x, y: d.y, rot: d.rot, flip: d.flip }); if (d._true) tb = id; });
  const m = {
    task: 'foldline_match_pick', board: BOARD, axis, glyphs,
    answer: [tf, tb].sort((x, y) => x - y),
    gtContract: 'fold the tinted flap across the tilted dashed axis (reflection); exactly one flap glyph lands '
      + 'on a base glyph with the same outline (same place, mirrored, same direction) — select those two glyphs',
  };
  return glyphContractOk(m) ? m : null;
}

function contractOk(m) {
  if (!m || m.task !== 'foldline_match_pick') return false;
  if (!m.axis || ![m.axis.cx, m.axis.cy, m.axis.ang].every(Number.isFinite)) return false;
  if (cardinalGap(m.axis.ang) < TILT_MIN) return false;
  const flap = (m.dots || []).filter((d) => d.side === 'F');
  const base = (m.dots || []).filter((d) => d.side === 'B');
  if (flap.length !== (m.ext ? m.nf : NF) || base.length !== (m.ext ? m.nb : NB)) return false;
  if (m.ext && !(m.nf === NF && m.nb === NB)) return false;
  if (!Array.isArray(m.answer) || m.answer.length !== 2) return false;
  for (const d of m.dots) { if (![d.x, d.y].every(Number.isFinite) || !inSheet(d)) return false; }

  for (let i = 0; i < m.dots.length; i++)
    for (let j = i + 1; j < m.dots.length; j++)
      if (dist(m.dots[i], m.dots[j]) < CLICK_SEP - 2) return false;

  let coincK = 0, ansFlap = -1, ansBase = -1, trueCross = 0;
  for (const f of flap) {
    const img = reflect(f, m.axis);
    if (!inSheet(img)) return false;
    for (const b of base) {
      const rd = dist(img, b);
      if (rd < MERGE_EPS) { coincK++; ansFlap = f.id; ansBase = b.id; trueCross = dist(f, b); }
      else if (rd < CLEAR - 4) return false;
    }
  }
  if (coincK !== 1) return false;
  const ans = m.answer.slice().sort((a, b) => a - b);
  if (ans[0] !== Math.min(ansFlap, ansBase) || ans[1] !== Math.max(ansFlap, ansBase)) return false;

  let minCross = Infinity, minIsTrue = false;
  for (const f of flap) for (const b of base) {
    const dd = dist(f, b);
    if (dd < minCross - 1e-6) { minCross = dd; minIsTrue = (f.id === ansFlap && b.id === ansBase); }
  }
  if (minIsTrue) return false;
  if (!(trueCross >= minCross + 10)) return false;
  return true;
}

function tryBuildExt(rng) {
  const angN = R2(rng.uniform(0, 1) < 0.5 ? rng.uniform(22, 62) : rng.uniform(118, 158));
  if (cardinalGap(angN) < TILT_MIN + 2) return null;
  const nf = NF, nb = NB;
  const axis = { cx: R1(170 + rng.uniform(-24, 24)), cy: R1(170 + rng.uniform(-20, 20)), ang: angN };
  const b = axisBasis(axis);
  const sT = R1(rng.uniform(44, 56));
  const aT = R1(rng.uniform(-70, 70));
  const trueBase = place(aT, -sT, b);
  const trueFlap = place(aT, sT, b);
  if (!inSheet(trueBase) || !inSheet(trueFlap)) return null;
  const baseDots = [{ side: 'B', x: trueBase.x, y: trueBase.y, _true: true }];
  const flapDots = [{ side: 'F', x: trueFlap.x, y: trueFlap.y, _true: true }];
  const all = () => baseDots.concat(flapDots);
  for (let n = 0; n < nb - 1; n++) {
    let ok = false;
    for (let t = 0; t < 240 && !ok; t++) {
      const p = place(rng.uniform(-118, 118), -rng.uniform(16, 40), b);
      if (!inSheet(p) || all().some((d) => dist(d, p) < CLICK_SEP)) continue;
      baseDots.push({ side: 'B', x: p.x, y: p.y }); ok = true;
    }
    if (!ok) return null;
  }
  for (let n = 0; n < nf - 1; n++) {
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      const p = place(rng.uniform(-118, 118), rng.uniform(16, 40), b);
      if (!inSheet(p)) continue;
      const img = reflect(p, axis);
      if (!inSheet(img) || all().some((d) => dist(d, p) < CLICK_SEP)) continue;
      if (baseDots.some((d) => dist(d, img) < CLEAR + 3)) continue;
      if (flapDots.some((d) => dist(reflect(d, axis), img) < CLEAR + 3)) continue;
      flapDots.push({ side: 'F', x: p.x, y: p.y }); ok = true;
    }
    if (!ok) return null;
  }
  const fOrder = rng.shuffle(flapDots), bOrder = rng.shuffle(baseDots);
  const dots = [];
  let tf = -1, tb = -1;
  fOrder.forEach((d, i) => { dots.push({ id: i, side: 'F', x: d.x, y: d.y }); if (d._true) tf = i; });
  bOrder.forEach((d, i) => { const id = nf + i; dots.push({ id, side: 'B', x: d.x, y: d.y }); if (d._true) tb = id; });
  const flapD = dots.filter((d) => d.side === 'F'), baseD = dots.filter((d) => d.side === 'B');
  let sameRow = false;
  for (const f of flapD) for (const bb of baseD)
    if (!(f.id === tf && bb.id === tb) && Math.abs(f.y - bb.y) <= 10 && f.x !== bb.x) sameRow = true;
  if (!sameRow) return null;
  const m = {
    task: 'foldline_match_pick', board: BOARD, axis, dots, nf, nb, ext: 1,
    answer: [tf, tb].sort((x, y) => x - y),
    gtContract: 'fold the flap across the tilted dashed axis (reflection); exactly one flap dot lands '
      + 'exactly on a base dot — select that flap dot and that base dot',
  };
  return contractOk(m) ? m : null;
}

const items = (m) => m.glyphs || m.dots;
const PROMPT = 'Tap the two shapes that match exactly when folded';
const SUB = 'Fold the tinted half over the dashed line';

export default {
  meta: {
    name: 'foldline_match_pick', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'pick', item: 'glyph id 0..14' }],
    promptHuman: PROMPT,
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      for (let attempt = 0; attempt < 4000; attempt++) { const m = tryBuildExt(rng); if (m) return m; }
      throw new Error('foldline_match_pick: ext generation failed');
    }
    for (let attempt = 0; attempt < 3000; attempt++) {
      const m = tryBuildGlyphs(rng);
      if (m) return m;
    }
    throw new Error('foldline_match_pick: generation failed');
  },

  init() { return { selected: [] }; },

  applyAction(state, action, m) {
    if (!action) return { ok: false, reason: 'no-action' };
    if (action.op !== 'pick' || !Number.isInteger(action.item)
      || action.item < 0 || action.item >= items(m).length) return { ok: false, reason: 'bad-item' };
    const i = state.selected.indexOf(action.item);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(action.item);
    state.selected.sort((a, b) => a - b);
    return { ok: true, selected: i < 0 };
  },

  verify(state, m) {
    const want = new Set(m.answer);
    const valid = new Set(items(m).map((d) => d.id));
    const got = new Set(state.selected.filter((id) => valid.has(id)));
    const correct = [...want].filter((id) => got.has(id)).length;
    const falsePos = [...got].filter((id) => !want.has(id)).length;
    return {
      success: correct === want.size && falsePos === 0,
      partial: Math.max(0, (correct - falsePos) / want.size),
      error: want.size - correct + falsePos,
      detail: { correct, falsePos, required: want.size, selected: [...got] },
    };
  },

  oracle(m) { return m.answer.map((item) => ({ op: 'pick', item })); },

  randomPolicy(m, rnd) {
    const flap = items(m).filter((d) => d.side === 'F'), base = items(m).filter((d) => d.side === 'B');
    const f = flap[Math.floor(rnd() * flap.length)], b = base[Math.floor(rnd() * base.length)];
    return [{ op: 'pick', item: f.id }, { op: 'pick', item: b.id }];
  },

  async mount(env) {
    if (!env || !env.style) return;
    const { buildFoldLook, drawFoldBoard } = await import('../common/_foldline_match_pick_look.js');
    env.assets.foldLook = await buildFoldLook(env.style);
    env.assets.drawFoldBoard = drawFoldBoard;
  },

  drawPrompt(g, r, env) {
    if (env && env.manifest && env.manifest.dots) drawPromptText(g, r, 'Tap the two dots that meet when folded', 'Fold along the dashed line');
    else drawPromptText(g, r, PROMPT, SUB);
  },

  _drawDot(g, p) {
    g.beginPath(); g.arc(p.x, p.y, DOT_R, 0, TAU);
    g.fillStyle = '#37485c'; g.fill();
    g.strokeStyle = '#22303f'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(p.x - 2.4, p.y - 2.6, 2.4, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.34)'; g.fill();
  },

  _drawGlyph(g, p) {
    g.save();
    g.translate(p.x, p.y); g.rotate(rad(p.rot)); g.scale(p.flip ? -1 : 1, 1);
    g.beginPath();
    F_POLY.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = '#37485c'; g.fill();
    g.lineJoin = 'round'; g.strokeStyle = '#1d2834'; g.lineWidth = 1.3; g.stroke();
    g.restore();
  },

  _drawSelect(g, p, r) {
    g.beginPath(); g.arc(p.x, p.y, r, 0, TAU);
    g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    if (m.dots && env.assets && env.assets.foldLook) {
      env.assets.drawFoldBoard(g, br, m, st, env.assets.foldLook, { axisBasis, rr, ACCENT, DOT_R });
      return;
    }
    g.save(); g.translate(br.x, br.y);

    g.fillStyle = '#f6f2e9'; rr(g, 12, 14, br.w - 24, 312, 8); g.fill();
    g.strokeStyle = '#dcd3c1'; g.lineWidth = 1; g.stroke();
    const b = axisBasis(m.axis), n = { x: -b.s, y: b.c };
    g.save();
    rr(g, 12, 14, br.w - 24, 312, 8); g.clip();
    g.beginPath();
    const far = 900;
    g.moveTo(m.axis.cx + b.c * far, m.axis.cy + b.s * far);
    g.lineTo(m.axis.cx - b.c * far, m.axis.cy - b.s * far);
    g.lineTo(m.axis.cx - b.c * far + n.x * far, m.axis.cy - b.s * far + n.y * far);
    g.lineTo(m.axis.cx + b.c * far + n.x * far, m.axis.cy + b.s * far + n.y * far);
    g.closePath();
    g.fillStyle = m.glyphs ? 'rgba(95,150,210,0.17)' : 'rgba(95,150,210,0.10)'; g.fill();
    g.restore();

    g.save();
    rr(g, 12, 14, br.w - 24, 312, 8); g.clip();
    g.setLineDash([7, 5]); g.strokeStyle = '#8a93a0'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(m.axis.cx + b.c * far, m.axis.cy + b.s * far);
    g.lineTo(m.axis.cx - b.c * far, m.axis.cy - b.s * far);
    g.stroke();
    g.restore();

    const its = items(m);
    const draw = m.glyphs ? (d) => this._drawGlyph(g, d) : (d) => this._drawDot(g, d);
    for (const d of its) if (d.side === 'B') draw(d);
    for (const d of its) if (d.side === 'F') draw(d);

    const sel = new Set(st.selected);
    for (const d of its) if (sel.has(d.id)) this._drawSelect(g, d, m.glyphs ? 20 : DOT_R + 7);
    g.restore();
  },

  pointer(evt, env) {
    const m = env.manifest;
    if (evt.type !== 'down') return [];
    let best = -1, bd = m.glyphs ? G.hit : HIT_R;
    for (const d of items(m)) { const dd = Math.hypot(evt.x - d.x, evt.y - d.y); if (dd < bd) { bd = dd; best = d.id; } }
    return best >= 0 ? [{ op: 'pick', item: best }] : [];
  },

  footerStatus(env) { return `${env.state.selected.length} of 2 selected`; },
};

export function gate(m) { return m && m.glyphs ? glyphContractOk(m) : contractOk(m); }

export function semanticKey(m) {
  const qa = Math.round((norm360(m.axis.ang) % 180) / 15) % 12;
  const qx = (v) => Math.floor(v / (BOARD.w / 8)), qy = (v) => Math.floor(v / (BOARD.h / 8));
  const ans = new Set(m.answer);
  const marks = items(m).map((d) => `${d.side}${qx(d.x)},${qy(d.y)}${m.glyphs ? `r${Math.round(norm360(d.rot) / 30) % 12}${d.flip ? 'm' : ''}` : ''}${ans.has(d.id) ? '*' : ''}`).sort();
  return `foldline_match_pick|a${qa}|c${qx(m.axis.cx)},${qy(m.axis.cy)}|${marks.join(' ')}`;
}
