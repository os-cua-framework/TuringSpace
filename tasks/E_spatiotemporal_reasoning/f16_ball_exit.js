import * as K from '../common/_f16_ball_exit_kit.js';
import * as S from '../common/_f16_ball_exit_scene.js';
import { mulberry32, R } from '../core/rng.js';

const NAME = 'f16_ball_exit';
const PROMPT = 'Which mat will the ball roll over?';
const SUB = 'Press Next frame to step through the clip · pick a colour below';
export const GATE = { n: 12, dt: 0.4, kc: 4, kv: 8, hidClear: 0.15, vis: 0.45, hid: 0.88, margin: 8, minDiam: 20, matGap: 1.8,
  onLine: 0.3, decoyLine: 0.4, offLine: 1.9, bearing: 18, screenOff: 18, pathClear: 1.3, eliminate: 5, beyond: 4, nMats: 8, rows: 4, reseat: 60 };
const DEG = Math.PI / 180, r2 = K.r2, r3 = K.r3;
const PAL_ORDER = K.PALETTE.map((p) => p.name);
const sortBy = (xs) => xs.slice().sort((a, b) => PAL_ORDER.indexOf(a) - PAL_ORDER.indexOf(b));
export const ROLES = ['T', 'D1', 'D3', 'N1', 'N2', 'N3', 'N4', 'N5'];
const NM = GATE.nMats;
export const _genStats = {};
const fail = (why) => { _genStats[why] = (_genStats[why] || 0) + 1; return null; };

export function looks(m) { const c = K.camOf(m); return Array.from({ length: m.n }, (_, k) => S.look(m, k, c)); }
export const footDist = (m, p) => Math.hypot(Math.max(0, Math.abs(p[0] - m.pav.x) - m.pav.hw), Math.max(0, Math.abs(p[1] - m.pav.z) - m.pav.hd));
const nrm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const along = (O, d, p) => (p[0] - O[0]) * d[0] + (p[1] - O[1]) * d[1];
const lateral = (O, d, p) => Math.abs((p[0] - O[0]) * d[1] - (p[1] - O[1]) * d[0]);
function rayPick(m, O, d) {
  let best = -1, bd = Infinity;
  m.mats.forEach((t, i) => { const p = [t.x, t.z]; if (along(O, d, p) > 0 && lateral(O, d, p) < bd) { bd = lateral(O, d, p); best = i; } });
  return { i: best, off: bd };
}
const nearestTo = (m, p) => m.mats.reduce((b, t, i, a) => (Math.hypot(t.x - p[0], t.z - p[1]) < Math.hypot(a[b].x - p[0], a[b].z - p[1]) ? i : b), 0);
export function singleOf(m, Lk, sc) {
  const best = (fn, sign) => fn.reduce((b, v, i) => (sign * v > sign * fn[b] ? i : b), 0);
  return {
    nearScreen: best(sc.map((s) => Math.hypot(s.x - Lk.cx, s.y - Lk.cy)), -1),
    nearGround: best(m.mats.map((t) => Math.hypot(t.x - Lk.x, t.z - Lk.z)), -1),
    sameRow: best(sc.map((s) => Math.abs(s.y - Lk.cy)), -1),
    lowest: best(sc.map((s) => s.y), 1),
  };
}
export function multiOf(m) {
  const B = m.ball, G = GATE, Pv = S.posAt(m, G.kv), P0 = S.posAt(m, 0), Ph = S.posAt(m, G.kv + 1);
  return {
    preBounce: rayPick(m, B.C, B.dIn).i,
    preFromLast: rayPick(m, Pv, B.dIn).i,
    chord: rayPick(m, Pv, nrm2([Pv[0] - P0[0], Pv[1] - P0[1]])).i,
    vanish: nearestTo(m, Ph),
    sound: rayPick(m, Pv, B.dOut),
  };
}

function ballShown(m, L = looks(m)) {
  const G = GATE;
  for (let k = 0; k < m.n; k++) {
    if (k <= G.kv) {
      if (L[k].hid > (k === G.kv ? G.vis : G.hidClear)) return 'c:seesHidden';
      const b = L[k].box;
      if (b[0] < G.margin || b[1] < G.margin || b[2] > K.VIEW.w - G.margin || b[3] > K.VIEW.h - G.margin) return 'c:inside';
      if (L[k].diam < G.minDiam) return 'c:small';
    } else if (L[k].hid < G.hid) return 'c:hiddenNot';
  }
  return null;
}
function contract(m) {
  if (!m || m.task !== NAME || !Array.isArray(m.mats) || m.mats.length !== NM || m.n !== GATE.n || !m.ball || !m.post) return null;
  const G = GATE, B = m.ball;
  if (!ROLES.every((r) => m.mats.filter((t) => t.role === r).length === 1)) return fail('c:roles');
  if (new Set(m.mats.map((t) => t.name)).size !== NM) return fail('c:colours');
  const iT = m.mats.findIndex((t) => t.role === 'T');
  if (m.mats[iT].name !== m.answer || B.kc !== G.kc) return fail('c:answer');
  const pc = [m.post.x, m.post.z];
  for (let k = 0; k < m.n; k++) { const p = S.posAt(m, k), d = Math.hypot(p[0] - pc[0], p[1] - pc[1]); if (d < S.R_BALL + S.POST_R - 0.005) return fail('c:postOverlap'); }
  if (Math.abs(Math.hypot(B.C[0] - pc[0], B.C[1] - pc[1]) - (S.R_BALL + S.POST_R)) > 0.01) return fail('c:contact');
  const turn = Math.acos(Math.max(-1, Math.min(1, B.dIn[0] * B.dOut[0] + B.dIn[1] * B.dOut[1]))) / DEG;
  if (turn < 45) return fail('c:turn');
  for (let k = 0; k <= m.n + 1; k += 0.1) if (footDist(m, S.posAt(m, k)) < S.R_BALL + 0.05) return fail('c:throughHall');
  const L = looks(m), cam = K.camOf(m), sc = S.matScreen(m, cam), pav = S.pavPrim(m), post = S.postPrim(m);
  { const w = ballShown(m, L); if (w) return fail(w); }
  { const pb = K.screenBox(cam, post); if (pb[0] < G.margin || pb[2] > K.VIEW.w - G.margin || pb[1] < G.margin || pb[3] > K.VIEW.h - G.margin) return fail('c:postInside');
    for (const y of [0.1, 0.5, 0.9]) if (K.hiddenBy(cam, [pav], [m.post.x, y, m.post.z])) return fail('c:postHidden'); }
  for (const t of m.mats) {
    if (!matInside(cam, t.x, t.z)) return fail('c:matInside');
    for (const [dx, dz] of [[0, 0], [-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]]) if (K.hiddenBy(cam, [pav, post], [t.x + dx, 0.02, t.z + dz])) return fail('c:matHidden');
    for (let k = 0; k <= G.kv; k++) { const p = S.posAt(m, k); if (Math.hypot(t.x - p[0], t.z - p[1]) < S.MAT_R + G.pathClear - 0.4) return fail('c:matOnPath'); }
  }
  for (let i = 0; i < NM; i++) for (let j = i + 1; j < NM; j++) if (Math.hypot(m.mats[i].x - m.mats[j].x, m.mats[i].z - m.mats[j].z) < G.matGap) return fail('c:matGap');
  const Pv = S.posAt(m, G.kv), T = multiOf(m);
  if (T.sound.i !== iT || T.sound.off > G.onLine) return fail('c:onLine');
  const brg = (p) => Math.atan2(p[1] - Pv[1], p[0] - Pv[0]), bOut = Math.atan2(B.dOut[1], B.dOut[0]);
  const sv = K.proj(cam, Pv[0], 0, Pv[1]), sT = sc[iT], sd = nrm2([sT.x - sv[0], sT.y - sv[1]]);
  for (let i = 0; i < NM; i++) {
    if (i === iT) continue;
    const t = m.mats[i], p = [t.x, t.z];
    if (along(Pv, B.dOut, p) > 0 && lateral(Pv, B.dOut, p) < G.offLine) return fail('c:decoyOnLine');
    let db = Math.abs(brg(p) - bOut) / DEG; if (db > 180) db = 360 - db;
    if (db < G.bearing) return fail('c:bearing');
    const q = K.proj(cam, t.x, 0, t.z), lat = Math.abs((q[0] - sv[0]) * sd[1] - (q[1] - sv[1]) * sd[0]);
    const ex = K.proj(cam, t.x + S.MAT_R, 0, t.z), ez = K.proj(cam, t.x, 0, t.z + S.MAT_R), rad = Math.max(Math.abs(ex[0] - q[0]), Math.abs(ez[1] - q[1]));
    if ((q[0] - sv[0]) * sd[0] + (q[1] - sv[1]) * sd[1] > 0 && lat - rad < G.screenOff) return fail('c:screenOff');
  }
  const iD1 = m.mats.findIndex((t) => t.role === 'D1');
  if (rayPick(m, B.C, B.dIn).off > G.decoyLine || T.preBounce !== iD1) return fail('c:D1');
  const hc = K.proj(cam, m.pav.x, 0, m.pav.z)[0], sg = Math.sign(K.proj(cam, Pv[0], 0, Pv[1])[0] - K.proj(cam, B.C[0], 0, B.C[1])[0]);
  const isBeyond = sc.map((q) => sg * (q.x - hc) > 0);
  if (isBeyond.filter(Boolean).length < G.beyond) return fail('c:beyond');
  const picked = new Set();
  for (let k = 0; k <= G.kv; k++) { const P = singleOf(m, L[k], sc); for (const v of Object.values(P)) { if (v === iT) return fail('c:single'); picked.add(v); } }
  for (const r of ['preBounce', 'preFromLast', 'chord', 'vanish']) { if (T[r] === iT) return fail('c:' + r); if (T[r] >= 0) picked.add(T[r]); }
  const left = m.mats.map((_, i) => i).filter((i) => !picked.has(i));
  if (left.length < G.eliminate) return fail('c:eliminate');
  if (left.filter((i) => isBeyond[i]).length < G.beyond) return fail('c:eliminateBeyond');
  return { L, sc, T, picked, isBeyond, left, iT, sg };
}
export function gate(m) {
  if (!contract(m)) return false;
  const st = task.init(m);
  for (const a of task.oracle(m)) if (!task.applyAction(st, a, m).ok) return false;
  return task.verify(st, m).success;
}
export function frameAudit(m) {
  const C = contract(m);
  if (!C) return { singleFrame: true, why: 'contract' };
  const iT = m.mats.findIndex((t) => t.role === 'T'), hits = [];
  for (let k = 0; k <= GATE.kv; k++) for (const [r, v] of Object.entries(singleOf(m, C.L[k], C.sc))) if (v === iT) hits.push(`${r}@${k + 1}`);
  const nm = (i) => (i >= 0 ? m.mats[i].name : null);
  return { singleFrame: hits.length > 0, hits, frames: m.n, shown: GATE.kv + 1,
    multi: { preBounce: nm(C.T.preBounce), preFromLast: nm(C.T.preFromLast), chord: nm(C.T.chord), vanish: nm(C.T.vanish), sound: nm(C.T.sound.i) } };
}

export function _dbgBuild(rng) { return tryBuild(rng, true); }
function matInside(cam, x, z) {
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q = K.proj(cam, x + dx * (S.MAT_R + 0.15), 0, z + dz * (S.MAT_R + 0.15)); if (q[0] < 8 || q[0] > K.VIEW.w - 8 || q[1] < 8 || q[1] > K.VIEW.h - 8) return false; }
  return true;
}
function tryBuild(rng, dbg = false) {
  const U = rng.uniform, mir = rng.sign(), G = GATE, n = G.n;
  const m = {
    task: NAME, board: { ...K.BOARD }, n, dt: G.dt,
    cam: { h: r2(U(6.0, 7.0)), pitch: -r2(U(40, 46)), fovy: 68 },
    sun: { az: r2(180 + rng.sign() * U(20, 50)), el: r2(U(50, 64)) },
    ground: { kind: 'plaza', v: Math.floor(rng.raw() * 3), ang: r2(U(0, 90)), tile: r2(U(0.9, 1.5)), seed: Math.floor(rng.raw() * 900), discs: [] },
    sky: { cover: r3(U(0.56, 0.66)), seed: r3(U(0, 50)) },
    trees: { dist: r2(U(240, 380)), h0: r2(U(7, 10)), h1: r2(U(4, 8)), seed: r3(U(0, 50)) },
  };
  const zh = U(5.6, 6.8), hd = r2(U(0.6, 0.8));
  m.pav = { x: r3(U(0.3, 1.2)), z: r3(zh), hw: r2(U(0.85, 1.1)), hd, hh: r2(U(2.2, 2.8)) };
  const cam = K.camOf(m), pav = S.pavPrim(m);
  const phiO = U(42, 62) * DEG, dOut = [Math.cos(phiO), Math.sin(phiO)];
  const Q = [m.pav.x - m.pav.hw + U(-0.2, 0.7), zh + hd + U(0.5, 1.1)];
  for (let sq = -6; sq <= 4; sq += 0.1) if (footDist(m, [Q[0] + dOut[0] * sq, Q[1] + dOut[1] * sq]) < S.R_BALL + 0.08) return fail('g:throughHall');
  const hidAt = (s) => K.sphereHidden(cam, K.sphere([Q[0] + dOut[0] * s, S.R_BALL, Q[1] + dOut[1] * s], S.R_BALL, [1, 1, 1]), [pav]);
  let sIn = null, sV = null; for (let s = -5; s < 2; s += 0.02) { const h = hidAt(s); if (h <= 0.42) sV = s; if (h >= 0.9) { sIn = s; break; } }
  if (sIn === null || sV === null) return fail('g:noHide');
  const vIn = U(0.72, 0.85), vOut = vIn * U(0.75, 0.82);
  if (sV + vOut < sIn + 0.02) return fail('g:edgeSlow');
  const sH = U(sIn + 0.02, Math.min(sV + vOut, sIn + 0.3));
  for (let j = 1; j < G.n - G.kv - 1; j++) if (hidAt(sH + j * vOut) < G.hid + 0.02) return fail('g:showsAgain');
  const sC = sH - (G.kv + 1 - G.kc) * vOut, C = [Q[0] + dOut[0] * sC, Q[1] + dOut[1] * sC];
  const phiI = phiO - U(50, 70) * DEG, dIn = [Math.cos(phiI), Math.sin(phiI)];
  const nb = nrm2([dOut[0] - dIn[0], dOut[1] - dIn[1]]), pc = [C[0] - nb[0] * (S.R_BALL + S.POST_R), C[1] - nb[1] * (S.R_BALL + S.POST_R)];
  m.ball = { C: [r3(C[0]), r3(C[1])], dIn: [r3(dIn[0]), r3(dIn[1])], dOut: [r3(dOut[0]), r3(dOut[1])], vIn: r3(vIn), vOut: r3(vOut), kc: G.kc };
  m.post = { x: r3(pc[0]), z: r3(pc[1]) };
  { const w = ballShown(m); if (w) return fail('g:' + w); }
  const Pv = S.posAt(m, G.kv);
  const postP = S.postPrim(m), clear = (x, z) => matInside(cam, x, z) && [[0, 0], [-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]].every(([dx, dz]) => !K.hiddenBy(cam, [pav, postP], [x + dx, 0.02, z + dz]));
  const firstClear = (O, d, from) => { for (let ds = from; ds < 12; ds += 0.1) { const x = O[0] + d[0] * ds, z = O[1] + d[1] * ds; if (!matInside(cam, x, z)) return null; if (clear(x, z)) return ds; } return null; };
  const fT = firstClear(Pv, dOut, 0.6); if (fT === null) return fail('g:T');
  const dT = fT + U(0.3, 1.2), xT = Pv[0] + dOut[0] * dT, zT = Pv[1] + dOut[1] * dT;
  if (!clear(xT, zT)) return fail('g:T');
  const dr = U(1.85, 2.15), rT = rng.int(0, G.rows - 1), rows = Array.from({ length: G.rows }, (_, i) => zT + (i - rT) * dr);
  const rO = rT === 0 ? 1 : rT === G.rows - 1 ? G.rows - 2 : rT + (rng.raw() < 0.5 ? -1 : 1);
  const f1 = firstClear(C, dIn, 1.7); if (f1 === null) return fail('g:D1');
  const d1 = f1 + U(0.3, 1.0), s1 = [C[0] + dIn[0] * d1, C[1] + dIn[1] * d1]; if (!clear(...s1)) return fail('g:D1');
  const placed = [[xT, zT], s1], bOut = Math.atan2(dOut[1], dOut[0]), sv = K.proj(cam, Pv[0], 0, Pv[1]), sTp = K.proj(cam, xT, 0, zT), sdv = nrm2([sTp[0] - sv[0], sTp[1] - sv[1]]);
  const offOk = (p) => {
    for (let k = 0; k <= G.kv; k++) { const q = S.posAt(m, k); if (Math.hypot(p[0] - q[0], p[1] - q[1]) < S.MAT_R + G.pathClear - 0.4 + 0.1) return false; }
    if (lateral(Pv, dOut, p) < G.offLine + 0.25 && along(Pv, dOut, p) > 0) return false;
    let db = Math.abs(Math.atan2(p[1] - Pv[1], p[0] - Pv[0]) - bOut) / DEG; if (db > 180) db = 360 - db; if (db < G.bearing + 3) return false;
    const q = K.proj(cam, p[0], 0, p[1]), lat = Math.abs((q[0] - sv[0]) * sdv[1] - (q[1] - sv[1]) * sdv[0]);
    const ex = K.proj(cam, p[0] + S.MAT_R, 0, p[1]), ez = K.proj(cam, p[0], 0, p[1] + S.MAT_R), rad = Math.max(Math.abs(ex[0] - q[0]), Math.abs(ez[1] - q[1]));
    return !((q[0] - sv[0]) * sdv[0] + (q[1] - sv[1]) * sdv[1] > 0 && lat - rad < G.screenOff + 3);
  };
  const spaced = (p) => placed.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= G.matGap + 0.2);
  const nearT = (r) => { for (let t = 0; t < 30; t++) { const p = [xT + U(-3.2, 3.2), rows[r ?? rng.int(0, G.rows - 1)]]; if (clear(...p) && offOk(p) && spaced(p)) { placed.push(p); return p; } } return null; };
  const s3 = nearT(rO); if (!s3) return fail('g:D3');
  const anywhere = () => { for (let t = 0; t < 120; t++) { const p = [xT + U(-7.5, 7.5), rows[rng.int(0, G.rows - 1)]]; if (clear(...p) && spaced(p) && offOk(p)) { placed.push(p); return p; } } return null; };
  const base = placed.slice(), cols = rng.shuffle(K.PALETTE.slice()).slice(0, NM);
  let seated = false;
  for (let att = 0; att < G.reseat && !seated; att++) {
    placed.length = 0; placed.push(...base);
    const [sN1, sN2, sN3, sN4, sN5] = [1, 2, 3, 4, 5].map(() => anywhere());
    if (![sN1, sN2, sN3, sN4, sN5].every(Boolean)) continue;
    const spot = { T: [xT, zT], D1: s1, D3: s3, N1: sN1, N2: sN2, N3: sN3, N4: sN4, N5: sN5 };
    m.mats = ROLES.map((role, i) => ({ role, name: cols[i].name, hex: cols[i].hex, x: r3(spot[role][0]), z: r3(spot[role][1]) }));
    m.answer = m.mats[0].name;
    seated = !!contract(m);
  }
  if (!seated) return fail('g:N');
  m.answer = m.mats[0].name;
  if (mir < 0) {
    for (const v of [m.ball.C, m.ball.dIn, m.ball.dOut]) v[0] = -v[0];
    m.pav.x = -m.pav.x; m.post.x = -m.post.x; m.mats.forEach((t) => { t.x = -t.x; });
  }
  m.ground.discs = m.mats.map((t) => [t.x, t.z, S.MAT_R, t.hex]);
  m.mats = rng.shuffle(m.mats);
  m.buttons = sortBy(m.mats.map((t) => t.name)).map((nm) => ({ id: nm, label: nm, hex: K.PALETTE.find((p) => p.name === nm).hex }));
  if (dbg) return m;
  if (!contract(m)) return null;
  return m;
}
export const THIN_STATE = { on: true };
export const THIN = {"all:x":[1,1,1,1,0.9465,1,1,1],"leftB4:x":[0.8645,0.2365,1,0.3883],"all:y":[1,1,0.8032,1,1,1,1],"leftB4:y":[0.9465,0.1977,1,0.4115],"leftB5:x":[1,1],"leftB5:y":[1,1]};
export function thinKeys(m) {
  const C = contract(m), cam = K.camOf(m), sc = C.sc, iT = C.iT, sg = C.sg, out = {};
  const idx = m.mats.map((_, i) => i), leftB = C.left.filter((i) => C.isBeyond[i]);
  const f = { x: (i) => sg * sc[i].x, y: (i) => sc[i].y };
  const rank = (set, g) => set.filter((i) => i !== iT && g(i) < g(iT)).length;
  for (const [nm, g] of Object.entries(f)) { out['all:' + nm] = rank(idx, g); out['leftB' + leftB.length + ':' + nm] = rank(leftB, g); }
  return out;
}
function thinAccept(m, u) {
  if (!THIN_STATE.on) return true;
  let p = 1; for (const [k, v] of Object.entries(thinKeys(m))) p = Math.min(p, THIN[k]?.[v] ?? 1);
  return u() < p;
}
const task = K.makeTask({
  name: NAME, prompt: PROMPT, sub: SUB, buttonKind: 'swatch', pickNote: 'the colour of one mat',
  gate, primsAt: S.primsAt,
  generate(rng, level, index, knobs = {}) {
    const key = Math.floor(rng.raw() * 4294967296) >>> 0;
    const acc = mulberry32(K.mix32(key, 0x5ba));
    for (let a = 0; a < 400000; a++) {
      const m = tryBuild(R(mulberry32(K.mix32(key, a))));
      if (m && thinAccept(m, acc)) { m.gen = { tries: a + 1 }; return m; }
    }
    throw new Error('f16_ball_exit: generator exhausted');
  },
});
export default task;
