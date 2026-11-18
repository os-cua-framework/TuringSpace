import { expandConvex, visibleDisk } from '../core/feature-geometry.js';
import { makeScene } from './_scene3d.js';
const TAU = 2 * Math.PI;
export function nearestRegion(p,points,radius,board){const constraints=[{x:-1,y:0,d:p.x},{x:1,y:0,d:board.w-p.x},{x:0,y:-1,d:p.y},{x:0,y:1,d:board.h-p.y}];for(const q of points)if(q.id!==p.id){const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);constraints.push({x:dx/d,y:dy/d,d:d/2});}const candidates=[{x:-radius,y:0},{x:radius,y:0},{x:0,y:-radius},{x:0,y:radius}];for(const a of constraints)if(Math.abs(a.d)<=radius){const t=Math.sqrt(radius*radius-a.d*a.d);for(const sign of[-1,1])candidates.push({x:a.x*a.d-sign*a.y*t,y:a.y*a.d+sign*a.x*t});}for(let i=0;i<constraints.length;i++)for(let j=i+1;j<constraints.length;j++){const a=constraints[i],b=constraints[j],det=a.x*b.y-a.y*b.x;if(Math.abs(det)>1e-12)candidates.push({x:(a.d*b.y-a.y*b.d)/det,y:(a.x*b.d-a.d*b.x)/det});}const pointsIn=candidates.filter(q=>Math.hypot(q.x,q.y)<=radius+1e-7&&constraints.every(a=>a.x*q.x+a.y*q.y<=a.d+1e-7));return{center:p,radius,constraints,extrema:pointsIn.map(q=>({x:p.x+q.x,y:p.y+q.y})),width:Math.max(...pointsIn.map(q=>q.x))-Math.min(...pointsIn.map(q=>q.x)),height:Math.max(...pointsIn.map(q=>q.y))-Math.min(...pointsIn.map(q=>q.y)),centredInnerDiameter:2*Math.min(radius,...constraints.map(a=>a.d))};}
export const mock=()=>new Proxy({canvas:{width:340,height:600},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:t=>({width:String(t).length*6})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
export function hull(ps){ps=ps.slice().sort((a,b)=>a.x-b.x||a.y-b.y);const cr=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),half=rows=>{const h=[];for(const p of rows){while(h.length>1&&cr(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h;};return half(ps).slice(0,-1).concat(half(ps.slice().reverse()).slice(0,-1));}
const circle=(c,r,n=48)=>Array.from({length:n},(_,i)=>({x:c.x+r*Math.cos(TAU*i/n),y:c.y+r*Math.sin(TAU*i/n)}));
export function shape(p,camera){
 if(p.type==='sphere'){const c=camera.project(p.c),q=camera.project({x:p.c.x+camera.r.x*p.r,y:p.c.y+camera.r.y*p.r,z:p.c.z+camera.r.z*p.r}),r=Math.hypot(q.x-c.x,q.y-c.y);return{inner:circle(c,r-.75),outer:circle(c,(r+.75)/Math.cos(Math.PI/48)),center:c,r};}
 let points=[];if(p.type==='box'){for(const x of[-p.w/2,p.w/2])for(const y of[0,p.h])for(const z of[-p.d/2,p.d/2])points.push(camera.project({x:p.x+x,y:(p.y||0)+y,z:p.z+z}));}else if(p.type==='cylinder'||p.type==='cone'){const ring=y=>Array.from({length:24},(_,i)=>camera.project({x:p.base.x-p.r*Math.sin(TAU*i/24),y,z:p.base.z-p.r*Math.cos(TAU*i/24)}));points=ring(p.base.y);if(p.type==='cylinder')points.push(...ring(p.base.y+p.axis.y));else points.push(camera.project({...p.base,y:p.base.y+p.height}));}else throw Error('unsupported '+p.type);
 const outer=hull(points);let inside=outer;if(p.type==='box'&&p.round>0){const rad=Math.min(Math.max(...outer.map(p=>p.x))-Math.min(...outer.map(p=>p.x)),Math.max(...outer.map(p=>p.y))-Math.min(...outer.map(p=>p.y)))*.16;inside=[];const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});for(let i=0;i<outer.length;i++){const cur=outer[i],prev=outer[(i+outer.length-1)%outer.length],next=outer[(i+1)%outer.length],a=lerp(cur,prev,Math.min(.5,rad/Math.hypot(cur.x-prev.x,cur.y-prev.y))),b=lerp(cur,next,Math.min(.5,rad/Math.hypot(cur.x-next.x,cur.y-next.y)));for(let k=0;k<=12;k++){const t=k/12;inside.push({x:(1-t)**2*a.x+2*(1-t)*t*cur.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*cur.y+t*t*b.y});}}}
 return{inner:expandConvex(inside,-.75),outer:expandConvex(outer,.75)};
}
export function distance(p,poly){let inside=true,min=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(dx*(p.y-a.y)-dy*(p.x-a.x)<0)inside=false;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));min=Math.min(min,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}return inside?0:min;}
export function separation(a,b){let best={distance:0};for(const[from,to]of[[a,b],[b,a]])for(const p of from.inner){const d=distance(p,to.outer);if(d>best.distance)best={distance:d,point:p};}return best;}
export function cover(p,cam){let points=[];if(p.type==='box'){for(const x of[p.x-p.w/2,p.x+p.w/2])for(const y of[p.y||0,(p.y||0)+p.h])for(const z of[p.z-p.d/2,p.z+p.d/2])points.push(cam.project({x,y,z}));}else {const cs=p.c?[p.c]:[p.base,{x:p.base.x+(p.axis?.x||0),y:p.base.y+(p.axis?.y||0),z:p.base.z+(p.axis?.z||0)}];for(const c of cs)for(const x of[c.x-p.r,c.x+p.r])for(const y of[c.y-p.r,c.y+p.r])for(const z of[c.z-p.r,c.z+p.r])points.push(cam.project({x,y,z}));if(p.c){const c=cam.project(p.c),q=cam.project({x:p.c.x+cam.r.x*p.r,y:p.c.y+cam.r.y*p.r,z:p.c.z+cam.r.z*p.r}),r=Math.hypot(q.x-c.x,q.y-c.y);points.push({x:c.x-r,y:c.y-r},{x:c.x+r,y:c.y+r});}}
 const x0=Math.min(...points.map(p=>p.x))-.75,x1=Math.max(...points.map(p=>p.x))+.75,y0=Math.min(...points.map(p=>p.y))-.75,y1=Math.max(...points.map(p=>p.y))+.75;return[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];}

export function markerWitness(scene, index) {
  scene.render({ background: false });
  const silhouette = shape(scene.queue[index], scene.camera);
  const later = scene.orderDiagnostics.order.slice(scene.orderDiagnostics.order.indexOf(index) + 1);
  const disk = visibleDisk([silhouette.inner], later.map(i => cover(scene.queue[i], scene.camera)), 1.5);
  return { diameter: 2 * disk.r, disk, later, silhouette };
}
function insideMargin(p, polygon) {
  return Math.min(...polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return ((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
  }));
}
export function topColorPatch(a, b, camera, light) {
  const top = p => p.type === 'box'
    ? hull([-1,1].flatMap(x => [-1,1].map(z => camera.project({x:p.x+x*p.w/2,y:p.y+p.h,z:p.z+z*p.d/2}))))
    : hull(Array.from({length:24},(_,i)=>camera.project({x:p.base.x-p.r*Math.sin(TAU*i/24),y:p.base.y+p.axis.y,z:p.base.z-p.r*Math.cos(TAU*i/24)})));
  const center = p => camera.project(p.type === 'box' ? {x:p.x,y:p.y+p.h,z:p.z} : {...p.base,y:p.base.y+p.axis.y});
  const ca=center(a), cb=center(b), point={x:(ca.x+cb.x)/2,y:(ca.y+cb.y)/2};
  const polygons=[a,b].flatMap(p=>[expandConvex(top(p),-.75),shape(p,camera).inner]);
  const radius=Math.max(0,Math.min(...polygons.map(poly=>insideMargin(point,poly))));
  const paint = p => {
    const g=mock(),fills=[];let points=[];g.beginPath=()=>{points=[];};g.moveTo=g.lineTo=(x,y)=>points.push({x,y});g.fill=()=>{if(points.length>=3&&insideMargin(point,hull(points))>=0)fills.push(g.fillStyle);};
    const scene=makeScene(g,camera,{light});scene.queue.push({...p,shadowY:null});scene.render({background:false});
    const colors=fills.filter(c=>typeof c==='string'&&c.startsWith('rgb('));
    return colors.at(-1).match(/\d+/g).map(Number);
  };
  const colors=[paint(a),paint(b)],contrast=Math.max(...colors[0].map((v,i)=>Math.abs(v-colors[1][i])));
  return {point,diameter:2*radius,colors,contrast,polygons};
}
