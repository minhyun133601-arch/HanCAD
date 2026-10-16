import type { CurveGeometry } from '@hancad/geom';
import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { arcSweep } from './snap-geometry';
import { snapWcs, type SnapSource } from './snap-types';

export function legacySnapSources(state:LegacyCadState,additionalEntities:readonly CadEntity[]=[]):SnapSource[] {
  const hidden=new Set(state.layers.filter(layer=>!layer.visible).map(layer=>layer.name));
  return [...state.entities,...additionalEntities].filter(entity=>!hidden.has(entity.layer)).flatMap(legacyEntitySnapSources);
}
export function legacyEntitySnapSources(entity:CadEntity):SnapSource[] {
  const common={id:entity.id},normal={x:0,y:0,z:1},xAxis={x:1,y:0,z:0};
  if(entity.type==='line')return [{...common,geometry:{type:'LINE',start:snapWcs(entity.a),end:snapWcs(entity.b)}}];
  if(entity.type==='circle')return [{...common,geometry:{type:'CIRCLE',center:snapWcs(entity.center),radius:entity.radius,normal,xAxis}}];
  if(entity.type==='arc')return [{...common,geometry:{type:'ARC',center:snapWcs(entity.center),radius:entity.radius,normal,xAxis,startAngle:-entity.startAngle,sweepAngle:-arcSweep(entity)}}];
  if(entity.type==='polyline'||entity.type==='rect')return [{...common,geometry:{type:'LWPOLYLINE',vertices:entity.points.map(point=>({position:snapWcs(point),bulge:0,startWidth:0,endWidth:0})),closed:entity.closed,is3D:false,normal,constantWidth:0}}];
  if(entity.type==='text')return [{...common,node:false,insertion:snapWcs(entity.point),geometry:{type:'POINT',position:snapWcs(entity.point)}}];
  const geometry=getLegacyRuntime().core.cadEngine.dimensionGeometry(entity);
  if(!geometry)return [];
  const sources:SnapSource[]=[];
  const definitions=[entity.a,entity.b,entity.center].filter(point=>point!==undefined);
  if(definitions[0])sources.push({...common,node:false,geometry:{type:'POINT',position:snapWcs(definitions[0])},points:definitions.map(point=>({point:snapWcs(point),kind:'endpoint' as const}))});
  for(const [index,[a,b]]of geometry.lines.entries())sources.push({id:`${entity.id}:line:${index}`,entityId:entity.id,dimensionExtension:!['radius','diameter'].includes(entity.kind)&&index<2,geometry:{type:'LINE',start:snapWcs(a),end:snapWcs(b)}});
  for(const [index,arc]of geometry.arcs.entries()) {
    const curve:CurveGeometry={type:'ARC',center:snapWcs(arc.center),radius:arc.radius,normal,xAxis,startAngle:-arc.startAngle,sweepAngle:-arcSweep({...arc,type:'arc',id:'',layer:'',color:'',lineWidth:0})};
    sources.push({id:`${entity.id}:arc:${index}`,entityId:entity.id,geometry:curve});
  }
  return sources;
}
