import { dot3, geometryLength, magnitude3, objectAxes } from '@hancad/geom';
import type { Vec3 } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import type { EntityProperty } from './entity-properties';

export function editablePropertyCurve(entity: CadEntity): boolean {
  return (
    !!entity.curve &&
    entity.type !== 'line' &&
    entity.type !== 'circle' &&
    entity.type !== 'arc' &&
    [
      'LINE',
      'POINT',
      'CIRCLE',
      'ARC',
      'ELLIPSE',
      'LWPOLYLINE',
      'POLYLINE',
      'SPLINE',
      'XLINE',
      'RAY',
    ].includes(entity.curve.type)
  );
}
export function propertyCurveIndexCount(entity: CadEntity): number {
  const curve = entity.curve;
  return curve?.type === 'POLYLINE' || curve?.type === 'LWPOLYLINE'
    ? curve.vertices.length
    : curve?.type === 'SPLINE'
      ? Math.max(curve.controlPoints.length, curve.fitPoints.length)
      : 0;
}
export function curveObjectPoint(point: Vec3, normal: Vec3): Vec3 {
  const axes = objectAxes(normal);
  return { x: dot3(point, axes.x), y: dot3(point, axes.y), z: dot3(point, axes.z) };
}
export function entityCurveProperties(entity: CadEntity, index = 0): EntityProperty[] {
  const curve = entity.curve;
  if (!curve || !editablePropertyCurve(entity)) return [];
  const result: EntityProperty[] = [];
  const prefix = curve.type === 'ARC' || curve.type === 'CIRCLE' ? '' : 'curve.';
  const field = (
    key: string,
    ko: string,
    en: string,
    value: number | boolean,
    readOnly = false,
  ) => {
    result.push({
      key: `${prefix}${key}`,
      ko,
      en,
      kind: typeof value === 'boolean' ? 'boolean' : 'number',
      value: String(value),
      category: 'geometry',
      ...(readOnly ? { readOnly: true } : {}),
    });
  };
  const coordinates = (
    key: string,
    ko: string,
    en: string,
    point: Vec3,
    axes: readonly ('x' | 'y' | 'z')[] = ['x', 'y', 'z'],
  ) => {
    for (const axis of axes)
      field(
        `${key}.${axis}`,
        `${ko} ${axis.toUpperCase()}`,
        `${en} ${axis.toUpperCase()}`,
        point[axis],
      );
  };
  if (curve.type === 'POINT') coordinates('position', '위치', 'Position', curve.position);
  else if (curve.type === 'LINE') {
    coordinates('start', '시작', 'Start', curve.start);
    coordinates('end', '끝', 'End', curve.end);
  } else if (curve.type === 'CIRCLE' || curve.type === 'ARC') {
    coordinates('center', '중심', 'Center', curve.center);
    field('radius', '반지름', 'Radius', curve.radius);
    if (curve.type === 'CIRCLE') field('diameter', '지름', 'Diameter', curve.radius * 2);
    if (curve.type === 'ARC') {
      field('startAngle', '시작 각도', 'Start angle', (curve.startAngle * 180) / Math.PI);
      field(
        'endAngle',
        '끝 각도',
        'End angle',
        ((curve.startAngle + curve.sweepAngle) * 180) / Math.PI,
      );
    }
  } else if (curve.type === 'ELLIPSE') {
    coordinates('center', '중심', 'Center', curve.center);
    field('majorRadius', '장축 반지름', 'Major radius', magnitude3(curve.majorAxis));
    field('minorRadius', '단축 반지름', 'Minor radius', magnitude3(curve.minorAxis));
    field(
      'ratio',
      '반지름 비율',
      'Radius ratio',
      magnitude3(curve.minorAxis) / magnitude3(curve.majorAxis),
    );
    field('startParameter', '시작 매개변수', 'Start parameter', curve.startParameter);
    field(
      'endParameter',
      '끝 매개변수',
      'End parameter',
      curve.startParameter + curve.sweepParameter,
    );
  } else if (curve.type === 'XLINE' || curve.type === 'RAY') {
    coordinates('basePoint', '기준점', 'Base point', curve.basePoint);
    coordinates('direction', '방향 벡터', 'Direction vector', curve.direction);
  } else if (curve.type === 'POLYLINE' || curve.type === 'LWPOLYLINE') {
    field('vertexCount', '정점 수', 'Vertices', curve.vertices.length, true);
    field('closed', '닫힘', 'Closed', curve.closed);
    const vertex = curve.vertices[index];
    if (vertex) {
      if (curve.is3D) coordinates(`vertices.${index}.position`, '정점', 'Vertex', vertex.position);
      else {
        coordinates(
          `vertices.${index}.ocs`,
          '정점',
          'Vertex',
          curveObjectPoint(vertex.position, curve.normal),
          ['x', 'y'],
        );
        field(
          'elevation',
          '고도',
          'Elevation',
          curveObjectPoint(curve.vertices[0]!.position, curve.normal).z,
        );
        field('constantWidth', '전역 폭', 'Global width', curve.constantWidth);
        field(`vertices.${index}.bulge`, '벌지', 'Bulge', vertex.bulge);
        field(`vertices.${index}.startWidth`, '시작 폭', 'Start width', vertex.startWidth);
        field(`vertices.${index}.endWidth`, '끝 폭', 'End width', vertex.endWidth);
      }
    }
  } else if (curve.type === 'SPLINE') {
    field('degree', '차수', 'Degree', curve.degree, true);
    field('closed', '닫힘', 'Closed', curve.closed);
    field(
      'controlPointCount',
      '조정 정점 수',
      'Control vertices',
      curve.controlPoints.length,
      true,
    );
    field('fitPointCount', '맞춤점 수', 'Fit points', curve.fitPoints.length, true);
    if (curve.controlPoints[index]) {
      coordinates(
        `controlPoints.${index}`,
        '조정 정점',
        'Control vertex',
        curve.controlPoints[index]!,
      );
      field(`weights.${index}`, '가중치', 'Weight', curve.weights[index] ?? 1);
    }
    if (curve.fitPoints[index])
      coordinates(`fitPoints.${index}`, '맞춤점', 'Fit point', curve.fitPoints[index]!);
    field('fitTolerance', '맞춤 공차', 'Fit tolerance', curve.fitTolerance);
  }
  if (!['XLINE', 'RAY', 'POINT'].includes(curve.type))
    field('length', '길이', 'Length', geometryLength(curve), true);
  return result;
}

export function propertyCurveIndex(key: string): number {
  return Number(/^curve\.(?:vertices|controlPoints|fitPoints|weights)\.(\d+)/.exec(key)?.[1] ?? 0);
}
