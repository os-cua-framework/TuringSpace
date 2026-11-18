import { drawPromptText } from '../core/panel.js';
import { render, toCanvas, contextScale, ringImage, pickNear, hitShape, camDir, shape } from '../common/_inside_or_behind_tap_rt.js';
import { BOARD, buildScene, cameraFor, KIND, bowlSphere, outerR, cavity, containerShapes, blockShapes, BALL_STYLES, styleLook, isClosed, closedTop, onClosedTop } from '../common/_inside_or_behind_tap_look.js';
import * as K from '../common/_scene_tex_kit.js';

const PANEL_W = 600;
const HARD = Object.freeze({
  cons: [5, 6], total: [11, 12], inside: [3, 4], behind: [3, 4], front: [1, 2], raised: 2,
  hideLo: 0.45, hideHi: 0.72,
  protrude: 0.2,
  protHide: 0.25,
  pairTol: 0.05,
  pairMax: 2,
  sizeLo: 0.8, sizeHi: 1.25,
  inMouth: 0.3,
  visMin: 150,
  clear: 4,
  fullVis: 0.985,
  frontIn: 0.3,
  raisedOver: 0.55,
  raisedRelY: [0.05, 0.8],
  raisedFramed: 0.55,
  gap2d: 2,
  conGap2d: 8,
  edge: 6,
  hit: 7,
  step: 1.5,
});
const LIDDED = Object.freeze({
  tag: 'lidded',
  cons: [6, 7], closed: [1, 2], total: [12, 13],
  lidR: { lidbox: [0.15, 0.27], upbowl: [0.11, 0.18] },
  lidOver: 0.5,
  lidRelY: [0.05, 0.8],
  closedKinds: ['lidbox', 'upbowl'],
});
const D2R = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const u = (rng, a, b) => rng.uniform(a, b);

const BUCKET_COLS = ['#d8412f', '#2f6fd6', '#f0b21a', '#2e9e5a', '#ee7b1a', '#17a2a2', '#8a4fc4'];
const BOWL_COLS = [['#3f78b5', '#f2e6c8'], ['#6f9a6a', '#efe2c4'], ['#c0643c', '#f3e3c3'], ['#d4a531', '#4a3b2a'], ['#2f5f73', '#e8d9b5'], ['#9b4a5e', '#f1e1c8']];
const BRIGHT = ['#e23b3b', '#2f67d8', '#f2c21b', '#2e9e5a', '#ee7b1a', '#8a4fc4', '#e04a8a', '#17a2a2'];
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const colDist = (a, b) => { const p = hexRGB(a), q = hexRGB(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

function newContainer(rng, kind, shallow = false) {
  if (kind === 'lidbox') return { ...newContainer(rng, 'box', false), kind };
  if (kind === 'upbowl') {
    const Rr = u(rng, 0.44, 0.56), Rf = Rr * u(rng, 0.46, 0.52), [col, band] = rng.pick(BOWL_COLS);
    return { kind, H: u(rng, 0.84, 0.94) * Math.sqrt(Rr * Rr - Rf * Rf), Rr, Rf, col, band };
  }
  if (kind === 'bucket') { const r1 = u(rng, 0.38, 0.52); return { kind, H: shallow ? u(rng, 0.3, 0.4) : u(rng, 0.46, 0.66), r0: r1 / u(rng, 1.12, 1.24), r1, col: rng.pick(BUCKET_COLS) }; }
  if (kind === 'basket') { const r1 = u(rng, 0.42, 0.56); return { kind, H: shallow ? u(rng, 0.26, 0.34) : u(rng, 0.42, 0.56), r0: r1 / u(rng, 1.04, 1.16), r1, tone: rng.int(0, 2) }; }
  if (kind === 'box') return { kind, H: shallow ? u(rng, 0.28, 0.36) : u(rng, 0.42, 0.6), hx: u(rng, 0.34, 0.5), hz: u(rng, 0.3, 0.44), yaw: u(rng, 0, 90), tone: rng.int(0, 2) };
  const Rr = u(rng, 0.44, 0.56), Rf = Rr * u(rng, 0.36, 0.44), [col, band] = rng.pick(BOWL_COLS);
  return { kind, H: (shallow ? u(rng, 0.7, 0.78) : u(rng, 0.84, 0.94)) * Math.sqrt(Rr * Rr - Rf * Rf), Rr, Rf, col, band };
}
function conPoints(c) {
  const pts = [], n = 36;
  if (c.kind === 'box' || c.kind === 'lidbox') {
    const cs = Math.cos(c.yaw * D2R), sn = Math.sin(c.yaw * D2R);
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, c.H]) {
      const l0 = a * c.hx, l2 = b * c.hz; pts.push([c.x + l0 * cs + l2 * sn, y, c.z - l0 * sn + l2 * cs]);
    }
    return pts;
  }
  const rings = [];
  if (c.kind === 'bowl') { const { ysph, Ro } = bowlSphere(c); for (const f of [0, 0.25, 0.5, 0.75, 1]) { const y = c.H * f; rings.push([y, Math.sqrt(Math.max(0, Ro * Ro - (y - ysph) ** 2))]); } }
  else if (c.kind === 'upbowl') { const { ysph, Ro } = bowlSphere(c), yu = c.H - ysph; for (const f of [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1]) { const y = c.H * f; rings.push([y, Math.sqrt(Math.max(0, Ro * Ro - (y - yu) ** 2))]); } }
  else { const K = KIND[c.kind], k = (c.r1 - c.r0) / c.H; rings.push([0, c.r0], [c.H - K.lipH, c.r1 + K.lip - k * K.lipH], [c.H + 0.004, c.r1 + K.lip]); }
  for (const [y, rho] of rings) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([c.x + rho * Math.cos(a), y, c.z + rho * Math.sin(a)]); }
  return pts;
}
function conBox(cam, c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of conPoints(c)) { const q = cam.project(p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return [x0, y0, x1, y1];
}
const boxGap = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
function disk(cam, b) { const p = cam.project(b.x, b.y, b.z); return { x: p.x, y: p.y, r: cam.f * b.r / p.z * 1.04 }; }

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
function clearOut(c, x, z, r, y = r) {
  if (c.kind === 'upbowl') {
    const { ysph, Ro } = bowlSphere(c), yu = c.H - ysph, rho = Math.hypot(x - c.x, z - c.z);
    const rAt = (yy) => Math.sqrt(Math.max(0, Ro * Ro - (yy - yu) ** 2));
    if (y >= 0 && y <= c.H && rho < rAt(y)) return -1 - r;
    let d;
    if (y > c.H) d = rho <= c.Rf ? y - c.H : Math.min(Math.hypot(rho - c.Rf, y - c.H), Math.abs(Math.hypot(rho, y - yu) - Ro));
    else { const a = Math.atan2(y - yu, rho), aT = Math.atan2(c.H - yu, c.Rf), aB = Math.atan2(-yu, c.Rr);
      d = a >= aB && a <= aT ? Math.hypot(rho, y - yu) - Ro : Math.min(Math.hypot(rho - c.Rf, y - c.H), Math.hypot(rho - c.Rr, y)); }
    return d - r;
  }
  if (c.kind === 'box' || c.kind === 'lidbox') {
    const cs = Math.cos(c.yaw * D2R), sn = Math.sin(c.yaw * D2R), px = x - c.x, pz = z - c.z;
    const l0 = Math.abs(px * cs - pz * sn) - c.hx, l2 = Math.abs(px * sn + pz * cs) - c.hz, ly = y - c.H;
    const out = Math.hypot(Math.max(0, l0), Math.max(0, l2), Math.max(0, ly));
    return (out > 0 ? out : Math.max(l0, l2, ly)) - r;
  }
  const rho = Math.hypot(x - c.x, z - c.z);
  if (c.kind === 'bowl') {
    const { ysph, Ro } = bowlSphere(c);
    const aF = Math.atan2(-ysph, c.Rf), aR = Math.atan2(c.H - ysph, c.Rr), a = Math.atan2(y - ysph, rho);
    let d = a >= aF && a <= aR ? Math.hypot(rho, y - ysph) - Ro : Math.min(Math.hypot(rho - c.Rf, y), Math.hypot(rho - c.Rr, y - c.H));
    if (y < c.H && rho < Math.sqrt(Math.max(0, Ro * Ro - (y - ysph) ** 2))) d = -1;
    return d - r;
  }
  const K = KIND[c.kind], k = (c.r1 - c.r0) / c.H, yl = c.H - K.lipH, rl = c.r0 + k * yl, ro = c.r1 + K.lip;
  const prof = [[c.r0, 0], [rl, yl], [ro - k * K.lipH, yl], [ro + k * 0.004, c.H + 0.004], [c.r1 - K.w, c.H + 0.004]];
  let d = Infinity;
  for (let i = 0; i + 1 < prof.length; i++) d = Math.min(d, segDist(rho, y, prof[i][0], prof[i][1], prof[i + 1][0], prof[i + 1][1]));
  if (y >= 0 && y <= c.H && rho < c.r0 + k * y) d = -1;
  return d - r;
}
function clearIn(c, x, z, r) {
  const cv = cavity(c), px = x - c.x, pz = z - c.z, yc = cv.floor + r;
  if (cv.box) {
    const cs = Math.cos(cv.yaw * D2R), sn = Math.sin(cv.yaw * D2R);
    return Math.min(cv.hx - Math.abs(px * cs - pz * sn), cv.hz - Math.abs(px * sn + pz * cs)) - r;
  }
  if (cv.sph) return cv.Ri - Math.hypot(Math.hypot(px, pz), yc - cv.ysph) - r;
  const k = (cv.r1 - cv.r0) / cv.H;
  return (cv.r0 + k * yc - Math.hypot(px, pz)) / Math.sqrt(1 + k * k) - r;
}
function holderOf(rd, b) {
  for (let i = 0; i < rd.cons.length; i++) {
    const c = rd.cons[i], cv = cavity(c);
    if (!cv) continue;
    if (Math.abs(b.y - b.r - cv.floor) < 2e-3 && clearIn(c, b.x, b.z, b.r) >= 0.005) return i;
  }
  return -1;
}

function blockLocal(p, x, z) {
  const cs = Math.cos(p.yaw * D2R), sn = Math.sin(p.yaw * D2R), px = x - p.x, pz = z - p.z;
  return [px * cs - pz * sn, px * sn + pz * cs];
}
function blockWorld(p, l0, l2) {
  const cs = Math.cos(p.yaw * D2R), sn = Math.sin(p.yaw * D2R);
  return [p.x + l0 * cs + l2 * sn, p.z - l0 * sn + l2 * cs];
}
function ballBlockGap(b, p) {
  const [l0, l2] = blockLocal(p, b.x, b.z);
  return Math.hypot(Math.max(0, Math.abs(l0) - p.hx), Math.max(0, b.y - p.h, -b.y), Math.max(0, Math.abs(l2) - p.hz)) - b.r;
}
function blockConGap(p, c) {
  let g = Infinity;
  for (const y of [0, p.h / 2, p.h]) for (let i = 0; i <= 4; i++) {
    const t = -1 + i / 2;
    for (const [l0, l2] of [[t * p.hx, -p.hz], [t * p.hx, p.hz], [-p.hx, t * p.hz], [p.hx, t * p.hz]]) {
      const [x, z] = blockWorld(p, l0, l2); g = Math.min(g, clearOut(c, x, z, 0, y));
    }
  }
  return g;
}
function blockBox(cam, p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, p.h]) {
    const [x, z] = blockWorld(p, a * p.hx, b * p.hz), q = cam.project(x, y, z);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return [x0, y0, x1, y1];
}

function ballStats(sc, id, hostId, step = HARD.step, keepPts = false) {
  const b = sc.byId.get(id)[0], cam = sc.cam, e = cam.eye;
  const p = cam.project(b.cx, b.cy, b.cz), rad = cam.f * b.r / p.z * 1.1 + 2;
  const host = hostId >= 0 ? sc.byId.get(hostId) : [];
  const ix0 = Math.floor((p.x - rad) / step), ix1 = Math.ceil((p.x + rad) / step), iy0 = Math.floor((p.y - rad) / step), iy1 = Math.ceil((p.y + rad) / step);
  const cols = ix1 - ix0 + 1, rows = iy1 - iy0 + 1, grid = new Uint8Array(cols * rows);
  let area = 0, vis = 0, over = 0, overVis = 0, byHost = 0, byOther = 0, off = 0, sx = 0, sy = 0;
  let vx0 = Infinity, vy0 = Infinity, vx1 = -Infinity, vy1 = -Infinity;
  const pts = keepPts ? [] : null;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (ix0 + c) * step, y = (iy0 + r) * step, d = camDir(cam, x, y);
    const tb = hitShape(b, e[0], e[1], e[2], d[0], d[1], d[2], Infinity);
    if (tb === Infinity) continue;
    area++;
    if (x < HARD.edge || y < HARD.edge || x > cam.W - HARD.edge || y > cam.H - HARD.edge) off++;
    let th = Infinity;
    for (const s of host) th = Math.min(th, hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], th));
    if (th < Infinity) over++;
    if (th < tb) { byHost++; continue; }
    let hid = false;
    for (const s of sc.shapes) { if (s.id === id || s.id === hostId) continue; if (hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], tb) < tb) { hid = true; break; } }
    if (hid) { byOther++; continue; }
    vis++; sx += x; sy += y; grid[r * cols + c] = 1;
    if (th < Infinity) overVis++;
    vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x); vy0 = Math.min(vy0, y); vy1 = Math.max(vy1, y);
    if (pts) pts.push(x, y);
  }
  const dist = new Float32Array(cols * rows);
  for (let i = 0; i < dist.length; i++) dist[i] = grid[i] ? 1e9 : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!dist[i]) continue;
    dist[i] = c === 0 || r === 0 ? 1 : Math.min(dist[i], dist[i - 1] + 1, dist[i - cols] + 1, dist[i - cols - 1] + 1, c + 1 < cols ? dist[i - cols + 1] + 1 : 1);
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c; if (!dist[i]) continue;
    dist[i] = c === cols - 1 || r === rows - 1 ? 1 : Math.min(dist[i], dist[i + 1] + 1, dist[i + cols] + 1, dist[i + cols + 1] + 1, c > 0 ? dist[i + cols - 1] + 1 : 1);
  }
  const cx = vis ? sx / vis : 0, cy = vis ? sy / vis : 0;
  let pt = null, best = -Infinity;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!grid[i]) continue;
    const x = (ix0 + c) * step, y = (iy0 + r) * step, score = dist[i] * 100 - Math.hypot(x - cx, y - cy);
    if (score > best) { best = score; pt = [x, y, (dist[i] - 0.5) * step]; }
  }
  return { area, vis, frac: area ? vis / area : 0, hideHost: area ? byHost / area : 0, hideOther: area ? byOther / area : 0,
    over: area ? over / area : 0, overVis: vis ? overVis / vis : 0, off, visPx: vis * step * step, cx, cy, pt, pts,
    vbox: vis ? [vx0 - step / 2, vy0 - step / 2, vx1 + step / 2, vy1 + step / 2] : null, center: [p.x, p.y], rad: cam.f * b.r / p.z, step };
}
function coversCon(sc, id, x, y) {
  const cam = sc.cam, e = cam.eye, d = camDir(cam, x, y);
  for (const s of sc.byId.get(id)) if (hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], Infinity) < Infinity) return true;
  return false;
}
function ptsGap(a, b) {
  let m = Infinity;
  for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) {
    const d = (a[i] - b[j]) ** 2 + (a[i + 1] - b[j + 1]) ** 2; if (d < m) m = d;
  }
  return Math.sqrt(m);
}
function framedShare(sc, id, st, otherId) {
  const cam = sc.cam, e = cam.eye, pts = st.pts, step = st.step || HARD.step;
  const key = (x, y) => `${Math.round(x / step)},${Math.round(y / step)}`;
  const vis = new Set();
  for (let i = 0; i < pts.length; i += 2) vis.add(key(pts[i], pts[i + 1]));
  let ring = 0, hit = 0;
  const firstId = (x, y) => { const d = camDir(cam, x, y); let t = Infinity, who = -1; for (const s of sc.shapes) { const u2 = hitShape(s, e[0], e[1], e[2], d[0], d[1], d[2], t); if (u2 < t) { t = u2; who = s.id; } } return who; };
  for (let i = 0; i < pts.length; i += 2) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = pts[i] + dx * step, y = pts[i + 1] + dy * step;
      if (vis.has(key(x, y))) continue;
      const x2 = pts[i] + dx * (step + 2), y2 = pts[i + 1] + dy * (step + 2);
      ring++; if (firstId(x2, y2) === otherId) hit++;
    }
  }
  return ring ? hit / ring : 0;
}
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function miniScene(cam, rd, conIdx, balls, blocks = []) {
  const shapes = [];
  for (const i of conIdx) shapes.push(...containerShapes(i, 0, rd.cons[i]));
  for (const [id, p] of blocks) shapes.push(...blockShapes(id, 0, p));
  for (const [id, b] of balls) shapes.push(shape.ball(id, 0, b.x, b.y, b.z, b.r, IDENT, b.y - b.r));
  const byId = new Map();
  for (const s of shapes) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  return { cam, shapes, byId };
}

function roundProblem(rd, sc) {
  const N = rd.cons.length, B = rd.balls.length, cam = sc.cam;
  if (rd.hard !== undefined && rd.hard !== LIDDED.tag) return 'tag';
  const isLidded = rd.hard === LIDDED.tag;
  if (!isLidded && rd.cons.some(isClosed)) return 'kinds';
  if (isLidded) {
    const open = rd.cons.filter((c) => !isClosed(c)), nCl = N - open.length;
    if (N < LIDDED.cons[0] || N > LIDDED.cons[1] || B < LIDDED.total[0] || B > LIDDED.total[1] || nCl < LIDDED.closed[0] || nCl > LIDDED.closed[1]) return 'counts';
    if (rd.cons.some((c) => !KIND[c.kind] || (isClosed(c) && !LIDDED.closedKinds.includes(c.kind)))) return 'kinds';
    if (new Set(open.map((c) => c.kind)).size < 3 || open.filter((c) => c.kind === 'bowl').length > open.length - 2) return 'kinds';
  } else {
    if (N < HARD.cons[0] || N > HARD.cons[1] || B < HARD.total[0] || B > HARD.total[1]) return 'counts';
    if (new Set(rd.cons.map((c) => c.kind)).size < 3 || rd.cons.filter((c) => c.kind === 'bowl').length > N - 3) return 'kinds';
  }
  const boxes = rd.cons.map((c) => conBox(cam, c));
  for (let i = 0; i < N; i++) {
    const bx = boxes[i];
    if (bx[0] < HARD.edge || bx[1] < HARD.edge || bx[2] > BOARD.w - HARD.edge || bx[3] > BOARD.h - HARD.edge) return 'con-frame';
    for (let j = i + 1; j < N; j++) {
      if (Math.hypot(rd.cons[i].x - rd.cons[j].x, rd.cons[i].z - rd.cons[j].z) < outerR(rd.cons[i]) + outerR(rd.cons[j]) + 0.3) return 'con-3d';
      if (boxGap(bx, boxes[j]) < HARD.conGap2d) return 'con-2d';
    }
  }
  const roles = { in: [], behind: [], front: [], raised: [], free: [], lid: [] };
  const props = Array.isArray(rd.props) ? rd.props : [];
  for (let j = 0; j < B; j++) {
    const b = rd.balls[j];
    if (!roles[b.role] || !Number.isInteger(b.host) || b.host < -1 || b.host >= N) return 'role';
    roles[b.role].push(j);
    const h = holderOf(rd, b);
    if (b.role !== 'lid' && b.role !== 'behind' && b.host >= 0 && isClosed(rd.cons[b.host])) return 'closed-host';
    if (b.role === 'in') { if (h !== b.host) return 'in-geom'; }
    else if (b.role === 'lid') {
      const c = rd.cons[b.host];
      if (!isLidded || !c || !isClosed(c) || h !== -1 || Math.abs(b.y - b.r - closedTop(c)) > 2e-3 || !onClosedTop(c, b.x, b.z, 0.02)) return 'lid-geom';
      for (let i = 0; i < N; i++) if (i !== b.host && clearOut(rd.cons[i], b.x, b.z, b.r, b.y) < 0.005) return 'touch';
    }
    else if (b.role === 'raised') {
      const p = props[b.on];
      if (!p || h !== -1 || b.host < 0 || Math.abs(b.y - b.r - p.h) > 2e-3) return 'raised-geom';
      const [l0, l2] = blockLocal(p, b.x, b.z);
      if (Math.abs(l0) > p.hx - 0.02 || Math.abs(l2) > p.hz - 0.02) return 'raised-geom';
      for (const c of rd.cons) if (clearOut(c, b.x, b.z, b.r, b.y) < 0.005) return 'touch';
    } else {
      if (h !== -1 || Math.abs(b.y - b.r) > 1e-6) return 'out-geom';
      for (const c of rd.cons) if (clearOut(c, b.x, b.z, b.r) < 0.005) return 'touch';
      if ((b.role === 'free') !== (b.host === -1)) return 'host';
    }
    for (let k = j + 1; k < B; k++) {
      const o = rd.balls[k];
      if (Math.hypot(b.x - o.x, b.y - o.y, b.z - o.z) < b.r + o.r + 0.01) return 'ball-3d';
    }
    props.forEach((p, k) => { if (!(b.role === 'raised' && b.on === k) && ballBlockGap(b, p) < 0.01) b.__bad = true; });
    if (b.__bad) { delete b.__bad; return 'ball-block'; }
  }
  if (props.length !== roles.raised.length || new Set(roles.raised.map((j) => rd.balls[j].on)).size !== props.length) return 'blocks';
  for (let k = 0; k < props.length; k++) {
    const p = props[k], pb = blockBox(cam, p), host = rd.balls[roles.raised.find((j) => rd.balls[j].on === k)].host;
    if (rd.cons.some((c) => blockConGap(p, c) < 0.005)) return 'block-touch';
    if (pb[0] < HARD.edge || pb[1] < HARD.edge || pb[2] > BOARD.w - HARD.edge || pb[3] > BOARD.h - HARD.edge) return 'block-frame';
    for (let i = 0; i < N; i++) if (i !== host && boxGap(pb, boxes[i]) < 2) return 'block-2d';
  }
  const nIn = roles.in.length, nBe = roles.behind.length, nFr = roles.front.length;
  if (nIn < HARD.inside[0] || nIn > HARD.inside[1] || nBe < HARD.behind[0] || nBe > Math.min(HARD.behind[1], HARD.pairMax * (nIn - 1)) || nFr < HARD.front[0] || nFr > HARD.front[1] || roles.raised.length !== HARD.raised) return 'role-counts';
  if (new Set(roles.in.map((j) => rd.balls[j].host)).size !== nIn || nIn >= N) return 'one-per-container';
  if (isLidded) {
    const closedIdx = rd.cons.map((c, i) => (isClosed(c) ? i : -1)).filter((i) => i >= 0);
    if (roles.lid.length !== closedIdx.length || new Set(roles.lid.map((j) => rd.balls[j].host)).size !== closedIdx.length) return 'lid-count';
    if (nIn >= N - closedIdx.length) return 'one-per-container';
  }
  const ans = rd.balls.map((b, j) => (holderOf(rd, b) >= 0 ? j : -1)).filter((j) => j >= 0);
  if (JSON.stringify(ans) !== JSON.stringify(rd.answer)) return 'answer';
  const st = rd.balls.map((b, j) => ballStats(sc, N + j, b.host, HARD.step, true));
  let nProt = 0;
  const sunk = new Array(B).fill(false);
  for (let j = 0; j < B; j++) {
    const b = rd.balls[j], s = st[j];
    if (s.off > 0 || s.visPx < HARD.visMin || !s.pt || s.pt[2] < HARD.clear) return 'visibility';
    if (!Array.isArray(b.pt) || Math.abs(b.pt[0] - s.pt[0]) > 1e-6 || Math.abs(b.pt[1] - s.pt[1]) > 1e-6) return 'pt';
    if (pickNear(sc, b.pt[0], b.pt[1], HARD.hit, (id) => id >= N && id < N + B) !== N + j) return 'pick';
    if (s.hideOther > 0) return 'hidden-by-other';
    const dk = disk(cam, b);
    const others = [];
    for (let i = 0; i < N; i++) if (i !== b.host) others.push([i, boxes[i]]);
    props.forEach((p, k) => { if (!(b.role === 'raised' && b.on === k)) others.push([N + B + k, blockBox(cam, p)]); });
    for (const [oid, bx] of others) {
      if (dk.x + dk.r + 2 < bx[0] || dk.x - dk.r - 2 > bx[2] || dk.y + dk.r + 2 < bx[1] || dk.y - dk.r - 2 > bx[3]) continue;
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        for (const f of [0, 0.5, 1]) if (coversCon(sc, oid, dk.x + (dk.r + 2) * f * Math.cos(t), dk.y + (dk.r + 2) * f * Math.sin(t))) return 'other-con-2d';
      }
    }
    for (let k = 0; k < j; k++) {
      const a = s.vbox, o = st[k].vbox;
      if (boxGap(a, o) < HARD.gap2d + 2 && ptsGap(s.pts, st[k].pts) < HARD.gap2d + HARD.step) return 'balls-touch-2d';
    }
    const e = cam.eye, depth = (o) => Math.hypot(o.x - e[0], o.z - e[2]);
    if (b.role === 'in' || b.role === 'behind') {
      const hid = 1 - s.frac, prot = b.role === 'in' && s.vbox[1] < boxes[b.host][1] - HARD.protrude * 2 * s.rad;
      if (prot) { nProt++; if (hid > HARD.protHide) return 'protrude-hidden'; }
      else if (hid < HARD.hideLo || hid > HARD.hideHi) return 'hide-band';
      sunk[j] = !prot;
      const bx = boxes[b.host];
      if (s.center[0] < bx[0] || s.center[0] > bx[2] || s.center[1] < bx[1] || s.center[1] > bx[3]) return 'center-box';
      if (b.role === 'in' && s.overVis < HARD.inMouth) return 'in-mouth';
      if (b.role === 'behind' && depth(b) <= depth(rd.cons[b.host])) return 'behind-depth';
    } else {
      if (s.frac < HARD.fullVis) return 'full-vis';
      if (b.role === 'front') {
        if (s.over < HARD.frontIn || !coversCon(sc, b.host, s.cx, s.cy)) return 'front-over';
        if (depth(b) >= depth(rd.cons[b.host])) return 'front-depth';
      }
      if (b.role === 'lid') {
        const bx = boxes[b.host], relY = (s.cy - bx[1]) / (bx[3] - bx[1]);
        if (!coversCon(sc, b.host, s.center[0], s.center[1]) || s.over < LIDDED.lidOver || relY < LIDDED.lidRelY[0] || relY > LIDDED.lidRelY[1]) return 'lid-over';
      }
      if (b.role === 'raised') {
        const bx = boxes[b.host], relY = (s.cy - bx[1]) / (bx[3] - bx[1]);
        if (s.over < HARD.raisedOver || s.cx < bx[0] || s.cx > bx[2] || relY < HARD.raisedRelY[0] || relY > HARD.raisedRelY[1]) return 'raised-over';
        if (framedShare(sc, N + j, s, b.host) < HARD.raisedFramed) return 'raised-framed';
        if (depth(b) >= depth(rd.cons[b.host])) return 'raised-depth';
      }
    }
  }
  if (nProt < 1) return 'no-protruding';
  const okPair = (bj, ij) => sunk[ij] && Math.abs(st[bj].frac - st[ij].frac) <= HARD.pairTol &&
    st[bj].rad / st[ij].rad >= HARD.sizeLo && st[bj].rad / st[ij].rad <= HARD.sizeHi;
  const used = new Map();
  const match = (k) => {
    if (k === nBe) return true;
    for (const ij of roles.in) {
      const n = used.get(ij) || 0;
      if (n >= HARD.pairMax || !okPair(roles.behind[k], ij)) continue;
      used.set(ij, n + 1); if (match(k + 1)) return true; used.set(ij, n);
    }
    return false;
  };
  if (!match(0)) return 'pairing';
  return '';
}

function placeContainers(rng, rd, cam) {
  const N = rd.cons.length, nb = N === 4 ? 2 : N === 7 ? 4 : 3;
  const idx = rng.shuffle(rd.cons.map((_, i) => i));
  const rows = [[idx.slice(0, nb), u(rng, -2.45, -2.1)], [idx.slice(nb), u(rng, 0.15, 0.5)]];
  for (const [ids, z0] of rows) {
    const gaps = ids.slice(1).map(() => u(rng, 0.3, 0.8));
    const total = ids.reduce((acc, i) => acc + 2 * outerR(rd.cons[i]), 0) + gaps.reduce((acc, g) => acc + g, 0);
    let x = -total / 2 + u(rng, -0.3, 0.3);
    ids.forEach((i, k) => { const c = rd.cons[i], R = outerR(c); x += R; c.x = x; c.z = z0 + u(rng, -0.2, 0.2); x += R + (gaps[k] || 0); });
  }
  const boxes = rd.cons.map((c) => conBox(cam, c));
  for (let i = 0; i < N; i++) {
    const bx = boxes[i];
    if (bx[0] < HARD.edge + 4 || bx[2] > BOARD.w - HARD.edge - 4 || bx[1] < 30 || bx[3] > BOARD.h - 24) return false;
    for (let j = 0; j < i; j++) {
      if (Math.hypot(rd.cons[i].x - rd.cons[j].x, rd.cons[i].z - rd.cons[j].z) < outerR(rd.cons[i]) + outerR(rd.cons[j]) + 0.3) return false;
      if (boxGap(bx, boxes[j]) < HARD.conGap2d + 4) return false;
    }
  }
  return true;
}
function frameOf(cam, c) {
  const e = cam.eye, fx = c.x - e[0], fz = c.z - e[2], l = Math.hypot(fx, fz);
  return { fx: fx / l, fz: fz / l, sx: -fz / l, sz: fx / l };
}
function trialStats(cam, rd, hostIdx, b) {
  return ballStats(miniScene(cam, rd, [hostIdx], [[99, b]]), 99, hostIdx, 2);
}
const IN_R = { bowl: [0.11, 0.2], basket: [0.13, 0.26], box: [0.14, 0.28], bucket: [0.17, 0.3] };
function maxOffset(c, r) {
  const cv = cavity(c), yc = cv.floor + r;
  if (cv.box) return Math.min(cv.hx, cv.hz) - r - 0.012;
  if (cv.sph) return Math.sqrt(Math.max(0, (cv.Ri - r - 0.012) ** 2 - (yc - cv.ysph) ** 2));
  const k = (cv.r1 - cv.r0) / cv.H;
  return cv.r0 + k * yc - (r + 0.012) * Math.sqrt(1 + k * k);
}
function tryInside(rng, cam, rd, hi) {
  const c = rd.cons[hi], cv = cavity(c), fr = frameOf(cam, c);
  const [rLo, rHi] = IN_R[c.kind];
  for (let a = 0; a < 8; a++) {
    const r = u(rng, rLo, rHi), lim = maxOffset(c, r);
    if (lim < 0.01) continue;
    const target = u(rng, HARD.hideLo + 0.04, HARD.hideHi - 0.04), lat = u(rng, -0.9, 0.9) * lim;
    const at = (f) => { const dep = f * Math.sqrt(Math.max(0, lim * lim - lat * lat)); return { x: c.x - fr.fx * dep + fr.sx * lat, z: c.z - fr.fz * dep + fr.sz * lat, r, y: cv.floor + r }; };
    let lo = -0.95, hiF = 0.95;
    const sLo = trialStats(cam, rd, hi, at(lo)), sHi = trialStats(cam, rd, hi, at(hiF));
    if (1 - sHi.frac < target) continue;
    if (1 - sLo.frac > target) continue;
    for (let it = 0; it < 6; it++) { const mid = (lo + hiF) / 2, st = trialStats(cam, rd, hi, at(mid)); if (1 - st.frac < target) lo = mid; else hiF = mid; }
    const b = at((lo + hiF) / 2);
    if (clearIn(c, b.x, b.z, r) < 0.01) continue;
    const st = trialStats(cam, rd, hi, b), hid = 1 - st.frac;
    if (hid < HARD.hideLo + 0.02 || hid > HARD.hideHi - 0.02) continue;
    if (st.visPx < HARD.visMin + 20) continue;
    if (st.overVis < HARD.inMouth + 0.04) continue;
    const bx = conBox(cam, c);
    if (st.vbox[1] < bx[1] + 1) continue;
    return { ...b, hid, rad: st.rad, vbox: st.vbox, lat, relY: (st.cy - bx[1]) / (bx[3] - bx[1]) };
  }
  return null;
}
function depthRatio(c) { return c.H / (c.kind === 'box' ? Math.min(c.hx, c.hz) * 2 : c.kind === 'bowl' ? c.Rr * 2 : c.r1 * 2); }
function tryProtrude(rng, cam, rd, hi) {
  const c = rd.cons[hi], cv = cavity(c), fr = frameOf(cam, c), bx = conBox(cam, c);
  for (let a = 0; a < 24; a++) {
    const r = u(rng, 0.2, 0.34), lim = maxOffset(c, r);
    if (lim < 0.02) continue;
    const dep = u(rng, -1, -0.3) * lim, lat = u(rng, -0.6, 0.6) * Math.sqrt(Math.max(0, lim * lim - dep * dep));
    const b = { x: c.x - fr.fx * dep + fr.sx * lat, z: c.z - fr.fz * dep + fr.sz * lat, r, y: cv.floor + r };
    if (clearIn(c, b.x, b.z, r) < 0.01) continue;
    const st = trialStats(cam, rd, hi, b), hid = 1 - st.frac;
    if (st.vbox[1] > bx[1] - (HARD.protrude + 0.03) * 2 * st.rad) continue;
    if (hid > HARD.protHide - 0.02 || st.visPx < HARD.visMin + 20 || st.overVis < HARD.inMouth + 0.04) continue;
    return { ...b, hid, rad: st.rad, vbox: st.vbox, lat, prot: true, relY: (st.cy - bx[1]) / (bx[3] - bx[1]) };
  }
  return null;
}
function tryBehind(rng, cam, rd, hi, pair) {
  const c = rd.cons[hi], fr = frameOf(cam, c), R = outerR(c), bx = conBox(cam, c), e = cam.eye;
  const inBox = (st) => st.center[0] >= bx[0] && st.center[0] <= bx[2] && st.center[1] >= bx[1] && st.center[1] <= bx[3];
  for (let a = 0; a < 8; a++) {
    const target = Math.min(HARD.hideHi - 0.03, Math.max(HARD.hideLo + 0.03, pair.hid + u(rng, -0.015, 0.015)));
    const lat = (rng.raw() < 0.5 ? -1 : 1) * u(rng, 0, 0.3) * R;
    const far = (Math.hypot(c.x - e[0], c.z - e[2]) + R) / Math.hypot(pair.x - e[0], pair.z - e[2]);
    const r = Math.min(0.32, Math.max(0.1, pair.r * far * u(rng, 0.92, 1.12)));
    const at = (d) => ({ x: c.x + fr.fx * d + fr.sx * lat, z: c.z + fr.fz * d + fr.sz * lat, y: r, r });
    let d0 = 0, d1 = R + r + 0.6;
    for (let it = 0; it < 20; it++) { const mid = (d0 + d1) / 2, p = at(mid); if (clearOut(c, p.x, p.z, r) < 0.02) d0 = mid; else d1 = mid; }
    const s0 = trialStats(cam, rd, hi, at(d1));
    if (1 - s0.frac < target) continue;
    if (!inBox(s0)) continue;
    let lo = d1, hiD = d1 + 1.4;
    for (let it = 0; it < 8; it++) {
      const mid = (lo + hiD) / 2, st = trialStats(cam, rd, hi, at(mid));
      if (1 - st.frac > target) lo = mid; else hiD = mid;
    }
    const b = at((lo + hiD) / 2), st = trialStats(cam, rd, hi, b), hid = 1 - st.frac;
    if (Math.abs(hid - pair.hid) > HARD.pairTol - 0.025 || hid < HARD.hideLo + 0.01 || hid > HARD.hideHi - 0.01) continue;
    const ratio = st.rad / pair.rad;
    if (ratio < HARD.sizeLo + 0.03 || ratio > HARD.sizeHi - 0.03) continue;
    if (!inBox(st)) continue;
    if (st.visPx < HARD.visMin + 20) continue;
    return { ...b, hid, rad: st.rad, vbox: st.vbox };
  }
  return null;
}
function tryFront(rng, cam, rd, hi) {
  const c = rd.cons[hi], fr = frameOf(cam, c), R = outerR(c);
  for (let a = 0; a < 12; a++) {
    const r = u(rng, 0.22, 0.34), lat = u(rng, -0.16, 0.16) * R, gap = u(rng, 0.005, 0.025);
    const at = (d) => ({ x: c.x - fr.fx * d + fr.sx * lat, z: c.z - fr.fz * d + fr.sz * lat, y: r, r });
    let lo = 0, hiD = R + r + 0.6;
    for (let it = 0; it < 20; it++) { const mid = (lo + hiD) / 2, p = at(mid); if (clearOut(c, p.x, p.z, r) < gap) lo = mid; else hiD = mid; }
    const b = at(hiD), sc = miniScene(cam, rd, [hi], [[99, b]]), st = ballStats(sc, 99, hi, 2);
    if (st.frac < HARD.fullVis + 0.005) continue;
    if (st.over < HARD.frontIn + 0.03) continue;
    if (!coversCon(sc, hi, st.cx, st.cy)) continue;
    return { ...b, vbox: st.vbox };
  }
  return null;
}
function tryRaised(rng, cam, rd, hi, twinRelY) {
  const c = rd.cons[hi], fr = frameOf(cam, c), R = outerR(c), bx = conBox(cam, c);
  for (let a = 0; a < 10; a++) {
    const p = { x: 0, z: 0, hx: u(rng, 0.12, 0.19), hz: u(rng, 0.12, 0.19), h: 0.2, yaw: u(rng, 0, 90), tone: rng.int(0, 2) };
    const r = u(rng, 0.19, 0.31), lat = u(rng, -0.22, 0.22) * R, gap = u(rng, 0.02, 0.07);
    const jit = 0.3 * Math.min(p.hx, p.hz), jx = u(rng, -jit, jit), jz = u(rng, -jit, jit);
    const want = Math.min(HARD.raisedRelY[1] - 0.06, Math.max(HARD.raisedRelY[0] + 0.05, twinRelY + u(rng, -0.04, 0.04)));
    const place = () => {
      let lo = 0, hiD = R + r + 1;
      const clear = (d) => { p.x = c.x - fr.fx * d + fr.sx * lat; p.z = c.z - fr.fz * d + fr.sz * lat; return blockConGap(p, c) >= gap && clearOut(c, p.x + jx, p.z + jz, r, p.h + r) >= 0.02; };
      for (let it = 0; it < 22; it++) { const mid = (lo + hiD) / 2; if (clear(mid)) hiD = mid; else lo = mid; }
      return clear(hiD);
    };
    const statsAt = (h) => {
      p.h = h; if (!place()) return null;
      const b = { x: p.x + jx, z: p.z + jz, r, y: p.h + r };
      const sc = miniScene(cam, rd, [hi], [[99, b]], [[98, p]]), st = ballStats(sc, 99, hi, 2, true);
      return { b, st, sc, relY: (st.cy - bx[1]) / (bx[3] - bx[1]) };
    };
    let lo = 0.12, hiH = 0.8;
    const top = statsAt(hiH);
    if (!top || top.relY > want) continue;
    for (let it = 0; it < 7; it++) { const mid = (lo + hiH) / 2, t = statsAt(mid); if (t && t.relY > want) lo = mid; else hiH = mid; }
    const t = statsAt(hiH);
    if (!t) continue;
    const { b, st, sc, relY } = t;
    if (st.frac < HARD.fullVis + 0.005 || st.over < HARD.raisedOver + 0.04 || st.cx < bx[0] + 1 || st.cx > bx[2] - 1) continue;
    if (relY < HARD.raisedRelY[0] + 0.03 || relY > HARD.raisedRelY[1] - 0.04) continue;
    if (framedShare(sc, 99, st, hi) < HARD.raisedFramed + 0.05) continue;
    const pb = blockBox(cam, p);
    return { ...b, prop: { ...p }, vbox: [Math.min(st.vbox[0], pb[0]), Math.min(st.vbox[1], pb[1]), Math.max(st.vbox[2], pb[2]), Math.max(st.vbox[3], pb[3])] };
  }
  return null;
}
function tryLid(rng, cam, rd, hi) {
  const c = rd.cons[hi], bx = conBox(cam, c), fr = frameOf(cam, c);
  const box = c.kind === 'lidbox', ext = box ? Math.min(c.hx, c.hz) : c.Rf, [r0, r1] = LIDDED.lidR[c.kind];
  for (let a = 0; a < 16; a++) {
    const r = u(rng, r0, r1), t = box ? u(rng, -0.2, 0.85) : u(rng, 0.25, 0.9), lat = u(rng, -0.55, 0.55);
    const b = { x: c.x - (fr.fx * t - fr.sx * lat) * ext, z: c.z - (fr.fz * t - fr.sz * lat) * ext, r, y: closedTop(c) + r };
    if (!onClosedTop(c, b.x, b.z, 0.025)) continue;
    if (rd.cons.some((c2, i) => i !== hi && clearOut(c2, b.x, b.z, r, b.y) < 0.03)) continue;
    const sc = miniScene(cam, rd, [hi], [[99, b]]), st = ballStats(sc, 99, hi, 2);
    if (st.frac < HARD.fullVis + 0.005 || st.visPx < HARD.visMin + 20) continue;
    if (!coversCon(sc, hi, st.center[0], st.center[1]) || st.over < LIDDED.lidOver + 0.04) continue;
    const relY = (st.cy - bx[1]) / (bx[3] - bx[1]);
    if (relY < LIDDED.lidRelY[0] + 0.03 || relY > LIDDED.lidRelY[1] - 0.04) continue;
    return { ...b, vbox: st.vbox };
  }
  return null;
}
function tryFree(rng, cam, rd) {
  const boxes = rd.cons.map((c) => conBox(cam, c)), e = cam.eye;
  for (let a = 0; a < 40; a++) {
    const r = u(rng, 0.14, 0.33), px = u(rng, 30, BOARD.w - 30), py = u(rng, 60, BOARD.h - 30), d = camDir(cam, px, py);
    if (d[1] > -0.05) continue;
    const t = (r - e[1]) / d[1], b = { x: r3(e[0] + t * d[0]), z: r3(e[2] + t * d[2]), y: r, r };
    if (rd.cons.some((c) => clearOut(c, b.x, b.z, r) < 0.25)) continue;
    const dk = disk(cam, b);
    if (boxes.some((bx) => dk.x + dk.r + 4 > bx[0] && dk.x - dk.r - 4 < bx[2] && dk.y + dk.r + 4 > bx[1] && dk.y - dk.r - 4 < bx[3])) continue;
    return { ...b, vbox: [dk.x - dk.r, dk.y - dk.r, dk.x + dk.r, dk.y + dk.r] };
  }
  return null;
}
function ballsApart(cam, list, b) {
  const d = disk(cam, b);
  if (d.x - d.r < HARD.edge + 1 || d.y - d.r < HARD.edge + 1 || d.x + d.r > BOARD.w - HARD.edge - 1 || d.y + d.r > BOARD.h - HARD.edge - 1) return false;
  for (const o of list) {
    if (Math.hypot(b.x - o.x, b.y - o.y, b.z - o.z) < b.r + o.r + 0.03) return false;
    if (boxGap(b.vbox, o.vbox) < HARD.gap2d + 3) return false;
    if (o.prop && ballBlockGap(b, o.prop) < 0.03) return false;
    if (b.prop && ballBlockGap(o, b.prop) < 0.03) return false;
  }
  return true;
}
function dress(rng, rd) {
  const styles = rng.shuffle(BALL_STYLES.slice());
  rd.balls.forEach((b, j) => {
    const host = b.host >= 0 ? rd.cons[b.host] : null, hc = host && host.col ? host.col : null;
    let k = 0;
    while (k < styles.length && hc && ((styles[(j + k) % styles.length] === 'tennis' && colDist(hc, '#d6e64a') < 150) || (styles[(j + k) % styles.length] === 'basket' && colDist(hc, '#e0702a') < 150))) k++;
    b.style = styles[(j + k) % styles.length];
    const pal = rng.shuffle(BRIGHT.filter((c) => !hc || colDist(c, hc) >= 150));
    if (b.style === 'tennis') b.c1 = '#d6e64a';
    else if (b.style === 'basket') b.c1 = '#e0702a';
    else { b.c1 = pal[0]; b.c2 = pal[1]; b.c3 = pal[2]; }
    b.rot = [r3(u(rng, 0, 6.283)), r3(u(rng, -1.5, 1.5)), r3(u(rng, 0, 6.283))];
  });
}
function finalize(rd) {
  for (const c of rd.cons) for (const k of ['x', 'z', 'H', 'r0', 'r1', 'hx', 'hz', 'yaw', 'Rr', 'Rf']) if (c[k] !== undefined) c[k] = r3(c[k]);
  for (const p of rd.props) for (const k of ['x', 'z', 'hx', 'hz', 'h', 'yaw']) p[k] = r3(p[k]);
  for (const b of rd.balls) {
    for (const k of ['x', 'z', 'r']) b[k] = r3(b[k]);
    b.y = b.role === 'in' ? r3(cavity(rd.cons[b.host]).floor + b.r) : b.role === 'raised' ? r3(rd.props[b.on].h + b.r) : b.role === 'lid' ? r3(closedTop(rd.cons[b.host]) + b.r) : b.r;
  }
  return rd;
}

function placeBalls(rng, rd, cam, plan) {
  const all = rd.cons.map((_, i) => i).filter((i) => !isClosed(rd.cons[i])), balls = [];
  const put = (t, role, host) => { if (!t || !ballsApart(cam, balls, t)) return false; balls.push({ ...t, role, host }); return true; };
  const inside = [], used = new Set();
  const lowFirst = rng.shuffle(all.slice()).sort((a, b) => depthRatio(rd.cons[a]) - depthRatio(rd.cons[b]));
  for (const h of lowFirst.slice(0, 2)) {
    if (put(tryProtrude(rng, cam, rd, h), 'in', h)) { used.add(h); break; }
  }
  if (!used.size) { lastProblem = 'pb-protrude'; return null; }
  const deepFirst = (list) => rng.shuffle(list).sort((a, b) => depthRatio(rd.cons[b]) - depthRatio(rd.cons[a]));
  for (const h of deepFirst(all.filter((i) => !used.has(i)))) {
    if (inside.length === plan.nIn - 1) break;
    for (let a = 0; a < 3; a++) if (put(tryInside(rng, cam, rd, h), 'in', h)) { inside.push(balls[balls.length - 1]); break; }
  }
  if (inside.length < plan.nIn - 1) { lastProblem = 'pb-sunk'; return null; }
  for (const h of rd.cons.map((c, i) => (isClosed(c) ? i : -1)).filter((i) => i >= 0)) {
    let ok = false;
    for (let a = 0; a < 3 && !ok; a++) ok = put(tryLid(rng, cam, rd, h), 'lid', h);
    if (!ok) { lastProblem = 'pb-lid'; return null; }
  }
  const hasIn = new Map(balls.filter((b) => b.role === 'in').map((b) => [b.host, b]));
  let nRa = 0;
  const twins = rng.shuffle(balls.filter((b) => b.role === 'in'));
  for (const h of rng.shuffle(all.filter((i) => !hasIn.has(i))).concat(rng.shuffle(all.filter((i) => hasIn.has(i))))) {
    if (nRa === HARD.raised) break;
    for (let ti = 0; ti < twins.length; ti++) {
      const t = twins[(ti + nRa) % twins.length];
      if (put(tryRaised(rng, cam, rd, h, t.relY), 'raised', h)) { nRa++; break; }
    }
  }
  if (nRa < HARD.raised) { lastProblem = 'pb-raised'; return null; }
  const raisedHosts = new Set(balls.filter((b) => b.role === 'raised').map((b) => b.host));
  const order = deepFirst(all.filter((h) => !hasIn.has(h) && !raisedHosts.has(h))).concat(deepFirst(all.filter((h) => hasIn.has(h) && !raisedHosts.has(h))), rng.shuffle([...raisedHosts]));
  if (plan.isLidded) order.push(...rng.shuffle(rd.cons.map((c, i) => (isClosed(c) ? i : -1)).filter((i) => i >= 0)));
  const copies = new Map(inside.map((b) => [b, 0]));
  let nBe = 0;
  for (const h of order) {
    if (nBe === plan.nBe) break;
    const cands = rng.shuffle(inside.filter((b) => copies.get(b) < HARD.pairMax)).sort((a, b) => copies.get(a) - copies.get(b));
    for (const pb of cands) {
      if (put(tryBehind(rng, cam, rd, h, pb), 'behind', h)) { copies.set(pb, copies.get(pb) + 1); nBe++; break; }
    }
  }
  if (nBe < plan.nBe) { lastProblem = 'pb-behind'; return null; }
  let nFr = 0;
  for (const h of rng.shuffle(all.filter((i) => rd.cons[i].kind !== 'bowl'))) {
    if (nFr === plan.nFr) break;
    for (let a = 0; a < 2; a++) if (put(tryFront(rng, cam, rd, h), 'front', h)) { nFr++; break; }
  }
  if (nFr < plan.nFr) { lastProblem = 'pb-front'; return null; }
  for (let k = 0; k < plan.nFree; k++) {
    let ok = false;
    for (let a = 0; a < 12 && !ok; a++) ok = put(tryFree(rng, cam, rd), 'free', -1);
    if (!ok) { lastProblem = 'pb-free'; return null; }
  }
  return balls;
}
function tryRound(rng, plan) {
  const cam0 = { el: r3(u(rng, 30, 35)), az: r3(u(rng, -14, 14)) };
  const sun = { az: r3((rng.raw() < 0.5 ? -1 : 1) * u(rng, 55, 95)), el: r3(u(rng, 36, 50)) };
  const rd = { cam: cam0, sun, floor: { rot: r3(u(rng, -20, 20)), tint: rng.int(0, 2) }, cons: [], balls: [], answer: [] };
  if (plan.isLidded) rd.hard = LIDDED.tag;
  const cam = cameraFor(rd);
  let placed = false;
  for (let a = 0; a < 80 && !placed; a++) {
    const first = plan.kinds.findIndex((k) => k !== 'box' && !KIND[k].closed), low = new Set([first, rng.raw() < 0.35 ? (first + 1) % plan.kinds.length : first]);
    rd.cons = plan.kinds.map((k, i) => newContainer(rng, k, low.has(i)));
    placed = placeContainers(rng, rd, cam);
  }
  if (!placed) return null;
  let balls = null;
  for (let a = 0; a < 3 && !balls; a++) balls = placeBalls(rng, rd, cam, plan);
  if (!balls) return null;
  rd.props = [];
  rd.balls = rng.shuffle(balls).map((b) => {
    const o = { x: b.x, y: b.y, z: b.z, r: b.r, role: b.role, host: b.host };
    if (b.prop) { o.on = rd.props.length; rd.props.push(b.prop); }
    return o;
  });
  dress(rng, rd);
  finalize(rd);
  rd.answer = rd.balls.map((b, j) => (b.role === 'in' ? j : -1)).filter((j) => j >= 0);
  const sc = sceneFor(rd), N = rd.cons.length;
  rd.balls.forEach((b, j) => { const st = ballStats(sc, N + j, b.host); b.pt = st.pt ? [st.pt[0], st.pt[1]] : null; });
  lastProblem = roundProblem(rd, sc);
  if (lastProblem) { sceneCache.delete(rd); return null; }
  return rd;
}
function planLiddedRound(rng) {
  const nIn = rng.int(HARD.inside[0], HARD.inside[1]), nCl = nIn === 4 || rng.raw() < 0.6 ? 1 : 2, nOpen = nIn + 2;
  const kinds = ['bucket', 'basket', 'box', 'bowl'];
  let ks;
  do { ks = Array.from({ length: nOpen }, () => rng.pick(kinds)); } while (new Set(ks).size < 3 || ks.filter((k) => k === 'bowl').length > nOpen - 2);
  const all = rng.shuffle([...ks, ...Array.from({ length: nCl }, () => rng.pick(LIDDED.closedKinds))]);
  const total = rng.int(LIDDED.total[0], LIDDED.total[1]);
  let nBe = Math.min(rng.int(HARD.behind[0], HARD.behind[1]), HARD.pairMax * (nIn - 1)), nFr = rng.int(HARD.front[0], HARD.front[1]);
  while (nIn + nBe + HARD.raised + nFr + nCl > total) { if (nFr > HARD.front[0]) nFr--; else nBe--; }
  return { kinds: all, nIn, nBe, nFr, nLid: nCl, nFree: total - nIn - nBe - HARD.raised - nFr - nCl, isLidded: true };
}
function planRound(rng) {
  const nIn = rng.int(HARD.inside[0], HARD.inside[1]);
  const N = nIn + HARD.raised > HARD.cons[0] ? HARD.cons[1] : rng.int(HARD.cons[0], HARD.cons[1]);
  const kinds = ['bucket', 'basket', 'box', 'bowl'];
  let ks;
  do { ks = Array.from({ length: N }, () => rng.pick(kinds)); } while (new Set(ks).size < 3 || ks.filter((k) => k === 'bowl').length > N - 3);
  const total = rng.int(HARD.total[0], HARD.total[1]);
  let nBe = Math.min(rng.int(HARD.behind[0], HARD.behind[1]), HARD.pairMax * (nIn - 1)), nFr = rng.int(HARD.front[0], HARD.front[1]);
  while (nIn + nBe + HARD.raised + nFr > total) { if (nFr > HARD.front[0]) nFr--; else nBe--; }
  return { kinds: ks, nIn, nBe, nFr, nFree: total - nIn - nBe - HARD.raised - nFr };
}
function makeRound(rng, isLidded = false) {
  let plan = isLidded ? planLiddedRound(rng) : planRound(rng);
  for (let a = 0; a < 300; a++) {
    if (isLidded && a && a % 10 === 0) plan = planLiddedRound(rng);
    const rd = tryRound(rng, plan);
    if (rd) return rd;
  }
  throw new Error('inside_or_behind_tap: sampler exhausted');
}

const sceneCache = new WeakMap();
function sceneFor(rd) {
  let sc = sceneCache.get(rd);
  if (!sc) { sc = buildScene(rd); sceneCache.set(rd, sc); }
  return sc;
}
let lastProblem = '';
export const _internals = { lastProblem: () => lastProblem, HARD, LIDDED, planLiddedRound, makeRound, tryProtrude, tryRaised, tryLid, tryInside, clearOut, clearIn, ballStats, miniScene, conBox, disk, holderOf, roundProblem, sceneFor, coversCon, frameOf, planRound, tryRound, placeBalls, placeContainers, newContainer, blockBox };

export function semanticKey(m) {
  const rd = m.round, q = (v) => Math.round(v / 0.64);
  const ck = rd.cons.map((c) => `${c.kind}@${q(c.x)},${q(c.z)}`);
  const bk = rd.balls.map((b) => `${b.role}:${b.host >= 0 ? ck[b.host] : '-'}@${q(b.x)},${q(b.z)}`);
  return `inside_or_behind_tap|${ck.slice().sort().join(';')}|${bk.sort().join(';')}`;
}
const EVAL_KEYS = new Set(["789e208b", "ae5ed4b4", "a73212e1", "390c948a", "505f6008", "36b39d87", "a5824126", "9685705c", "21cdccb1", "42c79a2f", "727edd23", "18b22eee"]);

export function gate(m) {
  if (!m || m.task !== 'inside_or_behind_tap' || m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return false;
  const rd0 = m.round;
  if (!rd0 || !Array.isArray(rd0.cons) || !Array.isArray(rd0.balls) || !Array.isArray(rd0.answer)) return false;
  const rd = JSON.parse(JSON.stringify(rd0));
  if (rd.answer.length < HARD.inside[0] || rd.answer.length > HARD.inside[1]) return false;
  return roundProblem(rd, buildScene(rd)) === '';
}

const isBallId = (m) => (id) => id >= m.round.cons.length && id < m.round.cons.length + m.round.balls.length;

export default {
  meta: {
    name: 'inside_or_behind_tap', family: 'A', 
    panelWidth: PANEL_W, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD, uses3d: true,
    actionSpace: [{ op: 'click', x: `0..${BOARD.w} board px`, y: `0..${BOARD.h} board px`, note: 'click a ball to select it, click it again to unselect; then Verify' }],
    promptHuman: 'Tap every ball inside a container',
  },

  generate(rng, level, index, knobs) {
    if (knobs && knobs.ext) {
      for (let a = 0; a < 400; a++) { const m = { task: 'inside_or_behind_tap', board: { ...BOARD }, round: makeRound(rng) }; if (K.keyAccept(semanticKey(m), knobs.ext, EVAL_KEYS)) return m; }
      throw new Error('inside_or_behind_tap: no training instance');
    }
    return { task: 'inside_or_behind_tap', board: { ...BOARD }, round: makeRound(rng, true) };
  },

  init() { return { sel: [], taps: 0 }; },

  applyAction(s, a, m) {
    if (a?.op !== 'click' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-action' };
    const N = m.round.cons.length, id = pickNear(sceneFor(m.round), a.x, a.y, HARD.hit, isBallId(m));
    if (id < N || id >= N + m.round.balls.length) return { ok: false, reason: 'no-ball' };
    const j = id - N, k = s.sel.indexOf(j);
    if (k >= 0) s.sel.splice(k, 1); else { s.sel.push(j); s.sel.sort((p, q) => p - q); }
    s.taps += 1;
    return { ok: true };
  },

  verify(s, m) {
    const want = new Set(m.round.answer), B = m.round.balls.length;
    let right = 0;
    for (let j = 0; j < B; j++) if (s.sel.includes(j) === want.has(j)) right++;
    const success = right === B;
    return { success, partial: right / B, error: B - right, detail: { selected: s.sel.length, correctBalls: right } };
  },

  oracle(m) { return m.round.answer.map((j) => ({ op: 'click', x: m.round.balls[j].pt[0], y: m.round.balls[j].pt[1] })); },

  randomPolicy(m, rnd) {
    const acts = [];
    for (const b of m.round.balls) if (rnd() < 0.5) acts.push({ op: 'click', x: b.pt[0], y: b.pt[1] });
    return acts;
  },

  async mount(env) {
    env.assets.iob = { key: '', img: null, canvas: null, rings: new Map() };
    if (env.style) env.assets.look = await styleLook(env.style);
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Tap every ball inside a container', 'In a bucket, basket, box or bowl');
  },

  drawBoard(g, br, env) {
    const s = env.state, m = env.manifest, A = env.assets.iob || (env.assets.iob = { key: '', rings: new Map() });
    const look = env.style ? env.assets.look || null : null;
    const q = contextScale(g), key = look ? `${q}|${env.style.key}` : `${q}`;
    if (A.key !== key) { A.img = render(look ? buildScene(m.round, look) : sceneFor(m.round), q); A.canvas = toCanvas(A.img); A.key = key; A.rings = new Map(); }
    g.save(); g.translate(br.x, br.y);
    g.drawImage(A.canvas, 0, 0, BOARD.w, BOARD.h);
    const N = m.round.cons.length;
    for (const j of s.sel) {
      let ring = A.rings.get(j);
      if (!ring) { ring = toCanvas(ringImage(A.img, N + j, [25, 145, 250, 255], [255, 255, 255, 235], 2.2, 1.4)); A.rings.set(j, ring); }
      g.drawImage(ring, 0, 0, BOARD.w, BOARD.h);
    }
    g.restore();
  },

  pointer(e, env) {
    if (env.submitted || e.type !== 'down') return [];
    return [{ op: 'click', x: e.x, y: e.y }];
  },

  footerStatus(env) {
    return `${env.state.sel.length} selected`;
  },
};
