import * as RT from './_people_rt.js';

export const SHIRTS = ['#b4533c', '#4d77a8', '#cf9f3a', '#5a8c57', '#7b5d9e', '#c4733d', '#3e8c8e', '#b25579'];
export const PANTS = ['#363b47', '#4b4d56', '#5a4a3c', '#2e3442', '#6a6458'];
export const SKINS = ['#e8c09c', '#d7a57e', '#b47f57', '#8d5e3e'];
export const HAIRS = ['#2b1f18', '#161616', '#5b3b23', '#8c6a3e'];

export function peopleMats(people) {
  const mats = [], idx = [];
  for (const p of people) {
    const b = mats.length;
    mats.push(RT.skinMat(SKINS[p.skin]), RT.hairMat(HAIRS[p.hair]), RT.clothMat(SHIRTS[p.shirt]), RT.clothMat(PANTS[p.pants]), RT.clothMat('#2a2a2f', 0.22));
    idx.push({ skin: b, hair: b + 1, top: b + 2, bottom: b + 3, shoe: b + 4 });
  }
  return { mats, idx };
}

export function hashList(list) {
  let h = 2166136261;
  for (const v of list) { h ^= Math.round(v * 100) | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function frameOrbit({ az, el, fov, pts, W, H, pad }) {
  let t = [0, 0, 0];
  for (const p of pts) { t[0] += p[0] / pts.length; t[1] += p[1] / pts.length; t[2] += p[2] / pts.length; }
  let dist = 8;
  const box = (cam) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return [x0, x1, y0, y1];
  };
  let cam = null;
  for (let it = 0; it < 14; it++) {
    cam = RT.orbitCam({ az, el, dist, fov, tx: t[0], ty: t[1], tz: t[2] }, W, H);
    const b = box(cam);
    const dx = (b[0] + b[1]) / 2 - W / 2, dy = (b[2] + b[3]) / 2 - H / 2;
    const s = dist / cam.f;
    t = [t[0] + cam.R[0] * dx * s - cam.U[0] * dy * s, t[1] - cam.U[1] * dy * s, t[2] + cam.R[2] * dx * s - cam.U[2] * dy * s];
    const k = Math.max((b[1] - b[0]) / (W - 2 * pad), (b[3] - b[2]) / (H - 2 * pad));
    dist *= 0.35 + 0.65 * k;
  }
  return RT.orbitCam({ az, el, dist, fov, tx: t[0], ty: t[1], tz: t[2] }, W, H);
}

export function probeVis(sc, id, probes) {
  let n = 0;
  for (const p of probes) {
    const r = RT.rayToPoint(sc, p[0], p[1], p[2]);
    if (r.id === id || r.id === -1 || r.t >= r.tP - 0.03) n++;
  }
  return n / probes.length;
}
export function personProbes(x, z, f, h = 1.7) {
  const k = h / 1.7, r = [-f[2], 0, f[0]], out = [];
  const P = (side, fwd, up) => [x + r[0] * side * k + f[0] * fwd * k, up * k, z + r[2] * side * k + f[2] * fwd * k];
  out.push(P(0, 0.03, 1.63), P(0.05, 0.03, 1.66), P(-0.05, 0.03, 1.66), P(0, 0.08, 1.6));
  out.push(P(0.1, 0.05, 1.3), P(-0.1, 0.05, 1.3), P(0, 0.09, 1.25), P(0.08, 0.06, 1.1), P(-0.08, 0.06, 1.1));
  out.push(P(0.09, 0.06, 0.9), P(-0.09, 0.06, 0.9), P(0.09, 0.05, 0.55), P(-0.09, 0.05, 0.55));
  return out;
}
