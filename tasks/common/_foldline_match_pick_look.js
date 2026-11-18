import { splitIds } from '../core/style.js';
import { swatch, pat, withShadow, shadeHex, mixHex, rgba, relLum, ISO_TEX, splitPool, pickSplit } from './_board_mat.js';

const TAU = Math.PI * 2;
const SHEETS = [
  { id: 'paper', tint: ['#f7f4ec', '#fbfaf6', '#f3efe4'], uses: ['wall', 'floor'], amp: 0.06 },
  { id: 'kraft', tint: ['#c9a678', '#bf9a6a', '#d1b083'], uses: ['floor', 'terrain', 'wall'], amp: 0.1 },
  { id: 'cardstock', tint: ['#d8e8f2', '#dcefd9', '#f6dede', '#f6efc9', '#e6dcf2'], uses: ['wall', 'floor'], amp: 0.05 },
  { id: 'parchment', tint: ['#efdfb6', '#ead7a8', '#f1e3c0'], uses: ['stone', 'terrain', 'floor'], amp: 0.1 },
  { id: 'cloth', real: true, uses: ['fabric'], L: 0.8 },
  { id: 'felt', tint: ['#9fb8d8', '#c9a0a0', '#a8c49a', '#d8c08a', '#b0a6c8'], uses: ['fabric'], amp: 0.15 },
  { id: 'leather', real: true, uses: ['flat2d', 'fabric'], re: /leather/, L: 0.62 },
  { id: 'foil', tint: ['#cfd5db', '#d9c89c', '#c7b3a3'], uses: ['metal'], amp: 0.12 },
];
const DOTS = ['button', 'sticker', 'hole', 'pin', 'sewbutton', 'coin', 'bead', 'ink'];
const TABLES = [
  { id: 'wood', uses: ['wood'], L: 0.42 },
  { id: 'stone', uses: ['stone', 'floor'], L: 0.5 },
  { id: 'mat', uses: ['fabric'], L: 0.3 },
  { id: 'concrete', uses: ['floor'], L: 0.55 },
];
const SHEET_SPLIT = splitIds('g19_fold_sheet', SHEETS.map((s) => s.id), 1);
const DOT_SPLIT = splitIds('g19_fold_dot', DOTS, 1);
const DOT_COLS = ['#37485c', '#b33a3a', '#2f6db3', '#2f7d4f', '#7a3fa0', '#c26a1a', '#222222', '#a0485e'];

export async function buildFoldLook(style) {
  const combos = [];
  const tables = splitPool(style, 'g19_fold_table', TABLES);
  for (const tb of tables) for (const d of DOTS) for (const sh of SHEETS) {
    if (SHEET_SPLIT(sh.id) !== style.split || DOT_SPLIT(d) !== style.split) continue;
    combos.push([sh, d, tb]);
  }
  const [ci] = style.primaryCombo('g19_fold_look', [combos.length]);
  const [sheet, dot, table] = combos[ci];
  style.note(`fold_sheet:${sheet.id}`); style.note(`fold_dot:${dot}`); style.note(`fold_table:${table.id}`);
  const r = style.rand;
  const look = { sheet, dot, table, r: Array.from({ length: 12 }, () => r()) };
  let st;
  if (sheet.real) {
    st = style.pick('tex', (t) => sheet.uses.includes(t.use) && (sheet.re ? sheet.re.test(t.id) : ISO_TEX.has(t.id)))
      || style.pick('tex', (t) => ISO_TEX.has(t.id) && t.use === 'fabric') || style.pick('tex', (t) => ISO_TEX.has(t.id));
    look.sheetTex = st ? await swatch(st.file, { size: 256, mode: 'real', L: sheet.L, k: 0.35, sat: 0.6, hp: 8 }) : null;
    look.sheetBase = sheet.id === 'leather' ? '#a8a29a' : '#cfcac2';
  } else {
    st = style.pick('tex', (t) => sheet.uses.includes(t.use) && ISO_TEX.has(t.id)) || style.pick('tex', (t) => ISO_TEX.has(t.id))
      || style.pick('tex', (t) => sheet.uses.includes(t.use));
    look.sheetBase = pickSplit(style, `g19_fold_tint_${sheet.id}`, sheet.tint);
    look.sheetTex = st ? await swatch(st.file, { size: 256, mode: 'tint', tint: look.sheetBase, amp: sheet.amp, hp: 8 }) : null;
  }
  const sheetL = relLum(look.sheetBase);
  const tt = style.pick('tex', (t) => table.uses.includes(t.use));
  const sheetS = Math.pow(sheetL, 1 / 2.2);
  look.tableTex = tt ? await swatch(tt.file, { size: 256, mode: 'real', L: Math.max(0.2, sheetS * (0.86 + r() * 0.09)), k: 0.45, sat: 0.3 }) : null;
  look.fullSheet = r() < 0.35;
  look.flap = pickSplit(style, 'g19_fold_flap', ['rgba(95,150,210,0.14)', 'rgba(225,140,60,0.14)', 'rgba(80,170,110,0.14)', 'rgba(150,100,200,0.13)', 'rgba(0,0,0,0.08)']);
  look.dash = pickSplit(style, 'g19_fold_dash', [[7, 5], [10, 6], [5, 4], [12, 4, 3, 4]]);
  look.lineCol = sheetL > 0.45 ? pickSplit(style, 'g19_fold_ink_dark', ['#7d8693', '#6b5b4b', '#5a6f86']) : pickSplit(style, 'g19_fold_ink_light', ['#f2efe8', '#e8e0c8']);
  look.lineW = 1.8 + r() * 0.8;
  let dc = pickSplit(style, 'g19_fold_dotcol', DOT_COLS);
  if (Math.abs(relLum(dc) - sheetL) < 0.25) dc = sheetL > 0.4 ? '#22303f' : '#f4f1ea';
  look.dotCol = dc;
  look.dotR = 7.5 + r() * 1.5;
  if (dot === 'coin') {
    const mt = style.pick('tex', (t) => t.use === 'metal');
    look.coinTex = mt ? await swatch(mt.file, { size: 64, mode: 'tint', tint: pickSplit(style, 'g19_fold_coin', ['#c9a24e', '#b8bec4', '#b87a4e']), amp: 0.25, hp: 6 }) : null;
  }
  return look;
}

function drawDot(g, p, look) {
  const R = look.dotR, c = look.dotCol, x = p.x, y = p.y;
  const circ = (rr) => { g.beginPath(); g.arc(x, y, rr, 0, TAU); };
  switch (look.dot) {
    case 'button':
      circ(R); g.fillStyle = c; g.fill(); g.strokeStyle = shadeHex(c, 0.6); g.lineWidth = 1.2; g.stroke();
      g.beginPath(); g.arc(x - R * 0.3, y - R * 0.33, R * 0.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.34)'; g.fill();
      break;
    case 'sticker':
      withShadow(g, () => { circ(R); g.fillStyle = '#ffffff'; g.fill(); }, { dx: 0.5, dy: 1, blur: 2, a: 0.3 });
      circ(R - 2); g.fillStyle = c; g.fill();
      break;
    case 'hole': {
      circ(R); g.fillStyle = look.tableTex ? pat(g, look.tableTex, { s: 0.5 }) : '#5a4a3a'; g.fill();
      circ(R); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
      g.save(); circ(R); g.clip();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 4; g.beginPath(); g.arc(x + 1, y + 1.5, R + 1, 0, TAU); g.stroke();
      g.restore();
      circ(R); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
      break;
    }
    case 'pin': {
      const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
      gr.addColorStop(0, mixHex(c, '#ffffff', 0.55)); gr.addColorStop(1, shadeHex(c, 0.75));
      withShadow(g, () => { circ(R); g.fillStyle = gr; g.fill(); }, { dx: 1.5, dy: 2, blur: 2.5, a: 0.35 });
      break;
    }
    case 'sewbutton':
      circ(R); g.fillStyle = c; g.fill(); g.strokeStyle = shadeHex(c, 0.6); g.lineWidth = 1; g.stroke();
      circ(R * 0.72); g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
      g.fillStyle = 'rgba(0,0,0,.55)';
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(x + dx * R * 0.28, y + dy * R * 0.28, R * 0.13, 0, TAU); g.fill(); }
      break;
    case 'coin':
      withShadow(g, () => { circ(R); g.fillStyle = look.coinTex ? pat(g, look.coinTex, { s: 0.6 }) : '#c9a24e'; g.fill(); }, { dx: 0.8, dy: 1.2, blur: 1.5, a: 0.3 });
      circ(R); g.strokeStyle = 'rgba(60,45,20,.6)'; g.lineWidth = 1; g.stroke();
      circ(R * 0.72); g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
      break;
    case 'bead': {
      const gr = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.05, x, y, R);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, mixHex(c, '#ffffff', 0.35)); gr.addColorStop(1, shadeHex(c, 0.6));
      circ(R); g.fillStyle = gr; g.fill();
      break;
    }
    default:
      circ(R + 0.8); g.fillStyle = rgba(c, 0.3); g.fill();
      circ(R - 0.5); g.fillStyle = rgba(c, 0.92); g.fill();
  }
}

export function drawFoldBoard(g, br, m, st, look, h) {
  const { axisBasis, rr, ACCENT } = h;
  g.save(); g.translate(br.x, br.y);
  g.fillStyle = look.tableTex ? pat(g, look.tableTex, { s: 0.6, x: look.r[0] * 256, y: look.r[1] * 256 }) : '#8a6c46';
  g.fillRect(0, 0, br.w, br.h);
  const sheetRect = () => (look.fullSheet ? (g.beginPath(), g.rect(0, 0, br.w, br.h)) : rr(g, 12, 14, br.w - 24, 312, 6));
  if (!look.fullSheet) withShadow(g, () => { rr(g, 12, 14, br.w - 24, 312, 6); g.fillStyle = look.sheetBase; g.fill(); }, { dx: 1, dy: 2, blur: 9, a: 0.18 });
  sheetRect();
  g.fillStyle = look.sheetTex ? pat(g, look.sheetTex, { s: 0.7, x: look.r[2] * 256, y: look.r[3] * 256 }) : look.sheetBase; g.fill();
  const b = axisBasis(m.axis), n = { x: -b.s, y: b.c }, far = 900;
  g.save();
  sheetRect(); g.clip();
  g.beginPath();
  g.moveTo(m.axis.cx + b.c * far, m.axis.cy + b.s * far);
  g.lineTo(m.axis.cx - b.c * far, m.axis.cy - b.s * far);
  g.lineTo(m.axis.cx - b.c * far + n.x * far, m.axis.cy - b.s * far + n.y * far);
  g.lineTo(m.axis.cx + b.c * far + n.x * far, m.axis.cy + b.s * far + n.y * far);
  g.closePath();
  g.fillStyle = look.flap; g.fill();
  g.setLineDash(look.dash); g.strokeStyle = look.lineCol; g.lineWidth = look.lineW; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(m.axis.cx + b.c * far, m.axis.cy + b.s * far); g.lineTo(m.axis.cx - b.c * far, m.axis.cy - b.s * far); g.stroke();
  g.setLineDash([]);
  g.restore();
  for (const d of m.dots) if (d.side === 'B') drawDot(g, d, look);
  for (const d of m.dots) if (d.side === 'F') drawDot(g, d, look);
  const sel = new Set(st.selected);
  for (const d of m.dots) if (sel.has(d.id)) { g.beginPath(); g.arc(d.x, d.y, h.DOT_R + 7, 0, TAU); g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke(); }
  g.restore();
}
