import * as O from './_shell_game_3d_model.js';
import * as RT from './_props_rt.js';
export * from './_shell_game_3d_model.js';

const { slotX, pose3, projXY, cupMid, occlusion, rayAt, hitBall, hitCup, RB, ballCentre, camBase, world, DEPTH_MAX } = O;

export const VIEW = { w: 500, h: 320 };
const CAMS = new WeakMap();
export function cameraFor(m) {
  if (CAMS.has(m)) return CAMS.get(m);
  const { eye, F, R, U } = camBase(m);
  const proj = (p) => { const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], zc = dx * F[0] + dy * F[1] + dz * F[2];
    return [(dx * R[0] + dy * R[1] + dz * R[2]) / zc, -(dx * U[0] + dy * U[1] + dz * U[2]) / zc]; };
  const r0 = m.cup.r0, x0 = slotX(m, 0) - r0 - 0.015, x1 = slotX(m, m.n - 1) + r0 + 0.015, yd = DEPTH_MAX + r0 + 0.015;
  const pts = [];
  for (const x of [x0, x1]) for (const y of [-yd, yd]) for (const hh of [0, m.cup.h + m.lift + 0.02]) pts.push(world(m, x, y, hh));
  const xs = pts.map((p) => proj(p)[0]), ys = pts.map((p) => proj(p)[1]);
  const a0 = Math.min(...xs), a1 = Math.max(...xs), b0 = Math.min(...ys), b1 = Math.max(...ys);
  const padX = 14, padY = 16;
  const f = Math.min((VIEW.w - 2 * padX) / (a1 - a0), (VIEW.h - 2 * padY) / (b1 - b0));
  const cam = RT.camFromBasis({ eye, F, R, U, f, cx: VIEW.w / 2 - f * (a0 + a1) / 2, cy: VIEW.h / 2 - f * (b0 + b1) / 2, W: VIEW.w, H: VIEW.h });
  CAMS.set(m, cam);
  return cam;
}

export const tau = (m, t) => ((t % m.Lp) + m.Lp) % m.Lp;
export function frameIdx(m, t) { const k = Math.floor(tau(m, t) / m.dt + 1e-6); return k >= m.N ? 0 : k; }
export const FADE = 0;
export const atRest = (m, t) => frameIdx(m, t) >= m.N - 1;
export const ballShows = (m, t) => frameIdx(m, t) === 0;
export const fadeAt = () => 0;
export const loopIndex = (m, t) => Math.floor(t / m.Lp + 1e-6);
export const frameTimes = (m) => Array.from({ length: m.N }, (_, k) => k * m.dt);

export function applySwap(perm, k) { const o = perm.slice(); o[k] = perm[k + 1]; o[k + 1] = perm[k]; return o; }
export function permBefore(m, j) { let p = Array.from({ length: m.n }, (_, i) => i); for (let i = 0; i < j; i++) p = applySwap(p, m.sw[i].k); return p; }
export const finalPerm = (m) => permBefore(m, m.sw.length);

export function baseRows(m, perm, lift = false) {
  const R = new Array(m.n);
  for (let k = 0; k < m.n; k++) R[perm[k]] = { x: slotX(m, k), y: 0, lift: 0, tilt: 0 };
  if (lift) { R[m.ball].lift = m.lift; R[m.ball].tilt = m.tilt; }
  return R;
}
export function buildRows(m) {
  const n = m.n, rows = [], base = (perm, lift) => baseRows(m, perm, lift);
  let perm = Array.from({ length: n }, (_, i) => i);
  rows.push(base(perm, true), base(perm, false));
  for (const s of m.sw) {
    const mid = base(perm, false);
    mid[s.a] = { x: s.mid[0][0], y: s.mid[0][1], lift: 0, tilt: 0 };
    mid[s.b] = { x: s.mid[1][0], y: s.mid[1][1], lift: 0, tilt: 0 };
    rows.push(mid);
    perm = applySwap(perm, s.k);
    rows.push(base(perm, false));
  }
  return rows;
}
const ROWS = new WeakMap();
export function rowsOf(m) { let r = ROWS.get(m); if (!r) { r = buildRows(m); ROWS.set(m, r); } return r; }
export function rowPoses(m, t) { return rowsOf(m)[frameIdx(m, t)]; }
export const poses3At = (m, t) => rowPoses(m, t).map((rp) => pose3(m, rp));
export const poses3Rows = (m, rows) => rows.map((rp) => pose3(m, rp));

export function ballVisible(m, cam, t) {
  const Ps = poses3At(m, t), c = ballCentre(m), q = cam.project(c[0], c[1], c[2]), rp = RB * cam.f / q.z;
  let all = 0, vis = 0;
  for (let y = q.y - rp; y <= q.y + rp; y += 0.75) for (let x = q.x - rp; x <= q.x + rp; x += 0.75) {
    const d = rayAt(cam, x, y), tb = hitBall(c, cam.eye, d);
    if (tb === Infinity) continue;
    all++;
    if (Ps.every((P) => hitCup(m, P, cam.eye, d, tb) === tb)) vis++;
  }
  return all ? vis / all : 0;
}
export function seqFromRows(m, cam, rowsList) {
  return rowsList.map((rows, k) => { const Ps = poses3Rows(m, rows); return { t: k, c: Ps.map((P) => projXY(cam, cupMid(m, P))), occ: occlusion(m, cam, Ps), rest: false }; });
}
export function sampleSeq(m, cam, times) {
  return times.map((t) => { const Ps = poses3At(m, t); return { t, c: Ps.map((P) => projXY(cam, cupMid(m, P))), occ: occlusion(m, cam, Ps), rest: atRest(m, t) }; });
}

const PERMS = {};
function perms(n) { const out = []; const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], rest.filter((_, j) => j !== i))); }; rec([], Array.from({ length: n }, (_, i) => i)); return out; }
export function readSeq(m, F, { mode = 'nn', visible = true } = {}) {
  const n = m.n, P = PERMS[n] || (PERMS[n] = perms(n));
  const pos = F[0].c.map((p) => p.slice()), lab = Array.from({ length: n }, (_, i) => i), vel = F[0].c.map(() => [0, 0]);
  for (let k = 1; k < F.length; k++) {
    const obs = []; for (let i = 0; i < n; i++) if (!visible || F[k].occ[i] < O.HIDDEN) obs.push(i);
    const pred = pos.map((p, j) => (mode === 'vel' ? [p[0] + vel[j][0], p[1] + vel[j][1]] : p));
    let best = null, bc = Infinity;
    for (const pr of P) {
      let c = 0;
      for (let i = 0; i < obs.length; i++) { const o = F[k].c[obs[i]], q = pred[pr[i]]; c += (o[0] - q[0]) ** 2 + (o[1] - q[1]) ** 2; }
      if (c < bc - 1e-9) { bc = c; best = pr; }
    }
    const hit = new Set();
    for (let i = 0; i < obs.length; i++) { const j = best[i], o = F[k].c[obs[i]]; vel[j] = [o[0] - pos[j][0], o[1] - pos[j][1]]; pos[j] = o.slice(); lab[j] = obs[i]; hit.add(j); }
    for (let j = 0; j < n; j++) if (!hit.has(j)) pos[j] = pred[j].slice();
  }
  return lab;
}
