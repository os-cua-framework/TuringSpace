export const C = 1.4;
export const EYE = 1.6;
export const GUARD_H = 1.78;
export const WALL_H = 2.9, WALL_T = 0.3;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const R_GUARD = 0.25, R_YOU = 0.25, CLEAR = 0.15;

export const key = (c, r) => `${c},${r}`;
export const cellCenter = (c, r) => [(c + 0.5) * C, (r + 0.5) * C];
export const inGrid = (m, c, r) => c >= 0 && c < m.grid.w && r >= 0 && r < m.grid.h;

export function segHitsRect(ax, az, bx, bz, R) {
  let lo = 0, hi = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > hi) return false; if (t > lo) lo = t; } else { if (t < lo) return false; if (t < hi) hi = t; }
    return true;
  };
  return clip(-dx, ax - R.x0) && clip(dx, R.x1 - ax) && clip(-dz, az - R.z0) && clip(dz, R.z1 - az) && lo <= hi;
}
function ptSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
function ptRectDist(px, pz, R) {
  const dx = Math.max(R.x0 - px, 0, px - R.x1), dz = Math.max(R.z0 - pz, 0, pz - R.z1);
  return Math.hypot(dx, dz);
}
export function segRectDist(ax, az, bx, bz, R) {
  if (segHitsRect(ax, az, bx, bz, R)) return 0;
  let d = Math.min(ptRectDist(ax, az, R), ptRectDist(bx, bz, R));
  for (const [cx, cz] of [[R.x0, R.z0], [R.x1, R.z0], [R.x0, R.z1], [R.x1, R.z1]]) d = Math.min(d, ptSegDist(cx, cz, ax, az, bx, bz));
  return d;
}

const RING = 16;
const OFFS = [[0, 0]].concat(Array.from({ length: RING }, (_, i) => [Math.cos(2 * Math.PI * i / RING), Math.sin(2 * Math.PI * i / RING)]));
export function lineBlocked(G, P, rects) {
  for (const R of rects) if (segHitsRect(G[0], G[1], P[0], P[1], R)) return true;
  return false;
}
export function hiddenRobust(G, P, rects, rg = R_GUARD, rp = R_YOU) {
  for (const R of rects) {
    if (!segHitsRect(G[0], G[1], P[0], P[1], R)) continue;
    let all = true;
    for (const [ux, uz] of OFFS) {
      const gx = G[0] + ux * rg, gz = G[1] + uz * rg;
      for (const [vx, vz] of OFFS) {
        if (!segHitsRect(gx, gz, P[0] + vx * rp, P[1] + vz * rp, R)) { all = false; break; }
      }
      if (!all) break;
    }
    if (all) return true;
  }
  return false;
}
export function clearance(G, P, rects) {
  let d = Infinity;
  for (const R of rects) d = Math.min(d, segRectDist(G[0], G[1], P[0], P[1], R));
  return d;
}
export function visibleRobust(G, P, rects, cv = CLEAR) { return clearance(G, P, rects) >= cv; }

export function blockedSet(m) {
  const s = new Set();
  for (const o of m.obstacles) for (const [c, r] of o.cells) s.add(key(c, r));
  s.add(key(m.guard.col, m.guard.row));
  return s;
}
export function freeCells(m) {
  const b = blockedSet(m), out = [];
  for (let r = 0; r < m.grid.h; r++) for (let c = 0; c < m.grid.w; c++) if (!b.has(key(c, r))) out.push([c, r]);
  return out;
}
export const rectsOf = (m) => m.obstacles.map((o) => o.rect);
export const guardPos = (m) => { const p = cellCenter(m.guard.col, m.guard.row); return [p[0] + (m.guard.ox || 0), p[1] + (m.guard.oz || 0)]; };

export function stepCell(m, cell, h, blocked = blockedSet(m)) {
  const nc = cell[0] + DIRS[h][0], nr = cell[1] + DIRS[h][1];
  if (!inGrid(m, nc, nr) || blocked.has(key(nc, nr))) return { cell, moved: false };
  return { cell: [nc, nr], moved: true };
}
export function classifyFor(m, i) {
  const G = guardPos(m), R = m.obstacles[i].rect, out = new Map();
  for (const [c, r] of freeCells(m)) {
    const P = cellCenter(c, r);
    const h = hiddenRobust(G, P, [R]), v = segRectDist(G[0], G[1], P[0], P[1], R) >= CLEAR;
    out.set(key(c, r), h && !v ? 'H' : v && !h ? 'V' : '?');
  }
  return out;
}
const OPS = ['forward', 'left', 'right', 'back'];
export function applyOp(m, st, op, blocked) {
  if (op === 'left') return { cell: st.cell, heading: (st.heading + 3) % 4 };
  if (op === 'right') return { cell: st.cell, heading: (st.heading + 1) % 4 };
  const h = op === 'back' ? (st.heading + 2) % 4 : st.heading;
  return { cell: stepCell(m, st.cell, h, blocked).cell, heading: st.heading };
}
export function bfsPlan(m, goal, from = { cell: [m.start.col, m.start.row], heading: m.start.heading }) {
  const blocked = blockedSet(m);
  const sk = (s) => `${s.cell[0]},${s.cell[1]},${s.heading}`;
  const prev = new Map([[sk(from), null]]);
  const q = [from];
  while (q.length) {
    const s = q.shift();
    if (goal.has(key(s.cell[0], s.cell[1]))) {
      const acts = [];
      let k = sk(s);
      while (prev.get(k)) { const p = prev.get(k); acts.push(p.op); k = p.k; }
      return { acts: acts.reverse(), end: s };
    }
    for (const op of OPS) {
      const n = applyOp(m, s, op, blocked), nk = sk(n);
      if (prev.has(nk)) continue;
      prev.set(nk, { k: sk(s), op });
      q.push(n);
    }
  }
  return null;
}
export function reachable(m) {
  const blocked = blockedSet(m), seen = new Set([key(m.start.col, m.start.row)]), q = [[m.start.col, m.start.row]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!inGrid(m, nc, nr) || blocked.has(key(nc, nr)) || seen.has(key(nc, nr))) continue;
      seen.add(key(nc, nr)); q.push([nc, nr]);
    }
  }
  return seen;
}
export function bearing(E, h, P) {
  const fx = DIRS[h][0], fz = DIRS[h][1];
  const dx = P[0] - E[0], dz = P[1] - E[1];
  const fwd = dx * fx + dz * fz, right = dx * -fz + dz * fx;
  return Math.atan2(right, fwd) * 180 / Math.PI;
}
