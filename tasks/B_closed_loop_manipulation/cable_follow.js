import { drawPromptText, ACCENT, rr } from '../core/panel.js';
import { primaryOf, natural, pat, isoTex, lumOf, shade, mix, rgba, GRIDDY, ANISO, splitList, pickSplit } from '../common/_block_mat.js';

const BOARD_EXT = { w: 340, h: 320 };
const PANEL_EXT = { panelWidth: 360, boardH: 330 };
const TRACKS_EXT = 6, STAGES_EXT = 5;

const BOARD = { w: 400, h: 400 };
const HEADER_H = 58, BOARD_H = 410, PANEL_W = 420;
const TRACKS = 10, ROUNDS = 1;
const TRACK_Y = Array.from({ length: TRACKS }, (_, i) => +(30 + i * (340 / (TRACKS - 1))).toFixed(2));
const X_PLUG = 40;
const X_PLUG_EXIT = 52;
const X_CONN = X_PLUG;
const X_SOCK = 360;
const X_SOCK_IN = 338;
const GRAB_R = 18, SNAP_R = 18;
const WEAVE = { x0: 74, x1: 318 };
const SPAN = { swap: 30, kiss: 30, skip: 42 };
const GAP_MIN = 6;
const KISS_GAP = 6;
const HW = { cross: [13, 18], kiss: [3, 5], skip: [1, 2], litCross: [2, 7], litKiss: 2, litRows: 2, weave: 8, maxDelta: 4 };
const N_PLUGS = 3;
const PLUG_COL = [ACCENT, '#f0891f', '#8b4fc8'];
const PLUG_DARK = ['#1475d0', '#c46a0e', '#683397'];
const PLUG_LIGHT = ['#d6e9fb', '#fde3c6', '#e6d6f6'];
const plugsOf = (r) => r.plugs ?? [r.plug];
const answersOf = (r) => r.answers ?? [r.answer];
const connsOf = (r) => r.conns ?? [r.conn];

const BG = '#f3f1ed';
const CABLE = '#3c434c', CABLE_HI = '#5d6670', CABLE_W = 6;
const KISS_A = (TRACK_Y[1] - TRACK_Y[0] - CABLE_W - KISS_GAP) / 2;

const evTracks = (e) => (e.t === 'skip' ? [e.k, e.k + 1, e.k + 2] : [e.k, e.k + 1]);
function simulate(events) {
  const at = Array.from({ length: TRACKS }, (_, i) => i);
  const cross = new Array(TRACKS).fill(0), kiss = new Array(TRACKS).fill(0);
  const moves = Array.from({ length: TRACKS }, () => []);
  let nCross = 0, nKiss = 0, nSkip = 0;
  const mv = (c, e, from, to, kind, toward = 0) => moves[c].push({ x0: e.x0, x1: e.x1, from, to, kind, toward });
  for (const e of events) {
    const k = e.k;
    if (e.t === 'swap') {
      const a = at[k], b = at[k + 1];
      mv(a, e, k, k + 1, 'bend'); mv(b, e, k + 1, k, 'bend');
      at[k] = b; at[k + 1] = a; cross[a]++; cross[b]++; nCross++;
    } else if (e.t === 'kiss') {
      const a = at[k], b = at[k + 1];
      mv(a, e, k, k, 'kiss', 1); mv(b, e, k + 1, k + 1, 'kiss', -1);
      kiss[a]++; kiss[b]++; nKiss++;
    } else {
      const a = at[k], b = at[k + 1], c = at[k + 2];
      if (e.dir > 0) {
        mv(a, e, k, k + 2, 'bend'); mv(b, e, k + 1, k, 'bend'); mv(c, e, k + 2, k + 1, 'bend');
        at[k] = b; at[k + 1] = c; at[k + 2] = a; cross[a] += 2; cross[b]++; cross[c]++;
      } else {
        mv(c, e, k + 2, k, 'bend'); mv(a, e, k, k + 1, 'bend'); mv(b, e, k + 1, k + 2, 'bend');
        at[k] = c; at[k + 1] = a; at[k + 2] = b; cross[c] += 2; cross[a]++; cross[b]++;
      }
      nCross += 2; nSkip++;
    }
  }
  const trackOf = new Array(TRACKS);
  at.forEach((c, t) => { trackOf[c] = t; });
  const rows = moves.map((ms, c) => new Set([c, ...ms.map((mv) => mv.to)]).size);
  return { trackOf, cross, kiss, moves, nCross, nKiss, nSkip, rows };
}

function schedule(events, rng) {
  for (const pause of [26, 14, 6, 0]) if (schedule1(events, rng, pause)) return true;
  return false;
}
function schedule1(events, rng, pause) {
  const free = new Array(TRACKS).fill(WEAVE.x0);
  for (const e of events) {
    const ts = evTracks(e);
    const start = Math.max(...ts.map((t) => free[t])) + rng.uniform(0, pause);
    e.x0 = start; e.x1 = start + SPAN[e.t];
    for (const t of ts) free[t] = e.x1 + GAP_MIN;
  }
  const end = Math.max(...events.map((e) => e.x1));
  const s = (WEAVE.x1 - WEAVE.x0) / (end - WEAVE.x0);
  if (s < 0.8 || s > 1.35) return false;
  for (const e of events) { e.x0 = +(WEAVE.x0 + (e.x0 - WEAVE.x0) * s).toFixed(1); e.x1 = +(WEAVE.x0 + (e.x1 - WEAVE.x0) * s).toFixed(1); }
  return true;
}

function litOk(sim, plugs) {
  return plugs.every((p) => sim.cross[p] >= HW.litCross[0] && sim.cross[p] <= HW.litCross[1] && sim.rows[p] >= HW.litRows)
    && plugs.reduce((s, p) => s + sim.kiss[p], 0) >= HW.litKiss;
}
function buildRoundHard(rng) {
  for (let draw = 0; draw < 20; draw++) {
    const r = buildRoundFor(rng);
    if (r) return r;
  }
  throw new Error('cable_follow: could not build a weave');
}
function buildRoundFor(rng) {
  const rows = Array.from({ length: TRACKS }, (_, i) => i);
  const plugs = rng.sample(rows, N_PLUGS);
  rng.raw();
  let targets = null;
  for (let k = 0; k < 2000 && !targets; k++) {
    const t = plugs.map((p) => rng.pick(rows.filter((i) => Math.abs(i - p) <= HW.maxDelta)));
    if (new Set(t).size === N_PLUGS) targets = t;
  }
  if (!targets) return null;
  for (let attempt = 0; attempt < 120000; attempt++) {
    const nSkip = rng.int(HW.skip[0], HW.skip[1]), nKiss = rng.int(HW.kiss[0], HW.kiss[1]);
    const nSwap = rng.int(HW.cross[0], HW.cross[1]) - 2 * nSkip;
    const types = rng.shuffle([...Array(nSwap).fill('swap'), ...Array(nKiss).fill('kiss'), ...Array(nSkip).fill('skip')]);
    const events = types.map((t) => (t === 'skip' ? { t, k: rng.int(0, TRACKS - 3), dir: rng.pick([1, -1]) } : { t, k: rng.int(0, TRACKS - 2) }));
    const sim = simulate(events);
    if (!plugs.every((p, i) => sim.trackOf[p] === targets[i])) continue;
    if (!litOk(sim, plugs)) continue;
    if (sim.cross.filter((v) => v >= 1).length < HW.weave) continue;
    if (!schedule(events, rng)) continue;
    return { plugs, answers: targets, nx: sim.nCross, events, conns: plugs.map((p) => ({ x: X_CONN, y: TRACK_Y[p] })) };
  }
  return null;
}

function chooseExtras(options, need, rng, stage = 0) {
  if (stage === options.length) return need === 0 ? [] : null;
  for (const choice of rng.shuffle(options[stage].filter((p) => p.length <= need))) {
    const tail = chooseExtras(options, need - choice.length, rng, stage + 1);
    if (tail) return [choice, ...tail];
  }
  return null;
}

function cablePath(g, start, moves, end) {
  const Y = (t) => TRACK_Y[t];
  g.beginPath();
  g.moveTo(X_PLUG_EXIT, Y(start));
  for (const mv of moves) {
    g.lineTo(mv.x0, Y(mv.from));
    if (mv.kind === 'bend') { const mx = (mv.x0 + mv.x1) / 2; g.bezierCurveTo(mx, Y(mv.from), mx, Y(mv.to), mv.x1, Y(mv.to)); }
    else for (let k = 1; k <= 16; k++) { const t = k / 16, s = Math.sin(Math.PI * t); g.lineTo(mv.x0 + (mv.x1 - mv.x0) * t, Y(mv.from) + mv.toward * KISS_A * s * s); }
  }
  g.lineTo(X_SOCK_IN, Y(end));
}

function drawPlug(g, x, y, col) {
  const on = col >= 0;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  rr(g, x - 13, y - 9, 22, 18, 4); g.fillStyle = on ? PLUG_COL[col] : '#4a525c'; g.fill();
  g.restore();
  rr(g, x + 8, y - 4, 5, 8, 1.5); g.fillStyle = on ? PLUG_DARK[col] : '#353b43'; g.fill();
  g.strokeStyle = on ? PLUG_LIGHT[col] : '#c9ccd0'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - 13, y - 4); g.lineTo(x - 18, y - 4); g.moveTo(x - 13, y + 4); g.lineTo(x - 18, y + 4); g.stroke();
}
function plugPos(m, s, i) {
  if (s.drag && s.drag.i === i) return { x: s.drag.x, y: s.drag.y, rest: false };
  if (s.picks[i] >= 0) { const sk = m.sockets[s.picks[i]]; return { x: sk.x, y: sk.y, rest: false, sock: true }; }
  const c = connsOf(m.rounds[0])[i];
  return { x: c.x, y: c.y, rest: true };
}
function grabAt(m, s, x, y) {
  const conns = connsOf(m.rounds[0]), R = m.grabR ?? GRAB_R;
  for (let i = 0; i < conns.length; i++) if (s.picks[i] >= 0) { const sk = m.sockets[s.picks[i]]; if (Math.hypot(x - sk.x, y - sk.y) <= R) return i; }
  for (let i = 0; i < conns.length; i++) if (Math.hypot(x - conns[i].x, y - conns[i].y) <= R) return i;
  return -1;
}

function drawSocket(g, x, y) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.14)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  rr(g, x - 15, y - 15, 30, 30, 6); g.fillStyle = '#ffffff'; g.fill();
  g.restore();
  g.strokeStyle = '#d3d6da'; g.lineWidth = 1; rr(g, x - 14.5, y - 14.5, 29, 29, 6); g.stroke();
  g.fillStyle = '#5a6068';
  rr(g, x - 6, y - 5.5, 3, 11, 1); g.fill();
  rr(g, x + 3, y - 5.5, 3, 11, 1); g.fill();
}

function drawCableEnd(g, x, y) {
  g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fillStyle = CABLE; g.fill();
}

export function gate(m) {
  if (m && m.ext) return extGate(m);
  if (!m || m.task !== 'cable_follow' || !Array.isArray(m.rounds) || m.rounds.length !== 1) return false;
  if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h || !Array.isArray(m.sockets) || m.sockets.length !== TRACKS) return false;
  if (!m.sockets.every((sk, j) => sk.x === X_SOCK && sk.y === TRACK_Y[j]) || m.snapR !== SNAP_R) return false;
  const r = m.rounds[0], E = r.events, P = r.plugs, A = r.answers;
  if (!Array.isArray(E) || !Array.isArray(P) || !Array.isArray(A) || !Array.isArray(r.conns)) return false;
  if (P.length !== N_PLUGS || A.length !== N_PLUGS || r.conns.length !== N_PLUGS) return false;
  if (!P.every((p) => Number.isInteger(p) && p >= 0 && p < TRACKS) || new Set(P).size !== N_PLUGS) return false;
  if (!A.every((a) => Number.isInteger(a) && a >= 0 && a < TRACKS) || new Set(A).size !== N_PLUGS) return false;
  const last = new Array(TRACKS).fill(WEAVE.x0 - 0.05);
  for (const e of E) {
    if (!e || !['swap', 'kiss', 'skip'].includes(e.t) || !Number.isInteger(e.k) || e.k < 0) return false;
    if (e.k > (e.t === 'skip' ? TRACKS - 3 : TRACKS - 2) || (e.t === 'skip' && e.dir !== 1 && e.dir !== -1)) return false;
    if (!Number.isFinite(e.x0) || !Number.isFinite(e.x1) || e.x0 < WEAVE.x0 - 0.05 || e.x1 > WEAVE.x1 + 0.05) return false;
    if (e.x1 - e.x0 < SPAN[e.t] * 0.8 - 0.05) return false;
    for (const t of evTracks(e)) { if (e.x0 < last[t] - 0.05) return false; last[t] = e.x1 + GAP_MIN * 0.8; }
  }
  const sim = simulate(E);
  const nK = E.filter((e) => e.t === 'kiss').length, nS = E.filter((e) => e.t === 'skip').length;
  return sim.nCross >= HW.cross[0] && sim.nCross <= HW.cross[1] && nK >= HW.kiss[0] && nK <= HW.kiss[1]
    && nS >= HW.skip[0] && nS <= HW.skip[1] && litOk(sim, P) && sim.cross.filter((v) => v > 0).length >= HW.weave
    && P.every((p, i) => Math.abs(A[i] - p) <= HW.maxDelta && sim.trackOf[p] === A[i]
      && r.conns[i].x === X_CONN && r.conns[i].y === TRACK_Y[p])
    && r.nx === sim.nCross;
}

function extMatchings(K, reserved) {
  const out = [];
  const walk = (t, pairs) => {
    if (t >= K - 1) { out.push(pairs.slice()); return; }
    walk(t + 1, pairs);
    if (!reserved.has(t) && !reserved.has(t + 1)) { pairs.push(t); walk(t + 2, pairs); pairs.pop(); }
  };
  walk(0, []);
  return out;
}
function extLitMoves(K, plug, target, rng) {
  const delta = target - plug, d = Math.abs(delta), dir = Math.sign(delta);
  if (d >= 2) return Array(d).fill(dir);
  if (d === 1) return plug - dir >= 0 && plug - dir < K ? [-dir, dir, dir] : [dir, -dir, dir];
  const step = rng.pick([-1, 1].filter((v) => plug + v >= 0 && plug + v < K));
  return [step, -step];
}
const EXT_NX = (K) => [K, Math.round(1.5 * K)];
function extWeave(rng, K, S) {
  const plug = rng.int(0, K - 1);
  const target = rng.pick(Array.from({ length: K }, (_, i) => i).filter((i) => Math.abs(i - plug) <= 4));
  const moves = extLitMoves(K, plug, target, rng);
  if (moves.length > S) return null;
  const [nxLo, nxHi] = EXT_NX(K);
  for (let attempt = 0; attempt < 100; attempt++) {
    const moveStages = rng.sample(Array.from({ length: S }, (_, i) => i), moves.length).sort((a, b) => a - b);
    const moveAt = new Map(moveStages.map((st, i) => [st, moves[i]]));
    let lit = plug;
    const required = [], options = [];
    for (let st = 0; st < S; st++) {
      const step = moveAt.get(st) ?? 0;
      required.push(step ? Math.min(lit, lit + step) : null);
      options.push(extMatchings(K, new Set(step ? [lit, lit + step] : [lit])));
      lit += step;
    }
    if (lit !== target) continue;
    const want = rng.int(Math.max(nxLo, moves.length), nxHi);
    const extras = chooseExtras(options, want - moves.length, rng);
    if (!extras) continue;
    const cableAt = Array.from({ length: K }, (_, i) => i);
    const cols = [cableAt.slice()];
    const per = new Array(K).fill(0);
    let nx = 0;
    for (let st = 0; st < S; st++) {
      const pairs = required[st] == null ? extras[st] : [required[st], ...extras[st]];
      for (const k of pairs) { const a = cableAt[k], b = cableAt[k + 1]; cableAt[k] = b; cableAt[k + 1] = a; nx++; per[a]++; per[b]++; }
      const trackOf = new Array(K).fill(0);
      cableAt.forEach((cid, t) => { trackOf[cid] = t; });
      cols.push(trackOf);
    }
    const tracks = Array.from({ length: K }, (_, c) => cols.map((col) => col[c]));
    if (nx < nxLo || nx > nxHi || per.filter((v) => v >= 1).length < Math.ceil((2 * K) / 3)) continue;
    if (tracks[plug][S] !== target || per[plug] < 2 || per[plug] > 4) continue;
    return { plug, answer: target, nx, tracks };
  }
  return null;
}
const r1 = (v) => Math.round(v * 10) / 10;
function extGeom(rng, K, S) {
  const side = rng.pick(['left', 'top', 'right', 'bottom']);
  const horiz = side === 'left' || side === 'right';
  const mainLen = horiz ? BOARD_EXT.w : BOARD_EXT.h, crossLen = horiz ? BOARD_EXT.h : BOARD_EXT.w;
  const gap = Math.min(52, (crossLen - 70) / (K - 1)) * rng.uniform(0.86, 1);
  const c0 = (crossLen - gap * (K - 1)) / 2 + rng.uniform(-6, 6);
  const track = Array.from({ length: K }, (_, i) => r1(c0 + i * gap));
  const plug = 34 + rng.uniform(0, 8), sock = mainLen - 34 - rng.uniform(0, 8);
  const w0 = plug + 30 + rng.uniform(0, 8), w1 = sock - 26 - rng.uniform(0, 8);
  const step = (w1 - w0) / S;
  const col = Array.from({ length: S + 1 }, (_, j) => r1(w0 + j * step + (j > 0 && j < S ? rng.uniform(-0.12, 0.12) * step : 0)));
  return { side, track, col, plug: r1(plug), exit: r1(plug + 12), sock: r1(sock), sockIn: r1(sock - 22) };
}
function extXY(side, main, cross) {
  if (side === 'left') return { x: main, y: cross };
  if (side === 'right') return { x: BOARD_EXT.w - main, y: cross };
  if (side === 'top') return { x: cross, y: main };
  return { x: cross, y: BOARD_EXT.h - main };
}
function generateExt(rng) {
  for (let att = 0; att < 200; att++) {
    const K = TRACKS_EXT, S = STAGES_EXT;
    const w = extWeave(rng, K, S);
    if (!w) continue;
    const G = extGeom(rng, K, S);
    const P = (main, cross) => { const q = extXY(G.side, main, cross); return { x: r1(q.x), y: r1(q.y) }; };
    return {
      task: 'cable_follow', board: BOARD_EXT, panel: PANEL_EXT,
      sockets: G.track.map((c) => P(G.sock, c)),
      grabR: GRAB_R, snapR: Math.min(SNAP_R, Math.floor((G.track[1] - G.track[0]) * 0.7)),
      rounds: [{ ...w, conn: P(G.plug, G.track[w.plug]) }],
      ext: { K, S, ...G },
    };
  }
  throw new Error('cable_follow: ext sampler exhausted');
}
function extGate(m) {
  const e = m.ext, r = m.rounds?.[0];
  if (m.task !== 'cable_follow' || !e || !r || m.rounds.length !== 1) return false;
  const { K, S } = e, T = r.tracks;
  if (!(K >= 5 && K <= 8 && S >= 4 && S <= 7) || e.track.length !== K || e.col.length !== S + 1 || m.sockets.length !== K) return false;
  if (!Array.isArray(T) || T.length !== K || !T.every((tr) => tr.length === S + 1)) return false;
  let nx = 0;
  const per = new Array(K).fill(0);
  for (let j = 0; j <= S; j++) {
    if (new Set(T.map((tr) => tr[j])).size !== K) return false;
    if (j === 0) { if (!T.every((tr, c) => tr[0] === c)) return false; continue; }
    for (let c = 0; c < K; c++) {
      const d = T[c][j] - T[c][j - 1];
      if (Math.abs(d) > 1) return false;
      if (d !== 0) { const o = T.findIndex((tr) => tr[j - 1] === T[c][j] && tr[j] === T[c][j - 1]); if (o < 0) return false; per[c]++; if (c < o) nx++; }
    }
  }
  const [lo, hi] = EXT_NX(K);
  const P = (main, cross) => extXY(e.side, main, cross);
  const near = (a, b) => Math.abs(a.x - b.x) < 0.11 && Math.abs(a.y - b.y) < 0.11;
  const gap = Math.min(...e.track.slice(1).map((v, i) => v - e.track[i]));
  return nx >= lo && nx <= hi && per[r.plug] >= 2 && per[r.plug] <= 4 && per.filter((v) => v > 0).length >= Math.ceil((2 * K) / 3)
    && T[r.plug][S] === r.answer && near(r.conn, P(e.plug, e.track[r.plug])) && m.sockets.every((sk, j) => near(sk, P(e.sock, e.track[j])))
    && gap >= 30 && m.snapR === Math.min(SNAP_R, Math.floor((e.track[1] - e.track[0]) * 0.7));
}
function geomOf(m) {
  return { ...m.ext };
}

const CABLE_KINDS = ['rubber', 'braided', 'ribbed', 'twisted', 'flat'];
const PLUG_KINDS = ['block', 'rj45', 'usb', 'barrel'];
const SOCK_KINDS = ['plate', 'metal', 'panel'];
async function mountLook(st) {
  const surfaces = st.pool('tex', (t) => ((t.use === 'wood' && ANISO[t.id] && ANISO[t.id][0] < 0.7 && !GRIDDY.test(t.id))
    || (['floor', 'fabric', 'metal', 'flat2d', 'stone', 'wall'].includes(t.use) && isoTex(t, 0.25, 0.3))) && !/blue|denim|denmin/.test(t.id));
  const [stex, ck] = primaryOf(st, 'g17_cable', [surfaces, splitList(st, 'g17_cable_kind', CABLE_KINDS)]);
  const r = st.rand;
  st.note(`surface:${stex.id}`); st.note(`cable:${ck}`);
  const dark = r() < 0.45;
  const L = dark ? 0.16 + 0.12 * r() : 0.62 + 0.2 * r();
  const surface = await natural(stex.file, { L, contrast: 0.35 + 0.2 * r(), sat: 0.25 });
  const pal = dark ? ['#e9e9e6', '#d9dde2', '#f1e9d8', '#c9d2c4'] : ['#2c3036', '#1d1f22', '#3b3f45', '#4a3d33', '#2f3a46'];
  const flatCols = dark ? ['#f0c94a', '#e9e9e6', '#ff8a5c'] : ['#c9473d', '#3f7f4f', '#7a4fa0', '#d07b22'];
  const base = ck === 'flat' ? pickSplit(st, dark ? 'g17_cable_flat_dk' : 'g17_cable_flat_lt', flatCols) : pickSplit(st, dark ? 'g17_cable_pal_dk' : 'g17_cable_pal_lt', pal);
  const plugBody = dark ? '#d8dbe0' : '#3e444b';
  return {
    surface, surfK: 0.7 + 0.6 * r(), surfOff: [r() * 256, r() * 256], dark, cable: ck, base,
    hi: lumOf(base) > 0.5 ? shade(base, 0.72) : mix(base, '#ffffff', 0.35),
    width: 5 + Math.round(3 * r()), wobble: 0.6 + 1.2 * r(), wobbleK: 2 + Math.floor(3 * r()), phase: r() * 6.28,
    plug: pickSplit(st, 'g17_plug', PLUG_KINDS), sock: pickSplit(st, 'g17_socket', SOCK_KINDS),
    plugBody, order: shuffleBy(r, 8), stripe: r() < 0.5,
  };
}
function shuffleBy(r, n) { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cablePoints(G, tr, L) {
  const pts = [];
  const push = (main, cross) => { const q = extXY(G.side, main, cross); pts.push(q); };
  const wob = (main) => L.wobble * Math.sin(main / 40 * L.wobbleK + L.phase + tr[0]);
  push(G.exit, G.track[tr[0]]);
  push(G.col[0], G.track[tr[0]] + wob(G.col[0]) * 0.3);
  for (let s = 0; s < G.S; s++) {
    const m0 = G.col[s], m1 = G.col[s + 1], c0 = G.track[tr[s]], c1 = G.track[tr[s + 1]];
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, main = m0 + (m1 - m0) * t;
      const e = c0 === c1 ? 0 : t * t * (3 - 2 * t);
      push(main, c0 + (c1 - c0) * e + (c0 === c1 ? wob(main) * Math.sin(Math.PI * t) : 0));
    }
  }
  push(G.sockIn, G.track[tr[G.S]]);
  return pts;
}
function strokePts(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); }
function drawCableStyled(g, pts, L) {
  const W = L.width;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.34)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
  strokePts(g, pts); g.strokeStyle = shade(L.base, 0.82); g.lineWidth = W; g.stroke();
  g.restore();
  strokePts(g, pts); g.strokeStyle = L.base; g.lineWidth = W - 1.2; g.stroke();
  if (L.cable === 'braided') {
    g.save(); g.setLineDash([2, 2]); strokePts(g, pts); g.strokeStyle = L.hi; g.lineWidth = W - 2; g.stroke();
    g.lineDashOffset = 2; g.strokeStyle = shade(L.base, 0.7); g.lineWidth = Math.max(1, W - 4); g.stroke(); g.restore();
  } else if (L.cable === 'ribbed') {
    g.save(); g.setLineDash([1.2, 2.2]); strokePts(g, pts); g.strokeStyle = shade(L.base, lumOf(L.base) > 0.5 ? 0.78 : 1.5); g.lineWidth = W - 1.2; g.stroke(); g.restore();
  } else if (L.cable === 'twisted') {
    g.save(); g.setLineDash([5, 5]); strokePts(g, pts); g.strokeStyle = L.hi; g.lineWidth = W * 0.5; g.stroke(); g.restore();
  } else if (L.cable === 'flat' && L.stripe) {
    strokePts(g, pts); g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1; g.stroke();
  }
  g.save(); g.translate(0, -W * 0.18);
  strokePts(g, pts); g.strokeStyle = rgba('#ffffff', lumOf(L.base) > 0.5 ? 0.35 : 0.22); g.lineWidth = 1.2; g.stroke();
  g.restore();
}
function drawPlugStyled(g, x, y, ang, blue, L) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const body = blue ? ACCENT : L.plugBody, dk = blue ? '#1475d0' : shade(L.plugBody, 0.7);
  g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  if (L.plug === 'rj45') { rr(g, -13, -8, 20, 16, 2); g.fillStyle = body; g.fill(); }
  else if (L.plug === 'usb') { rr(g, -13, -8, 16, 16, 4); g.fillStyle = body; g.fill(); }
  else if (L.plug === 'barrel') { rr(g, -14, -7, 18, 14, 7); g.fillStyle = body; g.fill(); }
  else { rr(g, -13, -9, 22, 18, 4); g.fillStyle = body; g.fill(); }
  g.restore();
  if (L.plug === 'rj45') { rr(g, 7, -6, 7, 12, 1); g.fillStyle = blue ? '#9fd0ff' : 'rgba(220,230,240,0.85)'; g.fill(); g.fillStyle = '#c8a64a'; for (let k = -4; k <= 4; k += 2) g.fillRect(12, k - 0.4, 2, 0.8); }
  else if (L.plug === 'usb') { g.fillStyle = '#c7ccd2'; g.fillRect(3, -6, 11, 12); g.fillStyle = '#5b636c'; g.fillRect(6, -3, 6, 2.5); }
  else if (L.plug === 'barrel') { g.fillStyle = '#b9bec4'; g.fillRect(4, -3.5, 10, 7); g.fillStyle = '#2a2e33'; g.fillRect(11, -1.4, 3, 2.8); }
  else { rr(g, 8, -4, 5, 8, 1.5); g.fillStyle = dk; g.fill(); }
  g.strokeStyle = blue ? '#d6e9fb' : shade(L.plugBody, L.dark ? 0.8 : 1.6); g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-13, -3.5); g.lineTo(-17, -3.5); g.moveTo(-13, 3.5); g.lineTo(-17, 3.5); g.stroke();
  g.restore();
}
function drawSocketStyled(g, x, y, ang, L) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.save(); g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  rr(g, -15, -15, 30, 30, L.sock === 'panel' ? 3 : 6);
  g.fillStyle = L.sock === 'metal' ? '#c3c8ce' : L.sock === 'panel' ? '#2c3137' : '#ffffff'; g.fill();
  g.restore();
  g.strokeStyle = L.sock === 'panel' ? '#50575f' : '#9aa1a8'; g.lineWidth = 1; rr(g, -14.5, -14.5, 29, 29, L.sock === 'panel' ? 3 : 6); g.stroke();
  g.fillStyle = L.sock === 'panel' ? '#0d0f12' : '#4d545c';
  if (L.plug === 'rj45') { rr(g, -6, -7, 12, 14, 1.5); g.fill(); }
  else if (L.plug === 'usb') { rr(g, -6, -4, 12, 8, 1); g.fill(); }
  else if (L.plug === 'barrel') { g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill(); }
  else { rr(g, -6, -5.5, 3, 11, 1); g.fill(); rr(g, 3, -5.5, 3, 11, 1); g.fill(); }
  if (L.sock === 'metal') { g.fillStyle = '#8b9197'; for (const [sx, sy] of [[-11, -11], [11, 11]]) { g.beginPath(); g.arc(sx, sy, 1.6, 0, Math.PI * 2); g.fill(); } }
  g.restore();
}
const SIDE_ANG = { left: 0, right: Math.PI, top: Math.PI / 2, bottom: -Math.PI / 2 };
function drawStyled(g, br, env, L) {
  const { manifest: m, state: s } = env;
  const G = geomOf(m);
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = pat(g, L.surface, L.surfK, 0, 0, L.surfK, L.surfOff[0], L.surfOff[1]); g.fillRect(0, 0, br.w, br.h);
  const rd = m.rounds[0], ang = SIDE_ANG[G.side];
  const a = extXY(G.side, G.sock - 20, 0), b = extXY(G.side, G.sock + 20, G.side === 'left' || G.side === 'right' ? BOARD_EXT.h : BOARD_EXT.w);
  g.fillStyle = L.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  g.lineCap = 'round'; g.lineJoin = 'round';
  const order = L.order.filter((c) => c < G.K);
  for (const c of order) {
    const pts = cablePoints(G, rd.tracks[c], L);
    drawCableStyled(g, pts, L);
    const e = extXY(G.side, G.sockIn, G.track[rd.tracks[c][G.S]]);
    g.beginPath(); g.arc(e.x, e.y, L.width * 0.62, 0, Math.PI * 2); g.fillStyle = shade(L.base, 0.75); g.fill();
  }
  for (let j = 0; j < G.K; j++) { const q = extXY(G.side, G.sock, G.track[j]); drawSocketStyled(g, q.x, q.y, ang, L); }
  for (let p = 0; p < G.K; p++) if (p !== rd.plug) { const q = extXY(G.side, G.plug, G.track[p]); drawPlugStyled(g, q.x, q.y, ang, false, L); }
  const rest = rd.conn;
  let hx, hy;
  if (s.drag) { hx = s.drag.x; hy = s.drag.y; }
  else if (s.picks[0] >= 0) { const sk = m.sockets[s.picks[0]]; const back = extXY(G.side, -4, 0), o = extXY(G.side, 0, 0); hx = sk.x + back.x - o.x; hy = sk.y + back.y - o.y; }
  else { hx = rest.x; hy = rest.y; }
  if (hx !== rest.x || hy !== rest.y) {
    const ex = extXY(G.side, G.exit, G.track[rd.plug]);
    g.save(); g.strokeStyle = 'rgba(25,145,250,.6)'; g.lineWidth = 2.5; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(ex.x, ex.y); g.lineTo(hx - 13 * Math.cos(ang), hy - 13 * Math.sin(ang)); g.stroke(); g.restore();
  }
  drawPlugStyled(g, hx, hy, ang, true, L);
  g.restore();
}

export default {
  meta: {
    name: 'cable_follow', family: 'B', 
    panelWidth: PANEL_W, boardH: BOARD_H, headerH: HEADER_H, footer: 'verify', board: BOARD,
    actionSpace: [{ op: 'drag', phase: 'start|move|end', x: 'board px', y: 'board px', note: 'start on a coloured plug (or on the socket holding it); end on a socket' }],
    promptHuman: "Drag each coloured plug (blue, orange, purple) to the socket at its own cable's other end; all three must be right",
  },

  generate(rng, _level, _index, _knobs = {}) {
    if (_knobs.ext) return generateExt(rng);
    const rounds = [buildRoundHard(rng)];
    return {
      task: 'cable_follow', board: BOARD,
      sockets: TRACK_Y.map((y) => ({ x: X_SOCK, y })),
      grabR: GRAB_R, snapR: SNAP_R, rounds,
    };
  },

  init(m) { return { picks: connsOf(m.rounds[0]).map(() => -1), drag: null }; },

  applyAction(s, a, m) {
    if (!a || a.op !== 'drag' || !['start', 'move', 'end'].includes(a.phase) || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-op' };
    if (a.phase === 'start') {
      const i = grabAt(m, s, a.x, a.y);
      if (i < 0) return { ok: false, reason: 'miss-grab' };
      s.drag = { i, x: a.x, y: a.y }; return { ok: true };
    }
    if (!s.drag) return { ok: false, reason: 'not-dragging' };
    s.drag = { i: s.drag.i, x: a.x, y: a.y };
    if (a.phase === 'end') {
      const i = s.drag.i;
      let best = -1, bd = (m.snapR ?? SNAP_R);
      m.sockets.forEach((sk, j) => { const d = Math.hypot(a.x - sk.x, a.y - sk.y); if (d < bd) { bd = d; best = j; } });
      s.drag = null;
      if (best >= 0) {
        s.picks.forEach((p, k) => { if (k !== i && p === best) s.picks[k] = -1; });
        s.picks[i] = best;
      } else s.picks[i] = -1;
    }
    return { ok: true };
  },

  verify(s, m) {
    const want = answersOf(m.rounds[0]);
    const good = want.map((t, i) => s.picks[i] === t);
    const success = good.every(Boolean);
    return {
      success, partial: good.filter(Boolean).length / want.length,
      error: success ? 0 : 1, detail: { plugged: s.picks.filter((p) => p >= 0).length, correct: good.filter(Boolean).length, need: want.length },
    };
  },

  oracle(m) {
    const acts = [], r = m.rounds[0], conns = connsOf(r);
    answersOf(r).forEach((t, i) => {
      const c = conns[i], sk = m.sockets[t];
      acts.push({ op: 'drag', phase: 'start', x: c.x, y: c.y });
      acts.push({ op: 'drag', phase: 'move', x: +((c.x + sk.x) / 2).toFixed(2), y: +((c.y + sk.y) / 2).toFixed(2) });
      acts.push({ op: 'drag', phase: 'end', x: sk.x, y: sk.y });
    });
    return acts;
  },

  randomPolicy(m, rnd) {
    const acts = [];
    for (const c of connsOf(m.rounds[0])) {
      const sk = m.sockets[Math.floor(rnd() * m.sockets.length)];
      acts.push({ op: 'drag', phase: 'start', x: c.x, y: c.y }, { op: 'drag', phase: 'end', x: sk.x, y: sk.y });
    }
    return acts;
  },

  async mount(env) { env.assets.look = env.style ? await mountLook(env.style) : null; },

  drawPrompt(g, r, env) {
    if (env.manifest.ext) { drawPromptText(g, r, "Drag the blue plug to its cable's other end"); return; }
    drawPromptText(g, r, "Drag each coloured plug to its cable's other end", 'Blue, orange and purple: all three must be right');
  },

  drawBoard(g, br, env) {
    if (env.assets?.look && env.manifest.ext) { drawStyled(g, br, env, env.assets.look); return; }
    const { manifest: m, state: s } = env;
    g.save(); g.translate(br.x, br.y);
    g.fillStyle = BG; g.fillRect(0, 0, br.w, br.h);

    const rd = m.rounds[0], plugs = plugsOf(rd);
    const sim = simulate(rd.events);

    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let c = 0; c < TRACKS; c++) {
      const end = sim.trackOf[c];
      g.save();
      g.shadowColor = 'rgba(0,0,0,.30)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
      cablePath(g, c, sim.moves[c], end); g.strokeStyle = CABLE; g.lineWidth = CABLE_W; g.stroke();
      g.restore();
      g.save(); g.translate(0, -1.2);
      cablePath(g, c, sim.moves[c], end); g.strokeStyle = CABLE_HI; g.lineWidth = 1.4; g.stroke();
      g.restore();
      drawCableEnd(g, X_SOCK_IN, TRACK_Y[end]);
    }

    for (let j = 0; j < TRACKS; j++) drawSocket(g, X_SOCK, TRACK_Y[j]);
    for (let p = 0; p < TRACKS; p++) if (!plugs.includes(p)) drawPlug(g, X_PLUG, TRACK_Y[p], -1);

    const order = plugs.map((_, i) => i).sort((a, b) => (s.drag?.i === a) - (s.drag?.i === b));
    for (const i of order) {
      const q = plugPos(m, s, i), hx = q.sock ? q.x - 4 : q.x, hy = q.y;
      if (!q.rest) {
        g.save(); g.strokeStyle = PLUG_COL[i]; g.globalAlpha = 0.45; g.lineWidth = 2; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(X_PLUG_EXIT, TRACK_Y[plugs[i]]); g.lineTo(hx - 13, hy); g.stroke(); g.restore();
      }
      drawPlug(g, hx, hy, i);
    }

    g.restore();
  },

  pointer(evt, env) {
    const s = env.state, m = env.manifest;
    if (evt.type === 'down') {
      if (grabAt(m, s, evt.x, evt.y) >= 0) { this._grab = true; return [{ op: 'drag', phase: 'start', x: evt.x, y: evt.y }]; }
      return [];
    }
    if (evt.type === 'move' && this._grab) return [{ op: 'drag', phase: 'move', x: evt.x, y: evt.y }];
    if (evt.type === 'up' && this._grab) { this._grab = false; return [{ op: 'drag', phase: 'end', x: evt.x, y: evt.y }]; }
    return [];
  },

  wantsMoveRedraw: true,

  footerStatus(env) {
    const s = env.state, n = s.picks.length, k = s.picks.filter((p) => p >= 0).length;
    if (n === 1) return k ? 'Plugged in' : 'Drag the blue plug';
    return k ? `${k} of ${n} plugged in` : 'Drag the coloured plugs';
  },
};

export function semanticKey(m) {
  const r = m.rounds[0];
  if (r.events) return `cable_follow|${r.events.map((e) => `${e.t[0]}${e.k}${e.dir > 0 ? '+' : e.dir < 0 ? '-' : ''}`).join(',')}|${plugsOf(r).join(',')}`;
  return `cable_follow|${r.tracks.map((t) => t.join('')).join('/')}|${r.plug}`;
}
