import { drawPromptText, UI_FONT } from '../core/panel.js';
import { mountFlatLook, drawFlatStyled } from '../common/_reachable_gem_pick_flat_look.js';
import { hash32 } from '../core/style.js';

const BOARD = { w: 440, h: 352 };
const COLS = 13, ROWS = 10, CELL = 30;
const OX = Math.round((BOARD.w - COLS * CELL) / 2);
const OY = Math.round((BOARD.h - ROWS * CELL) / 2);
const NCELL = COLS * ROWS;
const ROUNDS = 1;
const GEMS = 7;
const REGIONS = 7;
const MIN_PATH = 12;
const MIN_REGION = 10, REGION_SPREAD = 9;
const MIN_TOUCH = 4;
const SPRITE = CELL / 34;

const Nw = 1, Ew = 2, Sw = 4, Ww = 8;
const STEPS = [
  { bit: Nw, opp: Sw, dc: 0, dr: -1 },
  { bit: Ew, opp: Ww, dc: 1, dr: 0 },
  { bit: Sw, opp: Nw, dc: 0, dr: 1 },
  { bit: Ww, opp: Ew, dc: -1, dr: 0 },
];
const idx = (c, r) => r * COLS + c;
const colOf = (i) => i % COLS;
const rowOf = (i) => Math.floor(i / COLS);
const center = (i) => ({ x: OX + (colOf(i) + 0.5) * CELL, y: OY + (rowOf(i) + 0.5) * CELL });
const pdist = (a, b) => { const A = center(a), B = center(b); return Math.hypot(A.x - B.x, A.y - B.y); };

function neighbours(i, walls) {
  const c = colOf(i), r = rowOf(i), out = [];
  for (const d of STEPS) {
    if (walls[i] & d.bit) continue;
    const nc = c + d.dc, nr = r + d.dr;
    if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) out.push(idx(nc, nr));
  }
  return out;
}

function bfs(from, walls) {
  const dist = new Array(NCELL).fill(-1), parent = new Array(NCELL).fill(-1);
  dist[from] = 0; const q = [from];
  for (let h = 0; h < q.length; h++) {
    for (const j of neighbours(q[h], walls)) if (dist[j] < 0) { dist[j] = dist[q[h]] + 1; parent[j] = q[h]; q.push(j); }
  }
  return { dist, parent };
}

function carve(rng) {
  const walls = new Array(NCELL).fill(Nw | Ew | Sw | Ww);
  const region = new Array(NCELL).fill(-1);
  const seeds = rng.sample([...Array(NCELL).keys()], REGIONS);
  const stacks = seeds.map((s) => [s]);
  seeds.forEach((s, r) => { region[s] = r; });
  const openNbrs = (i) => {
    const c = colOf(i), r = rowOf(i), o = [];
    for (const d of STEPS) {
      const nc = c + d.dc, nr = r + d.dr;
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) o.push({ j: idx(nc, nr), d });
    }
    return o;
  };
  for (let guard = 0; guard < 100000; guard++) {
    let advanced = false;
    for (let r = 0; r < REGIONS; r++) {
      const st = stacks[r];
      if (!st.length) continue;
      const cur = st[st.length - 1];
      const opts = rng.shuffle(openNbrs(cur)).filter((o) => region[o.j] === -1);
      if (!opts.length) { st.pop(); continue; }
      const { j, d } = opts[0];
      walls[cur] &= ~d.bit; walls[j] &= ~d.opp;
      region[j] = r; st.push(j); advanced = true;
    }
    if (!advanced && stacks.every((s) => !s.length)) break;
  }
  return { walls, region };
}

function fallbackRound(which) {
  const walls = new Array(NCELL).fill(Nw | Ew | Sw | Ww);
  const bandRows = [0, 1, 3, 4, 6, 7, 9];
  const openRow = (r) => { for (let c = 0; c < COLS - 1; c++) { walls[idx(c, r)] &= ~Ew; walls[idx(c + 1, r)] &= ~Ww; } };
  bandRows.forEach(openRow);
  const avBand = which === 0 ? 2 : 3;
  const avatar = idx(0, bandRows[avBand]);
  const gems = bandRows.map((r, k) => ({ cell: idx(k === avBand ? COLS - 1 : 3 + (k % 3) * 3, r) }));
  const reach = bandRows.map((_, k) => k === avBand);
  return { walls, avatar, gems, answer: avBand, reach };
}

function makeRound(rng, which) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const { walls, region } = carve(rng);
    const comps = Array.from({ length: REGIONS }, () => []);
    for (let i = 0; i < NCELL; i++) if (region[i] >= 0) comps[region[i]].push(i);
    if (comps.some((c) => c.length < MIN_REGION)) continue;
    const sizes = comps.map((c) => c.length);
    if (Math.max(...sizes) - Math.min(...sizes) > REGION_SPREAD) continue;

    for (const avRegion of rng.shuffle([...Array(REGIONS).keys()])) {
      const comp = comps[avRegion], inRun = new Set(comp);
      const touches = (i) => STEPS.some((d) => {
        const nc = colOf(i) + d.dc, nr = rowOf(i) + d.dr;
        return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && inRun.has(idx(nc, nr));
      });
      const others = [...Array(REGIONS).keys()].filter((i) => i !== avRegion);
      if (others.filter((i) => comps[i].some(touches)).length < MIN_TOUCH) continue;
      const pools = others.map((i) => {
        const t = comps[i].filter(touches);
        if (t.length) return t;
        const dmin = (a) => Math.min(...comp.map((b) => pdist(a, b)));
        return comps[i].slice().sort((a, b) => dmin(a) - dmin(b)).slice(0, 2);
      });
      let found = null;
      for (let t = 0; t < 30 && !found; t++) {
        const avatar = rng.pick(comp);
        const { dist } = bfs(avatar, walls);
        const cand = comp.filter((n) => dist[n] >= MIN_PATH);
        if (!cand.length) continue;
        const answerCell = rng.pick(cand);
        const distractors = pools.map((p) => rng.pick(p));
        const cells = [answerCell, ...distractors];
        let crowded = cells.some((c) => pdist(c, avatar) < CELL * 1.1);
        for (let a = 0; a < cells.length && !crowded; a++)
          for (let b = a + 1; b < cells.length; b++)
            if (pdist(cells[a], cells[b]) < CELL * 1.3) { crowded = true; break; }
        if (crowded) continue;
        const dA = pdist(answerCell, avatar), ds = distractors.map((c) => pdist(c, avatar));
        if (ds.every((d) => d > dA) || ds.every((d) => d < dA)) continue;
        found = { avatar, answerCell, distractors };
      }
      if (!found) continue;
      const { avatar, answerCell, distractors } = found;

      const built = [{ cell: answerCell, reachable: true }, ...distractors.map((cell) => ({ cell, reachable: false }))];
      const orderIdx = rng.shuffle(built.map((_, i) => i));
      const gems = orderIdx.map((i) => ({ cell: built[i].cell }));
      const reach = orderIdx.map((i) => built[i].reachable);
      const answer = reach.findIndex(Boolean);
      return { walls, avatar, gems, answer, reach };
    }
  }
  return fallbackRound(which);
}

export function semanticKey(m) {
  const r = m.rounds[0];
  return `gemflat|${r.walls.join(',')}|${r.avatar}|` + r.gems.map((g, k) => `${g.cell}${k === r.answer ? '*' : ''}`).sort().join(';');
}
const keySplit = (k) => (hash32(`gemflat_key|${k}`) % 10 === 0 ? 'test' : 'train');
const geomOf = (m) => (m && m.ext ? { CELL: m.cell, OX: m.ox, OY: m.oy } : { CELL, OX, OY });
const centerIn = (G) => (i) => ({ x: G.OX + (colOf(i) + 0.5) * G.CELL, y: G.OY + (rowOf(i) + 0.5) * G.CELL });

export default {
  meta: {
    name: 'reachable_gem_pick_flat', family: 'C', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'select', gem: '0..6' }],
    promptHuman: 'Click the gem the runner can reach',
  },

  generate(rng, level, index, knobs = {}) {
    if (knobs && knobs.ext) {
      let round = makeRound(rng, 0);
      for (let t = 0; t < 200 && keySplit(semanticKey({ rounds: [round] })) !== knobs.ext; t++) round = makeRound(rng, 0);
      const cell = CELL;
      return {
        task: 'reachable_gem_pick_flat', board: BOARD, cols: COLS, rows: ROWS, cell, ox: rng.int(4, BOARD.w - COLS * cell - 4), oy: rng.int(6, BOARD.h - ROWS * cell - 6),
        gemCount: GEMS, roundCount: 1, rounds: [round], ext: knobs.ext,
      };
    }
    return {
      task: 'reachable_gem_pick_flat', board: BOARD, cols: COLS, rows: ROWS, cell: CELL, ox: OX, oy: OY,
      gemCount: GEMS, roundCount: 1,
      rounds: [makeRound(rng, 0)],
    };
  },

  init() { return { round: 0, picks: [-1], done: false }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'select' || !Number.isInteger(action.gem)) return { ok: false, reason: 'bad-op' };
    if (state.round >= manifest.roundCount) return { ok: false, reason: 'done' };
    const round = manifest.rounds[state.round];
    if (action.gem < 0 || action.gem >= round.gems.length) return { ok: false, reason: 'bad-gem' };
    state.picks[state.round] = action.gem;
    return { ok: true, round: state.round, done: state.done };
  },

  verify(state, manifest) {
    const good = manifest.rounds.map((r, i) => state.picks[i] === r.answer);
    const answered = state.picks.every((p) => p >= 0);
    const success = answered && good.every(Boolean);
    return {
      success,
      partial: good.filter(Boolean).length / manifest.roundCount,
      error: success ? 0 : 1,
      detail: { answered, correct: good },
    };
  },

  randomPolicy(m, rnd) { return m.rounds.map((r) => ({ op: 'select', gem: Math.floor(rnd() * r.gems.length) })); },

  oracle(manifest) {
    return manifest.rounds.map((r) => ({ op: 'select', gem: r.answer }));
  },

  async mount(env) { if (env && env.style) env.assets.flat = await mountFlatLook(env); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Click the gem the runner can reach', 'Follow the open paths');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    const round = m.rounds[0];
    const picked = state.picks[0];
    if (env.style && env.assets?.flat) {
      const G = geomOf(m);
      g.save(); g.translate(br.x, br.y); g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
      drawFlatStyled(g, br, round, picked, env.assets.flat, { ...G, COLS, ROWS, center: centerIn(G) });
      g.restore(); return;
    }

    g.save(); g.translate(br.x, br.y);
    g.beginPath(); g.rect(0, 0, br.w, br.h); g.clip();
    g.fillStyle = '#141d2e'; g.fillRect(0, 0, br.w, br.h);

    const GAP = 5;
    g.fillStyle = '#e9f0fa';
    for (let i = 0; i < NCELL; i++) {
      if ((round.walls[i] & (Nw | Ew | Sw | Ww)) === (Nw | Ew | Sw | Ww)) continue;
      const c = colOf(i), r = rowOf(i), x = OX + c * CELL, y = OY + r * CELL;
      roundRect(g, x + GAP, y + GAP, CELL - 2 * GAP, CELL - 2 * GAP, 3); g.fill();
      if (!(round.walls[i] & Ew) && c < COLS - 1) g.fillRect(x + CELL - GAP - 1, y + GAP, 2 * GAP + 2, CELL - 2 * GAP);
      if (!(round.walls[i] & Sw) && r < ROWS - 1) g.fillRect(x + GAP, y + CELL - GAP - 1, CELL - 2 * GAP, 2 * GAP + 2);
    }

    round.gems.forEach((gm, i) => {
      const p = center(gm.cell);
      drawGem(g, p.x, p.y, picked === i);
    });

    const rp = center(round.avatar);
    drawRunner(g, rp.x, rp.y);

    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const { state, manifest: m } = env;
    if (state.round >= m.roundCount) return [];
    const round = m.rounds[state.round];
    const G = geomOf(m), at = m.ext ? centerIn(G) : center;
    let best = -1, bd = G.CELL * 0.85;
    round.gems.forEach((gm, i) => { const p = at(gm.cell); const d = Math.hypot(evt.x - p.x, evt.y - p.y); if (d < bd) { bd = d; best = i; } });
    return best >= 0 ? [{ op: 'select', gem: best }] : [];
  },

  footerStatus(env) {
    const { state } = env;
    if (state.picks[0] >= 0) return '1 gem selected';
    return 'Pick a gem';
  },
};

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function drawGem(g, x, y, picked) {
  const w = 9 * SPRITE, h = 12 * SPRITE;
  if (picked) { g.beginPath(); g.arc(x, y, 16 * SPRITE, 0, Math.PI * 2); g.fillStyle = 'rgba(52,211,153,.20)'; g.fill(); }
  g.beginPath();
  g.moveTo(x, y - h); g.lineTo(x + w, y - 2); g.lineTo(x, y + h); g.lineTo(x - w, y - 2); g.closePath();
  g.fillStyle = '#34d399'; g.fill();
  g.strokeStyle = '#0b7a5b'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w, y - 2); g.lineTo(x, y - 2); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.45)'; g.fill();
  g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w, y - 2); g.lineTo(x, y - 2); g.closePath();
  g.fillStyle = 'rgba(6,95,70,.30)'; g.fill();
}

function drawRunner(g, x0, y0) {
  g.save(); g.translate(x0, y0); g.scale(SPRITE, SPRITE);
  drawRunnerAt(g, 0, 0);
  g.restore();
}
function drawRunnerAt(g, x, y) {
  g.beginPath(); g.ellipse(x, y + 11, 9, 3.2, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
  g.beginPath();
  g.moveTo(x - 7, y + 9); g.quadraticCurveTo(x - 8, y - 2, x, y - 3);
  g.quadraticCurveTo(x + 8, y - 2, x + 7, y + 9); g.closePath();
  g.fillStyle = '#f0883e'; g.fill(); g.strokeStyle = '#8a4413'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(x, y - 8, 5.4, 0, Math.PI * 2);
  g.fillStyle = '#ffd9b3'; g.fill(); g.strokeStyle = '#8a4413'; g.lineWidth = 1.4; g.stroke();
}
