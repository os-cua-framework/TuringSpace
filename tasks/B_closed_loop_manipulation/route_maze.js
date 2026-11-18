import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { splitIds } from '../core/style.js';
import {
  makeIso, isoSteps, paintOrder, pickAt, topVisibleFrac, pointCoveredAfter,
  shade, drawBoxFaces, shadowOnPlane, fillShadows, drawRunner, drawFlag,
} from '../common/_route_maze_iso.js';

const BOARD = { w: 340, h: 324 };
const HARD = Object.freeze({
  N: 8,
  tiles: [30, 38],
  maxStairs: 5,
  minPath: 12,
  maxClicks: 8,
  minGap: 5,
  minCross: 2,
  visTarget: 0.55,
  visAny: 0.45,
  routeCross: true,
});
const CLICK_SLACK = 4;
const EXT_HARD = Object.freeze({ N: 6, tiles: [16, 21], maxStairs: 3, minPath: 7, maxClicks: 5, minGap: 3, minCross: 1, visTarget: 0.55, visAny: 0.45 });
const N = HARD.N;
const LH = 1.3;
const SLAB = 0.18;
const DECK_T = 0.22;
const M = 0.16;
const PW = 0.1;
const STEPS = 4;
const BASE_T = 0.28;
const LIGHT = { x: -0.32, y: -0.86 };

const VIEW = extView(N, N, 50, Math.round(LH * 10));
const SPR0 = VIEW.DX / 24;
const REF_VIEW = (() => {
  const st = isoSteps(24, 50);
  return makeIso({ ox: BOARD.w / 2, oy: 66, DX: st.DX, DY: st.DY, DZ: st.DZ });
})();

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function bfs3(tiles, adj, a) {
  const dist = new Array(tiles.length).fill(-1), par = new Array(tiles.length).fill(-1);
  dist[a] = 0; const q = [a];
  for (let h = 0; h < q.length; h++) for (const e of adj[q[h]]) if (dist[e.to] < 0) { dist[e.to] = dist[q[h]] + 1; par[e.to] = q[h]; q.push(e.to); }
  return { dist, par };
}

const turnTiles = (tiles, path) => {
  const out = [];
  for (let k = 1; k < path.length; k++) {
    const last = k === path.length - 1;
    if (last) { out.push(path[k]); break; }
    const p = tiles[path[k - 1]], c = tiles[path[k]], n = tiles[path[k + 1]];
    if ((c.i - p.i) !== (n.i - c.i) || (c.j - p.j) !== (n.j - c.j)) out.push(path[k]);
  }
  return out;
};

const W = { straight: 3, turn: 1.2, stair: 2.4, cross: 6, recent: 3 };
const isSprite = (it) => it.role === 'runner' || it.role === 'flag';

function makeGeo(P) {
  const { NX, NY, view: VIEW, hard: HARD, lh: LH, inset: M, pw: PW, steps: STEPS } = P;
  const inb = (i, j) => i >= 0 && i < NX && j >= 0 && j < NY;
  const ckey = (i, j) => j * NX + i;

  function columns(tiles) {
    const col = new Map();
    tiles.forEach((t, id) => { const k = ckey(t.i, t.j); col.set(k, [...(col.get(k) || []), id]); });
    return col;
  }

  function walkGraph(tiles) {
    const col = columns(tiles);
    const at = (i, j) => (inb(i, j) && col.get(ckey(i, j))) || [];
    const adj = tiles.map(() => []);
    tiles.forEach((t, id) => {
      if (t.kind === 'flat') {
        for (const [dx, dy] of DIRS) for (const o of at(t.i + dx, t.j + dy)) {
          const u = tiles[o];
          if (u.kind === 'flat' && u.l === t.l) adj[id].push({ to: o, dx, dy });
          if (u.kind === 'stair' && ((t.l === 0 && dx === u.ux && dy === u.uy) || (t.l === 1 && dx === -u.ux && dy === -u.uy))) adj[id].push({ to: o, dx, dy });
        }
      } else {
        const lo = at(t.i - t.ux, t.j - t.uy).find((o) => tiles[o].kind === 'flat' && tiles[o].l === 0);
        const hi = at(t.i + t.ux, t.j + t.uy).find((o) => tiles[o].kind === 'flat' && tiles[o].l === 1);
        if (lo !== undefined) adj[id].push({ to: lo, dx: -t.ux, dy: -t.uy });
        if (hi !== undefined) adj[id].push({ to: hi, dx: t.ux, dy: t.uy });
      }
    });
    const crossing = new Set();
    for (const [k, v] of col) if (v.length > 1) crossing.add(k);
    return { adj, at, col, crossing };
  }

  function straightRun(tiles, adj, a, b) {
    const A = tiles[a], B = tiles[b];
    if (a === b || (A.i !== B.i && A.j !== B.j) || (A.i === B.i && A.j === B.j)) return null;
    const dx = Math.sign(B.i - A.i), dy = Math.sign(B.j - A.j);
    const seq = [];
    let cur = a;
    for (let guard = 0; guard < 2 * Math.max(NX, NY); guard++) {
      const e = adj[cur].find((x) => x.dx === dx && x.dy === dy);
      if (!e) return null;
      cur = e.to; seq.push(cur);
      const T = tiles[cur];
      if (T.i === B.i && T.j === B.j) return cur === b ? seq : null;
    }
    return null;
  }

  function projDist(tiles, from) {
    const occ = new Set(tiles.map((t) => ckey(t.i, t.j)));
    const s = ckey(tiles[from].i, tiles[from].j);
    const dist = new Map([[s, 0]]), par = new Map([[s, -1]]);
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % NX, j = (k - i) / NX;
      for (const [dx, dy] of DIRS) {
        const a = i + dx, b = j + dy, kk = ckey(a, b);
        if (inb(a, b) && occ.has(kk) && !dist.has(kk)) { dist.set(kk, dist.get(k) + 1); par.set(kk, k); q.push(kk); }
      }
    }
    return { dist, par };
  }

  function grow(rng, target, W) {
    const tiles = [], col = new Map(), comp = [], dirOf = [];
    const at = (i, j) => (inb(i, j) && col.get(ckey(i, j))) || [];
    const flatAt = (i, j, l) => at(i, j).find((t) => tiles[t].kind === 'flat' && tiles[t].l === l);
    const stairAt = (i, j) => at(i, j).find((t) => tiles[t].kind === 'stair');
    const add = (t, c, d) => { tiles.push(t); comp.push(c); dirOf.push(d); const k = ckey(t.i, t.j); col.set(k, [...at(t.i, t.j), tiles.length - 1]); return tiles.length - 1; };
    const pop = () => {
      const t = tiles.pop(); comp.pop(); dirOf.pop();
      const k = ckey(t.i, t.j), arr = col.get(k).slice(0, -1);
      if (arr.length) col.set(k, arr); else col.delete(k);
    };
    const stairs = () => tiles.filter((t) => t.kind === 'stair');
    const besideStair = (i, j) => stairs().some((t) => {
      const px = t.uy !== 0 ? 1 : 0, py = t.ux !== 0 ? 1 : 0;
      return (i === t.i + px && j === t.j + py) || (i === t.i - px && j === t.j - py);
    });
    const stairEndAt = (i, j) => stairs().some((t) => (i === t.i - t.ux && j === t.j - t.uy) || (i === t.i + t.ux && j === t.j + t.uy));
    const links = (i, j, l) => {
      const out = [];
      for (const [dx, dy] of DIRS) {
        const a = i + dx, b = j + dy;
        if (!inb(a, b)) continue;
        const f = flatAt(a, b, l); if (f !== undefined) out.push(f);
        const st = stairAt(a, b);
        if (st !== undefined) {
          const t = tiles[st];
          if (l === 0 && a - t.ux === i && b - t.uy === j) out.push(st);
          if (l === 1 && a + t.ux === i && b + t.uy === j) out.push(st);
        }
      }
      return out;
    };
    const isCrossing = (id) => at(tiles[id].i, tiles[id].j).length > 1;
    const straightAxis = (id) => {
      const t = tiles[id];
      const has = DIRS.map(([dx, dy]) => { const a = t.i + dx, b = t.j + dy; return inb(a, b) && flatAt(a, b, t.l) !== undefined; });
      if (has[0] && has[2] && !has[1] && !has[3]) return 'x';
      if (has[1] && has[3] && !has[0] && !has[2]) return 'y';
      return null;
    };
    const freeCell = (i, j) => inb(i, j) && !at(i, j).length && !besideStair(i, j) && !stairEndAt(i, j);

    const movesFrom = (base, joinTo) => {
      const bt = tiles[base], out = [];
      for (const d of DIRS) {
        const [dx, dy] = d, ni = bt.i + dx, nj = bt.j + dy;
        const up = bt.l === 0 && (dx < 0 || dy < 0), down = bt.l === 1 && (dx > 0 || dy > 0);
        if ((up || down) && stairs().length < HARD.maxStairs) {
          const ei = bt.i + 2 * dx, ej = bt.j + 2 * dy;
          const ux = up ? dx : -dx, uy = up ? dy : -dy;
          const px = uy !== 0 ? 1 : 0, py = ux !== 0 ? 1 : 0, el = 1 - bt.l;
          const sideFree = [[ni + px, nj + py], [ni - px, nj - py]].every(([a, b]) => !inb(a, b) || !at(a, b).length);
          if (freeCell(ni, nj) && freeCell(ei, ej) && sideFree && links(ni, nj, bt.l).every((x) => x === base) && !besideStair(ei, ej)) {
            const L = links(ei, ej, el);
            if (!L.length) out.push({ type: 'stair', d, ux, uy, el, join: false });
            else if (L.length === 1 && comp[L[0]] === joinTo) out.push({ type: 'stair', d, ux, uy, el, join: true });
          }
        }
        if (!inb(ni, nj)) continue;
        const here = at(ni, nj);
        if (here.length === 1 && tiles[here[0]].kind === 'flat' && tiles[here[0]].l !== bt.l) {
          const fi = ni + dx, fj = nj + dy, L = links(ni, nj, bt.l);
          if (straightAxis(here[0]) === (dx !== 0 ? 'y' : 'x') && !besideStair(ni, nj) && !stairEndAt(ni, nj) &&
              L.length === 1 && L[0] === base && freeCell(fi, fj) && links(fi, fj, bt.l).length === 0) out.push({ type: 'cross', d });
          continue;
        }
        if (!freeCell(ni, nj)) continue;
        const L = links(ni, nj, bt.l).filter((x) => x !== base);
        if (!links(ni, nj, bt.l).includes(base)) continue;
        if (!L.length) out.push({ type: 'flat', d, join: false });
        else if (L.length === 1 && comp[L[0]] === joinTo) out.push({ type: 'flat', d, join: true });
      }
      return out;
    };
    const apply = (base, mv) => {
      const bt = tiles[base], [dx, dy] = mv.d, c = comp[base];
      if (mv.type === 'flat') return [add({ kind: 'flat', i: bt.i + dx, j: bt.j + dy, l: bt.l }, c, mv.d)];
      if (mv.type === 'stair') {
        return [add({ kind: 'stair', i: bt.i + dx, j: bt.j + dy, l: 0, ux: mv.ux, uy: mv.uy }, c, mv.d),
          add({ kind: 'flat', i: bt.i + 2 * dx, j: bt.j + 2 * dy, l: mv.el }, c, mv.d)];
      }
      return [add({ kind: 'flat', i: bt.i + dx, j: bt.j + dy, l: bt.l }, c, mv.d),
        add({ kind: 'flat', i: bt.i + 2 * dx, j: bt.j + 2 * dy, l: bt.l }, c, mv.d)];
    };

    const ci = rng.int(1, NX - 2), cj = rng.int(1, NY - 2);
    const lowX = rng.raw() < 0.5;
    const P = lowX ? [1, 0] : [0, 1], Q = lowX ? [0, 1] : [1, 0];
    for (const [L, [dx, dy]] of [[0, P], [1, Q]]) for (const k of [-1, 0, 1]) add({ kind: 'flat', i: ci + k * dx, j: cj + k * dy, l: L }, L, [dx, dy]);

    let budget = 900;
    const dfs = (base, joinTo, depth) => {
      if (depth > 7 || budget-- <= 0) return false;
      for (const mv of rng.shuffle(movesFrom(base, joinTo))) {
        if (mv.type === 'cross') continue;
        const added = apply(base, mv);
        if (mv.join) return true;
        if (dfs(added[added.length - 1], joinTo, depth + 1)) return true;
        for (let k = 0; k < added.length; k++) pop();
      }
      return false;
    };
    const from = rng.raw() < 0.5 ? 0 : 1;
    const ends = rng.shuffle(from === 0 ? [0, 2] : [3, 5]);
    let joined = false;
    for (const e of ends) { if (dfs(e, 1 - from, 0)) { joined = true; break; } }
    if (!joined) return [];
    for (let k = 0; k < comp.length; k++) comp[k] = 0;

    let last = tiles.length - 1;
    for (let guard = 0; tiles.length < target && guard < 200; guard++) {
      const moves = [];
      tiles.forEach((bt, base) => {
        if (bt.kind !== 'flat' || isCrossing(base)) return;
        const pd = dirOf[base], rec = base === last ? W.recent : 1;
        for (const mv of movesFrom(base, -1)) {
          const straight = pd && pd[0] === mv.d[0] && pd[1] === mv.d[1];
          const w = mv.type === 'stair' ? W.stair : mv.type === 'cross' ? W.cross : straight ? W.straight : W.turn;
          moves.push({ ...mv, base, w: w * rec });
        }
      });
      if (!moves.length) break;
      let r = rng.raw() * moves.reduce((sum, mv) => sum + mv.w, 0), mv = moves[moves.length - 1];
      for (const cand of moves) { r -= cand.w; if (r <= 0) { mv = cand; break; } }
      const added = apply(mv.base, mv);
      last = added[added.length - 1];
    }
    return tiles;
  }

  function tileTop(t) { return t.kind === 'stair' ? (SLAB + LH) / 2 : t.l ? LH : SLAB; }
  function sceneBoxes(m) {
    const { tiles } = m;
    const { adj, crossing } = walkGraph(tiles);
    const out = [{ x0: 0, x1: NX, y0: 0, y1: NY, z0: -BASE_T, z1: 0, role: 'water', noPick: true }];
    tiles.forEach((t, id) => {
      const { i, j } = t;
      if (t.kind === 'stair') {
        for (let k = 0; k < STEPS; k++) {
          const top = SLAB + (LH - SLAB) * (k + 1) / STEPS;
          const a = (k + 1) / STEPS, b = k / STEPS;
          const box = t.ux ? { x0: i + 1 - a, x1: i + 1 - b, y0: j + M, y1: j + 1 - M }
            : { x0: i + M, x1: i + 1 - M, y0: j + 1 - a, y1: j + 1 - b };
          out.push({ ...box, z0: 0, z1: top, role: 'step', tile: id });
        }
        return;
      }
      const z1 = t.l ? LH : SLAB, z0 = t.l ? LH - DECK_T : 0, role = t.l ? 'deck' : 'slab';
      out.push({ x0: i + M, x1: i + 1 - M, y0: j + M, y1: j + 1 - M, z0, z1, role, tile: id, center: true });
      for (const e of adj[id]) {
        const [dx, dy] = [e.dx, e.dy];
        const arm = dx === 1 ? { x0: i + 1 - M, x1: i + 1, y0: j + M, y1: j + 1 - M }
          : dx === -1 ? { x0: i, x1: i + M, y0: j + M, y1: j + 1 - M }
            : dy === 1 ? { x0: i + M, x1: i + 1 - M, y0: j + 1 - M, y1: j + 1 }
              : { x0: i + M, x1: i + 1 - M, y0: j, y1: j + M };
        out.push({ ...arm, z0, z1, role, tile: id });
      }
      if (t.l === 1 && !crossing.has(ckey(i, j))) {
        out.push({ x0: i + 0.5 - PW, x1: i + 0.5 + PW, y0: j + 0.5 - PW, y1: j + 0.5 + PW, z0: 0, z1: LH - DECK_T, role: 'pillar', tile: id });
      }
    });
    const sprite = (id, role, h) => {
      const t = tiles[id], z = tileTop(t);
      out.push({ x0: t.i + 0.36, x1: t.i + 0.64, y0: t.j + 0.36, y1: t.j + 0.64, z0: z, z1: z + h, role, tile: id });
    };
    sprite(m.start, 'runner', 1.15);
    sprite(m.goal, 'flag', 1.1);
    return out;
  }

  const orderCache = new WeakMap();
  function ordered(m) {
    let o = orderCache.get(m);
    if (!o) { o = paintOrder(VIEW, sceneBoxes(m)); orderCache.set(m, o); }
    return o;
  }

  const tileCenter = (m, id) => {
    const t = m.tiles[id];
    return VIEW.p(t.i + 0.5, t.j + 0.5, tileTop(t));
  };

  function analyse(m) {
    const { tiles } = m;
    const g = walkGraph(tiles);
    const { dist, par } = bfs3(tiles, g.adj, m.start);
    if (dist[m.goal] < 0) return null;
    const path = [];
    for (let p = m.goal; p >= 0; p = par[p]) { path.push(p); if (p === m.start) break; }
    path.reverse();
    const clicks = turnTiles(tiles, path);
    const pd = projDist(tiles, m.start);
    const gT = tiles[m.goal];
    const proj = pd.dist.get(ckey(gT.i, gT.j));
    let viaCrossing = false;
    for (let k = ckey(gT.i, gT.j); k >= 0; k = pd.par.get(k)) if (g.crossing.has(k)) viaCrossing = true;
    const onCrossing = path.some((p) => g.crossing.has(ckey(tiles[p].i, tiles[p].j)));
    return { g, path, clicks, walk: dist[m.goal], proj, viaCrossing, onCrossing, stairs: path.filter((p) => tiles[p].kind === 'stair').length };
  }

  function structuralOk(tiles) {
    if (!Array.isArray(tiles) || tiles.length < HARD.tiles[0] || tiles.length > HARD.tiles[1] + 1) return false;
    for (const t of tiles) {
      if (!t || !Number.isInteger(t.i) || !Number.isInteger(t.j) || !inb(t.i, t.j)) return false;
      if (t.kind === 'flat' && t.l !== 0 && t.l !== 1) return false;
      if (t.kind === 'stair' && !((t.ux === -1 && t.uy === 0) || (t.ux === 0 && t.uy === -1))) return false;
      if (t.kind !== 'flat' && t.kind !== 'stair') return false;
    }
    const g = walkGraph(tiles);
    for (const ids of g.col.values()) {
      if (ids.length === 1) continue;
      if (ids.length !== 2) return false;
      const [a, b] = ids.map((id) => tiles[id]);
      if (a.kind !== 'flat' || b.kind !== 'flat' || a.l === b.l) return false;
      const ax = ids.map((id) => {
        const e = g.adj[id];
        if (e.length !== 2) return null;
        if (e.every((x) => x.dy === 0) && e[0].dx === -e[1].dx) return 'x';
        if (e.every((x) => x.dx === 0) && e[0].dy === -e[1].dy) return 'y';
        return null;
      });
      if (!ax[0] || !ax[1] || ax[0] === ax[1]) return false;
    }
    for (const [id, t] of tiles.entries()) {
      if (t.kind !== 'stair') continue;
      if (g.adj[id].length !== 2) return false;
      const px = t.uy !== 0 ? 1 : 0, py = t.ux !== 0 ? 1 : 0;
      for (const [a, b] of [[t.i + px, t.j + py], [t.i - px, t.j - py]]) if (inb(a, b) && g.at(a, b).length) return false;
      for (const [a, b] of [[t.i - t.ux, t.j - t.uy], [t.i + t.ux, t.j + t.uy]]) if (g.at(a, b).length !== 1) return false;
    }
    const edges = g.adj.reduce((s, e) => s + e.length, 0) / 2;
    if (edges !== tiles.length - 1) return false;
    const seen = bfs3(tiles, g.adj, 0).dist.filter((d) => d >= 0).length;
    return seen === tiles.length;
  }

  function visibilityOk(m, info) {
    const ord = ordered(m);
    const need = new Set([m.start, m.goal, ...info.clicks]);
    for (let k = 0; k < ord.length; k++) {
      const it = ord[k];
      if (!it.center) continue;
      const f = topVisibleFrac(VIEW, ord, k, 6, isSprite);
      if (f < HARD.visAny) return false;
      if (!need.has(it.tile)) continue;
      if (f < HARD.visTarget) return false;
      const c = tileCenter(m, it.tile);
      if (pointCoveredAfter(ord, k, c.x, c.y, (o) => isSprite(o) && o.tile === it.tile)) return false;
    }
    for (let k = 0; k < ord.length; k++) {
      const it = ord[k];
      if (!isSprite(it)) continue;
      const cx = (it.x0 + it.x1) / 2, cy = (it.y0 + it.y1) / 2;
      for (const z of [it.z0 + 0.25, it.z0 + 0.6, it.z1 - 0.1]) {
        const s = VIEW.p(cx, cy, z);
        if (pointCoveredAfter(ord, k, s.x, s.y, isSprite)) return false;
      }
    }
    for (const it of ord) for (const q of it.hull) if (q.x < 4 || q.x > BOARD.w - 4 || q.y < 4 || q.y > BOARD.h - 4) return false;
    return true;
  }

  function instanceInfo(m) {
    if (!structuralOk(m.tiles)) return null;
    const T = m.tiles;
    if (!Number.isInteger(m.start) || !Number.isInteger(m.goal) || m.start === m.goal) return null;
    const S = T[m.start], G = T[m.goal];
    if (!S || !G || S.kind !== 'flat' || G.kind !== 'flat') return null;
    const info = analyse(m);
    if (!info) return null;
    if (info.g.crossing.has(ckey(S.i, S.j)) || info.g.crossing.has(ckey(G.i, G.j))) return null;
    if (info.g.crossing.size < HARD.minCross) return null;
    if (info.walk < HARD.minPath || info.clicks.length > HARD.maxClicks) return null;
    if (info.walk - info.proj < HARD.minGap) return null;
    if (info.stairs < 1) return null;
    if (!info.onCrossing && !info.viaCrossing) return null;
    if (HARD.routeCross && !info.onCrossing) return null;
    return info;
  }

  function instanceOk(m) {
    const info = instanceInfo(m);
    if (!info) return null;
    if (!visibilityOk(m, info)) return null;
    return info;
  }

  function explain(m) {
    if (!structuralOk(m.tiles)) return 'struct';
    const T = m.tiles, S = T[m.start], G = T[m.goal];
    if (S.kind !== 'flat' || G.kind !== 'flat') return 'kind';
    const info = analyse(m);
    if (!info) return 'unreach';
    if (info.g.crossing.has(ckey(S.i, S.j)) || info.g.crossing.has(ckey(G.i, G.j))) return 'endOnCross';
    if (info.walk < HARD.minPath) return 'short';
    if (info.clicks.length > HARD.maxClicks) return 'clicks';
    if (info.walk - info.proj < HARD.minGap) return 'gap';
    if (info.stairs < 1) return 'nostair';
    if (!info.onCrossing && !info.viaCrossing) return 'crossIrrelevant';
    if (HARD.routeCross && !info.onCrossing) return 'routeNoCross';
    if (!visibilityOk(m, info)) return 'vis';
    return 'ok';
  }

  return {
    NX, NY, VIEW, HARD, LH, ckey, walkGraph, straightRun, projDist, grow, tileTop, sceneBoxes, ordered, tileCenter,
    analyse, structuralOk, visibilityOk, instanceInfo, instanceOk, explain,
  };
}

const DEF = makeGeo({ NX: N, NY: N, view: VIEW, hard: HARD, lh: LH, inset: M, pw: PW, steps: STEPS });

const EXT_GRIDS = ['5x6', '6x5', '6x6', '5x7', '7x5', '6x7', '7x6', '5x8', '8x5', '4x8', '8x4', '4x9', '9x4'];
const EXT_GRID_SPLIT = splitIds('route_maze|grid', EXT_GRIDS, 2);
const EXT_EL = [46, 54];
const EXT_LH = [12, 14];
const EXT_INSET = [12, 20];
const EXT_STEPS = [3, 5];
const extHard = () => EXT_HARD;
const extW = (rng) => Object.fromEntries(Object.entries(W).map(([k, v]) => [k, v * rng.uniform(0.7, 1.3)]));

function extView(NX, NY, el, lh) {
  const zTop = lh / 10 + 1.2, S = NX + NY, r = el * Math.PI / 180;
  const DX = Math.min(27, 300 / S, 304 / (S * Math.sin(r) + (BASE_T + zTop) * Math.SQRT2 * Math.cos(r)));
  const st = isoSteps(DX, el);
  const h = S * st.DY + (BASE_T + zTop) * st.DZ;
  return makeIso({ ox: BOARD.w / 2 - (NX - NY) * st.DX / 2, oy: (BOARD.h - h) / 2 + zTop * st.DZ, DX: st.DX, DY: st.DY, DZ: st.DZ });
}
function targetOk(geo) {
  const V = extView(geo.NX, geo.NY, geo.el, geo.lh), w = 1 - 2 * geo.inset / 100, w0 = 1 - 2 * M;
  return V.DX * w >= REF_VIEW.DX * w0 - 1e-9 && V.DY * w >= REF_VIEW.DY * w0 - 1e-9;
}

const inRange = (v, [a, b]) => Number.isInteger(v) && v >= a && v <= b;
function extGeoOk(geo) {
  return !!geo && EXT_GRIDS.includes(`${geo.NX}x${geo.NY}`) && inRange(geo.el, EXT_EL) && inRange(geo.lh, EXT_LH)
    && inRange(geo.inset, EXT_INSET) && inRange(geo.steps, EXT_STEPS) && targetOk(geo);
}

const extGeoCache = new Map();
function extGeo(geo) {
  const key = `${geo.NX}|${geo.NY}|${geo.el}|${geo.lh}|${geo.inset}|${geo.steps}`;
  let G = extGeoCache.get(key);
  if (!G) {
    if (extGeoCache.size > 64) extGeoCache.clear();
    G = makeGeo({ NX: geo.NX, NY: geo.NY, view: extView(geo.NX, geo.NY, geo.el, geo.lh), hard: extHard(geo.NX, geo.NY),
      lh: geo.lh / 10, inset: geo.inset / 100, pw: 0.06 + geo.inset / 400, steps: geo.steps });
    extGeoCache.set(key, G);
  }
  return G;
}

const geoOf = (m) => (m && m.ext ? extGeo(m.geo) : DEF);

function generateExt(rng, split) {
  const grids = EXT_GRIDS.filter((g) => EXT_GRID_SPLIT(g) === split);
  for (let round = 0; round < 60; round++) {
    const [NX, NY] = rng.pick(grids).split('x').map(Number);
    let geo = null;
    for (let t = 0; t < 40 && !geo; t++) {
      const g = { NX, NY, el: rng.int(...EXT_EL), lh: rng.int(...EXT_LH), inset: rng.int(...EXT_INSET), steps: rng.int(...EXT_STEPS) };
      if (targetOk(g)) geo = g;
    }
    if (!geo) continue;
    const G = extGeo(geo);
    const Wx = extW(rng);
    for (let attempt = 0; attempt < 30; attempt++) {
      const tiles = G.grow(rng, rng.int(G.HARD.tiles[0], G.HARD.tiles[1]), Wx);
      if (tiles.length < G.HARD.tiles[0]) continue;
      const g = G.walkGraph(tiles);
      if (g.crossing.size < 1) continue;
      const pairs = [];
      tiles.forEach((a, ia) => {
        if (a.kind !== 'flat' || g.crossing.has(G.ckey(a.i, a.j))) return;
        tiles.forEach((b, ib) => {
          if (ib === ia || b.kind !== 'flat' || g.crossing.has(G.ckey(b.i, b.j))) return;
          pairs.push([ia, ib]);
        });
      });
      for (const [a, b] of rng.shuffle(pairs).slice(0, 60)) {
        const m = { task: 'route_maze', board: BOARD, ext: 1, geo, tiles, start: a, goal: b };
        const info = G.instanceOk(m);
        if (!info) continue;
        const perm = rng.shuffle(tiles.map((_, k) => k));
        const inv = []; perm.forEach((old, k) => { inv[old] = k; });
        const out = {
          task: 'route_maze', board: BOARD, ext: 1, geo, tiles: perm.map((old) => ({ ...tiles[old] })), start: inv[a], goal: inv[b],
          solution: info.path.map((old) => inv[old]),
        };
        if (gateExt(out)) return out;
        break;
      }
    }
  }
  throw new Error('route_maze: no extended maze found');
}

function gateExt(m) {
  if (!m || m.task !== 'route_maze' || m.ext !== 1 || !extGeoOk(m.geo) || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  const G = extGeo(m.geo);
  const info = G.instanceOk(m);
  if (!info) return false;
  if (JSON.stringify(info.path) !== JSON.stringify(m.solution)) return false;
  const s = routeMaze.init(m);
  for (const a of routeMaze.oracle(m)) routeMaze.applyAction(s, a, m);
  return routeMaze.verify(s, m).success === true && routeMaze.oracle(m).length <= G.HARD.maxClicks;
}

export function semanticKey(m) {
  let best = null;
  for (const sw of [false, true]) {
    const I = (t) => (sw ? t.j : t.i), J = (t) => (sw ? t.i : t.j);
    const mi = Math.min(...m.tiles.map(I)), mj = Math.min(...m.tiles.map(J));
    const tok = (t) => `${I(t) - mi},${J(t) - mj},${t.kind === 'stair' ? 's' + (sw ? t.uy : t.ux) + (sw ? t.ux : t.uy) : 'f' + t.l}`;
    const key = m.tiles.map(tok).sort().join(';') + `|S${tok(m.tiles[m.start])}|G${tok(m.tiles[m.goal])}`;
    if (best === null || key < best) best = key;
  }
  return 'route_maze|' + best;
}

const spriteScale = (V) => Math.max(0.8, Math.min(1.1, V.DX / REF_VIEW.DX, V.DZ / REF_VIEW.DZ));

export const walkGraph = DEF.walkGraph;
export const straightRun = DEF.straightRun;
export const projDist = DEF.projDist;
export const sceneBoxes = DEF.sceneBoxes;
export const tileCenter = (m, id) => geoOf(m).tileCenter(m, id);

const FALLBACK = (() => {
  const raw = [[1, 0, 1], [6, 1, 1], [1, 6, 0], [2, 1, 's', -1, 0], [4, 1, 0], [3, 1, 0], [5, 1, 0], [7, 3, 0], [5, 0, 1], [4, 4, 's', 0, -1],
    [3, 3, 1], [1, 4, 0], [1, 1, 1], [6, 1, 0], [4, 3, 1], [4, 1, 1], [6, 3, 0], [6, 5, 0], [1, 2, 's', 0, -1], [4, 2, 1], [1, 3, 0],
    [4, 6, 0], [6, 2, 1], [3, 0, 1], [1, 5, 0], [7, 1, 0], [7, 2, 0], [3, 6, 's', -1, 0], [4, 5, 0], [2, 6, 1], [0, 1, 1], [2, 5, 0],
    [7, 0, 0], [4, 0, 1], [5, 3, 's', -1, 0], [6, 0, 1], [6, 4, 0]];
  const tiles = raw.map(([i, j, l, ux, uy]) => (l === 's' ? { kind: 'stair', i, j, l: 0, ux, uy } : { kind: 'flat', i, j, l }));
  return { tiles, start: 21, goal: 20 };
})();

const clickBudget = (m) => (m && !m.ext && Array.isArray(m.solution) ? turnTiles(m.tiles, m.solution).length + CLICK_SLACK : null);

export function gate(m) {
  if (m && m.ext) return gateExt(m);
  if (!m || m.task !== 'route_maze' || m.N !== N) return false;
  const info = DEF.instanceOk(m);
  if (!info) return false;
  if (JSON.stringify(info.path) !== JSON.stringify(m.solution)) return false;
  const task = routeMaze;
  const s = task.init(m);
  for (const a of task.oracle(m)) if (task.applyAction(s, a, m).ok === false) return false;
  return task.verify(s, m).success === true && task.oracle(m).length <= HARD.maxClicks
    && clickBudget(m) === info.clicks.length + CLICK_SLACK && s.clicks === info.clicks.length;
}

function drawSceneStyled(g, br, m, state, ord, sk, G) {
  const sky = g.createLinearGradient(0, 0, 0, br.h);
  sky.addColorStop(0, sk.sky[0]); sky.addColorStop(1, sk.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, br.w, br.h);

  const VIEW = G.VIEW, NX = G.NX, NY = G.NY;
  const spr = G === DEF ? SPR0 : spriteScale(VIEW);
  const casters = ord.filter((it) => it.role === 'deck' || it.role === 'step' || it.role === 'pillar');
  const shadowsOn = (zr) => casters.filter((c) => c.z1 > zr + 0.05).map((c) => shadowOnPlane(c, zr, sk.light.x, sk.light.y));
  const onPath = new Map();
  state.path.forEach((id, k) => { if (!onPath.has(id)) onPath.set(id, k); });
  const W = sk.walk, P = VIEW.p;
  for (const it of ord) {
    if (it.role === 'runner' || it.role === 'flag') {
      const p = P((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0);
      if (it.role === 'runner') drawRunner(g, p.x, p.y, spr); else drawFlag(g, p.x, p.y, spr);
      continue;
    }
    if (it.role === 'water') {
      const paintGround = (cg) => {
        const top = drawBoxFaces(cg, VIEW, it, { top: sk.groundFill(cg, VIEW, 0), left: sk.ground.left, right: sk.ground.right, edge: sk.ground.edge });
        cg.save();
        cg.strokeStyle = sk.grid.color; cg.lineWidth = sk.grid.width;
        if (sk.grid.dash) cg.setLineDash(sk.grid.dash);
        for (let k = 1; k < Math.max(NX, NY); k++) {
          let a, b;
          if (k < NX) { a = P(k, 0, 0); b = P(k, NY, 0); cg.beginPath(); cg.moveTo(a.x, a.y); cg.lineTo(b.x, b.y); cg.stroke(); }
          if (k < NY) { a = P(0, k, 0); b = P(NX, k, 0); cg.beginPath(); cg.moveTo(a.x, a.y); cg.lineTo(b.x, b.y); cg.stroke(); }
        }
        cg.restore();
        sk.drawDeco(cg, VIEW, top);
        fillShadows(cg, VIEW, top, shadowsOn(0), 0, sk.shadowAlpha);
      };
      const T = g.getTransform();
      if (T.b || T.c || !(T.a > 0 && T.d > 0) || !Number.isInteger(T.e) || !Number.isInteger(T.f) || typeof document === 'undefined') { paintGround(g); continue; }
      const key = `${T.a},${T.d},${br.w},${br.h}`;
      let layer = sk.groundCache.get(m);
      if (!layer || layer.key !== key) {
        const c = document.createElement('canvas');
        c.width = Math.ceil(br.w * T.a); c.height = Math.ceil(br.h * T.d);
        const cg = c.getContext('2d'); cg.setTransform(T.a, 0, 0, T.d, 0, 0);
        paintGround(cg);
        layer = { key, c }; sk.groundCache.set(m, layer);
      }
      g.save(); g.setTransform(1, 0, 0, 1, T.e, T.f); g.drawImage(layer.c, 0, 0); g.restore();
      continue;
    }
    if (it.role === 'pillar') { drawBoxFaces(g, VIEW, it, sk.pillar); continue; }
    const c = { top: sk.topFill(g, VIEW, it.z1), left: W.left, right: W.right, edge: null };
    if (it.role === 'step') c.topEdge = W.stepEdge;
    const top = drawBoxFaces(g, VIEW, it, c);
    if (W.rim && it.role !== 'step') {
      const a = P(it.x0, it.y1, it.z1), b = P(it.x1, it.y1, it.z1), d = P(it.x1, it.y0, it.z1);
      g.beginPath(); g.moveTo(a.x, a.y + 1); g.lineTo(b.x, b.y + 1); g.lineTo(d.x, d.y + 1);
      g.strokeStyle = W.rim; g.lineWidth = 1.1; g.lineJoin = 'round'; g.stroke();
    }
    if (it.role === 'slab') fillShadows(g, VIEW, top, shadowsOn(SLAB), SLAB, 0, sk.shadowFill(g, VIEW, SLAB), 0.9);
    if (it.center && onPath.has(it.tile) && it.tile !== m.start) {
      const cc = G.tileCenter(m, it.tile);
      g.beginPath(); g.ellipse(cc.x, cc.y, 9, 9 * VIEW.DY / VIEW.DX, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(25,145,250,.28)'; g.fill();
    }
  }
}

const routeMaze = {
  meta: {
    name: 'route_maze', family: 'B', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'step', tile: 'walkway tile index (click the tile at each turn, then the flag); an earlier point undoes back to it; oracle points + 4 clicks in all, undo clicks included' }],
    promptHuman: 'Click each turn on the way to the flag',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext);
    for (let attempt = 0; attempt < 400; attempt++) {
      const tiles = DEF.grow(rng, rng.int(HARD.tiles[0], HARD.tiles[1]), W);
      if (tiles.length < HARD.tiles[0]) continue;
      const g = DEF.walkGraph(tiles);
      if (g.crossing.size < 1) continue;
      const pairs = [];
      tiles.forEach((a, ia) => {
        if (a.kind !== 'flat' || g.crossing.has(DEF.ckey(a.i, a.j))) return;
        tiles.forEach((b, ib) => {
          if (ib === ia || b.kind !== 'flat' || g.crossing.has(DEF.ckey(b.i, b.j))) return;
          pairs.push([ia, ib]);
        });
      });
      for (const [a, b] of rng.shuffle(pairs).slice(0, 60)) {
        const m = { task: 'route_maze', board: BOARD, N, tiles, start: a, goal: b };
        const info = DEF.instanceOk(m);
        if (!info) continue;
        const perm = rng.shuffle(tiles.map((_, k) => k));
        const inv = []; perm.forEach((old, k) => { inv[old] = k; });
        return {
          ...m, tiles: perm.map((old) => ({ ...tiles[old] })), start: inv[a], goal: inv[b],
          solution: info.path.map((old) => inv[old]),
        };
      }
    }
    const m = { task: 'route_maze', board: BOARD, N, tiles: FALLBACK.tiles.map((t) => ({ ...t })), start: FALLBACK.start, goal: FALLBACK.goal };
    return { ...m, solution: DEF.analyse(m).path };
  },

  init(m) { return m && m.ext ? { path: [m.start] } : { path: [m.start], clicks: 0 }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'step' || !Number.isInteger(action.tile)) return { ok: false, reason: 'bad-op' };
    if (action.tile < 0 || action.tile >= m.tiles.length) return { ok: false, reason: 'bad-tile' };
    const budget = clickBudget(m);
    if (budget !== null && (state.clicks || 0) >= budget) return { ok: false, reason: 'no-clicks-left' };
    const at = state.path.indexOf(action.tile);
    if (at >= 0) {
      const cut = state.path.slice(0, at > 0 && at === state.path.length - 1 ? at : at + 1);
      if (cut.length === state.path.length) return { ok: true, undo: true };
      state.path = cut;
      if (budget !== null) state.clicks = (state.clicks || 0) + 1;
      return { ok: true, undo: true };
    }
    if (state.path.length >= 16) return { ok: false, reason: 'too-long' };
    if (budget === null) {
      const last = m.tiles[state.path[state.path.length - 1]], t = m.tiles[action.tile];
      if (t.i !== last.i && t.j !== last.j) return { ok: false, reason: 'not-straight' };
    }
    state.path.push(action.tile);
    if (budget !== null) state.clicks = (state.clicks || 0) + 1;
    return { ok: true };
  },

  verify(state, m) {
    const G = geoOf(m);
    const { adj } = G.walkGraph(m.tiles);
    let legal = 0;
    const segs = state.path.length - 1;
    for (let k = 1; k < state.path.length; k++) if (G.straightRun(m.tiles, adj, state.path[k - 1], state.path[k])) legal++;
    const atGoal = state.path[state.path.length - 1] === m.goal;
    const budget = clickBudget(m), inBudget = budget === null || (state.clicks || 0) <= budget;
    const success = segs > 0 && legal === segs && atGoal && inBudget;
    return {
      success, error: success ? 0 : 1,
      partial: success ? 1 : (segs ? Math.min(0.99, legal / (segs + (atGoal ? 0 : 1))) : 0),
      detail: { waypoints: segs, legalSegments: legal, atGoal, ...(budget !== null ? { clicks: state.clicks || 0, budget } : {}) },
    };
  },

  oracle(m) { return turnTiles(m.tiles, m.solution).map((tile) => ({ op: 'step', tile })); },

  randomPolicy(m, rnd) {
    const acts = [], K = Math.min(m.ext ? EXT_HARD.maxClicks : HARD.maxClicks, clickBudget(m) ?? Infinity);
    let cur = m.tiles[m.start];
    for (let k = 0; k < K; k++) {
      const G = m.tiles[m.goal];
      if ((G.i === cur.i || G.j === cur.j) && (k === K - 1 || rnd() < 0.5)) { acts.push({ op: 'step', tile: m.goal }); break; }
      const line = m.tiles.map((t, id) => id).filter((id) => id !== m.start && (m.tiles[id].i === cur.i || m.tiles[id].j === cur.j));
      if (!line.length) break;
      const id = line[Math.floor(rnd() * line.length)];
      acts.push({ op: 'step', tile: id });
      cur = m.tiles[id];
    }
    return acts;
  },

  async mount(env) {
    if (!env || !env.style) return;
    const { chooseIsoLook, buildIsoSkin } = await import('../common/_iso_themes.js');
    const G = geoOf(env.manifest);
    env.assets.isoSkin = await buildIsoSkin(chooseIsoLook(env.style, Math.max(G.NX, G.NY)));
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Click each turn on the way to the flag', 'Last click on the flag. Click a dot to undo.');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const G = geoOf(m);
    const ord = G.ordered(m);
    g.save(); g.translate(br.x, br.y);
    const skin = env.style ? env.assets?.isoSkin : null;
    if (skin) drawSceneStyled(g, br, m, state, ord, skin, G);
    else {
    const VIEW = G.VIEW, NX = G.NX, NY = G.NY;
    const spr = G === DEF ? SPR0 : spriteScale(VIEW);
    const sky = g.createLinearGradient(0, 0, 0, br.h);
    sky.addColorStop(0, '#f4f7fa'); sky.addColorStop(1, '#e6ecf1');
    g.fillStyle = sky; g.fillRect(0, 0, br.w, br.h);

    const casters = ord.filter((it) => it.role === 'deck' || it.role === 'step' || it.role === 'pillar');
    const shadowsOn = (zr) => casters.filter((c) => c.z1 > zr + 0.05).map((c) => shadowOnPlane(c, zr, LIGHT.x, LIGHT.y));
    const onPath = new Map();
    state.path.forEach((id, k) => { if (!onPath.has(id)) onPath.set(id, k); });

    const STONE = '#f1e7d0';
    const stone = { top: STONE, left: shade(STONE, 0.8), right: shade(STONE, 0.6), edge: null };
    const COL = {
      water: { top: '#a9d2e4', left: '#86b6cc', right: '#6f9fb8', edge: 'rgba(40,80,100,.35)' },
      slab: stone, deck: stone,
      step: { ...stone, topEdge: shade(STONE, 0.86) },
      pillar: { top: '#cbb994', left: shade('#cbb994', 0.84), right: shade('#cbb994', 0.64), edge: 'rgba(70,55,35,.4)' },
    };
    for (const it of ord) {
      if (it.role === 'runner' || it.role === 'flag') {
        const p = VIEW.p((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.z0);
        if (it.role === 'runner') drawRunner(g, p.x, p.y, spr); else drawFlag(g, p.x, p.y, spr);
        continue;
      }
      const top = drawBoxFaces(g, VIEW, it, COL[it.role]);
      if (it.role === 'water') {
        g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
        for (let k = 1; k < Math.max(NX, NY); k++) {
          let a, b;
          if (k < NX) { a = VIEW.p(k, 0, 0); b = VIEW.p(k, NY, 0); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
          if (k < NY) { a = VIEW.p(0, k, 0); b = VIEW.p(NX, k, 0); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        }
        fillShadows(g, VIEW, top, shadowsOn(0), 0, 0.24);
      }
      if (it.role === 'slab') fillShadows(g, VIEW, top, shadowsOn(SLAB), SLAB, 0, shade(STONE, 0.74), 0.9);
      if (it.center && onPath.has(it.tile) && it.tile !== m.start) {
        const c = G.tileCenter(m, it.tile);
        g.beginPath(); g.ellipse(c.x, c.y, 9, 9 * VIEW.DY / VIEW.DX, 0, 0, Math.PI * 2);
        g.fillStyle = 'rgba(25,145,250,.28)'; g.fill();
      }
    }
    }

    if (state.path.length > 1) {
      const pts = state.path.map((id) => G.tileCenter(m, id));
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6.5; g.stroke();
      g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.strokeStyle = ACCENT; g.lineWidth = 3.2; g.stroke();
      pts.slice(1).forEach((p, k) => {
        g.beginPath(); g.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        g.fillStyle = '#fff'; g.fill(); g.strokeStyle = ACCENT; g.lineWidth = 2.4; g.stroke();
        g.fillStyle = ACCENT; g.font = `700 9.5px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(k + 1), p.x, p.y + 0.5);
      });
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const hit = pickAt(geoOf(env.manifest).ordered(env.manifest), evt.x, evt.y, (it) => Number.isInteger(it.tile));
    return hit ? [{ op: 'step', tile: hit.tile }] : [];
  },

  footerStatus(env) {
    const { state, manifest: m } = env;
    const n = state.path.length - 1;
    const budget = clickBudget(m), left = budget === null ? '' : ` · Clicks left: ${Math.max(0, budget - (state.clicks || 0))}`;
    if (!n) return 'Click the first turn' + left;
    if (state.path[n] === m.goal) return `${n} point${n > 1 ? 's' : ''} · ends on the flag` + left;
    return `${n} point${n > 1 ? 's' : ''}` + left;
  },
};

export default routeMaze;
export const __test = {
  grow: (rng, target) => DEF.grow(rng, target, W), sceneBoxes, VIEW, walkGraph, structuralOk: DEF.structuralOk, explain: DEF.explain,
  FALLBACK, analyse: DEF.analyse, extGeo, generateExt, gateExt,
};
