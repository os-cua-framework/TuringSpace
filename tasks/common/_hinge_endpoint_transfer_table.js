const RAD = Math.PI / 180;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

function camera(view) {
  const ce = Math.cos(view.el * RAD), se = Math.sin(view.el * RAD);
  const C = { x: view.dist * ce * Math.sin(view.az * RAD), y: -view.dist * ce * Math.cos(view.az * RAD), z: view.dist * se };
  const f = norm(sub({ x: 0, y: 0, z: 0 }, C));
  const r = norm(cross(f, { x: 0, y: 0, z: 1 }));
  const u = cross(r, f);
  return { C, f, r, u };
}
function raw(K, u, v) {
  const d = sub({ x: u, y: -v, z: 0 }, K.C), w = dot(d, K.f);
  return { X: dot(d, K.r) / w, Y: -dot(d, K.u) / w, w };
}

export function tableFit(view, reach, area) {
  const K = camera(view);
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 2 * Math.PI, q = raw(K, reach * Math.cos(a), reach * Math.sin(a));
    X0 = Math.min(X0, q.X); X1 = Math.max(X1, q.X); Y0 = Math.min(Y0, q.Y); Y1 = Math.max(Y1, q.Y);
  }
  const k = Math.min(area.w / (X1 - X0), area.h / (Y1 - Y0));
  return { k, ox: area.x + area.w / 2 - (k * (X0 + X1)) / 2, oy: area.y + area.h / 2 - (k * (Y0 + Y1)) / 2 };
}

export function makeTableView(view) {
  const K = camera(view), F = view.fit;
  const P = (u, v) => { const q = raw(K, u, v); return { x: F.ox + F.k * q.X, y: F.oy + F.k * q.Y }; };
  const unproject = (sx, sy) => {
    const X = (sx - F.ox) / F.k, Y = (sy - F.oy) / F.k;
    const d = { x: K.f.x + X * K.r.x - Y * K.u.x, y: K.f.y + X * K.r.y - Y * K.u.y, z: K.f.z + X * K.r.z - Y * K.u.z };
    if (d.z >= -1e-9) return null;
    const t = -K.C.z / d.z;
    return { x: K.C.x + t * d.x, y: -(K.C.y + t * d.y) };
  };
  return { K, P, unproject };
}

const hashTile = (i, j) => { let h = (i * 73856093) ^ (j * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };

export function drawTableFloor(g, V, view, board) {
  const corners = [[0, 0], [board.w, 0], [board.w, board.h], [0, board.h]].map(([x, y]) => V.unproject(x, y));
  if (corners.some((c) => !c)) return;
  const T = view.tile, ou = view.tileOff.u, ov = view.tileOff.v;
  const u0 = Math.min(...corners.map((c) => c.x)), u1 = Math.max(...corners.map((c) => c.x));
  const v0 = Math.min(...corners.map((c) => c.y)), v1 = Math.max(...corners.map((c) => c.y));
  const i0 = Math.floor((u0 - ou) / T) - 1, i1 = Math.ceil((u1 - ou) / T) + 1, j0 = Math.floor((v0 - ov) / T) - 1, j1 = Math.ceil((v1 - ov) / T) + 1;
  g.save();
  g.beginPath(); g.rect(0, 0, board.w, board.h); g.clip();
  g.fillStyle = '#b8b1a5'; g.fillRect(0, 0, board.w, board.h);
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
    const a = ou + i * T, b = ov + j * T, h = hashTile(i, j);
    const q = [V.P(a, b), V.P(a + T, b), V.P(a + T, b + T), V.P(a, b + T)];
    g.beginPath(); q.forEach((p, n) => (n ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    const l = Math.round(226 + (h - 0.5) * 10);
    g.fillStyle = `rgb(${l + 4},${l},${l - 8})`; g.fill();
  }
  g.strokeStyle = 'rgba(120,110,96,.85)'; g.lineWidth = 1.3;
  g.beginPath();
  for (let i = i0; i <= i1; i++) { const a = V.P(ou + i * T, ov + j0 * T), b = V.P(ou + i * T, ov + j1 * T); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
  for (let j = j0; j <= j1; j++) { const a = V.P(ou + i0 * T, ov + j * T), b = V.P(ou + i1 * T, ov + j * T); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
  g.stroke();
  g.restore();
}

function polyPath(g, pts) { g.beginPath(); pts.forEach((p, n) => (n ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
export function tableDisc(V, u, v, r, n = 40) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; out.push(V.P(u + r * Math.cos(a), v + r * Math.sin(a))); }
  return out;
}
export function tableBar(V, a, b, w) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux, h = w / 2;
  const at = (c, t) => V.P(c.x + h * (Math.cos(t) * ux + Math.sin(t) * nx), c.y + h * (Math.cos(t) * uy + Math.sin(t) * ny));
  const out = [];
  for (let i = 0; i <= 12; i++) out.push(at(a, Math.PI / 2 + (i / 12) * Math.PI));
  for (let i = 0; i <= 12; i++) out.push(at(b, -Math.PI / 2 + (i / 12) * Math.PI));
  return out;
}
export function fillStroke(g, pts, fill, stroke, lw = 1.2) {
  polyPath(g, pts);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
