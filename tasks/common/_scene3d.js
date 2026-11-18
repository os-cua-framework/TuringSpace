import {
  rad3, dot3, sub3, unit3, makeCamera, drawGroundGrid,
} from './_proj3d.js';
import { paintMaterial } from './_scene3d_materials.js';

const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale3 = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cross3 = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const mean3 = (ps) => {
  const s = ps.reduce((a, p) => add3(a, p), { x: 0, y: 0, z: 0 });
  return scale3(s, 1 / (ps.length || 1));
};
const basisPerp = (u) => {
  const ref = Math.abs(u.y) > 0.94 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const e1 = unit3(cross3(u, ref));
  const e2 = unit3(cross3(u, e1));
  return [e1, e2];
};

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const hexRGB = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbStr = (c) => `rgb(${clampByte(c.r)},${clampByte(c.g)},${clampByte(c.b)})`;
const mixRGB = (a, b, t) => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});
const r3 = (x) => Math.round(x * 1000) / 1000;

export const CLAY = {
  red: '#c98a78', blue: '#8ba1c6', yellow: '#d6bd86', green: '#8fb795',
  purple: '#a794c0', teal: '#84afb1', slate: '#9fb0bd', wood: '#b89a76',
  bark: '#9c8064', leaf: '#8bae83', wall: '#dacbb0', roof: '#bb8a78',
  skin: '#d8b79c', cloth: '#7f93b8', stone: '#c3c1b4', white: '#eef1f4',
  hair: '#5b4a42', eye: '#3c3430', door: '#7d5f4a', glass: '#a8c4d4',
};

export const GROUND_EXTENT = 460;
export const GROUND_SURFACE = Object.freeze({
  id: 'floor', type: 'rect', x: 0, y: 0, z: 0,
  w: GROUND_EXTENT * 2, d: GROUND_EXTENT * 2,
});

export function makeLight({
  dir = { x: -0.5, y: 0.8, z: 0.35 },
  ambient = 0.38, warm = '#fff4e6', cool = '#dfe6f2',
} = {}) {
  return {
    dir: unit3(dir), ambient, warm, cool,
    warmRGB: hexRGB(warm), coolRGB: hexRGB(cool),
  };
}
const DEFAULT_LIGHT = makeLight();

function shadeRGB(baseRGB, n, light) {
  const ndl = Math.max(0, dot3(n, light.dir));
  const k = light.ambient + (1 - light.ambient) * ndl;
  const tint = mixRGB(light.coolRGB, light.warmRGB, ndl);
  return {
    r: baseRGB.r * k * (tint.r / 255),
    g: baseRGB.g * k * (tint.g / 255),
    b: baseRGB.b * k * (tint.b / 255),
  };
}
export function shadeFace(baseHex, normal, light = DEFAULT_LIGHT) {
  return rgbStr(shadeRGB(hexRGB(baseHex), unit3(normal), light));
}

function fogRGB(baseRGB, fog, depth) {
  if (!fog) return baseRGB;
  const amt = Math.max(0, Math.min(1, (depth - fog.near) / (fog.far - fog.near))) * fog.max;
  return mixRGB(baseRGB, hexRGB(fog.color), amt);
}

function localToWorld(x, z, yawDeg, by, lx, ly, lz) {
  const a = rad3(yawDeg || 0), ca = Math.cos(a), sa = Math.sin(a);
  return { x: x + lx * ca + lz * sa, y: by + ly, z: z - lx * sa + lz * ca };
}

function boxVerts(o) {
  const by = o.y || 0, out = [];
  for (const lx of [-o.w / 2, o.w / 2]) for (const ly of [0, o.h]) for (const lz of [-o.d / 2, o.d / 2])
    out.push(localToWorld(o.x, o.z, o.yawDeg, by, lx, ly, lz));
  return out;
}
function boxFaces(o) {
  const a = rad3(o.yawDeg || 0), ca = Math.cos(a), sa = Math.sin(a);
  return [
    { idx: [0, 1, 5, 4], n: { x: 0, y: -1, z: 0 } },
    { idx: [2, 3, 7, 6], n: { x: 0, y: 1, z: 0 } },
    { idx: [0, 2, 6, 4], n: { x: -sa, y: 0, z: -ca } },
    { idx: [1, 3, 7, 5], n: { x: sa, y: 0, z: ca } },
    { idx: [0, 1, 3, 2], n: { x: -ca, y: 0, z: sa } },
    { idx: [4, 5, 7, 6], n: { x: ca, y: 0, z: -sa } },
  ];
}

function wedgeEffYaw(o) { return (o.yawDeg || 0) + ((o.slopeDir < 0) ? 180 : 0); }
function wedgeVerts(o) {
  const by = o.y || 0, ey = wedgeEffYaw(o), P = (lx, ly, lz) => localToWorld(o.x, o.z, ey, by, lx, ly, lz);
  return [
    P(-o.w / 2, 0, -o.d / 2), P(-o.w / 2, 0, o.d / 2),
    P(o.w / 2, 0, -o.d / 2), P(o.w / 2, 0, o.d / 2),
    P(o.w / 2, o.h, -o.d / 2), P(o.w / 2, o.h, o.d / 2),
  ];
}
const WEDGE_FACES = [[0, 1, 3, 2], [2, 3, 5, 4], [0, 1, 5, 4], [0, 2, 4], [1, 3, 5]];

function ringPoints(c, u, r, N) {
  const [e1, e2] = basisPerp(u), out = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    out.push(add3(c, add3(scale3(e1, r * Math.cos(t)), scale3(e2, r * Math.sin(t)))));
  }
  return out;
}

export function prismVertices(p) {
  return p.polygon.map(v => ({ x: v.x, y: p.y, z: v.z }))
    .concat(p.polygon.map(v => ({ x: v.x, y: p.y + p.h, z: v.z })));
}
export function polygonAreaXZ(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}
export function clipHalfPlaneXZ(poly, a, b, inside = true) {
  const side = p => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dp = side(p), dq = side(q);
    const pin = inside ? dp >= 0 : dp <= 0, qin = inside ? dq >= 0 : dq <= 0;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
    }
  }
  const clean = [];
  for (const p of out) if (!clean.length || Math.hypot(p.x - clean.at(-1).x, p.z - clean.at(-1).z) > 1e-10) clean.push(p);
  if (clean.length > 1 && Math.hypot(clean[0].x - clean.at(-1).x, clean[0].z - clean.at(-1).z) <= 1e-10) clean.pop();
  return clean;
}
export function boxFootprint(p) {
  const v = boxVerts(p), polygon = [v[0], v[1], v[5], v[4]].map(({ x, z }) => ({ x, z }));
  return polygonAreaXZ(polygon) >= 0 ? polygon : polygon.reverse();
}
function footprintOverlap(a, b) {
  let polygon = a.type === 'prism' ? a.polygon : boxFootprint(a);
  const clip = b.type === 'prism' ? b.polygon : boxFootprint(b);
  for (let i = 0; i < clip.length && polygon.length >= 3; i++)
    polygon = clipHalfPlaneXZ(polygon, clip[i], clip[(i + 1) % clip.length]);
  return polygon.length >= 3 && Math.abs(polygonAreaXZ(polygon)) > 1e-10;
}

function worldSamples(p) {
  switch (p.type) {
    case 'box': return boxVerts(p);
    case 'prism': return prismVertices(p);
    case 'wedge': return wedgeVerts(p);
    case 'cylinder': {
      const u = unit3(p.axis), top = add3(p.base, p.axis);
      return ringPoints(p.base, u, p.r, 16).concat(ringPoints(top, u, p.r, 16));
    }
    case 'cone': {
      const u = unit3(p.up), apex = add3(p.base, scale3(u, p.height));
      return ringPoints(p.base, u, p.r, 16).concat([apex]);
    }
    case 'sphere': case 'hemisphere': {
      const c = p.c, r = p.r;
      return [
        { x: c.x + r, y: c.y, z: c.z }, { x: c.x - r, y: c.y, z: c.z },
        { x: c.x, y: c.y + r, z: c.z }, { x: c.x, y: c.y - r, z: c.z },
        { x: c.x, y: c.y, z: c.z + r }, { x: c.x, y: c.y, z: c.z - r },
      ];
    }
    case 'capsule': {
      const f = (c) => [
        { x: c.x + p.r, y: c.y, z: c.z }, { x: c.x - p.r, y: c.y, z: c.z },
        { x: c.x, y: c.y + p.r, z: c.z }, { x: c.x, y: c.y - p.r, z: c.z },
        { x: c.x, y: c.y, z: c.z + p.r }, { x: c.x, y: c.y, z: c.z - p.r },
      ];
      return f(p.a).concat(f(p.b));
    }
    default: return [primCenter(p)];
  }
}

function primCenter(p) {
  switch (p.type) {
    case 'sphere': case 'hemisphere': return p.c;
    case 'cylinder': return add3(p.base, scale3(p.axis, 0.5));
    case 'cone': return add3(p.base, scale3(unit3(p.up), p.height * 0.4));
    case 'capsule': return scale3(add3(p.a, p.b), 0.5);
    default: return mean3(worldSamples(p));
  }
}

export function supportGap(p) {
  switch (p.type) {
    case 'box': case 'wedge': case 'prism': return p.y || 0;
    case 'cylinder': {
      const u = unit3(p.axis), top = add3(p.base, p.axis);
      const lo = Math.min(...ringPoints(p.base, u, p.r, 8).concat(ringPoints(top, u, p.r, 8)).map((q) => q.y));
      return lo;
    }
    case 'cone': {
      const u = unit3(p.up), apex = add3(p.base, scale3(u, p.height));
      return Math.min(apex.y, ...ringPoints(p.base, u, p.r, 8).map((q) => q.y));
    }
    case 'sphere': return p.c.y - p.r;
    case 'hemisphere': {
      const up = unit3(p.up);
      return up.y >= 0 ? p.c.y - p.r * Math.sqrt(Math.max(0, 1 - up.y * up.y)) : p.c.y - p.r;
    }
    case 'capsule': return Math.min(p.a.y, p.b.y) - p.r;
    default: return Math.min(...worldSamples(p).map((q) => q.y));
  }
}

export function primTopY(p) {
  let hi = -Infinity;
  for (const v of worldSamples(p)) if (v.y > hi) hi = v.y;
  return hi;
}

export function xzBounds(p) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const v of worldSamples(p)) {
    if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
    if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
  }
  return { x0, x1, z0, z1 };
}

export function footprintAtGround(p, light = DEFAULT_LIGHT, groundY = 0) {
  const dy = Math.abs(light.dir.y) < 0.15 ? 0.15 * Math.sign(light.dir.y || 1) : light.dir.y;
  const drop = (v) => {
    const t = Math.max(0, Math.min((v.y - groundY) / dy, 900));
    return { x: v.x - light.dir.x * t, z: v.z - light.dir.z * t };
  };
  let base;
  switch (p.type) {
    case 'box': { const V = boxVerts(p); base = [V[0], V[1], V[5], V[4]]; break; }
    case 'prism': base = p.polygon.map(v => ({ x: v.x, y: p.y, z: v.z })); break;
    case 'wedge': { const V = wedgeVerts(p); base = [V[0], V[1], V[3], V[2]]; break; }
    case 'cylinder': base = ringPoints(p.base, unit3(p.axis), p.r, 12); break;
    case 'cone': base = ringPoints(p.base, unit3(p.up), p.r, 12); break;
    case 'sphere': base = ringPoints({ x: p.c.x, y: p.c.y, z: p.c.z }, { x: 0, y: 1, z: 0 }, p.r, 12); break;
    case 'hemisphere': base = ringPoints(p.c, unit3(p.up), p.r, 12); break;
    case 'capsule':
      base = ringPoints(p.a, { x: 0, y: 1, z: 0 }, p.r, 12).concat(ringPoints(p.b, { x: 0, y: 1, z: 0 }, p.r, 12));
      break;
    default: base = worldSamples(p);
  }
  return base.map(drop);
}

function insideXZ(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > pt.z) !== (b.z > pt.z)
      && pt.x < a.x + (b.x - a.x) * (pt.z - a.z) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}

export function receivingSurface(caster, prims, light = DEFAULT_LIGHT) {
  const sy = caster.shadowY || 0;
  if (!(sy > 0)) return null;
  const cands = [];
  for (const p of prims) {
    if (p === caster) continue;
    if (p.type === 'box' && Math.abs((p.y || 0) + p.h - sy) <= 0.5) {
      const V = boxVerts(p);
      cands.push({ poly: [V[2], V[3], V[7], V[6]], box: p });
    } else if (p.type === 'prism' && Math.abs(p.y + p.h - sy) <= 0.5) {
      cands.push({ poly: p.polygon.map(v => ({ x: v.x, y: sy, z: v.z })), box: null });
    } else if (p.type === 'cylinder') {
      const u = unit3(p.axis), top = add3(p.base, p.axis);
      if (u.y > 0.99 && Math.abs(top.y - sy) <= 0.5) {
        cands.push({ poly: ringPoints(top, { x: 0, y: 1, z: 0 }, p.r, 24), box: null });
      }
    }
  }
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const fp = footprintAtGround(caster, light, sy);
  const c = { x: 0, z: 0 };
  for (const q of fp) { c.x += q.x; c.z += q.z; }
  c.x /= fp.length; c.z /= fp.length;
  const holder = cands.find((s) => insideXZ(c, s.poly));
  if (holder) return holder;
  const d2 = (s) => {
    let sx = 0, sz = 0;
    for (const q of s.poly) { sx += q.x; sz += q.z; }
    sx /= s.poly.length; sz /= s.poly.length;
    return (sx - c.x) ** 2 + (sz - c.z) ** 2;
  };
  return cands.reduce((a, b) => (d2(b) < d2(a) ? b : a));
}

export function screenBounds(p, camera) {
  const ps = worldSamples(p).map(camera.project);
  return {
    x0: Math.min(...ps.map((q) => q.x)), x1: Math.max(...ps.map((q) => q.x)),
    y0: Math.min(...ps.map((q) => q.y)), y1: Math.max(...ps.map((q) => q.y)),
  };
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

function boxPaintData(prim, camera) {
  const world = prim.type === 'prism' ? prismVertices(prim) : boxVerts(prim);
  const screen = world.map(camera.project), hull = convexHull(screen);
  const yaw = rad3(prim.yawDeg || 0);
  const axes = prim.type === 'prism'
    ? [{ x: 0, y: 1, z: 0 }, ...prim.polygon.map((a, i) => {
      const b = prim.polygon[(i + 1) % prim.polygon.length];
      return unit3({ x: b.z - a.z, y: 0, z: a.x - b.x });
    })]
    : [{ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }, { x: 0, y: 1, z: 0 },
      { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }];
  const rayProjection = !!camera.cam && world.every((p, i) => {
    const q = camera.project(add3(camera.cam, scale3(sub3(p, camera.cam), 2)));
    return screen[i].depth > 0 && Math.hypot(q.x - screen[i].x, q.y - screen[i].y) < 1e-6;
  });
  return { world, hull, axes, rayProjection, prism: prim.type === 'prism' };
}
function projectedBoxOverlap(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.hypot(dx, dy); if (!length) continue;
    const project = (v) => (-dy * v.x + dx * v.y) / length;
    const A = a.map(project), B = b.map(project);
    if (Math.min(...A) >= Math.max(...B) - 1e-7 || Math.min(...B) >= Math.max(...A) - 1e-7) return false;
  }
  return true;
}
function preparedBoxPaintRelation(a, b, camera) {
  if (!a.rayProjection || !b.rayProjection) return { status: 'unproven', reason: 'non_pinhole_or_behind_camera' };
  if (!projectedBoxOverlap(a.hull, b.hull)) return { status: 'disjoint_projection' };
  const prismHalfspace = a.prism || b.prism;
  let separated = false;
  for (const axis of [...a.axes, ...b.axes]) {
    const A = a.world.map((p) => dot3(p, axis)), B = b.world.map((p) => dot3(p, axis));
    const a0 = Math.min(...A), a1 = Math.max(...A), b0 = Math.min(...B), b1 = Math.max(...B), eye = dot3(camera.cam, axis);
    if (a1 <= b0 + 1e-7) {
      separated = true;
      if (eye > (prismHalfspace ? b0 : b1) + 1e-7) return { status: 'certified', far: 0, near: 1, axis, gap: b0 - a1, eye, intervals: [[a0, a1], [b0, b1]] };
      if (eye < (prismHalfspace ? a1 : a0) - 1e-7) return { status: 'certified', far: 1, near: 0, axis, gap: b0 - a1, eye, intervals: [[a0, a1], [b0, b1]] };
    }
    if (b1 <= a0 + 1e-7) {
      separated = true;
      if (eye > (prismHalfspace ? a0 : a1) + 1e-7) return { status: 'certified', far: 1, near: 0, axis, gap: a0 - b1, eye, intervals: [[a0, a1], [b0, b1]] };
      if (eye < (prismHalfspace ? b1 : b0) - 1e-7) return { status: 'certified', far: 0, near: 1, axis, gap: a0 - b1, eye, intervals: [[a0, a1], [b0, b1]] };
    }
  }
  return { status: 'unproven', reason: separated ? 'camera_not_beyond_separating_plane' : 'overlapping_boxes' };
}
export function boxPaintRelation(a, b, camera) {
  return preparedBoxPaintRelation(boxPaintData(a, camera), boxPaintData(b, camera), camera);
}
const polyPath = (g, pts) => { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); };
function roundedPath(g, pts, rad) {
  const n = pts.length; if (n < 3) { polyPath(g, pts); return; }
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const dP = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const dN = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const a = lerp(cur, prev, Math.min(0.5, rad / dP));
    const b = lerp(cur, next, Math.min(0.5, rad / dN));
    if (i === 0) g.moveTo(a.x, a.y); else g.lineTo(a.x, a.y);
    g.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  g.closePath();
}

const AO_STROKE = 'rgba(30,36,44,.22)';
const SHADOW_RGB = { r: 28, g: 34, b: 46 };

const PENUMBRA = [[0.20, 2.4, 0.05], [0.09, 1.2, 0.07]];
const CORE_RINGS = [[1.0, 0.10], [0.82, 0.18], [0.62, 0.26], [0.40, 0.34]];

function paintShadow(g, prim, camera, light, prims) {
  const sy = prim.shadowY || 0;
  const fp = footprintAtGround(prim, light, sy).map((q) => camera.project({ x: q.x, y: sy, z: q.z }));
  const hull = convexHull(fp);
  if (hull.length < 3) return;
  const surf = prims ? receivingSurface(prim, prims, light) : null;
  if (surf) {
    const pts = surf.poly.map((q) => camera.project(q));
    g.save();
    if (surf.box && surf.box.round > 0) {
      const V = boxVerts(surf.box).map(camera.project);
      const w = Math.max(...V.map((q) => q.x)) - Math.min(...V.map((q) => q.x));
      const h = Math.max(...V.map((q) => q.y)) - Math.min(...V.map((q) => q.y));
      roundedPath(g, pts, Math.min(w, h) * 0.16);
    } else {
      polyPath(g, pts);
    }
    g.clip();
  }
  const c = { x: hull.reduce((s, q) => s + q.x, 0) / hull.length, y: hull.reduce((s, q) => s + q.y, 0) / hull.length };
  const fill = (pts, al) => {
    polyPath(g, pts);
    g.fillStyle = `rgba(${SHADOW_RGB.r},${SHADOW_RGB.g},${SHADOW_RGB.b},${al})`;
    g.fill();
  };
  for (const [frac, minPx, al] of PENUMBRA) {
    fill(hull.map((q) => {
      const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy) || 1;
      const k = (d + Math.max(frac * d, minPx)) / d;
      return { x: c.x + dx * k, y: c.y + dy * k };
    }), al);
  }
  for (const [sc, al] of CORE_RINGS) {
    fill(hull.map((q) => ({ x: c.x + (q.x - c.x) * sc, y: c.y + (q.y - c.y) * sc })), al);
  }
  if (surf) g.restore();
}

function paintBox(g, p, camera, light, fog) {
  const world = boxVerts(p), V = world.map(camera.project);
  const baseFog = fogRGB(hexRGB(p.color), fog, camera.project(primCenter(p)).depth);
  const faces = boxFaces(p).map((f) => ({
    pts: f.idx.map((k) => V[k]), world: f.idx.map((k) => world[k]), n: f.n,
    depth: f.idx.reduce((s, k) => s + V[k].depth, 0) / f.idx.length,
  })).filter((f) => dot3(f.n, camera.f) < 0)
    .sort((a, b) => b.depth - a.depth);
  const round = p.round > 0;
  if (round) {
    const hull = convexHull(V);
    const w = Math.max(...hull.map((q) => q.x)) - Math.min(...hull.map((q) => q.x));
    const h = Math.max(...hull.map((q) => q.y)) - Math.min(...hull.map((q) => q.y));
    g.save(); roundedPath(g, hull, Math.min(w, h) * 0.16); g.clip();
  }
  for (const f of faces) {
    polyPath(g, f.pts);
    g.fillStyle = rgbStr(shadeRGB(baseFog, f.n, light)); g.fill();
    if (p.skin) { p.skin(g, { pts: f.pts, world: f.world, n: f.n, camera, prim: p }); polyPath(g, f.pts); }
    if (p.material === 'wood') {
      g.save(); g.clip();
      const [a, b, , d] = f.world;
      paintMaterial(g, p.material, (u, v) => add3(a, add3(scale3(sub3(d, a), u), scale3(sub3(b, a), v))), camera);
      g.restore(); polyPath(g, f.pts);
    }
    g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
  }
  if (round) {
    g.restore();
    const hull = convexHull(V);
    roundedPath(g, hull, Math.min(80, 20));
    g.strokeStyle = 'rgba(255,248,236,.42)'; g.lineWidth = 1.4; g.stroke();
  }
}

function paintCylinder(g, p, camera, light, fog) {
  const N = 24, u = unit3(p.axis), [e1, e2] = basisPerp(u);
  const top = add3(p.base, p.axis);
  const baseFog = fogRGB(hexRGB(p.color), fog, camera.project(primCenter(p)).depth);
  const botRim = ringPoints(p.base, u, p.r, N), topRim = ringPoints(top, u, p.r, N);
  const sBot = botRim.map(camera.project), sTop = topRim.map(camera.project);
  const hull = convexHull(sBot.concat(sTop));
  const a0 = camera.project(p.base), a1 = camera.project(top);
  let ax = { x: a1.x - a0.x, y: a1.y - a0.y };
  const al = Math.hypot(ax.x, ax.y) || 1; ax = { x: ax.x / al, y: ax.y / al };
  const perp = { x: -ax.y, y: ax.x };
  const coord = (s) => (s.x - a0.x) * perp.x + (s.y - a0.y) * perp.y;
  const all = hull.map(coord);
  const lo = Math.min(...all), hi = Math.max(...all), span = (hi - lo) || 1;
  const g0 = { x: a0.x + perp.x * lo, y: a0.y + perp.y * lo };
  const g1 = { x: a0.x + perp.x * hi, y: a0.y + perp.y * hi };
  const grad = g.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
  const mid = add3(p.base, scale3(p.axis, 0.5));
  const stops = [];
  for (let i = 0; i < 48; i++) {
    const t = (2 * Math.PI * i) / 48;
    const n = add3(scale3(e1, Math.cos(t)), scale3(e2, Math.sin(t)));
    if (dot3(n, camera.f) >= 0) continue;
    const s = camera.project(add3(mid, scale3(n, p.r)));
    stops.push({ o: (coord(s) - lo) / span, c: shadeRGB(baseFog, n, light) });
  }
  stops.sort((x, y) => x.o - y.o);
  applyStops(grad, stops);
  const capNear = a1.depth < a0.depth ? { rim: sTop, n: u } : { rim: sBot, n: scale3(u, -1) };
  const capFar = a1.depth < a0.depth ? { rim: sBot, n: scale3(u, -1) } : { rim: sTop, n: u };
  if (p.caps !== false) { polyPath(g, capFar.rim); g.fillStyle = rgbStr(shadeRGB(baseFog, capFar.n, light)); g.fill(); }
  polyPath(g, hull); g.fillStyle = grad; g.fill();
  if (p.skin) { p.skin(g, { pts: hull, curved: true, camera, prim: p }); polyPath(g, hull); }
  if (p.material) {
    g.save(); g.clip();
    const yaw = rad3(p.materialYaw || 0), ref = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const side = sub3(ref, scale3(u, dot3(ref, u)));
    const tangent = dot3(side, side) > 1e-12 ? unit3(side) : e1, around = cross3(u, tangent);
    const normal = (v) => add3(scale3(tangent, Math.cos(v * 2 * Math.PI)), scale3(around, Math.sin(v * 2 * Math.PI)));
    paintMaterial(g, p.material, (t, v) => add3(add3(p.base, scale3(p.axis, t)), scale3(normal(v), p.r)), camera,
      (_t, v) => dot3(normal(v), camera.f) < 0);
    g.restore(); polyPath(g, hull);
  }
  g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
  if (p.caps !== false) {
    polyPath(g, capNear.rim);
    g.fillStyle = rgbStr(shadeRGB(baseFog, capNear.n, light)); g.fill();
    if (p.skin) { p.skin(g, { pts: capNear.rim, cap: true, n: capNear.n, camera, prim: p }); polyPath(g, capNear.rim); }
    g.strokeStyle = AO_STROKE; g.stroke();
  }
}

function applyStops(grad, stops) {
  if (stops.length === 0) { grad.addColorStop(0, '#888'); grad.addColorStop(1, '#888'); return; }
  let last = -1;
  stops.forEach((s, i) => {
    let o = i === 0 ? 0 : i === stops.length - 1 ? 1 : Math.max(0, Math.min(1, s.o));
    if (o <= last) o = Math.min(1, last + 0.001);
    last = o;
    grad.addColorStop(r3(o), rgbStr(s.c));
  });
}

function paintSphere(g, p, camera, light, fog) {
  const c2 = camera.project(p.c);
  const edge = camera.project(add3(p.c, scale3(camera.r, p.r)));
  const R = Math.hypot(edge.x - c2.x, edge.y - c2.y) || 1;
  const emissive = !!p.emissive;
  const baseFog = emissive ? hexRGB(p.color) : fogRGB(hexRGB(p.color), fog, c2.depth);
  const lit = shadeRGB(baseFog, light.dir, light);
  const shad = shadeRGB(baseFog, scale3(light.dir, -1), light);
  const sub = camera.project(add3(p.c, scale3(light.dir, p.r * 0.7)));
  const grad = g.createRadialGradient(sub.x, sub.y, r3(R * 0.05), sub.x, sub.y, r3(R * 1.9));
  if (emissive) {
    grad.addColorStop(0, '#fffef7'); grad.addColorStop(0.55, rgbStr(baseFog)); grad.addColorStop(1, rgbStr(mixRGB(baseFog, { r: 120, g: 110, b: 90 }, 0.4)));
  } else {
    grad.addColorStop(0, rgbStr(lit)); grad.addColorStop(0.55, rgbStr(baseFog)); grad.addColorStop(1, rgbStr(shad));
  }
  g.beginPath(); g.arc(c2.x, c2.y, R, 0, 2 * Math.PI); g.fillStyle = grad; g.fill();
  if (p.skin) { p.skin(g, { circle: { x: c2.x, y: c2.y, r: R }, curved: true, camera, prim: p }); g.beginPath(); g.arc(c2.x, c2.y, R, 0, 2 * Math.PI); }
  if (!emissive) { g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke(); }
  const h = camera.project(add3(p.c, scale3(unit3(sub3(light.dir, camera.f)), p.r * 0.8)));
  const spec = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, r3(R * 0.4));
  spec.addColorStop(0, emissive ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.30)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  g.beginPath(); g.arc(c2.x, c2.y, R, 0, 2 * Math.PI); g.fillStyle = spec; g.fill();
}

function paintHemisphere(g, p, camera, light, fog) {
  const up = unit3(p.up);
  const c2 = camera.project(p.c);
  const edge = camera.project(add3(p.c, scale3(camera.r, p.r)));
  const R = Math.hypot(edge.x - c2.x, edge.y - c2.y) || 1;
  const baseFog = fogRGB(hexRGB(p.color), fog, c2.depth);
  const cutRim = ringPoints(p.c, up, p.r, 24).map(camera.project);
  polyPath(g, cutRim); g.fillStyle = rgbStr(shadeRGB(baseFog, up, light)); g.fill();
  if (p.skin) { p.skin(g, { pts: cutRim, cap: true, n: up, camera, prim: p }); polyPath(g, cutRim); }
  g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
  const apex = camera.project(add3(p.c, scale3(up, p.r)));
  const aDir = { x: apex.x - c2.x, y: apex.y - c2.y };
  const silPts = cutRim.slice();
  for (let i = 0; i < 24; i++) {
    const t = (2 * Math.PI * i) / 24;
    const q = { x: c2.x + R * Math.cos(t), y: c2.y + R * Math.sin(t) };
    if ((q.x - c2.x) * aDir.x + (q.y - c2.y) * aDir.y >= 0) silPts.push(q);
  }
  g.save();
  polyPath(g, convexHull(silPts));
  g.clip();
  const lit = shadeRGB(baseFog, light.dir, light), shad = shadeRGB(baseFog, scale3(light.dir, -1), light);
  const sub = camera.project(add3(p.c, scale3(light.dir, p.r * 0.7)));
  const grad = g.createRadialGradient(sub.x, sub.y, r3(R * 0.05), sub.x, sub.y, r3(R * 1.9));
  grad.addColorStop(0, rgbStr(lit)); grad.addColorStop(0.55, rgbStr(baseFog)); grad.addColorStop(1, rgbStr(shad));
  g.beginPath(); g.arc(c2.x, c2.y, R, 0, 2 * Math.PI); g.fillStyle = grad; g.fill();
  if (p.skin) p.skin(g, { circle: { x: c2.x, y: c2.y, r: R }, curved: true, camera, prim: p });
  g.restore();
}

function paintCone(g, p, camera, light, fog) {
  const N = 24, u = unit3(p.up), [e1, e2] = basisPerp(u);
  const apex = add3(p.base, scale3(u, p.height));
  const baseFog = fogRGB(hexRGB(p.color), fog, camera.project(primCenter(p)).depth);
  const rim = ringPoints(p.base, u, p.r, N), sRim = rim.map(camera.project);
  const sApex = camera.project(apex);
  const hull = convexHull(sRim.concat([sApex]));
  const a0 = camera.project(p.base);
  let ax = { x: sApex.x - a0.x, y: sApex.y - a0.y };
  const al = Math.hypot(ax.x, ax.y) || 1; ax = { x: ax.x / al, y: ax.y / al };
  const perp = { x: -ax.y, y: ax.x };
  const coord = (s) => (s.x - a0.x) * perp.x + (s.y - a0.y) * perp.y;
  const all = hull.map(coord), lo = Math.min(...all), hi = Math.max(...all), span = (hi - lo) || 1;
  const grad = g.createLinearGradient(a0.x + perp.x * lo, a0.y + perp.y * lo, a0.x + perp.x * hi, a0.y + perp.y * hi);
  const half = Math.atan2(p.r, p.height);
  const mid = add3(p.base, scale3(u, p.height * 0.4));
  const stops = [];
  for (let i = 0; i < 48; i++) {
    const t = (2 * Math.PI * i) / 48;
    const radial = add3(scale3(e1, Math.cos(t)), scale3(e2, Math.sin(t)));
    const n = unit3(add3(scale3(radial, Math.cos(half)), scale3(u, Math.sin(half))));
    if (dot3(n, camera.f) >= 0) continue;
    const s = camera.project(add3(mid, scale3(radial, p.r * 0.5)));
    stops.push({ o: (coord(s) - lo) / span, c: shadeRGB(baseFog, n, light) });
  }
  stops.sort((x, y) => x.o - y.o); applyStops(grad, stops);
  if (dot3(scale3(u, -1), camera.f) < 0) { polyPath(g, sRim); g.fillStyle = rgbStr(shadeRGB(baseFog, scale3(u, -1), light)); g.fill(); }
  polyPath(g, hull); g.fillStyle = grad; g.fill();
  if (p.skin) { p.skin(g, { pts: hull, curved: true, camera, prim: p }); polyPath(g, hull); }
  g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
}

function paintWedge(g, p, camera, light, fog) {
  const V = wedgeVerts(p), S = V.map(camera.project);
  const solidC = mean3(V);
  const baseFog = fogRGB(hexRGB(p.color), fog, camera.project(primCenter(p)).depth);
  const faces = WEDGE_FACES.map((idx) => {
    const w = idx.map((k) => V[k]);
    let n = unit3(cross3(sub3(w[1], w[0]), sub3(w[2], w[0])));
    const fc = mean3(w);
    if (dot3(n, sub3(fc, solidC)) < 0) n = scale3(n, -1);
    return { pts: idx.map((k) => S[k]), n, depth: idx.reduce((s, k) => s + S[k].depth, 0) / idx.length };
  }).filter((f) => dot3(f.n, camera.f) < 0).sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    polyPath(g, f.pts);
    g.fillStyle = rgbStr(shadeRGB(baseFog, f.n, light)); g.fill();
    if (p.skin) { p.skin(g, { pts: f.pts, n: f.n, camera, prim: p }); polyPath(g, f.pts); }
    g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
  }
}

function prismOutlineEdge(a, b, box) {
  if (!box) return true;
  const yaw = rad3(box.yawDeg || 0), c = Math.cos(yaw), s = Math.sin(yaw);
  const local = p => ({ x: (p.x - box.x) * c - (p.z - box.z) * s,
    z: (p.x - box.x) * s + (p.z - box.z) * c, y: p.y - (box.y || 0) });
  const A = local(a), B = local(b);
  const planes = [['x', -box.w / 2], ['x', box.w / 2], ['z', -box.d / 2], ['z', box.d / 2], ['y', 0], ['y', box.h]];
  return planes.filter(([key, v]) => Math.abs(A[key] - v) <= 1e-8 && Math.abs(B[key] - v) <= 1e-8).length >= 2;
}
function paintPrism(g, p, camera, light, fog) {
  const V = prismVertices(p), S = V.map(camera.project), n = p.polygon.length;
  const solidC = mean3(V), shadeCenter = p.styleBox ? primCenter({ ...p.styleBox, type: 'box' }) : primCenter(p);
  const baseFog = fogRGB(hexRGB(p.color), fog, camera.project(shadeCenter).depth);
  const indices = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => i + n),
    ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, (i + 1) % n + n, i + n])];
  const faces = indices.map((idx, faceIndex) => {
    const world = idx.map(i => V[i]);
    let normal = faceIndex < 2 ? { x: 0, y: faceIndex === 0 ? -1 : 1, z: 0 }
      : unit3(cross3(sub3(world[1], world[0]), sub3(world[2], world[0])));
    if (dot3(normal, sub3(mean3(world), solidC)) < 0) normal = scale3(normal, -1);
    return { points: idx.map(i => S[i]), world, normal, topFace: faceIndex === 1, depth: idx.reduce((a, i) => a + S[i].depth, 0) / idx.length };
  }).filter(f => (!p.topOverlay || !f.topFace) && (camera.cam ? dot3(f.normal, sub3(camera.cam, f.world[0])) > 0
    : dot3(f.normal, camera.f) < 0)).sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    polyPath(g, f.points); g.fillStyle = rgbStr(shadeRGB(baseFog, f.normal, light)); g.fill();
    if (p.skin) p.skin(g, { pts: f.points, world: f.world, n: f.normal, camera, prim: p });
    g.beginPath();
    for (let i = 0; i < f.world.length; i++) {
      const j = (i + 1) % f.world.length;
      if (prismOutlineEdge(f.world[i], f.world[j], p.styleBox)) {
        g.moveTo(f.points[i].x, f.points[i].y); g.lineTo(f.points[j].x, f.points[j].y);
      }
    }
    g.strokeStyle = AO_STROKE; g.lineWidth = 1; g.stroke();
  }
}

const PAINTERS = {
  box: paintBox, prism: paintPrism, cylinder: paintCylinder, sphere: paintSphere,
  hemisphere: paintHemisphere, cone: paintCone, wedge: paintWedge,
};

export function makeScene(g, camera, {
  light = DEFAULT_LIGHT,
  fog = { color: '#e7edf3', near: 120, far: 520, max: 0.55 },
  ground = { horizon: '#eef3f7', near: '#d6dbe0' },
  floorPolygons = [],
  width, height,
} = {}) {
  const W = width || (g && g.canvas ? g.canvas.width : 2 * camera.project({ x: 0, y: 0, z: 0 }).x) || 360;
  const H = height || (g && g.canvas ? g.canvas.height : 420);
  if (!Array.isArray(floorPolygons) || floorPolygons.some(p =>
    !Array.isArray(p.points) || p.points.length < 3 || typeof p.color !== 'string' ||
    p.points.some(v => ![v.x, v.y, v.z].every(Number.isFinite) || v.y !== 0)))
    throw new Error('Floor polygons require finite world points on y=0 and a fill color');
  const queue = [];
  const push = (prim) => { queue.push(prim); return queue.length - 1; };

  const scene = {
    g, camera, light, fog, ground, floorPolygons, queue, width: W, height: H,

    drawSky() {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, ground.horizon); grad.addColorStop(1, ground.near);
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      return scene;
    },
    drawGround({ grid = true } = {}) {
      const E = GROUND_EXTENT;
      const corners = [{ x: -E, z: -E }, { x: E, z: -E }, { x: E, z: E }, { x: -E, z: E }]
        .map((c) => camera.project({ x: c.x, y: 0, z: c.z }));
      const yTop = Math.min(...corners.map((c) => c.y)), yBot = Math.max(...corners.map((c) => c.y));
      const grad = g.createLinearGradient(0, yTop, 0, yBot);
      grad.addColorStop(0, ground.horizon);
      grad.addColorStop(1, rgbStr(mixRGB(hexRGB(ground.near), { r: 0, g: 0, b: 0 }, 0.06)));
      polyPath(g, corners); g.fillStyle = grad; g.fill();
      if (grid) drawGroundGrid(g, camera, { extent: 190, step: 45, style: 'rgba(70,84,96,.14)' });
      return scene;
    },

    box({ x, z, w, d, h, y = 0, yawDeg = 0, color = CLAY.slate, round = 0, shadowY = 0, material, skin }) {
      return push({ type: 'box', x, z, w, d, h, y, yawDeg, color, round, shadowY, material, ...(skin ? { skin } : {}) });
    },
    prism({ polygon, y = 0, h, color = CLAY.slate, shadowY = 0, material, styleBox, topOverlay, skin }) {
      const footprint = polygonAreaXZ(polygon) < 0 ? polygon.slice().reverse() : polygon;
      return push({ type: 'prism', polygon: footprint, y, h, color, shadowY, material, styleBox, ...(topOverlay ? { topOverlay: true } : {}), ...(skin ? { skin } : {}) });
    },
    cylinder({ base, height, axis, r, color = CLAY.slate, caps = true, shadowY = 0, material, materialYaw, skin }) {
      const ax = axis || { x: 0, y: height || 1, z: 0 };
      return push({ type: 'cylinder', base, axis: ax, r, color, caps, shadowY, material, materialYaw, ...(skin ? { skin } : {}) });
    },
    sphere({ c, r, color = CLAY.slate, emissive = false, shadowY = 0, skin }) {
      return push({ type: 'sphere', c, r, color, emissive, shadowY, ...(skin ? { skin } : {}) });
    },
    hemisphere({ c, r, up = { x: 0, y: 1, z: 0 }, color = CLAY.slate, shadowY = 0, skin }) {
      return push({ type: 'hemisphere', c, r, up, color, shadowY, ...(skin ? { skin } : {}) });
    },
    cone({ base, r, height, up = { x: 0, y: 1, z: 0 }, color = CLAY.slate, shadowY = 0, skin }) {
      return push({ type: 'cone', base, r, height, up, color, shadowY, ...(skin ? { skin } : {}) });
    },
    wedge({ x, z, w, d, h, y = 0, yawDeg = 0, slopeDir = 1, color = CLAY.slate, shadowY = 0, skin }) {
      return push({ type: 'wedge', x, z, w, d, h, y, yawDeg, slopeDir, color, shadowY, ...(skin ? { skin } : {}) });
    },
    capsule({ a, b, r, color = CLAY.slate, shadowY = 0, material, materialYaw }) {
      const axis = sub3(b, a), u = unit3(axis);
      const lowerIsA = a.y <= b.y;
      scene.cylinder({ base: a, axis, r, color, caps: false, shadowY: null, material, materialYaw });
      scene.hemisphere({ c: a, r, up: scale3(u, -1), color, shadowY: lowerIsA ? shadowY : null });
      scene.hemisphere({ c: b, r, up: u, color, shadowY: lowerIsA ? null : shadowY });
      return queue.length - 1;
    },

    chair(pose, color) { return chair(scene, pose, color); },
    table(pose, color) { return table(scene, pose, color); },
    tabletop(opts, color) { return tabletop(scene, opts, color); },
    mug(pose, color) { return mug(scene, pose, color); },
    lamp(pose, color) { return lamp(scene, pose, color); },
    tree(pose, palette) { return tree(scene, pose, palette); },
    house(pose, palette) { return house(scene, pose, palette); },
    figure(pose, color) { return figure(scene, pose, color); },

    render({ background = true } = {}) {
      if (background) {
        scene.drawSky();
        scene.drawGround({ grid: true });
        g.__firstFrameBackground?.('scene3d');
        for (const region of floorPolygons) {
          polyPath(g, region.points.map(camera.project));
          g.fillStyle = region.color; g.fill();
        }
      }
      const paintable = queue.filter((p) => PAINTERS[p.type]);
      const paintBody = (prim) => { const fn = PAINTERS[prim.type]; if (fn) fn(g, prim, camera, light, fog); };

      const items = paintable.map((prim, i) => ({
        prim, i,
        depth: camera.project(primCenter(prim)).depth,
        top: primTopY(prim),
        bot: supportGap(prim),
        xz: xzBounds(prim),
      }));

      const SUPPORT_EPS = 0.75;
      const overlapXZ = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
      const insideXZof = (a, b) => a.x0 >= b.x0 - 1e-6 && a.x1 <= b.x1 + 1e-6
        && a.z0 >= b.z0 - 1e-6 && a.z1 <= b.z1 + 1e-6;
      const pending = items.map(() => 0);
      const dependents = items.map(() => []);
      const supports = items.map(() => []);
      const orderDiagnostics = scene.orderDiagnostics = { edges: [], unprovenBoxPairs: [], cycles: [], order: [] };
      const addEdge = (s, x, reason = 'support') => {
        if (supports[x.i].includes(s.i)) return;
        dependents[s.i].push(x.i); supports[x.i].push(s.i); pending[x.i]++;
        orderDiagnostics.edges.push({ far: s.i, near: x.i, reason });
      };
      const isReceiverAt = (s, P) => ((s.prim.type === 'box' || s.prim.type === 'prism') && Math.abs((s.prim.y || 0) + s.prim.h - P) <= 0.5)
        || (s.prim.type === 'cylinder' && unit3(s.prim.axis).y > 0.99
            && Math.abs(s.prim.base.y + s.prim.axis.y - P) <= 0.5);
      const contactFootprintsOverlap = (a, b) => {
        if (!overlapXZ(a.xz, b.xz)) return false;
        if ((a.prim.type === 'prism' || b.prim.type === 'prism') &&
          [a.prim.type, b.prim.type].every(t => t === 'box' || t === 'prism')) return footprintOverlap(a.prim, b.prim);
        return true;
      };
      for (const s of items) {
        if (s.top <= s.bot + 1e-6) continue;
        for (const x of items) {
          if (x === s || x.top <= s.top) continue;
          const resting = Math.abs(x.bot - s.top) <= SUPPORT_EPS;
          const embedded = s.prim.type !== 'prism' && x.prim.type !== 'prism' && x.bot < s.top && insideXZof(x.xz, s.xz);
          if (!resting && !embedded) continue;
          if (!contactFootprintsOverlap(x, s)) continue;
          addEdge(s, x);
        }
      }
      for (const x of items) {
        const P = x.prim.shadowY;
        if (!(P > 0)) continue;
        for (const s of items) {
          if (x === s || x.top <= s.top) continue;
          if (!isReceiverAt(s, P) || !contactFootprintsOverlap(x, s)) continue;
          addEdge(s, x);
        }
      }

      const boxes = items.filter((it) => it.prim.type === 'box' || it.prim.type === 'prism').map((it) => ({ it, data: boxPaintData(it.prim, camera) }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const pair = [boxes[i], boxes[j]], relation = preparedBoxPaintRelation(pair[0].data, pair[1].data, camera);
        if (relation.status === 'certified') addEdge(pair[relation.far].it, pair[relation.near].it, { kind: pair.some(p => p.it.prim.type === 'prism') ? 'prism_separating_plane' : 'box_separating_plane', ...relation });
        else if (relation.status === 'unproven') orderDiagnostics.unprovenBoxPairs.push({ pair: pair.map((p) => p.it.i), reason: relation.reason });
      }

      const farther = (a, b) => b.depth - a.depth || a.i - b.i;
      const order = [];
      const mark = new Uint8Array(items.length);
      const stack = [];
      const visit = (it) => {
        if (mark[it.i] === 2) return;
        if (mark[it.i] === 1) {
          const cycle = stack.slice(stack.indexOf(it.i)).concat(it.i);
          orderDiagnostics.cycles.push(cycle);
          throw new Error(`scene3d: cyclic paint constraints ${cycle.join(' -> ')}`);
        }
        mark[it.i] = 1;
        stack.push(it.i);
        for (const si of supports[it.i]) visit(items[si]);
        stack.pop();
        mark[it.i] = 2;
        order.push(it);
      };
      for (const it of [...items].sort(farther)) visit(it);
      if (order.length < items.length) {
        const seen = new Set(order);
        for (const it of items.filter((t) => !seen.has(t)).sort(farther)) order.push(it);
      }
      orderDiagnostics.order = order.map((it) => it.i);

      const casters = paintable.filter((p) => p.shadowY !== null);
      const planes = [...new Set(casters.map((p) => p.shadowY || 0))].sort((a, b) => a - b);
      const flush = (planeY) => {
        for (const prim of casters) if ((prim.shadowY || 0) === planeY) paintShadow(g, prim, camera, light, paintable);
      };
      if (planes.includes(0)) flush(0);
      const raised = planes.filter((P) => P > 0);
      const flushAt = new Map();
      for (const P of raised) {
        let k = -1;
        order.forEach((it, j) => { if (isReceiverAt(it, P)) k = j; });
        if (!flushAt.has(k)) flushAt.set(k, []);
        flushAt.get(k).push(P);
      }
      for (const P of (flushAt.get(-1) || [])) flush(P);
      order.forEach((it, k) => {
        paintBody(it.prim);
        for (const P of (flushAt.get(k) || [])) flush(P);
      });
      return scene;
    },
  };
  return scene;
}

function posed(pose) {
  const s = pose.scale || 1, a = rad3(pose.yawDeg || 0), ca = Math.cos(a), sa = Math.sin(a);
  return {
    s, yaw: pose.yawDeg || 0,
    pt: (lx, ly, lz) => ({
      x: pose.x + (lx * ca + lz * sa) * s,
      y: ly * s,
      z: pose.z + (-lx * sa + lz * ca) * s,
    }),
    xz: (lx, lz) => ({ x: pose.x + (lx * ca + lz * sa) * s, z: pose.z + (-lx * sa + lz * ca) * s }),
  };
}

function table(scene, pose = {}, color = CLAY.wood) {
  const P = posed(pose), s = P.s, topY = 42, tw = 74, td = 52;
  const c = P.xz(0, 0);
  scene.box({ x: c.x, z: c.z, w: tw * s, d: td * s, h: 8 * s, y: topY * s, yawDeg: P.yaw, color, round: 3, shadowY: null, material: 'wood' });
  for (const [lx, lz] of [[-tw / 2 + 8, -td / 2 + 8], [tw / 2 - 8, -td / 2 + 8], [-tw / 2 + 8, td / 2 - 8], [tw / 2 - 8, td / 2 - 8]]) {
    const b = P.pt(lx, 0, lz);
    scene.cylinder({ base: b, height: topY * s, r: 3.4 * s, color, material: 'wood', materialYaw: P.yaw });
  }
  return { topY: topY * s };
}

function tabletop(scene, { halfX, halfZ, topY, thick = 9, legR = 4.8, inset = 10 } = {}, color = CLAY.wood) {
  scene.box({
    x: 0, z: 0, w: halfX * 2, d: halfZ * 2, h: thick, y: topY - thick, color, round: 3, material: 'wood',
  });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    scene.cylinder({
      base: { x: sx * (halfX - inset), y: 0, z: sz * (halfZ - inset) },
      height: topY - thick, r: legR, color, material: 'wood',
    });
  }
  return { topY };
}

function chair(scene, pose = {}, color = CLAY.blue) {
  const P = posed(pose), s = P.s, seatY = 24, sw = 30, sd = 30;
  const c = P.xz(0, 0);
  scene.box({ x: c.x, z: c.z, w: sw * s, d: sd * s, h: 5 * s, y: seatY * s, yawDeg: P.yaw, color, round: 3, shadowY: null });
  for (const [lx, lz] of [[-sw / 2 + 4, -sd / 2 + 4], [sw / 2 - 4, -sd / 2 + 4], [-sw / 2 + 4, sd / 2 - 4], [sw / 2 - 4, sd / 2 - 4]]) {
    const b = P.pt(lx, 0, lz);
    scene.cylinder({ base: b, height: seatY * s, r: 2.6 * s, color });
  }
  const back = P.xz(0, -sd / 2 + 3);
  scene.box({ x: back.x, z: back.z, w: sw * s, d: 4 * s, h: 26 * s, y: (seatY + 5) * s, yawDeg: P.yaw, color, round: 3, shadowY: null });
}

function mug(scene, pose = {}, color = CLAY.red) {
  const P = posed(pose), s = P.s, bodyH = 17, r = 8;
  const b = P.pt(0, 0, 0);
  scene.cylinder({ base: b, height: bodyH * s, r: r * s, color, caps: true });
  scene.hemisphere({ c: P.pt(0, bodyH - 1, 0), r: (r - 1.5) * s, up: { x: 0, y: -1, z: 0 }, color, shadowY: null });
  const h1 = P.pt(r, 5, 0), h2 = P.pt(r + 6, 9, 0), h3 = P.pt(r, 13, 0);
  scene.capsule({ a: h1, b: h2, r: 1.8 * s, color, shadowY: null });
  scene.capsule({ a: h2, b: h3, r: 1.8 * s, color, shadowY: null });
}

function lamp(scene, pose = {}, color = CLAY.yellow) {
  const P = posed(pose), s = P.s;
  scene.cylinder({ base: P.pt(0, 0, 0), height: 4 * s, r: 10 * s, color: CLAY.slate });
  scene.cylinder({ base: P.pt(0, 4, 0), height: 40 * s, r: 2 * s, color: CLAY.slate, shadowY: null });
  scene.cone({ base: P.pt(0, 44, 0), r: 14 * s, height: 18 * s, up: { x: 0, y: 1, z: 0 }, color, shadowY: null });
  scene.sphere({ c: P.pt(0, 41, 0), r: 4 * s, color: '#fff2cf', emissive: true, shadowY: null });
}

function tree(scene, pose = {}, palette = [CLAY.bark, CLAY.leaf]) {
  const [bark, leaf] = Array.isArray(palette) ? palette : [CLAY.bark, CLAY.leaf];
  const P = posed(pose), s = P.s;
  scene.cylinder({ base: P.pt(0, 0, 0), height: 34 * s, r: 4.5 * s, color: bark });
  scene.sphere({ c: P.pt(0, 50, 0), r: 20 * s, color: leaf, shadowY: null });
  scene.sphere({ c: P.pt(-11, 40, 6), r: 12 * s, color: leaf, shadowY: null });
  scene.sphere({ c: P.pt(12, 42, -4), r: 12 * s, color: leaf, shadowY: null });
}

function house(scene, pose = {}, palette = [CLAY.wall, CLAY.roof]) {
  const [wall, roof] = Array.isArray(palette) ? palette : [CLAY.wall, CLAY.roof];
  const P = posed(pose), s = P.s, bw = 56, bd = 44, bh = 34;
  const c = P.xz(0, 0);
  scene.box({ x: c.x, z: c.z, w: bw * s, d: bd * s, h: bh * s, yawDeg: P.yaw, color: wall });
  const roofY = bh;
  const lft = P.xz(-bw / 4, 0), rgt = P.xz(bw / 4, 0);
  scene.wedge({ x: lft.x, z: lft.z, w: bw / 2 * s, d: bd * s, h: 16 * s, y: roofY * s, yawDeg: P.yaw, slopeDir: 1, color: roof, shadowY: null });
  scene.wedge({ x: rgt.x, z: rgt.z, w: bw / 2 * s, d: bd * s, h: 16 * s, y: roofY * s, yawDeg: P.yaw, slopeDir: -1, color: roof, shadowY: null });
  const door = P.xz(0, bd / 2 - 1);
  scene.box({ x: door.x, z: door.z, w: 12 * s, d: 3 * s, h: 20 * s, yawDeg: P.yaw, color: CLAY.bark, shadowY: null });
  const chim = P.xz(bw / 4, -bd / 6);
  scene.box({ x: chim.x, z: chim.z, w: 7 * s, d: 7 * s, h: 14 * s, y: (roofY + 6) * s, yawDeg: P.yaw, color: roof, shadowY: null });
}

function figure(scene, pose = {}, color = CLAY.cloth) {
  const P = posed(pose), s = P.s;
  const supportY = pose.supportY ?? 0, footY = 3.8 + supportY / s;
  const seated = pose.seated;
  if (seated && !['topY', 'front', 'back'].every(k => Number.isFinite(seated[k]) && seated[k] > 0))
    throw new Error('Seated figure requires positive world-space seat top/front/back dimensions');
  if (seated && seated.kneeForward !== undefined && !(Number.isFinite(seated.kneeForward) && seated.kneeForward > 0))
    throw new Error('Seated kneeForward must be a positive world distance');
  const torsoR = seated ? Math.min(8 * s, seated.back) : 8 * s;
  const torsoBot = P.pt(0, seated ? (seated.topY + torsoR) / s : 30, 0), torsoTop = P.pt(0, 54, 0);
  scene.capsule({ a: torsoBot, b: torsoTop, r: torsoR, color, shadowY: null, material: 'cloth', materialYaw: P.yaw });
  scene.sphere({ c: P.pt(0, 64, 0), r: 8.6 * s, color: CLAY.skin, shadowY: null });
  {
    const ha = rad3(P.yaw), ct = Math.cos(rad3(28)), st = Math.sin(rad3(28));
    const hairUp = { x: -Math.sin(ha) * ct, y: st, z: -Math.cos(ha) * ct };
    scene.hemisphere({ c: P.pt(0, 64.3, -1.1), r: 8.7 * s, up: hairUp, color: CLAY.hair, shadowY: null });
  }
  for (const sx of [-1, 1]) {
    scene.sphere({ c: P.pt(sx * 3.0, 62.6, 7.3), r: 2.15 * s, color: CLAY.eye, shadowY: null });
  }
  scene.sphere({ c: P.pt(0, 60.6, 7.6), r: 1.0 * s, color: '#c79c80', shadowY: null });
  scene.capsule({ a: P.pt(-8, 52, 0), b: P.pt(-13, 32, 4), r: 3.2 * s, color, shadowY: null, material: 'cloth', materialYaw: P.yaw });
  scene.capsule({ a: P.pt(8, 52, 0), b: P.pt(13, 32, 4), r: 3.2 * s, color, shadowY: null, material: 'cloth', materialYaw: P.yaw });
  if (seated) {
    const legR = 3.8 * s, kneeZ = (seated.kneeForward ?? (seated.front + 2 * legR)) / s, kneeY = (seated.topY + legR) / s;
    for (const side of [-1, 1]) {
      const knee = P.pt(side * 5, kneeY, kneeZ);
      scene.capsule({ a: P.pt(side * 4, 30, 0), b: knee, r: legR, color: CLAY.slate, shadowY: null, material: 'cloth', materialYaw: P.yaw });
      scene.capsule({ a: knee, b: P.pt(side * 5, footY, kneeZ), r: legR, color: CLAY.slate, shadowY: supportY, material: 'cloth', materialYaw: P.yaw });
    }
  } else {
    scene.capsule({ a: P.pt(-4, 30, 0), b: P.pt(-5, footY, 2), r: 3.8 * s, color: CLAY.slate, shadowY: supportY, material: 'cloth', materialYaw: P.yaw });
    scene.capsule({ a: P.pt(4, 30, 0), b: P.pt(5, footY, 2), r: 3.8 * s, color: CLAY.slate, shadowY: supportY, material: 'cloth', materialYaw: P.yaw });
  }
}

export { makeCamera };
