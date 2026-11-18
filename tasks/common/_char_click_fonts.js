import { splitIds } from '../core/style.js';

const F = {"NS": "SCB Noto Sans SC", "NSB": "SCB Noto Sans SC Bold", "SER": "SCB Noto Serif SC", "KL": "SCB ZCOOL KuaiLe", "HY": "SCB ZCOOL HuangYou", "MSZ": "SCB Ma Shan Zheng", "LC": "SCB Long Cang", "ZMX": "SCB Zhi Mang Xing", "LJ": "SCB Liu Jian Mao Cao"};
const CLUSTER = { NS: 'noto-sans', NSB: 'noto-sans', SER: 'noto-serif', KL: 'zcool-kuaile', HY: 'zcool-huangyou', MSZ: 'ma-shan-zheng', LC: 'long-cang', ZMX: 'zhi-mang-xing', LJ: 'liu-jian-mao-cao' };
const LATIN = ['NS', 'NSB', 'SER', 'KL', 'HY', 'LC'];
export const fontSplit = splitIds('font_family', [...new Set(Object.values(CLUSTER))], 2);
export const familySplit = (family) => fontSplit(CLUSTER[Object.keys(F).find((k) => F[k] === family)]);
export function extFonts(split) {
  return LATIN.filter((k) => fontSplit(CLUSTER[k]) === split).map((k) => F[k]);
}
export const SIZE_K = { 'SCB Long Cang': 1.35 };

const EN_MIRROR_PAIRS = {"NS": "FGRBDKaefkr", "NSB": "Fkr", "SER": "FGRBCDKaefkr", "KL": "FGRhr", "HY": "FRKk", "LC": "FGRDKfghkr"};
export function mirrorPairs(fonts) {
  const out = new Map();
  const fam = new Set(fonts);
  for (const [k, chars] of Object.entries(EN_MIRROR_PAIRS)) {
    if (!fam.has(F[k])) continue;
    for (const c of chars) out.set(c, [...(out.get(c) || []), F[k]]);
  }
  return out;
}

export const INK_EXT = { en: {"SCB Noto Sans SC": [-0.291, 0.324, -0.434, 0.398], "SCB Noto Sans SC Bold": [-0.228, 0.301, -0.423, 0.385], "SCB Noto Serif SC": [-0.342, 0.376, -0.445, 0.402], "SCB ZCOOL KuaiLe": [-0.339, 0.356, -0.35, 0.391], "SCB ZCOOL HuangYou": [-0.198, 0.208, -0.344, 0.394], "SCB Long Cang": [-0.189, 0.264, -0.262, 0.523]} };

export const LOOKALIKE_EXT = ['7T', 'LV', 'BE', '4X', '39', '8S', '68'];
