export const CHAR_COLORS = ['#e8483f', '#ff8c1a', '#ffd21f', '#39c26d', '#18b5a3', '#2f8ef5', '#8f5bf0', '#f04fa0'];

export function drawCover(g, img, r, { dim = 0 } = {}) {
  const ir = img.width / img.height, rr = r.w / r.h;
  let sw, sh, sx, sy;
  if (ir > rr) { sh = img.height; sw = sh * rr; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / rr; sx = 0; sy = (img.height - sh) / 2; }
  g.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
  if (dim > 0) {
    g.fillStyle = `rgba(0,0,0,${dim})`;
    g.fillRect(r.x, r.y, r.w, r.h);
  }
}

export function plainBoard(g, r) {
  g.fillStyle = '#eef1f4';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = '#dde2e8';
  for (let x = r.x + 20; x < r.x + r.w; x += 20) {
    g.beginPath(); g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); g.stroke();
  }
  for (let y = r.y + 20; y < r.y + r.h; y += 20) {
    g.beginPath(); g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); g.stroke();
  }
}

export function drawGlyph(g, { ch, x, y, size, rot = 0, shear = 0, flipH = false, flipV = false, font, color }) {
  g.save();
  g.translate(x, y);
  g.rotate((rot * Math.PI) / 180);
  if (flipH || flipV) g.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  if (shear) g.transform(1, 0, shear, 1, 0, 0);
  g.font = `${size}px "${font}"`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 4;
  g.shadowOffsetX = 1.5;
  g.shadowOffsetY = 1.5;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.lineWidth = Math.max(2.5, size * 0.09);
  g.strokeText(ch, 0, 0);
  g.shadowColor = 'transparent';
  g.fillStyle = color;
  g.fillText(ch, 0, 0);
  g.restore();
}

export function drawBadge(g, x, y, n) {
  g.save();
  g.beginPath();
  g.arc(x, y, 13, 0, Math.PI * 2);
  g.fillStyle = 'rgba(25,145,250,.92)';
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = 4;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 2;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 14px -apple-system, "PingFang SC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), x, y + 0.5);
  g.restore();
}

export function promptThumb(g, x, y, s, drawContent, done) {
  g.save();
  g.fillStyle = done ? '#f0f9f4' : '#fff';
  g.strokeStyle = done ? '#5bbd8b' : '#d9dee4';
  g.lineWidth = 1;
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, s, s, 5); else g.rect(x, y, s, s);
  g.fill(); g.stroke();
  drawContent(x, y, s);
  if (done) {
    g.strokeStyle = '#34a46f'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x + s * 0.22, y + s * 0.55);
    g.lineTo(x + s * 0.42, y + s * 0.74);
    g.lineTo(x + s * 0.8, y + s * 0.28);
    g.stroke();
  }
  g.restore();
}
