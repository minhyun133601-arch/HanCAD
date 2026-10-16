import { evaluateGeometry, geometryEvaluation } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { crossXY, isClosedSnapCurve, nearestSnapPoint, normalSnapPoints, prepareSnapCurve, snapCurveParts, squaredXY } from './snap-curves';
import { snapModel, snapWcs, type DraftSnapDeferred } from './snap-types';

/** Resolves the first point once the second point fixes a tangent/perpendicular condition. */
export function resolveDeferredSnap(deferred:DraftSnapDeferred,target:CadPoint):CadPoint|undefined {
  const near=snapWcs(deferred.near),base=snapWcs(target);
  const candidates=snapCurveParts(deferred.source.geometry).flatMap(curve=>normalSnapPoints(prepareSnapCurve(curve),base,deferred.kind))
    .filter(candidate=>squaredXY(candidate.point,base)>1e-20)
    .sort((a,b)=>squaredXY(a.point,near)-squaredXY(b.point,near));
  return candidates[0]?snapModel(candidates[0].point):undefined;
}
export function resolveDeferredPair(first:DraftSnapDeferred,second:DraftSnapDeferred):{first:CadPoint;second:CadPoint}|undefined {
  let best:{first:CadPoint;second:CadPoint;score:number}|undefined;
  const nearA=snapWcs(first.near),nearB=snapWcs(second.near);
  for(const a of snapCurveParts(first.source.geometry))for(const b of snapCurveParts(second.source.geometry)) {
    const pa=prepareSnapCurve(a),pb=prepareSnapCurve(b),ua=nearestSnapPoint(pa,nearA).parameter,ub=nearestSnapPoint(pb,nearB).parameter;
    const seedsA=[ua,...Array.from({length:16},(_,i)=>i/16)],seedsB=[ub,...Array.from({length:16},(_,i)=>i/16)];
    for(const seedA of seedsA)for(const seedB of seedsB) {
      const solution=solve(a,b,first.kind,second.kind,seedA,seedB);if(!solution)continue;
      const pointA=evaluateGeometry(a,solution[0]),pointB=evaluateGeometry(b,solution[1]);
      if(squaredXY(pointA,pointB)<1e-18)continue;
      const score=squaredXY(pointA,nearA)+squaredXY(pointB,nearB);
      if(!best||score<best.score)best={first:snapModel(pointA),second:snapModel(pointB),score};
    }
  }
  return best?{first:best.first,second:best.second}:undefined;
}
function solve(a:CurveGeometry,b:CurveGeometry,ka:DraftSnapDeferred['kind'],kb:DraftSnapDeferred['kind'],u:number,v:number):[number,number]|undefined {
  const normalize=(curve:CurveGeometry,t:number)=>isClosedSnapCurve(curve)?((t%1)+1)%1:Math.max(0,Math.min(1,t));
  const errors=(u:number,v:number):[number,number]=>{
    const ea=geometryEvaluation(a,u),eb=geometryEvaluation(b,v),delta={x:eb.point.x-ea.point.x,y:eb.point.y-ea.point.y};
    const length=Math.hypot(delta.x,delta.y);
    if(!length)return [Infinity,Infinity];
    const error=(kind:DraftSnapDeferred['kind'],d:{x:number;y:number})=>{
      const scale=length*Math.hypot(d.x,d.y);if(!scale)return Infinity;
      return (kind==='tangent'?crossXY(delta,d):delta.x*d.x+delta.y*d.y)/scale;
    };
    return [error(ka,ea.derivative),error(kb,eb.derivative)];
  };
  for(let step=0;step<40;step++) {
    const e=errors(u,v);if(!e.every(Number.isFinite))return;
    if(Math.max(Math.abs(e[0]),Math.abs(e[1]))<1e-10)return [u,v];
    const h=1e-5,ul=normalize(a,u-h),uh=normalize(a,u+h),vl=normalize(b,v-h),vh=normalize(b,v+h);
    const eu0=errors(ul,v),eu1=errors(uh,v),ev0=errors(u,vl),ev1=errors(u,vh);
    const duDen=isClosedSnapCurve(a)?2*h:uh-ul,dvDen=isClosedSnapCurve(b)?2*h:vh-vl;
    if(!duDen||!dvDen)return;
    const au=(eu1[0]-eu0[0])/duDen,bu=(eu1[1]-eu0[1])/duDen,av=(ev1[0]-ev0[0])/dvDen,bv=(ev1[1]-ev0[1])/dvDen;
    const determinant=au*bv-av*bu;if(Math.abs(determinant)<1e-13)return;
    const du=(-e[0]*bv+e[1]*av)/determinant,dv=(-au*e[1]+bu*e[0])/determinant;
    u=normalize(a,u+Math.max(-0.2,Math.min(0.2,du)));v=normalize(b,v+Math.max(-0.2,Math.min(0.2,dv)));
  }
  return;
}
