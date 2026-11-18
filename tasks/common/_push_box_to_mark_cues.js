import { footprintAtGround } from './_scene3d.js';
import { mock, hull, shape } from './_clay_feature_geometry.js';
import { featureCircle } from './_table_view_features.js';
import { seatPaintCover } from './_seat_feature_geometry.js';
import { expandConvex, ringCover, visibleDisk } from '../core/feature-geometry.js';

export const cueContext = mock;

export function quickVisibility(m, built, world) {
  const { scene, camera } = built;
  scene.render({ background: false });
  const order = scene.orderDiagnostics.order, covers = scene.queue.map((p) => seatPaintCover(p, camera));
  const bodies = built.geometry.bodies.map((body) => {
    const index = body.queueIndices[0], later = order.slice(order.indexOf(index) + 1).filter((i) => !body.queueIndices.includes(i));
    return { id: body.id, diameter: 2 * visibleDisk([shape(scene.queue[index], camera).inner], later.map((i) => covers[i]), 0).r };
  });
  const marks = m.marks.map((mark) => {
    const tile = built.tiles.find((t) => t.x === mark.x && t.y === mark.y);
    return { cell: mark, diameter: 2 * visibleDisk([expandConvex(hull(tile.corners.map(camera.project)), -1.8)], covers, 0).r };
  });
  return { bodies, marks };
}
const pad = (poly) => hull(poly.flatMap((p) => featureCircle(p, 0.75, 16)));

function shadowCover(primitive, built) {
  const y = primitive.shadowY || 0;
  const points = hull(footprintAtGround(primitive, built.scene.light, y).map((p) => built.camera.project({ x: p.x, y, z: p.z })));
  if (points.length < 3) return null;
  const c = points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), { x: 0, y: 0 });
  return pad(hull(points.map((p) => {
    const x = p.x - c.x, yy = p.y - c.y, d = Math.hypot(x, yy) || 1, k = 1 + Math.max(0.2 * d, 2.4) / d;
    return { x: c.x + x * k, y: c.y + yy * k };
  })));
}

export function pushCues(m, built, world) {
  const { scene, camera } = built, features = [], bodies = [];
  scene.render({ background: false });
  const order = scene.orderDiagnostics.order;
  if (order.length !== scene.queue.length) throw new Error('Unbound painter queue item');
  const bodyCovers = scene.queue.map((p) => seatPaintCover(p, camera));
  for (const body of built.geometry.bodies) {
    const index = body.queueIndices[0], later = order.slice(order.indexOf(index) + 1).filter((i) => !body.queueIndices.includes(i));
    const w = visibleDisk([shape(scene.queue[index], camera).inner], later.map((i) => bodyCovers[i]), 1.5);
    features.push({ id: `initial-${body.id}-visible`, kind: 'discriminator', differencePx: 2 * w.r });
    bodies.push({ id: body.id, diameter: 2 * w.r, witness: { x: w.x, y: w.y, r: w.r }, queueIndex: index, later });
  }
  const shadowCovers = scene.queue.filter((p) => p.shadowY !== null).map((p) => shadowCover(p, built)).filter(Boolean);
  const marks = [];
  for (const [index, mark] of m.marks.entries()) {
    const tile = built.tiles.find((t) => t.x === mark.x && t.y === mark.y);
    const polygon = expandConvex(hull(tile.corners.map(camera.project)), -1.8);
    const centre = camera.project(world(mark.x, mark.y, 0));
    const covers = bodyCovers.concat(shadowCovers, ringCover(centre.x, centre.y, 7.75, 4.5));
    const w = visibleDisk([polygon], covers, 1.5);
    features.push({ id: `initial-mark${index}-visible`, kind: 'discriminator', differencePx: 2 * w.r });
    marks.push({ index, cell: mark, diameter: 2 * w.r, witness: { x: w.x, y: w.y, r: w.r } });
  }
  return {
    features, bodies, marks,
    complete: features.every((f) => f.differencePx >= 3),
    scope: 'Initial glowing tiles, every crate and pillar and the mover, from the puzzle\'s own camera azimuth. Body certificates subtract the tight hull of every later-painted primitive; mark certificates use the visible turquoise interior outside the white ring, with every body and every contact-shadow ring treated as opaque. Later crate/mover moves may cover a mark.',
  };
}
