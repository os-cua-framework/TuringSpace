import { RT, mat } from './_f16_pick_kit.js';

export const VIEW = { w: 500, h: 380 };
export const HALF = 2.2, BODY_H = 2.8, BODY_D = 1.15, MAST_PITCH = 4.5, MAST_DZ = 1.6, MAST_H = 1.8, MAST_Y = 0.9;
export const CAM_Y = 14, CAM_LOOK_Z = 21;
export const LIVERIES = [
  { name: 'red', body: '#c8352d', stripe: '#f1e7d3' }, { name: 'blue', body: '#2f66b8', stripe: '#f1e7d3' },
  { name: 'green', body: '#2f8f55', stripe: '#f1e7d3' }, { name: 'yellow', body: '#e2b21c', stripe: '#3a3f46' },
  { name: 'purple', body: '#7a4fb5', stripe: '#f1e7d3' },
  { name: 'orange', body: '#e0702a', stripe: '#f1e7d3' }, { name: 'teal', body: '#1f9aa3', stripe: '#f1e7d3' },
];

export function camOf(m, k) {
  const x = m.cam.x0 + m.cam.dA * k;
  return RT.makeCam({ eye: [x, CAM_Y, 0], target: [x, 0, -CAM_LOOK_Z], fovY: m.cam.fov, W: VIEW.w, H: VIEW.h });
}
const CAMS = new WeakMap();
export function camCached(m, k) { let c = CAMS.get(m); if (!c) { c = []; CAMS.set(m, c); } return (c[k] ??= camOf(m, k)); }
export const trainX = (m, i, k) => m.trains[i].x0 + m.trains[i].xs[k];

export function screenOf(m, i, k) {
  const c = camCached(m, k), T = m.trains[i], X = trainX(m, i, k);
  const q = c.project(X, 0.5 + BODY_H / 2, -T.z), t = c.project(X, 0.5 + BODY_H, -T.z), b = c.project(X, 0.5, -T.z);
  const l = c.project(X - HALF, 2.0, -T.z), r = c.project(X + HALF, 2.0, -T.z);
  const m0 = c.project(T.mast, MAST_Y, -T.z + MAST_DZ), m1 = c.project(T.mast + MAST_PITCH, MAST_Y, -T.z + MAST_DZ);
  return { x: q.x, y: q.y, size: Math.abs(b.y - t.y), left: l.x, right: r.x, top: t.y, bot: b.y, depth: q.z, mastX: m0.x, mastSp: Math.abs(m1.x - m0.x) };
}
export function mastXs(m, i, k) {
  const T = m.trains[i], ex = m.cam.x0 + m.cam.dA * k, reach = 0.95 * (T.z - MAST_DZ) + 2, out = [];
  const j0 = Math.floor((ex - reach - T.mast) / MAST_PITCH), j1 = Math.ceil((ex + reach - T.mast) / MAST_PITCH);
  for (let j = j0; j <= j1; j++) out.push(T.mast + j * MAST_PITCH);
  return out;
}

const bodyTex = (liv) => {
  const B = RT.lin(liv.body), S = RT.lin(liv.stripe), G = RT.lin('#222c34'), W_ = RT.lin('#9fb9c9'), D = RT.lin('#d8d4cc');
  return (x, y, z, nx, ny, nz, s, out) => {
    const u = x - s.cx; let c = B;
    if (nz > 0.5) {
      const win = y > 2.0 && y < 2.95 && Math.abs(u) < HALF - 0.25;
      const door = Math.abs(((u + 100) % 2.6) - 1.3) < 0.28 && y < 2.9;
      if (win) { const post = Math.abs(((u + 100.55) % 1.3) - 0.65) > 0.5; c = post ? S : (Math.abs(u) > 1.85 ? G : W_); }
      else if (y < 1.1) c = S;
      else if (door) c = D;
    } else if (ny > 0.5) c = S;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
};
const mastTex = (hex) => { const A = RT.lin(hex), Wt = [0.82, 0.8, 0.76]; return (x, y, z, nx, ny, nz, s, out) => { const c = Math.floor(y / 0.45) % 2 === 0 ? A : Wt; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }; };
const skyFn = (dx, dy, dz, out) => { const t = Math.max(0, Math.min(1, dy * 2.2 + 0.05)); out[0] = 0.78 - 0.42 * t; out[1] = 0.84 - 0.28 * t; out[2] = 0.95 - 0.12 * t; };

const MATS = new WeakMap();
function matsOf(m) {
  let C = MATS.get(m); if (C) return C;
  const mats = [
    mat('#3b3f45', 0.1, 20),
    mat('#d9d3c6', 0.04, 8),
    mat('#7d8a58', 0.02, 8),
    mat('#d0d2d6', 0.3, 40),
    ...m.trains.map((t) => mat(t.body, 0.2, 40, { tex: bodyTex(LIVERIES.find((l) => l.name === t.color)) })),
    ...m.trains.map((t) => mat('#9a9a9a', 0.02, 8, { tex: mastTex(t.body) })),
  ];
  const zs = m.trains.map((t) => t.z);
  const gravel = RT.lin('#8e8a82'), gravel2 = RT.lin('#76726b'), sleeper = RT.lin('#5a5148'), rail = RT.lin('#aab0b8');
  const floor = (x, zz, fp, out) => {
    const z = -zz;
    const n = RT.fbm(x * 3, z * 3, 3, fp * 3), f = RT.fbm(x * 22, z * 22, 2, fp * 22);
    let c = [gravel[0] + (gravel2[0] - gravel[0]) * n, gravel[1] + (gravel2[1] - gravel[1]) * n, gravel[2] + (gravel2[2] - gravel[2]) * n];
    const k = 0.9 + 0.2 * (f - 0.5); c = c.map((v) => v * k);
    for (const zt of zs) {
      const dz = Math.abs(z - zt);
      if (dz < 1.15) {
        const sl = RT.lineMask(x, 0.7, 0.13, fp); c = c.map((v, i) => v + (sleeper[i] - v) * 0.75 * sl);
        if (Math.abs(dz - 0.72) < 0.05 + fp) c = c.map((v, i) => v + (rail[i] - v) * 0.9);
      } else if (dz < 1.9) { c = c.map((v, i) => v + (gravel[i] - v) * 0.2); }
    }
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  const env = { floorY: 0, floor, floorMat: { ks: 0.02, sh: 14 }, sky: skyFn };
  C = { mats, env };
  MATS.set(m, C);
  return C;
}
export function sceneAt(m, k) {
  const C = matsOf(m), S = RT.shape, shapes = [], cam = camCached(m, k), ex = cam.eye[0];
  m.trains.forEach((T, i) => {
    const X = trainX(m, i, k), z = -T.z;
    shapes.push(S.box(i, 4 + i, X, 0.5 + BODY_H / 2 - 0.05, z, HALF, BODY_H / 2 - 0.05, BODY_D, 0, 0.14));
    shapes.push(S.box(i, 1, X, 0.5 + BODY_H + 0.02, z, HALF - 0.2, 0.1, BODY_D - 0.3, 0, 0.05));
    for (const sx of [-1, 1]) shapes.push(S.box(i, 0, X + sx * 1.7, 0.42, z, 0.8, 0.3, BODY_D - 0.25, 0, 0.05));
    for (const mx of mastXs(m, i, k)) {
      if (Math.abs(mx - ex) > 0.95 * T.z + 3) continue;
      shapes.push(S.cyl(100 + i, 4 + m.trains.length + i, mx, z + MAST_DZ, 0, MAST_H, 0.13, 0.02));
      shapes.push(S.sphere(100 + i, 3, mx, MAST_H, z + MAST_DZ, 0.15));
    }
  });
  const zmax = Math.max(...m.trains.map((t) => t.z));
  shapes.push(S.box(120, 2, ex, 5, -(zmax + 8), 90, 5, 1.2, 0, 0.2));
  const L = { dir: [-0.45, 0.8, 0.55], col: [1.22, 1.14, 1.0], soft: 0.03, sky: [0.5, 0.56, 0.64], ground: [0.28, 0.27, 0.24], aoK: 0.7, contact: 0.2, contactH: 0.2 };
  return RT.makeScene({ cam, shapes, mats: C.mats, light: L, env: C.env, exposure: 1.0 });
}

export function drawWindow(g) {
  const w = VIEW.w, h = VIEW.h, a = 9, b = 22;
  g.save();
  g.fillStyle = '#20252b';
  g.beginPath(); g.rect(0, 0, w, h);
  const r = 14; g.moveTo(a + r, a); g.arcTo(w - a, a, w - a, h - b, r); g.arcTo(w - a, h - b, a, h - b, r); g.arcTo(a, h - b, a, a, r); g.arcTo(a, a, w - a, a, r); g.closePath();
  g.fill('evenodd');
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#2d343c'; g.fillRect(0, h - b + 2, w, b - 2);
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, h - b + 2, w, 2);
  g.restore();
}
