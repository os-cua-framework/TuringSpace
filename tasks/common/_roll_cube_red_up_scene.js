import * as RT from './_roll_cube_red_up_rt.js';
import * as K from './_scene_tex_kit.js';
import { splitIds } from '../core/style.js';

const S3 = K.S3;

export const G = 5;
export const STONE = 0.47;
export const STONE_BOTTOM = -0.9;
export const WATER_Y = -0.3;
export const HC = 0.36;
export const CUBE_ID = 90;
const CAM_DIST = 11;
export const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const LOCAL = { E: [0, 1], W: [0, -1], U: [1, 1], D: [1, -1], S: [2, 1], N: [2, -1] };

export const cellXZ = (c, r) => [c - (G - 1) / 2, r - (G - 1) / 2];
export const gridW = (m) => m.cols || G;
export const gridH = (m) => m.rows || G;
export const cellId = (m, c, r) => c + r * gridW(m);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function camBasis(m) {
  const az = m.cam.az * Math.PI / 180, el = m.cam.el * Math.PI / 180;
  const tgt = [0, 0.05, 0];
  const eye = [tgt[0] + CAM_DIST * Math.sin(az) * Math.cos(el), tgt[1] + CAM_DIST * Math.sin(el), tgt[2] + CAM_DIST * Math.cos(az) * Math.cos(el)];
  const F = norm([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
  const R = norm([-F[2], 0, F[0]]);
  const U = cross(R, F);
  return { eye, F, R, U };
}

export function sceneCamera(m, W, H, fit) {
  const { eye, F, R, U } = camBasis(m);
  const pr = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], z = dot(d, F); return [dot(d, R) / z, -dot(d, U) / z]; };
  const e = G / 2, pts = [];
  const xs = m.cols ? [-e, m.cols - e] : [-e, e], zs = m.rows ? [-e, m.rows - e] : [-e, e];
  for (const x of xs) for (const z of zs) for (const y of [WATER_Y, 2 * HC]) pts.push(pr([x * 0.97, y, z * 0.97]));
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const f = Math.min((fit.x1 - fit.x0) / (x1 - x0), (fit.y1 - fit.y0) / (y1 - y0));
  const cx = (fit.x0 + fit.x1) / 2 - f * (x0 + x1) / 2, cy = (fit.y0 + fit.y1) / 2 - f * (y0 + y1) / 2;
  return RT.camFromBasis({ eye, F, R, U, f, cx, cy, W, H });
}

export function faceCos(m, c, r, label) {
  if (label === 'D') return -1;
  const { eye } = camBasis(m), [x, z] = cellXZ(c, r);
  const n = label === 'U' ? [0, 1, 0] : [DIRS[label][0], 0, DIRS[label][1]];
  const fc = [x + n[0] * HC, HC + n[1] * HC, z + n[2] * HC];
  return dot(n, norm([eye[0] - fc[0], eye[1] - fc[1], eye[2] - fc[2]]));
}

function rotAxis(v, k, th) {
  const c = Math.cos(th), s = Math.sin(th), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
export function cubePose(c, r, red, dir = null, t = 0) {
  const [x, z] = cellXZ(c, r);
  const ctr = [x, HC, z];
  let ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (dir && t > 0) {
    const d = [DIRS[dir][0], 0, DIRS[dir][1]], k = cross([0, 1, 0], d), th = t * Math.PI / 2;
    const hinge = [x + d[0] * HC, 0, z + d[2] * HC];
    const rel = rotAxis([ctr[0] - hinge[0], ctr[1] - hinge[1], ctr[2] - hinge[2]], k, th);
    ctr[0] = hinge[0] + rel[0]; ctr[1] = hinge[1] + rel[1]; ctr[2] = hinge[2] + rel[2];
    ax = ax.map((a) => rotAxis(a, k, th));
  }
  return { c: ctr, ax, red: LOCAL[red], rest: !(dir && t > 0) };
}
export function cubeCorners(pose) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const s = [k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1];
    out.push([0, 1, 2].map((i) => pose.c[i] + HC * (s[0] * pose.ax[0][i] + s[1] * pose.ax[1][i] + s[2] * pose.ax[2][i])));
  }
  return out;
}

const lin = RT.lin;
const STONE_A = lin('#d6cfc1'), STONE_B = lin('#b9b1a2'), STONE_DARK = lin('#9d9585');
const BRASS = lin('#d9a93a'), BRASS_DARK = lin('#8a6a22');
const WHITE = lin('#f1efe9'), RED = lin('#c42b25');
const W1 = lin('#285f66'), W2 = lin('#33717a'), W3 = lin('#9cc3c6');

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = i * Math.PI / 5, rad = i % 2 ? 0.42 : 1;
  return [rad * Math.sin(a), rad * Math.cos(a)];
});
function starSigned(u, v) {
  let inside = false, dmin = Infinity;
  for (let i = 0, j = STAR.length - 1; i < STAR.length; j = i++) {
    const [xi, yi] = STAR[i], [xj, yj] = STAR[j];
    if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, tt = Math.max(0, Math.min(1, ((u - xi) * dx + (v - yi) * dy) / (dx * dx + dy * dy)));
    dmin = Math.min(dmin, Math.hypot(u - xi - tt * dx, v - yi - tt * dy));
  }
  return inside ? -dmin : dmin;
}

function stoneTex(starUp, foot) {
  return (x, y, z, nx, ny, nz, s, out) => {
    const tone = s.tone;
    const n = RT.fbm(x * 9 + s.cx * 3.1, z * 9 + y * 7 + s.cz * 1.7, 3);
    const sp = RT.vnoise(x * 60 + y * 40, z * 60 - y * 30);
    RT.mixInto(out, STONE_B, STONE_A, Math.max(0, Math.min(1, 0.25 + 0.5 * tone + 0.45 * (n - 0.5) * 2 * 0.5)));
    if (sp > 0.82) RT.mixInto(out, out, STONE_DARK, 0.45);
    if (ny < 0.7) { out[0] *= 0.93; out[1] *= 0.93; out[2] *= 0.93; }
    if (s.star && ny > 0.7) {
      const [lu, lv] = RT.boxLocal(s, x, z);
      const u = (lu * starUp[1] - lv * starUp[0]) / 0.31, v = (lu * starUp[0] + lv * starUp[1]) / 0.31;
      const sd = starSigned(u, v) * 0.31, aa = 0.012;
      if (sd < aa) {
        const k = Math.max(0, Math.min(1, (aa - sd) / (2 * aa)));
        const rim = Math.max(0, Math.min(1, (sd + 0.03) / 0.02));
        const g = 0.85 + 0.3 * RT.fbm(x * 30, z * 30, 2);
        const col = [BRASS[0] * g, BRASS[1] * g, BRASS[2] * g];
        RT.mixInto(col, col, BRASS_DARK, 0.75 * rim);
        RT.mixInto(out, out, col, k);
      }
    }
    if (foot && ny > 0.7) {
      const dx = Math.max(0, Math.abs(x - foot[0]) - HC), dz = Math.max(0, Math.abs(z - foot[1]) - HC);
      const k = 1 - 0.3 * Math.exp(-Math.hypot(dx, dz) / 0.045);
      out[0] *= k; out[1] *= k; out[2] *= k;
    }
  };
}
function cubeTex(x, y, z, nx, ny, nz, s, out) {
  const p = [x - s.c[0], y - s.c[1], z - s.c[2]];
  let best = -1, bv = -Infinity, sg = 1;
  for (let a = 0; a < 3; a++) { const v = dot(p, s.ax[a]); if (Math.abs(v) > bv) { bv = Math.abs(v); best = a; sg = v >= 0 ? 1 : -1; } }
  const isRed = best === s.red[0] && sg === s.red[1];
  const src = isRed ? RED : WHITE;
  const n = 0.97 + 0.03 * RT.vnoise(x * 50 + z * 13, y * 50);
  out[0] = src[0] * n; out[1] = src[1] * n; out[2] = src[2] * n;
}
function waterFloor(eye) {
  return (x, z, fp, out) => {
    const n = RT.fbm(x * 0.55 + 4.1, z * 0.55 - 2.3, 3, fp);
    RT.mixInto(out, W1, W2, Math.max(0, Math.min(1, 0.15 + 1.1 * (n - 0.35))));
    const u = x * 0.8 + z * 0.6, w = -x * 0.6 + z * 0.8;
    const rip = RT.fbm(u * 3.2, w * 5.5, 3, fp * 3);
    const dx = x - eye[0], dy = WATER_Y - eye[1], dz = z - eye[2];
    const cs = -dy / Math.hypot(dx, dy, dz), fr = 0.06 + 1.1 * (1 - cs) * (1 - cs);
    RT.mixInto(out, out, W3, Math.max(0, Math.min(0.6, fr * (0.8 + 0.6 * (rip - 0.5)))));
  };
}

export function traceScene(m, pose, cam, look = null) {
  if (look) return traceSceneStyled(m, pose, cam, look);
  const az = m.cam.az * Math.PI / 180;
  const starUp = [-Math.sin(az), -Math.cos(az)];
  const mats = [
    { c: STONE_A, ks: 0.06, sh: 14, tex: stoneTex(starUp, pose && pose.rest ? [pose.c[0], pose.c[2]] : null) },
    { c: WHITE, ks: 0.22, sh: 38, tex: cubeTex },
  ];
  const GW = gridW(m), GH = gridH(m), holes = new Set(m.holes.map(([c, r]) => c + r * GW));
  const shapes = [];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (holes.has(c + r * GW)) continue;
    const [x, z] = cellXZ(c, r);
    const jit = (RT.hash2(c * 7 + 3, r * 11 + m.cam.az) - 0.5) * 3;
    const s = RT.shape.box(c + r * GW, 0, x, (STONE_BOTTOM) / 2, z, STONE, -STONE_BOTTOM / 2, STONE, jit, 0.035);
    s.tone = RT.hash2(c * 13 + 1, r * 17 + 5);
    s.star = c === m.star[0] && r === m.star[1];
    shapes.push(s);
  }
  if (pose) {
    const s = RT.shape.obox(CUBE_ID, 1, pose.c, pose.ax, [HC, HC, HC], 0.06);
    s.red = pose.red; s.noAO = true;
    shapes.push(s);
  }
  const la = az - 0.75;
  const lf = az + 1.1;
  const light = { ...RT.STUDIO_LIGHT, dir: [Math.sin(la) * 0.62, 1, Math.cos(la) * 0.62], soft: 0.06,
    fill: { dir: [Math.sin(lf) * 0.8, 0.45, Math.cos(lf) * 0.8], col: [0.26, 0.26, 0.29] } };
  return RT.makeScene({ cam, shapes, mats, light, env: { floorY: WATER_Y, floor: waterFloor(cam.eye), floorMat: { ks: 0.18, sh: 40 }, sky: RT.softSky } });
}

export function influenceRect(pose, cam, L, W, H) {
  const pts = [];
  for (const p of cubeCorners(pose)) {
    pts.push(p);
    for (const h of [0, WATER_Y]) { const t = (p[1] - h) / L[1]; pts.push([p[0] - L[0] * t, h, p[2] - L[2] * t]); }
  }
  const e = HC + 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([pose.c[0] + sx * e, 0, pose.c[2] + sz * e]);
  const P = pts.map((p) => cam.project(p[0], p[1], p[2]));
  const m = 8;
  return { x0: Math.max(0, Math.min(...P.map((p) => p.x)) - m), y0: Math.max(0, Math.min(...P.map((p) => p.y)) - m),
    x1: Math.min(W, Math.max(...P.map((p) => p.x)) + m), y1: Math.min(H, Math.max(...P.map((p) => p.y)) + m) };
}

const POND_THEMES = [
  { id: 'pond', blocks: 'slab', tex: (t) => t.use === 'stone' || (t.use === 'floor' && /stone|cobble|slab/.test(t.id)), floor: 'water', water: ['#285f66', '#33717a', '#9cc3c6'], hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'] },
  { id: 'harbour', blocks: 'crate', tex: (t) => t.use === 'wood', floor: 'water', water: ['#1f3f5c', '#2b5470', '#9fb6c8'], hdri: ['outdoor-midday', 'overcast', 'urban'] },
  { id: 'swamp', blocks: 'stump', tex: (t) => t.use === 'wood' && /plank|rough|weathered|old|bark|worn/.test(t.id), floor: 'water', water: ['#2f3a22', '#3e4a2a', '#8a9478'], duckweed: true, hdri: ['overcast', 'morning-afternoon', 'sunset'] },
  { id: 'chasm', blocks: 'pillar', tex: (t) => t.use === 'stone' || (t.use === 'wall' && /sandstone|medieval|block|castle/.test(t.id)), floor: 'void', voidCol: ['#0d0b0a', '#211c18'], hdri: ['outdoor-midday', 'sunset', 'morning-afternoon'] },
  { id: 'space', blocks: 'plate', tex: (t) => t.use === 'metal' && !/rust/.test(t.id), floor: 'void', voidCol: ['#04050a', '#0c0f1a'], stars: true, hdri: ['studio', 'indoor'] },
  { id: 'canal', blocks: 'slab', tex: (t) => (t.use === 'floor' && /concrete|pav|granular|cement/.test(t.id)) || (t.use === 'wall' && /concrete/.test(t.id)), floor: 'water', water: ['#24342e', '#2f4540', '#8fa39c'], hdri: ['urban', 'overcast'] },
  { id: 'lagoon', blocks: 'slab', tex: (t) => (t.use === 'wall' && /sandstone/.test(t.id)) || (t.use === 'stone' && /sandstone|rock_tile|cobblestone_color|clean_pebbles/.test(t.id)), floor: 'water', water: ['#1d6f78', '#2a8a8e', '#b6dcd6'], hdri: ['outdoor-midday', 'morning-afternoon'] },
  { id: 'cave-lake', blocks: 'pillar', tex: (t) => t.use === 'terrain' && /rock|boulder|lichen/.test(t.id), floor: 'water', water: ['#13262c', '#1c343a', '#5f7c84'], hdri: ['indoor', 'overcast'] },
];
const STAR_METALS = [['brass', '#d9a93a', '#8a6a22'], ['gold', '#e8bf3c', '#94741c'], ['silver', '#d4d6d8', '#7c8086'], ['ivory', '#ece4cc', '#8a8270'], ['jade', '#5fae7f', '#2d5e40']];
const CUBE_BODIES = [['white', '#f1efe9'], ['cream', '#ece2c8'], ['pale-grey', '#d6d8da'], ['bone', '#e3dccb'], ['pale-sage', '#d9e0cf']];

export async function styleLook(style) {
  const sp = (pool, ids) => { const f = splitIds(`roll_cube_red_up|${pool}`, ids, 1); return (id) => f(id) === style.split; };
  const thOk = sp('theme', POND_THEMES.map((t) => t.id)), stOk = sp('star', STAR_METALS.map((t) => t[0])), cbOk = sp('cube', CUBE_BODIES.map((t) => t[0]));
  const themes = POND_THEMES.filter((t) => thOk(t.id));
  const rnd = style.rand;
  const th = themes[style.primaryCombo('rcu-theme', [themes.length])[0]];
  let texL = style.pool('tex', th.tex);
  if (!texL.length) texL = style.pool('tex', (t) => t.use === 'stone');
  const bt = K.pickOf(rnd, texL);
  let hdL = style.pool('hdri', (h) => th.hdri.includes(h.use));
  if (!hdL.length) hdL = style.pool('hdri');
  const hd = K.pickOf(rnd, hdL);
  const starR = rnd();
  const body = K.pickOf(rnd, CUBE_BODIES.filter((t) => cbOk(t[0])));
  const [T, sky] = await Promise.all([S3.loadTexture(bt.file), S3.loadSky(hd.sky)]);
  const J = Array.from({ length: 8 }, () => rnd());
  let face = S3.keepNamedHues(T.mean, [[2, 40]], 0.1, 0.32);
  face = S3.scaleTo(face, (th.blocks === 'plate' ? 0.2 : 0.17) + 0.2 * J[0]);
  const metals = STAR_METALS.filter((t) => stOk(t[0]));
  const okM = metals.filter((t) => S3.deltaE(S3.linOf(t[1]), face) >= 28);
  const star = okM.length ? okM[Math.floor(starR * okM.length)] : metals.slice().sort((a, b) => S3.deltaE(S3.linOf(b[1]), face) - S3.deltaE(S3.linOf(a[1]), face))[0];
  style.note(`theme:${th.id}`); style.note(`tex:${bt.id}`); style.note(`hdri:${hd.id}`); style.note(`star:${star[0]}`); style.note(`cube:${body[0]}`);
  const wv = th.water ? th.water.map((h, i) => S3.scaleTo(S3.linOf(h), S3.lum(S3.linOf(h)) * (0.85 + 0.3 * J[1]))) : null;
  const base = { ...RT.STUDIO_LIGHT, fill: { dir: [0.8, 0.45, 0.5], col: [0.26, 0.26, 0.29] } };
  const light = S3.hdriLight(hd, base, { albedo: face, total: 1.5, jitter: J[2] });
  return {
    th, face, T, water: wv, star: [S3.linOf(star[1]), S3.linOf(star[2])], body: S3.linOf(body[1]),
    light, sky: S3.skyFn(sky, 0.9 * S3.lum(light.sky) / 0.45), voidCol: th.voidCol ? th.voidCol.map(S3.linOf) : null,
    texWorld: 0.9 + 0.6 * J[3], stoneHW: th.blocks === 'stump' ? 0.43 + 0.04 * J[6] : 0.39 + 0.08 * J[6], keep: th.blocks === 'plate' ? 0.3 : 0.6, salt: Math.floor(J[4] * 997), rimDark: 0.8 + 0.15 * J[5],
    ids: { theme: th.id, tex: bt.id, hdri: hd.id, star: star[0], cube: body[0] },
  };
}

function stoneTexStyled(look, starUp, foot) {
  const T = look.T, face = look.face, tw = look.texWorld, tpm = T.n / tw, kc = Math.min(1.2, 0.28 / Math.max(1e-6, T.cv));
  const invL = 1 / Math.max(1e-6, S3.lum(T.mean)), S = new Float64Array(3), kind = look.th.blocks, keep = look.keep;
  const [BR, BD] = look.star, FP = 0.006;
  return (x, y, z, nx, ny, nz, s, out) => {
    const sx = s.k === 2 ? s.cx : s.cx, sz = s.cz;
    const lu0 = x - sx, lv0 = z - sz;
    const r = Math.floor(s.tone * 4), a = r === 0 ? lu0 : r === 1 ? lv0 : r === 2 ? -lu0 : -lv0, b = r === 0 ? lv0 : r === 1 ? -lu0 : r === 2 ? -lv0 : lu0;
    const u = ny > 0.7 ? a + s.tone * 3.7 : (Math.abs(nx) > Math.abs(nz) ? z : x) + s.tone * 2.1, v = ny > 0.7 ? b + s.tone * 1.3 : -y;
    S3.sampleTex(T, u * tpm, v * tpm, Math.log2(Math.max(1e-9, FP * tpm)), S);
    const Ls = S3.lum(S), t = Math.max(0.6, Math.min(1.45, 1 + kc * (Ls * invL - 1))) * (0.9 + 0.2 * s.tone);
    const Lf = S3.lum(face), Ln = Math.max(1e-6, Ls);
    for (let c = 0; c < 3; c++) out[c] = face[c] * t * (1 - keep) + S[c] / Ln * Lf * t * keep;
    if (ny < 0.7) { out[0] *= 0.88; out[1] *= 0.88; out[2] *= 0.88; }
    if (ny > 0.7) {
      if (kind === 'plate') {
        const e = 0.47 - Math.max(Math.abs(lu0), Math.abs(lv0));
        if (e < 0.045 && e > 0.03) { out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6; }
        for (const cu of [-0.39, 0.39]) for (const cv of [-0.39, 0.39]) {
          const d = Math.hypot(lu0 - cu, lv0 - cv);
          if (d < 0.022) { const k = 1.25 - 0.5 * d / 0.022; out[0] *= k; out[1] *= k; out[2] *= k; }
        }
      } else if (kind === 'stump') {
        const rr = Math.hypot(lu0, lv0), ring = 0.5 + 0.5 * Math.sin(rr * 95 + s.tone * 9 + 3 * RT.fbm(x * 6, z * 6, 2));
        const k = 0.88 + 0.16 * ring * (rr < 0.4 ? 1 : 0.4); out[0] *= k; out[1] *= k; out[2] *= k;
        if (rr > 0.43) { out[0] *= 0.62; out[1] *= 0.62; out[2] *= 0.62; }
      } else if (kind === 'crate') {
        const w = (r & 1) ? lu0 : lv0, seam = Math.abs(((w + 0.47) / 0.188) % 1);
        if (seam < 0.04 || seam > 0.96) { out[0] *= 0.55; out[1] *= 0.55; out[2] *= 0.55; }
      }
    }
    if (s.star && ny > 0.7) {
      const lu = x - sx, lv = z - sz;
      const u2 = (lu * starUp[1] - lv * starUp[0]) / 0.31, v2 = (lu * starUp[0] + lv * starUp[1]) / 0.31;
      const sd = starSigned(u2, v2) * 0.31, aa = 0.012;
      if (sd < aa) {
        const k = Math.max(0, Math.min(1, (aa - sd) / (2 * aa)));
        const rim = Math.max(0, Math.min(1, (sd + 0.03) / 0.02));
        const g = 0.85 + 0.3 * RT.fbm(x * 30, z * 30, 2);
        const col = [BR[0] * g, BR[1] * g, BR[2] * g];
        RT.mixInto(col, col, BD, look.rimDark * rim);
        RT.mixInto(out, out, col, k);
      }
    }
    if (foot && ny > 0.7) {
      const dx = Math.max(0, Math.abs(x - foot[0]) - HC), dz = Math.max(0, Math.abs(z - foot[1]) - HC);
      const k = 1 - 0.3 * Math.exp(-Math.hypot(dx, dz) / 0.045);
      out[0] *= k; out[1] *= k; out[2] *= k;
    }
  };
}
function cubeTexStyled(body) {
  return (x, y, z, nx, ny, nz, s, out) => {
    const p = [x - s.c[0], y - s.c[1], z - s.c[2]];
    let best = -1, bv = -Infinity, sg = 1;
    for (let a = 0; a < 3; a++) { const v = dot(p, s.ax[a]); if (Math.abs(v) > bv) { bv = Math.abs(v); best = a; sg = v >= 0 ? 1 : -1; } }
    const src = best === s.red[0] && sg === s.red[1] ? RED : body;
    const n = 0.97 + 0.03 * RT.vnoise(x * 50 + z * 13, y * 50);
    out[0] = src[0] * n; out[1] = src[1] * n; out[2] = src[2] * n;
  };
}
function floorStyled(look, eye) {
  const th = look.th, X0 = -G / 2 - 0.05, X1 = look.gw - G / 2 + 0.05, Z1 = look.gh - G / 2 + 0.05;
  if (th.floor === 'void') {
    const [A, B] = look.voidCol;
    return (x, z, fp, out) => {
      const n = RT.fbm(x * 0.4 + 3, z * 0.4 - 5, 3, fp);
      RT.mixInto(out, A, B, Math.max(0, Math.min(1, n * 1.2 - 0.1)));
      if (th.stars) { const h = RT.hash2(Math.floor(x * 9), Math.floor(z * 9)); if (h > 0.985) { const k = 0.5 + 6 * (h - 0.985) / 0.015; out[0] += 0.15 * k; out[1] += 0.15 * k; out[2] += 0.17 * k; } }
    };
  }
  const [W1, W2, W3] = look.water;
  return (x, z, fp, out) => {
    const n = RT.fbm(x * 0.55 + 4.1, z * 0.55 - 2.3, 3, fp);
    RT.mixInto(out, W1, W2, Math.max(0, Math.min(1, 0.15 + 1.1 * (n - 0.35))));
    const u = x * 0.8 + z * 0.6, w = -x * 0.6 + z * 0.8;
    const rip = RT.fbm(u * 3.2, w * 5.5, 3, fp * 3);
    const dx = x - eye[0], dy = WATER_Y - eye[1], dz = z - eye[2];
    const cs = -dy / Math.hypot(dx, dy, dz), fr = 0.06 + 1.1 * (1 - cs) * (1 - cs);
    RT.mixInto(out, out, W3, Math.max(0, Math.min(0.6, fr * (0.8 + 0.6 * (rip - 0.5)))));
    if (th.duckweed && (x < X0 || x > X1 || z < X0 || z > Z1)) {
      const d = RT.fbm(x * 2.2 + 9, z * 2.2 + 1, 3, fp * 2);
      if (d > 0.58) RT.mixInto(out, out, [0.12, 0.2, 0.04], Math.min(0.85, (d - 0.58) * 5));
    }
  };
}
function traceSceneStyled(m, pose, cam, look0) {
  const look = { ...look0, gw: gridW(m), gh: gridH(m) };
  const az = m.cam.az * Math.PI / 180;
  const starUp = [-Math.sin(az), -Math.cos(az)];
  const mats = [
    { c: look.face, ks: look.th.blocks === 'plate' ? 0.3 : 0.06, sh: look.th.blocks === 'plate' ? 40 : 14, tex: stoneTexStyled(look, starUp, pose && pose.rest ? [pose.c[0], pose.c[2]] : null) },
    { c: look.body, ks: 0.22, sh: 38, tex: cubeTexStyled(look.body) },
  ];
  const W = gridW(m), H = gridH(m), holes = new Set(m.holes.map(([c, r]) => c + r * W));
  const shapes = [], kind = look.th.blocks, SW = look.stoneHW;
  const bottom = STONE_BOTTOM;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (holes.has(c + r * W)) continue;
    const [x, z] = cellXZ(c, r);
    const jit = (RT.hash2(c * 7 + 3, r * 11 + m.cam.az) - 0.5) * 3;
    let s;
    if (kind === 'stump') s = RT.shape.cyl(c + r * W, 0, x, z, bottom, 0, SW, 0.02);
    else s = RT.shape.box(c + r * W, 0, x, bottom / 2, z, kind === 'plate' ? STONE + 0.01 : SW, -bottom / 2, kind === 'plate' ? STONE + 0.01 : SW, kind === 'plate' ? 0 : jit, kind === 'plate' ? 0.01 : 0.035);
    s.tone = RT.hash2(c * 13 + 1 + look.salt, r * 17 + 5);
    s.star = c === m.star[0] && r === m.star[1];
    shapes.push(s);
  }
  if (pose) {
    const s = RT.shape.obox(CUBE_ID, 1, pose.c, pose.ax, [HC, HC, HC], 0.06);
    s.red = pose.red; s.noAO = true;
    shapes.push(s);
  }
  const la = az - 0.75, lf = az + 1.1;
  const L = look.light;
  const light = { ...L, dir: [Math.sin(la) * 0.62, 1, Math.cos(la) * 0.62], soft: Math.max(0.04, Math.min(0.08, L.soft + 0.01)),
    fill: { dir: [Math.sin(lf) * 0.8, 0.45, Math.cos(lf) * 0.8], col: L.fill.col }, aoK: 1, contact: 0.28, contactH: 0.14 };
  const fl = look.th.floor === 'void' ? { ks: 0, sh: 1 } : { ks: 0.18, sh: 40 };
  return RT.makeScene({ cam, shapes, mats, light, env: { floorY: WATER_Y, floor: floorStyled(look, cam.eye), floorMat: fl, sky: look.sky } });
}
