import { material, texPool, sRGB, clamp } from './_surface_tex.js';
import * as S3 from './_style3d.js';

const L2 = (v) => Math.pow(clamp(v, 0, 255) / 255, 2.2);
const linS = (c) => c.map(L2);
const pick = (rnd, l) => l[Math.floor(rnd() * l.length)];
const FAMS = [
  ['red', [214, 52, 46], 3], ['blue', [44, 104, 196], 215], ['green', [52, 150, 84], 140], ['orange', [240, 132, 36], 28],
  ['yellow', [236, 190, 40], 46], ['purple', [130, 80, 190], 268], ['teal', [30, 150, 160], 185], ['pink', [226, 96, 150], 330],
];
const BANDS = [[246, 240, 228], [248, 214, 72], [40, 58, 110], [246, 244, 236], [30, 30, 32]];
const BOOKS = [[132, 34, 38], [34, 54, 104], [40, 94, 64], [196, 150, 52], [30, 120, 128], [110, 60, 110], [90, 92, 98],
  [168, 92, 40], [60, 70, 40], [200, 190, 160], [24, 26, 30], [92, 120, 160], [150, 40, 80], [120, 96, 70]];
const hd = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function meanOf(T) { const a = T.lv[T.lv.length - 1], n = a.length / 3, m = [0, 0, 0]; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m[c] += a[i * 3 + c] / n; return m; }
function grainAlongV(T) {
  const l = Math.min(T.lv.length - 1, 2), a = T.lv[l], s = T.sizes[l];
  let gx = 0, gy = 0;
  const L = (x, y) => { const i = (((y + s) % s) * s + ((x + s) % s)) * 3; return a[i] + a[i + 1] + a[i + 2]; };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { gx += (L(x + 1, y) - L(x, y)) ** 2; gy += (L(x, y + 1) - L(x, y)) ** 2; }
  return gx > gy;
}
function linearize(T) { return { ...T, lv: T.lv.map((a) => Float32Array.from(a, (v) => L2(v))) }; }
function sampLin(T, a, b, tpp, out) {
  const l = tpp > 1 ? Math.min(T.lv.length - 1, Math.round(Math.log2(tpp))) : 0;
  const s = T.sizes[l], A = T.lv[l], m = s - 1, k = 1 / (1 << l);
  const x = a * k - 0.5, y = b * k - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r0 = (y0 & m) * s, r1 = ((y0 + 1) & m) * s, c0 = x0 & m, c1 = (x0 + 1) & m;
  const i00 = (r0 + c0) * 3, i10 = (r0 + c1) * 3, i01 = (r1 + c0) * 3, i11 = (r1 + c1) * 3;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let c = 0; c < 3; c++) out[c] = A[i00 + c] * w00 + A[i10 + c] * w10 + A[i01 + c] * w01 + A[i11 + c] * w11;
  return out;
}

function woodMatFrom(T, swap) {
  return (P, seed) => {
    const off = (seed % 50) * 0.37, endK = 0.82;
    return {
      c: T.meanLin, ks: 0.06, sh: 12,
      tex(x, y, z, nx, ny, nz, p, out, fp) {
        const q0 = x - P.O[0], q1 = y - P.O[1], q2 = z - P.O[2];
        const s = q0 * P.u[0] + q1 * P.u[1] + q2 * P.u[2], t = q0 * P.c[0] + q1 * P.c[1] + q2 * P.c[2], h = q0 * P.n[0] + q1 * P.n[1] + q2 * P.n[2];
        const nu = Math.abs(nx * P.u[0] + ny * P.u[1] + nz * P.u[2]);
        const a = s + off, b = (nu > 0.7 ? h * 3 : t) + off;
        if (swap) sampLin(T, b * T.tpu, a * T.tpu, (fp || 0.002) * T.tpu, out); else sampLin(T, a * T.tpu, b * T.tpu, (fp || 0.002) * T.tpu, out);
        if (nu > 0.7) { out[0] *= endK; out[1] *= endK; out[2] *= endK; }
      },
    };
  };
}

export async function buildSlopeLook(style) {
  const rnd = style.rand;
  const tables = texPool(style, ['wood', 'fabric', 'flat2d', 'stone', 'floor'], /wood_table|veneer|oak|fine_grained|rosewood|plywood|kitchen|linen|hessian|cotton|jersey|wool|melange|corduroy|terlenka|teddy|leather|marble|plaster|concrete|cement|granular|terrazzo|interior|denim/, /plank|brick|cobble|pebble|rock|gravel|tile|velour|jacquard|check|gingham|paving|pavement|hexagon|pattern|patern|painted/);
  const hdris = style.pool('hdri', (h) => h.use !== 'sunset');
  const woods = texPool(style, ['wood'], /./, /plank|peeling|weathered|dirt|herringbone|deck|grey|parquet|worn|dark/);
  const [ti, hi] = style.primaryCombo('table-hdri', [tables.length, hdris.length]);
  const tb = tables[ti], h = hdris[hi];
  style.note(`tex:${tb.id}`); style.note(`hdri:${h.id}`);
  const w0 = woods[Math.floor(rnd() * woods.length)];
  let w1 = woods[Math.floor(rnd() * woods.length)];
  for (let k = 0; k < 6 && w1.id === w0.id && woods.length > 1; k++) w1 = woods[Math.floor(rnd() * woods.length)];
  style.note(`tex:${w0.id}`); style.note(`tex:${w1.id}`);
  const plankT = await Promise.all([w0, w1].map((w, i) => material(w, 0.55, { lum: 196 - i * 14 + rnd() * 18, cv: 0.2, sat: 0.55 }, 256)));
  const woodMat = plankT.map((T) => { const sw = grainAlongV(T); const L = linearize(T); L.meanLin = linS(meanOf(T)); return woodMatFrom(L, sw); });
  const woodTable = tb.use === 'wood';
  const tableT = await material(tb, woodTable ? 1.2 : 0.9, { lum: woodTable ? 105 + rnd() * 35 : 168 + rnd() * 45, cv: 0.12, sat: woodTable ? 0.5 : 0.22 }, 256);
  const tableLin = linearize(tableT), tMean = meanOf(tableT);
  const floor = { color(x, z, fp, out) { sampLin(tableLin, x * tableLin.tpu / 1, z * tableLin.tpu, Math.max(1e-6, fp) * tableLin.tpu, out); } };
  let fams = FAMS.slice();
  for (let i = fams.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fams[i], fams[j]] = [fams[j], fams[i]]; }
  const chosen = [];
  for (const f of fams) if (chosen.length < 3 && chosen.every((c) => hd(c[2], f[2]) >= 70)) chosen.push(f);
  const [fb, fc, fw] = chosen;
  const band = (avoid) => { const opts = BANDS.filter((b) => Math.abs((b[0] + b[1] + b[2]) - (avoid[0] + avoid[1] + avoid[2])) > 150); return pick(rnd, opts.length ? opts : BANDS); };
  const rep4 = (o) => [o, o, o, o];
  const STY = {
    ball: rep4({ c: fb[1], band: band(fb[1]) }), can: rep4({ c: fc[1], band: band(fc[1]) }), cart: rep4({ c: fw[1] }),
    wheel: rep4({ hub: pick(rnd, [[250, 196, 40], [232, 232, 226], [218, 62, 52], [70, 140, 220], [60, 160, 90], [40, 40, 44]]) }),
    box: rep4({ c: pick(rnd, [[132, 88, 184], [36, 160, 168], [226, 96, 150], [120, 124, 132], [200, 170, 60], [90, 130, 70]]) }),
  };
  style.note(`toys:${fb[0]}/${fc[0]}/${fw[0]}`);
  const ballKind = pick(rnd, ['band', 'twotone', 'stripes']), canKind = pick(rnd, ['band', 'double', 'rings']);
  const ballMat = (sty, C, bax) => {
    const base = linS(sty.c), bd = linS(sty.band);
    return { c: base, ks: 0.28, sh: 30, tex(x, y, z, nx, ny, nz, p, out) {
      const d = nx * bax[0] + ny * bax[1] + nz * bax[2];
      const on = ballKind === 'band' ? Math.abs(d) < 0.2 : ballKind === 'twotone' ? d > 0 : Math.abs(Math.abs(d) - 0.45) < 0.12;
      const src = on ? bd : base; out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
    } };
  };
  const labelMat = (sty, C, a, len) => {
    const body = linS(sty.c), bd = linS(sty.band), ink = linS([30, 26, 24]);
    return { c: body, ks: 0.18, sh: 24, tex(x, y, z, nx, ny, nz, p, out) {
      const v = Math.abs(((x - C[0]) * a[0] + (y - C[1]) * a[1] + (z - C[2]) * a[2]) / len);
      let src = body;
      if (canKind === 'band') src = v < 0.15 ? bd : v < 0.18 ? ink : body;
      else if (canKind === 'double') src = (v > 0.08 && v < 0.18) || (v > 0.28 && v < 0.36) ? bd : body;
      else src = v > 0.36 && v < 0.41 ? bd : body;
      out[0] = src[0]; out[1] = src[1]; out[2] = src[2];
    } };
  };
  const bk = BOOKS.slice();
  for (let i = bk.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bk[i], bk[j]] = [bk[j], bk[i]]; }
  const bookCols = bk.slice(0, 7);
  const jit = rnd();
  const light = (base) => S3.hdriLight(h, base, { albedo: linS(tMean), total: 1.43, jitter: jit });
  const sky = S3.scaleTo(S3.safeTint(h.zenith && h.zenith.length ? h.zenith : [0.6, 0.65, 0.75], { maxSat: 0.25 }), 0.8), gnd = linS(tMean).map((v) => v * 0.7);
  const env = (dx, dy, dz, out) => { const k = clamp(0.5 + dy * 1.8, 0, 1); for (let c = 0; c < 3; c++) out[c] = gnd[c] + (sky[c] - gnd[c]) * k; };
  return { STY, ballMat, labelMat, woodMat, bookCols, floor, light, env };
}
