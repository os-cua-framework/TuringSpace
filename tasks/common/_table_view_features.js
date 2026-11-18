import { boxVertices } from './_proj3d.js';
import { shape, cover, hull } from './_clay_feature_geometry.js';
import { visibleDisk } from '../core/feature-geometry.js';

export const featureCircle=(p,r,n=32)=>Array.from({length:n},(_,i)=>({x:p.x+r/Math.cos(Math.PI/n)*Math.cos(i*2*Math.PI/n),y:p.y+r/Math.cos(Math.PI/n)*Math.sin(i*2*Math.PI/n)}));
export const featureRect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
export function featureStroke(a,b,r){return hull([...featureCircle(a,r),...featureCircle(b,r)]);}
function rotatedCamera(p,cam){
  if(p.type!=='box'||!p.yawDeg)return cam;const a=p.yawDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return {...cam,project:q=>cam.project({x:p.x+(q.x-p.x)*c+(q.z-p.z)*s,y:q.y,z:p.z-(q.x-p.x)*s+(q.z-p.z)*c})};
}
function intersect(subject,clip){let out=subject;const cr=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);for(let i=0;i<clip.length&&out.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],input=out;out=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],dp=cr(a,b,p),dq=cr(a,b,q);if(dp>=0)out.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push({x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y)});}}}return out;}
export function tablePartWitness(built,bodyId,extra=[],partIndex=0){
 const {scene,camera:cam,geometry}=built;scene.render({background:false});
 const body=geometry.bodies.find(b=>b.id===bodyId),index=body.queueIndices[partIndex],p=scene.queue[index],order=scene.orderDiagnostics.order;
 if(order.length!==scene.queue.length)throw Error('Unbound painter queue item');
 const sameColorBody=body.parts.every(q=>q.color===p.color);
 const later=order.slice(order.indexOf(index)+1).filter(i=>!sameColorBody||!body.queueIndices.includes(i)),covers=later.map(i=>cover(scene.queue[i],rotatedCamera(scene.queue[i],cam))).concat(extra);
 let polygons=[shape(p,rotatedCamera(p,cam)).inner];
 if(p.type==='box'){
  const points=boxVertices(p).map(q=>cam.project({...q,y:q.y+(p.y||0)})),a=(p.yawDeg||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const normals=[{x:0,y:-1,z:0},{x:0,y:1,z:0},{x:-s,y:0,z:-c},{x:s,y:0,z:c},{x:-c,y:0,z:s},{x:c,y:0,z:-s}];
  const faces=[[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5],[0,1,3,2],[4,5,7,6]],inside=polygons[0];
  polygons=faces.filter((_,i)=>normals[i].x*cam.f.x+normals[i].y*cam.f.y+normals[i].z*cam.f.z<0)
   .map(ids=>intersect(hull(ids.map(i=>points[i])),inside)).filter(poly=>poly.length>=3);
 }
 const witness=visibleDisk(polygons,covers),result={...witness,diameter:2*witness.r,index,later,bodyId,polygons,covers};
 if(witness.r>=1.5)return result;
 const precise=later.map(i=>refinedCover(scene.queue[i],cam)).concat(extra),next=visibleDisk(polygons,precise);
 return next.r>witness.r?{...next,diameter:2*next.r,index,later,bodyId,polygons,covers:precise,coarseDiameter:result.diameter,refinement:'actual painted primitive hulls'}:result;
}

const padded=(poly,r)=>hull(poly.flatMap(p=>Array.from({length:16},(_,i)=>({x:p.x+r/Math.cos(Math.PI/16)*Math.cos(i*Math.PI/8),y:p.y+r/Math.cos(Math.PI/16)*Math.sin(i*Math.PI/8)}))));
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),mul=(p,s)=>({x:p.x*s,y:p.y*s,z:p.z*s}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),unit=p=>mul(p,1/Math.hypot(p.x,p.y,p.z));
function ring(c,u,r){const ref=Math.abs(u.y)>.94?{x:1,y:0,z:0}:{x:0,y:1,z:0},e1=unit(cross(u,ref)),e2=unit(cross(u,e1));return Array.from({length:24},(_,i)=>add(c,add(mul(e1,r*Math.cos(i*Math.PI/12)),mul(e2,r*Math.sin(i*Math.PI/12)))));}
function roundedOuter(poly,r){const out=[],lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});for(let i=0;i<poly.length;i++){const q=poly[i],a=lerp(q,poly[(i+poly.length-1)%poly.length],Math.min(.5,r/Math.hypot(q.x-poly[(i+poly.length-1)%poly.length].x,q.y-poly[(i+poly.length-1)%poly.length].y))),b=lerp(q,poly[(i+1)%poly.length],Math.min(.5,r/Math.hypot(q.x-poly[(i+1)%poly.length].x,q.y-poly[(i+1)%poly.length].y)));for(let k=0;k<12;k++){const t=k/12,h=1/12,p={x:(1-t)**2*a.x+2*(1-t)*t*q.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*q.y+t*t*b.y},control={x:p.x+h*((1-t)*(q.x-a.x)+t*(b.x-q.x)),y:p.y+h*((1-t)*(q.y-a.y)+t*(b.y-q.y))};out.push(p,control);}out.push(b);}return hull(out);}
function refinedCover(p,cam){
 if(p.type==='box'){const h=hull(boxVertices(p).map(q=>cam.project({...q,y:q.y+(p.y||0)})));if(!p.round)return padded(h,.75);const w=Math.max(...h.map(q=>q.x))-Math.min(...h.map(q=>q.x)),height=Math.max(...h.map(q=>q.y))-Math.min(...h.map(q=>q.y));return padded(hull([...roundedOuter(h,Math.min(w,height)*.16),...roundedOuter(h,20)]),.75);}
 if(p.type==='sphere')return shape(p,cam).outer;
 if(p.type==='cylinder'){const u=unit(p.axis),points=[...ring(p.base,u,p.r),...ring(add(p.base,p.axis),u,p.r)].map(cam.project);return padded(hull(points),.75);}
 if(p.type==='hemisphere'){const u=unit(p.up),c=cam.project(p.c),edge=cam.project(add(p.c,mul(cam.r,p.r))),r=Math.hypot(edge.x-c.x,edge.y-c.y),points=ring(p.c,u,p.r).map(cam.project);for(let i=0;i<48;i++)points.push({x:c.x+r/Math.cos(Math.PI/48)*Math.cos(i*Math.PI/24),y:c.y+r/Math.cos(Math.PI/48)*Math.sin(i*Math.PI/24)});return padded(hull(points),.75);}
 return cover(p,cam);
}
