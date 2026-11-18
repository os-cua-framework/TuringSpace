import { drawPromptText, ACCENT } from '../core/panel.js';

const BOARD = { w: 340, h: 270 };
const X0 = 26, X1 = 314, Y0 = 22, Y1 = 248, MID = 135, XW = 72;
const XS = [X0, X0 + XW, X0 + 2 * XW, X0 + 3 * XW, X1];
const ROOM_RECTS = [
  { x: XS[0], y: Y0, w: XW, h: MID - Y0 }, { x: XS[1], y: Y0, w: XW, h: MID - Y0 },
  { x: XS[2], y: Y0, w: XW, h: MID - Y0 }, { x: XS[3], y: Y0, w: XW, h: MID - Y0 },
  { x: XS[0], y: MID, w: 2 * XW, h: Y1 - MID }, { x: XS[2], y: MID, w: XW, h: Y1 - MID },
  { x: XS[3], y: MID, w: XW, h: Y1 - MID },
];
const FLOOR = '#f7f5f1';
const WALL = '#3d4552';
const ROBOT_R = 8;

const HARD = { rooms: 7, kMin: 3, kMax: 5, open: [24, 28, 32, 36, 40, 44], blocked: [7, 9, 11] };

function edgeWall(i, vTop) {
  return [
    { orient: 'v', pos: XS[1], a: Y0, b: MID },
    { orient: 'v', pos: XS[2], a: Y0, b: MID },
    { orient: 'v', pos: XS[3], a: Y0, b: MID },
    { orient: 'v', pos: XS[2], a: MID, b: Y1 },
    { orient: 'v', pos: XS[3], a: MID, b: Y1 },
    vTop === 0 ? { orient: 'h', pos: MID, a: XS[0], b: XS[1] } : { orient: 'h', pos: MID, a: XS[1], b: XS[2] },
    { orient: 'h', pos: MID, a: XS[2], b: XS[3] },
    { orient: 'h', pos: MID, a: XS[3], b: XS[4] },
  ][i];
}

function bfs(start, edges, pass) {
  const seen = new Set([start]), q = [start];
  for (let h = 0; h < q.length; h++) for (let i = 0; i < edges.length; i++) {
    if (!pass[i]) continue;
    const [a, b] = edges[i];
    const o = a === q[h] ? b : b === q[h] ? a : -1;
    if (o >= 0 && !seen.has(o)) { seen.add(o); q.push(o); }
  }
  return seen;
}

function roomCenter(id) { const r = ROOM_RECTS[id]; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

function drawRobot(g, x, y) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  g.beginPath(); g.arc(x, y, ROBOT_R, 0, Math.PI * 2); g.fillStyle = '#2f6fd6'; g.fill();
  g.restore();
  g.beginPath(); g.arc(x, y, ROBOT_R - 2, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.arc(x, y - 2.4, 2.4, 0, Math.PI * 2); g.fillStyle = '#e9f1ff'; g.fill();
}

const EVAL_KEYS = new Set(["free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2x,1-4o,2-3o,2-5x,3-6x,4-5o,5-6o|start 5", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2o,1-4x,2-3o,2-5x,3-6o,4-5o,5-6x|start 6", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1x,1-2o,1-4x,2-3x,2-5o,3-6o,4-5o,5-6x|start 2", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2x,1-4o,2-3x,2-5o,3-6o,4-5x,5-6o|start 6", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1x,0-4x,1-2x,2-3o,2-5o,3-6o,4-5x,5-6o|start 6", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1x,0-4o,1-2o,2-3x,2-5o,3-6x,4-5x,5-6o|start 5", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2x,1-4x,2-3x,2-5o,3-6o,4-5o,5-6o|start 2", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2x,1-4o,2-3o,2-5o,3-6o,4-5x,5-6x|start 2", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,0-4o,1-2x,2-3o,2-5o,3-6o,4-5x,5-6o|start 0", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2o,1-4o,2-3x,2-5x,3-6x,4-5x,5-6o|start 2", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,0-4o,1-2x,2-3x,2-5x,3-6o,4-5o,5-6x|start 1", "free_space_region_mark|1,1,2,4;2,1,4,4;4,1,6,4;6,1,7,4;1,4,4,7;4,4,6,7;6,4,7,7|0-1o,1-2x,1-4o,2-3o,2-5x,3-6x,4-5x,5-6x|start 1"]);
const EXT = { minW: 72, minH: 72, minArea: 72 * 113, shared: 46, stub: 10, rooms: [7, 7], doors: 8 };
const r1 = (v) => Math.round(v * 10) / 10;
function splitPlan(rng, n, rect) {
  const rooms = [rect];
  for (let guard = 0; rooms.length < n && guard < 200; guard++) {
    rooms.sort((a, b) => b.w * b.h - a.w * a.h);
    const cand = rooms.filter((r) => (r.w >= 2 * EXT.minW || r.h >= 2 * EXT.minH) && r.w * r.h >= 2 * EXT.minArea);
    if (!cand.length) return null;
    const r = cand[Math.floor(rng.raw() * Math.min(2, cand.length))];
    const canV = r.w >= 2 * EXT.minW, canH = r.h >= 2 * EXT.minH;
    const vert = canV && (!canH || (r.w / r.h > 1.2 ? rng.raw() < 0.8 : rng.raw() < 0.5));
    const span = vert ? r.w : r.h, lo = vert ? EXT.minW : EXT.minH;
    const other = vert ? r.h : r.w, lo2 = Math.max(lo, Math.ceil(EXT.minArea / other));
    if (span - lo2 < lo2) return null;
    const cut = Math.round(rng.uniform(Math.max(lo2, span * 0.3), Math.min(span - lo2, span * 0.7)));
    rooms.splice(rooms.indexOf(r), 1);
    if (vert) rooms.push({ x: r.x, y: r.y, w: cut, h: r.h }, { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h });
    else rooms.push({ x: r.x, y: r.y, w: r.w, h: cut }, { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut });
  }
  return rooms.length === n ? rooms : null;
}
function sharedWall(a, b, min = EXT.shared) {
  const ov = (p0, p1, q0, q1) => [Math.max(p0, q0), Math.min(p1, q1)];
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const [lo, hi] = ov(a.y, a.y + a.h, b.y, b.y + b.h);
    if (hi - lo >= min) return { orient: 'v', pos: a.x + a.w === b.x ? b.x : a.x, a: lo, b: hi };
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const [lo, hi] = ov(a.x, a.x + a.w, b.x, b.x + b.w);
    if (hi - lo >= min) return { orient: 'h', pos: a.y + a.h === b.y ? b.y : a.y, a: lo, b: hi };
  }
  return null;
}
function genExt(rng) {
  for (let att = 0; att < 400; att++) {
    const plan = { x: Math.round(rng.uniform(14, 32)), y: Math.round(rng.uniform(10, 22)) };
    plan.w = Math.round(rng.uniform(308, 326)) - plan.x; plan.h = Math.round(rng.uniform(248, 260)) - plan.y;
    const n = rng.int(EXT.rooms[0], EXT.rooms[1]);
    const court = rng.raw() < 0.35;
    let rooms = splitPlan(rng, n + (court ? 1 : 0), plan);
    if (!rooms) continue;
    let voids = [];
    if (court) {
      const corner = rooms.filter((r) => (r.x === plan.x || r.x + r.w === plan.x + plan.w) && (r.y === plan.y || r.y + r.h === plan.y + plan.h));
      if (!corner.length) continue;
      const v = corner[Math.floor(rng.raw() * corner.length)];
      voids = [v]; rooms = rooms.filter((r) => r !== v);
    }
    rooms = rng.shuffle(rooms).map((r, id) => ({ id, ...r }));
    const edges = [];
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) { const w = sharedWall(rooms[i], rooms[j]); if (w) edges.push({ rooms: [i, j], wall: w }); }
    if (edges.length !== EXT.doors) continue;
    const pass = edges.map(() => rng.raw() < 0.55);
    const start = rng.int(0, rooms.length - 1);
    const reach = bfs(start, edges.map((e) => e.rooms), pass);
    const all = bfs(start, edges.map((e) => e.rooms), edges.map(() => true));
    if (all.size !== rooms.length) continue;
    if (reach.size < HARD.kMin || reach.size > HARD.kMax) continue;
    const doors = [];
    let ok = true;
    for (const [i, e] of edges.entries()) {
      const L = e.wall.b - e.wall.a;
      const opts = pass[i] ? HARD.open.filter((w) => w + 2 * EXT.stub <= L) : HARD.blocked;
      if (!opts.length) { ok = false; break; }
      const w = rng.pick(opts);
      const c = Math.round(rng.uniform(e.wall.a + EXT.stub + w / 2, e.wall.b - EXT.stub - w / 2));
      doors.push({ rooms: e.rooms, orient: e.wall.orient, pos: e.wall.pos, a: e.wall.a, b: e.wall.b, c, w,
        x: e.wall.orient === 'v' ? e.wall.pos : c, y: e.wall.orient === 'v' ? c : e.wall.pos, passable: pass[i] });
    }
    if (!ok) continue;
    const m = { task: 'free_space_region_mark', board: BOARD, ext: 1, plan, voids, rooms, doors, start, robotR: ROBOT_R,
      reachable: [...reach].sort((a, b) => a - b) };
    if (gateExt(m) && !EVAL_KEYS.has(semanticKey(m))) return m;
  }
  return null;
}
function gateExt(m) {
  const n = m.rooms?.length;
  if (!Array.isArray(m.rooms) || n < EXT.rooms[0] || n > EXT.rooms[1] || !Array.isArray(m.doors) || !m.plan) return false;
  if (!m.rooms.every((r, i) => r.id === i && r.w >= EXT.minW && r.h >= EXT.minH && r.w * r.h >= EXT.minArea && r.x >= m.plan.x && r.y >= m.plan.y && r.x + r.w <= m.plan.x + m.plan.w && r.y + r.h <= m.plan.y + m.plan.h)) return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = m.rooms[i], b = m.rooms[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
  }
  const D = 2 * m.robotR;
  if (m.robotR !== ROBOT_R) return false;
  const want = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (sharedWall(m.rooms[i], m.rooms[j])) want.push(`${i}-${j}`);
  const have = m.doors.map((d) => `${Math.min(...d.rooms)}-${Math.max(...d.rooms)}`);
  if (want.length !== have.length || want.length !== EXT.doors || want.some((k) => !have.includes(k))) return false;
  for (const d of m.doors) {
    const w = sharedWall(m.rooms[d.rooms[0]], m.rooms[d.rooms[1]]);
    if (!w || w.orient !== d.orient || w.pos !== d.pos || w.a !== d.a || w.b !== d.b) return false;
    if (!(d.w <= 0.71 * D || d.w >= 1.5 * D)) return false;
    if (!(d.c - d.w / 2 >= d.a + 9 && d.c + d.w / 2 <= d.b - 9)) return false;
  }
  const open = m.doors.map((d) => d.w > D);
  const reach = bfs(m.start, m.doors.map((d) => d.rooms), open);
  const all = bfs(m.start, m.doors.map((d) => d.rooms), m.doors.map(() => true));
  const got = [...reach].sort((a, b) => a - b);
  if (got.length < HARD.kMin || got.length > HARD.kMax || got.join() !== m.reachable.join()) return false;
  return all.size === n && all.size !== reach.size;
}
const nRooms = (m) => (m.ext ? m.rooms.length : HARD.rooms);

export function gate(m) {
  if (m && m.ext && m.task === 'free_space_region_mark') return gateExt(m);
  if (!m || m.task !== 'free_space_region_mark' || !Array.isArray(m.doors) || m.doors.length !== 8) return false;
  const D = 2 * m.robotR;
  if (!m.doors.every((d) => d.w <= 0.71 * D || d.w >= 1.5 * D)) return false;
  const open = m.doors.map((d) => d.w > D);
  const reach = bfs(m.start, m.doors.map((d) => d.rooms), open);
  const want = [...reach].sort((a, b) => a - b);
  if (want.length < HARD.kMin || want.length > HARD.kMax || want.join() !== m.reachable.join()) return false;
  if ('bottleneck' in m) return false;
  return m.doors.every((d) => d.c - d.w / 2 >= d.a + 9 && d.c + d.w / 2 <= d.b - 9);
}

export default {
  meta: {
    name: 'free_space_region_mark', family: 'A', 
    boardH: BOARD.h + 10, headerH: 60, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'room', id: '0..6' }],
    promptHuman: 'Select every room the robot can reach',
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs && _knobs.ext) { const ext = genExt(rng); if (ext) return ext; }
    let cfg = null;
    for (let t = 0; t < 400 && !cfg; t++) {
      const vTop = rng.raw() < 0.5 ? 0 : 1;
      const edges = [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [vTop, 4], [2, 5], [3, 6]];
      const pass = edges.map(() => rng.raw() < 0.55);
      const start = rng.int(0, 6);
      const reach = bfs(start, edges, pass);
      if (reach.size < HARD.kMin || reach.size > HARD.kMax) continue;
      cfg = { vTop, edges, pass, start, reach };
    }
    if (!cfg) {
      const edges = [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [0, 4], [2, 5], [3, 6]];
      const pass = [true, true, false, false, false, false, false, false];
      cfg = { vTop: 0, edges, pass, start: 0, reach: bfs(0, edges, pass) };
    }
    const doors = cfg.edges.map((e, i) => {
      const w = cfg.pass[i] ? rng.pick(HARD.open) : rng.pick(HARD.blocked);
      const wall = edgeWall(i, cfg.vTop);
      const stub = wall.orient === 'v' ? 22 : 12;
      const c = Math.round(rng.uniform(wall.a + stub + w / 2, wall.b - stub - w / 2));
      return {
        rooms: e, orient: wall.orient, pos: wall.pos, a: wall.a, b: wall.b, c, w,
        x: wall.orient === 'v' ? wall.pos : c, y: wall.orient === 'v' ? c : wall.pos,
        passable: cfg.pass[i],
      };
    });
    return {
      task: 'free_space_region_mark', board: BOARD,
      rooms: ROOM_RECTS.map((r, id) => ({ id, ...r })),
      doors, start: cfg.start, robotR: ROBOT_R,
      reachable: [...cfg.reach].sort((a, b) => a - b),
    };
  },

  init(manifest) {
    const sel = new Array(nRooms(manifest)).fill(false);
    sel[manifest.start] = true;
    return { sel };
  },

  applyAction(state, action, _manifest) {
    if (action.op === 'room') {
      const N = _manifest && _manifest.ext ? _manifest.rooms.length : HARD.rooms;
      if (!Number.isInteger(action.id) || action.id < 0 || action.id >= N) return { ok: false, reason: 'bad-room' };
      state.sel[action.id] = !state.sel[action.id];
      return { ok: true };
    }
    return { ok: false, reason: 'bad-op' };
  },

  verify(state, manifest) {
    const truth = new Set(manifest.reachable), N = nRooms(manifest);
    let correct = 0;
    for (let i = 0; i < N; i++) if (!!state.sel[i] === truth.has(i)) correct++;
    return {
      success: correct === N,
      partial: correct / N,
      error: N - correct,
      detail: { roomsCorrect: correct, roomsTotal: N },
    };
  },

  oracle(manifest) {
    return manifest.reachable.filter((id) => id !== manifest.start).map((id) => ({ op: 'room', id }));
  },

  randomPolicy(m, rnd) {
    const acts = [];
    for (let id = 0; id < nRooms(m); id++) if (id !== m.start && rnd() < 0.5) acts.push({ op: 'room', id });
    return acts;
  },

  async mount(env) {
    if (!env || !env.style || !env.manifest?.ext) return;
    const L = await import('../common/_free_space_region_mark_look.js');
    env.assets.planLook = await L.buildPlanLook(L.choosePlanLook(env.style, env.manifest));
    env.assets.planPaint = L;
  },

  drawPrompt(g, r) {
    drawPromptText(g, r, 'Select every room the robot can reach');
  },

  drawBoard(g, br, env) {
    const { manifest: m, state } = env;
    if (m.ext) { drawBoardExt(g, br, env); return; }
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = '#eceff2'; g.fillRect(0, 0, br.w, br.h);

    for (const room of m.rooms) {
      g.fillStyle = FLOOR; g.fillRect(room.x, room.y, room.w, room.h);
      if (state.sel[room.id]) {
        g.fillStyle = 'rgba(25,145,250,.16)'; g.fillRect(room.x, room.y, room.w, room.h);
        g.strokeStyle = ACCENT; g.lineWidth = 2;
        g.strokeRect(room.x + 6, room.y + 6, room.w - 12, room.h - 12);
      }
    }

    g.strokeStyle = WALL; g.lineWidth = 6; g.lineCap = 'butt';
    g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    const hDoors = m.doors.filter((d) => d.orient === 'h').sort((p, q) => p.c - q.c);
    const segs = [];
    for (const d of m.doors) if (d.orient === 'v') {
      segs.push({ o: 'v', p: d.pos, a: d.a, b: d.c - d.w / 2 }, { o: 'v', p: d.pos, a: d.c + d.w / 2, b: d.b });
    }
    let cur = X0;
    for (const d of hDoors) { segs.push({ o: 'h', p: MID, a: cur, b: d.c - d.w / 2 }); cur = d.c + d.w / 2; }
    segs.push({ o: 'h', p: MID, a: cur, b: X1 });
    for (const sg of segs) {
      if (sg.b - sg.a < 1) continue;
      g.beginPath();
      if (sg.o === 'v') { g.moveTo(sg.p, sg.a); g.lineTo(sg.p, sg.b); } else { g.moveTo(sg.a, sg.p); g.lineTo(sg.b, sg.p); }
      g.stroke();
    }
    g.fillStyle = WALL;
    for (const d of m.doors) {
      if (d.orient === 'v') { g.fillRect(d.pos - 5, d.c - d.w / 2 - 2, 10, 2); g.fillRect(d.pos - 5, d.c + d.w / 2, 10, 2); }
      else { g.fillRect(d.c - d.w / 2 - 2, d.pos - 5, 2, 10); g.fillRect(d.c + d.w / 2, d.pos - 5, 2, 10); }
    }

    const rc = roomCenter(m.start);
    drawRobot(g, rc.x, rc.y);
    g.restore();
  },

  pointer(evt, env) {
    if (evt.type !== 'down') return [];
    const { rooms } = env.manifest;
    for (const room of rooms) {
      if (evt.x >= room.x && evt.x < room.x + room.w && evt.y >= room.y && evt.y < room.y + room.h) {
        return [{ op: 'room', id: room.id }];
      }
    }
    return [];
  },

  footerStatus(env) {
    const n = env.state.sel.filter(Boolean).length;
    return `${n} room${n === 1 ? '' : 's'} selected`;
  },
};

export function planWalls(m) {
  const segs = [], corners = new Set();
  for (const r of m.rooms) {
    const E = [{ o: 'h', p: r.y, a: r.x, b: r.x + r.w }, { o: 'h', p: r.y + r.h, a: r.x, b: r.x + r.w }, { o: 'v', p: r.x, a: r.y, b: r.y + r.h }, { o: 'v', p: r.x + r.w, a: r.y, b: r.y + r.h }];
    for (const e of E) {
      const gaps = m.doors.filter((d) => d.orient === e.o && d.pos === e.p && d.c > e.a && d.c < e.b).map((d) => [d.c - d.w / 2, d.c + d.w / 2]).sort((u, v) => u[0] - v[0]);
      let cur = e.a;
      for (const [g0, g1] of gaps) { if (g0 - cur > 0.5) segs.push({ ...e, a: cur, b: g0 }); cur = g1; }
      if (e.b - cur > 0.5) segs.push({ ...e, a: cur, b: e.b });
    }
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) corners.add(`${x},${y}`);
  }
  return { segs, corners: [...corners].map((k) => k.split(',').map(Number)) };
}
function drawBoardExt(g, br, env) {
  const { manifest: m, state } = env, L = env.style ? env.assets?.planLook : null, P = env.assets?.planPaint;
  g.save(); g.translate(br.x, br.y);
  if (L && P) P.paintGround(g, br, m, L); else { g.fillStyle = '#eceff2'; g.fillRect(0, 0, br.w, br.h); }
  for (const room of m.rooms) {
    if (L && P) P.paintFloor(g, room, L); else { g.fillStyle = FLOOR; g.fillRect(room.x, room.y, room.w, room.h); }
    if (state.sel[room.id]) {
      g.fillStyle = 'rgba(25,145,250,.16)'; g.fillRect(room.x, room.y, room.w, room.h);
      g.strokeStyle = ACCENT; g.lineWidth = 2;
      g.strokeRect(room.x + 6, room.y + 6, room.w - 12, room.h - 12);
    }
  }
  const W = planWalls(m), wallCol = L ? L.wall : WALL;
  g.strokeStyle = wallCol; g.lineWidth = 6; g.lineCap = 'butt';
  for (const sg of W.segs) {
    g.beginPath();
    if (sg.o === 'v') { g.moveTo(sg.p, sg.a); g.lineTo(sg.p, sg.b); } else { g.moveTo(sg.a, sg.p); g.lineTo(sg.b, sg.p); }
    g.stroke();
  }
  g.fillStyle = wallCol;
  for (const [x, y] of W.corners) g.fillRect(x - 3, y - 3, 6, 6);
  for (const d of m.doors) {
    if (d.orient === 'v') { g.fillRect(d.pos - 5, d.c - d.w / 2 - 2, 10, 2); g.fillRect(d.pos - 5, d.c + d.w / 2, 10, 2); }
    else { g.fillRect(d.c - d.w / 2 - 2, d.pos - 5, 2, 10); g.fillRect(d.c + d.w / 2, d.pos - 5, 2, 10); }
  }
  const rc = m.rooms[m.start];
  if (L && P) P.drawRobot(g, rc.x + rc.w / 2, rc.y + rc.h / 2, ROBOT_R, L); else drawRobot(g, rc.x + rc.w / 2, rc.y + rc.h / 2);
  g.restore();
}

export function semanticKey(m) {
  const qx = BOARD.w / 8, qy = BOARD.h / 8;
  const cell = (r) => [Math.round(r.x / qx), Math.round(r.y / qy), Math.round((r.x + r.w) / qx), Math.round((r.y + r.h) / qy)];
  const order = m.rooms.map((r) => [cell(r), r.id]).sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0] || a[0][2] - b[0][2]);
  const pos = new Map(order.map(([, id], i) => [id, i]));
  const doors = m.doors.map((d) => { const [a, b] = d.rooms.map((id) => pos.get(id)).sort((p, q) => p - q); return `${a}-${b}${d.w > 2 * m.robotR ? 'o' : 'x'}`; }).sort().join(',');
  return `free_space_region_mark|${order.map(([c]) => c.join(',')).join(';')}|${doors}|start ${pos.get(m.start)}`;
}
