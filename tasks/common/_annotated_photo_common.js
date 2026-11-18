import annotations from '../assets/openimages_spatial/annotations.json' with { type: 'json' };
import { loadImage } from '../core/assets.js';
import { drawCover } from '../skins/draw.js';

export const ANNOTATED_IMAGES = annotations.images;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function cleanBoxes(image, predicate = () => true) {
  return image.bboxes.filter((box) => box.box && !box.flags?.group_of && predicate(box));
}

export function cropFor(box, pad = 0.10) {
  const b = box.box;
  const cx = (b.x_min + b.x_max) / 2, cy = (b.y_min + b.y_max) / 2;
  const side = Math.min(1, Math.max(b.x_max - b.x_min, b.y_max - b.y_min) * (1 + pad * 2));
  return { x: clamp(cx - side / 2, 0, 1 - side), y: clamp(cy - side / 2, 0, 1 - side), w: side, h: side };
}

export async function mountPhoto(env, key = 'photo') {
  const file = env.manifest[key] || env.manifest.photo;
  try { env.assets.photo = await loadImage(`assets/openimages_spatial/${file}`); }
  catch { env.assets.photo = null; }
}

export function drawCrop(g, image, crop, rect, dim = 0) {
  if (!image) { g.fillStyle = '#d6dde6'; g.fillRect(rect.x, rect.y, rect.w, rect.h); return; }
  g.drawImage(image, crop.x * image.width, crop.y * image.height, crop.w * image.width, crop.h * image.height, rect.x, rect.y, rect.w, rect.h);
  if (dim) { g.fillStyle = `rgba(14,24,36,${dim})`; g.fillRect(rect.x, rect.y, rect.w, rect.h); }
}

export function drawPhoto(g, image, rect, dim = 0) {
  if (!image) { g.fillStyle = '#d6dde6'; g.fillRect(rect.x, rect.y, rect.w, rect.h); return; }
  drawCover(g, image, rect, { dim });
}
