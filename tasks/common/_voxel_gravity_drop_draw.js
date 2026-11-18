import { UI_FONT, rr } from '../core/panel.js';
import { shade3 } from './_proj3d.js';
import { SLAB } from './_voxel_gravity_drop_world.js';

export const CONTAINER_COLOURS = ['#4f7fb8', '#4b9a67', '#349899', '#8894a1', '#8b77b8', '#d6d0c0'];
const WOOD = '#c9a063', RED = '#d8412f', CREAM = '#f4e4cc';
const EDGE = 'rgba(28,36,46,.62)';
const LIGHT = { top: 1.1, z: 0.9, x: 0.72 };

function quad(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}
function line(g, a, b) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
const at = (F, u, v) => ({ x: F[0].x + u * (F[1].x - F[0].x) + v * (F[3].x - F[0].x), y: F[0].y + u * (F[1].y - F[0].y) + v * (F[3].y - F[0].y) });

function faceCorners(kind, x, y, z) {
  if (kind === 'top') return [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
  if (kind === 'x') return [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]];
  return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
}
function outerEdge(a, b, box) {
  let n = 0;
  for (const [k, v] of [[0, box.x0], [0, box.x1], [1, box.y0], [1, box.y1], [2, box.z0], [2, box.z1]]) if (Math.abs(a[k] - v) < 1e-9 && Math.abs(b[k] - v) < 1e-9) n++;
  return n >= 2;
}

function paintContainerFace(g, F, kind, o, cellIdx) {
  const base = CONTAINER_COLOURS[o.col % CONTAINER_COLOURS.length];
  quad(g, F); g.fillStyle = shade3(base, LIGHT[kind]); g.fill();
  g.lineWidth = 1;
  const along = (kind === 'x' && o.axis === 'z') || (kind === 'z' && o.axis === 'x');
  if (kind === 'top') {
    g.strokeStyle = 'rgba(0,0,0,.10)';
    for (const t of [0.25, 0.5, 0.75]) {
      if (o.axis === 'x') line(g, at(F, t, 0.06), at(F, t, 0.94)); else line(g, at(F, 0.06, t), at(F, 0.94, t));
    }
    g.strokeStyle = 'rgba(0,0,0,.28)';
    if (o.axis === 'x' && cellIdx > 0) line(g, at(F, 0, 0), at(F, 0, 1));
    if (o.axis === 'z' && cellIdx > 0) line(g, at(F, 0, 0), at(F, 1, 0));
  } else if (along) {
    for (let k = 1; k < 6; k++) {
      const u = k / 6;
      g.strokeStyle = k % 2 ? 'rgba(0,0,0,.13)' : 'rgba(255,255,255,.16)';
      line(g, at(F, u, 0.08), at(F, u, 0.92));
    }
    if (cellIdx > 0) { g.strokeStyle = 'rgba(0,0,0,.30)'; line(g, at(F, 0, 0.04), at(F, 0, 0.96)); }
    g.strokeStyle = 'rgba(0,0,0,.16)';
    line(g, at(F, 0, 0.08), at(F, 1, 0.08)); line(g, at(F, 0, 0.92), at(F, 1, 0.92));
  } else {
    g.strokeStyle = 'rgba(0,0,0,.30)'; line(g, at(F, 0.5, 0.08), at(F, 0.5, 0.92));
    g.strokeStyle = 'rgba(255,255,255,.35)';
    for (const u of [0.28, 0.38, 0.62, 0.72]) line(g, at(F, u, 0.12), at(F, u, 0.88));
    g.strokeStyle = 'rgba(0,0,0,.18)'; quad(g, [at(F, 0.08, 0.08), at(F, 0.92, 0.08), at(F, 0.92, 0.92), at(F, 0.08, 0.92)]); g.stroke();
  }
}

function paintCrateFace(g, F, kind, fill, trim) {
  quad(g, F); g.fillStyle = shade3(fill, LIGHT[kind]); g.fill();
  const m = 0.14;
  const inner = [at(F, m, m), at(F, 1 - m, m), at(F, 1 - m, 1 - m), at(F, m, 1 - m)];
  g.lineWidth = 1.6;
  g.strokeStyle = trim ? shade3(trim, LIGHT[kind]) : 'rgba(70,45,15,.45)';
  quad(g, inner); g.stroke();
  g.lineWidth = 1.2;
  if (kind === 'top') { line(g, at(F, m, 0.5), at(F, 1 - m, 0.5)); }
  else { line(g, at(F, m, m), at(F, 1 - m, 1 - m)); }
  if (!trim) {
    g.strokeStyle = 'rgba(70,45,15,.22)'; g.lineWidth = 1;
    for (const v of [0.38, 0.62]) line(g, at(F, m, v), at(F, 1 - m, v));
  }
}

export function drawYard(g, rd, O, W, board) {
  const { gx, gz, H } = W;
  const bg = g.createLinearGradient(0, 0, 0, board.h);
  bg.addColorStop(0, '#eaf0f6'); bg.addColorStop(1, '#d9e1ea');
  g.fillStyle = bg; g.fillRect(0, 0, board.w, board.h);
  const P = O.P;
  g.lineJoin = 'round';
  quad(g, [P(gx, 0, 0), P(gx, 0, gz), P(gx, -SLAB, gz), P(gx, -SLAB, 0)]); g.fillStyle = '#8f99a4'; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  quad(g, [P(0, 0, gz), P(gx, 0, gz), P(gx, -SLAB, gz), P(0, -SLAB, gz)]); g.fillStyle = '#a9b2bc'; g.fill(); g.stroke();
  quad(g, [P(0, 0, 0), P(gx, 0, 0), P(gx, 0, gz), P(0, 0, gz)]); g.fillStyle = '#ccd2d8'; g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.3;
  for (let x = 1; x < gx; x++) line(g, P(x, 0, 0), P(x, 0, gz));
  for (let z = 1; z < gz; z++) line(g, P(0, 0, z), P(gx, 0, z));
  g.strokeStyle = '#e2b93b'; g.lineWidth = 1.6;
  quad(g, [P(0.08, 0, 0.08), P(gx - 0.08, 0, 0.08), P(gx - 0.08, 0, gz - 0.08), P(0.08, 0, gz - 0.08)]); g.stroke();
  const cells = [];
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) for (let y = 0; y < H[x][z]; y++) cells.push([x, y, z]);
  cells.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[1] - b[1] || a[0] - b[0]);
  for (const [x, y, z] of cells) {
    const o = W.ownerAt(x, y, z);
    const faces = [];
    if (x === gx - 1 || H[x + 1][z] <= y) faces.push('x');
    if (z === gz - 1 || H[x][z + 1] <= y) faces.push('z');
    if (y === H[x][z] - 1) faces.push('top');
    const cellIdx = o.kind === 'con' ? (o.axis === 'x' ? x - o.box.x0 : z - o.box.z0) : 0;
    for (const kind of faces) {
      const Wc = faceCorners(kind, x, y, z), F = Wc.map(([a, b, c]) => P(a, b, c));
      g.save();
      if (o.kind === 'con') paintContainerFace(g, F, kind, o, cellIdx);
      else if (o.kind === 'red') paintCrateFace(g, F, kind, RED, CREAM);
      else paintCrateFace(g, F, kind, WOOD, null);
      g.restore();
      g.strokeStyle = EDGE; g.lineWidth = 1.1;
      for (let e = 0; e < 4; e++) if (outerEdge(Wc[e], Wc[(e + 1) % 4], o.box)) line(g, F[e], F[(e + 1) % 4]);
    }
  }
}

export function drawPushStrip(g, rd, O, L) {
  g.save();
  const cardH = 64 + rd.pushes.length * 40 - 14;
  rr(g, L.x, L.y, L.w, cardH, 8);
  g.fillStyle = 'rgba(255,255,255,.94)'; g.fill();
  g.strokeStyle = '#cfd8e1'; g.lineWidth = 1; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#51606c'; g.font = `700 10.5px ${UI_FONT}`;
  g.fillText('Moves', L.x + L.w / 2, L.y + 15);
  const cx = L.x + L.w / 2, cy = L.y + 33;
  g.fillStyle = RED; rr(g, cx - 7, cy - 6, 14, 12, 2); g.fill();
  g.strokeStyle = CREAM; g.lineWidth = 1.4; rr(g, cx - 5, cy - 4, 10, 8, 1); g.stroke();
  const ex = O.step('+x'), ez = O.step('+z');
  const k = 0.62;
  rd.pushes.forEach((d, i) => {
    const ty = L.y + 64 + i * 40, tx = L.x + L.w / 2 + 8, bx = L.x + 11;
    g.beginPath(); g.arc(bx, ty, 8.5, 0, Math.PI * 2); g.fillStyle = '#51606c'; g.fill();
    g.fillStyle = '#ffffff'; g.font = `700 11px ${UI_FONT}`; g.fillText(String(i + 1), bx, ty + 0.5);
    const c0 = { x: tx - (ex.x + ez.x) * k / 2, y: ty - (ex.y + ez.y) * k / 2 };
    const T = [c0, { x: c0.x + ex.x * k, y: c0.y + ex.y * k }, { x: c0.x + (ex.x + ez.x) * k, y: c0.y + (ex.y + ez.y) * k }, { x: c0.x + ez.x * k, y: c0.y + ez.y * k }];
    quad(g, T); g.fillStyle = '#dfe4e9'; g.fill(); g.strokeStyle = '#aab4be'; g.lineWidth = 1; g.stroke();
    const v = O.step(d), a = { x: tx - v.x * k * 0.42, y: ty - v.y * k * 0.42 }, b = { x: tx + v.x * k * 0.42, y: ty + v.y * k * 0.42 };
    const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    g.strokeStyle = '#c0392b'; g.lineWidth = 3.2; g.lineCap = 'round';
    line(g, a, { x: b.x - ux * 5, y: b.y - uy * 5 });
    g.beginPath(); g.moveTo(b.x + ux * 1.5, b.y + uy * 1.5); g.lineTo(b.x - ux * 7 - uy * 5, b.y - uy * 7 + ux * 5); g.lineTo(b.x - ux * 7 + uy * 5, b.y - uy * 7 - ux * 5); g.closePath();
    g.fillStyle = '#c0392b'; g.fill();
  });
  g.restore();
}

export function drawRevealMarks(g, click) {
  if (!click) return;
  g.save();
  g.beginPath(); g.arc(click.x, click.y, 8, 0, Math.PI * 2);
  g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = '#1991fa'; g.lineWidth = 2.2; g.stroke();
  g.beginPath(); g.arc(click.x, click.y, 2.4, 0, Math.PI * 2); g.fillStyle = '#1991fa'; g.fill();
  g.restore();
}
