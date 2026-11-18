import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';
import { loadEmoji } from '../core/assets.js';
import { primaryOf, splitList, chooseSplit, texPool, makeMaterial, fillMaterial, rectShape, shadeHex } from '../common/_material_kit.js';

const BOARD = { w: 340, h: 436 };
const LOCAL = { w: 188, h: 196 };
const VIEW = { s: 1.0, pad: 9 };
const PW = LOCAL.w * VIEW.s + 2 * VIEW.pad, PH = LOCAL.h * VIEW.s + 2 * VIEW.pad;
const TOP = { x: (BOARD.w - PW) / 2, y: 2, w: PW, h: PH };
const BOTTOM = { x: (BOARD.w - PW) / 2, y: BOARD.h - 2 - PH, w: PW, h: PH };
const CENTER = { x: 94, y: 98 };
const TRAY_R = 84;
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

const HARD = Object.freeze({
  count: 12,
  rIn: 48, rOut: 66,
  minGap: 22,
  phiMin: 60, phiMax: 86,
  devMin: 22, devMax: 34,
  faceMin: 35, faceMax: 50,
  faceP: 0.35,
  errMin: 18,
  travelMin: 26,
  kP: [0.25, 0.4, 0.35],
  posTol: 12,
  rotTol: 15,
  hitR: 14,
  attempts: 30000,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const polar = (r, deg) => ({ x: CENTER.x + r * Math.cos(deg * D2R), y: CENTER.y + r * Math.sin(deg * D2R) });
const norm180 = (deg) => ((deg % 360) + 540) % 360 - 180;

const faceOff = (m, i) => Math.abs(norm180(m.after[i].rot - m.before[i].rot - m.phi));
const seatOff = (m, i) => {
  const c = m.center, ca = Math.cos(m.phi * D2R), sa = Math.sin(m.phi * D2R);
  const dx = m.before[i].x - c.x, dy = m.before[i].y - c.y;
  return Math.hypot(m.after[i].x - (c.x + dx * ca - dy * sa), m.after[i].y - (c.y + dx * sa + dy * ca));
};
function deviantIds(m) {
  const out = [];
  for (let i = 0; i < m.before.length; i++) {
    if (seatOff(m, i) > m.posTol || (m.rotTol !== undefined && faceOff(m, i) > m.rotTol)) out.push(i);
  }
  return out;
}

function seatLayout(rng) {
  const seats = [];
  for (let i = 0; i < HARD.count; i++) {
    let placed = null;
    for (let t = 0; t < 240; t++) {
      const s = { r: rng.uniform(HARD.rIn, HARD.rOut), a: rng.uniform(0, 360) };
      const p = polar(s.r, s.a);
      if (seats.every((q) => dist(polar(q.r, q.a), p) >= HARD.minGap)) { placed = s; break; }
    }
    if (!placed) return null;
    seats.push(placed);
  }
  return seats;
}

function fallback() {
  const phi = 72;
  const seats = Array.from({ length: HARD.count }, (_, i) => ({ r: i % 2 ? 64 : 52, a: 15 + 30 * i }));
  const head = seats.map((_, i) => (37 + 71 * i) % 360);
  const before = seats.map((s) => polar(s.r, s.a));
  const after = seats.map((s) => polar(s.r, s.a + phi));
  const rot = head.map((h, i) => h + phi + (i === 5 ? 42 : 0));
  return {
    task: 'structural_change_localize', board: BOARD,
    center: { ...CENTER }, phi, trayAngle: 24,
    before: before.map((p, i) => ({ x: p.x, y: p.y, rot: head[i] })),
    after: after.map((p, i) => ({ x: p.x, y: p.y, rot: rot[i] })),
    posTol: HARD.posTol, rotTol: HARD.rotTol, hitR: HARD.hitR, answer: [5],
  };
}

export function gate(m) {
  if (m && m.ext && EVAL_KEYS.has(semanticKey(m))) return false;
  if (!m || m.task !== 'structural_change_localize' || m.before?.length !== HARD.count || m.after?.length !== HARD.count) return false;
  if (m.rotTol !== HARD.rotTol || m.posTol !== HARD.posTol) return false;
  const dev = deviantIds(m);
  if (dev.join(',') !== [...m.answer].sort((a, b) => a - b).join(',') || dev.length < 1 || dev.length > 3) return false;
  if (!(Math.abs(m.phi) >= HARD.phiMin && Math.abs(m.phi) <= HARD.phiMax)) return false;
  const c = m.center, ang = (p) => Math.atan2(p.y - c.y, p.x - c.x) / D2R;
  for (const i of dev) {
    const so = seatOff(m, i), fo = faceOff(m, i);
    if (so > 1e-6) {
      const off = Math.abs(norm180(ang(m.after[i]) - ang(m.before[i]) - m.phi));
      if (so < HARD.errMin - 0.01 || fo > 1e-6 || off < HARD.devMin - 0.01 || off > HARD.devMax + 0.01) return false;
      if (Math.abs(dist(m.before[i], c) - dist(m.after[i], c)) > 1e-6) return false;
    } else if (fo < HARD.faceMin - 0.01 || fo > HARD.faceMax + 0.01) return false;
  }
  for (const P of [m.before, m.after]) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (dist(P[i], P[j]) < HARD.minGap - 0.5) return false;
  return m.before.every((p, i) => dist(p, m.after[i]) >= HARD.travelMin - 0.5);
}

const EVAL_KEYS = new Set(["structural_change_localize|5|0o.12i.16i.18o.19i.22i>15.3o.7i>3", "structural_change_localize|-4|13o.15o.18i>20.20i.2o>6.5i.7o.9o", "structural_change_localize|5|13i.15i>10.18i.21i.23o.2o>21.8o.9i", "structural_change_localize|-5|14i.16o.18i.1o.20i.23i>4.5i.7i", "structural_change_localize|5|11i.16o>14.19i.22o.2i.5i.7i.9o>18", "structural_change_localize|-5|13o.17i.19o.21o>1.23i.2i.5i>15.8i", "structural_change_localize|5|10o.13i>22.16i.18i>14.20i.23o.3i.7o", "structural_change_localize|4|13i.16i.19o.1o.21i>14.23i.3o.5o", "structural_change_localize|-5|10i>15.13o.16i.18o.1o.23i>4.4i.7i", "structural_change_localize|-4|0i.15o.18i>22.21i.2i>7.4i.6i.8o", "structural_change_localize|-4|10i.12o>16.16i.18o.1i.23o.4o.6i", "structural_change_localize|-6|12i.14i>20.17i.20i.2o>18.4o.7o.9i"]);
function pol(P, r, deg) { return { x: P.C.x + r * Math.cos(deg * D2R), y: P.C.y + r * Math.sin(deg * D2R) }; }
function seatLayoutP(rng, P) {
  const seats = [];
  for (let i = 0; i < HARD.count; i++) {
    let placed = null;
    for (let t = 0; t < 240; t++) {
      const s = { r: rng.uniform(P.rIn, P.rOut), a: rng.uniform(0, 360) };
      const p = pol(P, s.r, s.a);
      if (seats.every((q) => dist(pol(P, q.r, q.a), p) >= HARD.minGap)) { placed = s; break; }
    }
    if (!placed) return null;
    seats.push(placed);
  }
  return seats;
}
function extLayout(rng) {
  const W = BOARD.w, H = BOARD.h, pad = 4;
  const mode = 'stack';
  const sides = rng.pick([0, 0, 8, 12]);
  const trayR = sides ? rng.int(HARD.rOut + 11, HARD.rOut + 14) : rng.int(HARD.rOut + 14, HARD.rOut + 18);
  const Rout = sides ? trayR / Math.cos(Math.PI / sides) : trayR;
  const tickGap = mode === 'side' ? 2 : rng.int(2, 6), tickStep = rng.pick([10, 15, 30]);
  const half = Math.ceil(Rout + tickGap + 6 + 4), Lsz = 2 * half;
  const rOut = HARD.rOut, rIn = HARD.rIn;
  const afterFirst = rng.raw() < 0.35;
  let s, pw, before, after, labelSide;
  if (mode === 'stack') {
    const gap = rng.int(4, 12);
    const sMax = Math.min(1.15, ((H - 4 - gap) / 2 - 2 * pad) / Lsz);
    s = +Math.max(0.92, sMax * rng.uniform(0.9, 1)).toFixed(4);
    pw = Lsz * s + 2 * pad;
    labelSide = rng.raw() < 0.5 ? 'left' : 'right';
    const x = labelSide === 'left' ? rng.uniform(54, Math.max(54, W - pw - 4)) : rng.uniform(4, Math.max(4, W - pw - 54));
    const y0 = rng.uniform(2, Math.max(2, H - 2 - 2 * pw - gap));
    before = { x: +x.toFixed(2), y: +y0.toFixed(2) }; after = { x: +x.toFixed(2), y: +(y0 + pw + gap).toFixed(2) };
  } else {
    const gap = rng.int(3, 6);
    s = +Math.max(0.92, Math.min(1.1, ((W - 4 - gap) / 2 - 2 * pad) / Lsz)).toFixed(4);
    pw = Lsz * s + 2 * pad;
    labelSide = 'top';
    const x0 = rng.uniform(2, Math.max(2, W - 2 - 2 * pw - gap)), y = rng.uniform(20, H - pw - 4);
    before = { x: +x0.toFixed(2), y: +y.toFixed(2) }; after = { x: +(x0 + pw + gap).toFixed(2), y: +y.toFixed(2) };
  }
  if (afterFirst) [before, after] = [{ x: before.x, y: before.y }, { x: after.x, y: after.y }].reverse();
  return { mode, sides, trayR, Rout: +Rout.toFixed(3), rIn, rOut, tickGap, tickStep, L: Lsz, C: { x: half, y: half }, s, pad, pw: +pw.toFixed(3), before, after, labelSide };
}
function generateExt(rng, split) {
  for (let tries = 0; tries < 50; tries++) {
    const lay = extLayout(rng);
    const P = { C: lay.C, rIn: lay.rIn, rOut: lay.rOut };
    const m = generateWith(rng, P);
    if (m && !EVAL_KEYS.has(semanticKey(m))) { m.ext = split; m.layout = lay; m.hitR = +Math.max(HARD.hitR, HARD.hitR * VIEW.s / lay.s).toFixed(3); return m; }
  }
  throw new Error('structural_change_localize: ext generator exhausted');
}
function generateWith(rng, P, attempts = 3000) {
  const u = rng.uniform(0, 1);
  const k = u < HARD.kP[0] ? 1 : u < HARD.kP[0] + HARD.kP[1] ? 2 : 3;
  const kinds = Array.from({ length: k }, () => (rng.uniform(0, 1) < HARD.faceP ? 'face' : 'seat'));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const sampled = seatLayoutP(rng, P);
    if (!sampled) continue;
    const order = rng.shuffle(sampled.map((_, i) => i));
    const seats = order.map((i) => sampled[i]);
    const head = seats.map(() => rng.uniform(0, 360));
    const phi = rng.sign() * rng.uniform(HARD.phiMin, HARD.phiMax);
    const devs = rng.sample(seats.map((_, i) => i), k).sort((a, b) => a - b);
    const before = seats.map((s) => pol(P, s.r, s.a));
    const after = seats.map((s) => pol(P, s.r, s.a + phi));
    const rot = head.map((h) => h + phi);
    let ok = true;
    for (let d = 0; d < k && ok; d++) {
      const di = devs[d], s = seats[di];
      if (kinds[d] === 'face') { rot[di] = head[di] + phi + rng.sign() * rng.uniform(HARD.faceMin, HARD.faceMax); continue; }
      const slot = after[di];
      let landed = null;
      for (let t = 0; t < 60 && !landed; t++) {
        const delta = rng.uniform(HARD.devMin, HARD.devMax);
        const cands = [phi + delta, phi - delta].map((psi) => pol(P, s.r, s.a + psi))
          .filter((p) => dist(p, slot) >= HARD.errMin && dist(p, before[di]) >= HARD.travelMin
            && after.every((q, j) => j === di || dist(q, p) >= HARD.minGap));
        if (cands.length) landed = rng.pick(cands);
      }
      if (!landed) ok = false; else after[di] = landed;
    }
    if (!ok) continue;
    const m = {
      task: 'structural_change_localize', board: BOARD,
      center: { ...P.C }, phi, trayAngle: rng.uniform(0, 360),
      before: before.map((p, i) => ({ x: p.x, y: p.y, rot: head[i] })),
      after: after.map((p, i) => ({ x: p.x, y: p.y, rot: rot[i] })),
      posTol: HARD.posTol, rotTol: HARD.rotTol, hitR: HARD.hitR, answer: devs.slice(),
    };
    if (deviantIds(m).join(',') !== devs.join(',')) continue;
    return m;
  }
  return null;
}

export default {
  meta: {
    name: 'structural_change_localize', family: 'D', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', id: 'object id 0..11' }],
    promptHuman: 'Tap items that did not turn with the tray',
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs && _knobs.ext) return generateExt(rng, _knobs.ext);
    const m = generateWith(rng, { C: CENTER, rIn: HARD.rIn, rOut: HARD.rOut }, HARD.attempts);
    return m || fallback();
  },

  init() { return { selected: [] }; },

  applyAction(state, action, manifest) {
    if (action.op !== 'toggle' || !Number.isInteger(action.id) || action.id < 0 || action.id >= manifest.before.length) return { ok: false, reason: 'bad-id' };
    const i = state.selected.indexOf(action.id);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(action.id);
    return { ok: true };
  },

  verify(state, manifest) {
    const want = new Set(deviantIds(manifest));
    const got = new Set(state.selected);
    const hit = [...got].filter((i) => want.has(i)).length;
    const fp = [...got].filter((i) => !want.has(i)).length;
    return {
      success: got.size === want.size && hit === want.size,
      partial: want.size ? Math.max(0, (hit - fp) / want.size) : 0,
      error: want.size - hit + fp,
      detail: { found: hit, falsePositive: fp, required: want.size, selections: state.selected.length },
    };
  },

  oracle(manifest) { return deviantIds(manifest).map((id) => ({ op: 'toggle', id })); },

  randomPolicy(m, rnd) {
    const ids = m.before.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, 1 + Math.floor(rnd() * 3)).map((id) => ({ op: 'toggle', id }));
  },

  async mount(env) { if (env && env.style) env.assets.g15 = await mountLook(env); },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap items that did not turn with the tray', 'Wrong spot or wrong facing - tap them in After');
  },

  _icon(g, x, y, type, rotDeg) {
    g.save(); g.translate(x, y); g.rotate(rotDeg * D2R); g.scale(0.9, 0.9);
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (type === 0) {
      g.fillStyle = '#c9424f'; g.fillRect(-11, -7, 21, 14);
      g.fillStyle = '#8e2b36'; g.fillRect(-11, -7, 4, 14);
      g.fillStyle = '#f4e7d6'; g.fillRect(8, -6, 2, 12);
      g.fillStyle = '#e8c15a'; g.fillRect(1, -7, 3, 5);
    } else if (type === 1) {
      g.strokeStyle = '#2f7fc4'; g.lineWidth = 2.4;
      g.beginPath(); g.arc(8, 0, 4.6, -1.35, 1.35); g.stroke();
      g.fillStyle = '#2f7fc4'; g.beginPath(); g.arc(-1, 0, 8, 0, TAU); g.fill();
      g.fillStyle = '#dceaf6'; g.beginPath(); g.arc(-1, 0, 4.6, 0, TAU); g.fill();
    } else if (type === 2) {
      g.strokeStyle = '#2f6f42'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-11, 4); g.lineTo(9, -4); g.stroke();
      g.fillStyle = '#3d9a5c';
      for (const t of [0.22, 0.54, 0.86]) {
        const px = -11 + 20 * t, py = 4 - 8 * t;
        g.beginPath(); g.ellipse(px + 1, py - 4.5, 5, 3.2, -0.38 + t, 0, TAU); g.fill();
      }
    } else if (type === 3) {
      g.strokeStyle = '#8b959c'; g.lineWidth = 2.8;
      g.beginPath(); g.arc(-7.5, 0, 4.2, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-3.3, 0); g.lineTo(11, 0); g.stroke();
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(4, 0); g.lineTo(4, 5); g.moveTo(9, 0); g.lineTo(9, 5.5); g.stroke();
    } else if (type === 4) {
      g.fillStyle = '#e0a327'; g.fillRect(-10, -3.2, 15, 6.4);
      g.fillStyle = '#d97f8f'; g.fillRect(-12, -3, 2.6, 6);
      g.fillStyle = '#f2e3c6'; g.beginPath(); g.moveTo(5, -3.2); g.lineTo(11.5, 0); g.lineTo(5, 3.2); g.closePath(); g.fill();
      g.fillStyle = '#3a3128'; g.beginPath(); g.moveTo(9.4, -1.1); g.lineTo(11.5, 0); g.lineTo(9.4, 1.1); g.closePath(); g.fill();
    } else if (type === 5) {
      g.fillStyle = '#46525d'; g.beginPath();
      const w = 11, h = 6.6, rr2 = 2.4;
      g.moveTo(-w + rr2, -h); g.arcTo(w, -h, w, h, rr2); g.arcTo(w, h, -w, h, rr2);
      g.arcTo(-w, h, -w, -h, rr2); g.arcTo(-w, -h, w, -h, rr2); g.closePath(); g.fill();
      g.fillStyle = '#c3d3de'; g.fillRect(-8, -4.4, 14.5, 8.8);
      g.fillStyle = '#9fb0bd'; g.beginPath(); g.arc(8.6, 0, 1.5, 0, TAU); g.fill();
    } else if (type === 6) {
      g.fillStyle = '#29a3a3';
      g.beginPath(); g.ellipse(-6.5, 0, 5.4, 4.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#1d7f7f'; g.fillRect(-2.5, -1.5, 13.5, 3);
      g.fillStyle = '#bfe6e6'; g.beginPath(); g.ellipse(-6.5, 0, 2.8, 2, 0, 0, TAU); g.fill();
    } else if (type === 7) {
      g.fillStyle = '#8a5bc0'; g.beginPath(); g.moveTo(11.5, 0); g.lineTo(-3, -7.5); g.lineTo(-3, 7.5); g.closePath(); g.fill();
      g.fillStyle = '#5a3487'; g.fillRect(-8, -2.8, 5.5, 5.6);
    } else if (type === 8) {
      g.fillStyle = '#ef7d24';
      g.beginPath(); g.ellipse(1.5, 0, 8.5, 5.4, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-5, 0); g.lineTo(-11.5, -6); g.lineTo(-11.5, 6); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(5.6, -1.6, 1.8, 0, TAU); g.fill();
      g.fillStyle = '#3a2412'; g.beginPath(); g.arc(6, -1.6, 0.9, 0, TAU); g.fill();
    } else if (type === 9) {
      g.fillStyle = '#8a5a35';
      g.beginPath(); g.moveTo(-10, -10); g.lineTo(-2, -10); g.lineTo(-2, -1); g.lineTo(7, 0.5);
      g.quadraticCurveTo(11.5, 1.5, 11, 7); g.lineTo(-10, 7); g.closePath(); g.fill();
      g.fillStyle = '#4e3018'; g.fillRect(-10, 5, 21, 3);
      g.fillStyle = '#c99a6a'; g.fillRect(-10, -10, 8, 2.4);
    } else if (type === 10) {
      g.fillStyle = '#26262b';
      for (const [wx, wy] of [[-6.5, -6.6], [-6.5, 4.2], [5, -6.6], [5, 4.2]]) g.fillRect(wx, wy, 4.4, 2.4);
      g.fillStyle = '#d6409f'; g.beginPath(); g.roundRect(-11, -5.4, 22, 10.8, [2.5, 5, 5, 2.5]); g.fill();
      g.fillStyle = '#f6d2ea'; g.fillRect(2.5, -4, 3.2, 8);
      g.fillStyle = '#a32b78'; g.fillRect(-7.5, -4, 8.5, 8);
    } else {
      g.fillStyle = '#f2cc1f'; g.strokeStyle = '#9a7d00'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-11, -6); g.lineTo(1, -6); g.lineTo(-1.5, -1); g.lineTo(11.5, 1.5);
      g.lineTo(-3, 8); g.lineTo(-0.5, 2.5); g.lineTo(-11, 2.5); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  },

  _panel(g, env, rect, pts, trayAngle, isAfter) {
    const { manifest: m, state } = env;
    const C = m.center;
    g.save();
    g.beginPath(); g.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    g.fillStyle = '#f7f8fa'; g.fill(); g.clip();
    g.translate(rect.x + VIEW.pad, rect.y + VIEW.pad); g.scale(VIEW.s, VIEW.s);

    for (let d = 0; d < 360; d += 15) {
      const long = d % 90 === 0;
      const c = Math.cos(d * D2R), s = Math.sin(d * D2R);
      g.strokeStyle = long ? '#7d8d99' : '#aeb9c2'; g.lineWidth = long ? 2 : 1.2;
      g.beginPath();
      g.moveTo(C.x + c * (TRAY_R + (long ? 2 : 4.5)), C.y + s * (TRAY_R + (long ? 2 : 4.5)));
      g.lineTo(C.x + c * (TRAY_R + 8), C.y + s * (TRAY_R + 8));
      g.stroke();
    }

    g.beginPath(); g.arc(C.x, C.y, TRAY_R, 0, TAU);
    g.fillStyle = '#f4f0e7'; g.fill();
    g.strokeStyle = '#cabda6'; g.lineWidth = 1.6; g.stroke();

    g.beginPath(); g.arc(C.x, C.y, 8.5, 0, TAU); g.strokeStyle = '#b3a488'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(C.x, C.y, 3.4, 0, TAU); g.fillStyle = '#8b7550'; g.fill();

    pts.forEach((p, i) => {
      const sel = isAfter && state.selected.includes(i);
      if (sel) {
        g.beginPath(); g.arc(p.x, p.y, HARD.hitR, 0, TAU);
        g.fillStyle = 'rgba(25,145,250,.15)'; g.fill();
        g.strokeStyle = ACCENT; g.lineWidth = 2.2; g.stroke();
      }
      this._icon(g, p.x, p.y, i, p.rot);
      if (sel) {
        g.fillStyle = ACCENT; g.beginPath(); g.arc(p.x + 11, p.y - 11, 5.4, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = `800 8px ${UI_FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('✓', p.x + 11, p.y - 10.5);
        g.textBaseline = 'alphabetic';
      }
    });
    g.restore();
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.g15) { drawStyled(this, g, br, env, env.assets.g15); return; }
    const { manifest: m } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef1f5'; g.fillRect(0, 0, br.w, br.h);
    this._panel(g, env, TOP, m.before, m.trayAngle, false);
    this._panel(g, env, BOTTOM, m.after, m.trayAngle + m.phi, true);
    g.lineWidth = 1; g.strokeStyle = '#cdd5de';
    g.beginPath(); g.roundRect(TOP.x + .5, TOP.y + .5, TOP.w - 1, TOP.h - 1, 8); g.stroke();
    g.strokeStyle = ACCENT; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(BOTTOM.x + .75, BOTTOM.y + .75, BOTTOM.w - 1.5, BOTTOM.h - 1.5, 8); g.stroke();
    g.font = `600 12px ${UI_FONT}`; g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillStyle = '#5b6875'; g.fillText('Before', TOP.x - 10, TOP.y + 8);
    g.fillStyle = '#1b6fb8'; g.fillText('After', BOTTOM.x - 10, BOTTOM.y + 8);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    if (env.manifest.layout) return pointerExt(evt, env);
    const lx = (evt.x - BOTTOM.x - VIEW.pad) / VIEW.s, ly = (evt.y - BOTTOM.y - VIEW.pad) / VIEW.s;
    if (lx < 0 || lx > LOCAL.w || ly < 0 || ly > LOCAL.h) return [];
    const pts = env.manifest.after;
    let best = -1, bd = env.manifest.hitR || HARD.hitR;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - lx, pts[i].y - ly);
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? [{ op: 'toggle', id: best }] : [];
  },

  footerStatus(env) { return `${env.state.selected.length} selected`; },
};

const ICONS = ['airplane', 'rocket', 'key', 'old_key', 'hammer', 'wrench', 'scissors', 'guitar', 'pencil', 'paintbrush', 'fountain_pen',
  'kitchen_knife', 'axe', 'broom', 'umbrella', 'flashlight', 'syringe', 'toothbrush', 'trumpet', 'saxophone', 'violin', 'high_heeled_shoe',
  'running_shoe', 'telescope', 'microscope', 'banana', 'carrot', 'hot_pepper', 'eggplant', 'fish', 'dolphin', 'shark', 'crocodile', 'snail',
  'bird', 'dove', 'duck', 'automobile', 'bicycle', 'locomotive', 'sailboat', 'ship', 'tractor', 'helicopter', 'kick_scooter', 'racing_car',
  'ice_cream', 'lollipop', 'mushroom', 'palm_tree', 'cactus', 'evergreen_tree', 'maple_leaf', 'high_voltage', 'light_bulb', 'bell', 'crayon',
  'magnet', 'pushpin', 'electric_plug', 'baguette_bread', 'hot_dog', 'ear_of_corn', 'cucumber', 'pear', 'tropical_fish', 'spouting_whale',
  'snake', 'turtle', 'giraffe', 'flamingo', 'parrot', 'penguin', 'police_car', 'taxi', 'fire_engine', 'ambulance', 'delivery_truck',
  'motorcycle', 'small_airplane', 'speedboat', 'canoe', 'anchor', 'battery'];
const TRAY_USE = ['wood', 'stone', 'metal', 'floor'];
const ICON_PX = 22;
function hueOf(img) {
  const c = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 24, height: 24 }) : new OffscreenCanvas(24, 24);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let sx = 0, sy = 0, n = 0, grey = 0, lsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    lsum += (mx + mn) / 2;
    if (mx - mn < 0.18) { grey++; continue; }
    let h = mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4;
    h *= Math.PI / 3; sx += Math.cos(h); sy += Math.sin(h); n++;
  }
  if (n < grey * 0.6) return lsum / Math.max(1, n + grey) < 0.35 ? 'dark' : 'grey';
  const deg = ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360;
  return `h${Math.floor(((deg + 15) % 360) / 30)}`;
}
async function mountLook(env) {
  const st = env.style;
  const pool = splitList('g15_structural_change_icons', ICONS.filter((sl) => env.index?.emoji?.[sl]), st.split, 10);
  const set = chooseSplit(st, 'g15_structural_change_emoji_set', ['twemoji', 'openmoji'], 1);
  const order = pool.map((sl) => [st.rand(), sl]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const picked = [], bins = new Set(), rest = [];
  for (const sl of order) {
    if (picked.length >= HARD.count) break;
    let img; try { img = await loadEmoji(env.index, sl, set, 96); } catch { continue; }
    const bin = hueOf(img);
    if (bins.has(bin)) { rest.push({ sl, img }); continue; }
    bins.add(bin); picked.push({ sl, img });
  }
  while (picked.length < HARD.count && rest.length) picked.push(rest.shift());
  const trays = texPool(st, TRAY_USE);
  const tray = await makeMaterial(st, st.primary('tex', (t) => trays.includes(t)), { scale: [0.22, 0.4], rotate: false });
  const tables = texPool(st, ['wood', 'fabric', 'stone', 'floor', 'flat2d']);
  const table = await makeMaterial(st, tables[Math.floor(st.rand() * tables.length)], { scale: [0.3, 0.5], rotate: false });
  const build = chooseSplit(st, 'g15_structural_change_tray', ['disc', 'rimmed', 'inlay', 'twotone'], 1);
  const trayL = 0.5 + st.rand() * 0.32;
  st.note(`g15_structural_change_icons:${picked.map((p) => p.sl).join('+')}`);
  return { icons: picked.map((p) => p.img), tray, table, trayL, tableL: 0.72 + st.rand() * 0.16, darkTray: trayL < 0.62, build };
}
function layoutOf(m) {
  if (m && m.layout) {
    const Lz = m.layout, pw = Lz.L * Lz.s + 2 * Lz.pad;
    return { ...Lz, Lw: Lz.L, Lh: Lz.L, before: { x: Lz.before.x, y: Lz.before.y, w: pw, h: pw }, after: { x: Lz.after.x, y: Lz.after.y, w: pw, h: pw } };
  }
  return { mode: 'stack', sides: 0, trayR: TRAY_R, Rout: TRAY_R, rIn: HARD.rIn, rOut: HARD.rOut, tickGap: 2, tickStep: 15,
    Lw: LOCAL.w, Lh: LOCAL.h, C: CENTER, s: VIEW.s, pad: VIEW.pad, before: TOP, after: BOTTOM, labelSide: 'left' };
}
function pointerExt(evt, env) {
  const m = env.manifest, G = layoutOf(m), A = G.after;
  const lx = (evt.x - A.x - G.pad) / G.s, ly = (evt.y - A.y - G.pad) / G.s;
  if (lx < 0 || lx > G.Lw || ly < 0 || ly > G.Lh) return [];
  let best = -1, bd = m.hitR || HARD.hitR;
  m.after.forEach((p, i) => { const d = Math.hypot(p.x - lx, p.y - ly); if (d < bd) { bd = d; best = i; } });
  return best >= 0 ? [{ op: 'toggle', id: best }] : [];
}
function drawStyled(T, g, br, env, L) {
  const { manifest: m } = env;
  const G = layoutOf(m);
  g.save(); g.translate(br.x, br.y);
  fillMaterial(g, L.table, rectShape(0, 0, br.w, br.h), { target: 0.9, contrastK: 0.4, desat: 0.5 });
  panelStyled(g, env, L, G, G.before, m.before, m.trayAngle, false);
  panelStyled(g, env, L, G, G.after, m.after, m.trayAngle + m.phi, true);
  const B = G.before, A = G.after;
  g.lineWidth = 1; g.strokeStyle = 'rgba(60,70,80,.45)';
  g.beginPath(); g.roundRect(B.x + .5, B.y + .5, B.w - 1, B.h - 1, 8); g.stroke();
  g.strokeStyle = ACCENT; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(A.x + .75, A.y + .75, A.w - 1.5, A.h - 1.5, 8); g.stroke();
  g.font = `600 12px ${UI_FONT}`;
  const label = (r, text, col) => {
    g.fillStyle = col;
    if (G.labelSide === 'top') { g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(text, r.x + 4, r.y - 3); }
    else if (G.labelSide === 'right') { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(text, r.x + r.w + 10, r.y + 8); }
    else { g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(text, r.x - 10, r.y + 8); }
  };
  label(B, 'Before', '#5b6875'); label(A, 'After', '#1b6fb8');
  g.restore();
}
function trayPath(G) {
  return (gg) => {
    gg.beginPath();
    if (!G.sides) { gg.arc(0, 0, G.trayR, 0, TAU); return; }
    for (let k = 0; k < G.sides; k++) { const a = (k + 0.5) / G.sides * TAU; const x = Math.cos(a) * G.Rout, y = Math.sin(a) * G.Rout; if (k) gg.lineTo(x, y); else gg.moveTo(x, y); }
    gg.closePath();
  };
}
function panelStyled(g, env, L, G, rect, pts, trayAngle, isAfter) {
  const { manifest: m, state } = env;
  const C = m.center;
  g.save();
  g.beginPath(); g.roundRect(rect.x, rect.y, rect.w, rect.h, 8); g.clip();
  fillMaterial(g, { ...L.table, ox: L.table.ox - rect.x, oy: L.table.oy - rect.y }, rectShape(rect.x, rect.y, rect.w, rect.h), { target: L.tableL, contrastK: 0.75, desat: 0.3 });
  g.translate(rect.x + G.pad, rect.y + G.pad); g.scale(G.s, G.s);
  const R0 = G.Rout + G.tickGap;
  for (let d = 0; d < 360; d += G.tickStep) {
    const long = d % 90 === 0;
    const c = Math.cos(d * D2R), s = Math.sin(d * D2R);
    g.strokeStyle = long ? '#3e4a54' : '#6d7a85'; g.lineWidth = long ? 2 : 1.2;
    g.beginPath();
    g.moveTo(C.x + c * (long ? R0 : R0 + 2.5), C.y + s * (long ? R0 : R0 + 2.5));
    g.lineTo(C.x + c * (R0 + 6), C.y + s * (R0 + 6));
    g.stroke();
  }
  g.save(); g.translate(C.x, C.y); g.rotate(trayAngle * D2R);
  const tray = trayPath(G);
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
  tray(g); g.fillStyle = '#888'; g.fill();
  g.shadowColor = 'transparent';
  fillMaterial(g, L.tray, tray, { target: L.trayL, contrastK: 0.55, desat: 0.35 });
  const disc = (r) => (gg) => { gg.beginPath(); gg.arc(0, 0, r, 0, TAU); };
  if (L.build === 'twotone') {
    const r2 = G.rIn - 12;
    fillMaterial(g, { ...L.tray, ox: L.tray.ox + 150 }, disc(r2), { target: Math.min(0.92, L.trayL + 0.14), contrastK: 0.5, desat: 0.35 });
    disc(r2)(g); g.strokeStyle = 'rgba(40,32,24,.35)'; g.lineWidth = 1; g.stroke();
  }
  if (L.build === 'inlay') {
    for (const r of [G.rIn + 3, G.trayR - 10]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.strokeStyle = L.darkTray ? 'rgba(255,240,215,.35)' : 'rgba(60,40,20,.3)'; g.lineWidth = 1.4; g.stroke(); }
  }
  if (L.build === 'rimmed') {
    g.save(); g.scale((G.trayR - 2.5) / G.trayR, (G.trayR - 2.5) / G.trayR);
    tray(g); g.strokeStyle = 'rgba(30,22,14,.38)'; g.lineWidth = 5; g.stroke(); g.restore();
  }
  tray(g); g.strokeStyle = 'rgba(40,32,24,.55)'; g.lineWidth = 1.6; g.stroke();
  const k = (G.rIn - 12) / 29;
  g.restore();
  g.beginPath(); g.arc(C.x, C.y, 8.5 * Math.min(1, k), 0, TAU); g.strokeStyle = L.darkTray ? '#e9dcc0' : '#6f5f45'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.arc(C.x, C.y, 3.4, 0, TAU); g.fillStyle = L.darkTray ? '#e9dcc0' : '#5e4a2c'; g.fill();
  pts.forEach((p, i) => {
    const sel = isAfter && state.selected.includes(i);
    if (sel) {
      g.beginPath(); g.arc(p.x, p.y, HARD.hitR, 0, TAU);
      g.fillStyle = 'rgba(25,145,250,.18)'; g.fill();
      g.strokeStyle = ACCENT; g.lineWidth = 2.2; g.stroke();
    }
    const img = L.icons[i % L.icons.length];
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot * D2R);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 2; g.shadowOffsetY = 1;
    g.drawImage(img, -ICON_PX / 2, -ICON_PX / 2, ICON_PX, ICON_PX);
    g.restore();
    if (sel) {
      g.fillStyle = ACCENT; g.beginPath(); g.arc(p.x + 11, p.y - 11, 5.4, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.font = `800 8px ${UI_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✓', p.x + 11, p.y - 10.5);
      g.textBaseline = 'alphabetic';
    }
  });
  g.restore();
}

export function semanticKey(m) {
  const C = m.center, a = (p) => Math.round(((Math.atan2(p.y - C.y, p.x - C.x) / D2R) + 360) % 360 / 15) % 24;
  const dev = new Set(deviantIds(m));
  const mid = m.before.length === 8 ? 48.5 : (HARD.rIn + HARD.rOut) / 2;
  const seats = m.before.map((p, i) => `${a(p)}${Math.hypot(p.x - C.x, p.y - C.y) > mid ? 'o' : 'i'}${dev.has(i) ? '>' + a(m.after[i]) : ''}`).sort();
  return `structural_change_localize|${Math.round(m.phi / 15)}|${seats.join('.')}`;
}
