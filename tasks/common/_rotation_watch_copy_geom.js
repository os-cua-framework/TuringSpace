import { _internals as RA } from '../D_mental_transformation/rotation_analogy.js';
import { hexRGB, rgbHex, shade, mix } from './_block_mat.js';

export const { library, key, tf, ROT, legible, stabilizer, canonAny } = RA;

export function axisTurn(axis, q) {
  const c = [1, 0, -1, 0][q & 3], s = [0, 1, 0, -1][q & 3];
  if (axis === 'z') return [c, -s, 0, s, c, 0, 0, 0, 1];
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function mul(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}
export const ID = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
export const ap = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
export const matEq = (A, B) => A.every((v, i) => Math.abs(v - B[i]) < 1e-9);
export const transpose = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
export const AXES = ['x', 'y', 'z'];
export const UNIT = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export const qturn = (axis, dir) => axisTurn(axis, dir > 0 ? 1 : 3);
export function rotAxis(axis, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 'z') return [c, -s, 0, s, c, 0, 0, 0, 1];
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export const rotDeg = (M) => Math.round(Math.acos(Math.max(-1, Math.min(1, (M[0] + M[4] + M[8] - 1) / 2))) * 180 / Math.PI);
export const mkey = (M) => M.map((v) => Math.round(v)).join(',');
export const axisOfVec = (v) => { const a = v.map(Math.abs); return a[0] > 0.5 ? 'x' : a[1] > 0.5 ? 'y' : 'z'; };
export const third = (a, b) => AXES.find((q) => q !== a && q !== b);

export const VIEW = (() => {
  const al = 28 * Math.PI / 180, ph = 34 * Math.PI / 180;
  return {
    ex: { x: Math.sin(al), y: Math.sin(ph) * Math.cos(al) },
    ey: { x: -Math.cos(al), y: Math.sin(ph) * Math.sin(al) },
    ez: { x: 0, y: -Math.cos(ph) },
    v: [Math.cos(ph) * Math.cos(al), Math.cos(ph) * Math.sin(al), Math.sin(ph)],
  };
})();
export const proj = (p) => ({ x: p[0] * VIEW.ex.x + p[1] * VIEW.ey.x + p[2] * VIEW.ez.x, y: p[0] * VIEW.ex.y + p[1] * VIEW.ey.y + p[2] * VIEW.ez.y });
export const depth = (p) => p[0] * VIEW.v[0] + p[1] * VIEW.v[1] + p[2] * VIEW.v[2];
export function screenAngle(d) { const q = proj(d); let a = Math.atan2(q.y, q.x) * 180 / Math.PI; a = ((a % 180) + 180) % 180; return a; }
export const angDiff180 = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

export const PAL = {
  body: { top: '#f4e6c8', left: '#dcbf8f', right: '#bf9a66' },
  mark: { top: '#f6ae9c', left: '#dc7b64', right: '#bb5d48' },
  line: '#3b2e22',
};
const SIX = (p) => ({
  px: hexRGB(p.right), py: hexRGB(p.left), pz: hexRGB(p.top),
  nx: hexRGB(shade(p.right, 0.86)), ny: hexRGB(shade(p.left, 0.84)), nz: hexRGB(mix(shade(p.right, 0.72), p.left, 0.2)),
});
const SIXES = { body: SIX(PAL.body), mark: SIX(PAL.mark) };
function faceColour(N, which) {
  const S = SIXES[which], c = [0, 0, 0];
  const add = (w, col) => { c[0] += w * col[0]; c[1] += w * col[1]; c[2] += w * col[2]; };
  add(N[0] * N[0], N[0] >= 0 ? S.px : S.nx); add(N[1] * N[1], N[1] >= 0 ? S.py : S.ny); add(N[2] * N[2], N[2] >= 0 ? S.pz : S.nz);
  return rgbHex(c);
}

const FACES = [
  { n: [1, 0, 0], t1: [0, 1, 0], t2: [0, 0, 1] }, { n: [-1, 0, 0], t1: [0, 1, 0], t2: [0, 0, 1] },
  { n: [0, 1, 0], t1: [1, 0, 0], t2: [0, 0, 1] }, { n: [0, -1, 0], t1: [1, 0, 0], t2: [0, 0, 1] },
  { n: [0, 0, 1], t1: [1, 0, 0], t2: [0, 1, 0] }, { n: [0, 0, -1], t1: [1, 0, 0], t2: [0, 1, 0] },
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const EDGE_OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const centroid = (cells) => [0, 1, 2].map((k) => cells.reduce((s, c) => s + [c.x, c.y, c.z][k], 0) / cells.length);
export function polys(cells, M, cx, cy, e) {
  const C = centroid(cells), occ = new Map(cells.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  const at = (x, y, z) => occ.get(`${x},${y},${z}`);
  const scr = (p) => { const w = ap(M, [p[0] - C[0], p[1] - C[1], p[2] - C[2]]), q = proj(w); return { x: cx + q.x * e, y: cy + q.y * e }; };
  const order = cells.map((c) => ({ c, d: depth(ap(M, [c.x - C[0], c.y - C[1], c.z - C[2]])) })).sort((a, b) => a.d - b.d);
  const out = [];
  for (const { c } of order) for (const F of FACES) {
    const n = F.n;
    if (at(c.x + n[0], c.y + n[1], c.z + n[2])) continue;
    const N = ap(M, n);
    if (depth(N) <= 1e-6) continue;
    const pts = CORN.map(([a, b]) => scr([c.x + 0.5 * (n[0] + a * F.t1[0] + b * F.t2[0]), c.y + 0.5 * (n[1] + a * F.t1[1] + b * F.t2[1]), c.z + 0.5 * (n[2] + a * F.t1[2] + b * F.t2[2])]));
    const edges = [];
    for (let i = 0; i < 4; i++) {
      const [u, w] = EDGE_OUT[i], t = [u * F.t1[0] + w * F.t2[0], u * F.t1[1] + w * F.t2[1], u * F.t1[2] + w * F.t2[2]];
      const nb = at(c.x + t[0], c.y + t[1], c.z + t[2]);
      if (nb && !at(c.x + t[0] + n[0], c.y + t[1] + n[1], c.z + t[2] + n[2]) && nb.k === c.k) continue;
      edges.push(i);
    }
    out.push({ pts, fill: faceColour(N, c.k ? 'mark' : 'body'), edges });
  }
  return out;
}
export function drawPose(g, cells, M, cx, cy, e) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const P of polys(cells, M, cx, cy, e)) {
    g.beginPath(); P.pts.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath();
    g.fillStyle = P.fill; g.fill();
    g.strokeStyle = P.fill; g.lineWidth = 0.6; g.stroke();
    g.strokeStyle = PAL.line; g.lineWidth = 1.5;
    for (const i of P.edges) { const a = P.pts[i], b = P.pts[(i + 1) % 4]; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  }
  g.restore();
}
export function extent(cells, M, e) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const C = centroid(cells);
  for (const q of cells) for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
    const p = proj(ap(M, [q.x + dx - C[0], q.y + dy - C[1], q.z + dz - C[2]]));
    a = Math.min(a, p.x * e); b = Math.min(b, p.y * e); c = Math.max(c, p.x * e); d = Math.max(d, p.y * e);
  }
  return [a, b, c, d];
}

export const A_CELLS = Object.freeze([{ x: 0, y: 0, z: 0, k: 0 }, { x: 1, y: 0, z: 0, k: 0 }, { x: 2, y: 0, z: 0, k: 0 }]);
export const ease = (u, w) => { const v = Math.max(0, Math.min(1, u)); return (1 - w) * v + w * v * v * (3 - 2 * v); };
export function segments(A) {
  const s = [], h = A.holds, d = A.turns.map((t) => t.d);
  let t = 0;
  s.push({ kind: 'hold', i: 0, t0: t, t1: (t += h[0]) });
  s.push({ kind: 'turn', i: 0, t0: t, t1: (t += d[0]) });
  s.push({ kind: 'hold', i: 1, t0: t, t1: (t += h[1]) });
  s.push({ kind: 'turn', i: 1, t0: t, t1: (t += d[1]) });
  s.push({ kind: 'hold', i: 2, t0: t, t1: (t += h[2]) });
  return s;
}
export const loopLenA = (A) => A.holds[0] + A.holds[1] + A.holds[2] + A.turns[0].d + A.turns[1].d;
export function aPoseAt(A, tau) {
  const S = segments(A), L = S[S.length - 1].t1, x = ((tau % L) + L) % L;
  const R = A.turns.map((t) => qturn(t.axis, t.dir));
  const P = [A.P0, mul(R[0], A.P0), mul(R[1], mul(R[0], A.P0))];
  const seg = S.find((q) => x >= q.t0 && x < q.t1) || S[S.length - 1];
  const u = (x - seg.t0) / (seg.t1 - seg.t0);
  if (seg.kind === 'hold') return { M: P[seg.i], seg: seg.kind, i: seg.i, u, theta: 0 };
  const T = A.turns[seg.i], th = 90 * ease(u, A.easeW);
  return { M: mul(rotAxis(T.axis, T.dir * th * Math.PI / 180), P[seg.i]), seg: seg.kind, i: seg.i, u, theta: th };
}
export const barDir = (A, tau) => ap(aPoseAt(A, tau).M, [1, 0, 0]);
export const VEIL = { s: 0.45, a: 0.75 };
export function veilAt(A, tau) {
  const L = loopLenA(A), x = ((tau % L) + L) % L;
  return x > L - VEIL.s ? VEIL.a * (x - (L - VEIL.s)) / VEIL.s : 0;
}

export function drawTurnIcon(g, axis, dir, cx, cy, col = '#3c4955') {
  const e = 9, A = UNIT[axis], L = 23, pa = proj(A);
  const b1 = UNIT[{ x: 'y', y: 'z', z: 'x' }[axis]], b2 = UNIT[{ x: 'z', y: 'x', z: 'y' }[axis]];
  const r = 17, off = 0.25;
  const P = (ph) => { const w = [0, 1, 2].map((k) => r * (Math.cos(ph) * b1[k] + Math.sin(ph) * b2[k]) + off * r * A[k]); const q = proj(w); return { x: cx + q.x, y: cy + q.y, d: depth(w) }; };
  let front = 0, bd = -Infinity; for (let k = 0; k < 144; k++) { const ph = k * Math.PI / 72, d = P(ph).d; if (d > bd) { bd = d; front = ph; } }
  const a0 = front - dir * 215 * Math.PI / 180, a1 = front + dir * 55 * Math.PI / 180, N = 60;
  const arc = (near) => {
    g.beginPath(); let on = false;
    for (let k = 0; k <= N; k++) {
      const q = P(a0 + (a1 - a0) * k / N), isNear = q.d >= -0.5;
      if (isNear === near) { if (on) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); on = true; } } else on = false;
    }
    g.stroke();
  };
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalAlpha = 0.5; g.lineWidth = 1.6; g.setLineDash([3, 2.5]);
  g.beginPath(); g.moveTo(cx - pa.x * L, cy - pa.y * L); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]);
  g.lineWidth = 2.0; arc(false); g.globalAlpha = 1;
  g.restore();
  drawPose(g, [{ x: 0, y: 0, z: 0, k: 0 }], ID, cx, cy, e);
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 1.6; g.setLineDash([3, 2.5]);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + pa.x * L, cy + pa.y * L); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.arc(cx + pa.x * L, cy + pa.y * L, 2.2, 0, Math.PI * 2); g.fill();
  g.lineWidth = 2.4; arc(true);
  const qe = P(a1), qp = P(a1 - dir * 0.2), ang = Math.atan2(qe.y - qp.y, qe.x - qp.x);
  g.beginPath(); g.moveTo(qe.x + 4.5 * Math.cos(ang), qe.y + 4.5 * Math.sin(ang));
  g.lineTo(qe.x - 6 * Math.cos(ang) + 5 * Math.sin(ang), qe.y - 6 * Math.sin(ang) - 5 * Math.cos(ang));
  g.lineTo(qe.x - 6 * Math.cos(ang) - 5 * Math.sin(ang), qe.y - 6 * Math.sin(ang) + 5 * Math.cos(ang)); g.closePath(); g.fill();
  g.restore();
}
