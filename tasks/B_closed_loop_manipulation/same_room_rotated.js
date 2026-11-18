import { drawPromptText, UI_FONT, ACCENT } from '../core/panel.js';

const BOARD = { w: 380, h: 282 };
const TILE = 90, GAP = 6, GX = (BOARD.w - (3 * TILE + 2 * GAP)) / 2, GY = 0;
const N = 4;
const HARD = Object.freeze({ corrMin: 2, corrMax: 4 });
const SLOTS = [0, 1, 2, 3, 5, 6, 7, 8];

const C = N / 2;
function tp(p, t) {
  let u = p[0] - C, v = p[1] - C;
  if (t.mir) u = -u;
  for (let k = 0; k < t.rot; k++) [u, v] = [-v, u];
  return [u + C, v + C];
}
function tv(d, t) { let [u, v] = d; if (t.mir) u = -u; for (let k = 0; k < t.rot; k++) [u, v] = [-v, u]; return [u, v]; }
function transform(room, t) {
  return {
    items: room.items.map((it) => {
      const a = tp([it.x0, it.y0], t), b = tp([it.x1, it.y1], t);
      return { kind: it.kind, x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), dir: tv(it.dir, t) };
    }),
    door: { h: tp(room.door.h, t), e: tp(room.door.e, t) },
    win: { a: tp(room.win.a, t), b: tp(room.win.b, t) },
  };
}
const fx = (v) => (Math.round(v * 2) / 2 + 0).toString();
const pt = (p) => `${fx(p[0])},${fx(p[1])}`;
const seg = (a, b) => [pt(a), pt(b)].sort().join('-');
export function key(room) {
  const parts = room.items.map((it) => `${it.kind}:${fx(it.x0)},${fx(it.y0)},${fx(it.x1)},${fx(it.y1)}:${fx(it.dir[0])},${fx(it.dir[1])}`);
  parts.push(`door:${pt(room.door.h)}>${pt(room.door.e)}`, `win:${seg(room.win.a, room.win.b)}`);
  return parts.sort().join('|');
}
function wkey(room) {
  const parts = room.items.map((it) => `${it.kind}:${fx(it.x0)},${fx(it.y0)},${fx(it.x1)},${fx(it.y1)}`);
  parts.push(`door:${seg(room.door.h, room.door.e)}`, `win:${seg(room.win.a, room.win.b)}`);
  return parts.sort().join('|');
}
const ALL_T = [0, 1, 2, 3].flatMap((rot) => [{ mir: false, rot }, { mir: true, rot }]);
export function isTurnOf(ref, cand) { return [0, 1, 2, 3].some((rot) => key(transform(ref, { mir: false, rot })) === key(cand)); }

function wallSeg(s, i, len) {
  if (s === 0) return [[i, 0], [i + len, 0]];
  if (s === 1) return [[N, i], [N, i + len]];
  if (s === 2) return [[i + len, N], [i, N]];
  return [[0, i + len], [0, i]];
}
const inwardCell = (s, i) => (s === 0 ? [i, 0] : s === 1 ? [N - 1, i] : s === 2 ? [i, N - 1] : [0, i]);
function cellsOf(it) { const out = []; for (let x = it.x0; x < it.x1; x++) for (let y = it.y0; y < it.y1; y++) out.push(`${x},${y}`); return out; }
function doorSwingCell(door) {
  const mx = (door.h[0] + door.e[0]) / 2, my = (door.h[1] + door.e[1]) / 2;
  const cx = Math.min(N - 0.5, Math.max(0.5, mx)), cy = Math.min(N - 0.5, Math.max(0.5, my));
  return `${Math.floor(cx)},${Math.floor(cy)}`;
}
function makeDoor(rng, s, i) { const [a, b] = wallSeg(s, i, 1); return rng.raw() < 0.5 ? { h: a, e: b, s, i } : { h: b, e: a, s, i }; }
function placeItems(rng, specs, blocked) {
  const items = [], used = new Set(blocked);
  for (const sp of specs) {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) {
      const horiz = rng.raw() < 0.5, w = horiz ? sp.len : 1, h = horiz ? 1 : sp.len;
      const x0 = rng.int(0, N - w), y0 = rng.int(0, N - h);
      const it = { kind: sp.kind, x0, y0, x1: x0 + w, y1: y0 + h, dir: [0, 0] };
      if (cellsOf(it).some((c) => used.has(c))) continue;
      if (sp.kind === 'bed') it.dir = horiz ? [rng.sign(), 0] : [0, rng.sign()];
      if (sp.kind === 'sofa') it.dir = horiz ? [0, rng.sign()] : [rng.sign(), 0];
      cellsOf(it).forEach((c) => used.add(c)); items.push(it); ok = true;
    }
    if (!ok) return null;
  }
  return items;
}
const SPECS = [{ kind: 'bed', len: 2 }, { kind: 'sofa', len: 2 }, { kind: 'table', len: 1 }, { kind: 'plant', len: 1 }];

function makeRef(rng) {
  for (let t = 0; t < 200; t++) {
    const ds = rng.int(0, 3), door = makeDoor(rng, ds, rng.int(0, N - 1));
    const wsd = rng.pick([0, 1, 2, 3].filter((s) => s !== ds)), wi = rng.int(0, N - 2), [wa, wb] = wallSeg(wsd, wi, 2);
    const items = placeItems(rng, SPECS, [doorSwingCell(door)]);
    if (!items) continue;
    const room = { items, door: { h: door.h, e: door.e }, win: { a: wa, b: wb, s: wsd } };
    if (new Set(ALL_T.map((tt) => wkey(transform(room, tt)))).size !== 8) continue;
    return room;
  }
  return null;
}
const winSide = (w) => (w.a[1] === 0 && w.b[1] === 0 ? 0 : w.a[0] === N && w.b[0] === N ? 1 : w.a[1] === N && w.b[1] === N ? 2 : 3);
function doorOverlapsWin(door, win) {
  const ds = door.h[1] === 0 && door.e[1] === 0 ? 0 : door.h[0] === N && door.e[0] === N ? 1 : door.h[1] === N && door.e[1] === N ? 2 : 3;
  if (ds !== winSide(win)) return false;
  const along = (p) => (ds === 0 || ds === 2 ? p[0] : p[1]);
  const d0 = Math.min(along(door.h), along(door.e)), d1 = Math.max(along(door.h), along(door.e));
  const w0 = Math.min(along(win.a), along(win.b)), w1 = Math.max(along(win.a), along(win.b));
  return Math.min(d1, w1) - Math.max(d0, w0) > -0.01;
}
function makeEdit(rng, ref) {
  const refW = new Set(ALL_T.map((tt) => wkey(transform(ref, tt))));
  for (let t = 0; t < 100; t++) {
    const type = rng.pick(['move', 'move', 'door', 'swap']);
    const room = { items: ref.items.map((it) => ({ ...it, dir: it.dir.slice() })), door: { ...ref.door }, win: { ...ref.win } };
    if (type === 'move') {
      const k = rng.int(0, room.items.length - 1), it = room.items[k];
      const others = new Set(room.items.filter((_, j) => j !== k).flatMap(cellsOf)); others.add(doorSwingCell(room.door));
      const w = it.x1 - it.x0, h = it.y1 - it.y0, x0 = rng.int(0, N - w), y0 = rng.int(0, N - h);
      if (Math.abs(x0 - it.x0) + Math.abs(y0 - it.y0) < 1) continue;
      const moved = { ...it, x0, y0, x1: x0 + w, y1: y0 + h };
      if (cellsOf(moved).some((c) => others.has(c))) continue;
      room.items[k] = moved;
    } else if (type === 'door') {
      const d = makeDoor(rng, rng.int(0, 3), rng.int(0, N - 1));
      if (doorOverlapsWin(d, room.win)) continue;
      if (room.items.flatMap(cellsOf).includes(doorSwingCell(d))) continue;
      room.door = { h: d.h, e: d.e };
    } else {
      const a = room.items.find((it) => it.kind === 'table'), b = room.items.find((it) => it.kind === 'plant');
      [a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1] = [b.x0, b.y0, b.x1, b.y1, a.x0, a.y0, a.x1, a.y1];
    }
    if (refW.has(wkey(room))) continue;
    return { room, type };
  }
  return null;
}

function genScene(rng) {
  for (let att = 0; att < 300; att++) {
    const ref = makeRef(rng); if (!ref) continue;
    const nCorr = rng.int(HARD.corrMin, HARD.corrMax), nRest = 8 - nCorr;
    const nMir = rng.int(1, Math.min(4, nRest - 1)), nEd = nRest - nMir;
    const rots = nCorr === 4 ? [0, 1, 2, 3] : rng.shuffle([1, 2, 3]).slice(0, nCorr);
    const cands = rots.map((rot) => ({ room: transform(ref, { mir: false, rot }), why: 'turn', rot }));
    rng.shuffle([0, 1, 2, 3]).slice(0, nMir).forEach((rot) => cands.push({ room: transform(ref, { mir: true, rot }), why: 'mirror', rot }));
    let ok = true;
    for (let k = 0; k < nEd; k++) {
      const e = makeEdit(rng, ref); if (!e) { ok = false; break; }
      const rot = rng.int(0, 3);
      cands.push({ room: transform(e.room, { mir: false, rot }), why: `edit-${e.type}`, rot });
    }
    if (!ok) continue;
    if (new Set(cands.map((c) => key(c.room))).size !== 8) continue;
    const order = rng.shuffle(cands);
    const out = order.map((c, i) => ({ id: i, slot: SLOTS[i], room: c.room, why: c.why, rot: c.rot }));
    return { task: 'same_room_rotated', board: BOARD, ref, cands: out, answer: out.filter((c) => c.why === 'turn').map((c) => c.id) };
  }
  throw new Error('same_room_rotated: no scene');
}

const BENCH = Object.freeze({ tilt: [10, 20], candSize: 68, nEditMin: 2 });
const wallsOf = (it) => [it.y0 === 0 ? 0 : -1, it.x1 === N ? 1 : -1, it.y1 === N ? 2 : -1, it.x0 === 0 ? 3 : -1].filter((s) => s >= 0);
const sideOfSeg = (a, b) => (a[1] === 0 && b[1] === 0 ? 0 : a[0] === N && b[0] === N ? 1 : a[1] === N && b[1] === N ? 2 : 3);
export function wallCode(room) {
  const parts = room.items.map((it) => `${it.kind}:${wallsOf(it).join('')}`);
  parts.push(`door:${sideOfSeg(room.door.h, room.door.e)}`, `win:${sideOfSeg(room.win.a, room.win.b)}`);
  return parts.sort().join('|');
}
const cloneRoom = (r) => ({ items: r.items.map((it) => ({ ...it, dir: it.dir.slice() })), door: { h: r.door.h.slice(), e: r.door.e.slice() }, win: { ...r.win, a: r.win.a.slice(), b: r.win.b.slice() } });
function allowedEdits(ref) {
  const turnK = new Set([0, 1, 2, 3].map((rot) => key(transform(ref, { mir: false, rot }))));
  const mirK = new Set([0, 1, 2, 3].map((rot) => key(transform(ref, { mir: true, rot }))));
  const refW = new Set(ALL_T.map((tt) => wkey(transform(ref, tt))));
  const out = [], seen = new Set();
  const push = (room, type, what) => {
    const k = key(room);
    if (turnK.has(k) || mirK.has(k) || seen.has(k)) return;
    if (type === 'shift' && refW.has(wkey(room))) return;
    seen.add(k); out.push({ room, type, what });
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  ref.items.forEach((it, k) => {
    for (const [dx, dy] of DIRS) {
      const mv = { ...it, dir: it.dir.slice(), x0: it.x0 + dx, x1: it.x1 + dx, y0: it.y0 + dy, y1: it.y1 + dy };
      if (mv.x0 < 0 || mv.y0 < 0 || mv.x1 > N || mv.y1 > N) continue;
      if (wallsOf(mv).join() !== wallsOf(it).join()) continue;
      const room = cloneRoom(ref); room.items[k] = mv;
      const others = new Set(room.items.filter((_, j) => j !== k).flatMap(cellsOf)); others.add(doorSwingCell(room.door));
      if (cellsOf(mv).some((c) => others.has(c))) continue;
      push(room, 'shift', it.kind);
    }
  });
  for (const [dx, dy] of DIRS) {
    const room = cloneRoom(ref), h = [ref.door.h[0] + dx, ref.door.h[1] + dy], e = [ref.door.e[0] + dx, ref.door.e[1] + dy];
    if (sideOfSeg(h, e) !== sideOfSeg(ref.door.h, ref.door.e) || [h, e].some((p) => p[0] < 0 || p[1] < 0 || p[0] > N || p[1] > N)) continue;
    if (!(h[0] === e[0] ? (h[0] === 0 || h[0] === N) : (h[1] === 0 || h[1] === N))) continue;
    room.door = { h, e };
    if (doorOverlapsWin(room.door, room.win) || room.items.flatMap(cellsOf).includes(doorSwingCell(room.door))) continue;
    push(room, 'shift', 'door');
  }
  for (const [dx, dy] of DIRS) {
    const room = cloneRoom(ref), a = [ref.win.a[0] + dx, ref.win.a[1] + dy], b = [ref.win.b[0] + dx, ref.win.b[1] + dy];
    if ([a, b].some((p) => p[0] < 0 || p[1] < 0 || p[0] > N || p[1] > N)) continue;
    if (!(a[0] === b[0] ? (a[0] === 0 || a[0] === N) : (a[1] === 0 || a[1] === N)) || sideOfSeg(a, b) !== sideOfSeg(ref.win.a, ref.win.b)) continue;
    room.win = { ...room.win, a, b };
    if (doorOverlapsWin(room.door, room.win)) continue;
    push(room, 'shift', 'window');
  }
  { const room = cloneRoom(ref); room.door = { h: ref.door.e.slice(), e: ref.door.h.slice() }; push(room, 'detail', 'hinge'); }
  { const room = cloneRoom(ref), bed = room.items.find((it) => it.kind === 'bed'); bed.dir = [-bed.dir[0] || 0, -bed.dir[1] || 0]; push(room, 'detail', 'pillow'); }
  return out;
}
function editOf(ref, room, edits = allowedEdits(ref)) {
  const k = key(room);
  for (const e of edits) for (let rot = 0; rot < 4; rot++) if (key(transform(e.room, { mir: false, rot })) === k) return { ...e, rot };
  return null;
}
function genBenchScene(rng) {
  for (let att = 0; att < 300; att++) {
    const ref = makeRef(rng); if (!ref) continue;
    const edits = allowedEdits(ref), shifts = edits.filter((e) => e.type === 'shift'), details = edits.filter((e) => e.type === 'detail');
    if (!shifts.length || !details.length) continue;
    const nCorr = rng.int(HARD.corrMin, HARD.corrMax), nRest = 8 - nCorr;
    const nMir = rng.int(1, Math.min(4, nRest - BENCH.nEditMin)), nEd = nRest - nMir;
    const rots = rng.shuffle([0, 1, 2, 3]).slice(0, nCorr);
    const cands = rots.map((rot) => ({ room: transform(ref, { mir: false, rot }), why: 'turn', rot }));
    rng.shuffle([0, 1, 2, 3]).slice(0, nMir).forEach((rot) => cands.push({ room: transform(ref, { mir: true, rot }), why: 'mirror', rot }));
    const picked = [rng.pick(shifts), rng.pick(details)];
    const rest = rng.shuffle(edits.filter((e) => !picked.includes(e)));
    while (picked.length < nEd && rest.length) picked.push(rest.pop());
    if (picked.length < nEd) continue;
    for (const e of picked) { const rot = rng.int(0, 3); cands.push({ room: transform(e.room, { mir: false, rot }), why: `edit-${e.type}-${e.what}`, rot }); }
    if (new Set(cands.map((c) => key(c.room))).size !== 8) continue;
    for (const c of cands) c.tilt = Math.round(rng.sign() * rng.uniform(BENCH.tilt[0], BENCH.tilt[1]) * 10) / 10;
    const order = rng.shuffle(cands);
    const out = order.map((c, i) => ({ id: i, slot: SLOTS[i], room: c.room, why: c.why, rot: c.rot, tilt: c.tilt }));
    const m = { task: 'same_room_rotated', board: BOARD, ref, cands: out, answer: out.filter((c) => c.why === 'turn').map((c) => c.id) };
    if (gate(m)) return m;
  }
  throw new Error('same_room_rotated: no scene found');
}

const slotRect = (slot) => ({ x: GX + (slot % 3) * (TILE + GAP), y: GY + Math.floor(slot / 3) * (TILE + GAP), w: TILE, h: TILE });

function drawRoom(g, room, x, y, size) {
  const cs = size / N, P = (p) => [x + p[0] * cs, y + p[1] * cs];
  g.save();
  g.fillStyle = '#f6f1e6'; g.fillRect(x, y, size, size);
  g.strokeStyle = 'rgba(150,130,100,.13)'; g.lineWidth = 1;
  for (let k = 1; k < N; k++) { g.beginPath(); g.moveTo(x + k * cs, y); g.lineTo(x + k * cs, y + size); g.moveTo(x, y + k * cs); g.lineTo(x + size, y + k * cs); g.stroke(); }
  for (const it of room.items) {
    const [ax, ay] = P([it.x0, it.y0]), [bx, by] = P([it.x1, it.y1]);
    const rx = ax + 1.5, ry = ay + 1.5, rw = bx - ax - 3, rh = by - ay - 3, mx = (ax + bx) / 2, my = (ay + by) / 2;
    g.lineWidth = 1.2; g.strokeStyle = '#2b3440';
    if (it.kind === 'bed') {
      g.fillStyle = '#8fb3e0'; g.fillRect(rx, ry, rw, rh); g.strokeRect(rx, ry, rw, rh);
      const [dx, dy] = it.dir, pd = 5;
      g.fillStyle = '#ffffff';
      if (dx) { const px = dx > 0 ? rx + rw - pd - 1.5 : rx + 1.5; g.fillRect(px, ry + 2, pd, rh - 4); g.strokeRect(px, ry + 2, pd, rh - 4); }
      else { const py = dy > 0 ? ry + rh - pd - 1.5 : ry + 1.5; g.fillRect(rx + 2, py, rw - 4, pd); g.strokeRect(rx + 2, py, rw - 4, pd); }
    } else if (it.kind === 'sofa') {
      g.fillStyle = '#c9874e'; g.fillRect(rx, ry, rw, rh); g.strokeRect(rx, ry, rw, rh);
      const [dx, dy] = it.dir, bd = 4.5;
      g.fillStyle = '#8a5428';
      if (dy) g.fillRect(rx, dy > 0 ? ry + rh - bd : ry, rw, bd); else g.fillRect(dx > 0 ? rx + rw - bd : rx, ry, bd, rh);
    } else if (it.kind === 'table') {
      g.fillStyle = '#a8743f'; g.beginPath(); g.arc(mx, my, cs * 0.34, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#d6a66b'; g.beginPath(); g.arc(mx, my, cs * 0.17, 0, 7); g.fill();
    } else {
      g.fillStyle = '#4f9a52';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(mx + Math.cos(k * 1.26) * cs * 0.17, my + Math.sin(k * 1.26) * cs * 0.17, cs * 0.2, cs * 0.12, k * 1.26, 0, 7); g.fill(); g.stroke(); }
      g.fillStyle = '#7a5532'; g.beginPath(); g.arc(mx, my, 2, 0, 7); g.fill();
    }
  }
  g.strokeStyle = '#2f3740'; g.lineWidth = 3.5; g.lineCap = 'square';
  const corners = [[0, 0], [N, 0], [N, N], [0, N]];
  for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4];
    const onThis = (p) => (s === 0 ? p[1] === 0 : s === 1 ? p[0] === N : s === 2 ? p[1] === N : p[0] === 0);
    const dh = room.door.h, de = room.door.e;
    if (onThis(dh) && onThis(de)) {
      const along = (p) => (s === 0 || s === 2 ? p[0] : p[1]);
      const g0 = Math.min(along(dh), along(de)), g1 = Math.max(along(dh), along(de));
      const mk = (t) => (s === 0 ? [t, 0] : s === 1 ? [N, t] : s === 2 ? [t, N] : [0, t]);
      for (const [u0, u1] of [[0, g0], [g1, N]]) if (u1 - u0 > 0) { const [p0, p1] = [P(mk(u0)), P(mk(u1))]; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); }
    } else { g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke(); }
  }
  const [w0, w1] = [P(room.win.a), P(room.win.b)];
  g.lineCap = 'butt'; g.strokeStyle = '#2f3740'; g.lineWidth = 6.5; g.beginPath(); g.moveTo(...w0); g.lineTo(...w1); g.stroke();
  g.strokeStyle = '#5fb4e6'; g.lineWidth = 4; g.beginPath(); g.moveTo(...w0); g.lineTo(...w1); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(...w0); g.lineTo(...w1); g.stroke();
  const H = P(room.door.h), E = P(room.door.e);
  const mid = [(room.door.h[0] + room.door.e[0]) / 2, (room.door.h[1] + room.door.e[1]) / 2];
  const inward = [C - mid[0], C - mid[1]], nlen = Math.hypot(...inward);
  const n = Math.abs(inward[0]) > Math.abs(inward[1]) ? [Math.sign(inward[0]), 0] : [0, Math.sign(inward[1])];
  void nlen;
  const tip = [H[0] + n[0] * cs, H[1] + n[1] * cs];
  g.strokeStyle = '#2f3740'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(...H); g.lineTo(...tip); g.stroke();
  const a0 = Math.atan2(tip[1] - H[1], tip[0] - H[0]), a1 = Math.atan2(E[1] - H[1], E[0] - H[0]);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  g.lineWidth = 1; g.setLineDash([2.5, 2]); g.beginPath(); g.arc(H[0], H[1], cs, a0, a0 + da, da < 0); g.stroke(); g.setLineDash([]);
  g.restore();
}

export default {
  meta: {
    name: 'same_room_rotated', family: 'B', 
    panelWidth: BOARD.w + 20, boardH: BOARD.h + 10, headerH: 56, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'toggle', id: '0..7 (candidate id; tap again to unselect)' }],
    promptHuman: 'Tap every plan that is the middle room, only turned',
  },
  generate(rng, level, index, knobs) { return knobs && knobs.ext ? genScene(rng) : genBenchScene(rng); },
  init() { return { sel: [] }; },
  applyAction(s, a, m) {
    if (a?.op !== 'toggle' || !m.cands.some((c) => c.id === a.id)) return { ok: false, reason: 'bad-action' };
    s.sel = s.sel.includes(a.id) ? s.sel.filter((x) => x !== a.id) : [...s.sel, a.id];
    return { ok: true };
  },
  verify(s, m) {
    const want = new Set(m.answer), got = new Set(s.sel);
    const correct = [...got].filter((x) => want.has(x)).length, falsePos = got.size - correct, missed = want.size - correct;
    const success = falsePos === 0 && missed === 0;
    return { success, partial: correct / Math.max(1, want.size + falsePos), error: falsePos + missed, detail: { correct, falsePos, missed } };
  },
  oracle(m) { return m.answer.map((id) => ({ op: 'toggle', id })); },
  randomPolicy(m, rnd) { return m.cands.filter(() => rnd() < 0.5).map((c) => ({ op: 'toggle', id: c.id })); },
  drawPrompt(g, r) { drawPromptText(g, r, 'Tap every plan that is the middle room, only turned', 'A mirror image, or the room with something moved, does not count'); },
  drawBoard(g, br, env) {
    const { manifest: m, state: s } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eef0f3'; g.fillRect(0, 0, BOARD.w, BOARD.h);
    const pad = 6;
    const ref = slotRect(4);
    g.fillStyle = '#fff4dc'; g.fillRect(ref.x, ref.y, ref.w, ref.h);
    drawRoom(g, m.ref, ref.x + pad, ref.y + pad, TILE - 2 * pad);
    g.strokeStyle = '#e0a020'; g.lineWidth = 3; g.strokeRect(ref.x + 1.5, ref.y + 1.5, ref.w - 3, ref.h - 3);
    for (const c of m.cands) {
      const r = slotRect(c.slot), sel = s.sel.includes(c.id);
      g.fillStyle = '#ffffff'; g.fillRect(r.x, r.y, r.w, r.h);
      if (Number.isFinite(c.tilt)) {
        const S = BENCH.candSize;
        g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate((c.tilt * Math.PI) / 180);
        drawRoom(g, c.room, -S / 2, -S / 2, S);
        g.restore();
      } else drawRoom(g, c.room, r.x + pad, r.y + pad, TILE - 2 * pad);
      g.strokeStyle = sel ? ACCENT : '#c3cad3'; g.lineWidth = sel ? 3 : 1; g.strokeRect(r.x + (sel ? 1.5 : .5), r.y + (sel ? 1.5 : .5), r.w - (sel ? 3 : 1), r.h - (sel ? 3 : 1));
      if (sel) {
        g.fillStyle = ACCENT; g.beginPath(); g.arc(r.x + r.w - 9, r.y + 9, 7.5, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = `800 9px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✓', r.x + r.w - 9, r.y + 9.5);
      }
    }
    g.restore();
  },
  pointer(e, env) {
    if (e.type !== 'down' || env.submitted) return [];
    const c = env.manifest.cands.find((q) => { const r = slotRect(q.slot); return e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h; });
    return c ? [{ op: 'toggle', id: c.id }] : [];
  },
  footerStatus(env) { const n = env.state.sel.length; return n ? `${n} selected` : 'Tap the matching rooms'; },
};

export function gate(m) {
  if (!m || m.task !== 'same_room_rotated' || m.cands.length !== 8) return false;
  if (new Set(ALL_T.map((tt) => wkey(transform(m.ref, tt)))).size !== 8) return false;
  const turns = m.cands.filter((c) => isTurnOf(m.ref, c.room)).map((c) => c.id);
  const refW = new Set(ALL_T.map((tt) => wkey(transform(m.ref, tt))));
  if (m.cands.some((c) => 'tilt' in c)) return gateBench(m, turns);
  const wrongOk = m.cands.filter((c) => !turns.includes(c.id)).every((c) => {
    const mirror = [0, 1, 2, 3].some((rot) => key(transform(m.ref, { mir: true, rot })) === key(c.room));
    return mirror || !refW.has(wkey(c.room));
  });
  const mirrors = m.cands.filter((c) => [0, 1, 2, 3].some((rot) => key(transform(m.ref, { mir: true, rot })) === key(c.room))).length;
  return turns.length >= HARD.corrMin && turns.length <= HARD.corrMax && wrongOk && mirrors >= 1 && 8 - turns.length - mirrors >= 1
    && new Set(m.cands.map((c) => key(c.room))).size === 8
    && turns.length === m.answer.length && turns.every((id) => m.answer.includes(id));
}

function gateBench(m, turns) {
  const ref = m.ref;
  if (!m.cands.every((c) => Number.isFinite(c.tilt) && Math.abs(c.tilt) >= BENCH.tilt[0] - 1e-9 && Math.abs(c.tilt) <= BENCH.tilt[1] + 1e-9)) return false;
  if (turns.length < HARD.corrMin || turns.length > HARD.corrMax) return false;
  if (turns.length !== m.answer.length || !turns.every((id) => m.answer.includes(id))) return false;
  if (new Set(m.cands.map((c) => key(c.room))).size !== 8) return false;
  const mirK = new Set([0, 1, 2, 3].map((rot) => key(transform(ref, { mir: true, rot }))));
  const turnCodes = new Set([0, 1, 2, 3].map((rot) => wallCode(transform(ref, { mir: false, rot }))));
  const edits = allowedEdits(ref);
  let nMir = 0, nShift = 0, nDetail = 0;
  for (const c of m.cands) {
    if (turns.includes(c.id)) continue;
    if (mirK.has(key(c.room))) { nMir++; continue; }
    const e = editOf(ref, c.room, edits);
    if (!e || !turnCodes.has(wallCode(c.room))) return false;
    if (e.type === 'shift') nShift++; else nDetail++;
  }
  return nMir >= 1 && nShift >= 1 && nDetail >= 1 && nShift + nDetail >= BENCH.nEditMin;
}
