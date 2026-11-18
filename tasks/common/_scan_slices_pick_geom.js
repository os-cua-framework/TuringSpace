export const HALF = 1.5;
export const TAB_D = 0.6;
export const TAB_W = 0.8;
export const BOX_HALF = 2.2;
export const RES = 0.1;
export const G = Math.round(2 * BOX_HALF / RES);

export const FAMILIES = ['notch', 'slot', 'tab', 'step', 'hole', 'ramp', 'post'];
export const TOP_ONLY = new Set(['hole', 'ramp', 'post']);
export const VARIANTS = {
  notch: ['FL', 'FR', 'BR', 'BL'],
  slot: ['col', 'row'],
  tab: ['F0', 'F1', 'F2', 'R0', 'R1', 'R2', 'B0', 'B1', 'B2', 'L0', 'L1', 'L2'],
  step: ['F', 'R', 'B', 'L'],
  hole: ['F', 'R', 'B', 'L'],
  ramp: ['F', 'R', 'B', 'L'],
  post: ['FL', 'FR', 'BR', 'BL'],
};

export function mirrorLabel(fam, v) {
  const sw = { FL: 'FR', FR: 'FL', BL: 'BR', BR: 'BL', R: 'L', L: 'R', F: 'F', B: 'B', col: 'col', row: 'row' };
  if (fam === 'tab') {
    const s = v[0], n = +v[1];
    if (s === 'F' || s === 'B') return `${s}${2 - n}`;
    return `${s === 'R' ? 'L' : 'R'}${n}`;
  }
  return sw[v];
}

const CORNER = { FL: [0, 2], FR: [2, 2], BR: [2, 0], BL: [0, 0] };
const HOLE = { F: [-0.4, 0.4, 0.3, 1.1], B: [-0.4, 0.4, -1.1, -0.3], R: [0.3, 1.1, -0.4, 0.4], L: [-1.1, -0.3, -0.4, 0.4] };
const cellRect = (i, k) => [i - HALF, i - HALF + 1, k - HALF, k - HALF + 1];

function cellsToRects(has) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    let i = 0;
    while (i < 3) {
      if (!has(i, k)) { i++; continue; }
      let j = i; while (j + 1 < 3 && has(j + 1, k)) j++;
      out.push([i - HALF, j + 1 - HALF, k - HALF, k + 1 - HALF]);
      i = j + 1;
    }
  }
  return out;
}

export function bandPlan(fam, v) {
  const full = () => true;
  switch (fam) {
    case 'notch': { const [ci, ck] = CORNER[v]; return { rects: cellsToRects((i, k) => !(i === ci && k === ck)), ramp: null }; }
    case 'slot': return { rects: cellsToRects(v === 'col' ? (i) => i !== 1 : (i, k) => k !== 1), ramp: null };
    case 'tab': {
      const s = v[0], n = +v[1], a = n - HALF + (1 - TAB_W) / 2, b = a + TAB_W;
      const t = s === 'F' ? [a, b, HALF, HALF + TAB_D] : s === 'B' ? [a, b, -HALF - TAB_D, -HALF]
        : s === 'R' ? [HALF, HALF + TAB_D, a, b] : [-HALF - TAB_D, -HALF, a, b];
      return { rects: [...cellsToRects(full), t], ramp: null };
    }
    case 'step': {
      const drop = { F: (i, k) => k !== 2, B: (i, k) => k !== 0, R: (i) => i !== 2, L: (i) => i !== 0 }[v];
      return { rects: cellsToRects(drop), ramp: null };
    }
    case 'hole': {
      const h = HOLE[v];
      return { rects: [[-HALF, h[0], -HALF, HALF], [h[1], HALF, -HALF, HALF], [h[0], h[1], -HALF, h[2]], [h[0], h[1], h[3], HALF]], ramp: null };
    }
    case 'plain': return { rects: cellsToRects(full), ramp: null };
    case 'post': {
      const [ci, ck] = CORNER[v], is = ci === 0 ? [0, 1] : [1, 2], ks = ck === 0 ? [0, 1] : [1, 2];
      return { rects: cellsToRects((i, k) => is.includes(i) && ks.includes(k)), ramp: null };
    }
    case 'ramp': return { rects: [], ramp: v };
    default: throw new Error(`bad family ${fam}`);
  }
}

export const RAMP_LIP = 0.3;
export function rampRect(dir, t) {
  const s = -HALF + 2 * HALF * Math.max(0, Math.min(1, (1 - t) / (1 - RAMP_LIP)));
  switch (dir) {
    case 'F': return [-HALF, HALF, -HALF, s];
    case 'B': return [-HALF, HALF, -s, HALF];
    case 'R': return [-HALF, s, -HALF, HALF];
    default: return [-s, HALF, -HALF, HALF];
  }
}

export function objectOf(m, bits) {
  return { Y: m.Y, fams: m.bands.map((b) => b.fam), vars: m.bands.map((b, i) => b.pair[bits[i]]) };
}
export function bandAt(Y, y) { let b = 0; while (b < Y.length - 2 && y >= Y[b + 1]) b++; return b; }

export function sliceRects(obj, y) {
  const b = bandAt(obj.Y, y);
  const p = bandPlan(obj.fams[b], obj.vars[b]);
  const rects = p.rects.slice();
  if (p.ramp) {
    const t = (y - obj.Y[b]) / (obj.Y[b + 1] - obj.Y[b]);
    const r = rampRect(p.ramp, t);
    if (r[1] - r[0] > 1e-6 && r[3] - r[2] > 1e-6) rects.push(r);
  }
  return rects;
}

export function sliceRaster(obj, y) {
  const rects = sliceRects(obj, y), out = new Uint8Array(G * G);
  for (let l = 0; l < G; l++) {
    const z = (2 * l + 1 - G) * (RES / 2);
    for (let j = 0; j < G; j++) {
      const x = (2 * j + 1 - G) * (RES / 2);
      for (const r of rects) if (x > r[0] && x < r[1] && z > r[2] && z < r[3]) { out[l * G + j] = 1; break; }
    }
  }
  return out;
}
export const rasterArea = (r) => { let n = 0; for (let i = 0; i < r.length; i++) n += r[i]; return n; };
export function rasterDiff(a, b) { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }

const SYM = [
  (j, l) => [j, l], (j, l) => [G - 1 - j, l], (j, l) => [j, G - 1 - l], (j, l) => [G - 1 - j, G - 1 - l],
  (j, l) => [l, j], (j, l) => [G - 1 - l, j], (j, l) => [l, G - 1 - j], (j, l) => [G - 1 - l, G - 1 - j],
];
export function symRaster(r, s) {
  const out = new Uint8Array(G * G), f = SYM[s];
  for (let l = 0; l < G; l++) for (let j = 0; j < G; j++) { const [a, b] = f(j, l); out[b * G + a] = r[l * G + j]; }
  return out;
}
export const NSYM = SYM.length;

export function signature(obj) {
  const sig = [];
  for (let b = 0; b < obj.Y.length - 1; b++) for (const f of [0.2, 0.5, 0.8]) sig.push(sliceRaster(obj, obj.Y[b] + f * (obj.Y[b + 1] - obj.Y[b])));
  return sig;
}
export function congruent(sigA, sigB) {
  for (let s = 0; s < NSYM; s++) {
    let same = true;
    for (let i = 0; i < sigA.length && same; i++) if (rasterDiff(symRaster(sigA[i], s), sigB[i]) !== 0) same = false;
    if (same) return true;
  }
  return false;
}
export function pairCongruent(fam, a, b) {
  const p = { Y: [0, 1, 2, 3], fams: [fam, fam, fam], vars: [a, a, a] };
  const q = { Y: [0, 1, 2, 3], fams: [fam, fam, fam], vars: [b, b, b] };
  const ra = [0.2, 0.5, 0.8].map((f) => sliceRaster(p, 2 + f)), rb = [0.2, 0.5, 0.8].map((f) => sliceRaster(q, 2 + f));
  for (let s = 0; s < NSYM; s++) if (ra.every((r, i) => rasterDiff(symRaster(r, s), rb[i]) === 0)) return true;
  return false;
}

export function wedge(dir, y0, y1) {
  const h = y1 - y0, L = 2 * HALF, s = (1 - RAMP_LIP) * h / L;
  const u = { F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] }[dir];
  const n = [s * u[0], 1, s * u[2]], ln = Math.hypot(n[0], n[1], n[2]);
  const pl = [
    1, 0, 0, HALF, -1, 0, 0, HALF, 0, 0, 1, HALF, 0, 0, -1, HALF, 0, -1, 0, -y0,
    n[0] / ln, n[1] / ln, n[2] / ln, (y1 - s * HALF) / ln,
  ];
  return { k: 'cvx', pl, bb: [-HALF, y0, -HALF, HALF, y1, HALF] };
}
export function objectParts(obj) {
  const parts = [];
  for (let b = 0; b < obj.Y.length - 1; b++) {
    const p = bandPlan(obj.fams[b], obj.vars[b]), y0 = obj.Y[b], y1 = obj.Y[b + 1];
    for (const r of p.rects) parts.push({ k: 'box', b: [r[0], r[1], y0, y1, r[2], r[3]] });
    if (p.ramp) parts.push(wedge(p.ramp, y0, y1));
  }
  return parts;
}

const NRM = [0, 0, 0];
function hitPart(p, o, d) {
  if (p.k === 'box') {
    const b = p.b; let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      const lo = b[a * 2], hi = b[a * 2 + 1], oa = o[a], da = d[a];
      if (Math.abs(da) < 1e-12) { if (oa < lo || oa > hi) return Infinity; continue; }
      let t1 = (lo - oa) / da, t2 = (hi - oa) / da, s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tn) { tn = t1; ax = a; sg = s; }
      if (t2 < tf) tf = t2;
      if (tn > tf) return Infinity;
    }
    if (ax < 0 || tn < 0) return Infinity;
    NRM[0] = ax === 0 ? sg : 0; NRM[1] = ax === 1 ? sg : 0; NRM[2] = ax === 2 ? sg : 0;
    return tn;
  }
  const P = p.pl; let tn = -Infinity, tf = Infinity, bi = -1;
  for (let i = 0; i < P.length; i += 4) {
    const den = P[i] * d[0] + P[i + 1] * d[1] + P[i + 2] * d[2];
    const num = P[i + 3] - (P[i] * o[0] + P[i + 1] * o[1] + P[i + 2] * o[2]);
    if (Math.abs(den) < 1e-12) { if (num < 0) return Infinity; continue; }
    const t = num / den;
    if (den < 0) { if (t > tn) { tn = t; bi = i; } } else if (t < tf) tf = t;
    if (tn > tf) return Infinity;
  }
  if (bi < 0 || tn < 0) return Infinity;
  NRM[0] = P[bi]; NRM[1] = P[bi + 1]; NRM[2] = P[bi + 2];
  return tn;
}
export function viewDir(cam) {
  const ya = cam.yaw * Math.PI / 180, el = cam.elev * Math.PI / 180;
  return [Math.sin(ya) * Math.cos(el), Math.sin(el), Math.cos(ya) * Math.cos(el)];
}
export function coarseView(obj, cam, N = 72) {
  const c = viewDir(cam), d = [-c[0], -c[1], -c[2]];
  const r = [Math.cos(cam.yaw * Math.PI / 180), 0, -Math.sin(cam.yaw * Math.PI / 180)];
  const u = [c[1] * r[2] - c[2] * r[1], c[2] * r[0] - c[0] * r[2], c[0] * r[1] - c[1] * r[0]];
  const H = obj.Y[obj.Y.length - 1], parts = objectParts(obj);
  const span = 2.6 + 0.5 * H, cy = H / 2;
  const cls = new Uint8Array(N * N), dep = new Float32Array(N * N);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const a = ((px + 0.5) / N - 0.5) * 2 * span, bb = (0.5 - (py + 0.5) / N) * 2 * span;
    const o = [r[0] * a + u[0] * bb + c[0] * 20, cy + r[1] * a + u[1] * bb + c[1] * 20, r[2] * a + u[2] * bb + c[2] * 20];
    let best = Infinity, n0 = 0, n1 = 0, n2 = 0;
    for (const p of parts) { const t = hitPart(p, o, d); if (t < best) { best = t; n0 = NRM[0]; n1 = NRM[1]; n2 = NRM[2]; } }
    const i = py * N + px;
    if (best === Infinity) continue;
    cls[i] = n1 > 0.99 ? 1 : n1 < -0.99 ? 2 : n0 > 0.99 ? 3 : n0 < -0.99 ? 4 : n2 > 0.99 ? 5 : n2 < -0.99 ? 6 : 7;
    dep[i] = best;
  }
  return { cls, dep, N };
}
export function viewDiff(A, B) {
  let n = 0, obj = 0;
  for (let i = 0; i < A.cls.length; i++) {
    if (A.cls[i] || B.cls[i]) obj++;
    if (A.cls[i] !== B.cls[i] || (A.cls[i] && Math.abs(A.dep[i] - B.dep[i]) > 0.3)) n++;
  }
  return { n, obj };
}
