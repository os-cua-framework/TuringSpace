const r4 = (v) => Math.round(v * 1e4) / 1e4;

import { nthOf } from '../core/style.js';

export const HELD_OUT_OI = new Set(['13d3f1e5893726a2', '1b8500e0e4938e77', '1e6efc60e52f7919', '29591bfd4323db02', '2ebea253f54ba55f',
  '2ed000d799794d71', '363b20c1602ae5fb', '3f6e15958d41abf9', '7562a43f192ef66c', '7b1eec52a7a1797b', '7fd5956f7309f792',
  '9f791f1ac0364b02', 'a234b17c1813407c', 'a86c99772420c77e', 'aeb082b467a2c39e', 'cdb2b707ef94db2c', 'd03a9e6293d18e28',
  'd0bbfdd40af35fcc', 'd662cae8df39d292', 'dea2fdb1a77ec6bb', 'e456b97c9d61ff57', 'e565161c2d46d6a3', 'e58d2046f8b18ff0',
  'fcfbd8e754fea64f']);

export function extPhotos(knobs, ok) {
  const has = ok instanceof Set ? (id) => ok.has(id) : (id) => Object.prototype.hasOwnProperty.call(ok, id);
  return ((knobs.v2 && knobs.v2.pools && knobs.v2.pools.photo) || []).filter((p) => p.split === knobs.ext && has(p.id) && !HELD_OUT_OI.has(p.id));
}

export const nthItem = (pool, key, knobs) => pool[nthOf(key, Number.isFinite(knobs.n) ? knobs.n : 1, pool.length)];

export const imgId = (f) => String(f || '').replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');

export function coverCrop(p, aspect, zoom = 1, u = 0.5, v = 0.5) {
  const ir = p.w / p.h;
  let w = 1, h = 1;
  if (ir > aspect) w = aspect / ir; else h = ir / aspect;
  w /= zoom; h /= zoom;
  return { x: r4((1 - w) * u), y: r4((1 - h) * v), w: r4(w), h: r4(h) };
}

export function drawCropN(g, img, c, r) {
  g.drawImage(img, c.x * img.width, c.y * img.height, c.w * img.width, c.h * img.height, r.x, r.y, r.w, r.h);
}

export const photoFileUrl = (p) => 'assets/' + p;
