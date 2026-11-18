import { makeCamera, drawBox, drawBoxFromEye, drawGroundGrid, boxVertices } from './_proj3d.js';

export { makeCamera, drawBox, drawGroundGrid, boxVertices };

export const FOV = 420;

export function stdCamera(m, W, H) {
  return makeCamera({ yaw: m.cam.yaw, pitch: m.cam.pitch, dist: 320, cx: W / 2, cy: H * 0.55, fov: FOV, minDepth: 50 });
}

export function hull2(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function ptHullDist(x, y, poly) {
  if (inPoly(x, y, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

export function screenPtOccluded(sp, crates, camera) {
  for (const c of crates) {
    const vs = boxVertices(c).map(camera.project);
    const far = Math.max(...vs.map((v) => v.depth));
    if (sp.depth <= far + 2) continue;
    if (inPoly(sp.x, sp.y, hull2(vs))) return true;
  }
  return false;
}

export const GEM_COLORS = {
  red: '#d64541', green: '#3d9b52', blue: '#3f7fd6',
  yellow: '#d8b13a', purple: '#8e5bc0', cyan: '#15c4dd',
};

export function gemWorld(gm) { return { x: gm.x, y: gm.r, z: gm.z }; }

export function gemScreen(gm, camera, fov = FOV) {
  const p = camera.project(gemWorld(gm));
  return { ...p, r2: (gm.r * fov) / Math.max(60, p.depth) };
}

export function drawGem(g, p, r2, color) {
  g.beginPath();
  g.moveTo(p.x, p.y - r2 * 1.25);
  g.lineTo(p.x + r2, p.y);
  g.lineTo(p.x, p.y + r2 * 1.25);
  g.lineTo(p.x - r2, p.y);
  g.closePath();
  g.fillStyle = color; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
}

export function drawScene(g, camera, crates, gems, opts = {}) {
  const items = [];
  crates.forEach((c, i) => {
    const vs = boxVertices(c).map(camera.project);
    items.push({ kind: 'crate', i, c, vs, depth: vs.reduce((s, v) => s + v.depth, 0) / vs.length });
  });
  (gems || []).forEach((gm, i) => {
    const p = gemScreen(gm, camera, opts.fov || FOV);
    items.push({ kind: 'gem', i, gm, p, depth: p.depth });
  });
  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) {
    if (it.kind === 'crate') {
      drawBox(g, it.c, camera, opts.crateColor?.(it.i) || '#6b7a86');
      if (opts.markCrate === it.i) {
        const h = hull2(it.vs);
        g.beginPath();
        h.forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
        g.strokeStyle = '#1991fa'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
      }
    } else {
      drawGem(g, it.p, it.p.r2, GEM_COLORS[it.gm.color] || it.gm.color);
      if (opts.markGem === it.i) {
        g.beginPath(); g.arc(it.p.x, it.p.y, it.p.r2 * 1.7, 0, Math.PI * 2);
        g.strokeStyle = '#1991fa'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
      }
    }
  }
}

export function crateAt(x, y, crates, camera, slack = 6) {
  let best = -1, bd = Infinity;
  crates.forEach((c, i) => {
    const vs = boxVertices(c).map(camera.project);
    if (ptHullDist(x, y, hull2(vs)) <= slack) {
      const depth = vs.reduce((s, v) => s + v.depth, 0) / vs.length;
      if (depth < bd) { bd = depth; best = i; }
    }
  });
  return best;
}

export function gemAt(x, y, gems, camera, hitR = 18, fov = FOV) {
  let best = -1, bd = Infinity;
  (gems || []).forEach((gm, i) => {
    const p = gemScreen(gm, camera, fov);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd && d <= Math.max(hitR, p.r2 * 1.6)) { bd = d; best = i; }
  });
  return best;
}

export function scatterCrates(rng, n, opts = {}) {
  const span = opts.span || 160;
  const slots = [];
  for (let i = 0; i < n; i++) slots.push(-span + (2 * span * i) / Math.max(1, n - 1));
  const sh = rng.shuffle(slots);
  const crates = [];
  for (let i = 0; i < n; i++) {
    crates.push({
      x: sh[i] + rng.uniform(-14, 14), z: rng.uniform(opts.zMin ?? -40, opts.zMax ?? 40),
      w: rng.uniform(opts.wMin ?? 34, opts.wMax ?? 56),
      d: rng.uniform(30, 46), h: rng.uniform(opts.hMin ?? 36, opts.hMax ?? 72),
      yawDeg: rng.uniform(-22, 22),
    });
  }
  return crates;
}

export function skyFill(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#232e3a'); sky.addColorStop(0.45, '#3a4a55'); sky.addColorStop(1, '#2c3842');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
}

export const VP_FOV = 300;

export function vpCamera(m, vp, yaw, o = {}) {
  return makeCamera({
    yaw, pitch: m.cam.pitch, dist: o.dist ?? 280,
    cx: vp.x + vp.w / 2, cy: vp.y + vp.h * (o.cyF ?? 0.56),
    fov: o.fov ?? VP_FOV, minDepth: 50,
  });
}

export function drawViewport(g, vp, camera, crates, gems, opts = {}) {
  g.save();
  g.beginPath();
  if (g.roundRect) g.roundRect(vp.x, vp.y, vp.w, vp.h, 8); else g.rect(vp.x, vp.y, vp.w, vp.h);
  g.clip();
  if (opts.mirror) { g.translate(vp.x * 2 + vp.w, 0); g.scale(-1, 1); }
  const sky = g.createLinearGradient(0, vp.y, 0, vp.y + vp.h);
  sky.addColorStop(0, '#232e3a'); sky.addColorStop(0.5, '#3a4a55'); sky.addColorStop(1, '#2c3842');
  g.fillStyle = sky; g.fillRect(vp.x - vp.w, vp.y, vp.w * 3, vp.h);
  drawGroundGrid(g, camera, { extent: 200, step: opts.gridStep ?? 38, style: 'rgba(160,190,205,.14)' });
  drawScene(g, camera, crates, gems, { fov: VP_FOV, ...opts });
  g.restore();
  g.strokeStyle = opts.border ?? 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
  g.beginPath();
  if (g.roundRect) g.roundRect(vp.x, vp.y, vp.w, vp.h, 8); else g.rect(vp.x, vp.y, vp.w, vp.h);
  g.stroke(); g.lineWidth = 1;
}

export function vpLabel(g, vp, text, color = 'rgba(70,86,100,.9)') {
  g.font = '600 10px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, vp.x + vp.w / 2, vp.y - 9);
}

export function vpCratesOk(crates, camera, vp, minSep = 24, skipSep = false) {
  const pts = crates.map((c) => camera.project({ x: c.x, y: c.h / 2, z: c.z }));
  for (const p of pts) {
    if (p.x < vp.x + 16 || p.x > vp.x + vp.w - 16 || p.y < vp.y + 14 || p.y > vp.y + vp.h - 14) return null;
  }
  if (!skipSep) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < minSep) return null;
      }
    }
  }
  return pts;
}

export function discCrates(rng, n, { radius, minSep, heights } = {}) {
  const hs = rng.shuffle((heights || [40, 50, 60, 70, 80, 90]).slice()).slice(0, n);
  const pts = [];
  for (let i = 0; i < n; i++) {
    let ok = false;
    for (let t = 0; t < 120 && !ok; t++) {
      const a = rng.uniform(0, Math.PI * 2), r = radius * Math.sqrt(rng.uniform(0.06, 1));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pts.every((p) => Math.hypot(p.x - x, p.z - z) >= minSep)) { pts.push({ x, z }); ok = true; }
    }
    if (!ok) return null;
  }
  return pts.map((p, i) => ({
    x: p.x, z: p.z, w: rng.uniform(24, 34), d: rng.uniform(22, 30), h: hs[i] + rng.uniform(-3, 3),
    yawDeg: rng.uniform(-20, 20),
  }));
}

export function coverFrac(back, front, camera) {
  const vsB = boxVertices(back).map(camera.project);
  const vsF = boxVertices(front).map(camera.project);
  const dB = vsB.reduce((s, v) => s + v.depth, 0) / vsB.length;
  const dF = vsF.reduce((s, v) => s + v.depth, 0) / vsF.length;
  if (dF >= dB - 18) return 0;
  const hB = hull2(vsB), hF = hull2(vsF);
  const xs = hB.map((p2) => p2.x), ys = hB.map((p2) => p2.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let inB = 0, inBoth = 0;
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const x = x0 + ((i + 0.5) / 12) * (x1 - x0), y = y0 + ((j + 0.5) / 12) * (y1 - y0);
      if (!inPoly(x, y, hB)) continue;
      inB++;
      if (inPoly(x, y, hF)) inBoth++;
    }
  }
  return inB ? inBoth / inB : 0;
}

export function vpNoHeavyOverlap(crates, camera, maxCover = 0.15) {
  for (let b = 0; b < crates.length; b++) {
    for (let f = 0; f < crates.length; f++) {
      if (b !== f && coverFrac(crates[b], crates[f], camera) > maxCover) return false;
    }
  }
  return true;
}

export function boxInFrontOfMarker(box, camera, depth) {
  const vertices=boxVertices(box),ps=vertices.map(camera.project),front=[];
  for(let i=0;i<vertices.length;i++)if(ps[i].depth<=depth)front.push(vertices[i]);
  for(let i=0;i<8;i++)for(const bit of [1,2,4]){
    const j=i^bit;if(j<i||(ps[i].depth-depth)*(ps[j].depth-depth)>=0)continue;
    const t=(depth-ps[i].depth)/(ps[j].depth-ps[i].depth),a=vertices[i],b=vertices[j];
    front.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  }
  return front.length?hull2(front.map(camera.project)):[];
}

export function projectMarkedBoxes(camera, boxes, gems, fov=FOV) {
  return {camera,boxes,markers:gems.map((gem,i)=>{
    const p=gemScreen(gem,camera,fov);
    return {gem,i,p,path:[{x:p.x,y:p.y-p.r2*1.25},{x:p.x+p.r2,y:p.y},{x:p.x,y:p.y+p.r2*1.25},{x:p.x-p.r2,y:p.y}],
      occluders:boxes.map((box,boxIndex)=>({boxIndex,path:boxInFrontOfMarker(box,camera,p.depth)})).filter(o=>o.path.length>=3)};
  })};
}

export function drawMarkedBoxes(g, scene, board, crateColor) {
  const ordered=scene.boxes.map((box,i)=>({box,i,depth:boxVertices(box).map(scene.camera.project).reduce((s,p)=>s+p.depth,0)/8})).sort((a,b)=>b.depth-a.depth);
  for(const {box,i}of ordered)drawBoxFromEye(g,box,scene.camera,crateColor(i));
  for(const marker of scene.markers){
    g.save();
    for(const occluder of marker.occluders){
      g.beginPath();g.rect(0,0,board.w,board.h);
      occluder.path.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.clip('evenodd');
    }
    drawGem(g,marker.p,marker.p.r2,GEM_COLORS[marker.gem.color]||marker.gem.color);g.restore();
  }
}
