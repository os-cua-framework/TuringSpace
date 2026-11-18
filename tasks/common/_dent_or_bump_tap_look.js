import { relMaterial, texPool, S2L, clamp, lumL, sRGB } from './_surface_tex.js';
import { splitIds } from '../core/style.js';

const lin = (hex) => sRGB(hex).map((v) => S2L[v]);
const PLATES = [
  ['pewter', '#bab3a6', 0.4, 30], ['aluminium', '#c4c8cc', 0.5, 40], ['steel', '#aeb2b6', 0.45, 36], ['brass', '#c9a95f', 0.5, 34],
  ['copper', '#c48a62', 0.5, 34], ['titanium', '#a7a9ad', 0.35, 26], ['zinc', '#b8bcc0', 0.3, 20], ['nickel', '#c7c3b8', 0.55, 44],
  ['paint-sage', '#9fb39b', 0.22, 22], ['paint-blue', '#8fa7c4', 0.22, 22], ['paint-cream', '#d9cfb5', 0.18, 20], ['paint-mint', '#a9cdbf', 0.22, 22],
  ['paint-sand', '#cdb48f', 0.18, 20], ['paint-grey', '#b9bcc2', 0.22, 22], ['paint-yellow', '#d8c06a', 0.22, 22], ['paint-lilac', '#b9b2c9', 0.2, 20],
  ['plaster', '#e2ddd2', 0.05, 8], ['clay', '#c99a78', 0.06, 8], ['card', '#c7a77c', 0.04, 6], ['slate', '#a9adb1', 0.1, 12],
  ['sandstone', '#d6c29d', 0.05, 8], ['bone', '#e6dfcc', 0.08, 10],
];
const plateSplit = splitIds('dent_or_bump_tap|plate', PLATES.map((p) => p[0]), 3);
const KEYS = [[3.62, 3.06, 2.3], [3.5, 3.12, 2.62], [3.3, 3.2, 3.0], [3.12, 3.18, 3.42], [3.45, 3.12, 2.7]];
const keySplit = splitIds('dent_or_bump_tap|key', KEYS.map((_, i) => `k${i}`), 2);
const AMBS = [[0.32, 0.34, 0.4], [0.34, 0.34, 0.34], [0.36, 0.33, 0.3], [0.3, 0.34, 0.42]];
const HEADS = ['#c8322b', '#e0b52a', '#2f5fc4', '#eeeeea', '#262626', '#2e9a4a'];
const RODS = ['#8c7a58', '#9aa0a6', '#2a2a2a', '#b08d57'];
const GRAIN_RE = /plaster|concrete|cement|leather|sandstone_cracks|clay|granular|scuffed|dirty_concrete|painted_concrete|rusty_metal|rust_coarse|snow|sand_01/;
const GRAIN_SKIP = /tile|plank|brick|wood|floor_pattern|patern|paving|hexagon|cobble|pebble|corrugated|grid|grate|shutter|block|slab|roof|fabric|denim|jacquard|check|herringbone|riverbed|rock|gravel|cracked|asphalt|stone_wall|rustic|wall_00|brushed/;

const lumOf = (c) => lumL(c[0], c[1], c[2]);
export async function buildDentLook(style) {
  const plates = PLATES.filter((p) => plateSplit(p[0]) === style.split);
  const grains = texPool(style, ['floor', 'wall', 'flat2d', 'terrain', 'metal', 'stone'], GRAIN_RE, GRAIN_SKIP);
  const keys = KEYS.filter((_, i) => keySplit(`k${i}`) === style.split);
  const [pi, gi, ki] = style.primaryCombo('plate-grain-key', [plates.length, grains.length, keys.length]);
  const P = plates[pi], gr = grains[gi], rnd = style.rand;
  style.note(`plate:${P[0]}`); style.note(`tex:${gr.id}`);
  const T = await relMaterial(gr, 2.6 + rnd() * 1.6, { cv: 0.022, lo: 0.96, hi: 1.04 }, 256);
  const base = lin(P[1]), shift = rnd() * 50;
  const albedo = (x, z, out) => {
    const r = T.lv[0], n = T.n, u = (x + shift) * T.tpu, v = (z - shift) * T.tpu;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, m = n - 1;
    const a = r[(y0 & m) * n + (x0 & m)], b = r[(y0 & m) * n + ((x0 + 1) & m)], c = r[((y0 + 1) & m) * n + (x0 & m)], d = r[((y0 + 1) & m) * n + ((x0 + 1) & m)];
    const g = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    out[0] = base[0] * g; out[1] = base[1] * g; out[2] = base[2] * g;
  };
  const kj = 0.94 + 0.12 * rnd(), K0 = keys[ki], kl = lumOf(K0);
  const key = K0.map((v) => v * 3.16 / kl * kj);
  const A0 = AMBS[Math.floor(rnd() * AMBS.length)], amb = A0.map((v) => v * clamp(0.34 / lumOf(A0), 0.8, 1.2) * (0.9 + 0.15 * rnd()));
  const match = rnd() < 0.3;
  const head = match ? ['#5a2a1c', '#3a3330', '#7a5a2a'][Math.floor(rnd() * 3)] : HEADS[Math.floor(rnd() * HEADS.length)];
  const rod = match ? ['#d2b07a', '#c49a62', '#e0c48e'][Math.floor(rnd() * 3)] : RODS[Math.floor(rnd() * RODS.length)];
  style.note(`key:${ki}`); style.note(`lamp:${head}/${rod}`);
  return {
    albedo, metal: base, metal2: base, ks: P[2], shin: P[3], key, amb,
    head: lin(head), rod: lin(rod), bulb: key.map((v, i) => v * [2.8, 2.0, 0.65][i]),
  };
}
