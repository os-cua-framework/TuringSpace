import { loadImage } from '../core/assets.js';
import { ACCENT, UI_FONT, rr } from '../core/panel.js';
import { COLOR, RADIUS } from '../skins/tokens.js';

export const REAL_SCENES = Object.freeze([
  '13d3f1e5893726a2.jpg', '1b8500e0e4938e77.jpg', '2ebea253f54ba55f.jpg',
  '2ed000d799794d71.jpg', '363b20c1602ae5fb.jpg', '3f6e15958d41abf9.jpg',
  '7fd5956f7309f792.jpg', 'a86c99772420c77e.jpg', 'aeb082b467a2c39e.jpg',
  'dea2fdb1a77ec6bb.jpg', 'e456b97c9d61ff57.jpg', 'fcfbd8e754fea64f.jpg',
]);

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const pickScene = (rng) => REAL_SCENES[rng.int(0, REAL_SCENES.length - 1)];

export async function mountScene(env) {
  try { env.assets.scene = await loadImage(`assets/openimages_spatial/${env.manifest.sceneFile}`); }
  catch { env.assets.scene = null; }
}

export function drawSceneCover(g, img, r, alpha = 0.23) {
  if (!img) {
    const gradient = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    gradient.addColorStop(0, '#7890a8'); gradient.addColorStop(1, '#d9b985');
    g.fillStyle = gradient; g.fillRect(r.x, r.y, r.w, r.h); return;
  }
  const ar = r.w / r.h, iar = img.width / img.height;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (iar > ar) { sw = sh * ar; sx = (img.width - sw) / 2; }
  else { sh = sw / ar; sy = (img.height - sh) / 2; }
  g.save(); g.globalAlpha = alpha; g.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.w, r.h); g.restore();
}

export function drawChip(g, r, text, selected = false) {
  rr(g, r.x, r.y, r.w, r.h, RADIUS.chip);
  g.fillStyle = selected ? '#e7f4ff' : '#fff'; g.fill();
  g.strokeStyle = selected ? ACCENT : COLOR.line; g.lineWidth = selected ? 2 : 1; g.stroke(); g.lineWidth = 1;
  g.fillStyle = selected ? COLOR.accent : COLOR.muted; g.font = `600 10px ${UI_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + .5);
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const q = poly[(i + 1) % poly.length]; a += poly[i].x * q.y - q.x * poly[i].y; }
  return Math.abs(a) / 2;
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pathHit(g, points, { fill = '#5d748b', stroke = '#2e4355', width = 1 } = {}) {
  g.beginPath(); points.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
  g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); g.lineWidth = 1;
}

export function clickNearest(point, candidates, radius) {
  let best = -1, d = radius;
  candidates.forEach((q, i) => { const n = dist(point, q); if (n <= d) { best = i; d = n; } });
  return best;
}
