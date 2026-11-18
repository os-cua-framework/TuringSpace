import * as W from './_who_follows_him_scene.js';
import * as G from './_who_follows_him_gen.js';

const RT = W.RT, VIEW = W.VIEW, GATE = G.GATE, NAME = G.NAME;
const DEG = Math.PI / 180, angDiff = G.angDiff;
const r3 = (v) => Math.round(v * 1000) / 1000;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const ang = (v) => Math.atan2(v[1], v[0]);
const sstep = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

function roundPath(C, r0) {
  const out = [C[0].slice()], mids = [], arcs = [];
  out.mids = mids; out.arcs = arcs;
  const seg = (a, b) => { const L = hyp(a, b), n = Math.max(1, Math.ceil(L / 0.35)); for (let i = 1; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); };
  let cur = C[0];
  for (let i = 1; i < C.length - 1; i++) {
    const din = unit([C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]]), dout = unit([C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1]]);
    const th = Math.abs(angDiff(ang(dout), ang(din)));
    if (th < 1e-3) { seg(cur, C[i]); cur = C[i]; continue; }
    const ri = Array.isArray(r0) ? r0[i - 1] : r0;
    const tl = ri * Math.tan(th / 2), a = [C[i][0] - din[0] * tl, C[i][1] - din[1] * tl];
    if (hyp(cur, a) > 1e-6) seg(cur, a);
    const i0 = out.length - 1;
    const side = Math.sign(din[0] * dout[1] - din[1] * dout[0]);
    const r = ri, nrm = [-din[1] * side, din[0] * side], ctr = [a[0] + nrm[0] * r, a[1] + nrm[1] * r];
    const a0 = ang([a[0] - ctr[0], a[1] - ctr[1]]), n = Math.max(2, Math.ceil(th / (5 * DEG)));
    for (let k = 1; k <= n; k++) { const q = a0 + side * th * k / n; out.push([ctr[0] + r * Math.cos(q), ctr[1] + r * Math.sin(q)]); if (k === Math.round(n / 2)) mids.push(out.length - 1); }
    arcs.push([i0, out.length - 1]);
    cur = out[out.length - 1];
  }
  seg(cur, C[C.length - 1]);
  return out;
}
function param(pts, s0 = 0) {
  const o = []; let L = 0;
  for (let i = 0; i < pts.length; i++) { if (i) L += hyp(pts[i], pts[i - 1]); o.push([pts[i][0], pts[i][1], L - s0, L - s0]); }
  return o;
}
function line(a, b) { const u = unit([b[0] - a[0], b[1] - a[1]]); return param([[a[0] - 3 * u[0], a[1] - 3 * u[1]], a, b, [b[0] + 3 * u[0], b[1] + 3 * u[1]]], 3); }
function offsetPts(pp, o0) {
  const n = pp.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pp[Math.max(0, i - 1)], b = pp[Math.min(n - 1, i + 1)], d = unit([b[0] - a[0], b[1] - a[1]]);
    const o = typeof o0 === 'function' ? o0(pp[i][2]) : o0;
    out.push([pp[i][0] - d[1] * o, pp[i][1] + d[0] * o, pp[i][2], 0]);
  }
  let L = 0; for (let i = 0; i < n; i++) { if (i) L += hyp(out[i], out[i - 1]); out[i][3] = L; }
  return out;
}
const EASE = 0.6;
function tvBuild(s0, v0, plan, E = EASE) {
  const kn = [[0, s0]]; let t = 0, s = s0, v = v0;
  for (const p of plan) {
    if (p.stop != null) {
      const sa = p.stop - v * E / 2;
      if (!(v > 0) || sa < s - 1e-9) return null;
      t += (sa - s) / v; s = sa; kn.push([t, s]);
      for (let k = 1; k <= 6; k++) { const u = E * k / 6; kn.push([t + u, sa + v * u - v * u * u / (2 * E)]); }
      t += E; s = p.stop; v = 0;
    } else if (p.wait != null) { if (p.wait > 0) { t += p.wait; kn.push([t, s]); } }
    else if (p.go != null) {
      v = p.go;
      for (let k = 1; k <= 6; k++) { const u = E * k / 6; kn.push([t + u, s + v * u * u / (2 * E)]); }
      t += E; s += v * E / 2;
    }
  }
  return { kn: kn.map((q) => [r3(q[0]), r3(q[1])]), t, s };
}
const roundPts = (pp) => pp.map((q) => [r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);

export const _genStats = {};
const nul = (why) => { _genStats['build:' + why] = (_genStats['build:' + why] || 0) + 1; return null; };
const pickColors = (rng, n) => rng.shuffle(W.COLORS.map((c, i) => i)).slice(0, n);
function stopFin(rng, p, tStop, dA) {
  const h = ang(W.poseAt(p, tStop + 0.01).f), t0 = tStop + rng.uniform(0, 0.25);
  p.mv.fin = { t0: r3(t0), t1: r3(t0 + 0.75), a0: r3(h), a1: r3(h + dA) };
}
function lastT(p) { return Math.max(p.mv.tv[p.mv.tv.length - 1][0], p.mv.fin ? p.mv.fin.t1 : 0); }
function blocker(q, list, tEnd, gap) {
  for (let t = 0; t <= tEnd; t += 0.1) {
    const Q = W.poseAt(q, t);
    for (const p of list) { if (!p.mv) continue; const P = W.poseAt(p, t); if (Math.hypot(P.x - Q.x, P.z - Q.z) < gap) return p.role || '?'; }
  }
  return null;
}

export function tryBuild(rng, C) {
  const U = (a, b) => rng.uniform(a, b), sgn = () => rng.sign();
  const v = U(0.88, 0.98), sA = sgn();
  const lagLo = Math.max(3.2, 3.05 / v), lagHi = Math.min(4.0, 3.9 / v);
  if (lagHi < lagLo) return nul('lag');
  const lag = U(lagLo, lagHi);
  const oF0 = sA * U(0.5, 0.65), oFd = sA * U(0.15, 0.3), oF2 = sA * U(0.45, 0.7);
  const psi0 = U(100, 115) * DEG, psi1 = U(108, 120) * DEG, psi3 = U(108, 120) * DEG, psis = [psi0, psi1, psi1, psi3, psi3];
  const rr = [Math.abs(oF0) + U(0.22, 0.3), Math.abs(oF0) + U(0.22, 0.3), U(0.6, 0.72), U(0.6, 0.72), U(0.6, 0.72)];
  const tls = rr.map((r, k) => r * Math.tan(psis[k] / 2)), arcL = rr.map((r, k) => r * psis[k]);
  const g = lag + U(0.1, 0.9);
  const L01 = v * g - arcL[0] / 2 - arcL[1] / 2 + tls[0] + tls[1];
  const a1 = U(2.8, 3.2), b = U(3.1, 3.8);
  const dpre = [Math.cos(psi0), -sA * Math.sin(psi0)];
  const c0 = [0, 0], pre = [-6 * dpre[0], -6 * dpre[1]];
  const c1 = [L01, 0];
  const c2 = [c1[0] + a1 * Math.cos(psi1), sA * a1 * Math.sin(psi1)];
  const c3 = [c2[0] + b, c2[1]];
  const a3 = Math.abs(c3[1]) / Math.sin(psi3);
  const c4 = [c3[0] + a3 * Math.cos(psi3), 0];
  if (L01 - tls[0] - tls[1] < 0.3 || a1 - tls[1] - tls[2] < 0.3 || b - tls[2] - tls[3] < 0.3 || a3 - tls[3] - tls[4] < 0.3) return nul('legs');
  const dLast = lag + U(0.2, 0.8);
  const raw = roundPath([pre, c0, c1, c2, c3, c4, [c4[0] + tls[4] + v * dLast + 8, 0]], rr);
  if (raw.mids.length !== 5 || raw.arcs.length !== 5) return nul('mids');
  const Tp = param(raw, 0);
  const sMid = raw.mids.map((i) => Tp[i][2]), arcS = raw.arcs.map((q) => [Tp[q[0]][2], Tp[q[1]][2]]);
  const tC0 = -U(0.6, 1.0), sT0 = sMid[0] - v * tC0;
  const sEnd = sMid[4] + v * dLast;
  const tT = tvBuild(sT0, v, [{ stop: sEnd }]);
  if (!tT) return nul('tT');
  const tStop = tT.t;
  const hs = [-sA * psi0, 0, sA * psi1, 0, -sA * psi3, 0];
  const turns = sMid.map((sm, k) => ({ s: r3(sm), t: r3((sm - sT0) / v), h0: r3(hs[k]), h1: r3(hs[k + 1]) }));
  const tOf = (s) => (s - sT0) / v, arcT = arcS.map((q) => [r3(tOf(q[0])), r3(tOf(q[1]))]);
  if (arcT[4][1] - arcT[1][0] < GATE.detour) return nul('detour');
  const Tq = { mv: { pts: Tp, tv: tT.kn } };

  const ramp = (s, s0, s1, a, b2) => (s <= s0 ? a : s >= s1 ? b2 : a + (b2 - a) * sstep((s - s0) / (s1 - s0)));
  const oFs = (s) => (s < arcS[4][1] + 0.3 ? ramp(s, arcS[1][1] + 0.15, arcS[1][1] + 1.35, oF0, oFd) : ramp(s, arcS[4][1] + 0.3, arcS[4][1] + 1.8, oFd, oF2));
  const Fp = offsetPts(Tp, oFs);
  if (sT0 - lag * v < 0.5) return nul('Fstart');
  const sFstop = arcS[4][1] + U(0.15, 0.7);
  if (sEnd - sFstop < 2.0) return nul('Fend');
  const tF = tvBuild(sT0 - lag * v, v, [{ stop: sFstop }]);
  if (!tF || tF.t > tStop + 1.4) return nul('tF');
  const lead = U(1.25, 1.8), oL = U(-0.25, 0.25);
  const Lp = offsetPts(Tp, oL), tL = tvBuild(sT0 + lead, v, [{ stop: sEnd + U(0.9, 1.2) }]);
  if (!tL) return nul('tL');

  const xT = (t) => W.poseAt(Tq, t).x;
  const tOut0 = arcT[0][1], xOut0 = Tp[raw.arcs[0][1]][0];
  const xv = (t) => xOut0 + v * (t - tOut0);
  const dC0 = U(1.15, 1.5), dC1 = U(1.15, 1.5), oC = -sA * U(0.08, 0.16);
  const tA = arcT[1][0] + U(0, 0.4), tB = arcT[4][1] + U(0.25, 0.55), R1 = U(1.2, 1.8), R2 = U(1.0, 1.4);
  if (tB - tA < R1 + R2 + 1) return nul('C span');
  const wgt = (t) => (t < tA ? 0 : t < tA + R1 ? sstep((t - tA) / R1) : t < tB - R2 ? 1 : t < tB ? sstep((tB - t) / R2) : 0);
  const DT = 0.02, nA = Math.round(tA / DT);
  let Wsum = 0; for (let t = tA; t < tB - 1e-9; t += DT) Wsum += 0.5 * (wgt(t) + wgt(t + DT)) * DT;
  const xA = xv(tA) - dC0, xB = xT(tB) - dC1;
  const vS = v - (xA + v * (tB - tA) - xB) / Wsum;
  if (!(vS >= GATE.compSlow[0] && vS <= GATE.compSlow[1])) return nul('vS');
  const knC = [];
  {
    const x0 = xv(0) - dC0;
    let x = x0, t = 0;
    for (let k = 0; t < tB - 1e-9; k++) {
      if (k % 5 === 0) knC.push([t, x]);
      const tn = Math.min(tB, t + DT); x += (t < tA - 1e-9 ? v : v - (v - vS) * 0.5 * (wgt(t) + wgt(tn))) * (tn - t); t = tn;
    }
    const err = xB - x;
    for (const q of knC) if (q[0] > tA) q[1] += err * Math.min(1, (q[0] - tA) / (tB - tA));
    for (let t2 = tB; t2 <= tStop + 0.05; t2 += 0.1) knC.push([t2, xT(Math.min(t2, tStop)) - dC1]);
    knC.push([tStop + 0.1, xT(tStop) - dC1]);
  }
  const xCmin = knC[0][1], xCmax = knC[knC.length - 1][1];
  const Cp = line([xCmin, oC], [xCmax, oC]);
  const tC = { kn: knC.map((q) => [r3(q[0]), r3(q[1] - xCmin)]) };
  void nA;

  const dzP = -sA * U(0.9, 1.1), dxP = U(-0.25, 0.25);
  const Pp = line([xCmin + dxP, oC + dzP], [xCmax + dxP, oC + dzP]), tP = { kn: tC.kn };

  const lead2 = U(5.5, 8.0), oD = -sA * U(0.15, 0.3);
  const Dpp = C.far ? offsetPts(Tp, oD) : null, tD = C.far ? tvBuild(sT0 + lead2, v, [{ stop: sEnd + U(2.3, 3.4) }]) : null;
  if (C.far && !tD) return nul('tD');

  const base = [{ role: 'T', mv: { pts: Tp, tv: tT.kn } }, { role: 'F', mv: { pts: Fp, tv: tF.kn } }, { role: 'C', mv: { pts: Cp, tv: tC.kn } },
    { role: 'P', mv: { pts: Pp, tv: tP.kn } }, { role: 'L', mv: { pts: Lp, tv: tL.kn } }, ...(C.far ? [{ role: 'D', mv: { pts: Dpp, tv: tD.kn } }] : [])];

  let Qp = null, tQ = null;
  for (let tries = 0; tries < 8 && C.q && !Qp; tries++) {
    const zQ = c2[1] + sA * U(Math.abs(oFd) + 1.05, Math.abs(oFd) + 1.35), vQ = U(0.5, 0.8), tm = (turns[2].t + turns[3].t) / 2;
    const xTm = xT(tm), x0 = xTm - U(0.5, 1.8) - vQ * tm, tQs = U(tStop - 0.6, tStop + 0.5), LQ = vQ * (tQs - EASE / 2);
    const pp = line([x0, zQ], [x0 + LQ, zQ]), tq = tvBuild(0, vQ, [{ stop: LQ }]);
    if (!tq) continue;
    const cand = { role: 'Q', mv: { pts: pp, tv: tq.kn } };
    if (!blocker(cand, base, tStop + 1, 0.9)) { Qp = pp; tQ = tq; }
  }
  if (C.q && !Qp) return nul('Q');
  if (Qp) base.push({ role: 'Q', mv: { pts: Qp, tv: tQ.kn } });

  const X = [], xEnd = xT(tStop);
  for (let k = 0; k < C.nX; k++) {
    let got = null;
    for (let tries = 0; tries < 16 && !got; tries++) {
      const kind = rng.raw() < 0.5 ? 'oncoming' : 'crossing', Lx = U(5, 8), vx = U(0.8, 1.2);
      const pauseX = Math.max(0, Math.min(6, U(tStop - 1.5, tStop + 0.5) - Lx / vx - 1.5 * EASE)), pX = U(0.3, 0.7) * Lx;
      const mid = [U(0.2, 0.8) * xEnd, sA * U(-0.5, 3.5)];
      const hx = kind === 'oncoming' ? Math.PI + U(-35, 35) * DEG : sgn() * U(60, 120) * DEG;
      const st = [mid[0] - Math.cos(hx) * Lx / 2, mid[1] - Math.sin(hx) * Lx / 2], en = [mid[0] + Math.cos(hx) * Lx / 2, mid[1] + Math.sin(hx) * Lx / 2];
      const Xp = line(st, en);
      const tx = tvBuild(0, vx, [{ stop: pX }, { wait: pauseX }, { go: vx }, { stop: Lx }]);
      if (!tx) continue;
      const q = { role: 'X', mv: { pts: roundPts(Xp), tv: tx.kn }, kind };
      if (!blocker(q, base.concat(X), tStop + 1.5, 0.9)) got = q;
    }
    if (!got) return nul('X');
    X.push(got);
  }

  const nC = 5 + C.nE + (C.far ? 1 : 0), cols = pickColors(rng, nC);
  const look = (top) => ({ top, bottom: rng.pick(W.BOTTOMS), hair: rng.pick(W.HAIRS), skin: rng.pick(W.SKINS), k: r3(U(0.94, 1.06)), ph: r3(U(0, 6.28)) });
  const people = [
    { role: 'T', ...look(W.RED), colorName: 'red', mv: { pts: roundPts(Tp), tv: tT.kn } },
    { role: 'F', mv: { pts: roundPts(Fp), tv: tF.kn }, lag: r3(lag), off: r3(oF0) },
    { role: 'C', mv: { pts: roundPts(Cp), tv: tC.kn } },
    { role: 'P', mv: { pts: roundPts(Pp), tv: tP.kn } },
    ...(Qp ? [{ role: 'Q', mv: { pts: roundPts(Qp), tv: tQ.kn } }] : []),
    { role: 'L', mv: { pts: roundPts(Lp), tv: tL.kn }, lead: r3(lead) },
    ...(C.far ? [{ role: 'D', mv: { pts: roundPts(Dpp), tv: tD.kn }, lead: r3(lead2) }] : []),
    { role: 'S', mv: null },
    ...X,
  ];
  people.forEach((p, i) => { if (i > 0) { Object.assign(p, look(W.COLORS[cols[i - 1]].hex)); p.colorName = W.COLORS[cols[i - 1]].name; } });

  const fins = { T: sgn() * U(55, 125), F: sgn() * U(35, 110) };
  const m = { task: NAME, live: true, people, turns, tStop: r3(tStop), v: r3(v), sA, target: 0, answer: 1,
    arcS: arcS.map((q) => [r3(q[0]), r3(q[1])]), arcT, comp: { tA: r3(tA), tB: r3(tB), vS: r3(vS), dC0: r3(dC0), dC1: r3(dC1) } };
  for (const p of people) {
    if (!p.mv) continue;
    const ts = p.mv.tv[p.mv.tv.length - 1][0];
    stopFin(rng, p, ts, (fins[p.role] ?? (rng.raw() < 0.25 ? 0 : sgn() * U(20, 110))) * DEG);
  }

  const fov = 40;
  const pts = [];
  const tEnd0 = Math.max(...people.filter((p) => p.mv).map(lastT));
  for (let t = 0; t <= tEnd0 + 1e-6; t += 0.5) for (const p of people) if (p.mv) { const P = W.poseAt(p, t); pts.push([P.x, P.z]); }
  { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    if (Math.hypot(x1 - x0, z1 - z0) > 22) return nul('extent'); }
  const grp = []; for (let t = 0; t <= tEnd0 + 1e-6; t += 0.5) grp.push(people.filter((p) => p.mv).map((p) => { const P = W.poseAt(p, t); return [P.x, P.z, p.role]; }));
  let cfit = null, best = -Infinity;
  for (let k = 0; k < 36; k++) {
    let beta; do { beta = U(0, 2 * Math.PI); } while (Math.abs(Math.cos(beta)) > 0.87);
    const el = U(28, 42), az = Math.atan2(-Math.cos(beta), -Math.sin(beta)) / DEG, Cf = fitCamera(pts, az, el, fov, 1.7);
    if (!Cf) continue;
    const h = minBodyPx(Cf, pts) - 6 * coverScore(Cf, grp);
    if (h > best) { best = h; cfit = Cf; }
  }
  if (!cfit) return nul('cfit');
  m.cam = cfit;

  const cm = W.camOf(m.cam), Tpers = people[0];
  const scr = (t) => { const P = W.poseAt(Tpers, t); const q = cm.project(P.x, 0, P.z); return [q.x, q.y]; };
  const s0 = scr(0), s1 = scr(tStop), vs = unit([s1[0] - s0[0], s1[1] - s0[1]]);
  let Sbest = null;
  const bb = [Infinity, -Infinity, Infinity, -Infinity]; for (const q of pts) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.max(bb[1], q[0]); bb[2] = Math.min(bb[2], q[1]); bb[3] = Math.max(bb[3], q[1]); }
  for (let tries = 0; tries < 160 && !Sbest; tries++) {
    const up = rng.raw() < 0.5 ? 1 : -1, bh = U(0.36, 1.0), dir = unit([-vs[0] * bh - vs[1] * up, -vs[1] * bh + vs[0] * up]);
    const T0 = W.poseAt(Tpers, 0), T1 = W.poseAt(Tpers, tStop), dSg = U(2.1, 2.9);
    const g0 = groundAlong(cm, s0, dir, [T0.x, T0.z], dSg), g1 = groundAlong(cm, s1, dir, [T1.x, T1.z], dSg + U(-0.3, 0.3));
    if (!g0 || !g1) { nul('S:plane'); continue; }
    const a0 = g0, a1s = g1;
    const LS = hyp(a0, a1s), pauseS = rng.raw() < 0.5 ? 0 : U(1, 5), vS2 = Math.max(U(0.75, 1.15), LS / (tStop - 0.3 - 1.5 * EASE - pauseS));
    if (vS2 > 1.6) { nul('S:speed'); continue; }
    const Sp = line(a0, a1s);
    const sp = U(0.25, 0.75) * LS, tS = pauseS ? tvBuild(0, vS2, [{ stop: sp }, { wait: pauseS }, { go: vS2 }, { stop: LS }]) : tvBuild(0, vS2, [{ stop: LS }]);
    if (!tS) continue;
    const cand = { role: 'S', mv: { pts: roundPts(Sp), tv: tS.kn }, vS: r3(vS2) };
    if (tries < 60 && ![a0, a1s].every((q) => q[0] >= bb[0] - 0.5 && q[0] <= bb[1] + 0.5 && q[1] >= bb[2] - 0.5 && q[1] <= bb[3] + 0.5)) { nul('S:bbox'); continue; }
    const who = blocker(cand, people, tEnd0, 0.85);
    if (!who) Sbest = cand; else nul('S:clear:' + who);
  }
  if (!Sbest) return nul('S');
  const iS = people.findIndex((q) => q.role === 'S');
  Object.assign(people[iS], Sbest);
  for (let t = 0; t <= tEnd0 + 1e-6; t += 0.5) { const P = W.poseAt(people[iS], t); pts.push([P.x, P.z]); }
  const refit = fitCamera(pts, m.cam.az, m.cam.el, fov, 1.7);
  if (!refit) return nul('refit');
  m.cam = refit;
  stopFin(rng, people[iS], people[iS].mv.tv[people[iS].mv.tv.length - 1][0], (rng.raw() < 0.25 ? 0 : sgn() * U(20, 110)) * DEG);

  const tEnd = Math.max(...people.map(lastT)), stand0 = Math.max(2.3, GATE.T[0] + 0.05 - (C.hold ?? 1.2) - tEnd);
  if (stand0 > 3.0) return nul('short');
  m.T = r3(tEnd + U(stand0, 3.0));
  m.sun = { az: r3(U(0, 360)), el: r3(U(38, 60)) };
  const pv = rng.pick(W.PAVING);
  m.ground = { ...pv, tile: r3(U(0.6, 1.0)), rot: r3(U(0, Math.PI)), bond: rng.raw() < 0.5, band: rng.pick([0, 0, 4, 5, 6]) };
  m.props = [];
  placeProps(m, rng, people);
  const order = [0, ...rng.shuffle(people.map((_, i) => i).slice(1))];
  m.people = order.map((i) => people[i]);
  m.target = 0; m.answer = m.people.findIndex((p) => p.role === 'F');
  m.buttons = rng.shuffle(m.people.map((_, i) => i).filter((i) => i !== 0));
  return m;
}

function groundAlong(cm, s, dir, P, d) {
  const at = (k) => { const g = RT.planeAtPixel(cm, s[0] + dir[0] * k, s[1] + dir[1] * k); return g ? [g.x, g.z] : null; };
  let lo = 8, hi = 160; const gh = at(hi); if (!gh || Math.hypot(gh[0] - P[0], gh[1] - P[1]) < d) return null;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, g = at(mid); if (!g) return null; if (Math.hypot(g[0] - P[0], g[1] - P[1]) < d) lo = mid; else hi = mid; }
  const g = at(hi); return g && hi > 12 ? g : null;
}
function coverScore(C, grp) {
  const cm = W.camOf(C), R = cm.R; let n = 0;
  const box = (x, z) => { const a = cm.project(x - R[0] * 0.23, 0, z - R[2] * 0.23), b = cm.project(x + R[0] * 0.23, 1.76, z + R[2] * 0.23); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), a.z]; };
  for (const G of grp) {
    const bx = G.map((q) => box(q[0], q[1]));
    G.forEach((q, i) => {
      const a = bx[i], area = (a[2] - a[0]) * (a[3] - a[1]); let cov = 0;
      bx.forEach((b, j) => { if (j === i || b[4] >= a[4]) return; cov += Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) / area; });
      if (cov > (q[2] === 'T' || q[2] === 'F' ? 0.3 : 0.45)) n++;
    });
  }
  return n;
}
function minBodyPx(C, pts) {
  const cm = W.camOf(C); let h = Infinity;
  for (const p of pts) { const a = cm.project(p[0], 0, p[1]), b = cm.project(p[0], 1.76, p[1]); h = Math.min(h, a.y - b.y); }
  return h;
}
function fitCamera(pts, az, el, fov, hgt) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  let tgt = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
  const M = 6;
  const bounds = (C) => {
    const cm = W.camOf(C); let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of pts) {
      const R = cm.R;
      for (const s of [-1, 1]) for (const y of [0, hgt]) { const q = cm.project(p[0] + R[0] * 0.3 * s, y, p[1] + R[2] * 0.3 * s); if (!(q.z > 0.5)) return null; a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.y); d = Math.max(d, q.y); }
    }
    return [a, c, b, d];
  };
  const fitAt = (dist) => {
    let C = { az: r3(az), el: r3(el), dist: r3(dist), fov, target: tgt.map(r3) };
    for (let it = 0; it < 4; it++) {
      const b = bounds(C); if (!b) return null;
      const cm = W.camOf(C), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      const g0 = RT.planeAtPixel(cm, VIEW.w / 2, VIEW.h / 2), g1 = RT.planeAtPixel(cm, cx, cy);
      if (!g0 || !g1) return null;
      tgt = [tgt[0] + (g1.x - g0.x), 0, tgt[2] + (g1.z - g0.z)];
      C = { ...C, target: tgt.map(r3) };
    }
    const b = bounds(C);
    return b && b[0] >= M && b[2] <= VIEW.w - M && b[1] >= M && b[3] <= VIEW.h - M ? C : null;
  };
  let lo = 10, hi = 30, best = fitAt(hi);
  if (!best) return null;
  for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2, C = fitAt(mid); if (C) { best = C; hi = mid; } else lo = mid; }
  return best;
}

function placeProps(m, rng, people) {
  const cm = W.cam(m), kinds = ['bench', 'planter', 'lamp', 'bollard', 'bin', 'planter', 'bench', 'lamp'];
  const samp = []; for (let t = 0; t <= m.T; t += 0.2) for (let i = 0; i < people.length; i++) { const P = W.poseAt(people[i], t); samp.push([P.x, P.z, i, t]); }
  const want = 4 + Math.floor(rng.raw() * 4);
  for (let a = 0; a < 200 && m.props.length < want; a++) {
    const kind = kinds[Math.floor(rng.raw() * kinds.length)], px = rng.uniform(0.04, 0.96) * VIEW.w, py = rng.uniform(0.08, 0.97) * VIEW.h;
    const g = RT.planeAtPixel(cm, px, py); if (!g) continue;
    const P = { kind, x: r3(g.x), z: r3(g.z), yaw: r3(rng.uniform(0, 360)) }, R = W.PROP_R[kind];
    if (samp.some((s) => Math.hypot(s[0] - P.x, s[1] - P.z) < R + 0.8)) continue;
    if (m.props.some((q) => Math.hypot(q.x - P.x, q.z - P.z) < R + W.PROP_R[q.kind] + 0.6)) continue;
    const top = W.PROP_H[kind], b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of [-1, 1]) for (const y of [0, top]) { const q = cm.project(P.x + cm.R[0] * R * s, y, P.z + cm.R[2] * R * s); b[0] = Math.min(b[0], q.x); b[1] = Math.min(b[1], q.y); b[2] = Math.max(b[2], q.x); b[3] = Math.max(b[3], q.y); }
    if (b[0] < 0 || b[2] > VIEW.w || b[1] < 0 || b[3] > VIEW.h) continue;
    const dp = cm.project(P.x, 0, P.z).z;
    let blocks = false;
    for (const s of samp) {
      const q = cm.project(s[0], 0, s[1]); if (q.z <= dp) continue;
      const bb = W.bodyBox(m, s[0], s[1], people[s[2]].k);
      if (Math.min(bb[2], b[2]) - Math.max(bb[0], b[0]) > 0 && Math.min(bb[3], b[3]) - Math.max(bb[1], b[1]) > 0) { blocks = true; break; }
    }
    if (blocks) continue;
    m.props.push(P);
  }
}
