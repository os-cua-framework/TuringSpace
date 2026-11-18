import { drawPromptText, UI_FONT, rr } from '../core/panel.js';
import * as RT from '../common/_sofa_through_door_rt.js';
import * as G from '../common/_sofa_through_door_geom.js';
import * as SC from '../common/_sofa_through_door_scene.js';
import { splitIds } from '../core/style.js';
import * as K from '../common/_scene_tex_kit.js';

const BOARD = { w: 340, h: 400 };
const VIEW = { w: 340, h: 350 };
const T = 0.14;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const LEG = [0.71, 0.8];

function canonical(rng) {
  const L = r2(rng.uniform(1.85, 2.15)), W = r2(rng.uniform(0.76, 0.88));
  const diag = (L + W) / Math.SQRT2;
  const a = r2(diag * rng.uniform(LEG[0], LEG[1])), b = r2(diag * rng.uniform(LEG[0], LEG[1]));
  const lw = r2(rng.uniform(3.7, 4.4)), ld = r2(rng.uniform(3.4, 4.0));
  const hz0 = r2(rng.uniform(0.35, ld - a - 0.35));
  const hlen = r2(rng.uniform(0.7, 1.7)), vlen = r2(rng.uniform(0.7, 1.5));
  const j1 = r2(rng.uniform(0.1, 0.2)), j2 = r2(rng.uniform(0.1, 0.2));
  const hx0 = lw + T, cx1 = r2(hx0 + hlen + b), vz1 = r2(hz0 + a), bz1 = r2(hz0 - vlen - T);
  const bw = r2(rng.uniform(3.6, 4.3)), bd = r2(rng.uniform(3.0, 3.5));
  const bedW = r2(rng.uniform(1.4, 1.6)), bedL = 2.0;
  const lo = Math.max(hx0, cx1 + bedW + 0.5 - bw), hi = cx1 - b - 0.15;
  if (lo > hi) return null;
  const bx0 = r2(rng.uniform(lo, hi)), bx1 = r2(bx0 + bw), bz0 = r2(bz1 - bd);
  const floors = [
    { kind: 'living', x0: 0, z0: 0, x1: lw, z1: ld },
    { kind: 'door1', x0: lw, z0: hz0 + j1, x1: hx0, z1: vz1 - j1 },
    { kind: 'hl', x0: hx0, z0: hz0, x1: cx1, z1: vz1 },
    { kind: 'vl', x0: r2(cx1 - b), z0: r2(bz1 + T), x1: cx1, z1: vz1 },
    { kind: 'door2', x0: r2(cx1 - b + j2), z0: bz1, x1: r2(cx1 - j2), z1: r2(bz1 + T) },
    { kind: 'bedroom', x0: bx0, z0: bz0, x1: bx1, z1: bz1 },
  ];
  const ex = r2(rng.uniform(0.05, Math.max(0.06, Math.min(0.5, bx1 - cx1 - bedW - 0.45))));
  const bed = [r2(bx1 - ex - bedW), r2(bz0 + 0.02), r2(bx1 - ex), r2(bz0 + 0.02 + bedL)];
  const furniture = [{ kind: 'bed', rect: bed, head: [0, -1] }];
  if (bed[0] - 0.5 > cx1 - j2 + 0.05 || bed[0] - 0.5 > bx0 + 0.1) furniture.push({ kind: 'stand', rect: [r2(bed[0] - 0.48), r2(bz0 + 0.04), r2(bed[0] - 0.06), r2(bz0 + 0.44)] });
  if (ex > 0.5) furniture.push({ kind: 'stand', rect: [r2(bed[2] + 0.04), r2(bz0 + 0.04), r2(Math.min(bx1 - 0.02, bed[2] + 0.46)), r2(bz0 + 0.44)] });
  const rugs = [];
  const rw = r2(Math.min(lw - 1.0, rng.uniform(2.0, 2.6))), rdp = r2(Math.min(ld - 1.0, rng.uniform(1.5, 1.9)));
  const rcx = lw / 2 + rng.uniform(-0.2, 0.2), rcz = ld / 2 + rng.uniform(-0.2, 0.2);
  rugs.push({ x0: r2(rcx - rw / 2), z0: r2(rcz - rdp / 2), x1: r2(rcx + rw / 2), z1: r2(rcz + rdp / 2), pal: rng.int(0, 3) });
  rugs.push({ x0: r2(bed[0] - 0.2), z0: r2(bed[3] - 0.5), x1: r2(Math.min(bx1 - 0.1, bed[2] + 0.2)), z1: r2(Math.min(bz1 - 0.15, bed[3] + 0.55)), pal: rng.int(0, 3) });
  const kind = rng.int(0, 2);
  let start;
  if (kind === 0) start = { x: r2(W / 2 + 0.08), z: r2(rng.uniform(L / 2 + 0.25, ld - L / 2 - 0.25)), f: [1, 0] };
  else if (kind === 1) { const f = rng.pick([[1, 1], [1, -1], [-1, 1], [-1, -1]]); start = { x: r2(lw * rng.uniform(0.38, 0.5)), z: r2(ld * rng.uniform(0.42, 0.58)), f: [f[0] / Math.SQRT2, f[1] / Math.SQRT2] }; }
  else start = { x: r2(lw * rng.uniform(0.32, 0.48)), z: r2(ld * rng.uniform(0.42, 0.58)), f: rng.pick([[1, 0], [-1, 0]]) };
  const ps = 0.44, corner = rng.pick([[0.06, 0.06], [0.06, ld - ps - 0.06]]);
  furniture.push({ kind: 'plant', rect: [r2(corner[0]), r2(corner[1]), r2(corner[0] + ps), r2(corner[1] + ps)] });
  return { sofa: { L, W }, floors, furniture, rugs, start };
}

const STYLES = {
  wood: [['#b98d61', '#96693f', '#cfa577'], ['#c9a274', '#a47c50', '#dcbb8d'], ['#a4774e', '#7d5634', '#bb8f63']],
  duvet: ['#e9e4da', '#c9d6df', '#e3cfc4', '#d2dccb'],
  carpet: [['#a3adb6', '#b9c2c9'], ['#b3a795', '#c6bba9'], ['#a2ae9b', '#b7c1ae']],
  rug: [['#c8b8a0', '#8f6f55'], ['#9fb2bf', '#56697a'], ['#d0b48c', '#a3562f'], ['#b9c2ad', '#5f6e57']],
};

function transform(C, sym) {
  const mx = sym & 1, mz = sym & 2, tr = sym & 4;
  const P = (x, z) => { const X = mx ? -x : x, Z = mz ? -z : z; return tr ? [Z, X] : [X, Z]; };
  const R = (x0, z0, x1, z1) => { const [ax, az] = P(x0, z0), [bx, bz] = P(x1, z1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
  const floors = C.floors.map((f) => { const [x0, z0, x1, z1] = R(f.x0, f.z0, f.x1, f.z1); return { kind: f.kind, x0, z0, x1, z1 }; });
  const ox = Math.min(...floors.map((f) => f.x0)) - T, oz = Math.min(...floors.map((f) => f.z0)) - T;
  const N = (r) => [r4(r[0] - ox), r4(r[1] - oz), r4(r[2] - ox), r4(r[3] - oz)];
  const nf = floors.map((f) => { const [x0, z0, x1, z1] = N([f.x0, f.z0, f.x1, f.z1]); return { kind: f.kind, x0, z0, x1, z1 }; });
  const furniture = C.furniture.map((f) => ({ kind: f.kind, rect: N(R(...f.rect)), ...(f.head ? { head: P(...f.head) } : {}) }));
  const rugs = C.rugs.map((r) => { const [x0, z0, x1, z1] = N(R(r.x0, r.z0, r.x1, r.z1)); return { x0, z0, x1, z1, pal: r.pal }; });
  const [sx, sz] = P(C.start.x, C.start.z), [fx, fz] = P(...C.start.f);
  const a = G.normA(Math.round(Math.atan2(fx, fz) * 180 / Math.PI / 45) * 45);
  return { floors: nf, furniture, rugs, start: { x: r4(sx - ox), z: r4(sz - oz), a } };
}

const FN = (m, k) => m.floors.find((f) => f.kind === k);
const rect = (f) => [f.x0, f.z0, f.x1, f.z1];

const EXT_CORNER = ['plant', 'lamp', 'sidetable', 'stool', 'basket', 'vase', 'pouf', 'bin', 'speaker', 'umbrella'];
function tryBuild(rng, ext = null) {
  const C = canonical(rng);
  if (!C) { tryBuild.why = 'canonical'; return null; }
  if (ext) { const pl = C.furniture.find((f) => f.kind === 'plant'); if (pl) pl.kind = rng.pick(ext.kinds); }
  const sym = rng.int(0, 7);
  const X = transform(C, sym);
  const style = { wood: rng.pick(STYLES.wood), fabric: rng.pick(SC.FABRICS), duvet: rng.pick(STYLES.duvet), carpet: rng.pick(STYLES.carpet) };
  const rugs = X.rugs.map((r) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, c1: STYLES.rug[r.pal][0], c2: STYLES.rug[r.pal][1] }));
  const walls = G.wallsFromFloors(X.floors, T).map((w) => w.map(r4));
  const xs = X.floors.flatMap((f) => [f.x0, f.x1]), zs = X.floors.flatMap((f) => [f.z0, f.z1]);
  const bbox = [r4(Math.min(...xs) - T), r4(Math.min(...zs) - T), r4(Math.max(...xs) + T), r4(Math.max(...zs) + T)];
  const m = {
    task: 'sofa_through_door', board: BOARD, view: VIEW, sym,
    sofa: C.sofa, floors: X.floors, walls, furniture: X.furniture.map((f) => ({ kind: f.kind, rect: f.rect, ...(f.head ? { head: f.head } : {}) })),
    rugs, style, bbox, bedroom: rect(FN(X, 'bedroom')), living: rect(FN(X, 'living')),
    start: X.start,
  };
  m.cam = SC.fitCamera(bbox, VIEW.w, VIEW.h);
  if (ext && !ext.pre(m)) { tryBuild.why = 'key'; return null; }
  if (!G.free(m, m.start.x, m.start.z, m.start.a)) { tryBuild.why = 'start'; return null; }
  const sol = solve(m);
  if (!sol) { tryBuild.why = 'solve:' + solve.why; return null; }
  m.sol = sol;
  m.gtContract = 'success iff all four corners of the sofa footprint lie inside the bedroom floor rectangle';
  if (ext) m.ext = ext.split;
  const why = gateWhy(m);
  tryBuild.why = why;
  return why ? null : m;
}

export function semanticKey(m) {
  const mx = m.sym & 1, mz = m.sym & 2, tr = m.sym & 4;
  const inv = (u, v) => { const X = tr ? v : u, Z = tr ? u : v; return [mx ? -X : X, mz ? -Z : Z]; };
  const canon = (r) => { const a = inv(r[0], r[1]), b = inv(r[2], r[3]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const lv = canon(m.living), q = (v) => Math.round(v / 1.25);
  const R = (r) => { const c = canon(r); return [c[0] - lv[0], c[1] - lv[1], c[2] - lv[0], c[3] - lv[1]].map(q).join(','); };
  const fl = ['living', 'door1', 'hl', 'vl', 'door2', 'bedroom'].map((k) => `${k}:${R(rect(FN(m, k)))}`).join(';');
  const furn = m.furniture.map((f) => R(f.rect)).sort().join(';');
  const [sx, sz] = inv(m.start.x, m.start.z), [fx, fz] = inv(Math.sin(m.start.a * Math.PI / 180), Math.cos(m.start.a * Math.PI / 180));
  const ang = ((Math.round(Math.atan2(fx, fz) * 180 / Math.PI / 45) * 45) % 180 + 180) % 180;
  return `sofa_through_door|L${Math.round(m.sofa.L * 10)}W${Math.round(m.sofa.W * 10)}|${fl}|furn${furn}|start${q(sx - lv[0])},${q(sz - lv[1])},${ang}`;
}
const EVAL_KEYS = new Set(["755fa57c", "8a6fdce6", "5402b5bf", "5267aec6", "43113a01", "51ab497e", "c062a74d", "b9c5a7e0", "44de6427", "2bd67017", "7ea45322", "80e3ccd3"]);

const CAMS = new WeakMap();
function cam(m) {
  let c = CAMS.get(m);
  if (!c) { c = SC.camera(m, VIEW.w, VIEW.h); CAMS.set(m, c); }
  return c;
}
const toPx = (m, x, z) => { const p = cam(m).project(x, SC.Y_GRAB, z); return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }; };
const fromPx = (m, x, y) => RT.planeAtPixel(cam(m), x, y, SC.Y_GRAB);

function legs(m) {
  const hl = FN(m, 'hl'), vl = FN(m, 'vl'), d1 = FN(m, 'door1'), d2 = FN(m, 'door2');
  const c = (f) => [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2];
  const unit = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1]; return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)]; };
  const dir1 = unit(c(d1), c(hl)), dir2 = unit(c(vl), c(d2));
  const th1 = dir1[0] !== 0 ? 0 : 90, th2 = dir2[0] !== 0 ? 0 : 90;
  const cross = dir1[0] * dir2[1] - dir1[1] * dir2[0];
  return { hl, vl, d1, d2, dir1, dir2, th1, th2, turn: cross < 0 ? 1 : -1 };
}
const dot = (p, d) => p[0] * d[0] + p[1] * d[1];
const span = (f, d) => { const v = [dot([f.x0, f.z0], d), dot([f.x1, f.z1], d)]; return [Math.min(...v), Math.max(...v)]; };
const P2 = (d, al, cr) => { const p = [-d[1], d[0]]; return [d[0] * al + p[0] * cr, d[1] * al + p[1] * cr]; };
const perp = (d) => [-d[1], d[0]];

function bestCell(mask, nx, nz) {
  const D = new Int16Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!mask[k]) continue;
    D[k] = (i && j) ? 1 + Math.min(D[k - 1], D[k - nx], D[k - nx - 1]) : 1;
  }
  let best = -1, bi = -1;
  for (let k = 0; k < nx * nz; k++) if (D[k] > best) { best = D[k]; bi = k; }
  if (best <= 0) return null;
  const i = bi % nx, j = Math.floor(bi / nx), s = best;
  return { i: i - (s - 1) / 2, j: j - (s - 1) / 2, size: s };
}

function turnWindow(m, ang, dir, box, from, h = 0.03) {
  const nx = Math.ceil((box[2] - box[0]) / h) + 1, nz = Math.ceil((box[3] - box[1]) / h) + 1;
  const mask = new Uint8Array(nx * nz);
  let n = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = box[0] + i * h, z = box[1] + j * h;
    if (!G.free(m, x, z, ang)) continue;
    if (!G.sweepFree(m, x, z, ang, ang + dir * G.STEP)) continue;
    if (!G.segFree(m, from[0], from[1], x, z, ang)) continue;
    mask[j * nx + i] = 1; n++;
  }
  const b = bestCell(mask, nx, nz);
  if (!b) return null;
  return { x: r4(box[0] + b.i * h), z: r4(box[1] + b.j * h), radius: (b.size - 1) / 2 * h, cells: n };
}

function solve(m) {
  const Lg = legs(m), { L } = m.sofa;
  const plan = [];
  let x = m.start.x, z = m.start.z, a = m.start.a;
  const d = ((Lg.th1 - a) % 180 + 360) % 180;
  const opts = d === 0 ? [[0, 0]] : d === 45 ? [[1, 1]] : d === 135 ? [[-1, 1]] : [[1, 2], [-1, 2]];
  const [ex0, ex1] = span(Lg.d1, Lg.dir1), [cr0, cr1] = span(Lg.hl, perp(Lg.dir1));
  const E = P2(Lg.dir1, ex0 - L / 2 - 0.25, (cr0 + cr1) / 2);
  let A = null;
  for (const [dir, k] of opts) {
    const okAt = (px, pz) => { for (let i = 0; i < k; i++) if (!G.sweepFree(m, px, pz, a + dir * i * G.STEP, a + dir * (i + 1) * G.STEP)) return false; return true; };
    const robust = (px, pz) => okAt(px, pz) && [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].every(([ox, oz]) => okAt(px + ox, pz + oz));
    const aEnd = a + dir * k * G.STEP;
    if (k === 0 || robust(x, z)) { if (G.segFree(m, x, z, E[0], E[1], aEnd)) { A = { dir, k, sx: x, sz: z, moved: false }; break; } }
    const lv = m.living; let best = null;
    for (let px = lv[0] + 0.3; px <= lv[2] - 0.3; px += 0.1) for (let pz = lv[1] + 0.3; pz <= lv[3] - 0.3; pz += 0.1) {
      const dd = Math.hypot(px - x, pz - z);
      if (best && dd >= best.dd) continue;
      if (!G.free(m, px, pz, a) || !robust(px, pz)) continue;
      if (!G.segFree(m, x, z, px, pz, a) || !G.segFree(m, px, pz, E[0], E[1], aEnd)) continue;
      best = { dd, px: r4(px), pz: r4(pz) };
    }
    if (best) { A = { dir, k, sx: best.px, sz: best.pz, moved: true }; break; }
  }
  if (!A) return (solve.why = 'A-lineup', null);
  if (A.moved) { plan.push({ op: 'drag', x: A.sx, z: A.sz }); x = A.sx; z = A.sz; }
  for (let i = 0; i < A.k; i++) plan.push({ op: 'turn', dir: A.dir });
  a = G.normA(a + A.dir * A.k * G.STEP);
  plan.push({ op: 'drag', x: r4(E[0]), z: r4(E[1]) }); x = E[0]; z = E[1];
  const iE = plan.length - 1, iT = [];
  const [hl0, hl1] = span(Lg.hl, Lg.dir1);
  const C1 = P2(Lg.dir1, ex1 + L / 2 + 0.05, (cr0 + cr1) / 2);
  const box1 = (() => { const p = P2(Lg.dir1, ex0, cr0), q = P2(Lg.dir1, hl1, cr1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; })();
  let w1 = turnWindow(m, a, Lg.turn, box1, [x, z]);
  if (!w1 && G.segFree(m, x, z, C1[0], C1[1], a)) {
    plan.push({ op: 'drag', x: r4(C1[0]), z: r4(C1[1]) }); x = C1[0]; z = C1[1];
    w1 = turnWindow(m, a, Lg.turn, box1, [x, z]);
  }
  if (!w1) return (solve.why = 'w1', null);
  plan.push({ op: 'drag', x: w1.x, z: w1.z }); x = w1.x; z = w1.z;
  iT.push(plan.length); plan.push({ op: 'turn', dir: Lg.turn }); a = G.normA(a + Lg.turn * G.STEP);
  const jb = [Math.min(Lg.hl.x0, Lg.vl.x0) - 0.2, Math.min(Lg.hl.z0, Lg.vl.z0) - 0.2, Math.max(Lg.hl.x1, Lg.vl.x1) + 0.2, Math.max(Lg.hl.z1, Lg.vl.z1) + 0.2];
  const w2 = turnWindow(m, a, Lg.turn, jb, [x, z]);
  if (!w2) return (solve.why = 'w2', null);
  if (Math.hypot(w2.x - x, w2.z - z) > 1e-6) { plan.push({ op: 'drag', x: w2.x, z: w2.z }); x = w2.x; z = w2.z; }
  iT.push(plan.length); plan.push({ op: 'turn', dir: Lg.turn }); a = G.normA(a + Lg.turn * G.STEP);
  const [vc0, vc1] = span(Lg.vl, perp(Lg.dir2)), [, dz1] = span(Lg.d2, Lg.dir2);
  const here = dot([x, z], Lg.dir2);
  const V = P2(Lg.dir2, here, (vc0 + vc1) / 2), F = P2(Lg.dir2, dz1 + L / 2 + 0.3, (vc0 + vc1) / 2);
  if (!G.inBedroom(m, F[0], F[1], a)) return (solve.why = 'F-outside', null);
  if (!G.segFree(m, x, z, F[0], F[1], a)) {
    if (!G.segFree(m, x, z, V[0], V[1], a) || !G.segFree(m, V[0], V[1], F[0], F[1], a)) return (solve.why = 'exit-seg', null);
    plan.push({ op: 'drag', x: r4(V[0]), z: r4(V[1]) });
  }
  plan.push({ op: 'drag', x: r4(F[0]), z: r4(F[1]) });
  return { plan, iE, iT, turn: Lg.turn, w1: { r: r4(w1.radius), n: w1.cells }, w2: { r: r4(w2.radius), n: w2.cells } };
}

function planActions(m, plan) {
  return plan.map((p) => (p.op === 'turn' ? { op: 'turn', dir: p.dir } : { op: 'drag', to: toPx(m, p.x, p.z) }));
}

function initState(m) { return { x: m.start.x, z: m.start.z, a: m.start.a, bumps: 0, bumpDir: 0 }; }
function apply(st, act, m) {
  const op = act && act.op;
  if (op === 'reset') { Object.assign(st, initState(m), { bumps: st.bumps }); return { ok: true }; }
  if (op === 'turn') {
    const dir = act.dir === -1 ? -1 : act.dir === 1 ? 1 : 0;
    if (!dir) return { ok: false, reason: 'bad-dir' };
    const t = G.turnTarget(m, st.x, st.z, st.a, dir);
    if (!t) { st.bumps = (st.bumps || 0) + 1; st.bumpDir = dir; return { ok: true, moved: false }; }
    st.x = r4(t.x); st.z = r4(t.z); st.a = G.normA(t.a);
    return { ok: true, moved: true };
  }
  if (op === 'drag') {
    const to = act.to;
    if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return { ok: false, reason: 'bad-to' };
    const w = fromPx(m, Math.max(-50, Math.min(VIEW.w + 50, to.x)), Math.max(-50, Math.min(BOARD.h + 50, to.y)));
    if (!w) return { ok: false, reason: 'off-plane' };
    const b = m.bbox;
    G.moveToward(m, st, Math.max(b[0], Math.min(b[2], w.x)), Math.max(b[1], Math.min(b[3], w.z)));
    st.x = r4(st.x); st.z = r4(st.z);
    return { ok: true };
  }
  return { ok: false, reason: 'bad-op' };
}
function verifyState(st, m) { return G.inBedroom(m, st.x, st.z, st.a); }
function runActs(m, acts) { const st = initState(m); for (const a of acts) apply(st, a, m); return verifyState(st, m); }

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function lazyPlans(m) {
  const Lg = legs(m), acts = planActions(m, m.sol.plan), out = {};
  const bc = [(m.bedroom[0] + m.bedroom[2]) / 2, (m.bedroom[1] + m.bedroom[3]) / 2];
  const D = (p) => ({ op: 'drag', to: toPx(m, p[0], p[1]) });
  const [, hl1] = span(Lg.hl, Lg.dir1), [cr0, cr1] = span(Lg.hl, perp(Lg.dir1));
  const corner = P2(Lg.dir1, hl1 + 0.3, (cr0 + cr1) / 2);
  out.straight = [D(bc)];
  out.pushThrough = acts.slice(0, m.sol.iE + 1).concat([D(corner), D(bc)]);
  const d = ((Lg.th2 - m.start.a) % 180 + 360) % 180;
  const turns = d === 0 ? [] : d === 45 ? [1] : d === 135 ? [-1] : [1, 1];
  const mid = [(m.living[0] + m.living[2]) / 2, (m.living[1] + m.living[3]) / 2];
  out.wrongAxis = [D(mid), ...turns.map((t) => ({ op: 'turn', dir: t })), acts[m.sol.iE], D(corner), D(bc)];
  out.wrongWay = acts.map((a, i) => (m.sol.iT.includes(i) ? { op: 'turn', dir: -a.dir } : a));
  return out;
}

export function gateWhy(m) {
  if (!m || m.task !== 'sofa_through_door' || !m.sol || !Array.isArray(m.sol.plan)) return 'shape';
  for (const k of ['living', 'door1', 'hl', 'vl', 'door2', 'bedroom']) if (m.floors.filter((f) => f.kind === k).length !== 1) return 'floors';
  if (!G.free(m, m.start.x, m.start.z, m.start.a)) return 'start-blocked';
  const lv = m.living;
  if (!G.corners(m, m.start.x, m.start.z, m.start.a).every(([x, z]) => x >= lv[0] && x <= lv[2] && z >= lv[1] && z <= lv[3])) return 'start-outside';
  const Lg = legs(m);
  if (((m.start.a - Lg.th1) % 180 + 180) % 180 === 0) return 'start-aligned';
  const { L, W } = m.sofa, diag = (L + W) / Math.SQRT2;
  for (const f of [Lg.hl, Lg.vl]) { const wdt = Math.min(f.x1 - f.x0, f.z1 - f.z0); if (wdt >= L || wdt >= diag) return 'leg-too-wide'; }
  const c = cam(m);
  for (const x of [m.bbox[0], m.bbox[2]]) for (const z of [m.bbox[1], m.bbox[3]]) for (const y of [0, SC.H_WALL]) {
    const p = c.project(x, y, z); if (p.x < 4 || p.x > VIEW.w - 4 || p.y < 4 || p.y > VIEW.h - 4) return 'offscreen';
  }
  const acts = planActions(m, m.sol.plan);
  if (acts.length > 12 || !runActs(m, acts)) return 'oracle-fails';
  if (!(m.sol.w1.r >= 0.03) || !(m.sol.w2.r >= 0.0)) return 'window-small';
  const rnd = prng(Math.round(m.start.x * 1000) ^ Math.round(m.sofa.L * 977) ^ (m.sym << 20));
  let ok = 0;
  for (let t = 0; t < 10; t++) {
    const jit = acts.map((a) => { if (a.op !== 'drag') return a; const r = 6 * Math.sqrt(rnd()), th = rnd() * Math.PI * 2; return { op: 'drag', to: { x: a.to.x + r * Math.cos(th), y: a.to.y + r * Math.sin(th) } }; });
    if (runActs(m, jit)) ok++;
  }
  if (ok < 8) return 'jitter';
  const lz = lazyPlans(m);
  for (const k of Object.keys(lz)) if (runActs(m, lz[k])) return 'lazy-' + k;
  return '';
}
export function gate(m) { return gateWhy(m) === ''; }

const VIS = new WeakMap();
function visOf(st) {
  let v = VIS.get(st);
  if (!v) { v = { x: st.x, z: st.z, a: st.a, bump: st.bumps || 0, bt: 0, bdir: 0 }; VIS.set(st, v); }
  return v;
}
const angTo = (from, to) => { let d = (to - from) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

const BTN = { y: VIEW.h + 6, h: 38 };
function btnRects() {
  return {
    left: { x: 8, y: BTN.y, w: 118, h: BTN.h },
    reset: { x: 134, y: BTN.y, w: 72, h: BTN.h },
    right: { x: 214, y: BTN.y, w: 118, h: BTN.h },
  };
}

const task = {
  meta: {
    name: 'sofa_through_door', family: 'C', 
    boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [
      { op: 'drag', to: { x: 'board px where the sofa centre (seat height) should go; it slides there and stops at walls' } },
      { op: 'turn', dir: '+1 = rotate 45° left (counter-clockwise on screen), -1 = rotate 45° right' },
      { op: 'reset' },
    ],
    promptHuman: 'Move the sofa into the bedroom',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      const f = splitIds('sofa_through_door|corner', EXT_CORNER, 3), kinds = EXT_CORNER.filter((k) => f(k) === knobs.ext);
      const slot = K.seedSlot('sofa_through_door', knobs.ext, knobs.n);
      const pre = (m) => { const k = semanticKey(m); return K.keyAccept(k, knobs.ext, EVAL_KEYS) && K.keySlot(k) === slot; };
      for (let k = 0; k < 100000; k++) { const m = tryBuild(rng, { split: knobs.ext, kinds, pre }); if (m) return m; }
      throw new Error('sofa_through_door: no training instance');
    }
    for (let k = 0; k < 300; k++) { const m = tryBuild(rng); if (m) return m; }
    throw new Error('sofa_through_door: no instance');
  },

  init(m) { this._grab = null; return initState(m); },
  applyAction(st, action, m) { return apply(st, action, m); },
  verify(st, m) {
    const ok = verifyState(st, m);
    return { success: ok, error: ok ? 0 : 1, partial: ok ? 1 : 0, detail: { x: st.x, z: st.z, a: st.a } };
  },
  oracle(m) { return planActions(m, m.sol.plan); },

  oraclePoints(m) {
    const st = initState(m);
    return planActions(m, m.sol.plan).map((a) => {
      if (a.op !== 'drag') { apply(st, a, m); return null; }
      const p = toPx(m, st.x, st.z);
      apply(st, a, m);
      return { from: [p.x, p.y], to: [a.to.x, a.to.y] };
    });
  },

  randomPolicy(m, rnd) {
    const n = 3 + Math.floor(rnd() * 7), out = [];
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.55) out.push({ op: 'drag', to: { x: rnd() * VIEW.w, y: rnd() * VIEW.h } });
      else out.push({ op: 'turn', dir: rnd() < 0.5 ? 1 : -1 });
    }
    return out;
  },

  gate,
  async mount(env) {
    if (env.style) env.assets.look = await SC.styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Move the sofa into the bedroom', 'Drag to slide it. All of it must be inside.');
  },

  tick(env, dt) {
    const st = env && env.state;
    if (!st) return false;
    const v = visOf(st);
    let active = false;
    if (this._grab) { v.x = st.x; v.z = st.z; v.a = st.a; }
    else {
      const dx = st.x - v.x, dz = st.z - v.z, da = angTo(v.a, st.a);
      if (Math.abs(dx) + Math.abs(dz) > 1e-4 || Math.abs(da) > 0.05) {
        const k = Math.min(1, dt * 14);
        v.x += dx * k + Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.4);
        v.z += dz * k + Math.sign(dz) * Math.min(Math.abs(dz), dt * 0.4);
        v.a += da * k + Math.sign(da) * Math.min(Math.abs(da), dt * 60);
        if (Math.abs(st.x - v.x) < 0.003 && Math.abs(st.z - v.z) < 0.003 && Math.abs(angTo(v.a, st.a)) < 0.3) { v.x = st.x; v.z = st.z; v.a = st.a; }
        active = true;
      }
    }
    if ((st.bumps || 0) !== v.bump) { v.bump = st.bumps || 0; v.bt = 0.001; v.bdir = st.bumpDir || 1; }
    if (v.bt > 0) { v.bt += dt; if (v.bt > 0.28) v.bt = 0; active = true; }
    return active;
  },

  _caches: new WeakMap(),
  _cache(m, q, look = null, lk = '') {
    let C = this._caches.get(m);
    if (!C || C.q !== q || (C.lk || '') !== lk) {
      const c = cam(m), statics = SC.staticShapes(m);
      const ss = q >= 1.5 ? 1 : 2;
      const sc = look ? SC.makeStaticScene(m, c, look) : SC.makeStaticScene(m, c);
      const bg = RT.renderRect(sc, q, { x: 0, y: 0, w: VIEW.w, h: VIEW.h }, ss);
      C = { q, ss, statics, bg: RT.toCanvas(bg), regions: new Map(), lk, look };
      this._caches.set(m, C);
    }
    return C;
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, br.w, br.h);
    const q = Math.min(2, RT.contextScale(g));
    const look = env.style ? env.assets.look || null : null;
    const C = look ? this._cache(m, q, look, env.style.key) : this._cache(m, q), c = cam(m);
    g.save(); g.beginPath(); rr(g, 0, 0, VIEW.w, VIEW.h, 6); g.clip();
    g.drawImage(C.bg, 0, 0, VIEW.w, VIEW.h);
    const v = visOf(st);
    const wig = v.bt > 0 ? v.bdir * 5 * Math.sin(Math.PI * v.bt / 0.28) : 0;
    const pose = { x: v.x, z: v.z, a: v.a + wig };
    const live = !!this._grab || v.bt > 0 || Math.abs(v.x - st.x) + Math.abs(v.z - st.z) > 1e-4 || Math.abs(angTo(v.a, st.a)) > 0.05;
    const key = `${pose.x.toFixed(4)},${pose.z.toFixed(4)},${pose.a.toFixed(2)}|${live ? 'lo' : 'hi'}`;
    let R = C.regions.get(key);
    if (!R) {
      const sc = C.look ? SC.makeFullScene(m, c, pose, C.statics, C.look) : SC.makeFullScene(m, c, pose, C.statics);
      const rc = SC.sofaRect(m, c, pose);
      const img = live ? RT.renderRect(sc, 1, rc, 1) : RT.renderRect(sc, q, rc, C.ss);
      R = { canvas: RT.toCanvas(img), x: img.x, y: img.y, w: img.bw, h: img.bh };
      if (C.regions.size > 40) C.regions.delete(C.regions.keys().next().value);
      C.regions.set(key, R);
    }
    g.drawImage(R.canvas, R.x, R.y, R.w, R.h);
    g.restore();
    this._drawButtons(g);
    g.restore();
  },

  _drawButtons(g) {
    const B = btnRects();
    for (const k of ['left', 'reset', 'right']) {
      const b = B[k];
      rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = '#eef2f6'; g.fill();
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 1; g.stroke();
      const col = '#3c4955';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
      const cy = b.y + b.h / 2;
      if (k === 'reset') {
        g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('Reset', b.x + b.w / 2, cy + 0.5);
        continue;
      }
      const s = k === 'left' ? -1 : 1;
      const ix = b.x + (k === 'left' ? 24 : b.w - 24), R = 8;
      const a0 = -Math.PI / 2 + s * 0.35, a1 = a0 + s * (Math.PI * 2 - 1.1);
      g.beginPath(); g.arc(ix, cy, R, a0, a1, s < 0); g.stroke();
      const hx = ix + R * Math.cos(a1), hy = cy + R * Math.sin(a1), tx = -Math.sin(a1) * s, ty = Math.cos(a1) * s;
      g.beginPath();
      g.moveTo(hx + tx * 4.5, hy + ty * 4.5);
      g.lineTo(hx - tx * 1.5 + Math.cos(a1) * 4.2, hy - ty * 1.5 + Math.sin(a1) * 4.2);
      g.lineTo(hx - tx * 1.5 - Math.cos(a1) * 4.2, hy - ty * 1.5 - Math.sin(a1) * 4.2);
      g.closePath(); g.fill();
      g.font = `700 11px ${UI_FONT}`; g.textAlign = k === 'left' ? 'left' : 'right'; g.textBaseline = 'middle';
      g.fillText(k === 'left' ? 'Rotate left' : 'Rotate right', k === 'left' ? b.x + 40 : b.x + b.w - 40, cy + 0.5);
    }
  },

  _onSofa(m, st, x, y) {
    const A = G.axes(st.a);
    for (const h of [0.1, 0.45, 0.75]) {
      const w = RT.planeAtPixel(cam(m), x, y, h);
      if (!w) continue;
      const dx = w.x - st.x, dz = w.z - st.z;
      if (Math.abs(dx * A.ux + dz * A.uz) <= m.sofa.L / 2 + 0.08 && Math.abs(dx * A.nx + dz * A.nz) <= m.sofa.W / 2 + 0.08) return true;
    }
    return false;
  },

  pointer(evt, env) {
    const m = env.manifest, st = env.state;
    if (env.submitted) return [];
    if (evt.type === 'down') {
      this._grab = null;
      const B = btnRects();
      const inB = (b) => evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h;
      if (inB(B.left)) return [{ op: 'turn', dir: 1 }];
      if (inB(B.right)) return [{ op: 'turn', dir: -1 }];
      if (inB(B.reset)) return [{ op: 'reset' }];
      if (evt.y < VIEW.h && this._onSofa(m, st, evt.x, evt.y)) {
        const w = fromPx(m, evt.x, evt.y);
        if (w) this._grab = { ox: st.x - w.x, oz: st.z - w.z };
      }
      return [];
    }
    const gr = this._grab;
    if (!gr) return [];
    if (evt.type === 'up') { this._grab = null; return []; }
    if (evt.type === 'move') {
      const w = fromPx(m, evt.x, Math.min(evt.y, VIEW.h + 40));
      if (!w) return [];
      return [{ op: 'drag', to: toPx(m, w.x + gr.ox, w.z + gr.oz) }];
    }
    return [];
  },

  wantsMoveRedraw: false,

  footerStatus() { return 'Drag the sofa; rotate it with the buttons'; },
};

export default task;
