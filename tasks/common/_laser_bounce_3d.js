import { shape, makeScene, makeCamK, lin, hash2, fbm, lineMask, hitShape } from './_laser_bounce_rt.js';

export const L3 = Object.freeze({
  cols: 10, rows: 8,
  hL: 0.45,
  hTall: 0.82, hLow: 0.16,
  hWall: 0.66,
  boardLen: 1.22, boardTh: 0.07,
  W: 580, H: 440, margin: 10,
  dist: 17,
  elLo: 35, elHi: 50,
  dLo: 25, dHi: 35,
  span: [0.1, 0.9],
  tol: 4,
  minVis: 8,
  minVisAll: 7,
  minPanelW: 9, minPanelH: 14,
});
export const PANEL3 = Object.freeze({ panelWidth: L3.W + 20, boardH: L3.H + 10 });

const D2R = Math.PI / 180;
const N_EXITS = 2 * (L3.cols + L3.rows);
export const reflect = (d, kind) => (kind === '\\' ? [d[1], d[0]] : [-d[1], -d[0]]);
export const swapKind = (k) => (k === '/' ? '\\' : '/');

export function trace2(mirrors, er, kindOf) {
  const C = L3.cols, R = L3.rows, at = new Map(mirrors.map((q) => [`${q.c},${q.r}`, q]));
  let c = 0, r = er, d = [1, 0];
  const cells = new Set(), hits = [], straight = [];
  for (let step = 0; step < 400; step++) {
    const key = `${c},${r}`, q = at.get(key), k = q ? kindOf(q) : null;
    if (k) { d = reflect(d, k); hits.push(key); } else straight.push(key);
    cells.add(key);
    const nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nc >= C || nr < 0 || nr >= R) {
      const exit = d[0] === 1 ? { side: 'R', idx: r } : d[0] === -1 ? { side: 'L', idx: r } : d[1] === 1 ? { side: 'B', idx: c } : { side: 'T', idx: c };
      return { exit, cells, hits, straight };
    }
    c = nc; r = nr;
  }
  return null;
}
export function perim(e) {
  const C = L3.cols, R = L3.rows;
  return e.side === 'T' ? e.idx : e.side === 'R' ? C + e.idx : e.side === 'B' ? C + R + (C - 1 - e.idx) : 2 * C + R + (R - 1 - e.idx);
}
export function exitGap(a, b) {
  if (!a || !b) return Infinity;
  const k = Math.abs(perim(a) - perim(b));
  return Math.min(k, N_EXITS - k);
}
export function allExits() {
  const out = [];
  for (let c = 0; c < L3.cols; c++) out.push({ side: 'T', idx: c }, { side: 'B', idx: c });
  for (let r = 0; r < L3.rows; r++) out.push({ side: 'L', idx: r }, { side: 'R', idx: r });
  return out.sort((a, b) => perim(a) - perim(b));
}

export function yawOk(yaw) {
  const off = Math.abs((((yaw % 180) + 180) % 180) - 90);
  return Number.isFinite(yaw) && off >= L3.dLo && off < L3.dHi;
}
const TARGET = [L3.cols / 2, 0.25, L3.rows / 2];
function eyeOf(cam) {
  const a = cam.yaw * D2R, e = cam.el * D2R;
  return [TARGET[0] - cam.dist * Math.sin(a) * Math.cos(e), TARGET[1] + cam.dist * Math.sin(e), TARGET[2] + cam.dist * Math.cos(a) * Math.cos(e)];
}
function boundPoints(m) {
  const C = L3.cols, R = L3.rows, pts = [];
  for (const x of [-0.08, C + 0.08]) for (const z of [-0.08, R + 0.08]) for (const y of [0, L3.hWall + 0.04]) pts.push([x, y, z]);
  const ez = m.emitter.idx + 0.5;
  for (const x of [-0.8, -0.04]) for (const z of [ez - 0.28, ez + 0.28]) for (const y of [0, 0.7]) pts.push([x, y, z]);
  for (const q of m.mirrors) {
    const [u0, u1] = dirOf(q.kind), h = q.low ? L3.hLow : L3.hTall, cx = q.c + 0.5, cz = q.r + 0.5, L = L3.boardLen / 2;
    pts.push([cx - u0 * L, h, cz - u1 * L], [cx + u0 * L, h, cz + u1 * L]);
  }
  return pts;
}
export function camOf(m) {
  const eye = eyeOf(m.cam), W = L3.W, H = L3.H;
  const unit = makeCamK({ eye, target: TARGET, f: 1, cx: 0, cy: 0, W, H });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of boundPoints(m)) { const s = unit.project(p[0], p[1], p[2]); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  const f = Math.min((W - 2 * L3.margin) / (x1 - x0), (H - 2 * L3.margin) / (y1 - y0));
  return makeCamK({ eye, target: TARGET, f, cx: W / 2 - f * (x0 + x1) / 2, cy: H / 2 - f * (y0 + y1) / 2, W, H });
}

export function dirOf(kind) { const s = Math.SQRT1_2; return kind === '/' ? [s, -s] : [s, s]; }
export function facesCamera(q, cam) {
  const [u0, u1] = dirOf(q.kind), vx = q.c + 0.5 - cam.eye[0], vz = q.r + 0.5 - cam.eye[2];
  return Math.abs(u0 * vx + u1 * vz) <= Math.SQRT1_2 * Math.hypot(vx, vz);
}
export function screenTilt(q, cam) {
  const [u0, u1] = dirOf(q.kind), L = L3.boardLen / 2, cx = q.c + 0.5, cz = q.r + 0.5;
  const a = cam.project(cx - u0 * L, 0, cz - u1 * L), b = cam.project(cx + u0 * L, 0, cz + u1 * L);
  return (b.x - a.x) * (b.y - a.y) < 0 ? '/' : '\\';
}

export function exitWorld(e, y = L3.hL, a = 0.5) {
  const C = L3.cols, R = L3.rows;
  return e.side === 'L' ? [0, y, e.idx + a] : e.side === 'R' ? [C, y, e.idx + a] : e.side === 'T' ? [e.idx + a, y, 0] : [e.idx + a, y, R];
}
const r2 = (v) => Math.round(v * 100) / 100;
export function exitPoint(e, cam) { const p = cam.project(...exitWorld(e)); return { x: r2(p.x), y: r2(p.y) }; }
export function exitQuad(e, cam) {
  const [a0, a1] = L3.span;
  return [[a0, 0], [a1, 0], [a1, L3.hWall], [a0, L3.hWall]].map(([a, y]) => { const p = cam.project(...exitWorld(e, y, a)); return [r2(p.x), r2(p.y)]; });
}
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
export function inPanel(x, y, quad, tol) {
  let pos = 0, neg = 0, dmin = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % 4];
    const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cr > 0) pos++; else if (cr < 0) neg++;
    dmin = Math.min(dmin, segDist(x, y, ax, ay, bx, by));
  }
  return pos === 0 || neg === 0 || dmin <= tol;
}

export const ID = { emitter: 100, glow: 101, frame: 102 };
export function sceneShapes(m) {
  const C = L3.cols, R = L3.rows, out = [], th = L3.boardTh / 2;
  m.mirrors.forEach((q, i) => {
    const h = q.low ? L3.hLow : L3.hTall;
    out.push(shape.box(i, q.low ? 1 : 0, q.c + 0.5, h / 2, q.r + 0.5, L3.boardLen / 2, h / 2, th, q.kind === '/' ? 45 : -45, 0.012));
  });
  const ez = m.emitter.idx + 0.5;
  out.push(shape.box(ID.emitter, 2, -0.44, 0.34, ez, 0.34, 0.34, 0.26, 0, 0.03));
  out.push(shape.box(ID.emitter, 3, -0.085, L3.hL, ez, 0.025, 0.14, 0.2, 0, 0.01));
  out.push(shape.box(ID.glow, 4, -0.05, L3.hL, ez, 0.02, 0.055, 0.055, 0));
  out.push(shape.box(ID.glow, 5, 0.32, L3.hL, ez, 0.3, 0.025, 0.025, 0));
  const k = 0.04, hk = 0.025, rail = 0.018, H = L3.hWall;
  out.push(shape.box(ID.frame, 6, C / 2, hk, 0, C / 2 + k, hk, k, 0), shape.box(ID.frame, 6, C / 2, hk, R, C / 2 + k, hk, k, 0));
  out.push(shape.box(ID.frame, 6, 0, hk, R / 2, k, hk, R / 2 + k, 0), shape.box(ID.frame, 6, C, hk, R / 2, k, hk, R / 2 + k, 0));
  for (const x of [0, C]) for (const z of [0, R]) out.push(shape.box(ID.frame, 6, x, (H + rail) / 2, z, k, (H + rail) / 2, k, 0));
  out.push(shape.box(ID.frame, 6, C / 2, H, 0, C / 2, rail, rail, 0), shape.box(ID.frame, 6, C / 2, H, R, C / 2, rail, rail, 0));
  out.push(shape.box(ID.frame, 6, 0, H, R / 2, rail, rail, R / 2, 0), shape.box(ID.frame, 6, C, H, R / 2, rail, rail, R / 2, 0));
  return out;
}
function blocker(shapes, eye, P, skip) {
  const dx = P[0] - eye[0], dy = P[1] - eye[1], dz = P[2] - eye[2], tP = Math.hypot(dx, dy, dz);
  const ux = dx / tP, uy = dy / tP, uz = dz / tP;
  let who = -1;
  for (const s of shapes) {
    if (skip && skip.has(s.id)) continue;
    if (hitShape(s, eye[0], eye[1], eye[2], ux, uy, uz, tP - 1e-3) < tP - 1e-3) { if (s.id !== ID.frame) return s.id; who = s.id; }
  }
  return who;
}
const blocked = (shapes, eye, P, skip) => blocker(shapes, eye, P, skip) !== -1;
export function visibility(m, cam, shapes) {
  const eye = cam.eye, L = L3.boardLen / 2, out = { boards: [], boardsAll: [], cornersSeen: [], corners: true, stub: 0 };
  m.mirrors.forEach((q, i) => {
    const [u0, u1] = dirOf(q.kind), cx = q.c + 0.5, cz = q.r + 0.5;
    let n0 = -u1, n1 = u0; if ((eye[0] - cx) * n0 + (eye[2] - cz) * n1 < 0) { n0 = -n0; n1 = -n1; }
    const off = L3.boardTh / 2 + 0.012;
    let vis = 0, visAll = 0;
    for (let j = 1; j <= 9; j++) {
      const t = (j / 10 - 0.5) * 2 * L, who = blocker(shapes, eye, [cx + u0 * t + n0 * off, 0.02, cz + u1 * t + n1 * off], null);
      if (who === -1 || who === ID.frame) vis++;
      if (who === -1) visAll++;
    }
    out.boards.push(vis); out.boardsAll.push(visAll);
    const own = new Set([i, ID.frame]);
    let nc = 0;
    for (const [ax, az] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!blocked(shapes, eye, [q.c + ax, 0.004, q.r + az], own)) nc++;
    out.cornersSeen.push(nc);
    if (nc < 3) out.corners = false;
  });
  const ez = m.emitter.idx + 0.5;
  for (let j = 0; j < 5; j++) if (!blocked(shapes, eye, [0.06 + j * 0.13, L3.hL, ez], new Set([ID.glow]))) out.stub++;
  out.exitBlocked = blocked(shapes, eye, exitWorld(m.exitId), null);
  return out;
}

export function audit3(m) {
  const cam = camOf(m), er = m.emitter.idx;
  const truth = trace2(m.mirrors, er, (q) => (q.low ? null : q.kind));
  const allReflect = trace2(m.mirrors, er, (q) => q.kind);
  const tilt = m.mirrors.map((q) => screenTilt(q, cam));
  const tiltOf = (q) => tilt[m.mirrors.indexOf(q)];
  const screen = trace2(m.mirrors, er, (q) => (q.low ? null : tiltOf(q)));
  const screenAll = trace2(m.mirrors, er, (q) => tiltOf(q));
  const swapped = trace2(m.mirrors, er, (q) => (q.low ? null : swapKind(tiltOf(q))));
  const shapes = sceneShapes(m);
  return { cam, truth, allReflect, screen, screenAll, swapped, tilt, vis: visibility(m, cam, shapes), shapes };
}

const FLOOR_TILE = lin('#e9e5dd'), FLOOR_TILE2 = lin('#dcd8cf'), GROUT = lin('#6f767d');
const TABLE_A = lin('#6d7884'), TABLE_B = lin('#7d8894');
const ENV = {
  floorY: 0,
  floor(x, z, fp, out) {
    if (x >= 0 && x <= L3.cols && z >= 0 && z <= L3.rows) {
      const ix = Math.floor(x), iz = Math.floor(z), t = 0.25 + 0.5 * hash2(ix * 7 + 3, iz * 13 + 5), n = fbm(x * 6, z * 6, 2, fp * 6);
      for (let c = 0; c < 3; c++) out[c] = (FLOOR_TILE2[c] + (FLOOR_TILE[c] - FLOOR_TILE2[c]) * t) * (0.97 + 0.06 * n);
      const seam = Math.max(lineMask(x, 1, 0.024, fp), lineMask(z, 1, 0.024, fp));
      for (let c = 0; c < 3; c++) out[c] = out[c] * (1 - seam) + GROUT[c] * seam;
    } else {
      const n = fbm(x * 1.3, z * 1.3, 3, fp * 1.3);
      for (let c = 0; c < 3; c++) out[c] = TABLE_A[c] + (TABLE_B[c] - TABLE_A[c]) * n;
    }
  },
  sky(dx, dy, dz, out) {
    const t = Math.max(0, Math.min(1, dy * 1.2 + 0.4));
    out[0] = 0.6 + 0.3 * t; out[1] = 0.63 + 0.3 * t; out[2] = 0.68 + 0.3 * t;
  },
  glassTint: lin('#dcebee'), glassAlpha: 0.07,
};
function mirrorTex(base, frame) {
  return (x, y, z, nx, ny, nz, s, out) => {
    const px = x - s.cx, pz = z - s.cz, lx = px * s.ca - pz * s.sa, top = 2 * s.hy, lnx = nx * s.ca - nz * s.sa;
    const edge = Math.abs(ny) > 0.5 || (Math.abs(lnx) <= 0.5 && (Math.abs(lx) > s.hx - 0.022 || y < 0.035 || y > top - 0.022));
    const src = edge ? frame : base, k = ny > 0.5 ? 1.7 : edge ? 1 : 0.84 + 0.22 * Math.min(1, y / Math.max(0.2, top));
    out[0] = src[0] * k; out[1] = src[1] * k; out[2] = src[2] * k;
  };
}
export function sceneOf(m) {
  const cam = camOf(m), C = L3.cols, R = L3.rows;
  const MIR = lin('#c9d5df'), FRAME = lin('#3d4a57');
  const mats = [
    { c: MIR, ks: 0.8, sh: 90, mirror: 0.62, tex: mirrorTex(MIR, FRAME) },
    { c: MIR, ks: 0.8, sh: 90, mirror: 0.62, tex: mirrorTex(MIR, FRAME) },
    { c: lin('#3b424b'), ks: 0.3, sh: 30 },
    { c: lin('#8e98a2'), ks: 0.4, sh: 40 },
    { c: [0, 0, 0], emit: [2.6, 0.16, 0.1] },
    { c: [0, 0, 0], emit: [2.2, 0.1, 0.07] },
    { c: lin('#9aa3ab'), ks: 0.45, sh: 50 },
  ];
  const a = (m.cam.yaw + 20) * D2R;
  const light = {
    dir: [-Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], col: [1.12, 1.09, 1.03], soft: 0.018,
    sky: [0.5, 0.51, 0.54], ground: [0.24, 0.23, 0.22], aoK: 0.55, contact: 0.32, contactH: 0.07,
  };
  const glass = [
    { axis: 'x', at: 0, a0: 0, a1: R, y0: 0.05, y1: L3.hWall }, { axis: 'x', at: C, a0: 0, a1: R, y0: 0.05, y1: L3.hWall },
    { axis: 'z', at: 0, a0: 0, a1: C, y0: 0.05, y1: L3.hWall }, { axis: 'z', at: R, a0: 0, a1: C, y0: 0.05, y1: L3.hWall },
  ];
  return makeScene({ cam, shapes: sceneShapes(m), mats, env: { ...ENV, glass }, light });
}
