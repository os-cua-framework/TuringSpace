import { splitIds } from './style.js';
import { loadImage } from './assets.js';

export const BOARD_THEMES = [
  { id: 'paper', board: '#efe9dc', card: '#fbf8f1', empty: '#e6dfcf', line: '#d8cfbd', ink: '#6b5f4f', inkLit: '#2f78c4', accentA: '#3f8f5a', accentB: '#c0503f', label: '#ffffff', tex: 'multiply', texAlpha: 0.22, radius: 2 },
  { id: 'blueprint', board: '#1f4e79', card: '#24598a', empty: '#1c4a73', line: '#3a73a8', ink: '#e8f1fb', inkLit: '#ffd166', accentA: '#8fd18f', accentB: '#ff9d7a', label: '#0b2741', tex: 'soft-light', texAlpha: 0.35, radius: 0 },
  { id: 'chalkboard', board: '#2e3b32', card: '#34443a', empty: '#2a362e', line: '#4a5c50', ink: '#e9efe6', inkLit: '#ffe58a', accentA: '#9fd36b', accentB: '#f2a07b', label: '#1d2620', tex: 'soft-light', texAlpha: 0.4, radius: 3 },
  { id: 'whiteboard', board: '#f4f6f8', card: '#ffffff', empty: '#eceff3', line: '#c9d1da', ink: '#2b4a8a', inkLit: '#b86a00', accentA: '#1f9d55', accentB: '#d64545', label: '#ffffff', tex: 'multiply', texAlpha: 0.12, radius: 6 },
  { id: 'night', board: '#141821', card: '#1d2330', empty: '#171c27', line: '#2c3446', ink: '#9fb4d8', inkLit: '#ffcc66', accentA: '#38c172', accentB: '#ef5753', label: '#0d1017', tex: 'soft-light', texAlpha: 0.3, radius: 4 },
  { id: 'desk', board: '#8a6440', card: '#efe2c8', empty: '#d9c7a4', line: '#b89a6e', ink: '#5a3e22', inkLit: '#1f7fd1', accentA: '#3c8d4f', accentB: '#b5432f', label: '#ffffff', tex: 'multiply', texAlpha: 0.3, radius: 3, shadow: true },
  { id: 'pastel', board: '#f6eef7', card: '#fffafd', empty: '#efe3f0', line: '#e2cfe4', ink: '#7a6aa8', inkLit: '#2a9d8f', accentA: '#2f8f62', accentB: '#c44d68', label: '#ffffff', tex: 'multiply', texAlpha: 0.14, radius: 8 },
  { id: 'newsprint', board: '#e9e6df', card: '#f7f5f0', empty: '#dcd8cf', line: '#bdb8ad', ink: '#222222', inkLit: '#c0392b', accentA: '#2f6f4f', accentB: '#8f2d2d', label: '#ffffff', tex: 'multiply', texAlpha: 0.25, radius: 0 },
  { id: 'terminal', board: '#0f1a12', card: '#132317', empty: '#0c160f', line: '#1f3a25', ink: '#7fe39a', inkLit: '#f4f1a7', accentA: '#e8e36b', accentB: '#ff7b72', label: '#0f1a12', tex: 'soft-light', texAlpha: 0.25, radius: 2 },
  { id: 'cardboard', board: '#c9a978', card: '#e8d4ae', empty: '#d5bd92', line: '#b4935f', ink: '#6e4b23', inkLit: '#1d6fb8', accentA: '#3b7029', accentB: '#a8432f', label: '#ffffff', tex: 'multiply', texAlpha: 0.32, radius: 4, shadow: true },
  { id: 'slate', board: '#3b4147', card: '#4a5158', empty: '#363b41', line: '#5d656e', ink: '#e6e9ec', inkLit: '#ffd166', accentA: '#7fd18b', accentB: '#ff8f80', label: '#1e2227', tex: 'soft-light', texAlpha: 0.35, radius: 3 },
  { id: 'graph_paper', board: '#eef3f6', card: '#fbfdfe', empty: '#e3ebf0', line: '#a9c3d6', ink: '#33506b', inkLit: '#d9822b', accentA: '#22894f', accentB: '#cc3d3d', label: '#ffffff', tex: 'multiply', texAlpha: 0.1, radius: 0 },
  { id: 'cork', board: '#a87b4f', card: '#e9d9bd', empty: '#cfb48c', line: '#9a7148', ink: '#4b3622', inkLit: '#1f6fbf', accentA: '#2f7d3f', accentB: '#b23a2a', label: '#ffffff', tex: 'multiply', texAlpha: 0.35, radius: 4, shadow: true },
  { id: 'ceramic', board: '#dfe6ea', card: '#f7fafb', empty: '#e8eef1', line: '#b9c7cf', ink: '#1f4f8f', inkLit: '#c77700', accentA: '#1d8a52', accentB: '#c83a3a', label: '#ffffff', tex: 'multiply', texAlpha: 0.12, radius: 5 },
  { id: 'kraft', board: '#b8946a', card: '#d9bf98', empty: '#c7a87f', line: '#a5835b', ink: '#3d2b1a', inkLit: '#1665b0', accentA: '#2f6f37', accentB: '#a6322a', label: '#ffffff', tex: 'multiply', texAlpha: 0.3, radius: 2 },
];
const themeSplit = splitIds('theme2d', BOARD_THEMES.map((t) => t.id), 4);
for (const t of BOARD_THEMES) t.split = themeSplit(t.id);
const TEX_USES = new Set(['flat2d', 'wall', 'floor']);

export async function mountBoardTheme(env) {
  const st = env.style;
  if (!st) return null;
  const themes = BOARD_THEMES.filter((t) => t.split === st.split);
  const texes = st.pool('tex', (t) => TEX_USES.has(t.use));
  const [ti, xi] = st.primaryCombo('theme2d', [themes.length, Math.max(1, texes.length)]);
  const theme = { ...themes[ti] };
  const tex = texes[xi] || null;
  st.note(`theme2d:${theme.id}`);
  if (tex) st.note(`tex:${tex.id}`);
  theme.texImg = tex ? await loadImage('assets/' + tex.file) : null;
  theme.texOffset = [Math.floor(st.rand() * 512), Math.floor(st.rand() * 512)];
  theme.texScale = 0.35 + st.rand() * 0.3;
  const hue = (st.rand() * 2 - 1) * 24;
  const shifted = { ...theme };
  for (const k of COLOR_KEYS) shifted[k] = shiftHue(theme[k], hue);
  const ok = READ_PAIRS.every(([a, b]) => contrast(shifted[a], shifted[b]) >= 3);
  if (ok) Object.assign(theme, Object.fromEntries(COLOR_KEYS.map((k) => [k, shifted[k]])));
  theme.hue = ok ? Math.round(hue) : 0;
  theme.strokeK = 0.82 + st.rand() * 0.36;
  theme.radius = Math.round(theme.radius * (0.5 + st.rand()) + (theme.radius ? 0 : st.rand() < 0.4 ? 3 : 0));
  theme.cardTexAlpha = theme.texAlpha * (0.25 + st.rand() * 0.35);
  st.note(`hue:${theme.hue} stroke:${theme.strokeK.toFixed(2)} radius:${theme.radius}`);
  return theme;
}

const COLOR_KEYS = ['board', 'card', 'empty', 'line', 'ink', 'inkLit', 'accentA', 'accentB', 'label'];
const READ_PAIRS = [['accentA', 'card'], ['accentB', 'card'], ['label', 'accentA'], ['label', 'accentB'], ['ink', 'card'], ['ink', 'empty']];

export function shiftHue(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m0 = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round(Math.min(1, Math.max(0, v + m0)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r1) + to(g1) + to(b1);
}

export function paintThemeBoard(g, w, h, theme) {
  g.fillStyle = theme.board; g.fillRect(0, 0, w, h);
  paintThemeTex(g, 0, 0, w, h, theme, theme.texAlpha);
}

export function paintThemeTex(g, x, y, w, h, theme, alpha) {
  if (!theme.texImg || !(alpha > 0)) return;
  if (theme._patCtx !== g) {
    theme._pat = g.createPattern(theme.texImg, 'repeat'); theme._patCtx = g;
    if (theme._pat.setTransform && typeof DOMMatrix !== 'undefined') {
      theme._pat.setTransform(new DOMMatrix().translateSelf(-theme.texOffset[0], -theme.texOffset[1]).scaleSelf(theme.texScale, theme.texScale));
    }
  }
  const pat = theme._pat;
  g.save();
  g.globalAlpha = alpha; g.globalCompositeOperation = theme.tex;
  g.fillStyle = pat; g.fillRect(x, y, w, h);
  g.restore();
}

export function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y); g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y); g.closePath();
}

export function contrast(a, b) {
  const L = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
