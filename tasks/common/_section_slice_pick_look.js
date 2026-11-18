import { relMaterial, material, texPool, samp } from './_surface_tex.js';
import { splitIds } from '../core/style.js';

const PANES = {
  orange: { plane: [238, 126, 40], cut: [196, 78, 18], fill: [247, 196, 150], edge: [178, 72, 20], hue: 25 },
  blue: { plane: [52, 120, 230], cut: [24, 72, 170], fill: [176, 204, 245], edge: [28, 74, 160], hue: 220 },
  green: { plane: [46, 170, 90], cut: [20, 110, 50], fill: [176, 226, 190], edge: [24, 110, 52], hue: 140 },
  magenta: { plane: [210, 60, 170], cut: [150, 24, 120], fill: [240, 186, 226], edge: [150, 30, 120], hue: 315 },
  teal: { plane: [30, 165, 180], cut: [10, 105, 120], fill: [168, 226, 232], edge: [12, 104, 118], hue: 187 },
  violet: { plane: [130, 80, 220], cut: [86, 40, 170], fill: [210, 194, 245], edge: [88, 46, 166], hue: 265 },
  amber: { plane: [226, 176, 28], cut: [150, 108, 0], fill: [248, 226, 156], edge: [146, 104, 8], hue: 45 },
};
const PANE_IDS = Object.keys(PANES);
const paneSplit = splitIds('section_slice_pick|pane', PANE_IDS, 1);
const SOLIDS = [
  ['plaster', [214, 205, 188], null], ['marble', [228, 226, 222], null], ['granite', [176, 176, 178], null],
  ['sandstone', [212, 186, 146], 38], ['terracotta', [198, 132, 100], 18], ['birch', [214, 184, 140], 35],
  ['slate', [150, 160, 172], 212], ['jade', [164, 198, 172], 135], ['concrete', [184, 182, 176], null],
  ['aluminium', [198, 202, 208], null], ['ivory', [232, 222, 196], 45], ['clay', [186, 168, 150], null],
];
const finishSplit = splitIds('section_slice_pick|finish', SOLIDS.map((x) => x[0]), 3);
const LIGHTS = [[-0.45, 0.8, 0.42], [0.45, 0.8, 0.42], [-0.25, 0.9, 0.35], [0.3, 0.75, 0.55]];
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };

export async function buildSectionLook(style) {
  const rnd = style.rand;
  const panes = PANE_IDS.filter((p) => paneSplit(p) === style.split);
  const pats = texPool(style, ['stone', 'wall', 'floor', 'metal'], /marble|plaster|concrete|stone|sandstone|granular|rock|metal|cement/, /brick|tile|plank|wood|cobble|pebble|corrugated|grid|grate|shutter|block|slab|paving|hexagon|pattern|patern|crack|roof|wall_0/);
  const finishes = SOLIDS.filter((x) => finishSplit(x[0]) === style.split);
  const [pi, si, ti] = style.primaryCombo('pane-solid-pattern', [panes.length, finishes.length, pats.length]);
  const pane = PANES[panes[pi]];
  let S = finishes[si];
  for (let k = 1; k < finishes.length && S[2] !== null && hueDist(S[2], pane.hue) < 60; k++) S = finishes[(si + k) % finishes.length];
  const pat = pats[ti];
  style.note(`pane:${panes[pi]}`); style.note(`solid:${S[0]}`); style.note(`tex:${pat.id}`);
  const T = await relMaterial(pat, 1.6, { cv: 0.09, lo: 0.82, hi: 1.18 }, 256);
  const base = S[1], o = rnd() * 10;
  const solid = (x, y, z, n, fp, out) => {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]), tp = fp * T.tpu;
    const g = ay >= ax && ay >= az ? samp(T, (x + o) * T.tpu, (z + o) * T.tpu, tp) : ax >= az ? samp(T, (z + o) * T.tpu, (y + o) * T.tpu, tp) : samp(T, (x + o) * T.tpu, (y + o) * T.tpu, tp);
    out[0] = base[0] * g; out[1] = base[1] * g; out[2] = base[2] * g;
  };
  let floor = null;
  if (rnd() < 0.7) {
    const tables = texPool(style, ['wood', 'fabric', 'flat2d', 'stone', 'floor'], /./, /cobble|pebble|rock|gravel|asphalt|brick/);
    const tb = tables[Math.floor(rnd() * tables.length)];
    style.note(`tex:${tb.id}`);
    const F = await material(tb, 2.4, { lum: 200 + rnd() * 30, cv: 0.12, sat: 0.3 }, 256);
    floor = (x, z, fp, out) => samp(F, x * F.tpu, z * F.tpu, fp * F.tpu, out);
  }
  const DEF = (x, z, fp, out) => { out[0] = 240; out[1] = 243; out[2] = 247; };
  return {
    plane: pane.plane, cut: pane.cut, fill: pane.fill, edge: pane.edge, ink: [52, 58, 66],
    light: unit(LIGHTS[Math.floor(rnd() * LIGHTS.length)]), solid, floor: floor || DEF,
    cardsOnTop: rnd() < 0.5,
  };
}
