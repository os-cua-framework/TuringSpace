import { UI_FONT, ACCENT } from '../core/panel.js';
import { splitPool, roundRobinPairs, texCanvas, fillTex, rrPath, shade, mix, jitterHex, texMeanHex, contrast, choose, firstIsotropic } from './_grid_look_kit.js';

const TAU = Math.PI * 2;
const THEMES = [
  { id: 'park', tex: ['terrain'], texRe: /grass|forest|leaves|mud|ground|moss/, base: '#7aa25a', dot: 'stone', grid: null, ink: '#fff' },
  { id: 'plaza', tex: ['floor'], texRe: /concrete|paving|pavement|plaster|tiles|cement/, base: '#b9b4aa', dot: 'stud', grid: null },
  { id: 'graph_paper', tex: ['flat2d', 'fabric', 'wall'], texRe: /plaster|leather_white|linen|jersey|concrete_floor|beige|white/, base: '#f6f4ec', dot: 'ink', grid: 'paper' },
  { id: 'city', tex: ['roof'], texRe: /./, base: '#55595f', dot: 'crossing', grid: 'blocks' },
  { id: 'chess', tex: ['wood', 'stone'], texRe: /wood|oak|plank|parquet|slab|marble|tile|veneer/, base: '#c9b08a', dot: 'stud', grid: 'checker' },
  { id: 'blueprint', tex: ['flat2d', 'wall', 'floor'], texRe: /concrete|plaster/, base: '#1f4e79', dot: 'ring', grid: 'blue' },
  { id: 'beach', tex: ['terrain'], texRe: /sand|gravel|pebble|coast/, base: '#dcc79c', dot: 'shell', grid: null },
  { id: 'snow', tex: ['terrain'], texRe: /snow/, base: '#eef3f8', dot: 'hole', grid: null },
  { id: 'pegboard', tex: ['wood'], texRe: /plywood|wood|veneer|laminate|synthetic/, base: '#b98a5a', dot: 'hole', grid: null },
  { id: 'corkboard', tex: ['fabric', 'flat2d', 'terrain'], texRe: /hessian|carpet|brown_mud_dry|gravelly|sand|terry|velour/, base: '#b88a5c', dot: 'pin', grid: null },
  { id: 'stone_floor', tex: ['stone', 'floor'], texRe: /slab|tile|stone|monastery|cobble|rock_tile/, base: '#9d978c', dot: 'rivet', grid: null },
  { id: 'trail', tex: ['terrain'], texRe: /rock|trail|ground|mud|gravel|soil|lichen/, base: '#8f7f62', dot: 'pebble', grid: null },
];
const themesOf = splitPool('g14_ego_map', THEMES, 3);
const CARDS = [{ id: 'white' }, { id: 'sticky' }, { id: 'sign' }, { id: 'nav' }, { id: 'ticket' }, { id: 'chalk' }, { id: 'kraft' }];

const WALKERS = [{ id: 'pin' }, { id: 'person' }, { id: 'car' }, { id: 'robot' }, { id: 'turtle' }, { id: 'arrowhead' }];

const FONTS = [
  { id: 'ui', f: (w, s) => `${w} ${s}px ${UI_FONT}` }, { id: 'georgia', f: (w, s) => `${w} ${s}px "SCBX Gelasio", serif` }, { id: 'avenir', f: (w, s) => `${w} ${s}px "SCBX Nunito Sans", sans-serif` },
  { id: 'courier', f: (w, s) => `${w} ${s}px "SCBX Courier Prime", monospace` }, { id: 'trebuchet', f: (w, s) => `${w} ${s}px "SCBX Fira Sans", sans-serif` }, { id: 'gill', f: (w, s) => `${w} ${s}px "SCBX Cabin", sans-serif` },
  { id: 'typewriter', f: (w, s) => `${w} ${s}px "SCBX Cutive Mono", monospace` }, { id: 'futura', f: (w, s) => `${w} ${s}px "SCBX Jost", sans-serif` },
];
const WALKER_C = ['#2c6b3d', '#c0392b', '#1f5fae', '#7b3fa0', '#d35400', '#1b1f24', '#0e7c7b'], PIN_C = ['#d23f3f', '#2a7de1', '#f0b429', '#2fa36b', '#8e44d6'], RADII = ['4', '8', '12', '2'];
const STICKY = ['#fff2a8', '#ffd1dc', '#c8f0c8', '#cfe6ff', '#ffe0b3'];

export async function mountEgoLook(env) {
  const st = env.style;
  const themes = themesOf(st.split);
  const lists = themes.map((t) => st.pool('tex', (a) => t.tex.includes(a.use) && t.texRe.test(a.id)));
  lists.forEach((l, i) => { if (!l.length) lists[i] = [null, null]; });
  const pairs = roundRobinPairs(themes, lists);
  const [pi] = st.primaryCombo('ego_map_x_tex', [pairs.length]);
  const [theme, tex0] = pairs[pi], tl = lists[themes.indexOf(theme)];
  const tex = tex0 ? await firstIsotropic(tl, tl.indexOf(tex0)) : null;
  st.note(`g14_ego_map:${theme.id}`); if (tex) st.note(`tex:${tex.id}`);
  const r = st.rand;
  const card = choose(st, 'g14_ego_card', CARDS, { minTest: 2 }), walker = choose(st, 'g14_ego_walker', WALKERS);
  const font = choose(st, 'g14_ego_font', FONTS, { minTest: 2 }).f;
  const lowK = theme.id === 'graph_paper' || theme.id === 'blueprint' ? 0.25 : theme.id === 'city' ? 0.8 : 0.6;
  const mapTex = tex ? await texCanvas(tex.file, { size: 256, contrast: lowK, sat: 0.85 }) : null;
  const base = tex && theme.grid !== 'blue' && theme.grid !== 'paper' ? texMeanHex(tex) : jitterHex(theme.base, r, 5, 0.1, 0.03);
  const desk = st.pick('tex', (a) => (a.use === 'wood' || a.use === 'wall' || a.use === 'floor') && !/brick|block|stone/.test(a.id));
  const deskTex = desk ? await texCanvas(desk.file, { size: 256, contrast: 0.35, sat: 0.5, gain: 1.05 }) : null;
  if (desk) st.note(`tex:${desk.id}`);
  const lightMap = contrast(base, '#ffffff') < contrast(base, '#000000');
  return {
    theme: theme.id, dot: theme.dot, grid: theme.grid, mapTex, base, lightMap, deskTex, deskMean: desk ? texMeanHex(desk) : '#e9edf1',
    card: card.id, walker: walker.id, font,
    sticky: choose(st, 'g14_ego_sticky', STICKY), walkerC: choose(st, 'g14_ego_walker_colour', WALKER_C),
    pinC: choose(st, 'g14_ego_pin_colour', PIN_C), texScale: 0.45 + 0.35 * r(), texOff: [r() * 256, r() * 256],
    radius: Number(choose(st, 'g14_ego_radius', RADII)), dotScale: 0.85 + 0.3 * r(),
  };
}

const CARD_STYLE = {
  white: { bg: '#ffffff', edge: '#d5dce2', ink: '#2f3b46', sub: '#5b6b78', num: '#5b6b78', numInk: '#fff' },
  sticky: { bg: null, edge: 'rgba(0,0,0,.08)', ink: '#2b2b2b', sub: '#4a4a4a', num: '#3b3b3b', numInk: '#fff' },
  sign: { bg: '#1f5aa8', edge: '#ffffff', ink: '#ffffff', sub: '#e3ecf7', num: '#ffffff', numInk: '#1f5aa8' },
  nav: { bg: '#1c2128', edge: '#3a424d', ink: '#ffffff', sub: '#b8c2cc', num: '#3ddc84', numInk: '#0d1b12', arrow: '#3ddc84' },
  ticket: { bg: '#f6efdc', edge: '#9b8a66', ink: '#3a2f20', sub: '#6b5b40', num: '#9b3b2b', numInk: '#fff' },
  chalk: { bg: '#2f4436', edge: '#7a5a3a', ink: '#f2f2ea', sub: '#d8ddd2', num: '#f2f2ea', numInk: '#2f4436' },
  kraft: { bg: '#c9a47a', edge: '#8e6a42', ink: '#2e2014', sub: '#4a3622', num: '#2e2014', numInk: '#e8d5bb' },
};

function moveArrow(g, cx, cy, turn, col, lw = 4) {
  const s = 15;
  g.save();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx, cy + s);
  let tip, dir;
  if (turn === 0) { g.lineTo(cx, cy - s); tip = { x: cx, y: cy - s - 2 }; dir = { x: 0, y: -1 }; }
  else if (turn === 180) {
    g.beginPath(); g.moveTo(cx + 7, cy + s); g.lineTo(cx + 7, cy - 4); g.arc(cx, cy - 4, 7, 0, Math.PI, true); g.lineTo(cx - 7, cy + 3);
    tip = { x: cx - 7, y: cy + 5 }; dir = { x: 0, y: 1 };
  } else {
    const sx = turn > 0 ? 1 : -1;
    g.lineTo(cx, cy - 2); g.arcTo(cx, cy - 8, cx + sx * 6, cy - 8, 6); g.lineTo(cx + sx * s, cy - 8);
    tip = { x: cx + sx * (s + 2), y: cy - 8 }; dir = { x: sx, y: 0 };
  }
  g.stroke();
  const px = -dir.y, py = dir.x;
  g.beginPath(); g.moveTo(tip.x + dir.x * 5, tip.y + dir.y * 5);
  g.lineTo(tip.x - dir.x * 5 + px * 7, tip.y - dir.y * 5 + py * 7);
  g.lineTo(tip.x - dir.x * 5 - px * 7, tip.y - dir.y * 5 - py * 7);
  g.closePath(); g.fill();
  g.restore();
}

function drawCards(g, m, L, rects) {
  const S = CARD_STYLE[L.card];
  const narrow = rects[0].w < 90;
  const sq = rects[0].h < 86 ? (rects[0].h - 76) / 2 : (rects[0].h - 86) / 2;
  m.frames.forEach((f, i) => {
    const r = rects[i];
    g.save();
    g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    rrPath(g, r.x, r.y, r.w, r.h, L.card === 'sign' ? 6 : L.card === 'sticky' ? 1 : L.radius);
    g.fillStyle = S.bg || L.sticky; g.fill();
    g.restore();
    if (L.card === 'sign') { rrPath(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 4); g.strokeStyle = S.edge; g.lineWidth = 2; g.stroke(); }
    else if (L.card === 'ticket') { g.save(); g.setLineDash([4, 3]); rrPath(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 3); g.strokeStyle = S.edge; g.lineWidth = 1; g.stroke(); g.restore(); }
    else if (L.card === 'chalk') { rrPath(g, r.x, r.y, r.w, r.h, 4); g.strokeStyle = S.edge; g.lineWidth = 4; g.stroke(); }
    else if (L.card === 'sticky') { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(r.x, r.y, r.w, 10); }
    else { rrPath(g, r.x, r.y, r.w, r.h, L.radius); g.strokeStyle = S.edge; g.lineWidth = 1; g.stroke(); }
    g.beginPath(); g.arc(r.x + 14, r.y + 14, 9, 0, TAU); g.fillStyle = S.num; g.fill();
    g.fillStyle = S.numInk; g.font = `700 11px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), r.x + 14, r.y + 14.5);
    const short = r.h < 86, y0 = r.y + Math.max(0, sq);
    moveArrow(g, r.x + r.w / 2, y0 + (short ? 30 : 34), f.turn, S.arrow || S.ink);
    const what = f.turn === 0 ? 'Straight' : f.turn === 180 ? 'Turn around' : f.turn < 0 ? 'Turn left' : 'Turn right';
    g.fillStyle = S.ink; g.font = L.font('700', narrow ? 11 : 12);
    g.fillText(what, r.x + r.w / 2, y0 + (short ? 55 : 62), r.w - 6);
    g.fillStyle = S.sub; g.font = L.font('600', 11);
    g.fillText(`walk ${f.dist}`, r.x + r.w / 2, y0 + (short ? 69 : 77));
  });
}

function drawMap(g, m, L, G) {
  const { MAP, step, bounds: b } = G, o = m.origin;
  g.save();
  rrPath(g, MAP.x, MAP.y, MAP.w, MAP.h, 10); g.clip();
  g.fillStyle = L.base; g.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  const tex = { scale: L.texScale, ox: MAP.x - L.texOff[0], oy: MAP.y - L.texOff[1] };
  if (L.grid === 'blocks') {
    g.fillStyle = '#4b4f55'; g.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    for (let c = b.c0 - 1; c <= b.c1; c++) for (let r = b.r0 - 1; r <= b.r1; r++) {
      const x = o.x + c * step + step * 0.2, y = o.y + r * step + step * 0.2, w = step * 0.6;
      rrPath(g, x, y, w, w, 2); g.fillStyle = mix(L.base, '#9c8f80', 0.35); g.fill();
      if (L.mapTex) fillTex(g, L.mapTex, { ...tex, scale: L.texScale * 0.6 });
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
    }
  } else {
    const faint = L.grid === 'paper' ? { alpha: 0.3, op: 'multiply' } : L.grid === 'blue' ? { alpha: 0.35, op: 'soft-light' } : {};
    if (L.mapTex) fillTex(g, L.mapTex, { ...tex, ...faint }, { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h });
    if (L.grid === 'checker') {
      for (let c = b.c0 - 1; c <= b.c1; c++) for (let r = b.r0 - 1; r <= b.r1; r++) {
        if ((c + r) % 2 === 0) continue;
        g.fillStyle = 'rgba(30,20,10,.28)'; g.fillRect(o.x + c * step, o.y + r * step, step, step);
      }
    } else if (L.grid === 'paper' || L.grid === 'blue') {
      g.strokeStyle = L.grid === 'blue' ? 'rgba(255,255,255,.16)' : 'rgba(70,120,190,.18)'; g.lineWidth = 1;
      for (let x = o.x + (b.c0 - 2) * step; x < MAP.x + MAP.w; x += step / 2) { g.beginPath(); g.moveTo(x, MAP.y); g.lineTo(x, MAP.y + MAP.h); g.stroke(); }
      for (let y = o.y + (b.r0 - 2) * step; y < MAP.y + MAP.h; y += step / 2) { g.beginPath(); g.moveTo(MAP.x, y); g.lineTo(MAP.x + MAP.w, y); g.stroke(); }
    }
  }
  g.restore();
  rrPath(g, MAP.x, MAP.y, MAP.w, MAP.h, 10); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke();
  const k = L.dotScale * step / 28;
  for (let c = b.c0; c <= b.c1; c++) for (let r = b.r0; r <= b.r1; r++) drawDot(g, o.x + c * step, o.y + r * step, L, k);
}

function drawDot(g, x, y, L, k) {
  const C = (rr) => { g.beginPath(); g.arc(x, y, rr, 0, TAU); };
  switch (L.dot) {
    case 'stone': C(4.6 * k); g.fillStyle = '#c9c4ba'; g.fill(); g.strokeStyle = 'rgba(40,40,30,.55)'; g.lineWidth = 1; g.stroke(); break;
    case 'stud': C(3.6 * k); g.fillStyle = '#c9a24a'; g.fill(); g.strokeStyle = 'rgba(60,40,10,.7)'; g.lineWidth = 1; g.stroke(); C(1.2 * k); g.fillStyle = '#fff3c4'; g.fill(); break;
    case 'ink': C(2.4 * k); g.fillStyle = '#2b4a8a'; g.fill(); break;
    case 'crossing': C(3.2 * k); g.fillStyle = '#f2f2ee'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke(); break;
    case 'ring': C(3 * k); g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.stroke(); break;
    case 'shell': g.beginPath(); g.ellipse(x, y, 4 * k, 3 * k, 0, 0, TAU); g.fillStyle = '#fbf3e6'; g.fill(); g.strokeStyle = 'rgba(120,80,40,.6)'; g.lineWidth = 1; g.stroke(); break;
    case 'hole': C(3.4 * k); g.fillStyle = 'rgba(25,20,15,.75)'; g.fill(); C(3.4 * k); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke(); break;
    case 'pin': C(3.8 * k); g.fillStyle = L.pinC; g.fill(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke(); C(1.2 * k); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill(); break;
    case 'rivet': C(3.4 * k); g.fillStyle = '#d9dde1'; g.fill(); g.strokeStyle = 'rgba(30,30,30,.6)'; g.lineWidth = 1; g.stroke(); break;
    case 'pebble': C(3.8 * k); g.fillStyle = '#e8e1d2'; g.fill(); g.strokeStyle = 'rgba(30,25,15,.6)'; g.lineWidth = 1; g.stroke(); break;
    default: C(2.4 * k); g.fillStyle = 'rgba(60,90,66,.6)'; g.fill();
  }
}

function drawWalker(g, x, y, h0, L) {
  g.save(); g.translate(x, y); g.rotate(h0 * Math.PI / 180);
  const c = L.walkerC;
  const mark = (y0, w = 7, len = 10) => { g.beginPath(); g.moveTo(0, y0 - len); g.lineTo(-w, y0); g.lineTo(w, y0); g.closePath(); g.fillStyle = c; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); };
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  switch (L.walker) {
    case 'person':
      g.beginPath(); g.ellipse(0, 1, 9, 5.5, 0, 0, TAU); g.fillStyle = c; g.fill();
      g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fillStyle = '#f1c9a0'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
      g.shadowColor = 'transparent'; mark(-8, 5, 9); break;
    case 'car':
      rrPath(g, -6.5, -9, 13, 18, 3); g.fillStyle = c; g.fill(); g.shadowColor = 'transparent';
      rrPath(g, -4.8, -5, 9.6, 4.5, 1.5); g.fillStyle = '#cfe3f2'; g.fill();
      g.fillStyle = '#fff6b0'; g.fillRect(-5.5, -9.5, 3, 1.6); g.fillRect(2.5, -9.5, 3, 1.6);
      mark(-11, 5, 8); break;
    case 'robot':
      rrPath(g, -7.5, -7.5, 15, 15, 3); g.fillStyle = '#9aa4ae'; g.fill(); g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = c; g.fillRect(-5, -6, 10, 3);
      mark(-9, 6, 10); break;
    case 'turtle':
      g.beginPath(); g.ellipse(0, 1, 7.5, 8.5, 0, 0, TAU); g.fillStyle = mix(c, '#4a7a3a', 0.5); g.fill(); g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.arc(0, -9.5, 3.2, 0, TAU); g.fillStyle = '#9cc47a'; g.fill(); g.stroke();
      mark(-13, 5, 8); break;
    case 'arrowhead':
      g.beginPath(); g.moveTo(0, -18); g.lineTo(-9, 6); g.lineTo(0, 1); g.lineTo(9, 6); g.closePath();
      g.fillStyle = c; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      break;
    default:
      g.beginPath(); g.moveTo(0, -19); g.lineTo(-7, -9); g.lineTo(7, -9); g.closePath(); g.fillStyle = c; g.fill();
      g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  }
  g.restore();
}

export function drawEgoStyled(g, br, m, st, L, G) {
  g.fillStyle = L.deskMean; g.fillRect(0, 0, br.w, br.h);
  if (L.deskTex) fillTex(g, L.deskTex, { scale: 0.6 }, { x: 0, y: 0, w: br.w, h: br.h });
  drawCards(g, m, L, G.cards);
  drawMap(g, m, L, G);
  drawWalker(g, m.origin.x, m.origin.y, G.heading0, L);
  if (st.mark) {
    const p = G.cellXY(st.mark);
    g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.fillStyle = ACCENT; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(p.x, p.y, 3, 0, TAU); g.fillStyle = '#fff'; g.fill();
  }
}
export { shade };
