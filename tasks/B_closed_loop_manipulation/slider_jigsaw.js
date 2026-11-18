import { bgByTag, loadImage } from '../core/assets.js';
import { drawPromptText, rr, UI_FONT, ACCENT } from '../core/panel.js';
import { hash32, nthOf } from '../core/style.js';
import { SHAPES as JIG_SHAPES, shapesIn, clearlyDifferent } from '../common/_slider_jigsaw_look.js';

const BOARD = { w: 340, h: 250 };
const PIECE = 52;
const TAB = 10;
const X_RANGE = [6, 282];
const GAP_X = [84, BOARD.w - PIECE - TAB - 14];
const GAP_Y = [24, BOARD.h - PIECE - 22];
const DECOY_X = [84, BOARD.w - PIECE - TAB - 4];
const BG_TAGS = ['landscape', 'city', 'nature', 'water', 'architecture', 'indoor', 'desk'];
const HARD = { tol: 5 };
const MIN_SEP = PIECE + TAB + 10;

function piecePath(g, x, y, s = PIECE, t = TAB) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + s * 0.35, y);
  g.arc(x + s * 0.5, y, t, Math.PI, 0, false);
  g.lineTo(x + s, y);
  g.lineTo(x + s, y + s * 0.35);
  g.arc(x + s, y + s * 0.5, t, -Math.PI / 2, Math.PI / 2, false);
  g.lineTo(x + s, y + s);
  g.lineTo(x, y + s);
  g.closePath();
}

export const DECOY_CODES = ['ffff', 'iiff', 'ifff', 'fiff', 'oiif', 'ioif', 'fofi', 'offi'];
function codePath(g, x, y, code, s = PIECE, t = TAB) {
  const corners = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  g.beginPath(); g.moveTo(x, y);
  for (let e = 0; e < 4; e++) {
    const P0 = corners[e], P1 = corners[(e + 1) % 4], u = [(P1[0] - P0[0]) / s, (P1[1] - P0[1]) / s], c = code[e];
    if (c !== 'f') {
      const dir = c === 'o' ? 1 : -1, n = normals[e], m = s / 2, cx = P0[0] + u[0] * m, cy = P0[1] + u[1] * m, a0 = Math.atan2(-u[1], -u[0]);
      g.lineTo(cx - u[0] * t, cy - u[1] * t);
      g.arc(cx, cy, t, a0, a0 + Math.PI, (u[0] * n[1] - u[1] * n[0]) * dir > 0);
    }
    g.lineTo(...P1);
  }
  g.closePath();
}

function extGeometry(piece) {
  const tab = Math.round(piece * 0.19);
  const a = 32 - piece / 2;
  return { piece, tab, xRange: [a, a + 276], gapX: [84, BOARD.w - piece - tab - 14],
    gapY: [Math.max(24, tab + 14), BOARD.h - piece - 22], minSep: piece + tab + 10, decoyX: [84, BOARD.w - piece - tab - 4] };
}
const apart = (a, b, G) => Math.abs(a.x - b.x) >= G.piece + G.tab + 6 || Math.abs(a.y - b.y) >= G.piece + G.tab + 6;
function layoutHoles(rng, G, nDecoy, cell = null) {
  for (;;) {
    const gap = cell ? { x: rng.int(...cell.x), y: rng.int(...cell.y) } : { x: rng.int(G.gapX[0], G.gapX[1]), y: rng.int(G.gapY[0], G.gapY[1]) };
    const decoys = [];
    for (let k = 0; k < nDecoy; k++) {
      let d = null;
      for (let t = 0; t < 80 && !d; t++) {
        const c = { x: rng.int(G.decoyX[0], G.decoyX[1]), y: rng.int(G.gapY[0], G.gapY[1]) };
        if (Math.abs(c.x - gap.x) >= G.minSep && decoys.every((o) => apart(o, c, G))) d = c;
      }
      if (!d) break;
      decoys.push(d);
    }
    if (decoys.length === nDecoy) return { gap, decoys };
  }
}
const DEFAULT_G = { piece: PIECE, tab: TAB, gapX: GAP_X, gapY: GAP_Y, minSep: MIN_SEP, decoyX: DECOY_X };

const RP = 40, RT = 8;
const R_XRANGE = extGeometry(RP).xRange;
const N_GAPS = 4;
const R_G = { piece: RP, tab: RT, minSep: RP + 2 * RT + 10,
  gapX: [R_XRANGE[0] + RP + RT + 10 + RT, BOARD.w - 4 - RT - RP],
  gapY: [24, BOARD.h - RP - 22] };
R_G.decoyX = R_G.gapX;
const STRIP = 46;
const PANEL_BOARD_H = BOARD.h + 10 + STRIP;
const ROT_BTN = { x: (BOARD.w - 170) / 2, y: BOARD.h + 6, w: 170, h: 36 };

const KINDS = ['o', 'i', 'f'];
const ALL_CODES = KINDS.flatMap((a) => KINDS.flatMap((b) => KINDS.flatMap((c) => KINDS.map((d) => a + b + c + d))));
export const turnCode = (code, k) => [0, 1, 2, 3].map((e) => code[(e - k + 8) % 4]).join('');
const kindsOf = (code) => [...code].sort().join('');
export const PIECE_CODES = ALL_CODES.filter((c) => new Set(c).size === 3);
export function sameKindDecoys(code) {
  const turns = new Set([0, 1, 2, 3].map((k) => turnCode(code, k)));
  return ALL_CODES.filter((c) => kindsOf(c) === kindsOf(code) && !turns.has(c));
}
const isRow = (m) => Number.isInteger(m?.rot0);
const turnedBy = (state, m) => (isRow(m) ? (m.rot0 + (state.rot || 0)) % 4 : 0);

function generateRow(rng, bgFile) {
  const lo = R_G.gapX[0], hi = R_G.gapX[1], S = R_G.minSep;
  const slack = hi - lo - (N_GAPS - 1) * S;
  const cuts = Array.from({ length: N_GAPS }, () => rng.int(0, slack)).sort((a, b) => a - b);
  const xs = cuts.map((c, i) => lo + i * S + c);
  const y = rng.int(R_G.gapY[0], R_G.gapY[1]);
  const ti = rng.int(0, N_GAPS - 1);
  const pieceCode = rng.pick(PIECE_CODES);
  const codes = rng.sample(sameKindDecoys(pieceCode), N_GAPS - 1);
  const rot0 = rng.int(0, 3);
  const gap = { x: xs[ti], y };
  const decoys = xs.filter((_, i) => i !== ti).map((x, j) => ({ x, y, shape: codes[j] }));
  return { task: 'slider_jigsaw', board: BOARD, panel: { boardH: PANEL_BOARD_H }, bgFile, gap, decoys, pieceY: y,
    tol: HARD.tol, xRange: [...R_XRANGE], piece: RP, tab: RT, pieceCode, rot0 };
}
function gateRow(m) {
  if (m.piece !== RP || m.tab !== RT || m.xRange?.[0] !== R_XRANGE[0] || m.xRange[1] !== R_XRANGE[1]) return false;
  if (m.panel?.boardH !== PANEL_BOARD_H || !isRow(m) || m.rot0 < 0 || m.rot0 > 3) return false;
  if (!PIECE_CODES.includes(m.pieceCode)) return false;
  if (!Array.isArray(m.decoys) || m.decoys.length !== N_GAPS - 1 || !holesOk(m, R_G)) return false;
  if (!m.decoys.every((d) => d.y === m.gap.y)) return false;
  const xs = [m.gap, ...m.decoys].map((h) => h.x).sort((a, b) => a - b);
  if (xs.some((x, i) => i > 0 && x - xs[i - 1] < R_G.minSep)) return false;
  const ok = sameKindDecoys(m.pieceCode), codes = m.decoys.map((d) => d.shape);
  return codes.every((c) => ok.includes(c)) && new Set(codes).size === codes.length;
}

const EVAL_KEYS = new Set(['5.0|2.1,2.4', '2.1|4.1,4.4', '4.1|2.0,2.4,6.2', '4.2|2.2,2.4', '5.1|2.0,2.5,3.3', '4.0|2.3,5.2,6.4', '5.4|2.2,3.5', '4.5|2.1,6.1,6.3', '3.4|4.2,6.5', '3.5|5.3,6.0,6.5', '5.5|2.2,3.5', '2.0|4.4,5.1']);
const keySplit = (k) => (hash32(`slider_jigsaw_question|${k}`) % 10 === 0 ? 'test' : 'train');
const CELLS = (lim) => {
  const out = [];
  for (let bx = 0; bx < 8; bx++) for (let by = 0; by < 8; by++) {
    const x = [Math.max(lim.x[0], Math.ceil(bx * BOARD.w / 8)), Math.min(lim.x[1], Math.ceil((bx + 1) * BOARD.w / 8) - 1)];
    const y = [Math.max(lim.y[0], Math.ceil(by * BOARD.h / 8)), Math.min(lim.y[1], Math.ceil((by + 1) * BOARD.h / 8) - 1)];
    if (x[0] <= x[1] && y[0] <= y[1]) out.push({ id: `${bx}.${by}`, x, y });
  }
  return out;
};
const PAIRS = (() => {
  const G = extGeometry(PIECE), out = [];
  for (const g of CELLS({ x: G.gapX, y: G.gapY })) for (const d of CELLS({ x: G.decoyX, y: G.gapY })) {
    if (g.x[1] - d.x[0] >= G.minSep || d.x[1] - g.x[0] >= G.minSep) out.push([g, d]);
  }
  return out;
})();
function generateExt(rng, split, n) {
  const G = extGeometry(PIECE);
  let pi = Number.isFinite(n) ? nthOf(`slider_jigsaw|${split}|cells`, n, PAIRS.length) : Math.floor(rng.raw() * PAIRS.length);
  let pair = PAIRS[pi];
  const cellOf = (h) => `${Math.floor(h.x / BX)}.${Math.floor(h.y / BY)}`;
  const nDecoy = rng.int(2, 3);
  for (let tries = 1; ; tries++) {
    if (tries % 400 === 0) { pi = (pi + 1) % PAIRS.length; pair = PAIRS[pi]; }
    const gap = { x: rng.int(...pair[0].x), y: rng.int(...pair[0].y) };
    const d0 = { x: rng.int(...pair[1].x), y: rng.int(...pair[1].y) };
    if (Math.abs(d0.x - gap.x) < G.minSep) continue;
    const decoys = [d0];
    for (let k = 1; k < nDecoy; k++) {
      let d = null;
      for (let t = 0; t < 80 && !d; t++) {
        const c = { x: rng.int(G.decoyX[0], G.decoyX[1]), y: rng.int(G.gapY[0], G.gapY[1]) };
        if (Math.abs(c.x - gap.x) >= G.minSep && decoys.every((o) => apart(o, c, G)) && cellOf(c) > pair[1].id) d = c;
      }
      if (d) decoys.push(d);
    }
    if (decoys.length !== nDecoy) continue;
    const m = { task: 'slider_jigsaw', board: BOARD, bgFile: null, ext: true, piece: G.piece, tab: G.tab,
      gap, decoys, pieceY: gap.y, tol: HARD.tol, xRange: G.xRange };
    const k = semanticKey(m);
    if (EVAL_KEYS.has(k) || keySplit(k) !== split) continue;
    const pool = shapesIn(split), piece = rng.pick(pool);
    const others = rng.shuffle(pool.filter((x) => x.id !== piece.id && clearlyDifferent(x, piece)));
    decoys.forEach((d, i) => { d.shape = others[i].id; });
    m.pieceShape = piece.id;
    return m;
  }
}

const BX = BOARD.w / 8, BY = BOARD.h / 8;
export function semanticKey(m) {
  const c = (h) => `${Math.floor(h.x / BX)}.${Math.floor(h.y / BY)}`;
  return `${c(m.gap)}|${m.decoys.map(c).sort().join(',')}`;
}

function holesOk(m, G) {
  const { gap, decoys } = m;
  if (!gap || !Array.isArray(decoys) || decoys.length < 2 || decoys.length > 3 || m.pieceY !== gap.y) return false;
  const int = (h) => Number.isInteger(h.x) && Number.isInteger(h.y);
  if (!int(gap) || gap.x < G.gapX[0] || gap.x > G.gapX[1] || gap.y < G.gapY[0] || gap.y > G.gapY[1]) return false;
  if (!decoys.every((d) => int(d) && d.x >= G.decoyX[0] && d.x <= G.decoyX[1] && d.y >= G.gapY[0] && d.y <= G.gapY[1])) return false;
  if (!decoys.every((d) => Math.abs(d.x - gap.x) >= G.minSep)) return false;
  return decoys.every((a, i) => decoys.every((b, j) => i >= j || apart(a, b, G)));
}
function gateExt(m) {
  if (m.piece !== PIECE) return false;
  const G = extGeometry(m.piece);
  if (m.tab !== G.tab || m.xRange?.[0] !== G.xRange[0] || m.xRange[1] !== G.xRange[1] || !holesOk(m, G)) return false;
  const piece = JIG_SHAPES.find((x) => x.id === m.pieceShape);
  const shapes = m.decoys.map((d) => JIG_SHAPES.find((x) => x.id === d.shape));
  return !!piece && shapes.every((x) => x && x.split === piece.split && clearlyDifferent(x, piece)) && new Set(m.decoys.map((d) => d.shape)).size === m.decoys.length;
}

export function gate(m) {
  if (m?.task === 'slider_jigsaw' && m.ext) return m.board?.w === BOARD.w && m.board?.h === BOARD.h && m.tol === HARD.tol && gateExt(m);
  if (m?.task !== 'slider_jigsaw' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || m.tol !== HARD.tol) return false;
  if (typeof m.bgFile !== 'string') return false;
  return gateRow(m);
}

const inBtn = (p) => p.x >= ROT_BTN.x && p.x <= ROT_BTN.x + ROT_BTN.w && p.y >= ROT_BTN.y && p.y <= ROT_BTN.y + ROT_BTN.h;
const rotateActions = (k) => Array.from({ length: k }, () => ({ op: 'rotate' }));

function drawRotateButton(g) {
  const { x, y, w, h } = ROT_BTN;
  g.save();
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(20,60,120,.18)'; g.shadowBlur = 5; g.shadowOffsetY = 1;
  g.fill();
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.strokeStyle = ACCENT; g.lineWidth = 1.5; g.stroke();
  const label = 'Rotate piece 90°';
  g.font = `600 14px ${UI_FONT}`;
  const tw = g.measureText(label).width, iconW = 18, gapW = 8, x0 = x + (w - (iconW + gapW + tw)) / 2;
  const cx = x0 + iconW / 2, cy = y + h / 2, r = 7;
  g.strokeStyle = ACCENT; g.fillStyle = ACCENT; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, r, -0.35 * Math.PI, 1.25 * Math.PI); g.stroke();
  const ax = cx + r * Math.cos(-0.35 * Math.PI), ay = cy + r * Math.sin(-0.35 * Math.PI);
  g.beginPath(); g.moveTo(ax + 4.5, ay - 1.5); g.lineTo(ax - 1, ay - 4.5); g.lineTo(ax - 0.5, ay + 2.5); g.closePath(); g.fill();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(label, x0 + iconW + gapW, cy + 0.5);
  g.restore();
}

export default {
  meta: {
    name: 'slider_jigsaw', family: 'B', 
    boardH: BOARD.h + 10, headerH: 50, footer: 'slider', board: BOARD,
    sliderHint: 'Slide to fit the piece',
    actionSpace: [
      { op: 'slide', v: '0..1 across the piece xRange', final: 'true on release (places the piece; it stays movable until Verify)' },
      { op: 'rotate', note: 'turns the piece 90 deg clockwise (the Rotate button under the photo)' },
    ],
    promptHuman: 'Turn the piece with the Rotate button and slide it into the gap it fits',
  },

  generate(rng, _level, index, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const bg = bgByTag(index, rng.raw, BG_TAGS);
    return generateRow(rng, bg.file);
  },

  init() {
    return { v: 0, released: false, placement: null, rot: 0 };
  },

  applyAction(state, action, manifest) {
    if (action?.op === 'rotate') {
      if (!isRow(manifest)) return { ok: false, reason: 'no-rotate' };
      state.rot = ((state.rot || 0) + 1) % 4;
      return { ok: true };
    }
    if (!action || action.op !== 'slide') return { ok: false, reason: 'bad-op' };
    if (!Number.isFinite(action.v) || (action.final !== undefined && typeof action.final !== 'boolean')) {
      return { ok: false, reason: 'bad-value' };
    }
    state.v = Math.min(1, Math.max(0, action.v));
    if (action.final || state.released) { state.placement = state.v; state.released = true; }
    return { ok: true };
  },

  pieceX(v, manifest) {
    const [a, b] = manifest.xRange;
    return a + v * (b - a);
  },

  verify(state, manifest) {
    const v = state.placement;
    const complete = state.released === true && Number.isFinite(v);
    const px = complete ? this.pieceX(v, manifest) : null;
    const err = complete ? Math.abs(px - manifest.gap.x) : BOARD.w;
    const turned = turnedBy(state, manifest), upright = turned === 0;
    return { success: complete && err <= manifest.tol && upright,
      error: +err.toFixed(2),
      partial: Math.max(0, 1 - err / BOARD.w) * (upright ? 1 : 0.5),
      detail: { complete, upright, turned, atDecoy: complete && manifest.decoys.some((d) => Math.abs(px - d.x) <= manifest.tol) } };
  },

  oracle(manifest) {
    const [a, b] = manifest.xRange;
    const k = isRow(manifest) ? (4 - manifest.rot0) % 4 : 0;
    return [...rotateActions(k), { op: 'slide', v: +((manifest.gap.x - a) / (b - a)).toFixed(4), final: true }];
  },

  randomPolicy(manifest, rnd) {
    const [a, b] = manifest.xRange;
    const k = isRow(manifest) ? Math.floor(rnd() * 4) : 0;
    const holes = [manifest.gap, ...manifest.decoys];
    const t = holes[Math.floor(rnd() * holes.length)];
    return [...rotateActions(k), { op: 'slide', v: (t.x - a) / (b - a), final: true }];
  },

  async mount(env) {
    if (env.style) {
      const m = env.manifest;
      env.assets.jig = await import('../common/_slider_jigsaw_look.js');
      env.assets.look = await env.assets.jig.buildJigsawLook(env.style, BOARD.w, BOARD.h, [m.gap, ...m.decoys], m.piece || PIECE, m.tab || TAB, m.pieceShape || 'ooff');
      return;
    }
    env.assets.background = await loadImage('assets/backgrounds/' + env.manifest.bgFile);
  },

  drawPrompt(g, r, env) {
    if (isRow(env?.manifest)) drawPromptText(g, r, 'Slide the piece into the gap it fits', 'Use the Rotate button to turn the piece first if needed');
    else drawPromptText(g, r, 'Slide the piece into the gap it fits');
  },

  onSlider(env, v, phase, hooks) {
    if (phase === 'move' || phase === 'down') hooks.dispatch({ op: 'slide', v });
    else if (phase === 'up') hooks.dispatch({ op: 'slide', v, final: true });
  },

  pointer(ev, env) {
    if (ev.type !== 'down' || !isRow(env?.manifest) || !inBtn(ev)) return [];
    return [{ op: 'rotate' }];
  },

  drawBoard(g, br, env) {
    const m = env.manifest, img = env.assets.background;
    g.save();
    g.translate(br.x, br.y);
    if (env.style && env.assets.look) {
      env.assets.jig.drawJigsawLook(g, br, env.assets.look, this.pieceX(env.state.v, m), m.pieceY, m.gap);
      g.restore(); return;
    }
    if (isRow(m)) {
      g.fillStyle = '#ffffff'; g.fillRect(0, BOARD.h, br.w, br.h - BOARD.h);
      drawRotateButton(g);
    }
    if (!img) { g.fillStyle = '#dde3ea'; g.fillRect(0, 0, BOARD.w, BOARD.h); g.restore(); return; }
    const ir = img.width / img.height, rr2 = BOARD.w / BOARD.h;
    let sw, sh, sx, sy;
    if (ir > rr2) { sh = img.height; sw = sh * rr2; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / rr2; sx = 0; sy = (img.height - sh) / 2; }
    g.drawImage(img, sx, sy, sw, sh, 0, 0, BOARD.w, BOARD.h);
    const S = m.piece || PIECE, T = m.tab || TAB, pc = m.pieceCode || 'ooff';
    const outline = (x, y, code) => codePath(g, x, y, code, S, T);
    for (const h of [m.gap, ...m.decoys].sort((p, q) => p.x - q.x)) {
      if (h === m.gap || !h.shape) outline(h.x, h.y, pc); else outline(h.x, h.y, h.shape);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.stroke();
    }
    g.lineWidth = 1;
    const px = this.pieceX(env.state.v, m), py = m.pieceY, turned = turnedBy(env.state, m);
    g.save();
    g.translate(px + S / 2, py + S / 2);
    g.rotate(turned * Math.PI / 2);
    outline(-S / 2, -S / 2, pc);
    g.save(); g.clip();
    g.drawImage(img, sx, sy, sw, sh, -S / 2 - m.gap.x, -S / 2 - m.gap.y, BOARD.w, BOARD.h);
    g.restore();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6;
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
    outline(-S / 2, -S / 2, pc);
    g.stroke();
    g.restore();
    g.restore();
  },
};
