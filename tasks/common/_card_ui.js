import { ACCENT, UI_FONT, rr } from '../core/panel.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function angleError(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return Math.abs(d);
}

export function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function drawCard(g, r, selected = false, fill = '#fff') {
  rr(g, r.x, r.y, r.w, r.h, Math.min(7, r.h / 5));
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = selected ? ACCENT : '#dbe2ea';
  g.lineWidth = selected ? 2.5 : 1;
  g.stroke();
  g.lineWidth = 1;
}

export function drawCheck(g, x, y, selected = true) {
  g.beginPath();
  g.arc(x, y, 8, 0, Math.PI * 2);
  g.fillStyle = selected ? ACCENT : '#c6ced8';
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - 4, y); g.lineTo(x - 1, y + 3); g.lineTo(x + 4.5, y - 3.5);
  g.stroke();
  g.lineWidth = 1;
}

export function pathPoly(g, poly, scale = 1, ox = 0, oy = 0) {
  g.beginPath();
  poly.forEach((p, i) => {
    const x = ox + p.x * scale, y = oy + p.y * scale;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.closePath();
}

export function exactSubset(stateSel, answer, total) {
  const target = new Set(answer);
  let correct = 0, selected = 0, truePositive = 0;
  for (let i = 0; i < total; i++) {
    const on = !!stateSel[i], wanted = target.has(i);
    if (on) { selected++; if (wanted) truePositive++; }
    if (on === wanted) correct++;
  }
  return {
    success: selected === target.size && truePositive === target.size,
    partial: correct / total,
    error: total - correct,
    detail: { selected, target: target.size },
  };
}

export function drawSmallLabel(g, text, x, y, color = '#6d7886', align = 'center') {
  g.font = `600 10px ${UI_FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}
