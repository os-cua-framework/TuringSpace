import * as M from './_false_belief_keys_model.js';
const { DEG, r2, r3, mix32 } = M;

export const TEMPLATES = [
  { id: 'A', w: 20, kinds: 'SPPH', slots: 'VVVHH', expect: 1 },
  { id: 'A2', w: 18, kinds: 'SPHP', slots: 'VVHHr', expect: 1 },
  { id: 'F', w: 7, kinds: 'SSPH', slots: 'VVVHH', expect: 2 },
  { id: 'D', w: 5, kinds: 'SPH', slots: 'VVHH', expect: 1 },
  { id: 'B', w: 3, kinds: 'SSP', slots: 'VVVv', expect: 2 },
  { id: 'C', w: 3, kinds: 'PSP', slots: 'VVVv', expect: 2 },
  { id: 'G', w: 3, kinds: 'SP', slots: 'VVV', expect: 1 },
  { id: 'R1', w: 12, kinds: 'SSP', slots: 'VVrV', expect: 2 },
  { id: 'R2', w: 8, kinds: 'SSPH', slots: 'VVrHH', expect: 2 },
  { id: 'K1', w: 8, kinds: 'PS', slots: 'VVV', expect: 2 },
  { id: 'K2', w: 6, kinds: 'SPS', slots: 'VVVv', expect: 3 },
  { id: 'K3', w: 7, kinds: 'PPS', slots: 'VHVV', expect: 3 },
];
export const LIM = {
  headPx: 15, headMovePx: 10, boxPx: 22, boxSepPx: 30, shelfPx: 100, margin: 12,
  downMin: 3.2, losPad: 0.2, hidePad: 0.2, minAct: 1.3, clip: [14, 31], camAng: [48, 132],
};

const PAL = {
  skin: ['#e8c4a8', '#d4a07a', '#a8704a', '#7a4a2e', '#f0d0b8'],
  hair: ['#2a1f1a', '#5a3a22', '#a8743a', '#d6bd86', '#141414'],
  annaTop: ['#e8e0f0', '#bcd9e8', '#d9e8c4', '#c9b8e0', '#f2f2ee'],
  annaBottom: ['#34405a', '#4a5a78', '#6a4a34'],
  bobTop: ['#3d4350', '#6b7a8f', '#5a6b4a', '#7a6a58'],
  bobBottom: ['#2a2a2e', '#a89470', '#34405a'],
  wall: ['#efe9dc', '#e6e9ea', '#eadfd0', '#e3e8de'],
  wood: ['#b98d61', '#a47b52', '#c9a577'],
  rug: ['#8aa3b8', '#b89a86', '#9db39a', '#a79bb8'],
  sofa: ['#6f87a0', '#a58a74', '#7f9a82', '#9a8aa8', '#b08a8a'],
  shelf: ['#8a6a4a', '#6f5238', '#b49066'],
};
const pick = (r, a) => a[Math.floor(r.raw() * a.length)];
export const WHY = { last: '' };

export function seedDraws(r0) {
  let u = r0.raw() * TEMPLATES.reduce((s, t) => s + t.w, 0), tpl = TEMPLATES[0];
  for (const t of TEMPLATES) { if (u < t.w) { tpl = t; break; } u -= t.w; }
  return { tpl, flip: r0.sign(), hold: r2(0.8 + 0.7 * r0.raw()), colors: r0.sample(M.COLORS, 5), slotV: r0.shuffle([0, 1, 2]), slotH: r0.shuffle([3, 4]) };
}

function supportObb(sp) {
  return M.obb(sp.x, sp.z, sp.hx, sp.hz, sp.f?.[0] ?? 0, sp.f?.[1] ?? 1, 0, sp.top);
}
export function buildWorld(r, D) {
  const fl = D.flip, X = (x) => fl * x, F = (a) => [fl * a[0], a[1]];
  const m = { task: M.NAME, live: true, flip: fl };
  if (D.nv !== undefined) m.nv = D.nv;
  const U = r.uniform;
  const phi = U(-9, 9) * DEG, af = F([Math.cos(phi), Math.sin(phi)]);
  const sofaZ = r2(-0.25 + U(-0.1, 0.1)), sofaX = -1.62 + U(-0.03, 0.03);
  m.anna = { x: r3(X(sofaX)), z: sofaZ, f: [r3(af[0]), r3(af[1])], k: r2(U(0.93, 1.0)), skin: pick(r, PAL.skin), hair: pick(r, PAL.hair), top: pick(r, PAL.annaTop), bottom: pick(r, PAL.annaBottom), down: [] };
  m.sofa = { x: r3(X(sofaX)), z: sofaZ, f: F([1, 0]), hx: 0.88, hz: 0.43, color: pick(r, PAL.sofa) };
  const eye = M.annaEyeUp(m), E = [eye[0], eye[2]];
  const shW = U(1.1, 1.3), shH = U(1.82, 2.0), psi = U(-8, 8) * DEG;
  const shelf = { x: r3(X(0.45 + U(-0.05, 0.05))), z: r3(sofaZ + U(-0.1, 0.1)), w: r2(shW), d: 0.34, h: r2(shH), f: F([-Math.cos(psi), Math.sin(psi)]), wood: pick(r, PAL.shelf) };
  shelf.f = [r3(shelf.f[0]), r3(shelf.f[1])];
  m.shelf = shelf;
  const sbZ = r2(sofaZ + U(-0.08, 0.08)), sbTop = r2(U(0.74, 0.8));
  m.sideboard = { x: r3(X(1.76)), z: sbZ, hx: 0.85, hz: 0.21, f: F([-1, 0]), top: sbTop, wood: pick(r, PAL.wood) };
  const nv = D.nv ?? M.NV;
  const th = [U(36, 38), U(63, 65), U(-52, -48)], dd = [U(2.5, 2.6), U(1.65, 1.75), U(1.15, 1.25)];
  for (let i = 3; i < nv; i++) { const ex = D.extra[i - 3]; th.push(U(ex.th[0], ex.th[1])); dd.push(U(ex.dd[0], ex.dd[1])); }
  const types = r.shuffle(nv > 3 ? ['round', 'square', 'drum', 'round', 'square'].slice(0, nv) : ['round', 'square', 'drum']);
  const eye0 = [X(eye[0]), eye[2]], f0 = [Math.cos(phi), Math.sin(phi)];
  const E0 = [eye0[0], eye0[1]];
  const pos0 = th.map((t, i) => { const a = Math.atan2(f0[1], f0[0]) + t * DEG; return [E0[0] + dd[i] * Math.cos(a), E0[1] + dd[i] * Math.sin(a)]; });
  const supports = pos0.map((p, i) => {
    const ty = types[i], top = r2(U(0.72, 0.8));
    const half = ty === 'square' ? 0.24 : 0.27;
    return { type: ty, x: r3(X(p[0])), z: r3(p[1]), hx: half, hz: half, f: [0, 1], top, r: half };
  });
  m.supports = supports;
  const dims = () => ({ w: 0.34, d: 0.24, h: 0.17 });
  m.boxes = [];
  const slotColor = D.colors;
  for (let i = 0; i < nv; i++) {
    const s = supports[i];
    m.boxes.push({ i, color: slotColor[i][0], hex: slotColor[i][1], x: s.x, z: s.z, y: s.top, f: [0, 1], ...dims(), hid: false, stand: null, standF: null });
  }
  const hz = [sbZ - 0.4 + U(-0.04, 0.04), sbZ + 0.4 + U(-0.04, 0.04)];
  for (let j = 0; j < 2; j++) {
    m.boxes.push({ i: nv + j, color: slotColor[nv + j][0], hex: slotColor[nv + j][1], x: m.sideboard.x, z: r3(hz[j]), y: sbTop, f: F([-1, 0]), ...dims(), hid: true, stand: null, standF: null });
  }
  m.coffee = { x: r3(X(-0.64 + U(-0.04, 0.04))), z: r3(sofaZ + U(-0.06, 0.06)), hx: 0.42, hz: 0.23, f: F([1, 0]), h: 0.42 };
  m.plant = { x: r3(X(U(1.5, 1.66))), z: r3(U(-1.45, -1.3)), r: 0.21, h: r2(U(1.2, 1.45)) };
  m.lamp = { x: r3(X(-1.93)), z: r3(sofaZ - 0.95 + U(-0.1, 0.1)), r: 0.14, h: 1.55 };
  m.decor = {
    wall: pick(r, PAL.wall), wood: pick(r, PAL.wood), rug: pick(r, PAL.rug), seed: Math.floor(r.raw() * 1e6),
    winA: r3(X(U(-0.2, 0.9))), pics: [r3(U(-0.9, 0.9)), r3(U(-0.9, 0.9))],
  };
  const shelfO = M.obb(shelf.x, shelf.z, shelf.w / 2, shelf.d / 2, shelf.f[0], shelf.f[1], 0, shelf.h);
  m.occ = [shelfO];
  m.occCam = [shelfO,
    M.obb(m.sofa.x, m.sofa.z, 0.88, 0.43, m.sofa.f[0], m.sofa.f[1], 0, 0.9),
    M.obb(m.sideboard.x, m.sideboard.z, 0.85, 0.21, m.sideboard.f[0], m.sideboard.f[1], 0, sbTop),
    M.obb(m.plant.x, m.plant.z, m.plant.r, m.plant.r, 0, 1, 0, m.plant.h),
    M.obb(m.lamp.x, m.lamp.z, m.lamp.r, m.lamp.r, 0, 1, 0, m.lamp.h)];
  m.obst = [
    M.obb(m.sofa.x, m.sofa.z, 0.88, 0.43, m.sofa.f[0], m.sofa.f[1], 0, 0.9),
    shelfO,
    M.obb(m.sideboard.x, m.sideboard.z, 0.85, 0.21, m.sideboard.f[0], m.sideboard.f[1], 0, sbTop),
    M.obb(m.plant.x, m.plant.z, m.plant.r, m.plant.r, 0, 1, 0, m.plant.h),
    M.obb(m.lamp.x, m.lamp.z, m.lamp.r, m.lamp.r, 0, 1, 0, m.lamp.h),
    ...supports.map((s) => M.obb(s.x, s.z, s.hx, s.hz, 0, 1, 0, s.top)),
  ];
  return m;
}

function standPoint(m, i, r) {
  const b = m.boxes[i], eye = M.annaEyeUp(m), cam = M.camOf(m, 0).eye;
  const cands = [];
  if (b.hid) {
    for (const dz of [-0.1, 0, 0.1]) cands.push([b.x + b.f[0] * 0.6, b.z + dz]);
  } else {
    const sup = m.supports[i], toAnna = Math.atan2(eye[2] - b.z, eye[0] - b.x), toCam = Math.atan2(cam[2] - b.z, cam[0] - b.x);
    const angDiff = (a, c) => Math.abs(((a - c + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    for (let q = 0; q < 24; q++) {
      const a = q * Math.PI / 12;
      if (angDiff(a, toAnna) < 60 * DEG || angDiff(a, toCam) < 50 * DEG) continue;
      cands.push([b.x + (sup.type === 'square' ? 0.5 : 0.52) * Math.cos(a), b.z + (sup.type === 'square' ? 0.5 : 0.52) * Math.sin(a)]);
    }
  }
  const cam0 = M.camOf(m, 0), bk = m.bob.k, L = LIM;
  const proj = (p, y) => cam0.project(p[0], y, p[1]);
  const ok = cands.filter((p) => {
    if (!(p[0] > M.ROOM.x0 + 0.4 && p[0] < M.ROOM.x1 - 0.3 && p[1] > M.ROOM.z0 + 0.4 && p[1] < M.ROOM.z1 - 0.35) || m.obst.some((o) => M.inObb2(o, p[0], p[1], 0.23))) return false;
    const ch = [p[0], 1.15 * bk, p[1]], hd = [p[0], 1.7 * bk, p[1]];
    if (!b.hid ? !(M.losClear(m, ch, L.losPad) && M.losClear(m, hd, L.losPad)) : (M.losClear(m, ch, -L.hidePad) || M.losClear(m, hd, -L.hidePad))) return false;
    const h = proj(p, 1.78 * bk), f = proj(p, 0);
    return inFrame([h.x, h.y], L.margin) && inFrame([f.x, f.y], L.margin);
  });
  if (!ok.length) return null;
  const ref = [m.flip * 0.9, 1.5];
  const reach = ok.filter((p) => { const pp = M.planPath(m.obst, ref, p, 0.2); return pp && M.pathLen(pp) < 7.5; });
  if (!reach.length) return null;
  return r.shuffle(reach)[0];
}

export function seqFor(tpl, V, H, rep) {
  const seq = [];
  let vi = 0, hi = 0;
  for (const c of tpl.slots) {
    if (c === 'V') seq.push(V[vi++]);
    else if (c === 'H') seq.push(H[hi++]);
    else if (c === 'r') seq.push(seq[0]);
    else { const prev = seq[seq.length - 1], pool = V.slice(0, 2).filter((q) => q !== prev); seq.push(pool[Math.min(rep, pool.length - 1)]); }
  }
  return seq;
}
const PATHS = new WeakMap();
function pathCached(m, from, to) {
  let c = PATHS.get(m.obst); if (!c) { c = new Map(); PATHS.set(m.obst, c); }
  const key = from.join(',') + '>' + to.join(',');
  if (!c.has(key)) c.set(key, M.planPath(m.obst, from, to, 0.2));
  return c.get(key);
}
export function drawPar(m, r) {
  const speed = r.uniform(1.25, 1.4), dA = r.uniform(1.25, 1.45), dI = r.uniform(1.2, 1.35);
  const ST = [[1.15, 1.35], [1.0, 1.65], [1.35, 0.95], [1.1, 1.0], [0.9, 1.0], [-0.55, -0.45], [-0.55, 0.4]];
  const cand = r.shuffle(ST).map((p) => [m.flip * p[0], p[1]]);
  const cam0 = M.camOf(m, 0), bk = m.bob.k;
  const inPic = (p) => { const h = cam0.project(p[0], 1.78 * bk, p[1]), f = cam0.project(p[0], 0, p[1]); return inFrame([h.x, h.y], LIM.margin) && inFrame([f.x, f.y], LIM.margin); };
  const free = (p) => !m.obst.some((o) => M.inObb2(o, p[0], p[1], 0.3)) && inPic(p);
  const startP = cand.find(free);
  const exits = cand.slice().reverse().filter((p) => free(p) && startP && Math.hypot(p[0] - startP[0], p[1] - startP[1]) > 0.5);
  if (!startP || !exits.length) return null;
  return { speed: r3(speed), dA: r3(dA), dI: r3(dI), startP, exitP: exits[0], exits };
}
export function timelineFor(m, seq, kinds, par) {
  const acts = [{ mode: 'drop', box: seq[0], move: -1 }];
  for (let j = 0; j < kinds.length; j++) acts.push({ mode: 'lift', box: seq[j], move: j }, { mode: 'drop', box: seq[j + 1], move: j });
  const segs = [];
  let t = 0.7, cur = par.startP.slice();
  const fa0 = M.norm3([m.anna.x - cur[0], 0, m.anna.z - cur[1]]);
  segs.push({ k: 'stand', t0: 0, t1: 0.7, at: cur.slice(), f: [r3(fa0[0]), r3(fa0[2])] });
  const walkTo = (to) => {
    const pts = pathCached(m, cur, to);
    if (!pts) { WHY.walk = [cur, to]; return false; }
    const len = M.pathLen(pts);
    if (len < 0.05) return true;
    const dur = M.walkTime(len, par.speed), last = pts[pts.length - 1], prev = pts[pts.length - 2], fe = M.norm3([last[0] - prev[0], 0, last[1] - prev[1]]);
    segs.push({ k: 'walk', t0: r3(t), t1: r3(t + dur), pts, len: r3(len), fEnd: [r3(fe[0]), r3(fe[2])] });
    t += dur; cur = last.slice();
    return true;
  };
  const faceBox = (p, i) => { const b = m.boxes[i], d = M.norm3([b.x - p[0], 0, b.z - p[1]]); return [r3(d[0]), r3(d[2])]; };
  let at = -1;
  for (const act of acts) {
    const b = m.boxes[act.box];
    if (act.box !== at) { if (!walkTo(b.stand)) return null; at = act.box; }
    else { segs.push({ k: 'stand', t0: r3(t), t1: r3(t + par.dI), at: cur.slice(), f: faceBox(cur, act.box) }); t += par.dI; }
    segs.push({ k: 'act', t0: r3(t), t1: r3(t + par.dA), at: cur.slice(), f: faceBox(cur, act.box), box: act.box, mode: act.mode, move: act.move });
    act.t0 = t; act.t1 = t + par.dA; t += par.dA;
  }
  if (!walkTo(par.exitP)) return null;
  const fa = M.norm3([m.anna.x - cur[0], 0, m.anna.z - cur[1]]);
  segs.push({ k: 'stand', t0: r3(t), t1: r3(t + 1.0), at: cur.slice(), f: [r3(fa[0]), r3(fa[2])] });
  t += 1.0;
  const dropEnd = new Map();
  for (const ac of acts) if (ac.mode === 'drop') dropEnd.set(ac.move, ac.t1);
  const down = [];
  for (let j = 0; j < kinds.length;) {
    if (kinds[j] !== 'P') { j++; continue; }
    let j1 = j;
    while (j1 + 1 < kinds.length && kinds[j1 + 1] === 'P') j1++;
    down.push([r3(dropEnd.get(j - 1) + 0.4), r3(dropEnd.get(j1) + 0.3)]);
    j = j1 + 1;
  }
  return { segs, T: r3(t), down };
}
function buildTimeline(m, r, D) {
  const tpl = D.tpl, kinds = tpl.kinds;
  const seq = seqFor(tpl, D.slotV, D.slotH, Math.floor(r.raw() * 2));
  if (seq.length !== kinds.length + 1) { WHY.tl = 'seqlen'; return null; }
  const par = drawPar(m, r);
  if (!par) { WHY.tl = 'startexit'; return null; }
  const tl = timelineFor(m, seq, kinds.split(''), par);
  if (!tl) { WHY.tl = 'walk'; return null; }
  m.seq = seq; m.kinds = kinds; m.tpl = tpl.id; m.par = par;
  m.bob.segs = tl.segs; m.T = tl.T; m.anna.down = tl.down;
  const ans = M.belief(m);
  if (ans >= 0) {
    const far = par.exits.filter((p) => Math.hypot(p[0] - m.boxes[ans].stand[0], p[1] - m.boxes[ans].stand[1]) >= 0.95);
    if (!far.length) { WHY.tl = 'exit'; return null; }
    if (far[0] !== par.exitP) {
      par.exitP = far[0];
      const t2 = timelineFor(m, seq, kinds.split(''), par);
      if (!t2) { WHY.tl = 'walk2'; return null; }
      m.bob.segs = t2.segs; m.T = t2.T; m.anna.down = t2.down;
    }
  }
  delete par.exits;
  return true;
}
export function hypotheses(m) {
  const perm = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q]));
  const out = [];
  for (const tpl of TEMPLATES) for (const V of perm([0, 1, 2])) for (const H of perm([3, 4])) for (const rep of [0, 1]) {
    if (!tpl.slots.includes('v') && rep) continue;
    const seq = seqFor(tpl, V, H, rep);
    if (seq.length !== tpl.kinds.length + 1) continue;
    const key = tpl.id + seq.join('');
    if (out.some((h) => h.key === key)) continue;
    out.push({ key, tpl: tpl.id, seq, kinds: tpl.kinds });
  }
  return out;
}

const inFrame = (q, mg) => q[0] >= mg && q[0] <= M.VIEW.w - mg && q[1] >= mg && q[1] <= M.VIEW.h - mg;
export function screenStatic(m, slack = 0) {
  const L = LIM, cam = M.camOf(m, 0), eyeC = cam.eye, at = (p) => M.project(m, 0, p);
  const base = M.annaBase(m), k = m.anna.k;
  const hUp = M.figureJoints({ ...base, lean: 0.05, yaw: 0, pitch: -0.03 }), hDn = M.figureJoints({ ...base, lean: 0.32, yaw: 0, pitch: M.PITCH_DOWN });
  const a = at(M.add3(hUp.hc, [0, 1, 0], 0.11 * k)), b = at(M.add3(hUp.hc, [0, 1, 0], -0.11 * k));
  if (!(Math.hypot(a[0] - b[0], a[1] - b[1]) >= L.headPx)) return 'head-small';
  const pu = at(hUp.hc), pd = at(hDn.hc);
  if (!(Math.hypot(pu[0] - pd[0], pu[1] - pd[1]) >= L.headMovePx)) return 'head-move';
  if (!inFrame(pu, L.margin + 14) || !inFrame(pd, L.margin + 14)) return 'anna-out';
  const tops = [];
  for (let i = 0; i < m.boxes.length; i++) {
    const s = M.boxScreen(m, 0, i);
    if (!(s.w >= L.boxPx + slack)) return 'box-small';
    if (!inFrame([s.box[0], s.box[1]], L.margin) || !inFrame([s.box[2], s.box[3]], L.margin)) return 'box-out';
    tops.push(s.top);
    const bx = m.boxes[i], g = M.boxGeom(bx), pts = [[bx.x, bx.y + bx.h + 0.05, bx.z]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([bx.x + g.r[0] * sx * bx.w / 2 + g.f[0] * sz * bx.d / 2, bx.y + bx.h + 0.02, bx.z + g.r[2] * sx * bx.w / 2 + g.f[2] * sz * bx.d / 2]);
    if (pts.filter((p) => !m.occCam.some((o) => M.segHitsObb(o, eyeC, p, 0.02))).length < 4) return 'box-hidden-from-camera';
  }
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) if (Math.hypot(tops[i][0] - tops[j][0], tops[i][1] - tops[j][1]) < L.boxSepPx) return 'boxes-close';
  const sh = m.shelf, sb = at([sh.x, 0, sh.z]), st = at([sh.x, sh.h, sh.z]);
  if (!(sb[1] - st[1] >= L.shelfPx)) return 'shelf-short';
  const eye = M.annaEyeUp(m), hb = m.boxes.filter((b) => b.hid), h3 = hb[0], h4 = hb[1];
  const dH = [(h3.x + h4.x) / 2 - eye[0], (h3.z + h4.z) / 2 - eye[2]], dC = [-(eyeC[0] - m.cam.target[0]), -(eyeC[2] - m.cam.target[2])];
  const ang = Math.acos((dH[0] * dC[0] + dH[1] * dC[1]) / (Math.hypot(...dH) * Math.hypot(...dC))) / DEG;
  if (!(ang >= L.camAng[0] && ang <= L.camAng[1])) return 'cam-angle';
  return '';
}
function screenBob(m) {
  const L = LIM, cam = M.camOf(m, 0), at = (p) => M.project(m, 0, p);
  for (const seg of m.bob.segs) if (seg.k !== 'walk') {
    const hd = at([seg.at[0], 1.75 * m.bob.k, seg.at[1]]), ft = at([seg.at[0], 0, seg.at[1]]);
    if (!inFrame(hd, L.margin) || !inFrame(ft, L.margin)) return 'bob-out';
    if (m.occCam.some((o) => M.segHitsObb(o, cam.eye, [seg.at[0], 1.15 * m.bob.k, seg.at[1]], 0))) return 'bob-hidden-from-camera';
  }
  for (const bx of m.boxes) {
    const sp = bx.stand, a1 = Math.atan2(sp[1] - bx.z, sp[0] - bx.x), a2 = Math.atan2(cam.eye[2] - bx.z, cam.eye[0] - bx.x);
    if (Math.abs(((a1 - a2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 50 * DEG) return 'bob-in-front-of-lid';
  }
  return '';
}
function pickCamera(m, r) {
  const cands = [];
  for (let az = -60; az <= 60; az += 5) for (const el of [32, 36, 40]) cands.push([az, el]);
  for (const [az, el] of r.shuffle(cands).slice(0, 30)) {
    m.cam = { az0: az, el, dist: 6.1, fov: 40, target: [0, 0.72, 0.1] };
    M.resetCams(m);
    const bad = screenStatic(m, 3);
    if (!bad) return true;
    WHY.cam = WHY.cam || {}; WHY.cam[bad] = (WHY.cam[bad] || 0) + 1;
  }
  return false;
}

export function check(m) {
  const L = LIM;
  if (!m || m.task !== M.NAME || !m.live) return 'task';
  const kinds = m.kinds.split(''), seq = m.seq;
  if (seq.length !== kinds.length + 1) return 'seq';
  if (!(m.T >= L.clip[0] && m.T <= L.clip[1])) return 'clip-length';
  if (!(m.hold >= 0.8 && m.hold <= 1.5)) return 'hold';
  for (let i = 0; i < m.boxes.length; i++) {
    const b = m.boxes[i], lid = [b.x, b.y + b.h + 0.05, b.z], sp = b.stand, ch = [sp[0], 1.15 * m.bob.k, sp[1]], hd = [sp[0], 1.7 * m.bob.k, sp[1]];
    if (!b.hid) {
      if (!M.losClear(m, lid, L.losPad)) return `box${i}-not-clear`;
      if (!(M.losClear(m, ch, L.losPad) && M.losClear(m, hd, L.losPad))) return `stand${i}-not-clear`;
    } else {
      if (M.losClear(m, lid, -L.hidePad)) return `box${i}-not-hidden`;
      if (M.losClear(m, ch, -L.hidePad) || M.losClear(m, hd, -L.hidePad)) return `stand${i}-not-hidden`;
    }
  }
  for (const a of m.bob.segs.filter((s) => s.k === 'act')) {
    const kind = a.move < 0 ? 'S' : kinds[a.move], seen = M.seenAct(m, a), losOnly = M.seenAct(m, a, { ignoreGaze: true });
    const g = M.gazeDuring(m, a.t0 - M.WIN, a.t1 + M.WIN);
    if (kind === 'S' && !(seen && g.max < 0.25)) return 'S-not-seen';
    if (kind === 'P' && !(g.min > 0.75 && !seen)) return 'P-not-down';
    if (kind === 'H' && !(g.max < 0.25 && !losOnly && !seen)) return 'H-not-hidden';
  }
  for (const [a, b] of m.anna.down) if (!(b - a >= L.downMin)) return 'down-short';
  if (m.anna.down.some(([, b]) => b + 0.8 > m.T)) return 'down-runs-over';
  if (M.belief(m) !== m.answer) return 'answer';
  if (m.boxes[m.answer].hid) return 'belief-hidden';
  const tpl = m.tplDef || TEMPLATES.find((t) => t.id === m.tpl);
  if (!tpl || m.answer !== seq[tpl.expect]) return 'template-answer';
  const bad = screenStatic(m) || screenBob(m);
  if (bad) return `screen-${bad}`;
  if (!m.epi || !m.epi.pts || m.epi.len > 5.5) return 'epi';
  return null;
}

const fail = (w) => { WHY.last = w; return null; };
export function tryBuild(r, D) {
  const m = buildWorld(r, D);
  m.bob = { k: r2(r.uniform(0.98, 1.06)), skin: pick(r, PAL.skin), hair: pick(r, PAL.hair), top: pick(r, PAL.bobTop), bottom: pick(r, PAL.bobBottom), ph: r2(r.uniform(0, 6)), segs: [] };
  m.hold = D.hold;
  for (const b of m.boxes) b.f = b.hid ? m.sideboard.f.slice() : [0, 1];
  if (!pickCamera(m, r)) return fail('camera');
  m.cam.az0 = r2(m.cam.az0);
  for (let i = 0; i < m.boxes.length; i++) {
    const sp = standPoint(m, i, r);
    if (!sp) return fail('stand' + i);
    const b = m.boxes[i], d = M.norm3([b.x - sp[0], 0, b.z - sp[1]]);
    b.stand = [r3(sp[0]), r3(sp[1])]; b.standF = [r3(d[0]), r3(d[2])];
    if (!b.hid) b.f = [r3(-d[0]), r3(-d[2])];
  }
  if (!buildTimeline(m, r, D)) return fail('timeline');
  m.answer = M.belief(m);
  if (m.answer < 0) return fail('answer');
  const base = M.annaBase(m), s0 = [base.x + base.f[0] * 0.45, base.z + base.f[1] * 0.45], bx = m.boxes[m.answer];
  const pts = M.planPath([...m.obst, M.obb(m.par.exitP[0], m.par.exitP[1], 0.2, 0.2, 0, 1, 0, 1.8)], s0, bx.stand, 0.2);
  if (!pts) { WHY.epi = [s0, bx.stand]; return fail('epi-path'); }
  const fe = M.norm3([bx.x - bx.stand[0], 0, bx.z - bx.stand[1]]);
  m.epi = { pts, len: r3(M.pathLen(pts)), f0: base.f.slice(), f1: [r3(fe[0]), r3(fe[2])] };
  m.board = { w: M.VIEW.w, h: M.VIEW.h };
  m.dt = 0.5;
  return m;
}
