import { drawPromptText } from '../core/panel.js';
import {
  makeIso, isoSteps, paintOrder, topVisibleFrac, occludedAt,
  shade, polyPath, drawBoxFaces, shadowOnPlane, fillShadows,
  drawRunner, drawGem,
} from '../common/_route_maze_iso.js';
import { mountIsoLook, drawIsoStyled } from '../common/_reachable_gem_pick_look.js';
import { hash32 } from '../core/style.js';

const BOARD = { w: 460, h: 430 };
const HARD = Object.freeze({
  N: 7, rounds: 1, gems: 8,
  kMin: 2, kMax: 4,
  minWalk: 2,
  minTempting: 2,
  visCell: 0.2,
  gemSep: 34,
  perRegion: 2,
  perArea: 4,
  maxBridges: 3,
});
const N = HARD.N;
const LVL = 0.85;
const BASE = 0.4;
const DECK_T = 0.12;
const STAIR_W = 0.5, STAIR_D = 0.62, STAIR_K = 3;
const LIGHT = { x: -0.3, y: -0.8 };
const ISO_DX = 30, ISO_EL = 50, ISO_OY = 70;

const VIEW = (() => {
  const st = isoSteps(ISO_DX, ISO_EL);
  return makeIso({ ox: BOARD.w / 2, oy: ISO_OY, DX: st.DX, DY: st.DY, DZ: st.DZ });
})();

const EXT_VIEW = Object.freeze({ DX: [ISO_DX, ISO_DX], el: [ISO_EL, ISO_EL], jx: 5, jy: [-8, 3] });
const VIEWC = new WeakMap();
function viewOf(r) {
  if (!r || !r.view) return VIEW;
  let v = VIEWC.get(r.view);
  if (!v) { const st = isoSteps(r.view.DX, r.view.el); v = makeIso({ ox: r.view.ox, oy: r.view.oy, DX: st.DX, DY: st.DY, DZ: st.DZ }); VIEWC.set(r.view, v); }
  return v;
}
function viewOk(v) {
  return !!v && Number.isFinite(v.DX) && Number.isFinite(v.el) && Number.isFinite(v.ox) && Number.isFinite(v.oy)
    && v.DX >= EXT_VIEW.DX[0] - 1e-9 && v.DX <= EXT_VIEW.DX[1] + 1e-9 && v.el >= EXT_VIEW.el[0] - 1e-9 && v.el <= EXT_VIEW.el[1] + 1e-9
    && Math.abs(v.ox - BOARD.w / 2) <= EXT_VIEW.jx + 1e-9 && v.oy - VIEW.oy >= EXT_VIEW.jy[0] - 1e-9 && v.oy - VIEW.oy <= EXT_VIEW.jy[1] + 1e-9;
}
function pickView(rng) {
  const DX = EXT_VIEW.DX[0], el = EXT_VIEW.el[0];
  return { DX, el, ox: +(BOARD.w / 2 + rng.uniform(-EXT_VIEW.jx, EXT_VIEW.jx)).toFixed(2), oy: +(VIEW.oy + rng.uniform(...EXT_VIEW.jy)).toFixed(2) };
}
export function semanticKey(m) {
  const r = m.rounds[0], ans = new Set(r.answer);
  const g = r.gems.map((x, k) => `${x.kind[0]}${x.i},${x.j}${ans.has(k) ? '*' : ''}`).sort();
  const st = r.stairs.map((x) => `${x.i},${x.j},${x.ux},${x.uy}`).sort(), br = r.bridges.map((x) => `${x.i},${x.j}${x.ax}`).sort();
  return `gem3d8|${r.H.join('')}|${st.join(';')}|${br.join(';')}|${r.runner.i},${r.runner.j}|${g.join(';')}`;
}
const keySplit = (k) => (hash32(`gem3d_key|${k}`) % 10 === 0 ? 'test' : 'train');

const inb = (i, j) => i >= 0 && i < N && j >= 0 && j < N;
const ck = (i, j) => j * N + i;
const topZ = (h) => h * LVL;

export function walkGraph(r) {
  const n = N * N + r.bridges.length, adj = Array.from({ length: n }, () => []);
  const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (i + 1 < N && r.H[ck(i, j)] === r.H[ck(i + 1, j)]) link(ck(i, j), ck(i + 1, j));
    if (j + 1 < N && r.H[ck(i, j)] === r.H[ck(i, j + 1)]) link(ck(i, j), ck(i, j + 1));
  }
  for (const s of r.stairs) link(ck(s.i, s.j), ck(s.i + s.ux, s.j + s.uy));
  r.bridges.forEach((b, k) => {
    const dx = b.ax === 'x' ? 1 : 0, dy = 1 - dx;
    link(N * N + k, ck(b.i - dx, b.j - dy)); link(N * N + k, ck(b.i + dx, b.j + dy));
  });
  return adj;
}

function bfs(adj, from) {
  const d = new Array(adj.length).fill(-1); d[from] = 0; const q = [from];
  for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v); }
  return d;
}

function bfs01(out, from) {
  const d = new Array(out.length).fill(Infinity); d[from] = 0;
  let cur = [from];
  for (let level = 0; cur.length; level++) {
    for (let h = 0; h < cur.length; h++) {
      const v = cur[h];
      if (d[v] !== level) continue;
      for (const [u, c] of out[v]) if (c === 0 && d[u] > level) { d[u] = level; cur.push(u); }
    }
    const next = [];
    for (const v of cur) if (d[v] === level) for (const [u, c] of out[v]) if (c === 1 && d[u] > level + 1) { d[u] = level + 1; next.push(u); }
    cur = next;
  }
  return d;
}

const gemNode = (r, g) => (g.kind === 'deck' ? N * N + r.bridges.findIndex((b) => b.i === g.i && b.j === g.j) : ck(g.i, g.j));

export function pictureGraph(r) {
  const adj = walkGraph(r).map((a) => a.slice());
  const link = (a, b) => { if (!adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); } };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    for (const [dx, dy] of [[-1, 0], [0, -1]]) {
      const a = i + dx, b = j + dy;
      if (!inb(a, b)) continue;
      if (r.H[ck(i, j)] > r.H[ck(a, b)]) link(ck(i, j), ck(a, b));
    }
  }
  r.bridges.forEach((b, k) => link(N * N + k, ck(b.i, b.j)));
  return adj;
}

export function flatRegions(r) {
  const reg = new Array(N * N).fill(-1); let nr = 0;
  for (let c = 0; c < N * N; c++) {
    if (reg[c] >= 0) continue;
    const q = [c]; reg[c] = nr;
    for (let h = 0; h < q.length; h++) {
      const v = q[h], i = v % N, j = Math.floor(v / N);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + dx, b = j + dy;
        if (!inb(a, b)) continue;
        const u = ck(a, b);
        if (reg[u] < 0 && r.H[u] === r.H[v]) { reg[u] = nr; q.push(u); }
      }
    }
    nr++;
  }
  return { reg, nr };
}

function nodeFacts(r, adj, pic) {
  const nB = r.bridges.length, n = N * N + nB, run = ck(r.runner.i, r.runner.j);
  const { reg, nr } = flatRegions(r);
  const hasConn = new Array(nr).fill(false);
  for (const s of r.stairs) { hasConn[reg[ck(s.i, s.j)]] = true; hasConn[reg[ck(s.i + s.ux, s.j + s.uy)]] = true; }
  const ends = r.bridges.map((b) => { const dx = b.ax === 'x' ? 1 : 0, dy = 1 - dx; return [ck(b.i - dx, b.j - dy), ck(b.i + dx, b.j + dy)]; });
  for (const [a, c] of ends) { hasConn[reg[a]] = true; hasConn[reg[c]] = true; }
  const o1 = Array.from({ length: n }, () => []);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = ck(i, j);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + dx, b = j + dy; if (inb(a, b) && r.H[ck(a, b)] === r.H[v]) o1[v].push([ck(a, b), 0]); }
  }
  for (const s of r.stairs) { const a = ck(s.i, s.j), b = ck(s.i + s.ux, s.j + s.uy); o1[a].push([b, 1]); o1[b].push([a, 1]); }
  ends.forEach(([a, c], k) => { const dk = N * N + k; o1[a].push([dk, 1]); o1[c].push([dk, 1]); o1[dk].push([a, 0]); o1[dk].push([c, 0]); });
  const hops = bfs01(o1, run);
  const o2 = adj.map((a) => a.map((u) => [u, 0]));
  const lvlOf = (v) => (v >= N * N ? -1 : r.H[v]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = ck(i, j);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + dx, b = j + dy;
      if (!inb(a, b)) continue;
      if (Math.abs(r.H[ck(a, b)] - r.H[v]) === 1) o2[v].push([ck(a, b), 1]);
      const a2 = i + 2 * dx, b2 = j + 2 * dy;
      if (inb(a2, b2) && r.H[ck(a2, b2)] === r.H[v] && r.H[ck(a, b)] < r.H[v]) o2[v].push([ck(a2, b2), 1]);
    }
  }
  const relax = bfs01(o2, run);
  const d = bfs(adj, run), dp = bfs(pic, run);
  const comp = new Array(n).fill(-1);
  for (let v = 0, nc = 0; v < n; v++) if (comp[v] < 0) { const q = [v]; comp[v] = nc; for (let h = 0; h < q.length; h++) for (const u of adj[q[h]]) if (comp[u] < 0) { comp[u] = nc; q.push(u); } nc++; }
  const facts = [];
  for (let v = 0; v < n; v++) {
    const deck = v >= N * N;
    const lvl = deck ? Math.round(deckTop(r, r.bridges[v - N * N]) / LVL) : lvlOf(v);
    facts.push({
      reach: d[v] >= 0, d: d[v], hops: hops[v], relax: relax[v], pic: dp[v] >= 0, lvl,
      access: deck ? true : hasConn[reg[v]], own: !deck && reg[v] === reg[run], region: deck ? `d${v}` : `r${reg[v]}`, comp: comp[v],
    });
  }
  return { facts, run, hr: r.H[run] };
}

function sideCells(b) {
  const px = b.ax === 'x' ? 0 : 1, py = 1 - px;
  return [[b.i + px, b.j + py], [b.i - px, b.j - py]];
}

function heightMap(rng) {
  const H = new Array(N * N).fill(0);
  const rect = (lvl, wMin, wMax) => {
    const w = rng.int(wMin, wMax), h = rng.int(wMin, wMax);
    const i0 = rng.int(0, N - w), j0 = rng.int(0, N - h);
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) H[ck(i, j)] = Math.max(H[ck(i, j)], lvl);
  };
  const n1 = rng.int(3, 4), n2 = rng.int(1, 3);
  for (let k = 0; k < n1; k++) rect(1, 2, 4);
  for (let k = 0; k < n2; k++) rect(2, 1, 3);
  const sites = [];
  const nSites = rng.raw() < 0.8 ? rng.int(1, 2) : 0;
  for (let s = 0; s < nSites; s++) {
    const ax = rng.raw() < 0.5 ? 'x' : 'y', dx = ax === 'x' ? 1 : 0, dy = 1 - dx;
    const bi = rng.int(dx, N - 1 - dx), bj = rng.int(dy, N - 1 - dy), hb = rng.int(1, 2);
    for (const sgn of [-1, 1]) for (const k of [1, 2]) {
      const a = bi + sgn * k * dx, b = bj + sgn * k * dy;
      if (inb(a, b) && (k === 1 || rng.raw() < 0.7)) H[ck(a, b)] = hb;
    }
    const reach = rng.raw() < 0.5 ? N : 1;
    for (let t = -reach; t <= reach; t++) {
      const a = bi + t * dy, b = bj + t * dx;
      if (inb(a, b)) H[ck(a, b)] = hb - 1;
    }
    sites.push({ i: bi, j: bj, ax });
  }
  for (let pass = 0; pass < 5; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (const [dx, dy] of [[-1, 0], [0, -1]]) {
      const a = i + dx, b = j + dy;
      if (inb(a, b) && H[ck(i, j)] - H[ck(a, b)] >= 2) H[ck(a, b)] = H[ck(i, j)] - 1;
    }
  }
  return { H, sites };
}

function cornerSafe(H) {
  for (let j = 0; j + 1 < N; j++) for (let i = 0; i + 1 < N; i++) {
    const a = H[ck(i, j)], b = H[ck(i + 1, j)], c = H[ck(i, j + 1)], d = H[ck(i + 1, j + 1)];
    if (a === d && b !== a && c !== a) return false;
    if (b === c && a !== b && d !== b) return false;
  }
  return true;
}

function placeStairs(rng, H) {
  const cands = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (const [ux, uy] of [[-1, 0], [0, -1]]) {
    const a = i + ux, b = j + uy;
    if (inb(a, b) && H[ck(a, b)] === H[ck(i, j)] + 1) cands.push({ i, j, ux, uy });
  }
  const out = [], want = rng.int(3, 6);
  for (const s of rng.shuffle(cands)) {
    if (out.length >= want) break;
    if (out.some((o) => (o.i === s.i && o.j === s.j) || (o.i + o.ux === s.i + s.ux && o.j + o.uy === s.j + s.uy))) continue;
    out.push(s);
  }
  return out;
}

function bridgeValid(H, stairs, b) {
  const dx = b.ax === 'x' ? 1 : 0, dy = 1 - dx;
  if (!inb(b.i - dx, b.j - dy) || !inb(b.i + dx, b.j + dy)) return false;
  const hb = H[ck(b.i - dx, b.j - dy)];
  if (hb < 1 || H[ck(b.i + dx, b.j + dy)] !== hb || H[ck(b.i, b.j)] >= hb) return false;
  if (sideCells(b).some(([a, c]) => inb(a, c) && H[ck(a, c)] >= H[ck(b.i, b.j)] + 1 && H[ck(a, c)] <= hb)) return false;
  if (stairs.some((s) => s.i === b.i && s.j === b.j)) return false;
  return true;
}

function placeBridges(rng, H, stairs, sites) {
  const out = [];
  for (const site of sites) if (bridgeValid(H, stairs, site) && !out.some((o) => Math.abs(o.i - site.i) + Math.abs(o.j - site.j) < 2)) out.push(site);
  if (rng.raw() < 0.4) {
    const cands = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (const ax of ['x', 'y']) if (bridgeValid(H, stairs, { i, j, ax })) cands.push({ i, j, ax });
    for (const b of rng.shuffle(cands)) {
      if (out.length >= HARD.maxBridges) break;
      if (out.some((o) => Math.abs(o.i - b.i) + Math.abs(o.j - b.j) < 2)) continue;
      out.push(b);
    }
  }
  return out;
}

function deckTop(r, b) { return topZ(r.H[ck(b.i - (b.ax === 'x' ? 1 : 0), b.j - (b.ax === 'x' ? 0 : 1))]); }
function spotOf(r, g) {
  if (g.kind === 'deck') return { x: g.i + 0.5, y: g.j + 0.5, z: deckTop(r, r.bridges.find((b) => b.i === g.i && b.j === g.j)) };
  return { x: g.i + 0.5, y: g.j + 0.5, z: topZ(r.H[ck(g.i, g.j)]) };
}
function spriteBox(p, h, role, gem) {
  return { x0: p.x - 0.14, x1: p.x + 0.14, y0: p.y - 0.14, y1: p.y + 0.14, z0: p.z, z1: p.z + h, role, ...(gem !== undefined ? { gem } : {}) };
}
export function sceneBoxes(r, withSprites = true) {
  const out = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    out.push({ x0: i, x1: i + 1, y0: j, y1: j + 1, z0: -BASE, z1: topZ(r.H[ck(i, j)]), role: 'ground', cell: ck(i, j) });
  }
  for (const s of r.stairs) {
    const z0 = topZ(r.H[ck(s.i, s.j)]), dz = LVL / STAIR_K;
    for (let k = 0; k < STAIR_K; k++) {
      const f0 = STAIR_D * (1 - k / STAIR_K), f1 = STAIR_D * (1 - (k + 1) / STAIR_K);
      const box = s.ux
        ? { x0: s.i + f1, x1: s.i + f0, y0: s.j + 0.5 - STAIR_W / 2, y1: s.j + 0.5 + STAIR_W / 2 }
        : { x0: s.i + 0.5 - STAIR_W / 2, x1: s.i + 0.5 + STAIR_W / 2, y0: s.j + f1, y1: s.j + f0 };
      out.push({ ...box, z0, z1: z0 + dz * (k + 1), role: 'step', cell: ck(s.i, s.j) });
    }
  }
  r.bridges.forEach((b, k) => {
    const hb = deckTop(r, b);
    const box = b.ax === 'x' ? { x0: b.i, x1: b.i + 1, y0: b.j + 0.24, y1: b.j + 0.76 } : { x0: b.i + 0.24, x1: b.i + 0.76, y0: b.j, y1: b.j + 1 };
    out.push({ ...box, z0: hb - DECK_T, z1: hb, role: 'deck', deck: k });
    const rail = (o) => out.push({ ...o, z0: hb, z1: hb + 0.16, role: 'rail', deck: k });
    if (b.ax === 'x') { rail({ ...box, y1: box.y0 + 0.05 }); rail({ ...box, y0: box.y1 - 0.05 }); }
    else { rail({ ...box, x1: box.x0 + 0.05 }); rail({ ...box, x0: box.x1 - 0.05 }); }
  });
  if (withSprites) {
    out.push(spriteBox(spotOf(r, { kind: 'cell', ...r.runner }), 1.2, 'runner'));
    r.gems.forEach((g, k) => out.push(spriteBox(spotOf(r, g), 0.95, 'gem', k)));
  }
  return out;
}

const cache = new WeakMap();
function prepared(r) {
  let c = cache.get(r);
  if (!c) { c = { ord: paintOrder(viewOf(r), sceneBoxes(r, true)), shadows: null }; cache.set(r, c); }
  return c;
}
function shadowsOf(r) {
  const c = prepared(r);
  if (c.shadows) return c.shadows;
  const casters = c.ord.filter((it) => it.role === 'ground' || it.role === 'deck' || it.role === 'step');
  c.shadows = new Map();
  for (const it of c.ord) {
    if (it.role !== 'ground') continue;
    const zr = it.z1, list = [];
    for (const c2 of casters) {
      if (c2 === it || c2.z1 <= zr + 1e-6) continue;
      if (Math.abs((c2.x0 + c2.x1) / 2 - (it.x0 + it.x1) / 2) > 3.5 || Math.abs((c2.y0 + c2.y1) / 2 - (it.y0 + it.y1) / 2) > 3.5) continue;
      list.push(shadowOnPlane({ ...c2, z0: Math.max(c2.z0, zr) }, zr, LIGHT.x, LIGHT.y));
    }
    c.shadows.set(it, list);
  }
  return c.shadows;
}

const gemCenterOf = (r, g) => { const p = spotOf(r, g), a = viewOf(r).p(p.x, p.y, p.z); return { x: a.x, y: a.y - 12 }; };
export const gemCenter = (r, k) => gemCenterOf(r, r.gems[k]);

const terrainCache = new WeakMap();
function terrainOk(r) {
  if (!r || !Array.isArray(r.H) || r.H.length !== N * N || r.H.some((h) => !(h === 0 || h === 1 || h === 2))) return null;
  if (!Array.isArray(r.stairs) || !Array.isArray(r.bridges) || r.bridges.length > HARD.maxBridges) return null;
  if (!cornerSafe(r.H)) return null;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (const [dx, dy] of [[-1, 0], [0, -1]]) {
    if (inb(i + dx, j + dy) && r.H[ck(i, j)] - r.H[ck(i + dx, j + dy)] >= 2) return null;
  }
  for (const s of r.stairs) {
    if (!inb(s.i, s.j) || !inb(s.i + s.ux, s.j + s.uy) || !((s.ux === -1 && s.uy === 0) || (s.ux === 0 && s.uy === -1))) return null;
    if (r.H[ck(s.i + s.ux, s.j + s.uy)] !== r.H[ck(s.i, s.j)] + 1) return null;
  }
  for (const b of r.bridges) if (!bridgeValid(r.H, r.stairs, b)) return null;
  const V = viewOf(r);
  const ord = paintOrder(V, sceneBoxes(r, false));
  for (let k = 0; k < ord.length; k++) {
    if (ord[k].role === 'ground' && topVisibleFrac(V, ord, k, 5) < HARD.visCell) return null;
  }
  for (const it of ord) for (const q of it.hull) if (q.x < 3 || q.x > BOARD.w - 3 || q.y < 3 || q.y > BOARD.h - 3) return null;
  const adj = walkGraph(r), pic = pictureGraph(r);
  return { ord, adj, pic };
}

function answerRulesOk(r, nodes, F) {
  const ans = new Set(r.answer);
  const right = nodes.filter((_, k) => ans.has(k)).map((v) => F.facts[v]);
  const wrong = nodes.filter((_, k) => !ans.has(k)).map((v) => F.facts[v]);
  if (right.some((f) => !f.reach || f.d < HARD.minWalk) || wrong.some((f) => f.reach)) return false;
  if (right.filter((f) => f.hops === 0).length > 1) return false;
  if (!right.some((f) => f.hops >= 2)) return false;
  if (!right.some((f) => f.lvl !== F.hr)) return false;
  if (wrong.filter((f) => !f.access).length > 1) return false;
  if (wrong.filter((f) => f.relax !== 1).length > 1) return false;
  if (wrong.filter((f) => f.relax !== 1 || !f.access).length > 1) return false;
  if (wrong.filter((f) => f.pic).length < HARD.minTempting) return false;
  const cnt = new Map();
  for (const v of nodes) { const key = F.facts[v].region; cnt.set(key, (cnt.get(key) || 0) + 1); }
  if ([...cnt.values()].some((c) => c > HARD.perRegion)) return false;
  const cc = new Map();
  for (const f of wrong) cc.set(f.comp, (cc.get(f.comp) || 0) + 1);
  if (cc.size < 2 || [...cc.values()].some((c) => c > HARD.perArea)) return false;
  return true;
}

function placementOk(r, T) {
  if (!r.runner || !Array.isArray(r.gems) || r.gems.length !== HARD.gems) return null;
  if (!Array.isArray(r.answer) || r.answer.length < HARD.kMin || r.answer.length > HARD.kMax) return null;
  if (!r.answer.every((a, k) => Number.isInteger(a) && a >= 0 && a < HARD.gems && (k === 0 || a > r.answer[k - 1]))) return null;
  if (!inb(r.runner.i, r.runner.j)) return null;
  const run = ck(r.runner.i, r.runner.j);
  const nodes = r.gems.map((g) => (g && (g.kind === 'cell' || g.kind === 'deck') && inb(g.i, g.j) ? gemNode(r, g) : -1));
  if (nodes.some((v) => v < 0) || new Set(nodes).size !== HARD.gems || nodes.includes(run)) return null;
  const onStair = (i, j) => r.stairs.some((s) => s.i === i && s.j === j);
  if (onStair(r.runner.i, r.runner.j) || r.gems.some((g) => g.kind === 'cell' && onStair(g.i, g.j))) return null;
  const F = nodeFacts(r, T.adj, T.pic);
  if (!answerRulesOk(r, nodes, F)) return null;
  const V = viewOf(r);
  const sprites = [spriteBox(spotOf(r, { kind: 'cell', ...r.runner }), 1.2, 'runner'), ...r.gems.map((g) => spriteBox(spotOf(r, g), 0.95, 'gem'))];
  for (const b of sprites) {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const pts = [b.z0 + 0.2, b.z0 + 0.5, b.z1 - 0.1].map((z) => V.p(cx, cy, z));
    if (occludedAt(T.ord, b, pts)) return null;
    if (pts.some((q) => q.y < 16 || q.x < 12 || q.x > BOARD.w - 12)) return null;
  }
  const cs = r.gems.map((g) => gemCenterOf(r, g));
  const rs = spotOf(r, { kind: 'cell', ...r.runner }), rp = V.p(rs.x, rs.y, rs.z);
  for (let a = 0; a < cs.length; a++) {
    if (Math.hypot(cs[a].x - rp.x, cs[a].y - (rp.y - 14)) < HARD.gemSep) return null;
    for (let b = a + 1; b < cs.length; b++) if (Math.hypot(cs[a].x - cs[b].x, cs[a].y - cs[b].y) < HARD.gemSep) return null;
  }
  return { F, nodes };
}

function roundOk(r) {
  let T = terrainCache.get(r);
  if (T === undefined) { T = terrainOk(r); terrainCache.set(r, T); }
  return T ? placementOk(r, T) : null;
}

function makeRound(rng, view = null) {
  const want = { k: rng.int(HARD.kMin, HARD.kMax), sameWrong: rng.raw() < 0.85 };
  for (let attempt = 0; attempt < 32000; attempt++) {
    if (attempt === 8000) want.sameWrong = false;
    if ((attempt === 16000 || attempt === 24000) && want.k < HARD.kMax) want.k++;
    const { H, sites } = heightMap(rng);
    if (!cornerSafe(H)) continue;
    const stairs = placeStairs(rng, H);
    const bridges = placeBridges(rng, H, stairs, sites);
    const terr = view ? { H, stairs, bridges, view } : { H, stairs, bridges };
    const cells = [...Array(N * N).keys()].filter((c) => !stairs.some((s) => ck(s.i, s.j) === c));
    const allNodes = [...cells, ...bridges.map((_, k) => N * N + k)];
    const adj0 = walkGraph(terr), pic0 = pictureGraph(terr);
    const toGem = (v) => (v >= N * N ? { kind: 'deck', i: bridges[v - N * N].i, j: bridges[v - N * N].j }
      : { kind: 'cell', i: v % N, j: Math.floor(v / N) });
    let T = null;
    const seen = new Set(), runs = [];
    { const lab = new Array(adj0.length).fill(-1); let nc = 0;
      for (let v = 0; v < adj0.length; v++) if (lab[v] < 0) { const q = [v]; lab[v] = nc; for (let h = 0; h < q.length; h++) for (const u of adj0[q[h]]) if (lab[u] < 0) { lab[u] = nc; q.push(u); } nc++; }
      for (const c of rng.shuffle(cells)) if (!seen.has(lab[c])) { seen.add(lab[c]); runs.push(c); }
      for (const c of rng.shuffle(cells)) { if (runs.length >= seen.size + 4) break; if (!runs.includes(c)) runs.push(c); } }
    for (const run of runs) {
      const F = nodeFacts({ ...terr, runner: { i: run % N, j: Math.floor(run / N) } }, adj0, pic0);
      const fx = F.facts;
      const rightPool = allNodes.filter((v) => v !== run && fx[v].reach && fx[v].d >= HARD.minWalk);
      const wrongPool = allNodes.filter((v) => !fx[v].reach && (fx[v].access || fx[v].relax === 1));
      const nearPool = wrongPool.filter((v) => fx[v].relax === 1 && fx[v].access);
      const nWrong = HARD.gems - want.k;
      if (rightPool.length < want.k || nearPool.length < nWrong - 1 || wrongPool.length < nWrong) continue;
      const capOf = (pool) => {
        const area = new Map();
        for (const v of pool) { const a = area.get(fx[v].comp) || new Map(); a.set(fx[v].region, (a.get(fx[v].region) || 0) + 1); area.set(fx[v].comp, a); }
        let t = 0;
        for (const a of area.values()) t += Math.min(HARD.perArea, [...a.values()].reduce((x, c) => x + Math.min(HARD.perRegion, c), 0));
        return t;
      };
      if (capOf(nearPool) < nWrong - 1 || capOf(wrongPool) < nWrong || new Set(wrongPool.map((v) => fx[v].comp)).size < 2) continue;
      if (!rightPool.some((v) => fx[v].hops >= 2) || !rightPool.some((v) => fx[v].lvl !== F.hr)) continue;
      if (wrongPool.filter((v) => fx[v].pic).length < HARD.minTempting) continue;
      if (want.sameWrong && !wrongPool.some((v) => fx[v].lvl === F.hr)) continue;
      if (!T) { T = terrainOk(terr); if (!T) break; }
      for (let tries = 0; tries < 12; tries++) {
        const cnt = new Map();
        const take = (list, v) => {
          const key = fx[v].region, ak = `a${fx[v].comp}`;
          if (list.includes(v) || (cnt.get(key) || 0) >= HARD.perRegion || (!fx[v].reach && (cnt.get(ak) || 0) >= HARD.perArea)) return false;
          cnt.set(key, (cnt.get(key) || 0) + 1); cnt.set(ak, (cnt.get(ak) || 0) + 1); list.push(v); return true;
        };
        const right = [];
        take(right, rng.pick(rightPool.filter((v) => fx[v].hops >= 2)));
        for (const v of rng.shuffle(rightPool)) { if (right.length >= want.k) break; take(right, v); }
        if (right.length !== want.k) continue;
        const wrong = [];
        const nPic = rng.int(HARD.minTempting, Math.min(nWrong, HARD.minTempting + 2));
        for (const v of rng.shuffle(nearPool.filter((u) => fx[u].pic))) { if (wrong.length >= nPic) break; take(wrong, v); }
        if (want.sameWrong && !wrong.some((v) => fx[v].lvl === F.hr)) {
          for (const v of rng.shuffle(nearPool.filter((u) => fx[u].lvl === F.hr))) if (take(wrong, v)) break;
        }
        if (new Set(wrong.map((v) => fx[v].comp)).size < 2) {
          const other = (u) => !wrong.some((w) => fx[w].comp === fx[u].comp);
          let ok = false;
          for (const v of rng.shuffle(nearPool.filter(other))) if (take(wrong, v)) { ok = true; break; }
          if (!ok) for (const v of rng.shuffle(wrongPool.filter(other))) if (take(wrong, v)) break;
        }
        for (const v of rng.shuffle(nearPool)) { if (wrong.length >= nWrong) break; take(wrong, v); }
        for (const v of rng.shuffle(wrongPool)) { if (wrong.length >= nWrong) break; take(wrong, v); }
        if (wrong.length !== nWrong || new Set(wrong.map((v) => fx[v].comp)).size < 2) continue;
        if (want.sameWrong && !wrong.some((v) => fx[v].lvl === F.hr)) continue;
        const order = rng.shuffle([...right, ...wrong]);
        const answer = right.map((v) => order.indexOf(v)).sort((a, b) => a - b);
        const r = { ...terr, runner: { i: run % N, j: Math.floor(run / N) }, gems: order.map(toGem), answer };
        if (placementOk(r, T)) return r;
      }
    }
  }
  return FALLBACK_ROUND();
}

function FALLBACK_ROUND() {
  return JSON.parse(FALLBACK_JSON);
}
const FALLBACK_JSON = '{"H":[2,2,2,1,0,0,0,1,1,1,1,0,0,0,1,2,1,1,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,0,0,0,1,2,2,2],"stairs":[{"i":3,"j":6,"ux":0,"uy":-1},{"i":4,"j":2,"ux":-1,"uy":0},{"i":4,"j":0,"ux":-1,"uy":0},{"i":2,"j":1,"ux":0,"uy":-1}],"bridges":[{"i":1,"j":3,"ax":"y"}],"runner":{"i":5,"j":2},"gems":[{"kind":"cell","i":2,"j":0},{"kind":"cell","i":4,"j":5},{"kind":"cell","i":3,"j":3},{"kind":"cell","i":2,"j":5},{"kind":"deck","i":1,"j":3},{"kind":"cell","i":1,"j":6},{"kind":"cell","i":0,"j":0},{"kind":"cell","i":2,"j":3}],"answer":[0,2,6,7]}';

export function gate(m) {
  if (m && m.ext !== undefined && (!['train', 'test'].includes(m.ext) || !Array.isArray(m.rounds) || !m.rounds.every((r) => r && (r.view === undefined || viewOk(r.view))) || keySplit(semanticKey(m)) !== m.ext)) return false;
  if (m && m.ext === undefined && Array.isArray(m.rounds) && m.rounds.some((r) => r && r.view !== undefined)) return false;
  if (!m || m.task !== 'reachable_gem_pick' || m.N !== N || m.roundCount !== HARD.rounds || m.gemCount !== HARD.gems) return false;
  if (!Array.isArray(m.rounds) || m.rounds.length !== HARD.rounds) return false;
  if (!m.rounds.every((r) => roundOk(r))) return false;
  const s = reachableGemPick.init(m);
  for (const a of reachableGemPick.oracle(m)) reachableGemPick.applyAction(s, a, m);
  return reachableGemPick.verify(s, m).success === true;
}

const reachableGemPick = {
  meta: {
    name: 'reachable_gem_pick', family: 'C', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', gem: '0..7 (each click toggles one gem; exact set of reachable gems at Verify)' }],
    promptHuman: 'Click every gem the runner can walk to.',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) {
      for (let t = 0; t < 200; t++) {
        const view = pickView(rng), r = makeRound(rng, view);
        const m = { task: 'reachable_gem_pick', board: BOARD, N, gemCount: HARD.gems, roundCount: HARD.rounds, rounds: [r], ext: knobs.ext };
        if (r.view && keySplit(semanticKey(m)) === knobs.ext) return m;
      }
      throw new Error('reachable_gem_pick: ext generator exhausted');
    }
    const rounds = [];
    for (let k = 0; k < HARD.rounds; k++) rounds.push(makeRound(rng));
    return { task: 'reachable_gem_pick', board: BOARD, N, gemCount: HARD.gems, roundCount: HARD.rounds, rounds };
  },

  init() { return { picks: [] }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'toggle' || !Number.isInteger(action.gem)) return { ok: false, reason: 'bad-op' };
    if (action.gem < 0 || action.gem >= m.gemCount) return { ok: false, reason: 'bad-gem' };
    const k = state.picks.indexOf(action.gem);
    if (k >= 0) state.picks.splice(k, 1); else state.picks.push(action.gem);
    return { ok: true };
  },

  verify(state, m) {
    const ans = m.rounds[0].answer, picks = [...state.picks].sort((a, b) => a - b);
    const answered = picks.length > 0;
    const hit = picks.filter((p) => ans.includes(p)).length;
    const success = answered && picks.length === ans.length && hit === ans.length;
    return { success, error: success ? 0 : 1, partial: ans.length ? hit / Math.max(ans.length, picks.length) : 0,
      detail: { answered, correct: success, picked: picks.length, reachable: ans.length, hits: hit } };
  },

  oracle(m) { return m.rounds[0].answer.map((gem) => ({ op: 'toggle', gem })); },

  randomPolicy(m, rnd) {
    const p = m.rounds[0].answer.length / m.gemCount, acts = [];
    for (let k = 0; k < m.gemCount; k++) if (rnd() < p) acts.push({ op: 'toggle', gem: k });
    return acts;
  },

  async mount(env) { if (env && env.style) env.assets.iso = await mountIsoLook(env); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Click every gem the runner can walk to', 'Only stairs and bridges change level; no climbing, dropping or jumping');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const r = m.rounds[0];
    const { ord } = prepared(r), shadows = shadowsOf(r);
    const picked = new Set(state.picks || []);
    if (env.style && env.assets?.iso) {
      const PICK = 'picked';
      const ord2 = ord.map((it) => (it.role === 'gem' && picked.has(it.gem) ? { ...it, gem: PICK } : it));
      g.save(); g.translate(br.x, br.y);
      drawIsoStyled(g, br, r, ord2, (it) => shadows.get(it), PICK, env.assets.iso, { VIEW: viewOf(r), polyPath, drawBoxFaces, fillShadows, ck });
      g.restore(); return;
    }
    const V = viewOf(r);
    g.save(); g.translate(br.x, br.y);
    const sky = g.createLinearGradient(0, 0, 0, br.h);
    sky.addColorStop(0, '#f3f6f9'); sky.addColorStop(1, '#e5ebf0');
    g.fillStyle = sky; g.fillRect(0, 0, br.w, br.h);

    const GRASS = '#a8d38a', DIRT = '#c9a577', STONE = '#ece2cc', WOOD = '#c28b52';
    const COL = {
      ground: { top: GRASS, left: shade(DIRT, 0.92), right: shade(DIRT, 0.72), edge: null },
      step: { top: STONE, left: shade(STONE, 0.82), right: shade(STONE, 0.64), edge: null, topEdge: shade(STONE, 0.9) },
      deck: { top: WOOD, left: shade(WOOD, 0.8), right: shade(WOOD, 0.62), edge: null },
      rail: { top: shade(WOOD, 0.85), left: shade(WOOD, 0.7), right: shade(WOOD, 0.55), edge: null },
    };
    for (const it of ord) {
      if (it.role === 'runner') {
        const p = V.p((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0);
        drawRunner(g, p.x, p.y, 1); continue;
      }
      if (it.role === 'gem') {
        const p = V.p((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0);
        drawGem(g, p.x, p.y, 1, picked.has(it.gem)); continue;
      }
      const top = drawBoxFaces(g, V, it, COL[it.role]);
      if (it.role === 'ground') {
        const lip = (a, b, c, d) => { polyPath(g, [a, b, c, d]); g.fillStyle = shade(GRASS, 0.8); g.fill(); };
        const z1 = it.z1, z2 = it.z1 - 0.1;
        lip(V.p(it.x1, it.y0, z1), V.p(it.x1, it.y1, z1), V.p(it.x1, it.y1, z2), V.p(it.x1, it.y0, z2));
        lip(V.p(it.x0, it.y1, z1), V.p(it.x1, it.y1, z1), V.p(it.x1, it.y1, z2), V.p(it.x0, it.y1, z2));
        fillShadows(g, V, top, shadows.get(it) || [], it.z1, 0, shade(GRASS, 0.78), 0.9);
        polyPath(g, top); g.strokeStyle = 'rgba(60,90,40,.16)'; g.lineWidth = 1; g.stroke();
        const i = it.x0, j = it.y0, h = r.H[ck(i, j)];
        g.strokeStyle = 'rgba(52,70,30,.55)'; g.lineWidth = 1.6;
        if (i > 0 && r.H[ck(i - 1, j)] < h) { const a = V.p(i, j, it.z1), b = V.p(i, j + 1, it.z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        if (j > 0 && r.H[ck(i, j - 1)] < h) { const a = V.p(i, j, it.z1), b = V.p(i + 1, j, it.z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down' || env.submitted) return [];
    const r = env.manifest.rounds[0];
    let best = -1, bd = 17;
    r.gems.forEach((_, k) => { const c = gemCenter(r, k); const d = Math.hypot(evt.x - c.x, evt.y - c.y); if (d < bd) { bd = d; best = k; } });
    return best >= 0 ? [{ op: 'toggle', gem: best }] : [];
  },

  footerStatus(env) {
    const n = (env.state.picks || []).length;
    return n ? `${n} gem${n > 1 ? 's' : ''} selected` : 'Click every reachable gem';
  },
};

export const __test = { walkGraph, pictureGraph, flatRegions, nodeFacts, sceneBoxes, VIEW, roundOk, terrainOk, placementOk, FALLBACK_ROUND, prepared, gemCenter, spotOf };
export default reachableGemPick;
