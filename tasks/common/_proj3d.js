export const rad3 = (d) => d * Math.PI / 180;
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const unit3 = (v) => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };

export function makeCamera({ yaw, pitch, dist = 430, cx = 170, cy = 178, fov = 255, minDepth = 80 }) {
  const a = rad3(yaw);
  const cam = { x: Math.sin(a) * dist, y: Math.tan(rad3(pitch)) * dist, z: Math.cos(a) * dist };
  const f = unit3({ x: -cam.x, y: -cam.y, z: -cam.z });
  const r = unit3({ x: -f.z, y: 0, z: f.x });
  const u = unit3({
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  });
  const project = (p) => {
    const q = sub3(p, cam);
    const depth = dot3(q, f), s = fov / Math.max(minDepth, depth);
    return { x: cx + dot3(q, r) * s, y: cy - dot3(q, u) * s, depth };
  };
  return { cam, f, r, u, project };
}

export function boxWorldPoint(o, lx, ly, lz) {
  const a = rad3(o.yawDeg || 0), ca = Math.cos(a), sa = Math.sin(a);
  return { x: o.x + lx * ca + lz * sa, y: ly, z: o.z - lx * sa + lz * ca };
}

export function boxVertices(o) {
  const out = [];
  for (const lx of [-o.w / 2, o.w / 2]) for (const ly of [0, o.h]) for (const lz of [-o.d / 2, o.d / 2])
    out.push(boxWorldPoint(o, lx, ly, lz));
  return out;
}

export function projectBox(o, camera) {
  const ps = boxVertices(o).map(camera.project);
  return {
    ps,
    x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)),
    y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)),
    depth: ps.reduce((s, p) => s + p.depth, 0) / ps.length,
  };
}

export function shade3(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.max(0, Math.min(255, v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function drawBox(g, o, camera, color) {
  const b = projectBox(o, camera);
  const p = b.ps;
  const faces = [
    [p[0], p[1], p[5], p[4]], [p[2], p[3], p[7], p[6]],
    [p[0], p[2], p[6], p[4]], [p[1], p[3], p[7], p[5]],
    [p[0], p[1], p[3], p[2]], [p[4], p[5], p[7], p[6]],
  ].sort((fa, fb) => fb.reduce((s, q) => s + q.depth, 0) - fa.reduce((s, q) => s + q.depth, 0));
  faces.slice(-3).forEach((face, fi) => {
    g.beginPath(); face.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath();
    g.fillStyle = fi === 2 ? color : shade3(color, fi === 0 ? 0.66 : 0.82); g.fill();
    g.strokeStyle = 'rgba(28,35,42,.48)'; g.stroke();
  });
  return b;
}

export function sortBoxesForDraw(objects, camera) {
  return objects.map((o) => ({ o, b: projectBox(o, camera) })).sort((a, b) => b.b.depth - a.b.depth);
}

export function drawGroundGrid(g, camera, { extent = 190, step = 45, style = 'rgba(63,77,87,.16)' } = {}) {
  g.strokeStyle = style; g.lineWidth = 1;
  for (let x = -extent + 10; x <= extent - 10; x += step) {
    const a = camera.project({ x, y: 0, z: -extent }), b = camera.project({ x, y: 0, z: extent });
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  for (let z = -extent + 10; z <= extent - 10; z += step) {
    const a = camera.project({ x: -extent, y: 0, z }), b = camera.project({ x: extent, y: 0, z });
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
}

export function pointOccluded(pt, objects, camera, margin = 4) {
  const tp = camera.project(pt);
  for (const o of objects) {
    const b = projectBox(o, camera);
    if (b.depth < tp.depth - margin && tp.x >= b.x0 && tp.x <= b.x1 && tp.y >= b.y0 && tp.y <= b.y1) return true;
  }
  return false;
}

export function drawBoxFromEye(g, o, camera, color) {
  const b=projectBox(o,camera),p=b.ps,a=rad3(o.yawDeg||0);
  const dx=camera.cam.x-o.x,dz=camera.cam.z-o.z;
  const ex=dx*Math.cos(a)-dz*Math.sin(a),ez=dx*Math.sin(a)+dz*Math.cos(a);
  const visible=[camera.cam.y<0,camera.cam.y>o.h,ez<-o.d/2,ez>o.d/2,ex<-o.w/2,ex>o.w/2];
  const faces=[[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5],[0,1,3,2],[4,5,7,6]]
    .filter((_,i)=>visible[i]).map(ids=>ids.map(i=>p[i]))
    .sort((a,b)=>b.reduce((n,p)=>n+p.depth,0)-a.reduce((n,p)=>n+p.depth,0));
  faces.forEach((face,i)=>{
    g.beginPath();face.forEach((p,k)=>k?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();
    g.fillStyle=i===faces.length-1?color:shade3(color,i===faces.length-2?.82:.66);g.fill();
    g.strokeStyle='rgba(28,35,42,.48)';g.stroke();
  });return b;
}

export function clipNearSegment(a, b, camera, near) {
  const depth = p => (p.x - camera.cam.x) * camera.f.x
    + (p.y - camera.cam.y) * camera.f.y + (p.z - camera.cam.z) * camera.f.z;
  const da = depth(a), db = depth(b);
  if (da < near && db < near) return null;
  if (da >= near && db >= near) return [a, b];
  const t = (near - da) / (db - da);
  const crossing = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) };
  return da < near ? [crossing, b] : [a, crossing];
}
