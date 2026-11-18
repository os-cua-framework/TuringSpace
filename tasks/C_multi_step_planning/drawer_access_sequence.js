import { drawPromptText, rr } from '../core/panel.js';
import { pickScene } from '../common/_real_scene_common.js';
import { PALETTES, deltaE76, MIN_DE, noteLook, paintDesk, paintNote } from '../common/_drawer_access_notes.js';
import { splitIds } from '../core/style.js';

const BOARD = { w: 340, h: 280 };
const VIEW = { s: 0.94, cx: 156, cy: 104, bx: 170, by: 140 };
const toLayout = (x, y) => ({ x: VIEW.cx + (x - VIEW.bx) / VIEW.s, y: VIEW.cy + (y - VIEW.by) / VIEW.s });
const HARD = Object.freeze({
  cols: 4, rows: 4, cardW: 76, cardH: 50,
  ovX: [14, 20], ovY: [10, 15],
  gapP: 0.35, gap: [5, 7],
  jitter: 1, minOv: 8, minGap: 3,
  minReq: 5, maxReq: 9, attempts: 600,
});
const EXT = Object.freeze({ count: 9, minReq: 3, maxReq: 6 });
const COLORS = ['#b8c9a3', '#8fcfc4', '#d9c3a0', '#e2c4f2', '#f7d774', '#f2b5d4', '#a7c7e7', '#d6e5a5',
  '#a8d5ba', '#fbd3c0', '#b5e0dc', '#f4a7a0', '#e79fb3', '#9fb4ea', '#f6c28b', '#c9b6e4'];
function layoutClear(cards) {
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox >= HARD.minOv && oy >= HARD.minOv) continue;
    if (ox <= -HARD.minGap || oy <= -HARD.minGap) continue;
    return false;
  }
  return true;
}

function rectsOverlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 3 && oy > 3;
}

function overheadTrays(cards, presentSet, id) {
  const c = cards[id];
  const out = [];
  for (const o of cards) {
    if (o.id === id || !presentSet.has(o.id)) continue;
    if (o.z > c.z && rectsOverlap(c, o)) out.push(o.id);
  }
  return out;
}

function requiredFor(cards, id) {
  const all = new Set(cards.map((c) => c.id));
  const req = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const up of overheadTrays(cards, all, cur)) {
      if (!req.has(up)) { req.add(up); stack.push(up); }
    }
  }
  return req;
}

export function gate(m) {
  const S = m && m.ext ? EXT : { count: HARD.cols * HARD.rows, minReq: HARD.minReq, maxReq: HARD.maxReq };
  if (!m || m.task !== 'drawer_access_sequence' || !Array.isArray(m.cards) || m.cards.length !== S.count) return false;
  const cards = m.cards;
  if (!m.ext && !layoutClear(cards)) return false;
  if (new Set(cards.map((c) => c.z)).size !== cards.length) return false;
  for (const c of cards) {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    if (cards.some((o) => o.z > c.z && cx >= o.x - 6 && cx <= o.x + o.w + 6 && cy >= o.y - 6 && cy <= o.y + o.h + 6)) return false;
    if (c.x < 6 || c.y < 6 || c.x + c.w > 306 || c.y + c.h > 202) return false;
  }
  const req = [...requiredFor(cards, m.targetId)].sort((a, b) => a - b);
  if (JSON.stringify(req) !== JSON.stringify(m.requiredIds) || req.length < S.minReq || req.length > S.maxReq) return false;
  const all = new Set(cards.map((k) => k.id));
  const direct = overheadTrays(cards, all, m.targetId);
  if (!direct.some((d) => overheadTrays(cards, all, d).length > 0)) return false;
  const present = new Set(all);
  for (const id of m.order) { if (overheadTrays(cards, present, id).length) return false; present.delete(id); }
  return m.order.length === req.length && m.order[m.order.length - 1] === m.targetId;
}

const FAULT_SENT = new WeakSet();

export default {
  meta: {
    name: 'drawer_access_sequence', family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'extract', id: '0..15 (lift a note off; a note that is already off goes back to its place; trying to lift a note that has a note on it is a fault and fails the attempt)' }],
    promptHuman: 'Take out the note with the star. Lift off only the notes piled on it first. Trying to lift a covered note fails.',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs);
    const { cols, rows, cardW, cardH, jitter, minReq, maxReq, attempts } = HARD;

    const axis = (n, size, ov, lo, hi) => {
      const gapAt = rng.raw() < HARD.gapP ? rng.int(0, n - 2) : -1;
      const pos = [0];
      for (let k = 1; k < n; k++) pos.push(pos[k - 1] + size - (k - 1 === gapAt ? -rng.int(...HARD.gap) : rng.int(...ov)));
      const span = pos[n - 1] + size, o = rng.int(lo + jitter, Math.max(lo + jitter, hi - jitter - span));
      return pos.map((p) => p + o);
    };
    const layout = () => {
      const xs = axis(cols, cardW, HARD.ovX, 6, 306), ys = axis(rows, cardH, HARD.ovY, 6, 202);
      const cards = [];
      let id = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cards.push({
            id: id++,
            x: xs[c] + rng.int(-jitter, jitter),
            y: ys[r] + rng.int(-jitter, jitter),
            w: cardW, h: cardH,
            color: COLORS[r * cols + c],
          });
        }
      }
      return cards;
    };

    let chosen = null;
    for (let a = 0; a < attempts; a++) {
      const cards = layout();
      if (!layoutClear(cards) || cards.some((c) => c.x < 6 || c.y < 6 || c.x + c.w > 306 || c.y + c.h > 202)) continue;
      const zperm = rng.shuffle(cards.map((c) => c.id));
      cards.forEach((c) => { c.z = zperm[c.id]; });

      const candidates = [];
      for (const c of cards) {
        const req = requiredFor(cards, c.id);
        if (req.size < minReq || req.size > maxReq) continue;
        const direct = overheadTrays(cards, new Set(cards.map((k) => k.id)), c.id);
        const transitive = direct.some((d) => overheadTrays(cards, new Set(cards.map((k) => k.id)), d).length > 0);
        if (!transitive) continue;
        candidates.push({ id: c.id, req: [...req] });
      }
      if (candidates.length) {
        const pick = rng.pick(candidates);
        chosen = { cards, targetId: pick.id, requiredIds: pick.req };
        break;
      }
    }

    if (!chosen) throw new Error('drawer_access_sequence: no 4 x 4 pile with a 5..9-note chain');

    const { cards, targetId, requiredIds } = chosen;
    const order = requiredIds.slice().sort((i, j) => cards[j].z - cards[i].z);

    return {
      task: 'drawer_access_sequence', board: BOARD, sceneFile: pickScene(rng),
      cards: cards.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, color: c.color })),
      targetId, requiredIds: requiredIds.slice().sort((a, b) => a - b), order,
    };
  },

  init() { return { extracted: [], log: [], faults: 0 }; },

  applyAction(state, action, m) {
    if (!action || action.op !== 'extract' || !Number.isInteger(action.id) || action.id < 0 || action.id >= m.cards.length) {
      return { ok: false, reason: 'bad-op' };
    }
    const id = action.id;
    const present = new Set(m.cards.map((c) => c.id).filter((cid) => !state.extracted.includes(cid)));
    if (!present.has(id)) {
      if (overheadTrays(m.cards, present, id).length > 0) return { ok: false, reason: 'slot-covered' };
      state.extracted.splice(state.extracted.indexOf(id), 1);
      state.log.push(-1 - id);
      return { ok: true };
    }
    if (overheadTrays(m.cards, present, id).length > 0) {
      state.faults = (state.faults || 0) + 1;
      state.log.push(`x${id}`);
      return { ok: true, moved: false, fault: 'blocked-on-top' };
    }
    state.extracted.push(id);
    state.log.push(id);
    return { ok: true };
  },

  verify(state, m) {
    const got = new Set(state.extracted);
    const targetOut = got.has(m.targetId);
    const cleanSet = state.extracted.length === m.requiredIds.length && m.requiredIds.every((r) => got.has(r));
    const faults = state.faults || 0;
    const success = targetOut && cleanSet && faults === 0;
    return {
      success, error: success ? 0 : 1,
      partial: m.requiredIds.filter((r) => got.has(r)).length / m.requiredIds.length,
      detail: { extracted: state.log.slice(), targetOut, required: m.requiredIds.length, faults },
    };
  },

  oracle(m) { return m.order.map((id) => ({ op: 'extract', id })); },

  randomPolicy(m, rnd) {
    const n = 3 + Math.floor(rnd() * 5);
    return Array.from({ length: n }, () => ({ op: 'extract', id: Math.floor(rnd() * m.cards.length) }));
  },

  async mount(env) {
    if (env.manifest.ext && env.style) env.assets.look = await noteLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Take out the note with the star', 'Lift off only the notes piled on it first. Trying to lift a covered note fails.');
  },

  tick(env, dt, hooks) {
    const st = env && env.state;
    if (st && (st.faults || 0) > 0 && !env.submitted && !FAULT_SENT.has(env) && hooks && typeof hooks.submit === 'function') {
      FAULT_SENT.add(env); hooks.submit(); return true;
    }
    return false;
  },

  drawBoard(g, br, env) {
    if (env.manifest.ext && env.assets.look) { drawBoardExt(g, br, env); return; }
    const { state, manifest: m } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#ebe7df'; g.fillRect(0, 0, br.w, br.h);
    g.translate(VIEW.bx, VIEW.by); g.scale(VIEW.s, VIEW.s); g.translate(-VIEW.cx, -VIEW.cy);
    const out = new Set(state.extracted);
    for (const c of m.cards) {
      if (!out.has(c.id)) continue;
      rr(g, c.x, c.y, c.w, c.h, 3); g.fillStyle = 'rgba(80,70,50,.06)'; g.fill();
      g.setLineDash([5, 4]); g.strokeStyle = '#b3a993'; g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
    }
    for (const c of m.cards.filter((k) => !out.has(k.id)).sort((a, b) => a.z - b.z)) {
      g.save();
      g.shadowColor = 'rgba(40,30,10,.30)'; g.shadowBlur = 7; g.shadowOffsetX = 1.5; g.shadowOffsetY = 3;
      rr(g, c.x, c.y, c.w, c.h, 3); g.fillStyle = c.color; g.fill();
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(c.x + 1, c.y + 1, c.w - 2, 11);
      rr(g, c.x, c.y, c.w, c.h, 3); g.strokeStyle = 'rgba(60,50,30,.35)'; g.lineWidth = 1; g.stroke();
      if (c.id === m.targetId) drawStar(g, c.x + c.w / 2, c.y + c.h / 2 + 3, 13 * Math.min(1, c.h / 64));
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const { state, manifest: m } = env;
    const p = toLayout(evt.x, evt.y);
    const inside = (c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
    let hit = -1, bestZ = -Infinity;
    for (const c of m.cards) {
      if (state.extracted.includes(c.id)) continue;
      if (inside(c) && c.z > bestZ) { hit = c.id; bestZ = c.z; }
    }
    if (hit < 0) {
      for (const c of m.cards) {
        if (state.extracted.includes(c.id) && inside(c) && c.z > bestZ) { hit = c.id; bestZ = c.z; }
      }
    }
    return hit >= 0 ? [{ op: 'extract', id: hit }] : [];
  },

  footerStatus(env) {
    const n = env.state.extracted.length;
    return n ? `${n} lifted off · tap a gap to put one back` : 'Tap a note to lift it off';
  },
};

function drawStar(g, cx, cy, R) {
  g.save();
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? R * 0.45 : R, a = -Math.PI / 2 + (k * Math.PI) / 5;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#e8a317'; g.fill();
  g.strokeStyle = '#8a5a00'; g.lineWidth = 1.4; g.lineJoin = 'round'; g.stroke();
  g.restore();
}

const palettesOf = (split) => PALETTES.filter((p) => p.split === split);
const BOX = { x0: 7, y0: 7, x1: 305, y1: 201 };
function layoutExt(rng, kind) {
  const cards = [];
  const put = (x, y, w, h) => cards.push({ id: cards.length, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  const jit = rng.int(2, 7), J = () => rng.int(-jit, jit);
  if (kind === 'grid') {
    const w = rng.int(104, 114), h = rng.int(70, 78);
    const dx = rng.int(Math.round(w * 0.68), Math.round(w * 0.86)), dy = rng.int(Math.round(h * 0.68), Math.round(h * 0.86));
    const brick = rng.raw() < 0.5 ? Math.round(rng.uniform(0.15, 0.3) * dx) * (rng.raw() < 0.5 ? -1 : 1) : 0;
    const spanX = 2 * dx + w + Math.abs(brick), spanY = 2 * dy + h;
    const ox = rng.uniform(BOX.x0 + jit, BOX.x1 - jit - spanX) + Math.max(0, -brick), oy = rng.uniform(BOX.y0 + jit, BOX.y1 - jit - spanY);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) put(ox + c * dx + (r % 2) * brick + J(), oy + r * dy + J(), w, h);
  } else if (kind === 'pyramid') {
    const w = rng.int(104, 108), h = rng.int(70, 74), dx = rng.int(58, Math.floor((300 - 2 * jit - w) / 3)), dy = rng.int(42, 58);
    const up = rng.raw() < 0.5, span = 3 * dx + w;
    const ox = rng.uniform(BOX.x0 + jit, BOX.x1 - jit - span), oy = rng.uniform(BOX.y0 + jit, BOX.y1 - jit - (2 * dy + h));
    [4, 3, 2].forEach((cnt, r) => { for (let c = 0; c < cnt; c++) put(ox + c * dx + (r * dx) / 2 + J(), oy + (up ? 2 - r : r) * dy + J(), w, h); });
  } else if (kind === 'cascade') {
    const w = rng.int(104, 110), h = rng.int(70, 74), sx = rng.int(16, 26) * (rng.raw() < 0.5 ? -1 : 1), sy = rng.int(43, 50);
    const gap = rng.int(60, 70);
    const span = 2 * gap + 2 * Math.abs(sx) + w;
    const ox = rng.uniform(BOX.x0 + jit, BOX.x1 - jit - span) + (sx < 0 ? 2 * -sx : 0), oy = rng.uniform(BOX.y0 + jit, BOX.y1 - jit - (2 * sy + h));
    for (let s2 = 0; s2 < 3; s2++) for (let k = 0; k < 3; k++) put(ox + s2 * gap + k * sx + J(), oy + k * sy + J(), w, h);
  } else if (kind === 'ring') {
    const w = rng.int(104, 108), h = 70, rx = rng.uniform(0.9, 0.98) * w, ry = rng.uniform(60, 62), a0 = rng.uniform(0, Math.PI / 4);
    const cx = (BOX.x0 + BOX.x1) / 2 + rng.uniform(-8, 8), cy = (BOX.y0 + BOX.y1) / 2 + rng.uniform(-4, 4);
    const J2 = () => rng.int(-2, 2);
    put(cx - w / 2 + J2(), cy - h / 2 + J2(), w, h);
    for (let k = 0; k < 8; k++) { const a = a0 + (k * Math.PI) / 4; put(cx + rx * Math.cos(a) - w / 2 + J2(), cy + ry * Math.sin(a) - h / 2 + J2(), w, h); }
  } else {
    const covers = (o, c) => c.x + c.w / 2 >= o.x - 6 && c.x + c.w / 2 <= o.x + o.w + 6 && c.y + c.h / 2 >= o.y - 6 && c.y + c.h / 2 <= o.y + o.h + 6;
    for (let k = 0; k < 9; k++) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const w = rng.int(104, 112), h = rng.int(70, 76);
        const c = { x: Math.round(rng.uniform(BOX.x0, BOX.x1 - w)), y: Math.round(rng.uniform(BOX.y0, BOX.y1 - h)), w, h };
        if (cards.length && !cards.some((o) => rectsOverlap(o, c))) continue;
        if (cards.some((o) => covers(o, c) || covers(c, o))) continue;
        put(c.x, c.y, c.w, c.h); placed = true;
      }
      if (!placed) return null;
    }
  }
  if (cards.some((c) => c.x < BOX.x0 - 1 || c.y < BOX.y0 - 1 || c.x + c.w > BOX.x1 + 1 || c.y + c.h > BOX.y1 + 1)) return null;
  return cards;
}
const ARRANGEMENTS = ['grid', 'cascade', 'ring', 'scatter', 'pyramid'];
const arrSplit = splitIds('drawer_arrangement', ARRANGEMENTS, 1);
function generateExt(rng, knobs) {
  const { minReq, maxReq } = EXT;
  const pals = palettesOf(knobs.ext);
  const arrs = ARRANGEMENTS.filter((a) => arrSplit(a) === knobs.ext);
  const kind = arrs[Math.floor(rng.raw() * arrs.length)];
  for (let a = 0; a < 3000; a++) {
    const cards = layoutExt(rng, kind);
    if (!cards) continue;
    const zperm = rng.shuffle(cards.map((c) => c.id));
    cards.forEach((c) => { c.z = zperm[c.id]; });
    if (cards.some((c) => cards.some((o) => o.z > c.z && c.x + c.w / 2 >= o.x - 6 && c.x + c.w / 2 <= o.x + o.w + 6 && c.y + c.h / 2 >= o.y - 6 && c.y + c.h / 2 <= o.y + o.h + 6))) continue;
    const all = new Set(cards.map((k) => k.id));
    const candidates = [];
    for (const c of cards) {
      const req = requiredFor(cards, c.id);
      if (req.size < minReq || req.size > maxReq) continue;
      const direct = overheadTrays(cards, all, c.id);
      if (!direct.some((d) => overheadTrays(cards, all, d).length > 0)) continue;
      candidates.push({ id: c.id, req: [...req] });
    }
    if (!candidates.length) continue;
    const pick = rng.pick(candidates);
    const pal = pals[Math.floor(rng.raw() * pals.length)];
    let colors = null;
    for (let t = 0; t < 60 && !colors; t++) {
      const cs = rng.shuffle(pal.c);
      let ok = true;
      for (let i = 0; i < 9 && ok; i++) for (let j = i + 1; j < 9 && ok; j++) if (rectsOverlap(cards[i], cards[j]) && deltaE76(cs[i], cs[j]) < MIN_DE) ok = false;
      if (ok) colors = cs;
    }
    if (!colors) continue;
    cards.forEach((c, i) => { c.color = colors[i]; });
    const m = {
      task: 'drawer_access_sequence', board: BOARD, ext: knobs.ext, arrangement: kind, palette: pal.id,
      cards: cards.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, color: c.color })),
      targetId: pick.id, requiredIds: pick.req.slice().sort((x, y) => x - y),
      order: pick.req.slice().sort((i, j) => cards[j].z - cards[i].z),
    };
    if (gate(m)) return m;
  }
  throw new Error('drawer_access_sequence: no ext layout (' + kind + ')');
}

function drawBoardExt(g, br, env) {
  const { state, manifest: m } = env, look = env.assets.look;
  g.save(); g.translate(br.x, br.y);
  paintDesk(g, br.w, br.h, look);
  g.translate(VIEW.bx, VIEW.by); g.scale(VIEW.s, VIEW.s); g.translate(-VIEW.cx, -VIEW.cy);
  const out = new Set(state.extracted);
  for (const c of m.cards) {
    if (!out.has(c.id)) continue;
    rr(g, c.x, c.y, c.w, c.h, 3); g.fillStyle = 'rgba(255,255,255,.16)'; g.fill();
    g.setLineDash([5, 4]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(40,30,20,.5)'; g.lineWidth = 0.8; g.stroke(); g.setLineDash([]);
  }
  for (const c of m.cards.filter((k) => !out.has(k.id)).sort((a, b) => a.z - b.z)) {
    paintNote(g, c, look);
    if (c.id === m.targetId) drawStar(g, c.x + c.w / 2, c.y + c.h / 2 + 3, 13 * Math.min(1.08, c.h / 70));
  }
  g.restore();
}

export function semanticKey(m) {
  const q = (v, step) => Math.round(v / step);
  const cards = (m.cards || []).map((c) => ({ c, k: `${q(c.x, 38)},${q(c.y, 25)},${q(c.w, 38)},${q(c.h, 25)}` }));
  const rank = new Map(cards.slice().sort((a, b) => a.c.z - b.c.z).map((x, i) => [x.c.id, i]));
  const desc = cards.map((x) => `${x.k}:${rank.get(x.c.id)}${x.c.id === m.targetId ? '*' : ''}`).sort();
  return `drawer_access_sequence|${desc.join(';')}`;
}
