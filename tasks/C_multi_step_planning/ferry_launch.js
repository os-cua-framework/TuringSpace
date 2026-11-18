import { drawPromptText, UI_FONT } from '../core/panel.js';
import { clamp } from '../core/geom.js';
import * as X from '../common/_style_pool_mat.js';
import { splitIds, nthOf } from '../core/style.js';

const PANEL_W = 440;
const BOARD = { w: 420, h: 372 };
const N_SLIPS = 10;
const SLOT = 38;
const SLIPS_X = Array.from({ length: N_SLIPS }, (_, i) => 39 + i * SLOT);
const KEY_TOP = 0;
const KEY_H = 46;
const KEY_Y = 30;
const FAR_Y = 94;
const NEAR_Y = 318;
const WATER_TOP = 80, WATER_BOT = 326;
const SLIP_HW = 14;
const N_DOCKS = 3;
const ROCK = Object.freeze({
  r: [13, 18],
  deep: 0.3,
  clear: 24,
  gap: 10,
  margin: 10,
  decoys: [1, 1],
});
const ROUNDS = 1;
const ANIM_DUR = 1.15;
const HOLD_T = 1.5;
const BAND = Object.freeze({ h: [74, 84], edge: 10 });

const hyp = (x, y) => Math.hypot(x, y);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return hyp(px - ax - t * dx, py - ay - t * dy);
}
export function track(rd, i) {
  const x0 = SLIPS_X[i], x1 = x0 + rd.driftPx;
  return [[x0, NEAR_Y], [x0, rd.band.bot], [x1, rd.band.top], [x1, FAR_Y]];
}
export function chord(rd, i) { const x0 = SLIPS_X[i]; return [[x0, NEAR_Y], [x0 + rd.driftPx, FAR_Y]]; }
function polyDist(px, py, P) { let d = Infinity; for (let k = 0; k + 1 < P.length; k++) d = Math.min(d, segDist(px, py, ...P[k], ...P[k + 1])); return d; }
const rockDist = (rk, P) => polyDist(rk.x, rk.y, P);
const blockedOn = (rd, P) => rd.rocks.filter((rk) => rockDist(rk, P) <= ROCK.deep * rk.rIn);
const clearOf = (rd, P) => rd.rocks.every((rk) => rockDist(rk, P) >= rk.rOut + ROCK.clear);
export function blockedBy(rd, i) { return blockedOn(rd, track(rd, i)); }
export function isClear(rd, i) { return clearOf(rd, track(rd, i)); }
function pathX(P, y) {
  for (let k = 0; k + 1 < P.length; k++) {
    const [ax, ay] = P[k], [bx, by] = P[k + 1];
    if ((y <= ay && y >= by) || (y >= ay && y <= by)) return ay === by ? ax : ax + (bx - ax) * (y - ay) / (by - ay);
  }
  return P[P.length - 1][0];
}
function trackAt(P, t) { const y = NEAR_Y + (FAR_Y - NEAR_Y) * t; return [pathX(P, y), y]; }
export function candidates(rd) {
  const out = [];
  for (let i = 0; i < N_SLIPS; i++) { const lx = SLIPS_X[i] + rd.driftPx; if (rd.docks.some((d) => Math.abs(d.x - lx) < 0.5)) out.push(i); }
  return out;
}

function makeRock(rng, x, y) {
  const r = rng.uniform(...ROCK.r), n = 9, pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k + rng.uniform(-0.25, 0.25)) * Math.PI * 2 / n, q = r * rng.uniform(0.84, 1.12);
    pts.push([+(q * Math.cos(a)).toFixed(2), +(q * Math.sin(a)).toFixed(2)]);
  }
  const rad = pts.map(([px, py]) => hyp(px, py));
  let rIn = Infinity;
  for (let k = 0; k < n; k++) rIn = Math.min(rIn, segDist(0, 0, ...pts[k], ...pts[(k + 1) % n]));
  return { x: +x.toFixed(2), y: +y.toFixed(2), pts, rIn: +rIn.toFixed(2), rOut: +Math.max(...rad).toFixed(2) };
}
function rockFits(rk, rocks) {
  if (rk.y - rk.rOut < WATER_TOP + ROCK.margin || rk.y + rk.rOut > WATER_BOT - ROCK.margin - 8) return false;
  if (rk.y - rk.rOut < FAR_Y + 24 || rk.y + rk.rOut > NEAR_Y - 22) return false;
  if (rk.x - rk.rOut < 6 || rk.x + rk.rOut > BOARD.w - 6) return false;
  return rocks.every((q) => hyp(q.x - rk.x, q.y - rk.y) >= q.rOut + rk.rOut + ROCK.gap);
}

export function roundProblems(rd) {
  const out = [];
  if (!Number.isInteger(rd.delta) || rd.delta < 2 || rd.delta > 4 || Math.abs(rd.dir) !== 1 || rd.driftPx !== rd.delta * rd.dir * SLOT) return ['drift'];
  if (!Array.isArray(rd.docks) || rd.docks.length !== N_DOCKS || !Array.isArray(rd.rocks)) return ['parts'];
  const cols = rd.docks.map((d) => SLIPS_X.findIndex((x) => Math.abs(x - d.x) < 0.5));
  if (cols.some((c) => c < 0)) return ['dock-off-column'];
  for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) if (Math.abs(cols[a] - cols[b]) < 2) out.push('docks-too-close');
  const b = rd.band;
  if (!b || !Number.isFinite(b.top) || !Number.isFinite(b.bot)) return [...out, 'band'];
  if (b.bot - b.top < BAND.h[0] - 0.05 || b.bot - b.top > BAND.h[1] + 0.05 || b.top < FAR_Y + BAND.edge - 0.05 || b.bot > NEAR_Y - BAND.edge + 0.05) out.push('band-placement');
  const cand = candidates(rd);
  if (cand.length !== N_DOCKS) out.push('candidate-count');
  const open = cand.filter((i) => isClear(rd, i));
  const blocked = cand.filter((i) => blockedBy(rd, i).length > 0);
  if (open.length !== 1 || blocked.length !== N_DOCKS - 1) out.push('not-one-open-track');
  if (open[0] !== rd.answer) out.push('answer-mismatch');
  if (blockedOn(rd, chord(rd, rd.answer)).length === 0) out.push('answer-chord-not-blocked');
  const chordOpen = cand.filter((i) => clearOf(rd, chord(rd, i)));
  const chordBlocked = cand.filter((i) => blockedOn(rd, chord(rd, i)).length > 0);
  if (chordOpen.length !== 1 || chordOpen[0] !== rd.trap || chordBlocked.length !== N_DOCKS - 1) out.push('no-straight-trap');
  if (rd.trap === rd.answer || !cand.includes(rd.trap) || blockedBy(rd, rd.trap).length === 0) out.push('trap-not-blocked');
  for (let k = 0; k < rd.rocks.length; k++) if (!rockFits(rd.rocks[k], rd.rocks.slice(0, k))) out.push('rock-placement');
  return [...new Set(out)];
}

function buildRound(rng) {
  let delta = rng.int(2, 4), dir = rng.sign();
  for (let attempt = 0; attempt < 6000; attempt++) {
    if (attempt && attempt % 3000 === 0) { delta = rng.int(2, 4); dir = rng.sign(); }
    const driftPx = delta * dir * SLOT;
    const ok = [];
    for (let c = 0; c < N_SLIPS; c++) { const s = c - delta * dir; if (s >= 0 && s < N_SLIPS) ok.push(c); }
    const cols = rng.sample(ok, N_DOCKS).sort((a, b) => a - b);
    if (cols.some((c, k) => k && c - cols[k - 1] < 2)) continue;
    const docks = cols.map((c) => ({ x: SLIPS_X[c] }));
    const bh = rng.uniform(...BAND.h), top = rng.uniform(FAR_Y + BAND.edge, NEAR_Y - BAND.edge - bh);
    const band = { top: +top.toFixed(2), bot: +(top + bh).toFixed(2) };
    const openK = rng.int(0, N_DOCKS - 1);
    let trapK = rng.int(0, N_DOCKS - 2); if (trapK >= openK) trapK++;
    const thirdK = N_DOCKS - openK - trapK;
    const slipOf = (k) => cols[k] - delta * dir;
    const rd = { answer: slipOf(openK), trap: slipOf(trapK), delta, dir, driftPx, band, docks, rocks: [], dockSlip: cols[openK], dockX: SLIPS_X[cols[openK]] };
    const openP = track(rd, rd.answer), trapC = chord(rd, rd.trap);
    const keepsClear = (rk) => rockDist(rk, openP) >= rk.rOut + ROCK.clear && rockDist(rk, trapC) >= rk.rOut + ROCK.clear;
    const placeOn = (P, test, tries = 80) => {
      for (let t = 0; t < tries; t++) {
        const y = rng.uniform(FAR_Y + 24 + 12, NEAR_Y - 22 - 12);
        const rk = makeRock(rng, pathX(P, y), y);
        rk.x = +(rk.x + rng.uniform(-0.8, 0.8) * ROCK.deep * rk.rIn).toFixed(2);
        if (rockDist(rk, P) > ROCK.deep * rk.rIn || !rockFits(rk, rd.rocks) || !keepsClear(rk) || !test(rk)) continue;
        rd.rocks.push(rk); return rk;
      }
      return null;
    };
    if (!placeOn(chord(rd, rd.answer), () => true)) continue;
    const offLines = (P, inBand) => (rk) => (!inBand || (rk.y > band.top && rk.y < band.bot)) && Math.abs(rk.x - P[0][0]) >= rk.rOut + 6 && Math.abs(rk.x - P[3][0]) >= rk.rOut + 6;
    const trapP = track(rd, rd.trap);
    if (!placeOn(trapP, offLines(trapP, true), 150) && !placeOn(trapP, () => true)) continue;
    const thC = chord(rd, slipOf(thirdK)), thP = track(rd, slipOf(thirdK));
    const onBoth = placeOn(thC, (rk) => rockDist(rk, thP) <= ROCK.deep * rk.rIn, 40);
    if (!onBoth) {
      if (!placeOn(thP, offLines(thP, true), 150) && !placeOn(thP, () => true)) continue;
      if (blockedOn(rd, thC).length === 0 && !placeOn(thC, offLines(thP, false), 150) && !placeOn(thC, () => true)) continue;
    }
    const nDec = rng.int(...ROCK.decoys);
    const kinds = rng.raw() < 0.75 ? [rng.raw() < 0.5 ? 'slipLine' : 'dockLine', 'nearDock'] : rng.shuffle(['nearDock', 'nearSlip']);
    for (let d = 0; d < nDec; d++) {
      const kind = kinds[d];
      for (let t = 0; t < 80; t++) {
        const k2 = t < 50 ? kind : 'any';
        let x, y;
        if (k2 === 'slipLine') { x = openP[0][0] + rng.uniform(-4, 4); y = rng.uniform(FAR_Y + 36, band.top); }
        else if (k2 === 'dockLine') { x = openP[3][0] + rng.uniform(-4, 4); y = rng.uniform(band.bot, NEAR_Y - 34); }
        else if (k2 === 'nearDock') { x = rd.dockX + rng.uniform(-90, 90); y = FAR_Y + rng.uniform(46, 120); }
        else if (k2 === 'nearSlip') { x = openP[0][0] + rng.uniform(-90, 90); y = NEAR_Y - rng.uniform(46, 120); }
        else { x = rng.uniform(20, BOARD.w - 20); y = rng.uniform(WATER_TOP + 30, WATER_BOT - 40); }
        const rk = makeRock(rng, x, y);
        if (!keepsClear(rk) || !rockFits(rk, rd.rocks)) continue;
        rd.rocks.push(rk); break;
      }
    }
    if (roundProblems(rd).length) continue;
    return rd;
  }
  throw new Error('ferry_launch: could not lay out a round');
}

export function gate(m) {
  if (!m || m.task !== 'ferry_launch') return false;
  if (m.ext) return true;
  if (!Array.isArray(m.rounds) || m.rounds.length !== 1 || !Array.isArray(m.slipsX) || m.slipsX.length !== N_SLIPS) return false;
  return m.rounds.every((rd) => Number.isInteger(rd.answer) && rd.answer >= 0 && rd.answer < N_SLIPS && roundProblems(rd).length === 0);
}

export default {
  meta: {
    name: 'ferry_launch', family: 'C', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'select', id: '0..9 (launch slip, left→right)' }],
    promptHuman: 'Pick the slip whose drifting ferry reaches a dock without hitting a rock',
  },

  generate(rng, _level, _index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const rounds = [buildRound(rng)];
    return { task: 'ferry_launch', board: BOARD, slipsX: SLIPS_X, slot: SLOT, rounds, roundCount: ROUNDS };
  },

  init() { return { round: 0, picks: [-1] }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'select' || !Number.isInteger(action.id)) return { ok: false, reason: 'bad-op' };
    if (action.id < 0 || action.id >= manifest.slipsX.length) return { ok: false, reason: 'bad-id' };
    const ri = Math.min(state.round, manifest.roundCount - 1);
    state.picks[ri] = action.id;
    state.round = Math.max(state.round, ri + 1);
    return { ok: true, round: state.round, done: state.round >= manifest.roundCount };
  },

  verify(state, manifest) {
    const good = manifest.rounds.map((rd, i) => state.picks[i] === rd.answer);
    const answered = state.picks.every((p) => p >= 0);
    const success = answered && good.every(Boolean);
    return {
      success,
      partial: good.filter(Boolean).length / manifest.roundCount,
      error: success ? 0 : 1,
      detail: { answered, choice: good[0] },
    };
  },

  oracle(manifest) {
    return manifest.rounds.map((rd) => ({ op: 'select', id: rd.answer }));
  },

  randomPolicy(manifest, rnd) {
    return manifest.rounds.map(() => ({ op: 'select', id: Math.floor(rnd() * manifest.slipsX.length) }));
  },

  async mount(env) {
    this._anim = null; this._revealed = false;
    if (env?.manifest?.ext) env.assets.ferryLook = await mountFerryLook(env);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap the launch spot whose ferry reaches a dock', 'Top strip: drift in one crossing · a ferry that hits a rock stops');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    const anim = this._anim;
    const ri = anim ? anim.round : Math.min(st.round, ROUNDS - 1);
    const rd = m.rounds[ri];
    if (m.ext) { drawFerryExt(g, br, env, rd, anim); return; }
    g.save(); g.translate(br.x, br.y);

    g.fillStyle = '#cbb587';
    g.fillRect(0, 0, br.w, WATER_TOP);
    g.fillRect(0, WATER_BOT, br.w, br.h - WATER_BOT);
    g.fillStyle = STILL_WATER; g.fillRect(0, WATER_TOP, br.w, WATER_BOT - WATER_TOP);

    drawRapids(g, br.w, rd);

    for (const rk of rd.rocks) drawRock(g, rk, rd.band);

    for (const d of rd.docks) drawDock(g, d.x, FAR_Y);

    for (let i = 0; i < SLIPS_X.length; i++) drawSlip(g, SLIPS_X[i], NEAR_Y, anim ? anim.slip === i : st.picks[ri] === i);

    drawDriftKey(g, br.w, br.h, rd);

    if (anim) {
      const tt = clamp(anim.t, 0, anim.tEnd ?? 1);
      const P = track(rd, anim.slip);
      const [x, y] = trackAt(P, tt);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let k = 1; k < P.length && P[k][1] > y; k++) g.lineTo(P[k][0], P[k][1]);
      g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      drawFerry(g, x, y, 1, '#f2d24a', '#b08616');
    }

    g.restore();
  },

  tick(env, dt) {
    if (env.submitted && !this._revealed) {
      this._revealed = true;
      const ri = Math.min(env.state.round, ROUNDS) - 1;
      if (ri >= 0 && env.state.picks[ri] >= 0) {
        const rd = env.manifest.rounds[ri], slip = env.state.picks[ri];
        let tEnd = 1;
        if (!env.manifest.ext && rd.rocks) {
          const P = track(rd, slip);
          for (let k = 0; k <= 200; k++) {
            const t = k / 200, [x, y] = trackAt(P, t);
            if (rd.rocks.some((rk) => hyp(x - rk.x, y - rk.y) < (rk.rIn + rk.rOut) / 2 + 7)) { tEnd = t; break; }
          }
        }
        this._anim = { round: ri, slip, t: 0, tEnd };
      }
    }
    if (!this._anim) return false;
    this._anim.t += dt / ANIM_DUR;
    if (this._anim.t >= HOLD_T) { this._anim = null; }
    return true;
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    if (this._anim || env.submitted) return [];
    if (env.manifest.ext) {
      const m = env.manifest, hw = Math.min(15, m.slot / 2 - 5);
      let bi = -1, bdx = Infinity;
      m.slipsX.forEach((x, i) => { const d = Math.hypot(evt.x - x, evt.y - m.nearY); if (d < bdx && onSlip(evt.x, evt.y, x, m.nearY, hw, m.cross === 'down')) { bi = i; bdx = d; } });
      return bi >= 0 ? [{ op: 'select', id: bi }] : [];
    }
    let best = -1, bd = Infinity;
    for (let i = 0; i < SLIPS_X.length; i++) {
      const d = Math.hypot(evt.x - SLIPS_X[i], evt.y - NEAR_Y);
      if (d < bd && onSlip(evt.x, evt.y, SLIPS_X[i], NEAR_Y, SLIP_HW, false)) { best = i; bd = d; }
    }
    return best >= 0 ? [{ op: 'select', id: best }] : [];
  },

  wantsMoveRedraw: false,

  footerStatus(env) {
    if (this._anim) return '';
    const r = env.state.round;
    return r >= ROUNDS ? '1 selected' : 'Tap a launch spot';
  },
};

function drawFlowArrow(g, cx, cy, dir, len) {
  const x0 = cx - (len / 2) * dir, x1 = cx + (len / 2) * dir;
  g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, cy); g.stroke();
  g.beginPath(); g.moveTo(x1, cy);
  g.lineTo(x1 - 8 * dir, cy - 5); g.lineTo(x1 - 8 * dir, cy + 5);
  g.closePath(); g.fill();
}

const STILL_WATER = '#2b5a80';
const RAPID = Object.freeze({ base: '#93c9e4', mid: '#a9d6ec', trough: 'rgba(52,118,162,.38)', edge: 'rgba(10,32,52,.55)', arrow: '#15446a' });
function drawRapids(g, w, rd) {
  const { top, bot } = rd.band, h = bot - top, dir = rd.dir;
  let a = (Math.round(top * 977 + bot * 131 + rd.driftPx * 7919) >>> 0) || 1;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const edgeY = (y0, x) => y0 + 1.8 * Math.sin(x * 0.11 + y0) + 0.9 * Math.sin(x * 0.29 + 2 * y0);
  g.save();
  const outline = () => {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = edgeY(top, x); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, edgeY(bot, x));
    g.closePath();
  };
  g.strokeStyle = RAPID.edge; g.lineWidth = 3;
  for (const [y0, off] of [[top, -2], [bot, 2]]) {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = edgeY(y0, x) + off; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  outline(); g.fillStyle = RAPID.base; g.fill();
  g.save(); outline(); g.clip();
  const bg = g.createLinearGradient(0, top, 0, bot);
  bg.addColorStop(0, 'rgba(255,255,255,.18)'); bg.addColorStop(0.5, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(255,255,255,.18)');
  g.fillStyle = bg; g.fillRect(0, top - 4, w, h + 8);
  g.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    const x = rnd() * (w + 40) - 20, y = top + 4 + rnd() * (h - 8), len = 14 + rnd() * 26;
    g.strokeStyle = RAPID.trough; g.lineWidth = 1.6 + rnd() * 1.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dir * len / 2, y + 2, x + dir * len, y); g.stroke();
  }
  for (let k = 0; k < 150; k++) {
    const x = rnd() * (w + 40) - 20, y = top + 3 + rnd() * (h - 6), len = 10 + rnd() * 24;
    g.strokeStyle = `rgba(255,255,255,${(0.35 + rnd() * 0.45).toFixed(3)})`; g.lineWidth = 1.1 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dir * len / 2, y - 1.8, x + dir * len, y); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.8)';
  for (let k = 0; k < 70; k++) { g.beginPath(); g.ellipse(rnd() * w, top + 3 + rnd() * (h - 6), 1 + rnd() * 2, 0.8 + rnd() * 1.2, 0, 0, Math.PI * 2); g.fill(); }
  for (const rk of rd.rocks) {
    if (rk.y + rk.rOut < top - 2 || rk.y - rk.rOut > bot + 2) continue;
    const R0 = rk.rOut;
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.ellipse(rk.x - dir * (R0 * 0.55), rk.y, R0 * 0.75, R0 * 1.15, 0, 0, Math.PI * 2); g.fill();
    for (const [side, al] of [[-1, 0.85], [1, 0.85], [-0.45, 0.55], [0.45, 0.55]]) {
      g.strokeStyle = `rgba(255,255,255,${al})`; g.lineWidth = 2.4;
      const sx = rk.x + dir * R0 * 0.2, sy = rk.y + side * R0 * 0.85, L = 34 + R0;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + dir * L * 0.5, sy + side * 5, sx + dir * L, sy + side * 11); g.stroke();
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(250,253,255,.95)'; g.lineWidth = 2.6; g.lineCap = 'round';
  for (const y0 of [top, bot]) {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = edgeY(y0, x); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let x = 2; x < w; x += 5 + rnd() * 5) { g.beginPath(); g.arc(x, edgeY(y0, x) + (y0 === top ? 1.5 : -1.5), 1.2 + rnd() * 1.8, 0, Math.PI * 2); g.fill(); }
  }
  for (const [r, ay] of [top + h * 0.3, top + h * 0.7].entries()) {
    for (let c = 0; c < 6 - r; c++) {
      const ax = 35 + c * 70 + r * 35;
      if (rd.rocks.some((rk) => Math.abs(rk.x - ax) < rk.rOut + 26 + 22 && Math.abs(rk.y - ay) < rk.rOut + 10)) continue;
      drawBandArrow(g, ax, ay, dir, 36);
    }
  }
  g.restore();
}
function drawBandArrow(g, cx, cy, dir, len) {
  const x0 = cx - (len / 2) * dir, x1 = cx + (len / 2) * dir;
  for (const [col, lw, grow] of [['rgba(255,255,255,.95)', 6.5, 2.2], [RAPID.arrow, 3, 0]]) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1 - 4 * dir, cy); g.stroke();
    g.beginPath(); g.moveTo(x1 + grow * dir, cy);
    g.lineTo(x1 - (10 + grow) * dir, cy - 6.5 - grow); g.lineTo(x1 - (10 + grow) * dir, cy + 6.5 + grow);
    g.closePath(); g.fill();
  }
}

function drawFerry(g, x, y, s, hull, trim) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(0, -13);
  g.quadraticCurveTo(8, -5, 7, 9);
  g.lineTo(-7, 9);
  g.quadraticCurveTo(-8, -5, 0, -13);
  g.closePath();
  g.fillStyle = hull; g.fill();
  g.strokeStyle = trim; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(245,248,250,.92)'; g.fillRect(-4, -3, 8, 8);
  g.restore();
}

const SLIP_PAD = 8;
function onSlip(x, y, sx, sy, hw, flip) {
  if (Math.hypot(x - sx, y - sy) <= 11 + SLIP_PAD) return true;
  const y0 = flip ? sy - 20 : sy - 2, y1 = flip ? sy + 2 : sy + 20;
  return x >= sx - hw - SLIP_PAD && x <= sx + hw + SLIP_PAD && y >= y0 - SLIP_PAD && y <= y1 + SLIP_PAD;
}

function drawRock(g, rk, band) {
  const path = (s) => { g.beginPath(); rk.pts.forEach(([px, py], i) => (i ? g.lineTo(rk.x + px * s, rk.y + py * s) : g.moveTo(rk.x + px * s, rk.y + py * s))); g.closePath(); };
  g.save();
  path(1.14); g.fillStyle = 'rgba(12,34,54,.30)'; g.fill();
  if (band) { g.save(); g.beginPath(); g.rect(rk.x - 40, band.top, 80, band.bot - band.top); g.clip(); path(1.2); g.fillStyle = 'rgba(255,255,255,.9)'; g.fill(); g.restore(); }
  path(1); g.shadowColor = 'rgba(0,20,40,.35)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
  const gr = g.createRadialGradient(rk.x - rk.rOut * 0.35, rk.y - rk.rOut * 0.4, 1, rk.x, rk.y, rk.rOut * 1.1);
  gr.addColorStop(0, '#b9b4aa'); gr.addColorStop(0.6, '#8c877d'); gr.addColorStop(1, '#5e5a53');
  g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = '#3f3c37'; g.lineWidth = 1.3; g.stroke();
  g.restore();
}

function drawSlip(g, x, y, active) {
  const hw = SLIP_HW;
  g.save();
  g.fillStyle = active ? '#e7b24a' : '#9c7a53';
  g.fillRect(x - hw, y - 2, 2 * hw, 22);
  g.strokeStyle = 'rgba(40,30,18,.4)'; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - hw, y - 2 + k * 6); g.lineTo(x + hw, y - 2 + k * 6); g.stroke(); }
  g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2);
  g.fillStyle = active ? 'rgba(255,236,180,.96)' : 'rgba(233,241,247,.94)';
  g.fill();
  g.strokeStyle = active ? '#b6801e' : '#4f6c82'; g.lineWidth = 2.5; g.stroke();
  g.restore();
}

function drawDock(g, x, y) {
  g.save();
  g.fillStyle = '#6f5033';
  g.fillRect(x - 22, y - 16, 44, 6);
  g.fillRect(x - 22, y - 16, 6, 26);
  g.fillRect(x + 16, y - 16, 6, 26);
  g.fillStyle = '#8a6a44'; g.fillRect(x - 22, y - 22, 44, 6);
  g.fillStyle = 'rgba(122,205,145,.32)'; g.fillRect(x - 15, y - 10, 30, 18);
  g.fillStyle = '#22303a'; g.font = `800 10px ${UI_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Dock', x, y - 30);
  g.restore();
}

function drawDriftKey(g, w, h, rd) {
  g.save();
  g.strokeStyle = '#d7c39a'; g.lineWidth = 1;
  g.fillStyle = '#efe6cf'; g.fillRect(0, KEY_TOP, w, KEY_H);
  g.beginPath(); g.moveTo(0, KEY_TOP + KEY_H); g.lineTo(w, KEY_TOP + KEY_H); g.stroke();
  g.fillStyle = '#6a5a34'; g.font = `800 10px ${UI_FONT}`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Drift in one crossing', 8, KEY_TOP + 12);
  g.strokeStyle = 'rgba(120,100,60,.45)'; g.lineWidth = 1;
  for (const x of SLIPS_X) { g.beginPath(); g.moveTo(x, KEY_Y - 7); g.lineTo(x, KEY_Y + 7); g.stroke(); }
  const cStart = rd.dir > 0 ? 0 : SLIPS_X.length - 1;
  const x0 = SLIPS_X[cStart];
  const x1 = x0 + rd.driftPx;
  g.strokeStyle = 'rgba(120,100,60,.4)'; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(x0, KEY_Y - 11); g.lineTo(x0, KEY_Y + 11); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#c67b2b'; g.fillStyle = '#c67b2b'; g.lineWidth = 3; g.lineCap = 'round';
  drawFlowArrow(g, (x0 + x1) / 2, KEY_Y, rd.dir, Math.abs(x1 - x0) - 14);
  drawFerry(g, x0, KEY_Y, 0.62, 'rgba(120,150,175,.5)', 'rgba(70,95,115,.6)');
  drawFerry(g, x1, KEY_Y, 0.62, '#f2d24a', '#b08616');
  g.restore();
}

const EXT_KEY_H = 48;
const EXT_SLOT = 56;
const EVAL_KEYS = new Set(['up|0|1', 'up|0|2', 'up|3|-2', 'up|2|1', 'up|1|-1', 'up|2|2', 'up|4|-1', 'up|1|2', 'up|4|-2']);
const EXT_CLASSES = (() => {
  const out = [];
  for (const cross of ['up', 'down']) for (let answer = 0; answer < 5; answer++) for (const delta of [1, 2]) for (const dir of [1, -1]) {
    const d = answer + delta * dir;
    if (d < 0 || d >= 5 || EVAL_KEYS.has(`${cross}|${answer}|${delta * dir}`)) continue;
    out.push({ id: `${cross}-${answer}-${delta}-${dir}`, cross, answer, delta, dir, dockSlip: d });
  }
  return out;
})();
const extClassSplit = splitIds('ferry_launch_class_r2', EXT_CLASSES.map((c) => c.id), 2);
export function semanticKey(m) {
  const r = m.rounds[0];
  return `ferry|n${m.slipsX.length}|${m.cross || 'up'}|${r.answer}|${r.delta * r.dir}`;
}
function generateExt(rng, split, nth) {
  const classes = EXT_CLASSES.filter((c) => extClassSplit(c.id) === split);
  const cls = classes[nth ? nthOf(`ferry_launch|${split}|classes_r2`, nth, classes.length) : rng.int(0, classes.length - 1)];
  const { cross, answer, delta, dir, dockSlip } = cls;
  const n = 5, slot = rng.int(EXT_SLOT, 66);
  const x0 = +rng.uniform(26, BOARD.w - 26 - slot * (n - 1)).toFixed(1);
  const slipsX = Array.from({ length: n }, (_, i) => +(x0 + i * slot).toFixed(1));
  const waterTop = rng.int(cross === 'down' ? 76 : 70, 124), waterBot = Math.min(cross === 'down' ? 296 : 300, waterTop + rng.int(150, 215));
  const up = cross === 'up';
  return {
    task: 'ferry_launch', board: BOARD, ext: split, cls: cls.id, cross, slipsX, slot, rounds: [{ answer, delta, dir, dockSlip, dockX: slipsX[dockSlip], driftPx: delta * dir * slot }],
    roundCount: ROUNDS, waterTop, waterBot, farY: up ? waterTop + 14 : waterBot - 14, nearY: up ? waterBot - 8 : waterTop + 8, keyH: EXT_KEY_H, keyY: 30,
  };
}

const SETTINGS = [
  { id: 'meadow', match: /grass|forrest|forest|leaves|moss|lichen/, water: [['#3f7fae', '#2b5f86'], ['#4b8a9a', '#2f6676'], ['#3d7090', '#284d66']], props: ['tree', 'tree', 'bush', 'reed', 'rock', 'house'], edge: 'reeds' },
  { id: 'beach', match: /sand|coast|pebble|gravel/, water: [['#2f9ab8', '#1b6f8e'], ['#3aa6a8', '#217c80'], ['#2c86b8', '#1a5f8a']], props: ['rock', 'post', 'palm', 'palm'], edge: 'wet' },
  { id: 'mountain', match: /rock|boulder|cliff|trail|pitted/, water: [['#3a8aa0', '#24687c'], ['#5d99a0', '#3a7176'], ['#4d7f8f', '#2f5866']], props: ['rock', 'pine', 'pine', 'rock'], edge: 'rocks' },
  { id: 'arctic', match: /snow/, water: [['#4f9fb2', '#2e7b90'], ['#6fb2c0', '#3f8597'], ['#3d7f99', '#25586e']], props: ['pine', 'rock', 'ice', 'pine'], edge: 'snow' },
  { id: 'swamp', match: /mud|dirt|laterite|dry_ground|soil/, water: [['#5d7448', '#3f5532'], ['#6b6a3e', '#4a4828'], ['#4f6b55', '#33493a']], props: ['reed', 'bush', 'stump', 'tree'], edge: 'reeds' },
  { id: 'canal', match: /paving|cobble|tiles|slab|stone|brick|plaster|pavement|monastery|floor|medieval|castle|japanese|broken|clean/, water: [['#3c6f7c', '#27525e'], ['#4c6f62', '#30503f'], ['#36607a', '#223f55']], props: ['bollard', 'lamp', 'house', 'house', 'bench'], edge: 'quay' },
  { id: 'industrial', match: /concrete|asphalt|cement|garage|hangar|gravel_concrete|granular/, water: [['#4a6b7a', '#33505d'], ['#56666b', '#3a474c'], ['#3f6470', '#284450']], props: ['bollard', 'crate', 'crate', 'house', 'container'], edge: 'quay' },
];
const BOATS = [
  { id: 'car_ferry', hull: '#f2d24a', trim: '#b08616', cabin: 'rgba(245,248,250,.92)' },
  { id: 'passenger_ferry', hull: '#f4f4f0', trim: '#33607e', cabin: 'rgba(60,110,150,.9)' },
  { id: 'raft_ferry', hull: '#b88a55', trim: '#6b4a26', cabin: 'rgba(240,232,214,.9)', logs: true },
  { id: 'red_ferry', hull: '#c43c2f', trim: '#3a1410', cabin: 'rgba(240,240,236,.95)' },
  { id: 'river_ferry', hull: '#2f8a52', trim: '#174a2b', cabin: 'rgba(236,240,232,.95)', slim: true },
  { id: 'pontoon_ferry', hull: '#59656f', trim: '#2a3137', cabin: 'rgba(214,220,226,.95)', wide: true },
  { id: 'orange_ferry', hull: '#e8743b', trim: '#8a3a12', cabin: 'rgba(250,246,236,.95)' },
  { id: 'wooden_ferry', hull: '#a0673a', trim: '#5e3a1c', cabin: 'rgba(238,226,200,.95)' },
];
const KEY_THEMES = [
  { id: 'parchment', bg: '#efe6cf', line: '#d7c39a', ink: '#6a5a34', tick: 'rgba(120,100,60,.45)', arrow: '#c67b2b' },
  { id: 'signboard', bg: '#2f5d3a', line: '#1f3f27', ink: '#f2f2e6', tick: 'rgba(240,240,230,.55)', arrow: '#ffd23f' },
  { id: 'enamel', bg: '#1f4f8a', line: '#163a66', ink: '#ffffff', tick: 'rgba(255,255,255,.5)', arrow: '#ffb03b' },
  { id: 'steel', bg: '#c9d0d6', line: '#9aa4ad', ink: '#24303a', tick: 'rgba(40,50,60,.45)', arrow: '#d0402d' },
  { id: 'chalk', bg: '#2d3a33', line: '#1c2520', ink: '#e9efe6', tick: 'rgba(233,239,230,.5)', arrow: '#f2a07b' },
  { id: 'wood', bg: '#b88a55', line: '#7a5530', ink: '#2e1d0c', tick: 'rgba(46,29,12,.45)', arrow: '#1f5f9a' },
  { id: 'paper', bg: '#fbfaf5', line: '#d9d4c6', ink: '#3a3a3a', tick: 'rgba(80,80,80,.4)', arrow: '#2a7bd1' },
];
const BANK_USES = new Set(['terrain', 'stone', 'floor']);

async function mountFerryLook(env) {
  const st = env.style;
  env.assets.fcache = new Map();
  if (!st) return null;
  const rnd = st.rand;
  const bank = st.primary('tex', (t) => BANK_USES.has(t.use));
  const setting = SETTINGS.find((s) => s.match.test(bank.id)) || SETTINGS[bank.use === 'terrain' ? 2 : 5];
  st.note(`setting:${setting.id}`);
  const boats = X.stylePool(st, 'ferry_boat', BOATS, 1);
  const boat = boats[X.seqPick(st, 'boat', boats.length)];
  const keys = X.stylePool(st, 'ferry_key', KEY_THEMES, 1);
  const key = keys[X.seqPick(st, 'key', keys.length)];
  const wood = st.pick('tex', (t) => t.use === 'wood');
  const quay = st.pick('tex', (t) => t.use === 'stone' || t.use === 'floor');
  const wl = (rnd() - 0.5) * 0.3, pal = X.pickSplit(st, `ferry_water_${setting.id}`, setting.water.map((c, i) => ({ id: `${setting.id}-${i}`, c }))).c;
  const sub = (name, ids) => X.poolOf(name, ids.map((id) => ({ id })), st.split, 1).map((i) => i.id);
  const propKinds = sub(`ferry_props_${setting.id}`, [...new Set(setting.props)]);
  const propCols = { green: sub('ferry_greens', ['#3f7a35', '#2f6a3a', '#5a8a3a', '#4c7d2c']), rock: sub('ferry_rocks', ['#8a8a85', '#9c968a', '#6f7174']), box: sub('ferry_containers', ['#b5432f', '#2f6a9a', '#3b7a46', '#c9952e']), house: sub('ferry_houses', ['#b5543f', '#6d7a86', '#8a5a3c', '#4f6d5a']) };
  st.note(`ferry_setting:${setting.id}`); st.note(`ferry_props:${propKinds.join('/')}`);
  const water = pal.map((c) => X.shadeHex(c, wl));
  st.note(`boat:${boat.id} key:${key.id} water:${water[0]}`);
  const look = {
    bank: await X.loadTex(bank), wood: await X.loadTex(wood), quay: await X.loadTex(quay), setting, boat, key, water, propKinds, propCols,
    bankLum: setting.id === 'arctic' ? 0.5 + 0.2 * rnd() : 0.12 + 0.22 * rnd(), bankRot: 90 * Math.floor(rnd() * 4), bankScale: 0.3 + 0.35 * rnd(),
    concreteSlips: setting.id === 'canal' || setting.id === 'industrial' ? rnd() < 0.7 : rnd() < 0.15,
    ripple: Math.floor(rnd() * 1e9), props: Math.floor(rnd() * 1e9), shore: 2 + rnd() * 5, flowAlpha: 0.5 + 0.2 * rnd(),
  };
  return look;
}

function drawFerryExt(g, br, env, rd, anim) {
  const m = env.manifest, st = env.state, L = env.assets.ferryLook || null;
  g.save(); g.translate(br.x, br.y);
  X.drawCached(g, env.assets.fcache, 'scene', br.w, br.h, (cg) => paintFerryScene(cg, br.w, br.h, m, rd, L));
  for (let i = 0; i < m.slipsX.length; i++) drawSlipExt(g, m.slipsX[i], m.nearY, anim ? anim.slip === i : st.picks[0] === i, m.slot, L, m.cross === 'down');
  if (anim) {
    const tt = clamp(anim.t, 0, 1), sx = m.slipsX[anim.slip], x = sx + rd.driftPx * tt, y = m.nearY + (m.farY - m.nearY) * tt;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.setLineDash([3, 5]);
    g.beginPath(); g.moveTo(sx, m.nearY); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    g.save(); g.translate(x, y); g.rotate(Math.atan2(rd.driftPx, m.nearY - m.farY));
    drawBoat(g, 0, 0, 1, L ? L.boat : BOATS[0], false);
    g.restore();
  }
  g.restore();
}

function paintFerryScene(g, w, h, m, rd, L) {
  const WT = m.waterTop, WB = m.waterBot;
  const rnd = X.prng(L ? L.ripple : 1);
  if (L) {
    X.fillTex(g, L.bank, { rect: [0, 0, w, h], lum: L.bankLum, sat: 0.9, scale: L.bankScale, rot: L.bankRot });
  } else { g.fillStyle = '#cbb587'; g.fillRect(0, 0, w, h); }
  const sh = L ? L.shore : 0;
  const edge = (y0, sgn, k) => { const pts = []; for (let x = -10; x <= w + 10; x += 10) pts.push([x, y0 + sgn * sh * (0.5 + 0.5 * Math.sin(x * 0.045 + k) * Math.cos(x * 0.017 + 2 * k))]); return pts; };
  const top = edge(WT, -1, 1.3), bot = edge(WB, 1, 4.1);
  const river = () => { g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); bot.slice().reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); };
  const edgeKind = L ? L.setting.edge : 'wet';
  g.save(); river();
  if (edgeKind === 'quay') { g.lineWidth = 12; g.strokeStyle = '#7d7f80'; g.stroke(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke(); }
  else if (edgeKind === 'snow') { g.lineWidth = 10; g.strokeStyle = 'rgba(245,250,255,0.9)'; g.stroke(); }
  else if (edgeKind === 'wet') { g.lineWidth = 16; g.strokeStyle = 'rgba(60,45,25,0.3)'; g.stroke(); g.lineWidth = 7; g.strokeStyle = 'rgba(60,45,25,0.25)'; g.stroke(); }
  else { g.lineWidth = 8; g.strokeStyle = 'rgba(40,30,20,0.3)'; g.stroke(); }
  g.restore();
  const wg = g.createLinearGradient(0, WT, 0, WB);
  const W = L ? L.water : ['#4a86b4', '#31688f'];
  wg.addColorStop(0, W[0]); wg.addColorStop(1, W[1]);
  river(); g.fillStyle = wg; g.fill();
  g.save(); river(); g.clip();
  for (let k = 0; k < 90; k++) {
    const x = rnd() * w, y = WT + rnd() * (WB - WT), len = 6 + rnd() * 16;
    g.strokeStyle = `rgba(255,255,255,${(0.05 + rnd() * 0.12).toFixed(3)})`; g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 1.5, x + len, y); g.stroke();
  }
  const dg = g.createLinearGradient(0, WT, 0, WB);
  dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(0.5, 'rgba(0,20,40,0.12)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = dg; g.fillRect(0, WT - 10, w, WB - WT + 20);
  g.restore();
  if (L && (edgeKind === 'reeds' || edgeKind === 'rocks')) {
    const er = X.prng(L.props + 7);
    for (const [y0, sg] of [[WT, -1], [WB, 1]]) for (let x = 6; x < w; x += 9 + er() * 10) {
      if (sg > 0 && m.slipsX.some((sx) => Math.abs(sx - x) < 20)) continue;
      if (sg < 0 && Math.abs(x - rd.dockX) < 30) continue;
      if (edgeKind === 'reeds') drawProp(g, 'reed', x, y0 + sg * (sh + 5), 6 + er() * 4, er);
      else drawProp(g, 'rock', x, y0 + sg * (sh + 3), 3 + er() * 3, er, L.propCols);
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1; g.setLineDash([3, 5]);
  for (const x of m.slipsX) { g.beginPath(); g.moveTo(x, WT); g.lineTo(x, WB); g.stroke(); }
  g.setLineDash([]);
  const fa = L ? L.flowAlpha : 0.6;
  g.strokeStyle = `rgba(232,243,250,${fa})`; g.fillStyle = `rgba(232,243,250,${fa})`; g.lineWidth = 2.5; g.lineCap = 'round';
  const rows = [0.3, 0.58, 0.84].map((f) => WT + f * (WB - WT));
  for (const ay of rows) for (const ax of [w * 0.25, w * 0.5, w * 0.75]) drawFlowArrow(g, ax, ay, rd.dir, 30);
  if (L) drawProps(g, w, h, m, rd, L);
  drawDockExt(g, rd.dockX, m.farY, L, m.cross === 'down');
  drawKeyExt(g, w, m, rd, L);
}

function drawProps(g, w, h, m, rd, L) {
  const r = X.prng(L.props);
  const keepOut = [
    { x: rd.dockX - 34, y: m.farY - 44, w: 68, h: 88 },
    ...m.slipsX.map((x) => ({ x: x - 22, y: m.nearY - 30, w: 44, h: 60 })),
    { x: 0, y: 0, w, h: m.keyH + 2 },
  ];
  const free = (x, y, rad) => !keepOut.some((k) => x + rad > k.x && x - rad < k.x + k.w && y + rad > k.y && y - rad < k.y + k.h);
  const bands = [[m.keyH + 4, m.waterTop - 6], [m.waterBot + 8, h - 4]];
  const lowBank = m.cross === 'down' ? m.waterBot + 40 + r() * 10 : m.nearY + 34 + r() * 10;
  const roadY = r() < 0.5 ? lowBank : (m.keyH + m.waterTop) / 2;
  const roadOk = roadY < h - 8 && (roadY > m.waterBot || (m.waterTop - m.keyH > 34 && m.cross !== 'down'));
  if (roadOk && r() < 0.6) {
    const rw = 9 + r() * 6;
    g.fillStyle = L.setting.edge === 'quay' ? 'rgba(60,62,66,0.75)' : 'rgba(150,125,90,0.55)';
    g.fillRect(0, roadY - rw / 2, w, rw);
    if (L.setting.edge === 'quay') { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.setLineDash([8, 8]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, roadY); g.lineTo(w, roadY); g.stroke(); g.setLineDash([]); }
    keepOut.push({ x: 0, y: roadY - rw / 2 - 2, w, h: rw + 4 });
  }
  let placed = 0;
  for (let k = 0; k < 200 && placed < 18; k++) {
    const b = bands[r() < 0.4 ? 0 : 1];
    if (b[1] - b[0] < 10) continue;
    const kind = X.pickR(r, L.propKinds);
    const s = kind === 'house' || kind === 'container' ? 14 + r() * 7 : kind === 'tree' || kind === 'pine' || kind === 'palm' ? 11 + r() * 8 : 5 + r() * 4;
    const x = 8 + r() * (w - 16), y = b[0] + s * 0.6 + r() * Math.max(1, b[1] - b[0] - s * 1.2);
    if (!free(x, y, s + 3)) continue;
    keepOut.push({ x: x - s - 2, y: y - s - 2, w: 2 * s + 4, h: 2 * s + 4 });
    drawProp(g, kind, x, y, s, r, L.propCols);
    placed++;
  }
}
function drawProp(g, kind, x, y, s, r, PC = null) {
  const C = PC || { green: ['#3f7a35'], rock: ['#8a8a85'], box: ['#9a7246'], house: ['#6d7a86'] };
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + s * 0.25, y + s * 0.3, s * 0.9, s * 0.45, 0, 0, Math.PI * 2); g.fill();
  if (kind === 'tree' || kind === 'bush') {
    const c = X.pickR(r, C.green);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * s * 0.8, y + (r() - 0.5) * s * 0.8, s * (kind === 'bush' ? 0.55 : 0.7), 0, Math.PI * 2); g.fillStyle = X.shadeHex(c, (r() - 0.5) * 0.3); g.fill(); }
  } else if (kind === 'pine') {
    for (let k = 0; k < 3; k++) { const rr = s * (1 - k * 0.3); g.beginPath(); for (let j = 0; j < 18; j++) { const a = j * Math.PI / 9 + k * 0.3, q = j % 2 ? rr * 0.84 : rr; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fillStyle = X.shadeHex('#2c5a3a', k * 0.1); g.fill(); }
    g.beginPath(); g.arc(x, y, s * 0.12, 0, Math.PI * 2); g.fillStyle = '#5a3d22'; g.fill();
  } else if (kind === 'rock' || kind === 'ice') {
    g.beginPath(); for (let j = 0; j < 7; j++) { const a = j * Math.PI * 2 / 7, q = s * (0.7 + r() * 0.4); g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.8); } g.closePath();
    g.fillStyle = kind === 'ice' ? '#dceef5' : X.pickR(r, C.rock); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
  } else if (kind === 'reed') {
    g.strokeStyle = '#6f7d3a'; g.lineWidth = 1.2;
    for (let j = 0; j < 6; j++) { const dx = (j - 2.5) * 1.6; g.beginPath(); g.moveTo(x + dx, y + s * 0.5); g.lineTo(x + dx + (r() - 0.5) * 3, y - s); g.stroke(); }
  } else if (kind === 'stump' || kind === 'post' || kind === 'bollard') {
    g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.fillStyle = kind === 'bollard' ? '#2e3338' : '#7a5530'; g.fill();
    g.beginPath(); g.arc(x - s * 0.15, y - s * 0.15, s * 0.25, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
  } else if (kind === 'buoy') {
    g.beginPath(); g.arc(x, y, s * 0.6, 0, Math.PI * 2); g.fillStyle = '#e8562a'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
  } else if (kind === 'lamp') {
    g.beginPath(); g.arc(x, y, s * 0.35, 0, Math.PI * 2); g.fillStyle = '#333'; g.fill(); g.beginPath(); g.arc(x, y, s * 0.18, 0, Math.PI * 2); g.fillStyle = '#ffe9a8'; g.fill();
  } else if (kind === 'crate') {
    g.fillStyle = '#9a7246'; g.fillRect(x - s * 0.6, y - s * 0.6, s * 1.2, s * 1.2); g.strokeStyle = '#5e4124'; g.lineWidth = 1; g.strokeRect(x - s * 0.6, y - s * 0.6, s * 1.2, s * 1.2);
  } else if (kind === 'palm') {
    g.strokeStyle = '#3f7a35'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3 + r() * 0.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6 - 2, x + Math.cos(a) * s, y + Math.sin(a) * s); g.stroke(); }
    g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fillStyle = '#7a5530'; g.fill();
  } else if (kind === 'bench') {
    g.fillStyle = '#7a5530'; g.fillRect(x - s, y - s * 0.3, 2 * s, s * 0.6); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.8; g.strokeRect(x - s, y - s * 0.3, 2 * s, s * 0.6);
  } else if (kind === 'container') {
    const c = X.pickR(r, C.box);
    g.fillStyle = c; g.fillRect(x - s * 1.2, y - s * 0.5, s * 2.4, s); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.8;
    for (let j = 1; j < 8; j++) { g.beginPath(); g.moveTo(x - s * 1.2 + j * s * 0.3, y - s * 0.5); g.lineTo(x - s * 1.2 + j * s * 0.3, y + s * 0.5); g.stroke(); }
  } else if (kind === 'house') {
    const c = X.pickR(r, C.house);
    g.fillStyle = c; g.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4);
    g.fillStyle = X.shadeHex(c, -0.25); g.fillRect(x - s, y - s * 0.7, s * 2, s * 0.7);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.stroke();
  }
  g.restore();
}

function drawDockExt(g, x, y, L, flip = false) {
  g.save();
  if (flip) { g.translate(0, 2 * y); g.scale(1, -1); }
  if (L && L.concreteSlips) {
    g.fillStyle = '#8d9094'; g.fillRect(x - 24, y - 22, 48, 8); g.fillRect(x - 24, y - 22, 7, 32); g.fillRect(x + 17, y - 22, 7, 32);
    g.fillStyle = '#2e3338'; for (const dx of [-20, 20]) { g.beginPath(); g.arc(x + dx, y - 26, 3.2, 0, Math.PI * 2); g.fill(); }
  } else if (L && L.wood) {
    g.beginPath(); g.rect(x - 22, y - 16, 44, 6); g.rect(x - 22, y - 16, 6, 26); g.rect(x + 16, y - 16, 6, 26); g.rect(x - 22, y - 22, 44, 6);
    X.fillTex(g, L.wood, { lum: 0.1, scale: 0.25, rot: 90 });
    g.strokeStyle = 'rgba(30,20,10,0.5)'; g.lineWidth = 1; g.strokeRect(x - 22, y - 22, 44, 12);
  } else {
    g.fillStyle = '#6f5033'; g.fillRect(x - 22, y - 16, 44, 6); g.fillRect(x - 22, y - 16, 6, 26); g.fillRect(x + 16, y - 16, 6, 26);
    g.fillStyle = '#8a6a44'; g.fillRect(x - 22, y - 22, 44, 6);
  }
  g.fillStyle = 'rgba(122,205,145,.36)'; g.fillRect(x - 15, y - 10, 30, 18);
  if (flip) { g.restore(); g.save(); y += 60; }
  g.font = `800 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText('Dock').width + 8;
  g.fillStyle = 'rgba(255,255,255,0.88)'; X.rrect(g, x - tw / 2, y - 37, tw, 14, 3); g.fill();
  g.fillStyle = '#22303a'; g.fillText('Dock', x, y - 30);
  g.restore();
}

function drawSlipExt(g, x, y, active, slot, L, flip = false) {
  g.save();
  if (flip) { g.translate(0, 2 * y); g.scale(1, -1); }
  const hw = Math.min(15, slot / 2 - 5);
  if (L && L.concreteSlips) { g.fillStyle = active ? '#e7b24a' : '#9a9da1'; g.fillRect(x - hw, y - 2, 2 * hw, 22); g.strokeStyle = 'rgba(30,30,30,.35)'; g.lineWidth = 1; g.strokeRect(x - hw, y - 2, 2 * hw, 22); }
  else if (L && L.wood && !active) {
    g.beginPath(); g.rect(x - hw, y - 2, 2 * hw, 22); X.fillTex(g, L.wood, { lum: 0.16, scale: 0.22 });
    g.strokeStyle = 'rgba(40,30,18,.45)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - hw, y - 2 + k * 6); g.lineTo(x + hw, y - 2 + k * 6); g.stroke(); }
  } else {
    g.fillStyle = active ? '#e7b24a' : '#9c7a53'; g.fillRect(x - hw, y - 2, 2 * hw, 22);
    g.strokeStyle = 'rgba(40,30,18,.4)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - hw, y - 2 + k * 6); g.lineTo(x + hw, y - 2 + k * 6); g.stroke(); }
  }
  g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2);
  g.fillStyle = active ? 'rgba(255,236,180,.96)' : 'rgba(233,241,247,.94)'; g.fill();
  g.strokeStyle = active ? '#b6801e' : '#4f6c82'; g.lineWidth = 2.5; g.stroke();
  g.restore();
}

function drawBoat(g, x, y, s, b, ghost) {
  g.save(); g.translate(x, y); g.scale(s, s);
  if (ghost) g.globalAlpha = 0.45;
  const wx = b.wide ? 9.5 : b.slim ? 4.5 : 7;
  g.beginPath(); g.moveTo(0, -13); g.quadraticCurveTo(wx + 1, -5, wx, 9); g.lineTo(-wx, 9); g.quadraticCurveTo(-wx - 1, -5, 0, -13); g.closePath();
  g.fillStyle = b.hull; g.fill(); g.strokeStyle = b.trim; g.lineWidth = 1.4; g.stroke();
  if (b.logs) { g.strokeStyle = b.trim; g.lineWidth = 0.8; for (const dx of [-3.5, 0, 3.5]) { g.beginPath(); g.moveTo(dx, -10); g.lineTo(dx, 8); g.stroke(); } }
  if (b.cabin) { g.fillStyle = b.cabin; g.fillRect(-4, -3, 8, 8); }
  else if (!b.logs) { g.strokeStyle = b.trim; g.lineWidth = 1; g.beginPath(); g.moveTo(-wx + 2, 1); g.lineTo(wx - 2, 1); g.stroke(); }
  g.restore();
}

function drawKeyExt(g, w, m, rd, L) {
  const K = L ? L.key : KEY_THEMES[0], KY = m.keyY, KH = m.keyH;
  g.save();
  g.fillStyle = K.bg; g.fillRect(0, 0, w, KH);
  g.strokeStyle = K.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, KH); g.lineTo(w, KH); g.stroke();
  g.fillStyle = K.ink; g.font = `800 10px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Drift in one crossing', 8, 12);
  g.strokeStyle = K.tick; g.lineWidth = 1;
  for (const x of m.slipsX) { g.beginPath(); g.moveTo(x, KY - 7); g.lineTo(x, KY + 7); g.stroke(); }
  const cStart = rd.dir > 0 ? 0 : m.slipsX.length - 1;
  const x0 = m.slipsX[cStart], x1 = x0 + rd.driftPx;
  g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, KY - 11); g.lineTo(x0, KY + 11); g.stroke(); g.setLineDash([]);
  g.strokeStyle = K.arrow; g.fillStyle = K.arrow; g.lineWidth = 3; g.lineCap = 'round';
  drawFlowArrow(g, (x0 + x1) / 2, KY, rd.dir, Math.abs(x1 - x0) - 14);
  const boat = L ? L.boat : BOATS[0];
  drawBoat(g, x0, KY, 0.62, boat, true);
  drawBoat(g, x1, KY, 0.62, boat, false);
  g.restore();
}
