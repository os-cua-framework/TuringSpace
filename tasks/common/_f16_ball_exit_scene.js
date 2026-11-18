import * as K from './_f16_ball_exit_kit.js';
export const R_BALL = 0.4, POST_R = 0.2, POST_H = 0.95, MAT_R = 0.8;
const ORANGE = K.lin('#e2701f'), WHITE = K.lin('#f1efe8'), STONE = K.lin('#a39a8b'), DARK = K.lin('#3b4048'), TRIM = K.lin('#d8d1c2');
const POST_W = K.lin('#f2f0ea'), POST_R_COL = K.lin('#c8332b');
export function posAt(m, k) {
  const B = m.ball;
  if (k <= B.kc) return [B.C[0] - B.dIn[0] * B.vIn * (B.kc - k), B.C[1] - B.dIn[1] * B.vIn * (B.kc - k)];
  return [B.C[0] + B.dOut[0] * B.vOut * (k - B.kc), B.C[1] + B.dOut[1] * B.vOut * (k - B.kc)];
}
function rollAt(m, k) {
  const B = m.ball;
  return k <= B.kc ? { d: B.dIn, s: B.vIn * k } : { d: B.dOut, s: B.vIn * B.kc + B.vOut * (k - B.kc) };
}
export function ballAt(m, k) {
  const [x, z] = posAt(m, k), r = rollAt(m, k), hd = Math.atan2(r.d[0], r.d[1]), b = K.yawAx(hd), th = r.s / R_BALL, c = Math.cos(th), s = Math.sin(th);
  const ax = { u: b.u, v: K.add(K.mul(b.v, c), K.mul(b.w, s)), w: K.add(K.mul(b.v, -s), K.mul(b.w, c)) };
  return K.sphere([x, R_BALL, z], R_BALL, ORANGE, { ...ax, gloss: 0.35, shin: 60, foot: { x, z, r: R_BALL * 0.9 }, aoK: 0.6,
    tex: (lp) => (Math.abs(lp[1]) < 0.22 ? WHITE : (Math.abs(lp[0]) < 0.04 ? DARK : undefined)) });
}
export function pavPrim(m) {
  const P = m.pav;
  return K.box([P.x, P.hh / 2, P.z], [P.hw, P.hh / 2, P.hd], K.yawAx(0), STONE, { gloss: 0.08, foot: { x: P.x, z: P.z, hx: P.hw, hz: P.hd, yaw: 0 }, aoK: 0.5,
    tex: (lp, ln) => {
      const y = lp[1] + P.hh / 2;
      if (y > P.hh - 0.12) return TRIM;
      if (ln[2] < -0.5) {
        const wx = ((lp[0] + P.hw) % 1.1) - 0.55;
        if (Math.abs(wx) < 0.32 && y > 0.7 && y < 1.5 && Math.abs(lp[0]) < P.hw - 0.4) return DARK;
      }
      return undefined;
    } });
}
export function postPrim(m) {
  const P = m.post;
  return K.cyl([P.x, POST_H / 2, P.z], { u: [1, 0, 0], v: [0, 0, -1], w: [0, 1, 0] }, POST_R, POST_H / 2, POST_W, { gloss: 0.25, foot: { x: P.x, z: P.z, r: POST_R }, aoK: 0.5,
    tex: (lp) => { const y = lp[2] + POST_H / 2; return (y > POST_H - 0.05 || (y > 0.5 && y < 0.62) || (y > 0.74 && y < 0.86)) ? POST_R_COL : undefined; } });
}
export function primsAt(m, k) { return [pavPrim(m), postPrim(m), ballAt(m, k)]; }
export function look(m, k, cam = K.camOf(m)) {
  const S = ballAt(m, k), box = K.screenBox(cam, S), hid = K.sphereHidden(cam, S, [pavPrim(m)]);
  return { box, cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, diam: (box[2] - box[0] + box[3] - box[1]) / 2, hid, x: S.c[0], z: S.c[2] };
}
export const matScreen = (m, cam = K.camOf(m)) => m.mats.map((t) => { const s = K.proj(cam, t.x, 0, t.z); return { x: s[0], y: s[1] }; });
