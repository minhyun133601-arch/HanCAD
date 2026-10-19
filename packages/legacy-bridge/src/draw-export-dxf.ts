import {
  cross3,
  dot3,
  geometryEvaluation,
  magnitude3,
  normalize3,
  objectAxes,
  scale3,
} from '@hancad/geom';
import type { PolylineGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity, LegacyCadState } from './types';
import type { DxfWriter } from './draw-export-types';

export function validateDrawingDxf(state: LegacyCadState): void {
  for (const entity of state.entities) {
    if (
      ['REGION', 'MLINE', 'WIPEOUT', 'HELIX'].includes(entity.sourceType ?? '') ||
      entity.sourceType?.startsWith('POLYLINE_SPLINE_') ||
      entity.curve?.type === 'HELIX' ||
      entity.curve?.type === 'TRANSFORMED'
    )
      throw new Error(
        `${entity.sourceType ?? entity.curve?.type} 객체의 네이티브 DXF 인코딩은 아직 지원하지 않습니다. HCD 형식으로 저장하십시오.`,
      );
  }
}
export function writeDrawingDxf(entity: CadEntity, writer: DxfWriter): boolean {
  const { push, start, owner, position } = writer;
  const wcs = (p: Vec3, code = 10): void => {
    push(code, p.x);
    push(code + 10, p.y);
    push(code + 20, p.z);
  };
  const begin = (type: string, subclass: string): void => {
    start(type, entity, owner);
    push(100, subclass);
  };
  const curve = entity.curve;
  if (!curve) {
    if (['SOLID', 'TRACE', '3DFACE'].includes(entity.sourceType ?? '') && entity.drawFill?.length) {
      const type = entity.sourceType!;
      for (const polygon of entity.drawFill) {
        if (polygon.length > 4) throw new Error('DXF 솔리드 패치는 최대 네 정점까지 지원합니다.');
        begin(type, type === '3DFACE' ? 'AcDbFace' : 'AcDbTrace');
        const order =
          polygon.length === 4 && type !== '3DFACE'
            ? [0, 1, 3, 2]
            : [0, 1, 2, Math.min(3, polygon.length - 1)];
        for (let i = 0; i < 4; i++) position(polygon[order[i]!]!, 10 + i);
      }
      return true;
    }
    return false;
  }
  if (curve.type === 'POINT') {
    begin('POINT', 'AcDbPoint');
    wcs(curve.position);
    return true;
  }
  if (curve.type === 'LINE') {
    begin('LINE', 'AcDbLine');
    wcs(curve.start);
    wcs(curve.end, 11);
    return true;
  }
  if (curve.type === 'XLINE' || curve.type === 'RAY') {
    begin(curve.type, curve.type === 'XLINE' ? 'AcDbXline' : 'AcDbRay');
    wcs(curve.basePoint);
    wcs(curve.direction, 11);
    return true;
  }
  if (curve.type === 'ELLIPSE') {
    begin('ELLIPSE', 'AcDbEllipse');
    wcs(curve.center);
    wcs(curve.majorAxis, 11);
    const sign = Math.sign(curve.sweepParameter),
      normal = scale3(normalize3(cross3(curve.majorAxis, curve.minorAxis)), sign);
    wcs(normal, 210);
    push(40, magnitude3(curve.minorAxis) / magnitude3(curve.majorAxis));
    push(41, sign * curve.startParameter);
    push(42, sign * (curve.startParameter + curve.sweepParameter));
    return true;
  }
  if (curve.type === 'SPLINE') {
    begin('SPLINE', 'AcDbSpline');
    const rational = curve.weights.some((value) => value !== 1);
    push(70, (curve.closed ? 1 : 0) | (curve.periodic ? 2 : 0) | (rational ? 4 : 0));
    push(71, curve.degree);
    push(72, curve.knots.length);
    push(73, curve.controlPoints.length);
    push(74, curve.fitPoints.length);
    push(44, curve.fitTolerance);
    for (const knot of curve.knots) push(40, knot);
    if (rational) for (const weight of curve.weights) push(41, weight);
    for (const p of curve.controlPoints) wcs(p);
    for (const p of curve.fitPoints) wcs(p, 11);
    if (curve.startTangent) wcs(curve.startTangent, 12);
    if (curve.endTangent) wcs(curve.endTangent, 13);
    return true;
  }
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    writePolyline(curve, entity, writer);
    return true;
  }
  if (curve.type === 'CIRCLE' || curve.type === 'ARC') {
    const full = curve.type === 'CIRCLE';
    const sign = full ? 1 : Math.sign(curve.sweepAngle),
      normal = scale3(curve.normal, sign),
      axes = objectAxes(normal);
    begin(full ? 'CIRCLE' : 'ARC', 'AcDbCircle');
    wcs({
      x: dot3(curve.center, axes.x),
      y: dot3(curve.center, axes.y),
      z: dot3(curve.center, normal),
    });
    push(40, curve.radius);
    wcs(normal, 210);
    if (!full) {
      const first = geometryEvaluation(curve, 0).point;
      const offset = {
        x: first.x - curve.center.x,
        y: first.y - curve.center.y,
        z: first.z - curve.center.z,
      };
      const a = Math.atan2(dot3(offset, axes.y), dot3(offset, axes.x));
      push(100, 'AcDbArc');
      push(50, (a * 180) / Math.PI);
      push(51, ((a + Math.abs(curve.sweepAngle)) * 180) / Math.PI);
    }
    return true;
  }
  throw new Error(`Unsupported exact DXF geometry: ${curve.type}`);
}
function writePolyline(
  curve: PolylineGeometry,
  entity: CadEntity,
  { push, start, owner }: DxfWriter,
): void {
  const wcs = (p: Vec3, code = 10): void => {
    push(code, p.x);
    push(code + 10, p.y);
    push(code + 20, p.z);
  };
  if (curve.is3D) {
    const polyOwner = start('POLYLINE', entity, owner);
    push(100, 'AcDb3dPolyline');
    push(66, 1);
    wcs({ x: 0, y: 0, z: 0 });
    push(70, 8 | (curve.closed ? 1 : 0));
    for (const vertex of curve.vertices) {
      start('VERTEX', entity, polyOwner);
      push(100, 'AcDbVertex');
      push(100, 'AcDb3dPolylineVertex');
      wcs(vertex.position);
      push(70, 32);
    }
    start('SEQEND', entity, polyOwner);
    return;
  }
  start('LWPOLYLINE', entity, owner);
  push(100, 'AcDbPolyline');
  push(90, curve.vertices.length);
  push(70, curve.closed ? 1 : 0);
  const normal = curve.normal,
    axes = objectAxes(normal),
    elevation = dot3(curve.vertices[0]!.position, normal);
  push(38, elevation);
  push(43, curve.constantWidth);
  wcs(normal, 210);
  if ((entity.type === 'polyline' || entity.type === 'rect') && entity.thickness !== undefined)
    push(39, entity.thickness);
  for (const vertex of curve.vertices) {
    push(10, dot3(vertex.position, axes.x));
    push(20, dot3(vertex.position, axes.y));
    push(40, vertex.startWidth);
    push(41, vertex.endWidth);
    if (vertex.bulge) push(42, vertex.bulge);
  }
}
