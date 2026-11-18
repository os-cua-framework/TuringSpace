const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0)/2;
const ccw=p=>area(p)<0?p.slice().reverse():p.slice();
const bounds=p=>({x0:Math.min(...p.map(q=>q.x)),x1:Math.max(...p.map(q=>q.x)),y0:Math.min(...p.map(q=>q.y)),y1:Math.max(...p.map(q=>q.y))});
function clip(p,a,b,inside=true){
 const out=[];for(let i=0;i<p.length;i++){
  const u=p[i],v=p[(i+1)%p.length],du=cross(a,b,u),dv=cross(a,b,v),uin=inside?du>=0:du<=0,vin=inside?dv>=0:dv<=0;
  if(uin)out.push(u);if(uin!==vin){const t=du/(du-dv);out.push({x:u.x+t*(v.x-u.x),y:u.y+t*(v.y-u.y)});}
 }return out.filter((q,i)=>!i||Math.hypot(q.x-out[i-1].x,q.y-out[i-1].y)>1e-10);
}
function subtract(p,obstacle){
 const a=bounds(p),b=bounds(obstacle);
 if(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0)return[p];
 let intersection=p;for(let i=0;i<obstacle.length&&intersection.length>=3;i++)intersection=clip(intersection,obstacle[i],obstacle[(i+1)%obstacle.length]);
 if(intersection.length<3||Math.abs(area(intersection))<1e-10)return[p];
 const out=[];let remaining=p;
 for(let i=0;i<obstacle.length&&remaining.length>=3;i++){
  const a=obstacle[i],b=obstacle[(i+1)%obstacle.length],piece=clip(remaining,a,b,false);
  if(piece.length>=3&&Math.abs(area(piece))>1e-10)out.push(piece);
  remaining=clip(remaining,a,b);
 }return out;
}
export function expandConvex(p,d){
 if(!p.length)return[];
 p=ccw(p);const b=bounds(p);
 if(d<0){
  let out=p;
  for(let i=0;i<p.length&&out.length;i++){
   const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
   if(l<1e-12)continue;
   const x=dy*d/l,y=-dx*d/l;
   out=clip(out,{x:a.x+x,y:a.y+y},{x:b.x+x,y:b.y+y});
  }
  return out.length>=3&&Math.abs(area(out))>1e-12?out:[];
 }
 if(Math.abs(area(p))<1e-9)return[{x:b.x0-d,y:b.y0-d},{x:b.x1+d,y:b.y0-d},{x:b.x1+d,y:b.y1+d},{x:b.x0-d,y:b.y1+d}];
 const lines=p.map((a,i)=>{const b=p[(i+1)%p.length],l=Math.hypot(b.x-a.x,b.y-a.y);return{x:-(b.y-a.y)/l,y:(b.x-a.x)/l,c:((b.x-a.x)*a.y-(b.y-a.y)*a.x)/l-d};});
 return lines.map((b,i)=>{const a=lines[(i+lines.length-1)%lines.length],det=a.x*b.y-a.y*b.x;
  if(Math.abs(det)<1e-12)throw Error('Degenerate consecutive feature edges');return{x:(a.c*b.y-a.y*b.c)/det,y:(a.x*b.c-a.c*b.x)/det};});
}
export function ringCover(x,y,r,width,n=32){
 const inner=r-width/2,outer=(r+width/2)/Math.cos(Math.PI/n)+1e-7;
 const at=(radius,i)=>({x:x+radius*Math.cos(i*2*Math.PI/n),y:y+radius*Math.sin(i*2*Math.PI/n)});
 return Array.from({length:n},(_,i)=>ccw([at(inner,i),at(outer,i),at(outer,i+1),at(inner,i+1)]));
}
function solve3(a,b,c){
 const det=(u,v,w)=>u[0]*(v[1]*w[2]-v[2]*w[1])-u[1]*(v[0]*w[2]-v[2]*w[0])+u[2]*(v[0]*w[1]-v[1]*w[0]);
 const d=det(a,b,c);if(Math.abs(d)<1e-12)return null;
 return[0,1,2].map(k=>{const x=a.slice(0,3),y=b.slice(0,3),z=c.slice(0,3);x[k]=a[3];y[k]=b[3];z[k]=c[3];return det(x,y,z)/d;});
}
export function innerDisk(p){
 p=ccw(p);const edges=p.map((a,i)=>{const b=p[(i+1)%p.length],d=Math.hypot(b.x-a.x,b.y-a.y);return[-(b.y-a.y)/d,(b.x-a.x)/d,-1,((b.x-a.x)*a.y-(b.y-a.y)*a.x)/d];}).filter(e=>e.every(Number.isFinite));
 let best={x:0,y:0,r:0};
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++)for(let k=j+1;k<edges.length;k++){
  const q=solve3(edges[i],edges[j],edges[k]);if(!q||q[2]<=best.r)continue;
  if(edges.every(e=>e[0]*q[0]+e[1]*q[1]-q[2]>=e[3]-1e-8))best={x:q[0],y:q[1],r:Math.max(0,q[2]-2e-8)};
 }return best;
}
function distanceToPolygon(p,poly){
 let inside=true,best=Infinity;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
  if(cross(a,b,p)<0)inside=false;
  const t=l2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2)):0;
  best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
 }return inside?0:best;
}
export function visibleDisk(polygons,occluders,requiredRadius=0){
 const usable=polys=>polys.map(p=>{
  if(!Array.isArray(p)||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)))throw Error('Nonfinite feature polygon');
  return ccw(p);
 }).filter(p=>p.length>=3&&Math.abs(area(p))>1e-10);
 const originals=usable(polygons),covers=usable(occluders);let pieces=originals;
 for(const c of covers){pieces=pieces.flatMap(p=>subtract(p,c));if(!pieces.length)break;}
 const certify=p=>{let radius=0;
  for(const original of originals){
    const margin=Math.min(...original.map((a,i)=>cross(a,original[(i+1)%original.length],p)/Math.hypot(original[(i+1)%original.length].x-a.x,original[(i+1)%original.length].y-a.y)));
    radius=Math.max(radius,margin);
  }
  for(const cover of covers)radius=Math.min(radius,distanceToPolygon(p,cover));
  return{x:p.x,y:p.y,r:Math.max(0,radius-2e-8)};
 };
 let best={x:0,y:0,r:0};for(const piece of pieces){const disk=certify(innerDisk(piece));if(disk.r>best.r)best=disk;}
 if(best.r<requiredRadius)for(const source of originals){
  const b=bounds(source);
  for(let x=b.x0;x<=b.x1&&best.r<requiredRadius;x+=.25)for(let y=b.y0;y<=b.y1&&best.r<requiredRadius;y+=.25){
    const disk=certify({x,y});if(disk.r>best.r)best=disk;
  }
  if(best.r>=requiredRadius)break;
 }
 return{...best,pieces:pieces.length};
}

export { subtract as subtractConvex, clip as clipConvexHalfPlane };
