import { loadImage } from '../core/assets.js';

export const PHOTO_SCALE = 2;

export const noText = (p) => !p.text;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}

export function coverRect(img, bw, bh, z = 1, fx = 0.5, fy = 0.5) {
  const ir = img.width / img.height, br = bw / bh;
  let sw, sh;
  if (ir > br) { sh = img.height; sw = sh * br; } else { sw = img.width; sh = sw / br; }
  sw /= z; sh /= z;
  return { sx: (img.width - sw) * fx, sy: (img.height - sh) * fy, sw, sh };
}

function drawFrame(g, img, f, w, h) {
  g.save();
  if (f.flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(img, f.sx, f.sy, f.sw, f.sh, 0, 0, w, h);
  g.restore();
}

function lumOf(img, f, bw, bh) {
  const c = makeCanvas(bw, bh), g = c.getContext('2d', { willReadFrequently: true });
  drawFrame(g, img, f, bw, bh);
  const d = g.getImageData(0, 0, bw, bh).data, L = new Float32Array(bw * bh);
  for (let i = 0; i < L.length; i++) L[i] = (0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]) / 255;
  return L;
}

export function regionStats(L, bw, bh, r) {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(bw, Math.ceil(r.x + r.w)), y1 = Math.min(bh, Math.ceil(r.y + r.h));
  let n = 0, s = 0, s2 = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = L[y * bw + x]; n++; s += v; s2 += v * v; }
  if (!n) return { mean: 0.5, std: 0 };
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}

export async function framePhoto(style, photo, bw, bh, { zoom = [1, 1.5], flip = true, tries = 8, score = null } = {}) {
  const img = await loadImage('assets/' + photo.file);
  const rnd = style.rand;
  const cands = [];
  for (let k = 0; k < tries; k++) {
    const z = k === 0 ? 1 : zoom[0] + rnd() * (zoom[1] - zoom[0]);
    const fx = k === 0 ? 0.5 : rnd(), fy = k === 0 ? 0.5 : rnd();
    cands.push({ ...coverRect(img, bw, bh, z, fx, fy), z, flip: flip && rnd() < 0.5 });
  }
  let best = cands[0], bestL = null, bestS = -Infinity;
  if (score) {
    for (const f of cands) {
      const L = lumOf(img, f, bw, bh), s = score(L, f);
      if (s > bestS) { bestS = s; best = f; bestL = L; }
    }
  } else best = cands[1 + Math.floor(rnd() * (cands.length - 1))] || cands[0];
  if (!bestL) bestL = lumOf(img, best, bw, bh);
  const canvas = makeCanvas(bw * PHOTO_SCALE, bh * PHOTO_SCALE);
  drawFrame(canvas.getContext('2d'), img, best, canvas.width, canvas.height);
  style.note(`frame:z${best.z.toFixed(2)}${best.flip ? ':flip' : ''}`);
  return { img, frame: best, canvas, L: bestL };
}
