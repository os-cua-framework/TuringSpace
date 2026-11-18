import { drawPromptText, UI_FONT, ACCENT, rr } from '../core/panel.js';
import { makeCamera, dot3, sub3, unit3 } from '../common/_proj3d.js';
import { makeScene, cA, camFromProj, taskBox, paintTex, studioEnv, plankFloor, STUDIO_LIGHT, paintCached, shape, UNIT } from '../common/_camera_motion_pick_rt.js';
import * as LOOK from '../common/_camera_motion_pick_look.js';
import { splitIds, nthOf, hash32 } from '../core/style.js';
import * as S3 from '../common/_style3d.js';

const rad = (d) => d * Math.PI / 180;
const COLORS = ['#e0574f', '#4f86d9', '#e8a23c', '#54ad78', '#9b6cc8'];

const BOARD = { w: 748, h: 338 };
const PW = 236, PH = 216;
const PANELS = [0, 1, 2].map((k) => ({ x: 10 + k * (PW + 10), y: 8, w: PW, h: PH }));
const PANEL_TAGS = ['Start', 'A', 'B'];
const PPY = PH / 2 - 24;
const F0 = 230;
const NB = 5, NEAR = 2;
const MOVES = [
  { id: 0, kind: 'step', label: 'Left', glyph: '◀' },
  { id: 1, kind: 'step', label: 'Right', glyph: '▶' },
  { id: 2, kind: 'step', label: 'Forward', glyph: '▲' },
  { id: 3, kind: 'step', label: 'Back', glyph: '▼' },
  { id: 4, kind: 'turn', label: 'Left', glyph: 'turnL' },
  { id: 5, kind: 'turn', label: 'Right', glyph: 'turnR' },
  { id: 6, kind: 'zoom', label: 'In', glyph: 'zoomIn' },
  { id: 7, kind: 'zoom', label: 'Out', glyph: 'zoomOut' },
];
const GROUPS = [{ name: 'STEP', ids: [0, 1, 2, 3] }, { name: 'TURN IN PLACE', ids: [4, 5] }, { name: 'ZOOM', ids: [6, 7] }];
const ROW = { y: [244, 290], h: 40, labelX: 12, x0: 96, w: 72, gap: 5, groupGap: 12 };
function moveBtn(row, id) {
  const g = id < 4 ? 0 : id < 6 ? 1 : 2;
  return { x: ROW.x0 + id * (ROW.w + ROW.gap) + g * (ROW.groupGap - ROW.gap), y: ROW.y[row], w: ROW.w, h: ROW.h };
}

const RULE = Object.freeze({
  LAT: [22, 34],
  LOGZ_IN: [Math.log(1.33), Math.log(1.45)],
  LOGZ_OUT: [Math.log(1.42), Math.log(1.56)],
  STEP_SPREAD: 22,
  TURN_SPREAD: 6,
  FLAT_Z: 0.03,
  DOLLY_RATIO: 1.6,
  DOCC: 0.15,
  margin: 5, minPx: 14, cov: 0.45,
  TAG: { w: 56, h: 30 },
  OCC: [0.15, 0.40],
  CAM_H: [16, 22], PITCH: [-1.5, 1.5],
});
const SIDEWAYS = (k) => k === 0 || k === 1 || k === 4 || k === 5;
const answerOk = (a) => a[0] !== a[1] && !(SIDEWAYS(a[0]) && SIDEWAYS(a[1]));

function basis(yawDeg, pitchDeg) {
  const a = rad(yawDeg), p = rad(pitchDeg);
  const f = { x: -Math.sin(a) * Math.cos(p), y: -Math.sin(p), z: -Math.cos(a) * Math.cos(p) };
  const r = { x: Math.cos(a), y: 0, z: -Math.sin(a) };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
}
const TAG = RULE.TAG;
function camOf(c) {
  const { f, r, u } = basis(c.yaw, c.pitch), eye = { x: c.x, y: c.y, z: c.z };
  const project = (p) => {
    const q = sub3(p, eye), depth = dot3(q, f), s = c.f / Math.max(5, depth);
    return { x: dot3(q, r) * s, y: -dot3(q, u) * s, depth, s };
  };
  return { eye, f, r, u, fpx: c.f, project };
}
export function moveCam(c, mv) {
  const { f, r } = basis(c.yaw, c.pitch), t = mv.amt;
  const at = (v, k) => ({ ...c, x: +(c.x + v.x * k).toFixed(4), y: +(c.y + v.y * k).toFixed(4), z: +(c.z + v.z * k).toFixed(4) });
  switch (mv.kind) {
    case 0: return at(r, -t);
    case 1: return at(r, t);
    case 2: return at(f, t);
    case 3: return at(f, -t);
    case 4: return { ...c, yaw: c.yaw + t };
    case 5: return { ...c, yaw: c.yaw - t };
    case 6: return { ...c, f: c.f * t };
    default: return { ...c, f: c.f / t };
  }
}
const center = (o) => ({ x: o.x, y: o.h / 2, z: o.z });
function bounds(boxes, cc) {
  return boxes.map((o) => {
    const a = rad(o.yawDeg), ca = Math.cos(a), sa = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, dd = 0, mind = Infinity;
    for (const lx of [-o.w / 2, o.w / 2]) for (const ly of [0, o.h]) for (const lz of [-o.d / 2, o.d / 2]) {
      const p = cc.project({ x: o.x + lx * ca + lz * sa, y: ly, z: o.z - lx * sa + lz * ca });
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); dd += p.depth / 8; mind = Math.min(mind, p.depth);
    }
    return { x0, x1, y0, y1, depth: dd, mind };
  });
}
function photoOk(c, boxes) {
  const cc = camOf(c), bs = bounds(boxes, cc), m = RULE.margin;
  if (bs.some((b) => b.mind < 30 || b.x0 < -PW / 2 + m || b.x1 > PW / 2 - m || b.y0 < -PPY + m || b.y1 > PH - PPY - m)) return null;
  if (bs.some((b) => b.x0 < -PW / 2 + TAG.w && b.y0 < -PPY + TAG.h)) return null;
  if (bs.some((b) => Math.min(b.x1 - b.x0, b.y1 - b.y0) < RULE.minPx)) return null;
  const occ = occlusion(boxes, cc);
  if (boxes.some((_, j) => occ.reduce((a, row) => a + row[j], 0) > RULE.cov)) return null;
  return bs;
}
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const area2 = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
function clip2(subject, cp) {
  const sg = Math.sign(area2(cp)) || 1;
  let out = subject;
  for (let i = 0; i < cp.length && out.length; i++) {
    const A = cp[i], B = cp[(i + 1) % cp.length], inp = out; out = [];
    const side = (p) => sg * ((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push({ x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) }); }
    }
  }
  return out;
}
export function occlusion(boxes, cc) {
  const sil = boxes.map((o) => {
    const a = rad(o.yawDeg), ca = Math.cos(a), sa = Math.sin(a), pts = [];
    let dd = 0;
    for (const lx of [-o.w / 2, o.w / 2]) for (const ly of [0, o.h]) for (const lz of [-o.d / 2, o.d / 2]) {
      const p = cc.project({ x: o.x + lx * ca + lz * sa, y: ly, z: o.z - lx * sa + lz * ca });
      pts.push(p); dd += p.depth / 8;
    }
    return { poly: hull2(pts), depth: dd };
  });
  return sil.map((a, i) => sil.map((b, j) => {
    if (i === j || a.depth >= b.depth) return 0;
    const I = clip2(b.poly, a.poly);
    return I.length >= 3 ? Math.abs(area2(I)) / Math.abs(area2(b.poly)) : 0;
  }));
}
function startOk(c, boxes) {
  const bs = photoOk(c, boxes);
  if (!bs) return false;
  const ord = bs.map((b, i) => i).sort((i, j) => bs[i].depth - bs[j].depth);
  const near = ord.slice(0, NEAR), far = ord.slice(NEAR);
  if (bs[far[0]].depth < 1.5 * bs[near[NEAR - 1]].depth) return false;
  const occ = occlusion(boxes, camOf(c));
  if (Math.max(...occ.flat()) > RULE.OCC[1]) return false;
  return near.some((i) => far.some((j) => occ[i][j] >= RULE.OCC[0]));
}
export function changeOf(c0, c1, boxes) {
  const A = camOf(c0), B = camOf(c1);
  const lat = [], lz = [], dep = [];
  for (const o of boxes) {
    const a = A.project(center(o)), b = B.project(center(o));
    lat.push(b.x - a.x); lz.push(Math.log(b.s / a.s)); dep.push(a.depth);
  }
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ord = dep.map((d, i) => i).sort((i, j) => dep[i] - dep[j]), sg = Math.sign(mean(lz)) || 1;
  const nl = ord.slice(0, NEAR).map((i) => sg * lz[i]), fl = ord.slice(NEAR).map((i) => sg * lz[i]);
  return { lat: mean(lat), spread: Math.max(...lat) - Math.min(...lat), logz: mean(lz), zr: Math.exp(Math.max(...lz) - Math.min(...lz)),
    lr: Math.exp(Math.min(...nl) - Math.max(...fl)), perLat: lat, perLogz: lz };
}
const inR = (v, [a, b]) => v >= a && v <= b;
function changeOk(kind, ch) {
  if (kind === 0 || kind === 1 || kind === 4 || kind === 5) {
    const sign = kind === 0 || kind === 4 ? 1 : -1;
    if (Math.sign(ch.lat) !== sign || !inR(Math.abs(ch.lat), RULE.LAT) || Math.abs(ch.logz) > RULE.FLAT_Z) return false;
    return kind < 2 ? ch.spread >= RULE.STEP_SPREAD : ch.spread <= RULE.TURN_SPREAD;
  }
  const sign = kind === 2 || kind === 6 ? 1 : -1;
  if (Math.sign(ch.logz) !== sign || !inR(Math.abs(ch.logz), sign > 0 ? RULE.LOGZ_IN : RULE.LOGZ_OUT)) return false;
  return kind < 4 ? ch.lr >= RULE.DOLLY_RATIO : ch.zr <= 1.0001;
}
function doccOk(kind, c0, c1, boxes) {
  if (kind !== 2 && kind !== 3) return true;
  const o0 = occlusion(boxes, camOf(c0)), o1 = occlusion(boxes, camOf(c1));
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) if (o0[i][j] >= RULE.OCC[0] && Math.abs(o1[i][j] - o0[i][j]) >= RULE.DOCC) return true;
  return false;
}
function strength(c0, boxes, kind, amt) {
  const ch = changeOf(c0, moveCam(c0, { kind, amt }), boxes);
  return kind === 0 || kind === 1 || kind === 4 || kind === 5 ? Math.abs(ch.lat) : Math.abs(ch.logz);
}
const AMT_MAX = [160, 160, 140, 260, 35, 35, 2, 2];
const AMT_DEC = [2, 2, 2, 2, 3, 3, 4, 4];
const TWIN = [4, 5, 6, 7, 0, 1, 2, 3];
function solveChange(c0, boxes, kind, target) {
  let lo = kind >= 6 ? 1 : 0, hi = AMT_MAX[kind];
  if (strength(c0, boxes, kind, hi) < target) return null;
  for (let it = 0; it < 48; it++) { const mid = (lo + hi) / 2; if (strength(c0, boxes, kind, mid) < target) lo = mid; else hi = mid; }
  const mv = { kind, amt: +((lo + hi) / 2).toFixed(AMT_DEC[kind]) };
  const c1 = moveCam(c0, mv);
  return changeOk(kind, changeOf(c0, c1, boxes)) && photoOk(c1, boxes) && doccOk(kind, c0, c1, boxes) ? mv : null;
}
function makeChange(rng, c0, boxes, kind) {
  const lateral = kind === 0 || kind === 1 || kind === 4 || kind === 5;
  const R = lateral ? RULE.LAT : kind === 2 || kind === 6 ? RULE.LOGZ_IN : RULE.LOGZ_OUT, pad = lateral ? 0.6 : 0.004;
  const mv = solveChange(c0, boxes, kind, rng.uniform(R[0] + pad, R[1] - pad));
  return mv && twinOk(c0, boxes, mv) ? mv : null;
}
const twinOk = (c0, boxes, mv) => !!solveChange(c0, boxes, TWIN[mv.kind], strength(c0, boxes, mv.kind, mv.amt));

function sampleScene(rng) {
  const yaw = +rng.uniform(-28, 28).toFixed(2), pitch = +rng.uniform(...RULE.PITCH).toFixed(2), hgt = +rng.uniform(...RULE.CAM_H).toFixed(2);
  const { f, r } = basis(yaw, pitch), ff = unit3({ x: f.x, y: 0, z: f.z });
  const back = rng.uniform(300, 340);
  const cam = { x: +(-ff.x * back).toFixed(2), y: hgt, z: +(-ff.z * back).toFixed(2), yaw, pitch, f: F0 };
  const cols = rng.shuffle(COLORS.slice()), boxes = [];
  for (let i = 0; i < NB; i++) {
    const near = i < NEAR;
    for (let a = 0; a < 80; a++) {
      const s = near ? rng.uniform(100, 114) : rng.uniform(500, 600);
      const d = s * Math.cos(rad(pitch)) + (hgt - 12) * Math.sin(rad(pitch));
      const l = (near ? rng.uniform(-34, 34) : rng.uniform(-64, 64)) * d / F0;
      const o = {
        x: +(cam.x + ff.x * s + r.x * l).toFixed(2), z: +(cam.z + ff.z * s + r.z * l).toFixed(2),
        w: near ? rng.int(15, 19) : rng.int(56, 72), d: near ? rng.int(15, 19) : rng.int(56, 72), h: near ? rng.int(13, 19) : rng.int(50, 66),
        yawDeg: +rng.uniform(0, 360).toFixed(1), color: cols[i],
      };
      if (boxes.every((b) => Math.hypot(b.x - o.x, b.z - o.z) >= (Math.hypot(b.w, b.d) + Math.hypot(o.w, o.d)) / 2 + 4)) { boxes.push(o); break; }
    }
  }
  return boxes.length === NB ? { cam, boxes } : null;
}

function makeRound(rng) {
  let answer = [rng.int(0, 7), rng.int(0, 7)];
  while (!answerOk(answer)) answer = [rng.int(0, 7), rng.int(0, 7)];
  for (let attempt = 0; attempt < 3000; attempt++) {
    const sc = sampleScene(rng);
    if (!sc || !startOk(sc.cam, sc.boxes)) continue;
    const moves = [];
    for (const kind of answer) {
      let mv = null;
      for (let t = 0; t < 6 && !mv; t++) mv = makeChange(rng, sc.cam, sc.boxes, kind);
      if (!mv) break;
      moves.push(mv);
    }
    if (moves.length === 2) return { cam: sc.cam, boxes: sc.boxes, moves, answer };
  }
  return JSON.parse(FALLBACK_JSON);
}
const FALLBACK_JSON = '{"cam":{"x":74.97,"y":16.32,"z":304.55,"yaw":13.83,"pitch":0.72,"f":230},"boxes":[{"x":36.35,"z":197.26,"w":15,"d":18,"h":16,"yawDeg":339.6,"color":"#9b6cc8"},{"x":62.99,"z":196.95,"w":15,"d":15,"h":14,"yawDeg":151.1,"color":"#4f86d9"},{"x":40.68,"z":-245.82,"w":62,"d":67,"h":58,"yawDeg":127.3,"color":"#54ad78"},{"x":-162,"z":-201.37,"w":61,"d":60,"h":51,"yawDeg":25.9,"color":"#e0574f"},{"x":-53.81,"z":-212.17,"w":58,"d":72,"h":51,"yawDeg":354.4,"color":"#e8a23c"}],"moves":[{"kind":7,"amt":1.5112},{"kind":2,"amt":52.49}],"answer":[7,2]}';

export function roundOk(rd) {
  if (!rd || !rd.cam || !Array.isArray(rd.boxes) || rd.boxes.length !== NB || !Array.isArray(rd.moves) || rd.moves.length !== 2) return false;
  if (!Array.isArray(rd.answer) || rd.answer.length !== 2 || !rd.answer.every((a, k) => Number.isInteger(a) && a >= 0 && a < 8 && rd.moves[k].kind === a)) return false;
  if (!answerOk(rd.answer)) return false;
  if (!(rd.cam.y >= RULE.CAM_H[0] && rd.cam.y <= RULE.CAM_H[1] && rd.cam.pitch >= RULE.PITCH[0] && rd.cam.pitch <= RULE.PITCH[1])) return false;
  if (!startOk(rd.cam, rd.boxes)) return false;
  return rd.moves.every((mv) => {
    const c1 = moveCam(rd.cam, mv);
    return changeOk(mv.kind, changeOf(rd.cam, c1, rd.boxes)) && !!photoOk(c1, rd.boxes) && doccOk(mv.kind, rd.cam, c1, rd.boxes) && twinOk(rd.cam, rd.boxes, mv);
  });
}

const LIGHT = { ...STUDIO_LIGHT, dir: [-0.55, 1, 0.45], soft: 0.04 };
const FLOOR = plankFloor({ plank: 0.11, plankL: 0.9, dark: '#c7a47c', light: '#ddc4a0' });
const MATS = COLORS.map((c) => ({ c: cA(c), ks: 0.22, sh: 36, tex: paintTex(c) }));
function photoScene(c, rd) {
  const cc = camOf(c);
  const cam = camFromProj({ eye: cc.eye, f: cc.f, r: cc.r, u: cc.u }, { focal: c.f, cx: PW / 2, cy: PPY, W: PW, H: PH });
  const shapes = rd.boxes.map((o, i) => taskBox(i, Math.max(0, COLORS.indexOf(o.color)), o, 0.03));
  return makeScene({ cam, shapes, mats: MATS, light: LIGHT, env: studioEnv({ floor: FLOOR, backdrop: '#e6e1d8', r0: 3.6, r1: 7.0, cx: 0, cz: 0, light: LIGHT }) });
}
function photoSceneStyled(c, rd, look) {
  const sc = photoScene(c, rd);
  const shapes = sc.shapes.map((s, i) => ({ ...s, m: matIdx(rd.boxes[i]) }));
  return makeScene({ cam: sc.cam, shapes, mats: look.mats, light: look.light, env: LOOK.sceneEnv(look) });
}
function drawPhoto(g, panel, c, rd, tag, cache, env) {
  g.save();
  rr(g, panel.x, panel.y, panel.w, panel.h, 7);
  g.clip();
  const look = env && env.style ? env.assets?.look : null;
  if (look) paintCached(g, cache, JSON.stringify([rd.boxes, c]) + '|style|' + env.style.key, () => photoSceneStyled(c, rd, look), panel.x, panel.y);
  else paintCached(g, cache, JSON.stringify([rd.boxes, c]), () => photoScene(c, rd), panel.x, panel.y);
  g.restore();
  rr(g, panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, 7);
  g.strokeStyle = 'rgba(60,72,84,.28)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(30,42,52,.72)';
  const tw = tag === 'Start' ? 44 : 24;
  rr(g, panel.x + 6, panel.y + 6, tw, 18, 4); g.fill();
  g.fillStyle = '#fff'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(tag, panel.x + 6 + tw / 2, panel.y + 15.5);
}
function drawGlyph(g, kind, cx, cy) {
  g.save();
  g.fillStyle = '#2f3d48'; g.strokeStyle = '#2f3d48'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'turnL' || kind === 'turnR') {
    const s = kind === 'turnL' ? -1 : 1;
    g.beginPath(); g.arc(cx, cy + 4, 7, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    const hx = cx + s * 7 * Math.cos(Math.PI * 0.08), hy = cy + 4 - 7 * Math.sin(Math.PI * 0.08);
    g.beginPath(); g.moveTo(hx + s * 2.5, hy + 1.5); g.lineTo(hx - s * 2.2, hy - 3.4); g.lineTo(hx + s * 4.2, hy - 4.2); g.closePath(); g.fill();
  } else if (kind === 'zoomIn' || kind === 'zoomOut') {
    g.lineWidth = 1.8;
    g.beginPath(); g.arc(cx - 2, cy - 1, 5.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx + 2, cy + 3); g.lineTo(cx + 6, cy + 7); g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx - 5, cy - 1); g.lineTo(cx + 1, cy - 1); g.stroke();
    if (kind === 'zoomIn') { g.beginPath(); g.moveTo(cx - 2, cy - 4); g.lineTo(cx - 2, cy + 2); g.stroke(); }
  } else {
    g.font = `700 13px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind, cx, cy);
  }
  g.restore();
}

const EXT_BOARD = { w: 340, h: 284 };
const HARD = Object.freeze({ boxes: 5, rounds: 1, dirs: 4 });
const DIRS = [
  { id: 0, key: 'left', label: 'Left', glyph: '◀' },
  { id: 1, key: 'right', label: 'Right', glyph: '▶' },
  { id: 2, key: 'fwd', label: 'Forward', glyph: '▲' },
  { id: 3, key: 'back', label: 'Back', glyph: '▼' },
];
const PANEL_L = { x: 6, y: 8, w: 158, h: 220 };
const PANEL_R = { x: 176, y: 8, w: 158, h: 220 };
const CY = PANEL_L.y + PANEL_L.h * 0.48;
const CAM = { dist: 456, fov: 250, minDepth: 80 };
const BTN = { y: 238, h: 38, w: 75, gap: 8, x0: 8 };
const btnRect = (i) => ({ x: BTN.x0 + i * (BTN.w + BTN.gap), y: BTN.y, w: BTN.w, h: BTN.h });
const GEN = Object.freeze({ LAT_MIN: 46, LAT_FLAT: 8, ZOOM_MIN: 0.18, ZOOM_FLAT: 0.03, VERT_MIN: 36, VERT_FLAT: 11 });
const VALID = Object.freeze({ cov: 0.26, dCov: 0.12, minPx: 13, attempts: 600 });

function camAt(yaw, pitch, eye, cx, cy) {
  const { f, r, u } = makeCamera({ yaw, pitch, dist: CAM.dist });
  const project = (p) => {
    const q = sub3(p, eye);
    const depth = dot3(q, f), s = CAM.fov / Math.max(CAM.minDepth, depth);
    return { x: cx + dot3(q, r) * s, y: cy - dot3(q, u) * s, depth };
  };
  return { f, r, u, eye, project };
}
function dispUnit(yaw, pitch, dir) {
  const { f, r } = makeCamera({ yaw, pitch, dist: CAM.dist });
  const fFlat = unit3({ x: f.x, y: 0, z: f.z });
  if (dir === 0) return { x: -r.x, y: -r.y, z: -r.z };
  if (dir === 1) return { x: r.x, y: r.y, z: r.z };
  if (dir === 2) return { x: fFlat.x, y: fFlat.y, z: fFlat.z };
  return { x: -fFlat.x, y: -fFlat.y, z: -fFlat.z };
}
export function eyesOf(rd) {
  const base = makeCamera({ yaw: rd.yaw, pitch: rd.pitch, dist: rd.dist ?? CAM.dist });
  const u = dispUnit(rd.yaw, rd.pitch, rd.answer);
  const d = { x: u.x * rd.t, y: u.y * rd.t, z: u.z * rd.t };
  return {
    before: { x: base.cam.x - d.x / 2, y: base.cam.y - d.y / 2, z: base.cam.z - d.z / 2 },
    after: { x: base.cam.x + d.x / 2, y: base.cam.y + d.y / 2, z: base.cam.z + d.z / 2 },
  };
}
function boxScreenBounds(boxes, cam) {
  return boxes.map((o) => {
    const pts = [];
    const a = rad(o.yawDeg), ca = Math.cos(a), sa = Math.sin(a);
    for (const lx of [-o.w / 2, o.w / 2]) for (const ly of [0, o.h]) for (const lz of [-o.d / 2, o.d / 2])
      pts.push(cam.project({ x: o.x + lx * ca + lz * sa, y: ly, z: o.z - lx * sa + lz * ca }));
    return {
      x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
      depth: pts.reduce((s, p) => s + p.depth, 0) / 8,
    };
  });
}
const insidePanel = (b, panel, m = 4) =>
  b.x0 >= panel.x + m && b.x1 <= panel.x + panel.w - m && b.y0 >= panel.y + m && b.y1 <= panel.y + panel.h - m;
const minProjPx = (bs) => Math.min(...bs.map((b) => Math.min(b.x1 - b.x0, b.y1 - b.y0)));
function signature(rd) {
  const { before, after } = eyesOf(rd);
  const cb = camAt(rd.yaw, rd.pitch, before, 0, 0), ca = camAt(rd.yaw, rd.pitch, after, 0, 0);
  const centroid = (cam) => {
    let sx = 0, sy = 0, ss = 0;
    for (const o of rd.boxes) {
      const p = cam.project({ x: o.x, y: o.h / 2, z: o.z });
      sx += p.x; sy += p.y; ss += CAM.fov / Math.max(CAM.minDepth, p.depth);
    }
    const n = rd.boxes.length;
    return { x: sx / n, y: sy / n, s: ss / n };
  };
  const B = centroid(cb), A = centroid(ca);
  return { lat: A.x - B.x, vert: A.y - B.y, zoom: A.s / B.s - 1 };
}
function signatureOk(answer, sig) {
  if (answer < 2) {
    return Math.abs(sig.lat) >= GEN.LAT_MIN && Math.abs(sig.zoom) <= GEN.ZOOM_FLAT && Math.abs(sig.vert) <= GEN.VERT_FLAT
      && (answer === 0 ? sig.lat > 0 : sig.lat < 0);
  }
  return Math.abs(sig.zoom) >= GEN.ZOOM_MIN && Math.abs(sig.vert) >= GEN.VERT_MIN && Math.abs(sig.lat) <= GEN.LAT_FLAT
    && (answer === 2 ? (sig.zoom > 0 && sig.vert > 0) : (sig.zoom < 0 && sig.vert < 0));
}
function coveredFrac(bs) {
  return bs.map((a, i) => {
    const A = (a.x1 - a.x0) * (a.y1 - a.y0);
    let cov = 0;
    for (let j = 0; j < bs.length; j++) {
      if (j === i) continue;
      const b = bs[j];
      if (b.depth >= a.depth) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0 && oy > 0) cov += ox * oy;
    }
    return Math.min(1, cov / A);
  });
}
function extRoundOk(rd) {
  const { before, after } = eyesOf(rd);
  const bB = boxScreenBounds(rd.boxes, camAt(rd.yaw, rd.pitch, before, PANEL_L.x + PANEL_L.w / 2, CY));
  const bA = boxScreenBounds(rd.boxes, camAt(rd.yaw, rd.pitch, after, PANEL_R.x + PANEL_R.w / 2, CY));
  if (!bB.every((b) => insidePanel(b, PANEL_L)) || !bA.every((b) => insidePanel(b, PANEL_R))) return false;
  if (minProjPx(bB) < VALID.minPx || minProjPx(bA) < VALID.minPx) return false;
  const covB = coveredFrac(bB), covA = coveredFrac(bA);
  if (Math.max(...covB, ...covA) > VALID.cov) return false;
  if (Math.max(...covB.map((c, i) => Math.abs(c - covA[i]))) > VALID.dCov) return false;
  return signatureOk(rd.answer, signature(rd));
}

const COLORS_ALL = [...COLORS, '#49aeb5', '#d276a4'];
const UPRIGHT = ['cyl', 'cone', 'taper', 'octa'], UPRIGHT_SPLIT = splitIds('g01_camera_motion_pick_shape', UPRIGHT, 2);
function makeBoxesExt(rng, n, spread, split) {
  const ups = UPRIGHT.filter((k) => UPRIGHT_SPLIT(k) === split), up = ups.length ? ups : UPRIGHT;
  const cols = rng.shuffle(COLORS.slice());
  const boxes = [];
  for (let i = 0; i < n; i++) {
    let placed = null;
    for (let attempt = 0; attempt < 150 && !placed; attempt++) {
      const cyl = rng.raw() < 0.35, upKind = cyl ? up[rng.int(0, up.length - 1)] : null;
      const w = rng.int(34, 48), d = cyl ? w : rng.int(34, 48), h = rng.int(18, 28);
      const cand = { x: +rng.uniform(-spread.x, spread.x).toFixed(2), z: +rng.uniform(-spread.z, spread.z).toFixed(2), w, d, h,
        yawDeg: cyl ? 0 : +rng.uniform(0, 360).toFixed(1), color: cols[i] };
      if (cyl) cand.shape = upKind;
      if (boxes.every((o) => Math.hypot(o.x - cand.x, o.z - cand.z) >= 42)) placed = cand;
    }
    if (!placed) return null;
    boxes.push(placed);
  }
  const mx = boxes.reduce((a, o) => a + o.x, 0) / n, mz = boxes.reduce((a, o) => a + o.z, 0) / n;
  for (const o of boxes) { o.x = +(o.x - mx).toFixed(2); o.z = +(o.z - mz).toFixed(2); }
  return boxes;
}
function makeRoundExt(rng, answer, split, want) {
  const lateral = answer < 2;
  const n = HARD.boxes, spread = { x: 66, z: 48 };
  for (let attempt = 0; attempt < 60000; attempt++) {
    const yaw = +(rng.uniform(12, 28) * rng.sign()).toFixed(1);
    const pitch = +rng.uniform(40, 46).toFixed(1);
    const t = +(lateral ? rng.uniform(104, 120) : rng.uniform(145, 162)).toFixed(2);
    const boxes = makeBoxesExt(rng, n, spread, split);
    if (!boxes) continue;
    const key = keyOf(answer, boxes);
    if (EVAL_KEYS.has(key) || hash32(`camera_motion_pick|${key}`) % SEM_BUCKETS !== want) continue;
    const rd = { yaw, pitch, t, answer, boxes };
    if (!extRoundOk(rd)) continue;
    const sig = signature(rd);
    return { ...rd, lat: +sig.lat.toFixed(2), vert: +sig.vert.toFixed(2), zoom: +sig.zoom.toFixed(4) };
  }
  return null;
}
function generateExt(rng, split, n) {
  const want = bucketWanted(split, n);
  const answer = rng.int(0, HARD.dirs - 1);
  for (let tries = 0; tries < 40; tries++) {
    const rd = makeRoundExt(rng, answer, split, want);
    if (rd) {
      const layout = { btnTop: rng.raw() < 0.5, swap: rng.raw() < 0.5, order: rng.int(0, 1), tag: rng.int(0, 3) };
      return { task: 'camera_motion_pick', board: EXT_BOARD, ext: 1, rounds: [rd], layout, panel: { panelWidth: EXT_BOARD.w + 20, boardH: 294 } };
    }
  }
  throw new Error('camera_motion_pick: no valid training scene');
}

const MATS_EXT = [...MATS, ...COLORS_ALL.slice(COLORS.length).map((c) => ({ c: cA(c), ks: 0.22, sh: 36, tex: paintTex(c) })),
  ...COLORS_ALL.map((c) => ({ c: cA(c), ks: 0.22, sh: 36 }))];
const matIdx = (o) => Math.max(0, COLORS_ALL.indexOf(o.color)) + (o.shape ? COLORS_ALL.length : 0);
function uprightShape(o, i) {
  const r = o.w / 2 * UNIT, x = o.x * UNIT, z = o.z * UNIT, h = o.h * UNIT;
  if (o.shape === 'cone') return shape.frustum(i, matIdx(o), x, z, 0, h, r * 0.72, r);
  if (o.shape === 'taper') return shape.frustum(i, matIdx(o), x, z, 0, h, r, r * 0.68);
  if (o.shape === 'octa') { const f = shape.frustum(i, matIdx(o), x, z, 0, h, r, r); f.fac = 8; f.fa0 = 0.39; return f; }
  return shape.cyl(i, matIdx(o), x, z, 0, h, r, 0.012);
}
export const panelPhoto = (side, rd, eye) => panelScene(side ? PANEL_R : PANEL_L, rd, eye);
function panelScene(panel, rd, eye) {
  const pc = camAt(rd.yaw, rd.pitch, eye, 0, 0);
  const cam = camFromProj(pc, { focal: CAM.fov, cx: panel.w / 2, cy: CY - panel.y, W: panel.w, H: panel.h });
  if (rd.boxes.some((o) => o.shape || !COLORS.includes(o.color))) {
    const shapes = rd.boxes.map((o, i) => (o.shape ? uprightShape(o, i) : taskBox(i, matIdx(o), o, 0.03)));
    return makeScene({ cam, shapes, mats: MATS_EXT, light: LIGHT,
      env: studioEnv({ floor: FLOOR, backdrop: '#e6e1d8', r0: 6.2, r1: 10, cx: cam.eye[0], cz: cam.eye[2], light: LIGHT }) });
  }
  const shapes = rd.boxes.map((o, i) => taskBox(i, Math.max(0, COLORS.indexOf(o.color)), o, 0.03));
  return makeScene({ cam, shapes, mats: MATS, light: LIGHT,
    env: studioEnv({ floor: FLOOR, backdrop: '#e6e1d8', r0: 6.2, r1: 10, cx: cam.eye[0], cz: cam.eye[2], light: LIGHT }) });
}

const OBJ_KINDS = ['paint', 'plastic', 'book', 'cushion', 'tin', 'panel', 'slat'];
const DECOR = ['plain', 'rug', 'round_rug', 'painted_lines'];
export async function styleLook(style) {
  const env = await LOOK.envLook(style, { light: LIGHT, wallZ: -3.0, lumRange: [0.16, 0.52], structured: true, named: false, bold: true, wallP: 0.5, wallZRange: [-3.6, -2.3] });
  const kind = LOOK.primaryKind(style, 'g01_camera_motion_pick_obj', OBJ_KINDS);
  const rnd = style.rand;
  const tex = await LOOK.skinTexture(style, kind);
  const ckind = LOOK.pickSplit(style, 'g01_camera_motion_pick_cyl', LOOK.CYL_KINDS);
  const ctex = ckind === 'pouf' ? await LOOK.skinTexture(style, 'cushion') : null;
  const pal = LOOK.huePalette(rnd, COLORS_ALL.length, { sat: [0.5, 0.8], lum: [0.1, 0.3] }) || COLORS_ALL.slice();
  const wood = ['panel', 'slat'].includes(kind) ? tex : null;
  const mats = pal.map((hex) => LOOK.skinMat(kind, { base: S3.linOf(hex), tex: wood ? null : tex, wood, rnd, tintHex: hex }))
    .concat(pal.map((hex) => LOOK.cylMat(ckind, { base: S3.linOf(hex), tex: ctex, rnd })));
  const decor = LOOK.pickSplit(style, 'g01_camera_motion_pick_decor', DECOR);
  let floor = env.floor;
  const others = LOOK.splitList(style, 'g01_camera_motion_pick_decor', DECOR, { minTest: 2 }).filter((k) => k !== 'plain' && k !== decor);
  const decors = decor === 'plain' ? [] : [decor, ...(others.length && rnd() < 0.6 ? [others[Math.floor(rnd() * others.length)]] : [])];
  for (const dk of decors) {
    const objCols = pal.map((h) => S3.linOf(h));
    let col = null, best = -1;
    for (let i = 0; i < 12; i++) {
      const c = S3.scaleTo(S3.hueSatColor(rnd() * 360, 0.25 + 0.3 * rnd()), 0.06 + 0.3 * rnd());
      const dmin = Math.min(...objCols.map((o) => S3.deltaE(o, c)), S3.deltaE(env.face, c));
      if (dmin > best) { best = dmin; col = c; }
    }
    const lines = dk === 'painted_lines';
    const lc = rnd() < 0.5 ? [0.8, 0.78, 0.7] : [0.72, 0.56, 0.08];
    const ftex = lines ? null : await LOOK.skinTexture(style, 'cushion');
    floor = LOOK.decorGround(floor, {
      kind: dk, cx: (rnd() - 0.5) * 1.2, cz: (rnd() - 0.5) * 1.0, rot: rnd() * Math.PI,
      hx: lines ? 3 : 0.6 + 0.9 * rnd(), hz: lines ? 0.8 + 1.6 * rnd() : 0.5 + 0.8 * rnd(),
      col: lines ? lc : col, border: S3.scaleTo(col, Math.min(0.6, S3.lum(col) * (rnd() < 0.5 ? 0.45 : 1.8))), tex: ftex,
      spacing: 0.45 + 0.4 * rnd(), width: 0.05 + 0.05 * rnd(),
    });
  }
  return { ...env, floor, mats, pal, ids: { ...env.ids, objects: kind, cylinders: ckind, palette: pal.join(' '), decor: decors.join('+') || 'plain' } };
}
function panelSceneStyled(panel, rd, eye, look) {
  const sc = panelScene(panel, rd, eye);
  const shapes = sc.shapes.map((s, i) => ({ ...s, m: matIdx(rd.boxes[i]) }));
  return makeScene({ cam: sc.cam, shapes, mats: look.mats, light: look.light, env: LOOK.sceneEnv(look) });
}
function drawPanelExt(g, panel, rd, eye, label, cache, env = null, tag = 0, scenePanel = panel) {
  g.save();
  rr(g, panel.x, panel.y, panel.w, panel.h, 7);
  g.clip();
  const look = env && env.style ? env.assets?.look : null;
  if (look) paintCached(g, cache, JSON.stringify([rd, eye]) + '|style|' + env.style.key, () => panelSceneStyled(scenePanel, rd, eye, look), panel.x, panel.y);
  else paintCached(g, cache, JSON.stringify([rd, eye]), () => panelScene(scenePanel, rd, eye), panel.x, panel.y);
  g.restore();
  rr(g, panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, 7);
  g.strokeStyle = 'rgba(60,72,84,.28)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(30,42,52,.72)';
  const tx = tag & 1 ? panel.x + panel.w - 56 : panel.x + 6, ty = tag & 2 ? panel.y + panel.h - 23 : panel.y + 6;
  rr(g, tx, ty, 50, 17, 4); g.fill();
  g.fillStyle = '#fff'; g.font = `600 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, tx + 25, ty + 9);
}
function layoutOf(m) {
  const L = m.layout;
  if (!L) return { before: PANEL_L, after: PANEL_R, arrow: '→', arrowY: PANEL_L.y + PANEL_L.h / 2, btn: btnRect, tag: 0 };
  const dy = L.btnTop ? 48 : 0, by = L.btnTop ? 8 : BTN.y, slot = (id) => (L.order ? [2, 3, 0, 1][id] : id);
  const at = (p) => ({ ...p, y: p.y + dy });
  return { before: at(L.swap ? PANEL_R : PANEL_L), after: at(L.swap ? PANEL_L : PANEL_R), arrow: L.swap ? '←' : '→', arrowY: PANEL_L.y + dy + PANEL_L.h / 2,
    btn: (i) => ({ x: BTN.x0 + slot(i) * (BTN.w + BTN.gap), y: by, w: BTN.w, h: BTN.h }), tag: L.tag };
}

export function semanticKey(m) {
  const rd = m.rounds[0];
  if (m.ext) return keyOf(rd.answer, rd.boxes);
  const q = (v) => Math.round(v / 16);
  return `camera_motion_pick2|moves ${rd.answer.join(',')}|objects ${rd.boxes.map((o) => `${q(o.x)},${q(o.z)}`).sort().join(' ')}`;
}
function keyOf(answer, boxes) {
  const q = (v) => Math.round(v / 16);
  return `camera_motion_pick|move ${answer}|objects ${boxes.map((o) => `${q(o.x)},${q(o.z)}`).sort().join(' ')}`;
}
const EVAL_KEYS = new Set([
  'camera_motion_pick|move 1|objects -3,3 -4,-2 0,-2 4,-2 4,3',
  'camera_motion_pick|move 2|objects -3,-3 -3,1 1,-2 2,1 4,3',
  'camera_motion_pick|move 1|objects -2,-2 -3,2 1,-3 1,3 3,0',
  'camera_motion_pick|move 1|objects -2,-3 -3,1 1,-2 1,2 4,2',
  'camera_motion_pick|move 2|objects -1,-2 -2,3 -4,-1 2,3 4,-2',
  'camera_motion_pick|move 2|objects -3,-2 -4,2 0,2 2,-2 4,0',
  'camera_motion_pick|move 1|objects -1,-3 -1,1 -4,2 2,-2 3,2',
  'camera_motion_pick|move 1|objects -3,-3 -3,2 0,-1 3,2 4,-1',
  'camera_motion_pick|move 2|objects -2,3 -4,-2 1,-1 2,3 3,-3',
  'camera_motion_pick|move 3|objects -2,3 -4,-1 0,-2 2,3 3,-2',
  'camera_motion_pick|move 1|objects -1,-3 -2,3 -4,1 3,-3 4,2',
  'camera_motion_pick|move 1|objects -3,-2 -3,2 0,0 3,2 4,-2',
]);
const SEM_BUCKETS = 136, BUCKET_IDS = Array.from({ length: SEM_BUCKETS }, (_, i) => String(i));
const BUCKET_SPLIT = splitIds('g01_camera_motion_pick_bucket', BUCKET_IDS, 24);
const BUCKETS = { train: BUCKET_IDS.filter((b) => BUCKET_SPLIT(b) === 'train'), test: BUCKET_IDS.filter((b) => BUCKET_SPLIT(b) === 'test') };
const bucketWanted = (split, n) => { const list = BUCKETS[split] || BUCKETS.train; return Number(list[nthOf(`camera_motion_pick|${split}|bucket`, n, list.length)]); };

export function gate(m) {
  if (!m || m.task !== 'camera_motion_pick' || !Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  const rd = m.rounds[0];
  if (m.ext) return !!rd && Number.isInteger(rd.answer) && rd.answer >= 0 && rd.answer < HARD.dirs && extRoundOk(rd);
  return roundOk(rd);
}

export default {
  meta: {
    name: 'camera_motion_pick', family: 'D', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'pick', photo: '0 (A) | 1 (B)', move: '0 step left | 1 step right | 2 step forward | 3 step back | 4 turn left | 5 turn right | 6 zoom in | 7 zoom out' }],
    promptHuman: 'For photo A and for photo B, click what the camera did after Start: a step, a turn in place, or a zoom.',
  },

  generate(rng, _l, _i, knobs = {}) {
    if (knobs.ext) return generateExt(rng, knobs.ext, knobs.n ?? 1);
    return { task: 'camera_motion_pick', board: BOARD, rounds: [makeRound(rng)] };
  },

  init(m) { return { picks: m && m.ext ? [-1] : [-1, -1] }; },

  applyAction(state, action, m) {
    if (m && m.ext) {
      if (action.op === 'pick' && Number.isInteger(action.dir) && action.dir >= 0 && action.dir < HARD.dirs) {
        state.picks[0] = action.dir;
        return { ok: true, selected: action.dir };
      }
      return { ok: false, reason: 'bad-op' };
    }
    if (action.op === 'pick' && (action.photo === 0 || action.photo === 1) && Number.isInteger(action.move) && action.move >= 0 && action.move < 8) {
      state.picks[action.photo] = action.move;
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, m) {
    const ans = m.ext ? [m.rounds[0].answer] : m.rounds[0].answer;
    const good = ans.map((a, i) => state.picks[i] === a);
    const answered = ans.every((_, i) => state.picks[i] >= 0);
    const success = answered && good.every(Boolean);
    return {
      success,
      partial: good.filter(Boolean).length / ans.length,
      error: success ? 0 : good.filter((x) => !x).length,
      detail: { answered, good: [...good], picks: [...state.picks] },
    };
  },

  oracle(m) {
    if (m.ext) return [{ op: 'pick', dir: m.rounds[0].answer }];
    return m.rounds[0].answer.map((move, photo) => ({ op: 'pick', photo, move }));
  },

  randomPolicy(m, rnd) {
    if (m.ext) return [{ op: 'pick', dir: Math.floor(rnd() * HARD.dirs) }];
    return [0, 1].map((photo) => ({ op: 'pick', photo, move: Math.floor(rnd() * 8) }));
  },

  async mount(env) {
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r, env) {
    if (env?.manifest?.ext) { drawPromptText(g, r, 'Which way did the camera move?', 'Compare the two photos'); return; }
    drawPromptText(g, r, 'From Start, what did the camera do for photo A, and for photo B?', 'A and B each show one change from Start');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state: st } = env;
    if (m.ext) { drawBoardExt.call(this, g, br, env); return; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef2f5'; g.fillRect(0, 0, br.w, br.h);
    const rd = m.rounds[0];
    this._cache3 ??= [{}, {}, {}];
    const cams = [rd.cam, moveCam(rd.cam, rd.moves[0]), moveCam(rd.cam, rd.moves[1])];
    cams.forEach((c, k) => drawPhoto(g, PANELS[k], c, rd, PANEL_TAGS[k], this._cache3[k], env));
    g.fillStyle = '#7a8794'; g.font = `700 9.5px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const G of GROUPS) {
      const a = moveBtn(0, G.ids[0]), b = moveBtn(0, G.ids[G.ids.length - 1]);
      g.fillText(G.name, (a.x + b.x + b.w) / 2, ROW.y[0] - 8);
    }
    for (let row = 0; row < 2; row++) {
      g.fillStyle = '#2f3d48'; g.font = `700 12px ${UI_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`Start → ${PANEL_TAGS[row + 1]}`, ROW.labelX, ROW.y[row] + ROW.h / 2);
      for (const mv of MOVES) {
        const r = moveBtn(row, mv.id), picked = st.picks[row] === mv.id;
        rr(g, r.x, r.y, r.w, r.h, 7);
        g.fillStyle = picked ? '#dfeaf5' : '#ffffff'; g.fill();
        g.strokeStyle = picked ? ACCENT : '#c3ccd3'; g.lineWidth = picked ? 2 : 1.4; g.stroke();
        drawGlyph(g, mv.glyph, r.x + r.w / 2, r.y + 13);
        g.fillStyle = '#2f3d48'; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(mv.label, r.x + r.w / 2, r.y + 29);
      }
    }
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const m = env.manifest;
    if (m.ext) {
      const LY = layoutOf(m);
      for (const d of DIRS) {
        const r = LY.btn(d.id);
        if (evt.x >= r.x && evt.x <= r.x + r.w && evt.y >= r.y && evt.y <= r.y + r.h) return [{ op: 'pick', dir: d.id }];
      }
      return [];
    }
    for (let row = 0; row < 2; row++) for (const mv of MOVES) {
      const r = moveBtn(row, mv.id);
      if (evt.x >= r.x && evt.x <= r.x + r.w && evt.y >= r.y && evt.y <= r.y + r.h) return [{ op: 'pick', photo: row, move: mv.id }];
    }
    return [];
  },

  footerStatus(env) {
    const st = env.state;
    if (env.manifest.ext) return st.picks[0] >= 0 ? '1 selected' : 'Pick a direction';
    const n = st.picks.filter((p) => p >= 0).length;
    return n === 2 ? 'A and B chosen' : n === 1 ? '1 of 2 chosen' : 'Pick a change for A and for B';
  },
};

function drawBoardExt(g, br, env) {
  const { manifest: m, state: st } = env;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = '#eef2f5'; g.fillRect(0, 0, br.w, br.h);
  const ri = 0, rd = m.rounds[0];
  const { before, after } = eyesOf(rd);
  this._cacheL ??= {}; this._cacheR ??= {};
  const LY = layoutOf(m);
  drawPanelExt(g, LY.before, rd, before, 'Before', this._cacheL, env, LY.tag, PANEL_L);
  drawPanelExt(g, LY.after, rd, after, 'After', this._cacheR, env, LY.tag, PANEL_R);
  g.fillStyle = '#67788a'; g.font = `700 16px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(LY.arrow, br.w / 2, LY.arrowY);
  for (const d of DIRS) {
    const r = LY.btn(d.id);
    const picked = st.picks[ri] === d.id;
    rr(g, r.x, r.y, r.w, r.h, 7);
    g.fillStyle = picked ? '#dfeaf5' : '#ffffff'; g.fill();
    g.strokeStyle = picked ? ACCENT : '#c3ccd3'; g.lineWidth = picked ? 2 : 1.4; g.stroke();
    g.fillStyle = '#2f3d48'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 13px ${UI_FONT}`; g.fillText(d.glyph, r.x + r.w / 2, r.y + 13);
    let fs = 12; g.font = `700 ${fs}px ${UI_FONT}`;
    while (g.measureText(d.label).width > r.w - 10 && fs > 8) { fs -= 1; g.font = `700 ${fs}px ${UI_FONT}`; }
    g.fillText(d.label, r.x + r.w / 2, r.y + 28);
  }
  g.restore();
}

export const __test = { basis, camOf, moveCam, changeOf, changeOk, startOk, photoOk, roundOk, makeRound, RULE, MOVES, signature, extRoundOk, occlusion, answerOk, doccOk, photoScene, PPY };
