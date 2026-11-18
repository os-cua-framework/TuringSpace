import { UI_FONT, drawPromptText } from '../core/panel.js';
import { nthOf } from '../core/style.js';
import { primaryOf, splitList, chooseSplit, texPool, makeMaterial, fillMaterial, rectShape, rrShape, skyWindow, hsl, shadeHex, mixHex, rgba } from '../common/_material_kit.js';

const BOARDH = 440;
const BOARD = { w: 340, h: BOARDH - 10 };
const SEA_Y = 165;
const CTRL_Y = 300;
const KNOB = { range: 30, step: 5 };
const N_DET = KNOB.range / KNOB.step;
const M1 = { x: 88, y: 238, len: 34 };
const EYE = { x: 30, y: 238 };
const M1_REF = 135;
const P2BOX = { x0: 40, x1: 300, y0: 38, y1: SEA_Y - 32 };
const P3BOX = { x0: 26, x1: 314, y0: 34, y1: SEA_Y - 34 };
const M2_LEN = 24;
const M3_LEN = 24;
const BUOY_R = 17;
const ARROW_LEN = 48;
const MISS_M3 = 22;
const TURN_COS = [Math.cos(150 * Math.PI / 180), Math.cos(45 * Math.PI / 180)];
const SLIDER = { x0: 92, x1: 304, ys: [CTRL_Y + 26, CTRL_Y + 64, CTRL_Y + 102], hit: 15 };
const KNOB_GRAB = 18;
const MIRROR_COL = ['#2fa7c9', '#e8922e', '#9b5fd6'];
const MIRROR_NAME = ['Lower mirror', 'Upper mirror', 'Outer mirror'];

const rad = (d) => d * Math.PI / 180;
const angDeg = (v) => Math.atan2(v.y, v.x) * 180 / Math.PI;
const unit = (v) => { const n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; };
function reflect(d, phiDeg) {
  const nx = -Math.sin(rad(phiDeg)), ny = Math.cos(rad(phiDeg));
  const k = 2 * (d.x * nx + d.y * ny);
  return { x: d.x - k * nx, y: d.y - k * ny };
}
function mirrorSeg(c, phiDeg, len) {
  const dx = Math.cos(rad(phiDeg)) * len / 2, dy = Math.sin(rad(phiDeg)) * len / 2;
  return { a: { x: c.x - dx, y: c.y - dy }, b: { x: c.x + dx, y: c.y + dy } };
}
function raySeg(O, d, A, B) {
  const ex = B.x - A.x, ey = B.y - A.y;
  const denom = d.x * ey - d.y * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const gx = A.x - O.x, gy = A.y - O.y;
  const t = (gx * ey - gy * ex) / denom;
  const u = (gx * d.y - gy * d.x) / denom;
  if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) return { x: O.x + d.x * t, y: O.y + d.y * t, t };
  return null;
}

const mirrorsOf = (m) => (m.m3 ? [m.m1, m.m2, m.m3] : [m.m1, m.m2]);
const solutionOf = (m) => (m.m3 ? [m.solution.k0, m.solution.k1, m.solution.k2] : [m.solution.k0, m.solution.k1]);
const startOf = (m) => (m.m3 ? [m.start.k0, m.start.k1, m.start.k2] : [m.start.k0, m.start.k1]);

function trace(m, ks) {
  const ms = mirrorsOf(m);
  const segs = ms.map((mo, i) => mirrorSeg(mo, mo.baseDeg + (ks[i] || 0), mo.len));
  let O = { x: m.eye.x, y: m.eye.y };
  let d = unit({ x: m.m1.x - m.eye.x, y: m.m1.y - m.eye.y });
  let cur = -1;
  const hits = [];
  for (let b = 0; b < 6; b++) {
    let best = null;
    for (let i = 0; i < ms.length; i++) {
      if (i === cur) continue;
      const h = raySeg(O, d, segs[i].a, segs[i].b);
      if (h && (!best || h.t < best.t)) best = { x: h.x, y: h.y, t: h.t, i };
    }
    if (best && O.y <= m.seaY && d.y > 1e-3 && best.y > m.seaY) best = null;
    if (!best) break;
    const dOut = reflect(d, ms[best.i].baseDeg + (ks[best.i] || 0));
    hits.push({ i: best.i, p: { x: best.x, y: best.y }, dOut });
    O = { x: best.x, y: best.y }; d = dOut; cur = best.i;
  }
  const res = { hits, path: hits.map((h) => h.i).join(','), reachedSea: false, hitBuoy: false, seaX: null };
  if (hits.length >= 2 && O.y <= m.seaY && d.y > 1e-3) {
    const seaX = O.x + (m.seaY - O.y) / d.y * d.x;
    res.end = { x: seaX, y: m.seaY }; res.seaX = seaX;
    res.reachedSea = seaX >= 0 && seaX <= m.board.w;
    res.hitBuoy = res.reachedSea && Math.abs(seaX - m.buoy.x) <= m.buoy.r;
  } else {
    res.end = farPoint(O, d);
  }
  return res;
}
function farPoint(O, d) {
  let t = 1e9;
  if (d.x > 1e-6) t = Math.min(t, (BOARD.w - O.x) / d.x);
  if (d.x < -1e-6) t = Math.min(t, (0 - O.x) / d.x);
  if (d.y > 1e-6) t = Math.min(t, (BOARD.h - O.y) / d.y);
  if (d.y < -1e-6) t = Math.min(t, (0 - O.y) / d.y);
  t = Math.max(0, Math.min(t, 1e4));
  return { x: O.x + d.x * t, y: O.y + d.y * t };
}

function auditGrid(m) {
  const n = mirrorsOf(m).length, ks = new Array(n).fill(0);
  let pass = 0, closestMiss = Infinity, sol = null;
  const rec = (j) => {
    if (pass > 1) return;
    if (j === n) {
      const t = trace(m, ks);
      if (t.hitBuoy) { pass++; sol = ks.slice(); }
      else if (t.reachedSea) closestMiss = Math.min(closestMiss, Math.abs(t.seaX - m.buoy.x) - m.buoy.r);
      return;
    }
    for (let a = -N_DET; a <= N_DET; a++) { ks[j] = a * KNOB.step; rec(j + 1); }
  };
  rec(0);
  return { pass, sol, closestMiss };
}
const sameKs = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function turnsOk(t) {
  for (let i = 1; i < t.hits.length; i++) {
    const c = t.hits[i - 1].dOut.x * t.hits[i].dOut.x + t.hits[i - 1].dOut.y * t.hits[i].dOut.y;
    if (c < TURN_COS[0] || c > TURN_COS[1]) return false;
  }
  return true;
}

export function gate(m) {
  if (!m || m.task !== 'periscope_align' || m.knob?.step !== KNOB.step || m.knob?.range !== KNOB.range) return false;
  if (m.ext && (!splitList('g15_periscope_solution', SOL_IDS, m.ext, 12).includes(`${m.solution.k0},${m.solution.k1}`) || EVAL_KEYS.has(semanticKey(m)))) return false;
  const sol = solutionOf(m), n = sol.length;
  if (m.m3 && trace(m, sol).path !== '0,1,2') return false;
  const a = auditGrid(m);
  return a.pass === 1 && sameKs(a.sol, sol) && a.closestMiss >= (m.m3 ? MISS_M3 - 1 : 8) && !sameKs(startOf(m), sol) && n >= 2;
}

export default {
  meta: {
    name: 'periscope_align', family: 'B', 
    boardH: BOARDH, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'set', mirror: '0|1|2', value: 'degrees (multiple of 5)' }],
    promptHuman: 'Tilt the three periscope mirrors so the light lands on the buoy.',
  },

  generate(rng, _level, _index, knobs) {
    if (knobs && knobs.ext) return generateExt(rng, knobs.ext, knobs.n);
    const d0 = unit({ x: M1.x - EYE.x, y: M1.y - EYE.y });
    for (let attempt = 0; attempt < 40000; attempt++) {
      const k0 = rng.int(-N_DET, N_DET) * KNOB.step;
      const k1 = rng.int(-N_DET, N_DET) * KNOB.step;
      const k2 = rng.int(-N_DET, N_DET) * KNOB.step;
      const D12 = rng.int(116, 158);
      const tilt = rng.uniform(-16, 22);
      const m1Base = M1_REF + tilt / 2 - k0;
      const d1 = reflect(d0, m1Base + k0);
      if (d1.y > -0.62) continue;
      const P2 = { x: M1.x + d1.x * D12, y: M1.y + d1.y * D12 };
      if (P2.x < P2BOX.x0 || P2.x > P2BOX.x1 || P2.y < P2BOX.y0 || P2.y > P2BOX.y1) continue;
      const P3 = { x: rng.uniform(P3BOX.x0, P3BOX.x1), y: rng.uniform(P3BOX.y0, P3BOX.y1) };
      const run23 = Math.hypot(P3.x - P2.x, P3.y - P2.y);
      if (Math.abs(P3.x - P2.x) < 70 || run23 < 80 || run23 > 190) continue;
      const tubeLo = Math.min(M1.x, P2.x) - 18, tubeHi = Math.max(M1.x, P2.x) + 18;
      if (P3.x > tubeLo && P3.x < tubeHi) continue;
      const d2 = unit({ x: P3.x - P2.x, y: P3.y - P2.y });
      const buoyX = rng.uniform(40, 300);
      if (Math.abs(buoyX - P3.x) < 46 || Math.abs(buoyX - M1.x) < 36 || Math.abs(buoyX - P2.x) < 36) continue;
      if (P2.y > 104 && buoyX > tubeLo && buoyX < tubeHi) continue;
      const d3 = unit({ x: buoyX - P3.x, y: SEA_Y - P3.y });
      if (d3.y < 0.36) continue;
      const m2Base = (angDeg(d1) + angDeg(d2)) / 2 - k1;
      const m3Base = (angDeg(d2) + angDeg(d3)) / 2 - k2;

      const m = {
        task: 'periscope_align', board: BOARD, seaY: SEA_Y,
        eye: { x: EYE.x, y: EYE.y },
        m1: { x: M1.x, y: M1.y, baseDeg: +m1Base.toFixed(3), len: M1.len },
        m2: { x: +P2.x.toFixed(2), y: +P2.y.toFixed(2), baseDeg: +m2Base.toFixed(3), len: M2_LEN },
        m3: { x: +P3.x.toFixed(2), y: +P3.y.toFixed(2), baseDeg: +m3Base.toFixed(3), len: M3_LEN },
        buoy: { x: +buoyX.toFixed(2), y: SEA_Y, r: BUOY_R },
        knob: { range: KNOB.range, step: KNOB.step },
        solution: { k0, k1, k2 }, start: { k0: 0, k1: 0, k2: 0 }, passCount: 1, marginPx: 0,
      };
      const sol = trace(m, [k0, k1, k2]);
      if (!sol.hitBuoy || sol.path !== '0,1,2' || !turnsOk(sol)) continue;
      const audit = auditGrid(m);
      if (audit.pass !== 1 || !audit.sol || !sameKs(audit.sol, [k0, k1, k2])) continue;
      if (!Number.isFinite(audit.closestMiss) || audit.closestMiss < MISS_M3) continue;
      m.marginPx = +audit.closestMiss.toFixed(2);
      let s0 = k0;
      for (let g = 0; g < 60; g++) { const c = rng.int(-N_DET, N_DET) * KNOB.step; if (Math.abs(c - k0) >= 15) { s0 = c; break; } }
      let s1 = k1;
      for (let g = 0; g < 60; g++) { const c = rng.int(-N_DET, N_DET) * KNOB.step; if (c !== k1) { s1 = c; break; } }
      let s2 = k2;
      for (let g = 0; g < 60; g++) { const c = rng.int(-N_DET, N_DET) * KNOB.step; if (c !== k2) { s2 = c; break; } }
      m.start = { k0: s0, k1: s1, k2: s2 };
      return m;
    }
    throw new Error('periscope_align: generator exhausted');
  },

  init(m) { return { knob: startOf(m), moves: 0 }; },

  applyAction(s, a, m) {
    if (!a || a.op !== 'set') return { ok: false, reason: 'bad-op' };
    if (!(a.mirror === 0 || a.mirror === 1 || (a.mirror === 2 && m.m3))) return { ok: false, reason: 'bad-mirror' };
    if (!Number.isFinite(a.value)) return { ok: false, reason: 'bad-value' };
    let v = Math.round(a.value / m.knob.step) * m.knob.step;
    v = Math.max(-m.knob.range, Math.min(m.knob.range, v));
    s.knob[a.mirror] = v;
    if (!a.transient) s.moves++;
    return { ok: true };
  },

  verify(s, m) {
    const t = trace(m, s.knob);
    const success = !!t.hitBuoy;
    const miss = t.reachedSea ? Math.abs(t.seaX - m.buoy.x) : 260;
    return {
      success,
      partial: success ? 1 : Math.max(0, 1 - miss / 260),
      error: +miss.toFixed(2),
      detail: { knob: [...s.knob], path: t.path, moves: s.moves },
    };
  },

  oracle(m) {
    return solutionOf(m).map((v, i) => ({ op: 'set', mirror: i, value: v }));
  },

  oraclePoints(m) {
    const st = startOf(m);
    return solutionOf(m).map((v, i) => ({ from: [knobX(st[i]), SLIDER.ys[i]], to: [knobX(v), SLIDER.ys[i]] }));
  },

  randomPolicy(m, rnd) {
    const n = Math.round(m.knob.range / m.knob.step), r = () => (Math.floor(rnd() * (2 * n + 1)) - n) * m.knob.step;
    return mirrorsOf(m).map((_, i) => ({ op: 'set', mirror: i, value: r() }));
  },

  async mount(env) { if (env && env.style) env.assets.g15 = await mountLook(env.style); },

  drawPrompt(g, r, env) {
    if (env && env.manifest && !env.manifest.m3) { drawPromptText(g, r, 'Tilt the mirrors so the beam hits the buoy', 'Each slider turns one mirror'); return; }
    drawPromptText(g, r, 'Tilt the mirrors so the light hits the buoy',
      'Arrows show where light leaves each mirror');
  },

  drawBoard(g, br, env) {
    if (env.style && env.assets.g15) { drawStyled(g, br, env, env.assets.g15); return; }
    const { manifest: m, state: s } = env;
    g.save(); g.translate(br.x, br.y);

    const sky = g.createLinearGradient(0, 0, 0, m.seaY);
    sky.addColorStop(0, '#bfe3f5'); sky.addColorStop(1, '#e7f4fb');
    g.fillStyle = sky; g.fillRect(0, 0, br.w, m.seaY);
    const sea = g.createLinearGradient(0, m.seaY, 0, CTRL_Y);
    sea.addColorStop(0, '#2f7fb0'); sea.addColorStop(1, '#1c5a86');
    g.fillStyle = sea; g.fillRect(0, m.seaY, br.w, CTRL_Y - m.seaY);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, m.seaY + 0.5); g.lineTo(br.w, m.seaY + 0.5); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let y = m.seaY + 18; y < CTRL_Y; y += 28) {
      g.beginPath();
      for (let x = 0; x <= br.w; x += 12) g.lineTo(x, y + Math.sin((x + y) * 0.09) * 1.6);
      g.stroke();
    }

    drawBuoy(g, m.buoy.x, m.seaY, m.buoy.r);

    drawSub(g, m, br);

    drawLightMirrorsSliders(g, br, m, s);

    g.restore();
  },

  pointer(evt, env) {
    const s = env.state;
    if (evt.type === 'down') {
      const i = knobUnder(evt.x, evt.y, s.knob);
      if (i < 0) { this._grab = null; return []; }
      this._grab = { i, dx: evt.x - knobX(s.knob[i]) };
      s._active = i;
      return [];
    }
    if (evt.type === 'move' && this._grab) {
      return [{ op: 'set', mirror: this._grab.i, value: sliderValue(evt.x - this._grab.dx), transient: true }];
    }
    if (evt.type === 'up' && this._grab) {
      const { i, dx } = this._grab; this._grab = null; s._active = -1;
      return [{ op: 'set', mirror: i, value: sliderValue(evt.x - dx) }];
    }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    const k = env.state.knob;
    const f = (v) => `${v > 0 ? '+' : ''}${v}°`;
    return k.length > 2 ? `Lower ${f(k[0])}, upper ${f(k[1])}, outer ${f(k[2])}` : `Lower ${f(k[0])}, upper ${f(k[1])}`;
  },
};

function knobX(v) { return SLIDER.x0 + (v + KNOB.range) / (2 * KNOB.range) * (SLIDER.x1 - SLIDER.x0); }
function knobUnder(x, y, knob) {
  for (let i = 0; i < knob.length; i++) if (Math.hypot(x - knobX(knob[i]), y - SLIDER.ys[i]) <= KNOB_GRAB) return i;
  return -1;
}

function drawLightMirrorsSliders(g, br, m, s) {
  const t = trace(m, s.knob);
  const ms = mirrorsOf(m);
  if (!m.m3) {
    drawBeam(g, [m.eye, ...t.hits.map((h) => h.p), t.end]);
    if (t.reachedSea) drawSplash(g, t.end.x, t.end.y);
    ms.forEach((mo, i) => drawMirror(g, mo, s.knob[i], MIRROR_COL[i]));
  } else {
    drawBeam(g, [m.eye, t.hits[0].p]);
    ms.forEach((mo, i) => drawMirror(g, mo, s.knob[i], MIRROR_COL[i]));
    for (const h of t.hits) drawExitArrow(g, h.p, h.dOut);
  }
  g.fillStyle = '#f6f7f9'; g.fillRect(0, CTRL_Y, br.w, br.h - CTRL_Y);
  g.strokeStyle = '#e3e6ea'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, CTRL_Y + 0.5); g.lineTo(br.w, CTRL_Y + 0.5); g.stroke();
  ms.forEach((_, i) => drawSlider(g, SLIDER.ys[i], s.knob[i], MIRROR_COL[i], MIRROR_NAME[i], s._active === i));
}
function drawExitArrow(g, p, d) {
  const L = ARROW_LEN, tip = { x: p.x + d.x * L, y: p.y + d.y * L };
  const nx = -d.y, ny = d.x, hb = { x: tip.x - d.x * 9, y: tip.y - d.y * 9 };
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(20,20,30,.30)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(hb.x, hb.y); g.stroke();
  g.strokeStyle = '#ff7a1e'; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(hb.x, hb.y); g.stroke();
  g.fillStyle = '#ff7a1e'; g.strokeStyle = 'rgba(20,20,30,.45)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(hb.x + nx * 5.5, hb.y + ny * 5.5); g.lineTo(hb.x - nx * 5.5, hb.y - ny * 5.5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

function sliderValue(x) {
  const t = Math.max(0, Math.min(1, (x - SLIDER.x0) / (SLIDER.x1 - SLIDER.x0)));
  return -KNOB.range + t * KNOB.range * 2;
}

function drawBeam(g, pts) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(20,20,30,.30)'; g.lineWidth = 6;
  strokePts(g, pts);
  g.strokeStyle = '#ff7a1e'; g.lineWidth = 3.4; strokePts(g, pts);
  g.strokeStyle = 'rgba(255,244,200,.95)'; g.lineWidth = 1.3; strokePts(g, pts);
}
function strokePts(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.stroke();
}
function drawSplash(g, x, y) {
  g.fillStyle = 'rgba(255,240,210,.95)';
  g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,150,60,.85)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(x, y, 7.5, 0, Math.PI * 2); g.stroke();
}

function drawMirror(g, mo, knob, col) {
  const seg = mirrorSeg({ x: mo.x, y: mo.y }, mo.baseDeg + knob, mo.len);
  g.fillStyle = '#0f1a22';
  g.beginPath(); g.arc(mo.x, mo.y, 6.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
  g.strokeStyle = 'rgba(15,26,34,.9)'; g.lineWidth = 6.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(seg.a.x, seg.a.y); g.lineTo(seg.b.x, seg.b.y); g.stroke();
  g.strokeStyle = col; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(seg.a.x, seg.a.y); g.lineTo(seg.b.x, seg.b.y); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(seg.a.x, seg.a.y); g.lineTo(seg.b.x, seg.b.y); g.stroke();
}

function drawBuoy(g, x, y, r) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,.10)';
  g.beginPath(); g.ellipse(x, y + 5, r + 3, 4.5, 0, 0, Math.PI * 2); g.fill();
  const bodyH = r * 2.0;
  g.fillStyle = '#e23b3b';
  roundRectPath(g, x - r, y - bodyH + 6, r * 2, bodyH, 5); g.fill();
  g.fillStyle = '#f4f4f4';
  g.fillRect(x - r, y - bodyH * 0.55 + 6, r * 2, bodyH * 0.24);
  g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 1.2;
  roundRectPath(g, x - r, y - bodyH + 6, r * 2, bodyH, 5); g.stroke();
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y - bodyH + 6); g.lineTo(x, y - bodyH - 9); g.stroke();
  g.fillStyle = '#ffd23c';
  g.beginPath(); g.moveTo(x, y - bodyH - 9); g.lineTo(x + 11, y - bodyH - 5); g.lineTo(x, y - bodyH - 1); g.closePath(); g.fill();
  g.restore();
}

function drawSub(g, m, br) {
  const hullY = 250, hullH = 30, hx0 = 14, hx1 = 200;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#3a4a55'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(m.m1.x, hullY - 10); g.lineTo(m.m1.x, m.m2.y); g.lineTo(m.m2.x, m.m2.y); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(m.m1.x - 1.5, hullY - 10); g.lineTo(m.m1.x - 1.5, m.m2.y); g.stroke();
  const body = g.createLinearGradient(0, hullY, 0, hullY + hullH);
  body.addColorStop(0, '#5b6f7c'); body.addColorStop(0.55, '#3e505c'); body.addColorStop(1, '#2c3a44');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(hx0 + 18, hullY);
  g.lineTo(hx1 - 30, hullY);
  g.quadraticCurveTo(hx1, hullY + 2, hx1, hullY + hullH / 2);
  g.quadraticCurveTo(hx1, hullY + hullH - 2, hx1 - 30, hullY + hullH);
  g.lineTo(hx0 + 18, hullY + hullH);
  g.quadraticCurveTo(hx0, hullY + hullH, hx0, hullY + hullH / 2);
  g.quadraticCurveTo(hx0, hullY, hx0 + 18, hullY);
  g.fill();
  g.fillStyle = '#4a5d69';
  g.beginPath();
  g.moveTo(m.m1.x - 24, hullY + 1); g.lineTo(m.m1.x - 18, hullY - 14); g.lineTo(m.m1.x + 18, hullY - 14); g.lineTo(m.m1.x + 26, hullY + 1);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(190,225,238,.6)';
  for (const px of [120, 142, 164]) { g.beginPath(); g.arc(px, hullY + 14, 3.2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#1d262d';
  g.beginPath(); g.arc(m.eye.x, m.eye.y, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9fd3e3';
  g.beginPath(); g.arc(m.eye.x, m.eye.y, 2.8, 0, Math.PI * 2); g.fill();
  drawOuterPost(g, m, '#3a4a55');
}
function drawOuterPost(g, m, col) {
  if (!m.m3) return;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = col; g.lineWidth = 4;
  g.beginPath(); g.moveTo(m.m3.x, m.m3.y + 4); g.lineTo(m.m3.x, m.seaY - 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(m.m3.x - 1, m.m3.y + 6); g.lineTo(m.m3.x - 1, m.seaY - 3); g.stroke();
  g.fillStyle = '#56636c';
  g.beginPath(); g.ellipse(m.m3.x, m.seaY + 1, 11, 4, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawSlider(g, y, knob, col, label, active) {
  g.save();
  g.fillStyle = '#5b6672'; g.font = `500 10.5px ${UI_FONT}`;
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, 14, y);
  g.strokeStyle = '#d9dee4'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(SLIDER.x0, y); g.lineTo(SLIDER.x1, y); g.stroke();
  g.strokeStyle = '#c3c9d0'; g.lineWidth = 1;
  for (let d = -N_DET; d <= N_DET; d++) {
    const x = SLIDER.x0 + (d + N_DET) / (2 * N_DET) * (SLIDER.x1 - SLIDER.x0);
    g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y + 9); g.stroke();
  }
  const x = SLIDER.x0 + (knob + KNOB.range) / (2 * KNOB.range) * (SLIDER.x1 - SLIDER.x0);
  g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, active ? 10 : 9, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = col; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  g.restore();
}

function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const EXTP = Object.freeze({ seaY: [138, 186], eyeX: [20, 64], run: [44, 84], dropMin: 52, hullMax: 254, p2x: [44, 296] });
const EVAL_KEYS = new Set(["periscope_align|0|-30,15|2,6|2,2|7|4", "periscope_align|0|20,-15|2,6|2,2|7|4", "periscope_align|0|10,25|2,6|1,3|4|4", "periscope_align|0|0,-30|2,6|2,2|4|4", "periscope_align|0|20,-15|2,6|3,2|6|4", "periscope_align|0|-25,10|2,6|3,3|6|4", "periscope_align|0|-20,-20|2,6|1,2|4|4", "periscope_align|0|10,0|2,6|1,2|4|4", "periscope_align|0|20,0|2,6|2,2|5|4", "periscope_align|0|-25,30|2,6|3,2|6|4", "periscope_align|0|-5,25|2,6|3,2|6|4", "periscope_align|0|-15,15|2,6|2,3|5|4"]);
const SOL_IDS = [];
for (let a = -N_DET; a <= N_DET; a++) for (let b = -N_DET; b <= N_DET; b++) SOL_IDS.push(`${a * KNOB.step},${b * KNOB.step}`);
function generateExt(rng, split, n) {
  const solList = splitList('g15_periscope_solution', SOL_IDS, split, 12), sols = new Set(solList);
  const want = Number.isFinite(n) ? solList[nthOf(`periscope_align|${split}|solution`, n, solList.length)] : null;
  return extScene(rng, split, sols, want) || extScene(rng, split, sols, null);
}
function extScene(rng, split, sols, want) {
  const W = BOARD.w;
  const [w0, w1] = want ? want.split(',').map(Number) : [null, null];
  for (let attempt = 0; attempt < 20000; attempt++) {
    const seaY = rng.int(EXTP.seaY[0], EXTP.seaY[1]);
    const ey = rng.int(seaY + EXTP.dropMin + 10, EXTP.hullMax);
    const eye = { x: rng.int(EXTP.eyeX[0], EXTP.eyeX[1]), y: ey };
    const m1 = { x: eye.x + rng.int(EXTP.run[0], EXTP.run[1]), y: ey };
    const flip = rng.raw() < 0.5;
    let k0 = rng.int(-N_DET, N_DET) * KNOB.step, k1 = rng.int(-N_DET, N_DET) * KNOB.step;
    if (want) { k0 = flip ? -w0 : w0; k1 = flip ? -w1 : w1; k0 = k0 || 0; k1 = k1 || 0; }
    const D12 = rng.int(m1.y - seaY + 30, m1.y - 38);
    const tilt = rng.uniform(-16, 22);
    const d0 = { x: 1, y: 0 };
    const m1Base = M1_REF + tilt / 2 - k0;
    const d1 = reflect(d0, m1Base + k0);
    if (d1.y > -0.62) continue;
    const P2 = { x: m1.x + d1.x * D12, y: m1.y + d1.y * D12 };
    if (P2.x < EXTP.p2x[0] || P2.x > EXTP.p2x[1] || P2.y < 38 || P2.y > seaY - 32) continue;
    const buoyX = rng.uniform(30, W - 30);
    if (Math.abs(buoyX - P2.x) < 52) continue;
    const d2want = unit({ x: buoyX - P2.x, y: seaY - P2.y });
    if (d2want.y < 0.36) continue;
    const m2Base = (angDeg(d1) + angDeg(d2want)) / 2 - k1;
    const fx = (x) => (flip ? W - x : x), fa = (a) => (flip ? 180 - a : a), fk = (k) => (flip ? -k : k) || 0;
    const m = {
      task: 'periscope_align', board: BOARD, seaY, ext: split, flip,
      eye: { x: fx(eye.x), y: eye.y },
      m1: { x: fx(m1.x), y: m1.y, baseDeg: +fa(m1Base).toFixed(3), len: M1.len },
      m2: { x: +fx(P2.x).toFixed(2), y: +P2.y.toFixed(2), baseDeg: +fa(m2Base).toFixed(3), len: M2_LEN },
      buoy: { x: +fx(buoyX).toFixed(2), y: seaY, r: BUOY_R },
      knob: { range: KNOB.range, step: KNOB.step },
      solution: { k0: fk(k0), k1: fk(k1) }, start: { k0: 0, k1: 0 }, passCount: 1, marginPx: 0,
    };
    if (!sols.has(`${m.solution.k0},${m.solution.k1}`) || EVAL_KEYS.has(semanticKey(m))) continue;
    if (!trace(m, [m.solution.k0, m.solution.k1]).hitBuoy) continue;
    const audit = auditGrid(m);
    if (audit.pass !== 1 || !audit.sol || !sameKs(audit.sol, [m.solution.k0, m.solution.k1])) continue;
    if (!Number.isFinite(audit.closestMiss) || audit.closestMiss < 9) continue;
    m.marginPx = +audit.closestMiss.toFixed(2);
    const { k0: a0, k1: a1 } = m.solution;
    let s0 = a0;
    for (let g = 0; g < 60; g++) { const c = rng.int(-N_DET, N_DET) * KNOB.step; if (Math.abs(c - a0) >= 15) { s0 = c; break; } }
    let s1 = a1;
    for (let g = 0; g < 60; g++) { const c = rng.int(-N_DET, N_DET) * KNOB.step; if (c !== a1) { s1 = c; break; } }
    m.start = { k0: s0, k1: s1 };
    return m;
  }
  if (want) return null;
  throw new Error('periscope_align: ext generator exhausted');
}

const WATERS = [
  { id: 'ocean', top: '#2f7fb0', bot: '#14476e' }, { id: 'harbor', top: '#4f7a78', bot: '#22403f' },
  { id: 'lake', top: '#5a7f5a', bot: '#26402c' }, { id: 'tropical', top: '#2aa3a8', bot: '#0f5f74' },
  { id: 'arctic', top: '#3f6f86', bot: '#152f42' }, { id: 'river', top: '#6b7550', bot: '#2c3322' },
  { id: 'deep', top: '#23577f', bot: '#0b2238' }, { id: 'murky', top: '#5f6d63', bot: '#262d29' },
  { id: 'lagoon', top: '#3a9a8c', bot: '#14524d' }, { id: 'stormy', top: '#4a5f73', bot: '#1c2733' },
  { id: 'fjord', top: '#2f6a7a', bot: '#0f2c36' }, { id: 'reef', top: '#36a0b8', bot: '#11506a' },
  { id: 'canal', top: '#5c7a6e', bot: '#24352f' }, { id: 'estuary', top: '#7a7b5c', bot: '#33342a' },
];
const VESSELS = ['classic', 'cigar', 'research', 'patrol', 'rusty', 'midget'];
const BUOYS = ['can', 'cone', 'ball', 'spar'];
async function mountLook(st) {
  const waters = splitList('g15_periscope_water', WATERS.map((w) => w.id), st.split, 3);
  const water = WATERS.find((w) => w.id === primaryOf(st, 'g15_water', waters, 'g15_periscope_water'));
  const skies = st.pool('hdri', (h) => /outdoor|morning|sunset|overcast|urban/.test(h.use));
  const pick = st.primary('hdri', (h) => skies.includes(h));
  let sky = null;
  try { sky = await skyWindow(st, pick, BOARD.w / 150, { mean: 0.66, avoidSun: false, maxAsym: 1 }); } catch { sky = null; }
  if (!sky) sky = skyGradient(pick, 0.66);
  st.note(`sky:${pick.id}`);
  const metals = texPool(st, ['metal']);
  const hull = await makeMaterial(st, metals[Math.floor(st.rand() * metals.length)], { scale: [0.25, 0.4], rotate: false });
  const bedPool = texPool(st, ['terrain']);
  const bed = await makeMaterial(st, bedPool[Math.floor(st.rand() * bedPool.length)], { scale: [0.22, 0.35], rotate: false });
  const vessel = chooseSplit(st, 'g15_periscope_vessel', VESSELS, 1);
  const buoy = chooseSplit(st, 'g15_periscope_buoy', BUOYS, 1);
  return { water, sky, hull, bed, vessel, buoy, hullTint: hsl(st.rand() * 360, 18 + st.rand() * 22, 34 + st.rand() * 16), wave: st.rand(), bedH: 14 + Math.floor(st.rand() * 14) };
}
function drawStyled(g, br, env, L) {
  const { manifest: m, state: s } = env;
  const W = br.w, seaY = m.seaY;
  g.save(); g.translate(br.x, br.y);
  if (L.sky) g.drawImage(L.sky, 0, 0, W, seaY);
  else { const sk = g.createLinearGradient(0, 0, 0, seaY); sk.addColorStop(0, '#9cc9e6'); sk.addColorStop(1, '#e3f0f8'); g.fillStyle = sk; g.fillRect(0, 0, W, seaY); }
  const sea = g.createLinearGradient(0, seaY, 0, CTRL_Y);
  sea.addColorStop(0, L.water.top); sea.addColorStop(1, L.water.bot);
  g.fillStyle = sea; g.fillRect(0, seaY, W, CTRL_Y - seaY);
  g.save(); g.globalAlpha = 0.85;
  fillMaterial(g, L.bed, rectShape(0, CTRL_Y - L.bedH, W, L.bedH), { target: 0.3, contrastK: 0.7, tint: L.water.bot, tintAlpha: 0.45 });
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, seaY + 0.5); g.lineTo(W, seaY + 0.5); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
  for (let y = seaY + 14; y < CTRL_Y - L.bedH; y += 22) {
    g.beginPath();
    for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin((x + y) * (0.06 + 0.05 * L.wave)) * 1.8);
    g.stroke();
  }
  if (L.water.id === 'arctic') {
    g.fillStyle = 'rgba(235,245,250,.9)';
    for (const fx of [0.08, 0.37, 0.71, 0.9]) {
      const x = fx * W; if (Math.abs(x - m.buoy.x) < 40) continue;
      g.beginPath(); g.ellipse(x, seaY + 2, 16, 3, 0, 0, Math.PI * 2); g.fill();
    }
  }
  drawBuoyStyled(g, m.buoy.x, seaY, m.buoy.r, L.buoy);
  drawVessel(g, m, L);
  drawOuterPost(g, m, shadeHex(L.hullTint, -0.25));
  drawLightMirrorsSliders(g, br, m, s);
  g.restore();
}
function drawBuoyStyled(g, x, y, r, kind) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(x, y + 5, r + 3, 4.5, 0, 0, Math.PI * 2); g.fill();
  const red = '#e23b3b', white = '#f4f4f4', edge = 'rgba(20,20,20,.4)';
  if (kind === 'ball') {
    g.beginPath(); g.arc(x, y - r + 4, r, 0, Math.PI * 2); g.fillStyle = red; g.fill();
    g.save(); g.clip(); g.fillStyle = white; g.fillRect(x - r, y - r - 1, 2 * r, r * 0.45); g.restore();
    g.strokeStyle = edge; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y - r + 4, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 2 * r + 4); g.lineTo(x, y - 2 * r - 10); g.stroke();
    g.fillStyle = '#ffd23c'; g.beginPath(); g.moveTo(x, y - 2 * r - 10); g.lineTo(x + 11, y - 2 * r - 6); g.lineTo(x, y - 2 * r - 2); g.closePath(); g.fill();
  } else if (kind === 'cone') {
    g.beginPath(); g.moveTo(x - r, y + 6); g.lineTo(x + r, y + 6); g.lineTo(x + r * 0.35, y - 2 * r); g.lineTo(x - r * 0.35, y - 2 * r); g.closePath();
    g.fillStyle = red; g.fill();
    g.save(); g.clip(); g.fillStyle = white; g.fillRect(x - r, y - r * 0.9, 2 * r, r * 0.5); g.restore();
    g.strokeStyle = edge; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#ffd23c'; g.beginPath(); g.moveTo(x, y - 2 * r - 12); g.lineTo(x + 7, y - 2 * r); g.lineTo(x - 7, y - 2 * r); g.closePath(); g.fill();
  } else if (kind === 'spar') {
    g.fillStyle = red; g.fillRect(x - r, y - 10, 2 * r, 16);
    g.fillStyle = white; g.fillRect(x - r, y - 4, 2 * r, 4);
    g.strokeStyle = edge; g.lineWidth = 1.2; g.strokeRect(x - r, y - 10, 2 * r, 16);
    g.fillStyle = red; g.fillRect(x - 3, y - 2 * r - 14, 6, 2 * r + 4);
    g.fillStyle = white; g.fillRect(x - 3, y - 2 * r - 4, 6, 6);
    g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(x, y - 2 * r - 16, 4, 0, Math.PI * 2); g.fill();
  } else {
    g.restore(); drawBuoy(g, x, y, r); return;
  }
  g.restore();
}
function drawVessel(g, m, L) {
  const flip = m.eye.x > m.m1.x, sx = flip ? -1 : 1;
  const hullY = m.m1.y + 12, hullH = L.vessel === 'midget' ? 24 : 30;
  const len = L.vessel === 'midget' ? 130 : L.vessel === 'cigar' ? 196 : 176;
  const x0 = m.eye.x - sx * 16, x1 = m.eye.x + sx * (len - 16);
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = shadeHex(L.hullTint, -0.25); g.lineWidth = 7;
  g.beginPath(); g.moveTo(m.m1.x, hullY - 10); g.lineTo(m.m1.x, m.m2.y); g.lineTo(m.m2.x, m.m2.y); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(m.m1.x - 1.5, hullY - 10); g.lineTo(m.m1.x - 1.5, m.m2.y); g.stroke();
  const tint = L.vessel === 'research' ? '#d9a62a' : L.vessel === 'rusty' ? '#7a4a2e' : L.hullTint;
  const hullPath = (gg) => {
    gg.beginPath();
    if (L.vessel === 'cigar') {
      gg.moveTo(lo, hullY + hullH / 2); gg.quadraticCurveTo(lo + 20, hullY, lo + 40, hullY); gg.lineTo(hi - 40, hullY);
      gg.quadraticCurveTo(hi - 4, hullY + 2, hi, hullY + hullH / 2); gg.quadraticCurveTo(hi - 4, hullY + hullH - 2, hi - 40, hullY + hullH);
      gg.lineTo(lo + 40, hullY + hullH); gg.quadraticCurveTo(lo + 20, hullY + hullH, lo, hullY + hullH / 2);
    } else {
      const rr = L.vessel === 'patrol' ? 6 : hullH / 2;
      gg.moveTo(lo + rr, hullY); gg.lineTo(hi - rr, hullY); gg.quadraticCurveTo(hi, hullY, hi, hullY + hullH / 2);
      gg.quadraticCurveTo(hi, hullY + hullH, hi - rr, hullY + hullH); gg.lineTo(lo + rr, hullY + hullH);
      gg.quadraticCurveTo(lo, hullY + hullH, lo, hullY + hullH / 2); gg.quadraticCurveTo(lo, hullY, lo + rr, hullY);
    }
    gg.closePath();
  };
  fillMaterial(g, L.hull, hullPath, { target: 0.5, contrastK: 0.55, tint, tintAlpha: 0.9 });
  const shade = g.createLinearGradient(0, hullY, 0, hullY + hullH);
  shade.addColorStop(0, 'rgba(255,255,255,.18)'); shade.addColorStop(0.55, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.35)');
  hullPath(g); g.fillStyle = shade; g.fill();
  hullPath(g); g.strokeStyle = 'rgba(10,14,18,.55)'; g.lineWidth = 1.2; g.stroke();
  g.beginPath();
  g.moveTo(m.m1.x - 24, hullY + 1); g.lineTo(m.m1.x - 18, hullY - 14); g.lineTo(m.m1.x + 18, hullY - 14); g.lineTo(m.m1.x + 26, hullY + 1);
  g.closePath(); g.fillStyle = shadeHex(tint, -0.12); g.fill(); g.strokeStyle = 'rgba(10,14,18,.5)'; g.stroke();
  const sternX = flip ? lo : hi;
  g.beginPath(); g.moveTo(sternX - sx * 14, hullY + 2); g.lineTo(sternX + sx * 4, hullY - 9); g.lineTo(sternX + sx * 2, hullY + 6); g.closePath();
  g.fillStyle = shadeHex(tint, -0.2); g.fill();
  g.fillStyle = L.vessel === 'research' ? 'rgba(200,235,250,.85)' : 'rgba(190,225,238,.6)';
  const n = L.vessel === 'research' ? 4 : 3, a0 = m.m1.x + sx * 30, a1 = (flip ? lo : hi) - sx * 22;
  for (let i = 0; i < n; i++) {
    const px = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1));
    if (px < lo + 8 || px > hi - 8 || (a1 - a0) * sx < 12) continue;
    g.beginPath(); g.arc(px, hullY + 14, L.vessel === 'research' ? 4 : 3.2, 0, Math.PI * 2); g.fill();
  }
  if (L.vessel === 'rusty') { g.fillStyle = 'rgba(30,20,10,.45)'; for (let x = lo + 10; x < hi - 6; x += 9) { g.beginPath(); g.arc(x, hullY + 4, 1, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = '#1d262d'; g.beginPath(); g.arc(m.eye.x, m.eye.y, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9fd3e3'; g.beginPath(); g.arc(m.eye.x, m.eye.y, 2.8, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function semanticKey(m) {
  const q = (v) => Math.round(v / 42);
  const k = `periscope_align|${m.flip ? 1 : 0}|${m.solution.k0},${m.solution.k1}|${q(m.m1.x)},${q(m.m1.y)}|${q(m.m2.x)},${q(m.m2.y)}|${q(m.buoy.x)}|${q(m.seaY)}`;
  return m.m3 ? `${k}|${m.solution.k2}|${q(m.m3.x)},${q(m.m3.y)}` : k;
}
