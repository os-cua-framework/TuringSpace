import { noIntersect, grounded, minSeparation, SCENE_LIMITS } from './scene-validators.js';

export const SCENE_GENERATION_LIMIT = 8;
const audits = new WeakMap();
export const generationAudit = (manifest) => audits.get(manifest) ?? null;

class CoverageInput extends Error {
  constructor(path, message) { super(message); this.path = path; }
}
function coverageNeed(ok, path, message) { if (!ok) throw new CoverageInput(path, message); }
const finite = n => typeof n === 'number' && Number.isFinite(n);
const point2 = p => p && finite(p.x) && finite(p.y);
const point3 = p => point2(p) && finite(p.z);
const rect2 = r => point2(r) && finite(r.w) && r.w > 0 && finite(r.h) && r.h > 0;
const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function canvasPaths(paths) {
  const arity = { moveTo: 2, lineTo: 2, arcTo: 5, arc: 6, ellipse: 8, rect: 4, closePath: 0 };
  return Array.isArray(paths) && paths.length > 0 && paths.every(path =>
    Array.isArray(path.commands) && path.commands.length > 0 && path.commands.every(command =>
      Array.isArray(command) && Object.hasOwn(arity, command[0]) && command.length === arity[command[0]] + 1 &&
      command.slice(1, ['arc', 'ellipse'].includes(command[0]) ? -1 : undefined).every(finite) &&
      (!['arc', 'ellipse'].includes(command[0]) || typeof command.at(-1) === 'boolean')) &&
    (typeof path.fill === 'string' || typeof path.stroke === 'string') &&
    (path.stroke === undefined || finite(path.width) && path.width > 0));
}
function annotationData(d, projected = false) {
  if (d.kind === 'input_path') return d.sourceField === 'state.path' && Array.isArray(d.points) && d.points.every(point2) && typeof d.stroke === 'string' && finite(d.width) && d.width > 0;
  if (d.kind === 'canvas_paths') return canvasPaths(d.paths) && Array.isArray(d.transform) && d.transform.length === 6 && d.transform.every(finite);
  if (d.kind === 'gradient_rect') return rect2(d.rect) && Array.isArray(d.stops) && d.stops.length > 1 && d.stops.every(s => Array.isArray(s) && finite(s[0]) && typeof s[1] === 'string');
  if (d.kind === 'rect_text') return rect2(d.rect) && typeof d.text === 'string' && d.text.length > 0;
  if (d.kind === 'circle') return point2(d.centre) && finite(d.r) && d.r > 0;
  if (d.kind === 'prompt_text') return rect2(d.container) && typeof d.text === 'string' && d.text.length > 0;
  if (d.kind === 'selection_echo') return finite(d.r) && d.r > 0 && (projected ? point2(d.centre) && Array.isArray(d.checkPath) && d.checkPath.length === 3 && d.checkPath.every(point2)
    : point3(d.anchor) && typeof d.entityId === 'string' && Array.isArray(d.checkOffsets) && d.checkOffsets.length === 3 && d.checkOffsets.every(point2));
  if (d.kind === 'nudge_feedback') return (projected ? point2(d.centre) && finite(d.r) && d.r > 0 : typeof d.billboardId === 'string' && finite(d.radiusPaddingPx) && d.radiusPaddingPx > 0) && d.label && typeof d.label.text === 'string' && d.label.text.length > 0 && typeof d.label.font === 'string' &&
    ['height', 'padding', 'boardWidth', 'minX', 'maxRight', 'y'].every(k => finite(d.label[k])) && d.label.height > 0 && d.label.boardWidth > 0;
  return false;
}
function identified(list, path, allowEmpty = false) {
  coverageNeed(Array.isArray(list) && (allowEmpty || list.length > 0), path, 'Expected an explicitly declared nonempty list');
  const seen = new Set();
  for (const item of list) {
    coverageNeed(item && typeof item.id === 'string' && item.id.length > 0 && !seen.has(item.id), path, 'Missing or duplicate ID');
    seen.add(item.id);
  }
  return list;
}
function finiteData(value, path, stack = new Set()) {
  if (typeof value === 'number') coverageNeed(Number.isFinite(value), path, 'Nonfinite render data');
  if (!value || typeof value !== 'object') { coverageNeed(typeof value !== 'function', path, 'Render data must be serializable'); return; }
  coverageNeed(!stack.has(value), path, 'Cyclic render data'); stack.add(value);
  for (const [key, next] of Object.entries(value)) finiteData(next, `${path}.${key}`, stack);
  stack.delete(value);
}
const notApplicable = (reason, metrics) => ({ status: 'covered_not_applicable', ok: null, violations: [],
  metrics: { complete: true, ...metrics, reason } });
const applicable = result => ({ ...result, status: result.ok ? 'applicable_pass' : 'applicable_fail' });

function heldReference(geometry, body, claim, coverage, entriesById, views) {
  const need = (ok, suffix, message) => coverageNeed(ok, `contact.${body.id}.${suffix}`, message);
  const epsilon = SCENE_LIMITS.epsilon, rigidEpsilon = 1e-12;
  const dot = (a, b) => a.x*b.x+a.y*b.y+a.z*b.z;
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const close = (a,b,e=epsilon) => point3(a)&&point3(b)&&['x','y','z'].every(k=>Math.abs(a[k]-b[k])<=e);
  const proper = axes => Array.isArray(axes)&&axes.length===3&&axes.every((a,i)=>point3(a)&&Math.abs(Math.hypot(a.x,a.y,a.z)-1)<=rigidEpsilon&&axes.slice(0,i).every(b=>Math.abs(dot(a,b))<=rigidEpsilon))&&Math.abs(dot(cross(axes[0],axes[1]),axes[2])-1)<=rigidEpsilon;
  need(!('supportId' in body)&&!(geometry.supports||[]).some(s=>s.bodyId===body.id),'support','A held reference cannot also assert receiving/support contact');
  const declaration=entriesById.get(claim.declarationEntityId);
  need(declaration?.model==='screen_annotation'&&declaration.data.kind==='prompt_text'&&typeof claim.declarationText==='string'&&/\bheld\b/i.test(claim.declarationText)&&declaration.data.text===claim.declarationText&&views.every(v=>{const e=v.entries.find(e=>e.id===declaration.id);return e?.disposition==='paint'&&e.data.text===claim.declarationText;}),'declaration','Held interpretation must bind the same actual visible prompt in every required view');
  const pose=claim.pose,motion=claim.motion,closure=claim.kind==='held_configuration_reference';
  need(pose&&proper(pose.axes)&&point3(pose.translation),'pose','Expected a finite proper rigid pose');
  if(closure){
    need(claim.declarationText.includes('Held configuration editor')&&claim.declarationText.includes('Pose only; no motion-path test'),'declaration.configuration','Configuration editing must explicitly disclaim a motion-path test');
    need(motion?.kind==='fixed_local_closure'&&['editing','committed'].includes(motion.phase)&&motion.motionPathClaim==='none'&&Array.isArray(motion.openParts)&&motion.openParts.length>0&&motion.closurePart,'closure','Expected fixed local open parts and one closure part, with no motion-path claim');
    const all=[...motion.openParts,motion.closurePart];need(all.every(p=>p&&typeof p.id==='string'&&p.id&&p.primitive)&&new Set(all.map(p=>p.id)).size===all.length,'closure.parts','Missing or duplicated immutable part identities');
    const expected=motion.phase==='committed'?all:motion.openParts;
    need(Array.isArray(claim.localParts)&&claim.localParts.length===expected.length&&claim.localParts.every((p,i)=>p.id===expected[i].id&&p.ref?.partIndex===i&&sameData(p.primitive,expected[i].primitive)),'closure.phase','Actual local parts must be exactly open parts before commit and open parts plus the fixed closure after commit');
  }else{
  need(motion?.kind==='fixed_orientation_translation'&&point3(motion.axis)&&Math.abs(Math.hypot(motion.axis.x,motion.axis.y,motion.axis.z)-1)<=rigidEpsilon&&finite(motion.maximumDistance)&&motion.maximumDistance>0&&motion.stopRule==='first_closed_contact'&&motion.startPose&&proper(motion.startPose.axes)&&point3(motion.startPose.translation)&&finite(motion.parameter)&&motion.parameter>=0&&motion.parameter<=motion.maximumDistance&&['preview','stopped'].includes(motion.phase)&&(motion.phase!=='preview'||motion.parameter===0),'motion','Expected the finite declared fixed-orientation first-contact operation');
  need(pose.axes.every((a,i)=>close(a,motion.startPose.axes[i],rigidEpsilon))&&close(pose.translation,{x:motion.startPose.translation.x+motion.parameter*motion.axis.x,y:motion.startPose.translation.y+motion.parameter*motion.axis.y,z:motion.startPose.translation.z+motion.parameter*motion.axis.z}),'motion.pose','Current body pose differs from its declared motion pose');
  }
  const transform=(p,translate=true)=>({x:pose.axes.reduce((s,a,i)=>s+a.x*[p.x,p.y,p.z][i],0)+(translate?pose.translation.x:0),y:pose.axes.reduce((s,a,i)=>s+a.y*[p.x,p.y,p.z][i],0)+(translate?pose.translation.y:0),z:pose.axes.reduce((s,a,i)=>s+a.z*[p.x,p.y,p.z][i],0)+(translate?pose.translation.z:0)});
  need(Array.isArray(claim.localParts)&&claim.localParts.length===body.parts.length,'localParts','Every occupied part needs its actual immutable local primitive');
  const parts=new Set();
  for(const entry of claim.localParts){const ref=entry?.ref,p=entry?.primitive;need(ref?.collection==='bodies'&&ref.bodyId===body.id&&Number.isInteger(ref.partIndex)&&ref.partIndex>=0&&ref.partIndex<body.parts.length&&!parts.has(ref.partIndex),'localParts.ref','Missing, duplicate or borrowed local-part reference');parts.add(ref.partIndex);const actual=body.parts[ref.partIndex];let expected;
    if(p?.type==='sphere'&&point3(p.c)&&finite(p.r)&&p.r>0)expected={type:'sphere',c:transform(p.c),r:p.r};
    else if(p?.type==='capsule'&&point3(p.a)&&point3(p.b)&&finite(p.r)&&p.r>0)expected={type:'capsule',a:transform(p.a),b:transform(p.b),r:p.r};
    else if(p?.type==='box'&&finite(p.x)&&finite(p.y??0)&&finite(p.z)&&['w','h','d'].every(k=>finite(p[k])&&p[k]>0)&&finite(p.yawDeg??0)){const a=(p.yawDeg??0)*Math.PI/180;expected={type:'obb',c:transform({x:p.x,y:(p.y??0)+p.h/2,z:p.z}),w:p.w,h:p.h,d:p.d,axes:[{x:Math.cos(a),y:0,z:-Math.sin(a)},{x:0,y:1,z:0},{x:Math.sin(a),y:0,z:Math.cos(a)}].map(a=>transform(a,false))};}
    else if(p?.type==='obb'&&point3(p.c)&&proper(p.axes)&&['w','h','d'].every(k=>finite(p[k])&&p[k]>0))expected={type:'obb',c:transform(p.c),w:p.w,h:p.h,d:p.d,axes:p.axes.map(a=>transform(a,false))};
    else if(!closure&&p?.type==='cylinder'&&point3(p.base)&&point3(p.axis)&&finite(Math.hypot(p.axis.x,p.axis.y,p.axis.z))&&Math.hypot(p.axis.x,p.axis.y,p.axis.z)>0&&finite(p.r)&&p.r>0)expected={type:'cylinder',base:transform(p.base),axis:transform(p.axis,false),r:p.r};
    else if(!closure&&p?.type==='prism'&&Array.isArray(p.polygon)&&p.polygon.length>=3&&p.polygon.every(q=>q&&finite(q.x)&&finite(q.z))&&finite(p.y)&&finite(p.h)&&p.h>0&&close(pose.axes[1],{x:0,y:1,z:0},rigidEpsilon))expected={type:'prism',polygon:p.polygon.map(q=>{const v=transform({x:q.x,y:p.y,z:q.z});return{x:v.x,z:v.z};}),y:transform({x:0,y:p.y,z:0}).y,h:p.h};
    need(expected&&actual?.type===expected.type,'localParts.primitive','Unsupported or mismatched held primitive');
    if(expected.type==='sphere')need(actual.r===expected.r&&close(actual.c,expected.c),'localParts.transform','Sphere differs from actual rigid transform');
    else if(expected.type==='capsule')need(actual.r===expected.r&&close(actual.a,expected.a)&&close(actual.b,expected.b),'localParts.transform','Capsule differs from actual rigid transform');
    else if(expected.type==='cylinder')need(actual.r===expected.r&&close(actual.base,expected.base)&&close(actual.axis,expected.axis),'localParts.transform','Cylinder differs from actual rigid transform; radius/axis length cannot be repaired');
    else if(expected.type==='prism')need(actual.h===expected.h&&finite(actual.y)&&Math.abs(actual.y-expected.y)<=epsilon&&Array.isArray(actual.polygon)&&actual.polygon.length===expected.polygon.length&&actual.polygon.every((q,i)=>q&&finite(q.x)&&finite(q.z)&&Math.abs(q.x-expected.polygon[i].x)<=epsilon&&Math.abs(q.z-expected.polygon[i].z)<=epsilon),'localParts.transform','Upright prism differs from actual Y-preserving rigid transform; no tilt or polygon repair');
    else need(['w','h','d'].every(k=>actual[k]===expected[k])&&close(actual.c,expected.c)&&proper(actual.axes)&&actual.axes.every((a,i)=>close(a,expected.axes[i],rigidEpsilon)),'localParts.transform','OBB differs from actual rigid transform; size/shear cannot be repaired');
  }
  const ids=claim.controlIds;
  need(ids&&Array.isArray(ids.rotation)&&Array.isArray(ids.translation)&&ids.rotation.length+ids.translation.length>0&&typeof ids.commit==='string','controls','Expected actual relative pose and commit controls');
  const all=[...ids.rotation,...ids.translation,ids.commit];need(new Set(all).size===all.length,'controls','Duplicate control references');
  const definition=closure?{kind:motion.kind,openParts:motion.openParts,closurePart:motion.closurePart,motionPathClaim:'none'}:{kind:motion.kind,axis:motion.axis,maximumDistance:motion.maximumDistance,stopRule:motion.stopRule};
  if(closure)need(ids.rotation.length>0&&ids.translation.length>0,'controls.configuration','Configuration editor requires both real rotation and translation controls');
  const controlBound=(data,kind)=>{
    if(!data)return false;
    if(!('bodyIds'in data))return data.bodyId===body.id;
    const names=data.bodyIds;
    if(closure||kind!=='commit_motion'||'bodyId'in data||!Array.isArray(names)||names.length<2||new Set(names).size!==names.length||!names.includes(body.id))return false;
    return names.every(name=>typeof name==='string'&&geometry.bodies.some(b=>b.id===name)&&coverage.contactClaims.some(c=>c.id===name&&c.kind==='held_kinematic_reference'&&c.motion&&sameData({kind:c.motion.kind,axis:c.motion.axis,maximumDistance:c.motion.maximumDistance,stopRule:c.motion.stopRule},definition)));
  };
  for(const [kind,list]of [['relative_rotation',ids.rotation],['relative_translation',ids.translation],[closure?'commit_closure':'commit_motion',[ids.commit]]])for(const id of list){const item=entriesById.get(id),control=coverage.controls.find(c=>c.id===id);need(item?.model==='screen_control'&&controlBound(item.data,kind)&&item.data.actionKind===kind&&controlBound(control,kind)&&control.actionKind===kind&&sameData(item.data.bodyIds,control.bodyIds),'controls.binding','Pose control must bind this actual held body and operation');if(kind==='commit_motion'||kind==='commit_closure')need(sameData(item.data.motionDefinition,definition)&&sameData(control.motionDefinition,definition),'controls.motion','Commit control differs from the declared motion');}
  const actualIds=[...entriesById.values()].filter(i=>i.model==='screen_control'&&(i.data.bodyId===body.id||(!closure&&i.data.actionKind==='commit_motion'&&i.data.bodyIds?.includes(body.id)))&&['relative_rotation','relative_translation','commit_motion','commit_closure'].includes(i.data.actionKind)).map(i=>i.id);
  need(actualIds.length===all.length&&actualIds.every(id=>all.includes(id)),'controls.complete','Omitted held-body input control');
  if(closure&&motion.phase==='committed')need(all.every(id=>entriesById.get(id).data.enabled===false&&coverage.controls.find(c=>c.id===id).enabled===false),'controls.committed','Committed configuration is frozen');
  return {body:body.id,status:'covered_not_applicable',reason:'Explicit operator-held rigid reference; no passive support contact claim',declarationEntityId:declaration.id,partCount:body.parts.length,controlIds:all,motionKind:motion.kind,phase:motion.phase,scope:closure?'Current rigid open/closed pose only. All occupied-body collisions remain checked separately; no swept-path claim':'Current rigid pose/control/visible declaration binding; exact event time and outcome remain separate required validation checks'};
}

function heldFixedPoseReference(geometry,body,claim,coverage,entriesById,views){
  const need=(ok,suffix,message)=>coverageNeed(ok,`contact.${body.id}.${suffix}`,message);
  const eps=SCENE_LIMITS.epsilon,rigidEps=1e-12;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const close=(a,b,e=eps)=>point3(a)&&point3(b)&&['x','y','z'].every(k=>Math.abs(a[k]-b[k])<=e);
  const proper=axes=>Array.isArray(axes)&&axes.length===3&&axes.every((a,i)=>point3(a)&&Math.abs(Math.hypot(a.x,a.y,a.z)-1)<=rigidEps&&axes.slice(0,i).every(b=>Math.abs(dot(a,b))<=rigidEps))&&Math.abs(dot(cross(axes[0],axes[1]),axes[2])-1)<=rigidEps;
  const pose=claim.pose,query=claim.query,declaration=entriesById.get(claim.declarationEntityId);
  need(!('supportId'in body)&&!(geometry.supports||[]).some(s=>s.bodyId===body.id),'support','A held query cannot also assert passive support');
  need(declaration?.model==='screen_annotation'&&declaration.data.kind==='prompt_text'&&typeof claim.declarationText==='string'&&/\bheld\b/i.test(claim.declarationText)&&declaration.data.text===claim.declarationText&&views.every(v=>{const e=v.entries.find(e=>e.id===declaration.id);return e?.disposition==='paint'&&e.data.text===claim.declarationText;}),'declaration','The same actual held declaration must be visible in every required view');
  need(pose&&proper(pose.axes)&&point3(pose.translation),'pose','Expected a finite proper rigid pose');
  need(query?.kind==='fixed_pose_query'&&['editing','committed'].includes(query.phase)&&point3(query.fixedCentre)&&close(pose.translation,query.fixedCentre)&&query.motionPathClaim==='none'&&!('motion'in claim),'query','Expected a fixed-centre pose query, not a motion or closure operation');
  if(query.phase==='editing')need(!('committedPose'in query),'query.editing','An editable query cannot claim a committed pose');
  else need(query.committedPose&&proper(query.committedPose.axes)&&close(query.committedPose.translation,pose.translation)&&query.committedPose.axes.every((a,i)=>close(a,pose.axes[i],rigidEps)),'query.committed','Displayed pose differs from the frozen query pose');
  const transform=(p,translate=true)=>({x:pose.axes.reduce((s,a,i)=>s+a.x*[p.x,p.y,p.z][i],0)+(translate?pose.translation.x:0),y:pose.axes.reduce((s,a,i)=>s+a.y*[p.x,p.y,p.z][i],0)+(translate?pose.translation.y:0),z:pose.axes.reduce((s,a,i)=>s+a.z*[p.x,p.y,p.z][i],0)+(translate?pose.translation.z:0)});
  need(Array.isArray(claim.localParts)&&claim.localParts.length===body.parts.length,'localParts','Every occupied part needs a real local primitive');
  const seen=new Set();
  for(const e of claim.localParts){
    const ref=e?.ref,p=e?.primitive;
    need(ref?.collection==='bodies'&&ref.bodyId===body.id&&Number.isInteger(ref.partIndex)&&ref.partIndex>=0&&ref.partIndex<body.parts.length&&!seen.has(ref.partIndex),'localParts.ref','Missing, duplicate or borrowed part reference');seen.add(ref.partIndex);
    need(p?.type==='obb'&&point3(p.c)&&proper(p.axes)&&['w','h','d'].every(k=>finite(p[k])&&p[k]>0),'localParts.primitive','This fixed-pose domain requires complete proper local OBBs');
    const actual=body.parts[ref.partIndex],axes=p.axes.map(a=>transform(a,false));
    need(actual?.type==='obb'&&['w','h','d'].every(k=>actual[k]===p[k])&&close(actual.c,transform(p.c))&&proper(actual.axes)&&actual.axes.every((a,i)=>close(a,axes[i],rigidEps)),'localParts.transform','World OBB differs from its declared rigid transform');
  }
  const ids=claim.controlIds;
  need(ids&&Array.isArray(ids.rotation)&&ids.rotation.length>0&&typeof ids.commit==='string'&&!('translation'in ids),'controls','Expected real rotation and fixed-query commit controls only');
  const all=[...ids.rotation,ids.commit];need(new Set(all).size===all.length,'controls','Repeated control reference');
  const definition={kind:'fixed_pose_query',fixedCentre:query.fixedCentre,motionPathClaim:'none'};
  for(const [kind,list]of[['relative_rotation',ids.rotation],['commit_fixed_pose_query',[ids.commit]]])for(const id of list){
    const item=entriesById.get(id),control=coverage.controls.find(c=>c.id===id),enabled=query.phase==='editing';
    need(item?.model==='screen_control'&&item.data.bodyId===body.id&&item.data.actionKind===kind&&control?.bodyId===body.id&&control.actionKind===kind&&item.data.enabled===enabled&&control.enabled===enabled,'controls.binding','Actual body controls must match the operation and editing/frozen phase');
    if(kind==='commit_fixed_pose_query')need(sameData(item.data.queryDefinition,definition)&&sameData(control.queryDefinition,definition),'controls.query','Commit control does not bind this exact fixed-pose query');
  }
  const actualIds=[...entriesById.values()].filter(i=>i.model==='screen_control'&&i.data.bodyId===body.id).map(i=>i.id);
  need(actualIds.length===all.length&&actualIds.every(id=>all.includes(id)),'controls.complete','Omitted or unsupported held-body control');
  return{body:body.id,status:'covered_not_applicable',reason:'Explicit operator-held fixed-pose query; no passive support claim',declarationEntityId:declaration.id,partCount:body.parts.length,controlIds:all,queryKind:query.kind,phase:query.phase,scope:'Every current occupied solid and its exact rigid pose remain bound; all collisions and query correctness are separate required checks. No translation, closure or postcommit motion is certified.'};
}

export function validateRenderedScene(geometry, coverage) {
  try {
    coverageNeed(coverage?.version === 1, 'rendererCoverage.version', 'Unknown coverage schema');
    finiteData(coverage, 'rendererCoverage');
    coverageNeed(geometry && Array.isArray(geometry.bodies), 'geometry.bodies', 'Declare the actual body list, including an explicit empty list for non-solid scenes');
    const groups = [...geometry.bodies.map(body => ({ collection: 'bodies', body })),
      ...(geometry.supportGeometry === undefined ? [] : identified(geometry.supportGeometry, 'geometry.supportGeometry').map(body => ({ collection: 'supportGeometry', body })))];
    identified(geometry.bodies, 'geometry.bodies', true);
    const physicalParts = new Map();
    for (const { collection, body } of groups) {
      coverageNeed(body && typeof body.id === 'string' && Array.isArray(body.parts) && body.parts.length > 0, collection, 'Invalid physical group');
      body.parts.forEach((primitive, partIndex) => physicalParts.set(`${collection}/${body.id}/${partIndex}`, primitive));
    }
    const inventory = identified(coverage.inventory, 'rendererCoverage.inventory'), entriesById = new Map(inventory.map(i => [i.id, i]));
    coverageNeed(coverage.sourceCounts && typeof coverage.sourceCounts === 'object' && !Array.isArray(coverage.sourceCounts), 'rendererCoverage.sourceCounts', 'Missing cardinalities from the actual drawing source collections');
    const models = new Set(['solid', 'projected_segment', 'billboard', 'projected_ellipse', 'screen_control', 'screen_annotation', 'projected_polygon', 'anchored_sprite']);
    const bound = new Set(), counts = {};
    for (const item of inventory) {
      coverageNeed(models.has(item.model), `inventory.${item.id}.model`, 'Unknown renderer model');
      coverageNeed(item.source && typeof item.source.layer === 'string' && item.source.layer.length > 0, `inventory.${item.id}.source`, 'Missing source layer binding');
      coverageNeed(item.data && typeof item.data === 'object', `inventory.${item.id}.data`, 'Missing actual drawing data');
      counts[item.model] = (counts[item.model] || 0) + 1;
      if (item.model === 'solid') {
        const ref = item.ref, key = `${ref?.collection}/${ref?.bodyId}/${ref?.partIndex}`;
        coverageNeed(ref && Number.isInteger(ref.partIndex) && physicalParts.has(key) && !bound.has(key), `inventory.${item.id}.ref`, 'Missing, duplicate or unknown solid-part binding');
        coverageNeed(sameData(item.data.primitive, physicalParts.get(key)), `inventory.${item.id}.primitive`, 'Drawn solid differs from validated physical primitive'); bound.add(key);
      } else if (item.model === 'projected_polygon') coverageNeed(Array.isArray(item.data.points) && item.data.points.length >= 3 && item.data.points.every(point3), `inventory.${item.id}`, 'Projected polygon requires complete original world vertices');
      else if (item.model === 'anchored_sprite') coverageNeed(point3(item.data.anchor) && finite(item.data.roll) && canvasPaths(item.data.paths) && (item.data.opacity === undefined || finite(item.data.opacity) && item.data.opacity >= 0 && item.data.opacity <= 1), `inventory.${item.id}`, 'Sprite requires its actual world anchor, roll and complete local paint paths');
      else if (item.model === 'projected_segment') coverageNeed(point3(item.data.a) && point3(item.data.b), `inventory.${item.id}`, 'Projected segment requires its actual world endpoints');
      else if (item.model === 'billboard' || item.model === 'projected_ellipse') coverageNeed(point3(item.data.anchor), `inventory.${item.id}.anchor`, 'Missing original world anchor');
      else if (item.model === 'screen_control') coverageNeed(rect2(item.data.rect) && typeof item.data.enabled === 'boolean', `inventory.${item.id}.rect`, 'Missing actual control rectangle/state');
      else if (item.model === 'screen_annotation') coverageNeed(annotationData(item.data), `inventory.${item.id}`, 'Missing actual annotation geometry or layout data');
      if (item.data.kind === 'selection_echo') coverageNeed(entriesById.get(item.data.entityId)?.model === 'solid', `inventory.${item.id}.entityId`, 'Selection echo must bind its real solid');
      if (item.data.kind === 'nudge_feedback') coverageNeed(entriesById.get(item.data.billboardId)?.model === 'billboard', `inventory.${item.id}.billboardId`, 'Nudge must bind its actual billboard');
    }
    coverageNeed(bound.size === physicalParts.size, 'rendererCoverage.inventory', 'Unbound physical body/support part; it cannot be reclassified as a non-solid');
    const layers = new Set(inventory.map(item => item.source.layer));
    for (const [layer, count] of Object.entries(coverage.sourceCounts)) {
      coverageNeed(Number.isInteger(count) && count >= 0 && inventory.filter(item => item.source.layer === layer).length === count, `sourceCounts.${layer}`, 'Drawing source count and bound inventory disagree');
      layers.delete(layer);
    }
    coverageNeed(layers.size === 0, 'rendererCoverage.sourceCounts', 'Uncounted drawing source layer');
    const required = coverage.requiredViewIds;
    coverageNeed(Array.isArray(required) && required.length > 0 && required.every(id => typeof id === 'string' && id.length > 0) && new Set(required).size === required.length, 'rendererCoverage.requiredViewIds', 'Missing or duplicate required views');
    const views = identified(coverage.views, 'rendererCoverage.views');
    coverageNeed(views.length === required.length && views.every(v => required.includes(v.id)), 'rendererCoverage.views', 'Incomplete or extra observation views');
    let culled = 0, conditional = 0;
    const nearPlaneCertificates = [];
    for (const view of views) {
      const entries = identified(view.entries, `view.${view.id}.entries`);
      coverageNeed(entries.length === inventory.length, `view.${view.id}.entries`, 'Missing inventory entry, including hidden items');
      const drawn = view.drawItemIds, expectedDrawn = entries.filter(e => e.disposition !== 'geometry_culled').map(e => e.id);
      coverageNeed(Array.isArray(drawn) && new Set(drawn).size === drawn.length && drawn.length === expectedDrawn.length && expectedDrawn.every(id => drawn.includes(id)),
        `view.${view.id}.drawItemIds`, 'Drawing collections and inventory disagree; unbound remaining draw items cannot be ignored');
      for (const entry of entries) {
        const item = entriesById.get(entry.id), d = entry.data;
        coverageNeed(item && item.model === entry.model && d && typeof d === 'object', `view.${view.id}.${entry.id}`, 'Unknown, mismatched or unbound drawing entry');
        coverageNeed(['paint', 'geometry_culled', 'state_conditional'].includes(entry.disposition), `view.${view.id}.${entry.id}.disposition`, 'Unknown disposition');
        if (entry.disposition === 'geometry_culled') {
          const c = entry.culling;
          if (item.model === 'projected_segment' && c?.kind === 'near_plane') {
            coverageNeed(point3(c.eye) && point3(c.forward) && Math.abs(Math.hypot(c.forward.x, c.forward.y, c.forward.z) - 1) <= SCENE_LIMITS.epsilon && finite(c.near) && c.near > 0,
              `view.${view.id}.${entry.id}.culling`, 'Near clipping requires the actual finite eye, unit forward and positive near depth');
            coverageNeed(!('depthA' in c) && !('depthB' in c) && !('depths' in c), `view.${view.id}.${entry.id}.culling`, 'Near depths are recomputed from original endpoints, never supplied by the caller');
            const depth = p => (p.x - c.eye.x) * c.forward.x + (p.y - c.eye.y) * c.forward.y + (p.z - c.eye.z) * c.forward.z;
            const depthA = depth(item.data.a), depthB = depth(item.data.b);
            coverageNeed(depthA < c.near && depthB < c.near && d.clipped === null && !('pa' in d) && !('pb' in d),
              `view.${view.id}.${entry.id}.culling`, 'Only an entire segment strictly behind near may have clipped:null and no projected endpoints');
            nearPlaneCertificates.push({ view: view.id, id: entry.id, depthA, depthB, near: c.near });
          } else coverageNeed(item.model === 'billboard' && c?.kind === 'full_polygon_cover' && c.helper === 'gemFullyCovered' && c.covered === true &&
            Array.isArray(c.expandedPath) && c.expandedPath.length >= 3 && c.expandedPath.every(point2) &&
            Array.isArray(c.occluders) && c.occluders.length > 0 && c.occluders.every(id => entriesById.get(id)?.model === 'solid'),
          `view.${view.id}.${entry.id}.culling`, 'A hidden billboard requires its actual complete path and uniform geometric certificate'); culled++;
        } else if (entry.culling) coverageNeed(entry.culling.covered === false, `view.${view.id}.${entry.id}.culling`, 'Paint/cull disposition disagrees with its certificate');
        if (entry.disposition === 'state_conditional') {
          coverageNeed(['screen_annotation', 'projected_ellipse'].includes(item.model) && typeof entry.condition === 'string' && entry.condition.length > 0,
            `view.${view.id}.${entry.id}.condition`, 'Conditional UI must be explicitly bound; solid geometry cannot be skipped'); conditional++;
        }
        if (item.model === 'solid') coverageNeed(sameData(d.primitive, item.data.primitive) && Array.isArray(d.vertices) && d.vertices.length > 0 && d.vertices.every(point2), `view.${view.id}.${entry.id}`, 'Missing real solid projection');
        else if (item.model === 'projected_polygon') coverageNeed(Array.isArray(d.path) && d.path.length === item.data.points.length && d.path.every(point2) && d.closed === true, `view.${view.id}.${entry.id}`, 'Missing complete projected polygon path');
        else if (item.model === 'anchored_sprite') coverageNeed(point2(d.centre) && d.roll === item.data.roll && d.opacity === item.data.opacity && sameData(d.paths, item.data.paths), `view.${view.id}.${entry.id}`, 'Sprite differs from its actual local drawing inputs');
        else if (item.model === 'projected_segment') coverageNeed(finite(d.widthPx) && d.widthPx > 0 && (entry.disposition === 'geometry_culled' && entry.culling?.kind === 'near_plane'
          ? d.clipped === null : point2(d.pa) && point2(d.pb) && d.clipped !== null), `view.${view.id}.${entry.id}`, 'Missing actual projected segment/line width');
        else if (item.model === 'billboard') coverageNeed(point2(d.centre) && Array.isArray(d.path) && d.path.length >= 3 && d.path.every(point2), `view.${view.id}.${entry.id}`, 'Missing complete billboard path');
        else if (item.model === 'projected_ellipse') coverageNeed(point2(d.centre) && finite(d.rx) && d.rx > 0 && finite(d.ry) && d.ry > 0, `view.${view.id}.${entry.id}`, 'Missing actual locator ellipse');
        else if (item.model === 'screen_control') coverageNeed(sameData(d.rect, item.data.rect) && d.enabled === item.data.enabled, `view.${view.id}.${entry.id}`, 'Control geometry/state differs from its drawing binding');
        else coverageNeed(annotationData(d, true), `view.${view.id}.${entry.id}`, 'Unknown or incomplete annotation drawing model');
      }
    }
    if (coverage.declaration?.visible) {
      const item = entriesById.get(coverage.declaration.entityId);
      coverageNeed(typeof coverage.declaration.text === 'string' && coverage.declaration.text.length > 0 && item?.model === 'screen_annotation' && item.data.text === coverage.declaration.text &&
        views.every(v => v.entries.find(e => e.id === item.id)?.data.text === coverage.declaration.text), 'rendererCoverage.declaration', 'Claimed visible declaration must bind the same actual prompt text');
    }
    const domains = coverage.interactionDomains;
    coverageNeed(Array.isArray(domains) && domains.length > 0 && new Set(domains).size === domains.length && domains.every(d => ['world-targets', 'screen-controls'].includes(d)), 'rendererCoverage.interactionDomains', 'Declare actual interaction domains');
    const controls = identified(coverage.controls, 'rendererCoverage.controls', !domains.includes('screen-controls'));
    coverageNeed(controls.length === (counts.screen_control || 0), 'rendererCoverage.controls', 'Missing control binding');
    const active = [];
    for (const control of controls) {
      const item = entriesById.get(control.id), space = coverage.spaces?.[control.space], r = control.rect;
      coverageNeed(item?.model === 'screen_control' && sameData(r, item.data.rect) && control.enabled === item.data.enabled && rect2(r) &&
        space && finite(space.x) && finite(space.y) && finite(space.w) && space.w > 0 && finite(space.h) && space.h > 0,
      `control.${control.id}`, 'Missing actual control/coordinate-space binding');
      coverageNeed(r.x >= 0 && r.y >= 0 && r.x + r.w <= space.w && r.y + r.h <= space.h, `control.${control.id}`, 'Control extends beyond its actual input space');
      if (control.enabled) active.push({ id: control.id, x: space.x + r.x + r.w / 2, y: space.y + r.y + r.h / 2 });
    }
    const screenPairs = [], screenViolations = [];
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const pair = { controls: [active[i].id, active[j].id], distancePx: Math.hypot(active[i].x - active[j].x, active[i].y - active[j].y) }; screenPairs.push(pair);
      if (pair.distancePx + SCENE_LIMITS.epsilon < SCENE_LIMITS.screenSeparationPx) screenViolations.push({ code: 'screen_controls_too_close', thresholdPx: SCENE_LIMITS.screenSeparationPx, ...pair });
    }
    coverageNeed(Array.isArray(geometry.targets), 'geometry.targets', 'Declare the actual world-target list, even when there are none');
    coverageNeed(domains.includes('world-targets') === (geometry.targets.length > 0), 'geometry.targets', 'World-target domain and inventory disagree');
    const targetBindings = identified(coverage.worldTargetBindings || [], 'rendererCoverage.worldTargetBindings', !geometry.targets.length);
    coverageNeed(targetBindings.length === geometry.targets.length, 'rendererCoverage.worldTargetBindings', 'Missing world-anchor binding');
    for (const binding of targetBindings) {
      const target = geometry.targets.find(t => t.id === binding.id), item = entriesById.get(binding.entityId);
      let anchor;
      if (item?.model === 'solid' && item.data.primitive?.type === 'box' && binding.anchor === 'solid-centre') {
        const p = item.data.primitive; anchor = { x: p.x, y: (p.y || 0) + p.h / 2, z: p.z };
      } else if (['billboard', 'projected_ellipse', 'anchored_sprite'].includes(item?.model) && binding.anchor === 'world-anchor') anchor = item.data.anchor;
      else if (item?.model === 'projected_segment' && ['a', 'b'].includes(binding.anchor)) anchor = item.data[binding.anchor];
      coverageNeed(target && anchor && sameData(target.world, anchor), `worldTarget.${binding.id}`, 'Target must use an actual bound world point; screen controls have no world anchor');
    }
    if (geometry.targets.length) {
      const observations = identified(geometry.observations, 'geometry.observations');
      coverageNeed(observations.every(o => required.includes(o.id)), 'geometry.observations', 'Unbound world-target observation');
      const board = coverage.spaces?.board;
      coverageNeed(board && finite(board.w) && finite(board.h), 'rendererCoverage.spaces.board', 'Missing actual world viewport');
      for (const view of views) {
        const witnesses = identified(view.worldTargetWitnesses, `view.${view.id}.worldTargetWitnesses`);
        coverageNeed(witnesses.length === geometry.targets.length, `view.${view.id}.worldTargetWitnesses`, 'Omitted world centre, including occluded/unusable centres');
        const usable = [];
        for (const witness of witnesses) {
          const binding = targetBindings.find(b => b.id === witness.id), entry = binding && view.entries.find(e => e.id === binding.entityId);
          const projected = binding?.anchor === 'a' ? entry?.data.pa : binding?.anchor === 'b' ? entry?.data.pb : entry?.data.centre;
          coverageNeed(projected && point2(witness.centre) && witness.centre.x === projected.x && witness.centre.y === projected.y && typeof witness.reason === 'string',
            `view.${view.id}.centre.${witness.id}`, 'Centre must match the actual projected item and retain omission reasons');
          const inside = projected.x >= 0 && projected.x <= board.w && projected.y >= 0 && projected.y <= board.h;
          const eligible = inside && witness.inputOwner === binding.entityId && witness.paintOwner === binding.entityId;
          coverageNeed(witness.boardClip === inside && witness.usable === eligible, `view.${view.id}.centre.${witness.id}`, 'Usable-centre claim disagrees with its input/paint owner or board clip');
          if (eligible) usable.push(witness);
        }
        const observation = observations.find(o => o.id === view.id);
        coverageNeed(usable.length ? observation && Array.isArray(observation.targets) && observation.targets.length === usable.length : !observation,
          `observation.${view.id}`, 'Observation must contain all and only certified usable centres');
        for (const witness of usable) {
          const t = observation.targets.find(t => t.id === witness.id);
          coverageNeed(t?.screen?.type === 'projection' && t.screen.x === witness.centre.x && t.screen.y === witness.centre.y, `observation.${view.id}.${witness.id}`, 'Observation invents or relocates its world centre');
        }
      }
    }
    const world = geometry.targets.length ? minSeparation(geometry) : null;
    const worldDomain = world && (!world.ok || world.metrics.worldPairs.length || world.metrics.screenPairs.length) ? applicable(world)
      : notApplicable(world ? 'A complete single world target has no world/projection pairs' : 'No world targets; UI controls have no fabricated world coordinates',
        { ...(world?.metrics || {}), targets: geometry.targets.length, worldPairCount: 0, screenPairCount: 0 });
    const uiDomain = screenPairs.length ? applicable({ ok: screenViolations.length === 0, violations: screenViolations, metrics: { controls: controls.length, activeControls: active.length, thresholdPx: SCENE_LIMITS.screenSeparationPx, pairs: screenPairs } })
      : notApplicable('Fewer than two enabled screen controls; complete declared control data retained', { controls: controls.length, activeControls: active.length, screenPairCount: 0 });
    const violations = [...(world?.violations || []), ...screenViolations], hasPairs = (world?.metrics.worldPairs?.length || 0) + (world?.metrics.screenPairs?.length || 0) + screenPairs.length;
    const separation = { status: violations.length ? 'applicable_fail' : hasPairs ? 'applicable_pass' : 'covered_not_applicable', ok: violations.length ? false : hasPairs ? true : null,
      violations, metrics: { complete: true, worldTargets: worldDomain, screenControls: uiDomain } };
    let groundCheck = physicalParts.size ? applicable(grounded(geometry)) : notApplicable('Complete projected-reference inventory makes no body/support contact claim', { applicableBodies: 0, physicalParts: 0 });
    let contactApplicability;
    if (coverage.contactClaims !== undefined) {
      const claims = identified(coverage.contactClaims, 'rendererCoverage.contactClaims', geometry.bodies.length === 0);
      coverageNeed(claims.length === geometry.bodies.length && claims.every(c => geometry.bodies.some(b => b.id === c.id)), 'rendererCoverage.contactClaims', 'Every physical body requires one explicit contact claim');
      const standing = [], exploded = [], held = [];
      for (const claim of claims) {
        const body = geometry.bodies.find(b => b.id === claim.id);
        if (claim.kind === 'supported') {
          coverageNeed(typeof body.supportId === 'string' && claim.supportId === body.supportId, `contact.${claim.id}`, 'Supported claim must bind the original real support'); standing.push(body);
        } else if (['held_kinematic_reference', 'held_configuration_reference'].includes(claim.kind)) {
          held.push(heldReference(geometry, body, claim, coverage, entriesById, views));
        } else if (claim.kind === 'held_fixed_pose_reference') {
          held.push(heldFixedPoseReference(geometry,body,claim,coverage,entriesById,views));
        } else {
          const declaration = entriesById.get(claim.declarationEntityId);
          coverageNeed(claim.kind === 'technical_exploded_view' && !('supportId' in body) &&
            declaration?.model === 'screen_annotation' && declaration.data.kind === 'prompt_text' &&
            claim.declarationText === declaration.data.text && claim.declarationText.includes('Exploded alignment view') &&
            views.every(v => { const e = v.entries.find(e => e.id === declaration.id); return e?.disposition === 'paint' && e.data.text === claim.declarationText; }),
          `contact.${claim.id}`, 'Only an explicitly visible technical exploded alignment view may disclaim support contact');
          exploded.push({ body: body.id, status: 'covered_not_applicable', reason: 'Technical exploded alignment view; no receiving-surface contact is asserted', declarationEntityId: declaration.id, declarationText: claim.declarationText });
        }
      }
      contactApplicability = { standingBodyCount: standing.length, explodedReferenceBodyCount: exploded.length, ...(held.length ? { heldReferenceBodyCount: held.length } : {}), bodies: [...standing.map(b => ({ body: b.id, status: 'applicable', supportId: b.supportId })), ...exploded, ...held], collisionBodyCount: geometry.bodies.length };
      groundCheck = standing.length ? applicable(grounded({ ...geometry, bodies: standing })) : notApplicable(held.length ? 'All occupied parts are explicitly declared held/exploded references; no passive support claim' : 'All occupied parts belong to explicitly declared technical exploded references; no support contact claim', { applicableBodies: 0 });
      groundCheck.metrics = { ...groundCheck.metrics, contactApplicability };
    }
    return { rendererCoverage: { ok: true, status: 'complete', violations: [], metrics: { inventoryCount: inventory.length, viewCount: views.length,
      boundViewEntries: inventory.length * views.length, modelCounts: counts, physicalParts: physicalParts.size, geometryCulledEntries: culled, conditionalEntries: conditional,
      ...(nearPlaneCertificates.length ? { nearPlaneCulledEntries: nearPlaneCertificates.length, nearPlaneCertificates } : {}) } },
    noIntersect: physicalParts.size ? applicable(noIntersect(geometry)) : notApplicable('Complete renderer inventory defines no occupied world volume', { applicableBodies: 0, physicalParts: 0 }),
    grounded: groundCheck,
    minSeparation: separation };
  } catch (error) {
    if (!(error instanceof CoverageInput)) throw error;
    const failed = { ok: false, status: 'uncovered', violations: [{ code: 'renderer_coverage_incomplete', path: error.path, message: error.message }], metrics: { complete: false } };
    return { rendererCoverage: failed, noIntersect: failed, grounded: failed, minSeparation: failed };
  }
}

const coveredCheckAccepted = check => check.ok === true || (check.ok === null && check.status === 'covered_not_applicable');

function validationChecks(checks) {
  identified(checks, 'validationChecks');
  return checks.map(check => {
    coverageNeed(typeof check.ok === 'boolean' && Array.isArray(check.violations) && check.metrics && typeof check.metrics === 'object' && !Array.isArray(check.metrics),
      `validationChecks.${check.id}`, 'Expected strict boolean ok, violations array and metrics object');
    const json = JSON.stringify(check, (_key, value) => {
      coverageNeed(!['undefined', 'function', 'symbol', 'bigint'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value)),
        `validationChecks.${check.id}`, 'Checks must contain finite serializable evidence');
      return value;
    });
    return JSON.parse(json);
  });
}

export function validatedGenerator(originalGenerate, buildScenes) {
  return function generate(...args) {
    const audit = { candidateCalls: 0, candidateManifests: 0, sceneRejections: 0,
      failed: false, limit: SCENE_GENERATION_LIMIT, attempts: [] };
    for (let candidate = 1; candidate <= SCENE_GENERATION_LIMIT; candidate++) {
      audit.candidateCalls++;
      let manifest, scenes;
      try { manifest = originalGenerate.apply(this, args); audit.candidateManifests++; }
      catch (error) {
        audit.failed = true; audit.failure = { stage: 'originalGenerate', message: String(error) };
        error.sceneGeneration = audit; throw error;
      }
      try {
        scenes = buildScenes(manifest);
        if (!Array.isArray(scenes) || !scenes.length) throw new Error('No generated scenes to validate');
        scenes = scenes.map(scene => scene != null && Object.prototype.hasOwnProperty.call(scene, 'validationChecks')
          ? { ...scene, validationChecks: validationChecks(scene.validationChecks) } : scene);
      } catch (error) {
        audit.failed = true; audit.failure = { stage: 'sceneConstruction', message: String(error), manifest };
        error.sceneGeneration = audit; throw error;
      }
      const checks = scenes.map(({ id, geometry, rendererCoverage, validationChecks }) => ({ ...(rendererCoverage === undefined ? ({ id,
        noIntersect: noIntersect(geometry), grounded: grounded(geometry), minSeparation: minSeparation(geometry) })
        : ({ id, ...validateRenderedScene(geometry, rendererCoverage) })), ...(validationChecks === undefined ? {} : { validationChecks }) }));
      const accepted = checks.every(c => (c.rendererCoverage ? c.rendererCoverage.ok && coveredCheckAccepted(c.noIntersect) && coveredCheckAccepted(c.grounded) && coveredCheckAccepted(c.minSeparation)
        : c.noIntersect.ok && c.grounded.ok && c.minSeparation.ok) && (c.validationChecks === undefined || c.validationChecks.every(check => check.ok)));
      audit.attempts.push({ candidate, accepted, checks, ...(!accepted ? { rejectedManifest: manifest } : {}) });
      if (accepted) { audits.set(manifest, audit); return manifest; }
      audit.sceneRejections++;
    }
    audit.failed = true; audit.failure = { stage: 'sceneValidationLimit' };
    const violations = audit.attempts.at(-1).checks.map((c) => ({ id: c.id,
      noIntersect: c.noIntersect.violations, grounded: c.grounded.violations, minSeparation: c.minSeparation.violations,
      ...(c.rendererCoverage ? { rendererCoverage: c.rendererCoverage.violations } : {}),
      ...(c.validationChecks === undefined ? {} : { validationChecks: c.validationChecks.filter(check => !check.ok) }) }));
    const error = new Error(`Generated scene validation exhausted ${SCENE_GENERATION_LIMIT} candidates: ${JSON.stringify(violations)}`);
    error.sceneGeneration = audit; throw error;
  };
}

export function sceneOwnership(scene) {
  const bodies = [];
  return {
    own(id, supportId, construct) {
      const start = scene.queue.length, result = construct();
      const end = scene.queue.length;
      if (end <= start) throw new Error(`Empty scene body: ${id}`);
      bodies.push({ id, supportId, queueRange: [start, end],
        queueIndices: Array.from({ length: end - start }, (_, i) => start + i),
        parts: scene.queue.slice(start, end) });
      return result;
    },
    finish(descriptor) {
      let next = 0;
      for (const b of bodies) {
        if (b.queueRange[0] !== next) throw new Error('Unowned or multiply owned scene parts');
        next = b.queueRange[1];
      }
      if (next !== scene.queue.length) throw new Error('Unowned scene queue tail');
      return { ...descriptor, bodies };
    },
  };
}

export function projectedTargets(anchors, camera, radius, board, frontPriorityGap = 0) {
  const points = anchors.map((t) => ({ ...t, projected: camera.project(t.world) }));
  const observations = points.map((t) => {
    const p = t.projected;
    let bound = Math.min(radius, p.x, p.y, board.w - p.x, board.h - p.y);
    for (const other of points) {
      if (other.id === t.id) continue;
      const q = other.projected, distance = Math.hypot(p.x - q.x, p.y - q.y);
      const priority = q.depth < p.depth ? frontPriorityGap : 0;
      bound = Math.min(bound, (distance - priority) / 2);
    }
    return { id: t.id, screen: { type: 'circle', x: p.x, y: p.y, r: bound - SCENE_LIMITS.epsilon },
      regionMeaning: 'certified strict interior disk; not the maximal effective region',
      nominalCircle: { type: 'circle', x: p.x, y: p.y, r: radius }, depth: p.depth,
      interiorBoundaryInsetPx: SCENE_LIMITS.epsilon };
  });
  const nominalPairs = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i], b = points[j], distancePx = Math.hypot(a.projected.x - b.projected.x, a.projected.y - b.projected.y);
    nominalPairs.push({ targets: [a.id, b.id], distancePx, nominalEligibilityEdgeGapPx: distancePx - 2 * radius });
  }
  return { targets: anchors, observations: [{ id: 'current-round', targets: observations }],
    hitRegionDescriptor: { coordinateSpace: 'board-local CSS pixels', nominalRadiusPx: radius,
      clipping: { x: 0, y: 0, w: board.w, h: board.h },
      predicate: frontPriorityGap ? 'nearest eligible circle; if second-nearest is less than gap farther and has smaller depth, it wins' : 'nearest eligible circle',
      frontPriorityGapPx: frontPriorityGap, nominalPairs,
      effectiveRegionSize: 'unaudited; inner disks are lower bounds only',
      minFeature: 'not evaluated; no PASS claimed' } };
}
