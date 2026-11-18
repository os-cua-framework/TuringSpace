import * as SC from './_lazy_susan_serve_scene.js';
const { RT, GEO, ID, BOARD, N_DISH, PLATE_Y, FOOD_TOP, dirOf, atR, cameraOf, proj, buildScene } = SC;

export const N_TURN = 3;
export const TOL = 7;
export const TURN_MIN = 1, CENTRE_R = 0.06;
export const GRAB = { rIn: 0.17, rOut: GEO.trayR + 0.03 };
const DEG = Math.PI / 180;
export const wrap = (a) => { let x = ((a + 180) % 360 + 360) % 360 - 180; if (x === -180) x = 180; return x; };

export const dishPsi = (phi, i) => phi + 60 * i;
export const errDeg = (m, phi) => wrap(dishPsi(phi, m.target.dish) - m.guests[m.target.guest].psi);
export const solved = (m, phi) => Math.abs(errDeg(m, phi)) <= TOL;
export function pointerPsi(m, x, y) {
  const p = RT.planeAtPixel(cameraOf(m), x, y, GEO.trayY1);
  if (!p || Math.hypot(p.x, p.z) < CENTRE_R) return null;
  return Math.atan2(p.x, p.z) / DEG;
}
export function sweeper(m) {
  const s = { prev: null, turn: 0, feed(x, y) { const a = pointerPsi(m, x, y); if (a === null) return s.turn; if (s.prev !== null) s.turn += wrap(a - s.prev); s.prev = a; return s.turn; } };
  return s;
}
export function turnOfPath(m, path) {
  const grab = grabAt(m, path[0][0], path[0][1]);
  if (!grab) return null;
  const sw = sweeper(m);
  for (const [x, y] of path) sw.feed(x, y);
  return { turn: Math.abs(sw.turn) < TURN_MIN ? 0 : sw.turn, grab };
}

const STATIC = new WeakMap();
export function staticScene(m) {
  let s = STATIC.get(m);
  if (!s) { s = buildScene(m, 0, { dishes: false }); STATIC.set(m, s); }
  return s;
}
export function grabAt(m, x, y) {
  if (!(x >= 0 && y >= 0 && x <= BOARD.w && y <= BOARD.h)) return null;
  const sc = staticScene(m);
  if (RT.pickId(sc, x, y) !== ID.tray) return null;
  const p = RT.planeAtPixel(cameraOf(m), x, y, GEO.trayY1);
  if (!p) return null;
  const r = Math.hypot(p.x, p.z);
  if (!(r >= GRAB.rIn && r <= GRAB.rOut)) return null;
  return { r, psi: Math.atan2(p.x, p.z) / DEG };
}

const VIS = new WeakMap();
const SCENES = { m: null, list: [] };
function sceneAt(m, phi) {
  if (SCENES.m !== m) { SCENES.m = m; SCENES.list = []; }
  const k = Math.round(phi * 1000);
  let e = SCENES.list.find((x) => x.k === k);
  if (!e) { e = { k, sc: buildScene(m, phi) }; SCENES.list.push(e); if (SCENES.list.length > 4) SCENES.list.shift(); }
  return e.sc;
}
export function visAt(m, phi, i, step = 2) {
  let memo = VIS.get(m);
  if (!memo) { memo = new Map(); VIS.set(m, memo); }
  const key = `${Math.round(phi * 1000)}|${i}|${step}`;
  let v = memo.get(key);
  if (v === undefined) {
    v = RT.objectStats(sceneAt(m, phi), ID.dish(i), step).frac;
    if (memo.size > 2000) memo.clear();
    memo.set(key, v);
  }
  return v;
}
export function dishBox(m, phi, i, pad = 0) {
  const cam = cameraOf(m), d = dirOf(dishPsi(phi, i)), c = [GEO.dishR * d[0], GEO.dishR * d[1]], r = GEO.plateR + 0.012;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < 16; k++) for (const y of [GEO.trayY1, PLATE_Y + FOOD_TOP]) {
    const t = k * Math.PI / 8, p = proj(cam, [c[0] + r * Math.cos(t), y, c[1] + r * Math.sin(t)]);
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
export const dishScreen = (m, psi) => proj(cameraOf(m), atR(psi, GEO.dishR, PLATE_Y + 0.02));
export function chestScreen(m, k) {
  const g = m.guests[k], d = dirOf(g.psi), R0 = GEO.pelvisR;
  return proj(cameraOf(m), [d[0] * R0, GEO.seatY + 0.1 + 0.3 * g.h / 1.7, d[1] * R0]);
}
export const trayCentreScreen = (m) => proj(cameraOf(m), [0, PLATE_Y, 0]);
export function screenNearestPsi(m, k) {
  const c = chestScreen(m, k);
  let best = Infinity, arg = 0;
  for (let a = 0; a < 360; a += 0.5) { const p = dishScreen(m, a), d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < best) { best = d; arg = a; } }
  return arg;
}
export function screenBearingPsi(m, k) {
  const c = chestScreen(m, k), o = trayCentreScreen(m), want = Math.atan2(c[1] - o[1], c[0] - o[0]);
  let best = Infinity, arg = 0;
  for (let a = 0; a < 360; a += 0.5) {
    const p = dishScreen(m, a), d = Math.abs(wrap((Math.atan2(p[1] - o[1], p[0] - o[0]) - want) / DEG));
    if (d < best) { best = d; arg = a; }
  }
  return arg;
}
export function minPlatePx(m) {
  const cam = cameraOf(m);
  let mn = Infinity;
  for (let a = 0; a < 360; a += 30) {
    const d = dirOf(a), c = [GEO.dishR * d[0], GEO.dishR * d[1]];
    for (let k = 0; k < 18; k++) {
      const t = k * Math.PI / 18, p1 = proj(cam, [c[0] + GEO.plateR * Math.cos(t), PLATE_Y, c[1] + GEO.plateR * Math.sin(t)]);
      const p2 = proj(cam, [c[0] - GEO.plateR * Math.cos(t), PLATE_Y, c[1] - GEO.plateR * Math.sin(t)]);
      mn = Math.min(mn, Math.hypot(p1[0] - p2[0], p1[1] - p2[1]));
    }
  }
  return mn;
}
export function trayUnblocked(m) {
  const sc = staticScene(m);
  for (let a = 0; a < 360; a += 6) for (const [r, y] of [[0.24, PLATE_Y + 0.04], [GEO.dishR, PLATE_Y + 0.06], [0.45, PLATE_Y + 0.04], [GEO.trayR - 0.01, GEO.trayY1]]) {
    const P = atR(a, r, y), h = RT.rayToPoint(sc, P[0], P[1], P[2]);
    if (h.id >= 0 && h.t < h.tP - 0.02 && h.id !== ID.vase && h.id !== ID.tray && h.id !== ID.table) return false;
  }
  return true;
}

export function guestsVisible(m, need = 3) {
  const sc = staticScene(m), cam = cameraOf(m);
  return m.guests.every((g, k) => {
    const d = dirOf(g.psi), t = [d[1], -d[0]], kk = g.h / 1.7, py = GEO.seatY + 0.1 * kk, R0 = GEO.pelvisR - 0.05;
    let n = 0;
    for (const [side, up] of [[0, 0.36], [0.11, 0.36], [-0.11, 0.36], [0, 0.2], [0, 0.46]]) {
      const P = [d[0] * R0 + t[0] * side * kk, py + up * kk, d[1] * R0 + t[1] * side * kk], q = proj(cam, P);
      if (!(q[0] > 2 && q[0] < BOARD.w - 2 && q[1] > 2 && q[1] < BOARD.h - 2)) continue;
      const h = RT.rayToPoint(sc, P[0], P[1], P[2]);
      if (h.id === ID.guest(k) || h.t >= h.tP - 0.03) n++;
    }
    return n >= need;
  });
}

export const GRAB_R = 0.43, STEP_DEG = 15;
export function grabPoint(m, psi = 0, r = GRAB_R) { return proj(cameraOf(m), atR(psi, r, GEO.trayY1)); }
export function rimPath(m, psi0, deg, step = STEP_DEG, r = GRAB_R) {
  const n = Math.max(1, Math.ceil(Math.abs(deg) / step - 1e-9)), out = [];
  for (let k = 0; k <= n; k++) out.push(grabPoint(m, psi0 + deg * k / n, r));
  return out;
}
export function turnAction(m, turnDeg) { return { op: 'turn', path: rimPath(m, -turnDeg / 2, turnDeg) }; }
export function oraclePlan(m) { return [turnAction(m, -errDeg(m, m.phi0))]; }
