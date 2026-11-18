export const STEP = 45;
export const SUB = 0.02;
export const SLIP = 0.04;
export const NUDGE = 0.06;
const EPS = 1e-7;

export function wallsFromFloors(floors, t) {
  const xs = new Set(), zs = new Set();
  for (const f of floors) {
    for (const v of [f.x0, f.x1, f.x0 - t, f.x1 + t]) xs.add(+v.toFixed(6));
    for (const v of [f.z0, f.z1, f.z0 - t, f.z1 + t]) zs.add(+v.toFixed(6));
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const inF = (x, z) => floors.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1);
  const inE = (x, z) => floors.some((f) => x > f.x0 - t && x < f.x1 + t && z > f.z0 - t && z < f.z1 + t);
  const walls = [];
  for (let j = 0; j + 1 < Z.length; j++) {
    const zc = (Z[j] + Z[j + 1]) / 2;
    let run = -1;
    for (let i = 0; i + 1 <= X.length; i++) {
      const isWall = i + 1 < X.length && (() => { const xc = (X[i] + X[i + 1]) / 2; return !inF(xc, zc) && inE(xc, zc); })();
      if (isWall && run < 0) run = i;
      if (!isWall && run >= 0) { walls.push([X[run], Z[j], X[i], Z[j + 1]]); run = -1; }
    }
  }
  walls.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const out = [];
  for (const w of walls) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - w[0]) < 1e-9 && Math.abs(last[2] - w[2]) < 1e-9 && Math.abs(last[3] - w[1]) < 1e-9) last[3] = w[3];
    else out.push(w.slice());
  }
  return out;
}

export function axes(a) {
  const r = a * Math.PI / 180;
  return { ux: Math.cos(r), uz: -Math.sin(r), nx: Math.sin(r), nz: Math.cos(r) };
}
export function corners(m, x, z, a) {
  const { ux, uz, nx, nz } = axes(a), hl = m.sofa.L / 2, hw = m.sofa.W / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [x + s * hl * ux + t * hw * nx, z + s * hl * uz + t * hw * nz]);
}

function hitRect(x, z, A, hl, hw, r) {
  const rcx = (r[0] + r[2]) / 2, rcz = (r[1] + r[3]) / 2, rhx = (r[2] - r[0]) / 2, rhz = (r[3] - r[1]) / 2;
  const dx = rcx - x, dz = rcz - z;
  const ex = Math.abs(A.ux) * hl + Math.abs(A.nx) * hw;
  if (Math.abs(dx) >= ex + rhx - EPS) return false;
  const ez = Math.abs(A.uz) * hl + Math.abs(A.nz) * hw;
  if (Math.abs(dz) >= ez + rhz - EPS) return false;
  const pu = Math.abs(A.ux) * rhx + Math.abs(A.uz) * rhz;
  if (Math.abs(dx * A.ux + dz * A.uz) >= hl + pu - EPS) return false;
  const pn = Math.abs(A.nx) * rhx + Math.abs(A.nz) * rhz;
  if (Math.abs(dx * A.nx + dz * A.nz) >= hw + pn - EPS) return false;
  return true;
}

const OBS = new WeakMap();
export function obstacles(m) {
  let o = OBS.get(m);
  if (!o) { o = m.walls.concat(m.furniture.map((f) => f.rect)); OBS.set(m, o); }
  return o;
}

export function free(m, x, z, a) {
  const A = axes(a), hl = m.sofa.L / 2, hw = m.sofa.W / 2, R = Math.hypot(hl, hw);
  const b = m.bbox;
  if (x - R < b[0] - 1 || x + R > b[2] + 1 || z - R < b[1] - 1 || z + R > b[3] + 1) return false;
  for (const r of obstacles(m)) {
    if (r[2] < x - R || r[0] > x + R || r[3] < z - R || r[1] > z + R) continue;
    if (hitRect(x, z, A, hl, hw, r)) return false;
  }
  return true;
}
export function sweepFree(m, x, z, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 3));
  for (let i = 0; i <= n; i++) if (!free(m, x, z, a0 + (a1 - a0) * i / n)) return false;
  return true;
}
export function segFree(m, x0, z0, x1, z1, a) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (SUB / 2)));
  for (let i = 1; i <= n; i++) if (!free(m, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, a)) return false;
  return true;
}

export function moveToward(m, st, tx, tz) {
  let x = st.x, z = st.z;
  const a = st.a;
  for (let it = 0; it < 4000; it++) {
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    if (d < 1e-6) break;
    const s = Math.min(SUB, d), sx = dx / d * s, sz = dz / d * s;
    if (free(m, x + sx, z + sz, a)) { x += sx; z += sz; continue; }
    const opts = Math.abs(sx) >= Math.abs(sz) ? [[sx, 0], [0, sz]] : [[0, sz], [sx, 0]];
    let moved = false;
    for (const [ax, az] of opts) {
      if (Math.abs(ax) + Math.abs(az) < 1e-5) continue;
      if (free(m, x + ax, z + az, a)) { x += ax; z += az; moved = true; break; }
    }
    if (moved) continue;
    const domX = Math.abs(dx) >= Math.abs(dz);
    const ex = domX ? Math.sign(dx) * Math.min(SUB, Math.abs(dx)) : 0, ez = domX ? 0 : Math.sign(dz) * Math.min(SUB, Math.abs(dz));
    const perp = domX ? (dz >= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);
    for (let k = 1; k * 0.01 <= SLIP + 1e-9 && !moved; k++) {
      for (const sg of [perp, -perp]) {
        const ox = domX ? 0 : sg * k * 0.01, oz = domX ? sg * k * 0.01 : 0;
        if (!free(m, x + ox + ex, z + oz + ez, a)) continue;
        if (!segFree(m, x, z, x + ox, z + oz, a)) continue;
        x += ox + ex; z += oz + ez; moved = true; break;
      }
    }
    if (!moved) break;
  }
  st.x = x; st.z = z;
  return { ok: true };
}

const OFFS = (() => {
  const o = [];
  const n = Math.round(NUDGE / 0.02);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const ox = i * 0.02, oz = j * 0.02, d = Math.hypot(ox, oz);
    if (d > 0 && d <= NUDGE + 1e-9) o.push([ox, oz, d]);
  }
  o.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1]);
  return o;
})();

export function turnTarget(m, x, z, a, dir) {
  const a1 = a + dir * STEP;
  if (sweepFree(m, x, z, a, a1)) return { x, z, a: a1, nudge: 0 };
  for (const [ox, oz, d] of OFFS) {
    const qx = x + ox, qz = z + oz;
    if (!free(m, qx, qz, a)) continue;
    if (!sweepFree(m, qx, qz, a, a1)) continue;
    if (!segFree(m, x, z, qx, qz, a)) continue;
    return { x: qx, z: qz, a: a1, nudge: d };
  }
  return null;
}
export const normA = (a) => ((a % 360) + 360) % 360;

export function inBedroom(m, x, z, a) {
  const b = m.bedroom;
  return corners(m, x, z, a).every(([px, pz]) => px >= b[0] - 1e-6 && px <= b[2] + 1e-6 && pz >= b[1] - 1e-6 && pz <= b[3] + 1e-6);
}
