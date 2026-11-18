const COL_WORD = ['blue', 'red', 'green', 'purple'];

export function makeRemoveVariant(H) {
  const { BOARD, N, TAB, CUP_R, CUP_H, MARGIN, SLACK, MIN_SEP, CUP_BOOK, TABLE_IN, CAM_VIS, MIN_PX, CUP_SEP_PX, SEATS,
    buildWorld, sceneFor, dropScene, eyePoints, bookCorners, cupBookDist, bookGap, bookSpan, cupCovered, cupSamples,
    separable, segmentBlocker, objectStats, orbitCam, bookOutline, segDepth } = H;
  const NAME = 'count_visible_from_their_seat';
  const BOOK_V = { thick: [0.04, 0.055], wide: [0.24, 0.3], tall: [0.32, 0.37] };
  const LOOKS = [0, 2, 4];
  const BOOK_PX = 800, NAMED_PX = 1000;

  const round3 = (v) => Math.round(v * 1000) / 1000;
  const round2 = (v) => Math.round(v * 100) / 100;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const norm360 = (d) => ((d % 360) + 360) % 360;
  const sAng = (a, b) => ((a - b + 540) % 360) - 180;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const bearing = (from, to) => deg(Math.atan2(to.z - from.z, to.x - from.x));
  const setEq = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

  function relTo(g, b, eyes, extra = 0) {
    let covers = true, clear = true;
    for (const e of eyes) {
      const ref = bearing(e, g), D = dist2(e, g), half = deg(Math.asin(CUP_R / D)), S = bookSpan(b, e, ref);
      const rimY = TAB.top + CUP_H, lineAtBook = e.y - (e.y - rimY) * (S.near / Math.max(1e-6, D - CUP_R));
      if (!(S.lo <= -(half + MARGIN.hideDeg + extra) && S.hi >= half + MARGIN.hideDeg + extra
        && D - CUP_R >= S.far + MARGIN.behind && lineAtBook <= TAB.top + b.h - MARGIN.overTop)) covers = false;
      const aside = S.hi <= -(half + MARGIN.clearDeg + extra) || S.lo >= half + MARGIN.clearDeg + extra;
      const inFront = D + CUP_R <= S.near - MARGIN.front;
      if (!(aside || inFront)) clear = false;
    }
    return covers ? 'covers' : clear ? 'clear' : null;
  }
  function rayHitsBook(p, q, b) {
    const a = rad(b.yaw), ca = Math.cos(a), sa = Math.sin(a), g = 0.01;
    const loc = (x, z) => [ca * (x - b.x) - sa * (z - b.z), sa * (x - b.x) + ca * (z - b.z)];
    const [p0, p2] = loc(p[0], p[2]), [q0, q2] = loc(q[0], q[2]);
    const P = [p0, p[1] - TAB.top, p2], Q = [q0, q[1] - TAB.top, q2];
    const lo = [-b.w / 2 - g, 0, -b.d / 2 - g], hi = [b.w / 2 + g, b.h + g, b.d / 2 + g];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const d = Q[k] - P[k];
      if (Math.abs(d) < 1e-12) { if (P[k] < lo[k] || P[k] > hi[k]) return false; continue; }
      let ta = (lo[k] - P[k]) / d, tb = (hi[k] - P[k]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    return true;
  }
  function rayVis(sc, c, e, extraSkip = []) {
    const S = cupSamples(c), skip = new Set([c.id, 22, ...extraSkip]);
    let n = 0, tot = 0;
    for (const q of S) {
      if ((q[0] - c.x) * (e.x - c.x) + (q[2] - c.z) * (e.z - c.z) < 0 && q[1] < TAB.top + CUP_H) continue;
      tot++;
      if (segmentBlocker(sc, e.x, e.y, e.z, q[0], q[1], q[2], skip) < 0) n++;
    }
    return n / tot;
  }

  function analyze(m) {
    const { sc, eye, F } = sceneFor(m), eyes = eyePoints(eye, F), E0 = { x: eye[0], y: eye[1], z: eye[2] };
    const X = m.removed, rel = new Map();
    for (const c of m.cups) rel.set(c.id, m.books.map((b) => relTo(c, b, eyes)));
    const status = (c, keep) => {
      const r = rel.get(c.id).filter((_, bi) => keep(bi));
      if (r.includes('covers')) return 'hidden';
      return r.every((v) => v === 'clear') ? 'visible' : null;
    };
    const now = new Map(), after = new Map();
    for (const c of m.cups) { now.set(c.id, status(c, () => true)); after.set(c.id, status(c, (bi) => bi !== X)); }
    const ids = (map, v) => m.cups.filter((c) => map.get(c.id) === v).map((c) => c.id).sort((a, b) => a - b);
    return { sc, eyes, E0, X, rel, now, after, nowVis: ids(now, 'visible'), afterVis: ids(after, 'visible'), afterHid: ids(after, 'hidden') };
  }
  function nearestBehind(m, E, b) {
    const ref = bearing(E, b), S = bookSpan(b, E, ref), Db = dist2(E, b);
    let best = null, bd = Infinity;
    for (const c of m.cups) {
      const t = sAng(bearing(E, c), ref), D = dist2(E, c);
      if (t >= S.lo && t <= S.hi && D > Db && D < bd) { bd = D; best = c.id; }
    }
    return best;
  }
  function heuristics(m, A = analyze(m)) {
    const all = m.cups.map((c) => c.id), E = A.eyes[2];
    const blockedByX = m.cups.filter((c) => A.rel.get(c.id)[A.X] === 'covers').map((c) => c.id);
    const now = A.nowVis;
    const sole = [...new Set([...now, ...blockedByX])];
    const hiddenOne = new Set(m.books.map((b, bi) => (bi === A.X ? null : nearestBehind(m, E, b))).filter((v) => v !== null));
    const oneEach = all.filter((id) => !hiddenOne.has(id));
    const nx = nearestBehind(m, E, m.books[A.X]);
    const oneReveal = [...new Set([...now, ...(nx === null ? [] : [nx])])];
    const cam = A.sc.cam, pe = cam.project(E.x, E.y, E.z);
    const outl = m.books.map((b, bi) => (bi === A.X ? null : bookOutline(cam, b))).filter(Boolean);
    const line = m.cups.filter((c) => { const pc = cam.project(c.x, TAB.top + CUP_H / 2, c.z); return !outl.some((P) => segDepth(P, pe, pc) > 0); }).map((c) => c.id);
    const deep = (c) => [TAB.top + CUP_H / 2, TAB.top + CUP_H].every((y) => { const pc = cam.project(c.x, y, c.z); return outl.some((P) => segDepth(P, pe, pc) >= 4); });
    const line4 = m.cups.filter((c) => !deep(c)).map((c) => c.id);
    return { H_now: now, H_sole: sole, H_oneEach: oneEach, H_oneReveal: oneReveal, H_line: line, H_line4: line4 };
  }

  function contractProblems(m) {
    const P = [];
    if (!m || m.task !== NAME || m.cue !== 'remove') return ['task'];
    if (m.board?.w !== BOARD.w || m.board?.h !== BOARD.h) return ['board'];
    const seatDef = SEATS.find((s) => s.side === m.seat?.side);
    if (!seatDef || m.seat.yaw !== seatDef.yaw) return ['seat'];
    if (!Array.isArray(m.books) || m.books.length !== 3 || !Array.isArray(m.cups) || m.cups.length !== N) return ['shape'];
    if (!Number.isInteger(m.removed) || m.removed < 0 || m.removed >= m.books.length) return ['removed'];
    if (!LOOKS.includes(m.look)) P.push('look');
    const A = analyze(m), { sc, eyes, E0 } = A, cam = sc.cam;
    const relCam = Math.abs(sAng(m.camera.az, m.seat.yaw));
    if (relCam < 38 || relCam > 92) P.push('camera-angle');
    for (const b of m.books) {
      if (b.w < BOOK_V.wide[0] - 1e-6 || b.w > BOOK_V.wide[1] + 1e-6 || b.d < BOOK_V.thick[0] - 1e-6 || b.d > BOOK_V.thick[1] + 1e-6 || b.h < BOOK_V.tall[0] - 1e-6 || b.h > BOOK_V.tall[1] + 1e-6) P.push('book-size');
      if (bookCorners(b).some((c) => Math.abs(c.x) > TAB.hx - TABLE_IN + 1e-6 || Math.abs(c.z) > TAB.hz - TABLE_IN + 1e-6)) P.push('book-edge');
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (bookGap(m.books[i], m.books[j]) < 0.06) P.push('book-gap');
    m.books.forEach((b, i) => { if (objectStats(sc, 30 + i, 2, true).vis * 4 < (i === m.removed ? NAMED_PX : BOOK_PX)) P.push(`book-face${i}`); });
    if (m.books.some((b, i) => i !== m.removed && b.col === m.books[m.removed].col) || !COL_WORD[m.books[m.removed].col]) P.push('colour');
    const ids = m.cups.map((c) => c.id).sort((a, b) => a - b);
    if (!ids.every((v, i) => v === i)) P.push('ids');
    for (const c of m.cups) {
      if (Math.abs(c.x) > TAB.hx - TABLE_IN || Math.abs(c.z) > TAB.hz - TABLE_IN) P.push(`cup-edge${c.id}`);
      for (const o of m.cups) if (o.id < c.id && dist2(o, c) < MIN_SEP - 1e-6) P.push('cup-sep');
      if (m.books.some((b) => cupBookDist(b, c) < CUP_BOOK - 1e-6)) P.push(`cup-book${c.id}`);
      if (A.rel.get(c.id).some((r) => r === null)) { P.push(`ambiguous${c.id}`); continue; }
      const nw = A.now.get(c.id), af = A.after.get(c.id);
      const rn = eyes.map((e) => rayVis(sc, c, e)), ra = eyes.map((e) => rayVis(sc, c, e, [30 + m.removed]));
      if (nw === 'visible' ? !rn.every((v) => v === 1) : !rn.every((v) => v === 0)) P.push(`ray-now${c.id}`);
      if (af === 'visible' ? !ra.every((v) => v === 1) : !ra.every((v) => v === 0)) P.push(`ray-after${c.id}`);
      const st = objectStats(sc, c.id, 2, true);
      if (st.frac < CAM_VIS || st.vis * 4 < MIN_PX) P.push(`cam-vis${c.id}`);
      if (!st.box || st.box[0] < 0.06 * BOARD.w || st.box[2] > 0.94 * BOARD.w || st.box[1] < 0.06 * BOARD.h || st.box[3] > 0.94 * BOARD.h) P.push(`frame${c.id}`);
    }
    if (P.some((p) => p.startsWith('ambiguous'))) return [...new Set(P)];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = cam.project(m.cups[i].x, TAB.top + CUP_H, m.cups[i].z), b = cam.project(m.cups[j].x, TAB.top + CUP_H, m.cups[j].z);
      if (Math.hypot(a.x - b.x, a.y - b.y) < CUP_SEP_PX) P.push('cup-sep-px');
    }
    for (const e of eyes) for (const i of A.afterVis) for (const c of m.cups) if (c.id !== i && cupCovered(c, m.cups.find((q) => q.id === i), e)) P.push('cup-covers-cup');
    const R = (c) => A.rel.get(c.id);
    const stays = m.cups.filter((c) => R(c)[m.removed] === 'covers' && R(c).some((r, bi) => bi !== m.removed && r === 'covers'));
    const shows = m.cups.filter((c) => R(c)[m.removed] === 'covers' && R(c).every((r, bi) => bi === m.removed || r === 'clear'));
    if (!stays.length) P.push('trap-stays');
    if (!shows.length) P.push('trap-shows');
    if (A.nowVis.length < 1 || A.afterHid.length < 1 || A.afterHid.length > 3) P.push('counts');
    if (!Array.isArray(m.answer) || !setEq(m.answer, A.afterVis) || m.answer.some((v, i) => i && v <= m.answer[i - 1])) P.push('answer');
    const Hs = heuristics(m, A);
    for (const k of ['H_now', 'H_sole', 'H_oneEach', 'H_line', 'H_line4']) if (setEq(Hs[k], A.afterVis)) P.push(`shortcut-${k}`);
    const hid = new Set(A.afterHid);
    if (separable(m.cups, hid, (c) => dist2(E0, c))) P.push('distance-shortcut');
    for (const id of [20, 21, 22, 30, 31, 32]) {
      const st = objectStats(sc, id, 4, false);
      if (!st.box || st.box[0] < 0.05 * BOARD.w || st.box[2] > 0.95 * BOARD.w || st.box[1] < 0.04 * BOARD.h || st.box[3] > 0.96 * BOARD.h) P.push(`frame-obj${id}`);
    }
    return [...new Set(P)];
  }
  function gate(m) { try { return contractProblems(m).length === 0; } catch { return false; } }

  function tryBuild(rng, dbg = null) {
    const fail = (k) => { if (dbg) dbg[k] = (dbg[k] || 0) + 1; return null; };
    const seatDef = SEATS[0], j = round3(rng.uniform(-0.12, 0.12)), pos = seatDef.at(j);
    const camRange = rng.pick(seatDef.cam);
    const camera = { az: round2(rng.uniform(...camRange)), el: round2(rng.uniform(42, 48)), dist: 3.55, fov: 34, tx: round3(pos.x * 0.2), ty: 0.5, tz: round3(pos.z * 0.2) };
    const m = { task: NAME, cue: 'remove', board: { ...BOARD }, camera, seat: { side: seatDef.side, x: pos.x, z: pos.z, yaw: seatDef.yaw },
      look: rng.pick(LOOKS), books: [], cups: [], removed: 0, answer: [] };
    const probe = buildWorld(m), eyes = eyePoints(probe.eye, probe.F), E0 = { x: probe.eye[0], y: probe.eye[1], z: probe.eye[2] };
    const face = deg(Math.atan2(probe.F.f[1], probe.F.f[0]));
    const inTable = (c, pad) => Math.abs(c.x) <= TAB.hx - TABLE_IN - pad && Math.abs(c.z) <= TAB.hz - TABLE_IN - pad;
    const at = (phi, D) => ({ x: round3(E0.x + D * Math.cos(rad(phi))), z: round3(E0.z + D * Math.sin(rad(phi))) });
    const camEye = orbitCam(camera, BOARD.w, BOARD.h).eye;
    const mkBook = (phi, D, col, wide, tall) => {
      const b = { ...at(phi, D), w: round3(rng.uniform(...wide)), d: round3(rng.uniform(...BOOK_V.thick)), h: round3(rng.uniform(...tall)), yaw: 0, col };
      const y0 = deg(Math.atan2(E0.x - b.x, E0.z - b.z)), cx = camEye[0] - b.x, cz = camEye[2] - b.z, cl = Math.hypot(cx, cz);
      const shown = (y) => Math.abs(Math.sin(rad(y)) * cx + Math.cos(rad(y)) * cz) / cl;
      const turn = shown(y0) >= 0.5 ? rng.uniform(-8, 8) : (shown(y0 + 20) > shown(y0 - 20) ? 1 : -1) * rng.uniform(14, 30);
      b.yaw = round2(norm360(y0 + turn));
      return bookCorners(b).every((c) => inTable(c, 0.005)) ? b : null;
    };
    const camSide = Math.sign(camEye[0] - E0.x) || 1, s = -camSide;
    const lineOff = rng.uniform(13, 28), lineB = face + s * lineOff, zB = face - s * rng.uniform(Math.max(14, 42 - lineOff), 32);
    const bcols = rng.shuffle([0, 1, 2, 3]);
    const DX = rng.uniform(0.42, 0.5), gapXY = rng.uniform(0.34, 0.4);
    const X = mkBook(lineB + rng.uniform(-2, 2), DX, bcols[0], [0.25, 0.3], [0.35, 0.37]);
    if (!X) return fail('X');
    const Y = mkBook(lineB + rng.uniform(-2.5, 2.5), DX + gapXY, bcols[1], [0.27, 0.3], [0.32, 0.37]);
    if (!Y || bookGap(X, Y) < 0.07) return fail('Y');
    const Z = mkBook(zB + rng.uniform(-3, 3), rng.uniform(0.45, 0.55), bcols[2], [0.24, 0.29], [0.33, 0.37]);
    if (!Z || bookGap(X, Z) < 0.07 || bookGap(Y, Z) < 0.07) return fail('Z');
    const books = [X, Y, Z];
    const fwd = (c) => (c.x - E0.x) * Math.cos(rad(face)) + (c.z - E0.z) * Math.sin(rad(face));
    const cups = [];
    const spaced = (c) => fwd(c) >= 0.34 && cups.every((o) => dist2(o, c) >= MIN_SEP + 0.005) && books.every((b) => cupBookDist(b, c) >= CUP_BOOK + 0.005) && inTable(c, 0);
    const rels = (c) => books.map((b) => relTo(c, b, eyes, SLACK));
    const camBlocked = (c) => cupSamples({ ...c, id: -1 }).filter((q) => books.some((b) => rayHitsBook(camEye, q, b))).length > 2;
    const want = (r, w) => r.every((v, i) => v === w[i]);
    const place = (tries, gen, w, kind) => {
      for (let t = 0; t < tries; t++) {
        const c = gen();
        if (dbg) { const r = spaced(c) ? rels(c).map((v) => (v ? v[1] : '?')).join('') : 'spaced'; dbg[`${kind}:${r}`] = (dbg[`${kind}:${r}`] || 0) + 1; }
        if (!spaced(c) || !want(rels(c), w) || camBlocked(c)) continue;
        cups.push({ ...c, kind });
        return true;
      }
      return false;
    };
    const near = (b, dphi, d0, d1) => () => at(bearing(E0, b) + rng.uniform(-dphi, dphi), dist2(E0, b) + rng.uniform(d0, d1));
    if (!place(60, near(Y, 2, 0.1, 0.22), ['covers', 'covers', 'clear'], 'A')) return fail('A');
    if (!place(60, () => at(bearing(E0, X) + s * rng.uniform(-2, 5), DX + rng.uniform(0.12, gapXY - 0.14)), ['covers', 'clear', 'clear'], 'B')) return fail('B');
    if (!place(60, near(Z, 3, 0.1, 0.2), ['clear', 'clear', 'covers'], 'C')) return fail('C1');
    const c1 = cups[cups.length - 1];
    if (!place(60, () => at(bearing(E0, c1) + rng.uniform(-3, 3), dist2(E0, c1) + rng.uniform(0.185, 0.27)), ['clear', 'clear', 'covers'], 'C')) return fail('C2');
    for (let n = 0; n < N - 4; n++) {
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        const c = { x: round3(rng.uniform(-TAB.hx + TABLE_IN, TAB.hx - TABLE_IN)), z: round3(rng.uniform(-TAB.hz + TABLE_IN, TAB.hz - TABLE_IN)) };
        if (!spaced(c) || !want(rels(c), ['clear', 'clear', 'clear']) || camBlocked(c)) continue;
        const seen = cups.filter((o) => o.kind === 'B' || o.kind === 'V');
        if (eyes.some((e) => cups.some((o) => cupCovered(o, c, e, SLACK)) || seen.some((o) => cupCovered(c, o, e, SLACK)))) continue;
        cups.push({ ...c, kind: 'V' }); ok = true;
      }
      if (!ok) return fail('V');
    }
    if (eyes.some((e) => cups.some((o) => o.kind !== 'B' && cupCovered(o, cups.find((q) => q.kind === 'B'), e, SLACK)))) return fail('Bcov');
    const order = rng.shuffle([0, 1, 2]);
    m.books = order.map((k) => books[k]);
    m.removed = order.indexOf(0);
    const cid = rng.shuffle([...Array(N).keys()]), cols = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
    m.cups = cups.map((c, i) => ({ id: cid[i], x: c.x, z: c.z, col: cols[i], hy: round2(rng.uniform(0, 360)) })).sort((a, b) => a.id - b.id);
    m.answer = cups.map((c, i) => (c.kind === 'B' || c.kind === 'V' ? cid[i] : -1)).filter((i) => i >= 0).sort((a, b) => a - b);
    const P = contractProblems(m);
    dropScene(m);
    if (P.length && dbg) for (const k of P) {
      const mm = /^(.*?)(\d+)$/.exec(k), key = 'contract:' + (mm && !k.startsWith('frame-obj') && !k.startsWith('book-face') ? mm[1] + ':' + cups[cid.indexOf(Number(mm[2]))]?.kind : k);
      dbg[key] = (dbg[key] || 0) + 1;
    }
    return P.length ? fail('contract') : m;
  }

  function generate(rng) {
    for (let attempt = 0; attempt < 20000; attempt++) {
      const m = tryBuild(rng);
      if (m) return m;
    }
    throw new Error('count_visible_from_their_seat: generator exhausted (cue=remove)');
  }

  const colourWord = (m) => COL_WORD[m.books[m.removed].col];
  const prompt = (m) => [`Select every cup she could see if the ${colourWord(m)} book were taken away`, 'Judge from her chair, not from yours'];
  function semanticKey(m) {
    const q = (v) => Math.round(v / 0.16), vis = new Set(m.answer);
    const things = m.cups.map((c) => `${q(c.x)},${q(c.z)}${vis.has(c.id) ? 'v' : 'h'}`).sort();
    const blockers = m.books.map((b, i) => `${q(b.x)},${q(b.z)}${i === m.removed ? 'r' : ''}`).sort();
    return `count_visible|remove|${m.seat.side}|${things.join(';')}|${blockers.join(';')}`;
  }
  return { generate, contractProblems, gate, analyze, heuristics, prompt, colourWord, semanticKey, relTo, tryBuild };
}
