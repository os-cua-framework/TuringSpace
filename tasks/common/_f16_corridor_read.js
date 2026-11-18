import * as W from './_f16_corridor_world.js';

export const VMAX = 1.0;
export const EPS_OBS = 0.002, EPS_REV = 0.1, RHO = 0.05;

const STEPS = new WeakMap();
function stepTable(m) {
  let S = STEPS.get(m.floors);
  if (!S) {
    const D = W.distTable(m), n = m.floors.length, F = m.floors;
    const first = Array.from({ length: n }, () => new Int8Array(n).fill(-1)), last = Array.from({ length: n }, () => new Int8Array(n).fill(-1));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b || D.M[a][b] >= 99) continue;
      let cur = b, prev = -1;
      while (cur !== a) {
        const [c, r] = F[cur];
        let nxt = -1;
        for (const [dc, dr] of W.DIRS) { const j = D.id.get(`${c + dc},${r + dr}`); if (j !== undefined && D.M[a][j] === D.M[a][cur] - 1) { nxt = j; break; } }
        if (prev === -1) last[a][b] = W.dirBetween(F[nxt], F[cur]);
        prev = cur; cur = nxt;
      }
      first[a][b] = W.dirBetween(F[a], F[prev]);
    }
    const T = W.stateTable(m);
    const deadAhead = T.states.map((st) => [0, 1, 3].every((k) => { const dd = W.DIRS[(st.h + k) % 4]; return !W.isFloor(m, st.c + dd[0], st.r + dd[1]); }));
    S = { first, last, D, deadAhead };
    STEPS.set(m.floors, S);
  }
  return S;
}

function transRow(m, T, S, a, dt, epsRev = EPS_REV) {
  const R = Math.floor(VMAX * dt) + 1, sa = T.states[a], ia = S.D.id.get(`${sa.c},${sa.r}`);
  const w = new Float64Array(T.states.length);
  let sum = 0;
  for (let b = 0; b < T.states.length; b++) {
    const sb = T.states[b], ib = S.D.id.get(`${sb.c},${sb.r}`), d = S.D.M[ia][ib];
    if (d > R) continue;
    let rev = 0;
    if (d === 0) rev = sb.h === (sa.h + 2) % 4 && !S.deadAhead[a] ? 1 : 0;
    else { if (S.first[ia][ib] === (sa.h + 2) % 4 && !S.deadAhead[a]) rev++; if (sb.h === (S.last[ia][ib] + 2) % 4) rev++; }
    const x = rev === 0 ? 1 : rev === 1 ? epsRev : epsRev * epsRev;
    w[b] = x; sum += x;
  }
  if (sum > 0) for (let b = 0; b < w.length; b++) w[b] /= sum;
  return w;
}
function startRow(m, T, S, dt, epsRev) {
  const i0 = T.idx.get(`${m.start.col},${m.start.row},${m.start.heading}`);
  return transRow(m, T, S, i0, Math.max(0.5, dt), epsRev);
}

export function watch(m, looks, opt = {}) {
  const T = W.stateTable(m), S = stepTable(m), n = T.states.length, eps = opt.epsRev ?? EPS_REV;
  const key = opt.doorKey || 'door';
  const like = (o) => {
    const L = new Float64Array(n);
    for (let i = 0; i < n; i++) L[i] = o.turning ? 1 : (T.states[i].sig === o.sig ? 1 : EPS_OBS);
    return L;
  };
  const K = looks.length, alpha = [], Ls = looks.map((l) => like(l.obs)), trans = [];
  let a = new Float64Array(n).fill(1 / n);
  for (let k = 0; k < K; k++) {
    if (k > 0) {
      const dt = (looks[k].t - looks[k - 1].t) * (opt.gapScale || 1.2);
      const rows = [], st = startRow(m, T, S, dt, eps), na = new Float64Array(n);
      for (let i = 0; i < n; i++) { if (a[i] === 0) { rows.push(null); continue; } const r = transRow(m, T, S, i, dt, eps); rows.push(r); for (let j = 0; j < n; j++) na[j] += a[i] * ((1 - RHO) * r[j] + RHO * st[j]); }
      trans.push({ rows, st });
      a = na;
    }
    let s = 0; for (let i = 0; i < n; i++) { a[i] *= Ls[k][i]; s += a[i]; }
    if (s <= 0) a = new Float64Array(n).fill(1 / n); else for (let i = 0; i < n; i++) a[i] /= s;
    alpha.push(a);
  }
  const post = new Array(K);
  let b = new Float64Array(n).fill(1);
  for (let k = K - 1; k >= 0; k--) {
    const g = new Float64Array(n); let s = 0;
    for (let i = 0; i < n; i++) { g[i] = alpha[k][i] * b[i]; s += g[i]; }
    for (let i = 0; i < n; i++) g[i] = s > 0 ? g[i] / s : alpha[k][i];
    post[k] = g;
    if (k > 0) {
      const { rows, st } = trans[k - 1], nb = new Float64Array(n);
      const lb = new Float64Array(n); for (let j = 0; j < n; j++) lb[j] = Ls[k][j] * b[j];
      let stb = 0; for (let j = 0; j < n; j++) stb += st[j] * lb[j];
      for (let i = 0; i < n; i++) {
        const r = rows[i] || transRow(m, T, S, i, (looks[k].t - looks[k - 1].t) * (opt.gapScale || 1.2), eps);
        let x = 0; for (let j = 0; j < n; j++) x += r[j] * lb[j];
        nb[i] = (1 - RHO) * x + RHO * stb;
      }
      let ss = 0; for (let i = 0; i < n; i++) ss += nb[i]; for (let i = 0; i < n; i++) nb[i] = ss > 0 ? nb[i] / ss : 1;
      b = nb;
    }
  }
  const { face, votes } = vote(m, looks, post, (o) => o[key]);
  return { face, votes, post };
}
export function vote(m, looks, post, pick, mode = 'sum') {
  const T = W.stateTable(m), n = T.states.length, votes = new Map();
  for (let k = 0; k < looks.length; k++) {
    const rel = pick(looks[k].obs);
    if (!rel || looks[k].obs.turning) continue;
    let any = false;
    for (let i = 0; i < n; i++) {
      if (post[k][i] < 1e-6) continue;
      const s = T.states[i], f = W.absFace(rel, s.c, s.r, s.h);
      if (!W.isWallFace(m, f)) continue;
      const id = W.fid(f), e = votes.get(id) || { face: f, w: 0 };
      e.w += post[k][i]; votes.set(id, e); any = true;
    }
    if (any && mode === 'first') break;
  }
  let best = null; for (const e of votes.values()) if (!best || e.w > best.w) best = e;
  return { face: best ? best.face : null, votes };
}

export const SEE_MIN = 3;
export function observe(m, tau, opt = {}) {
  const p = W.poseAt(m, tau), sn = W.snap(p);
  const o = { tau, turning: sn.turning, sig: sn.turning ? null : W.signature(m, sn.c, sn.r, sn.h), sn, door: null, seen: [], rel: {} };
  if (sn.turning && !opt.all) return o;
  const cnt = new Map();
  for (let i = 0; i < W.NC; i++) {
    const cf = W.castFull(m, p, (2 * (i + 0.5)) / W.NC - 1), h = cf.h;
    const bump = (k, sp) => { const e = cnt.get(k) || { n: 0, sp }; e.n++; cnt.set(k, e); };
    if (h.c === m.door.col && h.r === m.door.row && h.d === m.door.dir && h.u > W.DOOR_U[0] && h.u < W.DOOR_U[1]) bump('door');
    const dc = W.decorAt(m, h.c, h.r, h.d);
    if (dc) {
      const span = dc.kind === 'door' ? W.DOOR_U : dc.kind === 'poster' ? W.POSTER.u : dc.kind === 'picture' ? W.PIC.u : dc.kind === 'mirror' ? W.MIRROR.u : W.WINDOW.u;
      if (h.u > span[0] && h.u < span[1]) bump(`d${m.decor.indexOf(dc)}`);
    }
    if (cf.via) {
      const g = cf.h2;
      if (cf.via === 'mirror' && g.c === m.door.col && g.r === m.door.row && g.d === m.door.dir && g.u > W.DOOR_U[0] && g.u < W.DOOR_U[1]) bump('mirrorDoor');
      if (cf.via === 'window') { const w = W.decorAt(m, h.c, h.r, h.d), af = W.annexDoorFace(w); if (g.c === af.col && g.r === af.row && g.d === af.dir && g.u > W.DOOR_U[0] && g.u < W.DOOR_U[1]) bump('windowDoor'); }
    }
  }
  for (const [k, e] of cnt) if (e.n >= SEE_MIN) o.seen.push(k);
  if (!sn.turning && cnt.get('door')?.n >= SEE_MIN) o.door = W.relFace(m.door, sn.c, sn.r, sn.h);
  if (!sn.turning) for (const k of o.seen) {
    if (k === 'door') continue;
    let f = null;
    if (k === 'mirrorDoor') f = m.decor.find((d) => d.kind === 'mirror');
    else if (k === 'windowDoor') f = m.decor.find((d) => d.kind === 'window');
    else f = m.decor[Number(k.slice(1))];
    if (f) o.rel[k] = W.relFace(f, sn.c, sn.r, sn.h);
  }
  return o;
}
