import { mulberry32, R } from '../core/rng.js';
import * as G from './_cat_hide_where_gen.js';
import * as W from './_cat_hide_where_scene.js';
import { r2, r3, mix32, attempts } from './_f16_frames.js';

export const FG = {
  nMax: 16,
  stepM: 0.6,
  stepPx: 90,
  clear: 0.45,
  hid: 0.12,
  seen: 0.15,
  lastSeenGap: 0.3,
  nPieces: [7, 8],
};

const BIT = (j) => 1 << j;
export function design(m) {
  const an = G.analyse(m), dt = G.GATE.dt, K = an.n, vf = an.vf;
  if (an.iv < 0) return 'never';
  const runs = an.runs.filter((r) => r[1] < an.tv - 1e-9 && r[1] - r[0] + dt >= G.GATE.passMin);
  if (runs.length !== 1) return 'runs';
  const [, , i0, i1] = runs[0];
  let ib = i0 - 1; while (ib > 0 && vf[ib] < FG.clear) ib--;
  let ia = i1 + 1; while (ia < K && vf[ia] < FG.clear) ia++;
  if (ib < 1 || ia >= an.iv) return 'ib-ia';
  const ih1 = Math.round(i0 + 0.3 * (i1 - i0)), ih2 = Math.round(i0 + 0.7 * (i1 - i0));
  const nearA = (i) => vf[i] >= 0.35 && an.cen[i] && an.blkA[i] >= 0.1 && G.screenNearest(m, an.cen[i]).id === m.nearA && W.blockedBy(W.probeAt(m, an.ts[i]), m.answer) === 0;
  let iv = an.iv; while (iv > ia && !nearA(iv)) iv--;
  if (iv <= ia) return 'lastseen';
  const last = K - 1;
  let ip = an.iv + Math.round(0.5 / dt); while (ip < last && vf[ip] > 0) ip++;
  if (ip > last - 6) { ip = Math.round((an.iv + last) / 2); while (ip < last && vf[ip] > 0) ip++; }
  if (vf[ip] > 0 || ip - iv < 6 || last - ip < 3) return 'ip';
  const key = [0, ib, ih1, ih2, ia, iv, ip, last];
  for (let k = 1; k < key.length; k++) if ((key[k] - key[k - 1]) * dt < FG.lastSeenGap - 1e-9) return null;
  const idxs = [key[0]];
  for (let k = 1; k < key.length; k++) {
    const a = key[k - 1], b = key[k];
    const sa = W.catPose(m, an.ts[a]).s, sb = W.catPose(m, an.ts[b]).s, ds = sb - sa;
    const bothHidden = vf[a] <= FG.hid && vf[b] <= FG.hid;
    const noFill = (k >= 2 && k <= 4) || k === 6;
    const cnt = bothHidden || noFill ? 0 : Math.max(0, Math.ceil(ds / FG.stepM - 1e-9) - 1);
    for (let q = 1; q <= cnt; q++) {
      const tt = W.timeAtS(m, sa + ds * q / (cnt + 1));
      let i = Math.round(tt / dt);
      if (i <= idxs[idxs.length - 1] + 2) i = idxs[idxs.length - 1] + 3;
      if (i >= b - 2) continue;
      const wantA = an.ts[i] >= an.ts[iv] - G.GATE.nearWin;
      if (wantA && !(vf[i] >= 0.3 && an.cen[i] && G.screenNearest(m, an.cen[i]).id === m.nearA)) {
        let best2 = -1;
        for (let d = 1; d <= 10 && best2 < 0; d++) for (const s2 of [-1, 1]) { const j = i + s2 * d; if (j > idxs[idxs.length - 1] + 2 && j < b - 2 && vf[j] >= 0.3 && an.cen[j] && G.screenNearest(m, an.cen[j]).id === m.nearA) { best2 = j; break; } }
        if (best2 >= 0) i = best2;
      }
      if (vf[i] < 0.3) { let best = -1; for (let d = 1; d <= 12 && best < 0; d++) for (const s of [-1, 1]) { const j = i + s * d; if (j > idxs[idxs.length - 1] + 2 && j < b - 2 && vf[j] >= 0.3) { best = j; break; } } if (best < 0) return 'dip'; i = best; }
      idxs.push(i);
    }
    idxs.push(b);
  }
  if (idxs.length > FG.nMax) return 'n>' + FG.nMax;
  return idxs.map((i) => r3(an.ts[i]));
}

export function roomProblem(m) {
  const g = G.GATE, an = G.analyse(m), { vf, n } = an, B = m.furn[m.answer], A = m.furn[m.nearA];
  if (!Array.isArray(m.furn) || m.furn.length < FG.nPieces[0] || m.furn.length > FG.nPieces[1]) return 'furn';
  if (B.kind === 'cabinet' || m.passes.includes(m.answer) || m.furn[m.cabinet].kind !== 'cabinet' || m.furn.filter((F) => F.kind === 'cabinet').length !== 1) return 'roles';
  if (m.passes.length !== 1 || m.passes[0] !== m.nearA) return 'roles:A';
  const pr0 = W.probeAt(m, 0); let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < pr0.n; i++) { x0 = Math.min(x0, pr0.pts2[2 * i]); x1 = Math.max(x1, pr0.pts2[2 * i]); }
  if (!(vf[0] > 0.1) || !(x0 < 4 || x1 > W.VIEW.w - 4)) return 'entry:0';
  if (an.iv < 0) return 'never';
  const runs = an.runs.filter((r) => r[1] < an.tv - 1e-9), long = runs.filter((r) => r[1] - r[0] + g.dt >= g.passMin);
  if (long.length !== 1) return 'pass:count';
  const [h0, , i0, i1] = long[0], mid = (i0 + i1) >> 1, p = an.pos[mid];
  if (!(an.noPass[0][mid] >= g.passAlone)) return 'pass:alone';
  if (W.stripDist(A, p[0], p[1]) > 0.3) return 'pass:where';
  if (h0 < 0.8) return 'firstwalk';
  const iE = i1 + 1;
  if (an.iv - iE < Math.round(1.0 / g.dt)) return 'final:short';
  const iR = n - 1;
  if (vf[iR] !== 0 || an.vfNoA[iR] !== 0 || !(an.vfNoB[iR] >= g.restAloneB)) return 'rest';
  for (let i = 0; i < n; i++) if (an.vfNoCab[i] !== vf[i]) return 'cab:hides';
  if (!an.cen[an.iv]) return 'vanish:cen';
  const cam = W.camCached(m), pv = an.pos[an.iv], dCat = cam.project(pv[0], 0.15, pv[1]).z;
  if (dCat - G.pieceDepth(m, m.nearA) < g.nearDepth) return 'trap:depth';
  if (W.stripDist(A, pv[0], pv[1]) < g.vanishFarA) return 'trap:farA';
  if (W.stripDist(B, pv[0], pv[1]) > g.vanishNearB) return 'trap:nearB';
  const S = G.screenInfo(m);
  for (const s of S) {
    if (!s.pt || s.frac < g.pieceVis || s.vis < g.pieceArea) return 'piece:vis';
    const b = s.abox; if (!b || b[0] < g.margin || b[1] < g.margin || b[2] > W.VIEW.w - g.margin || b[3] > W.VIEW.h - g.margin) return 'piece:frame';
  }
  const areas = S.map((s) => s.vis), ac = areas[m.cabinet], other = Math.max(...areas.filter((_, j) => j !== m.cabinet));
  if (!(ac >= g.cabRatio * other)) return 'cab:size';
  return '';
}

export function frameData(m) {
  const taus = m.f16.taus, S = G.screenInfo(m), bit = BIT;
  return taus.map((t) => {
    const pose = W.catPose(m, t), pr = W.probeAt(m, t, pose);
    const vf = W.visFrac(pr), cen = W.visCentroid(pr);
    return { t, pose, vf, vfNoA: W.visFrac(pr, bit(m.nearA)), vfNoB: W.visFrac(pr, bit(m.answer)), vfNoCab: W.visFrac(pr, bit(m.cabinet)), cen,
      blkA: W.blockedBy(pr, m.nearA), nearest: cen && vf >= FG.seen ? G.screenNearest(m, cen).id : -1,
      blocked: m.furn.map((_, j) => W.blockedBy(pr, j)), pr, S };
  });
}
export function staticReadings(m) {
  const S = G.screenInfo(m), n = m.furn.length, cab = m.cabinet, idx = [...Array(n).keys()];
  const area = S.map((s) => s.vis), hgt = S.map((s) => s.box[3] - s.box[1]), dep = idx.map((j) => G.pieceDepth(m, j));
  const arg = (xs, f, skipCab) => { let b = -1; for (const j of idx) { if (skipCab && j === cab) continue; if (b < 0 || f(xs[j], xs[b])) b = j; } return b; };
  const gt = (a, b) => a > b, lt = (a, b) => a < b;
  return { biggest: arg(area, gt, false), biggestNoCab: arg(area, gt, true), tallest: arg(hgt, gt, false),
    nearest: arg(dep, lt, false), farthest: arg(dep, gt, false), farthestNoCab: arg(dep, gt, true) };
}

export function frameProblem(m) {
  const f = m.f16;
  if (!f || !Array.isArray(f.taus)) return 'no-frames';
  const taus = f.taus, n = taus.length;
  if (n < 6 || n > FG.nMax) return 'n';
  for (let k = 1; k < n; k++) if (!(taus[k] > taus[k - 1])) return 'order';
  if (taus[0] !== 0) return 'first';
  const D = frameData(m), vis = D.map((d) => d.vf >= FG.seen), hid = D.map((d) => d.vf <= FG.hid);
  if (!(D[0].vf > 0.1)) return 'f1:cat';
  let r0 = -1;
  for (let k = 1; k < n - 1; k++) if (hid[k] && hid[k + 1] && r0 < 0) r0 = k;
  if (r0 < 0) return 'pass:2frames';
  let r1 = r0; while (r1 + 1 < n && hid[r1 + 1]) r1++;
  if (r1 - r0 + 1 !== 2) return 'pass:len';
  if (!(D[r0 - 1].vf >= FG.clear) || !(D[r1 + 1].vf >= FG.clear)) return 'pass:around';
  if (!(D[r0].vfNoA >= G.GATE.passAlone) || !(D[r1].vfNoA >= G.GATE.passAlone)) return 'pass:alone';
  for (const k of [r0, r1]) { const p = D[k].pose; if (W.stripDist(m.furn[m.nearA], p.x, p.z) > 0.3) return 'pass:where'; }
  let lv = -1; for (let k = n - 1; k >= 0; k--) if (vis[k]) { lv = k; break; }
  if (lv < r1 + 2 || lv > n - 3) return 'end:hidden';
  for (let k = lv + 1; k < n; k++) if (D[k].vf > 0) return 'end:peek';
  if (D[n - 1].vf !== 0 || D[n - 1].vfNoA !== 0 || !(D[n - 1].vfNoB >= G.GATE.restAloneB)) return 'end:rest';
  for (let k = r1 + 1; k < lv; k++) if (D[k].vf < 0.3) return 'walk:dip';
  if (lv - (r1 + 1) + 1 < 3) return 'walk:short';
  for (const d of D) if (d.vfNoCab !== d.vf) return 'cab';
  for (let k = 1; k < n; k++) {
    if (!vis[k] || !vis[k - 1]) continue;
    const a = D[k - 1].pose, b = D[k].pose;
    if (Math.hypot(a.x - b.x, a.z - b.z) > FG.stepM * 1.15) return 'step:floor';
    if (Math.hypot(D[k].cen[0] - D[k - 1].cen[0], D[k].cen[1] - D[k - 1].cen[1]) > FG.stepPx) return 'step:screen';
  }
  const fin = []; for (let k = r1 + 1; k <= lv; k++) if (taus[k] >= taus[lv] - G.GATE.nearWin - 1e-9) fin.push(k);
  const nA = fin.filter((k) => D[k].nearest === m.nearA).length;
  if (fin.length < 2 || nA / fin.length < 0.6 || D[lv].nearest !== m.nearA) return 'trap:near';
  if (!(D[lv].blkA >= 0.1 || G.touchPx(m, taus[lv], m.nearA) <= G.GATE.touchPx)) return 'trap:touch';
  let ok = 0; for (const k of fin) if (G.aimReading(m, [D[k].pose.x, D[k].pose.z], D[k].pose.yaw) === m.answer) ok++;
  if (ok / fin.length < 0.6) return 'reader';
  { const au = frameAudit(m, D); if (au.singleFrame) return 'single:' + au.hits.map((h) => h.split(':')[0] + ':' + h.split(':')[1]).join(','); }
  return '';
}

export function frameAudit(m, D = frameData(m)) {
  const n = D.length, st = staticReadings(m), B = m.answer;
  const hit = {};
  for (const [k, v] of Object.entries(st)) hit['static:' + k] = v === B;
  hit['frame1:nearest'] = D[0].nearest === B;
  let lv = -1; for (let k = n - 1; k >= 0; k--) if (D[k].vf >= FG.seen) { lv = k; break; }
  if (lv >= 0) {
    const bl = D[lv].blocked, top = bl.indexOf(Math.max(...bl));
    hit['lastSeen:nearest'] = D[lv].nearest === B;
    hit['lastSeen:covering'] = Math.max(...bl) > 0 && top === B;
    hit['lastSeen:box'] = D[lv].cen ? G.screenBoxPiece(m, D[lv].cen) === B : false;
  }
  hit['lastFrame:cat'] = D[n - 1].vf >= FG.seen;
  const blindHits = D.filter((d) => d.nearest === B).length;
  const names = Object.keys(hit).filter((k) => hit[k] && k !== 'lastFrame:cat');
  return { singleFrame: names.length > 0 || hit['lastFrame:cat'], hits: names, n, lastSeenFrame: lv + 1, blindHits };
}

export const _stats = {};
const fail = (w) => { _stats[w] = (_stats[w] || 0) + 1; return null; };
export function generate(rng, maxAttempts = 100000) {
  const key = Math.floor(rng.raw() * 4294967296) >>> 0;
  const r0 = mulberry32(mix32(key, 0x5eed0000));
  const plan = { bKind: W.HIDERS[Math.floor(r0() * W.HIDERS.length)], n: r0() < 0.5 ? FG.nPieces[0] : FG.nPieces[1], np: 1 };
  const hold = r3(0.8 + 0.7 * r0()), flip = r0() < 0.5;
  plan.flip = flip; plan.cell = Math.floor(r0() * 3);
  for (const a of attempts('f16_cat_hide', key, maxAttempts)) {
    const m = G._tryBuild(R(mulberry32(mix32(key, a))), plan);
    if (!m) continue;
    m.hold = hold; m.flip = flip;
    const st = staticReadings(m);
    if (Object.values(st).some((v) => v === m.answer)) { fail('static'); continue; }
    const why = roomProblem(m);
    if (why) { fail('g:' + why); continue; }
    const taus = design(m);
    if (typeof taus === 'string') { fail('design:' + taus); continue; }
    m.f16 = { taus };
    const fp = frameProblem(m);
    if (fp) { fail('f:' + fp); continue; }
    if (G.restPixelDiff(m, 1) + G.restPixelDiff(m, 2) > 0) { fail('pixels'); continue; }
    const S = G.screenInfo(m);
    m.taps = S.map((s) => [r2(m.flip ? W.VIEW.w - s.pt[0] : s.pt[0]), r2(s.pt[1])]);
    const an = G.analyse(m);
    const runs = an.runs.filter((r) => r[1] - r[0] + G.GATE.dt >= G.GATE.passMin && r[1] < an.tv);
    m.events = { passes: runs.map((r) => [r[0], r2(r[1] + G.GATE.dt)]), vanish: an.tv, rest: m.tRest };
    m.attempt = a; m.key = key;
    return m;
  }
  throw new Error('f16_cat_hide: generator exhausted');
}
