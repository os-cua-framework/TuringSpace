import { boxVertices } from './_proj3d.js';
import { prismVertices } from './_scene3d.js';
import { hull, shape, distance } from './_clay_feature_geometry.js';
import { featureCircle } from './_table_view_features.js';
import { visibleDisk, subtractConvex, expandConvex } from '../core/feature-geometry.js';
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),mul=(p,s)=>({x:p.x*s,y:p.y*s,z:p.z*s}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),unit=p=>mul(p,1/Math.hypot(p.x,p.y,p.z));
function rim(c,u,r){const ref=Math.abs(u.y)>.94?{x:1,y:0,z:0}:{x:0,y:1,z:0},a=unit(cross(u,ref)),b=unit(cross(u,a));return Array.from({length:24},(_,i)=>add(c,add(mul(a,r*Math.cos(i*Math.PI/12)),mul(b,r*Math.sin(i*Math.PI/12)))));}
const pad=poly=>hull(poly.flatMap(p=>featureCircle(p,.75,16)));
export function seatPaintCover(p,cam){
 if(p.type==='sphere')return shape(p,cam).outer;
 if(p.type==='box')return pad(hull(boxVertices(p).map(q=>cam.project({...q,y:q.y+(p.y||0)}))));
 if(p.type==='prism')return pad(hull(prismVertices(p).map(cam.project)));
 if(p.type==='cylinder'){const u=unit(p.axis);return pad(hull([...rim(p.base,u,p.r),...rim(add(p.base,p.axis),u,p.r)].map(cam.project)));}
 if(p.type==='hemisphere'){const u=unit(p.up),c=cam.project(p.c),e=cam.project(add(p.c,mul(cam.r,p.r))),r=Math.hypot(e.x-c.x,e.y-c.y),a=cam.project(add(p.c,mul(u,p.r))),ps=rim(p.c,u,p.r).map(cam.project);for(let i=0;i<24;i++){const q={x:c.x+r*Math.cos(i*Math.PI/12),y:c.y+r*Math.sin(i*Math.PI/12)};if((q.x-c.x)*(a.x-c.x)+(q.y-c.y)*(a.y-c.y)>=0)ps.push(q);}return pad(hull(ps));}
 throw Error('Uncovered seat-task primitive '+p.type);
}
const prepared=new WeakMap();
function prepare(built){let data=prepared.get(built.scene);if(!data){built.scene.render({background:false});data={order:built.scene.orderDiagnostics.order,covers:built.scene.queue.map(p=>seatPaintCover(p,built.camera))};prepared.set(built.scene,data);}return data;}
const boundsCache=new WeakMap();
function bounds(poly){let b=boundsCache.get(poly);if(!b){b={x0:Math.min(...poly.map(p=>p.x)),x1:Math.max(...poly.map(p=>p.x)),y0:Math.min(...poly.map(p=>p.y)),y1:Math.max(...poly.map(p=>p.y))};boundsCache.set(poly,b);}return b;}
function nearby(source,covers){const a=bounds(source);return covers.filter(poly=>{const b=bounds(poly);return !(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0);});}
function visibleHeadDisk(polygon,covers,centre){
 covers=nearby(polygon,covers);
 const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 let r=Math.min(...polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length];return cross(a,b,centre)/Math.hypot(b.x-a.x,b.y-a.y);}));
 for(const cover of covers)r=Math.min(r,distance(centre,cover));r=Math.max(0,r-2e-8);
 return r>=1.5?{...centre,r}:visibleDisk([polygon],covers,1.5);
}
export function headWitness(built,bodyId,headY,scale,extra=[]){
 const {scene,camera,geometry}=built,data=prepare(built);
 const body=geometry.bodies.find(b=>b.id===bodyId),indices=body.queueIndices;
 const index=indices.find(i=>scene.queue[i].type==='sphere'&&Math.abs(scene.queue[i].c.y-headY)<1e-7&&Math.abs(scene.queue[i].r-8.6*scale)<1e-7);
 if(index===undefined)throw Error('Missing actual figure head sphere');
 const headParts=indices.filter(i=>['sphere','hemisphere'].includes(scene.queue[i].type)&&scene.queue[i].c.y>=headY-4*scale);
 const later=data.order.slice(data.order.indexOf(index)+1).filter(i=>!headParts.includes(i));
 const source=shape(scene.queue[index],camera),w=visibleHeadDisk(source.inner,later.map(i=>data.covers[i]).concat(extra),source.center);
 return{diameter:2*w.r,witness:{x:w.x,y:w.y,r:w.r},index,headParts,later};
}
export function rugWitness(built,extra=[]){
 const source=hull(built.geometry.floorRegions[0].points.map(built.camera.project));
 const polygon=expandConvex(source,-.75),w=visibleDisk([polygon],nearby(polygon,prepare(built).covers.concat(extra)),1.5);
 return{diameter:2*w.r,witness:{x:w.x,y:w.y,r:w.r}};
}
export function screenWitness(built,bodyId,extra=[]){
 const {scene,camera,geometry}=built,data=prepare(built);const body=geometry.bodies.find(b=>b.id===bodyId),own=body.queueIndices;let best={span:0},sources=[];
 for(const index of own){const p=scene.queue[index];if(p.type!=='prism')throw Error('Expected actual screen prism');
  const polygon=hull(prismVertices(p).map(camera.project)),later=data.order.slice(data.order.indexOf(index)+1).filter(i=>!own.includes(i));
  let pieces=[polygon];for(const cover of nearby(polygon,later.map(i=>data.covers[i]).concat(extra))){pieces=pieces.flatMap(poly=>subtractConvex(poly,cover));if(!pieces.length)break;}
  for(const poly of pieces){if(poly.length<3)continue;const centre=poly.reduce((a,p)=>({x:a.x+p.x/poly.length,y:a.y+p.y/poly.length}),{x:0,y:0});for(const axis of['x','y']){const a=poly.reduce((a,p)=>p[axis]<a[axis]?p:a),b=poly.reduce((a,p)=>p[axis]>a[axis]?p:a),u={x:a.x+(centre.x-a.x)*1e-6,y:a.y+(centre.y-a.y)*1e-6},v={x:b.x+(centre.x-b.x)*1e-6,y:b.y+(centre.y-b.y)*1e-6},span=Math.hypot(u.x-v.x,u.y-v.y);if(span>best.span)best={span,index,points:[u,v]};}}
  sources.push({index,later,pieces:pieces.length});
 }
 return{...best,sources,meaning:'Visible line/face extent of the original thin screen, not a3px-thick wall or a homogeneous disk. Own prism pieces retain one screen identity.'};
}
