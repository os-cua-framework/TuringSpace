import { drawPromptText, UI_FONT } from '../core/panel.js';
import { nthOf } from '../core/style.js';
import { makeCompositeTask } from '../common/_composite_task_common.js';
import { slipknotReleasePickSpec, enclosingCyclesAfterCuts } from '../common/_composite_ab_scenes.js';
import { TAU, kindsFor, pickKind, texItems, makeMat, fillMat, localPattern, domeShade } from '../common/_object_mat.js';
import { buildWebScene, validateWebScene } from '../common/_slipknot_release_pick_web.js';

const FAMS = ['tails', 'bridges', 'detours', 'mixed', 'spokes', 'twin'];
const r1 = (v) => Math.round(v * 10) / 10;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function pd(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function cross(a, b, c, d) {
  const cr = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cr(c, d, a), d2_ = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0) !== (d2_ > 0)) && ((d3 > 0) !== (d4 > 0));
}
function planarOk(nodes, edges, peg) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].x < 22 || nodes[i].x > 318 || nodes[i].y < 22 || nodes[i].y > 338) return false;
    for (let j = i + 1; j < nodes.length; j++) if (d2(nodes[i], nodes[j]) < 31) return false;
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], A = nodes[e.a], B = nodes[e.b];
    if (pd(peg, A, B) < 18) return false;
    for (let k = 0; k < nodes.length; k++) if (k !== e.a && k !== e.b && pd(nodes[k], A, B) < 12) return false;
    for (let j = i + 1; j < edges.length; j++) {
      const f = edges[j];
      if (f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue;
      if (cross(A, B, nodes[f.a], nodes[f.b])) return false;
    }
  }
  return true;
}
function rasterFree(nodes, edges, peg, removed) {
  const S = 2, GW = 170, GH = 180, grid = new Uint8Array(GW * GH);
  for (const e of edges) {
    if (e.candidateId != null && removed.has(e.candidateId)) continue;
    const A = nodes[e.a], B = nodes[e.b], L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.ceil(L / 0.5);
    for (let k = 0; k <= n; k++) {
      const x = Math.floor((A.x + (B.x - A.x) * k / n) / S), y = Math.floor((A.y + (B.y - A.y) * k / n) / S);
      if (x >= 0 && x < GW && y >= 0 && y < GH) grid[y * GW + x] = 1;
    }
  }
  const start = Math.floor(peg.y / S) * GW + Math.floor(peg.x / S);
  if (grid[start]) return false;
  const stack = [start]; grid[start] = 2;
  while (stack.length) {
    const c = stack.pop(), x = c % GW, y = (c - x) / GW;
    if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) return true;
    for (const d of [c - 1, c + 1, c - GW, c + GW]) if (!grid[d]) { grid[d] = 2; stack.push(d); }
  }
  return false;
}
function ring(rng, peg, n, R, a0, jit = 0.12) {
  const step = TAU / n;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + i * step + rng.uniform(-jit, jit) * step, k = rng.uniform(0.93, 1.04);
    return { x: r1(peg.x + Math.cos(a) * R * k), y: r1(peg.y + Math.sin(a) * R * k) };
  });
}

function buildSceneExt(rng, round, attempt, knobs) {
  const fams = kindsFor('g12_knot_family', FAMS, knobs.ext);
  const family = knobs.n != null && Number.isFinite(Number(knobs.n)) ? fams[nthOf(`slipknot_release_pick|${knobs.ext}|family`, knobs.n, fams.length)] : fams[rng.int(0, fams.length - 1)];
  const peg = { x: rng.int(160, 180), y: rng.int(166, 194) };
  const small = family === 'detours' || family === 'twin';
  const [n1, n2] = small ? [4, 3] : rng.pick([[4, 4], [4, 3], [5, 3]]);
  const a0 = rng.uniform(0, TAU);
  const outer = ring(rng, peg, n1, rng.uniform(110, 124), a0);
  const R2 = n2 === 3 ? rng.uniform(58, 68) : rng.uniform(52, 64), b0 = rng.uniform(0, TAU);
  let inner = null, best = -1;
  for (let k = 0; k < 8; k++) {
    const cand = ring(rng, peg, n2, R2, n1 === n2 && k === 0 ? a0 : b0 + k * TAU / 8 / n2, 0.08);
    const clear = Math.min(...cand.map((p) => Math.min(...outer.map((a, i) => pd(p, a, outer[(i + 1) % n1])))));
    if (clear > best) { best = clear; inner = cand; }
  }
  const nodes = [...outer, ...inner];
  const O = (i) => i % n1, I = (i) => n1 + (i % n2);
  const edges = [];
  for (let i = 0; i < n1; i++) edges.push({ a: O(i), b: O(i + 1), rem: false });
  for (let i = 0; i < n2; i++) edges.push({ a: I(i), b: I(i + 1), rem: false });
  if (!planarOk(nodes, edges, peg)) return null;
  edges[rng.int(0, n1 - 1)].rem = true;
  edges[n1 + rng.int(0, n2 - 1)].rem = true;
  const want = 7;
  const nRem = () => edges.filter((e) => e.rem).length;
  const out = (p) => { const L = Math.hypot(p.x - peg.x, p.y - peg.y) || 1; return { x: (p.x - peg.x) / L, y: (p.y - peg.y) / L }; };
  const tryAdd = (newNodes, newEdges) => {
    const N = nodes.concat(newNodes), E = edges.concat(newEdges);
    if (!planarOk(N, E, peg)) return false;
    nodes.push(...newNodes); edges.push(...newEdges); return true;
  };
  const tail = (rem) => {
    const u = O(rng.int(0, n1 - 1)), d = out(nodes[u]), a = rng.uniform(-0.9, 0.9), L = rng.uniform(34, 48);
    const v = { x: r1(nodes[u].x + (d.x * Math.cos(a) - d.y * Math.sin(a)) * L), y: r1(nodes[u].y + (d.x * Math.sin(a) + d.y * Math.cos(a)) * L) };
    return tryAdd([v], [{ a: u, b: nodes.length, rem }]);
  };
  const spoke = (rem) => {
    const u = I(rng.int(0, n2 - 1)), d0 = out(nodes[u]), s = rng.int(0, 1) ? 1 : -1, a = rng.uniform(-0.6, 0.6);
    const d = { x: d0.x * Math.cos(a) - d0.y * Math.sin(a), y: d0.x * Math.sin(a) + d0.y * Math.cos(a) };
    const L = s > 0 ? rng.uniform(32, 44) : Math.min(rng.uniform(32, 44), d2(nodes[u], peg) - 30);
    if (L < 32) return false;
    const v = { x: r1(nodes[u].x + s * d.x * L), y: r1(nodes[u].y + s * d.y * L) };
    return tryAdd([v], [{ a: u, b: nodes.length, rem }]);
  };
  const angOf = (p) => Math.atan2(p.y - peg.y, p.x - peg.x);
  const bridge = (rem) => {
    const b = I(rng.int(0, n2 - 1)), ab = angOf(nodes[b]);
    const os = Array.from({ length: n1 }, (_, i) => O(i)).sort((x, y) => Math.abs(Math.sin((angOf(nodes[x]) - ab) / 2)) - Math.abs(Math.sin((angOf(nodes[y]) - ab) / 2)));
    return tryAdd([], [{ a: os[rng.int(0, 1)], b, rem }]);
  };
  const detour = (rem) => {
    const k = rng.int(0, n1 + n2 - 1), e = edges[k];
    const A = nodes[e.a], B = nodes[e.b], M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, d = out(M);
    const s = k < n1 ? 1 : -1, L = rng.uniform(26, 36);
    const w = { x: r1(M.x + s * d.x * L), y: r1(M.y + s * d.y * L) }, wi = nodes.length;
    return tryAdd([w], rng.int(0, 1) ? [{ a: e.a, b: wi, rem }, { a: wi, b: e.b, rem: false }] : [{ a: e.a, b: wi, rem: false }, { a: wi, b: e.b, rem }]);
  };
  const plan = {
    tails: [bridge, tail, tail, tail, spoke], spokes: [bridge, spoke, spoke, tail, tail], mixed: [bridge, tail, spoke, tail, tail],
    bridges: [bridge, bridge, tail, tail, tail], detours: [detour, bridge, tail, tail, spoke], twin: [bridge, bridge, tail, spoke, tail],
  }[family];
  for (const op of rng.shuffle(plan)) { let ok = false; for (let t = 0; t < 24 && !ok; t++) ok = op(true); if (!ok) return null; }
  if (family === 'twin') { let ok = false; for (let t = 0; t < 24 && !ok; t++) ok = (rng.int(0, 1) ? tail : spoke)(false); if (!ok) return null; }
  else if (n1 + n2 < 8 && family !== 'detours') for (let t = 0, extra = rng.int(0, 1); t < 14 && extra > 0; t++) if ((rng.int(0, 1) ? tail : spoke)(false)) extra--;
  if (nRem() !== want || nodes.length > 12 || edges.length > 13) return null;
  if (!edges.every((e) => !e.rem || d2(nodes[e.a], nodes[e.b]) >= 31)) return null;
  const remIdx = rng.shuffle(edges.map((e, i) => i).filter((i) => edges[i].rem));
  const sceneEdges = edges.map((e) => ({ a: e.a, b: e.b, candidateId: e.rem ? remIdx.indexOf(edges.indexOf(e)) : null }));
  const candidates = remIdx.map((ei, id) => ({ id, x: r1((nodes[edges[ei].a].x + nodes[edges[ei].b].x) / 2), y: r1((nodes[edges[ei].a].y + nodes[edges[ei].b].y) / 2), hitRadius: 20, release: false }));
  const scene = { ext: knobs.ext, family, nodes, edges: sceneEdges, candidates, peg };
  const works = [];
  if (rasterFree(nodes, sceneEdges, peg, new Set())) return null;
  for (let a = 0; a < candidates.length; a++) {
    if (rasterFree(nodes, sceneEdges, peg, new Set([a]))) return null;
    for (let b = a + 1; b < candidates.length; b++) {
      if (rasterFree(nodes, sceneEdges, peg, new Set([a, b]))) works.push([a, b]);
      if (works.length > 1) return null;
    }
  }
  if (works.length !== 1 || enclosingCyclesAfterCuts(scene, works[0]) !== 0) return null;
  candidates.forEach((c) => { c.release = works[0].includes(c.id); });
  for (const c of candidates) {
    if (candidates.some((q) => q !== c && d2(q, c) < 40)) return null;
    if (nodes.some((p) => d2(p, c) < 16)) return null;
    if (sceneEdges.some((e) => e.candidateId !== c.id && pd(c, nodes[e.a], nodes[e.b]) < 13)) return null;
    if (d2(c, peg) < 26) return null;
  }
  return scene;
}
export function semanticKey(m) {
  const s = m.rounds[0], q = (p) => `${Math.round(p.x / 42)},${Math.round(p.y / 42)}`, ans = new Set(m.answerSet);
  const bars = s.edges.map((e) => [q(s.nodes[e.a]), q(s.nodes[e.b])].sort().join('-') + (e.candidateId == null ? 'F' : ans.has(e.candidateId) ? 'A' : 'R'));
  return `knot|peg:${q(s.peg)}|E:${bars.sort().join(';')}`;
}

function validateAny(scene, answer) {
  if (!scene.ext) return validateWebScene(scene, answer);
  if (!slipknotReleasePickSpec.validateScene(scene, answer)) return false;
  return FAMS.includes(scene.family) && scene.candidates.length === 7 && scene.nodes.length <= 12 && scene.edges.length <= 13
    && planarOk(scene.nodes, scene.edges.map((e) => ({ a: e.a, b: e.b })), scene.peg);
}

const ROPES = ['steel', 'rope', 'cable', 'chain', 'dowel'];
const orangeish = (t) => { const [r, g, b] = t.mean_lin; return r > 1.6 * g && r > 2.2 * b; };
async function mount(env) {
  const st = env.style;
  if (!st) return;
  const grounds = texItems(st, ['wood', 'floor', 'fabric', 'stone', 'terrain'], (t) => !orangeish(t) && !/rust|laterite|rosewood|pattern|check|herringbone|jacquard|quatrefoil|corduroy|square_floor|interior_tiles/.test(t.id));
  const ropes = kindsFor('g12_rope', ROPES, st.split);
  const [gi, ri] = st.primaryCombo('g12_knot', [grounds.length, ropes.length]);
  const rope = ropes[ri]; st.note(`g12_rope:${rope}`);
  const pick = (L) => L[Math.floor(st.rand() * L.length)];
  const fixedUse = { steel: ['metal'], chain: ['metal'], dowel: ['wood'], rope: ['fabric'], cable: ['metal'] }[rope];
  const fixedPool = texItems(st, fixedUse, (t) => !orangeish(t) && !/rust/.test(t.id));
  const [ground, fixed, pegMat, paint] = await Promise.all([
    makeMat(st, grounds[gi], { scale: [0.3, 0.6] }),
    makeMat(st, pick(fixedPool.length ? fixedPool : texItems(st, fixedUse)), { scale: [0.1, 0.16], rotate: false }),
    makeMat(st, pick(texItems(st, ['wood'], (t) => !/rosewood/.test(t.id))), { scale: [0.1, 0.16] }),
    makeMat(st, pick(texItems(st, ['metal', 'wood'])), { scale: [0.12, 0.2], rotate: false }),
  ]);
  const TONES = { hemp: [214, 196, 160], white: [235, 232, 222], grey: [120, 124, 120], green: [70, 92, 70], tan: [182, 160, 120] };
  const ropeTone = TONES[pickKind(st, 'g12_rope_tone', Object.keys(TONES))];
  env.assets.g12 = { rope, ground, fixed, pegMat, paint, ropeTone, dim: st.rand() * 0.15, fixedW: 6 + st.rand() * 2.5 };
}

function rod(g, A, B, w, fill, shade = true, edge = 0) {
  const ang = Math.atan2(B.y - A.y, B.x - A.x), L = Math.hypot(B.x - A.x, B.y - A.y);
  g.save(); g.translate(A.x, A.y); g.rotate(ang);
  g.beginPath(); g.rect(0, -w / 2, L, w); g.fillStyle = fill; g.fill();
  if (shade) {
    const sh = g.createLinearGradient(0, -w / 2, 0, w / 2);
    sh.addColorStop(0, 'rgba(255,255,255,.4)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = sh; g.fillRect(0, -w / 2, L, w);
  }
  if (edge) { g.strokeStyle = `rgba(10,10,10,${edge})`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -w / 2); g.lineTo(L, -w / 2); g.moveTo(0, w / 2); g.lineTo(L, w / 2); g.stroke(); }
  g.restore();
}
function fixedBar(g, Lk, A, B) {
  const w = Lk.fixedW, ang = Math.atan2(B.y - A.y, B.x - A.x), L = Math.hypot(B.x - A.x, B.y - A.y);
  if (Lk.rope === 'rope') {
    const [r, gg, b] = Lk.ropeTone;
    rod(g, A, B, w, `rgb(${r},${gg},${b})`, true, 0.6);
    g.save(); g.translate(A.x, A.y); g.rotate(ang); g.beginPath(); g.rect(0, -w / 2, L, w); g.clip();
    g.strokeStyle = `rgba(${r * 0.45},${gg * 0.45},${b * 0.45},.75)`; g.lineWidth = 1.1;
    for (let x = -w; x < L + w; x += 3.4) { g.beginPath(); g.moveTo(x, w / 2); g.lineTo(x + w * 0.9, -w / 2); g.stroke(); }
    g.restore();
  } else if (Lk.rope === 'cable') {
    rod(g, A, B, w, '#1f2226', true, 0.8);
  } else if (Lk.rope === 'chain') {
    g.save(); g.translate(A.x, A.y); g.rotate(ang);
    const step = w * 1.5;
    for (let x = step / 2, k = 0; x < L; x += step, k++) {
      g.beginPath(); g.ellipse(x, 0, step * 0.62, k % 2 ? w * 0.18 : w * 0.45, 0, 0, TAU);
      g.strokeStyle = '#2b2f33'; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = '#a7adb2'; g.lineWidth = 1.4; g.stroke();
    }
    g.restore();
  } else {
    const p = localPattern(g, Lk.fixed, A.x, A.y, ang * 180 / Math.PI);
    rod(g, A, B, w, p, true, 0.75);
    if (Lk.rope === 'steel') { g.save(); g.globalAlpha = 0.35; rod(g, A, B, w, '#8a96a0', false); g.restore(); rod(g, A, B, w, 'rgba(0,0,0,0)', true, 0.75); }
  }
}
function orangeBar(g, Lk, A, B, removed) {
  const w = 9;
  g.save();
  if (removed) { g.globalAlpha = 0.28; g.setLineDash([2, 6]); }
  if (removed) {
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.strokeStyle = '#d66b43'; g.lineWidth = w; g.lineCap = 'round'; g.stroke();
  } else {
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    rod(g, A, B, w, localPattern(g, Lk.paint, A.x, A.y, ang * 180 / Math.PI), false);
    rod(g, A, B, w, 'rgba(226,106,52,.84)', true, 0.5);
  }
  g.restore();
}
function drawStyled(g, scene, Lk, board, state) {
  g.beginPath(); g.rect(0, 0, board.w, board.h); fillMat(g, Lk.ground);
  if (Lk.dim > 0) { g.fillStyle = `rgba(0,0,0,${Lk.dim})`; g.fillRect(0, 0, board.w, board.h); }
  g.save(); g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,.28)';
  for (const e of scene.edges) { const A = scene.nodes[e.a], B = scene.nodes[e.b]; g.lineWidth = e.candidateId == null ? Lk.fixedW + 1 : 10; g.beginPath(); g.moveTo(A.x + 2.5, A.y + 3); g.lineTo(B.x + 2.5, B.y + 3); g.stroke(); }
  g.restore();
  for (const e of scene.edges) if (e.candidateId == null) fixedBar(g, Lk, scene.nodes[e.a], scene.nodes[e.b]);
  for (const e of scene.edges) if (e.candidateId != null) orangeBar(g, Lk, scene.nodes[e.a], scene.nodes[e.b], state.selected.includes(e.candidateId));
  for (const p of scene.nodes) {
    g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.fillStyle = '#c9cfd4'; g.fill(); g.strokeStyle = '#3b4248'; g.lineWidth = 1.3; g.stroke();
    g.beginPath(); g.arc(p.x, p.y, 2, 0, TAU); g.fillStyle = '#3b4248'; g.fill();
  }
  const P = scene.peg;
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3;
  g.beginPath(); g.arc(P.x, P.y, 12, 0, TAU); g.fillStyle = '#7a5a36'; g.fill(); g.restore();
  g.beginPath(); g.arc(P.x, P.y, 12, 0, TAU); fillMat(g, Lk.pegMat, 0.55);
  domeShade(g, P.x, P.y, 12, 0.9);
  g.strokeStyle = '#4a3420'; g.lineWidth = 1.2; g.beginPath(); g.arc(P.x, P.y, 12, 0, TAU); g.stroke();
  g.fillStyle = '#fff'; g.font = `700 7px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Peg', P.x, P.y);
  for (const c of scene.candidates) {
    g.beginPath(); g.arc(c.x, c.y, 10, 0, TAU); g.fillStyle = '#fff8f4'; g.fill(); g.strokeStyle = '#9a4934'; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#9a4934'; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String.fromCharCode(65 + c.id), c.x, c.y + 0.3);
  }
}
function drawSceneAny(g, scene, ctx) {
  const look = ctx && ctx.env && ctx.env.style ? ctx.env.assets.g12 : null;
  if (look) return drawStyled(g, scene, look, ctx.board, ctx.state);
  return slipknotReleasePickSpec.drawScene(g, scene, ctx);
}

const built = makeCompositeTask({
  ...slipknotReleasePickSpec, buildScene: (rng) => buildWebScene(rng), generationAttempts: 40,
  buildSceneExt, validateScene: validateAny, drawScene: drawSceneAny, mount, extGenerationAttempts: 6000,
  estimatedGuessRate: 1 / 165,
  gtContract: 'among all sets of K removable rendered bars (K = scene.removeCount), choose the unique set whose removal joins the peg\'s cell to the outside; no smaller set does',
  toleranceDesign: '11-13 lettered orange bars, K = 3 or 4; exact set required (blind probability <= 1/165)',
});
export const gate = built.gate;
const task = built.task;

const removeCountOf = (env) => (env && env.manifest && env.manifest.rounds[0].removeCount) || 2;
const promptOf = (k) => `Remove ${k} orange bars to free the peg`;
const HINT = "Tap a bar's letter to remove it";
task.meta.promptHuman = `Remove the stated number of orange bars to free the peg (${HINT}).`;
task.meta.headerH = 56;
task.drawPrompt = (g, r, env) => drawPromptText(g, r, promptOf(removeCountOf(env)), HINT);
task.footerStatus = (env) => {
  const n = env.state.selected.length;
  return `${n} bar${n === 1 ? '' : 's'} removed`;
};

export default task;
