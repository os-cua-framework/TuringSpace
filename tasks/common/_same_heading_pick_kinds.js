import { splitIds } from '../core/style.js';

const S = (k, parts) => parts.map((p) => {
  const q = { ...p };
  if (q.c) q.c = q.c.map((v) => v * k);
  if (q.h) q.h = q.h.map((v) => v * k);
  if (q.a) q.a = q.a.map((v) => v * k);
  if (q.b) q.b = q.b.map((v) => v * k);
  if (q.r) q.r *= k;
  if (q.bev) q.bev *= k;
  return q;
});
const sym = (f) => [-1, 1].flatMap(f);

function sofa() {
  const P = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push({ t: 'box', c: [sx * 0.33, 0.03, sz * 0.17], h: [0.025, 0.03, 0.025], mat: 'leg', bev: 0.006 });
  P.push({ t: 'box', c: [0, 0.15, 0], h: [0.38, 0.09, 0.22], mat: 'fabric', bev: 0.02 });
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.165, 0.28, 0.035], h: [0.16, 0.045, 0.18], mat: 'cushion', bev: 0.03 }]));
  P.push({ t: 'box', c: [0, 0.42, -0.175], h: [0.38, 0.2, 0.05], mat: 'fabric', bev: 0.03 });
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.165, 0.44, -0.105], h: [0.155, 0.12, 0.035], mat: 'cushion', bev: 0.03 }]));
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.35, 0.34, 0], h: [0.045, 0.1, 0.22], mat: 'fabric', bev: 0.03 }]));
  return P;
}
function cat() {
  const P = [];
  P.push({ t: 'ell', c: [0, 0.27, -0.02], h: [0.09, 0.085, 0.2], mat: 'fur' });
  P.push({ t: 'ell', c: [0, 0.29, 0.12], h: [0.075, 0.08, 0.07], mat: 'fur2' });
  P.push(...sym((sx) => [
    { t: 'cap', a: [sx * 0.045, 0.22, 0.12], b: [sx * 0.045, 0.025, 0.13], r: 0.026, mat: 'fur' },
    { t: 'cap', a: [sx * 0.05, 0.22, -0.15], b: [sx * 0.05, 0.025, -0.14], r: 0.028, mat: 'fur' },
  ]));
  P.push({ t: 'ell', c: [0, 0.4, 0.2], h: [0.075, 0.068, 0.07], mat: 'fur' });
  P.push({ t: 'ell', c: [0, 0.38, 0.26], h: [0.036, 0.028, 0.026], mat: 'fur2' });
  P.push(...sym((sx) => [{ t: 'ell', c: [sx * 0.045, 0.468, 0.188], h: [0.024, 0.036, 0.012], mat: 'fur' }]));
  P.push(...sym((sx) => [{ t: 'sph', c: [sx * 0.03, 0.415, 0.262], r: 0.013, mat: 'eye' }]));
  P.push({ t: 'sph', c: [0, 0.392, 0.287], r: 0.01, mat: 'nose' });
  P.push({ t: 'cap', a: [0, 0.3, -0.21], b: [0, 0.42, -0.3], r: 0.02, mat: 'fur' });
  P.push({ t: 'cap', a: [0, 0.42, -0.3], b: [0, 0.52, -0.26], r: 0.018, mat: 'fur' });
  return S(1.4, P);
}
function duck() {
  const P = [];
  P.push({ t: 'ell', c: [0, 0.17, -0.02], h: [0.14, 0.11, 0.2], mat: 'body' });
  P.push({ t: 'ell', c: [0, 0.24, -0.19], h: [0.06, 0.045, 0.06], mat: 'body' });
  P.push({ t: 'ell', c: [0, 0.3, 0.12], h: [0.06, 0.08, 0.06], mat: 'body' });
  P.push({ t: 'sph', c: [0, 0.4, 0.14], r: 0.085, mat: 'body' });
  P.push({ t: 'ell', c: [0, 0.385, 0.245], h: [0.045, 0.02, 0.055], mat: 'bill' });
  P.push(...sym((sx) => [{ t: 'sph', c: [sx * 0.05, 0.425, 0.195], r: 0.014, mat: 'black' }]));
  P.push(...sym((sx) => [{ t: 'ell', c: [sx * 0.125, 0.19, -0.03], h: [0.03, 0.065, 0.13], mat: 'wing' }]));
  P.push(...sym((sx) => [{ t: 'ell', c: [sx * 0.05, 0.012, 0.06], h: [0.035, 0.012, 0.05], mat: 'bill' }]));
  return S(1.3, P);
}
function tractor() {
  const P = [];
  P.push(...sym((sx) => [
    { t: 'cyl', a: [sx * 0.15, 0.15, -0.13], b: [sx * 0.23, 0.15, -0.13], r: 0.15, mat: 'tyre' },
    { t: 'cyl', a: [sx * 0.226, 0.15, -0.13], b: [sx * 0.236, 0.15, -0.13], r: 0.075, mat: 'hub' },
    { t: 'cyl', a: [sx * 0.11, 0.085, 0.24], b: [sx * 0.17, 0.085, 0.24], r: 0.085, mat: 'tyre' },
    { t: 'cyl', a: [sx * 0.166, 0.085, 0.24], b: [sx * 0.176, 0.085, 0.24], r: 0.045, mat: 'hub' },
    { t: 'box', c: [sx * 0.2, 0.33, -0.13], h: [0.06, 0.012, 0.17], mat: 'body', bev: 0.006 },
  ]));
  P.push({ t: 'box', c: [0, 0.17, 0.03], h: [0.09, 0.055, 0.26], mat: 'body', bev: 0.01 });
  P.push({ t: 'box', c: [0, 0.27, 0.18], h: [0.09, 0.07, 0.13], mat: 'body', bev: 0.02 });
  P.push({ t: 'box', c: [0, 0.26, 0.312], h: [0.075, 0.055, 0.006], mat: 'dark', bev: 0.003 });
  P.push(...sym((sx) => [{ t: 'sph', c: [sx * 0.06, 0.3, 0.316], r: 0.018, mat: 'lamp' }]));
  P.push({ t: 'box', c: [0, 0.27, -0.12], h: [0.14, 0.03, 0.12], mat: 'body', bev: 0.01 });
  P.push({ t: 'box', c: [0, 0.34, -0.15], h: [0.07, 0.04, 0.05], mat: 'dark', bev: 0.01 });
  for (const sx of [-1, 1]) for (const z of [-0.03, -0.22]) P.push({ t: 'box', c: [sx * 0.12, 0.43, z], h: [0.012, 0.13, 0.012], mat: 'dark', bev: 0.004 });
  P.push({ t: 'box', c: [0, 0.57, -0.125], h: [0.15, 0.015, 0.13], mat: 'body2', bev: 0.008 });
  P.push({ t: 'cyl', a: [0.05, 0.33, 0.24], b: [0.05, 0.48, 0.24], r: 0.016, mat: 'dark' });
  return S(1.05, P);
}
function train() {
  const P = [];
  P.push({ t: 'box', c: [0, 0.1, 0], h: [0.12, 0.035, 0.34], mat: 'dark', bev: 0.008 });
  for (const z of [0.21, 0.02, -0.17]) P.push(...sym((sx) => [{ t: 'cyl', a: [sx * 0.11, 0.075, z], b: [sx * 0.14, 0.075, z], r: 0.072, mat: 'wheel' }]));
  P.push({ t: 'cyl', a: [0, 0.24, -0.06], b: [0, 0.24, 0.3], r: 0.105, mat: 'body' });
  P.push({ t: 'cyl', a: [0, 0.24, 0.3], b: [0, 0.24, 0.335], r: 0.1, mat: 'dark' });
  P.push({ t: 'cyl', a: [0, 0.33, 0.24], b: [0, 0.45, 0.24], r: 0.032, mat: 'dark' });
  P.push({ t: 'cyl', a: [0, 0.45, 0.24], b: [0, 0.48, 0.24], r: 0.046, mat: 'dark' });
  P.push({ t: 'sph', c: [0, 0.34, 0.08], r: 0.045, mat: 'trim' });
  P.push({ t: 'box', c: [0, 0.31, -0.2], h: [0.13, 0.17, 0.1], mat: 'body2', bev: 0.01 });
  P.push({ t: 'box', c: [0, 0.495, -0.2], h: [0.15, 0.015, 0.125], mat: 'dark', bev: 0.006 });
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.132, 0.38, -0.2], h: [0.004, 0.05, 0.05], mat: 'glass', bev: 0.002 }]));
  P.push({ t: 'box', c: [0, 0.1, 0.355], h: [0.13, 0.03, 0.018], mat: 'trim', bev: 0.006 });
  P.push({ t: 'sph', c: [0, 0.33, 0.33], r: 0.028, mat: 'lamp' });
  return S(1.1, P);
}
function penguin() {
  const P = [];
  P.push({ t: 'ell', c: [0, 0.25, -0.01], h: [0.12, 0.21, 0.11], mat: 'black' });
  P.push({ t: 'ell', c: [0, 0.24, 0.03], h: [0.1, 0.18, 0.095], mat: 'white' });
  P.push({ t: 'sph', c: [0, 0.5, 0], r: 0.085, mat: 'black' });
  P.push({ t: 'ell', c: [0, 0.49, 0.045], h: [0.055, 0.05, 0.05], mat: 'white' });
  P.push({ t: 'ell', c: [0, 0.48, 0.105], h: [0.022, 0.018, 0.045], mat: 'beak' });
  P.push(...sym((sx) => [{ t: 'sph', c: [sx * 0.035, 0.515, 0.076], r: 0.011, mat: 'eye' }]));
  P.push(...sym((sx) => [{ t: 'ell', c: [sx * 0.125, 0.29, -0.01], h: [0.022, 0.12, 0.045], mat: 'black' }]));
  P.push(...sym((sx) => [{ t: 'ell', c: [sx * 0.05, 0.015, 0.06], h: [0.04, 0.015, 0.06], mat: 'beak' }]));
  return S(1.2, P);
}
function tank() {
  const P = [];
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.19, 0.075, 0], h: [0.05, 0.075, 0.31], mat: 'track', bev: 0.045 }]));
  P.push({ t: 'box', c: [0, 0.12, -0.01], h: [0.15, 0.055, 0.29], mat: 'body', bev: 0.015 });
  P.push({ t: 'ell', c: [0, 0.21, -0.05], h: [0.12, 0.055, 0.14], mat: 'body' });
  P.push({ t: 'cyl', a: [0.04, 0.26, -0.09], b: [0.04, 0.275, -0.09], r: 0.04, mat: 'dark' });
  P.push({ t: 'cyl', a: [0, 0.215, 0.07], b: [0, 0.225, 0.44], r: 0.02, mat: 'body' });
  P.push({ t: 'cyl', a: [0, 0.225, 0.42], b: [0, 0.226, 0.465], r: 0.028, mat: 'dark' });
  P.push(...sym((sx) => [{ t: 'box', c: [sx * 0.08, 0.15, -0.3], h: [0.03, 0.02, 0.012], mat: 'dark', bev: 0.004 }]));
  return P;
}
function plane() {
  const P = [];
  P.push({ t: 'ell', c: [0, 0.19, -0.01], h: [0.065, 0.065, 0.32], mat: 'body' });
  P.push({ t: 'sph', c: [0, 0.19, 0.31], r: 0.04, mat: 'trim' });
  P.push({ t: 'box', c: [0, 0.19, 0.345], h: [0.15, 0.014, 0.006], mat: 'dark', bev: 0.004 });
  P.push({ t: 'box', c: [0, 0.17, 0.05], h: [0.36, 0.012, 0.075], mat: 'body2', bev: 0.008 });
  P.push({ t: 'box', c: [0, 0.21, -0.27], h: [0.13, 0.009, 0.04], mat: 'body2', bev: 0.005 });
  P.push({ t: 'box', c: [0, 0.28, -0.29], h: [0.008, 0.075, 0.045], mat: 'body2', bev: 0.004 });
  P.push({ t: 'ell', c: [0, 0.245, 0.06], h: [0.04, 0.035, 0.075], mat: 'glass' });
  P.push(...sym((sx) => [
    { t: 'cap', a: [sx * 0.1, 0.16, 0.08], b: [sx * 0.1, 0.06, 0.08], r: 0.01, mat: 'dark' },
    { t: 'cyl', a: [sx * 0.085, 0.045, 0.08], b: [sx * 0.115, 0.045, 0.08], r: 0.045, mat: 'tyre' },
  ]));
  P.push({ t: 'cap', a: [0, 0.14, -0.27], b: [0, 0.05, -0.27], r: 0.008, mat: 'dark' });
  P.push({ t: 'sph', c: [0, 0.03, -0.27], r: 0.025, mat: 'tyre' });
  return P;
}

export const XMODELS = { sofa: sofa(), cat: cat(), duck: duck(), tractor: tractor(), train: train(), penguin: penguin(), tank: tank(), plane: plane() };
export const XCUE_Y = { sofa: 0.3, cat: 0.36, duck: 0.25, tractor: 0.25, train: 0.26, penguin: 0.35, tank: 0.15, plane: 0.19 };
export const XPALETTE = {
  chair: [['#a8774a', '#8a5d36', '#bf8f5f', '#b8473c'], ['#7b5236', '#5f3d26', '#946646', '#3f6f9f'], ['#c9a578', '#ad895d', '#dcbc92', '#4f7f4a'],
    ['#5a3b28', '#45291a', '#6e4a33', '#c9a227'], ['#b98b5e', '#9a6f45', '#d1a678', '#7a4f8f'], ['#3f3a36', '#2b2724', '#55504b', '#a8643a'],
    ['#d7c2a0', '#bfa985', '#e8d7b8', '#2e5e5a'], ['#8f5f3a', '#734a2b', '#a87550', '#5b6470']],
  car: [['#c8392f'], ['#2f6db5'], ['#e0a52a'], ['#3f8f5a'], ['#7a4fa3'], ['#d0662a'], ['#1f8f8f'], ['#b0b4ba'], ['#9a2f45'], ['#3a4a6b']],
  dog: [['#b07a45', '#f0e6d8'], ['#2d2a28', '#d8c8b0'], ['#d9c6a3', '#f3ece0'], ['#8a5a32', '#e8d7bf'], ['#6e6862', '#ece8e0'],
    ['#c98d4e', '#f4e2c8'], ['#3b3330', '#b9a48a'], ['#a0522d', '#f5deb3']],
  sofa: [['#6b7a8f', '#8a9ab0', '#3b2a1e'], ['#8f4a3a', '#b56a55', '#2b2018'], ['#4f6b4a', '#6d8a66', '#3a2a1c'], ['#c9b79c', '#dccbb0', '#5a4030'],
    ['#3b3f4a', '#565c6a', '#1e1e22'], ['#b08a3e', '#c9a45a', '#3a2a1c'], ['#7a4f6b', '#9a6b88', '#2b2018'], ['#2f5f6f', '#4a7f8f', '#2a2622']],
  cat: [['#d08a3e', '#f2d9b5', '#7fae3a'], ['#7d7b78', '#d8d4ce', '#d9b23a'], ['#2a2726', '#5a5552', '#c9c23a'], ['#e6dfd4', '#ffffff', '#4f8fcf'],
    ['#c9a77c', '#efe2cc', '#8fae3a'], ['#6b4a32', '#c9a882', '#d9a23a'], ['#a9a39a', '#f0ece4', '#5aa05a']],
  duck: [['#f2c63a', '#e0b030', '#ee8a2a'], ['#f2efe6', '#dcd8cc', '#ee8a2a'], ['#8a6a4a', '#6f553a', '#d9a33a'], ['#4f8fcf', '#3f7fbf', '#ee8a2a'],
    ['#5aa05a', '#4a8a4a', '#ee8a2a'], ['#e48fb0', '#d07898', '#ee8a2a'], ['#e8d27a', '#d4bc5e', '#d86a2a']],
  tractor: [['#3f8f3a', '#e8c13a'], ['#c0392b', '#e8e2d0'], ['#2f5fa5', '#d8d8d8'], ['#e0b02a', '#3a3a3a'], ['#d8722a', '#3a3a3a'], ['#6f7f3a', '#d8d0b0'], ['#8a8f96', '#c0392b']],
  train: [['#2f5f3f', '#8a2a2a'], ['#1f3f7f', '#c0392b'], ['#8a2a2a', '#2f2f2f'], ['#2a2a2a', '#c0392b'], ['#3f7f5f', '#e0b02a'], ['#5a3f7a', '#d8c8a0'], ['#b04a2a', '#2f4f6f']],
  penguin: [['#1f2226', '#f4f2ec', '#e89a2a'], ['#2a2f3a', '#efece4', '#f0b030'], ['#24262a', '#fbfaf6', '#d87a2a'], ['#33363d', '#f2efe6', '#e8a83a']],
  tank: [['#5f6b3a'], ['#b8a070'], ['#6f757c'], ['#3f5f3a'], ['#4f5f6f'], ['#6b5a3a'], ['#7a7f5a']],
  plane: [['#c0392b', '#e8e2d0'], ['#e0b02a', '#2f5fa5'], ['#2f6db5', '#e8e8e8'], ['#e8e8e8', '#c0392b'], ['#3f8f5a', '#e0b02a'], ['#7a4fa3', '#e8e2d0'], ['#d0662a', '#3a4a6b']],
};

export const ALL_KINDS = ['chair', 'car', 'dog', ...Object.keys(XMODELS)];
const KIND_SPLIT = splitIds('same_heading_pick_kind', ALL_KINDS, 4);
export const kindsFor = (split) => ALL_KINDS.filter((k) => KIND_SPLIT(k) === split);
export const kindSplit = (k) => KIND_SPLIT(k);
const colSplit = Object.fromEntries(Object.entries(XPALETTE).map(([k, v]) => [k, splitIds(`same_heading_pick_col_${k}`, v.map((_, i) => String(i)), 3)]));
export const colorsFor = (kind, split) => XPALETTE[kind].map((_, i) => i).filter((i) => colSplit[kind](String(i)) === split);
