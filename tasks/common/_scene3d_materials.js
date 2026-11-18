export function paintMaterial(g, kind, point, camera, front = () => true) {
  if (kind !== 'wood' && kind !== 'cloth') return;
  const a = camera.project(point(0, 0.5)), b = camera.project(point(1, 0.5));
  g.save();
  g.lineWidth = Math.max(0.35, Math.min(0.7, Math.hypot(a.x - b.x, a.y - b.y) * 0.006));
  g.lineCap = 'round';
  function line(curve, color, alpha, steps) {
    g.beginPath(); let drawing = false;
    for (let j = 0; j <= steps; j++) {
      const [u, v] = curve(j / steps);
      if (!front(u, v)) { drawing = false; continue; }
      const p = camera.project(point(u, v));
      if (drawing) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
      drawing = true;
    }
    g.strokeStyle = `rgba(${color},${alpha})`; g.stroke();
  }
  if (kind === 'wood') {
    for (let i = 0; i < 13; i++) {
      const offset = (i + 0.65 + 0.17 * Math.sin(i * 2.41)) / 14;
      const grain = (t) => offset + 0.018 * Math.sin(t * 8.1 + i * 1.73) + 0.008 * Math.sin(t * 18.7 + i * 0.83);
      line((t) => [t, grain(t)], '76,53,36', 0.11, 32);
      line((t) => [t, grain(t) + 0.006], '245,228,201', 0.05, 32);
    }
  } else {
    for (let row = 0; row < 16; row++) for (let col = 0; col < 18; col++) {
      const u = 0.07 + (row + 0.2 * Math.sin(col * 1.91)) * 0.86 / 16;
      const v = (col + 0.5 + 0.27 * Math.sin(row * 2.17 + col)) / 18;
      const alpha = 0.095 * Math.sin(Math.PI * u);
      line((t) => [u + (t - 0.5) * 0.027, v + (t - 0.5) * 0.018 + 0.003 * Math.sin(t * Math.PI)],
        (row + col) % 2 ? '238,239,230' : '38,46,58', alpha, 3);
    }
  }
  g.restore();
}
