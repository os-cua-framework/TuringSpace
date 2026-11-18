import { rr } from '../core/panel.js';

const TAU = Math.PI * 2;
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
function pot(g, C, top = 3, bot = 14, wTop = 8, wBot = 6) {
  g.fillStyle = C.pot; g.beginPath(); g.moveTo(-wTop, top); g.lineTo(wTop, top); g.lineTo(wBot, bot); g.lineTo(-wBot, bot); g.closePath(); g.fill();
  g.strokeStyle = shade(C.pot, 0.7); g.lineWidth = 0.8; g.stroke();
}

export function drawIconExt(g, fn, v, C, cx, cy, k = 1) {
  g.save(); g.translate(cx, cy); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round';
  if (fn === 'plant') {
    if (v === 'cactus') {
      pot(g, C, 5, 14, 7, 5.5);
      g.fillStyle = C.leaf; rr(g, -3.5, -14, 7, 20, 3.5); g.fill();
      rr(g, 3, -6, 6, 3.5, 1.7); g.fill(); rr(g, 6, -12, 3.5, 8, 1.7); g.fill();
      rr(g, -9, -8, 6, 3.5, 1.7); g.fill(); rr(g, -9, -13, 3.5, 7, 1.7); g.fill();
    } else if (v === 'tree') {
      pot(g, C, 7, 14, 7, 6);
      g.strokeStyle = '#6b4a32'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 7); g.lineTo(0, -3); g.stroke();
      g.fillStyle = C.leaf; for (const [x, y, r] of [[0, -9, 6.5], [-5, -4, 4.5], [5, -5, 4.5], [1, -14, 4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    } else if (v === 'flowers') {
      pot(g, C, 4, 14, 7, 5.5);
      g.strokeStyle = C.leaf; g.lineWidth = 1.2;
      const F = [[-6, -8], [0, -12], [6, -8], [-3, -3], [4, -2]];
      for (const [x, y] of F) { g.beginPath(); g.moveTo(0, 4); g.lineTo(x, y); g.stroke(); }
      for (const [x, y] of F) { g.fillStyle = C.bloom; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); g.fillStyle = '#d8a030'; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
    } else if (v === 'snake') {
      g.fillStyle = C.pot; rr(g, -7, 4, 14, 10, 1.5); g.fill(); g.strokeStyle = shade(C.pot, 0.7); g.lineWidth = 0.8; g.stroke();
      g.fillStyle = C.leaf;
      for (const [x, h, a] of [[-4, 14, -0.18], [0, 18, 0], [4, 15, 0.15], [-1.5, 11, -0.05], [2, 12, 0.08]]) { g.save(); g.translate(x, 4); g.rotate(a); g.beginPath(); g.ellipse(0, -h / 2, 1.8, h / 2, 0, 0, TAU); g.fill(); g.restore(); }
    } else {
      pot(g, C);
      g.fillStyle = C.leaf;
      for (const [x, y, a] of [[-6, -4, -0.5], [6, -4, 0.5], [0, -9, 0], [-3, -1, -0.2], [3, -1, 0.2]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 4, 8, 0, 0, TAU); g.fill(); g.restore(); }
    }
  } else if (fn === 'lamp') {
    g.strokeStyle = C.metal; g.fillStyle = C.metal; g.lineWidth = 2;
    if (v === 'tripod') {
      for (const x of [-8, 0, 8]) { g.beginPath(); g.moveTo(x, 14); g.lineTo(0, 1); g.stroke(); }
      g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -6); g.stroke();
      g.fillStyle = C.shade; g.strokeStyle = shade(C.shade, 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(-5, -15); g.lineTo(5, -15); g.lineTo(8, -6); g.lineTo(-8, -6); g.closePath(); g.fill(); g.stroke();
    } else if (v === 'drumlamp') {
      g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 13); g.stroke(); rr(g, -7, 12, 14, 3, 1.5); g.fill();
      g.fillStyle = C.shade; g.strokeStyle = shade(C.shade, 0.8); g.lineWidth = 1; rr(g, -8, -15, 16, 10, 1.5); g.fill(); g.stroke();
    } else if (v === 'globe') {
      g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 13); g.stroke(); rr(g, -7, 12, 14, 3, 1.5); g.fill();
      g.fillStyle = C.shade; g.strokeStyle = shade(C.shade, 0.8); g.lineWidth = 1; g.beginPath(); g.arc(0, -9, 7, 0, TAU); g.fill(); g.stroke();
    } else if (v === 'lantern') {
      g.fillStyle = C.metal; rr(g, -7, 11, 14, 3, 1); g.fill();
      g.beginPath(); g.moveTo(-8, -6); g.lineTo(0, -12); g.lineTo(8, -6); g.closePath(); g.fill();
      g.fillRect(-1, -15, 2, 3);
      g.fillStyle = C.shade; g.fillRect(-5.5, -6, 11, 17);
      g.strokeStyle = C.metal; g.lineWidth = 1.6; g.strokeRect(-5.5, -6, 11, 17); g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 11); g.stroke();
    } else {
      g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 13); g.stroke();
      rr(g, -7, 12, 14, 3, 1.5); g.fill();
      g.fillStyle = C.shade; g.strokeStyle = shade(C.shade, 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(-5, -15); g.lineTo(5, -15); g.lineTo(9, -5); g.lineTo(-9, -5); g.closePath(); g.fill(); g.stroke();
    }
  } else if (fn === 'chair') {
    if (v === 'stool') {
      g.strokeStyle = C.wood; g.lineWidth = 2.2;
      for (const [a, b] of [[-6, -9], [6, 9], [0, 0]]) { g.beginPath(); g.moveTo(a, -1); g.lineTo(b, 13); g.stroke(); }
      g.fillStyle = C.wood; g.beginPath(); g.ellipse(0, -2, 10, 3.5, 0, 0, TAU); g.fill();
      g.fillStyle = shade(C.wood, 1.15); g.beginPath(); g.ellipse(0, -3, 9, 2.6, 0, 0, TAU); g.fill();
    } else if (v === 'pouf') {
      g.fillStyle = C.cushion; rr(g, -10, -6, 20, 18, 6); g.fill();
      g.fillStyle = shade(C.cushion, 1.15); g.beginPath(); g.ellipse(0, -5, 10, 3.5, 0, 0, TAU); g.fill();
      g.fillStyle = shade(C.cushion, 0.75); g.beginPath(); g.arc(0, -5, 1.3, 0, TAU); g.fill();
    } else if (v === 'bench') {
      g.fillStyle = C.wood; rr(g, -13, -3, 26, 4, 1.2); g.fill(); g.fillRect(-11, 1, 3, 12); g.fillRect(8, 1, 3, 12);
      g.fillStyle = shade(C.wood, 0.8); g.fillRect(-9, 7, 18, 2);
    } else if (v === 'armless') {
      g.fillStyle = shade(C.wood, 1); g.fillRect(-8, 6, 16, 7);
      g.fillStyle = C.cushion; rr(g, -9, -14, 6, 21, 2); g.fill(); rr(g, -9, 0, 18, 6, 2); g.fill();
    } else {
      g.fillStyle = C.wood; g.fillRect(-8, -14, 3, 27); g.fillRect(6, 2, 3, 11); g.fillRect(-8, -14, 3, 3);
      g.fillStyle = C.cushion; rr(g, -8, -1, 17, 4, 1.5); g.fill();
      g.fillStyle = C.wood; g.fillRect(-8, -12, 3, 10);
    }
  } else if (fn === 'box') {
    if (v === 'crate') {
      g.fillStyle = C.box; rr(g, -11, -8, 22, 17, 1); g.fill();
      g.strokeStyle = shade(C.box, 0.55); g.lineWidth = 1;
      for (const y of [-3.5, 1, 5]) { g.beginPath(); g.moveTo(-8, y); g.lineTo(8, y); g.stroke(); }
      g.lineWidth = 1.2; rr(g, -11, -8, 22, 17, 1); g.stroke(); g.strokeRect(-8, -8, 16, 17);
    } else if (v === 'suitcase') {
      g.strokeStyle = '#2a2a2e'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -8); g.lineTo(-4, -11); g.lineTo(4, -11); g.lineTo(4, -8); g.stroke();
      g.fillStyle = C.box; rr(g, -12, -8, 24, 17, 4); g.fill();
      g.strokeStyle = shade(C.box, 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(-12, 0.5); g.lineTo(12, 0.5); g.stroke();
    } else if (v === 'basket') {
      g.fillStyle = C.box; g.beginPath(); g.moveTo(-12, -6); g.lineTo(12, -6); g.lineTo(9, 10); g.lineTo(-9, 10); g.closePath(); g.fill();
      g.strokeStyle = shade(C.box, 0.65); g.lineWidth = 1;
      for (const y of [-2, 2, 6]) { g.beginPath(); g.moveTo(-11, y); g.lineTo(11, y); g.stroke(); }
      for (const x of [-6, 0, 6]) { g.beginPath(); g.moveTo(x, -6); g.lineTo(x * 0.8, 10); g.stroke(); }
      g.lineWidth = 1.6; g.beginPath(); g.arc(-12, -8, 3, Math.PI * 0.6, Math.PI * 1.8); g.stroke(); g.beginPath(); g.arc(12, -8, 3, -Math.PI * 0.8, Math.PI * 0.4); g.stroke();
    } else if (v === 'chest') {
      g.fillStyle = C.box; rr(g, -11, -3, 22, 12, 1); g.fill(); rr(g, -12, -10, 24, 7, 2.5); g.fill();
      g.fillStyle = '#3a3a3e'; g.fillRect(-12, -10, 3, 19); g.fillRect(9, -10, 3, 19); g.fillRect(-2, -4, 4, 4);
    } else {
      g.fillStyle = C.kraft; rr(g, -11, -8, 22, 17, 2); g.fill();
      g.fillStyle = '#dcc39a'; g.fillRect(-2, -8, 4, 17);
      g.strokeStyle = '#a47b50'; g.lineWidth = 1; rr(g, -11, -8, 22, 17, 2); g.stroke();
    }
  } else {
    const R = 11;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = v === 'basket' ? '#d9742a' : v === 'tennis' ? '#d4e04a' : v === 'stripe' ? C.ball : C.ball2; g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    if (v === 'soccer') {
      const pent = (x, y, r) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.fill(); };
      g.fillStyle = C.ball; pent(0, 0, 4.2); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; pent(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 3.8); }
    } else if (v === 'basket') {
      g.strokeStyle = '#1f1f22'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.stroke(); g.beginPath(); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
      g.beginPath(); g.arc(-15, 0, 10, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(15, 0, 10, Math.PI - 0.8, Math.PI + 0.8); g.stroke();
    } else if (v === 'tennis') {
      g.strokeStyle = C.ball2; g.lineWidth = 1.8;
      g.beginPath(); g.arc(-12, 0, 9, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(12, 0, 9, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    } else if (v === 'stripe') {
      g.fillStyle = C.ball2; g.fillRect(-R, -2.6, 2 * R, 5.2);
      g.fillStyle = shade(C.ball2, 0.85); g.fillRect(-R, -7.2, 2 * R, 1.2); g.fillRect(-R, 6, 2 * R, 1.2);
    } else if (v === 'volley') {
      g.fillStyle = C.ball; g.beginPath(); g.ellipse(-4, -4, 12, 5, 0.6, 0, TAU); g.fill();
      g.fillStyle = C.ball3 || '#e8c33a'; g.beginPath(); g.ellipse(5, 5, 12, 4.5, -0.9, 0, TAU); g.fill();
    } else {
      g.fillStyle = C.ball; for (const a of [0, 2.09, 4.19]) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 12, a, a + 1.05); g.closePath(); g.fill(); }
    }
    g.restore();
    g.strokeStyle = '#8f8a80'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
  }
  g.restore();
}
