import * as RT from './_props_rt.js';
import * as M from './_f16_shell_game_model.js';

const DEG = M.DEG, VIEW = M.VIEW;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const ACCENT = '#1f8fff';

export function lightFor(m) {
  const a = m.light.az * DEG, e = m.light.el * DEG, ca = m.cam.az * DEG;
  return {
    dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], col: [1.16, 1.11, 1.03], soft: 0.05,
    sky: [0.42, 0.43, 0.47], ground: [0.17, 0.15, 0.13],
    fill: { dir: norm([Math.sin(ca) * 0.8, 0.5, Math.cos(ca) * 0.8]), col: [0.2, 0.2, 0.22] }, aoK: 0.8, contact: 0.3, contactH: 0.02,
  };
}

function floorFn(m, P) {
  const { u, v } = M.rowAxes(m);
  const [W0, W1, W2] = P.WOODS[m.look.wood].map(RT.lin), FELT = RT.lin(P.FELTS[m.look.felt]);
  const FELT_D = FELT.map((c) => c * 0.78), FELT_L = FELT.map((c) => Math.min(1, c * 1.25 + 0.02)), STITCH = RT.lin('#d8d2c2');
  const hx = (m.n - 1) / 2 * m.s + m.cup.r0 + 0.1, hy = M.DEPTH_MAX + m.cup.r0 + 0.07, rc = 0.035, PL = 0.115, PLL = 1.3;
  const aa = (d, fp) => Math.max(0, Math.min(1, d / Math.max(fp, 1e-5) + 0.5));
  return (x, z, fp, out) => {
    const row = Math.floor(z / PL), off = RT.hash2(row, 3) * PLL, seg = Math.floor((x + off) / PLL);
    const tone = RT.hash2(row, seg), g1 = RT.fbm(x * 2.2 + row * 1.7, z * 9, 3, fp * 2), grain = RT.fbm(x * 3 + seg, z * 70 + row * 3, 2, fp * 40);
    RT.mixInto(out, W1, W2, Math.max(0, Math.min(1, 0.2 + 0.35 * tone + 0.3 * g1 + 0.2 * grain)));
    if (tone > 0.8) RT.mixInto(out, out, W0, 0.3);
    const seam = Math.max(RT.lineMask(z, PL, 0.0014, fp), 0.8 * RT.lineMask(x + off, PLL, 0.0012, fp));
    const ks = 1 - 0.45 * seam; out[0] *= ks; out[1] *= ks; out[2] *= ks;
    const px = Math.abs(x * u[0] + z * u[2]), pz = Math.abs(x * v[0] + z * v[2]);
    const dx = px - (hx - rc), dz = pz - (hy - rc);
    const sd = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - rc;
    if (sd < fp) {
      const cov = aa(-sd, fp), n = RT.fbm(x * 90, z * 90, 2, fp * 90), n2 = RT.fbm(x * 7 + 4, z * 7, 2, fp * 7);
      const fc = [0, 0, 0]; RT.mixInto(fc, FELT_D, FELT, 0.55 + 0.35 * n + 0.2 * (n2 - 0.5));
      const st = aa(0.0016 - Math.abs(-sd - 0.014), fp) * (((Math.floor((px + pz) / 0.009) & 1) === 0) ? 1 : 0.15);
      if (st > 0) RT.mixInto(fc, fc, STITCH, 0.55 * st);
      const edge = aa(0.004 + sd, fp);
      if (edge > 0) RT.mixInto(fc, fc, FELT_L, 0.25 * edge);
      RT.mixInto(out, out, fc, cov);
      const lip = aa(fp * 1.2 - Math.abs(sd + 0.0008), fp) * 0.35; out[0] *= 1 - lip; out[1] *= 1 - lip; out[2] *= 1 - lip;
    }
  };
}
function propShapes(m, shapes, mats) {
  const at = (def) => { mats.push(def); return mats.length - 1; };
  const { u, v } = M.rowAxes(m), hx = (m.n - 1) / 2 * m.s + m.cup.r0 + 0.1, hy = M.DEPTH_MAX + m.cup.r0 + 0.07;
  let sd = m.look.props >>> 0;
  const rnd = () => { sd = (sd + 0x6d2b79f5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const W = (x, y) => [x * u[0] + y * v[0], x * u[2] + y * v[2]];
  const yawRow = Math.atan2(u[0], u[2]) / DEG;
  const spots = [[-0.18 - 0.2 * rnd(), -hy - 0.06 - 0.12 * rnd()], [0.12 + 0.22 * rnd(), -hy - 0.07 - 0.12 * rnd()],
    [(rnd() < 0.5 ? -1 : 1) * (hx + 0.07 + 0.08 * rnd()), -0.12 - 0.12 * rnd()]];
  const kinds = [0, 1, 2].sort(() => rnd() - 0.5).slice(0, 2 + (rnd() < 0.5 ? 1 : 0));
  kinds.forEach((kind, i) => {
    const [x, z] = W(...spots[i]), id = 900 + i, yaw = yawRow + (rnd() - 0.5) * 70;
    if (kind === 0) {
      const back = rnd() < 0.5 ? '#25478f' : '#2d6b4e';
      const mt = at({ c: RT.lin(back), ks: 0.18, sh: 30, tex: (px, py, pz, nx, ny, nz, s, out) => {
        const [lx, lz] = RT.boxLocal(s, px, pz), edge = Math.min(0.032 - Math.abs(lx), 0.044 - Math.abs(lz));
        if (ny < 0.5 || edge < 0.004) { const w = RT.lin('#f1eee6'); out[0] = w[0]; out[1] = w[1]; out[2] = w[2]; return; }
        const b = RT.lin(back), k = ((Math.floor((lx + lz) / 0.004) + Math.floor((lx - lz) / 0.004)) & 1) ? 0.82 : 1;
        out[0] = b[0] * k; out[1] = b[1] * k; out[2] = b[2] * k; } });
      shapes.push(RT.shape.box(id, mt, x, 0.008, z, 0.032, 0.008, 0.044, yaw, 0.001));
    } else if (kind === 1) {
      const mt = at({ c: RT.lin(rnd() < 0.5 ? '#c49a4a' : '#b9bcc0'), ks: 0.55, sh: 40 });
      const nC = 3 + Math.floor(rnd() * 4);
      for (let c = 0; c < nC; c++) shapes.push(RT.shape.cyl(id, mt, x + (rnd() - 0.5) * 0.002, z + (rnd() - 0.5) * 0.002, c * 0.0022, c * 0.0022 + 0.002, 0.012, 0.0004));
      shapes.push(RT.shape.cyl(id, mt, x + 0.03, z + 0.012, 0, 0.002, 0.012, 0.0004));
    } else {
      const mt = at({ c: RT.lin('#e8b52a'), ks: 0.3, sh: 30 }), tip = at({ c: RT.lin('#d9b48a'), ks: 0.05, sh: 8 });
      const a = yaw * DEG, d = [Math.sin(a), 0, Math.cos(a)], L = 0.085;
      shapes.push(RT.shape.gcyl(id, mt, [x - d[0] * L, 0.0036, z - d[2] * L], [x + d[0] * (L - 0.02), 0.0036, z + d[2] * (L - 0.02)], 0.0036));
      shapes.push(RT.shape.gcyl(id, tip, [x + d[0] * (L - 0.02), 0.0036, z + d[2] * (L - 0.02)], [x + d[0] * L, 0.0036, z + d[2] * L], 0.0022));
    }
  });
}
export function buildBackground(m, P) {
  const shapes = [], mats = [];
  propShapes(m, shapes, mats);
  const wallCol = P.WALLS[m.look.wall];
  return RT.makeScene({ cam: M.cameraFor(m), shapes, mats, light: lightFor(m),
    env: { floorY: 0, floor: floorFn(m, P), floorMat: { ks: 0.04, sh: 12 }, wallZ: m.look.wallZ, wall: RT.plasterWall(wallCol, wallCol, 0), wallMat: { ks: 0, sh: 1, flat: 0.42 }, sky: RT.softSky },
    exposure: 1.0 });
}

export function traceCups(m, cam, Ps, showBall, q, P) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const { r0, r1, h } = m.cup, k = (r0 - r1) / h, nk = Math.sqrt(1 + k * k), Lt = lightFor(m), L = Lt.dir;
  const mat = P.CUPS[m.look.cup], CUPC = RT.lin(mat.c), BALLC = RT.lin('#cc1f26');
  const e = cam.eye;
  const cups = Ps.map((Q) => {
    const ox = e[0] - Q.b[0], oy = e[1] - Q.b[1], oz = e[2] - Q.b[2];
    const poly = M.cupPoly(m, cam, Q, 16), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { Q, o: [ox * Q.e1[0] + oy * Q.e1[1] + oz * Q.e1[2], ox * Q.a[0] + oy * Q.a[1] + oz * Q.a[2], ox * Q.e3[0] + oy * Q.e3[1] + oz * Q.e3[2]],
      l: [L[0] * Q.e1[0] + L[1] * Q.e1[1] + L[2] * Q.e1[2], L[0] * Q.a[0] + L[1] * Q.a[1] + L[2] * Q.a[2], L[0] * Q.e3[0] + L[1] * Q.e3[1] + L[2] * Q.e3[2]],
      bb: [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1] };
  });
  const bc = M.ballCentre(m);
  let ballBB = null;
  if (showBall) { const p = cam.project(bc[0], bc[1], bc[2]), rp = M.RB * cam.f / p.z + 1; ballBB = [p.x - rp, p.y - rp, p.x + rp, p.y + rp]; }
  const all = cups.map((c) => c.bb).concat(ballBB ? [ballBB] : []);
  const X0 = Math.max(0, Math.floor(Math.min(...all.map((b) => b[0])))), Y0 = Math.max(0, Math.floor(Math.min(...all.map((b) => b[1]))));
  const X1 = Math.min(VIEW.w, Math.ceil(Math.max(...all.map((b) => b[2])))), Y1 = Math.min(VIEW.h, Math.ceil(Math.max(...all.map((b) => b[3]))));
  const OW = Math.max(1, Math.round((X1 - X0) * q)), OH = Math.max(1, Math.round((Y1 - Y0) * q));
  const F = cam.F, Rr = cam.R, U = cam.U, f = cam.f;
  const col = new Float64Array(3), acc = new Float32Array(OW * OH * 4), ids = new Int8Array(OW * OH).fill(-1);
  const sample = (bx, by) => {
    const a = bx - cam.cx, b = cam.cy - by;
    let dx = F[0] * f + Rr[0] * a + U[0] * b, dy = F[1] * f + Rr[1] * a + U[1] * b, dz = F[2] * f + Rr[2] * a + U[2] * b;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    let best = Infinity, who = -1, kind = 0, dlx = 0, dly = 0, dlz = 0;
    for (let i = 0; i < cups.length; i++) {
      const c = cups[i], B = c.bb;
      if (bx < B[0] || bx > B[2] || by < B[1] || by > B[3]) continue;
      const Q = c.Q, lx = dx * Q.e1[0] + dy * Q.e1[1] + dz * Q.e1[2], ly = dx * Q.a[0] + dy * Q.a[1] + dz * Q.a[2], lz = dx * Q.e3[0] + dy * Q.e3[1] + dz * Q.e3[2];
      const t = M.hitLocal(c.o[0], c.o[1], c.o[2], lx, ly, lz, r0, r1, h, best);
      if (t < best) { best = t; who = i; kind = M.H.kind; dlx = lx; dly = ly; dlz = lz; }
    }
    let ball = false;
    if (ballBB && bx >= ballBB[0] && bx <= ballBB[2] && by >= ballBB[1] && by <= ballBB[3]) {
      const tb = M.hitBall(bc, e, [dx, dy, dz]);
      if (tb < best) { best = tb; ball = true; }
    }
    if (!ball && who < 0) return -1;
    const px = e[0] + dx * best, py = e[1] + dy * best, pz = e[2] + dz * best;
    let nx, ny, nz, base = col, inside = false, ks = mat.ks, sh = mat.sh, envK = mat.env, tone = 1, self = who;
    if (ball) {
      nx = (px - bc[0]) / M.RB; ny = (py - bc[1]) / M.RB; nz = (pz - bc[2]) / M.RB;
      col[0] = BALLC[0]; col[1] = BALLC[1]; col[2] = BALLC[2]; ks = 0.45; sh = 60; envK = 0.12; self = -1;
    } else {
      const c = cups[who], Q = c.Q, lx = c.o[0] + dlx * best, ly = c.o[1] + dly * best, lz = c.o[2] + dlz * best;
      let mx, my, mz;
      if (kind === 2) { mx = 0; my = 1; mz = 0; const rr = Math.hypot(lx, lz) / r1; if (rr > 0.72 && rr < 0.8) tone = 0.82; else if (rr < 0.35) tone = 0.94; }
      else {
        const Rl = r0 - k * ly; mx = lx / Rl / nk; my = k / nk; mz = lz / Rl / nk;
        if (mx * dlx + my * dly + mz * dlz > 0) { inside = true; mx = -mx; my = -my; mz = -mz; }
        const yy = ly / h;
        if (!inside) { if (ly < 0.006) tone = 0.78; else if (yy > 0.3 && yy < 0.335) tone = 0.8; else if (yy > 0.36 && yy < 0.375) tone = 0.86; else if (yy > 0.96) tone = 1.05; }
      }
      nx = mx * Q.e1[0] + my * Q.a[0] + mz * Q.e3[0]; ny = mx * Q.e1[1] + my * Q.a[1] + mz * Q.e3[1]; nz = mx * Q.e1[2] + my * Q.a[2] + mz * Q.e3[2];
      const kk = inside ? 0.32 : tone; col[0] = CUPC[0] * kk; col[1] = CUPC[1] * kk; col[2] = CUPC[2] * kk;
      if (inside) { ks = 0.05; envK = 0; }
    }
    const hemi = 0.5 + 0.5 * ny;
    let ao = 1 - Lt.contact * (0.6 - 0.4 * ny) * Math.exp(-py / Lt.contactH);
    if (inside) ao *= 0.5;
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    let vis = 0;
    if (ndl > 0 && !inside) {
      vis = 1;
      const sx = px + nx * 1e-4, sy = py + ny * 1e-4, sz = pz + nz * 1e-4;
      for (let j = 0; j < cups.length && vis; j++) {
        if (j === self) continue;
        const c = cups[j], Q = c.Q, ox = sx - Q.b[0], oy = sy - Q.b[1], oz = sz - Q.b[2];
        const t = M.hitLocal(ox * Q.e1[0] + oy * Q.e1[1] + oz * Q.e1[2], ox * Q.a[0] + oy * Q.a[1] + oz * Q.a[2], ox * Q.e3[0] + oy * Q.e3[1] + oz * Q.e3[2], c.l[0], c.l[1], c.l[2], r0, r1, h);
        if (t < Infinity) vis = 0;
      }
    }
    const dif = Math.max(0, ndl) * vis, Fd = Lt.fill.dir, fd = Math.max(0, nx * Fd[0] + ny * Fd[1] + nz * Fd[2]);
    let hx = L[0] - dx, hy = L[1] - dy, hz = L[2] - dz; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const sp = vis > 0 ? ks * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), sh) : 0;
    const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz)), fr = envK * Math.pow(1 - ndv, 4);
    const ref = 0.5 + 0.3 * Math.max(0, Math.min(1, (dy - 2 * (nx * dx + ny * dy + nz * dz) * ny) * 1.4 + 0.45));
    for (let ch = 0; ch < 3; ch++) {
      const amb = (Lt.ground[ch] + (Lt.sky[ch] - Lt.ground[ch]) * hemi) * ao;
      let v = base[ch] * (amb + Lt.col[ch] * dif) + base[ch] * Lt.fill.col[ch] * fd * ao + Lt.col[ch] * sp;
      v = v * (1 - fr) + ref * fr;
      col[ch] = v;
    }
    return ball ? cups.length : who;
  };
  const ss = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let py = 0; py < OH; py++) for (let px = 0; px < OW; px++) {
    const id = sample(X0 + (px + 0.5) / q, Y0 + (py + 0.5) / q), o = py * OW + px;
    ids[o] = id;
    if (id >= 0) { acc[o * 4] = col[0]; acc[o * 4 + 1] = col[1]; acc[o * 4 + 2] = col[2]; acc[o * 4 + 3] = 1; }
  }
  for (let py = 0; py < OH; py++) for (let px = 0; px < OW; px++) {
    const o = py * OW + px, id = ids[o];
    const edge = (px > 0 && ids[o - 1] !== id) || (px < OW - 1 && ids[o + 1] !== id) || (py > 0 && ids[o - OW] !== id) || (py < OH - 1 && ids[o + OW] !== id);
    if (!edge) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [sx, sy] of ss) { const hit = sample(X0 + (px + sx) / q, Y0 + (py + sy) / q); if (hit >= 0) { r += col[0]; g += col[1]; b += col[2]; n++; } }
    if (n) { acc[o * 4] = r / n; acc[o * 4 + 1] = g / n; acc[o * 4 + 2] = b / n; } acc[o * 4 + 3] = n / 4;
  }
  const data = new Uint8ClampedArray(OW * OH * 4);
  for (let i = 0; i < OW * OH; i++) {
    const a = acc[i * 4 + 3]; if (!a) continue;
    for (let c = 0; c < 3; c++) { let v = acc[i * 4 + c]; v = v / (1 + 0.12 * v); data[i * 4 + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)); }
    data[i * 4 + 3] = Math.round(255 * a);
  }
  const canvas = RT.toCanvas({ data, w: OW, h: OH });
  return { canvas, x: X0, y: Y0, w: OW / q, h: OH / q, ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0 };
}

function groundPoly(g, cam, poly, grow, style) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  g.beginPath();
  poly.forEach((p, i) => { const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz) || 1, s = cam.project(p[0] + dx / l * grow, 0, p[1] + dz / l * grow); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
  g.closePath(); g.fillStyle = style; g.fill();
}
function drawShadows(g, m, cam, Ps, showBall) {
  const L = lightFor(m).dir, down = (p) => [p[0] - L[0] * p[1] / L[1], p[2] - L[2] * p[1] / L[1]];
  for (const Q of Ps) {
    const poly = M.hull(M.rimPoints(m, Q, 20).map(down));
    groundPoly(g, cam, poly, 0.007, 'rgba(14,12,10,0.09)');
    groundPoly(g, cam, poly, 0.0035, 'rgba(14,12,10,0.12)');
    groundPoly(g, cam, poly, 0, 'rgba(14,12,10,0.24)');
  }
  for (const Q of Ps) {
    if (Q.b[1] > 1e-4) continue;
    const c = cam.project(Q.b[0], 0, Q.b[2]), rr = m.cup.r0 * 1.32;
    const p1 = cam.project(Q.b[0] + Q.e1[0] * rr, 0, Q.b[2] + Q.e1[2] * rr), p2 = cam.project(Q.b[0] + Q.e3[0] * rr, 0, Q.b[2] + Q.e3[2] * rr);
    g.save(); g.transform(p1.x - c.x, p1.y - c.y, p2.x - c.x, p2.y - c.y, c.x, c.y);
    const gr = g.createRadialGradient(0, 0, 0.72, 0, 0, 1);
    gr.addColorStop(0, 'rgba(10,8,6,0.32)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  }
  if (showBall) {
    const bc = M.ballCentre(m), w1 = norm([L[2], 0, -L[0]]), w2 = norm([w1[1] * L[2] - w1[2] * L[1], w1[2] * L[0] - w1[0] * L[2], w1[0] * L[1] - w1[1] * L[0]]), pts = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * 2 * Math.PI; pts.push(down([0, 1, 2].map((j) => bc[j] + M.RB * (Math.cos(a) * w1[j] + Math.sin(a) * w2[j])))); }
    groundPoly(g, cam, M.hull(pts), 0.002, 'rgba(14,12,10,0.14)');
    groundPoly(g, cam, M.hull(pts), 0, 'rgba(14,12,10,0.22)');
    const c = cam.project(bc[0], 0, bc[2]), rp = M.RB * cam.f / c.z;
    g.save(); g.translate(c.x, c.y); g.scale(1, 0.55);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rp * 0.9); gr.addColorStop(0, 'rgba(10,8,6,0.45)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rp * 0.9, 0, Math.PI * 2); g.fill(); g.restore();
  }
}

export function drawView(g, env, tv, P) {
  const m = env.manifest, st = env.state, q = Math.min(2, RT.contextScale(g)), cam = M.cameraFor(m);
  const Cc = (env.__sg3 ??= { m: null, q: 0, bg: null, layerKey: '', layer: null });
  if (Cc.m !== m || Cc.q !== q) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    Cc.m = m; Cc.q = q; Cc.bg = RT.toCanvas(RT.render(buildBackground(m, P), q)); Cc.layerKey = '';
    Cc.bgMs = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  }
  const Ps = M.poses3At(m, tv), showBall = M.ballShows(m, tv);
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW.w, VIEW.h); g.clip();
  g.drawImage(Cc.bg, 0, 0, VIEW.w, VIEW.h);
  drawShadows(g, m, cam, Ps, showBall);
  const key = `${tv.toFixed(5)}|${q}`;
  if (Cc.layerKey !== key) { Cc.layer = traceCups(m, cam, Ps, showBall, q, P); Cc.layerKey = key; (env.__sg3ms ??= []).push(Math.round(Cc.layer.ms * 10) / 10); if (env.__sg3ms.length > 400) env.__sg3ms.shift(); }
  const Lr = Cc.layer;
  if (st.sel >= 0 && M.atRest(m, tv)) {
    const poly = M.cupPoly(m, cam, Ps[st.sel], 32);
    g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = ACCENT; g.lineWidth = 6; g.stroke();
  }
  g.drawImage(Lr.canvas, Lr.x, Lr.y, Lr.w, Lr.h);
  const fd = M.fadeAt(m, tv);
  if (fd > 0) { g.fillStyle = `rgba(18,20,24,${(0.88 * fd).toFixed(3)})`; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  g.restore();
  g.save(); g.strokeStyle = '#d9dee4'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, VIEW.w - 1, VIEW.h - 1); g.restore();
}
