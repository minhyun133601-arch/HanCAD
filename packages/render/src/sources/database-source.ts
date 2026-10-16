import { geometryFromFields } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { DatabaseObject } from '@hancad/db';
import { colorFromDxf, transparencyFromDxf } from '../style/aci';
import type { DisplayEntity, DisplayGeometry } from '../display/types';

export type DatabaseDisplayResult =
  | { status: 'ok'; entity: DisplayEntity }
  | { status: 'hidden' }
  | { status: 'unsupported'; entityType: string; reason?: string }
  | { status: 'invalid'; entityType: string; reason: string };

/** Fast 2D forms retain exact arc/bulge inquiry; oblique curves retain their 3D source. */
export function displayGeometryFromCurve(curve: CurveGeometry): DisplayGeometry {
  if (curve.type === 'POINT')
    return { type: 'point', position: { x: curve.position.x, y: curve.position.y } };
  if (curve.type === 'LINE')
    return {
      type: 'line',
      start: { x: curve.start.x, y: curve.start.y },
      end: { x: curve.end.x, y: curve.end.y },
    };
  if (curve.type === 'XLINE' || curve.type === 'RAY')
    return {
      type: curve.type === 'XLINE' ? 'xline' : 'ray',
      basePoint: { x: curve.basePoint.x, y: curve.basePoint.y },
      direction: { x: curve.direction.x, y: curve.direction.y },
    };
  if (
    (curve.type === 'CIRCLE' || curve.type === 'ARC') &&
    curve.normal.x === 0 &&
    curve.normal.y === 0
  ) {
    const orientation = Math.sign(curve.normal.z),
      axisAngle = Math.atan2(curve.xAxis.y, curve.xAxis.x);
    return {
      type: 'arc',
      center: { x: curve.center.x, y: curve.center.y },
      radius: curve.radius,
      startAngle: axisAngle + orientation * (curve.type === 'ARC' ? curve.startAngle : 0),
      sweepAngle: orientation * (curve.type === 'ARC' ? curve.sweepAngle : Math.PI * 2),
    };
  }
  if (
    (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') &&
    (curve.is3D || (curve.normal.x === 0 && curve.normal.y === 0))
  ) {
    const vertices = new Float64Array(curve.vertices.length * 5);
    curve.vertices.forEach((vertex, index) =>
      vertices.set(
        [
          vertex.position.x,
          vertex.position.y,
          curve.is3D ? 0 : vertex.bulge * Math.sign(curve.normal.z),
          curve.is3D ? 0 : vertex.startWidth,
          curve.is3D ? 0 : vertex.endWidth,
        ],
        index * 5,
      ),
    );
    return { type: 'polyline', vertices, closed: curve.closed };
  }
  return { type: 'curve', curve };
}

export function databaseObjectToDisplay(
  object: DatabaseObject,
  objects: readonly DatabaseObject[] = [],
): DatabaseDisplayResult {
  if (object.erased || object.fields.visible === false) return { status: 'hidden' };
  const fields =
    object.type === 'POLYLINE' && object.fields.vertices === undefined
      ? {
          ...object.fields,
          vertices: objects
            .filter(
              (child) => child.type === 'VERTEX' && child.owner === object.handle && !child.erased,
            )
            .map((child) => child.fields),
        }
      : object.fields;
  const parsed = geometryFromFields(object.type, fields);
  if (parsed.status !== 'ok') return parsed;
  const number = (name: string, fallback: number): number =>
    typeof fields[name] === 'number' ? (fields[name] as number) : fallback;
  const string = (name: string, fallback: string): string =>
    typeof fields[name] === 'string' ? (fields[name] as string) : fallback;
  return {
    status: 'ok',
    entity: {
      id: object.handle,
      geometry: displayGeometryFromCurve(parsed.geometry),
      layer: string('layer', '0'),
      color: colorFromDxf(
        number('color', 256),
        typeof fields.trueColor === 'number' ? fields.trueColor : undefined,
      ),
      linetype: string('linetype', 'BYLAYER'),
      linetypeScale: number('linetypeScale', 1),
      lineweight: number('lineweight', -1),
      transparency: transparencyFromDxf(number('transparency', 0)),
      plinegen: fields.plinegen === true || Boolean(number('flags', 0) & 128),
    },
  };
}

export function databaseObjectsToDisplay(objects: readonly DatabaseObject[]): {
  entities: DisplayEntity[];
  diagnostics: {
    handle: string;
    result: Exclude<DatabaseDisplayResult, { status: 'ok' } | { status: 'hidden' }>;
  }[];
} {
  const entities: DisplayEntity[] = [],
    diagnostics: {
      handle: string;
      result: Exclude<DatabaseDisplayResult, { status: 'ok' } | { status: 'hidden' }>;
    }[] = [];
  for (const object of objects) {
    const result = databaseObjectToDisplay(object, objects);
    if (result.status === 'ok') entities.push(result.entity);
    else if (result.status !== 'hidden') diagnostics.push({ handle: object.handle, result });
  }
  return { entities, diagnostics };
}
