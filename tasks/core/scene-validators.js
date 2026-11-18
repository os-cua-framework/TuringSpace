export const SCENE_LIMITS = Object.freeze({ epsilon: 1e-7, screenSeparationPx: 12,
  targetPx: 40, discriminatorPx: 3, thumbnailPx: 90 });
const E = SCENE_LIMITS.epsilon;
const X = { x: 1, y: 0, z: 0 }, Y = { x: 0, y: 1, z: 0 }, Z = { x: 0, y: 0, z: 1 };
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const sub = (a, b) => add(a, mul(b, -1));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => mul(a, 1 / norm(a));
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
class InputError extends Error {
  constructor(path, message) { super(message); this.path = path; }
}
function need(ok, path, message) { if (!ok) throw new InputError(path, message); }
function number(n, path, positive = false) {
  need(typeof n === 'number' && Number.isFinite(n) && (!positive || n > 0), path,
    positive ? 'Expected a finite positive number' : 'Expected a finite number');
  return n;
}
function vector(v, path) {
  need(v && typeof v === 'object', path, 'Expected a world vector');
  for (const k of ['x', 'y', 'z']) number(v[k], `${path}.${k}`);
  return v;
}
function direction(v, path) {
  vector(v, path); need(norm(v) > 0 && Number.isFinite(norm(v)), path, 'Expected a nonzero finite direction');
  return unit(v);
}
function list(a, path) { need(Array.isArray(a) && a.length > 0, path, 'Expected a nonempty array'); return a; }
function id(value, path) { need(typeof value === 'string' && value.length > 0, path, 'Expected a nonempty string ID'); return value; }
function unique(items, path) {
  const ids = new Set();
  for (const [i, item] of items.entries()) {
    id(item?.id, `${path}[${i}].id`);
    need(!ids.has(item.id), path, `Duplicate ID: ${item.id}`); ids.add(item.id);
  }
}
function checked(fn) {
  try {
    const { violations, metrics } = fn();
    return { ok: violations.length === 0, violations, metrics };
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    return { ok: false, violations: [{ code: 'invalid_input', path: err.path, message: err.message }],
      metrics: { complete: false } };
  }
}
function yawAxes(deg) {
  const a = deg * Math.PI / 180;
  return [{ x: Math.cos(a), y: 0, z: -Math.sin(a) }, Y,
    { x: Math.sin(a), y: 0, z: Math.cos(a) }];
}
const crossXZ = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
function hullXZ(points) {
  const sorted = points.map(({ x, z }) => ({ x, z })).sort((a, b) => a.x - b.x || a.z - b.z);
  const ps = sorted.filter((p, i) => !i || p.x !== sorted[i - 1].x || p.z !== sorted[i - 1].z);
  if (ps.length < 3) return ps;
  const half = (rows) => { const h = []; for (const p of rows) { while (h.length > 1 && crossXZ(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); } return h; };
  return half(ps).slice(0, -1).concat(half(ps.slice().reverse()).slice(0, -1));
}
function convexPolygon(points, path) {
  need(Array.isArray(points) && points.length >= 3, path, 'Expected at least three convex polygon vertices');
  const ps = points.map((p, i) => ({ x: number(p?.x, `${path}[${i}].x`), z: number(p?.z, `${path}[${i}].z`) }));
  need(new Set(ps.map((p) => `${p.x},${p.z}`)).size === ps.length, path, 'Repeated polygon vertex');
  const area2 = ps.reduce((sum, p, i) => { const q = ps[(i + 1) % ps.length]; return sum + p.x * q.z - p.z * q.x; }, 0);
  need(Number.isFinite(area2) && area2 !== 0, path, 'Polygon must have nonzero finite area');
  if (area2 < 0) ps.reverse();
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i], b = ps[(i + 1) % ps.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    need(length > 0, path, 'Repeated adjacent polygon vertex');
    need(ps.every((p) => crossXZ(a, b, p) >= -E * length), path, 'Polygon must be convex and ordered');
  }
  return ps;
}
function diskPoint(c, u, r, n) {
  const d = sub(n, mul(u, dot(n, u))), length = norm(d);
  return length > 1e-14 ? add(c, mul(d, r / length)) : c;
}
function extreme(points, n) {
  return points.reduce((best, p) => dot(p, n) > dot(best, n) ? p : best);
}
function shape(p, path) {
  need(p && typeof p === 'object', path, 'Expected a primitive');
  const s = { type: p.type, p, axes: [X, Y, Z], edges: [X, Y, Z] };
  if (p.type === 'box' || p.type === 'wedge') {
    for (const k of ['x', 'z']) number(p[k], `${path}.${k}`);
    for (const k of ['w', 'h', 'd']) number(p[k], `${path}.${k}`, true);
    const y = p.y === undefined ? 0 : number(p.y, `${path}.y`);
    let yaw = p.yawDeg === undefined ? 0 : number(p.yawDeg, `${path}.yawDeg`);
    if (p.type === 'wedge' && p.slopeDir !== undefined) {
      number(p.slopeDir, `${path}.slopeDir`); if (p.slopeDir < 0) yaw += 180;
    }
    s.axes = yawAxes(yaw); s.edges = s.axes;
    s.center = { x: p.x, y: y + p.h / 2, z: p.z };
    const point = (x, h, z) => add({ x: p.x, y: y + h, z: p.z },
      add(mul(s.axes[0], x), mul(s.axes[2], z)));
    s.vertices = [];
    for (const x of [-p.w / 2, p.w / 2]) for (const h of [0, p.h]) for (const z of [-p.d / 2, p.d / 2]) {
      if (p.type === 'box' || h === 0 || x > 0) s.vertices.push(point(x, h, z));
    }
    if (p.type === 'wedge') {
      const slope = add(mul(s.axes[0], p.w), mul(Y, p.h));
      s.edges = [...s.axes, unit(slope)];
      s.axes = [...s.axes, unit(cross(slope, s.axes[2]))];
    }
    s.support = (n) => extreme(s.vertices, n);
  } else if (p.type === 'obb') {
    vector(p.c, `${path}.c`);
    for (const k of ['w', 'h', 'd']) number(p[k], `${path}.${k}`, true);
    need(Array.isArray(p.axes) && p.axes.length === 3, `${path}.axes`, 'Expected three orthonormal world axes');
    const tolerance = 1e-12;
    p.axes.forEach((axis, i) => {
      vector(axis, `${path}.axes[${i}]`);
      need(Math.abs(norm(axis) - 1) <= tolerance, `${path}.axes[${i}]`, 'OBB axis must be unit length; no implicit rescaling');
      for (let j = 0; j < i; j++) need(Math.abs(dot(axis, p.axes[j])) <= tolerance,
        `${path}.axes`, 'OBB axes must be mutually orthogonal; no implicit shear repair');
    });
    need(Math.abs(dot(cross(p.axes[0], p.axes[1]), p.axes[2]) - 1) <= tolerance,
      `${path}.axes`, 'OBB basis must be right handed');
    s.center = p.c; s.axes = p.axes; s.edges = s.axes; s.vertices = [];
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-p.d / 2, p.d / 2]) {
      s.vertices.push(add(p.c, add(add(mul(s.axes[0], x), mul(s.axes[1], y)), mul(s.axes[2], z))));
    }
    s.support = (n) => extreme(s.vertices, n);
  } else if (p.type === 'tetrahedron') {
    need(Array.isArray(p.vertices) && p.vertices.length === 4, `${path}.vertices`, 'Expected exactly four tetrahedron vertices');
    p.vertices.forEach((v, i) => vector(v, `${path}.vertices[${i}]`));
    const v = p.vertices, basis = [sub(v[1], v[0]), sub(v[2], v[0]), sub(v[3], v[0])];
    need(basis.every(e => norm(e) > 1e-14) && Math.abs(dot(unit(basis[0]), cross(unit(basis[1]), unit(basis[2])))) > 1e-12,
      `${path}.vertices`, 'Tetrahedron vertices must be affinely independent; no degenerate-volume repair');
    s.vertices = v;
    s.center = mul(v.reduce((sum, q) => add(sum, q), { x: 0, y: 0, z: 0 }), 1 / 4);
    s.edges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(([a, b]) => unit(sub(v[b], v[a])));
    s.axes = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].map(([a, b, c]) => unit(cross(sub(v[b], v[a]), sub(v[c], v[a]))));
    s.support = (n) => extreme(s.vertices, n);
  } else if (p.type === 'prism') {
    const polygon = convexPolygon(p.polygon, `${path}.polygon`);
    number(p.y, `${path}.y`); number(p.h, `${path}.h`, true);
    s.vertices = polygon.flatMap((q) => [{ ...q, y: p.y }, { ...q, y: p.y + p.h }]);
    s.center = { x: polygon.reduce((v, q) => v + q.x, 0) / polygon.length, y: p.y + p.h / 2,
      z: polygon.reduce((v, q) => v + q.z, 0) / polygon.length };
    s.edges = [Y, ...polygon.map((q, i) => unit({ x: polygon[(i + 1) % polygon.length].x - q.x, y: 0,
      z: polygon[(i + 1) % polygon.length].z - q.z }))];
    s.axes = [Y, ...s.edges.slice(1).map((edge) => cross(Y, edge))];
    s.support = (n) => extreme(s.vertices, n);
  } else if (p.type === 'ellipsoid') {
    vector(p.c, `${path}.c`);
    need(Array.isArray(p.radii) && p.radii.length === 3, `${path}.radii`, 'Expected three positive semiaxes');
    p.radii.forEach((r, i) => number(r, `${path}.radii[${i}]`, true));
    need(Array.isArray(p.axes) && p.axes.length === 3, `${path}.axes`, 'Expected three orthonormal world axes');
    p.axes.forEach((axis, i) => {
      vector(axis, `${path}.axes[${i}]`);
      need(Math.abs(norm(axis) - 1) <= 1e-12, `${path}.axes[${i}]`, 'Ellipsoid axis must be unit length; no implicit rescaling');
      for (let j = 0; j < i; j++) need(Math.abs(dot(axis, p.axes[j])) <= 1e-12,
        `${path}.axes`, 'Ellipsoid axes must be mutually orthogonal; no implicit shear repair');
    });
    need(Math.abs(dot(cross(p.axes[0], p.axes[1]), p.axes[2]) - 1) <= 1e-12,
      `${path}.axes`, 'Ellipsoid basis must be right handed');
    s.center = p.c; s.axes = p.axes; s.edges = s.axes;
    s.support = (n) => {
      const projections = p.axes.map((axis, i) => p.radii[i] * dot(axis, n));
      const denominator = Math.hypot(...projections);
      return denominator > 0 ? p.axes.reduce((q, axis, i) =>
        add(q, mul(axis, p.radii[i] * projections[i] / denominator)), p.c) : p.c;
    };
  } else if (p.type === 'sphere' || p.type === 'hemisphere') {
    vector(p.c, `${path}.c`); number(p.r, `${path}.r`, true); s.center = p.c;
    if (p.type === 'sphere') s.support = (n) => add(p.c, mul(unit(n), p.r));
    else {
      s.u = direction(p.up === undefined ? Y : p.up, `${path}.up`); s.axes = [...s.axes, s.u];
      s.support = (n) => dot(n, s.u) >= 0 ? add(p.c, mul(unit(n), p.r)) : diskPoint(p.c, s.u, p.r, n);
    }
  } else if (p.type === 'cylinder' || p.type === 'cone') {
    vector(p.base, `${path}.base`); number(p.r, `${path}.r`, true);
    if (p.type === 'cylinder') {
      const axis = p.axis === undefined ? { x: 0, y: number(p.height, `${path}.height`, true), z: 0 } : p.axis;
      s.u = direction(axis, `${path}.axis`); s.top = add(p.base, axis);
      s.support = (n) => diskPoint(dot(s.top, n) > dot(p.base, n) ? s.top : p.base, s.u, p.r, n);
    } else {
      number(p.height, `${path}.height`, true); s.u = direction(p.up === undefined ? Y : p.up, `${path}.up`);
      s.top = add(p.base, mul(s.u, p.height));
      s.support = (n) => extreme([diskPoint(p.base, s.u, p.r, n), s.top], n);
    }
    s.center = mul(add(p.base, s.top), 0.5); s.axes = [...s.axes, s.u]; s.edges = s.axes;
  } else if (p.type === 'capsule') {
    vector(p.a, `${path}.a`); vector(p.b, `${path}.b`); number(p.r, `${path}.r`, true);
    s.center = mul(add(p.a, p.b), 0.5);
    if (norm(sub(p.b, p.a)) > 0) s.axes = [...s.axes, unit(sub(p.b, p.a))];
    s.edges = s.axes; s.support = (n) => add(extreme([p.a, p.b], n), mul(unit(n), p.r));
  } else need(false, `${path}.type`, `Unsupported primitive: ${String(p.type)}`);
  vector(s.center, `${path}.computedCenter`);
  for (const n of [X, Y, Z, mul(X, -1), mul(Y, -1), mul(Z, -1)]) vector(s.support(n), `${path}.computedSupport`);
  return s;
}
function bodies(scene, field = 'bodies') {
  const bs = list(scene?.[field], `scene.${field}`); unique(bs, `scene.${field}`);
  return bs.map((b, i) => ({ ...b, shapes: list(b.parts, `${field}[${i}].parts`)
    .map((p, j) => shape(p, `${field}[${i}].parts[${j}]`)) }));
}
function sceneGroups(scene) {
  const bs = bodies(scene), foundations = scene?.supportGeometry === undefined ? null : bodies(scene, 'supportGeometry');
  if (foundations) unique([...bs, ...foundations], 'scene physical geometry IDs');
  return { bs, foundations };
}
function closestBoxPoint(s, p) {
  let q = s.center;
  [s.p.w / 2, s.p.h / 2, s.p.d / 2].forEach((r, i) => {
    q = add(q, mul(s.axes[i], Math.max(-r, Math.min(r, dot(sub(p, s.center), s.axes[i])))));
  });
  return q;
}
function clearance(a, b) {
  const delta = sub(b.center, a.center), axes = [...a.axes, ...b.axes, delta];
  for (const s of [a, b]) if (s.u) axes.push(sub(delta, mul(s.u, dot(delta, s.u))));
  for (const u of a.edges) for (const v of b.edges) axes.push(cross(u, v));
  const sphereBox = (s, box) => axes.push(sub(s.center, closestBoxPoint(box, s.center)));
  if (a.type === 'sphere' && b.type === 'box') sphereBox(a, b);
  if (b.type === 'sphere' && a.type === 'box') sphereBox(b, a);
  if (a.type === 'sphere' && b.type === 'obb') sphereBox(a, b);
  if (b.type === 'sphere' && a.type === 'obb') sphereBox(b, a);
  let gap = -Infinity, axis = null, testedAxes = 0;
  for (const v of axes) {
    if (norm(v) < 1e-14) continue;
    const n = unit(v), neg = mul(n, -1);
    const g = Math.max(dot(b.support(neg), n) - dot(a.support(n), n),
      dot(a.support(neg), n) - dot(b.support(n), n));
    number(g, 'computedProjectionGap'); testedAxes++;
    if (g > gap) { gap = g; axis = n; }
  }
  const exact = !!(a.vertices && b.vertices) ||
    (a.type === 'sphere' && ['sphere', 'box'].includes(b.type)) ||
    (b.type === 'sphere' && a.type === 'box') ||
    (a.type === 'sphere' && b.type === 'obb') ||
    (b.type === 'sphere' && a.type === 'obb');
  return { maxProjectionGap: gap, separatingAxis: axis, testedAxes,
    classification: gap >= -E ? (gap > E ? 'separated' : 'contact') : exact ? 'intersection' : 'conservative_overlap' };
}

export function noIntersect(scene) {
  return checked(() => {
    const { bs: standing, foundations } = sceneGroups(scene), bs = foundations ? [...standing, ...foundations] : standing;
    const violations = [], pairs = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      bs[i].shapes.forEach((a, ai) => bs[j].shapes.forEach((b, bi) => {
        const measurement = { bodies: [bs[i].id, bs[j].id], parts: [ai, bi], ...clearance(a, b),
          ...(foundations ? { roles: [i < standing.length ? 'body' : 'supportGeometry', j < standing.length ? 'body' : 'supportGeometry'] } : {}) };
        pairs.push(measurement);
        if (['intersection', 'conservative_overlap'].includes(measurement.classification))
          violations.push({ code: measurement.classification, ...measurement });
      }));
    }
    return { violations, metrics: { complete: true, epsilon: E, bodyCount: standing.length, pairCount: pairs.length,
      confirmedIntersections: violations.filter((v) => v.code === 'intersection').length,
      conservativeRejections: violations.filter((v) => v.code === 'conservative_overlap').length, pairs,
      ...(foundations ? { physicalBodyCount: bs.length, supportGeometryCount: foundations.length,
        supportPartCount: foundations.reduce((n, b) => n + b.shapes.length, 0),
        supportPairCount: pairs.filter(p => p.roles.includes('supportGeometry')).length,
        supportSupportPairCount: pairs.filter(p => p.roles.every(r => r === 'supportGeometry')).length } : {}) } };
  });
}

function contacts(s) {
  const p = s.p, down = mul(Y, -1), lowestY = s.support(down).y;
  let patches = [];
  const point = (q) => patches.push({ c: q, r: 0 });
  const disk = (c, u, r) => {
    if (Math.abs(u.x) < 1e-14 && Math.abs(u.z) < 1e-14) patches.push({ c, r });
    else point(diskPoint(c, u, r, down));
  };
  if (s.vertices) s.vertices.filter((v) => Math.abs(v.y - lowestY) <= E).forEach(point);
  else if (p.type === 'sphere' || p.type === 'ellipsoid') point(s.support(down));
  else if (p.type === 'capsule') {
    for (const c of [p.a, p.b]) if (Math.abs(c.y - p.r - lowestY) <= E) point(add(c, mul(down, p.r)));
  } else if (p.type === 'hemisphere') {
    if (s.u.y > 0) disk(p.c, s.u, p.r); else point(s.support(down));
  } else if (Math.abs(s.u.x) < 1e-14 && Math.abs(s.u.z) < 1e-14) {
    if (p.type === 'cylinder') disk(p.base.y < s.top.y ? p.base : s.top, s.u, p.r);
    else if (s.u.y > 0) disk(p.base, s.u, p.r);
    else point(s.top);
  } else {
    const baseLow = diskPoint(p.base, s.u, p.r, down);
    if (Math.abs(baseLow.y - lowestY) <= E) disk(p.base, s.u, p.r);
    if (p.type === 'cylinder') {
      if (Math.abs(diskPoint(s.top, s.u, p.r, down).y - lowestY) <= E) disk(s.top, s.u, p.r);
    } else if (Math.abs(s.top.y - lowestY) <= E) point(s.top);
  }
  return { lowestY, patches };
}
function sphereEdgeSurface(p, i, bs) {
  const path = `supports[${i}]`;
  const keys = (o, allowed, where) => need(o && typeof o === 'object' &&
    Object.keys(o).every(k => allowed.includes(k)), where, 'Unexpected support data; use actual primitive references only');
  keys(p, ['id', 'type', 'sphere', 'edges'], path);
  keys(p.sphere, ['bodyId', 'partIndex'], `${path}.sphere`);
  const resolve = (ref, where) => {
    id(ref.bodyId, `${where}.bodyId`);
    need(Number.isInteger(ref.partIndex) && ref.partIndex >= 0, `${where}.partIndex`, 'Expected an actual part index');
    const b = bs.find(b => b.id === ref.bodyId);
    need(b && b.shapes[ref.partIndex], where, 'Referenced physical part does not exist');
    return { body: b, shape: b.shapes[ref.partIndex] };
  };
  const sphere = resolve(p.sphere, `${path}.sphere`);
  need(sphere.shape.type === 'sphere', `${path}.sphere`, 'Support must reference an actual sphere');
  need(Array.isArray(p.edges) && p.edges.length === 2, `${path}.edges`, 'Expected exactly two finite box top edges');
  const seen = new Set();
  const edges = p.edges.map((ref, j) => {
    const where = `${path}.edges[${j}]`;
    keys(ref, ['bodyId', 'partIndex', 'edge'], where);
    const { body, shape: s } = resolve(ref, where);
    need(body.id !== sphere.body.id, where, 'A sphere-bearing body cannot support itself');
    need(s.type === 'box', where, 'Only horizontal yaw-box top edges are supported; other rail shapes are outside this domain');
    need(['x+', 'x-', 'z+', 'z-'].includes(ref.edge), `${where}.edge`, 'Expected x+, x-, z+ or z- top edge');
    const key = `${body.id}/${ref.partIndex}/${ref.edge}`;
    need(!seen.has(key), where, 'Duplicate rail edge reference'); seen.add(key);
    const fixed = ref.edge[0] === 'x' ? 0 : 2, along = fixed === 0 ? 2 : 0;
    const halves = [s.p.w / 2, s.p.h / 2, s.p.d / 2], sign = ref.edge[1] === '+' ? 1 : -1;
    const centre = add(add(s.center, mul(Y, s.p.h / 2)), mul(s.axes[fixed], sign * halves[fixed]));
    const a = add(centre, mul(s.axes[along], -halves[along]));
    const b = add(centre, mul(s.axes[along], halves[along]));
    const length = norm(sub(b, a));
    need(length > E && Math.abs(a.y - b.y) <= E, where, 'Only nondegenerate horizontal finite edges are supported');
    return { ref, shape: s, a, b, length, direction: unit(sub(b, a)) };
  });
  need(norm(cross(edges[0].direction, edges[1].direction)) <= E, `${path}.edges`, 'Nonparallel rails are outside this support domain');
  need(Math.abs(edges[0].a.y - edges[1].a.y) <= E, `${path}.edges`, 'Unequal-height rails are outside this support domain');
  return { ...p, sphereBodyId: sphere.body.id, sphereShape: sphere.shape, edgeRecords: edges };
}
function sphereEdgeContact(body, surface) {
  need(surface.sphereBodyId === body.id, `body.${body.id}.supportId`, 'A body must reference its own actual sphere part');
  const sphere = surface.sphereShape.p, violations = [], contacts = surface.edgeRecords.map((edge, index) => {
    const offset = sub(sphere.c, edge.a), t = dot(offset, edge.direction) / edge.length;
    const point = add(edge.a, mul(sub(edge.b, edge.a), Math.max(0, Math.min(1, t))));
    const delta = sub(sphere.c, point), distance = norm(delta), normal = distance > 0 ? mul(delta, 1 / distance) : { x: 0, y: 0, z: 0 };
    const closest = closestBoxPoint(edge.shape, sphere.c), closestPointError = norm(sub(point, closest));
    const finiteSpan = t >= -E / edge.length && t <= 1 + E / edge.length;
    const radiusGap = distance - sphere.r, above = sphere.c.y - point.y;
    if (!finiteSpan) violations.push({ code: 'sphere_rail_outside_finite_span', edge: index, t });
    if (Math.abs(radiusGap) > E) violations.push({ code: 'sphere_rail_not_tangent', edge: index, radiusGap });
    if (closestPointError > E) violations.push({ code: 'sphere_rail_not_closest_solid_point', edge: index, closestPointError });
    if (above <= E || normal.y <= 0) violations.push({ code: 'sphere_not_above_rail', edge: index, above });
    return { ref: edge.ref, a: edge.a, b: edge.b, point, closestSolidPoint: closest, closestPointError,
      t, finiteSpan, distance, radiusGap, above, normal };
  });
  const transverse = unit(cross(Y, surface.edgeRecords[0].direction));
  const lateral = contacts.map(c => dot(c.normal, transverse)), upward = contacts.map(c => c.normal.y);
  const determinant = lateral[0] * upward[1] - lateral[1] * upward[0];
  let reactions = null, resultant = null, reactionResidual = null;
  if (lateral[0] * lateral[1] < 0 && upward.every(v => v > 0) && Math.abs(determinant) > E) {
    reactions = [-lateral[1] / determinant, lateral[0] / determinant];
    resultant = add(mul(contacts[0].normal, reactions[0]), mul(contacts[1].normal, reactions[1]));
    reactionResidual = norm(sub(resultant, Y));
  }
  const forceFeasible = reactions !== null && reactions.every(v => Number.isFinite(v) && v >= 0) &&
    Number.isFinite(reactionResidual) && reactionResidual <= E;
  if (!forceFeasible) violations.push({ code: 'sphere_rail_upward_force_infeasible', lateral, upward, reactions, resultant, reactionResidual });
  const measurement = { body: body.id, support: surface.id, type: surface.type, sphere: surface.sphere,
    centre: sphere.c, radius: sphere.r, contacts, reactions, resultant, reactionResidual, forceFeasible,
    scope: 'Sphere contact and upward frictionless support force only; compound-body torque, held orientation and dynamics are not certified' };
  return { measurement, violations: violations.map(v => ({ body: body.id, support: surface.id, ...v })) };
}
function surfaces(scene, bs) {
  const ss = list(scene?.supports, 'scene.supports'); unique(ss, 'scene.supports');
  return ss.map((input, i) => {
    let p = input;
    if (p.type === 'sphereOnParallelEdges') return sphereEdgeSurface(p, i, bs);
    if (p.type === 'boxTop' || p.type === 'prismTop') {
      const b = bs.find((b) => b.id === p.bodyId);
      need(b, `supports[${i}].bodyId`, 'Support body does not exist');
      need(Number.isInteger(p.partIndex) && p.partIndex >= 0, `supports[${i}].partIndex`, 'Expected a part index');
      const s = b.shapes[p.partIndex];
      const expected = p.type === 'boxTop' ? 'box' : 'prism';
      need(s?.type === expected, `supports[${i}].partIndex`, `${p.type} must reference an existing ${expected}`);
      p = { ...s.p, id: p.id, type: expected === 'box' ? 'rect' : 'polygon', y: expected === 'box' ? s.center.y + s.p.h / 2 : s.p.y + s.p.h, bodyId: b.id };
    }
    need(['rect', 'disk', 'polygon'].includes(p.type), `supports[${i}].type`, 'Expected rect, disk, polygon, boxTop or prismTop');
    if (p.type === 'polygon') {
      number(p.y, `supports[${i}].y`);
      return { ...p, polygon: convexPolygon(p.polygon, `supports[${i}].polygon`) };
    }
    for (const k of ['x', 'y', 'z']) number(p[k], `supports[${i}].${k}`);
    if (p.type === 'rect') {
      for (const k of ['w', 'd']) number(p[k], `supports[${i}].${k}`, true);
    } else number(p.r, `supports[${i}].r`, true);
    const yaw = p.yawDeg === undefined ? 0 : number(p.yawDeg, `supports[${i}].yawDeg`);
    return { ...p, axes: yawAxes(yaw) };
  });
}
function surfacePolygon(surface) {
  if (surface.type === 'polygon') return surface.polygon;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => add(surface,
    add(mul(surface.axes[0], x * surface.w / 2), mul(surface.axes[2], z * surface.d / 2))));
}
function patchContainmentMargin(patch, surface) {
  if (surface.type === 'polygon') return Math.min(...surface.polygon.map((a, i) => {
    const b = surface.polygon[(i + 1) % surface.polygon.length];
    return crossXZ(a, b, patch.c) / Math.hypot(b.x - a.x, b.z - a.z) - patch.r;
  }));
  const delta = sub(patch.c, surface);
  if (surface.type === 'disk') return surface.r - Math.hypot(delta.x, delta.z) - patch.r;
  return Math.min(surface.w / 2 - Math.abs(dot(delta, surface.axes[0])) - patch.r,
    surface.d / 2 - Math.abs(dot(delta, surface.axes[2])) - patch.r);
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function edgesXZ(poly) {
  if (poly.length < 2) return [];
  return poly.length === 2 ? [[poly[0], poly[1]]] : poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
}
function pointPolygonDistance(p, poly) {
  if (poly.length >= 3 && poly.every((a, i) => crossXZ(a, poly[(i + 1) % poly.length], p) >= 0)) return 0;
  return Math.min(...poly.map((q) => Math.hypot(p.x - q.x, p.z - q.z)), ...edgesXZ(poly).map(([a, b]) => segmentDistance(p, a, b)));
}
function segmentsCross(a, b, c, d) {
  if (Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) ||
      Math.max(Math.min(a.z, b.z), Math.min(c.z, d.z)) > Math.min(Math.max(a.z, b.z), Math.max(c.z, d.z))) return false;
  const abC = crossXZ(a, b, c), abD = crossXZ(a, b, d), cdA = crossXZ(c, d, a), cdB = crossXZ(c, d, b);
  return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
}
function polygonDistance(a, b) {
  if (edgesXZ(a).some(([p, q]) => edgesXZ(b).some(([r, s]) => segmentsCross(p, q, r, s)))) return 0;
  return Math.min(...a.map((p) => pointPolygonDistance(p, b)), ...b.map((p) => pointPolygonDistance(p, a)));
}
function contactDistance(contact, surface) {
  const disk = contact.patches.find((p) => p.r > 0);
  if (disk) return { kind: 'disk', horizontalGap: Math.max(0, surface.type === 'disk'
    ? Math.hypot(disk.c.x - surface.x, disk.c.z - surface.z) - disk.r - surface.r
    : pointPolygonDistance(disk.c, surfacePolygon(surface)) - disk.r) };
  const poly = hullXZ(contact.patches.map((p) => p.c));
  need(poly.length > 0, 'computedContactFace', 'Primitive has no lowest contact set');
  const horizontalGap = surface.type === 'disk'
    ? Math.max(0, pointPolygonDistance(surface, poly) - surface.r)
    : polygonDistance(poly, surfacePolygon(surface));
  return { kind: poly.length === 1 ? 'point' : poly.length === 2 ? 'segment' : 'polygon', horizontalGap };
}
export function grounded(scene) {
  return checked(() => {
    const { bs, foundations } = sceneGroups(scene), ss = surfaces(scene, foundations ? [...bs, ...foundations] : bs), violations = [], measurements = [];
    for (const b of bs) {
      id(b.supportId, `body.${b.id}.supportId`);
      const surface = ss.find((s) => s.id === b.supportId);
      need(surface, `body.${b.id}.supportId`, 'Finite support surface does not exist');
      need(surface.bodyId !== b.id, `body.${b.id}.supportId`, 'A body cannot support itself');
      if (surface.type === 'sphereOnParallelEdges') {
        const result = sphereEdgeContact(b, surface);
        measurements.push(result.measurement); violations.push(...result.violations);
        continue;
      }
      const all = b.shapes.map(contacts), bottomY = Math.min(...all.map((c) => c.lowestY));
      const contactParts = all.flatMap((c, part) => Math.abs(c.lowestY - bottomY) <= E ? [{ part, ...c }] : []);
      const margin = Math.min(...contactParts.flatMap((c) => c.patches.map((p) => patchContainmentMargin(p, surface))));
      number(margin, 'computedContactMargin');
      const gap = bottomY - surface.y;
      const contactDistances = contactParts.map((c) => {
        const distance = contactDistance(c, surface), verticalGap = c.lowestY - surface.y;
        number(distance.horizontalGap, 'computedContactDistance');
        return { part: c.part, ...distance, verticalGap, meetsSurface: distance.horizontalGap <= E && Math.abs(verticalGap) <= E };
      });
      const touchingParts = contactDistances.filter((c) => c.meetsSurface).map((c) => c.part);
      const m = { body: b.id, support: surface.id, bottomY, supportY: surface.y, gap,
        containmentMargin: margin, contactParts: contactParts.map((c) => c.part), contactDistances, touchingParts };
      measurements.push(m);
      if (Math.abs(gap) > E) violations.push({ code: gap > 0 ? 'floating' : 'below_support', ...m });
      else if (!touchingParts.length) violations.push({ code: 'contact_outside_support', ...m });
    }
    return { violations, metrics: { complete: true, epsilon: E, bodyCount: bs.length,
      supportCount: ss.length, measurements } };
  });
}

function screenRegion(r, path) {
  need(r && typeof r === 'object', path, 'Expected a declared click region or projected world anchor');
  number(r.x, `${path}.x`); number(r.y, `${path}.y`);
  if (r.type === 'projection') return r;
  if (r.type === 'circle') number(r.r, `${path}.r`, true);
  else {
    need(r.type === 'rect', `${path}.type`, 'Expected circle or rect');
    number(r.w, `${path}.w`, true); number(r.h, `${path}.h`, true);
  }
  return r;
}
function edgeGap(a, b) {
  if (a.type === 'projection' || b.type === 'projection') return null;
  if (a.type === 'circle' && b.type === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  if (a.type === 'rect' && b.type === 'rect') return Math.hypot(
    Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2),
    Math.max(0, Math.abs(a.y - b.y) - (a.h + b.h) / 2));
  const c = a.type === 'circle' ? a : b, r = a.type === 'rect' ? a : b;
  return Math.hypot(Math.max(0, Math.abs(c.x - r.x) - r.w / 2),
    Math.max(0, Math.abs(c.y - r.y) - r.h / 2)) - c.r;
}
export function minSeparation(scene) {
  return checked(() => {
    const ts = list(scene?.targets, 'scene.targets'); unique(ts, 'scene.targets');
    const delta = number(scene?.separation?.world, 'scene.separation.world');
    need(delta >= 0, 'scene.separation.world', 'World separation must be nonnegative');
    for (const t of ts) vector(t.world, `target.${t.id}.world`);
    const observations = list(scene.observations, 'scene.observations'); unique(observations, 'scene.observations');
    const violations = [], worldPairs = [], screenPairs = [], covered = new Set();
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const pair = { targets: [ts[i].id, ts[j].id], distance: norm(sub(ts[i].world, ts[j].world)) };
      number(pair.distance, 'computedWorldDistance'); worldPairs.push(pair);
      if (pair.distance + E < delta) violations.push({ code: 'world_too_close', threshold: delta, ...pair });
    }
    for (const o of observations) {
      list(o.targets, `observation.${o.id}.targets`); unique(o.targets, `observation.${o.id}.targets`);
      const regions = o.targets.map((t) => {
        need(ts.some((candidate) => candidate.id === t.id), `observation.${o.id}.${t.id}`, 'Unknown target');
        covered.add(t.id); return { id: t.id, ...screenRegion(t.screen, `observation.${o.id}.${t.id}.screen`) };
      });
      for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i], b = regions[j], distancePx = Math.hypot(a.x - b.x, a.y - b.y);
        number(distancePx, 'computedScreenDistance');
        const gap = edgeGap(a, b);
        const pair = { observation: o.id, targets: [a.id, b.id], distancePx, edgeGapPx: gap,
          ...(gap === null ? { edgeGapStatus: 'not_measured_no_hit_region',
            screenMeasurement: 'projected_anchor_distance' } : {}) };
        screenPairs.push(pair);
        if (distancePx + E < SCENE_LIMITS.screenSeparationPx)
          violations.push({ code: 'screen_too_close', thresholdPx: SCENE_LIMITS.screenSeparationPx, ...pair });
      }
    }
    for (const t of ts) if (!covered.has(t.id)) violations.push({ code: 'target_unobserved', target: t.id });
    return { violations, metrics: { complete: true, targetCount: ts.length, observedTargetCount: covered.size,
      worldThreshold: delta, screenThresholdPx: SCENE_LIMITS.screenSeparationPx,
      screenDistanceConvention: 'declared click-region centre or projected world-anchor distance; edge gap reported separately or explicitly unmeasured', worldPairs, screenPairs } };
  });
}

export function minFeature(manifest) {
  return checked(() => {
    const kinds = ['target', 'discriminator', 'thumbnail'];
    const required = list(manifest?.featureRequirements, 'manifest.featureRequirements');
    need(new Set(required).size === required.length, 'manifest.featureRequirements', 'Duplicate feature kind');
    for (const kind of required) need(kinds.includes(kind), 'manifest.featureRequirements', `Unknown feature kind: ${kind}`);
    const features = list(manifest?.features, 'manifest.features'); unique(features, 'manifest.features');
    const violations = [], measurements = [];
    for (const f of features) {
      need(kinds.includes(f.kind), `feature.${f.id}.kind`, 'Unknown feature kind');
      let measuredPx, thresholdPx;
      if (f.kind === 'discriminator') {
        measuredPx = number(f.differencePx, `feature.${f.id}.differencePx`); thresholdPx = SCENE_LIMITS.discriminatorPx;
      } else {
        const prefix = f.kind === 'target' ? 'effective' : '';
        const w = prefix ? 'effectiveWidthPx' : 'widthPx', h = prefix ? 'effectiveHeightPx' : 'heightPx';
        measuredPx = Math.min(number(f[w], `feature.${f.id}.${w}`, true), number(f[h], `feature.${f.id}.${h}`, true));
        thresholdPx = f.kind === 'target' ? SCENE_LIMITS.targetPx : SCENE_LIMITS.thumbnailPx;
      }
      const m = { id: f.id, kind: f.kind, measuredPx, thresholdPx }; measurements.push(m);
      if (measuredPx + E < thresholdPx) violations.push({ code: 'feature_too_small', ...m });
    }
    for (const kind of required) if (!features.some((f) => f.kind === kind)) violations.push({ code: 'missing_feature_data', kind });
    return { violations, metrics: { complete: true, requiredKinds: required.slice(),
      unauditedKinds: kinds.filter((kind) => !features.some((f) => f.kind === kind)), measurements } };
  });
}
