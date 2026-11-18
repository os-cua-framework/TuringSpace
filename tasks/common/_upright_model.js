import { makeCamera } from './_proj3d.js';
import { grounded, noIntersect } from '../core/scene-validators.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]), scale=(a,k)=>a.map(v=>v*k), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.hypot(...a), unit=a=>scale(a,1/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const obj=a=>({x:a[0],y:a[1],z:a[2]}), arr=o=>[o.x,o.y,o.z];
const mul=(a,b)=>[a[0]*b[0]-dot(a.slice(1),b.slice(1)),...add(add(scale(b.slice(1),a[0]),scale(a.slice(1),b[0])),cross(a.slice(1),b.slice(1)))];
const axisQ=(a,t)=>[Math.cos(t/2),...scale(unit(a),Math.sin(t/2))];
const rotate=(q,p)=>mul(mul(q,[0,...p]),[q[0],...scale(q.slice(1),-1)]).slice(1);
const arc=(a,b)=>{
  const d=Math.max(-1,Math.min(1,dot(a,b)));
  if(d>1-1e-14)return [1,0,0,0];
  if(d<-1+1e-12){const ref=Math.abs(a[0])<.8?[1,0,0]:[0,1,0];return axisQ(cross(a,ref),Math.PI);}
  return unit([1+d,...cross(a,b)]);
};
const CAMERA={yaw:25,pitch:22,dist:360,fov:620,cx:210,cy:290,minDepth:80};
const camera=makeCamera(CAMERA),basis=[arr(camera.r),arr(camera.u),scale(arr(camera.f),-1)];
const world=v=>v.reduce((a,k,i)=>add(a,scale(basis[i],k)),[0,0,0]);
const screenVector=p=>{
  let v=[(p[0]-170)/142,(160-p[1])/142,0],d=Math.hypot(v[0],v[1]);
  if(d>1)v=scale(v,1/d);else v[2]=Math.sqrt(Math.max(0,1-d*d));return v;
};
function drag(q,from,to){const dq=arc(screenVector(from),screenVector(to));return unit(mul([dq[0],...world(dq.slice(1))],q));}
const screen=v=>[170+142*v[0],160-142*v[1]];
function endpoints(axis,angle){
  const n=basis.map(b=>dot(axis,b));let m=add([0,0,1],scale(n,-n[2]));
  if(norm(m)<1e-10)m=[1,0,0];else m=unit(m);
  const side=cross(n,m),a=add(scale(m,Math.cos(angle/2)),scale(side,-Math.sin(angle/2))),b=add(scale(m,Math.cos(angle/2)),scale(side,Math.sin(angle/2)));
  return {from:screen(a),to:screen(b),a,b};
}
const cylinder=(id,a,axis,r)=>({id,type:'cylinder',base:obj(a),axis:obj(axis),r});
const capsule=(id,a,b,r)=>({id,type:'capsule',a:obj(a),b:obj(b),r});
const local=[cylinder('seat',[0,40,0],[0,8,0],28)];
for(const x of [-16,16])for(const z of [-16,16])local.push(cylinder(`leg_${x}_${z}`,[x,0,z],[0,40,0],4));
const backSlope=Math.tan(Math.PI/6);
for(const x of [-18,18])local.push(cylinder(`back_${x}`,[x,44,-16],[0,40,-40*backSlope],4));
local.push(capsule('back_rail',[-18,84,-16-40*backSlope],[18,84,-16-40*backSlope],4),cylinder('arm_post',[18,44,16],[0,22,0],3.5),capsule('arm_rail',[18,66,-16-22*backSlope],[18,66,16],3.5));
function posed(q){
  const point=p=>rotate(q,add(arr(p),[0,-44,0]));
  const parts=local.map(p=>p.type==='cylinder'?{...p,base:obj(point(p.base)),axis:obj(rotate(q,arr(p.axis)))}:{...p,a:obj(point(p.a)),b:obj(point(p.b))});
  const bottom=p=>p.type==='capsule'?Math.min(p.a.y,p.b.y)-p.r:Math.min(p.base.y,p.base.y+p.axis.y)-p.r*Math.sqrt(Math.max(0,1-p.axis.y*p.axis.y/dot(arr(p.axis),arr(p.axis))));
  const minY=Math.min(...parts.map(bottom));
  for(const p of parts)for(const k of p.type==='cylinder'?['base']:['a','b'])p[k].y-=minY;
  const floor={id:'floor-solid',parts:[{type:'box',x:0,y:-6,z:0,w:300,h:6,d:300}]};
  const geometry={bodies:[{id:'chair',supportId:'floor',parts}],supportGeometry:[floor],supports:[{id:'floor',type:'boxTop',bodyId:'floor-solid',partIndex:0}]};
  return {q,parts,translationY:-minY,geometry,up:rotate(q,[0,1,0]),tiltDegrees:Math.acos(Math.max(-1,Math.min(1,rotate(q,[0,1,0])[1])))*180/Math.PI};
}

export const LAYOUT={scene:{x:0,y:0,w:340,h:320},board:{w:340,h:320},ball:{x:170,y:160,r:142}};
export function partBounds(p){const a=arr(p.type==='capsule'?p.a:p.base),b=p.type==='capsule'?arr(p.b):add(a,arr(p.axis)),u=unit(add(b,scale(a,-1))),e=u.map(v=>p.type==='capsule'?p.r:p.r*Math.sqrt(Math.max(0,1-v*v)));return{lo:a.map((v,i)=>Math.min(v,b[i])-e[i]),hi:a.map((v,i)=>Math.max(v,b[i])+e[i])};}
export function buildScene(q){const b=posed(q),points=[];for(const p of b.parts){const a=partBounds(p);for(const x of [a.lo[0],a.hi[0]])for(const y of [a.lo[1],a.hi[1]])for(const z of [a.lo[2],a.hi[2]])points.push(camera.project({x,y,z}));}if(points.some(p=>p.depth<=80))throw Error('clamped projection');const x0=Math.min(...points.map(p=>p.x)),x1=Math.max(...points.map(p=>p.x)),y0=Math.min(...points.map(p=>p.y)),y1=Math.max(...points.map(p=>p.y));const fit=Math.min(260/(x1-x0),240/(y1-y0)),cam=makeCamera({...CAMERA,fov:CAMERA.fov*fit,cx:170-((x0+x1)/2-CAMERA.cx)*fit,cy:160-((y0+y1)/2-CAMERA.cy)*fit});return{...b,cam,focal:CAMERA.fov*fit,cx:170-((x0+x1)/2-CAMERA.cx)*fit,cy:160-((y0+y1)/2-CAMERA.cy)*fit,fit,unfittedBounds:{x0,x1,y0,y1},layout:LAYOUT};}
export function correctionGestures(q){const d=arc(rotate(q,[0,1,0]),[0,1,0]),angle=2*Math.acos(Math.max(-1,Math.min(1,d[0])));if(angle<1e-10)return[{from:[170,160],to:[170,160]},{from:[170,160],to:[170,160]}];const a=unit(d.slice(1)),e=endpoints(a,angle/2);return[e,e].map(p=>({from:p.from,to:p.to}));}
export function semanticUpright(q){return Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)&&rotate(unit(q),[0,1,0])[1]>=Math.cos(Math.PI/9);}
export {add,scale,dot,norm,unit,cross,obj,arr,mul,axisQ,rotate,arc,drag,posed,grounded,noIntersect};

export function relativeGestures(delta){let q=unit(delta);if(q[0]<0)q=q.map(v=>-v);const v=q.slice(1),n=norm(v);if(n<1e-14)return[{from:[170,160],to:[170,160]},{from:[170,160],to:[170,160]}];const angle=2*Math.atan2(n,q[0]),axis=scale(v,1/n),e=endpoints(axis,angle/2);return[e,e].map(p=>({from:[...p.from],to:[...p.to]}));}
